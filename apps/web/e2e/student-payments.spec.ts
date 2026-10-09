import type { Role, StudentPayment } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, type FakeApi, problem, test } from './support/fake-api.ts';
import { enrollmentOf, studentOf } from './support/plans.ts';
import {
  confirmationOf,
  NO_PAYMENT_ROLES,
  openPaymentOf,
  PAYMENT_ROLES,
  type PaymentsState,
  paymentsStateOf,
  periodOf,
  serveOpenPayments,
  servePaymentsFicha,
  spaced,
  STUDENT_ID,
  studentPaymentRequests,
  textsOf,
} from './support/payments.ts';

const FICHA = `/students/${STUDENT_ID}`;
const ROUTE = `/api/students/${STUDENT_ID}/payments`;
const PERIOD = '07/10/2026 a 06/11/2026';

const block = (page: Page) => page.getByRole('region', { name: 'Pagamentos', exact: true });
const row = (page: Page, n: number) => block(page).locator('tbody tr').nth(n);
const button = (page: Page, name: string) => block(page).getByRole('button', { name, exact: true });
const dialog = (page: Page) => page.getByRole('dialog');
const confirm = (page: Page) => dialog(page).getByRole('button', { name: 'Confirmar', exact: true });
const back = (page: Page) => dialog(page).getByRole('button', { name: 'Voltar', exact: true });
const column = (page: Page, n: number) => block(page).locator(`tbody tr td:nth-child(${n})`);

/** A ficha do aluno de teste com os períodos dados, para o perfil dado. */
function serve(api: FakeApi, role: Role, items: StudentPayment[] = [], overrides: Partial<PaymentsState> = {}, name?: string) {
  const state = paymentsStateOf({ periods: { [STUDENT_ID]: items }, ...overrides });
  servePaymentsFicha(api, role, state, studentOf(name ? { name } : {}));
  return state;
}

const gets = (api: FakeApi) => studentPaymentRequests(api).filter((request) => request.method === 'GET');

test('ficha_block_four_columns_four_statuses_formats_and_one_request', async ({ page, api }) => {
  // fora da ordem de data: quem ordena é a API, e a tela mantém a ordem que recebeu
  const items = [
    periodOf({ status: 'pending' }),
    periodOf({ startsAt: '2026-12-01', endsAt: '2026-12-31', priceCents: 24990, status: 'paid', payment: confirmationOf() }),
    periodOf({ startsAt: '2026-08-01', endsAt: '2026-08-31', priceCents: 8990, status: 'overdue' }),
    periodOf({ startsAt: '2026-09-01', endsAt: '2026-09-30', priceCents: 0, status: 'cancelled' }),
  ];
  const labels = ['Pendente', 'Pago', 'Atrasado', 'Matrícula cancelada'];

  for (const role of PAYMENT_ROLES) {
    api.requests = [];
    serve(api, role, items);

    await page.goto(FICHA);

    await expect(block(page), role).toBeVisible();
    await expect(column(page, 1), role).toHaveCount(4);
    expect(await block(page).getByRole('columnheader').allTextContents(), role).toEqual([
      'Período',
      'Pagar até',
      'Valor',
      'Situação',
    ]);
    expect(await column(page, 1).allTextContents(), role).toEqual([
      PERIOD,
      '01/12/2026 a 31/12/2026',
      '01/08/2026 a 31/08/2026',
      '01/09/2026 a 30/09/2026',
    ]);
    expect(await column(page, 2).allTextContents(), role).toEqual(['07/10/2026', '01/12/2026', '01/08/2026', '01/09/2026']);
    expect(await textsOf(column(page, 3)), role).toEqual(['R$ 99,90', 'R$ 249,90', 'R$ 89,90', 'R$ 0,00']);
    for (const [index, text] of labels.entries()) {
      // a célula da situação traz também os botões da linha
      await expect(column(page, 4).nth(index).getByText(text, { exact: true }), `${role} ${text}`).toBeVisible();
    }
    expect(gets(api), role).toHaveLength(1);
  }
});

test('ficha_block_empty_state', async ({ page, api }) => {
  for (const role of PAYMENT_ROLES) {
    serve(api, role, []);

    await page.goto(FICHA);

    await expect(block(page).getByText('Nenhum período para cobrar.', { exact: true }), role).toBeVisible();
    await expect(block(page).getByRole('table'), role).toHaveCount(0);
  }
});

test('ficha_block_load_failure_keeps_the_rest_of_the_ficha', async ({ page, api }) => {
  serve(api, 'admin', [periodOf()]);
  let down = true;
  api.on('GET', ROUTE, () => (down ? { status: 500 } : { status: 200, body: { items: [periodOf()] } }));
  api.on('GET', `/api/students/${STUDENT_ID}/enrollments`, { status: 200, body: { items: [enrollmentOf()] } });

  await page.goto(FICHA);

  await expect(block(page).getByText('Não foi possível carregar os pagamentos.', { exact: true })).toBeVisible();
  const retry = button(page, 'Tentar novamente');
  await expect(retry).toBeVisible();
  await expect(block(page).getByRole('table')).toHaveCount(0);
  // o resto da ficha segue na página: o nome e o bloco de matrículas
  await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Matrículas', exact: true })).toBeVisible();

  down = false;
  await retry.click();
  await expect(block(page).getByRole('table')).toBeVisible();
});

test('reception_and_instructor_ficha_has_no_payments_block_and_no_request', async ({ page, api }) => {
  for (const role of NO_PAYMENT_ROLES) {
    api.requests = [];
    serve(api, role, [periodOf()]);

    await page.goto(FICHA);

    await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha', exact: true }), role).toBeVisible();
    await expect(page.getByText('Pagamentos'), role).toHaveCount(0);
    await expect(block(page), role).toHaveCount(0);
    expect(studentPaymentRequests(api), role).toHaveLength(0);
  }
});

test('confirm_button_only_on_pending_and_overdue_periods', async ({ page, api }) => {
  const items = [
    periodOf({ status: 'pending' }),
    periodOf({ startsAt: '2026-08-01', endsAt: '2026-08-31', status: 'overdue' }),
    periodOf({ startsAt: '2026-09-01', endsAt: '2026-09-30', status: 'paid', payment: confirmationOf() }),
    periodOf({ startsAt: '2026-06-01', endsAt: '2026-06-30', status: 'cancelled' }),
  ];
  const expected = [1, 1, 0, 0];

  for (const role of PAYMENT_ROLES) {
    serve(api, role, items);

    await page.goto(FICHA);

    await expect(block(page), role).toBeVisible();
    for (const [index, count] of expected.entries()) {
      await expect(
        row(page, index).getByRole('button', { name: 'Confirmar pagamento', exact: true }),
        `${role} linha ${index}`,
      ).toHaveCount(count);
    }
  }
});

test('confirm_dialog_names_student_period_and_value_and_sends_only_enrollment_id_after_confirmar', async ({ page, api }) => {
  const period = periodOf({ status: 'pending' });
  serve(api, 'hr_finance', [period]);
  await page.goto(FICHA);

  await button(page, 'Confirmar pagamento').click();

  await expect(dialog(page)).toBeVisible();
  const text = spaced((await dialog(page).textContent()) ?? '');
  for (const expected of ['Rafaela Prado Cunha', PERIOD, 'R$ 99,90']) {
    expect(text, expected).toContain(expected);
  }
  await expect(confirm(page)).toBeVisible();
  expect(api.writes()).toHaveLength(0);

  // desistir fecha sem enviar
  await back(page).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(api.writes()).toHaveLength(0);

  await button(page, 'Confirmar pagamento').click();
  await confirm(page).click();

  await expect(dialog(page)).toHaveCount(0);
  expect(api.writes().map((request) => `${request.method} ${request.path}`)).toEqual([`POST ${ROUTE}`]);
  expect(api.writes()[0]!.body).toEqual({ enrollmentId: period.enrollmentId });
});

test('after_201_dialog_closes_and_period_is_pago', async ({ page, api }) => {
  serve(api, 'admin', [periodOf({ status: 'pending' })]);
  await page.goto(FICHA);

  await button(page, 'Confirmar pagamento').click();
  await confirm(page).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(column(page, 4).getByText('Pago', { exact: true })).toBeVisible();
  await expect(button(page, 'Confirmar pagamento')).toHaveCount(0);
  await expect(button(page, 'Desfazer pagamento')).toHaveCount(1);
});

test('confirm_409_messages_for_cancelled_and_already_confirmed', async ({ page, api }) => {
  const messages: Array<[string, string]> = [
    ['enrollment_cancelled', 'Esta matrícula foi cancelada.'],
    ['payment_already_confirmed', 'Este período já está pago.'],
  ];

  for (const [code, message] of messages) {
    serve(api, 'hr_finance', [periodOf({ status: 'pending' })]);
    api.on('POST', ROUTE, problem(409, code));
    await page.goto(FICHA);
    await button(page, 'Confirmar pagamento').click();

    await confirm(page).click();

    await expect(dialog(page).getByText(message, { exact: true }), code).toBeVisible();
    await expect(dialog(page), code).toBeVisible();
    api.requests = [];
  }
  expect(messages).toHaveLength(2);
});

test('undo_button_only_on_periods_with_an_alive_confirmation', async ({ page, api }) => {
  const items = [
    periodOf({ status: 'paid', payment: confirmationOf() }),
    periodOf({ startsAt: '2026-08-01', endsAt: '2026-08-31', status: 'cancelled', payment: confirmationOf() }),
    periodOf({ startsAt: '2026-09-01', endsAt: '2026-09-30', status: 'pending' }),
    periodOf({ startsAt: '2026-06-01', endsAt: '2026-06-30', status: 'overdue' }),
  ];
  const expected = [1, 1, 0, 0];

  for (const role of PAYMENT_ROLES) {
    serve(api, role, items);

    await page.goto(FICHA);

    await expect(block(page), role).toBeVisible();
    for (const [index, count] of expected.entries()) {
      await expect(
        row(page, index).getByRole('button', { name: 'Desfazer pagamento', exact: true }),
        `${role} linha ${index}`,
      ).toHaveCount(count);
    }
    // o cancelado com confirmação viva segue dito como cancelado
    await expect(column(page, 4).nth(1).getByText('Matrícula cancelada', { exact: true }), role).toBeVisible();
  }
});

test('undo_dialog_confirms_before_delete_and_period_returns_to_pendente_or_atrasado', async ({ page, api }) => {
  const dueToday = periodOf({ status: 'paid', payment: confirmationOf() });
  const dueBefore = periodOf({
    startsAt: '2026-09-01',
    endsAt: '2026-09-30',
    priceCents: 8990,
    status: 'paid',
    payment: confirmationOf(),
  });
  serve(api, 'hr_finance', [dueToday, dueBefore]);
  await page.goto(FICHA);

  await row(page, 0).getByRole('button', { name: 'Desfazer pagamento', exact: true }).click();

  await expect(dialog(page)).toBeVisible();
  const text = spaced((await dialog(page).textContent()) ?? '');
  for (const expected of ['Rafaela Prado Cunha', PERIOD, 'R$ 99,90']) {
    expect(text, expected).toContain(expected);
  }
  expect(api.writes()).toHaveLength(0);

  // desistir fecha sem enviar
  await back(page).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(api.writes()).toHaveLength(0);

  await row(page, 0).getByRole('button', { name: 'Desfazer pagamento', exact: true }).click();
  const paymentId = dueToday.payment?.id;
  await confirm(page).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(column(page, 4).nth(0).getByText('Pendente', { exact: true })).toBeVisible();
  expect(api.writes().map((request) => `${request.method} ${request.path}`)).toEqual([`DELETE ${ROUTE}/${paymentId}`]);

  await row(page, 1).getByRole('button', { name: 'Desfazer pagamento', exact: true }).click();
  await confirm(page).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(column(page, 4).nth(1).getByText('Atrasado', { exact: true })).toBeVisible();
  expect(api.writes()).toHaveLength(2);
});

test('dialog_confirm_buttons_disabled_while_waiting_one_request', async ({ page, api }) => {
  const paid = periodOf({ startsAt: '2026-09-01', endsAt: '2026-09-30', status: 'paid', payment: confirmationOf() });
  serve(api, 'admin', [periodOf({ status: 'pending' }), paid]);
  api.on('POST', ROUTE, 'hang');
  api.on('DELETE', `${ROUTE}/${paid.payment!.id}`, 'hang');
  await page.goto(FICHA);

  await row(page, 0).getByRole('button', { name: 'Confirmar pagamento', exact: true }).click();
  await confirm(page).click();

  await expect(confirm(page)).toBeDisabled();
  await confirm(page).click({ force: true });
  await expect.poll(() => api.writes().length).toBe(1);
  await page.waitForTimeout(500);
  expect(api.writes().map((request) => request.method)).toEqual(['POST']);

  // o outro diálogo, do outro lado: a página recarrega e desfaz a espera
  await page.goto(FICHA);
  api.requests = [];
  await row(page, 1).getByRole('button', { name: 'Desfazer pagamento', exact: true }).click();
  await confirm(page).click();

  await expect(confirm(page)).toBeDisabled();
  await confirm(page).click({ force: true });
  await expect.poll(() => api.writes().length).toBe(1);
  await page.waitForTimeout(500);
  expect(api.writes().map((request) => request.method)).toEqual(['DELETE']);
});

test('student_name_markup_shown_as_literal_text_in_list_and_both_dialogs', async ({ page, api }) => {
  const name = '<b>Ana</b> Souza';

  serveOpenPayments(api, 'admin', [openPaymentOf({ student: { id: STUDENT_ID, name } })]);
  await page.goto('/payments');
  await expect(page.locator('tbody tr td:nth-child(1)')).toHaveText([name]);
  await expect(page.locator('tbody b')).toHaveCount(0);

  serve(api, 'admin', [periodOf({ status: 'pending' }), periodOf({ startsAt: '2026-09-01', endsAt: '2026-09-30', status: 'paid', payment: confirmationOf() })], {}, name);
  await page.goto(FICHA);

  await row(page, 0).getByRole('button', { name: 'Confirmar pagamento', exact: true }).click();
  expect(await dialog(page).textContent()).toContain(name);
  await expect(dialog(page).locator('b')).toHaveCount(0);
  await back(page).click();

  await row(page, 1).getByRole('button', { name: 'Desfazer pagamento', exact: true }).click();
  expect(await dialog(page).textContent()).toContain(name);
  await expect(dialog(page).locator('b')).toHaveCount(0);
});
