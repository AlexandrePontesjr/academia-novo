import { AUDIT_ACTIONS, auditActionSchema, type TwoFactorEnableResponse, type User } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount, auditRows, withAuditInsertFailing, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { problem, type SeededUser, type Stack, startStack } from './support/stack.ts';
import { totpCode } from './support/totp.ts';

const WRONG = 'senha-errada-000';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

const login = (email: string, password: string, client: Client = stack.client()) =>
  client.post('/api/auth/login', { email, password });

/** Um usuário com o TOTP cadastrado de verdade e sem nenhuma sessão aberta. */
async function userWithTwoFactor() {
  const user = await stack.seed();
  const enrolled = await stack.enrollTwoFactor(await stack.signIn(user));
  await stack.query('delete from sessions where user_id = $1', [user.id]);
  return { user, ...enrolled };
}

/** O primeiro passo do login de quem tem 2FA: devolve o navegador com o login pendente. */
async function pendingLogin(user: SeededUser) {
  const client = stack.client();
  const response = await login(user.email, user.password, client);
  expect(await response.json()).toStrictEqual({ status: 'two_factor_required' });
  return client;
}

/** Um código de 6 dígitos que não vale agora nem nos passos vizinhos. */
function wrongCode(totpUri: string) {
  const valid = [-30_000, 0, 30_000].map((offset) => totpCode(totpUri, Date.now() + offset));
  return ['000000', '111111', '222222', '333333'].find((code) => !valid.includes(code))!;
}

test('login_authenticated_writes_one_succeeded_row', async () => {
  const user = await stack.seed();

  const { result: response, rows } = await written(stack, () => login(user.email, user.password));

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ status: 'authenticated' });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'auth.login_succeeded', user_id: user.id, entity_id: user.id });
});

test('two_factor_required_writes_no_row', async () => {
  const { user } = await userWithTwoFactor();
  const before = await auditCount(stack);

  const response = await login(user.email, user.password);

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ status: 'two_factor_required' });
  expect(await auditCount(stack)).toBe(before);
});

test('verify_200_writes_one_succeeded_row', async () => {
  const { user, totpUri, backupCodes } = await userWithTwoFactor();
  const cases: Array<[name: string, body: () => unknown]> = [
    ['código TOTP', () => ({ code: totpCode(totpUri) })],
    ['código de recuperação', () => ({ backupCode: backupCodes[0] })],
  ];
  expect(cases).toHaveLength(2);

  for (const [name, body] of cases) {
    const client = await pendingLogin(user);

    const { result: response, rows } = await written(stack, () => client.post('/api/auth/two-factor/verify', body()));

    expect(response.status, name).toBe(200);
    expect(rows, name).toHaveLength(1);
    expect(rows[0], name).toMatchObject({ action: 'auth.login_succeeded', user_id: user.id, entity_id: user.id });
  }
});

test('login_401_of_known_email_writes_failed_row_with_user', async () => {
  const active = await stack.seed();
  const inactive = await stack.seed({ active: false });
  const cases: Array<[name: string, user: SeededUser, password: string]> = [
    ['usuário ativo com a senha errada', active, WRONG],
    ['usuário inativo', inactive, inactive.password],
  ];
  expect(cases).toHaveLength(2);

  for (const [name, user, password] of cases) {
    const { result: response, rows } = await written(stack, () => login(user.email, password));

    expect(response.status, name).toBe(401);
    expect(rows, name).toHaveLength(1);
    expect(rows[0], name).toMatchObject({ action: 'auth.login_failed', user_id: user.id, entity_id: user.id });
  }
});

test('login_401_of_unknown_email_writes_failed_row_without_user', async () => {
  const unknown = 'nao.cadastrado@exemplo.com';
  expect(await stack.query('select id from users where email = $1', [unknown])).toEqual([]);

  const { result: response, rows } = await written(stack, () => login(unknown, WRONG));

  expect(response.status).toBe(401);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'auth.login_failed', user_id: null, entity_id: null, diff: null });
});

test('verify_401_with_pending_login_writes_failed_row', async () => {
  const { user, totpUri } = await userWithTwoFactor();
  const client = await pendingLogin(user);

  const { result: response, rows } = await written(stack, () =>
    client.post('/api/auth/two-factor/verify', { code: wrongCode(totpUri) }),
  );

  expect(response.status).toBe(401);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'auth.login_failed', user_id: user.id });
});

test('verify_401_without_pending_login_writes_no_row', async () => {
  const { totpUri } = await userWithTwoFactor();
  const before = await auditCount(stack);

  const response = await stack.client().post('/api/auth/two-factor/verify', { code: totpCode(totpUri) });

  expect(response.status).toBe(401);
  expect(await auditCount(stack)).toBe(before);
});

test('blocked_attempts_write_no_row', async () => {
  const plain = await stack.seed();
  for (let attempt = 0; attempt < 5; attempt += 1) await login(plain.email, WRONG);
  const { user, totpUri } = await userWithTwoFactor();
  const pending = await pendingLogin(user);
  for (let attempt = 0; attempt < 5; attempt += 1) await login(user.email, WRONG);
  const cases: Array<[name: string, send: () => Promise<Response>]> = [
    ['login', () => login(plain.email, plain.password)],
    ['two-factor/verify', () => pending.post('/api/auth/two-factor/verify', { code: totpCode(totpUri) })],
  ];
  expect(cases).toHaveLength(2);

  for (const [name, send] of cases) {
    const before = await auditCount(stack);

    const response = await send();

    expect(response.status, name).toBe(429);
    expect(await auditCount(stack), name).toBe(before);
  }
});

test('ten_concurrent_failures_write_one_row_per_401', async () => {
  const user = await stack.seed();

  const { result: responses, rows } = await written(stack, () =>
    Promise.all(Array.from({ length: 10 }, () => login(user.email, WRONG))),
  );
  const statuses = responses.map((response) => response.status);
  const unauthorized = statuses.filter((status) => status === 401).length;
  const blocked = statuses.filter((status) => status === 429).length;

  expect(unauthorized + blocked).toBe(10);
  expect(unauthorized).toBeGreaterThanOrEqual(1);
  expect(rows.filter((row) => row.action === 'auth.login_failed')).toHaveLength(unauthorized);
  expect(rows).toHaveLength(unauthorized);
});

test('logout_writes_one_row', async () => {
  const { user, client } = await stack.session('reception');

  const { result: response, rows } = await written(stack, () => client.post('/api/auth/logout'));

  expect(response.status).toBe(204);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'auth.logout', user_id: user.id });
});

test('own_password_change_writes_one_row', async () => {
  const { user, client } = await stack.session('reception');

  const { result: response, rows } = await written(stack, () =>
    client.put('/api/auth/password', { currentPassword: user.password, newPassword: 'senha-propria-nova-1' }),
  );

  expect(response.status).toBe(204);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: 'auth.password_changed',
    user_id: user.id,
    entity_id: user.id,
    diff: null,
  });
});

test('confirm_writes_one_two_factor_enabled_row', async () => {
  const { user, client } = await stack.session('reception');
  const enabled = await client.post('/api/auth/two-factor/enable', { password: user.password });
  const { totpUri } = (await enabled.json()) as TwoFactorEnableResponse;

  const { result: response, rows } = await written(stack, () =>
    client.post('/api/auth/two-factor/confirm', { code: totpCode(totpUri) }),
  );

  expect(response.status).toBe(204);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'auth.two_factor_enabled', user_id: user.id, entity_id: user.id });
});

test('disable_writes_one_two_factor_disabled_row', async () => {
  const { user, client } = await stack.session('reception');
  await stack.enrollTwoFactor(client);

  const { result: response, rows } = await written(stack, () =>
    client.post('/api/auth/two-factor/disable', { password: user.password }),
  );

  expect(response.status).toBe(204);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'auth.two_factor_disabled', user_id: user.id, entity_id: user.id });
});

test('four_422_and_enable_200_write_no_row', async () => {
  const fresh = await stack.session('reception');
  const pending = await stack.session('reception');
  const enabled = await pending.client.post('/api/auth/two-factor/enable', { password: pending.user.password });
  const { totpUri } = (await enabled.json()) as TwoFactorEnableResponse;
  const enrolled = await stack.session('reception');
  await stack.enrollTwoFactor(enrolled.client);
  const cases: Array<[name: string, status: number, send: () => Promise<Response>]> = [
    [
      'PUT /api/auth/password com a senha atual errada',
      422,
      () => fresh.client.put('/api/auth/password', { currentPassword: WRONG, newPassword: 'senha-propria-nova-1' }),
    ],
    ['two-factor/enable com senha errada', 422, () => fresh.client.post('/api/auth/two-factor/enable', { password: WRONG })],
    [
      'two-factor/confirm com código inválido',
      422,
      () => pending.client.post('/api/auth/two-factor/confirm', { code: wrongCode(totpUri) }),
    ],
    ['two-factor/disable com senha errada', 422, () => enrolled.client.post('/api/auth/two-factor/disable', { password: WRONG })],
    [
      'two-factor/enable com a senha certa',
      200,
      () => fresh.client.post('/api/auth/two-factor/enable', { password: fresh.user.password }),
    ],
  ];
  expect(cases).toHaveLength(5);

  for (const [name, status, send] of cases) {
    const before = await auditCount(stack);

    const response = await send();

    expect(response.status, name).toBe(status);
    expect(await auditCount(stack), name).toBe(before);
  }
});

test('login_500_without_cookie_when_audit_insert_fails', async () => {
  const user = await stack.seed();

  const response = await withAuditInsertFailing(stack, () => login(user.email, user.password));

  expect(response.status).toBe(500);
  expect((await problem(response)).code).toBe('internal_error');
  expect(response.headers.getSetCookie().filter((cookie) => /session/i.test(cookie))).toEqual([]);
  expect(response.headers.getSetCookie()).toEqual([]);
});

test('ten_actions_written_equal_contract_vocabulary', async () => {
  const admin = (await stack.session('admin')).client;
  const password = 'senha-valida-123';
  const created = await admin.post('/api/users', { name: 'Percorre Tudo', email: 'percorre@exemplo.com', role: 'reception', password });
  const user = (await created.json()) as User; // user.created
  await admin.patch(`/api/users/${user.id}`, { role: 'instructor' }); // user.updated
  const client = stack.client();
  await login(user.email, WRONG, client); // auth.login_failed
  await login(user.email, password, client); // auth.login_succeeded
  await client.put('/api/auth/password', { currentPassword: password, newPassword: 'senha-valida-456' }); // auth.password_changed
  await stack.enrollTwoFactor(client, 'senha-valida-456'); // auth.two_factor_enabled
  await client.post('/api/auth/two-factor/disable', { password: 'senha-valida-456' }); // auth.two_factor_disabled
  await client.post('/api/auth/logout'); // auth.logout
  await admin.put(`/api/users/${user.id}/password`, { password: 'senha-valida-789' }); // user.password_reset
  await admin.delete(`/api/users/${user.id}/two-factor`); // user.two_factor_reset
  const student = await admin.post('/api/students', { name: 'Aluno Percorre', cpf: '529.982.247-25', birthDate: '2000-01-01', phone: '11912345678' });
  const { id: studentId } = (await student.json()) as { id: string }; // student.created
  await admin.patch(`/api/students/${studentId}`, { phone: '11977776666' }); // student.updated
  await admin.delete(`/api/students/${studentId}`); // student.inactivated
  await admin.patch(`/api/students/${studentId}`, {
    guardian: { name: 'Ana Souza', cpf: '123.456.789-09', phone: '11912345678', relationship: 'mother' },
  }); // student.guardian_saved
  const consent = await admin.post(`/api/students/${studentId}/consents`, {
    purpose: 'image_use',
    termVersion: 1,
    grantedBy: 'student',
  }); // student.consent_granted
  const { id: consentId } = (await consent.json()) as { id: string };
  await admin.delete(`/api/students/${studentId}/consents/${consentId}`); // student.consent_revoked

  const rows = await auditRows(stack);
  const written = [...new Set(rows.map((row) => row.action))].sort();

  expect(auditActionSchema.options).toHaveLength(16);
  expect([...AUDIT_ACTIONS].sort()).toEqual([...auditActionSchema.options].sort());
  expect(written).toEqual([...auditActionSchema.options].sort());
  expect(rows.length).toBeGreaterThanOrEqual(16);
  expect(rows.filter((row) => row.entity !== 'user' && row.entity !== 'student')).toEqual([]);
});
