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
const CHECK_VIOLATION = '23514';
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const METHODS = ['cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer'] as const;

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
    return error as { code?: string; message: string };
  }
  throw new Error(`a instrução não falhou: ${text}`);
}

const columnsOf = async (table: string) =>
  rows<{ column_name: string; data_type: string }>(
    `select column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [table],
  );

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

const count = async (table: 'payments' | 'enrollments') => Number((await rows<{ n: string }>(`select count(*) as n from ${table}`))[0]!.n);

// tudo como texto, para a comparação não depender de como o driver lê cada tipo
const rowOf = async (table: 'payments' | 'enrollments', id: string) =>
  (await rows<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t where id = $1`, [id]))[0]?.row;

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

/** Um período de R$ 99,90 por SQL, de um aluno novo, cancelado ou não. */
async function insertEnrollment(cancelled = false) {
  const [row] = await rows<{ id: string }>(
    `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents, cancelled_at)
     values ($1, $2, '2026-10-07', '2026-11-06', 9990, case when $3 then now() end) returning id`,
    [await insertStudent(), await insertPlan(), cancelled],
  );
  return row!.id;
}

const insertPayment = 'insert into payments (enrollment_id, amount_cents, paid_at, method) values ($1, $2, $3, $4) returning id';

test('payments_table_has_no_status_due_date_student_id_and_defaults_and_no_cascade', async () => {
  const columns = await columnsOf('payments');
  const names = columns.map((column) => column.column_name);
  expect([...names].sort()).toEqual(['amount_cents', 'created_at', 'enrollment_id', 'id', 'method', 'paid_at', 'voided_at']);
  for (const absent of ['status', 'due_date', 'student_id', 'deleted_at', 'tenant_id']) expect(names, absent).not.toContain(absent);
  expect(columns.find((column) => column.column_name === 'paid_at')?.data_type).toBe('date');
  expect(columns.find((column) => column.column_name === 'amount_cents')?.data_type).toBe('integer');

  expect(await foreignKeysOf('payments')).toEqual([
    { columns: ['enrollment_id'], references: 'enrollments', referenced: ['id'], delete_rule: 'NO ACTION' },
  ]);

  // nenhuma restrição nem índice único além da chave primária
  const uniques = await rows<{ type: string }>(
    `select contype::text as type from pg_constraint where conrelid = 'payments'::regclass and contype in ('p', 'u')`,
  );
  expect(uniques.map((unique) => unique.type)).toEqual(['p']);
  const uniqueIndexes = await rows<{ primary: boolean }>(
    `select indisprimary as primary from pg_index where indrelid = 'payments'::regclass and indisunique`,
  );
  expect(uniqueIndexes.map((index) => index.primary)).toEqual([true]);

  const enrollmentId = await insertEnrollment();

  // duas linhas iguais no mesmo período convivem
  const total = await count('payments');
  const first = await rows<{ id: string }>(insertPayment, [enrollmentId, 3000, '2026-10-07', 'pix']);
  const second = await rows<{ id: string }>(insertPayment, [enrollmentId, 3000, '2026-10-07', 'pix']);
  expect(first[0]!.id).not.toBe(second[0]!.id);
  expect(await count('payments')).toBe(total + 2);

  // cada um dos quatro obrigatórios, ausente, é recusado por NOT NULL
  const full: Record<string, unknown> = {
    enrollment_id: enrollmentId,
    amount_cents: 5000,
    paid_at: '2026-10-07',
    method: 'pix',
  };
  const required = Object.keys(full);
  expect(required).toHaveLength(4);
  for (const missing of required) {
    const kept = required.filter((column) => column !== missing);
    const before = await count('payments');
    const failure = await failureOf(
      `insert into payments (${kept.join(', ')}) values (${kept.map((_, index) => `$${index + 1}`).join(', ')})`,
      kept.map((column) => full[column]),
    );
    expect(failure.code, missing).toBe(NOT_NULL_VIOLATION);
    expect(failure.message, missing).toContain(`"${missing}"`);
    expect(await count('payments'), missing).toBe(before);
  }

  // sem `id`: uuid v7, `created_at` do banco e `voided_at` nulo
  const [{ now: t0 }] = (await rows<{ now: Date }>('select clock_timestamp() as now')) as [{ now: Date }];
  const [row] = await rows<{ id: string; version: number; created_at: Date; voided_at: Date | null }>(
    `insert into payments (enrollment_id, amount_cents, paid_at, method) values ($1, $2, $3, $4)
     returning id, uuid_extract_version(id) as version, created_at, voided_at`,
    required.map((column) => full[column]),
  );
  const [{ now: t1 }] = (await rows<{ now: Date }>('select clock_timestamp() as now')) as [{ now: Date }];
  expect(row!.id).toMatch(UUID);
  expect(row!.version).toBe(7);
  expect(row!.created_at.getTime()).toBeGreaterThanOrEqual(t0.getTime());
  expect(row!.created_at.getTime()).toBeLessThanOrEqual(t1.getTime());
  expect(row!.voided_at).toBeNull();

  // o período não é apagado enquanto um pagamento aponta para ele: anulado ou não, em período cancelado ou não
  let cases = 0;
  for (const voided of [false, true]) {
    for (const cancelled of [false, true]) {
      const enrollment = await insertEnrollment(cancelled);
      const [payment] = await rows<{ id: string }>(
        `insert into payments (enrollment_id, amount_cents, paid_at, method, voided_at)
         values ($1, 5000, '2026-10-07', 'pix', case when $2 then now() end) returning id`,
        [enrollment, voided],
      );
      const before = { enrollment: await rowOf('enrollments', enrollment), payment: await rowOf('payments', payment!.id) };
      const label = `anulado: ${voided}, cancelado: ${cancelled}`;
      expect(JSON.parse(before.payment!).voided_at === null, label).toBe(!voided);

      const failure = await failureOf('delete from enrollments where id = $1', [enrollment]);
      expect(failure.code, label).toBe(FOREIGN_KEY_VIOLATION);
      expect({ enrollment: await rowOf('enrollments', enrollment), payment: await rowOf('payments', payment!.id) }, label).toEqual(before);
      cases += 1;
    }
  }
  expect(cases).toBe(4);
});

test('migration_0009_adds_only_payments_and_keeps_existing_tables_rows_and_extensions', async () => {
  // uma pasta de migrações que para na `0008`, num banco à parte do mesmo servidor
  const until0008 = mkdtempSync(join(tmpdir(), 'migrations-0008-'));
  cpSync(join(repoRoot, 'packages/database/migrations'), until0008, { recursive: true });
  const journalPath = join(until0008, 'meta/_journal.json');
  const fullJournal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
  const dropped = fullJournal.entries.filter((entry) => entry.idx > 8);
  expect(dropped.map((entry) => entry.tag)).toContain('0009_payments');
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

    migrate(url.toString());

    expect(await tablesOf()).toEqual([...tablesBefore, 'payments'].sort());
    expect(await query('select * from payments')).toEqual([]);
    // nenhuma extensão a mais
    expect(await extensionsOf()).toEqual(extensionsBefore);
    expect(await columnsOfTables(tablesBefore)).toEqual(columnsBefore);
    expect({ students: await rowsOf('students'), plans: await rowsOf('plans'), enrollments: await rowsOf('enrollments') }).toEqual(before);

    // o saldo de cada período de antes é o valor dele: nenhum pagamento
    const balances = await query<{ paid: string; price_cents: number }>(
      `select coalesce(sum(p.amount_cents) filter (where p.voided_at is null), 0) as paid, e.price_cents
         from enrollments e left join payments p on p.enrollment_id = e.id group by e.id, e.price_cents`,
    );
    expect(balances).toHaveLength(2);
    for (const balance of balances) expect(Number(balance.paid)).toBe(0);
    expect(balances.map((balance) => balance.price_cents)).toEqual([9990, 9990]);
  } finally {
    await other.end().catch(() => undefined);
    rmSync(until0008, { recursive: true, force: true });
  }
});

test('payments_checks_and_foreign_key_by_sql_fifteen_cases', async () => {
  const enrollmentId = await insertEnrollment();
  let cases = 0;

  const accepted = async (label: string, amountCents: number, method: string) => {
    cases += 1;
    const total = await count('payments');
    const [row] = await rows<{ id: string }>(insertPayment, [enrollmentId, amountCents, '2026-10-07', method]);
    expect(row!.id, label).toMatch(UUID);
    expect(await count('payments'), label).toBe(total + 1);
    const stored = JSON.parse((await rowOf('payments', row!.id))!) as { amount_cents: number; method: string };
    expect({ amountCents: stored.amount_cents, method: stored.method }, label).toEqual({ amountCents, method });
  };
  const refused = async (label: string, enrollment: string, amountCents: number, method: string, code: string) => {
    cases += 1;
    const total = await count('payments');
    const failure = await failureOf(insertPayment, [enrollment, amountCents, '2026-10-07', method]);
    expect(failure.code, label).toBe(code);
    expect(await count('payments'), label).toBe(total);
  };

  for (const amountCents of [0, -1]) {
    await refused(`amount_cents ${amountCents}`, enrollmentId, amountCents, 'pix', CHECK_VIOLATION);
  }
  for (const method of ['cheque', 'PIX', 'Pix', 'boleto', '']) {
    await refused(`method ${JSON.stringify(method)}`, enrollmentId, 5000, method, CHECK_VIOLATION);
  }
  await refused('enrollment_id que não existe', '0198a000-0000-7000-8000-000000000000', 5000, 'pix', FOREIGN_KEY_VIOLATION);

  for (const amountCents of [1, 9_999_999]) await accepted(`amount_cents ${amountCents}`, amountCents, 'pix');
  for (const method of METHODS) await accepted(`method ${method}`, 5000, method);

  expect(cases).toBe(15);
});
