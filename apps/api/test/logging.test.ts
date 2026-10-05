import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startApi } from './support/app.ts';
import { type Minio, startMinio, startPostgres } from './support/servers.ts';

let postgres: Awaited<ReturnType<typeof startPostgres>>;
let minio: Minio;
let api: Awaited<ReturnType<typeof startApi>>;

beforeAll(async () => {
  postgres = await startPostgres();
  minio = await startMinio();
  api = await startApi(postgres.url, [], minio.env);
}, 180_000);

afterAll(async () => {
  await api?.close();
  await postgres?.stop();
  await minio?.stop();
});

type LogLine = Record<string, unknown>;

function jsonLines(chunks: string[]): LogLine[] {
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
    });
}

test('one_json_line_per_request', async () => {
  const chunks: string[] = [];
  const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });

  try {
    const cases = [
      { path: '/health', status: 200 },
      { path: '/rota-que-nao-existe', status: 404 },
    ];
    const requestIds: string[] = [];
    for (const { path } of cases) {
      const response = await fetch(`${api.url}${path}`);
      await response.text();
      requestIds.push(response.headers.get('x-request-id') ?? '');
    }
    // a linha é escrita quando a resposta termina, o que pode ser logo depois de o cliente recebê-la
    await vi.waitFor(() => expect(jsonLines(chunks).length).toBeGreaterThanOrEqual(cases.length));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const lines = jsonLines(chunks);
    expect(lines).toHaveLength(cases.length);
    for (const [index, { path, status }] of cases.entries()) {
      const requestId = requestIds[index];
      expect(requestId).toMatch(/\S/);
      const ofRequest = lines.filter((line) => line.requestId === requestId);
      expect(ofRequest, `linhas da requisição ${path}`).toHaveLength(1);
      expect(ofRequest[0]).toMatchObject({ requestId, method: 'GET', path, status });
      expect(ofRequest[0]?.durationMs).toEqual(expect.any(Number));
      expect(ofRequest[0]?.durationMs).toBeGreaterThanOrEqual(0);
    }
  } finally {
    write.mockRestore();
  }
});
