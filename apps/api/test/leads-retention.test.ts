import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { startApi } from './support/app.ts';
import { written } from './support/audit.ts';
import { insertConvertedLead, insertLead, leadRowText, sha256 } from './support/leads.ts';
import { captureOutput } from './support/log.ts';
import { type Stack, startStack } from './support/stack.ts';
import { studentRowText } from './support/students.ts';

let stack: Stack;
const HOUR = 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Um interessado com a idade dada, posta por SQL em `created_at` a partir do relógio do banco. */
async function aged(age: string, columns: Record<string, unknown> = {}) {
  const id = await insertLead(stack, columns);
  await stack.query(`update leads set created_at = now() - $2::interval where id = $1`, [id, age]);
  return id;
}

let tokens = 0;
/** Um token do interessado, para provar a cascata. */
async function tokenOf(leadId: string) {
  tokens += 1;
  await stack.query(
    `insert into lead_verifications (lead_id, token_hash, expires_at) values ($1, $2, now() + interval '24 hours')`,
    [leadId, sha256(`token-${tokens}-${leadId}`)],
  );
}

const exists = async (id: string) => (await leadRowText(stack, id)) !== undefined;
const tokenCount = async (leadId: string) =>
  Number((await stack.query<{ n: string }>('select count(*) as n from lead_verifications where lead_id = $1', [leadId]))[0]!.n);

async function until(check: () => Promise<boolean> | boolean, name: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(`não aconteceu em ${timeoutMs} ms: ${name}`);
}

test('purge_six_ages_deletes_four_keeps_two_and_audits_each', async () => {
  const verified = { email_verified_at: '2026-01-01T00:00:00Z' };
  const unconfirmedOld = await aged('7 days 1 minute');
  const unconfirmedYoung = await aged('6 days 23 hours');
  const confirmedYoung = await aged('89 days', verified);
  const confirmedOld = await aged('90 days 1 minute', verified);
  const converted = await insertConvertedLead(stack, verified);
  await stack.query(`update leads set created_at = now() - interval '90 days 1 minute' where id = $1`, [converted.id]);
  const discarded = await aged('8 days', { status: 'discarded' });

  const all = [unconfirmedOld, unconfirmedYoung, confirmedYoung, confirmedOld, converted.id, discarded];
  for (const id of all) await tokenOf(id);
  const kept = { [unconfirmedYoung]: await leadRowText(stack, unconfirmedYoung), [confirmedYoung]: await leadRowText(stack, confirmedYoung) };
  const student = await studentRowText(stack, converted.studentId);

  const { rows } = await written(stack, () => stack.api.leadRetention());

  const deleted = [unconfirmedOld, confirmedOld, converted.id, discarded];
  for (const id of deleted) {
    expect(await exists(id), id).toBe(false);
    expect(await tokenCount(id), id).toBe(0);
  }
  for (const id of [unconfirmedYoung, confirmedYoung]) {
    expect(await leadRowText(stack, id), id).toBe(kept[id]);
    expect(await tokenCount(id), id).toBe(1);
  }
  expect(await studentRowText(stack, converted.studentId)).toBe(student);

  expect(rows).toHaveLength(4);
  expect(rows.map((row) => row.entity_id).sort()).toEqual([...deleted].sort());
  for (const row of rows) {
    expect(row).toMatchObject({ action: 'lead.purged', entity: 'lead', user_id: null, ip: null, user_agent: null, diff: null });
  }
});

test('timer_runs_at_boot_every_sixty_minutes_and_survives_failure', async () => {
  // na subida: uma API nova apaga o vencido sem nenhuma requisição
  const atBoot = await aged('8 days');
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const api = await startApi(stack.postgres.url);
  const output = captureOutput();
  try {
    await until(async () => !(await exists(atBoot)), 'o vencido sair na subida');

    const second = await aged('8 days');
    vi.advanceTimersByTime(59 * 60 * 1000);
    await sleep(1500);
    expect(await exists(second), '59 minutos').toBe(true);
    vi.advanceTimersByTime(60 * 1000);
    await until(async () => !(await exists(second)), 'o segundo vencido sair aos 60 minutos');

    // um ciclo com o banco recusando a instrução vira uma linha de log, e o seguinte roda
    const third = await aged('8 days');
    await stack.query('alter table leads rename to leads_hidden');
    try {
      vi.advanceTimersByTime(HOUR);
      await until(() => output.text().includes('lead retention failed'), 'o ciclo com a tabela fora falhar');
    } finally {
      await stack.query('alter table leads_hidden rename to leads');
    }
    expect(await exists(third)).toBe(true);
    const failures = output.text().split('\n').filter((line) => line.includes('lead retention failed'));
    expect(failures).toHaveLength(1);
    expect(JSON.parse(failures[0]!)).toMatchObject({ level: 'error', msg: 'lead retention failed' });
    expect(failures[0]).not.toContain(third);

    vi.advanceTimersByTime(HOUR);
    await until(async () => !(await exists(third)), 'o terceiro vencido sair no ciclo seguinte ao que falhou');
  } finally {
    await api.close();
  }
}, 120_000);
