import { healthResponseSchema } from '@academia/contracts';
import { envSchema } from '../env.ts';

// O status da API é consultado a cada requisição, nunca no build.
export const dynamic = 'force-dynamic';

const HEALTH_TIMEOUT_MS = 3000;

async function isApiOperational(): Promise<boolean> {
  try {
    const { API_URL } = envSchema.parse(process.env);
    const response = await fetch(new URL('/health', API_URL), {
      cache: 'no-store',
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (response.status !== 200) return false;
    return healthResponseSchema.parse(await response.json()).status === 'ok';
  } catch {
    return false;
  }
}

// Página provisória: `auth-rbac` a troca pelo login.
export default async function HomePage() {
  const operational = await isApiOperational();

  return (
    <main>
      <h1>Gestão de Academia</h1>
      <p role="status">{operational ? 'API: operacional' : 'API: indisponível'}</p>
    </main>
  );
}
