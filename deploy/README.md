# Operação: o runbook da homologação

A homologação é a stack do `compose.yaml` com o overlay `compose.prod.yaml` e os artefatos de
`deploy/`. O único caminho até a aplicação é o `caddy`, na porta 443, com HTTPS; o resto da stack
publica portas só em `127.0.0.1`. Os checks que provam cada passo estão em
`.specs/features/operacao/checks.md`.

## O que o servidor precisa ter

- Docker com Compose v2, 2 vCPU, 4 GB de RAM e 40 GB de SSD (a soma dos containers).
- As portas 80 e 443 abertas no firewall, e um registro DNS do domínio apontando para o IP.
- O repositório clonado em `/opt/academia-bairro` (o `deploy/systemd/academia-backup.service` usa
  esse caminho).
- Um diretório de backup fora dos volumes do Docker, por exemplo `/var/backups/academia`, com
  `0700`.
- Os segredos em cópia fora do servidor (a tabela de custódia está abaixo).

## A primeira subida

```sh
cd /opt/academia-bairro
cp .env.example .env
chmod 600 .env
# edite o .env: SITE_ADDRESS, ACME_EMAIL, ALERT_WEBHOOK_URL, BACKUP_DIR,
# BACKUP_RETENTION_DAYS, CADDY_HTTP_PORT e CADDY_HTTPS_PORT, além dos segredos
vi .env
bash deploy/deploy.sh
```

O `deploy.sh` renderiza `deploy/monitoring/alertmanager.yml` a partir do `.tmpl` (substituindo
`ALERT_WEBHOOK_URL`), valida a stack e roda `docker compose -f compose.yaml -f compose.prod.yaml
up -d --wait`. Quando ele termina, `https://<SITE_ADDRESS>/login` responde com os cabeçalhos de
segurança e o certificado do Let's Encrypt. No desenvolvimento, `SITE_ADDRESS=localhost` faz o
`caddy` usar a CA interna.

O `WEB_ORIGIN` do `.env` de produção é `https://<SITE_ADDRESS>`: é a origem que o CSRF aceita e de
onde o navegador fala com a API (AD-019, AD-020).

## Atualizar a homologação

```sh
cd /opt/academia-bairro
git pull
bash deploy/deploy.sh
```

O `up -d --wait` recria só o que mudou e espera todo mundo voltar a `healthy`. Um alerta
`Http5xxHigh` logo depois da subida é sinal de rollback (abaixo), não de espera.

## Rodar o drill de restauração

O PRD §4 pede um teste de restauração trimestral, com RPO de 24 h e RTO de 4 h. O script usa só
um dump e os objetos do dia, num projeto Compose próprio, sem parar a produção.

```sh
cd /opt/academia-bairro
export DATA_ENCRYPTION_KEY='<a mesma chave do .env>'
export RESTORE_POSTGRES_PORT=55432 RESTORE_API_PORT=3101
export RESTORE_WEB_PORT=3100 RESTORE_STORAGE_PORT=9100
bash deploy/restore.sh "$BACKUP_DIR/db/academia-AAAAMMDDTHHMMSSZ.dump" --project academia-restore
curl -fsS "http://localhost:$RESTORE_API_PORT/health"
```

O `restore.sh` exige a `DATA_ENCRYPTION_KEY` do operador: sem ela a observação de saúde restaurada
seria ilegível, e o script falha antes de tocar em qualquer coisa. A conferência do drill termina
em `GET /health` com `database: up` e `storage: up`, um login de um usuário anterior ao backup e a
foto `large` com o mesmo SHA-256 do objeto guardado. Ao final, `docker compose -p academia-restore
-d -f compose.yaml down --volumes` apaga a stack do drill.

O drill também confere os modos reais do servidor, que o Windows do desenvolvimento não devolve:

```sh
stat -c '%a' .env                      # 600
stat -c '%a' "$BACKUP_DIR"             # 700
find "$BACKUP_DIR" -type f -printf '%m %p\n' | sort   # 600 em cada arquivo
```

## Responder a um alerta

O Alertmanager entrega no webhook de `ALERT_WEBHOOK_URL` (ntfy, Telegram, Slack ou uma ponte de
e-mail). Um alerta chega com o `alertname`; o que fazer:

| Alerta | O que ele significa | Primeiro passo |
| --- | --- | --- |
| `CaddyDown` | o scrape do `caddy` falhou 2 min | `docker compose -f compose.yaml -f compose.prod.yaml ps caddy` e `docker compose logs caddy`; a borda inteira caiu se ele não voltar |
| `WebDown` | o `web` não responde ao `/login` | `docker compose logs web`; `docker compose up -d --wait web` |
| `ApiHealthDegraded` | o `/health` da API não responde `200` | `docker compose logs api`; `docker compose ps` diz se o Postgres ou o storage caíram junto |
| `DiskSpaceLow` | menos de 15% livres na raiz | `du -sh "$BACKUP_DIR"`; os backups retêm 30 dias, verifique a cópia off-site antes de apagar |
| `BackupStale` | o `backup.prom` tem mais de 26 h | `systemctl status academia-backup.timer` e `journalctl -u academia-backup.service` |
| `Http5xxHigh` | mais de 5% de `5xx` em 10 min | `docker compose logs api web`; se veio de uma subida, faça rollback |

## Rollback

O deploy é o git mais o `deploy.sh`; não há migração nova nesta feature, então voltar é:

```sh
cd /opt/academia-bairro
git checkout <commit anterior>
bash deploy/deploy.sh
```

Se a versão anterior não servir com o banco atual (o caso de uma feature futura com migração),
restaure o último dump num projeto novo e aponte o DNS para ele.

## Backup e retenção

O `deploy/backup.sh` roda pelo timer `academia-backup.timer`, todos os dias às 03:00 de
`America/Sao_Paulo`, com `Persistent=true` (a VPS desligada na hora marcada roda o backup no
próximo boot). Ele grava, em `$BACKUP_DIR` (`0700`, fora dos volumes do Docker):

- `db/academia-AAAAMMDDTHHMMSSZ.dump` — `pg_dump -Fc`;
- `objects/<data>/<chave>` — os objetos do bucket daquele dia, pelo serviço `aws-cli`;
- `metrics/backup.prom` — o marcador lido pelo `node-exporter` (`backup_last_success_timestamp_seconds`
  e `backup_dump_bytes`).

Os arquivos saem com `0600`; a retenção apaga o que passou de `BACKUP_RETENTION_DAYS` (30) dias.
Em qualquer falha o script sai diferente de `0`, apaga o arquivo parcial e deixa o marcador como
estava — o `BackupStale` avisa antes de alguém precisar do backup.

O `.env` e nenhuma chave secreta entram no backup: o diretório tem só `db/`, `objects/` e
`metrics/`.

## Custódia dos segredos

As cópias fora do servidor ficam com o operador, em local cifrado e separado da VPS:

| Segredo | Para que serve | Perda |
| --- | --- | --- |
| `AUTH_SECRET` | assina os cookies de sessão e cifra os segredos do 2FA | todos deslogados e o 2FA regerado |
| `DATA_ENCRYPTION_KEY` | cifra as observações de saúde, no banco e no backup | **irreversível**: as observações já gravadas ficam ilegíveis para sempre |
| `PHOTO_URL_SECRET` | assina as URLs de foto | as URLs emitidas param de valer; nenhuma foto se perde |
| `S3_ACCESS_KEY_ID` | credencial do bucket | o backup e o restore param até a rotação |
| `S3_SECRET_ACCESS_KEY` | credencial do bucket | o backup e o restore param até a rotação |
| `ALERT_WEBHOOK_URL` | destino dos alertas | ninguém é avisado até a URL ser reposta |
| `SMTP_PASS` | senha do SMTP do e-mail de confirmação do pré-cadastro | nenhum e-mail de confirmação sai até a senha ser reposta ou trocada no provedor |
| `GOOGLE_CLIENT_SECRET` | segredo do cliente do "Continuar com Google" no pré-cadastro | o login com Google falha até um segredo novo ser gerado no Google |

O `.env` de produção fica fora do git e com `0600`. A perda da `DATA_ENCRYPTION_KEY` é a única
irreversível: guarde-a separada do dump, e nunca a troque sem recifrar.

## OWASP Top 10: onde cada categoria é provada

| Categoria | Controle na homologação | Prova |
| --- | --- | --- |
| A01 Broken Access Control | RBAC da API, `401` e `403` em `application/problem+json`, o `/api/*` só pelo `web` | `prod_anonymous_api_is_401_and_reception_on_staff_is_403_with_problem_json`, `api_anonymous` da suíte da API |
| A02 Cryptographic Failures | TLS 1.2/1.3, HSTS, cookie `Secure`/`HttpOnly`/`SameSite=Lax`, saúde cifrada em repouso | `prod_edge_accepts_tls_12_and_13_and_refuses_tls_10_and_11`, `prod_login_cookie_is_secure_httponly_and_samesite_lax` |
| A03 Injection | contratos Zod em toda rota e consultas parametrizadas (Drizzle) | `prod_invalid_login_body_is_422_validation_failed` e a suíte da API |
| A04 Insecure Design | bloqueio por tentativas, 2FA do Administrador, backup com restauração provada | `prod_sixth_failed_login_in_fifteen_minutes_is_429_with_retry_after`, `prod_restore_drill_uses_a_dump_younger_than_24h_and_finishes_under_4h` |
| A05 Security Misconfiguration | HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP com nonce, sem `Server`/`X-Powered-By`, portas em loopback, arquivos de repositório 404 | `prod_login_serves_the_edge_security_headers_and_hides_server_identity`, `csp_header_carries_a_nonce_that_every_inline_script_reuses`, `prod_repository_files_are_404_even_with_a_session` |
| A06 Vulnerable and Outdated Components | `pnpm audit --prod --audit-level high` no portão e imagens fixadas por tag e digest | `pnpm audit --prod --audit-level high`, `prod_monitoring_images_are_pinned_by_tag_and_digest` |
| A07 Identification and Authentication Failures | limite de tentativas por e-mail, 2FA e sessão com cookie marcado | `prod_sixth_failed_login_in_fifteen_minutes_is_429_with_retry_after`, `prod_login_cookie_is_secure_httponly_and_samesite_lax` |
| A08 Software and Data Integrity Failures | imagens por tag e digest, bucket versionado e backup verificado por SHA-256 | `prod_caddy_service_resolves_the_door_one_literal`, `prod_storage_init_enables_versioning_on_an_existing_bucket_and_is_idempotent`, `prod_backup_dump_lists_and_objects_match_the_bucket_sha256` |
| A09 Security Logging and Monitoring Failures | log de acesso JSON com `q`/`sig` apagados e credenciais `REDACTED`, seis regras de alerta e o webhook | `prod_access_log_is_json_and_redacts_query_and_credentials`, `prod_alert_rules_match_the_six_literals_and_promtool_accepts_them`, `prod_stopped_api_fires_and_delivers_api_health_degraded` |
| A10 Server-Side Request Forgery | a API só fala com o endpoint S3 interno e o `/api/*` só com o `API_URL` fixo; URL de usuário não vira requisição | `prod_web_is_served_only_through_caddy_and_api_is_not_exposed`, `prod_repository_files_are_404_even_with_a_session` |

## Referências

- `.specs/features/operacao/plan.md` — o desenho, as doors 1 a 7 e as AC.
- `.specs/features/operacao/checks.md` — os checks e as provas.
- `.specs/STATE.md` (AD-083 a AD-089) — as decisões de operação.
