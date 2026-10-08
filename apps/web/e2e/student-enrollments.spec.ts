import type { Enrollment, Role } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, type FakeApi, problem, test } from './support/fake-api.ts';
import {
  enrollmentOf,
  enrollmentRequests,
  PLAN_ID,
  PLAN_READERS,
  PLAN_WRITERS,
  planOf,
  planRequests,
  type PlansState,
  serveFicha,
  spaced,
  stateOf,
  STUDENT_ID,
  studentOf,
  textsOf,
} from './support/plans.ts';

const FICHA = `/students/${STUDENT_ID}`;
const ROUTE = `/api/students/${STUDENT_ID}/enrollments`;
const ANNUAL_ID = '018f0000-0000-7000-8000-000000000902';
const QUARTERLY_ID = '018f0000-0000-7000-8000-000000000903';

const annual = () => planOf({ id: ANNUAL_ID, name: 'Anual', period: 'annual', priceCents: 99900 });
const quarterly = () => planOf({ id: QUARTERLY_ID, name: 'Trimestral', period: 'quarterly', priceCents: 24990 });

const block = (page: Page) => page.getByRole('region', { name: 'Matrículas', exact: true });
const button = (page: Page, name: string) => block(page).getByRole('button', { name, exact: true });
const dialog = (page: Page) => page.getByRole('dialog');
const field = (page: Page, name: string) => dialog(page).getByLabel(name, { exact: true });
const confirm = (page: Page) => dialog(page).getByRole('button', { name: 'Confirmar', exact: true });
const column = (page: Page, n: number) => block(page).locator(`tbody tr td:nth-child(${n})`);

/** A ficha do aluno de teste com as matrículas dadas, para o perfil dado. */
function serve(api: FakeApi, role: Role, items: Enrollment[] = [], overrides: Partial<PlansState> = {}) {
  const state = stateOf({ enrollments: { [STUDENT_ID]: items }, ...overrides });
  serveFicha(api, role, studentOf(), state);
  return state;
}

const posts = (api: FakeApi) => enrollmentRequests(api).filter((request) => request.method === 'POST');
const gets = (api: FakeApi, path: string) =>
  api.requests.filter((request) => request.method === 'GET' && request.path === path);

test('block_five_columns_api_order_formats_and_four_status_labels_for_three_roles', async ({ page, api }) => {
  // fora da ordem de data: quem ordena é a API, e a tela mantém a ordem que recebeu
  const items = [
    enrollmentOf({ status: 'active' }),
    enrollmentOf({
      plan: { id: QUARTERLY_ID, name: 'Trimestral', period: 'quarterly' },
      startsAt: '2026-11-07',
      endsAt: '2027-02-06',
      priceCents: 24990,
      status: 'scheduled',
    }),
    enrollmentOf({ startsAt: '2026-08-01', endsAt: '2026-08-31', priceCents: 8990, status: 'expired' }),
    enrollmentOf({
      startsAt: '2026-09-01',
      endsAt: '2026-09-30',
      priceCents: 0,
      status: 'cancelled',
      cancelledAt: '2026-09-02T12:00:00.000Z',
    }),
  ];
  const labels = ['Ativa', 'Agendada', 'Vencida', 'Cancelada'];

  for (const role of PLAN_READERS) {
    serve(api, role, items);

    await page.goto(FICHA);

    await expect(block(page), role).toBeVisible();
    expect(await block(page).getByRole('columnheader').allTextContents(), role).toEqual([
      'Plano',
      'Início',
      'Vencimento',
      'Valor',
      'Situação',
    ]);
    expect(await column(page, 1).allTextContents(), role).toEqual(['Mensal', 'Trimestral', 'Mensal', 'Mensal']);
    expect(await column(page, 2).allTextContents(), role).toEqual(['07/10/2026', '07/11/2026', '01/08/2026', '01/09/2026']);
    expect(await column(page, 3).allTextContents(), role).toEqual(['06/11/2026', '06/02/2027', '31/08/2026', '30/09/2026']);
    expect(await textsOf(column(page, 4)), role).toEqual(['R$ 99,90', 'R$ 249,90', 'R$ 89,90', 'R$ 0,00']);
    for (const [index, text] of labels.entries()) {
      // para quem escreve, a célula da situação traz também o botão da linha
      await expect(column(page, 5).nth(index).getByText(text, { exact: true }), `${role} ${text}`).toBeVisible();
    }
  }
  // sem botão nenhum, a célula é só a situação
  expect(await column(page, 5).allTextContents()).toEqual(labels);
  expect(PLAN_READERS.at(-1)).toBe('reception');
});

test('empty_block_shows_no_enrollment_message', async ({ page, api }) => {
  for (const role of PLAN_READERS) {
    serve(api, role, []);

    await page.goto(FICHA);

    await expect(block(page).getByText('Nenhuma matrícula registrada.', { exact: true }), role).toBeVisible();
    await expect(block(page).getByRole('table'), role).toHaveCount(0);
  }
});

test('enrollments_load_failure_shows_retry_without_hiding_ficha', async ({ page, api }) => {
  serve(api, 'admin', [enrollmentOf()]);
  let down = true;
  api.on('GET', ROUTE, () => (down ? { status: 500 } : { status: 200, body: { items: [enrollmentOf()] } }));

  await page.goto(FICHA);

  await expect(block(page).getByText('Não foi possível carregar as matrículas.', { exact: true })).toBeVisible();
  const retry = button(page, 'Tentar novamente');
  await expect(retry).toBeVisible();
  await expect(block(page).getByRole('table')).toHaveCount(0);
  // o resto da ficha segue na página: o nome, os dados e o bloco de consentimentos
  await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha', exact: true })).toBeVisible();
  await expect(page.getByText('529.982.247-25', { exact: true })).toBeVisible();
  const consents = page.getByRole('region', { name: 'Responsável e consentimentos', exact: true });
  await expect(consents.getByText('Nenhum responsável cadastrado.', { exact: true })).toBeVisible();

  down = false;
  await retry.click();
  await expect(block(page).getByRole('table')).toBeVisible();
});

test('instructor_has_no_block_and_no_enrollment_or_plan_calls', async ({ page, api }) => {
  serve(api, 'instructor', [enrollmentOf()]);

  await page.goto(FICHA);

  await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha', exact: true })).toBeVisible();
  await expect(page.getByText('Matrículas')).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(enrollmentRequests(api)).toHaveLength(0);
  expect(planRequests(api)).toHaveLength(0);
});

test('matricular_or_renovar_by_five_states_cancelar_per_row_and_no_buttons_for_reception', async ({ page, api }) => {
  const cancelled = { status: 'cancelled', cancelledAt: '2026-10-07T16:00:00.000Z' } as const;
  const states: Array<{ name: string; items: Enrollment[]; shown: 'Matricular' | 'Renovar'; cancel: number }> = [
    { name: 'sem matrícula', items: [], shown: 'Matricular', cancel: 0 },
    { name: 'só vencida', items: [enrollmentOf({ status: 'expired' })], shown: 'Matricular', cancel: 1 },
    { name: 'só cancelada', items: [enrollmentOf(cancelled)], shown: 'Matricular', cancel: 0 },
    { name: 'ativa', items: [enrollmentOf({ status: 'active' })], shown: 'Renovar', cancel: 1 },
    { name: 'agendada', items: [enrollmentOf({ status: 'scheduled' })], shown: 'Renovar', cancel: 1 },
  ];
  expect(states).toHaveLength(5);

  for (const role of PLAN_WRITERS) {
    for (const { name, items, shown, cancel } of states) {
      serve(api, role, items);
      await page.goto(FICHA);
      await expect(block(page), `${role} ${name}`).toBeVisible();

      const hidden = shown === 'Matricular' ? 'Renovar' : 'Matricular';
      await expect(button(page, shown), `${role} ${name}`).toHaveCount(1);
      await expect(button(page, hidden), `${role} ${name}`).toHaveCount(0);
      await expect(button(page, 'Cancelar'), `${role} ${name}`).toHaveCount(cancel);
      // o botão está na linha da matrícula
      await expect(
        block(page).locator('tbody tr').getByRole('button', { name: 'Cancelar', exact: true }),
        `${role} ${name}`,
      ).toHaveCount(cancel);
    }
  }

  for (const { name, items } of states) {
    serve(api, 'reception', items);
    await page.goto(FICHA);
    await expect(block(page), name).toBeVisible();

    await expect(block(page).getByRole('table'), name).toHaveCount(items.length > 0 ? 1 : 0);
    for (const label of ['Matricular', 'Renovar', 'Cancelar']) {
      await expect(button(page, label), `recepção ${name}: ${label}`).toHaveCount(0);
    }
    await expect(block(page).getByRole('button'), `recepção ${name}`).toHaveCount(0);
  }
});

test('inactive_student_shows_message_instead_of_matricular_and_renovar', async ({ page, api }) => {
  const message = 'Aluno inativo: reative o aluno para matricular.';
  const cases: Array<[string, Enrollment[]]> = [
    ['sem matrícula', []],
    ['com uma ativa', [enrollmentOf({ status: 'active' })]],
  ];

  for (const [name, items] of cases) {
    serveFicha(api, 'hr_finance', studentOf({ status: 'inactive' }), stateOf({ enrollments: { [STUDENT_ID]: items } }));

    await page.goto(FICHA);

    await expect(block(page).getByText(message, { exact: true }), name).toBeVisible();
    await expect(button(page, 'Matricular'), name).toHaveCount(0);
    await expect(button(page, 'Renovar'), name).toHaveCount(0);
  }
});

test('dialog_lists_active_plans_previews_ends_at_and_posts_only_after_confirm', async ({ page, api }) => {
  serve(api, 'hr_finance', [], {
    plans: [planOf(), planOf({ id: QUARTERLY_ID, name: 'Antigo', period: 'quarterly', status: 'inactive' }), annual()],
  });
  await page.goto(FICHA);

  await button(page, 'Matricular').click();

  await expect(dialog(page)).toBeVisible();
  expect(await textsOf(field(page, 'Plano').locator('option'))).toEqual([
    'Mensal · Mensal · R$ 99,90',
    'Anual · Anual · R$ 999,00',
  ]);
  await expect(field(page, 'Início')).toBeVisible();
  await expect(confirm(page)).toBeVisible();

  await field(page, 'Início').fill('2026-10-07');
  await field(page, 'Plano').selectOption(PLAN_ID);
  await expect(dialog(page).getByText('Vencimento: 06/11/2026', { exact: true })).toBeVisible();
  await field(page, 'Plano').selectOption(ANNUAL_ID);
  await expect(dialog(page).getByText('Vencimento: 06/10/2027', { exact: true })).toBeVisible();
  await field(page, 'Plano').selectOption(PLAN_ID);
  await field(page, 'Início').fill('2026-01-31');
  await expect(dialog(page).getByText('Vencimento: 27/02/2026', { exact: true })).toBeVisible();
  expect(api.writes()).toHaveLength(0);

  await field(page, 'Início').fill('2026-10-07');
  await confirm(page).click();

  await expect(dialog(page)).toHaveCount(0);
  expect(api.writes().map((request) => `${request.method} ${request.path}`)).toEqual([`POST ${ROUTE}`]);
  expect(api.writes()[0]!.body).toEqual({ planId: PLAN_ID, startsAt: '2026-10-07' });
});

test('dialog_prefills_today_in_sao_paulo_or_day_after_last_ends_at_and_its_plan', async ({ page, api }) => {
  // a virada do dia em São Paulo é às 03:00 UTC
  const around: Array<[string, string]> = [
    ['2026-10-08T02:59:59Z', '2026-10-07'],
    ['2026-10-08T03:00:00Z', '2026-10-08'],
  ];
  for (const [instant, day] of around) {
    serve(api, 'hr_finance', []);
    await page.clock.setFixedTime(new Date(instant));
    await page.goto(FICHA);

    await button(page, 'Matricular').click();

    await expect(field(page, 'Início'), instant).toHaveValue(day);
    await expect(field(page, 'Plano').locator('option:checked'), instant).toContainText('Mensal');
  }

  const items = [
    enrollmentOf({
      plan: { id: ANNUAL_ID, name: 'Anual', period: 'annual' },
      startsAt: '2026-04-01',
      endsAt: '2027-03-31',
      status: 'cancelled',
      cancelledAt: '2026-04-02T12:00:00.000Z',
    }),
    enrollmentOf({
      plan: { id: QUARTERLY_ID, name: 'Trimestral', period: 'quarterly' },
      startsAt: '2026-11-07',
      endsAt: '2026-12-06',
      status: 'scheduled',
    }),
    enrollmentOf({ startsAt: '2026-10-07', endsAt: '2026-11-06', status: 'active' }),
  ];
  serve(api, 'hr_finance', items, { plans: [planOf(), quarterly(), annual()] });
  await page.goto(FICHA);

  await button(page, 'Renovar').click();

  await expect(field(page, 'Início')).toHaveValue('2026-12-07');
  await expect(field(page, 'Plano')).toHaveValue(QUARTERLY_ID);
  expect(spaced((await field(page, 'Plano').locator('option:checked').textContent()) ?? '')).toBe(
    'Trimestral · Trimestral · R$ 249,90',
  );

  // o plano daquela matrícula saiu de linha: não é opção nem vem escolhido
  serve(api, 'hr_finance', items, { plans: [planOf(), { ...quarterly(), status: 'inactive' }, annual()] });
  await page.goto(FICHA);

  await button(page, 'Renovar').click();

  await expect(field(page, 'Início')).toHaveValue('2026-12-07');
  const options = await textsOf(field(page, 'Plano').locator('option'));
  expect(options).toEqual(['Mensal · Mensal · R$ 99,90', 'Anual · Anual · R$ 999,00']);
  await expect(field(page, 'Plano')).not.toHaveValue(QUARTERLY_ID);
  await expect(field(page, 'Plano').locator('option:checked')).not.toContainText('Trimestral');
});

test('dialog_without_active_plan_shows_message_and_disables_confirm', async ({ page, api }) => {
  const cases: Array<[string, PlansState['plans']]> = [
    ['nenhum plano', []],
    ['só inativos', [planOf({ status: 'inactive' }), { ...annual(), status: 'inactive' }]],
  ];
  for (const [name, plans] of cases) {
    serve(api, 'hr_finance', [], { plans });
    await page.goto(FICHA);

    await button(page, 'Matricular').click();

    await expect(
      dialog(page).getByText('Nenhum plano ativo. Cadastre um plano em Planos.', { exact: true }),
      name,
    ).toBeVisible();
    await expect(confirm(page), name).toBeDisabled();
  }
});

test('plans_load_failure_keeps_ficha_and_table_without_matricular', async ({ page, api }) => {
  const cases: Array<[string, Enrollment[]]> = [
    ['com uma ativa', [enrollmentOf({ status: 'active' })]],
    ['só vencida', [enrollmentOf({ status: 'expired' })]],
  ];
  for (const [name, items] of cases) {
    serve(api, 'hr_finance', items);
    api.on('GET', '/api/plans', { status: 500 });

    await page.goto(FICHA);

    await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha', exact: true }), name).toBeVisible();
    await expect(block(page).getByRole('table'), name).toBeVisible();
    expect(await column(page, 1).allTextContents(), name).toEqual(['Mensal']);
    await expect(block(page).getByText('Não foi possível carregar os planos.', { exact: true }), name).toBeVisible();
    await expect(button(page, 'Matricular'), name).toHaveCount(0);
    await expect(button(page, 'Renovar'), name).toHaveCount(0);
  }
});

test('block_shows_new_enrollment_after_confirm', async ({ page, api }) => {
  serve(api, 'hr_finance', [], { plans: [planOf(), annual()] });
  await page.goto(FICHA);
  await expect(block(page).getByText('Nenhuma matrícula registrada.', { exact: true })).toBeVisible();

  await button(page, 'Matricular').click();
  await field(page, 'Plano').selectOption(ANNUAL_ID);
  await field(page, 'Início').fill('2026-10-07');
  await confirm(page).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(block(page).locator('tbody tr')).toHaveCount(1);
  expect(await column(page, 1).allTextContents()).toEqual(['Anual']);
  expect(await column(page, 2).allTextContents()).toEqual(['07/10/2026']);
  expect(await column(page, 3).allTextContents()).toEqual(['06/10/2027']);
  expect(posts(api)).toHaveLength(1);
});

test('three_409_codes_show_their_messages_and_keep_the_choices', async ({ page, api }) => {
  const messages: Array<[string, string]> = [
    ['enrollment_overlap', 'Já existe uma matrícula neste período.'],
    ['plan_inactive', 'Este plano foi inativado. Escolha outro.'],
    ['student_inactive', 'Reative o aluno antes de matricular.'],
  ];
  expect(messages).toHaveLength(3);

  for (const [code, message] of messages) {
    serve(api, 'hr_finance', [], { plans: [planOf(), annual()] });
    api.on('POST', ROUTE, problem(409, code));
    await page.goto(FICHA);
    await button(page, 'Matricular').click();
    await field(page, 'Plano').selectOption(ANNUAL_ID);
    await field(page, 'Início').fill('2026-12-01');

    await confirm(page).click();

    await expect(dialog(page).getByText(message, { exact: true }), code).toBeVisible();
    await expect(dialog(page), code).toBeVisible();
    await expect(field(page, 'Plano'), code).toHaveValue(ANNUAL_ID);
    await expect(field(page, 'Início'), code).toHaveValue('2026-12-01');
    expect(posts(api), code).toHaveLength(1);
    api.requests = [];
  }
});

test('starts_at_422_message_shown_on_the_field', async ({ page, api }) => {
  const message = 'Escolha um início dentro de 365 dias.';
  serve(api, 'hr_finance', []);
  api.on('POST', ROUTE, problem(422, 'validation_failed', [{ path: 'startsAt', message }]));
  await page.goto(FICHA);
  await button(page, 'Matricular').click();
  await field(page, 'Início').fill('2026-10-07');

  await confirm(page).click();

  await expect(field(page, 'Início')).toHaveAccessibleDescription(message);
  await expect(dialog(page)).toBeVisible();
  expect(posts(api)).toHaveLength(1);
});

test('cancel_confirms_naming_student_plan_and_period_then_deletes', async ({ page, api }) => {
  const enrollment = enrollmentOf({
    plan: { id: QUARTERLY_ID, name: 'Trimestral Família', period: 'quarterly' },
    status: 'active',
  });
  serve(api, 'hr_finance', [enrollment]);
  await page.goto(FICHA);

  await button(page, 'Cancelar').click();

  await expect(dialog(page)).toBeVisible();
  for (const text of ['Rafaela Prado Cunha', 'Trimestral Família', '07/10/2026', '06/11/2026']) {
    await expect(dialog(page), text).toContainText(text);
  }
  expect(api.writes()).toHaveLength(0);

  // desistir fecha sem enviar
  await dialog(page).getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(api.writes()).toHaveLength(0);
  await expect(column(page, 5).getByText('Ativa', { exact: true })).toBeVisible();

  await button(page, 'Cancelar').click();
  await dialog(page).getByRole('button', { name: 'Cancelar matrícula', exact: true }).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(column(page, 5)).toHaveText(['Cancelada']);
  await expect(button(page, 'Cancelar')).toHaveCount(0);
  expect(api.writes().map((request) => `${request.method} ${request.path}`)).toEqual([
    `DELETE ${ROUTE}/${enrollment.id}`,
  ]);
});

test('confirm_button_disabled_while_waiting', async ({ page, api }) => {
  serve(api, 'hr_finance', []);
  api.on('POST', ROUTE, 'hang');
  await page.goto(FICHA);
  await button(page, 'Matricular').click();
  await field(page, 'Início').fill('2026-10-07');
  await expect(confirm(page)).toBeEnabled();

  await confirm(page).click();

  await expect.poll(() => posts(api).length).toBe(1);
  await expect(confirm(page)).toBeDisabled();
});

test('ficha_asks_for_enrollments_once_and_for_plans_only_when_the_role_writes', async ({ page, api }) => {
  const expected: Array<[Role, number]> = [
    ['admin', 1],
    ['hr_finance', 1],
    ['reception', 0],
  ];

  for (const [role, plans] of expected) {
    serve(api, role, [enrollmentOf()]);
    api.requests = [];

    await page.goto(FICHA);
    await expect(block(page).getByRole('table'), role).toBeVisible();
    // o menu e os links à vista não pedem nada por conta própria
    await page.getByRole('link', { name: 'Planos', exact: true }).hover();
    await page.waitForTimeout(1500);

    expect(gets(api, ROUTE), `${role}: matrículas`).toHaveLength(1);
    expect(gets(api, '/api/plans'), `${role}: planos`).toHaveLength(plans);
    expect(planRequests(api), `${role}: planos, qualquer método`).toHaveLength(plans);
  }
});
