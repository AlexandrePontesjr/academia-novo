import { z } from 'zod';
import { roleSchema } from './auth.ts';
import { CONSENT_GRANTORS, CONSENT_PURPOSES } from './consents.ts';
import { STAFF_STATUSES } from './staff.ts';
import { GUARDIAN_RELATIONSHIPS, STUDENT_SEXES, STUDENT_STATUSES } from './students.ts';

export const RETENTION_YEARS_MIN = 1;
export const RETENTION_YEARS_MAX = 20;
export const PHOTO_RETENTION_DAYS_MIN = 1;
export const PHOTO_RETENTION_DAYS_MAX = 365;

const yearsMessage = `Informe um número inteiro de ${RETENTION_YEARS_MIN} a ${RETENTION_YEARS_MAX} anos, ou desligue.`;
const daysMessage = `Informe um número inteiro de ${PHOTO_RETENTION_DAYS_MIN} a ${PHOTO_RETENTION_DAYS_MAX} dias.`;

/**
 * A configuração de privacidade (privacidade, door 4): corpo de `PUT /api/privacy-settings` e
 * resposta das duas rotas. As duas chaves são obrigatórias; `null` em anos é a anonimização
 * automática desligada. Chave a mais é recusada com o próprio nome como `path`.
 */
const settingsShape = {
  inactiveStudentRetentionYears: z.int(yearsMessage).min(RETENTION_YEARS_MIN, yearsMessage).max(RETENTION_YEARS_MAX, yearsMessage).nullable(),
  photoVersionRetentionDays: z.int(daysMessage).min(PHOTO_RETENTION_DAYS_MIN, daysMessage).max(PHOTO_RETENTION_DAYS_MAX, daysMessage),
};
// o objeto estrito do Zod recusa a chave a mais sem nomeá-la; aqui cada uma vira um item com o próprio nome
export const privacySettingsSchema = z.looseObject(settingsShape).superRefine((body, context) => {
  for (const key of Object.keys(body)) {
    if (!(key in settingsShape)) context.addIssue({ code: 'custom', path: [key], message: 'Campo não permitido.' });
  }
});
export type PrivacySettings = z.infer<z.ZodObject<typeof settingsShape>>;

/** Mudar a forma da exportação é `formatVersion: 2` (door 5). */
export const EXPORT_FORMAT_VERSION = 1;

const day = z.iso.date();
const instant = z.iso.datetime();
const photoImage = z.string().startsWith('data:image/webp;base64,');

const exportedPhotoSchema = z.strictObject({
  version: z.int(),
  isCurrent: z.boolean(),
  createdAt: instant,
  expiresAt: instant.nullable(),
  /** A variante `large`, dentro do arquivo. */
  image: photoImage,
});

/** `GET /api/students/:id/data-export` (door 5): todas as chaves presentes, `[]` e `null` quando vazias. */
export const studentExportSchema = z.strictObject({
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: instant,
  subject: z.literal('student'),
  student: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    cpf: z.string(),
    birthDate: day,
    sex: z.enum(STUDENT_SEXES).nullable(),
    email: z.string().nullable(),
    phone: z.string(),
    address: z.string().nullable(),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
    healthNotes: z.string().nullable(),
    status: z.enum(STUDENT_STATUSES),
    createdAt: instant,
    inactivatedAt: instant.nullable(),
  }),
  guardians: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      cpf: z.string(),
      phone: z.string(),
      relationship: z.enum(GUARDIAN_RELATIONSHIPS),
      createdAt: instant,
    }),
  ),
  consents: z.array(
    z.strictObject({
      purpose: z.enum(CONSENT_PURPOSES),
      termVersion: z.int(),
      termText: z.string(),
      grantedBy: z.enum(CONSENT_GRANTORS),
      grantedAt: instant,
      revokedAt: instant.nullable(),
    }),
  ),
  enrollments: z.array(
    z.strictObject({
      id: z.uuid(),
      planName: z.string(),
      startsAt: day,
      endsAt: day,
      priceCents: z.int(),
      cancelledAt: instant.nullable(),
    }),
  ),
  payments: z.array(z.strictObject({ startsAt: day, createdAt: instant, voidedAt: instant.nullable() })),
  checkIns: z.array(z.strictObject({ day, checkedInAt: instant })),
  photos: z.array(exportedPhotoSchema),
});
export type StudentExport = z.infer<typeof studentExportSchema>;

/** `GET /api/staff/:id/data-export` (door 5): `user` é o vinculado, ou `null`. */
export const staffExportSchema = z.strictObject({
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: instant,
  subject: z.literal('staff'),
  staff: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    cpf: z.string(),
    position: z.string(),
    department: z.string().nullable(),
    hiredAt: day,
    phone: z.string(),
    email: z.string().nullable(),
    status: z.enum(STAFF_STATUSES),
    createdAt: instant,
  }),
  user: z.strictObject({ email: z.string(), role: roleSchema }).nullable(),
  photos: z.array(exportedPhotoSchema),
});
export type StaffExport = z.infer<typeof staffExportSchema>;
