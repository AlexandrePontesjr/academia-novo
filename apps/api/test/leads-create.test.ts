import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { SITE } from '../../web/src/app/site-content.ts';
import { LeadsService } from '../src/leads/leads.service.ts';
import { MailService } from '../src/mail/mail.service.ts';
import { WEB_ORIGIN } from './support/app.ts';
import { captureOutput } from './support/log.ts';
import {
  currentTermVersion,
  leadBody,
  leadRows,
  nextEmail,
  nextIp,
  postLead,
  recorded,
  sha256,
} from './support/leads.ts';
import { captureMail, confirmLink } from './support/mail.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { cpfOf, releasedTogether } from './support/students.ts';

let stack: Stack;
const mail = captureMail();

beforeAll(async () => {
  stack = await startStack([], undefined, { mail: mail.transport });
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

afterEach(() => {
  mail.deliver();
  mail.clear();
  vi.restoreAllMocks();
});

const ANA = 'ana@example.com';

/** Tira do banco o que outro teste deixou para o e-mail: o interessado, os tokens e a contagem. */
async function forget(email: string) {
  await stack.query('delete from leads where email = $1', [email]);
  await stack.query('delete from lead_throttles where key = $1', [`email:${email}`]);
}

/** Um interessado inserido por SQL, com o termo 1 e as colunas dadas; devolve o `id`. */
async function insertLead(columns: Record<string, unknown>) {
  const values = { name: 'Semente', phone: '11912345678', source: 'form', consent_purpose: 'data_processing', consent_term_version: 1, ...columns };
  const names = Object.keys(values);
  const [row] = await stack.query<{ id: string }>(
    `insert into leads (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')}) returning id`,
    Object.values(values),
  );
  return row!.id;
}

let students = 0;
async function insertStudent(email: string | null = null) {
  const [row] = await stack.query<{ id: string }>(
    `insert into students (name, cpf, birth_date, phone, email) values ('Aluna Semente', $1, '2000-01-01', '11912345678', $2) returning id`,
    [cpfOf(9_100 + ++students), email],
  );
  return row!.id;
}

const rowText = async (id: string) =>
  (await stack.query<{ row: string }>('select to_jsonb(l)::text as row from leads l where id = $1', [id]))[0]?.row;

const tokenCount = async (leadId: string) =>
  Number((await stack.query<{ n: string }>('select count(*) as n from lead_verifications where lead_id = $1', [leadId]))[0]!.n);

test('create_202_pending_and_new_form_row', async () => {
  await forget(ANA);
  const term = await currentTermVersion(stack);
  const client = stack.client();

  const response = await postLead(client, { name: 'Ana Souza', email: 'Ana@Example.com', phone: '(11) 98765-4321', adult: true, termVersion: term });

  expect(response.status).toBe(202);
  expect(await response.text()).toBe('{"status":"pending"}');
  const rows = await leadRows(stack, ANA);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    status: 'new',
    source: 'form',
    email: ANA,
    phone: '11987654321',
    consent_purpose: 'data_processing',
    consent_term_version: term,
    email_verified_at: null,
  });

  // com `website` vazio, o mesmo resultado
  const other = 'ana.vazio@example.com';
  await forget(other);
  const blank = await postLead(client, { name: 'Ana Souza', email: 'Ana.Vazio@Example.com', phone: '(11) 98765-4321', adult: true, termVersion: term, website: '' });
  expect(blank.status).toBe(202);
  expect(await blank.text()).toBe('{"status":"pending"}');
  expect(await leadRows(stack, other)).toEqual([
    expect.objectContaining({ status: 'new', source: 'form', email: other, phone: '11987654321', consent_term_version: term, email_verified_at: null }),
  ]);
});

test('create_stores_token_hash_and_mails_the_confirm_link', async () => {
  await forget(ANA);
  const client = stack.client();

  const response = await postLead(client, await leadBody(stack, { email: 'Ana@Example.com' }));
  expect(response.status).toBe(202);

  const [lead] = await leadRows(stack, ANA);
  const tokens = await stack.query<{ token_hash: string; lifetime: string; used_at: Date | null }>(
    // a diferença em segundos, escrita como intervalo: `24:00:00` e não o `1 day` da subtração
    `select token_hash, (extract(epoch from expires_at - created_at) * interval '1 second')::text as lifetime, used_at
       from lead_verifications where lead_id = $1`,
    [lead!.id],
  );
  expect(tokens).toHaveLength(1);
  expect(tokens[0]!.lifetime).toBe('24:00:00');
  expect(tokens[0]!.used_at).toBeNull();

  expect(mail.sent).toHaveLength(1);
  const [message] = mail.sent;
  expect(message!.to).toBe(ANA);
  expect(message!.subject).toBe('Confirme seu pré-cadastro');
  const { link, token } = confirmLink(message!, WEB_ORIGIN);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(link).toBe(`${WEB_ORIGIN}/matricula/confirmar?token=${token}`);
  expect(message!.html).toContain(link);
  expect(sha256(token)).toBe(tokens[0]!.token_hash);
  expect(message!.text).toContain(SITE.name);
  expect(message!.text).toContain('O link vale por 24 horas. Se você não pediu, ignore este e-mail.');
});

test('create_fourteen_refusals_422_and_bounds_accepted', async () => {
  const client = stack.client();
  const refusals: Array<[label: string, change: Record<string, unknown>, path: string]> = [
    ['name ausente', { name: undefined }, 'name'],
    ['name vazio', { name: '' }, 'name'],
    ['name só de espaços', { name: '   ' }, 'name'],
    ['name com U+0000', { name: 'Ana\u0000Souza' }, 'name'],
    ['email ausente', { email: undefined }, 'email'],
    ['email ana', { email: 'ana' }, 'email'],
    ['email ana@', { email: 'ana@' }, 'email'],
    ['email com U+0000', { email: 'ana\u0000@example.com' }, 'email'],
    ['phone ausente', { phone: undefined }, 'phone'],
    ['phone 123', { phone: '123' }, 'phone'],
    ['phone de 12 dígitos', { phone: '119876543210' }, 'phone'],
    ['phone com letras', { phone: '11abc654321' }, 'phone'],
  ];
  // os nomes de 121 caracteres e o de 120 são as duas bordas de `nameSchema`
  const name120 = `Zé ${'a'.repeat(117)}`;
  expect(name120).toHaveLength(120);
  refusals.push(['name de 121 caracteres', { name: `${name120}a` }, 'name']);
  expect(refusals).toHaveLength(13);

  for (const [label, change, path] of refusals) {
    const before = await recorded(stack);
    const body = { ...(await leadBody(stack)), ...change };
    const response = await postLead(client, JSON.parse(JSON.stringify(body)));
    expect(response.status, label).toBe(422);
    expect((await problem(response)).errors?.map((error) => error.path), label).toContain(path);
    expect(await recorded(stack), label).toEqual(before);
    expect(mail.sent, label).toEqual([]);
  }

  for (const [label, change] of [
    ['phone de 10 dígitos', { phone: '1134567890' }],
    ['phone de 11 dígitos', { phone: '11987654321' }],
    ['name de 120 caracteres com é', { name: name120 }],
  ] as const) {
    const response = await postLead(client, await leadBody(stack, change));
    expect(response.status, label).toBe(202);
  }
});

test('adult_not_true_422_with_minor_message', async () => {
  const client = stack.client();
  for (const [label, adult] of [
    ['ausente', undefined],
    ['false', false],
    ['"true"', 'true'],
    ['1', 1],
  ] as const) {
    const before = await recorded(stack);
    const body = { ...(await leadBody(stack)), adult };
    const response = await postLead(client, JSON.parse(JSON.stringify(body)));
    expect(response.status, label).toBe(422);
    expect((await problem(response)).errors, label).toContainEqual({
      path: 'adult',
      message: 'Menores de 18 anos fazem a matrícula na recepção, com o responsável.',
    });
    expect(await recorded(stack), label).toEqual(before);
  }
});

test('term_version_must_be_the_current_one', async () => {
  await stack.query(
    `insert into consent_terms (purpose, version, text) values ('data_processing', 2, 'Termo de tratamento v2') on conflict do nothing`,
  );
  expect(await currentTermVersion(stack)).toBe(2);
  const client = stack.client();

  for (const [label, termVersion] of [
    ['1', 1],
    ['ausente', undefined],
    ['3', 3],
  ] as const) {
    const before = await recorded(stack);
    const body = { ...(await leadBody(stack)), termVersion };
    const response = await postLead(client, JSON.parse(JSON.stringify(body)));
    expect(response.status, label).toBe(422);
    expect((await problem(response)).errors?.map((error) => error.path), label).toEqual(['termVersion']);
    expect(await recorded(stack), label).toEqual(before);
  }

  const email = nextEmail();
  const accepted = await postLead(client, await leadBody(stack, { email, termVersion: 2 }));
  expect(accepted.status).toBe(202);
  expect((await leadRows(stack, email))[0]).toMatchObject({ consent_term_version: 2 });
});

test('resend_to_open_unconfirmed_lead_updates_same_row_and_mails_new_token', async () => {
  await forget(ANA);
  const client = stack.client();
  expect((await postLead(client, await leadBody(stack, { email: ANA }))).status).toBe(202);
  const [first] = await leadRows(stack, ANA);
  mail.clear();

  const response = await postLead(client, await leadBody(stack, { email: 'ANA@example.com', name: 'Ana S.', phone: '(21) 3333-4444' }));

  expect(response.status).toBe(202);
  expect(await response.text()).toBe('{"status":"pending"}');
  const rows = await leadRows(stack, ANA);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: first!.id, name: 'Ana S.', phone: '2133334444' });
  const tokens = await stack.query<{ token_hash: string; valid: boolean }>(
    `select token_hash, (used_at is null and expires_at > now()) as valid from lead_verifications where lead_id = $1 order by created_at, id`,
    [first!.id],
  );
  expect(tokens.map((token) => token.valid)).toEqual([true, true]);
  expect(mail.sent).toHaveLength(1);
  expect(sha256(confirmLink(mail.sent[0]!, WEB_ORIGIN).token)).toBe(tokens[1]!.token_hash);

  // com o interessado `contacted` e não confirmado, o mesmo resultado
  const email = nextEmail('contatada');
  const contacted = await insertLead({ email, status: 'contacted' });
  mail.clear();
  const again = await postLead(client, await leadBody(stack, { email, name: 'Contatada Nova', phone: '(21) 3333-5555' }));
  expect(again.status).toBe(202);
  expect(await again.text()).toBe('{"status":"pending"}');
  const contactedRows = await leadRows(stack, email);
  expect(contactedRows).toHaveLength(1);
  expect(contactedRows[0]).toMatchObject({ id: contacted, status: 'contacted', name: 'Contatada Nova', phone: '2133335555' });
  expect(await tokenCount(contacted)).toBe(1);
  expect(mail.sent.map((message) => message.to)).toEqual([email]);
});

test('resend_to_confirmed_open_lead_changes_nothing_and_mails_nothing', async () => {
  const client = stack.client();
  for (const status of ['new', 'contacted']) {
    const email = nextEmail('confirmada');
    const id = await insertLead({ email, status, email_verified_at: new Date('2026-10-20T12:00:00Z') });
    const before = await rowText(id);

    const response = await postLead(client, await leadBody(stack, { email, name: 'Outro Nome' }));

    expect(response.status, status).toBe(202);
    expect(await response.text(), status).toBe('{"status":"pending"}');
    expect(await rowText(id), status).toBe(before);
    expect(await leadRows(stack, email), status).toHaveLength(1);
    expect(await tokenCount(id), status).toBe(0);
    expect(mail.sent, status).toEqual([]);
  }
});

test('converted_discarded_or_student_email_creates_new_lead', async () => {
  const client = stack.client();
  const converted = nextEmail('convertida');
  const convertedId = await insertLead({ email: converted, status: 'converted', student_id: await insertStudent() });
  const discarded = nextEmail('descartada');
  const discardedId = await insertLead({ email: discarded, status: 'discarded' });
  const student = nextEmail('aluna');
  await insertStudent(student);

  for (const [email, previous] of [
    [converted, convertedId],
    [discarded, discardedId],
    [student, null],
  ] as const) {
    const before = previous ? await rowText(previous) : undefined;
    const response = await postLead(client, await leadBody(stack, { email }));
    expect(response.status, email).toBe(202);
    const rows = await leadRows(stack, email);
    expect(rows, email).toHaveLength(previous ? 2 : 1);
    expect(rows.filter((row) => row.id !== previous), email).toEqual([expect.objectContaining({ status: 'new', source: 'form' })]);
    if (previous) expect(await rowText(previous), email).toBe(before);
  }
});

test('three_concurrent_creates_same_email_one_open_row', async () => {
  const email = nextEmail('corrida');
  const bodies = await Promise.all([1, 2, 3].map(() => leadBody(stack, { email })));

  const responses = await releasedTogether(bodies.map((body) => () => postLead(stack.client(), body, nextIp())));

  expect(responses.map((response) => response.status)).toEqual([202, 202, 202]);
  const open = (await leadRows(stack, email)).filter((row) => ['new', 'contacted'].includes(String(row.status)));
  expect(open).toHaveLength(1);
});

test('honeypot_filled_202_and_nothing_recorded_or_counted', async () => {
  const client = stack.client();
  for (const [label, body] of [
    ['campos válidos', await leadBody(stack, { website: 'http://spam' })],
    ['campos inválidos', { name: '', email: 'ana', phone: '1', adult: false, website: 'http://spam' }],
  ] as const) {
    const before = await recorded(stack);
    const response = await postLead(client, body);
    expect(response.status, label).toBe(202);
    expect(await response.text(), label).toBe('{"status":"pending"}');
    expect(await recorded(stack), label).toEqual(before);
    expect(mail.sent, label).toEqual([]);
  }
});

test('mail_failure_or_timeout_keeps_202_and_logs_id_without_address', async () => {
  const client = stack.client();
  for (const [label, arrange, wait] of [
    ['falha', () => mail.fail(), 0],
    ['demora de 15 s', () => mail.delay(15_000), 11_000],
  ] as const) {
    await forget(ANA);
    arrange();
    const output = captureOutput();
    const startedAt = performance.now();

    const response = await postLead(client, await leadBody(stack, { email: ANA }));

    expect(response.status, label).toBe(202);
    expect(performance.now() - startedAt, label).toBeLessThan(2000);
    const [lead] = await leadRows(stack, ANA);
    expect(lead, label).toBeDefined();
    expect(await tokenCount(String(lead!.id)), label).toBe(1);
    await vi.waitFor(() => expect(output.text()).toContain('lead_mail_failed'), { timeout: wait + 2000, interval: 100 });
    const lines = output.text().split('\n');
    expect(lines.filter((line) => line.includes('lead_mail_failed') && line.includes(String(lead!.id))), label).toHaveLength(1);
    expect(lines.filter((line) => line.includes(ANA)), label).toEqual([]);
    vi.restoreAllMocks();
  }
}, 60_000);

test('options_200_with_google_flag_and_current_term', async () => {
  const client = stack.client();
  const read = async () => {
    const response = await client.get('/api/leads/options', { origin: null });
    expect(response.status).toBe(200);
    return (await response.json()) as Record<string, unknown>;
  };
  const current = async () =>
    (
      await stack.query<{ version: number; text: string }>(
        `select version, text from consent_terms where purpose = 'data_processing' order by version desc limit 1`,
      )
    )[0]!;

  const body = await read();
  expect(Object.keys(body).sort()).toEqual(['google', 'term']);
  expect(typeof body.google).toBe('boolean');
  expect(Object.keys(body.term as object).sort()).toEqual(['text', 'version']);
  expect(body.term).toEqual(await current());

  await stack.query(
    `insert into consent_terms (purpose, version, text) values ('data_processing', 2, 'Termo de tratamento v2') on conflict do nothing`,
  );
  const after = await read();
  expect(after.term).toEqual({ version: 2, text: (await current()).text });
});

test('same_202_body_and_headers_for_five_email_situations', async () => {
  const client = stack.client();
  const unconfirmed = nextEmail('aberta');
  await insertLead({ email: unconfirmed });
  const confirmed = nextEmail('confirmada');
  await insertLead({ email: confirmed, email_verified_at: new Date('2026-10-20T12:00:00Z') });
  const student = nextEmail('aluna');
  await insertStudent(student);

  const situations: Array<[label: string, body: Record<string, unknown>]> = [
    ['e-mail novo', await leadBody(stack)],
    ['aberto não confirmado', await leadBody(stack, { email: unconfirmed })],
    ['aberto confirmado', await leadBody(stack, { email: confirmed })],
    ['de aluno', await leadBody(stack, { email: student })],
    ['armadilha', await leadBody(stack, { website: 'http://spam' })],
  ];
  const answers = [];
  for (const [label, body] of situations) {
    const response = await postLead(client, body);
    const headers = [...response.headers].filter(([name]) => !['x-request-id', 'date'].includes(name));
    answers.push({ label, status: response.status, body: await response.text(), headers });
  }
  for (const answer of answers.slice(1)) {
    expect({ ...answer, label: '' }, answer.label).toEqual({ ...answers[0], label: '' });
  }
  expect(answers[0]).toMatchObject({ status: 202, body: '{"status":"pending"}' });
});

test('resend_decision_table_eight_rows', async () => {
  const service = new LeadsService(stack.database.db, new MailService(mail.transport), WEB_ORIGIN, false);
  type Effect = 'new_row' | 'same_row_token_and_mail' | 'nothing';
  const verified = new Date('2026-10-20T12:00:00Z');
  const rows: Array<[label: string, arrange: (email: string) => Promise<unknown>, effect: Effect]> = [
    ['nenhum interessado', async () => undefined, 'new_row'],
    ['new não confirmado', (email) => insertLead({ email, status: 'new' }), 'same_row_token_and_mail'],
    ['contacted não confirmado', (email) => insertLead({ email, status: 'contacted' }), 'same_row_token_and_mail'],
    ['new confirmado', (email) => insertLead({ email, status: 'new', email_verified_at: verified }), 'nothing'],
    ['contacted confirmado', (email) => insertLead({ email, status: 'contacted', email_verified_at: verified }), 'nothing'],
    ['converted', async (email) => insertLead({ email, status: 'converted', student_id: await insertStudent() }), 'new_row'],
    ['discarded', (email) => insertLead({ email, status: 'discarded' }), 'new_row'],
    ['aluno sem interessado', (email) => insertStudent(email), 'new_row'],
  ];
  expect(rows).toHaveLength(8);

  for (const [label, arrange, effect] of rows) {
    const email = nextEmail('tabela');
    await arrange(email);
    const before = await leadRows(stack, email);
    const tokensBefore = Number((await stack.query<{ n: string }>('select count(*) as n from lead_verifications')).at(0)!.n);
    mail.clear();

    const answer = await service.create(
      { name: 'Nome Novo', email, phone: '11955554444', adult: true, termVersion: await currentTermVersion(stack) },
      { userId: null, ip: nextIp(), userAgent: null },
    );

    expect(answer, label).toEqual({ status: 'pending' });
    const after = await leadRows(stack, email);
    const tokensAfter = Number((await stack.query<{ n: string }>('select count(*) as n from lead_verifications')).at(0)!.n);
    if (effect === 'new_row') {
      expect(after, label).toHaveLength(before.length + 1);
      expect(after.slice(0, before.length), label).toEqual(before);
      expect(after.at(-1), label).toMatchObject({ status: 'new', name: 'Nome Novo', phone: '11955554444' });
      expect(tokensAfter, label).toBe(tokensBefore + 1);
      expect(mail.sent.map((message) => message.to), label).toEqual([email]);
    } else if (effect === 'same_row_token_and_mail') {
      expect(after, label).toHaveLength(1);
      expect(after[0], label).toMatchObject({ id: before[0]!.id, status: before[0]!.status, name: 'Nome Novo', phone: '11955554444' });
      expect(tokensAfter, label).toBe(tokensBefore + 1);
      expect(mail.sent.map((message) => message.to), label).toEqual([email]);
    } else {
      expect(after, label).toEqual(before);
      expect(tokensAfter, label).toBe(tokensBefore);
      expect(mail.sent, label).toEqual([]);
    }
  }
});
