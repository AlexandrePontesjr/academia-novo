import { createHash } from 'node:crypto';
import type { Client } from './client.ts';
import type { Stack } from './stack.ts';
import { cpfOf } from './students.ts';

let ips = 0;
/** Um IP só deste teste, para a contagem do limite não vazar de um teste para outro. */
export const nextIp = () => {
  ips += 1;
  return `10.${Math.floor(ips / 250) % 250}.${ips % 250}.${7 + (ips % 3)}`;
};

let emails = 0;
/** Um e-mail só deste teste. */
export const nextEmail = (prefix = 'interessado') => `${prefix}${++emails}@example.com`;

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** A maior versão de `data_processing`: o termo vigente. */
export async function currentTermVersion(stack: Stack) {
  const [row] = await stack.query<{ version: number }>(
    `select max(version) as version from consent_terms where purpose = 'data_processing'`,
  );
  return row!.version;
}

/** Um corpo válido de `POST /api/leads`, com o termo vigente. */
export async function leadBody(stack: Stack, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ana Souza',
    email: nextEmail(),
    phone: '(11) 98765-4321',
    adult: true,
    termVersion: await currentTermVersion(stack),
    ...overrides,
  };
}

/** `POST /api/leads` vindo do IP dado. */
export const postLead = (client: Client, body: unknown, ip = nextIp(), headers: Record<string, string> = {}) =>
  client.post('/api/leads', body, { headers: { 'X-Forwarded-For': ip, ...headers } });

export const postConfirm = (client: Client, body: unknown, ip = nextIp()) =>
  client.post('/api/leads/confirm', body, { headers: { 'X-Forwarded-For': ip } });

/** A linha de interessado como o banco a guarda (`to_jsonb`). */
export async function leadRows(stack: Stack, email?: string) {
  return (
    await stack.query<{ row: Record<string, unknown> }>(
      `select to_jsonb(l) as row from leads l ${email ? 'where email = $1' : ''} order by created_at, id`,
      email ? [email] : [],
    )
  ).map((row) => row.row);
}

/** Os tokens de um interessado, como o banco os guarda. */
export async function verificationRows(stack: Stack, leadId: string) {
  return (
    await stack.query<{ row: Record<string, unknown> }>(
      'select to_jsonb(v) as row from lead_verifications v where lead_id = $1 order by created_at, id',
      [leadId],
    )
  ).map((row) => row.row);
}

/**
 * "Nada gravado": as linhas de `leads`, `lead_verifications` e `lead_throttles` e a contagem de
 * `audit_logs`. Duas fotos iguais dizem que nada mudou.
 */
export async function recorded(stack: Stack) {
  const text = async (table: string) =>
    (await stack.query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by 1`)).map((row) => row.row);
  return {
    leads: await text('leads'),
    verifications: await text('lead_verifications'),
    throttles: await text('lead_throttles'),
    audit: Number((await stack.query<{ n: string }>('select count(*) as n from audit_logs'))[0]!.n),
  };
}

/** O instante do banco, para conferir que uma coluna foi preenchida "agora". */
export async function databaseNow(stack: Stack) {
  return (await stack.query<{ now: Date }>('select now() as now'))[0]!.now;
}

/** Um interessado inserido por SQL, com o termo 1 e as colunas dadas; devolve o `id`. */
export async function insertLead(stack: Stack, columns: Record<string, unknown> = {}) {
  const values = {
    name: 'Semente',
    email: nextEmail('semente'),
    phone: '11912345678',
    source: 'form',
    consent_purpose: 'data_processing',
    consent_term_version: 1,
    ...columns,
  };
  const names = Object.keys(values);
  const [row] = await stack.query<{ id: string }>(
    `insert into leads (${names.join(', ')}) values (${names.map((_, index) => `$${index + 1}`).join(', ')}) returning id`,
    Object.values(values),
  );
  return row!.id;
}

let students = 0;
/** Um aluno inserido por SQL, para o interessado `converted` ter a quem apontar; devolve o `id`. */
export async function insertLeadStudent(stack: Stack) {
  students += 1;
  const [row] = await stack.query<{ id: string }>(
    `insert into students (name, cpf, birth_date, phone) values ('Aluno Convertido', $1, '2000-01-01', '11912345678') returning id`,
    [cpfOf(70_000 + students)],
  );
  return row!.id;
}

/** Um interessado `converted`, com o aluno que ele virou. */
export async function insertConvertedLead(stack: Stack, columns: Record<string, unknown> = {}) {
  const studentId = await insertLeadStudent(stack);
  const id = await insertLead(stack, { status: 'converted', student_id: studentId, ...columns });
  return { id, studentId };
}

/** A linha do interessado como texto (`to_jsonb`), para "linha idêntica". */
export const leadRowText = async (stack: Stack, id: string) =>
  (await stack.query<{ row: string }>('select to_jsonb(l)::text as row from leads l where id = $1', [id]))[0]?.row;

/** A linha do interessado como objeto (`to_jsonb`). */
export const leadRow = async (stack: Stack, id: string) =>
  (await stack.query<{ row: Record<string, unknown> }>('select to_jsonb(l) as row from leads l where id = $1', [id]))[0]?.row;
