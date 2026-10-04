import type { Problem } from '@academia/contracts';
import {
  type CallHandler,
  type ExecutionContext,
  HttpCode,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import type { Request } from 'express';
import type { z } from 'zod';
import { ptBR } from 'zod/locales';
import { validationProblem } from './problem.filter.ts';

const INPUT = 'academia:input';
const OUTPUT = 'academia:output';

/** O schema de `packages/contracts` que valida o corpo da rota - o mesmo que vai para o OpenAPI. */
export const Input = (schema: z.ZodType) => SetMetadata(INPUT, schema);

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

/** Valida o corpo pelo schema declarado em `@Input`, depois da guarda e antes do handler. */
@Injectable()
export class ValidationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const schema = inputOf(context.getHandler());
    if (schema) {
      const req = context.switchToHttp().getRequest<Request>();
      const result = schema.safeParse(req.body ?? {}, { error: localeError });
      if (!result.success) throw validationProblem(fieldErrors(result.error.issues));
      req.body = result.data;
    }
    return next.handle();
  }
}
