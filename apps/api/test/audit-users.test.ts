import { randomUUID } from 'node:crypto';
import type { User } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount, withAuditInsertFailing, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { problem, type SeededUser, type Stack, startStack } from './support/stack.ts';

let stack: Stack;
let admin: Client;
let author: SeededUser;

beforeAll(async () => {
  stack = await startStack();
  const session = await stack.session('admin');
  admin = session.client;
  author = session.user;
}, 180_000);

afterAll(() => stack?.close());

test('create_user_writes_one_user_created_row', async () => {
  const { result: response, rows } = await written(stack, () =>
    admin.post('/api/users', {
      name: 'Bianca Rocha',
      email: 'bianca@exemplo.com',
      role: 'reception',
      password: 'senha-da-bianca-1',
    }),
  );
  const created = (await response.json()) as User;

  expect(response.status).toBe(201);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: 'user.created',
    user_id: author.id,
    entity: 'user',
    entity_id: created.id,
  });
});

test('patch_writes_one_user_updated_row_per_field', async () => {
  const target = await stack.seed({ name: 'Nome antigo', role: 'reception' });
  const changes = [{ name: 'Nome novo' }, { role: 'instructor' }, { active: false }];
  expect(changes).toHaveLength(3);

  for (const change of changes) {
    const { result: response, rows } = await written(stack, () => admin.patch(`/api/users/${target.id}`, change));

    expect(response.status, JSON.stringify(change)).toBe(200);
    expect(rows, JSON.stringify(change)).toHaveLength(1);
    expect(rows[0], JSON.stringify(change)).toMatchObject({
      action: 'user.updated',
      user_id: author.id,
      entity_id: target.id,
    });
  }
});

test('patch_without_change_writes_no_row', async () => {
  const target = await stack.seed({ name: 'Igual', role: 'instructor' });
  const before = await auditCount(stack);

  const response = await admin.patch(`/api/users/${target.id}`, { name: 'Igual', role: 'instructor', active: true });

  expect(response.status).toBe(200);
  expect(await auditCount(stack)).toBe(before);
});

test('password_reset_writes_one_row_with_null_diff', async () => {
  const target = await stack.seed();

  const { result: response, rows } = await written(stack, () =>
    admin.put(`/api/users/${target.id}/password`, { password: 'senha-nova-123' }),
  );

  expect(response.status).toBe(204);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: 'user.password_reset',
    user_id: author.id,
    entity_id: target.id,
    diff: null,
  });
});

test('two_factor_reset_writes_one_row_with_null_diff', async () => {
  const target = await stack.seed();
  await stack.enrollTwoFactor(await stack.signIn(target));

  const { result: response, rows } = await written(stack, () => admin.delete(`/api/users/${target.id}/two-factor`));

  expect(response.status).toBe(204);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: 'user.two_factor_reset',
    user_id: author.id,
    entity_id: target.id,
    diff: null,
  });
});

test('rejected_users_requests_write_no_row', async () => {
  // o autor passa a ser o único administrador ativo, para o `last_admin`
  await stack.query("update users set role = 'reception' where role = 'admin' and id <> $1", [author.id]);
  const existing = await stack.seed();
  const reception = (await stack.session('reception')).client;
  const valid = { name: 'Nova', email: 'nova@exemplo.com', role: 'reception', password: 'senha-valida-123' };
  const cases: Array<[name: string, status: number, code: string, send: () => Promise<Response>]> = [
    ['401 sem sessão', 401, 'unauthorized', () => stack.client().post('/api/users', valid)],
    ['403 perfil reception', 403, 'forbidden', () => reception.post('/api/users', valid)],
    ['404 uuid sem usuário', 404, 'not_found', () => admin.patch(`/api/users/${randomUUID()}`, { name: 'Ninguém' })],
    ['409 email_taken', 409, 'email_taken', () => admin.post('/api/users', { ...valid, email: existing.email })],
    ['409 last_admin', 409, 'last_admin', () => admin.patch(`/api/users/${author.id}`, { active: false })],
    ['422 role owner', 422, 'validation_failed', () => admin.patch(`/api/users/${existing.id}`, { role: 'owner' })],
  ];
  expect(cases).toHaveLength(6);

  for (const [name, status, code, send] of cases) {
    const before = await auditCount(stack);

    const response = await send();

    expect(response.status, name).toBe(status);
    expect((await problem(response)).code, name).toBe(code);
    expect(await auditCount(stack), name).toBe(before);
  }
});

test('audit_insert_failure_rolls_back_five_routes', async () => {
  const target = await stack.seed({ name: 'Alvo intacto' });
  // o alvo tem 2FA e sessão aberta: há o que cada rota mudaria
  await stack.enrollTwoFactor(await stack.signIn(target));
  const own = await stack.session('reception');
  // uma segunda sessão do próprio usuário, que a troca de senha encerraria
  await stack.signIn(own.user);
  const routes: Array<[name: string, send: () => Promise<Response>]> = [
    [
      'POST /api/users',
      () => admin.post('/api/users', { name: 'Não nasce', email: 'nao.nasce@exemplo.com', role: 'reception', password: 'senha-valida-123' }),
    ],
    ['PATCH /api/users/:id', () => admin.patch(`/api/users/${target.id}`, { name: 'Outro nome', role: 'instructor' })],
    ['PUT /api/users/:id/password', () => admin.put(`/api/users/${target.id}/password`, { password: 'senha-trocada-123' })],
    ['DELETE /api/users/:id/two-factor', () => admin.delete(`/api/users/${target.id}/two-factor`)],
    [
      'PUT /api/auth/password',
      () => own.client.put('/api/auth/password', { currentPassword: own.user.password, newPassword: 'senha-propria-nova-1' }),
    ],
  ];
  expect(routes).toHaveLength(5);
  const snapshot = async () => {
    const tables: Record<string, unknown> = {};
    for (const table of ['users', 'accounts', 'sessions', 'two_factors']) {
      tables[table] = await stack.query(`select to_jsonb(t)::text as row from ${table} t order by id`);
    }
    return tables;
  };

  for (const [name, send] of routes) {
    const before = await snapshot();

    const response = await withAuditInsertFailing(stack, send);

    expect(response.status, name).toBe(500);
    expect((await problem(response)).code, name).toBe('internal_error');
    expect(await snapshot(), name).toEqual(before);
  }
});
