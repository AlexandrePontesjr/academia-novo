import type { Problem } from '@academia/contracts';
import {
  type CallHandler,
  createParamDecorator,
  type ExecutionContext,
  HttpCode,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { ptBR } from 'zod/locales';
import { validationProblem } from './problem.filter.ts';

const INPUT = 'academia:input';
const QUERY = 'academia:query';
const OUTPUT = 'academia:output';

/** O schema de `packages/contracts` que valida o corpo da rota - o mesmo que vai para o OpenAPI. */
export const Input = (schema: z.ZodType) => SetMetadata(INPUT, schema);

/** O schema de `packages/contracts` que valida a query da rota - o mesmo que vai para o OpenAPI (AD-029). */
export const QueryInput = (schema: z.ZodType) => SetMetadata(QUERY, schema);

/** A query da rota, já validada pelo schema declarado em `@QueryInput`. */
export const ValidatedQuery = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getResponse<Response>().locals.query as unknown,
);

/** O status de sucesso da rota e, quando ela devolve corpo, o schema dele. */
export const Output = (status: number, schema?: z.ZodType): MethodDecorator => {
  const httpCode = HttpCode(status);
  const output = SetMetadata(OUTPUT, schema);
  return (target, key, descriptor) => {
    httpCode(target, key, descriptor);
    output(target, key, descriptor);
  };
};

export const inputOf = (handler: object) =>
  Reflect.getMetadata(INPUT, handler) as z.ZodType | undefined;

export const queryOf = (handler: object) =>
  Reflect.getMetadata(QUERY, handler) as z.ZodType | undefined;

export const outputOf = (handler: object) => ({
  status: Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined,
  schema: Reflect.getMetadata(OUTPUT, handler) as z.ZodType | undefined,
});

// mensagens em pt-BR para o que o schema não nomeou, sem mexer na configuração global do Zod
const { localeError } = ptBR();

/** Um item por campo reprovado, com o caminho em notação de ponto. */
export function fieldErrors(issues: z.core.$ZodIssue[]): NonNullable<Problem['errors']> {
  const byPath = new Map<string, string>();
  for (const issue of issues) {
    const path = issue.path.join('.');
    if (!byPath.has(path)) byPath.set(path, issue.message);
  }
  return [...byPath].map(([path, message]) => ({ path, message }));
}

/**
 * Valida o corpo pelo schema declarado em `@Input` e a query pelo de `@QueryInput`, depois da
 * guarda e antes do handler. Os dois respondem o mesmo `422` (AD-021, AD-029).
 */
@Injectable()
export class ValidationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const schema = inputOf(context.getHandler());
    if (schema) {
      const result = schema.safeParse(req.body ?? {}, { error: localeError });
      if (!result.success) throw validationProblem(fieldErrors(result.error.issues));
      req.body = result.data;
    }
    const querySchema = queryOf(context.getHandler());
    if (querySchema) {
      const result = querySchema.safeParse(req.query, { error: localeError });
      if (!result.success) throw validationProblem(fieldErrors(result.error.issues));
      // `req.query` é só de leitura no Express 5: a query validada segue por `res.locals`
      http.getResponse<Response>().locals.query = result.data;
    }
    return next.handle();
  }
}
