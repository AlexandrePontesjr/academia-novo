import { expect, test } from 'vitest';
import { createLeadRequestSchema, leadsResponseSchema, updateLeadRequestSchema } from '../src/index.ts';

test('lead_schemas_accept_and_reject', () => {
  const valid = { name: 'Ana Souza', email: 'ana@example.com', phone: '11987654321', adult: true, termVersion: 1 };
  expect(createLeadRequestSchema.safeParse(valid).success).toBe(true);
  expect(createLeadRequestSchema.safeParse({ ...valid, website: '' }).success).toBe(true);

  // a falta de cada um dos cinco
  for (const field of ['name', 'email', 'phone', 'adult', 'termVersion'] as const) {
    const missing: Record<string, unknown> = { ...valid };
    delete missing[field];
    const result = createLeadRequestSchema.safeParse(missing);
    expect(result.success, `sem ${field}`).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.')), `sem ${field}`).toContain(field);
  }
  const refused: Array<[label: string, body: Record<string, unknown>, path: string]> = [
    ['adult false', { ...valid, adult: false }, 'adult'],
    ['adult "true"', { ...valid, adult: 'true' }, 'adult'],
    ['termVersion 0', { ...valid, termVersion: 0 }, 'termVersion'],
    ['termVersion 1.5', { ...valid, termVersion: 1.5 }, 'termVersion'],
  ];
  for (const [label, body, path] of refused) {
    const result = createLeadRequestSchema.safeParse(body);
    expect(result.success, label).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.')), label).toEqual([path]);
  }

  const parsed = createLeadRequestSchema.parse({ ...valid, email: '  Ana@Example.COM ', phone: '(11) 98765-4321' });
  expect(parsed.email).toBe('ana@example.com');
  expect(parsed.phone).toBe('11987654321');

  for (const status of ['new', 'contacted', 'discarded']) {
    expect(updateLeadRequestSchema.safeParse({ status }).success, status).toBe(true);
  }
  for (const status of ['converted', 'New', '']) {
    expect(updateLeadRequestSchema.safeParse({ status }).success, status).toBe(false);
  }

  const item = {
    id: '019a0000-0000-7000-8000-000000000001',
    name: 'Ana Souza',
    email: 'ana@example.com',
    phone: '11987654321',
    source: 'form',
    status: 'new',
    emailVerified: false,
    createdAt: '2026-10-22T13:05:00.000Z',
    studentId: null,
  };
  expect(Object.keys(item)).toHaveLength(9);
  expect(leadsResponseSchema.safeParse({ items: [item] }).success).toBe(true);
  expect(leadsResponseSchema.safeParse({ items: [{ ...item, status: 'lead' }] }).success).toBe(false);
});
