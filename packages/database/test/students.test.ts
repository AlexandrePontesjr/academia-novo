import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

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

let cpfs = 0;
/** Um CPF só para a linha de teste: a tabela não valida o dígito verificador, é a API que valida. */
const nextCpf = () => String(10_000_000_000 + ++cpfs);

/** Insere um aluno só com os campos obrigatórios; o inativo, com o instante da inativação (privacidade, door 3). */
async function insertStudent(overrides: { cpf?: string; status?: string } = {}) {
  const cpf = overrides.cpf ?? nextCpf();
  const inactive = overrides.status === 'inactive';
  const columns = [
    'name',
    'cpf',
    'birth_date',
    'phone',
    ...(overrides.status !== undefined ? ['status'] : []),
    ...(inactive ? ['inactivated_at'] : []),
  ];
  const values = [
    'Aluna de Teste',
    cpf,
    '2000-01-01',
    '11912345678',
    ...(overrides.status !== undefined ? [overrides.status] : []),
    ...(inactive ? ['2026-10-01T12:00:00Z'] : []),
  ];
  const marks = columns.map((_, index) => `$${index + 1}`).join(', ');
  const [row] = await rows<{ id: string }>(
    `insert into students (${columns.join(', ')}) values (${marks}) returning id`,
    values,
  );
  return { id: row!.id, cpf };
}

// tudo como texto, para a comparação não depender de como o driver lê cada tipo
const read = (id: string) => rows('select to_jsonb(s)::text as row from students s where id = $1', [id]);
const count = async () => Number((await rows<{ n: string }>('select count(*) as n from students'))[0]!.n);

test('students_has_no_deleted_at_guardian_or_foreign_key', async () => {
  const columns = (
    await rows<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'students'",
    )
  ).map((column) => column.column_name);

  expect(columns.length).toBeGreaterThan(0);
  for (const absent of ['deleted_at', 'guardian_id', 'tenant_id']) {
    expect(columns, absent).not.toContain(absent);
  }

  const foreignKeys = await rows(
    "select conname from pg_constraint where conrelid = 'students'::regclass and contype = 'f'",
  );
  expect(foreignKeys).toEqual([]);
});

test('defaults_uuidv7_and_active', async () => {
  const [row] = await rows<{ id: string; version: number; status: string }>(
    `insert into students (name, cpf, birth_date, phone) values ('Aluna', $1, '2000-01-01', '11912345678')
     returning id, uuid_extract_version(id) as version, status`,
    [nextCpf()],
  );

  expect(row!.id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  expect(row!.version).toBe(7);
  expect(row!.status).toBe('active');
});

test('status_accepts_three_values_and_rejects_others', async () => {
  for (const status of ['active', 'inactive', 'suspended']) {
    const { id } = await insertStudent({ status });
    const [row] = await rows<{ status: string }>('select status from students where id = $1', [id]);
    expect(row!.status).toBe(status);
  }

  const { id } = await insertStudent();
  const before = await read(id);
  const total = await count();
  for (const status of ['archived', 'Active', '']) {
    await expect(insertStudent({ status }), `insert ${JSON.stringify(status)}`).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
    await expect(
      rows('update students set status = $2 where id = $1', [id, status]),
      `update ${JSON.stringify(status)}`,
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  }

  expect(await count()).toBe(total);
  expect(await read(id)).toEqual(before);
});

test('cpf_unique_across_every_status', async () => {
  for (const status of ['active', 'inactive', 'suspended']) {
    const { cpf } = await insertStudent({ status });
    const total = await count();

    await expect(insertStudent({ cpf }), status).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

    expect(await count(), status).toBe(total);
  }

  const first = await insertStudent();
  const second = await insertStudent();
  expect(first.cpf).not.toBe(second.cpf);
});
