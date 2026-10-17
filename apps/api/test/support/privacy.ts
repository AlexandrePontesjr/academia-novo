import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ColumnCipher } from '../../src/crypto.ts';
import { DATA_ENCRYPTION_KEY } from './app.ts';
import { bucketKeys, BLUE, GREEN, RED, type Rgb, webpBytes, YELLOW } from './photos.ts';
import { insertPlan } from './plans.ts';
import type { Minio } from './servers.ts';
import type { Stack } from './stack.ts';
import { cpfOf } from './students.ts';

export const ANONYMIZED_NAME = 'Titular anonimizado';
export const exportPath = (studentId: string) => `/api/students/${studentId}/data-export`;
export const anonymizationPath = (studentId: string) => `/api/students/${studentId}/anonymization`;

/** Os nove campos pessoais de `students` que a anonimização limpa (door 1). */
export const STUDENT_PERSONAL_COLUMNS = [
  'cpf',
  'birth_date',
  'sex',
  'email',
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'health_notes_enc',
] as const;

export const HEALTH_NOTES = 'Hipertensão controlada; usa losartana pela manhã.';

const cipher = new ColumnCipher(DATA_ENCRYPTION_KEY);

export interface FullStudent {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  guardianIds: string[];
  consentIds: string[];
  /** O período pago e vencido, e o cancelado. */
  paidEnrollmentId: string;
  cancelledEnrollmentId: string;
  planId: string;
  /** A confirmação viva e a desfeita, do período pago. */
  alivePaymentId: string;
  voidedPaymentId: string;
  checkInIds: string[];
  /** A foto guardada (versão 1) e a corrente (versão 2). */
  photoIds: [string, string];
  /** Os bytes de `large` de cada foto, na ordem de `photoIds`. */
  largeBytes: [Buffer, Buffer];
  /** As seis chaves do bucket. */
  keys: string[];
}

let seeded = 0;

/** O id de um usuário que registra presenças; criado uma vez por pilha. */
const authors = new WeakMap<Stack, string>();
async function authorOf(stack: Stack) {
  let id = authors.get(stack);
  if (!id) {
    id = (await stack.seed({ role: 'reception', name: 'Recepção das Presenças' })).id;
    authors.set(stack, id);
  }
  return id;
}

/** Grava as três variantes de uma foto do dono, com cores diferentes por foto, e devolve os bytes de `large`. */
async function putVariants(minio: Pick<Minio, 'client' | 'bucket'>, ownerId: string, photoId: string, color: Rgb) {
  const sizes = { thumb: [96, 128], medium: [240, 320], large: [600, 800] } as const;
  let large!: Buffer;
  for (const [variant, [width, height]] of Object.entries(sizes) as Array<[keyof typeof sizes, readonly [number, number]]>) {
    const bytes = await webpBytes(width, height, color);
    if (variant === 'large') large = bytes;
    await minio.client.send(
      new PutObjectCommand({
        Bucket: minio.bucket,
        Key: `photos/main/${ownerId}/${photoId}/${variant}.webp`,
        Body: bytes,
        ContentType: 'image/webp',
      }),
    );
  }
  return large;
}

/**
 * O "titular completo" (checks, regras próprias): um aluno criado por SQL com todos os campos da RF-05,
 * `healthNotes` cifrado pela chave de teste, dois responsáveis, um consentimento de cada finalidade (um
 * revogado), um período pago e vencido com uma confirmação viva e uma desfeita, um período cancelado,
 * duas presenças e uma foto trocada uma vez (duas linhas de `photos`, seis objetos). `inactive` por
 * padrão, com `inactivated_at`.
 */
export async function seedFullStudent(
  stack: Stack,
  minio: Pick<Minio, 'client' | 'bucket'>,
  { status = 'inactive', n = 70_000 + ++seeded }: { status?: 'active' | 'inactive' | 'suspended'; n?: number } = {},
): Promise<FullStudent> {
  const cpf = cpfOf(n);
  const name = `Titular Completo ${n}`;
  const phone = '11912345678';
  const [student] = await stack.query<{ id: string }>(
    `insert into students (name, cpf, birth_date, sex, email, phone, address, emergency_contact_name,
                           emergency_contact_phone, status, inactivated_at)
     values ($1, $2, '1990-05-20', 'female', $3, $4, 'Rua das Acácias, 120 - Centro', 'Maria da Penha',
             '1134567890', $5, case when $5 = 'inactive' then now() end)
     returning id`,
    [name, cpf, `titular${n}@exemplo.com`, phone, status],
  );
  const id = student!.id;
  await stack.query('update students set health_notes_enc = $2 where id = $1', [id, cipher.encrypt(HEALTH_NOTES, id)]);

  const guardianIds: string[] = [];
  for (const [index, relationship] of (['mother', 'father'] as const).entries()) {
    const [row] = await stack.query<{ id: string }>(
      `insert into guardians (student_id, name, cpf, phone, relationship) values ($1, $2, $3, '11987654321', $4) returning id`,
      [id, `Responsável ${index + 1} de ${n}`, cpfOf(n + 500_000 + index), relationship],
    );
    guardianIds.push(row!.id);
  }

  const consentIds: string[] = [];
  const [granted] = await stack.query<{ id: string }>(
    `insert into consents (student_id, purpose, term_version, granted_by, guardian_id, granted_at)
     values ($1, 'data_processing', 1, 'guardian', $2, '2026-01-10T12:00:00Z') returning id`,
    [id, guardianIds[0]],
  );
  const [revoked] = await stack.query<{ id: string }>(
    `insert into consents (student_id, purpose, term_version, granted_by, granted_at, revoked_at)
     values ($1, 'image_use', 1, 'student', '2026-01-11T12:00:00Z', '2026-02-01T12:00:00Z') returning id`,
    [id],
  );
  consentIds.push(granted!.id, revoked!.id);

  const planId = await insertPlan(stack, { name: `Plano de ${n}` });
  const [paid] = await stack.query<{ id: string }>(
    `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents)
     values ($1, $2, '2026-08-01', '2026-08-31', 9990) returning id`,
    [id, planId],
  );
  const [cancelled] = await stack.query<{ id: string }>(
    `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents, cancelled_at)
     values ($1, $2, '2026-09-01', '2026-09-30', 9990, '2026-08-20T12:00:00Z') returning id`,
    [id, planId],
  );
  const [voided] = await stack.query<{ id: string }>(
    `insert into payments (enrollment_id, created_at, voided_at) values ($1, '2026-08-01T13:00:00Z', '2026-08-01T14:00:00Z') returning id`,
    [paid!.id],
  );
  const [alive] = await stack.query<{ id: string }>(
    `insert into payments (enrollment_id, created_at) values ($1, '2026-08-02T13:00:00Z') returning id`,
    [paid!.id],
  );

  const author = await authorOf(stack);
  const checkInIds: string[] = [];
  for (const day of ['2026-08-05', '2026-08-06']) {
    const [row] = await stack.query<{ id: string }>(
      `insert into check_ins (student_id, day, checked_in_at, checked_in_by) values ($1, $2, $3, $4) returning id`,
      [id, day, `${day}T12:00:00Z`, author],
    );
    checkInIds.push(row!.id);
  }

  const [stored] = await stack.query<{ id: string }>(
    `insert into photos (student_id, version, is_current, expires_at) values ($1, 1, false, now() + interval '30 days') returning id`,
    [id],
  );
  const [current] = await stack.query<{ id: string }>(
    `insert into photos (student_id, version, is_current) values ($1, 2, true) returning id`,
    [id],
  );
  const colors: Array<[Rgb, Rgb]> = [
    [RED, GREEN],
    [BLUE, YELLOW],
  ];
  const [storedColor, currentColor] = colors[seeded % 2]!;
  const largeBytes: [Buffer, Buffer] = [
    await putVariants(minio, id, stored!.id, storedColor),
    await putVariants(minio, id, current!.id, currentColor),
  ];

  return {
    id,
    name,
    cpf,
    phone,
    guardianIds,
    consentIds,
    paidEnrollmentId: paid!.id,
    cancelledEnrollmentId: cancelled!.id,
    planId,
    alivePaymentId: alive!.id,
    voidedPaymentId: voided!.id,
    checkInIds,
    photoIds: [stored!.id, current!.id],
    largeBytes,
    keys: await bucketKeys(minio, `photos/main/${id}/`),
  };
}

const SNAPSHOT_TABLES = [
  'students',
  'guardians',
  'consents',
  'photos',
  'enrollments',
  'payments',
  'check_ins',
  'staff',
  'privacy_settings',
] as const;

/**
 * "Nada mudou" (checks, regras próprias): o `to_jsonb` de todas as linhas das nove tabelas, a lista de
 * chaves do bucket e a contagem de `audit_logs`.
 */
export async function privacySnapshot(stack: Stack, minio: Pick<Minio, 'client' | 'bucket'>) {
  const tables: Record<string, string[]> = {};
  for (const table of SNAPSHOT_TABLES) {
    const order = table === 'privacy_settings' ? 'id' : 'id';
    tables[table] = (await stack.query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by ${order}`)).map(
      (row) => row.row,
    );
  }
  const [audit] = await stack.query<{ n: string }>('select count(*) as n from audit_logs');
  return { tables, keys: await bucketKeys(minio), audit: Number(audit!.n) };
}

/** As linhas de um titular, tabela por tabela, como texto: o que "idêntico" compara para o vizinho. */
export async function subjectRows(stack: Stack, studentId: string) {
  const textOf = async (sql: string) => (await stack.query<{ row: string }>(sql, [studentId])).map((row) => row.row);
  return {
    students: await textOf('select to_jsonb(t)::text as row from students t where id = $1'),
    guardians: await textOf('select to_jsonb(t)::text as row from guardians t where student_id = $1 order by id'),
    consents: await textOf('select to_jsonb(t)::text as row from consents t where student_id = $1 order by id'),
    photos: await textOf('select to_jsonb(t)::text as row from photos t where student_id = $1 order by id'),
    enrollments: await textOf('select to_jsonb(t)::text as row from enrollments t where student_id = $1 order by id'),
    payments: await textOf(
      'select to_jsonb(p)::text as row from payments p join enrollments e on e.id = p.enrollment_id where e.student_id = $1 order by p.id',
    ),
    check_ins: await textOf('select to_jsonb(t)::text as row from check_ins t where student_id = $1 order by id'),
  };
}
