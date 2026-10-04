import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { expect, test } from '@playwright/test';
import { FAKE_API_PORT } from '../playwright.config.ts';

/**
 * A API que o web enxerga é falsa e controlada daqui: de pé, respondendo 503,
 * pendurada (aceita e não responde) ou recusando conexão (ninguém escutando).
 */
type ApiMode = 'ok' | '503' | 'hung' | 'refusing';

let server: Server | undefined;
const sockets = new Set<Socket>();

async function setApi(mode: ApiMode) {
  await stopApi();
  if (mode === 'refusing') return;

  server = createServer((_req, res) => {
    if (mode === 'hung') return;
    const body =
      mode === 'ok'
        ? { status: 'ok', checks: { database: 'up' } }
        : { status: 'degraded', checks: { database: 'down' } };
    res.writeHead(mode === 'ok' ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server!.listen(FAKE_API_PORT, '127.0.0.1', resolve));
}

async function stopApi() {
  if (!server) return;
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server!.close(resolve));
  server = undefined;
}

test.afterEach(stopApi);

test('shows_api_operational', async ({ page }) => {
  await setApi('ok');

  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Gestão de Academia' })).toBeVisible();
  await expect(page.getByText('API: operacional', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
});

test('shows_api_unavailable', async ({ page }) => {
  for (const mode of ['503', 'hung', 'refusing'] as const) {
    await setApi(mode);

    const response = await page.goto('/');

    expect(response?.status(), `API ${mode}`).toBe(200);
    await expect(page.getByText('API: indisponível', { exact: true }), `API ${mode}`).toBeVisible();
    await expect(page.getByText('API: operacional'), `API ${mode}`).toHaveCount(0);
  }
});

test('hung_api_answers_within_4s', async ({ page }) => {
  await setApi('hung');

  const startedAt = performance.now();
  const response = await page.goto('/');
  const elapsedMs = performance.now() - startedAt;

  expect(response?.status()).toBe(200);
  await expect(page.getByText('API: indisponível', { exact: true })).toBeVisible();
  expect(elapsedMs).toBeLessThanOrEqual(4000);
});
