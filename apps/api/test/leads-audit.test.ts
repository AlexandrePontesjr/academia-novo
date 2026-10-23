import type { Role } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { GOOGLE_TOKEN_URL } from '../src/leads/lead-google.ts';
import { WEB_ORIGIN } from './support/app.ts';
import { auditCount, auditRows, withAuditInsertFailing, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import { insertConvertedLead, insertLead, leadBody, leadRows, nextEmail, nextIp, postConfirm, postLead } from './support/leads.ts';
import { captureMail, confirmLink } from './support/mail.ts';
import { type Stack, startStack } from './support/stack.ts';
import { cpfOf, studentBody, unknownId } from './support/students.ts';

const CLIENT_ID = 'cliente-trilha.apps.googleusercontent.com';

let stack: Stack;
const mail = captureMail();
const sessions = {} as Record<Role, Client>;
const userIds = {} as Record<Role, string>;
let googleEmail = 'Bia@Gmail.com';
let googleName = 'Bia Lima';
const realFetch = globalThis.fetch;
let counter = 83_000;
const next = () => (counter += 1);

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

beforeAll(async () => {
  stack = await startStack([], undefined, {
    mail: mail.transport,
    env: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 'segredo-do-cliente-trilha' },
  });
  for (const role of ['admin', 'reception', 'hr_finance', 'instructor'] as Role[]) {
    const { user, client } = await stack.session(role);
    sessions[role] = client;
    userIds[role] = user.id;
  }
  // só o endpoint de token do Google é trocado: devolve um `id_token` válido pela door 7
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== GOOGLE_TOKEN_URL) return realFetch(input, init);
    const claims = {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: googleEmail,
      email_verified: true,
      name: googleName,
    };
    return Response.json({ id_token: `${base64url({ alg: 'RS256' })}.${base64url(claims)}.assinatura` });
  });
}, 180_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await stack?.close();
});

afterEach(() => mail.clear());

/** Um navegador que passou pelo Google com o e-mail e o nome dados. */
async function signedInWithGoogle(email: string, name: string) {
  googleEmail = email;
  googleName = name;
  const client = stack.client();
  const start = await client.get('/api/leads/google/start', { redirect: 'manual' });
  const state = new URL(start.headers.get('Location')!).searchParams.get('state')!;
  const callback = await client.get(`/api/leads/google/callback?${new URLSearchParams({ code: 'c', state })}`, { redirect: 'manual' });
  expect(callback.headers.get('Location'), 'callback').toBe('/matricula?google=ok');
  return client;
}

const tokenFor = (email: string) => confirmLink(mail.sent.filter((message) => message.to === email).at(-1)!, WEB_ORIGIN).token;
const leadIdOf = async (email: string) => String((await leadRows(stack, email)).at(-1)!.id);

test('created_row_for_form_and_google_with_source_and_status', async () => {
  const email = nextEmail('trilha');
  const ip = nextIp();
  const submitted = await leadBody(stack, { email });
  const form = await written(stack, () => postLead(stack.client(), submitted, ip));
  expect(form.result.status).toBe(202);
  const formId = await leadIdOf(email);
  expect(form.rows).toHaveLength(1);
  expect(form.rows[0]).toMatchObject({ action: 'lead.created', user_id: null, entity: 'lead', entity_id: formId, ip });
  expect(form.rows[0]!.diff).toEqual({ fields: ['source', 'status'], values: { source: { from: null, to: 'form' }, status: { from: null, to: 'new' } } });

  const client = await signedInWithGoogle('Carla@Gmail.com', 'Carla Dias');
  const googleIp = nextIp();
  const google = await written(stack, async () => postLead(client, await leadBody(stack), googleIp));
  expect(await google.result.text()).toBe('{"status":"confirmed"}');
  const googleId = await leadIdOf('carla@gmail.com');
  // só `lead.created`: o caminho do Google não grava `lead.confirmed`
  expect(google.rows).toHaveLength(1);
  expect(google.rows[0]).toMatchObject({ action: 'lead.created', user_id: null, entity: 'lead', entity_id: googleId, ip: googleIp });
  expect(google.rows[0]!.diff).toEqual({ fields: ['source', 'status'], values: { source: { from: null, to: 'google' }, status: { from: null, to: 'new' } } });
});

test('confirmed_row_without_diff', async () => {
  const email = nextEmail('confirma');
  await postLead(stack.client(), await leadBody(stack, { email }));
  const leadId = await leadIdOf(email);
  const ip = nextIp();

  const { result, rows } = await written(stack, () => postConfirm(stack.client(), { token: tokenFor(email) }, ip));

  expect(result.status).toBe(200);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'lead.confirmed', user_id: null, entity: 'lead', entity_id: leadId, ip, diff: null });
});

test('status_changed_rows_on_patch_and_conversion_none_when_unchanged', async () => {
  const transitions = [
    ['new', 'contacted'],
    ['contacted', 'discarded'],
    ['discarded', 'new'],
    ['new', 'discarded'],
    ['contacted', 'new'],
  ] as const;
  for (const role of ['admin', 'reception', 'hr_finance'] as const) {
    const author = userIds[role];
    for (const [from, to] of transitions) {
      const id = await insertLead(stack, { status: from });
      const { result, rows } = await written(stack, () => sessions[role].patch(`/api/leads/${id}`, { status: to }));
      expect(result.status, `${role} ${from}->${to}`).toBe(200);
      expect(rows, `${role} ${from}->${to}`).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'lead.status_changed', entity: 'lead', entity_id: id, user_id: author });
      expect(rows[0]!.diff).toEqual({ fields: ['status'], values: { status: { from, to } } });
    }
  }

  // a conversão: `student.created` e `lead.status_changed` de `new` para `converted`, na mesma transação
  const leadId = await insertLead(stack);
  const conversion = await written(stack, () => sessions.admin.post('/api/students', studentBody(next(), { leadId })));
  expect(conversion.result.status).toBe(201);
  const { id: studentId } = (await conversion.result.json()) as { id: string };
  expect(conversion.rows.map((row) => row.action)).toEqual(['student.created', 'lead.status_changed']);
  expect(conversion.rows[0]).toMatchObject({ entity: 'student', entity_id: studentId });
  expect(conversion.rows[1]).toMatchObject({ entity: 'lead', entity_id: leadId, user_id: userIds.admin });
  expect(conversion.rows[1]!.diff).toEqual({ fields: ['status'], values: { status: { from: 'new', to: 'converted' } } });
  const [together] = await stack.query<{ same: boolean }>(
    `select count(distinct xmin::text) = 1 as same from audit_logs where id = any($1::uuid[])`,
    [conversion.rows.map((row) => row.id)],
  );
  expect(together!.same, 'as duas linhas na mesma transação').toBe(true);

  // a mesma situação: `200` e nenhuma linha
  const same = await insertLead(stack, { status: 'contacted' });
  const unchanged = await written(stack, () => sessions.reception.patch(`/api/leads/${same}`, { status: 'contacted' }));
  expect(unchanged.result.status).toBe(200);
  expect(unchanged.rows).toEqual([]);
});

test('no_row_for_resends_honeypot_repeat_confirm_and_4xx', async () => {
  const open = nextEmail('reenvio');
  await postLead(stack.client(), await leadBody(stack, { email: open }));
  const confirmed = nextEmail('confirmado');
  await postLead(stack.client(), await leadBody(stack, { email: confirmed }));
  const confirmedToken = tokenFor(confirmed);
  await postConfirm(stack.client(), { token: confirmedToken });
  const lead = await insertLead(stack);
  const converted = (await insertConvertedLead(stack)).id;
  const crowded = nextIp();
  for (let index = 0; index < 5; index += 1) await postLead(stack.client(), await leadBody(stack), crowded);

  const cases: Array<[label: string, send: () => Promise<Response>, status: number]> = [
    ['reenvio a aberto não confirmado', async () => postLead(stack.client(), await leadBody(stack, { email: open })), 202],
    ['reenvio a aberto confirmado', async () => postLead(stack.client(), await leadBody(stack, { email: confirmed })), 202],
    ['armadilha', async () => postLead(stack.client(), await leadBody(stack, { website: 'http://spam' })), 202],
    ['confirmação repetida', () => postConfirm(stack.client(), { token: confirmedToken }), 200],
    ['401 lista', () => stack.client().get('/api/leads'), 401],
    ['401 patch', () => stack.client().patch(`/api/leads/${lead}`, { status: 'contacted' }), 401],
    ['403 lista do instrutor', () => sessions.instructor.get('/api/leads'), 403],
    ['403 patch do instrutor', () => sessions.instructor.patch(`/api/leads/${lead}`, { status: 'contacted' }), 403],
    ['403 conversão pelo RH', () => sessions.hr_finance.post('/api/students', studentBody(next(), { leadId: lead })), 403],
    ['403 origem', async () => stack.client().request('POST', '/api/leads', { body: await leadBody(stack), origin: null }), 403],
    ['404 patch', () => sessions.admin.patch(`/api/leads/${unknownId()}`, { status: 'contacted' }), 404],
    ['404 perfil do Google sem cookie', () => stack.client().get('/api/leads/google/profile'), 404],
    ['409 patch de convertido', () => sessions.admin.patch(`/api/leads/${converted}`, { status: 'new' }), 409],
    ['409 conversão de convertido', () => sessions.admin.post('/api/students', studentBody(next(), { leadId: converted })), 409],
    ['422 envio', async () => postLead(stack.client(), await leadBody(stack, { email: 'ana@' })), 422],
    ['422 termo', async () => postLead(stack.client(), await leadBody(stack, { termVersion: 3 })), 422],
    ['422 confirmação', () => postConfirm(stack.client(), { token: 'abc' }), 422],
    ['422 lista', () => sessions.admin.get('/api/leads?status=lead'), 422],
    ['422 patch', () => sessions.admin.patch(`/api/leads/${lead}`, { status: 'converted' }), 422],
    ['422 conversão', () => sessions.admin.post('/api/students', studentBody(next(), { leadId: unknownId() })), 422],
    ['429', async () => postLead(stack.client(), await leadBody(stack), crowded), 429],
  ];
  for (const [label, send, status] of cases) {
    const before = await auditCount(stack);
    const response = await send();
    expect(response.status, label).toBe(status);
    expect(await auditCount(stack), label).toBe(before);
  }
});

test('no_personal_data_in_any_audit_column', async () => {
  const name = 'Zé Único';
  const email = 'ze.unico@example.com';
  const phone = '11912345678';
  const body = async () => leadBody(stack, { name, email, phone });

  await postLead(stack.client(), await body()); // criar
  await postLead(stack.client(), await body()); // reenviar
  await postConfirm(stack.client(), { token: tokenFor(email) }); // confirmar
  const leadId = await leadIdOf(email);
  await sessions.reception.patch(`/api/leads/${leadId}`, { status: 'contacted' }); // mudar situação
  const conversion = await sessions.admin.post('/api/students', { name, cpf: cpfOf(next()), birthDate: '2000-01-01', phone, email, leadId }); // converter
  expect(conversion.status).toBe(201);
  const google = await signedInWithGoogle(email, name);
  expect((await postLead(google, await body())).status).toBe(202); // Google, depois da conversão: interessado novo
  await stack.query(`update leads set created_at = now() - interval '91 days' where email = $1`, [email]);
  await stack.api.leadRetention(); // reter

  const rows = await stack.query<{ action: string; entity: string; text: string; fields: string[] | null }>(
    `select action, entity, to_jsonb(a)::text as text, diff->'fields' as fields from audit_logs a`,
  );
  const actions = new Set(rows.map((row) => row.action));
  for (const action of ['lead.created', 'lead.confirmed', 'lead.status_changed', 'lead.purged']) expect(actions.has(action), action).toBe(true);
  for (const row of rows) {
    for (const secret of [name, 'ze.unico', phone]) expect(row.text, `${row.action} ${secret}`).not.toContain(secret);
  }
  for (const row of rows.filter((row) => row.entity === 'lead')) {
    for (const key of ['name', 'email', 'phone']) expect(row.fields ?? [], `${row.action} ${key}`).not.toContain(key);
  }
});

test('audit_failure_500_rolls_back_four_writes', async () => {
  const tables = async () => {
    const text = async (table: string) =>
      (await stack.query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by 1`)).map((row) => row.row);
    return { leads: await text('leads'), verifications: await text('lead_verifications'), students: await text('students') };
  };
  const pendingEmail = nextEmail('pendente');
  await postLead(stack.client(), await leadBody(stack, { email: pendingEmail }));
  const token = tokenFor(pendingEmail);
  const open = await insertLead(stack);
  mail.clear();

  const writes: Array<[label: string, send: () => Promise<Response>]> = [
    ['POST /api/leads', async () => postLead(stack.client(), await leadBody(stack))],
    ['POST /api/leads/confirm', () => postConfirm(stack.client(), { token })],
    ['PATCH /api/leads/:id', () => sessions.admin.patch(`/api/leads/${open}`, { status: 'contacted' })],
    ['POST /api/students com leadId', () => sessions.admin.post('/api/students', studentBody(next(), { leadId: open }))],
  ];
  for (const [label, send] of writes) {
    const before = await tables();
    const response = await withAuditInsertFailing(stack, send);
    expect(response.status, label).toBe(500);
    expect(await tables(), label).toEqual(before);
  }
  expect(mail.sent).toEqual([]);
  expect((await auditRows(stack)).filter((row) => row.entity_id === open)).toEqual([]);
});
