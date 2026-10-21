# academia-bairro

Sistema web de gestão para academia de bairro: alunos com foto 3×4, funcionários, planos e
matrículas, pagamentos, check-in na recepção, painel, auditoria e os fluxos de LGPD (consentimento,
exportação e anonimização). Uma instalação atende uma academia.

O repositório é um monorepo TypeScript com o web e a API no mesmo código, PostgreSQL,
armazenamento de objetos compatível com S3 e Docker Compose para subir tudo. O produto e as regras
de negócio estão no [PRD](<PRD — Sistema de Gestão de Academia.md>); o andamento de cada entrega,
em [.specs/ROADMAP.md](.specs/ROADMAP.md).

## O que o sistema faz

- **Entrada** com e-mail e senha e 2FA (TOTP), obrigatório para o Administrador; quatro perfis -
  `admin`, `reception`, `hr_finance` e `instructor` - e permissão conferida no backend em toda rota.
- **Alunos**: cadastro e busca por nome, CPF, telefone e situação; foto 3×4; responsável legal e
  consentimento versionado; inativação sem perder histórico.
- **Funcionários**: ficha com foto e vínculo opcional com um usuário; só Administrador e RH leem,
  e cada leitura de dado de funcionário vai para a trilha.
- **Planos e matrículas**: períodos com início, vencimento calculado e renovação; dois períodos do
  mesmo aluno nunca se sobrepõem.
- **Pagamentos**: confirmação e desfazimento do pagamento do período, com a situação calculada -
  pago, pendente, atrasado ou cancelado.
- **Check-in**: busca do aluno, foto e situação da matrícula para conferência na recepção, uma
  presença por aluno por dia, mais o histórico na ficha e o relatório por período.
- **Painel**: alunos ativos, vencimentos próximos, pagamentos e check-ins do dia, conforme o perfil.
- **Auditoria**: trilha append-only (o banco recusa `UPDATE`, `DELETE` e `TRUNCATE`) de quem fez o
  quê, com filtros na tela.
- **Privacidade**: exportação JSON dos dados do titular, anonimização no lugar e retenção
  configurável.

A landing pública (rota `/`) é a vitrine da academia e não lê a API: o texto e as imagens vêm de
`apps/web/src/app/site-content.ts` e de `apps/web/public/dukfit/`. O painel fica em `/dashboard`,
atrás do login em `/login`.

## Stack

| Camada | Escolha |
| --- | --- |
| Web | Next.js 16, React 19, Tailwind CSS 4 e componentes próprios em `packages/ui` |
| API | NestJS 12, Zod para contrato e validação, Better Auth com Argon2id, OpenAPI |
| Dados | PostgreSQL 18 com Drizzle ORM e migrações SQL versionadas |
| Arquivos | RustFS (API S3) com bucket privado; foto servida só por URL assinada de 300 s |
| Qualidade | TypeScript strict, ESLint, Vitest, Playwright e Turborepo |
| Execução | pnpm workspaces e Docker Compose |

O navegador só fala com a origem do web: tudo em `/api/*` é repassado à API, e `/health` fica na
raiz da API. Sessão em cookie `HttpOnly`, CSRF por checagem de origem e CSP com nonce por
requisição.

## Requisitos

- Node.js 24 ou superior (o CI usa a 24).
- pnpm 12.9.1 - a versão está presa em `packageManager`; `corepack enable` instala essa versão.
- Docker com Compose v2, para a stack e para os testes de stack.
- Git Bash no Windows, se você for rodar os scripts de `deploy/` (os testes de stack os usam).

## Primeira subida

1. Copie o ambiente de desenvolvimento e suba a stack inteira:

   ```bash
   cp .env.example .env
   docker compose up --build --wait
   ```

   O Compose aplica as migrações (`migrate`), cria e versiona o bucket (`storage-init`) e só então
   sobe a API e o web. Quando `--wait` retorna, todo mundo está `healthy`.

2. Abra o web em http://localhost:3000. A raiz é a landing pública; o painel fica em `/dashboard`.

3. As portas publicadas ficam todas em `127.0.0.1`:

   - web: http://localhost:3000
   - API: http://localhost:3001/health (aberto, sem sessão)
   - armazenamento: http://localhost:9000
   - PostgreSQL: `localhost:5432`

4. Crie o primeiro Administrador dentro do container da API. A senha vai na variável
   `ADMIN_PASSWORD`, de 12 a 128 caracteres, nunca como argumento:

   ```bash
   docker compose exec -e ADMIN_PASSWORD='<senha>' api pnpm users:create-admin \
     --email admin@exemplo.com --name Administradora
   ```

   O comando imprime o id e o e-mail. O Administrador habilita o TOTP em `/two-factor/setup`;
   enquanto não habilitar, as rotas de aplicação respondem `403 two_factor_enrollment_required`.

5. Para parar: `docker compose down`. Com `-v`, os volumes `postgres-data` e `rustfs-data` também
   são apagados - o banco e as fotos vão junto.

## Comandos do dia a dia

```bash
pnpm install --frozen-lockfile  # instala o monorepo (Node 24 + corepack)
pnpm verify                     # lint, typecheck, testes e build de todos os workspaces
pnpm test:stack                 # testes da stack real: Compose, migrações, produção e backup
pnpm db:migrate                 # aplica as migrações no banco de DATABASE_URL
pnpm users:create-admin         # cria um Administrador na máquina, com ADMIN_PASSWORD
```

`pnpm verify` é o mesmo comando do workflow de CI e o único portão de qualidade: se ele sai com 0,
o repositório está são. Depois de alterar algo, `docker compose up --build --wait` reconstrói o que
mudou. Na máquina, `users:create-admin` usa `apps/api/dist`; rode antes
`pnpm --filter @academia/api build` (o `verify` já constrói).

## Banco de dados

O schema vive em `packages/database/src` e só muda por migração SQL versionada em
`packages/database/migrations`, aplicada antes de a API subir. Um banco novo é criado pelas
migrações - não por `push` do Drizzle. Para uma coluna nova:

```bash
pnpm --filter @academia/database generate   # gera o SQL em migrations/ a partir do schema
pnpm db:migrate                             # aplica no banco apontado por DATABASE_URL
```

## Testes

- **Unidade e integração** - Vitest em `apps/api/test`, `packages/contracts/test`,
  `packages/database/test` e `apps/web/test`. A integração usa Postgres real em container, nunca um
  banco simulado.
- **Tela** - Playwright em `apps/web/e2e`, contra um build de produção do web e uma API falsa; não
  precisa da stack de pé. `pnpm --filter @academia/web test` instala o Chromium e roda.
- **Stack** - Vitest em `tests/stack`: sobe o Compose num projeto próprio, aplica migrações e prova
  o caminho real da produção (inclusive o overlay `compose.prod.yaml`).
- **Repositório** - `tests/repo` lê os arquivos do repositório e prova o que não se vê na tela:
  ambiente, Compose, deploy, workflow de CI e documentação. Este README é provado ali.

## Estrutura

| Caminho | O que tem |
| --- | --- |
| `apps/web` | Next.js: landing, login/2FA, painel e todas as telas; proxy de `/api/*` para a API |
| `apps/api` | NestJS: rotas `/api`, guardas de perfil, OpenAPI, fotos, auditoria e privacidade |
| `packages/contracts` | schemas Zod de payload, resposta e erro usados pelos dois lados |
| `packages/database` | schema Drizzle, conexão, migrações e o comando de migração |
| `packages/ui` | design system: tokens, componentes e ícones compartilhados |
| `packages/config` | tsconfig e ESLint comuns aos workspaces |
| `tests/repo` | provas estáticas do repositório (ambiente, Compose, deploy e documentos) |
| `tests/stack` | provas da stack real em Docker |
| `deploy` | Caddy, métricas e alertas, backup/restore, systemd e o runbook |

Código e identificadores em inglês; texto de interface e documentação em pt-BR.

## Documentação viva

- [PRD](<PRD — Sistema de Gestão de Academia.md>) - requisitos, perfis, modelo de dados e critérios
  de aceite do MVP.
- [.specs/ROADMAP.md](.specs/ROADMAP.md) - a ordem das entregas e o que falta.
- [.specs/STATE.md](.specs/STATE.md) - decisões registradas (AD-NNN) e o handoff atual.
- `.specs/features/<feature>/` - por feature: `plan.md`, `checks.md` e `verification.md`; cada
  obrigação tem a prova que a fecha.
- [deploy/README.md](deploy/README.md) - runbook da homologação: subida, atualização, drill de
  restauração, resposta a alerta e rollback.
- [CLAUDE.md](CLAUDE.md) - as regras de trabalho da sessão, incluindo o "Próximo passo" a cada
  entrega.
- [.env.example](.env.example) - todas as chaves obrigatórias, com valores só de desenvolvimento;
  o `.env` não entra no git.

## Segurança e LGPD

- Senha com Argon2id; sessão em cookie `HttpOnly`; 2FA TOTP obrigatório para o Administrador.
- Permissão no backend: toda rota declara `@Public()`, `@Authenticated()` ou `@Roles(...)`, e rota
  `/api` sem declaração impede a API de subir.
- CSRF por checagem de origem, CSP com nonce por requisição e cabeçalhos de segurança na borda.
- Foto em bucket privado, servida só por URL assinada de 300 s; observação de saúde cifrada com
  AES-256-GCM e a chave fora do banco.
- Auditoria append-only, exportação e anonimização por titular e retenção configurável.
- Segredos no `.env`, fora do git; backup diário do banco e dos objetos; cópias das chaves fora do
  servidor.

## Deploy

A produção é um overlay do Compose - `compose.prod.yaml` mais `deploy/` (Caddy com HTTPS,
Prometheus/Alertmanager, scripts de backup e restore e timer systemd) - em vez de uma cópia do
`compose.yaml`:

```bash
docker compose -f compose.yaml -f compose.prod.yaml up -d --wait
```

O passo a passo no servidor, o drill de restauração e o rollback estão no
[deploy/README.md](deploy/README.md).

## Licença

Repositório privado da academia; não há licença declarada.
