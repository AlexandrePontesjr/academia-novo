import type { RegisteredPayment } from '@academia/contracts';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import {
  PAYMENT_DATA_KEYS,
  PAYMENT_KEYS,
  aliveCountOf,
  insertPayment,
  paymentBody,
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
async function newPeriod(options: { status?: string; startsAt?: string; endsAt?: string; cancelled?: boolean } = {}) {
  const studentId = await newStudent(options.status);
  const enrollmentId = await insertEnrollment(stack, { studentId, planId, ...options });
  return { studentId, enrollmentId };
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

test('confirm_201_by_admin_and_hr_finance_with_three_keys_and_database_instant', async () => {
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
    expect(body.createdAt, role).toMatch(ISO_INSTANT);
    expect(new Date(body.createdAt).toISOString(), role).toBe(body.createdAt);
    expect(new Date(body.createdAt).getTime(), role).toBeGreaterThanOrEqual(t0.getTime());
    expect(new Date(body.createdAt).getTime(), role).toBeLessThanOrEqual(t1.getTime());
    expect(await paymentRow(stack, body.id), role).toMatchObject({ id: body.id, enrollment_id: enrollmentId, voided_at: null });
  }
});

test('confirm_six_invalid_enrollment_ids_422_on_enrollment_id', async () => {
  const mine = await newPeriod();
  const other = await newPeriod();
  const cases: Array<[label: string, body: unknown]> = [
    ['ausente', {}],
    ['null', { enrollmentId: null }],
    ['"abc"', { enrollmentId: 'abc' }],
    ['123', { enrollmentId: 123 }],
    ['uuid de nenhum período', { enrollmentId: unknownId() }],
    ['uuid de período de outro aluno', { enrollmentId: other.enrollmentId }],
  ];
  expect(cases).toHaveLength(6);

  for (const [label, body] of cases) {
    const before = await paymentSnapshot(stack);

    const response = await hr.post(paymentsPath(mine.studentId), body);

    expect(response.status, label).toBe(422);
    expect((await problem(response.clone())).code, label).toBe('validation_failed');
    expect(await fieldErrorPaths(response), label).toEqual(['enrollmentId']);
    expect(await paymentSnapshot(stack), label).toEqual(before);
  }
});

test('confirm_on_cancelled_period_409_enrollment_cancelled_three_cases', async () => {
  const withoutPayment = await newPeriod({ cancelled: true });
  const withUndone = await newPeriod({ cancelled: true });
  await insertPayment(stack, { enrollmentId: withUndone.enrollmentId, voided: true });
  // aqui valem as duas recusas; o cancelamento vence
  const withAlive = await newPeriod({ cancelled: true });
  await insertPayment(stack, { enrollmentId: withAlive.enrollmentId });

  for (const [label, { studentId, enrollmentId }] of [
    ['cancelado sem pagamento', withoutPayment],
    ['cancelado com confirmação desfeita', withUndone],
    ['cancelado com confirmação viva', withAlive],
  ] as const) {
    const before = await paymentSnapshot(stack);

    const response = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId));

    expect(response.status, label).toBe(409);
    expect((await problem(response)).code, label).toBe('enrollment_cancelled');
    expect(await paymentSnapshot(stack), label).toEqual(before);
  }
});

test('confirm_on_confirmed_period_409_payment_already_confirmed_three_cases', async () => {
  const afterPost = await newPeriod();
  await registerPayment(hr, afterPost.studentId, afterPost.enrollmentId);
  const bySql = await newPeriod();
  await insertPayment(stack, { enrollmentId: bySql.enrollmentId });
  const afterUndo = await newPeriod();
  const first = await registerPayment(hr, afterUndo.studentId, afterUndo.enrollmentId);
  expect((await hr.delete(`${paymentsPath(afterUndo.studentId)}/${first.id}`)).status).toBe(204);
  await registerPayment(hr, afterUndo.studentId, afterUndo.enrollmentId);

  for (const [label, { studentId, enrollmentId }] of [
    ['depois de um POST', afterPost],
    ['confirmação posta por SQL', bySql],
    ['depois de desfazer e confirmar de novo', afterUndo],
  ] as const) {
    const before = await paymentSnapshot(stack);

    const response = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId));

    expect(response.status, label).toBe(409);
    expect((await problem(response)).code, label).toBe('payment_already_confirmed');
    expect(await paymentSnapshot(stack), label).toEqual(before);
  }
});

test('confirm_on_scheduled_active_and_expired_period_201_alike', async () => {
  const cases: Array<[label: string, startsAt: string, endsAt: string]> = [
    ['agendado', '2026-12-01', '2026-12-31'],
    ['ativo', '2026-10-07', '2026-11-06'],
    ['vencido', '2026-08-01', '2026-08-31'],
  ];
  for (const [label, startsAt, endsAt] of cases) {
    const { studentId, enrollmentId } = await newPeriod({ startsAt, endsAt });

    const response = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId));
    const body = (await response.json()) as RegisteredPayment;

    expect(response.status, label).toBe(201);
    expect(Object.keys(body).sort(), label).toEqual([...PAYMENT_KEYS].sort());
    expect(body.enrollmentId, label).toBe(enrollmentId);
  }
});

test('confirm_for_inactive_and_suspended_student_201_like_active', async () => {
  for (const status of ['active', 'inactive', 'suspended']) {
    const { studentId, enrollmentId } = await newPeriod({ status });

    const response = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId));
    const body = (await response.json()) as RegisteredPayment;

    expect(response.status, status).toBe(201);
    expect(Object.keys(body).sort(), status).toEqual([...PAYMENT_KEYS].sort());
    expect((await stack.query<{ status: string }>('select status from students where id = $1', [studentId]))[0]!.status, status).toBe(status);
  }
});

test('two_simultaneous_confirms_one_201_one_409_over_ten_rounds', async () => {
  for (let round = 0; round < 10; round += 1) {
    const { studentId, enrollmentId } = await newPeriod();

    const { result: responses, rows } = await written(stack, () =>
      releasedTogether([
        () => hr.post(paymentsPath(studentId), paymentBody(enrollmentId)),
        () => admin.post(paymentsPath(studentId), paymentBody(enrollmentId)),
      ]),
    );

    expect(responses.map((response) => response.status).sort(), `rodada ${round}`).toEqual([201, 409]);
    const refused = responses.find((response) => response.status === 409)!;
    expect((await problem(refused)).code, `rodada ${round}`).toBe('payment_already_confirmed');
    expect(await aliveCountOf(stack, enrollmentId), `rodada ${round}`).toBe(1);
    expect(await paymentRowsTextOf(stack, enrollmentId), `rodada ${round}`).toHaveLength(1);
    expect(rows.filter((row) => row.action === 'student.payment_confirmed'), `rodada ${round}`).toHaveLength(1);
  }
});

test('student_routes_404_for_non_uuid_and_unknown_student_on_all_three', async () => {
  const existing = await newPeriod();
  const paymentId = await insertPayment(stack, { enrollmentId: existing.enrollmentId, voided: true });
  let cases = 0;

  for (const id of ['abc', unknownId()]) {
    const routes: Array<[method: string, path: string, body: unknown]> = [
      ['GET', paymentsPath(id), undefined],
      // o período é válido, de outro aluno: ainda assim é o aluno que não existe que responde
      ['POST', paymentsPath(id), paymentBody(existing.enrollmentId)],
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

test('reception_and_instructor_everything_403_sixteen_cases', async () => {
  const existing = await newPeriod();
  const paymentId = await insertPayment(stack, { enrollmentId: existing.enrollmentId });
  const ids: Array<[label: string, student: string, enrollment: string, payment: string, query: string]> = [
    ['ids que existem', existing.studentId, existing.enrollmentId, paymentId, ''],
    ['uuid de ninguém', unknownId(), unknownId(), unknownId(), '?status=overdue'],
  ];
  type Case = [role: 'reception' | 'instructor', method: string, path: string, body: unknown, label: string];
  const cases: Case[] = [];
  for (const role of ['reception', 'instructor'] as const) {
    for (const [label, student, enrollment, payment, query] of ids) {
      cases.push(
        [role, 'GET', paymentsPath(student), undefined, label],
        [role, 'POST', paymentsPath(student), paymentBody(enrollment), label],
        [role, 'DELETE', `${paymentsPath(student)}/${payment}`, undefined, label],
        [role, 'GET', `/api/payments${query}`, undefined, label],
      );
    }
  }
  expect(cases).toHaveLength(16);

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
  // o pagamento que o `DELETE` visava continua vivo
  expect((await paymentRow(stack, paymentId))!.voided_at).toBeNull();
});

test('anonymous_401_on_four_payment_routes', async () => {
  const existing = await newPeriod();
  const paymentId = await insertPayment(stack, { enrollmentId: existing.enrollmentId });
  const client = stack.client();
  const routes: Array<[method: string, path: string, body: unknown]> = [
    ['GET', paymentsPath(existing.studentId), undefined],
    ['POST', paymentsPath(existing.studentId), paymentBody(existing.enrollmentId)],
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

test('undo_204_sets_voided_at_from_database_and_keeps_row_and_other_columns', async () => {
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
    expect(await response.text(), role).toBe('');
    const voidedAt = new Date(String((await paymentRow(stack, paymentId))!.voided_at));
    expect(voidedAt.getTime(), role).toBeGreaterThanOrEqual(t0.getTime());
    expect(voidedAt.getTime(), role).toBeLessThanOrEqual(t1.getTime());
    // a linha continua, e nada mais nela mudou
    expect(await paymentRowWithoutVoidedAt(stack, paymentId), role).toBe(before);
  }
});

test('undo_of_undone_204_changes_nothing', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  const paymentId = await insertPayment(stack, { enrollmentId, voided: true });
  const before = await paymentRowText(stack, paymentId);
  const snapshot = await paymentSnapshot(stack);

  const response = await hr.delete(`${paymentsPath(studentId)}/${paymentId}`);

  expect(response.status).toBe(204);
  expect(await paymentRowText(stack, paymentId)).toBe(before);
  expect(await paymentSnapshot(stack)).toEqual(snapshot);
});

test('confirm_again_after_undo_201_new_row_old_row_kept', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  const first = await registerPayment(hr, studentId, enrollmentId);
  expect((await hr.delete(`${paymentsPath(studentId)}/${first.id}`)).status).toBe(204);
  const undone = await paymentRowText(stack, first.id);

  const response = await hr.post(paymentsPath(studentId), paymentBody(enrollmentId));
  const second = (await response.json()) as RegisteredPayment;

  expect(response.status).toBe(201);
  expect(second.id).not.toBe(first.id);
  // a linha desfeita continua lá, igual, e só a nova está viva
  expect(await paymentRowText(stack, first.id)).toBe(undone);
  expect(await paymentRowsTextOf(stack, enrollmentId)).toHaveLength(2);
  expect(await stack.query('select id from payments where enrollment_id = $1 and voided_at is null', [enrollmentId])).toEqual([{ id: second.id }]);
});

test('undo_on_cancelled_period_204_like_on_a_live_one', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  const payment = await registerPayment(hr, studentId, enrollmentId);
  // cancelado depois de confirmado, pela rota de matrícula que já existe
  expect((await hr.delete(`${enrollmentsPath(studentId)}/${enrollmentId}`)).status).toBe(204);
  expect((await paymentRow(stack, payment.id))!.voided_at).toBeNull();
  const before = await paymentRowWithoutVoidedAt(stack, payment.id);

  const t0 = await databaseNow(stack);
  const response = await hr.delete(`${paymentsPath(studentId)}/${payment.id}`);
  const t1 = await databaseNow(stack);

  expect(response.status).toBe(204);
  const voidedAt = new Date(String((await paymentRow(stack, payment.id))!.voided_at));
  expect(voidedAt.getTime()).toBeGreaterThanOrEqual(t0.getTime());
  expect(voidedAt.getTime()).toBeLessThanOrEqual(t1.getTime());
  expect(await paymentRowWithoutVoidedAt(stack, payment.id)).toBe(before);
});

test('undo_404_for_bad_unknown_and_other_students_payment_id', async () => {
  const mine = await newPeriod();
  const other = await newPeriod();
  const othersPayment = await insertPayment(stack, { enrollmentId: other.enrollmentId });
  const cases: Array<[label: string, id: string]> = [
    ['não-uuid', 'abc'],
    ['uuid de pagamento nenhum', unknownId()],
    ['pagamento de outro aluno', othersPayment],
  ];

  for (const [label, id] of cases) {
    const before = await paymentSnapshot(stack);

    const response = await hr.delete(`${paymentsPath(mine.studentId)}/${id}`);

    expect(response.status, label).toBe(404);
    expect((await problem(response)).code, label).toBe('not_found');
    expect(await paymentSnapshot(stack), label).toEqual(before);
  }
  // o pagamento do outro aluno continua vivo
  expect((await paymentRow(stack, othersPayment))!.voided_at).toBeNull();
});

test('two_simultaneous_undos_204_204_one_voided_at_one_audit_row_over_ten_rounds', async () => {
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
    const voided = await stack.query<{ n: string }>('select count(voided_at) as n from payments where id = $1', [paymentId]);
    expect(Number(voided[0]!.n), `rodada ${round}`).toBe(1);
    expect(rows.filter((row) => row.action === 'student.payment_undone'), `rodada ${round}`).toHaveLength(1);
  }
});

test('cancelling_a_period_leaves_its_payment_rows_identical_and_writes_only_its_own_audit_row', async () => {
  const { studentId, enrollmentId } = await newPeriod();
  // uma desfeita e uma viva no mesmo período
  const undone = await insertPayment(stack, { enrollmentId, voided: true });
  const alive = await insertPayment(stack, { enrollmentId });
  const before = { undone: await paymentRowText(stack, undone), alive: await paymentRowText(stack, alive) };

  const { result: response, rows } = await written(stack, () => hr.delete(`${enrollmentsPath(studentId)}/${enrollmentId}`));

  expect(response.status).toBe(204);
  expect({ undone: await paymentRowText(stack, undone), alive: await paymentRowText(stack, alive) }).toEqual(before);
  expect(rows.map((row) => row.action)).toEqual(['student.enrollment_cancelled']);
});

test('confirm_racing_undo_never_5xx_and_leaves_at_most_one_alive_row_over_ten_rounds', async () => {
  for (let round = 0; round < 10; round += 1) {
    const { studentId, enrollmentId } = await newPeriod();
    const paymentId = await insertPayment(stack, { enrollmentId });

    const { result: responses, rows } = await written(stack, () =>
      releasedTogether([
        () => hr.post(paymentsPath(studentId), paymentBody(enrollmentId)),
        () => admin.delete(`${paymentsPath(studentId)}/${paymentId}`),
      ]),
    );
    const [confirm, undo] = responses as [Response, Response];

    expect(undo.status, `rodada ${round}`).toBe(204);
    const actions = rows.map((row) => row.action).sort();
    if (confirm.status === 201) {
      expect(await aliveCountOf(stack, enrollmentId), `rodada ${round}`).toBe(1);
      expect(actions, `rodada ${round}`).toEqual(['student.payment_confirmed', 'student.payment_undone']);
    } else {
      expect(confirm.status, `rodada ${round}`).toBe(409);
      expect((await problem(confirm)).code, `rodada ${round}`).toBe('payment_already_confirmed');
      expect(await aliveCountOf(stack, enrollmentId), `rodada ${round}`).toBe(0);
      expect(actions, `rodada ${round}`).toEqual(['student.payment_undone']);
    }
  }
});
