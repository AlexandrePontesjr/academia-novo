import type { Problem, Role, Student } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { auditCount, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import {
  allGuardianRows,
  createAdult,
  createMinorWithGuardian,
  GUARDIAN,
  guardianBody,
  guardianCount,
  guardianRows,
  insertLegacyMinor,
  minorBirthDate,
} from './support/consents.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import {
  cpfOf,
  fieldErrorPaths,
  maskCpf,
  releasedTogether,
  studentBody,
  studentCount,
  studentRow,
  studentRowText,
} from './support/students.ts';

let stack: Stack;
let reception: Client;
let counter = 3000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  reception = (await stack.session('reception')).client;
}, 180_000);

afterEach(() => vi.useRealTimers());
afterAll(() => stack?.close());

/** Os `errors` de um `422`, inteiros. */
const errorsOf = async (response: Response) => ((await response.json()) as Problem).errors ?? [];

test('post_minor_boundary_follows_the_sao_paulo_day', async () => {
  // 02:30 UTC de 5/10 são 23:30 de 4/10 em São Paulo, e já dia 5 em UTC
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-04T23:30:00-03:00') });
  // a sessão dura 30 minutos: a deste teste nasce já no relógio controlado
  const { client } = await stack.session('reception');

  const adultToday = await client.post('/api/students', studentBody(next(), { birthDate: '2008-10-04' }));
  expect(adultToday.status, 'faz 18 anos hoje').toBe(201);

  const total = await studentCount(stack);
  const minorTomorrow = await client.post('/api/students', studentBody(next(), { birthDate: '2008-10-05' }));
  expect(minorTomorrow.status, 'faz 18 anos amanhã').toBe(422);
  expect(await fieldErrorPaths(minorTomorrow)).toEqual(['guardian']);
  expect(await studentCount(stack)).toBe(total);
});

test('create_201_stores_guardian_as_digits_and_two_audit_rows', async () => {
  for (const role of ['admin', 'reception'] as Role[]) {
    const { client } = await stack.session(role);
    const body = studentBody(next(), { birthDate: minorBirthDate(), guardian: guardianBody() });

    const { result: response, rows } = await written(stack, () => client.post('/api/students', body));
    const created = (await response.json()) as Student;

    expect(response.status, role).toBe(201);
    const stored = await guardianRows(stack, created.id);
    expect(stored, role).toHaveLength(1);
    const values = Object.values(JSON.parse(stored[0]!) as Record<string, unknown>);
    for (const expected of [created.id, 'Ana Souza', '52998224725', '11912345678', 'mother']) {
      expect(values, `${role} ${expected}`).toContain(expected);
    }
    for (const masked of ['529.982.247-25', '(11) 91234-5678']) expect(values, `${role} ${masked}`).not.toContain(masked);
    expect(rows.filter((row) => row.action === 'student.created'), role).toHaveLength(1);
    expect(rows.filter((row) => row.action === 'student.guardian_saved'), role).toHaveLength(1);
    expect(rows, role).toHaveLength(2);
  }
});

test('create_minor_without_guardian_422_creates_nothing', async () => {
  const students = await studentCount(stack);
  const guardians = await guardianCount(stack);

  const response = await reception.post('/api/students', studentBody(next(), { birthDate: minorBirthDate() }));

  expect(response.status).toBe(422);
  const errors = await errorsOf(response);
  expect(errors).toHaveLength(1);
  expect(errors[0]!.path).toBe('guardian');
  expect(await studentCount(stack)).toBe(students);
  expect(await guardianCount(stack)).toBe(guardians);
});

test('guardian_fields_422_on_dotted_path_both_bounds', async () => {
  const accented = (length: number) => `á${'a'.repeat(length - 1)}`;
  const refused: Array<[field: string, label: string, guardian: Record<string, unknown>]> = [
    ['name', 'ausente', Object.fromEntries(Object.entries(guardianBody()).filter(([key]) => key !== 'name'))],
    ['name', 'só espaços', guardianBody({ name: '   ' })],
    ['name', '121', guardianBody({ name: accented(121) })],
    ['cpf', '10 dígitos', guardianBody({ cpf: '5299822472' })],
    ['cpf', '12 dígitos', guardianBody({ cpf: '529982247251' })],
    ['cpf', 'dígitos repetidos', guardianBody({ cpf: '111.111.111-11' })],
    ['cpf', 'dígito verificador', guardianBody({ cpf: '529.982.247-15' })],
    ['phone', '9 dígitos', guardianBody({ phone: '119123456' })],
    ['phone', '12 dígitos', guardianBody({ phone: '119123456789' })],
    ['relationship', 'uncle', guardianBody({ relationship: 'uncle' })],
    ['relationship', 'Mãe', guardianBody({ relationship: 'Mãe' })],
    ['relationship', 'vazio', guardianBody({ relationship: '' })],
  ];
  for (const [field, label, guardian] of refused) {
    const students = await studentCount(stack);

    const response = await reception.post('/api/students', studentBody(next(), { birthDate: minorBirthDate(), guardian }));

    expect(response.status, `${field} ${label}`).toBe(422);
    const errors = await errorsOf(response);
    expect(errors, `${field} ${label}`).toHaveLength(1);
    expect(errors[0]!.path, `${field} ${label}`).toBe(`guardian.${field}`);
    expect(await studentCount(stack), `${field} ${label}`).toBe(students);
  }

  const accepted: Array<[string, Record<string, unknown>]> = [
    ['name 120', guardianBody({ name: accented(120) })],
    ['cpf mascarado', guardianBody({ cpf: '529.982.247-25' })],
    ['cpf sem máscara', guardianBody({ cpf: '52998224725' })],
    ['phone 10', guardianBody({ phone: '1112345678' })],
    ['phone 11', guardianBody({ phone: '11912345678' })],
    ...['mother', 'father', 'legal_guardian', 'other'].map(
      (relationship): [string, Record<string, unknown>] => [`relationship ${relationship}`, guardianBody({ relationship })],
    ),
  ];
  for (const [label, guardian] of accepted) {
    const response = await reception.post('/api/students', studentBody(next(), { birthDate: minorBirthDate(), guardian }));

    expect(response.status, label).toBe(201);
  }
});

test('guardian_cpf_equal_to_student_cpf_422', async () => {
  const guardians = await guardianCount(stack);
  for (const form of [(cpf: string) => cpf, maskCpf]) {
    const n = next();
    const response = await reception.post(
      '/api/students',
      studentBody(n, { birthDate: minorBirthDate(), guardian: guardianBody({ cpf: form(cpfOf(n)) }) }),
    );

    expect(response.status, form(cpfOf(n))).toBe(422);
    const errors = await errorsOf(response);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe('guardian.cpf');
  }
  expect(await guardianCount(stack)).toBe(guardians);

  const student = await createAdult(reception, next());
  const before = await studentRowText(stack, student.id);
  // o cpf gravado do aluno, com o corpo sem `cpf`
  const stored = await reception.patch(`/api/students/${student.id}`, { guardian: guardianBody({ cpf: student.cpf }) });
  expect(stored.status, 'PATCH com o cpf gravado').toBe(422);
  expect((await errorsOf(stored)).map((error) => error.path)).toEqual(['guardian.cpf']);
  // o cpf novo enviado no mesmo corpo
  const sent = await reception.patch(`/api/students/${student.id}`, {
    cpf: cpfOf(next()),
    guardian: guardianBody({ cpf: cpfOf(counter) }),
  });
  expect(sent.status, 'PATCH com o cpf novo').toBe(422);
  expect((await errorsOf(sent)).map((error) => error.path)).toEqual(['guardian.cpf']);
  expect(await studentRowText(stack, student.id)).toBe(before);
  expect(await guardianRows(stack, student.id)).toEqual([]);

  // o cpf de outro aluno não impede
  const other = await createAdult(reception, next());
  const accepted = await reception.post(
    '/api/students',
    studentBody(next(), { birthDate: minorBirthDate(), guardian: guardianBody({ cpf: other.cpf }) }),
  );
  expect(accepted.status).toBe(201);
});

test('create_adult_with_guardian_201_stores_it', async () => {
  const response = await reception.post(
    '/api/students',
    studentBody(next(), { birthDate: '2000-01-01', guardian: guardianBody() }),
  );
  const created = (await response.json()) as Student;

  expect(response.status).toBe(201);
  expect(await guardianRows(stack, created.id)).toHaveLength(1);
});

test('patch_birth_date_of_minor_needs_a_stored_or_sent_guardian', async () => {
  // adulto sem responsável gravado, sem `guardian` no corpo
  const adult = await createAdult(reception, next());
  const before = await studentRowText(stack, adult.id);
  const refused = await reception.patch(`/api/students/${adult.id}`, { birthDate: minorBirthDate() });
  expect(refused.status).toBe(422);
  expect((await errorsOf(refused)).map((error) => error.path)).toEqual(['guardian']);
  expect(await studentRowText(stack, adult.id)).toBe(before);

  // no mesmo corpo com `guardian`
  const sent = await reception.patch(`/api/students/${adult.id}`, { birthDate: minorBirthDate(), guardian: guardianBody() });
  expect(sent.status).toBe(200);
  expect(await guardianRows(stack, adult.id)).toHaveLength(1);

  // menor que já tem responsável gravado
  const minor = await createMinorWithGuardian(reception, next());
  const withStored = await reception.patch(`/api/students/${minor.id}`, { birthDate: minorBirthDate() });
  expect(withStored.status, 'menor com responsável gravado').toBe(200);

  // menor legado, com o mesmo `birthDate` reenviado
  const legacy = await insertLegacyMinor(stack, next());
  const legacyBefore = await studentRowText(stack, legacy);
  const resent = await reception.patch(`/api/students/${legacy}`, { birthDate: minorBirthDate() });
  expect(resent.status, 'menor legado').toBe(422);
  expect((await errorsOf(resent)).map((error) => error.path)).toEqual(['guardian']);
  expect(await studentRowText(stack, legacy)).toBe(legacyBefore);

  // `birthDate` de adulto, num aluno sem responsável
  const another = await createAdult(reception, next());
  const adultDate = await reception.patch(`/api/students/${another.id}`, { birthDate: '1990-11-30' });
  expect(adultDate.status, 'birthDate de adulto').toBe(200);
});

test('patch_guardian_inserts_new_row_and_keeps_the_old', async () => {
  const minor = await createMinorWithGuardian(reception, next());
  const [first] = await guardianRows(stack, minor.id);

  const { result: response, rows } = await written(stack, () =>
    reception.patch(`/api/students/${minor.id}`, {
      name: minor.name,
      phone: minor.phone,
      guardian: guardianBody({ phone: '(11) 98888-7777' }),
    }),
  );

  expect(response.status).toBe(200);
  const stored = await guardianRows(stack, minor.id);
  expect(stored).toHaveLength(2);
  expect(stored[0]).toBe(first);
  expect(rows.map((row) => row.action)).toEqual(['student.guardian_saved']);

  // aluno sem responsável gravado: de zero para uma linha
  const adult = await createAdult(reception, next());
  const added = await reception.patch(`/api/students/${adult.id}`, { guardian: guardianBody() });
  expect(added.status).toBe(200);
  expect(await guardianRows(stack, adult.id)).toHaveLength(1);
});

test('patch_same_guardian_inserts_nothing', async () => {
  const minor = await createMinorWithGuardian(reception, next());
  const guardians = await guardianCount(stack);
  const logs = await auditCount(stack);

  const response = await reception.patch(`/api/students/${minor.id}`, {
    guardian: { name: '  Ana Souza  ', cpf: '529.982.247-25', phone: '(11) 91234-5678', relationship: 'mother' },
  });

  expect(response.status).toBe(200);
  expect(await guardianCount(stack)).toBe(guardians);
  expect(await auditCount(stack)).toBe(logs);
});

test('patch_without_birth_date_on_legacy_minor_200', async () => {
  const legacy = await insertLegacyMinor(stack, next());

  const response = await reception.patch(`/api/students/${legacy}`, { phone: '11977776666' });

  expect(response.status).toBe(200);
  expect(Object.values((await studentRow(stack, legacy))!)).toContain('11977776666');
});

test('patch_guardian_null_or_incomplete_422', async () => {
  const minor = await createMinorWithGuardian(reception, next());
  const before = await studentRowText(stack, minor.id);
  const guardians = await guardianCount(stack);
  const without = (field: string) => Object.fromEntries(Object.entries(GUARDIAN).filter(([key]) => key !== field));

  const cases: Array<[string, unknown, string]> = [
    ['null', null, 'guardian'],
    ...['name', 'cpf', 'phone', 'relationship'].map((field): [string, unknown, string] => [
      `sem ${field}`,
      without(field),
      `guardian.${field}`,
    ]),
  ];
  for (const [label, guardian, path] of cases) {
    const response = await reception.patch(`/api/students/${minor.id}`, { guardian });

    expect(response.status, label).toBe(422);
    const errors = await errorsOf(response);
    expect(errors, label).toHaveLength(1);
    expect(errors[0]!.path, label).toBe(path);
  }
  expect(await studentRowText(stack, minor.id)).toBe(before);
  expect(await guardianCount(stack)).toBe(guardians);
});

test('rejected_student_writes_leave_guardians_untouched', async () => {
  const taken = await createAdult(reception, next());
  const target = await createAdult(reception, next());
  const before = await allGuardianRows(stack);
  const guardian = guardianBody();

  const duplicate = await reception.post('/api/students', studentBody(next(), { cpf: taken.cpf, guardian }));
  expect(duplicate.status, 'POST cpf repetido').toBe(409);
  expect((await problem(duplicate)).code).toBe('cpf_taken');

  const shortPhone = await reception.post('/api/students', studentBody(next(), { phone: '119123456', guardian }));
  expect(shortPhone.status, 'POST phone de 9 dígitos').toBe(422);

  const patchTaken = await reception.patch(`/api/students/${target.id}`, { cpf: taken.cpf, guardian });
  expect(patchTaken.status, 'PATCH cpf de outro aluno').toBe(409);

  const patchShort = await reception.patch(`/api/students/${target.id}`, { phone: '119123456', guardian });
  expect(patchShort.status, 'PATCH phone de 9 dígitos').toBe(422);

  expect(await allGuardianRows(stack)).toEqual(before);
});

test('ten_concurrent_patches_with_same_guardian_insert_one_row', async () => {
  const student = await createAdult(reception, next());

  for (let round = 0; round < 10; round += 1) {
    const guardian = guardianBody({ phone: `1190000${String(round).padStart(4, '0')}` });
    const before = (await guardianRows(stack, student.id)).length;

    const { result: responses, rows } = await written(stack, () =>
      releasedTogether([
        () => reception.patch(`/api/students/${student.id}`, { guardian }),
        () => reception.patch(`/api/students/${student.id}`, { guardian }),
      ]),
    );

    expect(responses.map((response) => response.status), `rodada ${round}`).toEqual([200, 200]);
    expect((await guardianRows(stack, student.id)).length, `rodada ${round}`).toBe(before + 1);
    expect(rows.filter((row) => row.action === 'student.guardian_saved'), `rodada ${round}`).toHaveLength(1);
  }
});

test('ten_concurrent_patches_with_different_guardians_insert_two_rows', async () => {
  const student = await createAdult(reception, next());

  for (let round = 0; round < 10; round += 1) {
    const suffix = String(round).padStart(2, '0');
    const first = guardianBody({ name: `Ana ${suffix}`, phone: `11911110${suffix}0` });
    const second = guardianBody({ name: `Bia ${suffix}`, phone: `11922220${suffix}0`, relationship: 'father' });
    const before = (await guardianRows(stack, student.id)).length;

    const responses = await releasedTogether([
      () => reception.patch(`/api/students/${student.id}`, { guardian: first }),
      () => reception.patch(`/api/students/${student.id}`, { guardian: second }),
    ]);

    expect(responses.map((response) => response.status), `rodada ${round}`).toEqual([200, 200]);
    expect((await guardianRows(stack, student.id)).length, `rodada ${round}`).toBe(before + 2);
    const ficha = (await (await reception.get(`/api/students/${student.id}/consents`)).json()) as {
      guardian: { name: string; phone: string; relationship: string };
    };
    // o atual é um dos dois inteiros, nunca um misto dos campos
    const whole = [first, second].map(({ name, phone, relationship }) => ({ name, phone, relationship }));
    const { name, phone, relationship } = ficha.guardian;
    expect(whole, `rodada ${round}`).toContainEqual({ name, phone, relationship });
  }
});
