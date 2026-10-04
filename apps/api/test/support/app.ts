import { Controller, Get, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.ts';

export const BOOM_MESSAGE = 'segredo-da-excecao-42';

@Controller()
export class BoomController {
  @Get('boom')
  boom(): never {
    throw new Error(BOOM_MESSAGE);
  }
}

/** Sobe a API num porto livre, com o mesmo AppModule que o processo real usa. */
export async function startApi(databaseUrl: string, controllers: Type[] = []) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ DATABASE_URL: databaseUrl, PORT: 0 })],
    controllers,
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, close: () => app.close() };
}
