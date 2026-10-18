import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Ambiente do processo sem o que o Vitest injeta (NODE_ENV=test quebraria o `next build`). */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== 'NODE_ENV' && !key.startsWith('VITEST')),
  );
  return { ...env, ...extra };
}

export function run(command: string, cwd: string, env: Record<string, string> = {}) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    env: cleanEnv(env),
    maxBuffer: 256 * 1024 * 1024,
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

/**
 * Clone limpo: um repositório git novo, em pasta temporária, contendo exatamente o que um
 * `git clone` traria se a árvore de trabalho atual estivesse commitada - arquivos rastreados e
 * não rastreados que o `.gitignore` não exclui. Sem `node_modules`, sem `.env`, sem build.
 */
export function cleanClone(): string {
  const dir = mkdtempSync(join(tmpdir(), 'academia-clone-'));
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (listed.status !== 0) throw new Error(`git ls-files falhou: ${listed.stderr}`);

  for (const file of listed.stdout.split('\0').filter(Boolean)) {
    const source = join(repoRoot, file);
    if (!existsSync(source)) continue; // removido da árvore de trabalho
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    cpSync(source, join(dir, file));
  }

  for (const args of [
    ['init', '--quiet'],
    ['add', '--all'],
    ['-c', 'user.name=stack-tests', '-c', 'user.email=stack-tests@example.invalid', 'commit', '--quiet', '-m', 'clone'],
  ]) {
    const git = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (git.status !== 0) throw new Error(`git ${args[0]} falhou: ${git.stderr}`);
  }
  return dir;
}

export function removeClone(dir: string) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** Acrescenta ao clone uma migração de SQL inválido, registrada no journal do Drizzle. */
export function addBrokenMigration(cloneDir: string) {
  const folder = join(cloneDir, 'packages/database/migrations');
  const journalPath = join(folder, 'meta/_journal.json');
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
}

/** Pares CHAVE=valor de um arquivo `.env`. */
export function readDotenv(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
        return match ? [[match[1]!, match[2]!]] : [];
      }),
  );
}

/** Quebra a execução única que cria o bucket: o comando de criação passa a ser um que não existe. */
export function breakBucketInit(cloneDir: string) {
  const path = join(cloneDir, 'compose.yaml');
  const compose = readFileSync(path, 'utf8');
  // o `head-bucket` falha com o bucket ausente e o `||` cai no comando quebrado
  const broken = compose.replace('aws s3api create-bucket', 'aws s3api comando-que-nao-existe');
  if (broken === compose) throw new Error('compose.yaml não tem a execução que cria o bucket');
  writeFileSync(path, broken);
}

/**
 * O `bash` do PATH no Windows é o launcher do WSL, que pode não alcançar o Docker do host: a suíte
 * usa o Git Bash quando ele existe (o mecanismo fica registrado no `## Handoff` da feature).
 */
export const BASH =
  process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
    ? 'C:/Program Files/Git/bin/bash.exe'
    : 'bash';

/** Roda um script `deploy/*.sh` no clone, com o ambiente da stack de produção. */
export function runBash(argument: string, cwd: string, env: Record<string, string> = {}) {
  return run(`"${BASH}" ${argument}`, cwd, env);
}

/** O `stdout` de um comando, sem o `stderr`: é dele que saem o JSON do Compose e o PEM da CA. */
export function capture(command: string, cwd: string, env: Record<string, string> = {}): string {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    env: cleanEnv(env),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${command} falhou: ${result.stderr}`);
  return result.stdout;
}

/** O `stdout` binário de um comando (o conteúdo de um objeto do bucket, por exemplo). */
export function captureBuffer(command: string, cwd: string, env: Record<string, string> = {}): Buffer {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    env: cleanEnv(env),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${command} falhou: ${String(result.stderr)}`);
  return result.stdout as Buffer;
}

export interface ProductionPorts {
  POSTGRES_PORT: string;
  PORT: string;
  WEB_PORT: string;
  STORAGE_PORT: string;
  CADDY_HTTP_PORT: string;
  CADDY_HTTPS_PORT: string;
  PROMETHEUS_PORT: string;
  ALERTMANAGER_PORT: string;
}

export interface ProductionStack {
  dir: string;
  project: string;
  webOrigin: string;
  backupDir: string;
  ports: ProductionPorts;
  env: Record<string, string>;
  compose(args: string, extraEnv?: Record<string, string>): { status: number | null; output: string };
  containers(): Array<{ ID: string; Service: string; State: string; Health: string; ExitCode: number }>;
  deploy(): { status: number | null; output: string };
  ca(): string;
  destroy(): void;
}

/** Uma stack de produção isolada: clone limpo, overlay do Compose, projeto e portas próprios. */
export async function prepareProductionStack(
  name: string,
  options: { alertWebhookUrl?: string } = {},
): Promise<ProductionStack> {
  const dir = cleanClone();
  copyFileSync(join(dir, '.env.example'), join(dir, '.env'));
  const project = `academia-prod-${name}-${process.pid}`;
  const ports: ProductionPorts = {
    POSTGRES_PORT: String(await freePort()),
    PORT: String(await freePort()),
    WEB_PORT: String(await freePort()),
    STORAGE_PORT: String(await freePort()),
    CADDY_HTTP_PORT: String(await freePort()),
    CADDY_HTTPS_PORT: String(await freePort()),
    PROMETHEUS_PORT: String(await freePort()),
    ALERTMANAGER_PORT: String(await freePort()),
  };
  const backupDir = mkdtempSync(join(tmpdir(), 'academia-backup-')).replaceAll('\\', '/');
  const webOrigin = `https://localhost:${ports.CADDY_HTTPS_PORT}`;
  const env = {
    COMPOSE_PROJECT_NAME: project,
    SITE_ADDRESS: 'localhost',
    ACME_EMAIL: 'operacao@exemplo.invalid',
    ALERT_WEBHOOK_URL: options.alertWebhookUrl ?? 'http://host.docker.internal:9/alert',
    BACKUP_DIR: backupDir,
    BACKUP_RETENTION_DAYS: '30',
    WEB_ORIGIN: webOrigin,
    ...ports,
  };
  return {
    dir,
    project,
    webOrigin,
    backupDir,
    ports,
    env,
    compose: (args, extraEnv = {}) => run(`docker compose ${args}`, dir, { ...env, ...extraEnv }),
    containers: () =>
      (capture('docker compose ps --all --format json', dir, env) ?? '')
        .split('\n')
        .filter((line) => line.trim().startsWith('{'))
        .map((line) => JSON.parse(line)),
    deploy: () => runBash('deploy/deploy.sh', dir, env),
    ca: () => capture('docker compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt', dir, env).trim(),
    destroy: () => {
      run('docker compose down --volumes --rmi local --remove-orphans', dir, env);
      removeClone(dir);
      rmSync(backupDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    },
  };
}

