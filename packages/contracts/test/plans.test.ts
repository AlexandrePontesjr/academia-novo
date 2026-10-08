import { expect, test } from 'vitest';
import { enrollmentEndsAt, enrollmentStatus, type EnrollmentStatus, type PlanPeriod } from '../src/index.ts';

test('ends_at_seventeen_rows_of_calendar_months_minus_one_day', () => {
  // o vencimento de cada linha está escrito à mão, não calculado
  const rows: Array<[startsAt: string, period: PlanPeriod, endsAt: string]> = [
    ['2026-10-07', 'monthly', '2026-11-06'],
    ['2026-10-07', 'quarterly', '2027-01-06'],
    ['2026-10-07', 'semiannual', '2027-04-06'],
    ['2026-10-07', 'annual', '2027-10-06'],
    ['2026-01-01', 'monthly', '2026-01-31'],
    ['2026-01-28', 'monthly', '2026-02-27'],
    ['2026-01-29', 'monthly', '2026-02-27'],
    ['2026-01-30', 'monthly', '2026-02-27'],
    ['2026-01-31', 'monthly', '2026-02-27'],
    ['2026-03-31', 'monthly', '2026-04-29'],
    ['2026-12-31', 'monthly', '2027-01-30'],
    ['2028-01-31', 'monthly', '2028-02-28'],
    ['2028-02-29', 'monthly', '2028-03-28'],
    ['2026-11-30', 'quarterly', '2027-02-27'],
    ['2026-08-31', 'semiannual', '2027-02-27'],
    ['2027-02-28', 'annual', '2028-02-27'],
    ['2028-02-29', 'annual', '2029-02-27'],
  ];
  expect(rows).toHaveLength(17);
  for (const [startsAt, period, endsAt] of rows) {
    expect(enrollmentEndsAt(startsAt, period), `${period} de ${startsAt}`).toBe(endsAt);
  }
});

test('enrollment_status_thirteen_rows_around_both_edges_and_sao_paulo_midnight', () => {
  const period = { startsAt: '2026-10-07', endsAt: '2026-11-06' };
  const live = { ...period, cancelledAt: null };
  const cancelled = { ...period, cancelledAt: '2026-10-10T12:00:00.000Z' };
  const oneDay = { startsAt: '2026-10-07', endsAt: '2026-10-07', cancelledAt: null };

  const rows: Array<[label: string, enrollment: typeof live | typeof cancelled, on: string | Date, expected: EnrollmentStatus]> = [
    ['véspera do início', live, '2026-10-06', 'scheduled'],
    ['dia do início', live, '2026-10-07', 'active'],
    ['dia do vencimento', live, '2026-11-06', 'active'],
    ['dia seguinte ao vencimento', live, '2026-11-07', 'expired'],
    ['cancelada, véspera do início', cancelled, '2026-10-06', 'cancelled'],
    ['cancelada, dia do início', cancelled, '2026-10-07', 'cancelled'],
    ['cancelada, dia do vencimento', cancelled, '2026-11-06', 'cancelled'],
    ['cancelada, dia seguinte ao vencimento', cancelled, '2026-11-07', 'cancelled'],
    ['período de um dia só, nesse dia', oneDay, '2026-10-07', 'active'],
    // 02:59:59 UTC ainda é o dia anterior em São Paulo; 03:00:00 UTC é a virada
    ['instante: ainda dia 6', live, new Date('2026-10-07T02:59:59Z'), 'scheduled'],
    ['instante: virou dia 7', live, new Date('2026-10-07T03:00:00Z'), 'active'],
    ['instante: ainda dia 6 de novembro', live, new Date('2026-11-07T02:59:59Z'), 'active'],
    ['instante: virou dia 7 de novembro', live, new Date('2026-11-07T03:00:00Z'), 'expired'],
  ];
  expect(rows).toHaveLength(13);
  for (const [label, enrollment, on, expected] of rows) {
    expect(enrollmentStatus(enrollment, on), label).toBe(expected);
  }
});
