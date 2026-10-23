import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { startApi, WEB_ORIGIN } from './support/app.ts';
import { createClient } from './support/client.ts';
import { leadBody, leadRows, nextEmail, postLead } from './support/leads.ts';
import { captureOutput } from './support/log.ts';
import { type Stack, startStack } from './support/stack.ts';

let stack: Stack;

beforeAll(async () => {
  // sem transporte de captura: o que o ambiente sem `SMTP_HOST` escolhe
  stack = await startStack();
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('log_transport_without_smtp_prints_link_only_outside_production', async () => {
  const client = stack.client();
  for (const nodeEnv of ['test', 'production']) {
    vi.stubEnv('NODE_ENV', nodeEnv);
    const email = nextEmail(nodeEnv);
    const output = captureOutput();

    const response = await postLead(client, await leadBody(stack, { email }));

    expect(response.status, nodeEnv).toBe(202);
    expect(await response.text(), nodeEnv).toBe('{"status":"pending"}');
    expect(await leadRows(stack, email), nodeEnv).toEqual([expect.objectContaining({ status: 'new', source: 'form', email_verified_at: null })]);
    await vi.waitFor(() => expect(output.text()).toContain('e-mail não enviado: SMTP não configurado'));
    const lines = output.text().split('\n');
    if (nodeEnv === 'production') {
      expect(lines.filter((line) => line.includes('token='))).toEqual([]);
    } else {
      expect(output.text()).toMatch(new RegExp(`${WEB_ORIGIN}/matricula/confirmar\\?token=[A-Za-z0-9_-]{43}`));
    }
    vi.restoreAllMocks();
  }
});

/** O que o servidor SMTP em processo recebeu de cada mensagem. */
interface Received {
  user: string | undefined;
  password: string | undefined;
  from: string;
  to: string[];
  data: string;
}

/** As palavras codificadas de um cabeçalho (RFC 2047), em texto. */
function decodeHeader(value: string) {
  return value.replace(/=\?utf-8\?([bq])\?([^?]*)\?=\s*/gi, (_, kind: string, text: string) =>
    kind.toLowerCase() === 'b'
      ? Buffer.from(text, 'base64').toString('utf8')
      : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8'),
  );
}

const subjectOf = (data: string) => {
  const match = /^Subject: (.*(?:\r\n[ \t].*)*)/m.exec(data);
  return match ? decodeHeader(match[1]!.replace(/\r\n[ \t]/g, ' ')) : undefined;
};

test('smtp_transport_delivers_with_and_without_auth', async () => {
  const received: Received[] = [];
  const server = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    authOptional: true,
    logger: false,
    onAuth(auth, session, callback) {
      session.user = `${auth.username}:${auth.password}`;
      callback(null, { user: `${auth.username}:${auth.password}` });
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const [user, password] = typeof session.user === 'string' ? session.user.split(':') : [undefined, undefined];
        received.push({
          user,
          password,
          from: session.envelope.mailFrom === false ? '' : session.envelope.mailFrom.address,
          to: session.envelope.rcptTo.map((rcpt) => rcpt.address),
          data: Buffer.concat(chunks).toString('utf8'),
        });
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.server.address() as AddressInfo;
  const smtp = {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(port),
    SMTP_SECURE: 'false',
    MAIL_FROM: 'Academia <no-reply@academia.test>',
  };
  const withAuth = await startApi(stack.postgres.url, [], undefined, { ...smtp, SMTP_USER: 'usuario-smtp', SMTP_PASS: 'senha-smtp' });
  const withoutAuth = await startApi(stack.postgres.url, [], undefined, smtp);
  try {
    for (const [label, api, auth] of [
      ['com AUTH', withAuth, { user: 'usuario-smtp', password: 'senha-smtp' }],
      ['sem AUTH', withoutAuth, { user: undefined, password: undefined }],
    ] as const) {
      const email = nextEmail('smtp');
      const response = await postLead(createClient(api.url), await leadBody(stack, { email }));
      expect(response.status, label).toBe(202);

      await vi.waitFor(() => expect(received.some((message) => message.to.includes(email))).toBe(true), { timeout: 10_000 });
      const message = received.find((item) => item.to.includes(email))!;
      expect({ user: message.user, password: message.password }, label).toEqual(auth);
      expect(message.from, label).toBe('no-reply@academia.test');
      expect(message.to, label).toEqual([email]);
      expect(subjectOf(message.data), label).toBe('Confirme seu pré-cadastro');
    }
  } finally {
    await withAuth.close();
    await withoutAuth.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
