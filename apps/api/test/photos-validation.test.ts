import type { Problem } from '@academia/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Client } from './support/client.ts';
import {
  blankPng,
  jpegBytes,
  multipart,
  noise,
  padJpeg,
  pngBytes,
  postParts,
  photoRows,
  type PhotoStack,
  solid,
  startPhotoStack,
  uploadKeys,
  uploadPhoto,
  uploadPhotoChunked,
  webpBytes,
} from './support/photos.ts';
import { createStudent, studentBody } from './support/students.ts';

let env: PhotoStack;
let reception: Client;
let students = 300;

beforeAll(async () => {
  env = await startPhotoStack();
  reception = (await env.stack.session('reception')).client;
}, 240_000);

afterAll(() => env?.close());

const newStudent = async () => (await createStudent(reception, studentBody((students += 1)))).id;

const MAX = 5_242_880;

/** Sem linha de `photos` e sem objeto do envio para o aluno. */
async function expectNothingWritten(studentId: string, name: string) {
  expect(await photoRows(env.stack, studentId), `${name}: linhas`).toEqual([]);
  expect(await uploadKeys(env.minio, studentId), `${name}: objetos`).toEqual([]);
}

async function expectRefused(studentId: string, response: Response, status: number, code: string, name: string, path?: string) {
  const body = (await response.json()) as Problem;
  expect(response.status, name).toBe(status);
  expect(body.code, name).toBe(code);
  if (path !== undefined) expect(body.errors?.map((error) => error.path), name).toContain(path);
  await expectNothingWritten(studentId, name);
}

const exifJpeg = (width: number, height: number, orientation: number) =>
  solid(width, height).jpeg().withMetadata({ orientation }).toBuffer();

test('accepted_by_magic_bytes_whatever_name_and_part_type', async () => {
  const cases: Array<[string, () => Promise<Response>]> = [];
  const add = (name: string, send: (studentId: string) => Promise<Response>) =>
    cases.push([name, async () => send(await newStudent())]);
  add('PNG como foto.jpg e image/jpeg', async (id) =>
    uploadPhoto(reception, id, await pngBytes(), { filename: 'foto.jpg', type: 'image/jpeg' }),
  );
  add('JPEG como foto.png e image/png', async (id) =>
    uploadPhoto(reception, id, await jpegBytes(), { filename: 'foto.png', type: 'image/png' }),
  );
  add('WebP sem nome de arquivo e text/plain', async (id) =>
    postParts(reception, id, [{ name: 'file', bytes: await webpBytes(), type: 'text/plain' }]),
  );

  for (const [name, send] of cases) expect((await send()).status, name).toBe(201);
});

test('five_non_image_contents_415_writes_nothing', async () => {
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVEfmt '), Buffer.alloc(40)]);
  const contents: Array<[string, Buffer]> = [
    ['texto como image/jpeg', Buffer.from('isto é só um texto, não uma foto\n'.repeat(40))],
    ['GIF', Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00;', 'latin1')],
    ['PDF', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500"/></svg>')],
    ['RIFF que não é WebP', wav],
  ];
  expect(contents).toHaveLength(5);

  for (const [name, bytes] of contents) {
    const id = await newStudent();
    const response = await uploadPhoto(reception, id, bytes, { filename: 'foto.jpg', type: 'image/jpeg' });
    await expectRefused(id, response, 415, 'unsupported_media_type', name);
  }
});

test('non_multipart_bodies_415', async () => {
  const jpeg = await jpegBytes();
  const sends: Array<[string, (id: string) => Promise<Response>]> = [
    ['JSON', (id) => reception.post(`/api/students/${id}/photo`, { file: 'x' })],
    [
      'urlencoded',
      (id) =>
        reception.request('POST', `/api/students/${id}/photo`, {
          body: 'file=x',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
    ],
    [
      'imagem crua',
      (id) => reception.request('POST', `/api/students/${id}/photo`, { body: jpeg, headers: { 'Content-Type': 'image/jpeg' } }),
    ],
  ];

  for (const [name, send] of sends) {
    const id = await newStudent();
    await expectRefused(id, await send(id), 415, 'unsupported_media_type', name);
  }
});

test('size_limit_at_5_mib_and_one_byte_over_also_chunked', async () => {
  const jpeg = await jpegBytes(800, 1000);
  const exactly = padJpeg(jpeg, MAX);
  const over = padJpeg(jpeg, MAX + 1);
  expect([exactly.length, over.length]).toEqual([MAX, MAX + 1]);

  const accepted = await newStudent();
  expect((await uploadPhoto(reception, accepted, exactly)).status, '5 242 880 bytes').toBe(201);

  const refused = await newStudent();
  await expectRefused(refused, await uploadPhoto(reception, refused, over), 413, 'payload_too_large', '5 242 881 bytes');

  const chunked = await newStudent();
  await expectRefused(
    chunked,
    await uploadPhotoChunked(reception, chunked, over),
    413,
    'payload_too_large',
    '5 242 881 bytes em partes',
  );
});

test('missing_or_duplicate_file_part_422_on_path_file', async () => {
  const jpeg = await jpegBytes();
  const cases: Array<[string, Parameters<typeof postParts>[2]]> = [
    ['nenhuma parte', []],
    ['só um campo de texto', [{ name: 'legenda', value: 'minha foto' }]],
    ['arquivo numa parte de outro nome', [{ name: 'photo', bytes: jpeg, filename: 'foto.jpg', type: 'image/jpeg' }]],
    [
      'duas partes file',
      [
        { name: 'file', bytes: jpeg, filename: 'a.jpg', type: 'image/jpeg' },
        { name: 'file', bytes: jpeg, filename: 'b.jpg', type: 'image/jpeg' },
      ],
    ],
  ];

  for (const [name, parts] of cases) {
    const id = await newStudent();
    // sem parte alguma o corpo é só o fechamento do multipart
    const response =
      parts.length === 0
        ? await reception.request('POST', `/api/students/${id}/photo`, {
            body: multipart([]).body,
            headers: { 'Content-Type': multipart([]).contentType },
          })
        : await postParts(reception, id, parts);
    await expectRefused(id, response, 422, 'validation_failed', name, 'file');
  }
});

test('minimum_300x400_after_orientation_five_cases', async () => {
  const cases: Array<[string, () => Promise<Buffer>, 201 | 422]> = [
    ['299×400', () => solid(299, 400).jpeg().toBuffer(), 422],
    ['300×399', () => solid(300, 399).jpeg().toBuffer(), 422],
    ['300×400', () => solid(300, 400).jpeg().toBuffer(), 201],
    ['400×300 guardado com EXIF 6, que se lê em 300×400', () => exifJpeg(400, 300, 6), 201],
    ['300×400 guardado com EXIF 6, que se lê em 400×300', () => exifJpeg(300, 400, 6), 422],
  ];

  for (const [name, make, status] of cases) {
    const id = await newStudent();
    const response = await uploadPhoto(reception, id, await make());
    if (status === 201) expect(response.status, name).toBe(201);
    else await expectRefused(id, response, 422, 'validation_failed', name, 'file');
  }
});

test('pixel_ceiling_at_40_million', async () => {
  const accepted = await newStudent();
  const png = await solid(8000, 5000).png({ compressionLevel: 1 }).toBuffer();
  expect((await uploadPhoto(reception, accepted, png, { filename: 'grande.png', type: 'image/png' })).status, '8000×5000').toBe(201);

  for (const [name, bytes] of [
    ['3015×13267 (40 000 005 pixels)', blankPng(3015, 13_267)],
    ['30 000×30 000', blankPng(30_000, 30_000)],
  ] as const) {
    expect((await sharp(bytes, { limitInputPixels: false }).metadata()).width, name).toBeGreaterThan(3000);
    const id = await newStudent();
    await expectRefused(id, await uploadPhoto(reception, id, bytes, { filename: 'grande.png', type: 'image/png' }), 422, 'validation_failed', name, 'file');
  }
});

test('truncated_or_garbage_after_magic_422_on_path_file', async () => {
  const half = (bytes: Buffer) => bytes.subarray(0, Math.floor(bytes.length / 2));
  const image = noise(800, 1000);
  const cases: Array<[string, () => Promise<Buffer>]> = [
    ['JPEG truncado', async () => half(await image.clone().jpeg().toBuffer())],
    ['PNG truncado', async () => half(await image.clone().png().toBuffer())],
    ['WebP truncado', async () => half(await image.clone().webp().toBuffer())],
    ['assinatura de JPEG com lixo', async () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('lixo que não é imagem'.repeat(20))])],
  ];

  for (const [name, make] of cases) {
    const id = await newStudent();
    await expectRefused(id, await uploadPhoto(reception, id, await make()), 422, 'validation_failed', name, 'file');
  }
});
