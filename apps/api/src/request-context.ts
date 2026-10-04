import { randomUUID } from 'node:crypto';
import type { Socket } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Status da linha de log quando o cliente vai embora sem ter recebido resposta (convenção do nginx). */
const CLIENT_CLOSED_REQUEST = 499;

/** A requisição mais recente entregue à aplicação em cada conexão, enquanto não foi registrada. */
const inFlight = new WeakMap<Socket, { req: Request; res: Response }>();

export function inFlightRequest(socket: Socket) {
  return inFlight.get(socket);
}

/**
 * As requisições de cada conexão ainda sem linha de log. Um listener de `close` só por conexão,
 * por mais requisições que estejam em voo nela: um por requisição estoura o limite de listeners.
 */
const unlogged = new WeakMap<Socket, Set<() => void>>();

function logOnSocketClose(socket: Socket, log: () => void) {
  let logs = unlogged.get(socket);
  if (!logs) {
    const ofSocket = new Set<() => void>();
    socket.once('close', () => {
      for (const pending of [...ofSocket]) pending();
    });
    unlogged.set(socket, ofSocket);
    logs = ofSocket;
  }
  logs.add(log);
}

/** Dá um id a cada requisição, devolve-o no header e escreve uma linha de log quando a resposta termina. */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const socket = req.socket;
  const entry = { req, res };
  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  inFlight.set(socket, entry);

  // `finish` não dispara quando a conexão cai antes de a resposta sair inteira; `close` cobre esse
  // caso, e a linha é escrita uma vez só, pelo que vier primeiro.
  let logged = false;
  const log = () => {
    // o `close` do socket é quem dispara o `close` da resposta: sair da lista não basta
    if (logged) return;
    logged = true;
    unlogged.get(socket)?.delete(log);
    if (inFlight.get(socket) === entry) inFlight.delete(socket);
    process.stdout.write(
      JSON.stringify({
        level: 'info',
        time: new Date().toISOString(),
        msg: 'request',
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        // sem resposta: nenhuma saiu, ou a escrita dela falhou porque o cliente já tinha ido embora
        status: res.headersSent && !socket.errored ? res.statusCode : CLIENT_CLOSED_REQUEST,
        durationMs: Math.round(performance.now() - startedAt),
      }) + '\n',
    );
  };
  res.on('finish', log);
  res.on('close', log);
  logOnSocketClose(socket, log);

  next();
}
