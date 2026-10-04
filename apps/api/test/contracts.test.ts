import { healthResponseSchema, problemSchema } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { startApi } from './support/app.ts';
import { refusingDatabaseUrl, startPostgres } from './support/servers.ts';

let postgres: Awaited<ReturnType<typeof startPostgres>>;
let healthy: Awaited<ReturnType<typeof startApi>>;
let degraded: Awaited<ReturnType<typeof startApi>>;

beforeAll(async () => {
  postgres = await startPostgres();
  healthy = await startApi(postgres.url);
  degraded = await startApi(await refusingDatabaseUrl());
}, 180_000);

afterAll(async () => {
  await healthy?.close();
  await degraded?.close();
  await postgres?.stop();
});

test('responses_match_contract_schemas', async () => {
  const ok = await fetch(`${healthy.url}/health`);
  expect(ok.status).toBe(200);
  expect(healthResponseSchema.safeParse(await ok.json()).success).toBe(true);

  const down = await fetch(`${degraded.url}/health`);
  expect(down.status).toBe(503);
  expect(healthResponseSchema.safeParse(await down.json()).success).toBe(true);

  const notFound = await fetch(`${healthy.url}/rota-que-nao-existe`);
  expect(notFound.status).toBe(404);
  expect(problemSchema.safeParse(await notFound.json()).success).toBe(true);
});
