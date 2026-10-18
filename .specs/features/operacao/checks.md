# Operação - checks

Profile: standard
Plan: `.specs/features/operacao/plan.md`

## Intent

56 checks em 5 slices · 7 one-way doors · 4 open, of which 0 bloqueiam o Build (as quatro perguntas
abertas do plano são de go-live: provedor/domínio, webhook, cópia off-site e monitor externo; nenhuma
muda código nem prova). A base da feature é **`4fcc4ad`**, o commit que escreveu o plano.

O perfil é `standard`, como nas features anteriores: o que o `light` não pega - um membro enumerado
sem prova e uma prova que passa sob uma implementação errada - é exatamente o risco de uma feature de
borda e de operação, em que um `Caddyfile` com uma diretiva a menos, um `compose.prod.yaml` com uma
variável solta ou um `backup.sh` que apaga o arquivo parcial sob a falha errada sobem uma stack que
parece verde e não protege nada.

A derivação: **C1 a C43 provam a AC de mesmo número** (C7 é a AC 7), e **C44 a C56** são o que o
`Surface`, o `Flow`, as doors e o `Impact` enumeram além das AC. Nenhum claim é novo em relação ao
plano; o que este arquivo decide é o nível de cada prova.

Os dez itens que o plano deixa em aberto e que este arquivo fixa, para a revisão aceitar ou trocar
antes do Build:

1. **A base é `4fcc4ad`.** É o commit em que o plano foi escrito e o `HEAD` no momento destes checks;
   a C50 compara contra ela e o Verifier usa `4fcc4ad..HEAD`. Nenhum código desta feature existe
   ainda.
2. **O `504` da `Surface` não sai do `caddy`.** O experimento com `caddy:2.11.7` em 2026-10-18
   mostrou que a borda responde `502` nas três falhas que ela mesma produz: conexão recusada, tempo de
   discagem esgotado (`dial_timeout` de `3s`) e cabeçalho de resposta não chegado em
   `response_header_timeout`. O `504` que atravessa a borda é o do `web`: o route handler de
   `/api/*` (`apps/web/src/app/api/[...path]/route.ts`) responde `504` quando a `api` não responde em
   `10s`. A C45 prova esse `504` no nível em que ele existe. A revisão decidiu manter o `504` no nível
   do `web`, como escrito: a C45 não muda e a door 1 não ganha literal novo.
3. **A AC 12 roda num Chromium da suíte e2e do `web`**, sobre o build de produção, não na stack de
   produção: `tests/stack` não declara Playwright e o `Impact` do plano fixa "nenhum pacote npm
   novo"; o CSP é emitido pelo `web`, então o nível da prova é o mesmo, e o salto pelo `caddy` fica
   provado em C3, C4 e C39.
4. **A AC 41 é provada no artefato, não no modo em disco.** `0600`/`0700` são fatos POSIX do
   servidor, e a suíte de stack roda no host de desenvolvimento (Windows), onde o volume montado não
   devolve o modo gravado pelo host. A C41 prova o mecanismo - `.env` fora do git e os scripts fixam
   os três modos - e o passo de drill no servidor confere o modo real.
5. **A AC 34 e a AC 13 são provas de comando inteiro** - `pnpm audit --prod --audit-level high` e o
   `compose.test.ts` completo - porque nenhum seletor de caso conclui "a suíte atual continua verde".
   O aviso de "proof sem seletor" do `validate_checks.py` na C34 é esperado e fica, como o da C3 da
   `armazenamento-rustfs`; o comando da C13 tem `--filter` e não gera aviso.
6. **A Assumption "tags das imagens novas" está confirmada pela metade.** As quatro imagens
   Prometheus batem com os literais da door 6 (digests lidos do registro em 2026-10-18). O `caddy`
   **não bate**: o registro devolve `sha256:685ae3d7c34d9b5f8caeddc5d14051db7bbd88ff1f5a2fa0c16bd8ca328fb7af`
   para `caddy:2.11.7`, e a door 1 diz `sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f`.
   É stop-and-ask antes da S1: ou a revisão corrige o literal da door 1/AD-083 para o digest do
   registro, ou fixa outra tag. **Decidido pela revisão:** o literal da door 1, do `plan.md`, da
   AD-083 e desta C52 passa a ser o digest do registro,
   `sha256:685ae3d7c34d9b5f8caeddc5d14051db7bbd88ff1f5a2fa0c16bd8ca328fb7af`.
7. **As chaves de produção entram no `.env.example`.** `tests/stack/support.ts` copia
   `.env.example` para o `.env` de cada clone, e `prepareStack` falha se faltar variável exigida pelo
   Compose. Por isso a C49 congela as sete chaves (`SITE_ADDRESS`, `ACME_EMAIL`, `ALERT_WEBHOOK_URL`,
   `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`, `CADDY_HTTP_PORT`, `CADDY_HTTPS_PORT`) antes da S1.
8. **Os nomes de arquivo e de caso das provas novas são os que o Build escreve** -
   `tests/stack/production.test.ts`, `tests/stack/backup.test.ts`, `tests/stack/monitoring.test.ts`,
   `apps/web/e2e/csp.spec.ts` - como os nomes de teste da `armazenamento-rustfs`; quando um nome
   mudar, o `## Handoff` registra o nome que ficou e nenhum claim muda.
9. **As provas dos scripts rodam `bash deploy/*.sh` contra a stack de produção de pé.** No Windows o
   `bash` do PATH é o launcher do WSL, que pode não alcançar o Docker do host; se o Build esbarrar
   nisso, o script roda num container de teste com o socket do Docker montado, e o `## Handoff`
   registra o mecanismo. Nenhum claim depende desse detalhe.
10. **A stack de produção é provada com `SITE_ADDRESS=localhost` e a CA interna do `caddy`**, como o
    plano fixa na Open question 1: nos checks, `https://{$SITE_ADDRESS}/` aparece resolvido como
    `https://localhost:<CADDY_HTTPS_PORT>/`, com o certificado interno, e nunca um domínio público.

## Checks

Como ler as provas. Todas as provas já rodam no repositório: os casos novos entram em
`tests/stack/production.test.ts`, `tests/stack/backup.test.ts` e `tests/stack/monitoring.test.ts`
(mesmo `vitest` da suíte de stack, incluídos automaticamente por `pnpm test:stack`, mas **fora** do
`pnpm verify`), os estáticos em `tests/repo/repo.test.ts`, os de navegador em
`apps/web/e2e/csp.spec.ts` (playwright), e as duas provas de comando inteiro são o próprio comando.
Os nomes de caso são os que o Build escreve; quando um nome mudar, o `## Handoff` registra o nome que
ficou.

Comandos:

- `pnpm --filter "@academia/stack-tests" exec vitest run <arquivo> -t "<caso>"` - stack de produção
  real, em clone limpo, com a CA interna do `caddy`
- `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "<caso>"` - arquivos do
  repositório e literais
- `pnpm --filter "@academia/web" exec playwright test e2e/csp.spec.ts -g "<caso>"` - build de
  produção do `web` num Chromium real
- `pnpm verify`, `pnpm audit --prod --audit-level high`, `git diff --name-only ...` - os comandos
  que nenhum caso isolado conclui

Arquivos que o Build escreve ou edita:

- `compose.prod.yaml` (door 3) e `compose.yaml` (o `entrypoint` do `storage-init`, door 4)
- `deploy/Caddyfile`, `deploy/monitoring/{prometheus.yml,alerts.yml,alerts.test.yml,blackbox.yml,alertmanager.yml.tmpl}`,
  `deploy/{backup.sh,restore.sh,deploy.sh,render.sh}`, `deploy/systemd/{academia-backup.timer,academia-backup.service}`,
  `deploy/README.md`
- `apps/web/src/proxy.ts`, `apps/web/src/app/login/page.tsx`, `apps/web/src/app/login/two-factor/page.tsx`,
  `apps/web/e2e/csp.spec.ts`
- `tests/stack/production.test.ts`, `tests/stack/backup.test.ts`, `tests/stack/monitoring.test.ts`,
  `tests/repo/repo.test.ts`, `.env.example`
- `.specs/STATE.md` (o `## Handoff` e o estado das AD-083 a AD-089)

Arquivos que **não** mudam: `apps/api/src/**`, `packages/contracts/**`,
`packages/database/migrations/**` e `pnpm-lock.yaml` (C50), e os `plan.md`/`checks.md` de features
fechadas (histórico; Out of scope do plano).

### S1 - A borda HTTPS e o CSP · 12 arquivos · ~158 KB · ~40k

**C1** - `docker compose -f compose.yaml -f compose.prod.yaml up -d --wait` sai com código `0` e o
`docker compose ps --all --format json` da stack de produção mostra `caddy`, `web`, `api`, `postgres`
e `storage` em `healthy`, `migrate` e `storage-init` em `exited` com `ExitCode` `0`, e `prometheus`,
`alertmanager`, `node-exporter` e `blackbox-exporter` em `healthy` (AC 1).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_up_wait_exits_zero_with_every_service_in_the_expected_state"`

**C2** - `docker compose -f compose.yaml -f compose.prod.yaml config` sai com código diferente de `0`
citando o nome da variável nos dez casos: `SITE_ADDRESS`, `ACME_EMAIL`, `ALERT_WEBHOOK_URL`,
`BACKUP_DIR` e `POSTGRES_PASSWORD`, cada um ausente e cada um vazio no `.env` (AC 2).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_config_refuses_each_missing_and_empty_production_variable"`

**C3** - `GET http://localhost:<CADDY_HTTP_PORT>/` responde `308` com `Location` igual a
`https://localhost:<CADDY_HTTPS_PORT>/` (AC 3).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_http_redirects_to_https_with_308"`

**C4** - `GET https://localhost:<CADDY_HTTPS_PORT>/login` responde `200` com
`Strict-Transport-Security` igual a `max-age=31536000`, `X-Content-Type-Options` igual a `nosniff`,
`Referrer-Policy` igual a `strict-origin-when-cross-origin`, `Permissions-Policy` igual a
`camera=(self), microphone=(), geolocation=(), payment=()`, e sem os cabeçalhos `X-Powered-By` e
`Server` (AC 4).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_login_serves_the_edge_security_headers_and_hides_server_identity"`

**C5** - No config resolvido do overlay, só o serviço `caddy` tem port publicado com `host_ip` fora de
`127.0.0.1` (as duas portas dele), e todo port publicado de `web`, `api`, `postgres` e `storage` tem
`host_ip` `127.0.0.1` (AC 5).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_only_caddy_publishes_ports_and_every_other_port_is_on_loopback"`

**C6** - O `Caddyfile` de produção tem uma única rota de aplicação, `reverse_proxy web:3000`, e
nenhum upstream para `api:3001`; `GET https://localhost:<CADDY_HTTPS_PORT>/health` responde `404`
(não o `/health` da API); e `GET https://localhost:<CADDY_HTTPS_PORT>/api/students` sem sessão
responde `401` com `application/problem+json`, provando que o `/api/*` continua saindo do `web` até a
`api` (AC 6, AD-019).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_web_is_served_only_through_caddy_and_api_is_not_exposed"`

**C7** - `POST https://localhost:<CADDY_HTTPS_PORT>/api/students/<id>/photo` com corpo de `7 MB`
responde `413` gerado pela borda, com corpo que não é `application/problem+json` e sem o `requestId`
da API; a contagem de linhas de `docker compose logs api` não muda do começo ao fim do pedido (AC 7,
AD-044).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_oversized_upload_is_refused_at_the_edge_with_413_and_never_reaches_the_api"`

**C8** - Login feito através da borda com `X-Forwarded-For: 203.0.113.7` forjado grava em
`audit_logs.ip` o endereço da conexão com o `caddy` - o mesmo `client_ip` da linha de log de acesso
daquela requisição - e nunca `203.0.113.7` (AC 8, AD-028).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_forged_x_forwarded_for_never_reaches_the_audit_ip"`

**C9** - Com a stack de pé, o log de acesso do `caddy` é JSON e a linha da requisição
`GET /api/photo-files/<id>/large?exp=<s>&sig=<sig>` com `Cookie` e `Authorization` enviados tem
`request.uri` sem os valores de `q` e `sig` e `request.headers.Cookie` e
`request.headers.Authorization` com o valor `REDACTED` (AC 9).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_access_log_is_json_and_redacts_query_and_credentials"`

**C10** - A resposta de `GET https://localhost:<CADDY_HTTPS_PORT>/login` tem
`Content-Security-Policy` igual a `default-src 'self'; script-src 'self' 'nonce-<valor>'
'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self';
connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
e todo `<script>` inline do documento carrega exatamente o `nonce` do cabeçalho (AC 10, AD-084).
Proof: `pnpm --filter "@academia/web" exec playwright test e2e/csp.spec.ts -g "csp_header_carries_a_nonce_that_every_inline_script_reuses"`

**C11** - Duas requisições seguidas a `/login` e duas a `/login/two-factor` devolvem `nonce`
diferentes em cada par - as duas páginas renderizam por requisição e não são estáticas (AC 11).
Proof: `pnpm --filter "@academia/web" exec playwright test e2e/csp.spec.ts -g "two_requests_get_two_different_nonces_on_both_login_pages"`

**C12** - Num Chromium da suíte e2e, sobre o build de produção do `web`, abrir `/login`, entrar e
abrir `/students` produz zero eventos `securitypolicyviolation` no console e as duas telas renderizam
(AC 12).
Proof: `pnpm --filter "@academia/web" exec playwright test e2e/csp.spec.ts -g "chromium_opens_login_and_students_without_csp_violations"`

**C13** - `docker compose up --build --wait` no clone de desenvolvimento, sem o overlay, continua
saindo com código `0` e `compose.test.ts` inteiro continua verde: a stack de desenvolvimento mantém
todos os estados que a suíte atual afirma (AC 13).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run compose.test.ts`

**C44** - Com o container `web` parado, `GET https://localhost:<CADDY_HTTPS_PORT>/login` responde
`502` vindo da borda, sem o `web` (`Surface`, status `502`).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_returns_502_from_the_edge_when_web_is_stopped"`

**C45** - Com o container `api` pausado por mais de `10s`, `GET https://localhost:<CADDY_HTTPS_PORT>/api/dashboard`
responde `504` com `application/problem+json` do route handler do `web`, e a borda repassa o `504` sem
trocá-lo (`Surface`, status `504`; o `caddy` transforma as falhas dele mesmo em `502`, como a C44
fixa).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_relays_the_504_of_the_web_route_when_the_api_hangs"`

**C46** - `deploy/deploy.sh` tem `set -euo pipefail`, chama `deploy/render.sh` e executa exatamente
`docker compose -f compose.yaml -f compose.prod.yaml up -d --wait`; é esse script que sobe a stack em
toda prova de S1 e S4 (door 3, Flow 4).
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "deploy_script_renders_then_runs_the_overlay_up_wait"`

**C52** - O serviço `caddy` do `compose.prod.yaml` resolve a door 1 inteira: imagem
`caddy:2.11.7@sha256:685ae3d7c34d9b5f8caeddc5d14051db7bbd88ff1f5a2fa0c16bd8ca328fb7af`, ports
`["${CADDY_HTTP_PORT:-80}:80", "${CADDY_HTTPS_PORT:-443}:443"]`, volumes `caddy-data:/data` e
`caddy-config:/config`, healthcheck `['CMD', 'curl', '-fsS', 'http://127.0.0.1:2019/config/']`; e o
`deploy/Caddyfile` tem as opções globais `http_port 80`, `https_port 443`, `email {$ACME_EMAIL}` e
`metrics`, cada uma na sua linha, o site `:9180 { metrics }`, o site `{$SITE_ADDRESS}` com `header`,
`request_body { max_size 6MB }`, `@trace method TRACE` com `respond @trace 405`, `reverse_proxy
web:3000` sem `trusted_proxies` e o `log` com `format filter` (door 1).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_caddy_service_resolves_the_door_one_literal"`
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "caddyfile_matches_the_door_one_literal"`

**C54** - `apps/web/src/proxy.ts` gera `nonce = Buffer.from(crypto.randomUUID()).toString('base64')`
por requisição, grava o nonce em `x-nonce` e no `Content-Security-Policy` da requisição e da
resposta, usa `'unsafe-eval'` só quando `NODE_ENV` é `development`; `/login` e `/login/two-factor`
têm `export const dynamic = 'force-dynamic'`, e `style-src` mantém `'unsafe-inline'` (door 2).
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "web_proxy_nonce_and_dynamic_pages_match_the_door_two_literal"`

### S2 - O backup diário · 4 arquivos · ~42 KB · ~10k

**C14** - `storage-init` rodando sobre um bucket existente e sem versionamento habilita o
versionamento e sai com código `0`; `aws s3api get-bucket-versioning --bucket <bucket>` responde
`Status` igual a `Enabled`; uma segunda execução sai com código `0` (idempotente) (AC 14).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_storage_init_enables_versioning_on_an_existing_bucket_and_is_idempotent"`

**C15** - `bash deploy/backup.sh` com a stack de produção de pé grava
`$BACKUP_DIR/db/academia-<AAAA-MM-DDTHHMMSSZ>.dump` em formato `pg_dump -Fc`, cujo
`pg_restore --list` sai com código `0`, e cada objeto do bucket em `$BACKUP_DIR/objects/<data>/<chave>`
com o mesmo SHA-256 do objeto no bucket (AC 15).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_backup_dump_lists_and_objects_match_the_bucket_sha256"`

**C16** - Quando `deploy/backup.sh` termina com sucesso, `$BACKUP_DIR/metrics/backup.prom` existe de
forma atômica com `backup_last_success_timestamp_seconds` igual ao instante da execução e
`backup_dump_bytes` igual ao tamanho do dump (AC 16).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_backup_writes_atomic_metrics_with_timestamp_and_dump_bytes"`

**C17** - Com o `pg_dump` quebrado ou a cópia de objetos falhando, `deploy/backup.sh` sai com código
diferente de `0`, apaga o arquivo parcial e deixa `$BACKUP_DIR/metrics/backup.prom` com o conteúdo
anterior (AC 17).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_backup_failure_exits_nonzero_removes_partial_and_keeps_the_previous_marker"`

**C18** - Com backups de mais de 30 dias em `$BACKUP_DIR/db` e `$BACKUP_DIR/objects`, a execução de
`deploy/backup.sh` apaga os vencidos e mantém os 30 dias mais recentes (AC 18).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_backup_retention_keeps_the_thirty_most_recent_days"`

**C19** - `deploy/systemd/academia-backup.timer` tem `OnCalendar=*-*-* 03:00:00 America/Sao_Paulo` e
`Persistent=true`, e dispara `deploy/systemd/academia-backup.service`, que executa
`deploy/backup.sh` (AC 19).
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "systemd_units_run_the_backup_at_three_sao_paulo_persistently"`

**C20** - Depois de uma execução de `deploy/backup.sh`, o conteúdo de `$BACKUP_DIR` tem exatamente as
pastas `db/`, `objects/` e `metrics/`, e nenhum arquivo gravado contém `.env`, `AUTH_SECRET`,
`DATA_ENCRYPTION_KEY`, `PHOTO_URL_SECRET` nem as credenciais `S3_*` (AC 20).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_backup_directory_has_only_db_objects_and_metrics_without_secrets"`

**C47** - O config resolvido do overlay tem o serviço `aws-cli` com a imagem
`amazon/aws-cli:2.37.9@sha256:92de75724b6a746951f0e8b915d86bbccd7cb55aff96cd0cb4f7017272160780`
(a mesma do `storage-init`), `AWS_ENDPOINT_URL` igual a `http://storage:9000`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` igual a `us-east-1`, `S3_BUCKET` igual ao do `.env` e o
volume `${BACKUP_DIR}:/backup` (door 5, Flow 6).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_aws_cli_service_resolves_the_door_five_literal"`

**C55** - O `entrypoint` do `storage-init` no config resolvido mantém o
`head-bucket || create-bucket` e termina com `aws s3api put-bucket-versioning --bucket
"$$S3_BUCKET" --versioning-configuration Status=Enabled` (door 4).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_storage_init_entrypoint_keeps_the_bucket_and_adds_versioning"`

**C56** - Objetos gravados no bucket antes de o versionamento ser habilitado ficam sem `VersionId`, e
os gravados depois ganham `VersionId`; nenhum objeto antigo é reenviado ou regravado (Impact, stored
data - sem backfill).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_versioning_does_not_backfill_existing_objects"`

### S3 - A restauração validada · 2 arquivos · ~6 KB · ~2k

**C21** - `bash deploy/restore.sh <dump> --project academia-restore` com um dump válido cria a stack
no projeto Compose `academia-restore`, com volumes e portas próprios, restaura o banco e os objetos,
sobe a stack e sai com código `0`, sem parar a stack de produção (AC 21).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_restore_rebuilds_a_clean_project_without_touching_production"`

**C22** - Na stack restaurada, `GET http://<restore>:<porta>/health` responde `200` com `checks`
igual a `{ database: 'up', storage: 'up' }` (AC 22).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_restored_stack_health_reports_database_and_storage_up"`

**C23** - Na stack restaurada, o login de um usuário criado antes do backup responde `200`, e a ficha
de um aluno mostra a observação de saúde decifrada com a `DATA_ENCRYPTION_KEY` fornecida ao restore
(AC 23).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_restored_login_and_decrypted_health_notes"`

**C24** - Na stack restaurada, `GET /api/photo-files/<photoId>/large?exp=<segundos>&sig=<assinatura>`
responde `200` e o SHA-256 do corpo é igual ao do objeto correspondente no backup (AC 24).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_restored_photo_matches_the_backed_up_object_sha256"`

**C25** - Com uma versão do objeto apagada do bucket, recuperá-la por `aws s3api get-object
--version-id` faz `GET /api/photo-files/<photoId>/large?exp=<segundos>&sig=<assinatura>` voltar a
responder `200` com o mesmo conteúdo (AC 25).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_deleted_object_is_recovered_from_a_version_and_served_again"`

**C26** - O drill de restauração usa um dump com menos de 24 h e termina em menos de 4 h (AC 26).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_restore_drill_uses_a_dump_younger_than_24h_and_finishes_under_4h"`

**C27** - Com um dump truncado, `deploy/restore.sh` sai com código diferente de `0` e a stack de
origem continua intacta (AC 27).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_restore_refuses_a_truncated_dump_and_leaves_the_origin_intact"`

### S4 - Métricas e alertas · 7 arquivos · ~33 KB · ~8k

**C28** - Com a stack de pé, `GET http://prometheus:9090/-/ready` e
`GET http://alertmanager:9093/-/ready` respondem `200`, os alvos `caddy` e `node` têm `up` igual a
`1`, e as sondas `blackbox-web` e `blackbox-api` têm `probe_success` igual a `1` (AC 28).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run monitoring.test.ts -t "prod_observability_readies_targets_and_probes_are_up"`

**C29** - `deploy/monitoring/alerts.yml` tem as seis regras com estes limiares: `CaddyDown` com
`up == 0` por `2m`, `WebDown` com `probe_success == 0` por `2m`, `ApiHealthDegraded` com
`probe_success == 0` por `2m`, `DiskSpaceLow` com menos de 15% livres por `15m`, `BackupStale` com
`time() - backup_last_success_timestamp_seconds > 93600` e `Http5xxHigh` com mais de 5% de `5xx` em
`10m`; `promtool check rules` e `promtool test rules` saem com código `0` (AC 29).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run monitoring.test.ts -t "prod_alert_rules_match_the_six_literals_and_promtool_accepts_them"`

**C30** - Com a `api` parada, `ApiHealthDegraded` fica `firing` em até 5 min, e o `alertmanager`
entrega ao webhook configurado um JSON com `status` igual a `firing` e
`alerts[].labels.alertname` igual a `ApiHealthDegraded` (AC 30).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run monitoring.test.ts -t "prod_stopped_api_fires_and_delivers_api_health_degraded"`

**C31** - Com `backup.prom` trazendo `backup_last_success_timestamp_seconds` de 27 h atrás,
`BackupStale` dispara na avaliação seguinte (AC 31).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run monitoring.test.ts -t "prod_backup_stale_fires_with_a_marker_twenty_seven_hours_old"`

**C32** - Os serviços `prometheus`, `alertmanager`, `node-exporter` e `blackbox-exporter` não têm
porta publicada fora de `127.0.0.1`, e as métricas do `caddy` são servidas no site interno `:9180` e
não no site público `<SITE_ADDRESS>` (AC 32).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run monitoring.test.ts -t "prod_monitoring_ports_stay_on_loopback_and_caddy_metrics_are_internal"`

**C33** - `bash deploy/deploy.sh` renderiza `deploy/monitoring/alertmanager.yml` de
`deploy/monitoring/alertmanager.yml.tmpl` substituindo `ALERT_WEBHOOK_URL`, e `amtool check-config`
sobre o arquivo renderizado sai com código `0` (AC 33).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run monitoring.test.ts -t "prod_deploy_renders_alertmanager_config_and_amtool_accepts_it"`

**C48** - No config resolvido do overlay, as quatro imagens de observabilidade estão fixadas por tag
e digest, iguais aos literais da door 6:
`prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e`,
`prom/alertmanager:v0.34.1@sha256:e9733bafb1bdef9b00e25a21f8f99dc26a22224bf16641ad754d1649f4c3357a`,
`prom/node-exporter:v1.12.1@sha256:1b4e4438faca4dd7e001dd445d161a4a2091b0fededa84093b3a8dfeae1f1be0` e
`prom/blackbox-exporter:v0.29.0@sha256:9613f2884689b6fad9f1939f6a3b0388c93a022cfaededb19545b329b5c83dea`
(door 6).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run monitoring.test.ts -t "prod_monitoring_images_are_pinned_by_tag_and_digest"`

**C53** - `deploy/monitoring/` tem os quatro arquivos (`prometheus.yml`, `alerts.yml`, `blackbox.yml`,
`alertmanager.yml.tmpl`), e `prometheus.yml` raspa `caddy:9180`, `node-exporter:9100` e
`blackbox-exporter:9115` com as sondas `http://web:3000/login` e `http://api:3001/health` (door 6).
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "monitoring_files_and_scrape_targets_match_the_door_six_literal"`

### S5 - OWASP Top 10 e custódia de segredos · 8 arquivos · ~31 KB · ~8k

**C34** - `pnpm audit --prod --audit-level high` sai com código `0`, sem vulnerabilidade `high` nem
`critical` (AC 34).
Proof: `pnpm audit --prod --audit-level high`

**C35** - Na stack de produção, `GET https://localhost:<CADDY_HTTPS_PORT>/api/students` sem sessão
responde `401` com `application/problem+json`, e `GET https://localhost:<CADDY_HTTPS_PORT>/api/staff`
com sessão de `reception` responde `403` com `application/problem+json` (AC 35).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_anonymous_api_is_401_and_reception_on_staff_is_403_with_problem_json"`

**C36** - O sexto login falho do mesmo e-mail em 15 min responde `429` com `code` igual a
`too_many_attempts` e `Retry-After` positivo (AC 36).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_sixth_failed_login_in_fifteen_minutes_is_429_with_retry_after"`

**C37** - Corpo inválido em `POST https://localhost:<CADDY_HTTPS_PORT>/api/auth/login` responde `422`
com `code` igual a `validation_failed` (AC 37).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_invalid_login_body_is_422_validation_failed"`

**C38** - A borda aceita TLS 1.2 e TLS 1.3 e recusa TLS 1.0 e TLS 1.1; e a resposta do login traz o
cookie de sessão com `Secure`, `HttpOnly` e `SameSite=Lax` (AC 38).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_edge_accepts_tls_12_and_13_and_refuses_tls_10_and_11"`
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_login_cookie_is_secure_httponly_and_samesite_lax"`

**C39** - `TRACE https://localhost:<CADDY_HTTPS_PORT>/` responde `405` na borda (AC 39).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_trace_is_refused_with_405"`

**C40** - `deploy/README.md` tem os passos de primeira subida, atualização, restauração do backup,
resposta a alerta e rollback, e a tabela das dez categorias do OWASP Top 10 em que cada categoria
aponta a prova dela, sem célula vazia (AC 40).
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "deploy_readme_documents_the_runbook_and_the_owasp_matrix"`

**C41** - O `.env` de produção não é rastreado pelo git (`git check-ignore .env` sai `0`), e os
artefatos de deploy fixam os três modos da door 7: `deploy/deploy.sh` põe o `.env` em `0600`,
`deploy/backup.sh` cria `$BACKUP_DIR` com `0700` e grava cada arquivo de backup com `0600`
(`install -d -m 700`, `install -m 600`/`umask 077`), e `deploy/README.md` repete os três (AC 41,
door 7).
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "deploy_artifacts_fix_the_seven_hundred_and_six_hundred_permissions"`

**C42** - `deploy/restore.sh` exige a `DATA_ENCRYPTION_KEY` do operador e falha sem ela; e
`deploy/README.md` lista as cópias fora do servidor de `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`,
`PHOTO_URL_SECRET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `ALERT_WEBHOOK_URL`, com a perda da
`DATA_ENCRYPTION_KEY` marcada como irreversível (AC 42).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts -t "prod_restore_requires_the_data_encryption_key"`
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "deploy_readme_lists_the_off_server_secrets_and_the_irreversible_key"`

**C43** - Com uma sessão válida, `GET https://localhost:<CADDY_HTTPS_PORT>/.git/config`,
`/package.json`, `/.env` e `/.env.example` respondem `404`, sem o conteúdo do arquivo (AC 43).
Proof: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts -t "prod_repository_files_are_404_even_with_a_session"`

**C49** - `.env.example` lista as sete chaves de produção `SITE_ADDRESS`, `ACME_EMAIL`,
`ALERT_WEBHOOK_URL`, `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`, `CADDY_HTTP_PORT` e `CADDY_HTTPS_PORT`
(cada uma com valor de desenvolvimento), e o teste `env_example_lists_every_required_key` continua
verde (AD-015; Impact, documentos).
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "env_example_lists_every_production_key"`
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "env_example_lists_every_required_key"`

**C50** - Da base `4fcc4ad` até `HEAD`, `git diff --name-only` sai vazio para `apps/api/src`,
`packages/contracts`, `packages/database/migrations` e `pnpm-lock.yaml`: nenhuma rota, schema,
migração ou dependência npm muda (Impact, contrato da API e dependências; door 4).
Proof: `git diff --name-only 4fcc4ad..HEAD -- apps/api/src packages/contracts packages/database/migrations pnpm-lock.yaml`

**C51** - `.github/workflows/ci.yml` continua com um único passo de qualidade, `pnpm verify`, e
nenhum job de deploy ou de stack (Impact, CI).
Proof: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts -t "ci_runs_only_pnpm_verify_and_no_deploy_job"`

## Coverage

Membros tirados da autoridade de cada conjunto: as doors 1 a 7, do `Landing` do plano; as rotas e
status, do `Surface`; as decisões, da `Observable`; as AC, do `Criteria`; os termos, caminhos e
dependências, do `Impact`; os nomes de variável, imagem, volume, sonda e regra, dos literais das
doors.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| door 1: imagem do `caddy` (1) | `caddy:2.11.7@sha256:d854...f75f` C52 | - |
| door 1: portas e volumes do `caddy` (3) | ports `${CADDY_HTTP_PORT:-80}` e `${CADDY_HTTPS_PORT:-443}` C5 · volume `caddy-data` C52 · volume `caddy-config` C52 | - |
| door 1: healthcheck do `caddy` (1) | `curl -fsS http://127.0.0.1:2019/config/` C52 | - |
| door 1: opções globais do `Caddyfile` (4) | `http_port 80` C52 · `https_port 443` C52 · `email {$ACME_EMAIL}` C52 · `metrics` C52 | - |
| door 1: site interno de métricas (1) | site `:9180 { metrics }` C52, C32 | - |
| door 1: cabeçalhos da borda (5) | HSTS `max-age=31536000` C4 · `X-Content-Type-Options nosniff` C4 · `Referrer-Policy strict-origin-when-cross-origin` C4 · `Permissions-Policy` C4 · `-Server` e `-X-Powered-By` C4 | - |
| door 1: corpo e TRACE (2) | `request_body { max_size 6MB }` C7 · `@trace` com `respond 405` C39 | - |
| door 1: rota da aplicação (1) | `reverse_proxy web:3000` sem `trusted_proxies` C6 | - |
| door 1: log de acesso (2) | JSON com `q` e `sig` apagados de `request.uri` C9 · `Cookie` e `Authorization` com `REDACTED` C9 | - |
| door 1: portas dos outros serviços (1) | `web`, `api`, `postgres` e `storage` só em `127.0.0.1` C5 | - |
| door 2: nonce por requisição (3) | `Buffer.from(crypto.randomUUID()).toString('base64')` C54 · `x-nonce` na requisição e no CSP C54 · CSP na requisição e na resposta C54 | - |
| door 2: política literal (3) | dez diretivas do `Content-Security-Policy` C10 · `script-src` com `'nonce-...'` e `'strict-dynamic'` C10 · `style-src 'self' 'unsafe-inline'` C54 | - |
| door 2: nonce no documento (1) | todo `<script>` inline com o nonce do cabeçalho C10 | - |
| door 2: nonce entre requisições (1) | dois nonces diferentes em cada página C11 | - |
| door 2: escape de desenvolvimento (1) | `'unsafe-eval'` só em `development` C54 | - |
| door 2: renderização dinâmica (1) | `force-dynamic` em `/login` e `/login/two-factor` C11, C54 | - |
| door 3: `compose.prod.yaml` (1) | overlay com o `up -d --wait` C1, C46 | - |
| door 3: `deploy/Caddyfile` (1) | arquivo de borda C52 | - |
| door 3: `deploy/monitoring/` (1) | quatro arquivos de observabilidade C53 | - |
| door 3: `deploy/backup.sh` (1) | script do backup diário C15 | - |
| door 3: `deploy/restore.sh` (1) | script da restauração C21 | - |
| door 3: `deploy/deploy.sh` (1) | script da subida C46 | - |
| door 3: `deploy/render.sh` (1) | render do Alertmanager C33 | - |
| door 3: `deploy/systemd/` (1) | timer e service C19 | - |
| door 3: `deploy/README.md` (1) | runbook e matriz OWASP C40 | - |
| door 3: `.env` do servidor (1) | `0600` e fora do git C41 | - |
| door 4: versionamento habilitado (1) | `put-bucket-versioning ... Status=Enabled` C14, C55 | - |
| door 4: idempotência (1) | segunda execução sai `0` C14 | - |
| door 4: recuperação (1) | `get-object --version-id` C25 | - |
| door 4: sem backfill (1) | objeto antigo fica sem `VersionId` C56 | - |
| door 4: contrato intacto (1) | nenhuma chave de objeto, coluna ou migração muda C50 | - |
| door 5: `$BACKUP_DIR` e o `aws-cli` (2) | `${BACKUP_DIR}:/backup` no serviço `aws-cli` C47 · `$BACKUP_DIR` do host C41 | - |
| door 5: dump do banco (1) | `db/academia-<AAAA-MM-DDTHHMMSSZ>.dump` com `pg_dump -Fc` C15 | - |
| door 5: cópia dos objetos (1) | `objects/<data>/...` com SHA-256 igual C15 | - |
| door 5: marcador de métricas (1) | `metrics/backup.prom` atômico C16 | - |
| door 5: retenção (1) | `BACKUP_RETENTION_DAYS=30` C18 | - |
| door 5: timer (1) | `OnCalendar=*-*-* 03:00:00 America/Sao_Paulo` e `Persistent=true` C19 | - |
| door 5: restauração em projeto próprio (1) | `restore.sh` com `-p academia-restore` C21 | - |
| door 5: conteúdo do backup (1) | só `db/`, `objects/` e `metrics/` C20 | - |
| door 6: imagens fixadas (1) | quatro digests da door 6 C48 | - |
| door 6: portas (1) | nenhuma porta fora de `127.0.0.1` C32 | - |
| door 6: arquivos de monitoração (1) | `prometheus.yml`, `alerts.yml`, `blackbox.yml`, `alertmanager.yml.tmpl` C53 | - |
| door 6: métricas do `caddy` (1) | `:9180` interno e admin em `localhost:2019` C32, C52 | - |
| door 6: sondas (1) | `blackbox-web` e `blackbox-api` C28, C53 | - |
| door 6: regras (1) | `CaddyDown`, `WebDown`, `ApiHealthDegraded`, `DiskSpaceLow`, `BackupStale`, `Http5xxHigh` C29 | - |
| door 6: entrega do alerta (1) | `render.sh` com `amtool check-config` e o webhook C30, C33 | - |
| door 7: `.env` fora do git (1) | `git check-ignore .env` sai `0` C41 | - |
| door 7: `.env` `0600` (1) | modo fixado por `deploy.sh` C41 | - |
| door 7: backup sem `.env` (1) | nenhuma chave secreta no diretório C20 | - |
| door 7: cópias fora do servidor (1) | seis chaves no `deploy/README.md` C42 | - |
| door 7: restore exige a chave (1) | `DATA_ENCRYPTION_KEY` obrigatória C42 | - |
| door 7: `$BACKUP_DIR` `0700` (1) | `install -d -m 700` no `backup.sh` C41 | - |
| door 7: arquivos `0600` (1) | `install -m 600`/`umask 077` no `backup.sh` C41 | - |
| AC 1 (1) | `up -d --wait` sai `0` com os nove estados C1 | - |
| AC 2 (1) | `config` recusa as cinco variáveis ausentes e vazias C2 | - |
| AC 3 (1) | `308` com `Location` em `https` C3 | - |
| AC 4 (1) | `/login` com os quatro cabeçalhos e sem `Server` C4 | - |
| AC 5 (1) | só o `caddy` publica porta fora de `127.0.0.1` C5 | - |
| AC 6 (1) | `web` só pelo `caddy` e `api` não alcançável C6 | - |
| AC 7 (1) | `413` na borda e a `api` recebe zero pedidos C7 | - |
| AC 8 (1) | `X-Forwarded-For` forjado não chega à trilha C8 | - |
| AC 9 (1) | log JSON com `q`/`sig` apagados e credenciais `REDACTED` C9 | - |
| AC 10 (1) | CSP literal com o nonce de todo script inline C10 | - |
| AC 11 (1) | nonces diferentes entre requisições C11 | - |
| AC 12 (1) | Chromium sem `securitypolicyviolation` em `/login` e `/students` C12 | - |
| AC 13 (1) | stack de desenvolvimento e `compose.test.ts` verdes C13 | - |
| AC 14 (1) | versionamento habilitado e segunda execução idempotente C14 | - |
| AC 15 (1) | dump listável e objetos com SHA-256 igual C15 | - |
| AC 16 (1) | `backup.prom` atômico com instante e tamanho C16 | - |
| AC 17 (1) | falha do backup sai não `0`, apaga o parcial e mantém o marcador C17 | - |
| AC 18 (1) | retenção de 30 dias C18 | - |
| AC 19 (1) | timer às 03:00 de São Paulo com `Persistent=true` C19 | - |
| AC 20 (1) | só `db/`, `objects/` e `metrics/`, sem segredo C20 | - |
| AC 21 (1) | restore em `academia-restore` sem tocar a origem C21 | - |
| AC 22 (1) | `/health` da stack restaurada `200` com os dois `up` C22 | - |
| AC 23 (1) | login e observação de saúde decifrada na stack restaurada C23 | - |
| AC 24 (1) | foto `large` com o SHA-256 do backup C24 | - |
| AC 25 (1) | objeto apagado recuperado por `--version-id` C25 | - |
| AC 26 (1) | dump com menos de 24 h e drill abaixo de 4 h C26 | - |
| AC 27 (1) | dump truncado recusado sem tocar a origem C27 | - |
| AC 28 (1) | readies, alvos `up` e sondas `probe_success` C28 | - |
| AC 29 (1) | seis regras com limiares e `promtool` verde C29 | - |
| AC 30 (1) | `ApiHealthDegraded` firing e entrega no webhook C30 | - |
| AC 31 (1) | `BackupStale` com 27 h C31 | - |
| AC 32 (1) | monitoração em loopback e métricas do `caddy` internas C32 | - |
| AC 33 (1) | render do Alertmanager e `amtool check-config` C33 | - |
| AC 34 (1) | `pnpm audit --prod --audit-level high` sai `0` C34 | - |
| AC 35 (1) | `401` e `403` em `problem+json` na borda C35 | - |
| AC 36 (1) | sexto login falho em 15 min é `429` C36 | - |
| AC 37 (1) | corpo inválido no login é `422` C37 | - |
| AC 38 (1) | TLS 1.2/1.3 aceitos, 1.0/1.1 recusados, cookie marcado C38 | - |
| AC 39 (1) | `TRACE` recusado com `405` C39 | - |
| AC 40 (1) | runbook e matriz OWASP sem célula vazia C40 | - |
| AC 41 (1) | `.env` fora do git e os três modos fixados C41 | - |
| AC 42 (1) | chave exigida no restore e cópias listadas C42 | - |
| AC 43 (1) | quatro arquivos de repositório respondem `404` C43 | - |
| Observable: `up -d --wait` (1) | saída e código com a stack saudável C1 | - |
| Observable: `config` (1) | variável de produção ausente ou vazia C2 | - |
| Observable: `up --build --wait` de desenvolvimento (1) | regressão da stack de desenvolvimento C13 | - |
| Observable: serviço `caddy`, portas e `api` (2) | portas publicadas C5 · quem alcança a `api` C6 | - |
| Observable: serviço `caddy`, redirecionamento (1) | HTTP para HTTPS com `308` C3 | - |
| Observable: serviço `caddy`, cabeçalhos (5) | HSTS C4 · `nosniff` C4 · `Referrer-Policy` C4 · `Permissions-Policy` C4 · ausência de `Server` e `X-Powered-By` C4 | - |
| Observable: serviço `caddy`, erro de borda (3) | corpo grande `413` C7 · `web` fora `502` C44 · `api` pendurada `504` C45 | - |
| Observable: serviço `caddy`, log (2) | JSON com `q` e `sig` apagados C9 · credenciais `REDACTED` C9 | - |
| Observable: página do `web` (2) | CSP com nonce C10 · nonce por requisição C11 | - |
| Observable: telas em navegador (2) | zero `securitypolicyviolation` C12 · `/login` e `/students` renderizam C12 | - |
| Observable: `backup.sh`, saída e retenção (5) | dump e objetos C15 · marcador C16 · falha parcial C17 · retenção C18 · conteúdo do diretório C20 | - |
| Observable: `backup.sh` em falha (1) | erro na saída de erro e código não `0` C17 | - |
| Observable: `restore.sh` (2) | saída e código C21 · dump inválido C27 | - |
| Observable: timer `academia-backup.timer` (2) | agenda de 03:00 em São Paulo C19 · `Persistent=true` C19 | - |
| Observable: `deploy.sh` (3) | render do Alertmanager C33 · `amtool check-config` C33 · `up -d --wait` C46 | - |
| Observable: `GET /health` da API (1) | sondado dentro da rede C28 | - |
| Observable: `prometheus` e `alertmanager` (2) | portas em loopback C32 · sondas `probe_success` C28 | - |
| Observable: alerta ao operador (2) | `firing` com o label C30 · `BackupStale` com 27 h C31 | - |
| Observable: `deploy/README.md` (2) | runbook e matriz OWASP C40 · cópias dos segredos C42 | - |
| Observable: `.env.example` (2) | chaves de produção C49 · `.env` fora do git C41 | - |
| Impact: domain (2) | termos novos no `deploy/README.md` C40 · `WEB_ORIGIN` de produção documentado C40 | - |
| Impact: stored data (2) | versionamento habilitado C14 · sem backfill C56 | - |
| Impact: contrato da API (1) | nenhum diff em `apps/api/src`, `packages/contracts` e migrações C50 | - |
| Impact: dependências (2) | cinco imagens fixadas por tag e digest C48, C52 · nenhum pacote npm novo C50 | - |
| Impact: comandos e testes (5) | `deploy/deploy.sh` C46 · `deploy/render.sh` C33 · `deploy/backup.sh` C15 · `deploy/restore.sh` C21 · units de systemd C19 | - |
| Impact: documentos (2) | `deploy/README.md` C40 · `.env.example` C49 | - |
| Impact: CI (1) | workflow continua só com `pnpm verify` C51 | - |

- `Surface` do plano: as três linhas estão nas linhas "Observable: serviço `caddy`" acima - `308`
  (C3), `413` (C7), `502` (C44) e `504` (C45). O `504` da borda está coberto no nível em que existe
  (o route handler do `web`, C45); o achado está no item 2 do `## Intent`.
- `Relations` do plano: `None - no stored-data shape change`. Nenhuma tabela nasce ou muda, então
  nenhuma linha de entidade; o que muda é ciclo de vida de objeto, provado em C14, C25 e C56.
- A linha "todas as rotas da aplicação - versionamento e rate limit" da `Observable` é `n/a` e não
  vira linha: nenhuma rota nasce ou muda (C50), e o limite por IP genérico está no Out of scope do
  plano.
- `Impact: domain` não ganha check de código porque termo e valor de `.env` de produção são texto do
  runbook (C40); o que muda em código - o `/api/*` continuar no `web` e o `ip` da trilha - está em C6
  e C8.
- Linhas de `Startup configuration`: as chaves de produção são lidas por três assemblies - o Compose
  (`config` recusa ausência e vazio, C2), o `Caddyfile` (`{$SITE_ADDRESS}`, `{$ACME_EMAIL}`, C52) e o
  Alertmanager renderizado (`ALERT_WEBHOOK_URL`, C33) - e por isso não há linha de "startup config"
  separada: cada membro está na linha de AC ou de door que o nomeia.
- Todas as provas de status e de forma de resposta são de fronteira: as de stack fazem HTTP e TCP
  reais contra containers reais, as de navegador rodam um Chromium real, e as de repositório leem
  arquivos e rodam `git diff`/`git check-ignore`. Nenhuma afirma o interior de um módulo que ela
  mesma montou.

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Configuração lida pelo `docker compose` (`compose.prod.yaml` mais o `compose.yaml`; imagem, ambiente, healthcheck, `entrypoint`, portas, volumes, `depends_on`) | uma no config resolvido da stack de produção e uma no estado dos containers depois do `up -d --wait` | cada literal das doors 1, 3 e 6 e cada estado que os serviços alcançam: `healthy`, `exited` `0`, `healthy` dos quatro de observabilidade |
| `deploy/Caddyfile` e o binário do `caddy` (decidem status, cabeçalhos, redirecionamento, limite de corpo, log e métricas) | uma de fronteira (HTTP, HTTPS e TCP reais contra a borda) e uma estática dos literais do `Caddyfile` | cada status da `Surface` (`308`, `413`, `502`, `504`), cada cabeçalho da AC 4, cada filtro do log da AC 9, a política de nonce da AC 10 |
| `deploy/backup.sh` e `deploy/restore.sh` (decidem caminho, falha, retenção, restauração e exigência da chave) | uma execução real de cada script contra a stack de produção, mais uma de cada ramo de falha | sucesso, falha do dump, falha da cópia, parcial apagado, retenção de 30 dias, dump inválido, chave ausente |
| `apps/web/src/proxy.ts` (decide o nonce e a política por requisição) | uma na fronteira (HTTP da página) e uma no navegador real | a política literal, o nonce no cabeçalho e em todo script inline, a diferença de nonce entre requisições |
| `deploy/monitoring/{alerts.yml,prometheus.yml,blackbox.yml}` (tabela de decisão de seis regras) | uma avaliação real com Prometheus e Alertmanager de pé, e uma `promtool test rules` | as seis regras, os seis limiares, as duas sondas e a entrega no webhook |
| `deploy/systemd/*` e documentos (`deploy/README.md`, `.env.example`, `.github/workflows/ci.yml`) | uma estática cada, no nível de repositório | a linha ou o texto nomeado pelo claim |

Evidence:

- `compose.yaml`: cinco serviços com configuração literal, três condições de `depends_on` e dois
  volumes; quem decide a ordem, o ambiente e as portas é o `docker compose` -> decide
- `deploy/Caddyfile` e `compose.prod.yaml` (novos): o `caddy` decide status, cabeçalhos e log; o
  overlay decide o que é publicado e em que endereço -> decide, nos dois arquivos
- `deploy/backup.sh` e `deploy/restore.sh` (novos): ramificam em sucesso, falha do `pg_dump`, falha
  da cópia, retenção, dump inválido e chave ausente -> decide
- `deploy/render.sh` (novo): uma substituição de texto de `ALERT_WEBHOOK_URL`, sem condicional ->
  instrumentação
- `apps/web/src/proxy.ts` hoje: um `if`/`else if` de redirecionamento e o cookie de sessão; passa a
  decidir também o nonce e a política por requisição -> decide
- `deploy/monitoring/alerts.yml` (novo): seis regras, cada uma com um limiar e um `for` -> decide
- análogo mais próximo, para as provas de config: `tests/stack/compose.test.ts` já lê o config
  resolvido (`config --format json`) e o estado dos containers (`ps --all --format json`) nos casos
  da `armazenamento-rustfs` (linhas 115 e 94); para as estáticas: `tests/repo/repo.test.ts` já lê
  `.env.example`, o workflow e o `compose.yaml` com o helper `read(path)`; para as de navegador:
  `apps/web/e2e/proxy.spec.ts` já exercita o `proxy.ts` num Chromium com a API falsa de
  `e2e/support/fake-api.ts`

Cost: 30 provas de stack de produção (uma stack de pé por arquivo, com o `up -d --wait` no
`beforeAll`), 8 provas estáticas de repositório, 3 provas de navegador e 3 provas de comando inteiro.
Sem as provas de stack, os literais das doors 1, 3, 4, 5 e 6 e os status da `Surface` ficariam sem
prova nenhuma: `pnpm verify` verde não os distingue de um repositório que só tem documentação, e o
`compose.yaml` de desenvolvimento continua passando com a borda inteira ausente.

## Swept

- validation: C2
- failure modes: C17, C27
- idempotency: C14
- authorization: C35, C36
- concurrency: n/a - nenhuma escrita concorrente nova: o backup é um timer único no servidor e o
  restore usa projeto Compose próprio, sem tocar a stack de origem
- data lifecycle: C18, C20
- dependency failure: C17, C30
- state transitions: C1
- observability: C9, C16, C29, C30, C31

## Handoff

**A base da feature é `4fcc4ad`**, o commit que escreveu o plano (`docs(specs): write the operacao plan
over d8f2abf`) e o `HEAD` em 2026-10-18. A C50 compara contra ela e o Verifier desta feature usa
`4fcc4ad..HEAD`; nenhum código desta feature existe ainda.

Size, com a aritmética (`wc -c` nos arquivos que cada slice lê e escreve, dividido por 4; arquivos
novos entram com o tamanho estimado pelo que o check exige):

- S1 = ~158 KB -> ~40k: `compose.yaml` 4,0 + `compose.prod.yaml` ~3,0 + `deploy/Caddyfile` ~2,0 +
  `apps/web/src/proxy.ts` 1,7 + `apps/web/src/app/login/page.tsx` 0,3 +
  `apps/web/src/app/login/two-factor/page.tsx` 0,3 + `apps/web/e2e/csp.spec.ts` ~5,0 +
  `apps/web/e2e/support/fake-api.ts` 9,9 + `apps/web/e2e/login.spec.ts` 3,7 +
  `tests/stack/compose.test.ts` 83,7 + `tests/stack/support.ts` 4,3 +
  `tests/stack/production.test.ts` ~40
- S2 = ~42 KB -> ~10k: `deploy/backup.sh` ~5,0 + `deploy/systemd/academia-backup.timer` e
  `.service` ~1,5 + `tests/stack/backup.test.ts` ~35
- S3 = ~6 KB -> ~2k: `deploy/restore.sh` ~6,0 (o `tests/stack/backup.test.ts` já entrou na S2)
- S4 = ~33 KB -> ~8k: `deploy/monitoring/` cinco arquivos ~5,0 + `deploy/deploy.sh` ~1,5 +
  `deploy/render.sh` ~1,0 + `tests/stack/monitoring.test.ts` ~25
- S5 = ~31 KB -> ~8k: `apps/web/src/app/api/[...path]/route.ts` ~2,0 + `deploy/README.md` ~7,0 +
  `.env.example` 2,4 + `tests/repo/repo.test.ts` 15,7 + `.github/workflows/ci.yml` 0,5 +
  `Dockerfile` 0,8 + `apps/api/src/configure-app.ts` 1,3 + `apps/api/src/health.controller.ts` 1,2
- documentos = ~186 KB -> ~46k: `plan.md` 34,2 + este `checks.md` 51,2 + `.specs/STATE.md` 87,7 +
  `.specs/LESSONS.md` 12,6
- soma: 40 + 10 + 2 + 8 + 8 + 46 = **~114k**, abaixo do orçamento de 150k (o padrão, sem declaração
  em `AGENTS.md`/`CLAUDE.md`)
- Mechanism: **um builder** (a soma cabe no orçamento; nenhuma pergunta de mecanismo). A ordem é S1,
  S2, S3, S4, S5, e a base é `4fcc4ad`.

Notas para o builder:

- **o digest do `caddy` foi decidido pela revisão antes da S1**: o literal da door 1, do `plan.md`,
  da AD-083 e da C52 é `sha256:685ae3d7c34d9b5f8caeddc5d14051db7bbd88ff1f5a2fa0c16bd8ca328fb7af`,
  o digest que o registro devolve para `caddy:2.11.7`. As quatro imagens Prometheus foram
  conferidas em 2026-10-18 e batem com os literais da door 6.
- **o `.env.example` ganha as sete chaves de produção antes da S1**: `prepareStack` do
  `tests/stack/support.ts` copia `.env.example` para o `.env` do clone, e o `config` da stack de
  produção falha sem as chaves. A C49 é essa prova.
- **a stack de produção é uma stack a mais**: cada arquivo novo de `tests/stack` sobe a sua própria
  stack (clone limpo, projeto e portas próprios, `SITE_ADDRESS=localhost`, CA interna do `caddy`), com
  `beforeAll` de 1.200.000 ms como os três `describe` existentes, e roda fora do `pnpm verify` (o
  `pnpm test:stack` inclui os arquivos novos automaticamente).
- **a C13 e a C34 são provas de comando inteiro**: nenhum caso isolado conclui as duas; só a C34 gera
  o aviso de "proof sem seletor" do `validate_checks.py`, e o aviso fica, como o da C3 da
  `armazenamento-rustfs`.
- **a AC 41 não mede modo em disco na suíte**: o host de desenvolvimento é Windows e o volume montado
  não devolve o modo gravado; a C41 prova o mecanismo (git e scripts), e o drill no servidor, no
  `deploy/README.md`, confere o modo real.
- **os scripts `deploy/*.sh` são POSIX**: a prova roda `bash deploy/<script>.sh` contra a stack de
  pé; no Windows o `bash` do PATH é o launcher do WSL e pode não alcançar o Docker do host - se
  esbarrar nisso, o script roda num container de teste com o socket montado, e este `## Handoff`
  registra o mecanismo.
- **o `504` da `Surface` é o do `web`** (route handler de `/api/*` com a `api` pendurada); a borda
  responde `502` nas falhas dela mesma, como o experimento de 2026-10-18 mostrou. Se a revisão
  quiser mudar isso, é mudança de plano (door 1), não de check.
- **o Verifier é disparado depois do último commit desta feature**, sobre `4fcc4ad..HEAD`, com os 56
  checks e `Profile: standard`.
