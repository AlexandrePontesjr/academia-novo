import { problemSchema, type RegisteredCheckIn, type Role } from '@academia/contracts';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { auditCount } from './support/audit.ts';
import {
  AFTER_TURN,
  BEFORE_TURN,
  REGISTERED_KEYS,
  checkInRow,
  checkInRowsOf,
  checkInSnapshot,
  checkInsPath,
  insertCheckIn,
  readStatus,
  registerCheckIn,
  sessionAt,
} from './support/check-ins.ts';
import type { Client } from './support/client.ts';
import { NOON, clockAt, databaseNow, insertEnrollment, insertPlan } from './support/plans.ts';
import { problem, type SeededUser, type Stack, startStack } from './support/stack.ts';
import { cpfOf, insertStudents, releasedTogether, unknownId } from './support/students.ts';

const FOREIGN = 'https://intruso.exemplo';
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

let stack: Stack;
/** As sessões dos quatro perfis, abertas em `NOON`, e os usuários delas. */
const sessions = {} as Record<Role, Client>;
const users = {} as Record<Role, SeededUser>;
let planId: string;
let counter = 13_000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  // as sessões nascem no relógio controlado, que não anda sozinho: valem enquanto o teste estiver nele
  clockAt(NOON);
  for (const role of ['admin', 'reception', 'hr_finance', 'instructor'] as const) {
    const { user, client } = await stack.session(role);
    sessions[role] = client;
    users[role] = user;
  }
  planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
}, 180_000);

// salvo quando o caso diz outra coisa, hoje é 7 de outubro de 2026 em São Paulo
beforeEach(() => clockAt(NOON));

afterAll(async () => {
  vi.useRealTimers();
  await stack?.close();
});

/** Um aluno novo, direto no banco, com a situação pedida. */
const newStudent = async (status = 'active') => (await insertStudents(stack, [{ name: `Aluno ${next()}`, cpf: cpfOf(next()), status }]))[0]!;

/** Um período do aluno no "Mensal", por padrão de 2026-10-01 a 2026-10-31, que cobre D e D+1. */
const periodOf = (studentId: string, options: { startsAt?: string; endsAt?: string; cancelled?: boolean } = {}) =>
  insertEnrollment(stack, { studentId, planId, startsAt: '2026-10-01', endsAt: '2026-10-31', ...options });

/** Um aluno liberado: `active` com um período que cobre D. */
async function allowedStudent() {
  const studentId = await newStudent();
  await periodOf(studentId);
  return studentId;
}

/** Os seis casos de bloqueio: dois pelo aluno e quatro pela matrícula. */
const BLOCKED_CASES: Array<[label: string, prepare: () => Promise<string>]> = [
  ['aluno inactive com período', async () => {
    const studentId = await newStudent('inactive');
    await periodOf(studentId);
    return studentId;
  }],
  ['aluno suspended com período', async () => {
    const studentId = await newStudent('suspended');
    await periodOf(studentId);
    return studentId;
  }],
  ['aluno active sem período', () => newStudent()],
  ['aluno active só agendado', async () => {
    const studentId = await newStudent();
    await periodOf(studentId, { startsAt: '2026-10-08', endsAt: '2026-11-07' });
    return studentId;
  }],
  ['aluno active só vencido', async () => {
    const studentId = await newStudent();
    await periodOf(studentId, { startsAt: '2026-09-07', endsAt: '2026-10-06' });
    return studentId;
  }],
  ['aluno active só cancelado', async () => {
    const studentId = await newStudent();
    await periodOf(studentId, { cancelled: true });
    return studentId;
  }],
];

test('check_in_201_for_admin_and_reception_with_three_keys_and_one_row_by_the_author', async () => {
  for (const role of ['admin', 'reception'] as const) {
    const studentId = await allowedStudent();

    const t0 = await databaseNow(stack);
    const response = await sessions[role].post(checkInsPath(studentId));
    const t1 = await databaseNow(stack);
    const body = (await response.json()) as RegisteredCheckIn;

    expect(response.status, role).toBe(201);
    expect(Object.keys(body).sort(), role).toEqual([...REGISTERED_KEYS].sort());
    expect(body.day, role).toBe('2026-10-07');
    expect(body.checkedInAt, role).toMatch(ISO_INSTANT);
    expect(new Date(body.checkedInAt).getTime(), role).toBeGreaterThanOrEqual(t0.getTime());
    expect(new Date(body.checkedInAt).getTime(), role).toBeLessThanOrEqual(t1.getTime());

    // exatamente uma linha, com esse `id`, o aluno, o dia e o autor
    const rows = await stack.query<{ id: string }>('select id from check_ins where student_id = $1', [studentId]);
    expect(rows, role).toEqual([{ id: body.id }]);
    const row = await checkInRow(stack, body.id);
    expect(row, role).toMatchObject({ id: body.id, student_id: studentId, day: '2026-10-07', checked_in_by: users[role].id });
    expect(new Date(row!.checked_in_at as string).toISOString(), role).toBe(body.checkedInAt);
  }
});

test('blocked_student_409_check_in_blocked_six_cases_and_nothing_written', async () => {
  expect(BLOCKED_CASES).toHaveLength(6);
  for (const [label, prepare] of BLOCKED_CASES) {
    const studentId = await prepare();
    const before = await checkInSnapshot(stack);

    const response = await sessions.reception.post(checkInsPath(studentId));
    const body = await problem(response);

    expect(response.status, label).toBe(409);
    expect(body.code, label).toBe('check_in_blocked');
    expect(problemSchema.safeParse(body).success, label).toBe(true);
    expect(await checkInSnapshot(stack), label).toEqual(before);
  }
});

test('second_check_in_same_day_409_already_checked_in_and_nothing_written', async () => {
  const byRoute = await allowedStudent();
  await registerCheckIn(sessions.reception, byRoute);
  const bySql = await allowedStudent();
  await insertCheckIn(stack, { studentId: bySql, day: '2026-10-07', checkedInBy: users.reception.id });

  for (const [label, studentId] of [
    ['primeira pela rota', byRoute],
    ['primeira por SQL', bySql],
  ] as const) {
    const before = await checkInSnapshot(stack);

    const response = await sessions.admin.post(checkInsPath(studentId));
    const body = await problem(response);

    expect(response.status, label).toBe(409);
    expect(body.code, label).toBe('already_checked_in');
    expect(problemSchema.safeParse(body).success, label).toBe(true);
    expect(await checkInSnapshot(stack), label).toEqual(before);
  }
});

test('two_simultaneous_check_ins_one_201_one_409_over_ten_rounds', async () => {
  for (let round = 1; round <= 10; round += 1) {
    const studentId = await allowedStudent();

    const responses = await releasedTogether([
      () => sessions.admin.post(checkInsPath(studentId)),
      () => sessions.reception.post(checkInsPath(studentId)),
    ]);

    const statuses = responses.map((response) => response.status);
    for (const status of statuses) expect(status, `rodada ${round}`).toBeLessThan(500);
    expect([...statuses].sort(), `rodada ${round}`).toEqual([201, 409]);
    const refused = responses.find((response) => response.status === 409)!;
    expect((await problem(refused)).code, `rodada ${round}`).toBe('already_checked_in');
    expect(await checkInRowsOf(stack, studentId), `rodada ${round}`).toHaveLength(1);
  }
});

test('next_day_check_in_allowed_at_the_sao_paulo_turn_with_day_from_the_api_clock', async () => {
  const studentId = await allowedStudent();
  await registerCheckIn(sessions.reception, studentId);

  const before = await sessionAt(stack, BEFORE_TURN);
  const repeated = await before.post(checkInsPath(studentId));
  expect(repeated.status).toBe(409);
  expect((await problem(repeated)).code).toBe('already_checked_in');

  const after = await sessionAt(stack, AFTER_TURN);
  const response = await after.post(checkInsPath(studentId));
  const body = (await response.json()) as RegisteredCheckIn;
  expect(response.status).toBe(201);
  expect(body.day).toBe('2026-10-08');

  // o dia vem do relógio da API, que o teste moveu; o do banco segue no dia real da máquina
  const [{ day: databaseDay }] = (await stack.query<{ day: string }>('select now()::date::text as day')) as [{ day: string }];
  expect((await checkInRow(stack, body.id))!.day).toBe('2026-10-08');
  expect(databaseDay).not.toBe('2026-10-08');
});

test('check_in_follows_both_period_edges_at_the_sao_paulo_turn', async () => {
  const edges: Array<[label: string, period: { startsAt: string; endsAt: string }, beforeTurn: string, afterTurn: string]> = [
    ['termina em 2026-10-07', { startsAt: '2026-09-08', endsAt: '2026-10-07' }, 'ok', 'check_in_blocked'],
    ['começa em 2026-10-08', { startsAt: '2026-10-08', endsAt: '2026-11-07' }, 'check_in_blocked', 'ok'],
  ];
  for (const [label, period, beforeTurn, afterTurn] of edges) {
    for (const [instant, expected] of [
      [BEFORE_TURN, beforeTurn],
      [AFTER_TURN, afterTurn],
    ] as const) {
      // um aluno para cada instante: a presença de um não pesa no outro
      const studentId = await newStudent();
      await periodOf(studentId, period);
      const client = await sessionAt(stack, instant);

      const response = await client.post(checkInsPath(studentId));

      if (expected === 'ok') {
        expect(response.status, `${label}, ${instant}`).toBe(201);
      } else {
        expect(response.status, `${label}, ${instant}`).toBe(409);
        expect((await problem(response)).code, `${label}, ${instant}`).toBe(expected);
      }
    }
  }
});

test('hr_finance_and_instructor_403_forbidden_and_nothing_written', async () => {
  const studentId = await allowedStudent();
  for (const role of ['hr_finance', 'instructor'] as const) {
    for (const [label, id] of [
      ['aluno liberado', studentId],
      ['uuid de ninguém', unknownId()],
    ] as const) {
      const before = await checkInSnapshot(stack);

      const response = await sessions[role].post(checkInsPath(id));

      expect(response.status, `${role}, ${label}`).toBe(403);
      expect((await problem(response)).code, `${role}, ${label}`).toBe('forbidden');
      expect(await checkInSnapshot(stack), `${role}, ${label}`).toEqual(before);
    }
  }
});

test('anonymous_401_unauthorized_and_nothing_written', async () => {
  const studentId = await allowedStudent();
  const before = await checkInSnapshot(stack);

  const response = await stack.client().post(checkInsPath(studentId));

  expect(response.status).toBe(401);
  expect((await problem(response)).code).toBe('unauthorized');
  expect(await checkInSnapshot(stack)).toEqual(before);
});

test('unknown_and_non_uuid_student_404_and_nothing_written', async () => {
  for (const role of ['admin', 'reception'] as const) {
    for (const id of [unknownId(), 'abc']) {
      const before = await checkInSnapshot(stack);

      const response = await sessions[role].post(checkInsPath(id));

      expect(response.status, `${role}, ${id}`).toBe(404);
      expect((await problem(response)).code, `${role}, ${id}`).toBe('not_found');
      expect(await checkInSnapshot(stack), `${role}, ${id}`).toEqual(before);
    }
  }
});

test('check_in_201_writes_no_audit_row', async () => {
  const studentId = await allowedStudent();
  const before = await auditCount(stack);

  await registerCheckIn(sessions.reception, studentId);

  expect(await auditCount(stack)).toBe(before);
});

test('body_fields_are_ignored_student_day_and_author_come_from_url_clock_and_session', async () => {
  const studentId = await allowedStudent();
  const other = await allowedStudent();

  const response = await sessions.reception.post(checkInsPath(studentId), {
    studentId: other,
    day: '2026-10-01',
    checkedInBy: users.admin.id,
  });
  const body = (await response.json()) as RegisteredCheckIn;

  expect(response.status).toBe(201);
  expect(await checkInRow(stack, body.id)).toMatchObject({ student_id: studentId, day: '2026-10-07', checked_in_by: users.reception.id });
  expect(await checkInRowsOf(stack, other)).toEqual([]);
});

test('foreign_or_missing_origin_403_csrf_rejected_and_nothing_written', async () => {
  const studentId = await allowedStudent();
  for (const [label, origin] of [
    ['outra origem', FOREIGN],
    ['sem Origin', null],
  ] as const) {
    const before = await checkInSnapshot(stack);

    const response = await sessions.reception.request('POST', checkInsPath(studentId), { origin });

    expect(response.status, label).toBe(403);
    expect((await problem(response)).code, label).toBe('csrf_rejected');
    expect(await checkInSnapshot(stack), label).toEqual(before);
  }
});

test('no_check_in_outcome_writes_an_audit_row_six_outcomes', async () => {
  const allowed = await allowedStudent();
  const blocked = await newStudent('inactive');
  const already = await allowedStudent();
  await insertCheckIn(stack, { studentId: already, day: '2026-10-07', checkedInBy: users.reception.id });

  const outcomes: Array<[label: string, send: () => Promise<Response>, status: number]> = [
    ['201', () => sessions.reception.post(checkInsPath(allowed)), 201],
    ['409 check_in_blocked', () => sessions.reception.post(checkInsPath(blocked)), 409],
    ['409 already_checked_in', () => sessions.reception.post(checkInsPath(already)), 409],
    ['403', () => sessions.instructor.post(checkInsPath(allowed)), 403],
    ['404', () => sessions.reception.post(checkInsPath(unknownId())), 404],
    ['401', () => stack.client().post(checkInsPath(allowed)), 401],
  ];
  expect(outcomes).toHaveLength(6);
  for (const [label, send, status] of outcomes) {
    const before = await auditCount(stack);

    const response = await send();

    expect(response.status, label).toBe(status);
    expect((await auditCount(stack)) - before, label).toBe(0);
  }
});

test('blocked_takes_precedence_over_already_checked_in', async () => {
  const studentId = await allowedStudent();
  const registered = await registerCheckIn(sessions.reception, studentId);
  // inativado pela rota que já existe
  expect((await sessions.reception.delete(`/api/students/${studentId}`)).status).toBe(204);

  const response = await sessions.reception.post(checkInsPath(studentId));
  expect(response.status).toBe(409);
  expect((await problem(response)).code).toBe('check_in_blocked');

  const status = await readStatus(sessions.reception, studentId);
  expect(status.access).toBe('blocked');
  expect(status.checkedInAt).toBe(registered.checkedInAt);
});

test('two_new_codes_are_problem_json_409', async () => {
  const blocked = await newStudent('suspended');
  const already = await allowedStudent();
  await registerCheckIn(sessions.reception, already);

  for (const [code, studentId] of [
    ['check_in_blocked', blocked],
    ['already_checked_in', already],
  ] as const) {
    const response = await sessions.reception.post(checkInsPath(studentId));
    const body = await response.json();

    expect(response.status, code).toBe(409);
    expect(response.headers.get('content-type'), code).toMatch(/^application\/problem\+json\b/);
    expect(problemSchema.safeParse(body).success, code).toBe(true);
    expect(body, code).toMatchObject({ status: 409, code });
  }
});
