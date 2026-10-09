import type { RegisteredPayment, Role } from '@academia/contracts';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import {
  PAYMENT_DATA_KEYS,
  PAYMENT_KEYS,
  insertPayment,
  paidCentsOf,
  paymentBody,
  paymentCount,
  paymentRow,
  paymentRowText,
  paymentRowWithoutVoidedAt,
  paymentRowsTextOf,
  paymentSnapshot,
  paymentsPath,
  registerPayment,
} from './support/payments.ts';
import { NOON, clockAt, databaseNow, enrollmentsPath, insertEnrollment, insertPlan } from './support/plans.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { cpfOf, fieldErrorPaths, insertStudents, releasedTogether, unknownId } from './support/students.ts';

let stack: Stack;
let admin: Client;
let hr: Client;
let reception: Client;
let instructor: Client;
let planId: string;
let counter = 9000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  // as sessões nascem no relógio controlado, que não anda sozinho: valem enquanto o teste estiver nele
  clockAt(NOON);
  admin = (await stack.session('admin')).client;
  hr = (await stack.session('hr_finance')).client;
  reception = (await stack.session('reception')).client;
  instructor = (await stack.session('instructor')).client;
  planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
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

/**
 * Um período de um aluno novo, direto no banco: por padrão o "mensal" de R$ 99,90 de 2026-10-07 a
 * 2026-11-06, que vence em 2026-10-07.
 */
async function newPeriod(
  options: { status?: string; priceCents?: number; startsAt?: string; endsAt?: string; cancelled?: boolean } = {},
) {
  const studentId = await newStudent(options.status);
  const enrollmentId = await insertEnrollment(stack, { studentId, planId, ...options });
  return { studentId, enrollmentId };
}

/** Move o relógio e abre, naquele instante, a sessão que as requisições seguintes usam. */
async function sessionAt(instant: string, role: Role = 'hr_finance') {
  clockAt(instant);
  return (await stack.session(role)).client;
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Confere um `422` com um item só, no `path` dado, e nada gravado desde a fotografia. */
async function expectRefusedOn(client: Client, studentId: string, body: unknown, path: string, label: string) {
  const before = await paymentSnapshot(stack);

  const response = await client.post(paymentsPath(studentId), body);

  expect(response.status, label).toBe(422);
  expect(await fieldErrorPaths(response), label).toEqual([path]);
  expect(await paymentSnapshot(stack), label).toEqual(before);
}

test('register_201_by_admin_and_hr_finance_with_the_seven_keys_five_methods_and_amount_edges', async () => {
  for (const [role, client] of [
    ['admin', admin],
    ['hr_finance', hr],
  ] as const) {
    const { studentId, enrollmentId } = await newPeriod();

    const t0 = await databaseNow(stack);
    const response = await client.post(paymentsPath(studentId), paymentBody(enrollmentId));
    const t1 = await databaseNow(stack);
    const body = (await response.json()) as RegisteredPayment;

    expect(response.status, role).toBe(201);
    expect(Object.keys(body).sort(), role).toEqual([...PAYMENT_KEYS].sort());
    // o `id` devolvido é o da única linha que passou a existir
    expect(await stack.query('select id from payments where enrollment_id = $1', [enrollmentId]), role).toEqual([{ id: body.id }]);
    expect(body.enrollmentId, role).toBe(enrollmentId);
    expect(body.amountCents, role).toBe(5000);
    expect(body.paidAt, role).toBe('2026-10-07');
    expect(body.method, role).toBe('pix');
    expect(body.createdAt, role).toMatch(ISO_INSTANT);
    expect(new Date(body.createdAt).toISOString(), role).toBe(body.createdAt);
    expect(new Date(body.createdAt).getTime(), role).toBeGreaterThanOrEqual(t0.getTime());
    expect(new Date(body.createdAt).getTime(), role).toBeLessThanOrEqual(t1.getTime());
    expect(body.voidedAt, role).toBeNull();
    expect(await paymentRow(stack, body.id), role).toMatchObject({
      id: body.id,
      enrollment_id: enrollmentId,
      amount_cents: 5000,
      paid_at: '2026-10-07',
      method: 'pix',
      voided_at: null,
    });
  }

  // cada uma das cinco formas é aceita e devolvida
  const { studentId, enrollmentId } = await newPeriod();
  for (const method of ['cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer']) {
    const response = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId, { amountCents: 1000, method }));
    const body = (await response.json()) as RegisteredPayment;

    expect(response.status, method).toBe(201);
    expect(body.method, method).toBe(method);
    expect((await paymentRow(stack, body.id))!.method, method).toBe(method);
  }

  // o menor valor e o saldo inteiro
  const small = await newPeriod();
  const one = await hr.post(paymentsPath(small.studentId), paymentBody(small.enrollmentId, { amountCents: 1 }));
  expect(one.status).toBe(201);
  expect(((await one.json()) as RegisteredPayment).amountCents).toBe(1);
  const whole = await newPeriod();
  const all = await hr.post(paymentsPath(whole.studentId), paymentBody(whole.enrollmentId, { amountCents: 9990 }));
  expect(all.status).toBe(201);
  expect(((await all.json()) as RegisteredPayment).amountCents).toBe(9990);
});

test('register_amount_seven_refusals_422_on_amount_cents_and_the_top_edge_accepted', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  const cases: Array<[label: string, amountCents: unknown]> = [
    ['ausente', undefined],
    ['null', null],
    ['0', 0],
    ['-1', -1],
    ['10000000', 10_000_000],
    ['99.9', 99.9],
    ['"5000"', '5000'],
  ];
  expect(cases).toHaveLength(7);
  for (const [label, amountCents] of cases) {
    await expectRefusedOn(hr, studentId, paymentBody(enrollmentId, { amountCents }), 'amountCents', label);
  }

  // o teto de R$ 99.999,99 é aceito num período que vale isso
  const top = await newPeriod({ priceCents: 9_999_999 });
  const response = await hr.post(paymentsPath(top.studentId), paymentBody(top.enrollmentId, { amountCents: 9_999_999 }));
  expect(response.status).toBe(201);
  expect(((await response.json()) as RegisteredPayment).amountCents).toBe(9_999_999);
});

test('register_paid_at_fourteen_cases_around_today_and_start_in_sao_paulo', async () => {
  let cases = 0;
  const period = await newPeriod();

  // relógio em 2026-10-07T15:00:00Z, o período começa em 2026-10-07
  const refused: Array<[label: string, paidAt: unknown]> = [
    ['ausente', undefined],
    ['null', null],
    ['2026-02-30', '2026-02-30'],
    ['2026-13-01', '2026-13-01'],
    ['26-10-07', '26-10-07'],
    ['07/10/2026', '07/10/2026'],
    ['amanhã', '2026-10-08'],
    ['366 dias antes do início', '2025-10-06'],
  ];
  expect(refused).toHaveLength(8);
  for (const [label, paidAt] of refused) {
    await expectRefusedOn(hr, period.studentId, paymentBody(period.enrollmentId, { amountCents: 1, paidAt }), 'paidAt', label);
    cases += 1;
  }
  for (const [label, paidAt] of [
    ['hoje', '2026-10-07'],
    ['365 dias antes do início', '2025-10-07'],
  ] as const) {
    const response = await hr.post(paymentsPath(period.studentId), paymentBody(period.enrollmentId, { amountCents: 1, paidAt }));
    expect(response.status, label).toBe(201);
    cases += 1;
  }

  // a virada do dia em São Paulo: 02:59:59Z ainda é o dia 7
  const late = await sessionAt('2026-10-08T02:59:59Z');
  await expectRefusedOn(late, period.studentId, paymentBody(period.enrollmentId, { amountCents: 1, paidAt: '2026-10-08' }), 'paidAt', '02:59:59Z, dia 8');
  cases += 1;
  const stillSeventh = await late.post(paymentsPath(period.studentId), paymentBody(period.enrollmentId, { amountCents: 1, paidAt: '2026-10-07' }));
  const stillSeventhBody = (await stillSeventh.json()) as RegisteredPayment;
  expect(stillSeventh.status, '02:59:59Z, dia 7').toBe(201);
  cases += 1;

  const turned = await sessionAt('2026-10-08T03:00:00Z');
  const eighth = await turned.post(paymentsPath(period.studentId), paymentBody(period.enrollmentId, { amountCents: 1, paidAt: '2026-10-08' }));
  const eighthBody = (await eighth.json()) as RegisteredPayment;
  expect(eighth.status, '03:00:00Z, dia 8').toBe(201);
  cases += 1;

  // o dia é gravado e devolvido como foi enviado, sem deslocamento de fuso, também a 02:59:59Z
  expect(stillSeventhBody.paidAt).toBe('2026-10-07');
  expect((await stack.query<{ paid_at: string }>(`select paid_at::text as paid_at from payments where id = $1`, [stillSeventhBody.id]))[0]!.paid_at).toBe('2026-10-07');
  expect(eighthBody.paidAt).toBe('2026-10-08');
  expect((await stack.query<{ paid_at: string }>(`select paid_at::text as paid_at from payments where id = $1`, [eighthBody.id]))[0]!.paid_at).toBe('2026-10-08');
  cases += 1;

  expect(cases).toBe(14);
});

test('register_method_eight_refusals_422_on_method', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  const cases: Array<[label: string, method: unknown]> = [
    ['ausente', undefined],
    ['null', null],
    ['vazio', ''],
    ['PIX', 'PIX'],
    ['Pix', 'Pix'],
    ['cheque', 'cheque'],
    ['boleto', 'boleto'],
    ['dinheiro', 'dinheiro'],
  ];
  expect(cases).toHaveLength(8);
  for (const [label, method] of cases) {
    await expectRefusedOn(hr, studentId, paymentBody(enrollmentId, { method }), 'method', label);
  }
});

test('register_six_invalid_enrollment_ids_422_on_enrollment_id', async () => {
  const { studentId } = await newPeriod();
  const ofAnother = (await newPeriod()).enrollmentId;
  const cases: Array<[label: string, enrollmentId: unknown]> = [
    ['ausente', undefined],
    ['null', null],
    ['abc', 'abc'],
    ['123', '123'],
    ['uuid de período nenhum', unknownId()],
    ['período de outro aluno', ofAnother],
  ];
  expect(cases).toHaveLength(6);
  for (const [label, enrollmentId] of cases) {
    await expectRefusedOn(hr, studentId, paymentBody('x', { enrollmentId }), 'enrollmentId', label);
  }
});

test('register_on_cancelled_period_409_enrollment_cancelled_three_cases', async () => {
  const cases: Array<[label: string, payments: number[], amountCents: number]> = [
    ['cancelado sem pagamento algum', [], 5000],
    ['cancelado com 5000 pagos, saldo 4990', [5000], 1000],
    // cancelado vem antes de "maior que o saldo": o saldo é zero e o motivo é o cancelamento
    ['cancelado depois de pago por inteiro, saldo zero', [9990], 1],
  ];
  for (const [label, payments, amountCents] of cases) {
    const { studentId, enrollmentId } = await newPeriod({ cancelled: true });
    for (const amount of payments) await insertPayment(stack, { enrollmentId, amountCents: amount });
    const before = await paymentSnapshot(stack);

    const response = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId, { amountCents }));

    expect(response.status, label).toBe(409);
    expect((await problem(response)).code, label).toBe('enrollment_cancelled');
    expect(await paymentSnapshot(stack), label).toEqual(before);
  }
});

test('register_above_balance_five_cases_409_payment_exceeds_balance', async () => {
  let cases = 0;
  const refusedWith = async (label: string, studentId: string, enrollmentId: string, amountCents: number) => {
    const before = await paymentSnapshot(stack);

    const response = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId, { amountCents }));

    expect(response.status, label).toBe(409);
    expect((await problem(response)).code, label).toBe('payment_exceeds_balance');
    expect(await paymentSnapshot(stack), label).toEqual(before);
    cases += 1;
  };

  const empty = await newPeriod();
  await refusedWith('9991 num período de 9990', empty.studentId, empty.enrollmentId, 9991);

  const partly = await newPeriod();
  await insertPayment(stack, { enrollmentId: partly.enrollmentId, amountCents: 5000 });
  await refusedWith('4991 com 5000 pagos', partly.studentId, partly.enrollmentId, 4991);

  const whole = await newPeriod();
  await insertPayment(stack, { enrollmentId: whole.enrollmentId, amountCents: 9990 });
  await refusedWith('1 num período pago por inteiro', whole.studentId, whole.enrollmentId, 1);

  const free = await newPeriod({ priceCents: 0 });
  await refusedWith('1 num período de valor zero', free.studentId, free.enrollmentId, 1);

  const twice = await newPeriod();
  await registerPayment(hr, twice.studentId, twice.enrollmentId, { amountCents: 5000 });
  await refusedWith('o segundo de dois 5000 seguidos', twice.studentId, twice.enrollmentId, 5000);

  expect(cases).toBe(5);
});

test('register_partial_twice_same_body_two_rows_then_the_rest_closes_the_balance', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  const body = paymentBody(enrollmentId, { amountCents: 3000 });

  const first = await hr.post(paymentsPath(studentId), body);
  const second = await hr.post(paymentsPath(studentId), body);

  expect([first.status, second.status]).toEqual([201, 201]);
  const ids = [((await first.json()) as RegisteredPayment).id, ((await second.json()) as RegisteredPayment).id];
  expect(ids[0]).not.toBe(ids[1]);
  expect(await paymentRowsTextOf(stack, enrollmentId)).toHaveLength(2);
  // soma 6000 e saldo 3990, escritos à mão
  expect(await paidCentsOf(stack, enrollmentId)).toBe(6000);

  const rest = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId, { amountCents: 3990 }));

  expect(rest.status).toBe(201);
  expect(await paidCentsOf(stack, enrollmentId)).toBe(9990);
  // saldo zero: nem um centavo a mais cabe. A situação `paid` na leitura é a da conta única (C5),
  // lida pelas rotas de leitura do batch B (C29, C30).
  const more = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId, { amountCents: 1 }));
  expect(more.status).toBe(409);
  expect((await problem(more)).code).toBe('payment_exceeds_balance');
});

test('register_on_scheduled_active_and_expired_period_201_alike', async () => {
  const cases: Array<[label: string, instant: string, paidAt: string]> = [
    ['agendado', '2026-10-06T15:00:00Z', '2026-10-06'],
    ['ativo', '2026-10-07T15:00:00Z', '2026-10-07'],
    ['vencido', '2026-11-07T15:00:00Z', '2026-11-07'],
  ];
  for (const [label, instant, paidAt] of cases) {
    const { studentId, enrollmentId } = await newPeriod({ startsAt: '2026-10-07', endsAt: '2026-11-06' });
    const client = await sessionAt(instant);

    const response = await client.post(paymentsPath(studentId), paymentBody(enrollmentId, { paidAt }));
    const body = (await response.json()) as RegisteredPayment;

    expect(response.status, label).toBe(201);
    expect(Object.keys(body).sort(), label).toEqual([...PAYMENT_KEYS].sort());
    expect(body.paidAt, label).toBe(paidAt);
  }
});

test('register_for_suspended_and_inactive_student_201_like_active', async () => {
  for (const status of ['suspended', 'inactive']) {
    const { studentId, enrollmentId } = await newPeriod({ status });

    const response = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId));
    const body = (await response.json()) as RegisteredPayment;

    expect(response.status, status).toBe(201);
    expect(Object.keys(body).sort(), status).toEqual([...PAYMENT_KEYS].sort());
    expect((await stack.query<{ status: string }>('select status from students where id = $1', [studentId]))[0]!.status, status).toBe(status);
  }
});

test('two_simultaneous_registers_over_the_balance_one_201_one_409', async () => {
  for (let round = 0; round < 10; round += 1) {
    const { studentId, enrollmentId } = await newPeriod();

    const { result: responses, rows } = await written(stack, () =>
      releasedTogether([
        () => hr.post(paymentsPath(studentId), paymentBody(enrollmentId, { amountCents: 6000 })),
        () => admin.post(paymentsPath(studentId), paymentBody(enrollmentId, { amountCents: 6000 })),
      ]),
    );

    expect(responses.map((response) => response.status).sort(), `rodada ${round}`).toEqual([201, 409]);
    const refused = responses.find((response) => response.status === 409)!;
    expect((await problem(refused)).code, `rodada ${round}`).toBe('payment_exceeds_balance');
    expect(await paymentRowsTextOf(stack, enrollmentId), `rodada ${round}`).toHaveLength(1);
    expect(await paidCentsOf(stack, enrollmentId), `rodada ${round}`).toBe(6000);
    expect(rows.filter((row) => row.action === 'student.payment_registered'), `rodada ${round}`).toHaveLength(1);
  }
});

test('payment_routes_404_for_non_uuid_and_unknown_student', async () => {
  const existing = await newPeriod();
  const paymentId = await insertPayment(stack, { enrollmentId: existing.enrollmentId });
  let cases = 0;

  for (const id of ['abc', unknownId()]) {
    const routes: Array<[method: string, path: string, body: unknown]> = [
      ['GET', paymentsPath(id), undefined],
      ['POST', paymentsPath(id), paymentBody(existing.enrollmentId, { amountCents: 1000 })],
      ['DELETE', `${paymentsPath(id)}/${paymentId}`, undefined],
    ];
    for (const [method, path, sent] of routes) {
      const before = await paymentSnapshot(stack);

      const response = await hr.request(method, path, { body: sent });

      expect(response.status, `${method} ${path}`).toBe(404);
      expect((await problem(response)).code, `${method} ${path}`).toBe('not_found');
      expect(await paymentSnapshot(stack), `${method} ${path}`).toEqual(before);
      cases += 1;
    }
  }

  expect(cases).toBe(6);
});

test('reception_and_instructor_everything_403_fourteen_cases', async () => {
  const existing = await newPeriod();
  const paymentId = await insertPayment(stack, { enrollmentId: existing.enrollmentId });
  const ids: Array<[label: string, student: string, enrollment: string, payment: string]> = [
    ['ids que existem', existing.studentId, existing.enrollmentId, paymentId],
    ['uuid de ninguém', unknownId(), unknownId(), unknownId()],
  ];
  type Case = [role: 'reception' | 'instructor', method: string, path: string, body: unknown, label: string];
  const cases: Case[] = [];
  for (const role of ['reception', 'instructor'] as const) {
    for (const [label, student, enrollment, payment] of ids) {
      cases.push(
        [role, 'GET', paymentsPath(student), undefined, label],
        [role, 'POST', paymentsPath(student), paymentBody(enrollment, { amountCents: 1000 }), label],
        [role, 'DELETE', `${paymentsPath(student)}/${payment}`, undefined, label],
      );
    }
    cases.push([role, 'GET', '/api/payments', undefined, 'lista geral']);
  }
  expect(cases).toHaveLength(14);

  const clients = { reception, instructor };
  for (const [role, method, path, sent, label] of cases) {
    const before = await paymentSnapshot(stack);

    const response = await clients[role].request(method, path, { body: sent });
    const body = (await response.json()) as Record<string, unknown>;

    const where = `${role} ${method} ${path} ${label}`;
    expect(response.status, where).toBe(403);
    expect(body.code, where).toBe('forbidden');
    for (const key of PAYMENT_DATA_KEYS) expect(Object.keys(body), `${where} ${key}`).not.toContain(key);
    expect(await paymentSnapshot(stack), where).toEqual(before);
  }
  // o pagamento que o `DELETE` visava continua não anulado
  expect((await paymentRow(stack, paymentId))!.voided_at).toBeNull();
});

test('anonymous_401_on_four_payment_routes', async () => {
  const existing = await newPeriod();
  const paymentId = await insertPayment(stack, { enrollmentId: existing.enrollmentId });
  const client = stack.client();
  const routes: Array<[method: string, path: string, body: unknown]> = [
    ['GET', paymentsPath(existing.studentId), undefined],
    ['POST', paymentsPath(existing.studentId), paymentBody(existing.enrollmentId, { amountCents: 1000 })],
    ['DELETE', `${paymentsPath(existing.studentId)}/${paymentId}`, undefined],
    ['GET', '/api/payments', undefined],
  ];
  expect(routes).toHaveLength(4);

  for (const [method, path, sent] of routes) {
    const before = await paymentSnapshot(stack);

    const response = await client.request(method, path, { body: sent });

    expect(response.status, `${method} ${path}`).toBe(401);
    expect((await problem(response)).code, `${method} ${path}`).toBe('unauthorized');
    expect(await paymentSnapshot(stack), `${method} ${path}`).toEqual(before);
  }
});

test('void_204_sets_voided_at_from_database_and_keeps_row_and_other_columns', async () => {
  for (const [role, client] of [
    ['admin', admin],
    ['hr_finance', hr],
  ] as const) {
    const { studentId, enrollmentId } = await newPeriod();
    const paymentId = await insertPayment(stack, { enrollmentId });
    const before = await paymentRowWithoutVoidedAt(stack, paymentId);
    expect((await paymentRow(stack, paymentId))!.voided_at, role).toBeNull();

    const t0 = await databaseNow(stack);
    const response = await client.delete(`${paymentsPath(studentId)}/${paymentId}`);
    const t1 = await databaseNow(stack);

    expect(response.status, role).toBe(204);
    const after = await paymentRow(stack, paymentId);
    expect(after, role).toBeDefined();
    const voidedAt = new Date(after!.voided_at as string).getTime();
    expect(voidedAt, role).toBeGreaterThanOrEqual(t0.getTime());
    expect(voidedAt, role).toBeLessThanOrEqual(t1.getTime());
    expect(await paymentRowWithoutVoidedAt(stack, paymentId), role).toBe(before);
  }
});

test('void_of_voided_204_changes_nothing', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  const paymentId = await insertPayment(stack, { enrollmentId, voided: true });
  const before = await paymentRowText(stack, paymentId);
  expect(JSON.parse(before!).voided_at).not.toBeNull();

  const response = await hr.delete(`${paymentsPath(studentId)}/${paymentId}`);

  expect(response.status).toBe(204);
  expect(await paymentRowText(stack, paymentId)).toBe(before);
});

test('void_returns_the_value_to_the_balance_and_a_new_register_fits_it', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  const payment = await registerPayment(hr, studentId, enrollmentId, { amountCents: 9990 });

  const exceeds = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId, { amountCents: 1 }));
  expect(exceeds.status).toBe(409);
  expect((await problem(exceeds)).code).toBe('payment_exceeds_balance');

  expect((await hr.delete(`${paymentsPath(studentId)}/${payment.id}`)).status).toBe(204);
  // o saldo voltou a 9990: nada pago
  expect(await paidCentsOf(stack, enrollmentId)).toBe(0);

  const again = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId, { amountCents: 9990 }));
  expect(again.status).toBe(201);
  const over = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId, { amountCents: 1 }));
  expect(over.status).toBe(409);
  expect((await problem(over)).code).toBe('payment_exceeds_balance');
});

test('void_on_cancelled_period_204_like_on_a_live_one', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  const payment = await registerPayment(hr, studentId, enrollmentId, { amountCents: 5000 });
  const cancel = await hr.delete(`${enrollmentsPath(studentId)}/${enrollmentId}`);
  expect(cancel.status).toBe(204);
  expect((await stack.query<{ cancelled_at: Date | null }>('select cancelled_at from enrollments where id = $1', [enrollmentId]))[0]!.cancelled_at).not.toBeNull();
  const before = await paymentRowWithoutVoidedAt(stack, payment.id);

  const t0 = await databaseNow(stack);
  const response = await hr.delete(`${paymentsPath(studentId)}/${payment.id}`);
  const t1 = await databaseNow(stack);

  expect(response.status).toBe(204);
  const after = await paymentRow(stack, payment.id);
  const voidedAt = new Date(after!.voided_at as string).getTime();
  expect(voidedAt).toBeGreaterThanOrEqual(t0.getTime());
  expect(voidedAt).toBeLessThanOrEqual(t1.getTime());
  expect(await paymentRowWithoutVoidedAt(stack, payment.id)).toBe(before);
});

test('void_404_for_bad_unknown_and_other_students_payment_id', async () => {
  const mine = await newPeriod();
  const other = await newPeriod();
  const othersPayment = await insertPayment(stack, { enrollmentId: other.enrollmentId });
  const before = await paymentRowText(stack, othersPayment);
  const cases: Array<[label: string, paymentId: string]> = [
    ['abc', 'abc'],
    ['uuid de pagamento nenhum', unknownId()],
    ['pagamento de outro aluno', othersPayment],
  ];

  for (const [label, paymentId] of cases) {
    const snapshot = await paymentSnapshot(stack);

    const response = await hr.delete(`${paymentsPath(mine.studentId)}/${paymentId}`);

    expect(response.status, label).toBe(404);
    expect((await problem(response)).code, label).toBe('not_found');
    expect(await paymentSnapshot(stack), label).toEqual(snapshot);
  }
  // o pagamento do outro aluno fica idêntico, não anulado
  expect(await paymentRowText(stack, othersPayment)).toBe(before);
  expect(JSON.parse(before!).voided_at).toBeNull();
});

test('two_simultaneous_voids_204_204_one_voided_at_one_audit_row', async () => {
  for (let round = 0; round < 10; round += 1) {
    const { studentId, enrollmentId } = await newPeriod();
    const paymentId = await insertPayment(stack, { enrollmentId });

    const { result: responses, rows } = await written(stack, () =>
      releasedTogether([
        () => hr.delete(`${paymentsPath(studentId)}/${paymentId}`),
        () => admin.delete(`${paymentsPath(studentId)}/${paymentId}`),
      ]),
    );

    expect(responses.map((response) => response.status), `rodada ${round}`).toEqual([204, 204]);
    expect((await paymentRow(stack, paymentId))!.voided_at, `rodada ${round}`).not.toBeNull();
    expect(await paymentRowsTextOf(stack, enrollmentId), `rodada ${round}`).toHaveLength(1);
    expect(rows.filter((row) => row.action === 'student.payment_voided'), `rodada ${round}`).toHaveLength(1);
  }
  expect(await paymentCount(stack)).toBeGreaterThanOrEqual(10);
});
