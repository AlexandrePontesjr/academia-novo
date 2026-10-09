import type { OpenPaymentsResponse, Role, StudentPaymentsResponse } from '@academia/contracts';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { auditCount } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { insertPayment, paymentSnapshot, paymentsPath, registerPayment } from './support/payments.ts';
import { NOON, clockAt, enrollmentsPath, insertEnrollment, insertPlan } from './support/plans.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { cpfOf, fieldErrorPaths, insertStudents } from './support/students.ts';

let stack: Stack;
let admin: Client;
let hr: Client;
let planId: string;
let counter = 9500;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  // as sessões nascem no relógio controlado, que não anda sozinho: valem enquanto o teste estiver nele
  clockAt(NOON);
  admin = (await stack.session('admin')).client;
  hr = (await stack.session('hr_finance')).client;
  planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
}, 180_000);

// salvo quando o caso diz outra coisa, hoje é 7 de outubro de 2026 em São Paulo
beforeEach(() => clockAt(NOON));

afterAll(async () => {
  vi.useRealTimers();
  await stack?.close();
});

const newStudent = async (status = 'active', name = `Aluno ${next()}`) =>
  (await insertStudents(stack, [{ name, cpf: cpfOf(next()), status }]))[0]!;

interface PeriodOptions {
  status?: string;
  name?: string;
  startsAt?: string;
  endsAt?: string;
  priceCents?: number;
  cancelled?: boolean;
  /** `alive` põe uma confirmação viva por SQL; `undone` uma desfeita. */
  payment?: 'alive' | 'undone';
}

/** Um período de um aluno novo, direto no banco; por padrão o de 2026-10-07 a 2026-11-06. */
async function newPeriod(options: PeriodOptions = {}) {
  const studentId = await newStudent(options.status, options.name);
  const enrollmentId = await insertEnrollment(stack, { studentId, planId, ...options });
  if (options.payment) await insertPayment(stack, { enrollmentId, voided: options.payment === 'undone' });
  return { studentId, enrollmentId };
}

/** Nenhum período nem pagamento no banco: as asserções sobre a lista geral inteira partem daqui. */
async function emptyTheLedger() {
  await stack.query('delete from payments');
  await stack.query('delete from enrollments');
}

/** Move o relógio e abre, naquele instante, a sessão que as requisições seguintes usam. */
async function sessionAt(instant: string, role: Role = 'hr_finance') {
  clockAt(instant);
  return (await stack.session(role)).client;
}

async function ficha(client: Client, studentId: string) {
  const response = await client.get(paymentsPath(studentId));
  expect(response.status, 'leitura da ficha').toBe(200);
  return ((await response.json()) as StudentPaymentsResponse).items;
}

async function openList(client: Client, query = '') {
  const response = await client.get(`/api/payments${query}`);
  expect(response.status, `leitura da lista geral ${query}`).toBe(200);
  return ((await response.json()) as OpenPaymentsResponse).items;
}

const FICHA_KEYS = ['dueDate', 'endsAt', 'enrollmentId', 'payment', 'plan', 'priceCents', 'startsAt', 'status'];
const OPEN_KEYS = ['dueDate', 'endsAt', 'enrollmentId', 'plan', 'priceCents', 'startsAt', 'status', 'student'];

test('ficha_lists_every_period_with_eight_keys_ordered_by_starts_at_desc_then_id_desc', async () => {
  for (const [role, client] of [
    ['admin', admin],
    ['hr_finance', hr],
  ] as const) {
    const studentId = await newStudent();
    const december = await insertEnrollment(stack, { studentId, planId, startsAt: '2026-12-01', endsAt: '2026-12-31' });
    const august = await insertEnrollment(stack, { studentId, planId, startsAt: '2026-08-01', endsAt: '2026-08-31' });
    // o par empatado em 2026-10-07: um cancelado (as datas dele podem tocar as do outro) e um vivo
    const cancelled = await insertEnrollment(stack, { studentId, planId, startsAt: '2026-10-07', cancelled: true });
    const live = await insertEnrollment(stack, { studentId, planId, startsAt: '2026-10-07' });
    await insertPayment(stack, { enrollmentId: live });

    const items = await ficha(client, studentId);

    expect(items, role).toHaveLength(4);
    for (const item of items) expect(Object.keys(item).sort(), role).toEqual(FICHA_KEYS);
    expect(Object.keys(items[0]!.plan).sort(), role).toEqual(['id', 'name', 'period']);
    expect(items[0]!.plan, role).toEqual({ id: planId, name: 'Mensal', period: 'monthly' });
    const [tieFirst, tieSecond] = [cancelled, live].sort().reverse();
    expect(items.map((item) => item.enrollmentId), role).toEqual([december, tieFirst, tieSecond, august]);
  }

  // o mesmo desempate com o par inserido no outro sentido
  const studentId = await newStudent();
  const live = await insertEnrollment(stack, { studentId, planId, startsAt: '2026-10-07' });
  const cancelled = await insertEnrollment(stack, { studentId, planId, startsAt: '2026-10-07', cancelled: true });
  const [first, second] = [cancelled, live].sort().reverse();
  expect((await ficha(hr, studentId)).map((item) => item.enrollmentId)).toEqual([first, second]);
});

test('ficha_status_four_values_and_due_date_across_sao_paulo_midnight_without_changing_rows', async () => {
  const cancelled = await newPeriod({ cancelled: true, startsAt: '2026-09-01', endsAt: '2026-09-30' });
  const paid = await newPeriod({ payment: 'alive', startsAt: '2026-09-01', endsAt: '2026-09-30' });
  const overdue = await newPeriod({ startsAt: '2026-10-06', endsAt: '2026-11-05' });
  const todayDue = await newPeriod({ startsAt: '2026-10-07' });
  const later = await newPeriod({ startsAt: '2026-10-20', endsAt: '2026-11-19' });
  // abrir sessão também grava na trilha (o login): as sessões nascem antes da fotografia
  const beforeTurn = await sessionAt('2026-10-08T02:59:59Z');
  const afterTurn = await sessionAt('2026-10-08T03:00:00Z');
  clockAt(NOON);
  const before = await paymentSnapshot(stack);

  const expected: Array<[string, { studentId: string }, string, string]> = [
    ['cancelado', cancelled, 'cancelled', '2026-09-01'],
    ['pago', paid, 'paid', '2026-09-01'],
    ['vencimento anterior a hoje', overdue, 'overdue', '2026-10-06'],
    ['vencimento hoje', todayDue, 'pending', '2026-10-07'],
    ['vencimento depois de hoje', later, 'pending', '2026-10-20'],
  ];
  for (const [label, { studentId }, status, dueDate] of expected) {
    const [item] = await ficha(hr, studentId);
    expect(item!.status, label).toBe(status);
    expect(item!.dueDate, label).toBe(dueDate);
    expect(item!.dueDate, label).toBe(item!.startsAt);
  }

  // a virada do dia em São Paulo: 02:59:59 UTC ainda é o dia 7, 03:00:00 UTC já é o dia 8
  clockAt('2026-10-08T02:59:59Z');
  expect((await ficha(beforeTurn, todayDue.studentId))[0]!.status).toBe('pending');
  clockAt('2026-10-08T03:00:00Z');
  expect((await ficha(afterTurn, todayDue.studentId))[0]!.status).toBe('overdue');

  // ler não mudou nenhuma linha
  expect(await paymentSnapshot(stack)).toEqual(before);
});

test('ficha_payment_is_the_alive_one_with_two_keys_or_null', async () => {
  const never = await newPeriod();
  const onlyUndone = await newPeriod({ payment: 'undone' });
  const confirmed = await newPeriod();
  const payment = await registerPayment(hr, confirmed.studentId, confirmed.enrollmentId);

  expect((await ficha(hr, never.studentId))[0]!.payment).toBeNull();
  expect((await ficha(hr, onlyUndone.studentId))[0]!.payment).toBeNull();
  const [alive] = await ficha(hr, confirmed.studentId);
  expect(Object.keys(alive!.payment!).sort()).toEqual(['createdAt', 'id']);
  expect(alive!.payment!.id).toBe(payment.id);
  expect(alive!.payment!.createdAt).toBe(payment.createdAt);

  // desfeita e confirmada de novo, é a nova
  expect((await hr.delete(`${paymentsPath(confirmed.studentId)}/${payment.id}`)).status).toBe(204);
  expect((await ficha(hr, confirmed.studentId))[0]!.payment).toBeNull();
  const second = await registerPayment(hr, confirmed.studentId, confirmed.enrollmentId);
  expect(second.id).not.toBe(payment.id);
  expect((await ficha(hr, confirmed.studentId))[0]!.payment!.id).toBe(second.id);
});

test('ficha_of_student_without_period_200_empty', async () => {
  const studentId = await newStudent();

  const response = await hr.get(paymentsPath(studentId));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [] });
});

test('ficha_shows_current_plan_name_and_recorded_price', async () => {
  const plan = await insertPlan(stack, { name: 'Mensal Antigo', period: 'monthly', priceCents: 9990 });
  const studentId = await newStudent();
  await insertEnrollment(stack, { studentId, planId: plan, priceCents: 9990 });
  await stack.query(`update plans set name = 'Mensal Novo', price_cents = 12990 where id = $1`, [plan]);

  const [item] = await ficha(hr, studentId);

  expect(item!.plan).toEqual({ id: plan, name: 'Mensal Novo', period: 'monthly' });
  expect(item!.priceCents).toBe(9990);
});

test('ficha_of_confirmed_then_cancelled_period_keeps_payment_and_says_cancelled', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  const payment = await registerPayment(hr, studentId, enrollmentId);
  expect((await hr.delete(`${enrollmentsPath(studentId)}/${enrollmentId}`)).status).toBe(204);

  const [item] = await ficha(hr, studentId);

  expect(item!.status).toBe('cancelled');
  expect(item!.payment!.id).toBe(payment.id);
});

test('open_list_every_unpaid_period_of_any_student_status_eight_keys_ordered_by_due_date_then_id', async () => {
  await emptyTheLedger();
  // dois alunos com o mesmo vencimento (o empate), de situações diferentes, e um vencimento mais antigo
  const tieA = await newPeriod({ status: 'active', name: 'Ana Souza' });
  const tieB = await newPeriod({ status: 'inactive', name: 'Bia Lima' });
  const older = await newPeriod({ status: 'suspended', name: 'Caio Nunes', startsAt: '2026-10-01', endsAt: '2026-10-31' });
  const newer = await newPeriod({ status: 'active', startsAt: '2026-10-20', endsAt: '2026-11-19' });

  for (const [role, client] of [
    ['admin', admin],
    ['hr_finance', hr],
  ] as const) {
    const items = await openList(client);

    expect(items, role).toHaveLength(4);
    for (const item of items) expect(Object.keys(item).sort(), role).toEqual(OPEN_KEYS);
    expect(Object.keys(items[0]!.student).sort(), role).toEqual(['id', 'name']);
    expect(items[0]!.student, role).toEqual({ id: older.studentId, name: 'Caio Nunes' });
    expect(items[0]!.plan, role).toEqual({ id: planId, name: 'Mensal', period: 'monthly' });
    const [tieFirst, tieSecond] = [tieA.enrollmentId, tieB.enrollmentId].sort();
    expect(items.map((item) => item.enrollmentId), role).toEqual([older.enrollmentId, tieFirst, tieSecond, newer.enrollmentId]);
    expect(items.map((item) => item.dueDate), role).toEqual(['2026-10-01', '2026-10-07', '2026-10-07', '2026-10-20']);
    expect(items.map((item) => item.status), role).toEqual(['overdue', 'pending', 'pending', 'pending']);
  }
});

test('open_list_filter_pending_and_overdue_across_sao_paulo_midnight', async () => {
  await emptyTheLedger();
  const d06 = await newPeriod({ startsAt: '2026-10-06', endsAt: '2026-11-05' });
  const d07 = await newPeriod({ startsAt: '2026-10-07' });
  const d08 = await newPeriod({ startsAt: '2026-10-08', endsAt: '2026-11-07' });
  const ids = (items: Array<{ enrollmentId: string }>) => items.map((item) => item.enrollmentId);

  // o relógio em NOON
  expect(ids(await openList(hr, '?status=pending'))).toEqual([d07.enrollmentId, d08.enrollmentId]);
  expect(ids(await openList(hr, '?status=overdue'))).toEqual([d06.enrollmentId]);

  // 02:59:59 UTC ainda é o dia 7: o de 07 está pendente
  const beforeTurn = await sessionAt('2026-10-08T02:59:59Z');
  expect(ids(await openList(beforeTurn, '?status=pending'))).toEqual([d07.enrollmentId, d08.enrollmentId]);
  expect(ids(await openList(beforeTurn, '?status=overdue'))).toEqual([d06.enrollmentId]);

  // 03:00:00 UTC é o dia 8: o de 07 passa a atrasado
  const afterTurn = await sessionAt('2026-10-08T03:00:00Z');
  expect(ids(await openList(afterTurn, '?status=pending'))).toEqual([d08.enrollmentId]);
  expect(ids(await openList(afterTurn, '?status=overdue'))).toEqual([d06.enrollmentId, d07.enrollmentId]);
});

test('open_list_status_eight_refusals_422_on_status', async () => {
  const queries: Array<[label: string, query: string]> = [
    ['paid', '?status=paid'],
    ['cancelled', '?status=cancelled'],
    ['vazio', '?status='],
    ['Pending', '?status=Pending'],
    ['pending com espaço', '?status=pending%20'],
    ['all', '?status=all'],
    ['pending e overdue juntos', '?status=pending&status=overdue'],
    ['pending repetido', '?status=pending&status=pending'],
  ];
  expect(queries).toHaveLength(8);

  for (const [label, query] of queries) {
    const response = await hr.get(`/api/payments${query}`);
    const body = (await response.clone().json()) as Record<string, unknown>;

    expect(response.status, label).toBe(422);
    expect((await problem(response.clone())).code, label).toBe('validation_failed');
    expect(await fieldErrorPaths(response), label).toEqual(['status']);
    expect(Object.keys(body), label).not.toContain('items');
  }
});

test('open_list_leaves_out_cancelled_and_confirmed_and_keeps_undone', async () => {
  await emptyTheLedger();
  await newPeriod({ cancelled: true });
  await newPeriod({ cancelled: true, payment: 'alive' });
  await newPeriod({ payment: 'alive' });
  const undone = await newPeriod({ payment: 'undone' });
  const toggled = await newPeriod();

  expect((await openList(hr)).map((item) => item.enrollmentId).sort()).toEqual([undone.enrollmentId, toggled.enrollmentId].sort());

  // confirmar tira o período da lista, e desfazer o devolve
  const payment = await registerPayment(hr, toggled.studentId, toggled.enrollmentId);
  expect((await openList(hr)).map((item) => item.enrollmentId)).toEqual([undone.enrollmentId]);
  expect((await hr.delete(`${paymentsPath(toggled.studentId)}/${payment.id}`)).status).toBe(204);
  expect((await openList(hr)).map((item) => item.enrollmentId).sort()).toEqual([undone.enrollmentId, toggled.enrollmentId].sort());
});

test('open_list_with_nothing_unpaid_200_empty', async () => {
  await emptyTheLedger();
  await newPeriod({ payment: 'alive' });
  await newPeriod({ cancelled: true });

  const response = await hr.get('/api/payments');

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [] });
});

test('open_list_and_ficha_agree_on_status_across_sao_paulo_midnight', async () => {
  await emptyTheLedger();
  const { studentId, enrollmentId } = await newPeriod({ startsAt: '2026-10-07' });

  for (const instant of [NOON, '2026-10-08T02:59:59Z', '2026-10-08T03:00:00Z']) {
    const client = await sessionAt(instant);

    const onFicha = (await ficha(client, studentId)).find((item) => item.enrollmentId === enrollmentId)!;
    const onList = (await openList(client)).find((item) => item.enrollmentId === enrollmentId)!;

    expect(onList.status, instant).toBe(onFicha.status);
    expect(onList.status, instant).toBe(instant === '2026-10-08T03:00:00Z' ? 'overdue' : 'pending');
  }
});

test('eight_reads_of_payments_write_no_audit_row', async () => {
  await emptyTheLedger();
  const empty = await newStudent();
  const before = await auditCount(stack);

  // vazias
  for (const client of [admin, hr]) {
    expect(await ficha(client, empty)).toEqual([]);
    expect(await openList(client)).toEqual([]);
  }
  // cheias
  const { studentId } = await newPeriod();
  const insertedAudit = await auditCount(stack);
  for (const client of [admin, hr]) {
    expect(await ficha(client, studentId)).toHaveLength(1);
    expect(await openList(client)).toHaveLength(1);
  }

  expect(insertedAudit).toBe(before);
  expect(await auditCount(stack)).toBe(before);
});
