import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { auditCount, withAuditInsertFailing, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import {
  bucketKeys,
  bucketObject,
  jpegBytes,
  keysOf,
  type PhotoStack,
  replacePhoto,
  sha256,
  startPhotoStack,
  uploaded,
  uploadPhoto,
} from './support/photos.ts';
import { insertStaff, postStaffPhoto, putStaffPhoto, staffKeys, staffPhotoRowsText } from './support/staff.ts';
import { cpfOf, createStudent, studentBody } from './support/students.ts';

let env: PhotoStack;
let admin: Client;
let hr: Client;
let counter = 9000;
const next = () => (counter += 1);

beforeAll(async () => {
  env = await startPhotoStack();
  admin = (await env.stack.session('admin')).client;
  hr = (await env.stack.session('hr_finance')).client;
}, 240_000);

afterEach(async () => {
  // o que um teste deixou guardado não vence dentro do teste seguinte
  await env.stack.query(`update photos set expires_at = now() + interval '300 days' where not is_current`);
});

afterAll(() => env?.close());

const EXPIRED = `now() - interval '1 second'`;
const UNEXPIRED = `now() + interval '1 minute'`;
const hashesOf = (keys: string[]) => Promise.all(keys.map(async (key) => sha256(await bucketObject(env.minio, key))));

/** Um funcionário com foto corrente e `stored` versões guardadas, todas com o prazo dado. */
async function staffWithVersions(expiry: string, stored = 1) {
  const staffId = (await insertStaff(env.stack, [{ name: `Pessoa ${next()}`, cpf: cpfOf(next()) }]))[0]!;
  const ids = [(await uploaded(await postStaffPhoto(hr, staffId, await jpegBytes()))).id];
  for (let n = 0; n < stored; n += 1) ids.push((await uploaded(await putStaffPhoto(hr, staffId, await jpegBytes()))).id);
  const currentId = ids.pop()!;
  await env.stack.query(`update photos set expires_at = ${expiry} where staff_id = $1 and not is_current`, [staffId]);
  return { staffId, storedIds: ids, currentId };
}

/** Um aluno com foto corrente e `stored` versões guardadas, todas com o prazo dado. */
async function studentWithVersions(expiry: string, stored = 1) {
  const studentId = (await createStudent(admin, studentBody(next()))).id;
  const ids = [(await uploaded(await uploadPhoto(admin, studentId, await jpegBytes()))).id];
  for (let n = 0; n < stored; n += 1) ids.push((await uploaded(await replacePhoto(admin, studentId, await jpegBytes()))).id);
  const currentId = ids.pop()!;
  await env.stack.query(`update photos set expires_at = ${expiry} where student_id = $1 and not is_current`, [studentId]);
  return { studentId, storedIds: ids, currentId };
}

const rowExists = async (photoId: string) => (await env.stack.query('select 1 from photos where id = $1', [photoId])).length === 1;

test('purge_removes_expired_staff_versions_with_authorless_rows_in_the_delete_transaction', async () => {
  const one = await staffWithVersions(EXPIRED);
  const two = await staffWithVersions(EXPIRED, 2);
  const expired = [
    ...one.storedIds.map((id) => [one.staffId, id] as const),
    ...two.storedIds.map((id) => [two.staffId, id] as const),
  ];
  expect(expired).toHaveLength(3);
  for (const [staffId, id] of expired) expect(await bucketKeys(env.minio, `photos/main/${staffId}/${id}/`)).toHaveLength(3);
  const keysBefore = await bucketKeys(env.minio);

  const { rows } = await written(env.stack, () => env.stack.api.purge());

  for (const [staffId, id] of expired) {
    expect(await rowExists(id), id).toBe(false);
    expect(await bucketKeys(env.minio, `photos/main/${staffId}/${id}/`), id).toEqual([]);
  }
  expect(await bucketKeys(env.minio)).toHaveLength(keysBefore.length - 9);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row).toMatchObject({ action: 'staff.photo_version_purged', entity: 'staff', diff: null, user_id: null, ip: null, user_agent: null });
  }
  expect(rows.map((row) => row.entity_id).sort()).toEqual([one.staffId, two.staffId, two.staffId].sort());

  // com o insert da auditoria falhando, a exclusão da linha é desfeita junto
  const failing = await staffWithVersions(EXPIRED);
  const rowsBefore = await staffPhotoRowsText(env.stack, failing.staffId);
  expect(rowsBefore).toHaveLength(2);
  const auditBefore = await auditCount(env.stack);

  await withAuditInsertFailing(env.stack, () => env.stack.api.purge());

  expect(await staffPhotoRowsText(env.stack, failing.staffId)).toEqual(rowsBefore);
  expect(await auditCount(env.stack)).toBe(auditBefore);

  const again = await written(env.stack, () => env.stack.api.purge());

  const remaining = await staffPhotoRowsText(env.stack, failing.staffId);
  expect(remaining).toHaveLength(1);
  expect(remaining[0]).toContain(failing.currentId);
  expect(again.rows).toHaveLength(1);
  expect(again.rows[0]).toMatchObject({ action: 'staff.photo_version_purged', entity: 'staff', entity_id: failing.staffId, user_id: null });
  expect(await staffKeys(env.minio, failing.staffId)).toEqual(keysOf(failing.staffId, failing.currentId));
});

test('purge_serves_student_and_staff_versions_in_one_run', async () => {
  /** v1 vencida, v2 não vencida e v3 corrente com 400 dias, num dono só. */
  const owned = async (made: { currentId: string; storedIds: string[] }, ownerColumn: 'student_id' | 'staff_id', ownerId: string) => {
    const [expired, unexpired] = made.storedIds as [string, string];
    await env.stack.query(`update photos set expires_at = ${UNEXPIRED} where id = $1`, [unexpired]);
    await env.stack.query(`update photos set created_at = now() - interval '400 days' where id = $1`, [made.currentId]);
    expect(await env.stack.query(`select 1 from photos where ${ownerColumn} = $1`, [ownerId])).toHaveLength(3);
    return { expired, kept: [unexpired, made.currentId] };
  };
  const student = await studentWithVersions(EXPIRED, 2);
  const staff = await staffWithVersions(EXPIRED, 2);
  const studentIds = await owned(student, 'student_id', student.studentId);
  const staffIds = await owned(staff, 'staff_id', staff.staffId);
  const kept = [
    ...studentIds.kept.map((id) => [student.studentId, id] as const),
    ...staffIds.kept.map((id) => [staff.staffId, id] as const),
  ];
  expect(kept).toHaveLength(4);
  const rowText = async (photoId: string) =>
    (await env.stack.query<{ row: string }>('select to_jsonb(p)::text as row from photos p where id = $1', [photoId]))[0]!.row;
  const before = await Promise.all(kept.map(async ([ownerId, id]) => ({ row: await rowText(id), hashes: await hashesOf(keysOf(ownerId, id)) })));
  const keysBefore = await bucketKeys(env.minio);

  const { rows } = await written(env.stack, () => env.stack.api.purge());

  // as duas vencidas saíram, com as seis chaves delas
  expect(await rowExists(studentIds.expired)).toBe(false);
  expect(await rowExists(staffIds.expired)).toBe(false);
  expect(await bucketKeys(env.minio, `photos/main/${student.studentId}/${studentIds.expired}/`)).toEqual([]);
  expect(await bucketKeys(env.minio, `photos/main/${staff.staffId}/${staffIds.expired}/`)).toEqual([]);
  expect(await bucketKeys(env.minio)).toHaveLength(keysBefore.length - 6);
  // cada dono com a ação e a entidade dele
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.entity === 'student')).toMatchObject({
    action: 'student.photo_version_purged',
    entity_id: student.studentId,
    diff: null,
    user_id: null,
  });
  expect(rows.find((row) => row.entity === 'staff')).toMatchObject({
    action: 'staff.photo_version_purged',
    entity_id: staff.staffId,
    diff: null,
    user_id: null,
  });
  // as outras quatro linhas e os doze objetos delas ficaram idênticos
  for (const [index, [ownerId, id]] of kept.entries()) {
    expect(await rowText(id), id).toBe(before[index]!.row);
    expect(await bucketKeys(env.minio, `photos/main/${ownerId}/${id}/`), id).toEqual(keysOf(ownerId, id));
    expect(await hashesOf(keysOf(ownerId, id)), id).toEqual(before[index]!.hashes);
  }
});
