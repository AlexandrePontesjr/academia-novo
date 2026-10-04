import { STATUS_CODES } from 'node:http';
import type { Socket } from 'node:net';
import type { Response } from 'express';
import { problemFor, sendProblem } from './problem.filter.ts';
import { inFlightRequest } from './request-context.ts';

/** Quanto uma conexão com erro de protocolo pode ficar parada até a resposta pendente sair. */
const CLOSE_GRACE_MS = 10_000;

/** Intervalo entre os cabeçalhos e o corpo da resposta a um cliente que talvez já tenha ido embora. */
const ABANDON_PROBE_MS = 10;

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
 * A resposta de erro em duas escritas. O cliente fechou o seu lado com o corpo incompleto, e daqui
 * não dá para saber se ele ainda lê (fechou só um lado) ou se foi embora (fechou a conexão): os
 * dois chegam como o mesmo FIN. A primeira escrita sempre passa; se ele foi embora, o sistema dele
 * recusa e a segunda falha, e a linha de log registra que nenhuma resposta foi entregue.
 */
function sendProblemProbing(res: Response, status: number) {
  const body = JSON.stringify(problemFor(res, status));
  res.status(status).type('application/problem+json');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.flushHeaders();
  setTimeout(() => res.end(body), ABANDON_PROBE_MS);
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
  if (req.complete) return;
  if (socket.readableEnded) sendProblemProbing(res, status);
  else sendProblem(res, status);
}
