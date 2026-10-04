import { randomUUID } from 'node:crypto';
import type { Socket } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Status da linha de log quando a conexão fecha sem resposta nenhuma ter saído (convenção do nginx). */
const CLIENT_CLOSED_REQUEST = 499;

/** A requisição mais recente entregue à aplicação em cada conexão, enquanto não foi registrada. */
const inFlight = new WeakMap<Socket, { req: Request; res: Response }>();

export function inFlightRequest(socket: Socket) {
  return inFlight.get(socket);
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
    // o `close` do socket é quem dispara o `close` da resposta: tirar o listener não basta
    if (logged) return;
    logged = true;
    socket.off('close', log);
    if (inFlight.get(socket) === entry) inFlight.delete(socket);
    process.stdout.write(
      JSON.stringify({
        level: 'info',
        time: new Date().toISOString(),
        msg: 'request',
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.headersSent ? res.statusCode : CLIENT_CLOSED_REQUEST,
        durationMs: Math.round(performance.now() - startedAt),
      }) + '\n',
    );
  };
  res.on('finish', log);
  res.on('close', log);
  socket.on('close', log);

  next();
}
