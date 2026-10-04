import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { onClientError } from './client-error.ts';
import { requestContext } from './request-context.ts';

/**
 * Configuração que vale para toda montagem da aplicação (processo real e testes).
 * Tem de ser chamada antes de `listen`: o request id entra na frente do leitor de corpo do
 * Express, senão um corpo ilegível seria respondido sem id e sem linha de log. O erro de protocolo
 * numa requisição já entregue passa pelo mesmo contrato, em vez da resposta crua do servidor HTTP.
 */
export function configureApp(app: INestApplication) {
  app.use(requestContext);
  (app.getHttpServer() as Server).on('clientError', onClientError);
}
