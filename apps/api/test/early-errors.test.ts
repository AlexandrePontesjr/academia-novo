import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startApi } from './support/app.ts';
import { refusingDatabaseUrl } from './support/servers.ts';

/**
 * Respostas que nascem antes de qualquer rota - o corpo não pôde ser lido, a URL não pôde ser
 * decodificada - também são respostas da API: contrato de erro, request id e linha de log (AC 7, 9, 10).
 */
let api: Awaited<ReturnType<typeof startApi>>;

beforeAll(async () => {
  api = await startApi(await refusingDatabaseUrl());
});

afterAll(async () => {
  await api?.close();
});

const cases = [
  {
    name: 'JSON malformado',
    statuses: [400],
    request: () =>
      fetch(`${api.url}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad',
      }),
  },
  {
    name: 'corpo grande demais',
    statuses: [413],
    request: () =>
      fetch(`${api.url}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filler: 'x'.repeat(300 * 1024) }),
      }),
  },
  {
    // nenhum critério fixa se um caminho indecodificável é 400 ou 404; os dois são erro do cliente
    name: 'URL com percent-encoding inválido',
    statuses: [400, 404],
    request: () => fetch(`${api.url}/%E0%A4%A`),
  },
];

test('errors_before_routing_use_error_contract_and_request_id', async () => {
  for (const { name, statuses, request } of cases) {
    const response = await request();
    const body = (await response.json()) as Record<string, unknown>;

    expect(statuses, name).toContain(response.status);
    expect(response.headers.get('content-type'), name).toMatch(/^application\/problem\+json\b/);
    expect(body.status, name).toBe(response.status);
    expect(body.code, name).toMatch(/^[a-z]+(_[a-z]+)*$/);
    expect(body.code, name).not.toBe('internal_error');
    expect(body.requestId, name).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get('x-request-id'), name).toBe(body.requestId);
  }
});

test('errors_before_routing_are_logged_once', async () => {
  const chunks: string[] = [];
  const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  const linesFor = (requestId: string) =>
    chunks
      .join('')
      .split('\n')
      .filter((line) => line.includes(requestId))
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  try {
    for (const { name, statuses, request } of cases) {
      const response = await request();
      await response.text();
      const requestId = response.headers.get('x-request-id') ?? '';
      expect(requestId, name).toMatch(/\S/);

      await vi.waitFor(() => expect(linesFor(requestId).length).toBeGreaterThanOrEqual(1));
      await new Promise((resolve) => setTimeout(resolve, 100));

      const lines = linesFor(requestId);
      expect(lines, name).toHaveLength(1);
      expect(lines[0], name).toMatchObject({ requestId, status: response.status });
      expect(statuses, name).toContain(response.status);
      expect(lines[0]?.method, name).toEqual(expect.any(String));
      expect(lines[0]?.path, name).toEqual(expect.any(String));
      expect(lines[0]?.durationMs, name).toEqual(expect.any(Number));
    }
  } finally {
    write.mockRestore();
  }
});
