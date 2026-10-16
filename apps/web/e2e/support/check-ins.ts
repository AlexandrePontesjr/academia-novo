import type {
  CheckInsReport,
  CheckInStatus,
  ReportCheckIn,
  Role,
  StudentCheckIn,
  StudentListItem,
} from '@academia/contracts';
import { type FakeApi, type Recorded, servePhotoFile, sessionOf } from './fake-api.ts';

export { NO_PERMISSION, spaced, STUDENT_ID, textsOf } from './plans.ts';

/** Quem registra presença e lê o histórico e o relatório, e quem não (PRD §2). */
export const CHECK_IN_ROLES: Role[] = ['admin', 'reception'];
export const NO_CHECK_IN_ROLES: Role[] = ['hr_finance', 'instructor'];

/** Um instante cujo dia UTC é outro: `23:30` do dia 07 em `America/Sao_Paulo` (decisão 6 da Intent). */
export const LATE = '2026-10-08T02:30:00.000Z';

export const idOf = (group: string, n: number) => `018f0000-0000-7000-8000-0000000${group}${String(n).padStart(3, '0')}`;

/** Um aluno da lista da busca, com a miniatura. */
export function listItemOf(n: number, overrides: Partial<StudentListItem> = {}): StudentListItem {
  return {
    id: idOf('61', n),
    name: `Aluno ${n}`,
    status: 'active',
    cpf: '52998224725',
    phone: '11987654321',
    photoUrl: `/api/files/thumb-${n}.png`,
    ...overrides,
  };
}

/** A situação de um aluno liberado, sem presença hoje, no "Mensal Plus" que vence em `2026-10-14`. */
export function statusOf(studentId: string, overrides: Partial<CheckInStatus> = {}): CheckInStatus {
  return {
    today: '2026-10-07',
    student: { id: studentId, name: 'Rafaela Prado Cunha', status: 'active' },
    photoUrl: `/api/files/large-${studentId}.png`,
    access: 'allowed',
    blockReasons: [],
    enrollment: {
      id: idOf('a1', 1),
      plan: { id: idOf('91', 1), name: 'Mensal Plus', period: 'monthly' },
      startsAt: '2026-09-15',
      endsAt: '2026-10-14',
    },
    checkedInAt: null,
    ...overrides,
  };
}

/** Serve uma imagem de verdade em cada URL de foto dada: uma que não carrega vira as iniciais. */
export function servePhotos(api: FakeApi, urls: Array<string | null | undefined>) {
  for (const url of urls) if (url) servePhotoFile(api, url);
}

/** Abre a sessão do perfil e faz a busca devolver `items`, qualquer que seja o `q`. */
export function serveSearch(api: FakeApi, role: Role, items: StudentListItem[]) {
  api.session = sessionOf(role);
  api.on('GET', '/api/students', { status: 200, body: { items, nextCursor: null } });
}

export const statusPath = (studentId: string) => `/api/students/${studentId}/check-in-status`;
export const checkInsPath = (studentId: string) => `/api/students/${studentId}/check-ins`;

/** Uma presença do histórico, registrada por `Paula Recepção`. */
export function historyItemOf(n: number, overrides: Partial<StudentCheckIn> = {}): StudentCheckIn {
  return {
    id: idOf('c1', n),
    day: '2026-10-07',
    checkedInAt: '2026-10-07T15:00:00.000Z',
    checkedInBy: { id: idOf('11', 1), name: 'Paula Recepção' },
    ...overrides,
  };
}

/** Uma presença do relatório, de `Ana Souza`, registrada por `Paula Recepção`. */
export function reportItemOf(n: number, overrides: Partial<ReportCheckIn> = {}): ReportCheckIn {
  return {
    id: idOf('c2', n),
    day: '2026-10-07',
    checkedInAt: '2026-10-07T15:00:00.000Z',
    student: { id: idOf('62', n), name: `Ana Souza ${n}` },
    checkedInBy: { id: idOf('11', 1), name: 'Paula Recepção' },
    ...overrides,
  };
}

export function reportOf(overrides: Partial<CheckInsReport> = {}): CheckInsReport {
  return { from: '2026-10-07', to: '2026-10-07', total: 0, items: [], nextCursor: null, ...overrides };
}

/** "Requisição de check-in": qualquer requisição a uma rota de presença, do aluno ou do relatório. */
export const checkInRequests = (api: FakeApi): Recorded[] =>
  api.requests.filter((request) => /\/check-in/.test(request.path));

/** As requisições, de qualquer método, a `/api/check-ins*` (o relatório). */
export const reportRequests = (api: FakeApi): Recorded[] =>
  api.requests.filter((request) => request.path === '/api/check-ins' || request.path.startsWith('/api/check-ins/'));

/** As requisições a `/api/students` e abaixo dele. */
export const studentRequests = (api: FakeApi): Recorded[] =>
  api.requests.filter((request) => request.path.startsWith('/api/students'));
