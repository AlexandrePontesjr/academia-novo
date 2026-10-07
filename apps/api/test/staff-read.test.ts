import type { Role, Staff, StaffListItem } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount, auditRows, withAuditInsertFailing, written } from './support/audit.ts';
import { createClient } from './support/client.ts';
import { bucketObject, type PhotoStack, startPhotoStack } from './support/photos.ts';
import { problem } from './support/stack.ts';
import {
  FICHA_KEYS,
  LIST_ITEM_KEYS,
  insertStaff,
  resetStaff,
  seedStaffPhoto,
  staffBody,
} from './support/staff.ts';
import { cpfOf, unknownId } from './support/students.ts';

let env: PhotoStack;
let counter = 4000;
const next = () => (counter += 1);

beforeAll(async () => {
  env = await startPhotoStack();
}, 180_000);

afterAll(() => env?.close());

const staffList = async (client: ReturnType<typeof createClient>) => {
  const response = await client.get('/api/staff');
  expect(response.status).toBe(200);
  return ((await response.json()) as { items: StaffListItem[] }).items;
};

test('ficha_eleven_keys_same_for_admin_and_hr_finance', async () => {
  const [id] = await insertStaff(env.stack, [{ name: 'Rafaela Prado', cpf: cpfOf(next()), department: 'Reabilitação' }]);
  const bodies: Staff[] = [];

  for (const role of ['admin', 'hr_finance'] as Role[]) {
    const { client } = await env.stack.session(role);

    const response = await client.get(`/api/staff/${id}`);
    const ficha = (await response.json()) as Staff;

    expect(response.status, role).toBe(200);
    expect(Object.keys(ficha).sort(), role).toEqual([...FICHA_KEYS].sort());
    expect(ficha.cpf, role).toMatch(/^\d{11}$/);
    expect(ficha.phone, role).toMatch(/^\d{10,11}$/);
    bodies.push(ficha);
  }

  expect(bodies[0]).toEqual(bodies[1]);
  expect(bodies[0]).toMatchObject({ id, name: 'Rafaela Prado', department: 'Reabilitação', status: 'active' });
});

test('ficha_user_block_five_keys_read_live_for_four_roles_and_null_without_link', async () => {
  const { client } = await env.stack.session('hr_finance');
  const roles: Role[] = ['admin', 'reception', 'hr_finance', 'instructor'];

  for (const role of roles) {
    const user = await env.stack.seed({ role, name: `Usuária ${role}`, email: `${role}.vinculada@exemplo.com` });
    const [id] = await insertStaff(env.stack, [{ name: `Pessoa ${role}`, cpf: cpfOf(next()), userId: user.id }]);

    const ficha = (await (await client.get(`/api/staff/${id}`)).json()) as Staff;

    expect(Object.keys(ficha.user ?? {}).sort(), role).toEqual(['active', 'email', 'id', 'name', 'role']);
    expect(ficha.user, role).toEqual({ id: user.id, name: user.name, email: user.email, role, active: true });

    // o perfil e a situação são lidos na hora: a mudança feita por SQL já aparece na leitura seguinte
    const changed: Role = role === 'instructor' ? 'reception' : 'instructor';
    await env.stack.query('update users set role = $2, active = false where id = $1', [user.id, changed]);
    const after = (await (await client.get(`/api/staff/${id}`)).json()) as Staff;
    expect(after.user, `${role} depois da mudança`).toEqual({ id: user.id, name: user.name, email: user.email, role: changed, active: false });
  }

  const [unlinked] = await insertStaff(env.stack, [{ name: 'Sem Acesso', cpf: cpfOf(next()) }]);
  expect(((await (await client.get(`/api/staff/${unlinked}`)).json()) as Staff).user).toBeNull();
});

test('ficha_photo_url_medium_signed_for_current_photo_null_without', async () => {
  const { client } = await env.stack.session('hr_finance');
  const [withPhoto, without] = await insertStaff(env.stack, [
    { name: 'Com Foto', cpf: cpfOf(next()) },
    { name: 'Sem Foto', cpf: cpfOf(next()) },
  ]);
  const first = await seedStaffPhoto(env.stack, env.minio, withPhoto!);

  const ficha = (await (await client.get(`/api/staff/${withPhoto}`)).json()) as Staff;

  expect(ficha.photoUrl).toMatch(new RegExp(`^/api/photo-files/${first.photoId}/medium\\?exp=\\d+&sig=[A-Za-z0-9_-]+$`));
  const served = await fetch(`${env.stack.api.url}${ficha.photoUrl}`);
  expect(served.status).toBe(200);
  expect(Buffer.from(await served.arrayBuffer()).equals(await bucketObject(env.minio, first.keys.medium))).toBe(true);
  expect(((await (await client.get(`/api/staff/${without}`)).json()) as Staff).photoUrl).toBeNull();

  // depois da troca, a ficha traz o `photoId` novo: a anterior fica guardada, com prazo, e a nova é a corrente
  await env.stack.query(`update photos set is_current = false, expires_at = now() + interval '30 days' where id = $1`, [first.photoId]);
  const second = await seedStaffPhoto(env.stack, env.minio, withPhoto!, { version: 2 });
  expect(second.photoId).not.toBe(first.photoId);

  const swapped = (await (await client.get(`/api/staff/${withPhoto}`)).json()) as Staff;
  expect(swapped.photoUrl).toMatch(new RegExp(`^/api/photo-files/${second.photoId}/medium\\?`));
});

test('ficha_200_writes_one_staff_viewed_row', async () => {
  const [id] = await insertStaff(env.stack, [{ name: 'Lida Duas Vezes', cpf: cpfOf(next()) }]);

  for (const role of ['admin', 'hr_finance'] as Role[]) {
    const { user, client } = await env.stack.session(role);

    const { result, rows } = await written(env.stack, () => client.get(`/api/staff/${id}`));

    expect(result.status, role).toBe(200);
    expect(rows, role).toHaveLength(1);
    expect(rows[0], role).toMatchObject({
      action: 'staff.viewed',
      user_id: user.id,
      entity: 'staff',
      entity_id: id,
      diff: null,
    });
  }

  // duas leituras do mesmo funcionário gravam duas linhas
  const { client } = await env.stack.session('hr_finance');
  const twice = await written(env.stack, async () => {
    await client.get(`/api/staff/${id}`);
    await client.get(`/api/staff/${id}`);
  });
  expect(twice.rows.map((row) => row.action)).toEqual(['staff.viewed', 'staff.viewed']);
});

test('list_all_statuses_ordered_by_folded_name_then_id_with_six_keys_and_thumb', async () => {
  await resetStaff(env.stack);
  const names: Array<[name: string, status: string]> = [
    ['Zélia', 'active'],
    ['Marcos Lima', 'active'],
    ['Çaio', 'inactive'],
    ['Bruno', 'active'],
    ['Ângela', 'active'],
    ['bruna', 'inactive'],
    ['angela', 'active'],
    ['Marcos Lima', 'inactive'],
  ];
  const ids = await insertStaff(
    env.stack,
    names.map(([name, status]) => ({ name, status, cpf: cpfOf(next()) })),
  );
  const zelia = ids[0]!;
  const photo = await seedStaffPhoto(env.stack, env.minio, zelia);
  const { client } = await env.stack.session('hr_finance');

  const items = await staffList(client);

  // a ordem esperada, escrita à mão: sem caixa nem acento, e no empate pelo `id`
  const byId = (a: string, b: string) => (a < b ? -1 : 1);
  const angelas = [ids[4]!, ids[6]!].sort(byId);
  const marcos = [ids[1]!, ids[7]!].sort(byId);
  expect(items.map((item) => item.id)).toEqual([...angelas, ids[5]!, ids[3]!, ids[2]!, ...marcos, ids[0]!]);
  for (const item of items) expect(Object.keys(item).sort()).toEqual([...LIST_ITEM_KEYS].sort());
  expect(items.map((item) => item.status).sort()).toEqual(names.map(([, status]) => status).sort());
  for (const item of items) {
    if (item.id === zelia) {
      expect(item.photoUrl).toMatch(new RegExp(`^/api/photo-files/${photo.photoId}/thumb\\?exp=\\d+&sig=[A-Za-z0-9_-]+$`));
    } else {
      expect(item.photoUrl).toBeNull();
    }
  }
});

test('list_200_writes_one_list_viewed_row_even_when_empty', async () => {
  const { user, client } = await env.stack.session('admin');

  await resetStaff(env.stack);
  const empty = await written(env.stack, () => client.get('/api/staff'));
  expect(empty.result.status).toBe(200);
  expect(((await empty.result.json()) as { items: unknown[] }).items).toEqual([]);
  expect(empty.rows).toHaveLength(1);
  expect(empty.rows[0]).toMatchObject({ action: 'staff.list_viewed', user_id: user.id, entity: 'staff', entity_id: null, diff: null });

  await insertStaff(env.stack, [
    { name: 'Um', cpf: cpfOf(next()) },
    { name: 'Dois', cpf: cpfOf(next()) },
    { name: 'Três', cpf: cpfOf(next()) },
  ]);
  const three = await written(env.stack, () => client.get('/api/staff'));
  expect(((await three.result.json()) as { items: unknown[] }).items).toHaveLength(3);
  expect(three.rows).toHaveLength(1);
  expect(three.rows[0]).toMatchObject({ action: 'staff.list_viewed', user_id: user.id, entity: 'staff', entity_id: null, diff: null });
});

test('read_audit_insert_failure_500_without_staff_data', async () => {
  await resetStaff(env.stack);
  const body = staffBody(next(), { name: 'Pessoa Reservada', phone: '11987654321' });
  const [id] = await insertStaff(env.stack, [{ name: body.name, cpf: body.cpf }]);
  await env.stack.query('update staff set phone = $2 where id = $1', [id, body.phone]);
  const { client } = await env.stack.session('hr_finance');
  const before = await auditCount(env.stack);

  const responses = await withAuditInsertFailing(env.stack, async () => [
    await client.get('/api/staff'),
    await client.get(`/api/staff/${id}`),
  ]);

  for (const response of responses) {
    const text = await response.text();
    expect(response.status).toBe(500);
    expect((JSON.parse(text) as { code: string }).code).toBe('internal_error');
    for (const secret of [body.name, body.cpf, body.phone]) expect(text).not.toContain(secret);
  }
  expect(await auditCount(env.stack)).toBe(before);
});

test('ficha_404_for_non_uuid_and_unknown_uuid', async () => {
  const { client } = await env.stack.session('hr_finance');

  for (const id of ['abc', unknownId()]) {
    const response = await client.get(`/api/staff/${id}`);

    expect(response.status, id).toBe(404);
    expect((await problem(response)).code, id).toBe('not_found');
  }
});

test('eight_non_reading_outcomes_write_no_audit_row', async () => {
  const [id] = await insertStaff(env.stack, [{ name: 'Alvo Protegido', cpf: cpfOf(next()) }]);
  const anonymous = createClient(env.stack.api.url);
  const reception = (await env.stack.session('reception')).client;
  const instructor = (await env.stack.session('instructor')).client;
  const hrFinance = (await env.stack.session('hr_finance')).client;
  const cases: Array<[label: string, status: number, send: () => Promise<Response>]> = [
    ['lista sem cookie', 401, () => anonymous.get('/api/staff')],
    ['ficha sem cookie', 401, () => anonymous.get(`/api/staff/${id}`)],
    ['lista da recepção', 403, () => reception.get('/api/staff')],
    ['ficha da recepção', 403, () => reception.get(`/api/staff/${id}`)],
    ['lista do instrutor', 403, () => instructor.get('/api/staff')],
    ['ficha do instrutor', 403, () => instructor.get(`/api/staff/${id}`)],
    ['ficha com abc', 404, () => hrFinance.get('/api/staff/abc')],
    ['ficha de ninguém', 404, () => hrFinance.get(`/api/staff/${unknownId()}`)],
  ];
  expect(cases).toHaveLength(8);

  for (const [label, status, send] of cases) {
    const before = await auditCount(env.stack);
    const rowsBefore = (await auditRows(env.stack)).length;

    const response = await send();

    expect(response.status, label).toBe(status);
    expect(await auditCount(env.stack), label).toBe(before);
    expect((await auditRows(env.stack)).length, label).toBe(rowsBefore);
  }
});
