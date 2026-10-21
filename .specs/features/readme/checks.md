# README checks

Profile: light

Sem `plan.md`: mudança de documentação com dois arquivos e nenhuma one-way door - o escape de
mudança pequena do `tlc-spec-lean`. O problema e o resultado estão no `## Intent`.

## Intent

Hoje não existe `README.md`: quem chega ao repositório só descobre o que o sistema faz, o que
precisa estar instalado e por onde subir a stack depois de abrir o PRD, o `.specs/` ou o runbook de
`deploy/`. Este trabalho escreve o README da raiz, em pt-BR, com o que o sistema faz, a stack e a
arquitetura, os requisitos, o caminho de primeira subida que o repositório já prova (`.env` a
partir do `.env.example`, `docker compose up --build --wait` e o primeiro Administrador), os
comandos de qualidade, a estrutura do monorepo, a porta de cada serviço e onde ficam a documentação
viva e o deploy. Depois disso, um leitor novo tem num arquivo só o caminho até a stack de pé - e os
fatos que o README afirma sobre o repositório passam a ser provados por um teste em `tests/repo`,
que roda no `pnpm verify`: comando `pnpm` que não existe, link relativo quebrado ou versão
diferente da do `package.json` reprovam a suíte.

7 checks in 2 slices · 0 one-way doors · 0 open

## Checks

### S1 - README.md · 1 file · ~10 KB · ~2,5k

**C1** - `README.md` existe na raiz, a primeira linha é `# academia-bairro` e o texto diz que o
sistema é um sistema web de gestão (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run readme.test.ts -t "readme_exists_with_the_project_title"`

**C2** - Todo comando `pnpm <script>` citado em código no README é um script da raiz no
`package.json`, e os quatro scripts da raiz - `verify`, `db:migrate`, `users:create-admin` e
`test:stack` - são citados (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run readme.test.ts -t "readme_names_only_root_scripts_that_exist"`

**C3** - A versão de Node.js e a de pnpm que o README exige são as que o `package.json` da raiz
declara em `engines.node` (24) e `packageManager` (12.9.1): o teste lê os dois manifestos e exige
os valores no texto (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run readme.test.ts -t "readme_states_the_node_and_pnpm_versions_from_the_manifests"`

**C4** - Todo link relativo do README aponta para um caminho versionado no git, e o README linka o
PRD, `.specs/ROADMAP.md`, `.specs/STATE.md`, `deploy/README.md` e `.env.example` (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run readme.test.ts -t "readme_relative_links_resolve_to_existing_paths"`

**C5** - O README cita `http://localhost:3000` e `http://localhost:3001/health`, com as portas
iguais a `WEB_PORT` e `PORT` do `.env.example`, e documenta o primeiro passo da subida
(`cp .env.example .env` e `docker compose up --build --wait`) (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run readme.test.ts -t "readme_documents_the_ports_of_the_env_example"`

**C6** - O README documenta o primeiro Administrador pelo comando real (`docker compose exec` com
`pnpm users:create-admin`), a senha em `ADMIN_PASSWORD` e o limite de 12 a 128 caracteres (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run readme.test.ts -t "readme_documents_the_first_administrator_command"`

**C7** - O README cita todo diretório de workspace do `pnpm-workspace.yaml` e o `deploy/`, e cada
um desses caminhos existe no repositório (Intent)
Proof: `pnpm --filter "./tests/repo" exec vitest run readme.test.ts -t "readme_covers_every_workspace_directory"`

### S2 - prova do README · 1 file · ~6 KB · ~1,5k

A prova é o arquivo `tests/repo/readme.test.ts`, que roda no `pnpm verify` da raiz (a suíte
`@academia/repo-tests`). Os sete checks acima são os sete testes dele; a prova de cada check é o
seletor `-t` do próprio teste.

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| scripts da raiz citados (4) | `verify` C2 · `db:migrate` C2 · `users:create-admin` C2 · `test:stack` C2 | - |
| documentos vivos linkados (5) | PRD C4 · `ROADMAP.md` C4 · `STATE.md` C4 · `deploy/README.md` C4 · `.env.example` C4 | - |
| diretórios de workspace citados (9) | `apps/web` C7 · `apps/api` C7 · `packages/config` C7 · `packages/contracts` C7 · `packages/database` C7 · `packages/ui` C7 · `tests/repo` C7 · `tests/stack` C7 · `deploy` C7 | - |
| passos de primeira subida (3) | `cp .env.example .env` C5 · `docker compose up --build --wait` C5 · `docker compose exec` + `pnpm users:create-admin` C6 | - |
| limites da senha do Administrador (2) | 12 C6 · 128 C6 | - |

- Claims que nomeiam caminho, porta ou comando de manifesto: C2, C3, C4, C5, C6, C7 - cada uma
  tem prova que lê o arquivo de origem (manifesto, `.env.example` ou árvore do repositório)
- Nenhum check afirma mais do que o caso que a prova exercita

## Swept

- validation: C2, C3 - o manifesto é a autoridade dos scripts e das versões, e a prova recusa a divergência
- failure modes: C4 - um link relativo quebrado reprova a suíte em vez de sair no README
- idempotency: n/a - a mudança é um documento; rodar a prova de novo não altera nada
- authorization: n/a - documento estático; ele descreve o RBAC, mas não acrescenta rota nem guarda
- concurrency: n/a - um arquivo escrito uma vez, sem estado compartilhado
- data lifecycle: n/a - nenhum dado é guardado ou migrado
- dependency failure: n/a - a prova usa `node:fs` e o `yaml` já declarado em `tests/repo`; sem dependência nova
- state transitions: n/a - nenhuma máquina de estado é tocada
- observability: n/a - documentação não é logada nem medida

## Out of scope

- `CONTRIBUTING.md` e templates de issue - não pedidos; o README aponta o PRD e as specs no lugar
- README em inglês - a documentação do projeto e a interface são em pt-BR (AD-003)
- Imagens, badges e diagramas renderizados - o README é texto; a arquitetura vem em prosa
- Atualizar `.specs/ROADMAP.md` e `.specs/STATE.md` - o README descreve o sistema, não o estado das features

## Handoff

- S1 = README.md ~10 KB (~2,5k tokens); S2 = `tests/repo/readme.test.ts` ~6 KB (~1,5k tokens);
  total ~4k, sob o budget de 150k - um builder, sem handoff. Mecanismo: one builder (Lead).
