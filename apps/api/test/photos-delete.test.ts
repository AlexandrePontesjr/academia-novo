import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import type { Client } from './support/client.ts';
import { captureOutput } from './support/log.ts';
import {
  apiWith,
  flakyStorage,
  jpegBytes,
  photoRows,
  type PhotoStack,
  snapshotOf,
  startPhotoStack,
  uploadKeys,
  uploadPhoto,
  uploaded,
} from './support/photos.ts';
import { problem } from './support/stack.ts';
import { createStudent, studentBody } from './support/students.ts';

let env: PhotoStack;
let reception: Client;
let admin: Client;
let students = 900;

beforeAll(async () => {
  env = await startPhotoStack();
  reception = (await env.stack.session('reception')).client;
  admin = (await env.stack.session('admin')).client;
}, 240_000);

afterAll(() => env?.close());

const newStudent = async () => (await createStudent(reception, studentBody((students += 1)))).id;
const photoPath = (studentId: string) => `/api/students/${studentId}/photo`;

test('delete_204_removes_row_objects_and_every_way_to_see_it', async () => {
  for (const [role, client] of [['admin', admin], ['reception', reception]] as const) {
    const studentId = await newStudent();
    await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));
    const { url } = (await (await reception.get(photoPath(studentId))).json()) as { url: string };
    expect((await fetch(`${env.stack.api.url}${url}`)).status, `${role}: a URL antes`).toBe(200);

    const response = await client.delete(photoPath(studentId));

    expect(response.status, role).toBe(204);
    expect(await response.text(), role).toBe('');
    expect(await photoRows(env.stack, studentId), `${role}: linha`).toEqual([]);
    expect(await uploadKeys(env.minio, studentId), `${role}: objetos`).toEqual([]);
    expect((await reception.get(photoPath(studentId))).status, `${role}: GET da foto`).toBe(404);
    const ficha = (await (await reception.get(`/api/students/${studentId}`)).json()) as { photoUrl: unknown };
    expect(ficha.photoUrl, `${role}: ficha`).toBeNull();
    const list = (await (await reception.get(`/api/students?q=Aluno ${students}`)).json()) as {
      items: Array<{ id: string; photoUrl: unknown }>;
    };
    expect(list.items.find((item) => item.id === studentId)?.photoUrl, `${role}: lista`).toBeNull();
    expect((await fetch(`${env.stack.api.url}${url}`)).status, `${role}: a URL de antes`).toBe(404);
  }
});

test('delete_without_photo_204_changes_nothing', async () => {
  const studentId = await newStudent();
  const before = await snapshotOf(env.stack, env.minio);

  const response = await reception.delete(photoPath(studentId));

  expect(response.status).toBe(204);
  expect(await snapshotOf(env.stack, env.minio)).toEqual(before);
});

test('delete_404_for_bad_and_unknown_id', async () => {
  for (const id of ['abc', randomUUID()]) {
    const response = await reception.delete(photoPath(id));

    expect(response.status, id).toBe(404);
    expect((await problem(response)).code, id).toBe('not_found');
  }
});

test('object_removal_failure_still_204_and_logs_photo_id_only', async () => {
  const proxy = await flakyStorage(env.minio.endpoint);
  const flaky = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  const output = captureOutput();
  try {
    const studentId = await newStudent();
    const created = await uploaded(await uploadPhoto(flaky.client, studentId, await jpegBytes()));
    const url = ((await (await flaky.client.get(photoPath(studentId))).json()) as { url: string }).url;
    proxy.failDeletes = true;

    const response = await flaky.client.delete(photoPath(studentId));

    expect(response.status).toBe(204);
    expect(await photoRows(env.stack, studentId)).toEqual([]);
    const [removed] = await env.stack.query<{ n: string }>(
      `select count(*) as n from audit_logs where action = 'student.photo_removed' and entity_id = $1`,
      [studentId],
    );
    expect(Number(removed!.n)).toBe(1);
    expect((await fetch(`${env.stack.api.url}${url}`)).status).toBe(404);
    const ficha = (await (await flaky.client.get(`/api/students/${studentId}`)).json()) as { photoUrl: unknown };
    expect(ficha.photoUrl).toBeNull();

    const lines = output.text().split('\n').filter(Boolean);
    expect(lines.some((line) => line.includes(created.id)), 'uma linha com o photoId').toBe(true);
    expect(lines.filter((line) => line.includes('photos/main/')), 'nenhuma com a chave do objeto').toEqual([]);
  } finally {
    vi.restoreAllMocks();
    await flaky.api.close();
    await proxy.stop();
  }
});

test('upload_after_removal_201_version_1', async () => {
  const studentId = await newStudent();
  await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));
  expect((await reception.delete(photoPath(studentId))).status).toBe(204);

  const again = await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));

  expect(again.version).toBe(1);
  expect(await photoRows(env.stack, studentId)).toHaveLength(1);
});
