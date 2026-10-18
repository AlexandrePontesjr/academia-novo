# Operação verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 4fcc4ad..HEAD
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Verificação independente sobre `4fcc4ad..HEAD` (`HEAD` = `68953ac`; a feature são `653f807`, `49d382c`,
`ac50348` e `68953ac`), com os 56 checks de `.specs/features/operacao/checks.md` e `Profile: standard`.
Li `references/verify.md`, `plan.md`, `checks.md`, as AD-083 a AD-089 do `STATE.md` e o diff inteiro de
`4fcc4ad..HEAD` (30 arquivos, 3.471 linhas de diff) antes de julgar. Rodei todas as provas `Proof:` em
`HEAD`, uma invocação por alvo, com cada nome de teste aparecendo individualmente na saída (`--reporter=verbose`
no vitest; reporter `list` do Playwright). Localizei uma ou duas asserções por check, recompute o join de
`Coverage` a partir da autoridade do plano, julguei as seis linhas de `Test policy` e injetei cinco falhas
de comportamento num `git worktree` separado, todas mortas pela prova mais estreita. `git status --porcelain`
da árvore real era `?? CLAUDE.md` antes e depois; nenhuma escrita fora de `.specs/features/operacao/verification.md`
e da worktree de `%TEMP%`, nenhum `git stash`, nenhum commit.

## Binding sources

O plano não marca fonte como binding e o passo 1 do Verify é `ui`; sob `standard` ele não roda. Ainda
assim comparei os 56 checks com o `Landing` (doors 1 a 7), o `Surface` (3 linhas, status `308`, `413`,
`502`/`504`), o `Relations` (`None`) e a `Observable` do plano: nenhuma contradição de decisão. O único
ajuste de autoridade é o site `http://{$SITE_ADDRESS}` acrescentado ao `Caddyfile` durante o Build para
produzir o `Location` com o porto publicado; está declarado no `## Handoff` e é julgado abaixo.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| nenhuma fonte binding no plano (passo 1 é `ui`) | n/a | - | - |

## Checks

Provas rodadas em `HEAD` (`68953ac`), uma invocação por alvo, cada teste nomeado na saída (`%TEMP%\operacao-verify\*.log`):

- `production.test.ts`: `pnpm --filter "@academia/stack-tests" exec vitest run production.test.ts --reporter=verbose` - **19/19 passed**, exit 0 (C1-C9, C35-C39, C43-C45, C52)
- `backup.test.ts`: `pnpm --filter "@academia/stack-tests" exec vitest run backup.test.ts --reporter=verbose` - **17/17 passed**, exit 0 (C14-C27, C42, C47, C55, C56)
- `monitoring.test.ts`: `pnpm --filter "@academia/stack-tests" exec vitest run monitoring.test.ts --reporter=verbose` - **7/7 passed**, exit 0 (C28-C33, C48)
- `repo.test.ts`: `pnpm --filter "@academia/repo-tests" exec vitest run repo.test.ts --reporter=verbose` - **28/28 passed**, exit 0 (C19, C40-C42, C46, C49, C51-C54)
- `csp.spec.ts`: `pnpm --filter "@academia/web" exec playwright test e2e/csp.spec.ts` - **3/3 passed**, exit 0 (C10-C12)
- `compose.test.ts`: `pnpm --filter "@academia/stack-tests" exec vitest run compose.test.ts` (arquivo inteiro, sem `-t`) - **30/30 passed**, exit 0, 1.214 s (C13)
- `pnpm audit --prod --audit-level high` - exit 0, 1 vulnerabilidade `moderate` (C34)
- `git diff --name-only 4fcc4ad..HEAD -- apps/api/src packages/contracts packages/database/migrations pnpm-lock.yaml` - saída vazia, exit 0 (C50)

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `up -d --wait` sai 0; `caddy`, `web`, `api`, `postgres`, `storage`, `prometheus`, `alertmanager`, `node-exporter` e `blackbox-exporter` em `healthy`, `migrate` e `storage-init` em `exited` `0` | production, `-t "prod_up_wait_exits_zero_with_every_service_in_the_expected_state"` (19/19) | `tests/stack/production.test.ts:93` `expect(deployed.status, deployed.output.slice(-8000)).toBe(0)`; `:108` `expect(of(name)?.Health, name).toBe('healthy')`; `:111-112` `expect(of(name)?.State, name).toBe('exited')` e `expect(of(name)?.ExitCode, name).toBe(0)` | PASS |
| C2 | `config` sai != 0 citando a variável nos dez casos (5 variáveis ausentes e vazias) | production, `-t "prod_config_refuses_each_missing_and_empty_production_variable"` | `tests/stack/production.test.ts:125` `variables = ['SITE_ADDRESS', 'ACME_EMAIL', 'ALERT_WEBHOOK_URL', 'BACKUP_DIR', 'POSTGRES_PASSWORD']`; `:137-138` `expect(result.status, ...).not.toBe(0)` e `expect(result.output, ...).toContain(variable)` | PASS |
| C3 | `GET http://localhost:<porta>/` responde `308` com `Location` igual a `https://localhost:<porta>/` | production, `-t "prod_http_redirects_to_https_with_308"` | `tests/stack/production.test.ts:149` `expect(response.status).toBe(308)`; `:150` `expect(response.headers.get('location')).toBe(\`https://localhost:${stack.ports.CADDY_HTTPS_PORT}/\`)` | PASS |
| C4 | `/login` responde 200 com HSTS `max-age=31536000`, `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` literal e sem `X-Powered-By`/`Server` | production, `-t "prod_login_serves_the_edge_security_headers_and_hides_server_identity"` | `tests/stack/production.test.ts:157-162` `expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000')` e os outros três `toBe(<literal>)`; `:163-164` `expect(response.headers.get('x-powered-by')).toBeNull()` e `get('server')` `toBeNull()` | PASS |
| C5 | Só o `caddy` publica `host_ip` fora de `127.0.0.1` (duas portas); `web`, `api`, `postgres` e `storage` publicam em `127.0.0.1` | production, `-t "prod_only_caddy_publishes_ports_and_every_other_port_is_on_loopback"` | `tests/stack/production.test.ts:171-172` `expect(caddyPorts).toHaveLength(2)` e `expect(port.host_ip).not.toBe('127.0.0.1')`; `:177` `expect(port.host_ip, name).toBe('127.0.0.1')` | PASS |
| C6 | `Caddyfile` com upstream único `web:3000` e sem `api:3001`; `/health` responde 404 (não o da API); `/api/students` sem sessão responde 401 `problem+json` | production, `-t "prod_web_is_served_only_through_caddy_and_api_is_not_exposed"` | `tests/stack/production.test.ts:183-185` `expect(upstreams).toEqual(['web:3000'])` e `expect(caddyfile).not.toContain('api:3001')`; `:191` `expect(health.status).toBe(404)`; `:195-196` `expect(anonymous.status).toBe(401)` e `content-type` casa `^application/problem\+json\b` | PASS |
| C7 | `POST /api/students/<id>/photo` com 7 MB responde 413 da borda, corpo não `problem+json`, sem `requestId`, e a contagem de linhas de `logs api` não muda | production, `-t "prod_oversized_upload_is_refused_at_the_edge_with_413_and_never_reaches_the_api"` | `tests/stack/production.test.ts:202` `expect(stack.compose('stop api').status).toBe(0)`; `:215-217` `expect(response.status).toBe(413)`, `not.toMatch(/application\/problem\+json/)` e `not.toMatch(/requestId/i)`; `:219` `expect(after, 'a api recebeu uma requisição').toBe(before)`; `:222-224` linha de acesso do `caddy` encontrada com `expect(entry!.status).toBe(413)` | PASS |
| C8 | `X-Forwarded-For: 203.0.113.7` forjado não chega a `audit_logs.ip`; `ip` igual ao `client_ip` do log de acesso do `caddy` | production, `-t "prod_forged_x_forwarded_for_never_reaches_the_audit_ip"` | `tests/stack/production.test.ts:254-255` `expect(ip).toMatch(/\S/)` e `expect(ip).not.toBe('203.0.113.7')`; `:261` `expect(ip).toBe(entry!.request!.client_ip)` | PASS |
| C9 | Log de acesso do `caddy` é JSON; `request.uri` sem `q`/`sig`; `Cookie` e `Authorization` com `REDACTED` | production, `-t "prod_access_log_is_json_and_redacts_query_and_credentials"` | `tests/stack/production.test.ts:275-279` `expect(uri).toContain('keep=1')`, `not.toContain('assinatura-secreta')`, `not.toMatch(/[?&]sig=/)`, `not.toMatch(/[?&]q=/)`; `:280-281` `expect(entry!.request!.headers?.Cookie).toBe('REDACTED')` e `Authorization` idem | PASS |
| C10 | CSP literal da door 2 na resposta de `/login` e todo `<script>` inline com exatamente o nonce do cabeçalho | csp, `-g "csp_header_carries_a_nonce_that_every_inline_script_reuses"` (3/3) | `apps/web/e2e/csp.spec.ts:26` `policyWith` reproduz a política literal; `:35` `expect(policy).toBe(policyWith(nonce))`; `:37-38` `expect(nonces.length).toBeGreaterThan(0)` e `for (const value of nonces) expect(value).toBe(nonce)` | PASS |
| C11 | Duas requisições seguidas a `/login` e duas a `/login/two-factor` têm nonces diferentes em cada par | csp, `-g "two_requests_get_two_different_nonces_on_both_login_pages"` | `apps/web/e2e/csp.spec.ts:43-45` `const first = nonceOf(policyOf(await page.goto(path))); const second = ...; expect(first, path).not.toBe(second)` | PASS |
| C12 | Chromium abre `/login`, entra e abre `/students` com zero `securitypolicyviolation` e as duas telas renderizam | csp, `-g "chromium_opens_login_and_students_without_csp_violations"` | `apps/web/e2e/csp.spec.ts:69` `expect(await visit('/login')).toEqual([])`; `:70` heading `Entrar` visível; `:80` `expect(await violations()).toEqual([])`; `:83-84` `expect(await visit('/students')).toEqual([])` e heading `Alunos` visível | PASS |
| C13 | `docker compose up --build --wait` do clone de desenvolvimento continua saindo 0 e `compose.test.ts` inteiro segue verde | compose, arquivo inteiro sem `-t` (30/30) | `tests/stack/compose.test.ts:128-133` asserção do `entrypoint` do `storage-init` atualizada para a door 4; `:1519` CPF do caso de check-in passou a `168.995.350-09` (o antigo `987.654.321-00` colidia com `:590` do caso de foto); execução: `Test Files 1 passed (1)`, `Tests 30 passed (30)`, exit 0 | PASS |
| C14 | `storage-init` sobre bucket existente sem versionamento habilita `Status=Enabled`, sai 0; segunda execução sai 0 | backup, `-t "prod_storage_init_enables_versioning_on_an_existing_bucket_and_is_idempotent"` (17/17) | `tests/stack/backup.test.ts:222` `expect(aws('s3api create-bucket ...').status).toBe(0)`; `:225-226` `expect(first.status, first.output).toBe(0)` e `expect(versioningOf(name)).toBe('Enabled')`; `:230-231` `expect(second.status, ...).toBe(0)` e `expect(versioningOf(name)).toBe('Enabled')` | PASS |
| C15 | `bash deploy/backup.sh` grava `db/academia-<data>.dump` em `pg_dump -Fc` listável e cada objeto em `objects/<data>/<chave>` com o mesmo SHA-256 do bucket | backup, `-t "prod_backup_dump_lists_and_objects_match_the_bucket_sha256"` | `tests/stack/backup.test.ts:246` `expect(backup.status, backup.output).toBe(0)`; `:250-252` `expect(dumps).toHaveLength(1)` e `expect(dumps[0]).toMatch(/^academia-\d{4}-\d{2}-\d{2}T\d{6}Z\.dump$/)`; `:256` `expect(listed.status).toBe(0)` após `pg_restore --list`; `:266` `expect(sha256(readFileSync(local)), key).toBe(sha256(objectOf(key)))` | PASS |
| C16 | `metrics/backup.prom` existe de forma atômica com `backup_last_success_timestamp_seconds` do instante e `backup_dump_bytes` do dump | backup, `-t "prod_backup_writes_atomic_metrics_with_timestamp_and_dump_bytes"` | `tests/stack/backup.test.ts:284-286` `expect(timestamp).toBeGreaterThanOrEqual(startedAt)`, `toBeLessThanOrEqual(finishedAt)`, `expect(bytes).toBe(statSync(...).size)`; `:289` `expect(readdirSync(.../metrics)).toEqual(['backup.prom'])` | PASS |
| C17 | `pg_dump` e cópia falhando: script sai != 0, apaga o parcial e mantém o marcador anterior | backup, `-t "prod_backup_failure_exits_nonzero_removes_partial_and_keeps_the_previous_marker"` | `tests/stack/backup.test.ts:299-303` `expect(brokenDump.status).not.toBe(0)`, `expect(readdirSync(...).filter(.partial)).toEqual([])`, `expect(readFileSync(markerPath, 'utf8')).toBe(before)`; `:307-310` idem para a cópia (`S3_BUCKET` inexistente) | PASS |
| C18 | Backups de mais de 30 dias são apagados; os 30 mais recentes ficam | backup, `-t "prod_backup_retention_keeps_the_thirty_most_recent_days"` | `tests/stack/backup.test.ts:338-341` `expect(existsSync(join(objects, old)), 'backup de 31 dias').toBe(false)`, `...kept...toBe(true)`, `expect(existsSync(oldDump), 'dump de 31 dias').toBe(false)`, `expect(existsSync(keptDump), 'dump de 29 dias').toBe(true)` | PASS |
| C19 | Timer `OnCalendar=*-*-* 03:00:00 America/Sao_Paulo` + `Persistent=true` dispara o service que executa `backup.sh` | repo, `-t "systemd_units_run_the_backup_at_three_sao_paulo_persistently"` (28/28) | `tests/repo/repo.test.ts:437` `expect(timer).toContain('OnCalendar=*-*-* 03:00:00 America/Sao_Paulo')`; `:438` `expect(timer).toMatch(/^Persistent=true$/m)`; `:439` `toContain('academia-backup.service')`; `:442` `expect(service).toContain('deploy/backup.sh')` | PASS |
| C20 | `$BACKUP_DIR` tem só `db/`, `objects/` e `metrics/`, e nenhum arquivo contém `.env` nem os cinco segredos | backup, `-t "prod_backup_directory_has_only_db_objects_and_metrics_without_secrets"` | `tests/stack/backup.test.ts:351` `expect(readdirSync(stack.backupDir).sort()).toEqual(['db', 'metrics', 'objects'])`; `:363` `expect(files.filter((file) => file.endsWith('.env'))).toEqual([])`; `:373-377` `expect(secrets).toHaveLength(5)` e `for (const secret of secrets) expect(content.includes(secret), file).toBe(false)` | PASS |
| C21 | `restore.sh <dump> --project academia-restore` cria projeto próprio (portas e volumes próprios), restaura, sobe, sai 0, sem parar a produção | backup, `-t "prod_restore_rebuilds_a_clean_project_without_touching_production"` | `tests/stack/backup.test.ts:463` `expect(restored.status, restored.output.slice(-8000)).toBe(0)`; `:468-472` os quatro serviços `expect(of(service)?.Health, service).toBe('healthy')`, `migrate` `exited`/`0`; `:480-486` portas publicadas iguais às da restauração e volumes `academia-restore_postgres-data`/`_rustfs-data`; `:491` `expect(production.status).toBe(200)` | PASS |
| C22 | Stack restaurada: `GET /health` 200 com `checks` `{ database: 'up', storage: 'up' }` | backup, `-t "prod_restored_stack_health_reports_database_and_storage_up"` | `tests/stack/backup.test.ts:497-498` `expect(health.status).toBe(200)` e `expect(await health.json()).toMatchObject({ checks: { database: 'up', storage: 'up' } })` | PASS |
| C23 | Stack restaurada: login de usuário anterior ao backup 200 e ficha com a observação de saúde decifrada | backup, `-t "prod_restored_login_and_decrypted_health_notes"` | `tests/stack/backup.test.ts:503` `loginOn(origin, receptionEmail, receptionPassword)` (que afirma `expect(login.status, ...).toBe(200)` em `:106`); `:506-507` `expect(ficha.status).toBe(200)` e `expect(healthNotes).toBe(studentHealth)` | PASS |
| C24 | Stack restaurada: foto `large` responde 200 e o SHA-256 do corpo é o do objeto no backup | backup, `-t "prod_restored_photo_matches_the_backed_up_object_sha256"` | `tests/stack/backup.test.ts:520` `expect(file.status).toBe(200)`; `:527-528` `expect(backedUp, 'objeto large no backup').toBeDefined()` e `expect(sha256(bytes)).toBe(sha256(readFileSync(backedUp!)))` | PASS |
| C25 | Objeto apagado: versão recuperada por `get-object --version-id`; `GET` volta a 200 com o mesmo conteúdo | backup, `-t "prod_deleted_object_is_recovered_from_a_version_and_served_again"` | `tests/stack/backup.test.ts:545-547` `delete-object` 0 e `GET` 404; `:557-558` versão anterior e marcador de exclusão com `toMatch(/\S/)`; `:564-565` `get-object ... --version-id ${previous}` 0 e `expect(sha256(readFileSync(recuperado))).toBe(sha256(beforeBytes))`; `:570-572` `GET` 200 e o mesmo SHA-256 | PASS |
| C26 | Drill usa dump com menos de 24 h e termina em menos de 4 h | backup, `-t "prod_restore_drill_uses_a_dump_younger_than_24h_and_finishes_under_4h"` | `tests/stack/backup.test.ts:589-590` `expect(age).toBeGreaterThanOrEqual(0)` e `expect(age).toBeLessThan(24 * 60 * 60 * 1000)`; `:591-592` `expect(restoreDurationMs).toBeGreaterThan(0)` e `toBeLessThan(4 * 60 * 60 * 1000)` (medido na C21) | PASS |
| C27 | Dump truncado: `restore.sh` sai != 0 e a stack de origem continua intacta | backup, `-t "prod_restore_refuses_a_truncated_dump_and_leaves_the_origin_intact"` | `tests/stack/backup.test.ts:607-608` `expect(result.status, 'dump truncado').not.toBe(0)` e `not.toBeNull()`; `:611` `expect(production.status).toBe(200)`; `:613` `expect(...web...State ?? 'ausente').not.toBe('running')` | PASS |
| C28 | Readies do Prometheus e do Alertmanager 200; os alvos `caddy` e `node` com `up` 1; as sondas `blackbox-web` e `blackbox-api` com `probe_success` 1 | monitoring, `-t "prod_observability_readies_targets_and_probes_are_up"` (7/7) | `tests/stack/monitoring.test.ts:89-90` `expect(await ready(.../-/ready)).toBe(200)` para os dois; `:95-101` `targets.length === 2 && targets.every(...value?.[1] === '1')` e as duas sondas `probe_success` idem | PASS |
| C29 | Seis regras com os limiares literais; `promtool check rules` e `promtool test rules` saem 0 | monitoring, `-t "prod_alert_rules_match_the_six_literals_and_promtool_accepts_them"` | `tests/stack/monitoring.test.ts:111-125` os quinze literais (`alert: CaddyDown`..`> 0.05`, incluindo `time() - backup_last_success_timestamp_seconds > 93600` e `< 15`); `:133` `expect(check.status, check.output).toBe(0)`; `:137` idem para `test rules` | PASS |
| C30 | `api` parada: `ApiHealthDegraded` fica `firing` em até 5 min e o webhook recebe JSON `status: firing` com o label | monitoring, `-t "prod_stopped_api_fires_and_delivers_api_health_degraded"` | `tests/stack/monitoring.test.ts:141` `expect(stack.compose('stop api').status).toBe(0)`; `:146` `ALERTS{alertname="ApiHealthDegraded",alertstate="firing"}` com `length === 1`; `:153-154` `expect(delivery, 'payload do Alertmanager').toBeDefined()` e `expect(delivery!.status).toBe('firing')` | PASS |
| C31 | `backup.prom` com 27 h: `BackupStale` dispara na avaliação seguinte | monitoring, `-t "prod_backup_stale_fires_with_a_marker_twenty_seven_hours_old"` | `tests/stack/monitoring.test.ts:169` marker gravado com `Math.floor(Date.now() / 1000) - 27 * 60 * 60`; `:176` `ALERTS{alertname="BackupStale",alertstate="firing"}` com `length === 1` | PASS |
| C32 | Observabilidade sem porta fora de `127.0.0.1`; métricas do `caddy` no `:9180` interno e não no site público | monitoring, `-t "prod_monitoring_ports_stay_on_loopback_and_caddy_metrics_are_internal"` | `tests/stack/monitoring.test.ts:186` `expect(port.host_ip, name).toBe('127.0.0.1')`; `:189` `expect(services[name]?.ports ?? [], name).toEqual([])` para node/blackbox; `:195-196` `expect(internal.status).toBe(0)` e `expect(internal.output).toContain('200 true')`; `:199-200` site público `not.toBe(200)` e sem `caddy_http` | PASS |
| C33 | `deploy.sh` renderiza `alertmanager.yml` do `.tmpl` substituindo `ALERT_WEBHOOK_URL`; `amtool check-config` sai 0 | monitoring, `-t "prod_deploy_renders_alertmanager_config_and_amtool_accepts_it"` | `tests/stack/monitoring.test.ts:205` `expect(deploy.status, ...).toBe(0)`; `:210-211` `expect(rendered).toContain(sinkUrl())` e `not.toContain('__ALERT_WEBHOOK_URL__')`; `:216` `expect(checked.status, checked.output).toBe(0)` | PASS |
| C34 | `pnpm audit --prod --audit-level high` sai 0, sem `high`/`critical` | comando inteiro | saída: `1 vulnerabilities found` / `Severity: 1 moderate` / exit `0` (log `%TEMP%\operacao-verify\c50-c34.log`) | PASS |
| C35 | `/api/students` sem sessão 401 `problem+json`; `/api/staff` com sessão `reception` 403 `problem+json` | production, `-t "prod_anonymous_api_is_401_and_reception_on_staff_is_403_with_problem_json"` | `tests/stack/production.test.ts:331-332` `expect(anonymous.status).toBe(401)` e `content-type` casa `^application/problem\+json\b`; `:341-342` `expect(forbidden.status).toBe(403)` e o mesmo `content-type` | PASS |
| C36 | Sexto login falho do mesmo e-mail em 15 min: 429 `too_many_attempts` e `Retry-After` positivo | production, `-t "prod_sixth_failed_login_in_fifteen_minutes_is_429_with_retry_after"` | `tests/stack/production.test.ts:355-356` cinco tentativas `expect((await attempt()).status).toBe(401)`; `:359-362` `expect(sixth.status).toBe(429)`, `expect(retryAfter).toBeGreaterThan(0)` e `expect(code).toBe('too_many_attempts')` | PASS |
| C37 | Corpo inválido em `/api/auth/login`: 422 `validation_failed` | production, `-t "prod_invalid_login_body_is_422_validation_failed"` | `tests/stack/production.test.ts:372-373` `expect(response.status).toBe(422)` e `expect((await response.json()).code).toBe('validation_failed')` | PASS |
| C38 | TLS 1.2/1.3 aceitos, 1.0/1.1 recusados; cookie de sessão com `Secure`, `HttpOnly`, `SameSite=Lax` | production, `-t "prod_edge_accepts_tls_12_and_13_and_refuses_tls_10_and_11"` + `-t "prod_login_cookie_is_secure_httponly_and_samesite_lax"` | `tests/stack/production.test.ts:398-405` `expect(accepted.ok).toBe(true)` para TLS 1.2/1.3 e `expect(refused.ok).toBe(false)` para TLS 1.0/1.1; `:426-428` `expect(sessionCookie).toContain('Secure')`, `toContain('HttpOnly')` e `toMatch(/SameSite=Lax/i)` | PASS |
| C39 | `TRACE` em `https://localhost:<porta>/` responde 405 | production, `-t "prod_trace_is_refused_with_405"` | `tests/stack/production.test.ts:451` `expect(status).toBe(405)` (o `httpsRequest` usa `method: 'TRACE'` em `:439`) | PASS |
| C40 | README com os cinco passos do runbook e a matriz OWASP de dez categorias com controle e prova, sem célula vazia | repo, `-t "deploy_readme_documents_the_runbook_and_the_owasp_matrix"` | `tests/repo/repo.test.ts:467-473` os cinco títulos (`A primeira subida`, `Atualizar a homologação`, `drill de restauração`, `Responder a um alerta`, `Rollback`); `:476` `toContain('WEB_ORIGIN')`; `:480-486` `expect(rows).toHaveLength(10)` e `cells[1]`/`cells[2]`/`cells[3]` não vazios | PASS |
| C41 | `.env` fora do git (`check-ignore` 0); `deploy.sh` fixa `0600`, `backup.sh` fixa `0700` e `0600`; README repete os três modos | repo, `-t "deploy_artifacts_fix_the_seven_hundred_and_six_hundred_permissions"` | `tests/repo/repo.test.ts:490-491` `expect(ignored.status, ignored.stderr).toBe(0)`; `:494` `expect(read('deploy/deploy.sh')).toMatch(/chmod 600 \.env/)`; `:498-500` `toContain('install -d -m 700')`, `toContain('install -m 600')`, `toContain('umask 077')`; `:504-508` README com `stat -c '%a'`, `0600` e `0700` | PASS |
| C42 | `restore.sh` exige `DATA_ENCRYPTION_KEY` e falha sem ela; README lista as seis cópias e marca a perda da chave como irreversível | backup, `-t "prod_restore_requires_the_data_encryption_key"` + repo, `-t "deploy_readme_lists_the_off_server_secrets_and_the_irreversible_key"` | `tests/stack/backup.test.ts:618` `delete env.DATA_ENCRYPTION_KEY`; `:625-626` `expect(result.status).not.toBe(0)` e `expect(result.output).toContain('DATA_ENCRYPTION_KEY')`; `tests/repo/repo.test.ts:515-523` as seis chaves no README; `:527` `expect(readme).toMatch(/DATA_ENCRYPTION_KEY[^\n]*irreversível/)` | PASS |
| C43 | Com sessão válida, `/.git/config`, `/package.json`, `/.env` e `/.env.example` respondem 404 sem o conteúdo | production, `-t "prod_repository_files_are_404_even_with_a_session"` | `tests/stack/production.test.ts:464` `expect(response.status, path).toBe(404)` para os quatro caminhos; `:466-469` `not.toContain('AUTH_SECRET')`, `not.toContain('"private"')`, `not.toContain('POSTGRES_USER')`, `not.toContain('[core]')` | PASS |
| C44 | `web` parado: `GET /login` responde 502 da borda | production, `-t "prod_returns_502_from_the_edge_when_web_is_stopped"` | `tests/stack/production.test.ts:285` `expect(stack.compose('stop web').status).toBe(0)`; `:288` `expect(response.status).toBe(502)` | PASS |
| C45 | `api` pausada > 10 s: `/api/dashboard` responde 504 `problem+json` do route handler do `web`, repassado pela borda | production, `-t "prod_relays_the_504_of_the_web_route_when_the_api_hangs"` | `tests/stack/production.test.ts:296` `pause api`; `:299` espera 11 s; `:302-304` `expect(response.status).toBe(504)`, `content-type` `^application/problem\+json\b` e `expect(code).toBe('gateway_timeout')` | PASS |
| C46 | `deploy.sh` tem `set -euo pipefail`, chama `deploy/render.sh` e executa exatamente o `docker compose -f compose.yaml -f compose.prod.yaml up -d --wait` | repo, `-t "deploy_script_renders_then_runs_the_overlay_up_wait"` | `tests/repo/repo.test.ts:354` `toContain('set -euo pipefail')`; `:355` `toMatch(/deploy\/render\.sh/)`; `:357` `toMatch(/^docker compose -f compose\.yaml -f compose\.prod\.yaml up -d --wait$/m)` | PASS |
| C47 | `aws-cli` do overlay: imagem da door 5, `AWS_ENDPOINT_URL`, credenciais, `us-east-1`, `S3_BUCKET`, volume `${BACKUP_DIR}:/backup` | backup, `-t "prod_aws_cli_service_resolves_the_door_five_literal"` | `tests/stack/backup.test.ts:399` `expect(awsCli.image).toBe(AWS_CLI_IMAGE)`; `:400-404` `expect(environment?.AWS_ENDPOINT_URL).toBe('http://storage:9000')`, credenciais iguais às do `.env`, `'us-east-1'`, `S3_BUCKET`; `:405-406` volume com `target === '/backup'` e `source` igual a `stack.backupDir` | PASS |
| C48 | Quatro imagens de observabilidade por tag e digest, iguais aos literais da door 6 | monitoring, `-t "prod_monitoring_images_are_pinned_by_tag_and_digest"` | `tests/stack/monitoring.test.ts:222-224` `expect(services[name]?.image, name).toBe(image)` para as quatro e `toMatch(/^[^:]+:[^@]+@sha256:[0-9a-f]{64}$/)` | PASS |
| C49 | `.env.example` lista as sete chaves de produção, cada uma com valor; `env_example_lists_every_required_key` segue verde | repo, `-t "env_example_lists_every_production_key"` + suíte repo inteira (28/28, inclui o caso antigo) | `tests/repo/repo.test.ts:540-549` as sete chaves com `expect(listed.get(key), ...).toMatch(/\S/)`; o caso `env_example_lists_every_required_key` aparece como `✓` na execução completa | PASS |
| C50 | `git diff --name-only 4fcc4ad..HEAD` vazio para `apps/api/src`, `packages/contracts`, `packages/database/migrations` e `pnpm-lock.yaml` | comando inteiro | saída vazia, exit `0` (log `%TEMP%\operacao-verify\c50-c34.log`); `git diff --name-status` da feature não lista nenhum desses caminhos | PASS |
| C51 | `.github/workflows/ci.yml` com um único job `verify`, passo `pnpm verify`, sem job de deploy/stack | repo, `-t "ci_runs_only_pnpm_verify_and_no_deploy_job"` | `tests/repo/repo.test.ts:558` `expect(Object.keys(workflow.jobs)).toEqual(['verify'])`; `:560` `expect(commands).toContain('pnpm verify')`; `:561` o filtro por `docker`, `deploy` e `test:stack` devolve `[]` | PASS |
| C52 | Serviço `caddy` do overlay e `Caddyfile` resolvem a door 1 (imagem, duas portas, volumes, healthcheck, opções globais, sites `:9180` e `{$SITE_ADDRESS}`, cabeçalhos, `max_size 6MB`, `@trace`/405, `reverse_proxy web:3000` sem `trusted_proxies`, log com `format filter` e `q`/`sig`) | production, `-t "prod_caddy_service_resolves_the_door_one_literal"` + repo, `-t "caddyfile_matches_the_door_one_literal"` | `tests/stack/production.test.ts:315` `expect(caddy?.image).toBe(CADDY_IMAGE)`; `:317-320` portas publicadas iguais a `${CADDY_HTTP_PORT}:80`/`${CADDY_HTTPS_PORT}:443`; `:320-325` `caddy-data:/data` e `caddy-config:/config`; `:326` healthcheck `['CMD', 'curl', '-fsS', 'http://127.0.0.1:2019/config/']`; `tests/repo/repo.test.ts:364-368` opções globais nas próprias linhas + `:9180 {`; `:369` `toContain('{$SITE_ADDRESS}')`; `:373-380` os seis cabeçalhos; `:384-392` `max_size 6MB`, `@trace`/`respond @trace 405`, `reverse_proxy web:3000`, `not.toContain('trusted_proxies')`, `format filter`, `delete q`, `delete sig`; `:396` imagem do overlay | PASS |
| C53 | `deploy/monitoring/` com os quatro arquivos e `prometheus.yml` raspando `caddy:9180`, `node-exporter:9100`, `blackbox-exporter:9115` e as sondas `web:3000/login` e `api:3001/health` | repo, `-t "monitoring_files_and_scrape_targets_match_the_door_six_literal"` | `tests/repo/repo.test.ts:446-448` `expect(existsSync(...), file).toBe(true)` para os quatro; `:451-459` os cinco literais em `prometheus.yml` com `toContain` | PASS |
| C54 | `proxy.ts`: nonce por requisição, `x-nonce` e CSP na requisição e na resposta, `'unsafe-eval'` só em `development`, `force-dynamic` nas duas páginas, `style-src 'unsafe-inline'` | repo, `-t "web_proxy_nonce_and_dynamic_pages_match_the_door_two_literal"` | `tests/repo/repo.test.ts:403` `toContain("Buffer.from(crypto.randomUUID()).toString('base64')")`; `:404-406` `set('x-nonce', nonce)`, `requestHeaders.set('Content-Security-Policy'` e `response.headers.set('Content-Security-Policy'`; `:409-423` as dez diretivas, incluindo `'nonce-${nonce}'` e `"style-src 'self' 'unsafe-inline'"`; `:426-427` `NODE_ENV === 'development'` e `" 'unsafe-eval'"`; `:430-432` `force-dynamic` nas duas páginas | PASS |
| C55 | `entrypoint` do `storage-init` mantém `head-bucket` ou `create-bucket` e termina com `put-bucket-versioning --versioning-configuration Status=Enabled` | backup, `-t "prod_storage_init_entrypoint_keeps_the_bucket_and_adds_versioning"` | `tests/stack/backup.test.ts:417-419` `toContain('aws s3api head-bucket --bucket "$$S3_BUCKET" ... create-bucket --bucket "$$S3_BUCKET"')` (o operador `ou` da shell); `:420-422` `toMatch(/aws s3api put-bucket-versioning --bucket "\$\$S3_BUCKET" --versioning-configuration Status=Enabled$/)` | PASS |
| C56 | Objeto anterior ao versionamento sem `VersionId`; posterior ganha `VersionId`; o antigo não é reenviado nem regravado | backup, `-t "prod_versioning_does_not_backfill_existing_objects"` | `tests/stack/backup.test.ts:434` `expect([undefined, 'null']).toContain(oldBefore.VersionId)`; `:435`/`:451` `const etagBefore = oldBefore.ETag` e `expect(oldAfter.ETag).toBe(etagBefore)`; `:440` `expect(versioningOf(name)).toBe('Enabled')`; `:446` `expect(headOf(name, 'photos/main/novo.webp').VersionId, 'objeto posterior').toMatch(/\S/)`; `:450` `expect([undefined, 'null']).toContain(oldAfter.VersionId)` | PASS |

Notas de precisão e de nível, que não reprovam porque o comportamento que cada claim nomeia fica
provado na fronteira (ou no artefato, onde o próprio `checks.md` fixou o nível):

- **C9 (`q`):** a requisição da prova envia `?exp=...&sig=...&keep=1` e **não** envia `q`; a asserção
  `expect(uri).not.toMatch(/[?&]q=/)` (`tests/stack/production.test.ts:279`) é vacuamente verdadeira.
  A remoção do `q` está provada só estaticamente (`delete q` em `deploy/Caddyfile:50`, afirmado em
  `tests/repo/repo.test.ts:391`, prova da C52). O comportamento do `sig` e da redação está provado na
  fronteira (`:277-281`). Fica registrado como lacuna de precisão da C9, não como claim em aberto.
- **C7 (contagem de log):** com a `api` parada a contagem de linhas de `logs api` não pode variar, então
  `expect(after).toBe(before)` (`tests/stack/production.test.ts:219`) é vacuamente verdadeira; o que
  prova "a api recebeu zero pedidos" é o 413 gerado pela borda no `request_body` do Caddy (que aborta
  antes do `reverse_proxy`) mais a linha de acesso do `caddy` com `status: 413` (`:215-224`), não a
  contagem. O mecanismo está declarado no `## Handoff` e a asserção de fronteira é viva (falha 3 abaixo
  derruba o vizinho de status).
- **C52 (site):** `expect(caddyfile).toContain('{$SITE_ADDRESS}')` (`tests/repo/repo.test.ts:369`) casa
  também a linha do site `http://{$SITE_ADDRESS}`; o teste estático não distingue o site HTTPS principal
  do site de redirecionamento. O que identifica a borda real são as provas de fronteira (C3, C4, C6) e o
  healthcheck do `admin` na C52 (`:326`). É lacuna de precisão do teste estático, não do claim.
- **C10/C12 (nível):** a política de CSP e o navegador são provados no build de produção do `web` (suíte
  e2e), não atravessando o `caddy`; o `checks.md` fixa esse nível no item 3 do `## Intent`, e o salto da
  borda é provado em C3/C4/C39. Regitro como escolha de nível declarada.
- **C41 (modo POSIX):** os `0600`/`0700` são provados no artefato (scripts, README e `git check-ignore`),
  não no modo em disco do volume montado no Windows; é o item 4 do `## Intent` e o drill do servidor no
  `deploy/README.md` confere o modo real. Regitro como gap de nível declarado.
- **C29 (limiares):** os literais são afirmados por presença no arquivo; o `for: 2m` e os limiares não
  são amarrados individualmente a cada regra pelo teste estático (só `promtool test rules` exercita
  `CaddyDown`/`WebDown`, via `alerts.test.yml`). A falha 4 injetada mostra que a prova estática mata a
  troca de um limiar; a associação regra↔limiar fica como precisão do teste.
- **C17 e C21-C27 (seletores `-t` e estado compartilhado):** a suíte `backup.test.ts` é um cenário
  sequencial - a C17 lê o `backup.prom` que a C16 deixou, as C22 a C25 dependem da stack restaurada que
  a C21 subiu e a C26 depende de `restoreDurationMs`, medido na C21. Rodar um desses casos isolado com
  `-t` reprova no setup antes de chegar à asserção (na injeção da falha 5, `-t` só da C17 deu
  `ENOENT ... backup.prom`). A prova válida é a invocação do arquivo inteiro, que é a do `## Handoff` e a
  que este Verifier rodou (17/17, com cada nome na saída); o seletor `-t` que o `checks.md` escreveu para
  esses casos não é executável sozinho - lacuna de precisão da notação da prova, sem comportamento sem
  prova.

## Coverage

O join foi recomputado a partir da autoridade de cada conjunto, não lido de volta: as doors 1 a 7 e os
literais do `Landing` (`plan.md:86-96` e AD-083 a AD-089 em `STATE.md`); as três linhas do `Surface`
(`plan.md:76-84`); as AC 1 a 43 do `Criteria` (`plan.md:100-183`); as dezoito linhas da `Observable`
(`plan.md:228-254`); os termos, caminhos e dependências do `Impact` (`plan.md:59-69`); e os nomes de
variável, imagem, volume, sonda, regra e arquivo citados dentro dos literais das doors. Todos os
conjuntos têm linha e nenhum membro ficou sem prova.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| door 1: imagem do `caddy` (1) | `Landing` door 1 / AD-083 | `caddy:2.11.7@sha256:685ae...` C52 (`production.test.ts:315`, `repo.test.ts:396`) | - |
| door 1: portas e volumes do `caddy` (3) | `Landing` door 1 | duas portas `${CADDY_HTTP_PORT:-80}`/`${CADDY_HTTPS_PORT:-443}` C52 (`production.test.ts:317-320`) e C5 (`:171-172`) · `caddy-data:/data` C52 (`:322`) · `caddy-config:/config` C52 (`:323`) | - |
| door 1: healthcheck do `caddy` (1) | `Landing` door 1 | `curl -fsS http://127.0.0.1:2019/config/` C52 (`production.test.ts:326`) e `healthy` C1 (`:108`) | - |
| door 1: opções globais do `Caddyfile` (4) | `Landing` door 1 | `http_port 80` C52 (`repo.test.ts:364-365`) · `https_port 443` idem · `email {$ACME_EMAIL}` idem · `metrics` idem | - |
| door 1: site interno de métricas (1) | `Landing` door 1 | `:9180 { metrics }` C52 (`repo.test.ts:368`) e C32 (`monitoring.test.ts:195-196`) | - |
| door 1: site e cabeçalhos da borda (6) | `Landing` door 1 | site C52 (`repo.test.ts:369`) · HSTS `max-age=31536000` C4 (`production.test.ts:157`) · `nosniff` C4 (`:158`) · `Referrer-Policy` C4 (`:159`) · `Permissions-Policy` C4 (`:160-162`) · `-Server`/`-X-Powered-By` C4 (`:163-164`) | - |
| door 1: corpo e TRACE (2) | `Landing` door 1 | `request_body { max_size 6MB }` C7 (`production.test.ts:215`) e C52 (`repo.test.ts:384-385`) · `@trace`/`respond @trace 405` C39 (`production.test.ts:451`) e C52 (`repo.test.ts:386-387`) | - |
| door 1: rota da aplicação (2) | `Landing` door 1 | `reverse_proxy web:3000` sem `trusted_proxies` C6 (`production.test.ts:183-185`) e C52 (`repo.test.ts:388-389`) · nenhum upstream `api:3001` C6 (`:185`) | - |
| door 1: log de acesso (2) | `Landing` door 1 | JSON com `sig` apagado (`production.test.ts:277-278`) e `q` apagado (`repo.test.ts:391`) C9/C52 · `Cookie`/`Authorization` `REDACTED` C9 (`:280-281`) | - |
| door 1: portas dos outros serviços (4) | `Landing` door 1 | `web`/`api`/`postgres`/`storage` em `127.0.0.1` C5 (`production.test.ts:174-177`) · observabilidade em `127.0.0.1` C32 (`monitoring.test.ts:186-189`) | - |
| door 1: site de redirecionamento HTTP (1) | `Handoff` do `checks.md` (site acrescentado; não está no literal da door) | `http://{$SITE_ADDRESS}` com `redir ... 308` C3 (`production.test.ts:149-150`; `deploy/Caddyfile:19-21`) | - |
| door 2: nonce por requisição (2) | `Landing` door 2 / AD-084 | geração `Buffer.from(crypto.randomUUID()).toString('base64')` C54 (`repo.test.ts:403`) · nonces diferentes entre requisições C11 (`csp.spec.ts:43-45`) | - |
| door 2: `x-nonce` e CSP na requisição (2) | `Landing` door 2 | `set('x-nonce', nonce)` C54 (`repo.test.ts:404`) · `requestHeaders.set('Content-Security-Policy'` C54 (`:405`) | - |
| door 2: CSP na resposta (1) | `Landing` door 2 | C10 igualdade literal (`csp.spec.ts:35`) e C54 (`repo.test.ts:406`) | - |
| door 2: política literal (3) | `Landing` door 2 | dez diretivas C10 (`csp.spec.ts:26,35`) e C54 (`repo.test.ts:409-423`) · `script-src` com `'nonce-...'` e `'strict-dynamic'` C10/C54 · `style-src 'self' 'unsafe-inline'` C54 (`:413`) | - |
| door 2: nonce no documento (1) | `Landing` door 2 | todo `<script>` inline com o nonce do cabeçalho C10 (`csp.spec.ts:36-38`) | - |
| door 2: escape de desenvolvimento (1) | `Landing` door 2 | `'unsafe-eval'` só sob `NODE_ENV === 'development'` C54 (`repo.test.ts:426-427`) | - |
| door 2: renderização dinâmica (2) | `Landing` door 2 | `force-dynamic` nas duas páginas C54 (`repo.test.ts:430-432`) · C11 (nonces diferentes por requisição nas duas) | - |
| door 3: `compose.prod.yaml` e `deploy/` (10) | `Landing` door 3 / AD-085 | `compose.prod.yaml` C1 (`production.test.ts:93`) · `Caddyfile` C52 · `monitoring/` C53 (`repo.test.ts:446-448`) · `backup.sh` C15 · `restore.sh` C21 · `deploy.sh` C46 · `render.sh` C33 · `systemd/` C19 · `README.md` C40 · `.env` `0600` C41 (`repo.test.ts:494`) | - |
| door 3: comando de subida (1) | `Landing` door 3 | `up -d --wait` sai 0 C1 (`production.test.ts:93`) e o comando exato C46 (`repo.test.ts:357`) | - |
| door 4: versionamento (1) | `Landing` door 4 / AD-086 | `put-bucket-versioning ... Status=Enabled` C14 (`backup.test.ts:225-226`) e C55 (`:417-422`) | - |
| door 4: idempotência (1) | `Landing` door 4 | segunda execução sai 0 C14 (`backup.test.ts:230`) | - |
| door 4: recuperação (1) | `Landing` door 4 | `get-object --version-id` C25 (`backup.test.ts:561-565`) | - |
| door 4: sem backfill (1) | `Landing` door 4 e `Impact` stored data | objeto antigo sem `VersionId` e ETag inalterado C56 (`backup.test.ts:434,450-451`) | - |
| door 4: contrato intacto (1) | `Landing` door 4 | nenhum diff em `apps/api/src`/`packages/database/migrations` C50 (saída vazia) | - |
| door 5: `$BACKUP_DIR` e o `aws-cli` (2) | `Landing` door 5 / AD-087 | `${BACKUP_DIR}:/backup` C47 (`backup.test.ts:405-406`) · diretório do host fora dos volumes C15/C16 (`:245,275`) e C41 (`repo.test.ts:498`) | - |
| door 5: dump do banco (1) | `Landing` door 5 | `db/academia-<AAAAMMDDTHHMMSSZ>.dump` com `pg_dump -Fc` listável C15 (`backup.test.ts:250-256`) | - |
| door 5: cópia dos objetos (1) | `Landing` door 5 | `objects/<data>/<chave>` com SHA-256 igual C15 (`backup.test.ts:259-266`) | - |
| door 5: marcador de métricas (1) | `Landing` door 5 | `metrics/backup.prom` atômico C16 (`backup.test.ts:284-289`) | - |
| door 5: retenção (1) | `Landing` door 5 | `BACKUP_RETENTION_DAYS=30` C18 (`backup.test.ts:338-341`) e C49 (`repo.test.ts:545`) | - |
| door 5: timer (1) | `Landing` door 5 | `OnCalendar=...America/Sao_Paulo` + `Persistent=true` C19 (`repo.test.ts:437-438`) | - |
| door 5: restauração em projeto próprio (1) | `Landing` door 5 | `-p academia-restore`, portas e volumes próprios, produção intacta C21 (`backup.test.ts:463-491`) | - |
| door 5: falha da restauração (1) | `Landing` door 5 e AC 27 | dump truncado recusado e origem intacta C27 (`backup.test.ts:607-613`) | - |
| door 5: RPO e RTO (2) | AC 26 e door 5 | dump < 24 h C26 (`backup.test.ts:589-590`) · drill < 4 h C26 (`:591-592`) | - |
| door 6: imagens fixadas (4) | `Landing` door 6 / AD-088 | as quatro por tag e digest C48 (`monitoring.test.ts:222-224`); o `caddy` na C52 (`production.test.ts:315`) | - |
| door 6: portas (4) | `Landing` door 6 | `prometheus`/`alertmanager` em `127.0.0.1` C32 (`monitoring.test.ts:186`) · `node-exporter`/`blackbox-exporter` sem porta C32 (`:189`) · as da aplicação C5 (`production.test.ts:174-177`) | - |
| door 6: arquivos de monitoração (4) | `Landing` door 6 | `prometheus.yml`, `alerts.yml`, `blackbox.yml`, `alertmanager.yml.tmpl` C53 (`repo.test.ts:446-448`) | - |
| door 6: métricas do `caddy` (2) | `Landing` door 6 | `:9180` interno e não público C32 (`monitoring.test.ts:193-200`) · admin em `127.0.0.1:2019` C52 (`production.test.ts:326`) | - |
| door 6: sondas (2) | `Landing` door 6 | `blackbox-web`/`blackbox-api` com `probe_success` 1 C28 (`monitoring.test.ts:95-101`) e os alvos C53 (`repo.test.ts:451-459`) | - |
| door 6: regras (6) | `Landing` door 6 | `CaddyDown`, `WebDown`, `ApiHealthDegraded`, `DiskSpaceLow` (15%), `BackupStale` (26 h), `Http5xxHigh` (5% em 10 min) C29 (`monitoring.test.ts:111-125`), com disparo real C30 (`:146`) e C31 (`:176`) | - |
| door 6: entrega do alerta (1) | `Landing` door 6 | `render.sh` + `amtool check-config` e webhook C33 (`monitoring.test.ts:205-216`) e entrega C30 (`:149-154`) | - |
| door 7: `.env` fora do git (1) | `Landing` door 7 / AD-089 | `git check-ignore .env` sai 0 C41 (`repo.test.ts:490-491`) | - |
| door 7: `.env` `0600` (1) | `Landing` door 7 | `chmod 600 .env` C41 (`repo.test.ts:494`) | - |
| door 7: backup sem segredos (1) | `Landing` door 7 | nenhum `.env`/segredo no `$BACKUP_DIR` C20 (`backup.test.ts:363,373-377`) | - |
| door 7: cópias fora do servidor (6) | `Landing` door 7 | as seis chaves no README C42 (`repo.test.ts:515-523`) e a perda irreversível (`:527`) | - |
| door 7: restore exige a chave (1) | `Landing` door 7 | `: "${DATA_ENCRYPTION_KEY:?...}"` C42 (`backup.test.ts:618-626`; `deploy/restore.sh:30`) | - |
| door 7: `$BACKUP_DIR` `0700` e arquivos `0600` (2) | `Landing` door 7 | `install -d -m 700` C41 (`repo.test.ts:498`) · `install -m 600`/`umask 077` C41 (`:499-500`) | - |
| Surface do plano (4) | `Surface` (`plan.md:80-84`) | `308` C3 · `413` C7 · `502` C44 · `504` C45 (no nível do route handler do `web`, como o `checks.md` fixa no item 2 do `## Intent`) | - |
| AC 1 a AC 43 (43) | `Criteria` (`plan.md:100-183`) | cada AC N tem o check CN de mesmo número, com asserção localizada nas linhas citadas na tabela `Checks` | - |
| `Observable` com decisão (20 linhas) | `Observable` (`plan.md:228-254`) | comando `up` C1, C46 · `config` C2 · regressão do dev C13 · `caddy` portas/`api` C5, C6 · redirecionamento C3 · cabeçalhos C4 · erros de borda C7, C44, C45 · log C9 · página do `web` (CSP/nonce) C10, C11 · telas em navegador C12 · `backup.sh` C15-C18, C20 · `restore.sh` C21, C27 · timer C19 · `deploy.sh` C33, C46 · `/health` interno C28 · `prometheus`/`alertmanager` C28, C32 · alerta ao operador C30, C31 · README C40, C42 · `.env.example` C49 | - |
| Impact: domain (2) | `Impact` (`plan.md:63`) | termos `homologação`, `proxy de borda`, `backup`, `alerta` provados pelo comportamento que nomeiam C1, C52, C15, C30 e presentes no runbook nas linhas de C40 (`repo.test.ts:468,470`) · `WEB_ORIGIN` de produção documentado C40 (`:476`) | - |
| Impact: stored data (3) | `Impact` (`plan.md:64`) | versionamento C14 · sem backfill C56 · `$BACKUP_DIR` fora dos volumes C47, C41 | - |
| Impact: contrato da API (1) | `Impact` (`plan.md:65`) | nenhum diff em `apps/api/src`, `packages/contracts`, migrações e `pnpm-lock.yaml` C50 (saída vazia) | - |
| Impact: dependências (2) | `Impact` (`plan.md:66`) | cinco imagens novas por tag e digest C48, C52 · nenhum pacote npm novo C50 | - |
| Impact: comandos e testes (5) | `Impact` (`plan.md:67`) | `deploy.sh` C46 · `render.sh` C33 · `backup.sh` C15 · `restore.sh` C21 · units de systemd C19 | - |
| Impact: documentos (2) | `Impact` (`plan.md:68`) | `deploy/README.md` C40 · `.env.example` C49; as AD-083 a AD-089 já existiam na base e a linha `**In progress**` do `STATE.md` é escrituração do processo, sem check próprio (observação abaixo) | - |
| Impact: CI (1) | `Impact` (`plan.md:69`) | workflow com o único job `verify`/`pnpm verify` C51 (`repo.test.ts:558-561`) | - |

Conjuntos sem linha: procurei nas enumerações do `Landing`, `Surface`, `Criteria`, `Observable` e do
`Impact`. `Relations` é `None` no plano; as linhas `n/a` da `Observable` ("todas as rotas - versionamento
e rate limit") não enumeram membro novo porque a C50 prova que nenhuma rota muda, e o limite por IP está
no Out of scope. O site `http://{$SITE_ADDRESS}` ganhou linha própria. A linha `**In progress**` do
`STATE.md` citada no `Impact` documentos existe no `HEAD` (`STATE.md:137`) e a AD-083 no `HEAD` carrega o
digest decidido, mas nenhum check desta feature a afirma: é escrituração do processo, não comportamento
da homologação, e fica registrada como observação (não há membro de comportamento sem prova).
Nível e amostragem: toda claim de status, cabeçalho, corpo ou forma de resposta é provada na fronteira
(HTTP/HTTPS/TCP reais contra containers reais, Chromium real, `docker compose` sobre a stack, `git
check-ignore`/`git diff`); as únicas provas no artefato são as que o `checks.md` fixou desse jeito (C41)
e o nível do CSP no e2e (C10-C12).

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Configuração lida pelo `docker compose` | `compose.prod.yaml` + `compose.yaml` (imagem, ambiente, healthcheck, `entrypoint`, portas, volumes, `depends_on`) | uma no config resolvido e uma no estado dos containers depois do `up -d --wait` | sim - C1 lê o estado real dos nove serviços e dos dois `exited` `0`; C2 lê o `config` recusando variável; C5, C32, C47, C48, C52, C55 e C53 leem o config resolvido (portas, imagens, `aws-cli`, `caddy`, `storage-init`, arquivos de monitoração) |
| `deploy/Caddyfile` e o binário do `caddy` | `deploy/Caddyfile` (`header`, `request_body`, `@trace`, `reverse_proxy`, `log`, `:9180`, redirecionamento) | uma de fronteira (HTTP, HTTPS e TCP reais) e uma estática dos literais | sim - C3/C4/C6/C7/C9/C39/C44/C45/C35 fazem HTTP/HTTPS/TCP reais contra a borda; C52 faz a estática dos literais, incluindo `delete q`/`delete sig`; os quatro status do `Surface` estão cobertos (C3, C7, C44, C45) |
| `deploy/backup.sh` e `deploy/restore.sh` | scripts novos (caminho, falha, retenção, restauração, chave) | execução real de cada script contra a stack de produção e cada ramo de falha | sim - C15, C16, C18, C20 executam `bash deploy/backup.sh` de verdade; C17 cobre as duas falhas (dump e cópia) e o parcial/marcador; C21, C22, C23, C24, C26 executam o `restore.sh`; C27 cobre o dump truncado; C42 cobre a chave ausente |
| `apps/web/src/proxy.ts` | `proxy.ts` (nonce e política por requisição) | uma na fronteira HTTP da página e uma no navegador real | sim - C10 e C11 afirmam a política literal e o nonce do cabeçalho e da resposta HTTP do build de produção; C12 roda um Chromium real e afirma zero `securitypolicyviolation` em `/login` e `/students` |
| `deploy/monitoring/{alerts.yml,prometheus.yml,blackbox.yml}` | tabela de decisão de seis regras e as duas sondas | uma avaliação real com Prometheus e Alertmanager de pé e uma `promtool test rules` | sim - C28 lê `up` e `probe_success` do Prometheus vivo; C30 e C31 observam `ApiHealthDegraded` e `BackupStale` em `firing` e a entrega ao webhook; C29 roda `promtool check rules` e `promtool test rules` e confere os literais |
| `deploy/systemd/*` e documentos (`deploy/README.md`, `.env.example`, `.github/workflows/ci.yml`) | units e documentos | uma estática cada, em nível de repositório | sim - C19 (units), C40 e C42 (README), C49 (`.env.example`) e C51 (workflow) são estáticas em nível de repositório e afirmam o texto nomeado pelo claim |

## Faults injected

Procedimento: `git worktree add C:\Users\Admin\AppData\Local\Temp\operacao-verify\wt HEAD` e
`pnpm install --frozen-lockfile` (exit 0, 20,8 s) na worktree. Cada falha foi aplicada só na worktree, a
prova mais estreita que cobre o check foi rodada nela até reprovar, e o arquivo foi revertido com
`git checkout --` antes da falha seguinte. No fim, `git worktree remove --force` seguido de
`git worktree prune`; `git worktree list` mostra só a principal, e o `git status --porcelain` da árvore
real era `?? CLAUDE.md` antes e depois é `?? CLAUDE.md` mais o próprio
`.specs/features/operacao/verification.md` (a única escrita permitida) - nenhum outro caminho da árvore
real mudou. Nenhum `git stash`, nenhum commit, nenhum push.

| Mutation | Location | Killed |
| --- | --- | --- |
| `bash deploy/render.sh` removido de `deploy.sh` (efeito obrigatório some) | `deploy/deploy.sh:10` | yes - C46 reprovou em `repo.test.ts`: `AssertionError: expected '#!/usr/bin/env bash\n# Sobe a stack d…' to match /deploy\/render\.sh/` (exit 1) |
| nonce por requisição trocado por constante (`const nonce = 'nonce-fixo-nao-por-requisicao'`) | `apps/web/src/proxy.ts:22` | yes - C11 reprovou em `csp.spec.ts`: `Expected: not "nonce-fixo-nao-por-requisicao"` em `/login` (1 failed, exit 1) |
| status do redirecionamento `308` -> `301` no site `http://{$SITE_ADDRESS}` | `deploy/Caddyfile:20` | yes - C3 reprovou em `production.test.ts`: `expected 301 to be 308` |
| limiar do `BackupStale` `93600` -> `3600` (26 h -> 1 h) | `deploy/monitoring/alerts.yml:22` | yes - C29 reprovou em `monitoring.test.ts`: o literal `time() - backup_last_success_timestamp_seconds > 93600` não casa |
| `rm -f "$dump.partial"` removido do `fail()` (parcial não é apagado) | `deploy/backup.sh:42` | yes - C17 reprovou na invocação C16+C17 (a C17 lê o marcador que a C16 grava): `expect(readdirSync(.../db).filter((file) => file.endsWith('.partial'))).toEqual([])` recebeu `['academia-2026-10-18T212102Z.dump.partial']` (`backup.test.ts:301`), exit 1 |

As cinco superfícies de asserção diferentes - efeito obrigatório de script (C46), geração de nonce por
requisição (C11), status da borda (C3), limiar de regra de alerta (C29) e limpeza de falha do backup
(C17) - foram cada uma feitas falhar uma vez. Nenhum mutante sobreviveu.

## Handoff deviations

Julgamento de cada desvio declarado no `## Handoff` do `checks.md`, contra o claim literal do check:

- **Site `http://{$SITE_ADDRESS}` no `Caddyfile` (C3).** O site explícito com
  `redir https://{$SITE_ADDRESS}:{$CADDY_HTTPS_PORT}{uri} 308` (`deploy/Caddyfile:19-21`) é o que produz
  o `Location` com o porto publicado, e C3 continua afirmando **os dois** valores literais: `308`
  (`production.test.ts:149`) e `Location` exato `https://localhost:<CADDY_HTTPS_PORT>/` (`:150`).
  Consistente com a substância da door 1 (um `caddy`, `web:3000`, sem `api:3001`, nenhuma outra porta
  pública), mas o literal da door 1 no `plan.md`/AD-083 não ganhou menção ao site de redirecionamento:
  é uma lacuna de precisão da autoridade, declarada no Handoff, não uma contradição de comportamento. A
  C52 não afirma ausência de outros sites e o teste estático dela casa `{$SITE_ADDRESS}` também na linha
  do site HTTP (ver nota de C52): under-assertion de identidade do site principal, coberta na fronteira
  por C3/C4/C6.
- **C6 com sessão válida no `/health`.** Sem sessão o `proxy.ts` manda para o `/login`, então o 404 seria
  inalcançável; com a sessão o `web` responde 404 (`production.test.ts:191`) e o corpo não tem
  `"database"` (`:192`). O `/api/students` sem sessão continua provado 401 `problem+json` (`:195-196`) e a
  prova de que a `api` não é pública é o upstream único `web:3000`/sem `api:3001` (`:183-185`). A forma
  com sessão é fiel ao claim: um `/health` que fosse o da API responderia 200 com `"database"`, então o
  404 distingue os dois caminhos.
- **C7 com a `api` parada.** O 413 da borda, o corpo não `problem+json`, a ausência de `requestId` e a
  linha de acesso do `caddy` com `status: 413` (`production.test.ts:215-224`) provam que a recusa veio do
  `request_body` do Caddy, **antes** do `reverse_proxy`; a contagem de linhas de `logs api`
  (`:218-219`), porém, é vacuamente estável com a `api` parada - ela não prova sozinha "zero
  requisições". O claim da AC 7 fica provado pela semântica do `request_body` (que aborta antes do
  upstream) mais o log da borda; fica registrada a fraqueza da contagem (nota de C7).
- **C14/C56 com bucket recém-criado em vez de versionamento suspenso.** Um bucket novo é "existente e
  sem versionamento": C14 cria com `s3api create-bucket` (`backup.test.ts:222`), roda `storage-init`
  (`:224-226`), confirma `Status=Enabled` e a segunda execução 0 (`:230-231`). C56 cria o bucket e grava o
  objeto antigo (`:427-435`), habilita o versionamento (`:438-440`), grava o novo (`:446`) e confirma que o
  antigo ficou sem `VersionId` e com o ETag inalterado (`:450-451`). O claim ("bucket existente e sem
  versionamento", "sem backfill") está provado; a ausência do estado `Suspended` no RustFS não muda o
  claim.
- **C25 recuperação por `get-object --version-id`.** O teste baixa a versão anterior com `get-object
  --version-id` e compara o SHA-256 (`backup.test.ts:561-565`), e depois remove o marcador de exclusão
  com `delete-object --version-id` para a `GET` voltar a 200 com o mesmo conteúdo (`:568-572`). O claim
  literal ("recuperá-la por `get-object --version-id` faz `GET` voltar a 200") é mais forte do que o
  mecanismo do S3: o `get-object` recupera os bytes, e a `GET` volta a 200 porque o marcador é removido. A
  substância (versão recuperada, conteúdo igual, serviço servindo de novo) está provada; a redação causal
  é uma lacuna de precisão do claim, não do teste.
- **C41 no artefato, não no modo em disco.** O check foi escrito nesse nível (item 4 do `## Intent`) e é
  isso que o teste prova: `git check-ignore .env` 0, `chmod 600 .env`, `install -d -m 700`,
  `install -m 600`, `umask 077` e o README repetindo os três modos (`repo.test.ts:490-508`). O modo POSIX
  real do `$BACKUP_DIR`/`.env` no servidor é conferido pelo drill do README, como declarado. É um gap de
  nível declarado, não um claim sem prova.
- **C13 conserto de CPF no `compose.test.ts`.** `987.654.321-00` continua no caso de upload de foto
  (`tests/stack/compose.test.ts:590`) e o caso de check-in passou a usar `168.995.350-09`
  (`:1519`), um CPF válido (dígitos verificadores 0 e 9) e sem outra ocorrência no arquivo. É conserto de
  dado de teste para a colisão de CPF na mesma stack pré-existente, não enfraquecimento de asserção, e a
  suíte inteira passou 30/30.

Observação adicional (fora dos desvios declarados): o diff acrescenta `apps/web/instrumentation-client.ts`
(`z.config({ jitless: true })`) para o Zod não usar `new Function` sob o CSP sem `'unsafe-eval'`. O arquivo
não está na lista "Arquivos que o Build escreve ou edita" do `checks.md`, mas o efeito dele está provado
pela C12 (zero `securitypolicyviolation` no Chromium com login e `/students`); é detalhe reversível de
implementação, coerente com a door 2.

## Gate

`python "C:\Users\Admin\.agents\skills\tlc-spec-lean\scripts\validate_verification.py" operacao --root "C:\Users\Admin\projetos\academia-bairro"` - exit 0, `0 error(s), 0 warning(s) across [operacao]`.
