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

/** Converte qualquer exceção no contrato de erro. Nada da exceção original chega ao corpo. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = String(res.locals.requestId);
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const title = STATUS_CODES[status] ?? 'Error';

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

    const problem: Problem = {
      type: 'about:blank',
      title,
      status,
      code: codeFor(status, title),
      requestId,
    };
    res.status(status).type('application/problem+json').json(problem);
  }
}
