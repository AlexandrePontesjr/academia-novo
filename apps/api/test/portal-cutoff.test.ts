import type { MyProfile, StudentDetail } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { withAuditInsertFailing } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { type CapturedMail, captureMail } from './support/mail.ts';
import { firstAccessBody, passwordLink, portalSession, postConsume, postFirstAccess, postReset } from './support/portal.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { fieldErrorPaths, studentRowText } from './support/students.ts';

let stack: Stack;
let mail: CapturedMail;
let reception: Client;

beforeAll(async () => {
  mail = captureMail();
  stack = await startStack([], undefined, { mail: mail.transport });
  reception = (await stack.session('reception')).client;
}, 180_000);

afterAll(() => stack?.close());

const userRow = async (id: string) =>
  (await stack.query<{ row: string }>('select to_jsonb(u)::text as row from users u where id = $1', [id]))[0]!.row;

const userActive = async (id: string) =>
  (await stack.query<{ active: boolean }>('select active from users where id = $1', [id]))[0]!.active;

const sessionsOf = (id: string) => stack.query<{ id: string }>('select id from sessions where user_id = $1 order by id', [id]);

/** Um aluno com login e duas sessões abertas. */
async function withTwoSessions() {
  const session = await portalSession(stack, mail);
  const second = await stack.signIn({ email: session.user.email, password: session.user.password });
  return { ...session, second };
}

test('inactivation_disables_user_and_drops_sessions_in_one_transaction', async () => {
  const failing = await withTwoSessions();
  const ficha = await studentRowText(stack, failing.student.id);
  const user = await userRow(failing.user.id);
  const sessions = await sessionsOf(failing.user.id);
  expect(sessions).toHaveLength(2);

  const refused = await withAuditInsertFailing(stack, () => reception.request('DELETE', `/api/students/${failing.student.id}`));

  expect(refused.status).toBe(500);
  expect(await studentRowText(stack, failing.student.id)).toBe(ficha);
  expect(await userRow(failing.user.id)).toBe(user);
  expect(await sessionsOf(failing.user.id)).toEqual(sessions);

  const response = await reception.request('DELETE', `/api/students/${failing.student.id}`);

  expect(response.status).toBe(204);
  const [row] = await stack.query<{ status: string; active: boolean; sessions: string }>(
    `select s.status, u.active, (select count(*) from sessions where user_id = u.id) as sessions
       from students s join users u on u.student_id = s.id where s.id = $1`,
    [failing.student.id],
  );
  expect(row).toEqual({ status: 'inactive', active: false, sessions: '0' });

  const next = await failing.client.get('/api/me/profile');
  expect(next.status).toBe(401);
  expect((await problem(next)).code).toBe('unauthorized');
});

test('suspension_keeps_user_and_sessions', async () => {
  const { client, student, user } = await portalSession(stack, mail);
  const before = await userRow(user.id);
  const sessions = await sessionsOf(user.id);

  const response = await reception.patch(`/api/students/${student.id}`, { status: 'suspended' });

  expect(response.status).toBe(200);
  expect(await userRow(user.id)).toBe(before);
  expect(await sessionsOf(user.id)).toEqual(sessions);
  const profile = await client.get('/api/me/profile');
  expect(profile.status).toBe(200);
  expect(((await profile.json()) as MyProfile).status).toBe('suspended');
  expect((await stack.client().post('/api/auth/login', { email: user.email, password: user.password })).status).toBe(200);
});

test('refused_patch_inactive_leaves_user_alone', async () => {
  const { student, user } = await withTwoSessions();
  const before = await userRow(user.id);
  const sessions = await sessionsOf(user.id);

  const response = await reception.patch(`/api/students/${student.id}`, { status: 'inactive' });

  expect(response.status).toBe(422);
  expect(await fieldErrorPaths(response)).toEqual(['status']);
  expect(await userRow(user.id)).toBe(before);
  expect(await sessionsOf(user.id)).toEqual(sessions);
});

test('disabled_student_login_401_like_inactive_staff', async () => {
  const { student, user } = await portalSession(stack, mail);
  expect((await reception.request('DELETE', `/api/students/${student.id}`)).status).toBe(204);
  const staff = await stack.seed({ active: false });

  const response = await stack.client().post('/api/auth/login', { email: user.email, password: user.password });
  const inactive = await stack.client().post('/api/auth/login', { email: staff.email, password: staff.password });

  expect(response.status).toBe(401);
  const withoutRequestId = async (answer: Response) => {
    const body = (await answer.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'requestId'));
  };
  expect(await withoutRequestId(response)).toEqual(await withoutRequestId(inactive));
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(await sessionsOf(user.id)).toEqual([]);
});

test('reactivation_does_not_revive_links_issued_before_inactivation', async () => {
  const { student, user } = await portalSession(stack, mail);
  mail.clear();
  expect((await postReset(stack.client(), { email: user.email })).status).toBe(202);
  const { token } = passwordLink(mail.sent[0]!);
  expect((await reception.request('DELETE', `/api/students/${student.id}`)).status).toBe(204);
  expect((await reception.patch(`/api/students/${student.id}`, { status: 'active' })).status).toBe(200);

  const response = await postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-2' });

  expect(response.status).toBe(422);
  expect(await fieldErrorPaths(response)).toEqual(['token']);
  expect(await userActive(user.id)).toBe(false);
});

test('reactivation_keeps_user_disabled_until_new_first_access', async () => {
  const { student, user } = await portalSession(stack, mail);
  expect((await reception.request('DELETE', `/api/students/${student.id}`)).status).toBe(204);

  const reactivated = await reception.patch(`/api/students/${student.id}`, { status: 'active' });

  expect(reactivated.status).toBe(200);
  expect(await userActive(user.id)).toBe(false);
  const ficha = async () => (await (await reception.get(`/api/students/${student.id}`)).json()) as StudentDetail;
  expect((await ficha()).portal).toBe('disabled');

  mail.clear();
  const asked = await postFirstAccess(stack.client(), firstAccessBody(student));
  expect(asked.status).toBe(202);
  expect(await stack.query('select id from users where student_id = $1', [student.id])).toEqual([{ id: user.id }]);
  expect(mail.sent).toHaveLength(1);

  const newPassword = 'senha-nova-do-aluno-1';
  expect((await postConsume(stack.client(), { token: passwordLink(mail.sent[0]!).token, password: newPassword })).status).toBe(204);

  expect((await ficha()).portal).toBe('active');
  expect((await stack.client().post('/api/auth/login', { email: user.email, password: newPassword })).status).toBe(200);
});
