import { expect, test } from 'vitest';
import { healthResponseSchema, problemSchema } from '../src/index.ts';

test('health schema accepts the two documented bodies', () => {
  expect(healthResponseSchema.safeParse({ status: 'ok', checks: { database: 'up' } }).success).toBe(true);
  expect(healthResponseSchema.safeParse({ status: 'degraded', checks: { database: 'down' } }).success).toBe(true);
});

test('health schema rejects an unknown status and a missing check', () => {
  expect(healthResponseSchema.safeParse({ status: 'fine', checks: { database: 'up' } }).success).toBe(false);
  expect(healthResponseSchema.safeParse({ status: 'ok', checks: {} }).success).toBe(false);
});

test('problem schema requires type, title, status, code and requestId', () => {
  const problem = { type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found', requestId: 'abc' };
  expect(problemSchema.safeParse(problem).success).toBe(true);
  for (const key of Object.keys(problem)) {
    const withoutKey = Object.fromEntries(Object.entries(problem).filter(([k]) => k !== key));
    expect(problemSchema.safeParse(withoutKey).success, key).toBe(false);
  }
});

test('problem code must be snake_case', () => {
  const problem = { type: 'about:blank', title: 'Not Found', status: 404, requestId: 'abc' };
  expect(problemSchema.safeParse({ ...problem, code: 'NotFound' }).success).toBe(false);
  expect(problemSchema.safeParse({ ...problem, code: 'validation_failed' }).success).toBe(true);
});

test('problem schema accepts validation errors with path and message', () => {
  const result = problemSchema.safeParse({
    type: 'about:blank',
    title: 'Bad Request',
    status: 400,
    code: 'validation_failed',
    requestId: 'abc',
    errors: [{ path: 'email', message: 'obrigatório' }],
  });
  expect(result.success).toBe(true);
});
