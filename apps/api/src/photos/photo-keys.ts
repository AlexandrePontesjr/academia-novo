import { PHOTO_VARIANTS, type PhotoVariant } from '@academia/contracts';

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export const isPhotoVariant = (value: unknown): value is PhotoVariant =>
  typeof value === 'string' && (PHOTO_VARIANTS as readonly string[]).includes(value);

/** O prefixo de todas as chaves de uma foto: `main` é o segmento `{tenant}` fixo (AD-016). */
export const photoPrefix = (studentId: string, photoId: string) => `photos/main/${studentId}/${photoId}/`;

/**
 * A chave do objeto de uma variante (door 2): só `studentId`, `photoId` e variante, nunca um
 * nome, caminho ou tipo vindos do cliente. Um segmento fora do formato lança.
 */
export function photoKey(studentId: string, photoId: string, variant: string): string {
  if (!UUID.test(studentId)) throw new Error('studentId da chave de foto não é um uuid');
  if (!UUID.test(photoId)) throw new Error('photoId da chave de foto não é um uuid');
  if (!isPhotoVariant(variant)) throw new Error('variante da chave de foto desconhecida');
  return `${photoPrefix(studentId, photoId)}${variant}.webp`;
}
