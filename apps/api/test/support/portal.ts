import type { MailMessage } from '../../src/mail/mail.service.ts';
import { hashPassword } from '../../src/password.ts';
import { WEB_ORIGIN } from './app.ts';
import type { Client } from './client.ts';
import { nextIp } from './leads.ts';
import type { CapturedMail } from './mail.ts';
import { PASSWORD, type Stack } from './stack.ts';
import { cpfOf, maskCpf } from './students.ts';

let students = 0;
let emails = 0;
/** Um e-mail só deste teste. */
export const nextPortalEmail = (prefix = 'aluno') => `${prefix}${++emails}@example.com`;

export interface PortalStudent {
  id: string;
  name: string;
  cpf: string;
  email: string | null;
}

/**
 * Uma ficha adulta, `active`, sem responsável e com e-mail, inserida por SQL; as colunas dadas
 * sobrescrevem as de partida (`birth_date`, `status`, `email`...).
 */
export async function insertAdultStudent(stack: Stack, columns: Record<string, unknown> = {}): Promise<PortalStudent> {
  students += 1;
  const values: Record<string, unknown> = {
    name: `Aluna Portal ${students}`,
    cpf: cpfOf(80_000 + students),
    birth_date: '2000-01-01',
    phone: '11912345678',
    email: nextPortalEmail(),
    ...columns,
  };
  if (values.status === 'inactive' && !('inactivated_at' in values)) values.inactivated_at = new Date();
  const names = Object.keys(values);
  const [row] = await stack.query<PortalStudent>(
    `insert into students (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')})
     returning id, name, cpf, email`,
    Object.values(values),
  );
  return row!;
}

export interface StudentUser {
  id: string;
  email: string;
  password: string;
  student: PortalStudent;
}

/**
 * O usuário `student` de uma ficha, inserido por SQL com a senha em `accounts` (S0 e S1 não dependem do
 * primeiro acesso); `active` e a senha são escolhidos pelo teste.
 */
export async function insertStudentUser(
  stack: Stack,
  { password = PASSWORD, active = true, withPassword = true, student }: { password?: string; active?: boolean; withPassword?: boolean; student?: PortalStudent } = {},
): Promise<StudentUser> {
  const owner = student ?? (await insertAdultStudent(stack));
  const email = owner.email ?? nextPortalEmail('sem-ficha');
  const [user] = await stack.query<{ id: string }>(
    `insert into users (name, email, role, student_id, active) values ($1, $2, 'student', $3, $4) returning id`,
    [owner.name, email, owner.id, active],
  );
  if (withPassword) {
    await stack.query(`insert into accounts (user_id, account_id, provider_id, password) values ($1, $3, 'credential', $2)`, [
      user!.id,
      await hashPassword(password),
      user!.id,
    ]);
  }
  return { id: user!.id, email, password, student: owner };
}

/** `POST /api/portal/first-access` vindo do IP dado. */
export const postFirstAccess = (client: Client, body: unknown, ip = nextIp()) =>
  client.post('/api/portal/first-access', body, { headers: { 'X-Forwarded-For': ip } });

/** `POST /api/password-tokens/consume` vindo do IP dado. */
export const postConsume = (client: Client, body: unknown, ip = nextIp()) =>
  client.post('/api/password-tokens/consume', body, { headers: { 'X-Forwarded-For': ip } });

/** `POST /api/password-reset` vindo do IP dado. */
export const postReset = (client: Client, body: unknown, ip = nextIp()) =>
  client.post('/api/password-reset', body, { headers: { 'X-Forwarded-For': ip } });

/** O corpo do primeiro acesso de uma ficha: o CPF mascarado e o e-mail dela. */
export const firstAccessBody = (student: PortalStudent, overrides: Record<string, unknown> = {}) => ({
  cpf: maskCpf(student.cpf),
  email: student.email,
  ...overrides,
});

/** O token do link de senha de uma mensagem, e o link inteiro. */
export function passwordLink(message: MailMessage, webOrigin = WEB_ORIGIN) {
  const match = new RegExp(`${webOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/definir-senha\\?token=([A-Za-z0-9_-]+)`).exec(message.text);
  if (!match) throw new Error('mensagem sem link de senha');
  return { link: match[0], token: match[1]! };
}

/**
 * "Nada gravado" num pedido público: as linhas de `users`, `accounts` e `password_tokens` e a contagem de
 * `audit_logs`. Duas fotos iguais dizem que nada mudou; o e-mail é conferido à parte, por `captureMail()`.
 */
export async function portalRecorded(stack: Stack) {
  const text = async (table: string) =>
    (await stack.query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by 1`)).map((row) => row.row);
  return {
    users: await text('users'),
    accounts: await text('accounts'),
    tokens: await text('password_tokens'),
    audit: Number((await stack.query<{ n: string }>('select count(*) as n from audit_logs'))[0]!.n),
  };
}

/** Os tokens de um usuário, como o banco os guarda, com a validade em segundos. */
export async function tokenRows(stack: Stack, userId: string) {
  return stack.query<{
    id: string;
    purpose: string;
    token_hash: string;
    used_at: Date | null;
    validity: string;
  }>(
    `select id, purpose, token_hash, used_at, (extract(epoch from expires_at - created_at) * interval '1 second')::text as validity
       from password_tokens where user_id = $1 order by created_at, id`,
    [userId],
  );
}

/**
 * Um aluno com login pelo caminho real: primeiro acesso, link lido do e-mail capturado, senha definida e
 * sessão aberta. Devolve o navegador com a sessão.
 */
export async function portalSession(stack: Stack, mail: CapturedMail, password = 'senha-do-aluno-123') {
  const student = await insertAdultStudent(stack);
  const sent = mail.sent.length;
  const asked = await postFirstAccess(stack.client(), firstAccessBody(student));
  if (asked.status !== 202) throw new Error(`primeiro acesso de preparação: ${asked.status}`);
  const message = mail.sent.slice(sent).find((item) => item.to === student.email);
  if (!message) throw new Error('primeiro acesso de preparação sem e-mail');
  const consumed = await postConsume(stack.client(), { token: passwordLink(message).token, password });
  if (consumed.status !== 204) throw new Error(`consumo de preparação: ${consumed.status}`);
  const client = await stack.signIn({ email: student.email!, password });
  const [user] = await stack.query<{ id: string }>('select id from users where student_id = $1', [student.id]);
  return { client, student, user: { id: user!.id, email: student.email!, password } };
}
