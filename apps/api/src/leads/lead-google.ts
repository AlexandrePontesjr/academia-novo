import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request } from 'express';
import type { Env } from '../env.ts';
import type { GoogleProfile } from './leads.service.ts';

// Entrar com Google no pré-cadastro (door 7): OpenID Connect com código e PKCE, por `fetch`, fora do
// Better Auth. Aqui ficam as decisões puras - o cookie assinado e a conferência do `id_token` -, que
// o controller usa e os testes conferem sem HTTP.

export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export const STATE_COOKIE = 'lead_google_state';
export const PROFILE_COOKIE = 'lead_google_profile';
/** O estado vale 10 min e o perfil 15 min, em segundos (`Max-Age`). */
export const STATE_TTL_SECONDS = 600;
export const PROFILE_TTL_SECONDS = 900;

export const randomToken = () => randomBytes(32).toString('base64url');

/** O `code_challenge` do PKCE `S256`: o SHA-256 do verificador em base64url. */
export const codeChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

const signature = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

/**
 * O valor do cookie: o JSON em base64url, um ponto e o HMAC-SHA256 dele com `AUTH_SECRET`. `exp`
 * vai dentro do que é assinado, em milissegundos, `ttlSeconds` depois de `now`.
 */
export function signCookie(value: Record<string, string>, secret: string, ttlSeconds: number, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...value, exp: now + ttlSeconds * 1000 })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

/** O conteúdo de um cookie assinado e não vencido; qualquer outra coisa é `undefined`, nunca uma exceção. */
export function verifyCookie(cookie: string | undefined, secret: string, now = Date.now()): Record<string, unknown> | undefined {
  if (!cookie) return undefined;
  const dot = cookie.lastIndexOf('.');
  if (dot < 1) return undefined;
  const payload = cookie.slice(0, dot);
  const expected = Buffer.from(signature(payload, secret));
  const received = Buffer.from(cookie.slice(dot + 1));
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const { exp } = value as { exp?: unknown };
  return typeof exp === 'number' && exp > now ? (value as Record<string, unknown>) : undefined;
}

/**
 * O que o `id_token` declara, aceito só pelas quatro conferências da door 7: o emissor do Google, o
 * cliente desta academia no público, a validade e o e-mail verificado. A assinatura não é conferida:
 * o token vem direto do endpoint de token, por TLS (OIDC Core 3.1.3.7). O e-mail sai em minúsculas.
 */
export function profileFromClaims(claims: Record<string, unknown>, clientId: string, now = Date.now()): GoogleProfile | undefined {
  const { iss, aud, exp, email, email_verified: emailVerified, name } = claims;
  if (typeof iss !== 'string' || !GOOGLE_ISSUERS.includes(iss)) return undefined;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(clientId)) return undefined;
  if (typeof exp !== 'number' || exp * 1000 <= now) return undefined;
  if (emailVerified !== true || typeof email !== 'string' || email === '') return undefined;
  return { name: typeof name === 'string' && name.trim() !== '' ? name.trim() : email, email: email.toLowerCase() };
}

/** As declarações do `id_token`, sem conferir a assinatura; `undefined` se ele não é um JWT legível. */
export function decodeIdToken(idToken: unknown): Record<string, unknown> | undefined {
  if (typeof idToken !== 'string') return undefined;
  const [, payload] = idToken.split('.');
  if (!payload) return undefined;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof claims === 'object' && claims !== null ? (claims as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** O valor de um cookie do cabeçalho `Cookie`, ou `undefined`. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const pair of (header ?? '').split(';')) {
    const trimmed = pair.trim();
    if (trimmed.startsWith(`${name}=`)) return trimmed.slice(name.length + 1);
  }
  return undefined;
}

/** O Google ligado: as duas variáveis da door 6 presentes. */
export function googleClient(env: Env) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env;
  return clientId !== undefined && clientSecret !== undefined ? { clientId, clientSecret } : undefined;
}

/** O perfil no cookie assinado da requisição, ou `undefined`: assinatura inválida conta como ausente. */
export function profileOf(req: Request, secret: string): GoogleProfile | undefined {
  const value = verifyCookie(cookieValue(req.headers.cookie, PROFILE_COOKIE), secret);
  if (typeof value?.name !== 'string' || typeof value.email !== 'string') return undefined;
  return { name: value.name, email: value.email };
}

/** `HttpOnly`, `SameSite=Lax` e, fora de desenvolvimento (origem do web em https), `Secure`. */
export function cookieOptions(env: Env, path: string): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: env.WEB_ORIGIN.startsWith('https:'), path };
}
