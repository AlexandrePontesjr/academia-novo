import type { Staff } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { problem, startStack, type Stack } from './support/stack.ts';
import { fieldErrorPaths, cpfOf, releasedTogether, unknownId } from './support/students.ts';
import { insertStaff, staffCount, staffRowText } from './support/staff.ts';

let stack: Stack;
let counter = 6000;
const next = () => (counter += 1);

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(() => stack?.close());

/** Um funcionário sem vínculo, direto no banco. */
const newStaff = async (userId?: string) => (await insertStaff(stack, [{ name: `Pessoa ${next()}`, cpf: cpfOf(next()), userId }]))[0]!;

const userRow = async (id: string) =>
  (await stack.query<{ row: string }>('select to_jsonb(u)::text as row from users u where id = $1', [id]))[0]!.row;

test('put_user_204_for_active_and_inactive_user_and_ficha_shows_it', async () => {
  const { client: admin } = await stack.session('admin');
  const { client: hr } = await stack.session('hr_finance');

  for (const active of [true, false]) {
    const user = await stack.seed({ role: 'reception', active });
    const id = await newStaff();

    const response = await admin.put(`/api/staff/${id}/user`, { userId: user.id });

    expect(response.status, `active ${active}`).toBe(204);
    const ficha = (await (await hr.get(`/api/staff/${id}`)).json()) as Staff;
    expect(ficha.user, `active ${active}`).toEqual({ id: user.id, name: user.name, email: user.email, role: 'reception', active });
  }
});

test('put_user_replaces_the_link_and_frees_the_previous_user', async () => {
  const { client: admin } = await stack.session('admin');
  const { client: hr } = await stack.session('hr_finance');
  const userA = await stack.seed({ role: 'reception' });
  const userB = await stack.seed({ role: 'instructor' });
  const id = await newStaff(userA.id);

  const swapped = await admin.put(`/api/staff/${id}/user`, { userId: userB.id });

  expect(swapped.status).toBe(204);
  expect(((await (await hr.get(`/api/staff/${id}`)).json()) as Staff).user?.id).toBe(userB.id);

  const other = await newStaff();
  const freed = await admin.put(`/api/staff/${other}/user`, { userId: userA.id });

  expect(freed.status).toBe(204);
  expect(((await (await hr.get(`/api/staff/${other}`)).json()) as Staff).user?.id).toBe(userA.id);
});

test('put_user_five_invalid_user_ids_422_on_user_id', async () => {
  const { client: admin } = await stack.session('admin');
  const user = await stack.seed({ role: 'reception' });
  const id = await newStaff(user.id);
  const cases: Array<[label: string, body: Record<string, unknown>]> = [
    ['sem userId', {}],
    ['abc', { userId: 'abc' }],
    ['123', { userId: '123' }],
    ['null', { userId: null }],
    ['uuid de usuário nenhum', { userId: unknownId() }],
  ];

  for (const [label, body] of cases) {
    const before = await staffRowText(stack, id);

    const response = await admin.put(`/api/staff/${id}/user`, body);

    expect(response.status, label).toBe(422);
    expect(await fieldErrorPaths(response), label).toContain('userId');
    expect(await staffRowText(stack, id), label).toBe(before);
  }
});

test('put_user_already_linked_elsewhere_409_nothing_changes', async () => {
  const { client: admin } = await stack.session('admin');
  const user = await stack.seed({ role: 'reception' });
  const owner = await newStaff(user.id);
  const other = await newStaff();
  const ownerBefore = await staffRowText(stack, owner);
  const otherBefore = await staffRowText(stack, other);

  const response = await admin.put(`/api/staff/${other}/user`, { userId: user.id });

  expect(response.status).toBe(409);
  expect((await problem(response)).code).toBe('user_already_linked');
  expect(await staffRowText(stack, owner)).toBe(ownerBefore);
  expect(await staffRowText(stack, other)).toBe(otherBefore);
});

test('two_simultaneous_links_of_one_user_one_204_one_409', async () => {
  const { client: admin } = await stack.session('admin');

  for (let round = 0; round < 10; round += 1) {
    const user = await stack.seed({ role: 'reception' });
    const first = await newStaff();
    const second = await newStaff();

    const responses = await releasedTogether([
      () => admin.put(`/api/staff/${first}/user`, { userId: user.id }),
      () => admin.put(`/api/staff/${second}/user`, { userId: user.id }),
    ]);

    expect(responses.map((response) => response.status).sort(), `rodada ${round}`).toEqual([204, 409]);
    const loser = responses.find((response) => response.status === 409)!;
    expect((await problem(loser)).code, `rodada ${round}`).toBe('user_already_linked');
    const linked = await stack.query<{ n: string }>('select count(*) as n from staff where user_id = $1', [user.id]);
    expect(Number(linked[0]!.n), `rodada ${round}`).toBe(1);
  }
});

test('delete_user_unlinks_and_is_idempotent', async () => {
  const { client: admin } = await stack.session('admin');
  const { client: hr } = await stack.session('hr_finance');
  const user = await stack.seed({ role: 'reception' });
  const linked = await newStaff(user.id);
  const free = await newStaff();
  const userBefore = await userRow(user.id);

  const unlinked = await admin.delete(`/api/staff/${linked}/user`);

  expect(unlinked.status).toBe(204);
  expect(((await (await hr.get(`/api/staff/${linked}`)).json()) as Staff).user).toBeNull();
  expect(await userRow(user.id)).toBe(userBefore);

  const freeBefore = await staffRowText(stack, free);
  const again = await admin.delete(`/api/staff/${free}/user`);

  expect(again.status).toBe(204);
  expect(await staffRowText(stack, free)).toBe(freeBefore);
  expect(await userRow(user.id)).toBe(userBefore);
});

test('user_routes_404_for_non_uuid_and_unknown_uuid', async () => {
  const { client: admin } = await stack.session('admin');
  const user = await stack.seed({ role: 'reception' });
  const total = await staffCount(stack);

  for (const id of ['abc', unknownId()]) {
    for (const [method, body] of [['PUT', { userId: user.id }], ['DELETE', undefined]] as const) {
      const response = await admin.request(method, `/api/staff/${id}/user`, { body });

      expect(response.status, `${method} ${id}`).toBe(404);
      expect((await problem(response)).code, `${method} ${id}`).toBe('not_found');
    }
  }

  expect(await staffCount(stack)).toBe(total);
});
