import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, test } from 'vitest';
import { envSchema } from '../src/env.ts';

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
