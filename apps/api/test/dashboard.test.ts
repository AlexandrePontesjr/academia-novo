import { type CheckInsReport, type DashboardResponse, dashboardResponseSchema, EXPIRING_SOON_DAYS, type OpenPaymentsResponse, type Role, type StaffRole } from '@academia/contracts';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { auditCount } from './support/audit.ts';
import { insertCheckIn } from './support/check-ins.ts';
import type { Client } from './support/client.ts';
import { insertPayment } from './support/payments.ts';
import { NOON, clockAt, insertEnrollment, insertPlan, listEnrollments } from './support/plans.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { cpfOf, insertStudents } from './support/students.ts';

const ROLES = ['admin', 'hr_finance', 'reception', 'instructor'] as const satisfies Role[];
const BEFORE_TURN = '2026-10-08T02:59:59Z';
const AFTER_TURN = '2026-10-08T03:00:00Z';
const DASHBOARD_KEYS = ['today', 'students', 'enrollments', 'payments'];

let stack: Stack;
/** As sessões dos quatro perfis, abertas em `NOON`. */
let sessions: Record<Role, Client>;
/** O "Mensal" de cada caso. */
let mensal: string;
/** O autor das presenças postas por SQL. */
let authorId: string;
let counter = 12_000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  // as sessões nascem no relógio controlado, que não anda sozinho: valem enquanto o teste estiver nele
  clockAt(NOON);
  sessions = {} as Record<Role, Client>;
  for (const role of ROLES) sessions[role] = (await stack.session(role)).client;
  authorId = (await stack.seed({ role: 'reception' })).id;
}, 180_000);

// cada caso parte do banco sem alunos, períodos, pagamentos nem planos, em 7 de outubro de 2026
beforeEach(async () => {
  clockAt(NOON);
  await emptyTheGym();
  mensal = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
});

afterAll(async () => {
  vi.useRealTimers();
  await stack?.close();
});

/** As contagens são do banco inteiro: nenhum caso herda linha de outro. */
async function emptyTheGym() {
  await stack.query('delete from check_ins');
  await stack.query('delete from payments');
  await stack.query('delete from enrollments');
  await stack.query('delete from students');
  await stack.query('delete from plans');
}

const newStudent = async (status = 'active', name = `Aluno ${next()}`) =>
  (await insertStudents(stack, [{ name, cpf: cpfOf(next()), status }]))[0]!;

const newStudents = async (status: string, count: number) => {
  for (let index = 0; index < count; index += 1) await newStudent(status);
};

interface PeriodOptions {
  /** A situação do aluno novo. */
  status?: string;
  name?: string;
  studentId?: string;
  planId?: string;
  startsAt?: string;
  endsAt?: string;
  cancelled?: boolean;
  /** `alive` põe uma confirmação viva por SQL; `undone` uma desfeita. */
  payment?: 'alive' | 'undone';
}

/** Um período, por padrão de um aluno novo no "Mensal", de 2026-10-07 a 2026-11-06. */
async function newPeriod(options: PeriodOptions = {}) {
  const studentId = options.studentId ?? (await newStudent(options.status, options.name));
  const enrollmentId = await insertEnrollment(stack, { planId: mensal, ...options, studentId });
  if (options.payment) await insertPayment(stack, { enrollmentId, voided: options.payment === 'undone' });
  return { studentId, enrollmentId };
}

/** Um período iniciado antes de hoje que termina naquele dia. */
const ending = (endsAt: string, options: PeriodOptions = {}) => newPeriod({ startsAt: '2026-08-01', endsAt, ...options });

/** Um período com o `id` escolhido pelo teste, para o empate contra a ordem de inserção. */
async function insertEnrollmentWithId(id: string, row: { studentId: string; planId: string; startsAt: string; endsAt: string }) {
  await stack.query('insert into enrollments (id, student_id, plan_id, starts_at, ends_at, price_cents) values ($1, $2, $3, $4, $5, 9990)', [
    id,
    row.studentId,
    row.planId,
    row.startsAt,
    row.endsAt,
  ]);
  return id;
}

/** Move o relógio e abre, naquele instante, a sessão que as requisições seguintes usam. */
async function sessionAt(instant: string, role: Role = 'reception') {
  clockAt(instant);
  return (await stack.session(role)).client;
}

async function dashboard(client: Client) {
  const response = await client.get('/api/dashboard');
  expect(response.status, 'leitura do painel').toBe(200);
  return (await response.json()) as DashboardResponse;
}

/** `enrollments` como a recepção o lê. */
const enrollmentsCard = async (client: Client = sessions.reception) => (await dashboard(client)).enrollments!;
/** `payments` como o financeiro o lê. */
const paymentsCard = async (client: Client = sessions.hr_finance) => (await dashboard(client)).payments!;

/** Uma presença de um aluno novo naquele dia, por SQL. */
const checkInOn = async (day: string) => insertCheckIn(stack, { studentId: await newStudent(), day, checkedInBy: authorId });

const ids = (items: Array<{ enrollmentId: string }>) => items.map((item) => item.enrollmentId);
const sumOf = (byPlan: Array<{ active: number }>) => byPlan.reduce((sum, item) => sum + item.active, 0);

/** A preparação da C11: três períodos `active` em D, de alunos das três situações, e dois `scheduled`. */
async function threeActiveAndTwoScheduled() {
  await newPeriod({ status: 'active', startsAt: '2026-10-07', endsAt: '2026-11-06' });
  await newPeriod({ status: 'inactive', startsAt: '2026-09-08', endsAt: '2026-10-07' });
  await newPeriod({ status: 'suspended', startsAt: '2026-09-20', endsAt: '2026-10-19' });
  await newPeriod({ startsAt: '2026-10-08', endsAt: '2026-11-07' });
  await newPeriod({ startsAt: '2026-12-01', endsAt: '2026-12-31' });
}

/** A preparação da C27: três ativos no "Mensal", um no "Anual" e três planos que não entram. */
async function plansWithAndWithoutActivePeriods() {
  const anual = await insertPlan(stack, { name: 'Anual', period: 'annual', priceCents: 99_900 });
  const onlyScheduled = await insertPlan(stack, { name: 'Trimestral', period: 'quarterly', priceCents: 27_000 });
  const onlyPast = await insertPlan(stack, { name: 'Semestral', period: 'semiannual', priceCents: 50_000 });
  await insertPlan(stack, { name: 'Sem matrícula', period: 'monthly', priceCents: 5000 });
  for (let index = 0; index < 3; index += 1) await newPeriod();
  await newPeriod({ planId: anual, startsAt: '2026-01-01', endsAt: '2026-12-31' });
  await newPeriod({ planId: onlyScheduled, startsAt: '2026-11-01', endsAt: '2027-01-31' });
  await newPeriod({ planId: onlyPast, startsAt: '2026-01-01', endsAt: '2026-06-30' });
  await newPeriod({ planId: onlyPast, cancelled: true });
  return { anual };
}

/** A preparação da virada da C48: o plano que entra em `byPlan` às 03:00Z e o que sai. */
async function turnOfTwoPlans() {
  const entering = await insertPlan(stack, { name: 'Entra', period: 'monthly', priceCents: 8000 });
  const leaving = await insertPlan(stack, { name: 'Sai', period: 'monthly', priceCents: 7000 });
  await newPeriod({ planId: entering, startsAt: '2026-10-08', endsAt: '2026-11-07' });
  await newPeriod({ planId: leaving, startsAt: '2026-09-08', endsAt: '2026-10-07' });
  return { entering, leaving };
}

// S1 - o painel responde por perfil

test('four_roles_200_with_today_in_sao_paulo', async () => {
  for (const role of ROLES) {
    const response = await sessions[role].get('/api/dashboard');

    expect(response.status, role).toBe(200);
    const { today } = (await response.json()) as DashboardResponse;
    expect(today, role).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today, role).toBe('2026-10-07');
  }
});

test('top_level_keys_exactly_by_role_four_roles', async () => {
  await newPeriod();
  const expected: Record<StaffRole, string[]> = {
    admin: ['checkIns', 'enrollments', 'payments', 'students', 'today'],
    hr_finance: ['enrollments', 'payments', 'students', 'today'],
    reception: ['checkIns', 'enrollments', 'students', 'today'],
    instructor: ['students', 'today'],
  };

  for (const role of ROLES) {
    const body = (await dashboard(sessions[role])) as Record<string, unknown>;

    expect(Object.keys(body).sort(), role).toEqual(expected[role]);
  }
  // a chave que o perfil não lê não existe, nem como `null`
  const reception = (await dashboard(sessions.reception)) as Record<string, unknown>;
  expect('payments' in reception).toBe(false);
  const instructor = (await dashboard(sessions.instructor)) as Record<string, unknown>;
  expect('enrollments' in instructor).toBe(false);
  expect('payments' in instructor).toBe(false);
  // `checkIns` só para quem lê as rotas de presença
  expect('checkIns' in instructor).toBe(false);
  const hrFinance = (await dashboard(sessions.hr_finance)) as Record<string, unknown>;
  expect('checkIns' in hrFinance).toBe(false);
});

test('anonymous_401_unauthorized', async () => {
  const response = await stack.client().get('/api/dashboard');

  expect(response.status).toBe(401);
  expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json/);
  const body = (await response.clone().json()) as Record<string, unknown>;
  expect((await problem(response)).code).toBe('unauthorized');
  for (const key of DASHBOARD_KEYS) expect(Object.keys(body)).not.toContain(key);
});

test('admin_without_2fa_403_without_any_dashboard_key', async () => {
  await newPeriod();
  const user = await stack.seed({ role: 'admin' });
  const client = await stack.signIn(user);

  const response = await client.get('/api/dashboard');

  expect(response.status).toBe(403);
  const body = (await response.clone().json()) as Record<string, unknown>;
  expect((await problem(response)).code).toBe('two_factor_enrollment_required');
  for (const key of DASHBOARD_KEYS) expect(Object.keys(body), key).not.toContain(key);
});

test('eight_reads_write_no_audit_row', async () => {
  // as sessões foram abertas antes da fotografia: o login grava
  const before = await auditCount(stack);
  let reads = 0;

  // o banco sem alunos
  for (const role of ROLES) {
    expect((await dashboard(sessions[role])).students, role).toEqual({ active: 0, inactive: 0, suspended: 0 });
    reads += 1;
  }
  // com alunos, períodos e pagamentos, postos por SQL
  await newPeriod({ payment: 'alive' });
  await newPeriod({ payment: 'undone' });
  await newPeriod({ status: 'inactive', startsAt: '2026-10-01', endsAt: '2026-10-31' });
  const prepared = await auditCount(stack);
  for (const role of ROLES) {
    expect((await dashboard(sessions[role])).students, role).toEqual({ active: 2, inactive: 1, suspended: 0 });
    reads += 1;
  }

  expect(reads).toBe(8);
  expect(prepared).toBe(before);
  expect(await auditCount(stack)).toBe(before);
});

test('today_on_both_sides_of_the_sao_paulo_turn', async () => {
  for (const role of ROLES) {
    expect((await dashboard(await sessionAt(BEFORE_TURN, role))).today, `${role} às 02:59:59Z`).toBe('2026-10-07');
    expect((await dashboard(await sessionAt(AFTER_TURN, role))).today, `${role} às 03:00:00Z`).toBe('2026-10-08');
  }
});

test('nested_keys_exactly_the_surface_and_cards_equal_across_roles', async () => {
  await newStudents('inactive', 2);
  await newStudent('suspended');
  await threeActiveAndTwoScheduled();

  const admin = await dashboard(sessions.admin);
  const reception = await dashboard(sessions.reception);

  expect(Object.keys(admin.students).sort()).toEqual(['active', 'inactive', 'suspended']);
  expect(Object.keys(admin.enrollments!).sort()).toEqual(['active', 'byPlan', 'expiringSoon', 'scheduled']);
  expect(Object.keys(admin.enrollments!.expiringSoon).sort()).toEqual(['days', 'items']);
  expect(Object.keys(admin.payments!).sort()).toEqual(['overdue', 'pending']);
  // o card inteiro ou nenhum: o da recepção é o do administrador
  expect(admin.enrollments!.expiringSoon.items).toHaveLength(1);
  expect(admin.enrollments!.byPlan).toHaveLength(1);
  expect(reception.students).toEqual(admin.students);
  expect(reception.enrollments).toEqual(admin.enrollments);
});

// S2 - alunos por situação

test('students_three_two_one_by_status_for_four_roles', async () => {
  await newStudents('active', 3);
  await newStudents('inactive', 2);
  await newStudents('suspended', 1);

  for (const role of ROLES) {
    expect((await dashboard(sessions[role])).students, role).toEqual({ active: 3, inactive: 2, suspended: 1 });
  }
});

test('students_zero_kept_for_each_missing_status_four_cases', async () => {
  const cases: Array<[label: string, counts: { active: number; inactive: number; suspended: number }]> = [
    ['sem aluno nenhum', { active: 0, inactive: 0, suspended: 0 }],
    ['sem suspended', { active: 2, inactive: 1, suspended: 0 }],
    ['sem inactive', { active: 2, inactive: 0, suspended: 1 }],
    ['sem active', { active: 0, inactive: 2, suspended: 1 }],
  ];
  expect(cases).toHaveLength(4);

  for (const [label, counts] of cases) {
    await emptyTheGym();
    for (const [status, count] of Object.entries(counts)) await newStudents(status, count);

    expect((await dashboard(sessions.instructor)).students, label).toEqual(counts);
  }
});

// S3 - matrículas e vencimentos próximos

test('enrollments_active_three_scheduled_two_with_edges_on_today_and_any_student_status', async () => {
  await threeActiveAndTwoScheduled();

  const card = await enrollmentsCard();

  expect(card.active).toBe(3);
  expect(card.scheduled).toBe(2);
});

test('expired_and_cancelled_periods_are_in_neither_count', async () => {
  await ending('2026-10-06');
  await ending('2026-08-31');
  await newPeriod({ cancelled: true, startsAt: '2026-10-01', endsAt: '2026-10-31' });
  await newPeriod({ cancelled: true, startsAt: '2026-12-01', endsAt: '2026-12-31' });

  const alone = await enrollmentsCard();
  expect(alone.active).toBe(0);
  expect(alone.scheduled).toBe(0);

  // somados à preparação da C11, os dois números são os dela
  await threeActiveAndTwoScheduled();
  const added = await enrollmentsCard();
  expect(added.active).toBe(3);
  expect(added.scheduled).toBe(2);
});

test('expiring_soon_days_is_seven_with_and_without_items', async () => {
  const empty = (await enrollmentsCard()).expiringSoon;
  expect(empty.items).toEqual([]);
  expect(empty.days).toBe(7);

  await ending('2026-10-10');
  const filled = (await enrollmentsCard()).expiringSoon;
  expect(filled.items).toHaveLength(1);
  expect(filled.days).toBe(7);
  expect(filled.days).toBe(EXPIRING_SOON_DAYS);
});

test('expiring_soon_items_only_active_periods_inside_the_window_with_four_keys', async () => {
  await ending('2026-10-06');
  const today = await ending('2026-10-07', { status: 'active', name: 'Ana Souza' });
  const middle = await ending('2026-10-10', { status: 'inactive', name: 'Bia Lima' });
  const last = await ending('2026-10-14', { status: 'suspended', name: 'Caio Nunes' });
  await ending('2026-10-15');
  await ending('2026-11-06');
  await newPeriod({ startsAt: '2026-10-08', endsAt: '2026-10-12' });

  const { items } = (await enrollmentsCard()).expiringSoon;

  expect(items).toHaveLength(3);
  for (const item of items) {
    expect(Object.keys(item).sort()).toEqual(['endsAt', 'enrollmentId', 'plan', 'student']);
    expect(Object.keys(item.student).sort()).toEqual(['id', 'name']);
    expect(Object.keys(item.plan).sort()).toEqual(['id', 'name', 'period']);
  }
  const plan = { id: mensal, name: 'Mensal', period: 'monthly' };
  expect(items).toEqual([
    { enrollmentId: today.enrollmentId, student: { id: today.studentId, name: 'Ana Souza' }, plan, endsAt: '2026-10-07' },
    { enrollmentId: middle.enrollmentId, student: { id: middle.studentId, name: 'Bia Lima' }, plan, endsAt: '2026-10-10' },
    { enrollmentId: last.enrollmentId, student: { id: last.studentId, name: 'Caio Nunes' }, plan, endsAt: '2026-10-14' },
  ]);
});

test('window_includes_today_and_today_plus_seven', async () => {
  const today = await ending('2026-10-07');
  const plusSeven = await ending('2026-10-14');

  const { items } = (await enrollmentsCard()).expiringSoon;

  expect(ids(items)).toEqual([today.enrollmentId, plusSeven.enrollmentId]);
  expect(items.map((item) => item.endsAt)).toEqual(['2026-10-07', '2026-10-14']);
});

test('today_plus_eight_is_out_of_the_list_and_counted_as_active', async () => {
  await ending('2026-10-15');

  const card = await enrollmentsCard();

  expect(card.expiringSoon.items).toEqual([]);
  expect(card.active).toBe(1);
});

test('cancelled_period_inside_the_window_is_left_out', async () => {
  await ending('2026-10-10', { cancelled: true });
  const live = await ending('2026-10-10');

  const { items } = (await enrollmentsCard()).expiringSoon;

  expect(ids(items)).toEqual([live.enrollmentId]);
});

test('period_ending_today_leaves_list_and_active_count_at_the_sao_paulo_turn', async () => {
  const { enrollmentId } = await ending('2026-10-07');

  const before = await dashboard(await sessionAt(BEFORE_TURN));
  expect(before.today).toBe('2026-10-07');
  expect(ids(before.enrollments!.expiringSoon.items)).toEqual([enrollmentId]);
  expect(before.enrollments!.active).toBe(1);

  const after = await dashboard(await sessionAt(AFTER_TURN));
  expect(after.today).toBe('2026-10-08');
  expect(after.enrollments!.expiringSoon.items).toEqual([]);
  expect(after.enrollments!.active).toBe(0);
});

test('period_ending_in_eight_days_enters_the_list_at_the_sao_paulo_turn', async () => {
  const { enrollmentId } = await ending('2026-10-15');

  const before = await dashboard(await sessionAt(BEFORE_TURN));
  expect(before.today).toBe('2026-10-07');
  expect(before.enrollments!.expiringSoon.items).toEqual([]);
  expect(before.enrollments!.active).toBe(1);

  const after = await dashboard(await sessionAt(AFTER_TURN));
  expect(after.today).toBe('2026-10-08');
  expect(ids(after.enrollments!.expiringSoon.items)).toEqual([enrollmentId]);
  expect(after.enrollments!.active).toBe(1);
});

test('expiring_soon_ordered_by_ends_at_then_enrollment_id_against_insertion_order', async () => {
  // o par empatado em 2026-10-10: o de `id` maior entra primeiro, e a ordem de inserção é a inversa da do `id`
  const lowId = '01900000-0000-7000-8000-00000000000a';
  const highId = '01900000-0000-7000-8000-00000000000b';
  const period = { planId: mensal, startsAt: '2026-08-01', endsAt: '2026-10-10' };
  const last = await ending('2026-10-14');
  await insertEnrollmentWithId(highId, { ...period, studentId: await newStudent() });
  const first = await ending('2026-10-07');
  await insertEnrollmentWithId(lowId, { ...period, studentId: await newStudent() });

  const { items } = (await enrollmentsCard()).expiringSoon;

  expect(ids(items)).toEqual([first.enrollmentId, lowId, highId, last.enrollmentId]);
  expect(items.map((item) => item.endsAt)).toEqual(['2026-10-07', '2026-10-10', '2026-10-10', '2026-10-14']);
});

test('renamed_plan_shows_current_name_in_list_and_by_plan', async () => {
  const plan = await insertPlan(stack, { name: 'Mensal Antigo', period: 'monthly', priceCents: 9990 });
  await ending('2026-10-10', { planId: plan });
  await stack.query(`update plans set name = 'Mensal Novo' where id = $1`, [plan]);

  const card = await enrollmentsCard();

  expect(card.expiringSoon.items.map((item) => item.plan)).toEqual([{ id: plan, name: 'Mensal Novo', period: 'monthly' }]);
  expect(card.byPlan).toEqual([{ plan: { id: plan, name: 'Mensal Novo', period: 'monthly' }, active: 1 }]);
});

test('expiring_soon_empty_list_two_cases', async () => {
  // sem período nenhum
  expect((await enrollmentsCard()).expiringSoon.items).toEqual([]);

  // com períodos ativos que vencem depois de hoje mais 7
  await ending('2026-10-15');
  await ending('2026-11-06');
  const card = await enrollmentsCard();
  expect(card.active).toBe(2);
  expect(card.expiringSoon.items).toEqual([]);
});

test('scheduled_becomes_active_and_by_plan_follows_at_the_sao_paulo_turn', async () => {
  const entering = await insertPlan(stack, { name: 'Entra', period: 'monthly', priceCents: 8000 });
  const leaving = await insertPlan(stack, { name: 'Sai', period: 'monthly', priceCents: 7000 });
  const enteringItem = { plan: { id: entering, name: 'Entra', period: 'monthly' }, active: 1 };
  const leavingItem = { plan: { id: leaving, name: 'Sai', period: 'monthly' }, active: 1 };

  // só o período que começa em 2026-10-08: agendado, e não ativo, até a virada
  await newPeriod({ planId: entering, startsAt: '2026-10-08', endsAt: '2026-11-07' });
  const alone = [await dashboard(await sessionAt(BEFORE_TURN)), await dashboard(await sessionAt(AFTER_TURN))] as const;
  expect(alone[0].today).toBe('2026-10-07');
  expect([alone[0].enrollments!.scheduled, alone[0].enrollments!.active]).toEqual([1, 0]);
  expect(alone[0].enrollments!.byPlan).toEqual([]);
  expect(alone[1].today).toBe('2026-10-08');
  expect([alone[1].enrollments!.scheduled, alone[1].enrollments!.active]).toEqual([0, 1]);
  expect(alone[1].enrollments!.byPlan).toEqual([enteringItem]);

  // ao lado do plano cujo único período termina em 2026-10-07, que faz o caminho inverso
  await newPeriod({ planId: leaving, startsAt: '2026-09-08', endsAt: '2026-10-07' });
  const before = await dashboard(await sessionAt(BEFORE_TURN));
  expect(before.today).toBe('2026-10-07');
  expect(before.enrollments!.byPlan).toEqual([leavingItem]);
  const after = await dashboard(await sessionAt(AFTER_TURN));
  expect(after.today).toBe('2026-10-08');
  expect(after.enrollments!.byPlan).toEqual([enteringItem]);
});

test('already_renewed_period_stays_in_the_expiring_list', async () => {
  const { studentId, enrollmentId } = await newPeriod({ startsAt: '2026-09-11', endsAt: '2026-10-10' });
  await newPeriod({ studentId, startsAt: '2026-10-11', endsAt: '2026-11-10' });

  const card = await enrollmentsCard();

  expect(ids(card.expiringSoon.items)).toEqual([enrollmentId]);
  expect(card.scheduled).toBe(1);
  expect(card.active).toBe(1);
});

test('dashboard_and_enrollment_ficha_agree_on_status_across_sao_paulo_midnight', async () => {
  const endsToday = await newPeriod({ startsAt: '2026-09-08', endsAt: '2026-10-07' });
  const startsTomorrow = await newPeriod({ startsAt: '2026-10-08', endsAt: '2026-11-07' });
  const expected: Array<[instant: string, active: number, scheduled: number]> = [
    [NOON, 1, 1],
    [BEFORE_TURN, 1, 1],
    [AFTER_TURN, 1, 0],
  ];

  for (const [instant, active, scheduled] of expected) {
    const client = await sessionAt(instant);

    const onFicha = [
      ...(await listEnrollments(client, endsToday.studentId)),
      ...(await listEnrollments(client, startsTomorrow.studentId)),
    ].map((item) => item.status);
    const card = (await dashboard(client)).enrollments!;

    expect(onFicha, instant).toHaveLength(2);
    expect(card.active, instant).toBe(onFicha.filter((status) => status === 'active').length);
    expect(card.scheduled, instant).toBe(onFicha.filter((status) => status === 'scheduled').length);
    expect([card.active, card.scheduled], instant).toEqual([active, scheduled]);
  }
});

// S4 - pagamentos pendentes e atrasados

test('payments_pending_three_overdue_two_for_admin_and_hr_finance', async () => {
  await newPeriod({ status: 'active', startsAt: '2026-10-01', endsAt: '2026-10-31' });
  await newPeriod({ status: 'inactive', startsAt: '2026-10-06', endsAt: '2026-11-05' });
  await newPeriod({ status: 'suspended', startsAt: '2026-10-07', endsAt: '2026-11-06' });
  await newPeriod({ status: 'inactive', startsAt: '2026-10-20', endsAt: '2026-11-19' });
  await newPeriod({ status: 'active', startsAt: '2026-12-01', endsAt: '2026-12-31' });

  for (const role of ['admin', 'hr_finance'] as const) {
    expect((await dashboard(sessions[role])).payments, role).toEqual({ pending: 3, overdue: 2 });
  }
});

test('paid_and_cancelled_periods_are_in_neither_payment_count_and_undone_counts', async () => {
  await newPeriod({ payment: 'alive', startsAt: '2026-10-01', endsAt: '2026-10-31' });
  await newPeriod({ payment: 'alive', startsAt: '2026-10-20', endsAt: '2026-11-19' });
  await newPeriod({ cancelled: true });
  await newPeriod({ cancelled: true, payment: 'alive' });
  expect(await paymentsCard()).toEqual({ pending: 0, overdue: 0 });

  // só com confirmação desfeita, o período volta a contar pelo vencimento
  await newPeriod({ payment: 'undone', startsAt: '2026-10-06', endsAt: '2026-11-05' });
  expect(await paymentsCard()).toEqual({ pending: 0, overdue: 1 });
  await newPeriod({ payment: 'undone', startsAt: '2026-10-07', endsAt: '2026-11-06' });
  expect(await paymentsCard()).toEqual({ pending: 1, overdue: 1 });
});

test('dashboard_and_open_list_agree_on_both_counts_across_sao_paulo_midnight', async () => {
  await newPeriod({ startsAt: '2026-10-06', endsAt: '2026-11-05' });
  await newPeriod({ startsAt: '2026-10-07', endsAt: '2026-11-06' });
  await newPeriod({ startsAt: '2026-10-08', endsAt: '2026-11-07' });
  await newPeriod({ payment: 'alive', startsAt: '2026-10-06', endsAt: '2026-11-05' });
  await newPeriod({ cancelled: true, startsAt: '2026-10-06', endsAt: '2026-11-05' });
  const expected: Array<[instant: string, pending: number, overdue: number]> = [
    [NOON, 2, 1],
    [BEFORE_TURN, 2, 1],
    [AFTER_TURN, 1, 2],
  ];
  const openCount = async (client: Client, status: string) => {
    const response = await client.get(`/api/payments?status=${status}`);
    expect(response.status, `lista geral ${status}`).toBe(200);
    return ((await response.json()) as OpenPaymentsResponse).items.length;
  };

  for (const [instant, pending, overdue] of expected) {
    for (const role of ['admin', 'hr_finance'] as const) {
      const client = await sessionAt(instant, role);

      const card = (await dashboard(client)).payments!;

      expect(card.pending, `${role} em ${instant}`).toBe(await openCount(client, 'pending'));
      expect(card.overdue, `${role} em ${instant}`).toBe(await openCount(client, 'overdue'));
      expect(card, `${role} em ${instant}`).toEqual({ pending, overdue });
    }
  }
});

test('unpaid_period_moves_from_pending_to_overdue_at_the_sao_paulo_turn', async () => {
  await newPeriod({ startsAt: '2026-10-07', endsAt: '2026-11-06' });

  const before = await dashboard(await sessionAt(BEFORE_TURN, 'hr_finance'));
  expect(before.today).toBe('2026-10-07');
  expect(before.payments).toEqual({ pending: 1, overdue: 0 });

  const after = await dashboard(await sessionAt(AFTER_TURN, 'hr_finance'));
  expect(after.today).toBe('2026-10-08');
  expect(after.payments).toEqual({ pending: 0, overdue: 1 });
});

test('period_with_several_payment_rows_counts_once_in_every_card', async () => {
  // duas confirmações desfeitas e uma viva
  const paidPlan = await insertPlan(stack, { name: 'Pago', period: 'monthly', priceCents: 8000 });
  const paid = await newPeriod({ planId: paidPlan, startsAt: '2026-09-11', endsAt: '2026-10-10' });
  await insertPayment(stack, { enrollmentId: paid.enrollmentId, voided: true });
  await insertPayment(stack, { enrollmentId: paid.enrollmentId, voided: true });
  await insertPayment(stack, { enrollmentId: paid.enrollmentId });

  const one = await dashboard(sessions.admin);
  expect(one.enrollments!.active).toBe(1);
  expect(ids(one.enrollments!.expiringSoon.items)).toEqual([paid.enrollmentId]);
  expect(one.enrollments!.byPlan).toEqual([{ plan: { id: paidPlan, name: 'Pago', period: 'monthly' }, active: 1 }]);
  expect(one.payments).toEqual({ pending: 0, overdue: 0 });

  // duas desfeitas e nenhuma viva
  const undonePlan = await insertPlan(stack, { name: 'Desfeito', period: 'monthly', priceCents: 7000 });
  const undone = await newPeriod({ planId: undonePlan, startsAt: '2026-10-07', endsAt: '2026-10-10' });
  await insertPayment(stack, { enrollmentId: undone.enrollmentId, voided: true });
  await insertPayment(stack, { enrollmentId: undone.enrollmentId, voided: true });

  const two = await dashboard(sessions.admin);
  expect(two.enrollments!.active).toBe(2);
  expect(ids(two.enrollments!.expiringSoon.items).sort()).toEqual([paid.enrollmentId, undone.enrollmentId].sort());
  expect(two.enrollments!.byPlan.find((item) => item.plan.id === undonePlan)).toEqual({
    plan: { id: undonePlan, name: 'Desfeito', period: 'monthly' },
    active: 1,
  });
  expect(two.enrollments!.byPlan).toHaveLength(2);
  expect(two.payments).toEqual({ pending: 1, overdue: 0 });
});

// S5 - matrículas ativas por plano

test('by_plan_one_item_per_plan_with_an_active_period_and_two_keys', async () => {
  const { anual } = await plansWithAndWithoutActivePeriods();

  const { byPlan } = await enrollmentsCard();

  expect(byPlan).toHaveLength(2);
  for (const item of byPlan) {
    expect(Object.keys(item).sort()).toEqual(['active', 'plan']);
    expect(Object.keys(item.plan).sort()).toEqual(['id', 'name', 'period']);
  }
  expect(byPlan).toEqual([
    { plan: { id: mensal, name: 'Mensal', period: 'monthly' }, active: 3 },
    { plan: { id: anual, name: 'Anual', period: 'annual' }, active: 1 },
  ]);
});

test('by_plan_ordered_by_active_desc_then_plan_id_against_insertion_order', async () => {
  // planos de 1, 3, 2 e 2 períodos ativos, nessa ordem; no par empatado, o de `id` maior entra primeiro
  const lowId = '01900000-0000-7000-8000-00000000001a';
  const highId = '01900000-0000-7000-8000-00000000001b';
  const one = await insertPlan(stack, { name: 'Um', period: 'monthly', priceCents: 1000 });
  const three = await insertPlan(stack, { name: 'Três', period: 'monthly', priceCents: 3000 });
  await insertPlan(stack, { id: highId, name: 'Dois, o segundo', period: 'monthly', priceCents: 2000 });
  await insertPlan(stack, { id: lowId, name: 'Dois, o primeiro', period: 'monthly', priceCents: 2000 });
  for (const [planId, count] of [
    [one, 1],
    [three, 3],
    [highId, 2],
    [lowId, 2],
  ] as const) {
    for (let index = 0; index < count; index += 1) await newPeriod({ planId });
  }

  const { byPlan } = await enrollmentsCard();

  expect(byPlan.map((item) => [item.plan.id, item.active])).toEqual([
    [three, 3],
    [lowId, 2],
    [highId, 2],
    [one, 1],
  ]);
});

test('by_plan_sum_equals_enrollments_active_in_four_setups', async () => {
  // a preparação da C11
  await threeActiveAndTwoScheduled();
  const first = await enrollmentsCard();
  expect(sumOf(first.byPlan)).toBe(first.active);
  expect(first.active).toBe(3);

  // a preparação da C27
  await emptyTheGym();
  mensal = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
  await plansWithAndWithoutActivePeriods();
  const second = await enrollmentsCard();
  expect(sumOf(second.byPlan)).toBe(second.active);
  expect(second.active).toBe(4);

  // os dois instantes da virada da C48
  await emptyTheGym();
  await turnOfTwoPlans();
  for (const instant of [BEFORE_TURN, AFTER_TURN]) {
    const card = (await dashboard(await sessionAt(instant))).enrollments!;
    expect(sumOf(card.byPlan), instant).toBe(card.active);
    expect(card.active, instant).toBe(1);
    expect(card.byPlan, instant).toHaveLength(1);
  }
});

test('inactive_plan_with_an_active_period_is_listed', async () => {
  const plan = await insertPlan(stack, { name: 'Fora de venda', period: 'monthly', priceCents: 9990, status: 'inactive' });
  await newPeriod({ planId: plan });

  const { byPlan } = await enrollmentsCard();

  expect(byPlan).toEqual([{ plan: { id: plan, name: 'Fora de venda', period: 'monthly' }, active: 1 }]);
});

test('by_plan_empty_list_two_cases', async () => {
  // sem período nenhum
  expect((await enrollmentsCard()).byPlan).toEqual([]);

  // só com agendados, vencidos e cancelados
  await newPeriod({ startsAt: '2026-10-08', endsAt: '2026-11-07' });
  await ending('2026-10-06');
  await newPeriod({ cancelled: true });
  const card = await enrollmentsCard();
  expect(card.scheduled).toBe(1);
  expect(card.byPlan).toEqual([]);
});

// S7 - a leitura não muda linha

test('reading_the_dashboard_changes_no_row_of_four_tables_across_the_turn', async () => {
  await newStudents('inactive', 1);
  await threeActiveAndTwoScheduled();
  await newPeriod({ payment: 'alive' });
  await newPeriod({ payment: 'undone', startsAt: '2026-10-06', endsAt: '2026-11-05' });
  await newPeriod({ cancelled: true });
  // as sessões nascem antes da fotografia
  const clients: Array<[instant: string, role: Role, client: Client]> = [];
  for (const instant of [BEFORE_TURN, AFTER_TURN]) {
    for (const role of ROLES) clients.push([instant, role, await sessionAt(instant, role)]);
  }
  await checkInOn('2026-10-07');
  const TABLES = ['students', 'enrollments', 'plans', 'payments', 'check_ins'] as const;
  const snapshot = async () => {
    const rows: Record<string, string[]> = {};
    for (const table of TABLES) {
      rows[table] = (await stack.query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by id`)).map((entry) => entry.row);
    }
    return rows;
  };
  const before = await snapshot();
  for (const table of TABLES) expect(before[table]!.length, table).toBeGreaterThan(0);

  const todays: string[] = [];
  for (const [instant, , client] of clients) {
    clockAt(instant);
    todays.push((await dashboard(client)).today);
  }

  expect(todays).toEqual([...Array<string>(4).fill('2026-10-07'), ...Array<string>(4).fill('2026-10-08')]);
  expect(await snapshot()).toEqual(before);
});

test('check_ins_count_is_todays_rows_for_admin_and_reception_and_zero_when_none', async () => {
  for (const role of ['admin', 'reception'] as const) {
    expect((await dashboard(sessions[role])).checkIns!.count, `${role} sem presença`).toBe(0);
  }
  await checkInOn('2026-10-07');
  await checkInOn('2026-10-07');
  await checkInOn('2026-10-06');
  await checkInOn('2026-10-08');

  for (const role of ['admin', 'reception'] as const) {
    expect((await dashboard(sessions[role])).checkIns!.count, role).toBe(2);
  }
});

test('check_ins_count_turns_at_sao_paulo_midnight', async () => {
  await checkInOn('2026-10-07');

  const before = await dashboard(await sessionAt(BEFORE_TURN, 'reception'));
  expect([before.today, before.checkIns!.count]).toEqual(['2026-10-07', 1]);

  const after = await dashboard(await sessionAt(AFTER_TURN, 'reception'));
  expect([after.today, after.checkIns!.count]).toEqual(['2026-10-08', 0]);
});

test('check_ins_count_and_report_total_agree_across_sao_paulo_midnight', async () => {
  await checkInOn('2026-10-06');
  await checkInOn('2026-10-07');
  await checkInOn('2026-10-07');
  await checkInOn('2026-10-08');

  for (const instant of [NOON, BEFORE_TURN, AFTER_TURN]) {
    for (const role of ['admin', 'reception'] as const) {
      const client = await sessionAt(instant, role);
      const { checkIns } = await dashboard(client);
      const response = await client.get('/api/check-ins');
      expect(response.status, `${instant}, ${role}`).toBe(200);
      const { total } = (await response.json()) as CheckInsReport;

      expect(checkIns!.count, `${instant}, ${role}`).toBe(total);
    }
  }
});

// dukfit-app S3 - a série semanal do card de check-ins (door 2)

const seriesOf = (checkIns: DashboardResponse['checkIns']) => checkIns!.lastSevenDays.map(({ day, count }) => `${day}:${count}`);

test('last_seven_days_has_seven_days_oldest_first_with_zeros', async () => {
  await checkInOn('2026-10-01');
  await checkInOn('2026-10-01');
  await checkInOn('2026-10-04');
  for (let index = 0; index < 3; index += 1) await checkInOn('2026-10-07');

  for (const role of ['admin', 'reception'] as const) {
    const { today, checkIns } = await dashboard(sessions[role]);
    expect(today, role).toBe('2026-10-07');
    expect(seriesOf(checkIns), role).toEqual([
      '2026-10-01:2',
      '2026-10-02:0',
      '2026-10-03:0',
      '2026-10-04:1',
      '2026-10-05:0',
      '2026-10-06:0',
      '2026-10-07:3',
    ]);
  }
});

test('last_seven_days_leaves_out_days_outside_the_window', async () => {
  await checkInOn('2026-09-30');
  await checkInOn('2026-10-08');

  const { checkIns } = await dashboard(sessions.admin);
  expect(checkIns!.lastSevenDays).toHaveLength(7);
  expect(checkIns!.lastSevenDays.map(({ count }) => count)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(checkIns!.lastSevenDays[0]!.day).toBe('2026-10-01');
});

test('last_seven_days_last_item_is_today_and_equals_count_across_the_turn', async () => {
  await checkInOn('2026-10-02');
  await checkInOn('2026-10-07');
  await checkInOn('2026-10-07');
  await checkInOn('2026-10-08');

  for (const instant of [BEFORE_TURN, AFTER_TURN]) {
    const { today, checkIns } = await dashboard(await sessionAt(instant, 'reception'));
    const last = checkIns!.lastSevenDays.at(-1)!;
    expect(last.day, instant).toBe(today);
    expect(last.count, instant).toBe(checkIns!.count);
  }
  const after = await dashboard(await sessionAt(AFTER_TURN, 'reception'));
  // depois da virada a janela anda um dia: 2026-10-02 a 2026-10-08
  expect(seriesOf(after.checkIns)).toEqual([
    '2026-10-02:1',
    '2026-10-03:0',
    '2026-10-04:0',
    '2026-10-05:0',
    '2026-10-06:0',
    '2026-10-07:2',
    '2026-10-08:1',
  ]);
});

test('last_seven_days_absent_for_profiles_without_check_ins', async () => {
  await checkInOn('2026-10-07');

  for (const role of ROLES) {
    const response = await sessions[role].get('/api/dashboard');
    expect(response.status, role).toBe(200);
    const text = await response.text();
    expect(dashboardResponseSchema.safeParse(JSON.parse(text)).success, role).toBe(true);
    expect(text.includes('lastSevenDays'), role).toBe(role === 'admin' || role === 'reception');
  }
});
