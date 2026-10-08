import {
  type CreateEnrollmentRequest,
  type Enrollment,
  enrollmentEndsAt,
  enrollmentStatus,
  saoPauloToday,
} from '@academia/contracts';
import { and, type Database, desc, eq, isNull, schema, sql } from '@academia/database';
import { audit, type AuditActor, diffOf } from '../audit/audit.ts';
import { isExclusionViolation } from '../db-errors.ts';

const { enrollments, plans, students } = schema;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Os campos de uma matrícula cuja trilha guarda o valor (AD-026, AD-063): nenhum é dado pessoal. */
const TRACKED = ['planId', 'startsAt', 'endsAt', 'priceCents'] as const;
type Tracked = Record<(typeof TRACKED)[number], string | number | null>;
const NOTHING: Tracked = { planId: null, startsAt: null, endsAt: null, priceCents: null };

type Row = typeof enrollments.$inferSelect;
type PlanOfRow = Pick<typeof plans.$inferSelect, 'id' | 'name' | 'period'>;

export type EnrollOutcome =
  | { outcome: 'ok'; enrollment: Enrollment }
  | { outcome: 'not_found' }
  /** Um `422` por campo: o caminho que a tela marca e a mensagem. */
  | { outcome: 'invalid'; path: 'planId' | 'startsAt'; message: string }
  | { outcome: 'student_inactive' }
  | { outcome: 'plan_inactive' }
  | { outcome: 'enrollment_overlap' };

const trackedOf = (row: Row): Tracked => ({
  planId: row.planId,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  priceCents: row.priceCents,
});

/** A matrícula como a API a devolve: a situação é a do dia `today`, nunca guardada (door 4). */
const toEnrollment = (row: Row, plan: PlanOfRow, today: string): Enrollment => ({
  id: row.id,
  plan: { id: plan.id, name: plan.name, period: plan.period },
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  priceCents: row.priceCents,
  status: enrollmentStatus(row, today),
  createdAt: row.createdAt.toISOString(),
  cancelledAt: row.cancelledAt?.toISOString() ?? null,
});

/** As matrículas de um aluno - um período por linha (door 3) - e a linha de auditoria de cada escrita. */
export class StudentEnrollmentsService {
  constructor(private readonly db: Database['db']) {}

  /**
   * Registra um período com a linha do aluno travada, como `consents`: duas matrículas do mesmo aluno
   * esperam uma pela outra. Não há conferência de sobreposição antes do insert: quem decide é a
   * restrição `enrollments_no_overlap` (door 5), e a recusa dela vira `enrollment_overlap`. O plano é
   * lido com trava compartilhada, que espera a edição ou a inativação em curso: o valor copiado e a
   * situação conferida são os que ficaram.
   */
  async create(studentId: string, input: CreateEnrollmentRequest, actor: AuditActor): Promise<EnrollOutcome> {
    if (!UUID.test(studentId)) return { outcome: 'not_found' };
    try {
      return await this.db.transaction(async (tx): Promise<EnrollOutcome> => {
        const [student] = await tx
          .select({ status: students.status })
          .from(students)
          .where(eq(students.id, studentId))
          .for('update');
        if (!student) return { outcome: 'not_found' };

        const [plan] = await tx.select().from(plans).where(eq(plans.id, input.planId)).for('share');
        if (!plan) return { outcome: 'invalid', path: 'planId', message: 'Escolha um plano válido.' };

        const today = saoPauloToday();
        const endsAt = enrollmentEndsAt(input.startsAt, plan.period);
        if (endsAt < today) {
          return { outcome: 'invalid', path: 'startsAt', message: 'O vencimento desse início já passou. Escolha um início mais recente.' };
        }
        if (student.status === 'inactive') return { outcome: 'student_inactive' };
        if (plan.status === 'inactive') return { outcome: 'plan_inactive' };

        const [row] = await tx
          .insert(enrollments)
          .values({ studentId, planId: plan.id, startsAt: input.startsAt, endsAt, priceCents: plan.priceCents })
          .returning();
        await audit.record(tx, {
          actor,
          action: 'student.enrollment_created',
          entity: 'student',
          entityId: studentId,
          diff: diffOf<Tracked>(NOTHING, trackedOf(row!), TRACKED, TRACKED),
        });
        return { outcome: 'ok', enrollment: toEnrollment(row!, plan, today) };
      });
    } catch (error) {
      if (isExclusionViolation(error)) return { outcome: 'enrollment_overlap' };
      throw error;
    }
  }

  /**
   * Todas as matrículas do aluno, canceladas inclusive, do início mais recente ao mais antigo e, no
   * empate, de `id` maior primeiro, com o nome atual do plano. A leitura não grava na trilha.
   * `undefined` quando o aluno não existe.
   */
  async list(studentId: string): Promise<Enrollment[] | undefined> {
    if (!UUID.test(studentId)) return undefined;
    const [student] = await this.db.select({ id: students.id }).from(students).where(eq(students.id, studentId));
    if (!student) return undefined;

    const rows = await this.db
      .select({ enrollment: enrollments, plan: { id: plans.id, name: plans.name, period: plans.period } })
      .from(enrollments)
      .innerJoin(plans, eq(plans.id, enrollments.planId))
      .where(eq(enrollments.studentId, studentId))
      .orderBy(desc(enrollments.startsAt), desc(enrollments.id));
    const today = saoPauloToday();
    return rows.map(({ enrollment, plan }) => toEnrollment(enrollment, plan, today));
  }

  /**
   * Cancela: preenche `cancelled_at` com o instante do banco e mantém a linha, em qualquer situação.
   * `false` quando a matrícula não existe ou é de outro aluno; já cancelada, nada muda e nada é gravado.
   */
  async cancel(studentId: string, enrollmentId: string, actor: AuditActor): Promise<boolean> {
    if (!UUID.test(studentId) || !UUID.test(enrollmentId)) return false;
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.studentId, studentId)));
      if (!row) return false;
      if (row.cancelledAt !== null) return true;

      // o `WHERE` repete a condição: dois cancelamentos ao mesmo tempo gravam uma vez só
      const cancelled = await tx
        .update(enrollments)
        .set({ cancelledAt: sql`now()` })
        .where(and(eq(enrollments.id, enrollmentId), isNull(enrollments.cancelledAt)))
        .returning({ id: enrollments.id });
      if (cancelled.length === 0) return true;
      await audit.record(tx, {
        actor,
        action: 'student.enrollment_cancelled',
        entity: 'student',
        entityId: studentId,
        diff: diffOf<Tracked>(trackedOf(row), NOTHING, TRACKED, TRACKED),
      });
      return true;
    });
  }
}
