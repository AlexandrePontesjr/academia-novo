import { randomBytes } from 'node:crypto';
import { expect, test } from 'vitest';
import { ColumnCipher } from '../src/crypto.ts';

const key = () => randomBytes(32).toString('base64');
const ROW = '018f0000-0000-7000-8000-000000000001';
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const decodedLength = (part: string) => Buffer.from(part, 'base64url').length;

test('v1_format_round_trip_and_fresh_iv', () => {
  const cipher = new ColumnCipher(key());
  const texts = [
    'Hipertensão controlada, usa losartana.',
    'Alergia a dipirona 💊\nsem restrição de impacto',
    'á'.repeat(2000),
  ];

  for (const text of texts) {
    const stored = cipher.encrypt(text, ROW);
    const parts = stored.split('.');

    expect(parts, stored.slice(0, 20)).toHaveLength(4);
    expect(parts[0]).toBe('v1');
    for (const part of parts.slice(1)) expect(part).toMatch(BASE64URL);
    expect(decodedLength(parts[1]!)).toBe(12);
    expect(decodedLength(parts[3]!)).toBe(16);
    expect(stored).not.toContain(text.slice(0, 8));
    expect(cipher.decrypt(stored, ROW)).toBe(text);
  }

  const again = [cipher.encrypt('mesmo texto', ROW), cipher.encrypt('mesmo texto', ROW)];
  expect(again[0]).not.toBe(again[1]);
  expect(again[0]!.split('.')[1]).not.toBe(again[1]!.split('.')[1]);
});

test('decrypt_rejects_four_bad_values', () => {
  const cipher = new ColumnCipher(key());
  const stored = cipher.encrypt('Observação de saúde', ROW);
  const [version, iv, text, tag] = stored.split('.') as [string, string, string, string];
  // troca o primeiro caractere por outro do alfabeto, para o valor continuar bem formado
  const flipped = (part: string, at = 0) => `${part[at] === 'A' ? 'B' : 'A'}${part.slice(at + 1)}`;
  const cases: Array<[name: string, value: string]> = [
    ['texto cifrado alterado', [version, iv, flipped(text), tag].join('.')],
    ['tag alterada', [version, iv, text, flipped(tag)].join('.')],
    ['outra chave', new ColumnCipher(key()).encrypt('Observação de saúde', ROW)],
    ['prefixo v2', ['v2', iv, text, tag].join('.')],
    ['sem prefixo', [iv, text, tag].join('.')],
  ];

  expect(cipher.decrypt(stored, ROW)).toBe('Observação de saúde');
  for (const [name, value] of cases) {
    expect(() => cipher.decrypt(value, ROW), name).toThrow();
  }
});

test('key_must_be_the_base64_of_32_bytes', () => {
  for (const size of [0, 16, 31, 33, 64]) {
    expect(() => new ColumnCipher(randomBytes(size).toString('base64')), `${size} bytes`).toThrow();
  }
  expect(() => new ColumnCipher(key())).not.toThrow();
});

test('decrypt_rejects_a_value_from_another_row', () => {
  const cipher = new ColumnCipher(key());
  const stored = cipher.encrypt('Observação de saúde', ROW);

  expect(() => cipher.decrypt(stored, '018f0000-0000-7000-8000-000000000002')).toThrow();
  expect(cipher.decrypt(stored, ROW)).toBe('Observação de saúde');
});
