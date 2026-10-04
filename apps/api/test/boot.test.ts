import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, test, vi } from 'vitest';
import { envSchema } from '../src/env.ts';
import { invalidChunk, rawExchange } from './support/raw.ts';
import { freePort, refusingDatabaseUrl } from './support/servers.ts';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));

const SECRET = 's3nha-ultra-secreta';
const validEnv: Record<string, string> = {
  DATABASE_URL: `postgres://academia:${SECRET}@127.0.0.1:5432/academia`,
  PORT: '39871',
};

const requiredKeys = Object.entries(envSchema.shape)
  .filter(([, field]) => !field.safeParse(undefined).success)
  .map(([key]) => key);

beforeAll(() => {
  const build = spawnSync('pnpm build', { cwd: apiRoot, shell: true, encoding: 'utf8' });
  expect(build.status, build.stderr).toBe(0);
}, 120_000);

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
});

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

test('real_process_logs_delivered_body_error', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: apiRoot,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
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
