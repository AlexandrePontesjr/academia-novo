import { expect, test } from 'vitest';
import { dashboardResponseSchema, EXPIRING_SOON_DAYS, isExpiringSoon } from '../src/index.ts';

test('expiring_soon_thirteen_rows_around_both_edges_cancelled_scheduled_and_month_and_year_end', () => {
  expect(EXPIRING_SOON_DAYS).toBe(7);

  type Period = { startsAt: string; endsAt: string; cancelledAt: string | null };
  const until = (endsAt: string, startsAt = '2026-09-01'): Period => ({ startsAt, endsAt, cancelledAt: null });

  // o resultado de cada linha está escrito à mão, não calculado
  const rows: Array<[label: string, period: Period, today: string, expected: boolean]> = [
    ['vencido ontem', until('2026-10-06'), '2026-10-07', false],
    ['vence hoje', until('2026-10-07'), '2026-10-07', true],
    ['vence amanhã', until('2026-10-08'), '2026-10-07', true],
    ['vence em hoje mais 7', until('2026-10-14'), '2026-10-07', true],
    ['vence em hoje mais 8', until('2026-10-15'), '2026-10-07', false],
    ['vence em um mês', until('2026-11-06'), '2026-10-07', false],
    ['cancelado dentro da janela', { ...until('2026-10-10'), cancelledAt: '2026-10-05T12:00:00.000Z' }, '2026-10-07', false],
    ['agendado com o fim dentro da janela', until('2026-10-12', '2026-10-08'), '2026-10-07', false],
    ['período de um dia só, hoje', until('2026-10-07', '2026-10-07'), '2026-10-07', true],
    ['fim de mês: hoje mais 7', until('2026-11-04'), '2026-10-28', true],
    ['fim de mês: hoje mais 8', until('2026-11-05'), '2026-10-28', false],
    ['fim de ano: hoje mais 7', until('2027-01-04'), '2026-12-28', true],
    ['fim de ano: hoje mais 8', until('2027-01-05'), '2026-12-28', false],
  ];
  expect(rows).toHaveLength(13);
  for (const [label, period, today, expected] of rows) {
    expect(isExpiringSoon(period, today), label).toBe(expected);
  }
});

const STUDENT_ID = '0199b1a0-0000-7000-8000-000000000001';
const PLAN_ID = '0199b1a0-0000-7000-8000-000000000002';
const ENROLLMENT_ID = '0199b1a0-0000-7000-8000-000000000003';

/** A resposta de `admin` e de `hr_finance`, com um item em cada lista. */
const full = () => ({
  today: '2026-10-07',
  students: { active: 3, inactive: 2, suspended: 1 },
  enrollments: {
    active: 4,
    scheduled: 5,
    expiringSoon: {
      days: 7,
      items: [
        {
          enrollmentId: ENROLLMENT_ID,
          student: { id: STUDENT_ID, name: 'Ana Souza' },
          plan: { id: PLAN_ID, name: 'Mensal', period: 'monthly' },
          endsAt: '2026-10-10',
        },
      ],
    },
    byPlan: [{ plan: { id: PLAN_ID, name: 'Mensal', period: 'monthly' }, active: 4 }],
  },
  payments: { pending: 6, overdue: 7 },
});

type Json = Record<string, unknown>;
type Path = Array<string | number>;

/** O objeto (ou o valor) naquele caminho de uma cópia nova da resposta inteira. */
function at(path: Path) {
  const body = full() as Json;
  let target: unknown = body;
  for (const step of path) target = (target as Record<string | number, unknown>)[step];
  return { body, target: target as Json };
}

const accepts = (body: unknown) => dashboardResponseSchema.safeParse(body).success;

test('dashboard_schema_accepts_three_profile_shapes_and_refuses_each_missing_key_extra_key_null_card_and_bad_count', () => {
  // as três formas
  const { today, students, enrollments } = full();
  expect(accepts(full()), 'quatro chaves').toBe(true);
  expect(accepts({ today, students, enrollments }), 'três chaves').toBe(true);
  expect(accepts({ today, students }), 'duas chaves').toBe(true);

  // `days` é um inteiro positivo, não o literal 7
  const five = at(['enrollments', 'expiringSoon']);
  five.target.days = 5;
  expect(accepts(five.body), 'days igual a 5').toBe(true);

  // cada chave obrigatória, faltando uma por vez
  const ITEM: Path = ['enrollments', 'expiringSoon', 'items', 0];
  const BY_PLAN: Path = ['enrollments', 'byPlan', 0];
  const required: Array<[object: Path, key: string]> = [
    [[], 'today'],
    [[], 'students'],
    [['students'], 'active'],
    [['students'], 'inactive'],
    [['students'], 'suspended'],
    [['enrollments'], 'active'],
    [['enrollments'], 'scheduled'],
    [['enrollments'], 'expiringSoon'],
    [['enrollments'], 'byPlan'],
    [['enrollments', 'expiringSoon'], 'days'],
    [['enrollments', 'expiringSoon'], 'items'],
    [ITEM, 'enrollmentId'],
    [ITEM, 'student'],
    [ITEM, 'plan'],
    [ITEM, 'endsAt'],
    [[...ITEM, 'student'], 'id'],
    [[...ITEM, 'student'], 'name'],
    [[...ITEM, 'plan'], 'id'],
    [[...ITEM, 'plan'], 'name'],
    [[...ITEM, 'plan'], 'period'],
    [BY_PLAN, 'plan'],
    [BY_PLAN, 'active'],
    [['payments'], 'pending'],
    [['payments'], 'overdue'],
  ];
  expect(required).toHaveLength(24);
  for (const [path, key] of required) {
    const { body, target } = at(path);
    expect(target, `${path.join('.')}.${key} existe na resposta inteira`).toHaveProperty(key);
    delete target[key];
    expect(accepts(body), `sem ${path.join('.')}.${key}`).toBe(false);
  }

  // uma chave a mais em cada objeto
  const extra: Array<[object: Path, key: string]> = [
    [[], 'attendance'],
    [['students'], 'total'],
    [['enrollments'], 'expired'],
    [['enrollments', 'expiringSoon'], 'total'],
    [ITEM, 'startsAt'],
    [[...ITEM, 'student'], 'cpf'],
    [[...ITEM, 'plan'], 'priceCents'],
    [BY_PLAN, 'scheduled'],
    [['payments'], 'paid'],
  ];
  expect(extra).toHaveLength(9);
  for (const [path, key] of extra) {
    const { body, target } = at(path);
    target[key] = 1;
    expect(accepts(body), `${path.join('.')}.${key} a mais`).toBe(false);
  }
  // o `plan` de `byPlan` é o mesmo objeto do item da lista
  const byPlanPlan = at([...BY_PLAN, 'plan']);
  byPlanPlan.target.priceCents = 9990;
  expect(accepts(byPlanPlan.body), 'byPlan.plan.priceCents a mais').toBe(false);

  // o card que o perfil não lê não existe: `null` não é a ausência
  for (const card of ['enrollments', 'payments']) {
    const { body } = at([]);
    body[card] = null;
    expect(accepts(body), `${card} igual a null`).toBe(false);
  }

  // as oito contagens
  const counts: Array<[object: Path, key: string]> = [
    [['students'], 'active'],
    [['students'], 'inactive'],
    [['students'], 'suspended'],
    [['enrollments'], 'active'],
    [['enrollments'], 'scheduled'],
    [BY_PLAN, 'active'],
    [['payments'], 'pending'],
    [['payments'], 'overdue'],
  ];
  expect(counts).toHaveLength(8);
  for (const [path, key] of counts) {
    for (const bad of [-1, 1.5, '3']) {
      const { body, target } = at(path);
      target[key] = bad;
      expect(accepts(body), `${path.join('.')}.${key} igual a ${JSON.stringify(bad)}`).toBe(false);
    }
  }
});

test('dashboard_schema_accepts_check_ins_for_admin_and_reception_shapes_and_refuses_bad_check_ins', () => {
  const { today, students, enrollments, payments } = full();
  const checkIns = { count: 13 };

  // as quatro formas por perfil
  expect(accepts({ today, students, enrollments, payments, checkIns }), 'admin, cinco chaves').toBe(true);
  expect(accepts({ today, students, enrollments, payments }), 'hr_finance, quatro chaves').toBe(true);
  expect(accepts({ today, students, enrollments, checkIns }), 'reception, quatro chaves com checkIns e sem payments').toBe(true);
  expect(accepts({ today, students }), 'instructor, duas chaves').toBe(true);

  // `count` igual a zero
  expect(accepts({ today, students, enrollments, checkIns: { count: 0 } }), 'count 0').toBe(true);

  // `null`, sem `count`, chave a mais e contagens que não são inteiros não negativos
  const refused: Array<[label: string, value: unknown]> = [
    ['null', null],
    ['sem count', {}],
    ['chave a mais', { count: 1, distinct: 1 }],
    ['count -1', { count: -1 }],
    ['count 1.5', { count: 1.5 }],
    ['count "3"', { count: '3' }],
  ];
  for (const [label, value] of refused) {
    expect(accepts({ today, students, enrollments, checkIns: value }), label).toBe(false);
  }
});
