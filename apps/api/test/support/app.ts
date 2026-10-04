import type { Server } from 'node:http';
import { Controller, Get, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Express } from 'express';
import { Public } from '../../src/access.ts';
import { AppModule } from '../../src/app.module.ts';
import { configureApp } from '../../src/configure-app.ts';

export const BOOM_MESSAGE = 'segredo-da-excecao-42';
export const WEB_ORIGIN = 'http://localhost:3000';
export const AUTH_SECRET = 'segredo-de-teste-com-32-caracteres!';

@Controller()
export class BoomController {
  @Get('boom')
  @Public()
  boom(): never {
    throw new Error(BOOM_MESSAGE);
  }
}

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Sobe a API num porto livre, com o mesmo AppModule e o mesmo configureApp que o processo real usa. */
export async function startApi(databaseUrl: string, controllers: Type[] = []) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppModule.register({ DATABASE_URL: databaseUrl, PORT: 0, AUTH_SECRET, WEB_ORIGIN }),
    ],
    controllers,
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer() as Server;
  const { port } = server.address() as { port: number };

  /** As rotas registradas, lidas do roteador do Express em execução. */
  const routes = () => {
    const express = app.getHttpAdapter().getInstance() as Express;
    return (express.router.stack as RouterLayer[]).flatMap(({ route }) =>
      route
        ? Object.keys(route.methods).map((method) => ({ method: method.toUpperCase(), path: route.path }))
        : [],
    );
  };
  return { url: `http://127.0.0.1:${port}`, server, routes, close: () => app.close() };
}
