import {
  AUDIT_ACTIONS,
  auditActionSchema,
  createStudentRequestSchema,
  type AuditLogsResponse,
  auditLogsResponseSchema,
  healthResponseSchema,
  loginResponseSchema,
  problemSchema,
  sessionResponseSchema,
  studentSchema,
  studentsResponseSchema,
  twoFactorEnableResponseSchema,
  userSchema,
  usersResponseSchema,
} from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { z } from 'zod';
import { startApi } from './support/app.ts';
import { refusingDatabaseUrl, startPostgres } from './support/servers.ts';
import { PASSWORD, type Stack, startStack } from './support/stack.ts';
import { createStudent, studentBody } from './support/students.ts';
import { totpCode } from './support/totp.ts';

let postgres: Awaited<ReturnType<typeof startPostgres>>;
let healthy: Awaited<ReturnType<typeof startApi>>;
let degraded: Awaited<ReturnType<typeof startApi>>;
let stack: Stack;

beforeAll(async () => {
  postgres = await startPostgres();
  healthy = await startApi(postgres.url);
  degraded = await startApi(await refusingDatabaseUrl());
  stack = await startStack();
}, 180_000);

afterAll(async () => {
  await healthy?.close();
  await degraded?.close();
  await postgres?.stop();
  await stack?.close();
});

test('responses_match_contract_schemas', async () => {
  const ok = await fetch(`${healthy.url}/health`);
  expect(ok.status).toBe(200);
  expect(healthResponseSchema.safeParse(await ok.json()).success).toBe(true);

  const down = await fetch(`${degraded.url}/health`);
  expect(down.status).toBe(503);
  expect(healthResponseSchema.safeParse(await down.json()).success).toBe(true);

  const notFound = await fetch(`${healthy.url}/rota-que-nao-existe`);
  expect(notFound.status).toBe(404);
  expect(problemSchema.safeParse(await notFound.json()).success).toBe(true);
});

test('ten_new_codes_match_problem_schema', async () => {
  // um único administrador ativo, para o `last_admin`; o segundo só é criado depois dele
  const admin = await stack.session('admin');
  const reception = await stack.session('reception');
  const blocked = await stack.seed();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await stack.client().post('/api/auth/login', { email: blocked.email, password: 'senha-errada-000' });
  }
  const anonymous = stack.client();

  const cases: Array<[code: string, status: number, send: () => Promise<Response>]> = [
    ['validation_failed', 422, () => anonymous.post('/api/auth/login', {})],
    ['unauthorized', 401, () => anonymous.get('/api/auth/session')],
    [
      'invalid_credentials',
      401,
      () => anonymous.post('/api/auth/login', { email: reception.user.email, password: 'senha-errada-000' }),
    ],
    ['invalid_code', 401, () => anonymous.post('/api/auth/two-factor/verify', { code: '123456' })],
    ['forbidden', 403, () => reception.client.get('/api/users')],
    ['csrf_rejected', 403, () => anonymous.post('/api/auth/login', {}, { origin: 'https://outro.example' })],
    [
      'email_taken',
      409,
      () =>
        admin.client.post('/api/users', {
          name: 'Repetida',
          email: reception.user.email,
          role: 'reception',
          password: 'senha-valida-123',
        }),
    ],
    ['last_admin', 409, () => admin.client.patch(`/api/users/${admin.user.id}`, { active: false })],
    [
      'too_many_attempts',
      429,
      () => anonymous.post('/api/auth/login', { email: blocked.email, password: blocked.password }),
    ],
    [
      'two_factor_enrollment_required',
      403,
      async () => (await stack.signIn(await stack.seed({ role: 'admin' }))).get('/api/users'),
    ],
  ];
  expect(new Set(cases.map(([code]) => code)).size).toBe(10);

  for (const [code, status, send] of cases) {
    const response = await send();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status, code).toBe(status);
    expect(body.code, code).toBe(code);
    expect(response.headers.get('content-type'), code).toMatch(/^application\/problem\+json\b/);
    expect(body.requestId, code).toMatch(/\S/);
    expect(response.headers.get('x-request-id'), code).toBe(body.requestId);
    expect(problemSchema.safeParse(body).success, code).toBe(true);
  }
});

test('seven_success_bodies_match_contract_schemas', async () => {
  // roda depois do teste acima, que deixou um Administrador sem 2FA: este é o que tem
  const admin = await stack.session('admin');
  const plain = await stack.seed();
  const withTwoFactor = await stack.seed();
  const enrolledClient = await stack.signIn(withTwoFactor);
  const fresh = await stack.signIn(await stack.seed());
  const pending = stack.client();

  const cases: Array<[route: string, status: number, schema: z.ZodType, send: () => Promise<Response>]> = [
    [
      'POST /api/auth/login',
      200,
      loginResponseSchema,
      () => stack.client().post('/api/auth/login', { email: plain.email, password: plain.password }),
    ],
    [
      'POST /api/auth/two-factor/enable',
      200,
      twoFactorEnableResponseSchema,
      () => fresh.post('/api/auth/two-factor/enable', { password: PASSWORD }),
    ],
    [
      'POST /api/auth/two-factor/verify',
      200,
      loginResponseSchema,
      async () => {
        const { totpUri } = await stack.enrollTwoFactor(enrolledClient);
        await pending.post('/api/auth/login', { email: withTwoFactor.email, password: withTwoFactor.password });
        return pending.post('/api/auth/two-factor/verify', { code: totpCode(totpUri) });
      },
    ],
    ['GET /api/auth/session', 200, sessionResponseSchema, () => admin.client.get('/api/auth/session')],
    ['GET /api/users', 200, usersResponseSchema, () => admin.client.get('/api/users')],
    [
      'POST /api/users',
      201,
      userSchema,
      () =>
        admin.client.post('/api/users', {
          name: 'Contratada',
          email: 'contratada@exemplo.com',
          role: 'instructor',
          password: 'senha-valida-123',
        }),
    ],
    [
      'PATCH /api/users/:id',
      200,
      userSchema,
      () => admin.client.patch(`/api/users/${plain.id}`, { name: 'Nome trocado' }),
    ],
  ];
  expect(cases).toHaveLength(7);

  for (const [route, status, schema, send] of cases) {
    const response = await send();
    const body: unknown = await response.json();
    const parsed = schema.safeParse(body);

    expect(response.status, route).toBe(status);
    expect(parsed.success, `${route}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
});

test('audit_logs_body_matches_contract_schema', async () => {
  const admin = await stack.session('admin');
  const target = await stack.seed({ role: 'reception' });
  // uma linha com autor e `diff`, e uma sem autor e de `diff` nulo
  expect((await admin.client.patch(`/api/users/${target.id}`, { role: 'instructor' })).status).toBe(200);
  const refused = await stack
    .client()
    .post('/api/auth/login', { email: 'ninguem.no.contrato@exemplo.com', password: 'senha-errada-000' });
  expect(refused.status).toBe(401);

  const response = await admin.client.get('/api/audit-logs');
  const body = (await response.json()) as AuditLogsResponse;
  const parsed = auditLogsResponseSchema.safeParse(body);

  expect(response.status).toBe(200);
  expect(body.items.some((item) => item.user?.id === admin.user.id && item.diff !== null)).toBe(true);
  expect(body.items.some((item) => item.user === null && item.diff === null)).toBe(true);
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
});

test('audit_actions_end_with_three_student_actions_in_order', () => {
  const before = [
    'auth.login_succeeded',
    'auth.login_failed',
    'auth.logout',
    'auth.password_changed',
    'auth.two_factor_enabled',
    'auth.two_factor_disabled',
    'user.created',
    'user.updated',
    'user.password_reset',
    'user.two_factor_reset',
  ];

  expect(AUDIT_ACTIONS).toHaveLength(13);
  expect([...AUDIT_ACTIONS]).toEqual([...before, 'student.created', 'student.updated', 'student.inactivated']);
  expect(auditActionSchema.options).toEqual([...AUDIT_ACTIONS]);
});

test('student_schema_has_optional_profile_fields', () => {
  const id = '018f0000-0000-7000-8000-000000000001';
  const instructor = { id, name: 'Ana Lima', status: 'active' };
  const hrFinance = {
    ...instructor,
    cpf: '52998224725',
    birthDate: '2000-01-01',
    sex: null,
    email: null,
    phone: '11912345678',
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
  };
  const full = { ...hrFinance, healthNotes: null };

  for (const [name, body] of Object.entries({ instructor, hrFinance, full })) {
    expect(studentSchema.safeParse(body).success, name).toBe(true);
  }
  for (const missing of ['id', 'name', 'status']) {
    const without = Object.fromEntries(Object.entries(full).filter(([key]) => key !== missing));
    expect(studentSchema.safeParse(without).success, missing).toBe(false);
  }
});

test('cpf_check_digit_table', () => {
  const body = { name: 'Ana Lima', birthDate: '2000-01-01', phone: '11912345678' };
  const refused = [
    '5299822472', // 10 dígitos
    '529982247251', // 12 dígitos
    ...Array.from({ length: 10 }, (_, digit) => String(digit).repeat(11)),
    '529.982.247-15', // primeiro dígito verificador errado
    '529.982.247-24', // segundo dígito verificador errado
    '5299822472a', // letra
  ];
  const accepted: Array<[sent: string, stored: string]> = [
    ['529.982.247-25', '52998224725'],
    ['52998224725', '52998224725'],
    ['123.456.789-09', '12345678909'], // primeiro dígito verificador zero
  ];

  for (const cpf of refused) {
    const result = createStudentRequestSchema.safeParse({ ...body, cpf });
    expect(result.success, cpf).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.')), cpf).toEqual(['cpf']);
  }
  for (const [sent, stored] of accepted) {
    const result = createStudentRequestSchema.safeParse({ ...body, cpf: sent });
    expect(result.success, sent).toBe(true);
    expect(result.data?.cpf, sent).toBe(stored);
  }
});

test('students_bodies_match_contract_schemas', async () => {
  const admin = await stack.session('admin');
  const sessions = {
    admin: admin.client,
    reception: (await stack.session('reception')).client,
    hr_finance: (await stack.session('hr_finance')).client,
    instructor: (await stack.session('instructor')).client,
  };
  const created = await admin.client.post(
    '/api/students',
    studentBody(7001, { sex: 'female', email: 'contratada@exemplo.com', healthNotes: 'Observação', emergencyContactName: 'Contato', emergencyContactPhone: '1133334444' }),
  );
  const student = (await created.clone().json()) as { id: string };
  await createStudent(admin.client, studentBody(7002));

  const cases: Array<[route: string, status: number, schema: z.ZodType, response: Response]> = [
    ['POST /api/students', 201, studentSchema, created],
    ...(await Promise.all(
      Object.entries(sessions).map(async ([role, client]) => [
        `GET /api/students/:id (${role})`,
        200,
        studentSchema,
        await client.get(`/api/students/${student.id}`),
      ] as [string, number, z.ZodType, Response]),
    )),
    ['GET /api/students (admin)', 200, studentsResponseSchema, await sessions.admin.get('/api/students')],
    ['GET /api/students (instructor)', 200, studentsResponseSchema, await sessions.instructor.get('/api/students')],
  ];
  expect(cases).toHaveLength(7);

  for (const [route, status, schema, response] of cases) {
    const body: unknown = await response.json();
    const parsed = schema.safeParse(body);

    expect(response.status, route).toBe(status);
    expect(parsed.success, `${route}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
});

test('cpf_taken_is_a_known_409_code', async () => {
  const { client } = await stack.session('reception');
  const first = await createStudent(client, studentBody(7003));

  const response = await client.post('/api/students', studentBody(7004, { cpf: first.cpf }));
  const body = (await response.json()) as Record<string, unknown>;

  expect(response.status).toBe(409);
  expect(body.code).toBe('cpf_taken');
  expect(body.status).toBe(409);
  expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
  expect(problemSchema.safeParse(body).success).toBe(true);
});
