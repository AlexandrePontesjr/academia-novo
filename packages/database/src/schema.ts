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
//
// Anonimizar (privacidade, door 1) é limpar a ficha no lugar: com `anonymized_at` preenchido, o nome é
// `Titular anonimizado`, a situação é `inactive` e todo campo pessoal é nulo; sem ele, `cpf`,
// `birth_date` e `phone` são obrigatórios. Campo pessoal novo entra nos dois `CHECK`. `inactivated_at`
// é o instante em que o aluno ficou `inactive`, presente se e somente se ele está (door 3).
export const students = pgTable(
  'students',
  {
    id: id(),
    name: text('name').notNull(),
    cpf: text('cpf').unique(),
    birthDate: date('birth_date', { mode: 'string' }),
    sex: text('sex'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    healthNotesEnc: text('health_notes_enc'),
    status: text('status', { enum: STUDENT_STATUSES }).notNull().default('active'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    anonymizedAt: instant('anonymized_at'),
    inactivatedAt: instant('inactivated_at'),
  },
  (table) => [
    check('students_status_valid', sql`${table.status} in ('active', 'inactive', 'suspended')`),
    check(
      'students_anonymized_clean',
      sql`${table.anonymizedAt} IS NULL OR (${table.name} = 'Titular anonimizado' AND ${table.status} = 'inactive' AND ${table.cpf} IS NULL AND ${table.birthDate} IS NULL AND ${table.sex} IS NULL AND ${table.email} IS NULL AND ${table.phone} IS NULL AND ${table.address} IS NULL AND ${table.emergencyContactName} IS NULL AND ${table.emergencyContactPhone} IS NULL AND ${table.healthNotesEnc} IS NULL AND ${table.inactivatedAt} IS NOT NULL)`,
    ),
    check(
      'students_identified_complete',
      sql`${table.anonymizedAt} IS NOT NULL OR (${table.cpf} IS NOT NULL AND ${table.birthDate} IS NOT NULL AND ${table.phone} IS NOT NULL)`,
    ),
    check('students_inactivated_at_matches', sql`(${table.status} = 'inactive') = (${table.inactivatedAt} IS NOT NULL)`),
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

export const STAFF_STATUSES = ['active', 'inactive'] as const;

// Funcionários (funcionarios, door 1). Sem coluna de perfil: o "perfil de acesso ao sistema" é o `role`
// do usuário vinculado, lido na hora (AD-018). O CPF fica em 11 dígitos, único entre todas as situações
// - quem volta é reativado. `user_id` é o acesso da pessoa: único, anulável e sem `ON DELETE`, então um
// usuário vinculado não é apagado por SQL sem desvincular antes. A anonimização (privacidade, door 2)
// limpa a ficha no lugar, como a do aluno, e exige o usuário já desvinculado.
export const staff = pgTable(
  'staff',
  {
    id: id(),
    name: text('name').notNull(),
    cpf: text('cpf').unique(),
    position: text('position'),
    department: text('department'),
    hiredAt: date('hired_at', { mode: 'string' }),
    phone: text('phone'),
    email: text('email'),
    status: text('status', { enum: STAFF_STATUSES }).notNull().default('active'),
    userId: uuid('user_id')
      .unique()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    anonymizedAt: instant('anonymized_at'),
  },
  (table) => [
    check('staff_status_valid', sql`${table.status} in ('active', 'inactive')`),
    check(
      'staff_anonymized_clean',
      sql`${table.anonymizedAt} IS NULL OR (${table.name} = 'Titular anonimizado' AND ${table.status} = 'inactive' AND ${table.userId} IS NULL AND ${table.cpf} IS NULL AND ${table.position} IS NULL AND ${table.department} IS NULL AND ${table.hiredAt} IS NULL AND ${table.phone} IS NULL AND ${table.email} IS NULL)`,
    ),
    check(
      'staff_identified_complete',
      sql`${table.anonymizedAt} IS NOT NULL OR (${table.cpf} IS NOT NULL AND ${table.position} IS NOT NULL AND ${table.hiredAt} IS NOT NULL AND ${table.phone} IS NOT NULL)`,
    ),
  ],
);

// Fotos (foto-pipeline, door 1; funcionarios, door 2). Cada foto tem exatamente um dono, aluno ou
// funcionário (`photos_one_owner`). As chaves estrangeiras não cascateiam: apagar o dono de vez é da
// `privacidade`, que remove as fotos antes. No máximo uma foto corrente por dono, garantida pelos
// índices parciais; `version` guarda as anteriores para a `foto-captura`. O `id` é o `photoId` da
// chave do objeto no bucket (door 2).
export const photos = pgTable(
  'photos',
  {
    id: id(),
    studentId: uuid('student_id').references(() => students.id),
    staffId: uuid('staff_id').references(() => staff.id),
    version: integer('version').notNull(),
    isCurrent: boolean('is_current').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    /** Prazo da versão guardada: nulo se e somente se a foto é a corrente (foto-captura, door 1). */
    expiresAt: instant('expires_at'),
  },
  (table) => [
    check('photos_version_positive', sql`${table.version} >= 1`),
    check('photos_expiry_matches_current', sql`${table.isCurrent} = (${table.expiresAt} IS NULL)`),
    check('photos_one_owner', sql`num_nonnulls(${table.studentId}, ${table.staffId}) = 1`),
    unique('photos_student_id_version_unique').on(table.studentId, table.version),
    unique('photos_staff_id_version_unique').on(table.staffId, table.version),
    uniqueIndex('photos_one_current_idx').on(table.studentId).where(sql`${table.isCurrent}`),
    uniqueIndex('photos_one_current_staff_idx').on(table.staffId).where(sql`${table.isCurrent}`),
  ],
);

export const PLAN_PERIODS = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
export const PLAN_STATUSES = ['active', 'inactive'] as const;

// Planos (planos-matriculas, doors 1 e 2). `period` é fixado no cadastro e nenhuma rota o altera;
// `rules` é texto livre que as pessoas leem e o sistema não interpreta. `name` não é único: "Mensal"
// pode existir em duas faixas de preço. O valor é sempre inteiro de centavos (AD-059).
export const plans = pgTable(
  'plans',
  {
    id: id(),
    name: text('name').notNull(),
    period: text('period', { enum: PLAN_PERIODS }).notNull(),
    priceCents: integer('price_cents').notNull(),
    rules: text('rules'),
    status: text('status', { enum: PLAN_STATUSES }).notNull().default('active'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check('plans_period_valid', sql`${table.period} in ('monthly', 'quarterly', 'semiannual', 'annual')`),
    check('plans_status_valid', sql`${table.status} in ('active', 'inactive')`),
    check('plans_price_cents_not_negative', sql`${table.priceCents} >= 0`),
  ],
);

// Matrículas (planos-matriculas, doors 3 e 5): um período de um aluno num plano por linha. Só
// `cancelled_at` muda, de nulo para um instante, uma vez; renovar insere a linha do período seguinte.
// Não há coluna `status`: a situação é calculada na leitura (door 4). As chaves estrangeiras não
// cascateiam. A restrição de exclusão `enrollments_no_overlap`, que o Drizzle não descreve, está na
// migração `0008`: dois períodos não cancelados do mesmo aluno nunca têm um dia em comum.
export const enrollments = pgTable(
  'enrollments',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    startsAt: date('starts_at', { mode: 'string' }).notNull(),
    endsAt: date('ends_at', { mode: 'string' }).notNull(),
    priceCents: integer('price_cents').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    cancelledAt: instant('cancelled_at'),
  },
  (table) => [
    check('enrollments_ends_at_not_before_starts_at', sql`${table.endsAt} >= ${table.startsAt}`),
    check('enrollments_price_cents_not_negative', sql`${table.priceCents} >= 0`),
    index('enrollments_student_id_starts_at_idx').on(table.studentId, table.startsAt),
  ],
);

// Pagamentos (pagamentos, door 1): a confirmação de que um período foi pago, uma linha por
// confirmação. Só `voided_at` muda, de nulo para um instante, uma vez; desfazer preenche `voided_at` e
// confirmar de novo insere outra linha. Não há valor, forma, data de pagamento, `status`, `due_date`
// nem `student_id`: o valor é o do período, a situação e o vencimento são calculados na leitura
// (door 2) e o aluno chega pelo período. A chave estrangeira não cascateia; uma confirmação viva por
// período é do índice parcial.
export const payments = pgTable(
  'payments',
  {
    id: id(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id),
    createdAt: instant('created_at').notNull().defaultNow(),
    voidedAt: instant('voided_at'),
  },
  (table) => [uniqueIndex('payments_one_alive_idx').on(table.enrollmentId).where(sql`${table.voidedAt} is null`)],
);

// Presenças (check-in, door 1): a chegada de um aluno num dia de `America/Sao_Paulo`, registrada por
// um usuário. `day` é gravado pela API a partir de `saoPauloToday()`, nunca derivado de
// `checked_in_at` pelo banco. Nenhuma rota edita nem apaga uma linha; as chaves estrangeiras não
// cascateiam, e uma presença por aluno por dia é do índice único.
export const checkIns = pgTable(
  'check_ins',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    day: date('day', { mode: 'string' }).notNull(),
    checkedInAt: instant('checked_in_at').notNull().defaultNow(),
    checkedInBy: uuid('checked_in_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [uniqueIndex('check_ins_one_per_day_idx').on(table.studentId, table.day)],
);

// Configuração de privacidade (privacidade, door 4): uma linha só, criada pela migração `0011` e nunca
// apagada. Nulo em `inactive_student_retention_years` é a anonimização automática desligada, e é o
// valor inicial. Configuração nova de privacidade é coluna nova aqui.
export const privacySettings = pgTable(
  'privacy_settings',
  {
    id: boolean('id').primaryKey().default(true),
    inactiveStudentRetentionYears: integer('inactive_student_retention_years'),
    photoVersionRetentionDays: integer('photo_version_retention_days').notNull().default(30),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check('privacy_settings_single_row', sql`${table.id}`),
    check('privacy_settings_years_range', sql`${table.inactiveStudentRetentionYears} BETWEEN 1 AND 20`),
    check('privacy_settings_days_range', sql`${table.photoVersionRetentionDays} BETWEEN 1 AND 365`),
  ],
);
