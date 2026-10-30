import { expect, problem, sessionOf, test, userOf } from './support/fake-api.ts';
import { ROLE_LABELS } from '../src/lib/roles.ts';

const USERS = [
  userOf(1, { name: 'Zuleica Prado', email: 'zuleica@exemplo.com', role: 'instructor' }),
  userOf(2, { name: 'Álvaro Dias', email: 'alvaro@exemplo.com', role: 'admin', twoFactorEnabled: true }),
  userOf(3, { name: 'Carla Nunes', email: 'carla@exemplo.com', role: 'hr_finance', active: false }),
  userOf(4, { name: 'bruno costa', email: 'bruno@exemplo.com', twoFactorEnabled: true }),
];

test('users_table_columns_order_and_button', async ({ page, api }) => {
  api.session = sessionOf('admin');
  // a API falsa entrega fora de ordem: quem ordena o que aparece é a tela
  api.on('GET', '/api/users', { status: 200, body: { users: USERS } });

  await page.goto('/users');

  const headers = await page.getByRole('columnheader').allTextContents();
  expect(headers.slice(0, 5)).toEqual(['Nome', 'E-mail', 'Perfil', 'Situação', '2FA']);
  expect(headers.slice(5)).toEqual(['Ações']);

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(4);
  const names = await rows.locator('td:nth-child(1)').allTextContents();
  expect(names).toEqual(['Álvaro Dias', 'bruno costa', 'Carla Nunes', 'Zuleica Prado']);
  const status = await rows.locator('td:nth-child(4)').allTextContents();
  expect(status).toEqual(['Ativo', 'Ativo', 'Inativo', 'Ativo']);
  await expect(page.getByRole('button', { name: 'Novo usuário' })).toBeVisible();
});

test('non_admin_sees_no_permission_and_no_data', async ({ page, api }) => {
  api.session = sessionOf('reception');
  // mesmo que a API entregasse a lista, a tela não a mostra
  api.on('GET', '/api/users', { status: 200, body: { users: USERS } });

  await page.goto('/users');

  await expect(page.getByText('Você não tem permissão para acessar esta página.', { exact: true })).toBeVisible();
  const content = await page.content();
  for (const user of USERS) {
    expect(content).not.toContain(user.name);
    expect(content).not.toContain(user.email);
  }
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('role_select_lists_only_staff_roles', async ({ page, api }) => {
  api.session = sessionOf('admin');
  api.on('GET', '/api/users', { status: 200, body: { users: USERS } });

  await page.goto('/users');
  await page.getByRole('button', { name: 'Novo usuário' }).click();

  const options = await page.getByRole('dialog').getByLabel('Perfil', { exact: true }).locator('option').allTextContents();
  expect(options).toHaveLength(4);
  expect(options.sort()).toEqual([ROLE_LABELS.admin, ROLE_LABELS.reception, ROLE_LABELS.hr_finance, ROLE_LABELS.instructor].sort());
  expect(options).not.toContain('Aluno');
  expect(ROLE_LABELS.student).toBe('Aluno');
});

test('three_actions_confirm_naming_the_user', async ({ page, api }) => {
  const target = USERS[3]!;
  const actions = [
    { button: 'Desativar', confirm: 'Desativar', write: `PATCH /api/users/${target.id}`, fill: false },
    { button: 'Redefinir senha', confirm: 'Redefinir senha', write: `PUT /api/users/${target.id}/password`, fill: true },
    { button: 'Zerar 2FA', confirm: 'Zerar 2FA', write: `DELETE /api/users/${target.id}/two-factor`, fill: false },
  ];
  api.session = sessionOf('admin');
  api.on('GET', '/api/users', { status: 200, body: { users: USERS } });
  api.on('PATCH', `/api/users/${target.id}`, { status: 200, body: target });
  api.on('PUT', `/api/users/${target.id}/password`, { status: 204 });
  api.on('DELETE', `/api/users/${target.id}/two-factor`, { status: 204 });

  for (const { button, confirm, write, fill } of actions) {
    await page.goto('/users');
    api.requests = [];
    const row = page.locator('tbody tr', { hasText: target.email });

    await row.getByRole('button', { name: button, exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog, button).toBeVisible();
    await expect(dialog, button).toContainText(target.name);
    if (fill) await dialog.getByLabel('Nova senha').fill('senha-redefinida-123');
    expect(api.writes(), `${button}: antes de confirmar`).toEqual([]);

    await dialog.getByRole('button', { name: confirm, exact: true }).click();

    await expect(dialog, button).toHaveCount(0);
    expect(api.writes().map((request) => `${request.method} ${request.path}`), button).toEqual([write]);
  }
});

test('list_failure_shows_retry', async ({ page, api }) => {
  api.session = sessionOf('admin');
  api.on('GET', '/api/users', problem(500, 'internal_error'));

  await page.goto('/users');

  await expect(page.getByText('Não foi possível carregar os usuários.', { exact: true })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Tentar novamente' });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  api.on('GET', '/api/users', { status: 200, body: { users: USERS } });
  await retry.click();

  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.getByText('Não foi possível carregar os usuários.')).toHaveCount(0);
});
