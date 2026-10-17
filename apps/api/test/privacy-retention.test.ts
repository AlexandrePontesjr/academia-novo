import { afterEach, beforeAll, afterAll, expect, test, vi } from 'vitest';
import { startApi } from './support/app.ts';
import { auditRows, written } from './support/audit.ts';
import { captureOutput } from './support/log.ts';
import { bucketKeys, flakyStorage, type PhotoStack, startPhotoStack } from './support/photos.ts';
import { clockAt, databaseNow, insertPlan } from './support/plans.ts';
import {
  ANONYMIZED_NAME,
  anonymizationPath,
  privacySnapshot,
  seedFullStudent,
  STUDENT_PERSONAL_COLUMNS,
  subjectRows,
} from './support/privacy.ts';
import {
  cpfOf,
  createStudent,
  insertStudents,
  releasedTogether,
  studentBody,
  studentRow,
  studentRowText,
} from './support/students.ts';

let env: PhotoStack;
let admin: Awaited<ReturnType<PhotoStack['stack']['session']>>;
let counter = 85_000;
const next = () => (counter += 1);
const HOUR = 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  env = await startPhotoStack();
  admin = await env.stack.session('admin');
}, 180_000);

afterAll(() => env?.close());

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // o que um teste deixou vencido não vence no seguinte, e a retenção volta a desligada
  await env.stack.query(`update students set inactivated_at = now() where status = 'inactive' and anonymized_at is null`);
  await setYears(null);
});

async function setYears(years: number | null) {
  await env.stack.query('update privacy_settings set inactive_student_retention_years = $1', [years]);
}

/** Um aluno `inactive` só com os campos obrigatórios, inativado no instante dado (por SQL). */
async function inactiveSince(instant: string) {
  const n = next();
  const [id] = await insertStudents(env.stack, [{ name: `Inativo ${n}`, cpf: cpfOf(n), status: 'inactive' }]);
  await env.stack.query('update students set inactivated_at = $2 where id = $1', [id, instant]);
  return id!;
}

/** O titular completo, inativado no instante dado. */
async function fullInactiveSince(instant: string) {
  const subject = await seedFullStudent(env.stack, env.minio);
  await env.stack.query('update students set inactivated_at = $2 where id = $1', [subject.id, instant]);
  return subject;
}

/** Um período vencido e não pago (`overdue`): período em aberto. */
async function overduePeriod(studentId: string) {
  const planId = await insertPlan(env.stack);
  await env.stack.query(
    `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents) values ($1, $2, '2026-08-01', '2026-08-31', 9990)`,
    [studentId, planId],
  );
}

/** Uma execução da retenção com o relógio da API no instante dado, e só ela. */
async function runAt(instant: string) {
  clockAt(instant);
  try {
    await env.stack.api.retention();
  } finally {
    vi.useRealTimers();
  }
}

const isAnonymized = async (id: string) => (await studentRow(env.stack, id))!.anonymized_at !== null;
const anonymizedRowsOf = async (id: string) =>
  (await auditRows(env.stack)).filter((row) => row.action === 'student.anonymized' && row.entity_id === id);

/** As linhas de log (JSON) escritas com a `msg` dada. */
const logged = (output: { text(): string }, msg: string) =>
  output
    .text()
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line.msg === msg);

/** Espera, pelo relógio de verdade, até `check` valer. */
async function until(check: () => Promise<boolean> | boolean, name: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(`não aconteceu em ${timeoutMs} ms: ${name}`);
}

test('inactivated_at_set_on_inactivation_cleared_on_leaving_and_kept_on_other_edits', async () => {
  const { id } = await createStudent(admin.client, studentBody(next()));
  const inactivatedAt = async () => (await studentRow(env.stack, id))!.inactivated_at as string | null;
  expect(await inactivatedAt()).toBeNull();

  let t0 = await databaseNow(env.stack);
  expect((await admin.client.delete(`/api/students/${id}`)).status).toBe(204);
  let t1 = await databaseNow(env.stack);
  const first = new Date((await inactivatedAt())!);
  expect(first.getTime()).toBeGreaterThanOrEqual(t0.getTime());
  expect(first.getTime()).toBeLessThanOrEqual(t1.getTime());

  // sair de `inactive` limpa o instante
  expect((await admin.client.patch(`/api/students/${id}`, { status: 'active' })).status).toBe(200);
  expect(await inactivatedAt()).toBeNull();

  // a nova inativação grava um instante novo, depois do primeiro (o `PATCH` não inativa: a rota é o `DELETE`)
  const refused = await admin.client.patch(`/api/students/${id}`, { status: 'inactive' });
  expect(refused.status).toBe(422);
  expect(await inactivatedAt()).toBeNull();
  t0 = await databaseNow(env.stack);
  expect((await admin.client.delete(`/api/students/${id}`)).status).toBe(204);
  t1 = await databaseNow(env.stack);
  const second = new Date((await inactivatedAt())!);
  expect(second.getTime()).toBeGreaterThan(first.getTime());
  expect(second.getTime()).toBeGreaterThanOrEqual(t0.getTime());
  expect(second.getTime()).toBeLessThanOrEqual(t1.getTime());

  // mudar só o telefone de um inativo não mexe no instante
  expect((await admin.client.patch(`/api/students/${id}`, { phone: '11987654321' })).status).toBe(200);
  expect(new Date((await inactivatedAt())!).getTime()).toBe(second.getTime());

  // ir para `suspended` também limpa
  expect((await admin.client.patch(`/api/students/${id}`, { status: 'suspended' })).status).toBe(200);
  expect(await inactivatedAt()).toBeNull();
});

test('retention_off_anonymizes_nobody', async () => {
  await fullInactiveSince('2000-01-01T00:00:00Z');
  await setYears(null);
  const before = await privacySnapshot(env.stack, env.minio);

  await runAt('2030-01-01T00:00:00Z');

  expect(await privacySnapshot(env.stack, env.minio)).toEqual(before);
});

test('anonymizes_exactly_at_n_years_with_full_effect', async () => {
  const subject = await fullInactiveSince('2024-10-07T15:00:00Z');
  await setYears(2);
  const before = await subjectRows(env.stack, subject.id);

  await runAt('2026-10-07T14:59:59Z');

  expect(await subjectRows(env.stack, subject.id)).toEqual(before);
  expect(await bucketKeys(env.minio, `photos/main/${subject.id}/`)).toEqual(subject.keys);

  await runAt('2026-10-07T15:00:00Z');

  const row = (await studentRow(env.stack, subject.id))!;
  expect(row.name).toBe(ANONYMIZED_NAME);
  expect(row.status).toBe('inactive');
  for (const column of STUDENT_PERSONAL_COLUMNS) expect(row[column], column).toBeNull();
  expect(row.anonymized_at).not.toBeNull();
  const after = await subjectRows(env.stack, subject.id);
  expect(after.guardians).toEqual([]);
  expect(after.consents).toEqual([]);
  expect(after.photos).toEqual([]);
  expect(await bucketKeys(env.minio, `photos/main/${subject.id}/`)).toEqual([]);
  expect(after.enrollments).toEqual(before.enrollments);
  expect(after.payments).toEqual(before.payments);
  expect(after.check_ins).toEqual(before.check_ins);
  expect([after.enrollments.length, after.payments.length, after.check_ins.length]).toEqual([2, 2, 2]);
});

test('retention_audit_row_has_no_actor', async () => {
  const id = await inactiveSince('2020-01-01T00:00:00Z');
  await setYears(1);

  const { rows } = await written(env.stack, () => env.stack.api.retention());

  const own = rows.filter((row) => row.entity_id === id);
  expect(own).toHaveLength(1);
  expect(own[0]).toMatchObject({
    action: 'student.anonymized',
    entity: 'student',
    entity_id: id,
    user_id: null,
    ip: null,
    user_agent: null,
    diff: null,
  });
});

test('open_period_student_skipped_and_others_anonymized', async () => {
  const first = await inactiveSince('2020-01-01T00:00:00Z');
  const middle = await inactiveSince('2020-01-01T00:00:00Z');
  await overduePeriod(middle);
  const last = await inactiveSince('2020-01-01T00:00:00Z');
  await setYears(1);
  const before = await subjectRows(env.stack, middle);

  await env.stack.api.retention();

  expect(await isAnonymized(first)).toBe(true);
  expect(await isAnonymized(last)).toBe(true);
  expect(await subjectRows(env.stack, middle)).toEqual(before);
});

test('active_and_suspended_never_anonymized_by_retention', async () => {
  const ids: string[] = [];
  for (const status of ['active', 'suspended']) {
    const n = next();
    const [id] = await insertStudents(env.stack, [{ name: `Antigo ${n}`, cpf: cpfOf(n), status }]);
    await env.stack.query(`update students set created_at = now() - interval '10 years', updated_at = now() - interval '10 years' where id = $1`, [id]);
    ids.push(id!);
  }
  await setYears(1);
  const before = await Promise.all(ids.map((id) => studentRowText(env.stack, id)));

  await env.stack.api.retention();

  expect(await Promise.all(ids.map((id) => studentRowText(env.stack, id)))).toEqual(before);
});

test('storage_failure_on_one_student_keeps_it_and_anonymizes_the_next', async () => {
  const proxy = await flakyStorage(env.minio.endpoint);
  const flaky = await startApi(env.stack.postgres.url, [], { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  try {
    const first = await fullInactiveSince('2020-01-01T00:00:00Z');
    const second = await fullInactiveSince('2020-01-01T00:00:00Z');
    const before = await subjectRows(env.stack, first.id);
    proxy.failDeleteUnder = first.id;
    await setYears(1);

    await expect(flaky.retention()).resolves.toBeUndefined();

    expect(await subjectRows(env.stack, first.id)).toEqual(before);
    expect(await bucketKeys(env.minio, `photos/main/${first.id}/`)).toEqual(first.keys);
    expect(await isAnonymized(second.id)).toBe(true);
    expect(await bucketKeys(env.minio, `photos/main/${second.id}/`)).toEqual([]);
    expect((await fetch(`${flaky.url}/health`)).status).toBe(200);
  } finally {
    await flaky.close();
    await proxy.stop();
  }
});

test('retention_runs_on_startup_every_60_minutes_survives_failure_and_stops_on_close', async () => {
  // na subida: uma API nova anonimiza o vencido sem nenhuma requisição
  const atStartup = await inactiveSince('2020-01-01T00:00:00Z');
  await setYears(1);
  const second = await startApi(env.stack.postgres.url, [], env.minio.env);
  try {
    await until(() => isAnonymized(atStartup), 'o vencido ser anonimizado na subida');
  } finally {
    await second.close();
  }

  // o temporizador do teste: só as funções que a retenção usa; `Date` e o resto do tempo correm
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const api = await startApi(env.stack.postgres.url, [], env.minio.env);
  const output = captureOutput();
  let closed = false;
  try {
    // a execução da subida termina antes de o primeiro vencido existir
    await sleep(1000);
    const first = await inactiveSince('2020-01-01T00:00:00Z');
    vi.advanceTimersByTime(HOUR - 1000);
    await sleep(1500);
    expect(await isAnonymized(first), '59 min 59 s').toBe(false);
    vi.advanceTimersByTime(1000);
    await until(() => isAnonymized(first), 'o primeiro vencido sair aos 60 minutos');

    const secondDue = await inactiveSince('2020-01-01T00:00:00Z');
    vi.advanceTimersByTime(HOUR);
    await until(() => isAnonymized(secondDue), 'o segundo vencido sair depois de mais 60 minutos');

    // uma execução que lança (a configuração ilegível) não impede a seguinte
    const third = await inactiveSince('2020-01-01T00:00:00Z');
    await env.stack.query('alter table privacy_settings rename column inactive_student_retention_years to retention_years_hidden');
    try {
      vi.advanceTimersByTime(HOUR);
      await until(() => logged(output, 'retention failed').length >= 1, 'a execução com a configuração ilegível falhar');
    } finally {
      await env.stack.query('alter table privacy_settings rename column retention_years_hidden to inactive_student_retention_years');
    }
    expect(await isAnonymized(third)).toBe(false);
    vi.advanceTimersByTime(HOUR);
    await until(() => isAnonymized(third), 'o terceiro vencido sair na execução seguinte à que falhou');

    // os dois temporizadores do processo, o do expurgo de fotos e o da retenção; fechada a API, nenhum
    expect(vi.getTimerCount()).toBe(2);
    await api.close();
    closed = true;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    if (!closed) await api.close();
  }
}, 120_000);

test('one_log_line_with_counts_no_identifiers_and_error_line_without_details', async () => {
  const anonymized = await inactiveSince('2020-01-01T00:00:00Z');
  const skipped = await inactiveSince('2020-01-01T00:00:00Z');
  await overduePeriod(skipped);
  const identifiers = async (id: string) => {
    const row = (await env.stack.query<{ name: string; cpf: string | null }>('select name, cpf from students where id = $1', [id]))[0]!;
    return [id, row.name, ...(row.cpf ? [row.cpf] : [])];
  };
  const secrets = [...(await identifiers(anonymized)), ...(await identifiers(skipped))];
  await setYears(1);
  const output = captureOutput();

  await env.stack.api.retention();

  const lines = logged(output, 'retention applied');
  const raw = output
    .text()
    .split('\n')
    .filter((line) => line.includes('retention applied'));
  vi.restoreAllMocks();
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ level: 'info', msg: 'retention applied', anonymized: 1, skipped: 1 });
  for (const secret of secrets) expect(raw[0], secret).not.toContain(secret);

  // sem vencidos, nenhuma linha
  await env.stack.query('update students set inactivated_at = now() where id = $1', [skipped]);
  const quiet = captureOutput();
  await env.stack.api.retention();
  const quietLines = quiet.text().split('\n').filter((line) => line.includes('"msg":"retention'));
  vi.restoreAllMocks();
  expect(quietLines).toEqual([]);

  // uma falha de armazenamento: uma linha de erro sem o texto do erro e sem chave de objeto
  await setYears(null);
  const proxy = await flakyStorage(env.minio.endpoint);
  const flaky = await startApi(env.stack.postgres.url, [], { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  try {
    const subject = await fullInactiveSince('2020-01-01T00:00:00Z');
    await setYears(1);
    proxy.failDeleteUnder = subject.id;
    const failing = captureOutput();
    await flaky.retention();
    const errorLines = failing
      .text()
      .split('\n')
      .filter((line) => line.startsWith('{') && line.includes('"level":"error"'));
    vi.restoreAllMocks();
    expect(errorLines).toHaveLength(1);
    expect(JSON.parse(errorLines[0]!)).toMatchObject({ level: 'error' });
    for (const detail of ['photos/main', 'InternalError', 'storage_unavailable', subject.id, subject.name, subject.cpf]) {
      expect(errorLines[0], detail).not.toContain(detail);
    }
  } finally {
    await flaky.close();
    await proxy.stop();
  }
});

test('twenty_years_bound_anonymizes_exactly_at_twenty', async () => {
  const id = await inactiveSince('2006-10-07T15:00:00Z');
  await setYears(20);

  await runAt('2026-10-07T14:59:59Z');
  expect(await isAnonymized(id)).toBe(false);

  await runAt('2026-10-07T15:00:00Z');
  expect(await isAnonymized(id)).toBe(true);
});

test('leap_day_plus_one_year_is_february_28', async () => {
  const id = await inactiveSince('2024-02-29T15:00:00Z');
  await setYears(1);

  await runAt('2025-02-28T14:59:59Z');
  expect(await isAnonymized(id)).toBe(false);

  await runAt('2025-02-28T15:00:00Z');
  expect(await isAnonymized(id)).toBe(true);
});

test('retention_compares_with_api_clock', async () => {
  const n = next();
  // inativado agora pelo relógio do banco, que segue no dia real
  const [id] = await insertStudents(env.stack, [{ name: `Inativo de Hoje ${n}`, cpf: cpfOf(n), status: 'inactive' }]);
  await setYears(5);

  await env.stack.api.retention();
  expect(await isAnonymized(id!)).toBe(false);

  await runAt('2040-01-01T00:00:00Z');
  expect(await isAnonymized(id!)).toBe(true);
});

test('two_instances_anonymize_each_student_once_over_ten_rounds', async () => {
  const other = await startApi(env.stack.postgres.url, [], env.minio.env);
  try {
    await setYears(1);
    for (let round = 1; round <= 10; round += 1) {
      const ids = [
        await inactiveSince('2020-01-01T00:00:00Z'),
        await inactiveSince('2020-01-01T00:00:00Z'),
        await inactiveSince('2020-01-01T00:00:00Z'),
      ];
      const output = captureOutput();

      await releasedTogether([() => env.stack.api.retention(), () => other.retention()]);

      const lines = logged(output, 'retention applied');
      vi.restoreAllMocks();
      for (const id of ids) {
        expect(await isAnonymized(id), `rodada ${round}`).toBe(true);
        expect(await anonymizedRowsOf(id), `rodada ${round}`).toHaveLength(1);
      }
      expect(lines.reduce((sum, line) => sum + (line.anonymized as number), 0), `rodada ${round}`).toBe(ids.length);
    }
  } finally {
    await other.close();
  }
});

test('retention_and_request_together_anonymize_once_over_ten_rounds', async () => {
  await setYears(1);
  for (let round = 1; round <= 10; round += 1) {
    const id = await inactiveSince('2020-01-01T00:00:00Z');

    const [, response] = await releasedTogether<unknown>([
      () => env.stack.api.retention(),
      () => admin.client.post(anonymizationPath(id)),
    ]);

    expect([204, 404], `rodada ${round}`).toContain((response as Response).status);
    expect(await anonymizedRowsOf(id), `rodada ${round}`).toHaveLength(1);
  }
});
