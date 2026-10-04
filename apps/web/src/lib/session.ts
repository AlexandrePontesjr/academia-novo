import { type SessionResponse, sessionResponseSchema } from '@academia/contracts';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { envSchema } from '../env.ts';

/** O servidor do web não espera pela API mais do que o navegador esperaria. */
export const API_TIMEOUT_MS = 3000;

/** O que da requisição do navegador segue para a API: a sessão e de onde ela veio (AD-028). */
const FORWARDED = ['cookie', 'x-forwarded-for', 'user-agent'];

/**
 * Chama a API do lado do servidor em nome de quem pediu a página: com o cookie, o
 * `X-Forwarded-For` e o `User-Agent` da requisição do navegador.
 */
export async function fetchApi(path: string, incoming: Headers): Promise<Response> {
  const { API_URL } = envSchema.parse(process.env);
  const forwarded = new Headers();
  for (const name of FORWARDED) {
    const value = incoming.get(name);
    if (value) forwarded.set(name, value);
  }
  return fetch(new URL(path, API_URL), {
    headers: forwarded,
    cache: 'no-store',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
}

/** A sessão de quem pediu a página; sem ela (ou sem API), `undefined`. */
export async function readSession(incoming: Headers) {
  try {
    const response = await fetchApi('/api/auth/session', incoming);
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
  const { session } = await readSession(await headers());
  if (!session) redirect('/login');
  return session;
}
