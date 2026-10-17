import type { Role } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, type FakeApi, problem, sessionOf, test } from './support/fake-api.ts';
import { NO_PERMISSION, STAFF_ID, STUDENT_ID } from './support/privacy.ts';

const PATH = '/api/privacy-settings';
const YEARS = 'Anonimizar alunos inativos há mais de';
const DAYS = 'Guardar versões de foto por';

const settingsRequests = (api: FakeApi) => api.requests.filter((request) => request.path === PATH);
const puts = (api: FakeApi) => settingsRequests(api).filter((request) => request.method === 'PUT');
const years = (page: Page) => page.getByLabel(YEARS, { exact: true });
const days = (page: Page) => page.getByLabel(DAYS, { exact: true });
const off = (page: Page) => page.getByRole('checkbox', { name: 'Desligado', exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Salvar', exact: true });

function serve(api: FakeApi, settings: { inactiveStudentRetentionYears: number | null; photoVersionRetentionDays: number }) {
  api.session = sessionOf('admin');
  api.on('GET', PATH, { status: 200, body: settings });
  api.on('PUT', PATH, (request) => ({ status: 200, body: request.body }));
}

test('non_admin_sees_no_permission_without_any_request', async ({ page, api }) => {
  for (const role of ['reception', 'hr_finance', 'instructor'] as Role[]) {
    api.session = sessionOf(role);
    api.requests = [];

    await page.goto('/privacy');

    await expect(page.getByText(NO_PERMISSION, { exact: true }), role).toBeVisible();
    expect(settingsRequests(api), role).toEqual([]);
  }
});

test('settings_form_shows_off_or_years_saves_and_shows_field_errors', async ({ page, api }) => {
  serve(api, { inactiveStudentRetentionYears: null, photoVersionRetentionDays: 30 });
  await page.goto('/privacy');

  await expect(page.getByText(YEARS, { exact: true })).toBeVisible();
  await expect(off(page)).toBeChecked();
  await expect(years(page)).toHaveValue('');
  await expect(page.getByText(DAYS, { exact: true })).toBeVisible();
  await expect(days(page)).toHaveValue('30');
  await expect(page.getByText('dias', { exact: true })).toBeVisible();

  serve(api, { inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 30 });
  await page.goto('/privacy');
  await expect(off(page)).not.toBeChecked();
  await expect(years(page)).toHaveValue('5');
  await expect(page.getByText('anos', { exact: true })).toBeVisible();

  await save(page).click();
  await expect(page.getByText('Configurações salvas.', { exact: true })).toBeVisible();
  expect(puts(api).map((request) => request.body)).toEqual([{ inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 30 }]);

  // o `422` põe a `message` de cada item junto do campo do `path`
  api.on(
    'PUT',
    PATH,
    problem(422, 'validation_failed', [
      { path: 'inactiveStudentRetentionYears', message: 'Informe um número inteiro de 1 a 20 anos, ou desligue.' },
      { path: 'photoVersionRetentionDays', message: 'Informe um número inteiro de 1 a 365 dias.' },
    ]),
  );
  await years(page).fill('21');
  await days(page).fill('0');
  await save(page).click();

  const yearsError = page.getByText('Informe um número inteiro de 1 a 20 anos, ou desligue.', { exact: true });
  const daysError = page.getByText('Informe um número inteiro de 1 a 365 dias.', { exact: true });
  await expect(yearsError).toBeVisible();
  await expect(daysError).toBeVisible();
  expect(await years(page).getAttribute('aria-describedby')).toBe(await yearsError.getAttribute('id'));
  expect(await days(page).getAttribute('aria-describedby')).toBe(await daysError.getAttribute('id'));
  await expect(page.getByText('Configurações salvas.', { exact: true })).toHaveCount(0);
});

test('settings_load_failure_shows_message_and_retry_without_form', async ({ page, api }) => {
  api.session = sessionOf('admin');
  api.on('GET', PATH, problem(500, 'internal_error'));

  await page.goto('/privacy');

  await expect(page.getByText('Não foi possível carregar a configuração.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
  await expect(page.getByLabel(YEARS)).toHaveCount(0);
  await expect(save(page)).toHaveCount(0);

  const before = settingsRequests(api).length;
  serve(api, { inactiveStudentRetentionYears: null, photoVersionRetentionDays: 30 });
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(days(page)).toHaveValue('30');
  expect(settingsRequests(api).length).toBeGreaterThan(before);
});

test('anonymous_privacy_pages_redirect_to_login', async ({ page, api }) => {
  expect(api.session).toBeUndefined();

  for (const path of ['/privacy', `/students/${STUDENT_ID}/print`, `/staff/${STAFF_ID}/print`]) {
    await page.goto(path);

    await expect(page, path).toHaveURL('/login');
  }
});

test('off_sends_null_and_twenty_sends_twenty', async ({ page, api }) => {
  serve(api, { inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 30 });
  await page.goto('/privacy');

  await off(page).check();
  await save(page).click();
  await expect(page.getByText('Configurações salvas.', { exact: true })).toBeVisible();

  await off(page).uncheck();
  await years(page).fill('20');
  await save(page).click();
  await expect.poll(() => puts(api).length).toBe(2);

  expect(puts(api).map((request) => request.body)).toEqual([
    { inactiveStudentRetentionYears: null, photoVersionRetentionDays: 30 },
    { inactiveStudentRetentionYears: 20, photoVersionRetentionDays: 30 },
  ]);
});
