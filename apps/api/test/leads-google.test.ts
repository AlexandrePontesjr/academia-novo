import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import {
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_TOKEN_URL,
  profileFromClaims,
  signCookie,
  verifyCookie,
} from '../src/leads/lead-google.ts';
import { AUTH_SECRET, startApi, WEB_ORIGIN } from './support/app.ts';
import { type Client, createClient } from './support/client.ts';
import { databaseNow, leadBody, leadRows, nextEmail, postLead } from './support/leads.ts';
import { captureMail } from './support/mail.ts';
import { problem, type Stack, startStack } from './support/stack.ts';

const CLIENT_ID = 'cliente-academia.apps.googleusercontent.com';
const CLIENT_SECRET = 'segredo-do-cliente-google';
const BIA = 'bia@gmail.com';

let stack: Stack;
const mail = captureMail();

/** O que o dublê do endpoint de token do Google recebeu, e o que ele responde no caso em curso. */
const tokenCalls: URLSearchParams[] = [];
let tokenAnswer: () => Response | Promise<Response> = () => Response.json({ id_token: idToken({}) });
const realFetch = globalThis.fetch;

beforeAll(async () => {
  stack = await startStack([], undefined, {
    mail: mail.transport,
    env: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET },
  });
  // só o endpoint de token do Google é trocado; o resto, inclusive as chamadas à API, segue de verdade
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== GOOGLE_TOKEN_URL) return realFetch(input, init);
    tokenCalls.push(new URLSearchParams(String(init?.body)));
    return tokenAnswer();
  });
}, 180_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await stack?.close();
});

afterEach(() => {
  tokenCalls.splice(0);
  tokenAnswer = () => Response.json({ id_token: idToken({}) });
  mail.clear();
});

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Um `id_token` de assinatura nenhuma (door 7), com as declarações válidas trocadas pelas dadas. */
function idToken(claims: Record<string, unknown>) {
  const valid = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'Bia@Gmail.com',
    email_verified: true,
    name: 'Bia Lima',
  };
  return `${base64url({ alg: 'RS256' })}.${base64url({ ...valid, ...claims })}.assinatura`;
}

/** O `Set-Cookie` de um cookie, inteiro, ou `undefined`. */
const setCookieOf = (response: Response, name: string) =>
  response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));

/** O conteúdo de um cookie assinado, lido como o teste o veria: o JSON antes do ponto. */
const payloadOf = (value: string) =>
  JSON.parse(Buffer.from(value.slice(0, value.lastIndexOf('.')), 'base64url').toString('utf8')) as Record<string, unknown>;

/** Troca um caractere do valor do cookie no navegador do teste. */
function tamper(client: Client, name: string, at: 'payload' | 'signature' = 'signature') {
  const value = client.jar.get(name)!;
  const index = at === 'signature' ? value.length - 2 : 2;
  const swapped = value[index] === 'A' ? 'B' : 'A';
  client.jar.set(name, `${value.slice(0, index)}${swapped}${value.slice(index + 1)}`);
}

async function start(client: Client) {
  const response = await client.get('/api/leads/google/start', { redirect: 'manual' });
  expect(response.status, 'start').toBe(302);
  const location = new URL(response.headers.get('Location')!);
  return { response, location, state: location.searchParams.get('state')! };
}

const callback = (client: Client, query: Record<string, string>) =>
  client.get(`/api/leads/google/callback?${new URLSearchParams(query)}`, { redirect: 'manual' });

/** Um navegador que passou pelo Google: tem o cookie de perfil emitido pelo callback. */
async function signedInWithGoogle(claims: Record<string, unknown> = {}) {
  const client = stack.client();
  const { state } = await start(client);
  tokenAnswer = () => Response.json({ id_token: idToken(claims) });
  const response = await callback(client, { code: 'codigo-1', state });
  expect(response.headers.get('Location'), 'callback').toBe('/matricula?google=ok');
  return client;
}

async function forget(email: string) {
  await stack.query('delete from leads where email = $1', [email]);
  await stack.query('delete from lead_throttles where key = $1', [`email:${email}`]);
}

test('start_302_to_google_with_pkce_and_state_cookie', async () => {
  const client = stack.client();
  const options = await client.get('/api/leads/options');
  expect(((await options.json()) as { google: boolean }).google).toBe(true);

  const { response, location, state } = await start(client);

  expect(`${location.origin}${location.pathname}`).toBe(GOOGLE_AUTHORIZE_URL);
  expect([...location.searchParams.keys()].sort()).toEqual(
    ['client_id', 'code_challenge', 'code_challenge_method', 'prompt', 'redirect_uri', 'response_type', 'scope', 'state'].sort(),
  );
  expect(Object.fromEntries(location.searchParams)).toMatchObject({
    client_id: CLIENT_ID,
    redirect_uri: `${WEB_ORIGIN}/api/leads/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  expect(state.length).toBeGreaterThanOrEqual(32);

  const cookie = setCookieOf(response, 'lead_google_state')!;
  expect(cookie).toBeDefined();
  const attributes = cookie.split(';').map((part) => part.trim());
  expect(attributes).toContain('HttpOnly');
  expect(attributes).toContain('SameSite=Lax');
  expect(attributes).toContain('Path=/api/leads/google');
  expect(attributes).toContain('Max-Age=600');
  const stored = payloadOf(decodeURIComponent(cookie.slice('lead_google_state='.length, cookie.indexOf(';'))));
  expect(stored.state).toBe(state);
  const challenge = createHash('sha256').update(String(stored.verifier)).digest('base64url');
  expect(location.searchParams.get('code_challenge')).toBe(challenge);
});

test('without_google_keys_options_false_and_three_routes_404', async () => {
  const api = await startApi(stack.postgres.url);
  try {
    const client = createClient(api.url);
    const options = await client.get('/api/leads/options');
    expect(options.status).toBe(200);
    expect(((await options.json()) as { google: boolean }).google).toBe(false);
    for (const path of ['/api/leads/google/start', '/api/leads/google/callback?code=x&state=y', '/api/leads/google/profile']) {
      const response = await client.get(path, { redirect: 'manual' });
      expect(response.status, path).toBe(404);
      expect((await problem(response)).code, path).toBe('not_found');
    }
  } finally {
    await api.close();
  }
});

test('callback_valid_id_token_302_ok_and_profile_cookie', async () => {
  for (const iss of ['https://accounts.google.com', 'accounts.google.com']) {
    const client = stack.client();
    const { state } = await start(client);
    const verifier = String(payloadOf(decodeURIComponent(client.jar.get('lead_google_state')!)).verifier);
    tokenAnswer = () => Response.json({ id_token: idToken({ iss }) });

    const response = await callback(client, { code: 'codigo-1', state });

    expect(tokenCalls, iss).toHaveLength(1);
    expect(Object.fromEntries(tokenCalls[0]!), iss).toEqual({
      grant_type: 'authorization_code',
      code: 'codigo-1',
      code_verifier: verifier,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: `${WEB_ORIGIN}/api/leads/google/callback`,
    });
    expect(response.status, iss).toBe(302);
    expect(response.headers.get('Location'), iss).toBe('/matricula?google=ok');
    expect(setCookieOf(response, 'lead_google_state'), iss).toMatch(/Max-Age=0/);
    const profile = setCookieOf(response, 'lead_google_profile')!;
    const attributes = profile.split(';').map((part) => part.trim());
    for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Path=/api/leads', 'Max-Age=900']) expect(attributes, iss).toContain(attribute);
    tokenCalls.splice(0);
  }
});

test('callback_ten_failures_302_erro_without_profile', async () => {
  const now = Math.floor(Date.now() / 1000);
  const cases: Array<[label: string, arrange: (client: Client, state: string) => Promise<Record<string, string>> | Record<string, string>]> = [
    ['state diferente do cookie', () => ({ code: 'c', state: 'outro-state-que-nao-e-o-do-cookie-1234' })],
    [
      'sem cookie',
      (client, state) => {
        client.jar.delete('lead_google_state');
        return { code: 'c', state };
      },
    ],
    [
      'cookie de assinatura inválida',
      (client, state) => {
        tamper(client, 'lead_google_state');
        return { code: 'c', state };
      },
    ],
    ['error=access_denied', (_client, state) => ({ error: 'access_denied', state })],
    [
      'endpoint de token responde 400',
      (_client, state) => {
        tokenAnswer = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
        return { code: 'c', state };
      },
    ],
    [
      'fetch lança erro de rede',
      (_client, state) => {
        tokenAnswer = () => Promise.reject(new TypeError('fetch failed'));
        return { code: 'c', state };
      },
    ],
    ['iss de outro emissor', (_client, state) => withClaims({ iss: 'https://evil.example' }, state)],
    ['aud de outro cliente', (_client, state) => withClaims({ aud: 'outro-cliente.apps.googleusercontent.com' }, state)],
    ['exp no passado', (_client, state) => withClaims({ exp: now - 60 }, state)],
    ['email_verified false', (_client, state) => withClaims({ email_verified: false }, state)],
  ];
  expect(cases).toHaveLength(10);

  function withClaims(claims: Record<string, unknown>, state: string) {
    tokenAnswer = () => Response.json({ id_token: idToken(claims) });
    return { code: 'c', state };
  }

  for (const [label, arrange] of cases) {
    const client = stack.client();
    const { state } = await start(client);
    const query = await arrange(client, state);

    const response = await callback(client, query);

    expect(response.status, label).toBe(302);
    expect(response.headers.get('Location'), label).toBe('/matricula?google=erro');
    expect(setCookieOf(response, 'lead_google_profile'), label).toBeUndefined();
    tokenAnswer = () => Response.json({ id_token: idToken({}) });
  }
});

test('profile_200_with_valid_cookie_404_otherwise', async () => {
  const client = await signedInWithGoogle();
  const response = await client.get('/api/leads/google/profile');
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('{"name":"Bia Lima","email":"bia@gmail.com"}');

  const without = await stack.client().get('/api/leads/google/profile');
  expect(without.status).toBe(404);

  const tampered = await signedInWithGoogle();
  tamper(tampered, 'lead_google_profile');
  expect((await tampered.get('/api/leads/google/profile')).status).toBe(404);

  // um cookie emitido há 16 minutos, pela mesma assinatura: venceu aos 15
  const old = stack.client();
  old.jar.set('lead_google_profile', signCookie({ name: 'Bia Lima', email: BIA }, AUTH_SECRET, 900, Date.now() - 16 * 60_000));
  expect((await old.get('/api/leads/google/profile')).status).toBe(404);
});

test('create_with_google_cookie_confirmed_source_google_no_mail', async () => {
  await forget(BIA);
  const client = await signedInWithGoogle();
  const t0 = await databaseNow(stack);

  const response = await postLead(client, await leadBody(stack, { name: 'Outro Nome', email: 'outra@x.com' }));

  const t1 = await databaseNow(stack);
  expect(response.status).toBe(202);
  expect(await response.text()).toBe('{"status":"confirmed"}');
  const rows = await leadRows(stack, BIA);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ email: BIA, name: 'Bia Lima', source: 'google', status: 'new' });
  const verified = new Date(String(rows[0]!.email_verified_at)).getTime();
  expect(verified).toBeGreaterThanOrEqual(t0.getTime());
  expect(verified).toBeLessThanOrEqual(t1.getTime());
  expect(await leadRows(stack, 'outra@x.com')).toEqual([]);
  expect(await stack.query('select id from lead_verifications where lead_id = $1', [rows[0]!.id])).toEqual([]);
  expect(mail.sent).toEqual([]);
  expect(setCookieOf(response, 'lead_google_profile')).toMatch(/Max-Age=0/);
});

test('tampered_profile_cookie_treated_as_absent', async () => {
  const client = await signedInWithGoogle();
  tamper(client, 'lead_google_profile');
  const email = nextEmail('adulterado');

  const response = await postLead(client, await leadBody(stack, { email }));

  expect(response.status).toBe(202);
  expect(await response.text()).toBe('{"status":"pending"}');
  expect(await leadRows(stack, email)).toEqual([expect.objectContaining({ source: 'form', email, email_verified_at: null })]);
  expect(mail.sent.map((message) => message.to)).toEqual([email]);
});

test('google_create_over_existing_open_lead_confirms_same_row', async () => {
  await forget(BIA);
  const { id } = (
    await stack.query<{ id: string }>(
      `insert into leads (name, email, phone, source, consent_purpose, consent_term_version)
       values ('Bia', $1, '11912345678', 'form', 'data_processing', 1) returning id`,
      [BIA],
    )
  )[0]!;

  const first = await postLead(await signedInWithGoogle(), await leadBody(stack));

  expect(first.status).toBe(202);
  expect(await first.text()).toBe('{"status":"confirmed"}');
  const rows = await leadRows(stack, BIA);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id, source: 'google' });
  expect(rows[0]!.email_verified_at).not.toBeNull();

  // já confirmado: a linha fica idêntica
  const before = (await stack.query<{ row: string }>('select to_jsonb(l)::text as row from leads l where id = $1', [id]))[0]!.row;
  const second = await postLead(await signedInWithGoogle(), await leadBody(stack, { phone: '(11) 90000-1111' }));
  expect(second.status).toBe(202);
  expect(await second.text()).toBe('{"status":"confirmed"}');
  expect((await stack.query<{ row: string }>('select to_jsonb(l)::text as row from leads l where id = $1', [id]))[0]!.row).toBe(before);
});

test('id_token_claims_table_twelve_rows', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const seconds = now / 1000;
  const valid = { iss: 'https://accounts.google.com', aud: CLIENT_ID, exp: seconds + 3600, email: 'Bia@Gmail.com', email_verified: true, name: 'Bia Lima' };
  // as linhas do check, uma por item nomeado; o esperado está escrito à mão
  const rows: Array<[label: string, change: Record<string, unknown>, accepted: boolean]> = [
    ['iss https://accounts.google.com', { iss: 'https://accounts.google.com' }, true],
    ['iss accounts.google.com', { iss: 'accounts.google.com' }, true],
    ['iss https://evil.example', { iss: 'https://evil.example' }, false],
    ['iss vazio', { iss: '' }, false],
    ['aud igual ao cliente', { aud: CLIENT_ID }, true],
    ['aud de outro cliente', { aud: 'outro.apps.googleusercontent.com' }, false],
    ['aud lista com o cliente', { aud: ['outro.apps.googleusercontent.com', CLIENT_ID] }, true],
    ['aud lista sem o cliente', { aud: ['outro.apps.googleusercontent.com'] }, false],
    ['exp um segundo no futuro', { exp: seconds + 1 }, true],
    ['exp um segundo no passado', { exp: seconds - 1 }, false],
    ['email_verified true', { email_verified: true }, true],
    ['email_verified false', { email_verified: false }, false],
    ['email_verified ausente', { email_verified: undefined }, false],
  ];
  for (const [label, change, accepted] of rows) {
    const result = profileFromClaims({ ...valid, ...change }, CLIENT_ID, now);
    if (accepted) expect(result, label).toEqual({ name: 'Bia Lima', email: BIA });
    else expect(result, label).toBeUndefined();
  }
});

test('signed_cookie_table_six_rows', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const cookie = signCookie({ name: 'Bia Lima', email: BIA }, AUTH_SECRET, 900, now);
  const dot = cookie.lastIndexOf('.');
  const swap = (text: string, index: number) => `${text.slice(0, index)}${text[index] === 'A' ? 'B' : 'A'}${text.slice(index + 1)}`;
  const rows: Array<[label: string, value: string, secret: string, at: number, accepted: boolean]> = [
    ['assina e confere', cookie, AUTH_SECRET, now, true],
    ['um caractere trocado no valor', swap(cookie, 3), AUTH_SECRET, now, false],
    ['um caractere trocado na assinatura', swap(cookie, dot + 3), AUTH_SECRET, now, false],
    ['assinatura de outro AUTH_SECRET', cookie, 'outro-segredo-de-teste-com-32-caracteres', now, false],
    ['vencido por um segundo', cookie, AUTH_SECRET, now + 900_000 + 1000, false],
    ['um segundo antes de vencer', cookie, AUTH_SECRET, now + 900_000 - 1000, true],
  ];
  expect(rows).toHaveLength(6);
  for (const [label, value, secret, at, accepted] of rows) {
    const result = verifyCookie(value, secret, at);
    if (accepted) expect(result, label).toMatchObject({ name: 'Bia Lima', email: BIA });
    else expect(result, label).toBeUndefined();
  }
});
