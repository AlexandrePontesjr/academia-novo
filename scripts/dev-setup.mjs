// Garante o `.env` local: copia do `.env.example` só quando ainda não existe.
// Roda em `pnpm dev:db` (e nos `dev:api`/`dev:web`), para um clone novo subir sem passo manual.

import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** O diretório do repositório: este arquivo mora em `scripts/`. */
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const envFile = join(repoRoot, '.env');
const exampleFile = join(repoRoot, '.env.example');

if (existsSync(exampleFile)) {
  if (existsSync(envFile)) {
    // o `.env` de quem já configurou nunca é sobrescrito
  } else {
    copyFileSync(exampleFile, envFile);
    console.log('dev-setup: .env criado a partir de .env.example (valores só de desenvolvimento)');
  }
} else {
  console.error('dev-setup: .env.example não encontrado');
  process.exitCode = 1;
}
