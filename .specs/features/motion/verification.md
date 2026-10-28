# Motion verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: 7471232..2d8d629 (gap fix `39e6e73..4eadbfa`, docs `2d8d629`)
**Round**: 2 - scoped (over round 1's FAIL at `6e67520`)
**Verifier**: independent sub-agent (author != verifier)

Rodada 1 (em `6e67520`, relatório comitado em `2d8d629`) reprovou com quatro gaps ranqueados. Antes
desta rodada os três arquivos do diff dos gaps (`apps/web/e2e/motion.spec.ts`,
`apps/web/src/app/account/change-password-form.tsx`, `tests/repo/motion.test.ts`) estavam só na
árvore; foram comitados em `39e6e73` (a mensagem de senha com `data-motion="feedback"`) e `4eadbfa`
(as três provas), junto com as lições e o estado (`2d8d629`). A árvore suja depois disso era só
`?? CLAUDE.md` (do usuário).

At `2d8d629` as três provas nomeadas dos gaps 1 a 3 foram reexecutadas e passaram; os três faults da
rodada (F5 reaplicado, mais um por cada prova nova) morreram. **Os gaps 1, 2 e 3 da rodada 1 estão
fechados.** O gap 4 (C37, `pnpm verify` exit 0) continua **NOT PROVEN**, e é a única razão do FAIL:
neste ambiente o turbo mata as tarefas filhas de teste com `EPERM` em `%TEMP%`, e fora do turbo
lint, typecheck, build e as quatro suítes saem verdes (evidência em `## Gate`). Não há gap de
produto, de check ou de prova aberto. Per L-041, a substituição por tarefa é registrada como **não
provar** o comando do portão, não como prová-lo.

Escopo desta rodada, per `verify.md` "Re-verifying after a fix": as provas em escopo foram
reexecutadas no HEAD novo; C24, C27 e C28 foram rejulgadas e suas citações atualizadas; as
linhas de `Coverage` cuja autoridade o diff tocou foram recomputadas; a linha `Test policy` que
estava sem prova foi rejulgada; três faults nos três lados que o diff toca. O resto é carregado de
`6e67520` e cada seção diz o que é.

## Binding sources

Step 1 da rodada 1 vale para as telas; o diff dos gaps não toca interface, tela, cópia nem
arranjo (só acrescenta um atributo `data-*` à mensagem de `/account` e provas), então esta rodada
releu apenas as fontes que os gaps citam: as doors e as ACs dos literais usados.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `plan.md` `## Landing`, doors 4 e 5 | yes - relido nos literais dos gaps | none - a door 4 fixa 8 px/12 px por `matchMedia('(min-width: 1024px)')` e a door 5 fixa `[data-motion='feedback']` com 180 ms, que é o que C24/C27/C28 agora provam; o bloco `@media (prefers-reduced-motion: reduce)` que zera animação, transição e `transform` é o que o novo teste de repo afirma | - |
| `plan.md` AC 24, AC 27, AC 28 (e AC 7, AC 28 para a borda de 1024 px) | yes | none - AC 24 exige o atributo em **qualquer** mensagem de sucesso, que é o que o gap 1 passou a cobrir para as três do app; AC 27/28 fixam a cascata de 40 ms, não a distância, por isso a distância provada é a da door 4 | - |
| `plan.md` AC 1-54 (restante) e `Landing` doors 1-3, 6-7 | carried from `6e67520` - o diff não toca | none | - |
| `.specs/STATE.md` AD-098 a AD-106 | yes - relido (AD-099 a AD-103 são as doors 1, 2, 4, 5 e 6; AD-106 é o `#planos`) | none | - |
| `.specs/STATE.md` Handoff e `.specs/features/pre-cadastro/checks.md` `## Handoff` | yes | none - o Handoff diz que o diff dos gaps estava fora do git e que a rodada 2 roda sobre `7471232..HEAD`; o Handoff da `pre-cadastro` registra que ela mudou provas da `motion` (baseline da C39 e `eleven_segments_have_app_loading`), o que é carregado abaixo | - |

Enumerar elementos e arranjo não se aplica: o diff não desenha nem move nada. A linha de
`Coverage` que a rodada 1 deixou em aberto (mensagens de sucesso e distância de entrada) é
recomputada em `## Coverage`.

## Checks

Provas em escopo reexecutadas em `2d8d629`, agrupadas por alvo. Cada teste nomeado aparece
individualmente na saída como executado e passado.

- Web: `pnpm --filter "./apps/web" exec playwright test e2e/motion.spec.ts -g
  "success_messages_are_feedback_in_180ms|dashboard_cards_reveal_with_40ms_steps|lists_stagger_8_items_at_40ms_and_cap_the_rest"`
  - exit 0, `3 passed`; repetida com `--repeat-each=2` - exit 0, `6 passed (60.0s)`, seis linhas
  `ok` (`motion.spec.ts:434`, `:571`, `:589`) e zero `×`. (Duas execuções `-g` combinadas antes
  destas falharam por jitter de amostragem sob carga concorrente - ver "Open findings" 1; as
  quatro execuções seguintes, quietas, passaram 12/12 testes.)
- Repo: `pnpm --filter "@academia/repo-tests" exec vitest run -t
  "reduced_motion_block_turns_off_every_door_five_rule" --reporter=verbose` - exit 0,
  `1 passed | 79 skipped`, `✓ motion.test.ts > reduced_motion_block_turns_off_every_door_five_rule`.
- C37: `pnpm verify` - exit 1 (ambiente; ver `## Gate`).

Citações das linhas corrigidas/atualizadas nesta rodada; todas as demais linhas ficam como na
rodada 1 porque o diff não as toca.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C24 | As mensagens de sucesso do app carregam `data-motion="feedback"`, `animation-name: feedback-in` e 0,18 s | web, `success_messages_are_feedback_in_180ms` passou (1,4 s e 882 ms nas duas execuções) | o app tem **3** mensagens de sucesso, não 2 (Coverage); a terceira, "Senha alterada.", ganhou o atributo em `apps/web/src/app/account/change-password-form.tsx:39` e é afirmada em `apps/web/e2e/motion.spec.ts:465-468` - `toHaveAttribute('data-motion', 'feedback')`, `animationOf(changed)` igual a `{ name: 'feedback-in', duration: '0.18s' }`; as outras duas seguem em `motion.spec.ts:443-445` e `:452-455`. Fault F6 (abaixo) mata a asserção nova | PASS |
| C27 | 7 cartões do painel entram em cascata de 40 ms e terminam parados; a distância é a da door 4 nas duas bordas | web, `dashboard_cards_reveal_with_40ms_steps` passou (4,2 s em cada execução) | `apps/web/e2e/motion.spec.ts:577-579` mantém a cascata e o fim parado; `:580` afirma a distância a 390 px em (6, 8] (`expectStartDistance` em `:562-569`, `translateYOf` em `apps/web/e2e/support/motion.ts:68`); `:583-586` refaz a amostragem a 1440 px e afirma (10, 12]. Fault F5 morre em `:586` | PASS |
| C28 | 5 listas com 12 itens: cascata de 40 ms até o 8º, corte do 9º em diante, e a distância da door 4 nas duas bordas | web, `lists_stagger_8_items_at_40ms_and_cap_the_rest` passou (20,4 s e 19,1 s) | `apps/web/e2e/motion.spec.ts:596-600` mantém a cascata e o corte; `:603` afirma (6, 8] a 390 px nas 5 listas; `:607-611` refaz a 1440 px e afirma (10, 12] nas 5 listas. Fault F5 morre em `:611` | PASS |
| C37 | `pnpm verify` sai 0 no último commit da feature | `pnpm verify` em `2d8d629` **exit 1** | sem `file:line` por natureza do comando: a falha é ambiente, não código (abaixo). Fora do turbo, no mesmo diff, lint/typecheck/build e as quatro suítes saem 0 | NOT PROVEN |

**Carregado de `6e67520`:** C1-C23, C25, C26, C29-C36 e C38-C54 (50 checks) continuam PASS pela
rodada 1, com as citações dela; esta rodada não as reexecutou porque o diff dos gaps não as toca.
Duas ressalvas que o HEAD novo impõe e que não são falhas da `motion`: (a) a C38 literal
(`git diff --exit-code 7471232..HEAD -- apps/api packages/contracts packages/database
apps/web/src/proxy.ts apps/web/src/lib`) não vale mais no range inteiro porque os 22 commits da
`pre-cadastro` mudam esses caminhos por desenho dela; o que a C38 afirmou da `motion` está provado
em `6e67520`; (b) o baseline e algumas provas da C39 foram alterados pela `pre-cadastro` (registrado
no `## Handoff` dela: opções do `/audit` a 390/1440, link "Interessados" a 1440), e ela re-prova a
C39 como C100. A suíte de repo no HEAD (80 testes) inclui a versão atual de
`eleven_segments_have_app_loading` com os 12 segmentos.

## Coverage

Recomputadas as linhas cuja autoridade o diff tocou; as demais são carregadas da rodada 1.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| success messages after an action (3) | o código no HEAD: todo setter que grava mensagem em resultado `ok` (`grep` de `setNotice`/`setMessage`/`role="status"`) | "Presença registrada às …" `apps/web/src/app/check-in/check-in-desk.tsx:186` C24 · "Configurações salvas." `apps/web/src/app/privacy/privacy-form.tsx:94` C24 · "Senha alterada." `apps/web/src/app/account/change-password-form.tsx:39` C24 | - |
| entrance distance by breakpoint (2 edges, 3 components consuming `useEntrance`) | door 4 e `packages/ui/src/motion.tsx:40-47,58-73`: `PageTransition`, `Reveal` e `StaggerCell`; `StaggerItem` só existe no menu da landing, que só existe abaixo de 1024 px | 1023 -> 8 px C7 (carregada) · 1024+ -> 12 px, page C7 (carregada) · `Reveal` C27 (novo a 1440) · `StaggerCell` C28 (novo a 1440) · `StaggerItem` >= 1024 é inalcançável na UI (o menu que o consome só abre abaixo de 1024), e ele usa o mesmo `Enter` de C27/C28 | - |
| reduced-motion block rules (4) | `packages/ui/src/globals.css:182-206`: `.pressable`/`.pressable:active`, dialog/spinner, skeleton, alert/feedback | literal de todas as 4 regras: `tests/repo/motion.test.ts:233-259` (prova nova, F7 abaixo mata) · valor computado no browser: C19 (`:378`), C34, C47 (carregadas) | - |
| carried rows (18) | rodada 1, `## Coverage` | inalteradas pelo diff | - |

- A linha "success messages (2)" de `checks.md` continua com o texto velho ("2"); o texto do check
  não foi reescrito nesta rodada (L-038), e o check C24 acima afirma as três.
- Fora do escopo desta feature: a `pre-cadastro` acrescentou duas superfícies de sucesso
  (`apps/web/src/app/matricula/enviado/page.tsx:12`,
  `apps/web/src/app/matricula/confirmar/confirm-button.tsx:28`) com `role="status"` e sem
  `data-motion`; são telas daquela feature, cobertas pelas provas dela, e não reabrem o C24 da
  `motion` aqui. Ficam registradas para o Lead (ver "Open findings" 3).

## Test policy rows

A linha que a rodada 1 deixou por cumprir foi rejulgada; as demais foram reconferidas por não
classificarem arquivo tocado.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, rendered in the browser | `page-transition.tsx`, `packages/ui/src/motion.tsx` (`Reveal`/`Stagger`/`StaggerItem`/`StaggerCell`), `site-header.tsx`, `Button` `busy` | browser proof, one case per branch | **yes** - o ramo que faltava (a distância de breakpoint do `Enter`) agora tem caso nas duas bordas para `Reveal` (C27) e `StaggerCell` (C28), com F5 morto; `PageTransition` (C6-C10), `SiteHeader` (C43-C51) e `busy` (C20) carregados. `StaggerItem` >= 1024 é inalcançável na UI porque só o menu da landing o consome e o menu só existe abaixo de 1024; ele compartilha o `Enter` que C27/C28 provam |
| Structural rule over files | `identidade.test.ts`, `motion.test.ts` sobre manifestos, imports, tokens, `loading.tsx`, `busy`, `site-header.tsx` | one repo test, table-driven over the set | yes - carregada (C1 C3 C4 C5 C14 C21 C52); a prova nova do repo é estrutural também e passou |
| CSS rule (keyframes, `.pressable`, reduced-motion block) | `packages/ui/src/globals.css` | a repo test for the literal **and** a browser test for the computed value, for each door-5 rule | **yes** - a prova nova `reduced_motion_block_turns_off_every_door_five_rule` afirma o literal das 4 regras do bloco reduzido (seletores, ordem e declarações exatas), e os valores computados seguem em C19/C34/C47 carregadas; F7 (abaixo) mata a prova |
| Instrumentation | `MotionProvider`, `Skeleton`, `AppLoading`, 11 `loading.tsx` | none of its own beyond the structural row | yes - carregada (C2, C13-C16, C14; C14 agora com 12 segmentos pelo HEAD novo) |

## Faults injected

F5 reaplicado e dois faults novos, um por superfície que o diff criou. Tudo em
`git worktree add --detach C:\Users\Admin\projetos\academia-bairro-r2-wt 2d8d629`, dependências com
`pnpm install --offline --frozen-lockfile`, cada fault aplicado sozinho, a prova mais estreita
rodada, e `git checkout -- .` antes do próximo. `git status --porcelain` da árvore real antes:
`?? CLAUDE.md`; depois: `?? CLAUDE.md` (idêntico). O worktree foi removido (`git worktree list` só
mostra a árvore principal) e o diretório apagado.

| Mutation | Location | Killed |
| --- | --- | --- |
| F5 (reaplicado): a entrada de cartão/lista ignora a distância de desktop, `enter(distance)` -> `enter(MOTION.distance)` | `packages/ui/src/motion.tsx:65` | yes - `dashboard_cards_reveal_with_40ms_steps` falha em `motion.spec.ts:586` ("1440 cartão item 0 distância: Expected > 10, Received 7.95634") e `lists_stagger_8_items_at_40ms_and_cap_the_rest` falha em `:611` ("/students 1440 item 0 distância: Expected > 10, Received 8") |
| F6 (novo): a mensagem de sucesso de `/account` perde o atributo (`{...(notice.failed ? {} : { 'data-motion': 'feedback' })}` removido) | `apps/web/src/app/account/change-password-form.tsx:39` | yes - `success_messages_are_feedback_in_180ms` falha em `motion.spec.ts:467` ("Expected: \"feedback\", Received: null"); a mensagem ainda anima por ser `role="alert"`, que é exatamente por que AC 24 nomeia o atributo |
| F7 (novo): o bloco reduzido deixa de zerar o `transform` do alerta/feedback (a declaração `transform: none` * removida da regra `[role='alert'], [data-motion='feedback']`) | `packages/ui/src/globals.css:204` | yes - `reduced_motion_block_turns_off_every_door_five_rule` falha em `tests/repo/motion.test.ts:254` (`expected [ [ 'animation', 'none' ], …(1) ] to deeply equal [ [ 'animation', 'none' ], …(2) ]`) |

Rodada 1: F1-F4 mortos; F5 sobreviveu e é o que a prova nova mata nesta rodada.

## Gate

`pnpm verify` em `2d8d629` - **exit 1**, ambiente. Saída (`.turbo/verifier-r2/pnpm-verify.log`):

- `@academia/repo-tests:test` - `Error: EPERM: operation not permitted, mkdir
  'C:\Users\Admin\AppData\Local\Temp\wRn-88IoE9Favq36ozXSl\ssr'`, 5 arquivos, "Tests no tests".
- `@academia/database:test` - `Error: EPERM: operation not permitted, mkdir
  'C:\Users\Admin\AppData\Local\Temp\3sDTqrLaam1fgEnPYZqtF\ssr'`, 12 arquivos, "Tests no tests".
- `@academia/api:test` - `Error: EPERM: operation not permitted, open
  'C:\Users\Admin\AppData\Local\Temp\vitest-coverage-51f998f1df3437a4.lock'`.
- turbo: `Tasks: 15 successful, 19 total` / `Failed: @academia/api#test` (as tarefas filhas de
  teste não criam diretório em `%TEMP%` nem abrem o lock de cobertura; o `pnpm verify` da rodada 1
  já havia registrado a variante "Could not find a working container runtime strategy" quando
  `TMP`/`TEMP` são movidos para dentro do workspace).

Fora do turbo, no mesmo `2d8d629` (`.turbo/verifier-r2/outside-turbo.log`,
`.turbo/verifier-r2/suites-outside-turbo.log`) - todas exit 0:

- `pnpm -r --workspace-concurrency=1 run lint`, `typecheck` e `build` - exit 0.
- contratos: 17 testes em 8 arquivos, 0 failed.
- repo-tests: 80 testes em 5 arquivos, 0 failed (inclui a prova nova e
  `motion_is_the_only_added_dependency`).
- banco: 74 testes em 12 arquivos, 0 failed.
- API: 781 testes em 86 arquivos, 0 failed; cobertura de `apps/api/src` 96.24% de linhas e 94.12%
  de ramos.
- as 3 provas web dos gaps: 3 passed, e 6/6 com `--repeat-each=2`; os faults acima falham.

`pnpm verify` literalmente não sai 0 neste ambiente. A substituição por tarefa **não prova** a
C37 (L-041); por isso o resultado desta rodada é FAIL com um único gap aberto, e não PASS.

**Gaps da rodada 1:** 1 (mensagem "Senha alterada." sem feedback e fora da Coverage) fechado;
2 (distância de entrada de `Reveal`/`StaggerCell` a partir de 1024 px, F5 sobrevivente) fechado;
3 (literal do bloco de movimento reduzido sem prova) fechado; 4 (C37) **aberto por ambiente**.

**Ranked gaps**:

1. C37 NOT PROVEN - `pnpm verify` sai 1 neste ambiente porque o turbo confina as tarefas filhas
   (EPERM em `%TEMP%` e no lock de cobertura do vitest); fora do turbo, no mesmo diff, lint,
   typecheck, build e contratos 17 / repo 80 / banco 74 / API 781 saem 0 - sem `file:line`, é
   ambiente, não produto (L-041).

## Open findings (do not change the verdict)

1. Fragilidade da prova nova de distância a 1440 px (precision, sobre a prova, não sobre o check):
   a amostragem grava o `translateY` a cada quadro e a prova usa o máximo observado; com a curva
   de easing da door 1, um quadro perdido no mount deixa o primeiro valor em ~9,6 px, abaixo do
   piso `> 10` de `motion.spec.ts:586` e `:611`, embora a entrada comece em 12 px. Isso foi
   reproduzido **uma vez** numa execução `-g` combinada enquanto um `pnpm install` rodava junto
   (9.595 em `/students` 1440; na outra execução, sob a mesma carga, a cascata de 40 ms de
   `/check-ins` errou por 6,4 ms, falha que já existia na C28). As duas provas passaram em 6/6
   execuções quietas depois disso, e F5 (que deixa 8 px) morre. O piso `> 10` deixa pouca margem
   para um quadro perdido num CI carregado; se o C37 for reaberto, vale amostrar a partir do
   quadro do mount ou baixar o piso para 8 px, que ainda mata F5. Não é gap aberto porque a prova
   reexecutou verde e o check (a cascata) não fala de distância.
2. Texto de `checks.md` desatualizado, por decisão desta rodada de não reescrever checks: a C24
   diz "as 2 mensagens de sucesso" e a linha `Coverage` "success messages (2)"; o app tem 3, e a
   C24 agora as prova. Registrado para quando o `checks.md` for reaberto (L-038).
3. `pre-cadastro` acrescentou duas superfícies de sucesso fora do escopo da `motion`
   (`matricula/enviado/page.tsx:12` e `matricula/confirmar/confirm-button.tsx:28`, `role="status"`
   sem `data-motion`). A AC 24 da `motion` fala de "uma ação que sucede e renderiza uma
   mensagem"; essas telas são da outra feature e estão cobertas pelas provas dela. Fica registrado
   para o Lead decidir se a regra passa a valer para telas novas, mas não foi reaberto aqui.
4. Precision da rodada 1 que continua valendo (não muda o resultado): o texto da C39 ainda diz
   "fora de `[data-slot="site-header"]` e `#site-menu"]`" enquanto a prova também ignora o header
   antigo e, desde a AD-106, `#planos`; `ENTER = 0.22` em `packages/ui/src/motion.tsx:23` não sai
   de `MOTION` (AC 3); a AC 21 cobre o literal `disabled={pending}`, e 10 botões de submit usam
   `disabled={isSubmitting}` sem spinner.
