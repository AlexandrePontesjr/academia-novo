import { z } from 'zod';
import { emailSchema, roleSchema } from './auth.ts';
import { cpfSchema, isRealDay, nameSchema, noNul, phoneSchema, today } from './person.ts';

/** Só dois valores: `suspended` é de aluno (funcionarios, door 1). */
export const STAFF_STATUSES = ['active', 'inactive'] as const;
export const staffStatusSchema = z.enum(STAFF_STATUSES, 'Escolha uma situação válida.');
export type StaffStatus = z.infer<typeof staffStatusSchema>;

const HIRED_AT_MIN = '1900-01-01';

const positionSchema = z
  .string('Informe o cargo.')
  .trim()
  .min(1, 'Informe o cargo.')
  .max(80, 'O cargo deve ter no máximo 80 caracteres.')
  .refine(noNul, 'O cargo contém um caractere inválido.');

const departmentSchema = z
  .string('Informe um setor válido.')
  .trim()
  .min(1, 'Informe um setor válido.')
  .max(80, 'O setor deve ter no máximo 80 caracteres.')
  .refine(noNul, 'O setor contém um caractere inválido.');

/** O dia da admissão: existe, é de 1900 em diante e não é depois de hoje em `America/Sao_Paulo`. */
const hiredAtSchema = z
  .string('Informe a data de admissão.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data no formato aaaa-mm-dd.')
  .refine(isRealDay, 'Informe uma data que exista.')
  .refine((value) => value >= HIRED_AT_MIN, 'A data de admissão deve ser a partir de 1900.')
  .refine((value) => value <= today(), 'A data de admissão não pode ser no futuro.');

/** Corpo de `POST /api/staff`: os cinco campos da RF-09 e os dois opcionais. */
export const createStaffRequestSchema = z.object({
  name: nameSchema,
  cpf: cpfSchema,
  position: positionSchema,
  hiredAt: hiredAtSchema,
  phone: phoneSchema,
  department: departmentSchema.optional(),
  email: emailSchema.optional(),
});
export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>;

/**
 * Corpo de `PATCH /api/staff/:id`: os campos do `POST`, todos opcionais; `null` limpa `department` e
 * `email`. `status` só aceita `active` (reativar): inativar é o `DELETE`.
 */
export const updateStaffRequestSchema = z.object({
  name: nameSchema.optional(),
  cpf: cpfSchema.optional(),
  position: positionSchema.optional(),
  hiredAt: hiredAtSchema.optional(),
  phone: phoneSchema.optional(),
  department: departmentSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  status: z.enum(['active'], 'Escolha Ativo; para inativar, use Inativar.').optional(),
});
export type UpdateStaffRequest = z.infer<typeof updateStaffRequestSchema>;

/** Corpo de `PUT /api/staff/:id/user`. */
export const linkStaffUserRequestSchema = z.object({
  userId: z.uuid('Escolha um usuário válido.'),
});
export type LinkStaffUserRequest = z.infer<typeof linkStaffUserRequestSchema>;

/** O usuário vinculado, lido na hora: o perfil de acesso do funcionário é o `role` dele (door 1). */
export const staffUserSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  active: z.boolean(),
});
export type StaffUser = z.infer<typeof staffUserSchema>;

/** Um funcionário como `GET /api/staff/:id` o devolve; `null` é "não preenchido" ou "sem vínculo/foto". */
export const staffSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  status: staffStatusSchema,
  cpf: z.string(),
  position: z.string(),
  department: z.string().nullable(),
  hiredAt: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  user: staffUserSchema.nullable(),
  /** A URL assinada da foto corrente (`medium`), ou `null`. */
  photoUrl: z.string().nullable(),
});
export type Staff = z.infer<typeof staffSchema>;

/** Um item da lista: sem CPF, telefone nem e-mail. */
export const staffListItemSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  position: z.string(),
  department: z.string().nullable(),
  status: staffStatusSchema,
  /** A URL assinada da miniatura (`thumb`) da foto corrente, ou `null`. */
  photoUrl: z.string().nullable(),
});
export type StaffListItem = z.infer<typeof staffListItemSchema>;

export const staffListResponseSchema = z.strictObject({ items: z.array(staffListItemSchema) });
export type StaffListResponse = z.infer<typeof staffListResponseSchema>;
