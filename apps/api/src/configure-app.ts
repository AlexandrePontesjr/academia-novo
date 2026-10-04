import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { onClientError } from './client-error.ts';
import { csrfProtection } from './csrf.ts';
import type { Env } from './env.ts';
import { requestContext } from './request-context.ts';
import { ENV } from './tokens.ts';

/**
 * Configuração que vale para toda montagem da aplicação (processo real e testes).
 * Tem de ser chamada antes de `listen`: o request id entra na frente do leitor de corpo do
 * Express, senão um corpo ilegível seria respondido sem id e sem linha de log. O erro de protocolo
 * numa requisição já entregue passa pelo mesmo contrato, em vez da resposta crua do servidor HTTP.
 * A checagem de origem vem logo depois do request id, antes de o corpo ser lido.
 */
export function configureApp(app: INestApplication) {
  app.use(requestContext);
  app.use(csrfProtection(app.get<Env>(ENV).WEB_ORIGIN));
  (app.getHttpServer() as Server).on('clientError', onClientError);
}
