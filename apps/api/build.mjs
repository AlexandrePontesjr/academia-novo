import { build } from 'esbuild';
import { buildOptions } from './build-options.mjs';

// `main` é o processo da API; `create-admin` é o comando `pnpm users:create-admin`
await build(buildOptions(['src/main.ts', 'src/create-admin.ts'], 'dist'));
