import type { AuditAction, AuditDiff } from '@academia/contracts';
import { type Database, schema } from '@academia/database';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { CurrentUser } from '../access.ts';

const USER_AGENT_MAX_LENGTH = 512;

/** Quem fez a ação e de onde. Sem `userId` quando a ação não tem autor (linha de comando). */
export interface AuditActor {
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
}

/** Ação feita fora de uma requisição: sem autor, sem IP e sem user-agent. */
export const NO_ACTOR: AuditActor = { userId: null, ip: null, userAgent: null };

export interface AuditEntry {
  actor: AuditActor;
  action: AuditAction;
  /** Nome da entidade no singular (AD-025). */
  entity: string;
  entityId: string | null;
  diff?: AuditDiff | null;
}

/** O contexto da requisição: o usuário da sessão, o IP (AD-028) e o user-agent. */
export function actorOf(req: Request, res: Response): AuditActor {
  const user = res.locals.currentUser as CurrentUser | undefined;
  return {
    userId: user?.id ?? null,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, USER_AGENT_MAX_LENGTH) || null,
  };
}

/** O autor da requisição, para o handler entregar a quem grava a linha de auditoria. */
export const Actor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const http = context.switchToHttp();
  return actorOf(http.getRequest<Request>(), http.getResponse<Response>());
});

/**
 * O `diff` de uma mudança (AD-026). `fields` segue a ordem de `tracked`; `values` só tem os campos
 * de `registrable`. `null` quando nada mudou. Na criação, `before` é `null` e todo campo conta.
 */
export function diffOf<T extends Record<string, unknown>>(
  before: T | null,
  after: T,
  tracked: ReadonlyArray<keyof T & string>,
  registrable: ReadonlyArray<string>,
): AuditDiff | null {
  const fields = tracked.filter((field) => before === null || before[field] !== after[field]);
  if (fields.length === 0) return null;
  const values: AuditDiff['values'] = {};
  for (const field of fields) {
    if (registrable.includes(field)) values[field] = { from: before?.[field] ?? null, to: after[field] };
  }
  return { fields, values };
}

/**
 * O gravador único da trilha (AD-027). Recebe a transação de quem altera o dado: a mudança e a
 * linha entram juntas ou não entra nenhuma. Só insere o que recebe; o instante é o do banco.
 */
export const audit = {
  async record(tx: Pick<Database['db'], 'insert'>, entry: AuditEntry) {
    await tx.insert(schema.auditLogs).values({
      userId: entry.actor.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ip: entry.actor.ip,
      userAgent: entry.actor.userAgent,
      diff: entry.diff ?? null,
    });
  },
};
