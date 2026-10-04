import { z } from 'zod';
import { emailSchema } from './auth.ts';

export const STUDENT_STATUSES = ['active', 'inactive', 'suspended'] as const;
export const studentStatusSchema = z.enum(STUDENT_STATUSES, 'Escolha uma situação válida.');
export type StudentStatus = z.infer<typeof studentStatusSchema>;

export const STUDENT_SEXES = ['female', 'male', 'other'] as const;
const sexSchema = z.enum(STUDENT_SEXES, 'Escolha um sexo válido.');

const TIME_ZONE = 'America/Sao_Paulo';
const BIRTH_DATE_MIN = '1900-01-01';

// o Postgres não guarda U+0000 em texto, então nenhuma linha teria esse valor
const noNul = (value: string) => !value.includes('\0');

const text = (max: number, message: string, tooLong = message) =>
  z.string(message).trim().max(max, tooLong).refine(noNul, message);

const nameSchema = z
  .string('Informe o nome.')
  .trim()
  .min(1, 'Informe o nome.')
  .max(120, 'O nome deve ter no máximo 120 caracteres.')
  .refine(noNul, 'O nome contém um caractere inválido.');

/** O CPF tem 11 dígitos, não é de um dígito só repetido e fecha os dois dígitos verificadores. */
function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const verifier = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return verifier(9) === Number(digits[9]) && verifier(10) === Number(digits[10]);
}

/** Pontos e hífen saem antes da conferência; o valor que segue é só dígitos (door 1). */
const cpfSchema = z
  .string('Informe o CPF.')
  .overwrite((value) => value.replace(/[.-]/g, ''))
  .refine(isValidCpf, 'Informe um CPF válido.');

/** Espaços, parênteses e hífen saem antes da conferência: 10 ou 11 dígitos. */
const phoneSchema = z
  .string('Informe o telefone.')
  .overwrite((value) => value.replace(/[\s()-]/g, ''))
  .regex(/^\d{10,11}$/, 'Informe um telefone com DDD, de 10 ou 11 dígitos.');

/** O dia de hoje em `America/Sao_Paulo`, `aaaa-mm-dd`: o relógio do servidor pode estar em UTC. */
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );

const isRealDay = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const birthDateSchema = z
  .string('Informe a data de nascimento.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato aaaa-mm-dd.')
  .refine(isRealDay, 'Informe uma data que exista.')
  .refine((value) => value >= BIRTH_DATE_MIN, 'A data de nascimento deve ser a partir de 1900.')
  .refine((value) => value <= today(), 'A data de nascimento não pode ser no futuro.');

const addressSchema = text(200, 'Informe um endereço válido.', 'O endereço deve ter no máximo 200 caracteres.');
// sem aparar: a ficha devolve exatamente o texto enviado
const healthNotesSchema = z
  .string('Informe uma observação válida.')
  .max(2000, 'As observações devem ter no máximo 2000 caracteres.')
  .refine(noNul, 'Informe uma observação válida.');
const emergencyNameSchema = text(
  120,
  'Informe o nome do contato.',
  'O nome do contato deve ter no máximo 120 caracteres.',
);

/** Corpo de `POST /api/students`: os quatro campos da RF-05 e os demais opcionais. */
export const createStudentRequestSchema = z
  .object({
    name: nameSchema,
    cpf: cpfSchema,
    birthDate: birthDateSchema,
    phone: phoneSchema,
    sex: sexSchema.optional(),
    email: emailSchema.optional(),
    address: addressSchema.optional(),
    emergencyContactName: emergencyNameSchema.optional(),
    emergencyContactPhone: phoneSchema.optional(),
    healthNotes: healthNotesSchema.optional(),
  })
  .superRefine((body, context) => {
    // só um do par: o campo que falta é o que a tela marca
    if (body.emergencyContactName !== undefined && body.emergencyContactPhone === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['emergencyContactPhone'],
        message: 'Informe o telefone do contato de emergência.',
      });
    }
    if (body.emergencyContactPhone !== undefined && body.emergencyContactName === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['emergencyContactName'],
        message: 'Informe o nome do contato de emergência.',
      });
    }
  });
export type CreateStudentRequest = z.infer<typeof createStudentRequestSchema>;

/**
 * Corpo de `PATCH /api/students/:id`: os campos do `POST`, todos opcionais; `null` limpa um campo
 * opcional. `status` só aceita `active` e `suspended`: inativar é o `DELETE`. A regra do par de
 * contato de emergência depende do que já está gravado, então quem a aplica é o serviço.
 */
export const updateStudentRequestSchema = z.object({
  name: nameSchema.optional(),
  cpf: cpfSchema.optional(),
  birthDate: birthDateSchema.optional(),
  phone: phoneSchema.optional(),
  sex: sexSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  address: addressSchema.nullable().optional(),
  emergencyContactName: emergencyNameSchema.nullable().optional(),
  emergencyContactPhone: phoneSchema.nullable().optional(),
  healthNotes: healthNotesSchema.nullable().optional(),
  status: z.enum(['active', 'suspended'], 'Escolha Ativo ou Suspenso; para inativar, use Inativar.').optional(),
});
export type UpdateStudentRequest = z.infer<typeof updateStudentRequestSchema>;

/**
 * Um aluno como a API o devolve (door 4): o campo que o perfil não vê não existe no JSON, nunca
 * `null` nem valor mascarado; por isso todos, menos três, são opcionais. `null` é "não preenchido".
 */
export const studentSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  status: studentStatusSchema,
  cpf: z.string().optional(),
  birthDate: z.string().optional(),
  sex: sexSchema.nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().optional(),
  address: z.string().nullable().optional(),
  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
  healthNotes: z.string().nullable().optional(),
});
export type Student = z.infer<typeof studentSchema>;

/** Um item da lista: `cpf` e `phone` ausentes para quem não os vê (door 4). */
export const studentListItemSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  status: studentStatusSchema,
  cpf: z.string().optional(),
  phone: z.string().optional(),
});
export type StudentListItem = z.infer<typeof studentListItemSchema>;

export const studentsResponseSchema = z.strictObject({
  items: z.array(studentListItemSchema),
  nextCursor: z.string().nullable(),
});
export type StudentsResponse = z.infer<typeof studentsResponseSchema>;

/** O que o cursor guarda: o nome sem caixa nem acento e o id do último aluno da página. */
const cursorSchema = z.strictObject({ n: z.string(), i: z.uuid() });
export interface StudentsCursor {
  name: string;
  id: string;
}

const toBase64Url = (value: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

export const encodeStudentsCursor = ({ name, id }: StudentsCursor) => toBase64Url(JSON.stringify({ n: name, i: id }));

/** `null` quando o texto não é um cursor que `encodeStudentsCursor` emitiria. */
export function decodeStudentsCursor(value: string): StudentsCursor | null {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
    const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
    const parsed = cursorSchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    return parsed.success ? { name: parsed.data.n, id: parsed.data.i } : null;
  } catch {
    return null;
  }
}

/** Query de `GET /api/students` (AD-029): todos opcionais, e `q` e `status` se somam. */
export const studentsQuerySchema = z.object({
  /** Nome, CPF ou telefone, num campo só. */
  q: z
    .string('Informe a busca.')
    .trim()
    .min(1, 'Informe a busca.')
    .max(100, 'A busca deve ter no máximo 100 caracteres.')
    .refine(noNul, 'Informe uma busca válida.')
    .optional(),
  status: studentStatusSchema.optional(),
  /** O `nextCursor` da página anterior. */
  cursor: z
    .string('Cursor inválido.')
    .refine((value) => decodeStudentsCursor(value) !== null, 'Cursor inválido.')
    .optional(),
});
export type StudentsQuery = z.infer<typeof studentsQuerySchema>;
