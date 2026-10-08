import type { CreatePlanRequest, Plan } from '@academia/contracts';
import { type Database, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';

const { plans } = schema;

/** Os campos de `plan` cuja trilha de auditoria guarda o valor (AD-026, AD-063); de `rules`, só o nome. */
const REGISTRABLE = ['name', 'period', 'priceCents', 'status'];

/** Na ordem em que a trilha lista os campos alterados. */
const TRACKED = ['name', 'period', 'priceCents', 'rules', 'status'] as const;

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
}

const fieldsOf = (row: Row): Fields => ({
  name: row.name,
  period: row.period,
  priceCents: row.priceCents,
  rules: row.rules,
  status: row.status,
});

const toPlan = (row: Row): Plan => ({ id: row.id, ...fieldsOf(row) });
