import { type OpenPayment, paymentStatus, type Role, type StudentPayment } from '@academia/contracts';
import { type FakeApi, problem, type Recorded, sessionOf } from './fake-api.ts';
import { PLAN_ID, serveFicha, type PlansState, STUDENT_ID, studentOf } from './plans.ts';

export { NO_PERMISSION, spaced, STUDENT_ID, textsOf } from './plans.ts';

/** Quem lê a situação de pagamento e quem confirma e desfaz: os perfis do Financeiro (PRD §2). */
export const PAYMENT_ROLES: Role[] = ['admin', 'hr_finance'];
export const NO_PAYMENT_ROLES: Role[] = ['reception', 'instructor'];

let periods = 0;
/** Os contadores de ids deste arquivo, lidos e repostos pela prova que compara com um baseline (motion, C39). */
export const paymentIds = {
  get: () => ({ periods, confirmations, openIds }),
  set: (value: { periods: number; confirmations: number; openIds: number }) => {
    ({ periods, confirmations, openIds } = value);
  },
};
/** Um período do "Mensal", de `2026-10-07` a `2026-11-06`, a `9990`, ainda sem pagamento. */
export function periodOf(overrides: Partial<StudentPayment> = {}): StudentPayment {
  periods += 1;
  const startsAt = overrides.startsAt ?? '2026-10-07';
  return {
    enrollmentId: `018f0000-0000-7000-8000-000000000b${String(periods).padStart(2, '0')}`,
    plan: { id: PLAN_ID, name: 'Mensal', period: 'monthly' },
    startsAt,
    endsAt: '2026-11-06',
    dueDate: startsAt,
    priceCents: 9990,
    status: 'pending',
    payment: null,
    ...overrides,
  };
}

let confirmations = 0;
/** A confirmação viva de um período. */
export function confirmationOf(createdAt = '2026-10-07T15:00:00.000Z') {
  confirmations += 1;
  return { id: `018f0000-0000-7000-8000-000000000c${String(confirmations).padStart(2, '0')}`, createdAt };
}

/** Um período por pagar da lista geral, de `Ana Souza`, no "Mensal", vencido em `2026-10-07`. */
let openIds = 0;
export function openPaymentOf(overrides: Partial<OpenPayment> = {}): OpenPayment {
  openIds += 1;
  const startsAt = overrides.startsAt ?? '2026-10-07';
  return {
    enrollmentId: `018f0000-0000-7000-8000-000000000d${String(openIds).padStart(2, '0')}`,
    student: { id: `018f0000-0000-7000-8000-0000000006${String(openIds).padStart(2, '0')}`, name: 'Ana Souza' },
    plan: { id: PLAN_ID, name: 'Mensal', period: 'monthly' },
    startsAt,
    endsAt: '2026-11-06',
    dueDate: startsAt,
    priceCents: 9990,
    status: 'pending',
    ...overrides,
  };
}

/** O que a API falsa sabe dos pagamentos de um aluno: os períodos, na ordem em que a ficha os devolve. */
export interface PaymentsState {
  periods: Record<string, StudentPayment[]>;
  /** O dia em `America/Sao_Paulo` e o instante que a API falsa usa na situação e em `createdAt`. */
  today: string;
  now: string;
}

export const paymentsStateOf = (overrides: Partial<PaymentsState> = {}): PaymentsState => ({
  periods: {},
  today: '2026-10-07',
  now: '2026-10-07T15:00:00.000Z',
  ...overrides,
});

/** Recalcula a situação de um período pela conta única, como a API: só o cancelamento é dado, não derivado. */
function settle(period: StudentPayment, state: PaymentsState) {
  if (period.status === 'cancelled') return;
  const calculated = paymentStatus(
    { startsAt: period.startsAt, cancelledAt: null },
    period.payment ? [{ voidedAt: null }] : [],
    state.today,
  );
  period.status = calculated.status;
}

/**
 * Responde às três rotas de pagamento de um aluno com o estado dado, que cada escrita muda como a API
 * mudaria: a leitura seguinte devolve o que a escrita deixou. Como a API real, `401` sem sessão e `403`
 * com `forbidden` para `reception` e `instructor`. As rotas de `api.on` têm precedência: o teste troca a
 * resposta de uma rota sem perder as outras.
 */
export function servePayments(api: FakeApi, studentId: string, state: PaymentsState) {
  const route = `/api/students/${studentId}/payments`;
  const denied = (): ReturnType<typeof problem> | undefined => {
    const role = api.session?.user.role;
    if (!role) return problem(401, 'unauthorized');
    if (!PAYMENT_ROLES.includes(role)) return problem(403, 'forbidden');
    return undefined;
  };
  const items = () => (state.periods[studentId] ??= []);

  const watch = (period: StudentPayment) => {
    if (!period.payment) return;
    const payment = period.payment;
    api.on('DELETE', `${route}/${payment.id}`, () => {
      const refusal = denied();
      if (refusal) return refusal;
      if (period.payment?.id === payment.id) period.payment = null;
      settle(period, state);
      return { status: 204 };
    });
  };
  items().forEach(watch);

  api.on('GET', route, () => denied() ?? { status: 200, body: { items: items() } });
  api.on('POST', route, (request: Recorded) => {
    const refusal = denied();
    if (refusal) return refusal;
    const { enrollmentId } = request.body as { enrollmentId: string };
    const period = items().find((candidate) => candidate.enrollmentId === enrollmentId);
    if (!period) return problem(422, 'validation_failed', [{ path: 'enrollmentId', message: 'Escolha um período válido.' }]);
    if (period.status === 'cancelled') return problem(409, 'enrollment_cancelled');
    if (period.payment) return problem(409, 'payment_already_confirmed');
    period.payment = confirmationOf(state.now);
    settle(period, state);
    watch(period);
    return { status: 201, body: { id: period.payment.id, enrollmentId, createdAt: period.payment.createdAt } };
  });
}

/** A ficha de um aluno para o perfil dado, com planos, matrículas e pagamentos de pé. */
export function servePaymentsFicha(
  api: FakeApi,
  role: Role,
  state: PaymentsState,
  student = studentOf(),
  plans: Partial<PlansState> = {},
) {
  serveFicha(api, role, student, {
    plans: [],
    enrollments: {},
    today: state.today,
    now: state.now,
    ...plans,
  });
  servePayments(api, student.id, state);
}

/** O que a API falsa devolve em `GET /api/payments`: a lista dada, filtrada por `status` da query como a API filtra. */
export function serveOpenPayments(api: FakeApi, role: Role, items: OpenPayment[]) {
  api.session = sessionOf(role);
  api.on('GET', '/api/payments', (request) => {
    if (!PAYMENT_ROLES.includes(role)) return problem(403, 'forbidden');
    const status = new URLSearchParams(request.query).get('status');
    return { status: 200, body: { items: status ? items.filter((item) => item.status === status) : items } };
  });
}

/** "Requisição de pagamento da lista geral": qualquer requisição, de qualquer método, a `/api/payments*`. */
export const openPaymentRequests = (api: FakeApi): Recorded[] =>
  api.requests.filter((request) => request.path.startsWith('/api/payments'));

/** "Requisição de pagamento do aluno": qualquer requisição, de qualquer método, a `/api/students/<id>/payments*`. */
export const studentPaymentRequests = (api: FakeApi, studentId: string = STUDENT_ID): Recorded[] =>
  api.requests.filter((request) => request.path.startsWith(`/api/students/${studentId}/payments`));
