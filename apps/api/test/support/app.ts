import type { Server } from 'node:http';
import { Controller, Get, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Express } from 'express';
import { Public } from '../../src/access.ts';
import { AppModule } from '../../src/app.module.ts';
import { configureApp } from '../../src/configure-app.ts';
import { loadEnv } from '../../src/env.ts';

export const BOOM_MESSAGE = 'segredo-da-excecao-42';
export const WEB_ORIGIN = 'http://localhost:3000';
export const AUTH_SECRET = 'segredo-de-teste-com-32-caracteres!';
/** O base64 de 32 bytes fixos: só serve a testes. */
export const DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
export const PHOTO_URL_SECRET = 'segredo-das-urls-de-foto-com-mais-de-32-caracteres';

/** O ambiente do armazenamento de objetos (door 3): onde ele está e com que credencial a API entra. */
export interface StorageEnv {
  S3_ENDPOINT: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
}

/** Um endpoint em que ninguém escuta: serve ao teste que não toca em foto. */
export const NO_STORAGE: StorageEnv = {
  S3_ENDPOINT: 'http://127.0.0.1:9',
  S3_BUCKET: 'bucket-de-teste',
  S3_ACCESS_KEY_ID: 'chave-de-acesso-de-teste',
  S3_SECRET_ACCESS_KEY: 'chave-secreta-de-teste',
};

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
export async function startApi(
  databaseUrl: string,
  controllers: Type[] = [],
  storage: StorageEnv = NO_STORAGE,
  extraEnv: Record<string, string> = {},
) {
  // o ambiente passa pelo mesmo `loadEnv` do processo real: o que é opcional recebe o padrão de lá
  const env = loadEnv({
    DATABASE_URL: databaseUrl,
    PORT: '3001',
    AUTH_SECRET,
    WEB_ORIGIN,
    DATA_ENCRYPTION_KEY,
    PHOTO_URL_SECRET,
    ...storage,
    ...extraEnv,
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ ...env, PORT: 0 })],
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
