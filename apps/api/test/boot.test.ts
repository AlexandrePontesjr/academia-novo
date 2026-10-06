import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { build } from 'esbuild';
import pg from 'pg';
import { beforeAll, expect, test, vi } from 'vitest';
import { buildOptions } from '../build-options.mjs';
import { envSchema } from '../src/env.ts';
import { invalidChunk, rawExchange } from './support/raw.ts';
import { freePort, refusingDatabaseUrl, startMinio, startPostgres } from './support/servers.ts';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));

const SECRET = 's3nha-ultra-secreta';
const validEnv: Record<string, string> = {
  DATABASE_URL: `postgres://academia:${SECRET}@127.0.0.1:5432/academia`,
  PORT: '39871',
  AUTH_SECRET: `chave-de-teste-${SECRET}-com-mais-de-32`,
  WEB_ORIGIN: 'http://localhost:3000',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  S3_ENDPOINT: 'http://127.0.0.1:9',
  S3_BUCKET: 'bucket-de-teste',
  S3_ACCESS_KEY_ID: 'chave-de-acesso-de-teste',
  S3_SECRET_ACCESS_KEY: 'chave-secreta-de-teste',
  PHOTO_URL_SECRET: 'segredo-das-urls-de-foto-com-mais-de-32-caracteres',
};

const requiredKeys = Object.entries(envSchema.shape)
  .filter(([, field]) => !field.safeParse(undefined).success)
  .map(([key]) => key);

beforeAll(async () => {
  // o mesmo processo da API, empacotado como o `dist/main.js`, com uma rota de acesso mal declarado
  await build({
    ...buildOptions(['test/fixtures/invalid-access.ts'], 'dist/fixtures'),
    absWorkingDir: apiRoot,
  });
}, 60_000);

function without(env: Record<string, string>, key: string) {
  const rest = { ...env };
  delete rest[key];
  return rest;
}

/** Inicia o processo real da API (o mesmo `dist/main.js` da imagem) só com as variáveis dadas. */
function startApiProcess(env: Record<string, string>) {
  const result = spawnSync(process.execPath, ['dist/main.js'], {
    cwd: apiRoot,
    encoding: 'utf8',
    timeout: 15_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

test('missing_var_exits_1_naming_it', () => {
  expect(requiredKeys).toContain('DATABASE_URL');
  for (const key of requiredKeys) {
    expect(validEnv[key], `valor válido de ${key} no teste`).toBeDefined();
  }

  for (const key of requiredKeys) {
    const env = { ...validEnv };
    delete env[key];

    const { status, output } = startApiProcess(env);

    expect(status, `sem ${key}`).toBe(1);
    expect(output, `sem ${key}`).toContain(key);
  }
}, 120_000);

test('invalid_var_exits_1_naming_it', () => {
  const { status, output } = startApiProcess({ ...validEnv, DATABASE_URL: 'isto-nao-e-uma-url' });

  expect(status).toBe(1);
  expect(output).toContain('DATABASE_URL');
});

test('env_failure_prints_no_values', () => {
  const cases: Array<Record<string, string>> = [
    { ...validEnv, PORT: 'porta-invalida-xyz' },
    { DATABASE_URL: `mysql://root:${SECRET}@db.interno:3306/academia`, PORT: '39871' },
    { DATABASE_URL: validEnv.DATABASE_URL! },
  ];

  for (const env of cases) {
    const { status, output } = startApiProcess(env);

    expect(status).toBe(1);
    expect(output).not.toContain(SECRET);
    for (const value of Object.values(env)) {
      expect(output).not.toContain(value);
    }
  }
});

test('auth_env_rejected_exits_1_naming_var', () => {
  const cases: Array<{ variable: string; env: Record<string, string> }> = [
    { variable: 'AUTH_SECRET', env: without(validEnv, 'AUTH_SECRET') },
    { variable: 'AUTH_SECRET', env: { ...validEnv, AUTH_SECRET: `${SECRET}-com-31-cara` } },
    { variable: 'WEB_ORIGIN', env: without(validEnv, 'WEB_ORIGIN') },
    { variable: 'WEB_ORIGIN', env: { ...validEnv, WEB_ORIGIN: 'ftp://x' } },
  ];
  expect(cases[1]!.env.AUTH_SECRET).toHaveLength(31);

  for (const { variable, env } of cases) {
    const { status, output } = startApiProcess(env);

    expect(status, JSON.stringify(env)).toBe(1);
    expect(output).toContain(variable);
    for (const value of Object.values(env)) {
      expect(output).not.toContain(value);
    }
  }
});

test('route_without_single_access_declaration_exits_1', () => {
  const cases = [
    { fixture: 'undeclared', route: 'GET /api/undeclared' },
    { fixture: 'double', route: 'GET /api/double' },
  ];

  for (const { fixture, route } of cases) {
    const result = spawnSync(process.execPath, ['dist/fixtures/invalid-access.js', fixture], {
      cwd: apiRoot,
      encoding: 'utf8',
      timeout: 15_000,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...validEnv },
    });

    expect(result.status, `${fixture}: ${result.stdout}${result.stderr}`).toBe(1);
    expect(`${result.stdout}
${result.stderr}`).toContain(route);
  }
});

test('real_process_logs_delivered_body_error', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: apiRoot,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...validEnv,
      DATABASE_URL: await refusingDatabaseUrl(),
      PORT: String(port),
    },
  });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
  const linesFor = (requestId: string) =>
    stdout
      .split('\n')
      .filter((line) => line.includes(requestId))
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line.msg === 'request');

  try {
    await vi.waitFor(
      async () => expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(503),
      { timeout: 20_000, interval: 200 },
    );

    const response = await rawExchange(port, invalidChunk('application/json'));
    const requestId = response?.headers['x-request-id'] ?? '';
    const body = JSON.parse(response?.body ?? '') as Record<string, unknown>;

    expect(response?.status).toBe(400);
    expect(response?.headers['content-type']).toMatch(/^application\/problem\+json\b/);
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.requestId).toBe(requestId);

    await vi.waitFor(() => expect(linesFor(requestId).length).toBeGreaterThanOrEqual(1));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const lines = linesFor(requestId);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ requestId, status: 400 });
  } finally {
    child.kill();
  }
}, 60_000);

test('data_key_rejected_exits_1_naming_var', async () => {
  const keyOf = (bytes: number) => Buffer.alloc(bytes, 9).toString('base64');
  const cases: Array<{ name: string; env: Record<string, string> }> = [
    { name: 'ausente', env: without(validEnv, 'DATA_ENCRYPTION_KEY') },
    { name: 'não é base64', env: { ...validEnv, DATA_ENCRYPTION_KEY: 'isto nao e base64 de nada!' } },
    { name: '31 bytes', env: { ...validEnv, DATA_ENCRYPTION_KEY: keyOf(31) } },
    { name: '33 bytes', env: { ...validEnv, DATA_ENCRYPTION_KEY: keyOf(33) } },
  ];

  for (const { name, env } of cases) {
    const { status, output } = startApiProcess(env);

    expect(status, name).toBe(1);
    expect(output, name).toContain('DATA_ENCRYPTION_KEY');
    if (env.DATA_ENCRYPTION_KEY) expect(output, name).not.toContain(env.DATA_ENCRYPTION_KEY);
  }

  // com 32 bytes a API sobe: o banco recusa conexão, e o /health responde 503
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: apiRoot,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...validEnv,
      DATA_ENCRYPTION_KEY: keyOf(32),
      DATABASE_URL: await refusingDatabaseUrl(),
      PORT: String(port),
    },
  });
  try {
    await vi.waitFor(
      async () => expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(503),
      { timeout: 20_000, interval: 200 },
    );
  } finally {
    child.kill();
  }
}, 60_000);

test('photo_env_rejected_exits_1_naming_var_without_values', async () => {
  const photoKeys = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'PHOTO_URL_SECRET'];
  const cases: Array<{ name: string; variable: string; env: Record<string, string> }> = [
    ...photoKeys.map((key) => ({ name: `sem ${key}`, variable: key, env: without(validEnv, key) })),
    { name: 'PHOTO_URL_SECRET de 31 caracteres', variable: 'PHOTO_URL_SECRET', env: { ...validEnv, PHOTO_URL_SECRET: 'x'.repeat(31) } },
  ];

  for (const { name, variable, env } of cases) {
    const { status, output } = startApiProcess(env);

    expect(status, name).toBe(1);
    expect(output, name).toContain(variable);
    for (const key of photoKeys) {
      const value = env[key];
      if (value) expect(output, `${name}: valor de ${key}`).not.toContain(value);
    }
  }

  // com 32 caracteres e as outras quatro a API sobe e escuta: o banco recusa conexão, e o /health responde 503
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: apiRoot,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...validEnv,
      PHOTO_URL_SECRET: 'x'.repeat(32),
      DATABASE_URL: await refusingDatabaseUrl(),
      PORT: String(port),
    },
  });
  try {
    await vi.waitFor(
      async () => expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(503),
      { timeout: 20_000, interval: 200 },
    );
  } finally {
    child.kill();
  }
}, 120_000);

/** O processo real da API, com a saída acumulada. */
function spawnApi(env: Record<string, string>) {
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: apiRoot,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
  return { child, output: () => output };
}

test('real_process_purges_expired_version_on_startup', async () => {
  const postgres = await startPostgres();
  const minio = await startMinio();
  const pool = new pg.Pool({ connectionString: postgres.url });
  const keysOf = async () =>
    ((await minio.client.send(new ListObjectsV2Command({ Bucket: minio.bucket }))).Contents ?? []).map((object) => object.Key!).sort();
  let child: ReturnType<typeof spawn> | undefined;
  try {
    // um aluno com uma versão vencida e a corrente, e os três objetos de cada uma no bucket
    const { rows: students } = await pool.query<{ id: string }>(
      `insert into students (name, cpf, birth_date, phone) values ('Aluna de Teste', '52998224725', '2000-01-01', '11912345678') returning id`,
    );
    const studentId = students[0]!.id;
    const { rows: photos } = await pool.query<{ id: string; is_current: boolean }>(
      `insert into photos (student_id, version, is_current, expires_at)
       values ($1, 1, false, now() - interval '1 second'), ($1, 2, true, null) returning id, is_current`,
      [studentId],
    );
    const expired = photos.find((photo) => !photo.is_current)!.id;
    const current = photos.find((photo) => photo.is_current)!.id;
    const keys = (photoId: string) => ['large', 'medium', 'thumb'].map((variant) => `photos/main/${studentId}/${photoId}/${variant}.webp`);
    for (const key of [...keys(expired), ...keys(current)]) {
      await minio.client.send(new PutObjectCommand({ Bucket: minio.bucket, Key: key, Body: Buffer.from('webp de teste') }));
    }
    expect(await keysOf()).toEqual([...keys(expired), ...keys(current)].sort());

    // o teste não envia requisição nenhuma ao processo
    child = spawnApi({ ...validEnv, ...minio.env, DATABASE_URL: postgres.url, PORT: String(await freePort()) }).child;

    await vi.waitFor(
      async () => {
        expect((await pool.query('select id from photos order by version')).rows).toEqual([{ id: current }]);
        expect(await keysOf()).toEqual(keys(current));
      },
      { timeout: 30_000, interval: 200 },
    );
    const { rows: audit } = await pool.query<{ user_id: string | null; entity_id: string }>(
      `select user_id, entity_id from audit_logs where action = 'student.photo_version_purged'`,
    );
    expect(audit).toEqual([{ user_id: null, entity_id: studentId }]);
  } finally {
    child?.kill();
    await pool.end();
    await minio.stop();
    await postgres.stop();
  }
}, 240_000);

test('real_process_survives_purge_failure_with_database_down', async () => {
  const port = await freePort();
  const { child, output } = spawnApi({ ...validEnv, DATABASE_URL: await refusingDatabaseUrl(), PORT: String(port) });
  const failures = () =>
    output()
      .split('\n')
      .filter((line) => line.startsWith('{') && line.includes('photo purge failed'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  try {
    await vi.waitFor(() => expect(failures().length).toBeGreaterThanOrEqual(1), { timeout: 20_000, interval: 200 });
    expect(failures()[0]).toMatchObject({ level: 'error', msg: 'photo purge failed' });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(child.exitCode).toBeNull();
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(503);
  } finally {
    child.kill();
  }
}, 60_000);

test('retention_days_rejected_exits_1_naming_var_without_values', async () => {
  const KEY = 'PHOTO_VERSION_RETENTION_DAYS';
  for (const value of ['0', '366', '1.5', 'abc']) {
    const { status, output } = startApiProcess({ ...validEnv, [KEY]: value });

    expect(status, value).toBe(1);
    expect(output, value).toContain(KEY);
  }

  for (const value of ['36600077', 'valor-secreto-da-retencao']) {
    const env = { ...validEnv, [KEY]: value };

    const { status, output } = startApiProcess(env);

    expect(status, value).toBe(1);
    expect(output, value).toContain(KEY);
    for (const [key, other] of Object.entries(env)) expect(output, `${value}: valor de ${key}`).not.toContain(other);
  }

  // nas duas bordas a API sobe e responde: o banco recusa conexão, e o /health diz 503
  for (const value of ['1', '365']) {
    const port = await freePort();
    const { child } = spawnApi({ ...validEnv, [KEY]: value, DATABASE_URL: await refusingDatabaseUrl(), PORT: String(port) });
    try {
      await vi.waitFor(
        async () => expect((await fetch(`http://127.0.0.1:${port}/health`)).status, value).toBe(503),
        { timeout: 20_000, interval: 200 },
      );
    } finally {
      child.kill();
    }
  }
}, 120_000);
