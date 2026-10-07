import type { Role, Staff } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditRows } from './support/audit.ts';
import { bucketKeys, type PhotoStack, startPhotoStack } from './support/photos.ts';
import { problem } from './support/stack.ts';
import {
  createStaff,
  fullStaffBody,
  insertStaff,
  seedStaffPhoto,
  setStaffStatus,
  staffBody,
  staffCount,
  staffPhotoPrefix,
  staffRow,
  staffRowText,
  staffRowWithoutUpdateInstant,
} from './support/staff.ts';
import { cpfOf, fieldErrorPaths, maskCpf, releasedTogether, unknownId } from './support/students.ts';

let env: PhotoStack;
let counter = 5000;
const next = () => (counter += 1);

beforeAll(async () => {
  env = await startPhotoStack();
}, 180_000);

afterAll(() => env?.close());

/** Os valores novos de cada campo editável: todos diferentes dos que `fullStaffBody` grava. */
const NEW_VALUES = (): Record<string, string> => ({
  name: 'Nome Novo da Silva',
  cpf: cpfOf(next()),
  position: 'Coordenadora de Reabilitação',
  department: 'Setor Novo',
  hiredAt: '2019-05-20',
  phone: '11987654321',
  email: 'novo.endereco@exemplo.com',
});

/** As chaves da linha cujo valor mudou entre as duas leituras. */
const changedKeys = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));

test('patch_each_of_seven_fields_and_all_together_keeps_the_rest', async () => {
  const cases = [...Object.keys(NEW_VALUES()).map((field) => [field] as string[]), Object.keys(NEW_VALUES())];
  expect(cases).toHaveLength(8);

  for (const role of ['admin', 'hr_finance'] as Role[]) {
    const { client } = await env.stack.session(role);
    for (const fields of cases) {
      const created = await createStaff(client, fullStaffBody(next()));
      const before = (await staffRowWithoutUpdateInstant(env.stack, created.id))!;
      const sent = Object.fromEntries(Object.entries(NEW_VALUES()).filter(([field]) => fields.includes(field)));
      const label = `${role} ${fields.join('+')}`;

      const response = await client.patch(`/api/staff/${created.id}`, sent);
      const updated = (await response.json()) as Staff;

      expect(response.status, label).toBe(200);
      for (const [field, value] of Object.entries(sent)) {
        expect((updated as unknown as Record<string, unknown>)[field], `${label} resposta ${field}`).toBe(value);
      }
      const after = (await staffRowWithoutUpdateInstant(env.stack, created.id))!;
      const changed = changedKeys(before, after);
      expect(changed, `${label} colunas alteradas`).toHaveLength(fields.length);
      // o resto ficou: o que mudou é exatamente o que foi enviado
      expect(changed.map((key) => after[key]).sort(), label).toEqual(Object.values(sent).sort());
      for (const key of Object.keys(before)) if (!changed.includes(key)) expect(after[key], `${label} ${key}`).toEqual(before[key]);
    }
  }
});

test('patch_null_clears_department_and_email', async () => {
  const { client } = await env.stack.session('hr_finance');

  for (const fields of [['department'], ['email'], ['department', 'email']]) {
    const created = await createStaff(client, fullStaffBody(next()));
    const before = (await staffRowWithoutUpdateInstant(env.stack, created.id))!;
    const sent = Object.fromEntries(fields.map((field) => [field, null]));

    const response = await client.patch(`/api/staff/${created.id}`, sent);
    const updated = (await response.json()) as Staff;

    const label = fields.join('+');
    expect(response.status, label).toBe(200);
    for (const field of fields) expect((updated as unknown as Record<string, unknown>)[field], `${label} resposta ${field}`).toBeNull();
    if (!fields.includes('department')) expect(updated.department).toBe('Atendimento');
    if (!fields.includes('email')) expect(updated.email).toBe(created.email);
    const after = (await staffRowWithoutUpdateInstant(env.stack, created.id))!;
    const changed = changedKeys(before, after);
    expect(changed, label).toHaveLength(fields.length);
    for (const key of changed) expect(after[key], `${label} ${key}`).toBeNull();
  }
});

test('patch_null_and_invalid_values_422_with_field_path_row_unchanged', async () => {
  const { client } = await env.stack.session('hr_finance');
  const created = await createStaff(client, fullStaffBody(next()));
  const accented = (length: number) => `é${'a'.repeat(length - 1)}`;
  const cases: Array<[field: string, label: string, value: unknown]> = [
    ['name', 'null', null],
    ['cpf', 'null', null],
    ['position', 'null', null],
    ['hiredAt', 'null', null],
    ['phone', 'null', null],
    ['status', 'null', null],
    ['cpf', 'dígito verificador errado', '529.982.247-24'],
    ['hiredAt', '1899-12-31', '1899-12-31'],
    ['name', '121 caracteres', accented(121)],
    ['phone', '9 dígitos', '119123456'],
  ];

  for (const [field, label, value] of cases) {
    const before = await staffRowText(env.stack, created.id);

    const response = await client.patch(`/api/staff/${created.id}`, { [field]: value });

    expect(response.status, `${field} ${label}`).toBe(422);
    expect(await fieldErrorPaths(response), `${field} ${label}`).toContain(field);
    expect(await staffRowText(env.stack, created.id), `${field} ${label}`).toBe(before);
  }
});

test('patch_cpf_of_another_staff_409_and_own_cpf_200', async () => {
  const { client } = await env.stack.session('hr_finance');
  const target = await createStaff(client, staffBody(next()));

  for (const status of ['active', 'inactive']) {
    const other = await createStaff(client, staffBody(next()));
    await setStaffStatus(env.stack, other.id, status);
    const targetBefore = await staffRowText(env.stack, target.id);
    const otherBefore = await staffRowText(env.stack, other.id);

    const response = await client.patch(`/api/staff/${target.id}`, { cpf: other.cpf });

    expect(response.status, status).toBe(409);
    expect((await problem(response)).code, status).toBe('cpf_taken');
    expect(await staffRowText(env.stack, target.id), status).toBe(targetBefore);
    expect(await staffRowText(env.stack, other.id), status).toBe(otherBefore);
  }

  // o CPF que o próprio funcionário já tem, igual e com máscara, não é conflito
  for (const cpf of [target.cpf, maskCpf(target.cpf)]) {
    const response = await client.patch(`/api/staff/${target.id}`, { cpf });

    expect(response.status, cpf).toBe(200);
    expect(((await response.json()) as Staff).cpf, cpf).toBe(target.cpf);
  }
});

test('patch_status_active_reactivates_inactive_staff', async () => {
  const { client } = await env.stack.session('hr_finance');
  const user = await env.stack.seed({ role: 'reception' });
  const [id] = await insertStaff(env.stack, [{ name: 'Inativa Vinculada', cpf: cpfOf(next()), status: 'inactive', userId: user.id }]);
  const before = (await staffRowWithoutUpdateInstant(env.stack, id!))!;

  const response = await client.patch(`/api/staff/${id}`, { status: 'active' });
  const updated = (await response.json()) as Staff;

  expect(response.status).toBe(200);
  expect(updated.status).toBe('active');
  expect(updated.user?.id).toBe(user.id);
  const after = (await staffRowWithoutUpdateInstant(env.stack, id!))!;
  expect(changedKeys(before, after)).toHaveLength(1);
  expect(Object.values(after)).toContain('active');
  expect(Object.values(after)).toContain(user.id);
});

test('patch_status_other_values_422_on_status', async () => {
  const { client } = await env.stack.session('hr_finance');
  const created = await createStaff(client, staffBody(next()));

  for (const status of ['inactive', 'suspended', 'Active', 'ativo', '']) {
    const before = await staffRowText(env.stack, created.id);

    const response = await client.patch(`/api/staff/${created.id}`, { status });

    expect(response.status, JSON.stringify(status)).toBe(422);
    expect(await fieldErrorPaths(response), JSON.stringify(status)).toContain('status');
    expect(await staffRowText(env.stack, created.id), JSON.stringify(status)).toBe(before);
  }
});

test('delete_inactivates_and_keeps_row_link_and_photos', async () => {
  for (const role of ['admin', 'hr_finance'] as Role[]) {
    const { client } = await env.stack.session(role);
    const user = await env.stack.seed({ role: 'reception' });
    const [id] = await insertStaff(env.stack, [{ name: `Com Tudo ${role}`, cpf: cpfOf(next()), userId: user.id }]);
    const stored = await seedStaffPhoto(env.stack, env.minio, id!, { version: 1, current: false });
    const current = await seedStaffPhoto(env.stack, env.minio, id!, { version: 2, current: true });
    const fichaBefore = (await (await client.get(`/api/staff/${id}`)).json()) as Staff;
    const rowBefore = (await staffRowWithoutUpdateInstant(env.stack, id!))!;
    const photosBefore = (await env.stack.query<{ n: string }>('select count(*) as n from photos where staff_id = $1', [id]))[0]!.n;
    expect(await bucketKeys(env.minio, staffPhotoPrefix(id!))).toHaveLength(6);

    const response = await client.delete(`/api/staff/${id}`);

    expect(response.status, role).toBe(204);
    const rowAfter = (await staffRowWithoutUpdateInstant(env.stack, id!))!;
    expect(changedKeys(rowBefore, rowAfter), role).toHaveLength(1);
    expect(Object.values(rowAfter), role).toContain('inactive');
    expect(Object.values(rowAfter), role).toContain(user.id);
    expect((await env.stack.query<{ n: string }>('select count(*) as n from photos where staff_id = $1', [id]))[0]!.n, role).toBe(photosBefore);
    expect(await bucketKeys(env.minio, staffPhotoPrefix(id!)), role).toHaveLength(6);

    const fichaAfter = (await (await client.get(`/api/staff/${id}`)).json()) as Staff;
    const { photoUrl: urlBefore, ...restBefore } = fichaBefore;
    const { photoUrl: urlAfter, ...restAfter } = fichaAfter;
    expect(restAfter, role).toEqual({ ...restBefore, status: 'inactive' });
    expect(urlBefore, role).toContain(current.photoId);
    expect(urlAfter, role).toContain(current.photoId);
    expect(stored.photoId).not.toBe(current.photoId);
  }
});

test('delete_leaves_linked_user_active_and_sessions', async () => {
  const { client } = await env.stack.session('hr_finance');
  const user = await env.stack.seed({ role: 'reception' });
  const userClient = await env.stack.signIn(user);
  const [id] = await insertStaff(env.stack, [{ name: 'Com Acesso', cpf: cpfOf(next()), userId: user.id }]);
  const userBefore = (await env.stack.query<{ row: string }>('select to_jsonb(u)::text as row from users u where id = $1', [user.id]))[0]!.row;
  const sessionsBefore = await env.stack.query<{ row: string }>(
    'select to_jsonb(s)::text as row from sessions s where user_id = $1 order by id',
    [user.id],
  );
  expect(sessionsBefore.length).toBeGreaterThan(0);

  const response = await client.delete(`/api/staff/${id}`);

  expect(response.status).toBe(204);
  expect((await env.stack.query<{ row: string }>('select to_jsonb(u)::text as row from users u where id = $1', [user.id]))[0]!.row).toBe(userBefore);
  expect(
    await env.stack.query<{ row: string }>('select to_jsonb(s)::text as row from sessions s where user_id = $1 order by id', [user.id]),
  ).toEqual(sessionsBefore);
  expect((await userClient.get('/api/auth/session')).status).toBe(200);
  expect((await auditRows(env.stack)).filter((row) => row.action === 'user.updated' && row.entity_id === user.id)).toEqual([]);
});

test('delete_of_inactive_staff_204_changes_nothing', async () => {
  const { client } = await env.stack.session('hr_finance');
  const [id] = await insertStaff(env.stack, [{ name: 'Já Inativa', cpf: cpfOf(next()), status: 'inactive' }]);
  const before = await staffRowText(env.stack, id!);

  const response = await client.delete(`/api/staff/${id}`);

  expect(response.status).toBe(204);
  expect(await staffRowText(env.stack, id!)).toBe(before);
});

test('two_simultaneous_patches_on_different_fields_keep_both', async () => {
  const { client } = await env.stack.session('hr_finance');

  for (let round = 0; round < 10; round += 1) {
    const created = await createStaff(client, staffBody(next()));
    const position = `Cargo da rodada ${round}`;
    const phone = `119${String(10_000_000 + round).slice(0, 8)}`;

    const responses = await releasedTogether([
      () => client.patch(`/api/staff/${created.id}`, { position }),
      () => client.patch(`/api/staff/${created.id}`, { phone }),
    ]);

    expect(responses.map((response) => response.status), `rodada ${round}`).toEqual([200, 200]);
    const row = (await staffRow(env.stack, created.id))!;
    expect(Object.values(row), `rodada ${round}`).toContain(position);
    expect(Object.values(row), `rodada ${round}`).toContain(phone);
  }
});

test('patch_and_delete_404_for_non_uuid_and_unknown_uuid', async () => {
  const { client } = await env.stack.session('hr_finance');
  const total = await staffCount(env.stack);

  for (const id of ['abc', unknownId()]) {
    for (const [method, body] of [['PATCH', { position: 'Qualquer' }], ['DELETE', undefined]] as const) {
      const response = await client.request(method, `/api/staff/${id}`, { body });

      expect(response.status, `${method} ${id}`).toBe(404);
      expect((await problem(response)).code, `${method} ${id}`).toBe('not_found');
    }
  }

  expect(await staffCount(env.stack)).toBe(total);
});
