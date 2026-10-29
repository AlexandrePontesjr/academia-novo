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
    return error as { code?: string; constraint?: string; message: string };
  }
  throw new Error(`a instrução não falhou: ${text} ${JSON.stringify(values)}`);
}

let cpfs = 0;
const nextCpf = () => String(83_000_000_000 + ++cpfs);
let emails = 0;
const nextEmail = () => `portal${++emails}@exemplo.com`;

const insertStudent = async () =>
  (
    await rows<{ id: string }>(
      `insert into students (name, cpf, birth_date, phone) values ('Aluna de Teste', $1, '2000-01-01', '11912345678') returning id`,
      [nextCpf()],
    )
  )[0]!.id;

const insertUser = async (role: string, studentId: string | null = null) =>
  (
    await rows<{ id: string }>(`insert into users (name, email, role, student_id) values ('Usuária', $1, $2, $3) returning id`, [
      nextEmail(),
      role,
      studentId,
    ])
  )[0]!.id;

const count = async (table: string) => Number((await rows<{ n: string }>(`select count(*) as n from ${table}`))[0]!.n);
const rowText = async (table: string, id: string) =>
  (await rows<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t where id = $1`, [id]))[0]?.row;

test('student_link_check_unique_and_fk_without_cascade', async () => {
  const studentId = await insertStudent();
  const userId = await insertUser('student', studentId);
  expect((await rows('select role, student_id from users where id = $1', [userId]))[0]).toEqual({ role: 'student', student_id: studentId });

  // `student` sem ficha, e cada perfil da equipe com ficha
  const before = await count('users');
  const orphan = await failureOf(`insert into users (name, email, role) values ('Sem Ficha', $1, 'student')`, [nextEmail()]);
  expect(orphan.code).toBe(CHECK_VIOLATION);
  expect(orphan.constraint).toBe('users_student_link');
  for (const role of ['admin', 'reception', 'hr_finance', 'instructor']) {
    const other = await insertStudent();
    const linked = await failureOf(`insert into users (name, email, role, student_id) values ('Equipe', $1, $2, $3)`, [nextEmail(), role, other]);
    expect(linked.code, role).toBe(CHECK_VIOLATION);
    expect(linked.constraint, role).toBe('users_student_link');
  }

  // a mesma ficha num segundo usuário
  const twice = await failureOf(`insert into users (name, email, role, student_id) values ('Outro', $1, 'student', $2)`, [nextEmail(), studentId]);
  expect(twice.code).toBe(UNIQUE_VIOLATION);
  expect(twice.constraint).toBe('users_student_id_unique');

  // uma ficha que não existe
  const ghost = await failureOf(`insert into users (name, email, role, student_id) values ('Fantasma', $1, 'student', $2)`, [
    nextEmail(),
    '019a0000-0000-7000-8000-0000000000ff',
  ]);
  expect(ghost.code).toBe(FOREIGN_KEY_VIOLATION);
  expect(await count('users')).toBe(before);

  // apagar a ficha que tem usuário: `NO ACTION`, e as duas linhas ficam
  const [rule] = await rows<{ delete_rule: string }>(
    `select rc.delete_rule from information_schema.referential_constraints rc where rc.constraint_name = 'users_student_id_students_id_fk'`,
  );
  expect(rule).toEqual({ delete_rule: 'NO ACTION' });
  const studentBefore = await rowText('students', studentId);
  const userBefore = await rowText('users', userId);
  const deleted = await failureOf('delete from students where id = $1', [studentId]);
  expect(deleted.code).toBe(FOREIGN_KEY_VIOLATION);
  expect(await rowText('students', studentId)).toBe(studentBefore);
  expect(await rowText('users', userId)).toBe(userBefore);
});

test('role_check_accepts_student', async () => {
  const studentId = await insertStudent();
  await insertUser('student', studentId);
  for (const role of ['Student', '']) {
    const refused = await failureOf(`insert into users (name, email, role) values ('Perfil', $1, $2)`, [nextEmail(), role]);
    expect(refused.code, role).toBe(CHECK_VIOLATION);
    expect(refused.constraint, role).toBe('users_role_valid');
  }
});

test('password_tokens_purpose_unique_hash_and_user_cascade', async () => {
  const owner = await insertUser('student', await insertStudent());
  const other = await insertUser('student', await insertStudent());
  const insert = (userId: string, purpose: string, hash: string) =>
    client.query(`insert into password_tokens (user_id, purpose, token_hash, expires_at) values ($1, $2, $3, now() + interval '1 hour')`, [
      userId,
      purpose,
      hash,
    ]);

  await insert(owner, 'first_access', 'a'.repeat(64));
  await insert(owner, 'reset', 'b'.repeat(64));
  await insert(other, 'reset', 'c'.repeat(64));

  for (const purpose of ['Reset', 'invite', '']) {
    const refused = await failureOf(
      `insert into password_tokens (user_id, purpose, token_hash, expires_at) values ($1, $2, $3, now())`,
      [owner, purpose, `x${purpose}`.padEnd(64, '0')],
    );
    expect(refused.code, purpose).toBe(CHECK_VIOLATION);
    expect(refused.constraint, purpose).toBe('password_tokens_purpose_valid');
  }
  const repeated = await failureOf(
    `insert into password_tokens (user_id, purpose, token_hash, expires_at) values ($1, 'reset', $2, now())`,
    [other, 'a'.repeat(64)],
  );
  expect(repeated.code).toBe(UNIQUE_VIOLATION);
  const ghost = await failureOf(
    `insert into password_tokens (user_id, purpose, token_hash, expires_at) values ($1, 'reset', $2, now())`,
    ['019a0000-0000-7000-8000-0000000000ee', 'd'.repeat(64)],
  );
  expect(ghost.code).toBe(FOREIGN_KEY_VIOLATION);

  // só o teste apaga usuário por SQL: os dois tokens dele vão junto, o do outro fica
  await client.query('delete from users where id = $1', [owner]);
  expect(await rows('select token_hash from password_tokens where user_id = $1', [owner])).toEqual([]);
  expect(await rows('select token_hash from password_tokens where user_id = $1', [other])).toEqual([{ token_hash: 'c'.repeat(64) }]);
});

test('pending_photo_checks_and_one_per_student', async () => {
  const studentId = await insertStudent();
  const [omitted] = await rows<{ pending: boolean }>(
    `insert into photos (student_id, version, is_current) values ($1, 1, true) returning pending`,
    [studentId],
  );
  expect(omitted).toEqual({ pending: false });

  const currentPending = await failureOf(`insert into photos (student_id, version, is_current, pending) values ($1, 2, true, true)`, [
    await insertStudent(),
  ]);
  expect(currentPending.code).toBe(CHECK_VIOLATION);
  expect(currentPending.constraint).toBe('photos_pending_not_current');

  const [staff] = await rows<{ id: string }>(
    `insert into staff (name, cpf, position, hired_at, phone) values ('Funcionária', $1, 'Recepção', '2020-01-01', '11912345678') returning id`,
    [nextCpf()],
  );
  const staffPending = await failureOf(
    `insert into photos (staff_id, version, is_current, pending, expires_at) values ($1, 1, false, true, now() + interval '30 days')`,
    [staff!.id],
  );
  expect(staffPending.code).toBe(CHECK_VIOLATION);
  expect(staffPending.constraint).toBe('photos_pending_student');

  // a pendente com prazo e não corrente passa por `photos_expiry_matches_current`
  const pendingOf = (owner: string, version: number) =>
    `insert into photos (student_id, version, is_current, pending, expires_at) values ('${owner}', ${version}, false, true, now() + interval '30 days')`;
  await client.query(pendingOf(studentId, 2));
  const second = await failureOf(pendingOf(studentId, 3));
  expect(second.code).toBe(UNIQUE_VIOLATION);
  expect(second.constraint).toBe('photos_one_pending_idx');
  const otherStudent = await insertStudent();
  await client.query(pendingOf(otherStudent, 1));
  expect(await rows('select version, is_current, pending from photos where student_id = $1 order by version', [studentId])).toEqual([
    { version: 1, is_current: true, pending: false },
    { version: 2, is_current: false, pending: true },
  ]);
  expect(await rows('select version, pending from photos where student_id = $1', [otherStudent])).toEqual([{ version: 1, pending: true }]);
});

type Journal = { entries: Array<{ idx: number; tag: string }> };

test('migration_0013_keeps_existing_rows_and_adds_empty_tokens', async () => {
  // a `0013` é a décima quarta entrada do diário
  const full = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as Journal & Record<string, unknown>;
  expect(full.entries[13]).toMatchObject({ idx: 13, tag: '0013_portal' });

  const folder = mkdtempSync(join(tmpdir(), 'migrations-0012-'));
  const journalPath = join(folder, 'meta/_journal.json');
  cpSync(migrations, folder, { recursive: true });
  for (const entry of full.entries.filter((item) => item.idx > 12)) rmSync(join(folder, `${entry.tag}.sql`), { force: true });
  writeFileSync(journalPath, JSON.stringify({ ...full, entries: full.entries.filter((entry) => entry.idx <= 12) }));

  await client.query('create database portal_0013');
  const url = new URL(container.getConnectionUri());
  url.pathname = '/portal_0013';
  const db = new pg.Client({ connectionString: url.toString() });
  try {
    migrate(url.toString(), folder);
    await db.connect();
    const query = async <T extends pg.QueryResultRow>(text: string, values: unknown[] = []) => (await db.query<T>(text, values)).rows;
    const tableExists = async (table: string) =>
      (await query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = $1`, [table]))[0]!.n === 1;
    expect(await tableExists('password_tokens')).toBe(false);

    // um usuário de cada perfil da equipe, um aluno com a foto corrente e uma versão guardada, antes da `0013`
    for (const role of ['admin', 'reception', 'hr_finance', 'instructor']) {
      await query(`insert into users (name, email, role) values ('Equipe', $1, $2)`, [`${role}@antes.com`, role]);
    }
    const [student] = await query<{ id: string }>(
      `insert into students (name, cpf, birth_date, phone) values ('Aluna Antiga', '39600000001', '2000-01-01', '11912345678') returning id`,
    );
    await query(`insert into photos (student_id, version, is_current, expires_at) values ($1, 1, false, now() + interval '30 days')`, [student!.id]);
    await query(`insert into photos (student_id, version, is_current) values ($1, 2, true)`, [student!.id]);
    const rowsOf = async (table: string) =>
      (await query<{ row: Record<string, unknown> }>(`select to_jsonb(t) as row from ${table} t order by id`)).map((row) => row.row);
    const before = { users: await rowsOf('users'), photos: await rowsOf('photos'), students: await rowsOf('students') };
    expect(before.users).toHaveLength(4);
    expect(before.photos).toHaveLength(2);

    cpSync(join(migrations, '0013_portal.sql'), join(folder, '0013_portal.sql'));
    writeFileSync(journalPath, JSON.stringify({ ...full, entries: full.entries.filter((entry) => entry.idx <= 13) }));
    migrate(url.toString(), folder);

    const after = { users: await rowsOf('users'), photos: await rowsOf('photos'), students: await rowsOf('students') };
    for (const row of after.users) expect(row.student_id).toBeNull();
    for (const row of after.photos) expect(row.pending).toBe(false);
    expect(await tableExists('password_tokens')).toBe(true);
    expect(await query('select count(*)::int as n from password_tokens')).toEqual([{ n: 0 }]);
    // as demais colunas, idênticas
    const without = (row: Record<string, unknown>, column: string) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== column));
    expect(after.users.map((row) => without(row, 'student_id'))).toEqual(before.users);
    expect(after.photos.map((row) => without(row, 'pending'))).toEqual(before.photos);
    expect(after.students).toEqual(before.students);
  } finally {
    await db.end().catch(() => undefined);
    rmSync(folder, { recursive: true, force: true });
  }
});
