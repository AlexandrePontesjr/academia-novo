# Project state

## Decisions

AD-001 a AD-006 vêm do PRD. AD-007 a AD-012 são as doors do plano da `fundacao`, aprovado em
2026-10-02; a forma literal de cada uma está em `features/fundacao/plan.md` (Landing). AD-013 a
AD-015 são convenções que nasceram no Build da `fundacao` e que as próximas features herdam. As
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
| AD-009 | Toda resposta de erro da API é `application/problem+json` com `type`, `title`, `status`, `code` estável em snake_case e `requestId` | o front ramifica por `code`, nunca por texto | active | 2026-10-02 |
| AD-010 | `GET /health` é aberto e responde `200`/`503` com uma chave por dependência em `checks`; cada dependência nova acrescenta a sua | distingue processo de pé de dependência fora | active | 2026-10-02 |
| AD-011 | Cada payload tem um único schema Zod em `packages/contracts`, usado pela API e pelo web | uma definição por campo | active | 2026-10-02 |
| AD-012 | Vitest para unidade e integração, integração sempre contra Postgres real; Playwright para telas | banco simulado passa com SQL que o Postgres rejeita | active | 2026-10-02 |
| AD-013 | Os pacotes de `packages/` são consumidos como código-fonte TypeScript, sem etapa de build; o app que os importa os empacota (esbuild na API, `transpilePackages` no web) e declara as dependências npm que eles usam em runtime | um clone limpo roda testes e typecheck sem build prévio | active | 2026-10-03 |
| AD-014 | TypeScript fica em `~6.0` (catálogo do pnpm) até o `typescript-eslint` aceitar a 7 | o `typescript-eslint` 8.71 exige `typescript <6.1.0` | active | 2026-10-03 |
| AD-015 | Cada app valida o ambiente por um schema Zod em `src/env.ts` e não sobe sem ele; toda chave obrigatória entra em `.env.example` (o teste `tests/repo` falha se faltar) | falha de configuração aparece na subida, nomeando a variável e sem imprimir valor | active | 2026-10-03 |

## Handoff

**Feature**: fundacao
**Where**: Build concluído e duas rodadas de verificação feitas. Rodada 1 (`4942cd0`) reprovou C13, C14 e C15; corrigido em `05d3c85`. Rodada 2 (`05d3c85`): 29/30, só C15 reprovado
**In progress**: nada
**Next step**: decisão do usuário sobre C15 - respostas escritas pelo servidor HTTP do Node antes do Express (sem `Host`, `Expect` inválido, cabeçalho de 20 KB, requisição malformada ou incompleta: 400/408/417/431) saem sem request id e sem linha de log. Ou a API passa a cobrir essa camada, ou o plano e o check declaram que rejeição de protocolo não é "requisição respondida". Depois, rodada 3 do Verifier (a última do limite) até `validate_verification.py fundacao` sair com 0
**Blockers**: C15 - ver `features/fundacao/verification.md`
**Uncommitted**: nada
**Branch**: main
