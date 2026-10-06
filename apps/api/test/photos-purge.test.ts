import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { startApi } from './support/app.ts';
import { auditCount, auditRows } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { captureOutput } from './support/log.ts';
import {
  apiWith,
  bucketKeys,
  bucketObject,
  databaseNow,
  flakyStorage,
  jpegBytes,
  keysOf,
  photoRowsText,
  type PhotoStack,
  replacePhoto,
  sha256,
  startPhotoStack,
  uploadKeys,
  uploadPhoto,
  uploaded,
  versionRows,
} from './support/photos.ts';
import { freePort } from './support/servers.ts';
import { createStudent, releasedTogether, studentBody } from './support/students.ts';

let env: PhotoStack;
let reception: Client;
let students = 3100;

beforeAll(async () => {
  env = await startPhotoStack();
  reception = (await env.stack.session('reception')).client;
}, 240_000);

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // o que um teste deixou guardado não vence dentro do teste seguinte
  await env.stack.query(`update photos set expires_at = now() + interval '300 days' where not is_current`);
});

afterAll(() => env?.close());

const HOUR = 60 * 60 * 1000;
const EXPIRED = `now() - interval '1 second'`;
const UNEXPIRED = `now() + interval '1 minute'`;
const newStudent = async () => (await createStudent(reception, studentBody((students += 1)))).id;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera, pelo relógio de verdade, até `check` valer. */
async function until(check: () => Promise<boolean> | boolean, name: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(`não aconteceu em ${timeoutMs} ms: ${name}`);
}

/** Um aluno com foto corrente e `stored` versões guardadas, todas com o prazo dado. */
async function studentWithVersions(expiry: string, stored = 1) {
  const studentId = await newStudent();
  const ids = [(await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()))).id];
  for (let n = 0; n < stored; n += 1) ids.push((await uploaded(await replacePhoto(reception, studentId, await jpegBytes()))).id);
  const currentId = ids.pop()!;
  await env.stack.query(`update photos set expires_at = ${expiry} where student_id = $1 and not is_current`, [studentId]);
  return { studentId, storedIds: ids, currentId };
}

const rowExists = async (photoId: string) => (await env.stack.query('select 1 from photos where id = $1', [photoId])).length === 1;
const rowText = async (photoId: string) =>
  (await env.stack.query<{ row: string }>('select to_jsonb(p)::text as row from photos p where id = $1', [photoId]))[0]?.row;
const keysUnder = (studentId: string, photoId: string) => bucketKeys(env.minio, `photos/main/${studentId}/${photoId}/`);
const hashesOf = (keys: string[]) => Promise.all(keys.map(async (key) => sha256(await bucketObject(env.minio, key))));
const purgedRowsOf = async (studentId: string) =>
  (await auditRows(env.stack)).filter((row) => row.action === 'student.photo_version_purged' && row.entity_id === studentId);

/** As linhas de log (JSON) escritas com a `msg` dada. */
const logged = (output: { text(): string }, msg: string) =>
  output
    .text()
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line.msg === msg);

test('purge_removes_expired_rows_and_their_objects', async () => {
  const one = await studentWithVersions(EXPIRED);
  const two = await studentWithVersions(EXPIRED, 2);
  const expired = [
    ...one.storedIds.map((id) => [one.studentId, id] as const),
    ...two.storedIds.map((id) => [two.studentId, id] as const),
  ];
  expect(expired).toHaveLength(3);
  for (const [studentId, id] of expired) expect(await keysUnder(studentId, id)).toHaveLength(3);
  const keysBefore = await bucketKeys(env.minio);

  await env.stack.api.purge();

  for (const [studentId, id] of expired) {
    expect(await rowExists(id), id).toBe(false);
    expect(await keysUnder(studentId, id), id).toEqual([]);
  }
  expect(await bucketKeys(env.minio)).toHaveLength(keysBefore.length - 9);
});

test('purge_keeps_unexpired_version_and_every_current_photo', async () => {
  const unexpired = await studentWithVersions(UNEXPIRED);
  const old = await newStudent();
  const oldCurrent = (await uploaded(await uploadPhoto(reception, old, await jpegBytes()))).id;
  await env.stack.query(`update photos set created_at = now() - interval '400 days' where id = $1`, [oldCurrent]);
  const purgedStudent = await studentWithVersions(EXPIRED);
  const kept = [
    ['versão não vencida', unexpired.studentId, unexpired.storedIds[0]!],
    ['corrente de 400 dias', old, oldCurrent],
    ['corrente de aluno expurgado', purgedStudent.studentId, purgedStudent.currentId],
  ] as const;
  const before = await Promise.all(
    kept.map(async ([, studentId, id]) => ({ row: await rowText(id), hashes: await hashesOf(keysOf(studentId, id)) })),
  );
  for (const state of before) expect(state.row).toBeDefined();

  await env.stack.api.purge();

  // a mesma execução removeu a versão vencida do terceiro aluno
  expect(await rowExists(purgedStudent.storedIds[0]!)).toBe(false);
  for (const [index, [name, studentId, id]] of kept.entries()) {
    expect(await rowText(id), name).toBe(before[index]!.row);
    expect(await keysUnder(studentId, id), name).toEqual(keysOf(studentId, id));
    expect(await hashesOf(keysOf(studentId, id)), name).toEqual(before[index]!.hashes);
  }
});

test('startup_purges_expired_version_without_any_request', async () => {
  const { studentId, storedIds, currentId } = await studentWithVersions(EXPIRED);
  const expiredId = storedIds[0]!;
  expect(await rowExists(expiredId)).toBe(true);
  expect(await keysUnder(studentId, expiredId)).toHaveLength(3);

  // uma segunda API sobre o mesmo banco: o teste não envia requisição nenhuma a ela
  const second = await startApi(env.stack.postgres.url, [], env.minio.env);
  try {
    await until(async () => !(await rowExists(expiredId)), 'a linha vencida sair na subida');
    await until(async () => (await keysUnder(studentId, expiredId)).length === 0, 'os objetos saírem na subida');
    expect(await uploadKeys(env.minio, studentId)).toEqual(keysOf(studentId, currentId));
  } finally {
    await second.close();
  }
});

test('purge_runs_every_60_minutes_survives_a_failed_run_and_stops_on_close', async () => {
  const proxy = await flakyStorage(env.minio.endpoint);
  // o temporizador do teste: só as funções que o expurgo usa; `Date` e o resto do tempo correm
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const api = await startApi(env.stack.postgres.url, [], { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  const output = captureOutput();
  let closed = false;
  try {
    const gone = async (version: { studentId: string; storedIds: string[] }) =>
      !(await rowExists(version.storedIds[0]!)) && (await keysUnder(version.studentId, version.storedIds[0]!)).length === 0;

    // criada depois da subida: a execução da subida não a viu
    const first = await studentWithVersions(EXPIRED);
    vi.advanceTimersByTime(HOUR - 1000);
    await sleep(1500);
    expect(await rowExists(first.storedIds[0]!), '59 min 59 s').toBe(true);
    expect(await keysUnder(first.studentId, first.storedIds[0]!), '59 min 59 s').toHaveLength(3);
    vi.advanceTimersByTime(1000);
    await until(() => gone(first), 'a primeira versão sair aos 60 minutos');

    const second = await studentWithVersions(EXPIRED);
    vi.advanceTimersByTime(HOUR);
    await until(() => gone(second), 'a segunda versão sair depois de mais 60 minutos');

    // uma execução que falha por armazenamento fora não impede a seguinte
    const third = await studentWithVersions(EXPIRED);
    proxy.down = true;
    vi.advanceTimersByTime(HOUR);
    await until(() => logged(output, 'photo purge failed').length === 1, 'a execução com o armazenamento fora falhar');
    expect(await rowExists(third.storedIds[0]!)).toBe(true);
    proxy.down = false;
    vi.advanceTimersByTime(HOUR);
    await until(() => gone(third), 'a terceira versão sair na execução seguinte à que falhou');

    expect(vi.getTimerCount()).toBe(1);
    await api.close();
    closed = true;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    if (!closed) await api.close();
    await proxy.stop();
  }
});

test('object_removal_failure_keeps_row_and_next_run_removes_it', async () => {
  const proxy = await flakyStorage(env.minio.endpoint);
  const flaky = await startApi(env.stack.postgres.url, [], { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  try {
    const cases: Array<[string, () => void]> = [
      ['os três objetos falham', () => (proxy.failDeletes = true)],
      ['só large falha', () => (proxy.failDeleteOf = 'large')],
    ];
    for (const [name, arrange] of cases) {
      const { studentId, storedIds } = await studentWithVersions(EXPIRED);
      const expiredId = storedIds[0]!;
      const rowBefore = await rowText(expiredId);
      const auditBefore = await auditCount(env.stack);
      arrange();

      await flaky.purge();

      expect(await rowText(expiredId), name).toBe(rowBefore);
      expect(await auditCount(env.stack), name).toBe(auditBefore);
      if (name === 'só large falha') {
        expect(await keysUnder(studentId, expiredId), name).toEqual([`photos/main/${studentId}/${expiredId}/large.webp`]);
      }

      // com o armazenamento de volta, a execução seguinte termina o serviço
      proxy.failDeletes = false;
      proxy.failDeleteOf = null;
      await flaky.purge();

      expect(await rowExists(expiredId), name).toBe(false);
      expect(await keysUnder(studentId, expiredId), name).toEqual([]);
      expect(await auditCount(env.stack), name).toBe(auditBefore + 1);
      expect(await purgedRowsOf(studentId), name).toHaveLength(1);
    }
  } finally {
    await flaky.close();
    await proxy.stop();
  }
});

test('two_concurrent_purges_remove_once_and_write_one_audit_row', async () => {
  const other = await startApi(env.stack.postgres.url, [], env.minio.env);
  try {
    for (let round = 1; round <= 10; round += 1) {
      const { studentId, storedIds } = await studentWithVersions(EXPIRED);
      const auditBefore = await auditCount(env.stack);

      await releasedTogether([() => env.stack.api.purge(), () => other.purge()]);

      expect(await rowExists(storedIds[0]!), `rodada ${round}`).toBe(false);
      expect(await keysUnder(studentId, storedIds[0]!), `rodada ${round}`).toEqual([]);
      expect(await purgedRowsOf(studentId), `rodada ${round}`).toHaveLength(1);
      expect(await auditCount(env.stack), `rodada ${round}`).toBe(auditBefore + 1);
    }
  } finally {
    await other.close();
  }
});

test('purge_failure_logs_error_and_api_keeps_answering', async () => {
  const down = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: `http://127.0.0.1:${await freePort()}` });
  try {
    const { studentId, storedIds } = await studentWithVersions(EXPIRED);
    const rowBefore = await rowText(storedIds[0]!);
    const output = captureOutput();

    await expect(down.api.purge()).resolves.toBeUndefined();

    const failures = logged(output, 'photo purge failed');
    vi.restoreAllMocks();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.level).toBe('error');
    expect(await rowText(storedIds[0]!)).toBe(rowBefore);
    expect((await fetch(`${down.api.url}/health`)).status).toBe(503);
    expect((await down.client.get(`/api/students/${studentId}`)).status).toBe(200);
  } finally {
    await down.api.close();
  }
});

test('one_log_line_with_count_per_run_that_removed_and_none_otherwise', async () => {
  await studentWithVersions(EXPIRED);
  await studentWithVersions(EXPIRED, 2);
  const output = captureOutput();

  await env.stack.api.purge();

  const lines = logged(output, 'photo versions purged');
  expect(lines).toHaveLength(1);
  expect(lines[0]!.count).toBe(3);

  // sem nada a remover, nenhuma linha
  await env.stack.api.purge();

  expect(logged(output, 'photo versions purged')).toHaveLength(1);
});

test('retention_days_7_1_and_365_set_expiry_only_for_later_replaces', async () => {
  for (const days of [7, 1, 365]) {
    const custom = await apiWith(env.stack, env.minio.env, { PHOTO_VERSION_RETENTION_DAYS: String(days) });
    try {
      const studentId = await newStudent();
      const first = await uploaded(await uploadPhoto(custom.client, studentId, await jpegBytes()));

      const t0 = await databaseNow(env.stack);
      await uploaded(await replacePhoto(custom.client, studentId, await jpegBytes()));
      const t1 = await databaseNow(env.stack);

      const [stored] = await versionRows(env.stack, studentId, t0, t1, days);
      expect(stored, `${days} dias`).toMatchObject({ id: first.id, is_current: false, in_window: true });
      // e não cai na janela de 30 dias do padrão
      expect((await versionRows(env.stack, studentId, t0, t1, 30))[0]!.in_window, `${days} dias`).toBe(false);
    } finally {
      await custom.api.close();
    }
  }

  // a retenção nova vale só para as trocas seguintes
  const studentId = await newStudent();
  await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));
  const t0 = await databaseNow(env.stack);
  await uploaded(await replacePhoto(reception, studentId, await jpegBytes()));
  const t1 = await databaseNow(env.stack);
  const [by30] = await versionRows(env.stack, studentId, t0, t1, 30);
  expect(by30).toMatchObject({ version: 1, in_window: true });

  const seven = await apiWith(env.stack, env.minio.env, { PHOTO_VERSION_RETENTION_DAYS: '7' });
  try {
    const t2 = await databaseNow(env.stack);
    await uploaded(await replacePhoto(seven.client, studentId, await jpegBytes()));
    const t3 = await databaseNow(env.stack);

    const rows = await versionRows(env.stack, studentId, t2, t3, 7);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.expires_at).toBe(by30!.expires_at);
    expect(rows[1]).toMatchObject({ version: 2, is_current: false, in_window: true });
    expect(await photoRowsText(env.stack, studentId)).toHaveLength(3);
  } finally {
    await seven.api.close();
  }
});
