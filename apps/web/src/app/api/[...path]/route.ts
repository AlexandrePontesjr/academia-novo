import { envSchema } from '../../../env.ts';

// O navegador só fala com a origem do web (AD-019): tudo em `/api/*` é repassado à API, cujo
// endereço é lido de `API_URL` a cada requisição, nunca no build.
export const dynamic = 'force-dynamic';

/** Quanto o web espera pela API antes de responder ele mesmo. */
const UPSTREAM_TIMEOUT_MS = 10_000;

/** Cabeçalhos que valem só para um trecho da conexão, e os que o `fetch` recalcula. */
const NOT_FORWARDED = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'content-encoding',
];

function forwardable(source: Headers): Headers {
  const headers = new Headers(source);
  for (const name of NOT_FORWARDED) headers.delete(name);
  return headers;
}

function unavailable(status: 502 | 504, title: string, code: string): Response {
  return Response.json(
    { type: 'about:blank', title, status, code, requestId: crypto.randomUUID() },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

async function forward(request: Request): Promise<Response> {
  const { API_URL } = envSchema.parse(process.env);
  const { pathname, search } = new URL(request.url);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(new URL(pathname + search, API_URL), {
      method: request.method,
      headers: forwardable(request.headers),
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? unavailable(504, 'Gateway Timeout', 'gateway_timeout')
      : unavailable(502, 'Bad Gateway', 'bad_gateway');
  }

  const bodiless = upstream.status === 204 || upstream.status === 304;
  return new Response(bodiless ? null : upstream.body, {
    status: upstream.status,
    headers: forwardable(upstream.headers),
  });
}

export {
  forward as DELETE,
  forward as GET,
  forward as HEAD,
  forward as OPTIONS,
  forward as PATCH,
  forward as POST,
  forward as PUT,
};
