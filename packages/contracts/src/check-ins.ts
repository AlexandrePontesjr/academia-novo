import { z } from 'zod';
import { isRealDay } from './person.ts';
import { enrollmentStatus, planPeriodSchema } from './plans.ts';
import { studentStatusSchema, type StudentStatus } from './students.ts';

/** Se o aluno pode entrar hoje (check-in, door 2): calculado, nunca guardado. */
export const CHECK_IN_ACCESSES = ['allowed', 'blocked'] as const;
export const checkInAccessSchema = z.enum(CHECK_IN_ACCESSES);
export type CheckInAccessValue = z.infer<typeof checkInAccessSchema>;

/** Os motivos de bloqueio, na ordem em que saem: o do aluno antes do da matrícula. */
export const CHECK_IN_BLOCK_REASONS = ['student_inactive', 'student_suspended', 'no_active_enrollment'] as const;
export const checkInBlockReasonSchema = z.enum(CHECK_IN_BLOCK_REASONS);
export type CheckInBlockReason = z.infer<typeof checkInBlockReasonSchema>;

/**
 * A liberação (door 2), a única definição: o `GET` de situação e o `POST` de presença a chamam com o
 * mesmo `today`, o dia em `America/Sao_Paulo` (`aaaa-mm-dd`). O aluno `inactive` ou `suspended` dá o
 * motivo dele; nenhum período `active` em `today`, pela `enrollmentStatus`, dá `no_active_enrollment`.
 * `access` é `allowed` se e somente se não há motivo. Pagamento não entra nesta versão.
 */
export function checkInAccess(
  student: { status: StudentStatus },
  periods: ReadonlyArray<{ startsAt: string; endsAt: string; cancelledAt: string | Date | null }>,
  today: string,
): { access: CheckInAccessValue; blockReasons: CheckInBlockReason[] } {
  const blockReasons: CheckInBlockReason[] = [];
  if (student.status === 'inactive') blockReasons.push('student_inactive');
  if (student.status === 'suspended') blockReasons.push('student_suspended');
  if (!periods.some((period) => enrollmentStatus(period, today) === 'active')) blockReasons.push('no_active_enrollment');
  return { access: blockReasons.length === 0 ? 'allowed' : 'blocked', blockReasons };
}

const personRefSchema = z.strictObject({ id: z.uuid(), name: z.string() });

/** A situação de `GET /api/students/:id/check-in-status`: o cartão do balcão. */
export const checkInStatusSchema = z.strictObject({
  today: z.string(),
  student: z.strictObject({ id: z.uuid(), name: z.string(), status: studentStatusSchema }),
  /** A variante `large` da foto corrente, ou `null`. */
  photoUrl: z.string().nullable(),
  access: checkInAccessSchema,
  blockReasons: z.array(checkInBlockReasonSchema),
  /** O período `active` hoje, com o nome de agora do plano, ou `null`. */
  enrollment: z
    .strictObject({
      id: z.uuid(),
      plan: z.strictObject({ id: z.uuid(), name: z.string(), period: planPeriodSchema }),
      startsAt: z.string(),
      endsAt: z.string(),
    })
    .nullable(),
  /** O instante da presença de hoje, ou `null`. */
  checkedInAt: z.iso.datetime().nullable(),
});
export type CheckInStatus = z.infer<typeof checkInStatusSchema>;

/** A presença que o `POST /api/students/:id/check-ins` devolve. */
export const registeredCheckInSchema = z.strictObject({
  id: z.uuid(),
  day: z.string(),
  checkedInAt: z.iso.datetime(),
});
export type RegisteredCheckIn = z.infer<typeof registeredCheckInSchema>;

/** Uma presença no histórico do aluno; `checkedInBy.name` é o nome de agora. */
export const studentCheckInSchema = z.strictObject({
  id: z.uuid(),
  day: z.string(),
  checkedInAt: z.iso.datetime(),
  checkedInBy: personRefSchema,
});
export type StudentCheckIn = z.infer<typeof studentCheckInSchema>;

export const studentCheckInsResponseSchema = z.strictObject({
  items: z.array(studentCheckInSchema),
  nextCursor: z.uuid().nullable(),
});
export type StudentCheckInsResponse = z.infer<typeof studentCheckInsResponseSchema>;

/** Uma presença no relatório do período, com o aluno e o autor só por `id` e `name`. */
export const reportCheckInSchema = z.strictObject({
  id: z.uuid(),
  day: z.string(),
  checkedInAt: z.iso.datetime(),
  student: personRefSchema,
  checkedInBy: personRefSchema,
});
export type ReportCheckIn = z.infer<typeof reportCheckInSchema>;

export const checkInsReportSchema = z.strictObject({
  from: z.string(),
  to: z.string(),
  /** As presenças do período inteiro, igual em toda página. */
  total: z.number().int().min(0),
  items: z.array(reportCheckInSchema),
  nextCursor: z.uuid().nullable(),
});
export type CheckInsReport = z.infer<typeof checkInsReportSchema>;

/** O `nextCursor` da página anterior: o `id` da última presença entregue. */
const cursorSchema = z.uuid('Cursor inválido.');

/** Query de `GET /api/students/:id/check-ins` (AD-029). */
export const studentCheckInsQuerySchema = z.object({ cursor: cursorSchema.optional() });
export type StudentCheckInsQuery = z.infer<typeof studentCheckInsQuerySchema>;

/** Um dia que existe, em `aaaa-mm-dd`; uma só mensagem para formato e calendário. */
const daySchema = (message: string) =>
  z.string(message).refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && isRealDay(value), message);

/** Até quantos dias, as duas pontas contadas, o relatório cobre. */
export const CHECK_INS_REPORT_MAX_DAYS = 366;

/**
 * Query de `GET /api/check-ins` (AD-029): sem `to`, vale hoje; sem `from`, vale `to`. A ordem das
 * pontas e o tamanho do período dependem desses padrões e são conferidos pela API.
 */
export const checkInsReportQuerySchema = z.object({
  /** Primeiro dia, incluído. */
  from: daySchema('Informe uma data inicial válida.').optional(),
  /** Último dia, incluído. */
  to: daySchema('Informe uma data final válida.').optional(),
  cursor: cursorSchema.optional(),
});
export type CheckInsReportQuery = z.infer<typeof checkInsReportQuerySchema>;
