import { request } from 'node:http';
import type { Student } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount, auditRows, withAuditInsertFailing, written } from './support/audit.ts';
import { WEB_ORIGIN } from './support/app.ts';
import type { Client } from './support/client.ts';
import { problem, type SeededUser, type Stack, startStack } from './support/stack.ts';
import {
  cpfOf,
  createStudent,
  fullStudentBody,
  maskCpf,
  setStatus,
  studentBody,
  studentRowText,
  unknownId,
} from './support/students.ts';

let stack: Stack;
let admin: Client;
let adminUser: SeededUser;
let reception: Client;
let receptionUser: SeededUser;
let counter = 6000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
  ({ client: admin, user: adminUser } = await stack.session('admin'));
  ({ client: reception, user: receptionUser } = await stack.session('reception'));
}, 180_000);

afterAll(() => stack?.close());

test('create_writes_one_student_created_row', async () => {
  for (const [client, author] of [
    [admin, adminUser],
    [reception, receptionUser],
  ] as const) {
    const { result: response, rows } = await written(stack, () => client.post('/api/students', studentBody(next())));
    const created = (await response.json()) as Student;

    expect(response.status, author.email).toBe(201);
    expect(rows, author.email).toHaveLength(1);
    expect(rows[0], author.email).toMatchObject({
      action: 'student.created',
      user_id: author.id,
      entity: 'student',
      entity_id: created.id,
    });
  }
});

test('diff_of_creation_names_fields_and_status_only', async () => {
  const { rows } = await written(stack, () => reception.post('/api/students', studentBody(next())));

  expect(rows).toHaveLength(1);
  expect(rows[0]!.diff).toEqual({
    fields: ['name', 'cpf', 'birthDate', 'phone', 'status'],
    values: { status: { from: null, to: 'active' } },
  });
});

test('patch_writes_one_student_updated_row_per_case', async () => {
  const cases: Array<[label: string, from: string, body: Record<string, unknown>]> = [
    ['só phone', 'active', { phone: '11977776666' }],
    ['active para suspended', 'active', { status: 'suspended' }],
    ['suspended para active', 'suspended', { status: 'active' }],
    ['inactive para active', 'inactive', { status: 'active' }],
  ];

  for (const [label, from, body] of cases) {
    const student = await createStudent(reception, studentBody(next()));
    await setStatus(stack, student.id, from);

    const { result: response, rows } = await written(stack, () => reception.patch(`/api/students/${student.id}`, body));

    expect(response.status, label).toBe(200);
    expect(rows, label).toHaveLength(1);
    expect(rows[0], label).toMatchObject({
      action: 'student.updated',
      user_id: receptionUser.id,
      entity: 'student',
      entity_id: student.id,
    });
  }
});

test('diff_of_patch_values_only_status', async () => {
  const student = await createStudent(reception, studentBody(next()));

  const { rows } = await written(stack, () =>
    reception.patch(`/api/students/${student.id}`, { phone: '11977776666', healthNotes: 'Nova observação', status: 'suspended' }),
  );

  expect(rows).toHaveLength(1);
  expect(rows[0]!.diff).toEqual({
    fields: ['phone', 'healthNotes', 'status'],
    values: { status: { from: 'active', to: 'suspended' } },
  });
});

test('patch_without_change_writes_no_row', async () => {
  const student = await createStudent(reception, fullStudentBody(next()));
  const same = {
    name: student.name,
    cpf: maskCpf(student.cpf!),
    birthDate: student.birthDate,
    sex: student.sex,
    email: student.email,
    phone: '(11) 91234-5678',
    address: student.address,
    emergencyContactName: student.emergencyContactName,
    emergencyContactPhone: '(11) 3456-7890',
    healthNotes: student.healthNotes,
    status: 'active',
  };
  expect(student.phone).toBe('11912345678');
  expect(student.emergencyContactPhone).toBe('1134567890');
  const before = await studentRowText(stack, student.id);

  for (const [label, body] of [
    ['campos iguais', same],
    ['status igual', { status: 'active' }],
    ['corpo vazio', {}],
  ] as const) {
    const count = await auditCount(stack);

    const response = await reception.patch(`/api/students/${student.id}`, body);

    expect(response.status, label).toBe(200);
    expect(await auditCount(stack), label).toBe(count);
    expect(await studentRowText(stack, student.id), label).toBe(before);
  }
});

test('inactivate_writes_one_student_inactivated_row', async () => {
  for (const from of ['active', 'suspended']) {
    const student = await createStudent(reception, studentBody(next()));
    await setStatus(stack, student.id, from);

    const { result: response, rows } = await written(stack, () => reception.delete(`/api/students/${student.id}`));

    expect(response.status, from).toBe(204);
    expect(rows, from).toHaveLength(1);
    expect(rows[0], from).toMatchObject({
      action: 'student.inactivated',
      user_id: receptionUser.id,
      entity: 'student',
      entity_id: student.id,
      diff: { fields: ['status'], values: { status: { from, to: 'inactive' } } },
    });
  }
});

test('rejected_students_requests_write_no_row', async () => {
  const student = await createStudent(reception, studentBody(next()));
  const other = await createStudent(reception, studentBody(next()));
  const inactive = await createStudent(reception, studentBody(next()));
  await setStatus(stack, inactive.id, 'inactive');
  const { client: instructor } = await stack.session('instructor');
  const cases: Array<[name: string, send: () => Promise<Response>]> = [
    ['401', () => stack.client().post('/api/students', studentBody(next()))],
    ['403', () => instructor.post('/api/students', studentBody(next()))],
    ['404', () => reception.patch(`/api/students/${unknownId()}`, { phone: '11977776666' })],
    ['409', () => reception.post('/api/students', studentBody(next(), { cpf: student.cpf }))],
    ['422', () => reception.patch(`/api/students/${other.id}`, { status: 'inactive' })],
    ['DELETE de inativo', () => reception.delete(`/api/students/${inactive.id}`)],
  ];
  expect(cases).toHaveLength(6);

  for (const [name, send] of cases) {
    const count = await auditCount(stack);

    const response = await send();

    expect([401, 403, 404, 409, 422, 204], name).toContain(response.status);
    expect(await auditCount(stack), name).toBe(count);
  }
});

test('audit_insert_failure_rolls_back_three_routes', async () => {
  const target = await createStudent(reception, fullStudentBody(next()));
  const routes: Array<[name: string, send: () => Promise<Response>]> = [
    ['POST', () => reception.post('/api/students', studentBody(next()))],
    ['PATCH', () => reception.patch(`/api/students/${target.id}`, { phone: '11977776666', status: 'suspended' })],
    ['DELETE', () => reception.delete(`/api/students/${target.id}`)],
  ];
  const snapshot = async () =>
    (await stack.query<{ row: string }>('select to_jsonb(s)::text as row from students s order by id')).map((row) => row.row);

  for (const [name, send] of routes) {
    const before = await snapshot();

    const response = await withAuditInsertFailing(stack, send);

    expect(response.status, name).toBe(500);
    expect((await problem(response)).code, name).toBe('internal_error');
    expect(await snapshot(), name).toEqual(before);
  }
});

test('ten_student_values_never_reach_audit_logs', async () => {
  const n = next();
  const first = {
    name: 'Zuleica Sigilosa Prado',
    cpf: cpfOf(n),
    birthDate: '1987-03-14',
    email: 'zuleica.sigilosa@exemplo.com',
    phone: '11955554444',
    emergencyContactPhone: '1133334444',
    address: 'Rua Sigilosa, 77 - Fundos',
    emergencyContactName: 'Contato Sigiloso',
    healthNotes: 'Observação sigilosa sobre o joelho esquerdo',
  };
  const second = {
    name: 'Zuleica Secreta Prado',
    cpf: cpfOf(next()),
    birthDate: '1990-11-30',
    email: 'zuleica.secreta@exemplo.com',
    phone: '11944443333',
    emergencyContactPhone: '1122223333',
    address: 'Travessa Secreta, 12',
    emergencyContactName: 'Contato Secreto',
    healthNotes: 'Segunda observação secreta sobre a coluna',
  };

  const created = await createStudent(reception, { ...first, sex: 'female' });
  expect((await reception.patch(`/api/students/${created.id}`, second)).status).toBe(200);
  expect((await reception.delete(`/api/students/${created.id}`)).status).toBe(204);

  const [stored] = await stack.query<{ value: string }>(
    "select value from students s, jsonb_each_text(to_jsonb(s)) where s.id = $1 and value like 'v1.%'",
    [created.id],
  );
  const text = (await auditRows(stack)).map((row) => JSON.stringify(row)).join('\n');
  const values = [
    first.name,
    first.cpf,
    maskCpf(first.cpf),
    first.birthDate,
    first.email,
    first.phone,
    first.emergencyContactPhone,
    first.address,
    first.emergencyContactName,
    first.healthNotes,
    second.name,
    second.cpf,
    maskCpf(second.cpf),
    second.birthDate,
    second.email,
    second.phone,
    second.emergencyContactPhone,
    second.address,
    second.emergencyContactName,
    second.healthNotes,
    stored!.value,
  ];
  expect(text).toContain('student.created');
  expect(text).toContain('student.inactivated');
  for (const value of values) expect(text.includes(value), value).toBe(false);
});

/** Uma requisição autenticada pelo `node:http`, que não acrescenta `User-Agent` nem mexe nos cabeçalhos dados. */
function send(method: string, path: string, client: Client, headers: Record<string, string>, body?: unknown) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<number>((resolve, reject) => {
    const req = request(
      `${stack.api.url}${path}`,
      {
        method,
        headers: {
          Origin: WEB_ORIGIN,
          Cookie: client.cookie(),
          ...(payload && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
          ...headers,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

test('ip_and_user_agent_on_the_three_actions', async () => {
  const agent = `teste/1.0 ${'x'.repeat(600)}`.slice(0, 512) + 'Z';
  expect(agent).toHaveLength(513);
  const forwarded = { 'X-Forwarded-For': '198.51.100.1, 203.0.113.7' };
  const withAgent = { ...forwarded, 'User-Agent': agent };
  const actions: Array<[action: string, run: (headers: Record<string, string>) => Promise<number>]> = [
    ['student.created', (headers) => send('POST', '/api/students', reception, headers, studentBody(next()))],
    [
      'student.updated',
      async (headers) => {
        const student = await createStudent(reception, studentBody(next()));
        return send('PATCH', `/api/students/${student.id}`, reception, headers, { phone: '11977776666' });
      },
    ],
    [
      'student.inactivated',
      async (headers) => {
        const student = await createStudent(reception, studentBody(next()));
        return send('DELETE', `/api/students/${student.id}`, reception, headers);
      },
    ],
  ];

  for (const [action, run] of actions) {
    for (const [label, headers] of [['com User-Agent', withAgent], ['sem User-Agent', forwarded]] as const) {
      const count = (await auditRows(stack)).length;
      const status = await run(headers);
      const rows = (await auditRows(stack)).slice(count).filter((row) => row.action === action);

      expect([201, 200, 204], `${action} ${label}`).toContain(status);
      expect(rows, `${action} ${label}`).toHaveLength(1);
      expect(rows[0]!.ip, `${action} ${label}`).toBe('203.0.113.7');
      expect(rows[0]!.user_agent, `${action} ${label}`).toBe(label === 'com User-Agent' ? agent.slice(0, 512) : null);
    }
  }
});
