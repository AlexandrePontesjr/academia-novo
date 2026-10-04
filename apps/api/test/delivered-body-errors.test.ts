import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startApi } from './support/app.ts';
import { invalidChunk, rawExchange, type RawResponse, truncatedJson } from './support/raw.ts';
import { refusingDatabaseUrl } from './support/servers.ts';

/**
 * Uma requisição já entregue à aplicação (cabeçalhos completos) continua sendo uma requisição da
 * API quando o corpo dela é rejeitado depois: request id, contrato de erro e uma linha de log
 * (AC 9, AC 10, door 3).
 */
const cases = [
  {
    name: '(a) chunk inválido, sem content type',
    payload: invalidChunk(),
    status: 404,
    code: 'not_found',
  },
  {
    name: '(b) chunk inválido, JSON',
    payload: invalidChunk('application/json'),
    status: 400,
    code: 'bad_request',
  },
  {
    name: '(c) chunk inválido, urlencoded',
    payload: invalidChunk('application/x-www-form-urlencoded'),
    status: 400,
    code: 'bad_request',
  },
  {
    name: '(d) corpo truncado, cliente fecha o seu lado',
    payload: truncatedJson(),
    halfClose: true,
    status: 400,
    code: 'bad_request',
  },
  {
    name: '(e) corpo que nunca termina',
    payload: truncatedJson(),
    // o servidor confere os tempos limite a cada 30 s
    waitMs: 45_000,
    status: 408,
    code: 'request_timeout',
  },
];

type LogLine = Record<string, unknown>;

let api: Awaited<ReturnType<typeof startApi>>;
const outcomes: { response: RawResponse | undefined; lines: LogLine[] }[] = [];

function requestLines(chunks: string[]): LogLine[] {
  return chunks
    .join('')
    .split('\n')
    .flatMap((line) => {
      try {
        const parsed: unknown = JSON.parse(line);
        return parsed !== null && typeof parsed === 'object' ? [parsed as LogLine] : [];
      } catch {
        return [];
      }
    })
    .filter((line) => line.msg === 'request');
}

beforeAll(async () => {
  api = await startApi(await refusingDatabaseUrl());
  // o padrão do Node são 300 s; o caso (e) só precisa que o tempo limite exista. O limite dos
  // cabeçalhos desce junto porque o servidor não aplica um limite de requisição menor que ele.
  api.server.headersTimeout = 1000;
  api.server.requestTimeout = 1000;
  const { port } = new URL(api.url);

  for (const { payload, halfClose, waitMs } of cases) {
    const chunks: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });
    try {
      const response = await rawExchange(Number(port), payload, { halfClose, waitMs });
      // a linha pode sair logo depois de o cliente ver a conexão fechar
      await new Promise((resolve) => setTimeout(resolve, 500));
      outcomes.push({ response, lines: requestLines(chunks) });
    } finally {
      write.mockRestore();
    }
  }
}, 120_000);

afterAll(async () => {
  await api?.close();
});

test('delivered_body_error_logs_one_line', () => {
  expect(outcomes).toHaveLength(cases.length);
  for (const [index, { name, status }] of cases.entries()) {
    const { response, lines } = outcomes[index]!;

    expect(response?.status, name).toBe(status);
    expect(lines, `linhas de log de ${name}`).toHaveLength(1);
    expect(lines[0], name).toMatchObject({ method: 'POST', path: '/health', status });
    expect(lines[0]?.requestId, name).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines[0]?.durationMs, name).toEqual(expect.any(Number));
    expect(lines[0]?.durationMs, name).toBeGreaterThanOrEqual(0);
  }
});

test('delivered_body_error_has_request_id_and_error_contract', () => {
  expect(outcomes).toHaveLength(cases.length);
  for (const [index, { name, status, code }] of cases.entries()) {
    const { response, lines } = outcomes[index]!;
    const requestId = response?.headers['x-request-id'];

    expect(response?.status, name).toBe(status);
    expect(requestId, `X-Request-Id de ${name}`).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines.map((line) => line.requestId), name).toEqual([requestId]);
    expect(response?.headers['content-type'], name).toMatch(/^application\/problem\+json\b/);
    const body = JSON.parse(response?.body ?? '') as Record<string, unknown>;
    expect(body.status, name).toBe(status);
    expect(body.code, name).toBe(code);
    expect(body.requestId, name).toBe(requestId);
    expect(body.type, name).toEqual(expect.any(String));
    expect(body.title, name).toEqual(expect.any(String));
  }
});

test('client_disconnect_before_response_logs_one_line', async () => {
  const chunks: string[] = [];
  const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    const { port } = new URL(api.url);
    await rawExchange(Number(port), 'GET /health HTTP/1.1\r\nHost: x\r\n\r\n', { waitMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const lines = requestLines(chunks);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ method: 'GET', path: '/health' });
  } finally {
    write.mockRestore();
  }
});
