import { PASSWORD_MAX_LENGTH, type Problem, type SessionResponse } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { written } from './support/audit.ts';
import { databaseNow, nextIp, sha256 } from './support/leads.ts';
import { type CapturedMail, captureMail } from './support/mail.ts';
import {
  firstAccessBody,
  insertAdultStudent,
  insertStudentUser,
  passwordLink,
  postConsume,
  postFirstAccess,
  postReset,
  tokenRows,
} from './support/portal.ts';
import { type Stack, startStack } from './support/stack.ts';
import { releasedTogether } from './support/students.ts';

let stack: Stack;
let mail: CapturedMail;

beforeAll(async () => {
  mail = captureMail();
  stack = await startStack([], undefined, { mail: mail.transport });
}, 180_000);

afterAll(() => stack?.close());

const PASSWORD = 'senha-do-aluno-123';

/** Um primeiro acesso pelo caminho real: a ficha, o usuário dele e o token lido do e-mail capturado. */
async function firstAccess(columns: Record<string, unknown> = {}) {
  const student = await insertAdultStudent(stack, columns);
  const sent = mail.sent.length;
  expect((await postFirstAccess(stack.client(), firstAccessBody(student))).status, 'primeiro acesso').toBe(202);
  const message = mail.sent.slice(sent).find((item) => item.to === student.email)!;
  const [user] = await stack.query<{ id: string }>('select id from users where student_id = $1', [student.id]);
  return { student, userId: user!.id, token: passwordLink(message).token };
}

/** Um `reset` pelo caminho real, de um usuário de aluno ativo com senha. */
async function resetToken(email: string) {
  const sent = mail.sent.length;
  expect((await postReset(stack.client(), { email })).status, 'redefinição').toBe(202);
  return passwordLink(mail.sent.slice(sent).find((item) => item.to === email)!).token;
}

const insertSession = (userId: string) =>
  stack.query(`insert into sessions (user_id, token, expires_at) values ($1, $2, now() + interval '30 minutes')`, [
    userId,
    `sessao-de-teste-${crypto.randomUUID()}`,
  ]);
const sessionsOf = (userId: string) => stack.query('select id from sessions where user_id = $1', [userId]);

/** O que o consumo pode mudar: a conta, o usuário e os tokens. */
async function credentials(userId: string) {
  const text = (sql: string) => stack.query<{ row: string }>(sql, [userId]);
  return {
    accounts: await text('select to_jsonb(a)::text as row from accounts a where user_id = $1 order by 1'),
    user: await text('select to_jsonb(u)::text as row from users u where id = $1'),
    tokens: await text('select to_jsonb(p)::text as row from password_tokens p where user_id = $1 order by 1'),
  };
}

const login = (email: string, password: string) => stack.client().post('/api/auth/login', { email, password });
const pathsOf = async (response: Response) => ((await response.json()) as Problem).errors?.map((error) => error.path);

test('consume_204_sets_credential_activates_marks_used_and_drops_sessions', async () => {
  const { student, userId, token } = await firstAccess();
  await insertSession(userId);
  expect(await sessionsOf(userId)).toHaveLength(1);
  const ip = nextIp();

  const t0 = await databaseNow(stack);
  const { result: response, rows } = await written(stack, () => postConsume(stack.client(), { token, password: PASSWORD }, ip));
  const t1 = await databaseNow(stack);

  expect(response.status).toBe(204);
  expect(await stack.query(`select provider_id from accounts where user_id = $1`, [userId])).toEqual([{ provider_id: 'credential' }]);
  expect(await stack.query('select active from users where id = $1', [userId])).toEqual([{ active: true }]);
  const [used] = (await tokenRows(stack, userId)).filter((row) => row.token_hash === sha256(token));
  expect(used!.used_at!.getTime()).toBeGreaterThanOrEqual(t0.getTime());
  expect(used!.used_at!.getTime()).toBeLessThanOrEqual(t1.getTime());
  expect(await sessionsOf(userId)).toEqual([]);
  expect(rows.map(({ action, user_id, entity_id, ip: from }) => ({ action, user_id, entity_id, ip: from }))).toEqual([
    { action: 'student.portal_password_set', user_id: null, entity_id: student.id, ip },
  ]);
});

test('six_invalid_tokens_422_and_token_before_expiry_204', async () => {
  const { userId, token } = await firstAccess();
  const used = await firstAccess();
  expect((await postConsume(stack.client(), { token: used.token, password: PASSWORD })).status).toBe(204);
  const expired = await firstAccess();
  await stack.query(`update password_tokens set expires_at = now() - interval '1 second' where token_hash = $1`, [sha256(expired.token)]);

  const cases: Array<[label: string, body: Record<string, unknown>, owner: string]> = [
    ['token ausente', { password: PASSWORD }, userId],
    ['token vazio', { token: '', password: PASSWORD }, userId],
    ['abc', { token: 'abc', password: PASSWORD }, userId],
    ['43 caracteres de token nenhum', { token: 'x'.repeat(43), password: PASSWORD }, userId],
    ['token usado', { token: used.token, password: 'outra-senha-1234' }, used.userId],
    ['vencido há um segundo', { token: expired.token, password: PASSWORD }, expired.userId],
  ];
  for (const [label, body, owner] of cases) {
    const before = await credentials(owner);

    const response = await postConsume(stack.client(), body);

    expect(response.status, label).toBe(422);
    expect(await pathsOf(response), label).toEqual(['token']);
    expect(await credentials(owner), label).toEqual(before);
  }

  // um minuto antes do prazo ainda vale
  await stack.query(`update password_tokens set expires_at = now() + interval '1 minute' where token_hash = $1`, [sha256(token)]);
  expect((await postConsume(stack.client(), { token, password: PASSWORD })).status).toBe(204);
});

test('password_bounds_11_and_max_plus_one_422_token_unused', async () => {
  const { userId, token } = await firstAccess();
  const unusedOf = async () => (await tokenRows(stack, userId)).find((row) => row.token_hash === sha256(token))!.used_at;

  for (const length of [11, PASSWORD_MAX_LENGTH + 1]) {
    const response = await postConsume(stack.client(), { token, password: 'a'.repeat(length) });
    expect(response.status, String(length)).toBe(422);
    expect(await pathsOf(response), String(length)).toEqual(['password']);
    expect(await unusedOf(), String(length)).toBeNull();
  }
  expect((await postConsume(stack.client(), { token, password: 'a'.repeat(12) })).status).toBe(204);
  const other = await firstAccess();
  expect((await postConsume(stack.client(), { token: other.token, password: 'b'.repeat(PASSWORD_MAX_LENGTH) })).status).toBe(204);
});

test('two_concurrent_consumes_one_204_one_422', async () => {
  const { student, token } = await firstAccess();
  const passwords = ['primeira-senha-123', 'segunda-senha-456'];

  const { result: responses, rows } = await written(stack, () =>
    releasedTogether(passwords.map((password) => () => postConsume(stack.client(), { token, password }))),
  );

  expect(responses.map((response) => response.status).sort()).toEqual([204, 422]);
  const loser = responses.find((response) => response.status === 422)!;
  expect(await pathsOf(loser)).toEqual(['token']);
  const winner = passwords[responses.findIndex((response) => response.status === 204)]!;
  const loserPassword = passwords.find((password) => password !== winner)!;
  expect((await login(student.email!, winner)).status).toBe(200);
  expect((await login(student.email!, loserPassword)).status).toBe(401);
  expect(rows.filter((row) => row.action === 'student.portal_password_set')).toHaveLength(1);
});

test('token_of_inactivated_or_anonymized_student_422', async () => {
  const admin = (await stack.session('admin')).client;

  const inactivated = await firstAccess();
  expect((await admin.delete(`/api/students/${inactivated.student.id}`)).status).toBe(204);
  const beforeInactivated = await credentials(inactivated.userId);
  const refused = await postConsume(stack.client(), { token: inactivated.token, password: PASSWORD });
  expect(refused.status).toBe(422);
  expect(await pathsOf(refused)).toEqual(['token']);
  expect(await stack.query('select password from accounts where user_id = $1', [inactivated.userId])).toEqual([]);
  expect(await credentials(inactivated.userId)).toEqual(beforeInactivated);

  const anonymized = await firstAccess();
  expect((await admin.delete(`/api/students/${anonymized.student.id}`)).status).toBe(204);
  expect((await admin.post(`/api/students/${anonymized.student.id}/anonymization`)).status).toBe(204);
  const beforeAnonymized = await stack.query('select password from accounts where user_id = $1', [anonymized.userId]);
  const refusedAnonymized = await postConsume(stack.client(), { token: anonymized.token, password: PASSWORD });
  expect(refusedAnonymized.status).toBe(422);
  expect(await pathsOf(refusedAnonymized)).toEqual(['token']);
  expect(await stack.query('select password from accounts where user_id = $1', [anonymized.userId])).toEqual(beforeAnonymized);
});

test('open_token_on_ficha_inactive_or_anonymized_by_sql_422', async () => {
  const inactive = await firstAccess();
  await stack.query(`update students set status = 'inactive', inactivated_at = now() where id = $1`, [inactive.student.id]);
  const anonymized = await firstAccess();
  await stack.query(
    `update students set name = 'Titular anonimizado', status = 'inactive', inactivated_at = now(), anonymized_at = now(),
       cpf = null, birth_date = null, sex = null, email = null, phone = null, address = null,
       emergency_contact_name = null, emergency_contact_phone = null, health_notes_enc = null
     where id = $1`,
    [anonymized.student.id],
  );

  for (const { token, userId } of [inactive, anonymized]) {
    expect((await tokenRows(stack, userId)).map((row) => row.used_at)).toEqual([null]);
    const before = await credentials(userId);

    const refused = await postConsume(stack.client(), { token, password: PASSWORD });

    expect(refused.status).toBe(422);
    expect(await pathsOf(refused)).toEqual(['token']);
    expect(await credentials(userId)).toEqual(before);
  }
});

test('login_after_set_password_role_student_no_enrollment', async () => {
  const { student, token } = await firstAccess();
  expect((await postConsume(stack.client(), { token, password: PASSWORD })).status).toBe(204);

  const client = stack.client();
  const response = await client.post('/api/auth/login', { email: student.email, password: PASSWORD });
  expect(response.status).toBe(200);
  const session = await client.get('/api/auth/session');
  expect(session.status).toBe(200);
  const body = (await session.json()) as SessionResponse;
  expect(body.user.role).toBe('student');
  expect(body.twoFactorEnrollmentRequired).toBe(false);
});

test('reset_token_replaces_password_and_drops_sessions', async () => {
  const user = await insertStudentUser(stack);
  await stack.signIn(user);
  await stack.signIn(user);
  expect(await sessionsOf(user.id)).toHaveLength(2);
  const token = await resetToken(user.email);

  const response = await postConsume(stack.client(), { token, password: 'senha-redefinida-1' });

  expect(response.status).toBe(204);
  expect((await login(user.email, user.password)).status).toBe(401);
  expect(await sessionsOf(user.id)).toEqual([]);
  expect((await login(user.email, 'senha-redefinida-1')).status).toBe(200);
});
