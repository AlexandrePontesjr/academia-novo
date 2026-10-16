import { z } from 'zod';
import { addDays, enrollmentStatus, planPeriodSchema } from './plans.ts';

/** A janela do vencimento próximo (dashboard, door 1): de hoje a hoje mais 7 dias, as duas pontas incluídas. */
export const EXPIRING_SOON_DAYS = 7;

/**
 * O vencimento próximo (door 1), a única definição: o período está `active` em `today` e o `endsAt`
 * dele não passa de `today` mais `EXPIRING_SOON_DAYS`. `today` é o dia em `America/Sao_Paulo`
 * (`aaaa-mm-dd`); o piso da janela é o da `enrollmentStatus`, que já deixa fora o vencido, o
 * cancelado e o agendado.
 */
export function isExpiringSoon(
  enrollment: { startsAt: string; endsAt: string; cancelledAt: string | Date | null },
  today: string,
): boolean {
  return enrollmentStatus(enrollment, today) === 'active' && enrollment.endsAt <= addDays(today, EXPIRING_SOON_DAYS);
}

const countSchema = z.number().int().min(0);

const planOfPeriodSchema = z.strictObject({ id: z.uuid(), name: z.string(), period: planPeriodSchema });

/** Um período que vence na janela, com o aluno só por `id` e `name`; `plan.name` é o nome de agora. */
export const expiringEnrollmentSchema = z.strictObject({
  enrollmentId: z.uuid(),
  student: z.strictObject({ id: z.uuid(), name: z.string() }),
  plan: planOfPeriodSchema,
  endsAt: z.string(),
});
export type ExpiringEnrollment = z.infer<typeof expiringEnrollmentSchema>;

export const dashboardStudentsSchema = z.strictObject({
  active: countSchema,
  inactive: countSchema,
  suspended: countSchema,
});
export type DashboardStudents = z.infer<typeof dashboardStudentsSchema>;

export const dashboardEnrollmentsSchema = z.strictObject({
  active: countSchema,
  scheduled: countSchema,
  expiringSoon: z.strictObject({ days: z.number().int().positive(), items: z.array(expiringEnrollmentSchema) }),
  byPlan: z.array(z.strictObject({ plan: planOfPeriodSchema, active: countSchema })),
});
export type DashboardEnrollments = z.infer<typeof dashboardEnrollmentsSchema>;

export const dashboardPaymentsSchema = z.strictObject({ pending: countSchema, overdue: countSchema });
export type DashboardPayments = z.infer<typeof dashboardPaymentsSchema>;

/** O card "Check-ins de hoje" (check-in, door 4): as presenças de `day` igual ao `today` da resposta. */
export const dashboardCheckInsSchema = z.strictObject({ count: countSchema });
export type DashboardCheckIns = z.infer<typeof dashboardCheckInsSchema>;

/**
 * A resposta de `GET /api/dashboard` (door 1): uma chave por card. `enrollments`, `payments` e `checkIns` só
 * existem para o perfil que os lê - a chave sai do objeto, nunca vira `null` (AD-033). Card novo é
 * chave nova, declarada aqui.
 */
export const dashboardResponseSchema = z.strictObject({
  today: z.string(),
  students: dashboardStudentsSchema,
  enrollments: dashboardEnrollmentsSchema.optional(),
  payments: dashboardPaymentsSchema.optional(),
  checkIns: dashboardCheckInsSchema.optional(),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
