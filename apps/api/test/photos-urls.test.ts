import { randomUUID } from 'node:crypto';
import type { Problem, Role } from '@academia/contracts';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { PhotoSigner } from '../src/photos/photo-signer.ts';
import { PHOTO_URL_SECRET } from './support/app.ts';
import type { Client } from './support/client.ts';
import { captureOutput } from './support/log.ts';
import {
  apiWith,
  bucketKeys,
  bucketObject,
  flakyStorage,
  jpegBytes,
  padJpeg,
  type PhotoStack,
  startPhotoStack,
  uploadKeys,
  uploadPhoto,
  uploaded,
} from './support/photos.ts';
import { freePort, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY } from './support/servers.ts';
import { problem } from './support/stack.ts';
import { createStudent, studentBody } from './support/students.ts';

let env: PhotoStack;
let reception: Client;
const sessions = {} as Record<Role, Client>;
let students = 700;

beforeAll(async () => {
  env = await startPhotoStack();
  for (const role of ['admin', 'reception', 'hr_finance', 'instructor'] as const) {
    sessions[role] = (await env.stack.session(role)).client;
  }
  reception = sessions.reception;
}, 240_000);

afterEach(() => vi.useRealTimers());
afterAll(() => env?.close());

const newStudent = async (overrides: Record<string, unknown> = {}) =>
  (await createStudent(reception, studentBody((students += 1), overrides))).id;
const photoPath = (studentId: string) => `/api/students/${studentId}/photo`;
const signer = new PhotoSigner(PHOTO_URL_SECRET);
const ROLES = ['admin', 'reception', 'hr_finance', 'instructor'] as const;

/** Só a data é falsa: segundos inteiros, perto do relógio real para a sessão não expirar. */
function clockAt(seconds: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(seconds * 1000);
}
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Um aluno com foto enviada pela rota, e o `id` da linha. */
async function studentWithPhoto(overrides: Record<string, unknown> = {}) {
  const studentId = await newStudent(overrides);
  const created = await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));
  return { studentId, photoId: created.id };
}

/** Sem cookie, como o `<img>` do navegador. */
const fetchFile = (url: string, init: RequestInit = {}) => fetch(`${env.stack.api.url}${url}`, init);

const urlOf = async (client: Client, studentId: string, query = '') => {
  const response = await client.get(`${photoPath(studentId)}${query}`);
  expect(response.status, 'URL de preparação').toBe(200);
  return (await response.json()) as { url: string; expiresAt: string };
};

test('url_for_four_profiles_expires_300s_after_response', async () => {
  const { studentId, photoId } = await studentWithPhoto();
  const T = nowSeconds();
  clockAt(T);

  for (const role of ROLES) {
    const response = await sessions[role].get(`${photoPath(studentId)}?variant=thumb`);
    const body = (await response.json()) as { url: string; expiresAt: string };

    expect(response.status, role).toBe(200);
    expect(body.url, role).toMatch(new RegExp(`^/api/photo-files/${photoId}/thumb\\?exp=${T + 300}&sig=[A-Za-z0-9_-]+$`));
    expect(body.expiresAt, role).toBe(new Date((T + 300) * 1000).toISOString());
  }

  const large = (await (await sessions.reception.get(`${photoPath(studentId)}?variant=large`)).json()) as { url: string };
  expect(large.url).toMatch(new RegExp(`^/api/photo-files/${photoId}/large\\?exp=${T + 300}&sig=`));
});

test('variant_defaults_to_medium', async () => {
  const { studentId, photoId } = await studentWithPhoto();

  const { url } = await urlOf(reception, studentId);

  expect(url).toMatch(new RegExp(`^/api/photo-files/${photoId}/medium\\?`));
});

test('invalid_variant_422_on_path_variant', async () => {
  const { studentId } = await studentWithPhoto();

  for (const query of ['?variant=huge', '?variant=THUMB', '?variant=', '?variant=thumb&variant=large']) {
    const response = await reception.get(`${photoPath(studentId)}${query}`);
    const body = (await response.json()) as Problem;

    expect(response.status, query).toBe(422);
    expect(body.code, query).toBe('validation_failed');
    expect(body.errors?.map((error) => error.path), query).toContain('variant');
  }
});

test('photo_url_404_for_unknown_bad_and_photoless', async () => {
  const photoless = await newStudent();

  for (const id of [randomUUID(), 'abc', photoless]) {
    const response = await reception.get(photoPath(id));

    expect(response.status, id).toBe(404);
    expect((await problem(response)).code, id).toBe('not_found');
  }
});

test('signed_url_serves_three_variants_without_session', async () => {
  const { studentId, photoId } = await studentWithPhoto();

  for (const variant of ['thumb', 'medium', 'large'] as const) {
    const { url } = await urlOf(reception, studentId, `?variant=${variant}`);

    const response = await fetchFile(url);

    expect(response.status, variant).toBe(200);
    expect(response.headers.get('content-type'), variant).toBe('image/webp');
    expect(response.headers.get('cache-control'), variant).toBe('no-store');
    const stored = await bucketObject(env.minio, `photos/main/${studentId}/${photoId}/${variant}.webp`);
    expect(Buffer.from(await response.arrayBuffer()).equals(stored), variant).toBe(true);
  }
});

test('expired_signature_403_one_second_either_side', async () => {
  const { studentId } = await studentWithPhoto();
  const T = nowSeconds();
  clockAt(T);
  const { url } = await urlOf(reception, studentId, '?variant=thumb');
  const exp = T + 300;

  vi.setSystemTime((exp - 1) * 1000);
  expect((await fetchFile(url)).status, 'exp - 1 s').toBe(200);

  vi.setSystemTime((exp + 1) * 1000);
  const expired = await fetchFile(url);
  const text = await expired.text();
  expect(expired.status, 'exp + 1 s').toBe(403);
  expect(JSON.parse(text).code).toBe('invalid_signature');
  expect(expired.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
  expect(text.startsWith('RIFF')).toBe(false);
});

test('thirteen_tampered_requests_403_and_unknown_id_is_not_a_404', async () => {
  const first = await studentWithPhoto();
  const second = await studentWithPhoto();
  const { url } = await urlOf(reception, first.studentId, '?variant=thumb');
  const parsed = new URL(url, 'http://x');
  const exp = parsed.searchParams.get('exp')!;
  const sig = parsed.searchParams.get('sig')!;
  const path = `/api/photo-files/${first.photoId}/thumb`;
  const flip = (value: string, at: number) => `${value.slice(0, at)}${value[at] === 'A' ? 'B' : 'A'}${value.slice(at + 1)}`;

  const requests: Array<[string, string[]]> = [
    ['sig ausente', [`${path}?exp=${exp}`]],
    ['sig vazio', [`${path}?exp=${exp}&sig=`]],
    ['primeiro caractere do sig trocado', [`${path}?exp=${exp}&sig=${flip(sig, 0)}`]],
    ['último caractere do sig trocado', [`${path}?exp=${exp}&sig=${flip(sig, sig.length - 1)}`]],
    ['sig de outro tamanho', [`${path}?exp=${exp}&sig=${sig.slice(0, -1)}`]],
    ['dois sig', [`${path}?exp=${exp}&sig=${sig}&sig=${sig}`]],
    ['exp ausente', [`${path}?sig=${sig}`]],
    ['exp não numérico', [`${path}?exp=abc&sig=${sig}`]],
    ['exp + 1', [`${path}?exp=${Number(exp) + 1}&sig=${sig}`]],
    ['exp - 1', [`${path}?exp=${Number(exp) - 1}&sig=${sig}`]],
    ['photoId de outra foto', [`/api/photo-files/${second.photoId}/thumb?exp=${exp}&sig=${sig}`]],
    ['variante trocada', [`/api/photo-files/${first.photoId}/large?exp=${exp}&sig=${sig}`]],
    [
      'variante original ou ../medium com assinatura de lixo',
      [
        `/api/photo-files/${first.photoId}/original?exp=${exp}&sig=lixo`,
        `/api/photo-files/${first.photoId}/..%2Fmedium?exp=${exp}&sig=lixo`,
      ],
    ],
    ['photoId que nunca existiu com sig de lixo', [`/api/photo-files/${randomUUID()}/thumb?exp=${exp}&sig=lixo`]],
  ];
  expect(requests).toHaveLength(14);

  for (const [name, urls] of requests) {
    for (const target of urls) {
      const response = await fetchFile(target);
      const text = await response.text();

      expect(response.status, name).toBe(403);
      expect(JSON.parse(text).code, name).toBe('invalid_signature');
      expect(response.headers.get('content-type'), name).toMatch(/^application\/problem\+json\b/);
    }
  }
});

test('valid_signature_for_missing_photo_404', async () => {
  const { studentId } = await studentWithPhoto();
  const { url } = await urlOf(reception, studentId, '?variant=thumb');
  expect((await reception.delete(photoPath(studentId))).status).toBe(204);

  const removed = await fetchFile(url);
  expect(removed.status, 'foto removida').toBe(404);
  expect((await problem(removed)).code, 'foto removida').toBe('not_found');

  const never = signer.sign(randomUUID(), 'thumb', nowSeconds() + 300);
  const missing = await fetchFile(never);
  expect(missing.status, 'photoId que nunca existiu').toBe(404);
  expect((await problem(missing)).code, 'photoId que nunca existiu').toBe('not_found');
});

test('file_route_503_storage_unavailable_without_storage_data_when_storage_is_down', async () => {
  const { studentId } = await studentWithPhoto({ name: 'Aluno do Armazenamento Fora' });
  const { url } = await urlOf(reception, studentId, '?variant=thumb');
  const deadEndpoint = `http://127.0.0.1:${await freePort()}`;
  const down = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: deadEndpoint });
  try {
    const response = await fetch(`${down.api.url}${url}`);
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
    expect((await problem(response.clone())).code).toBe('storage_unavailable');

    const { headers, text } = await shown(response);
    const forbidden = [new URL(deadEndpoint).host, new URL(env.minio.endpoint).host, env.minio.bucket, 'photos/main/', STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY];
    for (const value of forbidden) expect(text.includes(value), value).toBe(false);
    expect(headers.filter((header) => header.startsWith('x-amz-'))).toEqual([]);
    expect(text.includes('RIFF')).toBe(false);
  } finally {
    await down.api.close();
  }
});

/** Tudo o que uma resposta mostra: cabeçalhos e corpo, como texto. */
async function shown(response: Response) {
  const headers = [...response.headers].map(([name, value]) => `${name}: ${value}`);
  return { headers, text: `${headers.join('\n')}\n${Buffer.from(await response.arrayBuffer()).toString('latin1')}` };
}

test('no_storage_address_key_or_credential_in_any_response', async () => {
  const proxy = await flakyStorage(env.minio.endpoint);
  const deadEndpoint = `http://127.0.0.1:${await freePort()}`;
  const down = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: deadEndpoint });
  try {
    const { studentId, photoId } = await studentWithPhoto({ name: 'Aluno do Vazamento' });
    const other = await newStudent();
    const jpeg = await jpegBytes();
    const created = await uploadPhoto(reception, other, jpeg);
    const { url } = await urlOf(reception, studentId, '?variant=thumb');
    const responses: Array<[string, Response]> = [
      ['201 do envio', created],
      ['200 da URL', await reception.get(photoPath(studentId))],
      ['200 do arquivo', await fetchFile(url)],
      ['404 do arquivo', await fetchFile(signer.sign(randomUUID(), 'thumb', nowSeconds() + 300))],
      ['403 do arquivo', await fetchFile(`/api/photo-files/${photoId}/thumb?exp=1&sig=lixo`)],
      ['409 do envio', await uploadPhoto(reception, studentId, jpeg)],
      ['413 do envio', await uploadPhoto(reception, await newStudent(), padJpeg(jpeg, 5_242_881))],
      ['415 do envio', await uploadPhoto(reception, await newStudent(), Buffer.from('texto'.repeat(50)))],
      ['422 do envio', await uploadPhoto(reception, await newStudent(), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('lixo')]))],
      ['503 do envio', await uploadPhoto(down.client, await newStudent(), jpeg)],
      ['photoUrl da ficha', await reception.get(`/api/students/${studentId}`)],
      ['photoUrl da lista', await reception.get('/api/students?q=Vazamento')],
    ];
    expect(responses.map(([, response]) => response.status)).toEqual([201, 200, 200, 404, 403, 409, 413, 415, 422, 503, 200, 200]);

    const endpointHosts = [new URL(env.minio.endpoint).host, new URL(deadEndpoint).host, new URL(proxy.endpoint).host];
    const forbidden = [...endpointHosts, env.minio.bucket, 'photos/main/', STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY];
    for (const [name, response] of responses) {
      const { headers, text } = await shown(response);
      for (const value of forbidden) expect(text.includes(value), `${name}: ${value}`).toBe(false);
      expect(headers.filter((header) => header.startsWith('x-amz-')), `${name}: x-amz-`).toEqual([]);
      expect(headers.some((header) => /^server:\s*minio/i.test(header)), `${name}: Server`).toBe(false);
    }
  } finally {
    await down.api.close();
    await proxy.stop();
  }
});

test('anonymous_request_to_bucket_403_for_objects_and_listing', async () => {
  const { studentId } = await studentWithPhoto();
  const keys = await uploadKeys(env.minio, studentId);
  expect(keys).toHaveLength(3);

  for (const key of keys) {
    const response = await fetch(`${env.minio.endpoint}/${env.minio.bucket}/${key}`);
    expect(response.status, key).toBe(403);
  }
  expect((await fetch(`${env.minio.endpoint}/${env.minio.bucket}/`)).status, 'listagem').toBe(403);
  expect((await bucketKeys(env.minio, `photos/main/${studentId}/`)).length).toBe(3);
});

test('five_secrets_never_reach_the_log', async () => {
  const proxy = await flakyStorage(env.minio.endpoint);
  const flaky = await apiWith(env.stack, { ...env.minio.env, S3_ENDPOINT: proxy.endpoint });
  const output = captureOutput();
  try {
    const studentId = await newStudent();
    await uploaded(await uploadPhoto(reception, studentId, await jpegBytes()));
    const { url } = await urlOf(reception, studentId, '?variant=medium');
    const validSig = new URL(url, 'http://x').searchParams.get('sig')!;
    const invalidSig = 'ASSINATURA-INVALIDA-0123456789';
    expect((await fetchFile(url)).status).toBe(200);
    expect((await fetchFile(url.replace(validSig, invalidSig))).status).toBe(403);
    proxy.failWriteOf = 'large';
    expect((await uploadPhoto(flaky.client, await newStudent(), await jpegBytes())).status).toBe(503);

    const written = output.text();
    expect(written).toMatch(/"msg":"request"/);
    const secrets: Record<string, string> = {
      'sig válido': validSig,
      'sig inválido': invalidSig,
      PHOTO_URL_SECRET,
      'chave de acesso': STORAGE_ACCESS_KEY,
      'chave secreta': STORAGE_SECRET_KEY,
    };
    for (const [name, value] of Object.entries(secrets)) expect(written.includes(value), name).toBe(false);
  } finally {
    vi.restoreAllMocks();
    await flaky.api.close();
    await proxy.stop();
  }
});

const FICHA_KEYS = {
  admin: ['address', 'birthDate', 'cpf', 'email', 'emergencyContactName', 'emergencyContactPhone', 'healthNotes', 'id', 'name', 'phone', 'photoUrl', 'sex', 'status'],
  hr_finance: ['address', 'birthDate', 'cpf', 'email', 'emergencyContactName', 'emergencyContactPhone', 'id', 'name', 'phone', 'photoUrl', 'sex', 'status'],
  instructor: ['id', 'name', 'photoUrl', 'status'],
};
const ficha = (role: Role) => (role === 'reception' ? FICHA_KEYS.admin : FICHA_KEYS[role]);

/** Um aluno com uma versão antiga não corrente e a corrente, inseridas direto: só a corrente é a foto. */
async function studentWithTwoVersions(overrides: Record<string, unknown> = {}) {
  const studentId = await newStudent(overrides);
  await env.stack.query('insert into photos (student_id, version, is_current) values ($1, 1, false)', [studentId]);
  const [current] = await env.stack.query<{ id: string }>(
    'insert into photos (student_id, version, is_current) values ($1, 2, true) returning id',
    [studentId],
  );
  return { studentId, currentId: current!.id };
}

test('ficha_photo_url_medium_for_four_profiles_null_when_absent', async () => {
  const withPhoto = await studentWithTwoVersions();
  const photoless = await newStudent();
  const T = nowSeconds();
  clockAt(T);

  for (const role of ROLES) {
    const response = await sessions[role].get(`/api/students/${withPhoto.studentId}`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status, role).toBe(200);
    expect(body.photoUrl, role).toBe(signer.sign(withPhoto.currentId, 'medium', T + 300));
    expect(Object.keys(body).sort(), role).toEqual(ficha(role));

    const without = (await (await sessions[role].get(`/api/students/${photoless}`)).json()) as Record<string, unknown>;
    expect('photoUrl' in without, `${role} sem foto: chave presente`).toBe(true);
    expect(without.photoUrl, `${role} sem foto`).toBeNull();
  }
});

test('list_photo_url_thumb_per_item_for_four_profiles_no_duplicates', async () => {
  const tag = `Listagem${students}`;
  const two = await studentWithTwoVersions({ name: `${tag} Duas Versões` });
  const one = await studentWithTwoVersions({ name: `${tag} Uma Foto` });
  await env.stack.query('delete from photos where student_id = $1 and version = 1', [one.studentId]);
  const none = await newStudent({ name: `${tag} Sem Foto` });
  const T = nowSeconds();
  clockAt(T);

  for (const role of ROLES) {
    const response = await sessions[role].get(`/api/students?q=${tag}`);
    const body = (await response.json()) as { items: Array<Record<string, unknown>> };

    expect(response.status, role).toBe(200);
    expect(body.items.map((item) => item.id).sort(), role).toEqual([two.studentId, one.studentId, none].sort());
    const byId = new Map(body.items.map((item) => [item.id, item]));
    expect(byId.get(two.studentId)!.photoUrl, `${role} duas linhas`).toBe(signer.sign(two.currentId, 'thumb', T + 300));
    expect(byId.get(one.studentId)!.photoUrl, `${role} uma foto`).toBe(signer.sign(one.currentId, 'thumb', T + 300));
    expect(byId.get(none)!.photoUrl, `${role} sem foto`).toBeNull();
    const keys = role === 'instructor' ? ['id', 'name', 'photoUrl', 'status'] : ['cpf', 'id', 'name', 'phone', 'photoUrl', 'status'];
    for (const item of body.items) expect(Object.keys(item).sort(), role).toEqual(keys);
  }
});
