# Refino visual verification

**Verdict**: PASS
**Profile**: ui
**Diff range**: 67c22e6..a39dbf7
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Rodada 2 escopada pelo `verify.md` ("Re-verifying after a fix"): o diff do fix `ac39d9d..a39dbf7`
(12 arquivos, +221/−16) e os veredictos não-PASS do round 1 (os 5 membros `Unproven` e as 3
precision gaps). As 70 provas foram **reexecutadas por inteiro** no `HEAD` novo, não só as tocadas:
REPO 44/44 e a suíte E2E completa 489/489, executada por este Verifier em `a39dbf7` (11,4 min). O
round 1 havia reprovado pelos 5 gaps listados na `## Coverage` deste relatório; o fix os fechou com
prova nova em cada superfície e o Step 1 escopado reconfirmou as telas tocadas (`/` e o vazio de
`/students`) contra as mesmas fontes binding. Nada de código, plano, checks ou `STATE.md` foi alterado
por este Verifier; a única escrita é este arquivo.

## Binding sources

Fontes reabertas nos pontos que o fix tocou (Step 1 escopado); as demais colunas foram reconferidas
contra o `HEAD` e continuam sem contradição. As linhas que o round 1 registrou como contradição ou
sem prova estão fechadas: o logo da door 3 (arquivo 96 no cabeçalho e no rodapé - `site-content.ts:15`,
`site-header.tsx:131`, `page.tsx:230`; prova `landing.spec.ts:530`), a régua da palavra da navegação
(door 6 - `rule-link.ts:13-14`, `site-header.tsx:140`; prova `landing.spec.ts:550`), as composições
`story`/`pair` (door 3/4 - `page.tsx:146-147,172`, `develop-pair.tsx:65`; prova `landing.spec.ts:589`),
a ação opcional do `EmptyState` (door 7/AC 7 - `students-list.tsx:110-119`; prova
`refino-visual.spec.ts:571`) e o texto de lista 16/24 (`page.tsx:131,165,193`,
`plans-pricing.tsx:30`; prova `landing.spec.ts:636`).

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `.agents/skills/design-taste-frontend/SKILL.md` | yes - 381 linhas lidas | - | - |
| `.agents/skills/design-taste-frontend/references/sections.md:292-617` (Place) | yes - 326 linhas lidas | - | - |
| `plan.md` `## Landing` doors 1-7 e AC 1-63 | yes - 285 linhas lidas | - | - |
| `plan.md` `## Surface` e `## Relations` | yes - ambos `None` (`plan.md:93-100`) | - | - |
| `apps/web/src/app/site-content.ts` (`SITE`) | yes - relido em `a39dbf7`; `logo.src` = `logo-dukfit-96.webp` (`site-content.ts:15`) | - | - |
| `apps/web/src/lib/{students,plans,payments,leads,roles}.ts` | yes - lidos pela `REPO refino.test.ts:237-278`; `canWriteStudents` em `lib/students.ts:57` | - | - |
| `apps/web/e2e/support/identidade.ts` (`SCREENS`) | yes - 395 linhas lidas; 26 telas | - | - |
| `apps/web/src/components/{auth-frame,portal-frame,brand}.tsx` e `page.tsx` de `/login`, `/primeiro-acesso`, `/esqueci-senha`, `/definir-senha`, `/minha-conta` | yes - lidos; a `C35` mede moldura, marca, olho e `h1` (`refino-visual.spec.ts:332-358`) | - | - |
| `.specs/STATE.md` AD-090, AD-092, AD-095 a AD-106 e AD-119 a AD-124 | yes - tabela de decisões lida (linhas 136-171) | - | - |

## Checks

Provas reexecutadas por inteiro em `a39dbf7` (nenhuma linha carregada neste relatório): REPO
`pnpm --filter @academia/repo-tests exec vitest run refino.test.ts identidade.test.ts motion.test.ts --reporter=verbose` - **44 passed, 0 failed**; E2E suíte completa
`pnpm --filter @academia/web exec playwright test` - **489 passed, 0 failed** (11,4 min, log
`.turbo/verifier-r2-refino/e2e-full-head.log`; cada teste nomeado aparece individualmente, `ok N`
citado por linha). As citações de `apps/web/e2e/refino-visual.spec.ts` abaixo já são as do `HEAD`
novo: a prova extra do `EmptyState` foi inserida na linha 571 e deslocou +18 as linhas seguintes. As
provas novas do round 2 (nomes distintos dos checks) sustentam as linhas C7, C20, C24, C31 e C49 e a
`## Coverage`: `landing_logo_is_the_96_in_the_header_and_the_footer` (`landing.spec.ts:530`),
`nav_word_draws_its_ruler_on_hover` (`landing.spec.ts:550`),
`about_photo_is_a_four_by_three_story_and_structure_pair_levels_the_tops` (`landing.spec.ts:589`),
`landing_list_text_is_sixteen` (`landing.spec.ts:636`) e `empty_state_offers_an_action`
(`refino-visual.spec.ts:571`).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | os 11 tokens da door 1 em `:root` e mapeados em `@theme inline` | REPO `refino.test.ts -t status_control_and_chart_tokens_are_the_door_one_literal` - 1 passed | `tests/repo/refino.test.ts:80` - `expect(roots.get(name), name).toBe(value)` sobre `DOOR_ONE_ROOTS` (`refino.test.ts:49-61`) e `refino.test.ts:83` sobre `DOOR_ONE_THEME` (`63-75`) | PASS |
| C2 | os valores da AD-098 não mudam | REPO `identidade.test.ts -t identity_tokens_and_radius_resolve_the_door_one_literal` - 1 passed; REPO `refino.test.ts -t theme_keeps_the_ad098_values` - 1 passed | `tests/repo/identidade.test.ts:38` - `expect(css, name).toContain(`${name}: ${value};`)`; `tests/repo/refino.test.ts:104` - `expect(roots.get(name), name).toBe(value)` | PASS |
| C3 | nenhum hex fora de `globals.css`; literais antigos saem | REPO `refino.test.ts -t no_hex_colors_outside_the_theme` - 1 passed | `tests/repo/refino.test.ts:118` - `expect(source.match(HEX) ?? [], path).toEqual([])`; `refino.test.ts:119` - `expect(source, ...).not.toContain(literal)` | PASS |
| C4 | `StatusBadge` resolve os 27 pares e pinta texto/superfície `--status-*` | REPO `refino.test.ts -t status_badge_variant_map_is_the_door_seven_literal` - 1 passed; E2E `refino-visual.spec.ts -g status_badge_uses_status_tokens_on_their_surfaces` - ok 346 | `tests/repo/refino.test.ts:130-142` - `expect(map).toEqual({...})` e `expect(pairs).toBe(27)`; `apps/web/e2e/refino-visual.spec.ts:100` - `expect(await colorOf(badge)).toMatchObject(tone.text)` e `:101` - `near(await colorOf(badge, 'background-color'), tone.surface)` | PASS |
| C5 | contraste ≥4,5:1 por situação e ≥7:1 do texto | REPO `refino.test.ts -t status_and_foreground_contrast_meet_the_minimums` - 1 passed | `tests/repo/refino.test.ts:195` - `expect(contrast(text, surface), ...).toBeGreaterThanOrEqual(4.5)`; `:198` - `expect(contrast(foreground, background)).toBeGreaterThanOrEqual(7)` | PASS |
| C6 | geometria do `ScreenHeader` (olho, dot, `h2` 30/500, meta, ações, gutter 16/32) | E2E `refino-visual.spec.ts -g screen_header_geometry_at_390_and_1440` - ok 347 | `apps/web/e2e/refino-visual.spec.ts:128` - `expect(mainPadding).toEqual({ left: gutter, right: gutter })`; `:147-150` - `{ size: '30px', weight: '500' }`; `:164` - `expect(actionsBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height)` | PASS |
| C7 | `EmptyState` com ícone 24 aria-hidden, título 16/500, descrição 14, ação opcional, `slot` e não-`Alert` | E2E `refino-visual.spec.ts -g empty_state_has_icon_title_description_and_slot` - ok 348; E2E `refino-visual.spec.ts -g empty_state_offers_an_action` - ok 359 | `apps/web/e2e/refino-visual.spec.ts:177` - `expect(empty.locator('[role="alert"]')).toHaveCount(0)`; `:183` - `expect([width, height]).toEqual([24, 24])`; `:187-190` - `{ size: '16px', weight: '500' }`; `:582` - `await expect(action).toBeVisible()`; `:584` - `await expect(link).toBeVisible()`; `:585` - `toHaveAttribute('href', '/students/new')` | PASS |
| C8 | `ListOrTable` cartões <768, `Table` ≥768, mesmos valores | E2E `refino-visual.spec.ts -g list_or_table_switches_at_768_with_the_same_values` - ok 349 | `apps/web/e2e/refino-visual.spec.ts:212` - `expect(cardStyles).toEqual({ radius: '16px', background: 'rgb(26, 26, 26)', padding: '12px' })`; `:224` - `expect(tableValues).toEqual(cardValues)` | PASS |
| C9 | cabeçalho 12 px uppercase `--muted-strong`/`--muted`, hover da linha, célula numérica | E2E `refino-visual.spec.ts -g table_header_hover_and_numeric_cell` - ok 350 | `apps/web/e2e/refino-visual.spec.ts:235-240` - `{ size: '12px', transform: 'uppercase' }`, `{ r: 212, g: 212, b: 212 }`; `:246` - `near(..., { r: 26, g: 26, b: 26, a: 128 })`; `:250-253` - `{ align: 'right', numeric: 'tabular-nums' }` | PASS |
| C10 | `Button busy` (spinner 16, aria-busy, desabilitado) e nenhum `disabled={isSubmitting}` | E2E `refino-visual.spec.ts -g form_submit_uses_busy_button` - ok 351; REPO `refino.test.ts -t no_screen_passes_disabled_is_submitting` - 1 passed | `apps/web/e2e/refino-visual.spec.ts:264-271` - `aria-busy`/`toBeDisabled()`/`width: '16px'`; `tests/repo/refino.test.ts:206` - `expect(read(path), path).not.toContain('disabled={isSubmitting}')` | PASS |
| C11 | `Input`/`Select`/`Button` outline em `--border-control` a 3:1 | E2E `refino-visual.spec.ts -g control_borders_are_border_control_and_reach_three_to_one` - ok 352; REPO `refino.test.ts -t border_control_reaches_three_to_one_on_card` - 1 passed | `apps/web/e2e/refino-visual.spec.ts:280-281` - `toMatchObject({ r: 107, g: 107, b: 107 })`, `expect(contrast(border, card)).toBeGreaterThanOrEqual(3)`; `tests/repo/refino.test.ts:232` - `expect(contrast(border, card)).toBeGreaterThanOrEqual(3)` | PASS |
| C12 | `pnpm verify` sai 0 e nenhuma dependência npm nova | `pnpm verify` - exit 0, 21/21 tarefas (19 em cache para os mesmos inputs; `web:build` executado fresco; ver `## Gate`); REPO `identidade.test.ts -t motion_is_the_only_added_dependency` - 1 passed | `tests/repo/identidade.test.ts:126` - `expect(declaring.sort()).toEqual(['apps/web/package.json', 'packages/ui/package.json'])` | PASS |
| C13 | texto do badge vem dos mapas de negócio, sem texto novo | REPO `refino.test.ts -t status_badge_text_comes_from_the_label_maps` - 1 passed | `tests/repo/refino.test.ts:246-263` - `expect(students.STATUS_LABELS).toEqual({...})` e os demais mapas; `:275` - `expect(badge, label).not.toContain(label)` | PASS |
| C14 | `/` com `data-type="place"`, três metas, 200 sem sessão, sem redirect | E2E `landing.spec.ts -g landing_declares_place_type_and_page_metas` - ok 175 | `apps/web/e2e/landing.spec.ts:36-37` - `expect(response?.status()).toBe(200)`, `redirectedFrom()` nulo; `:39` - `toHaveAttribute('data-type', 'place')`; `:45` - metas | PASS |
| C15 | `h1` e sub-linha literais, lidos de `SITE.hero` | E2E `landing.spec.ts -g hero_states_what_where_and_the_hours` - ok 176 | `apps/web/e2e/landing.spec.ts:51-52` - `expect(SITE.hero.title).toBe(HERO_TITLE)`; `:56` - `toHaveText(HERO_TITLE)`; `:57` - sub-linha | PASS |
| C16 | herói ≥900 px e `h2` seguinte abaixo de 900 | E2E `landing.spec.ts -g hero_fills_the_first_screen_and_the_next_h2_starts_below_it` - ok 177 | `apps/web/e2e/landing.spec.ts:66` - `expect(hero.height).toBeGreaterThanOrEqual(900)`; `:68` - `expect(nextHeadline.y).toBeGreaterThan(900)` | PASS |
| C17 | ordem herói/visita/academia/estrutura/planos/fecho/footer e `scroll-mt-24` | E2E `landing.spec.ts -g sections_follow_the_door_two_order` - ok 178 | `apps/web/e2e/landing.spec.ts:76` - `expect(ids).toEqual([null, ...SECTION_IDS])`; `:81` - `expect(margin.raw, id).toBe('96px')`; `:92` - `expect(footerAfterMain).toBe(true)` | PASS |
| C18 | cada seção entre 900 e 1800 px, footer ≤900 | E2E `landing.spec.ts -g each_section_is_one_to_two_screens_and_the_footer_is_short` - ok 179 | `apps/web/e2e/landing.spec.ts:102-103` - `toBeGreaterThanOrEqual(900)` e `toBeLessThanOrEqual(1800)`; `:106` - footer ≤900 | PASS |
| C19 | `#visita` 2ª, endereço 48 px linkado, horário e três rotas ≥44 px | E2E `landing.spec.ts -g visit_is_the_second_section_with_large_address_hours_and_routes` - ok 180 | `apps/web/e2e/landing.spec.ts:113` - `toHaveAttribute('id', 'visita')`; `:119` - `expect(fontSize).toBeGreaterThanOrEqual(48)`; `:121` - horário; `:134` - `height ≥ 44` | PASS |
| C20 | quatro fotos distintas, cada uma uma vez, nenhuma em visita/planos/fecho | E2E `landing.spec.ts -g four_photographs_each_once_and_none_in_visit_plans_or_close` - ok 181; E2E `landing.spec.ts -g about_photo_is_a_four_by_three_story_and_structure_pair_levels_the_tops` - ok 195 | `apps/web/e2e/landing.spec.ts:150` - `expect(photos).toHaveCount(4)`; `:152-153` - fontes na ordem e `Set` de 4; `:160` - `toHaveCount(0)` em `#visita`, `#planos`, `#fecho`; `:604` - `expect(await ratioOf(frame)).toBeCloseTo(4 / 3, 1)`; `:629` - `expect(box.width / box.height).toBeCloseTo(4 / 3, 1)`; `:631` - `expect(Math.abs(boxes[0]!.top - boxes[1]!.top), 'topos alinhados').toBeLessThanOrEqual(1)` | PASS |
| C21 | sem legenda; todo `img` com width/height/alt; prioridade do herói | E2E `landing.spec.ts -g photographs_have_no_caption_and_load_by_priority` - ok 182 | `apps/web/e2e/landing.spec.ts:166` - `expect(page.locator('figcaption')).toHaveCount(0)`; `:170-172` - width/height/alt (o logo novo do rodapé em `page.tsx:230` também tem os três); `:176-180` - `fetchpriority="high"`, sem `loading`, demais `lazy` | PASS |
| C22 | foto/faixa/régua: raio 0, chão plano, 1 px `--border`, sem `Panel`/cartão/sombra | E2E `landing.spec.ts -g place_language_has_square_photos_flat_ground_and_hairlines` - ok 183 | `apps/web/e2e/landing.spec.ts:191` - `expect(radius, selector).toBe('0px')`; `:199` - `expect(image).toBe('none')`; `:204` - `expect(shadows).toEqual([])`; `:222-223` - cor `BORDER` e raio 0 | PASS |
| C23 | nada anima em laço (sem carrossel/autoplay/selo) | E2E `landing.spec.ts -g nothing_loops_on_the_landing` - ok 184 | `apps/web/e2e/landing.spec.ts:231` - `toHaveCount(0)` para carousel/gallery/about-badge/autoplay; `:242` - `expect(running).toEqual([0, ...])` | PASS |
| C24 | hover da foto 1.03 na moldura, régua do título, botão -1 px e 0.98 pressionado | E2E `landing.spec.ts -g hover_and_press_answer_on_photos_titles_and_buttons` - ok 185; E2E `landing.spec.ts -g nav_word_draws_its_ruler_on_hover` - ok 194 | `apps/web/e2e/landing.spec.ts:255` - `toBeCloseTo(1.03, 2)`; `:264` - `expect.poll(...).toBeCloseTo(1, 2)`; `:270` - `toBe(Math.round(rest.y) - 1)`; `:275` - `matrix(0.98, ...)`; `:575` - `expect(scaleOf(rest.transform)).toBeCloseTo(0, 2)`; `:585` - `expect.poll(() => scaleOf((await ruler()).transform)).toBeCloseTo(1, 2)` | PASS |
| C25 | herói entra uma vez e o par desenvolve uma vez; reduced repousa | E2E `landing.spec.ts -g hero_enters_once_and_the_pair_develops_once` - ok 186; E2E `landing.spec.ts -g reduced_motion_rests_the_landing_at_the_final_state` - ok 187 | `apps/web/e2e/landing.spec.ts:313-315` - duração 250-350 ms; `:344-345` - 300-900 ms; `:354` - não reinicia; `:364-365` - reduced em estado final | PASS |
| C26 | `#planos` em réguas, sem preço, três features e "Matricule-se" | E2E `landing.spec.ts -g plans_are_a_ruled_block_without_a_price` - ok 188 | `apps/web/e2e/landing.spec.ts:390` - `toHaveText('Consulte na recepção')`; `:396` - `expect(text).not.toContain('R$')`; `:402-403` - `rules ≥ 3`; `:393` - `href /matricula` | PASS |
| C27 | `#fecho` na faixa do acento, 7:1, título e CTA | E2E `landing.spec.ts -g closing_band_uses_primary_and_meets_seven_to_one` - ok 189 | `apps/web/e2e/landing.spec.ts:410-411` - `rgb` LIME e INK; `:412` - título; `:441` - `expect(pair.ratio, pair.text).toBeGreaterThanOrEqual(7)` | PASS |
| C28 | barra fixa de 44 px segue o CTA do herói/seções; menu guarda o CTA da sessão | E2E `landing.spec.ts -g mobile_action_bar_follows_the_hero_and_section_ctas` - ok 190; E2E `landing-header.spec.ts -g mobile_header_has_logo_menu_button_and_session_cta_in_menu` - ok 166 | `apps/web/e2e/landing.spec.ts:456-464` - `href`, `env(safe-area-inset-bottom)`, altura 44; `:462` visível, `:467` escondida no fecho, `:472` ≥1024; `landing-header.spec.ts:166-168` - CTA no menu | PASS |
| C29 | mesma origem, zero `securitypolicyviolation` | E2E `landing.spec.ts -g landing_stays_same_origin_without_csp_violation` - ok 191 | `apps/web/e2e/landing.spec.ts:501` - `expect([...origins]).toEqual([new URL(baseURL!).origin])`; `:502` - violações `[]` | PASS |
| C30 | sem rolagem horizontal e mesmas bordas em 320/390/768/1024/1440 | E2E `landing.spec.ts -g no_horizontal_scroll_and_shared_edges_at_five_widths` - ok 192 | `apps/web/e2e/landing.spec.ts:507` - cinco larguras; `:511` - `expect(scroll).toBe(client)`; `:523-524` - bordas iguais às da cabeça | PASS |
| C31 | texto/URL/imagem de `SITE`, `kind: 'place'`, nav de quatro palavras, sem placeholders | REPO `identidade.test.ts -t site_content_has_the_door_two_shape` - 1 passed; REPO `identidade.test.ts -t landing_page_has_no_literal_text_in_jsx` - 1 passed; E2E `landing.spec.ts -g landing_logo_is_the_96_in_the_header_and_the_footer` - ok 193 | `tests/repo/identidade.test.ts:185` - `expect(SITE.kind).toBe('place')`; `:195-200` - `expect(SITE.nav).toEqual([...])`; `:210-213` - sem `tagline`/`scroll`/`gallery`; `:163`/`:169` - nenhum literal de texto; `apps/web/e2e/landing.spec.ts:539` - `expect(SITE.logo.src).toBe('/dukfit/logo-dukfit-96.webp')` | PASS |
| C32 | login com olho "Acesso ao sistema", "Sou aluno", `h1` e rótulos mantidos | E2E `login.spec.ts -g login_says_system_access_and_offers_student_entry` - ok 207 | `apps/web/e2e/login.spec.ts:16-17` - `toBeVisible()` e `fontSize '14px'`; `:18` - `href /primeiro-acesso`; `:22-25` - `h1`, E-mail, Senha, Entrar | PASS |
| C33 | `Button busy` no envio e "Senha definida" como `Alert` | E2E `login.spec.ts -g login_submit_is_busy_and_the_message_is_an_alert` - ok 208 | `apps/web/e2e/login.spec.ts:35-36` - `toHaveCount(1)` e texto do alerta; `:44-52` - `aria-busy`, desabilitado, spinner 16×16 | PASS |
| C34 | desfechos de primeiro acesso e senha são cartão com ícone/título/linha/link | E2E `refino-visual.spec.ts -g auth_success_states_are_cards_with_icon_title_line_and_back_link` - ok 353 | `apps/web/e2e/refino-visual.spec.ts:305-312` - card visível, ícone 24×24, título, mensagem preservada, `href /login`; `:314` - formulário ausente | PASS |
| C35 | quatro telas de entrada com moldura, marca, olho 14 px, `h1` 36 px e mesma largura | E2E `refino-visual.spec.ts -g auth_screens_keep_frame_brand_eyebrow_and_title_scale` - ok 354 | `apps/web/e2e/refino-visual.spec.ts:344-345` - `auth-photo` e `Brand`; `:349` - olho 14 px; `:352` - `h1` 36 px; `:357` - larguras iguais | PASS |
| C36 | portal com `Brand`/sair, foto 3:4 (120×160 e 96×128), nome 30/500 e badge | E2E `portal.spec.ts -g minha_conta_header_identity_photo_and_status_badge` - ok 312 | `apps/web/e2e/portal.spec.ts:86` - `[120, 160]`; `:90-93` - `{ size: '30px', weight: '500' }`; `:94` - `'Pendente'`; `:100` - `[96, 128]` | PASS |
| C37 | resumo com vencimento dd/mm/aaaa, plano, badge e link que rola | E2E `portal.spec.ts -g summary_card_shows_due_date_plan_badge_and_scroll_link` - ok 313 | `apps/web/e2e/portal.spec.ts:108` - `toHaveText('01/04/2026')`; `:110` - badge; `:113` - `href #historico`; `:116` - `toBeInViewport()` | PASS |
| C38 | vencimento passado e não pago usa `--status-bad` | E2E `portal.spec.ts -g overdue_summary_uses_status_bad` - ok 314 | `apps/web/e2e/portal.spec.ts:126` - `expect(await colorOf(due)).toMatchObject(RED)`; `:130` - badge em `RED`; `:133` - superfície alfa 36 | PASS |
| C39 | sem períodos: `EmptyState` com o título e sem resumo | E2E `portal.spec.ts -g without_enrollment_shows_empty_state_and_no_summary` - ok 315 | `apps/web/e2e/portal.spec.ts:142` - título; `:143` - `toHaveCount(0)` do resumo | PASS |
| C40 | histórico com 5 colunas, `R$ 1.234,56` à direita/tabular, badge e data do pagamento | E2E `portal.spec.ts -g history_has_value_column_tabular_money_and_payment_date` - ok 316 | `apps/web/e2e/portal.spec.ts:155` - colunas; `:162` - valor; `:163-166` - `right`/`tabular-nums`; `:169-171` - badge "Pago" e data | PASS |
| C41 | <768: cartões sem rolagem e formulário 1 coluna; ≥768: tabela e 2 colunas | E2E `portal.spec.ts -g portal_history_and_form_switch_at_768` - ok 317 | `apps/web/e2e/portal.spec.ts:187-188` - cartões visíveis e tabela oculta; `:189` - 1 coluna; `:194` - sem rolagem; `:198-200` - tabela e 2 colunas | PASS |
| C42 | moldura 3:4, pendência "Aguardando aprovação da recepção." e recorte 3:4 | E2E `portal.spec.ts -g photo_frame_pending_message_and_crop_are_three_by_four` - ok 318 | `apps/web/e2e/portal.spec.ts:216-217` - mensagem e sem envio; `:219` - razão 0,75; `:231-232` - recorte 3:4 | PASS |
| C43 | falha de perfil/pagamentos mantém cabeçalho/identidade e um `Alert` com retry | E2E `portal.spec.ts -g load_failure_keeps_header_identity_and_one_alert` - ok 319 | `apps/web/e2e/portal.spec.ts:240-243` - marca, sair, identidade e `role="alert"` 1; `:245` - "Tentar novamente"; `:258` - alerta some após recarregar | PASS |
| C44 | `loading.tsx` do portal com a geometria da tela e sem a shell da equipe | E2E `refino-visual.spec.ts -g portal_loading_matches_the_loaded_geometry_without_the_team_shell` - ok 355; REPO `refino.test.ts -t portal_loading_does_not_mount_the_team_shell` - 1 passed | `apps/web/e2e/refino-visual.spec.ts:376-377` - slots da shell ausentes; `:385` - gutters; `:387-388` - três cartões iguais; `tests/repo/refino.test.ts:290-294` - skeleton sem `AppLoading`/side/bottom | PASS |
| C45 | cartões com `Reveal` no stagger e botões `pressable`; reduced parado | E2E `portal.spec.ts -g portal_cards_reveal_and_buttons_press_and_rest_when_reduced` - ok 320 | `apps/web/e2e/portal.spec.ts:279` - stagger 40 ms ±17; `:290` - `matrix(0.98`; `:302` - reduced em `{ opacity: '1', transform: 'none' }` | PASS |
| C46 | sessão `student` sem link de equipe e só `/minha-conta*` autenticada | E2E `portal.spec.ts -g student_session_has_no_team_link` - ok 321; E2E `proxy.spec.ts -g student_session_reaches_only_portal_two_factor_and_public_pages` - ok 343 | `apps/web/e2e/portal.spec.ts:313` - nenhum href de `TEAM_ROUTES`; `:316-317` - sem header/side-nav; `apps/web/e2e/proxy.spec.ts:221` - redirect a `/minha-conta`; `:224-229` - públicas 200 | PASS |
| C47 | nas 20 telas: exatamente um `ScreenHeader`, `h2` 30/500, nenhum outro 30 px, gutter 16/32 | E2E `refino-visual.spec.ts -g every_shell_screen_has_one_screen_header_at_30px` - ok 356 | `apps/web/e2e/refino-visual.spec.ts:473` - `expect(THE_TWENTY).toHaveLength(20)`; `:481-484` - um header e `{ 'font-size': '30px', 'font-weight': '500' }`; `:493` - nenhum outro 30 px; `:503-506` - gutter 16 | PASS |
| C48 | saudação dentro do `ScreenHeader`, grade 1/2/3 e "Alunos" 48/600 | E2E `refino-visual.spec.ts -g dashboard_header_greeting_grid_and_student_number` - ok 357 | `apps/web/e2e/refino-visual.spec.ts:520-521` - header contém a saudação e é o primeiro bloco; `:526` - `{ 'font-size': '48px', 'font-weight': '600' }`; `:536-539` - colunas 1/2/2/3 | PASS |
| C49 | vazio do registro e vazio da busca com títulos diferentes | E2E `refino-visual.spec.ts -g empty_states_use_record_and_search_titles` - ok 358; E2E `refino-visual.spec.ts -g empty_state_offers_an_action` - ok 359 | `apps/web/e2e/refino-visual.spec.ts:550` - "Nenhum aluno cadastrado."; `:562` - "Nenhum aluno encontrado."; `:567` - "Nenhum funcionário cadastrado."; `:579` - o título do registro continua com a ação nova | PASS |
| C50 | `PAGE_BODY` corpo simples sem borda/raio, `Table` sem segundo cartão | REPO `refino.test.ts -t page_body_is_a_plain_body_container` - 1 passed; E2E `refino-visual.spec.ts -g list_tables_sit_in_a_plain_body_without_a_second_card` - ok 360 | `tests/repo/refino.test.ts:213` - `expect(body).toContain("export const PAGE_BODY = 'grid gap-6';")`; `:221` - o `data-slot` nas seis telas; `apps/web/e2e/refino-visual.spec.ts:608` - `{ display: 'grid', gap: '24px', borders: [...], radius: '0px' }` | PASS |
| C51 | `Table`/cartões com os mesmos campos, badge por situação, numérico à direita | E2E `refino-visual.spec.ts -g list_screens_use_table_and_cards_with_the_same_fields` - ok 361 | `apps/web/e2e/refino-visual.spec.ts:656` - `expect(tableValues, path).toEqual(cardValues)`; `:660-661` - badge por linha; `:669-672` - `right`/`tabular-nums` | PASS |
| C52 | um padrão de toolbar nas cinco listas (busca/datas rotuladas, Filtrar/Limpar, contagem) | E2E `refino-visual.spec.ts -g filter_toolbars_share_search_selects_reset_and_count` - ok 362 | `apps/web/e2e/refino-visual.spec.ts:686` - cinco telas; `:692-694` - Filtrar/Limpar/contagem; `:695-697` - busca/selects/datas | PASS |
| C53 | toda situação é `StatusBadge` do mapa da door 7 | E2E `refino-visual.spec.ts -g every_situation_is_a_status_badge` - ok 363 | `apps/web/e2e/refino-visual.spec.ts:710` - `toHaveCount(expected.length)`; `:712-713` - texto e `data-tone`; `:717-756` - as 9 telas/fichas | PASS |
| C54 | ficha do aluno: identidade acima, três grupos no mesmo cartão, situação visível | E2E `refino-visual.spec.ts -g student_record_identity_groups_and_visible_status` - ok 364 | `apps/web/e2e/refino-visual.spec.ts:775` - situação termina antes do primeiro `h3`; `:783-785` - três grupos; `:789-791` - visível a 1440×900 | PASS |
| C55 | "Acesso ao sistema" em cartão com a escala dos outros blocos | E2E `refino-visual.spec.ts -g staff_record_access_card_shares_the_title_scale` - ok 365 | `apps/web/e2e/refino-visual.spec.ts:805` - mesma escala do título; `:807-809` - mesma superfície/raio | PASS |
| C56 | formulário agrupado, marca de obrigatório, ≤640, `busy` e "Cancelar" | E2E `refino-visual.spec.ts -g forms_are_grouped_under_640px_with_required_marks_and_cancel` - ok 366 | `apps/web/e2e/refino-visual.spec.ts:820` - `width ≤ 640`; `:826-829` - 4 marcas e `required`; `:840-842` - `aria-busy`/disabled/spinner; `:851-854` - cancelar volta | PASS |
| C57 | `/privacy`: unidade dentro do campo, switch temático, uma linha de efeito | E2E `refino-visual.spec.ts -g privacy_retention_fields_show_unit_themed_switch_and_effect_line` - ok 367 | `apps/web/e2e/refino-visual.spec.ts:872-874` - unidade dentro da borda; `:878-883` - `role="switch"`, `aria-checked`; `:881` - zero checkbox; `:888` - duas linhas de efeito | PASS |
| C58 | `/account` com título no `ScreenHeader` e dois cartões de mesma largura | E2E `refino-visual.spec.ts -g account_has_screen_header_and_equal_cards` - ok 368 | `apps/web/e2e/refino-visual.spec.ts:900` - `h2` "Minha conta"; `:902-904` - dois cartões de larguras iguais; `:908` - título do cartão <30 px | PASS |
| C59 | `/check-in` com `Panel`, "Liberado" em `--status-ok` e `Alert` | E2E `refino-visual.spec.ts -g check_in_panel_status_ok_badge_and_alert` - ok 369 | `apps/web/e2e/refino-visual.spec.ts:931-934` - `rgb(15, 15, 15)` e raio 16; `:939-940` - `--status-ok`/superfície alfa 36; `:944-946` - `role="alert"` | PASS |
| C60 | `/plans`: valor à direita/tabular, regras ≤2 linhas, badge | E2E `refino-visual.spec.ts -g plans_value_is_tabular_rules_are_two_lines_and_status_is_a_badge` - ok 370 | `apps/web/e2e/refino-visual.spec.ts:959-962` - `right`/`tabular-nums`; `:965` - `-webkit-line-clamp: 2`; `:968` - altura ≤ 2 linhas + 32; `:969` - badge "Ativo" | PASS |
| C61 | um bloco que falha mostra um `Alert` e os outros continuam | E2E `refino-visual.spec.ts -g one_failed_block_shows_one_alert_and_keeps_the_others` - ok 371 | `apps/web/e2e/refino-visual.spec.ts:979-980` - um alerta e texto; `:982-986` - cabeçalho, identidade e as quatro regiões visíveis | PASS |
| C62 | hover/press dos cartões, links, botões e linhas; reduced parado | E2E `refino-visual.spec.ts -g team_hover_and_press_match_the_landing_motion` - ok 372 | `apps/web/e2e/refino-visual.spec.ts:1002` - `matrix(1, 0, 0, 1, 0, -2)`; `:1011` - régua `matrix(1, 0, 0, 1, 0, 0)`; `:1017` - linha alfa 128; `:1028` - press 0.98; `:1038-1044` - reduced `none` | PASS |
| C63 | impressão branca/preto e as duas rotas `/print` mantêm o layout | E2E `identidade.spec.ts -g print_media_resets_the_palette_to_white_and_black` - ok 157; E2E `privacy-print.spec.ts -g student_print_sections_dates_photos_empty_and_print_button` - ok 330; E2E `privacy-print.spec.ts -g staff_print_sections_user_and_photos` - ok 333 | `apps/web/e2e/identidade.spec.ts:395-401` - `rgb(255, 255, 255)`/`rgb(0, 0, 0)` nas três rotas; `apps/web/e2e/privacy-print.spec.ts:42-43` - títulos das seções; `:132` - seções do funcionário; `:62-63` - botão Imprimir | PASS |
| C64 | `pnpm verify` 0; 22 rotas sem rolagem a 360/1440; 30 px e gutters | `pnpm verify` - exit 0, 21/21 tarefas (ver `## Gate`); E2E `refino-visual.spec.ts -g shell_screens_keep_no_horizontal_scroll_and_the_pinned_title_and_gutters` - ok 373; E2E `dukfit.spec.ts -g inner_screens_have_30_medium_title_and_dark_panels` - ok 131 | `apps/web/e2e/refino-visual.spec.ts:1051` - `expect(SHELL_ROUTES).toHaveLength(22)`; `:1065` - sem rolagem; `:1067-1071` - gutters 16/32; `:1081` - título 30/500; `apps/web/e2e/dukfit.spec.ts:730-731` - `30px`/`500` | PASS |
| C65 | 12 segmentos com `AppLoading` (e o portal fora dele) | REPO `motion.test.ts -t twelve_segments_have_app_loading` - 1 passed | `tests/repo/motion.test.ts:121` - `expect(SEGMENTS).toHaveLength(12)`; `:124` - `expect(all.map(...)).toEqual([...SEGMENTS, 'minha-conta'])` | PASS |
| C66 | corte de perfil mantido e equipe em `/minha-conta` vai ao painel | E2E `shell.spec.ts -g students_link_for_all_four_roles` - ok 376; E2E `proxy.spec.ts -g staff_session_on_minha_conta_redirects_to_dashboard` - ok 344 | `apps/web/e2e/shell.spec.ts:39` - link Alunos para os 4 papéis; `:41` - `expect(roles).toHaveLength(4)`; `apps/web/e2e/proxy.spec.ts:239` - `toHaveURL('/dashboard')` | PASS |
| C67 | ações destrutivas confirmam em `Dialog` com o nome do titular | E2E `students.spec.ts -g inactivate_and_suspend_confirm_naming_the_student` - ok 467; E2E `plans.spec.ts -g inactivate_confirms_naming_the_plan_then_deletes_and_goes_to_the_list` - ok 303; E2E `privacy-block.spec.ts -g anonymize_dialog_text_and_cancel_sends_nothing` - ok 325 | `apps/web/e2e/students.spec.ts:481` - diálogo contém "Joana Confirmada"; `:487` - cancelar não envia; `apps/web/e2e/plans.spec.ts:321` - contém "Semestral Família"; `apps/web/e2e/privacy-block.spec.ts:122-123` - cancelar sem POST | PASS |
| C68 | validação RHF/Zod, `aria-invalid` ligado ao `path`, foco no primeiro inválido | E2E `forms.spec.ts -g field_errors_shown_on_four_forms` - ok 136; E2E `login.spec.ts -g empty_login_is_rejected_before_any_request` - ok 212 | `apps/web/e2e/forms.spec.ts:18` - `toHaveAccessibleDescription(message)`; `:19` - a mensagem só no campo; `apps/web/e2e/login.spec.ts:125-128` - erros acessíveis e nenhuma request | PASS |
| C69 | baseline C39 regravado e igual em 22 rotas + `/` (texto, ARIA, 40 Tabs) | E2E `motion.spec.ts -g copy_names_and_focus_order_match_the_baseline` - ok 249 | `apps/web/e2e/motion.spec.ts:906` - `expect(SHELL_PATHS).toHaveLength(22)`; `:925` - mesmas chaves; `:927-929` - texto, ARIA e foco iguais; o baseline em `e2e/fixtures/motion-baseline/{1440,390}.json` foi regravado em `a39dbf7` e a única diferença no JSON do round 2 é o `img "DUK FIT Academia"` dentro de `contentinfo` (`page.tsx:230`); `support/motion.ts` não mudou | PASS |
| C70 | provas reescritas verdes no texto novo (nav de 4 palavras, menu com CTA, landing sem shell/CSP, 26 telas) | E2E `landing-header.spec.ts -g desktop_header_has_logo_four_section_links_and_session_cta` - ok 165; E2E `dukfit.spec.ts -g landing_has_no_shell_no_external_request_and_no_csp_violation` - ok 126; E2E `identidade.spec.ts -g every_screen_keeps_its_copy_and_arrangement` - ok 156 | `apps/web/e2e/landing-header.spec.ts:127-133` - quatro palavras e hrefs; `:134-136` - CTA da sessão; `apps/web/e2e/dukfit.spec.ts:627-642` - um banner, navegações da landing e zero CSP; `apps/web/e2e/identidade.spec.ts:339` - `expect(SCREENS).toHaveLength(26)` e `:365-379` - cópia/disposição | PASS |

## Coverage

Recomputada da autoridade de cada conjunto no `HEAD` novo. As linhas cuja autoridade o fix tocou
(doors 3, 4, 6 e 7, o texto de lista do skill e a ação do `EmptyState`) foram recomputadas em
`a39dbf7` e têm a prova nova; as demais foram reexecutadas e **carregam o veredito do round 1**
(`carried from ac39d9d`). Todas as células `Unproven` estão vazias.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `Landing` doors (7) - recomputed at a39dbf7 (doors 3, 4, 6, 7) | `plan.md:104-112` | door 1 C1 C2 C3 C5 C11 (`carried from ac39d9d`) · door 2 C14 C15 C16 C17 C18 C19 C26 C27 C31 (`carried from ac39d9d`) · door 3 C20 C21 C31 + `landing_logo_is_the_96_in_the_header_and_the_footer` (`landing.spec.ts:530`) + `about_photo_is_a_four_by_three_story_and_structure_pair_levels_the_tops` (`landing.spec.ts:589`) · door 4 C22 + `about_photo...` · door 5 C28 (`carried from ac39d9d`) · door 6 C23 C24 C25 + `nav_word_draws_its_ruler_on_hover` (`landing.spec.ts:550`) · door 7 C4 C6 C7 C8 C9 C10 C41 C51 C53 + `empty_state_offers_an_action` (`refino-visual.spec.ts:571`) | - |
| `Landing` sections (7) - carried from ac39d9d | `plan.md:107` (ordem) e `page.tsx:74-262` | `hero` C15 C16 · `#visita` C19 · `#academia` C20 + story (`landing.spec.ts:604`) · `#estrutura` C20 C25 + pair (`landing.spec.ts:629-631`) · `#planos` C26 · `#fecho` C27 · `footer` C17 + logo (`landing.spec.ts:534-545`) | - |
| landing photographs (4) - carried from ac39d9d | `plan.md:108` | `salao-cardio-1600` C20 C21 · `musculacao-440` C20 C21 · `cardio-440` C20 C21 · `amanhecer-440` C20 C21 | - |
| landing logo (1) - recomputed at a39dbf7 | `plan.md:108` | `logo-dukfit-96.webp` no cabeçalho (`site-header.tsx:131`) e no rodapé (`page.tsx:230`) -> `landing_logo_is_the_96_in_the_header_and_the_footer` (`landing.spec.ts:530-548`, ok 193) | - |
| landing compositions (2) - recomputed at a39dbf7 | `plan.md:108-109`; `checks.md:72,89` | `story` 4:3 + texto ao lado -> `about_photo...` (`landing.spec.ts:601-611`); `pair` mesmo ratio/topos -> `about_photo...` (`landing.spec.ts:615-633`) | - |
| landing type rules (2) - recomputed at a39dbf7 | `checks.md:72` (skill: momento de tipo e texto de lista 16 px) | momento de tipo C19 (`landing.spec.ts:119`); texto de lista 16/24 -> `landing_list_text_is_sixteen` (`landing.spec.ts:636-668`, ok 196) | - |
| status tokens (11) - carried from ac39d9d | `plan.md:106` | 11 tokens -> C1; contraste C5; borda de controle C11 | - |
| `StatusBadge` map (27) - carried from ac39d9d | `plan.md:112` | C4, table-driven sobre os 27 | - |
| screens with `ScreenHeader` (20) - carried from ac39d9d | `plan.md:196` + derivação `checks.md:123-128` | C47, table-driven sobre `THE_TWENTY` (`refino-visual.spec.ts:419-440`) | - |
| shell routes for no horizontal scroll (22) - carried from ac39d9d | `SCREENS` com `shell: true` (`identidade.ts:113-383`) | C64, table-driven sobre `SHELL_ROUTES` (20 + 2 print) | - |
| print routes (2) - carried from ac39d9d | `plan.md:212`; `SCREENS` | `/students/<id>/print` C63 · `/staff/<id>/print` C63 | - |
| `loading.tsx` segments (13) - carried from ac39d9d | AD-101 + C44/C65 | C65 conta os 12 `AppLoading` + `minha-conta`; C44 prova o esqueleto do portal | - |
| auth screens (4) - carried from ac39d9d | `plan.md:172-175` | `/login` C32 C33 · `/primeiro-acesso` C34 C35 · `/esqueci-senha` C34 C35 · `/definir-senha` C35 | - |
| `EmptyState` branches (2) - recomputed at a39dbf7 | `plan.md:130`; `checks.md:446` | descrição opcional C7 (`refino-visual.spec.ts:192-196`); ação opcional -> `empty_state_offers_an_action` (`refino-visual.spec.ts:571-586`, ok 359) | - |
| breakpoints measured (5) - carried from ac39d9d | plan AC 29 (`plan.md:161`) | 320 C30 · 390 C6 C36 · 768 C41 C51 · 1024 C28 C47 · 1440 C16 C18 C47 | - |
| rewritten proofs (10) - carried from ac39d9d | `checks.md:27-38` | C69 C70, table-driven sobre as 10 linhas | - |
| startup config (0) - carried from ac39d9d | `plan.md:83-85` | n/a - nenhum módulo, guarda ou variável de ambiente nova | - |
| `Observable` rows (22) - carried from ac39d9d | `plan.md:256-279` | `unauthorised` / C14 · densidade C16 C17 C18 · hover/motion C23 C24 C25 · próximo C19 C26 C27 C28 · login C32 C33 C35 · senhas C34 C35 · minha-conta C39 C43 C44 C46 · shell C47 C49 C50 C51 C52 C53 C61 C65 C66 · confirmação C67 · validação C68 · impressão C63 | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decisão renderizada no navegador | `screen-header.tsx`, `status-badge.tsx`, `empty-state.tsx`, `list-or-table.tsx`, `table.tsx`, toolbar, landing e portal | uma prova no limite do navegador, um caso por ramo (breakpoint 767/768 e 1023/1024, variante de situação, carga/falha/vazio) | yes - breakpoints C8/C41/C47/C51/C28, variantes C4/C53, estados C43/C49/C59 e o ramo de ação do `EmptyState` em `empty_state_offers_an_action` (C7/C49) |
| Regra estrutural sobre arquivos | tokens, grep de hex, mapa de status, `SITE`, `PAGE_BODY`, `disabled={isSubmitting}`, `loading.tsx` | uma prova de repositório, table-driven sobre o conjunto inteiro com o tamanho declarado | yes - `refino.test.ts` (11 tokens, 27 pares, árvores de `apps/web/src`), `identidade.test.ts` (`SITE`, dependência), `motion.test.ts` (12 segmentos) |
| Regra de CSS | tokens de status, contraste, `prefers-reduced-motion` | uma prova de repositório para o literal e uma no navegador para o valor computado | yes - C1/C5/C11 na camada de repositório e C4/C9/C24/C45/C62 na camada de navegador |
| Instrumentação | `Button busy`, `Table`, `AppLoading`, `Reveal`/`Stagger` | nenhuma prova própria além da linha estrutural | yes - cobertos pelos consumidores (C10, C9, C65, C45) |

## Faults injected

Cinco mutações em `git worktree add .turbo/verifier-r2-refino/scratch HEAD` (`a39dbf7`), uma por
superfície de asserção criada ou tocada pelo fix, injetadas juntas e rodadas numa única invocação das
cinco provas que as cobrem (cada mutação derrubou a prova da sua própria superfície; log
`.turbo/verifier-r2-refino/mutants.log`). O worktree foi descartado e o `git status --porcelain` da
árvore real ficou igual ao baseline registrado antes das mutações (4 untracked pré-existentes).

| Mutation | Location | Killed |
| --- | --- | --- |
| `SITE.logo.src` volta para `logo-dukfit-512.webp` (logo da door 3) | `apps/web/src/app/site-content.ts:15` | yes - `E2E landing.spec.ts -g landing_logo_is_the_96_in_the_header_and_the_footer` exit 1, falha em `landing.spec.ts:539` (src `logo-dukfit-512.webp`) |
| `after:duration-200` -> `after:duration-700` (régua `::after` da palavra da navegação) | `apps/web/src/components/landing/rule-link.ts:14` | yes - `E2E landing.spec.ts -g nav_word_draws_its_ruler_on_hover` exit 1, falha em `landing.spec.ts:581` (700 ms contra o limite 250 ms) |
| `aspect-[4/3]` -> `aspect-square` nas fotos do `pair` (razão 4:3 do par) | `apps/web/src/components/landing/develop-pair.tsx:67` | yes - `E2E landing.spec.ts -g about_photo_is_a_four_by_three_story_and_structure_pair_levels_the_tops` exit 1, falha em `landing.spec.ts:629` (par 0) |
| `canWriteStudents(role)` -> `false` no vazio de `/students` (ação do `EmptyState`) | `apps/web/src/app/students/students-list.tsx:110` | yes - `E2E refino-visual.spec.ts -g empty_state_offers_an_action` exit 1, falha em `refino-visual.spec.ts:582` (ação ausente) |
| `text-base leading-6` -> `text-sm leading-6` nos itens da estrutura/diferenciais (texto de lista 16/24) | `apps/web/src/app/page.tsx:165,193` | yes - `E2E landing.spec.ts -g landing_list_text_is_sixteen` exit 1, falha em `landing.spec.ts:657` (14 px contra o mínimo 16) |

## Precision gaps

Findings sobre os checks, não sobre o produto; nenhum deixa célula de cobertura em aberto.

- C48 (`carried from ac39d9d`): o teste afirma que o `ScreenHeader` contém a saudação e é o primeiro
  bloco (`refino-visual.spec.ts:520-521`), mas não afirma que ela não precede o título; na
  implementação a saudação é o `eyebrow`, renderizado acima do `h2` (`screen-header.tsx:22-31`,
  `dashboard/page.tsx:155-159`). Superfície intocada pelo fix.
- C51 (`carried from ac39d9d`): a prosa pede alinhamento numérico "em valores e contagens"; a prova
  mede só o valor de `/payments` (`refino-visual.spec.ts:669-672`). Contagens aparecem em C48/C52,
  mas sem a mesma asserção. Superfície intocada pelo fix.
- C28 (`carried from ac39d9d`): a prosa diz "some enquanto um CTA de seção está visível"; a prova
  cobre só o CTA do `#fecho` (`landing.spec.ts:466-467`). O `#planos` também tem um
  `data-slot="section-cta"` (`plans-pricing.tsx:40`) e não é exercitado. Superfície intocada pelo fix.
- Novo, da superfície tocada pela door 6: a régua da palavra da navegação usa
  `after:transition-transform` com `after:duration-200` (`rule-link.ts:14`) e não tem variante
  `motion-reduce`; o bloco `@media (prefers-reduced-motion: reduce)` de `globals.css` cobre
  `.link-rule::after`, `.pressable`, `.lift` e `.button-lift`, mas não a classe nova. A prova nova
  mede a régua no hover e não emula `reducedMotion`. É a mesma classe da transição de cor que a
  palavra da navegação já tinha antes do fix (`transition-colors`), e nenhum check do round 1 media
  reduced motion para o hover da landing (C25 cobre herói/par e C62 cobre o app); fica registrado
  como precisão a fechar em rodada futura, não como elemento sem prova.

## Carried judgments (round 1)

- **Provas reapontadas sem remover cláusula** (`carried from ac39d9d`): `students.spec.ts`,
  `audit.spec.ts`, `privacy-settings.spec.ts` e `motion.spec.ts` trocam só nome/role do alvo
  (`Buscar` -> `Filtrar`, `Limpar filtros` -> `Limpar`, `checkbox` -> `switch` com `aria-checked`,
  apresentação visível na `motion`); a asserção de fundo continua a mesma. O fix do round 2 não tocou
  esses arquivos.
- **`LANDING_EXCLUDED` e o baseline C39** (`carried from ac39d9d`, reconferido em `a39dbf7`):
  `support/motion.ts` não mudou no fix e a barra de ação continua fora do baseline por depender da
  rolagem (C28 cobre a regra); `#planos` continua dentro. No round 2 o baseline foi regravado sobre
  `a39dbf7` e a única diferença nos dois JSON é a ARIA do logo novo no rodapé
  (`e2e/fixtures/motion-baseline/{1440,390}.json`, 1 linha cada: `img "DUK FIT Academia"` dentro de
  `contentinfo`); texto de `main` e sequência de 40 Tabs idênticos, e a prova sem `record` passa
  (`motion.spec.ts:900-931`, ok 249).

## Walk

Step 5 do `verify.md` não foi executado: não há humano nesta sessão. O fluxo é coberto pelas provas de
navegador da suíte completa (489 E2E, 0 falhas), incluindo as telas tocadas pelo fix.

## Gate

- `pnpm --filter @academia/repo-tests exec vitest run refino.test.ts identidade.test.ts motion.test.ts --reporter=verbose` em `a39dbf7` - **44 passed, 0 failed**.
- `pnpm --filter @academia/web exec playwright test` (suíte completa, 37 arquivos) em `a39dbf7` - **489 passed, 0 failed** (11,4 min; log `.turbo/verifier-r2-refino/e2e-full-head.log`; inclui os 5 checks novos, a baseline C39 e as 18 provas da landing).
- `pnpm verify` com o arranjo de ambiente do harness (`TEMP`/`TMP` em `.turbo/tmp`, ponte TCP do Docker em `127.0.0.1:2376`, junction de `ms-playwright`) em `a39dbf7` - **exit 0, 21/21 tarefas** (`VERIFY_EXIT=0`, log `.turbo/verifier-r2-refino/verify-head.log`; 19 tasks em cache para os inputs do fix, `@academia/web:build` executou fresco, e as suítes E2E de 489 testes foram executadas por este Verifier em separado, como acima).
- Falhas injetadas: **5 aplicadas, 5 mortas, 0 vivas** (uma por superfície nova: logo, régua do nav, razão/topos do pair, ação do `EmptyState`, 16/24 do texto; log `.turbo/verifier-r2-refino/mutants.log`).
- Gate do Verifier: **PASS** - 70/70 checks com citação `file:line`, nenhuma célula `Unproven`/`Uncovered`, `Killed: yes` nas 5 falhas e `pnpm verify` exit 0. Round 1 fechado em `a39dbf7`; as 3 precision gaps e a precisão nova da régua ficam registradas acima, sem gap de check ou de cobertura.
