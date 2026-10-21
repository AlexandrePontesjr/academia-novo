import { spawn } from 'node:child_process';
import process from 'node:process';
import { build, context } from 'esbuild';
import { buildOptions } from './build-options.mjs';

// `main` é o processo da API; `create-admin` é o comando `pnpm users:create-admin`
const options = buildOptions(['src/main.ts', 'src/create-admin.ts'], 'dist');

if (!process.argv.includes('--watch')) {
  await build(options);
} else {
  // Desenvolvimento: o esbuild recompila a cada mudança e o processo da API é reiniciado assim que
  // a recompilação termina sem erro. O watcher do Node olharia todo módulo importado (inclusive em
  // node_modules); este reinício segue só o bundle.
  let api = null;
  const start = () => {
    api?.kill();
    api = spawn(process.execPath, ['dist/main.js'], { stdio: 'inherit' });
  };

  options.plugins.push({
    name: 'restart-api',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length === 0) start();
      });
    },
  });

  const ctx = await context(options);
  await ctx.watch();

  const stop = () => {
    api?.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
