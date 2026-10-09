import type { OpenPayment } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fake-api.ts';
import {
  NO_PAYMENT_ROLES,
  NO_PERMISSION,
  openPaymentOf,
  openPaymentRequests,
  PAYMENT_ROLES,
  serveOpenPayments,
  textsOf,
} from './support/payments.ts';

const heading = (page: Page) => page.getByRole('heading', { name: 'Pagamentos', exact: true });
const situacao = (page: Page) => page.getByLabel('Situação', { exact: true });
const column = (page: Page, n: number) => page.locator(`tbody tr td:nth-child(${n})`);
const EMPTY = 'Nenhum pagamento pendente ou atrasado.';
const ID = (n: number) => `018f0000-0000-7000-8000-00000000066${n}`;

/** A query da última requisição de `GET /api/payments` que a API falsa recebeu. */
const lastQuery = (api: Parameters<typeof openPaymentRequests>[0]) => openPaymentRequests(api).at(-1)?.query;

test('anonymous_payments_redirects_to_login', async ({ page, api }) => {
  expect(api.session).toBeUndefined();

  await page.goto('/payments');

  await expect(page).toHaveURL('/login');
  expect(openPaymentRequests(api)).toHaveLength(0);
});

test('reception_and_instructor_see_no_permission_and_no_payment_data', async ({ page, api }) => {
  const items = [
    openPaymentOf({ student: { id: ID(1), name: 'Aluno Sigiloso' }, priceCents: 123456 }),
    openPaymentOf({ status: 'overdue' }),
  ];

  for (const role of NO_PAYMENT_ROLES) {
    api.requests = [];
    serveOpenPayments(api, role, items);

    await page.goto('/payments');

    await expect(page.getByText(NO_PERMISSION, { exact: true }), role).toBeVisible();
    const text = await page.locator('body').innerText();
    for (const secret of ['Aluno Sigiloso', 'Ana Souza', '1.234,56', '99,90']) {
      expect(text, `${role}: ${secret}`).not.toContain(secret);
    }
    await expect(page.getByRole('table'), role).toHaveCount(0);
    expect(openPaymentRequests(api), role).toHaveLength(0);
  }
  expect(NO_PAYMENT_ROLES).toEqual(['reception', 'instructor']);
});

test('payments_page_title_filter_options_six_columns_in_api_order', async ({ page, api }) => {
  // fora da ordem de vencimento: quem ordena é a API, e a tela mantém a ordem que recebeu
  const items = [
    openPaymentOf({ student: { id: ID(1), name: 'Carla' }, startsAt: '2026-10-09', dueDate: '2026-10-09' }),
    openPaymentOf({ student: { id: ID(2), name: 'Ana' }, startsAt: '2026-10-06', dueDate: '2026-10-06', status: 'overdue' }),
    openPaymentOf({ student: { id: ID(3), name: 'Bruno' }, startsAt: '2026-10-08', dueDate: '2026-10-08' }),
  ];

  for (const role of PAYMENT_ROLES) {
    serveOpenPayments(api, role, items);

    await page.goto('/payments');

    await expect(heading(page), role).toBeVisible();
    expect(await textsOf(situacao(page).locator('option')), role).toEqual(['Todas', 'Pendente', 'Atrasado']);
    expect(await page.getByRole('columnheader').allTextContents(), role).toEqual([
      'Aluno',
      'Plano',
      'Período',
      'Pagar até',
      'Valor',
      'Situação',
    ]);
    expect(await column(page, 1).allTextContents(), role).toEqual(['Carla', 'Ana', 'Bruno']);
  }
  expect(PAYMENT_ROLES).toEqual(['admin', 'hr_finance']);
});

test('payments_row_formats_name_link_plan_period_dates_price_and_status', async ({ page, api }) => {
  const id = '018f0000-0000-7000-8000-0000000006aa';
  serveOpenPayments(api, 'hr_finance', [
    openPaymentOf({
      student: { id, name: 'Ana Souza' },
      plan: { id: '018f0000-0000-7000-8000-000000000901', name: 'Mensal Plus', period: 'monthly' },
      startsAt: '2026-10-07',
      endsAt: '2026-11-06',
      dueDate: '2026-10-07',
      priceCents: 123456,
      status: 'overdue',
    }),
    openPaymentOf({ status: 'pending' }),
  ]);

  await page.goto('/payments');

  await expect(page.locator('tbody tr')).toHaveCount(2);
  const link = column(page, 1).nth(0).getByRole('link', { name: 'Ana Souza', exact: true });
  await expect(link).toHaveAttribute('href', `/students/${id}`);
  expect(await textsOf(column(page, 2))).toEqual(['Mensal Plus · Mensal', 'Mensal · Mensal']);
  expect(await column(page, 3).allTextContents()).toEqual(['07/10/2026 a 06/11/2026', '07/10/2026 a 06/11/2026']);
  expect(await column(page, 4).allTextContents()).toEqual(['07/10/2026', '07/10/2026']);
  expect(await textsOf(column(page, 5))).toEqual(['R$ 1.234,56', 'R$ 99,90']);
  expect(await column(page, 6).allTextContents()).toEqual(['Atrasado', 'Pendente']);
});

test('situacao_choice_loads_status_query_and_todas_drops_it', async ({ page, api }) => {
  const pending = openPaymentOf({ student: { id: ID(1), name: 'Pendente Paulo' }, status: 'pending' });
  const overdue = openPaymentOf({ student: { id: ID(2), name: 'Atrasada Alice' }, startsAt: '2026-10-01', dueDate: '2026-10-01', status: 'overdue' });
  serveOpenPayments(api, 'admin', [pending, overdue]);
  await page.goto('/payments');
  expect(await column(page, 1).allTextContents()).toEqual(['Pendente Paulo', 'Atrasada Alice']);

  await situacao(page).selectOption({ label: 'Pendente' });

  await expect(page).toHaveURL('/payments?status=pending');
  await expect.poll(() => lastQuery(api)).toBe('status=pending');
  await expect(column(page, 1)).toHaveText(['Pendente Paulo']);

  await situacao(page).selectOption({ label: 'Atrasado' });

  await expect(page).toHaveURL('/payments?status=overdue');
  await expect.poll(() => lastQuery(api)).toBe('status=overdue');
  await expect(column(page, 1)).toHaveText(['Atrasada Alice']);

  await situacao(page).selectOption({ label: 'Todas' });

  await expect(page).toHaveURL('/payments');
  await expect.poll(() => lastQuery(api)).toBe('');
  await expect(column(page, 1)).toHaveText(['Pendente Paulo', 'Atrasada Alice']);
});

test('payments_empty_state_replaces_table', async ({ page, api }) => {
  const cases: Array<[string, OpenPayment[], string]> = [
    ['nenhum período por pagar', [], '/payments'],
    ['nenhum atrasado entre os pendentes', [openPaymentOf({ status: 'pending' })], '/payments?status=overdue'],
  ];

  for (const [name, items, path] of cases) {
    serveOpenPayments(api, 'hr_finance', items);

    await page.goto(path);

    await expect(page.getByText(EMPTY, { exact: true }), name).toBeVisible();
    await expect(page.getByRole('table'), name).toHaveCount(0);
  }
});

test('payments_load_failure_shows_retry_and_retry_shows_the_table', async ({ page, api }) => {
  serveOpenPayments(api, 'admin', []);
  let down = true;
  api.on('GET', '/api/payments', () =>
    down ? { status: 500 } : { status: 200, body: { items: [openPaymentOf()] } },
  );

  await page.goto('/payments');

  await expect(page.getByText('Não foi possível carregar os pagamentos.', { exact: true })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Tentar novamente', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  down = false;
  await retry.click();

  await expect(page.getByRole('table')).toBeVisible();
});

test('reopening_the_url_keeps_the_situacao_choice', async ({ page, api }) => {
  serveOpenPayments(api, 'admin', [openPaymentOf({ status: 'pending' }), openPaymentOf({ status: 'overdue' })]);
  const cases: Array<[string, string]> = [
    ['/payments?status=overdue', 'Atrasado'],
    ['/payments?status=pending', 'Pendente'],
    ['/payments', 'Todas'],
  ];

  for (const [path, chosen] of cases) {
    await page.goto(path);

    await expect(situacao(page).locator('option:checked'), path).toHaveText(chosen);
  }
  expect(cases).toHaveLength(3);
});
