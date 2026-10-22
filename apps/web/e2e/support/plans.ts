import {
  type Enrollment,
  enrollmentEndsAt,
  enrollmentStatus,
  type Plan,
  type Role,
  type Student,
} from '@academia/contracts';
import type { Locator } from '@playwright/test';
import { type FakeApi, problem, type Recorded, serveConsents, sessionOf, termsOf } from './fake-api.ts';

export const PLAN_ID = '018f0000-0000-7000-8000-000000000901';
export const STUDENT_ID = '018f0000-0000-7000-8000-000000000601';

/** Quem lê planos e matrículas, e quem os escreve (PRD §2). */
export const PLAN_READERS: Role[] = ['admin', 'hr_finance', 'reception'];
export const PLAN_WRITERS: Role[] = ['admin', 'hr_finance'];

export const NO_PERMISSION = 'Você não tem permissão para acessar esta página.';

/** O "Mensal" de teste: `monthly` a `9990`. */
export function planOf(overrides: Partial<Plan> = {}): Plan {
  return { id: PLAN_ID, name: 'Mensal', period: 'monthly', priceCents: 9990, rules: null, status: 'active', ...overrides };
}

let enrollments = 0;
/** O contador dos ids de matrícula, lido e reposto pela prova que compara com um baseline (motion, C39). */
export const enrollmentIds = { get: () => enrollments, set: (value: number) => void (enrollments = value) };
/** Uma matrícula no "Mensal", de `2026-10-07` a `2026-11-06`, ativa. */
export function enrollmentOf(overrides: Partial<Enrollment> = {}): Enrollment {
  enrollments += 1;
  return {
    id: `018f0000-0000-7000-8000-000000000a${String(enrollments).padStart(2, '0')}`,
    plan: { id: PLAN_ID, name: 'Mensal', period: 'monthly' },
    startsAt: '2026-10-07',
    endsAt: '2026-11-06',
    priceCents: 9990,
    status: 'active',
    createdAt: '2026-10-07T15:00:00.000Z',
    cancelledAt: null,
    ...overrides,
  };
}

export function studentOf(overrides: Partial<Student> = {}): Student {
  return {
    id: STUDENT_ID,
    name: 'Rafaela Prado Cunha',
    status: 'active',
    cpf: '52998224725',
    birthDate: '1990-11-30',
    sex: 'female',
    email: null,
    phone: '11987654321',
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    healthNotes: null,
    ...overrides,
  };
}

/** O que a API falsa sabe: os planos e as matrículas de cada aluno, na ordem em que as listas os devolvem. */
export interface PlansState {
  plans: Plan[];
  enrollments: Record<string, Enrollment[]>;
  /** O dia em `America/Sao_Paulo` e o instante que a API falsa usa na situação, em `createdAt` e em `cancelledAt`. */
  today: string;
  now: string;
}

export const stateOf = (overrides: Partial<PlansState> = {}): PlansState => ({
  plans: [planOf()],
  enrollments: {},
  today: '2026-10-07',
  now: '2026-10-07T15:00:00.000Z',
  ...overrides,
});

/**
 * Responde às quatro rotas de plano e às três de matrícula com o estado dado, que cada escrita muda
 * como a API mudaria: a leitura seguinte devolve o que a escrita deixou. Como a API real, `401` sem
 * sessão, `403` com `forbidden` para o Instrutor em tudo e para a Recepção nas escritas. As rotas de
 * `api.on` têm precedência: o teste troca a resposta de uma rota sem perder as outras.
 */
export function servePlans(api: FakeApi, state: PlansState) {
  let created = 0;
  const denied = (request: Recorded) => {
    const role = api.session?.user.role;
    if (!role) return problem(401, 'unauthorized');
    if (role === 'instructor' || (role === 'reception' && request.method !== 'GET')) return problem(403, 'forbidden');
    return undefined;
  };

  api.onPrefix('/api/plans', (request) => {
    const refusal = denied(request);
    if (refusal) return refusal;
    const match = /^\/api\/plans(?:\/([^/]+))?$/.exec(request.path);
    if (!match) return problem(404, 'not_found');
    const id = match[1];
    if (!id) {
      if (request.method === 'GET') return { status: 200, body: { items: state.plans } };
      if (request.method !== 'POST') return problem(404, 'not_found');
      const body = request.body as Pick<Plan, 'name' | 'period' | 'priceCents'> & { rules?: string };
      created += 1;
      const plan = planOf({
        id: `018f0000-0000-7000-8000-0000000009${String(10 + created).padStart(2, '0')}`,
        name: body.name,
        period: body.period,
        priceCents: body.priceCents,
        rules: body.rules ?? null,
      });
      state.plans.push(plan);
      return { status: 201, body: plan };
    }

    const plan = state.plans.find((candidate) => candidate.id === id);
    if (!plan) return problem(404, 'not_found');
    if (request.method === 'PATCH') {
      Object.assign(plan, request.body);
      return { status: 200, body: plan };
    }
    if (request.method === 'DELETE') {
      plan.status = 'inactive';
      return { status: 204 };
    }
    return problem(404, 'not_found');
  });

  api.onPrefix('/api/students', (request) => {
    const match = /^\/api\/students\/([^/]+)\/enrollments(?:\/([^/]+))?$/.exec(request.path);
    if (!match) return problem(404, 'not_found');
    const refusal = denied(request);
    if (refusal) return refusal;
    const [, studentId = '', enrollmentId] = match;
    const items = state.enrollments[studentId] ?? [];

    if (enrollmentId) {
      const found = items.find((item) => item.id === enrollmentId);
      if (!found || request.method !== 'DELETE') return problem(404, 'not_found');
      if (found.cancelledAt === null) Object.assign(found, { cancelledAt: state.now, status: 'cancelled' });
      return { status: 204 };
    }
    if (request.method === 'GET') return { status: 200, body: { items } };
    if (request.method !== 'POST') return problem(404, 'not_found');

    const { planId, startsAt } = request.body as { planId: string; startsAt: string };
    const plan = state.plans.find((candidate) => candidate.id === planId);
    if (!plan) return problem(422, 'validation_failed', [{ path: 'planId', message: 'Escolha um plano válido.' }]);
    if (plan.status === 'inactive') return problem(409, 'plan_inactive');
    const endsAt = enrollmentEndsAt(startsAt, plan.period);
    if (items.some((item) => item.cancelledAt === null && item.startsAt <= endsAt && startsAt <= item.endsAt)) {
      return problem(409, 'enrollment_overlap');
    }
    const enrollment = enrollmentOf({
      plan: { id: plan.id, name: plan.name, period: plan.period },
      startsAt,
      endsAt,
      priceCents: plan.priceCents,
      status: enrollmentStatus({ startsAt, endsAt, cancelledAt: null }, state.today),
      createdAt: state.now,
    });
    // a API devolve da mais recente para a mais antiga
    state.enrollments[studentId] = [enrollment, ...items].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    return { status: 201, body: enrollment };
  });
}

/** Uma sessão do perfil dado com a API falsa de planos e matrículas de pé. */
export function servePlansAs(api: FakeApi, role: Role, state: PlansState) {
  api.session = sessionOf(role);
  servePlans(api, state);
}

/**
 * A ficha de um aluno para o perfil dado, com planos e matrículas de pé. O Instrutor recebe só o que a
 * API lhe dá (`id`, `name`, `status`); quem vê o bloco de consentimentos recebe um vazio.
 */
export function serveFicha(api: FakeApi, role: Role, student: Student, state: PlansState) {
  servePlansAs(api, role, state);
  const { id, name, status } = student;
  api.on('GET', `/api/students/${id}`, { status: 200, body: role === 'instructor' ? { id, name, status } : student });
  if (role === 'admin' || role === 'reception') {
    serveConsents(api, id, { guardian: null, items: [], terms: termsOf(), now: state.now });
  }
}

/** "Requisição de plano": qualquer requisição, de qualquer método, a `/api/plans*`. */
export const planRequests = (api: FakeApi): Recorded[] => api.requests.filter((request) => request.path.startsWith('/api/plans'));

/** "Requisição de matrícula": qualquer requisição, de qualquer método, a `/api/students/<id>/enrollments*`. */
export const enrollmentRequests = (api: FakeApi, studentId: string = STUDENT_ID): Recorded[] =>
  api.requests.filter((request) => request.path.startsWith(`/api/students/${studentId}/enrollments`));

/** O `Intl` de `pt-BR` escreve U+00A0 entre `R$` e o número: a prova compara com espaço comum. */
export const spaced = (text: string) => text.replaceAll(String.fromCharCode(0xa0), ' ');

/** Os textos de um conjunto de elementos, com o espaço normalizado. */
export const textsOf = async (locator: Locator) => (await locator.allTextContents()).map(spaced);
