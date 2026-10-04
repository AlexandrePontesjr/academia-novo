import { z } from 'zod';

export const envSchema = z.object({
  /** URL da API vista pelo servidor do web (na stack, o nome do serviço na rede interna). */
  API_URL: z.url({ protocol: /^https?$/ }),
});

export type Env = z.infer<typeof envSchema>;
