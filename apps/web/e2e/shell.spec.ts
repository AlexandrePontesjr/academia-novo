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

test('students_link_for_all_four_roles', async ({ page, api }) => {
  const roles = ['admin', 'reception', 'hr_finance', 'instructor'] satisfies Role[];

  for (const role of roles) {
    api.session = sessionOf(role);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Gestão de Academia' }), role).toBeVisible();
    await expect(page.getByRole('link', { name: 'Alunos', exact: true }), role).toHaveCount(1);
  }
  expect(roles).toHaveLength(4);
});

test('audit_link_only_for_admin', async ({ page, api }) => {
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
    await expect(page.getByRole('link', { name: 'Auditoria', exact: true }), role).toHaveCount(expected ? 1 : 0);
  }
});

test('staff_link_only_for_admin_and_hr_finance', async ({ page, api }) => {
  const visible: Record<Role, boolean> = {
    admin: true,
    reception: false,
    hr_finance: true,
    instructor: false,
  };

  for (const [role, expected] of Object.entries(visible) as Array<[Role, boolean]>) {
    api.session = sessionOf(role);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Gestão de Academia' }), role).toBeVisible();
    await expect(page.getByRole('link', { name: 'Funcionários', exact: true }), role).toHaveCount(expected ? 1 : 0);
    if (expected) {
      await expect(page.getByRole('link', { name: 'Funcionários', exact: true }), role).toHaveAttribute('href', '/staff');
    }
  }
});

test('plans_link_for_admin_hr_finance_and_reception', async ({ page, api }) => {
  const visible: Record<Role, boolean> = {
    admin: true,
    reception: true,
    hr_finance: true,
    instructor: false,
  };

  for (const [role, expected] of Object.entries(visible) as Array<[Role, boolean]>) {
    api.session = sessionOf(role);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Gestão de Academia' }), role).toBeVisible();
    await expect(page.getByRole('link', { name: 'Planos', exact: true }), role).toHaveCount(expected ? 1 : 0);
    if (expected) {
      await expect(page.getByRole('link', { name: 'Planos', exact: true }), role).toHaveAttribute('href', '/plans');
    }
  }
});

test('payments_link_only_for_admin_and_hr_finance', async ({ page, api }) => {
  const visible: Record<Role, boolean> = {
    admin: true,
    reception: false,
    hr_finance: true,
    instructor: false,
  };

  for (const [role, expected] of Object.entries(visible) as Array<[Role, boolean]>) {
    api.session = sessionOf(role);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Gestão de Academia' }), role).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pagamentos', exact: true }), role).toHaveCount(expected ? 1 : 0);
    if (expected) {
      await expect(page.getByRole('link', { name: 'Pagamentos', exact: true }), role).toHaveAttribute('href', '/payments');
    }
  }
});

test('check_in_link_only_for_admin_and_reception', async ({ page, api }) => {
  const visible: Record<Role, boolean> = {
    admin: true,
    reception: true,
    hr_finance: false,
    instructor: false,
  };

  for (const [role, expected] of Object.entries(visible) as Array<[Role, boolean]>) {
    api.session = sessionOf(role);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Gestão de Academia' }), role).toBeVisible();
    const link = page.getByRole('navigation').getByRole('link', { name: 'Check-in', exact: true });
    await expect(link, role).toHaveCount(expected ? 1 : 0);
    if (expected) await expect(link, role).toHaveAttribute('href', '/check-in');
  }
});

test('check_ins_link_only_for_admin_and_reception', async ({ page, api }) => {
  const visible: Record<Role, boolean> = {
    admin: true,
    reception: true,
    hr_finance: false,
    instructor: false,
  };

  for (const [role, expected] of Object.entries(visible) as Array<[Role, boolean]>) {
    api.session = sessionOf(role);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Gestão de Academia' }), role).toBeVisible();
    const link = page.getByRole('navigation').getByRole('link', { name: 'Presenças', exact: true });
    await expect(link, role).toHaveCount(expected ? 1 : 0);
    if (expected) await expect(link, role).toHaveAttribute('href', '/check-ins');
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

test('privacy_link_only_for_admin', async ({ page, api }) => {
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
    const link = page.getByRole('link', { name: 'Privacidade', exact: true });
    await expect(link, role).toHaveCount(expected ? 1 : 0);
    if (expected) await expect(link, role).toHaveAttribute('href', '/privacy');
  }
});
