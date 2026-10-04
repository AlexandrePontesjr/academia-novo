import type { Role } from '@academia/contracts';
import { expect, sessionOf, test } from './support/fake-api.ts';

test('anonymous_is_redirected_to_login', async ({ page, api }) => {
  expect(api.session).toBeUndefined();

  for (const path of ['/', '/users', '/account', '/two-factor/setup']) {
    await page.goto(path);

    await expect(page, path).toHaveURL('/login');
  }
});

test('users_link_only_for_admin', async ({ page, api }) => {
  const visible: Record<Role, boolean> = {
    admin: true,
    reception: false,
    hr_finance: false,
    instructor: false,
  };

  for (const [role, expected] of Object.entries(visible) as Array<[Role, boolean]>) {
    api.session = sessionOf(role);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Gestão de Academia' }), role).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usuários', exact: true }), role).toHaveCount(expected ? 1 : 0);
  }
});

test('sign_out_calls_logout_and_goes_to_login', async ({ page, api }) => {
  api.session = sessionOf('reception');
  api.on('POST', '/api/auth/logout', () => {
    api.session = undefined;
    return { status: 204 };
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Sair' }).click();

  await expect(page).toHaveURL('/login');
  expect(api.writes().map((request) => `${request.method} ${request.path}`)).toEqual(['POST /api/auth/logout']);
});

test('signed_in_user_leaves_login', async ({ page, api }) => {
  api.session = sessionOf('reception');

  await page.goto('/login');

  await expect(page).toHaveURL('/');
});
