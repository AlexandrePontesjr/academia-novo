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

  test('photo_replaced_through_web_then_expired_version_purged_on_api_restart', async () => {
    const env = readDotenv(join(stack.dir, '.env'));
    // a stack sobe sem a variável de retenção: vale o padrão de 30 dias
    expect(env.PHOTO_VERSION_RETENTION_DAYS).toBeUndefined();
    const psql = (sql: string) => {
      const result = stack.compose(`exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "${sql}"`);
      expect(result.status, result.output).toBe(0);
      return result.output.trim();
    };
    /** As chaves do bucket da stack sob o prefixo do aluno, relativas a ele. */
    const keysOf = (studentId: string) => {
      const listed = stack.compose(
        `exec -T storage sh -c "mc alias set local http://127.0.0.1:9000 ${env.S3_ACCESS_KEY_ID} ${env.S3_SECRET_ACCESS_KEY} > /dev/null && mc ls --recursive local/${env.S3_BUCKET}/photos/main/${studentId}/"`,
      );
      expect(listed.status, listed.output).toBe(0);
      return listed.output
        .split(/\r?\n/)
        .flatMap((line) => /(\S+\.webp)\s*$/.exec(line)?.[1] ?? [])
        .sort();
    };
    const waitFor = async (what: string, done: () => boolean | Promise<boolean>) => {
      const deadline = Date.now() + 60_000;
      while (!(await done())) {
        expect(Date.now(), `${what} em até 60 s`).toBeLessThan(deadline);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    };

    const cookie = await receptionCookie('recepcao.da.troca@exemplo.com', 'senha-da-stack-troca-1');
    const headers = {
      Origin: stack.webOrigin,
      Cookie: cookie,
      'User-Agent': 'teste-troca/1.0',
      'X-Forwarded-For': '203.0.113.33',
    };
    const created = await fetch(`${stack.webOrigin}/api/students`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Aluna da Troca', cpf: '390.533.447-05', birthDate: '2000-01-01', phone: '(11) 91234-5678' }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const send = async (method: 'POST' | 'PUT', background: string) => {
      const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background } }).jpeg().toBuffer();
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'foto.jpg');
      return fetch(`${stack.webOrigin}/api/students/${id}/photo`, { method, headers, body: form });
    };

    // os dois na origem do container `web`
    const first = await send('POST', '#cc3322');
    expect(first.status, await first.clone().text()).toBe(201);
    const previousId = ((await first.json()) as { id: string }).id;
    const replaced = await send('PUT', '#2233cc');
    expect(replaced.status, await replaced.clone().text()).toBe(201);
    const current = (await replaced.json()) as { id: string; version: number };
    expect(current.version).toBe(2);

    // as linhas são lidas do banco da stack, não pelas rotas
    expect(
      psql(
        `select is_current, expires_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour' from photos where id = '${previousId}'`,
      ),
    ).toBe('f|t');
    expect(psql(`select id from photos where student_id = '${id}' and is_current`)).toBe(current.id);
    expect(
      psql(`select ip || '|' || user_agent from audit_logs where action = 'student.photo_replaced' and entity_id = '${id}'`).split(/\r?\n/),
    ).toEqual(['203.0.113.33|teste-troca/1.0']);
    const variants = ['large.webp', 'medium.webp', 'thumb.webp'];
    expect(keysOf(id)).toEqual([...variants.map((name) => `${current.id}/${name}`), ...variants.map((name) => `${previousId}/${name}`)].sort());

    // o prazo da versão guardada vai para o passado, e a API reinicia: o expurgo roda na subida
    psql(`update photos set expires_at = now() - interval '1 second' where id = '${previousId}'`);
    const restarted = stack.compose('restart api');
    expect(restarted.status, restarted.output).toBe(0);

    await waitFor('a linha da versão vencida sair de photos', () => psql(`select count(*) from photos where id = '${previousId}'`) === '0');
    await waitFor('as chaves da versão vencida saírem do bucket', () => keysOf(id).every((key) => !key.startsWith(previousId)));
    expect(keysOf(id)).toEqual(variants.map((name) => `${current.id}/${name}`));
    expect(psql(`select count(*) from photos where student_id = '${id}' and is_current and id = '${current.id}'`)).toBe('1');

    // a foto corrente continua sendo entregue pela URL assinada
    await waitFor('a API voltar a responder', () =>
      fetch(`${stack.webOrigin}/api/students/${id}/photo`, { headers }).then(
        (response) => response.status === 200,
        () => false,
      ),
    );
    const link = await fetch(`${stack.webOrigin}/api/students/${id}/photo`, { headers });
    expect(link.status).toBe(200);
    const { url } = (await link.json()) as { url: string };
    expect(url).toContain(current.id);
    const file = await fetch(`${stack.webOrigin}${url}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/webp');

    expect(
      psql(
        `select count(*) filter (where user_id is null) || '|' || count(*) from audit_logs where action = 'student.photo_version_purged' and entity_id = '${id}'`,
      ),
    ).toBe('1|1');
  }, 300_000);

  test('staff_registered_through_web_pages_audited_photo_replaced_and_expired_version_purged', async () => {
    const env = readDotenv(join(stack.dir, '.env'));
    const psql = (sql: string) => {
      const result = stack.compose(`exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "${sql}"`);
      expect(result.status, result.output).toBe(0);
      return result.output.trim();
    };
    /** As chaves do bucket da stack sob o prefixo do funcionário, relativas a ele. */
    const keysOf = (staffId: string) => {
      const listed = stack.compose(
        `exec -T storage sh -c "mc alias set local http://127.0.0.1:9000 ${env.S3_ACCESS_KEY_ID} ${env.S3_SECRET_ACCESS_KEY} > /dev/null && mc ls --recursive local/${env.S3_BUCKET}/photos/main/${staffId}/"`,
      );
      expect(listed.status, listed.output).toBe(0);
      return listed.output
        .split(/\r?\n/)
        .flatMap((line) => /(\S+\.webp)\s*$/.exec(line)?.[1] ?? [])
        .sort();
    };
    const waitFor = async (what: string, done: () => boolean | Promise<boolean>) => {
      const deadline = Date.now() + 60_000;
      while (!(await done())) {
        expect(Date.now(), `${what} em até 60 s`).toBeLessThan(deadline);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    };
    /** Um usuário do perfil dado, criado pela CLI da stack, e a sessão dele pela origem do web. */
    const account = async (role: 'admin' | 'hr_finance' | 'reception', email: string, password: string) => {
      const created = stack.compose(
        `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name ${role}`,
      );
      expect(created.status, created.output).toBe(0);
      // a CLI cria `admin`, e `admin` sem 2FA só alcança as rotas de cadastro do 2FA
      if (role !== 'admin') psql(`update users set role = '${role}' where email = '${email}'`);
      const login = await fetch(`${stack.webOrigin}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: stack.webOrigin },
        body: JSON.stringify({ email, password }),
      });
      expect(login.status).toBe(200);
      // a stack não tem gerador de TOTP: o 2FA do `admin` é posto depois de entrar, como as suítes da API fazem
      if (role === 'admin') psql(`update users set two_factor_enabled = true where email = '${email}'`);
      return {
        id: psql(`select id from users where email = '${email}'`),
        cookie: login.headers
          .getSetCookie()
          .map((setCookie) => setCookie.split(';')[0])
          .join('; '),
      };
    };
    const headersOf = (cookie: string, userAgent: string, forwardedFor: string) => ({
      Origin: stack.webOrigin,
      Cookie: cookie,
      'User-Agent': userAgent,
      'X-Forwarded-For': forwardedFor,
    });

    // a migração 0007 foi aplicada ao subir
    expect(psql(`select to_regclass('public.staff')`)).toBe('staff');

    const hr = await account('hr_finance', 'rh.da.stack@exemplo.com', 'senha-da-stack-rh-1');
    const admin = await account('admin', 'admin.dos.funcionarios@exemplo.com', 'senha-da-stack-adm-1');
    const reception = await account('reception', 'recepcao.vinculada@exemplo.com', 'senha-da-stack-rec-1');
    const hrHeaders = headersOf(hr.cookie, 'teste-rh/1.0', '203.0.113.41');

    // o RH cria o funcionário
    const created = await fetch(`${stack.webOrigin}/api/staff`, {
      method: 'POST',
      headers: { ...hrHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Funcionária da Stack',
        cpf: '529.982.247-25',
        position: 'Fisioterapeuta',
        hiredAt: '2021-03-15',
        phone: '(11) 91234-5678',
      }),
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const { id } = (await created.json()) as { id: string };

    // envia a foto por POST e a troca por PUT, na origem do container `web`
    const send = async (method: 'POST' | 'PUT', background: string) => {
      const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background } }).jpeg().toBuffer();
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'foto.jpg');
      return fetch(`${stack.webOrigin}/api/staff/${id}/photo`, { method, headers: hrHeaders, body: form });
    };
    const first = await send('POST', '#cc3322');
    expect(first.status, await first.clone().text()).toBe(201);
    const previousId = ((await first.json()) as { id: string }).id;
    const replaced = await send('PUT', '#2233cc');
    expect(replaced.status, await replaced.clone().text()).toBe(201);
    const current = (await replaced.json()) as { id: string; version: number };
    expect(current.version).toBe(2);

    // o Administrador vincula o usuário de recepção
    const linked = await fetch(`${stack.webOrigin}/api/staff/${id}/user`, {
      method: 'PUT',
      headers: { ...headersOf(admin.cookie, 'teste-adm/1.0', '203.0.113.42'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: reception.id }),
    });
    expect(linked.status, await linked.clone().text()).toBe(204);

    // cada página renderizada deixa a sua linha: as linhas são lidas do banco da stack, não pelas rotas
    const count = (action: string) => Number(psql(`select count(*) from audit_logs where action = '${action}'`));
    const open = (path: string, cookie: string) =>
      fetch(`${stack.webOrigin}${path}`, { headers: { Cookie: cookie, 'User-Agent': 'teste-rh/1.0', 'X-Forwarded-For': '203.0.113.41' } });
    const [lists, views] = [count('staff.list_viewed'), count('staff.viewed')];

    const list = await open('/staff', hr.cookie);
    expect(list.status).toBe(200);
    expect(count('staff.list_viewed')).toBe(lists + 1);
    expect(count('staff.viewed')).toBe(views);

    const ficha = await open(`/staff/${id}`, hr.cookie);
    expect(ficha.status).toBe(200);
    expect(count('staff.viewed')).toBe(views + 1);
    const edit = await open(`/staff/${id}/edit`, hr.cookie);
    expect(edit.status).toBe(200);
    expect(count('staff.viewed')).toBe(views + 2);
    expect(count('staff.list_viewed')).toBe(lists + 1);
    expect(
      psql(`select ip || '|' || user_agent from audit_logs where action = 'staff.viewed' and entity_id = '${id}' and user_id = '${hr.id}'`).split(/\r?\n/),
    ).toEqual(['203.0.113.41|teste-rh/1.0', '203.0.113.41|teste-rh/1.0']);

    // recarregar a ficha depois de salvar também é uma visualização, e a seguinte não é deduplicada
    const saved = await fetch(`${stack.webOrigin}/api/staff/${id}`, {
      method: 'PATCH',
      headers: { ...hrHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: 'Coordenadora Recarregada' }),
    });
    expect(saved.status, await saved.clone().text()).toBe(200);
    const afterSave = count('staff.viewed');
    expect(afterSave).toBe(views + 2);
    const reloaded = await open(`/staff/${id}`, hr.cookie);
    expect(reloaded.status).toBe(200);
    expect(await reloaded.text()).toContain('Coordenadora Recarregada');
    expect(count('staff.viewed')).toBe(afterSave + 1);
    expect((await open(`/staff/${id}`, hr.cookie)).status).toBe(200);
    expect(count('staff.viewed')).toBe(afterSave + 2);

    // a recepção não passa da mensagem de permissão e não deixa linha
    const [rows, listsBefore, viewsBefore] = [
      Number(psql(`select count(*) from audit_logs where entity = 'staff'`)),
      count('staff.list_viewed'),
      count('staff.viewed'),
    ];
    const denied = await open('/staff', reception.cookie);
    expect(denied.status).toBe(200);
    expect(await denied.text()).toContain('Você não tem permissão para acessar esta página.');
    expect(Number(psql(`select count(*) from audit_logs where entity = 'staff'`))).toBe(rows);
    expect([count('staff.list_viewed'), count('staff.viewed')]).toEqual([listsBefore, viewsBefore]);

    // o prazo da versão anterior vai para o passado, e a API reinicia: o expurgo roda na subida
    const variants = ['large.webp', 'medium.webp', 'thumb.webp'];
    expect(keysOf(id)).toEqual([...variants.map((name) => `${current.id}/${name}`), ...variants.map((name) => `${previousId}/${name}`)].sort());
    psql(`update photos set expires_at = now() - interval '1 second' where id = '${previousId}'`);
    const restarted = stack.compose('restart api');
    expect(restarted.status, restarted.output).toBe(0);

    await waitFor('a linha da versão vencida sair de photos', () => psql(`select count(*) from photos where id = '${previousId}'`) === '0');
    await waitFor('as chaves da versão vencida saírem do bucket', () => keysOf(id).every((key) => !key.startsWith(previousId)));
    expect(keysOf(id)).toEqual(variants.map((name) => `${current.id}/${name}`));

    // a foto corrente continua sendo entregue pela URL assinada da ficha
    await waitFor('a API voltar a responder', () =>
      fetch(`${stack.webOrigin}/api/staff/${id}`, { headers: hrHeaders }).then(
        (response) => response.status === 200,
        () => false,
      ),
    );
    const ficheiro = await fetch(`${stack.webOrigin}/api/staff/${id}`, { headers: hrHeaders });
    const { photoUrl } = (await ficheiro.json()) as { photoUrl: string };
    expect(photoUrl).toContain(current.id);
    const file = await fetch(`${stack.webOrigin}${photoUrl}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/webp');

    expect(
      psql(
        `select count(*) filter (where user_id is null) || '|' || count(*) from audit_logs where action = 'staff.photo_version_purged' and entity_id = '${id}'`,
      ),
    ).toBe('1|1');
  }, 300_000);

  test('plan_created_and_student_enrolled_through_web_with_overlap_refused_and_audit_rows', async () => {
    const env = readDotenv(join(stack.dir, '.env'));
    const psql = (sql: string) => {
      const result = stack.compose(`exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "${sql}"`);
      expect(result.status, result.output).toBe(0);
      return result.output.trim();
    };
    /** Um usuário do perfil dado, criado pela CLI da stack, e a sessão dele pela origem do web. */
    const account = async (role: 'hr_finance' | 'reception' | 'instructor', email: string, password: string) => {
      const created = stack.compose(
        `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name ${role}`,
      );
      expect(created.status, created.output).toBe(0);
      // a CLI cria `admin`, e `admin` sem 2FA só alcança as rotas de cadastro do 2FA
      psql(`update users set role = '${role}' where email = '${email}'`);
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
    };
    const [userAgent, forwardedFor] = ['teste-planos/1.0', '203.0.113.51'];
    const headersOf = (cookie: string) => ({
      Origin: stack.webOrigin,
      Cookie: cookie,
      'User-Agent': userAgent,
      'X-Forwarded-For': forwardedFor,
      'Content-Type': 'application/json',
    });
    const post = (path: string, cookie: string, body: unknown) =>
      fetch(`${stack.webOrigin}${path}`, { method: 'POST', headers: headersOf(cookie), body: JSON.stringify(body) });
    // o HTML da página traz U+00A0 entre `R$` e o número, como o `Intl` de `pt-BR` o escreve
    const open = async (path: string, cookie: string) => {
      const page = await fetch(`${stack.webOrigin}${path}`, {
        headers: { Cookie: cookie, 'User-Agent': userAgent, 'X-Forwarded-For': forwardedFor },
      });
      expect(page.status, path).toBe(200);
      return (await page.text()).replaceAll(String.fromCharCode(0xa0), ' ').replaceAll('&nbsp;', ' ');
    };

    // a migração 0008 foi aplicada ao subir, pelo papel do `compose.yaml`, que criou a extensão
    expect(psql(`select extname from pg_extension where extname = 'btree_gist'`)).toBe('btree_gist');
    expect(psql(`select to_regclass('public.plans')::text || ',' || to_regclass('public.enrollments')::text`)).toBe(
      'plans,enrollments',
    );
    expect(psql(`select count(*) from audit_logs where action in ('plan.created', 'student.enrollment_created')`)).toBe('0');

    const hr = await account('hr_finance', 'financeiro.dos.planos@exemplo.com', 'senha-da-stack-fin-1');
    const reception = await account('reception', 'recepcao.dos.planos@exemplo.com', 'senha-da-stack-rec-2');
    const instructor = await account('instructor', 'instrutor.dos.planos@exemplo.com', 'senha-da-stack-ins-1');

    // quem cadastra o aluno é a recepção; quem cria o plano e matricula é o RH/Financeiro
    const student = await post('/api/students', reception, {
      name: 'Aluna Matriculada na Stack',
      cpf: '714.602.380-01',
      birthDate: '2000-01-01',
      phone: '(11) 91234-5678',
    });
    expect(student.status, await student.clone().text()).toBe(201);
    const studentId = ((await student.json()) as { id: string }).id;

    const planName = 'Mensal da Stack';
    const createdPlan = await post('/api/plans', hr, { name: planName, period: 'monthly', priceCents: 9990 });
    expect(createdPlan.status, await createdPlan.clone().text()).toBe(201);
    const planId = ((await createdPlan.json()) as { id: string }).id;

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const enrollments = `/api/students/${studentId}/enrollments`;
    const enrolled = await post(enrollments, hr, { planId, startsAt: today });
    expect(enrolled.status, await enrolled.clone().text()).toBe(201);
    const enrollment = (await enrolled.json()) as { startsAt: string; endsAt: string; priceCents: number };
    expect(enrollment.startsAt).toBe(today);
    // a conta do vencimento é a do Postgres da stack
    expect(enrollment.endsAt).toBe(psql(`select (date '${today}' + interval '1 month' - interval '1 day')::date`));
    expect(enrollment.priceCents).toBe(9990);

    // o mesmo período de novo é recusado pela restrição de exclusão
    const repeated = await post(enrollments, hr, { planId, startsAt: today });
    expect(repeated.status).toBe(409);
    expect(((await repeated.json()) as { code: string }).code).toBe('enrollment_overlap');
    expect(psql(`select count(*) from enrollments where student_id = '${studentId}'`)).toBe('1');

    // a recepção lê e não matricula
    const read = await fetch(`${stack.webOrigin}${enrollments}`, { headers: headersOf(reception) });
    expect(read.status).toBe(200);
    expect(((await read.json()) as { items: unknown[] }).items).toHaveLength(1);
    const refused = await post(enrollments, reception, { planId, startsAt: today });
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { code: string }).code).toBe('forbidden');

    // as três páginas, renderizadas pelo container `web`; nenhuma leitura deixa linha na trilha
    const rows = psql('select count(*) from audit_logs');
    const priceTable = await open('/plans', reception);
    expect(priceTable).toContain(planName);
    expect(priceTable).toContain('R$ 99,90');
    const ficha = await open(`/students/${studentId}`, hr);
    expect(ficha).toContain('Matrículas');
    expect(ficha).toMatch(/>Ativa</);
    const denied = await open('/plans', instructor);
    expect(denied).toContain('Você não tem permissão para acessar esta página.');
    expect(denied).not.toContain(planName);
    expect(psql('select count(*) from audit_logs')).toBe(rows);

    // as linhas são lidas do banco da stack, não pelas rotas: uma de cada, com o IP e o navegador enviados
    expect(
      psql(
        `select action || ',' || entity || ',' || entity_id || ',' || ip || ',' || user_agent from audit_logs where action in ('plan.created', 'student.enrollment_created') order by id`,
      ).split(/\r?\n/),
    ).toEqual([
      `plan.created,plan,${planId},${forwardedFor},${userAgent}`,
      `student.enrollment_created,student,${studentId},${forwardedFor},${userAgent}`,
    ]);
  }, 300_000);

  test('payment_confirmed_and_undone_through_web_with_duplicate_refused_and_audit_rows', async () => {
    const env = readDotenv(join(stack.dir, '.env'));
    const psql = (sql: string) => {
      const result = stack.compose(`exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "${sql}"`);
      expect(result.status, result.output).toBe(0);
      return result.output.trim();
    };
    /** Um usuário do perfil dado, criado pela CLI da stack, e a sessão dele pela origem do web. */
    const account = async (role: 'hr_finance' | 'reception' | 'instructor', email: string, password: string) => {
      const created = stack.compose(
        `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name ${role}`,
      );
      expect(created.status, created.output).toBe(0);
      // a CLI cria `admin`, e `admin` sem 2FA só alcança as rotas de cadastro do 2FA
      psql(`update users set role = '${role}' where email = '${email}'`);
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
    };
    const [userAgent, forwardedFor] = ['teste-pagamentos/1.0', '203.0.113.61'];
    const headersOf = (cookie: string, body = false) => ({
      Origin: stack.webOrigin,
      Cookie: cookie,
      'User-Agent': userAgent,
      'X-Forwarded-For': forwardedFor,
      ...(body && { 'Content-Type': 'application/json' }),
    });
    const post = (path: string, cookie: string, body: unknown) =>
      fetch(`${stack.webOrigin}${path}`, { method: 'POST', headers: headersOf(cookie, true), body: JSON.stringify(body) });
    const get = (path: string, cookie: string) => fetch(`${stack.webOrigin}${path}`, { headers: headersOf(cookie) });
    const open = async (path: string, cookie: string) => {
      const page = await get(path, cookie);
      expect(page.status, path).toBe(200);
      return (await page.text()).replaceAll(String.fromCharCode(0xa0), ' ').replaceAll('&nbsp;', ' ');
    };
    const auditRows = () => psql('select count(*) from audit_logs');

    // a migração 0009 foi aplicada ao subir, pelo papel do `compose.yaml`: quatro colunas, o índice parcial e nenhuma extensão nova
    expect(
      psql(
        `select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'payments'`,
      ),
    ).toBe('created_at,enrollment_id,id,voided_at');
    expect(psql(`select indexdef from pg_indexes where tablename = 'payments' and indexname = 'payments_one_alive_idx'`)).toMatch(
      /CREATE UNIQUE INDEX payments_one_alive_idx ON public\.payments USING btree \(enrollment_id\) WHERE \(voided_at IS NULL\)/,
    );
    expect(psql(`select string_agg(extname, ',' order by extname) from pg_extension`)).toBe('btree_gist,pg_trgm,plpgsql');
    expect(psql(`select count(*) from audit_logs where action in ('student.payment_confirmed', 'student.payment_undone')`)).toBe('0');

    const hrEmail = 'financeiro.dos.pagamentos@exemplo.com';
    const hr = await account('hr_finance', hrEmail, 'senha-da-stack-fin-3');
    const reception = await account('reception', 'recepcao.dos.pagamentos@exemplo.com', 'senha-da-stack-rec-4');
    const instructor = await account('instructor', 'instrutor.dos.pagamentos@exemplo.com', 'senha-da-stack-ins-3');

    // o Financeiro matricula a partir de hoje, em `America/Sao_Paulo`: o período vence hoje e está pendente
    const studentName = 'Aluna Pagante na Stack';
    const student = await post('/api/students', reception, {
      name: studentName,
      cpf: '529.982.247-25',
      birthDate: '2000-01-01',
      phone: '(11) 91234-5678',
    });
    expect(student.status, await student.clone().text()).toBe(201);
    const studentId = ((await student.json()) as { id: string }).id;
    const createdPlan = await post('/api/plans', hr, { name: 'Mensal dos Pagamentos', period: 'monthly', priceCents: 9990 });
    expect(createdPlan.status, await createdPlan.clone().text()).toBe(201);
    const planId = ((await createdPlan.json()) as { id: string }).id;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const enrolled = await post(`/api/students/${studentId}/enrollments`, hr, { planId, startsAt: today });
    expect(enrolled.status, await enrolled.clone().text()).toBe(201);
    const enrollmentId = ((await enrolled.json()) as { id: string }).id;

    const route = `/api/students/${studentId}/payments`;
    const before = await get(route, hr);
    expect(before.status).toBe(200);
    expect(((await before.json()) as { items: Array<{ status: string }> }).items.map((item) => item.status)).toEqual(['pending']);
    expect(await open('/payments', hr)).toContain(studentName);

    // confirmar: 201 com as três chaves, e o mesmo período de novo é recusado pelo índice
    const confirmed = await post(route, hr, { enrollmentId });
    expect(confirmed.status, await confirmed.clone().text()).toBe(201);
    const payment = (await confirmed.json()) as { id: string; enrollmentId: string; createdAt: string };
    expect(Object.keys(payment).sort()).toEqual(['createdAt', 'enrollmentId', 'id']);
    expect(payment.enrollmentId).toBe(enrollmentId);
    const repeated = await post(route, hr, { enrollmentId });
    expect(repeated.status).toBe(409);
    expect(((await repeated.json()) as { code: string }).code).toBe('payment_already_confirmed');
    expect(psql(`select count(*) from payments where enrollment_id = '${enrollmentId}' and voided_at is null`)).toBe('1');

    // as leituras e as páginas, depois de confirmar: nenhuma deixa linha na trilha
    const afterConfirm = auditRows();
    const paid = await get(route, hr);
    expect(paid.status).toBe(200);
    const [item] = ((await paid.json()) as { items: Array<{ status: string; payment: { id: string } | null }> }).items;
    expect(item?.status).toBe('paid');
    expect(item?.payment?.id).toBe(payment.id);
    expect(await open(`/students/${studentId}`, hr)).toMatch(/>Pago</);
    expect(await open('/payments', hr)).not.toContain(studentName);
    // a recepção e o instrutor não veem o que o aluno deve
    const denied = await get(route, reception);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe('forbidden');
    for (const cookie of [reception, instructor]) {
      const page = await open('/payments', cookie);
      expect(page).toContain('Você não tem permissão para acessar esta página.');
      expect(page).not.toContain(studentName);
    }
    expect(auditRows()).toBe(afterConfirm);

    // desfazer: 204, a linha fica com `voided_at` e o período volta à lista
    const undone = await fetch(`${stack.webOrigin}${route}/${payment.id}`, { method: 'DELETE', headers: headersOf(hr) });
    expect(undone.status).toBe(204);
    expect(psql(`select voided_at is not null from payments where id = '${payment.id}'`)).toBe('t');
    expect(psql(`select count(*) from payments where enrollment_id = '${enrollmentId}'`)).toBe('1');
    const afterUndo = auditRows();
    expect(await open('/payments', hr)).toContain(studentName);
    expect(auditRows()).toBe(afterUndo);

    // as linhas são lidas do banco da stack: uma de cada, com o autor, o IP e o navegador enviados
    expect(
      psql(
        `select action || ',' || entity || ',' || entity_id || ',' || ip || ',' || user_agent from audit_logs where action in ('student.payment_confirmed', 'student.payment_undone') order by id`,
      ).split(/\r?\n/),
    ).toEqual([
      `student.payment_confirmed,student,${studentId},${forwardedFor},${userAgent}`,
      `student.payment_undone,student,${studentId},${forwardedFor},${userAgent}`,
    ]);
    expect(
      psql(
        `select count(*) from audit_logs where action in ('student.payment_confirmed', 'student.payment_undone') and user_id = (select id from users where email = '${hrEmail}')`,
      ),
    ).toBe('2');
  }, 300_000);

  test('dashboard_read_through_web_by_three_roles_follows_enrollment_and_payment_without_audit_rows', async () => {
    const env = readDotenv(join(stack.dir, '.env'));
    const psql = (sql: string) => {
      const result = stack.compose(`exec -T postgres psql -U ${env.POSTGRES_USER} -d ${env.POSTGRES_DB} -tAc "${sql}"`);
      expect(result.status, result.output).toBe(0);
      return result.output.trim();
    };
    /** Um usuário do perfil dado, criado pela CLI da stack, e a sessão dele pela origem do web. */
    const account = async (role: 'hr_finance' | 'reception' | 'instructor', email: string, password: string) => {
      const created = stack.compose(
        `exec -T -e ADMIN_PASSWORD=${password} api pnpm users:create-admin --email ${email} --name ${role}`,
      );
      expect(created.status, created.output).toBe(0);
      // a CLI cria `admin`, e `admin` sem 2FA só alcança as rotas de cadastro do 2FA
      psql(`update users set role = '${role}' where email = '${email}'`);
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
    };
    const headersOf = (cookie: string, body = false) => ({
      Origin: stack.webOrigin,
      Cookie: cookie,
      ...(body && { 'Content-Type': 'application/json' }),
    });
    const post = (path: string, cookie: string, body: unknown) =>
      fetch(`${stack.webOrigin}${path}`, { method: 'POST', headers: headersOf(cookie, true), body: JSON.stringify(body) });
    const open = async (cookie: string) => {
      const page = await fetch(`${stack.webOrigin}/`, { headers: headersOf(cookie) });
      expect(page.status).toBe(200);
      return page.text();
    };
    interface Dashboard {
      today: string;
      students: { active: number };
      enrollments: { active: number };
      payments: { pending: number };
    }
    const dashboard = async (cookie: string) => {
      const response = await fetch(`${stack.webOrigin}/api/dashboard`, { headers: headersOf(cookie) });
      expect(response.status).toBe(200);
      return (await response.json()) as Dashboard;
    };
    const auditRows = () => psql('select count(*) from audit_logs');
    const saoPauloDay = () => psql(`select (now() at time zone 'America/Sao_Paulo')::date`);

    // os três usuários nascem antes das leituras: o login grava na trilha
    const hr = await account('hr_finance', 'financeiro.do.painel@exemplo.com', 'senha-da-stack-fin-4');
    const reception = await account('reception', 'recepcao.do.painel@exemplo.com', 'senha-da-stack-rec-5');
    const instructor = await account('instructor', 'instrutor.do.painel@exemplo.com', 'senha-da-stack-ins-4');

    // o Financeiro lê as quatro chaves, e `today` é o dia de São Paulo lido do banco da stack
    const beforeReads = auditRows();
    const dayBefore = saoPauloDay();
    const first = await dashboard(hr);
    const dayAfter = saoPauloDay();
    expect(Object.keys(first).sort()).toEqual(['enrollments', 'payments', 'students', 'today']);
    expect([dayBefore, dayAfter]).toContain(first.today);
    expect(auditRows()).toBe(beforeReads);

    // um aluno novo matriculado a partir de hoje: um a mais em cada uma das três contagens
    const student = await post('/api/students', reception, {
      name: 'Aluno do Painel na Stack',
      cpf: '862.883.667-57',
      birthDate: '2000-01-01',
      phone: '(11) 91234-5678',
    });
    expect(student.status, await student.clone().text()).toBe(201);
    const studentId = ((await student.json()) as { id: string }).id;
    const createdPlan = await post('/api/plans', hr, { name: 'Mensal do Painel', period: 'monthly', priceCents: 9990 });
    expect(createdPlan.status, await createdPlan.clone().text()).toBe(201);
    const planId = ((await createdPlan.json()) as { id: string }).id;
    const enrolled = await post(`/api/students/${studentId}/enrollments`, hr, { planId, startsAt: saoPauloDay() });
    expect(enrolled.status, await enrolled.clone().text()).toBe(201);
    const enrollmentId = ((await enrolled.json()) as { id: string }).id;

    const second = await dashboard(hr);
    expect(second.students.active).toBe(first.students.active + 1);
    expect(second.enrollments.active).toBe(first.enrollments.active + 1);
    expect(second.payments.pending).toBe(first.payments.pending + 1);

    // confirmado o pagamento, o período sai dos pendentes
    const confirmed = await post(`/api/students/${studentId}/payments`, hr, { enrollmentId });
    expect(confirmed.status, await confirmed.clone().text()).toBe(201);
    const afterWrites = auditRows();
    const third = await dashboard(hr);
    expect(third.payments.pending).toBe(first.payments.pending);
    expect(third.enrollments.active).toBe(second.enrollments.active);

    // a recepção não recebe `payments`, e o instrutor só `today` e `students`
    expect(Object.keys(await dashboard(reception)).sort()).toEqual(['enrollments', 'students', 'today']);
    expect(Object.keys(await dashboard(instructor)).sort()).toEqual(['students', 'today']);
    const anonymous = await fetch(`${stack.webOrigin}/api/dashboard`, { headers: { Origin: stack.webOrigin } });
    expect(anonymous.status).toBe(401);
    expect(((await anonymous.json()) as { code: string }).code).toBe('unauthorized');

    // a página inicial pela origem do web: o Financeiro vê o card "Pagamentos", o instrutor só "Alunos"
    const hrPage = await open(hr);
    expect(hrPage).toContain('Painel');
    expect(hrPage).toMatch(/<h3[^>]*>Pagamentos<\/h3>/);
    const instructorPage = await open(instructor);
    expect(instructorPage).toContain('Painel');
    expect(instructorPage).toMatch(/<h3[^>]*>Alunos<\/h3>/);
    expect(instructorPage).not.toContain('Pagamentos');
    expect(instructorPage).not.toContain('Matrículas');

    // nenhuma leitura e nenhuma abertura de página deixou linha na trilha
    expect(auditRows()).toBe(afterWrites);
  }, 300_000);

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
