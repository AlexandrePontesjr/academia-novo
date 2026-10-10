import type { Page } from '@playwright/test';
import {
  ALL_ROLES,
  card,
  CARD_TITLES,
  cardTitles,
  column,
  dashboardFor,
  dashboardOf,
  dashboardRequests,
  expiringOf,
  planOf,
  serveDashboard,
  textsOf,
  under,
} from './support/dashboard.ts';
import { expect, problem, sessionOf, test } from './support/fake-api.ts';

const EXPIRING = 'Vencimentos nos próximos 7 dias';
const BY_PLAN = 'Matrículas ativas por plano';
const LOAD_ERROR = 'Não foi possível carregar o painel.';
const greeting = (page: Page) => page.getByText('Olá, Marina Duarte.', { exact: true });
const painel = (page: Page) => page.getByRole('heading', { name: 'Painel', exact: true });

test('home_shows_greeting_painel_title_and_situation_date_from_the_response', async ({ page, api }) => {
  serveDashboard(api, 'reception', dashboardFor('reception', dashboardOf({ today: '2026-03-05' })));
  expect(api.session!.user.name).toBe('Marina Duarte');

  await page.goto('/');

  await expect(greeting(page)).toBeVisible();
  await expect(painel(page)).toBeVisible();
  await expect(page.getByText('Situação em 05/03/2026', { exact: true })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('Escolha uma opção no menu acima.');
});

test('students_card_three_labelled_counts_zeros_and_ver_alunos_link', async ({ page, api }) => {
  serveDashboard(api, 'instructor');

  await page.goto('/');

  const students = card(page, 'Alunos');
  await expect(students).toBeVisible();
  await expect(under(students, 'Ativos')).toHaveText('31');
  await expect(under(students, 'Inativos')).toHaveText('4');
  await expect(under(students, 'Suspensos')).toHaveText('2');
  expect(await students.locator('dt').allTextContents()).toEqual(['Ativos', 'Inativos', 'Suspensos']);
  await expect(students.getByRole('link', { name: 'Ver alunos', exact: true })).toHaveAttribute('href', '/students');
  await expect(students.getByRole('link')).toHaveCount(1);

  // contagem zero é o número `0`, não um vazio
  serveDashboard(api, 'instructor', { today: '2026-10-07', students: { active: 0, inactive: 0, suspended: 0 } });
  await page.goto('/');
  for (const label of ['Ativos', 'Inativos', 'Suspensos']) {
    await expect(under(card(page, 'Alunos'), label), label).toHaveText('0');
  }
});

test('enrollments_card_ativas_and_agendadas', async ({ page, api }) => {
  serveDashboard(api, 'reception');

  await page.goto('/');

  const enrollments = card(page, 'Matrículas');
  await expect(enrollments).toBeVisible();
  await expect(under(enrollments, 'Ativas')).toHaveText('27');
  await expect(under(enrollments, 'Agendadas')).toHaveText('6');
  expect(await enrollments.locator('dt').allTextContents()).toEqual(['Ativas', 'Agendadas']);
});

test('expiring_card_title_from_days_three_columns_in_api_order', async ({ page, api }) => {
  // fora da ordem de vencimento: quem ordena é a API, e a tela mantém a ordem que recebeu
  const items = [
    expiringOf({ student: { id: '018f0000-0000-7000-8000-000000000661', name: 'Carla' }, endsAt: '2026-10-12' }),
    expiringOf({ student: { id: '018f0000-0000-7000-8000-000000000662', name: 'Ana' }, endsAt: '2026-10-08' }),
    expiringOf({ student: { id: '018f0000-0000-7000-8000-000000000663', name: 'Bruno' }, endsAt: '2026-10-10' }),
  ];
  serveDashboard(api, 'reception', dashboardFor('reception', dashboardOf({}, { expiringSoon: { days: 7, items } })));

  await page.goto('/');

  const seven = card(page, EXPIRING);
  await expect(seven).toBeVisible();
  expect(await seven.getByRole('columnheader').allTextContents()).toEqual(['Aluno', 'Plano', 'Vence em']);
  expect(await column(seven, 1).allTextContents()).toEqual(['Carla', 'Ana', 'Bruno']);
  expect(await column(seven, 3).allTextContents()).toEqual(['12/10/2026', '08/10/2026', '10/10/2026']);

  // o número do título é o de `expiringSoon.days`
  serveDashboard(api, 'reception', dashboardFor('reception', dashboardOf({}, { expiringSoon: { days: 5, items } })));
  await page.goto('/');
  await expect(card(page, 'Vencimentos nos próximos 5 dias')).toBeVisible();
  await expect(card(page, EXPIRING)).toHaveCount(0);
});

test('expiring_row_formats_name_link_plan_and_date', async ({ page, api }) => {
  const id = '018f0000-0000-7000-8000-0000000006aa';
  const items = [expiringOf({ student: { id, name: 'Ana Souza' }, plan: planOf(2, 'Mensal Plus', 'monthly'), endsAt: '2026-10-14' })];
  serveDashboard(api, 'reception', dashboardFor('reception', dashboardOf({}, { expiringSoon: { days: 7, items } })));

  await page.goto('/');

  const expiring = card(page, EXPIRING);
  await expect(expiring.locator('tbody tr')).toHaveCount(1);
  await expect(column(expiring, 1).getByRole('link', { name: 'Ana Souza', exact: true })).toHaveAttribute('href', `/students/${id}`);
  expect(await textsOf(column(expiring, 2))).toEqual(['Mensal Plus · Mensal']);
  expect(await column(expiring, 3).allTextContents()).toEqual(['14/10/2026']);
});

test('expiring_card_empty_state_replaces_table', async ({ page, api }) => {
  serveDashboard(api, 'reception', dashboardFor('reception', dashboardOf({}, { expiringSoon: { days: 7, items: [] } })));

  await page.goto('/');

  const expiring = card(page, EXPIRING);
  await expect(expiring.getByText('Nenhum vencimento nos próximos 7 dias.', { exact: true })).toBeVisible();
  await expect(expiring.getByRole('table')).toHaveCount(0);
});

test('payments_card_counts_link_to_the_filtered_payments_page', async ({ page, api }) => {
  serveDashboard(api, 'hr_finance');

  await page.goto('/');

  const payments = card(page, 'Pagamentos');
  await expect(payments).toBeVisible();
  expect(await payments.locator('dt').allTextContents()).toEqual(['Pendentes', 'Atrasados']);
  await expect(under(payments, 'Pendentes')).toHaveText('9');
  await expect(under(payments, 'Pendentes').getByRole('link', { name: '9', exact: true })).toHaveAttribute('href', '/payments?status=pending');
  await expect(under(payments, 'Atrasados')).toHaveText('4');
  await expect(under(payments, 'Atrasados').getByRole('link', { name: '4', exact: true })).toHaveAttribute('href', '/payments?status=overdue');
});

test('by_plan_card_two_columns_in_api_order_with_plan_and_period', async ({ page, api }) => {
  // fora da ordem de contagem: a tela mantém a ordem que recebeu
  const byPlan = [
    { plan: planOf(3, 'Anual', 'annual'), active: 3 },
    { plan: planOf(2, 'Mensal Plus', 'monthly'), active: 11 },
  ];
  serveDashboard(api, 'reception', dashboardFor('reception', dashboardOf({}, { byPlan })));

  await page.goto('/');

  const plans = card(page, BY_PLAN);
  await expect(plans).toBeVisible();
  expect(await plans.getByRole('columnheader').allTextContents()).toEqual(['Plano', 'Matrículas ativas']);
  expect(await textsOf(column(plans, 1))).toEqual(['Anual · Anual', 'Mensal Plus · Mensal']);
  expect(await column(plans, 2).allTextContents()).toEqual(['3', '11']);
});

test('by_plan_card_empty_state_replaces_table', async ({ page, api }) => {
  serveDashboard(api, 'reception', dashboardFor('reception', dashboardOf({}, { byPlan: [] })));

  await page.goto('/');

  const plans = card(page, BY_PLAN);
  await expect(plans.getByText('Nenhuma matrícula ativa.', { exact: true })).toBeVisible();
  await expect(plans.getByRole('table')).toHaveCount(0);
});

test('instructor_sees_only_the_students_card', async ({ page, api }) => {
  serveDashboard(api, 'instructor');
  expect(Object.keys(dashboardFor('instructor')).sort()).toEqual(['students', 'today']);

  await page.goto('/');

  await expect(card(page, 'Alunos')).toBeVisible();
  expect(await cardTitles(page)).toEqual(['Alunos']);
  for (const title of ['Matrículas', EXPIRING, 'Pagamentos', BY_PLAN]) {
    await expect(page.getByRole('heading', { name: title, exact: true }), title).toHaveCount(0);
    await expect(card(page, title), title).toHaveCount(0);
  }
});

test('reception_sees_four_cards_without_payments', async ({ page, api }) => {
  serveDashboard(api, 'reception');
  expect(Object.keys(dashboardFor('reception'))).not.toContain('payments');

  await page.goto('/');

  for (const title of ['Alunos', 'Matrículas', EXPIRING, BY_PLAN]) await expect(card(page, title), title).toBeVisible();
  expect(await cardTitles(page)).toEqual(['Alunos', 'Matrículas', EXPIRING, BY_PLAN]);
  await expect(card(page, 'Pagamentos')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pagamentos', exact: true })).toHaveCount(0);
  // o link do menu também não existe para ela
  await expect(page.getByRole('link', { name: 'Pagamentos', exact: true })).toHaveCount(0);
});

test('load_failure_500_and_403_shows_retry_keeps_greeting_and_menu_and_retry_shows_the_cards', async ({ page, api }) => {
  const failures = [{ status: 500 }, problem(403, 'forbidden')];

  for (const failure of failures) {
    const status = (failure as { status: number }).status;
    api.session = sessionOf('admin');
    let down = true;
    api.on('GET', '/api/dashboard', () => (down ? failure : { status: 200, body: dashboardOf() }));

    await page.goto('/');

    await expect(page.getByText(LOAD_ERROR, { exact: true }), String(status)).toBeVisible();
    const retry = page.getByRole('button', { name: 'Tentar novamente', exact: true });
    await expect(retry, String(status)).toBeVisible();
    expect(await cardTitles(page), String(status)).toEqual([]);
    await expect(page.getByRole('region'), String(status)).toHaveCount(0);
    // a saudação e o menu ficam
    await expect(greeting(page), String(status)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Início', exact: true }), String(status)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Alunos', exact: true }), String(status)).toBeVisible();

    down = false;
    await retry.click();

    await expect(card(page, 'Alunos'), String(status)).toBeVisible();
    expect(await cardTitles(page), String(status)).toEqual(CARD_TITLES);
    await expect(page.getByText(LOAD_ERROR, { exact: true }), String(status)).toHaveCount(0);
  }
  expect(failures.map((failure) => (failure as { status: number }).status)).toEqual([500, 403]);
});

test('anonymous_home_redirects_to_login_without_dashboard_request', async ({ page, api }) => {
  expect(api.session).toBeUndefined();
  api.on('GET', '/api/dashboard', { status: 200, body: dashboardOf() });

  await page.goto('/');

  await expect(page).toHaveURL('/login');
  expect(dashboardRequests(api)).toHaveLength(0);
});

test('admin_and_hr_finance_see_five_cards_in_order', async ({ page, api }) => {
  for (const role of ['admin', 'hr_finance'] as const) {
    serveDashboard(api, role);
    expect(Object.keys(dashboardFor(role)).sort(), role).toEqual(['enrollments', 'payments', 'students', 'today']);

    await page.goto('/');

    await expect(card(page, 'Alunos'), role).toBeVisible();
    expect(await cardTitles(page), role).toEqual([
      'Alunos',
      'Matrículas',
      'Vencimentos nos próximos 7 dias',
      'Pagamentos',
      'Matrículas ativas por plano',
    ]);
    await expect(page.getByRole('region'), role).toHaveCount(5);
  }
});

test('cards_follow_the_response_keys_not_the_session_role', async ({ page, api }) => {
  // sessão de `admin`, resposta sem `payments`
  serveDashboard(api, 'admin', dashboardFor('reception'));
  await page.goto('/');
  for (const title of ['Alunos', 'Matrículas', EXPIRING, BY_PLAN]) await expect(card(page, title), title).toBeVisible();
  await expect(card(page, 'Pagamentos')).toHaveCount(0);
  expect(await cardTitles(page)).toEqual(['Alunos', 'Matrículas', EXPIRING, BY_PLAN]);

  // sessão de `admin`, resposta sem `enrollments` e sem `payments`
  serveDashboard(api, 'admin', dashboardFor('instructor'));
  await page.goto('/');
  await expect(card(page, 'Alunos')).toBeVisible();
  expect(await cardTitles(page)).toEqual(['Alunos']);
});

test('student_and_plan_name_markup_shown_as_literal_text_in_both_tables', async ({ page, api }) => {
  const plan = planOf(4, '<i>Mensal</i>', 'monthly');
  const items = [expiringOf({ student: { id: '018f0000-0000-7000-8000-0000000006bb', name: '<b>Ana</b>' }, plan })];
  serveDashboard(
    api,
    'reception',
    dashboardFor('reception', dashboardOf({}, { expiringSoon: { days: 7, items }, byPlan: [{ plan, active: 8 }] })),
  );

  await page.goto('/');

  const expiring = card(page, EXPIRING);
  expect(await column(expiring, 1).allTextContents()).toEqual(['<b>Ana</b>']);
  expect(await textsOf(column(expiring, 2))).toEqual(['<i>Mensal</i> · Mensal']);
  expect(await textsOf(column(card(page, BY_PLAN), 1))).toEqual(['<i>Mensal</i> · Mensal']);
  // nenhum dos dois textos criou elemento
  await expect(page.getByRole('main').locator('b')).toHaveCount(0);
  await expect(page.getByRole('main').locator('i')).toHaveCount(0);
});

test('home_requests_the_dashboard_once_and_no_other_data_route_for_four_roles', async ({ page, api }) => {
  for (const role of ALL_ROLES) {
    serveDashboard(api, role);
    api.requests = [];

    await page.goto('/');
    await expect(card(page, 'Alunos'), role).toBeVisible();
    await page.waitForLoadState('networkidle');

    const requests = dashboardRequests(api);
    expect(requests.map((request) => `${request.method} ${request.path}?${request.query}`), role).toEqual(['GET /api/dashboard?']);
    for (const prefix of ['/api/payments', '/api/students', '/api/plans']) {
      expect(api.requests.filter((request) => request.path.startsWith(prefix)), `${role}: ${prefix}`).toHaveLength(0);
    }
  }
  expect(ALL_ROLES).toHaveLength(4);
});
