import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

let container: StartedPostgreSqlContainer;
let client: pg.Client;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
  // banco vazio, migrado pelo mesmo comando que roda antes de a API subir
  const migrated = spawnSync('pnpm db:migrate', {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
  });
  expect(migrated.status, migrated.stderr).toBe(0);
  client = new pg.Client({ connectionString: container.getConnectionUri() });
  await client.connect();
}, 180_000);

afterAll(async () => {
  await client?.end();
  await container?.stop();
});

async function rows<T extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return (await client.query<T>(text, values)).rows;
}

async function insertUser(email: string, role = 'reception') {
  const [user] = await rows<{ id: string }>(
    'insert into users (name, email, role) values ($1, $2, $3) returning id',
    ['Pessoa', email, role],
  );
  return user!.id;
}

test('six_identity_tables_and_no_tenant_id', async () => {
  const tables = await rows<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  );
  const names = tables.map((table) => table.table_name);
  for (const expected of ['users', 'sessions', 'accounts', 'verifications', 'two_factors', 'login_throttles']) {
    expect(names).toContain(expected);
  }

  const tenantColumns = await rows(
    "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id'",
  );
  expect(tenantColumns).toEqual([]);
});

test('ids_default_to_uuidv7', async () => {
  const userId = await insertUser('dona.dos.ids@exemplo.com');
  const inserts: Record<string, [text: string, values: unknown[]]> = {
    users: ['insert into users (name, email, role) values ($1, $2, $3) returning id', ['Outra', 'outra@exemplo.com', 'admin']],
    sessions: [
      "insert into sessions (user_id, token, expires_at) values ($1, $2, now() + interval '30 minutes') returning id",
      [userId, 'token-de-teste'],
    ],
    accounts: [
      'insert into accounts (user_id, account_id, provider_id) values ($1, $2, $3) returning id',
      [userId, userId, 'credential'],
    ],
    verifications: [
      "insert into verifications (identifier, value, expires_at) values ($1, $2, now() + interval '10 minutes') returning id",
      ['identificador', 'valor'],
    ],
    two_factors: [
      'insert into two_factors (user_id, secret, backup_codes) values ($1, $2, $3) returning id',
      [userId, 'segredo', 'codigos'],
    ],
  };
  expect(Object.keys(inserts)).toHaveLength(5);

  for (const [table, [text, values]] of Object.entries(inserts)) {
    const [row] = await rows<{ id: string }>(text, values);
    const [checked] = await rows<{ version: number }>('select uuid_extract_version($1::uuid) as version', [row!.id]);

    expect(row!.id, table).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    expect(checked!.version, table).toBe(7);
  }
});

test('users_email_is_unique', async () => {
  await insertUser('unica@exemplo.com');

  await expect(insertUser('unica@exemplo.com')).rejects.toMatchObject({ code: '23505' });
  expect(await rows('select id from users where email = $1', ['unica@exemplo.com'])).toHaveLength(1);
});

test('users_role_rejects_fifth_value', async () => {
  await expect(insertUser('dona@exemplo.com', 'owner')).rejects.toMatchObject({ code: '23514' });
  expect(await rows('select id from users where email = $1', ['dona@exemplo.com'])).toEqual([]);

  for (const role of ['admin', 'reception', 'hr_finance', 'instructor']) {
    await expect(insertUser(`${role}@exemplo.com`, role), role).resolves.toMatch(/\S/);
  }
});
