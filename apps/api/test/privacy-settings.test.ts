import type { Problem, Role } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { startApi } from './support/app.ts';
import { auditCount, written } from './support/audit.ts';
import { createClient } from './support/client.ts';
import {
  databaseNow,
  jpegBytes,
  type PhotoStack,
  replacePhoto,
  startPhotoStack,
  uploaded,
  uploadPhoto,
  versionRows,
} from './support/photos.ts';
import { problem } from './support/stack.ts';
import { insertStaff, postStaffPhoto, putStaffPhoto } from './support/staff.ts';
import { cpfOf, createStudent, studentBody } from './support/students.ts';

let env: PhotoStack;
let admin: Awaited<ReturnType<PhotoStack['stack']['session']>>;
let counter = 84_000;
const next = () => (counter += 1);
const FOREIGN = 'https://outro.example';
const PATH = '/api/privacy-settings';

beforeAll(async () => {
  env = await startPhotoStack();
  admin = await env.stack.session('admin');
}, 180_000);

afterAll(() => env?.close());

const put = (body: unknown, client = admin.client) => client.put(PATH, body);

/** A linha única de `privacy_settings`, como o banco a guarda. */
async function settingsRow() {
  const rows = await env.stack.query<{ years: number | null; days: number }>(
    'select inactive_student_retention_years as years, photo_version_retention_days as days from privacy_settings',
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

const settingsRowText = async () =>
  (await env.stack.query<{ row: string }>('select to_jsonb(p)::text as row from privacy_settings p'))[0]!.row;

/** Põe a configuração direto no banco: o ponto de partida de cada prova. */
async function setSettings(years: number | null, days: number) {
  await env.stack.query('update privacy_settings set inactive_student_retention_years = $1, photo_version_retention_days = $2', [years, days]);
}

// a primeira do arquivo: a instalação recém-migrada, antes de qualquer `PUT`
test('fresh_settings_are_null_and_30', async () => {
  const response = await admin.client.get(PATH);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ inactiveStudentRetentionYears: null, photoVersionRetentionDays: 30 });
});

test('put_returns_and_persists_values', async () => {
  await setSettings(null, 30);

  const response = await put({ inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 7 });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 7 });
  expect(await (await admin.client.get(PATH)).json()).toEqual({ inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 7 });
  expect(await settingsRow()).toEqual({ years: 5, days: 7 });
});

test('years_accepts_null_1_20_and_rejects_five_values', async () => {
  for (const years of [null, 1, 20]) {
    await setSettings(3, 30);
    const response = await put({ inactiveStudentRetentionYears: years, photoVersionRetentionDays: 30 });
    expect(response.status, String(years)).toBe(200);
    expect((await settingsRow()).years, String(years)).toBe(years);
  }

  await setSettings(3, 30);
  const before = await settingsRowText();
  const rejected: Array<[label: string, body: Record<string, unknown>]> = [
    ['0', { inactiveStudentRetentionYears: 0, photoVersionRetentionDays: 30 }],
    ['21', { inactiveStudentRetentionYears: 21, photoVersionRetentionDays: 30 }],
    ['1.5', { inactiveStudentRetentionYears: 1.5, photoVersionRetentionDays: 30 }],
    ['"5"', { inactiveStudentRetentionYears: '5', photoVersionRetentionDays: 30 }],
    ['ausente', { photoVersionRetentionDays: 30 }],
  ];
  for (const [label, body] of rejected) {
    const response = await put(body);
    expect(response.status, label).toBe(422);
    const body422 = (await response.json()) as Problem;
    expect(body422.code, label).toBe('validation_failed');
    expect((body422.errors ?? []).map((error) => error.path), label).toEqual(['inactiveStudentRetentionYears']);
    expect(await settingsRowText(), label).toBe(before);
  }
});

test('days_accepts_1_365_and_rejects_six_values', async () => {
  for (const days of [1, 365]) {
    await setSettings(null, 30);
    const response = await put({ inactiveStudentRetentionYears: null, photoVersionRetentionDays: days });
    expect(response.status, String(days)).toBe(200);
    expect((await settingsRow()).days, String(days)).toBe(days);
  }

  await setSettings(null, 30);
  const before = await settingsRowText();
  const rejected: Array<[label: string, body: Record<string, unknown>]> = [
    ['0', { inactiveStudentRetentionYears: null, photoVersionRetentionDays: 0 }],
    ['366', { inactiveStudentRetentionYears: null, photoVersionRetentionDays: 366 }],
    ['1.5', { inactiveStudentRetentionYears: null, photoVersionRetentionDays: 1.5 }],
    ['null', { inactiveStudentRetentionYears: null, photoVersionRetentionDays: null }],
    ['"30"', { inactiveStudentRetentionYears: null, photoVersionRetentionDays: '30' }],
    ['ausente', { inactiveStudentRetentionYears: null }],
  ];
  for (const [label, body] of rejected) {
    const response = await put(body);
    expect(response.status, label).toBe(422);
    const body422 = (await response.json()) as Problem;
    expect(body422.code, label).toBe('validation_failed');
    expect((body422.errors ?? []).map((error) => error.path), label).toEqual(['photoVersionRetentionDays']);
    expect(await settingsRowText(), label).toBe(before);
  }
});

test('settings_update_audits_only_changed_fields_and_no_row_when_unchanged', async () => {
  await setSettings(null, 30);

  const onlyYears = await written(env.stack, () => put({ inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 30 }));
  expect(onlyYears.result.status).toBe(200);
  expect(onlyYears.rows).toHaveLength(1);
  expect(onlyYears.rows[0]).toMatchObject({
    action: 'privacy.settings_updated',
    entity: 'privacy_settings',
    entity_id: null,
    user_id: admin.user.id,
  });
  expect(onlyYears.rows[0]!.diff).toEqual({
    fields: ['inactiveStudentRetentionYears'],
    values: { inactiveStudentRetentionYears: { from: null, to: 5 } },
  });

  const both = await written(env.stack, () => put({ inactiveStudentRetentionYears: 10, photoVersionRetentionDays: 7 }));
  expect(both.result.status).toBe(200);
  expect(both.rows).toHaveLength(1);
  expect(both.rows[0]!.diff).toEqual({
    fields: ['inactiveStudentRetentionYears', 'photoVersionRetentionDays'],
    values: {
      inactiveStudentRetentionYears: { from: 5, to: 10 },
      photoVersionRetentionDays: { from: 30, to: 7 },
    },
  });

  const same = await written(env.stack, () => put({ inactiveStudentRetentionYears: 10, photoVersionRetentionDays: 7 }));
  expect(same.result.status).toBe(200);
  expect(await same.result.json()).toEqual({ inactiveStudentRetentionYears: 10, photoVersionRetentionDays: 7 });
  expect(same.rows).toEqual([]);
});

test('photo_replace_reads_days_from_settings_for_student_and_staff_and_keeps_stored_expiry', async () => {
  await setSettings(null, 30);
  expect((await put({ inactiveStudentRetentionYears: null, photoVersionRetentionDays: 7 })).status).toBe(200);

  const studentId = (await createStudent(admin.client, studentBody(next()))).id;
  const [staffId] = await insertStaff(env.stack, [{ name: `Funcionário ${next()}`, cpf: cpfOf(counter) }]);
  await uploaded(await uploadPhoto(admin.client, studentId, await jpegBytes()));
  await uploaded(await postStaffPhoto(admin.client, staffId!, await jpegBytes()));

  let t0 = await databaseNow(env.stack);
  await uploaded(await replacePhoto(admin.client, studentId, await jpegBytes()));
  await uploaded(await putStaffPhoto(admin.client, staffId!, await jpegBytes()));
  let t1 = await databaseNow(env.stack);

  const [studentStored] = await versionRows(env.stack, studentId, t0, t1, 7);
  expect(studentStored).toMatchObject({ version: 1, is_current: false, in_window: true });
  const [staffStored] = await versionRows(env.stack, staffId!, t0, t1, 7, 'staff_id');
  expect(staffStored).toMatchObject({ version: 1, is_current: false, in_window: true });

  // mudado para 1 dia: a troca seguinte guarda por 1 dia, e a versão guardada antes fica com os 7
  expect((await put({ inactiveStudentRetentionYears: null, photoVersionRetentionDays: 1 })).status).toBe(200);
  t0 = await databaseNow(env.stack);
  await uploaded(await replacePhoto(admin.client, studentId, await jpegBytes()));
  t1 = await databaseNow(env.stack);

  const rows = await versionRows(env.stack, studentId, t0, t1, 1);
  expect(rows).toHaveLength(3);
  expect(rows[0]!.expires_at).toBe(studentStored!.expires_at);
  expect(rows[1]).toMatchObject({ version: 2, is_current: false, in_window: true });
  expect(rows[2]).toMatchObject({ version: 3, is_current: true, expires_at: null });
});

test('settings_403_three_roles_and_401_anonymous', async () => {
  await setSettings(4, 30);
  const sessions: Array<[Role, Awaited<ReturnType<PhotoStack['stack']['session']>>['client']]> = [];
  for (const role of ['reception', 'hr_finance', 'instructor'] as Role[]) sessions.push([role, (await env.stack.session(role)).client]);
  const before = await settingsRowText();

  for (const [role, client] of sessions) {
    for (const [label, call] of [
      ['GET', () => client.get(PATH)],
      ['PUT', () => put({ inactiveStudentRetentionYears: 9, photoVersionRetentionDays: 9 }, client)],
    ] as const) {
      const response = await call();
      expect(response.status, `${role} ${label}`).toBe(403);
      expect((await problem(response)).code, `${role} ${label}`).toBe('forbidden');
    }
  }
  for (const call of [() => env.stack.client().get(PATH), () => put({ inactiveStudentRetentionYears: 9, photoVersionRetentionDays: 9 }, env.stack.client())]) {
    const response = await call();
    expect(response.status).toBe(401);
    expect((await problem(response)).code).toBe('unauthorized');
  }
  expect(await settingsRowText()).toBe(before);
});

test('extra_key_422_unreadable_400_foreign_origin_403_and_row_unchanged', async () => {
  await setSettings(4, 30);
  const before = await settingsRowText();
  const audit = await auditCount(env.stack);

  const extra = await put({ inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 7, purgeNow: true });
  expect(extra.status).toBe(422);
  const extraBody = (await extra.json()) as Problem;
  expect(extraBody.code).toBe('validation_failed');
  expect((extraBody.errors ?? []).map((error) => error.path)).toEqual(['purgeNow']);
  expect(await settingsRowText()).toBe(before);

  const unreadable = await admin.client.request('PUT', PATH, { body: '{"inactiveStudentRetentionYears": ', headers: { 'Content-Type': 'application/json' } });
  expect(unreadable.status).toBe(400);
  expect((await problem(unreadable)).code).toBe('bad_request');
  expect(await settingsRowText()).toBe(before);

  const foreign = await admin.client.put(PATH, { inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 7 }, { origin: FOREIGN });
  expect(foreign.status).toBe(403);
  expect((await problem(foreign)).code).toBe('csrf_rejected');
  expect(await settingsRowText()).toBe(before);
  expect(await auditCount(env.stack)).toBe(audit);
});

test('settings_survive_api_restart', async () => {
  await setSettings(null, 30);
  expect((await put({ inactiveStudentRetentionYears: 12, photoVersionRetentionDays: 45 })).status).toBe(200);

  // outra API, iniciada depois, sobre o mesmo banco
  const api = await startApi(env.stack.postgres.url, [], env.minio.env);
  try {
    const user = await env.stack.seed({ role: 'admin' });
    const client = await env.stack.signIn(user, createClient(api.url));
    await env.stack.query('update users set two_factor_enabled = true where id = $1', [user.id]);

    const response = await client.get(PATH);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inactiveStudentRetentionYears: 12, photoVersionRetentionDays: 45 });
  } finally {
    await api.close();
  }
});
