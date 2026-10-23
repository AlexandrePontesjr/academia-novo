import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { attemptLead, LEAD_LIMITS } from '../src/leads/lead-throttle.ts';
import { leadBody, leadRows, nextEmail, nextIp, postLead } from './support/leads.ts';
import { captureMail } from './support/mail.ts';
import { problem, type Stack, startStack } from './support/stack.ts';
import { releasedTogether } from './support/students.ts';

let stack: Stack;
const mail = captureMail();

beforeAll(async () => {
  stack = await startStack([], undefined, { mail: mail.transport });
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

afterEach(() => {
  mail.clear();
});

const leadCount = async () => Number((await stack.query<{ n: string }>('select count(*) as n from leads'))[0]!.n);

/** Põe o envio mais antigo da chave `minutes` minutos no passado, pelo relógio do banco. */
const ageFirstHit = (key: string, interval: string) =>
  stack.query(`update lead_throttles set hits[1] = now() - $2::interval where key = $1`, [key, interval]);

async function expect429(response: Response, label: string) {
  expect(response.status, label).toBe(429);
  expect((await problem(response)).code, label).toBe('too_many_attempts');
  const retryAfter = response.headers.get('Retry-After');
  expect(retryAfter, label).toMatch(/^\d+$/);
  return Number(retryAfter);
}

test('sixth_from_same_ip_429_with_retry_after_and_window_edge', async () => {
  const client = stack.client();
  const ip = nextIp();
  for (let index = 1; index <= 5; index += 1) {
    const response = await postLead(client, await leadBody(stack), ip);
    expect(response.status, `envio ${index}`).toBe(202);
  }

  await ageFirstHit(`ip:${ip}`, '59 minutes');
  const before = await leadCount();
  mail.clear();
  const sixth = await postLead(client, await leadBody(stack), ip);
  const retryAfter = await expect429(sixth, 'sexto');
  expect(retryAfter).toBeGreaterThanOrEqual(55);
  expect(retryAfter).toBeLessThanOrEqual(60);
  expect(await leadCount()).toBe(before);
  expect(mail.sent).toEqual([]);

  await ageFirstHit(`ip:${ip}`, '61 minutes');
  const afterWindow = await postLead(client, await leadBody(stack), ip);
  expect(afterWindow.status).toBe(202);
  expect(await leadCount()).toBe(before + 1);
});

test('fourth_for_same_email_any_ip_429', async () => {
  const client = stack.client();
  const email = nextEmail();
  for (let index = 1; index <= 3; index += 1) {
    const response = await postLead(client, await leadBody(stack, { email, name: `Nome ${index}` }));
    expect(response.status, `envio ${index}`).toBe(202);
  }
  const [row] = await leadRows(stack, email);
  mail.clear();

  const fourth = await postLead(client, await leadBody(stack, { email, name: 'Nome 4' }));

  await expect429(fourth, 'quarto');
  expect(await leadRows(stack, email)).toEqual([row]);
  expect(mail.sent).toEqual([]);
});

test('six_concurrent_same_ip_at_most_five_accepted', async () => {
  const ip = nextIp();
  const bodies = await Promise.all(Array.from({ length: 6 }, () => leadBody(stack)));
  const before = await leadCount();

  const responses = await releasedTogether(bodies.map((body) => () => postLead(stack.client(), body, ip)));

  const accepted = responses.filter((response) => response.status === 202).length;
  expect(accepted).toBeLessThanOrEqual(5);
  expect(responses.every((response) => [202, 429].includes(response.status))).toBe(true);
  expect(await leadCount()).toBe(before + accepted);
});

test('lead_attempts_never_touch_login_throttles', async () => {
  const admin = await stack.seed({ role: 'admin' });
  const ip = nextIp();
  for (let index = 1; index <= 3; index += 1) {
    const response = await postLead(stack.client(), await leadBody(stack, { email: admin.email }), ip);
    expect(response.status, `envio ${index}`).toBe(202);
  }

  expect(await stack.query('select email from login_throttles where email = $1', [admin.email.toLowerCase()])).toEqual([]);
  await stack.signIn(admin);
  const keys = (await stack.query<{ key: string }>('select key from lead_throttles where key = any ($1) order by key', [[`email:${admin.email}`, `ip:${ip}`]])).map(
    (row) => row.key,
  );
  expect(keys).toEqual([`email:${admin.email}`, `ip:${ip}`]);
});

test('throttle_module_bounds_and_window_edges', async () => {
  const { db } = stack.database;
  expect(LEAD_LIMITS).toEqual({ ip: 5, email: 3 });

  // os dois lados do limite, nas duas chaves
  for (const [kind, max] of [
    ['ip', 5],
    ['email', 3],
  ] as const) {
    const value = kind === 'ip' ? nextIp() : nextEmail();
    for (let index = 1; index <= max; index += 1) {
      expect(await attemptLead(db, kind, value), `${kind} ${index}`).toEqual({ allowed: true });
    }
    const refused = await attemptLead(db, kind, value);
    expect(refused.allowed, `${kind} ${max + 1}`).toBe(false);
    // o primeiro acabou de entrar: falta a hora inteira, arredondada para cima
    expect(refused.allowed === false && refused.retryAfter, `${kind} ${max + 1}`).toBe(3600);
  }

  // a janela nas duas bordas: o mais antigo a 59:59 ainda conta, a 60:01 já não
  for (const [kind, max] of [
    ['ip', 5],
    ['email', 3],
  ] as const) {
    for (const [age, counted, retryAfter] of [
      ['59 minutes 59 seconds', true, 1],
      ['60 minutes 1 second', false, undefined],
      ['59 minutes', true, 60],
    ] as const) {
      const value = kind === 'ip' ? nextIp() : nextEmail();
      // `max` envios na janela, o mais antigo na idade do caso
      await stack.query(
        `insert into lead_throttles (key, hits)
         values ($1, array[now() - $2::interval] || array(select now() - interval '1 minute' from generate_series(2, $3)))`,
        [`${kind}:${value}`, age, max],
      );
      const result = await attemptLead(db, kind, value);
      if (counted) expect(result, `${kind} ${age}`).toEqual({ allowed: false, retryAfter });
      else expect(result, `${kind} ${age}`).toEqual({ allowed: true });
    }
  }
});
