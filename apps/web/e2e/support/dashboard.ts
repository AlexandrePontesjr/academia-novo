import type { DashboardResponse, ExpiringEnrollment, PlanPeriod, Role } from '@academia/contracts';
import type { Locator, Page } from '@playwright/test';
import { type FakeApi, type Recorded, sessionOf } from './fake-api.ts';

export { spaced, textsOf } from './plans.ts';

export const ALL_ROLES: Role[] = ['admin', 'hr_finance', 'reception', 'instructor'];

/** Os títulos dos cinco cards, na ordem da tela. */
export const CARD_TITLES = ['Alunos', 'Matrículas', 'Vencimentos nos próximos 7 dias', 'Pagamentos', 'Matrículas ativas por plano'];

const id = (group: string, n: number) => `018f0000-0000-7000-8000-000000000${group}${String(n).padStart(2, '0')}`;

export const planOf = (n: number, name: string, period: PlanPeriod = 'monthly') => ({ id: id('9', n), name, period });

let expiring = 0;
/** Um período que vence na janela: de `Ana Souza`, no "Mensal", em `2026-10-10`. */
export function expiringOf(overrides: Partial<ExpiringEnrollment> = {}): ExpiringEnrollment {
  expiring += 1;
  return {
    enrollmentId: id('e', expiring),
    student: { id: id('6', expiring), name: 'Ana Souza' },
    plan: planOf(1, 'Mensal'),
    endsAt: '2026-10-10',
    ...overrides,
  };
}

type Enrollments = NonNullable<DashboardResponse['enrollments']>;

/**
 * A resposta de quatro chaves, com números que não coincidem entre si nem com o que a máquina
 * calcularia das listas: a tela só mostra o que recebe.
 */
export function dashboardOf(overrides: Partial<DashboardResponse> = {}, enrollments: Partial<Enrollments> = {}): DashboardResponse {
  return {
    today: '2026-10-07',
    students: { active: 31, inactive: 4, suspended: 2 },
    enrollments: {
      active: 27,
      scheduled: 6,
      expiringSoon: { days: 7, items: [expiringOf()] },
      byPlan: [{ plan: planOf(1, 'Mensal'), active: 19 }],
      ...enrollments,
    },
    payments: { pending: 9, overdue: 4 },
    ...overrides,
  };
}

/** A mesma resposta cortada como a API a corta para o perfil: a chave do card que ele não lê não existe. */
export function dashboardFor(role: Role, body: DashboardResponse = dashboardOf()): DashboardResponse {
  const { today, students, enrollments, payments } = body;
  if (role === 'instructor') return { today, students };
  if (role === 'reception') return { today, students, enrollments };
  return { today, students, enrollments, payments };
}

/** Abre a sessão do perfil e faz `GET /api/dashboard` devolver exatamente `body`. */
export function serveDashboard(api: FakeApi, role: Role, body: DashboardResponse = dashboardFor(role)) {
  api.session = sessionOf(role);
  api.on('GET', '/api/dashboard', { status: 200, body });
}

/** As requisições, de qualquer método, a `/api/dashboard*`. */
export const dashboardRequests = (api: FakeApi): Recorded[] =>
  api.requests.filter((request) => request.path.startsWith('/api/dashboard'));

/** Um card é uma região com o título dele por nome. */
export const card = (page: Page, title: string) => page.getByRole('region', { name: title, exact: true });

/** Os títulos dos cards na ordem em que a tela os mostra. */
export const cardTitles = (page: Page) => page.getByRole('main').getByRole('heading', { level: 3 }).allTextContents();

/** O valor mostrado sob um rótulo: o `dd` que segue o `dt` de texto igual. */
export const under = (scope: Locator, label: string) =>
  scope.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]');

export const column = (scope: Locator, n: number) => scope.locator(`tbody tr td:nth-child(${n})`);
