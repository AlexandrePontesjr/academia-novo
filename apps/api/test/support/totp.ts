import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(text: string): Buffer {
  let bits = '';
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/**
 * Código TOTP da RFC 6238 (SHA-1, 6 dígitos, passo de 30 s) para um `otpauth://totp/...`, calculado
 * aqui como um aplicativo autenticador faria - sem passar por nenhum código do Better Auth.
 */
export function totpCode(totpUri: string, at: number = Date.now()): string {
  const secret = new URL(totpUri).searchParams.get('secret');
  if (!secret) throw new Error('totpUri sem secret');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

/** O cabeçalho `Cookie` que um navegador mandaria depois de receber estes `Set-Cookie`. */
export function cookieHeader(headers: Headers): string {
  return headers
    .getSetCookie()
    .filter((cookie) => !/;\s*max-age=0/i.test(cookie))
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}
