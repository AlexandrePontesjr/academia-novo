import { spawnSync } from 'node:child_process';
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
let databases = 0;

function migrate(databaseUrl: string) {
  const migrated = spawnSync('pnpm db:migrate', {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl },
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

async function rows<T extends pg.QueryResultRow>(text: string, values: unknown[] = [], on: pg.Client = client) {
  return (await on.query<T>(text, values)).rows;
}

/** O `code` do erro do Postgres que a instrução provoca; falha se ela não falhar. */
async function failureOf(text: string, values: unknown[] = [], on: pg.Client = client) {
  try {
    await on.query(text, values);
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error(`a instrução não falhou: ${text}`);
}

/**
 * Um banco só dele, migrado do zero: `consent_terms` só aceita `INSERT` e nada o desfaz, então o
 * teste que acrescenta uma versão não pode dividir o banco com os outros.
 */
async function ownDatabase() {
  const name = `consent_test_${++databases}`;
  await client.query(`create database ${name}`);
  const url = new URL(container.getConnectionUri());
  url.pathname = `/${name}`;
  migrate(url.toString());
  const own = new pg.Client({ connectionString: url.toString() });
  await own.connect();
  return own;
}

let cpfs = 0;
const nextCpf = () => String(20_000_000_000 + ++cpfs);

async function insertStudent(on: pg.Client = client) {
  const [row] = await rows<{ id: string }>(
    `insert into students (name, cpf, birth_date, phone) values ('Aluna de Teste', $1, '2015-01-01', '11912345678') returning id`,
    [nextCpf()],
    on,
  );
  return row!.id;
}

async function insertGuardian(studentId: string, on: pg.Client = client, cpf = nextCpf()) {
  const [row] = await rows<{ id: string }>(
    `insert into guardians (student_id, name, cpf, phone, relationship) values ($1, 'Ana Souza', $2, '11912345678', 'mother') returning id`,
    [studentId, cpf],
    on,
  );
  return row!.id;
}

/** Um consentimento, com os campos que cada teste escolhe. */
function insertConsent(
  studentId: string,
  fields: {
    purpose?: string;
    termVersion?: number;
    grantedBy?: string;
    guardianId?: string | null;
    revokedAt?: string | null;
  } = {},
  on: pg.Client = client,
) {
  const { purpose = 'data_processing', termVersion = 1, grantedBy = 'student', guardianId = null, revokedAt = null } = fields;
  return on.query(
    `insert into consents (student_id, purpose, term_version, granted_by, guardian_id, revoked_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [studentId, purpose, termVersion, grantedBy, guardianId, revokedAt],
  );
}

/** `now()` do banco no instante da leitura: cada consulta solta é sua própria transação. */
const stamp = async (on: pg.Client = client) => (await rows<{ t: Date }>('select now() as t', [], on))[0]!.t;

const count = async (table: string, on: pg.Client = client) =>
  Number((await rows<{ n: string }>(`select count(*) as n from ${table}`, [], on))[0]!.n);

const columnsOf = async (table: string) =>
  (
    await rows<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
      [table],
    )
  ).map((column) => column.column_name);

test('students_keeps_the_columns_of_0003_and_gains_no_foreign_key', async () => {
  expect(await columnsOf('students')).toEqual([
    'id',
    'name',
    'cpf',
    'birth_date',
    'sex',
    'email',
    'phone',
    'address',
    'emergency_contact_name',
    'emergency_contact_phone',
    'health_notes_enc',
    'status',
    'created_at',
    'updated_at',
  ]);
  expect(await columnsOf('students')).not.toContain('guardian_id');
  expect(await rows("select conname from pg_constraint where conrelid = 'students'::regclass and contype = 'f'")).toEqual(
    [],
  );
});

test('guardians_defaults_and_not_null', async () => {
  const studentId = await insertStudent();
  const before = await stamp();
  const [row] = await rows<{ version: number; created_at: Date }>(
    `insert into guardians (student_id, name, cpf, phone, relationship)
     values ($1, 'Ana Souza', '52998224725', '11912345678', 'mother')
     returning uuid_extract_version(id) as version, created_at`,
    [studentId],
  );
  const after = await stamp();
  expect(row!.version).toBe(7);
  // o insert aconteceu entre as duas leituras do relógio
  expect(row!.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
  expect(row!.created_at.getTime()).toBeLessThanOrEqual(after.getTime());

  const full: Record<string, unknown> = {
    student_id: studentId,
    name: 'Ana Souza',
    cpf: '52998224725',
    phone: '11912345678',
    relationship: 'mother',
  };
  for (const missing of Object.keys(full)) {
    const present = Object.keys(full).filter((column) => column !== missing);
    const marks = present.map((_, index) => `$${index + 1}`).join(', ');
    const error = await failureOf(
      `insert into guardians (${present.join(', ')}) values (${marks})`,
      present.map((column) => full[column]),
    );
    expect(error.code, missing).toBe(NOT_NULL_VIOLATION);
  }

  expect(await columnsOf('guardians')).not.toContain('tenant_id');
});

test('guardians_relationship_check_four_values', async () => {
  const studentId = await insertStudent();
  const before = await count('guardians');
  for (const relationship of ['mother', 'father', 'legal_guardian', 'other']) {
    await client.query(
      `insert into guardians (student_id, name, cpf, phone, relationship) values ($1, 'Ana', $2, '11912345678', $3)`,
      [studentId, nextCpf(), relationship],
    );
  }
  expect(await count('guardians')).toBe(before + 4);

  for (const relationship of ['uncle', 'Mother', '']) {
    const error = await failureOf(
      `insert into guardians (student_id, name, cpf, phone, relationship) values ($1, 'Ana', $2, '11912345678', $3)`,
      [studentId, nextCpf(), relationship],
    );
    expect(error.code, relationship).toBe(CHECK_VIOLATION);
  }
  expect(await count('guardians')).toBe(before + 4);
});

test('guardians_has_no_unique_on_student_or_cpf', async () => {
  const first = await insertStudent();
  const second = await insertStudent();
  const shared = nextCpf();

  // dois do mesmo aluno, com o mesmo cpf
  await insertGuardian(first, client, shared);
  await insertGuardian(first, client, shared);
  // o mesmo cpf em dois alunos
  await insertGuardian(second, client, shared);

  const [sameCpf] = await rows<{ n: string }>('select count(*) as n from guardians where cpf = $1', [shared]);
  expect(Number(sameCpf!.n)).toBe(3);
  const [sameStudent] = await rows<{ n: string }>('select count(*) as n from guardians where student_id = $1', [first]);
  expect(Number(sameStudent!.n)).toBe(2);
});

test('guardians_student_foreign_key_restricts_delete', async () => {
  const error = await failureOf(
    `insert into guardians (student_id, name, cpf, phone, relationship)
     values (uuidv7(), 'Ana', $1, '11912345678', 'mother')`,
    [nextCpf()],
  );
  expect(error.code).toBe(FOREIGN_KEY_VIOLATION);

  const studentId = await insertStudent();
  const guardianId = await insertGuardian(studentId);
  const deletion = await failureOf('delete from students where id = $1', [studentId]);
  expect(deletion.code).toBe(FOREIGN_KEY_VIOLATION);
  expect(await rows('select id from students where id = $1', [studentId])).toHaveLength(1);
  expect(await rows('select id from guardians where id = $1', [guardianId])).toHaveLength(1);
});

test('consent_terms_text_not_null_and_created_at_default', async () => {
  const own = await ownDatabase();
  try {
    const error = await failureOf("insert into consent_terms (purpose, version) values ('image_use', 2)", [], own);
    expect(error.code).toBe(NOT_NULL_VIOLATION);

    const before = await stamp(own);
    const [row] = await rows<{ created_at: Date }>(
      "insert into consent_terms (purpose, version, text) values ('image_use', 2, 'texto') returning created_at",
      [],
      own,
    );
    const after = await stamp(own);
    expect(row!.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(row!.created_at.getTime()).toBeLessThanOrEqual(after.getTime());
  } finally {
    await own.end();
  }
});

test('consents_defaults_and_not_null', async () => {
  const studentId = await insertStudent();
  const before = await stamp();
  const [row] = await rows<{ version: number; granted_at: Date; revoked_at: Date | null }>(
    `insert into consents (student_id, purpose, term_version, granted_by)
     values ($1, 'image_use', 1, 'student')
     returning uuid_extract_version(id) as version, granted_at, revoked_at`,
    [studentId],
  );
  const after = await stamp();
  expect(row!.version).toBe(7);
  expect(row!.revoked_at).toBeNull();
  expect(row!.granted_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
  expect(row!.granted_at.getTime()).toBeLessThanOrEqual(after.getTime());

  const other = await insertStudent();
  const full: Record<string, unknown> = {
    student_id: other,
    purpose: 'image_use',
    term_version: 1,
    granted_by: 'student',
  };
  for (const missing of ['purpose', 'term_version', 'granted_by']) {
    const present = Object.keys(full).filter((column) => column !== missing);
    const marks = present.map((_, index) => `$${index + 1}`).join(', ');
    const error = await failureOf(
      `insert into consents (${present.join(', ')}) values (${marks})`,
      present.map((column) => full[column]),
    );
    expect(error.code, missing).toBe(NOT_NULL_VIOLATION);
  }

  expect(await columnsOf('consents')).not.toContain('tenant_id');
});

test('consents_three_foreign_keys_refuse_unknown_targets', async () => {
  const studentId = await insertStudent();
  const guardianId = await insertGuardian(studentId);

  const unknownTerm = await failureOf(
    "insert into consents (student_id, purpose, term_version, granted_by) values ($1, 'image_use', 99, 'student')",
    [studentId],
  );
  expect(unknownTerm.code, 'par (purpose, term_version)').toBe(FOREIGN_KEY_VIOLATION);

  const unknownStudent = await failureOf(
    "insert into consents (student_id, purpose, term_version, granted_by) values (uuidv7(), 'image_use', 1, 'student')",
  );
  expect(unknownStudent.code, 'student_id').toBe(FOREIGN_KEY_VIOLATION);

  const unknownGuardian = await failureOf(
    "insert into consents (student_id, purpose, term_version, granted_by, guardian_id) values ($1, 'image_use', 1, 'guardian', uuidv7())",
    [studentId],
  );
  expect(unknownGuardian.code, 'guardian_id').toBe(FOREIGN_KEY_VIOLATION);
  expect(guardianId).toBeTruthy();
});

test('consents_granted_by_check_two_values', async () => {
  const studentId = await insertStudent();
  const guardianId = await insertGuardian(studentId);
  await insertConsent(studentId, { purpose: 'data_processing', grantedBy: 'student' });
  await insertConsent(studentId, { purpose: 'image_use', grantedBy: 'guardian', guardianId });

  for (const grantedBy of ['staff', 'Student', '']) {
    const error = await failureOf(
      "insert into consents (student_id, purpose, term_version, granted_by) values ($1, 'image_use', 1, $2)",
      [await insertStudent(), grantedBy],
    );
    expect(error.code, grantedBy).toBe(CHECK_VIOLATION);
  }
});

test('consents_guardian_id_iff_granted_by_guardian', async () => {
  const studentId = await insertStudent();
  const guardianId = await insertGuardian(studentId);

  // aceitos: os dois lados nulos e os dois lados preenchidos
  await insertConsent(await insertStudent(), { grantedBy: 'student', guardianId: null });
  await insertConsent(studentId, { grantedBy: 'guardian', guardianId });

  // recusados: um lado só
  const studentWithGuardian = await failureOf(
    "insert into consents (student_id, purpose, term_version, granted_by, guardian_id) values ($1, 'image_use', 1, 'student', $2)",
    [await insertStudent(), guardianId],
  );
  expect(studentWithGuardian.code, 'student com guardian_id').toBe(CHECK_VIOLATION);

  const guardianWithout = await failureOf(
    "insert into consents (student_id, purpose, term_version, granted_by, guardian_id) values ($1, 'image_use', 1, 'guardian', null)",
    [await insertStudent()],
  );
  expect(guardianWithout.code, 'guardian sem guardian_id').toBe(CHECK_VIOLATION);
});

test('consents_one_active_per_student_and_purpose', async () => {
  // as versões do termo diferem: só um banco com a versão 2 prova isso
  const own = await ownDatabase();
  try {
    await own.query("insert into consent_terms (purpose, version, text) values ('data_processing', 2, 'versão 2')");
    const student = await insertStudent(own);

    await insertConsent(student, { purpose: 'data_processing', termVersion: 1 }, own);
    const sameVersion = await failureOf(
      "insert into consents (student_id, purpose, term_version, granted_by) values ($1, 'data_processing', 1, 'student')",
      [student],
      own,
    );
    expect(sameVersion.code, 'dois ativos, mesma versão').toBe(UNIQUE_VIOLATION);
    expect(sameVersion.message).toContain('consents_one_active_idx');

    const otherVersion = await failureOf(
      "insert into consents (student_id, purpose, term_version, granted_by) values ($1, 'data_processing', 2, 'student')",
      [student],
      own,
    );
    expect(otherVersion.code, 'dois ativos, versões diferentes').toBe(UNIQUE_VIOLATION);

    // um ativo e um revogado, dois revogados, outra finalidade e outro aluno convivem
    await insertConsent(student, { purpose: 'image_use', revokedAt: '2026-01-01T00:00:00Z' }, own);
    await insertConsent(student, { purpose: 'image_use', revokedAt: '2026-01-02T00:00:00Z' }, own);
    await insertConsent(student, { purpose: 'image_use' }, own);
    await insertConsent(await insertStudent(own), { purpose: 'data_processing' }, own);
    expect(await count('consents', own)).toBe(5);
  } finally {
    await own.end();
  }
});

test('consents_foreign_keys_restrict_delete_of_student_and_guardian', async () => {
  const studentId = await insertStudent();
  const guardianId = await insertGuardian(studentId);
  await insertConsent(studentId, { purpose: 'image_use', grantedBy: 'guardian', guardianId });

  const deleteStudent = await failureOf('delete from students where id = $1', [studentId]);
  expect(deleteStudent.code, 'aluno com consentimento').toBe(FOREIGN_KEY_VIOLATION);
  const deleteGuardian = await failureOf('delete from guardians where id = $1', [guardianId]);
  expect(deleteGuardian.code, 'responsável referenciado').toBe(FOREIGN_KEY_VIOLATION);

  expect(await rows('select id from students where id = $1', [studentId])).toHaveLength(1);
  expect(await rows('select id from guardians where id = $1', [guardianId])).toHaveLength(1);
  expect(await rows('select id from consents where student_id = $1', [studentId])).toHaveLength(1);
});

test('consent_terms_update_delete_truncate_refused', async () => {
  const before = await rows<{ row: string }>('select to_jsonb(t)::text as row from consent_terms t order by purpose, version');
  expect(before).toHaveLength(2);

  const statements: Array<[label: string, sql: string]> = [
    ['UPDATE purpose', "update consent_terms set purpose = 'image_use' where purpose = 'data_processing'"],
    ['UPDATE version', 'update consent_terms set version = 5 where purpose = \'data_processing\''],
    ['UPDATE text', "update consent_terms set text = 'outro texto' where purpose = 'data_processing'"],
    ['UPDATE created_at', "update consent_terms set created_at = now() where purpose = 'data_processing'"],
    ['UPDATE com o mesmo valor', 'update consent_terms set text = text'],
    ['DELETE', 'delete from consent_terms'],
    // `consents` aponta para a tabela: o `TRUNCATE` simples nem chega ao gatilho, o Postgres o
    // recusa antes por chave estrangeira; o que o gatilho barra é o `CASCADE`, que levaria `consents` junto
    ['TRUNCATE CASCADE', 'truncate consent_terms cascade'],
  ];
  for (const [label, sql] of statements) {
    const error = await failureOf(sql);
    expect(error.message, label).toContain('consent_terms is append-only');
  }
  const plainTruncate = await failureOf('truncate consent_terms');
  expect(plainTruncate.code, 'TRUNCATE simples').toBe('0A000');

  expect(await rows<{ row: string }>('select to_jsonb(t)::text as row from consent_terms t order by purpose, version')).toEqual(
    before,
  );
});

test('consent_terms_rejects_bad_purpose_version_and_duplicate', async () => {
  const own = await ownDatabase();
  try {
    const refused: Array<[label: string, sql: string]> = [
      ['finalidade fora do conjunto', "insert into consent_terms (purpose, version, text) values ('marketing', 1, 't')"],
      ['Data_Processing', "insert into consent_terms (purpose, version, text) values ('Data_Processing', 1, 't')"],
      ['version 0', "insert into consent_terms (purpose, version, text) values ('data_processing', 0, 't')"],
      ['version -1', "insert into consent_terms (purpose, version, text) values ('data_processing', -1, 't')"],
      ['versão repetida', "insert into consent_terms (purpose, version, text) values ('data_processing', 1, 't')"],
    ];
    for (const [label, sql] of refused) {
      const error = await failureOf(sql, [], own);
      expect(['23514', UNIQUE_VIOLATION], label).toContain(error.code);
    }
    expect(await count('consent_terms', own)).toBe(2);

    await own.query("insert into consent_terms (purpose, version, text) values ('data_processing', 2, 't')");
    await own.query("insert into consent_terms (purpose, version, text) values ('image_use', 2, 't')");
    expect(await count('consent_terms', own)).toBe(4);
  } finally {
    await own.end();
  }
});

test('migrate_on_empty_database_seeds_version_1_of_both_purposes', async () => {
  const terms = await rows<{ purpose: string; version: number; text: string }>(
    'select purpose, version, text from consent_terms order by purpose, version',
  );
  expect(terms.map(({ purpose, version }) => ({ purpose, version }))).toEqual([
    { purpose: 'data_processing', version: 1 },
    { purpose: 'image_use', version: 1 },
  ]);
  for (const term of terms) expect(term.text.trim().length, term.purpose).toBeGreaterThan(20);
});

test('version_1_texts_are_marked_as_draft', async () => {
  const terms = await rows<{ purpose: string; text: string }>(
    'select purpose, text from consent_terms where version = 1 order by purpose',
  );
  expect(terms.map((term) => term.purpose)).toEqual(['data_processing', 'image_use']);
  for (const term of terms) expect(term.text.startsWith('RASCUNHO'), term.purpose).toBe(true);
});
