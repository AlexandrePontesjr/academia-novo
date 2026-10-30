import type { Problem } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { attemptLead, attemptPortal, LEAD_LIMITS, PORTAL_LIMITS } from '../src/leads/lead-throttle.ts';
import { nextIp } from './support/leads.ts';
import { type CapturedMail, captureMail } from './support/mail.ts';
import { firstAccessBody, insertAdultStudent, insertStudentUser, nextPortalEmail, postFirstAccess, postReset } from './support/portal.ts';
import { type Stack, startStack } from './support/stack.ts';
import { cpfOf, maskCpf } from './support/students.ts';

let stack: Stack;
let mail: CapturedMail;

beforeAll(async () => {
  mail = captureMail();
  stack = await startStack([], undefined, { mail: mail.transport });
}, 180_000);

afterAll(() => stack?.close());

/** Move o primeiro instante contado da chave para `minutes` minutos atrás, pelo relógio do banco. */
const moveFirstHit = (key: string, minutes: number) =>
  stack.query(`update lead_throttles set hits[1] = now() - make_interval(mins => $2) where key = $1`, [key, minutes]);

const tokenCount = async () => (await stack.query<{ n: number }>('select count(*)::int as n from password_tokens'))[0]!.n;

let cpfs = 0;
/** Um CPF válido de aluno nenhum: o pedido conta e responde `202` sem gravar. */
const strangerCpf = () => maskCpf(cpfOf(97_000 + ++cpfs));

test('throttle_module_four_keys_bounds_and_window_edges', async () => {
  const { db } = stack.database;
  expect(PORTAL_LIMITS).toEqual({ 'access-ip': 10, 'access-cpf': 3, 'reset-ip': 10, 'reset-email': 3 });
  const portal = [
    ['access-ip', 10],
    ['access-cpf', 3],
    ['reset-ip', 10],
    ['reset-email', 3],
  ] as const;
  let keys = 0;
  const nextValue = () => `modulo-${++keys}`;

  // os dois lados do limite, nas quatro chaves
  for (const [kind, max] of portal) {
    const value = nextValue();
    for (let index = 1; index <= max; index += 1) {
      expect(await attemptPortal(db, kind, value), `${kind} ${index}`).toEqual({ allowed: true });
    }
    // o primeiro acabou de entrar: falta a hora inteira, arredondada para cima
    expect(await attemptPortal(db, kind, value), `${kind} ${max + 1}`).toEqual({ allowed: false, retryAfter: 3600 });
  }

  // a janela nas duas bordas: o mais antigo a 59:59 ainda conta, a 60:01 já não
  for (const [kind, max] of portal) {
    for (const [age, expected] of [
      ['59 minutes 59 seconds', { allowed: false, retryAfter: 1 }],
      ['59 minutes', { allowed: false, retryAfter: 60 }],
      ['60 minutes 1 second', { allowed: true }],
    ] as const) {
      const value = nextValue();
      await stack.query(
        `insert into lead_throttles (key, hits)
         values ($1, array[now() - $2::interval] || array(select now() - interval '1 minute' from generate_series(2, $3)))`,
        [`${kind}:${value}`, age, max],
      );
      expect(await attemptPortal(db, kind, value), `${kind} ${age}`).toEqual(expected);
    }
  }

  // as chaves da `pre-cadastro` seguem com os limites de antes, na mesma tabela
  expect(LEAD_LIMITS).toEqual({ ip: 5, email: 3 });
  for (const [kind, max] of [
    ['ip', 5],
    ['email', 3],
  ] as const) {
    const value = nextValue();
    for (let index = 1; index <= max; index += 1) {
      expect(await attemptLead(db, kind, value), `${kind} ${index}`).toEqual({ allowed: true });
    }
    expect(await attemptLead(db, kind, value), `${kind} ${max + 1}`).toEqual({ allowed: false, retryAfter: 3600 });
  }
});

test('first_access_fourth_cpf_and_eleventh_ip_429_and_window_edge', async () => {
  // o mesmo CPF de três IPs, e o quarto pedido de um quarto IP
  const student = await insertAdultStudent(stack);
  for (let index = 0; index < 3; index += 1) {
    expect((await postFirstAccess(stack.client(), firstAccessBody(student), nextIp())).status, `pedido ${index + 1}`).toBe(202);
  }
  await moveFirstHit(`access-cpf:${student.cpf}`, 59);
  const tokens = await tokenCount();
  const fourth = await postFirstAccess(stack.client(), firstAccessBody(student), nextIp());
  expect(fourth.status).toBe(429);
  expect(((await fourth.json()) as Problem).code).toBe('too_many_attempts');
  const retryAfter = Number(fourth.headers.get('retry-after'));
  expect(retryAfter).toBeGreaterThanOrEqual(55);
  expect(retryAfter).toBeLessThanOrEqual(60);
  expect(await tokenCount()).toBe(tokens);

  // dez CPFs do mesmo IP, e o 11º
  const ip = nextIp();
  for (let index = 0; index < 10; index += 1) {
    expect((await postFirstAccess(stack.client(), { cpf: strangerCpf(), email: 'x@example.com' }, ip)).status, `CPF ${index + 1}`).toBe(202);
  }
  const eleventh = await postFirstAccess(stack.client(), { cpf: strangerCpf(), email: 'x@example.com' }, ip);
  expect(eleventh.status).toBe(429);
  expect(((await eleventh.json()) as Problem).code).toBe('too_many_attempts');
  expect(Number(eleventh.headers.get('retry-after'))).toBeGreaterThan(0);

  // o primeiro saiu da janela: o seguinte passa
  await moveFirstHit(`access-ip:${ip}`, 61);
  expect((await postFirstAccess(stack.client(), { cpf: strangerCpf(), email: 'x@example.com' }, ip)).status).toBe(202);
});

test('portal_keys_in_lead_throttles_never_login_throttles', async () => {
  const leadKeys = () => stack.query<{ row: string }>(`select to_jsonb(t)::text as row from lead_throttles t where key like 'ip:%' or key like 'email:%' order by 1`);
  await stack.query(`insert into lead_throttles (key, hits) values ('ip:10.250.0.1', array[now()]), ('email:lead@example.com', array[now()])`);
  const leadBefore = await leadKeys();
  const loginBefore = await stack.query('select * from login_throttles');

  const student = await insertAdultStudent(stack);
  const accessIp = nextIp();
  expect((await postFirstAccess(stack.client(), firstAccessBody(student), accessIp)).status).toBe(202);
  const user = await insertStudentUser(stack);
  const resetIp = nextIp();
  for (let index = 0; index < 3; index += 1) {
    expect((await postReset(stack.client(), { email: user.email }, resetIp)).status, `redefinição ${index + 1}`).toBe(202);
  }

  const keys = (await stack.query<{ key: string }>('select key from lead_throttles')).map((row) => row.key);
  expect(keys).toContain(`access-ip:${accessIp}`);
  expect(keys).toContain(`access-cpf:${student.cpf}`);
  expect(keys).toContain(`reset-ip:${resetIp}`);
  expect(keys).toContain(`reset-email:${user.email}`);
  expect(await stack.query('select * from login_throttles')).toEqual(loginBefore);
  expect(loginBefore).toEqual([]);

  // o login do próprio aluno, logo depois das três redefinições
  const login = await stack.client().post('/api/auth/login', { email: user.email, password: user.password });
  expect(login.status).toBe(200);
  expect(await leadKeys()).toEqual(leadBefore);
});

test('reset_fourth_email_and_eleventh_ip_429_and_window_edge', async () => {
  // o mesmo e-mail de três IPs, e o quarto
  const user = await insertStudentUser(stack);
  for (let index = 0; index < 3; index += 1) {
    expect((await postReset(stack.client(), { email: user.email }, nextIp())).status, `redefinição ${index + 1}`).toBe(202);
  }
  const tokens = await tokenCount();
  const fourth = await postReset(stack.client(), { email: user.email }, nextIp());
  expect(fourth.status).toBe(429);
  expect(((await fourth.json()) as Problem).code).toBe('too_many_attempts');
  expect(Number(fourth.headers.get('retry-after'))).toBeGreaterThan(0);
  expect(await tokenCount()).toBe(tokens);

  // dez e-mails do mesmo IP, e a 11ª
  const ip = nextIp();
  for (let index = 0; index < 10; index += 1) {
    expect((await postReset(stack.client(), { email: nextPortalEmail('limite') }, ip)).status, `e-mail ${index + 1}`).toBe(202);
  }
  const eleventh = await postReset(stack.client(), { email: nextPortalEmail('limite') }, ip);
  expect(eleventh.status).toBe(429);
  expect(((await eleventh.json()) as Problem).code).toBe('too_many_attempts');

  // a primeira saiu da janela: a seguinte passa
  await moveFirstHit(`reset-ip:${ip}`, 61);
  expect((await postReset(stack.client(), { email: nextPortalEmail('limite') }, ip)).status).toBe(202);
  expect(mail.sent.length).toBeGreaterThan(0);
});
