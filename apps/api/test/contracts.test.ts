import {
  healthResponseSchema,
  loginResponseSchema,
  problemSchema,
  sessionResponseSchema,
  twoFactorEnableResponseSchema,
  userSchema,
  usersResponseSchema,
} from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { z } from 'zod';
import { startApi } from './support/app.ts';
import { refusingDatabaseUrl, startPostgres } from './support/servers.ts';
import { PASSWORD, type Stack, startStack } from './support/stack.ts';
import { totpCode } from './support/totp.ts';

let postgres: Awaited<ReturnType<typeof startPostgres>>;
let healthy: Awaited<ReturnType<typeof startApi>>;
let degraded: Awaited<ReturnType<typeof startApi>>;
let stack: Stack;

beforeAll(async () => {
  postgres = await startPostgres();
  healthy = await startApi(postgres.url);
  degraded = await startApi(await refusingDatabaseUrl());
  stack = await startStack();
}, 180_000);

afterAll(async () => {
  await healthy?.close();
  await degraded?.close();
  await postgres?.stop();
  await stack?.close();
});

test('responses_match_contract_schemas', async () => {
  const ok = await fetch(`${healthy.url}/health`);
  expect(ok.status).toBe(200);
  expect(healthResponseSchema.safeParse(await ok.json()).success).toBe(true);

  const down = await fetch(`${degraded.url}/health`);
  expect(down.status).toBe(503);
  expect(healthResponseSchema.safeParse(await down.json()).success).toBe(true);

  const notFound = await fetch(`${healthy.url}/rota-que-nao-existe`);
  expect(notFound.status).toBe(404);
  expect(problemSchema.safeParse(await notFound.json()).success).toBe(true);
});

test('ten_new_codes_match_problem_schema', async () => {
  // um único administrador ativo, para o `last_admin`; o segundo só é criado depois dele
  const admin = await stack.session('admin');
  const reception = await stack.session('reception');
  const blocked = await stack.seed();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await stack.client().post('/api/auth/login', { email: blocked.email, password: 'senha-errada-000' });
  }
  const anonymous = stack.client();

  const cases: Array<[code: string, status: number, send: () => Promise<Response>]> = [
    ['validation_failed', 422, () => anonymous.post('/api/auth/login', {})],
    ['unauthorized', 401, () => anonymous.get('/api/auth/session')],
    [
      'invalid_credentials',
      401,
      () => anonymous.post('/api/auth/login', { email: reception.user.email, password: 'senha-errada-000' }),
    ],
    ['invalid_code', 401, () => anonymous.post('/api/auth/two-factor/verify', { code: '123456' })],
    ['forbidden', 403, () => reception.client.get('/api/users')],
    ['csrf_rejected', 403, () => anonymous.post('/api/auth/login', {}, { origin: 'https://outro.example' })],
    [
      'email_taken',
      409,
      () =>
        admin.client.post('/api/users', {
          name: 'Repetida',
          email: reception.user.email,
          role: 'reception',
          password: 'senha-valida-123',
        }),
    ],
    ['last_admin', 409, () => admin.client.patch(`/api/users/${admin.user.id}`, { active: false })],
    [
      'too_many_attempts',
      429,
      () => anonymous.post('/api/auth/login', { email: blocked.email, password: blocked.password }),
    ],
    [
      'two_factor_enrollment_required',
      403,
      async () => (await stack.signIn(await stack.seed({ role: 'admin' }))).get('/api/users'),
    ],
  ];
  expect(new Set(cases.map(([code]) => code)).size).toBe(10);

  for (const [code, status, send] of cases) {
    const response = await send();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status, code).toBe(status);
    expect(body.code, code).toBe(code);
    expect(response.headers.get('content-type'), code).toMatch(/^application\/problem\+json\b/);
    expect(body.requestId, code).toMatch(/\S/);
    expect(response.headers.get('x-request-id'), code).toBe(body.requestId);
    expect(problemSchema.safeParse(body).success, code).toBe(true);
  }
});

test('seven_success_bodies_match_contract_schemas', async () => {
  // roda depois do teste acima, que deixou um Administrador sem 2FA: este é o que tem
  const admin = await stack.session('admin');
  const plain = await stack.seed();
  const withTwoFactor = await stack.seed();
  const enrolledClient = await stack.signIn(withTwoFactor);
  const fresh = await stack.signIn(await stack.seed());
  const pending = stack.client();

  const cases: Array<[route: string, status: number, schema: z.ZodType, send: () => Promise<Response>]> = [
    [
      'POST /api/auth/login',
      200,
      loginResponseSchema,
      () => stack.client().post('/api/auth/login', { email: plain.email, password: plain.password }),
    ],
    [
      'POST /api/auth/two-factor/enable',
      200,
      twoFactorEnableResponseSchema,
      () => fresh.post('/api/auth/two-factor/enable', { password: PASSWORD }),
    ],
    [
      'POST /api/auth/two-factor/verify',
      200,
      loginResponseSchema,
      async () => {
        const { totpUri } = await stack.enrollTwoFactor(enrolledClient);
        await pending.post('/api/auth/login', { email: withTwoFactor.email, password: withTwoFactor.password });
        return pending.post('/api/auth/two-factor/verify', { code: totpCode(totpUri) });
      },
    ],
    ['GET /api/auth/session', 200, sessionResponseSchema, () => admin.client.get('/api/auth/session')],
    ['GET /api/users', 200, usersResponseSchema, () => admin.client.get('/api/users')],
    [
      'POST /api/users',
      201,
      userSchema,
      () =>
        admin.client.post('/api/users', {
          name: 'Contratada',
          email: 'contratada@exemplo.com',
          role: 'instructor',
          password: 'senha-valida-123',
        }),
    ],
    [
      'PATCH /api/users/:id',
      200,
      userSchema,
      () => admin.client.patch(`/api/users/${plain.id}`, { name: 'Nome trocado' }),
    ],
  ];
  expect(cases).toHaveLength(7);

  for (const [route, status, schema, send] of cases) {
    const response = await send();
    const body: unknown = await response.json();
    const parsed = schema.safeParse(body);

    expect(response.status, route).toBe(status);
    expect(parsed.success, `${route}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
});
