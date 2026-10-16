import {
  addDays,
  CHECK_INS_REPORT_MAX_DAYS,
  checkInAccess,
  type CheckInsReport,
  type CheckInStatus,
  enrollmentStatus,
  type RegisteredCheckIn,
  saoPauloToday,
  type StudentCheckIn,
} from '@academia/contracts';
import { and, type Database, desc, eq, gte, isNull, lte, schema, sql } from '@academia/database';
import { isUniqueViolation } from '../db-errors.ts';
import type { PhotosService } from '../photos/photos.service.ts';

const { checkIns, enrollments, plans, students, users } = schema;

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Fixo: a tela é a única consumidora. */
const PAGE_SIZE = 50;

export type RegisterOutcome =
  | { outcome: 'ok'; checkIn: RegisteredCheckIn }
  | { outcome: 'not_found' }
  | { outcome: 'check_in_blocked' }
  | { outcome: 'already_checked_in' };

/** Um item de `errors` do `422`, quando o período ou o cursor do relatório não vale. */
export interface ReportProblem {
  path: 'from' | 'to' | 'cursor';
  message: string;
}

/**
 * As presenças (check-in): a situação do balcão, o registro, o histórico do aluno e o relatório por
 * período. A liberação é a conta única de `packages/contracts` (door 2), com o `today` lido uma vez
 * por requisição. Nada aqui grava em `audit_logs` (door 3).
 */
export class CheckInsService {
  constructor(
    private readonly db: Database['db'],
    private readonly photos: PhotosService,
  ) {}

  /** A situação do aluno hoje, ou `undefined` se ele não existe. Só lê. */
  async status(studentId: string): Promise<CheckInStatus | undefined> {
    if (!UUID.test(studentId)) return undefined;
    const today = saoPauloToday();
    const [student] = await this.db
      .select({ id: students.id, name: students.name, status: students.status })
      .from(students)
      .where(eq(students.id, studentId));
    if (!student) return undefined;

    const periods = await this.periodsOf(this.db, studentId);
    const active = periods.find(({ period }) => enrollmentStatus(period, today) === 'active');
    const [presence] = await this.db
      .select({ checkedInAt: checkIns.checkedInAt })
      .from(checkIns)
      .where(and(eq(checkIns.studentId, studentId), eq(checkIns.day, today)));
    const photoUrl = (await this.photos.photoUrls([studentId], 'large')).get(studentId) ?? null;
    return {
      today,
      student,
      photoUrl,
      ...checkInAccess(
        student,
        periods.map(({ period }) => period),
        today,
      ),
      enrollment: active
        ? { id: active.period.id, plan: active.plan, startsAt: active.period.startsAt, endsAt: active.period.endsAt }
        : null,
      checkedInAt: presence ? presence.checkedInAt.toISOString() : null,
    };
  }

  /**
   * Registra a presença de hoje com a linha do aluno travada em `FOR UPDATE`, a trava que inativar e
   * matricular já usam: a decisão refeita aqui vale até o commit. O bloqueio vem antes de "já
   * registrado" (decisão 1 da Intent). Uma presença por dia é do índice `check_ins_one_per_day_idx`,
   * cuja recusa vira `already_checked_in`. `day` é o `today` da API; `checked_in_at`, o do banco.
   */
  async register(studentId: string, authorId: string): Promise<RegisterOutcome> {
    if (!UUID.test(studentId)) return { outcome: 'not_found' };
    try {
      return await this.db.transaction(async (tx): Promise<RegisterOutcome> => {
        const [student] = await tx
          .select({ status: students.status })
          .from(students)
          .where(eq(students.id, studentId))
          .for('update');
        if (!student) return { outcome: 'not_found' };

        const today = saoPauloToday();
        const periods = await this.periodsOf(tx, studentId);
        const { access } = checkInAccess(
          student,
          periods.map(({ period }) => period),
          today,
        );
        if (access === 'blocked') return { outcome: 'check_in_blocked' };

        const [row] = await tx.insert(checkIns).values({ studentId, day: today, checkedInBy: authorId }).returning();
        return { outcome: 'ok', checkIn: { id: row!.id, day: row!.day, checkedInAt: row!.checkedInAt.toISOString() } };
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'already_checked_in' };
      throw error;
    }
  }

  /**
   * Uma página do histórico do aluno, de `checked_in_at` mais recente para o mais antigo e, no
   * empate, de `id` maior primeiro. O cursor é o `id` da última presença da página anterior, que tem
   * de ser deste aluno. `undefined` se o aluno não existe; `null` se o cursor não é um que esta rota
   * emitiria.
   */
  async history(studentId: string, cursor?: string): Promise<{ items: StudentCheckIn[]; nextCursor: string | null } | null | undefined> {
    if (!UUID.test(studentId)) return undefined;
    const [student] = await this.db.select({ id: students.id }).from(students).where(eq(students.id, studentId));
    if (!student) return undefined;
    if (cursor && !(await this.exists(cursor, studentId))) return null;

    const rows = await this.db
      .select({
        id: checkIns.id,
        day: checkIns.day,
        checkedInAt: checkIns.checkedInAt,
        // o nome atual de quem registrou: a presença não guarda nome
        checkedInBy: { id: users.id, name: users.name },
      })
      .from(checkIns)
      .innerJoin(users, eq(users.id, checkIns.checkedInBy))
      .where(and(eq(checkIns.studentId, studentId), cursor ? after(cursor) : undefined))
      .orderBy(desc(checkIns.checkedInAt), desc(checkIns.id))
      .limit(PAGE_SIZE + 1);
    return pageOf(rows, (row) => ({ ...row, checkedInAt: row.checkedInAt.toISOString() }));
  }

  /**
   * Uma página do relatório de `from` a `to`, as duas pontas incluídas, na ordem do histórico, e o
   * total do período inteiro. Sem `to`, vale hoje em `America/Sao_Paulo`; sem `from`, vale `to`.
   * Devolve o problema do período ou do cursor, se houver.
   */
  async report(query: { from?: string; to?: string; cursor?: string }): Promise<CheckInsReport | ReportProblem> {
    const to = query.to ?? saoPauloToday();
    const from = query.from ?? to;
    if (from > to) return { path: 'to', message: 'A data final deve ser igual ou posterior à inicial.' };
    if (addDays(from, CHECK_INS_REPORT_MAX_DAYS - 1) < to) {
      return { path: 'from', message: `O período deve ter no máximo ${CHECK_INS_REPORT_MAX_DAYS} dias.` };
    }
    if (query.cursor && !(await this.exists(query.cursor))) return { path: 'cursor', message: 'Cursor inválido.' };

    const inPeriod = and(gte(checkIns.day, from), lte(checkIns.day, to));
    const [{ total }] = (await this.db.select({ total: sql<number>`count(*)::int` }).from(checkIns).where(inPeriod)) as [
      { total: number },
    ];
    const rows = await this.db
      .select({
        id: checkIns.id,
        day: checkIns.day,
        checkedInAt: checkIns.checkedInAt,
        student: { id: students.id, name: students.name },
        checkedInBy: { id: users.id, name: users.name },
      })
      .from(checkIns)
      .innerJoin(students, eq(students.id, checkIns.studentId))
      .innerJoin(users, eq(users.id, checkIns.checkedInBy))
      .where(and(inPeriod, query.cursor ? after(query.cursor) : undefined))
      .orderBy(desc(checkIns.checkedInAt), desc(checkIns.id))
      .limit(PAGE_SIZE + 1);
    return { from, to, total, ...pageOf(rows, (row) => ({ ...row, checkedInAt: row.checkedInAt.toISOString() })) };
  }

  /** As presenças de `day` igual a `today`: o card do painel (door 4). */
  async countOn(today: string): Promise<number> {
    const [{ count }] = (await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(checkIns)
      .where(eq(checkIns.day, today))) as [{ count: number }];
    return count;
  }

  /** Os períodos não cancelados do aluno, com o plano de agora. */
  private periodsOf(db: Pick<Database['db'], 'select'>, studentId: string) {
    return db
      .select({ period: enrollments, plan: { id: plans.id, name: plans.name, period: plans.period } })
      .from(enrollments)
      .innerJoin(plans, eq(plans.id, enrollments.planId))
      .where(and(eq(enrollments.studentId, studentId), isNull(enrollments.cancelledAt)));
  }

  /** Se o cursor é o `id` de uma presença (deste aluno, quando dado). */
  private async exists(id: string, studentId?: string) {
    const [row] = await this.db
      .select({ id: checkIns.id })
      .from(checkIns)
      .where(and(eq(checkIns.id, id), studentId ? eq(checkIns.studentId, studentId) : undefined));
    return row !== undefined;
  }
}

/** As presenças logo abaixo do cursor na ordem (`checked_in_at`, `id`): linha nova não desloca a página. */
const after = (cursor: string) =>
  sql`(${checkIns.checkedInAt}, ${checkIns.id}) < (select c.checked_in_at, c.id from check_ins c where c.id = ${cursor})`;

function pageOf<Row extends { id: string }, Item>(rows: Row[], toItem: (row: Row) => Item) {
  const page = rows.slice(0, PAGE_SIZE);
  return { items: page.map(toItem), nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1]!.id : null };
}
