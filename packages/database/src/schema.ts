import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
