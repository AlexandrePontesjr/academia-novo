import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Agent, setGlobalDispatcher } from 'undici';
import sharp from 'sharp';
import { addBrokenMigration, breakBucketInit, cleanClone, freePort, readDotenv, removeClone, run } from './support.ts';

// `stack.compose` usa `spawnSync`, que trava o event loop: durante um `exec` de alguns segundos o timer de
// keep-alive do cliente não dispara, o servidor fecha o socket ocioso aos 5 s, e o `fetch` seguinte reaproveitaria
// um socket morto (`other side closed`). Sem conexão reaproveitada, cada `fetch` abre a sua.
setGlobalDispatcher(new Agent({ pipelining: 0, keepAliveTimeout: 1 }));

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
    STORAGE_PORT: String(await freePort()),
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

  test('minor_with_guardian_and_consent_through_web_store_rows_and_audit', async () => {
    const env = readDotenv(join(stack.dir, '.env'));
    const psql = (sql: string) =>
      stack.compose(`exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "${sql}"`);
    const email = 'recepcao.consentimento@exemplo.com';
    const password = 'senha-da-stack-321';
    const created = stack.compose(
      `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name Consentimento`,
    );
    expect(created.status, created.output).toBe(0);
    // a stack não tem gerador de TOTP, e `admin` sem 2FA só alcança as rotas de cadastro do 2FA
    expect(psql(`update users set role = 'reception' where email = '${email}'`).status).toBe(0);

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
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${stack.webOrigin}${path}`, {
        method,
        headers: {
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          Origin: stack.webOrigin,
          Cookie: cookie,
          'User-Agent': 'teste-consentimento/1.0',
          'X-Forwarded-For': '203.0.113.11',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const tenYearsAgo = `${new Date().getFullYear() - 10}-01-01`;

    const student = await send('POST', '/api/students', {
      name: 'Menor da Stack',
      cpf: '123.456.789-09',
      birthDate: tenYearsAgo,
      phone: '(11) 91234-5678',
      guardian: { name: 'Ana Souza', cpf: '529.982.247-25', phone: '(11) 98888-7777', relationship: 'mother' },
    });
    expect(student.status).toBe(201);
    const { id } = (await student.json()) as { id: string };

    const terms = await send('GET', '/api/consent-terms');
    expect(terms.status).toBe(200);
    const { items } = (await terms.json()) as { items: Array<{ purpose: string; version: number }> };
    const imageTerm = items.find((item) => item.purpose === 'image_use')!;

    const granted = await send('POST', `/api/students/${id}/consents`, {
      purpose: 'image_use',
      termVersion: imageTerm.version,
      grantedBy: 'guardian',
    });
    expect(granted.status).toBe(201);
    const consent = (await granted.json()) as { id: string };
    expect((await send('DELETE', `/api/students/${id}/consents/${consent.id}`)).status).toBe(204);

    // as linhas são lidas do banco da stack, não pelas rotas
    const guardians = psql(`select cpf || '|' || phone || '|' || relationship from guardians where student_id = '${id}'`);
    expect(guardians.status, guardians.output).toBe(0);
    expect(guardians.output.trim().split(/\r?\n/)).toEqual(['52998224725|11988887777|mother']);
    const consents = psql(`select (revoked_at is not null) || '|' || granted_by from consents where student_id = '${id}'`);
    expect(consents.output.trim().split(/\r?\n/)).toEqual(['true|guardian']);
    const termRows = psql('select purpose || version from consent_terms order by 1');
    expect(termRows.output.trim().split(/\r?\n/)).toEqual(['data_processing1', 'image_use1']);
    const audit = psql(
      `select action || '|' || ip || '|' || user_agent from audit_logs where entity = 'student' and entity_id = '${id}' order by created_at, id`,
    );
    expect(audit.status, audit.output).toBe(0);
    expect(audit.output.trim().split(/\r?\n/)).toEqual(
      ['student.created', 'student.guardian_saved', 'student.consent_granted', 'student.consent_revoked'].map(
        (action) => `${action}|203.0.113.11|teste-consentimento/1.0`,
      ),
    );
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

  /** Entra pela origem do web com o perfil `reception`. */
  async function receptionCookie(email: string, password: string) {
    const env = readDotenv(join(stack.dir, '.env'));
    const created = stack.compose(
      `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name Recepcao`,
    );
    expect(created.status, created.output).toBe(0);
    // a stack não tem gerador de TOTP, e `admin` sem 2FA só alcança as rotas de cadastro do 2FA
    const demoted = stack.compose(
      `exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "update users set role = 'reception' where email = '${email}'"`,
    );
    expect(demoted.status, demoted.output).toBe(0);
    const login = await fetch(`${stack.webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: stack.webOrigin },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    return login.headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(';')[0])
      .join('; ');
  }

  /** Um JPEG de 800×1000 com `size` bytes, preenchido por comentários que carregam todos os valores de byte. */
  async function jpegOfSize(size: number) {
    const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#cc3322' } }).jpeg().toBuffer();
    const comments: Buffer[] = [];
    let remaining = size - jpeg.length;
    let counter = 0;
    while (remaining > 0) {
      let segment = Math.min(remaining, 65_537);
      if (remaining - segment > 0 && remaining - segment < 4) segment -= 4;
      const frame = Buffer.alloc(segment);
      frame[0] = 0xff;
      frame[1] = 0xfe;
      frame.writeUInt16BE(segment - 2, 2);
      for (let at = 4; at < segment; at += 1) frame[at] = counter++ % 256;
      comments.push(frame);
      remaining -= segment;
    }
    return Buffer.concat([jpeg.subarray(0, 2), ...comments, jpeg.subarray(2)]);
  }

  test('storage_bucket_exists_private_and_ports_on_loopback', () => {
    const env = readDotenv(join(stack.dir, '.env'));
    const mc = (command: string) =>
      stack.compose(
        `exec -T storage sh -c "mc alias set local http://127.0.0.1:9000 ${env.S3_ACCESS_KEY_ID} ${env.S3_SECRET_ACCESS_KEY} > /dev/null && ${command}"`,
      );

    const listed = mc(`mc ls local/${env.S3_BUCKET}`);
    expect(listed.status, listed.output).toBe(0);

    // pedido anônimo, de dentro do container `api`, sem credencial: o objeto e a listagem respondem 403
    const script = [
      `const bucket = '${env.S3_BUCKET}';`,
      `for (const path of [bucket + '/photos/main/x/y/thumb.webp', bucket + '/']) {`,
      `  console.log('anonymous', path.endsWith('/') ? 'listing' : 'object', (await fetch('http://storage:9000/' + path)).status);`,
      `}`,
    ].join(' ');
    const anonymous = stack.compose(`exec -T api node --input-type=module -e "${script}"`);
    expect(anonymous.status, anonymous.output).toBe(0);
    expect(anonymous.output).toContain('anonymous object 403');
    expect(anonymous.output).toContain('anonymous listing 403');

    const config = stack.compose('config --format json');
    expect(config.status, config.output).toBe(0);
    const { services } = JSON.parse(config.output.slice(config.output.indexOf('{'))) as {
      services: Record<string, { ports?: Array<{ host_ip?: string }> }>;
    };
    const ports = services.storage?.ports ?? [];
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) expect(port.host_ip).toBe('127.0.0.1');
  });

  test('photo_uploaded_through_web_served_by_signed_url_with_audit_row', async () => {
    const env = readDotenv(join(stack.dir, '.env'));
    const psql = (sql: string) =>
      stack.compose(`exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "${sql}"`);
    const cookie = await receptionCookie('recepcao.da.foto@exemplo.com', 'senha-da-stack-foto-1');
    const headers = {
      Origin: stack.webOrigin,
      Cookie: cookie,
      'User-Agent': 'teste-foto/1.0',
      'X-Forwarded-For': '203.0.113.21',
    };
    const createStudent = async (name: string, cpf: string) => {
      const created = await fetch(`${stack.webOrigin}/api/students`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, cpf, birthDate: '2000-01-01', phone: '(11) 91234-5678' }),
      });
      expect(created.status).toBe(201);
      return ((await created.json()) as { id: string }).id;
    };
    const upload = (id: string, bytes: Buffer) => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'foto.jpg');
      return fetch(`${stack.webOrigin}/api/students/${id}/photo`, { method: 'POST', headers, body: form });
    };
    const id = await createStudent('Aluna da Foto', '111.444.777-35');

    const response = await upload(id, await jpegOfSize(5_242_880));
    expect(response.status, await response.clone().text()).toBe(201);

    const link = await fetch(`${stack.webOrigin}/api/students/${id}/photo`, { headers });
    expect(link.status).toBe(200);
    const { url } = (await link.json()) as { url: string };
    // a URL assinada abre na origem do web, sem cookie
    const file = await fetch(`${stack.webOrigin}${url}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/webp');
    expect(file.headers.get('cache-control')).toBe('no-store');
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');

    // as linhas são lidas do banco da stack, não pelas rotas
    const photo = psql(`select count(*) from photos where student_id = '${id}' and is_current`);
    expect(photo.output.trim()).toBe('1');
    const audit = psql(
      `select ip || '|' || user_agent from audit_logs where action = 'student.photo_uploaded' and entity_id = '${id}'`,
    );
    expect(audit.status, audit.output).toBe(0);
    expect(audit.output.trim().split(/\r?\n/)).toEqual(['203.0.113.21|teste-foto/1.0']);

    const otherId = await createStudent('Aluno Grande', '987.654.321-00');
    const tooLarge = await upload(otherId, await jpegOfSize(5_242_881));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.headers.get('content-type')).toMatch(/^application\/problem\+json\b/);
    expect(((await tooLarge.json()) as { code: string }).code).toBe('payload_too_large');
  }, 120_000);

  test('health_storage_up_then_down_when_storage_stops', async () => {
    const up = await fetch(`http://127.0.0.1:${stack.ports.PORT}/health`);
    expect(up.status).toBe(200);
    expect(((await up.json()) as { checks: { storage: string } }).checks.storage).toBe('up');

    const stopped = stack.compose('stop storage');
    expect(stopped.status, stopped.output).toBe(0);

    const down = await fetch(`http://127.0.0.1:${stack.ports.PORT}/health`);
    const body = (await down.json()) as { checks: { storage: string; database: string } };
    expect(down.status).toBe(503);
    expect(body.checks).toEqual({ database: 'up', storage: 'down' });
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

describe('bucket que não é criado', () => {
  let stack: Stack;
  let up: ReturnType<typeof run>;

  beforeAll(async () => {
    stack = await prepareStack('bucket');
    breakBucketInit(stack.dir);
    up = stack.compose('up --build --wait');
  }, 1_200_000);

  afterAll(() => stack?.destroy(), 300_000);

  test('api_never_starts_when_bucket_init_fails', () => {
    const containers = stack.containers();
    const init = containers.find((c) => c.Service === 'storage-init');
    expect(init?.State).toBe('exited');
    expect(init?.ExitCode).not.toBe(0);

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
