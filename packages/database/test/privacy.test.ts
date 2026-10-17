import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const migrations = join(repoRoot, 'packages/database/migrations');
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';
const ANONYMIZED = 'Titular anonimizado';

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
  throw new Error(`a instrução não falhou: ${text} ${JSON.stringify(values)}`);
}

let cpfs = 0;
const nextCpf = () => String(81_000_000_000 + ++cpfs);

/** Insere uma linha com as colunas dadas e devolve o `id`. */
async function insert(table: string, columns: Record<string, unknown>) {
  const names = Object.keys(columns);
  const marks = names.map((_, index) => `$${index + 1}`).join(', ');
  const [row] = await rows<{ id: string }>(
    `insert into ${table} (${names.join(', ')}) values (${marks}) returning id`,
    Object.values(columns),
  );
  return row!.id;
}

/** O aluno anonimizado que os dois `CHECK` aceitam: só a marca, o nome literal e a situação. */
const anonymizedStudent = () => ({
  name: ANONYMIZED,
  status: 'inactive',
  inactivated_at: '2026-01-01T12:00:00Z',
  anonymized_at: '2026-10-17T12:00:00Z',
});

/** O aluno identificado só com os obrigatórios. */
const identifiedStudent = () => ({ name: 'Aluna de Teste', cpf: nextCpf(), birth_date: '2000-01-01', phone: '11912345678' });

const STUDENT_PERSONAL = {
  cpf: () => nextCpf(),
  birth_date: () => '2000-01-01',
  sex: () => 'female',
  email: () => 'aluna@exemplo.com',
  phone: () => '11912345678',
  address: () => 'Rua das Acácias, 120',
  emergency_contact_name: () => 'Maria da Penha',
  emergency_contact_phone: () => '1134567890',
  health_notes_enc: () => 'v1.iv.texto.tag',
} as const;

let emails = 0;
const insertUser = () =>
  insert('users', { name: 'Usuária de Teste', email: `usuaria${++emails}@exemplo.com`, role: 'reception' });

const anonymizedStaff = () => ({ name: ANONYMIZED, status: 'inactive', anonymized_at: '2026-10-17T12:00:00Z' });
const identifiedStaff = () => ({
  name: 'Funcionária de Teste',
  cpf: nextCpf(),
  position: 'Recepcionista',
  hired_at: '2024-03-01',
  phone: '11912345678',
});

const STAFF_PERSONAL = {
  cpf: () => nextCpf(),
  position: () => 'Recepcionista',
  department: () => 'Atendimento',
  hired_at: () => '2024-03-01',
  phone: () => '11912345678',
  email: () => 'funcionaria@exemplo.com',
} as const;

test('students_anonymized_and_identified_checks_one_case_per_field', async () => {
  // a forma da door 1: as duas marcas anuláveis e os três obrigatórios que deixam de ser
  const columns = await rows<{ column_name: string; data_type: string; is_nullable: string }>(
    `select column_name, data_type, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'students' and column_name in ('anonymized_at', 'inactivated_at', 'cpf', 'birth_date', 'phone')
      order by column_name`,
  );
  expect(columns).toEqual([
    { column_name: 'anonymized_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { column_name: 'birth_date', data_type: 'date', is_nullable: 'YES' },
    { column_name: 'cpf', data_type: 'text', is_nullable: 'YES' },
    { column_name: 'inactivated_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { column_name: 'phone', data_type: 'text', is_nullable: 'YES' },
  ]);

  // a anonimizada limpa entra
  expect(await insert('students', anonymizedStudent())).toBeTruthy();

  // um campo pessoal preenchido de cada vez: os nove
  for (const [field, value] of Object.entries(STUDENT_PERSONAL)) {
    const failure = await failureOf(
      `insert into students (name, status, inactivated_at, anonymized_at, ${field}) values ($1, 'inactive', now(), now(), $2)`,
      [ANONYMIZED, value()],
    );
    expect(failure.code, field).toBe(CHECK_VIOLATION);
    expect(failure.constraint, field).toBe('students_anonymized_clean');
  }
  expect(Object.keys(STUDENT_PERSONAL)).toHaveLength(9);

  // o nome, a situação e o instante da inativação
  const otherName = await failureOf(
    `insert into students (name, status, inactivated_at, anonymized_at) values ('Aluna Anônima', 'inactive', now(), now())`,
  );
  expect(otherName.code).toBe(CHECK_VIOLATION);
  expect(otherName.constraint).toBe('students_anonymized_clean');
  const active = await failureOf(`insert into students (name, status, anonymized_at) values ($1, 'active', now())`, [ANONYMIZED]);
  expect(active.code).toBe(CHECK_VIOLATION);
  const withoutInactivatedAt = await failureOf(
    `insert into students (name, status, anonymized_at) values ($1, 'inactive', now())`,
    [ANONYMIZED],
  );
  expect(withoutInactivatedAt.code).toBe(CHECK_VIOLATION);

  // a identificada sem um dos três obrigatórios
  for (const field of ['cpf', 'birth_date', 'phone']) {
    const values: Record<string, unknown> = identifiedStudent();
    delete values[field];
    const names = Object.keys(values);
    const failure = await failureOf(
      `insert into students (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(values),
    );
    expect(failure.code, field).toBe(CHECK_VIOLATION);
    expect(failure.constraint, field).toBe('students_identified_complete');
  }

  // duas anonimizadas sem CPF coexistem; dois identificados com o mesmo CPF, não
  const first = await insert('students', anonymizedStudent());
  const second = await insert('students', anonymizedStudent());
  expect(first).not.toBe(second);
  const cpf = nextCpf();
  await insert('students', { ...identifiedStudent(), cpf });
  const duplicate = await failureOf(
    `insert into students (name, cpf, birth_date, phone) values ('Outra Aluna', $1, '2000-01-01', '11912345678')`,
    [cpf],
  );
  expect(duplicate.code).toBe(UNIQUE_VIOLATION);
  expect(duplicate.constraint).toBe('students_cpf_unique');
});

test('staff_anonymized_and_identified_checks_one_case_per_field', async () => {
  const columns = await rows<{ column_name: string; data_type: string; is_nullable: string }>(
    `select column_name, data_type, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'staff' and column_name in ('anonymized_at', 'cpf', 'position', 'hired_at', 'phone')
      order by column_name`,
  );
  expect(columns).toEqual([
    { column_name: 'anonymized_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { column_name: 'cpf', data_type: 'text', is_nullable: 'YES' },
    { column_name: 'hired_at', data_type: 'date', is_nullable: 'YES' },
    { column_name: 'phone', data_type: 'text', is_nullable: 'YES' },
    { column_name: 'position', data_type: 'text', is_nullable: 'YES' },
  ]);

  expect(await insert('staff', anonymizedStaff())).toBeTruthy();

  // os seis campos pessoais, o nome, a situação e o usuário vinculado, um de cada vez
  const cases: Array<[string, Record<string, unknown>]> = [
    ...Object.entries(STAFF_PERSONAL).map(([field, value]): [string, Record<string, unknown>] => [field, { [field]: value() }]),
    ['name', { name: 'Funcionária Anônima' }],
    ['status', { status: 'active' }],
    ['user_id', { user_id: await insertUser() }],
  ];
  expect(cases).toHaveLength(9);
  for (const [label, change] of cases) {
    const values = { ...anonymizedStaff(), ...change };
    const names = Object.keys(values);
    const failure = await failureOf(
      `insert into staff (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(values),
    );
    expect(failure.code, label).toBe(CHECK_VIOLATION);
    expect(failure.constraint, label).toBe('staff_anonymized_clean');
  }

  // a identificada sem um dos quatro obrigatórios
  for (const field of ['cpf', 'position', 'hired_at', 'phone']) {
    const values: Record<string, unknown> = identifiedStaff();
    delete values[field];
    const names = Object.keys(values);
    const failure = await failureOf(
      `insert into staff (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(values),
    );
    expect(failure.code, field).toBe(CHECK_VIOLATION);
    expect(failure.constraint, field).toBe('staff_identified_complete');
  }

  // duas anonimizadas sem CPF coexistem
  const first = await insert('staff', anonymizedStaff());
  const second = await insert('staff', anonymizedStaff());
  expect(first).not.toBe(second);
});

test('inactivated_at_present_iff_status_inactive', async () => {
  const insertWith = (status: string, inactivatedAt: string | null) =>
    `insert into students (name, cpf, birth_date, phone, status, inactivated_at)
     values ('Aluna de Teste', '${nextCpf()}', '2000-01-01', '11912345678', '${status}', ${inactivatedAt === null ? 'null' : `'${inactivatedAt}'`})`;

  for (const [status, inactivatedAt] of [
    ['inactive', null],
    ['active', '2026-10-01T12:00:00Z'],
    ['suspended', '2026-10-01T12:00:00Z'],
  ] as const) {
    const failure = await failureOf(insertWith(status, inactivatedAt));
    expect(failure.code, status).toBe(CHECK_VIOLATION);
    expect(failure.constraint, status).toBe('students_inactivated_at_matches');
  }

  for (const [status, inactivatedAt] of [
    ['inactive', '2026-10-01T12:00:00Z'],
    ['active', null],
    ['suspended', null],
  ] as const) {
    await client.query(insertWith(status, inactivatedAt));
  }
});

test('privacy_settings_single_row_with_null_and_30_and_both_bounds', async () => {
  const settings = () =>
    rows<{ id: boolean; years: number | null; days: number }>(
      'select id, inactive_student_retention_years as years, photo_version_retention_days as days from privacy_settings',
    );
  expect(await settings()).toEqual([{ id: true, years: null, days: 30 }]);

  // a linha é uma só
  const second = await failureOf('insert into privacy_settings default values');
  expect(second.code).toBe(UNIQUE_VIOLATION);
  const falseId = await failureOf('insert into privacy_settings (id) values (false)');
  expect(falseId.code).toBe(CHECK_VIOLATION);

  const setYears = (years: number | null) =>
    client.query('update privacy_settings set inactive_student_retention_years = $1', [years]);
  const setDays = (days: number | null) => client.query('update privacy_settings set photo_version_retention_days = $1', [days]);
  try {
    for (const years of [1, 20, null]) {
      await setYears(years);
      expect((await settings())[0]!.years).toBe(years);
    }
    for (const years of [0, 21]) {
      const failure = await failureOf('update privacy_settings set inactive_student_retention_years = $1', [years]);
      expect(failure.code, String(years)).toBe(CHECK_VIOLATION);
    }
    for (const days of [1, 365]) {
      await setDays(days);
      expect((await settings())[0]!.days).toBe(days);
    }
    for (const days of [0, 366]) {
      const failure = await failureOf('update privacy_settings set photo_version_retention_days = $1', [days]);
      expect(failure.code, String(days)).toBe(CHECK_VIOLATION);
    }
    const nullDays = await failureOf('update privacy_settings set photo_version_retention_days = null');
    expect(nullDays.code).toBe(NOT_NULL_VIOLATION);
    expect(await settings()).toEqual([{ id: true, years: null, days: 365 }]);
  } finally {
    await setYears(null);
    await setDays(30);
  }
});

type Journal = { entries: Array<{ idx: number; tag: string }> };
const journal = () => JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as Journal & Record<string, unknown>;

let databases = 0;
/** Um banco à parte no mesmo servidor, migrado até a `0010`, e o que aplica a `0011` sobre ele. */
async function databaseAt0010() {
  const full = journal();
  const folder = mkdtempSync(join(tmpdir(), 'migrations-0010-'));
  cpSync(migrations, folder, { recursive: true });
  const journalPath = join(folder, 'meta/_journal.json');
  const keep = (last: number) => {
    for (const entry of full.entries.filter((item) => item.idx > last)) rmSync(join(folder, `${entry.tag}.sql`), { force: true });
    writeFileSync(journalPath, JSON.stringify({ ...full, entries: full.entries.filter((entry) => entry.idx <= last) }));
  };
  keep(10);

  const name = `privacy_${++databases}`;
  await client.query(`create database ${name}`);
  const url = new URL(container.getConnectionUri());
  url.pathname = `/${name}`;
  migrate(url.toString(), folder);
  const other = new pg.Client({ connectionString: url.toString() });
  await other.connect();
  return {
    query: async <T extends pg.QueryResultRow>(text: string, values: unknown[] = []) => (await other.query<T>(text, values)).rows,
    /** Aplica a pasta até a `0011`, e só até ela. */
    migrate0011: () => {
      cpSync(join(migrations, '0011_privacy.sql'), join(folder, '0011_privacy.sql'));
      writeFileSync(journalPath, JSON.stringify({ ...full, entries: full.entries.filter((entry) => entry.idx <= 11) }));
      migrate(url.toString(), folder);
    },
    close: async () => {
      await other.end().catch(() => undefined);
      rmSync(folder, { recursive: true, force: true });
    },
  };
}

test('migration_0011_adds_only_privacy_shape_and_keeps_rows', async () => {
  // a `0011` é a décima segunda entrada do diário
  expect(journal().entries[11]).toMatchObject({ idx: 11, tag: '0011_privacy' });

  const db = await databaseAt0010();
  try {
    const tablesOf = async () =>
      (
        await db.query<{ table_name: string }>(
          `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
        )
      ).map((row) => row.table_name);
    const columnsOf = (tables: string[]) =>
      db.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
        `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
          where table_schema = 'public' and table_name = any ($1) order by table_name, column_name`,
        [tables],
      );
    // a nulabilidade é conferida pelas colunas; o Postgres 18 também a lista como restrição `n`
    const constraintsOf = (tables: string[]) =>
      db.query<{ table: string; name: string; definition: string }>(
        `select conrelid::regclass::text as table, conname as name, pg_get_constraintdef(oid) as definition from pg_constraint
          where conrelid::regclass::text = any ($1) and contype <> 'n' order by 1, 2`,
        [tables],
      );
    const indexesOf = () =>
      db.query<{ name: string }>(`select indexname as name from pg_indexes where schemaname = 'public' order by 1`);
    const extensionsOf = () => db.query('select extname from pg_extension order by 1');

    const tablesBefore = await tablesOf();
    expect(tablesBefore).not.toContain('privacy_settings');

    // alunos nas três situações e um funcionário, antes da `0011`
    await db.query(`insert into users (name, email, role) values ('Recepção Um', 'recepcao.um@exemplo.com', 'reception')`);
    for (const [cpf, status] of [
      ['39400000001', 'active'],
      ['39400000002', 'suspended'],
      ['39400000003', 'inactive'],
    ]) {
      await db.query(
        `insert into students (name, cpf, birth_date, phone, status, email) values ('Aluna ' || $1, $1, '2015-01-01', '11912345678', $2, 'a@exemplo.com')`,
        [cpf, status],
      );
    }
    await db.query(
      `insert into staff (name, cpf, position, hired_at, phone, user_id)
       select 'Funcionária Um', '39400000010', 'Recepcionista', '2024-03-01', '11912345678', id from users`,
    );
    const owned = ['users', 'students', 'staff', 'audit_logs'];
    const rowsOf = async (table: string, without: string[] = []) =>
      (
        await db.query<{ row: string }>(
          `select (to_jsonb(t) ${without.map((key) => `- '${key}'`).join(' ')})::text as row from ${table} t order by id`,
        )
      ).map((row) => row.row);
    const before: Record<string, string[]> = {};
    for (const table of owned) before[table] = await rowsOf(table);
    const columnsBefore = await columnsOf(tablesBefore);
    const constraintsBefore = await constraintsOf(tablesBefore);
    const indexesBefore = await indexesOf();
    const extensionsBefore = await extensionsOf();

    const NULLABLE = new Set(['students.cpf', 'students.birth_date', 'students.phone', 'staff.cpf', 'staff.position', 'staff.hired_at', 'staff.phone']);
    const onlyPrivacyShape = async () => {
      expect(await tablesOf()).toEqual([...tablesBefore, 'privacy_settings'].sort());
      expect(await extensionsOf()).toEqual(extensionsBefore);

      // só as três colunas novas, e só os sete obrigatórios que passam a anuláveis
      const expectedColumns = [
        ...columnsBefore.map((column) =>
          NULLABLE.has(`${column.table_name}.${column.column_name}`) ? { ...column, is_nullable: 'YES' } : column,
        ),
        { table_name: 'staff', column_name: 'anonymized_at', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
        { table_name: 'students', column_name: 'anonymized_at', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
        { table_name: 'students', column_name: 'inactivated_at', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
      ].sort((a, b) => `${a.table_name}.${a.column_name}`.localeCompare(`${b.table_name}.${b.column_name}`, 'en'));
      expect(
        (await columnsOf(tablesBefore)).sort((a, b) =>
          `${a.table_name}.${a.column_name}`.localeCompare(`${b.table_name}.${b.column_name}`, 'en'),
        ),
      ).toEqual(expectedColumns);
      expect(NULLABLE.size).toBe(7);

      // só as cinco restrições das doors 1 a 3, e nenhum índice novo fora da tabela nova
      const constraintsAfter = await constraintsOf(tablesBefore);
      const added = constraintsAfter.filter(
        (constraint) => !constraintsBefore.some((old) => old.table === constraint.table && old.name === constraint.name),
      );
      expect(added.map((constraint) => `${constraint.table}.${constraint.name}`).sort()).toEqual([
        'staff.staff_anonymized_clean',
        'staff.staff_identified_complete',
        'students.students_anonymized_clean',
        'students.students_identified_complete',
        'students.students_inactivated_at_matches',
      ]);
      expect(constraintsAfter.filter((constraint) => !added.includes(constraint))).toEqual(constraintsBefore);
      expect((await indexesOf()).filter((index) => !index.name.startsWith('privacy_settings'))).toEqual(indexesBefore);

      // a configuração nasce com a linha única
      expect(
        await db.query('select id, inactive_student_retention_years as years, photo_version_retention_days as days from privacy_settings'),
      ).toEqual([{ id: true, years: null, days: 30 }]);

      // as linhas ficam como estavam, salvo `inactivated_at` dos inativos
      expect(await rowsOf('users')).toEqual(before.users);
      expect(await rowsOf('audit_logs')).toEqual(before.audit_logs);
      expect(await rowsOf('staff', ['anonymized_at'])).toEqual(before.staff);
      expect(await rowsOf('students', ['anonymized_at', 'inactivated_at'])).toEqual(before.students);
      expect(await db.query('select anonymized_at from staff')).toEqual([{ anonymized_at: null }]);
      expect(
        await db.query<{ status: string; anonymized: boolean; inactivated: boolean }>(
          `select status, anonymized_at is not null as anonymized, inactivated_at is not null as inactivated from students order by cpf`,
        ),
      ).toEqual([
        { status: 'active', anonymized: false, inactivated: false },
        { status: 'suspended', anonymized: false, inactivated: false },
        { status: 'inactive', anonymized: false, inactivated: true },
      ]);
    };

    db.migrate0011();
    await onlyPrivacyShape();
    const inactivatedAt = await db.query('select id, inactivated_at from students order by id');
    // uma segunda execução não muda nada
    db.migrate0011();
    await onlyPrivacyShape();
    expect(await db.query('select id, inactivated_at from students order by id')).toEqual(inactivatedAt);
  } finally {
    await db.close();
  }
});

test('backfill_inactivated_at_from_latest_audit_row_or_updated_at', async () => {
  const db = await databaseAt0010();
  try {
    const student = async (cpf: string, status: string) =>
      (
        await db.query<{ id: string }>(
          `insert into students (name, cpf, birth_date, phone, status, updated_at)
           values ('Aluna ' || $1, $1, '2015-01-01', '11912345678', $2, '2026-03-03T10:00:00Z') returning id`,
          [cpf, status],
        )
      )[0]!.id;
    const statusDiff = (from: string, to: string) => ({ fields: ['status'], values: { status: { from, to } } });
    const auditRow = (action: string, entityId: string, createdAt: string, diff: unknown) =>
      db.query(`insert into audit_logs (action, entity, entity_id, diff, created_at) values ($1, 'student', $2, $3, $4)`, [
        action,
        entityId,
        JSON.stringify(diff),
        createdAt,
      ]);

    // inativado por `student.inactivated`, reativado e inativado de novo por `student.updated`, e editado depois
    const again = await student('39400000101', 'inactive');
    await auditRow('student.inactivated', again, '2026-01-10T12:00:00Z', statusDiff('active', 'inactive'));
    await auditRow('student.updated', again, '2026-02-10T12:00:00Z', statusDiff('inactive', 'active'));
    await auditRow('student.updated', again, '2026-03-10T12:00:00Z', statusDiff('active', 'inactive'));
    await auditRow('student.updated', again, '2026-04-10T12:00:00Z', { fields: ['phone'] });
    // inativado só por `student.updated`
    const updated = await student('39400000102', 'inactive');
    await auditRow('student.updated', updated, '2026-05-05T12:00:00Z', statusDiff('suspended', 'inactive'));
    // sem linha na trilha
    const silent = await student('39400000103', 'inactive');
    // ativo e suspenso, um deles já inativado e reativado
    const active = await student('39400000104', 'active');
    await auditRow('student.inactivated', active, '2026-06-06T12:00:00Z', statusDiff('active', 'inactive'));
    await auditRow('student.updated', active, '2026-06-07T12:00:00Z', statusDiff('inactive', 'active'));
    const suspended = await student('39400000105', 'suspended');

    db.migrate0011();

    const inactivatedAt = async (id: string) =>
      (await db.query<{ at: string | null }>(`select to_char(inactivated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at from students where id = $1`, [id]))[0]!.at;
    expect(await inactivatedAt(again)).toBe('2026-03-10T12:00:00Z');
    expect(await inactivatedAt(updated)).toBe('2026-05-05T12:00:00Z');
    expect(await inactivatedAt(silent)).toBe('2026-03-03T10:00:00Z');
    expect(await inactivatedAt(active)).toBeNull();
    expect(await inactivatedAt(suspended)).toBeNull();
  } finally {
    await db.close();
  }
});
