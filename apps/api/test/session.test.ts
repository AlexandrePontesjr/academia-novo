import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { type Stack, startStack } from './support/stack.ts';

const MINUTE = 60_000;

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
  return (minutes: number) => vi.setSystemTime(start + minutes * MINUTE);
}

async function code(response: Response) {
  return ((await response.json()) as { code: string }).code;
}

test('session_200_returns_user_fields', async () => {
  const { user, client } = await stack.session('reception');

  const response = await client.get('/api/auth/session');

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'reception',
      twoFactorEnabled: false,
    },
    twoFactorEnrollmentRequired: false,
  });
});

test('session_401_without_valid_session', async () => {
  const anonymous = await stack.client().get('/api/auth/session');
  expect(anonymous.status).toBe(401);
  expect(await code(anonymous)).toBe('unauthorized');

  const tampered = (await stack.session('reception')).client;
  for (const [name, value] of tampered.jar) {
    tampered.jar.set(name, `${value.slice(0, -6)}AAAAAA`);
  }
  const forged = await tampered.get('/api/auth/session');
  expect(forged.status).toBe(401);
  expect(await code(forged)).toBe('unauthorized');

  const advance = freezeClock();
  const expiring = (await stack.session('reception')).client;
  advance(31);
  const expired = await expiring.get('/api/auth/session');
  expect(expired.status).toBe(401);
  expect(await code(expired)).toBe('unauthorized');
});

test('logout_204_deletes_session_row', async () => {
  const { user, client } = await stack.session('reception');
  const cookie = client.cookie();
  expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toHaveLength(1);

  const response = await client.post('/api/auth/logout');

  expect(response.status).toBe(204);
  expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toEqual([]);
  const reused = await stack.client().get('/api/auth/session', { headers: { Cookie: cookie } });
  expect(reused.status).toBe(401);
});

test('session_expires_after_30_min_idle', async () => {
  const advance = freezeClock();
  const { client } = await stack.session('reception');
  expect((await client.get('/api/auth/session')).status).toBe(200);

  advance(30);
  const response = await client.get('/api/auth/session');

  expect(response.status).toBe(401);
  expect(await code(response)).toBe('unauthorized');
});

test('session_slides_on_use', async () => {
  const advance = freezeClock();
  const { client } = await stack.session('reception');

  advance(29);
  expect((await client.get('/api/auth/session')).status).toBe(200);

  advance(58);
  expect((await client.get('/api/auth/session')).status).toBe(200);
});
