import type { Enrollment, EnrollmentsResponse, Plan } from '@academia/contracts';
import { expect, vi } from 'vitest';
import { auditCount } from './audit.ts';
import type { Client } from './client.ts';
import type { Stack } from './stack.ts';

/** O "Mensal" de teste: um plano `monthly` de `9990` centavos. */
export function planBody(overrides: Record<string, unknown> = {}) {
  return { name: 'Mensal', period: 'monthly', priceCents: 9990, ...overrides };
}

/** Cria o plano pela API e confere o `201`. */
export async function createPlan(client: Client, body: Record<string, unknown> = planBody()): Promise<Plan> {
  const response = await client.post('/api/plans', body);
  expect(response.status, `criação de preparação: ${JSON.stringify(body)}`).toBe(201);
  return (await response.json()) as Plan;
}

/** As seis chaves de um plano, em `POST`, `PATCH` e em cada item de `GET /api/plans`. */
export const PLAN_KEYS = ['id', 'name', 'period', 'priceCents', 'rules', 'status'];

/** As chaves que nenhuma resposta de recusa pode trazer. */
export const PLAN_DATA_KEYS = ['name', 'period', 'priceCents', 'rules'];

/** O plano como o banco o guarda (`to_jsonb`, sem depender de nome de coluna), ou `undefined`. */
export async function planRow(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: Record<string, unknown> }>('select to_jsonb(p) as row from plans p where id = $1', [id]);
  return row?.row;
}

/** O mesmo, como texto, para a comparação "linha idêntica". */
export async function planRowText(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: string }>('select to_jsonb(p)::text as row from plans p where id = $1', [id]);
  return row?.row;
}

/** A linha sem o instante de atualização, que a edição muda de propósito: serve a "o resto ficou". */
export async function planRowWithoutUpdateInstant(stack: Stack, id: string) {
  const row = await planRow(stack, id);
  if (!row) return undefined;
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'updated_at'));
}

export const planCount = async (stack: Stack) =>
  Number((await stack.query<{ n: string }>('select count(*) as n from plans'))[0]!.n);

/** As linhas de matrícula de um plano como texto, para a comparação "linha idêntica". */
export async function enrollmentRowsTextOfPlan(stack: Stack, planId: string) {
  const rows = await stack.query<{ row: string }>('select to_jsonb(e)::text as row from enrollments e where plan_id = $1 order by id', [planId]);
  return rows.map((entry) => entry.row);
}

/**
 * "Nada gravado": a contagem e as linhas de `plans` e de `enrollments`, mais a contagem de
 * `audit_logs`. Duas fotografias iguais dizem que a requisição entre elas não gravou nada.
 */
export async function planSnapshot(stack: Stack) {
  const textOf = async (table: 'plans' | 'enrollments') =>
    (await stack.query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by id`)).map((entry) => entry.row);
  return { plans: await textOf('plans'), enrollments: await textOf('enrollments'), audit: await auditCount(stack) };
}

/** Insere um plano direto no banco, com `id` e situação escolhidos quando o teste precisa deles. */
export async function insertPlan(
  stack: Stack,
  row: { id?: string; name?: string; period?: string; priceCents?: number; rules?: string | null; status?: string } = {},
): Promise<string> {
  const [inserted] = await stack.query<{ id: string }>(
    `insert into plans (id, name, period, price_cents, rules, status)
     values (coalesce($1::uuid, uuidv7()), $2, $3, $4, $5, $6) returning id`,
    [row.id ?? null, row.name ?? 'Mensal', row.period ?? 'monthly', row.priceCents ?? 9990, row.rules ?? null, row.status ?? 'active'],
  );
  return inserted!.id;
}

/** Insere uma matrícula por SQL, sem passar por rota: serve a quem precisa dela antes de a rota existir. */
export async function insertEnrollment(
  stack: Stack,
  row: { studentId: string; planId: string; startsAt?: string; endsAt?: string; priceCents?: number; cancelled?: boolean },
): Promise<string> {
  const [inserted] = await stack.query<{ id: string }>(
    `insert into enrollments (student_id, plan_id, starts_at, ends_at, price_cents, cancelled_at)
     values ($1, $2, $3, $4, $5, case when $6 then now() end) returning id`,
    [row.studentId, row.planId, row.startsAt ?? '2026-10-07', row.endsAt ?? '2026-11-06', row.priceCents ?? 9990, row.cancelled ?? false],
  );
  return inserted!.id;
}

/** O relógio padrão das provas de matrícula: dia 7 de outubro de 2026 em `America/Sao_Paulo`. */
export const NOON = '2026-10-07T15:00:00Z';

/** Põe o relógio do processo (o da API, que roda aqui dentro) naquele instante: só `Date`, e ele não anda sozinho. */
export function clockAt(instant: string) {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(instant) });
}

/** O instante do banco, que não segue o relógio do teste: serve de T0 e de T1. */
export const databaseNow = async (stack: Stack) => (await stack.query<{ now: Date }>('select now() as now'))[0]!.now;

export const enrollmentsPath = (studentId: string) => `/api/students/${studentId}/enrollments`;

/** As oito chaves de uma matrícula, no `POST` e em cada item de `GET /api/students/:id/enrollments`. */
export const ENROLLMENT_KEYS = ['id', 'plan', 'startsAt', 'endsAt', 'priceCents', 'status', 'createdAt', 'cancelledAt'];

/** As chaves que nenhuma resposta de recusa pode trazer. */
export const ENROLLMENT_DATA_KEYS = ['plan', 'startsAt', 'endsAt', 'priceCents', 'cancelledAt'];

/** Matricula pela API e confere o `201`. */
export async function enroll(client: Client, studentId: string, planId: string, startsAt = '2026-10-07'): Promise<Enrollment> {
  const response = await client.post(enrollmentsPath(studentId), { planId, startsAt });
  expect(response.status, `matrícula de preparação: ${planId} a partir de ${startsAt}`).toBe(201);
  return (await response.json()) as Enrollment;
}

/** Lê as matrículas do aluno pela API e confere o `200`. */
export async function listEnrollments(client: Client, studentId: string): Promise<Enrollment[]> {
  const response = await client.get(enrollmentsPath(studentId));
  expect(response.status, 'leitura das matrículas').toBe(200);
  return ((await response.json()) as EnrollmentsResponse).items;
}

/** A matrícula como o banco a guarda (`to_jsonb`, sem depender de nome de coluna), ou `undefined`. */
export async function enrollmentRow(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: Record<string, unknown> }>('select to_jsonb(e) as row from enrollments e where id = $1', [id]);
  return row?.row;
}

/** O mesmo, como texto, para a comparação "linha idêntica". */
export async function enrollmentRowText(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: string }>('select to_jsonb(e)::text as row from enrollments e where id = $1', [id]);
  return row?.row;
}

/** As linhas de matrícula de um aluno como texto, da mais antiga à mais nova. */
export async function enrollmentRowsTextOfStudent(stack: Stack, studentId: string) {
  const rows = await stack.query<{ row: string }>('select to_jsonb(e)::text as row from enrollments e where student_id = $1 order by id', [studentId]);
  return rows.map((entry) => entry.row);
}

/** Quantos pares de linhas não canceladas do aluno têm ao menos um dia em comum: a door 5 diz zero. */
export async function overlappingPairs(stack: Stack, studentId: string) {
  const [row] = await stack.query<{ n: string }>(
    `select count(*) as n from enrollments a join enrollments b on a.student_id = b.student_id and a.id < b.id
     where a.student_id = $1 and a.cancelled_at is null and b.cancelled_at is null
       and a.starts_at <= b.ends_at and b.starts_at <= a.ends_at`,
    [studentId],
  );
  return Number(row!.n);
}
