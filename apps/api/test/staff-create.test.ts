import type { Role, Staff } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import type { Client } from './support/client.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { FICHA_KEYS, createStaff, staffBody, fullStaffBody, staffCount, staffRow, staffRowText } from './support/staff.ts';
import { cpfOf, createStudent, fieldErrorPaths, maskCpf, releasedTogether, studentBody, studentRowText } from './support/students.ts';

let stack: Stack;
let hrFinance: Client;
let counter = 2000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  hrFinance = (await stack.session('hr_finance')).client;
}, 180_000);

afterEach(() => vi.useRealTimers());
afterAll(() => stack?.close());

const idOfCpf = async (cpf: string) =>
  (await stack.query<{ id: string }>('select id from staff where cpf = $1', [cpf]))[0]?.id;

test('create_201_by_admin_and_hr_finance_with_the_eleven_keys', async () => {
  for (const role of ['admin', 'hr_finance'] as Role[]) {
    const { client } = await stack.session(role);
    const body = staffBody(next());

    const response = await client.post('/api/staff', body);
    const created = (await response.json()) as Staff;

    expect(response.status, role).toBe(201);
    expect(Object.keys(created).sort(), role).toEqual([...FICHA_KEYS].sort());
    expect(created.id, role).toBe(await idOfCpf(body.cpf));
    expect(created, role).toEqual({
      id: created.id,
      name: body.name,
      status: 'active',
      cpf: body.cpf,
      position: body.position,
      department: null,
      hiredAt: body.hiredAt,
      phone: body.phone,
      email: null,
      user: null,
      photoUrl: null,
    });
  }

  // com os dois opcionais, voltam preenchidos
  const full = fullStaffBody(next());
  const response = await hrFinance.post('/api/staff', full);
  const created = (await response.json()) as Staff;
  expect(response.status).toBe(201);
  expect(created.department).toBe(full.department);
  expect(created.email).toBe(full.email);
});

test('create_stores_and_returns_cpf_and_phone_as_digits', async () => {
  const masked = await hrFinance.post('/api/staff', staffBody(next(), { cpf: '529.982.247-25', phone: '(11) 91234-5678' }));
  const first = (await masked.json()) as Staff;

  expect(masked.status).toBe(201);
  expect(first).toMatchObject({ cpf: '52998224725', phone: '11912345678' });
  const stored = Object.values((await staffRow(stack, first.id))!);
  for (const digits of ['52998224725', '11912345678']) expect(stored).toContain(digits);
  for (const text of ['529.982.247-25', '(11) 91234-5678']) expect(stored).not.toContain(text);

  const plainCpf = cpfOf(next());
  const plain = await hrFinance.post('/api/staff', staffBody(next(), { cpf: plainCpf, phone: '(11) 1234-5678' }));
  const second = (await plain.json()) as Staff;
  expect(plain.status).toBe(201);
  expect(second.cpf).toBe(plainCpf);
  expect(second.phone).toBe('1112345678');
  expect(Object.values((await staffRow(stack, second.id))!)).toContain('1112345678');
});

test('create_cpf_five_refusals_422_and_check_digit_zero_accepted', async () => {
  const refused = ['529.982.24', '529.982.247-250', '111.111.111-11', '529.982.247-24', '529.982.247-26'];

  for (const cpf of refused) {
    const total = await staffCount(stack);

    const response = await hrFinance.post('/api/staff', staffBody(next(), { cpf }));

    expect(response.status, cpf).toBe(422);
    expect((await fieldErrorPaths(response)).filter((path) => path === 'cpf'), cpf).toHaveLength(1);
    expect(await staffCount(stack), cpf).toBe(total);
  }

  const response = await hrFinance.post('/api/staff', staffBody(next(), { cpf: '123.456.789-09' }));
  expect(response.status).toBe(201);
  expect(((await response.json()) as Staff).cpf).toBe('12345678909');
});

test('create_cpf_of_active_and_inactive_staff_409_cpf_taken', async () => {
  const cases: Array<[status: string, form: (cpf: string) => string]> = [
    ['active', (cpf) => cpf],
    ['inactive', (cpf) => cpf],
    ['active', maskCpf],
  ];

  for (const [status, form] of cases) {
    const n = next();
    const owner = await createStaff(hrFinance, staffBody(n));
    await stack.query('update staff set status = $2 where id = $1', [owner.id, status]);
    const total = await staffCount(stack);
    const before = await staffRowText(stack, owner.id);

    const response = await hrFinance.post('/api/staff', staffBody(next(), { cpf: form(cpfOf(n)) }));

    expect(response.status, `${status} ${form(cpfOf(n))}`).toBe(409);
    expect((await problem(response)).code, status).toBe('cpf_taken');
    expect(await staffCount(stack), status).toBe(total);
    expect(await staffRowText(stack, owner.id), status).toBe(before);
  }
});

test('two_simultaneous_creates_with_one_cpf_one_201_one_409', async () => {
  for (let round = 0; round < 10; round += 1) {
    const cpf = cpfOf(next());

    const responses = await releasedTogether([
      () => hrFinance.post('/api/staff', staffBody(next(), { cpf })),
      () => hrFinance.post('/api/staff', staffBody(next(), { cpf })),
    ]);

    expect(responses.map((response) => response.status).sort(), `rodada ${round}`).toEqual([201, 409]);
    const conflict = responses.find((response) => response.status === 409)!;
    expect((await problem(conflict)).code, `rodada ${round}`).toBe('cpf_taken');
    expect(Number((await stack.query<{ n: string }>('select count(*) as n from staff where cpf = $1', [cpf]))[0]!.n), `rodada ${round}`).toBe(1);
  }
});

test('create_with_a_students_cpf_201', async () => {
  const { client: reception } = await stack.session('reception');
  const student = await createStudent(reception, studentBody(next()));
  const before = await studentRowText(stack, student.id);

  const response = await hrFinance.post('/api/staff', staffBody(next(), { cpf: student.cpf }));

  expect(response.status).toBe(201);
  expect(((await response.json()) as Staff).cpf).toBe(student.cpf);
  expect(await studentRowText(stack, student.id)).toBe(before);
});

test('create_hired_at_ten_cases_around_today_in_sao_paulo', async () => {
  // 02:59:59 UTC de 6/10 ainda é dia 5 em São Paulo; a sessão dura 30 minutos e nasce já no relógio controlado
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-06T02:59:59Z') });
  const { client } = await stack.session('hr_finance');
  const refused = ['2026-02-30', '2026-13-01', '26-01-01', '01/02/2020', '1899-12-31'];

  for (const hiredAt of refused) {
    const total = await staffCount(stack);

    const response = await client.post('/api/staff', staffBody(next(), { hiredAt }));

    expect(response.status, hiredAt).toBe(422);
    expect((await fieldErrorPaths(response)).filter((path) => path === 'hiredAt'), hiredAt).toHaveLength(1);
    expect(await staffCount(stack), hiredAt).toBe(total);
  }

  const accepted = await client.post('/api/staff', staffBody(next(), { hiredAt: '1900-01-01' }));
  expect(accepted.status, '1900-01-01').toBe(201);

  // ainda dia 5: o dia 5 entra e o dia 6 é futuro
  expect((await client.post('/api/staff', staffBody(next(), { hiredAt: '2026-10-05' }))).status, '5/10 às 02:59:59Z').toBe(201);
  const tomorrow = await client.post('/api/staff', staffBody(next(), { hiredAt: '2026-10-06' }));
  expect(tomorrow.status, '6/10 às 02:59:59Z').toBe(422);
  expect(await fieldErrorPaths(tomorrow)).toContain('hiredAt');

  // 03:00:00 UTC é a virada em São Paulo: o dia 6 passa a ser hoje e o dia 7 é futuro
  vi.setSystemTime(new Date('2026-10-06T03:00:00Z'));
  expect((await client.post('/api/staff', staffBody(next(), { hiredAt: '2026-10-06' }))).status, '6/10 às 03:00:00Z').toBe(201);
  const dayAfter = await client.post('/api/staff', staffBody(next(), { hiredAt: '2026-10-07' }));
  expect(dayAfter.status, '7/10 às 03:00:00Z').toBe(422);
  expect(await fieldErrorPaths(dayAfter)).toContain('hiredAt');
});

test('create_text_digits_and_missing_fields_table_422_with_field_path', async () => {
  const email = (lastLabel: number) => `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(lastLabel)}.com`;
  expect(email(57)).toHaveLength(254);
  expect(email(58)).toHaveLength(255);
  const accented = (length: number) => `é${'a'.repeat(length - 1)}`;
  const refused: Array<[field: string, label: string, value: unknown]> = [
    ['name', 'ausente', undefined],
    ['cpf', 'ausente', undefined],
    ['position', 'ausente', undefined],
    ['hiredAt', 'ausente', undefined],
    ['phone', 'ausente', undefined],
    ['name', 'vazio', ''],
    ['name', 'só espaços', '   '],
    ['position', 'vazio', ''],
    ['name', '121', accented(121)],
    ['position', '81', accented(81)],
    ['department', '81', accented(81)],
    ['email', 'sem arroba', 'sem-arroba'],
    ['email', '255', email(58)],
    ['phone', '9 dígitos', '119123456'],
    ['phone', '9 dígitos com máscara', '(11) 9123-456'],
    ['phone', '12 dígitos', '119123456789'],
    ['phone', '12 dígitos com máscara', '(11) 91234-56789'],
    ['name', 'U+0000', 'Fun\u0000cionária'],
    ['position', 'U+0000', 'Recep\u0000cionista'],
    ['department', 'U+0000', 'Atend\u0000imento'],
    ['email', 'U+0000', 'a\u0000b@exemplo.com'],
  ];
  const accepted: Array<[field: string, label: string, value: unknown]> = [
    ['name', '120', accented(120)],
    ['position', '80', accented(80)],
    ['department', '80', accented(80)],
    ['email', '254', email(57)],
    ['phone', '10 dígitos', '1112345678'],
    ['phone', '11 dígitos', '11912345678'],
  ];

  for (const [field, label, value] of refused) {
    const total = await staffCount(stack);

    const response = await hrFinance.post('/api/staff', staffBody(next(), { [field]: value }));

    expect(response.status, `${field} ${label}`).toBe(422);
    expect(await fieldErrorPaths(response), `${field} ${label}`).toContain(field);
    expect(await staffCount(stack), `${field} ${label}`).toBe(total);
  }
  for (const [field, label, value] of accepted) {
    const response = await hrFinance.post('/api/staff', staffBody(next(), { [field]: value }));

    expect(response.status, `${field} ${label}`).toBe(201);
  }
});
