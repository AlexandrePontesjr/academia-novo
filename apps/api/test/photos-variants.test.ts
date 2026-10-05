import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Problem } from '@academia/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { withAuditInsertFailing } from './support/audit.ts';
import type { Client } from './support/client.ts';
import {
  apiWith,
  BLUE,
  bucketKeys,
  bucketObject,
  flakyStorage,
  GREEN,
  isBlue,
  isRed,
  jpegBytes,
  multipart,
  nearest,
  painted,
  photoRows,
  pixelAt,
  pngBytes,
  type PhotoStack,
  RED,
  type Rgb,
  sha256,
  snapshotOf,
  solid,
  startPhotoStack,
  uploadKeys,
  uploadPhoto,
  uploaded,
  YELLOW,
} from './support/photos.ts';
import { freePort } from './support/servers.ts';
import { createStudent, studentBody } from './support/students.ts';

let env: PhotoStack;
let reception: Client;
let students = 500;

beforeAll(async () => {
  env = await startPhotoStack();
  reception = (await env.stack.session('reception')).client;
}, 240_000);

afterAll(() => env?.close());

const newStudent = async () => (await createStudent(reception, studentBody((students += 1)))).id;

const VARIANTS = ['thumb', 'medium', 'large'] as const;
const SIZES = { thumb: [96, 128], medium: [240, 320], large: [600, 800] } as const;

/** O objeto de uma variante do envio, lido do bucket pelo teste. */
async function variantOf(studentId: string, variant: (typeof VARIANTS)[number]) {
  const [row] = await photoRows(env.stack, studentId);
  return bucketObject(env.minio, `photos/main/${studentId}/${row!.id as string}/${variant}.webp`);
}

test('three_webp_variants_exact_sizes_right_after_201', async () => {
  const cases: Array<[string, Buffer]> = [
    ['JPEG 800×1000', await jpegBytes(800, 1000)],
    ['PNG 300×400', await pngBytes(300, 400)],
  ];

  for (const [name, bytes] of cases) {
    const studentId = await newStudent();

    const created = await uploaded(await uploadPhoto(reception, studentId, bytes));

    // sem esperar: a lista é lida logo depois do 201
    expect(await uploadKeys(env.minio, studentId), name).toEqual(
      VARIANTS.map((variant) => `photos/main/${studentId}/${created.id}/${variant}.webp`).sort(),
    );
    for (const variant of VARIANTS) {
      const metadata = await sharp(await variantOf(studentId, variant)).metadata();
      expect(metadata.format, `${name} ${variant}`).toBe('webp');
      expect([metadata.width, metadata.height], `${name} ${variant}`).toEqual(SIZES[variant]);
    }
  }
});

test('center_crop_without_distortion_four_images', async () => {
  const uploadLarge = async (bytes: Buffer) => {
    const studentId = await newStudent();
    await uploaded(await uploadPhoto(reception, studentId, bytes, { filename: 'foto.png', type: 'image/png' }));
    return variantOf(studentId, 'large');
  };

  // quadrado de metades: o pixel a 25% é vermelho e o a 75% é azul
  const halves = await uploadLarge(await painted(800, 800, (x) => (x < 400 ? RED : BLUE)).png().toBuffer());
  expect(isRed(await pixelAt(halves, 0.25, 0.5))).toBe(true);
  expect(isBlue(await pixelAt(halves, 0.75, 0.5))).toBe(true);

  // vermelho só nas colunas 0 a 99: o recorte centralizado o descarta, e comprimir o deixaria na borda
  const strip = await uploadLarge(await painted(800, 800, (x) => (x < 100 ? RED : BLUE)).png().toBuffer());
  for (let step = 0; step <= 20; step += 1) {
    expect(isRed(await pixelAt(strip, step / 20, 0.5)), `coluna a ${step * 5}%`).toBe(false);
  }

  // paisagem 1200×800 e retrato 600×1200: a faixa central de uma cor, as laterais de outra
  const landscape = await uploadLarge(await painted(1200, 800, (x) => (x >= 400 && x < 800 ? RED : BLUE)).png().toBuffer());
  expect(isRed(await pixelAt(landscape, 0.25, 0.5)), 'paisagem a 25%').toBe(true);
  expect(isRed(await pixelAt(landscape, 0.75, 0.5)), 'paisagem a 75%').toBe(true);
  const portrait = await uploadLarge(await painted(600, 1200, (x) => (x >= 100 && x < 500 ? RED : BLUE)).png().toBuffer());
  expect(isRed(await pixelAt(portrait, 0.25, 0.5)), 'retrato a 25%').toBe(true);
  expect(isRed(await pixelAt(portrait, 0.75, 0.5)), 'retrato a 75%').toBe(true);
});

/** Onde cada canto guardado cai na leitura em pé, por orientação EXIF: [TL, TR, BL, BR] em função de [a, b, c, d]. */
const UPRIGHT: Record<number, [number, number, number, number]> = {
  1: [0, 1, 2, 3],
  2: [1, 0, 3, 2],
  3: [3, 2, 1, 0],
  4: [2, 3, 0, 1],
  5: [0, 2, 1, 3],
  6: [2, 0, 3, 1],
  7: [3, 1, 2, 0],
  8: [1, 3, 0, 2],
};

test('exif_orientation_one_to_eight_read_upright', async () => {
  const stored: Rgb[] = [RED, GREEN, BLUE, YELLOW]; // canto superior esquerdo, superior direito, inferior esquerdo, inferior direito
  const names = ['red', 'green', 'blue', 'yellow'];
  const image = painted(800, 800, (x, y) => stored[(y < 400 ? 0 : 2) + (x < 400 ? 0 : 1)]!);

  for (let orientation = 1; orientation <= 8; orientation += 1) {
    const studentId = await newStudent();
    const jpeg = await image.clone().jpeg({ quality: 95 }).withMetadata({ orientation }).toBuffer();
    expect((await sharp(jpeg).metadata()).orientation, `orientação guardada ${orientation}`).toBe(orientation);

    await uploaded(await uploadPhoto(reception, studentId, jpeg));

    const upright = UPRIGHT[orientation]!.map((index) => names[index]);
    for (const variant of VARIANTS) {
      const bytes = await variantOf(studentId, variant);
      const found = [
        nearest(await pixelAt(bytes, 0.25, 0.25)),
        nearest(await pixelAt(bytes, 0.75, 0.25)),
        nearest(await pixelAt(bytes, 0.25, 0.75)),
        nearest(await pixelAt(bytes, 0.75, 0.75)),
      ];
      expect(found, `orientação ${orientation}, ${variant}`).toEqual(upright);
    }
  }

  // orientação 6, 400×300: metade de cima vermelha e a de baixo azul leem-se com a direita vermelha
  const studentId = await newStudent();
  const rotated = await painted(400, 300, (_x, y) => (y < 150 ? RED : BLUE)).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
  await uploaded(await uploadPhoto(reception, studentId, rotated));
  const large = await variantOf(studentId, 'large');
  expect(isRed(await pixelAt(large, 0.75, 0.5)), 'direita').toBe(true);
  expect(isBlue(await pixelAt(large, 0.25, 0.5)), 'esquerda').toBe(true);
});

const MARKER = 'CAMERA-SECRETA-77';
const DATUM = 'DATUM-SECRETO-GPS-88';
const EXIF = {
  IFD0: { Make: MARKER },
  IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 32/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '46/1 38/1 0/1', GPSMapDatum: DATUM },
};

test('no_exif_gps_or_marker_bytes_in_any_variant_of_three_formats', async () => {
  const base = solid(800, 1000);
  const inputs: Array<[string, Buffer, string]> = [
    ['JPEG', await base.clone().jpeg().withExif(EXIF).toBuffer(), 'image/jpeg'],
    ['PNG', await base.clone().png().withExif(EXIF).toBuffer(), 'image/png'],
    ['WebP', await base.clone().webp().withExif(EXIF).toBuffer(), 'image/webp'],
  ];

  for (const [name, bytes, type] of inputs) {
    // a entrada carrega o que a saída não pode ter
    expect((await sharp(bytes).metadata()).exif, `${name} de entrada`).toBeDefined();
    expect(bytes.includes(MARKER), `${name} de entrada com o marcador`).toBe(true);
    const studentId = await newStudent();

    await uploaded(await uploadPhoto(reception, studentId, bytes, { type }));

    for (const variant of VARIANTS) {
      const variantBytes = await variantOf(studentId, variant);
      expect((await sharp(variantBytes).metadata()).exif, `${name} ${variant}: bloco EXIF`).toBeUndefined();
      expect(variantBytes.includes(MARKER), `${name} ${variant}: marcador`).toBe(false);
      expect(variantBytes.includes(DATUM), `${name} ${variant}: coordenadas`).toBe(false);
    }
  }
});

test('original_kept_nowhere_bucket_or_tmpdir', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'foto-tmp-'));
  const saved = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
  Object.assign(process.env, { TMPDIR: empty, TEMP: empty, TMP: empty });
  try {
    const original = await jpegBytes(800, 1000);
    const studentId = await newStudent();

    await uploaded(await uploadPhoto(reception, studentId, original, { filename: 'foto-original-unica.jpg' }));

    expect(await uploadKeys(env.minio, studentId)).toHaveLength(3);
    const everything = await bucketKeys(env.minio);
    expect(everything.filter((key) => key.includes('foto-original-unica'))).toEqual([]);
    for (const key of everything) expect(sha256(await bucketObject(env.minio, key)), key).not.toBe(sha256(original));
    expect(readdirSync(empty), 'depois de um envio aceito').toEqual([]);

    const unsupported = await uploadPhoto(reception, await newStudent(), Buffer.from('não é imagem'.repeat(20)), { filename: 'foto-original-unica.jpg' });
    expect(unsupported.status).toBe(415);
    expect(readdirSync(empty), 'depois do 415').toEqual([]);

    const tooSmall = await uploadPhoto(reception, await newStudent(), await solid(299, 400).jpeg().toBuffer(), { filename: 'foto-original-unica.jpg' });
    expect(tooSmall.status).toBe(422);
    expect(readdirSync(empty), 'depois do 422').toEqual([]);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(empty, { recursive: true, force: true });
  }
});

test('keys_built_only_from_ids_and_variant_whatever_the_client_sends', async () => {
  const cases: Array<[string, (id: string) => string, { filename?: string; type?: string }]> = [
    ['nome com ../', (id) => id, { filename: '../../etc/passwd.jpg' }],
    ['nome com /', (id) => id, { filename: 'a/b.png' }],
    ['Content-Type estranho', (id) => id, { type: 'image/../x' }],
    ['id da URL em maiúsculas', (id) => id.toUpperCase(), {}],
  ];

  for (const [name, urlId, options] of cases) {
    const studentId = await newStudent();
    const bytes = await jpegBytes();
    const { body, contentType } = multipart([
      { name: 'file', bytes, filename: options.filename ?? 'foto.jpg', type: options.type ?? 'image/jpeg' },
    ]);
    const response = await reception.request('POST', `/api/students/${urlId(studentId)}/photo`, {
      body,
      headers: { 'Content-Type': contentType },
    });
    const created = await uploaded(response);

    const keys = await bucketKeys(env.minio, `photos/main/${studentId}`);
    expect(keys, name).toHaveLength(3);
    const pattern = new RegExp(`^photos/main/${studentId}/${created.id}/(thumb|medium|large)\\.webp$`);
    for (const key of keys) expect(key, name).toMatch(pattern);
    expect(await uploadKeys(env.minio, studentId), name).toEqual(keys);
  }
});

test('storage_failure_on_each_variant_and_down_503_leaves_nothing', async () => {
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

    for (const [name, client, arrange] of cases) {
      const studentId = await newStudent();
      const before = await snapshotOf(env.stack, env.minio);
      arrange();

      const response = await uploadPhoto(client, studentId, await jpegBytes());

      const body = (await response.json()) as Problem;
      expect(response.status, name).toBe(503);
      expect(body.code, name).toBe('storage_unavailable');
      expect(await snapshotOf(env.stack, env.minio), name).toEqual(before);
      proxy.failWriteOf = null;
    }
  } finally {
    await flaky.api.close();
    await down.api.close();
    await proxy.stop();
  }
});

test('transaction_failure_after_upload_rolls_back_rows_and_removes_objects', async () => {
  const studentId = await newStudent();
  const before = await snapshotOf(env.stack, env.minio);

  const bytes = await jpegBytes();

  const response = await withAuditInsertFailing(env.stack, () => uploadPhoto(reception, studentId, bytes));

  expect(response.status).toBe(500);
  expect(((await response.json()) as Problem).code).toBe('internal_error');
  expect(await snapshotOf(env.stack, env.minio)).toEqual(before);
  expect(await uploadKeys(env.minio, studentId)).toEqual([]);
});
