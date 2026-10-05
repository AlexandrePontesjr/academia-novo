import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { PhotoSigner } from '../src/photos/photo-signer.ts';

const SECRET = 'segredo-de-assinatura-com-mais-de-32-caracteres';
const photoId = randomUUID();
const hmac = (secret: string, variant: string, exp: number | string) =>
  createHmac('sha256', secret).update(`${photoId}.${variant}.${exp}`).digest('base64url');

afterEach(() => vi.useRealTimers());

/** Só a data é falsa: o resto do tempo corre. */
function clockAt(seconds: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(seconds * 1000);
}

test('sign_matches_hmac_sha256_base64url_of_id_variant_exp', () => {
  const signer = new PhotoSigner(SECRET);
  const exp = 1_900_000_000;

  for (const variant of ['thumb', 'medium', 'large'] as const) {
    const signed = signer.sign(photoId, variant, exp);
    const expected = hmac(SECRET, variant, exp);

    expect(signed, variant).toBe(`/api/photo-files/${photoId}/${variant}?exp=${exp}&sig=${expected}`);
    expect(expected, variant).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // outro segredo, outra assinatura
    expect(new PhotoSigner('outro-segredo-com-mais-de-32-caracteres!!').sign(photoId, variant, exp), variant).not.toBe(signed);
  }
});

test('verify_true_once_and_false_for_eight_forms_without_throwing', () => {
  const signer = new PhotoSigner(SECRET);
  const now = 1_900_000_000;
  clockAt(now);
  const exp = now + 1;
  const sig = hmac(SECRET, 'thumb', exp);
  const other = randomUUID();

  const attempt = (change: Partial<{ photoId: string; variant: string; exp: string | undefined; sig: string | undefined }>) => {
    const request = { photoId, variant: 'thumb', exp: String(exp), sig, ...change };
    return signer.verify(request.photoId, request.variant, request.exp, request.sig);
  };

  expect(attempt({})).toBe(true);

  const flipped = `${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`;
  const forms: Array<[string, () => boolean]> = [
    ['exp igual a T - 1 s', () => attempt({ exp: String(now - 1), sig: hmac(SECRET, 'thumb', now - 1) })],
    ['sig com um caractere trocado', () => attempt({ sig: flipped })],
    ['sig vazio', () => attempt({ sig: '' })],
    ['sig de outro tamanho', () => attempt({ sig: sig.slice(0, -1) })],
    ['exp trocado por outro número', () => attempt({ exp: String(exp + 1) })],
    ['exp abc', () => attempt({ exp: 'abc', sig: hmac(SECRET, 'thumb', 'abc') })],
    ['exp 1e10', () => attempt({ exp: '1e10', sig: hmac(SECRET, 'thumb', '1e10') })],
    ['exp 0x10', () => attempt({ exp: '0x10', sig: hmac(SECRET, 'thumb', '0x10') })],
    ['photoId trocado', () => attempt({ photoId: other })],
    ['variante trocada', () => attempt({ variant: 'large' })],
    ['sig ausente', () => attempt({ sig: undefined })],
    ['exp ausente', () => attempt({ exp: undefined })],
  ];
  for (const [name, run] of forms) expect(run, name).not.toThrow();
  for (const [name, run] of forms) expect(run(), name).toBe(false);
});
