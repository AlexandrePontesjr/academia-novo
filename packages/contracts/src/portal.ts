import { z } from 'zod';
import { emailSchema, newPasswordSchema } from './auth.ts';
import { cpfSchema } from './person.ts';
import { pendingPhotoSchema, studentStatusSchema, updateStudentRequestSchema } from './students.ts';

// O portal do aluno (portal-aluno): o primeiro acesso, os links de senha e a área "Minha conta".

/** O e-mail sai aparado e em minúsculas: é como a ficha e `users` o guardam. */
const portalEmailSchema = z.string('Informe um e-mail válido.').trim().toLowerCase().pipe(emailSchema);

export const INVALID_PASSWORD_LINK_MESSAGE =
  'Este link não vale mais. Peça outro em Primeiro acesso ou em Esqueci minha senha.';

/** Corpo de `POST /api/portal/first-access`: o CPF e o e-mail da ficha. */
export const firstAccessRequestSchema = z.object({
  cpf: cpfSchema,
  email: portalEmailSchema,
});
export type FirstAccessRequest = z.infer<typeof firstAccessRequestSchema>;

/** Corpo de `POST /api/password-tokens/consume`: o token do link e a senha nova (AD-120). */
export const consumePasswordTokenRequestSchema = z.object({
  token: z.string(INVALID_PASSWORD_LINK_MESSAGE).min(1, INVALID_PASSWORD_LINK_MESSAGE),
  password: newPasswordSchema,
});
export type ConsumePasswordTokenRequest = z.infer<typeof consumePasswordTokenRequestSchema>;

/** Corpo de `POST /api/password-reset`. */
export const passwordResetRequestSchema = z.object({ email: portalEmailSchema });
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

/**
 * Corpo de `PATCH /api/me/profile`: só os quatro campos de contato, pelas regras de `PATCH /api/students/:id`.
 * Qualquer outra chave é recusada com o próprio nome no `path` (e-mail e CPF nunca mudam pelo portal).
 */
const CONTACT_FIELDS: readonly string[] = ['phone', 'address', 'emergencyContactName', 'emergencyContactPhone'];
export const updateMyProfileRequestSchema = updateStudentRequestSchema
  .pick({ phone: true, address: true, emergencyContactName: true, emergencyContactPhone: true })
  .loose()
  .superRefine((body, context) => {
    for (const key of Object.keys(body)) {
      if (!CONTACT_FIELDS.includes(key)) {
        context.addIssue({ code: 'custom', path: [key], message: 'Este campo não pode ser alterado pelo portal.' });
      }
    }
  });
export type UpdateMyProfileRequest = Pick<
  z.infer<typeof updateMyProfileRequestSchema>,
  'phone' | 'address' | 'emergencyContactName' | 'emergencyContactPhone'
>;

/** Corpo de `GET /api/me/profile`: a ficha vinculada, sem `healthNotes`. */
export const myProfileSchema = z.strictObject({
  name: z.string(),
  cpf: z.string(),
  birthDate: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  address: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  status: studentStatusSchema,
  photoUrl: z.string().nullable(),
  pendingPhoto: pendingPhotoSchema.nullable(),
});
export type MyProfile = z.infer<typeof myProfileSchema>;
