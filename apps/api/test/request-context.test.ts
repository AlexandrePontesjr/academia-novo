import { connect } from 'node:net';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startApi } from './support/app.ts';
import { rawExchange, truncatedJson } from './support/raw.ts';
import { startHangingDatabase } from './support/servers.ts';

/**
 * A linha de log por requisição (AC 10) quando a conexão carrega muitas requisições em voo e
 * quando o cliente vai embora sem resposta. O banco pendurado mantém `GET /health` em voo.
 */
let database: Awaited<ReturnType<typeof startHangingDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
let port: number;

beforeAll(async () => {
  database = await startHangingDatabase();
  api = await startApi(database.url);
  port = Number(new URL(api.url).port);
});

afterAll(async () => {
  await api?.close();
  await database?.stop();
});

type LogLine = Record<string, unknown>;

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

/** Roda `exchange` capturando o que a API escreve em stdout, e devolve as linhas de requisição. */
async function captureRequestLines(exchange: () => Promise<unknown>): Promise<LogLine[]> {
  const chunks: string[] = [];
  const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    await exchange();
    // a linha pode sair logo depois de o cliente ver a conexão fechar
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return requestLines(chunks);
  } finally {
    write.mockRestore();
  }
}

/** Manda `count` requisições `GET /health` de uma vez na mesma conexão e conta as respostas `503`. */
function pipelinedHealth(count: number): Promise<number> {
  const statusLines = () => received.match(/HTTP\/1\.1 503 /g)?.length ?? 0;
  let received = '';
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write('GET /health HTTP/1.1\r\nHost: x\r\n\r\n'.repeat(count));
    });
    const timer = setTimeout(() => socket.destroy(), 15_000);
    socket.setEncoding('latin1');
    socket.on('data', (chunk: string) => {
      received += chunk;
      if (statusLines() >= count) socket.end();
    });
    socket.on('error', reject);
    socket.on('close', () => {
      clearTimeout(timer);
      resolve(statusLines());
    });
  });
}

test('pipelined_requests_log_one_line_each_without_listener_warning', async () => {
  const warnings: Error[] = [];
  const onWarning = (warning: Error) => warnings.push(warning);
  process.on('warning', onWarning);
  try {
    for (const count of [11, 16]) {
      let responses = 0;
      const lines = await captureRequestLines(async () => {
        responses = await pipelinedHealth(count);
      });

      expect(responses, `respostas 503 com ${count} em voo`).toBe(count);
      expect(lines, `linhas de log com ${count} em voo`).toHaveLength(count);
      expect(new Set(lines.map((line) => line.requestId)).size, `ids com ${count} em voo`).toBe(count);
    }
    // o aviso é emitido em `process.nextTick`; as esperas acima já o deixaram chegar
    expect(warnings.map((warning) => warning.name)).not.toContain('MaxListenersExceededWarning');
  } finally {
    process.off('warning', onWarning);
  }
}, 60_000);

test('abandoned_request_logs_499', async () => {
  const cases = [
    {
      name: '(a) sem corpo, resposta pendente',
      payload: 'GET /health HTTP/1.1\r\nHost: x\r\n\r\n',
      method: 'GET',
    },
    { name: '(b) corpo incompleto', payload: truncatedJson(), method: 'POST' },
  ];
  for (const { name, payload, method } of cases) {
    let response: Awaited<ReturnType<typeof rawExchange>>;
    const lines = await captureRequestLines(async () => {
      // sem `halfClose`: passados 300 ms o cliente destrói a conexão inteira
      response = await rawExchange(port, payload, { waitMs: 300 });
    });

    expect(response, `resposta recebida em ${name}`).toBeUndefined();
    expect(lines, `linhas de log de ${name}`).toHaveLength(1);
    expect(lines[0], name).toMatchObject({ method, path: '/health', status: 499 });
  }
}, 30_000);
