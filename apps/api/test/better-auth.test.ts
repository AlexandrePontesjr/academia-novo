import { createDatabase, type Database } from '@academia/database';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { type Auth, createAuth } from '../src/auth.ts';
import { startPostgres } from './support/servers.ts';
import { cookieHeader, totpCode } from './support/totp.ts';

const EMAIL = 'admin@exemplo.com';
const PASSWORD = 'senha-de-teste-123';

let postgres: Awaited<ReturnType<typeof startPostgres>>;
let database: Database;
let client: pg.Client;
let auth: Auth;

beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.url);
  client = new pg.Client({ connectionString: postgres.url });
  await client.connect();
  auth = createAuth(database.db, {
    secret: 'segredo-de-teste-com-32-caracteres!',
    webOrigin: 'http://localhost:3000',
  });
}, 180_000);

afterAll(async () => {
  await client?.end();
  await database?.close();
  await postgres?.stop();
});

async function sessionRows() {
  return (await client.query<{ user_id: string }>('select user_id from sessions')).rows;
}

/** Cria o usuário como o sistema criará (o cadastro aberto está desativado) e ativa o 2FA dele. */
async function userWithTwoFactor() {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    { name: 'Admin', email: EMAIL, role: 'admin', active: true },
    { method: 'admin' },
  );
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await context.password.hash(PASSWORD),
  });

  const signIn = await auth.api.signInEmail({
    body: { email: EMAIL, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = cookieHeader(signIn.headers);
  const enabled = await auth.api.enableTwoFactor({
    body: { password: PASSWORD },
    headers: new Headers({ cookie }),
  });
  if (enabled.method !== 'totp') throw new Error('enableTwoFactor não devolveu totpURI');
  await auth.api.verifyTOTP({
    body: { code: totpCode(enabled.totpURI) },
    headers: new Headers({ cookie }),
  });
  await client.query('delete from sessions');
  return { id: user.id, totpUri: enabled.totpURI };
}

test('two_factor_via_auth_api_with_return_headers', async () => {
  const user = await userWithTwoFactor();
  const stored = await client.query('select two_factor_enabled from users where id = $1', [user.id]);
  expect(stored.rows).toEqual([{ two_factor_enabled: true }]);

  const signIn = await auth.api.signInEmail({
    body: { email: EMAIL, password: PASSWORD },
    returnHeaders: true,
  });

  expect(await sessionRows()).toEqual([]);

  const verified = await auth.api.verifyTOTP({
    body: { code: totpCode(user.totpUri) },
    headers: new Headers({ cookie: cookieHeader(signIn.headers) }),
    returnHeaders: true,
  });

  expect(await sessionRows()).toEqual([{ user_id: user.id }]);
  expect(verified.headers.getSetCookie().length).toBeGreaterThan(0);
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: cookieHeader(verified.headers) }),
  });
  expect(session?.user.id).toBe(user.id);
});
