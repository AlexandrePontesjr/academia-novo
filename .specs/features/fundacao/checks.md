# Fundação do projeto - checks

Profile: light
Plan: `.specs/features/fundacao/plan.md`

## Intent

30 checks in 5 slices · 6 one-way doors · 0 open

## Checks

Como ler as provas. O repositório ainda não tem código, então os comandos vêm das doors aprovadas
(pnpm + Turborepo, Vitest, Playwright) e os arquivos de teste nomeados aqui são criados no Build.
Três regras valem para todas:

- Toda prova roda num clone limpo tendo só Docker em execução: o teste sobe o Postgres de que
  precisa, ninguém prepara banco à mão.
- `tests/repo` é rápido e entra em `pnpm verify`. `tests/stack` usa `docker compose` e clones
  temporários, é lento e fica fora de `pnpm verify` (senão a C26 chamaria a si mesma).
- As provas de `apps/web` controlam a API que o web enxerga (de pé, `503`, pendurada, recusando
  conexão); o caminho real até o banco é provado na stack, pela C25.

### S1 - A stack sobe com um comando · ~25 files · ~40 KB · ~10k

**C1** - Num clone limpo com `.env` copiado de `.env.example`, `docker compose up --build --wait` sai com código 0 e os serviços `postgres`, `api` e `web` estão `healthy` (AC 1)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "up_wait_exits_zero_with_three_healthy"`

**C2** - Com o Postgres acessível, `GET /health` sem credencial responde `200` com exatamente `{"status":"ok","checks":{"database":"up"}}` (AC 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/health.test.ts -t "health_ok_200"`

**C3** - Com o Postgres recusando conexão, `GET /health` responde `503` com exatamente `{"status":"degraded","checks":{"database":"down"}}` (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/health.test.ts -t "health_503_when_db_refuses"`

**C4** - Com o Postgres aceitando a conexão e não respondendo, `GET /health` responde `503` com o corpo `degraded` em até 3 s (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/health.test.ts -t "health_503_within_3s_when_db_hangs"`

**C5** - Para cada variável obrigatória do schema de ambiente, iniciar o processo real da API sem ela termina com código 1 e imprime o nome dessa variável (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "missing_var_exits_1_naming_it"`

**C6** - Iniciar o processo real da API com `DATABASE_URL` de valor inválido termina com código 1 e imprime `DATABASE_URL` (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "invalid_var_exits_1_naming_it"`

**C7** - A saída da falha de ambiente não contém o valor de nenhuma variável definida, incluindo a senha dentro de `DATABASE_URL` (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "env_failure_prints_no_values"`

**C8** - Toda chave obrigatória dos schemas de ambiente de `apps/api` e `apps/web` aparece em `.env.example` (AC 5)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "env_example_lists_every_required_key"`

**C9** - `git check-ignore .env` sai com código 0 (AC 6)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "dotenv_is_git_ignored"`

**C10** - O serviço `postgres` da stack roda PostgreSQL de versão principal 18 (door 2)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "postgres_major_is_18"`

### S2 - Erro e log têm uma forma só · ~8 files · ~16 KB · ~4k

**C11** - Uma rota inexistente responde `404` com `Content-Type: application/problem+json` e corpo com `type`, `title`, `status` igual a 404, `code` igual a `not_found` e `requestId` (AC 7, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/problem.test.ts -t "unknown_route_404_problem"`

**C12** - Um handler que lança exceção não tratada responde `500` em `application/problem+json` com `code` igual a `internal_error`, e o corpo não contém a mensagem da exceção nem stack trace (AC 8, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/problem.test.ts -t "unhandled_500_hides_exception"`

**C13** - O header `X-Request-Id` está presente e não vazio nas respostas `200`, `503`, `404` e `500` (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/request-id.test.ts -t "header_on_every_status"`

**C14** - Nas respostas `404` e `500`, o valor de `X-Request-Id` é igual ao campo `requestId` do corpo (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/request-id.test.ts -t "header_equals_body_request_id"`

**C15** - Cada requisição respondida gera exatamente uma linha de log em JSON com `requestId`, `method`, `path`, `status` e `durationMs`, e o `requestId` é o mesmo do header (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/logging.test.ts -t "one_json_line_per_request"`

**C16** - No processo real da stack, uma rota inexistente responde `404` em `application/problem+json` com `X-Request-Id` igual ao `requestId` do corpo (AC 7, AC 9)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "running_api_uses_error_contract"`

**C17** - As respostas reais de `GET /health` (`200` e `503`) e o corpo de erro `404` validam contra os schemas exportados por `packages/contracts` (door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "responses_match_contract_schemas"`

### S3 - Migrações versionadas · ~6 files · ~8 KB · ~2k

**C18** - `pnpm db:migrate` contra um banco vazio sai com código 0 e deixa a extensão `pg_trgm` instalada (AC 11)
Proof: `pnpm --filter "./packages/database" exec vitest run test/migrate.test.ts -t "empty_db_migrates_and_installs_pg_trgm"`
Status: concluído

**C19** - Uma segunda execução de `pnpm db:migrate` sai com código 0 e deixa o schema e o registro de migrações aplicadas idênticos aos de antes (AC 12)
Proof: `pnpm --filter "./packages/database" exec vitest run test/migrate.test.ts -t "second_run_changes_nothing"`
Status: concluído

**C20** - Com uma migração de SQL inválido, `pnpm db:migrate` sai com código diferente de 0 (AC 13)
Proof: `pnpm --filter "./packages/database" exec vitest run test/migrate.test.ts -t "failing_migration_exits_nonzero"`
Status: concluído

**C21** - Quando o serviço `migrate` termina com código diferente de 0, `docker compose up --wait` sai com código diferente de 0 e o container `api` nunca chega a iniciar (AC 14)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "api_never_starts_when_migrate_fails"`

### S4 - Casca web · ~8 files · ~12 KB · ~3k

**C22** - Com a API respondendo `200` em `/health`, a página `/` responde `200`, exibe o título "Gestão de Academia" e o texto "API: operacional", e o elemento `html` tem `lang="pt-BR"` (AC 15)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/home.spec.ts -g "shows_api_operational"`

**C23** - Com a API respondendo `503`, pendurada ou recusando conexão, a página `/` responde `200` e exibe "API: indisponível" (AC 16)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/home.spec.ts -g "shows_api_unavailable"`

**C24** - Com a API pendurada, a página `/` responde em até 4 s (os 3 s do limite mais 1 s de margem) (AC 16)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/home.spec.ts -g "hung_api_answers_within_4s"`

**C25** - Na stack de pé, a página `/` servida pelo container `web` exibe "API: operacional" (AC 15)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "home_reports_api_operational"`

### S5 - Portão de qualidade · ~10 files · ~14 KB · ~4k

**C26** - Num clone limpo, depois de `pnpm install --frozen-lockfile`, `pnpm verify` sai com código 0 (AC 17)
Proof: `pnpm --filter "./tests/stack" exec vitest run verify.test.ts -t "verify_exits_zero_on_clean_clone"`

**C27** - `pnpm verify` executa as tarefas `lint`, `typecheck`, `test` e `build`; as quatro alcançam `apps/api` e `apps/web`, e `lint`, `typecheck` e `test` alcançam também `packages/contracts` e `packages/database` (AC 17, door 1)
Proof: `pnpm --filter "./tests/stack" exec vitest run verify.test.ts -t "verify_runs_four_tasks_across_workspaces"`

**C28** - Uma falha injetada em cada uma das tarefas `lint`, `typecheck`, `test` e `build` faz `pnpm verify` sair com código diferente de 0 (AC 18)
Proof: `pnpm --filter "./tests/stack" exec vitest run verify.test.ts -t "verify_fails_on_each_broken_task"`

**C29** - A configuração TypeScript resolvida de cada workspace tem `strict` igual a `true` e estende a base de `packages/config` (AC 19)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "every_workspace_is_strict"`

**C30** - `.github/workflows/ci.yml` existe, dispara em `push` e em `pull_request` e executa `pnpm verify` (AC 20)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "ci_runs_verify_on_push_and_pr"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /health` statuses (2) | 200 C2 · 503 C3 | - |
| erro em qualquer rota, statuses (2) | 404 C11 · 500 C12 | - |
| Postgres inacessível (2) | recusa conexão C3 · aceita e não responde C4 | - |
| variável de ambiente rejeitada (2) | ausente C5 · inválida C6 | - |
| `code` emitidos nesta feature (2) | `not_found` C11 · `internal_error` C12 | - |
| respostas com `X-Request-Id` (4) | C13, table-driven over all 4: 200, 503, 404, 500 | - |
| campos da linha de log (5) | `requestId` C15 · `method` C15 · `path` C15 · `status` C15 · `durationMs` C15 | - |
| serviços `healthy` (3) | `postgres` C1 · `api` C1 · `web` C1 | - |
| API indisponível para o web (3) | C23, table-driven over all 3: 503, pendurada, recusa conexão | - |
| tarefas do `pnpm verify` (4) | `lint` C27 · `typecheck` C27 · `test` C27 · `build` C27 | - |
| tarefa quebrada derruba o verify (4) | C28, table-driven over all 4: lint, typecheck, test, build | - |
| eventos do CI (2) | `push` C30 · `pull_request` C30 | - |
| one-way doors (6) | door 1 C27 · door 2 C18 · door 3 C11 · door 4 C2 · door 5 C17 · door 6 C2 | - |
| startup config: contrato de erro e request id (2 assemblies) | processo real na stack C16 · harness de teste C11 | - |

- Claims naming a status code, route or response shape: C2, C3, C4, C11, C12, C13, C14, C16, C22, C23 - each has a proof that crosses the HTTP boundary
- C5 é table-driven sobre todas as variáveis obrigatórias do schema; a enumeração vive no teste, lida do próprio schema
- A door 3 também declara `validation_failed` com `errors[]`, mas nenhuma rota desta feature recebe entrada e o plano não fixou o status dessa resposta. Não há check para ela aqui: o status e a prova entram em `auth-rbac`, na primeira rota com payload (registrado em `.specs/ROADMAP.md`)
- "Todos os workspaces" da AC 17 foi lido como em C27: `packages/config` só carrega configuração, e os pacotes internos não precisam de etapa de build

## Swept

- validation: C5, C6
- failure modes: C20, C21
- idempotency: C19
- authorization: n/a - nenhuma rota autenticada nesta feature; `GET /health` é aberto por desenho (door 4) e a autenticação entra em `auth-rbac`
- concurrency: n/a - `migrate` é um serviço único de execução única e `GET /health` só lê; não há dois escritores
- data lifecycle: n/a - nenhuma tabela de domínio nem dado pessoal; os logs vão para stdout e sua retenção é de `operacao`
- dependency failure: C3, C4, C23
- state transitions: C21
- observability: C13, C15

## Handoff

- Não há arquivo para medir com `wc -c`; os tamanhos são estimativa do que será criado. S1 = 10k, S2 = 4k, S3 = 2k, S4 = 3k, S5 = 4k: 23k de código novo, mais 9k de `plan.md` e `checks.md`, 32k no total, abaixo do orçamento de 150k - one builder
