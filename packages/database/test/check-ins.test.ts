import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const NOBODY = '0198a000-0000-7000-8000-000000000000';

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

/** As linhas de `check_ins`, inteiras, na ordem do `id`. */
const checkInRows = async () => (await rows<{ row: string }>('select to_jsonb(c)::text as row from check_ins c order by id')).map((row) => row.row);

let cpfs = 0;
async function insertStudent() {
  const [row] = await rows<{ id: string }>(
    `insert into students (name, cpf, birth_date, phone) values ('Aluna de Teste', $1, '2000-01-01', '11912345678') returning id`,
    [String(71_000_000_000 + ++cpfs)],
  );
  return row!.id;
}

let emails = 0;
async function insertUser() {
  const [row] = await rows<{ id: string }>('insert into users (name, email, role) values ($1, $2, $3) returning id', [
    'Recepção de Teste',
    `recepcao${++emails}@exemplo.com`,
    'reception',
  ]);
  return row!.id;
}

const insertCheckIn = 'insert into check_ins (student_id, day, checked_in_by) values ($1, $2, $3) returning id';

test('check_ins_table_has_five_columns_two_foreign_keys_without_cascade_and_defaults', async () => {
  const columns = await rows<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null; is_generated: string; generation_expression: string | null }>(
    `select column_name, data_type, is_nullable, column_default, is_generated, generation_expression from information_schema.columns
      where table_schema = 'public' and table_name = 'check_ins' order by ordinal_position`,
  );
  expect(columns.map((column) => [column.column_name, column.data_type, column.is_nullable])).toEqual([
    ['id', 'uuid', 'NO'],
    ['student_id', 'uuid', 'NO'],
    ['day', 'date', 'NO'],
    ['checked_in_at', 'timestamp with time zone', 'NO'],
    ['checked_in_by', 'uuid', 'NO'],
  ]);
  const names = columns.map((column) => column.column_name);
  for (const absent of ['status', 'voided_at', 'tenant_id']) expect(names, absent).not.toContain(absent);

  // `day` não tem padrão nem expressão: quem o grava é a API
  const day = columns.find((column) => column.column_name === 'day')!;
  expect(day.column_default).toBeNull();
  expect(day.is_generated).toBe('NEVER');
  expect(day.generation_expression).toBeNull();
  expect(columns.map((column) => [column.column_name, column.is_generated])).toEqual(names.map((name) => [name, 'NEVER']));
  // `student_id` e `checked_in_by` também não têm padrão
  expect(columns.find((column) => column.column_name === 'student_id')!.column_default).toBeNull();
  expect(columns.find((column) => column.column_name === 'checked_in_by')!.column_default).toBeNull();

  // as duas chaves estrangeiras, sem cascata
  const foreignKeys = await rows<{ columns: string[]; references: string; referenced: string[]; delete_rule: string }>(
    `select (select array_agg(a.attname::text) from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) as columns,
            c.confrelid::regclass::text as references,
            (select array_agg(a.attname::text) from pg_attribute a where a.attrelid = c.confrelid and a.attnum = any (c.confkey)) as referenced,
            case c.confdeltype when 'a' then 'NO ACTION' when 'c' then 'CASCADE' when 'n' then 'SET NULL'
                               when 'd' then 'SET DEFAULT' when 'r' then 'RESTRICT' end as delete_rule
       from pg_constraint c
      where c.conrelid = 'check_ins'::regclass and c.contype = 'f'
      order by 1`,
  );
  expect(foreignKeys).toEqual([
    { columns: ['checked_in_by'], references: 'users', referenced: ['id'], delete_rule: 'NO ACTION' },
    { columns: ['student_id'], references: 'students', referenced: ['id'], delete_rule: 'NO ACTION' },
  ]);

  // sem `id` nem `checked_in_at`: uuid v7 e o instante do banco; `day` fica o que foi enviado
  const [studentId, userId] = [await insertStudent(), await insertUser()];
  const [{ now: t0 }] = (await rows<{ now: Date }>('select clock_timestamp() as now')) as [{ now: Date }];
  const [row] = await rows<{ id: string; version: number; day: string; checked_in_at: Date }>(
    `insert into check_ins (student_id, day, checked_in_by) values ($1, '2026-10-08', $2)
     returning id, uuid_extract_version(id) as version, day::text as day, checked_in_at`,
    [studentId, userId],
  );
  const [{ now: t1 }] = (await rows<{ now: Date }>('select clock_timestamp() as now')) as [{ now: Date }];
  expect(row!.id).toMatch(UUID);
  expect(row!.version).toBe(7);
  expect(row!.day).toBe('2026-10-08');
  expect(row!.checked_in_at.getTime()).toBeGreaterThanOrEqual(t0.getTime());
  expect(row!.checked_in_at.getTime()).toBeLessThanOrEqual(t1.getTime());

  // sem `day`, o banco recusa: não há padrão que o derive do relógio
  const failure = await failureOf('insert into check_ins (student_id, checked_in_by) values ($1, $2)', [await insertStudent(), userId]);
  expect(failure.code).toBe('23502');
});

test('check_ins_one_per_day_idx_is_the_only_unique_index_besides_the_key_and_second_row_same_day_fails_23505', async () => {
  const indexes = await rows<{ name: string; primary: boolean; definition: string; predicate: string | null }>(
    `select c.relname as name, i.indisprimary as primary, pg_get_indexdef(i.indexrelid) as definition,
            pg_get_expr(i.indpred, i.indrelid) as predicate
       from pg_index i join pg_class c on c.oid = i.indexrelid
      where i.indrelid = 'check_ins'::regclass and i.indisunique order by i.indisprimary desc, c.relname`,
  );
  expect(indexes.map((index) => [index.name, index.primary])).toEqual([
    ['check_ins_pkey', true],
    ['check_ins_one_per_day_idx', false],
  ]);
  const unique = indexes[1]!;
  expect(unique.definition).toContain('UNIQUE INDEX');
  expect(unique.definition).toMatch(/\(student_id, day\)/);
  expect(unique.definition).not.toContain('WHERE');
  expect(unique.predicate).toBeNull();

  // nenhuma restrição de unicidade na tabela, só o índice
  const constraints = await rows<{ type: string }>(
    `select contype::text as type from pg_constraint where conrelid = 'check_ins'::regclass and contype in ('p', 'u')`,
  );
  expect(constraints.map((constraint) => constraint.type)).toEqual(['p']);

  const [ana, bia, userId] = [await insertStudent(), await insertStudent(), await insertUser()];
  await rows(insertCheckIn, [ana, '2026-10-07', userId]);

  // a segunda do mesmo aluno no mesmo dia é recusada no índice, e nada é gravado
  const before = await checkInRows();
  const failure = await failureOf(insertCheckIn, [ana, '2026-10-07', await insertUser()]);
  expect(failure.code).toBe(UNIQUE_VIOLATION);
  expect(failure.constraint).toBe('check_ins_one_per_day_idx');
  expect(await checkInRows()).toEqual(before);

  // o mesmo aluno em outro dia, e outro aluno no mesmo dia, entram
  const [otherDay] = await rows<{ id: string }>(insertCheckIn, [ana, '2026-10-08', userId]);
  const [otherStudent] = await rows<{ id: string }>(insertCheckIn, [bia, '2026-10-07', userId]);
  expect(otherDay!.id).toMatch(UUID);
  expect(otherStudent!.id).toMatch(UUID);
  expect(await checkInRows()).toHaveLength(before.length + 2);
});

test('unknown_student_or_user_fails_23503_and_deleting_an_owner_with_check_ins_fails_23503', async () => {
  const [studentId, userId] = [await insertStudent(), await insertUser()];

  // aluno ou usuário que não existe: recusado, e nada é gravado
  const before = await checkInRows();
  const unknownStudent = await failureOf(insertCheckIn, [NOBODY, '2026-10-07', userId]);
  expect(unknownStudent.code).toBe(FOREIGN_KEY_VIOLATION);
  expect(unknownStudent.constraint).toBe('check_ins_student_id_students_id_fk');
  const unknownUser = await failureOf(insertCheckIn, [studentId, '2026-10-07', NOBODY]);
  expect(unknownUser.code).toBe(FOREIGN_KEY_VIOLATION);
  expect(unknownUser.constraint).toBe('check_ins_checked_in_by_users_id_fk');
  expect(await checkInRows()).toEqual(before);

  // com uma presença, nem o aluno nem o usuário podem ser apagados, e a presença fica idêntica
  const [{ id }] = (await rows<{ id: string }>(insertCheckIn, [studentId, '2026-10-07', userId])) as [{ id: string }];
  const presence = await rows<{ row: string }>('select to_jsonb(c)::text as row from check_ins c where id = $1', [id]);
  const deleteStudent = await failureOf('delete from students where id = $1', [studentId]);
  expect(deleteStudent.code).toBe(FOREIGN_KEY_VIOLATION);
  const deleteUser = await failureOf('delete from users where id = $1', [userId]);
  expect(deleteUser.code).toBe(FOREIGN_KEY_VIOLATION);
  expect(await rows('select to_jsonb(c)::text as row from check_ins c where id = $1', [id])).toEqual(presence);
  expect(await rows('select id from students where id = $1', [studentId])).toHaveLength(1);
  expect(await rows('select id from users where id = $1', [userId])).toHaveLength(1);
});

test('migration_0010_adds_only_check_ins_and_keeps_rows_and_extensions', async () => {
  // a `0010` é a décima primeira entrada do diário
  const migrations = join(repoRoot, 'packages/database/migrations');
  const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
  expect(journal.entries[10]).toMatchObject({ idx: 10, tag: '0010_check_ins' });

  // uma pasta de migrações que para na `0009`, num banco à parte do mesmo servidor
  const until0009 = mkdtempSync(join(tmpdir(), 'migrations-0009-'));
  cpSync(migrations, until0009, { recursive: true });
  const journalPath = join(until0009, 'meta/_journal.json');
  const dropped = journal.entries.filter((entry) => entry.idx > 9);
  expect(dropped.map((entry) => entry.tag)).toContain('0010_check_ins');
  for (const entry of dropped) rmSync(join(until0009, `${entry.tag}.sql`));
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx <= 9) }));

  await client.query('create database before_0010');
  const url = new URL(container.getConnectionUri());
  url.pathname = '/before_0010';
  const other = new pg.Client({ connectionString: url.toString() });
  try {
    migrate(url.toString(), until0009);
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
    expect(tablesBefore).toContain('payments');
    expect(tablesBefore).not.toContain('check_ins');

    // um usuário, um aluno, um plano, um período e uma confirmação de pagamento, antes da `0010`
    await other.query(`insert into users (name, email, role) values ('Recepção Um', 'recepcao.um@exemplo.com', 'reception')`);
    await other.query(`insert into students (name, cpf, birth_date, phone) values ('Aluna Um', '39400000001', '2015-01-01', '11912345678')`);
    await other.query(`insert into plans (name, period, price_cents) values ('Mensal', 'monthly', 9990)`);
    await other.query(
      `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents)
       select s.id, p.id, '2026-10-07', '2026-11-06', 9990 from students s, plans p`,
    );
    await other.query('insert into payments (enrollment_id) select id from enrollments');
    const columnsBefore = await columnsOfTables(tablesBefore);
    const extensionsBefore = await extensionsOf();
    const owned = ['users', 'students', 'plans', 'enrollments', 'payments'];
    const snapshot = async () => {
      const tables: Record<string, string[]> = {};
      for (const table of owned) tables[table] = await rowsOf(table);
      return tables;
    };
    const before = await snapshot();
    for (const table of owned) expect(before[table], table).toHaveLength(1);

    const onlyCheckInsAdded = async () => {
      expect(await tablesOf()).toEqual([...tablesBefore, 'check_ins'].sort());
      expect(await query('select * from check_ins')).toEqual([]);
      expect(await extensionsOf()).toEqual(extensionsBefore);
      expect(await columnsOfTables(tablesBefore)).toEqual(columnsBefore);
      expect(await snapshot()).toEqual(before);
    };
    // só até a `0010`: as migrações seguintes não são o que este teste mede
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx <= 10) }));
    cpSync(join(migrations, '0010_check_ins.sql'), join(until0009, '0010_check_ins.sql'));
    migrate(url.toString(), until0009);
    await onlyCheckInsAdded();
    // uma segunda execução não muda nada
    migrate(url.toString(), until0009);
    await onlyCheckInsAdded();
  } finally {
    await other.end().catch(() => undefined);
    rmSync(until0009, { recursive: true, force: true });
  }
});
