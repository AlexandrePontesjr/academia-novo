import { expect, test } from 'vitest';
import { EnvError, loadEnv } from '../src/env.ts';
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

test('retention_days_default_30_bounds_1_and_365_and_five_rejected_values', () => {
  expect(loadEnv(REQUIRED).PHOTO_VERSION_RETENTION_DAYS).toBe(30);

  const accepted: Array<[value: string, days: number]> = [
    ['1', 1],
    ['7', 7],
    ['365', 365],
  ];
  for (const [value, days] of accepted) {
    expect(loadEnv({ ...REQUIRED, PHOTO_VERSION_RETENTION_DAYS: value }).PHOTO_VERSION_RETENTION_DAYS, value).toBe(days);
  }

  const rejected = ['0', '366', '1.5', 'abc', '-1'];
  for (const value of rejected) {
    let error: unknown;
    try {
      loadEnv({ ...REQUIRED, PHOTO_VERSION_RETENTION_DAYS: value });
    } catch (caught) {
      error = caught;
    }
    expect(error, value).toBeInstanceOf(EnvError);
    expect((error as EnvError).invalid, value).toContain('PHOTO_VERSION_RETENTION_DAYS');
    expect((error as EnvError).message, value).not.toContain(value);
  }
});
