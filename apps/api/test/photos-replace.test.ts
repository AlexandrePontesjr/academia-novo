import { randomUUID } from 'node:crypto';
import type { Problem, Role } from '@academia/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { auditCount, withAuditInsertFailing, written } from './support/audit.ts';
import type { Client } from './support/client.ts';
import {
  apiWith,
  blankPng,
  BLUE,
  bucketKeys,
  bucketObject,
  databaseNow,
  flakyStorage,
  isBlue,
  isRed,
  jpegBytes,
  keysOf,
  multipart,
  noise,
  padJpeg,
  painted,
  photoCount,
  photoRowsText,
  type PhotoStack,
  pixelAt,
  putParts,
  RED,
  replacePhoto,
  sha256,
  snapshotOf,
  solid,
  startPhotoStack,
  uploadKeys,
  uploadPhoto,
  uploaded,
  versionRows,
} from './support/photos.ts';
import { freePort } from './support/servers.ts';
import { problem } from './support/stack.ts';
import { createStudent, releasedTogether, setStatus, studentBody } from './support/students.ts';

let env: PhotoStack;
let reception: Client;
let admin: Client;
let students = 2100;

beforeAll(async () => {
  env = await startPhotoStack();
  reception = (await env.stack.session('reception')).client;
  admin = (await env.stack.session('admin')).client;
}, 240_000);

afterAll(() => env?.close());

const VARIANTS = ['thumb', 'medium', 'large'] as const;
const MAX = 5 * 1024 * 1024;
const newStudent = async () => (await createStudent(reception, studentBody((students += 1)))).id;
const sessionOf = async (role: Role) => (await env.stack.session(role)).client;
const photoPath = (studentId: string) => `/api/students/${studentId}/photo`;

/** Um aluno com foto corrente de `version` igual a `1`, enviada por `POST`. */
async function studentWithPhoto() {
  const studentId = await newStudent();
  const first = await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));
  expect(first.version, 'foto de preparação').toBe(1);
  return { studentId, first };
}

const objectOf = (studentId: string, photoId: string, variant: string) =>
  bucketObject(env.minio, `photos/main/${studentId}/${photoId}/${variant}.webp`);

test('replace_201_by_admin_and_reception_version_2', async () => {
  for (const [name, client] of [['admin', admin], ['reception', reception]] as const) {
    const { studentId, first } = await studentWithPhoto();

    const response = await replacePhoto(client, studentId, await jpegBytes(800, 1000));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status, name).toBe(201);
    expect(Object.keys(body).sort(), name).toEqual(['createdAt', 'id', 'version']);
    expect(body.version, name).toBe(2);
    expect(new Date(body.createdAt as string).toISOString(), name).toBe(body.createdAt);
    const current = await env.stack.query<{ id: string }>('select id from photos where student_id = $1 and is_current', [studentId]);
    expect(current, name).toHaveLength(1);
    expect(body.id, name).toBe(current[0]!.id);
    expect(body.id, name).not.toBe(first.id);
  }
});

test('previous_row_kept_with_expiry_30_days_and_new_one_is_the_only_current', async () => {
  const { studentId, first } = await studentWithPhoto();

  const t0 = await databaseNow(env.stack);
  const second = await uploaded(await replacePhoto(reception, studentId, await jpegBytes()));
  const t1 = await databaseNow(env.stack);

  const afterFirst = await versionRows(env.stack, studentId, t0, t1, 30);
  expect(afterFirst).toHaveLength(2);
  expect(afterFirst[0]).toMatchObject({ id: first.id, version: 1, is_current: false, in_window: true });
  expect(afterFirst[0]!.expires_at).not.toBeNull();
  expect(afterFirst[1]).toMatchObject({ id: second.id, version: 2, is_current: true, expires_at: null });
  expect(afterFirst.filter((row) => row.is_current)).toHaveLength(1);

  const t2 = await databaseNow(env.stack);
  const third = await uploaded(await replacePhoto(reception, studentId, await jpegBytes()));
  const t3 = await databaseNow(env.stack);

  expect(third.version).toBe(3);
  const afterSecond = await versionRows(env.stack, studentId, t2, t3, 30);
  expect(afterSecond).toHaveLength(3);
  // a versão mais antiga não é recarimbada
  expect(afterSecond[0]).toMatchObject({ id: first.id, version: 1, is_current: false });
  expect(afterSecond[0]!.expires_at).toBe(afterFirst[0]!.expires_at);
  expect(afterSecond[1]).toMatchObject({ id: second.id, version: 2, is_current: false, in_window: true });
  expect(afterSecond[2]).toMatchObject({ id: third.id, version: 3, is_current: true, expires_at: null });
});

test('six_objects_after_replace_three_old_untouched_three_new', async () => {
  const { studentId, first } = await studentWithPhoto();
  const oldKeys = keysOf(studentId, first.id);
  expect(await uploadKeys(env.minio, studentId)).toEqual(oldKeys);
  const hashesBefore = await Promise.all(oldKeys.map(async (key) => sha256(await bucketObject(env.minio, key))));

  const second = await uploaded(await replacePhoto(reception, studentId, await jpegBytes(900, 1200, BLUE)));

  const keys = await uploadKeys(env.minio, studentId);
  expect(keys).toHaveLength(6);
  expect(keys).toEqual([...oldKeys, ...keysOf(studentId, second.id)].sort());
  expect(await Promise.all(oldKeys.map(async (key) => sha256(await bucketObject(env.minio, key))))).toEqual(hashesBefore);
});

test('every_read_route_signs_the_new_photo_and_old_url_serves_until_exp', async () => {
  const { studentId, first } = await studentWithPhoto();
  const urlOf = async (query = '') => ((await (await reception.get(`${photoPath(studentId)}${query}`)).json()) as { url: string }).url;
  const oldUrl = await urlOf();
  const oldMedium = await objectOf(studentId, first.id, 'medium');
  expect(oldUrl).toContain(`/api/photo-files/${first.id}/medium?`);

  const second = await uploaded(await replacePhoto(reception, studentId, await jpegBytes(900, 1200, BLUE)));

  const medium = await urlOf();
  expect(medium).toContain(`/api/photo-files/${second.id}/medium?`);
  expect(await urlOf('?variant=thumb')).toContain(`/api/photo-files/${second.id}/thumb?`);
  const ficha = (await (await reception.get(`/api/students/${studentId}`)).json()) as { photoUrl: string };
  expect(ficha.photoUrl).toContain(`/api/photo-files/${second.id}/`);
  const list = (await (await reception.get(`/api/students?q=Aluno ${students}`)).json()) as {
    items: Array<{ id: string; photoUrl: string }>;
  };
  expect(list.items.find((item) => item.id === studentId)!.photoUrl).toContain(`/api/photo-files/${second.id}/`);

  const newMedium = await objectOf(studentId, second.id, 'medium');
  expect(newMedium.equals(oldMedium)).toBe(false);
  const opened = await fetch(`${env.stack.api.url}${medium}`);
  expect(opened.status).toBe(200);
  expect(Buffer.from(await opened.arrayBuffer()).equals(newMedium)).toBe(true);

  // a URL emitida antes da troca segue entregando a foto anterior enquanto `exp` não passa
  const old = await fetch(`${env.stack.api.url}${oldUrl}`);
  expect(old.status).toBe(200);
  expect(Buffer.from(await old.arrayBuffer()).equals(oldMedium)).toBe(true);
});

test('put_without_current_photo_creates_version_1', async () => {
  const never = await newStudent();
  const removed = (await studentWithPhoto()).studentId;
  expect((await reception.delete(photoPath(removed))).status).toBe(204);

  for (const [name, studentId] of [['nunca teve foto', never], ['foto removida', removed]] as const) {
    const response = await replacePhoto(reception, studentId, await jpegBytes());

    expect(response.status, name).toBe(201);
    const body = (await response.json()) as { id: string; version: number };
    expect(body.version, name).toBe(1);
    const rows = await versionRows(env.stack, studentId);
    expect(rows, name).toHaveLength(1);
    expect(rows[0], name).toMatchObject({ id: body.id, is_current: true, expires_at: null });
    expect(await uploadKeys(env.minio, studentId), name).toEqual(keysOf(studentId, body.id));
  }
});

test('nine_rejected_files_same_status_and_code_as_post_and_nothing_changes', async () => {
  const jpeg = await jpegBytes(800, 1000);
  const truncated = await noise(800, 1000).jpeg().toBuffer();
  const file = (bytes: Buffer, type = 'image/jpeg', filename = 'foto.jpg') => ({ name: 'file', bytes, filename, type });
  type Send = (path: string, method: 'PUT' | 'POST') => Promise<Response>;
  const parts =
    (list: Parameters<typeof putParts>[2]): Send =>
    (path, method) => {
      const { body, contentType } = multipart(list);
      return reception.request(method, path, { body, headers: { 'Content-Type': contentType } });
    };
  const cases: Array<[name: string, status: number, code: string, send: Send, onFile: boolean]> = [
    ['texto enviado como image/jpeg (AC 9)', 415, 'unsupported_media_type', parts([file(Buffer.from('isto é só texto. '.repeat(40)))]), false],
    [
      'GIF (AC 9)',
      415,
      'unsupported_media_type',
      parts([file(Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00;', 'latin1'), 'image/gif', 'foto.gif')]),
      false,
    ],
    ['corpo application/json (AC 10)', 415, 'unsupported_media_type', (path, method) => reception.request(method, path, { body: { file: 'x' } }), false],
    ['parte file de 5 242 881 bytes (AC 11)', 413, 'payload_too_large', parts([file(padJpeg(jpeg, MAX + 1))]), false],
    ['multipart sem parte file (AC 12)', 422, 'validation_failed', parts([{ name: 'legenda', value: 'minha foto' }]), true],
    ['duas partes file (AC 12)', 422, 'validation_failed', parts([file(jpeg, 'image/jpeg', 'a.jpg'), file(jpeg, 'image/jpeg', 'b.jpg')]), true],
    ['PNG de 299×400 (AC 13)', 422, 'validation_failed', parts([file(await solid(299, 400).png().toBuffer(), 'image/png', 'foto.png')]), true],
    ['PNG de 3015×13267 (AC 14)', 422, 'validation_failed', parts([file(blankPng(3015, 13_267), 'image/png', 'foto.png')]), true],
    ['JPEG truncado na metade (AC 15)', 422, 'validation_failed', parts([file(truncated.subarray(0, Math.floor(truncated.length / 2)))]), true],
  ];
  expect(cases).toHaveLength(9);
  expect(padJpeg(jpeg, MAX + 1)).toHaveLength(5_242_881);

  const { studentId } = await studentWithPhoto();
  const photoless = await newStudent();
  for (const [name, status, code, send, onFile] of cases) {
    // o que o `POST` responde ao mesmo arquivo, num aluno sem foto
    const posted = await send(photoPath(photoless), 'POST');
    const postedBody = await problem(posted);
    expect([posted.status, postedBody.code], `POST: ${name}`).toEqual([status, code]);
    const before = await snapshotOf(env.stack, env.minio);

    const response = await send(photoPath(studentId), 'PUT');

    const body = await problem(response);
    expect(response.status, name).toBe(status);
    expect(body.code, name).toBe(code);
    expect([response.status, body.code], name).toEqual([posted.status, postedBody.code]);
    if (onFile) expect((body.errors ?? []).map((error) => error.path), name).toEqual(['file']);
    expect(await snapshotOf(env.stack, env.minio), name).toEqual(before);
  }

  const exactly = padJpeg(jpeg, MAX);
  expect(exactly).toHaveLength(5_242_880);
  expect((await replacePhoto(reception, studentId, exactly)).status, '5 242 880 bytes').toBe(201);
});

test('put_runs_the_same_variant_pipeline_six_properties', async () => {
  const currentIdOf = async (studentId: string) => (await versionRows(env.stack, studentId)).find((row) => row.is_current)!.id;

  // AC 16: três WebP de 96×128, 240×320 e 600×800
  {
    const { studentId } = await studentWithPhoto();
    const { id } = await uploaded(await replacePhoto(reception, studentId, await jpegBytes(800, 1000)));
    const sizes: Record<string, [number, number]> = { thumb: [96, 128], medium: [240, 320], large: [600, 800] };
    for (const variant of VARIANTS) {
      const metadata = await sharp(await objectOf(studentId, id, variant)).metadata();
      expect([metadata.format, metadata.width, metadata.height], `AC 16 ${variant}`).toEqual(['webp', ...sizes[variant]!]);
    }
  }

  // AC 17: recorte central
  {
    const { studentId } = await studentWithPhoto();
    const halves = await painted(800, 800, (x) => (x < 400 ? RED : BLUE)).png().toBuffer();
    const { id } = await uploaded(await replacePhoto(reception, studentId, halves, { type: 'image/png', filename: 'foto.png' }));
    const large = await objectOf(studentId, id, 'large');
    expect(isRed(await pixelAt(large, 0.25, 0.5)), 'AC 17: vermelha a 25% da largura').toBe(true);
    expect(isBlue(await pixelAt(large, 0.75, 0.5)), 'AC 17: azul a 75% da largura').toBe(true);
  }

  // AC 18: orientação EXIF 6
  {
    const { studentId } = await studentWithPhoto();
    const rotated = await painted(400, 300, (_x, y) => (y < 150 ? RED : BLUE)).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(rotated).metadata()).orientation).toBe(6);
    const { id } = await uploaded(await replacePhoto(reception, studentId, rotated));
    const large = await objectOf(studentId, id, 'large');
    expect(isRed(await pixelAt(large, 0.75, 0.5)), 'AC 18: metade direita vermelha').toBe(true);
    expect(isBlue(await pixelAt(large, 0.25, 0.5)), 'AC 18: metade esquerda azul').toBe(true);
  }

  // AC 19: sem EXIF, sem GPS, sem o marcador
  {
    const MARKER = 'CAMERA-SECRETA-77';
    const DATUM = 'DATUM-SECRETO-GPS-88';
    const { studentId } = await studentWithPhoto();
    const marked = await solid(800, 1000)
      .jpeg()
      .withExif({
        IFD0: { Make: MARKER },
        IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 32/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '46/1 38/1 0/1', GPSMapDatum: DATUM },
      })
      .toBuffer();
    expect((await sharp(marked).metadata()).exif).toBeDefined();
    expect(marked.includes(MARKER) && marked.includes(DATUM)).toBe(true);
    const { id } = await uploaded(await replacePhoto(reception, studentId, marked));
    for (const variant of VARIANTS) {
      const bytes = await objectOf(studentId, id, variant);
      expect((await sharp(bytes).metadata()).exif, `AC 19 ${variant}: bloco EXIF`).toBeUndefined();
      expect(bytes.includes(MARKER), `AC 19 ${variant}: marcador`).toBe(false);
      expect(bytes.includes(DATUM), `AC 19 ${variant}: coordenadas`).toBe(false);
    }
  }

  // AC 20: sem o original e sem o nome dele
  {
    const { studentId } = await studentWithPhoto();
    const original = await jpegBytes(800, 1000, BLUE);
    await uploaded(await replacePhoto(reception, studentId, original, { filename: 'foto-original-unica.jpg' }));
    const keys = await bucketKeys(env.minio);
    expect(keys.filter((key) => key.includes('foto-original-unica')), 'AC 20: nome na chave').toEqual([]);
    const hashes = await Promise.all(keys.map(async (key) => sha256(await bucketObject(env.minio, key))));
    expect(hashes, 'AC 20: o original no bucket').not.toContain(sha256(original));
  }

  // AC 21: nada do cliente na chave
  {
    const { studentId, first } = await studentWithPhoto();
    await uploaded(await replacePhoto(reception, studentId, await jpegBytes(), { filename: '../../etc/passwd.jpg' }));
    const photoId = await currentIdOf(studentId);
    const added = (await uploadKeys(env.minio, studentId)).filter((key) => !key.includes(first.id));
    expect(added, 'AC 21').toHaveLength(3);
    const pattern = new RegExp(`^photos/main/${studentId}/${photoId}/(thumb|medium|large)\\.webp$`);
    for (const key of added) expect(key, 'AC 21').toMatch(pattern);
  }
});

test('put_404_for_bad_and_unknown_id_writes_nothing', async () => {
  const before = await snapshotOf(env.stack, env.minio);

  for (const id of ['abc', randomUUID()]) {
    const response = await replacePhoto(reception, id, await jpegBytes());

    expect(response.status, id).toBe(404);
    expect((await problem(response)).code, id).toBe('not_found');
  }

  expect(await snapshotOf(env.stack, env.minio)).toEqual(before);
});

test('hr_finance_and_instructor_403_on_put', async () => {
  const { studentId } = await studentWithPhoto();
  // o login de cada perfil também grava na trilha: as sessões abrem antes de medir
  const clients = { hr_finance: await sessionOf('hr_finance'), instructor: await sessionOf('instructor') };
  const before = await snapshotOf(env.stack, env.minio);

  for (const role of ['hr_finance', 'instructor'] as const) {
    const response = await replacePhoto(clients[role], studentId, await jpegBytes());

    expect(response.status, role).toBe(403);
    expect((await problem(response)).code, role).toBe('forbidden');
  }

  expect(await snapshotOf(env.stack, env.minio)).toEqual(before);
});

test('put_401_without_session', async () => {
  const { studentId } = await studentWithPhoto();

  const response = await replacePhoto(env.stack.client(), studentId, await jpegBytes());

  expect(response.status).toBe(401);
  expect((await problem(response)).code).toBe('unauthorized');
});

test('storage_failure_on_each_variant_and_down_503_keeps_previous_current', async () => {
  const proxy = await flakyStorage(env.minio.endpoint);
  const flaky = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  const down = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: `http://127.0.0.1:${await freePort()}` });
  try {
    const cases: Array<[string, Client, () => void]> = [
      ...VARIANTS.map((variant): [string, Client, () => void] => [
        `escrita de ${variant}`,
        flaky.client,
        () => {
          proxy.failWriteOf = variant;
        },
      ]),
      ['endpoint fora', down.client, () => undefined],
    ];
    expect(cases).toHaveLength(4);

    for (const [name, client, arrange] of cases) {
      const { studentId, first } = await studentWithPhoto();
      const rowsBefore = await photoRowsText(env.stack, studentId);
      const photosBefore = await photoCount(env.stack);
      const auditBefore = await auditCount(env.stack);
      const keysBefore = await bucketKeys(env.minio);
      arrange();

      const response = await replacePhoto(client, studentId, await jpegBytes(900, 1200, BLUE));

      const body = (await response.json()) as Problem;
      proxy.failWriteOf = null;
      expect(response.status, name).toBe(503);
      expect(body.code, name).toBe('storage_unavailable');
      expect(await photoRowsText(env.stack, studentId), name).toEqual(rowsBefore);
      expect(await versionRows(env.stack, studentId), name).toMatchObject([{ id: first.id, is_current: true, expires_at: null }]);
      expect(await photoCount(env.stack), name).toBe(photosBefore);
      expect(await auditCount(env.stack), name).toBe(auditBefore);
      expect(await bucketKeys(env.minio), name).toEqual(keysBefore);
    }
  } finally {
    await flaky.api.close();
    await down.api.close();
    await proxy.stop();
  }
});

test('transaction_failure_after_upload_500_restores_rows_and_bucket', async () => {
  const { studentId, first } = await studentWithPhoto();
  const rowsBefore = await photoRowsText(env.stack, studentId);
  const auditBefore = await auditCount(env.stack);
  const keysBefore = await bucketKeys(env.minio);
  const bytes = await jpegBytes(900, 1200, BLUE);

  const response = await withAuditInsertFailing(env.stack, () => replacePhoto(reception, studentId, bytes));

  expect(response.status).toBe(500);
  expect((await problem(response)).code).toBe('internal_error');
  expect(await photoRowsText(env.stack, studentId)).toEqual(rowsBefore);
  expect(await versionRows(env.stack, studentId)).toMatchObject([{ id: first.id, is_current: true, expires_at: null }]);
  expect(await auditCount(env.stack)).toBe(auditBefore);
  expect(await bucketKeys(env.minio)).toEqual(keysBefore);
});

test('concurrent_puts_both_201_distinct_versions_one_current', async () => {
  const bytes = await jpegBytes();
  const race = (studentId: string) =>
    releasedTogether([() => replacePhoto(reception, studentId, bytes), () => replacePhoto(admin, studentId, bytes)]);

  for (let round = 1; round <= 10; round += 1) {
    const { studentId } = await studentWithPhoto();

    const responses = await race(studentId);

    expect(responses.map((response) => response.status), `rodada ${round}`).toEqual([201, 201]);
    const bodies = (await Promise.all(responses.map((response) => response.json()))) as Array<{ version: number }>;
    expect(bodies.map((body) => body.version).sort(), `rodada ${round}`).toEqual([2, 3]);
    const rows = await versionRows(env.stack, studentId);
    expect(rows.map((row) => [row.version, row.is_current]), `rodada ${round}`).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
    expect(rows[0]!.expires_at, `rodada ${round}`).not.toBeNull();
    expect(rows[1]!.expires_at, `rodada ${round}`).not.toBeNull();
    expect(await uploadKeys(env.minio, studentId), `rodada ${round}`).toHaveLength(9);
  }

  for (let round = 1; round <= 5; round += 1) {
    const studentId = await newStudent();

    const responses = await race(studentId);

    expect(responses.map((response) => response.status), `sem foto, rodada ${round}`).toEqual([201, 201]);
    const bodies = (await Promise.all(responses.map((response) => response.json()))) as Array<{ version: number }>;
    expect(bodies.map((body) => body.version).sort(), `sem foto, rodada ${round}`).toEqual([1, 2]);
    const rows = await versionRows(env.stack, studentId);
    expect(rows.map((row) => [row.version, row.is_current]), `sem foto, rodada ${round}`).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(rows[0]!.expires_at, `sem foto, rodada ${round}`).not.toBeNull();
  }
});

test('inactive_and_suspended_students_accept_replace', async () => {
  for (const status of ['inactive', 'suspended']) {
    const { studentId } = await studentWithPhoto();
    await setStatus(env.stack, studentId, status);

    const response = await replacePhoto(reception, studentId, await jpegBytes());

    expect(response.status, status).toBe(201);
    expect(((await response.json()) as { version: number }).version, status).toBe(2);
  }
});

test('delete_removes_current_and_stored_version_with_one_audit_row', async () => {
  const { studentId } = await studentWithPhoto();
  await uploaded(await replacePhoto(reception, studentId, await jpegBytes()));
  expect(await versionRows(env.stack, studentId)).toHaveLength(2);
  expect(await uploadKeys(env.minio, studentId)).toHaveLength(6);
  const keysBefore = await bucketKeys(env.minio);

  const { result, rows } = await written(env.stack, () => reception.delete(photoPath(studentId)));

  expect(result.status).toBe(204);
  expect(await versionRows(env.stack, studentId)).toEqual([]);
  expect(await uploadKeys(env.minio, studentId)).toEqual([]);
  expect(await bucketKeys(env.minio)).toHaveLength(keysBefore.length - 6);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ action: 'student.photo_removed', entity_id: studentId });
});

test('foreign_origin_403_csrf_on_multipart_put', async () => {
  const { studentId } = await studentWithPhoto();
  const before = await snapshotOf(env.stack, env.minio);

  const attempts: Array<[string, Promise<Response>]> = [
    ['Origin de outro site', replacePhoto(reception, studentId, await jpegBytes(), { origin: 'http://evil.example' })],
    [
      'sem Origin e Sec-Fetch-Site cross-site',
      replacePhoto(reception, studentId, await jpegBytes(), { origin: null, headers: { 'Sec-Fetch-Site': 'cross-site' } }),
    ],
  ];

  for (const [name, pending] of attempts) {
    const response = await pending;
    expect(response.status, name).toBe(403);
    expect((await problem(response)).code, name).toBe('csrf_rejected');
  }

  expect(await snapshotOf(env.stack, env.minio)).toEqual(before);
});

test('put_racing_post_or_delete_never_5xx_and_rows_match_objects', async () => {
  const bytes = await jpegBytes();
  /** No máximo uma corrente, toda guardada com prazo, e as chaves do prefixo são as três de cada linha que ficou. */
  const expectConsistent = async (studentId: string, name: string) => {
    const rows = await versionRows(env.stack, studentId);
    expect(rows.filter((row) => row.is_current).length, name).toBeLessThanOrEqual(1);
    for (const row of rows.filter((entry) => !entry.is_current)) expect(row.expires_at, name).not.toBeNull();
    expect(await uploadKeys(env.minio, studentId), name).toEqual(rows.flatMap((row) => keysOf(studentId, row.id)).sort());
  };

  for (let round = 1; round <= 10; round += 1) {
    const name = `PUT e POST, rodada ${round}`;
    const studentId = await newStudent();

    const [put, post] = await releasedTogether([
      () => replacePhoto(reception, studentId, bytes),
      () => uploadPhoto(admin, studentId, bytes),
    ]);

    expect(put!.status, name).toBe(201);
    expect([201, 409], name).toContain(post!.status);
    if (post!.status === 409) expect((await problem(post!)).code, name).toBe('photo_exists');
    await expectConsistent(studentId, name);
  }

  for (let round = 1; round <= 10; round += 1) {
    const name = `PUT e DELETE, rodada ${round}`;
    const { studentId } = await studentWithPhoto();

    const [put, remove] = await releasedTogether([
      () => replacePhoto(reception, studentId, bytes),
      () => admin.delete(photoPath(studentId)),
    ]);

    expect(put!.status, name).toBe(201);
    expect(remove!.status, name).toBe(204);
    await expectConsistent(studentId, name);
  }
});
