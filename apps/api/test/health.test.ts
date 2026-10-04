import { afterAll, beforeAll, expect, test } from 'vitest';
import { startApi } from './support/app.ts';
import { refusingDatabaseUrl, startHangingDatabase, startPostgres } from './support/servers.ts';

let postgres: Awaited<ReturnType<typeof startPostgres>>;
const cleanups: Array<() => Promise<unknown>> = [];

beforeAll(async () => {
  postgres = await startPostgres();
}, 180_000);

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
  await postgres?.stop();
});

test('health_ok_200', async () => {
  const api = await startApi(postgres.url);
  cleanups.push(api.close);

  const response = await fetch(`${api.url}/health`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', checks: { database: 'up' } });
});

test('health_503_when_db_refuses', async () => {
  const api = await startApi(await refusingDatabaseUrl());
  cleanups.push(api.close);

  const response = await fetch(`${api.url}/health`);

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'degraded', checks: { database: 'down' } });
});

test('health_503_within_3s_when_db_hangs', async () => {
  const hanging = await startHangingDatabase();
  const api = await startApi(hanging.url);
  cleanups.push(api.close, hanging.stop);

  const startedAt = performance.now();
  const response = await fetch(`${api.url}/health`);
  const body = await response.json();
  const elapsedMs = performance.now() - startedAt;

  expect(response.status).toBe(503);
  expect(body).toEqual({ status: 'degraded', checks: { database: 'down' } });
  expect(elapsedMs).toBeLessThanOrEqual(3000);
});
