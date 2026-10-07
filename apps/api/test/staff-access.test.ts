import type { Role } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient } from './support/client.ts';
import { type PhotoStack, snapshotOf, startPhotoStack } from './support/photos.ts';
import {
  STAFF_DATA_KEYS,
  STAFF_ROUTES,
  bodyFor,
  insertStaff,
  isBuilt,
  pathFor,
  routeKey,
  staffRowText,
} from './support/staff.ts';
import { problem } from './support/stack.ts';
import { cpfOf, unknownId } from './support/students.ts';

let env: PhotoStack;
let staffId: string;

beforeAll(async () => {
  env = await startPhotoStack();
  [staffId] = (await insertStaff(env.stack, [{ name: 'Rafaela Prado', cpf: cpfOf(3001) }])) as [string];
}, 180_000);

afterAll(() => env?.close());

const snapshot = () => snapshotOf(env.stack, env.minio);

/** Uma rota que ainda não existe responde `404` (ver `UNBUILT_STAFF_ROUTES`); a que existe, o status da guarda. */
const expectedFor = (route: (typeof STAFF_ROUTES)[number], guardStatus: number) => (isBuilt(route) ? guardStatus : 404);

test('reception_and_instructor_403_on_ten_routes_with_existing_and_unknown_id', async () => {
  for (const role of ['reception', 'instructor'] as Role[]) {
    const { client } = await env.stack.session(role);
    for (const route of STAFF_ROUTES) {
      for (const [label, id] of [['existente', staffId], ['de ninguém', unknownId()]] as const) {
        const before = await snapshot();

        const response = await client.request(route.method, pathFor(route, id), { body: bodyFor(route) });
        const body = (await response.json()) as Record<string, unknown>;

        const where = `${role} ${routeKey(route)} (${label})`;
        expect(response.status, where).toBe(expectedFor(route, 403));
        if (isBuilt(route)) expect(body.code, where).toBe('forbidden');
        for (const key of STAFF_DATA_KEYS) expect(Object.keys(body), `${where} ${key}`).not.toContain(key);
        expect(await snapshot(), where).toEqual(before);
      }
    }
  }
});

test('anonymous_401_on_ten_routes', async () => {
  const client = createClient(env.stack.api.url);
  for (const route of STAFF_ROUTES) {
    const before = await snapshot();

    const response = await client.request(route.method, pathFor(route, staffId), { body: bodyFor(route) });

    const where = routeKey(route);
    expect(response.status, where).toBe(expectedFor(route, 401));
    if (isBuilt(route)) expect((await problem(response)).code, where).toBe('unauthorized');
    expect(await snapshot(), where).toEqual(before);
  }
});

test('hr_finance_403_on_user_link_routes_and_link_unchanged', async () => {
  const { client } = await env.stack.session('hr_finance');
  const userA = await env.stack.seed({ role: 'reception' });
  const userB = await env.stack.seed({ role: 'instructor' });
  const [free, linked] = await insertStaff(env.stack, [
    { name: 'Sem Vínculo', cpf: cpfOf(3002) },
    { name: 'Com Vínculo', cpf: cpfOf(3003), userId: userA.id },
  ]);
  const freeBefore = await staffRowText(env.stack, free!);
  const linkedBefore = await staffRowText(env.stack, linked!);

  const attempts: Array<[label: string, method: 'PUT' | 'DELETE', id: string, body?: unknown]> = [
    ['PUT sobre funcionário sem vínculo', 'PUT', free!, { userId: userB.id }],
    ['PUT sobre vinculado a outro usuário', 'PUT', linked!, { userId: userB.id }],
    ['DELETE sobre o vinculado', 'DELETE', linked!],
  ];
  for (const [label, method, id, body] of attempts) {
    const route = STAFF_ROUTES.find((candidate) => candidate.method === method && candidate.path === '/api/staff/:id/user')!;

    const response = await client.request(method, `/api/staff/${id}/user`, { body });

    expect(response.status, label).toBe(expectedFor(route, 403));
    if (isBuilt(route)) expect((await problem(response)).code, label).toBe('forbidden');
  }

  expect(await staffRowText(env.stack, free!)).toBe(freeBefore);
  expect(await staffRowText(env.stack, linked!)).toBe(linkedBefore);
});
