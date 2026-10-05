import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** Quebra a execução única que cria o bucket: o comando passa a ser um que não existe. */
export function breakBucketInit(cloneDir: string) {
  const path = join(cloneDir, 'compose.yaml');
  const compose = readFileSync(path, 'utf8');
  const broken = compose.replace('mc mb --ignore-existing', 'mc comando-que-nao-existe');
  if (broken === compose) throw new Error('compose.yaml não tem a execução que cria o bucket');
  writeFileSync(path, broken);
}
