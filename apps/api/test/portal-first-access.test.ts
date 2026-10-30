import type { Problem } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { MailService } from '../src/mail/mail.service.ts';
import { PortalService, portalState } from '../src/portal/portal.service.ts';
import { WEB_ORIGIN } from './support/app.ts';
import { auditRows, withAuditInsertFailing, written } from './support/audit.ts';
import { nextIp, sha256 } from './support/leads.ts';
import { captureOutput } from './support/log.ts';
import { type CapturedMail, captureMail } from './support/mail.ts';
import {
  firstAccessBody,
  insertAdultStudent,
  insertStudentUser,
  passwordLink,
  portalRecorded,
  postConsume,
  postFirstAccess,
  tokenRows,
} from './support/portal.ts';
import { type Stack, startStack } from './support/stack.ts';
import { cpfOf, maskCpf, releasedTogether } from './support/students.ts';

let stack: Stack;
let mail: CapturedMail;

beforeAll(async () => {
  mail = captureMail();
  stack = await startStack([], undefined, { mail: mail.transport });
}, 180_000);

afterAll(() => stack?.close());

afterEach(() => {
  vi.restoreAllMocks();
  mail.deliver();
});

const ANA = 'ana@example.com';

/** Deixa `ana@example.com` livre: a ficha e o usuário de um teste anterior passam a outro e-mail. */
async function freeAna() {
  await stack.query(`update students set email = 'antes-' || id || '@example.com' where email = $1`, [ANA]);
  await stack.query(`update users set email = 'antes-' || id || '@example.com' where email = $1`, [ANA]);
}

const usersOf = (studentId: string) =>
  stack.query<{ id: string; role: string; student_id: string; email: string; name: string; active: boolean }>(
    'select id, role, student_id, email, name, active from users where student_id = $1',
    [studentId],
  );
const accountsOf = (userId: string) => stack.query('select id from accounts where user_id = $1', [userId]);

/** Um dia de São Paulo relativo ao `current_date` do banco: `birth_date` de quem faz 18 anos amanhã. */
const turnsEighteenTomorrow = async () =>
  (
    await stack.query<{ day: string }>(
      `select to_char(((now() at time zone 'America/Sao_Paulo')::date - interval '18 years' + interval '1 day')::date, 'YYYY-MM-DD') as day`,
    )
  )[0]!.day;

test('first_access_202_creates_inactive_student_user_token_and_audit', async () => {
  for (const status of ['active', 'suspended']) {
    await freeAna();
    const student = await insertAdultStudent(stack, { email: ANA, status });
    const ip = nextIp();

    const { result: response, rows } = await written(stack, () =>
      postFirstAccess(stack.client(), { cpf: maskCpf(student.cpf), email: '  Ana@Example.COM ' }, ip),
    );

    expect(response.status, status).toBe(202);
    expect(await response.text(), status).toBe('');
    const users = await usersOf(student.id);
    expect(users, status).toHaveLength(1);
    expect(users[0], status).toMatchObject({ role: 'student', student_id: student.id, email: ANA, name: student.name, active: false });
    expect(await accountsOf(users[0]!.id), status).toEqual([]);
    const tokens = await tokenRows(stack, users[0]!.id);
    expect(tokens.map(({ purpose, validity, used_at }) => ({ purpose, validity, used_at })), status).toEqual([
      { purpose: 'first_access', validity: '24:00:00', used_at: null },
    ]);
    expect(rows.map(({ action, user_id, entity_id, ip: from }) => ({ action, user_id, entity_id, ip: from })), status).toEqual([
      { action: 'student.portal_access_requested', user_id: null, entity_id: student.id, ip },
    ]);
  }
});

test('first_access_mails_link_to_file_email_only_after_commit', async () => {
  await freeAna();
  const student = await insertAdultStudent(stack, { email: ANA });
  mail.clear();

  const response = await postFirstAccess(stack.client(), firstAccessBody(student, { email: ' ANA@example.com' }));

  expect(response.status).toBe(202);
  expect(mail.sent).toHaveLength(1);
  const [message] = mail.sent;
  expect(message!.to).toBe(ANA);
  const { link, token } = passwordLink(message!);
  expect(link).toBe(`${WEB_ORIGIN}/definir-senha?token=${token}`);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(message!.html).toContain(link);
  expect(message!.text).toContain('24 horas');
  const [user] = await usersOf(student.id);
  expect((await tokenRows(stack, user!.id)).map((row) => row.token_hash)).toEqual([sha256(token)]);

  // a trilha recusada desfaz tudo, e nenhum e-mail sai
  const other = await insertAdultStudent(stack);
  mail.clear();
  const failed = await withAuditInsertFailing(stack, () => postFirstAccess(stack.client(), firstAccessBody(other)));
  expect(failed.status).toBe(500);
  expect(await usersOf(other.id)).toEqual([]);
  expect(await stack.query('select p.id from password_tokens p join users u on u.id = p.user_id where u.student_id = $1', [other.id])).toEqual([]);
  expect(mail.sent).toEqual([]);
});

test('mail_failure_or_timeout_keeps_202_and_logs_without_recipient', async () => {
  for (const mode of ['fail', 'delay'] as const) {
    const student = await insertAdultStudent(stack);
    const output = captureOutput();
    if (mode === 'fail') mail.fail();
    else mail.delay(15_000);

    const started = Date.now();
    const response = await postFirstAccess(stack.client(), firstAccessBody(student));
    const elapsed = Date.now() - started;

    expect(response.status, mode).toBe(202);
    expect(elapsed, mode).toBeLessThan(2000);
    const [user] = await usersOf(student.id);
    expect(user, mode).toBeDefined();
    expect(await tokenRows(stack, user!.id), mode).toHaveLength(1);
    // a falha sai na hora; a demora, quando o `MailService` desiste (10 s)
    await vi.waitFor(() => expect(output.text()).toContain('portal_mail_failed'), { timeout: mode === 'fail' ? 2000 : 15_000, interval: 100 });
    const lines = output.text().split('\n');
    expect(lines.filter((line) => line.includes('portal_mail_failed') && line.includes(user!.id)), mode).toHaveLength(1);
    expect(lines.filter((line) => line.includes(student.email!)), mode).toEqual([]);
    vi.restoreAllMocks();
    mail.deliver();
  }
});

test('second_request_reuses_user_and_only_newest_link_works', async () => {
  const student = await insertAdultStudent(stack);
  mail.clear();
  expect((await postFirstAccess(stack.client(), firstAccessBody(student))).status).toBe(202);
  const [first] = await usersOf(student.id);
  const usersBefore = await stack.query('select count(*)::int as n from users');

  const again = await postFirstAccess(stack.client(), firstAccessBody(student));

  expect(again.status).toBe(202);
  expect(await stack.query('select count(*)::int as n from users')).toEqual(usersBefore);
  const [second] = await usersOf(student.id);
  expect(second!.id).toBe(first!.id);
  const tokens = await tokenRows(stack, first!.id);
  expect(tokens).toHaveLength(2);
  expect(tokens[0]!.used_at).not.toBeNull();
  expect(tokens[1]!.used_at).toBeNull();
  expect(tokens.map((row) => row.purpose)).toEqual(['first_access', 'first_access']);

  const [oldLink, newLink] = mail.sent.map((message) => passwordLink(message).token);
  const stale = await postConsume(stack.client(), { token: oldLink, password: 'senha-do-aluno-123' });
  expect(stale.status).toBe(422);
  expect(((await stale.json()) as Problem).errors?.map((error) => error.path)).toEqual(['token']);
  expect((await postConsume(stack.client(), { token: newLink, password: 'senha-do-aluno-123' })).status).toBe(204);
});

/** Os nove casos da AC 12, cada um com o corpo que o pedido leva. */
async function nineIneligible() {
  const tomorrow = await turnsEighteenTomorrow();
  const cases: Array<[label: string, body: Record<string, unknown>]> = [];

  cases.push(['CPF de aluno nenhum', { cpf: maskCpf(cpfOf(99_001)), email: 'ninguem@example.com' }]);
  const differs = await insertAdultStudent(stack);
  cases.push(['e-mail diferente do da ficha', firstAccessBody(differs, { email: 'outro@example.com' })]);
  const minor = await insertAdultStudent(stack, { birth_date: tomorrow });
  cases.push(['18 anos completos amanhã', firstAccessBody(minor)]);
  const guarded = await insertAdultStudent(stack);
  await stack.query(`insert into guardians (student_id, name, cpf, phone, relationship) values ($1, 'Bia Souza', $2, '11912345678', 'mother')`, [
    guarded.id,
    cpfOf(99_002),
  ]);
  cases.push(['com responsável', firstAccessBody(guarded)]);
  const inactive = await insertAdultStudent(stack, { status: 'inactive' });
  cases.push(['inactive', firstAccessBody(inactive)]);
  const anonymized = await insertAdultStudent(stack);
  await stack.query(
    `update students set name = 'Titular anonimizado', status = 'inactive', inactivated_at = now(), anonymized_at = now(),
       cpf = null, birth_date = null, sex = null, email = null, phone = null, address = null,
       emergency_contact_name = null, emergency_contact_phone = null, health_notes_enc = null where id = $1`,
    [anonymized.id],
  );
  cases.push(['anonimizado', firstAccessBody(anonymized)]);
  const reception = await stack.seed({ role: 'reception' });
  const sharesEmail = await insertAdultStudent(stack, { email: reception.email });
  cases.push(['e-mail de um usuário reception', firstAccessBody(sharesEmail)]);
  const withLogin = await insertStudentUser(stack);
  cases.push(['usuário ativo com senha', firstAccessBody(withLogin.student)]);
  const noEmail = await insertAdultStudent(stack, { email: null });
  cases.push(['sem e-mail na ficha', firstAccessBody(noEmail, { email: 'sem-ficha@example.com' })]);
  return cases;
}

test('eligibility_decision_table_thirteen_rows', async () => {
  const service = new PortalService(stack.database.db, new MailService(mail.transport), WEB_ORIGIN);
  const [{ today }] = (await stack.query<{ today: string }>(
    `select to_char((now() at time zone 'America/Sao_Paulo')::date - interval '18 years', 'YYYY-MM-DD') as today`,
  )) as [{ today: string }];
  const tomorrow = await turnsEighteenTomorrow();
  const reception = await stack.seed({ role: 'reception' });
  const anonymize = async (id: string) =>
    stack.query(
      `update students set name = 'Titular anonimizado', status = 'inactive', inactivated_at = now(), anonymized_at = now(),
         cpf = null, birth_date = null, sex = null, email = null, phone = null, address = null,
         emergency_contact_name = null, emergency_contact_phone = null, health_notes_enc = null where id = $1`,
      [id],
    );

  type Effect = 'created' | 'reused' | 'nothing';
  type Row = { situation: string; effect: Effect; cpf: string; email: string; studentId: string; userId?: string };
  const row = (situation: string, effect: Effect, student: { id: string; cpf: string; email: string | null }, userId?: string, email?: string): Row => ({
    situation,
    effect,
    cpf: student.cpf,
    email: email ?? student.email!,
    studentId: student.id,
    userId,
  });

  const guarded = await insertAdultStudent(stack);
  await stack.query(`insert into guardians (student_id, name, cpf, phone, relationship) values ($1, 'Bia Souza', $2, '11912345678', 'mother')`, [
    guarded.id,
    cpfOf(99_101),
  ]);
  const anonymized = await insertAdultStudent(stack);
  const anonymizedRow = row('anonimizado', 'nothing', anonymized);
  await anonymize(anonymized.id);
  const pendingUser = await insertStudentUser(stack, { active: false, withPassword: false });
  const disabledUser = await insertStudentUser(stack, { active: false });
  const activeUser = await insertStudentUser(stack);
  const noEmail = await insertAdultStudent(stack, { email: null });

  const rows: Row[] = [
    row('ativo adulto sem usuário', 'created', await insertAdultStudent(stack)),
    row('suspenso adulto sem usuário', 'created', await insertAdultStudent(stack, { status: 'suspended' })),
    row('18 anos completos hoje', 'created', await insertAdultStudent(stack, { birth_date: today })),
    row('18 anos completos amanhã', 'nothing', await insertAdultStudent(stack, { birth_date: tomorrow })),
    row('com responsável', 'nothing', guarded),
    row('inativo', 'nothing', await insertAdultStudent(stack, { status: 'inactive' })),
    anonymizedRow,
    row('e-mail diferente', 'nothing', await insertAdultStudent(stack), undefined, 'diferente@example.com'),
    row('e-mail de outro usuário', 'nothing', await insertAdultStudent(stack, { email: reception.email })),
    row('usuário pendente sem senha', 'reused', pendingUser.student, pendingUser.id),
    row('usuário inativo com senha', 'reused', disabledUser.student, disabledUser.id),
    row('usuário ativo com senha', 'nothing', activeUser.student, activeUser.id),
    row('ficha sem e-mail', 'nothing', noEmail, undefined, 'sem-ficha@example.com'),
  ];
  expect(rows).toHaveLength(13);

  for (const { situation, effect, cpf, email, studentId, userId } of rows) {
    const before = await portalRecorded(stack);

    await service.requestFirstAccess({ cpf, email }, { userId: null, ip: nextIp(), userAgent: null });

    const users = await usersOf(studentId);
    if (effect === 'nothing') {
      expect(await portalRecorded(stack), situation).toEqual(before);
      continue;
    }
    expect(users, situation).toHaveLength(1);
    if (effect === 'reused') expect(users[0]!.id, situation).toBe(userId);
    else expect(userId, situation).toBeUndefined();
    const open = (await tokenRows(stack, users[0]!.id)).filter((token) => token.used_at === null);
    expect(open.map((token) => token.purpose), situation).toEqual(['first_access']);
  }
});

test('portal_state_table_six_rows', () => {
  const rows: Array<[situation: string, user: { active: boolean; hasPassword: boolean } | null, state: string]> = [
    ['sem usuário', null, 'none'],
    ['usuário sem senha', { active: false, hasPassword: false }, 'pending'],
    ['ativo com senha', { active: true, hasPassword: true }, 'active'],
    ['inativo com senha', { active: false, hasPassword: true }, 'disabled'],
    ['inativo sem senha', { active: false, hasPassword: false }, 'pending'],
    ['ativo sem senha', { active: true, hasPassword: false }, 'pending'],
  ];
  expect(rows).toHaveLength(6);
  for (const [situation, user, state] of rows) expect(portalState(user), situation).toBe(state);
});

test('nine_ineligible_cases_202_and_nothing_recorded', async () => {
  const cases = await nineIneligible();
  expect(cases).toHaveLength(9);

  for (const [label, body] of cases) {
    const before = await portalRecorded(stack);
    mail.clear();

    const response = await postFirstAccess(stack.client(), body);

    expect(response.status, label).toBe(202);
    expect(await response.text(), label).toBe('');
    expect(await portalRecorded(stack), label).toEqual(before);
    expect(mail.sent, label).toEqual([]);
  }
});

/** Status, corpo e cabeçalhos, sem os dois que mudam a cada resposta. */
async function shapeOf(response: Response) {
  const headers = [...response.headers.entries()].filter(([name]) => !['x-request-id', 'date'].includes(name)).sort();
  return { status: response.status, body: await response.text(), headers };
}

test('same_202_status_body_and_headers_for_ten_cases', async () => {
  const accepted = await insertAdultStudent(stack);
  const reference = await shapeOf(await postFirstAccess(stack.client(), firstAccessBody(accepted)));
  expect(reference.status).toBe(202);
  expect((await usersOf(accepted.id)).length).toBe(1);

  const cases = await nineIneligible();
  for (const [label, body] of cases) {
    expect(await shapeOf(await postFirstAccess(stack.client(), body)), label).toEqual(reference);
  }
  expect(cases.length + 1).toBe(10);
});

test('six_invalid_bodies_422_with_field_path', async () => {
  const student = await insertAdultStudent(stack);
  const valid = firstAccessBody(student);
  const bodies: Array<[label: string, body: Record<string, unknown>, path: string]> = [
    ['cpf ausente', { email: valid.email }, 'cpf'],
    ['cpf com dígito errado', { ...valid, cpf: `${student.cpf.slice(0, 10)}${(Number(student.cpf[10]) + 1) % 10}` }, 'cpf'],
    ['cpf com 10 dígitos', { ...valid, cpf: student.cpf.slice(0, 10) }, 'cpf'],
    ['email ausente', { cpf: valid.cpf }, 'email'],
    ['email ana', { ...valid, email: 'ana' }, 'email'],
    ['email ana@', { ...valid, email: 'ana@' }, 'email'],
  ];
  const throttles = () => stack.query<{ row: string }>('select to_jsonb(t)::text as row from lead_throttles t order by 1');

  for (const [label, body, path] of bodies) {
    const before = { recorded: await portalRecorded(stack), throttles: await throttles() };
    mail.clear();

    const response = await postFirstAccess(stack.client(), body);

    expect(response.status, label).toBe(422);
    expect(((await response.json()) as Problem).errors?.map((error) => error.path), label).toEqual([path]);
    expect({ recorded: await portalRecorded(stack), throttles: await throttles() }, label).toEqual(before);
    expect(mail.sent, label).toEqual([]);
  }
});

test('two_concurrent_requests_one_user_one_open_token', async () => {
  const student = await insertAdultStudent(stack);

  const responses = await releasedTogether([
    () => postFirstAccess(stack.client(), firstAccessBody(student)),
    () => postFirstAccess(stack.client(), firstAccessBody(student)),
  ]);

  expect(responses.map((response) => response.status)).toEqual([202, 202]);
  const users = await usersOf(student.id);
  expect(users).toHaveLength(1);
  const open = (await tokenRows(stack, users[0]!.id)).filter((row) => row.purpose === 'first_access' && row.used_at === null);
  expect(open).toHaveLength(1);
  // as duas linhas da trilha, uma por pedido aceito
  expect((await auditRows(stack)).filter((row) => row.entity_id === student.id)).toHaveLength(2);
});
