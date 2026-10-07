import { randomUUID } from 'node:crypto';
import type { SessionResponse, TwoFactorEnableResponse } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Client } from './support/client.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { totpCode } from './support/totp.ts';

const PUBLIC = ['POST /api/auth/login', 'POST /api/auth/two-factor/verify', 'GET /api/photo-files/:photoId/:variant'];
const EXEMPT = [
  'GET /api/auth/session',
  'POST /api/auth/logout',
  'POST /api/auth/two-factor/enable',
  'POST /api/auth/two-factor/confirm',
];

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

/** Sessão de um Administrador recém-criado, ainda sem 2FA. */
async function adminWithoutTwoFactor() {
  const user = await stack.seed({ role: 'admin' });
  return { user, client: await stack.signIn(user) };
}

async function enrollmentRequired(client: Client) {
  const response = await client.get('/api/auth/session');
  expect(response.status).toBe(200);
  return ((await response.json()) as SessionResponse).twoFactorEnrollmentRequired;
}

test('admin_without_2fa_gets_403_everywhere_else', async () => {
  const { client } = await adminWithoutTwoFactor();
  const blocked = stack.api
    .routes()
    .filter(({ path }) => path.startsWith('/api/'))
    .filter(({ method, path }) => ![...PUBLIC, ...EXEMPT].includes(`${method} ${path}`));

  for (const { method, path } of blocked) {
    const response = await client.request(method, path.replace(/:\w+/g, randomUUID()));

    expect(response.status, `${method} ${path}`).toBe(403);
    expect((await problem(response)).code, `${method} ${path}`).toBe('two_factor_enrollment_required');
  }

  expect(blocked.map(({ method, path }) => `${method} ${path}`).sort()).toEqual(
    [
      'PUT /api/auth/password',
      'POST /api/auth/two-factor/disable',
      'GET /api/users',
      'POST /api/users',
      'PATCH /api/users/:id',
      'PUT /api/users/:id/password',
      'DELETE /api/users/:id/two-factor',
      'GET /api/audit-logs',
      'GET /api/students',
      'POST /api/students',
      'GET /api/students/:id',
      'PATCH /api/students/:id',
      'DELETE /api/students/:id',
      'GET /api/consent-terms',
      'GET /api/students/:id/consents',
      'POST /api/students/:id/consents',
      'DELETE /api/students/:id/consents/:consentId',
      'GET /api/students/:id/photo',
      'POST /api/students/:id/photo',
      'PUT /api/students/:id/photo',
      'DELETE /api/students/:id/photo',
      'GET /api/staff',
      'POST /api/staff',
      'GET /api/staff/:id',
      'GET /api/openapi.json',
    ].sort(),
  );
});

test('four_exempt_routes_stay_reachable', async () => {
  const { user, client } = await adminWithoutTwoFactor();

  const session = await client.get('/api/auth/session');
  expect(session.status).toBe(200);

  const enabled = await client.post('/api/auth/two-factor/enable', { password: user.password });
  expect(enabled.status).toBe(200);
  const { totpUri } = (await enabled.json()) as TwoFactorEnableResponse;

  const confirmed = await client.post('/api/auth/two-factor/confirm', { code: totpCode(totpUri) });
  expect(confirmed.status).toBe(204);

  const loggedOut = await client.post('/api/auth/logout');
  expect(loggedOut.status).toBe(204);

  // a confirmação acima encerrou o estado "sem 2FA" daquela sessão: a saída também é provada com
  // um Administrador que ainda está nele
  const other = await adminWithoutTwoFactor();
  expect(await enrollmentRequired(other.client)).toBe(true);
  expect((await other.client.post('/api/auth/logout')).status).toBe(204);
});

test('enrollment_required_only_for_admin_without_2fa', async () => {
  const admin = await adminWithoutTwoFactor();
  expect(await enrollmentRequired(admin.client)).toBe(true);

  await stack.enrollTwoFactor(admin.client);
  expect(await enrollmentRequired(admin.client)).toBe(false);

  const reception = await stack.session('reception');
  expect(await enrollmentRequired(reception.client)).toBe(false);
});
