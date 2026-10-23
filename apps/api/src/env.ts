import { z } from 'zod';
import { isDataKey } from './crypto.ts';

/** Vazia conta como ausente: um `.env` com a chave e sem valor é o mesmo que não ter a chave (door 6). */
const blankAsAbsent = (value: unknown) => (value === '' ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankAsAbsent, schema.optional());

export const envSchema = z
  .object({
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
    /** SMTP do e-mail de confirmação do pré-cadastro (door 6): opcional; sem ele o e-mail vai só para o log. */
    SMTP_HOST: optional(z.string()),
    SMTP_PORT: z.preprocess(blankAsAbsent, z.coerce.number().int().min(1).max(65535).default(587)),
    SMTP_SECURE: z.preprocess(
      blankAsAbsent,
      z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    ),
    SMTP_USER: optional(z.string()),
    SMTP_PASS: optional(z.string()),
    /** Remetente, obrigatório quando `SMTP_HOST` existe. */
    MAIL_FROM: optional(z.string()),
    /** Entrar com Google no pré-cadastro (door 7): as duas juntas, ou nenhuma. */
    GOOGLE_CLIENT_ID: optional(z.string()),
    GOOGLE_CLIENT_SECRET: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    // a falta é apontada na variável que falta, nunca com o valor da outra
    const missing = (key: keyof typeof env) => ctx.addIssue({ code: 'custom', path: [key], message: 'ausente' });
    if (env.SMTP_HOST !== undefined && env.MAIL_FROM === undefined) missing('MAIL_FROM');
    if (env.SMTP_USER !== undefined && env.SMTP_PASS === undefined) missing('SMTP_PASS');
    if (env.SMTP_PASS !== undefined && env.SMTP_USER === undefined) missing('SMTP_USER');
    if (env.GOOGLE_CLIENT_ID !== undefined && env.GOOGLE_CLIENT_SECRET === undefined) missing('GOOGLE_CLIENT_SECRET');
    if (env.GOOGLE_CLIENT_SECRET !== undefined && env.GOOGLE_CLIENT_ID === undefined) missing('GOOGLE_CLIENT_ID');
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
