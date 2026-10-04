import { STATUS_CODES } from 'node:http';
import type { Socket } from 'node:net';
import { sendProblem } from './problem.filter.ts';
import { inFlightRequest } from './request-context.ts';

/** Quanto uma conexão com erro de protocolo pode ficar parada até a resposta pendente sair. */
const CLOSE_GRACE_MS = 10_000;

const closing = new WeakSet<Socket>();

/** Os mesmos status que o servidor HTTP do Node usa quando ninguém escuta `clientError`. */
function statusFor(error: NodeJS.ErrnoException): number {
  switch (error.code) {
    case 'HPE_HEADER_OVERFLOW':
      return 431;
    case 'HPE_CHUNK_EXTENSIONS_OVERFLOW':
      return 413;
    case 'ERR_HTTP_REQUEST_TIMEOUT':
      return 408;
    default:
      return 400;
  }
}

/**
 * Erro de protocolo numa conexão. Quem escuta `clientError` assume o lugar da resposta crua do
 * Node, então há dois caminhos:
 *
 * - a conexão tem uma requisição já entregue à aplicação: a resposta sai pela aplicação, com
 *   request id, contrato de erro e linha de log, e a conexão fecha quando ela termina;
 * - não tem (o erro veio antes da entrega): a resposta crua de sempre, fora do contrato.
 */
export function onClientError(error: NodeJS.ErrnoException, socket: Socket) {
  if (closing.has(socket)) return;
  closing.add(socket);

  const status = statusFor(error);
  const delivered = inFlightRequest(socket);
  if (!socket.writable || !delivered) {
    if (socket.writable) {
      socket.write(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\n\r\n`);
    }
    socket.destroy();
    return;
  }

  const { req, res } = delivered;
  const close = () => socket.destroy();
  socket.pause();
  socket.setTimeout(CLOSE_GRACE_MS, close);
  res.once('finish', close);
  if (res.headersSent) return;

  res.setHeader('Connection', 'close');
  // corpo completo: o erro é do que veio depois na conexão, e a aplicação ainda responde por si
  if (!req.complete) sendProblem(res, status);
}
