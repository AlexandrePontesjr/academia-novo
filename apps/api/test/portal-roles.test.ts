import { randomUUID } from 'node:crypto';
import type { SessionResponse } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { insertStudentUser } from './support/portal.ts';
import { problem, type Stack, startStack } from './support/stack.ts';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

/** As dez rotas da `Surface` da `portal-aluno`: fora da tabela das que existiam antes. */
const PORTAL_ROUTES = [
  'POST /api/portal/first-access',
  'POST /api/password-tokens/consume',
  'POST /api/password-reset',
  'GET /api/me/profile',
  'PATCH /api/me/profile',
  'GET /api/me/payments',
  'POST /api/me/photo',
  'GET /api/me/photo',
  'POST /api/students/:id/photo/pending/approve',
  'POST /api/students/:id/photo/pending/reject',
];

/** As quatro exceções da AC 2: a sessão, a saída, a troca da própria senha e o 2FA. */
const reachable = (method: string, path: string) =>
  (method === 'GET' && path === '/api/auth/session') ||
  (method === 'POST' && path === '/api/auth/logout') ||
  (method === 'PUT' && path === '/api/auth/password') ||
  path.startsWith('/api/auth/two-factor/');

test('student_403_on_every_pre_existing_route_but_four_groups', async () => {
  const user = await insertStudentUser(stack);
  const student = await stack.signIn(user);
  const routes = stack.api.routes().filter(({ method, path }) => !PORTAL_ROUTES.includes(`${method} ${path}`));
  expect(routes.length).toBeGreaterThanOrEqual(60);

  const forbidden: string[] = [];
  const skipped: string[] = [];
  for (const { method, path } of routes) {
    const concrete = path.replace(/:\w+/g, randomUUID());
    // as rotas abertas respondem sem sessão: não têm lista de perfis a manter
    const anonymous = await stack.client().request(method, concrete);
    await anonymous.body?.cancel();
    if (anonymous.status !== 401) continue;
    if (reachable(method, path)) {
      skipped.push(`${method} ${path}`);
      continue;
    }

    const response = await student.request(method, concrete);

    expect(response.status, `${method} ${path}`).toBe(403);
    expect((await problem(response)).code, `${method} ${path}`).toBe('forbidden');
    forbidden.push(`${method} ${path}`);
  }

  // as exceções são exatamente as quatro da AC 2, e o resto da equipe passou pelo `403`
  expect(skipped.sort()).toEqual([
    'GET /api/auth/session',
    'POST /api/auth/logout',
    'POST /api/auth/two-factor/confirm',
    'POST /api/auth/two-factor/disable',
    'POST /api/auth/two-factor/enable',
    'PUT /api/auth/password',
  ]);
  expect(forbidden.length).toBeGreaterThanOrEqual(50);
  expect(forbidden).toContain('GET /api/students');
  expect(forbidden).toContain('GET /api/users');
  expect(forbidden).toContain('GET /api/openapi.json');
  // a sessão segue viva: nenhuma das recusas a derrubou
  expect((await student.get('/api/auth/session')).status).toBe(200);
});

test('student_reaches_session_password_two_factor_and_logout', async () => {
  const user = await insertStudentUser(stack);
  const student = await stack.signIn(user);

  const session = await student.get('/api/auth/session');
  expect(session.status).toBe(200);
  const body = (await session.json()) as SessionResponse;
  expect(body.user.role).toBe('student');
  expect(body.twoFactorEnrollmentRequired).toBe(false);

  const changed = await student.put('/api/auth/password', { currentPassword: user.password, newPassword: 'senha-nova-12' });
  expect(changed.status).toBe(204);

  const enable = await student.post('/api/auth/two-factor/enable', { password: 'senha-nova-12' });
  expect(enable.status).toBe(200);

  const logout = await student.post('/api/auth/logout');
  expect(logout.status).toBe(204);
  expect((await student.get('/api/auth/session')).status).toBe(401);
});
