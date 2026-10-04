import { STATUS_CODES } from 'node:http';
import type { Problem } from '@academia/contracts';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { describeError } from './log-safe.ts';

type ProblemErrors = NonNullable<Problem['errors']>;

/** `Not Found` -> `not_found`. Todo 5xx sai como `internal_error`. */
function codeFor(status: number, title: string): string {
  if (status >= 500) return 'internal_error';
  return title
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Erro de aplicação com `code` explícito (AD-021), e não o derivado do título do status. */
export class ProblemException extends HttpException {
  readonly code: string;
  readonly errors?: ProblemErrors;
  readonly headers: Record<string, string>;

  constructor(
    status: number,
    code: string,
    extras: { errors?: ProblemErrors; headers?: Record<string, string> } = {},
  ) {
    super(code, status);
    this.code = code;
    this.errors = extras.errors;
    this.headers = extras.headers ?? {};
  }
}

/** `422 validation_failed` com um item por campo; `message` é texto fixo, nunca o valor enviado. */
export function validationProblem(errors: ProblemErrors) {
  return new ProblemException(422, 'validation_failed', { errors });
}

/** Status de uma exceção do Nest ou de um erro HTTP do Express (corpo ilegível, grande demais...). */
function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  const status = (exception as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : 500;
}

/** O corpo de erro no contrato, com o request id que a requisição já carrega. */
export function problemFor(
  res: Response,
  status: number,
  code?: string,
  errors?: ProblemErrors,
): Problem {
  const title = STATUS_CODES[status] ?? 'Error';
  return {
    type: 'about:blank',
    title,
    status,
    code: code ?? codeFor(status, title),
    requestId: String(res.locals.requestId),
    ...(errors && { errors }),
  };
}

/** Escreve a resposta de erro no contrato. */
export function sendProblem(res: Response, status: number, code?: string, errors?: ProblemErrors) {
  res
    .status(status)
    .type('application/problem+json')
    .json(problemFor(res, status, code, errors));
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
          error: describeError(exception),
        }) + '\n',
      );
    }

    // a resposta já saiu (erro de protocolo respondido em `onClientError`): nada a escrever
    if (res.headersSent) return;
    if (exception instanceof ProblemException) {
      res.set(exception.headers);
      sendProblem(res, status, exception.code, exception.errors);
    } else {
      sendProblem(res, status);
    }
  }
}
