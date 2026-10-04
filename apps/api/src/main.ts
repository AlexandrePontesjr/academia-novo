import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';
import { configureApp } from './configure-app.ts';
import { type Env, EnvError, loadEnv } from './env.ts';

let env: Env;
try {
  env = loadEnv(process.env);
} catch (error) {
  if (!(error instanceof EnvError)) throw error;
  console.error(`Variáveis de ambiente rejeitadas - ${error.message}`);
  process.exit(1);
}

const app = await NestFactory.create(AppModule.register(env), {
  logger: new ConsoleLogger({ json: true }),
});
configureApp(app);
app.enableShutdownHooks();
await app.listen(env.PORT, '0.0.0.0');
