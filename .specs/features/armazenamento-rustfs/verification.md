# Armazenamento RustFS verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: a3276c9..f00a1f3
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Verificação independente sobre `a3276c9..f00a1f3` (`56959de` documentos, `37ad834` S1, `e13ab69` S2, `f00a1f3` S3), com os 24 checks de `checks.md` e `Profile: standard`. Rodei todas as provas `Proof:` em `HEAD`, uma invocação por alvo, com cada nome de teste aparecendo individualmente na saída (repo 8, API 4, stack 13, mais o `pnpm verify` inteiro e o `git diff` da C4); localizei uma asserção por check; recomputei o join de `Coverage` a partir da autoridade de cada conjunto (`Landing`, `Criteria`, `Observable`, nomes varridos); julguei as quatro linhas de `Test policy`; e injetei cinco falhas de comportamento em `git worktree` separado, uma por superfície de asserção, todas mortas pela prova mais estreita. `git status --porcelain` da árvore real era `?? CLAUDE.md` antes e depois; nenhuma escrita fora da worktree, nenhum `git stash`.

## Binding sources

O plano não marca fonte como binding e não há passo `ui`, então o passo 1 não tem entrada por perfil. Comparei mesmo assim os 24 checks com o `Landing` (doors 1 a 5), o `Surface` (None), o `Relations` (None) e a `Observable` do plano: nenhuma contradição.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| nenhuma fonte binding no plano | n/a | - | - |

## Checks

As quatro invocações de prova, todas em `f00a1f3`:

- repo: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts --reporter=verbose -t "<os 8 nomes>"` - exit 0, 8 passed, 10 skipped, cada um como `✓` (C1, C2, C8, C19, C20, C21, C22, C24)
- API: `pnpm --filter "./apps/api" exec vitest run test/photos-delete.test.ts test/health.test.ts test/check-in-status.test.ts test/privacy-retention.test.ts --reporter=verbose -t "<os 4 nomes>"` - exit 0, 4 passed, 36 skipped, cada um como `✓` (C1 consumer, C6, C7 nas duas provas)
- stack: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts --reporter=verbose -t "<os 13 nomes>"` - exit 0, 13 passed, 17 skipped, cada um como `✓` (C5, C9 a C18, C23)
- `pnpm verify --force` - exit 0, 21 tasks, 0 cached; `@academia/api:test` 77 arquivos e 709 testes passed; `@academia/repo-tests:test` 18 passed (C3)

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `startMinio()` sobe a imagem de `STORAGE_IMAGE` com as duas credenciais, espera `/health/ready` 200 antes do bucket `photos-test` e devolve `{ endpoint, bucket, env, client, stop }` | repo + API, 2 passed | `apps/api/test/support/servers.ts:70-71` `STORAGE_IMAGE = 'rustfs/rustfs:1.0.1@sha256:1803...6a3c'`; `tests/repo/repo.test.ts:218-233` `GenericContainer(STORAGE_IMAGE)`, `RUSTFS_ACCESS_KEY: STORAGE_ACCESS_KEY`, `RUSTFS_SECRET_KEY: STORAGE_SECRET_KEY`, `Wait.forHttp('/health/ready', 9000).forStatusCode(200)` antes de `CreateBucketCommand`, `bucket: STORAGE_BUCKET`, `S3_ENDPOINT: endpoint`; `apps/api/test/photos-delete.test.ts:36-49` ida e volta contra o container (upload 201, delete 204, bucket vazio) | PASS |
| C2 | `STORAGE_IMAGE` é a mesma string tag+digest do `compose.yaml`, e `MINIO_IMAGE` não existe fora de `.specs/` | repo, 1 passed | `tests/repo/repo.test.ts:253` `compose.services.storage.image` toBe o literal; `:254` regex tag + 64 hex; `:256-258` `servers.ts` com a mesma string; `:262-263` `grepOutsideSpecs(['-n', 'MINIO_IMAGE'])` devolve `[]` | PASS |
| C3 | `pnpm verify` sai 0 com as suítes de API contra o RustFS | `pnpm verify --force` | exit 0, 21 tasks, 0 cached; API 77 arquivos e 709 testes; repo 18 (log `C:\Users\Admin\verify-C3-force.log`) | PASS |
| C4 | sem diff em `apps/api/src/**` e `apps/api/test/*.test.ts` desde a base | `git diff --name-only a3276c9..HEAD -- apps/api/src "apps/api/test/*.test.ts"` | saída vazia, exit 0 | PASS |
| C5 | objeto apagado do bucket e linha de `photos` de pé -> `404` `not_found`, não `503` | stack, 1 passed | `tests/stack/compose.test.ts:624-627` `s3 rm` exit 0; `:628-632` linha de `photos` conta 1; `:634-637` 404, `application/problem+json` e `code` `not_found` | PASS |
| C6 | bucket inexistente -> `/health` 503 `degraded` com `storage` `down`; bucket existente -> 200 `up` | API, 1 passed | `apps/api/test/health.test.ts:60` caso `bucket inexistente`; `:73-77` 503 e `{ status: 'degraded', checks: { database: 'up', storage: 'down' } }`; `:58` e `:73` caso `de pé` 200/`up` | PASS |
| C7 | gravação e remoção terminam com o relógio falso a dias do RustFS | API, 2 passed | `apps/api/test/check-in-status.test.ts:42` `clockAt(NOON)` (NOON em `apps/api/test/support/plans.ts:90`); `:182` envio 201 (`apps/api/test/support/photos.ts:400`); `:195-200` variante `large` servida 600x800; `apps/api/test/privacy-retention.test.ts:165` `runAt('2026-10-07T15:00:00Z')`; `:176` `bucketKeys` `[]`; `:180` `[2, 2, 2]` com os seis objetos documentados em `apps/api/test/support/privacy.ts:90` | PASS |
| C8 | `testcontainers` `^12.2.0` em `devDependencies`; `@testcontainers/minio` fora dos manifests e do lockfile | repo, 1 passed | `tests/repo/repo.test.ts:239` `api.devDependencies.testcontainers` toBe `'^12.2.0'`; `:242-247` nomes montados em runtime e `pnpm-lock.yaml` sem o módulo | PASS |
| C9 | `up --build --wait` exit 0; `postgres`, `api`, `web` healthy; `storage` healthy; `storage-init` exited 0 | stack, 2 passed | `tests/stack/compose.test.ts:95` `up.status` 0; `:97-101` os três `healthy`; `:109` `storage` healthy; `:111-112` `init.State` `exited` e `ExitCode` 0 | PASS |
| C10 | config resolvido com os literais das doors 1 e 2 | stack, 1 passed | `tests/stack/compose.test.ts:122-127` imagem, duas credenciais, `RUSTFS_CONSOLE_ENABLE` `'false'`, sem `command`, healthcheck `['CMD', 'curl', '-fs', 'http://127.0.0.1:9000/health/ready']`; `:130-140` imagem do `aws-cli`, `entrypoint`, `AWS_ENDPOINT_URL`, as duas credenciais, `us-east-1` e `S3_BUCKET` | PASS |
| C11 | `up --wait` de novo sobre a stack existente: init 0 e `api` healthy | stack, 1 passed | `tests/stack/compose.test.ts:172` `again.status` 0; `:176-178` init `exited` 0 e `api` healthy | PASS |
| C12 | init quebrado -> `api` nunca inicia (`created`, `StartedAt` epoch) e `up --wait` não sai 0 | stack, 1 passed | `tests/stack/compose.test.ts:1640-1642` init `exited` com `ExitCode` diferente de 0; `:1644-1645` `up.status` diferente de 0; `:1647-1652` `api.State` `created` e `StartedAt` `0001-01-01T00:00:00Z` | PASS |
| C13 | bucket existe; objeto e listagem anônimos respondem 403 | stack, 1 passed | `tests/stack/compose.test.ts:513-516` `s3 ls` da raiz exit 0; `:527-528` `anonymous object 403` e `anonymous listing 403`; `:533-535` portas só `127.0.0.1` | PASS |
| C14 | credencial ausente ou vazia -> `config` não sai 0 citando a variável, nos quatro casos | stack, 1 passed | `tests/stack/compose.test.ts:152-157` os quatro casos; `:162-163` status diferente de 0 e `toContain(variable)` | PASS |
| C15 | `storage` parado com `api` de pé -> 503 com `checks` exatamente `{ database: 'up', storage: 'down' }` | stack, 1 passed | `tests/stack/compose.test.ts:1585-1586` `stop storage`; `:1590-1591` 503 e `toEqual({ database: 'up', storage: 'down' })` | PASS |
| C16 | `storage:9001` recusada (`ECONNREFUSED`); todo port publicado do `storage` em `127.0.0.1` | stack, 1 passed | `tests/stack/compose.test.ts:189-191` `refused ECONNREFUSED`; `:196-198` `port.host_ip` toBe `'127.0.0.1'` | PASS |
| C17 | `/logs` vazio e log do RustFS na saída padrão do `storage` | stack, 1 passed | `tests/stack/compose.test.ts:202-204` `ls -A /logs` conta 0; `:206-208` `logs storage` e regex `rustfs` | PASS |
| C18 | `storage` monta `rustfs-data` em `/data` e `volumes:` não declara `storage-data` | stack, 1 passed | `tests/stack/compose.test.ts:216-218` `objectContaining({ type: 'volume', source: 'rustfs-data', target: '/data' })`; `:219-221` declara `rustfs-data` e não `storage-data` | PASS |
| C19 | cinco identificadores do MinIO ausentes fora de `.specs/` | repo, 1 passed | `tests/repo/repo.test.ts:276-284` padrão com os cinco literais montados em runtime e `grepOutsideSpecs(['-i', '-E', pattern])` `[]` | PASS |
| C20 | comandos `mc` ausentes fora de `.specs/` | repo, 1 passed | `tests/repo/repo.test.ts:289-291` padrão `\bmc (alias&#124;mb&#124;ls)\b` e `grepOutsideSpecs(['-E', pattern])` `[]` | PASS |
| C21 | `.env.example` descreve RustFS e não cita MinIO | repo, 1 passed | `tests/repo/repo.test.ts:296-302` nenhuma linha casa `/minio/i` e um comentário com `RustFS` e `armazenamento`; `.env.example:26` | PASS |
| C22 | AD-082 `active` e AD-042 `superseded by AD-082` | repo, 1 passed | `tests/repo/repo.test.ts:316` AD-042 contém `superseded by AD-082`; `:320-321` id e status `active`; `:322-334` os nove membros; `.specs/STATE.md:82` (AD-042) e `:122` (AD-082) | PASS |
| C23 | listagem pelo `aws-cli` do `storage-init` devolve as três chaves do aluno enviado pela web | stack, 1 passed | `tests/stack/compose.test.ts:662-665` `run --rm --no-deps --entrypoint aws storage-init s3 ls --recursive` exit 0; `:666-669` `keys.sort()` igual a `thumb.webp`, `medium.webp` e `large.webp` | PASS |
| C24 | linha `**Branch**` do Handoff sem `pgsty/minio` e descrevendo RustFS | repo, 1 passed | `tests/repo/repo.test.ts:341` linha encontrada; `:343` não casa `pgsty/minio`; `:344` casa `RustFS`; `.specs/STATE.md:130` | PASS |

Notas de precisão, que não mudam o resultado porque nenhum comportamento fica sem prova:

- C7: o texto diz "grava as três variantes", mas a prova de upload afirma 201 e serve a variante `large` (600x800, vermelha), não `thumb` e `medium` individualmente. A gravação das três chaves na mesma via de upload é afirmada pela C23 (`tests/stack/compose.test.ts:667-669`), e o que a AC 7 pede (gravação e remoção terminarem sob o relógio falso) está afirmado nas duas provas; a enumeração das três variantes sob o relógio falso é a única parte do claim sem asserção própria.
- C12: a asserção de estado da `api` está atrás de `if (api)` (`tests/stack/compose.test.ts:1647-1652`), então um cenário em que o compose não criasse o container passaria. A falha 4 injetada mostra que o ramo é alcançado e a asserção é viva quando o container existe (`expected 'running' to be 'created'`), e C9/C11 provam o container nos outros cenários.

## Coverage

O join foi recomputado a partir da autoridade de cada conjunto: doors 1 a 5 e os literais do `Landing` (`plan.md:62-68`); as AC do `Criteria` (`plan.md:78-121`); as sete linhas da `Observable` que decidem algo (`plan.md:146-159`); os nomes varridos do texto das AC 19 e 20; e os arquivos que a feature escreve (`apps/api/test/support/servers.ts`, `compose.yaml`, `tests/stack/support.ts`, `.env.example`, `.specs/STATE.md`, `apps/api/package.json`, `pnpm-lock.yaml`). Todos os 19 conjuntos têm linha e nenhum membro ficou sem prova.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| door 1: imagem do servidor (6) | `Landing` door 1 e `compose.yaml:40-51` + `servers.ts:70-71` | imagem C2, C10 · `RUSTFS_ACCESS_KEY` C10, C1 · `RUSTFS_SECRET_KEY` C10, C1 · `RUSTFS_CONSOLE_ENABLE` C10, C16 · sem `command` C10 · healthcheck `/health/ready` C9, C10 | - |
| door 2: execução única e listagem (7) | `Landing` door 2 e `compose.yaml:59-72` | imagem `aws-cli` C10 · `entrypoint` C10, C12 · `AWS_ENDPOINT_URL` C10, C23 · `AWS_ACCESS_KEY_ID` C10 · `AWS_SECRET_ACCESS_KEY` C10 · `AWS_DEFAULT_REGION` C10 · `S3_BUCKET` C10, C23 | - |
| door 3: volume do servidor (2) | `Landing` door 3 e `compose.yaml:50`, `:132` | `rustfs-data:/data` C18 · `storage-data` fora de `volumes:` C18 | - |
| door 4: dependência de teste (2) | `Landing` door 4 e `apps/api/package.json:42` | `testcontainers` `^12.2.0` C8 · `@testcontainers/minio` fora dos `package.json` e do `pnpm-lock.yaml` C8 | - |
| door 5: decisão de projeto (2) | `Landing` door 5 e `.specs/STATE.md:82`, `:122` | AD-082 `active` C22 · AD-042 `superseded by AD-082` C22 | - |
| estados dos containers no `up --wait` (5) | AC 9 e AC 12 | `postgres` C9 · `api` C9, C12 · `web` C9 · `storage` C9, C17 · `storage-init` C9, C12 | - |
| imagens fixadas por tag e digest (2) | doors 1 e 2 | RustFS 1.0.1 C2, C10 · `aws-cli` 2.37.9 C10 | - |
| pedidos anônimos ao bucket (2) | AC 13 | objeto 403 C13 · listagem 403 C13 | - |
| bordas da credencial no compose (4) | AC 14 | `S3_ACCESS_KEY_ID` ausente C14 · `S3_ACCESS_KEY_ID` vazia C14 · `S3_SECRET_ACCESS_KEY` ausente C14 · `S3_SECRET_ACCESS_KEY` vazia C14 | - |
| decisões da `Observable` com AC (7) | `Observable` (`plan.md:150-158`) | saída e código do `up` C12 · `up` de novo C11 · credencial ausente ou vazia C14 · log do `storage` C17 · portas expostas C16 · `.env.example` C21 · `/health` forma e códigos C6, C15 | - |
| identificadores do MinIO varridos (5) | texto da AC 19 | `pgsty` C19 · `MinioContainer` C19 · `@testcontainers/minio` C19 · `MINIO_ROOT` C19 · `minio/health` C19 | - |
| comandos `mc` varridos (3) | texto da AC 20 | `mc alias` C20 · `mc mb` C20 · `mc ls` C20 | - |
| startup config: imagem (2 assemblies) | `compose.yaml:40` e `servers.ts:70-71` | `compose.yaml` C10 · `servers.ts` C1, C2 | - |
| startup config: credenciais (2 assemblies) | `compose.yaml:42-43` e `servers.ts:86` | `compose.yaml` C10, C14 · `servers.ts` C1 | - |
| startup config: chave `storage` do `/health` (2 assemblies) | `apps/api/test/support/app.ts` e processo real da stack | harness de API C6 · stack real C15 | - |
| `Impact` - documentos (2) | `Impact` do plano | `.env.example` C21 · linha `**Branch**` do Handoff C24 | - |
| `Impact` - dependências (2) | `Impact` do plano | `package.json` de `apps/api` C8 · `pnpm-lock.yaml` C8 | - |
| `Impact` - suporte de teste (2) | `Impact` do plano e out of scope | `startMinio`, `Minio` e o campo `minio` mantidos C4, C3 · `MINIO_IMAGE` sai e `STORAGE_IMAGE` entra C2 | - |
| `Impact` - contrato da API (2) | `Impact` do plano | `apps/api/src` sem diff C4 · `/health` com a mesma forma C6, C15 | - |

Conjuntos sem linha: procurei nas enumerações do `Landing`, `Relations`, `Surface`, `Observable` e das AC. `Surface` e `Relations` são `None` no plano, então não devem linha; as três linhas da `Observable` com `existing`/`n/a` não enumeram membros (flags e padrões do `up`, texto de erro do `storage-init`, rotas da API), como o `checks.md` registra; as duas linhas de `Impact` que não mudam nada observável (`domain`, `stored data` além da door 3) também não enumeram membros. As demais têm linha. Nível e amostragem: toda claim com status, rota ou forma de resposta é provada na fronteira (HTTP por `startApi`/`startPhotoStack`, `docker compose` sobre containers reais, arquivos do repositório e `git grep`); nenhuma afirma o interior de um serviço que ela mesma montou.

## Test policy rows

Julgadas contra os arquivos que cada linha classifica:

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Configuração lida pelo `docker compose` | `compose.yaml` (imagem, ambiente, healthcheck, `entrypoint`, `volumes`, `depends_on`) | uma no config resolvido da stack real e uma no estado dos containers depois do `up --wait` | yes - C10 le o config resolvido do clone e cobre cada literal das doors 1 e 2; C18 cobre os literais da door 3 nesse mesmo config; C9, C11 e C12 cobrem os estados `healthy`, `exited` 0 e `created` |
| Harness de teste `apps/api/test/support/servers.ts` | decide imagem, credenciais, espera de prontidão e criação do bucket | uma no nível do consumidor (uma suíte que sobe e faz ida e volta de objeto) e uma estática dos literais | yes - C1 consumer (`apps/api/test/photos-delete.test.ts:36-49`) e C1 estática (`tests/repo/repo.test.ts:218-233`) cobrem imagem, os dois nomes de variável, `/health/ready`, bucket e forma do retorno |
| `tests/stack/support.ts` (`breakBucketInit`) | substituição de texto, sem condicional | nenhuma própria | yes - C12 quebra o comando e observa a `api` nunca iniciar (`tests/stack/compose.test.ts:1647-1652`) |
| Documentos do repositório (`.env.example`, `.specs/STATE.md`) | uma estática cada, no nível de repositório | a linha ou o texto nomeado pelo claim | yes - C21 (`.env.example`) e C22 e C24 (`STATE.md`), estáticos em `tests/repo/repo.test.ts:296-302`, `:305-335` e `:337-345` |

## Swept

- validation: C14 - a restrição citada existe (o `:?` das duas variáveis no `compose.yaml:42-43`, `:66-67`, e os quatro casos da C14).
- failure modes: C12 - o comando quebrado por `breakBucketInit` (`tests/stack/support.ts:101-108`) é o que a prova executa.
- idempotency: C11 - `restart: 'no'` no `storage-init` e `condition: service_completed_successfully` da `api` (`compose.yaml:95-97`); a prova confirma init 0 e api healthy na segunda subida.
- authorization, existing: o bucket é privado por padrão (AD-082, `.specs/STATE.md:122`) e o pedido anônimo da C13 responde 403; nenhuma sessão de usuário nesta feature. A restrição citada existe e está provada.
- concurrency: n/a - nenhuma escrita concorrente nova (a criação do bucket é execução única e o compose encadeia os serviços).
- data lifecycle: C18 - door 3 no `compose.yaml:50` e `:132`.
- dependency failure: C15 e C5 - `stop storage` e objeto removido do bucket.
- state transitions: C9 e C12.
- observability: C17 - `RUSTFS_OBS_LOG_DIRECTORY: ''` (`compose.yaml:46`) e a prova de `/logs` vazio e stdout.

## Faults injected

Procedimento: `git worktree add --detach C:\Users\Admin\verifier-wt\armazenamento HEAD` e `pnpm install --offline --frozen-lockfile` (exit 0) na worktree; `git status --porcelain` da árvore real antes `?? CLAUDE.md`. Cada falha foi aplicada só na worktree, a prova mais estreita que cobre o check foi rodada nela até reprovar, e o arquivo foi revertido com `git checkout --` antes da falha seguinte. No fim, `git worktree remove --force` e `git worktree prune`; `git worktree list` mostra só a principal e o porcelain da árvore real continua `?? CLAUDE.md`. Nenhum `git stash`, nenhuma escrita na árvore real.

| Mutation | Location | Killed |
| --- | --- | --- |
| tag da imagem do RustFS `1.0.1` para `1.0.2` em `STORAGE_IMAGE` (digest mantido) | `apps/api/test/support/servers.ts:70-71` | yes - C2 reprovou: `expected 'rustfs/rustfs:1.0.2@sha256:1803faef57...' to be 'rustfs/rustfs:1.0.1@sha256:1803faef57...'` |
| `startMinio` deixa de criar o bucket (`CreateBucketCommand` removido) | `apps/api/test/support/servers.ts:91` | yes - C1 reprovou na prova de consumidor: `envio de preparação: expected 503 to be 201` |
| volume do `storage` montado em `/dados` em vez de `/data` | `compose.yaml:50` | yes - C18 reprovou: `expected [ { type: 'volume', ... } ] to deeply equal ArrayContaining`, `target: "/data"` esperado |
| `api` deixa de esperar o `storage-init` terminar (`condition: service_started` no lugar de `service_completed_successfully`) | `compose.yaml:97` | yes - C12 reprovou: `expected 'running' to be 'created'` |
| status da AD-042 volta a `active` | `.specs/STATE.md:82` | yes - C22 reprovou: `expected '| AD-042 | Arquivo fica em armazename...' to contain 'superseded by AD-082'` |

As cinco superfícies de asserção da feature foram cada uma feita falhar uma vez: literal de imagem no harness (C2), comportamento do harness no consumidor (C1), config resolvido do compose (C18), estado real dos containers (C12) e documento de decisão (C22). Nenhum mutante sobreviveu.

## Observação - suíte de stack inteira

Confirmei o vermelho pré-existente que o Handoff do Build registra: `pnpm test:stack` em `f00a1f3` deu **34 testes, 33 passed, 1 failed**, e o único vermelho é `check_in_through_web_by_reception_with_duplicate_refused_history_report_and_dashboard_count_without_audit_rows` (`tests/stack/compose.test.ts`, da feature `check-in`), que recebe `409 cpf_taken` porque o CPF `987.654.321-00` já foi cadastrado por `photo_uploaded_through_web_served_by_signed_url_with_audit_row` na mesma stack; está registrado no `## Handoff` de `.specs/features/privacidade/checks.md` (batch C). Nenhum dos 24 checks desta feature nomeia esse caso, o diff `a3276c9..f00a1f3` não toca o teste nem o CPF dele, e as provas novas da feature usam CPFs próprios (`526.018.159-06` na C5, `083.016.613-05` na C23). Fica como observação, sem efeito nos checks ou na cobertura.

## Gate

`python "C:\Users\Admin\.agents\skills\tlc-spec-lean\scripts\validate_verification.py" armazenamento-rustfs` - exit 0, 0 error(s), 0 warning(s).
