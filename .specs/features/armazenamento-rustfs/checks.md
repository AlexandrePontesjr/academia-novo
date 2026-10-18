# Armazenamento RustFS - checks

Profile: standard
Plan: `.specs/features/armazenamento-rustfs/plan.md`

## Intent

24 checks em 3 slices · 5 one-way doors · 0 open, of which 0 block (o plano não deixou pergunta aberta; a base da feature é `a3276c9`, o commit do PASS da rodada 2 da `privacidade`).

O plano foi aprovado como escrito em 2026-10-17; as duas perguntas foram respondidas pelo usuário no padrão recomendado (`aws-cli` local na execução única e na listagem; volume `rustfs-data` novo, com o `storage-data` da máquina intocado). As doors 1 a 5 são a AD-082 de `.specs/STATE.md`, e a AD-042 passa a `superseded by AD-082`; isso já está escrito no `STATE.md` por esta sessão. O perfil é `standard`, como nas features anteriores: o que o `light` não pega - um membro enumerado sem prova e um teste que passa sob uma implementação errada - é o risco desta troca, porque um `compose.yaml` com uma variável a menos, ou um `startMinio()` com a credencial errada, sobe uma stack que parece verde e fala com outro servidor.

**A base da feature está fixada em `a3276c9`.** A ordem do plano (Assumption "ordem em relação à `privacidade`") manda começar o Build depois da rodada 2 do Verifier da `privacidade`, com a base no commit dela; a rodada 2 fechou **PASS** e o commit que a registra é `a3276c9` (`35d6fd3` corrigiu a linha de `Test policy`, `5cf5d86` reescreveu as provas C21/C34 e `a3276c9` registrou o relatório PASS em `features/privacidade/verification.md`, `Profile: standard`, `Round: 2 - scoped`). A C4 e o intervalo do Verifier desta feature usam `a3276c9..HEAD`; o `## Handoff` registra o resto.

Oito coisas que o plano deixa em aberto e que este arquivo fixa, para a revisão aceitar ou trocar antes do Build:

1. **A base da feature é `a3276c9`, o commit da rodada 2 da `privacidade`.** A C4 compara contra ela; o `## Handoff` e o Verifier usam o mesmo intervalo.
2. **A configuração da stack é provada no config resolvido, não no texto do YAML.** A C10 lê `docker compose config --format json` no clone da stack e compara cada literal das doors 1 e 2; o texto do `compose.yaml` só é lido à parte pelo teste de repositório da C2, que compara a imagem com a de `servers.ts`.
3. **A suíte de API não ganha teste nem edição.** A C4 protege `apps/api/src/**` e `apps/api/test/*.test.ts`; por isso as duas provas de comportamento que faltavam entram pela stack real (C5 e C23), e o resto usa testes existentes que passam a rodar contra o RustFS. Nenhum teste da API é reescrito para esta feature.
4. **`startMinio()` muda de corpo, não de contrato.** O retorno continua `{ endpoint, bucket, env, client, stop }`, e `startPhotoStack`, os nomes `startMinio`/`Minio` e o campo `minio` de `PhotoStack` ficam como estão (Out of scope do plano); a constante `MINIO_IMAGE` vira `STORAGE_IMAGE` porque o valor deixou de ser MinIO.
5. **A C3 é o portão, e por isso a prova é o comando inteiro.** É a única linha `Proof:` deste arquivo sem seletor de teste, e é de propósito: o claim da AC 3 é "a suíte inteira roda verde contra o RustFS", que nenhum teste isolado conclui. O `validate_checks.py` avisa sobre ela; o aviso fica.
6. **A AC 7 precisa de duas provas.** A gravação com o relógio falso está em `check-in-status.test.ts` (o arquivo inteiro roda com `beforeEach(() => clockAt(NOON))`), e a remoção está na retenção da `privacidade` (a execução roda com o relógio em `2026-10-07T15:00:00Z` e apaga os seis objetos). Um dos dois testes não conclui as duas metades.
7. **A C5 distingue `404` de `503`.** Se o RustFS respondesse um erro genérico em vez de `NoSuchKey`, `PhotoStorage.get` lançaria `StorageUnavailable` e a rota responderia `503`; o claim é o `404 not_found`, e a prova falha sob a implementação errada.
8. **A C24 não é alcançada pelo `git grep` da C19.** A C19 exclui `.specs/`, e a linha `**Branch**` do Handoff mora em `.specs/STATE.md`; por isso ela tem prova própria, no mesmo teste de repositório que lê a AD.

## Checks

Como ler as provas. Os comandos já rodam no repositório: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t`, `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t`, `pnpm --filter "./apps/api" exec vitest run test/<arquivo> -t`, o portão `pnpm verify` e o `git diff` da C4. Os nomes de teste são os que o Build escreve; quando um nome mudar, o `## Handoff` registra o nome que ficou.

Arquivos que o Build escreve ou edita:

- `compose.yaml` (os serviços `storage` e `storage-init`, `volumes:`)
- `apps/api/test/support/servers.ts` (corpo de `startMinio`, `MINIO_IMAGE` -> `STORAGE_IMAGE`), `apps/api/package.json` e `pnpm-lock.yaml`
- `tests/stack/compose.test.ts` (nove casos novos e a listagem do caso da C13) e `tests/stack/support.ts` (`breakBucketInit`)
- `tests/repo/repo.test.ts` (oito casos novos)
- `.env.example` (o comentário da linha 26) e `.specs/STATE.md` (a AD-082, o status da AD-042 e a linha `**Branch**`)

Arquivos que **não** mudam: todo `apps/api/src/**` e todo `apps/api/test/*.test.ts` (C4), e os `plan.md`/`checks.md` de features fechadas (histórico; Out of scope do plano).

Regra de numeração: **C1 a C22 provam a AC de mesmo número** (C5 é a AC 5). C23 e C24 são o que o `Flow` e o `Impact` do plano enumeram além das AC. "Nada do MinIO fora de `.specs/`" é sempre medido com `git grep`, cujo código de saída `1` (nenhum resultado) é o esperado.

### S1 - A suíte de API roda contra o RustFS · 8 arquivos · ~82 KB · ~21k

**C1** - `startMinio()` sobe um container da imagem de `STORAGE_IMAGE` com `RUSTFS_ACCESS_KEY` e `RUSTFS_SECRET_KEY` iguais a `STORAGE_ACCESS_KEY` e `STORAGE_SECRET_KEY`, espera `GET /health/ready` responder `200` antes de criar o bucket `photos-test` pelo cliente S3 do teste, e devolve `{ endpoint, bucket, env, client, stop }` com `bucket` e `env.S3_BUCKET` iguais a `photos-test` e `env.S3_ENDPOINT` igual ao endpoint do container (AC 1).
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "storage_helper_uses_the_rustfs_image_credentials_readiness_and_bucket"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-delete.test.ts -t "delete_204_removes_row_objects_and_every_way_to_see_it"`

**C2** - A imagem em `STORAGE_IMAGE` de `apps/api/test/support/servers.ts` é `rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c` - a mesma string do serviço `storage` do `compose.yaml` e o literal da door 1, tag e digest - e o identificador `MINIO_IMAGE` não existe em nenhum arquivo fora de `.specs/` (AC 2, door 1).
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "storage_image_is_the_same_digest_in_compose_and_the_api_helper"`

**C3** - `pnpm verify` sai com código `0`, com as suítes de API que usam `startMinio` ou `startPhotoStack` executadas contra o RustFS (AC 3).
Proof: `pnpm verify`

**C4** - Da base da feature até `HEAD`, `git diff --name-only` sai vazio para `apps/api/src/**` e para `apps/api/test/*.test.ts`: nenhuma linha de código da API e nenhuma suíte de teste de API mudou (AC 4).
Proof: `git diff --name-only <base da feature>..HEAD -- apps/api/src "apps/api/test/*.test.ts"` (saída vazia; a base está no `## Handoff`)

**C5** - Com a linha de `photos` de pé e o objeto `photos/main/<studentId>/<photoId>/medium.webp` apagado do bucket do RustFS pelo `aws-cli` de `storage-init`, `GET /api/photo-files/<photoId>/medium?exp=<segundos>&sig=<assinatura>` responde `404` com `code` `not_found`, e não `503`: `PhotoStorage.get` devolve `undefined` no `NoSuchKey` (AC 5, AD-044).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "photo_file_404_when_the_object_is_gone_from_the_bucket"`

**C6** - IF `S3_BUCKET` aponta para um bucket que não existe no RustFS THEN `GET /health` responde `503` com `status` `degraded` e `checks` `{ database: 'up', storage: 'down' }`; com o bucket `photos-test` existente, responde `200` com `storage` `up` (AC 6).
Proof: `pnpm --filter "./apps/api" exec vitest run test/health.test.ts -t "health_storage_up_down_missing_bucket_and_hanging"`

**C7** - Com o relógio do processo falso (`vi.useFakeTimers({ toFake: ['Date'] })`) num instante a dias do relógio do RustFS (`NOON` de `apps/api/test/support/plans.ts` é `2026-10-07T15:00:00Z`), a gravação e a remoção de objetos terminam: o envio de foto com o relógio em `NOON` responde `201` e grava as três variantes, e a execução da retenção com o relógio em `2026-10-07T15:00:00Z` apaga os seis objetos do titular - o SDK corrige o `RequestTimeTooSkewed` na segunda tentativa (`maxAttempts: 2`) (AC 7).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "photo_url_serves_the_large_variant_of_the_current_photo_or_null"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "anonymizes_exactly_at_n_years_with_full_effect"`

**C8** - `apps/api` declara `testcontainers` na versão `^12.2.0` em `devDependencies`, e `@testcontainers/minio` não aparece em nenhum `package.json` do workspace nem no `pnpm-lock.yaml` (AC 8, door 4).
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "api_declares_testcontainers_and_the_minio_module_is_gone"`

### S2 - A stack sobe com o RustFS · 3 arquivos · ~82 KB · ~21k

**C9** - `docker compose up --build --wait` num clone limpo com `.env` copiado de `.env.example` sai com código `0`, com `postgres`, `api` e `web` em `healthy`, `storage` em `healthy` e `storage-init` em `exited` com `ExitCode` `0` (AC 9).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "up_wait_exits_zero_with_three_healthy"`
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "storage_healthy_and_storage_init_exited_zero_after_up_wait"`

**C10** - O config resolvido (`docker compose config --format json`) do serviço `storage` tem imagem `rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c`, `RUSTFS_ACCESS_KEY` igual a `S3_ACCESS_KEY_ID` do `.env`, `RUSTFS_SECRET_KEY` igual a `S3_SECRET_ACCESS_KEY`, `RUSTFS_CONSOLE_ENABLE` igual a `'false'`, nenhum `command`, e o healthcheck `['CMD', 'curl', '-fs', 'http://127.0.0.1:9000/health/ready']`; o de `storage-init` tem imagem `amazon/aws-cli:2.37.9@sha256:92de75724b6a746951f0e8b915d86bbccd7cb55aff96cd0cb4f7017272160780`, `entrypoint` `[sh, -c, 'aws s3api head-bucket --bucket "$$S3_BUCKET" || aws s3api create-bucket --bucket "$$S3_BUCKET"']`, `AWS_ENDPOINT_URL` `http://storage:9000`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` `us-east-1` e `S3_BUCKET` igual ao do `.env` (AC 10, doors 1 e 2).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "storage_and_storage_init_resolve_the_literal_config_of_the_two_doors"`

**C11** - Rodando `docker compose up --wait` de novo sobre a mesma stack, com o bucket já criado, `storage-init` sai com `ExitCode` `0` e a `api` fica `healthy` (AC 11).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "up_wait_again_over_the_existing_stack_keeps_init_zero_and_api_healthy"`

**C12** - Com o comando da execução única quebrado por `breakBucketInit`, o container `storage-init` sai com código diferente de `0`, a `api` fica em `created` com `StartedAt` `0001-01-01T00:00:00Z`, e o `up --wait` sai com código diferente de `0` (AC 12).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "api_never_starts_when_bucket_init_fails"`

**C13** - De dentro do container `api`, sem credencial, um `GET` do objeto (`<bucket>/photos/main/x/y/thumb.webp`) e um `GET` da listagem (`<bucket>/`) em `http://storage:9000` respondem `403` os dois (AC 13).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "storage_bucket_exists_private_and_ports_on_loopback"`

**C14** - `docker compose config` sai com código diferente de `0` citando o nome da variável nos quatro casos: `S3_ACCESS_KEY_ID` ausente, `S3_ACCESS_KEY_ID` vazia, `S3_SECRET_ACCESS_KEY` ausente e `S3_SECRET_ACCESS_KEY` vazia (AC 14, L-019).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "compose_config_refuses_a_missing_or_empty_credential"`

**C15** - Com o serviço `storage` parado e a API de pé, `GET /health` responde `503` com `checks` exatamente `{ database: 'up', storage: 'down' }` (AC 15).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "health_storage_up_then_down_when_storage_stops"`

**C16** - Com a stack de pé, a conexão de dentro do container `api` a `storage:9001` é recusada (`ECONNREFUSED`), e todo port publicado do serviço `storage` tem `host_ip` `127.0.0.1` (AC 16).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "console_9001_is_refused_and_every_storage_port_is_on_loopback"`

**C17** - O diretório `/logs` do container `storage` está vazio (0 entradas) e `docker compose logs storage` tem o log do RustFS na saída padrão, com pelo menos uma linha citando `rustfs` (AC 17, Assumption "log do RustFS").
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "storage_writes_its_log_to_stdout_and_leaves_the_logs_directory_empty"`

**C18** - O serviço `storage` monta o volume `rustfs-data` no destino `/data`, e `volumes:` não declara `storage-data` (AC 18, door 3).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "storage_mounts_rustfs_data_and_storage_data_leaves_the_file"`

### S3 - Nada do MinIO sobra no código · 3 arquivos · ~84 KB · ~21k

**C19** - `git grep -i -E "pgsty|MinioContainer|@testcontainers/minio|MINIO_ROOT|minio/health"` não tem resultado em nenhum arquivo fora de `.specs/` (AC 19).
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "minio_identifiers_are_absent_outside_specs"`

**C20** - `git grep -E "\bmc (alias|mb|ls)\b"` não tem resultado em nenhum arquivo fora de `.specs/` (AC 20).
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "mc_commands_are_absent_outside_specs"`

**C21** - `.env.example` descreve o armazenamento da stack como RustFS e não cita MinIO em nenhuma linha (AC 21).
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "env_example_describes_the_stack_storage_as_rustfs"`

**C22** - `.specs/STATE.md` registra a AD-082 com status `active`, repetindo a AD-042 inteira (S3, as quatro variáveis, a API única leitora, a chave `storage`) com o RustFS e o `aws-cli`, e a linha da AD-042 tem status `superseded by AD-082` (AC 22, door 5).
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "state_registers_the_rustfs_decision_and_supersedes_ad_042"`

**C23** - A stack lista o bucket pelo `aws-cli` do serviço `storage-init`: `docker compose run --rm --no-deps --entrypoint aws storage-init s3 ls --recursive s3://<bucket>/photos/main/<studentId>/` sai com `0` e imprime as três chaves `<studentId>/<photoId>/thumb.webp`, `/medium.webp` e `/large.webp` do aluno enviado pela web (Flow "Testes da stack", door 2).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "bucket_is_listed_through_the_aws_cli_of_storage_init"`

**C24** - A linha `**Branch**` do `## Handoff` de `.specs/STATE.md` não cita mais `pgsty/minio` e descreve o armazenamento como RustFS (Impact, documentos).
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "state_branch_line_no_longer_names_the_minio_image"`

## Coverage

Membros tirados da autoridade de cada conjunto: as doors 1 a 5, do `Landing` do plano; os literais de imagem, variável, healthcheck, entrypoint, volume e dependência, do `Landing`; as AC, do `Criteria`; as rotas e status, do `Surface` (vazio) e do `Observable`; os nomes varridos, do texto das AC 19 e 20.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| door 1: imagem do servidor (6) | imagem `rustfs/rustfs:1.0.1@sha256:1803...6a3c` C2, C10 · `RUSTFS_ACCESS_KEY` C10 · `RUSTFS_SECRET_KEY` C10 · `RUSTFS_CONSOLE_ENABLE` C10, C16 · sem `command` C10 · healthcheck `/health/ready` C9, C10 | - |
| door 2: execução única e listagem (7) | imagem `amazon/aws-cli:2.37.9@sha256:92de...0780` C10 · `entrypoint` C10, C12 · `AWS_ENDPOINT_URL` C10, C23 · `AWS_ACCESS_KEY_ID` C10 · `AWS_SECRET_ACCESS_KEY` C10 · `AWS_DEFAULT_REGION` C10 · `S3_BUCKET` C10, C23 | - |
| door 3: volume do servidor (2) | `rustfs-data:/data` C18 · `storage-data` fora de `volumes:` C18 | - |
| door 4: dependência de teste (2) | `testcontainers` `^12.2.0` em `devDependencies` C8 · `@testcontainers/minio` fora dos `package.json` e do `pnpm-lock.yaml` C8 | - |
| door 5: decisão de projeto (2) | AD-082 `active` C22 · AD-042 `superseded by AD-082` C22 | - |
| estados dos containers no `up --wait` (5) | `postgres` C9 · `api` C9, C12 · `web` C9 · `storage` C9, C17 · `storage-init` C9, C12 | - |
| imagens fixadas por tag e digest (2) | RustFS 1.0.1 C2, C10 · `aws-cli` 2.37.9 C10 | - |
| pedidos anônimos ao bucket (2) | objeto `403` C13 · listagem `403` C13 | - |
| bordas da credencial no compose (4) | `S3_ACCESS_KEY_ID` ausente C14 · `S3_ACCESS_KEY_ID` vazia C14 · `S3_SECRET_ACCESS_KEY` ausente C14 · `S3_SECRET_ACCESS_KEY` vazia C14 | - |
| decisões da `Observable` com AC (7) | saída e código do `up` C12 · `up` de novo C11 · credencial ausente ou vazia C14 · log do `storage` C17 · portas expostas C16 · `.env.example` C21 · `/health` forma e códigos C6, C15 | - |
| identificadores do MinIO varridos (5) | `pgsty` C19 · `MinioContainer` C19 · `@testcontainers/minio` C19 · `MINIO_ROOT` C19 · `minio/health` C19 | - |
| comandos `mc` varridos (3) | `mc alias` C20 · `mc mb` C20 · `mc ls` C20 | - |
| startup config: imagem (2 assemblies) | `compose.yaml` C10 · `servers.ts` C1, C2 | - |
| startup config: credenciais (2 assemblies) | `compose.yaml` C10, C14 · `servers.ts` C1 | - |
| startup config: chave `storage` do `/health` (2 assemblies) | harness de API C6 · stack real C15 | - |
| `Impact` - documentos (2) | `.env.example` C21 · linha `**Branch**` do Handoff C24 | - |
| `Impact` - dependências (2) | `package.json` de `apps/api` C8 · `pnpm-lock.yaml` C8 | - |
| `Impact` - suporte de teste (2) | `startMinio`, `Minio` e o campo `minio` mantidos C4 · `MINIO_IMAGE` sai e `STORAGE_IMAGE` entra C2 | - |
| `Impact` - contrato da API (2) | `apps/api/src` sem diff C4 · `/health` com a mesma forma C6, C15 | - |

- `Surface` do plano: `None - nothing consumed outside`. Nenhuma rota muda, então nenhuma linha de status de rota; o que muda é linha de comando e está nas linhas de `Observable` e de `startup config` acima.
- `Relations` do plano: `None - no stored-data shape change`. Nenhuma tabela muda, então nenhuma linha de entidade.
- As três linhas da `Observable` com `existing` ou `n/a` não viram linha de `Coverage`, porque não enumeram membros: as flags e padrões do `up` (`--build --wait`, como o `compose.yaml` documenta), o texto de erro do `storage-init` (o `aws` escreve na saída de erro do container; não há texto nosso a fixar) e as rotas da API (`n/a`, nenhuma muda).
- Linhas de `Impact` sem check, porque não mudam nada observável: `domain` (nenhum termo muda) e `stored data` além do volume da C18 (o formato em disco do volume antigo fica intocado por decisão da door 3, e migrá-lo está fora do escopo).
- As provas de status e de forma de resposta são todas de fronteira: as de API cruzam o HTTP (`startApi`/`startPhotoStack`), as de stack rodam `docker compose` sobre containers reais, e as de repositório leem os arquivos e rodam `git grep` - nenhuma afirma o interior de um serviço que ela mesma montou.

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Configuração lida pelo `docker compose` (`compose.yaml`: imagem, ambiente, healthcheck, `entrypoint`, `volumes`, `depends_on`) | uma no config resolvido da stack real (`docker compose config` no clone) e uma no estado dos containers depois do `up --wait` | cada literal das doors 1, 2 e 3, e cada estado que os serviços alcançam: `healthy`, `exited` `0`, `created` |
| Harness de teste `apps/api/test/support/servers.ts` (decide imagem, credenciais, espera de prontidão e criação do bucket) | uma no nível do consumidor - uma suíte que o sobe e faz ida e volta de objeto - e uma estática dos literais | cada membro: imagem, os dois nomes de variável, o caminho `/health/ready`, o bucket, a forma do retorno |
| `tests/stack/support.ts` (`breakBucketInit`: uma substituição de texto, sem condicional) | nenhuma própria | coberta pela C12, que quebra o comando e observa a `api` nunca iniciar |
| Documentos do repositório (`.env.example`, `.specs/STATE.md`) | uma estática cada, no nível de repositório | a linha ou o texto nomeado pelo claim |

Evidence:

- `compose.yaml`: dois serviços com configuração literal, um healthcheck, um volume e uma aresta de `depends_on`; quem decide a ordem e o ambiente é o `docker compose`, não o arquivo sozinho -> decide
- `apps/api/test/support/servers.ts`: decide a imagem, os dois nomes de credencial, a espera de prontidão e a criação do bucket; sem ramificação que mude o resultado -> decide
- `tests/stack/support.ts:101-106`: substitui uma string fixa, sem condicional -> instrumentação
- análogo mais próximo, para a prova estática: `tests/repo/repo.test.ts` já lê `.env.example`, o workflow e o `turbo.json` (`env_example_lists_every_required_key`, `ci_runs_verify_on_push_and_pr`, `api_coverage_thresholds_are_70_lines_and_branches`); para a prova de stack: `compose.test.ts` já lê o config resolvido (`config --format json`) e o estado dos containers (`ps --all --format json`) nos casos da `foto-pipeline` e da `privacidade`

Cost: nove provas de stack em `compose.test.ts` (dentro do único `up --build --wait` já existente, mais um `up --wait` de repetição) e oito de repositório em `repo.test.ts`. Sem esses dois arquivos, a paridade da imagem entre os dois assemblies, os literais das doors, a AD e a ausência do MinIO ficariam sem prova nenhuma - o `pnpm verify` verde não os distingue de um `compose.yaml` e um `servers.ts` que nunca mudaram.

## Swept

- validation: C14
- failure modes: C12
- idempotency: C11
- authorization: existing - o bucket é privado por padrão (AD-082) e o pedido anônimo da C13 responde `403`; nenhuma sessão de usuário nesta feature
- concurrency: n/a - nenhuma escrita concorrente nova: a criação do bucket é uma execução única e o `compose` sobe um serviço depois da condição do anterior
- data lifecycle: C18
- dependency failure: C15, C5
- state transitions: C9, C12
- observability: C17

## Handoff

**A base da feature é `a3276c9`**, o commit que registra o **PASS da rodada 2** do Verifier da `privacidade` (`.specs/features/privacidade/verification.md`, `Profile: standard`, `Round: 2 - scoped`, sobre `8cdaef1..5cf5d86`). A rodada 1 reprovou em `334b2ce` só a linha de `Test policy` da operação destrutiva: a expectativa foi corrigida em `35d6fd3`, as provas de C21 e C34 foram reescritas em `5cf5d86` e o relatório PASS foi registrado em `a3276c9`. A Assumption "ordem em relação à `privacidade`" está cumprida e a C4 é medida contra ela.

Size, com a aritmética (`wc -c` nos arquivos que cada slice lê e escreve, dividido por 4):

- S1 = 82 KB -> ~21k: `apps/api/test/support/servers.ts` 4,1 + `apps/api/package.json` 1,3 + `apps/api/test/support/photos.ts` 17,5 + `photos-delete.test.ts` 5,0 + `health.test.ts` 3,1 + `check-in-status.test.ts` 15,1 + `privacy-retention.test.ts` 17,7 + `photos-urls.test.ts` 18,4 (o `pnpm-lock.yaml` é gerado pelo `pnpm install`, não é lido nem escrito à mão: fora da conta)
- S2 = 82 KB -> ~21k: `compose.yaml` 3,8 + `tests/stack/support.ts` 4,2 + `tests/stack/compose.test.ts` 73,8
- S3 = 84 KB -> ~21k: `.env.example` 2,4 + `tests/repo/repo.test.ts` 9,4 + `.specs/STATE.md` 75,8
- documentos = 68 KB -> ~17k: `plan.md` 17,2 + este `checks.md` ~24 + `brief.md` 5,9 + `LESSONS.md` 20,4
- soma: 21 + 21 + 21 + 17 = **~80k**, abaixo do orçamento de 150k (o padrão, sem declaração em `AGENTS.md`/`CLAUDE.md`)
- Mechanism: **um builder** (a soma cabe no orçamento; nenhuma pergunta de mecanismo). A ordem é S1, S2, S3, e a base é `a3276c9`.

Notas para o builder:

- antes da S2, conferir no registro a tag e o digest das duas imagens (Assumptions do plano, `Confirmed?` `n`); tag ou digest diferente do literal das doors 1 e 2 é um stop-and-ask, não uma edição do check
  - **conferido pelo orquestrador em 2026-10-18**: `docker buildx imagetools inspect` devolve `sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c` para `rustfs/rustfs:1.0.1` e `sha256:92de75724b6a746951f0e8b915d86bbccd7cb55aff96cd0cb4f7017272160780` para `amazon/aws-cli:2.37.9` - exatamente os literais das doors 1 e 2; as duas imagens foram baixadas com sucesso. As duas Assumptions de tag estão confirmadas por leitura, não por suposição.
- antes da S2, conferir se o binário do RustFS loga na saída padrão com `RUSTFS_OBS_LOG_DIRECTORY: ''`; se não logar, a C17 reprova e a Assumption "log do RustFS" volta para o usuário (é a única Assumption que pode virar pergunta nesta feature)
- a C3 (`pnpm verify`) e a suíte de stack inteira (`pnpm test:stack`) rodam no fim de cada slice verde; as nove provas novas de stack entram todas no mesmo `describe('stack de pé')`, para não pagar um segundo `up --build --wait`
- a C4 só fecha com a base certa: rodar o `git diff` contra `a3276c9`, nunca contra `334b2ce` por conveniência
- o Verifier é disparado pelo orquestrador depois do último commit desta feature, sobre `<base da feature>..HEAD`, com os 24 checks e `Profile: standard`

Build (2026-10-18) - **um builder**, ordem S1 -> S2 -> S3, sobre a base `a3276c9` e os documentos de `56959de`:

- **S1 `37ad834`** - a suíte de API contra o RustFS: `apps/api/test/support/servers.ts` (`MINIO_IMAGE` -> `STORAGE_IMAGE`, `startMinio` por `GenericContainer` com `RUSTFS_ACCESS_KEY`/`RUSTFS_SECRET_KEY`, espera `GET /health/ready` `200` e cria o bucket pelo cliente S3, mesma forma de retorno), `apps/api/package.json` (`@testcontainers/minio` sai, `testcontainers ^12.2.0` entra em `devDependencies`) e `pnpm-lock.yaml` com o diff mínimo (3 linhas a mais, 15 a menos: só o importer de `apps/api`, o pacote e o snapshot do módulo do MinIO). Provas: C1 (repo + `photos-delete`), C6 (`health`), C7 (`check-in-status` + `privacy-retention`) e C8 (repo). `pnpm verify` verde (21 tarefas; 77 arquivos e 709 testes de API, 12 de repo).
- **S2 `e13ab69`** - a stack com o RustFS: `compose.yaml` com os serviços `storage` (imagem da door 1, `RUSTFS_ACCESS_KEY`/`RUSTFS_SECRET_KEY`/`RUSTFS_CONSOLE_ENABLE: 'false'`, `RUSTFS_OBS_LOG_DIRECTORY: ''`, sem `command`, healthcheck em `/health/ready`, volume `rustfs-data:/data`) e `storage-init` (imagem da door 2, `entrypoint` com `head-bucket || create-bucket`, `AWS_*` e `S3_BUCKET`); `volumes:` perde `storage-data` e ganha `rustfs-data`. `tests/stack/support.ts` (`breakBucketInit` quebra `aws s3api create-bucket`), `tests/stack/compose.test.ts` (nove casos novos no mesmo `up --build --wait` e a listagem pelo `aws-cli` do `storage-init` nos quatro casos que usavam `mc`) e o teste de repo da C2. Provas: C2, C5 e C9 a C18 e C23; `pnpm verify` verde (709 de API, 13 de repo) e `pnpm test:stack` com tudo desta fatia verde (o único vermelho da suíte é o da `check-in`, pré-existente).
  - a listagem passou a ser `docker compose run --rm --no-deps --entrypoint aws storage-init s3 ls --recursive s3://<bucket>/<prefixo>`, e as chaves voltam completas (`photos/main/<id>/...`): os helpers dos casos existentes removem o prefixo para continuar comparando as chaves relativas.
  - a C17 reprovou na primeira execução pelo shell do Windows: em `sh -c 'ls -A /logs | wc -l'` o `cmd.exe` interpreta o `|`; a prova passou a usar aspas duplas, como os outros `sh -c` do arquivo. Nenhum claim mudou.
  - o `$$` do `entrypoint` aparece `$$` no `config --format json` (o compose reescapa o `$` literal): a C10 compara a string exatamente como o check a escreve.
- **S3 = este commit final** - documentos e varreduras: `.env.example` (o comentário passa a dizer "RustFS na stack"), `.specs/STATE.md` (linha `**Branch**` e `**In progress**`/`**Uncommitted**`) e os cinco casos de repo C19 a C22 e C24.

Provas dos 24 checks, todas verdes em `HEAD`:

- S1: C1, C6, C7 e C8; S2: C2, C5, C9 a C18 e C23; S3: C19 a C22 e C24. A C3 é o `pnpm verify` inteiro: verde nas três fatias (21 tarefas; a última só com os casos de repo novos, 18 em cache, API 709 em 77 arquivos e repo 18). A C4 (`git diff --name-only a3276c9..HEAD -- apps/api/src "apps/api/test/*.test.ts"`) sai vazia.
- `pnpm test:stack` inteiro: **33 de 34** verdes, incluindo `verify.test.ts` (4) e, em `compose.test.ts`, os nove casos novos e `api_never_starts_when_bucket_init_fails`. O 34º é o vermelho pré-existente da `check-in` (CPF `987.654.321-00` repetido entre `photo_uploaded_through_web_...` e `check_in_through_web_...` na mesma stack, `409 cpf_taken`), registrado no `## Handoff` de `features/privacidade/checks.md` (batch C); **não foi tocado**, por estar fora dos 24 checks e pelo scope guardrail. Decisão do Lead em 2026-10-18: manter e reportar.
- Cada prova entrou no commit do slice em que o assembly que ela compara passa a existir: C1 e C8 (só `servers.ts`/`package.json`) no S1; C2 (compara `compose.yaml` com `servers.ts`) no S2; C19 a C24 no S3. Nenhum claim editado, nenhum teste afrouxado, apagado ou pulado.

Settled mid-build (sem tocar check nem door):

- (1) O `RUSTFS_OBS_LOG_DIRECTORY: ''` foi confirmado no binário antes da S2: o `docker logs` mostra `Initializing data directories: /data`, `OBS log directory not configured...` e as linhas JSON com `target: rustfs_...`, e `ls -A /logs` volta 0 - a Assumption "log do RustFS" está cumprida sem pergunta.
- (2) O volume nomeado funciona com o usuário `rustfs` da imagem (volume novo sobre `/data` sobe `healthy`), então a door 3 não precisou de `user:` nem de permissão extra.
- (3) O `docker compose up --wait` de repetição (C11) sai 0 porque a `api` depende de `storage-init` com `service_completed_successfully`; a prova confirma `storage-init` `exited` `0` e `api` `healthy` depois do segundo `up`.
- (4) O `testcontainers` já estava no lockfile como transitivo na mesma versão; o diff do `pnpm-lock.yaml` ficou mínimo em vez do `pnpm install` completo (que reescrevia sufixos de peer de outros importers). `pnpm install --frozen-lockfile` valida o resultado.
- (5) A imagem do RustFS não traz o `mc`; a criação do bucket nos testes continua pelo cliente S3 de `servers.ts`, e a listagem da stack pelo `aws-cli` da door 2.

Abandoned: nada. Nenhum check editado, nenhum teste fraco, nenhuma prova pulada. Os quatro casos de stack que usavam `mc` só trocaram o mecanismo de listagem, mantendo as mesmas asserções de chaves.

Nota para o Verifier: os 24 `Proof:` estão no corpo deste arquivo; a base é `a3276c9`; o perfil é `standard`; o vermelho pré-existente da `check-in` não é desta feature e não deve ser contado como regressão dela.
