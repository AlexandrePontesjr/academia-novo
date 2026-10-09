import {
  type CreatePaymentRequest,
  type OpenPayment,
  type OpenPaymentStatus,
  paymentStatus,
  type RegisteredPayment,
  saoPauloToday,
  type StudentPayment,
} from '@academia/contracts';
import { and, asc, type Database, desc, eq, inArray, isNull, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';

const { enrollments, payments, plans, students } = schema;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Os campos do período cuja trilha guarda o valor (AD-026, AD-069): nenhum é dado pessoal. */
const TRACKED = ['startsAt', 'priceCents'] as const;
type Tracked = Record<(typeof TRACKED)[number], string | number | null>;
const NOTHING: Tracked = { startsAt: null, priceCents: null };

type Period = typeof enrollments.$inferSelect;

const trackedOf = (period: Period): Tracked => ({ startsAt: period.startsAt, priceCents: period.priceCents });

export type ConfirmOutcome =
  | { outcome: 'ok'; payment: RegisteredPayment }
  | { outcome: 'not_found' }
  /** O período não existe ou é de outro aluno: um `422` no campo `enrollmentId`. */
  | { outcome: 'invalid_enrollment' }
  | { outcome: 'enrollment_cancelled' }
  | { outcome: 'payment_already_confirmed' };

/** Os pagamentos de um aluno, pelo período, e a linha de auditoria de cada escrita. */
export class StudentPaymentsService {
  constructor(private readonly db: Database['db']) {}

  /**
   * Confirma o pagamento de um período com a linha dele travada em `FOR UPDATE` (door 1): confirmar
   * e cancelar o período esperam um pelo outro, e a unicidade de uma confirmação viva é do índice
   * parcial, que a resposta `payment_already_confirmed` espelha. A linha do aluno não é travada: a
   * confirmação não cruza a ordem aluno-depois-plano do `POST` de matrícula.
   */
  async confirm(studentId: string, input: CreatePaymentRequest, actor: AuditActor): Promise<ConfirmOutcome> {
    if (!UUID.test(studentId)) return { outcome: 'not_found' };
    return this.db.transaction(async (tx): Promise<ConfirmOutcome> => {
      const [student] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
      if (!student) return { outcome: 'not_found' };

      const [period] = await tx
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.id, input.enrollmentId), eq(enrollments.studentId, studentId)))
        .for('update');
      if (!period) return { outcome: 'invalid_enrollment' };
      if (period.cancelledAt !== null) return { outcome: 'enrollment_cancelled' };

      const alive = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.enrollmentId, period.id), isNull(payments.voidedAt)));
      if (alive.length > 0) return { outcome: 'payment_already_confirmed' };

      const [row] = await tx.insert(payments).values({ enrollmentId: period.id }).returning();
      const confirmed = row!;
      await audit.record(tx, {
        actor,
        action: 'student.payment_confirmed',
        entity: 'student',
        entityId: studentId,
        diff: diffOf<Tracked>(NOTHING, trackedOf(period), TRACKED, TRACKED),
      });
      return {
        outcome: 'ok',
        payment: { id: confirmed.id, enrollmentId: confirmed.enrollmentId, createdAt: confirmed.createdAt.toISOString() },
      };
    });
  }

  /**
   * Todos os períodos do aluno, cancelados inclusive, do início mais recente ao mais antigo e, no
   * empate, de `enrollmentId` maior primeiro. A situação é a da conta única, no dia de hoje; `payment`
   * é a confirmação viva do período, se houver. A leitura não grava na trilha. `undefined` quando o
   * aluno não existe.
   */
  async list(studentId: string): Promise<StudentPayment[] | undefined> {
    if (!UUID.test(studentId)) return undefined;
    const [student] = await this.db.select({ id: students.id }).from(students).where(eq(students.id, studentId));
    if (!student) return undefined;

    const periods = await this.db
      .select({ period: enrollments, plan: { id: plans.id, name: plans.name, period: plans.period } })
      .from(enrollments)
      .innerJoin(plans, eq(plans.id, enrollments.planId))
      .where(eq(enrollments.studentId, studentId))
      .orderBy(desc(enrollments.startsAt), desc(enrollments.id));
    const alive = await this.aliveOf(periods.map(({ period }) => period.id));
    const today = saoPauloToday();
    return periods.map(({ period, plan }) => {
      const own = alive.filter((row) => row.enrollmentId === period.id);
      const live = own[0];
      return {
        enrollmentId: period.id,
        plan,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        priceCents: period.priceCents,
        ...paymentStatus(period, own, today),
        payment: live ? { id: live.id, createdAt: live.createdAt.toISOString() } : null,
      };
    });
  }

  /**
   * Os períodos não cancelados e sem confirmação viva, de aluno de qualquer situação, do vencimento
   * mais antigo ao mais novo e, no empate, de `enrollmentId` crescente. O filtro por situação vem
   * depois da conta única, em código, nunca em SQL.
   */
  async listOpen(status?: OpenPaymentStatus): Promise<OpenPayment[]> {
    const periods = await this.db
      .select({
        period: enrollments,
        plan: { id: plans.id, name: plans.name, period: plans.period },
        student: { id: students.id, name: students.name },
      })
      .from(enrollments)
      .innerJoin(plans, eq(plans.id, enrollments.planId))
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(isNull(enrollments.cancelledAt))
      .orderBy(asc(enrollments.startsAt), asc(enrollments.id));
    const alive = await this.aliveOf(periods.map(({ period }) => period.id));
    const today = saoPauloToday();
    const items: OpenPayment[] = [];
    for (const { period, plan, student } of periods) {
      const account = paymentStatus(
        period,
        alive.filter((row) => row.enrollmentId === period.id),
        today,
      );
      if (account.status !== 'pending' && account.status !== 'overdue') continue;
      if (status && account.status !== status) continue;
      items.push({
        enrollmentId: period.id,
        student,
        plan,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        priceCents: period.priceCents,
        ...account,
        status: account.status,
      });
    }
    return items;
  }

  /** As confirmações vivas dos períodos dados. */
  private async aliveOf(enrollmentIds: string[]) {
    if (enrollmentIds.length === 0) return [];
    return this.db
      .select()
      .from(payments)
      .where(and(inArray(payments.enrollmentId, enrollmentIds), isNull(payments.voidedAt)));
  }

  /**
   * Desfaz: preenche `voided_at` com o instante do banco e mantém a linha, em qualquer situação do
   * período. `false` quando o pagamento não existe ou é de outro aluno; já desfeito, nada muda e nada
   * é gravado. A linha do período é travada como na confirmação, e o `WHERE` repete a condição: dois
   * desfazimentos ao mesmo tempo gravam uma vez só.
   */
  async undo(studentId: string, paymentId: string, actor: AuditActor): Promise<boolean> {
    if (!UUID.test(studentId) || !UUID.test(paymentId)) return false;
    return this.db.transaction(async (tx) => {
      const [found] = await tx
        .select({ payment: payments, period: enrollments })
        .from(payments)
        .innerJoin(enrollments, eq(enrollments.id, payments.enrollmentId))
        .where(and(eq(payments.id, paymentId), eq(enrollments.studentId, studentId)));
      if (!found) return false;
      if (found.payment.voidedAt !== null) return true;

      await tx.select({ id: enrollments.id }).from(enrollments).where(eq(enrollments.id, found.period.id)).for('update');
      const undone = await tx
        .update(payments)
        .set({ voidedAt: sql`now()` })
        .where(and(eq(payments.id, paymentId), isNull(payments.voidedAt)))
        .returning({ id: payments.id });
      if (undone.length === 0) return true;
      await audit.record(tx, {
        actor,
        action: 'student.payment_undone',
        entity: 'student',
        entityId: studentId,
        diff: diffOf<Tracked>(trackedOf(found.period), NOTHING, TRACKED, TRACKED),
      });
      return true;
    });
  }
}
