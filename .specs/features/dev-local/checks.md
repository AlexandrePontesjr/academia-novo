# Desenvolvimento local checks

Profile: light

Sem `plan.md`: ferramenta de desenvolvimento, sem mudança de comportamento do produto e sem
one-way door - o escape de mudança pequena do `tlc-spec-lean`. O problema e o resultado estão no
`## Intent`.

## Intent

Hoje o único caminho documentado é a stack inteira em containers (`docker compose up --build
--wait`): cada mudança em `apps/api` ou `apps/web` exige reconstruir a imagem, e não existe comando
que rode a API e o web na máquina em watch. Este trabalho acrescenta os comandos de
desenvolvimento: `pnpm setup` instala as dependências, cria o `.env` a partir do `.env.example` e
deixa o banco e o bucket prontos; `pnpm dev` garante essa infraestrutura em container e roda a API e
o web na máquina em watch, com a API em verde e o web em azul; `dev:db`, `dev:api` e `dev:web` rodam
cada peça separada. O README ganha a seção que mostra esse caminho ao lado do caminho da stack.

7 checks in 2 slices · 0 one-way doors · 0 open

## Checks

### S1 - scripts de desenvolvimento · 5 files · ~9 KB · ~2,5k

**C1** - `pnpm setup` roda `pnpm install` e o `scripts/dev-setup.mjs`, que copia `.env.example` para
`.env` só quando o `.env` ainda não existe e nunca sobrescreve um `.env` existente (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run dev.test.ts -t "dev_setup_installs_and_creates_the_env_file_once"`

**C2** - `pnpm dev:db` sobe só `postgres` e `storage` em container, roda a execução única
`storage-init` e aplica as migrações; nenhum serviço `api` ou `web` sobe nesse modo (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run dev.test.ts -t "dev_db_starts_only_the_database_and_storage"`

**C3** - `pnpm dev:api` roda a API na máquina em watch: o `build.mjs` cria o watcher do esbuild e
reinicia o processo da API a cada recompilação bem-sucedida, com o `.env` da raiz carregado
(Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run dev.test.ts -t "api_dev_script_watches_and_reloads_the_built_api"`

**C4** - `pnpm dev:web` roda o `next dev` na máquina carregando o `.env` da raiz, então `API_URL`
aponta para `http://localhost:3001` (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run dev.test.ts -t "web_dev_script_runs_next_dev_with_the_root_env_file"`

**C5** - `pnpm dev` roda `pnpm dev:db` antes de subir os processos e sobe a API e o web pelo
`scripts/dev.mjs`, com os rótulos `[api]` em verde e `[web]` em azul, encerrando os dois quando um
deles sai (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run dev.test.ts -t "dev_script_runs_the_api_in_green_and_the_web_in_blue"`

**C6** - O orquestrador não acrescenta dependência: `scripts/dev.mjs` importa só módulos `node:`,
então o guard `dukfit_adds_no_npm_dependency` da suíte continua valendo (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run dev.test.ts -t "dev_orchestrator_uses_only_the_node_standard_library"`

### S2 - README · 1 file · ~2 KB · ~0,5k

**C7** - O README documenta os cinco comandos em código, o que sobe em container e o que roda na
máquina, e as portas 3000 (web) e 3001 (API) do modo de desenvolvimento (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run dev.test.ts -t "readme_documents_the_local_development_commands"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| comandos de desenvolvimento (5) | `setup` C1 · `dev` C5 · `dev:db` C2 · `dev:api` C3 · `dev:web` C4 | - |
| processos do `pnpm dev` (2) | api C5 · web C5 | - |
| containers do `dev:db` (2) | `postgres` C2 · `storage` C2 | - |
| passos do `dev:db` (3) | `docker compose up -d --wait postgres storage` C2 · `docker compose run --rm storage-init` C2 · `pnpm db:migrate` C2 | - |
| cores do `pnpm dev` (2) | verde para api C5 · azul para web C5 | - |
| `.env` da raiz carregado (2) | api C3 · web C4 | - |
| módulos importados pelo orquestrador (2) | `node:child_process` C6 · `node:url` C6 | - |
| comandos documentados no README (5) | `setup` C7 · `dev` C7 · `dev:db` C7 · `dev:api` C7 · `dev:web` C7 | - |

- Claims que nomeiam script, processo, container ou porta: C1 a C7 - cada prova lê o arquivo que
  declara a peça (`package.json`, `scripts/dev-setup.mjs`, `build.mjs`, `README.md`)
- A prova é de fiação (o arquivo declara o comando, o processo e o container), não de comportamento
  em tempo de execução: o smoke de `pnpm dev` foi feito no Build e está registrado no Handoff

## Swept

- validation: C3, C5 - a prova exige o carregamento do `.env` e o reinício no watch, e C1 o `.env` que não existe
- failure modes: C2 - `dev:db` não sobe `api` nem `web`, então o modo não disputa as portas da stack
- idempotency: C1 - `pnpm setup` e `dev-setup` rodam de novo sem sobrescrever o `.env`; C2 - `up -d --wait` e `storage-init` são idempotentes
- authorization: n/a - scripts de desenvolvimento locais; nenhuma rota, guarda ou permissão muda
- concurrency: C5 - o orquestrador encerra os dois processos quando um deles sai, e o Ctrl+C derruba a árvore inteira
- data lifecycle: n/a - nenhuma migração ou tabela nova; `dev:db` só aplica as migrações existentes
- dependency failure: C2 - `docker compose` falha antes de `dev:api`/`dev:web` quando a infra não sobe, porque `pnpm dev` encadeia `dev:db` com `&&`
- state transitions: n/a - nenhuma máquina de estado do produto é tocada
- observability: C5 - a saída de cada processo sai rotulada e colorida, para separar API e web no terminal

## Out of scope

- Provar em `pnpm verify` o comportamento do `pnpm dev` (subir API e web e fazer requisição): o
  `verify` roda no CI sem a stack de pé; o smoke foi feito no Build e o comando fica documentado
- Web em porta diferente de 3000 no modo de desenvolvimento - `next dev` usa o padrão e o
  `WEB_ORIGIN` do `.env.example` é `http://localhost:3000`; trocar a porta exige mudar os dois
- Hot reload do web customizado ou da API por outro bundler - ficou `next dev` e o esbuild do
  `build.mjs` reiniciando o processo.

## Handoff

- S1 = 7 arquivos (`package.json`, os dois `package.json` de app, `scripts/dev-setup.mjs`,
  `scripts/dev-web.mjs`, `scripts/dev.mjs` e `apps/api/build.mjs`) ~12 KB, ~3k tokens; S2 = README
  ~2 KB, ~0,5k; prova `dev.test.ts` ~6 KB, ~1,5k; total ~5k, sob o budget de 150k - um builder, sem
  handoff. Mecanismo: one builder (Lead). Sem dependência nova (C6): o guard
  `dukfit_adds_no_npm_dependency` de `tests/repo/identidade.test.ts` continua verde.
- **Settled mid-build:** `concurrently` foi descartado - o guard de dependência acima recusa pacote
  novo, e o orquestrador virou `scripts/dev.mjs` com só módulos do Node (C6).
- **Abandoned:** passar `--env-file-if-exists` direto ao `next dev` - o Next repassa o `execArgv` via
  `NODE_OPTIONS` ao processo que ele forka e o Node recusa a flag; o carregamento do `.env` foi para
  `scripts/dev-web.mjs`. E `node --watch dist/main.js` - ele observa todo módulo importado, inclusive
  em `node_modules`, e reiniciava sem mudança de código; o reinício passou a sair do `onEnd` do
  esbuild.
- **Smoke do Build** (Windows, Docker Desktop, HEAD desta feature): `pnpm setup` saiu com 0
  (dependências, `.env`, containers, migração); `pnpm dev:db` rodou de novo sem erro; `pnpm dev`
  subiu a API em `:3001` (`/health` 200 com `database` e `storage` up) e o web em `:3000` (landing
  200), com `[api]` verde e `[web]` azul; encerrar o `pnpm dev` deixou as portas 3000/3001 livres e
  nenhum processo `node`/`pnpm`; `pnpm dev:api` reiniciou o processo ao tocar em `src/main.ts`; com a
  API fora, `pnpm dev:web` respondeu `502 bad_gateway` em `/api/health`, o que prova que o `API_URL`
  do `.env` foi carregado. Os containers `postgres` e `storage` seguem de pé (é o que `dev:db` faz).

