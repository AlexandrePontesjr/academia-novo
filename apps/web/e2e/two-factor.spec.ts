import type { Page } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { expect, type FakeApi, problem, sessionOf, test } from './support/fake-api.ts';

const TOTP_URI =
  'otpauth://totp/Gest%C3%A3o%20de%20Academia:marina%40exemplo.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Gest%C3%A3o%20de%20Academia&digits=6&period=30';
const BACKUP_CODES = ['aaaaa-11111', 'bbbbb-22222', 'ccccc-33333', 'ddddd-44444'];

async function pendingLogin(page: Page, api: FakeApi) {
  api.on('POST', '/api/auth/login', { status: 200, body: { status: 'two_factor_required' } });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('marina@exemplo.com');
  await page.getByLabel('Senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/login/two-factor');
}

/** Abre o cadastro do 2FA e passa pelo passo da senha. */
async function startSetup(page: Page, api: FakeApi) {
  api.session = sessionOf('admin', { twoFactorEnabled: false });
  api.on('POST', '/api/auth/two-factor/enable', {
    status: 200,
    body: { totpUri: TOTP_URI, backupCodes: BACKUP_CODES },
  });
  await page.goto('/two-factor/setup');
  await page.getByLabel('Senha').fill('senha-de-teste-123');
  await page.getByRole('button', { name: 'Continuar' }).click();
}

test('two_factor_required_shows_code_page', async ({ page, api }) => {
  await pendingLogin(page, api);

  await expect(page.getByLabel('Código de 6 dígitos')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Usar código de recuperação' })).toBeVisible();
});

test('recovery_link_sends_backup_code', async ({ page, api }) => {
  api.on('POST', '/api/auth/two-factor/verify', problem(401, 'invalid_code'));
  await pendingLogin(page, api);

  await page.getByRole('link', { name: 'Usar código de recuperação' }).click();
  await page.getByLabel('Código de recuperação').fill('aaaaa-11111');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByText('Código inválido.')).toBeVisible();

  const sent = api.requests.filter((request) => request.path === '/api/auth/two-factor/verify');
  expect(sent).toHaveLength(1);
  expect(sent[0]!.method).toBe('POST');
  expect(sent[0]!.body).toEqual({ backupCode: 'aaaaa-11111' });
  expect(sent[0]!.body).not.toHaveProperty('code');
});

test('verify_401_shows_invalid_code', async ({ page, api }) => {
  api.on('POST', '/api/auth/two-factor/verify', problem(401, 'invalid_code'));
  await pendingLogin(page, api);

  await page.getByLabel('Código de 6 dígitos').fill('000000');
  await page.getByRole('button', { name: 'Verificar' }).click();

  await expect(page.getByText('Código inválido.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL('/login/two-factor');
});

test('enrollment_required_redirects_three_pages', async ({ page, api }) => {
  api.session = sessionOf('admin', { twoFactorEnabled: false });
  expect(api.session.twoFactorEnrollmentRequired).toBe(true);

  for (const path of ['/dashboard', '/users', '/account']) {
    await page.goto(path);

    await expect(page, path).toHaveURL('/two-factor/setup');
  }
});

test('setup_shows_qr_secret_and_code_field', async ({ page, api }) => {
  await startSetup(page, api);

  const image = page.getByRole('img', { name: 'QR code' });
  await expect(image).toBeVisible();
  const source = (await image.getAttribute('src')) ?? '';
  expect(source.startsWith('data:image/png;base64,')).toBe(true);
  const png = PNG.sync.read(Buffer.from(source.slice(source.indexOf(',') + 1), 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded?.data).toBe(TOTP_URI);

  await expect(page.getByText('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Código de 6 dígitos')).toBeVisible();
});

test('backup_codes_shown_exactly_once', async ({ page, api }) => {
  api.on('POST', '/api/auth/two-factor/confirm', () => {
    api.session = sessionOf('admin', { twoFactorEnabled: true });
    return { status: 204 };
  });
  await startSetup(page, api);
  for (const code of BACKUP_CODES) await expect(page.getByText(code, { exact: true })).toHaveCount(0);

  await page.getByLabel('Código de 6 dígitos').fill('123456');
  await page.getByRole('button', { name: 'Confirmar' }).click();

  await expect(
    page.getByText('Guarde estes códigos. Eles não serão exibidos novamente.', { exact: true }),
  ).toBeVisible();
  for (const code of BACKUP_CODES) await expect(page.getByText(code, { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading').first()).toBeVisible();
  for (const code of BACKUP_CODES) await expect(page.getByText(code, { exact: true })).toHaveCount(0);
});

test('verify_success_goes_to_dashboard', async ({ page, api }) => {
  await pendingLogin(page, api);
  api.on('POST', '/api/auth/two-factor/verify', () => {
    // a verificação aceita abre a sessão: o painel que vem depois já a encontra
    api.session = sessionOf('admin');
    return { status: 200, body: { status: 'authenticated' } };
  });

  await page.getByLabel('Código de 6 dígitos').fill('123456');
  await page.getByRole('button', { name: 'Verificar' }).click();

  await expect(page).toHaveURL('/dashboard');
});
