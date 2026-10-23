import type { Lead, LeadOptionsResponse } from '@academia/contracts';
import type { FakeApi } from './fake-api.ts';

export const TERM_TEXT = 'Autorizo o tratamento dos meus dados para cadastro e matrícula.';

/** O que `GET /api/leads/options` responde: o termo vigente e se o Google está ligado. */
export const optionsOf = (google = false, version = 2): LeadOptionsResponse => ({ google, term: { version, text: TERM_TEXT } });

export function serveOptions(api: FakeApi, google = false, version = 2) {
  api.on('GET', '/api/leads/options', { status: 200, body: optionsOf(google, version) });
}

let counter = 0;
/** Um interessado como a API o devolve. */
export function leadOf(overrides: Partial<Lead> = {}): Lead {
  counter += 1;
  return {
    id: `018f0000-0000-7000-8000-0000000003${String(counter % 100).padStart(2, '0')}`,
    name: `Interessado ${counter}`,
    email: `interessado${counter}@exemplo.com`,
    phone: '11987654321',
    source: 'form',
    status: 'new',
    emailVerified: false,
    createdAt: '2026-10-22T13:05:00.000Z',
    studentId: null,
    ...overrides,
  };
}

/** As chamadas de leitura da lista que chegaram à API falsa, com a query de cada uma. */
export const listCalls = (api: FakeApi) =>
  api.requests.filter((request) => request.method === 'GET' && request.path === '/api/leads').map((request) => request.query);

/**
 * Responde à lista e ao `PATCH` como a API: a lista filtra pelo `status` da query (sem ele, os abertos),
 * e o `PATCH` muda o interessado no estado que a próxima leitura devolve.
 */
export function serveLeads(api: FakeApi, leads: Lead[]) {
  const state = leads;
  api.on('GET', '/api/leads', (request) => {
    const status = new URLSearchParams(request.query).get('status');
    const items = state.filter((lead) => (status ? lead.status === status : lead.status === 'new' || lead.status === 'contacted'));
    return { status: 200, body: { items } };
  });
  for (const lead of state) {
    api.on('PATCH', `/api/leads/${lead.id}`, (request) => {
      lead.status = (request.body as { status: Lead['status'] }).status;
      return { status: 200, body: lead };
    });
  }
  return state;
}
