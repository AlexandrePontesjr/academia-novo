// Roda o `next dev` na máquina com o `.env` da raiz carregado.
// O `--env-file` do Node iria para o `execArgv`, e o `next dev` o repassa via `NODE_OPTIONS` ao
// processo que ele forka - o Node recusa `--env-file` ali. Carregar no `process.env` e deixar o
// filho herdar evita essa volta.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

/** O diretório do repositório: este arquivo mora em `scripts/`. */
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const appDir = join(repoRoot, 'apps', 'web');
const envFile = join(repoRoot, '.env');

if (existsSync(envFile)) loadEnvFile(envFile);

const next = spawn(
  process.execPath,
  [join(appDir, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', '3000'],
  { cwd: appDir, stdio: 'inherit', env: process.env },
);

next.on('exit', (code) => process.exit(code ?? 0));
