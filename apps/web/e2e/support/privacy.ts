import type { Role, StaffExport, StudentExport } from '@academia/contracts';
import { type FakeApi, PNG_1X1, type Recorded } from './fake-api.ts';
import { paymentsStateOf, servePaymentsFicha } from './payments.ts';
import { STUDENT_ID, studentOf } from './plans.ts';
import { STAFF_ID, staffOf, serveStaffAs } from './staff.ts';

export { NO_PERMISSION } from './plans.ts';
export { STAFF_ID, STUDENT_ID };

export const ANONYMIZE_TEXT =
  'Os dados pessoais, as fotos, os responsáveis e os consentimentos serão apagados. Matrículas, pagamentos e presenças ficam sem identificação. Isto não pode ser desfeito.';

/** Uma imagem que o navegador desenha: um PNG de 1 × 1 como `data:` (a tela não confere o tipo). */
export const IMAGE = `data:image/webp;base64,${PNG_1X1.toString('base64')}`;
export const IMAGE_2 = `data:image/webp;base64,${Buffer.concat([PNG_1X1, Buffer.from([0])]).toString('base64')}`;

/** A exportação de um aluno com uma linha em cada coleção, salvo o que o teste trocar. */
export function studentExportOf(overrides: Partial<StudentExport> = {}, student: Partial<StudentExport['student']> = {}): StudentExport {
  return {
    formatVersion: 1,
    exportedAt: '2026-10-07T15:00:00.000Z',
    subject: 'student',
    student: {
      id: STUDENT_ID,
      name: 'Rafaela Prado Cunha',
      cpf: '52998224725',
      birthDate: '1990-11-30',
      sex: 'female',
      email: 'rafaela@exemplo.com',
      phone: '11987654321',
      address: 'Rua das Acácias, 120',
      emergencyContactName: 'Maria da Penha',
      emergencyContactPhone: '1134567890',
      healthNotes: 'Hipertensão controlada.',
      status: 'inactive',
      createdAt: '2026-01-05T12:00:00.000Z',
      inactivatedAt: '2026-09-10T12:00:00.000Z',
      ...student,
    },
    guardians: [
      {
        id: '018f0000-0000-7000-8000-000000000a01',
        name: 'Joana Prado',
        cpf: '11144477735',
        phone: '11912345678',
        relationship: 'mother',
        createdAt: '2026-01-05T12:00:00.000Z',
      },
    ],
    consents: [
      {
        purpose: 'image_use',
        termVersion: 1,
        termText: 'Autorizo o uso da minha imagem.',
        grantedBy: 'guardian',
        grantedAt: '2026-01-06T12:00:00.000Z',
        revokedAt: null,
      },
    ],
    enrollments: [
      {
        id: '018f0000-0000-7000-8000-000000000a02',
        planName: 'Mensal Plus',
        startsAt: '2026-08-01',
        endsAt: '2026-08-31',
        priceCents: 9990,
        cancelledAt: null,
      },
    ],
    payments: [{ startsAt: '2026-08-01', createdAt: '2026-08-02T13:00:00.000Z', voidedAt: null }],
    checkIns: [{ day: '2026-08-05', checkedInAt: '2026-08-05T12:00:00.000Z' }],
    photos: [
      { version: 1, isCurrent: false, createdAt: '2026-02-01T12:00:00.000Z', expiresAt: '2026-11-01T12:00:00.000Z', image: IMAGE },
      { version: 2, isCurrent: true, createdAt: '2026-03-01T12:00:00.000Z', expiresAt: null, image: IMAGE_2 },
    ],
    ...overrides,
  };
}

/** A exportação de um funcionário, com usuário vinculado e uma foto, salvo o que o teste trocar. */
export function staffExportOf(overrides: Partial<StaffExport> = {}): StaffExport {
  return {
    formatVersion: 1,
    exportedAt: '2026-10-07T15:00:00.000Z',
    subject: 'staff',
    staff: {
      id: STAFF_ID,
      name: 'Rafaela Prado Cunha',
      cpf: '52998224725',
      position: 'Fisioterapeuta Esportiva',
      department: 'Reabilitação',
      hiredAt: '2021-03-15',
      phone: '11912345678',
      email: 'rafaela.prado@exemplo.com',
      status: 'inactive',
      createdAt: '2021-03-15T12:00:00.000Z',
    },
    user: { email: 'rafaela.usuario@exemplo.com', role: 'instructor' },
    photos: [{ version: 1, isCurrent: true, createdAt: '2026-03-01T12:00:00.000Z', expiresAt: null, image: IMAGE }],
    ...overrides,
  };
}

export const studentExportPath = `/api/students/${STUDENT_ID}/data-export`;
export const studentAnonymizationPath = `/api/students/${STUDENT_ID}/anonymization`;
export const staffExportPath = `/api/staff/${STAFF_ID}/data-export`;
export const staffAnonymizationPath = `/api/staff/${STAFF_ID}/anonymization`;

/** A exportação como a API a entrega: o anexo com o nome dado e o corpo. */
export const attachment = (body: unknown, filename: string) => ({
  status: 200,
  body,
  headers: { 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' },
});

/** A ficha do aluno de teste para o perfil dado, com os blocos que ele vê de pé. */
export function serveStudentFicha(api: FakeApi, role: Role) {
  servePaymentsFicha(api, role, paymentsStateOf(), studentOf({ status: 'inactive' }));
}

/** A ficha do funcionário de teste para o perfil dado. */
export function serveStaffFicha(api: FakeApi, role: Role) {
  serveStaffAs(api, role, { staff: [staffOf({ status: 'inactive' })], users: [] });
}

/** "Requisição de privacidade": qualquer requisição a uma rota de exportação ou de anonimização. */
export const privacyRequests = (api: FakeApi): Recorded[] =>
  api.requests.filter((request) => /\/(data-export|anonymization)$/.test(request.path));
