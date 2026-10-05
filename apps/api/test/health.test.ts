import { afterAll, beforeAll, expect, test } from 'vitest';
import { startApi } from './support/app.ts';
import { freePort, type Minio, refusingDatabaseUrl, startHangingDatabase, startMinio, startPostgres } from './support/servers.ts';

let postgres: Awaited<ReturnType<typeof startPostgres>>;
let minio: Minio;
const cleanups: Array<() => Promise<unknown>> = [];

beforeAll(async () => {
  postgres = await startPostgres();
  minio = await startMinio();
}, 180_000);

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
  await postgres?.stop();
  await minio?.stop();
});

test('health_ok_200', async () => {
  const api = await startApi(postgres.url, [], minio.env);
  cleanups.push(api.close);

  const response = await fetch(`${api.url}/health`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', checks: { database: 'up', storage: 'up' } });
});

test('health_503_when_db_refuses', async () => {
  const api = await startApi(await refusingDatabaseUrl(), [], minio.env);
  cleanups.push(api.close);

  const response = await fetch(`${api.url}/health`);

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'degraded', checks: { database: 'down', storage: 'up' } });
});

test('health_503_within_3s_when_db_hangs', async () => {
  const hanging = await startHangingDatabase();
  const api = await startApi(hanging.url, [], minio.env);
  cleanups.push(api.close, hanging.stop);

  const startedAt = performance.now();
  const response = await fetch(`${api.url}/health`);
  const body = await response.json();
  const elapsedMs = performance.now() - startedAt;

  expect(response.status).toBe(503);
  expect(body).toEqual({ status: 'degraded', checks: { database: 'down', storage: 'up' } });
  expect(elapsedMs).toBeLessThanOrEqual(3000);
});

test('health_storage_up_down_missing_bucket_and_hanging', async () => {
  const hanging = await startHangingDatabase();
  const cases: Array<[name: string, storage: Minio['env'], storageState: 'up' | 'down']> = [
    ['de pé', minio.env, 'up'],
    ['endpoint recusa a conexão', { ...minio.env, S3_ENDPOINT: `http://127.0.0.1:${await freePort()}` }, 'down'],
    ['bucket inexistente', { ...minio.env, S3_BUCKET: 'bucket-que-nao-existe' }, 'down'],
    ['endpoint aceita a conexão e nunca responde', { ...minio.env, S3_ENDPOINT: `http://127.0.0.1:${new URL(hanging.url).port}` }, 'down'],
  ];
  try {
    for (const [name, storage, state] of cases) {
      const api = await startApi(postgres.url, [], storage);
      cleanups.push(api.close);

      const startedAt = performance.now();
      const response = await fetch(`${api.url}/health`);
      const body = await response.json();
      const elapsedMs = performance.now() - startedAt;

      expect(response.status, name).toBe(state === 'up' ? 200 : 503);
      expect(body, name).toEqual({
        status: state === 'up' ? 'ok' : 'degraded',
        checks: { database: 'up', storage: state },
      });
      expect(elapsedMs, name).toBeLessThanOrEqual(3000);
    }
  } finally {
    await hanging.stop();
  }
});