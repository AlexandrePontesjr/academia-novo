import type { Role, Student } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Client } from './support/client.ts';
import { insertConvertedLead, insertLead, leadRow, leadRowText } from './support/leads.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { cpfOf, createStudent, releasedTogether, studentBody, studentCount, unknownId } from './support/students.ts';

let stack: Stack;
const sessions = {} as Record<Role, Client>;
let counter = 81_000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  for (const role of ['admin', 'reception', 'hr_finance'] as Role[]) sessions[role] = (await stack.session(role)).client;
}, 180_000);

afterAll(() => stack?.close());

const STUDENT_KEYS = [
  'id',
  'name',
  'cpf',
  'birthDate',
  'sex',
  'email',
  'phone',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
  'healthNotes',
  'status',
];

test('create_student_with_lead_id_converts_new_and_contacted', async () => {
  for (const role of ['admin', 'reception'] as Role[]) {
    for (const status of ['new', 'contacted']) {
      const leadId = await insertLead(stack, { status });

      const response = await sessions[role].post('/api/students', studentBody(next(), { leadId }));

      expect(response.status, `${role} ${status}`).toBe(201);
      const student = (await response.json()) as Student;
      const lead = await leadRow(stack, leadId);
      expect(lead, `${role} ${status}`).toMatchObject({ status: 'converted', student_id: student.id });
    }
  }
});

test('lead_id_converted_discarded_409_and_unknown_422', async () => {
  const converted = (await insertConvertedLead(stack)).id;
  const discarded = await insertLead(stack, { status: 'discarded' });
  for (const leadId of [converted, discarded]) {
    const before = await leadRowText(stack, leadId);
    const students = await studentCount(stack);

    const response = await sessions.admin.post('/api/students', studentBody(next(), { leadId }));

    expect(response.status).toBe(409);
    expect((await problem(response)).code).toBe('lead_converted');
    expect(await studentCount(stack)).toBe(students);
    expect(await leadRowText(stack, leadId)).toBe(before);
  }

  for (const leadId of ['abc', unknownId()]) {
    const students = await studentCount(stack);
    const response = await sessions.admin.post('/api/students', studentBody(next(), { leadId }));
    expect(response.status, leadId).toBe(422);
    expect((await problem(response)).errors?.map((error) => error.path), leadId).toEqual(['leadId']);
    expect(await studentCount(stack)).toBe(students);
  }
});

test('two_concurrent_conversions_one_student', async () => {
  const leadId = await insertLead(stack);
  const students = await studentCount(stack);

  const responses = await releasedTogether([
    () => sessions.admin.post('/api/students', studentBody(next(), { leadId })),
    () => sessions.reception.post('/api/students', studentBody(next(), { leadId })),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  const conflict = responses.find((response) => response.status === 409)!;
  expect((await problem(conflict)).code).toBe('lead_converted');
  expect(await studentCount(stack)).toBe(students + 1);
});

test('student_insert_failure_leaves_lead_open', async () => {
  const taken = next();
  await createStudent(sessions.admin, studentBody(taken));
  const leadId = await insertLead(stack);

  const response = await sessions.admin.post('/api/students', studentBody(next(), { cpf: cpfOf(taken), leadId }));

  expect(response.status).toBe(409);
  expect((await problem(response)).code).toBe('cpf_taken');
  expect(await leadRow(stack, leadId)).toMatchObject({ status: 'new', student_id: null });
});

test('create_student_without_lead_id_unchanged', async () => {
  const leads = await stack.query<{ row: string }>('select to_jsonb(l)::text as row from leads l order by id');
  for (const role of ['admin', 'reception'] as Role[]) {
    const body = studentBody(next());
    const response = await sessions[role].post('/api/students', body);
    expect(response.status, role).toBe(201);
    const created = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(created).sort(), role).toEqual([...STUDENT_KEYS].sort());
    expect(created).not.toHaveProperty('leadId');
    expect(created).toMatchObject({ name: body.name, cpf: body.cpf, status: 'active' });
  }
  expect(await stack.query<{ row: string }>('select to_jsonb(l)::text as row from leads l order by id')).toEqual(leads);
});

test('reception_cannot_convert', async () => {
  // a recepção cria aluno e converte (corrigido pelo usuário em 2026-10-23); quem não cria aluno não converte
  const leadId = await insertLead(stack);
  const before = await leadRowText(stack, leadId);

  const response = await sessions.hr_finance.post('/api/students', studentBody(next(), { leadId }));

  expect(response.status).toBe(403);
  expect((await problem(response)).code).toBe('forbidden');
  expect(await leadRowText(stack, leadId)).toBe(before);
});
