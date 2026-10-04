import { build } from 'esbuild';

// Os pacotes do workspace são código-fonte TypeScript, então entram no bundle;
// tudo o que vem do npm fica externo e é resolvido em node_modules na execução.
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  plugins: [
    {
      name: 'external-npm-packages',
      setup({ onResolve }) {
        onResolve({ filter: /^[^./]/ }, ({ path }) =>
          path.startsWith('@academia/') ? undefined : { path, external: true },
        );
      },
    },
  ],
});
