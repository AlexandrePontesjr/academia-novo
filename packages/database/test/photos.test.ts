import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const NOT_NULL_VIOLATION = '23502';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

let container: StartedPostgreSqlContainer;
let client: pg.Client;

function migrate(databaseUrl: string, migrationsFolder?: string) {
  const migrated = spawnSync('pnpm db:migrate', {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl, ...(migrationsFolder ? { MIGRATIONS_FOLDER: migrationsFolder } : {}) },
  });
  expect(migrated.status, migrated.stderr).toBe(0);
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
  // banco vazio, migrado pelo mesmo comando que roda antes de a API subir
  migrate(container.getConnectionUri());
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

/** O `code` do erro do Postgres que a instrução provoca; falha se ela não falhar. */
async function failureOf(text: string, values: unknown[] = []) {
  try {
    await client.query(text, values);
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error(`a instrução não falhou: ${text}`);
}

let cpfs = 0;
const nextCpf = () => String(30_000_000_000 + ++cpfs);

async function insertStudent() {
  const [row] = await rows<{ id: string }>(
    `insert into students (name, cpf, birth_date, phone) values ('Aluna de Teste', $1, '2015-01-01', '11912345678') returning id`,
    [nextCpf()],
  );
  return row!.id;
}

// a linha não corrente nasce com prazo: sem ele, quem a recusa é `photos_expiry_matches_current`
const insertPhoto = (studentId: string, version: number, isCurrent: boolean) =>
  client.query(
    `insert into photos (student_id, version, is_current, expires_at)
     values ($1, $2, $3, case when $3 then null else now() + interval '30 days' end)`,
    [studentId, version, isCurrent],
  );

const photoCount = async (studentId: string) =>
  Number((await rows<{ n: string }>('select count(*) as n from photos where student_id = $1', [studentId]))[0]!.n);

test('student_foreign_key_without_cascade_blocks_delete', async () => {
  const [constraint] = await rows<{ delete_rule: string; references: string }>(
    `select rc.delete_rule, ccu.table_name as references
       from information_schema.referential_constraints rc
       join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
       join information_schema.constraint_column_usage ccu on ccu.constraint_name = rc.unique_constraint_name
      where tc.table_name = 'photos' and tc.constraint_type = 'FOREIGN KEY'`,
  );
  expect(constraint).toEqual({ delete_rule: 'NO ACTION', references: 'students' });
  const [column] = await rows<{ columns: string[] }>(
    `select array_agg(a.attname::text) as columns
       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = 'photos'::regclass and c.contype = 'f'`,
  );
  expect(column!.columns).toEqual(['student_id']);

  const studentId = await insertStudent();
  await insertPhoto(studentId, 1, true);
  const studentBefore = (await rows<{ row: string }>('select to_jsonb(s)::text as row from students s where id = $1', [studentId]))[0]!.row;
  const photoBefore = (await rows<{ row: string }>('select to_jsonb(p)::text as row from photos p where student_id = $1', [studentId]))[0]!.row;

  const failure = await failureOf('delete from students where id = $1', [studentId]);

  expect(failure.code).toBe(FOREIGN_KEY_VIOLATION);
  expect((await rows<{ row: string }>('select to_jsonb(s)::text as row from students s where id = $1', [studentId]))[0]!.row).toBe(studentBefore);
  expect((await rows<{ row: string }>('select to_jsonb(p)::text as row from photos p where student_id = $1', [studentId]))[0]!.row).toBe(photoBefore);
});

test('defaults_uuidv7_and_not_null', async () => {
  const studentId = await insertStudent();
  await insertPhoto(studentId, 1, false);
  const [photo] = await rows<{ id: string; version: number }>(
    'select id, uuid_extract_version(id) as version from photos where student_id = $1',
    [studentId],
  );
  expect(photo!.version).toBe(7);

  const missing: Array<[field: string, text: string, values: unknown[]]> = [
    ['student_id', 'insert into photos (version, is_current) values ($1, $2)', [1, true]],
    ['version', 'insert into photos (student_id, is_current) values ($1, $2)', [studentId, true]],
    ['is_current', 'insert into photos (student_id, version) values ($1, $2)', [studentId, 2]],
  ];
  for (const [field, text, values] of missing) {
    const failure = await failureOf(text, values);
    expect(failure.code, field).toBe(NOT_NULL_VIOLATION);
    expect(failure.message, field).toContain(field);
  }
});

test('version_check_and_unique_per_student', async () => {
  const first = await insertStudent();
  const second = await insertStudent();

  await insertPhoto(first, 1, false);
  for (const version of [0, -1]) {
    const failure = await failureOf(
      `insert into photos (student_id, version, is_current, expires_at) values ($1, $2, false, now() + interval '30 days')`,
      [first, version],
    );
    expect(failure.code, `version ${version}`).toBe(CHECK_VIOLATION);
    expect(failure.message, `version ${version}`).toContain('photos_version_positive');
  }
  expect(
    (await failureOf(`insert into photos (student_id, version, is_current, expires_at) values ($1, 1, false, now() + interval '30 days')`, [first])).code,
  ).toBe(UNIQUE_VIOLATION);

  // a mesma versão em outro aluno convive
  await insertPhoto(second, 1, false);
  expect(await photoCount(first)).toBe(1);
  expect(await photoCount(second)).toBe(1);
});

test('partial_unique_index_one_current_per_student', async () => {
  const first = await insertStudent();
  const second = await insertStudent();

  await insertPhoto(first, 1, true);
  const failure = await failureOf('insert into photos (student_id, version, is_current) values ($1, 2, true)', [first]);
  expect(failure.code).toBe(UNIQUE_VIOLATION);
  expect(failure.message).toContain('photos_one_current_idx');

  // uma corrente mais várias não correntes do mesmo aluno
  await insertPhoto(first, 3, false);
  await insertPhoto(first, 4, false);
  expect(await photoCount(first)).toBe(3);

  // dois alunos, cada um com a sua corrente
  await insertPhoto(second, 1, true);
  expect(await photoCount(second)).toBe(1);
});

test('migration_0005_adds_only_photos_without_tenant_or_owner_columns', async () => {
  const tables = await rows<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  const before = [
    'accounts',
    'audit_logs',
    'consent_terms',
    'consents',
    'guardians',
    'login_throttles',
    'sessions',
    'students',
    'two_factors',
    'users',
    'verifications',
  ];
  expect(tables.map((row) => row.table_name)).toEqual([...before, 'photos'].sort());

  const columns = await rows<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'photos'`,
  );
  const names = columns.map((row) => row.column_name);
  for (const forbidden of ['tenant_id', 'owner_type', 'owner_id']) expect(names, forbidden).not.toContain(forbidden);
});

test('expiry_check_ties_expires_at_to_not_current_four_combinations', async () => {
  const NAME = 'photos_expiry_matches_current';
  const insert = 'insert into photos (student_id, version, is_current, expires_at) values ($1, $2, $3, $4::timestamptz)';
  const deadline = '2030-01-01T00:00:00Z';
  const studentId = await insertStudent();

  // as duas combinações aceitas
  await client.query(insert, [studentId, 1, true, null]);
  await client.query(insert, [studentId, 2, false, deadline]);
  expect(await photoCount(studentId)).toBe(2);

  // as duas recusadas, no INSERT
  const other = await insertStudent();
  const currentWithDeadline = await failureOf(insert, [other, 1, true, deadline]);
  expect(currentWithDeadline.code).toBe(CHECK_VIOLATION);
  expect(currentWithDeadline.message).toContain(NAME);
  const storedWithoutDeadline = await failureOf(insert, [other, 1, false, null]);
  expect(storedWithoutDeadline.code).toBe(CHECK_VIOLATION);
  expect(storedWithoutDeadline.message).toContain(NAME);
  expect(await photoCount(other)).toBe(0);

  // e no UPDATE que tira `is_current` sem dar prazo
  const demoted = await failureOf('update photos set is_current = false where student_id = $1 and version = 1', [studentId]);
  expect(demoted.code).toBe(CHECK_VIOLATION);
  expect(demoted.message).toContain(NAME);
  const [current] = await rows<{ is_current: boolean; expires_at: Date | null }>(
    'select is_current, expires_at from photos where student_id = $1 and version = 1',
    [studentId],
  );
  expect(current).toEqual({ is_current: true, expires_at: null });
});

test('migration_0006_adds_only_nullable_expires_at_and_keeps_existing_rows_current', async () => {
  // uma pasta de migrações que para na `0005`, num banco à parte do mesmo servidor
  const until0005 = mkdtempSync(join(tmpdir(), 'migrations-0005-'));
  cpSync(join(repoRoot, 'packages/database/migrations'), until0005, { recursive: true });
  rmSync(join(until0005, '0006_photo_expiry.sql'));
  const journalPath = join(until0005, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ idx: number }> };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 5);
  expect(journal.entries).toHaveLength(6);
  writeFileSync(journalPath, JSON.stringify(journal));

  await client.query('create database before_0006');
  const url = new URL(container.getConnectionUri());
  url.pathname = '/before_0006';
  const other = new pg.Client({ connectionString: url.toString() });
  try {
    migrate(url.toString(), until0005);
    await other.connect();
    const query = async <T extends pg.QueryResultRow>(text: string) => (await other.query<T>(text)).rows;
    const columnsOf = () =>
      query<{ column_name: string; data_type: string; is_nullable: string }>(
        `select column_name, data_type, is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'photos' order by ordinal_position`,
      );
    const tablesOf = async () =>
      (
        await query<{ table_name: string }>(
          `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
        )
      ).map((row) => row.table_name);
    const photosOf = () => query<{ row: Record<string, unknown> }>('select to_jsonb(p) as row from photos p order by id');

    const columnsBefore = await columnsOf();
    expect(columnsBefore.map((column) => column.column_name)).not.toContain('expires_at');
    const tablesBefore = await tablesOf();
    for (const cpf of ['39000000001', '39000000002']) {
      await other.query(
        `with s as (insert into students (name, cpf, birth_date, phone) values ('Aluna de Teste', $1, '2015-01-01', '11912345678') returning id)
         insert into photos (student_id, version, is_current) select id, 1, true from s`,
        [cpf],
      );
    }
    const photosBefore = await photosOf();
    expect(photosBefore).toHaveLength(2);

    migrate(url.toString());

    expect(await columnsOf()).toEqual([
      ...columnsBefore,
      { column_name: 'expires_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    ]);
    expect(await tablesOf()).toEqual(tablesBefore);
    const photosAfter = await photosOf();
    expect(photosAfter).toEqual(photosBefore.map(({ row }) => ({ row: { ...row, expires_at: null } })));
    for (const { row } of photosAfter) expect(row.is_current).toBe(true);
  } finally {
    await other.end().catch(() => undefined);
    rmSync(until0005, { recursive: true, force: true });
  }
});
