import type { CreatePlanRequest, Plan, UpdatePlanRequest } from '@academia/contracts';
import { type Database, eq, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';

const { plans } = schema;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Os campos de `plan` cuja trilha de auditoria guarda o valor (AD-026, AD-063); de `rules`, só o nome. */
const REGISTRABLE = ['name', 'period', 'priceCents', 'status'];

/** Na ordem em que a trilha lista os campos alterados. */
const TRACKED = ['name', 'period', 'priceCents', 'rules', 'status'] as const;

/** O que o `PATCH` altera: `period` é fixado no cadastro e nenhuma rota o muda (door 1). */
const EDITABLE = ['name', 'priceCents', 'rules', 'status'] as const;

type Fields = Omit<Plan, 'id'>;

/** Antes da criação nada existe: todo campo preenchido conta como alterado. */
const NOTHING = Object.fromEntries(TRACKED.map((field) => [field, null])) as unknown as Fields;

type Row = typeof plans.$inferSelect;

/** Leitura e escrita de `plans`, e a linha de auditoria de cada escrita, na mesma transação. */
export class PlansService {
  constructor(private readonly db: Database['db']) {}

  /** Cria o plano, sempre ativo. Um nome repetido cria outro plano: não há unicidade (door 1). */
  async create(input: CreatePlanRequest, actor: AuditActor): Promise<Plan> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(plans)
        .values({ name: input.name, period: input.period, priceCents: input.priceCents, rules: input.rules ?? null })
        .returning();
      await audit.record(tx, {
        actor,
        action: 'plan.created',
        entity: 'plan',
        entityId: row!.id,
        diff: diffOf(NOTHING, fieldsOf(row!), TRACKED, REGISTRABLE),
      });
      return toPlan(row!);
    });
  }

  /**
   * Todos os planos, ativos e inativos, por nome sem caixa nem acento e, no empate, por `id` (AD-035).
   * A leitura não grava na trilha.
   */
  async list(): Promise<Plan[]> {
    const rows = await this.db
      .select()
      .from(plans)
      .orderBy(sql`students_fold(${plans.name}) collate "C"`, plans.id);
    return rows.map(toPlan);
  }

  /**
   * Altera só os campos enviados, com a linha travada: duas edições de campos diferentes se somam. Sem
   * mudança de valor não grava nada, nem em `plans` nem na trilha. As matrículas já registradas guardam
   * o valor do dia delas: um reajuste só vale para as seguintes (door 3). `undefined` se o plano não existe.
   */
  async update(id: string, change: UpdatePlanRequest, actor: AuditActor): Promise<Plan | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(plans).where(eq(plans.id, id)).for('update');
      if (!row) return undefined;

      const before = fieldsOf(row);
      const after: Fields = { ...before };
      for (const field of EDITABLE) {
        const sent = change[field];
        if (sent !== undefined) (after as Record<string, unknown>)[field] = sent;
      }
      const diff = diffOf(before, after, TRACKED, REGISTRABLE);
      if (!diff) return toPlan(row);

      const [updated] = await tx
        .update(plans)
        .set({ name: after.name, priceCents: after.priceCents, rules: after.rules, status: after.status, updatedAt: new Date() })
        .where(eq(plans.id, id))
        .returning();
      await audit.record(tx, { actor, action: 'plan.updated', entity: 'plan', entityId: id, diff });
      return toPlan(updated!);
    });
  }

  /**
   * Tira o plano de linha: a linha e as matrículas dele ficam como estão, e ele continua na lista.
   * `false` se o plano não existe; já inativo, nada muda.
   */
  async inactivate(id: string, actor: AuditActor): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(plans).where(eq(plans.id, id)).for('update');
      if (!row) return false;
      if (row.status === 'inactive') return true;

      await tx.update(plans).set({ status: 'inactive', updatedAt: new Date() }).where(eq(plans.id, id));
      await audit.record(tx, {
        actor,
        action: 'plan.inactivated',
        entity: 'plan',
        entityId: id,
        diff: diffOf({ status: row.status }, { status: 'inactive' }, ['status'], REGISTRABLE),
      });
      return true;
    });
  }
}

const fieldsOf = (row: Row): Fields => ({
  name: row.name,
  period: row.period,
  priceCents: row.priceCents,
  rules: row.rules,
  status: row.status,
});

const toPlan = (row: Row): Plan => ({ id: row.id, ...fieldsOf(row) });
