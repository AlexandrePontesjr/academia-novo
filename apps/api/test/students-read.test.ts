import type { Problem, Role } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { type Stack, startStack } from './support/stack.ts';
import { createStudent, fullStudentBody, studentBody, unknownId } from './support/students.ts';

let stack: Stack;
const sessions = {} as Record<Role, Client>;
let studentId: string;

beforeAll(async () => {
  stack = await startStack();
  for (const role of ['admin', 'reception', 'hr_finance', 'instructor'] as Role[]) {
    sessions[role] = (await stack.session(role)).client;
  }
  studentId = (await createStudent(sessions.reception, fullStudentBody(3001))).id;
}, 180_000);

afterAll(() => stack?.close());

const keysOf = async (response: Response) => Object.keys((await response.json()) as object).sort();

test('ficha_twelve_keys_for_admin_and_reception', async () => {
  const expected = [
    'id',
    'name',
    'status',
    'cpf',
    'birthDate',
    'sex',
    'email',
    'phone',
    'address',
    'emergencyContactName',
    'emergencyContactPhone',
    'healthNotes',
    'photoUrl',
  ].sort();

  for (const role of ['admin', 'reception'] as Role[]) {
    const response = await sessions[role].get(`/api/students/${studentId}`);

    expect(response.status, role).toBe(200);
    expect(await keysOf(response), role).toEqual(expected);
  }
});

test('ficha_hr_finance_without_health_notes_key', async () => {
  const response = await sessions.hr_finance.get(`/api/students/${studentId}`);
  const body = (await response.json()) as Record<string, unknown>;

  expect(response.status).toBe(200);
  expect(Object.keys(body).sort()).toEqual(
    [
      'id',
      'name',
      'status',
      'cpf',
      'birthDate',
      'sex',
      'email',
      'phone',
      'address',
      'emergencyContactName',
      'emergencyContactPhone',
      'photoUrl',
    ].sort(),
  );
  expect('healthNotes' in body).toBe(false);
});

test('ficha_instructor_three_keys_only', async () => {
  const response = await sessions.instructor.get(`/api/students/${studentId}`);

  expect(response.status).toBe(200);
  expect(await keysOf(response)).toEqual(['id', 'name', 'photoUrl', 'status']);
});

test('ficha_404_for_non_uuid_and_unknown_uuid', async () => {
  for (const id of ['abc', unknownId()]) {
    const response = await sessions.reception.get(`/api/students/${id}`);

    expect(response.status, id).toBe(404);
    expect(((await response.json()) as Problem).code, id).toBe('not_found');
  }
});

test('reading_students_writes_no_audit_row', async () => {
  await createStudent(sessions.reception, studentBody(3002));
  let cases = 0;

  for (const role of ['admin', 'reception', 'hr_finance', 'instructor'] as Role[]) {
    for (const path of ['/api/students', `/api/students/${studentId}`]) {
      const before = await auditCount(stack);

      const response = await sessions[role].get(path);

      expect(response.status, `${role} ${path}`).toBe(200);
      expect(await auditCount(stack), `${role} ${path}`).toBe(before);
      cases += 1;
    }
  }
  expect(cases).toBe(8);
});
