import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { expect, test } from '@playwright/test';
import { FAKE_API_PORT } from '../playwright.config.ts';

interface Received {
  method?: string;
  url?: string;
  body: string;
  origin?: string;
  cookie?: string;
}

let server: Server | undefined;
let received: Received[] = [];

/** Uma API falsa que anota o que chegou e responde com status, corpo, cookies e request id próprios. */
test.beforeEach(async () => {
  received = [];
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push({
        method: req.method,
        url: req.url,
        body: Buffer.concat(chunks).toString('utf8'),
        origin: req.headers.origin,
        cookie: req.headers.cookie,
      });
      const method = String(req.method).toLowerCase();
      res.writeHead(req.url?.startsWith('/api/echo') ? 218 : 404, {
        'Content-Type': 'application/json',
        'X-Request-Id': `id-da-api-${method}`,
        'Set-Cookie': [`da_api_${method}=um; Path=/; HttpOnly`, `outro_${method}=dois; Path=/`],
      });
      res.end(JSON.stringify({ respondeu: method }));
    });
  });
  await new Promise<void>((resolve) => server!.listen(FAKE_API_PORT, '127.0.0.1', resolve));
});

test.afterEach(async () => {
  if (server) await new Promise((resolve) => server!.close(resolve));
  server = undefined;
});

test('proxy_forwards_request_and_response', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'sessao', value: 'valor-da-sessao', url: baseURL! }]);
  await page.goto('/');

  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const lower = method.toLowerCase();
    const body = method === 'GET' ? undefined : JSON.stringify({ enviado: lower });
    received = [];

    const response = await page.evaluate(
      async ({ method, body }) => {
        const answer = await fetch('/api/echo/caminho?pagina=2', {
          method,
          body,
          headers: body ? { 'Content-Type': 'application/json' } : {},
        });
        return {
          status: answer.status,
          text: await answer.text(),
          requestId: answer.headers.get('x-request-id'),
        };
      },
      { method, body },
    );

    // o que a API recebeu
    const forwarded = received.filter((request) => request.url?.startsWith('/api/echo'));
    expect(forwarded, method).toHaveLength(1);
    expect(forwarded[0]!.method, method).toBe(method);
    expect(forwarded[0]!.url, method).toBe('/api/echo/caminho?pagina=2');
    expect(forwarded[0]!.body, method).toBe(body ?? '');
    // o navegador só manda `Origin` em requisição de mesma origem quando o método não é GET
    expect(forwarded[0]!.origin, method).toBe(method === 'GET' ? undefined : new URL(baseURL!).origin);
    expect(forwarded[0]!.cookie, method).toContain('sessao=valor-da-sessao');

    // o que o navegador recebeu
    expect(response.status, method).toBe(218);
    expect(JSON.parse(response.text), method).toEqual({ respondeu: lower });
    expect(response.requestId, method).toBe(`id-da-api-${lower}`);
    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === `da_api_${lower}`), method).toMatchObject({
      value: 'um',
      httpOnly: true,
    });
    expect(cookies.find((cookie) => cookie.name === `outro_${lower}`)?.value, method).toBe('dois');
  }
});

test('unreachable_api_answers_502_or_504_problem', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const call = () =>
    page.evaluate(async () => {
      const answer = await fetch('/api/auth/session');
      return { status: answer.status, type: answer.headers.get('content-type'), body: await answer.json() };
    });

  // a API aceita a conexão e não responde: o web desiste e responde ele mesmo
  await new Promise((resolve) => server?.close(resolve));
  const sockets = new Set<Socket>();
  server = createServer(() => {});
  server.on('connection', (socket) => sockets.add(socket));
  await new Promise<void>((resolve) => server!.listen(FAKE_API_PORT, '127.0.0.1', resolve));
  const hung = await call();
  expect(hung.status).toBe(504);
  expect(hung.type).toMatch(/^application\/problem\+json\b/);
  expect(hung.body).toMatchObject({ status: 504, code: 'gateway_timeout' });
  expect(hung.body.requestId).toMatch(/\S/);

  // ninguém escuta na porta da API
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
  const refused = await call();
  expect(refused.status).toBe(502);
  expect(refused.type).toMatch(/^application\/problem\+json\b/);
  expect(refused.body).toMatchObject({ status: 502, code: 'bad_gateway' });
  expect(refused.body.requestId).toMatch(/\S/);
});
