import { connect } from 'node:net';

export interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Só a primeira resposta do que o servidor escreveu; o que vier depois dela é ignorado. */
function parseFirstResponse(raw: string): RawResponse | undefined {
  const headEnd = raw.indexOf('\r\n\r\n');
  if (headEnd === -1) return undefined;
  const [statusLine = '', ...headerLines] = raw.slice(0, headEnd).split('\r\n');
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colon = line.indexOf(':');
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  const rest = raw.slice(headEnd + 4);
  const length = headers['content-length'];
  return {
    status: Number(statusLine.split(' ')[1]),
    headers,
    body: length === undefined ? rest : rest.slice(0, Number(length)),
  };
}

/**
 * Escreve os bytes dados num socket TCP cru e devolve a primeira resposta, lida até o servidor
 * fechar a conexão ou até `waitMs`. `halfClose` fecha o lado do cliente depois de escrever.
 */
export function rawExchange(
  port: number,
  payload: string,
  { halfClose = false, waitMs = 5000 } = {},
): Promise<RawResponse | undefined> {
  return new Promise((resolve, reject) => {
    let received = '';
    let timer: NodeJS.Timeout | undefined;
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(payload);
      if (halfClose) socket.end();
      timer = setTimeout(() => socket.destroy(), waitMs);
    });
    socket.setEncoding('latin1');
    socket.on('data', (chunk: string) => (received += chunk));
    socket.on('error', (error: NodeJS.ErrnoException) => {
      // o servidor pode derrubar a conexão depois de responder; o que já chegou é o que vale
      if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') reject(error);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      resolve(parseFirstResponse(received));
    });
  });
}

const head = (lines: string[]) => ['POST /health HTTP/1.1', 'Host: x', ...lines, '', ''].join('\r\n');

/** `POST /health` em chunked com tamanho de chunk `zz`. */
export const invalidChunk = (contentType?: string) =>
  head([...(contentType ? [`Content-Type: ${contentType}`] : []), 'Transfer-Encoding: chunked']) +
  'zz\r\n';

/** `POST /health` JSON que anuncia 50 bytes e manda 5. */
export const truncatedJson = () =>
  head(['Content-Type: application/json', 'Content-Length: 50']) + '{"a":';
