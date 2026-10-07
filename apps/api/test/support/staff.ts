import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { Staff } from '@academia/contracts';
import { expect } from 'vitest';
import type { Client } from './client.ts';
import { bucketKeys, multipart, type Part, webpBytes } from './photos.ts';
import type { Minio } from './servers.ts';
import type { Stack } from './stack.ts';
import { cpfOf } from './students.ts';

/** O corpo de `POST /api/staff` só com os cinco campos obrigatórios; o CPF é independente do dos alunos. */
export function staffBody(n: number, overrides: Record<string, unknown> = {}) {
  return {
    name: `Funcionário ${n}`,
    cpf: cpfOf(n),
    position: 'Recepcionista',
    hiredAt: '2020-01-15',
    phone: '11912345678',
    ...overrides,
  };
}

/** Um corpo com os sete campos preenchidos. */
export function fullStaffBody(n: number, overrides: Record<string, unknown> = {}) {
  return { ...staffBody(n), department: 'Atendimento', email: `funcionario${n}@exemplo.com`, ...overrides };
}

/** Cria o funcionário pela API e confere o `201`. */
export async function createStaff(client: Client, body: Record<string, unknown>): Promise<Staff> {
  const response = await client.post('/api/staff', body);
  expect(response.status, `criação de preparação: ${JSON.stringify(body)}`).toBe(201);
  return (await response.json()) as Staff;
}

/** O funcionário como o banco o guarda (`to_jsonb`, sem depender de nome de coluna), ou `undefined`. */
export async function staffRow(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: Record<string, unknown> }>('select to_jsonb(s) as row from staff s where id = $1', [id]);
  return row?.row;
}

/** O mesmo, como texto, para a comparação "linha idêntica". */
export async function staffRowText(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: string }>('select to_jsonb(s)::text as row from staff s where id = $1', [id]);
  return row?.row;
}

/** A linha sem o instante de atualização, que o `PATCH` muda de propósito: serve a "o resto ficou". */
export async function staffRowWithoutUpdateInstant(stack: Stack, id: string) {
  const row = await staffRow(stack, id);
  if (!row) return undefined;
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'updated_at'));
}

export const staffCount = async (stack: Stack) =>
  Number((await stack.query<{ n: string }>('select count(*) as n from staff'))[0]!.n);

export async function setStaffStatus(stack: Stack, id: string, status: string) {
  await stack.query('update staff set status = $2 where id = $1', [id, status]);
}

/** Insere funcionários direto no banco (mais rápido que pela API quando o teste só precisa deles). */
export async function insertStaff(
  stack: Stack,
  rows: Array<{ name: string; cpf: string; status?: string; position?: string; department?: string | null; userId?: string }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const row of rows) {
    const [inserted] = await stack.query<{ id: string }>(
      `insert into staff (name, cpf, position, department, hired_at, phone, status, user_id)
       values ($1, $2, $3, $4, '2020-01-15', '11912345678', $5, $6) returning id`,
      [row.name, row.cpf, row.position ?? 'Recepcionista', row.department ?? null, row.status ?? 'active', row.userId ?? null],
    );
    ids.push(inserted!.id);
  }
  return ids;
}

/** As onze chaves de `GET /api/staff/:id` e do `201` de `POST /api/staff`. */
export const FICHA_KEYS = ['id', 'name', 'status', 'cpf', 'position', 'department', 'hiredAt', 'phone', 'email', 'user', 'photoUrl'];

/** As seis chaves de um item de `GET /api/staff`. */
export const LIST_ITEM_KEYS = ['id', 'name', 'position', 'department', 'status', 'photoUrl'];

/** As chaves que nenhuma resposta de recusa pode trazer. */
export const STAFF_DATA_KEYS = ['name', 'cpf', 'position', 'department', 'hiredAt', 'phone', 'email', 'user', 'photoUrl'];

export interface StaffRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** O caminho, com `:id` no lugar do funcionário. */
  path: string;
  /** Só `admin` alcança (as duas de vínculo). */
  adminOnly?: boolean;
}

/** As dez rotas de funcionário (Surface). */
export const STAFF_ROUTES: StaffRoute[] = [
  { method: 'GET', path: '/api/staff' },
  { method: 'POST', path: '/api/staff' },
  { method: 'GET', path: '/api/staff/:id' },
  { method: 'PATCH', path: '/api/staff/:id' },
  { method: 'DELETE', path: '/api/staff/:id' },
  { method: 'PUT', path: '/api/staff/:id/user', adminOnly: true },
  { method: 'DELETE', path: '/api/staff/:id/user', adminOnly: true },
  { method: 'POST', path: '/api/staff/:id/photo' },
  { method: 'PUT', path: '/api/staff/:id/photo' },
  { method: 'DELETE', path: '/api/staff/:id/photo' },
];

export const routeKey = (route: StaffRoute) => `${route.method} ${route.path}`;
export const pathFor = (route: StaffRoute, id: string) => route.path.replace(':id', id);

/** Um corpo de requisição qualquer para a rota: só a guarda é provada, então o conteúdo não importa. */
export function bodyFor(route: StaffRoute): unknown {
  if (route.method === 'POST' && route.path === '/api/staff') return staffBody(900_000);
  if (route.method === 'PATCH') return { position: 'Coordenadora' };
  if (route.method === 'PUT' && route.path.endsWith('/user')) return { userId: '018f0000-0000-7000-8000-000000000001' };
  return undefined;
}

/** Esvazia `staff` (e as fotos de funcionário, que a chave estrangeira não deixa para trás). */
export async function resetStaff(stack: Stack) {
  await stack.query('delete from photos where staff_id is not null');
  await stack.query('delete from staff');
}

export const staffPhotoPrefix = (staffId: string) => `photos/main/${staffId}/`;

/**
 * Uma foto de funcionário posta direto no banco e no bucket, com as três variantes de tamanhos
 * diferentes: serve às provas de leitura enquanto a rota de envio não é a que cria a linha.
 */
export async function seedStaffPhoto(
  stack: Stack,
  minio: Pick<Minio, 'client' | 'bucket'>,
  staffId: string,
  { version = 1, current = true }: { version?: number; current?: boolean } = {},
) {
  const [row] = await stack.query<{ id: string }>(
    `insert into photos (staff_id, version, is_current, expires_at)
     values ($1, $2, $3, case when $3 then null else now() + interval '30 days' end) returning id`,
    [staffId, version, current],
  );
  const photoId = row!.id;
  const sizes = { thumb: [96, 128], medium: [240, 320], large: [600, 800] } as const;
  const keys: Record<'thumb' | 'medium' | 'large', string> = {
    thumb: `${staffPhotoPrefix(staffId)}${photoId}/thumb.webp`,
    medium: `${staffPhotoPrefix(staffId)}${photoId}/medium.webp`,
    large: `${staffPhotoPrefix(staffId)}${photoId}/large.webp`,
  };
  for (const [variant, [width, height]] of Object.entries(sizes) as Array<[keyof typeof sizes, readonly [number, number]]>) {
    await minio.client.send(
      new PutObjectCommand({ Bucket: minio.bucket, Key: keys[variant], Body: await webpBytes(width, height), ContentType: 'image/webp' }),
    );
  }
  return { photoId, keys };
}

export const staffPhotoPath = (staffId: string) => `/api/staff/${staffId}/photo`;

/** Envia a parte `file` a `POST` ou `PUT /api/staff/:id/photo`. */
export function sendStaffPhoto(
  client: Client,
  method: 'POST' | 'PUT',
  staffId: string,
  bytes: Buffer,
  { filename = 'foto.jpg', type = 'image/jpeg', origin, headers }: { filename?: string; type?: string; origin?: string | null; headers?: Record<string, string> } = {},
) {
  return sendStaffParts(client, method, staffId, [{ name: 'file', bytes, filename, type }], { origin, headers });
}

/** O mesmo, com as partes que o teste escolher. */
export function sendStaffParts(
  client: Client,
  method: 'POST' | 'PUT',
  staffId: string,
  parts: Part[],
  { origin, headers }: { origin?: string | null; headers?: Record<string, string> } = {},
) {
  const { body, contentType } = multipart(parts);
  return client.request(method, staffPhotoPath(staffId), { origin, body, headers: { 'Content-Type': contentType, ...headers } });
}

export const postStaffPhoto = (client: Client, staffId: string, bytes: Buffer, options?: Parameters<typeof sendStaffPhoto>[4]) =>
  sendStaffPhoto(client, 'POST', staffId, bytes, options);

export const putStaffPhoto = (client: Client, staffId: string, bytes: Buffer, options?: Parameters<typeof sendStaffPhoto>[4]) =>
  sendStaffPhoto(client, 'PUT', staffId, bytes, options);

/** As chaves do bucket sob `photos/main/<staffId>/`. */
export const staffKeys = (minio: Pick<Minio, 'client' | 'bucket'>, staffId: string) => bucketKeys(minio, staffPhotoPrefix(staffId));

/** As linhas de foto do funcionário como texto, para a comparação "linha idêntica". */
export async function staffPhotoRowsText(stack: Stack, staffId: string) {
  const rows = await stack.query<{ row: string }>('select to_jsonb(p)::text as row from photos p where staff_id = $1 order by version', [staffId]);
  return rows.map((entry) => entry.row);
}
