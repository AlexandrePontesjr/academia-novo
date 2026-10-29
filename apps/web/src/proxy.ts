import { type NextRequest, NextResponse } from 'next/server';
import { readSession } from './lib/session.ts';

/** As páginas de senha do portal do aluno: públicas por ramo nomeado, nunca por prefixo (portal-aluno, door 6). */
const PASSWORD_PAGES = ['/primeiro-acesso', '/definir-senha', '/esqueci-senha'];

const isUnder = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

/**
 * Decide, antes de qualquer página, para onde vai quem a pediu: `/` é a landing pública, e `/matricula*`
 * o pré-cadastro, também público, como as páginas de senha do portal; sem sessão, para o login; com
 * sessão, para fora dele e para o painel (o aluno, para `/minha-conta`); e o Administrador que ainda não
 * cadastrou o 2FA, para o cadastro. O aluno só alcança `/minha-conta*` e `/two-factor/*`, e a equipe não
 * alcança `/minha-conta*` (door 6).
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
    const home = session?.user.role === 'student' ? '/minha-conta' : '/dashboard';
    response = session ? goTo(home) : NextResponse.next({ request: { headers: requestHeaders } });
  } else if (pathname === '/') {
    // a landing é pública, com ou sem sessão, e com o 2FA pendente também (dukfit-app, door 1)
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else if (pathname === '/matricula' || pathname.startsWith('/matricula/')) {
    // o pré-cadastro é público como a landing, por um ramo nomeado e nunca por prefixo (pre-cadastro, door 11)
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else if (PASSWORD_PAGES.includes(pathname)) {
    // com ou sem sessão, e com o 2FA pendente também: o link do e-mail abre onde quer que a pessoa esteja
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else if (!session) {
    response = goTo('/login');
  } else if (session.twoFactorEnrollmentRequired && pathname !== '/two-factor/setup') {
    response = goTo('/two-factor/setup');
  } else if (session.user.role === 'student' && !isUnder(pathname, '/minha-conta') && !isUnder(pathname, '/two-factor')) {
    response = goTo('/minha-conta');
  } else if (session.user.role !== 'student' && isUnder(pathname, '/minha-conta')) {
    response = goTo('/dashboard');
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
  // as imagens da landing (`public/dukfit`) são públicas e não passam por sessão nem nonce (dukfit-landing, door 2)
  matcher: ['/((?!api/|_next/|favicon.ico|dukfit/).*)'],
};
