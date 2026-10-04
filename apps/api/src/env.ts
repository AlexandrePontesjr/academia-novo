import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65535),
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
