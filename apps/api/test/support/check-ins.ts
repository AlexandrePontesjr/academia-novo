import type { CheckInStatus, RegisteredCheckIn, Role } from '@academia/contracts';
import { expect } from 'vitest';
import { auditCount } from './audit.ts';
import type { Client } from './client.ts';
import { clockAt } from './plans.ts';
import type { Stack } from './stack.ts';

/** Um segundo antes da virada do dia em `America/Sao_Paulo`: ainda é 7 de outubro. */
export const BEFORE_TURN = '2026-10-08T02:59:59Z';
/** A virada: já é 8 de outubro em `America/Sao_Paulo`. */
export const AFTER_TURN = '2026-10-08T03:00:00Z';

export const statusPath = (studentId: string) => `/api/students/${studentId}/check-in-status`;
export const checkInsPath = (studentId: string) => `/api/students/${studentId}/check-ins`;
export const REPORT_PATH = '/api/check-ins';

/** As sete chaves da situação. */
export const STATUS_KEYS = ['today', 'student', 'photoUrl', 'access', 'blockReasons', 'enrollment', 'checkedInAt'];
/** As três chaves do `201`. */
export const REGISTERED_KEYS = ['id', 'day', 'checkedInAt'];

/** Move o relógio da API e abre, naquele instante, a sessão que as requisições seguintes usam. */
export async function sessionAt(stack: Stack, instant: string, role: Role = 'reception') {
  clockAt(instant);
  return (await stack.session(role)).client;
}

/** Lê a situação pela API e confere o `200`. */
export async function readStatus(client: Client, studentId: string): Promise<CheckInStatus> {
  const response = await client.get(statusPath(studentId));
  expect(response.status, `situação de ${studentId}`).toBe(200);
  return (await response.json()) as CheckInStatus;
}

/** Registra a presença pela API e confere o `201`. */
export async function registerCheckIn(client: Client, studentId: string): Promise<RegisteredCheckIn> {
  const response = await client.post(checkInsPath(studentId));
  expect(response.status, `registro de preparação: ${studentId}`).toBe(201);
  return (await response.json()) as RegisteredCheckIn;
}

/**
 * Insere uma presença por SQL, sem passar pela rota: o aluno, o `day`, o instante (por padrão o do
 * banco), o autor e, quando o caso pede, o `id`.
 */
export async function insertCheckIn(
  stack: Stack,
  row: { studentId: string; day: string; checkedInBy: string; checkedInAt?: string; id?: string },
): Promise<string> {
  const [inserted] = await stack.query<{ id: string }>(
    `insert into check_ins (id, student_id, day, checked_in_at, checked_in_by)
     values (coalesce($1::uuid, uuidv7()), $2, $3, coalesce($4::timestamptz, now()), $5) returning id`,
    [row.id ?? null, row.studentId, row.day, row.checkedInAt ?? null, row.checkedInBy],
  );
  return inserted!.id;
}

/** As linhas de presença de um aluno, como texto (`to_jsonb`), na ordem do `id`. */
export async function checkInRowsOf(stack: Stack, studentId: string) {
  const rows = await stack.query<{ row: string }>('select to_jsonb(c)::text as row from check_ins c where student_id = $1 order by id', [studentId]);
  return rows.map((entry) => entry.row);
}

/** A linha de presença como o banco a guarda, ou `undefined`. */
export async function checkInRow(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: Record<string, unknown> }>('select to_jsonb(c) as row from check_ins c where id = $1', [id]);
  return row?.row;
}

/**
 * "Nada gravado": a contagem e as linhas de `check_ins`, mais a contagem de `audit_logs`. Duas
 * fotografias iguais dizem que a requisição entre elas não gravou nada.
 */
export async function checkInSnapshot(stack: Stack) {
  const rows = (await stack.query<{ row: string }>('select to_jsonb(c)::text as row from check_ins c order by id')).map((entry) => entry.row);
  return { count: rows.length, checkIns: rows, audit: await auditCount(stack) };
}
