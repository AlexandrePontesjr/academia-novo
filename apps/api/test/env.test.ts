import { expect, test } from 'vitest';
import { envSchema, loadEnv } from '../src/env.ts';
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
