import { expect, test } from 'vitest';
import { privacySettingsSchema, staffExportSchema, studentExportSchema } from '../src/index.ts';

const pathsOf = (result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }) =>
  (result.error?.issues ?? []).map((issue) => issue.path.join('.'));

const STUDENT_ID = '018f0000-0000-7000-8000-000000000001';
const PHOTO = {
  version: 1,
  isCurrent: true,
  createdAt: '2026-10-01T12:00:00.000Z',
  expiresAt: null,
  image: 'data:image/webp;base64,UklGRg==',
};

const studentExport = () => ({
  formatVersion: 1,
  exportedAt: '2026-10-17T12:00:00.000Z',
  subject: 'student',
  student: {
    id: STUDENT_ID,
    name: 'Aluna Exportada',
    cpf: '52998224725',
    birthDate: '1990-05-20',
    sex: null,
    email: null,
    phone: '11912345678',
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    healthNotes: null,
    status: 'inactive',
    createdAt: '2026-01-01T12:00:00.000Z',
    inactivatedAt: '2026-09-01T12:00:00.000Z',
  },
  guardians: [],
  consents: [],
  enrollments: [],
  payments: [],
  checkIns: [],
  photos: [PHOTO],
});

const staffExport = () => ({
  formatVersion: 1,
  exportedAt: '2026-10-17T12:00:00.000Z',
  subject: 'staff',
  staff: {
    id: STUDENT_ID,
    name: 'Funcionária Exportada',
    cpf: '52998224725',
    position: 'Recepcionista',
    department: null,
    hiredAt: '2024-03-01',
    phone: '11912345678',
    email: null,
    status: 'inactive',
    createdAt: '2026-01-01T12:00:00.000Z',
  },
  user: null,
  photos: [PHOTO],
});

test('settings_request_and_export_response_schemas_accept_and_reject', () => {
  // o corpo do `PUT`: os dois limites de cada um, e `null` nos anos
  for (const years of [null, 1, 20]) {
    for (const days of [1, 365]) {
      const body = { inactiveStudentRetentionYears: years, photoVersionRetentionDays: days };
      const result = privacySettingsSchema.safeParse(body);
      expect(result.success, JSON.stringify(body)).toBe(true);
      expect(result.data).toEqual(body);
    }
  }

  const valid = { inactiveStudentRetentionYears: 5, photoVersionRetentionDays: 30 };
  const refused: Array<[label: string, body: Record<string, unknown>, path: string]> = [
    ['sem anos', { photoVersionRetentionDays: 30 }, 'inactiveStudentRetentionYears'],
    ['sem dias', { inactiveStudentRetentionYears: 5 }, 'photoVersionRetentionDays'],
    ['chave a mais', { ...valid, extra: 1 }, 'extra'],
    ['anos 0', { ...valid, inactiveStudentRetentionYears: 0 }, 'inactiveStudentRetentionYears'],
    ['anos 21', { ...valid, inactiveStudentRetentionYears: 21 }, 'inactiveStudentRetentionYears'],
    ['anos 1.5', { ...valid, inactiveStudentRetentionYears: 1.5 }, 'inactiveStudentRetentionYears'],
    ['anos "5"', { ...valid, inactiveStudentRetentionYears: '5' }, 'inactiveStudentRetentionYears'],
    ['dias 0', { ...valid, photoVersionRetentionDays: 0 }, 'photoVersionRetentionDays'],
    ['dias 366', { ...valid, photoVersionRetentionDays: 366 }, 'photoVersionRetentionDays'],
    ['dias 1.5', { ...valid, photoVersionRetentionDays: 1.5 }, 'photoVersionRetentionDays'],
    ['dias null', { ...valid, photoVersionRetentionDays: null }, 'photoVersionRetentionDays'],
    ['dias "30"', { ...valid, photoVersionRetentionDays: '30' }, 'photoVersionRetentionDays'],
  ];
  expect(refused).toHaveLength(12);
  for (const [label, body, path] of refused) {
    const result = privacySettingsSchema.safeParse(body);
    expect(result.success, label).toBe(false);
    expect(pathsOf(result), label).toEqual([path]);
  }

  // as duas exportações: o exemplo passa, e uma chave a mais no topo ou no titular, ou outra versão, não
  const exports = [
    ['student', studentExportSchema, studentExport] as const,
    ['staff', staffExportSchema, staffExport] as const,
  ];
  for (const [subject, schema, sample] of exports) {
    expect(schema.safeParse(sample()).success, subject).toBe(true);

    const extraTop = { ...sample(), extra: 1 };
    expect(schema.safeParse(extraTop).success, `${subject}: chave a mais no topo`).toBe(false);

    const extraSubject = sample() as Record<string, unknown>;
    extraSubject[subject] = { ...(extraSubject[subject] as object), extra: 1 };
    expect(schema.safeParse(extraSubject).success, `${subject}: chave a mais em ${subject}`).toBe(false);

    for (const formatVersion of [0, 2, '1']) {
      expect(schema.safeParse({ ...sample(), formatVersion }).success, `${subject}: formatVersion ${String(formatVersion)}`).toBe(false);
    }
  }
});
