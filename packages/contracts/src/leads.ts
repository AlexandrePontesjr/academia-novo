import { z } from 'zod';
import { emailSchema } from './auth.ts';
import { nameSchema, phoneSchema } from './person.ts';

// Interessados (pre-cadastro): quem pede matrícula pela página pública `/matricula`, sem login, e
// ainda não é aluno. O nome e o telefone seguem as regras de pessoa (AD-011).

export const LEAD_STATUSES = ['new', 'contacted', 'converted', 'discarded'] as const;
export const leadStatusSchema = z.enum(LEAD_STATUSES, 'Escolha uma situação válida.');
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const LEAD_SOURCES = ['form', 'google'] as const;
export const leadSourceSchema = z.enum(LEAD_SOURCES);
export type LeadSource = z.infer<typeof leadSourceSchema>;

export const MINOR_MESSAGE = 'Menores de 18 anos fazem a matrícula na recepção, com o responsável.';
export const INVALID_LINK_MESSAGE = 'Link inválido ou expirado. Envie o pré-cadastro de novo.';

/** O e-mail do interessado sai aparado e em minúsculas: é por ele que o aberto é único (door 1). */
export const leadEmailSchema = z.string('Informe um e-mail válido.').trim().toLowerCase().pipe(emailSchema);

/**
 * Corpo de `POST /api/leads`. `website` é a armadilha: uma pessoa nunca o vê, e preenchido ele é
 * respondido antes de chegar aqui (door 4). Com o cookie do Google, nome e e-mail são os do Google.
 */
export const createLeadRequestSchema = z.object({
  name: nameSchema,
  email: leadEmailSchema,
  phone: phoneSchema,
  adult: z.literal(true, MINOR_MESSAGE),
  termVersion: z
    .number('Informe a versão do termo.')
    .int('Informe a versão do termo.')
    .min(1, 'Informe a versão do termo.'),
  website: z.string().max(0).optional(),
});
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;

/** Resposta de `POST /api/leads`: a mesma para e-mail novo, repetido ou de aluno (AC 26). */
export const leadCreatedResponseSchema = z.strictObject({ status: z.enum(['pending', 'confirmed']) });
export type LeadCreatedResponse = z.infer<typeof leadCreatedResponseSchema>;

/** Corpo de `POST /api/leads/confirm`: o token do link do e-mail (door 3). */
export const confirmLeadRequestSchema = z.object({
  token: z.string(INVALID_LINK_MESSAGE).min(1, INVALID_LINK_MESSAGE),
});
export type ConfirmLeadRequest = z.infer<typeof confirmLeadRequestSchema>;

export const leadConfirmedResponseSchema = z.strictObject({ status: z.literal('confirmed') });
export type LeadConfirmedResponse = z.infer<typeof leadConfirmedResponseSchema>;

/** `GET /api/leads/options`: se o Google está ligado e o termo vigente de `data_processing`. */
export const leadOptionsResponseSchema = z.strictObject({
  google: z.boolean(),
  term: z.strictObject({ version: z.number().int(), text: z.string() }),
});
export type LeadOptionsResponse = z.infer<typeof leadOptionsResponseSchema>;

/** `GET /api/leads/google/profile`: nome e e-mail que o Google confirmou. */
export const leadGoogleProfileSchema = z.strictObject({ name: z.string(), email: z.string() });
export type LeadGoogleProfile = z.infer<typeof leadGoogleProfileSchema>;

/** Um interessado como a equipe o vê. */
export const leadSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  source: leadSourceSchema,
  status: leadStatusSchema,
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
  studentId: z.uuid().nullable(),
});
export type Lead = z.infer<typeof leadSchema>;

export const leadsResponseSchema = z.strictObject({ items: z.array(leadSchema) });

/** Query de `GET /api/leads`: sem `status`, os abertos (`new` e `contacted`). */
export const leadsQuerySchema = z.object({ status: leadStatusSchema.optional() });
export type LeadsQuery = z.infer<typeof leadsQuerySchema>;
export type LeadsResponse = z.infer<typeof leadsResponseSchema>;

/** Corpo de `PATCH /api/leads/:id`: `converted` só pela criação do aluno (door 9). */
export const updateLeadRequestSchema = z.object({
  status: z.enum(['new', 'contacted', 'discarded'], 'Escolha uma situação válida.'),
});
export type UpdateLeadRequest = z.infer<typeof updateLeadRequestSchema>;
