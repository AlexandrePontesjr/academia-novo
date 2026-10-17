import { randomUUID } from 'node:crypto';
import type { Problem, Student } from '@academia/contracts';
import { expect } from 'vitest';
import type { Client } from './client.ts';
import type { Stack } from './stack.ts';

/** O dígito verificador de um CPF de 9 ou 10 dígitos de base. */
function verifier(base: string): string {
  let sum = 0;
  for (let index = 0; index < base.length; index += 1) sum += Number(base[index]) * (base.length + 1 - index);
  const rest = (sum * 10) % 11;
  return String(rest === 10 ? 0 : rest);
}

/** Um CPF válido (11 dígitos) para o aluno de número `n`: distinto para cada `n` e nunca de dígito repetido. */
export function cpfOf(n: number): string {
  const base = String(100_000_000 + n * 7_919).slice(0, 9);
  const first = base + verifier(base);
  return first + verifier(first);
}

export const maskCpf = (cpf: string) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

/** O corpo de `POST /api/students` só com os quatro campos obrigatórios. */
export function studentBody(n: number, overrides: Record<string, unknown> = {}) {
  return { name: `Aluno ${n}`, cpf: cpfOf(n), birthDate: '2000-01-01', phone: '11912345678', ...overrides };
}

/** Um corpo com os dez campos preenchidos. */
export function fullStudentBody(n: number, overrides: Record<string, unknown> = {}) {
  return studentBody(n, {
    sex: 'female',
    email: `aluno${n}@exemplo.com`,
    address: 'Rua das Acácias, 120 - Centro',
    emergencyContactName: 'Maria da Penha',
    emergencyContactPhone: '(11) 3456-7890',
    healthNotes: 'Hipertensão controlada; usa losartana pela manhã.',
    ...overrides,
  });
}

/** Cria o aluno pela API e confere o `201`. */
export async function createStudent(client: Client, body: Record<string, unknown>): Promise<Student> {
  const response = await client.post('/api/students', body);
  expect(response.status, `criação de preparação: ${JSON.stringify(body)}`).toBe(201);
  return (await response.json()) as Student;
}

/** Os `errors` de um `422`, por `path`. */
export async function fieldErrorPaths(response: Response) {
  return (((await response.json()) as Problem).errors ?? []).map((error) => error.path);
}

/** O aluno como o banco o guarda (`to_jsonb`, sem depender de nome de coluna), ou `undefined`. */
export async function studentRow(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: Record<string, unknown> }>(
    'select to_jsonb(s) as row from students s where id = $1',
    [id],
  );
  return row?.row;
}

/** O mesmo, como texto, para a comparação "linha idêntica". */
export async function studentRowText(stack: Stack, id: string) {
  const [row] = await stack.query<{ row: string }>('select to_jsonb(s)::text as row from students s where id = $1', [id]);
  return row?.row;
}

export const studentCount = async (stack: Stack) =>
  Number((await stack.query<{ n: string }>('select count(*) as n from students'))[0]!.n);

/** Muda a situação por SQL, com o instante da inativação que a door 3 da privacidade exige. */
export async function setStatus(stack: Stack, id: string, status: string) {
  await stack.query(
    `update students set status = $2, inactivated_at = case when $2 = 'inactive' then now() end where id = $1`,
    [id, status],
  );
}

/** Insere alunos direto no banco (mais rápido que pela API quando o teste só precisa deles). */
export async function insertStudents(
  stack: Stack,
  rows: Array<{ name: string; cpf: string; status?: string; phone?: string }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const row of rows) {
    const [inserted] = await stack.query<{ id: string }>(
      `insert into students (name, cpf, birth_date, phone, status, inactivated_at)
       values ($1, $2, '2000-01-01', $3, $4, case when $4 = 'inactive' then now() end) returning id`,
      [row.name, row.cpf, row.phone ?? '11912345678', row.status ?? 'active'],
    );
    ids.push(inserted!.id);
  }
  return ids;
}

/** Dispara as requisições juntas: todas esperam a mesma barreira antes de sair. */
export async function releasedTogether<T>(sends: Array<() => Promise<T>>): Promise<T[]> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const pending = sends.map(async (send) => {
    await gate;
    return send();
  });
  release();
  return Promise.all(pending);
}

export const unknownId = () => randomUUID();
