# README verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 8bbdca7..d95ed5c
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Reconferi no diff `44bbc25..d95ed5c` os três pontos da rodada 1: C4 passou a exigir caminho
versionado no git (`git ls-files --error-unmatch`) além do `existsSync`, e o README não linka mais
`CLAUDE.md`; C5 passou a exigir os passos de primeira subida (`cp .env.example .env` e
`docker compose up --build --wait`); C7 não cita mais `apps/web/test` e a prova enumera os
diretórios de `pnpm-workspace.yaml` mais `deploy`. C7 trocou a redação "cada caminho citado" por
"cada um desses caminhos", o mesmo conjunto que o `Coverage` já enumerava (os 9 diretórios) e que o
Intent nomeia - a obrigação enumerada não mudou, e a varredura independente dos demais caminhos
citados no README não achou nenhum falso. Carreguei C1, C2, C3 e C6 de `44bbc25` (`carried from
44bbc25`), mas rodei as sete provas em cheio no HEAD `d95ed5c`. Varri ainda o que as checks não
cobrem - todos os links relativos, caminhos citados como arquivo/diretório, comandos `pnpm` em
código, portas e versões do README contra a árvore, `package.json`, `.env.example`,
`pnpm-workspace.yaml` e `compose.yaml` - sem achar caminho falso, comando inexistente, porta ou
versão divergente.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `README.md` na raiz, primeira linha `# academia-bairro`, texto "Sistema web de gestão" | `readme.test.ts > readme_exists_with_the_project_title` ✓ (carried from 44bbc25; re-run at d95ed5c) | `tests/repo/readme.test.ts:48` - `expect(lines[0]).toBe('# academia-bairro')`; `:49` - `expect(readme()).toContain('Sistema web de gestão')`; `README.md:1`, `:3` | PASS |
| C2 | Todo `pnpm <script>` citado em código é script da raiz; `verify`, `db:migrate`, `users:create-admin` e `test:stack` são citados | `readme.test.ts > readme_names_only_root_scripts_that_exist` ✓ (carried from 44bbc25; re-run at d95ed5c) | `tests/repo/readme.test.ts:57` - `expect(Object.keys(root.scripts), ...).toContain(name)`; `:60` - <code>expect(text, name).toContain(&#96;pnpm ${name}&#96;)</code>; `package.json:9-12`; `README.md:95-101` | PASS |
| C3 | Node.js 24 e pnpm 12.9.1 vêm de `engines.node` e `packageManager` | `readme.test.ts > readme_states_the_node_and_pnpm_versions_from_the_manifests` ✓ (carried from 44bbc25; re-run at d95ed5c) | `tests/repo/readme.test.ts:76` - <code>expect(text).toContain(&#96;Node.js ${nodeMajor!}&#96;)</code>; `:77` - <code>expect(text).toContain(&#96;pnpm ${pnpmVersion!}&#96;)</code>; `package.json:6` (`>=24`), `package.json:4` (`pnpm@12.9.1`); `README.md:53-54` | PASS |
| C4 | Todo link relativo aponta para caminho versionado no git; o README linka PRD, `ROADMAP.md`, `STATE.md`, `deploy/README.md` e `.env.example` | `readme.test.ts > readme_relative_links_resolve_to_existing_paths` ✓ (reconferido no diff; inclui os 5 links, nenhum para `CLAUDE.md`) | `tests/repo/readme.test.ts:95` - <code>expect(tracked.status, &#96;link para caminho fora do git: ${target}&#96;).toBe(0)</code>; `:98` - <code>expect(targets, &#96;o README precisa linkar ${required}&#96;).toContain(required)</code>; `README.md:148-156` linka os cinco; `CLAUDE.md` não aparece no README e `git ls-files --error-unmatch CLAUDE.md` sai 1 | PASS |
| C5 | `http://localhost:3000` e `http://localhost:3001/health` com as portas de `WEB_PORT` e `PORT`, e documenta `cp .env.example .env` e `docker compose up --build --wait` | `readme.test.ts > readme_documents_the_ports_of_the_env_example` ✓ (reconferido no diff; asserções novas de primeira subida) | `tests/repo/readme.test.ts:111` - <code>expect(text).toContain(&#96;http://localhost:${webPort!}&#96;)</code>; `:112` - <code>expect(text).toContain(&#96;http://localhost:${apiPort!}/health&#96;)</code>; `:115` - `expect(text).toContain('cp .env.example .env')`; `:116` - `expect(text).toContain('docker compose up --build --wait')`; `.env.example:43` (`WEB_PORT=3000`), `:15` (`PORT=3001`); `README.md:63-64`, `:70`, `:75` | PASS |
| C6 | Primeiro Administrador pelo comando real, senha em `ADMIN_PASSWORD`, limite de 12 a 128 caracteres | `readme.test.ts > readme_documents_the_first_administrator_command` ✓ (carried from 44bbc25; re-run at d95ed5c) | `tests/repo/readme.test.ts:122` - `expect(text).toContain('docker compose exec')`; `:123` - `expect(text).toContain('pnpm users:create-admin')`; `:124` - `expect(text).toContain('ADMIN_PASSWORD')`; `:125` - `expect(text).toMatch(/12 a 128 caracteres/)`; `README.md:80`, `:83-84` | PASS |
| C7 | Cita todo diretório de workspace do `pnpm-workspace.yaml` e `deploy/`, e cada um desses caminhos existe | `readme.test.ts > readme_covers_every_workspace_directory` ✓ (reconferido no diff; sem `apps/web/test`) | `tests/repo/readme.test.ts:139` - `expect(existsSync(join(ROOT, dir)), dir).toBe(true)`; `:140` - <code>expect(readme(), &#96;o README precisa citar ${dir}&#96;).toContain(dir)</code>; `pnpm-workspace.yaml:2-4`; `README.md:134-142` | PASS |

## Gate

`pnpm --filter "./tests/repo" exec vitest run readme.test.ts --reporter=verbose` - **7 passed,
0 failed**; **7/7 checks com evidência locada** (C1-C7), uma invocação só e os sete nomes um a um:

```text
✓ readme.test.ts > readme_exists_with_the_project_title 2ms
✓ readme.test.ts > readme_names_only_root_scripts_that_exist 1ms
✓ readme.test.ts > readme_states_the_node_and_pnpm_versions_from_the_manifests 0ms
✓ readme.test.ts > readme_relative_links_resolve_to_existing_paths 442ms
✓ readme.test.ts > readme_documents_the_ports_of_the_env_example 1ms
✓ readme.test.ts > readme_documents_the_first_administrator_command 0ms
✓ readme.test.ts > readme_covers_every_workspace_directory 10ms

Test Files  1 passed (1)
     Tests  7 passed (7)
```

`validate_verification.py` não foi rodado: o gate é do orquestrador.

## Not run (profile light)

- **Fault injection**: não rodou. Nenhum mutante foi injetado; um teste verde não prova que uma
  implementação errada seria reprovada.
- **Coverage**: não recomputado. A tabela de `checks.md` foi lida, não reconstruída. A nota de
  precisão da rodada 1 em C5 está fechada: as asserções `tests/repo/readme.test.ts:115-116` agora
  provam `cp .env.example .env` e `docker compose up --build --wait`, não só as portas.
- **Binding sources**: não se aplica; esta feature não marca fonte de design/UI binding.
- **Test policy**: `checks.md` não tem essa seção; nada a julgar.
- **Passo 5 (percurso com o usuário)**: não se aplica; a entrega é documentação, sem fluxo de tela
  novo.
