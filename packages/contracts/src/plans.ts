import { z } from 'zod';
import { isRealDay, noNul, saoPauloToday, today } from './person.ts';

/** As quatro periodicidades (planos-matriculas, door 1), fixadas no cadastro do plano. */
export const PLAN_PERIODS = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
export const planPeriodSchema = z.enum(PLAN_PERIODS, 'Escolha uma periodicidade válida.');
export type PlanPeriod = z.infer<typeof planPeriodSchema>;

/** Quantos meses do calendário cada periodicidade cobre. */
export const PERIOD_MONTHS: Record<PlanPeriod, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

export const PLAN_STATUSES = ['active', 'inactive'] as const;
export const planStatusSchema = z.enum(PLAN_STATUSES, 'Escolha uma situação válida.');
export type PlanStatus = z.infer<typeof planStatusSchema>;

/** R$ 99.999,99: o maior valor de um plano. */
export const PRICE_CENTS_MAX = 9_999_999;

// um substituto UTF-16 solto não é texto: o `jsonb` da trilha, que guarda o nome do plano (door 6), o recusa
const noLoneSurrogate = (value: string) => !/\p{Cs}/u.test(value);

const planNameSchema = z
  .string('Informe o nome.')
  .trim()
  .min(1, 'Informe o nome.')
  .max(80, 'O nome deve ter no máximo 80 caracteres.')
  .refine(noNul, 'O nome contém um caractere inválido.')
  .refine(noLoneSurrogate, 'O nome contém um caractere inválido.');

/** Dinheiro é sempre inteiro de centavos (door 2): nunca decimal nem texto. */
export const priceCentsSchema = z
  .number('Informe o valor em centavos.')
  .int('Informe o valor em centavos inteiros.')
  .min(0, 'O valor não pode ser negativo.')
  .max(PRICE_CENTS_MAX, 'O valor deve ser de no máximo R$ 99.999,99.');

/** Texto livre que as pessoas leem; o sistema não o interpreta (door 1). */
const rulesSchema = z
  .string('Informe regras de acesso válidas.')
  .trim()
  .min(1, 'Informe regras de acesso válidas.')
  .max(500, 'As regras de acesso devem ter no máximo 500 caracteres.')
  .refine(noNul, 'As regras de acesso contêm um caractere inválido.');

/** Corpo de `POST /api/plans`: os campos da RF-19, com `rules` opcional. */
export const createPlanRequestSchema = z.object({
  name: planNameSchema,
  period: planPeriodSchema,
  priceCents: priceCentsSchema,
  rules: rulesSchema.optional(),
});
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

/**
 * Corpo de `PATCH /api/plans/:id`: todos opcionais; `null` limpa `rules`. `status` só aceita `active`
 * (reativar): inativar é o `DELETE`. `period` não é aceito com valor nenhum: mudar de periodicidade é
 * criar outro plano.
 */
export const updatePlanRequestSchema = z.object({
  name: planNameSchema.optional(),
  priceCents: priceCentsSchema.optional(),
  rules: rulesSchema.nullable().optional(),
  status: z.enum(['active'], 'Escolha Ativo; para inativar, use Inativar.').optional(),
  period: z.never('A periodicidade não pode ser alterada. Crie outro plano.').optional(),
});
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>;

/** Um plano como a API o devolve, igual para todos os perfis que o leem. */
export const planSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  period: planPeriodSchema,
  priceCents: z.number().int(),
  rules: z.string().nullable(),
  status: planStatusSchema,
});
export type Plan = z.infer<typeof planSchema>;

export const plansResponseSchema = z.strictObject({ items: z.array(planSchema) });
export type PlansResponse = z.infer<typeof plansResponseSchema>;

/** A situação da matrícula (door 4): calculada na leitura, nunca guardada. */
export const ENROLLMENT_STATUSES = ['scheduled', 'active', 'expired', 'cancelled'] as const;
export const enrollmentStatusSchema = z.enum(ENROLLMENT_STATUSES);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

/** Até quantos dias à frente de hoje uma matrícula pode começar. */
export const STARTS_AT_MAX_DAYS_AHEAD = 365;

const DAY_MS = 86_400_000;
const dayOf = (utc: number) => new Date(utc).toISOString().slice(0, 10);

/** `day` mais `days` dias, em `aaaa-mm-dd`. */
export const addDays = (day: string, days: number) => dayOf(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS);

/**
 * O vencimento (door 4): `startsAt` mais os meses da periodicidade, menos um dia - o último dia
 * coberto. A soma é de meses do calendário e, quando o mês de destino não tem o dia, vale o último
 * dia dele: a mesma conta de `date + interval` do Postgres.
 */
export function enrollmentEndsAt(startsAt: string, period: PlanPeriod): string {
  const [year, month, day] = startsAt.split('-').map(Number) as [number, number, number];
  const target = month - 1 + PERIOD_MONTHS[period];
  // o dia 0 do mês seguinte é o último dia do mês de destino
  const lastDay = new Date(Date.UTC(year, target + 1, 0)).getUTCDate();
  return dayOf(Date.UTC(year, target, Math.min(day, lastDay)) - DAY_MS);
}

/**
 * A situação da matrícula num dia (door 4). `on` é o dia em `America/Sao_Paulo` (`aaaa-mm-dd`) ou um
 * instante, de que se tira esse dia; sem ele, vale agora.
 */
export function enrollmentStatus(
  enrollment: { startsAt: string; endsAt: string; cancelledAt: string | Date | null },
  on: string | Date = new Date(),
): EnrollmentStatus {
  if (enrollment.cancelledAt !== null) return 'cancelled';
  const day = typeof on === 'string' ? on : saoPauloToday(on);
  if (day < enrollment.startsAt) return 'scheduled';
  if (day > enrollment.endsAt) return 'expired';
  return 'active';
}

/** O dia do início: existe e não passa de hoje mais 365 dias em `America/Sao_Paulo`. */
const startsAtSchema = z
  .string('Informe o início.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o início no formato aaaa-mm-dd.')
  .refine(isRealDay, 'Informe uma data que exista.')
  .refine((value) => value <= addDays(today(), STARTS_AT_MAX_DAYS_AHEAD), 'Escolha um início dentro de 365 dias.');

/** Corpo de `POST /api/students/:id/enrollments`: o servidor nunca escolhe o início (door 5). */
export const createEnrollmentRequestSchema = z.object({
  planId: z.uuid('Escolha um plano válido.'),
  startsAt: startsAtSchema,
});
export type CreateEnrollmentRequest = z.infer<typeof createEnrollmentRequestSchema>;

/** Uma matrícula - um período - como a API a devolve; `plan.name` é o nome de agora. */
export const enrollmentSchema = z.strictObject({
  id: z.uuid(),
  plan: z.strictObject({ id: z.uuid(), name: z.string(), period: planPeriodSchema }),
  startsAt: z.string(),
  endsAt: z.string(),
  priceCents: z.number().int(),
  status: enrollmentStatusSchema,
  createdAt: z.iso.datetime(),
  cancelledAt: z.iso.datetime().nullable(),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;

export const enrollmentsResponseSchema = z.strictObject({ items: z.array(enrollmentSchema) });
export type EnrollmentsResponse = z.infer<typeof enrollmentsResponseSchema>;
