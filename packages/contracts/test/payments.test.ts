import { expect, test } from 'vitest';
import { paymentBalance, type PaymentStatus } from '../src/index.ts';

test('balance_and_status_sixteen_rows_around_due_date_voided_cancelled_and_sao_paulo_midnight', () => {
  type Period = { priceCents: number; startsAt: string; cancelledAt: string | null };
  const live: Period = { priceCents: 9990, startsAt: '2026-10-07', cancelledAt: null };
  const cancelled: Period = { ...live, cancelledAt: '2026-10-10T12:00:00.000Z' };
  const free = { ...live, priceCents: 0 };
  const paid = (amountCents: number) => ({ amountCents, voidedAt: null });
  const voided = (amountCents: number) => ({ amountCents, voidedAt: '2026-10-09T12:00:00.000Z' });

  // o resultado de cada linha está escrito à mão, não calculado; o `dueDate` é sempre o início
  const rows: Array<
    [
      label: string,
      period: Period,
      payments: Array<{ amountCents: number; voidedAt: string | null }>,
      on: string | Date,
      paidCents: number,
      balanceCents: number,
      status: PaymentStatus,
    ]
  > = [
    ['sem pagamento, véspera do vencimento', live, [], '2026-10-06', 0, 9990, 'pending'],
    ['sem pagamento, dia do vencimento', live, [], '2026-10-07', 0, 9990, 'pending'],
    ['sem pagamento, dia seguinte', live, [], '2026-10-08', 0, 9990, 'overdue'],
    ['5000 pagos, dia do vencimento', live, [paid(5000)], '2026-10-07', 5000, 4990, 'pending'],
    ['5000 pagos, dia seguinte', live, [paid(5000)], '2026-10-08', 5000, 4990, 'overdue'],
    ['falta um centavo, dia seguinte', live, [paid(9989)], '2026-10-08', 9989, 1, 'overdue'],
    ['pago por inteiro, véspera', live, [paid(9990)], '2026-10-06', 9990, 0, 'paid'],
    ['pago por inteiro, dia seguinte: pago ganha de atrasado', live, [paid(9990)], '2026-10-08', 9990, 0, 'paid'],
    ['5000 e 4990, pago por partes', live, [paid(5000), paid(4990)], '2026-10-08', 9990, 0, 'paid'],
    ['5000 anulado e 2000', live, [voided(5000), paid(2000)], '2026-10-08', 2000, 7990, 'overdue'],
    ['9990 anulado', live, [voided(9990)], '2026-10-08', 0, 9990, 'overdue'],
    ['valor zero, sem pagamento', free, [], '2026-10-08', 0, 0, 'paid'],
    ['cancelado, sem pagamento', cancelled, [], '2026-10-08', 0, 9990, 'cancelled'],
    ['cancelado e pago por inteiro: cancelado ganha de pago', cancelled, [paid(9990)], '2026-10-06', 9990, 0, 'cancelled'],
    // 02:59:59 UTC ainda é o dia 7 em São Paulo; 03:00:00 UTC é a virada
    ['instante: ainda o dia do vencimento', live, [], new Date('2026-10-08T02:59:59Z'), 0, 9990, 'pending'],
    ['instante: virou o dia seguinte', live, [], new Date('2026-10-08T03:00:00Z'), 0, 9990, 'overdue'],
  ];
  expect(rows).toHaveLength(16);
  for (const [label, period, payments, on, paidCents, balanceCents, status] of rows) {
    expect(paymentBalance(period, payments, on), label).toEqual({ dueDate: '2026-10-07', paidCents, balanceCents, status });
  }
});
