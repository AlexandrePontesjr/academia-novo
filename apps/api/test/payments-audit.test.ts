import { request } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { WEB_ORIGIN } from './support/app.ts';
import { auditCount, auditRows, withAuditInsertFailing, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { insertPayment, paymentRow, paymentSnapshot, paymentsPath, paymentBody, registerPayment } from './support/payments.ts';
import { NOON, clockAt, insertEnrollment, insertPlan } from './support/plans.ts';
import { problem, type SeededUser, type Stack, startStack } from './support/stack.ts';
import { cpfOf, insertStudents, unknownId } from './support/students.ts';

let stack: Stack;
let admin: Client;
let adminUser: SeededUser;
let hr: Client;
let hrUser: SeededUser;
let reception: Client;
let planId: string;
let counter = 9800;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  // as sessões nascem no relógio controlado, que não anda sozinho: hoje é 7 de outubro de 2026 em São Paulo
  clockAt(NOON);
  ({ client: admin, user: adminUser } = await stack.session('admin'));
  ({ client: hr, user: hrUser } = await stack.session('hr_finance'));
  ({ client: reception } = await stack.session('reception'));
  planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
}, 180_000);

beforeEach(() => clockAt(NOON));

afterAll(async () => {
  vi.useRealTimers();
  await stack?.close();
});

const newStudent = async (overrides: { name?: string; cpf?: string } = {}) =>
  (await insertStudents(stack, [{ name: overrides.name ?? `Aluno ${next()}`, cpf: overrides.cpf ?? cpfOf(next()), status: 'active' }]))[0]!;

/** Um período de um aluno novo, direto no banco; por padrão o de R$ 99,90 de 2026-10-07 a 2026-11-06. */
async function newPeriod(options: { startsAt?: string; endsAt?: string; priceCents?: number; cancelled?: boolean; student?: { name?: string; cpf?: string } } = {}) {
  const studentId = await newStudent(options.student);
  const enrollmentId = await insertEnrollment(stack, { studentId, planId, ...options });
  return { studentId, enrollmentId };
}

test('confirm_writes_one_payment_confirmed_row', async () => {
  for (const [client, author] of [
    [admin, adminUser],
    [hr, hrUser],
  ] as const) {
    const { studentId, enrollmentId } = await newPeriod();

    const { result: response, rows } = await written(stack, () => client.post(paymentsPath(studentId), paymentBody(enrollmentId)));

    expect(response.status, author.email).toBe(201);
    expect(rows, author.email).toHaveLength(1);
    expect(rows[0], author.email).toMatchObject({
      action: 'student.payment_confirmed',
      user_id: author.id,
      entity: 'student',
      entity_id: studentId,
    });
  }
});

test('confirm_diff_records_start_and_price_with_null_from', async () => {
  const october = await newPeriod();
  const december = await newPeriod({ startsAt: '2026-12-01', endsAt: '2026-12-31', priceCents: 15000 });

  const first = await written(stack, () => hr.post(paymentsPath(october.studentId), paymentBody(october.enrollmentId)));
  const second = await written(stack, () => hr.post(paymentsPath(december.studentId), paymentBody(december.enrollmentId)));

  expect(first.rows[0]!.diff).toEqual({
    fields: ['startsAt', 'priceCents'],
    values: { startsAt: { from: null, to: '2026-10-07' }, priceCents: { from: null, to: 9990 } },
  });
  expect(second.rows[0]!.diff).toEqual({
    fields: ['startsAt', 'priceCents'],
    values: { startsAt: { from: null, to: '2026-12-01' }, priceCents: { from: null, to: 15000 } },
  });
});

test('undo_writes_one_payment_undone_row_with_null_to', async () => {
  for (const [client, author] of [
    [admin, adminUser],
    [hr, hrUser],
  ] as const) {
    const { studentId, enrollmentId } = await newPeriod();
    const paymentId = await insertPayment(stack, { enrollmentId });

    const { result: response, rows } = await written(stack, () => client.delete(`${paymentsPath(studentId)}/${paymentId}`));

    expect(response.status, author.email).toBe(204);
    expect(rows, author.email).toHaveLength(1);
    expect(rows[0], author.email).toMatchObject({
      action: 'student.payment_undone',
      user_id: author.id,
      entity: 'student',
      entity_id: studentId,
      diff: {
        fields: ['startsAt', 'priceCents'],
        values: { startsAt: { from: '2026-10-07', to: null }, priceCents: { from: 9990, to: null } },
      },
    });
  }
});

test('ten_non_writing_outcomes_write_no_audit_row', async () => {
  const live = await newPeriod();
  const cancelled = await newPeriod({ cancelled: true });
  const confirmed = await newPeriod();
  await insertPayment(stack, { enrollmentId: confirmed.enrollmentId });
  const undone = await newPeriod();
  const undonePayment = await insertPayment(stack, { enrollmentId: undone.enrollmentId, voided: true });
  const anonymous = stack.client();
  const aPayment = await insertPayment(stack, { enrollmentId: live.enrollmentId, voided: true });
  const missingStudent = unknownId();

  const cases: Array<[label: string, send: () => Promise<Response>, status: number]> = [
    ['POST sem sessão', () => anonymous.post(paymentsPath(live.studentId), paymentBody(live.enrollmentId)), 401],
    ['DELETE sem sessão', () => anonymous.delete(`${paymentsPath(live.studentId)}/${aPayment}`), 401],
    ['POST como reception', () => reception.post(paymentsPath(live.studentId), paymentBody(live.enrollmentId)), 403],
    ['DELETE como reception', () => reception.delete(`${paymentsPath(live.studentId)}/${aPayment}`), 403],
    ['POST de aluno que não existe', () => hr.post(paymentsPath(missingStudent), paymentBody(live.enrollmentId)), 404],
    ['DELETE de aluno que não existe', () => hr.delete(`${paymentsPath(missingStudent)}/${aPayment}`), 404],
    ['POST de período cancelado', () => hr.post(paymentsPath(cancelled.studentId), paymentBody(cancelled.enrollmentId)), 409],
    ['POST de período já confirmado', () => hr.post(paymentsPath(confirmed.studentId), paymentBody(confirmed.enrollmentId)), 409],
    ['POST com enrollmentId inválido', () => hr.post(paymentsPath(live.studentId), { enrollmentId: 'abc' }), 422],
    ['DELETE de pagamento já desfeito', () => hr.delete(`${paymentsPath(undone.studentId)}/${undonePayment}`), 204],
  ];
  expect(cases).toHaveLength(10);

  for (const [label, send, status] of cases) {
    const before = await auditCount(stack);

    const response = await send();

    expect(response.status, label).toBe(status);
    expect(await auditCount(stack), label).toBe(before);
  }
});

test('audit_insert_failure_500_rolls_back_confirm_and_undo', async () => {
  const toConfirm = await newPeriod();
  const toUndo = await newPeriod();
  const alive = await insertPayment(stack, { enrollmentId: toUndo.enrollmentId });
  const routes: Array<[name: string, send: () => Promise<Response>]> = [
    ['POST', () => hr.post(paymentsPath(toConfirm.studentId), paymentBody(toConfirm.enrollmentId))],
    ['DELETE', () => hr.delete(`${paymentsPath(toUndo.studentId)}/${alive}`)],
  ];

  for (const [name, send] of routes) {
    const before = await paymentSnapshot(stack);

    const response = await withAuditInsertFailing(stack, send);

    expect(response.status, name).toBe(500);
    expect((await problem(response)).code, name).toBe('internal_error');
    expect(await paymentSnapshot(stack), name).toEqual(before);
  }
  // o POST não deixou linha nova, e o DELETE deixou `voided_at` nulo
  expect(await stack.query('select id from payments where enrollment_id = $1', [toConfirm.enrollmentId])).toEqual([]);
  expect((await paymentRow(stack, alive))!.voided_at).toBeNull();
});

/** Uma requisição autenticada pelo `node:http`, que não acrescenta `User-Agent` nem mexe nos cabeçalhos dados. */
function send(method: string, path: string, client: Client, headers: Record<string, string>, body?: unknown) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<number>((resolve, reject) => {
    const req = request(
      `${stack.api.url}${path}`,
      {
        method,
        headers: {
          Origin: WEB_ORIGIN,
          Cookie: client.cookie(),
          ...(payload && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
          ...headers,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

test('ip_and_user_agent_four_cases_on_each_of_two_actions', async () => {
  const agent = `${'x'.repeat(512)}Z`;
  expect(agent).toHaveLength(513);
  const variants: Array<[label: string, headers: Record<string, string>, userAgent: string | null]> = [
    ['um valor só', { 'X-Forwarded-For': '203.0.113.7', 'User-Agent': 'teste/1.0' }, 'teste/1.0'],
    ['dois valores', { 'X-Forwarded-For': '198.51.100.1, 203.0.113.7', 'User-Agent': 'teste/1.0' }, 'teste/1.0'],
    ['User-Agent de 513 caracteres', { 'X-Forwarded-For': '203.0.113.7', 'User-Agent': agent }, agent.slice(0, 512)],
    ['sem User-Agent', { 'X-Forwarded-For': '203.0.113.7' }, null],
  ];
  expect(variants).toHaveLength(4);
  const actions: Array<[action: string, run: (headers: Record<string, string>) => Promise<number>, status: number]> = [
    [
      'student.payment_confirmed',
      async (headers) => {
        const { studentId, enrollmentId } = await newPeriod();
        return send('POST', paymentsPath(studentId), hr, headers, paymentBody(enrollmentId));
      },
      201,
    ],
    [
      'student.payment_undone',
      async (headers) => {
        const { studentId, enrollmentId } = await newPeriod();
        const paymentId = await insertPayment(stack, { enrollmentId });
        return send('DELETE', `${paymentsPath(studentId)}/${paymentId}`, hr, headers);
      },
      204,
    ],
  ];

  for (const [action, run, expected] of actions) {
    for (const [label, headers, userAgent] of variants) {
      const count = (await auditRows(stack)).length;
      const status = await run(headers);
      const rows = (await auditRows(stack)).slice(count).filter((row) => row.action === action);

      expect(status, `${action} ${label}`).toBe(expected);
      expect(rows, `${action} ${label}`).toHaveLength(1);
      expect(rows[0]!.ip, `${action} ${label}`).toBe('203.0.113.7');
      expect(rows[0]!.user_agent, `${action} ${label}`).toBe(userAgent);
    }
  }
});

test('student_name_and_cpf_never_reach_payment_audit_rows', async () => {
  const name = 'Rafaela Prado Cunha';
  const { studentId, enrollmentId } = await newPeriod({ student: { name, cpf: '52998224725' } });

  const confirmed = await registerPayment(hr, studentId, enrollmentId);
  expect((await hr.delete(`${paymentsPath(studentId)}/${confirmed.id}`)).status).toBe(204);

  const rows = (await auditRows(stack)).filter((row) => row.action.startsWith('student.payment_') && row.entity_id === studentId);
  expect(rows.map((row) => row.action).sort()).toEqual(['student.payment_confirmed', 'student.payment_undone']);
  const text = rows.map((row) => JSON.stringify(row)).join('\n');
  expect(text).toContain(studentId);
  const secrets = [name, 'Rafaela', 'Prado', 'Cunha', '529.982.247-25', '52998224725', '529982247'];
  expect(secrets.filter((secret) => text.includes(secret))).toEqual([]);
});
