import { createHash, randomBytes } from 'node:crypto';
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import { crc32, deflateSync } from 'node:zlib';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { expect } from 'vitest';
import { type StorageEnv, startApi } from './app.ts';
import { type Client, createClient } from './client.ts';
import { type Minio, startMinio } from './servers.ts';
import { type Stack, startStack } from './stack.ts';

export type Rgb = [number, number, number];
export const RED: Rgb = [255, 0, 0];
export const GREEN: Rgb = [0, 255, 0];
export const BLUE: Rgb = [0, 0, 255];
export const YELLOW: Rgb = [255, 255, 0];

/** "Vermelho" é R >= 200 e G, B <= 60; "azul" é o simétrico (WebP tem perdas). */
export const isRed = ([r, g, b]: Rgb) => r >= 200 && g <= 60 && b <= 60;
export const isBlue = ([r, g, b]: Rgb) => b >= 200 && r <= 60 && g <= 60;

const background = ([r, g, b]: Rgb) => ({ r, g, b });

/** Imagem de uma cor só, do tamanho dado. */
export const solid = (width: number, height: number, color: Rgb = RED) =>
  sharp({ create: { width, height, channels: 3, background: background(color) } });

/** Pixels brutos montados por `paint(x, y)`: o teste escolhe a cor de cada ponto. */
export function painted(width: number, height: number, paint: (x: number, y: number) => Rgb) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const at = (y * width + x) * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } });
}

/** Ruído: não comprime, e um corte no meio cai no meio de dados de verdade. */
export const noise = (width: number, height: number) =>
  sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } });

export const jpegBytes = (width = 800, height = 1000, color: Rgb = RED) => solid(width, height, color).jpeg().toBuffer();
export const pngBytes = (width = 800, height = 1000, color: Rgb = RED) => solid(width, height, color).png().toBuffer();
export const webpBytes = (width = 800, height = 1000, color: Rgb = RED) => solid(width, height, color).webp().toBuffer();

/** O PNG de 1 bit, todo zero, com as dimensões dadas: pequeno mesmo com 30 000 × 30 000. */
export function blankPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const frame = Buffer.alloc(8 + data.length + 4);
    frame.writeUInt32BE(data.length, 0);
    body.copy(frame, 4);
    frame.writeUInt32BE(crc32(body), 8 + data.length);
    return frame;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 1; // profundidade
  header[9] = 0; // tons de cinza
  const row = 1 + Math.ceil(width / 8);
  const image = deflateSync(Buffer.alloc(row * height), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', image),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Preenche um JPEG com segmentos de comentário até ter exatamente `size` bytes. */
export function padJpeg(jpeg: Buffer, size: number): Buffer {
  let remaining = size - jpeg.length;
  if (remaining < 0) throw new Error('o JPEG já passa do tamanho pedido');
  const segments: Buffer[] = [];
  while (remaining > 0) {
    let segment = Math.min(remaining, 65_537);
    // o resto nunca fica entre 1 e 3 bytes: um segmento vazio tem 4
    if (remaining - segment > 0 && remaining - segment < 4) segment -= 4;
    const frame = Buffer.alloc(segment);
    frame[0] = 0xff;
    frame[1] = 0xfe;
    frame.writeUInt16BE(segment - 2, 2);
    segments.push(frame);
    remaining -= segment;
  }
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

export const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Uma parte de um corpo `multipart/form-data`: arquivo (com `bytes`) ou campo de texto (com `value`). */
export interface Part {
  name: string;
  bytes?: Buffer;
  filename?: string;
  type?: string;
  value?: string;
}

/** O corpo `multipart/form-data` das partes dadas, e o cabeçalho que o descreve. */
export function multipart(parts: Part[], boundary = '----foto-teste-boundary') {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const filename = part.filename === undefined ? '' : `; filename="${part.filename}"`;
    const type = part.type === undefined ? '' : `Content-Type: ${part.type}\r\n`;
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${filename}\r\n${type}\r\n`, 'latin1'),
      part.bytes ?? Buffer.from(part.value ?? '', 'utf8'),
      Buffer.from('\r\n', 'latin1'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'latin1'));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

export interface SendOptions {
  filename?: string;
  type?: string;
  /** `null` manda a requisição sem `Origin`. */
  origin?: string | null;
  headers?: Record<string, string>;
}

/** `POST /api/students/:id/photo` com as partes dadas. */
export function postParts(client: Client, studentId: string, parts: Part[], options: Pick<SendOptions, 'origin' | 'headers'> = {}) {
  const { body, contentType } = multipart(parts);
  return client.request('POST', `/api/students/${studentId}/photo`, {
    origin: options.origin,
    body,
    headers: { 'Content-Type': contentType, ...options.headers },
  });
}

/** `POST /api/students/:id/photo` com a parte `file` dada. */
export function uploadPhoto(client: Client, studentId: string, bytes: Buffer, options: SendOptions = {}) {
  const { filename = 'foto.jpg', type = 'image/jpeg', ...rest } = options;
  return postParts(client, studentId, [{ name: 'file', bytes, filename, type }], rest);
}

/** `PUT /api/students/:id/photo` com as partes dadas. */
export function putParts(client: Client, studentId: string, parts: Part[], options: Pick<SendOptions, 'origin' | 'headers'> = {}) {
  const { body, contentType } = multipart(parts);
  return client.request('PUT', `/api/students/${studentId}/photo`, {
    origin: options.origin,
    body,
    headers: { 'Content-Type': contentType, ...options.headers },
  });
}

/** `PUT /api/students/:id/photo` com a parte `file` dada: a troca. */
export function replacePhoto(client: Client, studentId: string, bytes: Buffer, options: SendOptions = {}) {
  const { filename = 'foto.jpg', type = 'image/jpeg', ...rest } = options;
  return putParts(client, studentId, [{ name: 'file', bytes, filename, type }], rest);
}

/** O mesmo envio, em partes e sem `Content-Length`. */
export function uploadPhotoChunked(client: Client, studentId: string, bytes: Buffer, options: SendOptions = {}) {
  const { filename = 'foto.jpg', type = 'image/jpeg', ...rest } = options;
  const { body, contentType } = multipart([{ name: 'file', bytes, filename, type }]);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < body.length; at += 64 * 1024) controller.enqueue(body.subarray(at, at + 64 * 1024));
      controller.close();
    },
  });
  return client.request('POST', `/api/students/${studentId}/photo`, {
    origin: rest.origin,
    body: stream,
    headers: { 'Content-Type': contentType, ...rest.headers },
  });
}

/** O que o bucket guarda, lido pelo cliente S3 do próprio teste: "o bucket" é a lista de todas as chaves. */
export async function bucketKeys(minio: Pick<Minio, 'client' | 'bucket'>, prefix = ''): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await minio.client.send(
      new ListObjectsV2Command({ Bucket: minio.bucket, Prefix: prefix, ContinuationToken: token }),
    );
    keys.push(...(page.Contents ?? []).map((object) => object.Key!));
    token = page.NextContinuationToken;
  } while (token);
  return keys.sort();
}

export async function bucketObject(minio: Pick<Minio, 'client' | 'bucket'>, key: string): Promise<Buffer> {
  const object = await minio.client.send(new GetObjectCommand({ Bucket: minio.bucket, Key: key }));
  return Buffer.from(await object.Body!.transformToByteArray());
}

export const uploadPrefix = (studentId: string) => `photos/main/${studentId}/`;

/** "Objetos do envio": as chaves sob `photos/main/<studentId>/`. */
export const uploadKeys = (minio: Pick<Minio, 'client' | 'bucket'>, studentId: string) =>
  bucketKeys(minio, uploadPrefix(studentId));

/** As linhas de foto do aluno como o banco as guarda (`to_jsonb`, sem depender de nome de coluna). */
export async function photoRows(stack: Stack, studentId: string) {
  const rows = await stack.query<{ row: Record<string, unknown> }>(
    'select to_jsonb(p) as row from photos p where student_id = $1 order by version',
    [studentId],
  );
  return rows.map((entry) => entry.row);
}

/** O mesmo, como texto, para a comparação "linha idêntica". */
export async function photoRowsText(stack: Stack, studentId: string) {
  const rows = await stack.query<{ row: string }>(
    'select to_jsonb(p)::text as row from photos p where student_id = $1 order by version',
    [studentId],
  );
  return rows.map((entry) => entry.row);
}

/** O `now()` do banco, como texto com microssegundos: o relógio dos prazos é o dele, nunca o da máquina. */
export const databaseNow = async (stack: Stack) => (await stack.query<{ now: string }>('select now()::text as now'))[0]!.now;

export interface VersionRow {
  id: string;
  version: number;
  is_current: boolean;
  /** `expires_at` como o banco o escreve, ou `null`. */
  expires_at: string | null;
  /** `expires_at` está entre `from + days` e `to + days` (os dois do relógio do banco). */
  in_window: boolean | null;
}

/**
 * As versões do dono (aluno por padrão), por `version`, e se o prazo de cada uma cai `days` dias depois do
 * intervalo dado.
 */
export const versionRows = (
  stack: Stack,
  ownerId: string,
  from = 'epoch',
  to = 'epoch',
  days = 30,
  column: 'student_id' | 'staff_id' = 'student_id',
) =>
  stack.query<VersionRow>(
    `select id, version, is_current, expires_at::text as expires_at,
            expires_at between $2::timestamptz + make_interval(days => $4) and $3::timestamptz + make_interval(days => $4) as in_window
       from photos where ${column} = $1 order by version`,
    [ownerId, from, to, days],
  );

/** As três chaves de uma foto, na ordem em que `bucketKeys` as devolve. */
export const keysOf = (studentId: string, photoId: string) =>
  ['thumb', 'medium', 'large'].map((variant) => `photos/main/${studentId}/${photoId}/${variant}.webp`).sort();

export const photoCount = async (stack: Stack) =>
  Number((await stack.query<{ n: string }>('select count(*) as n from photos'))[0]!.n);

/** Os pixels de uma imagem de qualquer formato que o Sharp leia, em RGB. */
export async function pixelsOf(bytes: Buffer) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number): Rgb => {
    const offset = (y * info.width + x) * 3;
    return [data[offset]!, data[offset + 1]!, data[offset + 2]!];
  };
  return { width: info.width, height: info.height, at };
}

/** O pixel de `bytes` na fração (fx, fy) da largura e da altura. */
export async function pixelAt(bytes: Buffer, fx: number, fy: number): Promise<Rgb> {
  const { width, height, at } = await pixelsOf(bytes);
  return at(Math.min(width - 1, Math.floor(width * fx)), Math.min(height - 1, Math.floor(height * fy)));
}

const PALETTE: Record<string, Rgb> = { red: RED, green: GREEN, blue: BLUE, yellow: YELLOW };

/** O nome da cor de referência mais próxima: classifica um pixel de WebP com perdas. */
export function nearest(pixel: Rgb): string {
  const distance = (color: Rgb) => color.reduce((sum, channel, index) => sum + (channel - pixel[index]!) ** 2, 0);
  return Object.entries(PALETTE).sort(([, a], [, b]) => distance(a) - distance(b))[0]![0];
}

/** O banco e o bucket agora: o que o teste compara "antes e depois" de uma requisição que não grava. */
export async function snapshotOf(stack: Stack, minio: Pick<Minio, 'client' | 'bucket'>) {
  const [photos] = await stack.query<{ rows: string }>(
    `select coalesce(string_agg(to_jsonb(p)::text, '|' order by p.id), '') as rows from photos p`,
  );
  const [staff] = await stack.query<{ rows: string }>(
    `select coalesce(string_agg(to_jsonb(s)::text, '|' order by s.id), '') as rows from staff s`,
  );
  const [audit] = await stack.query<{ n: string }>('select count(*) as n from audit_logs');
  return { photos: photos!.rows, staff: staff!.rows, audit: Number(audit!.n), keys: await bucketKeys(minio) };
}

/** Postgres, API e MinIO reais, montados juntos: o ambiente de um arquivo de teste de foto. */
export async function startPhotoStack(storage?: Minio['env']) {
  const minio = await startMinio();
  const stack = await startStack([], storage ?? minio.env);
  return {
    minio,
    stack,
    close: async () => {
      await stack.close();
      await minio.stop();
    },
  };
}

export type PhotoStack = Awaited<ReturnType<typeof startPhotoStack>>;

type Variant = 'thumb' | 'medium' | 'large';

export interface FlakyStorage {
  /** O endereço que a API usa como `S3_ENDPOINT`. */
  endpoint: string;
  /** Responde `500` à escrita da variante, ou de nenhuma (`null`). */
  failWriteOf: Variant | null;
  /** Responde `500` a toda remoção de objeto. */
  failDeletes: boolean;
  /** Responde `500` só à remoção do objeto dessa variante, ou de nenhuma (`null`). */
  failDeleteOf: Variant | null;
  /** Responde `500` à remoção de todo objeto cujo caminho contém o texto (o id de um dono), ou de nenhum (`null`). */
  failDeleteUnder: string | null;
  /** Fora do ar: toda conexão é derrubada sem resposta. */
  down: boolean;
  stop(): Promise<void>;
}

/**
 * Um proxy HTTP do teste entre a API e o MinIO: encaminha tudo, e responde `500` à escrita da variante
 * escolhida ou ao `DELETE` de objeto.
 */
export async function flakyStorage(target: string): Promise<FlakyStorage> {
  const upstream = new URL(target);
  const state: Pick<FlakyStorage, 'failWriteOf' | 'failDeletes' | 'failDeleteOf' | 'failDeleteUnder' | 'down'> = {
    failWriteOf: null,
    failDeletes: false,
    failDeleteOf: null,
    failDeleteUnder: null,
    down: false,
  };
  const fails = (request: IncomingMessage) => {
    const path = (request.url ?? '').split('?')[0]!;
    if (request.method === 'DELETE') {
      if (state.failDeleteOf !== null && path.endsWith(`/${state.failDeleteOf}.webp`)) return true;
      if (state.failDeleteUnder !== null && path.includes(state.failDeleteUnder)) return true;
      return state.failDeletes && path.endsWith('.webp');
    }
    return request.method === 'PUT' && state.failWriteOf !== null && path.endsWith(`/${state.failWriteOf}.webp`);
  };
  const server: Server = createServer((request, response) => {
    if (state.down) {
      request.socket.destroy();
      return;
    }
    if (fails(request)) {
      request.resume();
      response.writeHead(500, { 'Content-Type': 'application/xml' }).end('<Error><Code>InternalError</Code></Error>');
      return;
    }
    const forwarded = httpRequest(
      { host: upstream.hostname, port: upstream.port, method: request.method, path: request.url, headers: request.headers },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      },
    );
    forwarded.on('error', () => response.writeHead(502).end());
    request.pipe(forwarded);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return Object.assign(state, {
    endpoint: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  });
}

/** Uma segunda API sobre o Postgres da pilha, com o armazenamento que o teste escolhe, e uma sessão (`reception`, ou o `role` dado) nela. */
export async function apiWith(
  stack: Stack,
  storage: StorageEnv,
  extraEnv: Record<string, string> = {},
  role: 'reception' | 'hr_finance' = 'reception',
) {
  const api = await startApi(stack.postgres.url, [], storage, extraEnv);
  const user = await stack.seed({ role });
  const client = await stack.signIn(user, createClient(api.url));
  return { api, client };
}

/** Confere o `201` de um envio e devolve o corpo. */
export async function uploaded(response: Response) {
  expect(response.status, 'envio de preparação').toBe(201);
  return (await response.json()) as { id: string; version: number; createdAt: string };
}
