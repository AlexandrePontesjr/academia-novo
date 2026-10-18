import { type NextRequest, NextResponse } from 'next/server';
import { readSession } from './lib/session.ts';

/**
 * Decide, antes de qualquer página, para onde vai quem a pediu: sem sessão, para o login; com
 * sessão, para fora dele; e o Administrador que ainda não cadastrou o 2FA, para o cadastro.
 * `/api/*` não passa por aqui: é repassado à API, que responde por si.
 *
 * Também gera o nonce do CSP a cada requisição (door 2): o nonce vai na requisição, para o Next
 * marcar os scripts inline que renderiza, e na resposta, junto da política que o navegador aplica.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { session, setCookies } = await readSession(request.headers);
  // O destino é montado sobre o host que o navegador usou (`Host`, ou o que o proxy reverso
  // repassa), não sobre o endereço em que o servidor escuta: num container ele é 0.0.0.0.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  const origin = host ? `${protocol}://${host}` : request.nextUrl.origin;
  const goTo = (path: string) => NextResponse.redirect(new URL(path, origin));

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  let response: NextResponse;
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    response = session ? goTo('/') : NextResponse.next({ request: { headers: requestHeaders } });
  } else if (!session) {
    response = goTo('/login');
  } else if (session.twoFactorEnrollmentRequired && pathname !== '/two-factor/setup') {
    response = goTo('/two-factor/setup');
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set('Content-Security-Policy', policy);

  for (const cookie of setCookies) response.headers.append('Set-Cookie', cookie);
  return response;
}

/**
 * A política literal da door 2 (AD-084). O `'unsafe-eval'` só entra no modo de desenvolvimento,
 * onde o runtime do Next o usa para o recarregamento; `style-src` mantém `'unsafe-inline'` por
 * causa dos atributos `style` do `react-easy-crop`, que nonce não cobre.
 */
export function contentSecurityPolicy(nonce: string): string {
  const development = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico).*)'],
};
