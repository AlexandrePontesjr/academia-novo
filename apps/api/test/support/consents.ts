import { saoPauloToday, type Student } from '@academia/contracts';
import type { Client } from './client.ts';
import type { Stack } from './stack.ts';
import { cpfOf, createStudent, studentBody } from './students.ts';

/** O responsável que as provas usam quando não nomeiam outro valor. */
export const GUARDIAN = {
  name: 'Ana Souza',
  cpf: '529.982.247-25',
  phone: '(11) 91234-5678',
  relationship: 'mother',
};

export const guardianBody = (overrides: Record<string, unknown> = {}) => ({ ...GUARDIAN, ...overrides });

/** `aaaa-mm-dd` de hoje em `America/Sao_Paulo` menos `years` anos, pelo relógio do teste. */
export function birthDateYearsAgo(years: number, today = saoPauloToday()) {
  const [year, month, day] = today.split('-') as [string, string, string];
  // 29/02 de hoje não existe `years` anos atrás, a não ser em ano bissexto: cai em 28/02
  const target = Number(year) - years;
  const leap = (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0;
  return `${target}-${month}-${month === '02' && day === '29' && !leap ? '28' : day}`;
}

/** O aluno de dez anos, nascido a partir do relógio que o teste controla. */
export const minorBirthDate = () => birthDateYearsAgo(10);
export const ADULT_BIRTH_DATE = '2000-01-01';

/** Cria pela API um menor com o responsável do `GUARDIAN` (ou o dado) e confere o `201`. */
export async function createMinorWithGuardian(client: Client, n: number, guardian: Record<string, unknown> = GUARDIAN) {
  return createStudent(client, studentBody(n, { birthDate: minorBirthDate(), guardian }));
}

/** Um aluno adulto, sem responsável. */
export async function createAdult(client: Client, n: number, overrides: Record<string, unknown> = {}) {
  return createStudent(client, studentBody(n, { birthDate: ADULT_BIRTH_DATE, ...overrides }));
}

/** O menor "legado", sem responsável: só existe por `INSERT` direto, a API o recusa. */
export async function insertLegacyMinor(stack: Stack, n: number, birthDate = minorBirthDate()) {
  const [row] = await stack.query<{ id: string }>(
    `insert into students (name, cpf, birth_date, phone) values ($1, $2, $3, '11912345678') returning id`,
    [`Menor legado ${n}`, cpfOf(n), birthDate],
  );
  return row!.id;
}

/** As linhas de responsável do aluno, como o banco as guarda (`to_jsonb`, em texto), da mais antiga à mais nova. */
export async function guardianRows(stack: Stack, studentId: string) {
  return (
    await stack.query<{ row: string }>(
      'select to_jsonb(g)::text as row from guardians g where student_id = $1 order by id',
      [studentId],
    )
  ).map((entry) => entry.row);
}

export async function allGuardianRows(stack: Stack) {
  return (await stack.query<{ row: string }>('select to_jsonb(g)::text as row from guardians g order by id')).map(
    (entry) => entry.row,
  );
}

export const guardianCount = async (stack: Stack) =>
  Number((await stack.query<{ n: string }>('select count(*) as n from guardians'))[0]!.n);

export const consentCount = async (stack: Stack) =>
  Number((await stack.query<{ n: string }>('select count(*) as n from consents'))[0]!.n);

/** As linhas de consentimento do aluno, em texto, da mais antiga à mais nova. */
export async function consentRows(stack: Stack, studentId: string) {
  return (
    await stack.query<{ row: string }>(
      'select to_jsonb(c)::text as row from consents c where student_id = $1 order by id',
      [studentId],
    )
  ).map((entry) => entry.row);
}

export async function allConsentRows(stack: Stack) {
  return (await stack.query<{ row: string }>('select to_jsonb(c)::text as row from consents c order by id')).map(
    (entry) => entry.row,
  );
}

/** O texto de um termo, lido do banco: o texto jurídico ainda vai mudar, o teste nunca o escreve. */
export async function termText(stack: Stack, purpose: string, version: number) {
  const [row] = await stack.query<{ text: string }>('select text from consent_terms where purpose = $1 and version = $2', [
    purpose,
    version,
  ]);
  return row!.text;
}

/** Publica uma versão de termo, como a migração que a publicaria. Nada a desfaz: só em banco do próprio teste. */
export async function insertTerm(stack: Stack, purpose: string, version: number, text = `Termo ${purpose} v${version}`) {
  await stack.query('insert into consent_terms (purpose, version, text) values ($1, $2, $3)', [purpose, version, text]);
}

/** Um consentimento por `INSERT`, com `granted_at` e `revoked_at` à escolha. */
export async function insertConsent(
  stack: Stack,
  fields: {
    studentId: string;
    purpose?: string;
    termVersion?: number;
    grantedBy?: string;
    guardianId?: string | null;
    grantedAt?: string;
    revokedAt?: string | null;
  },
) {
  const {
    studentId,
    purpose = 'data_processing',
    termVersion = 1,
    grantedBy = 'student',
    guardianId = null,
    grantedAt = new Date().toISOString(),
    revokedAt = null,
  } = fields;
  const [row] = await stack.query<{ id: string }>(
    `insert into consents (student_id, purpose, term_version, granted_by, guardian_id, granted_at, revoked_at)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [studentId, purpose, termVersion, grantedBy, guardianId, grantedAt, revokedAt],
  );
  return row!.id;
}

/** O id do responsável atual do aluno: a linha de maior `id`. */
export async function currentGuardianId(stack: Stack, studentId: string) {
  const [row] = await stack.query<{ id: string }>('select id from guardians where student_id = $1 order by id desc limit 1', [
    studentId,
  ]);
  return row?.id;
}

export type { Student };
