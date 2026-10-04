import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['*.test.ts'],
    testTimeout: 120_000,
    // cada arquivo sobe containers ou roda o portão inteiro num clone; em paralelo disputariam portas
    fileParallelism: false,
  },
});
