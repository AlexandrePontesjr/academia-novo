import type { MyProfile, Problem, StudentPaymentsResponse } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { type CapturedMail, captureMail } from './support/mail.ts';
import { insertPayment } from './support/payments.ts';
import { jpegBytes, type PhotoStack, startPhotoStack, uploadPhoto, versionRows } from './support/photos.ts';
import { insertEnrollment, insertPlan } from './support/plans.ts';
import { portalSession, postMyPhoto } from './support/portal.ts';
import { problem, type Stack } from './support/stack.ts';
import { fieldErrorPaths, studentRowText } from './support/students.ts';

let env: PhotoStack;
let stack: Stack;
let mail: CapturedMail;
let reception: Client;

beforeAll(async () => {
  mail = captureMail();
  env = await startPhotoStack(undefined, { mail: mail.transport });
  stack = env.stack;
  reception = (await stack.session('reception')).client;
}, 240_000);

afterAll(() => env?.close());

const PROFILE_KEYS = [
  'address',
  'birthDate',
  'cpf',
  'email',
  'emergencyContactName',
  'emergencyContactPhone',
  'name',
  'pendingPhoto',
  'phone',
  'photoUrl',
  'status',
];

const profileOf = async (client: Client) => (await (await client.get('/api/me/profile')).json()) as MyProfile;

const usersRowText = async (id: string) =>
  (await stack.query<{ row: string }>('select to_jsonb(u)::text as row from users u where id = $1', [id]))[0]!.row;

test('profile_200_eleven_keys_without_health_notes', async () => {
  const { client, student } = await portalSession(stack, mail);
  const filled = await reception.patch(`/api/students/${student.id}`, {
    healthNotes: 'Asma leve',
    address: 'Rua das Flores, 10',
    emergencyContactName: 'Bia Lima',
    emergencyContactPhone: '11933334444',
  });
  expect(filled.status).toBe(200);

  const response = await client.get('/api/me/profile');

  expect(response.status).toBe(200);
  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(PROFILE_KEYS);
  expect(body).toEqual({
    name: student.name,
    cpf: student.cpf,
    birthDate: '2000-01-01',
    email: student.email,
    phone: '11912345678',
    address: 'Rua das Flores, 10',
    emergencyContactName: 'Bia Lima',
    emergencyContactPhone: '11933334444',
    status: 'active',
    photoUrl: null,
    pendingPhoto: null,
  });
  expect(JSON.stringify(body)).not.toContain('Asma');

  expect((await uploadPhoto(reception, student.id, await jpegBytes())).status).toBe(201);
  const [current] = await versionRows(stack, student.id);
  const signed = await profileOf(client);
  expect(signed.photoUrl).toContain(`/api/photo-files/${current!.id}/medium?`);
  expect(signed.pendingPhoto).toBeNull();
});

test('me_routes_resolve_only_by_session_student_id', async () => {
  const a = await portalSession(stack, mail);
  const b = await portalSession(stack, mail);
  const planId = await insertPlan(stack);
  const ofA = await insertEnrollment(stack, { studentId: a.student.id, planId, startsAt: '2026-01-01', endsAt: '2026-01-31' });
  const ofB = await insertEnrollment(stack, { studentId: b.student.id, planId, startsAt: '2026-02-01', endsAt: '2026-02-28' });
  const rowB = await studentRowText(stack, b.student.id);
  const periodsOfB = (await (await b.client.get('/api/me/payments')).json()) as StudentPaymentsResponse;

  const profile = (await (await a.client.get(`/api/me/profile?studentId=${b.student.id}`)).json()) as MyProfile;
  expect(profile.name).toBe(a.student.name);
  expect(profile.cpf).toBe(a.student.cpf);

  const payments = (await (await a.client.get(`/api/me/payments?studentId=${b.student.id}`)).json()) as StudentPaymentsResponse;
  expect(payments.items.map((item) => item.enrollmentId)).toEqual([ofA]);

  const patched = await a.client.patch('/api/me/profile', { phone: '11955556666' });
  expect(patched.status).toBe(200);
  expect(((await patched.json()) as MyProfile).phone).toBe('11955556666');
  expect(await studentRowText(stack, b.student.id)).toBe(rowB);
  const again = (await (await b.client.get('/api/me/payments')).json()) as StudentPaymentsResponse;
  expect(again).toEqual(periodsOfB);
  expect(again.items.map((item) => item.enrollmentId)).toEqual([ofB]);

  expect((await a.client.get(`/api/me/profile/${b.student.id}`)).status).toBe(404);
});

test('me_payments_equal_staff_payments_for_the_student', async () => {
  const { client, student } = await portalSession(stack, mail);
  const hr = (await stack.session('hr_finance')).client;
  const planId = await insertPlan(stack, { name: 'Plano Portal' });
  const paid = await insertEnrollment(stack, { studentId: student.id, planId, startsAt: '2026-01-01', endsAt: '2026-01-31' });
  await insertEnrollment(stack, { studentId: student.id, planId, startsAt: '2026-02-01', endsAt: '2026-02-28' }); // vencido e sem pagamento
  await insertEnrollment(stack, { studentId: student.id, planId, startsAt: '2099-03-01', endsAt: '2099-03-31' }); // vence depois de hoje
  await insertPayment(stack, { enrollmentId: paid });

  const mine = await client.get('/api/me/payments');
  const staff = await hr.get(`/api/students/${student.id}/payments`);

  expect(mine.status).toBe(200);
  expect(staff.status).toBe(200);
  const body = (await mine.json()) as StudentPaymentsResponse;
  expect(body).toEqual(await staff.json());
  expect(body.items.map((item) => item.status).sort()).toEqual(['overdue', 'paid', 'pending']);

  const empty = await portalSession(stack, mail);
  const none = await empty.client.get('/api/me/payments');
  expect(none.status).toBe(200);
  expect(await none.json()).toEqual({ items: [] });
});

test('staff_403_and_anonymous_401_on_five_me_routes', async () => {
  const jpeg = await jpegBytes();
  const routes: Array<[string, (client: Client) => Promise<Response>]> = [
    ['GET /api/me/profile', (client) => client.get('/api/me/profile')],
    ['PATCH /api/me/profile', (client) => client.patch('/api/me/profile', { phone: '11955556666' })],
    ['GET /api/me/payments', (client) => client.get('/api/me/payments')],
    ['GET /api/me/photo', (client) => client.get('/api/me/photo')],
    ['POST /api/me/photo', (client) => postMyPhoto(client, jpeg)],
  ];
  expect(routes).toHaveLength(5);

  for (const role of ['admin', 'reception', 'hr_finance', 'instructor'] as const) {
    const { client } = await stack.session(role);
    for (const [name, call] of routes) {
      const response = await call(client);
      const body = (await problem(response)) as Problem & Record<string, unknown>;
      expect(response.status, `${role} ${name}`).toBe(403);
      expect(body.code, `${role} ${name}`).toBe('forbidden');
      // `status` é chave do próprio corpo de erro, com o número do status
      for (const key of PROFILE_KEYS.filter((key) => key !== 'status')) expect(body, `${role} ${name}`).not.toHaveProperty(key);
      expect(body.status, `${role} ${name}`).toBe(403);
    }
  }
  for (const [name, call] of routes) {
    const response = await call(stack.client());
    expect(response.status, name).toBe(401);
    expect((await problem(response)).code, name).toBe('unauthorized');
  }
});

test('patch_four_contact_fields_200_with_student_as_author', async () => {
  const { client, student, user } = await portalSession(stack, mail);
  const before = (await stack.query<{ row: Record<string, unknown> }>('select to_jsonb(s) as row from students s where id = $1', [student.id]))[0]!.row;
  const change = {
    phone: '11955556666',
    address: 'Av. Central, 100',
    emergencyContactName: 'Rui Prado',
    emergencyContactPhone: '11944445555',
  };

  const { result: response, rows } = await written(stack, () => client.patch('/api/me/profile', change));

  expect(response.status).toBe(200);
  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(PROFILE_KEYS);
  expect(body).toMatchObject(change);

  const after = (await stack.query<{ row: Record<string, unknown> }>('select to_jsonb(s) as row from students s where id = $1', [student.id]))[0]!.row;
  const changed = Object.keys(after).filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]));
  expect(changed.sort()).toEqual(['address', 'emergency_contact_name', 'emergency_contact_phone', 'phone', 'updated_at']);

  expect(rows.map(({ action, user_id, entity_id }) => ({ action, user_id, entity_id }))).toEqual([
    { action: 'student.updated', user_id: user.id, entity_id: student.id },
  ]);
  expect(((rows[0]!.diff as { fields: string[] }).fields).sort()).toEqual(Object.keys(change).sort());

  const { rows: one } = await written(stack, () => client.patch('/api/me/profile', { phone: '11966667777' }));
  expect(one.map((row) => row.action)).toEqual(['student.updated']);
  expect((one[0]!.diff as { fields: string[] }).fields).toEqual(['phone']);

  const { result: same, rows: none } = await written(stack, () => client.patch('/api/me/profile', { phone: '11966667777' }));
  expect(same.status).toBe(200);
  expect(none).toEqual([]);
});

test('patch_contact_fields_use_student_schemas_422', async () => {
  const { client, student } = await portalSession(stack, mail);
  const before = await studentRowText(stack, student.id);

  const phone = await client.patch('/api/me/profile', { phone: '123' });
  expect(phone.status).toBe(422);
  expect(await fieldErrorPaths(phone)).toEqual(['phone']);

  const pair = await client.patch('/api/me/profile', { emergencyContactName: 'Só o nome' });
  expect(pair.status).toBe(422);
  expect(await fieldErrorPaths(pair)).toEqual(['emergencyContactPhone']);

  expect(await studentRowText(stack, student.id)).toBe(before);
});

test('eight_forbidden_keys_422_and_nothing_changes', async () => {
  const { client, student, user } = await portalSession(stack, mail);
  const refused: Array<[string, unknown]> = [
    ['email', 'outro@example.com'],
    ['cpf', '52998224725'],
    ['name', 'Outro Nome'],
    ['birthDate', '1990-01-01'],
    ['sex', 'female'],
    ['healthNotes', 'Nada'],
    ['status', 'suspended'],
    ['guardian', { name: 'Ana Souza', cpf: '123.456.789-09', phone: '11912345678', relationship: 'mother' }],
  ];
  expect(refused).toHaveLength(8);
  const rowBefore = await studentRowText(stack, student.id);
  const userBefore = await usersRowText(user.id);
  const auditBefore = await auditCount(stack);

  for (const [key, value] of refused) {
    for (const body of [{ [key]: value }, { [key]: value, phone: '11955556666' }]) {
      const response = await client.patch('/api/me/profile', body);
      expect(response.status, key).toBe(422);
      expect(await fieldErrorPaths(response), key).toContain(key);
    }
  }

  expect(await studentRowText(stack, student.id)).toBe(rowBefore);
  expect(await usersRowText(user.id)).toBe(userBefore);
  expect(await auditCount(stack)).toBe(auditBefore);
});

test('me_routes_never_change_email_or_cpf', async () => {
  const { client, student, user } = await portalSession(stack, mail);
  const identity = async () =>
    (
      await stack.query(
        `select s.email as student_email, s.cpf, u.email as user_email from students s join users u on u.student_id = s.id where s.id = $1`,
        [student.id],
      )
    )[0];
  const before = await identity();
  expect(before).toEqual({ student_email: student.email, cpf: student.cpf, user_email: user.email });
  const jpeg = await jpegBytes();

  const calls = [
    client.get('/api/me/profile'),
    client.get(`/api/me/profile?studentId=${student.id}`),
    client.get('/api/me/payments'),
    client.get('/api/me/photo'),
    client.patch('/api/me/profile', { phone: '11955556666', address: 'Rua Nova, 1' }),
    client.patch('/api/me/profile', { emergencyContactName: 'Só o nome' }),
    client.patch('/api/me/profile', { email: 'novo@example.com' }),
    client.patch('/api/me/profile', { cpf: '52998224725', phone: '11955556666' }),
    client.patch('/api/me/profile', { name: 'Outro', birthDate: '1990-01-01', sex: 'male', healthNotes: 'x', status: 'suspended' }),
  ];
  for (const call of calls) await call;
  expect((await postMyPhoto(client, jpeg)).status).toBe(201);
  expect((await postMyPhoto(client, jpeg)).status).toBe(409);
  expect((await client.get('/api/me/photo?variant=thumb')).status).toBe(200);

  expect(await identity()).toEqual(before);
});
