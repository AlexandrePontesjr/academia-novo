import { type Database, sql } from '@academia/database';

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

export type Attempt = { allowed: true; at: Date } | { allowed: false; retryAfter: number };

/**
 * Bloqueio por tentativas (door 11): 5 falhas em 15 min para o mesmo e-mail bloqueiam aquele e-mail
 * por 15 min a contar da quinta. A contagem vive em `login_throttles`, e toda tentativa é contada
 * antes de a senha ser conferida, numa única instrução - tentativas simultâneas não passam de 5.
 */
export class LoginThrottle {
  constructor(private readonly db: Database['db']) {}

  /** Conta a tentativa como falha, ou a recusa se o e-mail está bloqueado. */
  async attempt(email: string): Promise<Attempt> {
    const at = new Date();
    const now = at.toISOString();
    const cutoff = new Date(at.getTime() - WINDOW_MS).toISOString();
    const counted = await this.db.execute(sql`
      insert into login_throttles as t (email, failures)
      values (${email}, array[${now}::timestamptz])
      on conflict (email) do update
        set failures =
          array(select f from unnest(t.failures) f where f > ${cutoff}::timestamptz order by f)
          || ${now}::timestamptz
        where not (
          cardinality(t.failures) >= ${MAX_FAILURES}
          and (select max(f) from unnest(t.failures) f) > ${cutoff}::timestamptz
        )
      returning email
    `);
    if (counted.rows.length > 0) return { allowed: true, at };

    const blocked = await this.db.execute<{ last: Date | null }>(sql`
      select max(f) as last from login_throttles, unnest(failures) f where email = ${email}
    `);
    const last = blocked.rows[0]?.last;
    const endsAt = last ? new Date(last).getTime() + WINDOW_MS : at.getTime();
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((endsAt - at.getTime()) / 1000)) };
  }

  /** Desfaz a contagem de uma tentativa em que a senha estava certa, mas falta o segundo fator. */
  async forgive(email: string, at: Date) {
    const moment = at.toISOString();
    await this.db.execute(sql`
      update login_throttles
      set failures =
        failures[:array_position(failures, ${moment}::timestamptz) - 1]
        || failures[array_position(failures, ${moment}::timestamptz) + 1:]
      where email = ${email} and array_position(failures, ${moment}::timestamptz) is not null
    `);
  }

  /** Um login autenticado zera o contador do e-mail. */
  async reset(email: string) {
    await this.db.execute(sql`delete from login_throttles where email = ${email}`);
  }
}
