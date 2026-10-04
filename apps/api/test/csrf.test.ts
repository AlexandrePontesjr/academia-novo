import { All, Controller } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { Public } from '../src/access.ts';
import { WEB_ORIGIN } from './support/app.ts';
import { problem, type Stack, startStack } from './support/stack.ts';

const FOREIGN = 'https://outro.example';

let executed = 0;

@Controller('api/test')
class WriteProbeController {
  @All('probe')
  @Public()
  probe() {
    executed += 1;
    return { ok: true };
  }
}

let stack: Stack;

beforeAll(async () => {
  stack = await startStack([WriteProbeController]);
}, 180_000);

beforeEach(() => {
  executed = 0;
});

afterAll(() => stack?.close());

test('foreign_origin_403_without_running_handler', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await stack.client().request(method, '/api/test/probe', { origin: FOREIGN });

    expect(response.status, method).toBe(403);
    expect(response.headers.get('content-type'), method).toMatch(/^application\/problem\+json\b/);
    expect((await problem(response)).code, method).toBe('csrf_rejected');
  }
  expect(executed).toBe(0);

  const user = await stack.seed();
  const login = await stack
    .client()
    .post('/api/auth/login', { email: user.email, password: user.password }, { origin: FOREIGN });
  expect(login.status).toBe(403);
  expect((await problem(login)).code).toBe('csrf_rejected');
  expect(login.headers.getSetCookie()).toEqual([]);
  expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toEqual([]);
});

test('missing_origin_403_unless_same_origin', async () => {
  const cases: Array<Record<string, string>> = [
    {},
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'same-site' },
  ];

  for (const headers of cases) {
    const response = await stack.client().request('POST', '/api/test/probe', { origin: null, headers });

    expect(response.status, JSON.stringify(headers)).toBe(403);
    expect((await problem(response)).code, JSON.stringify(headers)).toBe('csrf_rejected');
  }
  expect(executed).toBe(0);
});

test('same_origin_and_safe_methods_pass', async () => {
  const cases: Array<{ method: string; origin: string | null; headers: Record<string, string> }> = [
    { method: 'POST', origin: WEB_ORIGIN, headers: {} },
    { method: 'POST', origin: null, headers: { 'Sec-Fetch-Site': 'same-origin' } },
    { method: 'GET', origin: FOREIGN, headers: {} },
    { method: 'HEAD', origin: FOREIGN, headers: {} },
    { method: 'OPTIONS', origin: FOREIGN, headers: {} },
  ];

  for (const { method, origin, headers } of cases) {
    const before = executed;
    const response = await stack.client().request(method, '/api/test/probe', { origin, headers });
    const text = await response.text();

    expect(response.status, `${method} ${origin}`).toBeLessThan(300);
    expect(text, `${method} ${origin}`).not.toContain('csrf_rejected');
    expect(executed, `${method} ${origin}`).toBe(before + 1);
  }
});

test('origin_is_checked_before_body', async () => {
  const response = await stack.client().post('/api/auth/login', {}, { origin: FOREIGN });

  expect(response.status).toBe(403);
  expect((await problem(response)).code).toBe('csrf_rejected');
});
