import { afterAll, beforeAll, expect, test } from 'vitest';
import { createAdmin } from './support/command.ts';
import { problem, type Stack, startStack } from './support/stack.ts';

const ARGON2ID_PREFIX = '$argon2id$v=19$m=19456,t=2,p=1$';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

async function storedPassword(email: string) {
  const rows = await stack.query<{ password: string }>(
    'select a.password from accounts a join users u on u.id = a.user_id where u.email = $1',
    [email],
  );
  expect(rows, `conta de ${email}`).toHaveLength(1);
  return rows[0]!.password;
}

async function login(email: string, password: string) {
  return stack.client().post('/api/auth/login', { email, password });
}

test('every_password_write_stores_argon2id', async () => {
  const { client: admin } = await stack.session('admin');
  const writes: Array<{ path: string; email: string; password: string }> = [];

  const command = createAdmin(stack.postgres.url, ['--email', 'comando@exemplo.com', '--name', 'Comando'], {
    ADMIN_PASSWORD: 'senha-do-comando-1',
  });
  expect(command.status, command.output).toBe(0);
  writes.push({ path: 'pnpm users:create-admin', email: 'comando@exemplo.com', password: 'senha-do-comando-1' });

  const created = await admin.post('/api/users', {
    name: 'Criada',
    email: 'criada@exemplo.com',
    role: 'reception',
    password: 'senha-da-criacao-2',
  });
  expect(created.status).toBe(201);
  writes.push({ path: 'POST /api/users', email: 'criada@exemplo.com', password: 'senha-da-criacao-2' });

  const self = await stack.seed();
  const selfClient = await stack.signIn(self);
  const changed = await selfClient.put('/api/auth/password', {
    currentPassword: self.password,
    newPassword: 'senha-trocada-por-mim-3',
  });
  expect(changed.status).toBe(204);
  writes.push({ path: 'PUT /api/auth/password', email: self.email, password: 'senha-trocada-por-mim-3' });

  const other = await stack.seed();
  const reset = await admin.put(`/api/users/${other.id}/password`, { password: 'senha-redefinida-4' });
  expect(reset.status).toBe(204);
  writes.push({ path: 'PUT /api/users/:id/password', email: other.email, password: 'senha-redefinida-4' });

  expect(writes).toHaveLength(4);
  for (const { path, email, password } of writes) {
    const stored = await storedPassword(email);
    expect(stored.startsWith(ARGON2ID_PREFIX), `${path}: ${stored.slice(0, 32)}`).toBe(true);
    expect(stored, path).not.toContain(password);
  }
});

test('change_password_204_keeps_current_session_only', async () => {
  const user = await stack.seed();
  const current = await stack.signIn(user);
  const other = await stack.signIn(user);
  const newPassword = 'nova-senha-1';
  expect(newPassword).toHaveLength(12);

  const response = await current.put('/api/auth/password', {
    currentPassword: user.password,
    newPassword,
  });

  expect(response.status).toBe(204);
  expect((await current.get('/api/auth/session')).status).toBe(200);
  expect((await other.get('/api/auth/session')).status).toBe(401);
  expect((await login(user.email, newPassword)).status).toBe(200);
  expect((await login(user.email, user.password)).status).toBe(401);
});

test('wrong_current_password_422', async () => {
  const user = await stack.seed();
  const client = await stack.signIn(user);
  const before = await storedPassword(user.email);

  const response = await client.put('/api/auth/password', {
    currentPassword: 'nao-e-a-senha-atual',
    newPassword: 'nova-senha-valida-1',
  });
  const body = await problem(response);

  expect(response.status).toBe(422);
  expect(body.code).toBe('validation_failed');
  expect(body.errors).toHaveLength(1);
  expect(body.errors![0]!.path).toBe('currentPassword');
  expect(body.errors![0]!.message).toMatch(/\S/);
  expect(await storedPassword(user.email)).toBe(before);
});

test('password_length_bounds_on_three_routes', async () => {
  const { client: admin } = await stack.session('admin');
  const target = await stack.seed();
  const self = await stack.seed();
  const selfClient = await stack.signIn(self);
  let currentPassword = self.password;
  let created = 0;

  const routes = [
    {
      field: 'newPassword',
      accepted: 204,
      send: async (password: string) => {
        const response = await selfClient.put('/api/auth/password', { currentPassword, newPassword: password });
        if (response.status === 204) currentPassword = password;
        return response;
      },
    },
    {
      field: 'password',
      accepted: 201,
      send: (password: string) =>
        admin.post('/api/users', {
          name: 'Limite',
          email: `limite${++created}@exemplo.com`,
          role: 'instructor',
          password,
        }),
    },
    {
      field: 'password',
      accepted: 204,
      send: (password: string) => admin.put(`/api/users/${target.id}/password`, { password }),
    },
  ];

  for (const { field, accepted, send } of routes) {
    for (const length of [11, 129]) {
      const response = await send('x'.repeat(length));
      const body = await problem(response);

      expect(response.status, `${field} com ${length}`).toBe(422);
      expect(body.errors?.map((error) => error.path), `${field} com ${length}`).toEqual([field]);
    }
    for (const length of [12, 128]) {
      const response = await send('y'.repeat(length));

      expect(response.status, `${field} com ${length}`).toBe(accepted);
    }
  }
});
