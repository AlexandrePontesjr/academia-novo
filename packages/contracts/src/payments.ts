import { z } from 'zod';
import { saoPauloToday } from './person.ts';
import { planPeriodSchema } from './plans.ts';

/** A situação de pagamento de um período (door 2): calculada na leitura, nunca guardada. */
export const PAYMENT_STATUSES = ['paid', 'pending', 'overdue', 'cancelled'] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/** O que a lista geral filtra: só o que ainda falta pagar. */
export const OPEN_PAYMENT_STATUSES = ['pending', 'overdue'] as const;
export const openPaymentStatusSchema = z.enum(OPEN_PAYMENT_STATUSES, 'Escolha Pendente ou Atrasado.');
export type OpenPaymentStatus = z.infer<typeof openPaymentStatusSchema>;

/** Corpo de `POST /api/students/:id/payments`: confirmar o pagamento é nomear o período, nada mais. */
export const createPaymentRequestSchema = z.object({
  enrollmentId: z.uuid('Escolha um período válido.'),
});
export type CreatePaymentRequest = z.infer<typeof createPaymentRequestSchema>;

/** O pagamento que o `POST` devolve. */
export const registeredPaymentSchema = z.strictObject({
  id: z.uuid(),
  enrollmentId: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type RegisteredPayment = z.infer<typeof registeredPaymentSchema>;

/** A confirmação viva de um período, dentro de `payment` de um item da ficha. */
export const paymentSummarySchema = z.strictObject({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type PaymentSummary = z.infer<typeof paymentSummarySchema>;

const planOfPeriodSchema = z.strictObject({ id: z.uuid(), name: z.string(), period: planPeriodSchema });

const periodFields = {
  enrollmentId: z.uuid(),
  plan: planOfPeriodSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  dueDate: z.string(),
  priceCents: z.number().int(),
};

/** Um período do aluno na ficha: o que vale, se está pago e a confirmação viva, se houver. */
export const studentPaymentSchema = z.strictObject({
  ...periodFields,
  status: paymentStatusSchema,
  payment: paymentSummarySchema.nullable(),
});
export type StudentPayment = z.infer<typeof studentPaymentSchema>;

export const studentPaymentsResponseSchema = z.strictObject({ items: z.array(studentPaymentSchema) });
export type StudentPaymentsResponse = z.infer<typeof studentPaymentsResponseSchema>;

/** Um período por pagar na lista geral, com o aluno só por `id` e `name`. */
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
 * O vencimento e a situação de pagamento de um período num dia (door 2), a única definição: a ficha e
 * a lista geral a chamam, e nenhuma refaz a conta em SQL. `dueDate` é o `startsAt`; `status` é
 * `cancelled` antes de `paid` (há uma confirmação com `voidedAt` nulo), e `paid` antes de `overdue`
 * (hoje depois de `dueDate`). `on` é o dia em `America/Sao_Paulo` (`aaaa-mm-dd`) ou um instante, de que
 * se tira esse dia; sem ele, vale agora.
 */
export function paymentStatus(
  period: { startsAt: string; cancelledAt: string | Date | null },
  payments: ReadonlyArray<{ voidedAt: string | Date | null }>,
  on: string | Date = new Date(),
): { dueDate: string; status: PaymentStatus } {
  const dueDate = period.startsAt;
  const day = typeof on === 'string' ? on : saoPauloToday(on);
  const status: PaymentStatus =
    period.cancelledAt !== null
      ? 'cancelled'
      : payments.some((payment) => payment.voidedAt === null)
        ? 'paid'
        : day > dueDate
          ? 'overdue'
          : 'pending';
  return { dueDate, status };
}
