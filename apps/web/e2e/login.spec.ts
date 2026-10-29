import type { Role, StaffRole } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, problem, sessionOf, test } from './support/fake-api.ts';

async function submitLogin(page: Page, email = 'marina@exemplo.com', password = 'senha-de-teste-123') {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('login_page_shows_form_in_pt_br', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta', exact: true })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(page.getByLabel('Senha')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
});

test('home_shows_name_and_role_label_for_four_roles', async ({ page, api }) => {
  // o cabeçalho DukFit mostra o perfil como "Perfil: <perfil>" (dukfit-app, AC 2)
  const labels: Record<StaffRole, string> = {
    admin: 'Perfil: Administrador',
    reception: 'Perfil: Recepção',
    hr_finance: 'Perfil: RH/Financeiro',
    instructor: 'Perfil: Instrutor',
  };

  for (const [role, label] of Object.entries(labels) as Array<[Role, string]>) {
    const name = `Pessoa do perfil ${role}`;
    api.session = undefined;
    api.on('POST', '/api/auth/login', () => {
      api.session = sessionOf(role, { name });
      return { status: 200, body: { status: 'authenticated' } };
    });
    await page.goto('/login');

    await submitLogin(page);

    await expect(page, role).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'DukFit' }), role).toBeVisible();
    await expect(page.getByText(name, { exact: true }), role).toBeVisible();
    await expect(page.getByText(label, { exact: true }), role).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair' }), role).toBeVisible();
  }
});

test('login_401_shows_message_and_clears_password', async ({ page, api }) => {
  api.on('POST', '/api/auth/login', problem(401, 'invalid_credentials'));
  await page.goto('/login');

  await submitLogin(page, 'digitado@exemplo.com', 'senha-errada-000');

  await expect(page.getByText('E-mail ou senha incorretos.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toHaveValue('digitado@exemplo.com');
  await expect(page.getByLabel('Senha')).toHaveValue('');
  await expect(page).toHaveURL('/login');
});

test('login_429_shows_minutes_rounded_up', async ({ page, api }) => {
  const cases = [
    { retryAfter: 900, minutes: 15 },
    { retryAfter: 61, minutes: 2 },
    { retryAfter: 60, minutes: 1 },
  ];

  for (const { retryAfter, minutes } of cases) {
    const blocked = problem(429, 'too_many_attempts');
    if (blocked === 'hang') throw new Error('resposta inesperada');
    api.on('POST', '/api/auth/login', {
      ...blocked,
      headers: { ...blocked.headers, 'Retry-After': String(retryAfter) },
    });
    await page.goto('/login');

    await submitLogin(page);

    await expect(
      page.getByText(`Muitas tentativas. Tente novamente em ${minutes} minutos.`, { exact: true }),
      `Retry-After ${retryAfter}`,
    ).toBeVisible();
  }
});

test('empty_login_is_rejected_before_any_request', async ({ page, api }) => {
  await page.goto('/login');

  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByLabel('E-mail')).toHaveAccessibleDescription(/\S/);
  await expect(page.getByLabel('Senha')).toHaveAccessibleDescription(/\S/);
  expect(api.requests.filter((request) => request.path === '/api/auth/login')).toEqual([]);
  expect(api.writes()).toEqual([]);
});

test('login_links_first_access_and_forgot_password', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('link', { name: 'Primeiro acesso', exact: true })).toHaveAttribute('href', '/primeiro-acesso');
  await expect(page.getByRole('link', { name: 'Esqueci minha senha', exact: true })).toHaveAttribute('href', '/esqueci-senha');
});
