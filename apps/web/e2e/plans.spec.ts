import type { Plan, Role } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, type FakeApi, test } from './support/fake-api.ts';
import {
  NO_PERMISSION,
  PLAN_ID,
  PLAN_READERS,
  PLAN_WRITERS,
  planOf,
  planRequests,
  servePlans,
  servePlansAs,
  stateOf,
  textsOf,
} from './support/plans.ts';

const ROUTE = `/api/plans/${PLAN_ID}`;
const EDIT = `/plans/${PLAN_ID}/edit`;
const THREE_URLS = ['/plans', '/plans/new', EDIT];
const INVALID_PRICE = 'Informe um valor em reais, como 99,90.';

const label = (page: Page, name: string) => page.getByLabel(name, { exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Salvar', exact: true });
const idOf = (n: number) => `018f0000-0000-7000-8000-00000000092${n}`;

/** Quantas vezes o controle aparece, como link ou como botão. */
async function controls(page: Page, name: string) {
  return (
    (await page.getByRole('link', { name, exact: true }).count()) +
    (await page.getByRole('button', { name, exact: true }).count())
  );
}

/** Preenche o formulário de `/plans/new` com valores que passam, e o valor dado. */
async function fillNew(page: Page, price: string, rules = '') {
  await page.goto('/plans/new');
  await label(page, 'Nome').fill('Mensal');
  await label(page, 'Periodicidade').selectOption({ label: 'Mensal' });
  await label(page, 'Valor (R$)').fill(price);
  await label(page, 'Regras de acesso').fill(rules);
}

const bodies = (api: FakeApi, method: string) =>
  planRequests(api)
    .filter((request) => request.method === method)
    .map((request) => request.body as Record<string, unknown>);

test('anonymous_three_plan_urls_redirect_to_login', async ({ page, api }) => {
  expect(api.session).toBeUndefined();
  servePlans(api, stateOf());

  for (const path of THREE_URLS) {
    await page.goto(path);

    await expect(page, path).toHaveURL('/login');
  }
  expect(THREE_URLS).toHaveLength(3);
  expect(planRequests(api)).toHaveLength(0);
});

test('instructor_and_reception_see_no_permission_on_five_cases', async ({ page, api }) => {
  const plan = planOf({ name: 'Trimestral Sigiloso', priceCents: 12345, rules: 'Acesso só de manhã, até as 12h' });
  const cases: Array<[Role, string]> = [
    ['instructor', '/plans'],
    ['instructor', '/plans/new'],
    ['instructor', EDIT],
    ['reception', '/plans/new'],
    ['reception', EDIT],
  ];
  expect(cases).toHaveLength(5);

  for (const [role, path] of cases) {
    servePlansAs(api, role, stateOf({ plans: [plan] }));

    await page.goto(path);

    await expect(page.getByText(NO_PERMISSION, { exact: true }), `${role} ${path}`).toBeVisible();
    await expect(label(page, 'Nome'), `${role} ${path}`).toHaveCount(0);
    await expect(save(page), `${role} ${path}`).toHaveCount(0);
    const text = await page.locator('body').innerText();
    for (const secret of [plan.name, '123,45', plan.rules!]) {
      expect(text, `${role} ${path}: ${secret}`).not.toContain(secret);
    }
  }
});

test('list_title_five_columns_and_api_order_for_three_roles', async ({ page, api }) => {
  // fora de ordem alfabética: quem ordena é a API, e a tela mantém a ordem que recebeu
  const plans = [
    planOf({ id: idOf(1), name: 'Zen' }),
    planOf({ id: idOf(2), name: 'Anual', period: 'annual', status: 'inactive' }),
    planOf({ id: idOf(3), name: 'Mensal' }),
  ];

  for (const role of PLAN_READERS) {
    servePlansAs(api, role, stateOf({ plans }));

    await page.goto('/plans');

    await expect(page.getByRole('heading', { name: 'Planos', exact: true }), role).toBeVisible();
    expect(await page.getByRole('columnheader').allTextContents(), role).toEqual([
      'Nome',
      'Periodicidade',
      'Valor',
      'Regras de acesso',
      'Situação',
    ]);
    expect(await page.locator('tbody tr td:nth-child(1)').allTextContents(), role).toEqual(['Zen', 'Anual', 'Mensal']);
    expect(await page.locator('tbody tr td:nth-child(5)').allTextContents(), role).toEqual(['Ativo', 'Inativo', 'Ativo']);
  }
  expect(PLAN_READERS).toEqual(['admin', 'hr_finance', 'reception']);
});

test('list_formats_period_price_status_and_dash_for_null_rules', async ({ page, api }) => {
  servePlansAs(
    api,
    'reception',
    stateOf({
      plans: [
        planOf({ id: idOf(1), period: 'monthly', priceCents: 9990, rules: null }),
        planOf({ id: idOf(2), period: 'quarterly', priceCents: 0, rules: 'Somente manhãs', status: 'inactive' }),
        planOf({ id: idOf(3), period: 'semiannual', priceCents: 123456 }),
        planOf({ id: idOf(4), period: 'annual', priceCents: 9999999 }),
      ],
    }),
  );

  await page.goto('/plans');

  expect(await page.locator('tbody tr td:nth-child(2)').allTextContents()).toEqual([
    'Mensal',
    'Trimestral',
    'Semestral',
    'Anual',
  ]);
  expect(await textsOf(page.locator('tbody tr td:nth-child(3)'))).toEqual([
    'R$ 99,90',
    'R$ 0,00',
    'R$ 1.234,56',
    'R$ 99.999,99',
  ]);
  expect(await page.locator('tbody tr td:nth-child(4)').allTextContents()).toEqual(['—', 'Somente manhãs', '—', '—']);
  expect(await page.locator('tbody tr td:nth-child(5)').allTextContents()).toEqual(['Ativo', 'Inativo', 'Ativo', 'Ativo']);
});

test('rules_markup_shown_as_literal_text_and_creates_no_element', async ({ page, api }) => {
  servePlansAs(api, 'reception', stateOf({ plans: [planOf({ rules: '<b>x</b>' })] }));

  await page.goto('/plans');

  await expect(page.locator('tbody tr')).toHaveCount(1);
  expect(await textsOf(page.locator('tbody tr td:nth-child(4)'))).toEqual(['<b>x</b>']);
  await expect(page.locator('tbody b')).toHaveCount(0);
});

test('new_button_and_name_links_only_for_admin_and_hr_finance', async ({ page, api }) => {
  const plans = [planOf({ id: idOf(1), name: 'Mensal' }), planOf({ id: idOf(2), name: 'Anual', status: 'inactive' })];
  const names = page.locator('tbody tr td:nth-child(1)');

  for (const role of PLAN_WRITERS) {
    servePlansAs(api, role, stateOf({ plans }));
    await page.goto('/plans');

    await expect(page.getByRole('link', { name: 'Novo plano', exact: true }), role).toHaveAttribute('href', '/plans/new');
    for (const [index, plan] of plans.entries()) {
      await expect(names.nth(index).getByRole('link', { name: plan.name, exact: true }), role).toHaveAttribute(
        'href',
        `/plans/${plan.id}/edit`,
      );
    }
  }
  expect(PLAN_WRITERS).toEqual(['admin', 'hr_finance']);

  servePlansAs(api, 'reception', stateOf({ plans }));
  await page.goto('/plans');

  expect(await names.allTextContents()).toEqual(['Mensal', 'Anual']);
  expect(await controls(page, 'Novo plano')).toBe(0);
  await expect(names.getByRole('link')).toHaveCount(0);
});

test('empty_registry_shows_no_plan_message', async ({ page, api }) => {
  for (const role of PLAN_READERS) {
    servePlansAs(api, role, stateOf({ plans: [] }));

    await page.goto('/plans');

    await expect(page.getByText('Nenhum plano cadastrado.', { exact: true }), role).toBeVisible();
    await expect(page.getByRole('table'), role).toHaveCount(0);
  }
});

test('load_failure_shows_retry', async ({ page, api }) => {
  servePlansAs(api, 'reception', stateOf());
  let down = true;
  api.on('GET', '/api/plans', () => (down ? { status: 500 } : { status: 200, body: { items: [planOf()] } }));

  await page.goto('/plans');

  await expect(page.getByText('Não foi possível carregar os planos.', { exact: true })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Tentar novamente', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  down = false;
  await retry.click();
  await expect(page.getByRole('table')).toBeVisible();
});

test('form_labels_save_button_and_period_disabled_on_edit', async ({ page, api }) => {
  const plan = planOf({ name: 'Trimestral Plus', period: 'quarterly', priceCents: 9990, rules: 'Acesso livre de segunda a sábado' });
  servePlansAs(api, 'hr_finance', stateOf({ plans: [plan] }));

  for (const path of ['/plans/new', EDIT]) {
    await page.goto(path);

    for (const name of ['Nome', 'Periodicidade', 'Valor (R$)', 'Regras de acesso']) {
      await expect(label(page, name), `${path} ${name}`).toBeVisible();
    }
    await expect(save(page), path).toBeVisible();
    if (path === EDIT) await expect(label(page, 'Periodicidade'), path).toBeDisabled();
    else await expect(label(page, 'Periodicidade'), path).toBeEnabled();
  }
  // a edição abre com os valores do plano, o valor já em reais
  await expect(label(page, 'Nome')).toHaveValue('Trimestral Plus');
  await expect(label(page, 'Periodicidade').locator('option:checked')).toHaveText('Trimestral');
  await expect(label(page, 'Valor (R$)')).toHaveValue('99,90');
  await expect(label(page, 'Regras de acesso')).toHaveValue('Acesso livre de segunda a sábado');
});

test('price_typed_in_reais_is_sent_in_cents_five_values', async ({ page, api }) => {
  servePlansAs(api, 'hr_finance', stateOf());

  const typed: Array<[string, number]> = [
    ['99,90', 9990],
    ['99', 9900],
    ['99,9', 9990],
    ['0,00', 0],
  ];
  for (const [price, cents] of typed) {
    api.requests = [];
    await fillNew(page, price);
    await save(page).click();

    await expect.poll(() => bodies(api, 'POST').length, price).toBe(1);
    expect(bodies(api, 'POST')[0]!.priceCents, price).toBe(cents);
  }

  api.requests = [];
  await page.goto(EDIT);
  await label(page, 'Valor (R$)').fill('109,90');
  await save(page).click();

  await expect.poll(() => bodies(api, 'PATCH').length).toBe(1);
  expect(planRequests(api).filter((request) => request.method === 'PATCH')[0]!.path).toBe(ROUTE);
  expect(bodies(api, 'PATCH')[0]!.priceCents).toBe(10990);
});

test('invalid_price_four_values_shows_message_and_sends_nothing', async ({ page, api }) => {
  servePlansAs(api, 'hr_finance', stateOf());
  const invalid = ['', 'abc', '99,999', '-5,00'];
  expect(invalid).toHaveLength(4);

  for (const price of invalid) {
    await fillNew(page, price);
    await save(page).click();

    await expect(label(page, 'Valor (R$)'), `novo: "${price}"`).toHaveAccessibleDescription(INVALID_PRICE);

    await page.goto(EDIT);
    await label(page, 'Valor (R$)').fill(price);
    await save(page).click();

    await expect(label(page, 'Valor (R$)'), `edição: "${price}"`).toHaveAccessibleDescription(INVALID_PRICE);
  }
  expect(api.writes()).toHaveLength(0);
});

test('save_navigates_to_the_plans_list_from_new_and_edit', async ({ page, api }) => {
  for (const role of PLAN_WRITERS) {
    servePlansAs(api, role, stateOf());
    api.on('POST', '/api/plans', { status: 201, body: planOf({ id: idOf(9), name: 'Anual', period: 'annual' }) });
    api.on('PATCH', ROUTE, { status: 200, body: planOf({ name: 'Mensal Plus' }) });

    await fillNew(page, '99,90');
    await save(page).click();

    await expect(page, `${role}: cadastro`).toHaveURL('/plans');
    await expect(page.getByRole('heading', { name: 'Planos', exact: true }), role).toBeVisible();

    await page.goto(EDIT);
    await label(page, 'Nome').fill('Mensal Plus');
    await save(page).click();

    await expect(page, `${role}: edição`).toHaveURL('/plans');
  }
});

test('edit_shows_inativar_or_reativar_by_status', async ({ page, api }) => {
  const cases: Array<[Plan['status'], string, string]> = [
    ['active', 'Inativar', 'Reativar'],
    ['inactive', 'Reativar', 'Inativar'],
  ];
  for (const [status, shown, hidden] of cases) {
    servePlansAs(api, 'hr_finance', stateOf({ plans: [planOf({ status })] }));

    await page.goto(EDIT);

    await expect(page.getByRole('button', { name: shown, exact: true }), status).toBeVisible();
    await expect(page.getByRole('button', { name: hidden, exact: true }), status).toHaveCount(0);
  }
});

test('inactivate_confirms_naming_the_plan_then_deletes_and_goes_to_the_list', async ({ page, api }) => {
  servePlansAs(api, 'hr_finance', stateOf({ plans: [planOf({ name: 'Semestral Família' })] }));
  await page.goto(EDIT);
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'Inativar', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Semestral Família');
  expect(api.writes()).toHaveLength(0);

  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.writes()).toHaveLength(0);
  await expect(page).toHaveURL(EDIT);

  await page.getByRole('button', { name: 'Inativar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Inativar', exact: true }).click();

  await expect(page).toHaveURL('/plans');
  expect(api.writes().map((request) => `${request.method} ${request.path}`)).toEqual([`DELETE ${ROUTE}`]);
});

test('unknown_plan_shows_not_found_on_edit', async ({ page, api }) => {
  servePlansAs(api, 'hr_finance', stateOf({ plans: [planOf({ id: idOf(1) })] }));

  await page.goto(EDIT);

  await expect(page.getByText('Plano não encontrado.', { exact: true })).toBeVisible();
  for (const name of ['Nome', 'Periodicidade', 'Valor (R$)', 'Regras de acesso']) {
    await expect(label(page, name), name).toHaveCount(0);
  }
  await expect(save(page)).toHaveCount(0);
});

test('new_form_omits_empty_rules_and_edit_form_sends_only_changes_never_period', async ({ page, api }) => {
  servePlansAs(api, 'hr_finance', stateOf({ plans: [planOf({ rules: 'Acesso livre' })] }));

  await fillNew(page, '99,90');
  await save(page).click();
  await expect.poll(() => bodies(api, 'POST').length).toBe(1);
  expect(bodies(api, 'POST')[0]).toEqual({ name: 'Mensal', period: 'monthly', priceCents: 9990 });
  expect(bodies(api, 'POST')[0]).not.toHaveProperty('rules');

  await fillNew(page, '99,90', 'Somente manhãs');
  await save(page).click();
  await expect.poll(() => bodies(api, 'POST').length).toBe(2);
  expect(bodies(api, 'POST')[1]).toEqual({ name: 'Mensal', period: 'monthly', priceCents: 9990, rules: 'Somente manhãs' });

  await page.goto(EDIT);
  await label(page, 'Nome').fill('Mensal Plus');
  await save(page).click();
  await expect.poll(() => bodies(api, 'PATCH').length).toBe(1);
  expect(bodies(api, 'PATCH')[0]).toEqual({ name: 'Mensal Plus' });

  await page.goto(EDIT);
  await expect(label(page, 'Regras de acesso')).toHaveValue('Acesso livre');
  await label(page, 'Regras de acesso').fill('');
  await save(page).click();
  await expect.poll(() => bodies(api, 'PATCH').length).toBe(2);
  expect(bodies(api, 'PATCH')[1]).toEqual({ rules: null });

  for (const body of bodies(api, 'PATCH')) expect(body).not.toHaveProperty('period');
});

test('reativar_sends_patch_active_without_dialog', async ({ page, api }) => {
  servePlansAs(api, 'hr_finance', stateOf({ plans: [planOf({ status: 'inactive' })] }));
  await page.goto(EDIT);

  await page.getByRole('button', { name: 'Reativar', exact: true }).click();

  await expect.poll(() => api.writes().length).toBe(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const [write] = api.writes();
  expect(`${write!.method} ${write!.path}`).toBe(`PATCH ${ROUTE}`);
  expect(write!.body).toEqual({ status: 'active' });
  // nada além dele chega depois
  await page.waitForTimeout(500);
  expect(api.writes()).toHaveLength(1);
});

test('save_button_disabled_while_waiting_on_both_forms', async ({ page, api }) => {
  servePlansAs(api, 'hr_finance', stateOf());
  api.on('POST', '/api/plans', 'hang');
  api.on('PATCH', ROUTE, 'hang');

  await fillNew(page, '99,90');
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect.poll(() => bodies(api, 'POST').length).toBe(1);
  await expect(save(page), 'novo').toBeDisabled();

  await page.goto(EDIT);
  await label(page, 'Nome').fill('Mensal Plus');
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect.poll(() => bodies(api, 'PATCH').length).toBe(1);
  await expect(save(page), 'edição').toBeDisabled();
});
