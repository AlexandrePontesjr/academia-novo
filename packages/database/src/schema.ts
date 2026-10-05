import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Tabelas de identidade (auth-rbac, door 3). As chaves em camelCase são os nomes de campo que o
// Better Auth usa; as colunas ficam em snake_case. O id é sempre gerado pelo banco.
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const instant = (name: string) => timestamp(name, { withTimezone: true });
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const USER_ROLES = ['admin', 'reception', 'hr_finance', 'instructor'] as const;

export const users = pgTable(
  'users',
  {
    id: id(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    role: text('role', { enum: USER_ROLES }).notNull(),
    active: boolean('active').notNull().default(true),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check('users_email_lowercase', sql`${table.email} = lower(${table.email})`),
    check('users_role_valid', sql`${table.role} in ('admin', 'reception', 'hr_finance', 'instructor')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: userId(),
    token: text('token').notNull().unique(),
    expiresAt: instant('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    userId: userId(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: instant('access_token_expires_at'),
    refreshTokenExpiresAt: instant('refresh_token_expires_at'),
    scope: text('scope'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

export const twoFactors = pgTable('two_factors', {
  id: id(),
  userId: userId().unique(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  verified: boolean('verified').notNull().default(true),
  failedVerificationCount: integer('failed_verification_count').notNull().default(0),
  lockedUntil: instant('locked_until'),
});

// Bloqueio por tentativas (door 11): a chave é o e-mail em minúsculas, de usuário existente ou não.
export const loginThrottles = pgTable('login_throttles', {
  email: text('email').primaryKey(),
  failures: instant('failures').array().notNull(),
});

// Trilha de auditoria (auditoria, door 1). O autor é opcional e, sem `ON DELETE`, impede apagar o
// usuário; o alvo (`entity_id`) não tem chave estrangeira, porque muda de tabela conforme `entity`.
// A tabela é append-only: os gatilhos da migração `0002` recusam UPDATE, DELETE e TRUNCATE.
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    diff: jsonb('diff'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [index('audit_logs_created_at_user_id_idx').on(table.createdAt, table.userId)],
);

export const STUDENT_STATUSES = ['active', 'inactive', 'suspended'] as const;

// Alunos (alunos, door 1). A situação tem uma fonte só, `status`: inativar é mudar `status`, nunca
// apagar a linha nem criar `deleted_at`. O CPF fica em 11 dígitos, único entre todas as situações -
// quem volta é reativado. As observações de saúde só existem cifradas (door 2), no formato
// `v1.<iv>.<texto cifrado>.<tag>`. `students_fold` tira caixa e acentos: a busca e a ordem por nome
// usam o mesmo texto que o índice trigram.
export const students = pgTable(
  'students',
  {
    id: id(),
    name: text('name').notNull(),
    cpf: text('cpf').notNull().unique(),
    birthDate: date('birth_date', { mode: 'string' }).notNull(),
    sex: text('sex'),
    email: text('email'),
    phone: text('phone').notNull(),
    address: text('address'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    healthNotesEnc: text('health_notes_enc'),
    status: text('status', { enum: STUDENT_STATUSES }).notNull().default('active'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check('students_status_valid', sql`${table.status} in ('active', 'inactive', 'suspended')`),
    index('students_name_fold_trgm_idx').using('gin', sql`students_fold(${table.name}) gin_trgm_ops`),
  ],
);

export const GUARDIAN_RELATIONSHIPS = ['mother', 'father', 'legal_guardian', 'other'] as const;

// Responsável legal (consentimento, door 1). Uma linha por versão dos dados, nunca editada: mudar
// nome, CPF, telefone ou parentesco insere outra, e o atual é a de maior `id` do aluno (uuid v7).
// Sem `UNIQUE` sobre `student_id` nem sobre `cpf`: irmãos repetem o mesmo responsável. O CPF fica
// em 11 dígitos e em claro, como o do aluno (AD-030).
export const guardians = pgTable(
  'guardians',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    name: text('name').notNull(),
    cpf: text('cpf').notNull(),
    phone: text('phone').notNull(),
    relationship: text('relationship', { enum: GUARDIAN_RELATIONSHIPS }).notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    check('guardians_relationship_valid', sql`${table.relationship} in ('mother', 'father', 'legal_guardian', 'other')`),
    index('guardians_student_id_idx').on(table.studentId, table.id),
  ],
);

export const CONSENT_PURPOSES = ['data_processing', 'image_use'] as const;

// Termos de consentimento (consentimento, door 2): o texto de uma finalidade numa versão. Append-only
// como `audit_logs` (AD-024): os gatilhos da migração `0004` recusam UPDATE, DELETE e TRUNCATE. A
// versão seguinte é uma migração que insere a linha; o termo vigente é a maior `version`.
export const consentTerms = pgTable(
  'consent_terms',
  {
    purpose: text('purpose', { enum: CONSENT_PURPOSES }).notNull(),
    version: integer('version').notNull(),
    text: text('text').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.purpose, table.version] }),
    check('consent_terms_purpose_valid', sql`${table.purpose} in ('data_processing', 'image_use')`),
    check('consent_terms_version_positive', sql`${table.version} >= 1`),
  ],
);

export const CONSENT_GRANTORS = ['student', 'guardian'] as const;

// Consentimentos (consentimento, door 3): quem aceitou qual versão de qual termo, para qual aluno.
// Só `revoked_at` muda, de nulo para um instante, uma vez; conceder de novo insere outra linha. O
// índice parcial decide a corrida entre duas concessões da mesma finalidade. `granted_at` é sempre
// o do banco.
export const consents = pgTable(
  'consents',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    purpose: text('purpose', { enum: CONSENT_PURPOSES }).notNull(),
    termVersion: integer('term_version').notNull(),
    grantedBy: text('granted_by', { enum: CONSENT_GRANTORS }).notNull(),
    guardianId: uuid('guardian_id').references(() => guardians.id),
    grantedAt: instant('granted_at').notNull().defaultNow(),
    revokedAt: instant('revoked_at'),
  },
  (table) => [
    foreignKey({
      columns: [table.purpose, table.termVersion],
      foreignColumns: [consentTerms.purpose, consentTerms.version],
    }),
    check('consents_granted_by_valid', sql`${table.grantedBy} in ('student', 'guardian')`),
    check(
      'consents_guardian_iff_granted_by_guardian',
      sql`(${table.grantedBy} = 'guardian') = (${table.guardianId} is not null)`,
    ),
    uniqueIndex('consents_one_active_idx').on(table.studentId, table.purpose).where(sql`${table.revokedAt} is null`),
    index('consents_student_id_granted_at_idx').on(table.studentId, table.grantedAt),
  ],
);

// Fotos do aluno (foto-pipeline, door 1). A chave estrangeira não cascateia: apagar o aluno de vez
// é da `privacidade`, que remove as fotos antes. No máximo uma foto corrente por aluno, garantida
// pelo índice parcial; `version` guarda as anteriores para a `foto-captura`. O `id` é o `photoId`
// da chave do objeto no bucket (door 2). `funcionarios` acrescenta a sua chave anulável.
export const photos = pgTable(
  'photos',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    version: integer('version').notNull(),
    isCurrent: boolean('is_current').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    check('photos_version_positive', sql`${table.version} >= 1`),
    unique('photos_student_id_version_unique').on(table.studentId, table.version),
    uniqueIndex('photos_one_current_idx').on(table.studentId).where(sql`${table.isCurrent}`),
  ],
);
