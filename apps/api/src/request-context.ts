import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Dá um id a cada requisição, devolve-o no header e escreve uma linha de log quando a resposta termina. */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  const startedAt = performance.now();
  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  res.on('finish', () => {
    process.stdout.write(
      JSON.stringify({
        level: 'info',
        time: new Date().toISOString(),
        msg: 'request',
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }) + '\n',
    );
  });

  next();
}
