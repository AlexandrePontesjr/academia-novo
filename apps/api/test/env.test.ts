import { expect, test } from 'vitest';
import { EnvError, envSchema, loadEnv } from '../src/env.ts';
import { AUTH_SECRET, DATA_ENCRYPTION_KEY, NO_STORAGE, PHOTO_URL_SECRET, WEB_ORIGIN } from './support/app.ts';

const REQUIRED = {
  DATABASE_URL: 'postgres://usuario:senha@127.0.0.1:5432/academia',
  PORT: '3001',
  AUTH_SECRET,
  WEB_ORIGIN,
  DATA_ENCRYPTION_KEY,
  PHOTO_URL_SECRET,
  ...NO_STORAGE,
};

test('env_schema_has_no_retention_days_key', () => {
  // os dias de guarda da foto trocada vêm de `privacy_settings` (privacidade, door 4)
  expect(Object.keys(loadEnv(REQUIRED))).not.toContain('PHOTO_VERSION_RETENTION_DAYS');
  expect(Object.keys(envSchema.shape)).not.toContain('PHOTO_VERSION_RETENTION_DAYS');
});

const MAIL_AND_GOOGLE_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const;

test('smtp_and_google_keys_optional_with_defaults', () => {
  expect(MAIL_AND_GOOGLE_KEYS).toHaveLength(8);
  const absent = envSchema.parse(REQUIRED);
  expect(absent.SMTP_PORT).toBe(587);
  expect(absent.SMTP_SECURE).toBe(false);
  expect(absent.SMTP_HOST).toBeUndefined();

  const blank = envSchema.parse({ ...REQUIRED, ...Object.fromEntries(MAIL_AND_GOOGLE_KEYS.map((key) => [key, ''])) });
  expect(blank.SMTP_PORT).toBe(587);
  expect(blank.SMTP_SECURE).toBe(false);
  for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const) {
    expect(blank[key], key).toBeUndefined();
  }

  const smtp = { SMTP_HOST: 'smtp.exemplo.com', MAIL_FROM: 'Academia <no-reply@exemplo.com>' };
  expect(envSchema.safeParse({ ...REQUIRED, ...smtp }).success).toBe(true);
  expect(envSchema.safeParse({ ...REQUIRED, ...smtp, SMTP_USER: 'usuario', SMTP_PASS: 'senha' }).success).toBe(true);
  expect(envSchema.safeParse({ ...REQUIRED, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'segredo' }).success).toBe(true);
});

test('smtp_and_google_seven_refusals_name_the_variable_without_value', () => {
  // o valor de cada variável é único, para a mensagem não poder citá-lo sem o teste ver
  const cases: Array<[label: string, env: Record<string, string>, named: string]> = [
    ['SMTP_HOST sem MAIL_FROM', { SMTP_HOST: 'valor-host-xyz' }, 'MAIL_FROM'],
    ['SMTP_USER sem SMTP_PASS', { SMTP_USER: 'valor-user-xyz' }, 'SMTP_PASS'],
    ['SMTP_PASS sem SMTP_USER', { SMTP_PASS: 'valor-pass-xyz' }, 'SMTP_USER'],
    ['GOOGLE_CLIENT_ID sem o segredo', { GOOGLE_CLIENT_ID: 'valor-id-xyz' }, 'GOOGLE_CLIENT_SECRET'],
    ['GOOGLE_CLIENT_SECRET sem o id', { GOOGLE_CLIENT_SECRET: 'valor-secret-xyz' }, 'GOOGLE_CLIENT_ID'],
    ['SMTP_PORT 0', { SMTP_PORT: '0' }, 'SMTP_PORT'],
    ['SMTP_PORT 70000', { SMTP_PORT: '70000' }, 'SMTP_PORT'],
  ];
  expect(cases).toHaveLength(7);
  for (const [label, env, named] of cases) {
    let error: unknown;
    try {
      loadEnv({ ...REQUIRED, ...env });
    } catch (thrown) {
      error = thrown;
    }
    expect(error, label).toBeInstanceOf(EnvError);
    const message = (error as EnvError).message;
    expect(message, label).toContain(named);
    for (const value of Object.values(env)) expect(message, label).not.toContain(value);
  }
});
