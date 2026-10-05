import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { beforeAll, expect, test, vi } from 'vitest';
import { buildOptions } from '../build-options.mjs';
import { envSchema } from '../src/env.ts';
import { invalidChunk, rawExchange } from './support/raw.ts';
import { freePort, refusingDatabaseUrl } from './support/servers.ts';

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