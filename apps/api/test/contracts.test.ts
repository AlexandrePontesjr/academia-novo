import {
  AUDIT_ACTIONS,
  auditActionSchema,
  consentSchema,
  consentTermsResponseSchema,
  createStudentRequestSchema,
  grantConsentRequestSchema,
  isMinor,
  guardianRequestSchema,
  studentConsentsResponseSchema,
  updateStudentRequestSchema,
  type AuditLogsResponse,
  auditLogsResponseSchema,
  healthResponseSchema,
  loginResponseSchema,
  photoCreatedSchema,
  photoUrlResponseSchema,
  photoVariantSchema,
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
import { apiWith, jpegBytes, padJpeg, uploaded, uploadPhoto } from './support/photos.ts';
import { freePort, type Minio, refusingDatabaseUrl, startMinio, startPostgres } from './support/servers.ts';
import { PASSWORD, type Stack, startStack } from './support/stack.ts';
import { createAdult, createMinorWithGuardian, insertTerm } from './support/consents.ts';
import { createStudent, studentBody } from './support/students.ts';
import { totpCode } from './support/totp.ts';

let postgres: Awaited<ReturnType<typeof startPostgres>>;
let healthy: Awaited<ReturnType<typeof startApi>>;
let degraded: Awaited<ReturnType<typeof startApi>>;
let stack: Stack;
let minio: Minio;

beforeAll(async () => {
  minio = await startMinio();
  postgres = await startPostgres();
  healthy = await startApi(postgres.url);
  degraded = await startApi(await refusingDatabaseUrl());
  stack = await startStack([], minio.env);
}, 180_000);

afterAll(async () => {
  await healthy?.close();
  await degraded?.close();
  await postgres?.stop();
  await stack?.close();
  await minio?.stop();
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

  expect(AUDIT_ACTIONS).toHaveLength(18);
  expect([...AUDIT_ACTIONS]).toEqual([
    ...before,
    'student.created',
    'student.updated',
    'student.inactivated',
    'student.guardian_saved',
    'student.consent_granted',
    'student.consent_revoked',
    'student.photo_uploaded',
    'student.photo_removed',
  ]);
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

test('audit_actions_end_with_three_consent_actions_in_order', () => {
  expect(AUDIT_ACTIONS).toHaveLength(18);
  expect(AUDIT_ACTIONS.slice(0, 13)).toEqual([
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
    'student.created',
    'student.updated',
    'student.inactivated',
  ]);
  expect(AUDIT_ACTIONS.slice(13, 16)).toEqual(['student.guardian_saved', 'student.consent_granted', 'student.consent_revoked']);
});

test('audit_actions_end_with_two_photo_actions_in_order', () => {
  expect(AUDIT_ACTIONS).toHaveLength(18);
  expect(AUDIT_ACTIONS.slice(0, 16)).toEqual([
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
    'student.created',
    'student.updated',
    'student.inactivated',
    'student.guardian_saved',
    'student.consent_granted',
    'student.consent_revoked',
  ]);
  expect(AUDIT_ACTIONS.slice(16)).toEqual(['student.photo_uploaded', 'student.photo_removed']);
  expect(auditActionSchema.options).toEqual([...AUDIT_ACTIONS]);
});

test('photo_schemas_accept_and_reject_and_student_gains_photo_url', () => {
  const id = '018f0000-0000-7000-8000-000000000001';
  const student = { id, name: 'Ana Lima', status: 'active' };

  // `photoUrl` é texto, `null` ou ausente, na ficha e no item da lista
  for (const photoUrl of ['/api/photo-files/x/medium?exp=1&sig=a', null, undefined]) {
    const body = photoUrl === undefined ? student : { ...student, photoUrl };
    expect(studentSchema.safeParse(body).success, `ficha ${String(photoUrl)}`).toBe(true);
    expect(studentsResponseSchema.safeParse({ items: [body], nextCursor: null }).success, `item ${String(photoUrl)}`).toBe(true);
  }

  const created = { id, version: 1, createdAt: '2026-10-05T02:30:00.000Z' };
  expect(photoCreatedSchema.safeParse(created).success).toBe(true);
  for (const field of ['id', 'version', 'createdAt']) {
    expect(photoCreatedSchema.safeParse(without(created, field)).success, `POST sem ${field}`).toBe(false);
  }

  const url = { url: '/api/photo-files/x/thumb?exp=1&sig=a', expiresAt: '2026-10-05T02:35:00.000Z' };
  expect(photoUrlResponseSchema.safeParse(url).success).toBe(true);
  for (const field of ['url', 'expiresAt']) {
    expect(photoUrlResponseSchema.safeParse(without(url, field)).success, `GET sem ${field}`).toBe(false);
  }

  for (const variant of ['thumb', 'medium', 'large']) expect(photoVariantSchema.safeParse(variant).success, variant).toBe(true);
  for (const variant of ['small', 'THUMB', '']) expect(photoVariantSchema.safeParse(variant).success, variant).toBe(false);
});

const without = <T extends Record<string, unknown>>(body: T, key: string) =>
  Object.fromEntries(Object.entries(body).filter(([name]) => name !== key));

test('consent_and_guardian_request_schemas_accept_and_reject', () => {
  const grant = { purpose: 'image_use', termVersion: 1, grantedBy: 'student' };
  for (const purpose of ['data_processing', 'image_use']) {
    for (const grantedBy of ['student', 'guardian']) {
      expect(grantConsentRequestSchema.safeParse({ ...grant, purpose, grantedBy }).success, `${purpose}/${grantedBy}`).toBe(true);
    }
  }
  expect(grantConsentRequestSchema.safeParse({ ...grant, termVersion: 7 }).success).toBe(true);
  for (const field of ['purpose', 'termVersion', 'grantedBy']) {
    expect(grantConsentRequestSchema.safeParse(without(grant, field)).success, `sem ${field}`).toBe(false);
  }
  const refused: Array<[string, Record<string, unknown>]> = [
    ['purpose marketing', { ...grant, purpose: 'marketing' }],
    ['termVersion 0', { ...grant, termVersion: 0 }],
    ['termVersion 1.5', { ...grant, termVersion: 1.5 }],
    ['termVersion "1"', { ...grant, termVersion: '1' }],
    ['grantedBy staff', { ...grant, grantedBy: 'staff' }],
  ];
  for (const [label, body] of refused) expect(grantConsentRequestSchema.safeParse(body).success, label).toBe(false);

  const guardian = { name: 'Ana Souza', cpf: '529.982.247-25', phone: '(11) 91234-5678', relationship: 'mother' };
  expect(guardianRequestSchema.safeParse(guardian).success).toBe(true);
  expect(guardianRequestSchema.safeParse(guardian).data).toMatchObject({ cpf: '52998224725', phone: '11912345678' });
  for (const field of ['name', 'cpf', 'phone', 'relationship']) {
    expect(guardianRequestSchema.safeParse(without(guardian, field)).success, `guardian sem ${field}`).toBe(false);
  }
  expect(guardianRequestSchema.safeParse(null).success, 'guardian null').toBe(false);
  // o PATCH também recusa `null`
  expect(updateStudentRequestSchema.safeParse({ guardian: null }).success).toBe(false);
  expect(updateStudentRequestSchema.safeParse({ guardian }).success).toBe(true);
});

test('consent_response_schemas_accept_and_reject', () => {
  const id = '018f0000-0000-7000-8000-000000000001';
  const item = {
    id,
    purpose: 'image_use',
    termVersion: 1,
    grantedBy: 'guardian',
    guardian: { id, name: 'Ana Souza' },
    grantedAt: '2026-10-05T02:30:00.000Z',
    revokedAt: null,
  };
  expect(consentSchema.safeParse(item).success).toBe(true);
  expect(consentSchema.safeParse({ ...item, guardian: null, grantedBy: 'student' }).success, 'guardian null').toBe(true);
  expect(consentSchema.safeParse({ ...item, revokedAt: '2026-10-06T02:30:00.000Z' }).success, 'revokedAt instante').toBe(true);
  for (const field of ['id', 'purpose', 'termVersion', 'grantedBy', 'grantedAt', 'revokedAt']) {
    expect(consentSchema.safeParse(without(item, field)).success, `sem ${field}`).toBe(false);
  }

  expect(studentConsentsResponseSchema.safeParse({ guardian: null, items: [] }).success).toBe(true);
  expect(studentConsentsResponseSchema.safeParse({ guardian: null, items: [item] }).success).toBe(true);
});

test('is_minor_boundaries_in_sao_paulo', () => {
  const cases: Array<[label: string, birthDate: string, today: string, minor: boolean]> = [
    ['faz 18 anos amanhã', '2008-10-05', '2026-10-04', true],
    ['faz 18 anos hoje', '2008-10-04', '2026-10-04', false],
    ['fez 18 anos ontem', '2008-10-03', '2026-10-04', false],
    ['ano: 17 anos e 11 meses', '2008-11-01', '2026-10-31', true],
    ['mês: aniversário mais cedo no ano', '2008-01-01', '2026-10-04', false],
    ['mês: aniversário mais tarde no ano', '2008-12-25', '2026-10-04', true],
    ['um ano a menos', '2009-01-01', '2026-10-04', true],
    ['29/02 em 28/02 de ano comum', '2008-02-29', '2026-02-28', true],
    ['29/02 em 01/03 de ano comum', '2008-02-29', '2026-03-01', false],
  ];
  for (const [label, birthDate, today, minor] of cases) expect(isMinor(birthDate, today), label).toBe(minor);
});

test('consent_bodies_match_contract_schemas', async () => {
  const { client } = await stack.session('reception');
  const withEverything = await createMinorWithGuardian(client, 7101);
  const empty = await createAdult(client, 7102);
  const adult = await createAdult(client, 7103);
  const granted = await client.post(`/api/students/${withEverything.id}/consents`, {
    purpose: 'image_use',
    termVersion: 1,
    grantedBy: 'guardian',
  });
  const created = (await granted.clone().json()) as { id: string };
  const adultGrant = await client.post(`/api/students/${adult.id}/consents`, {
    purpose: 'data_processing',
    termVersion: 1,
    grantedBy: 'student',
  });
  // um revogado e um ativo, para a ficha ter os dois estados
  await client.delete(`/api/students/${withEverything.id}/consents/${created.id}`);
  await client.post(`/api/students/${withEverything.id}/consents`, { purpose: 'image_use', termVersion: 1, grantedBy: 'guardian' });

  const cases: Array<[route: string, status: number, schema: z.ZodType, response: Response]> = [
    ['GET /api/consent-terms', 200, consentTermsResponseSchema, await client.get('/api/consent-terms')],
    [
      'GET /api/students/:id/consents (com responsável e consentimentos)',
      200,
      studentConsentsResponseSchema,
      await client.get(`/api/students/${withEverything.id}/consents`),
    ],
    [
      'GET /api/students/:id/consents (sem nada)',
      200,
      studentConsentsResponseSchema,
      await client.get(`/api/students/${empty.id}/consents`),
    ],
    ['POST /api/students/:id/consents (guardian)', 201, consentSchema, granted],
    ['POST /api/students/:id/consents (student)', 201, consentSchema, adultGrant],
  ];
  expect(cases).toHaveLength(5);

  for (const [route, status, schema, response] of cases) {
    const body: unknown = await response.json();
    const parsed = schema.safeParse(body);

    expect(response.status, route).toBe(status);
    expect(parsed.success, `${route}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
});

test('consent_codes_are_known_409_codes', async () => {
  // o termo é append-only: a versão antiga só existe num banco com a versão 2
  const own = await startStack();
  try {
    await insertTerm(own, 'data_processing', 2);
    const { client } = await own.session('reception');
    const student = await createAdult(client, 7201);
    const path = `/api/students/${student.id}/consents`;
    expect((await client.post(path, { purpose: 'image_use', termVersion: 1, grantedBy: 'student' })).status).toBe(201);

    const cases: Array<[code: string, body: Record<string, unknown>]> = [
      ['consent_active', { purpose: 'image_use', termVersion: 1, grantedBy: 'student' }],
      ['consent_term_outdated', { purpose: 'data_processing', termVersion: 1, grantedBy: 'student' }],
    ];
    for (const [code, body] of cases) {
      const response = await client.post(path, body);
      const problem = (await response.json()) as Record<string, unknown>;

      expect(response.status, code).toBe(409);
      expect(problem.status, code).toBe(409);
      expect(problem.code, code).toBe(code);
      expect(response.headers.get('content-type'), code).toMatch(/^application\/problem\+json\b/);
      expect(problemSchema.safeParse(problem).success, code).toBe(true);
    }
  } finally {
    await own.close();
  }
});

test('photo_bodies_match_contract_schemas', async () => {
  const admin = await stack.session('admin');
  const sessions = {
    admin: admin.client,
    reception: (await stack.session('reception')).client,
    hr_finance: (await stack.session('hr_finance')).client,
    instructor: (await stack.session('instructor')).client,
  };
  const withPhoto = await createStudent(sessions.reception, studentBody(7301, { name: 'Contrato com Foto' }));
  const photoless = await createStudent(sessions.reception, studentBody(7302, { name: 'Contrato sem Foto' }));
  const created = await uploadPhoto(sessions.reception, withPhoto.id, await jpegBytes());

  const cases: Array<[route: string, status: number, schema: z.ZodType, response: Response]> = [
    ['POST /api/students/:id/photo', 201, photoCreatedSchema, created],
    ['GET /api/students/:id/photo', 200, photoUrlResponseSchema, await sessions.reception.get(`/api/students/${withPhoto.id}/photo`)],
    ...(await Promise.all(
      Object.entries(sessions).flatMap(([role, client]) =>
        [withPhoto, photoless].map(
          async (student) =>
            [
              `GET /api/students/:id (${role}, ${student === withPhoto ? 'com' : 'sem'} foto)`,
              200,
              studentSchema,
              await client.get(`/api/students/${student.id}`),
            ] as [string, number, z.ZodType, Response],
        ),
      ),
    )),
    ['GET /api/students (admin)', 200, studentsResponseSchema, await sessions.admin.get('/api/students?q=Contrato')],
    ['GET /api/students (instructor)', 200, studentsResponseSchema, await sessions.instructor.get('/api/students?q=Contrato')],
  ];
  expect(cases).toHaveLength(12);

  for (const [route, status, schema, response] of cases) {
    const body: unknown = await response.json();
    const parsed = schema.safeParse(body);

    expect(response.status, route).toBe(status);
    expect(parsed.success, `${route}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
  const list = (await (await sessions.admin.get('/api/students?q=Contrato')).json()) as { items: Array<{ photoUrl: unknown }> };
  expect(list.items.map((item) => typeof item.photoUrl).sort()).toEqual(['object', 'string']);
});

test('photo_codes_are_known_problem_codes', async () => {
  const { client } = await stack.session('reception');
  const down = await apiWith(stack, { ...minio.env, S3_ENDPOINT: `http://127.0.0.1:${await freePort()}` });
  try {
    const first = await createStudent(client, studentBody(7303));
    const second = await createStudent(client, studentBody(7304));
    const jpeg = await jpegBytes();
    const { id: photoId } = await uploaded(await uploadPhoto(client, first.id, jpeg));

    const cases: Array<[code: string, status: number, send: () => Promise<Response>]> = [
      ['photo_exists', 409, () => uploadPhoto(client, first.id, jpeg)],
      ['invalid_signature', 403, () => fetch(`${stack.api.url}/api/photo-files/${photoId}/thumb?exp=1&sig=lixo`)],
      ['payload_too_large', 413, () => uploadPhoto(client, second.id, padJpeg(jpeg, 5_242_881))],
      ['unsupported_media_type', 415, () => uploadPhoto(client, second.id, Buffer.from('texto'.repeat(30)))],
      ['storage_unavailable', 503, () => uploadPhoto(down.client, second.id, jpeg)],
    ];

    for (const [code, status, send] of cases) {
      const response = await send();
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status, code).toBe(status);
      expect(body.status, code).toBe(status);
      expect(body.code, code).toBe(code);
      expect(response.headers.get('content-type'), code).toMatch(/^application\/problem\+json\b/);
      expect(problemSchema.safeParse(body).success, code).toBe(true);
    }
  } finally {
    await down.api.close();
  }
});
