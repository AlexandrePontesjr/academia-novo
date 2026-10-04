import { z } from 'zod';
import { guardianSchema } from './students.ts';

export const CONSENT_PURPOSES = ['data_processing', 'image_use'] as const;
export const consentPurposeSchema = z.enum(CONSENT_PURPOSES, 'Escolha uma finalidade válida.');
export type ConsentPurpose = z.infer<typeof consentPurposeSchema>;

export const CONSENT_GRANTORS = ['student', 'guardian'] as const;
export const consentGrantorSchema = z.enum(CONSENT_GRANTORS, 'Escolha quem concede o consentimento.');
export type ConsentGrantor = z.infer<typeof consentGrantorSchema>;

/** Corpo de `POST /api/students/:id/consents`. O instante do aceite é sempre o do banco: não se envia. */
export const grantConsentRequestSchema = z.object({
  purpose: consentPurposeSchema,
  termVersion: z
    .number('Informe a versão do termo.')
    .int('Informe a versão do termo.')
    .min(1, 'Informe a versão do termo.'),
  grantedBy: consentGrantorSchema,
});
export type GrantConsentRequest = z.infer<typeof grantConsentRequestSchema>;

/** Um consentimento como a API o devolve; `guardian` é quem concedeu na época, ou `null`. */
export const consentSchema = z.strictObject({
  id: z.uuid(),
  purpose: consentPurposeSchema,
  termVersion: z.number().int(),
  grantedBy: consentGrantorSchema,
  guardian: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  grantedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export type Consent = z.infer<typeof consentSchema>;

/** `GET /api/students/:id/consents`: o responsável atual e todos os consentimentos, do mais recente ao mais antigo. */
export const studentConsentsResponseSchema = z.strictObject({
  guardian: guardianSchema.nullable(),
  items: z.array(consentSchema),
});
export type StudentConsentsResponse = z.infer<typeof studentConsentsResponseSchema>;

export const consentTermSchema = z.strictObject({
  purpose: consentPurposeSchema,
  version: z.number().int(),
  text: z.string(),
  createdAt: z.iso.datetime(),
});
export type ConsentTerm = z.infer<typeof consentTermSchema>;

/** `GET /api/consent-terms`: só a versão mais recente de cada finalidade. */
export const consentTermsResponseSchema = z.strictObject({ items: z.array(consentTermSchema) });
export type ConsentTermsResponse = z.infer<typeof consentTermsResponseSchema>;
