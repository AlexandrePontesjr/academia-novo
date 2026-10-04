import { envSchema } from './env.ts';

/** Encerra o processo nomeando as variáveis rejeitadas, sem imprimir valor nenhum. */
export function assertEnv() {
  const result = envSchema.safeParse(process.env);
  if (result.success) return;

  const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  console.error(`Variáveis de ambiente rejeitadas: ${names.join(', ')}`);
  process.exit(1);
}
