import type { Problem, Role, StaffRole, TwoFactorEnableResponse } from '@academia/contracts';
import { createDatabase } from '@academia/database';
import type { Type } from '@nestjs/common';
import pg from 'pg';
import { expect } from 'vitest';
import type { MailTransport } from '../../src/mail/mail.service.ts';
import { UsersService } from '../../src/users/users.service.ts';
import { type StorageEnv, startApi } from './app.ts';
import { type Client, createClient } from './client.ts';
import { startPostgres } from './servers.ts';
import { totpCode } from './totp.ts';

export const PASSWORD = 'senha-de-teste-123';

/** O corpo de erro de uma resposta. */
export async function problem(response: Response) {
  return (await response.json()) as Problem;
}

export interface SeededUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  password: string;
}

/** Postgres real migrado, a API montada sobre ele e o que os testes usam para preparar usuários. */
export async function startStack(
  controllers: Type[] = [],
  storage?: StorageEnv,
  options: { env?: Record<string, string>; mail?: MailTransport } = {},
) {
  const postgres = await startPostgres();
  const api = await startApi(postgres.url, controllers, storage, options.env, options.mail);
  const pool = new pg.Pool({ connectionString: postgres.url });
  const database = createDatabase(postgres.url);
  const users = new UsersService(database.db);
  let seeded = 0;

  async function query<T extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
    return (await pool.query<T>(text, values)).rows;
  }

  /** Cria um usuário pelo mesmo serviço que `POST /api/users` usa. */
  async function seed(
    overrides: Partial<Omit<SeededUser, 'id'>> & { active?: boolean } = {},
  ): Promise<SeededUser> {
    seeded += 1;
    const password = overrides.password ?? PASSWORD;
    const user = await users.create({
      name: overrides.name ?? `Usuário ${seeded}`,
      email: overrides.email ?? `usuario${seeded}@exemplo.com`,
      // o perfil `student` não nasce pela gestão de usuários: o apoio do portal o cria pela ficha
      role: (overrides.role ?? 'reception') as StaffRole,
      password,
    });
    if (!user) throw new Error('e-mail de teste repetido');
    if (overrides.active === false) await query('update users set active = false where id = $1', [user.id]);
    return { id: user.id, name: user.name, email: user.email, role: user.role, password };
  }

  /** Um navegador com a sessão daquele usuário. */
  async function signIn(user: Pick<SeededUser, 'email' | 'password'>, client: Client = createClient(api.url)) {
    const response = await client.post('/api/auth/login', { email: user.email, password: user.password });
    expect(response.status, 'login de preparação').toBe(200);
    expect(await response.json()).toEqual({ status: 'authenticated' });
    return client;
  }

  /** Sessão de um usuário do perfil dado; o `admin` já sai com `twoFactorEnabled` igual a `true`. */
  async function session(role: Role) {
    const user = await seed({ role });
    const client = await signIn(user);
    if (role === 'admin') await query('update users set two_factor_enabled = true where id = $1', [user.id]);
    return { user, client };
  }

  /** Cadastra o TOTP de verdade (enable + confirm) na sessão dada. */
  async function enrollTwoFactor(client: Client, password = PASSWORD) {
    const enabled = await client.post('/api/auth/two-factor/enable', { password });
    expect(enabled.status, 'enable de preparação').toBe(200);
    const body = (await enabled.json()) as TwoFactorEnableResponse;
    const confirmed = await client.post('/api/auth/two-factor/confirm', { code: totpCode(body.totpUri) });
    expect(confirmed.status, 'confirm de preparação').toBe(204);
    return body;
  }

  async function close() {
    await api.close();
    await pool.end();
    await database.close();
    await postgres.stop();
  }

  return { api, postgres, database, client: () => createClient(api.url), query, seed, signIn, session, enrollTwoFactor, close };
}

export type Stack = Awaited<ReturnType<typeof startStack>>;
