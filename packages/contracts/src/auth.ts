import { z } from 'zod';

/** Perfil único do usuário (AD-018); `student` é o aluno com login (AD-119). */
export const USER_ROLES = ['admin', 'reception', 'hr_finance', 'instructor', 'student'] as const;
export const roleSchema = z.enum(USER_ROLES, 'Escolha um perfil válido.');
export type Role = z.infer<typeof roleSchema>;

/** Os perfis da equipe: os únicos que a gestão de usuários cria e que as rotas da equipe aceitam. */
export const STAFF_ROLES = ['admin', 'reception', 'hr_finance', 'instructor'] as const satisfies readonly Role[];
export const staffRoleSchema = z.enum(STAFF_ROLES, 'Escolha um perfil válido.');
export type StaffRole = z.infer<typeof staffRoleSchema>;

const required = (message: string) => z.string(message).min(1, message);

/**
 * Tamanho máximo da senha, o mesmo número em `maxPasswordLength` do Better Auth (`apps/api/src/auth.ts`).
 * Ele mede em unidades UTF-16 (`String.length`) e o `.max()` do Zod conta pontos de código: um emoji
 * vale 1 num e 2 no outro, e uma senha gravada pelo schema seria recusada no login. Por isso o
 * máximo é conferido pela mesma medida do Better Auth.
 */
export const PASSWORD_MAX_LENGTH = 128;

const maxPasswordLength = (value: string) => value.length <= PASSWORD_MAX_LENGTH;
const PASSWORD_TOO_LONG = `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;

/** Senha nova: 12 a 128 caracteres, sem regra de composição. */
export const newPasswordSchema = z
  .string('Informe a senha.')
  .min(12, 'A senha deve ter pelo menos 12 caracteres.')
  .refine(maxPasswordLength, PASSWORD_TOO_LONG);

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
  password: required('Informe a senha.').refine(maxPasswordLength, PASSWORD_TOO_LONG),
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
