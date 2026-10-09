import { z } from 'zod';
import { isRealDay, saoPauloToday, today } from './person.ts';
import { PRICE_CENTS_MAX, planPeriodSchema } from './plans.ts';

/** As cinco formas de pagamento (pagamentos, door 1); forma nova é valor novo no `CHECK`, por migração. */
export const PAYMENT_METHODS = ['cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS, 'Escolha uma forma de pagamento válida.');
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** A situação de pagamento de um período (door 2): calculada na leitura, nunca guardada. */
export const PAYMENT_STATUSES = ['paid', 'pending', 'overdue', 'cancelled'] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/** O que a lista geral filtra: só o que ainda falta pagar. */
export const OPEN_PAYMENT_STATUSES = ['pending', 'overdue'] as const;
export const openPaymentStatusSchema = z.enum(OPEN_PAYMENT_STATUSES, 'Escolha Pendente ou Atrasado.');
export type OpenPaymentStatus = z.infer<typeof openPaymentStatusSchema>;

/** Há quantos dias antes do início do período um pagamento ainda pode ser datado. */
export const PAID_AT_MAX_DAYS_BEFORE_START = 365;

/** O valor recebido, em centavos inteiros (AD-059): de R$ 0,01 a R$ 99.999,99. */
export const paymentAmountCentsSchema = z
  .number('Informe o valor em centavos.')
  .int('Informe o valor em centavos inteiros.')
  .min(1, 'O valor deve ser de pelo menos R$ 0,01.')
  .max(PRICE_CENTS_MAX, 'O valor deve ser de no máximo R$ 99.999,99.');

/**
 * O dia em que o dinheiro entrou: existe e não é posterior a hoje em `America/Sao_Paulo`. O limite
 * inferior depende do período e é conferido pela rota.
 */
export const paidAtSchema = z
  .string('Informe a data do pagamento.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato aaaa-mm-dd.')
  .refine(isRealDay, 'Informe uma data que exista.')
  .refine((value) => value <= today(), 'A data do pagamento não pode ser posterior a hoje.');

/** Corpo de `POST /api/students/:id/payments`: os quatro campos da RF-21. */
export const createPaymentRequestSchema = z.object({
  enrollmentId: z.uuid('Escolha um período válido.'),
  amountCents: paymentAmountCentsSchema,
  paidAt: paidAtSchema,
  method: paymentMethodSchema,
});
export type CreatePaymentRequest = z.infer<typeof createPaymentRequestSchema>;

/** Um pagamento dentro de `payments[]` de um período; `voidedAt` nulo é o pagamento que vale. */
export const paymentSchema = z.strictObject({
  id: z.uuid(),
  amountCents: z.number().int(),
  paidAt: z.string(),
  method: paymentMethodSchema,
  createdAt: z.iso.datetime(),
  voidedAt: z.iso.datetime().nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

/** O pagamento que o `POST` devolve: o de `payments[]` mais o período a que pertence. */
export const registeredPaymentSchema = paymentSchema.extend({ enrollmentId: z.uuid() });
export type RegisteredPayment = z.infer<typeof registeredPaymentSchema>;

const planOfPeriodSchema = z.strictObject({ id: z.uuid(), name: z.string(), period: planPeriodSchema });

const periodFields = {
  enrollmentId: z.uuid(),
  plan: planOfPeriodSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  dueDate: z.string(),
  priceCents: z.number().int(),
  paidCents: z.number().int(),
  balanceCents: z.number().int(),
};

/** Um período do aluno na ficha: o que vale, o que foi pago, o que falta e os pagamentos dele. */
export const studentPaymentSchema = z.strictObject({
  ...periodFields,
  status: paymentStatusSchema,
  payments: z.array(paymentSchema),
});
export type StudentPayment = z.infer<typeof studentPaymentSchema>;

export const studentPaymentsResponseSchema = z.strictObject({ items: z.array(studentPaymentSchema) });
export type StudentPaymentsResponse = z.infer<typeof studentPaymentsResponseSchema>;

/** Um período com saldo na lista geral, com o aluno só por `id` e `name`. */
export const openPaymentSchema = z.strictObject({
  ...periodFields,
  student: z.strictObject({ id: z.uuid(), name: z.string() }),
  status: openPaymentStatusSchema,
});
export type OpenPayment = z.infer<typeof openPaymentSchema>;

export const openPaymentsResponseSchema = z.strictObject({ items: z.array(openPaymentSchema) });
export type OpenPaymentsResponse = z.infer<typeof openPaymentsResponseSchema>;

/** Query de `GET /api/payments` (AD-029): `status` opcional. */
export const openPaymentsQuerySchema = z.object({ status: openPaymentStatusSchema.optional() });
export type OpenPaymentsQuery = z.infer<typeof openPaymentsQuerySchema>;

/**
 * O saldo e a situação de pagamento de um período num dia (door 2), a única definição: a ficha e a
 * lista geral a chamam, e nenhuma refaz a conta em SQL. `dueDate` é o `startsAt`; `paidCents` soma os
 * pagamentos não anulados; `status` é `cancelled` antes de `paid`, e `paid` antes de `overdue`. `on` é
 * o dia em `America/Sao_Paulo` (`aaaa-mm-dd`) ou um instante, de que se tira esse dia; sem ele, vale
 * agora.
 */
export function paymentBalance(
  period: { priceCents: number; startsAt: string; cancelledAt: string | Date | null },
  payments: ReadonlyArray<{ amountCents: number; voidedAt: string | Date | null }>,
  on: string | Date = new Date(),
): { dueDate: string; paidCents: number; balanceCents: number; status: PaymentStatus } {
  const dueDate = period.startsAt;
  const paidCents = payments.reduce((sum, payment) => (payment.voidedAt === null ? sum + payment.amountCents : sum), 0);
  const balanceCents = period.priceCents - paidCents;
  const day = typeof on === 'string' ? on : saoPauloToday(on);
  const status: PaymentStatus =
    period.cancelledAt !== null ? 'cancelled' : balanceCents === 0 ? 'paid' : day > dueDate ? 'overdue' : 'pending';
  return { dueDate, paidCents, balanceCents, status };
}
