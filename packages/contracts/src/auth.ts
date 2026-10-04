import { z } from 'zod';

/** Perfil único do usuário (AD-018). */
export const USER_ROLES = ['admin', 'reception', 'hr_finance', 'instructor'] as const;
export const roleSchema = z.enum(USER_ROLES, 'Escolha um perfil válido.');
export type Role = z.infer<typeof roleSchema>;

const required = (message: string) => z.string(message).min(1, message);

/** Senha nova: 12 a 128 caracteres, sem regra de composição. */
export const newPasswordSchema = z
  .string('Informe a senha.')
  .min(12, 'A senha deve ter pelo menos 12 caracteres.')
  .max(128, 'A senha deve ter no máximo 128 caracteres.');

/** 254 caracteres é o maior endereço que cabe num envelope SMTP (RFC 5321). */
export const emailSchema = z
  .email('Informe um e-mail válido.')
  .max(254, 'O e-mail deve ter no máximo 254 caracteres.');

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: required('Informe a senha.'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Corpo de `POST /api/auth/login` e de `POST /api/auth/two-factor/verify`. */
export const loginResponseSchema = z.strictObject({
  status: z.enum(['authenticated', 'two_factor_required']),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Exatamente um dos dois: o código do aplicativo ou um código de recuperação. */
export const twoFactorVerifyRequestSchema = z
  .object({
    code: required('Informe o código de 6 dígitos.').optional(),
    backupCode: required('Informe o código de recuperação.').optional(),
  })
  .refine((body) => (body.code === undefined) !== (body.backupCode === undefined), {
    path: ['code'],
    message: 'Informe o código de 6 dígitos ou um código de recuperação.',
  });
export type TwoFactorVerifyRequest = z.infer<typeof twoFactorVerifyRequestSchema>;

export const sessionResponseSchema = z.strictObject({
  user: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    role: roleSchema,
    twoFactorEnabled: z.boolean(),
  }),
  twoFactorEnrollmentRequired: z.boolean(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: required('Informe a senha atual.'),
  newPassword: newPasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** Corpo de `two-factor/enable` e de `two-factor/disable`. */
export const passwordConfirmationRequestSchema = z.object({
  password: required('Informe a senha.'),
});
export type PasswordConfirmationRequest = z.infer<typeof passwordConfirmationRequestSchema>;

export const twoFactorEnableResponseSchema = z.strictObject({
  totpUri: z.string().startsWith('otpauth://totp/'),
  backupCodes: z.array(z.string()).min(1),
});
export type TwoFactorEnableResponse = z.infer<typeof twoFactorEnableResponseSchema>;

export const twoFactorConfirmRequestSchema = z.object({
  code: required('Informe o código de 6 dígitos.'),
});
export type TwoFactorConfirmRequest = z.infer<typeof twoFactorConfirmRequestSchema>;
