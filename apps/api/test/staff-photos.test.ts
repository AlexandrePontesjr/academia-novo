import type { Problem } from '@academia/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { PhotoSigner } from '../src/photos/photo-signer.ts';
import { PHOTO_URL_SECRET } from './support/app.ts';
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
  type Part,
  photoCount,
  type PhotoStack,
  pixelAt,
  RED,
  replacePhoto,
  sha256,
  snapshotOf,
  solid,
  startPhotoStack,
  uploaded,
  uploadPhoto,
  versionRows,
} from './support/photos.ts';
import { freePort } from './support/servers.ts';
import { problem, type SeededUser } from './support/stack.ts';
import {
  insertStaff,
  postStaffPhoto,
  putStaffPhoto,
  sendStaffPhoto,
  setStaffStatus,
  staffKeys,
  staffPhotoPath,
  staffPhotoRowsText,
} from './support/staff.ts';
import { cpfOf, createStudent, releasedTogether, studentBody, unknownId } from './support/students.ts';

let env: PhotoStack;
let admin: Client;
let adminUser: SeededUser;
let hr: Client;
let hrUser: SeededUser;
let reception: Client;
let counter = 8000;
const next = () => (counter += 1);

beforeAll(async () => {
  env = await startPhotoStack();
  ({ client: admin, user: adminUser } = await env.stack.session('admin'));
  ({ client: hr, user: hrUser } = await env.stack.session('hr_finance'));
  // o login de cada perfil também grava na trilha: as sessões abrem antes de qualquer medida
  reception = (await env.stack.session('reception')).client;
}, 240_000);

afterAll(() => env?.close());

const VARIANTS = ['thumb', 'medium', 'large'] as const;
const MAX = 5 * 1024 * 1024;
const signer = new PhotoSigner(PHOTO_URL_SECRET);
const snapshot = () => snapshotOf(env.stack, env.minio);

const newStaff = async () => (await insertStaff(env.stack, [{ name: `Pessoa ${next()}`, cpf: cpfOf(next()) }]))[0]!;
const newStudent = async () => (await createStudent(admin, studentBody(next()))).id;
const rowsOf = (staffId: string, from?: string, to?: string, days?: number) => versionRows(env.stack, staffId, from, to, days, 'staff_id');
const objectOf = (staffId: string, photoId: string, variant: string) =>
  bucketObject(env.minio, `photos/main/${staffId}/${photoId}/${variant}.webp`);

/** Um funcionário com foto corrente de `version` igual a `1`, enviada por `POST`. */
async function staffWithPhoto() {
  const staffId = await newStaff();
  const first = await uploaded(await postStaffPhoto(hr, staffId, await jpegBytes()));
  expect(first.version, 'foto de preparação').toBe(1);
  return { staffId, first };
}

test('post_201_by_admin_and_hr_finance_three_objects_under_the_staff_id', async () => {
  for (const [name, client] of [['admin', admin], ['hr_finance', hr]] as const) {
    const staffId = await newStaff();
    const keysBefore = await bucketKeys(env.minio);

    const response = await postStaffPhoto(client, staffId, await jpegBytes(800, 1000));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status, name).toBe(201);
    expect(Object.keys(body).sort(), name).toEqual(['createdAt', 'id', 'version']);
    expect(body.version, name).toBe(1);
    expect(new Date(body.createdAt as string).toISOString(), name).toBe(body.createdAt);
    const current = await env.stack.query<{ id: string }>('select id from photos where staff_id = $1 and is_current', [staffId]);
    expect(current, name).toHaveLength(1);
    expect(body.id, name).toBe(current[0]!.id);
    const added = (await bucketKeys(env.minio)).filter((key) => !keysBefore.includes(key));
    expect(added, name).toEqual(keysOf(staffId, body.id as string));
  }
});

test('post_with_current_photo_409_photo_exists_and_nothing_changes', async () => {
  const { staffId } = await staffWithPhoto();
  const before = await snapshot();

  const response = await postStaffPhoto(hr, staffId, await jpegBytes());

  expect(response.status).toBe(409);
  expect((await problem(response)).code).toBe('photo_exists');
  expect(await snapshot()).toEqual(before);
});

test('two_simultaneous_posts_one_201_one_409_and_only_winner_objects', async () => {
  const bytes = await jpegBytes();

  for (let round = 1; round <= 10; round += 1) {
    const staffId = await newStaff();

    const responses = await releasedTogether([() => postStaffPhoto(hr, staffId, bytes), () => postStaffPhoto(admin, staffId, bytes)]);

    expect(responses.map((response) => response.status).sort(), `rodada ${round}`).toEqual([201, 409]);
    const loser = responses.find((response) => response.status === 409)!;
    expect((await problem(loser)).code, `rodada ${round}`).toBe('photo_exists');
    const winner = (await responses.find((response) => response.status === 201)!.json()) as { id: string };
    const rows = await rowsOf(staffId);
    expect(rows.map((row) => [row.id, row.is_current]), `rodada ${round}`).toEqual([[winner.id, true]]);
    expect(await staffKeys(env.minio, staffId), `rodada ${round}`).toEqual(keysOf(staffId, winner.id));
  }
});

test('put_replaces_keeps_previous_with_expiry_and_six_objects', async () => {
  for (const [name, client] of [['admin', admin], ['hr_finance', hr]] as const) {
    const { staffId, first } = await staffWithPhoto();
    const oldKeys = keysOf(staffId, first.id);
    const hashesBefore = await Promise.all(oldKeys.map(async (key) => sha256(await bucketObject(env.minio, key))));

    const t0 = await databaseNow(env.stack);
    const response = await putStaffPhoto(client, staffId, await jpegBytes(800, 1000));
    const t1 = await databaseNow(env.stack);

    expect(response.status, name).toBe(201);
    const second = (await response.json()) as { id: string; version: number };
    expect(second.version, name).toBe(2);
    const rows = await rowsOf(staffId, t0, t1, 30);
    expect(rows, name).toHaveLength(2);
    expect(rows[0], name).toMatchObject({ id: first.id, version: 1, is_current: false, in_window: true });
    expect(rows[1], name).toMatchObject({ id: second.id, version: 2, is_current: true, expires_at: null });
    expect(rows.filter((row) => row.is_current), name).toHaveLength(1);
    expect(await staffKeys(env.minio, staffId), name).toEqual([...oldKeys, ...keysOf(staffId, second.id)].sort());
    expect(await Promise.all(oldKeys.map(async (key) => sha256(await bucketObject(env.minio, key)))), name).toEqual(hashesBefore);
  }
});

test('put_without_current_photo_creates_version_1_never_had_and_removed', async () => {
  const never = await newStaff();
  const removed = (await staffWithPhoto()).staffId;
  expect((await hr.delete(staffPhotoPath(removed))).status).toBe(204);

  for (const [name, staffId] of [['nunca teve foto', never], ['foto removida', removed]] as const) {
    const response = await putStaffPhoto(hr, staffId, await jpegBytes());

    expect(response.status, name).toBe(201);
    const body = (await response.json()) as { id: string; version: number };
    expect(body.version, name).toBe(1);
    const rows = await rowsOf(staffId);
    expect(rows, name).toHaveLength(1);
    expect(rows[0], name).toMatchObject({ id: body.id, is_current: true, expires_at: null });
    expect(await staffKeys(env.minio, staffId), name).toEqual(keysOf(staffId, body.id));
  }
});

test('post_and_put_refusals_match_the_student_routes_status_and_code', async () => {
  const jpeg = await jpegBytes(800, 1000);
  const truncated = await noise(800, 1000).jpeg().toBuffer();
  const file = (bytes: Buffer, type = 'image/jpeg', filename = 'foto.jpg') => ({ name: 'file', bytes, filename, type });
  type Send = (path: string, method: 'POST' | 'PUT') => Promise<Response>;
  const parts =
    (list: Part[]): Send =>
    (path, method) => {
      const { body, contentType } = multipart(list);
      return admin.request(method, path, { body, headers: { 'Content-Type': contentType } });
    };
  const cases: Array<[name: string, status: number, code: string, send: Send, onFile: boolean]> = [
    ['texto enviado como image/jpeg', 415, 'unsupported_media_type', parts([file(Buffer.from('isto é só texto. '.repeat(40)))]), false],
    [
      'GIF',
      415,
      'unsupported_media_type',
      parts([file(Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00;', 'latin1'), 'image/gif', 'foto.gif')]),
      false,
    ],
    ['corpo application/json', 415, 'unsupported_media_type', (path, method) => admin.request(method, path, { body: { file: 'x' } }), false],
    ['parte file de 5 242 881 bytes', 413, 'payload_too_large', parts([file(padJpeg(jpeg, MAX + 1))]), false],
    ['multipart sem parte file', 422, 'validation_failed', parts([{ name: 'legenda', value: 'minha foto' }]), true],
    ['duas partes file', 422, 'validation_failed', parts([file(jpeg, 'image/jpeg', 'a.jpg'), file(jpeg, 'image/jpeg', 'b.jpg')]), true],
    ['PNG de 299×400', 422, 'validation_failed', parts([file(await solid(299, 400).png().toBuffer(), 'image/png', 'foto.png')]), true],
    ['PNG de 3015×13267', 422, 'validation_failed', parts([file(blankPng(3015, 13_267), 'image/png', 'foto.png')]), true],
    ['JPEG truncado na metade', 422, 'validation_failed', parts([file(truncated.subarray(0, Math.floor(truncated.length / 2)))]), true],
  ];
  expect(cases).toHaveLength(9);

  const student = await newStudent();
  for (const method of ['POST', 'PUT'] as const) {
    // o `POST` recusa sobre quem não tem foto, o `PUT` sobre quem tem: o que decide é o arquivo, nunca o estado
    const staffId = method === 'POST' ? await newStaff() : (await staffWithPhoto()).staffId;
    for (const [name, status, code, send, onFile] of cases) {
      const label = `${method}: ${name}`;
      const asStudent = await send(`/api/students/${student}/photo`, method);
      const studentProblem = await problem(asStudent);
      const before = await snapshot();

      const response = await send(staffPhotoPath(staffId), method);

      const body = await problem(response);
      expect([asStudent.status, studentProblem.code], `aluno, ${label}`).toEqual([status, code]);
      expect(response.status, label).toBe(status);
      expect(body.code, label).toBe(code);
      expect([response.status, body.code], label).toEqual([asStudent.status, studentProblem.code]);
      if (onFile) expect((body.errors ?? []).map((error) => error.path), label).toEqual(['file']);
      expect(await snapshot(), label).toEqual(before);
    }
  }

  const exactly = padJpeg(jpeg, MAX);
  expect(exactly).toHaveLength(5_242_880);
  expect((await postStaffPhoto(hr, await newStaff(), exactly)).status, 'POST de 5 242 880 bytes').toBe(201);
  expect((await putStaffPhoto(hr, (await staffWithPhoto()).staffId, exactly)).status, 'PUT de 5 242 880 bytes').toBe(201);
});

test('post_and_put_run_the_same_variant_pipeline_six_properties', async () => {
  for (const method of ['POST', 'PUT'] as const) {
    /** `POST` quer um funcionário sem foto; `PUT`, um com foto (a troca é a rota que o aluno também usa). */
    const fresh = async () => (method === 'POST' ? await newStaff() : (await staffWithPhoto()).staffId);
    const send = (staffId: string, bytes: Buffer, options?: Parameters<typeof sendStaffPhoto>[4]) =>
      sendStaffPhoto(hr, method, staffId, bytes, options);
    const currentIdOf = async (staffId: string) => (await rowsOf(staffId)).find((row) => row.is_current)!.id;

    // AC 16: três WebP de 96×128, 240×320 e 600×800
    {
      const staffId = await fresh();
      const { id } = await uploaded(await send(staffId, await jpegBytes(800, 1000)));
      const sizes: Record<string, [number, number]> = { thumb: [96, 128], medium: [240, 320], large: [600, 800] };
      for (const variant of VARIANTS) {
        const metadata = await sharp(await objectOf(staffId, id, variant)).metadata();
        expect([metadata.format, metadata.width, metadata.height], `${method} AC 16 ${variant}`).toEqual(['webp', ...sizes[variant]!]);
      }
    }

    // AC 17: recorte central
    {
      const staffId = await fresh();
      const halves = await painted(800, 800, (x) => (x < 400 ? RED : BLUE)).png().toBuffer();
      const { id } = await uploaded(await send(staffId, halves, { type: 'image/png', filename: 'foto.png' }));
      const large = await objectOf(staffId, id, 'large');
      expect(isRed(await pixelAt(large, 0.25, 0.5)), `${method} AC 17: vermelha a 25% da largura`).toBe(true);
      expect(isBlue(await pixelAt(large, 0.75, 0.5)), `${method} AC 17: azul a 75% da largura`).toBe(true);
    }

    // AC 18: orientação EXIF 6
    {
      const staffId = await fresh();
      const rotated = await painted(400, 300, (_x, y) => (y < 150 ? RED : BLUE)).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
      expect((await sharp(rotated).metadata()).orientation).toBe(6);
      const { id } = await uploaded(await send(staffId, rotated));
      const large = await objectOf(staffId, id, 'large');
      expect(isRed(await pixelAt(large, 0.75, 0.5)), `${method} AC 18: metade direita vermelha`).toBe(true);
      expect(isBlue(await pixelAt(large, 0.25, 0.5)), `${method} AC 18: metade esquerda azul`).toBe(true);
    }

    // AC 19: sem EXIF, sem GPS, sem o marcador
    {
      const MARKER = 'CAMERA-SECRETA-77';
      const DATUM = 'DATUM-SECRETO-GPS-88';
      const staffId = await fresh();
      const marked = await solid(800, 1000)
        .jpeg()
        .withExif({
          IFD0: { Make: MARKER },
          IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 32/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '46/1 38/1 0/1', GPSMapDatum: DATUM },
        })
        .toBuffer();
      expect((await sharp(marked).metadata()).exif).toBeDefined();
      expect(marked.includes(MARKER) && marked.includes(DATUM)).toBe(true);
      const { id } = await uploaded(await send(staffId, marked));
      for (const variant of VARIANTS) {
        const bytes = await objectOf(staffId, id, variant);
        expect((await sharp(bytes).metadata()).exif, `${method} AC 19 ${variant}: bloco EXIF`).toBeUndefined();
        expect(bytes.includes(MARKER), `${method} AC 19 ${variant}: marcador`).toBe(false);
        expect(bytes.includes(DATUM), `${method} AC 19 ${variant}: coordenadas`).toBe(false);
      }
    }

    // AC 20: sem o original e sem o nome dele
    {
      const staffId = await fresh();
      const original = await jpegBytes(800, 1000, BLUE);
      await uploaded(await send(staffId, original, { filename: 'foto-original-unica.jpg' }));
      const keys = await bucketKeys(env.minio);
      expect(keys.filter((key) => key.includes('foto-original-unica')), `${method} AC 20: nome na chave`).toEqual([]);
      const hashes = await Promise.all(keys.map(async (key) => sha256(await bucketObject(env.minio, key))));
      expect(hashes, `${method} AC 20: o original no bucket`).not.toContain(sha256(original));
    }

    // AC 21: nada do cliente na chave
    {
      const staffId = await fresh();
      const keysBefore = await staffKeys(env.minio, staffId);
      await uploaded(await send(staffId, await jpegBytes(), { filename: '../../etc/passwd.jpg' }));
      const photoId = await currentIdOf(staffId);
      const added = (await staffKeys(env.minio, staffId)).filter((key) => !keysBefore.includes(key));
      expect(added, `${method} AC 21`).toHaveLength(3);
      const pattern = new RegExp(`^photos/main/${staffId}/${photoId}/(thumb|medium|large)\\.webp$`);
      for (const key of added) expect(key, `${method} AC 21`).toMatch(pattern);
    }
  }
});

test('delete_removes_current_and_stored_versions_and_is_idempotent', async () => {
  const { staffId, first } = await staffWithPhoto();
  const second = await uploaded(await putStaffPhoto(hr, staffId, await jpegBytes()));
  expect(await rowsOf(staffId)).toHaveLength(2);
  expect(await staffKeys(env.minio, staffId)).toHaveLength(6);
  const keysBefore = await bucketKeys(env.minio);
  const ficha = (await (await hr.get(`/api/staff/${staffId}`)).json()) as { photoUrl: string | null };
  expect(ficha.photoUrl).toContain(second.id);

  const response = await hr.delete(staffPhotoPath(staffId));

  expect(response.status).toBe(204);
  expect(await rowsOf(staffId)).toEqual([]);
  expect(await staffKeys(env.minio, staffId)).toEqual([]);
  expect(await bucketKeys(env.minio)).toHaveLength(keysBefore.length - 6);
  expect(((await (await hr.get(`/api/staff/${staffId}`)).json()) as { photoUrl: string | null }).photoUrl).toBeNull();
  expect(first.id).not.toBe(second.id);

  const before = await snapshot();
  const again = await hr.delete(staffPhotoPath(staffId));

  expect(again.status).toBe(204);
  expect(await snapshot()).toEqual(before);
});

test('photo_routes_404_for_bad_unknown_and_student_ids_and_student_routes_404_for_staff_id', async () => {
  const studentId = await newStudent();
  const { staffId } = await staffWithPhoto();
  const bytes = await jpegBytes();
  const before = await snapshot();

  for (const id of ['abc', unknownId(), studentId]) {
    for (const method of ['POST', 'PUT'] as const) {
      const response = await sendStaffPhoto(hr, method, id, bytes);

      expect(response.status, `${method} ${id}`).toBe(404);
      expect((await problem(response)).code, `${method} ${id}`).toBe('not_found');
    }
    const removal = await hr.delete(staffPhotoPath(id));

    expect(removal.status, `DELETE ${id}`).toBe(404);
    expect((await problem(removal)).code, `DELETE ${id}`).toBe('not_found');
  }
  expect(await snapshot()).toEqual(before);

  const studentRoutes: Array<[string, () => Promise<Response>]> = [
    ['POST', () => uploadPhoto(admin, staffId, bytes)],
    ['PUT', () => replacePhoto(admin, staffId, bytes)],
    ['DELETE', () => admin.delete(`/api/students/${staffId}/photo`)],
    ['GET', () => admin.get(`/api/students/${staffId}/photo`)],
  ];
  for (const [name, send] of studentRoutes) expect((await send()).status, `${name} /api/students/<id de funcionário>/photo`).toBe(404);
  expect(await snapshot()).toEqual(before);
});

test('photo_actions_write_one_row_each_with_null_diff', async () => {
  for (const [name, client, user] of [['admin', admin, adminUser], ['hr_finance', hr, hrUser]] as const) {
    const uploadedTo = await newStaff();
    const uploadedRow = await written(env.stack, async () => postStaffPhoto(client, uploadedTo, await jpegBytes()));

    const { staffId } = await staffWithPhoto();
    const replacedRow = await written(env.stack, async () => putStaffPhoto(client, staffId, await jpegBytes()));

    const photoless = await newStaff();
    const createdRow = await written(env.stack, async () => putStaffPhoto(client, photoless, await jpegBytes()));

    const removedRow = await written(env.stack, () => client.delete(staffPhotoPath(staffId)));

    const outcomes: Array<[label: string, outcome: typeof uploadedRow, status: number, action: string, entityId: string]> = [
      [`${name} POST`, uploadedRow, 201, 'staff.photo_uploaded', uploadedTo],
      [`${name} PUT com foto corrente`, replacedRow, 201, 'staff.photo_replaced', staffId],
      [`${name} PUT sem foto corrente`, createdRow, 201, 'staff.photo_uploaded', photoless],
      [`${name} DELETE com corrente e guardada`, removedRow, 204, 'staff.photo_removed', staffId],
    ];
    for (const [label, outcome, status, action, entityId] of outcomes) {
      expect(outcome.result.status, label).toBe(status);
      expect(outcome.rows, label).toHaveLength(1);
      expect(outcome.rows[0], label).toMatchObject({ action, user_id: user.id, entity: 'staff', entity_id: entityId, diff: null });
      expect(outcome.rows.filter((row) => row.action.startsWith('student.')), label).toEqual([]);
    }
  }
});

test('storage_and_transaction_failures_on_post_and_put_leave_everything_as_before', async () => {
  const proxy = await flakyStorage(env.minio.endpoint);
  const flaky = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: proxy.endpoint }, {}, 'hr_finance');
  const down = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: `http://127.0.0.1:${await freePort()}` }, {}, 'hr_finance');
  try {
    for (const method of ['POST', 'PUT'] as const) {
      const cases: Array<[name: string, status: number, code: string, arrange: () => void, run: (staffId: string, bytes: Buffer) => Promise<Response>]> = [
        ...VARIANTS.map((variant): (typeof cases)[number] => [
          `${method} com escrita de ${variant} falhando`,
          503,
          'storage_unavailable',
          () => {
            proxy.failWriteOf = variant;
          },
          (staffId, bytes) => sendStaffPhoto(flaky.client, method, staffId, bytes),
        ]),
        [`${method} com endpoint fora`, 503, 'storage_unavailable', () => undefined, (staffId, bytes) => sendStaffPhoto(down.client, method, staffId, bytes)],
        [
          `${method} com insert de auditoria falhando`,
          500,
          'internal_error',
          () => undefined,
          (staffId, bytes) => withAuditInsertFailing(env.stack, () => sendStaffPhoto(hr, method, staffId, bytes)),
        ],
      ];
      expect(cases).toHaveLength(5);

      for (const [name, status, code, arrange, run] of cases) {
        // `POST` quer um funcionário sem foto; `PUT`, um com foto corrente, que tem de ficar como estava
        const staffId = method === 'POST' ? await newStaff() : (await staffWithPhoto()).staffId;
        const rowsBefore = await staffPhotoRowsText(env.stack, staffId);
        const photosBefore = await photoCount(env.stack);
        const auditBefore = await auditCount(env.stack);
        const keysBefore = await bucketKeys(env.minio);
        arrange();

        const response = await run(staffId, await jpegBytes(900, 1200, BLUE));

        proxy.failWriteOf = null;
        const body = (await response.json()) as Problem;
        expect(response.status, name).toBe(status);
        expect(body.code, name).toBe(code);
        expect(await staffPhotoRowsText(env.stack, staffId), name).toEqual(rowsBefore);
        if (method === 'PUT') expect(await rowsOf(staffId), name).toMatchObject([{ is_current: true, expires_at: null }]);
        expect(await photoCount(env.stack), name).toBe(photosBefore);
        expect(await auditCount(env.stack), name).toBe(auditBefore);
        expect(await bucketKeys(env.minio), name).toEqual(keysBefore);
      }
    }
  } finally {
    await flaky.api.close();
    await down.api.close();
    await proxy.stop();
  }
});

test('twenty_one_non_writing_photo_outcomes_write_no_audit_row', async () => {
  const down = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: `http://127.0.0.1:${await freePort()}` }, {}, 'hr_finance');
  const jpeg = await jpegBytes();
  const tooSmall = await solid(299, 400).jpeg().toBuffer();
  const anonymous = env.stack.client();
  const ghost = unknownId();
  try {
    const withPhoto = (await staffWithPhoto()).staffId;
    const photoless = await newStaff();
    type Send = (staffId: string) => Promise<Response>;
    const post = (client: Client, bytes: Buffer = jpeg): Send => (staffId) => postStaffPhoto(client, staffId, bytes);
    const put = (client: Client, bytes: Buffer = jpeg): Send => (staffId) => putStaffPhoto(client, staffId, bytes);
    const failing = (send: Send): Send => (staffId) => withAuditInsertFailing(env.stack, () => send(staffId));
    const text = Buffer.from('só texto'.repeat(30));
    const cases: Array<[name: string, status: number, target: string, send: Send]> = [
      ['POST 401', 401, photoless, post(anonymous)],
      ['POST 403', 403, photoless, post(reception)],
      ['POST 404', 404, ghost, post(hr)],
      ['POST 409', 409, withPhoto, post(hr)],
      ['POST 413', 413, photoless, post(hr, padJpeg(jpeg, MAX + 1))],
      ['POST 415', 415, photoless, post(hr, text)],
      ['POST 422', 422, photoless, post(hr, tooSmall)],
      ['POST 500', 500, photoless, failing(post(hr))],
      ['POST 503', 503, photoless, post(down.client)],
      ['PUT 401', 401, withPhoto, put(anonymous)],
      ['PUT 403', 403, withPhoto, put(reception)],
      ['PUT 404', 404, ghost, put(hr)],
      ['PUT 413', 413, withPhoto, put(hr, padJpeg(jpeg, MAX + 1))],
      ['PUT 415', 415, withPhoto, put(hr, text)],
      ['PUT 422', 422, withPhoto, put(hr, tooSmall)],
      ['PUT 500', 500, withPhoto, failing(put(hr))],
      ['PUT 503', 503, withPhoto, put(down.client)],
      ['DELETE 401', 401, withPhoto, (staffId) => anonymous.delete(staffPhotoPath(staffId))],
      ['DELETE 403', 403, withPhoto, (staffId) => reception.delete(staffPhotoPath(staffId))],
      ['DELETE 404', 404, ghost, (staffId) => hr.delete(staffPhotoPath(staffId))],
      ['DELETE de funcionário sem foto', 204, photoless, (staffId) => hr.delete(staffPhotoPath(staffId))],
    ];
    expect(cases).toHaveLength(21);

    for (const [name, status, target, send] of cases) {
      const before = await auditCount(env.stack);

      const response = await send(target);

      expect(response.status, name).toBe(status);
      expect(await auditCount(env.stack), name).toBe(before);
    }
  } finally {
    await down.api.close();
  }
});

test('signed_url_serves_three_variants_of_a_staff_photo_without_session', async () => {
  const { staffId, first } = await staffWithPhoto();

  for (const variant of VARIANTS) {
    const { url } = signer.issue(first.id, variant);

    const response = await fetch(`${env.stack.api.url}${url}`);

    expect(response.status, variant).toBe(200);
    expect(response.headers.get('content-type'), variant).toBe('image/webp');
    expect(response.headers.get('cache-control'), variant).toBe('no-store');
    expect(Buffer.from(await response.arrayBuffer()).equals(await objectOf(staffId, first.id, variant)), variant).toBe(true);
  }
});

test('inactive_staff_accepts_post_put_and_delete_of_photo', async () => {
  const staffId = await newStaff();
  await setStaffStatus(env.stack, staffId, 'inactive');

  const posted = await postStaffPhoto(hr, staffId, await jpegBytes());
  const replaced = await putStaffPhoto(hr, staffId, await jpegBytes());
  const removed = await hr.delete(staffPhotoPath(staffId));

  expect(posted.status).toBe(201);
  expect(replaced.status).toBe(201);
  expect(((await replaced.json()) as { version: number }).version).toBe(2);
  expect(removed.status).toBe(204);
});

test('put_racing_post_or_delete_never_5xx_and_rows_match_objects_for_staff', async () => {
  const bytes = await jpegBytes();
  /** No máximo uma corrente, toda guardada com prazo, e as chaves do prefixo são as três de cada linha que ficou. */
  const expectConsistent = async (staffId: string, name: string) => {
    const rows = await rowsOf(staffId);
    expect(rows.filter((row) => row.is_current).length, name).toBeLessThanOrEqual(1);
    for (const row of rows.filter((entry) => !entry.is_current)) expect(row.expires_at, name).not.toBeNull();
    expect(await staffKeys(env.minio, staffId), name).toEqual(rows.flatMap((row) => keysOf(staffId, row.id)).sort());
  };

  for (let round = 1; round <= 10; round += 1) {
    const name = `PUT e POST, rodada ${round}`;
    const staffId = await newStaff();

    const [put, post] = await releasedTogether([() => putStaffPhoto(hr, staffId, bytes), () => postStaffPhoto(admin, staffId, bytes)]);

    expect(put!.status, name).toBe(201);
    expect([201, 409], name).toContain(post!.status);
    if (post!.status === 409) expect((await problem(post!)).code, name).toBe('photo_exists');
    await expectConsistent(staffId, name);
  }

  for (let round = 1; round <= 10; round += 1) {
    const name = `PUT e DELETE, rodada ${round}`;
    const { staffId } = await staffWithPhoto();

    const [put, remove] = await releasedTogether([() => putStaffPhoto(hr, staffId, bytes), () => admin.delete(staffPhotoPath(staffId))]);

    expect(put!.status, name).toBe(201);
    expect(remove!.status, name).toBe(204);
    await expectConsistent(staffId, name);
  }

  for (let round = 1; round <= 10; round += 1) {
    const name = `dois PUT, rodada ${round}`;
    const { staffId } = await staffWithPhoto();

    const responses = await releasedTogether([() => putStaffPhoto(hr, staffId, bytes), () => putStaffPhoto(admin, staffId, bytes)]);

    expect(responses.map((response) => response.status), name).toEqual([201, 201]);
    const versions = ((await Promise.all(responses.map((response) => response.json()))) as Array<{ version: number }>).map((body) => body.version);
    expect(versions.sort(), name).toEqual([2, 3]);
    await expectConsistent(staffId, name);
  }
});

test('student_photo_routes_and_files_unchanged_beside_staff_photos', async () => {
  const studentNumber = next();
  const studentId = (await createStudent(admin, studentBody(studentNumber))).id;
  const student = await uploaded(await uploadPhoto(admin, studentId, await jpegBytes()));
  // de cor diferente da do aluno: os bytes de um dono não podem passar pelos do outro
  const staffId = await newStaff();
  const staffPhoto = await uploaded(await postStaffPhoto(hr, staffId, await jpegBytes(800, 1000, BLUE)));
  expect(student.id).not.toBe(staffPhoto.id);
  const studentPrefix = `photos/main/${studentId}/`;
  expect(await bucketKeys(env.minio, studentPrefix)).toEqual(keysOf(studentId, student.id));

  // `GET /api/students/:id/photo`, sem `variant` e com `variant=thumb`
  for (const [query, variant] of [['', 'medium'], ['?variant=thumb', 'thumb']] as const) {
    const response = await admin.get(`/api/students/${studentId}/photo${query}`);
    const { url } = (await response.json()) as { url: string };

    expect(response.status, query).toBe(200);
    expect(url, query).toContain(`/api/photo-files/${student.id}/${variant}?`);
    expect(url, query).not.toContain(staffPhoto.id);
  }
  // `photoUrl` da ficha e do item da lista de alunos
  const ficha = (await (await admin.get(`/api/students/${studentId}`)).json()) as { photoUrl: string };
  expect(ficha.photoUrl).toContain(`/api/photo-files/${student.id}/`);
  expect(ficha.photoUrl).not.toContain(staffPhoto.id);
  const list = (await (await admin.get(`/api/students?q=Aluno ${studentNumber}`)).json()) as { items: Array<{ id: string; photoUrl: string | null }> };
  const item = list.items.find((entry) => entry.id === studentId)!;
  expect(item.photoUrl).toContain(`/api/photo-files/${student.id}/`);
  expect(item.photoUrl).not.toContain(staffPhoto.id);

  // abrir a de `medium` do aluno entrega os bytes do objeto dele
  const opened = await fetch(`${env.stack.api.url}${ficha.photoUrl}`);
  expect(opened.status).toBe(200);
  const stored = await bucketObject(env.minio, `photos/main/${studentId}/${student.id}/medium.webp`);
  expect(Buffer.from(await opened.arrayBuffer()).equals(stored)).toBe(true);
  expect(stored.equals(await objectOf(staffId, staffPhoto.id, 'medium'))).toBe(false);

  // `POST` e `PUT` do aluno seguem respondendo `201` e gravando sob o aluno
  const other = await newStudent();
  const posted = await uploaded(await uploadPhoto(admin, other, await jpegBytes()));
  expect(await bucketKeys(env.minio, `photos/main/${other}/`)).toEqual(keysOf(other, posted.id));
  const replaced = await replacePhoto(admin, studentId, await jpegBytes());
  expect(replaced.status).toBe(201);
  const second = (await replaced.json()) as { id: string; version: number };
  expect(second.version).toBe(2);
  expect(await bucketKeys(env.minio, studentPrefix)).toEqual([...keysOf(studentId, student.id), ...keysOf(studentId, second.id)].sort());
  expect(await staffKeys(env.minio, staffId)).toEqual(keysOf(staffId, staffPhoto.id));
});
