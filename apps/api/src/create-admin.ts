import { parseArgs } from 'node:util';
import { emailSchema, newPasswordSchema } from '@academia/contracts';
import { createDatabase } from '@academia/database';
import { z } from 'zod';
import { describeError } from './log-safe.ts';
import { UsersService } from './users/users.service.ts';

// `pnpm users:create-admin --email <e-mail> --name <nome>`, com a senha em ADMIN_PASSWORD.
// É como o primeiro Administrador de um banco novo passa a existir. A senha nunca vem por
// argumento (ficaria no histórico do shell) nem vai para a saída.

/** O motivo da recusa, ou os dados prontos para criar o usuário. */
function readInput() {
  let args: { email?: string; name?: string };
  try {
    args = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } }).values;
  } catch {
    return 'argumento desconhecido; use --email <e-mail> --name <nome>';
  }
  if (!args.email) return 'informe --email <e-mail>';
  if (!emailSchema.safeParse(args.email).success) return '--email não é um e-mail válido';
  if (!args.name?.trim()) return 'informe --name <nome>';

  const password = process.env.ADMIN_PASSWORD;
  if (!password) return 'defina a senha na variável ADMIN_PASSWORD';
  const checked = newPasswordSchema.safeParse(password);
  if (!checked.success) return `ADMIN_PASSWORD recusada: ${z.prettifyError(checked.error)}`;

  if (!process.env.DATABASE_URL) return 'DATABASE_URL não definida';
  return { email: args.email, name: args.name.trim(), password, databaseUrl: process.env.DATABASE_URL };
}

async function main(): Promise<number> {
  const input = readInput();
  if (typeof input === 'string') {
    console.error(`users:create-admin: ${input}`);
    return 1;
  }

  const database = createDatabase(input.databaseUrl);
  try {
    const user = await new UsersService(database.db).create({
      name: input.name,
      email: input.email,
      role: 'admin',
      password: input.password,
    });
    if (!user) {
      console.error('users:create-admin: e-mail já cadastrado');
      return 1;
    }
    console.log(`Administrador criado: ${user.id} ${user.email}`);
    return 0;
  } finally {
    await database.close();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  // a mensagem de um erro de consulta traz os parâmetros dela; sai só o que pode ir para a saída
  console.error(`users:create-admin: ${describeError(error)}`);
  process.exitCode = 1;
}
