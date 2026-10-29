import { z } from 'zod';
import { emailSchema, newPasswordSchema, roleSchema, staffRoleSchema } from './auth.ts';

const nameSchema = z
  .string('Informe o nome.')
  .trim()
  .min(1, 'Informe o nome.')
  .max(120, 'O nome deve ter no máximo 120 caracteres.')
  // o Postgres não guarda U+0000 em texto
  .refine((name) => !name.includes('\0'), 'O nome contém um caractere inválido.');

/** Um usuário como a API o devolve: nunca com senha nem segredo. */
export const userSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  active: z.boolean(),
  twoFactorEnabled: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

export const usersResponseSchema = z.strictObject({ users: z.array(userSchema) });
export type UsersResponse = z.infer<typeof usersResponseSchema>;

export const createUserRequestSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  // o perfil `student` só nasce pelo primeiro acesso do portal (AD-119)
  role: staffRoleSchema,
  password: newPasswordSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const updateUserRequestSchema = z.object({
  name: nameSchema.optional(),
  role: staffRoleSchema.optional(),
  active: z.boolean('Informe se o usuário está ativo.').optional(),
});
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const resetPasswordRequestSchema = z.object({ password: newPasswordSchema });
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
