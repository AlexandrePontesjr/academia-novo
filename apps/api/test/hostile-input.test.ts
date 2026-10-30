import { saoPauloToday } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Client } from './support/client.ts';
import { captureMail } from './support/mail.ts';
import { jpegBytes } from './support/photos.ts';
import { createPlan, enroll, planBody } from './support/plans.ts';
import { portalSession } from './support/portal.ts';
import { type Stack, startStack } from './support/stack.ts';
import { createStaff, sendStaffPhoto, staffBody, staffPhotoPath } from './support/staff.ts';
import { createStudent, studentBody } from './support/students.ts';

let stack: Stack;
const mail = captureMail();

beforeAll(async () => {
  stack = await startStack([], undefined, { mail: mail.transport });
}, 180_000);

afterAll(() => stack?.close());

// Entrada hostil em todo campo de texto, em todo `:id` e em todo corpo: a resposta pode ser
// qualquer recusa do contrato, nunca um `5xx`. Nasceu dos achados N1 a N3 da verificação.
test('hostile_input_never_answers_5xx', async () => {
  const admin = (await stack.session('admin')).client;
  const user = await stack.seed();
  const plain = await stack.signIn(user);
  const enrolledUser = await stack.seed();
  await stack.enrollTwoFactor(await stack.signIn(enrolledUser));
  const pending = stack.client();
  await pending.post('/api/auth/login', { email: enrolledUser.email, password: enrolledUser.password });
  const weird = ['a\u0000b', '\ud800', '😀'.repeat(50), 'x'.repeat(60_000), "' or 1=1 --", '%00', '\\'];
  const results: string[] = [];
  const note = async (name: string, response: Response) => {
    results.push(`${response.status} ${name}`);
    await response.text();
  };

  for (const value of weird) {
    const tag = JSON.stringify(value.slice(0, 8));
    await note(`verify code ${tag}`, await pending.post('/api/auth/two-factor/verify', { code: value }));
    await note(`verify backup ${tag}`, await pending.post('/api/auth/two-factor/verify', { backupCode: value }));
    await note(`login password ${tag}`, await stack.client().post('/api/auth/login', { email: user.email, password: value }));
    await note(`enable password ${tag}`, await plain.post('/api/auth/two-factor/enable', { password: value }));
    await note(`confirm code ${tag}`, await plain.post('/api/auth/two-factor/confirm', { code: value }));
    await note(`disable password ${tag}`, await plain.post('/api/auth/two-factor/disable', { password: value }));
    await note(`change current ${tag}`, await plain.put('/api/auth/password', { currentPassword: value, newPassword: 'senha-valida-123' }));
    await note(`create name ${tag}`, await admin.post('/api/users', { name: value, email: `p${results.length}@exemplo.com`, role: 'reception', password: 'senha-valida-123' }));
    await note(`create password ${tag}`, await admin.post('/api/users', { name: 'Nome', email: `q${results.length}@exemplo.com`, role: 'reception', password: `${value}-senha-valida`.slice(0, 100) }));
    await note(`patch name ${tag}`, await admin.patch(`/api/users/${user.id}`, { name: value }));
    await note(`reset password ${tag}`, await admin.put(`/api/users/${user.id}/password`, { password: `${value}-senha-valida`.slice(0, 100) }));
  }
  for (const segment of ['%E0%A4%A', '%00', 'a%2Fb', '%ED%A0%80', '..%2F..', 'x'.repeat(5000)]) {
    await note(`id ${segment.slice(0, 12)}`, await admin.patch(`/api/users/${segment}`, { name: 'X' }));
    await note(`id2 ${segment.slice(0, 12)}`, await admin.request('DELETE', `/api/users/${segment}/two-factor`));
  }
  for (const body of ['[]', 'null', '7', '"texto"', '{"email":{"a":1},"password":[1]}', '{"email":null}']) {
    await note(`login body ${body}`, await stack.client().request('POST', '/api/auth/login', { body, headers: { 'Content-Type': 'application/json' } }));
    await note(`users body ${body}`, await admin.request('POST', '/api/users', { body, headers: { 'Content-Type': 'application/json' } }));
  }

  // as rotas de funcionário: texto hostil em cada campo de `POST` e `PATCH`, em `userId` do `PUT`, em todo `:id` e em todo corpo
  const staff = await createStaff(admin, staffBody(9001));
  const staffUser = await stack.seed();
  for (const value of weird) {
    const tag = JSON.stringify(value.slice(0, 8));
    for (const field of ['name', 'position', 'department', 'email', 'phone']) {
      await note(`staff create ${field} ${tag}`, await admin.post('/api/staff', staffBody(9002, { [field]: value })));
      await note(`staff patch ${field} ${tag}`, await admin.patch(`/api/staff/${staff.id}`, { [field]: value }));
    }
    await note(`staff link userId ${tag}`, await admin.put(`/api/staff/${staff.id}/user`, { userId: value }));
  }
  const photo = await jpegBytes();
  for (const segment of ['%E0%A4%A', '%00', 'a%2Fb', '..%2F..', 'x'.repeat(5000)]) {
    const tag = segment.slice(0, 12);
    await note(`staff get ${tag}`, await admin.get(`/api/staff/${segment}`));
    await note(`staff patch ${tag}`, await admin.patch(`/api/staff/${segment}`, { position: 'X' }));
    await note(`staff delete ${tag}`, await admin.delete(`/api/staff/${segment}`));
    await note(`staff link ${tag}`, await admin.put(`/api/staff/${segment}/user`, { userId: staffUser.id }));
    await note(`staff unlink ${tag}`, await admin.delete(`/api/staff/${segment}/user`));
    await note(`staff photo post ${tag}`, await sendStaffPhoto(admin, 'POST', segment, photo));
    await note(`staff photo put ${tag}`, await sendStaffPhoto(admin, 'PUT', segment, photo));
    await note(`staff photo delete ${tag}`, await admin.delete(staffPhotoPath(segment)));
  }
  for (const body of ['[]', 'null', '7', '"texto"', '{"name":{"a":1}}']) {
    await note(`staff body ${body}`, await admin.request('POST', '/api/staff', { body, headers: { 'Content-Type': 'application/json' } }));
  }

  // as rotas de plano e de matrícula: texto hostil em `name` e `rules`, em `planId` e `startsAt`, em todo `:id` e em todo corpo
  const plan = await createPlan(admin);
  const student = await createStudent(admin, studentBody(9101));
  const enrollments = `/api/students/${student.id}/enrollments`;
  const enrollment = await enroll(admin, student.id, plan.id, saoPauloToday());
  const before = results.length;
  for (const value of weird) {
    const tag = JSON.stringify(value.slice(0, 8));
    for (const field of ['name', 'rules']) {
      await note(`plan create ${field} ${tag}`, await admin.post('/api/plans', planBody({ [field]: value })));
      await note(`plan patch ${field} ${tag}`, await admin.patch(`/api/plans/${plan.id}`, { [field]: value }));
    }
    await note(`enroll planId ${tag}`, await admin.post(enrollments, { planId: value, startsAt: saoPauloToday() }));
    await note(`enroll startsAt ${tag}`, await admin.post(enrollments, { planId: plan.id, startsAt: value }));
  }
  for (const segment of ['%E0%A4%A', '%00', 'a%2Fb', '..%2F..', 'x'.repeat(5000)]) {
    const tag = segment.slice(0, 12);
    await note(`plan patch ${tag}`, await admin.patch(`/api/plans/${segment}`, { name: 'X' }));
    await note(`plan delete ${tag}`, await admin.delete(`/api/plans/${segment}`));
    await note(`enrollments get ${tag}`, await admin.get(`/api/students/${segment}/enrollments`));
    await note(`enrollments post ${tag}`, await admin.post(`/api/students/${segment}/enrollments`, { planId: plan.id, startsAt: saoPauloToday() }));
    await note(`enrollments delete id ${tag}`, await admin.delete(`/api/students/${segment}/enrollments/${enrollment.id}`));
    await note(`enrollments delete enrollmentId ${tag}`, await admin.delete(`${enrollments}/${segment}`));
  }
  for (const body of ['[]', 'null', '7', '"texto"', '{"name":{"a":1}}']) {
    await note(`plan body ${body}`, await admin.request('POST', '/api/plans', { body, headers: { 'Content-Type': 'application/json' } }));
    await note(`enroll body ${body}`, await admin.request('POST', enrollments, { body, headers: { 'Content-Type': 'application/json' } }));
  }
  // sete valores em seis campos, cinco segmentos em seis posições e cinco corpos nos dois `POST`
  expect(results.length - before).toBe(7 * 6 + 5 * 6 + 5 * 2);

  expect(results.length).toBeGreaterThan(100);
  expect(results.filter((line) => line.startsWith('5'))).toEqual([]);
}, 120_000);

test('portal_hostile_bodies', async () => {
  const student = await portalSession(stack, mail);
  const json = { 'Content-Type': 'application/json' };
  const routes: Array<[method: string, path: string, client: Client, valid: Record<string, unknown>]> = [
    ['POST', '/api/portal/first-access', stack.client(), { cpf: '529.982.247-25', email: 'hostil@example.com' }],
    ['POST', '/api/password-tokens/consume', stack.client(), { token: 'x'.repeat(43), password: 'senha-do-portal-123' }],
    ['POST', '/api/password-reset', stack.client(), { email: 'hostil@example.com' }],
    ['PATCH', '/api/me/profile', student.client, { address: 'Rua Nova, 1' }],
  ];

  for (const [method, path, client, valid] of routes) {
    const notJson = await client.request(method, path, { body: '{"cpf": "1",', headers: json });
    expect(notJson.status, path).toBe(400);
    expect(((await notJson.json()) as { code: string }).code, path).toBe('bad_request');

    const huge = await client.request(method, path, { body: JSON.stringify({ ...valid, padding: 'x'.repeat(1024 * 1024) }), headers: json });
    expect(huge.status, path).toBe(413);
    await huge.text();
  }

  const address = await student.client.request('PATCH', '/api/me/profile', {
    body: JSON.stringify({ address: 'Rua \ud800 Nova' }),
    headers: json,
  });
  expect(address.status).toBe(422);
  expect(((await address.json()) as { errors: Array<{ path: string }> }).errors.map((error) => error.path)).toEqual(['address']);

  const password = await stack.client().request('POST', '/api/password-tokens/consume', {
    body: JSON.stringify({ token: 'x'.repeat(43), password: 'senha-\ud800-do-portal' }),
    headers: json,
  });
  expect(password.status).toBe(422);
  expect(((await password.json()) as { errors: Array<{ path: string }> }).errors.map((error) => error.path)).toEqual(['password']);
});

test('lead_create_hostile_bodies', async () => {
  const anonymous = stack.client();
  const json = { 'Content-Type': 'application/json' };
  const valid = { name: 'Ana Souza', email: 'hostil@example.com', phone: '11987654321', adult: true, termVersion: 1 };

  const notJson = await anonymous.request('POST', '/api/leads', { body: '{"name": "Ana",', headers: json });
  expect(notJson.status).toBe(400);
  expect(((await notJson.json()) as { code: string }).code).toBe('bad_request');

  const huge = await anonymous.request('POST', '/api/leads', { body: JSON.stringify({ ...valid, name: 'x'.repeat(1024 * 1024) }), headers: json });
  expect(huge.status).toBe(413);
  await huge.text();

  // o substituto solto chega ao JSON escapado e não vira `500`
  const surrogate = await anonymous.request('POST', '/api/leads', { body: JSON.stringify({ ...valid, name: 'Ana \ud800 Souza' }), headers: json });
  expect(surrogate.status).toBe(422);
  expect(((await surrogate.json()) as { errors: Array<{ path: string }> }).errors.map((error) => error.path)).toEqual(['name']);
});
