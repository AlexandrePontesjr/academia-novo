import type { Role, StudentExport } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { startApi } from './support/app.ts';
import { auditCount, withAuditInsertFailing, written } from './support/audit.ts';
import { createClient } from './support/client.ts';
import { bucketObject, flakyStorage, type PhotoStack, startPhotoStack } from './support/photos.ts';
import { insertPlan } from './support/plans.ts';
import { exportPath, HEALTH_NOTES, privacySnapshot, seedFullStudent } from './support/privacy.ts';
import { problem } from './support/stack.ts';
import { cpfOf, insertStudents, unknownId } from './support/students.ts';

let env: PhotoStack;
let admin: Awaited<ReturnType<PhotoStack['stack']['session']>>;
let counter = 81_000;
const next = () => (counter += 1);

beforeAll(async () => {
  env = await startPhotoStack();
  admin = await env.stack.session('admin');
}, 180_000);

afterAll(() => env?.close());

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HEADERS = { 'X-Forwarded-For': '203.0.113.7', 'User-Agent': 'teste-exportacao/1.0' };

async function exported(id: string) {
  const response = await admin.client.get(exportPath(id));
  expect(response.status, `exportação de ${id}`).toBe(200);
  return (await response.json()) as StudentExport;
}

/** Um aluno só com os campos obrigatórios. */
async function bareStudent(status = 'active') {
  const n = next();
  const [id] = await insertStudents(env.stack, [{ name: `Aluno Mínimo ${n}`, cpf: cpfOf(n), status }]);
  return id!;
}

const instantOf = async (sql: string, values: unknown[]) =>
  (await env.stack.query<{ at: Date | null }>(sql, values))[0]!.at?.toISOString() ?? null;

test('student_export_200_attachment_no_store_and_ten_keys', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);

  const response = await admin.client.get(exportPath(subject.id));

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toMatch(/^application\/json/);
  expect(response.headers.get('content-disposition')).toBe(`attachment; filename="aluno-${subject.id}.json"`);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(
    ['formatVersion', 'exportedAt', 'subject', 'student', 'guardians', 'consents', 'enrollments', 'payments', 'checkIns', 'photos'].sort(),
  );
  expect(body.formatVersion).toBe(1);
  expect(body.subject).toBe('student');
});

test('student_has_fourteen_keys_decrypted_health_notes_and_nulls_when_absent', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const KEYS = [
    'id',
    'name',
    'cpf',
    'birthDate',
    'sex',
    'email',
    'phone',
    'address',
    'emergencyContactName',
    'emergencyContactPhone',
    'healthNotes',
    'status',
    'createdAt',
    'inactivatedAt',
  ];
  expect(KEYS).toHaveLength(14);

  const { student } = await exported(subject.id);
  expect(Object.keys(student).sort()).toEqual([...KEYS].sort());
  expect(student).toEqual({
    id: subject.id,
    name: subject.name,
    cpf: subject.cpf,
    birthDate: '1990-05-20',
    sex: 'female',
    email: (await env.stack.query<{ email: string }>('select email from students where id = $1', [subject.id]))[0]!.email,
    phone: subject.phone,
    address: 'Rua das Acácias, 120 - Centro',
    emergencyContactName: 'Maria da Penha',
    emergencyContactPhone: '1134567890',
    healthNotes: HEALTH_NOTES,
    status: 'inactive',
    createdAt: await instantOf('select created_at as at from students where id = $1', [subject.id]),
    inactivatedAt: await instantOf('select inactivated_at as at from students where id = $1', [subject.id]),
  });
  expect(student.inactivatedAt).not.toBeNull();

  // sem os campos opcionais, as chaves existem com `null`
  const bare = await bareStudent();
  const minimal = (await exported(bare)).student;
  expect(Object.keys(minimal).sort()).toEqual([...KEYS].sort());
  for (const key of ['sex', 'email', 'address', 'emergencyContactName', 'emergencyContactPhone', 'healthNotes', 'inactivatedAt'] as const) {
    expect(minimal[key], key).toBeNull();
  }
});

test('guardians_all_rows_and_consents_with_revoked_and_term_text', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);

  const body = await exported(subject.id);

  const guardians = await env.stack.query<{ id: string; name: string; cpf: string; phone: string; relationship: string; created_at: Date }>(
    'select id, name, cpf, phone, relationship, created_at from guardians where student_id = $1 order by id',
    [subject.id],
  );
  expect(guardians).toHaveLength(2);
  expect(body.guardians).toEqual(
    guardians.map((row) => ({ id: row.id, name: row.name, cpf: row.cpf, phone: row.phone, relationship: row.relationship, createdAt: row.created_at.toISOString() })),
  );
  for (const guardian of body.guardians) {
    expect(Object.keys(guardian).sort()).toEqual(['cpf', 'createdAt', 'id', 'name', 'phone', 'relationship']);
  }

  expect(body.consents).toHaveLength(2);
  const texts = await env.stack.query<{ purpose: string; text: string }>("select purpose, text from consent_terms where version = 1");
  const termOf = (purpose: string) => texts.find((term) => term.purpose === purpose)!.text;
  expect(body.consents).toEqual([
    {
      purpose: 'data_processing',
      termVersion: 1,
      termText: termOf('data_processing'),
      grantedBy: 'guardian',
      grantedAt: '2026-01-10T12:00:00.000Z',
      revokedAt: null,
    },
    {
      purpose: 'image_use',
      termVersion: 1,
      termText: termOf('image_use'),
      grantedBy: 'student',
      grantedAt: '2026-01-11T12:00:00.000Z',
      revokedAt: '2026-02-01T12:00:00.000Z',
    },
  ]);
  for (const consent of body.consents) {
    expect(Object.keys(consent).sort()).toEqual(['grantedAt', 'grantedBy', 'purpose', 'revokedAt', 'termText', 'termVersion']);
  }
});

test('enrollments_payments_and_check_ins_all_rows_without_who_registered', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  // o nome do plano é o de agora
  const renamed = await admin.client.patch(`/api/plans/${subject.planId}`, { name: 'Plano Renomeado' });
  expect(renamed.status).toBe(200);

  const body = await exported(subject.id);

  expect(body.enrollments).toEqual([
    { id: subject.paidEnrollmentId, planName: 'Plano Renomeado', startsAt: '2026-08-01', endsAt: '2026-08-31', priceCents: 9990, cancelledAt: null },
    {
      id: subject.cancelledEnrollmentId,
      planName: 'Plano Renomeado',
      startsAt: '2026-09-01',
      endsAt: '2026-09-30',
      priceCents: 9990,
      cancelledAt: '2026-08-20T12:00:00.000Z',
    },
  ]);
  for (const enrollment of body.enrollments) {
    expect(Object.keys(enrollment).sort()).toEqual(['cancelledAt', 'endsAt', 'id', 'planName', 'priceCents', 'startsAt']);
  }

  // a confirmação desfeita e a viva, do período pago
  expect(body.payments).toEqual([
    { startsAt: '2026-08-01', createdAt: '2026-08-01T13:00:00.000Z', voidedAt: '2026-08-01T14:00:00.000Z' },
    { startsAt: '2026-08-01', createdAt: '2026-08-02T13:00:00.000Z', voidedAt: null },
  ]);
  for (const payment of body.payments) expect(Object.keys(payment).sort()).toEqual(['createdAt', 'startsAt', 'voidedAt']);

  expect(body.checkIns).toEqual([
    { day: '2026-08-05', checkedInAt: '2026-08-05T12:00:00.000Z' },
    { day: '2026-08-06', checkedInAt: '2026-08-06T12:00:00.000Z' },
  ]);
  for (const checkIn of body.checkIns) expect(Object.keys(checkIn).sort()).toEqual(['checkedInAt', 'day']);
});

test('photos_current_and_stored_with_large_bytes_equal_to_bucket_object', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);

  const { photos } = await exported(subject.id);

  expect(photos).toHaveLength(2);
  const rows = await env.stack.query<{ id: string; version: number; is_current: boolean; created_at: Date; expires_at: Date | null }>(
    'select id, version, is_current, created_at, expires_at from photos where student_id = $1 order by version',
    [subject.id],
  );
  for (const [index, photo] of photos.entries()) {
    const row = rows[index]!;
    expect(Object.keys(photo).sort()).toEqual(['createdAt', 'expiresAt', 'image', 'isCurrent', 'version']);
    expect(photo).toMatchObject({
      version: row.version,
      isCurrent: row.is_current,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at?.toISOString() ?? null,
    });
    expect(photo.image.startsWith('data:image/webp;base64,')).toBe(true);
    const bytes = Buffer.from(photo.image.slice('data:image/webp;base64,'.length), 'base64');
    const stored = await bucketObject(env.minio, `photos/main/${subject.id}/${row.id}/large.webp`);
    expect(bytes.equals(stored), `foto ${row.version}`).toBe(true);
    expect(bytes.equals(subject.largeBytes[index]!), `foto ${row.version}`).toBe(true);
  }
  // a guardada e a corrente, com bytes diferentes
  expect(photos.map((photo) => photo.isCurrent)).toEqual([false, true]);
  expect(photos[0]!.image).not.toBe(photos[1]!.image);
});

test('six_empty_collections_are_empty_arrays', async () => {
  const body = await exported(await bareStudent());

  for (const key of ['guardians', 'consents', 'enrollments', 'payments', 'checkIns', 'photos'] as const) {
    expect(body[key], key).toEqual([]);
  }
});

test('export_writes_one_student_exported_row_with_actor_ip_user_agent_and_null_diff', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);

  const { result, rows } = await written(env.stack, () => admin.client.get(exportPath(subject.id), { headers: HEADERS }));

  expect(result.status).toBe(200);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: 'student.exported',
    entity: 'student',
    entity_id: subject.id,
    user_id: admin.user.id,
    ip: '203.0.113.7',
    user_agent: 'teste-exportacao/1.0',
    diff: null,
  });
});

test('audit_failure_is_500_without_any_student_data', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);

  const response = await withAuditInsertFailing(env.stack, () => admin.client.get(exportPath(subject.id)));

  const text = await response.text();
  expect(response.status).toBe(500);
  expect((JSON.parse(text) as { code: string }).code).toBe('internal_error');
  for (const secret of [subject.name, subject.cpf, HEALTH_NOTES]) expect(text, secret).not.toContain(secret);
});

test('storage_down_is_503_without_audit_row', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const proxy = await flakyStorage(env.minio.endpoint);
  const api = await startApi(env.stack.postgres.url, [], { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  try {
    const user = await env.stack.seed({ role: 'admin' });
    const client = await env.stack.signIn(user, createClient(api.url));
    await env.stack.query('update users set two_factor_enabled = true where id = $1', [user.id]);
    proxy.down = true;
    const before = await auditCount(env.stack);

    const response = await client.get(exportPath(subject.id));

    expect(response.status).toBe(503);
    expect((await problem(response)).code).toBe('storage_unavailable');
    expect(await auditCount(env.stack)).toBe(before);
  } finally {
    await api.close();
    await proxy.stop();
  }
});

test('export_403_three_roles_401_anonymous_404_unknown_and_non_uuid', async () => {
  const subject = await bareStudent();
  const sessions: Array<[Role, Awaited<ReturnType<PhotoStack['stack']['session']>>['client']]> = [];
  for (const role of ['reception', 'hr_finance', 'instructor'] as Role[]) sessions.push([role, (await env.stack.session(role)).client]);
  // depois dos logins, que gravam a própria linha
  const before = await auditCount(env.stack);

  for (const [role, client] of sessions) {
    for (const id of [subject, unknownId()]) {
      const response = await client.get(exportPath(id));
      expect(response.status, `${role} ${id}`).toBe(403);
      expect((await problem(response)).code, `${role} ${id}`).toBe('forbidden');
    }
  }
  const anonymous = await env.stack.client().get(exportPath(subject));
  expect(anonymous.status).toBe(401);
  expect((await problem(anonymous)).code).toBe('unauthorized');
  for (const id of [unknownId(), 'abc']) {
    const response = await admin.client.get(exportPath(id));
    expect(response.status, id).toBe(404);
    expect((await problem(response)).code, id).toBe('not_found');
  }
  expect(await auditCount(env.stack)).toBe(before);
});

test('export_changes_no_row_and_no_object', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const before = await privacySnapshot(env.stack, env.minio);

  await exported(subject.id);

  const after = await privacySnapshot(env.stack, env.minio);
  expect(after.tables).toEqual(before.tables);
  expect(after.keys).toEqual(before.keys);
  expect(after.audit).toBe(before.audit + 1);
});

test('export_dates_instants_and_collection_order', async () => {
  // um aluno cujas linhas entram na ordem inversa da que a exportação usa, com empates decididos pelo `id`
  const id = await bareStudent('inactive');
  const ids = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix}-7000-8000-${String(index + 1).padStart(12, '0')}`);
  const [g1, g2] = ids('01900000-0000', 2);
  for (const guardianId of [g2, g1]) {
    await env.stack.query(
      `insert into guardians (id, student_id, name, cpf, phone, relationship) values ($1, $2, 'Responsável', '52998224725', '11912345678', 'other')`,
      [guardianId, id],
    );
  }
  const [c1, c2, c3] = ids('01900000-0001', 3);
  // c3 é o mais recente; c1 e c2 empatam no instante e saem pelo `id`, que a finalidade deixa ver
  for (const [consentId, purpose, grantedAt] of [
    [c3, 'image_use', '2026-03-01T12:00:00Z'],
    [c2, 'image_use', '2026-02-01T12:00:00Z'],
    [c1, 'data_processing', '2026-02-01T12:00:00Z'],
  ]) {
    await env.stack.query(
      `insert into consents (id, student_id, purpose, term_version, granted_by, granted_at, revoked_at)
       values ($1, $2, $3, 1, 'student', $4, $4::timestamptz + interval '1 day')`,
      [consentId, id, purpose, grantedAt],
    );
  }
  const planId = await insertPlan(env.stack, { name: 'Plano da Ordem' });
  const [e1, e2, e3] = ids('01900000-0002', 3);
  for (const [enrollmentId, startsAt] of [
    [e3, '2026-06-01'],
    [e2, '2026-05-01'],
    [e1, '2026-05-01'],
  ]) {
    await env.stack.query(
      `insert into enrollments (id, student_id, plan_id, starts_at, ends_at, price_cents, cancelled_at)
       values ($1, $2, $3, $4, $4::date + 29, 9990, '2026-04-20T12:00:00Z')`,
      [enrollmentId, id, planId, startsAt],
    );
  }
  const [p1, p2, p3] = ids('01900000-0003', 3);
  // p1 e p2 empatam no instante e saem pelo `id`, que o instante do desfazimento deixa ver
  for (const [paymentId, createdAt, voidedAt] of [
    [p3, '2026-05-03T12:00:00Z', '2026-05-03T13:00:00Z'],
    [p2, '2026-05-02T12:00:00Z', '2026-05-02T14:00:00Z'],
    [p1, '2026-05-02T12:00:00Z', '2026-05-02T13:00:00Z'],
  ]) {
    await env.stack.query(`insert into payments (id, enrollment_id, created_at, voided_at) values ($1, $2, $3, $4)`, [
      paymentId,
      e1,
      createdAt,
      voidedAt,
    ]);
  }
  const author = await env.stack.seed({ role: 'reception' });
  for (const day of ['2026-05-07', '2026-05-06']) {
    await env.stack.query(`insert into check_ins (student_id, day, checked_in_by) values ($1, $2, $3)`, [id, day, author.id]);
  }
  await env.stack.query(`insert into photos (student_id, version, is_current) values ($1, 2, true)`, [id]);
  await env.stack.query(`insert into photos (student_id, version, is_current, expires_at) values ($1, 1, false, now() + interval '30 days')`, [id]);
  const photoIds = await env.stack.query<{ id: string }>('select id from photos where student_id = $1 order by version', [id]);
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  for (const { id: photoId } of photoIds) {
    await env.minio.client.send(
      new PutObjectCommand({ Bucket: env.minio.bucket, Key: `photos/main/${id}/${photoId}/large.webp`, Body: Buffer.from('foto'), ContentType: 'image/webp' }),
    );
  }

  const t0 = Date.now();
  const body = await exported(id);
  const t1 = Date.now();

  expect(body.exportedAt).toMatch(ISO_INSTANT);
  expect(Date.parse(body.exportedAt)).toBeGreaterThanOrEqual(t0);
  expect(Date.parse(body.exportedAt)).toBeLessThanOrEqual(t1);

  expect(body.student.birthDate).toMatch(DAY);
  expect(body.student.createdAt).toMatch(ISO_INSTANT);
  expect(body.student.inactivatedAt).toMatch(ISO_INSTANT);
  for (const enrollment of body.enrollments) {
    expect(enrollment.startsAt).toMatch(DAY);
    expect(enrollment.endsAt).toMatch(DAY);
    expect(enrollment.cancelledAt).toMatch(ISO_INSTANT);
  }
  for (const consent of body.consents) {
    expect(consent.grantedAt).toMatch(ISO_INSTANT);
    expect(consent.revokedAt).toMatch(ISO_INSTANT);
  }
  for (const payment of body.payments) {
    expect(payment.startsAt).toMatch(DAY);
    expect(payment.createdAt).toMatch(ISO_INSTANT);
    expect(payment.voidedAt).toMatch(ISO_INSTANT);
  }
  for (const checkIn of body.checkIns) {
    expect(checkIn.day).toMatch(DAY);
    expect(checkIn.checkedInAt).toMatch(ISO_INSTANT);
  }
  for (const guardian of body.guardians) expect(guardian.createdAt).toMatch(ISO_INSTANT);
  for (const photo of body.photos) {
    expect(photo.createdAt).toMatch(ISO_INSTANT);
    if (photo.expiresAt !== null) expect(photo.expiresAt).toMatch(ISO_INSTANT);
  }
  expect(body.photos.find((photo) => !photo.isCurrent)!.expiresAt).toMatch(ISO_INSTANT);

  // a ordem de cada coleção, escrita à mão
  expect(body.guardians.map((guardian) => guardian.id)).toEqual([g1, g2]);
  expect(body.consents.map((consent) => [consent.purpose, consent.grantedAt])).toEqual([
    ['data_processing', '2026-02-01T12:00:00.000Z'],
    ['image_use', '2026-02-01T12:00:00.000Z'],
    ['image_use', '2026-03-01T12:00:00.000Z'],
  ]);
  expect(body.enrollments.map((enrollment) => enrollment.id)).toEqual([e1, e2, e3]);
  expect(body.payments.map((payment) => [payment.createdAt, payment.voidedAt])).toEqual([
    ['2026-05-02T12:00:00.000Z', '2026-05-02T13:00:00.000Z'],
    ['2026-05-02T12:00:00.000Z', '2026-05-02T14:00:00.000Z'],
    ['2026-05-03T12:00:00.000Z', '2026-05-03T13:00:00.000Z'],
  ]);
  expect(body.checkIns.map((checkIn) => checkIn.day)).toEqual(['2026-05-06', '2026-05-07']);
  expect(body.photos.map((photo) => photo.version)).toEqual([1, 2]);
});

test('two_exports_two_audit_rows', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);

  const { rows } = await written(env.stack, async () => {
    await exported(subject.id);
    await exported(subject.id);
  });

  expect(rows.map((row) => [row.action, row.entity_id])).toEqual([
    ['student.exported', subject.id],
    ['student.exported', subject.id],
  ]);
});

test('export_contains_no_row_of_another_student', async () => {
  const subject = await seedFullStudent(env.stack, env.minio);
  const neighbor = await seedFullStudent(env.stack, env.minio);

  const body = await exported(subject.id);

  const text = JSON.stringify(body);
  const neighborIds = [
    neighbor.id,
    ...neighbor.guardianIds,
    ...neighbor.consentIds,
    neighbor.paidEnrollmentId,
    neighbor.cancelledEnrollmentId,
    neighbor.alivePaymentId,
    neighbor.voidedPaymentId,
    ...neighbor.checkInIds,
    ...neighbor.photoIds,
  ];
  expect(neighborIds).toHaveLength(13);
  for (const neighborId of neighborIds) expect(text, neighborId).not.toContain(neighborId);
  expect(text).not.toContain(neighbor.cpf);
  expect(text).not.toContain(neighbor.name);
  // cada coleção traz exatamente as linhas do titular
  expect(body.guardians.map((guardian) => guardian.id).sort()).toEqual([...subject.guardianIds].sort());
  expect(body.enrollments.map((enrollment) => enrollment.id).sort()).toEqual(
    [subject.paidEnrollmentId, subject.cancelledEnrollmentId].sort(),
  );
  expect([body.consents.length, body.payments.length, body.checkIns.length, body.photos.length]).toEqual([2, 2, 2, 2]);
  for (const [index, photo] of body.photos.entries()) {
    expect(Buffer.from(photo.image.slice('data:image/webp;base64,'.length), 'base64').equals(subject.largeBytes[index]!)).toBe(true);
  }
});
