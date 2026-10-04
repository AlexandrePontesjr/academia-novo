import { PASSWORD_MAX_LENGTH } from '@academia/contracts';
import { type Database, schema } from '@academia/database';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { logBetterAuth } from './log-safe.ts';
import { hashPassword, verifyPassword } from './password.ts';

/**
 * O Better Auth ainda aceita a sessão no instante exato de `expiresAt`. Gravando 1 ms a menos, ela
 * vale enquanto o último uso tem menos de 30 minutos, e aos 30 minutos exatos já não vale.
 */
function endingBefore<T extends { expiresAt?: Date }>(session: T): T {
  if (!session.expiresAt) return session;
  return { ...session, expiresAt: new Date(new Date(session.expiresAt).getTime() - 1) };
}

export interface AuthConfig {
  secret: string;
  webOrigin: string;
}

/**
 * Better Auth usado como biblioteca (AD-017): só `auth.api.*` é chamado, com `returnHeaders: true`
 * para repassar os `Set-Cookie`. O handler HTTP dele não é montado em lugar nenhum.
 */
export function createAuth(db: Database['db'], { secret, webOrigin }: AuthConfig) {
  return betterAuth({
    appName: 'Gestão de Academia',
    baseURL: webOrigin,
    secret,
    telemetry: { enabled: false },
    // sem isto o Better Auth escreve no console, fora do JSON e com os parâmetros das consultas
    logger: { log: logBetterAuth },
    database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema }),
    advanced: {
      // o cookie sai sempre com `Secure`, também em http://localhost
      useSecureCookies: true,
      // o id é o `uuidv7()` padrão da coluna
      database: { generateId: false },
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: true, input: false },
        active: { type: 'boolean', required: true, defaultValue: true, input: false },
      },
    },
    session: { expiresIn: 1800, updateAge: 60 },
    databaseHooks: {
      session: {
        create: { before: async (session) => ({ data: endingBefore(session) }) },
        update: { before: async (session) => ({ data: endingBefore(session) }) },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    plugins: [twoFactor()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
