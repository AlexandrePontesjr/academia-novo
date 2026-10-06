import { z } from 'zod';
import { isDataKey } from './crypto.ts';

export const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65535),
  /** Chave que assina os cookies e cifra os segredos TOTP. */
  AUTH_SECRET: z.string().min(32),
  /** Origem do web, a única de onde o navegador fala com a API (AD-019, AD-020). */
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }),
  /** Chave das colunas cifradas em nível de aplicação: o base64 de 32 bytes (AD-031). */
  DATA_ENCRYPTION_KEY: z.string().refine(isDataKey),
  /** Armazenamento de objetos compatível com S3, onde ficam as fotos (foto-pipeline, door 3). */
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** Chave que assina as URLs de foto (door 4): separada de `AUTH_SECRET`, 32 caracteres ou mais. */
  PHOTO_URL_SECRET: z.string().min(32),
  /** Dias que a versão trocada de uma foto fica guardada antes do expurgo (foto-captura, door 5). */
  PHOTO_VERSION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export type Env = z.infer<typeof envSchema>;

/** Variáveis rejeitadas, só pelo nome: o valor de uma variável nunca vai para a saída. */
export class EnvError extends Error {
  readonly missing: string[];
  readonly invalid: string[];

  constructor(missing: string[], invalid: string[]) {
    super(
      [
        missing.length > 0 ? `ausentes: ${missing.join(', ')}` : '',
        invalid.length > 0 ? `inválidas: ${invalid.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; '),
    );
    this.missing = missing;
    this.invalid = invalid;
  }
}

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const rejected = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  const isMissing = (key: string) => source[key] === undefined || source[key] === '';
  throw new EnvError(
    rejected.filter(isMissing),
    rejected.filter((key) => !isMissing(key)),
  );
}
