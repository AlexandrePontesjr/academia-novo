import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { WEB_ORIGIN } from './support/app.ts';
import { auditRows } from './support/audit.ts';
import { databaseNow, leadBody, leadRows, nextEmail, postConfirm, postLead, recorded, sha256 } from './support/leads.ts';
import { captureMail, confirmLink } from './support/mail.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { releasedTogether } from './support/students.ts';

let stack: Stack;
const mail = captureMail();
const INVALID = 'Link inválido ou expirado. Envie o pré-cadastro de novo.';

beforeAll(async () => {
  stack = await startStack([], undefined, { mail: mail.transport });
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

afterEach(() => {
  mail.clear();
});

/** Um interessado enviado pelo formulário e o token do e-mail que ele recebeu. */
async function submitted(email = nextEmail()) {
  mail.clear();
  const response = await postLead(stack.client(), await leadBody(stack, { email }));
  expect(response.status, 'envio de preparação').toBe(202);
  const [lead] = await leadRows(stack, email);
  const message = mail.sent.find((item) => item.to === email);
  return { leadId: String(lead!.id), email, token: confirmLink(message!, WEB_ORIGIN).token };
}

const tokenRow = async (token: string) =>
  (await stack.query<{ used_at: Date | null }>('select used_at from lead_verifications where token_hash = $1', [sha256(token)]))[0];
const verifiedAt = async (leadId: string) =>
  (await stack.query<{ email_verified_at: Date | null }>('select email_verified_at from leads where id = $1', [leadId]))[0]!
    .email_verified_at;

const confirmedBody = async (response: Response) => {
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('{"status":"confirmed"}');
};

test('confirm_200_sets_used_at_and_email_verified_at', async () => {
  const { leadId, token } = await submitted();
  const t0 = await databaseNow(stack);

  await confirmedBody(await postConfirm(stack.client(), { token }));

  const t1 = await databaseNow(stack);
  const used = (await tokenRow(token))!.used_at!;
  const verified = (await verifiedAt(leadId))!;
  for (const instant of [used, verified]) {
    expect(instant.getTime()).toBeGreaterThanOrEqual(t0.getTime());
    expect(instant.getTime()).toBeLessThanOrEqual(t1.getTime());
  }
});

test('used_token_or_sibling_token_of_confirmed_lead_200_changes_nothing', async () => {
  const email = nextEmail();
  const first = await submitted(email);
  // o reenvio cria o segundo token válido do mesmo interessado
  const sibling = await submitted(email);
  expect(sibling.leadId).toBe(first.leadId);
  await confirmedBody(await postConfirm(stack.client(), { token: first.token }));

  for (const [label, token] of [
    ['o mesmo token', first.token],
    ['o token irmão', sibling.token],
  ] as const) {
    const before = await recorded(stack);
    const response = await postConfirm(stack.client(), { token });
    expect(response.status, label).toBe(200);
    expect(await response.text(), label).toBe('{"status":"confirmed"}');
    expect(await recorded(stack), label).toEqual(before);
  }
  expect((await tokenRow(sibling.token))!.used_at).toBeNull();
});

test('six_invalid_tokens_422_and_token_before_expiry_200', async () => {
  const expired = await submitted();
  await stack.query(`update lead_verifications set expires_at = now() - interval '1 second' where token_hash = $1`, [sha256(expired.token)]);
  const deleted = await submitted();
  await stack.query('delete from leads where id = $1', [deleted.leadId]);

  const cases: Array<[label: string, body: Record<string, unknown>]> = [
    ['ausente', {}],
    ['vazio', { token: '' }],
    ['abc', { token: 'abc' }],
    ['43 caracteres de token nenhum', { token: 'A'.repeat(43) }],
    ['vencido há um segundo', { token: expired.token }],
    ['de interessado apagado', { token: deleted.token }],
  ];
  expect(cases).toHaveLength(6);
  for (const [label, body] of cases) {
    const before = await recorded(stack);
    const response = await postConfirm(stack.client(), body);
    expect(response.status, label).toBe(422);
    expect((await problem(response)).errors, label).toContainEqual({ path: 'token', message: INVALID });
    expect(await recorded(stack), label).toEqual(before);
  }
  expect(await verifiedAt(expired.leadId)).toBeNull();

  const soon = await submitted();
  await stack.query(`update lead_verifications set expires_at = now() + interval '1 minute' where token_hash = $1`, [sha256(soon.token)]);
  await confirmedBody(await postConfirm(stack.client(), { token: soon.token }));
});

test('used_token_of_unconfirmed_lead_422', async () => {
  const { leadId, token } = await submitted();
  await stack.query('update lead_verifications set used_at = now() where token_hash = $1', [sha256(token)]);
  expect(await verifiedAt(leadId)).toBeNull();
  const before = await recorded(stack);

  const response = await postConfirm(stack.client(), { token });

  expect(response.status).toBe(422);
  expect((await problem(response)).errors).toContainEqual({ path: 'token', message: INVALID });
  expect(await recorded(stack)).toEqual(before);
});

test('two_concurrent_confirms_one_audit_row', async () => {
  const { leadId, token } = await submitted();

  const responses = await releasedTogether([() => postConfirm(stack.client(), { token }), () => postConfirm(stack.client(), { token })]);

  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  const confirmed = (await auditRows(stack)).filter((row) => row.action === 'lead.confirmed' && row.entity_id === leadId);
  expect(confirmed).toHaveLength(1);
});
