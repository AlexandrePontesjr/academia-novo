import { type NextRequest, NextResponse } from 'next/server';
import { readSession } from './lib/session.ts';

/**
 * Decide, antes de qualquer página, para onde vai quem a pediu: sem sessão, para o login; com
 * sessão, para fora dele; e o Administrador que ainda não cadastrou o 2FA, para o cadastro.
 * `/api/*` não passa por aqui: é repassado à API, que responde por si.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { session, setCookies } = await readSession(request.headers.get('cookie'));
  // O destino é montado sobre o host que o navegador usou (`Host`, ou o que o proxy reverso
  // repassa), não sobre o endereço em que o servidor escuta: num container ele é 0.0.0.0.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  const origin = host ? `${protocol}://${host}` : request.nextUrl.origin;
  const goTo = (path: string) => NextResponse.redirect(new URL(path, origin));

  let response: NextResponse;
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    response = session ? goTo('/') : NextResponse.next();
  } else if (!session) {
    response = goTo('/login');
  } else if (session.twoFactorEnrollmentRequired && pathname !== '/two-factor/setup') {
    response = goTo('/two-factor/setup');
  } else {
    response = NextResponse.next();
  }

  for (const cookie of setCookies) response.headers.append('Set-Cookie', cookie);
  return response;
}

export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico).*)'],
};
