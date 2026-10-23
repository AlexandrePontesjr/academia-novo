import { All, Controller } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { Public } from '../src/access.ts';
import { WEB_ORIGIN } from './support/app.ts';
import { leadBody, postLead, recorded } from './support/leads.ts';
import { captureMail, confirmLink } from './support/mail.ts';
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
const mail = captureMail();

beforeAll(async () => {
  stack = await startStack([WriteProbeController], undefined, { mail: mail.transport });
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

test('origin_check_covers_every_spelling_the_router_dispatches', async () => {
  // o roteador do Express não diferencia maiúsculas nem a barra final: estes caminhos chegam ao
  // mesmo handler que `/api/test/probe`
  const dispatched = ['/API/test/probe', '/Api/Test/Probe', '/api/test/probe/', '/API/TEST/PROBE/'];
  for (const path of dispatched) {
    const allowed = await stack.client().request('POST', path);
    expect(allowed.status, `${path}, origem do web`).toBeLessThan(300);
  }
  expect(executed).toBe(dispatched.length);
  executed = 0;

  for (const path of dispatched) {
    for (const origin of [FOREIGN, null]) {
      const response = await stack.client().request('POST', path, { origin });

      expect(response.status, `${path}, origem ${origin}`).toBe(403);
      expect((await problem(response)).code, `${path}, origem ${origin}`).toBe('csrf_rejected');
    }
  }
  // outras grafias não chegam a handler nenhum, com a origem que for
  for (const path of ['//api/test/probe', '/%61pi/test/probe', '/api%2Ftest%2Fprobe']) {
    const response = await stack.client().request('POST', path, { origin: FOREIGN });
    expect(response.status, path).toBeGreaterThanOrEqual(400);
  }
  expect(executed).toBe(0);

  const user = await stack.seed();
  const login = await stack
    .client()
    .request('POST', '/API/auth/login', { body: { email: user.email, password: user.password }, origin: FOREIGN });
  expect(login.status).toBe(403);
  expect(login.headers.getSetCookie()).toEqual([]);
  expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toEqual([]);

  const session = await stack.signIn(user);
  const logout = await session.request('POST', '/API/auth/logout', { origin: FOREIGN });
  expect(logout.status).toBe(403);
  expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toHaveLength(1);
});

test('lead_public_writes_under_origin_check', async () => {
  // um token de verdade, para a confirmação aceita mostrar que a rota responde como de costume
  const submitted = await leadBody(stack);
  expect((await postLead(stack.client(), submitted)).status).toBe(202);
  const { token } = confirmLink(mail.sent.find((message) => message.to === submitted.email)!, WEB_ORIGIN);

  const refusals: Array<[label: string, origin: string | null]> = [
    ['sem Origin e sem Sec-Fetch-Site', null],
    ['Origin de outro site', 'https://evil.example'],
  ];
  for (const [label, origin] of refusals) {
    for (const [path, body] of [
      ['/api/leads', await leadBody(stack)],
      ['/api/leads/confirm', { token }],
    ] as const) {
      const before = await recorded(stack);
      const response = await stack.client().request('POST', path, { body, origin });
      expect(response.status, `${label} ${path}`).toBe(403);
      expect((await problem(response)).code, `${label} ${path}`).toBe('csrf_rejected');
      expect(await recorded(stack), `${label} ${path}`).toEqual(before);
    }
  }

  const sameOrigin = { origin: null, headers: { 'Sec-Fetch-Site': 'same-origin' } };
  const created = await stack.client().request('POST', '/api/leads', { body: await leadBody(stack), ...sameOrigin });
  expect(created.status).toBe(202);
  const confirmed = await stack.client().request('POST', '/api/leads/confirm', { body: { token }, ...sameOrigin });
  expect(confirmed.status).toBe(200);
  expect(await confirmed.json()).toEqual({ status: 'confirmed' });
});
