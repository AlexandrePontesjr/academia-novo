import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

/** Roda `pnpm users:create-admin` de verdade, da raiz do repositório, contra o banco dado. */
export function createAdmin(databaseUrl: string, args: string[], env: Record<string, string> = {}) {
  // sem ADMIN_PASSWORD herdada: quem define a senha é o teste
  const inherited = { ...process.env };
  delete inherited.ADMIN_PASSWORD;
  const result = spawnSync(`pnpm users:create-admin ${args.join(' ')}`, {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    env: { ...inherited, DATABASE_URL: databaseUrl, ...env },
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}
