import { randomUUID } from 'node:crypto';
import type { Role } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Client } from './support/client.ts';
import {
  jpegBytes,
  photoCount,
  photoRows,
  photoRowsText,
  type PhotoStack,
  snapshotOf,
  startPhotoStack,
  uploadKeys,
  uploadPhoto,
  uploaded,
} from './support/photos.ts';
import { problem } from './support/stack.ts';
import { createStudent, releasedTogether, setStatus, studentBody } from './support/students.ts';

let env: PhotoStack;
let reception: Client;
let admin: Client;
let students = 100;

beforeAll(async () => {
  env = await startPhotoStack();
  reception = (await env.stack.session('reception')).client;
  admin = (await env.stack.session('admin')).client;
}, 240_000);

afterAll(() => env?.close());

const newStudent = async () => (await createStudent(reception, studentBody((students += 1)))).id;
const sessionOf = async (role: Role) => (await env.stack.session(role)).client;
const photoPath = (studentId: string) => `/api/students/${studentId}/photo`;

test('upload_201_by_admin_and_reception_version_1', async () => {
  for (const [name, client] of [['admin', admin], ['reception', reception]] as const) {
    const studentId = await newStudent();

    const response = await uploadPhoto(client, studentId, await jpegBytes(800, 1000));
    const body = (await response.json()) as Record<string, unknown>;
    const rows = await photoRows(env.stack, studentId);

    expect(response.status, name).toBe(201);
    expect(Object.keys(body).sort(), name).toEqual(['createdAt', 'id', 'version']);
    expect(body.version, name).toBe(1);
    expect(rows, name).toHaveLength(1);
    expect(body.id, name).toBe(rows[0]!.id);
    expect(rows[0]!.is_current, name).toBe(true);
    expect(new Date(body.createdAt as string).toISOString(), name).toBe(body.createdAt);
  }
});

test('second_upload_409_photo_exists_leaves_rows_and_objects', async () => {
  const studentId = await newStudent();
  const first = await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));
  const rowsBefore = await photoRowsText(env.stack, studentId);
  const keysBefore = await uploadKeys(env.minio, studentId);
  const countBefore = await photoCount(env.stack);
  expect(keysBefore).toEqual(['thumb', 'medium', 'large'].map((variant) => `photos/main/${studentId}/${first.id}/${variant}.webp`).sort());

  const response = await uploadPhoto(reception, studentId, await jpegBytes(900, 1200));

  expect(response.status).toBe(409);
  expect((await problem(response)).code).toBe('photo_exists');
  expect(await photoCount(env.stack)).toBe(countBefore);
  expect(await photoRowsText(env.stack, studentId)).toEqual(rowsBefore);
  expect(await uploadKeys(env.minio, studentId)).toEqual(keysBefore);
});

test('ten_concurrent_pairs_one_201_one_409_three_objects', async () => {
  const bytes = await jpegBytes();
  for (let round = 1; round <= 10; round += 1) {
    const studentId = await newStudent();

    const responses = await releasedTogether([
      () => uploadPhoto(reception, studentId, bytes),
      () => uploadPhoto(admin, studentId, bytes),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses, `rodada ${round}`).toEqual([201, 409]);
    const refused = responses.find((response) => response.status === 409)!;
    expect((await problem(refused)).code, `rodada ${round}`).toBe('photo_exists');
    const rows = await photoRows(env.stack, studentId);
    expect(rows, `rodada ${round}`).toHaveLength(1);
    expect(await uploadKeys(env.minio, studentId), `rodada ${round}`).toEqual(
      ['thumb', 'medium', 'large'].map((variant) => `photos/main/${studentId}/${rows[0]!.id}/${variant}.webp`).sort(),
    );
  }
});

test('post_404_for_bad_and_unknown_id_writes_nothing', async () => {
  const before = await snapshotOf(env.stack, env.minio);

  for (const id of ['abc', randomUUID()]) {
    const response = await uploadPhoto(reception, id, await jpegBytes());

    expect(response.status, id).toBe(404);
    expect((await problem(response)).code, id).toBe('not_found');
  }

  expect(await snapshotOf(env.stack, env.minio)).toEqual(before);
});

test('hr_finance_and_instructor_403_on_post_and_delete', async () => {
  const studentId = await newStudent();
  await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));
  const withoutPhoto = await newStudent();
  // o login de cada perfil também grava na trilha: as sessões abrem antes de medir
  const clients = { hr_finance: await sessionOf('hr_finance'), instructor: await sessionOf('instructor') };
  const before = await snapshotOf(env.stack, env.minio);

  for (const role of ['hr_finance', 'instructor'] as const) {
    const client = clients[role];

    const post = await uploadPhoto(client, withoutPhoto, await jpegBytes());
    const remove = await client.delete(photoPath(studentId));

    expect(post.status, `POST ${role}`).toBe(403);
    expect((await problem(post)).code, `POST ${role}`).toBe('forbidden');
    expect(remove.status, `DELETE ${role}`).toBe(403);
    expect((await problem(remove)).code, `DELETE ${role}`).toBe('forbidden');
  }

  const after = await snapshotOf(env.stack, env.minio);
  expect(after).toEqual(before);
  expect(await uploadKeys(env.minio, withoutPhoto)).toEqual([]);
  expect(await uploadKeys(env.minio, studentId)).toHaveLength(3);
});

test('three_photo_routes_401_without_session', async () => {
  const studentId = await newStudent();
  const anonymous = env.stack.client();

  const responses = {
    POST: await uploadPhoto(anonymous, studentId, await jpegBytes()),
    GET: await anonymous.get(photoPath(studentId)),
    DELETE: await anonymous.delete(photoPath(studentId)),
  };

  for (const [method, response] of Object.entries(responses)) {
    expect(response.status, method).toBe(401);
    expect((await problem(response)).code, method).toBe('unauthorized');
  }
});

test('inactive_and_suspended_students_accept_upload_and_removal', async () => {
  for (const status of ['inactive', 'suspended']) {
    const studentId = await newStudent();
    await setStatus(env.stack, studentId, status);

    const post = await uploadPhoto(reception, studentId, await jpegBytes());
    const remove = await reception.delete(photoPath(studentId));

    expect(post.status, `POST ${status}`).toBe(201);
    expect(remove.status, `DELETE ${status}`).toBe(204);
  }
});

test('foreign_origin_403_csrf_on_multipart_post_and_delete', async () => {
  const studentId = await newStudent();
  const withPhoto = await newStudent();
  await uploaded(await uploadPhoto(reception, withPhoto, await jpegBytes()));
  const before = await snapshotOf(env.stack, env.minio);

  const attempts: Array<[string, Promise<Response>]> = [
    ['POST com Origin de outro site', uploadPhoto(reception, studentId, await jpegBytes(), { origin: 'http://evil.example' })],
    [
      'POST sem Origin e Sec-Fetch-Site cross-site',
      uploadPhoto(reception, studentId, await jpegBytes(), { origin: null, headers: { 'Sec-Fetch-Site': 'cross-site' } }),
    ],
    ['DELETE com Origin de outro site', reception.delete(photoPath(withPhoto), { origin: 'http://evil.example' })],
  ];

  for (const [name, pending] of attempts) {
    const response = await pending;
    expect(response.status, name).toBe(403);
    expect((await problem(response)).code, name).toBe('csrf_rejected');
  }

  expect(await snapshotOf(env.stack, env.minio)).toEqual(before);
  expect(await uploadKeys(env.minio, studentId)).toEqual([]);
  expect(await uploadKeys(env.minio, withPhoto)).toHaveLength(3);
});
