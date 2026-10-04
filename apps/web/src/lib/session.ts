import { type SessionResponse, sessionResponseSchema } from '@academia/contracts';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { envSchema } from '../env.ts';

/** O servidor do web não espera pela API mais do que o navegador esperaria. */
export const API_TIMEOUT_MS = 3000;

/** Chama a API do lado do servidor com o cookie de quem pediu a página. */
export async function fetchApi(path: string, cookie: string | null): Promise<Response> {
  const { API_URL } = envSchema.parse(process.env);
  return fetch(new URL(path, API_URL), {
    headers: cookie ? { cookie } : {},
    cache: 'no-store',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
}

/** A sessão de quem pediu a página; sem ela (ou sem API), `undefined`. */
export async function readSession(cookie: string | null) {
  try {
    const response = await fetchApi('/api/auth/session', cookie);
    if (response.status !== 200) return { session: undefined, setCookies: [] };
    return {
      session: sessionResponseSchema.parse(await response.json()),
      // a API renova a expiração deslizante do cookie a cada uso
      setCookies: response.headers.getSetCookie(),
    };
  } catch {
    return { session: undefined, setCookies: [] };
  }
}

/** Numa página protegida: a sessão, ou o redirecionamento para o login. */
export async function requireSession(): Promise<SessionResponse> {
  const { session } = await readSession((await headers()).get('cookie'));
  if (!session) redirect('/login');
  return session;
}
