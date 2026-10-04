import type { Stack } from './stack.ts';

/** Uma linha de `audit_logs`, como o banco a guarda. */
export interface AuditRow {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  ip: string | null;
  user_agent: string | null;
  diff: unknown;
  created_at: Date;
}

/** As linhas da trilha, lidas do banco do teste por SQL - nunca pela rota de consulta. */
export const auditRows = (stack: Stack) =>
  stack.query<AuditRow>('select * from audit_logs order by created_at, id');

export const auditCount = async (stack: Stack) =>
  Number((await stack.query<{ n: string }>('select count(*) as n from audit_logs'))[0]!.n);

/** Roda a ação e devolve o que ela devolveu mais as linhas que passaram a existir por causa dela. */
export async function written<T>(stack: Stack, act: () => Promise<T>) {
  const before = new Set((await auditRows(stack)).map((row) => row.id));
  const result = await act();
  const rows = (await auditRows(stack)).filter((row) => !before.has(row.id));
  return { result, rows };
}

/**
 * Faz o insert em `audit_logs` falhar enquanto a ação roda: um gatilho `BEFORE INSERT` no próprio
 * banco do teste recusa a instrução. A falha vem do Postgres real, sem dublê do gravador.
 */
export async function withAuditInsertFailing<T>(stack: Stack, act: () => Promise<T>) {
  await stack.query(`
    create or replace function refuse_audit_insert() returns trigger language plpgsql as $$
    begin
      raise exception 'insert em audit_logs recusado pelo teste';
    end;
    $$`);
  await stack.query(
    'create trigger refuse_audit_insert before insert on audit_logs for each row execute function refuse_audit_insert()',
  );
  try {
    return await act();
  } finally {
    await stack.query('drop trigger refuse_audit_insert on audit_logs');
  }
}
