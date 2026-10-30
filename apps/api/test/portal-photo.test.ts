import type { PendingPhoto, PhotoCreated, StudentDetail } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { auditRows, written } from './support/audit.ts';
import { readStatus } from './support/check-ins.ts';
import type { Client } from './support/client.ts';
import { type CapturedMail, captureMail } from './support/mail.ts';
import {
  blankPng,
  databaseNow,
  jpegBytes,
  keysOf,
  multipart,
  noise,
  padJpeg,
  type Part,
  photoRowsText,
  type PhotoStack,
  replacePhoto,
  solid,
  snapshotOf,
  startPhotoStack,
  uploadKeys,
  uploaded,
  uploadPhoto,
  versionRows,
} from './support/photos.ts';
import { pendingPath, portalSession, postMyParts, postMyPhoto } from './support/portal.ts';
import { problem, type Stack } from './support/stack.ts';
import { releasedTogether, unknownId } from './support/students.ts';

const MAX = 5 * 1024 * 1024;

let env: PhotoStack;
let stack: Stack;
let mail: CapturedMail;
let reception: Client;
let admin: Client;

beforeAll(async () => {
  mail = captureMail();
  env = await startPhotoStack(undefined, { mail: mail.transport });
  stack = env.stack;
  reception = (await stack.session('reception')).client;
  admin = (await stack.session('admin')).client;
}, 240_000);

afterEach(async () => {
  await stack.query('update privacy_settings set photo_version_retention_days = 30');
});

afterAll(() => env?.close());

/** Um aluno com sessão e a foto corrente, versão 1, enviada pela recepção. */
async function studentWithCurrent() {
  const session = await portalSession(stack, mail);
  const current = await uploaded(await uploadPhoto(reception, session.student.id, await jpegBytes()));
  return { ...session, currentId: current.id };
}

/** O mesmo, com uma pendente, versão 2, enviada pelo aluno. */
async function studentWithPending() {
  const session = await studentWithCurrent();
  const response = await postMyPhoto(session.client, await jpegBytes());
  expect(response.status, 'envio de preparação').toBe(201);
  return { ...session, pending: (await response.json()) as PendingPhoto };
}

const rowsOf = (studentId: string) =>
  stack.query<{ id: string; version: number; pending: boolean; is_current: boolean; expires_at: Date | null; days: string | null }>(
    `select id, version, pending, is_current, expires_at, (expires_at - created_at)::text as days from photos where student_id = $1 order by version`,
    [studentId],
  );

test('me_photo_201_stores_pending_version_with_30_days_and_student_author', async () => {
  const { client, student, user, currentId } = await studentWithCurrent();
  const keysBefore = await uploadKeys(env.minio, student.id);

  const { result: response, rows: trail } = await written(stack, async () => postMyPhoto(client, await jpegBytes()));

  expect(response.status).toBe(201);
  const body = (await response.json()) as PendingPhoto;
  expect(body.version).toBe(2);
  expect(typeof body.id).toBe('string');
  expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);

  const rows = await rowsOf(student.id);
  expect(rows.map(({ id, version, pending, is_current }) => ({ id, version, pending, is_current }))).toEqual([
    { id: currentId, version: 1, pending: false, is_current: true },
    { id: body.id, version: 2, pending: true, is_current: false },
  ]);
  expect(rows[1]!.days).toBe('30 days');
  expect((await uploadKeys(env.minio, student.id)).sort()).toEqual([...keysBefore, ...keysOf(student.id, body.id)].sort());
  expect(trail.map(({ action, user_id, entity_id }) => ({ action, user_id, entity_id }))).toEqual([
    { action: 'student.photo_uploaded', user_id: user.id, entity_id: student.id },
  ]);
});

test('second_or_concurrent_upload_409_pending_photo_exists', async () => {
  const { client, student } = await studentWithPending();
  const before = await snapshotOf(stack, env.minio);

  const second = await postMyPhoto(client, await jpegBytes());

  expect(second.status).toBe(409);
  expect((await problem(second)).code).toBe('pending_photo_exists');
  expect(await snapshotOf(stack, env.minio)).toEqual(before);
  expect((await rowsOf(student.id)).length).toBe(2);

  const racing = await portalSession(stack, mail);
  const jpeg = await jpegBytes();
  const responses = await releasedTogether([() => postMyPhoto(racing.client, jpeg), () => postMyPhoto(racing.client, jpeg)]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  const loser = responses.find((response) => response.status === 409)!;
  expect((await problem(loser)).code).toBe('pending_photo_exists');
  const rows = await rowsOf(racing.student.id);
  expect(rows).toHaveLength(1);
  expect(await uploadKeys(env.minio, racing.student.id)).toEqual(keysOf(racing.student.id, rows[0]!.id));
});

test('nine_rejected_files_same_status_and_code_as_staff_upload', async () => {
  const { client } = await portalSession(stack, mail);
  const staffTarget = await portalSession(stack, mail);
  const jpeg = await jpegBytes(800, 1000);
  const truncated = await noise(800, 1000).jpeg().toBuffer();
  const file = (bytes: Buffer, type = 'image/jpeg', filename = 'foto.jpg'): Part => ({ name: 'file', bytes, filename, type });
  type Send = (sender: (parts: Part[]) => Promise<Response>, json: () => Promise<Response>) => Promise<Response>;
  const parts =
    (list: Part[]): Send =>
    (sender) =>
      sender(list);
  const cases: Array<[name: string, send: Send]> = [
    ['texto enviado como image/jpeg', parts([file(Buffer.from('isto é só texto. '.repeat(40)))])],
    ['GIF', parts([file(Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00;', 'latin1'), 'image/gif', 'foto.gif')])],
    ['corpo application/json', (_sender, json) => json()],
    ['parte file de 5 242 881 bytes', parts([file(padJpeg(jpeg, MAX + 1))])],
    ['multipart sem parte file', parts([{ name: 'legenda', value: 'minha foto' }])],
    ['duas partes file', parts([file(jpeg, 'image/jpeg', 'a.jpg'), file(jpeg, 'image/jpeg', 'b.jpg')])],
    ['PNG de 299×400', parts([file(await solid(299, 400).png().toBuffer(), 'image/png', 'foto.png')])],
    ['PNG de 3015×13267', parts([file(blankPng(3015, 13_267), 'image/png', 'foto.png')])],
    ['JPEG truncado na metade', parts([file(truncated.subarray(0, Math.floor(truncated.length / 2)))])],
  ];
  expect(cases).toHaveLength(9);

  const staffPath = `/api/students/${staffTarget.student.id}/photo`;
  const seen = new Set<number>();
  for (const [name, send] of cases) {
    const staff = await send(
      (list) => {
        const { body, contentType } = multipart(list);
        return reception.request('POST', staffPath, { body, headers: { 'Content-Type': contentType } });
      },
      () => reception.request('POST', staffPath, { body: { file: 'x' } }),
    );
    const staffCode = (await problem(staff)).code;
    const before = await snapshotOf(stack, env.minio);

    const response = await send(
      (list) => postMyParts(client, list),
      () => client.request('POST', '/api/me/photo', { body: { file: 'x' } }),
    );

    expect(response.status, name).toBe(staff.status);
    expect((await problem(response)).code, name).toBe(staffCode);
    expect(await snapshotOf(stack, env.minio), name).toEqual(before);
    seen.add(response.status);
  }
  // os mesmos três status da foto da equipe: a C59 compara com o `POST`, e o texto dela só nomeia dois
  expect([...seen].sort()).toEqual([413, 415, 422]);
});

test('pending_never_served_and_staff_replace_leaves_it_alone', async () => {
  const { student, currentId, pending } = await studentWithPending();
  const signs = (url: string | null | undefined, photoId: string) => expect(url).toContain(`/api/photo-files/${photoId}/`);

  const list = (await (await reception.get(`/api/students?q=${student.cpf}`)).json()) as { items: Array<{ id: string; photoUrl: string | null }> };
  signs(list.items.find((item) => item.id === student.id)?.photoUrl, currentId);

  const ficha = (await (await reception.get(`/api/students/${student.id}`)).json()) as StudentDetail;
  signs(ficha.photoUrl, currentId);
  expect(ficha.pendingPhoto?.id).toBe(pending.id);

  signs((await readStatus(reception, student.id)).photoUrl, currentId);

  const pendingRow = (await photoRowsText(stack, student.id))[1];
  const replaced = await replacePhoto(reception, student.id, await jpegBytes());

  expect(replaced.status).toBe(201);
  const body = (await replaced.json()) as PhotoCreated;
  expect(body.version).toBe(3);
  const rows = await rowsOf(student.id);
  expect(rows.find((row) => row.is_current)?.id).toBe(body.id);
  expect((await photoRowsText(stack, student.id))[1]).toBe(pendingRow);
});

test('approve_200_makes_pending_current_and_gives_previous_the_retention', async () => {
  for (const [name, client, days] of [
    ['admin, 30 dias', () => admin, 30],
    ['reception, 7 dias', () => reception, 7],
  ] as const) {
    await stack.query('update privacy_settings set photo_version_retention_days = $1', [days]);
    const { student, currentId, pending } = await studentWithPending();
    const t0 = await databaseNow(stack);

    const { result: response, rows: trail } = await written(stack, () => client().post(pendingPath(student.id, 'approve')));

    const t1 = await databaseNow(stack);
    expect(response.status, name).toBe(200);
    expect((await response.json()) as PhotoCreated, name).toMatchObject({ id: pending.id, version: 2 });
    const rows = await rowsOf(student.id);
    expect(rows.find((row) => row.id === pending.id), name).toMatchObject({ pending: false, is_current: true, expires_at: null });
    const previous = await versionRows(stack, student.id, t0, t1, days);
    expect(previous.find((row) => row.id === currentId), name).toMatchObject({ is_current: false, in_window: true });
    expect((await readStatus(reception, student.id)).photoUrl, name).toContain(`/api/photo-files/${pending.id}/`);
    expect(trail.map(({ action, entity_id }) => ({ action, entity_id })), name).toEqual([{ action: 'student.photo_approved', entity_id: student.id }]);
    expect(trail[0]!.user_id, name).not.toBeNull();
  }
});

test('reject_204_expires_pending_and_next_purge_removes_it', async () => {
  for (const [name, client] of [
    ['admin', () => admin],
    ['reception', () => reception],
  ] as const) {
    const { student, currentId, pending } = await studentWithPending();
    const currentRow = (await photoRowsText(stack, student.id))[0];
    const t0 = await databaseNow(stack);

    const { result: response, rows: trail } = await written(stack, () => client().post(pendingPath(student.id, 'reject')));

    const t1 = await databaseNow(stack);
    expect(response.status, name).toBe(204);
    const [row] = await stack.query<{ pending: boolean; is_current: boolean; inside: boolean }>(
      `select pending, is_current, expires_at between $2::timestamptz and $3::timestamptz as inside from photos where id = $1`,
      [pending.id, t0, t1],
    );
    expect(row, name).toEqual({ pending: false, is_current: false, inside: true });
    expect(trail.map((entry) => entry.action), name).toEqual(['student.photo_rejected']);

    await stack.api.purge();

    expect((await rowsOf(student.id)).map((entry) => entry.id), name).toEqual([currentId]);
    expect(await uploadKeys(env.minio, student.id), name).toEqual(keysOf(student.id, currentId));
    expect((await photoRowsText(stack, student.id))[0], name).toBe(currentRow);
  }
});

test('approve_reject_404_no_pending_403_three_roles_401_anonymous', async () => {
  const without = await studentWithCurrent();
  for (const action of ['approve', 'reject'] as const) {
    const response = await reception.post(pendingPath(without.student.id, action));
    expect(response.status, action).toBe(404);
    expect((await problem(response)).code, action).toBe('no_pending_photo');
  }

  const { student, client } = await studentWithPending();
  const before = await photoRowsText(stack, student.id);
  const callers: Array<[string, Client]> = [
    ['hr_finance', (await stack.session('hr_finance')).client],
    ['instructor', (await stack.session('instructor')).client],
    ['student', client],
  ];
  for (const action of ['approve', 'reject'] as const) {
    for (const [role, caller] of callers) {
      expect((await caller.post(pendingPath(student.id, action))).status, `${role} ${action}`).toBe(403);
    }
    const anonymous = await stack.client().post(pendingPath(student.id, action));
    expect(anonymous.status, action).toBe(401);
    for (const id of ['abc', unknownId()]) {
      const missing = await reception.post(pendingPath(id, action));
      expect(missing.status, `${id} ${action}`).toBe(404);
      expect((await problem(missing)).code, `${id} ${action}`).toBe('not_found');
    }
  }
  expect(await photoRowsText(stack, student.id)).toEqual(before);
});

test('me_photo_get_signs_current_and_pending_or_404', async () => {
  const none = await portalSession(stack, mail);
  expect((await none.client.get('/api/me/photo')).status).toBe(404);

  const { client, currentId } = await studentWithCurrent();
  const only = (await (await client.get('/api/me/photo')).json()) as { currentUrl: string; pendingUrl: string | null };
  expect(only.currentUrl).toContain(`/api/photo-files/${currentId}/medium?`);
  expect(only.pendingUrl).toBeNull();

  const pending = (await (await postMyPhoto(client, await jpegBytes())).json()) as PendingPhoto;
  const medium = await client.get('/api/me/photo');
  expect(medium.status).toBe(200);
  const both = (await medium.json()) as { currentUrl: string; pendingUrl: string };
  expect(both.currentUrl).toContain(`/api/photo-files/${currentId}/medium?`);
  expect(both.pendingUrl).toContain(`/api/photo-files/${pending.id}/medium?`);

  const thumbs = (await (await client.get('/api/me/photo?variant=thumb')).json()) as { currentUrl: string; pendingUrl: string };
  expect(thumbs.currentUrl).toContain(`/api/photo-files/${currentId}/thumb?`);
  expect(thumbs.pendingUrl).toContain(`/api/photo-files/${pending.id}/thumb?`);
});

test('concurrent_approve_and_reject_one_wins', async () => {
  for (let round = 0; round < 3; round += 1) {
    const { student } = await studentWithPending();
    const before = (await auditRows(stack)).length;

    const responses = await releasedTogether([
      () => reception.post(pendingPath(student.id, 'approve')),
      () => reception.post(pendingPath(student.id, 'reject')),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect([[200, 404], [204, 404]], `rodada ${round}`).toContainEqual(statuses);
    const loser = responses.find((response) => response.status === 404)!;
    expect((await problem(loser)).code, `rodada ${round}`).toBe('no_pending_photo');
    const written = (await auditRows(stack)).slice(before).filter((row) => row.entity_id === student.id);
    expect(written.filter((row) => ['student.photo_approved', 'student.photo_rejected'].includes(row.action)), `rodada ${round}`).toHaveLength(1);
  }
});
