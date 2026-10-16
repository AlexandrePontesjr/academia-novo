import type { Role, StudentCheckIn } from '@academia/contracts';
import type { Page } from '@playwright/test';
import {
  CHECK_IN_ROLES,
  checkInsPath,
  historyItemOf,
  LATE,
  NO_CHECK_IN_ROLES,
  STUDENT_ID,
} from './support/check-ins.ts';
import { expect, type FakeApi, problem, type Reply, test } from './support/fake-api.ts';
import { paymentsStateOf, periodOf, servePaymentsFicha } from './support/payments.ts';
import { enrollmentOf, serveFicha, stateOf, studentOf } from './support/plans.ts';

const FICHA = `/students/${STUDENT_ID}`;
const ROUTE = checkInsPath(STUDENT_ID);
const LOAD_ERROR = 'Não foi possível carregar as presenças.';

const block = (page: Page) => page.getByRole('region', { name: 'Presenças', exact: true });
const column = (page: Page, n: number) => block(page).locator(`tbody tr td:nth-child(${n})`);
const loadMore = (page: Page) => block(page).getByRole('button', { name: 'Carregar mais', exact: true });
const historyRequests = (api: FakeApi) => api.requests.filter((request) => request.path === ROUTE);

/** A ficha do aluno de teste para o perfil, com o histórico respondendo `reply`. */
function serve(api: FakeApi, role: Role, reply: Reply | ((query: URLSearchParams) => Reply)) {
  serveFicha(api, role, studentOf(), stateOf());
  api.on('GET', ROUTE, (request) => (typeof reply === 'function' ? reply(new URLSearchParams(request.query)) : reply));
}

const page200 = (items: StudentCheckIn[], nextCursor: string | null = null): Reply => ({
  status: 200,
  body: { items, nextCursor },
});

test('ficha_check_ins_table_three_columns_in_api_order_with_sao_paulo_time', async ({ page, api }) => {
  // fora da ordem de data: quem ordena é a API, e a tela mantém a ordem que recebeu
  const items = [
    historyItemOf(1, { day: '2026-10-05', checkedInAt: '2026-10-05T10:00:00.000Z', checkedInBy: { id: STUDENT_ID, name: 'Bruno Lima' } }),
    historyItemOf(2, { day: '2026-10-07', checkedInAt: LATE, checkedInBy: { id: STUDENT_ID, name: 'Paula Recepção' } }),
    historyItemOf(3, { day: '2026-10-06', checkedInAt: '2026-10-06T21:15:00.000Z', checkedInBy: { id: STUDENT_ID, name: 'Carla Dias' } }),
  ];

  for (const role of CHECK_IN_ROLES) {
    serve(api, role, page200(items));

    await page.goto(FICHA);

    await expect(block(page), role).toBeVisible();
    expect(await block(page).getByRole('columnheader').allTextContents(), role).toEqual(['Data', 'Hora', 'Registrado por']);
    expect(await column(page, 1).allTextContents(), role).toEqual(['05/10/2026', '07/10/2026', '06/10/2026']);
    expect(await column(page, 2).allTextContents(), role).toEqual(['07:00', '23:30', '18:15']);
    expect(await column(page, 3).allTextContents(), role).toEqual(['Bruno Lima', 'Paula Recepção', 'Carla Dias']);
  }
  expect(CHECK_IN_ROLES).toEqual(['admin', 'reception']);
});

test('load_more_appends_the_next_page_and_disappears_on_the_last', async ({ page, api }) => {
  const first = [historyItemOf(11, { day: '2026-10-07' }), historyItemOf(12, { day: '2026-10-06' })];
  const second = [historyItemOf(13, { day: '2026-10-05' }), historyItemOf(14, { day: '2026-10-04' })];
  const cursor = '018f0000-0000-7000-8000-0000000c1cc1';
  serve(api, 'reception', (query) => (query.get('cursor') === cursor ? page200(second) : page200(first, cursor)));

  await page.goto(FICHA);

  expect(await column(page, 1).allTextContents()).toEqual(['07/10/2026', '06/10/2026']);
  await loadMore(page).click();

  await expect(column(page, 1)).toHaveCount(4);
  expect(await column(page, 1).allTextContents()).toEqual(['07/10/2026', '06/10/2026', '05/10/2026', '04/10/2026']);
  await expect(loadMore(page)).toHaveCount(0);
  const last = historyRequests(api).at(-1)!;
  expect(last.method).toBe('GET');
  expect([...new URLSearchParams(last.query)]).toEqual([['cursor', cursor]]);
});

test('no_check_in_shows_empty_message_without_table', async ({ page, api }) => {
  serve(api, 'reception', page200([]));

  await page.goto(FICHA);

  await expect(block(page).getByText('Nenhuma presença registrada.', { exact: true })).toBeVisible();
  await expect(block(page).getByRole('table')).toHaveCount(0);
  await expect(loadMore(page)).toHaveCount(0);
});

test('hr_finance_and_instructor_see_no_block_and_make_no_request', async ({ page, api }) => {
  for (const role of NO_CHECK_IN_ROLES) {
    api.requests = [];
    serve(api, role, page200([historyItemOf(21)]));

    await page.goto(FICHA);

    await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha', exact: true }), role).toBeVisible();
    await expect(block(page), role).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Presenças', exact: true }), role).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(historyRequests(api), role).toHaveLength(0);
  }
  expect(NO_CHECK_IN_ROLES).toEqual(['hr_finance', 'instructor']);
});

test('check_ins_failure_shows_retry_without_hiding_other_blocks', async ({ page, api }) => {
  const failures: Reply[] = [{ status: 500 }, problem(403, 'forbidden')];

  for (const failure of failures) {
    const status = String((failure as { status: number }).status);
    // o Administrador vê os blocos "Matrículas" e "Pagamentos" ao lado do de presenças
    servePaymentsFicha(
      api,
      'admin',
      paymentsStateOf({ periods: { [STUDENT_ID]: [periodOf()] } }),
      studentOf(),
      { enrollments: { [STUDENT_ID]: [enrollmentOf()] } },
    );
    let down = true;
    api.on('GET', ROUTE, () => (down ? failure : page200([historyItemOf(31)])));

    await page.goto(FICHA);

    await expect(block(page).getByText(LOAD_ERROR, { exact: true }), status).toBeVisible();
    const retry = block(page).getByRole('button', { name: 'Tentar novamente', exact: true });
    await expect(retry, status).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha', exact: true }), status).toBeVisible();
    await expect(page.getByRole('region', { name: 'Matrículas', exact: true }), status).toBeVisible();
    await expect(page.getByRole('region', { name: 'Pagamentos', exact: true }), status).toBeVisible();
    await expect(page.getByRole('region', { name: 'Pagamentos', exact: true }).locator('tbody tr'), status).toHaveCount(1);

    down = false;
    await retry.click();

    await expect(column(page, 1), status).toHaveCount(1);
    await expect(block(page).getByText(LOAD_ERROR, { exact: true }), status).toHaveCount(0);
  }
  expect(failures.map((failure) => (failure as { status: number }).status)).toEqual([500, 403]);
});
