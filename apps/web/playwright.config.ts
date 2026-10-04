import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3100;
export const FAKE_API_PORT = 3199;

export default defineConfig({
  testDir: './e2e',
  // os testes trocam o comportamento de uma única API falsa, então rodam um de cada vez
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // build de produção: o tempo de resposta medido é o do servidor que vai para a imagem
    command: `pnpm exec next build && pnpm exec next start -H 127.0.0.1 -p ${WEB_PORT}`,
    url: `http://127.0.0.1:${WEB_PORT}`,
    env: { API_URL: `http://127.0.0.1:${FAKE_API_PORT}` },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
