import { request } from 'node:http';
import type { Plan } from '@academia/contracts';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { WEB_ORIGIN } from './support/app.ts';
import { auditCount, auditRows, withAuditInsertFailing, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { NOON, clockAt, createPlan, enroll, enrollmentsPath, insertPlan, planBody } from './support/plans.ts';
import { problem, type SeededUser, type Stack, startStack } from './support/stack.ts';
import { cpfOf, createStudent, insertStudents, studentBody, unknownId } from './support/students.ts';

let stack: Stack;
let admin: Client;
let adminUser: SeededUser;
let hr: Client;
let hrUser: SeededUser;
let reception: Client;
let counter = 6000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  // as sessões nascem no relógio controlado, que não anda sozinho: hoje é 7 de outubro de 2026 em São Paulo
  clockAt(NOON);
  ({ client: admin, user: adminUser } = await stack.session('admin'));
  ({ client: hr, user: hrUser } = await stack.session('hr_finance'));
  ({ client: reception } = await stack.session('reception'));
}, 180_000);

beforeEach(() => clockAt(NOON));

afterAll(async () => {
  vi.useRealTimers();
  await stack?.close();
});

const newStudent = async (status = 'active') =>
  (await insertStudents(stack, [{ name: `Aluno ${next()}`, cpf: cpfOf(counter), status }]))[0]!;

/** Todas as linhas de `plans` e de `enrollments`, como texto, para a comparação "ficou como estava". */
const rowsSnapshot = async () => {
  const textOf = async (table: 'plans' | 'enrollments') =>
    (await stack.query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by id`)).map((entry) => entry.row);
  return { plans: await textOf('plans'), enrollments: await textOf('enrollments') };
};

test('create_writes_one_plan_created_row', async () => {
  for (const [client, author] of [
    [admin, adminUser],
    [hr, hrUser],
  ] as const) {
    const { result: response, rows } = await written(stack, () => client.post('/api/plans', planBody()));
    const created = (await response.json()) as Plan;

    expect(response.status, author.email).toBe(201);
    expect(rows, author.email).toHaveLength(1);
    expect(rows[0], author.email).toMatchObject({
      action: 'plan.created',
      user_id: author.id,
      entity: 'plan',
      entity_id: created.id,
    });
  }
});

test('create_diff_records_four_values_and_names_rules_only', async () => {
  const values = {
    name: { from: null, to: 'Mensal' },
    period: { from: null, to: 'monthly' },
    priceCents: { from: null, to: 9990 },
    status: { from: null, to: 'active' },
  };

  const short = await written(stack, () => hr.post('/api/plans', { name: 'Mensal', period: 'monthly', priceCents: 9990 }));

  expect(short.result.status).toBe(201);
  expect(short.rows).toHaveLength(1);
  expect(short.rows[0]!.diff).toEqual({ fields: ['name', 'period', 'priceCents', 'status'], values });

  const rules = 'Acesso livre de segunda a sábado, das 6h às 22h';
  const full = await written(stack, () => hr.post('/api/plans', { name: 'Mensal', period: 'monthly', priceCents: 9990, rules }));

  expect(full.result.status).toBe(201);
  expect(full.rows).toHaveLength(1);
  const diff = full.rows[0]!.diff as { fields: string[]; values: Record<string, unknown> };
  expect(diff.fields).toContain('rules');
  expect([...diff.fields].sort()).toEqual(['name', 'period', 'priceCents', 'rules', 'status']);
  // de `rules` a trilha guarda só o nome: `values` continua com as quatro chaves
  expect(Object.keys(diff.values).sort()).toEqual(['name', 'period', 'priceCents', 'status']);
  expect(diff.values).toEqual(values);
});

test('patch_writes_one_plan_updated_row_with_values_and_rules_by_name', async () => {
  const created = await createPlan(hr, planBody({ name: 'Mensal', priceCents: 9990, rules: 'Acesso livre de segunda a sábado, das 6h às 22h' }));

  const both = await written(stack, () => hr.patch(`/api/plans/${created.id}`, { priceCents: 10_990, rules: 'Somente manhãs, até as 12h' }));

  expect(both.result.status).toBe(200);
  expect(both.rows).toHaveLength(1);
  expect(both.rows[0]).toMatchObject({ action: 'plan.updated', user_id: hrUser.id, entity: 'plan', entity_id: created.id });
  expect(both.rows[0]!.diff).toEqual({ fields: ['priceCents', 'rules'], values: { priceCents: { from: 9990, to: 10_990 } } });

  const nameOnly = await written(stack, () => admin.patch(`/api/plans/${created.id}`, { name: 'Mensal Plus' }));

  expect(nameOnly.result.status).toBe(200);
  expect(nameOnly.rows).toHaveLength(1);
  expect(nameOnly.rows[0]).toMatchObject({ action: 'plan.updated', user_id: adminUser.id, entity: 'plan', entity_id: created.id });
  expect(nameOnly.rows[0]!.diff).toEqual({ fields: ['name'], values: { name: { from: 'Mensal', to: 'Mensal Plus' } } });
});

test('reactivation_diff_records_status_from_inactive_to_active', async () => {
  const planId = await insertPlan(stack, { name: 'Volta à Linha', status: 'inactive' });

  const { result, rows } = await written(stack, () => hr.patch(`/api/plans/${planId}`, { status: 'active' }));

  expect(result.status).toBe(200);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'plan.updated', user_id: hrUser.id, entity: 'plan', entity_id: planId });
  expect(rows[0]!.diff).toEqual({ fields: ['status'], values: { status: { from: 'inactive', to: 'active' } } });
});

test('patch_without_change_six_cases_writes_no_row', async () => {
  const withRules = await createPlan(hr, planBody({ rules: 'Acesso livre' }));
  const withoutRules = await createPlan(hr, planBody());
  expect(withoutRules.rules).toBeNull();
  expect(withRules.status).toBe('active');
  const cases: Array<[label: string, plan: Plan, body: Record<string, unknown>]> = [
    ['name com o valor que já tem', withRules, { name: withRules.name }],
    ['priceCents com o valor que já tem', withRules, { priceCents: withRules.priceCents }],
    ['rules com o valor que já tem', withRules, { rules: withRules.rules }],
    ['rules null sobre um plano sem rules', withoutRules, { rules: null }],
    ['status active sobre um plano active', withRules, { status: 'active' }],
    ['corpo vazio', withRules, {}],
  ];
  expect(cases).toHaveLength(6);

  for (const [label, plan, body] of cases) {
    const count = await auditCount(stack);

    const response = await hr.patch(`/api/plans/${plan.id}`, body);

    expect(response.status, label).toBe(200);
    expect(await auditCount(stack), label).toBe(count);
  }
});

test('inactivate_writes_one_plan_inactivated_row', async () => {
  const created = await createPlan(hr, planBody());
  expect(created.status).toBe('active');

  const { result, rows } = await written(stack, () => hr.delete(`/api/plans/${created.id}`));

  expect(result.status).toBe(204);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'plan.inactivated', user_id: hrUser.id, entity: 'plan', entity_id: created.id });
  expect(rows[0]!.diff).toEqual({ fields: ['status'], values: { status: { from: 'active', to: 'inactive' } } });
});

test('enroll_writes_one_enrollment_created_row_with_null_from', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
  const studentId = await newStudent();

  const { result, rows } = await written(stack, () => hr.post(enrollmentsPath(studentId), { planId, startsAt: '2026-10-07' }));

  expect(result.status).toBe(201);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'student.enrollment_created', user_id: hrUser.id, entity: 'student', entity_id: studentId });
  expect(rows[0]!.diff).toEqual({
    fields: ['planId', 'startsAt', 'endsAt', 'priceCents'],
    values: {
      planId: { from: null, to: planId },
      startsAt: { from: null, to: '2026-10-07' },
      endsAt: { from: null, to: '2026-11-06' },
      priceCents: { from: null, to: 9990 },
    },
  });
});

test('cancel_writes_one_enrollment_cancelled_row_with_null_to', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
  const studentId = await newStudent();
  const created = await enroll(hr, studentId, planId, '2026-10-07');

  const { result, rows } = await written(stack, () => admin.delete(`${enrollmentsPath(studentId)}/${created.id}`));

  expect(result.status).toBe(204);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'student.enrollment_cancelled', user_id: adminUser.id, entity: 'student', entity_id: studentId });
  expect(rows[0]!.diff).toEqual({
    fields: ['planId', 'startsAt', 'endsAt', 'priceCents'],
    values: {
      planId: { from: planId, to: null },
      startsAt: { from: '2026-10-07', to: null },
      endsAt: { from: '2026-11-06', to: null },
      priceCents: { from: 9990, to: null },
    },
  });
});

test('twenty_seven_non_writing_outcomes_write_no_audit_row', async () => {
  const anonymous = stack.client();
  const instructor = (await stack.session('instructor')).client;
  const plan = await insertPlan(stack, { name: 'Plano Alvo' });
  const inactivePlan = await insertPlan(stack, { name: 'Plano Inativo', status: 'inactive' });
  const student = await newStudent();
  const inactiveStudent = await newStudent('inactive');
  const enrolled = await newStudent();
  const enrollment = await enroll(hr, enrolled, plan, '2026-10-07');
  const cancelledOf = await newStudent();
  const cancelled = await enroll(hr, cancelledOf, plan, '2026-10-07');
  expect((await hr.delete(`${enrollmentsPath(cancelledOf)}/${cancelled.id}`)).status).toBe(204);
  const ghost = unknownId();
  const valid = { planId: plan, startsAt: '2026-10-07' };
  const cases: Array<[name: string, expected: number, code: string | null, send: () => Promise<Response>]> = [
    ['POST /api/plans 401', 401, null, () => anonymous.post('/api/plans', planBody())],
    ['POST /api/plans 403', 403, null, () => reception.post('/api/plans', planBody())],
    ['POST /api/plans 422', 422, null, () => hr.post('/api/plans', planBody({ priceCents: -1 }))],
    ['PATCH /api/plans/:id 401', 401, null, () => anonymous.patch(`/api/plans/${plan}`, { name: 'Qualquer' })],
    ['PATCH /api/plans/:id 403', 403, null, () => reception.patch(`/api/plans/${plan}`, { name: 'Qualquer' })],
    ['PATCH /api/plans/:id 404', 404, null, () => hr.patch(`/api/plans/${ghost}`, { name: 'Qualquer' })],
    ['PATCH /api/plans/:id 422', 422, null, () => hr.patch(`/api/plans/${plan}`, { status: 'inactive' })],
    ['DELETE /api/plans/:id 401', 401, null, () => anonymous.delete(`/api/plans/${plan}`)],
    ['DELETE /api/plans/:id 403', 403, null, () => reception.delete(`/api/plans/${plan}`)],
    ['DELETE /api/plans/:id 404', 404, null, () => hr.delete(`/api/plans/${ghost}`)],
    ['DELETE /api/plans/:id de plano já inativo 204', 204, null, () => hr.delete(`/api/plans/${inactivePlan}`)],
    ['POST matrícula 401', 401, null, () => anonymous.post(enrollmentsPath(student), valid)],
    ['POST matrícula 403', 403, null, () => reception.post(enrollmentsPath(student), valid)],
    ['POST matrícula 404', 404, null, () => hr.post(enrollmentsPath(ghost), valid)],
    ['POST matrícula 422', 422, null, () => hr.post(enrollmentsPath(student), { planId: plan, startsAt: '2026-02-30' })],
    ['POST matrícula 409 enrollment_overlap', 409, 'enrollment_overlap', () => hr.post(enrollmentsPath(enrolled), valid)],
    ['POST matrícula 409 plan_inactive', 409, 'plan_inactive', () => hr.post(enrollmentsPath(student), { ...valid, planId: inactivePlan })],
    ['POST matrícula 409 student_inactive', 409, 'student_inactive', () => hr.post(enrollmentsPath(inactiveStudent), valid)],
    ['DELETE matrícula 401', 401, null, () => anonymous.delete(`${enrollmentsPath(enrolled)}/${enrollment.id}`)],
    ['DELETE matrícula 403', 403, null, () => reception.delete(`${enrollmentsPath(enrolled)}/${enrollment.id}`)],
    ['DELETE matrícula 404', 404, null, () => hr.delete(`${enrollmentsPath(enrolled)}/${ghost}`)],
    ['DELETE de matrícula já cancelada 204', 204, null, () => hr.delete(`${enrollmentsPath(cancelledOf)}/${cancelled.id}`)],
    ['GET /api/plans 401', 401, null, () => anonymous.get('/api/plans')],
    ['GET /api/plans 403', 403, null, () => instructor.get('/api/plans')],
    ['GET matrículas 401', 401, null, () => anonymous.get(enrollmentsPath(enrolled))],
    ['GET matrículas 403', 403, null, () => instructor.get(enrollmentsPath(enrolled))],
    ['GET matrículas 404', 404, null, () => hr.get(enrollmentsPath(ghost))],
  ];
  expect(cases).toHaveLength(27);

  for (const [name, expected, code, send] of cases) {
    const count = await auditCount(stack);

    const response = await send();

    expect(response.status, name).toBe(expected);
    if (code) expect((await problem(response)).code, name).toBe(code);
    expect(await auditCount(stack), name).toBe(count);
  }
});

test('audit_insert_failure_500_rolls_back_five_write_routes', async () => {
  const toPatch = await insertPlan(stack, { name: 'Alvo da Edição', priceCents: 9990 });
  const toInactivate = await insertPlan(stack, { name: 'Alvo da Inativação' });
  const plan = await insertPlan(stack, { name: 'Mensal' });
  const student = await newStudent();
  const enrolled = await newStudent();
  const enrollment = await enroll(hr, enrolled, plan, '2026-10-07');
  const routes: Array<[name: string, send: () => Promise<Response>]> = [
    ['POST /api/plans', () => hr.post('/api/plans', planBody())],
    ['PATCH /api/plans/:id', () => hr.patch(`/api/plans/${toPatch}`, { priceCents: 10_990 })],
    ['DELETE /api/plans/:id', () => hr.delete(`/api/plans/${toInactivate}`)],
    ['POST matrícula', () => hr.post(enrollmentsPath(student), { planId: plan, startsAt: '2026-10-07' })],
    ['DELETE matrícula', () => hr.delete(`${enrollmentsPath(enrolled)}/${enrollment.id}`)],
  ];
  expect(routes).toHaveLength(5);

  for (const [name, send] of routes) {
    const before = await rowsSnapshot();

    const response = await withAuditInsertFailing(stack, send);

    expect(response.status, name).toBe(500);
    expect((await problem(response)).code, name).toBe('internal_error');
    expect(await rowsSnapshot(), name).toEqual(before);
  }
  // o que cada rota teria mudado ficou como estava
  const [patched] = await stack.query<{ price_cents: number }>('select price_cents from plans where id = $1', [toPatch]);
  expect(patched!.price_cents).toBe(9990);
  const [kept] = await stack.query<{ status: string }>('select status from plans where id = $1', [toInactivate]);
  expect(kept!.status).toBe('active');
  const [alive] = await stack.query<{ cancelled_at: Date | null }>('select cancelled_at from enrollments where id = $1', [enrollment.id]);
  expect(alive!.cancelled_at).toBeNull();
  expect(await stack.query('select id from enrollments where student_id = $1', [student])).toEqual([]);
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

test('ip_and_user_agent_three_cases_on_each_of_five_actions', async () => {
  const agent = `teste/1.0 ${'x'.repeat(600)}`.slice(0, 512) + 'Z';
  expect(agent).toHaveLength(513);
  const twoHops = { 'X-Forwarded-For': '198.51.100.1, 203.0.113.7' };
  const oneHop = { 'X-Forwarded-For': '203.0.113.7' };
  const variants: Array<[label: string, headers: Record<string, string>, userAgent: string | null]> = [
    ['dois valores e User-Agent de 513', { ...twoHops, 'User-Agent': agent }, agent.slice(0, 512)],
    ['um valor só', { ...oneHop, 'User-Agent': agent }, agent.slice(0, 512)],
    ['sem User-Agent', twoHops, null],
  ];
  expect(variants).toHaveLength(3);
  const plan = await insertPlan(stack, { name: 'Mensal' });
  const actions: Array<[action: string, run: (headers: Record<string, string>) => Promise<number>]> = [
    ['plan.created', (headers) => send('POST', '/api/plans', hr, headers, planBody())],
    [
      'plan.updated',
      async (headers) => send('PATCH', `/api/plans/${await insertPlan(stack)}`, hr, headers, { priceCents: 10_990 }),
    ],
    ['plan.inactivated', async (headers) => send('DELETE', `/api/plans/${await insertPlan(stack)}`, hr, headers)],
    [
      'student.enrollment_created',
      async (headers) => send('POST', enrollmentsPath(await newStudent()), hr, headers, { planId: plan, startsAt: '2026-10-07' }),
    ],
    [
      'student.enrollment_cancelled',
      async (headers) => {
        const studentId = await newStudent();
        const created = await enroll(hr, studentId, plan, '2026-10-07');
        return send('DELETE', `${enrollmentsPath(studentId)}/${created.id}`, hr, headers);
      },
    ],
  ];
  expect(actions).toHaveLength(5);

  for (const [action, run] of actions) {
    for (const [label, headers, userAgent] of variants) {
      const count = (await auditRows(stack)).length;
      const status = await run(headers);
      const rows = (await auditRows(stack)).slice(count).filter((row) => row.action === action);

      expect([200, 201, 204], `${action} ${label}`).toContain(status);
      expect(rows, `${action} ${label}`).toHaveLength(1);
      expect(rows[0]!.ip, `${action} ${label}`).toBe('203.0.113.7');
      expect(rows[0]!.user_agent, `${action} ${label}`).toBe(userAgent);
    }
  }
});

test('student_name_cpf_and_rules_text_never_reach_audit_logs', async () => {
  const firstRules = 'Acesso livre de segunda a sábado, das 6h às 22h';
  const secondRules = 'Somente manhãs, até as 12h';
  const secrets = ['Rafaela Prado Cunha', '529.982.247-25', '52998224725', firstRules, secondRules];
  const auditText = async () =>
    (await stack.query<{ row: string }>('select to_jsonb(a)::text as row from audit_logs a order by id')).map((entry) => entry.row).join('\n');

  const student = await createStudent(reception, studentBody(next(), { name: 'Rafaela Prado Cunha', cpf: '529.982.247-25' }));
  const plan = await createPlan(hr, planBody({ rules: firstRules }));
  expect((await hr.patch(`/api/plans/${plan.id}`, { rules: secondRules })).status).toBe(200);
  const created = await enroll(hr, student.id, plan.id, '2026-10-07');
  expect((await hr.delete(`${enrollmentsPath(student.id)}/${created.id}`)).status).toBe(204);

  const text = await auditText();
  // as cinco linhas existem e apontam para a aluna e para o plano, só pelo id
  for (const action of ['student.created', 'plan.created', 'plan.updated', 'student.enrollment_created', 'student.enrollment_cancelled']) {
    expect(text, action).toContain(action);
  }
  expect(text).toContain(student.id);
  expect(text).toContain(plan.id);
  expect(secrets.filter((secret) => text.includes(secret))).toEqual([]);
});
