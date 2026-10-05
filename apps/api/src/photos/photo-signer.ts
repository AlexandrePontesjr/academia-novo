import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PhotoVariant } from '@academia/contracts';

/** A URL vale 300 s (door 4, RF-17). */
export const PHOTO_URL_TTL_SECONDS = 300;

/**
 * Assina e confere a URL do arquivo de foto (door 4): `sig` é o HMAC-SHA256 de
 * `<photoId>.<variant>.<exp>` em base64url sem preenchimento, e a chave é `PHOTO_URL_SECRET`.
 * `exp` é segundos Unix; a URL vale enquanto o relógio está antes dele.
 */
export class PhotoSigner {
  constructor(private readonly secret: string) {}

  private signature(photoId: string, variant: string, exp: string | number) {
    return createHmac('sha256', this.secret).update(`${photoId}.${variant}.${exp}`).digest('base64url');
  }

  sign(photoId: string, variant: PhotoVariant, exp: number): string {
    return `/api/photo-files/${photoId}/${variant}?exp=${exp}&sig=${this.signature(photoId, variant, exp)}`;
  }

  /** A URL assinada para `variant`, válida por 300 s a partir de agora, e o instante em que expira. */
  issue(photoId: string, variant: PhotoVariant, now = Date.now()) {
    const exp = Math.floor(now / 1000) + PHOTO_URL_TTL_SECONDS;
    return { url: this.sign(photoId, variant, exp), expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** Confere o que a requisição trouxe; qualquer forma malformada é `false`, nunca uma exceção. */
  verify(photoId: string, variant: string, exp: unknown, sig: unknown): boolean {
    if (typeof exp !== 'string' || typeof sig !== 'string') return false;
    if (!/^\d{1,15}$/.test(exp)) return false;
    const expected = Buffer.from(this.signature(photoId, variant, exp));
    const received = Buffer.from(sig);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
    return Number(exp) * 1000 > Date.now();
  }
}
