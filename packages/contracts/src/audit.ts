import { z } from 'zod';

/**
 * Vocabulário de ações da trilha de auditoria (AD-025): `<entidade>.<verbo_no_passado>`, em
 * snake_case. Cada feature acrescenta as suas aqui; a ordem é a de exibição no filtro da tela.
 */
export const AUDIT_ACTIONS = [
  'auth.login_succeeded',
  'auth.login_failed',
  'auth.logout',
  'auth.password_changed',
  'auth.two_factor_enabled',
  'auth.two_factor_disabled',
  'user.created',
  'user.updated',
  'user.password_reset',
  'user.two_factor_reset',
  'student.created',
  'student.updated',
  'student.inactivated',
  'student.guardian_saved',
  'student.consent_granted',
  'student.consent_revoked',
  'student.photo_uploaded',
  'student.photo_removed',
  'student.photo_replaced',
  'student.photo_version_purged',
  'staff.created',
  'staff.updated',
  'staff.inactivated',
  'staff.viewed',
  'staff.list_viewed',
  'staff.user_linked',
  'staff.user_unlinked',
  'staff.photo_uploaded',
  'staff.photo_removed',
  'staff.photo_replaced',
  'staff.photo_version_purged',
  'plan.created',
  'plan.updated',
  'plan.inactivated',
  'student.enrollment_created',
  'student.enrollment_cancelled',
  'student.payment_confirmed',
  'student.payment_undone',
  'student.exported',
  'student.anonymized',
  'staff.exported',
  'staff.anonymized',
  'privacy.settings_updated',
] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS, 'Escolha uma ação válida.');
export type AuditAction = z.infer<typeof auditActionSchema>;

/**
 * O que mudou (AD-026): `fields` nomeia todo campo alterado; `values` traz o antes e o depois só
 * dos campos que a entidade declara como registráveis.
 */
export const auditDiffSchema = z.strictObject({
  fields: z.array(z.string()),
  values: z.record(z.string(), z.strictObject({ from: z.unknown(), to: z.unknown() })),
});
export type AuditDiff = z.infer<typeof auditDiffSchema>;

export const auditLogSchema = z.strictObject({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  /** O autor, com o nome atual; `null` quando a linha não tem autor. */
  user: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.uuid().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  diff: auditDiffSchema.nullable(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const auditLogsResponseSchema = z.strictObject({
  items: z.array(auditLogSchema),
  nextCursor: z.string().nullable(),
});
export type AuditLogsResponse = z.infer<typeof auditLogsResponseSchema>;

const instant = (message: string) => z.iso.datetime({ offset: true, error: message });
// o Postgres não guarda U+0000 em texto, então nenhuma linha teria esse valor
const text = (max: number, message: string) =>
  z
    .string(message)
    .min(1, message)
    .max(max, message)
    .refine((value) => !value.includes('\0'), message);

/** Query de `GET /api/audit-logs` (AD-029): todos opcionais, e os filtros se somam. */
export const auditLogsQuerySchema = z.object({
  /** Início do período, inclusivo. */
  from: instant('Informe uma data inicial válida.').optional(),
  /** Fim do período, exclusivo. */
  to: instant('Informe uma data final válida.').optional(),
  userId: z.uuid('Escolha um usuário válido.').optional(),
  action: auditActionSchema.optional(),
  entity: text(64, 'Informe uma entidade válida.').optional(),
  entityId: z.uuid('Informe um alvo válido.').optional(),
  ip: text(45, 'O IP deve ter no máximo 45 caracteres.').optional(),
  /** O `nextCursor` da página anterior. */
  cursor: z.uuid('Cursor inválido.').optional(),
});
export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
