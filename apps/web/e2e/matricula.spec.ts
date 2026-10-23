import { createLeadRequestSchema, INVALID_LINK_MESSAGE, MINOR_MESSAGE } from '@academia/contracts';
import type { Page } from '@playwright/test';
import { expect, type FakeApi, problem, test } from './support/fake-api.ts';
import { serveOptions, TERM_TEXT } from './support/leads.ts';
import { formHydrated } from './support/motion.ts';

/**
 * A prova das páginas públicas do pré-cadastro (`.specs/features/pre-cadastro`, S7): o formulário, a
 * validação, o envio, o Google e a confirmação do e-mail, contra a API falsa e sem sessão.
 */

const PENDING = 'Enviamos um link para o seu e-mail. Abra-o em até 24 horas para confirmar.';
const CONFIRMED = 'E-mail confirmado. A recepção vai entrar em contato para concluir sua matrícula.';

const leadPosts = (api: FakeApi) => api.requests.filter((request) => request.method === 'POST' && request.path === '/api/leads');

/** A mensagem que o schema do contrato dá ao valor de um campo. */
const schemaMessage = (field: 'email' | 'phone', value: string) =>
  createLeadRequestSchema.shape[field].safeParse(value).error!.issues[0]!.message;

async function open(page: Page, path = '/matricula') {
  await page.goto(path);
  if (path.startsWith('/matricula/confirmar')) {
    // a página de confirmação não tem formulário: espera o botão ganhar o `onClick` do React
    await page.waitForFunction(() => {
      const button = document.querySelector('main button');
      return button !== null && Object.keys(button).some((key) => key.startsWith('__reactProps'));
    });
  } else await formHydrated(page);
}

async function fillValid(page: Page) {
  await page.getByLabel('Nome', { exact: true }).fill('Ana Souza');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
  await page.getByLabel('Telefone', { exact: true }).fill('(11) 98765-4321');
  await page.getByLabel('Tenho 18 anos ou mais', { exact: true }).check();
  await page.getByLabel('Li e aceito o termo de tratamento de dados', { exact: true }).check();
}

test('form_fields_checkboxes_and_expandable_term', async ({ page, api }) => {
  serveOptions(api);
  await open(page);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pré-cadastro');
  for (const label of ['Nome', 'E-mail', 'Telefone']) await expect(page.getByRole('textbox', { name: label, exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Tenho 18 anos ou mais', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Li e aceito o termo de tratamento de dados', exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeVisible();

  await expect(page.getByText(TERM_TEXT)).toBeHidden();
  await page.getByText('Ler o termo', { exact: true }).click();
  await expect(page.getByText(TERM_TEXT)).toBeVisible();
});

test('client_and_server_validation_messages', async ({ page, api }) => {
  serveOptions(api);
  await open(page);

  await page.getByLabel('Nome', { exact: true }).fill('Ana Souza');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@');
  await page.getByLabel('Telefone', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  await expect(page.getByLabel('E-mail', { exact: true })).toHaveAccessibleDescription(schemaMessage('email', 'ana@'));
  await expect(page.getByLabel('Telefone', { exact: true })).toHaveAccessibleDescription(schemaMessage('phone', '123'));
  await expect(page.getByLabel('Tenho 18 anos ou mais', { exact: true })).toHaveAccessibleDescription(MINOR_MESSAGE);
  await expect(page.getByLabel('Li e aceito o termo de tratamento de dados', { exact: true })).toHaveAccessibleDescription(
    'Aceite o termo de tratamento de dados para continuar.',
  );
  expect(leadPosts(api)).toEqual([]);

  api.on('POST', '/api/leads', problem(422, 'validation_failed', [{ path: 'phone', message: 'Telefone recusado pela API.' }]));
  await fillValid(page);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  await expect(page.getByLabel('Telefone', { exact: true })).toHaveAccessibleDescription('Telefone recusado pela API.');
  expect(leadPosts(api)).toHaveLength(1);
});

test('submit_sends_body_and_shows_pending_or_confirmed', async ({ page, api }) => {
  serveOptions(api, false, 2);
  api.on('POST', '/api/leads', { status: 202, body: { status: 'pending' } });
  await open(page);
  await fillValid(page);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  await expect(page).toHaveURL('/matricula/enviado');
  await expect(page.getByText(PENDING, { exact: true })).toBeVisible();
  expect(leadPosts(api).map((request) => request.body)).toEqual([
    { name: 'Ana Souza', email: 'ana@example.com', phone: '(11) 98765-4321', adult: true, termVersion: 2, website: '' },
  ]);

  api.on('POST', '/api/leads', { status: 202, body: { status: 'confirmed' } });
  await open(page);
  await fillValid(page);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  await expect(page.getByText(CONFIRMED, { exact: true })).toBeVisible();
  await expect(page.getByText(PENDING, { exact: true })).toHaveCount(0);
});

test('too_many_attempts_message_keeps_fields', async ({ page, api }) => {
  serveOptions(api);
  const tooMany = problem(429, 'too_many_attempts') as { status: number; body: unknown };
  api.on('POST', '/api/leads', { ...tooMany, headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '120' } });
  await open(page);
  await fillValid(page);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  await expect(page.getByText('Muitas tentativas. Tente de novo em alguns minutos.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Ana Souza');
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('ana@example.com');
  await expect(page.getByLabel('Telefone', { exact: true })).toHaveValue('(11) 98765-4321');
  await expect(page.getByLabel('Tenho 18 anos ou mais', { exact: true })).toBeChecked();
  await expect(page).toHaveURL('/matricula');
});

test('google_link_follows_options_flag', async ({ page, api }) => {
  serveOptions(api, true);
  await open(page);
  await expect(page.getByRole('link', { name: 'Continuar com Google', exact: true })).toHaveAttribute('href', '/api/leads/google/start');

  serveOptions(api, false);
  await open(page);
  await expect(page.getByRole('heading', { name: 'Pré-cadastro', exact: true })).toBeVisible();
  await expect(page.getByText('Continuar com Google')).toHaveCount(0);
});

test('google_ok_prefill_and_google_erro_message', async ({ page, api }) => {
  serveOptions(api, true, 2);
  api.on('GET', '/api/leads/google/profile', { status: 200, body: { name: 'Bia Lima', email: 'bia@gmail.com' } });
  api.on('POST', '/api/leads', { status: 202, body: { status: 'confirmed' } });
  await open(page, '/matricula?google=ok');

  await expect(page.getByText('Bia Lima', { exact: true })).toBeVisible();
  await expect(page.getByText('bia@gmail.com', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Nome', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'E-mail', exact: true })).toHaveCount(0);
  await page.getByLabel('Telefone', { exact: true }).fill('11987654321');
  await page.getByLabel('Tenho 18 anos ou mais', { exact: true }).check();
  await page.getByLabel('Li e aceito o termo de tratamento de dados', { exact: true }).check();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText(CONFIRMED, { exact: true })).toBeVisible();
  expect(leadPosts(api).map((request) => request.body)).toEqual([
    { name: 'Bia Lima', email: 'bia@gmail.com', phone: '11987654321', adult: true, termVersion: 2, website: '' },
  ]);

  // sem perfil válido, o formulário completo
  api.on('GET', '/api/leads/google/profile', problem(404, 'not_found'));
  await open(page, '/matricula?google=ok');
  for (const label of ['Nome', 'E-mail', 'Telefone']) await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveValue('');

  await open(page, '/matricula?google=erro');
  await expect(page.getByText('Não foi possível entrar com o Google. Preencha o formulário.', { exact: true })).toBeVisible();
  for (const label of ['Nome', 'E-mail', 'Telefone']) await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveValue('');
});

test('confirm_page_posts_only_on_click', async ({ page, api }) => {
  const confirms = () => api.requests.filter((request) => request.path === '/api/leads/confirm');
  api.on('POST', '/api/leads/confirm', { status: 200, body: { status: 'confirmed' } });
  await open(page, '/matricula/confirmar?token=t1');
  await page.waitForTimeout(1000);
  expect(confirms()).toEqual([]);

  await page.getByRole('button', { name: 'Confirmar e-mail', exact: true }).click();
  await expect(page.getByText(CONFIRMED, { exact: true })).toBeVisible();
  expect(confirms().map((request) => ({ method: request.method, body: request.body }))).toEqual([{ method: 'POST', body: { token: 't1' } }]);

  api.on('POST', '/api/leads/confirm', problem(422, 'validation_failed', [{ path: 'token', message: INVALID_LINK_MESSAGE }]));
  await open(page, '/matricula/confirmar?token=t1');
  await page.getByRole('button', { name: 'Confirmar e-mail', exact: true }).click();
  await expect(page.getByText('Link inválido ou expirado. Envie o pré-cadastro de novo.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar ao pré-cadastro', exact: true })).toHaveAttribute('href', '/matricula');
});

test('mobile_width_no_horizontal_scroll', async ({ page, api }) => {
  serveOptions(api, true);
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);

  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBe(widths.client);
  const submit = page.getByRole('button', { name: 'Enviar', exact: true });
  await submit.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(submit).toBeInViewport();
});
