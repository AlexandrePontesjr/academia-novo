import type { PendingPhoto } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount, auditRows, withAuditInsertFailing } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { nextIp } from './support/leads.ts';
import { type CapturedMail, captureMail } from './support/mail.ts';
import { bucketKeys, jpegBytes, type PhotoStack, startPhotoStack, uploaded, uploadPhoto } from './support/photos.ts';
import {
  firstAccessBody,
  insertAdultStudent,
  insertStudentUser,
  nextPortalEmail,
  passwordLink,
  pendingPath,
  portalSession,
  postConsume,
  postFirstAccess,
  postMyPhoto,
  postReset,
} from './support/portal.ts';
import type { Stack } from './support/stack.ts';
import { cpfOf, maskCpf } from './support/students.ts';

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

/** O que uma escrita recusada não pode mudar: as cinco tabelas, linha a linha, e o bucket. */
async function recorded() {
  const text = async (table: string) =>
    (await stack.query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by 1`)).map((row) => row.row);
  return {
    users: await text('users'),
    accounts: await text('accounts'),
    tokens: await text('password_tokens'),
    students: await text('students'),
    photos: await text('photos'),
    keys: await bucketKeys(env.minio),
  };
}

/** Um aluno com a foto corrente e uma pendente. */
async function withPending() {
  const session = await portalSession(stack, mail);
  await uploaded(await uploadPhoto(reception, session.student.id, await jpegBytes()));
  const response = await postMyPhoto(session.client, await jpegBytes());
  expect(response.status, 'envio de preparação').toBe(201);
  return { ...session, pending: (await response.json()) as PendingPhoto };
}

test('audit_failure_rolls_back_seven_writes', async () => {
  const asking = await insertAdultStudent(stack);

  const consuming = await insertAdultStudent(stack);
  mail.clear();
  expect((await postFirstAccess(stack.client(), firstAccessBody(consuming))).status).toBe(202);
  const { token } = passwordLink(mail.sent.find((message) => message.to === consuming.email)!);

  const resetting = await insertStudentUser(stack);
  const editing = await portalSession(stack, mail);
  const uploading = await portalSession(stack, mail);
  const approving = await withPending();
  const rejecting = await withPending();
  const jpeg = await jpegBytes();

  const writes: Array<[string, () => Promise<Response>]> = [
    ['first-access', () => postFirstAccess(stack.client(), firstAccessBody(asking))],
    ['consume', () => postConsume(stack.client(), { token, password: 'senha-do-portal-123' })],
    ['password-reset', () => postReset(stack.client(), { email: resetting.email })],
    ['PATCH /api/me/profile', () => editing.client.patch('/api/me/profile', { phone: '11955556666' })],
    ['POST /api/me/photo', () => postMyPhoto(uploading.client, jpeg)],
    ['approve', () => reception.post(pendingPath(approving.student.id, 'approve'))],
    ['reject', () => reception.post(pendingPath(rejecting.student.id, 'reject'))],
  ];
  expect(writes).toHaveLength(7);

  for (const [name, write] of writes) {
    const before = await recorded();

    const response = await withAuditInsertFailing(stack, write);

    expect(response.status, name).toBe(500);
    expect(await recorded(), name).toEqual(before);
  }
});

test('public_trail_has_no_cpf_email_or_token_and_refusals_write_none', async () => {
  const student = await insertAdultStudent(stack);
  const marker = await auditCount(stack);
  mail.clear();
  expect((await postFirstAccess(stack.client(), firstAccessBody(student))).status).toBe(202);
  const { token } = passwordLink(mail.sent.find((message) => message.to === student.email)!);
  expect((await postConsume(stack.client(), { token, password: 'senha-do-portal-123' })).status).toBe(204);
  expect((await postReset(stack.client(), { email: student.email })).status).toBe(202);

  const trail = (await auditRows(stack)).slice(marker);
  expect(trail.map((row) => row.action).sort()).toEqual([
    'student.portal_access_requested',
    'student.portal_password_set',
    'student.portal_reset_requested',
  ]);
  for (const row of trail) {
    const text = JSON.stringify(row);
    expect(text, row.action).not.toContain(student.cpf);
    expect(text, row.action).not.toContain(maskCpf(student.cpf));
    expect(text, row.action).not.toContain(student.email!);
    expect(text, row.action).not.toContain(token);
  }

  // as nove recusas do primeiro acesso
  const [{ tomorrow }] = (await stack.query<{ tomorrow: string }>(
    `select to_char(((now() at time zone 'America/Sao_Paulo')::date + 1) - interval '18 years', 'YYYY-MM-DD') as tomorrow`,
  )) as [{ tomorrow: string }];
  const differs = await insertAdultStudent(stack);
  const minor = await insertAdultStudent(stack, { birth_date: tomorrow });
  const guarded = await insertAdultStudent(stack);
  await stack.query(`insert into guardians (student_id, name, cpf, phone, relationship) values ($1, 'Bia Souza', $2, '11912345678', 'mother')`, [
    guarded.id,
    cpfOf(98_002),
  ]);
  const inactive = await insertAdultStudent(stack, { status: 'inactive' });
  const anonymized = await insertAdultStudent(stack);
  const anonymizedBody = firstAccessBody(anonymized);
  await stack.query(
    `update students set name = 'Titular anonimizado', status = 'inactive', inactivated_at = now(), anonymized_at = now(),
       cpf = null, birth_date = null, sex = null, email = null, phone = null, address = null,
       emergency_contact_name = null, emergency_contact_phone = null, health_notes_enc = null where id = $1`,
    [anonymized.id],
  );
  const staff = await stack.seed({ role: 'reception' });
  const sharesEmail = await insertAdultStudent(stack, { email: staff.email });
  const withLogin = await insertStudentUser(stack);
  const noEmail = await insertAdultStudent(stack, { email: null });
  const refusedAccess: unknown[] = [
    { cpf: maskCpf(cpfOf(98_001)), email: 'ninguem@example.com' },
    firstAccessBody(differs, { email: 'outro@example.com' }),
    firstAccessBody(minor),
    firstAccessBody(guarded),
    firstAccessBody(inactive),
    anonymizedBody,
    firstAccessBody(sharesEmail),
    firstAccessBody(withLogin.student),
    firstAccessBody(noEmail, { email: 'sem-ficha@example.com' }),
  ];
  expect(refusedAccess).toHaveLength(9);

  // as quatro da redefinição
  const inactiveUser = await insertStudentUser(stack, { active: false });
  const withoutPassword = await insertStudentUser(stack, { active: false, withPassword: false });
  const refusedReset = [nextPortalEmail('ninguem'), staff.email, inactiveUser.email, withoutPassword.email];

  const before = await auditCount(stack);
  for (const body of refusedAccess) expect((await postFirstAccess(stack.client(), body)).status).toBe(202);
  for (const email of refusedReset) expect((await postReset(stack.client(), { email })).status).toBe(202);

  // os `422`
  expect((await postFirstAccess(stack.client(), { cpf: '123', email: 'ana@' })).status).toBe(422);
  expect((await postReset(stack.client(), { email: 'ana@' })).status).toBe(422);
  expect((await postConsume(stack.client(), { token: 'abc', password: 'senha-do-portal-123' })).status).toBe(422);

  // os `429`: o quarto pedido do mesmo CPF e o quarto do mesmo e-mail
  const repeated = await insertAdultStudent(stack);
  const fourth = firstAccessBody(repeated, { email: 'errado@example.com' });
  for (let attempt = 0; attempt < 3; attempt += 1) expect((await postFirstAccess(stack.client(), fourth, nextIp())).status).toBe(202);
  expect((await postFirstAccess(stack.client(), fourth, nextIp())).status).toBe(429);
  const email = nextPortalEmail('ninguem');
  for (let attempt = 0; attempt < 3; attempt += 1) expect((await postReset(stack.client(), { email }, nextIp())).status).toBe(202);
  expect((await postReset(stack.client(), { email }, nextIp())).status).toBe(429);

  expect(await auditCount(stack)).toBe(before);
});
