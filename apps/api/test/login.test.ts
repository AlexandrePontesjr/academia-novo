import { afterAll, beforeAll, expect, test } from 'vitest';
import { type Stack, startStack } from './support/stack.ts';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

test('login_200_authenticated_with_session_cookie', async () => {
  const user = await stack.seed();

  const response = await stack
    .client()
    .post('/api/auth/login', { email: user.email, password: user.password });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'authenticated' });
  expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toHaveLength(1);

  const sessionCookies = response.headers.getSetCookie().filter((cookie) => /session_token=/.test(cookie));
  expect(sessionCookies).toHaveLength(1);
  const attributes = sessionCookies[0]!
    .split(';')
    .slice(1)
    .map((attribute) => attribute.trim().toLowerCase());
  expect(attributes).toContain('httponly');
  expect(attributes).toContain('secure');
  expect(attributes).toContain('samesite=lax');
  expect(attributes).toContain('path=/');
  expect(attributes.filter((attribute) => attribute.startsWith('domain'))).toEqual([]);
});

test('login_401_identical_for_three_causes', async () => {
  const active = await stack.seed();
  const inactive = await stack.seed({ active: false });
  const causes = [
    { email: 'ninguem@exemplo.com', password: active.password },
    { email: active.email, password: 'senha-errada-000' },
    { email: inactive.email, password: inactive.password },
  ];

  const bodies: unknown[] = [];
  for (const credentials of causes) {
    const response = await stack.client().post('/api/auth/login', credentials);
    const { requestId, ...body } = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.code).toBe('invalid_credentials');
    expect(requestId).toMatch(/\S/);
    expect(response.headers.getSetCookie()).toEqual([]);
    bodies.push(body);
  }

  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]).toEqual(bodies[0]);
  expect(await stack.query('select id from sessions where user_id = any($1)', [[active.id, inactive.id]])).toEqual([]);
});

test('better_auth_handler_is_not_mounted', async () => {
  const usersBefore = await stack.query('select id from users');

  const signUp = await stack.client().post('/api/auth/sign-up/email', {
    name: 'Intruso',
    email: 'intruso@exemplo.com',
    password: 'senha-de-intruso-123',
  });
  const signIn = await stack.client().post('/api/auth/sign-in/email', {
    email: 'intruso@exemplo.com',
    password: 'senha-de-intruso-123',
  });

  for (const response of [signUp, signIn]) {
    expect(response.status).toBe(404);
    expect(((await response.json()) as { code: string }).code).toBe('not_found');
  }
  expect(await stack.query('select id from users')).toEqual(usersBefore);
});
