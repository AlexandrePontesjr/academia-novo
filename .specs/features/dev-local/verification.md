# Desenvolvimento local verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 69ba12c..d07ae08
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Reconferi, no conserto, C3, C4, C5 e C7: `git show --stat d07ae08` mostra só
`tests/repo/dev.test.ts` (+17/−11); o intervalo `7557954..d07ae08` inclui ainda `55a7600`, que só
gravou o relatório da rodada 1. Rodei as sete provas no HEAD numa única invocação e os sete nomes
apareceram individualmente na saída verbose, todos verdes. O conserto troca asserções frouxas por
asserções que amarram script+rótulo+cor no mesmo objeto, `api?.kill()` antes do `spawn`, o caminho
`repoRoot/.env` carregado por `loadEnvFile`, `stop` iterando `children` e cada porta com o seu papel;
nada foi removido sem um substituto mais forte. C1, C2 e C6 foram carregados de `7557954` (trechos do
teste que o conserto não toca), com as provas rodadas de novo no HEAD. Li também README, os três
`package.json`, os scripts de desenvolvimento, `apps/api/build.mjs`, `compose.yaml`,
`.env.example` e o comando de migração pré-existente; não editei nenhum outro arquivo.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `pnpm setup` roda `pnpm install` e, via `dev:db`, o `scripts/dev-setup.mjs`, que copia `.env.example` para `.env` só quando o `.env` não existe e nunca sobrescreve um `.env` existente | `dev.test.ts > dev_setup_installs_and_creates_the_env_file_once` - PASS (HEAD) | `tests/repo/dev.test.ts:39-41` - `expect(scripts.setup).toContain('pnpm install')`; `expect(scripts.setup).toContain('pnpm dev:db')`; `expect(scripts['dev:db']).toContain('node scripts/dev-setup.mjs')`. `:47-52` - `expect(check).toBeGreaterThan(-1)`; `expect(copy).toBeGreaterThan(check)`; `expect(setup).toMatch(/if \(existsSync\(envFile\)\) \{\s*(?:\/\/[^\n]*\n\s*)?\} else \{\s*copyFileSync\(exampleFile, envFile\)/)` (carried from 7557954) | PASS |
| C2 | `pnpm dev:db` sobe só `postgres` e `storage` em container, roda a execução única `storage-init` e aplica as migrações; nenhum serviço `api` ou `web` sobe nesse modo | `dev.test.ts > dev_db_starts_only_the_database_and_storage` - PASS (HEAD) | `tests/repo/dev.test.ts:57` - `expect(db).toMatch(/docker compose up -d --wait postgres storage( &#124;$)/)`; `:58` - `expect(db).toContain('docker compose run --rm storage-init')`; `:59` - `expect(db).toContain('pnpm db:migrate')`; `:62-63` - `expect(db).not.toMatch(/\bapi\b/)`; `expect(db).not.toMatch(/\bweb\b/)` (carried from 7557954) | PASS |
| C3 | `pnpm dev:api` roda a API na máquina em watch: o `build.mjs` cria o watcher do esbuild e reinicia o processo a cada recompilação bem-sucedida, com o `.env` da raiz carregado | `dev.test.ts > api_dev_script_watches_and_reloads_the_built_api` - PASS (HEAD) | `tests/repo/dev.test.ts:82` - `expect(build.indexOf('api?.kill()')).toBeGreaterThan(-1)`; `:83-85` - `expect(build.indexOf('api?.kill()')).toBeLessThan(build.indexOf("spawn(process.execPath, ['dist/main.js']"))`; `:69` - `expect(api.dev).toContain('node --env-file-if-exists=../../.env')`; `:74` - `expect(build).toContain('await ctx.watch()')`; `:78-80` - `expect(build).toMatch(/build\.onEnd\(\(result\) => \{\s*if \(result\.errors\.length === 0\) start\(\);/` | PASS |
| C4 | `pnpm dev:web` roda o `next dev` na máquina carregando o `.env` da raiz, então `API_URL` aponta para `http://localhost:3001` | `dev.test.ts > web_dev_script_runs_next_dev_with_the_root_env_file` - PASS (HEAD) | `tests/repo/dev.test.ts:96` - `expect(launcher).toContain("const envFile = join(repoRoot, '.env')")`; `:97` - `expect(launcher).toContain('loadEnvFile(envFile)')`; `:91-92` - `expect(web.dev).toContain('node ../../scripts/dev-setup.mjs')`; `expect(web.dev).toContain('node ../../scripts/dev-web.mjs')`; `:98` - `expect(launcher).toContain("'dev', '-p', '3000'")`; `:104` - `expect(read('.env.example')).toMatch(/^API_URL=http:\/\/localhost:3001$/m)` | PASS |
| C5 | `pnpm dev` roda `pnpm dev:db` antes de subir os processos e sobe a API e o web pelo `scripts/dev.mjs`, com os rótulos `[api]` em verde e `[web]` em azul, encerrando os dois quando um deles sai | `dev.test.ts > dev_script_runs_the_api_in_green_and_the_web_in_blue` - PASS (HEAD) | `tests/repo/dev.test.ts:114-115` - `expect(orchestrator).toContain("const GREEN = '\\u001b[32m'")`; `expect(orchestrator).toContain("const BLUE = '\\u001b[34m'")`; `:116-117` - `expect(orchestrator).toMatch(/\{ script: 'dev:api', label: '\[api\]', color: GREEN \}/)`; `expect(orchestrator).toMatch(/\{ script: 'dev:web', label: '\[web\]', color: BLUE \}/)`; `:121` - `expect(orchestrator).toMatch(/child\.on\('exit', \(code\) => stop\(code \?\? 0\)\)/)`; `:122` - `expect(orchestrator).toMatch(/for \(const child of children\) kill\(child\)/)`; `:109-110` - `expect(dev).toContain('pnpm dev:db &&')`; `expect(dev).toContain('node scripts/dev.mjs')` | PASS |
| C6 | O orquestrador não acrescenta dependência: `scripts/dev.mjs` importa só módulos `node:`, então o guard `dukfit_adds_no_npm_dependency` da suíte continua valendo | `dev.test.ts > dev_orchestrator_uses_only_the_node_standard_library` - PASS (HEAD) | `tests/repo/dev.test.ts:128` - `const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]!)`; `:130-131` - `for (const name of imports) { expect(name.startsWith('node:'), ...).toBe(true); }`; `git diff --name-only 69ba12c..d07ae08` não lista `pnpm-lock.yaml` e nenhum `package.json` muda dependências (só scripts) (carried from 7557954) | PASS |
| C7 | O README documenta os cinco comandos em código, o que sobe em container e o que roda na máquina, e as portas 3000 (web) e 3001 (API) do modo de desenvolvimento | `dev.test.ts > readme_documents_the_local_development_commands` - PASS (HEAD) | `tests/repo/dev.test.ts:137` - `expect(text).toContain('## Desenvolvimento local')`; `:139-142` - `for (const name of ['setup', 'dev', 'dev:db', 'dev:api', 'dev:web']) { expect(named, ...).toContain(name); }`; `:144` - `expect(text).toMatch(/container/)`; `:145` - `expect(text).toContain('- web: http://localhost:3000')`; `:146` - `expect(text).toContain('- API: http://localhost:3001/health')` | PASS |

## README vs scripts

Li `README.md:93-117` e os scripts no HEAD; o conserto não toca README nem scripts, e a história
continua a mesma de `7557954` - nenhuma divergência:

- `pnpm setup` = `pnpm install && pnpm dev:db` (`package.json:10`); README:99. `dev:db` chama
  `scripts/dev-setup.mjs`, sobe `postgres`/`storage`, roda `storage-init` e `pnpm db:migrate`
  (`package.json:12`); README:106 e :112-113 prometem banco/bucket em container e migrações - confere.
- `pnpm dev` = `pnpm dev:db && node scripts/dev.mjs` (`package.json:11`); o orquestrador sobe
  `dev:api` e `dev:web` (`scripts/dev.mjs:17-20`), com API verde e web azul
  (`scripts/dev.mjs:13-19`); README:96 e :100 - confere.
- `pnpm dev:api` = `pnpm --filter @academia/api dev` (`package.json:13`) →
  `node --env-file-if-exists=../../.env build.mjs --watch` (`apps/api/package.json:11`); o
  `build.mjs:16-18` mata o processo anterior e sobe `dist/main.js` de novo; `PORT=3001` em
  `.env.example:15`; README:107 - confere.
- `pnpm dev:web` = `pnpm --filter @academia/web dev` (`package.json:14`) →
  `scripts/dev-web.mjs` (`apps/web/package.json:12`), que carrega `repoRoot/.env` e roda
  `next dev -p 3000` (`scripts/dev-web.mjs:15-22`); README:108 - confere.
- O modo é containers vs máquina: `dev:db` só sobe `postgres` e `storage` (`package.json:12`);
  README:95-96 e :112-113 dizem o mesmo. As portas 3000/3001 também são as da stack no Compose
  (`compose.yaml:93` e `:117`, via `PORT`/`WEB_PORT`), então o aviso de parar a stack antes
  (README:116-117) está correto.
- Os cinco comandos aparecem em bloco de código (`README:99-108`), como o teste exige
  (`dev.test.ts:139-142`).

## Precision gaps

As quatro lacunas apontadas na rodada 1 estão fechadas por asserção localizada. Nenhuma lacuna muda
o veredito.

- **C5 - pareamento rótulo/cor: FECHADA.** `dev.test.ts:114-117` exige `GREEN`/`BLUE` com os códigos
  certos e o literal `{ script: 'dev:api', label: '[api]', color: GREEN }` (idem web/BLUE), então um
  mapeamento invertido falha. O arquivo confere em `scripts/dev.mjs:13-19`.
- **C5 - encerramento dos dois: FECHADA no que a rodada 1 pediu.** `dev.test.ts:122` exige
  `for (const child of children) kill(child)`, e `:116-117` provam os dois processos em `PROCESSES`,
  de onde `children` é montado (`scripts/dev.mjs:78`). Continua como leitura, não como asserção, a
  ligação `const children = PROCESSES.map(start)`; um `children` incompleto passaria.
- **C3 - reinício do processo: FECHADA.** `dev.test.ts:82-85` exige `api?.kill()` presente e antes do
  `spawn(process.execPath, ['dist/main.js']`; "reiniciar" deixou de ser indistinguível de "spawnar a
  mais" no texto (`apps/api/build.mjs:17-18`). Segue sendo prova de fiação: que o `kill` execute em
  runtime não é provado (é o que o profile `light` não alcança).
- **C4 - `.env` da raiz: FECHADA.** `dev.test.ts:96` exige `const envFile = join(repoRoot, '.env')`
  e `:97` exige `loadEnvFile(envFile)`, amarrando o caminho ao carregamento
  (`scripts/dev-web.mjs:13-17`); `:104` mantém o `API_URL` do `.env.example`.
- **C7 - papéis e portas: FECHADA para a inversão.** `dev.test.ts:145-146` exigem
  `- web: http://localhost:3000` e `- API: http://localhost:3001/health`, então trocar os números de
  papel falha. Residual: esses literais resolvem em `README:74-75` ("Primeira subida", stack em
  container), não em `README:107-108` ("Desenvolvimento local"); como a prova lê o README inteiro,
  uma seção de desenvolvimento que omitisse os papéis passaria. `:144` (`/container/`) também segue
  substring solta. O texto do README está correto na leitura.
- **C2 - migração: PERMANECE declarada.** `dev.test.ts:59` só prova a presença de `pnpm db:migrate`
  na string de `dev:db`; que esse comando aplica migrações é comportamento do comando pré-existente
  (`packages/database/package.json:13` → `packages/database/src/migrate.ts:18`,
  `await migrate(drizzle(pool), { migrationsFolder })`), não do wiring. Não é regressão da rodada 2.

## Gate

`pnpm --filter "./tests/repo" exec vitest run dev.test.ts --reporter=verbose` - **7 passed, 0 failed**
(1 arquivo, 7 testes, 178 ms). Os sete nomes de teste apareceram individualmente na saída verbose.
Checks com evidência `file:line` localizada: **7/7**.

Suplementar para C6 (carregado de `7557954`): o guard
`pnpm --filter "./tests/repo" exec vitest run identidade.test.ts -t "dukfit_adds_no_npm_dependency"`
deu 1 passed, 8 skipped; `git diff --name-only 69ba12c..d07ae08` não lista `pnpm-lock.yaml`, e
`d07ae08` só altera `tests/repo/dev.test.ts`, então nenhuma dependência mudou.

## Not run (profile light)

- Injeção de falhas/mutantes: não roda no profile `light`; nenhum mutante foi injetado e não há
  conclusão sobre um teste que passaria sob implementação errada.
- Recomputação de `Coverage`: não roda no profile `light`; a tabela do `checks.md` foi lida, não
  recomputada a partir da autoridade de cada conjunto.
- `Test policy`: o `checks.md` não tem essa seção; nada a julgar.
- Binding sources (`ui`): não há design/fonte binding nesta feature; nada a abrir.
- `validate_verification.py`: não executado, por instrução do orquestrador; o gate fica com o
  orquestrador.
- Smoke do `## Handoff` (`checks.md:110-116`): é nota do Build, não prova de check; não foi usado
  como evidência, e o comportamento em runtime de `pnpm dev` (subir os dois, reiniciar de fato,
  derrubar a árvore) permanece não provado nesta verificação.
- Caminhada do fluxo com o usuário (`ui`/interação): não se aplica; o trabalho é de ferramenta de
  desenvolvimento, sem fluxo de tela.
