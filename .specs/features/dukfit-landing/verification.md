# DukFit landing verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: db28ee0..94c25c8
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Rodada 1, completa, sobre `db28ee0..94c25c8` (`053aa99` código, `c9c70e9` testes, `94c25c8` specs), com as
C1 a C18. Rodei todas as provas no `HEAD` `94c25c8`. As 18 checks passam no que afirmam, cada uma com
asserção localizada, e as 5 falhas injetadas morreram. O veredito é FAIL por quatro lacunas que as checks
deixam abertas e que nenhum teste vê:

1. **As URLs de rota divergem da fonte binding.** O plano marca `public-landing.component.ts` como
   binding para os "links de rota". O código tirou `&dir_action=navigate` do Google Maps (a fonte tem esse
   parâmetro na linha 115, `site-content.ts:80` não) e `&utm_source=dukfit` do Waze (fonte na linha 119,
   `site-content.ts:81` não). Nem o plano nem o AD-097 registram essa mudança. A C8 só afirma o prefixo
   (`landing.spec.ts:179` `startsWith(prefix)`) e compara o `href` com o próprio `SITE`
   (`landing.spec.ts:178`), então não pegaria isso.
2. **Texto da fonte binding que aparece na tela sem nenhuma check.** Os títulos `h2` "Estrutura para um
   treino completo.", "A Dukfit por dentro." e "Perto da sua rotina. Em Flores, Manaus." (`page.tsx:133`,
   `:145`, `:171`); o destaque "Treine com consistência" e o texto dele (`page.tsx:126-127`); a linha de
   horário do hero (`page.tsx:113`); e o "Horário" do `dl` de "Onde estamos" (`page.tsx:183-186`).
   Procurei `Treine com consistência|highlight\.|por dentro|Perto da sua rotina|Estrutura para um treino`
   em todo o repo, fora de `node_modules`. Só aparece em `site-content.ts` e `page.tsx`, nenhum teste.
   A reescrita da C30 trocou a asserção dos `h2` pelos rótulos das seções, e com isso os títulos ficaram
   sem prova.
3. **A primeira cláusula do AC 12 não tem check, e o código não a cumpre.** O AC 12 diz que a landing
   SHALL take every text from `site-content.ts`. O AD-097 repete a regra. Mas `page.tsx` tem fixos no
   código os três títulos acima, os rótulos das seções (`:121`, `:133`, `:145`, `:158`, `:171`), os nomes
   dos links "Google Maps", "Waze" e "Uber" (`:195-201`) e o "Bairro" (`:189`). A C11 só cobre a segunda
   cláusula, a de ausência de texto.
4. **A forma literal da door 3 não bate com o código, e nenhuma prova olha os campos internos.** O plano
   define `address: { street, district, city, zip }` e `logo: { src, alt }`, sem `footer`. O código tem
   `address: { street, district }`, com cidade e CEP dentro de `district` (`site-content.ts:74-77`),
   `logo.small` (`:86`), `about.photos` (`:23`) e `footer` (`:85`). O AD-097 registra o `footer`, mas não
   a forma do `address`. A C11 (`identidade.test.ts:96-98`) só confere as chaves de primeiro nível.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `D:\projetos\dukfit\apps\web\src\app\public-landing.component.ts`: copy, endereço, horário, bairro, Instagram, legendas e `alt` | yes - li as 217 linhas. Comparei com `site-content.ts`: eyebrow (`:44`), `h1` (`:45`), prova (`:46`), intro (`:49`), título e texto de "Sobre" (`:61-62`), destaque (`:68`), cards (`:82-84`), quatro `alt` e quatro legendas da galeria (`:95-98`), `alt` do hero, do logo e de "Sobre" (`:13`, `:18`, `:65`, `:71`), endereço com `–` (`:112`), bairro e horário (`:113`), Instagram (`:148-150`), rodapé (`:146`). Tudo idêntico | none - nenhuma check contradiz a fonte | os títulos `h2` de "O que você encontra", "Nossa estrutura" e "Onde estamos"; o destaque "Treine com consistência" e o texto dele; o horário do hero e o do `dl` de "Onde estamos". Todos aparecem na tela e nenhuma check os afirma |
| mesma fonte: URLs de rota | yes - linhas 115, 119 e 123 | none - a C8 não fixa o valor | o valor das URLs de Google e Waze: o código tirou `dir_action=navigate` e `utm_source=dukfit`, e a C8 só afirma o prefixo. O Uber e o `destination` codificado batem byte a byte |
| `D:\projetos\dukfit\apps\web\src\assets\dukfit\` (6 imagens) | yes - abri as sete derivadas ao lado das originais, numa prancha convertida com sharp: a mesma foto em cada par. Medidas: `academia-esteiras` 1448x1086 -> `salao-cardio-1600` 1448x1086 e `salao-cardio-800` 800x600; `logo-dukfit` 1254x1254 com alfa -> 512x512 e 96x96 com alfa; `academia-musculacao` 441x440, `academia-cardio` 438x435 e `treino-amanhecer` 436x439 com as mesmas medidas nos derivados. O `width`/`height` de `SITE` bate com cada arquivo. `academia-esteiraas` ficou de fora, como o plano diz | none | - |
| `plan.md` `Landing` e AC 1 a AC 22 | yes | none | primeira cláusula do AC 12 ("every text") e os campos internos da door 3, ver Coverage |

Fora do escopo, aprovado pelo plano e por isso sem achado: o mapa em `iframe`, "Criar conta", telefone e
WhatsApp, a animação de entrada e a troca da cor de acento. Também ficaram de fora, sem campo na door 3,
o `nav` do cabeçalho antigo, os parágrafos de apoio de "O que você encontra" ("Do primeiro passo...") e
de "Nossa estrutura" ("Fotos reais do espaço..."), e o "10 + anos no bairro" de "Sobre". A door 3 não
tem campo para nenhum deles, então não conto como contradição.

Arranjo: cada estrutura que o plano decide tem check. A ordem das seções está na C3; os três cards
`Panel` na C5; as quatro `figure` na C6; as duas fotos de "Sobre" na C4; o `Gauge` com a pílula na C7;
o `address` na C8; o rodapé depois do `main` na C3; o logo antes do wordmark na C17.

## Checks

Rodei tudo no `HEAD` `94c25c8`:

- `pnpm --filter @academia/web exec playwright test --reporter=list`: **363 passed**, exit 0 (4,3 min).
  O TIME_WAIT estava em 6 antes. Os 14 testes de `landing.spec.ts` aparecem um a um como `ok`, nas
  linhas 158 a 171 do log. Também aparecem `dukfit.spec.ts:558`, `:595`, `:815`, `:47`, `:580` e
  `shell.spec.ts:4`.
- `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts --reporter=verbose`:
  **7 passed**. `site_content_is_the_only_source_of_landing_copy`, `dukfit_adds_no_npm_dependency` e
  `dukfit_images_are_the_seven_light_webp_files` aparecem individualmente.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | hero: logo 512, eyebrow, `h1` em três linhas, intro, prova | e2e `landing.spec.ts:23` ok | `apps/web/e2e/landing.spec.ts:29` `toBe('/dukfit/logo-dukfit-512.webp')`; `:27` nome `'DUK FIT Academia'`; `:30` eyebrow; `:35` `toEqual(['Seu corpo.', 'Seu ritmo.', 'Sua evolução.'])`; `:38-39` caixas empilhadas; `:41` `SITE.intro`; `:43` `'10+'`; `:44` rótulo da prova | PASS |
| C2 | foto do hero com `fetchpriority` alto, sem `loading`, contraste >= 4,5 | e2e `landing.spec.ts:47` ok | `:50` `toBe('/dukfit/salao-cardio-1600.webp')`; `:51` `toHaveAttribute('fetchpriority', 'high')`; `:52` `toBeNull()`; `:82` `toHaveLength(3)`; `:83` `toBeGreaterThanOrEqual(4.5)`, sobre o véu composto em branco, que é o pior caso | PASS |
| C3 | ordem das seções e rodapé depois do `main` | e2e `landing.spec.ts:86` ok; `dukfit.spec.ts:558` ok | `:94` `toEqual([TAGLINE, 'Sobre a Dukfit', 'O que você encontra', 'Nossa estrutura', 'Horário', 'Onde estamos'])`; `:95` cinco `h2`; `:102` rodapé depois; `apps/web/e2e/dukfit.spec.ts:566` a mesma ordem | PASS |
| C4 | "Sobre": título, texto, duas fotos com `alt` | e2e `landing.spec.ts:105` ok | `:108` `toHaveText('Treino de verdade. Presença todos os dias.')`; `:110` `'Conjunto Duque de Caxias'`; `:112` `toHaveCount(2)`; `:113-116` caminhos; `:117-118` `alt` | PASS |
| C5 | três cards `Panel` numerados | e2e `landing.spec.ts:121` ok | `:124` `toHaveCount(3)`; `:126-128` `01`/`02`/`03` e títulos; `:132-134`; `:140` `'24px'` | PASS |
| C6 | quatro `figure` com fotos, `alt` e legendas em ordem | e2e `landing.spec.ts:145` ok | `:148` `toHaveCount(4)`; `:150-153` caminhos e legendas literais; `:158`; `:159` `alt`; `:160` `toHaveText(caption)` | PASS |
| C7 | `Gauge` "06:00 - 22:00", pílula, 27 de 40 marcas | e2e `dukfit.spec.ts:815` ok | `apps/web/e2e/dukfit.spec.ts:821` `toHaveText(\`${first.opens} - ${first.closes}\`)`; `:822` pílula `first.days`; `:824` `toHaveLength(40)`; `:826` `toHaveLength(27)`. Os textos esperados vêm de `SITE.hours` (`site-content.ts:73`), que confere com a fonte | PASS |
| C8 | `address`, bairro, três links de rota | e2e `landing.spec.ts:164` ok | `:168-169` `toContainText` nas duas linhas do endereço; `:170` `'Conjunto Flores'`; `:178` `toHaveAttribute('href', SITE.routes[key])`; `:179` prefixo. Lacuna de precisão: ver Binding sources | PASS |
| C9 | rodapé: logo 96, frase, Instagram | e2e `landing.spec.ts:183` ok | `:186` `toBe('/dukfit/logo-dukfit-96.webp')`; `:187` frase; `:188-191` `href` `'https://www.instagram.com/dukfitacademia/'` | PASS |
| C10 | 4 links externos com `_blank` e `noopener noreferrer` | e2e `landing.spec.ts:194` ok | `:199` `toHaveLength(4)`; `:201` `toBe('_blank')`; `:202` `arrayContaining(['noopener', 'noreferrer'])` | PASS |
| C11 | sem telefone, WhatsApp, "Criar conta" nem texto de exemplo; só a sessão | e2e `landing.spec.ts:206` ok; vitest repo ok | `:209` `not.toMatch(/\(\d{2}\) \d/)`; `:210` `not.toContain('Criar conta')`; `:211` `wa.me` `toHaveCount(0)`; `tests/repo/identidade.test.ts:101-102` placeholders; `:111` `toEqual(['../lib/session.ts'])`; `:112` | PASS |
| C12 | sem cookie: 200 `image/webp` sem redirect; 404 para o inexistente | e2e `landing.spec.ts:216` ok | `:217` sem sessão; `:218` `maxRedirects: 0`; `:219` `toBe(200)`; `:220` `toBe('image/webp')`; `:222` `toBe(404)` | PASS |
| C13 | sete arquivos WebP de no máximo 400 KB; `matcher` sem `dukfit/` | vitest repo ok | `tests/repo/identidade.test.ts:144` `toEqual(DUKFIT_IMAGES)`; `:147-148` `RIFF`/`WEBP`; `:149` `toBeLessThanOrEqual(400 * 1024)`; `:151` `matcher` | PASS |
| C14 | `width`, `height` e `alt` em toda `img`; `lazy` fora da primeira dobra; carregou | e2e `landing.spec.ts:225` ok | `:245` `>= 9`; `:247-249` `toBeTruthy()`; `:250` `naturalWidth > 0`; `:252` `toBe(firstFold ? null : 'lazy')` | PASS |
| C15 | só a origem do web, zero violação de CSP | e2e `dukfit.spec.ts:595` ok | `apps/web/e2e/dukfit.spec.ts:613` `toEqual([origin])`; `:614` `toEqual([])` | PASS |
| C16 | sem rolagem horizontal e sem `img` vazando, a 360 e a 1440 | e2e `landing.spec.ts:256` ok | `:257` `[NARROW, DESKTOP]`; `:271` `toBe(result.client)`; `:272` `toBe(0)` | PASS |
| C17 | logo 40x40 antes do wordmark no login e no shell desktop; nome "DukFit"; sem logo no celular | e2e `landing.spec.ts:278` ok | `:282` caminho do 96; `:284` `toEqual([40, 40])`; `:288` `toEqual(['brand-logo', 'wordmark'])`; `:289` `'DukFit'`; `:300` `toHaveAccessibleName('DukFit')`; `:305` `toBeHidden()` | PASS |
| C18 | `pnpm verify` exit 0; nenhuma dependência npm nova | `pnpm verify` exit 0; vitest repo ok | `tests/repo/identidade.test.ts:126` `toEqual(deps(before))`, contra `de214e2`, que é anterior e por isso mais estrito; `git diff --stat db28ee0..HEAD -- '*package.json' pnpm-lock.yaml` vazio | PASS |

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /dukfit/<arquivo>.webp` statuses (2) | `Surface` | 200 C12 (`landing.spec.ts:219`) · 404 C12 (`:222`) | - |
| arquivos de imagem (7) | door 1 e a pasta de origem | os 7 C13 (`identidade.test.ts:144`); cada um aparece na página: 512 C1, 96 C9 C17, 1600 C2, 800/musculação/cardio/amanhecer C6, musculação/cardio C4 | - |
| seções da landing (7) | AC 3 | hero C1 C2 · Sobre C4 · O que você encontra C5 · Nossa estrutura C6 · Horário C7 · Onde estamos C8 · rodapé C9 | - |
| links externos (4) | AC 8, AC 9 e a fonte | Google, Waze, Uber C8 C10 · Instagram C9 C10 | o valor das URLs de Google e Waze contra a fonte binding (só o prefixo é afirmado, e o código diverge) |
| lugares do logo (3) | door 4 e AC 19 a 21 | login, shell desktop e shell mobile sem logo C17 | - |
| viewports (2) | AC 18 | 360 e 1440 C16 | - |
| cláusulas do AC 12 (2) | `plan.md` AC 12 | "sem EXEMPLO / Rua Exemplo / 0000-0000" C11 (`identidade.test.ts:101-102`) | "every text ... from `site-content.ts`": nenhuma check, e `page.tsx:121-201` tem fixos os títulos, rótulos e nomes de link |
| campos da door 3 (forma literal de `SITE`) | `plan.md` `Landing` door 3 | chaves de primeiro nível C11 (`identidade.test.ts:96-98`) | `address.city` e `address.zip` não existem (`site-content.ts:74-77`); `logo.small`, `about.photos` e `footer` existem fora da forma aprovada. Nenhuma prova olha os campos internos |
| doors (4) | `Landing` | door 1 C13 · door 2 C12 C13 · door 3 C11 (parcial, ver a linha acima) · door 4 C17 | - |
| texto da fonte binding mostrado na tela | `public-landing.component.ts` | eyebrow, `h1`, intro e prova C1 · título e texto de "Sobre" C4 · cards C5 · legendas e `alt` C6 · endereço e bairro C8 · rodapé e Instagram C9 · horário do `Gauge` C7 | os `h2` de "O que você encontra", "Nossa estrutura" e "Onde estamos"; "Treine com consistência" e o texto dele; o horário do hero e o do `dl` |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Entry point that decides nothing | `apps/web/src/app/page.tsx`, `apps/web/src/components/brand.tsx`, `login/page.tsx`, `shell.tsx` | uma na fronteira, a saída renderizada no Chromium | yes - C1 a C10, C14, C16 e C17 rodam em Chromium sobre `next start`. O CTA pela sessão segue em `dukfit.spec.ts:580` ok |
| Decides, reached across a boundary | `apps/web/src/proxy.ts` (`matcher`) | na fronteira: o arquivo público, o inexistente e uma rota protegida ainda redirecionando | yes - C12 por HTTP (`landing.spec.ts:219`, `:222`). `anonymous_is_redirected_to_login` (`apps/web/e2e/shell.spec.ts:4`) ok |
| Static assets | `apps/web/public/dukfit/*.webp` | uma prova de repositório: nomes, formato e limite de tamanho | yes - C13 (`identidade.test.ts:144-150`) |

Swept `existing`: a única linha com `existing` é a de autorização, que aponta para
`anonymous_is_redirected_to_login`. O teste existe em `shell.spec.ts:4` e passou no `HEAD`.

Supersedes: verifiquei se cada prova reescrita está justificada pelo plano ou se ficou mais fraca.

- `dukfit-app` C30 (`dukfit.spec.ts:558`): justificada pela door 3 e pelo AC 3. Saíram modalidades,
  telefone e WhatsApp, que o plano tirou; a ordem e os cards de `SITE.structure` continuam. A asserção
  sobre o texto dos `h2` virou asserção sobre o rótulo das seções. Isso não contradiz o plano, mas deixou
  os títulos `h2` sem prova (lacuna 2).
- `dukfit-app` C34 (`identidade.test.ts:93`): ficou mais forte. As chaves agora são as da door 3, e entram
  os placeholders e `phone`/`whatsapp`.
- `dukfit-app` C45 (`dukfit.spec.ts:815`): justificada, porque `SITE.hours` agora é uma faixa só. As 40
  marcas, as 27 acesas e os 0 cruzamentos continuam afirmados.
- `dukfit-app` C1, C33 e C39 (`dukfit.spec.ts:47`, `:617`, `:643`): sem mudança de afirmação, todas `ok`.

## Faults injected

Isolamento: `git worktree add C:\Users\Admin\AppData\Local\Temp\dukfit-landing-wt HEAD` e depois
`pnpm install --offline`. Antes de começar, o porcelain da árvore real era `?? CLAUDE.md`. Apliquei cada
falha sozinha, rodei a prova mais estreita e reverti com `git checkout -- <arquivo>`. As execuções foram
uma de cada vez, porque as portas 3100 e 3199 são fixas, e o TIME_WAIT ficou abaixo de 2000 em todas.
No fim, `git worktree remove --force` falhou por caminho longo. Removi com `rmdir /s /q "\\?\..."` e rodei
`git worktree prune`. `git worktree list` mostra só a árvore real, e o porcelain dela saiu idêntico:
`?? CLAUDE.md`.

| Mutation | Location | Killed |
| --- | --- | --- |
| tirar `dukfit/` do `matcher` | `apps/web/src/proxy.ts:72` | yes - `images_are_public_webp_and_unknown_is_404` falhou em `landing.spec.ts:219` (`Expected: 200`, `Received: 307`), exit 1 |
| tirar `loading="lazy"` do componente `Photo` | `apps/web/src/app/page.tsx:40` | yes - `images_have_size_alt_and_lazy_loading` falhou em `landing.spec.ts:252` (`Expected: "lazy"`, `Received: null`), exit 1 |
| tirar `rel` dos links externos (`EXTERNAL = { target: '_blank' }`) | `apps/web/src/app/page.tsx:14` | yes - `external_links_open_in_a_new_tab_without_referrer` falhou em `landing.spec.ts:202` (`Received: [""]`), exit 1 |
| véu do hero de `0.78` para `0.2` | `apps/web/src/app/page.tsx:73` | yes - `hero_photo_loads_first_under_a_dark_overlay` falhou em `landing.spec.ts:83` (`Expected: >= 4.5`, `Received: 1.443`), exit 1 |
| logo depois do wordmark no `Brand` | `apps/web/src/components/brand.tsx:11-19` | yes - `logo_sits_before_the_wordmark_on_login_and_desktop_shell` falhou na ordem (`landing.spec.ts:288`, chamada em `:293`), exit 1 |

Não injetei falha nas URLs de rota. A C8 compara o `href` com o próprio `SITE` e só afirma o prefixo,
então qualquer mudança de parâmetro sobreviveria. A lacuna 1 já registra isso como achado; não é uma
falha nova a injetar.

## Gate

- `pnpm --filter @academia/web exec playwright test --reporter=list`: **363 passed, 0 failed**, exit 0
  (4,3 min), sem retentativa.
- `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts`: **7 passed**, exit 0.
- `pnpm verify`: **exit 0**, 21 successful, 21 total. Foram 20 cache hits do turbo (web 363, api 713,
  repo 35). A web e o `identidade.test.ts` também rodaram fora do cache, nas linhas acima.

## Ranked gaps

1. As URLs de rota de Google Maps e Waze divergem da fonte binding: faltam `dir_action=navigate` e
   `utm_source=dukfit`. A C8 só afirma o prefixo. Check C8, `apps/web/src/app/site-content.ts:80-81`,
   `apps/web/e2e/landing.spec.ts:179`.
2. Texto da fonte binding na tela sem nenhuma check: três títulos `h2`, o destaque "Treine com
   consistência" e as duas linhas de horário fora do `Gauge`. Sem check. `apps/web/src/app/page.tsx:113`,
   `:126-127`, `:133`, `:145`, `:171`, `:183-186`.
3. O AC 12, "every text from `site-content.ts`", não tem check, e `page.tsx` tem texto fixo no código.
   Sem check. `apps/web/src/app/page.tsx:121-201`.
4. A forma literal da door 3 foi alterada sem emenda no plano: `address` sem `city`/`zip`, e `logo.small`,
   `about.photos` e `footer` a mais. A C11 só confere as chaves de primeiro nível. Check C11,
   `apps/web/src/app/site-content.ts:74-77`, `tests/repo/identidade.test.ts:96-98`.
5. Menor, lacuna de precisão: na C7 os valores esperados vêm de `SITE.hours`, não de literais. O valor de
   hoje confere com a fonte, mas o teste não pegaria uma troca de horário que mantivesse 16 horas.
   `apps/web/e2e/dukfit.spec.ts:821-822`.
