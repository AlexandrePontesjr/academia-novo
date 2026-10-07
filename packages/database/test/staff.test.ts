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

/** O erro do Postgres que a instrução provoca; falha se ela não falhar. */
async function failureOf(text: string, values: unknown[] = []) {
  try {
    await client.query(text, values);
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error(`a instrução não falhou: ${text}`);
}

let cpfs = 0;
const nextCpf = () => String(50_000_000_000 + ++cpfs);

/** Insere um funcionário só com os campos obrigatórios; `status`, `userId` e `cpf` são opcionais. */
async function insertStaff(overrides: { cpf?: string; status?: string; userId?: string } = {}) {
  const cpf = overrides.cpf ?? nextCpf();
  const columns = ['name', 'cpf', 'position', 'hired_at', 'phone'];
  const values: unknown[] = ['Funcionária de Teste', cpf, 'Recepcionista', '2020-01-01', '11912345678'];
  if (overrides.status !== undefined) {
    columns.push('status');
    values.push(overrides.status);
  }
  if (overrides.userId !== undefined) {
    columns.push('user_id');
    values.push(overrides.userId);
  }
  const marks = values.map((_, index) => `$${index + 1}`).join(', ');
  const [row] = await rows<{ id: string }>(`insert into staff (${columns.join(', ')}) values (${marks}) returning id`, values);
  return { id: row!.id, cpf };
}

let emails = 0;
async function insertUser() {
  const [row] = await rows<{ id: string }>(
    `insert into users (name, email, role) values ('Pessoa', $1, 'reception') returning id`,
    [`pessoa.${++emails}@exemplo.com`],
  );
  return row!.id;
}

// tudo como texto, para a comparação não depender de como o driver lê cada tipo
const staffRow = async (id: string) =>
  (await rows<{ row: string }>('select to_jsonb(s)::text as row from staff s where id = $1', [id]))[0]!.row;
const photoRows = async (ownerColumn: 'staff_id' | 'student_id', ownerId: string) =>
  (await rows<{ row: string }>(`select to_jsonb(p)::text as row from photos p where ${ownerColumn} = $1 order by version`, [ownerId])).map(
    (r) => r.row,
  );
const staffCount = async () => Number((await rows<{ n: string }>('select count(*) as n from staff'))[0]!.n);

// a linha não corrente nasce com prazo: sem ele, quem a recusa é `photos_expiry_matches_current`
const insertStaffPhoto = (staffId: string, version: number, isCurrent: boolean) =>
  client.query(
    `insert into photos (staff_id, version, is_current, expires_at)
     values ($1, $2, $3, case when $3 then null else now() + interval '30 days' end)`,
    [staffId, version, isCurrent],
  );
const photoCount = async (staffId: string) =>
  Number((await rows<{ n: string }>('select count(*) as n from photos where staff_id = $1', [staffId]))[0]!.n);

test('staff_table_has_no_role_deleted_at_tenant_id_and_only_the_user_foreign_key', async () => {
  const columns = (
    await rows<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'staff'",
    )
  ).map((column) => column.column_name);

  expect(columns.length).toBeGreaterThan(0);
  for (const absent of ['role', 'deleted_at', 'tenant_id']) expect(columns, absent).not.toContain(absent);
  for (const present of ['cpf', 'status', 'user_id']) expect(columns, present).toContain(present);

  const foreignKeys = await rows<{ columns: string[]; references: string; delete_rule: string }>(
    `select array_agg(a.attname::text) as columns,
            c.confrelid::regclass::text as references,
            case c.confdeltype when 'a' then 'NO ACTION' when 'c' then 'CASCADE' when 'n' then 'SET NULL'
                               when 'd' then 'SET DEFAULT' when 'r' then 'RESTRICT' end as delete_rule
       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = 'staff'::regclass and c.contype = 'f'
      group by c.oid, c.confrelid, c.confdeltype`,
  );
  expect(foreignKeys).toEqual([{ columns: ['user_id'], references: 'users', delete_rule: 'NO ACTION' }]);
  // nenhuma coluna de `staff` aponta para `students`
  expect(foreignKeys.filter((foreignKey) => foreignKey.references === 'students')).toEqual([]);
});

test('staff_defaults_uuidv7_active_and_status_check_five_values', async () => {
  const [row] = await rows<{ id: string; version: number; status: string }>(
    `insert into staff (name, cpf, position, hired_at, phone) values ('Funcionária', $1, 'Instrutora', '2020-01-01', '11912345678')
     returning id, uuid_extract_version(id) as version, status`,
    [nextCpf()],
  );
  expect(row!.id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  expect(row!.version).toBe(7);
  expect(row!.status).toBe('active');

  for (const status of ['active', 'inactive']) {
    const { id } = await insertStaff({ status });
    const [stored] = await rows<{ status: string }>('select status from staff where id = $1', [id]);
    expect(stored!.status).toBe(status);
  }

  const { id } = await insertStaff();
  const before = await staffRow(id);
  const total = await staffCount();
  for (const status of ['suspended', 'Active', 'ativo', '']) {
    const onInsert = await failureOf(
      `insert into staff (name, cpf, position, hired_at, phone, status) values ('Funcionária', $1, 'Instrutora', '2020-01-01', '11912345678', $2)`,
      [nextCpf(), status],
    );
    expect(onInsert.code, `insert ${JSON.stringify(status)}`).toBe(CHECK_VIOLATION);
    const onUpdate = await failureOf('update staff set status = $2 where id = $1', [id, status]);
    expect(onUpdate.code, `update ${JSON.stringify(status)}`).toBe(CHECK_VIOLATION);
  }

  expect(await staffCount()).toBe(total);
  expect(await staffRow(id)).toBe(before);
});

test('staff_cpf_unique_across_status_user_id_unique_and_linked_user_not_deletable', async () => {
  // o CPF é único em qualquer situação, também quando o primeiro está inativo
  for (const status of ['active', 'inactive']) {
    const { cpf } = await insertStaff({ status });
    const total = await staffCount();
    expect((await failureOf(
      `insert into staff (name, cpf, position, hired_at, phone) values ('Outra', $1, 'Instrutora', '2020-01-01', '11912345678')`,
      [cpf],
    )).code, status).toBe(UNIQUE_VIOLATION);
    expect(await staffCount(), status).toBe(total);
  }
  // CPFs diferentes convivem
  const first = await insertStaff();
  const second = await insertStaff();
  expect(first.cpf).not.toBe(second.cpf);

  // um CPF igual ao de um aluno convive com ele
  const [student] = await rows<{ cpf: string }>(
    `insert into students (name, cpf, birth_date, phone) values ('Aluna', $1, '2015-01-01', '11912345678') returning cpf`,
    [nextCpf()],
  );
  const alsoStaff = await insertStaff({ cpf: student!.cpf });
  expect(alsoStaff.cpf).toBe(student!.cpf);

  // o mesmo `user_id` em dois funcionários viola UNIQUE; vários com `user_id` nulo convivem
  const userId = await insertUser();
  const linked = await insertStaff({ userId });
  const beforeLinked = await staffRow(linked.id);
  const duplicate = await failureOf(
    `insert into staff (name, cpf, position, hired_at, phone, user_id) values ('Outra', $1, 'Instrutora', '2020-01-01', '11912345678', $2)`,
    [nextCpf(), userId],
  );
  expect(duplicate.code).toBe(UNIQUE_VIOLATION);
  await insertStaff();
  await insertStaff();
  expect(Number((await rows<{ n: string }>('select count(*) as n from staff where user_id is null'))[0]!.n)).toBeGreaterThanOrEqual(4);

  // apagar o usuário vinculado falha pela chave estrangeira, com as duas linhas como estavam
  const userBefore = (await rows<{ row: string }>('select to_jsonb(u)::text as row from users u where id = $1', [userId]))[0]!.row;
  const deletion = await failureOf('delete from users where id = $1', [userId]);
  expect(deletion.code).toBe(FOREIGN_KEY_VIOLATION);
  expect((await rows<{ row: string }>('select to_jsonb(u)::text as row from users u where id = $1', [userId]))[0]!.row).toBe(userBefore);
  expect(await staffRow(linked.id)).toBe(beforeLinked);
});

test('migration_0007_adds_staff_and_staff_id_and_keeps_existing_photo_rows', async () => {
  // uma pasta de migrações que para na `0006`, num banco à parte do mesmo servidor
  const until0006 = mkdtempSync(join(tmpdir(), 'migrations-0006-'));
  cpSync(join(repoRoot, 'packages/database/migrations'), until0006, { recursive: true });
  const journalPath = join(until0006, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
  const dropped = journal.entries.filter((entry) => entry.idx > 6);
  expect(dropped.map((entry) => entry.tag)).toContain('0007_staff');
  for (const entry of dropped) rmSync(join(until0006, `${entry.tag}.sql`));
  journal.entries = journal.entries.filter((entry) => entry.idx <= 6);
  expect(journal.entries).toHaveLength(7);
  writeFileSync(journalPath, JSON.stringify(journal));

  await client.query('create database before_0007');
  const url = new URL(container.getConnectionUri());
  url.pathname = '/before_0007';
  const other = new pg.Client({ connectionString: url.toString() });
  try {
    migrate(url.toString(), until0006);
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
    expect(columnsBefore.map((column) => column.column_name)).not.toContain('staff_id');
    expect(columnsBefore.find((column) => column.column_name === 'student_id')!.is_nullable).toBe('NO');
    const tablesBefore = await tablesOf();
    expect(tablesBefore).not.toContain('staff');
    // uma foto corrente e uma guardada, de dois alunos
    await other.query(
      `with s as (insert into students (name, cpf, birth_date, phone) values ('Aluna Um', '39100000001', '2015-01-01', '11912345678') returning id)
       insert into photos (student_id, version, is_current) select id, 1, true from s`,
    );
    await other.query(
      `with s as (insert into students (name, cpf, birth_date, phone) values ('Aluna Dois', '39100000002', '2015-01-01', '11912345678') returning id)
       insert into photos (student_id, version, is_current, expires_at) select id, 1, false, '2030-01-01T00:00:00Z' from s`,
    );
    const photosBefore = await photosOf();
    expect(photosBefore).toHaveLength(2);

    migrate(url.toString());

    expect(await tablesOf()).toEqual([...tablesBefore, 'staff'].sort());
    expect(await query('select * from staff')).toEqual([]);
    expect(await columnsOf()).toEqual(
      [...columnsBefore.map((column) => (column.column_name === 'student_id' ? { ...column, is_nullable: 'YES' } : column)), { column_name: 'staff_id', data_type: 'uuid', is_nullable: 'YES' }],
    );
    expect(await photosOf()).toEqual(photosBefore.map(({ row }) => ({ row: { ...row, staff_id: null } })));
    const [foreignKey] = await query<{ references: string; delete_rule: string }>(
      `select c.confrelid::regclass::text as references,
              case c.confdeltype when 'a' then 'NO ACTION' else c.confdeltype::text end as delete_rule
         from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.conrelid = 'photos'::regclass and c.contype = 'f' and a.attname = 'staff_id'`,
    );
    expect(foreignKey).toEqual({ references: 'staff', delete_rule: 'NO ACTION' });
  } finally {
    await other.end().catch(() => undefined);
    rmSync(until0006, { recursive: true, force: true });
  }
});

test('staff_photo_version_unique_one_current_index_and_no_cascade', async () => {
  const first = (await insertStaff()).id;
  const second = (await insertStaff()).id;

  // a mesma `version` no mesmo funcionário viola a restrição; em dois funcionários convive
  await insertStaffPhoto(first, 1, false);
  const sameVersion = await failureOf(
    `insert into photos (staff_id, version, is_current, expires_at) values ($1, 1, false, now() + interval '30 days')`,
    [first],
  );
  expect(sameVersion.code).toBe(UNIQUE_VIOLATION);
  expect(sameVersion.message).toContain('photos_staff_id_version_unique');
  await insertStaffPhoto(second, 1, false);
  expect(await photoCount(first)).toBe(1);
  expect(await photoCount(second)).toBe(1);

  // duas correntes do mesmo funcionário violam o índice; uma corrente mais várias guardadas convivem
  const third = (await insertStaff()).id;
  await insertStaffPhoto(third, 1, true);
  const twoCurrent = await failureOf('insert into photos (staff_id, version, is_current) values ($1, 2, true)', [third]);
  expect(twoCurrent.code).toBe(UNIQUE_VIOLATION);
  expect(twoCurrent.message).toContain('photos_one_current_staff_idx');
  await insertStaffPhoto(third, 3, false);
  await insertStaffPhoto(third, 4, false);
  expect(await photoCount(third)).toBe(3);

  // dois funcionários, cada um com a sua corrente
  const fourth = (await insertStaff()).id;
  const fifth = (await insertStaff()).id;
  await insertStaffPhoto(fourth, 1, true);
  await insertStaffPhoto(fifth, 1, true);
  expect(await photoCount(fourth)).toBe(1);
  expect(await photoCount(fifth)).toBe(1);

  // a chave estrangeira não cascateia: apagar o funcionário com foto falha e deixa as duas linhas
  const staffBefore = await staffRow(third);
  const photosBefore = await photoRows('staff_id', third);
  const deletion = await failureOf('delete from staff where id = $1', [third]);
  expect(deletion.code).toBe(FOREIGN_KEY_VIOLATION);
  expect(await staffRow(third)).toBe(staffBefore);
  expect(await photoRows('staff_id', third)).toEqual(photosBefore);
});

test('staff_owned_photo_expiry_check_four_combinations', async () => {
  const NAME = 'photos_expiry_matches_current';
  const insert = 'insert into photos (staff_id, version, is_current, expires_at) values ($1, $2, $3, $4::timestamptz)';
  const deadline = '2030-01-01T00:00:00Z';
  const staffId = (await insertStaff()).id;

  // as duas combinações aceitas
  await client.query(insert, [staffId, 1, true, null]);
  await client.query(insert, [staffId, 2, false, deadline]);
  expect(await photoCount(staffId)).toBe(2);

  // as duas recusadas, no INSERT
  const other = (await insertStaff()).id;
  const currentWithDeadline = await failureOf(insert, [other, 1, true, deadline]);
  expect(currentWithDeadline.code).toBe(CHECK_VIOLATION);
  expect(currentWithDeadline.message).toContain(NAME);
  const storedWithoutDeadline = await failureOf(insert, [other, 1, false, null]);
  expect(storedWithoutDeadline.code).toBe(CHECK_VIOLATION);
  expect(storedWithoutDeadline.message).toContain(NAME);
  expect(await photoCount(other)).toBe(0);

  // e no UPDATE que tira `is_current` sem dar prazo
  const demoted = await failureOf('update photos set is_current = false where staff_id = $1 and version = 1', [staffId]);
  expect(demoted.code).toBe(CHECK_VIOLATION);
  expect(demoted.message).toContain(NAME);
  const [current] = await rows<{ is_current: boolean; expires_at: Date | null }>(
    'select is_current, expires_at from photos where staff_id = $1 and version = 1',
    [staffId],
  );
  expect(current).toEqual({ is_current: true, expires_at: null });
});
