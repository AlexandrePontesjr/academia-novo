import { PHOTO_VARIANTS, type PhotoVariant } from '@academia/contracts';

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export const isPhotoVariant = (value: unknown): value is PhotoVariant =>
  typeof value === 'string' && (PHOTO_VARIANTS as readonly string[]).includes(value);

/** O prefixo de todas as chaves de uma foto: `main` é o segmento `{tenant}` fixo (AD-016). */
export const photoPrefix = (ownerId: string, photoId: string) => `photos/main/${ownerId}/${photoId}/`;

/**
 * A chave do objeto de uma variante (door 2): só o id do dono (aluno ou funcionário, funcionarios
 * door 3), `photoId` e variante, nunca um nome, caminho ou tipo vindos do cliente. Um segmento fora
 * do formato lança.
 */
export function photoKey(ownerId: string, photoId: string, variant: string): string {
  if (!UUID.test(ownerId)) throw new Error('ownerId da chave de foto não é um uuid');
  if (!UUID.test(photoId)) throw new Error('photoId da chave de foto não é um uuid');
  if (!isPhotoVariant(variant)) throw new Error('variante da chave de foto desconhecida');
  return `${photoPrefix(ownerId, photoId)}${variant}.webp`;
}
