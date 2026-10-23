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
const NOT_NULL_VIOLATION = '23502';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
// versão 7: o 13º dígito hexadecimal é `7`
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

const count = async (table: 'leads' | 'lead_verifications' | 'students') =>
  Number((await rows<{ n: string }>(`select count(*) as n from ${table}`))[0]!.n);

let emails = 0;
const nextEmail = () => `interessado${++emails}@exemplo.com`;
let cpfs = 0;
const nextCpf = () => String(82_000_000_000 + ++cpfs);

/** Insere um interessado com o mínimo e as colunas dadas; devolve o `id`. */
async function insertLead(columns: Record<string, unknown> = {}) {
  const values = {
    name: 'Ana Souza',
    email: nextEmail(),
    phone: '11987654321',
    source: 'form',
    consent_purpose: 'data_processing',
    consent_term_version: 1,
    ...columns,
  };
  const names = Object.keys(values);
  const [row] = await rows<{ id: string }>(
    `insert into leads (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')}) returning id`,
    Object.values(values),
  );
  return row!.id;
}

const insertStudent = async () =>
  (
    await rows<{ id: string }>(
      `insert into students (name, cpf, birth_date, phone) values ('Aluna de Teste', $1, '2000-01-01', '11912345678') returning id`,
      [nextCpf()],
    )
  )[0]!.id;

const leadRow = async (id: string) => (await rows<{ row: string }>('select to_jsonb(l)::text as row from leads l where id = $1', [id]))[0]?.row;

test('leads_table_defaults_and_no_identity_columns', async () => {
  const columns = (
    await rows<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'leads'`,
    )
  ).map((row) => row.column_name);
  expect(columns.length).toBeGreaterThan(0);
  for (const forbidden of ['cpf', 'birth_date', 'tenant_id']) expect(columns, forbidden).not.toContain(forbidden);

  const [row] = await rows<{ id: string; status: string; email_verified_at: Date | null; student_id: string | null }>(
    `insert into leads (name, email, phone, source, consent_purpose, consent_term_version)
     values ('Ana Souza', $1, '11987654321', 'form', 'data_processing', 1)
     returning id, status, email_verified_at, student_id`,
    [nextEmail()],
  );
  expect(row!.id).toMatch(UUID_V7);
  expect(row!.status).toBe('new');
  expect(row!.email_verified_at).toBeNull();
  expect(row!.student_id).toBeNull();

  const before = await count('leads');
  const failure = await failureOf(
    `insert into leads (name, email, source, consent_purpose, consent_term_version)
     values ('Ana Souza', $1, 'form', 'data_processing', 1)`,
    [nextEmail()],
  );
  expect(failure.code).toBe(NOT_NULL_VIOLATION);
  expect(failure.message).toContain('phone');
  expect(await count('leads')).toBe(before);
});

test('leads_status_source_and_consent_checks', async () => {
  const studentId = await insertStudent();
  for (const status of ['new', 'contacted', 'discarded']) {
    await expect(insertLead({ status }), status).resolves.toBeTruthy();
  }
  await expect(insertLead({ status: 'converted', student_id: studentId })).resolves.toBeTruthy();

  const refused: Array<[label: string, columns: Record<string, unknown>, code: string]> = [
    ['status New', { status: 'New' }, CHECK_VIOLATION],
    ['status novo', { status: 'novo' }, CHECK_VIOLATION],
    ['status lead', { status: 'lead' }, CHECK_VIOLATION],
    ['status vazio', { status: '' }, CHECK_VIOLATION],
    ['source Google', { source: 'Google' }, CHECK_VIOLATION],
    ['source site', { source: 'site' }, CHECK_VIOLATION],
    ['source vazio', { source: '' }, CHECK_VIOLATION],
    ['finalidade image_use', { consent_purpose: 'image_use' }, CHECK_VIOLATION],
    ['versão 99', { consent_term_version: 99 }, FOREIGN_KEY_VIOLATION],
  ];
  for (const [label, columns, code] of refused) {
    const before = await count('leads');
    const values = { name: 'Ana', email: nextEmail(), phone: '11987654321', source: 'form', consent_purpose: 'data_processing', consent_term_version: 1, ...columns };
    const names = Object.keys(values);
    const failure = await failureOf(
      `insert into leads (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(values),
    );
    expect(failure.code, label).toBe(code);
    expect(await count('leads'), label).toBe(before);
  }
  await expect(insertLead({ source: 'google' })).resolves.toBeTruthy();
});

test('converted_iff_student_id_and_student_fk_without_cascade', async () => {
  const studentId = await insertStudent();
  const before = await count('leads');
  const converted = await failureOf(
    `insert into leads (name, email, phone, source, status, consent_purpose, consent_term_version)
     values ('Ana', $1, '11987654321', 'form', 'converted', 'data_processing', 1)`,
    [nextEmail()],
  );
  expect(converted).toMatchObject({ code: CHECK_VIOLATION, constraint: 'leads_converted_iff_student_id' });
  for (const status of ['new', 'contacted', 'discarded']) {
    const failure = await failureOf(
      `insert into leads (name, email, phone, source, status, student_id, consent_purpose, consent_term_version)
       values ('Ana', $1, '11987654321', 'form', $2, $3, 'data_processing', 1)`,
      [nextEmail(), status, studentId],
    );
    expect(failure, status).toMatchObject({ code: CHECK_VIOLATION, constraint: 'leads_converted_iff_student_id' });
  }
  const unknown = await failureOf(
    `insert into leads (name, email, phone, source, status, student_id, consent_purpose, consent_term_version)
     values ('Ana', $1, '11987654321', 'form', 'converted', '019a0000-0000-7000-8000-000000000000', 'data_processing', 1)`,
    [nextEmail()],
  );
  expect(unknown.code).toBe(FOREIGN_KEY_VIOLATION);
  expect(await count('leads')).toBe(before);

  const leadId = await insertLead({ status: 'converted', student_id: studentId });
  const leadBefore = await leadRow(leadId);
  const studentBefore = (await rows('select to_jsonb(s)::text as row from students s where id = $1', [studentId]))[0];
  const deleted = await failureOf('delete from students where id = $1', [studentId]);
  expect(deleted.code).toBe(FOREIGN_KEY_VIOLATION);
  expect(await leadRow(leadId)).toBe(leadBefore);
  expect((await rows('select to_jsonb(s)::text as row from students s where id = $1', [studentId]))[0]).toEqual(studentBefore);
});

test('one_open_lead_per_email_six_combinations', async () => {
  const studentId = await insertStudent();
  // a primeira e a segunda situação, e se a segunda entra
  const cases: Array<[first: string, second: string, accepted: boolean]> = [
    ['new', 'new', false],
    ['new', 'contacted', false],
    ['contacted', 'new', false],
    ['contacted', 'contacted', false],
    ['converted', 'new', true],
    ['discarded', 'contacted', true],
  ];
  for (const [first, second, accepted] of cases) {
    const email = nextEmail();
    await insertLead({ email, status: first, student_id: first === 'converted' ? studentId : null });
    const before = await count('leads');
    if (accepted) {
      await expect(insertLead({ email, status: second }), `${first} e ${second}`).resolves.toBeTruthy();
      expect(await count('leads')).toBe(before + 1);
    } else {
      const failure = await failureOf(
        `insert into leads (name, email, phone, source, status, consent_purpose, consent_term_version)
         values ('Ana', $1, '11987654321', 'form', $2, 'data_processing', 1)`,
        [email, second],
      );
      expect(failure, `${first} e ${second}`).toMatchObject({ code: UNIQUE_VIOLATION, constraint: 'leads_one_open_email_idx' });
      expect(await count('leads')).toBe(before);
    }
  }
});

test('verifications_cascade_unique_hash_and_throttles_key', async () => {
  const first = await insertLead();
  const other = await insertLead();
  const token = (leadId: string, hash: string) =>
    client.query(`insert into lead_verifications (lead_id, token_hash, expires_at) values ($1, $2, now() + interval '24 hours')`, [
      leadId,
      hash,
    ]);
  await token(first, 'a'.repeat(64));
  await token(first, 'b'.repeat(64));
  await token(other, 'c'.repeat(64));

  const repeated = await failureOf(
    `insert into lead_verifications (lead_id, token_hash, expires_at) values ($1, $2, now())`,
    [other, 'a'.repeat(64)],
  );
  expect(repeated.code).toBe(UNIQUE_VIOLATION);

  await client.query('delete from leads where id = $1', [first]);
  expect(await rows('select token_hash from lead_verifications where lead_id = $1', [first])).toEqual([]);
  expect(await rows('select token_hash from lead_verifications where lead_id = $1', [other])).toEqual([{ token_hash: 'c'.repeat(64) }]);

  await client.query(`insert into lead_throttles (key, hits) values ('ip:10.0.0.1', array[now()])`);
  const duplicate = await failureOf(`insert into lead_throttles (key, hits) values ('ip:10.0.0.1', array[now()])`);
  expect(duplicate.code).toBe(UNIQUE_VIOLATION);
  const noHits = await failureOf(`insert into lead_throttles (key) values ('email:x@exemplo.com')`);
  expect(noHits.code).toBe(NOT_NULL_VIOLATION);
  const primaryKey = await rows<{ columns: string[] }>(
    `select (select array_agg(a.attname::text) from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) as columns
       from pg_constraint c where c.conrelid = 'lead_throttles'::regclass and c.contype = 'p'`,
  );
  expect(primaryKey).toEqual([{ columns: ['key'] }]);
});

type Journal = { entries: Array<{ idx: number; tag: string }> };
const journal = () => JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as Journal & Record<string, unknown>;

test('migration_0012_adds_three_empty_tables_and_keeps_existing_rows', async () => {
  // a `0012` é a décima terceira entrada do diário
  const full = journal();
  expect(full.entries[12]).toMatchObject({ idx: 12, tag: '0012_leads' });

  const folder = mkdtempSync(join(tmpdir(), 'migrations-0011-'));
  const journalPath = join(folder, 'meta/_journal.json');
  cpSync(migrations, folder, { recursive: true });
  for (const entry of full.entries.filter((item) => item.idx > 11)) rmSync(join(folder, `${entry.tag}.sql`), { force: true });
  writeFileSync(journalPath, JSON.stringify({ ...full, entries: full.entries.filter((entry) => entry.idx <= 11) }));

  await client.query('create database leads_0012');
  const url = new URL(container.getConnectionUri());
  url.pathname = '/leads_0012';
  const db = new pg.Client({ connectionString: url.toString() });
  try {
    migrate(url.toString(), folder);
    await db.connect();
    const query = async <T extends pg.QueryResultRow>(text: string, values: unknown[] = []) => (await db.query<T>(text, values)).rows;
    const tablesOf = async () =>
      (await query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' order by table_name`)).map(
        (row) => row.table_name,
      );
    const tablesBefore = await tablesOf();
    expect(tablesBefore).not.toContain('leads');

    // um aluno, um consentimento dele e um plano, antes da `0012`
    const [student] = await query<{ id: string }>(
      `insert into students (name, cpf, birth_date, phone) values ('Aluna Antiga', '39500000001', '2000-01-01', '11912345678') returning id`,
    );
    await query(`insert into consents (student_id, purpose, term_version, granted_by) values ($1, 'data_processing', 1, 'student')`, [student!.id]);
    await query(`insert into plans (name, period, price_cents) values ('Mensal', 'monthly', 12000)`);
    const owned = ['students', 'consents', 'consent_terms', 'plans'];
    const rowsOf = async (table: string) =>
      (await query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by 1`)).map((row) => row.row);
    const before: Record<string, string[]> = {};
    for (const table of owned) before[table] = await rowsOf(table);
    expect(before.students).toHaveLength(1);
    expect(before.consents).toHaveLength(1);
    expect(before.plans).toHaveLength(1);

    cpSync(join(migrations, '0012_leads.sql'), join(folder, '0012_leads.sql'));
    writeFileSync(journalPath, JSON.stringify({ ...full, entries: full.entries.filter((entry) => entry.idx <= 12) }));
    migrate(url.toString(), folder);

    expect(await tablesOf()).toEqual([...tablesBefore, 'lead_throttles', 'lead_verifications', 'leads'].sort());
    for (const table of ['leads', 'lead_verifications', 'lead_throttles']) {
      expect(await query(`select count(*)::int as n from ${table}`), table).toEqual([{ n: 0 }]);
    }
    for (const table of owned) expect(await rowsOf(table), table).toEqual(before[table]);
  } finally {
    await db.end().catch(() => undefined);
    rmSync(folder, { recursive: true, force: true });
  }
});
