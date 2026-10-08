import type { Plan, PlansResponse, Role } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient } from './support/client.ts';
import {
  PLAN_DATA_KEYS,
  PLAN_KEYS,
  createPlan,
  enrollmentRowsTextOfPlan,
  insertEnrollment,
  insertPlan,
  planBody,
  planCount,
  planRow,
  planRowText,
  planRowWithoutUpdateInstant,
  planSnapshot,
} from './support/plans.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { cpfOf, fieldErrorPaths, insertStudents, releasedTogether, unknownId } from './support/students.ts';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

/** Um texto do tamanho pedido, com um caractere acentuado dentro. */
const accented = (length: number) => `é${'a'.repeat(length - 1)}`;

const planIds = async () => (await stack.query<{ id: string }>('select id from plans')).map((row) => row.id);

test('create_201_by_admin_and_hr_finance_with_the_six_keys_and_four_periods', async () => {
  for (const role of ['admin', 'hr_finance'] as Role[]) {
    const { client } = await stack.session(role);
    const before = await planIds();

    const response = await client.post('/api/plans', { name: 'Mensal', period: 'monthly', priceCents: 9990 });
    const body = (await response.json()) as Plan;

    expect(response.status, role).toBe(201);
    expect(Object.keys(body).sort(), role).toEqual([...PLAN_KEYS].sort());
    // o `id` devolvido é o da única linha que passou a existir
    const created = (await planIds()).filter((id) => !before.includes(id));
    expect(created, role).toEqual([body.id]);
    expect(body, role).toEqual({ id: body.id, name: 'Mensal', period: 'monthly', priceCents: 9990, rules: null, status: 'active' });
    expect(await planRow(stack, body.id), role).toMatchObject({ id: body.id, name: 'Mensal', period: 'monthly', price_cents: 9990, rules: null, status: 'active' });

    // com `rules` enviado, ele volta igual
    const rules = 'Acesso livre de segunda a sábado, das 6h às 22h';
    const withRules = await client.post('/api/plans', { name: 'Mensal', period: 'monthly', priceCents: 9990, rules });
    expect(withRules.status, `${role} com rules`).toBe(201);
    const withRulesBody = (await withRules.json()) as Plan;
    expect(Object.keys(withRulesBody).sort(), `${role} com rules`).toEqual([...PLAN_KEYS].sort());
    expect(withRulesBody.rules, `${role} com rules`).toBe(rules);
    expect((await planRow(stack, withRulesBody.id))!.rules, `${role} com rules`).toBe(rules);

    // cada uma das quatro periodicidades é aceita e devolvida
    for (const period of ['monthly', 'quarterly', 'semiannual', 'annual']) {
      const ofPeriod = await client.post('/api/plans', { name: `Plano ${period}`, period, priceCents: 9990 });
      expect(ofPeriod.status, `${role} ${period}`).toBe(201);
      const ofPeriodBody = (await ofPeriod.json()) as Plan;
      expect(ofPeriodBody.period, `${role} ${period}`).toBe(period);
      expect((await planRow(stack, ofPeriodBody.id))!.period, `${role} ${period}`).toBe(period);
    }
  }
});

test('create_twenty_one_refusals_422_with_field_path_and_four_edges_accepted', async () => {
  const { client } = await stack.session('hr_finance');
  const without = (field: string) => Object.fromEntries(Object.entries(planBody()).filter(([key]) => key !== field));
  const refused: Array<[field: string, label: string, body: Record<string, unknown>]> = [
    ['name', 'ausente', without('name')],
    ['name', 'vazio', planBody({ name: '' })],
    ['name', 'só espaços', planBody({ name: '   ' })],
    ['name', '81 caracteres', planBody({ name: accented(81) })],
    ['period', 'ausente', without('period')],
    ['period', 'null', planBody({ period: null })],
    ['period', 'vazio', planBody({ period: '' })],
    ['period', 'weekly', planBody({ period: 'weekly' })],
    ['period', 'Monthly', planBody({ period: 'Monthly' })],
    ['period', 'mensal', planBody({ period: 'mensal' })],
    ['priceCents', 'ausente', without('priceCents')],
    ['priceCents', 'null', planBody({ priceCents: null })],
    ['priceCents', '-1', planBody({ priceCents: -1 })],
    ['priceCents', '10000000', planBody({ priceCents: 10_000_000 })],
    ['priceCents', '99.9', planBody({ priceCents: 99.9 })],
    ['priceCents', '"9990"', planBody({ priceCents: '9990' })],
    ['rules', 'vazio', planBody({ rules: '' })],
    ['rules', 'só espaços', planBody({ rules: '   ' })],
    ['rules', '501 caracteres', planBody({ rules: accented(501) })],
    ['name', 'U+0000', planBody({ name: 'Men\u0000sal' })],
    ['rules', 'U+0000', planBody({ rules: 'Acesso\u0000livre' })],
  ];
  expect(refused).toHaveLength(21);

  for (const [field, label, body] of refused) {
    const total = await planCount(stack);

    const response = await client.post('/api/plans', body);

    expect(response.status, `${field} ${label}`).toBe(422);
    expect(await fieldErrorPaths(response), `${field} ${label}`).toContain(field);
    expect(await planCount(stack), `${field} ${label}`).toBe(total);
  }

  const accepted: Array<[label: string, body: Record<string, unknown>]> = [
    ['name de 80 caracteres', planBody({ name: accented(80) })],
    ['rules de 500 caracteres', planBody({ rules: accented(500) })],
    ['priceCents 0', planBody({ priceCents: 0 })],
    ['priceCents 9999999', planBody({ priceCents: 9_999_999 })],
  ];
  expect(accepted).toHaveLength(4);
  for (const [label, body] of accepted) {
    const total = await planCount(stack);

    const response = await client.post('/api/plans', body);

    expect(response.status, label).toBe(201);
    expect(await planCount(stack), label).toBe(total + 1);
  }
});

test('create_with_an_existing_name_201_and_two_rows', async () => {
  const { client } = await stack.session('hr_finance');
  const name = 'Plano Homônimo';
  const first = await createPlan(client, planBody({ name }));

  const response = await client.post('/api/plans', planBody({ name }));
  const second = (await response.json()) as Plan;

  expect(response.status).toBe(201);
  expect(second.id).not.toBe(first.id);
  const rows = await stack.query<{ id: string }>('select id from plans where name = $1 order by id', [name]);
  expect(rows.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
});

test('list_all_statuses_ordered_by_folded_name_then_id_same_body_for_three_roles', async () => {
  await stack.query('delete from enrollments');
  await stack.query('delete from plans');
  const id = (n: number) => `018f0000-0000-7000-8000-00000000000${n}`;
  // os ids não seguem a ordem dos nomes: `Zen` tem o menor, e em cada par de homônimos o empate é o `id` quem decide
  const seeded: Array<{ id: string; name: string; status?: string }> = [
    { id: id(0), name: 'Zen' },
    { id: id(6), name: 'Mensal' },
    { id: id(5), name: 'Mensal', status: 'inactive' },
    { id: id(4), name: 'bronze' },
    { id: id(3), name: 'Bronze' },
    { id: id(2), name: 'Ágil' },
    { id: id(1), name: 'agil' },
  ];
  for (const plan of seeded) await insertPlan(stack, plan);
  // a ordem esperada, escrita à mão: nome sem caixa nem acento e, no empate, `id`
  const expected = [
    { id: id(1), name: 'agil', status: 'active' },
    { id: id(2), name: 'Ágil', status: 'active' },
    { id: id(3), name: 'Bronze', status: 'active' },
    { id: id(4), name: 'bronze', status: 'active' },
    { id: id(5), name: 'Mensal', status: 'inactive' },
    { id: id(6), name: 'Mensal', status: 'active' },
    { id: id(0), name: 'Zen', status: 'active' },
  ];

  const bodies: string[] = [];
  for (const role of ['admin', 'hr_finance', 'reception'] as Role[]) {
    const { client } = await stack.session(role);

    const response = await client.get('/api/plans');
    const text = await response.text();
    const body = JSON.parse(text) as PlansResponse;

    expect(response.status, role).toBe(200);
    expect(Object.keys(body), role).toEqual(['items']);
    for (const item of body.items) expect(Object.keys(item).sort(), `${role} ${item.id}`).toEqual([...PLAN_KEYS].sort());
    expect(body.items.map(({ id: planId, name, status }) => ({ id: planId, name, status })), role).toEqual(expected);
    expect(body.items.map((item) => [item.period, item.priceCents, item.rules]), role).toEqual(expected.map(() => ['monthly', 9990, null]));
    bodies.push(text);
  }
  expect(bodies).toHaveLength(3);
  expect(new Set(bodies).size).toBe(1);
});

/** As chaves da linha cujo valor mudou entre as duas leituras. */
const changedKeys = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));

test('reception_writes_and_instructor_everything_403_eleven_cases', async () => {
  const existing = await insertPlan(stack, { name: 'Plano Guardado', rules: 'Regras que ninguém sem permissão lê' });
  const ids: Array<[label: string, id: string]> = [
    ['plano que existe', existing],
    ['uuid de plano nenhum', unknownId()],
  ];
  type Case = [role: 'reception' | 'instructor', method: string, path: string, body: unknown, label: string];
  const onId = (role: Case[0]): Case[] =>
    ids.flatMap(([label, id]): Case[] => [
      [role, 'PATCH', `/api/plans/${id}`, { name: 'Outro Nome' }, label],
      [role, 'DELETE', `/api/plans/${id}`, undefined, label],
    ]);
  const cases: Case[] = [
    ['reception', 'POST', '/api/plans', planBody(), ''],
    ...onId('reception'),
    ['instructor', 'GET', '/api/plans', undefined, ''],
    ['instructor', 'POST', '/api/plans', planBody(), ''],
    ...onId('instructor'),
  ];
  expect(cases).toHaveLength(11);
  expect(cases.filter(([role]) => role === 'reception')).toHaveLength(5);
  expect(cases.filter(([role]) => role === 'instructor')).toHaveLength(6);

  const clients = {
    reception: (await stack.session('reception')).client,
    instructor: (await stack.session('instructor')).client,
  };
  for (const [role, method, path, sent, label] of cases) {
    const before = await planSnapshot(stack);

    const response = await clients[role].request(method, path, { body: sent });
    const body = (await response.json()) as Record<string, unknown>;

    const where = `${role} ${method} ${path} ${label}`;
    expect(response.status, where).toBe(403);
    expect(body.code, where).toBe('forbidden');
    for (const key of PLAN_DATA_KEYS) expect(Object.keys(body), `${where} ${key}`).not.toContain(key);
    expect(await planSnapshot(stack), where).toEqual(before);
  }
});

test('anonymous_401_on_four_plan_routes', async () => {
  const existing = await insertPlan(stack, { name: 'Plano Sem Sessão' });
  const client = createClient(stack.api.url);
  const routes: Array<[method: string, path: string, body: unknown]> = [
    ['GET', '/api/plans', undefined],
    ['POST', '/api/plans', planBody()],
    ['PATCH', `/api/plans/${existing}`, { name: 'Outro Nome' }],
    ['DELETE', `/api/plans/${existing}`, undefined],
  ];
  expect(routes).toHaveLength(4);

  for (const [method, path, sent] of routes) {
    const before = await planSnapshot(stack);

    const response = await client.request(method, path, { body: sent });

    expect(response.status, `${method} ${path}`).toBe(401);
    expect((await problem(response)).code, `${method} ${path}`).toBe('unauthorized');
    expect(await planSnapshot(stack), `${method} ${path}`).toEqual(before);
  }
});

test('patch_each_of_three_fields_and_all_together_keeps_the_rest', async () => {
  const NEW_VALUES: Record<string, unknown> = { name: 'Mensal Plus', priceCents: 10_990, rules: 'Somente manhãs, até as 12h' };
  const cases = [...Object.keys(NEW_VALUES).map((field) => [field]), Object.keys(NEW_VALUES)];
  expect(cases).toHaveLength(4);

  for (const role of ['admin', 'hr_finance'] as Role[]) {
    const { client } = await stack.session(role);
    for (const fields of cases) {
      const created = await createPlan(client, planBody({ rules: 'Acesso livre de segunda a sábado, das 6h às 22h' }));
      const before = (await planRowWithoutUpdateInstant(stack, created.id))!;
      const sent = Object.fromEntries(Object.entries(NEW_VALUES).filter(([field]) => fields.includes(field)));
      const label = `${role} ${fields.join('+')}`;

      const response = await client.patch(`/api/plans/${created.id}`, sent);
      const updated = (await response.json()) as Plan;

      expect(response.status, label).toBe(200);
      // o plano atualizado: o que foi enviado com o valor novo, o resto como foi criado
      expect(updated, label).toEqual({ ...created, ...sent });
      const after = (await planRowWithoutUpdateInstant(stack, created.id))!;
      const changed = changedKeys(before, after);
      expect(changed, `${label} colunas alteradas`).toHaveLength(fields.length);
      expect(changed.map((key) => String(after[key])).sort(), label).toEqual(Object.values(sent).map(String).sort());
      for (const key of Object.keys(before)) if (!changed.includes(key)) expect(after[key], `${label} ${key}`).toEqual(before[key]);
    }
  }
});

test('patch_null_clears_rules', async () => {
  const { client } = await stack.session('hr_finance');
  const created = await createPlan(client, planBody({ rules: 'Acesso livre de segunda a sábado, das 6h às 22h' }));
  expect((await planRow(stack, created.id))!.rules).toBe('Acesso livre de segunda a sábado, das 6h às 22h');
  const before = (await planRowWithoutUpdateInstant(stack, created.id))!;

  const response = await client.patch(`/api/plans/${created.id}`, { rules: null });
  const updated = (await response.json()) as Plan;

  expect(response.status).toBe(200);
  expect(updated.rules).toBeNull();
  expect(updated).toEqual({ ...created, rules: null });
  const after = (await planRowWithoutUpdateInstant(stack, created.id))!;
  expect(after.rules).toBeNull();
  expect(changedKeys(before, after)).toEqual(['rules']);
});

test('patch_period_null_and_invalid_values_422_fourteen_cases_row_unchanged', async () => {
  const { client } = await stack.session('hr_finance');
  const created = await createPlan(client, planBody({ period: 'monthly', rules: 'Acesso livre' }));
  const cases: Array<[field: string, label: string, value: unknown]> = [
    ['period', 'o valor que o plano já tem', 'monthly'],
    ['period', 'outro dos quatro valores', 'annual'],
    ['period', 'null', null],
    ['name', 'null', null],
    ['priceCents', 'null', null],
    ['status', 'null', null],
    ['name', 'vazio', ''],
    ['name', '81 caracteres', accented(81)],
    ['priceCents', '-1', -1],
    ['priceCents', '10000000', 10_000_000],
    ['priceCents', '99.9', 99.9],
    ['rules', 'vazio', ''],
    ['rules', '501 caracteres', accented(501)],
    ['name', 'U+0000', 'Men\u0000sal'],
  ];
  expect(cases).toHaveLength(14);

  for (const [field, label, value] of cases) {
    const before = await planRowText(stack, created.id);

    const response = await client.patch(`/api/plans/${created.id}`, { [field]: value });

    expect(response.status, `${field} ${label}`).toBe(422);
    expect(await fieldErrorPaths(response), `${field} ${label}`).toContain(field);
    expect(await planRowText(stack, created.id), `${field} ${label}`).toBe(before);
  }
});

let students = 7000;

test('delete_inactivates_and_keeps_row_and_enrollments', async () => {
  for (const role of ['admin', 'hr_finance'] as Role[]) {
    const { client } = await stack.session(role);
    const planId = await insertPlan(stack, { name: `Plano de Linha ${role}`, rules: 'Acesso livre' });
    const [studentId] = (await insertStudents(stack, [{ name: 'Aluna Matriculada', cpf: cpfOf((students += 1)) }])) as [string];
    // as rotas de matrícula ainda não existem: as duas entram por SQL, uma cancelada e uma não
    await insertEnrollment(stack, { studentId, planId, cancelled: true });
    await insertEnrollment(stack, { studentId, planId });
    const rowBefore = (await planRowWithoutUpdateInstant(stack, planId))!;
    expect(rowBefore.status, role).toBe('active');
    const enrollmentsBefore = await enrollmentRowsTextOfPlan(stack, planId);
    expect(enrollmentsBefore, role).toHaveLength(2);
    expect(enrollmentsBefore.map((row) => (JSON.parse(row) as { cancelled_at: unknown }).cancelled_at === null).sort(), role).toEqual([false, true]);
    const total = await planCount(stack);

    const response = await client.delete(`/api/plans/${planId}`);

    expect(response.status, role).toBe(204);
    expect(await response.text(), role).toBe('');
    expect(await planCount(stack), role).toBe(total);
    const rowAfter = (await planRowWithoutUpdateInstant(stack, planId))!;
    expect(rowAfter, role).toEqual({ ...rowBefore, status: 'inactive' });
    expect(await enrollmentRowsTextOfPlan(stack, planId), role).toEqual(enrollmentsBefore);

    const listed = ((await (await client.get('/api/plans')).json()) as PlansResponse).items.filter((item) => item.id === planId);
    expect(listed, role).toEqual([
      { id: planId, name: `Plano de Linha ${role}`, period: 'monthly', priceCents: 9990, rules: 'Acesso livre', status: 'inactive' },
    ]);
  }
});

test('delete_of_inactive_plan_204_changes_nothing', async () => {
  const { client } = await stack.session('hr_finance');
  const planId = await insertPlan(stack, { name: 'Já Inativo', status: 'inactive' });
  const before = await planRowText(stack, planId);

  const response = await client.delete(`/api/plans/${planId}`);

  expect(response.status).toBe(204);
  expect(await planRowText(stack, planId)).toBe(before);
});

test('patch_status_active_reactivates_inactive_plan', async () => {
  const { client } = await stack.session('hr_finance');
  const planId = await insertPlan(stack, { name: 'Volta à Linha', period: 'quarterly', priceCents: 24_990, rules: 'Acesso livre', status: 'inactive' });
  const before = (await planRowWithoutUpdateInstant(stack, planId))!;

  const response = await client.patch(`/api/plans/${planId}`, { status: 'active' });
  const updated = (await response.json()) as Plan;

  expect(response.status).toBe(200);
  expect(updated).toEqual({ id: planId, name: 'Volta à Linha', period: 'quarterly', priceCents: 24_990, rules: 'Acesso livre', status: 'active' });
  const after = (await planRowWithoutUpdateInstant(stack, planId))!;
  expect(after).toEqual({ ...before, status: 'active' });
});

test('patch_status_other_values_422_on_status', async () => {
  const { client } = await stack.session('hr_finance');
  const values = ['inactive', 'suspended', 'Active', 'ativo', ''];
  expect(values).toHaveLength(5);

  // sobre um plano ativo e sobre um inativo: `PATCH` não inativa nem aceita outra situação
  for (const stored of ['active', 'inactive']) {
    const planId = await insertPlan(stack, { name: `Situação ${stored}`, status: stored });
    for (const status of values) {
      const before = await planRowText(stack, planId);

      const response = await client.patch(`/api/plans/${planId}`, { status });

      const label = `${stored} <- ${JSON.stringify(status)}`;
      expect(response.status, label).toBe(422);
      expect(await fieldErrorPaths(response), label).toContain('status');
      expect(await planRowText(stack, planId), label).toBe(before);
    }
  }
});

test('two_simultaneous_patches_on_different_fields_keep_both', async () => {
  const { client } = await stack.session('hr_finance');

  for (let round = 0; round < 10; round += 1) {
    const created = await createPlan(client, planBody({ name: `Antes da rodada ${round}` }));
    const name = `Nome da rodada ${round}`;
    const priceCents = 20_000 + round;

    const responses = await releasedTogether([
      () => client.patch(`/api/plans/${created.id}`, { name }),
      () => client.patch(`/api/plans/${created.id}`, { priceCents }),
    ]);

    expect(responses.map((response) => response.status), `rodada ${round}`).toEqual([200, 200]);
    const row = (await planRow(stack, created.id))!;
    expect(row.name, `rodada ${round}`).toBe(name);
    expect(row.price_cents, `rodada ${round}`).toBe(priceCents);
  }
});

test('patch_and_delete_404_for_non_uuid_and_unknown_uuid', async () => {
  const { client } = await stack.session('hr_finance');
  const total = await planCount(stack);
  let cases = 0;

  for (const id of ['abc', unknownId()]) {
    for (const [method, sent] of [['PATCH', { name: 'Qualquer' }], ['DELETE', undefined]] as const) {
      const response = await client.request(method, `/api/plans/${id}`, { body: sent });

      expect(response.status, `${method} ${id}`).toBe(404);
      expect((await problem(response)).code, `${method} ${id}`).toBe('not_found');
      cases += 1;
    }
  }

  expect(cases).toBe(4);
  expect(await planCount(stack)).toBe(total);
});

// achado da C104: o nome do plano vai para o `diff` da trilha, e o `jsonb` não guarda um substituto UTF-16 solto
test('lone_surrogate_in_name_422_on_create_and_patch', async () => {
  const { client } = await stack.session('hr_finance');
  const created = await createPlan(client, planBody({ name: 'Nome Bem Formado 😀' }));
  expect(created.name).toBe('Nome Bem Formado 😀');

  for (const name of ['\ud800', 'Men\udc00sal']) {
    const before = await planSnapshot(stack);

    const posted = await client.post('/api/plans', planBody({ name }));
    const patched = await client.patch(`/api/plans/${created.id}`, { name });

    expect([posted.status, patched.status], JSON.stringify(name)).toEqual([422, 422]);
    expect(await fieldErrorPaths(posted), JSON.stringify(name)).toContain('name');
    expect(await fieldErrorPaths(patched), JSON.stringify(name)).toContain('name');
    expect(await planSnapshot(stack), JSON.stringify(name)).toEqual(before);
  }
});
