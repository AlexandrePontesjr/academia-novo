import type { PaymentStatus, Role } from '@academia/contracts';
import { formatBirthDate } from './students.ts';

/** Quem vê o que o aluno deve e quem confirma e desfaz o pagamento: o Financeiro (PRD §2). */
export const canReadPayments = (role: Role) => role === 'admin' || role === 'hr_finance';

/** A situação de pagamento do período por extenso, como aparece nas telas. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: 'Pago',
  pending: 'Pendente',
  overdue: 'Atrasado',
  cancelled: 'Matrícula cancelada',
};

/** `dd/MM/aaaa a dd/MM/aaaa`. */
export const formatPeriod = (startsAt: string, endsAt: string) =>
  `${formatBirthDate(startsAt)} a ${formatBirthDate(endsAt)}`;
