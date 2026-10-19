# Identidade visual verification

**Verdict**: PASS
**Profile**: ui
**Diff range**: b0cabb43e08d0db7327757865d5b82ab2710b44e..a43fcb7680fc3b6a22041bcc40fa933b29a001a2
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Rodada 2, scoped, sobre `b0cabb4..HEAD` (`HEAD` = `a43fcb7`). A rodada 1 tinha um único check vermelho
(a C23, porque o commit `51ee6ec` reescreveu a linha `**Branch**` do `STATE.md`) e o conserto
`a43fcb7` restaura essa linha. O diff do conserto é o que a rodada 2 tem de julgar: `git diff
--name-only 51ee6ec..a43fcb7` devolve **só** `.specs/STATE.md`, e o diff de conteúdo é **uma linha**
(`STATE.md:144`), que volta a citar o RustFS (`rustfs/rustfs:1.0.1` fixado por tag e digest) e o
volume `rustfs-data`, sem `pgsty/minio`. Nenhum código, teste, check ou plano mudou, então o
julgamento dos checks que o conserto não alcança é carregado de `51ee6ec` e está marcado como tal em
cada seção. Li `verify.md`, `plan.md` (inteiro), `checks.md` (inteiro), as AD-090/AD-091 do
`STATE.md` (`STATE.md:135-136`), o diff `b0cabb4..a43fcb7` e o diff do conserto, e reabri as duas
imagens binding com a ferramenta de imagem antes de julgar. Rodei **todas** as provas de novo no HEAD
novo - Playwright `--reporter=list` (23 nomes individuais), vitest `--reporter=verbose` (4 nomes),
`pnpm verify`, a prova estreita da C23 e os dois `git diff` da C24. As falhas injetadas não foram
reinjetadas: o conserto não toca em código nem em superfície de asserção, e as cinco da rodada 1 são
carregadas. Nenhuma escrita fora deste relatório; nenhum commit, nenhum push, nenhum `git stash`.

## Binding sources

**carried from 51ee6ec.** O conserto não toca na interface nem no código, então a comparação com as
fontes binding não mudou; as duas imagens foram **reabertas nesta rodada** e continuam conferindo com
os literais do `Landing` e com os hexes dos AC 2 a AC 17. A prancha `bc6ccd7…` (1600x2423, ~40 telas
de app de treino em fundo quase preto, acento lime, cartões em camadas, títulos fortes e números
tabulares) e o mockup `f3e130e…` (1600x1155, três telas "Training Schedule", "Progress Goals" e "Body
Analytics" com cartões escuros, realces lime, botões/ícones pill e números tabulares) foram abertos e
comparados com o `Surface`/`Relations`/`Observable` do plano.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| prancha do app de treino (`bc6ccd7…`) | yes - imagem reaberta nesta rodada; paleta escura, superfícies em camadas, acento lime, títulos fortes e números tabulares conferem com o `Landing` e os AC 2 a 17 | none | - |
| mockup de três telas (`f3e130e…`) | yes - imagem reaberta nesta rodada; cartões ~16 px, camadas sobre o fundo, botões/ícones lime e números tabulares conferem com os AC 2, 3 e 8 | none | - |
| literais do `plan.md` (`Landing` door 1) e hexes dos AC 2 a AC 17 | yes - lidos no `plan.md` e conferidos token a token em `packages/ui/src/globals.css:9-26` e nos componentes | none | - |

A referência desenha a navegação ativa como um ícone sobre um tile lime e a barra de navegação no
rodapé; o plano decide manter a estrutura e o shell atuais (`Assumptions`, "Estrutura das telas") e
fixa a rota ativa como texto #cdf720 (AC 4). A C4 afirma exatamente esse literal; não é contradição
de check, é decisão de plano. A única tensão de autoridade continua sendo o vermelho de erro
`#f87171` do AC 12 não ter token próprio no `Landing` (o `--destructive` é #dc2626 do AC 17); está
julgada em `## Handoff deviations` e não muda o veredito.

## Checks

**verified at a43fcb7** - todas as provas foram re-rodadas no HEAD novo. O julgamento (a asserção
localizada atinge o valor que o check define) é **carried from 51ee6ec** para C1-C22, C24 e C25,
porque o diff do conserto não toca em nenhum arquivo de código ou teste; a C23 foi **re-julgada at
a43fcb7**. Provas desta rodada: `e2e/identidade.spec.ts` **23/23** em uma invocação, cada nome
aparecendo individualmente na saída (35,0 s); `tests/repo/identidade.test.ts` **4/4**; `pnpm verify`
**exit 0** (21/21 tarefas; repo-tests 32/32) e a suíte web inteira re-rodada do zero **313/313**,
incluindo `csp.spec.ts` 3/3; a prova estreita da C23, 1 passed; e os dois `git diff` da C24.

| Check | Claim | Proof run | Evidence | Round | Result |
| --- | --- | --- | --- | --- | --- |
| C1 | fundo rgb(10,10,10) e texto rgb(245,245,245) em toda tela autenticada; literal da door 1 no `globals.css` | e2e `-g "every_authenticated_screen_uses_the_dark_background_and_foreground"` (23/23); vitest `-t "identity_tokens_and_radius_resolve_the_door_one_literal"` (4/4) | `apps/web/e2e/identidade.spec.ts:380` `expect((await styleOf(body, 'background-color')).rgb, screen.path).toBe(DARK)`; `tests/repo/identidade.test.ts:37` `for (const [name, value] of TOKENS) expect(css, name).toContain(...)` | carried from 51ee6ec | PASS |
| C2 | botão primário rgb(205,247,32), texto rgb(10,10,10), raio 9999px | e2e `-g "primary_button_is_the_lime_pill_with_dark_label"` (23/23) | `identidade.spec.ts:391` bg `toBe(LIME)`; `:393` `expect((await styleOf(submit, 'border-radius')).raw).toBe('9999px')` | carried from 51ee6ec | PASS |
| C3 | cartão rgb(20,20,20), borda rgb(38,38,38), raio 16px | e2e `-g "cards_are_layered_surfaces_with_sixteen_radius"` (23/23) | `identidade.spec.ts:401` bg `toBe(CARD)`; `:402-404` borda `toBe(BORDER)` e `border-radius` `toBe('16px')` | carried from 51ee6ec | PASS |
| C4 | header rgb(20,20,20) com borda inferior rgb(38,38,38); rota ativa lime e outra não | e2e `-g "shell_header_and_active_link_match_the_identity"` (23/23) | `identidade.spec.ts:412` header bg `toBe(CARD)`; `:416-417` link ativo `toBe(LIME)` e `Início` `not.toBe(LIME)`; `:420-422` `Início` lime em `/` | carried from 51ee6ec | PASS |
| C5 | `/login` com "Entrar", "E-mail", "Senha", fundo rgb(10,10,10) e submit lime 9999px | e2e `-g "login_page_keeps_its_copy_on_the_dark_identity"` (23/23) | `identidade.spec.ts:429-431` heading e labels visíveis; `:433-435` submit lime, raio 9999px e body `toBe(DARK)` | carried from 51ee6ec | PASS |
| C6 | `body` com Manrope, pesos 400 e 800, asset self-hosted + OFL, sem `<link>` externo | e2e `-g "manrope_is_the_loaded_body_font_from_the_web_origin"` (23/23); vitest `-t "manrope_font_asset_is_self_hosted_with_the_ofl_license"` (4/4) | `identidade.spec.ts:446` `expect(family.toLowerCase()).toContain('manrope')`; `:454` `expect(loaded).toEqual({ regular: true, bold: true })`; `tests/repo/identidade.test.ts:67` `expect(layout).toContain("from 'next/font/local'")` | carried from 51ee6ec | PASS |
| C7 | `color-scheme: dark`; `prefers-color-scheme: light` não troca a paleta | e2e `-g "light_scheme_preference_does_not_change_the_dark_palette"` (23/23); vitest `-t "identity_tokens_and_radius_resolve_the_door_one_literal"` (4/4) | `identidade.spec.ts:472` `colorScheme` `toBe('dark')`; `:473-474` body rgb(10,10,10)/rgb(245,245,245); `tests/repo/identidade.test.ts:40` `expect(css).not.toContain('prefers-color-scheme')` | carried from 51ee6ec | PASS |
| C8 | títulos de card #f5f5f5 sobre #141414, números `tabular-nums`, links lime | e2e `-g "dashboard_uses_the_identity_hierarchy"` (23/23) | `identidade.spec.ts:482` h3 `toBe(LIGHT)`; `:483-484` card `toBe(CARD)` e `font-variant-numeric` `toBe('tabular-nums')`; `:485` link `toBe(LIME)` | carried from 51ee6ec | PASS |
| C9 | acento só em botão, link, nav ativa e foco; nenhuma superfície de página/card/tabela | e2e `-g "lime_accent_only_on_primary_actions_links_and_focus"` (23/23) | `identidade.spec.ts:516-517` backgrounds lime só `BUTTON`/`A`; `:523` textos lime só `A`; `:527-529` painel idem | carried from 51ee6ec | PASS |
| C10 | th rgb(31,31,31)/rgb(212,212,212), corpo rgb(245,245,245), borda rgb(38,38,38), container 16px | e2e `-g "tables_use_the_header_body_and_border_values"` (23/23) | `identidade.spec.ts:538-540` th bg `toBe(HEADER)`, th cor `toBe('rgb(212, 212, 212)')`, td `toBe(LIGHT)`; `:543-544` borda `toBe(BORDER)` e raio `toBe('16px')` | carried from 51ee6ec | PASS |
| C11 | input/select #141414/#2a2a2a/#f5f5f5, placeholder #8a8a8a, foco 2px lime com offset 2px | e2e `-g "form_controls_use_the_dark_surface_and_the_lime_focus"` (23/23) | `identidade.spec.ts:552-557` input bg/borda/cor/placeholder; `:561-564` outline-color `toBe(LIME)`, width `2px`, offset `2px`, style `solid`; `:568-570` select bg/borda/cor | carried from 51ee6ec | PASS |
| C12 | campo inválido com borda e texto rgb(248,113,113) | e2e `-g "invalid_control_and_error_text_use_the_red"` (23/23) | `identidade.spec.ts:580` email borda `toBe(DANGER)`; `:583` mensagem `toBe(DANGER)`; `:584` senha borda `toBe(DANGER)` | carried from 51ee6ec | PASS |
| C13 | Alert default #1f1f1f/#d4d4d4; destrutivo texto e borda #f87171 | e2e `-g "alert_variants_use_the_dark_and_destructive_values"` (23/23) | `identidade.spec.ts:593-594` default bg `toBe(HEADER)` e texto `toBe('rgb(212, 212, 212)')`; `:600-601` destrutivo texto e borda `toBe(DANGER)` | carried from 51ee6ec | PASS |
| C14 | overlay rgba(0,0,0,0.7); conteúdo #141414, borda #262626, raio 16px | e2e `-g "dialog_overlay_and_content_use_the_identity"` (23/23) | `identidade.spec.ts:611` overlay `toBe('rgba(0, 0, 0, 0.7)')`; `:615-617` conteúdo bg `toBe(CARD)`, borda `toBe(BORDER)`, raio `toBe('16px')` | carried from 51ee6ec | PASS |
| C15 | badge `allowed` rgba(205,247,32,0.15)/lime; `blocked` rgba(248,113,113,0.15)/#f87171 | e2e `-g "check_in_badges_use_the_allowed_and_blocked_values"` (23/23) | `identidade.spec.ts:632-633` allowed bg `toBe('rgba(205, 247, 32, 0.15)')` e cor `toBe(LIME)`; `:643-644` blocked bg `toBe('rgba(248, 113, 113, 0.15)')` e cor `toBe(DANGER)` | carried from 51ee6ec | PASS |
| C16 | link fora da nav lime, sublinhado, offset 4px | e2e `-g "links_outside_the_nav_are_lime_with_four_pixel_offset"` (23/23) | `identidade.spec.ts:653` cor `toBe(LIME)`; `:654-655` `text-decoration-line` `toBe('underline')` e `text-underline-offset` `toBe('4px')` | carried from 51ee6ec | PASS |
| C17 | botão destrutivo rgb(220,38,38) e texto rgb(250,250,250) | e2e `-g "destructive_button_uses_the_red_surface_and_light_text"` (23/23) | `identidade.spec.ts:664` bg `toBe(RED)`; `:665` cor `toBe('rgb(250, 250, 250)')` | carried from 51ee6ec | PASS |
| C18 | as 24 telas mantêm rota, headings, colunas, labels e ordem; header antes de `main` nas telas com shell | e2e `-g "every_screen_keeps_its_copy_and_arrangement"` (23/23) | `identidade.spec.ts:116-359` tabela `SCREENS` (24 entradas); `:671` `expect(SCREENS).toHaveLength(24)`; `:697` headings, `:701` colunas, `:706` labels; `:680-694` shell/header antes de `main` (21 telas com shell, 3 sem: login, login/two-factor e two-factor/setup) | carried from 51ee6ec | PASS |
| C19 | impressão branca rgb(255,255,255) e texto preto em `/students`, `/students/[id]/print` e `/staff/[id]/print`; reset no `@media print` | e2e `-g "print_media_resets_the_palette_to_white_and_black"` (23/23); vitest `-t "print_media_resets_the_tokens_to_white_and_black"` (4/4) | `identidade.spec.ts:730` `/students` `toEqual(expected)`; `:733` student print; `:736` staff print; `tests/repo/identidade.test.ts:55-56` o bloco `body` do print com `background-color: #ffffff` e `color: #000000` | carried from 51ee6ec | PASS |
| C20 | rota desconhecida 404, fundo rgb(10,10,10), heading "Página não encontrada", link href `/` | e2e `-g "unknown_route_renders_the_dark_not_found_page"` (23/23) | `identidade.spec.ts:743-744` status 404 e heading visível; `:745` `toHaveAttribute('href', '/')`; `:746` body `toBe(DARK)` | carried from 51ee6ec | PASS |
| C21 | Tab mostra outline 2px solid lime com offset 2px | e2e `-g "keyboard_focus_shows_the_lime_ring_with_two_pixel_offset"` (23/23) | `identidade.spec.ts:757` outline-color `toBe(LIME)`; `:758-759` width `2px` e offset `2px` | carried from 51ee6ec | PASS |
| C22 | contraste ≥7:1 #f5f5f5/#0a0a0a, ≥4.5:1 #a3a3a3/#0a0a0a e ≥7:1 #0a0a0a/#cdf720 | e2e `-g "contrast_ratios_meet_the_minimums"` (23/23) | `identidade.spec.ts:795` `expect(ratios.body).toBeGreaterThanOrEqual(7)`; `:796` muted `4.5`; `:797` primary `7` | carried from 51ee6ec | PASS |
| C23 | `pnpm verify` exit 0; todas as rotas, headings e copy inalterados, incluindo as telas Playwright; `csp.spec.ts` com zero `securitypolicyviolation` em `/login` e `/students` (AC 22) | `pnpm verify` (exit 0; 21/21 tarefas); `vitest run repo.test.ts -t "state_branch_line_no_longer_names_the_minio_image"` (1 passed); suíte web completa re-rodada do zero (313 passed) | `tests/repo/repo.test.ts:344` `expect(branch).toMatch(/RustFS/i)` - `branch` é a linha de `.specs/STATE.md:144` (`**Branch**: main, sem push. O \`compose.yaml\` usa o RustFS (\`rustfs/rustfs:1.0.1\` fixado por tag e digest) no lugar do MinIO, com o volume \`rustfs-data\` ...`); `:341` `expect(branch, ...).toBeDefined()`; `:343` `expect(branch).not.toMatch(new RegExp(['pgs', 'ty'].join('') + '/minio', 'i'))`; `apps/web/e2e/csp.spec.ts:69`, `:80`, `:83` `toEqual([])` | verified at a43fcb7 | PASS |
| C24 | sem dependência npm nova; nada em `apps/api`, `packages/contracts`, migrações, `package.json`, `packages/ui/package.json`, `pnpm-lock.yaml`, `deploy/`, `.env.example`; só `manrope-variable.woff2` + `OFL.txt` | os dois `git diff` da C24 (exit 0) + vitest `-t "only_the_manrope_asset_and_its_ofl_license_are_new"` (4/4) | primeiro `git diff` **vazio**; segundo só `apps/web/src/fonts/manrope-variable.woff2`; `tests/repo/identidade.test.ts:79-82` `readdirSync(...fonts).sort()` `toEqual(['OFL.txt', 'manrope-variable.woff2'])` | carried from 51ee6ec | PASS |
| C25 | quatro perfis, todas as telas que abrem: body rgb(10,10,10), nenhuma superfície opaca mais clara que #2a2a2a (exceto botões, links, badges e fotos) | e2e `-g "four_profiles_never_render_a_surface_lighter_than_the_limit"` (23/23) | `identidade.spec.ts:848` body `toBe(DARK)` por perfil/tela; `:849` `expect(scan.offenders, ...).toEqual([])`; `:854` `expect(visits).toBe(roles.length * AUTHENTICATED.length)` (4×22) | carried from 51ee6ec | PASS |

Observações de precisão (não mudam o veredito, mas ficam registradas): a C18 diz "22 telas
autenticadas ou de setup com o header do shell", mas a tabela `SCREENS` tem **21** com `shell: true`
e **3** sem shell (`/login`, `/login/two-factor`, `/two-factor/setup`, `identidade.spec.ts:118-137`);
o teste afirma a divisão correta 21/3 (`:680-694`), o "22" é só imprecisão da prosa do check. A C9
amostra `/login`, `/students` e `/` (o diff não introduz acento fora dos quatro usos do AC 9), e a
C25 visita as 22 telas nos quatro perfis sem afirmar o status de cada `goto`; o conjunto coberto
continua sendo o das telas que cada perfil abre.

## Coverage

**carried from 51ee6ec.** O conserto não cria nem remove membro de conjunto nenhum (o diff é uma
linha de documentação), então o join não foi recomputado do zero; a linha AC22→C23 foi **re-julgada
at a43fcb7** e agora está verde. Join original: os 24 `apps/web/src/app/**/page.tsx` que o `glob`
devolve (são exatamente as 24 rotas de `SCREENS`), os 24 ACs do `plan.md`, as 11 linhas do
`Observable`, as 2 doors do `Landing`, os literais do `Landing` + AC 2 a 17, os componentes de
`@academia/ui` que o plano cita, os 4 perfis, as 2 rotas de `print`, as 7 seções da ficha/exportação
e os 8 fronts do `Impact`. Nenhum membro ficou sem prova atribuída.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| screens of `apps/web/src/app` (24) | `glob apps/web/src/app/**/page.tsx` = 24 arquivos, os mesmos 24 de `SCREENS` | `/login` C18 · `/login/two-factor` C18 · `/two-factor/setup` C18 · `/` C18 · `/students` C18 · `/students/new` C18 · `/students/[id]` C18 · `/students/[id]/edit` C18 · `/staff` C18 · `/staff/new` C18 · `/staff/[id]` C18 · `/staff/[id]/edit` C18 · `/plans` C18 · `/plans/new` C18 · `/plans/[id]/edit` C18 · `/payments` C18 · `/check-ins` C18 · `/check-in` C18 · `/audit` C18 · `/users` C18 · `/privacy` C18 · `/account` C18 · `/students/[id]/print` C18 · `/staff/[id]/print` C18 (`identidade.spec.ts:116-359`, `:671-711`) | - |
| authenticated screens of AC 1 (22) | `plan.md` AC 1 + `AUTHENTICATED` (24 menos os dois logins) | as 22 C1, table-driven (`identidade.spec.ts:361-383`) | - |
| Criteria AC 1 a AC 24 (24) | `plan.md` `Criteria` | AC1 C1 · AC2 C2 · AC3 C3 · AC4 C4 · AC5 C5 · AC6 C6 · AC7 C7 · AC8 C8 · AC9 C9 · AC10 C10 · AC11 C11 · AC12 C12 · AC13 C13 · AC14 C14 · AC15 C15 · AC16 C16 · AC17 C17 · AC18 C19 · AC19 C20 · AC20 C21 · AC21 C22 · AC22 C23 · AC23 C24 · AC24 C25 | - |
| palette literals of the `Landing` + AC 2 a 17 (18) | `plan.md` `Landing` door 1 + AC 2 a 17; o autor listou 14 e a recomputação acrescenta #fafafa (AC 17) e os três literais compostos (AC 14/15) | #0a0a0a C1 · #f5f5f5 C1 · #141414 C3 · #1f1f1f C10 · #262626 C4 · #2a2a2a C11 · #a3a3a3 C22 · #d4d4d4 C10 · #8a8a8a C11 · #cdf720 C2 · #dc2626 C17 · #f87171 C12 · #fafafa C17 · radius 16px C3 · radius 9999px C2 · `rgb(0 0 0 / 0.7)` C14 · `rgb(205 247 32 / 0.15)` C15 · `rgb(248 113 113 / 0.15)` C15 | - |
| doors do `Landing` (2) | `plan.md` `Landing` | door 1 C1 (literal estático + renderizado) · door 2 C6 (asset/licença + família/pesos do browser) | - |
| componentes de `@academia/ui` citados pelo plano (6; 8 provas de variante) | `plan.md` `Flow` passo 2 | button C2 · button destructive C17 · input C11 · select C11 · alert C13 · dialog C14 · table C10 · badge do check-in C15 (o badge não é do pacote, mas o plano o cobre no AC 15) | - |
| usos do acento #cdf720 (4) | `plan.md` AC 9 | botão primário C2 · link fora da nav C16 · link da rota ativa C4 · anel de foco C21 | - |
| `Observable` (11 linhas: 10 com decisão + 1 n/a) | `plan.md` `Observable` | erro em `/login` C13 (o formulário usa `Alert variant="destructive"`, `apps/web/src/app/login/login-form.tsx:42`) · vazio/loading de `/login` n/a - server component sem lista · vazio/densidade do painel C8 + `pnpm verify` (a suíte existente afirma "Nenhum vencimento…" em `apps/web/e2e/dashboard.spec.ts:116,157`) · listas vazias/erro C10/C13 + `pnpm verify` · validação e foco dos formulários C11/C12/C21 · diálogos destrutivos C14/C17 · `/check-in` allowed/blocked C15 · as duas rotas de print C19 · nav ativa e foco em todas as telas C4/C21 · rota desconhecida C20 · superfícies escuras em todas as telas C1/C25 | - |
| perfis de desenvolvimento (4) | `plan.md` AC 24 / `checks.md` C25 | admin C25 · reception C25 · hr_finance C25 · instructor C25 (`identidade.spec.ts:803`) | - |
| rotas de `print` (2) | `plan.md` AC 18 | `/students/[id]/print` C19 (`identidade.spec.ts:733`) · `/staff/[id]/print` C19 (`:736`) | - |
| seções da ficha/exportação (7) | `plan.md` AC 18 + a tela de print | Dados pessoais C18 · Responsáveis C18 · Consentimentos C18 · Matrículas C18 · Pagamentos C18 · Presenças C18 · Fotos C18 (`identidade.spec.ts:320-326`) | - |
| `Impact` fronts (8) | `plan.md` `Impact` | domain C18 · stored data C24 · contrato C24 · dependências C24 · comandos e testes C23 · documentos C24 · CI C23 (a suíte que o `pnpm verify` roda afirma o workflow em `tests/repo/repo.test.ts:553-561`) · telas C18 | - |

Notas de precisão do join: a linha "paleta amostrada" do autor tinha 14 membros; a autoridade do
`Landing` + AC 2 a 17 tem 18, e os quatro ausentes (#fafafa e os três `rgba`/`rgb` compostos) têm
prova (C17, C14, C15). A C18 cobre a composição por headings/colunas/labels; os controles e a
ordem fina de cada tela são regression-asserted pela suíte existente que roda em `pnpm verify`
(313 testes de tela). `max-w-4xl`, a densidade de linha e o raio de controle de 12 px da
`Assumptions` ("controle 12 px") são spacing/layout: o diff não os muda, e o profile `ui` declara
essa classe fora do seu alcance; ficam como observação de precisão, não como membro sem proof. As
seções da ficha são provadas na tela de print (`Dados pessoais`, `Responsáveis`, `Consentimentos`,
`Matrículas`, `Pagamentos`, `Presenças`, `Fotos`), que é a exportação/impressão da ficha.

## Test policy rows

**carried from 51ee6ec.** O conserto não toca em nenhum arquivo classificado por estas linhas
(`globals.css`, componentes de `@academia/ui`, `apps/web/src/app/**`, `layout.tsx`, `not-found.tsx`),
então os cinco veredictos são carregados e cada exigência continua satisfeita pela prova que já
existia.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Tokens and print reset | `packages/ui/src/globals.css` (13 cores, 1 raio, 1 reset de print) | um caso afirmado na fronteira renderizada por token, mais o literal da door estático | yes - C1 afirma body rgb(10,10,10)/rgb(245,245,245) nas 22 telas e o literal token a token (`identidade.test.ts:37`); C19 afirma o print em mídia de impressão nas três páginas e o bloco `@media print` (`identidade.test.ts:55-56`) |
| Component variant maps | `button`, `alert`, `input`/`select`, `dialog`, `table` | um caso afirmado por variante na fronteira renderizada | yes - C2 (button default), C17 (destructive), C13 (alert default/destructive), C11 (input/select), C12 (invalid), C14 (overlay/content), C10 (th/td/row/container), C15 (badge allowed/blocked) |
| Screen composition | `apps/web/src/app/**` e `apps/web/src/components/shell.tsx` | uma asserção estrutural por tela, na fronteira | yes - C18 itera as 24 telas e afirma headings, colunas, labels, textos e header-antes-de-`main` (`identidade.spec.ts:671-711`) |
| Font wiring | `apps/web/src/app/layout.tsx` | uma na fronteira | yes - C6 afirma família, pesos e URL do browser (`identidade.spec.ts:446-464`) e o asset, a licença e o `next/font/local` estaticamente (`identidade.test.ts:59-75`) |
| `apps/web/src/app/not-found.tsx` | `not-found.tsx` | uma na fronteira | yes - C20 afirma 404, heading, link `/` e fundo escuro (`identidade.spec.ts:743-746`) |

## Faults injected

**carried from 51ee6ec.** O conserto não toca em código de comportamento nem em superfície de
asserção: o diff `51ee6ec..a43fcb7` é uma linha em `.specs/STATE.md`, e nenhum dos cinco mutantes da
rodada 1 fica mais perto ou mais longe dele. Não houve reinjeção, e as cinco falhas seguem sendo as
cinco superfícies distintas que a rodada 1 fez falhar uma vez cada.

| Mutation | Location | Killed |
| --- | --- | --- |
| `--background: oklch(0.145 0 0)` -> `oklch(0.2 0 0)` | `packages/ui/src/globals.css:11` | yes - C1 reprovou em `identidade.spec.ts:380` (`Expected: "rgb(10, 10, 10)"`, `Received: "rgb(22, 22, 22)"` em `/two-factor/setup`), exit 1 |
| botão primário `rounded-[9999px]` -> `rounded-md` | `packages/ui/src/components/button.tsx:12` | yes - C2 reprovou em `identidade.spec.ts:393` (`Expected: "9999px"`, `Received: "12px"`), exit 1 |
| removido o `body { background-color: #ffffff; color: #000000 }` do `@media print` | `packages/ui/src/globals.css:90-93` | yes - C19 reprovou em `tests/repo/identidade.test.ts:55` (regex do `body` branco não casa), exit 1 |
| badge `allowed`: alpha `0.15` -> `0.3` | `apps/web/src/app/check-in/check-in-desk.tsx:161` | yes - C15 reprovou em `identidade.spec.ts:632` (`Expected: "rgba(205, 247, 32, 0.15)"`, `Received: "rgba(205, 247, 32, 0.3)"`), exit 1 |
| removido o `next/font/local` do layout | `apps/web/src/app/layout.tsx:3` | yes - C6 reprovou em `tests/repo/identidade.test.ts:67` (layout sem `from 'next/font/local'`), exit 1 |

As cinco superfícies - token de tema (C1), variante de componente (C2), reset de impressão (C19),
literal de badge (C15) e wiring de fonte (C6) - foram cada uma feitas falhar uma vez na rodada 1.
Nenhum mutante sobreviveu, e a rodada 2 não tem superfície nova para injetar.

## Handoff deviations

**carried from 51ee6ec.** As decisões declaradas no `## Handoff`/Build record do `checks.md` não
mudaram com o conserto; o julgamento de cada uma é carregado, e o último item (a regressão da rodada
1) foi **re-julgado at a43fcb7**.

- **Pill `rounded-[9999px]` em vez de `rounded-full` (C2).** Aceito. O AC 2 pede
  `border-radius: 9999px`; `rounded-full` do Tailwind v4 compila para `calc(infinity * 1px)` e o
  computado sai `3.35544e+07px`, como o Handoff declara. O literal está em
  `packages/ui/src/components/button.tsx:12` e a C2 afirma `9999px` em `identidade.spec.ts:393`.
  Não contradiz o AC; é a forma de realizar o literal.
- **Foco por `outline` em vez de `ring` (C11/C21).** Aceito. O AC 20 pede anel de 2 px #cdf720 com
  offset de 2 px; `:focus-visible` em `globals.css:65-68` produz `outline: 2px solid var(--ring)` e
  `outline-offset: 2px`, que é o valor computado que C11/C21 afirmam (`identidade.spec.ts:561-564`,
  `:757-759`). O `ring` do Tailwind é `box-shadow` e não serializa como o `outline` que o check
  nomeia; a exigência do AC é visual e de valor, não a propriedade CSS do framework.
- **`th { color: #000 }` na impressão (C19).** Aceito. O AC 18 pede texto preto no papel; sem essa
  regra o `TableHead` manteria `#d4d4d4` sobre o branco. O bloco está em `globals.css:95-97` e a
  C19 prova o body branco/preto nas três páginas; o `th` preto é a consequência correta do AC 18.
- **`bg-[rgb(0_0_0_/_0.7)]` no overlay (C14).** Aceito. O AC 14 fixa `rgb(0 0 0 / 0.7)`; o
  `bg-black/70` do Tailwind vira `color-mix` e não serializa como `rgba(0, 0, 0, 0.7)`. O literal
  está em `packages/ui/src/components/dialog.tsx:13` e a C14 afirma o computado em
  `identidade.spec.ts:611`.
- **`text-[#f87171]` em todo erro de campo (C12) - precisão, não bloqueante.** Aceito como lacuna de
  precisão da autoridade, não como contradição do check. O AC 12 fixa #f87171 para borda e texto do
  campo inválido; o conjunto de tokens do `Landing` não tem um token de erro (`--destructive` é
  #dc2626, AD-090/AC 17), então a única forma de realizar o AC 12 sem inventar token é o literal, e
  ele está confinado ao estado de erro (`apps/web/src/app/students/student-form.tsx:149`, `:157`,
  `:194`, `:228`; `apps/web/src/app/audit/audit-filters.tsx:35`;
  `apps/web/src/components/text-field.tsx:27`, entre outros). O código escolhe cor fora dos tokens, o
  que a prosa do AD-090 não permite; é uma incompletude do conjunto de tokens do plano, declarada no
  Handoff, e o comportamento renderizado é exatamente o do AC 12. Um `--danger` próprio no `Landing`
  fecharia a tensão numa próxima feature.
- **Correção de dois dígitos do `Landing`.** Aceita, e não é desvio de build: foi corrigida no plano
  antes dos checks (`--primary`/`--ring` `0.2148`, `--destructive` `0.215`). O literal está em
  `globals.css:18-19,23` e o teste estático o afirma token a token (`identidade.test.ts:24-29`); o
  renderizado bate com o AC 2 (`#cdf720`/rgb(205,247,32), C2) e o AC 17 (`#dc2626`/rgb(220,38,38),
  C17). Nenhum outro literal mudou.
- **Detalhes reversíveis do build.** `nav-link.tsx` (marcar a rota ativa no cliente),
  `not-found.tsx`, `--radius-md: 0.75rem` (controle 12 px da `Assumptions`), a varredura de
  `text-destructive` -> `text-[#f87171]` e o `th` preto são detalhes de implementação coerentes com
  o plano; o único deles que toca a disciplina de tokens é o vermelho de erro, julgado acima.
- **Regressão da rodada 1 - resolvida at a43fcb7.** O commit `51ee6ec` tinha reescrito a linha
  `**Branch**` do `STATE.md` (`:144`) e removido a menção ao RustFS que
  `tests/repo/repo.test.ts:337-345` exige. O commit `a43fcb7` restaura a linha: `.specs/STATE.md:144`
  volta a citar `rustfs/rustfs:1.0.1` (por tag e digest) e o volume `rustfs-data`, sem `pgsty/minio`.
  A asserção `tests/repo/repo.test.ts:344` (`expect(branch).toMatch(/RustFS/i)`) passa, a `:343`
  (`not.toMatch(...pgsty/minio...)`) continua sem casar, e a prova estreita do caso
  `state_branch_line_no_longer_names_the_minio_image` roda 1 passed (exit 0). Nenhum desvio de design
  permanece aberto.

## Gate

- `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts --reporter=list` - **23 passed, 0 failed**, exit 0 (35,0 s; cada um dos 23 nomes apareceu individualmente; o webServer fez `next build` + `next start`).
- `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts --reporter=verbose` - **4 passed**, exit 0 (170 ms; os quatro nomes listados).
- `pnpm verify` - **exit 0**; **21 successful, 21 total** tarefas; `@academia/repo-tests:test` **32 passed** (inclui `repo.test.ts`, o arquivo da C23) e `@academia/api:test` 709 passed. O turbo reaproveitou o log de `@academia/web:test` (cache hit), então a suíte web foi **re-rodada do zero** à parte: `pnpm --filter @academia/web test` - **313 passed**, exit 0 (3,6 m), com `e2e/csp.spec.ts` **3/3** (`:30`, `:41`, `:49`, incluindo `chromium_opens_login_and_students_without_csp_violations`).
- `pnpm --filter @academia/repo-tests exec vitest run repo.test.ts -t "state_branch_line_no_longer_names_the_minio_image" --reporter=verbose` - **1 passed, 27 skipped**, exit 0 (prova estreita da C23 no HEAD novo).
- `git diff --name-only b0cabb43e08d0db7327757865d5b82ab2710b44e..HEAD -- apps/api packages/contracts packages/database/migrations package.json apps/web/package.json packages/ui/package.json pnpm-lock.yaml deploy .env.example` - saída **vazia**.
- `git diff --name-only b0cabb43e08d0db7327757865d5b82ab2710b44e..HEAD -- '*.woff2' '*.woff' '*.ttf' '*.otf'` - só `apps/web/src/fonts/manrope-variable.woff2`.
- `git diff --name-only 51ee6ec..a43fcb7` - só `.specs/STATE.md` (o conserto é uma linha).
- `python C:\Users\Admin\.agents\skills\tlc-spec-lean\scripts\validate_verification.py identidade-visual --root C:\Users\Admin\projetos\academia-bairro` - **exit 0**.

**Gaps (nenhum bloqueante)**

1. **C18 - precisão (não bloqueante).** O claim fala em 22 telas com header do shell; a tabela
   `SCREENS` tem 21 com shell e 3 sem (`identidade.spec.ts:118-137`); o teste afirma a divisão
   correta 21/3 (`:680-694`).
2. **C12/AD-090 - precisão de token (não bloqueante).** `text-[#f87171]` nas telas realiza o AC 12,
   mas o `Landing` não tem token para #f87171; o `--destructive` é #dc2626. Lacuna de precisão da
   autoridade, julgada em `## Handoff deviations`.
