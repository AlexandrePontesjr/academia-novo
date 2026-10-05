import { z } from 'zod';

/** Corpo de `GET /health`. Cada dependência nova da API acrescenta uma chave em `checks`. */
export const healthResponseSchema = z.strictObject({
  status: z.enum(['ok', 'degraded']),
  checks: z.strictObject({
    database: z.enum(['up', 'down']),
    storage: z.enum(['up', 'down']),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
