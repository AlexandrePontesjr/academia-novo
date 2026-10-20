# DukFit app verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: de214e2..bd74d0c3fb314952029ab737e6ba3397814faf1a
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Rodada 1, completa, sobre `de214e2..HEAD` (`HEAD` = `bd74d0c`), com **todos** os checks C1 a C44.
Li `verify.md`, `plan.md` e `checks.md` inteiros, o diff de código, testes e specs do intervalo, e
abri as duas imagens binding com a ferramenta de imagem antes de julgar. Rodei todas as provas no
`HEAD`: a suíte web inteira (`playwright test --reporter=list`, 347 nomes individuais, entre eles os
33 de `dukfit.spec.ts`), `apps/api/test/dashboard.test.ts` (42), o contrato (16), os testes de repo
de `identidade.test.ts` (6), quatro falhas injetadas no e2e e uma na API numa worktree descartável, e
`pnpm verify`. Nenhuma escrita fora deste relatório; nenhum commit, nenhum `git stash`.

Nenhum defeito de produto apareceu nas superfícies que os checks alcançam: as 347 provas web e as 42
da API passam, e as cinco falhas injetadas foram mortas. O FAIL vem de **lacunas de prova contra a
fonte binding e o De-para**: um mapeamento do De-para que o código não cumpre (horários da landing no
`Gauge`) e que nenhum check cobre, três arranjos do mockup que nenhum seletor afirma (o medidor
semicircular, o botão flutuante e o cabeçalho), as bordas dos pontos de virada 768/1024 px, a mídia
`application/problem+json` da C28 e quatro valores do De-para sem asserção.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| mockup de três telas (`images/1.png`, 1600x1155) | yes - imagem aberta nesta rodada; cabeçalho avatar + nome + "Level" + botão quadrado do sino com ponto lime; "Training Schedule" com medidor semicircular de marcas e hora no centro + pílula; "Today's Workout" com pílulas de ponto lime; "Progress Goals" com dois blocos lado a lado; "Weekly Consistency" com barras triplas lime/laranja/cinza e % no topo; barra inferior de 5 abas só com ícone, ativa em pílula escura com ícone lime; botão flutuante lime quadrado no canto inferior direito, acima da barra | none | medidor: a forma semicircular e o número no centro não têm asserção (C14 conta 40 marcas e as cores, mas uma fileira reta de 40 marcas passaria) · botão flutuante: a posição flutuante (fixa, canto inferior direito, acima da barra) não tem asserção (C8 afirma tamanho, cor, raio e `href`) · cabeçalho: a disposição avatar à esquerda / botão de menu à direita e o botão quadrado 44 px raio 12 px do De-para não têm asserção (C6/C23 alcançam o botão só por nome, diálogo e ponto) |
| prancha de telas (`images/2.webp`, 1321x2000) | yes - imagem aberta nesta rodada; "Welcome Back" (título, subtítulo, campos com ícone, botão lime de largura total); onboarding (título forte, texto, indicador de página, botão lime) | none | - (C39 cobre wordmark, `h1`, ícone à esquerda de cada campo e botão lime de largura do formulário; C30 cobre as seções da landing na ordem; subtítulo, indicador de página e login social ficam fora pelo De-para) |
| `plan.md` `## De-para` (declarado binding no `## Binding sources` do `checks.md`) | yes - as 14 linhas conferidas contra checks e código | none | "horários (no `Gauge`)" da landing: o código renderiza os horários como `Panel`s com `dt`/`dd` (`apps/web/src/app/page.tsx:104-118`), sem `Gauge`, e nenhum check afirma o mapeamento (C30 só lê os textos de `SITE.hours`) |

Nenhum check contradiz uma fonte binding. Duas observações de precisão, sem contradição com as
imagens:

- **C3 e o AC 3.** O AC 3 diz "exactly 5 items" para qualquer perfil, mas o AC 4 dá ao instrutor só
  `Início, Alunos, Mais`. O builder estreitou a C3 para "for the admin" antes de escrever teste
  (registrado no `## Handoff`); a C4 cobre os três itens do instrutor (`dukfit.spec.ts:110`). É
  inconsistência interna do plano resolvida pela regra mais específica, não enfraquecimento.
- **C1 no celular.** O `h1` com o wordmark do shell é `max-lg:sr-only` (`shell.tsx:28`): abaixo de
  1024 px o shell não mostra a marca, como o mockup (que não desenha logo no cabeçalho); a C1 prova a
  marca visível só no viewport padrão de computador (`dukfit.spec.ts:57`).

## Checks

Provas desta rodada: `pnpm --filter @academia/web exec playwright test --reporter=list` - **347
passed**, exit 0 (4,1 min), cada nome abaixo aparecendo individualmente com `ok`;
`pnpm --filter @academia/api exec vitest run test/dashboard.test.ts --reporter=verbose` - **42
passed**, exit 0; `pnpm --filter @academia/contracts exec vitest run --reporter=verbose` - **16
passed**; `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts --reporter=verbose` -
**6 passed**. Os arquivos citados são `apps/web/e2e/*` (web), `apps/api/test/dashboard.test.ts`,
`packages/contracts/test/dashboard.test.ts` e `tests/repo/identidade.test.ts`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `<title>` "DukFit" em `/`, `/login`, `/students`; wordmark no shell, login e landing | e2e `dukfit.spec.ts:44` ok | `dukfit.spec.ts:46`, `:50`, `:56` `toHaveTitle('DukFit')`; `:47`, `:51` wordmark `toHaveText('DukFit')`; `:57-58` `h1` do banner "DukFit" | PASS |
| C2 | avatar 44x44, 50%, "MD"/"A", nome e "Perfil: <perfil>" nos 4 perfis | e2e `dukfit.spec.ts:61` ok | `:73` `toHaveText('MD')`; `:75` `toEqual([44, 44])`; `:76` `toBe('50%')`; `:77-78` nome e `profile` visíveis por perfil; `:83` `toHaveText('A')` | PASS |
| C3 | 390x844, admin: barra inferior fixa, #141414, 24px, 5 itens, sem lateral | e2e `dukfit.spec.ts:86` ok | `:94` `position` `toBe('fixed')`; `:97` `toBe(CARD)`; `:98` `toBe('24px')`; `:99` `toHaveCount(5)`; `:100` lateral `toBeHidden()` | PASS |
| C4 | itens da barra por perfil, na ordem | e2e `dukfit.spec.ts:103` ok | `:107-110` os quatro arrays esperados; `:115` `expect(await namesOf(tabs(page)), role).toEqual(names)`; `:120` ícone 20x20 | PASS |
| C5 | ativo com `aria-current`, fundo rgb(31,31,31), ícone lime, a 390 e 1440 | e2e `dukfit.spec.ts:125` ok | `:136` `toHaveAttribute('aria-current', 'page')`; `:137` `toBe(HEADER)`; `:138` ícone `toBe(LIME)`; `:139-141` "Início" sem os três | PASS |
| C6 | "Mais" e botão do cabeçalho abrem diálogo com todos os links + "Minha conta" + "Sair" (admin, instrutor) | e2e `dukfit.spec.ts:145` ok | `:148-161` listas esperadas; `:172`, `:181` `namesOf(...)` `toEqual(links)`; `:173`, `:182` "Sair" visível | PASS |
| C7 | 1440: lateral 256 px, wordmark, links do admin com `svg`, "Sair", sem barra | e2e `dukfit.spec.ts:187` ok | `:194` `toBe(256)`; `:195` `h1` "DukFit"; `:198-210` 11 nomes; `:213` `svg` `toHaveCount(1)`; `:216` 20x20; `:218` "Sair"; `:219` barra `toBeHidden()` | PASS |
| C8 | admin e recepção: link "Registrar check-in" para `/check-in`, 56x56, lime, 16px | e2e `dukfit.spec.ts:222` ok | `:231` `toHaveAttribute('href', '/check-in')`; `:233` `toEqual([56, 56])`; `:234` `toBe(LIME)`; `:235` `toBe('16px')` | PASS |
| C9 | hr_finance e instrutor sem o link | e2e `dukfit.spec.ts:240` ok | `:246` `toHaveCount(0)` por perfil | PASS |
| C10 | 390: `main` com 16px laterais e último filho acima da barra | e2e `dukfit.spec.ts:250` ok | `:257-258` `toBe('16px')`; `:262` `expect(last).toBeLessThanOrEqual(navTop)` | PASS |
| C11 | 360 e 1440: `scrollWidth === clientWidth` nas 21 telas com shell | e2e `dukfit.spec.ts:265` ok | `:270` `toHaveLength(21)`; `:282` `expect(scroll, ...).toBe(client)` | PASS |
| C12 | títulos dos cards = resposta por perfil; `region` #141414 raio 24px | e2e `dukfit.spec.ts:289` ok; `dashboard.spec.ts:324` ok | `dukfit.spec.ts:294` `toEqual(... CARD_TITLES : ['Alunos'])`; `:297` `toBe(CARD)`; `:298` `toBe('24px')`; `dashboard.spec.ts:338` `toEqual(expected[role])` | PASS |
| C13 | "Ver alunos" -> `/students`, "Ver presenças de hoje" -> `/check-ins`, 32x32, borda rgb(38,38,38), `svg` | e2e `dukfit.spec.ts:303` ok | `:312` `href`; `:314` `toEqual([32, 32])`; `:315` `toBe(BORDER)`; `:316` `svg` `toHaveCount(1)` | PASS |
| C14 | `[2,0,5,10,8,3,4]`: 40 marcas, 16 lime, 24 cinza, "4", "07/10/2026"; tudo 0: 0 lime | e2e `dukfit.spec.ts:324` ok | `:330` `toHaveLength(40)`; `:331` lime `toHaveLength(16)`; `:332` cinza `toHaveLength(24)`; `:335` `toHaveText('4')`; `:336` `toHaveText('07/10/2026')`; `:342` lime `toHaveLength(0)` | PASS |
| C15 | 7 colunas `QUI..QUA` com o número acima, do mais antigo | e2e `dukfit.spec.ts:346` ok | `:352` `toHaveCount(7)`; `:353` `toEqual(['QUI', 'SEX', 'SÁB', 'DOM', 'SEG', 'TER', 'QUA'])`; `:354` contagens; `:368` número acima da barra | PASS |
| C16 | `[10,9,8,1,0,10,5]` -> lime, lime, laranja, laranja, cinza, lime, laranja | e2e `dukfit.spec.ts:371` ok | `:379-381` `expect(colors).toEqual([LIME, LIME, ORANGE, ORANGE, OFF, LIME, ORANGE].map(...))` (3 barras por coluna) | PASS |
| C17 | "Ativos" 31 principal; "Inativos" 4 e "Suspensos" 2 em pílulas #1f1f1f com ponto lime | e2e `dukfit.spec.ts:384` ok; `dashboard.spec.ts:41` ok | `dukfit.spec.ts:389` `toHaveText('31')`; `:392` pílulas `toHaveCount(2)`; `:398-399` rótulo/valor; `:400` `toBe(HEADER)`; `:401` ponto `toBe(LIME)`; `dashboard.spec.ts:48-50` | PASS |
| C18 | Ativas, Agendadas, Pendentes, Atrasados: fundo rgb(26,26,26), rótulo lime, 24px `tabular-nums`, links filtrados | e2e `dukfit.spec.ts:405` ok; `dashboard.spec.ts:123` ok | `dukfit.spec.ts:417` `toBe(TILE)`; `:418` `toBe(LIME)`; `:421` `toBe('24px')`; `:422` `toBe('tabular-nums')`; `:423` `href`; `dashboard.spec.ts:132`, `:134` | PASS |
| C19 | 390: sem `table`, uma linha por item; 1440: `table` visível | e2e `dukfit.spec.ts:427` ok | `:441` `table` `toBeHidden()`; `:443` linhas `toHaveCount(1)`; `:444` texto; `:446` `table` `toBeVisible()`; `:448` texto no `tbody` | PASS |
| C20 | 500 em `GET /api/dashboard`: mensagem de erro dentro do shell | e2e `dukfit.spec.ts:709` ok; `dashboard.spec.ts:178` ok | `dukfit.spec.ts:713` mensagem visível; `:714` `h1` "DukFit"; `:715` "Menu principal" visível; `dashboard.spec.ts:189` | PASS |
| C21 | vazios: "Nenhum vencimento nos próximos 7 dias." e "Nenhuma matrícula ativa." | e2e `dashboard.spec.ts:113` e `:154` ok | `dashboard.spec.ts:119`, `:160` `getByText(..., { exact: true })` `toBeVisible()` | PASS |
| C22 | grade de 3 colunas em 1440, 1 em 390 | e2e `dukfit.spec.ts:454` ok | `:463` `toBe(3)`; `:464` `toBe(1)` | PASS |
| C23 | ponto 8x8 lime e descrição "Há pagamentos atrasados" só em `/dashboard` com atraso | e2e `dukfit.spec.ts:467` ok | `:476` `toEqual([8, 8])`; `:477` `toBe(LIME)`; `:478` `toHaveAccessibleDescription(...)`; `:482`, `:487` `toHaveCount(0)` | PASS |
| C24 | série de 7 dias com `[2,0,0,1,0,0,3]` para admin e recepção | vitest `dashboard.test.ts:793` ok | `apps/api/test/dashboard.test.ts:801` `toBe('2026-10-07')`; `:802-810` `seriesOf(checkIns)` `toEqual(['2026-10-01:2', ..., '2026-10-07:3'])` | PASS |
| C25 | 2026-09-30 e 2026-10-08 fora da janela | vitest `dashboard.test.ts:814` ok | `:819` `toHaveLength(7)`; `:820` `toEqual([0, 0, 0, 0, 0, 0, 0])`; `:821` primeiro dia `toBe('2026-10-01')` | PASS |
| C26 | antes e depois da meia-noite de SP: último `day` = `today`, `count` = `checkIns.count` | vitest `dashboard.test.ts:824` ok | `:833` `expect(last.day, instant).toBe(today)`; `:834` `expect(last.count, instant).toBe(checkIns!.count)`; `:838-846` janela andou um dia | PASS |
| C27 | sem `lastSevenDays` para hr_finance/instrutor; schema aceita os 4 perfis; 6 ou 8 itens falham | vitest `dashboard.test.ts:849` ok; contracts `dashboard_check_ins_series_has_exactly_seven_items` ok | `apps/api/test/dashboard.test.ts:856` `safeParse(...).success` `toBe(true)`; `:857` `text.includes('lastSevenDays')` `toBe(role === 'admin' \|\| role === 'reception')`; `packages/contracts/test/dashboard.test.ts:211-212` seis e oito itens `toBe(false)` | PASS |
| C28 | sem sessão: 401 `application/problem+json` | vitest `dashboard.test.ts:193` ok | `:196` `toBe(401)`; `:198` `code` `toBe('unauthorized')`. **A mídia `application/problem+json` não é afirmada**: `rg "problem\+json\|content-type" apps/api/test` não acha asserção para `/api/dashboard` (só para outras rotas, ex. `contracts.test.ts:926`, `:1253`) | PARTIAL - status e código provados, tipo de mídia sem asserção |
| C29 | `/` sem sessão: 200, sem redirect, `h1` da landing | e2e `dukfit.spec.ts:492` ok | `:495` `toBe(200)`; `:496` `redirectedFrom()` `toBeNull()`; `:497` `toHaveURL('/')`; `:498` `h1` = `SITE.tagline` | PASS |
| C30 | ordem hero, "Por que a DukFit", "Modalidades", "Horários", "Contato" do `SITE`; link `wa.me` | e2e `dukfit.spec.ts:501` ok | `:506` `toEqual([SITE.tagline, 'Por que a DukFit', 'Modalidades', 'Horários', 'Contato'])`; `:509` destaques; `:522-523` endereço e telefone; `:524-527` `href` `https://wa.me/<dígitos>` | PASS |
| C31 | sem sessão "Acesso da equipe" -> `/login` lime; com sessão "Ir para o painel" -> `/dashboard` | e2e `dukfit.spec.ts:530` ok | `:533` `href` `/login`; `:534` `toBe(LIME)`; `:540` `href` `/dashboard`; `:542` "Acesso da equipe" `toHaveCount(0)` | PASS |
| C32 | landing sem shell, sem origem externa, zero violação de CSP | e2e `dukfit.spec.ts:545` ok; `csp.spec.ts:49` ok | `dukfit.spec.ts:560-562` banner, navegação e FAB `toHaveCount(0)`; `:563` origens `toEqual([web])`; `:564` violações `toEqual([])`; `csp.spec.ts:69`, `:80`, `:83` `toEqual([])` | PASS |
| C33 | destaques: 1 coluna em 390, 3 em 1440 | e2e `dukfit.spec.ts:567` ok | `:575` `toBe(1)`; `:576` `toBe(3)` | PASS |
| C34 | `SITE` com as chaves da door 4, `name: 'DukFit'`, landing sem helper de API | vitest repo `identidade.test.ts` ok | `tests/repo/identidade.test.ts:96` cada chave; `:99` `toContain("  name: 'DukFit',")`; `:105` imports de `/lib/` `toEqual(['../lib/session.ts'])`; `:106` `not.toMatch(/fetchApi\|loadDashboard\|\/api\//)` | PASS |
| C35 | login sem 2FA e verificação do 2FA terminam em `/dashboard` | e2e `login.spec.ts:21` ok; `two-factor.spec.ts:113` ok | `apps/web/e2e/login.spec.ts:41` `toHaveURL('/dashboard')`; `two-factor.spec.ts:124` `toHaveURL('/dashboard')` | PASS |
| C36 | com sessão, `/login` -> `/dashboard` | e2e `shell.spec.ts:173` ok | `shell.spec.ts:178` `toHaveURL('/dashboard')` | PASS |
| C37 | sem sessão `/dashboard`, `/users`, `/account` terminam em `/login` | e2e `shell.spec.ts:4` ok | `shell.spec.ts:7` lista com `/dashboard`; `:10` `toHaveURL('/login')` | PASS |
| C38 | 2FA pendente: `/` mostra a landing; `/dashboard` -> `/two-factor/setup` | e2e `dukfit.spec.ts:581` ok | `:586` `toHaveURL('/')`; `:587` `h1` da landing; `:590` `toHaveURL('/two-factor/setup')` | PASS |
| C39 | `/login`: wordmark, `h1` "Bem-vindo de volta", ícone antes de cada campo, "Entrar" lime da largura do form | e2e `dukfit.spec.ts:593` ok | `:595` wordmark; `:596` `h1`; `:602` `svg` `toHaveCount(1)`; `:605-606` ícone à esquerda dentro do campo; `:610` `toBe(LIME)`; `:612` largura do botão `toBe` largura do form | PASS |
| C40 | "Início" -> `/dashboard`; 404 com "Página não encontrada" e link `/` | e2e `dukfit.spec.ts:615` ok | `:620` `href` `/dashboard`; `:622` `toHaveURL('/dashboard')`; `:625` `toBe(404)`; `:626` heading; `:627` `href` `/` | PASS |
| C41 | 7 telas internas: título 24px/700 e primeiro bloco #141414 raio 24px | e2e `dukfit.spec.ts:632` ok | `:639` `toBe('24px')`; `:640` `toBe('700')`; `:658` `toContainEqual({ background: CARD, radius: '24px' })` | PASS |
| C42 | 390: tabela rola no painel sem rolagem da página; campos e submit na largura do form | e2e `dukfit.spec.ts:662` ok | `:674` `toBe('auto')`; `:675` tabela `>=` wrapper; `:676` sem rolagem da página; `:686` campo `toBe(formWidth)`; `:689` submit `toBe(formWidth)` | PASS |
| C43 | as 24 telas mantêm headings, labels, colunas e textos; print sem header, navegação e FAB | e2e `identidade.spec.ts:334` ok; `dukfit.spec.ts:692` ok | `identidade.spec.ts:337` `toHaveLength(24)`; `:349` `h1` "DukFit"; `:363` headings `toEqual(screen.headings)`; `:367` colunas; `:372` labels; `dukfit.spec.ts:701` banner `toBeHidden()`; `:702` navegação `toHaveCount(0)`; `:703` FAB `toBeHidden()` | PASS |
| C44 | `pnpm verify` exit 0; nenhuma dependência npm nova | `pnpm verify` exit 0 (ver Gate); vitest repo `dukfit_adds_no_npm_dependency` ok | `tests/repo/identidade.test.ts:120` `expect(deps(read(path)), path).toEqual(deps(before))` com `DUKFIT_BASE = 'de214e2'` (`:91`); `git diff --stat de214e2..HEAD -- '*package.json' pnpm-lock.yaml` vazio | PASS |

Observações de precisão (não mudam o veredito por si):

- **C44** nomeia o intervalo `b0cabb4..HEAD`, mas a prova compara com `de214e2` (`identidade.test.ts:91`).
  O `b0cabb4` é a base da `identidade-visual`. Conferi os dois: `git diff --stat b0cabb4..HEAD --
  '*package.json' pnpm-lock.yaml` e o mesmo a partir de `de214e2` saem vazios.
- **C21** aponta `-g "empty"` em `dashboard.spec.ts`; com o arquivo, o filtro casa exatamente as
  duas provas de vazio (`:113`, `:154`). Sem o arquivo, casaria 14 testes de outras telas.
- **C17** afirma o número principal com `font-size >= 32` (`dukfit.spec.ts:390`). O check não fixa
  tamanho, então não há valor a conferir além de "principal".

### Supersedes e Handoff

Julguei cada reescrita do `## Supersedes` contra o diff dos testes antigos:

- `/` -> `/dashboard` em `dashboard.spec.ts` (22 `goto`), `shell.spec.ts`, `two-factor.spec.ts:69`,
  `csp.spec.ts:79` e `login.spec.ts:41`: **justificado** pela door 1. Só o destino mudou; nenhuma
  asserção foi removida.
- "Gestão de Academia" -> "DukFit" (`shell.spec.ts`, `login.spec.ts:42`, `identidade.spec.ts:349`)
  e `h1` do `/login` "Entrar" -> "Bem-vindo de volta" (`login.spec.ts:14`, `csp.spec.ts:70`, `SCREENS`):
  **justificado** pelos AC 1 e AC 41. O botão "Entrar" continua afirmado (`login.spec.ts:17`).
- "Perfil: <perfil>" em `login.spec.ts:24-27`: **justificado** pelo AC 2. Continua exato
  (`{ exact: true }`).
- Raio do card do painel 16 -> 24 px e cabeçalho -> barra lateral em `identidade.spec.ts`:
  **justificado** pelos AC 12 e AC 7. A barra lateral passa a ser afirmada com #141414 e a borda
  #262626.
- Lista `SCREENS`: o `diff` entre a versão de `de214e2` e `support/identidade.ts` mostra só quatro
  mudanças. São `/` -> `/dashboard`, o `h1` do login, o card "Check-ins da semana" acrescentado e os textos
  "Ver alunos"/"Ver presenças de hoje" retirados de `texts`. Esses viraram nome acessível do botão ↗
  (AC 13) e a C13 os afirma por nome. **Justificado**, sem perda.
- Isenções de acento por `data-slot` (C9/C25 da identidade): **justificado**. O seletor enumera
  exatamente as marcas do De-para (ponto da pílula e do menu, "Fit" da marca, ícone da navegação,
  rótulo do `MetricTile`, barras e medidor). Não é cláusula genérica; todo o resto segue proibido.
- `dashboard.spec.ts` com o card "Check-ins da semana" (contagens 7/6/5/1) e `checkIns` com
  `lastSevenDays`: **justificado** pela door 2 e o AC 15.
- `## Handoff`: confirmei 347/347 na suíte web; as provas da C4/C7 medem o ícone 20x20
  (`dukfit.spec.ts:120`, `:216`). O "Continuar" do 2FA para `/dashboard` está no `Impact` do plano.
  `Table` com `relative min-w-0` é um detalhe reversível, coberto pela C11.

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /` statuses (1) | `plan.md` `Surface` | 200 C29 (`dukfit.spec.ts:495`) | - |
| `GET /dashboard` statuses (3) | `plan.md` `Surface` | 200 C12 · 307 `/login` C37 (`shell.spec.ts:10`) · 307 `/two-factor/setup` C38 (`dukfit.spec.ts:590`) | - |
| `GET /api/dashboard` statuses e forma (3) | `plan.md` `Surface` + AC 28 | 200 com série C24 · 401 C28 status e `code` (`dashboard.test.ts:196`, `:198`) · mídia `application/problem+json` do 401 | mídia `application/problem+json` do 401 em `/api/dashboard` (C28, sem asserção) |
| doors do `Landing` (4) | `plan.md` `Landing` | door 1 C29 C35 C36 C38 · door 2 C24 C27 · door 3 C7 C13 C39 (`svg` por link/ícone) · door 4 C30 C34 | - |
| perfis x barra inferior (4) | `apps/web/src/lib/*.ts` + AC 4 | admin · hr_finance · reception · instructor, todos C4 (`dukfit.spec.ts:107-110`) | - |
| perfis x FAB (4) | `canCheckIn` (`apps/web/src/lib/check-ins.ts`) | admin, reception C8 · hr_finance, instructor C9 | - |
| perfis x cabeçalho (4) | `ROLE_LABELS` | os quatro C2 (`dukfit.spec.ts:64-67`) | - |
| cores das barras (3) | AC 16 | lime, laranja, cinza C16, com a borda 0,9 inclusiva (9 de 10 é lime) | - |
| bordas da janela `lastSevenDays` (4) | door 2 / AC 24 | today-6 C24 · today C24 C26 · today-7 fora C25 · today+1 fora C25 | - |
| pontos de virada (2 bordas) | AC 3, AC 7, AC 10, AC 19, AC 22, AC 34 e `Assumptions` ("abaixo de 1024 px / a partir de 1024 px; abaixo de 768 px") | as provas só usam 360, 390 e 1440 px | borda 1023/1024 px (barra inferior x lateral, grade de 3 colunas, destaques de 3 colunas) · borda 767/768 px (linhas x `Table`, 1 coluna) - nenhuma prova roda em 767, 768, 1023 ou 1024; um corte em `md` no lugar de `lg`, ou o contrário, passa |
| seções da landing (5) | AC 30 | hero, "Por que a DukFit", "Modalidades", "Horários", "Contato" C30 (`dukfit.spec.ts:506`) | - |
| estados do CTA da landing (2) | AC 31, AC 32 | sem sessão, com sessão C31 | - |
| destinos que eram `/` (7) | `plan.md` `Impact` (com o "Continuar" do 2FA) | login C35 · 2FA C35 · `/login` logado C36 · "Início" C40 · 404 C40 · proxy `/` público C29 · "Continuar" de `two-factor-setup.tsx` - provado por regressão em `two-factor.spec.ts:91` (`backup_codes_shown_exactly_once`), sem check próprio; o diff (`two-factor-setup.tsx`) é `href="/dashboard"` | - |
| estados do painel (3) | `Observable` | dados C12 · erro C20 · vazio C21 | - |
| telas com shell (21) | `glob apps/web/src/app/**/page.tsx` = 25, menos `/`, `/login`, `/login/two-factor`, `/two-factor/setup` | as 21 C11 (`dukfit.spec.ts:270`) e C43 (`identidade.spec.ts:337`) | - |
| linhas do De-para (14) e os valores que elas fixam | `plan.md` `## De-para` (binding pelo `checks.md`) | cabeçalho C2 · ponto do botão C23 · barra inferior C3 C4 C5 · lateral C7 · FAB C8 C9 · `Panel` fundo/raio C12, ↗ C13 · `Gauge` C14 · `StatPill` C17 · `MetricTile` C18 · `WeekBars` C15 C16 · `ListRow`/`Table` C19 · login C39 · landing C30 | horários da landing "no `Gauge`" (sem check e não implementado) · título do `Panel` 20 px/600 · botão do menu 44 px raio 12 px · `StatPill` raio 9999 px · `MetricTile` raio 16 px e rótulo 12 px |

Nota do join: o código cumpre os valores sem asserção da última linha (`panel.tsx:31`
`text-xl font-semibold`, `nav.tsx:116` `size-11 rounded-xl`, `panel.tsx:55` `rounded-full`,
`panel.tsx:44-45` `rounded-2xl`/`text-xs`), e os cortes 768/1024 estão nas classes certas
(`dashboard/page.tsx:33`, `:44`, `:73` `md:`/`lg:`; `shell.tsx:24-31` `lg:`). A lacuna é de prova,
não de produto, com uma exceção: o "Horários" da landing **não** usa o `Gauge` do De-para.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary (janela `lastSevenDays`, prioridade da barra, cor da barra, proporção do medidor) | `apps/api/src/dashboard/dashboard.service.ts`, `apps/web/src/components/nav.tsx`, `packages/ui/src/components/panel.tsx` (`barColor`, `litTicks`) | uma na fronteira | yes - janela pela HTTP contra Postgres com as quatro bordas (C24 `:802`, C25 `:820`, C26 `:833-834`); prioridade no browser pelos quatro perfis (C4 `:115`); três cores com a borda 0,9 inclusiva (C16 `:379`); máximo não zero e zero (C14 `:331`, `:342`). Cada uma foi feita falhar por uma falha injetada (ver abaixo) |
| Entry point that decides nothing (landing, page wrappers) | `apps/web/src/app/page.tsx`, `apps/web/src/app/dashboard/page.tsx`, as páginas internas | uma na fronteira | yes - saída renderizada no Chromium: landing C29-C33, painel C12-C23, telas internas C41-C43 |
| Instrumentation (ícones, `Panel`, tiles) | `packages/ui/src/icons.tsx`, `packages/ui/src/components/panel.tsx` (componentes) | nenhuma própria; coberta pelo consumidor | yes - ícones pela C4/C7 (20x20, `:120`, `:216`) e C13/C39 (`svg` presente); `Panel` pela C12/C41; `MetricTile` pela C18; `StatPill` pela C17 |

`Swept` com linha que resolve a **existing**: "observability" cita `eight_reads_write_no_audit_row`.
O teste existe (`apps/api/test/dashboard.test.ts:215`) e rodou verde entre os 42 desta rodada. As
demais linhas citam checks desta feature ou são `n/a` aprovadas.

## Faults injected

Isolamento: `git worktree add C:\Users\Admin\AppData\Local\Temp\dukfit-verify-wt HEAD` e
`pnpm install --offline` (15 s). Antes, o `git status --porcelain` da árvore real era `?? CLAUDE.md`.
Cada falha foi aplicada sozinha, rodou a prova mais estreita e foi revertida com `git checkout --
<arquivo>`. As quatro falhas de web rodaram em sequência, porque o Playwright usa portas fixas
3100/3199. Depois, a worktree foi removida (`git worktree remove --force`; o diretório que sobrou por
caminho longo foi apagado com `rmdir \\?\...`, e `git worktree list` só mostra a árvore real). O
porcelain da árvore real, comparado com `diff`, saiu idêntico: `?? CLAUDE.md`.

| Mutation | Location | Killed |
| --- | --- | --- |
| janela começa um dia antes: `addDays(today, 1 - CHECK_INS_WEEK_DAYS)` -> `addDays(today, -CHECK_INS_WEEK_DAYS)` | `apps/api/src/dashboard/dashboard.service.ts:54` | yes - vitest `-t "last_seven_days"`: 3 falharam (C24 `dashboard.test.ts:802` deep equal; C25 `:820` recebeu `[1, 0, ...]`; C26 `:833` `expected '2026-10-06' to be '2026-10-07'`), exit 1 |
| borda da cor: `count >= 0.9 * max` -> `count > 0.9 * max` | `packages/ui/src/components/panel.tsx:140` | yes - e2e `week_bar_colors_follow_the_ninety_percent_rule` falhou em `dukfit.spec.ts:379` (3 cores trocadas), exit 1 |
| prioridade da barra: `'Pagamentos', 'Planos'` trocados em `TAB_PRIORITY` | `apps/web/src/components/nav.tsx:58` | yes - e2e `bottom_nav_items_follow_the_priority_for_four_roles` falhou em `dukfit.spec.ts:115` (`admin`), exit 1 |
| `/` deixa de ser público: `pathname === '/'` -> `pathname === '/__nunca'` | `apps/web/src/proxy.ts:31` | yes - e2e `landing_is_public_200_without_redirect` falhou em `dukfit.spec.ts:496` (`redirectedFrom()` não nulo), exit 1 |
| guarda do FAB removida: `canCheckIn(user.role) &&` -> `(canCheckIn(user.role) \|\| user.role) &&` | `apps/web/src/components/shell.tsx:58` | yes - e2e `fab_is_absent_for_hr_finance_and_instructor` falhou em `dukfit.spec.ts:246` (`hr_finance`: `Expected: 0`, `Received: 1`), exit 1 |

As cinco superfícies (janela da API, cor da barra, prioridade da navegação, ramo público do proxy e
guarda de perfil do shell) falharam cada uma uma vez. Nenhum mutante sobreviveu.

## Gate

- `pnpm --filter @academia/web exec playwright test --reporter=list`: **347 passed, 0 failed**, exit 0
  (4,1 min, build de produção + API falsa; os 33 nomes de `dukfit.spec.ts` e todas as provas de
  `dashboard`, `login`, `shell`, `two-factor`, `csp` e `identidade` aparecem um a um).
- `pnpm --filter @academia/api exec vitest run test/dashboard.test.ts --reporter=verbose`: **42
  passed**, exit 0.
- `pnpm --filter @academia/contracts exec vitest run --reporter=verbose`: **16 passed**, exit 0.
- `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts --reporter=verbose`: **6
  passed**, exit 0.
- `pnpm verify`: **exit 0**, 21 successful, 21 total (20 do cache do turbo).
- GATE_FORCE_PLACEHOLDER

## Ranked gaps

1. **Horários da landing fora do `Gauge` do De-para.** O código diverge do plano aprovado e nenhum
   check cobre o mapeamento. A linha do De-para fixa "horários (no `Gauge`)"; a landing renderiza
   `Panel`s com `dt`/`dd` (`apps/web/src/app/page.tsx:104-118`), e a C30 só lê os textos
   (`dukfit.spec.ts:516-520`). É preciso ou implementar e acrescentar check, ou o dono do plano
   retirar o mapeamento do De-para.
2. **Medidor semicircular sem prova de arranjo** (C14, `dukfit.spec.ts:324-344`). As contagens e as
   cores estão provadas, mas nada afirma que as 40 marcas formam um semicírculo nem que o número fica
   no centro. A geometria está certa no código (`panel.tsx:88-99`), mas uma fileira reta passaria.
3. **Botão flutuante sem prova de posição** (C8, `dukfit.spec.ts:222-238`). Nada afirma `position:
   fixed`, canto inferior direito, nem que fica acima da barra no celular. O código está certo
   (`shell.tsx:63` `fixed right-4 bottom-28 ... lg:bottom-8`).
4. **Cabeçalho sem prova de disposição nem do botão quadrado.** Nada afirma avatar à esquerda e botão
   à direita, nem o botão de 44 px com raio 12 px do De-para (C2/C6/C23). O código usa `nav.tsx:116`
   `size-11 rounded-xl`.
5. **Bordas 768/1024 px sem prova** (AC 3, 7, 19, 22, 34; C3, C7, C19, C22, C33). Todas as provas
   usam 360/390/1440. O código usa `md:`/`lg:` certos, mas um corte trocado passaria.
6. **C28: `application/problem+json` sem asserção** para `GET /api/dashboard` sem sessão
   (`apps/api/test/dashboard.test.ts:193-200`).
7. **Valores do De-para sem asserção:** título do `Panel` 20 px/600, `StatPill` raio 9999 px,
   `MetricTile` raio 16 px e rótulo 12 px. O código cumpre (`panel.tsx:31`, `:44-45`, `:55`).

Os itens 2 a 7 são acréscimos de asserção no `dukfit.spec.ts` e em `dashboard.test.ts`, sem mudança de
produto. O item 1 pede código, ou uma decisão do dono do plano sobre o De-para.
