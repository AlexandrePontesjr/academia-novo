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

/** A imagem do servidor de objetos da door 1, como o plano a fixou: tag e digest. */
const STORAGE_IMAGE =
  'rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c';

/** O texto de um arquivo do repositório. */
function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

test('storage_helper_uses_the_rustfs_image_credentials_readiness_and_bucket', () => {
  const source = read('apps/api/test/support/servers.ts');

  // a constante da imagem é o literal da door 1, e é ela que sobe o container
  expect(/export const STORAGE_IMAGE =\s*\n?\s*'([^']+)'/.exec(source)?.[1]).toBe(STORAGE_IMAGE);
  expect(source).toMatch(/new GenericContainer\(STORAGE_IMAGE\)/);
  // as duas credenciais que o RustFS lê, com os valores do teste
  expect(source).toMatch(/RUSTFS_ACCESS_KEY: STORAGE_ACCESS_KEY/);
  expect(source).toMatch(/RUSTFS_SECRET_KEY: STORAGE_SECRET_KEY/);
  // espera `GET /health/ready` responder 200 antes de criar o bucket `photos-test` pelo cliente S3
  const readinessAt = source.indexOf("Wait.forHttp('/health/ready', 9000).forStatusCode(200)");
  const bucketAt = source.indexOf('new CreateBucketCommand');
  expect(readinessAt, 'espera de prontidão').toBeGreaterThan(-1);
  expect(bucketAt, 'criação do bucket').toBeGreaterThan(-1);
  expect(readinessAt).toBeLessThan(bucketAt);
  expect(source).toContain("const STORAGE_BUCKET = 'photos-test'");
  // a forma do retorno: `{ endpoint, bucket, env, client, stop }`, com `env` no endpoint do container
  expect(source).toMatch(/return \{ endpoint, bucket: STORAGE_BUCKET, env, client, stop:/);
  expect(source).toMatch(/S3_ENDPOINT: endpoint/);
  expect(source).toMatch(/S3_BUCKET: STORAGE_BUCKET/);
});

test('api_declares_testcontainers_and_the_minio_module_is_gone', () => {
  const api = JSON.parse(read('apps/api/package.json')) as { devDependencies: Record<string, string> };

  expect(api.devDependencies.testcontainers).toBe('^12.2.0');

  // montado em runtime para o próprio teste não ser um resultado do `git grep` da C19
  const minioModule = ['@testcontainers', 'minio'].join('/');
  const manifests = ['package.json', ...workspaceDirs().map((dir) => `${dir}/package.json`)];
  for (const manifest of manifests) {
    expect(read(manifest), manifest).not.toContain(minioModule);
  }
  expect(read('pnpm-lock.yaml')).not.toContain(minioModule);
});

test('storage_image_is_the_same_digest_in_compose_and_the_api_helper', () => {
  const compose = parseYaml(read('compose.yaml')) as { services: Record<string, { image?: string }> };
  // tag e digest, iguais ao literal da door 1
  expect(compose.services.storage?.image).toBe(STORAGE_IMAGE);
  expect(compose.services.storage?.image).toMatch(/^rustfs\/rustfs:1\.0\.1@sha256:[0-9a-f]{64}$/);

  expect(/export const STORAGE_IMAGE =\s*\n?\s*'([^']+)'/.exec(read('apps/api/test/support/servers.ts'))?.[1]).toBe(
    STORAGE_IMAGE,
  );

  // o identificador antigo não existe em nenhum arquivo fora do histórico de `.specs/`
  // (montado em runtime para o próprio teste não ser um resultado do `git grep`)
  const legacyImage = ['MINIO', 'IMAGE'].join('_');
  expect(grepOutsideSpecs(['-n', legacyImage])).toEqual([]);
});

/** As linhas de um `git grep` que não estão em `.specs/` (o histórico das features fica fora da varredura). */
function grepOutsideSpecs(args: string[]): string[] {
  const grep = spawnSync('git', ['grep', ...args], { cwd: repoRoot, encoding: 'utf8' });
  return (grep.stdout ?? '')
    .split(/\r?\n/)
    .filter((line) => line !== '' && !line.startsWith('.specs/'));
}

test('minio_identifiers_are_absent_outside_specs', () => {
  // montado em runtime para o próprio teste não ser um resultado do `git grep`
  const pattern = [
    ['pgs', 'ty'].join(''),
    ['Minio', 'Container'].join(''),
    ['@testcontainers/', 'minio'].join(''),
    ['MINIO', '_ROOT'].join(''),
    ['minio', '/health'].join(''),
  ].join('|');

  expect(grepOutsideSpecs(['-i', '-E', pattern])).toEqual([]);
});

test('mc_commands_are_absent_outside_specs', () => {
  // montado em runtime para o próprio teste não ser um resultado do `git grep`
  const pattern = ['\\bmc', '(alias|mb|ls)\\b'].join(' ');

  expect(grepOutsideSpecs(['-E', pattern])).toEqual([]);
});

test('env_example_describes_the_stack_storage_as_rustfs', () => {
  const lines = read('.env.example').split(/\r?\n/);
  for (const line of lines) {
    expect(line, 'nenhuma linha de `.env.example` cita MinIO').not.toMatch(/minio/i);
  }

  const rustfsComments = lines.filter((line) => line.startsWith('#') && /RustFS/.test(line));
  expect(rustfsComments.length, 'um comentário descreve o armazenamento como RustFS').toBeGreaterThan(0);
  expect(rustfsComments.join('\n')).toMatch(/armazenamento|S3/i);
});

test('state_registers_the_rustfs_decision_and_supersedes_ad_042', () => {
  const rows = read('.specs/STATE.md')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('| AD-'));
  const rowOf = (decision: string) => rows.find((line) => line.startsWith(`| ${decision} |`));
  const ad042 = rowOf('AD-042');
  const ad082 = rowOf('AD-082');
  expect(ad042, 'AD-042 no STATE.md').toBeDefined();
  expect(ad082, 'AD-082 no STATE.md').toBeDefined();

  // a AD-042 passa a `superseded by AD-082`
  expect(ad042).toContain('superseded by AD-082');

  // a AD-082 é `active` e repete a AD-042 inteira com o RustFS da door 1 e o `aws-cli` da door 2
  const cells = ad082!.split('|').map((cell) => cell.trim());
  expect(cells[1]).toBe('AD-082');
  expect(cells.at(-3), 'status da AD-082').toBe('active');
  for (const member of [
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'a API é a única que lê e grava',
    '/health',
    'storage',
    'RustFS',
    'aws-cli',
  ]) {
    expect(ad082, member).toContain(member);
  }
});

test('state_branch_line_no_longer_names_the_minio_image', () => {
  const branch = read('.specs/STATE.md')
    .split(/\r?\n/)
    .find((line) => line.startsWith('**Branch**'));
  expect(branch, 'linha `**Branch**` no Handoff').toBeDefined();
  // montado em runtime para o próprio teste não ser um resultado do `git grep` da C19
  expect(branch).not.toMatch(new RegExp(['pgs', 'ty'].join('') + '/minio', 'i'));
  expect(branch).toMatch(/RustFS/i);
});
