import type { Problem } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { WEB_ORIGIN } from './support/app.ts';
import { withAuditInsertFailing, written } from './support/audit.ts';
import { nextIp, sha256 } from './support/leads.ts';
import { type CapturedMail, captureMail } from './support/mail.ts';
import { insertStudentUser, nextPortalEmail, passwordLink, portalRecorded, postReset, tokenRows } from './support/portal.ts';
import { type Stack, startStack } from './support/stack.ts';

let stack: Stack;
let mail: CapturedMail;

beforeAll(async () => {
  mail = captureMail();
  stack = await startStack([], undefined, { mail: mail.transport });
}, 180_000);

afterAll(() => stack?.close());

const insertToken = (userId: string, purpose: string, hash: string, used: boolean) =>
  stack.query(
    `insert into password_tokens (user_id, purpose, token_hash, expires_at, used_at)
     values ($1, $2, $3, now() + interval '1 hour', case when $4 then now() else null end)`,
    [userId, purpose, hash, used],
  );

/** Status, corpo e cabeçalhos, sem os dois que mudam a cada resposta. */
async function shapeOf(response: Response) {
  const headers = [...response.headers.entries()].filter(([name]) => !['x-request-id', 'date'].includes(name)).sort();
  return { status: response.status, body: await response.text(), headers };
}

test('reset_202_stores_one_hour_token_invalidates_previous_and_mails_after_commit', async () => {
  const user = await insertStudentUser(stack);
  await insertToken(user.id, 'reset', 'a'.repeat(64), false);
  await insertToken(user.id, 'first_access', 'b'.repeat(64), true);
  const firstAccessBefore = await stack.query('select to_jsonb(p)::text as row from password_tokens p where token_hash = $1', ['b'.repeat(64)]);
  const ip = nextIp();
  mail.clear();

  const { result: response, rows } = await written(stack, () => postReset(stack.client(), { email: user.email.toUpperCase() }, ip));

  expect(response.status).toBe(202);
  expect(await response.text()).toBe('');
  const tokens = await tokenRows(stack, user.id);
  const previous = tokens.find((row) => row.token_hash === 'a'.repeat(64))!;
  expect(previous.used_at).not.toBeNull();
  const fresh = tokens.filter((row) => row.purpose === 'reset' && row.used_at === null);
  expect(fresh).toHaveLength(1);
  expect(fresh[0]!.validity).toBe('01:00:00');
  expect(await stack.query('select to_jsonb(p)::text as row from password_tokens p where token_hash = $1', ['b'.repeat(64)])).toEqual(
    firstAccessBefore,
  );
  expect(rows.map(({ action, user_id, ip: from }) => ({ action, user_id, ip: from }))).toEqual([
    { action: 'student.portal_reset_requested', user_id: null, ip },
  ]);
  expect(mail.sent).toHaveLength(1);
  expect(mail.sent[0]!.to).toBe(user.email);
  const { link, token } = passwordLink(mail.sent[0]!);
  expect(link).toBe(`${WEB_ORIGIN}/definir-senha?token=${token}`);
  expect(sha256(token)).toBe(fresh[0]!.token_hash);
  expect(mail.sent[0]!.text).toContain('1 hora');

  // a trilha recusada desfaz o token, e nenhum e-mail sai
  const other = await insertStudentUser(stack);
  mail.clear();
  const failed = await withAuditInsertFailing(stack, () => postReset(stack.client(), { email: other.email }));
  expect(failed.status).toBe(500);
  expect(await tokenRows(stack, other.id)).toEqual([]);
  expect(mail.sent).toEqual([]);
});

test('four_ineligible_emails_202_same_response_nothing_recorded', async () => {
  const eligible = await insertStudentUser(stack);
  const reference = await shapeOf(await postReset(stack.client(), { email: eligible.email }));
  expect(reference.status).toBe(202);

  const reception = await stack.seed({ role: 'reception' });
  const inactive = await insertStudentUser(stack, { active: false });
  const withoutPassword = await insertStudentUser(stack, { active: false, withPassword: false });
  const cases: Array<[label: string, email: string]> = [
    ['de usuário nenhum', nextPortalEmail('ninguem')],
    ['de um usuário reception ativo', reception.email],
    ['de usuário de aluno inativo com senha', inactive.email],
    ['de usuário de aluno sem senha', withoutPassword.email],
  ];
  for (const [label, email] of cases) {
    const before = await portalRecorded(stack);
    mail.clear();

    const response = await postReset(stack.client(), { email });

    expect(await shapeOf(response), label).toEqual(reference);
    expect(await portalRecorded(stack), label).toEqual(before);
    expect(mail.sent, label).toEqual([]);
  }
});

test('invalid_email_422', async () => {
  for (const [label, body] of [
    ['email ausente', {}],
    ['ana', { email: 'ana' }],
    ['ana@', { email: 'ana@' }],
  ] as const) {
    const before = await portalRecorded(stack);
    mail.clear();

    const response = await postReset(stack.client(), body);

    expect(response.status, label).toBe(422);
    expect(((await response.json()) as Problem).errors?.map((error) => error.path), label).toEqual(['email']);
    expect(await portalRecorded(stack), label).toEqual(before);
    expect(mail.sent, label).toEqual([]);
  }
});
