import type { Enrollment, Role } from '@academia/contracts';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { createMinorWithGuardian } from './support/consents.ts';
import {
  ENROLLMENT_DATA_KEYS,
  ENROLLMENT_KEYS,
  NOON,
  clockAt,
  databaseNow,
  enroll,
  enrollmentRow,
  enrollmentRowText,
  enrollmentRowsTextOfStudent,
  enrollmentsPath,
  insertPlan,
  listEnrollments,
  overlappingPairs,
  planSnapshot,
} from './support/plans.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { cpfOf, fieldErrorPaths, insertStudents, releasedTogether, unknownId } from './support/students.ts';

let stack: Stack;
let admin: Client;
let hr: Client;
let reception: Client;
let instructor: Client;
let counter = 8000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  // as sessões nascem no relógio controlado, que não anda sozinho: valem enquanto o teste estiver nele
  clockAt(NOON);
  admin = (await stack.session('admin')).client;
  hr = (await stack.session('hr_finance')).client;
  reception = (await stack.session('reception')).client;
  instructor = (await stack.session('instructor')).client;
}, 180_000);

// salvo quando o caso diz outra coisa, hoje é 7 de outubro de 2026 em São Paulo
beforeEach(() => clockAt(NOON));

afterAll(async () => {
  vi.useRealTimers();
  await stack?.close();
});

/** Um aluno novo, direto no banco, com a situação pedida. */
const newStudent = async (status = 'active') =>
  (await insertStudents(stack, [{ name: `Aluno ${next()}`, cpf: cpfOf(counter), status }]))[0]!;

/** Move o relógio e abre, naquele instante, a sessão que as requisições seguintes usam. */
async function sessionAt(instant: string, role: Role = 'hr_finance') {
  clockAt(instant);
  return (await stack.session(role)).client;
}

const enrollmentIdsOf = async (studentId: string) =>
  (await stack.query<{ id: string }>('select id from enrollments where student_id = $1', [studentId])).map((row) => row.id);

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

test('enroll_201_by_admin_and_hr_finance_with_the_eight_keys_and_without_consent', async () => {
  for (const [role, client] of [
    ['admin', admin],
    ['hr_finance', hr],
  ] as const) {
    const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
    const studentId = await newStudent();
    // o aluno não tem linha nenhuma em `consents`
    expect(await stack.query('select id from consents where student_id = $1', [studentId]), role).toEqual([]);

    const t0 = await databaseNow(stack);
    const response = await client.post(enrollmentsPath(studentId), { planId, startsAt: '2026-10-07' });
    const t1 = await databaseNow(stack);
    const body = (await response.json()) as Enrollment;

    expect(response.status, role).toBe(201);
    expect(Object.keys(body).sort(), role).toEqual([...ENROLLMENT_KEYS].sort());
    // o `id` devolvido é o da única linha que passou a existir
    expect(await enrollmentIdsOf(studentId), role).toEqual([body.id]);
    expect(Object.keys(body.plan).sort(), role).toEqual(['id', 'name', 'period']);
    expect(body.plan, role).toEqual({ id: planId, name: 'Mensal', period: 'monthly' });
    expect(body.startsAt, role).toBe('2026-10-07');
    expect(body.endsAt, role).toBe('2026-11-06');
    expect(body.priceCents, role).toBe(9990);
    expect(body.status, role).toBe('active');
    expect(body.createdAt, role).toMatch(ISO_INSTANT);
    expect(new Date(body.createdAt).toISOString(), role).toBe(body.createdAt);
    expect(new Date(body.createdAt).getTime(), role).toBeGreaterThanOrEqual(t0.getTime());
    expect(new Date(body.createdAt).getTime(), role).toBeLessThanOrEqual(t1.getTime());
    expect(body.cancelledAt, role).toBeNull();
    expect(await enrollmentRow(stack, body.id), role).toMatchObject({
      id: body.id,
      student_id: studentId,
      plan_id: planId,
      starts_at: '2026-10-07',
      ends_at: '2026-11-06',
      price_cents: 9990,
      cancelled_at: null,
    });

    // um menor cujo responsável não concedeu consentimento nenhum
    const minor = await createMinorWithGuardian(reception, next());
    expect(await stack.query('select id from consents where student_id = $1', [minor.id]), `${role} menor`).toEqual([]);
    const ofMinor = await client.post(enrollmentsPath(minor.id), { planId, startsAt: '2026-10-07' });
    expect(ofMinor.status, `${role} menor`).toBe(201);
    const minorBody = (await ofMinor.json()) as Enrollment;
    expect(Object.keys(minorBody).sort(), `${role} menor`).toEqual([...ENROLLMENT_KEYS].sort());
    expect(await enrollmentIdsOf(minor.id), `${role} menor`).toEqual([minorBody.id]);
  }
});

test('ends_at_for_the_four_periods_from_2026_10_07', async () => {
  const expected: Array<[period: string, endsAt: string]> = [
    ['monthly', '2026-11-06'],
    ['quarterly', '2027-01-06'],
    ['semiannual', '2027-04-06'],
    ['annual', '2027-10-06'],
  ];
  expect(expected).toHaveLength(4);

  for (const [period, endsAt] of expected) {
    const planId = await insertPlan(stack, { name: `Plano ${period}`, period });
    const studentId = await newStudent();

    const response = await hr.post(enrollmentsPath(studentId), { planId, startsAt: '2026-10-07' });
    const body = (await response.json()) as Enrollment;

    expect(response.status, period).toBe(201);
    expect(body.endsAt, period).toBe(endsAt);
    expect((await enrollmentRow(stack, body.id))!.ends_at, period).toBe(endsAt);
  }
});

test('ends_at_uses_last_day_of_short_month_and_matches_postgres_on_seventeen_rows', async () => {
  const MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
  const plans: Record<string, string> = {};
  for (const period of Object.keys(MONTHS)) plans[period] = await insertPlan(stack, { name: `Plano ${period}`, period });

  /** Matricula um aluno novo com o relógio no dia do início e devolve o `endsAt` da resposta. */
  const endsAtOf = async (startsAt: string, period: string) => {
    const client = await sessionAt(`${startsAt}T15:00:00Z`);
    const response = await client.post(enrollmentsPath(await newStudent()), { planId: plans[period], startsAt });
    expect(response.status, `${startsAt} ${period}`).toBe(201);
    return ((await response.json()) as Enrollment).endsAt;
  };

  // o mês de destino não tem o dia: vale o último dia dele, antes de subtrair um
  const shortMonth: Array<[startsAt: string, period: string, endsAt: string]> = [
    ['2026-01-31', 'monthly', '2026-02-27'],
    ['2028-01-31', 'monthly', '2028-02-28'],
    ['2028-02-29', 'annual', '2029-02-27'],
  ];
  expect(shortMonth).toHaveLength(3);
  for (const [startsAt, period, endsAt] of shortMonth) expect(await endsAtOf(startsAt, period), `${startsAt} ${period}`).toBe(endsAt);

  // a tabela da C7, com o valor esperado escrito à mão
  const table: Array<[startsAt: string, period: string, endsAt: string]> = [
    ['2026-10-07', 'monthly', '2026-11-06'],
    ['2026-10-07', 'quarterly', '2027-01-06'],
    ['2026-10-07', 'semiannual', '2027-04-06'],
    ['2026-10-07', 'annual', '2027-10-06'],
    ['2026-01-01', 'monthly', '2026-01-31'],
    ['2026-01-28', 'monthly', '2026-02-27'],
    ['2026-01-29', 'monthly', '2026-02-27'],
    ['2026-01-30', 'monthly', '2026-02-27'],
    ['2026-01-31', 'monthly', '2026-02-27'],
    ['2026-03-31', 'monthly', '2026-04-29'],
    ['2026-12-31', 'monthly', '2027-01-30'],
    ['2028-01-31', 'monthly', '2028-02-28'],
    ['2028-02-29', 'monthly', '2028-03-28'],
    ['2026-11-30', 'quarterly', '2027-02-27'],
    ['2026-08-31', 'semiannual', '2027-02-27'],
    ['2027-02-28', 'annual', '2028-02-27'],
    ['2028-02-29', 'annual', '2029-02-27'],
  ];
  expect(table).toHaveLength(17);

  for (const [startsAt, period, endsAt] of table) {
    const label = `${startsAt} ${period}`;
    const [computed] = await stack.query<{ day: string }>(
      `select (($1::date + make_interval(months => $2) - interval '1 day')::date)::text as day`,
      [startsAt, MONTHS[period]],
    );

    const returned = await endsAtOf(startsAt, period);

    expect(returned, label).toBe(endsAt);
    expect(returned, `${label} contra o Postgres`).toBe(computed!.day);
  }
});

test('enroll_five_invalid_plan_ids_422_on_plan_id', async () => {
  const studentId = await newStudent();
  const cases: Array<[label: string, body: Record<string, unknown>]> = [
    ['ausente', { startsAt: '2026-10-07' }],
    ['abc', { planId: 'abc', startsAt: '2026-10-07' }],
    ['123', { planId: 123, startsAt: '2026-10-07' }],
    ['null', { planId: null, startsAt: '2026-10-07' }],
    ['uuid de plano nenhum', { planId: unknownId(), startsAt: '2026-10-07' }],
  ];
  expect(cases).toHaveLength(5);

  for (const [label, body] of cases) {
    const before = await planSnapshot(stack);

    const response = await hr.post(enrollmentsPath(studentId), body);

    expect(response.status, label).toBe(422);
    expect(await fieldErrorPaths(response), label).toContain('planId');
    expect(await planSnapshot(stack), label).toEqual(before);
  }
});

test('enroll_starts_at_twelve_cases_around_today_in_sao_paulo', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  let cases = 0;

  const refused = async (client: Client, label: string, body: Record<string, unknown>) => {
    const before = await planSnapshot(stack);

    const response = await client.post(enrollmentsPath(await newStudent()), body);

    expect(response.status, label).toBe(422);
    expect(await fieldErrorPaths(response), label).toContain('startsAt');
    expect(await planSnapshot(stack), label).toEqual(before);
    cases += 1;
  };
  const accepted = async (client: Client, label: string, startsAt: string) => {
    const response = await client.post(enrollmentsPath(await newStudent()), { planId, startsAt });

    expect(response.status, label).toBe(201);
    expect(((await response.json()) as Enrollment).startsAt, label).toBe(startsAt);
    cases += 1;
  };

  await refused(hr, 'ausente', { planId });
  await refused(hr, 'null', { planId, startsAt: null });
  await refused(hr, 'data que não existe', { planId, startsAt: '2026-02-30' });
  await refused(hr, 'mês 13', { planId, startsAt: '2026-13-01' });
  await refused(hr, 'formato curto', { planId, startsAt: '26-10-07' });
  await refused(hr, 'formato com barras', { planId, startsAt: '07/10/2026' });
  // o relógio está em 2026-10-07T15:00:00Z: hoje é dia 7
  await refused(hr, 'hoje mais 366 dias', { planId, startsAt: '2027-10-08' });
  await accepted(hr, 'hoje mais 365 dias', '2027-10-07');
  await refused(hr, 'vencimento ontem (2026-10-06)', { planId, startsAt: '2026-09-07' });
  await accepted(hr, 'vencimento hoje (2026-10-07)', '2026-09-08');

  // 02:59:59 UTC de 8/10 ainda é dia 7 em São Paulo: o vencimento em 7/10 é hoje
  await accepted(await sessionAt('2026-10-08T02:59:59Z'), '2026-09-08 às 02:59:59Z de 8/10', '2026-09-08');
  // 03:00:00 UTC é a virada: hoje passa a ser dia 8, e o vencimento em 7/10 é ontem
  await refused(await sessionAt('2026-10-08T03:00:00Z'), '2026-09-08 às 03:00:00Z de 8/10', { planId, startsAt: '2026-09-08' });

  expect(cases).toBe(12);
});

test('enroll_started_in_the_past_and_not_ended_201_active', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });

  const response = await hr.post(enrollmentsPath(await newStudent()), { planId, startsAt: '2026-09-20' });
  const body = (await response.json()) as Enrollment;

  expect(response.status).toBe(201);
  expect(body.startsAt).toBe('2026-09-20');
  expect(body.endsAt).toBe('2026-10-19');
  expect(body.status).toBe('active');
});

test('enroll_in_inactive_plan_409_plan_inactive', async () => {
  const planId = await insertPlan(stack, { name: 'Fora de Linha', status: 'inactive' });
  const studentId = await newStudent();
  const before = await planSnapshot(stack);

  const response = await hr.post(enrollmentsPath(studentId), { planId, startsAt: '2026-10-07' });

  expect(response.status).toBe(409);
  expect((await problem(response)).code).toBe('plan_inactive');
  expect(await planSnapshot(stack)).toEqual(before);
});

test('enroll_inactive_student_409_student_inactive', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal' });
  const studentId = await newStudent('inactive');
  const before = await planSnapshot(stack);

  const response = await hr.post(enrollmentsPath(studentId), { planId, startsAt: '2026-10-07' });

  expect(response.status).toBe(409);
  expect((await problem(response)).code).toBe('student_inactive');
  expect(await planSnapshot(stack)).toEqual(before);
});

test('enroll_suspended_student_201_like_active', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
  const body = { planId, startsAt: '2026-10-07' };

  const ofActive = await hr.post(enrollmentsPath(await newStudent('active')), body);
  const ofSuspended = await hr.post(enrollmentsPath(await newStudent('suspended')), body);
  const active = (await ofActive.json()) as Enrollment;
  const suspended = (await ofSuspended.json()) as Enrollment;

  expect(ofActive.status).toBe(201);
  expect(ofSuspended.status).toBe(201);
  expect(Object.keys(suspended).sort()).toEqual([...ENROLLMENT_KEYS].sort());
  expect(Object.keys(suspended).sort()).toEqual(Object.keys(active).sort());
  expect([suspended.endsAt, suspended.priceCents, suspended.status]).toEqual(['2026-11-06', 9990, 'active']);
  expect([suspended.endsAt, suspended.priceCents, suspended.status]).toEqual([active.endsAt, active.priceCents, active.status]);
});

test('enroll_overlap_six_cases_409_and_other_student_201', async () => {
  const monthly = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const otherMonthly = await insertPlan(stack, { name: 'Mensal Manhã', period: 'monthly', priceCents: 7990 });
  const quarterly = await insertPlan(stack, { name: 'Trimestral', period: 'quarterly', priceCents: 24_990 });
  const studentId = await newStudent();
  // a matrícula não cancelada de 2026-10-07 a 2026-11-06
  const first = await enroll(hr, studentId, monthly, '2026-10-07');
  expect([first.startsAt, first.endsAt]).toEqual(['2026-10-07', '2026-11-06']);
  let cases = 0;

  const overlaps = async (client: Client, label: string, planId: string, startsAt: string) => {
    const before = await planSnapshot(stack);

    const response = await client.post(enrollmentsPath(studentId), { planId, startsAt });

    expect(response.status, label).toBe(409);
    expect((await problem(response)).code, label).toBe('enrollment_overlap');
    expect(await planSnapshot(stack), label).toEqual(before);
    cases += 1;
  };

  await overlaps(hr, 'o mesmo início no mesmo plano', monthly, '2026-10-07');
  await overlaps(hr, 'o mesmo início em outro plano', otherMonthly, '2026-10-07');
  await overlaps(hr, 'um dia em comum, o último (2026-11-06)', monthly, '2026-11-06');
  await overlaps(hr, 'um dia em comum, o primeiro (vencimento 2026-10-07)', monthly, '2026-09-08');
  await overlaps(hr, 'contém o período (2026-09-10 a 2026-12-09)', quarterly, '2026-09-10');

  // o mesmo período para outro aluno
  const other = await hr.post(enrollmentsPath(await newStudent()), { planId: monthly, startsAt: '2026-10-07' });
  expect(other.status, 'outro aluno').toBe(201);

  // em dezembro a primeira já venceu e continua valendo contra a sobreposição: vencida não é cancelada
  const december = await sessionAt('2026-12-01T15:00:00Z');
  expect((await listEnrollments(december, studentId)).map((item) => item.status)).toEqual(['expired']);
  await overlaps(december, 'contra a vencida, 2026-11-06 no mensal', monthly, '2026-11-06');

  expect(cases).toBe(6);
});

test('two_simultaneous_enrollments_one_201_one_409', async () => {
  const monthly = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const quarterly = await insertPlan(stack, { name: 'Trimestral', period: 'quarterly', priceCents: 24_990 });

  for (let round = 0; round < 10; round += 1) {
    const studentId = await newStudent();

    const responses = await releasedTogether([
      () => hr.post(enrollmentsPath(studentId), { planId: monthly, startsAt: '2026-10-07' }),
      () => hr.post(enrollmentsPath(studentId), { planId: quarterly, startsAt: '2026-10-07' }),
    ]);

    expect(responses.map((response) => response.status).sort(), `rodada ${round}`).toEqual([201, 409]);
    const conflict = responses.find((response) => response.status === 409)!;
    expect((await problem(conflict)).code, `rodada ${round}`).toBe('enrollment_overlap');
    const alive = await stack.query(
      `select id from enrollments where student_id = $1 and cancelled_at is null and starts_at <= '2027-01-06' and ends_at >= '2026-10-07'`,
      [studentId],
    );
    expect(alive, `rodada ${round}`).toHaveLength(1);
  }
});

test('enrollment_routes_404_for_non_uuid_and_unknown_student', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal' });
  const existing = await enroll(hr, await newStudent(), planId);
  let cases = 0;

  for (const id of ['abc', unknownId()]) {
    const routes: Array<[method: string, path: string, body: unknown]> = [
      ['GET', enrollmentsPath(id), undefined],
      ['POST', enrollmentsPath(id), { planId, startsAt: '2026-10-07' }],
      ['DELETE', `${enrollmentsPath(id)}/${existing.id}`, undefined],
    ];
    for (const [method, path, sent] of routes) {
      const before = await planSnapshot(stack);

      const response = await hr.request(method, path, { body: sent });

      expect(response.status, `${method} ${path}`).toBe(404);
      expect((await problem(response)).code, `${method} ${path}`).toBe('not_found');
      expect(await planSnapshot(stack), `${method} ${path}`).toEqual(before);
      cases += 1;
    }
  }

  expect(cases).toBe(6);
});

test('reception_writes_and_instructor_everything_403_ten_cases', async () => {
  const planId = await insertPlan(stack, { name: 'Plano Guardado' });
  const studentId = await newStudent();
  const existing = await enroll(hr, studentId, planId);
  const ids: Array<[label: string, student: string, enrollment: string, plan: string]> = [
    ['ids que existem', studentId, existing.id, planId],
    ['uuid de ninguém', unknownId(), unknownId(), unknownId()],
  ];
  type Case = [role: 'reception' | 'instructor', method: string, path: string, body: unknown, label: string];
  const cases: Case[] = [
    ...ids.flatMap(([label, student, enrollment, plan]): Case[] => [
      ['reception', 'POST', enrollmentsPath(student), { planId: plan, startsAt: '2026-11-07' }, label],
      ['reception', 'DELETE', `${enrollmentsPath(student)}/${enrollment}`, undefined, label],
    ]),
    ...ids.flatMap(([label, student, enrollment, plan]): Case[] => [
      ['instructor', 'GET', enrollmentsPath(student), undefined, label],
      ['instructor', 'POST', enrollmentsPath(student), { planId: plan, startsAt: '2026-11-07' }, label],
      ['instructor', 'DELETE', `${enrollmentsPath(student)}/${enrollment}`, undefined, label],
    ]),
  ];
  expect(cases).toHaveLength(10);
  expect(cases.filter(([role]) => role === 'reception')).toHaveLength(4);
  expect(cases.filter(([role]) => role === 'instructor')).toHaveLength(6);

  const clients = { reception, instructor };
  for (const [role, method, path, sent, label] of cases) {
    const before = await planSnapshot(stack);

    const response = await clients[role].request(method, path, { body: sent });
    const body = (await response.json()) as Record<string, unknown>;

    const where = `${role} ${method} ${path} ${label}`;
    expect(response.status, where).toBe(403);
    expect(body.code, where).toBe('forbidden');
    for (const key of ENROLLMENT_DATA_KEYS) expect(Object.keys(body), `${where} ${key}`).not.toContain(key);
    expect(await planSnapshot(stack), where).toEqual(before);
  }
});

test('anonymous_401_on_three_enrollment_routes', async () => {
  const planId = await insertPlan(stack, { name: 'Plano Sem Sessão' });
  const studentId = await newStudent();
  const existing = await enroll(hr, studentId, planId);
  const client = stack.client();
  const routes: Array<[method: string, path: string, body: unknown]> = [
    ['GET', enrollmentsPath(studentId), undefined],
    ['POST', enrollmentsPath(studentId), { planId, startsAt: '2026-11-07' }],
    ['DELETE', `${enrollmentsPath(studentId)}/${existing.id}`, undefined],
  ];
  expect(routes).toHaveLength(3);

  for (const [method, path, sent] of routes) {
    const before = await planSnapshot(stack);

    const response = await client.request(method, path, { body: sent });

    expect(response.status, `${method} ${path}`).toBe(401);
    expect((await problem(response)).code, `${method} ${path}`).toBe('unauthorized');
    expect(await planSnapshot(stack), `${method} ${path}`).toEqual(before);
  }
});

test('price_change_keeps_recorded_enrollments_and_applies_to_the_next', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
  const studentId = await newStudent();
  // as duas matrículas registradas antes do reajuste
  await enroll(hr, studentId, planId, '2026-10-07');
  await enroll(hr, studentId, planId, '2026-11-07');
  const rowsBefore = await enrollmentRowsTextOfStudent(stack, studentId);
  expect(rowsBefore).toHaveLength(2);

  const patched = await hr.patch(`/api/plans/${planId}`, { priceCents: 10_990 });

  expect(patched.status).toBe(200);
  expect(((await patched.json()) as { priceCents: number }).priceCents).toBe(10_990);
  expect(await enrollmentRowsTextOfStudent(stack, studentId)).toEqual(rowsBefore);
  const read = await listEnrollments(hr, studentId);
  expect(read).toHaveLength(2);
  expect(read.map((item) => item.priceCents)).toEqual([9990, 9990]);

  // a matrícula registrada depois do reajuste nasce com o valor novo
  const later = await hr.post(enrollmentsPath(studentId), { planId, startsAt: '2026-12-07' });
  expect(later.status).toBe(201);
  const laterBody = (await later.json()) as Enrollment;
  expect(laterBody.priceCents).toBe(10_990);
  expect((await enrollmentRow(stack, laterBody.id))!.price_cents).toBe(10_990);
  // e as duas de antes continuam como estavam
  expect((await enrollmentRowsTextOfStudent(stack, studentId)).filter((row) => rowsBefore.includes(row))).toHaveLength(2);
});

test('renewal_glued_to_the_previous_201_and_previous_row_unchanged', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const studentId = await newStudent();
  const previous = await enroll(hr, studentId, planId, '2026-10-07');
  expect(previous.endsAt).toBe('2026-11-06');
  const before = await enrollmentRowText(stack, previous.id);

  const response = await hr.post(enrollmentsPath(studentId), { planId, startsAt: '2026-11-07' });

  expect(response.status).toBe(201);
  expect(((await response.json()) as Enrollment).startsAt).toBe('2026-11-07');
  expect(await enrollmentRowText(stack, previous.id)).toBe(before);
});

test('early_renewal_reads_scheduled_and_current_active', async () => {
  const client = await sessionAt('2026-10-20T15:00:00Z');
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const studentId = await newStudent();
  const current = await enroll(client, studentId, planId, '2026-10-07');

  const renewal = await enroll(client, studentId, planId, '2026-11-07');

  expect([renewal.startsAt, renewal.endsAt]).toEqual(['2026-11-07', '2026-12-06']);
  const read = await listEnrollments(client, studentId);
  expect(read).toHaveLength(2);
  expect(read.find((item) => item.id === renewal.id)!.status).toBe('scheduled');
  expect(read.find((item) => item.id === current.id)!.status).toBe('active');
});

test('renewal_in_another_plan_takes_its_ends_at_and_price', async () => {
  const monthly = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
  const quarterly = await insertPlan(stack, { name: 'Trimestral', period: 'quarterly', priceCents: 24_990 });
  const studentId = await newStudent();
  await enroll(hr, studentId, monthly, '2026-10-07');

  const response = await hr.post(enrollmentsPath(studentId), { planId: quarterly, startsAt: '2026-11-07' });
  const body = (await response.json()) as Enrollment;

  expect(response.status).toBe(201);
  expect(body.plan.id).toBe(quarterly);
  expect(body.endsAt).toBe('2027-02-06');
  expect(body.priceCents).toBe(24_990);
});

test('renewal_after_a_gap_201_and_gap_days_uncovered', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const studentId = await newStudent();
  await enroll(hr, studentId, planId, '2026-10-07');

  const response = await hr.post(enrollmentsPath(studentId), { planId, startsAt: '2026-12-01' });

  expect(response.status).toBe(201);
  const read = await listEnrollments(hr, studentId);
  expect(read.map((item) => [item.startsAt, item.endsAt]).sort()).toEqual([
    ['2026-10-07', '2026-11-06'],
    ['2026-12-01', '2026-12-31'],
  ]);
  // nenhum dos vinte e quatro dias do intervalo está dentro de uma matrícula
  const gap = Array.from({ length: 24 }, (_, index) => `2026-11-${String(index + 7).padStart(2, '0')}`);
  expect([gap[0], gap.at(-1)]).toEqual(['2026-11-07', '2026-11-30']);
  for (const day of gap) {
    expect(read.filter((item) => item.startsAt <= day && day <= item.endsAt), day).toEqual([]);
  }
});

test('cancel_204_sets_cancelled_at_from_database_and_keeps_row_in_three_states', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  // a matrícula é de 2026-10-07 a 2026-11-06: o relógio do teste é que a põe em cada situação
  const states: Array<[status: string, registeredAt: string, cancelledAt: string]> = [
    ['scheduled', '2026-10-06T15:00:00Z', '2026-10-06T15:00:00Z'],
    ['active', NOON, NOON],
    ['expired', NOON, '2026-11-07T15:00:00Z'],
  ];
  expect(states).toHaveLength(3);

  for (const role of ['admin', 'hr_finance'] as Role[]) {
    for (const [status, registeredAt, at] of states) {
      const label = `${role} ${status}`;
      const studentId = await newStudent();
      const created = await enroll(await sessionAt(registeredAt), studentId, planId, '2026-10-07');
      const client = await sessionAt(at, role);
      expect((await listEnrollments(client, studentId)).map((item) => item.status), label).toEqual([status]);
      const before = (await enrollmentRow(stack, created.id))!;
      expect(before.cancelled_at, label).toBeNull();

      const t0 = await databaseNow(stack);
      const response = await client.delete(`${enrollmentsPath(studentId)}/${created.id}`);
      const t1 = await databaseNow(stack);

      expect(response.status, label).toBe(204);
      expect(await response.text(), label).toBe('');
      // a linha continua, e só `cancelled_at` mudou
      const after = (await enrollmentRow(stack, created.id))!;
      expect({ ...after, cancelled_at: null }, label).toEqual(before);
      const [stored] = await stack.query<{ cancelled_at: Date }>('select cancelled_at from enrollments where id = $1', [created.id]);
      expect(stored!.cancelled_at.getTime(), label).toBeGreaterThanOrEqual(t0.getTime());
      expect(stored!.cancelled_at.getTime(), label).toBeLessThanOrEqual(t1.getTime());

      const read = await listEnrollments(client, studentId);
      expect(read, label).toHaveLength(1);
      expect(read[0]!.id, label).toBe(created.id);
      expect(read[0]!.status, label).toBe('cancelled');
      expect(read[0]!.cancelledAt, label).toBe(stored!.cancelled_at.toISOString());
    }
  }
});

test('cancel_of_cancelled_204_changes_nothing', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal' });
  const studentId = await newStudent();
  const created = await enroll(hr, studentId, planId);
  expect((await hr.delete(`${enrollmentsPath(studentId)}/${created.id}`)).status).toBe(204);
  const before = await enrollmentRowText(stack, created.id);
  expect((JSON.parse(before!) as { cancelled_at: unknown }).cancelled_at).not.toBeNull();

  const response = await hr.delete(`${enrollmentsPath(studentId)}/${created.id}`);

  expect(response.status).toBe(204);
  expect(await enrollmentRowText(stack, created.id)).toBe(before);
});

test('enroll_after_cancel_in_the_same_period_201', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const studentId = await newStudent();
  const cancelled = await enroll(hr, studentId, planId, '2026-10-07');
  expect((await hr.delete(`${enrollmentsPath(studentId)}/${cancelled.id}`)).status).toBe(204);

  const response = await hr.post(enrollmentsPath(studentId), { planId, startsAt: '2026-10-07' });

  expect(response.status).toBe(201);
  const rows = await stack.query<{ id: string; cancelled: boolean }>(
    `select id, cancelled_at is not null as cancelled from enrollments
     where student_id = $1 and starts_at = '2026-10-07' and ends_at = '2026-11-06' order by id`,
    [studentId],
  );
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.cancelled).sort()).toEqual([false, true]);
  expect(rows.find((row) => row.cancelled)!.id).toBe(cancelled.id);
});

test('cancel_404_for_bad_unknown_and_other_students_enrollment', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal' });
  const studentId = await newStudent();
  await enroll(hr, studentId, planId);
  const ofOther = await enroll(hr, await newStudent(), planId);
  const before = await enrollmentRowText(stack, ofOther.id);
  const cases: Array<[label: string, enrollmentId: string]> = [
    ['abc', 'abc'],
    ['uuid de matrícula nenhuma', unknownId()],
    ['matrícula de outro aluno', ofOther.id],
  ];
  expect(cases).toHaveLength(3);

  for (const [label, enrollmentId] of cases) {
    const response = await hr.delete(`${enrollmentsPath(studentId)}/${enrollmentId}`);

    expect(response.status, label).toBe(404);
    expect((await problem(response)).code, label).toBe('not_found');
    expect(await enrollmentRowText(stack, ofOther.id), label).toBe(before);
  }
});

test('five_racing_pairs_never_5xx_one_audit_row_and_no_overlap_left', async () => {
  const monthly = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const statuses: number[] = [];
  const statusesOf = (responses: Response[]) => {
    statuses.push(...responses.map((response) => response.status));
    return responses.map((response) => response.status);
  };

  for (let round = 0; round < 10; round += 1) {
    const label = `rodada ${round}`;

    // dois cancelamentos da mesma matrícula
    const twice = await newStudent();
    const toCancel = await enroll(hr, twice, monthly);
    const cancels = await written(stack, () =>
      releasedTogether([
        () => hr.delete(`${enrollmentsPath(twice)}/${toCancel.id}`),
        () => admin.delete(`${enrollmentsPath(twice)}/${toCancel.id}`),
      ]),
    );
    expect(statusesOf(cancels.result), `${label} dois cancelamentos`).toEqual([204, 204]);
    expect(cancels.rows.filter((row) => row.action === 'student.enrollment_cancelled'), `${label} dois cancelamentos`).toHaveLength(1);

    // duas inativações do mesmo plano ativo
    const planTwice = await insertPlan(stack, { name: `Plano da ${label}` });
    const inactivations = await written(stack, () =>
      releasedTogether([() => hr.delete(`/api/plans/${planTwice}`), () => admin.delete(`/api/plans/${planTwice}`)]),
    );
    expect(statusesOf(inactivations.result), `${label} duas inativações`).toEqual([204, 204]);
    expect(inactivations.rows.filter((row) => row.action === 'plan.inactivated'), `${label} duas inativações`).toHaveLength(1);

    // cancelar a matrícula A contra registrar um período sobreposto a A
    const overlapped = await newStudent();
    const a = await enroll(hr, overlapped, monthly, '2026-10-07');
    const [cancelA, postOverA] = (await releasedTogether([
      () => hr.delete(`${enrollmentsPath(overlapped)}/${a.id}`),
      () => admin.post(enrollmentsPath(overlapped), { planId: monthly, startsAt: '2026-10-20' }),
    ])) as [Response, Response];
    statusesOf([cancelA, postOverA]);
    expect(cancelA.status, `${label} cancelar contra registrar`).toBe(204);
    expect([201, 409], `${label} cancelar contra registrar`).toContain(postOverA.status);
    if (postOverA.status === 409) expect((await problem(postOverA)).code, `${label} cancelar contra registrar`).toBe('enrollment_overlap');
    expect(await overlappingPairs(stack, overlapped), `${label} cancelar contra registrar`).toBe(0);

    // inativar o plano contra matricular nele
    const racedPlan = await insertPlan(stack, { name: `Plano disputado da ${label}` });
    const [deletePlan, postInPlan] = (await releasedTogether([
      () => hr.delete(`/api/plans/${racedPlan}`),
      async () => admin.post(enrollmentsPath(await newStudent()), { planId: racedPlan, startsAt: '2026-10-07' }),
    ])) as [Response, Response];
    statusesOf([deletePlan, postInPlan]);
    expect(deletePlan.status, `${label} inativar o plano contra matricular`).toBe(204);
    expect([201, 409], `${label} inativar o plano contra matricular`).toContain(postInPlan.status);
    if (postInPlan.status === 409) expect((await problem(postInPlan)).code, `${label} inativar o plano contra matricular`).toBe('plan_inactive');

    // inativar o aluno contra matriculá-lo
    const racedStudent = await newStudent();
    const [deleteStudent, postForStudent] = (await releasedTogether([
      () => admin.delete(`/api/students/${racedStudent}`),
      () => hr.post(enrollmentsPath(racedStudent), { planId: monthly, startsAt: '2026-10-07' }),
    ])) as [Response, Response];
    statusesOf([deleteStudent, postForStudent]);
    expect(deleteStudent.status, `${label} inativar o aluno contra matricular`).toBe(204);
    expect([201, 409], `${label} inativar o aluno contra matricular`).toContain(postForStudent.status);
    if (postForStudent.status === 409) expect((await problem(postForStudent)).code, `${label} inativar o aluno contra matricular`).toBe('student_inactive');
  }

  // cinco pares por rodada, dez rodadas, duas respostas por par
  expect(statuses).toHaveLength(100);
  expect(statuses.filter((status) => status >= 500)).toEqual([]);
});
