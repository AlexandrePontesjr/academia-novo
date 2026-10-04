import type { SessionResponse, TwoFactorEnableResponse } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Client } from './support/client.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { totpCode } from './support/totp.ts';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

async function twoFactorEnabled(client: Client) {
  const response = await client.get('/api/auth/session');
  expect(response.status).toBe(200);
  return ((await response.json()) as SessionResponse).user.twoFactorEnabled;
}

const sessionIds = async (userId: string) =>
  (await stack.query<{ id: string }>('select id from sessions where user_id = $1 order by id', [userId])).map(
    (row) => row.id,
  );

/** Um usuário com o TOTP cadastrado de verdade e sem nenhuma sessão aberta. */
async function userWithTwoFactor() {
  const user = await stack.seed();
  const enrolled = await stack.enrollTwoFactor(await stack.signIn(user));
  await stack.query('delete from sessions where user_id = $1', [user.id]);
  return { user, ...enrolled };
}

/** O primeiro passo do login de quem tem 2FA: devolve o navegador com o login pendente. */
async function pendingLogin(user: { email: string; password: string }) {
  const client = stack.client();
  const response = await client.post('/api/auth/login', { email: user.email, password: user.password });
  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ status: 'two_factor_required' });
  return client;
}

/** Um código de 6 dígitos que não vale agora nem nos passos vizinhos. */
function wrongCode(totpUri: string) {
  const valid = [-30_000, 0, 30_000].map((offset) => totpCode(totpUri, Date.now() + offset));
  return ['000000', '111111', '222222', '333333'].find((code) => !valid.includes(code))!;
}

test('enable_200_returns_uri_and_backup_codes', async () => {
  const { user, client } = await stack.session('reception');

  const response = await client.post('/api/auth/two-factor/enable', { password: user.password });
  const body = (await response.json()) as TwoFactorEnableResponse;

  expect(response.status).toBe(200);
  expect(body.totpUri.startsWith('otpauth://totp/')).toBe(true);
  expect(body.backupCodes.length).toBeGreaterThanOrEqual(1);
  expect(await twoFactorEnabled(client)).toBe(false);
});

test('confirm_204_turns_two_factor_on', async () => {
  const { user, client } = await stack.session('reception');
  const enabled = await client.post('/api/auth/two-factor/enable', { password: user.password });
  const { totpUri } = (await enabled.json()) as TwoFactorEnableResponse;
  expect(await twoFactorEnabled(client)).toBe(false);

  const response = await client.post('/api/auth/two-factor/confirm', { code: totpCode(totpUri) });

  expect(response.status).toBe(204);
  expect(await twoFactorEnabled(client)).toBe(true);
});

test('login_with_2fa_returns_two_factor_required', async () => {
  const { user } = await userWithTwoFactor();
  expect(await sessionIds(user.id)).toEqual([]);

  const response = await stack
    .client()
    .post('/api/auth/login', { email: user.email, password: user.password });

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ status: 'two_factor_required' });
  expect(await sessionIds(user.id)).toEqual([]);
});

test('verify_totp_200_authenticates', async () => {
  const { user, totpUri } = await userWithTwoFactor();
  const client = await pendingLogin(user);

  const response = await client.post('/api/auth/two-factor/verify', { code: totpCode(totpUri) });

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ status: 'authenticated' });
  expect(response.headers.getSetCookie().some((cookie) => /session_token=[^;]+/.test(cookie))).toBe(true);
  expect((await client.get('/api/auth/session')).status).toBe(200);
});

test('backup_code_authenticates_once', async () => {
  const { user, backupCodes } = await userWithTwoFactor();
  const backupCode = backupCodes[0]!;

  const first = await pendingLogin(user);
  const accepted = await first.post('/api/auth/two-factor/verify', { backupCode });
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toStrictEqual({ status: 'authenticated' });
  expect(accepted.headers.getSetCookie().some((cookie) => /session_token=[^;]+/.test(cookie))).toBe(true);
  expect((await first.get('/api/auth/session')).status).toBe(200);

  const second = await pendingLogin(user);
  const reused = await second.post('/api/auth/two-factor/verify', { backupCode });
  expect(reused.status).toBe(401);
  expect((await problem(reused)).code).toBe('invalid_code');
});

test('verify_401_invalid_code_in_three_cases', async () => {
  const { user, totpUri } = await userWithTwoFactor();
  const cases: Array<{ name: string; client: Client; body: unknown }> = [
    { name: 'código TOTP inválido', client: await pendingLogin(user), body: { code: wrongCode(totpUri) } },
    {
      name: 'código de recuperação inexistente',
      client: await pendingLogin(user),
      body: { backupCode: 'nao-existe-00000' },
    },
    { name: 'sem login pendente', client: stack.client(), body: { code: totpCode(totpUri) } },
  ];

  for (const { name, client, body } of cases) {
    const response = await client.post('/api/auth/two-factor/verify', body);

    expect(response.status, name).toBe(401);
    expect((await problem(response)).code, name).toBe('invalid_code');
    expect(await sessionIds(user.id), name).toEqual([]);
  }
});

test('disable_204_deletes_secret_and_backup_codes', async () => {
  const user = await stack.seed();
  const client = await stack.signIn(user);
  await stack.enrollTwoFactor(client);
  expect(await stack.query('select id from two_factors where user_id = $1', [user.id])).toHaveLength(1);
  expect(await twoFactorEnabled(client)).toBe(true);

  const response = await client.post('/api/auth/two-factor/disable', { password: user.password });

  expect(response.status).toBe(204);
  expect(await twoFactorEnabled(client)).toBe(false);
  expect(await stack.query('select id from two_factors where user_id = $1', [user.id])).toEqual([]);
});

test('wrong_password_or_code_422_on_field', async () => {
  const fresh = await stack.session('reception');
  const pending = await stack.session('reception');
  const enabled = await pending.client.post('/api/auth/two-factor/enable', { password: pending.user.password });
  const { totpUri } = (await enabled.json()) as TwoFactorEnableResponse;
  const enrolledUser = await stack.seed();
  const enrolled = await stack.signIn(enrolledUser);
  await stack.enrollTwoFactor(enrolled);

  const cases = [
    {
      route: '/api/auth/two-factor/enable',
      client: fresh.client,
      body: { password: 'senha-errada-000' },
      path: 'password',
      stays: false,
    },
    {
      route: '/api/auth/two-factor/disable',
      client: enrolled,
      body: { password: 'senha-errada-000' },
      path: 'password',
      stays: true,
    },
    {
      route: '/api/auth/two-factor/confirm',
      client: pending.client,
      body: { code: wrongCode(totpUri) },
      path: 'code',
      stays: false,
    },
  ];

  for (const { route, client, body, path, stays } of cases) {
    const response = await client.post(route, body);
    const parsed = await problem(response);

    expect(response.status, route).toBe(422);
    expect(parsed.code, route).toBe('validation_failed');
    expect(parsed.errors?.map((error) => error.path), route).toEqual([path]);
    expect(await twoFactorEnabled(client), route).toBe(stays);
  }
});

test('forged_two_factor_cookie_401_invalid_code', async () => {
  const { user } = await userWithTwoFactor();
  // o nome do cookie que o primeiro passo do login deixa
  const pending = await pendingLogin(user);
  const cookieName = [...pending.jar.keys()].find((name) => name.includes('two_factor'));
  expect(cookieName).toMatch(/\S/);

  const forged = ['%E0%A4%A.x', 'ab%00cd.assinatura', 'abc.def', 'semponto', '', "'; drop table users; --.x"];
  for (const value of forged) {
    const response = await stack.client().post(
      '/api/auth/two-factor/verify',
      { code: '123456' },
      { headers: { Cookie: `${cookieName}=${value}` } },
    );

    expect(response.status, value).toBe(401);
    expect((await problem(response)).code, value).toBe('invalid_code');
  }
  expect(await sessionIds(user.id)).toEqual([]);
});
