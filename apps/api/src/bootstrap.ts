import { ConsoleLogger, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessDeclarationError } from './access.ts';
import { AppModule } from './app.module.ts';
import { configureApp } from './configure-app.ts';
import type { Env } from './env.ts';

/**
 * Sobe o processo da API. Uma rota `/api` sem declaração de acesso encerra a subida com código 1,
 * nomeando a rota (AD-022).
 */
export async function bootstrap(env: Env, module: DynamicModule = AppModule.register(env)) {
  try {
    const app = await NestFactory.create(module, {
      logger: new ConsoleLogger({ json: true }),
      abortOnError: false,
    });
    configureApp(app);
    app.enableShutdownHooks();
    await app.listen(env.PORT, '0.0.0.0');
  } catch (error) {
    if (!(error instanceof AccessDeclarationError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
