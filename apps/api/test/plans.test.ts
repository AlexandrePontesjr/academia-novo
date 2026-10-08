import type { Plan, PlansResponse, Role } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { PLAN_KEYS, createPlan, insertPlan, planBody, planCount, planRow } from './support/plans.ts';
import { type Stack, startStack } from './support/stack.ts';
import { fieldErrorPaths } from './support/students.ts';

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
