import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Constrói o `dist` (o mesmo da imagem) uma vez por execução do Vitest. */
export default function build() {
  const result = spawnSync('pnpm build', {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    shell: true,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`pnpm build falhou: ${result.stdout}\n${result.stderr}`);
}
