import { expect, test } from 'vitest';
import type { z } from 'zod';
import {
  checkInAccess,
  checkInsReportQuerySchema,
  checkInsReportSchema,
  checkInStatusSchema,
  registeredCheckInSchema,
  studentCheckInsQuerySchema,
  studentCheckInsResponseSchema,
  type CheckInBlockReason,
  type StudentStatus,
} from '../src/index.ts';

test('check_in_access_sixteen_rows_three_student_statuses_four_period_situations_both_reasons_in_order', () => {
  type Period = { startsAt: string; endsAt: string; cancelledAt: string | null };
  const period = (startsAt: string, endsAt: string, cancelledAt: string | null = null): Period => ({ startsAt, endsAt, cancelledAt });
  const covering = period('2026-09-20', '2026-10-19');
  const startsToday = period('2026-10-07', '2026-11-06');
  const endsToday = period('2026-09-08', '2026-10-07');
  const expiredYesterday = period('2026-09-07', '2026-10-06');
  const startsTomorrow = period('2026-10-08', '2026-11-07');
  const cancelledCovering = period('2026-09-20', '2026-10-19', '2026-09-25T12:00:00.000Z');

  // o resultado de cada linha está escrito à mão, não calculado
  const rows: Array<[label: string, status: StudentStatus, periods: Period[], today: string, access: 'allowed' | 'blocked', reasons: CheckInBlockReason[]]> = [
    ['ativo, período que cobre hoje com folga', 'active', [covering], '2026-10-07', 'allowed', []],
    ['ativo, período que começa hoje', 'active', [startsToday], '2026-10-07', 'allowed', []],
    ['ativo, período que termina hoje', 'active', [endsToday], '2026-10-07', 'allowed', []],
    ['ativo, período que terminou ontem', 'active', [expiredYesterday], '2026-10-07', 'blocked', ['no_active_enrollment']],
    ['ativo, período que começa amanhã', 'active', [startsTomorrow], '2026-10-07', 'blocked', ['no_active_enrollment']],
    ['ativo, período cancelado que cobriria hoje', 'active', [cancelledCovering], '2026-10-07', 'blocked', ['no_active_enrollment']],
    ['ativo, nenhum período', 'active', [], '2026-10-07', 'blocked', ['no_active_enrollment']],
    ['ativo, um vencido e um ativo', 'active', [expiredYesterday, startsToday], '2026-10-07', 'allowed', []],
    ['ativo, um cancelado e um ativo', 'active', [cancelledCovering, startsToday], '2026-10-07', 'allowed', []],
    ['inativo com período ativo', 'inactive', [covering], '2026-10-07', 'blocked', ['student_inactive']],
    ['inativo sem período', 'inactive', [], '2026-10-07', 'blocked', ['student_inactive', 'no_active_enrollment']],
    ['inativo com período vencido', 'inactive', [expiredYesterday], '2026-10-07', 'blocked', ['student_inactive', 'no_active_enrollment']],
    ['suspenso com período ativo', 'suspended', [covering], '2026-10-07', 'blocked', ['student_suspended']],
    ['suspenso só com período agendado', 'suspended', [startsTomorrow], '2026-10-07', 'blocked', ['student_suspended', 'no_active_enrollment']],
    ['hoje 2026-10-08, período que terminou em 2026-10-07', 'active', [endsToday], '2026-10-08', 'blocked', ['no_active_enrollment']],
    ['hoje 2026-10-08, período que começa em 2026-10-08', 'active', [startsTomorrow], '2026-10-08', 'allowed', []],
  ];
  expect(rows).toHaveLength(16);
  for (const [label, status, periods, today, access, reasons] of rows) {
    const result = checkInAccess({ status }, periods, today);
    expect(result, label).toEqual({ access, blockReasons: reasons });
    // `allowed` se e somente se não há motivo, e nenhum motivo se repete
    expect(result.access === 'allowed', label).toBe(result.blockReasons.length === 0);
    expect(new Set(result.blockReasons).size, label).toBe(result.blockReasons.length);
  }
});

const STUDENT_ID = '0199c1a0-0000-7000-8000-000000000001';
const PLAN_ID = '0199c1a0-0000-7000-8000-000000000002';
const ENROLLMENT_ID = '0199c1a0-0000-7000-8000-000000000003';
const CHECK_IN_ID = '0199c1a0-0000-7000-8000-000000000004';
const USER_ID = '0199c1a0-0000-7000-8000-000000000005';
const AT = '2026-10-07T15:00:00.000Z';

const status = () => ({
  today: '2026-10-07',
  student: { id: STUDENT_ID, name: 'Ana Souza', status: 'active' },
  photoUrl: 'https://fotos.exemplo/large.webp?assinatura=1',
  access: 'allowed',
  blockReasons: [] as string[],
  enrollment: { id: ENROLLMENT_ID, plan: { id: PLAN_ID, name: 'Mensal', period: 'monthly' }, startsAt: '2026-10-01', endsAt: '2026-10-31' },
  checkedInAt: AT,
});
const registered = () => ({ id: CHECK_IN_ID, day: '2026-10-07', checkedInAt: AT });
const history = () => ({
  items: [{ id: CHECK_IN_ID, day: '2026-10-07', checkedInAt: AT, checkedInBy: { id: USER_ID, name: 'Recepção' } }],
  nextCursor: CHECK_IN_ID,
});
const report = () => ({
  from: '2026-10-01',
  to: '2026-10-07',
  total: 1,
  items: [
    {
      id: CHECK_IN_ID,
      day: '2026-10-07',
      checkedInAt: AT,
      student: { id: STUDENT_ID, name: 'Ana Souza' },
      checkedInBy: { id: USER_ID, name: 'Recepção' },
    },
  ],
  nextCursor: CHECK_IN_ID,
});

type Json = Record<string | number, unknown>;
type Path = Array<string | number>;

function at(make: () => object, path: Path) {
  const body = make() as Json;
  let target: unknown = body;
  for (const step of path) target = (target as Json)[step];
  return { body, target: target as Json };
}

test('check_in_schemas_accept_the_surface_shapes_and_refuse_each_missing_key_extra_key_and_bad_value', () => {
  const cases: Array<{ name: string; schema: z.ZodType; make: () => object; required: Array<[Path, string]>; objects: Path[] }> = [
    {
      name: 'situação',
      schema: checkInStatusSchema,
      make: status,
      required: [
        [[], 'today'],
        [[], 'student'],
        [[], 'photoUrl'],
        [[], 'access'],
        [[], 'blockReasons'],
        [[], 'enrollment'],
        [[], 'checkedInAt'],
        [['student'], 'id'],
        [['student'], 'name'],
        [['student'], 'status'],
        [['enrollment'], 'id'],
        [['enrollment'], 'plan'],
        [['enrollment'], 'startsAt'],
        [['enrollment'], 'endsAt'],
        [['enrollment', 'plan'], 'id'],
        [['enrollment', 'plan'], 'name'],
        [['enrollment', 'plan'], 'period'],
      ],
      objects: [[], ['student'], ['enrollment'], ['enrollment', 'plan']],
    },
    {
      name: '201',
      schema: registeredCheckInSchema,
      make: registered,
      required: [
        [[], 'id'],
        [[], 'day'],
        [[], 'checkedInAt'],
      ],
      objects: [[]],
    },
    {
      name: 'histórico',
      schema: studentCheckInsResponseSchema,
      make: history,
      required: [
        [[], 'items'],
        [[], 'nextCursor'],
        [['items', 0], 'id'],
        [['items', 0], 'day'],
        [['items', 0], 'checkedInAt'],
        [['items', 0], 'checkedInBy'],
        [['items', 0, 'checkedInBy'], 'id'],
        [['items', 0, 'checkedInBy'], 'name'],
      ],
      objects: [[], ['items', 0], ['items', 0, 'checkedInBy']],
    },
    {
      name: 'relatório',
      schema: checkInsReportSchema,
      make: report,
      required: [
        [[], 'from'],
        [[], 'to'],
        [[], 'total'],
        [[], 'items'],
        [[], 'nextCursor'],
        [['items', 0], 'id'],
        [['items', 0], 'day'],
        [['items', 0], 'checkedInAt'],
        [['items', 0], 'student'],
        [['items', 0], 'checkedInBy'],
        [['items', 0, 'student'], 'id'],
        [['items', 0, 'student'], 'name'],
        [['items', 0, 'checkedInBy'], 'id'],
        [['items', 0, 'checkedInBy'], 'name'],
      ],
      objects: [[], ['items', 0], ['items', 0, 'student'], ['items', 0, 'checkedInBy']],
    },
  ];

  for (const { name, schema, make, required, objects } of cases) {
    // a forma da `Surface`
    expect(schema.safeParse(make()).success, name).toBe(true);
    // cada chave obrigatória, faltando uma por vez
    for (const [path, key] of required) {
      const { body, target } = at(make, path);
      expect(target, `${name}: ${[...path, key].join('.')} existe`).toHaveProperty(String(key));
      delete target[key];
      expect(schema.safeParse(body).success, `${name}: sem ${[...path, key].join('.')}`).toBe(false);
    }
    // uma chave a mais em cada objeto estrito
    for (const path of objects) {
      const { body, target } = at(make, path);
      target.extra = 1;
      expect(schema.safeParse(body).success, `${name}: ${[...path, 'extra'].join('.')} a mais`).toBe(false);
    }
  }
  // as sete chaves da situação, exatamente
  expect(Object.keys(checkInStatusSchema.shape).sort()).toEqual(
    ['access', 'blockReasons', 'checkedInAt', 'enrollment', 'photoUrl', 'student', 'today'].sort(),
  );

  // `photoUrl`, `enrollment` e `checkedInAt` iguais a `null` e preenchidos
  const empty = { ...status(), photoUrl: null, enrollment: null, checkedInAt: null };
  expect(checkInStatusSchema.safeParse(empty).success, 'situação com os três null').toBe(true);
  expect(checkInsReportSchema.safeParse({ ...report(), nextCursor: null, items: [], total: 0 }).success, 'relatório vazio').toBe(true);
  expect(studentCheckInsResponseSchema.safeParse({ items: [], nextCursor: null }).success, 'histórico vazio').toBe(true);

  // `access` só `allowed` e `blocked`; `blockReasons` só os três motivos
  expect(checkInStatusSchema.safeParse({ ...status(), access: 'blocked', blockReasons: ['student_inactive', 'student_suspended', 'no_active_enrollment'] }).success).toBe(true);
  for (const access of ['denied', 'ALLOWED', '', null]) {
    expect(checkInStatusSchema.safeParse({ ...status(), access }).success, `access ${String(access)}`).toBe(false);
  }
  for (const reason of ['payment_overdue', 'student_active', '']) {
    expect(checkInStatusSchema.safeParse({ ...status(), access: 'blocked', blockReasons: [reason] }).success, `motivo ${reason}`).toBe(false);
  }

  // a query do relatório
  expect(checkInsReportQuerySchema.safeParse({}).success, 'sem from, to e cursor').toBe(true);
  expect(checkInsReportQuerySchema.safeParse({ from: '2024-02-29', to: '2024-02-29' }).success, '2024-02-29').toBe(true);
  for (const param of ['from', 'to'] as const) {
    for (const bad of ['2026-02-29', '2026-13-01', '2026-10-7', '26-10-07', '2026-10-07T00:00:00Z', '']) {
      const parsed = checkInsReportQuerySchema.safeParse({ [param]: bad });
      expect(parsed.success, `${param}=${bad}`).toBe(false);
      expect(parsed.error!.issues.map((issue) => issue.path), `${param}=${bad}`).toEqual([[param]]);
    }
  }

  // o cursor é um `uuid`, nas duas queries
  for (const schema of [checkInsReportQuerySchema, studentCheckInsQuerySchema]) {
    expect(schema.safeParse({ cursor: CHECK_IN_ID }).success).toBe(true);
    for (const bad of ['abc', '', '0199c1a0-0000-7000-8000-00000000000']) {
      const parsed = schema.safeParse({ cursor: bad });
      expect(parsed.success, `cursor ${bad}`).toBe(false);
      expect(parsed.error!.issues.map((issue) => issue.path)).toEqual([['cursor']]);
    }
  }
});
