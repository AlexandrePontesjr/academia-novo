# Operação: a homologação na VPS

## Problem

O MVP está construído e verificado, mas nunca rodou num servidor: não existe deploy, o sistema só
é alcançado por `http://localhost`, e nada do que o PRD §4 promete para produção existe hoje - nem
HTTPS com HSTS e CSP, nem backup com restauração provada, nem métricas e alertas. Quem paga é a
academia: o §14 não pode ser aceito ("Backup e restauração validados em ambiente de homologação",
"Teste de segurança básico (OWASP Top 10) sem falhas críticas"), uma falha de disco ou uma exclusão
acidental apaga a operação inteira, uma foto de aluno trafega em claro por uma rede de bairro, e
ninguém fica sabendo se o sistema caiu até alguém reclamar no balcão. Os requisitos de backup do
§4 não dão número de tolerância a inventar: RPO de 24 h, RTO de 4 h e teste de restauração
trimestral, com backup diário do Postgres e bucket versionado.

As features anteriores empurraram para cá, uma a uma, o que dependia da hospedagem: HTTPS, HSTS,
CSP e `Permissions-Policy` (`auth-rbac`, `foto-captura`), o limite de corpo do upload no proxy
(`foto-pipeline`), o backup e o versionamento do bucket (`foto-pipeline`, `armazenamento-rustfs`,
`privacidade`), a cópia de `DATA_ENCRYPTION_KEY` fora do servidor (`alunos`), a retenção dos
backups (`privacidade`), o limite de requisições por IP no proxy (`auditoria`, `alunos`,
`funcionarios`, `planos-matriculas`, `pagamentos`, `check-in`, `dashboard`) e métricas e alertas
(`fundacao`).

Quando isto entrar: `https://<domínio>` serve o MVP com certificado, os cabeçalhos de segurança, o
CSP com nonce e o upload passando pelo `web`; um timer diário grava banco e fotos fora dos volumes
do Docker; um drill restaura a stack inteira numa base limpa; e Prometheus + Alertmanager avisam
quando a borda, o `web`, a API, o banco, o disco ou o backup falham. A hospedagem já foi decidida
pelo usuário: VPS com Docker Compose + Caddy (PRD §13.5).

## Flow

Reutiliza o desenho de origem única da AD-019 (o `/api/*` continua sendo repassado pelo `web`), o
contrato `/health` da AD-010, o bucket privado, o cliente S3 e as variáveis `S3_*` da AD-082, o
padrão de execução única do `compose.yaml` (`migrate`, `storage-init` são serviços que terminam) e
o schema de ambiente Zod de cada app (AD-015); só nasce o que a borda, o backup, a observabilidade e
a custódia de segredos exigem.

1. pedido HTTPS da internet -> `caddy` (new, door 1) - termina TLS para `{$SITE_ADDRESS}`, aplica
   HSTS, `Permissions-Policy`, `nosniff`, `Referrer-Policy` e o limite de corpo de 6 MB, grava o
   log de acesso JSON e repassa tudo a `web:3000`
2. `web` (exists) - serve as páginas com o `Content-Security-Policy` de nonce (door 2) e o
   `/api/*` do route handler existente continua repassando a `api:3001` (AD-019); o `caddy` não
   fala com a `api`
3. `api` (exists) - inalterada; o `/health` dela é sondado por `blackbox-exporter` (new, door 6),
   dentro da rede, e é a mesma definição da AD-010
4. `docker compose -f compose.yaml -f compose.prod.yaml` (new file, door 3) - sobe a stack de
   produção como overlay do `compose.yaml`, com `deploy/` e o `.env` do servidor (door 7); o
   `deploy/deploy.sh` faz o `up -d --wait`
5. `postgres` e `storage` (exists) - `storage-init` (exists, comando estendido pela door 4)
   habilita o versionamento do bucket antes de a API subir
6. timer systemd do host (new, door 5) -> `deploy/backup.sh` (new, door 5) - `pg_dump -Fc` do
   `postgres` e `s3 sync` do bucket pelo serviço `aws-cli` (new, door 5) para `$BACKUP_DIR`, fora
   dos volumes do Docker; grava `backup.prom` lido pelo `node-exporter` (new, door 6)
7. `prometheus` (new, door 6) - raspa as métricas do `caddy` em `:9180`, o `node-exporter` e as
   sondas do `blackbox-exporter` sobre `web` e `/health` da `api`; as regras chamam o
   `alertmanager` (new, door 6), que entrega em `ALERT_WEBHOOK_URL` renderizado por `deploy/render.sh`
8. `deploy/restore.sh` (new, door 5) - restaura um dump numa stack nova de projeto próprio; out: o
   MVP responde em `https://<SITE_ADDRESS>` e a restauração é um procedimento com prova

## Impact

| Front | What changes |
| --- | --- |
| domain | termos novos: "homologação" (a stack de produção na VPS, definida pelo overlay e por `deploy/`), "proxy de borda" (o `caddy`, que passa a fixar o IP do cliente, AD-028), "backup" (dump + cópia de objetos em `$BACKUP_DIR`, door 5) e "alerta" (regra do Prometheus entregue pelo Alertmanager, door 6); "origem do web" passa de `http://localhost:3000` para `https://<SITE_ADDRESS>` no `.env` de produção; quem ramifica pela origem hoje é o CSRF (AD-020) e o `WEB_ORIGIN` do `.env` |
| stored data | nenhuma tabela muda. O bucket ganha versionamento (door 4): objetos existentes ficam com versão `null` e os novos ganham version id; não há backfill. Os backups caem em `$BACKUP_DIR`, um diretório do host fora dos volumes nomeados; nada roda contra os dados existentes |
| contrato da API | nothing - nenhuma rota, schema ou código da API muda; o `/api/*` continua saindo do `web` e o `/health` continua com a forma da AD-010. O `web` ganha o CSP de nonce (door 2) |
| dependências | cinco imagens novas no Compose, por tag e digest (doors 1 e 6): `caddy`, `prometheus`, `alertmanager`, `node-exporter`, `blackbox-exporter`; nenhum pacote npm novo. A imagem do `aws-cli` da door 5 já é usada pelo `storage-init` do `compose.yaml`; o serviço `aws-cli` nasce no overlay |
| comandos e testes | o `docker compose up --build --wait` de desenvolvimento não muda; nascem `deploy/deploy.sh`, `deploy/backup.sh`, `deploy/restore.sh`, `deploy/render.sh` e as units de systemd; a suíte de stack ganha os casos da stack de produção (com `SITE_ADDRESS=localhost` e a CA interna do Caddy) e o `pnpm verify` continua sem Docker |
| documentos | `.env.example` ganha as chaves de produção (AD-015); nascem `deploy/README.md` e `deploy/`; entram as AD-083 a AD-089 e a linha `**In progress**` do Handoff de `STATE.md`; os `plan.md`/`checks.md` das features fechadas e o PRD não mudam |
| CI | nothing - o workflow continua rodando só `pnpm verify`; não há deploy automático nesta feature |

## Relations

None - no stored-data shape change. Nenhuma tabela nasce ou muda; o versionamento do bucket
(door 4) é ciclo de vida de objeto no armazenamento, sem entidade relacional, coluna ou migração.

## Surface

Only the public edge this feature adds; no application route changes.

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `GET http://{$SITE_ADDRESS}/*` | qualquer caminho | `Location` para a mesma URL em `https` | `308` |
| `ANY https://{$SITE_ADDRESS}/*` | corpo acima de 6 MB | recusa da borda antes do `web`; o `problem+json` da AD-044 continua valendo para arquivos até 6 MB | `413` |
| `ANY https://{$SITE_ADDRESS}/*` | web fora do ar para o `caddy` | erro da borda, sem `web` | `502`, `504` |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. borda pública | serviço `caddy` no `compose.prod.yaml` com a imagem `caddy:2.11.7@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f`, `ports: ["${CADDY_HTTP_PORT:-80}:80", "${CADDY_HTTPS_PORT:-443}:443"]`, volumes `caddy-data:/data` e `caddy-config:/config`, healthcheck `curl -fsS http://127.0.0.1:2019/config/`; Caddyfile global com `http_port 80`, `https_port 443`, `email {$ACME_EMAIL}` e `metrics`, cada opção na sua linha, mais o site `:9180 { metrics }` e o site `{$SITE_ADDRESS}` com `header { Strict-Transport-Security "max-age=31536000"; X-Content-Type-Options "nosniff"; Referrer-Policy "strict-origin-when-cross-origin"; Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()"; -Server; -X-Powered-By }`, `request_body { max_size 6MB }`, `@trace method TRACE` com `respond @trace 405`, `reverse_proxy web:3000` sem `trusted_proxies`, log `format filter { request>uri query { delete q; delete sig } }`; nenhuma porta de `web`, `api`, `postgres` ou `storage` fora de `127.0.0.1` | Caddy roteando `/api/*` e `/health` direto para `api:3001` - seriam dois caminhos até a API, o upload de 5 MB deixaria de passar pelo `web` e o `X-Forwarded-For` ganharia um segundo salto, contra AD-019 e AD-028; Traefik - tem limite por IP nativo, mas o usuário decidiu Caddy (PRD §13.5); publicar `web` e `api` direto no host - sem TLS nem cabeçalhos, e o `ip` da trilha ficaria forjável |
| 2. CSP com nonce | `apps/web/src/proxy.ts` gera `nonce = Buffer.from(crypto.randomUUID()).toString('base64')` por requisição, põe na requisição (`x-nonce` e `Content-Security-Policy`) e na resposta; política literal `default-src 'self'; script-src 'self' 'nonce-<nonce>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, com `'unsafe-eval'` só em `development`; `export const dynamic = 'force-dynamic'` acrescentado a `apps/web/src/app/login/page.tsx` e `apps/web/src/app/login/two-factor/page.tsx`, que hoje são as duas páginas sem renderização dinâmica; `style-src` mantém `'unsafe-inline'` porque o `react-easy-crop` posiciona o recorte com atributos `style`, que nonce não cobre | CSP estática no `caddy` com `script-src 'self' 'unsafe-inline'` - permite exatamente o script inline injetado que o CSP existe para barrar, e o `caddy` não tem como injetar nonce no HTML; CSP por hash/SRI - é `experimental` no Next 16 e não cobre os scripts inline que o runtime gera por requisição; não ter CSP - o PRD §4 pede |
| 3. artefatos de deploy | `compose.prod.yaml` na raiz e `deploy/` com `Caddyfile`, `monitoring/`, `backup.sh`, `restore.sh`, `deploy.sh`, `render.sh`, `systemd/` e `README.md`; o comando é `docker compose -f compose.yaml -f compose.prod.yaml up -d --wait`; o `.env` do servidor é criado a partir do `.env.example` e guardado com `0600`; um só ambiente, a homologação, e a produção futura reusa os mesmos artefatos | um `compose.prod.yaml` completo e separado - duplicaria Postgres, RustFS, `migrate`, `storage-init` e a API, e os dois arquivos divergem na primeira mudança; `compose.override.yaml` implícito - carregaria no desenvolvimento e mudaria a stack que os testes de hoje usam; Kubernetes ou um provisionador de nuvem - o usuário decidiu VPS com Compose |
| 4. versionamento do bucket | no `storage-init`, depois do `head-bucket`/`create-bucket`: `aws s3api put-bucket-versioning --bucket "$$S3_BUCKET" --versioning-configuration Status=Enabled`, idempotente; a recuperação é `aws s3api get-object --bucket ... --key ... --version-id ...`; nenhuma chave de objeto nem coluna de `photos` muda | não versionar - um `s3 rm` ou uma sobrescrita apaga a foto para sempre, e a AD-005/§4 pedem bucket versionado; Object Lock - impede apagar de propósito o que a LGPD manda apagar (`privacidade`); guardar versões em tabela - o objeto já é a fonte do arquivo |
| 5. backup e restauração | `$BACKUP_DIR` é um diretório do host montado no Compose (`${BACKUP_DIR}:/backup` no serviço `aws-cli`) com `0700`; `deploy/backup.sh` grava `db/academia-<AAAA-MM-DDTHHMMSSZ>.dump` (`pg_dump -Fc`), `objects/<data>/...` (`s3 sync`) e `metrics/backup.prom` (textfile collector do `node-exporter`) de forma atômica; retenção de `BACKUP_RETENTION_DAYS=30` dias; timer systemd `OnCalendar=*-*-* 03:00:00 America/Sao_Paulo`, `Persistent=true`; `deploy/restore.sh` restaura num projeto Compose próprio (`-p academia-restore`, portas próprias) sem parar a stack de produção | backup dentro de volume Docker nomeado - some junto com a VPS e com o `docker compose down -v`; backup pelo temporizador da API (padrão da AD-050) - não roda com a API caída, e o dump é do Postgres, não da API; WAL/PITR - é outro RPO (minutos) e outro custo, e o PRD pede 24 h; cifrar só o backup - o banco em execução continua em claro, e a custódia da chave viraria a nova perda irreversível |
| 6. métricas e alertas | `prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e`, `prom/alertmanager:v0.34.1@sha256:e9733bafb1bdef9b00e25a21f8f99dc26a22224bf16641ad754d1649f4c3357a`, `prom/node-exporter:v1.12.1@sha256:1b4e4438faca4dd7e001dd445d161a4a2091b0fededa84093b3a8dfeae1f1be0` e `prom/blackbox-exporter:v0.29.0@sha256:9613f2884689b6fad9f1939f6a3b0388c93a022cfaededb19545b329b5c83dea`, sem porta fora de `127.0.0.1`; `deploy/monitoring/{prometheus.yml,alerts.yml,blackbox.yml,alertmanager.yml.tmpl}`; o `caddy` expõe métricas em `:9180` (admin API fica em `localhost:2019`); sondas `blackbox-web` (`http://web:3000/login`) e `blackbox-api` (`http://api:3001/health`); regras `CaddyDown`, `WebDown`, `ApiHealthDegraded`, `DiskSpaceLow` (15%), `BackupStale` (26 h) e `Http5xxHigh` (5% em 10 min); o `deploy/render.sh` substitui `ALERT_WEBHOOK_URL` em `alertmanager.yml.tmpl` e o `deploy.sh` valida com `amtool check-config` | Grafana + dashboards - o PRD nomeia "Prometheus/Grafana ou equivalente" e o Prometheus já é a métrica e o alerta; é um container, uma senha e um volume a mais para um painel que ninguém abriu ainda, e entra depois sem quebrar nada; Uptime Kuma sozinho - não tem métricas nem séries; Loki - os logs já saem em JSON para o `docker compose logs` com rotação, e agregar é outra feature; Alertmanager com e-mail SMTP - exigiria mais credenciais e um servidor de e-mail, e o webhook cobre ntfy/Telegram/Slack |
| 7. custódia de segredos | o `.env` de produção fica fora do git, na VPS, com `0600`, e o backup não o inclui; as cópias fora do servidor são `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `PHOTO_URL_SECRET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `ALERT_WEBHOOK_URL`, guardadas pelo operador; o `deploy/restore.sh` exige a `DATA_ENCRYPTION_KEY` do operador e falha sem ela; `$BACKUP_DIR` é `0700` e os arquivos `0600` | pôr o `.env` dentro do backup - um único arquivo vazado abriria o banco restaurado inteiro, e a `DATA_ENCRYPTION_KEY` é a única chave cuja perda é irreversível; derivar a chave de `AUTH_SECRET` - acopla duas rotações, o que a AD-031 já recusou; cofre/Vault - mais um serviço e mais um segredo para abrir o cofre |

- Nothing else in this change is hard to reverse

## Criteria

### S1: A homologação responde em HTTPS e a borda fecha (P1)

O MVP é alcançado por `https://<SITE_ADDRESS>`, com os cabeçalhos e o CSP que as features anteriores
deixaram para cá, e o resto da stack não é alcançável pela internet.

**Acceptance Criteria**

1. WHEN `docker compose -f compose.yaml -f compose.prod.yaml up -d --wait` roda no servidor com o `.env` de produção THEN the system SHALL sair com código `0`, com `caddy`, `web`, `api`, `postgres` e `storage` em `healthy`, `migrate` e `storage-init` em `exited` com código `0`, e `prometheus`, `alertmanager`, `node-exporter` e `blackbox-exporter` em `healthy`.
2. IF `SITE_ADDRESS`, `ACME_EMAIL`, `ALERT_WEBHOOK_URL`, `BACKUP_DIR` ou `POSTGRES_PASSWORD` está ausente ou vazia no `.env` THEN `docker compose -f compose.yaml -f compose.prod.yaml config` SHALL sair com código diferente de `0` citando o nome da variável.
3. WHEN `GET http://<SITE_ADDRESS>/` chega ao host THEN the system SHALL responder `308` com `Location` igual a `https://<SITE_ADDRESS>/`.
4. WHEN `GET https://<SITE_ADDRESS>/login` chega THEN the system SHALL responder `200` com `Strict-Transport-Security` igual a `max-age=31536000`, `X-Content-Type-Options` igual a `nosniff`, `Referrer-Policy` igual a `strict-origin-when-cross-origin`, `Permissions-Policy` igual a `camera=(self), microphone=(), geolocation=(), payment=()` e sem os cabeçalhos `X-Powered-By` e `Server`.
5. The system SHALL publicar as portas `80` e `443` somente pelo serviço `caddy`, e nenhum outro serviço da stack de produção SHALL publicar porta fora de `127.0.0.1`.
6. The system SHALL servir o `web` somente pelo `caddy`, com `reverse_proxy` para `web:3000`, e o repasse de `/api/*` SHALL continuar sendo feito pelo `web` (AD-019); a `api` não SHALL ser alcançável pela internet.
7. WHEN um corpo maior que 6 MB é enviado a `POST https://<SITE_ADDRESS>/api/students/:id/photo` THEN the system SHALL responder `413` na borda, e a `api` SHALL receber zero requisições para esse pedido.
8. WHEN um login é feito com o cabeçalho `X-Forwarded-For: 203.0.113.7` forjado THEN a linha de `audit_logs` SHALL gravar em `ip` o endereço da conexão com o `caddy` (o mesmo `client_ip` do log de acesso), nunca `203.0.113.7`.
9. WHILE a stack de produção está de pé THEN o log de acesso do `caddy` SHALL ser JSON, com os valores das chaves `q` e `sig` removidos de `request.uri` e os cabeçalhos `Cookie` e `Authorization` com o valor `REDACTED`.
10. WHEN uma página do `web` é servida THEN a resposta SHALL ter `Content-Security-Policy` igual a `default-src 'self'; script-src 'self' 'nonce-<valor>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, e todo `<script>` inline do documento SHALL ter o mesmo `nonce` do cabeçalho.
11. WHEN duas páginas são pedidas em sequência THEN os `nonce` das duas respostas SHALL ser diferentes, e as páginas `/login` e `/login/two-factor` SHALL ser renderizadas dinamicamente para receber o `nonce`.
12. WHEN um navegador Chromium abre `/login`, entra e abre `/students` na stack de produção THEN o console SHALL registrar zero eventos `securitypolicyviolation` e as duas telas SHALL renderizar.
13. WHEN `docker compose up --build --wait` roda no clone de desenvolvimento, sem o overlay de produção THEN the system SHALL sair com código `0` e a stack de desenvolvimento SHALL manter os estados que a suíte de stack atual afirma.

### S2: Backup diário do banco e das fotos (P1)

Um timer diário grava o banco e os objetos do bucket fora dos volumes do Docker, e um backup velho
ou falho é detectável.

**Acceptance Criteria**

14. WHEN `storage-init` roda sobre um bucket existente sem versionamento THEN it SHALL habilitar versionamento e sair com código `0`; `aws s3api get-bucket-versioning` SHALL responder `Status` igual a `Enabled`; uma segunda execução SHALL sair com código `0`.
15. WHEN `deploy/backup.sh` roda com a stack de produção de pé THEN it SHALL gravar `$BACKUP_DIR/db/academia-<AAAA-MM-DDTHHMMSSZ>.dump` com `pg_dump -Fc`, cujo `pg_restore --list` sai com código `0`, e cada objeto do bucket em `$BACKUP_DIR/objects/<data>/<chave>` com o mesmo SHA-256 do objeto no bucket.
16. WHEN `deploy/backup.sh` termina com sucesso THEN it SHALL gravar de forma atômica `$BACKUP_DIR/metrics/backup.prom` com `backup_last_success_timestamp_seconds` igual ao instante da execução e `backup_dump_bytes` igual ao tamanho do dump.
17. IF o `pg_dump` ou a cópia de objetos falha THEN `deploy/backup.sh` SHALL sair com código diferente de `0`, apagar o arquivo parcial e deixar `backup.prom` como estava.
18. WHEN existem backups com mais de 30 dias em `$BACKUP_DIR` THEN a execução SHALL apagá-los e manter os 30 dias mais recentes.
19. The system SHALL ter `deploy/systemd/academia-backup.timer` com `OnCalendar=*-*-* 03:00:00 America/Sao_Paulo` e `Persistent=true`, disparando `deploy/systemd/academia-backup.service`, que executa `deploy/backup.sh`.
20. The system SHALL NOT incluir o `.env` nem qualquer chave secreta no backup: o conteúdo de `$BACKUP_DIR` SHALL ter somente as pastas `db/`, `objects/` e `metrics/`.

### S3: Restauração validada em homologação (P1)

Um dump do dia anterior reconstrói a stack inteira numa base limpa e a aplicação volta a servir os
dados, inclusive a foto e a observação de saúde cifrada.

**Acceptance Criteria**

21. WHEN `deploy/restore.sh <dump> --project academia-restore` roda com um dump válido THEN it SHALL criar uma stack nova no projeto Compose `academia-restore` com volumes e portas próprios, restaurar o banco e os objetos, subir a stack e sair com código `0`, sem parar a stack de produção.
22. WHEN a stack restaurada sobe THEN `GET /health` SHALL responder `200` com `checks` igual a `{ database: 'up', storage: 'up' }`.
23. WHEN o login de um usuário criado antes do backup é feito na stack restaurada THEN it SHALL responder `200`, e a ficha de um aluno SHALL mostrar a observação de saúde decifrada, com a `DATA_ENCRYPTION_KEY` fornecida ao restore.
24. WHEN a foto `large` de um aluno é pedida na stack restaurada THEN `GET /api/photo-files/<photoId>/large?exp=<segundos>&sig=<assinatura>` SHALL responder `200` com o mesmo SHA-256 do objeto no backup.
25. WHEN um objeto do bucket é apagado e a versão anterior é recuperada por `aws s3api get-object --version-id` THEN `GET /api/photo-files/<photoId>/large?exp=<segundos>&sig=<assinatura>` SHALL voltar a responder `200` com o mesmo conteúdo.
26. WHEN o drill de restauração roda THEN it SHALL usar um dump de menos de 24 h (RPO do §4) e terminar em menos de 4 h (RTO do §4).
27. IF o dump está truncado ou o `pg_restore` falha THEN `deploy/restore.sh` SHALL sair com código diferente de `0` e a stack de origem SHALL continuar intacta.

### S4: Métricas e alertas (P2)

A stack de produção tem métricas internas e entrega um alerta quando uma dependência, o disco ou o
backup falham.

**Acceptance Criteria**

28. WHEN a stack de produção está de pé THEN `GET http://prometheus:9090/-/ready` e `GET http://alertmanager:9093/-/ready` SHALL responder `200`, os alvos `caddy` e `node` SHALL ter `up` igual a `1`, e as sondas `blackbox-web` e `blackbox-api` SHALL ter `probe_success` igual a `1`.
29. The system SHALL ter as regras `CaddyDown` (scrape do `caddy` com `up == 0` por 2 min), `WebDown` (sonda `blackbox-web` com `probe_success == 0` por 2 min), `ApiHealthDegraded` (sonda `blackbox-api` com `probe_success == 0` por 2 min), `DiskSpaceLow` (menos de 15% livres no sistema de arquivos raiz por 15 min), `BackupStale` (`time() - backup_last_success_timestamp_seconds > 93600`) e `Http5xxHigh` (mais de 5% de respostas `5xx` em 10 min), e `promtool check rules` e `promtool test rules` SHALL sair com código `0`.
30. WHEN a `api` é parada THEN `ApiHealthDegraded` SHALL ficar `firing` em até 5 min e o `alertmanager` SHALL entregar ao webhook configurado um JSON com `status` `firing` e `alerts[].labels.alertname` igual a `ApiHealthDegraded`.
31. WHEN `backup.prom` traz `backup_last_success_timestamp_seconds` de 27 h atrás THEN `BackupStale` SHALL disparar na avaliação seguinte.
32. The system SHALL manter `prometheus`, `alertmanager`, `node-exporter` e `blackbox-exporter` sem porta publicada fora de `127.0.0.1`, e as métricas do `caddy` SHALL ser servidas na porta interna `9180`, nunca no site público.
33. WHEN `deploy/deploy.sh` roda THEN it SHALL renderizar `deploy/monitoring/alertmanager.yml` de `deploy/monitoring/alertmanager.yml.tmpl` com `ALERT_WEBHOOK_URL`, e `amtool check-config` SHALL sair com código `0`.

### S5: Teste de segurança básico (OWASP Top 10) e segredos (P2)

Os controles que o PRD §4 e o §14 pedem estão provados sobre a stack de produção, e nenhum segredo
depende do servidor para sobreviver.

**Acceptance Criteria**

34. WHEN `pnpm audit --prod --audit-level high` roda THEN it SHALL sair com código `0`, sem vulnerabilidade `high` ou `critical`.
35. WHEN a stack de produção está de pé THEN `GET https://<SITE_ADDRESS>/api/students` sem sessão SHALL responder `401` com `application/problem+json`, e `GET https://<SITE_ADDRESS>/api/staff` com sessão de `reception` SHALL responder `403` com `application/problem+json`.
36. WHEN o sexto login falho do mesmo e-mail acontece em 15 min THEN the system SHALL responder `429` com `code` igual a `too_many_attempts` e `Retry-After` positivo.
37. WHEN um corpo inválido é enviado a `POST https://<SITE_ADDRESS>/api/auth/login` THEN the system SHALL responder `422` com `code` igual a `validation_failed`.
38. WHEN uma conexão TLS é aberta THEN the system SHALL aceitar TLS 1.2 e TLS 1.3 e recusar TLS 1.0 e TLS 1.1; a resposta do login SHALL trazer o cookie de sessão com `Secure`, `HttpOnly` e `SameSite=Lax`.
39. WHEN `TRACE` é enviado a `https://<SITE_ADDRESS>/` THEN the system SHALL responder `405`.
40. The system SHALL ter `deploy/README.md` com os passos de primeira subida, atualização, restauração do backup, resposta a alerta e rollback, e com a tabela das dez categorias do OWASP Top 10 apontando a prova de cada uma, sem categoria em branco.
41. The system SHALL manter o `.env` de produção fora do git e com permissão `0600`, `$BACKUP_DIR` com `0700` e os arquivos de backup com `0600`.
42. WHEN um restore é executado THEN a `DATA_ENCRYPTION_KEY` SHALL ser exigida do operador, e `deploy/README.md` SHALL listar as cópias fora do servidor de `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `PHOTO_URL_SECRET`, das credenciais `S3_*` e de `ALERT_WEBHOOK_URL`, com a perda de `DATA_ENCRYPTION_KEY` marcada como irreversível.
43. IF uma sessão válida pede `https://<SITE_ADDRESS>/.git/config`, `https://<SITE_ADDRESS>/package.json`, `https://<SITE_ADDRESS>/.env` ou `https://<SITE_ADDRESS>/.env.example` THEN the system SHALL responder `404`, sem o conteúdo do arquivo.

**Independent test:** `pnpm audit --prod --audit-level high`, o drill de restore da S3 e a suíte de
segurança contra a stack de produção; cada tela aberta num Chromium sem violação de CSP.

## Out of scope

| Excluded | Why |
| --- | --- |
| Limite de requisições por IP genérico | o Caddy padrão não tem o módulo; o `mholt/caddy-ratelimit` está em `0.1.0`, fora da organização oficial, e exige um build próprio do Caddy com `xcaddy` - cada atualização do Caddy vira um rebuild do plugin. A RF-04 é atendida pelo bloqueio por e-mail da `auth-rbac` (`429 too_many_attempts`) e pelo 2FA obrigatório do Administrador; revisitar se houver abuso ou se o Caddy incorporar o módulo |
| Grafana, dashboards e Loki | o PRD pede "Prometheus/Grafana ou equivalente"; Prometheus + Alertmanager cobrem métricas e alertas, e os logs JSON ficam em `docker compose logs` com rotação. Painel e agregação entram depois sem mudar nenhuma door |
| Cópia off-site do backup, WAL/PITR e réplica do banco | o RPO do §4 é o dump diário; a cópia fora da VPS é decisão de go-live (Open question 3), e PITR/replicação são outro custo e outro RPO |
| Deploy contínuo e rollback automático | o deploy é `git pull` + `deploy/deploy.sh` no runbook; o CI continua só `pnpm verify`, e rollback é subir um commit anterior |
| TLS na rede local por IP e câmera fora de `localhost` | a recepção acessa pelo domínio público; abrir por IP na LAN exigiria PKI interna nos dispositivos (pergunta 3 da `foto-captura`) |
| Medição de p95, teste de carga e meta de 99,5% | percentil e disponibilidade são metas de serviço do §4, não uma execução; o histograma do `caddy` fica disponível para medir depois |
| Varredura ZAP e scan genérico de vulnerabilidade | a suíte de segurança prova os controles do Top 10 com resultado determinístico; um scan contra tela autenticada é ruidoso e não vira portão |
| Antivírus/ClamAV, catraca, biometria e multi-unidade | fora do MVP (PRD §1.4 e §4 "opcional") |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Forma da hospedagem | VPS com Docker Compose + Caddy (PRD §13.5; decisão do usuário em 2026-10-18) | o provedor não muda o código; era a trava da feature no ROADMAP | y |
| Provedor/instância, domínio e DNS | valores não estão no repositório; entram no `.env` de produção (`SITE_ADDRESS`, `ACME_EMAIL`) e nos registros DNS no go-live | não mudam código; viram Open question 1 e os critérios provam a stack com `SITE_ADDRESS=localhost` e a CA interna do Caddy | n |
| Tamanho do servidor | 2 vCPU, 4 GB de RAM e 40 GB de SSD | soma Postgres, RustFS, API, web, Caddy e os quatro serviços de observabilidade; 2 GB fica apertado | n |
| Ambiente | um só ambiente, a homologação; a produção futura reusa `compose.prod.yaml` e `deploy/` | o PRD §14 pede homologação, e o usuário decidiu uma VPS | n |
| Monitoramento | Prometheus + Alertmanager + `node-exporter` + `blackbox-exporter`, sem Grafana | o PRD nomeia "Prometheus/Grafana ou equivalente"; menos containers para uma VPS de bairro | n |
| Canal de alerta | um webhook (`ALERT_WEBHOOK_URL`) renderizado no Alertmanager, preenchido no go-live (ntfy, Telegram, Slack ou e-mail via bridge) | é genérico e testável contra um sink local; SMTP exigiria mais credenciais e um servidor de e-mail | n |
| Destino do backup | diretório do host (`$BACKUP_DIR`), fora dos volumes Docker, com `0700` | cumpre o RPO de 24 h e sobrevive a `docker compose down -v`; a cópia off-site é a Open question 3 | n |
| Retenção do backup | 30 dias | prazo limitado pelo dado pessoal (a `privacidade` anonimiza, mas o backup guarda o estado anterior) e cabe em 40 GB | n |
| Janela do backup | diária às 03:00 em `America/Sao_Paulo` | fora do horário de pico; `Persistent=true` cobre a VPS desligada na hora marcada | n |
| Cifra de disco da VPS | o provedor cifra o disco; sem isso, a exposição é a mesma do banco em execução | o banco já guarda CPF e telefone em claro e a saúde cifrada pela aplicação (AD-031); cifrar só o backup não resolveria o disco | n |
| Monitor externo de disponibilidade | conta gratuita de monitor externo batendo em `https://<SITE_ADDRESS>/login` a cada 5 min, configurada no go-live | Prometheus e Alertmanager rodam na própria VPS: se ela morrer, não há alerta (Open question 4) | n |
| Tags das imagens novas | Caddy `2.11.7`, Prometheus `v3.15.0`, Alertmanager `v0.34.1`, node-exporter `v1.12.1` e blackbox-exporter `v0.29.0`, fixadas por tag e digest | mesma regra da AD-082; digests lidos do registro em 2026-10-18 | n |
| Fonte do `pnpm audit` | `--prod --audit-level high` no portão | cobre a categoria A06 do OWASP sem transformar aviso de dependência de desenvolvimento em falha | n |

**Open questions:**

| # | Kind | Question | Until answered |
| --- | --- | --- | --- |
| 1 | blocks go-live | Qual provedor/instância, qual domínio e qual registro DNS? | os critérios provam a stack de produção localmente com `SITE_ADDRESS=localhost` e a CA interna; não há deploy real nem certificado público |
| 2 | blocks go-live | Qual é a URL do webhook de alerta e quem a recebe? | a entrega do Alertmanager é provada contra um sink local; ninguém é avisado de uma falha real |
| 3 | blocks go-live | Onde fica a cópia off-site do backup e quem a mantém? | o backup protege contra corrupção, exclusão e falha do Docker na VPS, não contra a perda da VPS |
| 4 | blocks go-live | Qual conta de monitor externo vigia `https://<SITE_ADDRESS>/login`? | a queda da VPS não gera alerta, porque Prometheus e Alertmanager rodam nela |

## Observable

Worksheet, not the review. `n/a` carries its reason.

| Surface | Decision | Landing |
| --- | --- | --- |
| comando `docker compose -f compose.yaml -f compose.prod.yaml up -d --wait` | saída e código com a stack saudável | AC 1 |
| comando `docker compose -f compose.yaml -f compose.prod.yaml config` | variável de produção ausente ou vazia | AC 2 |
| comando `docker compose up --build --wait` (dev) | regressão da stack de desenvolvimento | AC 13 |
| serviço `caddy` | portas publicadas e quem alcança a `api` | AC 5, AC 6 |
| serviço `caddy` | redirecionamento HTTP -> HTTPS | AC 3 |
| serviço `caddy` | cabeçalhos de resposta (HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Server`) | AC 4 |
| serviço `caddy` | erro de borda para corpo grande, `web` fora e timeout | AC 7 e Surface (`413`, `502`, `504`) |
| serviço `caddy` | o que o log de acesso grava e o que ele apaga | AC 9 |
| página do `web` | `Content-Security-Policy` e o nonce por requisição | AC 10, AC 11 |
| tela `/login` e `/students` num navegador real | execução sob o CSP | AC 12 |
| comando `deploy/backup.sh` | saída, código, falha parcial e retenção | AC 15, AC 16, AC 17, AC 18, AC 20 |
| comando `deploy/backup.sh` | o que imprime quando uma cópia falha | AC 17 - o erro do `pg_dump`/`aws` vai para a saída de erro e o código não é `0` |
| comando `deploy/restore.sh` | saída, código e falha do dump | AC 21, AC 27 |
| timer `academia-backup.timer` | agenda e persistência | AC 19 |
| comando `deploy/deploy.sh` | renderização do Alertmanager e validação | AC 33 |
| API `GET /health` | forma e códigos | existing - inalterado desde a AD-010; agora também sondado dentro da rede (AC 28) |
| todas as rotas da aplicação | versionamento e rate limit | n/a - nenhuma rota nasce ou muda; o limite por IP genérico fica no Out of scope |
| serviço `prometheus` e `alertmanager` | portas expostas e sondas | AC 28, AC 32 |
| alerta ao operador | formato do payload e destinatário | AC 30, AC 31 |
| documento `deploy/README.md` | o que o leitor faz em seguida | AC 40, AC 42 |
| documento `.env.example` | chaves de produção listadas | AC 2 e 41 - o `.env` real nunca entra no git |

## Sources

- `.specs/ROADMAP.md` linha 14 e `.specs/STATE.md` (AD-019, AD-028, AD-082; pendências das features anteriores) - o escopo e os itens herdados por esta feature
- `PRD — Sistema de Gestão de Academia.md` §4 (disponibilidade, segurança, backup, observabilidade), §13.5 (hospedagem) e §14 (critérios de aceite do MVP) - os números de RPO/RTO e as obrigações de HTTPS, HSTS, CSP e teste OWASP
- docs do Caddy: *Automatic HTTPS* (localhost com CA interna), *request_body* (`max_size`), *log* (filtros `query`, `Cookie`/`Authorization` redigidos), *metrics* (`:9180`), *reverse_proxy* (o default ignora `X-Forwarded-For` do cliente e escreve o IP da conexão) - os literais da door 1 e da observabilidade
- docs do Next.js, *Content Security Policy* (nonce no `proxy.ts`, `strict-dynamic`, renderização dinâmica) e docs do RustFS, *Versioning* (`rc bucket version enable`, `put-bucket-versioning`) - os literais das doors 2 e 4
