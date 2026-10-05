import { request } from 'node:http';
import sharp from 'sharp';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { WEB_ORIGIN } from './support/app.ts';
import { type AuditRow, auditCount, auditRows, withAuditInsertFailing, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { captureOutput } from './support/log.ts';
import {
  apiWith,
  jpegBytes,
  multipart,
  padJpeg,
  photoRows,
  type PhotoStack,
  solid,
  startPhotoStack,
  uploadKeys,
  uploadPhoto,
  uploaded,
} from './support/photos.ts';
import { freePort } from './support/servers.ts';
import { type SeededUser } from './support/stack.ts';
import { createStudent, studentBody } from './support/students.ts';

let env: PhotoStack;
let reception: Client;
let admin: Client;
let receptionUser: SeededUser;
let adminUser: SeededUser;
let students = 1100;

beforeAll(async () => {
  env = await startPhotoStack();
  const receptionSession = await env.stack.session('reception');
  const adminSession = await env.stack.session('admin');
  reception = receptionSession.client;
  receptionUser = receptionSession.user;
  admin = adminSession.client;
  adminUser = adminSession.user;
}, 240_000);

afterAll(() => env?.close());

const newStudent = async () => (await createStudent(reception, studentBody((students += 1)))).id;
const photoPath = (studentId: string) => `/api/students/${studentId}/photo`;

test('upload_writes_one_photo_uploaded_row_with_null_diff', async () => {
  for (const [name, client, user] of [['admin', admin, adminUser], ['reception', reception, receptionUser]] as const) {
    const studentId = await newStudent();
    const bytes = await jpegBytes();

    const { result, rows } = await written(env.stack, () => uploadPhoto(client, studentId, bytes));

    expect(result.status, name).toBe(201);
    expect(rows, name).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'student.photo_uploaded',
      user_id: user.id,
      entity: 'student',
      entity_id: studentId,
      diff: null,
    });
  }
});

test('delete_writes_one_photo_removed_row_with_null_diff', async () => {
  for (const [name, client, user] of [['admin', admin, adminUser], ['reception', reception, receptionUser]] as const) {
    const studentId = await newStudent();
    await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));

    const { result, rows } = await written(env.stack, () => client.delete(photoPath(studentId)));

    expect(result.status, name).toBe(204);
    expect(rows, name).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'student.photo_removed',
      user_id: user.id,
      entity: 'student',
      entity_id: studentId,
      diff: null,
    });
  }
});

test('ten_non_writing_outcomes_write_no_audit_row', async () => {
  const withPhoto = await newStudent();
  await uploaded(await uploadPhoto(reception, withPhoto, await jpegBytes()));
  const photoless = await newStudent();
  const instructor = (await env.stack.session('instructor')).client;
  const down = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: `http://127.0.0.1:${await freePort()}` });
  const jpeg = await jpegBytes();
  const tooSmall = await solid(299, 400).jpeg().toBuffer();

  try {
    const cases: Array<[number, string, () => Promise<Response>]> = [
      [401, 'sem sessão', async () => uploadPhoto(env.stack.client(), photoless, jpeg)],
      [403, 'instructor', async () => uploadPhoto(instructor, photoless, jpeg)],
      [404, 'aluno que não existe', async () => uploadPhoto(reception, crypto.randomUUID(), jpeg)],
      [409, 'foto que já existe', async () => uploadPhoto(reception, withPhoto, jpeg)],
      [413, '5 MiB mais um byte', async () => uploadPhoto(reception, photoless, padJpeg(jpeg, 5_242_881))],
      [415, 'texto', async () => uploadPhoto(reception, photoless, Buffer.from('só texto'.repeat(30)))],
      [422, '299×400', async () => uploadPhoto(reception, photoless, tooSmall)],
      [500, 'insert de auditoria que falha', () => withAuditInsertFailing(env.stack, () => uploadPhoto(reception, photoless, jpeg))],
      [503, 'armazenamento fora', async () => uploadPhoto(down.client, photoless, jpeg)],
      [204, 'DELETE de aluno sem foto', async () => reception.delete(photoPath(photoless))],
    ];
    expect(cases).toHaveLength(10);

    for (const [status, name, send] of cases) {
      const before = await auditCount(env.stack);

      const response = await send();

      expect(response.status, name).toBe(status);
      expect(await auditCount(env.stack), name).toBe(before);
    }
  } finally {
    await down.api.close();
  }
});

test('audit_failure_on_delete_keeps_row_and_objects', async () => {
  const studentId = await newStudent();
  await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));
  const { url } = (await (await reception.get(photoPath(studentId))).json()) as { url: string };
  const rowsBefore = await photoRows(env.stack, studentId);
  const keysBefore = await uploadKeys(env.minio, studentId);
  expect(keysBefore).toHaveLength(3);

  const response = await withAuditInsertFailing(env.stack, () => reception.delete(photoPath(studentId)));

  expect(response.status).toBe(500);
  expect(((await response.json()) as { code: string }).code).toBe('internal_error');
  expect(await photoRows(env.stack, studentId)).toEqual(rowsBefore);
  expect(await uploadKeys(env.minio, studentId)).toEqual(keysBefore);
  expect((await fetch(`${env.stack.api.url}${url}`)).status).toBe(200);
});

const FILE = 'foto-original-unica.jpg';
const MARKER = 'CAMERA-SECRETA-77';

test('file_name_key_and_content_never_reach_audit_or_log', async () => {
  const down = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: `http://127.0.0.1:${await freePort()}` });
  const output = captureOutput();
  try {
    const marked = await sharp(await jpegBytes()).jpeg().withExif({ IFD0: { Make: MARKER } }).toBuffer();
    expect(marked.includes(MARKER)).toBe(true);
    const studentId = await newStudent();

    expect((await uploadPhoto(reception, studentId, marked, { filename: FILE })).status).toBe(201);
    expect((await reception.delete(photoPath(studentId))).status).toBe(204);
    expect((await uploadPhoto(reception, await newStudent(), Buffer.from('texto'.repeat(40)), { filename: FILE })).status).toBe(415);
    expect((await uploadPhoto(down.client, await newStudent(), marked, { filename: FILE })).status).toBe(503);

    const audit = (await env.stack.query<{ row: string }>('select to_jsonb(a)::text as row from audit_logs a')).map((entry) => entry.row).join('\n');
    const logged = output.text();
    expect(audit).toMatch(/student\.photo_uploaded/);
    expect(logged).toMatch(/"msg":"request"/);
    for (const [name, value] of Object.entries({ 'nome do arquivo': FILE, 'chave do objeto': 'photos/main/', conteúdo: MARKER })) {
      expect(audit.includes(value), `${name} na trilha`).toBe(false);
      expect(logged.includes(value), `${name} no log`).toBe(false);
    }
  } finally {
    vi.restoreAllMocks();
    await down.api.close();
  }
});

/** Uma requisição pelo `node:http`, que não acrescenta `User-Agent` nem mexe nos cabeçalhos dados. */
function send(client: Client, method: string, path: string, headers: Record<string, string>, body?: Buffer) {
  return new Promise<number>((resolve, reject) => {
    const req = request(
      `${env.stack.api.url}${path}`,
      {
        method,
        headers: {
          Origin: WEB_ORIGIN,
          Cookie: client.cookie(),
          ...(body && { 'Content-Length': body.length }),
          ...headers,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

async function rowOf(action: string, studentId: string): Promise<AuditRow> {
  const rows = (await auditRows(env.stack)).filter((row) => row.action === action && row.entity_id === studentId);
  expect(rows, `${action} de ${studentId}`).toHaveLength(1);
  return rows[0]!;
}

test('ip_and_user_agent_on_the_two_photo_actions', async () => {
  const { body, contentType } = multipart([{ name: 'file', bytes: await jpegBytes(), filename: 'foto.jpg', type: 'image/jpeg' }]);
  const userAgent = 'u'.repeat(513);
  const forwarded = { 'X-Forwarded-For': '198.51.100.1, 203.0.113.7' };

  const first = await newStudent();
  expect(await send(reception, 'POST', photoPath(first), { ...forwarded, 'User-Agent': userAgent, 'Content-Type': contentType }, body)).toBe(201);
  expect(await send(reception, 'DELETE', photoPath(first), { ...forwarded, 'User-Agent': userAgent })).toBe(204);
  for (const action of ['student.photo_uploaded', 'student.photo_removed']) {
    const row = await rowOf(action, first);
    expect(row.ip, action).toBe('203.0.113.7');
    expect(row.user_agent, action).toBe(userAgent.slice(0, 512));
    expect(row.user_agent, action).toHaveLength(512);
  }

  const second = await newStudent();
  expect(await send(reception, 'POST', photoPath(second), { ...forwarded, 'Content-Type': contentType }, body)).toBe(201);
  expect(await send(reception, 'DELETE', photoPath(second), forwarded)).toBe(204);
  for (const action of ['student.photo_uploaded', 'student.photo_removed']) {
    expect((await rowOf(action, second)).user_agent, `${action} sem User-Agent`).toBeNull();
  }
});
