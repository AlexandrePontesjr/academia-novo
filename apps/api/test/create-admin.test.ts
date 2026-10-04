import { afterAll, beforeAll, expect, test } from 'vitest';
import { createAdmin } from './support/command.ts';
import { type Stack, startStack } from './support/stack.ts';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

const counts = async () => ({
  users: (await stack.query('select id from users')).length,
  accounts: (await stack.query('select id from accounts')).length,
});

test('creates_admin_exits_0_without_printing_password', async () => {
  const password = 'senha-admin1';
  expect(password).toHaveLength(12);

  const result = createAdmin(
    stack.postgres.url,
    ['--email', 'primeira.admin@exemplo.com', '--name', 'Administradora'],
    { ADMIN_PASSWORD: password },
  );

  expect(result.status, result.output).toBe(0);
  const rows = await stack.query<{ id: string; role: string; active: boolean; name: string }>(
    'select id, role, active, name from users where email = $1',
    ['primeira.admin@exemplo.com'],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ role: 'admin', active: true, name: 'Administradora' });
  expect(result.output).toContain(rows[0]!.id);
  expect(result.output).toContain('primeira.admin@exemplo.com');
  expect(result.output).not.toContain(password);

  const login = await stack
    .client()
    .post('/api/auth/login', { email: 'primeira.admin@exemplo.com', password });
  expect(login.status).toBe(200);
});

test('rejects_six_invalid_invocations', async () => {
  await stack.seed({ email: 'ja.existe@exemplo.com' });
  const valid = { ADMIN_PASSWORD: 'senha-valida-123' };
  const cases: Array<{ name: string; args: string[]; env: Record<string, string>; reason: RegExp }> = [
    {
      name: 'e-mail já cadastrado',
      args: ['--email', 'ja.existe@exemplo.com', '--name', 'Repetida'],
      env: valid,
      reason: /e-mail já cadastrado/,
    },
    {
      name: 'senha de 11 caracteres',
      args: ['--email', 'curta@exemplo.com', '--name', 'Curta'],
      env: { ADMIN_PASSWORD: 'x'.repeat(11) },
      reason: /ADMIN_PASSWORD/,
    },
    {
      name: 'senha de 129 caracteres',
      args: ['--email', 'longa@exemplo.com', '--name', 'Longa'],
      env: { ADMIN_PASSWORD: 'x'.repeat(129) },
      reason: /ADMIN_PASSWORD/,
    },
    {
      name: 'sem ADMIN_PASSWORD',
      args: ['--email', 'sem.senha@exemplo.com', '--name', 'Sem senha'.replace(' ', '-')],
      env: {},
      reason: /ADMIN_PASSWORD/,
    },
    { name: 'sem --email', args: ['--name', 'Sem-email'], env: valid, reason: /--email/ },
    { name: 'sem --name', args: ['--email', 'sem.nome@exemplo.com'], env: valid, reason: /--name/ },
  ];
  expect(cases).toHaveLength(6);
  const before = await counts();

  for (const { name, args, env, reason } of cases) {
    const result = createAdmin(stack.postgres.url, args, env);

    expect(result.status, `${name}: ${result.output}`).toBe(1);
    expect(result.output, name).toMatch(reason);
    for (const value of Object.values(env)) expect(result.output, name).not.toContain(value);
    expect(await counts(), name).toEqual(before);
  }
});
