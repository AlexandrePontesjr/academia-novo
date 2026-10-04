import type { TwoFactorEnableResponse, User } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditRows, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { type Stack, startStack } from './support/stack.ts';
import { totpCode } from './support/totp.ts';

let stack: Stack;
let admin: Client;

beforeAll(async () => {
  stack = await startStack();
  admin = (await stack.session('admin')).client;
}, 180_000);

afterAll(() => stack?.close());

test('diff_names_every_field_and_values_only_role', async () => {
  const target = await stack.seed({ name: 'Nome antigo', role: 'reception' });

  const { result: response, rows } = await written(stack, () =>
    admin.patch(`/api/users/${target.id}`, { name: 'Nome novo', role: 'admin' }),
  );

  expect(response.status).toBe(200);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.diff).toStrictEqual({
    fields: ['name', 'role'],
    values: { role: { from: 'reception', to: 'admin' } },
  });
});

test('diff_of_deactivation', async () => {
  const target = await stack.seed();

  const { result: response, rows } = await written(stack, () =>
    admin.patch(`/api/users/${target.id}`, { active: false }),
  );

  expect(response.status).toBe(200);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.diff).toStrictEqual({
    fields: ['active'],
    values: { active: { from: true, to: false } },
  });
});

test('diff_of_creation_has_null_from', async () => {
  const { result: response, rows } = await written(stack, () =>
    admin.post('/api/users', {
      name: 'Recém-chegada',
      email: 'recem.chegada@exemplo.com',
      role: 'reception',
      password: 'senha-valida-123',
    }),
  );

  expect(response.status).toBe(201);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.diff).toStrictEqual({
    fields: ['name', 'email', 'role'],
    values: { role: { from: null, to: 'reception' } },
  });
});

test('nine_values_never_reach_audit_logs', async () => {
  const before = new Set((await auditRows(stack)).map((row) => row.id));
  const oldName = 'Zeferino Antigo Quaresma';
  const newName = 'Quitéria Nova Valadares';
  const email = 'pessoa.auditada@exemplo.com';
  const password = 'senha-secreta-do-teste-1';
  const newPassword = 'outra-senha-secreta-2';
  const resetPassword = 'terceira-senha-secreta-3';
  const typedEmail = 'Digitado.No.Login@Exemplo.com';
  const unknownEmail = 'ninguem.com.este.email@exemplo.com';

  // as dez ações, na ordem em que acontecem com uma pessoa
  const created = await admin.post('/api/users', { name: oldName, email, role: 'reception', password });
  const user = (await created.json()) as User;
  expect((await admin.patch(`/api/users/${user.id}`, { name: newName })).status).toBe(200); // user.updated
  const client = stack.client();
  expect((await client.post('/api/auth/login', { email, password: 'senha-errada-000' })).status).toBe(401); // auth.login_failed
  expect((await client.post('/api/auth/login', { email: unknownEmail, password })).status).toBe(401);
  expect((await client.post('/api/auth/login', { email, password })).status).toBe(200); // auth.login_succeeded
  const sessionCookie = client.cookie();
  expect(
    (await client.put('/api/auth/password', { currentPassword: password, newPassword })).status, // auth.password_changed
  ).toBe(204);
  const enabled = await client.post('/api/auth/two-factor/enable', { password: newPassword });
  const { totpUri, backupCodes } = (await enabled.json()) as TwoFactorEnableResponse;
  const confirmCode = totpCode(totpUri);
  expect((await client.post('/api/auth/two-factor/confirm', { code: confirmCode })).status).toBe(204); // auth.two_factor_enabled
  const [stored] = await stack.query<{ secret: string; backup_codes: string }>(
    'select secret, backup_codes from two_factors where user_id = $1',
    [user.id],
  );
  expect((await client.post('/api/auth/logout')).status).toBe(204); // auth.logout
  const second = stack.client();
  expect((await second.post('/api/auth/login', { email: typedEmail.replace('Digitado.No.Login', 'pessoa.auditada'), password: newPassword })).status).toBe(200);
  expect((await second.post('/api/auth/two-factor/verify', { backupCode: backupCodes[0] })).status).toBe(200);
  expect((await stack.client().post('/api/auth/login', { email: typedEmail, password })).status).toBe(401);
  const secondCookie = second.cookie();
  expect((await second.post('/api/auth/two-factor/disable', { password: newPassword })).status).toBe(204); // auth.two_factor_disabled
  await stack.enrollTwoFactor(second, newPassword);
  expect((await admin.delete(`/api/users/${user.id}/two-factor`)).status).toBe(204); // user.two_factor_reset
  expect((await admin.put(`/api/users/${user.id}/password`, { password: resetPassword })).status).toBe(204); // user.password_reset
  const hashes = await stack.query<{ password: string }>('select password from accounts where user_id = $1', [user.id]);

  const rows = (await auditRows(stack)).filter((row) => !before.has(row.id));
  expect(new Set(rows.map((row) => row.action)).size).toBe(10);
  const text = (
    await stack.query<{ row: string }>('select to_jsonb(a)::text as row from audit_logs a')
  )
    .map(({ row }) => row)
    .join('\n');
  const cookieValues = [sessionCookie, secondCookie]
    .flatMap((cookie) => cookie.split('; '))
    .map((pair) => pair.slice(pair.indexOf('=') + 1))
    .flatMap((value) => [value, decodeURIComponent(value), decodeURIComponent(value).split('.')[0]!]);
  const forbidden: Record<string, string[]> = {
    'a senha': [password, newPassword, resetPassword, 'senha-errada-000'],
    'o hash da senha': hashes.map((account) => account.password),
    'o segredo TOTP': [new URL(totpUri).searchParams.get('secret')!, stored!.secret],
    'o código TOTP': [confirmCode],
    'o código de recuperação': [...backupCodes, stored!.backup_codes],
    'o valor do cookie de sessão': cookieValues,
    'o nome de usuário': [oldName, newName, 'Zeferino', 'Quitéria'],
    'o e-mail de usuário': [email],
    'o e-mail digitado no login': [typedEmail, typedEmail.toLowerCase(), unknownEmail],
  };
  expect(Object.keys(forbidden)).toHaveLength(9);

  for (const [name, values] of Object.entries(forbidden)) {
    expect(values.length, name).toBeGreaterThan(0);
    for (const value of values) {
      expect(value, name).toMatch(/\S{4,}/);
      expect(text.includes(value), `${name}: ${value.slice(0, 6)}...`).toBe(false);
      expect(text.toLowerCase().includes(value.toLowerCase()), `${name}: ${value.slice(0, 6)}...`).toBe(false);
    }
  }
});
