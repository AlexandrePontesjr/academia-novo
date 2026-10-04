import 'reflect-metadata';
import { bootstrap } from './bootstrap.ts';
import { type Env, EnvError, loadEnv } from './env.ts';

let env: Env;
try {
  env = loadEnv(process.env);
} catch (error) {
  if (!(error instanceof EnvError)) throw error;
  console.error(`Variáveis de ambiente rejeitadas - ${error.message}`);
  process.exit(1);
}

await bootstrap(env);
