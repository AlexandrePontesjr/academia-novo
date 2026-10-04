# Project state

## Decisions

AD-001 a AD-006 vêm do PRD. AD-007 a AD-012 são as doors do plano da `fundacao`, aprovado em
2026-10-02; a forma literal de cada uma está em `features/fundacao/plan.md` (Landing). AD-013 a
AD-015 são convenções que nasceram no Build da `fundacao` e que as próximas features herdam.
AD-016 a AD-023 são as doors 1, 2, 5, 6, 8, 9, 10 e 13 do plano da `auth-rbac`, aprovado em
2026-10-03; a forma literal de cada uma está em `features/auth-rbac/plan.md` (Landing). As
propostas ainda não confirmadas estão em `ROADMAP.md` (Decisões em aberto).

| ID | Decision | Rationale | Status | Date |
| --- | --- | --- | --- | --- |
| AD-001 | Monólito modular em monorepo: `apps/web` (Next.js 16), `apps/api` (NestJS), `apps/worker`, e `packages/` compartilhados; sem microsserviços | PRD §5 | active | 2026-10-02 |
| AD-002 | PostgreSQL é o único banco de dados | PRD §5 | active | 2026-10-02 |
| AD-003 | Identificadores (tabelas, rotas, código) em inglês; texto de interface em pt-BR | PRD §6 e §7 já nomeiam assim; §4 Idioma | active | 2026-10-02 |
| AD-004 | Permissão é verificada no backend em todo endpoint, nunca só no front | RF-03 | active | 2026-10-02 |
| AD-005 | Foto nunca é servida por URL pública permanente: bucket privado e URL assinada de curta duração | RF-17, PRD §14 | active | 2026-10-02 |
| AD-006 | Entrada validada com Zod, schemas em `packages/contracts` | PRD §4 Segurança e §5 | active | 2026-10-02 |
| AD-007 | pnpm workspaces + Turborepo; `pnpm verify` é o único portão de qualidade, e o CI roda esse comando | npm workspaces deixa um app importar dependência não declarada | active | 2026-10-02 |
| AD-008 | PostgreSQL 18 + Drizzle; o schema só muda por migração SQL versionada em `packages/database/migrations`, aplicada antes de a API subir | histórico revisável; contratos Zod derivam do schema em TypeScript | active | 2026-10-02 |
| AD-009 | Toda resposta de erro da API é `application/problem+json` com `type`, `title`, `status`, `code` estável em snake_case e `requestId`; ressalva: vale para a requisição que o servidor HTTP entrega à aplicação, inclusive quando o corpo dela é rejeitado depois da entrega - a que o servidor HTTP do Node rejeita antes disso (sem header `Host`, `Expect` inválido, cabeçalho grande demais, cabeçalhos nunca concluídos, linha de requisição inválida, `Content-Length` duplicado ou junto de `Transfer-Encoding`) fica fora | o front ramifica por `code`, nunca por texto | active | 2026-10-02 |
| AD-010 | `GET /health` é aberto e responde `200`/`503` com uma chave por dependência em `checks`; cada dependência nova acrescenta a sua | distingue processo de pé de dependência fora | active | 2026-10-02 |
| AD-011 | Cada payload tem um único schema Zod em `packages/contracts`, usado pela API e pelo web | uma definição por campo | active | 2026-10-02 |
| AD-012 | Vitest para unidade e integração, integração sempre contra Postgres real; Playwright para telas | banco simulado passa com SQL que o Postgres rejeita | active | 2026-10-02 |
| AD-013 | Os pacotes de `packages/` são consumidos como código-fonte TypeScript, sem etapa de build; o app que os importa os empacota (esbuild na API, `transpilePackages` no web) e declara as dependências npm que eles usam em runtime | um clone limpo roda testes e typecheck sem build prévio | active | 2026-10-03 |
| AD-014 | TypeScript fica em `~6.0` (catálogo do pnpm) até o `typescript-eslint` aceitar a 7 | o `typescript-eslint` 8.71 exige `typescript <6.1.0` | active | 2026-10-03 |
| AD-015 | Cada app valida o ambiente por um schema Zod em `src/env.ts` e não sobe sem ele; toda chave obrigatória entra em `.env.example` (o teste `tests/repo` falha se faltar) | falha de configuração aparece na subida, nomeando a variável e sem imprimir valor | active | 2026-10-03 |
| AD-016 | Uma instalação por academia: nenhuma tabela tem `tenant_id`, e o segmento `{tenant}` da chave de foto fica com valor fixo (door 1) | multi-unidade é fase 3 (PRD §1.4); virar multi-unidade exige migração com backfill em todas as tabelas | active | 2026-10-03 |
| AD-017 | Autenticação pelo Better Auth usado como biblioteca: chamado só por `auth.api.*` de dentro de controllers do Nest, com `returnHeaders: true` para repassar os `Set-Cookie`; o handler HTTP dele não é montado e o cadastro aberto fica desativado (door 2) | montado, o handler responde erro fora do `problem+json` (AD-009) e deixa as rotas fora dos schemas de `packages/contracts` (AD-011) e do OpenAPI; Auth.js não traz TOTP | active | 2026-10-03 |
| AD-018 | `users.role` é um valor único por usuário, um de `admin`, `reception`, `hr_finance`, `instructor`; funcionário com dois papéis recebe o mais amplo (door 5) | PRD §6 define `role` no singular e a matriz do §2 não tem caso que precise de dois; mudar depois é migração de coluna para tabela | active | 2026-10-03 |
| AD-019 | Origem única: o navegador só fala com a origem do web, que repassa `/api/*` à API; toda rota de aplicação vive sob `/api`, e `/health` fica na raiz (door 6) | cookie sem `Domain` nem `SameSite=None`, sem depender da hospedagem; o upload de foto também entra pela origem do web | active | 2026-10-03 |
| AD-020 | CSRF por checagem de origem: toda requisição `/api` fora de `GET`, `HEAD` e `OPTIONS` exige `Origin` igual a `WEB_ORIGIN` ou, sem `Origin`, `Sec-Fetch-Site: same-origin`; senão `403` com `csrf_rejected` (door 8) | numa aplicação de origem única dá o mesmo resultado que token, sem rota de token nem campo em todo formulário | active | 2026-10-03 |
| AD-021 | Completa a AD-009: corpo legível que não passa no schema responde `422` com `validation_failed` e `errors: [{ path, message }]` (`path` em notação de ponto, `message` em pt-BR); corpo ilegível continua `400 bad_request`. Status novos de erro de aplicação: `401`, `403`, `409`, `422`, `429`, cada um com `code` explícito (door 9) | `400` misturaria defeito do cliente com dado digitado errado em qualquer métrica ou proxy que conte por status | active | 2026-10-03 |
| AD-022 | Acesso negado por padrão: toda rota declara exatamente um de `@Public()`, `@Authenticated()` ou `@Roles(...)`, uma guarda global aplica, e rota `/api` sem declaração impede a API de subir (door 10) | guarda aplicada rota a rota deixa aberta a rota em que alguém a esqueceu, e nada acusa (RF-03, AD-004) | active | 2026-10-03 |
| AD-023 | Interface em Tailwind CSS + shadcn/ui em `packages/ui`; formulários com React Hook Form validando pelo schema Zod de `packages/contracts` (door 13) | PRD §5 fixa a pilha; sem base comum cada tela copiaria o padrão da primeira | active | 2026-10-03 |

## Handoff

**Feature**: auth-rbac
**Where**: plano aprovado em 2026-10-03 como está (door 2, Better Auth como biblioteca; as 15 linhas de `Assumptions` confirmadas) e registrado como AD-016 a AD-023. `features/auth-rbac/checks.md` escrito no profile light com 102 checks em 9 slices; `validate_checks.py auth-rbac` sai com 0. Aguardando a revisão dos checks; nenhum código escrito
**In progress**: nada
**Next step**: revisar `features/auth-rbac/checks.md`. Aprovado, o Build começa pela C1 sozinha (plugin `twoFactor` por `auth.api` com `returnHeaders`); se ela reprovar, a door 2 volta para revisão antes de qualquer outro código. Três pontos levados à revisão: o texto das mensagens de validação em pt-BR não está fixado no plano (C17); linhas vencidas de `sessions`, `verifications` e `login_throttles` não têm limpeza; a estimativa é 127k de 150k, com o corte já escrito antes de S7
**Blockers**: nenhum
**Uncommitted**: `.specs/STATE.md`, `.specs/ROADMAP.md`, `.specs/features/auth-rbac/` (`plan.md`, `checks.md`), `CLAUDE.md`
**Branch**: main

Pendências da `fundacao`, sem dono ainda: o achado F4 da rodada 4 continua em aberto, sem reprovar check; a linha de `Coverage` "erro em qualquer rota, statuses (2)" de `features/fundacao/checks.md` lista menos status que a `Surface` (`400` e `408` são provados pela C31; `413` não tem check). Com a `auth-rbac`, C22 a C25 da `fundacao` deixam de valer (registrado em `features/auth-rbac/checks.md`)
