import { type Database, sql } from '@academia/database';

/** Envios aceitos por chave numa janela de uma hora (door 4); mudar é um commit. */
export const LEAD_LIMITS = { ip: 5, email: 3 } as const;

export type LeadAttempt = { allowed: true } | { allowed: false; retryAfter: number };

type Executor = Pick<Database['db'], 'execute'>;

/**
 * Conta um envio do formulário público em `lead_throttles`, à parte de `login_throttles`, com a
 * instrução única de `LoginThrottle`: envios simultâneos da mesma chave não passam do limite. A
 * janela é a da última hora pelo relógio do banco; recusado, nada é contado, e `retryAfter` é o
 * tempo até o envio mais antigo da janela sair dela. Quem chama passa a transação do envio: se ele
 * é recusado depois (termo, trilha), a contagem é desfeita junto.
 */
export async function attemptLead(executor: Executor, kind: keyof typeof LEAD_LIMITS, value: string): Promise<LeadAttempt> {
  const key = `${kind}:${value}`;
  const max = LEAD_LIMITS[kind];
  const counted = await executor.execute(sql`
    insert into lead_throttles as t (key, hits)
    values (${key}, array[now()])
    on conflict (key) do update
      set hits = array(select h from unnest(t.hits) h where h > now() - interval '1 hour' order by h) || now()
      where (select count(*) from unnest(t.hits) h where h > now() - interval '1 hour') < ${max}
    returning key
  `);
  if (counted.rows.length > 0) return { allowed: true };

  const oldest = await executor.execute<{ seconds: string | null }>(sql`
    select ceil(extract(epoch from min(h) + interval '1 hour' - now())) as seconds
      from lead_throttles, unnest(hits) h
     where key = ${key} and h > now() - interval '1 hour'
  `);
  return { allowed: false, retryAfter: Math.max(1, Number(oldest.rows[0]?.seconds ?? 1)) };
}
