# DukFit app verification

**Verdict**: PASS
**Profile**: ui
**Diff range**: de214e2..a74106a (fix diff `0958f7c..a74106a`)
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

Rodada 3, com escopo pelo diff da correção e pelos dois achados não-PASS da rodada 2. O diff tem três
commits: `dd6cd84` (código), `ba8194b` (testes) e `a74106a` (specs). O que o diff não podia tocar vem
marcado `carried from 0958f7c`; o que foi refeito vem marcado `verified at a74106a`. As provas rodaram
**todas** de novo no `HEAD` `a74106a`.

Os dois achados da rodada 2 estão fechados, cada um com código ou prova e com uma falha injetada morta:

1. **Texto do centro do `Gauge` da landing sobre as marcas.** Com `display`, o `Gauge` usa `text-2xl`
   (`packages/ui/src/components/panel.tsx:130`). Sem `display`, o número do painel segue em `text-4xl`.
   Medi numa worktree descartável, com um spec de sondagem que não entrou no repo. A 320, 360, 390, 768,
   1023 e 1440 px a caixa do texto (154,5 x 33 px) cruza **0** marcas, tanto pelo Range do texto quanto
   pela caixa do parágrafo. O texto fica entre as marcas das pontas: a 360 px a ponta esquerda termina em
   74 px, o texto vai de 103 a 257 px e a ponta direita começa em 294 px. O centro do texto fica abaixo
   da marca do alto e acima das pontas. A captura a 360 px bate com o mockup. A C45 agora afirma 0
   cruzamentos a 360, 390 e 1440 px (`dukfit.spec.ts:852`).
2. **AC 10 na borda 1023/1024.** A C46 afirma o padding do `main` em 16px/16px a 1023 px e 32px/32px a
   1024 px (`dukfit.spec.ts:800-801`).

Também confirmei a correção cosmética: o JSDoc da `LandingPage` voltou para cima da função
(`apps/web/src/app/page.tsx:28-32`).

## Binding sources

verified at a74106a só para o `Gauge` da seção "Horários" da landing; o resto carried from 0958f7c, onde
cada linha já tinha `Contradiction` e `Uncovered` vazios.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| mockup de três telas (`images/1.png`), medidor "Training Schedule" -> `Gauge` da landing (verified at a74106a) | yes - aberta na rodada 2 desta sessão. O "6:00 PM" fica dentro do semicírculo, longe das pontas, com a pílula logo abaixo | none | - |
| mockup de três telas, cabeçalho, botão do menu e demais elementos (carried from 0958f7c) | yes | none | - |
| prancha de telas (`images/2.webp`) (carried from 0958f7c) | yes | none | - |
| `plan.md` `## De-para` (carried from 0958f7c; a linha "horários (no `Gauge`)" verified at a74106a) | yes - 14 linhas | none | - |

Observação, sem mudar o veredito: a landing ainda mostra o primeiro horário duas vezes, no `Gauge` e no
primeiro cartão do `dl` (`page.tsx:114-135`). Nenhuma fonte binding decide contra isso.

No `Gauge` da landing, "06:00 - 22:00" a 24 px fica dentro do arco em todas as larguras medidas: 0
marcas cruzadas de 320 a 1440 px, e o centro do texto fica entre a marca do alto e as pontas. A C45 afirma
isso (`dukfit.spec.ts:835-853`).

## Checks

verified at a74106a. Todas as provas rodaram de novo no `HEAD`:

- `pnpm --filter @academia/web exec playwright test --reporter=list`: **349 passed**, exit 0 (4,1 min).
  Os 35 nomes de `dukfit.spec.ts` aparecem um a um com `ok`, entre eles
  `breakpoints_switch_at_768_and_1024` (`:776`) e `landing_hours_use_the_gauge` (`:821`). Não houve
  retentativa: o TIME_WAIT estava em 1245 antes da rodada.
- `pnpm --filter @academia/api exec vitest run test/dashboard.test.ts --reporter=verbose`: **42 passed**.
- `pnpm --filter @academia/contracts exec vitest run --reporter=verbose`: **16 passed**.
- `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts --reporter=verbose`: **6 passed**.

A correção só tocou `dukfit.spec.ts` depois da linha 790. Por isso as citações de C1 a C44 seguem as da
rodada 2 (carried from 0958f7c) e valem no `HEAD`. Só C45 e C46 têm citação nova.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `<title>` e wordmark "DukFit" | e2e `dukfit.spec.ts:44` ok | `apps/web/e2e/dukfit.spec.ts:46`, `:50`, `:56` `toHaveTitle('DukFit')`; `:47`, `:51` wordmark; `:57` `h1` | PASS |
| C2 | avatar, nome, perfil; disposição; botão 44 px raio 12 px | e2e `dukfit.spec.ts:61` ok | `:73` `'MD'`; `:75` `[44, 44]`; `:76` `'50%'`; `:78` perfil; `:83` `'A'`; `:93-95` disposição; `:96` `[44, 44]`; `:97` `'12px'`; `:99` borda direita | PASS |
| C3 | 390, admin: barra fixa #141414 24px, 5 itens, sem lateral | e2e `dukfit.spec.ts:103` ok | `:111` `'fixed'`; `:114` `CARD`; `:115` `'24px'`; `:116` `toHaveCount(5)`; `:117` `toBeHidden()` | PASS |
| C4 | itens por perfil | e2e `dukfit.spec.ts:120` ok | `:124-127`; `:132` `toEqual(names)`; `:137` 20x20 | PASS |
| C5 | item ativo | e2e `dukfit.spec.ts:142` ok | `:153` `aria-current`; `:154` `HEADER`; `:155` `LIME`; `:156-158` | PASS |
| C6 | menu "Mais" e do cabeçalho | e2e `dukfit.spec.ts:162` ok | `:189`, `:198` `toEqual(links)`; `:190`, `:199` "Sair" | PASS |
| C7 | lateral 1440 | e2e `dukfit.spec.ts:204` ok | `:211` `256`; `:215` nomes; `:230` `svg`; `:233` 20x20; `:235`; `:236` | PASS |
| C8 | FAB 56x56 lime 16px, fixo, canto, acima da barra | e2e `dukfit.spec.ts:239` ok | `:248` `href`; `:250` `[56, 56]`; `:251` `LIME`; `:252` `'16px'`; `:254` `'fixed'`; `:255`; `:257`; `:259` | PASS |
| C9 | sem FAB para hr_finance/instrutor | e2e `dukfit.spec.ts:265` ok | `:271` `toHaveCount(0)` | PASS |
| C10 | 390: gutter 16, folga da barra | e2e `dukfit.spec.ts:275` ok | `:282-283` `'16px'`; `:287` `toBeLessThanOrEqual(navTop)` | PASS |
| C11 | sem rolagem horizontal, 21 telas | e2e `dukfit.spec.ts:290` ok | `:295` `toHaveLength(21)`; `:307` `toBe(client)` | PASS |
| C12 | cards por perfil, #141414, 24px, título 20/600 | e2e `dukfit.spec.ts:314` ok; `dashboard.spec.ts:324` ok | `:319`; `:322` `CARD`; `:323` `'24px'`; `:325` `'20px'`; `:326` `'600'`; `apps/web/e2e/dashboard.spec.ts:338` | PASS |
| C13 | setas 32x32 | e2e `dukfit.spec.ts:331` ok | `:340` `href`; `:342` `[32, 32]`; `:343` `BORDER`; `:344` `svg` | PASS |
| C14 | medidor 40/16/24, "4", data, semicírculo | e2e `dukfit.spec.ts:352` ok | `:358-360` contagens; `:363` `'4'`; `:364` data; `:373-387` arranjo; `:393` zero lime | PASS |
| C15 | colunas `QUI..QUA` | e2e `dukfit.spec.ts:397` ok | `:403`; `:404`; `:405`; `:419` | PASS |
| C16 | cores pela regra 0,9 | e2e `dukfit.spec.ts:422` ok | `:430-432` `toEqual([LIME, LIME, ORANGE, ORANGE, OFF, LIME, ORANGE]...)` | PASS |
| C17 | "Ativos" 31, pílulas | e2e `dukfit.spec.ts:435` ok; `dashboard.spec.ts:41` ok | `:440` `'31'`; `:443`; `:451` `HEADER`; `:452` `>= 9999`; `:453` `LIME`; `apps/web/e2e/dashboard.spec.ts:48-50` | PASS |
| C18 | `MetricTile` | e2e `dukfit.spec.ts:457` ok; `dashboard.spec.ts:123` ok | `:469` `TILE`; `:470` `LIME`; `:471` `'16px'`; `:472` `'12px'`; `:475` `'24px'`; `:476` `'tabular-nums'`; `:477` `href`; `apps/web/e2e/dashboard.spec.ts:132`, `:134` | PASS |
| C19 | linhas x `table` | e2e `dukfit.spec.ts:481` ok | `:495`; `:497`; `:500`; `:502` | PASS |
| C20 | erro 500 dentro do shell | e2e `dukfit.spec.ts:765` ok; `dashboard.spec.ts:178` ok | `:769`; `:770`; `:771`; `apps/web/e2e/dashboard.spec.ts:189` | PASS |
| C21 | vazios | e2e `dashboard.spec.ts:113`, `:154` ok | `apps/web/e2e/dashboard.spec.ts:119`, `:160` | PASS |
| C22 | grade 3/1 | e2e `dukfit.spec.ts:508` ok | `:517` `toBe(3)`; `:518` `toBe(1)` | PASS |
| C23 | ponto do menu | e2e `dukfit.spec.ts:521` ok | `:530` `[8, 8]`; `:531` `LIME`; `:532`; `:536`, `:541` | PASS |
| C24 | série de 7 dias | vitest `dashboard.test.ts:794` ok | `apps/api/test/dashboard.test.ts:802` `'2026-10-07'`; `:803` `toEqual([...])` | PASS |
| C25 | fora da janela | vitest `dashboard.test.ts:815` ok | `apps/api/test/dashboard.test.ts:820`; `:821`; `:822` | PASS |
| C26 | virada da meia-noite | vitest `dashboard.test.ts:825` ok | `apps/api/test/dashboard.test.ts:834` `toBe(today)`; `:835` `toBe(checkIns!.count)` | PASS |
| C27 | `lastSevenDays` por perfil; schema 7 itens | vitest `dashboard.test.ts:850` ok; contracts ok | `apps/api/test/dashboard.test.ts:857`; `:858`; `packages/contracts/test/dashboard.test.ts:211-212` | PASS |
| C28 | 401 `application/problem+json` | vitest `dashboard.test.ts:193` ok | `apps/api/test/dashboard.test.ts:196` `toBe(401)`; `:197` `toMatch(/^application\/problem\+json/)`; `:199` `'unauthorized'` | PASS |
| C29 | `/` público 200 | e2e `dukfit.spec.ts:546` ok | `:549`; `:550`; `:551`; `:552` | PASS |
| C30 | seções da landing | e2e `dukfit.spec.ts:555` ok | `:560` ordem; `:563`; `:574-575`; `:578-583` | PASS |
| C31 | CTA por sessão | e2e `dukfit.spec.ts:586` ok | `:589`; `:590`; `:596`; `:598` | PASS |
| C32 | landing sem shell, origem externa ou CSP | e2e `dukfit.spec.ts:601` ok; `csp.spec.ts:49` ok | `:616-620`; `apps/web/e2e/csp.spec.ts:69`, `:80`, `:83` | PASS |
| C33 | destaques 1/3 | e2e `dukfit.spec.ts:623` ok | `:631`; `:632` | PASS |
| C34 | `SITE` e imports | vitest repo ok | `tests/repo/identidade.test.ts:96`, `:99`, `:105`, `:106` | PASS |
| C35 | login e 2FA -> `/dashboard` | e2e `login.spec.ts:21`, `two-factor.spec.ts:113` ok | `apps/web/e2e/login.spec.ts:41`; `apps/web/e2e/two-factor.spec.ts:124` | PASS |
| C36 | logado `/login` -> `/dashboard` | e2e `shell.spec.ts:173` ok | `apps/web/e2e/shell.spec.ts:178` | PASS |
| C37 | anônimo -> `/login` | e2e `shell.spec.ts:4` ok | `apps/web/e2e/shell.spec.ts:10` | PASS |
| C38 | 2FA pendente | e2e `dukfit.spec.ts:637` ok | `:642`; `:643`; `:646` | PASS |
| C39 | "Bem-vindo de volta" | e2e `dukfit.spec.ts:649` ok | `:651`; `:652`; `:658`; `:661-662`; `:666`; `:668` | PASS |
| C40 | "Início" e 404 | e2e `dukfit.spec.ts:671` ok | `:676`; `:678`; `:681`; `:682`; `:683` | PASS |
| C41 | telas internas 24/700 e #141414 | e2e `dukfit.spec.ts:688` ok | `:695`; `:696`; `:714` | PASS |
| C42 | tabela rola, formulário cheio | e2e `dukfit.spec.ts:718` ok | `:730`; `:731`; `:732`; `:742`; `:745` | PASS |
| C43 | 24 telas e impressão | e2e `identidade.spec.ts:334`, `dukfit.spec.ts:748` ok | `apps/web/e2e/identidade.spec.ts:337`, `:363`; `dukfit.spec.ts:757-759` | PASS |
| C44 | `pnpm verify` e sem dependência nova | `pnpm verify` exit 0; vitest repo ok | `tests/repo/identidade.test.ts:120`; o diff `0958f7c..a74106a` não toca `package.json` nem `pnpm-lock.yaml` | PASS |
| C45 | `Gauge` na landing: 40 marcas, 27 lime, centro e pílula; texto sem cruzar marcas (verified at a74106a) | e2e `dukfit.spec.ts:821` ok | `:826` `toHaveCount(1)`; `:827` `toHaveText(\`${first.opens} - ${first.closes}\`)`; `:828` pílula; `:830` `toHaveLength(40)`; `:832` `toHaveLength(27)`; novo `:835` `[NARROW, MOBILE, DESKTOP]` e `:852` `expect(crossed, ...).toBe(0)`, sobre a caixa do Range do texto | PASS |
| C46 | bordas 767/768/1023/1024 e gutter do AC 10 (verified at a74106a) | e2e `dukfit.spec.ts:776` ok | novos `:800` `gutter(1023)` `toEqual(['16px', '16px'])` e `:801` `gutter(1024)` `toEqual(['32px', '32px'])`; `:803-806` barra, lateral, grade e `table`; `:816-818` destaques 1, 1, 3 | PASS |

## Coverage

verified at a74106a para as duas linhas que a correção tocou; as demais são carried from 0958f7c, com as
provas re-rodadas verdes no `HEAD`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| pontos de virada (2 bordas) (verified at a74106a) | AC 3, AC 7, AC 10, AC 19, AC 22, AC 34 e `Assumptions` | 767/768 C46 (`dukfit.spec.ts:803-804`) · 1023/1024 C46 (`:805-806`, destaques `:817-818`, gutter do AC 10 `:800-801`; o código está em `apps/web/src/components/shell.tsx:57` `px-4 ... lg:px-8`) | - |
| linhas do De-para (14) e valores (verified at a74106a) | `plan.md` `## De-para` | cabeçalho C2 · ponto C23 · barra inferior C3 C4 C5 · lateral C7 · FAB C8 C9 · `Panel` C12 C13 · `Gauge` do painel C14 · `StatPill` C17 · `MetricTile` C18 · `WeekBars` C15 C16 · `ListRow`/`Table` C19 · login C39 · landing C30 C45 ("hora no centro" sem cruzar marcas, `:852`) | - |
| `GET /api/dashboard` statuses e forma (3) (carried from 0958f7c) | `Surface` + AC 28 | C24 · C28 (`dashboard.test.ts:196`, `:197`) | - |
| seções da landing (5) (carried from 0958f7c) | AC 30 | C30, C45 | - |
| `GET /` (1), `GET /dashboard` (3), doors (4), perfis x barra/FAB/cabeçalho (4 cada), cores (3), janela (4), CTA (2), destinos (7), estados do painel (3), telas com shell (21) (carried from 0958f7c) | `Surface`, `Landing`, `lib/*.ts`, AC 16, door 2, `Impact`, `Observable`, `glob page.tsx` | C29 · C12 C37 C38 · C29-C39 · C4 C8 C9 C2 · C16 · C24-C26 · C31 · C35 C36 C40 · C12 C20 C21 · C11 C43 | - |

## Test policy rows

verified at a74106a para as linhas que classificam arquivos tocados: `panel.tsx` como instrumentação e
`page.tsx` como entry point. A outra é carried from 0958f7c.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary (carried from 0958f7c) | `dashboard.service.ts`, `nav.tsx`, `panel.tsx` (`barColor`, `litTicks`) | uma na fronteira | yes - C4, C14, C16, C24-C26 |
| Entry point that decides nothing (verified at a74106a) | `apps/web/src/app/page.tsx` (só o JSDoc mudou) | uma na fronteira | yes - landing renderizada em Chromium, C29-C33 e C45 |
| Instrumentation (verified at a74106a) | `packages/ui/src/components/panel.tsx` (classe do `Gauge` por `display`) | coberta pelo consumidor | yes - `text-2xl` com `display` pela C45 (`:852`); `text-4xl` sem `display` segue para o painel, C14 verde |

## Faults injected

verified at a74106a. Isolamento: `git worktree add C:\Users\Admin\AppData\Local\Temp\dukfit-verify-wt3
HEAD` e `pnpm install --offline`. O porcelain da árvore real antes era `?? CLAUDE.md`. Cada falha foi
aplicada sozinha, rodou a prova mais estreita e foi revertida com `git checkout -- <arquivo>`. Depois,
`git worktree remove --force` e `rmdir \\?\...` para o caminho longo. `git worktree list` mostra só a
árvore real, e o porcelain dela saiu idêntico: `?? CLAUDE.md`. Houve uma falha por superfície nova:
tamanho do texto do medidor e gutter do AC 10.

| Mutation | Location | Killed |
| --- | --- | --- |
| texto do centro com `display` volta a `text-4xl` (`'text-4xl' : 'text-2xl'` -> `'text-4xl' : 'text-4xl'`) | `packages/ui/src/components/panel.tsx:130` | yes - `landing_hours_use_the_gauge` falhou em `dukfit.spec.ts:852` (`Expected: 0`, `Received: 12`), exit 1. Na mesma execução `gauge_lights_ticks_in_proportion_to_the_week_max` (C14) ficou verde, então só a asserção nova da C45 pega esse defeito. Isso confirma, com execução própria, o número que o autor relatou |
| gutter do `main` cresce em `md:` e não em `lg:` (`lg:px-8` -> `md:px-8`) | `apps/web/src/components/shell.tsx:57` | yes - `breakpoints_switch_at_768_and_1024` falhou em `dukfit.spec.ts:800` (recebeu `["32px", "32px"]` a 1023 px), exit 1. Na mesma execução `mobile_main_has_sixteen_gutter_and_clears_the_bottom_nav` (C10, 390 px) ficou verde |

## Gate

verified at a74106a.

- `pnpm --filter @academia/web exec playwright test --reporter=list`: **349 passed, 0 failed**, exit 0
  (4,1 min), sem retentativa.
- `pnpm --filter @academia/api exec vitest run test/dashboard.test.ts`: **42 passed**, exit 0.
- `pnpm --filter @academia/contracts exec vitest run`: **16 passed**, exit 0.
- `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts`: **6 passed**, exit 0.
- `pnpm verify`: **exit 0**, 21 successful, 21 total. Foram 20 cache hits do turbo: o hash das entradas é
  o da execução do autor no mesmo `HEAD` (web 349, api 713, contracts 16, database 68, repo 34). A web,
  o `dashboard.test.ts` da API, os contratos e o `identidade.test.ts` foram rodados por mim, fora do
  cache, nas linhas acima.
