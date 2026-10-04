# Fundação do projeto

## Problem

O repositório contém apenas o PRD. Não há onde uma feature do MVP pousar: nenhum monorepo, nenhum
banco, nenhuma forma combinada de responder erro, nenhum comando que diga se o código está são.
Quem começar pela primeira feature de produto (login) decide tudo isso por acidente, dentro de um
diff que deveria ser só sobre autenticação, e as 12 features seguintes copiam o que saiu.

O PRD não traz evidência numérica para esta etapa; o que ele fixa é o prazo do MVP (8–10 semanas,
§10) e os requisitos que a fundação sustenta: "TypeScript strict, cobertura de testes ≥ 70% no
domínio, CI com lint/testes/build", "Logs estruturados" e "segredos fora do repositório" (§4).

Quando isto entrar: um clone limpo sobe web, API e banco com um comando, a página inicial mostra
se a API está de pé, e existe um único comando cujo código de saída diz se o repositório está são.

## Flow

Nada a reutilizar - o repositório só tem o PRD. Este é o caminho que as próximas features
reutilizam em vez de recriar.

**Requisição**

1. navegador `GET /` -> `apps/web` (door 1) - componente de servidor busca o status com limite de 3 s
2. `apps/web` -> `GET /health` em `apps/api` (door 1) pela URL interna - resposta validada pelo schema de `packages/contracts` (door 5)
3. `apps/api` - request id e log por requisição (new, no door - placement per conventions), depois `SELECT 1` no Postgres (door 2)
4. out: `200` ou `503` no contrato de saúde (door 4); qualquer outro erro sai no contrato de erro (door 3)

**Subida**

1. `docker compose up` -> serviço `postgres` (door 2) fica `healthy`
2. serviço `migrate` (door 2) - execução única, aplica `packages/database/migrations` e termina
3. `apps/api` (door 1) - valida as variáveis de ambiente e só inicia depois de `migrate` sair com 0
4. `apps/web` (door 1) - inicia depois de `api` ficar `healthy`

**Portão de qualidade**

1. `pnpm verify` -> Turborepo (door 1) - lint, typecheck, testes e build por workspace
2. testes: Vitest e Playwright (door 6)
3. out: código de saída; o workflow de CI (new, no door - placement per conventions) roda o mesmo comando

## Impact

| Front | What changes |
| --- | --- |
| domain | nothing - nenhum termo de domínio nasce aqui; `students`, `staff` etc. entram nas features que os criam |
| convenção | identificadores (tabelas, rotas, código) em inglês e texto de interface em pt-BR, como o PRD já faz em §6 e §7 - toda feature seguinte herda |
| stored data | nothing to migrate - banco novo; a única migração habilita a extensão `pg_trgm` |
| repositório | a pasta deixa de ser só o PRD e passa a ser um repositório git com `.env` ignorado; `git init` acontece no Build desta feature |

## Relations

None - no stored-data shape change. Nenhuma entidade de domínio; a migração inicial só habilita
`pg_trgm`, que o PRD exige para a busca por nome (§6).

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `GET /health` | nada | `status` · `checks.database` | `200`, `503` |
| qualquer rota, em erro | a requisição como veio | `application/problem+json`: `type` · `title` · `status` · `code` · `requestId` | `400`, `404`, `408`, `413`, `500` |

Os comandos `pnpm verify`, `pnpm db:migrate` e `docker compose up` também são superfície (linha de
comando); suas decisões estão em `Observable`.

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. monorepo | pnpm workspaces + Turborepo; `apps/web` (Next.js 16), `apps/api` (NestJS), `packages/contracts`, `packages/config`, `packages/database`; versão do pnpm fixada em `packageManager` | npm workspaces - o hoisting deixa um app importar dependência que não declarou, e o build Docker por app quebra só em produção |
| 2. persistência | PostgreSQL 18 + Drizzle; migrações como arquivos SQL versionados em `packages/database/migrations`, aplicadas pelo serviço `migrate` antes da API subir | Prisma (alternativa viva, PRD §13.6) - schema em DSL própria, então os schemas Zod de `packages/contracts` não derivam da tabela sem gerador de terceiros; sincronizar schema no boot - não deixa histórico revisável |
| 3. contrato de erro | toda resposta de erro é `application/problem+json` com `{"type","title","status","code","requestId"}` e, em erro de validação, `"errors":[{"path","message"}]`; `code` é estável e em snake_case (`not_found`, `internal_error`, `validation_failed`); ressalva: vale para a requisição que o servidor HTTP entrega à aplicação - a que o servidor HTTP do Node rejeita antes disso (sem header `Host`, `Expect` inválido, cabeçalho grande demais, cabeçalhos nunca concluídos, linha de requisição inválida, `Content-Length` duplicado ou junto de `Transfer-Encoding`: `400`, `408`, `417`, `431`) fica fora, porque nesses casos a aplicação nunca é chamada, então não existe request id nem resposta dela, e em produção o proxy reverso fica na frente da API | formato padrão do NestJS `{statusCode,message,error}` - `message` é string ou array conforme o erro e não há código estável para o front ramificar |
| 4. contrato de saúde | `GET /health` sem autenticação -> `200 {"status":"ok","checks":{"database":"up"}}` ou `503 {"status":"degraded","checks":{"database":"down"}}`; cada dependência futura acrescenta uma chave em `checks` | só o healthcheck TCP do container - não distingue processo de pé de banco fora |
| 5. fonte dos contratos | cada payload tem um schema Zod em `packages/contracts`; a API valida e o web interpreta com o mesmo schema | DTOs com class-validator na API - segunda definição de cada campo, que o web não consegue importar |
| 6. testes | Vitest para unidade e integração, integração sempre contra Postgres real; Playwright para telas | Jest - segundo runner ao lado do que web e contracts usam; banco simulado - passa com SQL que o Postgres rejeita |

- Nothing else in this change is hard to reverse

## Criteria

### S1: A stack sobe com um comando (P1)

Um clone limpo vira web + API + banco de pé, e a API diz a verdade sobre o banco.

**Acceptance Criteria**

1. WHEN `docker compose up --build --wait` roda num clone limpo com `.env` copiado de `.env.example` THEN the system SHALL sair com código 0 com os serviços `postgres`, `api` e `web` em estado `healthy`
2. WHEN `GET /health` é chamado com o Postgres acessível THEN the system SHALL responder `200` com `{"status":"ok","checks":{"database":"up"}}`
3. IF o Postgres está inacessível THEN the system SHALL responder `GET /health` com `503` e `{"status":"degraded","checks":{"database":"down"}}` em até 3 s
4. IF uma variável de ambiente obrigatória está ausente ou inválida THEN the system SHALL encerrar o processo da API com código 1 imprimindo o nome da variável e nenhum valor
5. The system SHALL listar em `.env.example` toda variável exigida pelo schema de ambiente
6. The system SHALL manter `.env` fora do versionamento (`git check-ignore .env` sai com 0)

**Independent test:** clonar, copiar `.env.example`, subir com um comando, chamar `/health`; parar o Postgres e chamar de novo.

### S2: Erro e log têm uma forma só (P1)

Toda falha da API sai no mesmo contrato e toda requisição deixa uma linha rastreável.

**Acceptance Criteria**

7. WHEN uma rota inexistente é chamada THEN the system SHALL responder `404` com `Content-Type: application/problem+json` e `code` igual a `not_found`
8. IF um handler lança uma exceção não tratada THEN the system SHALL responder `500` com `code` igual a `internal_error`, sem stack trace e sem a mensagem da exceção no corpo
9. The system SHALL incluir o header `X-Request-Id` em toda resposta a uma requisição que o servidor HTTP entrega à aplicação, com o mesmo valor do campo `requestId` do corpo quando a resposta é de erro
10. WHEN a API termina de responder uma requisição que o servidor HTTP entregou à aplicação THEN the system SHALL escrever uma linha de log em JSON com `requestId`, `method`, `path`, `status` e `durationMs`

**Alcance das AC 9 e AC 10:** valem para toda requisição que o servidor HTTP entrega à aplicação,
o que acontece quando os cabeçalhos terminam. Continuam valendo quando o corpo dessa requisição é
rejeitado depois da entrega: tamanho de chunk inválido, corpo truncado, corpo que nunca termina.
Uma requisição que o servidor HTTP do Node rejeita antes da entrega (sem header `Host`, `Expect`
inválido, cabeçalho grande demais, cabeçalhos nunca concluídos, linha de requisição inválida,
`Content-Length` duplicado ou junto de `Transfer-Encoding`: `400`, `408`, `417`, `431`) fica fora.
Motivo: nesses casos a aplicação nunca é chamada, então não existe request id nem resposta dela, e
em produção o proxy reverso fica na frente da API.
Delimitação decidida pelo usuário em 2026-10-03, depois da rodada 2 de verificação; motivo e lista
corrigidos pelo usuário depois da rodada 3.

**Independent test:** chamar uma rota que não existe e conferir corpo, header e a linha de log com o mesmo id.

### S3: Migrações versionadas (P1)

O schema do banco só muda por arquivo versionado, e a API nunca sobe sobre um banco meio migrado.

**Acceptance Criteria**

11. WHEN `pnpm db:migrate` roda contra um banco vazio THEN the system SHALL aplicar todas as migrações, sair com código 0 e deixar a extensão `pg_trgm` instalada
12. WHEN `pnpm db:migrate` roda contra um banco já migrado THEN the system SHALL sair com código 0 sem alterar o schema
13. IF uma migração falha THEN the system SHALL sair de `pnpm db:migrate` com código diferente de 0
14. WHILE o serviço `migrate` não terminou com código 0 the system SHALL manter o serviço `api` sem iniciar

**Independent test:** rodar a migração duas vezes num banco vazio; inserir uma migração inválida e ver a API não subir.

### S4: Casca web (P1)

A página inicial prova o caminho navegador -> web -> API -> banco.

**Acceptance Criteria**

15. WHEN alguém abre `/` com a API saudável THEN the system SHALL exibir o título "Gestão de Academia" e o texto "API: operacional" num documento com `lang="pt-BR"`
16. IF a API não responde `200` em `/health` dentro de 3 s THEN the system SHALL exibir "API: indisponível" na mesma página, respondendo a página com `200`

**Independent test:** abrir `/` com tudo de pé; parar a API e recarregar.

### S5: Portão de qualidade (P1)

Um comando decide se o repositório está são, e o CI roda esse mesmo comando.

**Acceptance Criteria**

17. WHEN `pnpm verify` roda num clone limpo THEN the system SHALL executar lint, typecheck, testes e build de todos os workspaces e sair com código 0
18. IF lint, typecheck, teste ou build falha em qualquer workspace THEN the system SHALL sair de `pnpm verify` com código diferente de 0
19. The system SHALL compilar todos os workspaces com `strict: true` herdado de `packages/config`
20. The system SHALL conter o workflow `.github/workflows/ci.yml` que executa `pnpm verify` nos eventos `push` e `pull_request`

**Independent test:** rodar `pnpm verify`; introduzir um erro de tipo e rodar de novo.

## Out of scope

| Excluded | Why |
| --- | --- |
| Qualquer tabela ou tela de domínio (usuários, alunos, fotos...) | cada uma nasce na feature que a usa; ver `.specs/ROADMAP.md` |
| OpenAPI/Swagger | ainda não há endpoint com payload; entra em `auth-rbac`, junto das primeiras rotas reais |
| MinIO/S3, Valkey e `apps/worker` | nada aqui grava arquivo nem agenda job; entram em `foto-pipeline` |
| HTTPS, Caddy, HSTS, CSP | dependem da hospedagem, ainda em aberto (PRD §13.5); entram em `auth-rbac` (cabeçalhos) e `operacao` (deploy) |
| Métricas e alertas | o PRD pede "Prometheus/Grafana ou equivalente"; aqui só o log estruturado, o resto em `operacao` |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| ORM: Drizzle ou Prisma (PRD §13.6) | Drizzle | schema em TypeScript, do qual os contratos Zod derivam; migrações em SQL puro, necessárias para o log append-only e o índice trigram | y |
| Versão do PostgreSQL | 18 | estável atual; traz `uuidv7()` nativo, candidato a id das próximas tabelas | y |
| Versão do Node | 24 LTS | é a instalada na máquina (v24.21.0) | y |
| Provedor de CI | GitHub Actions | o PRD pede CI sem nomear provedor; ainda não existe remoto | y |
| Sistema de desenvolvimento | scripts de `package.json` sem depender de bash | a máquina de desenvolvimento é Windows 11 | y |
| Cobertura ≥ 70% no domínio (PRD §4) | o limiar é ligado em `auth-rbac`, primeira feature com código de domínio | aqui não há domínio para medir | y |
| Página `/` | provisória: `auth-rbac` a troca pelo login | o PRD não define tela pública; ela existe para provar o caminho | y |

**Open questions:** none - all resolved or logged above.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/` | empty state | n/a - não lista coleção nenhuma |
| screen `/` | loading state | n/a - renderizada no servidor; a resposta só sai com o status resolvido, limitado pelos 3 s da AC 16 |
| screen `/` | error state | AC 16 |
| screen `/` | unauthorised state | n/a - não há autenticação até `auth-rbac` e a página não mostra dado pessoal |
| screen `/` | density, ordering, destructive action | n/a - dois textos, nenhuma ação |
| API `GET /health` | response shape | AC 2 |
| API `GET /health` | error shape and codes | AC 3 |
| API `GET /health` | who may call it | n/a - sem autenticação por desenho (door 4): quem chama é o healthcheck do container, e a resposta só diz up ou down |
| API, todas as rotas | error shape and codes | AC 7, AC 8, AC 9 |
| API, todas as rotas | versioning | n/a - o único consumidor é `apps/web`, versionado e implantado junto |
| API, todas as rotas | rate limit | n/a - limite de requisições entra com RF-04 em `auth-rbac` |
| command `pnpm db:migrate` | exit codes | AC 11, AC 12, AC 13 |
| command `pnpm db:migrate` | flags and defaults | n/a - sem flags; lê `DATABASE_URL` do ambiente |
| command `pnpm db:migrate` | output format | n/a - saída do próprio migrador; nada a consome |
| command `pnpm db:migrate` | failure halfway | AC 13, AC 14 |
| command `pnpm verify` | exit codes | AC 17, AC 18 |
| command `pnpm verify` | flags, output format | n/a - sem flags; a saída é a das ferramentas e nada a consome |
| command `docker compose up` | exit codes, failure halfway | AC 1, AC 4, AC 14 |
| document `.env.example` | structure, what the reader does next | AC 5 |

## Sources

- `PRD — Sistema de Gestão de Academia.md` §4 e §5 - stack, estrutura do monorepo e requisitos não funcionais que a fundação sustenta
- `PRD — Sistema de Gestão de Academia.md` §13.6 - Drizzle ou Prisma deixado em aberto
