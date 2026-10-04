import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const APPEND_ONLY = 'audit_logs is append-only';
const FOREIGN_KEY_VIOLATION = '23503';

let container: StartedPostgreSqlContainer;
let client: pg.Client;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
  // banco vazio, migrado pelo mesmo comando que roda antes de a API subir; a conexão do teste usa o
  // mesmo papel de banco que a aplicação
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

let people = 0;
async function insertUser() {
  people += 1;
  const [user] = await rows<{ id: string }>(
    'insert into users (name, email, role) values ($1, $2, $3) returning id',
    ['Pessoa', `pessoa${people}@exemplo.com`, 'reception'],
  );
  return user!.id;
}

/** Uma linha com as nove colunas preenchidas. */
async function insertRow() {
  const author = await insertUser();
  const [row] = await rows<{ id: string }>(
    `insert into audit_logs (user_id, action, entity, entity_id, ip, user_agent, diff)
     values ($1, 'user.updated', 'user', $2, '203.0.113.7', 'teste/1.0', '{"fields":["name"],"values":{}}')
     returning id`,
    [author, randomUUID()],
  );
  return { id: row!.id, author };
}

// tudo como texto, para a comparação não depender de como o driver lê cada tipo
const read = (id: string) => rows('select to_jsonb(a)::text as row from audit_logs a where id = $1', [id]);
const count = async () => (await rows<{ n: string }>('select count(*) as n from audit_logs'))[0]!.n;

test('audit_logs_has_nine_columns_and_the_index', async () => {
  const columns = await rows<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'audit_logs' order by ordinal_position",
  );
  expect(columns.map((column) => column.column_name)).toEqual([
    'id',
    'user_id',
    'action',
    'entity',
    'entity_id',
    'ip',
    'user_agent',
    'diff',
    'created_at',
  ]);

  // as colunas de cada índice da tabela, na ordem do índice
  const indexes = await rows<{ columns: string[] }>(
    `select array_agg(a.attname::text order by k.position) as columns
     from pg_index i
     cross join lateral unnest(i.indkey) with ordinality as k(attnum, position)
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = 'audit_logs'::regclass
     group by i.indexrelid`,
  );
  expect(indexes.map((index) => index.columns)).toContainEqual(['created_at', 'user_id']);
});

test('defaults_optional_author_and_unbound_entity_id', async () => {
  const [before] = await rows<{ now: Date }>('select clock_timestamp() as now');
  const [byDefault] = await rows<{ id: string; created_at: Date; version: number }>(
    "insert into audit_logs (action, entity) values ('auth.login_failed', 'user') returning id, created_at, uuid_extract_version(id) as version",
  );
  const [after] = await rows<{ now: Date }>('select clock_timestamp() as now');
  expect(byDefault!.id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  expect(byDefault!.version).toBe(7);
  expect(byDefault!.created_at.getTime()).toBeGreaterThanOrEqual(before!.now.getTime());
  expect(byDefault!.created_at.getTime()).toBeLessThanOrEqual(after!.now.getTime());

  const nowhere = randomUUID();
  const [unbound] = await rows<{ user_id: string | null; entity_id: string }>(
    "insert into audit_logs (user_id, action, entity, entity_id) values (null, 'user.created', 'user', $1) returning user_id, entity_id",
    [nowhere],
  );
  expect(unbound).toEqual({ user_id: null, entity_id: nowhere });

  const rowsBefore = await count();
  await expect(
    rows("insert into audit_logs (user_id, action, entity) values ($1, 'user.created', 'user')", [randomUUID()]),
  ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
  expect(await count()).toBe(rowsBefore);
});

test('update_fails_on_each_of_nine_columns', async () => {
  const { id } = await insertRow();
  const otherUser = await insertUser();
  const changes: Record<string, [expression: string, values: unknown[]]> = {
    id: ['id = $2', [randomUUID()]],
    user_id: ['user_id = $2', [otherUser]],
    action: ["action = 'user.created'", []],
    entity: ["entity = 'student'", []],
    entity_id: ['entity_id = $2', [randomUUID()]],
    ip: ["ip = '198.51.100.1'", []],
    user_agent: ["user_agent = 'outro/2.0'", []],
    diff: ['diff = null', []],
    created_at: ["created_at = created_at - interval '1 day'", []],
  };
  expect(Object.keys(changes)).toHaveLength(9);
  const before = await read(id);
  expect(before).toHaveLength(1);

  for (const [column, [expression, values]] of Object.entries(changes)) {
    await expect(
      rows(`update audit_logs set ${expression} where id = $1`, [id, ...values]),
      column,
    ).rejects.toThrow(APPEND_ONLY);
    expect(await read(id), column).toEqual(before);
  }
});

test('delete_fails_and_keeps_the_row', async () => {
  const { id } = await insertRow();
  const before = await read(id);

  await expect(rows('delete from audit_logs where id = $1', [id])).rejects.toThrow(APPEND_ONLY);

  expect(await read(id)).toEqual(before);
  expect(before).toHaveLength(1);
});

test('truncate_fails_and_keeps_every_row', async () => {
  await insertRow();
  await insertRow();
  const before = await count();
  expect(Number(before)).toBeGreaterThanOrEqual(2);

  await expect(rows('truncate audit_logs')).rejects.toThrow();

  expect(await count()).toBe(before);
});

test('author_of_a_row_cannot_be_deleted', async () => {
  const { id, author } = await insertRow();

  await expect(rows('delete from users where id = $1', [author])).rejects.toMatchObject({
    code: FOREIGN_KEY_VIOLATION,
  });

  expect(await rows('select id from users where id = $1', [author])).toEqual([{ id: author }]);
  expect(await read(id)).toHaveLength(1);
});
