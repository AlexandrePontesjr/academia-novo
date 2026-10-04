import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { addBrokenMigration, cleanClone, freePort, readDotenv, removeClone, run } from './support.ts';

interface ComposeContainer {
  ID: string;
  Service: string;
  State: string;
  Health: string;
  ExitCode: number;
}

/** Uma stack isolada: clone limpo, `.env` copiado de `.env.example`, projeto e portas próprios. */
async function prepareStack(name: string) {
  const dir = cleanClone();
  copyFileSync(join(dir, '.env.example'), join(dir, '.env'));
  const project = `academia-${name}-${process.pid}`;
  // as portas publicadas na máquina saem das do `.env` para não colidir com uma stack de desenvolvimento
  const ports = {
    POSTGRES_PORT: String(await freePort()),
    PORT: String(await freePort()),
    WEB_PORT: String(await freePort()),
  };
  // a origem do web é a URL pela qual o teste o alcança, na porta sorteada
  const webOrigin = `http://127.0.0.1:${ports.WEB_PORT}`;
  const compose = (args: string) =>
    run(`docker compose -p ${project} ${args}`, dir, { ...ports, WEB_ORIGIN: webOrigin });
  const containers = (): ComposeContainer[] =>
    compose('ps --all --format json')
      .output.split('\n')
      .filter((line) => line.trim().startsWith('{'))
      .map((line) => JSON.parse(line));
  const destroy = () => {
    compose('down --volumes --rmi local --remove-orphans');
    removeClone(dir);
  };
  return { dir, ports, webOrigin, compose, containers, destroy };
}

type Stack = Awaited<ReturnType<typeof prepareStack>>;

describe('stack de pé', () => {
  let stack: Stack;
  let up: ReturnType<typeof run>;

  beforeAll(async () => {
    stack = await prepareStack('up');
    up = stack.compose('up --build --wait');
  }, 1_200_000);

  afterAll(() => stack?.destroy(), 300_000);

  test('up_wait_exits_zero_with_three_healthy', () => {
    expect(up.status, up.output.slice(-4000)).toBe(0);

    const containers = stack.containers();
    for (const service of ['postgres', 'api', 'web']) {
      const container = containers.find((c) => c.Service === service);
      expect(container?.Health, `saúde de ${service}`).toBe('healthy');
    }
  });

  test('postgres_major_is_18', () => {
    const env = readDotenv(join(stack.dir, '.env'));

    const result = stack.compose(
      `exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "show server_version_num"`,
    );

    expect(result.status, result.output).toBe(0);
    const versionNum = Number(result.output.trim());
    expect(Math.floor(versionNum / 10000)).toBe(18);
  });

  test('running_api_uses_error_contract', async () => {
    const response = await fetch(`http://127.0.0.1:${stack.ports.PORT}/rota-que-nao-existe`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
    expect(body.requestId).toMatch(/\S/);
    expect(response.headers.get('x-request-id')).toBe(body.requestId);
  });

  test('login_through_web_origin', async () => {
    const email = 'admin.da.stack@exemplo.com';
    const password = 'senha-da-stack-123';
    const created = stack.compose(
      `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name Administradora`,
    );
    expect(created.status, created.output).toBe(0);

    const login = await fetch(`${stack.webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: stack.webOrigin },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ status: 'authenticated' });
    const cookie = login.headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(';')[0])
      .join('; ');
    expect(cookie).toMatch(/session_token=/);

    const session = await fetch(`${stack.webOrigin}/api/auth/session`, { headers: { Cookie: cookie } });

    expect(session.status).toBe(200);
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(email);
  });

  test('login_through_web_writes_audit_row_with_ip_and_user_agent', async () => {
    const env = readDotenv(join(stack.dir, '.env'));
    const email = 'auditada.na.stack@exemplo.com';
    const password = 'senha-da-stack-456';
    const created = stack.compose(
      `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name Auditada`,
    );
    expect(created.status, created.output).toBe(0);

    const login = await fetch(`${stack.webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: stack.webOrigin,
        'User-Agent': 'teste/1.0',
        'X-Forwarded-For': '203.0.113.7',
      },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);

    // a linha é lida do banco da stack, não pela rota de consulta
    const rows = stack.compose(
      `exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "select ip, user_agent from audit_logs where action = 'auth.login_succeeded' and entity_id = (select id from users where email = '${email}')"`,
    );
    expect(rows.status, rows.output).toBe(0);
    expect(rows.output.trim().split(/\r?\n/)).toEqual(['203.0.113.7|teste/1.0']);
  });

  test('student_created_through_web_stores_ciphertext_and_audit_row', async () => {
    const env = readDotenv(join(stack.dir, '.env'));
    const psql = (sql: string) =>
      stack.compose(`exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "${sql}"`);
    const email = 'recepcao.da.stack@exemplo.com';
    const password = 'senha-da-stack-789';
    const healthNotes = 'Observacao de saude que nao pode aparecer no banco';
    const created = stack.compose(
      `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name Recepcionista`,
    );
    expect(created.status, created.output).toBe(0);
    // a stack não tem gerador de TOTP, e `admin` sem 2FA só alcança as rotas de cadastro do 2FA
    const demoted = psql(`update users set role = 'reception' where email = '${email}'`);
    expect(demoted.status, demoted.output).toBe(0);

    const login = await fetch(`${stack.webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: stack.webOrigin },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(';')[0])
      .join('; ');

    const response = await fetch(`${stack.webOrigin}/api/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: stack.webOrigin,
        Cookie: cookie,
        'User-Agent': 'teste-aluno/1.0',
        'X-Forwarded-For': '203.0.113.9',
      },
      body: JSON.stringify({
        name: 'Aluna da Stack',
        cpf: '529.982.247-25',
        birthDate: '2000-01-01',
        phone: '(11) 91234-5678',
        healthNotes,
      }),
    });
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };

    // as linhas são lidas do banco da stack, não pelas rotas
    const row = psql(`select s::text from students s where s.id = '${id}'`);
    expect(row.status, row.output).toBe(0);
    expect(row.output).toContain('v1.');
    expect(row.output).not.toContain(healthNotes);
    const audit = psql(
      `select action || '|' || ip || '|' || user_agent from audit_logs where entity = 'student' and entity_id = '${id}'`,
    );
    expect(audit.status, audit.output).toBe(0);
    expect(audit.output.trim().split(/\r?\n/)).toEqual(['student.created|203.0.113.9|teste-aluno/1.0']);
  });

  test('running_api_rejects_foreign_origin_and_anonymous', async () => {
    const foreign = await fetch(`${stack.webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://outro.example' },
      body: JSON.stringify({ email: 'alguem@exemplo.com', password: 'senha-qualquer-123' }),
    });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
    expect(((await foreign.json()) as { code: string }).code).toBe('csrf_rejected');

    const anonymous = await fetch(`${stack.webOrigin}/api/users`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
    expect(((await anonymous.json()) as { code: string }).code).toBe('unauthorized');
  });

  test('home_redirects_to_login', async () => {
    const response = await fetch(`${stack.webOrigin}/`);
    const html = await response.text();

    expect(response.redirected).toBe(true);
    expect(response.url).toBe(`${stack.webOrigin}/login`);
    expect(response.status).toBe(200);
    expect(html).toMatch(/<h1[^>]*>Entrar<\/h1>/);
  });
});

describe('migração quebrada', () => {
  let stack: Stack;
  let up: ReturnType<typeof run>;

  beforeAll(async () => {
    stack = await prepareStack('broken');
    addBrokenMigration(stack.dir);
    up = stack.compose('up --build --wait');
  }, 1_200_000);

  afterAll(() => stack?.destroy(), 300_000);

  test('api_never_starts_when_migrate_fails', () => {
    const containers = stack.containers();
    const migrate = containers.find((c) => c.Service === 'migrate');
    expect(migrate?.State).toBe('exited');
    expect(migrate?.ExitCode).not.toBe(0);

    expect(up.status).not.toBe(0);
    expect(up.status).not.toBeNull();

    const api = containers.find((c) => c.Service === 'api');
    if (api) {
      // o container pode ter sido criado, mas nunca iniciado
      const startedAt = run(`docker inspect --format "{{.State.StartedAt}}" ${api.ID}`, stack.dir);
      expect(api.State).toBe('created');
      expect(startedAt.output.trim()).toBe('0001-01-01T00:00:00Z');
    }
  });
});
