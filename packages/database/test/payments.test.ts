import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

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

/** O erro do Postgres que a instrução provoca; falha se ela não falhar. */
async function failureOf(text: string, values: unknown[] = []) {
  try {
    await client.query(text, values);
  } catch (error) {
    return error as { code?: string; constraint?: string; message: string };
  }
  throw new Error(`a instrução não falhou: ${text}`);
}

const foreignKeysOf = (table: string) =>
  rows<{ columns: string[]; references: string; referenced: string[]; delete_rule: string }>(
    `select (select array_agg(a.attname::text) from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) as columns,
            c.confrelid::regclass::text as references,
            (select array_agg(a.attname::text) from pg_attribute a where a.attrelid = c.confrelid and a.attnum = any (c.confkey)) as referenced,
            case c.confdeltype when 'a' then 'NO ACTION' when 'c' then 'CASCADE' when 'n' then 'SET NULL'
                               when 'd' then 'SET DEFAULT' when 'r' then 'RESTRICT' end as delete_rule
       from pg_constraint c
      where c.conrelid = $1::regclass and c.contype = 'f'
      order by 1`,
    [table],
  );

const count = async () => Number((await rows<{ n: string }>('select count(*) as n from payments'))[0]!.n);

let cpfs = 0;
async function insertStudent() {
  const [row] = await rows<{ id: string }>(
    `insert into students (name, cpf, birth_date, phone) values ('Aluna de Teste', $1, '2000-01-01', '11912345678') returning id`,
    [String(61_000_000_000 + ++cpfs)],
  );
  return row!.id;
}

async function insertPlan() {
  const [row] = await rows<{ id: string }>(`insert into plans (name, period, price_cents) values ('Mensal', 'monthly', 9990) returning id`);
  return row!.id;
}

/** Um período de R$ 99,90 por SQL, de um aluno novo. */
async function insertEnrollment() {
  const [row] = await rows<{ id: string }>(
    `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents)
     values ($1, $2, '2026-10-07', '2026-11-06', 9990) returning id`,
    [await insertStudent(), await insertPlan()],
  );
  return row!.id;
}

const insertAlive = 'insert into payments (enrollment_id) values ($1) returning id';
const insertVoided = 'insert into payments (enrollment_id, voided_at) values ($1, now()) returning id';

test('payments_table_has_four_columns_no_amount_method_status_due_date_or_student_id_and_defaults', async () => {
  const columns = await rows<{ column_name: string; data_type: string; is_nullable: string }>(
    `select column_name, data_type, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'payments' order by ordinal_position`,
  );
  expect(columns.map((column) => [column.column_name, column.data_type, column.is_nullable])).toEqual([
    ['id', 'uuid', 'NO'],
    ['enrollment_id', 'uuid', 'NO'],
    ['created_at', 'timestamp with time zone', 'NO'],
    ['voided_at', 'timestamp with time zone', 'YES'],
  ]);
  const names = columns.map((column) => column.column_name);
  for (const absent of ['amount_cents', 'paid_at', 'method', 'status', 'due_date', 'student_id', 'tenant_id']) {
    expect(names, absent).not.toContain(absent);
  }

  // a única chave estrangeira é a do período, sem cascata
  expect(await foreignKeysOf('payments')).toEqual([
    { columns: ['enrollment_id'], references: 'enrollments', referenced: ['id'], delete_rule: 'NO ACTION' },
  ]);
  // nenhuma CHECK sobrou da versão anterior
  expect(await rows(`select conname from pg_constraint where conrelid = 'payments'::regclass and contype = 'c'`)).toEqual([]);

  // sem `id`, `created_at` nem `voided_at`: uuid v7, instante do banco e nulo
  const enrollmentId = await insertEnrollment();
  const [{ now: t0 }] = (await rows<{ now: Date }>('select clock_timestamp() as now')) as [{ now: Date }];
  const [row] = await rows<{ id: string; version: number; created_at: Date; voided_at: Date | null }>(
    `insert into payments (enrollment_id) values ($1)
     returning id, uuid_extract_version(id) as version, created_at, voided_at`,
    [enrollmentId],
  );
  const [{ now: t1 }] = (await rows<{ now: Date }>('select clock_timestamp() as now')) as [{ now: Date }];
  expect(row!.id).toMatch(UUID);
  expect(row!.version).toBe(7);
  expect(row!.created_at.getTime()).toBeGreaterThanOrEqual(t0.getTime());
  expect(row!.created_at.getTime()).toBeLessThanOrEqual(t1.getTime());
  expect(row!.voided_at).toBeNull();
});

test('payments_one_alive_idx_is_the_only_unique_index_besides_the_key_and_is_partial_on_voided_at_null', async () => {
  const indexes = await rows<{ name: string; primary: boolean; definition: string }>(
    `select c.relname as name, i.indisprimary as primary, pg_get_indexdef(i.indexrelid) as definition
       from pg_index i join pg_class c on c.oid = i.indexrelid
      where i.indrelid = 'payments'::regclass and i.indisunique order by i.indisprimary desc, c.relname`,
  );
  expect(indexes.map((index) => [index.name, index.primary])).toEqual([
    ['payments_pkey', true],
    ['payments_one_alive_idx', false],
  ]);
  const definition = indexes[1]!.definition;
  expect(definition).toContain('UNIQUE INDEX');
  expect(definition).toMatch(/\(enrollment_id\)/);
  expect(definition).toMatch(/WHERE \(?voided_at IS NULL\)?/);

  // nenhuma restrição de unicidade na tabela, só o índice
  const uniques = await rows<{ type: string }>(
    `select contype::text as type from pg_constraint where conrelid = 'payments'::regclass and contype in ('p', 'u')`,
  );
  expect(uniques.map((unique) => unique.type)).toEqual(['p']);
});

test('migration_0009_adds_only_payments_rewritten_in_place_without_a_0010_and_keeps_rows_and_extensions', async () => {
  // a `0009` é a décima entrada do diário e não há `0010`
  const migrations = join(repoRoot, 'packages/database/migrations');
  const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
  expect(journal.entries).toHaveLength(10);
  expect(journal.entries[9]).toMatchObject({ idx: 9, tag: '0009_payments' });
  expect(readdirSync(migrations).filter((name) => name.startsWith('0010'))).toEqual([]);
  expect(existsSync(join(migrations, 'meta/0010_snapshot.json'))).toBe(false);

  // uma pasta de migrações que para na `0008`, num banco à parte do mesmo servidor
  const until0008 = mkdtempSync(join(tmpdir(), 'migrations-0008-'));
  cpSync(migrations, until0008, { recursive: true });
  const journalPath = join(until0008, 'meta/_journal.json');
  const fullJournal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
  const dropped = fullJournal.entries.filter((entry) => entry.idx > 8);
  expect(dropped.map((entry) => entry.tag)).toEqual(['0009_payments']);
  for (const entry of dropped) rmSync(join(until0008, `${entry.tag}.sql`));
  writeFileSync(journalPath, JSON.stringify({ ...fullJournal, entries: fullJournal.entries.filter((entry) => entry.idx <= 8) }));

  await client.query('create database before_0009');
  const url = new URL(container.getConnectionUri());
  url.pathname = '/before_0009';
  const other = new pg.Client({ connectionString: url.toString() });
  try {
    migrate(url.toString(), until0008);
    await other.connect();
    const query = async <T extends pg.QueryResultRow>(text: string) => (await other.query<T>(text)).rows;
    const tablesOf = async () =>
      (
        await query<{ table_name: string }>(
          `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
        )
      ).map((row) => row.table_name);
    const columnsOfTables = (tables: string[]) =>
      query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
        `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
          where table_schema = 'public' and table_name in (${tables.map((table) => `'${table}'`).join(', ')})
          order by table_name, ordinal_position`,
      );
    const extensionsOf = async () => (await query<{ extname: string }>('select extname from pg_extension order by 1')).map((row) => row.extname);
    const rowsOf = async (table: string) => (await query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by id`)).map((row) => row.row);

    const tablesBefore = await tablesOf();
    expect(tablesBefore).toContain('enrollments');
    expect(tablesBefore).not.toContain('payments');

    // um aluno, um plano e duas matrículas (uma cancelada), antes da `0009`
    await other.query(`insert into students (name, cpf, birth_date, phone) values ('Aluna Um', '39300000001', '2015-01-01', '11912345678')`);
    await other.query(`insert into plans (name, period, price_cents) values ('Mensal', 'monthly', 9990)`);
    await other.query(
      `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents, cancelled_at)
       select s.id, p.id, v.starts_at::date, v.ends_at::date, 9990, v.cancelled_at::timestamptz
         from students s, plans p,
              (values ('2026-09-07', '2026-10-06', '2026-09-20T12:00:00Z'), ('2026-10-07', '2026-11-06', null)) as v(starts_at, ends_at, cancelled_at)`,
    );
    const columnsBefore = await columnsOfTables(tablesBefore);
    const extensionsBefore = await extensionsOf();
    const before = { students: await rowsOf('students'), plans: await rowsOf('plans'), enrollments: await rowsOf('enrollments') };
    expect(before.students).toHaveLength(1);
    expect(before.plans).toHaveLength(1);
    expect(before.enrollments).toHaveLength(2);
    expect(extensionsBefore).toContain('btree_gist');
    expect(extensionsBefore).toContain('pg_trgm');

    const onlyPaymentsAdded = async () => {
      expect(await tablesOf()).toEqual([...tablesBefore, 'payments'].sort());
      expect(await query('select * from payments')).toEqual([]);
      expect(await extensionsOf()).toEqual(extensionsBefore);
      expect(await columnsOfTables(tablesBefore)).toEqual(columnsBefore);
      expect({ students: await rowsOf('students'), plans: await rowsOf('plans'), enrollments: await rowsOf('enrollments') }).toEqual(before);
    };
    migrate(url.toString());
    await onlyPaymentsAdded();
    // uma segunda execução não muda nada
    migrate(url.toString());
    await onlyPaymentsAdded();
  } finally {
    await other.end().catch(() => undefined);
    rmSync(until0008, { recursive: true, force: true });
  }
});

test('insert_with_unknown_enrollment_id_fails_23503_and_writes_nothing', async () => {
  const total = await count();
  const failure = await failureOf(insertAlive, ['0198a000-0000-7000-8000-000000000000']);
  expect(failure.code).toBe(FOREIGN_KEY_VIOLATION);
  expect(await count()).toBe(total);
});

test('second_alive_row_fails_23505_and_voided_rows_do_not_count', async () => {
  const enrollmentId = await insertEnrollment();
  await rows(insertAlive, [enrollmentId]);

  // uma segunda viva é recusada no índice, e nada é gravado
  const total = await count();
  const failure = await failureOf(insertAlive, [enrollmentId]);
  expect(failure.code).toBe(UNIQUE_VIOLATION);
  expect(failure.constraint).toBe('payments_one_alive_idx');
  expect(await count()).toBe(total);

  // um período pode ter várias desfeitas ao lado de uma viva
  await rows(insertVoided, [enrollmentId]);
  await rows(insertVoided, [enrollmentId]);
  expect(await count()).toBe(total + 2);
  const alive = await rows<{ n: string }>('select count(*) as n from payments where enrollment_id = $1 and voided_at is null', [enrollmentId]);
  expect(Number(alive[0]!.n)).toBe(1);

  // um período só com desfeitas aceita a viva
  const onlyVoided = await insertEnrollment();
  await rows(insertVoided, [onlyVoided]);
  await rows(insertVoided, [onlyVoided]);
  const [revived] = await rows<{ id: string }>(insertAlive, [onlyVoided]);
  expect(revived!.id).toMatch(UUID);
});
