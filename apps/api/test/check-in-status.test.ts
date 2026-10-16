import type { CheckInStatus, OpenPaymentsResponse, Role } from '@academia/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import {
  AFTER_TURN,
  BEFORE_TURN,
  STATUS_KEYS,
  checkInSnapshot,
  insertCheckIn,
  readStatus,
  registerCheckIn,
  sessionAt,
  statusPath,
} from './support/check-ins.ts';
import type { Client } from './support/client.ts';
import { BLUE, jpegBytes, type PhotoStack, RED, isBlue, isRed, replacePhoto, startPhotoStack, uploadPhoto, uploaded } from './support/photos.ts';
import { NOON, clockAt, insertEnrollment, insertPlan, listEnrollments } from './support/plans.ts';
import { problem, type Stack } from './support/stack.ts';
import { cpfOf, insertStudents, unknownId } from './support/students.ts';

let env: PhotoStack;
let stack: Stack;
/** As sessões dos quatro perfis, abertas em `NOON`. */
const sessions = {} as Record<Role, Client>;
let planId: string;
/** O autor das presenças postas por SQL. */
let authorId: string;
let counter = 11_000;
const next = () => (counter += 1);

beforeAll(async () => {
  env = await startPhotoStack();
  stack = env.stack;
  // as sessões nascem no relógio controlado, que não anda sozinho: valem enquanto o teste estiver nele
  clockAt(NOON);
  for (const role of ['admin', 'reception', 'hr_finance', 'instructor'] as const) sessions[role] = (await stack.session(role)).client;
  authorId = (await stack.seed({ role: 'reception' })).id;
  planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
}, 240_000);

// salvo quando o caso diz outra coisa, hoje é 7 de outubro de 2026 em São Paulo
beforeEach(() => clockAt(NOON));

afterAll(async () => {
  vi.useRealTimers();
  await env?.close();
});

/** Um aluno novo, direto no banco, com a situação pedida. */
const newStudent = async (status = 'active', name = `Aluno ${next()}`) =>
  (await insertStudents(stack, [{ name, cpf: cpfOf(next()), status }]))[0]!;

/** Um período do aluno no "Mensal", por padrão de 2026-10-01 a 2026-10-31, que cobre D com folga. */
const periodOf = (studentId: string, options: { startsAt?: string; endsAt?: string; cancelled?: boolean; planId?: string } = {}) =>
  insertEnrollment(stack, { studentId, planId, startsAt: '2026-10-01', endsAt: '2026-10-31', ...options });

/** Um aluno com um período que cobre D. */
async function allowedStudent(status = 'active') {
  const studentId = await newStudent(status);
  const enrollmentId = await periodOf(studentId);
  return { studentId, enrollmentId };
}

test('status_200_for_admin_and_reception_with_seven_keys_and_today_in_sao_paulo', async () => {
  const studentId = await newStudent('active', 'Ana Souza');
  await periodOf(studentId);

  for (const role of ['admin', 'reception'] as const) {
    const response = await sessions[role].get(statusPath(studentId));
    const body = (await response.json()) as CheckInStatus;

    expect(response.status, role).toBe(200);
    expect(Object.keys(body).sort(), role).toEqual([...STATUS_KEYS].sort());
    expect(body.today, role).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.today, role).toBe('2026-10-07');
    expect(Object.keys(body.student).sort(), role).toEqual(['id', 'name', 'status']);
    expect(body.student, role).toEqual({ id: studentId, name: 'Ana Souza', status: 'active' });
  }
});

test('active_student_with_active_period_allowed_without_reasons', async () => {
  const { studentId } = await allowedStudent();

  const body = await readStatus(sessions.reception, studentId);

  expect(body.access).toBe('allowed');
  expect(body.blockReasons).toEqual([]);
});

test('inactive_student_with_active_period_blocked_student_inactive', async () => {
  const { studentId } = await allowedStudent('inactive');

  const body = await readStatus(sessions.reception, studentId);

  expect(body.access).toBe('blocked');
  expect(body.blockReasons).toEqual(['student_inactive']);
});

test('suspended_student_with_active_period_blocked_student_suspended', async () => {
  const { studentId } = await allowedStudent('suspended');

  const body = await readStatus(sessions.reception, studentId);

  expect(body.access).toBe('blocked');
  expect(body.blockReasons).toEqual(['student_suspended']);
});

test('no_active_period_blocked_no_active_enrollment_four_cases', async () => {
  const cases: Array<[label: string, prepare: (studentId: string) => Promise<unknown>]> = [
    ['sem período', async () => undefined],
    ['só agendado para 2026-10-08', (studentId) => periodOf(studentId, { startsAt: '2026-10-08', endsAt: '2026-11-07' })],
    ['só vencido em 2026-10-06', (studentId) => periodOf(studentId, { startsAt: '2026-09-07', endsAt: '2026-10-06' })],
    ['só cancelado cobrindo D', (studentId) => periodOf(studentId, { cancelled: true })],
  ];
  expect(cases).toHaveLength(4);

  for (const [label, prepare] of cases) {
    const studentId = await newStudent();
    await prepare(studentId);

    const body = await readStatus(sessions.reception, studentId);

    expect(body.access, label).toBe('blocked');
    expect(body.blockReasons, label).toEqual(['no_active_enrollment']);
  }
});

test('student_reason_first_then_enrollment_reason_without_repetition', async () => {
  const inactive = await newStudent('inactive');
  const suspended = await newStudent('suspended');
  await periodOf(suspended, { startsAt: '2026-09-07', endsAt: '2026-10-06' });

  expect((await readStatus(sessions.reception, inactive)).blockReasons).toEqual(['student_inactive', 'no_active_enrollment']);
  expect((await readStatus(sessions.reception, suspended)).blockReasons).toEqual(['student_suspended', 'no_active_enrollment']);
});

test('overdue_payment_still_allowed_while_period_is_active', async () => {
  const studentId = await newStudent();
  // começou em 2026-09-07, cobre D e não tem confirmação: o pagamento está atrasado
  const enrollmentId = await periodOf(studentId, { startsAt: '2026-09-07', endsAt: '2026-12-06' });

  const overdue = await sessions.hr_finance.get('/api/payments?status=overdue');
  expect(overdue.status).toBe(200);
  const items = ((await overdue.json()) as OpenPaymentsResponse).items;
  expect(items.find((item) => item.enrollmentId === enrollmentId)).toMatchObject({ enrollmentId, status: 'overdue' });

  const body = await readStatus(sessions.reception, studentId);
  expect(body.access).toBe('allowed');
  expect(body.blockReasons).toEqual([]);
});

test('enrollment_is_the_active_period_with_current_plan_name_or_null', async () => {
  const plusId = await insertPlan(stack, { name: 'Mensal Plus', period: 'monthly', priceCents: 12990 });
  const studentId = await newStudent();
  // um vencido e o vigente: só o vigente aparece
  await periodOf(studentId, { planId: plusId, startsAt: '2026-09-01', endsAt: '2026-09-30' });
  const enrollmentId = await periodOf(studentId, { planId: plusId, startsAt: '2026-10-01', endsAt: '2026-10-31' });

  const body = await readStatus(sessions.reception, studentId);
  expect(Object.keys(body.enrollment!).sort()).toEqual(['endsAt', 'id', 'plan', 'startsAt']);
  expect(Object.keys(body.enrollment!.plan).sort()).toEqual(['id', 'name', 'period']);
  expect(body.enrollment).toEqual({
    id: enrollmentId,
    plan: { id: plusId, name: 'Mensal Plus', period: 'monthly' },
    startsAt: '2026-10-01',
    endsAt: '2026-10-31',
  });

  // renomeado o plano depois da matrícula, vale o nome de agora
  await stack.query('update plans set name = $2 where id = $1', [plusId, 'Mensal Premium']);
  expect((await readStatus(sessions.reception, studentId)).enrollment!.plan.name).toBe('Mensal Premium');

  // só vencido, e sem nenhum: `null`
  const expiredOnly = await newStudent();
  await periodOf(expiredOnly, { startsAt: '2026-09-07', endsAt: '2026-10-06' });
  expect((await readStatus(sessions.reception, expiredOnly)).enrollment).toBeNull();
  expect((await readStatus(sessions.reception, await newStudent())).enrollment).toBeNull();
});

test('photo_url_serves_the_large_variant_of_the_current_photo_or_null', async () => {
  const { studentId } = await allowedStudent();
  await uploaded(await uploadPhoto(sessions.reception, studentId, await jpegBytes(800, 1000, RED)));

  // sem sessão, como o `<img>` do navegador
  const fetchImage = async (url: string) => {
    const response = await fetch(`${stack.api.url}${url}`);
    expect(response.status, url).toBe(200);
    return Buffer.from(await response.arrayBuffer());
  };
  const centerOf = async (bytes: Buffer) => {
    const { data } = await sharp(bytes).extract({ left: 300, top: 400, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return [data[0]!, data[1]!, data[2]!] as [number, number, number];
  };

  const first = await readStatus(sessions.reception, studentId);
  expect(first.photoUrl).toMatch(/\/large\?/);
  const firstImage = await fetchImage(first.photoUrl!);
  const metadata = await sharp(firstImage).metadata();
  expect([metadata.width, metadata.height]).toEqual([600, 800]);
  expect(isRed(await centerOf(firstImage))).toBe(true);

  // trocada a foto, serve a nova
  expect((await replacePhoto(sessions.reception, studentId, await jpegBytes(800, 1000, BLUE))).status).toBe(201);
  const second = await readStatus(sessions.reception, studentId);
  const secondImage = await fetchImage(second.photoUrl!);
  expect([(await sharp(secondImage).metadata()).width, (await sharp(secondImage).metadata()).height]).toEqual([600, 800]);
  expect(isBlue(await centerOf(secondImage))).toBe(true);

  // sem foto
  expect((await readStatus(sessions.reception, await newStudent())).photoUrl).toBeNull();
});

test('checked_in_at_is_todays_check_in_or_null', async () => {
  const { studentId } = await allowedStudent();
  expect((await readStatus(sessions.reception, studentId)).checkedInAt).toBeNull();

  // a presença de ontem não é a de hoje
  await insertCheckIn(stack, { studentId, day: '2026-10-06', checkedInBy: authorId, checkedInAt: '2026-10-06T15:00:00Z' });
  expect((await readStatus(sessions.reception, studentId)).checkedInAt).toBeNull();

  const registered = await registerCheckIn(sessions.reception, studentId);
  expect((await readStatus(sessions.reception, studentId)).checkedInAt).toBe(registered.checkedInAt);
});

test('access_follows_both_period_edges_at_the_sao_paulo_turn', async () => {
  const ending = await newStudent();
  await periodOf(ending, { startsAt: '2026-09-08', endsAt: '2026-10-07' });
  const starting = await newStudent();
  await periodOf(starting, { startsAt: '2026-10-08', endsAt: '2026-11-07' });

  const before = await sessionAt(stack, BEFORE_TURN);
  const endingBefore = await readStatus(before, ending);
  const startingBefore = await readStatus(before, starting);
  expect([endingBefore.today, endingBefore.access, endingBefore.blockReasons]).toEqual(['2026-10-07', 'allowed', []]);
  expect([startingBefore.today, startingBefore.access, startingBefore.blockReasons]).toEqual(['2026-10-07', 'blocked', ['no_active_enrollment']]);

  const after = await sessionAt(stack, AFTER_TURN);
  const endingAfter = await readStatus(after, ending);
  const startingAfter = await readStatus(after, starting);
  expect([endingAfter.today, endingAfter.access, endingAfter.blockReasons]).toEqual(['2026-10-08', 'blocked', ['no_active_enrollment']]);
  expect([startingAfter.today, startingAfter.access, startingAfter.blockReasons]).toEqual(['2026-10-08', 'allowed', []]);
});

test('checked_in_at_cleared_at_the_sao_paulo_turn', async () => {
  const { studentId } = await allowedStudent();
  await insertCheckIn(stack, { studentId, day: '2026-10-07', checkedInBy: authorId, checkedInAt: '2026-10-07T23:00:00Z' });

  const before = await readStatus(await sessionAt(stack, BEFORE_TURN), studentId);
  expect(before.today).toBe('2026-10-07');
  expect(before.checkedInAt).toBe('2026-10-07T23:00:00.000Z');

  const after = await readStatus(await sessionAt(stack, AFTER_TURN), studentId);
  expect(after.today).toBe('2026-10-08');
  expect(after.checkedInAt).toBeNull();
});

test('hr_finance_and_instructor_403_forbidden_for_known_and_unknown_id', async () => {
  const { studentId } = await allowedStudent();

  for (const role of ['hr_finance', 'instructor'] as const) {
    for (const [label, id] of [
      ['aluno que existe', studentId],
      ['uuid de ninguém', unknownId()],
    ] as const) {
      const response = await sessions[role].get(statusPath(id));

      expect(response.status, `${role}, ${label}`).toBe(403);
      expect((await problem(response)).code, `${role}, ${label}`).toBe('forbidden');
    }
  }
});

test('anonymous_401_unauthorized', async () => {
  const { studentId } = await allowedStudent();

  const response = await stack.client().get(statusPath(studentId));

  expect(response.status).toBe(401);
  expect((await problem(response)).code).toBe('unauthorized');
});

test('unknown_and_non_uuid_student_404_not_found', async () => {
  for (const role of ['admin', 'reception'] as const) {
    for (const id of [unknownId(), 'abc']) {
      const response = await sessions[role].get(statusPath(id));

      expect(response.status, `${role}, ${id}`).toBe(404);
      expect((await problem(response)).code, `${role}, ${id}`).toBe('not_found');
    }
  }
});

test('status_reads_write_no_audit_and_no_check_in_row', async () => {
  const allowed = await allowedStudent();
  const blocked = await allowedStudent('inactive');
  const checkedIn = await allowedStudent();
  await insertCheckIn(stack, { studentId: checkedIn.studentId, day: '2026-10-07', checkedInBy: authorId });

  for (const role of ['admin', 'reception'] as const) {
    for (const [label, studentId] of [
      ['liberado', allowed.studentId],
      ['bloqueado', blocked.studentId],
      ['já com presença', checkedIn.studentId],
    ] as const) {
      const before = await checkInSnapshot(stack);

      const response = await sessions[role].get(statusPath(studentId));

      expect(response.status, `${role}, ${label}`).toBe(200);
      expect(await checkInSnapshot(stack), `${role}, ${label}`).toEqual(before);
    }
  }
});

test('status_and_enrollment_ficha_agree_across_sao_paulo_midnight', async () => {
  const ending = await newStudent();
  const endingId = await periodOf(ending, { startsAt: '2026-09-08', endsAt: '2026-10-07' });
  const starting = await newStudent();
  const startingId = await periodOf(starting, { startsAt: '2026-10-08', endsAt: '2026-11-07' });

  for (const instant of [NOON, BEFORE_TURN, AFTER_TURN]) {
    const client = await sessionAt(stack, instant);
    for (const [studentId, enrollmentId] of [
      [ending, endingId],
      [starting, startingId],
    ] as const) {
      const [period] = (await listEnrollments(client, studentId)).filter((item) => item.id === enrollmentId);
      const status = await readStatus(client, studentId);

      expect(status.access === 'allowed', `${instant}, ${enrollmentId}`).toBe(period!.status === 'active');
      if (status.access === 'allowed') expect(status.enrollment!.id, `${instant}, ${enrollmentId}`).toBe(enrollmentId);
    }
  }
});
