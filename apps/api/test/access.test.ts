import { randomUUID } from 'node:crypto';
import type { Role } from '@academia/contracts';
import { Controller, Get } from '@nestjs/common';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { Authenticated, Public, Roles } from '../src/access.ts';
import type { Client } from './support/client.ts';
import { problem, type Stack, startStack } from './support/stack.ts';

const executions: string[] = [];

@Controller('api/test')
class AccessProbeController {
  @Get('public')
  @Public()
  open() {
    executions.push('public');
    return { ok: true };
  }

  @Get('authenticated')
  @Authenticated()
  authenticated() {
    executions.push('authenticated');
    return { ok: true };
  }

  @Get('roles')
  @Roles('admin', 'reception')
  roles() {
    executions.push('roles');
    return { ok: true };
  }
}

/** Só as rotas reais, para a enumeração lida do roteador. */
let stack: Stack;
/** As rotas reais mais as três de teste da matriz. */
let probed: Stack;

beforeAll(async () => {
  [stack, probed] = await Promise.all([startStack(), startStack([AccessProbeController])]);
}, 180_000);

afterAll(async () => {
  await stack?.close();
  await probed?.close();
});

test('guard_matrix_three_declarations_five_callers', async () => {
  const callers: Array<{ name: string; client: Client }> = [{ name: 'sem sessão', client: probed.client() }];
  for (const role of ['admin', 'reception', 'hr_finance', 'instructor'] satisfies Role[]) {
    callers.push({ name: role, client: (await probed.session(role)).client });
  }
  const expected: Record<string, Record<string, [status: number, code?: string]>> = {
    public: {
      'sem sessão': [200],
      admin: [200],
      reception: [200],
      hr_finance: [200],
      instructor: [200],
    },
    authenticated: {
      'sem sessão': [401, 'unauthorized'],
      admin: [200],
      reception: [200],
      hr_finance: [200],
      instructor: [200],
    },
    roles: {
      'sem sessão': [401, 'unauthorized'],
      admin: [200],
      reception: [200],
      hr_finance: [403, 'forbidden'],
      instructor: [403, 'forbidden'],
    },
  };

  let combinations = 0;
  for (const [route, byCaller] of Object.entries(expected)) {
    for (const { name, client } of callers) {
      const [status, code] = byCaller[name]!;
      const before = executions.length;

      const response = await client.get(`/api/test/${route}`);
      const body = (await response.json()) as { code?: string };

      expect(response.status, `${route} por ${name}`).toBe(status);
      expect(body.code, `${route} por ${name}`).toBe(code);
      // o handler roda no 200 e só nele
      expect(executions.length - before, `${route} por ${name}`).toBe(status === 200 ? 1 : 0);
      combinations += 1;
    }
  }
  expect(combinations).toBe(15);
});

test('non_admin_403_on_every_users_route', async () => {
  const target = await stack.seed({ role: 'admin' });
  const usersRoutes: Array<[method: string, path: string, body?: unknown]> = [
    ['GET', '/api/users'],
    ['POST', '/api/users', { name: 'Nova', email: 'nova@exemplo.com', role: 'reception', password: 'senha-valida-123' }],
    ['PATCH', `/api/users/${target.id}`, { name: 'Outro nome', active: false }],
    ['PUT', `/api/users/${target.id}/password`, { password: 'senha-valida-456' }],
    ['DELETE', `/api/users/${target.id}/two-factor`],
  ];
  const sessions: Array<{ role: Role; client: Client }> = [];
  for (const role of ['reception', 'hr_finance', 'instructor'] satisfies Role[]) {
    sessions.push({ role, client: (await stack.session(role)).client });
  }
  const snapshot = () =>
    Promise.all([
      stack.query('select id, name, email, role, active, two_factor_enabled from users order by id'),
      stack.query('select user_id, password from accounts order by user_id'),
    ]);
  const before = await snapshot();

  let combinations = 0;
  for (const { role, client } of sessions) {
    for (const [method, path, body] of usersRoutes) {
      const response = await client.request(method, path, { body });

      expect(response.status, `${method} ${path} por ${role}`).toBe(403);
      expect((await problem(response)).code, `${method} ${path} por ${role}`).toBe('forbidden');
      combinations += 1;
    }
  }
  expect(combinations).toBe(15);
  expect(await snapshot()).toEqual(before);
});

test('non_admin_403_on_audit_logs', async () => {
  const roles = ['reception', 'hr_finance', 'instructor'] satisfies Role[];
  expect(roles).toHaveLength(3);

  for (const role of roles) {
    const { client } = await stack.session(role);

    const response = await client.get('/api/audit-logs');

    expect(response.status, role).toBe(403);
    expect((await problem(response)).code, role).toBe('forbidden');
  }
});

test('only_listed_routes_answer_without_session', async () => {
  const routes = stack.api.routes();
  expect(routes.length).toBeGreaterThanOrEqual(15);

  const open: string[] = [];
  for (const { method, path } of routes) {
    const response = await stack.client().request(method, path.replace(/:\w+/g, randomUUID()));
    const text = await response.text();
    const code = text ? (JSON.parse(text) as { code?: string }).code : undefined;

    if (response.status === 401 && code === 'unauthorized') continue;
    expect(code, `${method} ${path}`).not.toBe('unauthorized');
    expect(response.status, `${method} ${path}`).not.toBe(401);
    open.push(`${method} ${path}`);
  }

  expect(open.sort()).toEqual([
    'GET /api/leads/google/callback',
    'GET /api/leads/google/profile',
    'GET /api/leads/google/start',
    'GET /api/leads/options',
    'GET /api/photo-files/:photoId/:variant',
    'GET /health',
    'POST /api/auth/login',
    'POST /api/auth/two-factor/verify',
    'POST /api/leads',
    'POST /api/leads/confirm',
  ].sort());
});
