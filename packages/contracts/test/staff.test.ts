import { afterEach, expect, test, vi } from 'vitest';
import { createStaffRequestSchema, updateStaffRequestSchema } from '../src/index.ts';

afterEach(() => vi.useRealTimers());

const body = (hiredAt: string) => ({
  name: 'Rafaela Prado Cunha',
  cpf: '52998224725',
  position: 'Fisioterapeuta Esportiva',
  phone: '11912345678',
  hiredAt,
});

const hiredAtIssue = (schema: typeof createStaffRequestSchema | typeof updateStaffRequestSchema, hiredAt: string) => {
  const result = schema.safeParse(body(hiredAt));
  return result.success ? 'aceita' : [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(',');
};

test('hired_at_ten_cases_around_today_in_sao_paulo', () => {
  // 02:59:59 UTC de 6/10 ainda é dia 5 em São Paulo; 03:00:00 UTC é a virada
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-06T02:59:59Z') });
  const cases: Array<[label: string, hiredAt: string, expected: string]> = [
    ['dia que não existe', '2026-02-30', 'hiredAt'],
    ['mês 13', '2026-13-01', 'hiredAt'],
    ['ano de dois dígitos', '26-01-01', 'hiredAt'],
    ['barras', '01/02/2020', 'hiredAt'],
    ['um dia antes de 1900', '1899-12-31', 'hiredAt'],
    ['1900-01-01', '1900-01-01', 'aceita'],
    ['ainda dia 5 em São Paulo: o dia 5', '2026-10-05', 'aceita'],
    ['ainda dia 5 em São Paulo: o dia 6 é futuro', '2026-10-06', 'hiredAt'],
  ];
  for (const schema of [createStaffRequestSchema, updateStaffRequestSchema]) {
    for (const [label, hiredAt, expected] of cases) expect(hiredAtIssue(schema, hiredAt), label).toBe(expected);
  }

  vi.setSystemTime(new Date('2026-10-06T03:00:00Z'));
  for (const schema of [createStaffRequestSchema, updateStaffRequestSchema]) {
    expect(hiredAtIssue(schema, '2026-10-06'), 'na virada o dia 6 é hoje').toBe('aceita');
    expect(hiredAtIssue(schema, '2026-10-07'), 'na virada o dia 7 é futuro').toBe('hiredAt');
  }
});
