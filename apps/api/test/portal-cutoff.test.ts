import type { MyProfile, StudentDetail } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { withAuditInsertFailing } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { type CapturedMail, captureMail } from './support/mail.ts';
import { firstAccessBody, insertAdultStudent, passwordLink, portalSession, postConsume, postFirstAccess, postReset, tokenRows } from './support/portal.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { fieldErrorPaths, studentRowText } from './support/students.ts';
import { totpCode } from './support/totp.ts';

const hashes = vi.hoisted(() => ({ before: undefined as ((password: string) => Promise<void>) | undefined }));

/** A API roda neste processo: `hashes.before` para um pedido no hash, um ponto sem instrução no banco. */
vi.mock('../src/password.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/password.ts')>();
  return {
    ...actual,
    hashPassword: async (password: string) => {
      await hashes.before?.(password);
      return actual.hashPassword(password);
    },
  };
});

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

const tokensClosed = async (id: string) => (await tokenRows(stack, id)).map((row) => [row.purpose, row.used_at !== null]);

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
  expect((await postReset(stack.client(), { email: failing.user.email })).status).toBe(202);
  const tokens = await tokenRows(stack, failing.user.id);
  expect(tokens.filter((row) => row.used_at === null)).toHaveLength(1);

  const refused = await withAuditInsertFailing(stack, () => reception.request('DELETE', `/api/students/${failing.student.id}`));

  expect(refused.status).toBe(500);
  expect(await studentRowText(stack, failing.student.id)).toBe(ficha);
  expect(await userRow(failing.user.id)).toBe(user);
  expect(await sessionsOf(failing.user.id)).toEqual(sessions);
  expect(await tokenRows(stack, failing.user.id)).toEqual(tokens);

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

test('failed_inactivation_keeps_open_link_usable', async () => {
  const { student, user } = await portalSession(stack, mail);
  mail.clear();
  expect((await postReset(stack.client(), { email: user.email })).status).toBe(202);
  const { token } = passwordLink(mail.sent[0]!);

  const refused = await withAuditInsertFailing(stack, () => reception.request('DELETE', `/api/students/${student.id}`));

  expect(refused.status).toBe(500);
  expect((await postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-4' })).status).toBe(204);
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
  expect(await tokensClosed(user.id)).toEqual([
    ['first_access', true],
    ['reset', true],
  ]);
  expect((await reception.patch(`/api/students/${student.id}`, { status: 'active' })).status).toBe(200);

  const response = await postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-2' });

  expect(response.status).toBe(422);
  expect(await fieldErrorPaths(response)).toEqual(['token']);
  expect(await userActive(user.id)).toBe(false);
});

test('reactivation_does_not_revive_first_access_link_issued_before_inactivation', async () => {
  const student = await insertAdultStudent(stack);
  mail.clear();
  expect((await postFirstAccess(stack.client(), firstAccessBody(student))).status).toBe(202);
  const { token } = passwordLink(mail.sent[0]!);
  const [user] = await stack.query<{ id: string }>('select id from users where student_id = $1', [student.id]);
  expect((await reception.request('DELETE', `/api/students/${student.id}`)).status).toBe(204);
  expect(await tokensClosed(user!.id)).toEqual([['first_access', true]]);
  expect((await reception.patch(`/api/students/${student.id}`, { status: 'active' })).status).toBe(200);

  const response = await postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-3' });

  expect(response.status).toBe(422);
  expect(await fieldErrorPaths(response)).toEqual(['token']);
  expect(await userActive(user!.id)).toBe(false);
});

const backendsIn = async (filter: string) =>
  Number((await stack.query<{ n: string }>(`select count(*) as n from pg_stat_activity where datname = current_database() and ${filter}`))[0]!.n);

const deadlocks = async () =>
  Number((await stack.query<{ n: string }>('select deadlocks as n from pg_stat_database where datname = current_database()'))[0]!.n);

/** O contador aparece com atraso depois que o backend que abortou volta ao ocioso; 11 s bastaram em todas as rodadas. */
const STATS_DELAY = 11_000;

/** Segura a linha dada até `first` e depois `second` entrarem na fila, nessa ordem. */
async function queuedOn(table: 'users' | 'password_tokens', id: string, first: () => Promise<Response>, second: () => Promise<Response>) {
  const before = await deadlocks();
  const holding = stack.query(`with l as (select id from ${table} where id = $1 for update) select pg_sleep(0.7) from l`, [id]);
  await vi.waitFor(async () => expect(await backendsIn(`wait_event = 'PgSleep'`)).toBe(1), { timeout: 500, interval: 5 });
  const answers = [first()];
  await vi.waitFor(async () => expect(await backendsIn(`wait_event_type = 'Lock'`)).toBe(1), { timeout: 600, interval: 5 });
  answers.push(second());
  await vi.waitFor(async () => expect(await backendsIn(`wait_event_type = 'Lock'`)).toBe(2), { timeout: 600, interval: 5 });
  const [firstAnswer, secondAnswer] = await Promise.all(answers);
  await holding;
  await new Promise((resolve) => setTimeout(resolve, STATS_DELAY));
  return { first: firstAnswer!, second: secondAnswer!, raised: (await deadlocks()) - before };
}

const queuedOnUser = (userId: string, first: () => Promise<Response>, second: () => Promise<Response>) => queuedOn('users', userId, first, second);

const accountRows = (id: string) => stack.query<{ row: string }>('select to_jsonb(a)::text as row from accounts a where user_id = $1 order by id', [id]);

test('inactivation_against_consume_204_422_without_deadlock', async () => {
  const { student, user } = await portalSession(stack, mail);
  mail.clear();
  expect((await postReset(stack.client(), { email: user.email })).status).toBe(202);
  const { token } = passwordLink(mail.sent[0]!);
  const accounts = await accountRows(user.id);

  const { first, second, raised } = await queuedOnUser(
    user.id,
    () => reception.request('DELETE', `/api/students/${student.id}`),
    () => postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-5' }),
  );

  expect(first.status).toBe(204);
  expect(second.status).toBe(422);
  expect(await fieldErrorPaths(second)).toEqual(['token']);
  expect(await userActive(user.id)).toBe(false);
  expect(await accountRows(user.id)).toEqual(accounts);
  expect(raised).toBe(0);
});

test('reset_against_consume_202_422_without_deadlock', async () => {
  const { user } = await portalSession(stack, mail);
  mail.clear();
  expect((await postReset(stack.client(), { email: user.email })).status).toBe(202);
  const { token } = passwordLink(mail.sent[0]!);
  const accounts = await accountRows(user.id);

  const { first, second, raised } = await queuedOnUser(
    user.id,
    () => postReset(stack.client(), { email: user.email }),
    () => postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-6' }),
  );

  expect(first.status).toBe(202);
  expect(second.status).toBe(422);
  expect(await fieldErrorPaths(second)).toEqual(['token']);
  expect(await userActive(user.id)).toBe(true);
  expect(await accountRows(user.id)).toEqual(accounts);
  expect(raised).toBe(0);
});

test('first_access_against_consume_202_422_without_deadlock', async () => {
  const student = await insertAdultStudent(stack);
  mail.clear();
  expect((await postFirstAccess(stack.client(), firstAccessBody(student))).status).toBe(202);
  const { token } = passwordLink(mail.sent[0]!);
  const [user] = await stack.query<{ id: string }>('select id from users where student_id = $1', [student.id]);

  const { first, second, raised } = await queuedOnUser(
    user!.id,
    () => postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-7' }),
    () => postFirstAccess(stack.client(), firstAccessBody(student)),
  );

  expect(second.status).toBe(202);
  expect(first.status).toBe(422);
  expect(await fieldErrorPaths(first)).toEqual(['token']);
  expect(await userActive(user!.id)).toBe(false);
  expect(await accountRows(user!.id)).toEqual([]);
  expect(raised).toBe(0);
});

test('consume_ahead_of_inactivation_on_held_token_204_204_without_deadlock', async () => {
  const { student, user } = await portalSession(stack, mail);
  mail.clear();
  expect((await postReset(stack.client(), { email: user.email })).status).toBe(202);
  const { token } = passwordLink(mail.sent[0]!);
  const open = (await tokenRows(stack, user.id)).find((row) => row.used_at === null)!;

  const { first, second, raised } = await queuedOn(
    'password_tokens',
    open.id,
    () => postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-8' }),
    () => reception.request('DELETE', `/api/students/${student.id}`),
  );

  expect(first.status).toBe(204);
  expect(second.status).toBe(204);
  const [row] = await stack.query<{ status: string }>('select status from students where id = $1', [student.id]);
  expect(row).toEqual({ status: 'inactive' });
  expect(await userActive(user.id)).toBe(false);
  expect((await tokenRows(stack, user.id)).filter((item) => item.used_at === null)).toEqual([]);
  expect(raised).toBe(0);
});

test('anonymization_ahead_of_consume_204_422_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const { student, user } = await portalSession(stack, mail);
  mail.clear();
  expect((await postReset(stack.client(), { email: user.email })).status).toBe(202);
  const { token } = passwordLink(mail.sent[0]!);
  expect((await reception.request('DELETE', `/api/students/${student.id}`)).status).toBe(204);

  const { first, second, raised } = await queuedOnUser(
    user.id,
    () => admin.post(`/api/students/${student.id}/anonymization`),
    () => postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-9' }),
  );

  expect(first.status).toBe(204);
  expect(second.status).toBe(422);
  expect(await fieldErrorPaths(second)).toEqual(['token']);
  expect(await accountRows(user.id)).toEqual([]);
  expect(await tokenRows(stack, user.id)).toEqual([]);
  expect(raised).toBe(0);
});

const login = (email: string, password: string) => stack.client().post('/api/auth/login', { email, password });

/** Um aluno com sessão e `reset` aberto, para outra escrita disputar o usuário com o consumo. */
async function contending() {
  const { client, student, user } = await portalSession(stack, mail);
  mail.clear();
  expect((await postReset(stack.client(), { email: user.email })).status).toBe(202);
  const { token } = passwordLink(mail.sent[0]!);
  const password = 'senha-nova-do-aluno-10';
  return {
    client,
    student,
    user,
    consume: () => postConsume(stack.client(), { token, password }),
    passwordChanged: async () => {
      expect((await login(user.email, password)).status).toBe(200);
      expect((await login(user.email, user.password)).status).toBe(401);
    },
  };
}

/** Um aluno com disputa pelo `PATCH` do telefone, pela equipe ou por ele mesmo. */
async function patchAgainstConsume(by: 'staff' | 'student') {
  const { client, student, user, consume, passwordChanged } = await contending();
  return {
    userId: user.id,
    patch: () =>
      by === 'staff'
        ? reception.patch(`/api/students/${student.id}`, { phone: '11987654321' })
        : client.patch('/api/me/profile', { phone: '11987654321' }),
    consume,
    applied: async () => {
      const [row] = await stack.query<{ phone: string }>('select phone from students where id = $1', [student.id]);
      expect(row).toEqual({ phone: '11987654321' });
      await passwordChanged();
    },
  };
}

test('staff_patch_ahead_of_consume_200_204_without_deadlock', async () => {
  const { userId, patch, consume, applied } = await patchAgainstConsume('staff');

  const { first, second, raised } = await queuedOnUser(userId, patch, consume);

  expect(first.status).toBe(200);
  expect(second.status).toBe(204);
  await applied();
  expect(raised).toBe(0);
});

test('consume_ahead_of_patch_204_200_without_deadlock', async () => {
  const { userId, patch, consume, applied } = await patchAgainstConsume('staff');

  const { first, second, raised } = await queuedOnUser(userId, consume, patch);

  expect(first.status).toBe(204);
  expect(second.status).toBe(200);
  await applied();
  expect(raised).toBe(0);
});

test('me_patch_ahead_of_consume_200_204_without_deadlock', async () => {
  const { userId, patch, consume, applied } = await patchAgainstConsume('student');

  const { first, second, raised } = await queuedOnUser(userId, patch, consume);

  expect(first.status).toBe(200);
  expect(second.status).toBe(204);
  await applied();
  expect(raised).toBe(0);
});

test('consume_ahead_of_me_patch_204_200_without_deadlock', async () => {
  const { userId, patch, consume, applied } = await patchAgainstConsume('student');

  const { first, second, raised } = await queuedOnUser(userId, consume, patch);

  expect(first.status).toBe(204);
  expect(second.status).toBe(200);
  await applied();
  expect(raised).toBe(0);
});

const twoFactorEnabled = async (id: string) =>
  (await stack.query<{ two_factor_enabled: boolean }>('select two_factor_enabled from users where id = $1', [id]))[0]!.two_factor_enabled;

test('two_factor_reset_ahead_of_consume_204_204_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const { user, consume, passwordChanged } = await contending();

  const { first, second, raised } = await queuedOnUser(user.id, () => admin.request('DELETE', `/api/users/${user.id}/two-factor`), consume);

  expect(first.status).toBe(204);
  expect(second.status).toBe(204);
  expect(await twoFactorEnabled(user.id)).toBe(false);
  expect(await sessionsOf(user.id)).toEqual([]);
  await passwordChanged();
  expect(raised).toBe(0);
});

test('consume_ahead_of_two_factor_reset_204_204_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const { user, consume, passwordChanged } = await contending();

  const { first, second, raised } = await queuedOnUser(user.id, consume, () => admin.request('DELETE', `/api/users/${user.id}/two-factor`));

  expect(first.status).toBe(204);
  expect(second.status).toBe(204);
  expect(await twoFactorEnabled(user.id)).toBe(false);
  expect(await sessionsOf(user.id)).toEqual([]);
  await passwordChanged();
  expect(raised).toBe(0);
});

const userName = async (id: string) => (await stack.query<{ name: string }>('select name from users where id = $1', [id]))[0]!.name;

test('user_patch_ahead_of_consume_404_204_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const { user, consume, passwordChanged } = await contending();
  const name = await userName(user.id);

  const { first, second, raised } = await queuedOnUser(user.id, () => admin.patch(`/api/users/${user.id}`, { name: 'Outro Nome' }), consume);

  expect(first.status).toBe(404);
  expect(second.status).toBe(204);
  expect(await userName(user.id)).toBe(name);
  await passwordChanged();
  expect(raised).toBe(0);
});

test('consume_ahead_of_user_patch_204_404_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const { user, consume, passwordChanged } = await contending();
  const name = await userName(user.id);

  const { first, second, raised } = await queuedOnUser(user.id, consume, () => admin.patch(`/api/users/${user.id}`, { name: 'Outro Nome' }));

  expect(first.status).toBe(204);
  expect(second.status).toBe(404);
  expect(await userName(user.id)).toBe(name);
  await passwordChanged();
  expect(raised).toBe(0);
});

/** Um aluno em disputa com o 2FA por confirmar (`enrolled`) ou já confirmado (`confirmed`). */
async function twoFactorAgainstConsume(state: 'enrolled' | 'confirmed') {
  const contender = await contending();
  const { client, user } = contender;
  const enabled = await client.post('/api/auth/two-factor/enable', { password: user.password });
  expect(enabled.status).toBe(200);
  const { totpUri, backupCodes } = (await enabled.json()) as { totpUri: string; backupCodes: string[] };
  if (state === 'confirmed') expect((await client.post('/api/auth/two-factor/confirm', { code: totpCode(totpUri) })).status).toBe(204);
  return {
    ...contender,
    totpUri,
    backupCodes,
    disable: () => client.post('/api/auth/two-factor/disable', { password: user.password }),
    confirm: () => client.post('/api/auth/two-factor/confirm', { code: totpCode(totpUri) }),
    noSessionLeft: async () => {
      expect(await sessionsOf(user.id)).toEqual([]);
      expect((await client.get('/api/me/profile')).status).toBe(401);
    },
  };
}

test('consume_ahead_of_two_factor_disable_leaves_no_session', async () => {
  const { user, consume, disable, noSessionLeft, passwordChanged } = await twoFactorAgainstConsume('confirmed');

  const { first, second, raised } = await queuedOnUser(user.id, consume, disable);

  expect(first.status).toBe(204);
  expect(second.status).toBe(401);
  expect(second.headers.getSetCookie()).toEqual([]);
  expect(await twoFactorEnabled(user.id)).toBe(false);
  await noSessionLeft();
  await passwordChanged();
  expect(raised).toBe(0);
});

test('consume_ahead_of_two_factor_confirm_leaves_no_session', async () => {
  const { user, consume, confirm, noSessionLeft } = await twoFactorAgainstConsume('enrolled');

  const { first, second, raised } = await queuedOnUser(user.id, consume, confirm);

  expect(first.status).toBe(204);
  expect(second.status).toBe(401);
  expect(second.headers.getSetCookie()).toEqual([]);
  expect(await twoFactorEnabled(user.id)).toBe(true);
  await noSessionLeft();
  expect(raised).toBe(0);
});

test('two_factor_disable_ahead_of_consume_leaves_no_session', async () => {
  const { user, consume, disable, noSessionLeft } = await twoFactorAgainstConsume('confirmed');

  const { first, second, raised } = await queuedOnUser(user.id, disable, consume);

  expect([204, 401]).toContain(first.status);
  expect(second.status).toBe(204);
  await noSessionLeft();
  expect(raised).toBe(0);
});

test('two_factor_confirm_ahead_of_consume_leaves_no_session', async () => {
  const { user, consume, confirm, noSessionLeft } = await twoFactorAgainstConsume('enrolled');

  const { first, second, raised } = await queuedOnUser(user.id, confirm, consume);

  expect([204, 401]).toContain(first.status);
  expect(second.status).toBe(204);
  await noSessionLeft();
  expect(raised).toBe(0);
});

const pendingChallenges = (id: string) =>
  stack.query<{ identifier: string }>(`select identifier from verifications where value = $1 and identifier like '2fa-%'`, [id]);

const challengeRows = (identifiers: string[]) => stack.query('select id from verifications where identifier = any($1)', [identifiers]);

/** Um login com a senha antiga esperando o segundo fator: `pending` é o navegador dele. */
async function pendingLogin() {
  const contender = await twoFactorAgainstConsume('confirmed');
  const { user } = contender;
  const pending = stack.client();
  const answer = await pending.post('/api/auth/login', { email: user.email, password: user.password });
  expect(await answer.json()).toEqual({ status: 'two_factor_required' });
  const [challenge] = await pendingChallenges(user.id);
  return { ...contender, pending, challenge: [challenge!.identifier, `2fa-attempts-${challenge!.identifier}`] };
}

test.each([
  ['totp', (uri: string) => ({ code: totpCode(uri) })],
  ['backup_code', (_uri: string, codes: string[]) => ({ backupCode: codes[0] })],
] as const)('two_factor_verify_after_consume_401_by_%s', async (_name, factor) => {
  const { backupCodes, challenge, consume, pending, totpUri, user } = await pendingLogin();
  expect(await challengeRows(challenge)).toHaveLength(2);

  expect((await consume()).status).toBe(204);
  const answer = await pending.post('/api/auth/two-factor/verify', factor(totpUri, backupCodes));

  expect(answer.status).toBe(401);
  expect((await problem(answer)).code).toBe('invalid_code');
  expect(answer.headers.getSetCookie()).toEqual([]);
  expect(await sessionsOf(user.id)).toEqual([]);
  expect(await challengeRows(challenge)).toEqual([]);
  expect((await pending.get('/api/me/profile')).status).toBe(401);
});

let gates: string[] = [];

/**
 * Para o `insert` na tabela dada, nas linhas que `when` escolhe, até `open()`: um ponto de parada no próprio
 * banco, para as rotas que não passam por fila em trava. A linha de controle fica fora da transação de quem
 * parou, e a chegada conta por sequência, que não espera commit. `hold` é quantas chegadas param.
 */
async function gate(table: 'sessions' | 'audit_logs', when: string, hold = 1) {
  await stack.query('create table if not exists test_gates (name text primary key, opened boolean not null default false)');
  await stack.query(`
    create or replace function hold_at_gate() returns trigger language plpgsql as $$
    begin
      if nextval(tg_argv[0]::regclass) <= tg_argv[1]::bigint then
        while not (select opened from test_gates where name = tg_argv[0]) loop
          perform pg_sleep(0.005);
        end loop;
      end if;
      return new;
    end;
    $$`);
  const name = `gate_${gates.length + 1}`;
  gates.push(`${name} on ${table}`);
  await stack.query(`create sequence ${name}`);
  await stack.query('insert into test_gates (name) values ($1)', [name]);
  await stack.query(`create trigger ${name} before insert on ${table} for each row when (${when}) execute function hold_at_gate('${name}', '${hold}')`);
  return {
    reached: () =>
      vi.waitFor(
        async () => {
          const [row] = await stack.query<{ is_called: boolean }>(`select is_called from ${name}`);
          expect(row!.is_called).toBe(true);
        },
        { timeout: 10_000, interval: 5 },
      ),
    open: () => stack.query('update test_gates set opened = true where name = $1', [name]),
  };
}

afterEach(async () => {
  hashes.before = undefined;
  if (gates.length === 0) return;
  await stack.query('update test_gates set opened = true');
  for (const item of gates) {
    await stack.query(`drop trigger ${item}`);
    await stack.query(`drop sequence ${item.split(' ')[0]}`);
  }
  await stack.query('delete from test_gates');
  gates = [];
});

const sessionInsert = (userId: string, hold?: number) => gate('sessions', `new.user_id = '${userId}'`, hold);

/** Depois do `delete` das sessões e antes do commit do consumo: o usuário segue travado. */
const consumeAudit = () => gate('audit_logs', `new.action = 'student.portal_password_set'`);

/** Espera a resposta chegar ou o pedido entrar em fila de trava, o que vier primeiro. */
async function answeredOrLocked(answer: Promise<Response>) {
  let answered = false;
  void answer.finally(() => {
    answered = true;
  });
  await vi.waitFor(async () => expect(answered || (await backendsIn(`wait_event_type = 'Lock'`)) > 0).toBe(true), { timeout: 10_000, interval: 5 });
}

const loginFailures = (id: string) => stack.query(`select id from audit_logs where action = 'auth.login_failed' and entity_id = $1`, [id]);

const attemptsCounted = (email: string) =>
  stack.query<{ attempts: number }>('select cardinality(failures) as attempts from login_throttles where email = $1', [email]);

test('login_in_flight_during_consume_401_no_session', async () => {
  const { consume, user } = await contending();
  const stopped = await sessionInsert(user.id);

  const answer = login(user.email, user.password);
  await stopped.reached();
  expect((await consume()).status).toBe(204);
  await stopped.open();
  const response = await answer;

  expect(response.status).toBe(401);
  expect((await problem(response)).code).toBe('invalid_credentials');
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(await sessionsOf(user.id)).toEqual([]);
});

test('login_in_flight_on_two_factor_401_no_challenge', async () => {
  const { consume, user } = await twoFactorAgainstConsume('confirmed');
  const stopped = await sessionInsert(user.id);

  const answer = login(user.email, user.password);
  await stopped.reached();
  expect((await consume()).status).toBe(204);
  await stopped.open();
  const response = await answer;

  expect(response.status).toBe(401);
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(await pendingChallenges(user.id)).toEqual([]);
  expect(await sessionsOf(user.id)).toEqual([]);
});

test('two_factor_verify_in_flight_during_consume_401_no_session', async () => {
  const { consume, pending, totpUri, user } = await pendingLogin();
  const stopped = await sessionInsert(user.id);

  const answer = pending.post('/api/auth/two-factor/verify', { code: totpCode(totpUri) });
  await stopped.reached();
  expect((await consume()).status).toBe(204);
  await stopped.open();
  const response = await answer;

  expect(response.status).toBe(401);
  expect((await problem(response)).code).toBe('invalid_code');
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(await sessionsOf(user.id)).toEqual([]);
  expect(await loginFailures(user.id)).toHaveLength(1);
  expect(await attemptsCounted(user.email)).toEqual([{ attempts: 1 }]);
});

test('check_waits_for_consume_commit_on_login', async () => {
  const { consume, user } = await contending();
  const session = await sessionInsert(user.id);
  const audit = await consumeAudit();

  const answer = login(user.email, user.password);
  await session.reached();
  const consumed = consume();
  await audit.reached();
  await session.open();
  await answeredOrLocked(answer);
  await audit.open();
  const response = await answer;

  expect((await consumed).status).toBe(204);
  expect(response.status).toBe(401);
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(await sessionsOf(user.id)).toEqual([]);
});

test('check_waits_for_consume_commit_on_two_requests_same_session', async () => {
  const { client, consume, disable, user } = await twoFactorAgainstConsume('confirmed');
  const session = await sessionInsert(user.id);
  const audit = await consumeAudit();

  const firstRequest = disable();
  await session.reached();
  expect((await disable()).status).toBe(204);
  const consumed = consume();
  await audit.reached();
  await session.open();
  await answeredOrLocked(firstRequest);
  await audit.open();
  const response = await firstRequest;

  expect((await consumed).status).toBe(204);
  expect(response.status).toBe(401);
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(await sessionsOf(user.id)).toEqual([]);
  expect((await client.get('/api/me/profile')).status).toBe(401);
});

test('check_waits_for_consume_commit_two_factor_login', async () => {
  const { consume, user } = await twoFactorAgainstConsume('confirmed');
  const session = await sessionInsert(user.id);
  const audit = await consumeAudit();

  const answer = login(user.email, user.password);
  await session.reached();
  const consumed = consume();
  await audit.reached();
  await session.open();
  await answeredOrLocked(answer);
  await audit.open();
  const response = await answer;

  expect((await consumed).status).toBe(204);
  expect(response.status).toBe(401);
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(await pendingChallenges(user.id)).toEqual([]);
});

test('check_waits_for_consume_commit_two_factor_verify', async () => {
  const { consume, pending, totpUri, user } = await pendingLogin();
  const session = await sessionInsert(user.id);
  const audit = await consumeAudit();

  const answer = pending.post('/api/auth/two-factor/verify', { code: totpCode(totpUri) });
  await session.reached();
  const consumed = consume();
  await audit.reached();
  await session.open();
  await answeredOrLocked(answer);
  await audit.open();
  const response = await answer;

  expect((await consumed).status).toBe(204);
  expect(response.status).toBe(401);
  expect((await problem(response)).code).toBe('invalid_code');
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(await sessionsOf(user.id)).toEqual([]);
});

/** Um aluno com a senha disputada pelo link e por um `PUT`, dele ou do administrador, que tenta `replacement`. */
async function passwordAgainstConsume() {
  const contender = await contending();
  const { client, user, passwordChanged } = contender;
  const admin = (await stack.session('admin')).client;
  const replacement = 'senha-do-put-concorrente-1';
  return {
    ...contender,
    replacement,
    changeOwn: () => client.put('/api/auth/password', { currentPassword: user.password, newPassword: replacement }),
    resetByAdmin: () => admin.put(`/api/users/${user.id}/password`, { password: replacement }),
    linkPasswordStands: async () => {
      expect(await sessionsOf(user.id)).toEqual([]);
      await passwordChanged();
      expect((await login(user.email, replacement)).status).toBe(401);
    },
  };
}

/** Com o consumo já depois de gravar a senha e antes do commit, `route` entra em andamento. */
async function behindConsumeCommit(consume: () => Promise<Response>, route: () => Promise<Response>) {
  const audit = await consumeAudit();
  const consumed = consume();
  await audit.reached();
  const answer = route();
  await answeredOrLocked(answer);
  await audit.open();
  const response = await answer;
  return { consumed: await consumed, response };
}

test('own_password_in_flight_during_consume_422_link_password_stands', async () => {
  const { changeOwn, consume, linkPasswordStands } = await passwordAgainstConsume();

  const { consumed, response } = await behindConsumeCommit(consume, changeOwn);

  expect(consumed.status).toBe(204);
  expect(response.status).toBe(422);
  expect(await fieldErrorPaths(response)).toEqual(['currentPassword']);
  await linkPasswordStands();
});

test('consume_ahead_of_own_password_204_422_without_deadlock', async () => {
  const { changeOwn, consume, linkPasswordStands, user } = await passwordAgainstConsume();

  const { first, second, raised } = await queuedOnUser(user.id, consume, changeOwn);

  expect(first.status).toBe(204);
  expect(second.status).toBe(422);
  expect(await fieldErrorPaths(second)).toEqual(['currentPassword']);
  await linkPasswordStands();
  expect(raised).toBe(0);
});

test('own_password_ahead_of_consume_204_204_without_deadlock', async () => {
  const { changeOwn, consume, linkPasswordStands, user } = await passwordAgainstConsume();

  const { first, second, raised } = await queuedOnUser(user.id, changeOwn, consume);

  expect(first.status).toBe(204);
  expect(second.status).toBe(204);
  await linkPasswordStands();
  expect(raised).toBe(0);
});

test('reset_password_in_flight_during_consume_422_link_password_stands', async () => {
  const { consume, linkPasswordStands, resetByAdmin } = await passwordAgainstConsume();

  const { consumed, response } = await behindConsumeCommit(consume, resetByAdmin);

  expect(consumed.status).toBe(204);
  expect(response.status).toBe(422);
  expect(await fieldErrorPaths(response)).toEqual(['password']);
  await linkPasswordStands();
});

test('reset_password_with_consume_during_hash_422_link_password_stands', async () => {
  const { consume, linkPasswordStands, replacement, resetByAdmin } = await passwordAgainstConsume();
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    hashes.before = async (password) => {
      if (password !== replacement) return;
      resolve();
      await released;
    };
  });

  const answer = resetByAdmin();
  await reached;
  expect((await consume()).status).toBe(204);
  release();
  const response = await answer;

  expect(response.status).toBe(422);
  expect(await fieldErrorPaths(response)).toEqual(['password']);
  await linkPasswordStands();
});

test('consume_ahead_of_reset_password_204_422_without_deadlock', async () => {
  const { consume, linkPasswordStands, resetByAdmin, user } = await passwordAgainstConsume();

  const { first, second, raised } = await queuedOnUser(user.id, consume, resetByAdmin);

  expect(first.status).toBe(204);
  expect(second.status).toBe(422);
  expect(await fieldErrorPaths(second)).toEqual(['password']);
  await linkPasswordStands();
  expect(raised).toBe(0);
});

test('reset_password_ahead_of_consume_204_204_without_deadlock', async () => {
  const { consume, linkPasswordStands, resetByAdmin, user } = await passwordAgainstConsume();

  const { first, second, raised } = await queuedOnUser(user.id, resetByAdmin, consume);

  expect(first.status).toBe(204);
  expect(second.status).toBe(204);
  await linkPasswordStands();
  expect(raised).toBe(0);
});

test('reset_password_ahead_of_user_patch_204_200_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const staff = await stack.seed({ role: 'reception' });

  const { first, second, raised } = await queuedOnUser(
    staff.id,
    () => admin.put(`/api/users/${staff.id}/password`, { password: 'senha-redefinida-da-equipe-1' }),
    () => admin.patch(`/api/users/${staff.id}`, { name: 'Outro Nome' }),
  );

  expect(first.status).toBe(204);
  expect(second.status).toBe(200);
  expect(raised).toBe(0);
});

const userPatch = (admin: Client, userId: string) => () => admin.patch(`/api/users/${userId}`, { name: 'Outro Nome' });

test('inactivation_ahead_of_user_patch_204_404_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const { student, user } = await portalSession(stack, mail);

  const { first, second, raised } = await queuedOnUser(user.id, () => admin.request('DELETE', `/api/students/${student.id}`), userPatch(admin, user.id));

  expect(first.status).toBe(204);
  expect(second.status).toBe(404);
  expect(await userActive(user.id)).toBe(false);
  expect(raised).toBe(0);
});

test('two_factor_reset_ahead_of_user_patch_204_200_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const staff = await stack.seed({ role: 'reception' });

  const { first, second, raised } = await queuedOnUser(staff.id, () => admin.request('DELETE', `/api/users/${staff.id}/two-factor`), userPatch(admin, staff.id));

  expect(first.status).toBe(204);
  expect(second.status).toBe(200);
  expect(raised).toBe(0);
});

test('student_email_patch_ahead_of_user_patch_200_404_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const { student, user } = await portalSession(stack, mail);
  const email = `novo-${student.id}@example.com`;

  const { first, second, raised } = await queuedOnUser(user.id, () => admin.patch(`/api/students/${student.id}`, { email }), userPatch(admin, user.id));

  expect(first.status).toBe(200);
  expect(second.status).toBe(404);
  expect((await stack.query<{ email: string }>('select email from users where id = $1', [user.id]))[0]!.email).toBe(email);
  expect(raised).toBe(0);
});

test('student_phone_patch_ahead_of_user_patch_200_404_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const { student, user } = await portalSession(stack, mail);

  const { first, second, raised } = await queuedOnUser(user.id, () => admin.patch(`/api/students/${student.id}`, { phone: '11987654321' }), userPatch(admin, user.id));

  expect(first.status).toBe(200);
  expect(second.status).toBe(404);
  expect((await stack.query<{ phone: string }>('select phone from students where id = $1', [student.id]))[0]!.phone).toBe('11987654321');
  expect(raised).toBe(0);
});

test('anonymization_ahead_of_user_patch_204_404_without_deadlock', async () => {
  const admin = (await stack.session('admin')).client;
  const { student, user } = await portalSession(stack, mail);
  expect((await admin.request('DELETE', `/api/students/${student.id}`)).status).toBe(204);

  const { first, second, raised } = await queuedOnUser(user.id, () => admin.post(`/api/students/${student.id}/anonymization`), userPatch(admin, user.id));

  expect(first.status).toBe(204);
  expect(second.status).toBe(404);
  expect(raised).toBe(0);
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
