import { expect, test } from 'vitest';
import { paymentStatus, type PaymentStatus } from '../src/index.ts';

test('payment_status_fifteen_rows_around_due_date_voided_cancelled_zero_price_and_sao_paulo_midnight', () => {
  type Period = { priceCents: number; startsAt: string; cancelledAt: string | null };
  const live: Period = { priceCents: 9990, startsAt: '2026-10-07', cancelledAt: null };
  const cancelled: Period = { ...live, cancelledAt: '2026-10-10T12:00:00.000Z' };
  const free: Period = { ...live, priceCents: 0 };
  const alive = { voidedAt: null };
  const undone = { voidedAt: '2026-10-09T12:00:00.000Z' };

  // o resultado de cada linha está escrito à mão, não calculado; o `dueDate` é sempre o início
  const rows: Array<
    [label: string, period: Period, payments: Array<{ voidedAt: string | null }>, on: string | Date, status: PaymentStatus]
  > = [
    ['cancelado sem confirmação', cancelled, [], '2026-10-08', 'cancelled'],
    ['cancelado com confirmação viva: cancelado ganha de pago', cancelled, [alive], '2026-10-06', 'cancelled'],
    ['cancelado com só uma desfeita', cancelled, [undone], '2026-10-08', 'cancelled'],
    ['viva antes do vencimento', live, [alive], '2026-10-06', 'paid'],
    ['viva depois do vencimento: pago ganha de atrasado', live, [alive], '2026-10-08', 'paid'],
    ['uma desfeita ao lado de uma viva', live, [undone, alive], '2026-10-08', 'paid'],
    ['só desfeita, depois do vencimento', live, [undone], '2026-10-08', 'overdue'],
    ['só desfeita, no próprio dia', live, [undone], '2026-10-07', 'pending'],
    ['sem confirmação, antes do vencimento', live, [], '2026-10-06', 'pending'],
    ['sem confirmação, no próprio dia', live, [], '2026-10-07', 'pending'],
    ['sem confirmação, um dia depois', live, [], '2026-10-08', 'overdue'],
    // 02:59:59 UTC ainda é o dia 7 em São Paulo; 03:00:00 UTC é a virada
    ['instante: ainda o dia do vencimento', live, [], new Date('2026-10-08T02:59:59Z'), 'pending'],
    ['instante: virou o dia seguinte', live, [], new Date('2026-10-08T03:00:00Z'), 'overdue'],
    ['valor zero, sem confirmação, um dia depois', free, [], '2026-10-08', 'overdue'],
    ['valor zero, com confirmação viva', free, [alive], '2026-10-08', 'paid'],
  ];
  expect(rows).toHaveLength(15);
  for (const [label, period, payments, on, status] of rows) {
    expect(paymentStatus(period, payments, on), label).toEqual({ dueDate: '2026-10-07', status });
  }
});
