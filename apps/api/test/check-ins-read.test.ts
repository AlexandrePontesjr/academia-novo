import type { CheckInsReport, Role, StudentCheckInsResponse } from '@academia/contracts';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { AFTER_TURN, BEFORE_TURN, REPORT_PATH, checkInSnapshot, checkInsPath, insertCheckIn, sessionAt, statusPath } from './support/check-ins.ts';
import type { Client } from './support/client.ts';
import { NOON, clockAt, insertEnrollment, insertPlan } from './support/plans.ts';
import { problem, type SeededUser, type Stack, startStack } from './support/stack.ts';
import { cpfOf, fieldErrorPaths, insertStudents, unknownId } from './support/students.ts';

let stack: Stack;
/** As sessões dos quatro perfis, abertas em `NOON`. */
const sessions = {} as Record<Role, Client>;
/** O autor das presenças postas por SQL. */
let author: SeededUser;
let counter = 14_000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  // as sessões nascem no relógio controlado, que não anda sozinho: valem enquanto o teste estiver nele
  clockAt(NOON);
  for (const role of ['admin', 'reception', 'hr_finance', 'instructor'] as const) sessions[role] = (await stack.session(role)).client;
  author = await stack.seed({ role: 'reception', name: 'Recepção Um' });
}, 180_000);

// o relatório é do banco inteiro: cada caso parte sem presença, em 7 de outubro de 2026
beforeEach(async () => {
  clockAt(NOON);
  await stack.query('delete from check_ins');
});

afterAll(async () => {
  vi.useRealTimers();
  await stack?.close();
});

const newStudent = async (name = `Aluno ${next()}`) => (await insertStudents(stack, [{ name, cpf: cpfOf(next()) }]))[0]!;

/** `count` presenças do aluno em dias seguidos a partir de `firstDay`, com `checked_in_at` dado pela posição. */
async function manyCheckIns(studentId: string, count: number, firstDay: string, instantOf: (index: number) => string) {
  for (let index = 0; index < count; index += 1) {
    const day = new Date(Date.parse(`${firstDay}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
    await insertCheckIn(stack, { studentId, day, checkedInBy: author.id, checkedInAt: instantOf(index) });
  }
}

/** Uma presença de um aluno novo naquele dia. */
const checkInOn = async (day: string, checkedInAt = `${day}T15:00:00Z`) =>
  insertCheckIn(stack, { studentId: await newStudent(), day, checkedInBy: author.id, checkedInAt });

async function history(client: Client, studentId: string, cursor?: string) {
  const response = await client.get(`${checkInsPath(studentId)}${cursor ? `?cursor=${cursor}` : ''}`);
  expect(response.status, `histórico de ${studentId}`).toBe(200);
  return (await response.json()) as StudentCheckInsResponse;
}

async function report(client: Client, query = '') {
  const response = await client.get(`${REPORT_PATH}${query}`);
  expect(response.status, `relatório ${query}`).toBe(200);
  return (await response.json()) as CheckInsReport;
}

/** Os `id` de presença em `checked_in_at` decrescente e, no empate, `id` decrescente, lidos do banco. */
async function expectedOrder(where = 'true', values: unknown[] = []) {
  const rows = await stack.query<{ id: string }>(`select id from check_ins where ${where} order by checked_in_at desc, id desc`, values);
  return rows.map((row) => row.id);
}

/** Percorre as páginas pelo `nextCursor` e devolve os `id` na ordem em que vieram. */
async function walk(read: (cursor?: string) => Promise<{ items: Array<{ id: string }>; nextCursor: string | null }>) {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const body = await read(cursor);
    expect(body.items.length).toBeLessThanOrEqual(50);
    ids.push(...body.items.map((item) => item.id));
    if (body.nextCursor === null) return ids;
    cursor = body.nextCursor;
  }
  throw new Error('o cursor não terminou');
}

const sortedKeys = (value: object) => Object.keys(value).sort();

test('history_200_only_this_students_items_with_four_keys_and_current_author_name', async () => {
  const studentId = await newStudent();
  const other = await newStudent();
  for (const day of ['2026-10-05', '2026-10-06', '2026-10-07']) await insertCheckIn(stack, { studentId, day, checkedInBy: author.id });
  for (const day of ['2026-10-06', '2026-10-07']) await insertCheckIn(stack, { studentId: other, day, checkedInBy: author.id });

  for (const role of ['admin', 'reception'] as const) {
    const body = await history(sessions[role], studentId);

    expect(sortedKeys(body), role).toEqual(['items', 'nextCursor']);
    expect(body.items, role).toHaveLength(3);
    expect(body.items.map((item) => item.day).sort(), role).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    for (const item of body.items) {
      expect(sortedKeys(item), role).toEqual(['checkedInAt', 'checkedInBy', 'day', 'id']);
      expect(sortedKeys(item.checkedInBy), role).toEqual(['id', 'name']);
      expect(item.checkedInBy, role).toEqual({ id: author.id, name: 'Recepção Um' });
    }
    expect(body.items.map((item) => item.id).sort(), role).toEqual((await expectedOrder('student_id = $1', [studentId])).sort());
  }

  // renomeado quem registrou, vale o nome de agora
  await stack.query('update users set name = $2 where id = $1', [author.id, 'Recepção Renomeada']);
  try {
    const renamed = await history(sessions.reception, studentId);
    expect(renamed.items.map((item) => item.checkedInBy.name)).toEqual(['Recepção Renomeada', 'Recepção Renomeada', 'Recepção Renomeada']);
  } finally {
    await stack.query('update users set name = $2 where id = $1', [author.id, 'Recepção Um']);
  }
});

test('history_ordered_by_checked_in_at_desc_then_id_desc_against_insertion_order', async () => {
  const studentId = await newStudent();
  const insert = (day: string, checkedInAt: string, id?: string) => insertCheckIn(stack, { studentId, day, checkedInBy: author.id, checkedInAt, id });
  // três dias distintos, inseridos fora de ordem
  const middle = await insert('2026-10-03', '2026-10-03T15:00:00Z');
  const newest = await insert('2026-10-05', '2026-10-05T15:00:00Z');
  const oldest = await insert('2026-10-01', '2026-10-01T15:00:00Z');
  // o empate: o mesmo instante em dias diferentes, o `id` menor inserido primeiro
  const smaller = await insert('2026-09-20', '2026-09-30T12:00:00Z', '01990000-0000-7000-8000-00000000000a');
  const larger = await insert('2026-09-21', '2026-09-30T12:00:00Z', '01990000-0000-7000-8000-00000000000b');

  const body = await history(sessions.reception, studentId);

  expect(body.items.map((item) => item.id)).toEqual([newest, middle, oldest, larger, smaller]);
});

test('history_cursor_50_51_walks_every_row_once_and_new_rows_do_not_shift_the_next_page', async () => {
  // 50: uma página só
  const fifty = await newStudent();
  await manyCheckIns(fifty, 50, '2026-01-01', (index) => new Date(Date.UTC(2026, 0, 1, 12) + index * 3_600_000).toISOString());
  const page = await history(sessions.reception, fifty);
  expect(page.items).toHaveLength(50);
  expect(page.nextCursor).toBeNull();

  // 51: 50 e o cursor; a página seguinte traz a 51ª
  const fiftyOne = await newStudent();
  await manyCheckIns(fiftyOne, 51, '2026-01-01', (index) => new Date(Date.UTC(2026, 0, 1, 12) + index * 3_600_000).toISOString());
  const first = await history(sessions.reception, fiftyOne);
  expect(first.items).toHaveLength(50);
  expect(first.nextCursor).not.toBeNull();
  const second = await history(sessions.reception, fiftyOne, first.nextCursor!);
  const all = await expectedOrder('student_id = $1', [fiftyOne]);
  expect(second.items.map((item) => item.id)).toEqual([all[50]]);
  expect(second.nextCursor).toBeNull();

  // 120 com empates de três em três: cada presença uma vez só, na ordem
  const many = await newStudent();
  await manyCheckIns(many, 120, '2025-06-01', (index) => new Date(Date.UTC(2026, 0, 1, 12) + Math.floor(index / 3) * 3_600_000).toISOString());
  const walked = await walk((cursor) => history(sessions.reception, many, cursor));
  expect(walked).toEqual(await expectedOrder('student_id = $1', [many]));
  expect(new Set(walked).size).toBe(120);

  // uma presença nova entre as duas páginas não desloca a segunda
  const before = await history(sessions.reception, many);
  const expectedSecond = (await history(sessions.reception, many, before.nextCursor!)).items.map((item) => item.id);
  await insertCheckIn(stack, { studentId: many, day: '2026-10-07', checkedInBy: author.id, checkedInAt: '2026-10-07T15:00:00Z' });
  const afterInsert = await history(sessions.reception, many, before.nextCursor!);
  expect(afterInsert.items.map((item) => item.id)).toEqual(expectedSecond);
});

test('history_empty_items_and_null_cursor', async () => {
  const body = await history(sessions.reception, await newStudent());

  expect(body).toEqual({ items: [], nextCursor: null });
});

test('history_cursor_never_issued_422_three_cases', async () => {
  const studentId = await newStudent();
  await insertCheckIn(stack, { studentId, day: '2026-10-07', checkedInBy: author.id });
  const othersCheckIn = await checkInOn('2026-10-06');

  for (const [label, cursor] of [
    ['abc', 'abc'],
    ['uuid de ninguém', unknownId()],
    ['presença de outro aluno', othersCheckIn],
  ] as const) {
    const response = await sessions.reception.get(`${checkInsPath(studentId)}?cursor=${cursor}`);

    expect(response.status, label).toBe(422);
    expect((await problem(response.clone())).code, label).toBe('validation_failed');
    expect(await fieldErrorPaths(response), label).toEqual(['cursor']);
  }
});

test('history_403_401_404', async () => {
  const studentId = await newStudent();
  const refusals: Array<[label: string, send: () => Promise<Response>, status: number, code: string]> = [
    ['hr_finance, aluno que existe', () => sessions.hr_finance.get(checkInsPath(studentId)), 403, 'forbidden'],
    ['hr_finance, uuid de ninguém', () => sessions.hr_finance.get(checkInsPath(unknownId())), 403, 'forbidden'],
    ['instructor, aluno que existe', () => sessions.instructor.get(checkInsPath(studentId)), 403, 'forbidden'],
    ['instructor, uuid de ninguém', () => sessions.instructor.get(checkInsPath(unknownId())), 403, 'forbidden'],
    ['sem sessão', () => stack.client().get(checkInsPath(studentId)), 401, 'unauthorized'],
    ['admin, uuid de ninguém', () => sessions.admin.get(checkInsPath(unknownId())), 404, 'not_found'],
    ['admin, id que não é uuid', () => sessions.admin.get(checkInsPath('abc')), 404, 'not_found'],
  ];
  for (const [label, send, status, code] of refusals) {
    const response = await send();

    expect(response.status, label).toBe(status);
    expect((await problem(response)).code, label).toBe(code);
  }
});

test('report_200_both_ends_included_with_five_keys_and_item_keys', async () => {
  const byDay: Record<string, string> = {};
  for (const day of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) byDay[day] = await checkInOn(day);

  for (const role of ['admin', 'reception'] as const) {
    const body = await report(sessions[role], '?from=2026-10-06&to=2026-10-07');

    expect(sortedKeys(body), role).toEqual(['from', 'items', 'nextCursor', 'to', 'total']);
    expect(body.items.map((item) => item.id), role).toEqual([byDay['2026-10-07'], byDay['2026-10-06']]);
    for (const item of body.items) {
      expect(sortedKeys(item), role).toEqual(['checkedInAt', 'checkedInBy', 'day', 'id', 'student']);
      expect(sortedKeys(item.student), role).toEqual(['id', 'name']);
      expect(sortedKeys(item.checkedInBy), role).toEqual(['id', 'name']);
      expect(item.checkedInBy, role).toEqual({ id: author.id, name: 'Recepção Um' });
    }
  }
});

test('report_total_is_the_whole_period_on_every_page', async () => {
  for (const student of [await newStudent(), await newStudent(), await newStudent()]) {
    // 18 em outubro, de 2026-10-01 a 2026-10-18, menos as que caem fora do período
    await manyCheckIns(student, 18, '2026-10-01', (index) => new Date(Date.UTC(2026, 9, 1, 12) + index * 86_400_000).toISOString());
  }
  // fora do período
  await checkInOn('2026-09-30');
  await checkInOn('2026-10-19');
  // de 2026-10-01 a 2026-10-18 são 3 × 18 = 54; tirada a de 2026-10-18 de um aluno, 53
  await stack.query(`delete from check_ins where id = (select id from check_ins where day = '2026-10-18' order by id limit 1)`);

  const first = await report(sessions.reception, '?from=2026-10-01&to=2026-10-18');
  expect(first.total).toBe(53);
  expect(first.items).toHaveLength(50);
  const second = await report(sessions.reception, `?from=2026-10-01&to=2026-10-18&cursor=${first.nextCursor}`);
  expect(second.total).toBe(53);
  expect(second.items).toHaveLength(3);
  expect(second.nextCursor).toBeNull();
});

test('report_defaults_to_today_and_from_defaults_to_to', async () => {
  for (const day of ['2026-10-01', '2026-10-06', '2026-10-07', '2026-10-08']) await checkInOn(day);

  const none = await report(sessions.reception);
  expect([none.from, none.to]).toEqual(['2026-10-07', '2026-10-07']);
  expect(none.items).toEqual((await report(sessions.reception, '?from=2026-10-07&to=2026-10-07')).items);
  expect(none.items).toHaveLength(1);

  const onlyFrom = await report(sessions.reception, '?from=2026-10-01');
  expect([onlyFrom.from, onlyFrom.to]).toEqual(['2026-10-01', '2026-10-07']);

  const onlyTo = await report(sessions.reception, '?to=2026-10-06');
  expect([onlyTo.from, onlyTo.to]).toEqual(['2026-10-06', '2026-10-06']);
});

test('report_ordered_desc_then_id_desc_fifty_per_page_cursor_walks_every_row_once', async () => {
  // o empate contra a ordem de inserção: o `id` menor entra primeiro
  const tie = '2026-10-06T12:00:00Z';
  const smaller = await insertCheckIn(stack, { studentId: await newStudent(), day: '2026-10-06', checkedInBy: author.id, checkedInAt: tie, id: '01990000-0000-7000-8000-0000000000a1' });
  const larger = await insertCheckIn(stack, { studentId: await newStudent(), day: '2026-10-06', checkedInBy: author.id, checkedInAt: tie, id: '01990000-0000-7000-8000-0000000000b2' });
  const later = await checkInOn('2026-10-07', '2026-10-07T12:00:00Z');
  const earlier = await checkInOn('2026-10-05', '2026-10-05T12:00:00Z');

  const small = await report(sessions.reception, '?from=2026-10-01&to=2026-10-07');
  expect(small.items.map((item) => item.id)).toEqual([later, larger, smaller, earlier]);

  // 120 no período, com empates de três em três, inseridas fora de ordem
  await stack.query('delete from check_ins');
  for (const student of [await newStudent(), await newStudent(), await newStudent(), await newStudent()]) {
    await manyCheckIns(student, 30, '2026-09-01', (index) => new Date(Date.UTC(2026, 8, 30, 12) - Math.floor(index / 3) * 3_600_000).toISOString());
  }
  const first = await report(sessions.reception, '?from=2026-09-01&to=2026-09-30');
  expect(first.items).toHaveLength(50);
  const walked = await walk((cursor) => report(sessions.reception, `?from=2026-09-01&to=2026-09-30${cursor ? `&cursor=${cursor}` : ''}`));
  expect(walked).toHaveLength(120);
  expect(walked).toEqual(await expectedOrder());
});

test('report_bad_dates_422_on_their_path_and_leap_day_200', async () => {
  for (const param of ['from', 'to'] as const) {
    for (const bad of ['2026-02-29', '2026-13-01', '2026-10-7', 'abc']) {
      const response = await sessions.reception.get(`${REPORT_PATH}?${param}=${bad}`);

      expect(response.status, `${param}=${bad}`).toBe(422);
      expect((await problem(response.clone())).code, `${param}=${bad}`).toBe('validation_failed');
      expect(await fieldErrorPaths(response), `${param}=${bad}`).toEqual([param]);
    }
  }
  const leap = await report(sessions.reception, '?from=2024-02-29&to=2024-02-29');
  expect([leap.from, leap.to]).toEqual(['2024-02-29', '2024-02-29']);
});

test('report_from_after_to_422_on_to_and_equal_ends_200', async () => {
  for (const query of ['?from=2026-10-08&to=2026-10-07', '?from=2026-10-08']) {
    const response = await sessions.reception.get(`${REPORT_PATH}${query}`);

    expect(response.status, query).toBe(422);
    expect((await problem(response.clone())).code, query).toBe('validation_failed');
    expect(await fieldErrorPaths(response), query).toEqual(['to']);
  }
  const equal = await report(sessions.reception, '?from=2026-10-05&to=2026-10-05');
  expect([equal.from, equal.to]).toEqual(['2026-10-05', '2026-10-05']);
});

test('report_366_days_200_and_367_days_422_on_from', async () => {
  for (const query of ['?from=2025-10-07&to=2026-10-07', '?from=2023-03-01&to=2024-02-29']) {
    expect((await sessions.reception.get(`${REPORT_PATH}${query}`)).status, query).toBe(200);
  }
  const response = await sessions.reception.get(`${REPORT_PATH}?from=2025-10-06&to=2026-10-07`);
  expect(response.status).toBe(422);
  expect((await problem(response.clone())).code).toBe('validation_failed');
  expect(await fieldErrorPaths(response)).toEqual(['from']);
});

test('report_empty_period_total_zero', async () => {
  await checkInOn('2026-10-07');

  const body = await report(sessions.reception, '?from=2026-09-01&to=2026-09-30');

  expect(body.total).toBe(0);
  expect(body.items).toEqual([]);
  expect(body.nextCursor).toBeNull();
});

test('report_403_for_hr_finance_and_instructor_and_401_anonymous', async () => {
  for (const [label, client, status, code] of [
    ['hr_finance', sessions.hr_finance, 403, 'forbidden'],
    ['instructor', sessions.instructor, 403, 'forbidden'],
    ['sem sessão', stack.client(), 401, 'unauthorized'],
  ] as const) {
    const response = await client.get(REPORT_PATH);

    expect(response.status, label).toBe(status);
    expect((await problem(response)).code, label).toBe(code);
  }
});

test('report_cursor_never_issued_422_and_reused_cursor_repeats_nothing', async () => {
  for (const cursor of ['abc', unknownId()]) {
    const response = await sessions.reception.get(`${REPORT_PATH}?cursor=${cursor}`);

    expect(response.status, cursor).toBe(422);
    expect((await problem(response.clone())).code, cursor).toBe('validation_failed');
    expect(await fieldErrorPaths(response), cursor).toEqual(['cursor']);
  }

  // 70 presenças de 2026-10-01 a 2026-10-07, dez por dia, de dez alunos
  for (let student = 0; student < 10; student += 1) {
    const studentId = await newStudent();
    await manyCheckIns(studentId, 7, '2026-10-01', (index) => new Date(Date.UTC(2026, 9, 1, 12 + student) + index * 86_400_000).toISOString());
  }
  const wide = await report(sessions.reception, '?from=2026-10-01&to=2026-10-07');
  expect(wide.items).toHaveLength(50);
  const delivered = new Set(wide.items.map((item) => item.id));

  const narrow = await report(sessions.reception, `?from=2026-10-01&to=2026-10-03&cursor=${wide.nextCursor}`);
  expect(narrow.items.length).toBeGreaterThan(0);
  for (const item of narrow.items) expect(delivered.has(item.id), item.id).toBe(false);
});

test('report_default_period_turns_at_sao_paulo_midnight', async () => {
  const seventh = await checkInOn('2026-10-07', '2026-10-07T23:00:00Z');

  const before = await report(await sessionAt(stack, BEFORE_TURN));
  expect([before.from, before.to]).toEqual(['2026-10-07', '2026-10-07']);
  expect(before.items.map((item) => item.id)).toEqual([seventh]);

  const after = await report(await sessionAt(stack, AFTER_TURN));
  expect([after.from, after.to]).toEqual(['2026-10-08', '2026-10-08']);
  expect(after.items).toEqual([]);
});

test('history_and_report_reads_write_no_row', async () => {
  const studentId = await newStudent();
  await insertCheckIn(stack, { studentId, day: '2026-10-07', checkedInBy: author.id });

  for (const role of ['admin', 'reception'] as const) {
    for (const path of [checkInsPath(studentId), REPORT_PATH, `${REPORT_PATH}?from=2026-10-01&to=2026-10-07`]) {
      const before = await checkInSnapshot(stack);

      const response = await sessions[role].get(path);

      expect(response.status, `${role}, ${path}`).toBe(200);
      expect(await checkInSnapshot(stack), `${role}, ${path}`).toEqual(before);
    }
  }
});

test('four_check_in_routes_mounted_in_the_test_harness', async () => {
  const studentId = await newStudent();
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
  await insertEnrollment(stack, { studentId, planId, startsAt: '2026-10-01', endsAt: '2026-10-31' });

  const answers: Array<[route: string, send: () => Promise<Response>, status: number]> = [
    ['GET /api/students/:id/check-in-status', () => sessions.reception.get(statusPath(studentId)), 200],
    ['POST /api/students/:id/check-ins', () => sessions.reception.post(checkInsPath(studentId)), 201],
    ['GET /api/students/:id/check-ins', () => sessions.reception.get(checkInsPath(studentId)), 200],
    ['GET /api/check-ins', () => sessions.reception.get(REPORT_PATH), 200],
  ];
  for (const [route, send, status] of answers) expect((await send()).status, route).toBe(status);

  // e as quatro estão na lista de rotas registradas que o OpenAPI compara
  const registered = stack.api.routes().map(({ method, path }) => `${method} ${path}`);
  for (const [route] of answers) expect(registered, route).toContain(route);
});
