import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

let container: StartedPostgreSqlContainer;
let databaseCount = 0;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
}, 180_000);

afterAll(async () => {
  await container?.stop();
});

async function query<T extends pg.QueryResultRow>(url: string, sql: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(sql)).rows;
  } finally {
    await client.end();
  }
}

async function emptyDatabase(): Promise<string> {
  const name = `migrate_test_${++databaseCount}`;
  await query(container.getConnectionUri(), `create database ${name}`);
  const url = new URL(container.getConnectionUri());
  url.pathname = `/${name}`;
  return url.toString();
}

function dbMigrate(databaseUrl: string, extraEnv: Record<string, string> = {}) {
  return spawnSync('pnpm db:migrate', {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl, ...extraEnv },
  });
}

async function snapshot(url: string) {
  return {
    tables: await query(
      url,
      `select table_schema, table_name from information_schema.tables
       where table_schema not in ('pg_catalog', 'information_schema') order by 1, 2`,
    ),
    columns: await query(
      url,
      `select table_schema, table_name, column_name, data_type from information_schema.columns
       where table_schema not in ('pg_catalog', 'information_schema') order by 1, 2, 3`,
    ),
    extensions: await query(url, 'select extname, extversion from pg_extension order by 1'),
    applied: await query(url, 'select * from drizzle.__drizzle_migrations order by id'),
  };
}

describe('pnpm db:migrate', () => {
  test('empty_db_migrates_and_installs_pg_trgm', async () => {
    const url = await emptyDatabase();

    const result = dbMigrate(url);

    expect(result.status, result.stderr).toBe(0);
    const extensions = await query(url, "select extname from pg_extension where extname = 'pg_trgm'");
    expect(extensions).toEqual([{ extname: 'pg_trgm' }]);
  });

  test('second_run_changes_nothing', async () => {
    const url = await emptyDatabase();
    expect(dbMigrate(url).status).toBe(0);
    const before = await snapshot(url);
    expect(before.applied.length).toBeGreaterThan(0);

    const second = dbMigrate(url);

    expect(second.status, second.stderr).toBe(0);
    expect(await snapshot(url)).toEqual(before);
  });

  test('failing_migration_exits_nonzero', async () => {
    const url = await emptyDatabase();
    const folder = mkdtempSync(join(tmpdir(), 'academia-migrations-'));
    try {
      cpSync(migrationsFolder, folder, { recursive: true });
      const journalPath = join(folder, 'meta', '_journal.json');
      const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
      journal.entries.push({
        idx: journal.entries.length,
        version: journal.version,
        when: Date.now(),
        tag: '9999_broken',
        breakpoints: true,
      });
      writeFileSync(journalPath, JSON.stringify(journal));
      writeFileSync(join(folder, '9999_broken.sql'), 'ISTO NAO E SQL VALIDO;');

      const result = dbMigrate(url, { MIGRATIONS_FOLDER: folder });

      expect(result.status).not.toBe(0);
      expect(result.status).not.toBeNull();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
