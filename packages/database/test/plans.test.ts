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
const EXCLUSION_VIOLATION = '23P01';
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

const count = async (table: 'plans' | 'enrollments') => Number((await rows<{ n: string }>(`select count(*) as n from ${table}`))[0]!.n);

// tudo como texto, para a comparação não depender de como o driver lê cada tipo
const rowOf = async (table: 'plans' | 'enrollments' | 'students', id: string) =>
  (await rows<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t where id = $1`, [id]))[0]?.row;

let cpfs = 0;
async function insertStudent() {
  const [row] = await rows<{ id: string }>(
    `insert into students (name, cpf, birth_date, phone) values ('Aluna de Teste', $1, '2000-01-01', '11912345678') returning id`,
    [String(60_000_000_000 + ++cpfs)],
  );
  return row!.id;
}

async function insertPlan() {
  const [row] = await rows<{ id: string }>(`insert into plans (name, period, price_cents) values ('Mensal', 'monthly', 9990) returning id`);
  return row!.id;
}

test('plans_table_has_no_deleted_at_tenant_id_foreign_key_or_unique_name_and_defaults', async () => {
  const columns = (await columnsOf('plans')).map((column) => column.column_name);
  expect(columns.length).toBeGreaterThan(0);
  for (const absent of ['deleted_at', 'tenant_id']) expect(columns, absent).not.toContain(absent);

  expect(await foreignKeysOf('plans')).toEqual([]);

  // nenhuma restrição nem índice único além da chave primária
  const uniques = await rows<{ name: string; type: string }>(
    `select conname as name, contype::text as type from pg_constraint where conrelid = 'plans'::regclass and contype in ('p', 'u')`,
  );
  expect(uniques.map((unique) => unique.type)).toEqual(['p']);
  const uniqueIndexes = await rows<{ name: string; primary: boolean }>(
    `select indexrelid::regclass::text as name, indisprimary as primary from pg_index where indrelid = 'plans'::regclass and indisunique`,
  );
  expect(uniqueIndexes.map((index) => index.primary)).toEqual([true]);

  // duas linhas com o mesmo nome convivem
  const total = await count('plans');
  const first = await rows<{ id: string }>(`insert into plans (name, period, price_cents) values ('Homônimo', 'monthly', 9990) returning id`);
  const second = await rows<{ id: string }>(`insert into plans (name, period, price_cents) values ('Homônimo', 'monthly', 9990) returning id`);
  expect(first[0]!.id).not.toBe(second[0]!.id);
  expect(await count('plans')).toBe(total + 2);
  expect(Number((await rows<{ n: string }>(`select count(*) as n from plans where name = 'Homônimo'`))[0]!.n)).toBe(2);

  // só com `name`, `period` e `price_cents`, sem `id`
  const [row] = await rows<{ id: string; version: number; status: string; rules: string | null }>(
    `insert into plans (name, period, price_cents) values ('Trimestral', 'quarterly', 24990)
     returning id, uuid_extract_version(id) as version, status, rules`,
  );
  expect(row!.id).toMatch(UUID);
  expect(row!.version).toBe(7);
  expect(row!.status).toBe('active');
  expect(row!.rules).toBeNull();
});

test('plans_period_status_and_price_checks_eighteen_values', async () => {
  const insert = 'insert into plans (name, period, status, price_cents) values ($1, $2, $3, $4) returning id';
  let cases = 0;

  const accepted = async (label: string, period: string, status: string, priceCents: number, column: string, value: unknown) => {
    cases += 1;
    const total = await count('plans');
    const [row] = await rows<{ id: string }>(insert, [label, period, status, priceCents]);
    const [stored] = await rows<Record<string, unknown>>(`select ${column} as value from plans where id = $1`, [row!.id]);
    expect(stored!.value, label).toBe(value);
    expect(await count('plans'), label).toBe(total + 1);
  };
  const refused = async (label: string, period: string, status: string, priceCents: number | null, code: string) => {
    cases += 1;
    const total = await count('plans');
    const failure = await failureOf(insert, [label, period, status, priceCents]);
    expect(failure.code, label).toBe(code);
    expect(await count('plans'), label).toBe(total);
  };

  for (const period of ['monthly', 'quarterly', 'semiannual', 'annual']) {
    await accepted(`period ${period}`, period, 'active', 9990, 'period', period);
  }
  for (const period of ['weekly', 'Monthly', 'mensal', '']) {
    await refused(`period ${JSON.stringify(period)}`, period, 'active', 9990, CHECK_VIOLATION);
  }

  for (const status of ['active', 'inactive']) {
    await accepted(`status ${status}`, 'monthly', status, 9990, 'status', status);
  }
  for (const status of ['suspended', 'Active', 'ativo', '']) {
    await refused(`status ${JSON.stringify(status)}`, 'monthly', status, 9990, CHECK_VIOLATION);
  }

  for (const priceCents of [0, 9_999_999]) {
    await accepted(`price_cents ${priceCents}`, 'monthly', 'active', priceCents, 'price_cents', priceCents);
  }
  await refused('price_cents -1', 'monthly', 'active', -1, CHECK_VIOLATION);
  await refused('price_cents null', 'monthly', 'active', null, NOT_NULL_VIOLATION);

  expect(cases).toBe(18);

  // as mesmas recusas no UPDATE de uma linha que existe, que fica como estava
  const id = await insertPlan();
  const before = await rowOf('plans', id);
  for (const [column, value, code] of [
    ['period', 'weekly', CHECK_VIOLATION],
    ['status', 'suspended', CHECK_VIOLATION],
    ['price_cents', -1, CHECK_VIOLATION],
    ['price_cents', null, NOT_NULL_VIOLATION],
  ] as const) {
    const failure = await failureOf(`update plans set ${column} = $2 where id = $1`, [id, value]);
    expect(failure.code, `update ${column} ${String(value)}`).toBe(code);
  }
  expect(await rowOf('plans', id)).toBe(before);
});

test('enrollments_table_has_no_status_column_two_foreign_keys_without_cascade_and_defaults', async () => {
  const columns = await columnsOf('enrollments');
  const names = columns.map((column) => column.column_name);
  expect(names.length).toBeGreaterThan(0);
  for (const absent of ['status', 'deleted_at', 'tenant_id']) expect(names, absent).not.toContain(absent);
  for (const day of ['starts_at', 'ends_at']) {
    expect(columns.find((column) => column.column_name === day)?.data_type, day).toBe('date');
  }

  expect(await foreignKeysOf('enrollments')).toEqual([
    { columns: ['plan_id'], references: 'plans', referenced: ['id'], delete_rule: 'NO ACTION' },
    { columns: ['student_id'], references: 'students', referenced: ['id'], delete_rule: 'NO ACTION' },
  ]);

  const studentId = await insertStudent();
  const planId = await insertPlan();

  // cada um dos cinco obrigatórios, ausente, é recusado por NOT NULL
  const full: Record<string, unknown> = {
    student_id: studentId,
    plan_id: planId,
    starts_at: '2026-10-07',
    ends_at: '2026-11-06',
    price_cents: 9990,
  };
  const required = Object.keys(full);
  expect(required).toHaveLength(5);
  for (const missing of required) {
    const kept = required.filter((column) => column !== missing);
    const total = await count('enrollments');
    const failure = await failureOf(
      `insert into enrollments (${kept.join(', ')}) values (${kept.map((_, index) => `$${index + 1}`).join(', ')})`,
      kept.map((column) => full[column]),
    );
    expect(failure.code, missing).toBe(NOT_NULL_VIOLATION);
    expect(failure.message, missing).toContain(`"${missing}"`);
    expect(await count('enrollments'), missing).toBe(total);
  }

  // sem `id`: uuid v7, `created_at` do banco e `cancelled_at` nulo
  const [{ now: t0 }] = (await rows<{ now: Date }>('select clock_timestamp() as now')) as [{ now: Date }];
  const [row] = await rows<{ id: string; version: number; created_at: Date; cancelled_at: Date | null }>(
    `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents) values ($1, $2, $3, $4, $5)
     returning id, uuid_extract_version(id) as version, created_at, cancelled_at`,
    required.map((column) => full[column]),
  );
  const [{ now: t1 }] = (await rows<{ now: Date }>('select clock_timestamp() as now')) as [{ now: Date }];
  expect(row!.id).toMatch(UUID);
  expect(row!.version).toBe(7);
  expect(row!.created_at.getTime()).toBeGreaterThanOrEqual(t0.getTime());
  expect(row!.created_at.getTime()).toBeLessThanOrEqual(t1.getTime());
  expect(row!.cancelled_at).toBeNull();

  // nem o aluno nem o plano são apagados enquanto a matrícula aponta para eles, cancelada ou não
  for (const cancelled of [false, true]) {
    if (cancelled) await client.query('update enrollments set cancelled_at = now() where id = $1', [row!.id]);
    const before = {
      student: await rowOf('students', studentId),
      plan: await rowOf('plans', planId),
      enrollment: await rowOf('enrollments', row!.id),
    };
    expect(before.student && before.plan && before.enrollment).toBeTruthy();
    expect(JSON.parse(before.enrollment!).cancelled_at === null, `cancelada: ${cancelled}`).toBe(!cancelled);

    const studentDeletion = await failureOf('delete from students where id = $1', [studentId]);
    expect(studentDeletion.code, `aluno, cancelada: ${cancelled}`).toBe(FOREIGN_KEY_VIOLATION);
    const planDeletion = await failureOf('delete from plans where id = $1', [planId]);
    expect(planDeletion.code, `plano, cancelada: ${cancelled}`).toBe(FOREIGN_KEY_VIOLATION);

    expect({
      student: await rowOf('students', studentId),
      plan: await rowOf('plans', planId),
      enrollment: await rowOf('enrollments', row!.id),
    }).toEqual(before);
  }
});

test('migration_0008_adds_plans_enrollments_and_btree_gist_and_keeps_existing_tables', async () => {
  // uma pasta de migrações que para na `0007`, num banco à parte do mesmo servidor
  const until0007 = mkdtempSync(join(tmpdir(), 'migrations-0007-'));
  cpSync(join(repoRoot, 'packages/database/migrations'), until0007, { recursive: true });
  const journalPath = join(until0007, 'meta/_journal.json');
  const fullJournal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
  const dropped = fullJournal.entries.filter((entry) => entry.idx > 7);
  expect(dropped.map((entry) => entry.tag)).toContain('0008_plans_enrollments');
  for (const entry of dropped) rmSync(join(until0007, `${entry.tag}.sql`));
  const journal = { ...fullJournal, entries: fullJournal.entries.filter((entry) => entry.idx <= 7) };
  expect(journal.entries).toHaveLength(8);
  writeFileSync(journalPath, JSON.stringify(journal));

  await client.query('create database before_0008');
  const url = new URL(container.getConnectionUri());
  url.pathname = '/before_0008';
  const other = new pg.Client({ connectionString: url.toString() });
  try {
    migrate(url.toString(), until0007);
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
    expect(tablesBefore).not.toContain('plans');
    expect(tablesBefore).not.toContain('enrollments');
    expect(await extensionsOf()).toContain('pg_trgm');
    expect(await extensionsOf()).not.toContain('btree_gist');

    // um aluno, um funcionário e uma foto, antes da `0008`
    await other.query(
      `with s as (insert into students (name, cpf, birth_date, phone) values ('Aluna Um', '39200000001', '2015-01-01', '11912345678') returning id)
       insert into photos (student_id, version, is_current) select id, 1, true from s`,
    );
    await other.query(
      `insert into staff (name, cpf, position, hired_at, phone) values ('Funcionária Um', '39200000002', 'Recepcionista', '2020-01-01', '11912345678')`,
    );
    const columnsBefore = await columnsOfTables(tablesBefore);
    const before = { students: await rowsOf('students'), staff: await rowsOf('staff'), photos: await rowsOf('photos') };
    expect(before.students).toHaveLength(1);
    expect(before.staff).toHaveLength(1);
    expect(before.photos).toHaveLength(1);

    // só até a `0008`: as migrações seguintes não são o que este teste mede
    writeFileSync(journalPath, JSON.stringify({ ...fullJournal, entries: fullJournal.entries.filter((entry) => entry.idx <= 8) }));
    cpSync(join(repoRoot, 'packages/database/migrations/0008_plans_enrollments.sql'), join(until0007, '0008_plans_enrollments.sql'));
    migrate(url.toString(), until0007);

    expect(await tablesOf()).toEqual([...tablesBefore, 'enrollments', 'plans'].sort());
    // nenhum plano de fábrica
    expect(await query('select * from plans')).toEqual([]);
    expect(await query('select * from enrollments')).toEqual([]);

    const extensions = await extensionsOf();
    expect(extensions).toContain('btree_gist');
    expect(extensions).toContain('pg_trgm');

    expect(await columnsOfTables(tablesBefore)).toEqual(columnsBefore);
    expect({ students: await rowsOf('students'), staff: await rowsOf('staff'), photos: await rowsOf('photos') }).toEqual(before);

    const constraint = await query<{ conname: string; contype: string }>(
      `select conname, contype::text as contype from pg_constraint
        where conrelid = 'enrollments'::regclass and conname = 'enrollments_no_overlap'`,
    );
    expect(constraint).toEqual([{ conname: 'enrollments_no_overlap', contype: 'x' }]);
  } finally {
    await other.end().catch(() => undefined);
    rmSync(until0007, { recursive: true, force: true });
  }
});

/** Uma linha de matrícula por SQL, sem passar por rota nenhuma. */
async function insertEnrollment(studentId: string, planId: string, startsAt: string, endsAt: string, cancelled = false) {
  const [row] = await rows<{ id: string }>(
    `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents, cancelled_at)
     values ($1, $2, $3, $4, 9990, case when $5 then now() end) returning id`,
    [studentId, planId, startsAt, endsAt, cancelled],
  );
  return row!.id;
}

test('enrollments_no_overlap_eleven_cases_by_sql', async () => {
  const planId = await insertPlan();
  const insert = 'insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents) values ($1, $2, $3, $4, 9990)';
  let cases = 0;
  /** Um aluno com a linha A, não cancelada, de 2026-10-07 a 2026-11-06. */
  const studentWithA = async () => {
    const studentId = await insertStudent();
    return { studentId, a: await insertEnrollment(studentId, planId, '2026-10-07', '2026-11-06') };
  };
  const refusedByExclusion = async (label: string, statement: string, values: unknown[]) => {
    const total = await count('enrollments');
    const failure = (await failureOf(statement, values)) as { code?: string; constraint?: string };
    expect(failure.code, label).toBe(EXCLUSION_VIOLATION);
    expect(failure.constraint, label).toBe('enrollments_no_overlap');
    expect(await count('enrollments'), label).toBe(total);
    cases += 1;
  };

  // cinco períodos do mesmo aluno com ao menos um dia em comum com A, recusados no INSERT
  const overlapping: Array<[label: string, startsAt: string, endsAt: string]> = [
    ['o mesmo período', '2026-10-07', '2026-11-06'],
    ['um dia em comum, o último de A', '2026-11-06', '2026-12-05'],
    ['um dia em comum, o primeiro de A', '2026-09-08', '2026-10-07'],
    ['contido em A', '2026-10-10', '2026-10-20'],
    ['contém A', '2026-10-01', '2026-12-31'],
  ];
  expect(overlapping).toHaveLength(5);
  for (const [label, startsAt, endsAt] of overlapping) {
    const { studentId, a } = await studentWithA();
    const before = await rowOf('enrollments', a);

    await refusedByExclusion(label, insert, [studentId, planId, startsAt, endsAt]);

    expect(await rowOf('enrollments', a), label).toBe(before);
  }

  // quatro aceitos: colado depois, colado antes, o mesmo período de outro aluno e o mesmo período com A cancelada
  const accepted = async (label: string, studentId: string, startsAt: string, endsAt: string) => {
    const total = await count('enrollments');
    await client.query(insert, [studentId, planId, startsAt, endsAt]);
    expect(await count('enrollments'), label).toBe(total + 1);
    cases += 1;
  };
  await accepted('colado depois de A', (await studentWithA()).studentId, '2026-11-07', '2026-12-06');
  await accepted('colado antes de A', (await studentWithA()).studentId, '2026-09-07', '2026-10-06');
  await studentWithA();
  await accepted('o mesmo período de outro aluno', await insertStudent(), '2026-10-07', '2026-11-06');
  const withCancelledA = await insertStudent();
  await insertEnrollment(withCancelledA, planId, '2026-10-07', '2026-11-06', true);
  await accepted('o mesmo período quando A está cancelada', withCancelledA, '2026-10-07', '2026-11-06');

  // desfazer o cancelamento de uma linha sobreposta a uma viva
  const revived = await insertStudent();
  const cancelledRow = await insertEnrollment(revived, planId, '2026-10-07', '2026-11-06', true);
  await insertEnrollment(revived, planId, '2026-10-07', '2026-11-06');
  const cancelledBefore = await rowOf('enrollments', cancelledRow);
  await refusedByExclusion('UPDATE que limpa cancelled_at', 'update enrollments set cancelled_at = null where id = $1', [cancelledRow]);
  expect(await rowOf('enrollments', cancelledRow)).toBe(cancelledBefore);

  // recuar em um dia o início da linha colada a A
  const { studentId: moved } = await studentWithA();
  const glued = await insertEnrollment(moved, planId, '2026-11-07', '2026-12-06');
  const gluedBefore = await rowOf('enrollments', glued);
  await refusedByExclusion('UPDATE que recua starts_at em um dia', `update enrollments set starts_at = '2026-11-06' where id = $1`, [glued]);
  expect(await rowOf('enrollments', glued)).toBe(gluedBefore);

  expect(cases).toBe(11);
});

test('enrollments_ends_at_and_price_checks', async () => {
  const planId = await insertPlan();
  const insert = 'insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents) values ($1, $2, $3, $4, $5) returning id';

  const refused: Array<[label: string, startsAt: string, endsAt: string, priceCents: number]> = [
    ['ends_at um dia antes de starts_at', '2026-10-07', '2026-10-06', 9990],
    ['price_cents igual a -1', '2026-10-07', '2026-11-06', -1],
  ];
  for (const [label, startsAt, endsAt, priceCents] of refused) {
    const total = await count('enrollments');
    const failure = await failureOf(insert, [await insertStudent(), planId, startsAt, endsAt, priceCents]);
    expect(failure.code, label).toBe(CHECK_VIOLATION);
    expect(await count('enrollments'), label).toBe(total);
  }

  // um período de um dia só, de graça
  const total = await count('enrollments');
  const [row] = await rows<{ id: string }>(insert, [await insertStudent(), planId, '2026-10-07', '2026-10-07', 0]);
  expect(await count('enrollments')).toBe(total + 1);
  expect(JSON.parse((await rowOf('enrollments', row!.id))!)).toMatchObject({ starts_at: '2026-10-07', ends_at: '2026-10-07', price_cents: 0 });

  // as mesmas duas recusas no UPDATE de uma linha que existe, que fica como estava
  const before = await rowOf('enrollments', row!.id);
  for (const [column, value] of [
    ['ends_at', '2026-10-06'],
    ['price_cents', -1],
  ] as const) {
    const failure = await failureOf(`update enrollments set ${column} = $2 where id = $1`, [row!.id, value]);
    expect(failure.code, `update ${column}`).toBe(CHECK_VIOLATION);
  }
  expect(await rowOf('enrollments', row!.id)).toBe(before);
});
