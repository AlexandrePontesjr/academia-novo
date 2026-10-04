import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { startApi } from './support/app.ts';
import { createClient } from './support/client.ts';
import { problem, type SeededUser, type Stack, startStack } from './support/stack.ts';
import { totpCode } from './support/totp.ts';

const MINUTE = 60_000;
const WRONG = 'senha-errada-000';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => stack?.close());

/** Congela o relógio do processo (o da API, que roda aqui dentro) e devolve como adiantá-lo. */
function freezeClock() {
  const start = Date.now();
  vi.useFakeTimers({ toFake: ['Date'], now: start });
  return (ms: number) => vi.setSystemTime(start + ms);
}

const login = (email: string, password: string) => stack.client().post('/api/auth/login', { email, password });

async function fail(email: string, times: number) {
  for (let attempt = 1; attempt <= times; attempt += 1) {
    const response = await login(email, WRONG);
    expect(response.status, `falha ${attempt}`).toBe(401);
    expect((await problem(response)).code, `falha ${attempt}`).toBe('invalid_credentials');
  }
}

async function expectBlocked(response: Response) {
  expect(response.status).toBe(429);
  const retryAfter = response.headers.get('retry-after') ?? '';
  expect(retryAfter).toMatch(/^\d+$/);
  expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
  expect(Number(retryAfter)).toBeLessThanOrEqual(900);
  const body = await problem(response);
  expect(body.code).toBe('too_many_attempts');
  return body;
}

/** Usuário com TOTP cadastrado de verdade, sem sessão aberta e com o contador zerado. */
async function userWithTwoFactor() {
  const user = await stack.seed();
  const { totpUri } = await stack.enrollTwoFactor(await stack.signIn(user));
  await stack.query('delete from sessions where user_id = $1', [user.id]);
  return { user, totpUri };
}

async function pendingLogin(user: SeededUser) {
  const client = stack.client();
  const response = await client.post('/api/auth/login', { email: user.email, password: user.password });
  expect(await response.json()).toStrictEqual({ status: 'two_factor_required' });
  return client;
}

function wrongCode(totpUri: string) {
  const valid = [-30_000, 0, 30_000].map((offset) => totpCode(totpUri, Date.now() + offset));
  return ['000000', '111111', '222222', '333333'].find((code) => !valid.includes(code))!;
}

test('fifth_failure_blocks_even_right_password', async () => {
  const user = await stack.seed({ email: 'alterna.caixa@exemplo.com' });
  const spellings = [user.email, user.email.toUpperCase(), 'Alterna.Caixa@Exemplo.com', user.email, 'ALTERNA.caixa@exemplo.COM'];

  for (const email of spellings) {
    expect((await login(email, WRONG)).status, email).toBe(401);
  }
  const sixth = await login(user.email, user.password);

  await expectBlocked(sixth);
  expect(sixth.headers.getSetCookie()).toEqual([]);
});

test('block_ends_15_min_after_fifth_failure', async () => {
  const advance = freezeClock();
  const user = await stack.seed();
  // quatro falhas, e a quinta 5 minutos depois: o bloqueio conta da quinta
  await fail(user.email, 4);
  advance(5 * MINUTE);
  await fail(user.email, 1);

  advance(5 * MINUTE + 15 * MINUTE - 1000);
  await expectBlocked(await login(user.email, user.password));

  advance(5 * MINUTE + 15 * MINUTE);
  expect((await login(user.email, user.password)).status).toBe(200);
});

test('failures_older_than_window_do_not_count', async () => {
  const advance = freezeClock();
  const user = await stack.seed();
  await fail(user.email, 4);

  advance(16 * MINUTE);
  const fifth = await login(user.email, WRONG);

  expect(fifth.status).toBe(401);
  expect((await problem(fifth)).code).toBe('invalid_credentials');
});

test('unknown_email_blocks_identically', async () => {
  const unknown = 'nao.cadastrado@exemplo.com';
  expect(await stack.query('select id from users where email = $1', [unknown])).toEqual([]);
  const existing = await stack.seed();

  await fail(unknown, 5);
  const blockedUnknown = await login(unknown, WRONG);
  const unknownBody = await expectBlocked(blockedUnknown);

  await fail(existing.email, 5);
  const existingBody = await expectBlocked(await login(existing.email, WRONG));
  expect({ ...unknownBody, requestId: '' }).toEqual({ ...existingBody, requestId: '' });
});

test('successful_login_resets_counter', async () => {
  const user = await stack.seed();

  await fail(user.email, 4);
  expect((await login(user.email, user.password)).status).toBe(200);
  await fail(user.email, 4);
});

test('invalid_codes_count_on_login_counter', async () => {
  const { user, totpUri } = await userWithTwoFactor();
  const pending = await pendingLogin(user);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await pending.post('/api/auth/two-factor/verify', { code: wrongCode(totpUri) });
    expect(response.status, `código inválido ${attempt}`).toBe(401);
    expect((await problem(response)).code, `código inválido ${attempt}`).toBe('invalid_code');
  }

  await expectBlocked(await login(user.email, user.password));
});

test('verify_429_when_blocked', async () => {
  const { user, totpUri } = await userWithTwoFactor();
  const pending = await pendingLogin(user);
  await fail(user.email, 5);

  const response = await pending.post('/api/auth/two-factor/verify', { code: totpCode(totpUri) });

  await expectBlocked(response);
  expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toEqual([]);
});

test('ten_concurrent_failures_yield_at_most_five_401', async () => {
  const user = await stack.seed();

  const responses = await Promise.all(Array.from({ length: 10 }, () => login(user.email, WRONG)));
  const statuses = responses.map((response) => response.status);

  const unauthorized = statuses.filter((status) => status === 401).length;
  const blocked = statuses.filter((status) => status === 429).length;
  expect(unauthorized).toBeLessThanOrEqual(5);
  expect(unauthorized + blocked).toBe(10);
  expect(blocked).toBeGreaterThanOrEqual(5);
});

test('block_survives_restart', async () => {
  const user = await stack.seed();
  await fail(user.email, 5);

  const second = await startApi(stack.postgres.url);
  try {
    const response = await createClient(second.url).post('/api/auth/login', {
      email: user.email,
      password: user.password,
    });

    await expectBlocked(response);
  } finally {
    await second.close();
  }
});
