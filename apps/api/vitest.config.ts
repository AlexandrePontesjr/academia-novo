import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // o `dist` que os testes de processo real executam é construído uma vez, antes de todos
    globalSetup: ['test/support/build.ts'],
    testTimeout: 30_000,
    // ligada pelo script `test` (`--coverage`), que é o que o `pnpm verify` roda; uma prova
    // isolada (`vitest run <arquivo>`) não mede cobertura nem tropeça no limiar
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text-summary'],
      thresholds: { lines: 70, branches: 70 },
    },
  },
});
