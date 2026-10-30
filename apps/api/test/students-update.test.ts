import type { Problem, Role, Student } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Client } from './support/client.ts';
import type { Stack } from './support/stack.ts';
import { startStack } from './support/stack.ts';
import {
  createStudent,
  fieldErrorPaths,
  fullStudentBody,
  maskCpf,
  releasedTogether,
  setStatus,
  studentBody,
  studentCount,
  studentRow,
  studentRowText,
  unknownId,
} from './support/students.ts';

let stack: Stack;
let admin: Client;
let reception: Client;
let counter = 5000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  admin = (await stack.session('admin')).client;
  reception = (await stack.session('reception')).client;
}, 180_000);

afterAll(() => stack?.close());

const clients: Array<[Role, () => Client]> = [
  ['admin', () => admin],
  ['reception', () => reception],
];

const fetchStudent = async (id: string) => (await (await reception.get(`/api/students/${id}`)).json()) as Student;

test('patch_200_changes_only_sent_fields', async () => {
  const changes: Array<Record<string, unknown>> = [
    { phone: '11977776666' },
    { address: 'Avenida Nova, 900' },
    { name: 'Nome Corrigido', email: 'corrigido@exemplo.com' },
  ];

  for (const [role, client] of clients) {
    for (const change of changes) {
      const student = await createStudent(reception, fullStudentBody(next()));
      const before = await fetchStudent(student.id);

      const response = await client().patch(`/api/students/${student.id}`, change);

      expect(response.status, `${role} ${JSON.stringify(change)}`).toBe(200);
      // a ficha traz `photoUrl`, `portal` e `pendingPhoto`; a resposta do `PATCH` não (foto-pipeline e portal-aluno, Surface)
      const patched = Object.fromEntries(Object.entries(before).filter(([key]) => !['photoUrl', 'portal', 'pendingPhoto'].includes(key)));
      expect((await response.json()) as Student, `${role} ${JSON.stringify(change)}`).toEqual({ ...patched, ...change });
      expect(await fetchStudent(student.id)).toEqual({ ...before, ...change });
    }
  }
});

test('null_clears_five_optional_fields', async () => {
  const cases: Array<[label: string, body: Record<string, null>, cleared: string[]]> = [
    ['sex', { sex: null }, ['sex']],
    ['email', { email: null }, ['email']],
    ['address', { address: null }, ['address']],
    ['healthNotes', { healthNotes: null }, ['healthNotes']],
    [
      'par de contato',
      { emergencyContactName: null, emergencyContactPhone: null },
      ['emergencyContactName', 'emergencyContactPhone'],
    ],
  ];

  for (const [label, body, cleared] of cases) {
    const student = await createStudent(reception, fullStudentBody(next()));

    const response = await reception.patch(`/api/students/${student.id}`, body);
    const updated = (await response.json()) as Record<string, unknown>;

    expect(response.status, label).toBe(200);
    for (const field of cleared) expect(updated[field], `${label} ${field}`).toBeNull();
    if (label === 'healthNotes') {
      const stored = Object.values((await studentRow(stack, student.id))!);
      expect(stored.some((value) => typeof value === 'string' && value.startsWith('v1.'))).toBe(false);
    }
  }
});

test('patch_422_ten_cases_leave_row_unchanged', async () => {
  const student = await createStudent(reception, fullStudentBody(next()));
  const cases: Array<[field: string, body: Record<string, unknown>]> = [
    ['name', { name: null }],
    ['cpf', { cpf: null }],
    ['birthDate', { birthDate: null }],
    ['phone', { phone: null }],
    ['status', { status: null }],
    ['cpf', { cpf: '123.456.789-00' }],
    ['birthDate', { birthDate: '2999-01-01' }],
    ['phone', { phone: '119123456' }],
    ['name', { name: 'a'.repeat(121) }],
    ['healthNotes', { healthNotes: 'a'.repeat(2001) }],
  ];
  expect(cases).toHaveLength(10);
  const before = await studentRowText(stack, student.id);

  for (const [field, body] of cases) {
    const response = await reception.patch(`/api/students/${student.id}`, body);

    expect(response.status, JSON.stringify(body).slice(0, 40)).toBe(422);
    expect(await fieldErrorPaths(response), JSON.stringify(body).slice(0, 40)).toContain(field);
    expect(await studentRowText(stack, student.id)).toBe(before);
  }
});

test('email_change_follows_to_linked_user_or_409_email_in_use', async () => {
  const student = await createStudent(reception, studentBody(next(), { email: 'antes@example.com' }));
  await stack.query(
    `insert into users (name, email, role, student_id, active) values ('Aluno', 'antes@example.com', 'student', $1, true)`,
    [student.id],
  );
  const emails = async () =>
    (
      await stack.query<{ student: string; user: string }>(
        `select s.email as student, u.email as "user" from students s join users u on u.student_id = s.id where s.id = $1`,
        [student.id],
      )
    )[0];

  const changed = await reception.patch(`/api/students/${student.id}`, { email: 'Novo@Example.com' });

  expect(changed.status).toBe(200);
  expect(await emails()).toEqual({ student: 'novo@example.com', user: 'novo@example.com' });

  const instructor = await stack.seed({ role: 'instructor' });
  const before = await studentRowText(stack, student.id);
  const userBefore = await stack.query('select to_jsonb(u)::text as row from users u where student_id = $1', [student.id]);

  const taken = await reception.patch(`/api/students/${student.id}`, { email: instructor.email });

  expect(taken.status).toBe(409);
  expect(((await taken.json()) as Problem).code).toBe('email_in_use');
  expect(await studentRowText(stack, student.id)).toBe(before);
  expect(await stack.query('select to_jsonb(u)::text as row from users u where student_id = $1', [student.id])).toEqual(userBefore);

  const free = await createStudent(reception, studentBody(next(), { email: 'livre@example.com' }));
  const usersBefore = await stack.query('select to_jsonb(u)::text as row from users u order by id');
  const plain = await reception.patch(`/api/students/${free.id}`, { email: instructor.email });
  expect(plain.status).toBe(200);
  expect(((await plain.json()) as Student).email).toBe(instructor.email);
  expect(await stack.query('select to_jsonb(u)::text as row from users u order by id')).toEqual(usersBefore);
});

test('emergency_pair_rule_counts_stored_value', async () => {
  const withPair = await createStudent(reception, fullStudentBody(next()));
  const clearName = await reception.patch(`/api/students/${withPair.id}`, { emergencyContactName: null });
  expect(clearName.status).toBe(422);
  expect(await fieldErrorPaths(clearName)).toEqual(['emergencyContactName']);

  const withoutPair = await createStudent(reception, studentBody(next()));
  const onlyName = await reception.patch(`/api/students/${withoutPair.id}`, { emergencyContactName: 'Só o nome' });
  expect(onlyName.status).toBe(422);
  expect(await fieldErrorPaths(onlyName)).toEqual(['emergencyContactPhone']);

  const onlyPhone = await reception.patch(`/api/students/${withPair.id}`, { emergencyContactPhone: '1133334444' });
  expect(onlyPhone.status).toBe(200);
  expect(((await onlyPhone.json()) as Student).emergencyContactPhone).toBe('1133334444');
});

test('patch_cpf_of_another_409_own_cpf_200', async () => {
  const mine = await createStudent(reception, studentBody(next()));
  const active = await createStudent(reception, studentBody(next()));
  const inactive = await createStudent(reception, studentBody(next()));
  await setStatus(stack, inactive.id, 'inactive');
  const before = await studentRowText(stack, mine.id);

  for (const other of [active, inactive]) {
    const response = await reception.patch(`/api/students/${mine.id}`, { cpf: maskCpf(other.cpf!) });

    expect(response.status, other.id).toBe(409);
    expect(((await response.json()) as Problem).code).toBe('cpf_taken');
    expect(await studentRowText(stack, mine.id)).toBe(before);
  }
  for (const own of [mine.cpf!, maskCpf(mine.cpf!)]) {
    const response = await reception.patch(`/api/students/${mine.id}`, { cpf: own });

    expect(response.status, own).toBe(200);
    expect(((await response.json()) as Student).cpf).toBe(mine.cpf);
  }
});

test('patch_status_from_any_state_to_suspended_or_active', async () => {
  let cases = 0;
  for (const from of ['active', 'suspended', 'inactive']) {
    for (const to of ['suspended', 'active']) {
      const student = await createStudent(reception, studentBody(next()));
      await setStatus(stack, student.id, from);

      const response = await reception.patch(`/api/students/${student.id}`, { status: to });

      expect(response.status, `${from} -> ${to}`).toBe(200);
      expect(((await response.json()) as Student).status, `${from} -> ${to}`).toBe(to);
      expect((await fetchStudent(student.id)).status, `${from} -> ${to}`).toBe(to);
      cases += 1;
    }
  }
  expect(cases).toBe(6);
});

test('patch_inactive_422_and_nothing_applied', async () => {
  const student = await createStudent(reception, fullStudentBody(next()));
  const before = await studentRowText(stack, student.id);

  for (const body of [{ status: 'inactive' }, { status: 'inactive', name: 'Nome que não vale' }]) {
    const response = await reception.patch(`/api/students/${student.id}`, body);

    expect(response.status, JSON.stringify(body)).toBe(422);
    expect(await fieldErrorPaths(response), JSON.stringify(body)).toEqual(['status']);
    expect(await studentRowText(stack, student.id), JSON.stringify(body)).toBe(before);
  }
});

test('delete_204_inactivates_and_keeps_row', async () => {
  for (const [role, client] of clients) {
    for (const from of ['active', 'suspended']) {
      const student = await createStudent(reception, fullStudentBody(next()));
      await setStatus(stack, student.id, from);
      const before = await fetchStudent(student.id);
      const total = await studentCount(stack);

      const response = await client().delete(`/api/students/${student.id}`);

      expect(response.status, `${role} ${from}`).toBe(204);
      expect(await response.text(), `${role} ${from}`).toBe('');
      expect(await studentCount(stack), `${role} ${from}`).toBe(total);
      expect(await fetchStudent(student.id), `${role} ${from}`).toEqual({ ...before, status: 'inactive' });
    }
  }
});

test('delete_of_inactive_204_changes_nothing', async () => {
  const student = await createStudent(reception, fullStudentBody(next()));
  expect((await reception.delete(`/api/students/${student.id}`)).status).toBe(204);
  const before = await studentRowText(stack, student.id);

  const again = await reception.delete(`/api/students/${student.id}`);

  expect(again.status).toBe(204);
  expect(await studentRowText(stack, student.id)).toBe(before);
});

test('ten_concurrent_patches_keep_both_changes', async () => {
  for (let round = 0; round < 10; round += 1) {
    const student = await createStudent(reception, fullStudentBody(next()));
    const phone = `119${String(10_000_000 + round)}`;
    const address = `Rua da Rodada ${round}`;

    const responses = await releasedTogether([
      () => reception.patch(`/api/students/${student.id}`, { phone }),
      () => reception.patch(`/api/students/${student.id}`, { address }),
    ]);

    expect(responses.map((response) => response.status), `rodada ${round}`).toEqual([200, 200]);
    expect(await fetchStudent(student.id), `rodada ${round}`).toMatchObject({ phone, address });
  }
});

test('patch_and_delete_404_for_bad_and_unknown_id', async () => {
  let cases = 0;
  for (const id of ['abc', unknownId()]) {
    const patched = await reception.patch(`/api/students/${id}`, { phone: '11977776666' });
    const deleted = await reception.delete(`/api/students/${id}`);

    for (const [name, response] of [['PATCH', patched], ['DELETE', deleted]] as const) {
      expect(response.status, `${name} ${id}`).toBe(404);
      expect(((await response.json()) as Problem).code, `${name} ${id}`).toBe('not_found');
      cases += 1;
    }
  }
  expect(cases).toBe(4);
});

test('patch_with_uppercase_id_keeps_health_notes_readable', async () => {
  const student = await createStudent(reception, fullStudentBody(next()));

  const response = await reception.patch(`/api/students/${student.id.toUpperCase()}`, { healthNotes: 'Texto novo' });

  expect(response.status).toBe(200);
  expect((await fetchStudent(student.id)).healthNotes).toBe('Texto novo');
});

test('patch_null_clears_an_unreadable_health_notes_value', async () => {
  const student = await createStudent(reception, fullStudentBody(next()));
  await stack.query("update students set health_notes_enc = 'v1.lixo.lixo.lixo' where id = $1", [student.id]);

  const response = await reception.patch(`/api/students/${student.id}`, { healthNotes: null });

  expect(response.status).toBe(200);
  expect((await fetchStudent(student.id)).healthNotes).toBeNull();
});
