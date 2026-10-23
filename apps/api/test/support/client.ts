import { WEB_ORIGIN } from './app.ts';

export interface RequestOptions {
  body?: unknown;
  /** `null` manda a requisição sem `Origin`. */
  origin?: string | null;
  headers?: Record<string, string>;
  /** `manual` devolve o `302` em vez de segui-lo. */
  redirect?: RequestInit['redirect'];
}

/**
 * Um navegador mínimo: guarda os cookies que a API manda e os devolve nas requisições seguintes.
 * Toda requisição leva `Origin` igual a `WEB_ORIGIN`, salvo quando o teste é sobre a origem.
 */
export function createClient(baseUrl: string) {
  const jar = new Map<string, string>();

  async function request(method: string, path: string, options: RequestOptions = {}) {
    const { body, origin = WEB_ORIGIN, headers = {}, redirect } = options;
    // bytes e fluxos seguem como vieram, com o `Content-Type` de quem os mandou (multipart, imagem)
    const raw = body instanceof Uint8Array || body instanceof ReadableStream;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(origin !== null && { Origin: origin }),
        ...(body !== undefined && !raw && { 'Content-Type': 'application/json' }),
        ...(jar.size > 0 && { Cookie: cookie() }),
        ...headers,
      },
      body: body === undefined ? undefined : raw || typeof body === 'string' ? (body as string | Uint8Array | ReadableStream) : JSON.stringify(body),
      ...(body instanceof ReadableStream && { duplex: 'half' }),
      ...(redirect && { redirect }),
    } as RequestInit);
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair = ''] = setCookie.split(';');
      const name = pair.slice(0, pair.indexOf('='));
      const value = pair.slice(pair.indexOf('=') + 1);
      if (value === '' || /;\s*max-age=0/i.test(setCookie)) jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  }

  const cookie = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');

  return {
    request,
    cookie,
    jar,
    get: (path: string, options?: RequestOptions) => request('GET', path, options),
    post: (path: string, body?: unknown, options?: RequestOptions) =>
      request('POST', path, { body, ...options }),
    put: (path: string, body?: unknown, options?: RequestOptions) =>
      request('PUT', path, { body, ...options }),
    patch: (path: string, body?: unknown, options?: RequestOptions) =>
      request('PATCH', path, { body, ...options }),
    delete: (path: string, options?: RequestOptions) => request('DELETE', path, options),
  };
}

export type Client = ReturnType<typeof createClient>;
