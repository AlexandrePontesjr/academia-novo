import type { CheckInsReport, Role } from '@academia/contracts';
import type { Page } from '@playwright/test';
import {
  CHECK_IN_ROLES,
  LATE,
  NO_CHECK_IN_ROLES,
  NO_PERMISSION,
  reportItemOf,
  reportOf,
  reportRequests,
} from './support/check-ins.ts';
import { expect, type FakeApi, problem, type Reply, sessionOf, test } from './support/fake-api.ts';

const heading = (page: Page) => page.getByRole('heading', { name: 'Presenças', exact: true, level: 2 });
const de = (page: Page) => page.getByLabel('De', { exact: true });
const ate = (page: Page) => page.getByLabel('Até', { exact: true });
const column = (page: Page, n: number) => page.getByRole('main').locator(`tbody tr td:nth-child(${n})`);
const loadMore = (page: Page) => page.getByRole('button', { name: 'Carregar mais', exact: true });
const LOAD_ERROR = 'Não foi possível carregar as presenças.';

/** Abre a sessão do perfil e faz `GET /api/check-ins` responder `reply`, ou o que ela calcular da query. */
function serveReport(api: FakeApi, role: Role, reply: Reply | ((query: URLSearchParams) => Reply)) {
  api.session = sessionOf(role);
  api.on('GET', '/api/check-ins', (request) =>
    typeof reply === 'function' ? reply(new URLSearchParams(request.query)) : reply,
  );
}

const ok = (report: CheckInsReport): Reply => ({ status: 200, body: report });

test('hr_finance_and_instructor_see_no_permission_without_report_request', async ({ page, api }) => {
  for (const role of NO_CHECK_IN_ROLES) {
    api.requests = [];
    serveReport(api, role, ok(reportOf({ total: 3, items: [reportItemOf(1, { student: { id: reportItemOf(1).student.id, name: 'Aluno Sigiloso' } })] })));

    await page.goto('/check-ins');

    await expect(page.getByText(NO_PERMISSION, { exact: true }), role).toBeVisible();
    await expect(page.getByRole('table'), role).toHaveCount(0);
    expect(await page.locator('body').innerText(), role).not.toContain('Aluno Sigiloso');
    expect(reportRequests(api), role).toHaveLength(0);
  }
  expect(NO_CHECK_IN_ROLES).toEqual(['hr_finance', 'instructor']);
});

test('report_title_fields_from_response_total_and_four_columns_in_api_order', async ({ page, api }) => {
  // fora da ordem de data: quem ordena é a API, e a tela mantém a ordem que recebeu
  const items = [
    reportItemOf(1, { day: '2026-10-03', checkedInAt: '2026-10-03T12:10:00.000Z', student: { id: reportItemOf(1).student.id, name: 'Carla' }, checkedInBy: { id: reportItemOf(1).checkedInBy.id, name: 'Paula Recepção' } }),
    reportItemOf(2, { day: '2026-10-07', checkedInAt: LATE, student: { id: reportItemOf(2).student.id, name: 'Ana' }, checkedInBy: { id: reportItemOf(2).checkedInBy.id, name: 'Marina Duarte' } }),
    reportItemOf(3, { day: '2026-10-01', checkedInAt: '2026-10-01T09:00:00.000Z', student: { id: reportItemOf(3).student.id, name: 'Bruno' }, checkedInBy: { id: reportItemOf(3).checkedInBy.id, name: 'Paula Recepção' } }),
  ];

  for (const role of CHECK_IN_ROLES) {
    // a página não manda período: os campos vêm do `from` e do `to` da resposta
    serveReport(api, role, ok(reportOf({ from: '2026-10-01', to: '2026-10-07', total: 17, items })));

    await page.goto('/check-ins');

    await expect(heading(page), role).toBeVisible();
    await expect(de(page), role).toHaveValue('2026-10-01');
    await expect(ate(page), role).toHaveValue('2026-10-07');
    await expect(page.getByText('Total no período: 17', { exact: true }), role).toBeVisible();
    expect(await page.getByRole('main').getByRole('columnheader').allTextContents(), role).toEqual([
      'Data',
      'Hora',
      'Aluno',
      'Registrado por',
    ]);
    expect(await column(page, 1).allTextContents(), role).toEqual(['03/10/2026', '07/10/2026', '01/10/2026']);
    expect(await column(page, 2).allTextContents(), role).toEqual(['09:10', '23:30', '06:00']);
    expect(await column(page, 3).allTextContents(), role).toEqual(['Carla', 'Ana', 'Bruno']);
    for (const item of items) {
      await expect(column(page, 3).getByRole('link', { name: item.student.name, exact: true }), role).toHaveAttribute(
        'href',
        `/students/${item.student.id}`,
      );
    }
    expect(await column(page, 4).allTextContents(), role).toEqual(['Paula Recepção', 'Marina Duarte', 'Paula Recepção']);
  }
  expect(CHECK_IN_ROLES).toEqual(['admin', 'reception']);
});

test('submitting_de_and_ate_navigates_and_requests_both_dates', async ({ page, api }) => {
  serveReport(api, 'reception', (query) =>
    ok(reportOf({ from: query.get('from') ?? '2026-10-07', to: query.get('to') ?? '2026-10-07', total: 0 })),
  );
  await page.goto('/check-ins');
  await expect(de(page)).toHaveValue('2026-10-07');
  api.requests = [];

  await de(page).fill('2026-09-30');
  await ate(page).fill('2026-10-06');
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click();

  await expect(page).toHaveURL('/check-ins?from=2026-09-30&to=2026-10-06');
  await expect(de(page)).toHaveValue('2026-09-30');
  const requests = reportRequests(api);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.method).toBe('GET');
  expect([...new URLSearchParams(requests[0]!.query)]).toEqual([
    ['from', '2026-09-30'],
    ['to', '2026-10-06'],
  ]);
});

test('report_422_messages_next_to_their_fields', async ({ page, api }) => {
  serveReport(
    api,
    'admin',
    problem(422, 'validation_failed', [
      { path: 'from', message: 'Informe uma data inicial válida.' },
      { path: 'to', message: 'A data final deve ser igual ou posterior à inicial.' },
    ]),
  );

  await page.goto('/check-ins?from=2026-10-08&to=2026-10-07');

  await expect(de(page)).toHaveAccessibleDescription('Informe uma data inicial válida.');
  await expect(ate(page)).toHaveAccessibleDescription('A data final deve ser igual ou posterior à inicial.');
  await expect(page.getByText(LOAD_ERROR, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('empty_period_shows_zero_total_and_message_without_table', async ({ page, api }) => {
  serveReport(api, 'reception', ok(reportOf({ total: 0, items: [] })));

  await page.goto('/check-ins');

  await expect(page.getByText('Total no período: 0', { exact: true })).toBeVisible();
  await expect(page.getByText('Nenhuma presença no período.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(loadMore(page)).toHaveCount(0);
});

test('report_load_more_keeps_period_and_appends', async ({ page, api }) => {
  const cursor = '018f0000-0000-7000-8000-0000000c2cc1';
  const first = [reportItemOf(41, { day: '2026-10-07' }), reportItemOf(42, { day: '2026-10-05' })];
  const second = [reportItemOf(43, { day: '2026-10-02' })];
  serveReport(api, 'reception', (query) =>
    ok(
      reportOf({
        from: '2026-10-01',
        to: '2026-10-07',
        total: 3,
        ...(query.get('cursor') === cursor ? { items: second } : { items: first, nextCursor: cursor }),
      }),
    ),
  );

  await page.goto('/check-ins?from=2026-10-01&to=2026-10-07');
  expect(await column(page, 1).allTextContents()).toEqual(['07/10/2026', '05/10/2026']);
  api.requests = [];

  await loadMore(page).click();

  await expect(column(page, 1)).toHaveCount(3);
  expect(await column(page, 1).allTextContents()).toEqual(['07/10/2026', '05/10/2026', '02/10/2026']);
  await expect(loadMore(page)).toHaveCount(0);
  const requests = reportRequests(api);
  expect(requests).toHaveLength(1);
  const query = new URLSearchParams(requests[0]!.query);
  expect(Object.fromEntries(query)).toEqual({ from: '2026-10-01', to: '2026-10-07', cursor });
});

test('report_failure_500_and_403_shows_retry', async ({ page, api }) => {
  const failures: Reply[] = [{ status: 500 }, problem(403, 'forbidden')];

  for (const failure of failures) {
    const status = String((failure as { status: number }).status);
    let down = true;
    serveReport(api, 'admin', () => (down ? failure : ok(reportOf({ total: 1, items: [reportItemOf(51)] }))));

    await page.goto('/check-ins');

    await expect(page.getByText(LOAD_ERROR, { exact: true }), status).toBeVisible();
    const retry = page.getByRole('button', { name: 'Tentar novamente', exact: true });
    await expect(retry, status).toBeVisible();
    await expect(page.getByRole('table'), status).toHaveCount(0);

    down = false;
    await retry.click();

    await expect(column(page, 1), status).toHaveCount(1);
    await expect(page.getByText(LOAD_ERROR, { exact: true }), status).toHaveCount(0);
  }
  expect(failures.map((failure) => (failure as { status: number }).status)).toEqual([500, 403]);
});

test('student_name_markup_shown_as_literal_text_in_report', async ({ page, api }) => {
  const item = reportItemOf(61, { student: { id: reportItemOf(61).student.id, name: '<b>Ana</b>' } });
  serveReport(api, 'reception', ok(reportOf({ total: 1, items: [item] })));

  await page.goto('/check-ins');

  expect(await column(page, 3).allTextContents()).toEqual(['<b>Ana</b>']);
  await expect(column(page, 3).getByRole('link', { name: '<b>Ana</b>', exact: true })).toHaveAttribute(
    'href',
    `/students/${item.student.id}`,
  );
  await expect(page.getByRole('main').locator('b')).toHaveCount(0);
});

test('anonymous_report_redirects_to_login_without_request', async ({ page, api }) => {
  expect(api.session).toBeUndefined();
  api.on('GET', '/api/check-ins', ok(reportOf()));

  await page.goto('/check-ins');

  await expect(page).toHaveURL('/login');
  expect(reportRequests(api)).toHaveLength(0);
});
