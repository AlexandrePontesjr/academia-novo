import type { INestApplication } from '@nestjs/common';
import { requestContext } from './request-context.ts';

/**
 * Configuração que vale para toda montagem da aplicação (processo real e testes).
 * Tem de ser chamada antes de `listen`: o request id entra na frente do leitor de corpo do
 * Express, senão um corpo ilegível seria respondido sem id e sem linha de log.
 */
export function configureApp(app: INestApplication) {
  app.use(requestContext);
}
