import { and, type Database, eq, schema } from '@academia/database';

const { users } = schema;

/**
 * Os administradores ativos em `key share`, por `id`, antes de a transação tocar o usuário-alvo: a ordem de
 * `UsersService.update`, que os segura em `update` enquanto espera o alvo. A linha de auditoria pede `key
 * share` no autor; quem gravou o alvo antes fecharia o ciclo com `update` (deadlock, `500` no `PATCH`).
 */
export async function lockActiveAdmins(tx: Pick<Database['db'], 'select'>): Promise<void> {
  await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.active, true)))
    .orderBy(users.id)
    .for('key share');
}
