import type { Role, Staff, StaffListItem, User } from '@academia/contracts';
import { type FakeApi, problem, type Recorded, type RecordedUpload, sessionOf } from './fake-api.ts';
import { PHOTO_ID, PHOTO_URL } from './photo.ts';

export const STAFF_ID = '018f0000-0000-7000-8000-000000000401';

/** Quem alcança as telas e as rotas de funcionário. */
export const STAFF_ROLES: Role[] = ['admin', 'hr_finance'];
export const DENIED_ROLES: Role[] = ['reception', 'instructor'];

export const NO_PERMISSION = 'Você não tem permissão para acessar esta página.';

export function staffOf(overrides: Partial<Staff> = {}): Staff {
  return {
    id: STAFF_ID,
    name: 'Rafaela Prado Cunha',
    status: 'active',
    cpf: '52998224725',
    position: 'Fisioterapeuta Esportiva',
    department: 'Reabilitação',
    hiredAt: '2021-03-15',
    phone: '11912345678',
    email: 'rafaela.prado@exemplo.com',
    user: null,
    photoUrl: null,
    ...overrides,
  };
}

/** O usuário vinculado, como a ficha o mostra. */
export function linkedOf(user: User): NonNullable<Staff['user']> {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
}

/** A miniatura: a API dá a variante `thumb` na lista e a `medium` na ficha. */
const thumbOf = (url: string | null) => url?.replace('/medium?', '/thumb?') ?? null;

export function itemOf(staff: Staff): StaffListItem {
  return {
    id: staff.id,
    name: staff.name,
    position: staff.position,
    department: staff.department,
    status: staff.status,
    photoUrl: thumbOf(staff.photoUrl),
  };
}

/** O que a API falsa sabe: os funcionários, na ordem em que a lista os devolve, e os usuários. */
export interface StaffState {
  staff: Staff[];
  users: User[];
}

const digits = (value: unknown) => String(value).replace(/\D/g, '');

/**
 * Responde às rotas de funcionário e a `GET /api/users` com o estado dado, que cada escrita muda
 * como a API mudaria: a leitura seguinte devolve o que a escrita deixou. Como a API real, `401`
 * sem sessão e `403` com `forbidden` para qualquer requisição de `/api/staff*` de quem não é
 * `admin` nem `hr_finance` (e de `/api/users` de quem não é `admin`). As rotas de `api.on` têm
 * precedência: o teste troca a resposta de uma rota sem perder as outras.
 */
export function serveStaff(api: FakeApi, state: StaffState) {
  let created = 0;
  const roleOf = () => api.session?.user.role;

  api.on('GET', '/api/users', () => {
    if (!roleOf()) return problem(401, 'unauthorized');
    return roleOf() === 'admin' ? { status: 200, body: { users: state.users } } : problem(403, 'forbidden');
  });

  api.onPrefix('/api/staff', (request) => {
    const role = roleOf();
    if (!role) return problem(401, 'unauthorized');
    if (role !== 'admin' && role !== 'hr_finance') return problem(403, 'forbidden');

    const match = /^\/api\/staff(?:\/([^/]+)(?:\/(user|photo))?)?$/.exec(request.path);
    if (!match) return problem(404, 'not_found');
    const [, id, sub] = match;
    if (!id) {
      if (request.method === 'GET') return { status: 200, body: { items: state.staff.map(itemOf) } };
      if (request.method !== 'POST') return problem(404, 'not_found');
      const body = request.body as Record<string, unknown>;
      created += 1;
      const member = staffOf({
        id: `018f0000-0000-7000-8000-0000000004${String(10 + created).padStart(2, '0')}`,
        ...(body as Partial<Staff>),
        cpf: digits(body.cpf),
        phone: digits(body.phone),
        department: (body.department as string | undefined) ?? null,
        email: (body.email as string | undefined) ?? null,
        status: 'active',
        user: null,
        photoUrl: null,
      });
      state.staff.push(member);
      return { status: 201, body: member };
    }

    const member = state.staff.find((candidate) => candidate.id === id);
    if (!member) return problem(404, 'not_found');
    if (!sub) {
      if (request.method === 'GET') return { status: 200, body: member };
      if (request.method === 'PATCH') {
        const body = request.body as Partial<Staff>;
        Object.assign(member, body);
        if (body.cpf !== undefined) member.cpf = digits(body.cpf);
        if (body.phone !== undefined) member.phone = digits(body.phone);
        return { status: 200, body: member };
      }
      if (request.method === 'DELETE') {
        member.status = 'inactive';
        return { status: 204 };
      }
    } else if (sub === 'user') {
      if (request.method === 'PUT') {
        const user = state.users.find((candidate) => candidate.id === (request.body as { userId: string }).userId);
        if (!user) return problem(422, 'validation_failed', [{ path: 'userId', message: 'Escolha um usuário válido.' }]);
        member.user = linkedOf(user);
        return { status: 204 };
      }
      if (request.method === 'DELETE') {
        member.user = null;
        return { status: 204 };
      }
    } else {
      if (request.method === 'POST' || request.method === 'PUT') {
        const version = member.photoUrl ? 2 : 1;
        member.photoUrl = PHOTO_URL;
        return { status: 201, body: { id: PHOTO_ID, version, createdAt: '2026-10-05T02:30:00.000Z' } };
      }
      if (request.method === 'DELETE') {
        member.photoUrl = null;
        return { status: 204 };
      }
    }
    return problem(404, 'not_found');
  });
}

/** Uma sessão do perfil dado com a API falsa de funcionários de pé. */
export function serveStaffAs(api: FakeApi, role: Role, state: StaffState) {
  api.session = sessionOf(role);
  serveStaff(api, state);
}

/** "Requisição de funcionário": qualquer requisição, de qualquer método, a `/api/staff*`. */
export const staffRequests = (api: FakeApi): Recorded[] => api.requests.filter((request) => request.path.startsWith('/api/staff'));

/** "Requisição de foto do funcionário": qualquer requisição, de qualquer método, a `/api/staff/<id>/photo`. */
export const staffPhotoRequests = (api: FakeApi, id: string = STAFF_ID): Recorded[] =>
  api.requests.filter((request) => request.path === `/api/staff/${id}/photo`);

/** Os métodos e caminhos das escritas que a tela fez em `/api/staff*`. */
export const staffWrites = (api: FakeApi) =>
  staffRequests(api)
    .filter((request) => request.method !== 'GET')
    .map((request) => `${request.method} ${request.path}`);

export const uploadOf = (request: Recorded) => request.body as RecordedUpload;
