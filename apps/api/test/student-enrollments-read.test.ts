import type { EnrollmentsResponse, Role, Student, StudentsResponse } from '@academia/contracts';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { auditCount, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import {
  ENROLLMENT_KEYS,
  NOON,
  clockAt,
  enroll,
  enrollmentRowText,
  enrollmentRowsTextOfStudent,
  enrollmentsPath,
  insertPlan,
  listEnrollments,
} from './support/plans.ts';
import { type Stack, startStack } from './support/stack.ts';
import { cpfOf, insertStudents } from './support/students.ts';

let stack: Stack;
let admin: Client;
let hr: Client;
let reception: Client;
let instructor: Client;
let counter = 9000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  // as sessões nascem no relógio controlado, que não anda sozinho: valem enquanto o teste estiver nele
  clockAt(NOON);
  admin = (await stack.session('admin')).client;
  hr = (await stack.session('hr_finance')).client;
  reception = (await stack.session('reception')).client;
  instructor = (await stack.session('instructor')).client;
}, 180_000);

// salvo quando o caso diz outra coisa, hoje é 7 de outubro de 2026 em São Paulo
beforeEach(() => clockAt(NOON));

afterAll(async () => {
  vi.useRealTimers();
  await stack?.close();
});

const newStudent = async (name = `Aluno ${next()}`) => (await insertStudents(stack, [{ name, cpf: cpfOf(next()) }]))[0]!;

/** Move o relógio e abre, naquele instante, a sessão que as requisições seguintes usam. */
async function sessionAt(instant: string, role: Role = 'reception') {
  clockAt(instant);
  return (await stack.session(role)).client;
}

test('status_computed_on_read_four_values_across_sao_paulo_midnight_without_changing_the_row', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const studentId = await newStudent();
  const created = await enroll(hr, studentId, planId, '2026-10-07');
  expect([created.startsAt, created.endsAt]).toEqual(['2026-10-07', '2026-11-06']);
  // a virada do dia em São Paulo é às 03:00 UTC
  const instants: Array<[instant: string, status: string]> = [
    ['2026-10-07T02:59:59Z', 'scheduled'],
    ['2026-10-07T03:00:00Z', 'active'],
    ['2026-11-07T02:59:59Z', 'active'],
    ['2026-11-07T03:00:00Z', 'expired'],
  ];
  expect(instants).toHaveLength(4);
  const row = await enrollmentRowText(stack, created.id);

  for (const [instant, status] of instants) {
    const read = await listEnrollments(await sessionAt(instant), studentId);

    expect(read.map((item) => item.id), instant).toEqual([created.id]);
    expect(read[0]!.status, instant).toBe(status);
    // calculado, não atualizado por alguém: a linha é a mesma entre as quatro leituras
    expect(await enrollmentRowText(stack, created.id), instant).toBe(row);
  }

  expect((await (await sessionAt(NOON, 'hr_finance')).delete(`${enrollmentsPath(studentId)}/${created.id}`)).status).toBe(204);
  for (const [instant] of instants) {
    const read = await listEnrollments(await sessionAt(instant), studentId);

    expect(read.map((item) => item.status), `cancelada, ${instant}`).toEqual(['cancelled']);
  }
});

test('list_includes_cancelled_ordered_by_starts_at_desc_then_id_desc_same_body_for_three_roles', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const studentId = await newStudent();
  // registradas fora da ordem em que devem sair: a cancelada e a que a substituiu no mesmo período,
  // depois a mais distante e por último a do meio
  const cancelled = await enroll(hr, studentId, planId, '2026-10-07');
  expect((await hr.delete(`${enrollmentsPath(studentId)}/${cancelled.id}`)).status).toBe(204);
  const replacement = await enroll(hr, studentId, planId, '2026-10-07');
  const farthest = await enroll(hr, studentId, planId, '2026-12-07');
  const middle = await enroll(hr, studentId, planId, '2026-11-07');
  // entre as duas de mesmo `startsAt`, a registrada depois tem o `id` maior
  expect(replacement.id > cancelled.id).toBe(true);
  // a ordem esperada, escrita à mão: `startsAt` da mais recente para a mais antiga e, no empate, `id` maior primeiro
  const expected = [
    { id: farthest.id, startsAt: '2026-12-07', endsAt: '2027-01-06', status: 'scheduled' },
    { id: middle.id, startsAt: '2026-11-07', endsAt: '2026-12-06', status: 'scheduled' },
    { id: replacement.id, startsAt: '2026-10-07', endsAt: '2026-11-06', status: 'active' },
    { id: cancelled.id, startsAt: '2026-10-07', endsAt: '2026-11-06', status: 'cancelled' },
  ];
  expect(expected).toHaveLength(4);

  const bodies: string[] = [];
  for (const [role, client] of [
    ['admin', admin],
    ['hr_finance', hr],
    ['reception', reception],
  ] as const) {
    const response = await client.get(enrollmentsPath(studentId));
    const text = await response.text();
    const body = JSON.parse(text) as EnrollmentsResponse;

    expect(response.status, role).toBe(200);
    expect(Object.keys(body), role).toEqual(['items']);
    for (const item of body.items) {
      expect(Object.keys(item).sort(), `${role} ${item.id}`).toEqual([...ENROLLMENT_KEYS].sort());
      expect(item.plan, `${role} ${item.id}`).toEqual({ id: planId, name: 'Mensal', period: 'monthly' });
      expect(item.priceCents, `${role} ${item.id}`).toBe(9990);
    }
    expect(body.items.map(({ id, startsAt, endsAt, status }) => ({ id, startsAt, endsAt, status })), role).toEqual(expected);
    expect(body.items.map((item) => item.cancelledAt === null), role).toEqual([true, true, true, false]);
    bodies.push(text);
  }
  expect(bodies).toHaveLength(3);
  expect(new Set(bodies).size).toBe(1);
});

test('list_of_student_without_enrollment_200_empty', async () => {
  const studentId = await newStudent();

  const response = await reception.get(enrollmentsPath(studentId));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [] });
});

test('list_shows_current_plan_name_and_recorded_dates_and_price', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly', priceCents: 9990 });
  const studentId = await newStudent();
  const created = await enroll(hr, studentId, planId, '2026-10-07');
  expect(created.plan.name).toBe('Mensal');

  expect((await hr.patch(`/api/plans/${planId}`, { name: 'Mensal Plus', priceCents: 10_990 })).status).toBe(200);
  expect((await hr.delete(`/api/plans/${planId}`)).status).toBe(204);

  const read = await listEnrollments(reception, studentId);
  expect(read).toHaveLength(1);
  expect(read[0]!.plan).toEqual({ id: planId, name: 'Mensal Plus', period: 'monthly' });
  expect(read[0]!.startsAt).toBe('2026-10-07');
  expect(read[0]!.endsAt).toBe('2026-11-06');
  expect(read[0]!.priceCents).toBe(9990);
});

test('inactivating_the_student_keeps_enrollments_and_they_stay_readable', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const studentId = await newStudent();
  const active = await enroll(hr, studentId, planId, '2026-10-07');
  const scheduled = await enroll(hr, studentId, planId, '2026-11-07');
  const rowsBefore = await enrollmentRowsTextOfStudent(stack, studentId);
  expect(rowsBefore).toHaveLength(2);
  const readBefore = await listEnrollments(hr, studentId);
  expect(readBefore.map((item) => [item.id, item.status])).toEqual([
    [scheduled.id, 'scheduled'],
    [active.id, 'active'],
  ]);

  const response = await admin.delete(`/api/students/${studentId}`);

  expect(response.status).toBe(204);
  expect((await stack.query<{ status: string }>('select status from students where id = $1', [studentId]))[0]!.status).toBe('inactive');
  expect(await enrollmentRowsTextOfStudent(stack, studentId)).toEqual(rowsBefore);
  const read = await reception.get(enrollmentsPath(studentId));
  expect(read.status).toBe(200);
  const { items } = (await read.json()) as EnrollmentsResponse;
  expect(items.map((item) => [item.id, item.status, item.cancelledAt])).toEqual([
    [scheduled.id, 'scheduled', null],
    [active.id, 'active', null],
  ]);
});

test('six_reads_of_plans_and_enrollments_write_no_audit_row', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal' });
  const studentId = await newStudent();
  await enroll(hr, studentId, planId);
  let reads = 0;

  for (const [role, client] of [
    ['admin', admin],
    ['hr_finance', hr],
    ['reception', reception],
  ] as const) {
    for (const path of ['/api/plans', enrollmentsPath(studentId)]) {
      const before = await auditCount(stack);

      const response = await client.get(path);

      expect(response.status, `${role} ${path}`).toBe(200);
      expect(((await response.json()) as { items: unknown[] }).items.length, `${role} ${path}`).toBeGreaterThan(0);
      expect(await auditCount(stack), `${role} ${path}`).toBe(before);
      reads += 1;
    }
  }

  expect(reads).toBe(6);
});

test('student_routes_keep_their_keys_and_inactivation_writes_only_its_own_row', async () => {
  const planId = await insertPlan(stack, { name: 'Mensal', period: 'monthly' });
  const enrolled = await newStudent('Matriculada Comparada');
  const plain = await newStudent('Matriculada Comparada');
  await enroll(hr, enrolled, planId, '2026-10-07');
  await enroll(hr, enrolled, planId, '2026-11-07');
  expect(await enrollmentRowsTextOfStudent(stack, enrolled)).toHaveLength(2);
  expect(await enrollmentRowsTextOfStudent(stack, plain)).toEqual([]);

  const sessions = { admin, hr_finance: hr, reception, instructor };
  expect(Object.keys(sessions)).toHaveLength(4);
  for (const [role, client] of Object.entries(sessions)) {
    const ofEnrolled = await client.get(`/api/students/${enrolled}`);
    const ofPlain = await client.get(`/api/students/${plain}`);
    expect([ofEnrolled.status, ofPlain.status], role).toEqual([200, 200]);
    const enrolledKeys = Object.keys((await ofEnrolled.json()) as Student).sort();
    expect(enrolledKeys.length, role).toBeGreaterThan(0);
    expect(enrolledKeys, `${role} GET /api/students/:id`).toEqual(Object.keys((await ofPlain.json()) as Student).sort());

    const listed = await client.get(`/api/students?q=${encodeURIComponent('Matriculada Comparada')}`);
    expect(listed.status, role).toBe(200);
    const { items } = (await listed.json()) as StudentsResponse;
    const itemOfEnrolled = items.find((item) => item.id === enrolled);
    const itemOfPlain = items.find((item) => item.id === plain);
    expect(itemOfEnrolled, `${role} item do matriculado`).toBeDefined();
    expect(itemOfPlain, `${role} item do sem matrícula`).toBeDefined();
    expect(Object.keys(itemOfEnrolled!).sort(), `${role} GET /api/students`).toEqual(Object.keys(itemOfPlain!).sort());
  }

  const { result, rows } = await written(stack, () => admin.delete(`/api/students/${enrolled}`));

  expect(result.status).toBe(204);
  expect(rows.map((row) => row.action)).toEqual(['student.inactivated']);
  expect(rows[0]).toMatchObject({ entity: 'student', entity_id: enrolled });
  expect(rows.filter((row) => row.action === 'student.enrollment_cancelled')).toEqual([]);
});
