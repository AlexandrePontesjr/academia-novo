import { type PhotoUrlResponse, problemSchema, type Role } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { startApi } from './support/app.ts';
import { auditCount, written } from './support/audit.ts';
import { AFTER_TURN, BEFORE_TURN } from './support/check-ins.ts';
import { createClient } from './support/client.ts';
import { bucketKeys, flakyStorage, jpegBytes, type PhotoStack, startPhotoStack, uploadPhoto } from './support/photos.ts';
import { clockAt, databaseNow, insertPlan, NOON } from './support/plans.ts';
import {
  ANONYMIZED_NAME,
  anonymizationPath,
  privacySnapshot,
  seedFullStudent,
  STUDENT_PERSONAL_COLUMNS,
  subjectRows,
} from './support/privacy.ts';
import { problem } from './support/stack.ts';
import { insertStaff } from './support/staff.ts';
import { cpfOf, insertStudents, releasedTogether, studentRow, unknownId } from './support/students.ts';

let env: PhotoStack;
let admin: Awaited<ReturnType<PhotoStack['stack']['session']>>;
let counter = 82_000;
const next = () => (counter += 1);
const FOREIGN = 'https://outro.example';
const HEADERS = { 'X-Forwarded-For': '203.0.113.9', 'User-Agent': 'teste-anonimizacao/1.0' };

beforeAll(async () => {
  env = await startPhotoStack();
  admin = await env.stack.session('admin');
}, 180_000);

afterAll(() => env?.close());

afterEach(() => {
  vi.useRealTimers();
});

const anonymize = (id: string, client = admin.client) => client.post(anonymizationPath(id));

/**
 * A chamada com o relógio da API em `NOON`, e só ela: o cliente S3 do teste corrige o próprio relógio
 * pelo do MinIO, e uma listagem do bucket feita com o relógio falso desviaria as seguintes.
 */
async function anonymizeAtNoon(id: string) {
  clockAt(NOON);
  try {
    return await anonymize(id);
  } finally {
    vi.useRealTimers();
  }
}

/** Um aluno só com os campos obrigatórios, na situação dada. */
async function bareStudent(status = 'inactive') {
  const n = next();
  const [id] = await insertStudents(env.stack, [{ name: `Aluno ${n}`, cpf: cpfOf(n), status }]);
  return id!;
}

/** Um período do aluno, com confirmação viva, desfeita ou nenhuma. */
async function period(
  studentId: string,
  { startsAt, endsAt, cancelled = false, payment = 'none' }: { startsAt: string; endsAt: string; cancelled?: boolean; payment?: 'alive' | 'voided' | 'none' },
) {
  const planId = await insertPlan(env.stack);
  const [row] = await env.stack.query<{ id: string }>(
    `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents, cancelled_at)
     values ($1, $2, $3, $4, 9990, case when $5 then now() end) returning id`,
    [studentId, planId, startsAt, endsAt, cancelled],
  );
  if (payment !== 'none') {
    await env.stack.query(`insert into payments (enrollment_id, voided_at) values ($1, case when $2 then now() end)`, [
      row!.id,
      payment === 'voided',
    ]);
  }
  return row!.id;
}

const auditTexts = async () =>
  (await env.stack.query<{ row: string }>('select to_jsonb(a)::text as row from audit_logs a order by id')).map((row) => row.row);

test('anonymize_204_clears_nine_fields_keeps_id_created_and_inactivated', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const before = (await studentRow(env.stack, subject.id))!;
  expect(STUDENT_PERSONAL_COLUMNS).toHaveLength(9);
  for (const column of STUDENT_PERSONAL_COLUMNS) expect(before[column], column).not.toBeNull();

  const t0 = await databaseNow(env.stack);
  const response = await anonymize(subject.id);
  const t1 = await databaseNow(env.stack);

  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  const after = (await studentRow(env.stack, subject.id))!;
  expect(after.name).toBe(ANONYMIZED_NAME);
  expect(after.status).toBe('inactive');
  for (const column of STUDENT_PERSONAL_COLUMNS) expect(after[column], column).toBeNull();
  expect(after.id).toBe(before.id);
  expect(after.created_at).toBe(before.created_at);
  expect(after.inactivated_at).toBe(before.inactivated_at);
  const anonymizedAt = new Date(after.anonymized_at as string).getTime();
  expect(anonymizedAt).toBeGreaterThanOrEqual(t0.getTime());
  expect(anonymizedAt).toBeLessThanOrEqual(t1.getTime());
});

test('anonymize_deletes_all_guardians_and_consents_of_the_student', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const count = async (table: string) =>
    Number((await env.stack.query<{ n: string }>(`select count(*) as n from ${table} where student_id = $1`, [subject.id]))[0]!.n);
  expect([await count('guardians'), await count('consents')]).toEqual([2, 2]);

  expect((await anonymize(subject.id)).status).toBe(204);

  expect(await count('guardians')).toBe(0);
  expect(await count('consents')).toBe(0);
});

test('anonymize_deletes_current_and_stored_photos_and_their_six_objects', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  expect(subject.keys).toHaveLength(6);

  expect((await anonymize(subject.id)).status).toBe(204);

  expect(await env.stack.query('select id from photos where student_id = $1', [subject.id])).toEqual([]);
  expect(await bucketKeys(env.minio, `photos/main/${subject.id}/`)).toEqual([]);
});

test('anonymize_keeps_enrollments_payments_and_check_ins_identical', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const before = await subjectRows(env.stack, subject.id);
  expect([before.enrollments.length, before.payments.length, before.check_ins.length]).toEqual([2, 2, 2]);

  expect((await anonymize(subject.id)).status).toBe(204);

  const after = await subjectRows(env.stack, subject.id);
  expect(after.enrollments).toEqual(before.enrollments);
  expect(after.payments).toEqual(before.payments);
  expect(after.check_ins).toEqual(before.check_ins);
});

test('cpf_of_anonymized_student_can_be_registered_again', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  expect((await anonymize(subject.id)).status).toBe(204);
  const { client } = await env.stack.session('reception');

  const response = await client.post('/api/students', { name: 'Nova Ficha', cpf: subject.cpf, birthDate: '1990-05-20', phone: '11912345678' });

  expect(response.status).toBe(201);
  expect(((await response.json()) as { cpf: string }).cpf).toBe(subject.cpf);
});

test('anonymize_writes_one_row_and_keeps_every_previous_audit_row', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  // linhas antigas do titular, para conferir que nenhuma muda
  await admin.client.get(`/api/students/${subject.id}/data-export`);
  const previous = await auditTexts();

  const { result, rows } = await written(env.stack, () => admin.client.post(anonymizationPath(subject.id), undefined, { headers: HEADERS }));

  expect(result.status).toBe(204);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: 'student.anonymized',
    entity: 'student',
    entity_id: subject.id,
    user_id: admin.user.id,
    ip: '203.0.113.9',
    user_agent: 'teste-anonimizacao/1.0',
    diff: null,
  });
  const after = await auditTexts();
  expect(after.filter((row) => previous.includes(row))).toEqual(previous);
  expect(after).toHaveLength(previous.length + 1);
});

test('active_and_suspended_are_409_subject_not_inactive_and_nothing_changes', async () => {
  for (const status of ['active', 'suspended']) {
    const id = await bareStudent(status);
    const before = await privacySnapshot(env.stack, env.minio);

    const response = await anonymize(id);

    expect(response.status, status).toBe(409);
    expect((await problem(response)).code, status).toBe('subject_not_inactive');
    expect(await privacySnapshot(env.stack, env.minio), status).toEqual(before);
  }
});

test('active_or_scheduled_period_is_409_open_periods_and_nothing_changes', async () => {
  const active = await bareStudent();
  await period(active, { startsAt: '2026-10-01', endsAt: '2026-10-30', payment: 'alive' });
  const scheduled = await bareStudent();
  await period(scheduled, { startsAt: '2026-10-20', endsAt: '2026-11-19', payment: 'alive' });

  for (const [label, id] of [
    ['active', active],
    ['scheduled', scheduled],
  ] as const) {
    const before = await privacySnapshot(env.stack, env.minio);
    const response = await anonymizeAtNoon(id);
    expect(response.status, label).toBe(409);
    expect((await problem(response)).code, label).toBe('subject_has_open_periods');
    expect(await privacySnapshot(env.stack, env.minio), label).toEqual(before);
  }
});

test('overdue_or_pending_period_is_409_open_periods_and_nothing_changes', async () => {
  const overdue = await bareStudent();
  await period(overdue, { startsAt: '2026-08-01', endsAt: '2026-08-31' });
  const pending = await bareStudent();
  await period(pending, { startsAt: '2026-10-07', endsAt: '2026-11-06' });

  for (const [label, id] of [
    ['overdue', overdue],
    ['pending', pending],
  ] as const) {
    const before = await privacySnapshot(env.stack, env.minio);
    const response = await anonymizeAtNoon(id);
    expect(response.status, label).toBe(409);
    expect((await problem(response)).code, label).toBe('subject_has_open_periods');
    expect(await privacySnapshot(env.stack, env.minio), label).toEqual(before);
  }
});

test('open_period_ends_at_the_sao_paulo_turn', async () => {
  const id = await bareStudent();
  await period(id, { startsAt: '2026-09-08', endsAt: '2026-10-07', payment: 'alive' });

  clockAt(BEFORE_TURN);
  const before = await anonymize(id);
  expect(before.status).toBe(409);
  expect((await problem(before)).code).toBe('subject_has_open_periods');

  clockAt(AFTER_TURN);
  expect((await anonymize(id)).status).toBe(204);
});

test('storage_failure_is_503_rolls_back_rows_and_retry_succeeds', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const proxy = await flakyStorage(env.minio.endpoint);
  const api = await startApi(env.stack.postgres.url, [], { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  try {
    const user = await env.stack.seed({ role: 'admin' });
    const client = await env.stack.signIn(user, createClient(api.url));
    await env.stack.query('update users set two_factor_enabled = true where id = $1', [user.id]);
    const rowsOf = async () => {
      const rows = await subjectRows(env.stack, subject.id);
      return { students: rows.students, guardians: rows.guardians, consents: rows.consents, photos: rows.photos, audit: await auditTexts() };
    };
    const before = await rowsOf();
    proxy.failDeleteOf = 'large';

    const failed = await client.post(anonymizationPath(subject.id));

    expect(failed.status).toBe(503);
    expect((await problem(failed)).code).toBe('storage_unavailable');
    expect(await rowsOf()).toEqual(before);

    // com o armazenamento de volta, a mesma chamada termina
    proxy.failDeleteOf = null;
    const retried = await client.post(anonymizationPath(subject.id));
    expect(retried.status).toBe(204);
    expect(await bucketKeys(env.minio, `photos/main/${subject.id}/`)).toEqual([]);
  } finally {
    await api.close();
    await proxy.stop();
  }
});

test('two_simultaneous_anonymizations_one_204_one_404_over_ten_rounds', async () => {
  for (let round = 1; round <= 10; round += 1) {
    const id = await bareStudent();

    const { result, rows } = await written(env.stack, () => releasedTogether([() => anonymize(id), () => anonymize(id)]));

    const statuses = result.map((response) => response.status).sort();
    expect(statuses, `rodada ${round}`).toEqual([204, 404]);
    const lost = result.find((response) => response.status === 404)!;
    expect((await problem(lost)).code, `rodada ${round}`).toBe('not_found');
    expect(rows.filter((row) => row.action === 'student.anonymized' && row.entity_id === id), `rodada ${round}`).toHaveLength(1);
  }
});

test('anonymize_and_photo_upload_together_leave_no_row_and_no_object_over_ten_rounds', async () => {
  const bytes = await jpegBytes();
  for (let round = 1; round <= 10; round += 1) {
    const id = await bareStudent();

    const [anonymized, uploadedPhoto] = await releasedTogether([() => anonymize(id), () => uploadPhoto(admin.client, id, bytes)]);

    expect(anonymized!.status, `rodada ${round}`).toBe(204);
    expect([201, 404], `rodada ${round}: ${uploadedPhoto!.status}`).toContain(uploadedPhoto!.status);
    expect(await env.stack.query('select id from photos where student_id = $1', [id]), `rodada ${round}`).toEqual([]);
    expect(await bucketKeys(env.minio, `photos/main/${id}/`), `rodada ${round}`).toEqual([]);
  }
});

test('anonymize_403_three_roles_401_anonymous_404_unknown_non_uuid_and_anonymized', async () => {
  const existing = await bareStudent();
  const sessions: Array<[Role, Awaited<ReturnType<PhotoStack['stack']['session']>>['client']]> = [];
  for (const role of ['reception', 'hr_finance', 'instructor'] as Role[]) sessions.push([role, (await env.stack.session(role)).client]);
  const before = await privacySnapshot(env.stack, env.minio);

  for (const [role, client] of sessions) {
    for (const id of [existing, unknownId()]) {
      const response = await anonymize(id, client);
      expect(response.status, `${role} ${id}`).toBe(403);
      expect((await problem(response)).code, `${role} ${id}`).toBe('forbidden');
    }
  }
  const anonymous = await anonymize(existing, env.stack.client());
  expect(anonymous.status).toBe(401);
  expect(await privacySnapshot(env.stack, env.minio)).toEqual(before);

  const done = await bareStudent();
  expect((await anonymize(done)).status).toBe(204);
  for (const id of [unknownId(), 'abc', done]) {
    const response = await anonymize(id);
    expect(response.status, id).toBe(404);
    expect((await problem(response)).code, id).toBe('not_found');
  }
});

test('anonymize_leaves_another_student_rows_and_objects_identical', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const neighbor = await seedFullStudent(env.stack, env.minio);
  const before = await subjectRows(env.stack, neighbor.id);
  expect(Object.values(before).map((rows) => rows.length)).toEqual([1, 2, 2, 2, 2, 2, 2]);
  expect(neighbor.keys).toHaveLength(6);

  expect((await anonymize(subject.id)).status).toBe(204);

  expect(await subjectRows(env.stack, neighbor.id)).toEqual(before);
  expect(await bucketKeys(env.minio, `photos/main/${neighbor.id}/`)).toEqual(neighbor.keys);
});

test('not_inactive_comes_before_open_periods', async () => {
  clockAt(NOON);
  const id = await bareStudent('active');
  await period(id, { startsAt: '2026-10-01', endsAt: '2026-10-30', payment: 'alive' });

  const response = await anonymize(id);

  expect(response.status).toBe(409);
  expect((await problem(response)).code).toBe('subject_not_inactive');
});

test('open_period_decision_table_eight_rows', async () => {
  clockAt(NOON);
  type Row = [label: string, setup: ((id: string) => Promise<unknown>) | null, status: 204 | 409];
  const rows: Row[] = [
    ['nenhum', null, 204],
    ['active, pago', (id) => period(id, { startsAt: '2026-10-01', endsAt: '2026-10-30', payment: 'alive' }), 409],
    ['scheduled, pago', (id) => period(id, { startsAt: '2026-10-20', endsAt: '2026-11-19', payment: 'alive' }), 409],
    ['expired, pago', (id) => period(id, { startsAt: '2026-08-01', endsAt: '2026-08-31', payment: 'alive' }), 204],
    ['expired, não pago (overdue)', (id) => period(id, { startsAt: '2026-08-01', endsAt: '2026-08-31' }), 409],
    ['cancelled, não pago', (id) => period(id, { startsAt: '2026-10-01', endsAt: '2026-10-30', cancelled: true }), 204],
    ['cancelled, agendado', (id) => period(id, { startsAt: '2026-10-20', endsAt: '2026-11-19', cancelled: true }), 204],
    ['expired, pagamento desfeito (overdue)', (id) => period(id, { startsAt: '2026-08-01', endsAt: '2026-08-31', payment: 'voided' }), 409],
  ];
  expect(rows).toHaveLength(8);

  for (const [label, setup, status] of rows) {
    const id = await bareStudent();
    if (setup) await setup(id);
    const response = await anonymize(id);
    expect(response.status, label).toBe(status);
    if (status === 409) expect((await problem(response)).code, label).toBe('subject_has_open_periods');
  }
});

test('foreign_origin_is_403_csrf_and_nothing_changes', async () => {
  const id = await bareStudent();
  const before = await privacySnapshot(env.stack, env.minio);

  const response = await admin.client.post(anonymizationPath(id), undefined, { origin: FOREIGN });

  expect(response.status).toBe(403);
  expect((await problem(response)).code).toBe('csrf_rejected');
  expect(await privacySnapshot(env.stack, env.minio)).toEqual(before);
});

test('signed_photo_url_issued_before_is_404_after', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const issued = await admin.client.get(`/api/students/${subject.id}/photo`);
  expect(issued.status).toBe(200);
  const { url } = (await issued.json()) as PhotoUrlResponse;
  expect((await fetch(`${env.stack.api.url}${url}`)).status).toBe(200);
  const before = await auditCount(env.stack);

  expect((await anonymize(subject.id)).status).toBe(204);

  // a URL ainda está dentro do `exp`, mas a foto não existe mais
  expect((await fetch(`${env.stack.api.url}${url}`)).status).toBe(404);
  expect(await auditCount(env.stack)).toBe(before + 1);
});

test('three_new_codes_are_problem_json_409', async () => {
  const active = await bareStudent('active');
  const open = await bareStudent();
  await period(open, { startsAt: '2026-08-01', endsAt: '2026-08-31' });
  const linkedUser = await env.stack.seed({ role: 'instructor' });
  const [linkedStaff] = await insertStaff(env.stack, [
    { name: `Funcionário Vinculado ${next()}`, cpf: cpfOf(counter), status: 'inactive', userId: linkedUser.id },
  ]);

  const cases: Array<[code: string, send: () => Promise<Response>]> = [
    ['subject_not_inactive', () => anonymize(active)],
    ['subject_has_open_periods', () => anonymizeAtNoon(open)],
    ['staff_user_linked', () => admin.client.post(`/api/staff/${linkedStaff}/anonymization`)],
  ];
  for (const [code, send] of cases) {
    const response = await send();
    expect(response.status, code).toBe(409);
    expect(response.headers.get('content-type'), code).toMatch(/^application\/problem\+json/);
    const body = await response.json();
    expect(problemSchema.safeParse(body).success, code).toBe(true);
    expect(body, code).toMatchObject({ status: 409, code });
  }
});
