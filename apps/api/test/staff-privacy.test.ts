import type { Role, StaffExport } from '@academia/contracts';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { startApi } from './support/app.ts';
import { auditCount, written } from './support/audit.ts';
import { createClient } from './support/client.ts';
import { bucketObject, flakyStorage, jpegBytes, type PhotoStack, startPhotoStack } from './support/photos.ts';
import { databaseNow } from './support/plans.ts';
import { ANONYMIZED_NAME, privacySnapshot } from './support/privacy.ts';
import { problem } from './support/stack.ts';
import {
  bodyFor,
  insertStaff,
  seedStaffPhoto,
  sendStaffPhoto,
  staffBody,
  staffKeys,
  staffPhotoRowsText,
  staffRow,
  staffRowText,
} from './support/staff.ts';
import { cpfOf, unknownId } from './support/students.ts';

let env: PhotoStack;
let admin: Awaited<ReturnType<PhotoStack['stack']['session']>>;
let counter = 83_000;
const next = () => (counter += 1);
const FOREIGN = 'https://outro.example';
const HEADERS = { 'X-Forwarded-For': '203.0.113.11', 'User-Agent': 'teste-funcionario-privacidade/1.0' };

const exportPath = (id: string) => `/api/staff/${id}/data-export`;
const anonymizationPath = (id: string) => `/api/staff/${id}/anonymization`;

/** Os seis campos pessoais de `staff` que a anonimização limpa (door 2). */
const STAFF_PERSONAL_COLUMNS = ['cpf', 'position', 'department', 'hired_at', 'phone', 'email'] as const;

beforeAll(async () => {
  env = await startPhotoStack();
  admin = await env.stack.session('admin');
}, 180_000);

afterAll(() => env?.close());

/**
 * Um funcionário com os sete campos preenchidos, na situação dada, com usuário vinculado ou não, e uma
 * foto trocada uma vez: a versão 1 guardada e a 2 corrente, seis objetos.
 */
async function seedStaff({ status = 'inactive', linked = false }: { status?: string; linked?: boolean } = {}) {
  const n = next();
  const user = linked ? await env.stack.seed({ role: 'instructor' }) : null;
  const [id] = await insertStaff(env.stack, [{ name: `Funcionário Titular ${n}`, cpf: cpfOf(n), status, department: 'Atendimento', userId: user?.id }]);
  await env.stack.query('update staff set email = $2 where id = $1', [id, `funcionario${n}@exemplo.com`]);
  const stored = await seedStaffPhoto(env.stack, env.minio, id!, { version: 1, current: false });
  const current = await seedStaffPhoto(env.stack, env.minio, id!, { version: 2, current: true });
  return { id: id!, n, cpf: cpfOf(n), user, photoIds: [stored.photoId, current.photoId] };
}

const exportOf = (id: string, client = admin.client) => client.get(exportPath(id));
const anonymize = (id: string, client = admin.client) => client.post(anonymizationPath(id));

const instantOf = async (sql: string, values: unknown[]) =>
  (await env.stack.query<{ at: Date | null }>(sql, values))[0]!.at?.toISOString() ?? null;

test('staff_export_200_six_keys_user_and_photos', async () => {
  const subject = await seedStaff({ linked: true });

  const response = await exportOf(subject.id);

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toMatch(/^application\/json/);
  expect(response.headers.get('content-disposition')).toBe(`attachment; filename="funcionario-${subject.id}.json"`);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = (await response.json()) as StaffExport;
  expect(Object.keys(body).sort()).toEqual(['exportedAt', 'formatVersion', 'photos', 'staff', 'subject', 'user']);
  expect(body.formatVersion).toBe(1);
  expect(body.subject).toBe('staff');

  const KEYS = ['id', 'name', 'cpf', 'position', 'department', 'hiredAt', 'phone', 'email', 'status', 'createdAt'];
  expect(KEYS).toHaveLength(10);
  expect(Object.keys(body.staff).sort()).toEqual([...KEYS].sort());
  expect(body.staff).toEqual({
    id: subject.id,
    name: `Funcionário Titular ${subject.n}`,
    cpf: subject.cpf,
    position: 'Recepcionista',
    department: 'Atendimento',
    hiredAt: '2020-01-15',
    phone: '11912345678',
    email: `funcionario${subject.n}@exemplo.com`,
    status: 'inactive',
    createdAt: await instantOf('select created_at as at from staff where id = $1', [subject.id]),
  });

  expect(body.user).toEqual({ email: subject.user!.email, role: 'instructor' });

  expect(body.photos).toHaveLength(2);
  const rows = await env.stack.query<{ id: string; version: number; is_current: boolean; created_at: Date; expires_at: Date | null }>(
    'select id, version, is_current, created_at, expires_at from photos where staff_id = $1 order by version',
    [subject.id],
  );
  for (const [index, photo] of body.photos.entries()) {
    const row = rows[index]!;
    expect(Object.keys(photo).sort()).toEqual(['createdAt', 'expiresAt', 'image', 'isCurrent', 'version']);
    expect(photo).toMatchObject({
      version: row.version,
      isCurrent: row.is_current,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at?.toISOString() ?? null,
    });
    expect(photo.image.startsWith('data:image/webp;base64,')).toBe(true);
    const bytes = Buffer.from(photo.image.slice('data:image/webp;base64,'.length), 'base64');
    const stored = await bucketObject(env.minio, `photos/main/${subject.id}/${row.id}/large.webp`);
    expect(bytes.equals(stored), `foto ${row.version}`).toBe(true);
  }
  expect(body.photos.map((photo) => photo.isCurrent)).toEqual([false, true]);

  // sem usuário vinculado, `user` é `null`
  const unlinked = await seedStaff();
  const unlinkedBody = (await (await exportOf(unlinked.id)).json()) as StaffExport;
  expect(unlinkedBody.user).toBeNull();
});

test('staff_export_writes_staff_exported_and_storage_down_is_503_without_row', async () => {
  const subject = await seedStaff();

  const { result, rows } = await written(env.stack, () => admin.client.get(exportPath(subject.id), { headers: HEADERS }));

  expect(result.status).toBe(200);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: 'staff.exported',
    entity: 'staff',
    entity_id: subject.id,
    user_id: admin.user.id,
    ip: '203.0.113.11',
    user_agent: 'teste-funcionario-privacidade/1.0',
    diff: null,
  });
  expect(rows.filter((row) => row.action === 'staff.viewed')).toEqual([]);

  const proxy = await flakyStorage(env.minio.endpoint);
  const api = await startApi(env.stack.postgres.url, [], { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  try {
    const user = await env.stack.seed({ role: 'admin' });
    const client = await env.stack.signIn(user, createClient(api.url));
    await env.stack.query('update users set two_factor_enabled = true where id = $1', [user.id]);
    proxy.down = true;
    const before = await auditCount(env.stack);

    const response = await client.get(exportPath(subject.id));

    expect(response.status).toBe(503);
    expect((await problem(response)).code).toBe('storage_unavailable');
    expect(await auditCount(env.stack)).toBe(before);
  } finally {
    await api.close();
    await proxy.stop();
  }
});

test('staff_anonymize_204_clears_six_fields_photos_objects_and_writes_row', async () => {
  const subject = await seedStaff();
  const before = (await staffRow(env.stack, subject.id))!;
  expect(STAFF_PERSONAL_COLUMNS).toHaveLength(6);
  for (const column of STAFF_PERSONAL_COLUMNS) expect(before[column], column).not.toBeNull();
  expect(await staffKeys(env.minio, subject.id)).toHaveLength(6);

  const t0 = await databaseNow(env.stack);
  const { result, rows } = await written(env.stack, () => anonymize(subject.id));
  const t1 = await databaseNow(env.stack);

  expect(result.status).toBe(204);
  expect(await result.text()).toBe('');
  const after = (await staffRow(env.stack, subject.id))!;
  expect(after.name).toBe(ANONYMIZED_NAME);
  for (const column of STAFF_PERSONAL_COLUMNS) expect(after[column], column).toBeNull();
  const anonymizedAt = new Date(after.anonymized_at as string).getTime();
  expect(anonymizedAt).toBeGreaterThanOrEqual(t0.getTime());
  expect(anonymizedAt).toBeLessThanOrEqual(t1.getTime());
  expect(await env.stack.query('select id from photos where staff_id = $1', [subject.id])).toEqual([]);
  expect(await staffKeys(env.minio, subject.id)).toEqual([]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: 'staff.anonymized',
    entity: 'staff',
    entity_id: subject.id,
    user_id: admin.user.id,
    diff: null,
  });
});

test('staff_active_409_not_inactive_and_linked_user_409_staff_user_linked', async () => {
  const active = await seedStaff({ status: 'active' });
  const linked = await seedStaff({ linked: true });

  for (const [label, id, code] of [
    ['active', active.id, 'subject_not_inactive'],
    ['vinculado', linked.id, 'staff_user_linked'],
  ] as const) {
    const before = await privacySnapshot(env.stack, env.minio);
    const response = await anonymize(id);
    expect(response.status, label).toBe(409);
    expect((await problem(response)).code, label).toBe(code);
    expect(await privacySnapshot(env.stack, env.minio), label).toEqual(before);
  }
});

test('staff_storage_failure_is_503_and_rows_unchanged', async () => {
  const subject = await seedStaff();
  const subjectKeys = await staffKeys(env.minio, subject.id);
  expect(subjectKeys).toHaveLength(6);
  const proxy = await flakyStorage(env.minio.endpoint);
  const api = await startApi(env.stack.postgres.url, [], { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  try {
    const user = await env.stack.seed({ role: 'admin' });
    const client = await env.stack.signIn(user, createClient(api.url));
    await env.stack.query('update users set two_factor_enabled = true where id = $1', [user.id]);
    const before = await privacySnapshot(env.stack, env.minio);
    proxy.failDeleteOf = 'large';

    const response = await client.post(anonymizationPath(subject.id));

    expect(response.status).toBe(503);
    expect((await problem(response)).code).toBe('storage_unavailable');
    // as nove tabelas voltam com a transação, mas o bucket não volta: a remoção não é transacional
    const interrupted = await privacySnapshot(env.stack, env.minio);
    expect(interrupted.tables).toEqual(before.tables);
    expect(interrupted.audit).toBe(before.audit);
    // saíram os quatro `thumb`/`medium` das duas fotos; ficaram os dois `large`, cuja remoção foi recusada
    expect(interrupted.keys).toEqual(before.keys.filter((key) => !subjectKeys.includes(key) || key.endsWith('/large.webp')));

    // com o armazenamento de volta, a mesma chamada termina
    proxy.failDeleteOf = null;
    const retried = await client.post(anonymizationPath(subject.id));
    expect(retried.status).toBe(204);
    expect(await staffKeys(env.minio, subject.id)).toEqual([]);
  } finally {
    await api.close();
    await proxy.stop();
  }
});

test('every_staff_route_is_404_for_anonymized_ten_routes_and_list_omits_it', async () => {
  const subject = await seedStaff();
  expect((await anonymize(subject.id)).status).toBe(204);
  const photo = await jpegBytes();

  type Route = { method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; path: string };
  const ROUTES: Route[] = [
    { method: 'GET', path: '/api/staff/:id' },
    { method: 'PATCH', path: '/api/staff/:id' },
    { method: 'DELETE', path: '/api/staff/:id' },
    { method: 'PUT', path: '/api/staff/:id/user' },
    { method: 'DELETE', path: '/api/staff/:id/user' },
    { method: 'POST', path: '/api/staff/:id/photo' },
    { method: 'PUT', path: '/api/staff/:id/photo' },
    { method: 'DELETE', path: '/api/staff/:id/photo' },
    { method: 'GET', path: '/api/staff/:id/data-export' },
    { method: 'POST', path: '/api/staff/:id/anonymization' },
  ];
  expect(ROUTES).toHaveLength(10);
  const linkable = await env.stack.seed({ role: 'instructor' });

  for (const route of ROUTES) {
    const path = route.path.replace(':id', subject.id);
    const label = `${route.method} ${route.path}`;
    const response =
      route.path.endsWith('/photo') && route.method !== 'DELETE'
        ? await sendStaffPhoto(admin.client, route.method as 'POST' | 'PUT', subject.id, photo)
        : await admin.client.request(route.method, path, {
            body: route.path.endsWith('/user') && route.method === 'PUT' ? { userId: linkable.id } : bodyFor(route),
          });
    expect(response.status, label).toBe(404);
    expect((await problem(response)).code, label).toBe('not_found');
  }
  expect(await env.stack.query(`select id from audit_logs where action = 'staff.viewed' and entity_id = $1`, [subject.id])).toEqual([]);
  // a linha continua anonimizada e sem usuário: nenhuma das dez mudou nada
  const row = (await staffRow(env.stack, subject.id))!;
  expect(row.name).toBe(ANONYMIZED_NAME);
  expect(row.user_id).toBeNull();
  expect(await env.stack.query('select id from photos where staff_id = $1', [subject.id])).toEqual([]);

  const list = (await (await admin.client.get('/api/staff')).json()) as { items: Array<{ id: string }> };
  expect(list.items.map((item) => item.id)).not.toContain(subject.id);
});

test('cpf_of_anonymized_staff_can_be_registered_again', async () => {
  const subject = await seedStaff();
  expect((await anonymize(subject.id)).status).toBe(204);
  const { client } = await env.stack.session('hr_finance');

  const response = await client.post('/api/staff', staffBody(subject.n));

  expect(response.status).toBe(201);
  expect(((await response.json()) as { cpf: string }).cpf).toBe(subject.cpf);
});

test('staff_privacy_403_three_roles_401_anonymous_404_unknown_and_non_uuid', async () => {
  const existing = await seedStaff();
  const sessions: Array<[Role, Awaited<ReturnType<PhotoStack['stack']['session']>>['client']]> = [];
  for (const role of ['hr_finance', 'reception', 'instructor'] as Role[]) sessions.push([role, (await env.stack.session(role)).client]);
  const before = await privacySnapshot(env.stack, env.minio);

  for (const [role, client] of sessions) {
    for (const id of [existing.id, unknownId()]) {
      for (const [label, call] of [
        ['exportação', () => exportOf(id, client)],
        ['anonimização', () => anonymize(id, client)],
      ] as const) {
        const response = await call();
        expect(response.status, `${role} ${label} ${id}`).toBe(403);
        expect((await problem(response)).code, `${role} ${label} ${id}`).toBe('forbidden');
      }
    }
  }
  for (const call of [() => exportOf(existing.id, env.stack.client()), () => anonymize(existing.id, env.stack.client())]) {
    const response = await call();
    expect(response.status).toBe(401);
    expect((await problem(response)).code).toBe('unauthorized');
  }
  expect(await privacySnapshot(env.stack, env.minio)).toEqual(before);

  for (const id of [unknownId(), 'abc']) {
    for (const [label, call] of [
      ['exportação', () => exportOf(id)],
      ['anonimização', () => anonymize(id)],
    ] as const) {
      const response = await call();
      expect(response.status, `${label} ${id}`).toBe(404);
      expect((await problem(response)).code, `${label} ${id}`).toBe('not_found');
    }
  }
});

test('staff_anonymize_leaves_another_staff_identical', async () => {
  const subject = await seedStaff();
  const neighbor = await seedStaff();
  const before = {
    staff: await staffRowText(env.stack, neighbor.id),
    photos: await staffPhotoRowsText(env.stack, neighbor.id),
    keys: await staffKeys(env.minio, neighbor.id),
  };
  expect(before.photos).toHaveLength(2);
  expect(before.keys).toHaveLength(6);

  expect((await anonymize(subject.id)).status).toBe(204);

  expect({
    staff: await staffRowText(env.stack, neighbor.id),
    photos: await staffPhotoRowsText(env.stack, neighbor.id),
    keys: await staffKeys(env.minio, neighbor.id),
  }).toEqual(before);
});

test('staff_not_inactive_comes_before_user_linked', async () => {
  const subject = await seedStaff({ status: 'active', linked: true });

  const response = await anonymize(subject.id);

  expect(response.status).toBe(409);
  expect((await problem(response)).code).toBe('subject_not_inactive');
});

test('staff_foreign_origin_is_403_csrf_and_nothing_changes', async () => {
  const subject = await seedStaff();
  const before = await privacySnapshot(env.stack, env.minio);

  const response = await admin.client.post(anonymizationPath(subject.id), undefined, { origin: FOREIGN });

  expect(response.status).toBe(403);
  expect((await problem(response)).code).toBe('csrf_rejected');
  expect(await privacySnapshot(env.stack, env.minio)).toEqual(before);
});
