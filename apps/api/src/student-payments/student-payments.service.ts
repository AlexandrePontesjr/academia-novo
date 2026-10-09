import {
  addDays,
  type CreatePaymentRequest,
  type OpenPayment,
  type OpenPaymentStatus,
  PAID_AT_MAX_DAYS_BEFORE_START,
  type Payment,
  paymentBalance,
  type RegisteredPayment,
  saoPauloToday,
  type StudentPayment,
} from '@academia/contracts';
import { and, asc, type Database, desc, eq, inArray, isNull, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';

const { enrollments, payments, plans, students } = schema;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Os campos de um pagamento cuja trilha guarda o valor (AD-026, AD-066): nenhum é dado pessoal. */
const TRACKED = ['enrollmentId', 'amountCents', 'paidAt', 'method'] as const;
type Tracked = Record<(typeof TRACKED)[number], string | number | null>;
const NOTHING: Tracked = { enrollmentId: null, amountCents: null, paidAt: null, method: null };

type Row = typeof payments.$inferSelect;

export type RegisterOutcome =
  | { outcome: 'ok'; payment: RegisteredPayment }
  | { outcome: 'not_found' }
  /** Um `422` por campo: o caminho que a tela marca e a mensagem. */
  | { outcome: 'invalid'; path: 'enrollmentId' | 'paidAt'; message: string }
  | { outcome: 'enrollment_cancelled' }
  | { outcome: 'payment_exceeds_balance' };

const toPayment = (row: Row): Payment => ({
  id: row.id,
  amountCents: row.amountCents,
  paidAt: row.paidAt,
  method: row.method,
  createdAt: row.createdAt.toISOString(),
  voidedAt: row.voidedAt?.toISOString() ?? null,
});

const trackedOf = (row: Row): Tracked => ({
  enrollmentId: row.enrollmentId,
  amountCents: row.amountCents,
  paidAt: row.paidAt,
  method: row.method,
});

/** Os pagamentos de um aluno, pelo período, e a linha de auditoria de cada escrita. */
export class StudentPaymentsService {
  constructor(private readonly db: Database['db']) {}

  /**
   * Registra um pagamento com a linha do período travada em `FOR UPDATE` (door 2): dois registros do
   * mesmo período esperam um pelo outro, e o teto da soma - o valor do período - é conferido com o que
   * ficou. O banco não defende esse teto. A linha do aluno não é travada: o registro não cruza a ordem
   * aluno-depois-plano do `POST` de matrícula.
   */
  async register(studentId: string, input: CreatePaymentRequest, actor: AuditActor): Promise<RegisterOutcome> {
    if (!UUID.test(studentId)) return { outcome: 'not_found' };
    return this.db.transaction(async (tx): Promise<RegisterOutcome> => {
      const [student] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
      if (!student) return { outcome: 'not_found' };

      const [period] = await tx
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.id, input.enrollmentId), eq(enrollments.studentId, studentId)))
        .for('update');
      if (!period) return { outcome: 'invalid', path: 'enrollmentId', message: 'Escolha um período válido.' };
      if (input.paidAt < addDays(period.startsAt, -PAID_AT_MAX_DAYS_BEFORE_START)) {
        return {
          outcome: 'invalid',
          path: 'paidAt',
          message: 'A data do pagamento não pode ser anterior em mais de 365 dias ao início do período.',
        };
      }
      if (period.cancelledAt !== null) return { outcome: 'enrollment_cancelled' };

      const [paid] = await tx
        .select({ cents: sql<string>`coalesce(sum(${payments.amountCents}), 0)` })
        .from(payments)
        .where(and(eq(payments.enrollmentId, period.id), isNull(payments.voidedAt)));
      if (input.amountCents > period.priceCents - Number(paid!.cents)) return { outcome: 'payment_exceeds_balance' };

      const [row] = await tx
        .insert(payments)
        .values({ enrollmentId: period.id, amountCents: input.amountCents, paidAt: input.paidAt, method: input.method })
        .returning();
      const registered = row!;
      await audit.record(tx, {
        actor,
        action: 'student.payment_registered',
        entity: 'student',
        entityId: studentId,
        diff: diffOf<Tracked>(NOTHING, trackedOf(registered), TRACKED, TRACKED),
      });
      return {
        outcome: 'ok',
        payment: {
          id: registered.id,
          enrollmentId: registered.enrollmentId,
          amountCents: registered.amountCents,
          paidAt: registered.paidAt,
          method: registered.method,
          createdAt: registered.createdAt.toISOString(),
          voidedAt: null,
        },
      };
    });
  }

  /**
   * Todos os períodos do aluno, cancelados inclusive, do início mais recente ao mais antigo e, no
   * empate, de `enrollmentId` maior primeiro, cada um com os pagamentos dele (anulados inclusive, do
   * `paidAt` mais recente ao mais antigo e, no empate, de `id` maior primeiro). O saldo e a situação
   * são os da conta única, no dia de hoje. A leitura não grava na trilha. `undefined` quando o aluno
   * não existe.
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
    const rows =
      periods.length === 0
        ? []
        : await this.db
            .select()
            .from(payments)
            .where(inArray(payments.enrollmentId, periods.map(({ period }) => period.id)))
            .orderBy(desc(payments.paidAt), desc(payments.id));
    const today = saoPauloToday();
    return periods.map(({ period, plan }) => {
      const own = rows.filter((row) => row.enrollmentId === period.id);
      return {
        enrollmentId: period.id,
        plan,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        priceCents: period.priceCents,
        ...paymentBalance(period, own, today),
        payments: own.map(toPayment),
      };
    });
  }

  /**
   * Os períodos não cancelados com saldo, de aluno de qualquer situação, do vencimento mais antigo ao
   * mais novo e, no empate, de `enrollmentId` crescente. O filtro por situação vem depois da conta
   * única, em código, nunca em SQL.
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
    const rows =
      periods.length === 0
        ? []
        : await this.db
            .select()
            .from(payments)
            .where(
              and(
                inArray(payments.enrollmentId, periods.map(({ period }) => period.id)),
                isNull(payments.voidedAt),
              ),
            );
    const today = saoPauloToday();
    const items: OpenPayment[] = [];
    for (const { period, plan, student } of periods) {
      const account = paymentBalance(
        period,
        rows.filter((row) => row.enrollmentId === period.id),
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

  /**
   * Anula: preenche `voided_at` com o instante do banco e mantém a linha, em qualquer situação do
   * período. `false` quando o pagamento não existe ou é de outro aluno; já anulado, nada muda e nada é
   * gravado. A linha do período é travada como no registro, e o `WHERE` repete a condição: duas
   * anulações ao mesmo tempo gravam uma vez só.
   */
  async void(studentId: string, paymentId: string, actor: AuditActor): Promise<boolean> {
    if (!UUID.test(studentId) || !UUID.test(paymentId)) return false;
    return this.db.transaction(async (tx) => {
      const [found] = await tx
        .select({ payment: payments })
        .from(payments)
        .innerJoin(enrollments, eq(enrollments.id, payments.enrollmentId))
        .where(and(eq(payments.id, paymentId), eq(enrollments.studentId, studentId)));
      if (!found) return false;
      if (found.payment.voidedAt !== null) return true;

      await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(eq(enrollments.id, found.payment.enrollmentId))
        .for('update');
      const voided = await tx
        .update(payments)
        .set({ voidedAt: sql`now()` })
        .where(and(eq(payments.id, paymentId), isNull(payments.voidedAt)))
        .returning({ id: payments.id });
      if (voided.length === 0) return true;
      await audit.record(tx, {
        actor,
        action: 'student.payment_voided',
        entity: 'student',
        entityId: studentId,
        diff: diffOf<Tracked>(trackedOf(found.payment), NOTHING, TRACKED, TRACKED),
      });
      return true;
    });
  }
}
