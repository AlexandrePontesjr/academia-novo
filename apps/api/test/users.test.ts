import { randomUUID } from 'node:crypto';
import type { User, UsersResponse } from '@academia/contracts';
import pg from 'pg';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import type { Client } from './support/client.ts';
import { problem, type Stack, startStack } from './support/stack.ts';

let stack: Stack;
let admin: Client;

beforeAll(async () => {
  stack = await startStack();
  admin = (await stack.session('admin')).client;
}, 180_000);

afterAll(() => stack?.close());

const login = (email: string, password: string) => stack.client().post('/api/auth/login', { email, password });

const row = async (id: string) =>
  (await stack.query<{ role: string; active: boolean }>('select role, active from users where id = $1', [id]))[0];

const sessionCount = async (userId: string) =>
  (await stack.query('select id from sessions where user_id = $1', [userId])).length;

/**
 * Deixa o banco com exatamente os administradores pedidos e devolve a sessão de um deles.
 * Os demais usuários de teste viram `reception`, para a regra do último administrador ser exata.
 */
async function onlyAdmins(count: number) {
  await stack.query("update users set role = 'reception' where role = 'admin'");
  const admins = [];
  for (let index = 0; index < count; index += 1) admins.push(await stack.session('admin'));
  return admins;
}

test('create_user_201_and_user_can_log_in', async () => {
  const input = { name: 'Bianca Rocha', email: 'bianca@exemplo.com', role: 'reception', password: 'senha-da-bianca-1' };

  const response = await admin.post('/api/users', input);
  const body = (await response.json()) as Record<string, unknown>;

  expect(response.status).toBe(201);
  expect(body).toStrictEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    name: 'Bianca Rocha',
    email: 'bianca@exemplo.com',
    role: 'reception',
    active: true,
    twoFactorEnabled: false,
  });
  expect(JSON.stringify(body)).not.toMatch(/password|senha/i);

  const loggedIn = await login(input.email, input.password);
  expect(loggedIn.status).toBe(200);
  expect(await loggedIn.json()).toEqual({ status: 'authenticated' });
});

test('duplicate_email_409_case_insensitive', async () => {
  const existing = await stack.seed({ email: 'repetido@exemplo.com' });
  const before = await stack.query('select id from users');

  const response = await admin.post('/api/users', {
    name: 'Outra pessoa',
    email: 'Repetido@Exemplo.COM',
    role: 'instructor',
    password: 'senha-valida-123',
  });

  expect(existing.email).toBe('repetido@exemplo.com');
  expect(response.status).toBe(409);
  expect((await problem(response)).code).toBe('email_taken');
  expect(await stack.query('select id from users')).toHaveLength(before.length);
});

test('email_is_stored_lowercase', async () => {
  const created = await admin.post('/api/users', {
    name: 'Ana Lima',
    email: 'Ana.Lima@Exemplo.com',
    role: 'hr_finance',
    password: 'senha-valida-123',
  });
  expect(created.status).toBe(201);

  const listed = (await (await admin.get('/api/users')).json()) as UsersResponse;

  expect(listed.users.filter((user) => user.name === 'Ana Lima').map((user) => user.email)).toEqual([
    'ana.lima@exemplo.com',
  ]);
});

test('role_accepts_only_the_four_values', async () => {
  const target = await stack.seed();
  const rejected = [
    await admin.post('/api/users', { name: 'Dona', email: 'dona@exemplo.com', role: 'owner', password: 'senha-valida-123' }),
    await admin.patch(`/api/users/${target.id}`, { role: 'owner' }),
  ];
  for (const response of rejected) {
    const body = await problem(response);
    expect(response.status).toBe(422);
    expect(body.errors?.map((error) => error.path)).toEqual(['role']);
  }
  expect((await row(target.id))?.role).toBe('reception');

  for (const role of ['admin', 'reception', 'hr_finance', 'instructor']) {
    const created = await admin.post('/api/users', {
      name: `Perfil ${role}`,
      email: `perfil.${role}@exemplo.com`,
      role,
      password: 'senha-valida-123',
    });
    expect(created.status, `POST com ${role}`).toBe(201);
    expect(((await created.json()) as User).role, `POST com ${role}`).toBe(role);

    const patched = await admin.patch(`/api/users/${target.id}`, { role });
    expect(patched.status, `PATCH com ${role}`).toBe(200);
    expect(((await patched.json()) as User).role, `PATCH com ${role}`).toBe(role);
  }
});

test('list_users_200_sorted_with_six_keys', async () => {
  await stack.seed({ name: 'Zuleica Prado' });
  await stack.seed({ name: 'Álvaro Dias' });
  await stack.seed({ name: 'bruno costa', active: false });
  await stack.seed({ name: 'Carla Nunes' });
  const inDatabase = await stack.query<{ id: string }>('select id from users');

  const response = await admin.get('/api/users');
  const { users } = (await response.json()) as UsersResponse;

  expect(response.status).toBe(200);
  expect(users.map((user) => user.id).sort()).toEqual(inDatabase.map((user) => user.id).sort());
  expect(users.some((user) => !user.active)).toBe(true);
  const names = users.map((user) => user.name);
  expect(names).toEqual([...names].sort(new Intl.Collator('pt-BR').compare));
  const sample = names.filter((name) => ['Zuleica Prado', 'Álvaro Dias', 'bruno costa', 'Carla Nunes'].includes(name));
  expect(sample).toEqual(['Álvaro Dias', 'bruno costa', 'Carla Nunes', 'Zuleica Prado']);
  for (const user of users) {
    expect(Object.keys(user).sort()).toEqual(['active', 'email', 'id', 'name', 'role', 'twoFactorEnabled']);
  }
});

test('patch_user_200_per_field', async () => {
  const target = await stack.seed({ name: 'Nome antigo', role: 'reception' });
  let expected: User = {
    id: target.id,
    name: 'Nome antigo',
    email: target.email,
    role: 'reception',
    active: true,
    twoFactorEnabled: false,
  };
  const changes: Array<Partial<User>> = [{ name: 'Nome novo' }, { role: 'instructor' }, { active: false }];

  for (const change of changes) {
    const response = await admin.patch(`/api/users/${target.id}`, change);
    expected = { ...expected, ...change };

    expect(response.status, JSON.stringify(change)).toBe(200);
    expect(await response.json(), JSON.stringify(change)).toStrictEqual(expected);
  }
});

test('role_change_or_deactivation_ends_sessions', async () => {
  const changes = [{ role: 'instructor' }, { active: false }];

  for (const change of changes) {
    const { user, client } = await stack.session('reception');
    expect((await client.get('/api/auth/session')).status).toBe(200);

    const response = await admin.patch(`/api/users/${user.id}`, change);

    expect(response.status, JSON.stringify(change)).toBe(200);
    expect((await client.get('/api/auth/session')).status, JSON.stringify(change)).toBe(401);
    expect(await sessionCount(user.id), JSON.stringify(change)).toBe(0);
  }
});

test('last_admin_409_in_three_cases', async () => {
  const [only] = await onlyAdmins(1);
  const inactiveAdmin = await stack.seed({ role: 'admin', active: false });
  const cases = [
    { name: 'tirar o perfil do único administrador ativo', change: { role: 'reception' } },
    { name: 'desativar o único administrador ativo', change: { active: false } },
    { name: 'tirar o perfil com o outro administrador inativo', change: { role: 'hr_finance' } },
  ];
  expect((await row(inactiveAdmin.id))?.active).toBe(false);

  for (const { name, change } of cases) {
    const response = await only!.client.patch(`/api/users/${only!.user.id}`, change);

    expect(response.status, name).toBe(409);
    expect((await problem(response)).code, name).toBe('last_admin');
    expect(await row(only!.user.id), name).toEqual({ role: 'admin', active: true });
  }
  admin = only!.client;
});

test('concurrent_removal_of_last_two_admins', async () => {
  const [first, second] = await onlyAdmins(2);
  // As duas requisições têm de estar ao mesmo tempo dentro da alteração. O teste segura as linhas
  // dos administradores até as duas estarem esperando por elas, e só então as solta: sem isso, a
  // que chega depois encontraria a sessão do próprio autor já encerrada pela primeira.
  const holder = new pg.Client({ connectionString: stack.postgres.url });
  await holder.connect();
  let responses: Response[];
  try {
    await holder.query('begin');
    await holder.query("select id from users where role = 'admin' and active for update");
    const pending = Promise.all([
      first!.client.patch(`/api/users/${second!.user.id}`, { active: false }),
      second!.client.patch(`/api/users/${first!.user.id}`, { active: false }),
    ]);
    await vi.waitFor(
      async () => {
        const waiting = await stack.query(
          "select pid from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%for update%'",
        );
        expect(waiting).toHaveLength(2);
      },
      { timeout: 1500, interval: 20 },
    );
    await holder.query('commit');
    responses = await pending;
  } finally {
    await holder.end();
  }

  const statuses = responses.map((response) => response.status).sort();
  expect(statuses).toEqual([200, 409]);
  const refused = responses.find((response) => response.status === 409)!;
  expect((await problem(refused)).code).toBe('last_admin');
  expect(await stack.query("select id from users where role = 'admin' and active")).toHaveLength(1);

  admin = (await stack.session('admin')).client;
});

test('admin_resets_password_204', async () => {
  const { user, client } = await stack.session('reception');
  const newPassword = 'senha-nova-1';
  expect(newPassword).toHaveLength(12);

  const response = await admin.put(`/api/users/${user.id}/password`, { password: newPassword });

  expect(response.status).toBe(204);
  expect((await client.get('/api/auth/session')).status).toBe(401);
  expect((await login(user.email, newPassword)).status).toBe(200);
  expect((await login(user.email, user.password)).status).toBe(401);
});

test('admin_resets_two_factor_204', async () => {
  const user = await stack.seed();
  const client = await stack.signIn(user);
  await stack.enrollTwoFactor(client);
  expect(await stack.query('select id from two_factors where user_id = $1', [user.id])).toHaveLength(1);
  expect((await client.get('/api/auth/session')).status).toBe(200);

  const response = await admin.delete(`/api/users/${user.id}/two-factor`);

  expect(response.status).toBe(204);
  expect(
    await stack.query('select two_factor_enabled from users where id = $1', [user.id]),
  ).toEqual([{ two_factor_enabled: false }]);
  expect(await stack.query('select id from two_factors where user_id = $1', [user.id])).toEqual([]);
  expect((await client.get('/api/auth/session')).status).toBe(401);
});

test('unknown_or_malformed_id_404', async () => {
  const routes: Array<[method: string, suffix: string, body?: unknown]> = [
    ['PATCH', '', { name: 'Qualquer' }],
    ['PUT', '/password', { password: 'senha-valida-123' }],
    ['DELETE', '/two-factor'],
  ];

  let combinations = 0;
  for (const [method, suffix, body] of routes) {
    for (const id of ['abc', randomUUID()]) {
      const response = await admin.request(method, `/api/users/${id}${suffix}`, { body });

      expect(response.status, `${method} ${id}${suffix}`).toBe(404);
      expect((await problem(response)).code, `${method} ${id}${suffix}`).toBe('not_found');
      combinations += 1;
    }
  }
  expect(combinations).toBe(6);
});
