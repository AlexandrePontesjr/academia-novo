import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { Agent, setGlobalDispatcher } from 'undici';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  capture,
  captureBuffer,
  freePort,
  prepareProductionStack,
  readDotenv,
  run,
  runBash,
  type ProductionStack,
} from './support.ts';

/** A imagem do cliente do bucket, a mesma do `storage-init` (door 5). */
const AWS_CLI_IMAGE =
  'amazon/aws-cli:2.37.9@sha256:92de75724b6a746951f0e8b915d86bbccd7cb55aff96cd0cb4f7017272160780';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

const receptionEmail = 'recepcao.do.drill@exemplo.com';
const receptionPassword = 'senha-do-drill-123';
const studentHealth = 'Observacao de saude que o drill de restauracao precisa decifrar';

describe('backup e versionamento', () => {
  let stack: ProductionStack;
  let deployed: { status: number | null; output: string };
  let bucket: string;
  let dotenv: Record<string, string>;
  /** Um diretório fora de `$BACKUP_DIR`, montado em `/payload` nos comandos do `aws-cli`. */
  let payload: string;
  let studentId = '';
  let photoId = '';
  let photoBytes = Buffer.alloc(0);
  let receptionCookie = '';
  const restorePorts = { postgres: '', api: '', web: '', storage: '' };
  let restoreDurationMs = 0;
  const restoreProject = 'academia-restore';
  const restoreWebOrigin = () => `http://localhost:${restorePorts.web}`;

  const compose = (args: string) => stack.compose(args);
  const psql = (sql: string) => {
    const result = compose(`exec -T postgres psql -U ${dotenv.POSTGRES_USER} -d ${dotenv.POSTGRES_DB} -tAc "${sql}"`);
    expect(result.status, result.output).toBe(0);
    return result.output.trim();
  };
  const aws = (args: string) =>
    compose(
      `-f compose.yaml -f compose.prod.yaml --profile backup run --rm --no-deps -v "${payload}:/payload" --entrypoint aws aws-cli ${args}`,
    );
  /** O `stdout` do `aws-cli`, sem o ruído do Compose: é dele que sai o JSON dos comandos. */
  const awsOutput = (args: string) =>
    capture(
      `docker compose -f compose.yaml -f compose.prod.yaml --profile backup run --rm --no-deps -v "${payload}:/payload" --entrypoint aws aws-cli ${args}`,
      stack.dir,
      stack.env,
    );
  /** As chaves do bucket da stack, pelo `aws-cli`. */
  const keys = (prefix = '') =>
    awsOutput(`s3 ls --recursive s3://${bucket}/${prefix}`)
      .split(/\r?\n/)
      .flatMap((line) => /\s(\S+)\s*$/.exec(line)?.[1] ?? []);
  const versioningOf = (name: string) =>
    awsOutput(`s3api get-bucket-versioning --bucket ${name} --query Status --output text`).trim();
  const headOf = (name: string, key: string) => {
    const head = awsOutput(`s3api head-object --bucket ${name} --key ${key} --output json`);
    return JSON.parse(head.slice(head.indexOf('{'))) as { VersionId?: string; ETag?: string };
  };
  const objectOf = (key: string) =>
    captureBuffer(
      `docker compose -f compose.yaml -f compose.prod.yaml --profile backup run --rm --no-deps --entrypoint aws aws-cli s3 cp s3://${bucket}/${key} -`,
      stack.dir,
      stack.env,
    );
  /** O dump mais recente (pelo mtime), o que o drill de restauração usa. */
  const latestDump = () => {
    const dir = join(stack.backupDir, 'db');
    const files = readdirSync(dir)
      .filter((name) => name.endsWith('.dump'))
      .map((name) => join(dir, name))
      .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
    expect(files.length, 'dump do dia').toBeGreaterThan(0);
    return files.at(-1)!;
  };
  /** A sessão de um usuário pela origem da stack dada (a de produção ou a restaurada). */
  const loginOn = async (webOrigin: string, email: string, password: string) => {
    const login = await fetch(`${webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: webOrigin },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status, await login.clone().text()).toBe(200);
    return login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  };
  const restoreEnv = (extra: Record<string, string> = {}) => ({
    ...stack.env,
    // a chave é do operador: a suíte a entrega pelo ambiente, como o runbook manda
    DATA_ENCRYPTION_KEY: dotenv.DATA_ENCRYPTION_KEY ?? '',
    RESTORE_POSTGRES_PORT: restorePorts.postgres,
    RESTORE_API_PORT: restorePorts.api,
    RESTORE_WEB_PORT: restorePorts.web,
    RESTORE_STORAGE_PORT: restorePorts.storage,
    ...extra,
  });
  /** O ambiente para inspecionar o projeto restaurado pelo `docker compose` (sem o overlay). */
  const restoreComposeEnv = {
    get: () => ({
      ...stack.env,
      COMPOSE_PROJECT_NAME: restoreProject,
      POSTGRES_PORT: restorePorts.postgres,
      PORT: restorePorts.api,
      WEB_PORT: restorePorts.web,
      STORAGE_PORT: restorePorts.storage,
      WEB_ORIGIN: restoreWebOrigin(),
    }),
  };
  const restoreCompose = (args: string, project = restoreProject) =>
    run(
      `docker compose -p ${project} -f compose.yaml ${args}`,
      stack.dir,
      project === restoreProject
        ? restoreComposeEnv.get()
        : { ...restoreComposeEnv.get(), COMPOSE_PROJECT_NAME: project },
    );
  const containersOf = (project: string) =>
    capture(`docker compose -p ${project} -f compose.yaml ps --all --format json`, stack.dir, {
      ...restoreComposeEnv.get(),
      COMPOSE_PROJECT_NAME: project,
    })
      .split('\n')
      .filter((line) => line.trim().startsWith('{'))
      .map((line) => JSON.parse(line) as { Service: string; State: string; Health: string; ExitCode: number });

  beforeAll(async () => {
    stack = await prepareProductionStack('backup');
    payload = mkdtempSync(join(tmpdir(), 'academia-payload-')).replaceAll('\\', '/');
    deployed = stack.deploy();
    expect(deployed.status, deployed.output.slice(-8000)).toBe(0);
    dotenv = readDotenv(join(stack.dir, '.env'));
    bucket = dotenv.S3_BUCKET ?? '';

    // a CA interna do caddy: as chamadas HTTPS da suíte confiam nela
    setGlobalDispatcher(
      new Agent({ connect: { ca: stack.ca() }, pipelining: 0, keepAliveTimeout: 1 }),
    );

    // o que o drill precisa encontrar do outro lado: um usuário, um aluno com observação de saúde
    // cifrada e uma foto no bucket — criados antes do primeiro backup
    const created = compose(
      `exec -T -e ADMIN_PASSWORD=${receptionPassword} api pnpm users:create-admin --email ${receptionEmail} --name RecepcaoDoDrill`,
    );
    expect(created.status, created.output).toBe(0);
    psql(`update users set role = 'reception' where email = '${receptionEmail}'`);
    receptionCookie = await loginOn(stack.webOrigin, receptionEmail, receptionPassword);
    const headers = { Origin: stack.webOrigin, Cookie: receptionCookie };
    const student = await fetch(`${stack.webOrigin}/api/students`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Aluna do Drill',
        cpf: '529.982.247-25',
        birthDate: '2000-01-01',
        phone: '(11) 91234-5678',
        healthNotes: studentHealth,
      }),
    });
    expect(student.status, await student.clone().text()).toBe(201);
    studentId = ((await student.json()) as { id: string }).id;

    photoBytes = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#cc3322' } })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(photoBytes)], { type: 'image/jpeg' }), 'foto.jpg');
    const upload = await fetch(`${stack.webOrigin}/api/students/${studentId}/photo`, {
      method: 'POST',
      headers,
      body: form,
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    photoId = ((await upload.json()) as { id: string }).id;

    restorePorts.postgres = String(await freePort());
    restorePorts.api = String(await freePort());
    restorePorts.web = String(await freePort());
    restorePorts.storage = String(await freePort());
  }, 1_200_000);

  afterAll(() => {
    if (stack) {
      for (const project of [restoreProject, 'academia-restore-truncado']) {
        run(`docker compose -p ${project} -f compose.yaml down --volumes --remove-orphans`, stack.dir, {
          ...restoreComposeEnv.get(),
          COMPOSE_PROJECT_NAME: project,
        });
      }
      stack.destroy();
    }
    if (payload) rmSync(payload, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }, 300_000);

  test('prod_storage_init_enables_versioning_on_an_existing_bucket_and_is_idempotent', () => {
    const name = 'bucket-sem-versao';
    // o bucket existe e nunca teve versionamento: a execução única o habilita
    expect(aws(`s3api create-bucket --bucket ${name}`).status).toBe(0);

    const first = compose(`run --rm --no-deps -e S3_BUCKET=${name} storage-init`);
    expect(first.status, first.output).toBe(0);
    expect(versioningOf(name)).toBe('Enabled');

    // a segunda execução sobre o bucket já versionado também sai com 0
    const second = compose(`run --rm --no-deps -e S3_BUCKET=${name} storage-init`);
    expect(second.status, second.output).toBe(0);
    expect(versioningOf(name)).toBe('Enabled');
  });

  test('prod_backup_dump_lists_and_objects_match_the_bucket_sha256', () => {
    writeFileSync(join(payload, 'a.bin'), 'conteudo-do-objeto-a');
    writeFileSync(join(payload, 'b.bin'), 'conteudo-do-objeto-b');
    for (const [key, file] of [
      ['photos/main/prova/a.webp', 'a.bin'],
      ['photos/main/prova/b.webp', 'b.bin'],
    ] as const) {
      const put = aws(`s3api put-object --bucket ${bucket} --key ${key} --body /payload/${file}`);
      expect(put.status, put.output).toBe(0);
    }

    const backup = runBash('deploy/backup.sh', stack.dir, stack.env);
    expect(backup.status, backup.output).toBe(0);

    // o dump do dia: o nome, o formato `pg_dump -Fc` e o `pg_restore --list`
    const dumps = readdirSync(join(stack.backupDir, 'db')).filter((file) => file.endsWith('.dump'));
    expect(dumps).toHaveLength(1);
    const dump = join(stack.backupDir, 'db', dumps[0]!);
    expect(dumps[0]).toMatch(/^academia-\d{4}-\d{2}-\d{2}T\d{6}Z\.dump$/);
    const copied = compose(`cp "${dump}" postgres:/tmp/backup-do-teste.dump`);
    expect(copied.status, copied.output).toBe(0);
    const listed = compose('exec -T postgres pg_restore --list /tmp/backup-do-teste.dump');
    expect(listed.status, listed.output).toBe(0);

    // cada objeto do bucket foi copiado para `objects/<data>/<chave>` com o mesmo SHA-256
    const [day] = readdirSync(join(stack.backupDir, 'objects'));
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const copiedKeys = keys();
    expect(copiedKeys.length).toBeGreaterThanOrEqual(2);
    for (const key of copiedKeys) {
      const local = join(stack.backupDir, 'objects', day!, key);
      expect(existsSync(local), key).toBe(true);
      expect(sha256(readFileSync(local)), key).toBe(sha256(objectOf(key)));
    }
  }, 300_000);

  test('prod_backup_writes_atomic_metrics_with_timestamp_and_dump_bytes', () => {
    const markerPath = join(stack.backupDir, 'metrics', 'backup.prom');
    const startedAt = Math.floor(Date.now() / 1000);
    const backup = runBash('deploy/backup.sh', stack.dir, stack.env);
    const finishedAt = Math.ceil(Date.now() / 1000);
    expect(backup.status, backup.output).toBe(0);

    const marker = readFileSync(markerPath, 'utf8');
    const timestamp = Number(/^backup_last_success_timestamp_seconds (\d+)$/m.exec(marker)?.[1]);
    const bytes = Number(/^backup_dump_bytes (\d+)$/m.exec(marker)?.[1]);
    const [dump] = readdirSync(join(stack.backupDir, 'db'))
      .filter((file) => file.endsWith('.dump'))
      .sort()
      .reverse();
    expect(timestamp).toBeGreaterThanOrEqual(startedAt);
    expect(timestamp).toBeLessThanOrEqual(finishedAt);
    expect(bytes).toBe(statSync(join(stack.backupDir, 'db', dump!)).size);

    // atômico: o marcador é o único arquivo do diretório, sem parcial sobrando
    expect(readdirSync(join(stack.backupDir, 'metrics'))).toEqual(['backup.prom']);
  }, 300_000);

  test('prod_backup_failure_exits_nonzero_removes_partial_and_keeps_the_previous_marker', () => {
    const markerPath = join(stack.backupDir, 'metrics', 'backup.prom');
    const before = readFileSync(markerPath, 'utf8');
    const dumpsBefore = readdirSync(join(stack.backupDir, 'db')).filter((file) => file.endsWith('.dump'));

    // pg_dump quebrado: um banco que não existe
    const brokenDump = runBash('deploy/backup.sh', stack.dir, { ...stack.env, POSTGRES_DB: 'banco-que-nao-existe' });
    expect(brokenDump.status).not.toBe(0);
    expect(brokenDump.status).not.toBeNull();
    expect(readdirSync(join(stack.backupDir, 'db')).filter((file) => file.endsWith('.partial'))).toEqual([]);
    expect(readdirSync(join(stack.backupDir, 'db')).filter((file) => file.endsWith('.dump'))).toEqual(dumpsBefore);
    expect(readFileSync(markerPath, 'utf8')).toBe(before);

    // cópia de objetos quebrada: um bucket que não existe
    const brokenCopy = runBash('deploy/backup.sh', stack.dir, { ...stack.env, S3_BUCKET: 'bucket-que-nao-existe' });
    expect(brokenCopy.status).not.toBe(0);
    expect(brokenCopy.status).not.toBeNull();
    expect(readdirSync(join(stack.backupDir, 'db')).filter((file) => file.endsWith('.partial'))).toEqual([]);
    expect(readFileSync(markerPath, 'utf8')).toBe(before);
  }, 300_000);

  test('prod_backup_retention_keeps_the_thirty_most_recent_days', () => {
    const objects = join(stack.backupDir, 'objects');
    const db = join(stack.backupDir, 'db');
    const dayOf = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const old = dayOf(31);
    const kept = dayOf(29);
    for (const day of [old, kept]) {
      mkdirSync(join(objects, day), { recursive: true });
      writeFileSync(join(objects, day, 'foto.webp'), 'versao');
    }
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const keptDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    utimesSync(join(objects, old), oldDate, oldDate);
    utimesSync(join(objects, kept), keptDate, keptDate);
    const oldDump = join(db, 'academia-2000-01-01T000000Z.dump');
    const keptDump = join(db, 'academia-2000-01-02T000000Z.dump');
    writeFileSync(oldDump, 'dump antigo');
    writeFileSync(keptDump, 'dump guardado');
    utimesSync(oldDump, oldDate, oldDate);
    utimesSync(keptDump, keptDate, keptDate);

    const backup = runBash('deploy/backup.sh', stack.dir, stack.env);
    expect(backup.status, backup.output).toBe(0);

    expect(existsSync(join(objects, old)), 'backup de 31 dias').toBe(false);
    expect(existsSync(join(objects, kept)), 'backup de 29 dias').toBe(true);
    expect(existsSync(oldDump), 'dump de 31 dias').toBe(false);
    expect(existsSync(keptDump), 'dump de 29 dias').toBe(true);
    // e o dump desta execução continua no lugar
    expect(readdirSync(db).filter((file) => file.endsWith('.dump')).length).toBeGreaterThanOrEqual(2);
    expect(readdirSync(objects)).toContain(kept);
  }, 300_000);

  test('prod_backup_directory_has_only_db_objects_and_metrics_without_secrets', () => {
    const backup = runBash('deploy/backup.sh', stack.dir, stack.env);
    expect(backup.status, backup.output).toBe(0);

    expect(readdirSync(stack.backupDir).sort()).toEqual(['db', 'metrics', 'objects']);

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(stack.backupDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((file) => file.endsWith('.env'))).toEqual([]);

    const secrets = Object.entries(readDotenv(join(stack.dir, '.env')))
      .filter(([key]) =>
        ['AUTH_SECRET', 'DATA_ENCRYPTION_KEY', 'PHOTO_URL_SECRET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].includes(
          key,
        ),
      )
      .map(([, value]) => value)
      .filter((value) => value.length > 8);
    expect(secrets).toHaveLength(5);
    for (const file of files) {
      const content = readFileSync(file);
      for (const secret of secrets) expect(content.includes(secret), file).toBe(false);
    }
  }, 300_000);

  test('prod_aws_cli_service_resolves_the_door_five_literal', () => {
    // o `aws-cli` roda sob demanda (`profile: backup`): o config resolvido com o perfil ativo é o dele
    const result = compose(
      '-f compose.yaml -f compose.prod.yaml --profile backup config --format json',
    );
    expect(result.status, result.output).toBe(0);
    const { services } = JSON.parse(result.output.slice(result.output.indexOf('{'))) as {
      services: Record<
        string,
        {
          image?: string;
          environment?: Record<string, string>;
          volumes?: Array<{ type?: string; source?: string; target?: string }>;
        }
      >;
    };
    const env = readDotenv(join(stack.dir, '.env'));
    const awsCli = services['aws-cli']!;

    expect(awsCli.image).toBe(AWS_CLI_IMAGE);
    expect(awsCli.environment?.AWS_ENDPOINT_URL).toBe('http://storage:9000');
    expect(awsCli.environment?.AWS_ACCESS_KEY_ID).toBe(env.S3_ACCESS_KEY_ID);
    expect(awsCli.environment?.AWS_SECRET_ACCESS_KEY).toBe(env.S3_SECRET_ACCESS_KEY);
    expect(awsCli.environment?.AWS_DEFAULT_REGION).toBe('us-east-1');
    expect(awsCli.environment?.S3_BUCKET).toBe(env.S3_BUCKET);
    const volume = (awsCli.volumes ?? []).find((candidate) => candidate.target === '/backup');
    expect(volume?.source?.replaceAll('\\', '/')).toBe(stack.backupDir);
  });

  test('prod_storage_init_entrypoint_keeps_the_bucket_and_adds_versioning', () => {
    const result = compose('-f compose.yaml -f compose.prod.yaml config --format json');
    expect(result.status, result.output).toBe(0);
    const { services } = JSON.parse(result.output.slice(result.output.indexOf('{'))) as {
      services: Record<string, { entrypoint?: string[] }>;
    };
    const entrypoint = (services['storage-init']?.entrypoint ?? []).join(' ');

    expect(entrypoint).toContain(
      'aws s3api head-bucket --bucket "$$S3_BUCKET" || aws s3api create-bucket --bucket "$$S3_BUCKET"',
    );
    expect(entrypoint).toMatch(
      /aws s3api put-bucket-versioning --bucket "\$\$S3_BUCKET" --versioning-configuration Status=Enabled$/,
    );
  });

  test('prod_versioning_does_not_backfill_existing_objects', () => {
    const name = 'bucket-do-backfill';
    expect(aws(`s3api create-bucket --bucket ${name}`).status).toBe(0);
    writeFileSync(join(payload, 'antigo.bin'), 'objeto gravado antes do versionamento');
    expect(
      aws(`s3api put-object --bucket ${name} --key photos/main/antigo.webp --body /payload/antigo.bin`).status,
    ).toBe(0);
    const oldBefore = headOf(name, 'photos/main/antigo.webp');
    // o S3 representa "sem versão" como `null`; o que o check fixa é que não há version id
    expect([undefined, 'null']).toContain(oldBefore.VersionId);
    const etagBefore = oldBefore.ETag;

    // habilita o versionamento no bucket, pela execução única do `storage-init`
    const enabled = compose(`run --rm --no-deps -e S3_BUCKET=${name} storage-init`);
    expect(enabled.status, enabled.output).toBe(0);
    expect(versioningOf(name)).toBe('Enabled');

    writeFileSync(join(payload, 'novo.bin'), 'objeto gravado depois do versionamento');
    expect(
      aws(`s3api put-object --bucket ${name} --key photos/main/novo.webp --body /payload/novo.bin`).status,
    ).toBe(0);
    expect(headOf(name, 'photos/main/novo.webp').VersionId, 'objeto posterior').toMatch(/\S/);

    // o objeto antigo não é reenviado nem regravado
    const oldAfter = headOf(name, 'photos/main/antigo.webp');
    expect([undefined, 'null']).toContain(oldAfter.VersionId);
    expect(oldAfter.ETag).toBe(etagBefore);
  }, 300_000);

  test('prod_restore_rebuilds_a_clean_project_without_touching_production', async () => {
    const dump = latestDump();
    const startedAt = Date.now();
    const restored = runBash(
      `deploy/restore.sh "${dump.replaceAll('\\', '/')}" --project ${restoreProject}`,
      stack.dir,
      restoreEnv(),
    );
    restoreDurationMs = Date.now() - startedAt;
    expect(restored.status, restored.output.slice(-8000)).toBe(0);

    // a stack do projeto próprio, toda de pé
    const containers = containersOf(restoreProject);
    const of = (name: string) => containers.find((container) => container.Service === name);
    for (const service of ['postgres', 'storage', 'api', 'web']) {
      expect(of(service)?.Health, service).toBe('healthy');
    }
    expect(of('migrate')?.State).toBe('exited');
    expect(of('migrate')?.ExitCode).toBe(0);

    // portas e volumes próprios: as da restauração, não as da produção
    const config = restoreCompose('config --format json');
    expect(config.status, config.output).toBe(0);
    const resolved = JSON.parse(config.output.slice(config.output.indexOf('{'))) as {
      services: Record<string, { ports?: Array<{ published?: string }> }>;
    };
    expect(resolved.services.web?.ports?.[0]?.published).toBe(restorePorts.web);
    expect(resolved.services.api?.ports?.[0]?.published).toBe(restorePorts.api);
    expect(resolved.services.postgres?.ports?.[0]?.published).toBe(restorePorts.postgres);

    const volumes = capture('docker volume ls --format "{{.Name}}"', stack.dir);
    expect(volumes).toContain(`academia-restore_postgres-data`);
    expect(volumes).toContain(`academia-restore_rustfs-data`);
    expect(volumes).toContain(`${stack.project}_postgres-data`);

    // a produção não foi parada
    const production = await fetch(`${stack.webOrigin}/login`);
    expect(production.status).toBe(200);
  }, 900_000);

  test('prod_restored_stack_health_reports_database_and_storage_up', async () => {
    const health = await fetch(`http://localhost:${restorePorts.api}/health`);

    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ checks: { database: 'up', storage: 'up' } });
  });

  test('prod_restored_login_and_decrypted_health_notes', async () => {
    const origin = restoreWebOrigin();
    const cookie = await loginOn(origin, receptionEmail, receptionPassword);

    const ficha = await fetch(`${origin}/api/students/${studentId}`, { headers: { Cookie: cookie } });
    expect(ficha.status).toBe(200);
    expect(((await ficha.json()) as { healthNotes?: string }).healthNotes).toBe(studentHealth);
  });

  test('prod_restored_photo_matches_the_backed_up_object_sha256', async () => {
    const origin = restoreWebOrigin();
    const cookie = await loginOn(origin, receptionEmail, receptionPassword);
    const link = await fetch(`${origin}/api/students/${studentId}/photo?variant=large`, {
      headers: { Cookie: cookie },
    });
    expect(link.status).toBe(200);
    const { url } = (await link.json()) as { url: string };

    const file = await fetch(new URL(url, origin));
    expect(file.status).toBe(200);
    const bytes = Buffer.from(await file.arrayBuffer());

    const objects = join(stack.backupDir, 'objects');
    const backedUp = readdirSync(objects)
      .map((day) => join(objects, day, `photos/main/${studentId}/${photoId}/large.webp`))
      .find((path) => existsSync(path));
    expect(backedUp, 'objeto large no backup').toBeDefined();
    expect(sha256(bytes)).toBe(sha256(readFileSync(backedUp!)));
  });

  test('prod_deleted_object_is_recovered_from_a_version_and_served_again', async () => {
    const signedPath = async () => {
      const link = await fetch(`${stack.webOrigin}/api/students/${studentId}/photo?variant=large`, {
        headers: { Cookie: receptionCookie },
      });
      expect(link.status).toBe(200);
      return ((await link.json()) as { url: string }).url;
    };
    const path = await signedPath();
    const before = await fetch(`${stack.webOrigin}${path}`);
    expect(before.status).toBe(200);
    const beforeBytes = Buffer.from(await before.arrayBuffer());

    const key = `photos/main/${studentId}/${photoId}/large.webp`;
    const removed = aws(`s3api delete-object --bucket ${bucket} --key ${key}`);
    expect(removed.status, removed.output).toBe(0);
    expect((await fetch(`${stack.webOrigin}${path}`)).status).toBe(404);

    // a versão anterior e o marcador de exclusão que o versionamento criou
    const listed = awsOutput(`s3api list-object-versions --bucket ${bucket} --prefix ${key} --output json`);
    const versions = JSON.parse(listed.slice(listed.indexOf('{'))) as {
      Versions?: Array<{ VersionId: string; Key: string }>;
      DeleteMarkers?: Array<{ VersionId: string; Key: string }>;
    };
    const previous = versions.Versions?.find((version) => version.Key === key)?.VersionId;
    const marker = versions.DeleteMarkers?.find((version) => version.Key === key)?.VersionId;
    expect(previous, 'versão anterior').toMatch(/\S/);
    expect(marker, 'marcador de exclusão').toMatch(/\S/);

    // a versão é recuperada por `get-object --version-id`, com o mesmo conteúdo
    const recovered = aws(
      `s3api get-object --bucket ${bucket} --key ${key} --version-id ${previous} /payload/recuperado.webp`,
    );
    expect(recovered.status, recovered.output).toBe(0);
    expect(sha256(readFileSync(join(payload, 'recuperado.webp')))).toBe(sha256(beforeBytes));

    // e a foto volta a ser servida, com a versão recuperada
    const undeleted = aws(`s3api delete-object --bucket ${bucket} --key ${key} --version-id ${marker}`);
    expect(undeleted.status, undeleted.output).toBe(0);
    const again = await fetch(`${stack.webOrigin}${path}`);
    expect(again.status).toBe(200);
    expect(sha256(Buffer.from(await again.arrayBuffer()))).toBe(sha256(beforeBytes));
  }, 300_000);

  test('prod_restore_drill_uses_a_dump_younger_than_24h_and_finishes_under_4h', () => {
    const name = basename(latestDump());
    const match = /^academia-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump$/.exec(name);
    expect(match, name).not.toBeNull();

    const stamped = Date.UTC(
      Number(match![1]),
      Number(match![2]) - 1,
      Number(match![3]),
      Number(match![4]),
      Number(match![5]),
      Number(match![6]),
    );
    const age = Date.now() - stamped;
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(24 * 60 * 60 * 1000);
    expect(restoreDurationMs).toBeGreaterThan(0);
    expect(restoreDurationMs).toBeLessThan(4 * 60 * 60 * 1000);
  });

  test('prod_restore_refuses_a_truncated_dump_and_leaves_the_origin_intact', async () => {
    const source = latestDump();
    const content = readFileSync(source);
    const truncated = join(payload, basename(source));
    writeFileSync(truncated, content.subarray(0, Math.floor(content.length / 2)));

    const project = 'academia-restore-truncado';
    const result = runBash(
      `deploy/restore.sh "${truncated.replaceAll('\\', '/')}" --project ${project}`,
      stack.dir,
      restoreEnv(),
    );
    expect(result.status, 'dump truncado').not.toBe(0);
    expect(result.status).not.toBeNull();

    const production = await fetch(`${stack.webOrigin}/login`);
    expect(production.status).toBe(200);
    const containers = containersOf(project);
    expect(containers.find((container) => container.Service === 'web')?.State ?? 'ausente').not.toBe('running');
  }, 600_000);

  test('prod_restore_requires_the_data_encryption_key', () => {
    const env: Record<string, string> = { ...restoreEnv() };
    delete env.DATA_ENCRYPTION_KEY;

    const result = runBash(
      `deploy/restore.sh "${latestDump().replaceAll('\\', '/')}" --project academia-restore-sem-chave`,
      stack.dir,
      env,
    );
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('DATA_ENCRYPTION_KEY');
  });
});
