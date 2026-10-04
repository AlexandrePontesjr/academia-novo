import { afterAll, beforeAll, expect, test } from 'vitest';
import { BoomController, startApi } from './support/app.ts';
import { refusingDatabaseUrl, startPostgres } from './support/servers.ts';

let postgres: Awaited<ReturnType<typeof startPostgres>>;
let healthy: Awaited<ReturnType<typeof startApi>>;
let degraded: Awaited<ReturnType<typeof startApi>>;

beforeAll(async () => {
  postgres = await startPostgres();
  healthy = await startApi(postgres.url, [BoomController]);
  degraded = await startApi(await refusingDatabaseUrl(), [BoomController]);
}, 180_000);

afterAll(async () => {
  await healthy?.close();
  await degraded?.close();
  await postgres?.stop();
});

test('header_on_every_status', async () => {
  const cases = [
    { status: 200, url: `${healthy.url}/health` },
    { status: 503, url: `${degraded.url}/health` },
    { status: 404, url: `${healthy.url}/rota-que-nao-existe` },
    { status: 500, url: `${healthy.url}/boom` },
  ];

  for (const { status, url } of cases) {
    const response = await fetch(url);

    expect(response.status, url).toBe(status);
    expect(response.headers.get('x-request-id'), `X-Request-Id em ${status}`).toMatch(/\S/);
  }
});

test('header_equals_body_request_id', async () => {
  const cases = [
    { status: 404, url: `${healthy.url}/rota-que-nao-existe` },
    { status: 500, url: `${healthy.url}/boom` },
  ];

  for (const { status, url } of cases) {
    const response = await fetch(url);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status, url).toBe(status);
    expect(body.requestId, `requestId em ${status}`).toMatch(/\S/);
    expect(response.headers.get('x-request-id')).toBe(body.requestId);
  }
});
