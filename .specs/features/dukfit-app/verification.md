# DukFit app verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: de214e2..4b5313f60b0eeb206d30e050ca47187209c827f3 (fix diff `bd74d0c..4b5313f`)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Rodada 2, com escopo pelo diff da correção (`ba2608e` código, `1e9f107` testes, `4b5313f` specs) e
pelos sete achados não-PASS da rodada 1. Tudo o que o diff não podia tocar vem marcado `carried from
bd74d0c`; o que foi refeito vem marcado `verified at 4b5313f`. As provas rodaram **todas** de novo no
`HEAD` `4b5313f`. Os arquivos tocados pela correção (`dukfit.spec.ts` e `apps/api/test/dashboard.test.ts`)
mudaram de numeração, então toda citação deles foi refeita.

Os sete achados da rodada 1 estão fechados: o `Gauge` existe na landing (C45), a geometria do
semicírculo (C14), a posição do botão flutuante (C8), a disposição e o raio do botão de menu (C2), as
bordas 768/1024 (C46), a mídia `application/problem+json` (C28) e os quatro valores do De-para (C12,
C17, C18). As cinco falhas injetadas nessas superfícies novas foram mortas.

O FAIL vem de duas coisas que a correção abriu ou deixou de fora:

1. **O texto do centro do `Gauge` da landing invade as marcas do arco.** "06:00 - 22:00" em `text-4xl`
   tem 232 px de largura dentro de um medidor `max-w-xs`. Em 360 px a caixa do texto cruza **9** marcas
   (nas pontas esquerda e direita do arco). Em 390, 768 e 1440 px ainda cruza 1. O mockup desenha "6:00 PM" dentro do arco,
   com folga, e o De-para fixa "hora no centro". A C45 só conta marcas e lê textos. A asserção "número
   centrado e dentro do arco" da C14 só roda no "4" do painel. Nenhuma prova pega a colisão.
2. **A borda 1023/1024 da AC 10 (gutter de 16 px e folga da barra inferior) continua sem prova.** A
   rodada 1 listou a AC 10 entre as autoridades das bordas. A C46 cobre AC 3, 7, 19, 22 e 34, mas deixa
   a AC 10 de fora. O código está certo (`shell.tsx:57` `px-4 ... lg:px-8 lg:pb-12`), mas um corte
   `md:px-8` passaria.

## Binding sources

verified at 4b5313f para as telas que a correção tocou (seção "Horários" da landing e botão de menu do
cabeçalho do shell); o resto carried from bd74d0c.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| mockup de três telas (`images/1.png`), cabeçalho e botão do sino (verified at 4b5313f) | yes - imagem aberta nesta rodada: avatar à esquerda, nome e "Level" empilhados, botão quadrado à direita na mesma linha, raio pequeno | none | - (C2 agora afirma avatar < nome < botão no eixo x, centros alinhados ±4 px, 44x44, raio 12 px e o botão na borda direita do `main`, a 390 e 1440 px: `dukfit.spec.ts:93-99`) |
| mockup de três telas (`images/1.png`), medidor "Training Schedule" -> `Gauge` da landing (verified at 4b5313f) | yes - o "6:00 PM" fica dentro do semicírculo de marcas, longe das pontas, com a pílula logo abaixo | none | o texto do centro dentro do arco, na landing. Medido no `HEAD` numa worktree descartável: caixa de `gauge-value` com 231,75 px; ela cruza 9 caixas de marca a 360 px e 1 a 390/768/1440 px. A captura a 360 px mostra "06" e "00" sobre as marcas das pontas. A C45 (`dukfit.spec.ts:811-823`) não afirma posição. A C14 (`:383-387`) afirma "dentro do arco" só para o "4" do painel |
| mockup de três telas, demais elementos (carried from bd74d0c) | yes - rodada 1 | none | - (os três arranjos sem prova da rodada 1 - semicírculo, botão flutuante, cabeçalho - agora têm asserção: C14 `:366-387`, C8 `:253-260`, C2 `:85-100`) |
| prancha de telas (`images/2.webp`) (verified at 4b5313f para as seções da landing) | yes - imagem aberta nesta rodada | none | - |
| `plan.md` `## De-para` (binding pelo `checks.md`) (verified at 4b5313f) | yes - as 14 linhas | none | - a linha "horários (no `Gauge`)" agora é implementada (`apps/web/src/app/page.tsx:114-122`) e provada pela C45. Os valores botão 44 px/raio 12 px, `Panel` 20 px/600, `StatPill` 9999 px e `MetricTile` 16 px/12 px estão afirmados. A colisão do texto do centro está na linha acima |

Observações, sem mudar o veredito por si:

- A landing mostra o primeiro horário duas vezes: no `Gauge` e no primeiro cartão do `dl`
  (`page.tsx:114-135`). Nenhuma fonte binding decide contra isso. A C30 lê a lista (`dukfit.spec.ts:571-576`)
  e a C45 lê o medidor.
- `page.tsx:22-25`: o JSDoc da `LandingPage` ficou acima de `openHours` (`:26-29`) e não acima da
  função que ele descreve. É cosmético.

## Checks

verified at 4b5313f. Todas as provas rodaram de novo no `HEAD`:

- `pnpm --filter @academia/web exec playwright test --reporter=list`: **349 passed**, exit 0 (4,2 min).
  Os 35 nomes de `dukfit.spec.ts` aparecem um a um com `ok`, entre eles
  `breakpoints_switch_at_768_and_1024` (`:776`) e `landing_hours_use_the_gauge` (`:811`). Não houve
  retentativa: o TIME_WAIT estava em 747 antes da rodada.
- `pnpm --filter @academia/api exec vitest run test/dashboard.test.ts --reporter=verbose`: **42 passed**.
- `pnpm --filter @academia/contracts exec vitest run --reporter=verbose`: **16 passed**.
- `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts --reporter=verbose`: **6 passed**.

As citações de `dashboard.spec.ts`, `shell.spec.ts`, `login.spec.ts`, `two-factor.spec.ts`, `csp.spec.ts`,
`identidade.spec.ts`, `packages/contracts/test/dashboard.test.ts` e `tests/repo/identidade.test.ts` são as
da rodada 1 (carried from bd74d0c). A correção não tocou esses arquivos (`git diff --stat bd74d0c..HEAD`).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `<title>` e wordmark "DukFit" | e2e `dukfit.spec.ts:44` ok | `apps/web/e2e/dukfit.spec.ts:46`, `:50`, `:56` `toHaveTitle('DukFit')`; `:47`, `:51` wordmark; `:57` `h1` do banner | PASS |
| C2 | avatar 44x44 50% "MD"/"A", nome, "Perfil: <perfil>"; + disposição e botão 44 px raio 12 px | e2e `dukfit.spec.ts:61` ok | `:73` `toHaveText('MD')`; `:75` `toEqual([44, 44])`; `:76` `toBe('50%')`; `:78` perfil; `:83` `'A'`; novos: `:93` `avatar.x < name.x`; `:94` nome antes do botão; `:95` centros ±4; `:96` botão `toEqual([44, 44])`; `:97` `toBe('12px')`; `:99` botão na borda direita | PASS |
| C3 | 390, admin: barra inferior fixa, #141414, 24px, 5 itens, sem lateral | e2e `dukfit.spec.ts:103` ok | `:111` `toBe('fixed')`; `:114` `toBe(CARD)`; `:115` `toBe('24px')`; `:116` `toHaveCount(5)`; `:117` `toBeHidden()` | PASS |
| C4 | itens da barra por perfil, na ordem | e2e `dukfit.spec.ts:120` ok | `:124-127` arrays; `:132` `toEqual(names)`; `:137` ícone 20x20 | PASS |
| C5 | ativo `aria-current`, rgb(31,31,31), ícone lime, 390 e 1440 | e2e `dukfit.spec.ts:142` ok | `:153` `aria-current`; `:154` `toBe(HEADER)`; `:155` `toBe(LIME)`; `:156-158` "Início" sem os três | PASS |
| C6 | "Mais" e botão do cabeçalho abrem diálogo com links + "Minha conta" + "Sair" | e2e `dukfit.spec.ts:162` ok | `:189`, `:198` `toEqual(links)`; `:190`, `:199` "Sair" | PASS |
| C7 | 1440: lateral 256, wordmark, links com `svg`, "Sair", sem barra | e2e `dukfit.spec.ts:204` ok | `:211` `toBe(256)`; `:215` 11 nomes; `:230` `svg` `toHaveCount(1)`; `:233` 20x20; `:235` "Sair"; `:236` `toBeHidden()` | PASS |
| C8 | FAB admin/recepção: `/check-in`, 56x56, lime, 16px; + fixo, canto inferior direito, acima da barra | e2e `dukfit.spec.ts:239` ok | `:248` `href`; `:250` `toEqual([56, 56])`; `:251` `toBe(LIME)`; `:252` `toBe('16px')`; novos: `:254` `toBe('fixed')`; `:255` `<= 32` da direita; `:257` base `<=` topo da barra (celular); `:259` `<= 32` do rodapé (computador) | PASS |
| C9 | hr_finance e instrutor sem FAB | e2e `dukfit.spec.ts:265` ok | `:271` `toHaveCount(0)` | PASS |
| C10 | 390: `main` 16px laterais, último filho acima da barra | e2e `dukfit.spec.ts:275` ok | `:282-283` `toBe('16px')`; `:287` `toBeLessThanOrEqual(navTop)` | PASS |
| C11 | 360 e 1440: sem rolagem horizontal nas 21 telas | e2e `dukfit.spec.ts:290` ok | `:295` `toHaveLength(21)`; `:307` `toBe(client)` | PASS |
| C12 | títulos = resposta; `region` #141414 raio 24; + título 20px/600 | e2e `dukfit.spec.ts:314` ok; `dashboard.spec.ts:324` ok | `:319` `toEqual(...)`; `:322` `toBe(CARD)`; `:323` `toBe('24px')`; novos `:325` `toBe('20px')`, `:326` `toBe('600')`; `apps/web/e2e/dashboard.spec.ts:338` | PASS |
| C13 | setas "Ver alunos"/"Ver presenças de hoje", 32x32, borda, `svg` | e2e `dukfit.spec.ts:331` ok | `:340` `href`; `:342` `toEqual([32, 32])`; `:343` `toBe(BORDER)`; `:344` `svg` | PASS |
| C14 | 40 marcas, 16 lime, 24 cinza, "4", "07/10/2026"; zero: 0 lime; + semicírculo e número dentro do arco | e2e `dukfit.spec.ts:352` ok | `:358` `toHaveLength(40)`; `:359` `toHaveLength(16)`; `:360` `toHaveLength(24)`; `:363` `'4'`; `:364` data; novos: `:373` pontas na mesma altura; `:374` meio >60 px acima; `:378` ângulo decrescente; `:379` `> 170`; `:380` `< 10`; `:382` raio `< 1.15`; `:384` centrado ±6; `:386-387` entre o alto e as pontas; `:393` zero lime | PASS |
| C15 | 7 colunas `QUI..QUA` com contagens | e2e `dukfit.spec.ts:397` ok | `:403` `toHaveCount(7)`; `:404` dias; `:405` contagens; `:419` número acima | PASS |
| C16 | cores lime/laranja/cinza pela regra 0,9 | e2e `dukfit.spec.ts:422` ok | `:430-432` `toEqual([LIME, LIME, ORANGE, ORANGE, OFF, LIME, ORANGE]...)` | PASS |
| C17 | "Ativos" 31; pílulas #1f1f1f ponto lime; + raio >= 9999 | e2e `dukfit.spec.ts:435` ok; `dashboard.spec.ts:41` ok | `:440` `'31'`; `:443` `toHaveCount(2)`; `:451` `toBe(HEADER)`; novo `:452` `toBeGreaterThanOrEqual(9999)`; `:453` `toBe(LIME)`; `apps/web/e2e/dashboard.spec.ts:48-50` | PASS |
| C18 | tiles #1a1a1a, rótulo lime, 24px `tabular-nums`, links; + raio 16 e rótulo 12 | e2e `dukfit.spec.ts:457` ok; `dashboard.spec.ts:123` ok | `:469` `toBe(TILE)`; `:470` `toBe(LIME)`; novos `:471` `toBe('16px')`, `:472` `toBe('12px')`; `:475` `'24px'`; `:476` `'tabular-nums'`; `:477` `href`; `apps/web/e2e/dashboard.spec.ts:132`, `:134` | PASS |
| C19 | 390 linhas, 1440 `table` | e2e `dukfit.spec.ts:481` ok | `:495` `toBeHidden()`; `:497` `toHaveCount(1)`; `:500` `toBeVisible()`; `:502` texto | PASS |
| C20 | 500: erro dentro do shell | e2e `dukfit.spec.ts:765` ok; `dashboard.spec.ts:178` ok | `:769` mensagem; `:770` `h1`; `:771` navegação; `apps/web/e2e/dashboard.spec.ts:189` | PASS |
| C21 | estados vazios | e2e `dashboard.spec.ts:113`, `:154` ok | `apps/web/e2e/dashboard.spec.ts:119`, `:160` `toBeVisible()` | PASS |
| C22 | grade 3 colunas em 1440, 1 em 390 | e2e `dukfit.spec.ts:508` ok | `:517` `toBe(3)`; `:518` `toBe(1)` | PASS |
| C23 | ponto 8x8 lime e descrição só no painel com atraso | e2e `dukfit.spec.ts:521` ok | `:530` `toEqual([8, 8])`; `:531` `toBe(LIME)`; `:532` descrição; `:536`, `:541` `toHaveCount(0)` | PASS |
| C24 | série de 7 dias `[2,0,0,1,0,0,3]` | vitest `dashboard.test.ts:794` ok | `apps/api/test/dashboard.test.ts:802` `toBe('2026-10-07')`; `:803` `seriesOf(checkIns)` `toEqual([...])` | PASS |
| C25 | 09-30 e 10-08 fora | vitest `dashboard.test.ts:815` ok | `apps/api/test/dashboard.test.ts:820` `toHaveLength(7)`; `:821` zeros; `:822` `'2026-10-01'` | PASS |
| C26 | último item = `today` e = `count` na virada | vitest `dashboard.test.ts:825` ok | `apps/api/test/dashboard.test.ts:834` `toBe(today)`; `:835` `toBe(checkIns!.count)` | PASS |
| C27 | sem `lastSevenDays` para hr_finance/instrutor; schema; 6/8 itens falham | vitest `dashboard.test.ts:850` ok; contracts `dashboard_check_ins_series_has_exactly_seven_items` ok | `apps/api/test/dashboard.test.ts:857` `safeParse` `toBe(true)`; `:858` `includes('lastSevenDays')`; `packages/contracts/test/dashboard.test.ts:211-212` `toBe(false)` | PASS |
| C28 | sem sessão: 401 `application/problem+json` | vitest `dashboard.test.ts:193` ok | `apps/api/test/dashboard.test.ts:196` `toBe(401)`; novo `:197` `response.headers.get('content-type')` `toMatch(/^application\/problem\+json/)`; `:199` `code` `toBe('unauthorized')` | PASS |
| C29 | `/` público 200 sem redirect | e2e `dukfit.spec.ts:546` ok | `:549` `toBe(200)`; `:550` `toBeNull()`; `:551` URL; `:552` `h1` | PASS |
| C30 | seções na ordem do `SITE`, `wa.me` | e2e `dukfit.spec.ts:555` ok | `:560` ordem dos títulos; `:563` destaques; `:574-575` horários na lista `dl`; `:578-579` contato; `:580-583` `href` | PASS |
| C31 | CTA por sessão | e2e `dukfit.spec.ts:586` ok | `:589` `/login`; `:590` `toBe(LIME)`; `:596` `/dashboard`; `:598` `toHaveCount(0)` | PASS |
| C32 | landing sem shell, sem origem externa, sem violação de CSP | e2e `dukfit.spec.ts:601` ok; `csp.spec.ts:49` ok | `:616-618` `toHaveCount(0)`; `:619` origens; `:620` `toEqual([])`; `apps/web/e2e/csp.spec.ts:69`, `:80`, `:83` | PASS |
| C33 | destaques 1 coluna em 390, 3 em 1440 | e2e `dukfit.spec.ts:623` ok | `:631` `toBe(1)`; `:632` `toBe(3)` | PASS |
| C34 | `SITE` com as chaves da door 4; landing sem helper de API | vitest repo ok | `tests/repo/identidade.test.ts:96`, `:99`, `:105`, `:106` (o `import { Gauge }` novo vem de `@academia/ui`, não de `/lib/`; a prova continua verde) | PASS |
| C35 | login e 2FA terminam em `/dashboard` | e2e `login.spec.ts:21`, `two-factor.spec.ts:113` ok | `apps/web/e2e/login.spec.ts:41`; `apps/web/e2e/two-factor.spec.ts:124` `toHaveURL('/dashboard')` | PASS |
| C36 | com sessão `/login` -> `/dashboard` | e2e `shell.spec.ts:173` ok | `apps/web/e2e/shell.spec.ts:178` | PASS |
| C37 | sem sessão -> `/login` | e2e `shell.spec.ts:4` ok | `apps/web/e2e/shell.spec.ts:10` | PASS |
| C38 | 2FA pendente: landing; `/dashboard` -> setup | e2e `dukfit.spec.ts:637` ok | `:642` `toHaveURL('/')`; `:643` `h1`; `:646` `/two-factor/setup` | PASS |
| C39 | `/login` "Bem-vindo de volta" | e2e `dukfit.spec.ts:649` ok | `:651` wordmark; `:652` `h1`; `:658` `svg`; `:661-662` ícone dentro; `:666` `toBe(LIME)`; `:668` largura | PASS |
| C40 | "Início" -> `/dashboard`; 404 -> `/` | e2e `dukfit.spec.ts:671` ok | `:676` `href`; `:678` URL; `:681` `toBe(404)`; `:682`; `:683` `href` `/` | PASS |
| C41 | 7 telas internas: título 24/700, bloco #141414 raio 24 | e2e `dukfit.spec.ts:688` ok | `:695` `'24px'`; `:696` `'700'`; `:714` `toContainEqual({ background: CARD, radius: '24px' })` | PASS |
| C42 | 390: tabela rola no painel; formulário em largura total | e2e `dukfit.spec.ts:718` ok | `:730` `'auto'`; `:731`; `:732`; `:742` campo; `:745` submit | PASS |
| C43 | 24 telas mantêm a cópia; print sem shell | e2e `identidade.spec.ts:334` ok; `dukfit.spec.ts:748` ok | `apps/web/e2e/identidade.spec.ts:337`, `:363`; `dukfit.spec.ts:757` `toBeHidden()`; `:758` `toHaveCount(0)`; `:759` FAB `toBeHidden()` | PASS |
| C44 | `pnpm verify` exit 0; sem dependência nova | `pnpm verify` exit 0; vitest repo `dukfit_adds_no_npm_dependency` ok | `tests/repo/identidade.test.ts:120` `toEqual(deps(before))`; o diff `bd74d0c..HEAD` não toca `package.json` nem `pnpm-lock.yaml` | PASS |
| C45 | "Horários" com `Gauge`: 40 marcas, 27 lime, centro "<opens> - <closes>", pílula `days` | e2e `dukfit.spec.ts:811` ok | `:816` `gauge` `toHaveCount(1)`; `:817` `toHaveText('06:00 - 22:00')` (via `SITE.hours[0]`); `:818` pílula `days`; `:820` `toHaveLength(40)`; `:822` lime `toHaveLength(27)`. A posição do texto dentro do arco não é afirmada (ver `## Binding sources`) | PASS |
| C46 | 767/768/1023/1024: barra x lateral, colunas, `table` x linhas; destaques | e2e `dukfit.spec.ts:776` ok | `:793` 767 `toEqual({ tabs: true, side: false, grid: 1, table: false, rows: true })`; `:794` 768 grid 2 + `table`; `:795` 1023 igual; `:796` 1024 `side: true, grid: 3`; `:806-808` destaques 1, 1, 3 | PASS |

Todos os checks passam como estão escritos. Os dois achados são de cobertura e de arranjo e estão
abaixo, sem rebaixar nenhum `Result`.

## Coverage

verified at 4b5313f para as linhas que a correção tocou: De-para, bordas de virada, `GET /api/dashboard`
e seções da landing. As demais linhas são carried from bd74d0c, com as provas re-rodadas verdes no `HEAD`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/dashboard` statuses e forma (3) (verified at 4b5313f) | `plan.md` `Surface` + AC 28 | 200 com série C24 · 401 C28 (`dashboard.test.ts:196`) · mídia `application/problem+json` C28 (`:197`) | - |
| pontos de virada (2 bordas) (verified at 4b5313f) | AC 3, AC 7, AC 10, AC 19, AC 22, AC 34 e `Assumptions` | 767/768: barra, 1 coluna x 2, linhas x `table` C46 (`dukfit.spec.ts:793-794`) · 1023/1024: barra x lateral, 2 x 3 colunas C46 (`:795-796`), destaques 1 x 3 (`:807-808`) | AC 10 na borda 1023/1024: o gutter de 16 px e a folga da barra inferior só são afirmados a 390 px (C10 `:282-287`). Nenhuma prova roda o `main` a 1023 px, e `md:px-8` no lugar de `lg:px-8` (`apps/web/src/components/shell.tsx:57`) passaria |
| linhas do De-para (14) e os valores que fixam (verified at 4b5313f) | `plan.md` `## De-para` | cabeçalho C2 (com botão 44 px raio 12 px `:96-97`) · ponto C23 · barra inferior C3 C4 C5 · lateral C7 · FAB C8 C9 · `Panel` C12 (20 px/600 `:325-326`) C13 · `Gauge` do painel C14 · `StatPill` C17 (`:452`) · `MetricTile` C18 (`:471-472`) · `WeekBars` C15 C16 · `ListRow`/`Table` C19 · login C39 · landing C30 C45 | `Gauge` da landing, "hora no centro": o texto do centro dentro do arco não tem prova e não acontece a 360 px (a caixa de `gauge-value` cruza 9 marcas). `apps/web/src/app/page.tsx:115-121` passa `display` de 13 caracteres a `Gauge`, que o desenha em `text-4xl` (`packages/ui/src/components/panel.tsx:129-130`) dentro de `max-w-xs` |
| seções da landing (5) (verified at 4b5313f) | AC 30 | hero, "Por que a DukFit", "Modalidades", "Horários" (lista C30 `:574-575`, medidor C45), "Contato" C30 | - |
| `GET /` statuses (1) (carried from bd74d0c) | `Surface` | 200 C29 (`dukfit.spec.ts:549`) | - |
| `GET /dashboard` statuses (3) (carried from bd74d0c) | `Surface` | 200 C12 · 307 `/login` C37 · 307 `/two-factor/setup` C38 (`:646`) | - |
| doors do `Landing` (4) (carried from bd74d0c) | `Landing` | door 1 C29 C35 C36 C38 · door 2 C24 C27 · door 3 C7 C13 C39 · door 4 C30 C34 | - |
| perfis x barra inferior / FAB / cabeçalho (4 cada) (carried from bd74d0c) | `lib/*.ts`, `canCheckIn`, `ROLE_LABELS` | C4 (`:124-127`) · C8 C9 · C2 (`:64-67`) | - |
| cores das barras (3) (carried from bd74d0c) | AC 16 | C16 (`:430-432`) | - |
| bordas da janela `lastSevenDays` (4) (carried from bd74d0c) | door 2 | C24 C25 C26 | - |
| estados do CTA (2), destinos que eram `/` (7), estados do painel (3), telas com shell (21) (carried from bd74d0c) | AC 31-32, `Impact`, `Observable`, `glob page.tsx` | C31 · C29 C35 C36 C40 + `two-factor.spec.ts:91` · C12 C20 C21 · C11 (`:295`) C43 | - |

## Test policy rows

verified at 4b5313f para as linhas que classificam arquivos tocados: `page.tsx` é entry point,
`panel.tsx` (`Gauge`) é instrumentação e `nav.tsx` está na linha que decide. A rodada 1 não deixou linha
pendente.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary (carried from bd74d0c; `nav.tsx` re-judged) | `dashboard.service.ts`, `nav.tsx`, `panel.tsx` (`barColor`, `litTicks`) | uma na fronteira | yes - a mudança em `nav.tsx` é só de classe (`rounded-md`), provada no browser por C2 `:97`; o resto segue provado por C4, C16, C14 e C24-C26 |
| Entry point that decides nothing (verified at 4b5313f) | `apps/web/src/app/page.tsx` | uma na fronteira | yes - a saída renderizada do medidor da landing está afirmada no Chromium (C45 `:816-822`); o arranjo do texto do centro está registrado em Coverage |
| Instrumentation (verified at 4b5313f) | `packages/ui/src/components/panel.tsx` (`Gauge` com `display`) | nenhuma própria; coberta pelo consumidor | yes - `display` pela C45 (`:817`), o valor numérico pela C14 (`:363`) |

O `Swept` (observability -> `eight_reads_write_no_audit_row`, `apps/api/test/dashboard.test.ts:216`) é
carried from bd74d0c, e o teste rodou verde entre os 42 desta rodada.

## Faults injected

verified at 4b5313f. Isolamento: `git worktree add C:\Users\Admin\AppData\Local\Temp\dukfit-verify-wt2
HEAD` e `pnpm install --offline` (15 s). O porcelain da árvore real antes era `?? CLAUDE.md`. Cada
falha foi aplicada sozinha, rodou a prova mais estreita (Playwright, em sequência, portas 3100/3199) e
foi revertida com `git checkout -- <arquivo>`. Depois de cada uma, o `git status --porcelain` da worktree
só mostrava o arquivo de sondagem da colisão. Ao fim, `git worktree remove --force` (o diretório que
sobrou por caminho longo foi apagado com `rmdir \\?\...`). `git worktree list` mostra só a árvore real,
e o porcelain dela saiu idêntico: `?? CLAUDE.md`.

Teto de cinco, uma por superfície nova. Ficaram sem falha própria as asserções de valor exato da C12
(`'20px'`/`'600'`), C17 (`>= 9999`), C18 (`'16px'`/`'12px'`) e C28 (`toMatch(/^application\/problem\+json/)`).
São igualdades de estilo computado ou de cabeçalho, sem tolerância.

| Mutation | Location | Killed |
| --- | --- | --- |
| `Gauge` ignora `display`: `{display ?? value}` -> `{value}` | `packages/ui/src/components/panel.tsx:130` | yes - `landing_hours_use_the_gauge` falhou em `dukfit.spec.ts:817` (`Expected: "06:00 - 22:00"`, `Received: "16"`), exit 1 |
| botão de menu volta a `rounded-xl` (16 px) | `apps/web/src/components/nav.tsx:116` | yes - `header_shows_avatar_initials_name_and_profile_for_four_roles` falhou em `dukfit.spec.ts:97` (`Expected: "12px"`, `Received: "16px"`), exit 1 |
| marcas do medidor em fileira reta: `x = 10 + 180·i/(n-1)`, `y` constante | `packages/ui/src/components/panel.tsx:97-100` | yes - `gauge_lights_ticks_in_proportion_to_the_week_max` falhou em `dukfit.spec.ts:373` (pontas com 4,01 px de diferença, limite 2), exit 1. As contagens e cores (`:358-362`) continuaram verdes, que era a lacuna da rodada 1 |
| barra inferior some em `md:` e não em `lg:` | `apps/web/src/components/nav.tsx:90` | yes - `breakpoints_switch_at_768_and_1024` falhou em `dukfit.spec.ts:794` (768 px). Na mesma execução C3 (`:103`) e C7 (`:204`) ficaram verdes, e é isso que a C46 fecha |
| FAB desce sobre a barra no celular: `bottom-28` -> `bottom-2` | `apps/web/src/components/shell.tsx:63` | yes - `fab_links_to_check_in_for_admin_and_reception` falhou em `dukfit.spec.ts:257` (`Expected: <= 762`, `Received: 836`), exit 1 |

Sondagem extra, na mesma worktree e antes das falhas, num spec descartável que não entrou no repo: a
caixa de `[data-slot="gauge-value"]` da landing mede 231,75 x 40 px e cruza 9 caixas de
`gauge-tick` a 360 px e 1 a 390, 768 e 1440 px. Não há rolagem horizontal (360/360). As capturas
`probe-hours-360.png` e `probe-hours-1440.png` mostram o texto sobre as marcas das pontas a 360 px e
encostado nelas a 1440 px.

## Gate

verified at 4b5313f.

- `pnpm --filter @academia/web exec playwright test --reporter=list`: **349 passed, 0 failed**, exit 0
  (4,2 min), sem retentativa.
- `pnpm --filter @academia/api exec vitest run test/dashboard.test.ts`: **42 passed**, exit 0.
- `pnpm --filter @academia/contracts exec vitest run`: **16 passed**, exit 0.
- `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts`: **6 passed**, exit 0.
- `pnpm verify`: **exit 0**, 21 successful, 21 total. Foram 20 cache hits do turbo, porque o hash das
  entradas é o da execução do autor no mesmo `HEAD`: web 349 passed, api 713 passed, repo 34 passed. A
  web e o `dashboard.test.ts` da API foram rodados por mim, fora do cache, nas linhas acima.

## Ranked gaps

1. **`Gauge` da landing: o texto do centro invade as marcas do arco, e nenhum check pega isso** (C45,
   De-para "hora no centro", mockup "Training Schedule"). `apps/web/src/app/page.tsx:115-121` põe
   "06:00 - 22:00" em `text-4xl` (`packages/ui/src/components/panel.tsx:129-130`) num medidor
   `max-w-xs`. A 360 px o texto cruza 9 marcas das pontas, e a 390/768/1440 px a caixa ainda toca uma.
   A C45 (`dukfit.spec.ts:811-823`) não afirma posição. A asserção "dentro do arco" da C14
   (`:383-387`) só mede o "4" do painel e o centro do texto, não a largura. É preciso tanto a correção
   (texto menor para `display`, ou medidor mais largo) quanto uma asserção na C45 de que a caixa de
   `gauge-value` não cruza nenhuma `gauge-tick` a 360 e 1440 px.
2. **AC 10 sem prova na borda 1023/1024** (Coverage, pontos de virada). O gutter de 16 px e a folga da
   barra inferior só são afirmados a 390 px (C10 `dukfit.spec.ts:282-287`), e a C46 omite a AC 10. O
   código está certo (`apps/web/src/components/shell.tsx:57`), mas `md:px-8` passaria. Basta acrescentar
   à C46 o `padding-left`/`padding-right` do `main` a 1023 px (16 px) e a 1024 px (32 px).
