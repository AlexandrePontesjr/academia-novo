import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { resolveConfig } from 'vitest/node';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import { envSchema as apiEnvSchema } from '../../apps/api/src/env.ts';
import { envSchema as webEnvSchema } from '../../apps/web/src/env.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function requiredKeys(schema: z.ZodObject): string[] {
  return Object.entries(schema.shape)
    .filter(([, field]) => !(field as z.ZodType).safeParse(undefined).success)
    .map(([key]) => key);
}

/** Todo diretório de workspace declarado em `pnpm-workspace.yaml` (padrões `pasta/*`). */
function workspaceDirs(): string[] {
  const { packages } = parseYaml(readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')) as {
    packages: string[];
  };
  return packages.flatMap((pattern) => {
    expect(pattern).toMatch(/^[\w-]+\/\*$/);
    const parent = pattern.slice(0, -2);
    return readdirSync(join(repoRoot, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(repoRoot, parent, entry.name, 'package.json')))
      .map((entry) => `${parent}/${entry.name}`);
  });
}

test('env_example_lists_every_required_key', () => {
  const example = readFileSync(join(repoRoot, '.env.example'), 'utf8');
  const listed = example
    .split(/\r?\n/)
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((key) => key !== undefined);

  const required = [...requiredKeys(apiEnvSchema), ...requiredKeys(webEnvSchema)];
  expect(requiredKeys(apiEnvSchema).length).toBeGreaterThan(0);
  expect(requiredKeys(webEnvSchema).length).toBeGreaterThan(0);

  for (const key of required) {
    expect(listed, `.env.example deve listar ${key}`).toContain(key);
  }
});

test('env_example_documents_photo_variables_and_secret_command', () => {
  const lines = readFileSync(join(repoRoot, '.env.example'), 'utf8').split(/\r?\n/);
  const listed = lines.map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1]);
  for (const key of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'PHOTO_URL_SECRET']) {
    expect(listed, `.env.example deve listar ${key}`).toContain(key);
  }

  // o comando que gera o valor está nas linhas de comentário logo acima de PHOTO_URL_SECRET
  const at = listed.indexOf('PHOTO_URL_SECRET');
  const comment: string[] = [];
  for (let index = at - 1; index >= 0 && lines[index]!.startsWith('#'); index -= 1) comment.unshift(lines[index]!);
  const command = /openssl rand -base64 (\d+)/.exec(comment.join('\n'));
  expect(command, 'comando que gera o segredo, junto de PHOTO_URL_SECRET').not.toBeNull();
  // N bytes viram 4 * ceil(N / 3) caracteres em base64: o valor gerado tem 32 ou mais
  expect(4 * Math.ceil(Number(command![1]) / 3)).toBeGreaterThanOrEqual(32);
});

test('env_example_and_compose_do_not_mention_retention_days', () => {
  // os dias de guarda da foto trocada vêm de `privacy_settings` (privacidade, door 4): a variável saiu
  expect(readFileSync(join(repoRoot, '.env.example'), 'utf8')).not.toContain('PHOTO_VERSION_RETENTION_DAYS');
  expect(readFileSync(join(repoRoot, 'compose.yaml'), 'utf8')).not.toContain('PHOTO_VERSION_RETENTION_DAYS');
  expect(Object.keys(apiEnvSchema.shape)).not.toContain('PHOTO_VERSION_RETENTION_DAYS');
});

test('dotenv_is_git_ignored', () => {
  const result = spawnSync('git', ['check-ignore', '.env'], { cwd: repoRoot, encoding: 'utf8' });

  expect(result.status, result.stderr).toBe(0);
});

test('every_workspace_is_strict', () => {
  const dirs = workspaceDirs();
  for (const expected of ['apps/api', 'apps/web', 'packages/config', 'packages/contracts', 'packages/database']) {
    expect(dirs).toContain(expected);
  }

  // `packages/config` é a própria base: não tem código para compilar, só o tsconfig que os outros estendem
  for (const dir of dirs.filter((d) => d !== 'packages/config')) {
    const tsconfigPath = join(repoRoot, dir, 'tsconfig.json');
    expect(existsSync(tsconfigPath), `${dir}/tsconfig.json`).toBe(true);

    const declared = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
    expect(declared.extends, `${dir} estende a base`).toBe('@academia/config/tsconfig.base.json');

    const shown = spawnSync('pnpm exec tsc --showConfig -p .', {
      cwd: join(repoRoot, dir),
      shell: true,
      encoding: 'utf8',
    });
    expect(shown.status, `${dir}: ${shown.stdout}${shown.stderr}`).toBe(0);
    const resolved = JSON.parse(shown.stdout);
    expect(resolved.compilerOptions.strict, `${dir} strict`).toBe(true);
  }

  const base = JSON.parse(readFileSync(join(repoRoot, 'packages/config/tsconfig.base.json'), 'utf8'));
  expect(base.compilerOptions.strict).toBe(true);
});

test('ci_runs_verify_on_push_and_pr', () => {
  const path = join(repoRoot, '.github/workflows/ci.yml');
  expect(existsSync(path)).toBe(true);

  const workflow = parseYaml(readFileSync(path, 'utf8')) as {
    on: Record<string, unknown> | string[];
    jobs: Record<string, { steps: Array<{ run?: string }> }>;
  };
  const events = Array.isArray(workflow.on) ? workflow.on : Object.keys(workflow.on);
  expect(events).toContain('push');
  expect(events).toContain('pull_request');

  const commands = Object.values(workflow.jobs).flatMap((job) => job.steps.map((step) => step.run ?? ''));
  expect(commands.some((run) => /^pnpm verify\s*$/m.test(run))).toBe(true);
});

test('api_coverage_thresholds_are_70_lines_and_branches', async () => {
  const { test: resolved } = await resolveConfig({ root: join(repoRoot, 'apps/api') });

  expect(resolved?.coverage?.provider).toBe('v8');
  expect(resolved?.coverage?.include).toEqual(['src/**']);
  expect(resolved?.coverage?.thresholds).toMatchObject({ lines: 70, branches: 70 });

  // o `pnpm verify` roda a tarefa `test` de cada workspace; a da API liga a cobertura
  const root = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  expect(root.scripts.verify).toMatch(/^turbo run\b.*\btest\b/);
  const api = JSON.parse(readFileSync(join(repoRoot, 'apps/api/package.json'), 'utf8'));
  expect(api.scripts.test).toMatch(/^vitest run( .*)? --coverage( |$)/);
});

test('ui_package_is_the_shared_interface_base', () => {
  const readJson = (path: string) => JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));

  expect(workspaceDirs()).toContain('packages/ui');
  const ui = readJson('packages/ui/package.json');
  expect(ui.name).toBe('@academia/ui');
  expect(ui.dependencies.tailwindcss).toMatch(/\S/);
  expect(readJson('packages/ui/components.json').$schema).toBe('https://ui.shadcn.com/schema.json');

  const web = readJson('apps/web/package.json');
  for (const dependency of ['@academia/ui', 'react-hook-form', '@academia/contracts']) {
    expect(web.dependencies[dependency], `apps/web declara ${dependency}`).toMatch(/\S/);
  }

  // as tarefas que o `pnpm verify` roda, como o Turborepo as resolve
  const dry = spawnSync('pnpm exec turbo run lint typecheck test build --dry-run=json', {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  expect(dry.status, dry.stderr).toBe(0);
  const { tasks } = JSON.parse(dry.stdout.slice(dry.stdout.indexOf('{'))) as {
    tasks: Array<{ taskId: string; command: string }>;
  };
  for (const taskId of ['@academia/ui#lint', '@academia/ui#typecheck']) {
    const task = tasks.find((candidate) => candidate.taskId === taskId);
    expect(task, taskId).toBeDefined();
    expect(task?.command, taskId).not.toBe('<NONEXISTENT>');
    expect(task?.command, taskId).toMatch(/\S/);
  }
});

test('env_example_documents_data_encryption_key', () => {
  const lines = readFileSync(join(repoRoot, '.env.example'), 'utf8').split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith('DATA_ENCRYPTION_KEY='));
  expect(at, 'a chave está listada').toBeGreaterThan(0);

  // o comando que gera uma chave de 32 bytes em base64 está nos comentários logo acima
  let start = at;
  while (start > 0 && lines[start - 1]!.startsWith('#')) start -= 1;
  expect(lines.slice(start, at).join('\n')).toContain('openssl rand -base64 32');

  // e o valor de exemplo é uma chave que a API aceita
  const example = lines[at]!.slice('DATA_ENCRYPTION_KEY='.length);
  expect(apiEnvSchema.shape.DATA_ENCRYPTION_KEY.safeParse(example).success).toBe(true);
});

test('is_minor_defined_once_in_contracts', () => {
  const declaration = /\b(?:function|const|let|var)\s+isMinor\b/;
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', '.next', 'coverage', '.turbo'].includes(entry.name)) walk(path);
      } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && declaration.test(readFileSync(join(repoRoot, path), 'utf8'))) {
        found.push(path);
      }
    }
  };
  for (const root of ['apps', 'packages']) walk(root);

  expect(found).toEqual(['packages/contracts/src/students.ts']);
  expect(readFileSync(join(repoRoot, 'packages/contracts/src/index.ts'), 'utf8')).toContain("export * from './students.ts';");
});
