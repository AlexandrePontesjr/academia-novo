import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** O texto de `DATA_ENCRYPTION_KEY` é o base64 de exatamente 32 bytes. */
export function isDataKey(value: string): boolean {
  const key = Buffer.from(value, 'base64');
  return key.length === KEY_BYTES && key.toString('base64') === value;
}

/**
 * Cifra de coluna em nível de aplicação (AD-031): AES-256-GCM, IV aleatório de 12 bytes por
 * gravação, valor guardado `v1.<iv>.<texto cifrado>.<tag>` com cada parte em base64url. O valor é
 * amarrado à linha: o `context` (o `id` dela) entra como dado autenticado adicional, e um valor
 * copiado de outra linha não decifra (AD-034). A rotação de chave é uma `v2` que recifra as linhas.
 */
export class ColumnCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    if (!isDataKey(base64Key)) throw new Error('chave de cifra inválida');
    this.key = Buffer.from(base64Key, 'base64');
  }

  encrypt(text: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, ...[iv, encrypted, tag].map((part) => part.toString('base64url'))].join('.');
  }

  /** O texto original; lança quando o valor foi alterado, é de outra chave ou de outra linha, ou não é `v1`. */
  decrypt(stored: string, context: string): string {
    const [version, iv, encrypted, tag, ...rest] = stored.split('.');
    if (version !== VERSION || !iv || encrypted === undefined || !tag || rest.length > 0) {
      throw new Error('valor cifrado em formato desconhecido');
    }
    const ivBytes = Buffer.from(iv, 'base64url');
    const tagBytes = Buffer.from(tag, 'base64url');
    if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) throw new Error('valor cifrado malformado');
    const decipher = createDecipheriv('aes-256-gcm', this.key, ivBytes);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  }
}
