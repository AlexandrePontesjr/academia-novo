import { STATUS_CODES } from 'node:http';
import type { Problem } from '@academia/contracts';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';

/** `Not Found` -> `not_found`. Todo 5xx sai como `internal_error`. */
function codeFor(status: number, title: string): string {
  if (status >= 500) return 'internal_error';
  return title
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Status de uma exceção do Nest ou de um erro HTTP do Express (corpo ilegível, grande demais...). */
function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  const status = (exception as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : 500;
}

/** O corpo de erro no contrato, com o request id que a requisição já carrega. */
export function problemFor(res: Response, status: number): Problem {
  const title = STATUS_CODES[status] ?? 'Error';
  return {
    type: 'about:blank',
    title,
    status,
    code: codeFor(status, title),
    requestId: String(res.locals.requestId),
  };
}

/** Escreve a resposta de erro no contrato. */
export function sendProblem(res: Response, status: number) {
  res.status(status).type('application/problem+json').json(problemFor(res, status));
}

/** Converte qualquer exceção no contrato de erro. Nada da exceção original chega ao corpo. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = String(res.locals.requestId);
    const status = statusOf(exception);

    if (status >= 500) {
      process.stderr.write(
        JSON.stringify({
          level: 'error',
          time: new Date().toISOString(),
          msg: 'unhandled exception',
          requestId,
          error: exception instanceof Error ? exception.stack : String(exception),
        }) + '\n',
      );
    }

    // a resposta já saiu (erro de protocolo respondido em `onClientError`): nada a escrever
    if (!res.headersSent) sendProblem(res, status);
  }
}
