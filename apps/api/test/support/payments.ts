import type { RegisteredPayment } from '@academia/contracts';
import { expect } from 'vitest';
import { auditCount } from './audit.ts';
import type { Client } from './client.ts';
import type { Stack } from './stack.ts';

export const paymentsPath = (studentId: string) => `/api/students/${studentId}/payments`;

/** As três chaves de um pagamento no `POST` (`PAYMENT_KEYS`). */
export const PAYMENT_KEYS = ['id', 'enrollmentId', 'createdAt'];

/** As chaves que nenhuma resposta de recusa de pagamento pode trazer. */
export const PAYMENT_DATA_KEYS = ['items', 'enrollmentId', 'payment', 'student', 'plan', 'priceCents'];

/** O corpo do `POST`: confirmar é nomear o período, nada mais. */
export function paymentBody(enrollmentId: string) {
  return { enrollmentId };
}

/** Confirma o pagamento pela API e confere o `201`. */
export async function registerPayment(client: Client, studentId: string, enrollmentId: string): Promise<RegisteredPayment> {
  const response = await client.post(paymentsPath(studentId), paymentBody(enrollmentId));
  expect(response.status, `confirmação de preparação: ${enrollmentId}`).toBe(201);
  return (await response.json()) as RegisteredPayment;
}

/** Insere um pagamento por SQL, sem passar por rota: serve a quem precisa dele já desfeito ou posto fora da regra. */
export async function insertPayment(stack: Stack, row: { enrollmentId: string; voided?: boolean }): Promise<string> {
  const [inserted] = await stack.query<{ id: string }>(
    `insert into payments (enrollment_id, voided_at) values ($1, case when $2 then now() end) returning id`,
    [row.enrollmentId, row.voided ?? false],
  );
  return inserted!.id;
}

/** O pagamento como o banco o guarda (`to_jsonb`, sem depender de nome de coluna), ou `undefined`. */
export async function paymentRow(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: Record<string, unknown> }>('select to_jsonb(p) as row from payments p where id = $1', [id]);
  return row?.row;
}

/** O mesmo, como texto, para a comparação "linha idêntica". */
export async function paymentRowText(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: string }>('select to_jsonb(p)::text as row from payments p where id = $1', [id]);
  return row?.row;
}

/** A linha sem `voided_at`, a única coluna que o desfazimento muda. */
export async function paymentRowWithoutVoidedAt(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: string }>(`select (to_jsonb(p) - 'voided_at')::text as row from payments p where id = $1`, [id]);
  return row?.row;
}

/** As linhas de pagamento de um período como texto, ordenadas por `id`. */
export async function paymentRowsTextOf(stack: Stack, enrollmentId: string) {
  const rows = await stack.query<{ row: string }>('select to_jsonb(p)::text as row from payments p where enrollment_id = $1 order by id', [enrollmentId]);
  return rows.map((entry) => entry.row);
}

export const paymentCount = async (stack: Stack) =>
  Number((await stack.query<{ n: string }>('select count(*) as n from payments'))[0]!.n);

/** Quantas confirmações vivas (`voided_at` nulo) o período tem. */
export async function aliveCountOf(stack: Stack, enrollmentId: string) {
  const [row] = await stack.query<{ n: string }>('select count(*) as n from payments where enrollment_id = $1 and voided_at is null', [enrollmentId]);
  return Number(row!.n);
}

/**
 * "Nada gravado": a contagem e as linhas de `payments` e de `enrollments`, mais a contagem de
 * `audit_logs`. Duas fotografias iguais dizem que a requisição entre elas não gravou nada.
 */
export async function paymentSnapshot(stack: Stack) {
  const textOf = async (table: 'payments' | 'enrollments') =>
    (await stack.query<{ row: string }>(`select to_jsonb(t)::text as row from ${table} t order by id`)).map((entry) => entry.row);
  return { payments: await textOf('payments'), enrollments: await textOf('enrollments'), audit: await auditCount(stack) };
}
