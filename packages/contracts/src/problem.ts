import { z } from 'zod';

/**
 * Corpo de toda resposta de erro da API (`application/problem+json`).
 * O front ramifica por `code`, que é estável e em snake_case; nunca por `title`.
 */
export const problemSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.number().int(),
  code: z.string().regex(/^[a-z]+(_[a-z]+)*$/),
  requestId: z.string().min(1),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type Problem = z.infer<typeof problemSchema>;
