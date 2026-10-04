import { type Database, schema } from '@academia/database';
import { hash, verify } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins/two-factor';

/** Argon2id (o algoritmo padrão do `@node-rs/argon2`) com m=19456, t=2, p=1. */
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

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
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: {
        hash: (password) => hash(password, ARGON2),
        verify: ({ hash: stored, password }) => verify(stored, password),
      },
    },
    plugins: [twoFactor()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
