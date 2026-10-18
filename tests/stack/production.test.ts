import { readFileSync, writeFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';
import { connect as tlsConnect } from 'node:tls';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Agent, setGlobalDispatcher } from 'undici';
import { prepareProductionStack, readDotenv, run, type ProductionStack } from './support.ts';

// `stack.compose` usa `spawnSync`, que trava o event loop: cada `fetch` abre a sua conexão.
setGlobalDispatcher(new Agent({ pipelining: 0, keepAliveTimeout: 1 }));

/** A imagem da borda, com tag e digest, como a door 1/AD-083 a fixou. */
const CADDY_IMAGE =
  'caddy:2.11.7@sha256:685ae3d7c34d9b5f8caeddc5d14051db7bbd88ff1f5a2fa0c16bd8ca328fb7af';

interface ResolvedConfig {
  services: Record<
    string,
    {
      image?: string;
      ports?: Array<{ host_ip?: string; published?: string; target?: number }>;
      volumes?: Array<{ type?: string; source?: string; target?: string }>;
      healthcheck?: { test?: string[] };
    }
  >;
}

/** Uma linha do log de acesso do caddy, no formato JSON que a borda emite. */
interface AccessLog {
  status?: number;
  request?: { method?: string; uri?: string; client_ip?: string; headers?: Record<string, string> };
}

describe('stack de produção', () => {
  let stack: ProductionStack;
  let deployed: { status: number | null; output: string };
  let ca: string;

  /** O config resolvido do overlay: `compose.yaml` mais `compose.prod.yaml`. */
  const config = (): ResolvedConfig => {
    const result = stack.compose('-f compose.yaml -f compose.prod.yaml config --format json');
    expect(result.status, result.output.slice(-4000)).toBe(0);
    return JSON.parse(result.output.slice(result.output.indexOf('{'))) as ResolvedConfig;
  };
  const psql = (sql: string) => {
    const env = readDotenv(join(stack.dir, '.env'));
    const result = stack.compose(
      `exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "${sql}"`,
    );
    expect(result.status, result.output).toBe(0);
    return result.output.trim();
  };
  /** As linhas JSON do log de acesso, sem o prefixo `caddy-1 | ` que o Compose põe. */
  const accessLog = (): AccessLog[] =>
    stack
      .compose('logs caddy')
      .output.split(/\r?\n/)
      .map((line) => line.replace(/^[^|]*\|\s?/, '').trim())
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as AccessLog);
  /** Um usuário do perfil dado, criado pela CLI da stack, e a sessão dele pela borda. */
  const session = async (email: string, password: string, role: 'admin' | 'reception', name: string) => {
    const created = stack.compose(
      `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name ${name}`,
    );
    expect(created.status, created.output).toBe(0);
    // a CLI cria `admin`; o perfil entra pelo banco, como as outras suítes da stack fazem
    if (role !== 'admin') psql(`update users set role = '${role}' where email = '${email}'`);
    const login = await fetch(`${stack.webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: stack.webOrigin },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    return login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  };

  beforeAll(async () => {
    stack = await prepareProductionStack('operacao');
    // a stack de produção sobe pelo mesmo script do servidor (AC 1, door 3)
    deployed = stack.deploy();
    expect(deployed.status, deployed.output.slice(-8000)).toBe(0);
    ca = stack.ca();
    setGlobalDispatcher(new Agent({ connect: { ca }, pipelining: 0, keepAliveTimeout: 1 }));
  }, 1_200_000);

  afterAll(() => stack?.destroy(), 300_000);

  test('prod_up_wait_exits_zero_with_every_service_in_the_expected_state', () => {
    expect(deployed.status, deployed.output.slice(-8000)).toBe(0);

    const containers = stack.containers();
    const of = (name: string) => containers.find((container) => container.Service === name);
    for (const name of [
      'caddy',
      'web',
      'api',
      'postgres',
      'storage',
      'prometheus',
      'alertmanager',
      'node-exporter',
      'blackbox-exporter',
    ]) {
      expect(of(name)?.Health, name).toBe('healthy');
    }
    for (const name of ['migrate', 'storage-init']) {
      expect(of(name)?.State, name).toBe('exited');
      expect(of(name)?.ExitCode, name).toBe(0);
    }
  });

  test('prod_config_refuses_each_missing_and_empty_production_variable', () => {
    const envPath = join(stack.dir, '.env');
    const original = readFileSync(envPath, 'utf8');
    const withoutKey = (key: string) =>
      original
        .split(/\r?\n/)
        .filter((line) => !line.startsWith(`${key}=`))
        .join('\n');
    const withEmptyKey = (key: string) => original.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=`);
    const variables = ['SITE_ADDRESS', 'ACME_EMAIL', 'ALERT_WEBHOOK_URL', 'BACKUP_DIR', 'POSTGRES_PASSWORD'];

    try {
      for (const variable of variables) {
        for (const [kind, text] of [
          ['ausente', withoutKey(variable)],
          ['vazia', withEmptyKey(variable)],
        ] as const) {
          writeFileSync(envPath, text);
          const result = run('docker compose -f compose.yaml -f compose.prod.yaml config', stack.dir, {
            COMPOSE_PROJECT_NAME: stack.project,
          });
          expect(result.status, `${variable} ${kind}`).not.toBe(0);
          expect(result.output, `${variable} ${kind}`).toContain(variable);
        }
      }
    } finally {
      writeFileSync(envPath, original);
    }
  });

  test('prod_http_redirects_to_https_with_308', async () => {
    const response = await fetch(`http://localhost:${stack.ports.CADDY_HTTP_PORT}/`, { redirect: 'manual' });

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`https://localhost:${stack.ports.CADDY_HTTPS_PORT}/`);
  });

  test('prod_login_serves_the_edge_security_headers_and_hides_server_identity', async () => {
    const response = await fetch(`${stack.webOrigin}/login`);

    expect(response.status).toBe(200);
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('permissions-policy')).toBe(
      'camera=(self), microphone=(), geolocation=(), payment=()',
    );
    expect(response.headers.get('x-powered-by')).toBeNull();
    expect(response.headers.get('server')).toBeNull();
  });

  test('prod_only_caddy_publishes_ports_and_every_other_port_is_on_loopback', () => {
    const { services } = config();

    const caddyPorts = services.caddy?.ports ?? [];
    expect(caddyPorts).toHaveLength(2);
    for (const port of caddyPorts) expect(port.host_ip).not.toBe('127.0.0.1');

    for (const name of ['web', 'api', 'postgres', 'storage']) {
      const ports = services[name]?.ports ?? [];
      expect(ports.length, name).toBeGreaterThan(0);
      for (const port of ports) expect(port.host_ip, name).toBe('127.0.0.1');
    }
  });

  test('prod_web_is_served_only_through_caddy_and_api_is_not_exposed', async () => {
    const caddyfile = readFileSync(join(stack.dir, 'deploy/Caddyfile'), 'utf8');
    const upstreams = [...caddyfile.matchAll(/reverse_proxy\s+(\S+)/g)].map((match) => match[1]);
    expect(upstreams).toEqual(['web:3000']);
    expect(caddyfile).not.toContain('api:3001');

    // o `/health` da API não é servido pela borda: a rota é do `web`, que não tem essa página. Sem
    // sessão o `proxy.ts` manda para o login, então a prova do 404 usa uma sessão válida.
    const cookie = await session('recepcao.da.borda@exemplo.com', 'senha-da-borda-123', 'reception', 'Recepcao');
    const health = await fetch(`${stack.webOrigin}/health`, { headers: { Cookie: cookie } });
    expect(health.status).toBe(404);
    expect(await health.text()).not.toContain('"database"');

    const anonymous = await fetch(`${stack.webOrigin}/api/students`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
  });

  test('prod_oversized_upload_is_refused_at_the_edge_with_413_and_never_reaches_the_api', async () => {
    // com a API parada, um 413 ainda provaria que o corpo nunca chegou a ela; as linhas de log
    // ficam estáveis, sem o ruído das sondas de saúde da API
    expect(stack.compose('stop api').status).toBe(0);
    try {
      const before = stack.compose('logs api').output.split(/\r?\n/).length;
      const response = await fetch(
        `${stack.webOrigin}/api/students/018f0000-0000-7000-8000-000000000000/photo`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new Uint8Array(7 * 1024 * 1024),
        },
      );
      const text = await response.text();

      expect(response.status).toBe(413);
      expect(response.headers.get('content-type') ?? '').not.toMatch(/application\/problem\+json/);
      expect(text).not.toMatch(/requestId/i);
      const after = stack.compose('logs api').output.split(/\r?\n/).length;
      expect(after, 'a api recebeu uma requisição').toBe(before);

      // e quem gerou o 413 foi a borda: a linha de acesso do caddy registra o pedido
      const entry = [...accessLog()].reverse().find((log) => log.request?.uri?.startsWith('/api/students/'));
      expect(entry, 'linha de acesso do 413').toBeDefined();
      expect(entry!.status).toBe(413);
    } finally {
      stack.compose('start api');
      stack.compose('up -d --wait');
    }
  }, 240_000);

  test('prod_forged_x_forwarded_for_never_reaches_the_audit_ip', async () => {
    const email = 'auditada.da.borda@exemplo.com';
    const password = 'senha-da-borda-audit-1';
    const created = stack.compose(
      `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name Auditada`,
    );
    expect(created.status, created.output).toBe(0);
    psql(`update users set role = 'reception' where email = '${email}'`);

    const login = await fetch(`${stack.webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: stack.webOrigin,
        'X-Forwarded-For': '203.0.113.7',
      },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);

    const ip = psql(
      `select ip from audit_logs where action = 'auth.login_succeeded' and entity_id = (select id from users where email = '${email}')`,
    );
    expect(ip).toMatch(/\S/);
    expect(ip).not.toBe('203.0.113.7');

    const entry = [...accessLog()]
      .reverse()
      .find((log) => log.request?.method === 'POST' && log.request?.uri === '/api/auth/login');
    expect(entry, 'linha de log de acesso do caddy').toBeDefined();
    expect(ip).toBe(entry!.request!.client_ip);
  });

  test('prod_access_log_is_json_and_redacts_query_and_credentials', async () => {
    const response = await fetch(
      `${stack.webOrigin}/api/photo-files/018f0000-0000-7000-8000-000000000000/large?exp=1700000000&sig=assinatura-secreta&keep=1`,
      { headers: { Cookie: 'sessao=segredo-do-cookie', Authorization: 'Bearer segredo-do-token' } },
    );
    expect(response.status).toBeGreaterThan(0);

    const entry = [...accessLog()].reverse().find((log) => log.request?.uri?.startsWith('/api/photo-files/'));
    expect(entry, 'linha de log de acesso do caddy').toBeDefined();

    const uri = entry!.request!.uri!;
    expect(uri).toContain('/api/photo-files/');
    expect(uri).toContain('keep=1');
    expect(uri).not.toContain('assinatura-secreta');
    expect(uri).not.toMatch(/[?&]sig=/);
    expect(uri).not.toMatch(/[?&]q=/);
    expect(entry!.request!.headers?.Cookie).toBe('REDACTED');
    expect(entry!.request!.headers?.Authorization).toBe('REDACTED');
  });

  test('prod_returns_502_from_the_edge_when_web_is_stopped', async () => {
    expect(stack.compose('stop web').status).toBe(0);
    try {
      const response = await fetch(`${stack.webOrigin}/login`);
      expect(response.status).toBe(502);
    } finally {
      stack.compose('start web');
      stack.compose('up -d --wait');
    }
  }, 240_000);

  test('prod_relays_the_504_of_the_web_route_when_the_api_hangs', async () => {
    expect(stack.compose('pause api').status).toBe(0);
    try {
      // o handler do `web` desiste em 10 s (UPSTREAM_TIMEOUT_MS); a `api` fica pendurada por mais
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      const response = await fetch(`${stack.webOrigin}/api/dashboard`, { signal: AbortSignal.timeout(60_000) });

      expect(response.status).toBe(504);
      expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
      expect(((await response.json()) as { code: string }).code).toBe('gateway_timeout');
    } finally {
      stack.compose('unpause api');
      stack.compose('up -d --wait');
    }
  }, 240_000);

  test('prod_caddy_service_resolves_the_door_one_literal', () => {
    const { services } = config();
    const caddy = services.caddy;

    expect(caddy?.image).toBe(CADDY_IMAGE);
    const published = (caddy?.ports ?? []).map((port) => `${port.published}:${port.target}`).sort();
    expect(published).toEqual(
      [`${stack.ports.CADDY_HTTP_PORT}:80`, `${stack.ports.CADDY_HTTPS_PORT}:443`].sort(),
    );
    expect(caddy?.volumes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'volume', source: 'caddy-data', target: '/data' }),
        expect.objectContaining({ type: 'volume', source: 'caddy-config', target: '/config' }),
      ]),
    );
    expect(caddy?.healthcheck?.test).toEqual(['CMD', 'curl', '-fsS', 'http://127.0.0.1:2019/config/']);
  });

  test('prod_anonymous_api_is_401_and_reception_on_staff_is_403_with_problem_json', async () => {
    const anonymous = await fetch(`${stack.webOrigin}/api/students`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);

    const cookie = await session(
      'recepcao.da.seguranca@exemplo.com',
      'senha-da-seguranca-123',
      'reception',
      'RecepcaoSeguranca',
    );
    const forbidden = await fetch(`${stack.webOrigin}/api/staff`, { headers: { Cookie: cookie } });
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
  });

  test('prod_sixth_failed_login_in_fifteen_minutes_is_429_with_retry_after', async () => {
    const email = 'limite.da.borda@exemplo.com';
    const body = JSON.stringify({ email, password: 'senha-errada-000' });
    const attempt = () =>
      fetch(`${stack.webOrigin}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: stack.webOrigin },
        body,
      });

    for (let count = 1; count <= 5; count += 1) {
      expect((await attempt()).status, `tentativa ${count}`).toBe(401);
    }
    const sixth = await attempt();
    expect(sixth.status).toBe(429);
    const retryAfter = Number(sixth.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(((await sixth.json()) as { code: string }).code).toBe('too_many_attempts');
  });

  test('prod_invalid_login_body_is_422_validation_failed', async () => {
    const response = await fetch(`${stack.webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: stack.webOrigin },
      body: JSON.stringify({ email: 'nao-e-email', password: '' }),
    });

    expect(response.status).toBe(422);
    expect(((await response.json()) as { code: string }).code).toBe('validation_failed');
  });

  test('prod_edge_accepts_tls_12_and_13_and_refuses_tls_10_and_11', async () => {
    const tlsAttempt = (version: 'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3') =>
      new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const socket = tlsConnect(
          {
            host: 'localhost',
            port: Number(stack.ports.CADDY_HTTPS_PORT),
            servername: 'localhost',
            ca,
            minVersion: version,
            maxVersion: version,
            // a CA interna do caddy e o nível de segurança que ainda aceita TLS 1.0/1.1 do lado do cliente
            ciphers: 'DEFAULT@SECLEVEL=0',
          },
          () => {
            resolve({ ok: true });
            socket.end();
          },
        );
        socket.on('error', (error) => resolve({ ok: false, error: error.message }));
      });

    for (const version of ['TLSv1.2', 'TLSv1.3'] as const) {
      const accepted = await tlsAttempt(version);
      expect(accepted.ok, `${version}: ${accepted.error}`).toBe(true);
    }
    for (const version of ['TLSv1', 'TLSv1.1'] as const) {
      const refused = await tlsAttempt(version);
      expect(refused.ok, version).toBe(false);
    }
  });

  test('prod_login_cookie_is_secure_httponly_and_samesite_lax', async () => {
    const email = 'cookie.da.borda@exemplo.com';
    const password = 'senha-do-cookie-123';
    const created = stack.compose(
      `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name Cookie`,
    );
    expect(created.status, created.output).toBe(0);
    psql(`update users set role = 'reception' where email = '${email}'`);

    const login = await fetch(`${stack.webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: stack.webOrigin },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const cookies = login.headers.getSetCookie();
    const sessionCookie = cookies.find((value) => value.includes('session_token='));
    expect(sessionCookie, cookies.join(' | ')).toBeDefined();
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
  });

  test('prod_trace_is_refused_with_405', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpsRequest(
        {
          host: 'localhost',
          port: Number(stack.ports.CADDY_HTTPS_PORT),
          servername: 'localhost',
          ca,
          method: 'TRACE',
          path: '/',
        },
        (response) => {
          resolve(response.statusCode ?? 0);
          response.resume();
        },
      );
      request.on('error', reject);
      request.end();
    });

    expect(status).toBe(405);
  });

  test('prod_repository_files_are_404_even_with_a_session', async () => {
    const cookie = await session(
      'recepcao.do.repositorio@exemplo.com',
      'senha-do-repositorio-123',
      'reception',
      'RecepcaoRepositorio',
    );

    for (const path of ['/.git/config', '/package.json', '/.env', '/.env.example']) {
      const response = await fetch(`${stack.webOrigin}${path}`, { headers: { Cookie: cookie } });
      expect(response.status, path).toBe(404);
      const text = await response.text();
      expect(text, path).not.toContain('AUTH_SECRET');
      expect(text, path).not.toContain('"private"');
      expect(text, path).not.toContain('POSTGRES_USER');
      expect(text, path).not.toContain('[core]');
    }
  });
});
