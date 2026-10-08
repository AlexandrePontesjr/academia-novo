import type { EnrollmentStatus, PlanPeriod, PlanStatus, Role } from '@academia/contracts';

/** Quem vê a tabela de preços e as matrículas: todos menos o Instrutor (PRD §2). */
export const canReadPlans = (role: Role) => role !== 'instructor';

/** Quem cadastra planos e quem matricula, renova e cancela (PRD §2). */
export const canWritePlans = (role: Role) => role === 'admin' || role === 'hr_finance';

/** A periodicidade por extenso, como aparece nas telas. */
export const PERIOD_LABELS: Record<PlanPeriod, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = { active: 'Ativo', inactive: 'Inativo' };

/** A situação da matrícula por extenso. */
export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  scheduled: 'Agendada',
  active: 'Ativa',
  expired: 'Vencida',
  cancelled: 'Cancelada',
};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** `R$ 1.234,56` a partir dos centavos (door 2). */
export const formatPrice = (cents: number) => brl.format(cents / 100);

/** O valor como se digita no campo: `99,90`, sem `R$` e sem separador de milhar. */
export const priceInputOf = (cents: number) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;

const PRICE = /^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/;

/**
 * Os centavos de um valor digitado em reais, com no máximo duas casas depois da vírgula (`99`, `99,9`,
 * `99,90`, `1.234,56`); `undefined` para o que não é isso. A conta é com inteiros, sem ponto flutuante.
 */
export function parsePrice(text: string): number | undefined {
  const match = PRICE.exec(text.trim());
  if (!match) return undefined;
  return Number(match[1]!.replaceAll('.', '')) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
