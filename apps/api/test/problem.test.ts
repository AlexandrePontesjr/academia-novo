import { afterAll, beforeAll, expect, test } from 'vitest';
import { BOOM_MESSAGE, BoomController, startApi } from './support/app.ts';
import { refusingDatabaseUrl } from './support/servers.ts';

let api: Awaited<ReturnType<typeof startApi>>;

beforeAll(async () => {
  api = await startApi(await refusingDatabaseUrl(), [BoomController]);
});

afterAll(async () => {
  await api?.close();
});

test('unknown_route_404_problem', async () => {
  const response = await fetch(`${api.url}/rota-que-nao-existe`);
  const body = (await response.json()) as Record<string, unknown>;

  expect(response.status).toBe(404);
  expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
  expect(body.status).toBe(404);
  expect(body.code).toBe('not_found');
  expect(body.type).toEqual(expect.any(String));
  expect(body.type).not.toBe('');
  expect(body.title).toEqual(expect.any(String));
  expect(body.title).not.toBe('');
  expect(body.requestId).toEqual(expect.any(String));
  expect(body.requestId).not.toBe('');
});

test('unhandled_500_hides_exception', async () => {
  const response = await fetch(`${api.url}/boom`);
  const text = await response.text();

  expect(response.status).toBe(500);
  expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
  expect(JSON.parse(text).code).toBe('internal_error');
  expect(text).not.toContain(BOOM_MESSAGE);
  expect(text).not.toMatch(/\bat\s+\S.*:\d+:\d+/);
  expect(text).not.toContain('Error:');
  expect(text).not.toContain('stack');
});
