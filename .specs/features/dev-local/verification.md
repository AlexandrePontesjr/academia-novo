# Desenvolvimento local verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 69ba12c..7557954
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Verifiquei o diff `69ba12c..7557954` (10 arquivos, +465/-3; commits `1552186` e `7557954`), li o
`verify.md`, o `checks.md`, o README, os três `package.json`, os scripts de desenvolvimento,
`apps/api/build.mjs` e as autoridades `compose.yaml`, `.env.example` e `pnpm-workspace.yaml`. Rodei
as sete provas numa única invocação e os sete nomes apareceram individualmente na saída verbose,
todos verdes. Confirmei pelo diff que `pnpm-lock.yaml` não mudou e que nenhum `package.json` ganhou
dependência; o guard `dukfit_adds_no_npm_dependency` também rodou verde. Não editei nenhum outro
arquivo.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `pnpm setup` roda `pnpm install` e, via `dev:db`, o `scripts/dev-setup.mjs`, que copia `.env.example` para `.env` só quando o `.env` não existe e nunca sobrescreve um `.env` existente | `dev.test.ts > dev_setup_installs_and_creates_the_env_file_once` - PASS | `tests/repo/dev.test.ts:39-41` - `expect(scripts.setup).toContain('pnpm install')`; `expect(scripts.setup).toContain('pnpm dev:db')`; `expect(scripts['dev:db']).toContain('node scripts/dev-setup.mjs')`. `:47-52` - `expect(copy).toBeGreaterThan(check)`; `expect(setup).toMatch(/if \(existsSync\(envFile\)\) \{\s*(?:\/\/[^\n]*\n\s*)?\} else \{\s*copyFileSync\(exampleFile, envFile\)/)` | PASS |
| C2 | `pnpm dev:db` sobe só `postgres` e `storage` em container, roda a execução única `storage-init` e aplica as migrações; nenhum serviço `api` ou `web` sobe nesse modo | `dev.test.ts > dev_db_starts_only_the_database_and_storage` - PASS | `tests/repo/dev.test.ts:57` - `expect(db).toMatch(/docker compose up -d --wait postgres storage( &#124;$)/)`; `:58` - `expect(db).toContain('docker compose run --rm storage-init')`; `:59` - `expect(db).toContain('pnpm db:migrate')`; `:62-63` - `expect(db).not.toMatch(/\bapi\b/)`; `expect(db).not.toMatch(/\bweb\b/)` | PASS |
| C3 | `pnpm dev:api` roda a API na máquina em watch: o `build.mjs` cria o watcher do esbuild e reinicia o processo a cada recompilação bem-sucedida, com o `.env` da raiz carregado | `dev.test.ts > api_dev_script_watches_and_reloads_the_built_api` - PASS | `tests/repo/dev.test.ts:69` - `expect(api.dev).toContain('node --env-file-if-exists=../../.env')`; `:74-80` - `expect(build).toContain('await ctx.watch()')`; `expect(build).toMatch(/build\.onEnd\(\(result\) => \{\s*if \(result\.errors\.length === 0\) start\(\);/`; `expect(build).not.toContain("['--watch'")` | PASS |
| C4 | `pnpm dev:web` roda o `next dev` na máquina carregando o `.env` da raiz, então `API_URL` aponta para `http://localhost:3001` | `dev.test.ts > web_dev_script_runs_next_dev_with_the_root_env_file` - PASS | `tests/repo/dev.test.ts:86-87` - `expect(web.dev).toContain('node ../../scripts/dev-setup.mjs')`; `expect(web.dev).toContain('node ../../scripts/dev-web.mjs')`; `:91-94` - `expect(launcher).toContain('loadEnvFile')`; `expect(launcher).toContain("'dev', '-p', '3000'")`; `expect(launcher).toContain('env: process.env')`; `:98` - `expect(read('.env.example')).toMatch(/^API_URL=http:\/\/localhost:3001$/m)` | PASS |
| C5 | `pnpm dev` roda `pnpm dev:db` antes de subir os processos e sobe a API e o web pelo `scripts/dev.mjs`, com os rótulos `[api]` em verde e `[web]` em azul, encerrando os dois quando um deles sai | `dev.test.ts > dev_script_runs_the_api_in_green_and_the_web_in_blue` - PASS | `tests/repo/dev.test.ts:103-104` - `expect(dev).toContain('pnpm dev:db &&')`; `expect(dev).toContain('node scripts/dev.mjs')`; `:107-112` - `expect(orchestrator).toContain("label: '[api]'")`; `expect(orchestrator).toContain("label: '[web]'")`; `expect(orchestrator).toContain('\\u001b[32m')`; `expect(orchestrator).toContain('\\u001b[34m')`; `:116-117` - `expect(orchestrator).toMatch(/child\.on\('exit', \(code\) => stop\(code \?\? 0\)\)/)`; `expect(orchestrator).toContain("'taskkill'")` | PASS |
| C6 | O orquestrador não acrescenta dependência: `scripts/dev.mjs` importa só módulos `node:`, então o guard `dukfit_adds_no_npm_dependency` da suíte continua valendo | `dev.test.ts > dev_orchestrator_uses_only_the_node_standard_library` - PASS; guard suplementar - PASS | `tests/repo/dev.test.ts:122-125` - `const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]!)`; `expect(name.startsWith('node:'), ...).toBe(true)`; `tests/repo/identidade.test.ts:126` - `expect(deps(read(path)), path).toEqual(deps(before))`; `git diff --name-only 69ba12c..7557954` não lista `pnpm-lock.yaml` e os diffs dos `package.json` só acrescentam scripts | PASS |
| C7 | O README documenta os cinco comandos em código, o que sobe em container e o que roda na máquina, e as portas 3000 (web) e 3001 (API) do modo de desenvolvimento | `dev.test.ts > readme_documents_the_local_development_commands` - PASS | `tests/repo/dev.test.ts:131` - `expect(text).toContain('## Desenvolvimento local')`; `:134-135` - `for (const name of ['setup', 'dev', 'dev:db', 'dev:api', 'dev:web']) { expect(named, ...).toContain(name); }`; `:138-140` - `expect(text).toMatch(/container/)`; `expect(text).toContain('3001')`; `expect(text).toContain('3000')` | PASS |

## Gate

`pnpm --filter "./tests/repo" exec vitest run dev.test.ts --reporter=verbose` - **7 passed, 0 failed**
(1 arquivo, 7 testes). Os sete nomes de teste apareceram individualmente na saída verbose.

Checks com evidência `file:line` localizada: **7/7**.

Suplementar para C6 (fora do gate): `pnpm --filter "./tests/repo" exec vitest run identidade.test.ts
-t "dukfit_adds_no_npm_dependency" --reporter=verbose` - 1 passed, 8 skipped. O diff não toca
`pnpm-lock.yaml` e nenhum `package.json` do diff muda `dependencies`/`devDependencies` (só scripts).

## README vs scripts

Nenhuma divergência encontrada entre `README.md:93-117` e os scripts:

- `pnpm setup` = `pnpm install && pnpm dev:db` (`package.json:10`); `dev:db` chama
  `scripts/dev-setup.mjs`, sobe `postgres`/`storage`, roda `storage-init` e `pnpm db:migrate`
  (`package.json:12`). O README:99 promete dependências, `.env` e banco/bucket prontos - confere.
- `pnpm dev` = `pnpm dev:db && node scripts/dev.mjs` (`package.json:11`); o orquestrador sobe
  `dev:api` e `dev:web` (`scripts/dev.mjs:17-20`). O README:100 promete infraestrutura e os dois em
  watch - confere.
- `pnpm dev:api` = `pnpm --filter @academia/api dev` (`package.json:13`), que carrega o `.env` da
  raiz e roda `build.mjs --watch` (`apps/api/package.json:11`); `PORT=3001` em `.env.example:15`.
  README:107 - confere.
- `pnpm dev:web` = `pnpm --filter @academia/web dev` (`package.json:14`), que roda
  `scripts/dev-web.mjs` (`apps/web/package.json:12`) com `next dev -p 3000`
  (`scripts/dev-web.mjs:19-22`). README:108 - confere.
- `dev:db` sobe só `postgres` e `storage` (`package.json:12`), ambos com porta publicada em
  `127.0.0.1` (`compose.yaml:13-14` e `:47-48`); `api`/`web` da stack não entram nesse modo.
  README:111-114 - confere. As portas 3000/3001 também são as do Compose (`compose.yaml:93` e
  `:117`, via `PORT`/`WEB_PORT` em `.env.example:15` e `:43`), então o aviso de parar a stack antes
  (README:116-117) está correto.

## Precision gaps

Lacunas de precisão do profile `light`; nenhuma é contradição entre README e scripts e nenhuma
muda o veredito. Onde digo que o arquivo confere, é leitura do arquivo, não prova do teste.

- **C5 - pareamento rótulo/cor:** `dev.test.ts:109-112` afirma os dois rótulos e os dois códigos ANSI
  separadamente; não amarra `[api]` a `\u001b[32m` nem `[web]` a `\u001b[34m`. Um mapeamento
  invertido ainda passaria. O arquivo está correto em `scripts/dev.mjs:18-19`.
- **C5 - encerramento dos dois:** `dev.test.ts:116-117` afirma o handler de `exit` chamando `stop` e
  a presença de `taskkill`, mas não que `stop` percorre e mata todos os filhos
  (`scripts/dev.mjs:71-76`). "Encerra os dois" não é isolado pela asserção; comportamento de
  execução não provado.
- **C3 - reinício do processo:** `dev.test.ts:74-80` afirma o watcher e o `start()` condicionado a
  `result.errors.length === 0`, mas não o `api?.kill()` de `apps/api/build.mjs:17`; "reinicia" e
  "spawna um processo a mais" não são distinguidos. Comportamento de execução não provado; o smoke
  do Handoff não é usado como prova.
- **C4 - `.env` da raiz:** `dev.test.ts:91` só afirma a presença de `loadEnvFile`, não que
  `envFile` seja `repoRoot/.env` (`scripts/dev-web.mjs:15-17`). `:98` afirma o valor no
  `.env.example`, não que o launcher carregou esse arquivo.
- **C7 - papéis e portas:** `dev.test.ts:138-140` procura `container`, `3001` e `3000` como
  substrings soltas; não afirma que 3000 é o web e 3001 é a API. O texto do README:95-117 está
  correto na leitura, mas um README com os números trocados de papel passaria.
- **C2 - migração:** `dev.test.ts:59` só afirma a presença de `pnpm db:migrate`; que esse comando
  aplica migrações é comportamento do comando pré-existente (`packages/database/package.json:13`,
  `packages/database/src/migrate.ts:18`), não da prova de fiação.

## Swept (existing constraints)

- C2 falha de dependência: `package.json:11` encadeia `pnpm dev:db && node scripts/dev.mjs`, então a
  infraestrutura falha antes de API/web; a asserção `dev.test.ts:103` confirma o `&&`.
- C2 idempotência: `compose.yaml:59-74` usa `head-bucket || create-bucket && put-bucket-versioning`,
  e `up -d --wait` pode rodar de novo; `packages/database/src/migrate.ts:18` usa o migrator com
  histórico.
- C1 idempotência: `scripts/dev-setup.mjs:14-17` só copia no `else` de `existsSync(envFile)`.
- C5 concorrência: `scripts/dev.mjs:80-89` registra `exit` e `SIGINT`/`SIGTERM`; `:62-69` usa
  `taskkill /T /F` no Windows, o que derruba a árvore.
- C5 observabilidade: `scripts/dev.mjs:13-20` e `:54-56` aplicam cor e rótulo a cada linha.

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
  como evidência de C1-C7, e o comportamento em runtime de `pnpm dev` permanece não provado nesta
  verificação.
- Caminhada do fluxo com o usuário (`ui`/interação): não se aplica; o trabalho é de ferramenta de
  desenvolvimento, sem fluxo de tela.
