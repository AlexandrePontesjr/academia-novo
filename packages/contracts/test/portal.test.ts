import { expect, test } from 'vitest';
import {
  consumePasswordTokenRequestSchema,
  firstAccessRequestSchema,
  myProfileSchema,
  PASSWORD_MAX_LENGTH,
  passwordResetRequestSchema,
  STAFF_ROLES,
  studentDetailSchema,
  updateMyProfileRequestSchema,
  USER_ROLES,
} from '../src/index.ts';

const paths = (result: { error?: { issues: Array<{ path: PropertyKey[] }> } }) =>
  result.error?.issues.map((issue) => issue.path.join('.')) ?? [];

test('user_roles_five_and_staff_roles_four_in_order', () => {
  expect(USER_ROLES).toEqual(['admin', 'reception', 'hr_finance', 'instructor', 'student']);
  expect(STAFF_ROLES).toEqual(['admin', 'reception', 'hr_finance', 'instructor']);
});

test('portal_schemas_accept_and_reject', () => {
  // primeiro acesso: CPF com e sem máscara, e-mail aparado e em minúsculas
  for (const cpf of ['529.982.247-25', '52998224725']) {
    const parsed = firstAccessRequestSchema.safeParse({ cpf, email: '  Ana@Example.COM ' });
    expect(parsed.success, cpf).toBe(true);
    expect(parsed.data).toEqual({ cpf: '52998224725', email: 'ana@example.com' });
  }
  const firstAccess: Array<[label: string, body: Record<string, unknown>, path: string]> = [
    ['cpf com dígito errado', { cpf: '529.982.247-26', email: 'ana@example.com' }, 'cpf'],
    ['cpf de 10 dígitos', { cpf: '5299822472', email: 'ana@example.com' }, 'cpf'],
    ['cpf ausente', { email: 'ana@example.com' }, 'cpf'],
    ['email ana@', { cpf: '52998224725', email: 'ana@' }, 'email'],
    ['email ausente', { cpf: '52998224725' }, 'email'],
  ];
  for (const [label, body, path] of firstAccess) {
    const result = firstAccessRequestSchema.safeParse(body);
    expect(result.success, label).toBe(false);
    expect(paths(result), label).toEqual([path]);
  }

  // consumo: as bordas da senha
  const password = (length: number) => 'a'.repeat(length);
  for (const length of [12, PASSWORD_MAX_LENGTH]) {
    expect(consumePasswordTokenRequestSchema.safeParse({ token: 't1', password: password(length) }).success, String(length)).toBe(true);
  }
  for (const length of [11, PASSWORD_MAX_LENGTH + 1]) {
    const result = consumePasswordTokenRequestSchema.safeParse({ token: 't1', password: password(length) });
    expect(result.success, String(length)).toBe(false);
    expect(paths(result), String(length)).toEqual(['password']);
  }

  // redefinição
  expect(passwordResetRequestSchema.safeParse({ email: 'ana@example.com' }).success).toBe(true);
  const reset = passwordResetRequestSchema.safeParse({ email: 'ana@' });
  expect(reset.success).toBe(false);
  expect(paths(reset)).toEqual(['email']);

  // `PATCH /api/me/profile`: vazio e cada uma das quatro chaves sozinha
  const contact = {
    phone: '11912345678',
    address: 'Rua A, 1',
    emergencyContactName: 'Bia',
    emergencyContactPhone: '11987654321',
  };
  expect(updateMyProfileRequestSchema.safeParse({}).success).toBe(true);
  for (const [key, value] of Object.entries(contact)) {
    expect(updateMyProfileRequestSchema.safeParse({ [key]: value }).success, key).toBe(true);
  }
  const forbidden: Record<string, unknown> = {
    email: 'ana@example.com',
    cpf: '52998224725',
    name: 'Ana',
    birthDate: '2000-01-01',
    sex: 'female',
    healthNotes: 'nada',
    status: 'active',
    guardian: { name: 'Bia', cpf: '12345678909', phone: '11912345678', relationship: 'mother' },
  };
  for (const [key, value] of Object.entries(forbidden)) {
    const result = updateMyProfileRequestSchema.safeParse({ [key]: value });
    expect(result.success, key).toBe(false);
    expect(paths(result), key).toEqual([key]);
  }

  // a resposta do perfil: as onze chaves da `Surface`, nunca `healthNotes`
  const profile = {
    name: 'Ana Souza',
    cpf: '52998224725',
    birthDate: '2000-01-01',
    email: 'ana@example.com',
    phone: '11912345678',
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    status: 'active',
    photoUrl: null,
    pendingPhoto: null,
  };
  expect(Object.keys(profile)).toHaveLength(11);
  expect(myProfileSchema.safeParse(profile).success).toBe(true);
  expect(myProfileSchema.safeParse({ ...profile, healthNotes: null }).success).toBe(false);
});

test('student_schema_gains_portal_and_pending_photo', () => {
  const student = { id: '019a0000-0000-7000-8000-000000000001', name: 'Ana Souza', status: 'active' };
  const pendingPhoto = { id: '019a0000-0000-7000-8000-000000000002', version: 2, createdAt: '2026-10-28T13:05:00.000Z' };
  for (const portal of ['none', 'pending', 'active', 'disabled']) {
    expect(studentDetailSchema.safeParse({ ...student, portal, pendingPhoto: null }).success, portal).toBe(true);
  }
  expect(studentDetailSchema.safeParse({ ...student, portal: 'active', pendingPhoto }).success).toBe(true);
  expect(studentDetailSchema.safeParse({ ...student, portal: 'invited', pendingPhoto: null }).success).toBe(false);
  expect(studentDetailSchema.safeParse({ ...student, pendingPhoto: null }).success).toBe(false);
});
