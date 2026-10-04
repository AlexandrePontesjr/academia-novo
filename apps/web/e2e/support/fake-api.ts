import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { Socket } from 'node:net';
import type { Consent, ConsentTerm, Guardian, Role, SessionResponse, User } from '@academia/contracts';
import { test as base } from '@playwright/test';
import { FAKE_API_PORT } from '../../playwright.config.ts';

export interface Recorded {
  method: string;
  path: string;
  /** A query string, sem o `?`; vazia quando não há. */
  query: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export type Reply =
  | { status: number; body?: unknown; headers?: Record<string, string> }
  /** aceita a requisição e nunca responde */
  | 'hang';

type Responder = Reply | ((request: Recorded) => Reply);

/** Corpo de erro no contrato da API. */
export function problem(status: number, code: string, errors?: Array<{ path: string; message: string }>): Reply {
  return {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
    body: { type: 'about:blank', title: code, status, code, requestId: 'id-da-api-falsa', ...(errors && { errors }) },
  };
}

export function sessionOf(role: Role, overrides: Partial<SessionResponse['user']> = {}): SessionResponse {
  const user = {
    id: '018f0000-0000-7000-8000-000000000001',
    name: 'Marina Duarte',
    email: 'marina@exemplo.com',
    role,
    twoFactorEnabled: role === 'admin',
    ...overrides,
  };
  return { user, twoFactorEnrollmentRequired: user.role === 'admin' && !user.twoFactorEnabled };
}

export function userOf(id: number, overrides: Partial<User> = {}): User {
  return {
    id: `018f0000-0000-7000-8000-0000000001${String(id).padStart(2, '0')}`,
    name: `Pessoa ${id}`,
    email: `pessoa${id}@exemplo.com`,
    role: 'reception',
    active: true,
    twoFactorEnabled: false,
    ...overrides,
  };
}

/**
 * A API que o web enxerga é falsa e controlada pelo teste: o que cada rota responde, a sessão que
 * `GET /api/auth/session` devolve, e o registro de tudo o que chegou.
 */
export class FakeApi {
  requests: Recorded[] = [];
  /** Sem sessão, `GET /api/auth/session` responde `401`. */
  session: SessionResponse | undefined;
  private readonly routes = new Map<string, Responder>();
  private readonly sockets = new Set<Socket>();
  private server: Server | undefined;

  on(method: string, path: string, responder: Responder) {
    this.routes.set(`${method} ${path}`, responder);
  }

  /** As requisições de escrita que chegaram. */
  writes() {
    return this.requests.filter((request) => request.method !== 'GET');
  }

  private reply(request: Recorded): Reply {
    const responder = this.routes.get(`${request.method} ${request.path}`);
    if (responder) return typeof responder === 'function' ? responder(request) : responder;
    if (request.method === 'GET' && request.path === '/api/auth/session') {
      return this.session ? { status: 200, body: this.session } : problem(401, 'unauthorized');
    }
    return problem(404, 'not_found');
  }

  async start() {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const [path = '', query = ''] = (req.url ?? '').split('?');
        const recorded: Recorded = {
          method: req.method ?? '',
          path,
          query,
          headers: req.headers,
          body: text ? JSON.parse(text) : undefined,
        };
        this.requests.push(recorded);
        const reply = this.reply(recorded);
        if (reply === 'hang') return;
        res.writeHead(reply.status, { 'Content-Type': 'application/json', ...reply.headers });
        res.end(reply.body === undefined ? undefined : JSON.stringify(reply.body));
      });
    });
    this.server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
    await new Promise<void>((resolve) => this.server!.listen(FAKE_API_PORT, '127.0.0.1', resolve));
  }

  async stop() {
    for (const socket of this.sockets) socket.destroy();
    await new Promise((resolve) => this.server?.close(resolve));
  }
}

/** O que a API falsa sabe de um aluno: o responsável atual, os consentimentos e os termos vigentes. */
export interface ConsentsState {
  guardian: Guardian | null;
  items: Consent[];
  terms: ConsentTerm[];
  /** O instante que a API falsa grava em `grantedAt` e `revokedAt`. */
  now: string;
}

/** Os termos vigentes, versão 1 de cada finalidade, com um texto qualquer. */
export const termsOf = (version = 1, text = 'Texto do termo.'): ConsentTerm[] =>
  (['data_processing', 'image_use'] as const).map((purpose) => ({
    purpose,
    version,
    text: `${text} (${purpose})`,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));

/**
 * Responde às rotas de consentimento de um aluno com o estado dado, que a concessão e a revogação
 * mudam como a API mudaria: o que a leitura seguinte devolve é o que a escrita deixou.
 */
export function serveConsents(api: FakeApi, studentId: string, state: ConsentsState) {
  let granted = 0;
  const watch = (item: Consent) => {
    api.on('DELETE', `/api/students/${studentId}/consents/${item.id}`, () => {
      state.items = state.items.map((current) => (current.id === item.id ? { ...current, revokedAt: state.now } : current));
      return { status: 204 };
    });
  };
  state.items.forEach(watch);
  api.on('GET', `/api/students/${studentId}/consents`, () => ({
    status: 200,
    body: { guardian: state.guardian, items: state.items },
  }));
  api.on('GET', '/api/consent-terms', () => ({ status: 200, body: { items: state.terms } }));
  api.on('POST', `/api/students/${studentId}/consents`, (request) => {
    const sent = request.body as Pick<Consent, 'purpose' | 'termVersion' | 'grantedBy'>;
    granted += 1;
    const item: Consent = {
      id: `018f0000-0000-7000-8000-0000000007${String(granted).padStart(2, '0')}`,
      purpose: sent.purpose,
      termVersion: sent.termVersion,
      grantedBy: sent.grantedBy,
      guardian:
        sent.grantedBy === 'guardian' && state.guardian ? { id: state.guardian.id, name: state.guardian.name } : null,
      grantedAt: state.now,
      revokedAt: null,
    };
    state.items = [item, ...state.items];
    watch(item);
    return { status: 201, body: item };
  });
}

/** `test` com a API falsa de pé durante o teste. */
export const test = base.extend<{ api: FakeApi }>({
  // o Playwright exige a desestruturação no primeiro parâmetro, mesmo sem dependências
  // eslint-disable-next-line no-empty-pattern
  api: async ({}, use) => {
    const api = new FakeApi();
    await api.start();
    await use(api);
    await api.stop();
  },
});

export { expect } from '@playwright/test';
