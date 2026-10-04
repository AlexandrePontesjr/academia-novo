// Os pacotes do workspace são código-fonte TypeScript, então entram no bundle;
// tudo o que vem do npm fica externo e é resolvido em node_modules na execução.
export const buildOptions = (entryPoints, outdir) => ({
  entryPoints,
  outdir,
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
