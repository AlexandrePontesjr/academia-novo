import { request } from 'node:http';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { written } from './support/audit.ts';
import { WEB_ORIGIN } from './support/app.ts';
import { type Stack, startStack } from './support/stack.ts';

let stack: Stack;
let attempts = 0;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

/**
 * Uma ação auditada - um login recusado, que grava `auth.login_failed` - mandada pelo `node:http`,
 * que não acrescenta `User-Agent` nem mexe nos cabeçalhos dados. Devolve a linha gravada.
 */
async function auditedAction(headers: Record<string, string>, extraBody: Record<string, unknown> = {}) {
  attempts += 1;
  const body = JSON.stringify({ email: `origem${attempts}@exemplo.com`, password: 'senha-errada-000', ...extraBody });
  const { result: status, rows } = await written(
    stack,
    () =>
      new Promise<number>((resolve, reject) => {
        const req = request(
          `${stack.api.url}/api/auth/login`,
          {
            method: 'POST',
            headers: {
              Origin: WEB_ORIGIN,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              ...headers,
            },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode ?? 0));
          },
        );
        req.on('error', reject);
        req.end(body);
      }),
  );
  expect(status).toBe(401);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.action).toBe('auth.login_failed');
  return rows[0]!;
}

test('ip_comes_from_forwarded_for', async () => {
  const row = await auditedAction({ 'X-Forwarded-For': '203.0.113.7' });

  expect(row.ip).toBe('203.0.113.7');
});

test('ip_is_the_rightmost_forwarded_address', async () => {
  const row = await auditedAction({ 'X-Forwarded-For': '198.51.100.1, 203.0.113.7' });

  expect(row.ip).toBe('203.0.113.7');
});

test('user_agent_is_cut_at_512_characters', async () => {
  const agent = (length: number) => 'teste/1.0 '.repeat(60).slice(0, length - 1) + 'Z';
  const cases: Array<[sent: number, stored: number]> = [
    [20, 20],
    [512, 512],
    [513, 512],
  ];

  for (const [sent, stored] of cases) {
    const header = agent(sent);
    expect(header).toHaveLength(sent);

    const row = await auditedAction({ 'User-Agent': header });

    expect(row.user_agent, `${sent} caracteres`).toBe(header.slice(0, stored));
    expect(row.user_agent, `${sent} caracteres`).toHaveLength(stored);
  }
});

test('missing_user_agent_is_null', async () => {
  const row = await auditedAction({});

  expect(row.user_agent).toBeNull();
});

test('created_at_comes_from_the_database_clock', async () => {
  const now = async () => (await stack.query<{ now: Date }>('select clock_timestamp() as now'))[0]!.now;
  const before = await now();

  const row = await auditedAction(
    { Date: new Date('2000-01-01T00:00:00Z').toUTCString() },
    { createdAt: '2000-01-01T00:00:00Z' },
  );
  const after = await now();

  expect(row.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
  expect(row.created_at.getTime()).toBeLessThanOrEqual(after.getTime());
});
