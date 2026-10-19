import {
  addDays,
  CHECK_INS_WEEK_DAYS,
  type DashboardCheckIns,
  type DashboardEnrollments,
  type DashboardPayments,
  type DashboardResponse,
  type DashboardStudents,
  enrollmentStatus,
  EXPIRING_SOON_DAYS,
  isExpiringSoon,
  paymentStatus,
  type Role,
  saoPauloToday,
} from '@academia/contracts';
import { and, type Database, eq, gte, isNull, lte, schema, sql } from '@academia/database';

const { checkIns, enrollments, payments, plans, students } = schema;

/** Quem lê o card de matrículas: quem já lê as matrículas da ficha (door 1). */
export const readsEnrollments = (role: Role) => role !== 'instructor';

/** Quem lê o card de pagamentos: quem já lê `GET /api/payments`. */
export const readsPayments = (role: Role) => role === 'admin' || role === 'hr_finance';

/** Quem lê o card de check-ins: quem já lê as rotas de presença (check-in, door 4). */
export const readsCheckIns = (role: Role) => role === 'admin' || role === 'reception';

/** O painel: a leitura agregada do dia, cortada pelo perfil. Só lê, e não grava na trilha (door 1). */
export class DashboardService {
  constructor(private readonly db: Database['db']) {}

  /**
   * `today` é fixado uma vez e vale para todos os cards. A chave do card que o perfil não lê sai do
   * objeto, nunca vira `null` (AD-033), e o que o perfil não lê nem é consultado.
   */
  async read(role: Role): Promise<DashboardResponse> {
    const today = saoPauloToday();
    const response: DashboardResponse = { today, students: await this.students() };
    if (!readsEnrollments(role)) return response;

    const periods = await this.periods();
    response.enrollments = enrollmentsOf(periods, today);
    if (readsPayments(role)) response.payments = paymentsOf(periods, await this.alive(), today);
    if (readsCheckIns(role)) response.checkIns = await this.checkInsUntil(today);
    return response;
  }

  /**
   * As presenças por `day`, de `today - 6` a `today` (dukfit-app, door 2), numa leitura só: o dia vem
   * da API, não do relógio do banco, e o `count` de hoje é o último item da série.
   */
  private async checkInsUntil(today: string): Promise<DashboardCheckIns> {
    const first = addDays(today, 1 - CHECK_INS_WEEK_DAYS);
    const rows = await this.db
      .select({ day: checkIns.day, count: sql<number>`count(*)::int` })
      .from(checkIns)
      .where(and(gte(checkIns.day, first), lte(checkIns.day, today)))
      .groupBy(checkIns.day);
    const byDay = new Map(rows.map((row) => [String(row.day), row.count]));
    const lastSevenDays = Array.from({ length: CHECK_INS_WEEK_DAYS }, (_, index) => {
      const day = addDays(first, index);
      return { day, count: byDay.get(day) ?? 0 };
    });
    return { count: lastSevenDays.at(-1)!.count, lastSevenDays };
  }

  /** Alunos por `status`, que é guardado (AD-030); a situação sem aluno fica em `0`. */
  private async students(): Promise<DashboardStudents> {
    const rows = await this.db.select({ status: students.status, total: sql<number>`count(*)::int` }).from(students).where(isNull(students.anonymizedAt)).groupBy(students.status);
    const totals: DashboardStudents = { active: 0, inactive: 0, suspended: 0 };
    for (const row of rows) totals[row.status] = row.total;
    return totals;
  }

  /**
   * Os períodos não cancelados, de aluno de qualquer situação, com o plano de agora. Nenhuma situação
   * é decidida aqui: as contas são as de `packages/contracts`, em código.
   */
  private periods() {
    return this.db
      .select({
        period: enrollments,
        plan: { id: plans.id, name: plans.name, period: plans.period },
        student: { id: students.id, name: students.name },
      })
      .from(enrollments)
      .innerJoin(plans, eq(plans.id, enrollments.planId))
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(isNull(enrollments.cancelledAt));
  }

  /**
   * As confirmações vivas, por período. Lidas à parte: um `join` com `payments` repetiria o período
   * uma vez por confirmação desfeita.
   */
  private async alive() {
    const rows = await this.db
      .select({ enrollmentId: payments.enrollmentId, voidedAt: payments.voidedAt })
      .from(payments)
      .where(isNull(payments.voidedAt));
    const byPeriod = new Map<string, Array<{ voidedAt: Date | null }>>();
    for (const row of rows) byPeriod.set(row.enrollmentId, [...(byPeriod.get(row.enrollmentId) ?? []), row]);
    return byPeriod;
  }
}

type Periods = Awaited<ReturnType<DashboardService['periods']>>;

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function enrollmentsOf(periods: Periods, today: string): DashboardEnrollments {
  let active = 0;
  let scheduled = 0;
  const items: DashboardEnrollments['expiringSoon']['items'] = [];
  const byPlan = new Map<string, DashboardEnrollments['byPlan'][number]>();
  for (const { period, plan, student } of periods) {
    const status = enrollmentStatus(period, today);
    if (status === 'scheduled') scheduled += 1;
    if (status !== 'active') continue;
    active += 1;
    const ofPlan = byPlan.get(plan.id) ?? { plan, active: 0 };
    ofPlan.active += 1;
    byPlan.set(plan.id, ofPlan);
    if (isExpiringSoon(period, today)) items.push({ enrollmentId: period.id, student, plan, endsAt: period.endsAt });
  }
  return {
    active,
    scheduled,
    expiringSoon: {
      days: EXPIRING_SOON_DAYS,
      items: items.sort((a, b) => byText(a.endsAt, b.endsAt) || byText(a.enrollmentId, b.enrollmentId)),
    },
    byPlan: [...byPlan.values()].sort((a, b) => b.active - a.active || byText(a.plan.id, b.plan.id)),
  };
}

function paymentsOf(
  periods: Periods,
  alive: Map<string, Array<{ voidedAt: Date | null }>>,
  today: string,
): DashboardPayments {
  const totals: DashboardPayments = { pending: 0, overdue: 0 };
  for (const { period } of periods) {
    const { status } = paymentStatus(period, alive.get(period.id) ?? [], today);
    if (status === 'pending' || status === 'overdue') totals[status] += 1;
  }
  return totals;
}
