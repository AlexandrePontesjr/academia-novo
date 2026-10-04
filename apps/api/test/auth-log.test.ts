import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { AUTH_SECRET, startApi } from './support/app.ts';
import { createClient } from './support/client.ts';
import { refusingDatabaseUrl } from './support/servers.ts';
import { type Stack, startStack } from './support/stack.ts';
import { totpCode } from './support/totp.ts';

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => stack?.close());

/** Tudo o que o processo escreve em stdout e stderr a partir daqui. */
function captureOutput() {
  const chunks: string[] = [];
  const capture = (chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  // o Vitest intercepta o `console` antes de ele chegar a stdout/stderr: capturado à parte
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      chunks.push(`${args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' ')}\n`);
    });
  }
  return {
    text: () => chunks.join(''),
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as Record<string, unknown>];
          } catch {
            return [];
          }
        }),
  };
}

/** A linha `request` é escrita quando a resposta termina, logo depois de o cliente recebê-la. */
async function settled(output: ReturnType<typeof captureOutput>, requestId: string) {
  await vi.waitFor(() =>
    expect(output.lines().some((line) => line.msg === 'request' && line.requestId === requestId)).toBe(true),
  );
}

test('login_outcomes_log_one_line_each', async () => {
  const user = await stack.seed();
  const blocked = await stack.seed();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await stack.client().post('/api/auth/login', { email: blocked.email, password: 'senha-errada-000' });
  }
  const cases = [
    { credentials: { email: user.email, password: user.password }, status: 200, msg: 'auth.login_succeeded', userId: user.id },
    { credentials: { email: user.email, password: 'senha-errada-000' }, status: 401, msg: 'auth.login_failed', userId: user.id },
    { credentials: { email: 'ninguem@exemplo.com', password: 'senha-errada-000' }, status: 401, msg: 'auth.login_failed', userId: undefined },
    { credentials: { email: blocked.email, password: blocked.password }, status: 429, msg: 'auth.login_blocked', userId: blocked.id },
  ];

  for (const { credentials, status, msg, userId } of cases) {
    const output = captureOutput();
    const response = await stack.client().post('/api/auth/login', credentials);
    const requestId = response.headers.get('x-request-id') ?? '';
    await settled(output, requestId);
    vi.restoreAllMocks();

    expect(response.status, msg).toBe(status);
    expect(requestId).toMatch(/\S/);
    const authLines = output.lines().filter((line) => String(line.msg).startsWith('auth.'));
    expect(authLines, msg).toHaveLength(1);
    expect(authLines[0], msg).toMatchObject({ msg, requestId });
    if (userId) expect(authLines[0]!.userId, msg).toBe(userId);
    else expect(authLines[0], msg).not.toHaveProperty('userId');
  }
});

test('six_secrets_never_reach_the_log', async () => {
  const email = 'segredo.no.log@exemplo.com';
  const password = 'senha-secreta-do-log-1';
  const wrongPassword = 'senha-errada-do-log-2';
  const newPassword = 'senha-nova-do-log-3';
  const user = await stack.seed({ email, password });
  const { totpUri, backupCodes } = await stack.enrollTwoFactor(await stack.signIn(user), password);
  const backupCode = backupCodes[0]!;
  const output = captureOutput();
  const secrets: Record<string, string> = { password, wrongPassword, newPassword, backupCode, AUTH_SECRET, email };
  let lastRequestId = '';
  const done = async (response: Response, expected: number) => {
    expect(response.status).toBe(expected);
    lastRequestId = response.headers.get('x-request-id') ?? '';
    return response;
  };

  // login com falha
  await done(await stack.client().post('/api/auth/login', { email, password: wrongPassword }), 401);

  // login autenticado em dois passos, com verificação por TOTP
  const byTotp = stack.client();
  await done(await byTotp.post('/api/auth/login', { email, password }), 200);
  const code = totpCode(totpUri);
  secrets.totpCode = code;
  await done(await byTotp.post('/api/auth/two-factor/verify', { code }), 200);
  for (const [name, value] of byTotp.jar) {
    if (name.includes('session_token')) {
      secrets.sessionCookie = value;
      secrets.sessionToken = decodeURIComponent(value).split('.')[0]!;
    }
  }
  expect(secrets.sessionCookie).toMatch(/\S/);

  // verificação por código de recuperação
  const byBackupCode = stack.client();
  await done(await byBackupCode.post('/api/auth/login', { email, password }), 200);
  await done(await byBackupCode.post('/api/auth/two-factor/verify', { backupCode }), 200);

  // troca de senha
  await done(await byTotp.put('/api/auth/password', { currentPassword: password, newPassword }), 204);

  await settled(output, lastRequestId);
  vi.restoreAllMocks();

  const written = output.text();
  expect(output.lines().filter((line) => String(line.msg).startsWith('auth.')).length).toBeGreaterThanOrEqual(3);
  for (const [name, value] of Object.entries(secrets)) {
    expect(value, name).toMatch(/\S/);
    expect(written.includes(value), `${name} no log`).toBe(false);
  }
});

test('query_failures_log_no_parameters', async () => {
  // uma sessão de verdade, assinada com o mesmo AUTH_SECRET, levada a uma API cujo banco recusa conexão
  const user = await stack.seed();
  const session = await stack.signIn(user);
  const cookie = session.cookie();
  const token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)).split('.')[0]!;
  const email = 'digitado.com.banco.fora@exemplo.com';
  const password = 'senha-com-banco-fora-9';
  const down = await startApi(await refusingDatabaseUrl());
  const output = captureOutput();

  try {
    const login = await createClient(down.url).post('/api/auth/login', { email, password });
    const users = await createClient(down.url).get('/api/users', { headers: { Cookie: cookie } });
    await settled(output, users.headers.get('x-request-id') ?? '');
    vi.restoreAllMocks();

    expect(login.status).toBe(500);
    expect(users.status).toBe(500);
  } finally {
    vi.restoreAllMocks();
    await down.close();
  }

  // as duas falhas foram registradas, com a consulta que falhou e sem os parâmetros dela
  const written = output.text();
  expect(written).toMatch(/Failed query: select [^\n]*users/);
  expect(written).toMatch(/Failed query: select [^\n]*sessions/);
  expect(token.length).toBeGreaterThanOrEqual(20);
  for (const [name, value] of Object.entries({ email, password, token, cookie, AUTH_SECRET })) {
    expect(written.includes(value), `${name} no log`).toBe(false);
  }
  // e tudo o que o processo escreveu é JSON, uma linha por registro
  for (const line of written.split('\n').filter(Boolean)) {
    expect(() => JSON.parse(line), line.slice(0, 80)).not.toThrow();
  }
});
