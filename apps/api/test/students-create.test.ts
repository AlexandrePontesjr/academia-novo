import type { Role, Student } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import type { Client } from './support/client.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import {
  cpfOf,
  createStudent,
  fieldErrorPaths,
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
let reception: Client;
let counter = 1000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  reception = (await stack.session('reception')).client;
}, 180_000);

afterEach(() => vi.useRealTimers());
afterAll(() => stack?.close());

const ALL_KEYS = [
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

test('create_201_by_admin_and_reception_with_nulls', async () => {
  for (const role of ['admin', 'reception'] as Role[]) {
    const { client } = await stack.session(role);
    const body = studentBody(next());

    const response = await client.post('/api/students', body);
    const created = (await response.json()) as Student;

    expect(response.status, role).toBe(201);
    expect(Object.keys(created).sort(), role).toEqual([...ALL_KEYS].sort());
    expect(created, role).toMatchObject({
      name: body.name,
      cpf: body.cpf,
      birthDate: '2000-01-01',
      phone: '11912345678',
      status: 'active',
      sex: null,
      email: null,
      address: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      healthNotes: null,
    });
    expect(created.id, role).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  }
});

test('cpf_and_phones_stored_and_returned_as_digits', async () => {
  const response = await reception.post(
    '/api/students',
    studentBody(next(), {
      cpf: '529.982.247-25',
      phone: '(11) 91234-5678',
      emergencyContactName: 'Contato',
      emergencyContactPhone: '(11) 1234-5678',
    }),
  );
  const created = (await response.json()) as Student;

  expect(response.status).toBe(201);
  expect(created).toMatchObject({ cpf: '52998224725', phone: '11912345678', emergencyContactPhone: '1112345678' });
  const stored = Object.values((await studentRow(stack, created.id))!);
  for (const digits of ['52998224725', '11912345678', '1112345678']) expect(stored).toContain(digits);
  for (const masked of ['529.982.247-25', '(11) 91234-5678', '(11) 1234-5678']) expect(stored).not.toContain(masked);
});

test('invalid_cpf_422_on_path_valid_cpf_201', async () => {
  const invalid = [
    '5299822472',
    '529982247251',
    ...Array.from({ length: 10 }, (_, digit) => {
      const eleven = String(digit).repeat(11);
      return `${eleven.slice(0, 3)}.${eleven.slice(3, 6)}.${eleven.slice(6, 9)}-${eleven.slice(9)}`;
    }),
    '529.982.247-15',
    '529.982.247-24',
    '5299822472a',
  ];
  expect(invalid).toHaveLength(15);

  for (const cpf of invalid) {
    const total = await studentCount(stack);

    const response = await reception.post('/api/students', studentBody(next(), { cpf }));

    expect(response.status, cpf).toBe(422);
    expect((await fieldErrorPaths(response)).filter((path) => path === 'cpf'), cpf).toHaveLength(1);
    expect(await studentCount(stack), cpf).toBe(total);
  }

  for (const cpf of ['529.982.247-25', '52998224725', '123.456.789-09']) {
    // o mesmo CPF volta a ser livre: o `201` de cada forma é provado sozinho
    await stack.query('delete from students');

    const response = await reception.post('/api/students', studentBody(next(), { cpf }));

    expect(response.status, cpf).toBe(201);
    expect(((await response.json()) as Student).cpf, cpf).toBe(cpf.replace(/\D/g, ''));
  }
});

test('duplicate_cpf_409_in_every_status', async () => {
  const cases: Array<[status: string, form: (cpf: string) => string]> = [
    ['active', (cpf) => cpf],
    ['suspended', (cpf) => cpf],
    ['inactive', (cpf) => cpf],
    ['active', maskCpf],
  ];

  for (const [status, form] of cases) {
    const n = next();
    const owner = await createStudent(reception, studentBody(n));
    await setStatus(stack, owner.id, status);
    const total = await studentCount(stack);

    const response = await reception.post('/api/students', studentBody(next(), { cpf: form(cpfOf(n)) }));

    expect(response.status, `${status} ${form(cpfOf(n))}`).toBe(409);
    expect((await problem(response)).code, status).toBe('cpf_taken');
    expect(await studentCount(stack), status).toBe(total);
  }
});

test('ten_concurrent_pairs_one_201_one_409', async () => {
  for (let round = 0; round < 10; round += 1) {
    const cpf = cpfOf(next());
    const total = await studentCount(stack);

    const responses = await releasedTogether([
      () => reception.post('/api/students', studentBody(next(), { cpf })),
      () => reception.post('/api/students', studentBody(next(), { cpf })),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses, `rodada ${round}`).toEqual([201, 409]);
    const conflict = responses.find((response) => response.status === 409)!;
    expect((await problem(conflict)).code).toBe('cpf_taken');
    expect(await studentCount(stack), `rodada ${round}`).toBe(total + 1);
  }
});

test('birth_date_bounds_in_sao_paulo', async () => {
  // 02:30 UTC de 5/10 são 23:30 de 4/10 em São Paulo: o dia de hoje de lá, e já amanhã em UTC
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T02:30:00Z') });
  // a sessão dura 30 minutos: a deste teste nasce já no relógio controlado
  const { client } = await stack.session('reception');
  const refused = ['2000-02-30', '31/12/2000', '2000-2-1', 'ontem', '2026-10-05', '1899-12-31'];
  const accepted = ['1900-01-01', '2026-10-04'];

  for (const birthDate of refused) {
    const total = await studentCount(stack);

    const response = await client.post('/api/students', studentBody(next(), { birthDate }));

    expect(response.status, birthDate).toBe(422);
    expect((await fieldErrorPaths(response)).filter((path) => path === 'birthDate'), birthDate).toHaveLength(1);
    expect(await studentCount(stack), birthDate).toBe(total);
  }
  for (const birthDate of accepted) {
    const response = await client.post('/api/students', studentBody(next(), { birthDate }));

    expect(response.status, birthDate).toBe(201);
    expect(((await response.json()) as Student).birthDate, birthDate).toBe(birthDate);
  }
});

test('phone_digit_bounds_on_both_fields', async () => {
  const formats: Record<number, string[]> = {
    9: ['119123456', '(11) 9123-456'],
    12: ['119123456789', '(11) 91234-56789'],
    10: ['1112345678', '(11) 1234-5678', '11 1234 5678'],
    11: ['11912345678', '(11) 91234-5678', '11 9 1234-5678'],
  };

  for (const field of ['phone', 'emergencyContactPhone']) {
    for (const [digits, values] of Object.entries(formats)) {
      for (const value of values) {
        const pair = field === 'phone' ? {} : { emergencyContactName: 'Contato' };
        const response = await reception.post('/api/students', studentBody(next(), { ...pair, [field]: value }));

        if (digits === '9' || digits === '12') {
          expect(response.status, `${field} ${value}`).toBe(422);
          expect(await fieldErrorPaths(response), `${field} ${value}`).toContain(field);
        } else {
          expect(response.status, `${field} ${value}`).toBe(201);
        }
      }
    }
  }
});

test('field_validation_both_bounds', async () => {
  const email = (lastLabel: number) => `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(lastLabel)}.com`;
  expect(email(57)).toHaveLength(254);
  expect(email(58)).toHaveLength(255);
  const accented = (length: number) => `á${'a'.repeat(length - 1)}`;
  const refused: Array<[field: string, label: string, value: unknown]> = [
    ['name', 'ausente', undefined],
    ['name', 'só espaços', '   '],
    ['name', '121', accented(121)],
    ['email', 'sem arroba', 'aluno.exemplo.com'],
    ['email', '255', email(58)],
    ['sex', 'x', 'x'],
    ['address', '201', accented(201)],
    ['emergencyContactName', '121', accented(121)],
    ['healthNotes', '2001', accented(2001)],
  ];
  const accepted: Array<[string, unknown]> = [
    ['name', accented(120)],
    ['email', email(57)],
    ['address', accented(200)],
    ['emergencyContactName', accented(120)],
    ['healthNotes', accented(2000)],
    ['sex', 'female'],
    ['sex', 'male'],
    ['sex', 'other'],
  ];

  for (const [field, label, value] of refused) {
    const total = await studentCount(stack);
    const pair = field === 'emergencyContactName' ? { emergencyContactPhone: '1112345678' } : {};

    const response = await reception.post('/api/students', studentBody(next(), { ...pair, [field]: value }));

    expect(response.status, `${field} ${label}`).toBe(422);
    expect(await fieldErrorPaths(response), `${field} ${label}`).toContain(field);
    expect(await studentCount(stack), `${field} ${label}`).toBe(total);
  }
  for (const [field, value] of accepted) {
    const pair = field === 'emergencyContactName' ? { emergencyContactPhone: '1112345678' } : {};

    const response = await reception.post('/api/students', studentBody(next(), { ...pair, [field]: value }));

    expect(response.status, `${field} ${String(value).slice(0, 12)}`).toBe(201);
    expect(((await response.json()) as Record<string, unknown>)[field], field).toBe(value);
  }
});

test('emergency_contact_pair_422_names_missing_field', async () => {
  const cases: Array<[label: string, extra: Record<string, unknown>, status: number, missing?: string]> = [
    ['só nome', { emergencyContactName: 'Contato' }, 422, 'emergencyContactPhone'],
    ['só telefone', { emergencyContactPhone: '1112345678' }, 422, 'emergencyContactName'],
    ['os dois', { emergencyContactName: 'Contato', emergencyContactPhone: '1112345678' }, 201],
    ['nenhum', {}, 201],
  ];

  for (const [label, extra, status, missing] of cases) {
    const response = await reception.post('/api/students', studentBody(next(), extra));

    expect(response.status, label).toBe(status);
    if (missing) expect(await fieldErrorPaths(response), label).toEqual([missing]);
  }
});

test('hr_finance_and_instructor_403_on_three_writes', async () => {
  const target = await createStudent(reception, studentBody(next()));

  for (const role of ['hr_finance', 'instructor'] as Role[]) {
    const { client } = await stack.session(role);
    const sends: Array<[name: string, send: () => Promise<Response>]> = [
      ['POST', () => client.post('/api/students', studentBody(next()))],
      ['PATCH', () => client.patch(`/api/students/${target.id}`, { phone: '11999998888' })],
      ['DELETE', () => client.delete(`/api/students/${target.id}`)],
    ];

    for (const [name, send] of sends) {
      const total = await studentCount(stack);
      const before = await studentRowText(stack, target.id);

      const response = await send();

      expect(response.status, `${role} ${name}`).toBe(403);
      expect((await problem(response)).code, `${role} ${name}`).toBe('forbidden');
      expect(await studentCount(stack), `${role} ${name}`).toBe(total);
      expect(await studentRowText(stack, target.id), `${role} ${name}`).toBe(before);
    }
  }
});

test('five_routes_401_without_session', async () => {
  const anonymous = stack.client();
  const id = unknownId();
  const sends: Array<[name: string, send: () => Promise<Response>]> = [
    ['GET /api/students', () => anonymous.get('/api/students')],
    ['POST /api/students', () => anonymous.post('/api/students', studentBody(next()))],
    ['GET /api/students/:id', () => anonymous.get(`/api/students/${id}`)],
    ['PATCH /api/students/:id', () => anonymous.patch(`/api/students/${id}`, { phone: '11999998888' })],
    ['DELETE /api/students/:id', () => anonymous.delete(`/api/students/${id}`)],
  ];

  for (const [name, send] of sends) {
    const response = await send();

    expect(response.status, name).toBe(401);
    expect((await problem(response)).code, name).toBe('unauthorized');
  }
});
