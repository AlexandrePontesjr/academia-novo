# DukFit app checks

Profile: ui
Plan: `.specs/features/dukfit-app/plan.md`

46 checks in 6 slices · 4 one-way doors · 1 open, of which 0 block (1 `blocks go-live`).

Scope guard: the checks below are the plan's AC 1 a AC 50, the four doors of `Landing`, the three
routes of `Surface` and every row of `Observable`. Nada fora disso entra no build.

Proof commands. `E2E` = `pnpm --filter @academia/web exec playwright test`; `API` =
`pnpm --filter @academia/api exec vitest run`; `REPO` = `pnpm --filter @academia/repo-tests exec vitest run`.
Viewports: celular 390×844 e 360×800, computador 1440×900 (o padrão do Playwright, 1280×720, é
computador).

## Binding sources

| Source | What it decides |
| --- | --- |
| mockup de três telas (imagem 1 do pedido de 2026-10-19) | cabeçalho com avatar 44 px, nome e "Level"; botão quadrado do sino; `Panel` com título e ↗; medidor de marcas; pílulas com ponto lime; dois `MetricTile`; barras semanais lime/laranja/cinza; barra inferior de 5 abas com a ativa em #1f1f1f; botão flutuante lime quadrado |
| prancha de telas (imagem 2 do pedido) | tela "Welcome Back" (título, campos com ícone, botão lime de largura total); telas de onboarding (título forte, texto, botão lime) que viram as seções da landing |
| `plan.md` `## De-para` e os hexes/medidas dos AC 1 a AC 50 | os valores exatos que os checks afirmam |

## Supersedes

Esta feature muda, com aprovação do plano em 2026-10-19, requisitos de features anteriores. As
provas abaixo deixam de valer como estavam e são reescritas para o requisito novo, no mesmo commit
da mudança; nenhuma é apagada nem enfraquecida no que ainda vale:

- `identidade-visual` C4 (cabeçalho #141414 com borda inferior, links de texto), C5 e C9 (`h1`
  "Entrar" e textos do `/login`), C8 (painel em `/`), C3 só no raio dos cartões do painel (16 px
  vira 24 px) e C22 na lista de telas (`/` vira `/dashboard`, `h1` do shell "Gestão de Academia"
  vira "DukFit", `h1` do `/login` vira "Bem-vindo de volta").
- `identidade-visual` C9 e C24: as marcas lime e as barras do de-para (pontos das pílulas e do menu,
  rótulos de `MetricTile`, "Fit" da marca, ícone ativo, medidor e barras) passam a ser permitidas
  pelo seletor `data-slot` delas; todo o resto continua proibido como antes.
- `dashboard`: a lista de cards ganha "Check-ins da semana" depois de "Check-ins de hoje" (7, 6, 5 e
  1 cards por perfil); `GET /api/dashboard` em `/` vira `/dashboard`; as asserções `checkIns` `toEqual({ count })`
  passam a afirmar `count` e `lastSevenDays` (door 2).
- `auth-rbac`/`fundacao`: o destino depois do login e do 2FA, e do logado que abre `/login`, passa de
  `/` a `/dashboard` (door 1); o título "Gestão de Academia" vira "DukFit".
- `auth-rbac` (`login.spec.ts`): o perfil no cabeçalho passa a ser lido como "Perfil: <perfil>" (AC 2).

## Checks

### S1 - Shell DukFit no celular e no computador · shell, nav, `@academia/ui` · 12 files · 45 KB · ~11k

**C1** - The document `<title>` of `/`, `/login` and `/students` is "DukFit", and the shell, `/login` and the landing each show the wordmark "DukFit" (AC 1)
Proof: `E2E e2e/dukfit.spec.ts -g "title_and_wordmark_are_dukfit_on_shell_login_and_landing"`

**C2** - The shell header shows a 44×44 px avatar with `border-radius` 50% and text "MD" for "Marina Duarte" and "A" for a one-word name, the user's name, and "Perfil: <perfil>" for each of the four roles (AC 2)
Proof: `E2E e2e/dukfit.spec.ts -g "header_shows_avatar_initials_name_and_profile_for_four_roles"`

**C3** - At 390×844, for the admin, the bottom navigation is visible, fixed at the bottom, background rgb(20, 20, 20), radius 24px, with exactly 5 links/buttons, and the side navigation is not visible (AC 3)
Proof: `E2E e2e/dukfit.spec.ts -g "mobile_shows_the_fixed_bottom_nav_with_five_items_and_no_side_nav"`

**C4** - The bottom navigation items, in order, are: admin `Início, Alunos, Check-in, Pagamentos, Mais`; hr_finance `Início, Alunos, Pagamentos, Planos, Mais`; reception `Início, Alunos, Check-in, Planos, Mais`; instructor `Início, Alunos, Mais` plus no slot the profile cannot open (AC 4)
Proof: `E2E e2e/dukfit.spec.ts -g "bottom_nav_items_follow_the_priority_for_four_roles"`

**C5** - On `/students` the "Alunos" item of the visible navigation has `aria-current="page"`, background rgb(31, 31, 31) and icon color rgb(205, 247, 32), and "Início" has none of the three, at 390×844 and at 1440×900 (AC 5)
Proof: `E2E e2e/dukfit.spec.ts -g "active_nav_item_has_aria_current_dark_pill_and_lime_icon"`

**C6** - Activating "Mais" in the bottom navigation or the header menu button opens a dialog listing every link the profile may open plus "Minha conta" and "Sair", for admin (11 links + Sair) and instructor (Início, Alunos, Minha conta + Sair) (AC 6)
Proof: `E2E e2e/dukfit.spec.ts -g "more_menu_lists_every_allowed_link_account_and_sign_out"`

**C7** - At 1440×900 the side navigation is visible, 256 px wide, with the wordmark, every link the admin may open (with an `svg` icon each) and "Sair", and the bottom navigation is not visible (AC 7)
Proof: `E2E e2e/dukfit.spec.ts -g "desktop_shows_the_side_nav_with_every_link_and_no_bottom_nav"`

**C8** - For admin and reception the shell shows a link named "Registrar check-in" to `/check-in`, 56×56 px, background rgb(205, 247, 32), radius 16px (AC 8)
Proof: `E2E e2e/dukfit.spec.ts -g "fab_links_to_check_in_for_admin_and_reception"`

**C9** - For hr_finance and instructor no "Registrar check-in" link exists in the page (AC 9)
Proof: `E2E e2e/dukfit.spec.ts -g "fab_is_absent_for_hr_finance_and_instructor"`

**C10** - At 390×844 `main` has 16px left and right padding, and scrolled to the bottom, the bottom of `main`'s last child is above the top of the bottom navigation (AC 10)
Proof: `E2E e2e/dukfit.spec.ts -g "mobile_main_has_sixteen_gutter_and_clears_the_bottom_nav"`

**C11** - At 360×800 and at 1440×900, `document.documentElement.scrollWidth` equals `clientWidth` on each of the 21 shell screens (AC 11)
Proof: `E2E e2e/dukfit.spec.ts -g "no_horizontal_scroll_on_shell_screens_at_360_and_1440"`

### S2 - Painel no de-para · `app/dashboard`, componentes do painel · 6 files · 40 KB · ~10k

**C12** - `/dashboard` renders, for each role, exactly the card titles the API returns (instructor: Alunos; admin: the six of today), each a `region` with background rgb(20, 20, 20) and radius 24px (AC 12)
Proof: `E2E e2e/dukfit.spec.ts -g "dashboard_panels_follow_the_response_with_dark_surface_and_24_radius"`
Proof: `E2E e2e/dashboard.spec.ts -g "cards_by_role"`

**C13** - The "Alunos" panel has a link named "Ver alunos" to `/students` and the "Check-ins de hoje" panel a link named "Ver presenças de hoje" to `/check-ins`, each 32×32 px with border rgb(38, 38, 38) and an `svg` arrow (AC 13)
Proof: `E2E e2e/dukfit.spec.ts -g "panel_arrow_links_keep_the_accessible_names_and_32_size"`

**C14** - With `lastSevenDays` counts `[2,0,5,10,8,3,4]` and `count: 4`, the gauge has 40 ticks of which 16 are rgb(205, 247, 32) and 24 rgb(64, 64, 64), shows "4" in the center and "07/10/2026" in the pill; with all counts 0, 0 ticks are lime (AC 14)
Proof: `E2E e2e/dukfit.spec.ts -g "gauge_lights_ticks_in_proportion_to_the_week_max"`

**C15** - With `lastSevenDays` from 2026-10-01 to 2026-10-07, the week panel shows 7 columns labeled `QUI, SEX, SÁB, DOM, SEG, TER, QUA` with the counts above each, in that order (AC 15)
Proof: `E2E e2e/dukfit.spec.ts -g "week_bars_label_weekdays_oldest_first_with_counts"`

**C16** - With counts `[10, 9, 8, 1, 0, 10, 5]` the bar colors are lime, lime, orange rgb(245, 158, 11), orange, gray rgb(64, 64, 64), lime, orange (boundaries 0.9×max inclusive, 0 gray) (AC 16)
Proof: `E2E e2e/dukfit.spec.ts -g "week_bar_colors_follow_the_ninety_percent_rule"`

**C17** - The "Alunos" panel shows "Ativos" 31 as main number and "Inativos" 4 and "Suspensos" 2 as pills with background rgb(31, 31, 31) and a rgb(205, 247, 32) dot (AC 17)
Proof: `E2E e2e/dukfit.spec.ts -g "students_panel_main_number_and_two_pills"`
Proof: `E2E e2e/dashboard.spec.ts -g "students_card_three_labelled_counts_zeros_and_ver_alunos_link"`

**C18** - Each of Ativas, Agendadas, Pendentes, Atrasados renders as a tile with background rgb(26, 26, 26), label rgb(205, 247, 32), value `font-size` 24px with `tabular-nums`, and Pendentes/Atrasados link to `/payments?status=pending` / `/payments?status=overdue` (AC 18)
Proof: `E2E e2e/dukfit.spec.ts -g "metric_tiles_for_enrollments_and_payments"`
Proof: `E2E e2e/dashboard.spec.ts -g "payments_card"`

**C19** - At 390×844 the expiring and by-plan panels have no `table` visible and show one row per item with the same texts; at 1440×900 the `table` is visible (AC 19)
Proof: `E2E e2e/dukfit.spec.ts -g "lists_are_rows_on_mobile_and_tables_from_768"`

**C20** - With `GET /api/dashboard` answering 500, `/dashboard` shows "Não foi possível carregar o painel." inside the shell (header visible) (AC 20)
Proof: `E2E e2e/dukfit.spec.ts -g "dashboard_load_error_keeps_the_shell"`
Proof: `E2E e2e/dashboard.spec.ts -g "load_failure_500_and_403"`

**C21** - With empty `expiringSoon.items` and `byPlan`, the panels show "Nenhum vencimento nos próximos 7 dias." and "Nenhuma matrícula ativa." (AC 21)
Proof: `E2E e2e/dashboard.spec.ts -g "empty"`

**C22** - At 1440×900 the panels' container has 3 grid columns; at 390×844, 1 column (AC 22)
Proof: `E2E e2e/dukfit.spec.ts -g "dashboard_grid_three_columns_on_desktop_one_on_mobile"`

**C23** - On `/dashboard` with `payments.overdue: 4` the menu button has an 8×8 px rgb(205, 247, 32) dot and the accessible description "Há pagamentos atrasados"; with `overdue: 0`, and on `/students`, no dot (AC 23)
Proof: `E2E e2e/dukfit.spec.ts -g "menu_button_dot_only_on_dashboard_with_overdue"`

### S3 - Série semanal no contrato · `packages/contracts`, `apps/api/src/dashboard` · 3 files · 14 KB · ~4k

**C24** - With check-ins on 2026-10-01 (×2), 2026-10-04 (×1) and 2026-10-07 (×3) and today 2026-10-07, admin and reception get `lastSevenDays` with 7 items from 2026-10-01 to 2026-10-07 and counts `[2,0,0,1,0,0,3]` (AC 24, AC 25, door 2)
Proof: `API test/dashboard.test.ts -t "last_seven_days_has_seven_days_oldest_first_with_zeros"`

**C25** - A check-in on 2026-09-30 (8 days before) counts in no item, and one on 2026-10-08 counts in none (AC 24)
Proof: `API test/dashboard.test.ts -t "last_seven_days_leaves_out_days_outside_the_window"`

**C26** - At BEFORE_TURN and AFTER_TURN of São Paulo midnight, the last item's `day` equals `today` and its `count` equals `checkIns.count` (AC 26)
Proof: `API test/dashboard.test.ts -t "last_seven_days_last_item_is_today_and_equals_count_across_the_turn"`

**C27** - For hr_finance and instructor the JSON body does not contain the string `lastSevenDays`; the response passes `dashboardResponseSchema` for the four roles and a 6- or 8-item series fails it (AC 27, door 2)
Proof: `API test/dashboard.test.ts -t "last_seven_days_absent_for_profiles_without_check_ins"`
Proof: `pnpm --filter @academia/contracts exec vitest run -t "dashboard_check_ins_series_has_exactly_seven_items"`

**C28** - Without session `GET /api/dashboard` answers 401 `application/problem+json` (AC 28)
Proof: `API test/dashboard.test.ts -t "anonymous_401_unauthorized"`

### S4 - Landing em `/` · `app/page.tsx`, `site-content.ts`, `proxy.ts` · 4 files · 15 KB · ~4k

**C29** - Without session `GET /` answers 200 with no redirect (final URL `/`) and the landing's `h1` (AC 29, door 1)
Proof: `E2E e2e/dukfit.spec.ts -g "landing_is_public_200_without_redirect"`

**C30** - The landing shows, in DOM order, the hero `h1` with `SITE.tagline`, sections "Por que a DukFit" (one card per `SITE.highlights`), "Modalidades", "Horários", "Contato" with `SITE.address`, `SITE.phone` and a link whose `href` is `https://wa.me/<SITE.whatsapp digits>` (AC 30, AC 35, door 4)
Proof: `E2E e2e/dukfit.spec.ts -g "landing_sections_in_order_from_site_content"`

**C31** - Without session the landing CTA is a link "Acesso da equipe" to `/login`, background rgb(205, 247, 32); with session it is "Ir para o painel" to `/dashboard` and no "Acesso da equipe" exists (AC 31, AC 32)
Proof: `E2E e2e/dukfit.spec.ts -g "landing_cta_depends_on_session"`

**C32** - The landing has no `header`/navigation of the shell, makes no request to an origin other than the web's, and raises zero `securitypolicyviolation` (AC 33)
Proof: `E2E e2e/dukfit.spec.ts -g "landing_has_no_shell_no_external_request_and_no_csp_violation"`
Proof: `E2E e2e/csp.spec.ts -g "chromium_opens_login_and_students_without_csp_violations"`

**C33** - At 390×844 the highlights list has 1 column; at 1440×900, 3 columns (AC 34)
Proof: `E2E e2e/dukfit.spec.ts -g "landing_highlights_one_column_mobile_three_desktop"`

**C34** - `site-content.ts` exports `SITE` with the door-4 keys (`name`, `tagline`, `address`, `phone`, `whatsapp`, `hours`, `highlights`, `modalities`), `name` equal to "DukFit", and the landing module imports no API helper (`lib/session`'s `readSession` excepted, for the CTA) (AC 35, door 4)
Proof: `REPO identidade.test.ts -t "site_content_is_the_only_source_of_landing_copy"`

### S5 - Rotas e entrada · `proxy.ts`, login, 2FA, nav · 6 files · 15 KB · ~4k

**C35** - Login without second factor lands on `/dashboard` and the 2FA verification lands on `/dashboard` (AC 36, AC 37, door 1)
Proof: `E2E e2e/login.spec.ts -g "home_shows_name_and_role_label_for_four_roles"`
Proof: `E2E e2e/two-factor.spec.ts -g "verify_success_goes_to_dashboard"`

**C36** - With session, `/login` redirects to `/dashboard` (AC 38)
Proof: `E2E e2e/shell.spec.ts -g "signed_in_user_leaves_login"`

**C37** - Without session `/dashboard`, `/students` and `/account` end on `/login` (AC 39)
Proof: `E2E e2e/shell.spec.ts -g "anonymous_is_redirected_to_login"`

**C38** - With 2FA enrollment pending, `/` shows the landing (URL `/`) and `/dashboard` ends on `/two-factor/setup` (AC 40)
Proof: `E2E e2e/dukfit.spec.ts -g "pending_two_factor_sees_landing_and_is_sent_to_setup_from_dashboard"`

**C39** - `/login` shows the wordmark, `h1` "Bem-vindo de volta", "E-mail" and "Senha" fields each with an `svg` icon before the input, and the "Entrar" button with background rgb(205, 247, 32) whose width equals the form's width (AC 41)
Proof: `E2E e2e/dukfit.spec.ts -g "login_is_the_welcome_back_screen"`

**C40** - The "Início" item of the navigation has `href` `/dashboard`, and the 404 page keeps "Página não encontrada" with a link to `/` (AC 42, AC 43)
Proof: `E2E e2e/dukfit.spec.ts -g "inicio_goes_to_dashboard_and_not_found_links_to_root"`

### S6 - Telas internas · 20 páginas com shell · 30 files · 80 KB · ~20k

**C41** - On `/students`, `/students/new`, `/students/<id>`, `/plans`, `/account`, `/check-in` and `/users` the page title (`main` first `h2`) has `font-size` 24px and `font-weight` 700, and the first content block after it has background rgb(20, 20, 20) and radius 24px (AC 44)
Proof: `E2E e2e/dukfit.spec.ts -g "inner_screens_have_24_bold_title_and_dark_panels"`

**C42** - At 390×844 on `/students` the table's panel has `overflow-x: auto`, the table is wider than or equal to the panel, and the page has no horizontal scroll; on `/students/new` each input's width equals its form's width and the submit's width equals the form's width (AC 45, AC 46)
Proof: `E2E e2e/dukfit.spec.ts -g "mobile_tables_scroll_inside_panel_and_forms_are_full_width"`

**C43** - Every screen of the 24-screen enumeration keeps its `main` headings, labels, column headers and texts (with `/` replaced by `/dashboard`, the shell `h1` "DukFit" and the `/login` `h1` "Bem-vindo de volta"), and with `print` media emulated `/students/<id>/print` and `/staff/<id>/print` show no visible `header`, navigation or "Registrar check-in" (AC 47, AC 48)
Proof: `E2E e2e/identidade.spec.ts -g "every_screen_keeps_its_copy_and_arrangement"`
Proof: `E2E e2e/dukfit.spec.ts -g "print_pages_have_no_shell_nav_or_fab"`

**C44** - `pnpm verify` exits 0, and the diff `b0cabb4`..HEAD-of-feature adds no dependency to any `package.json` (AC 49, AC 50)
Proof: `pnpm verify`
Proof: `REPO identidade.test.ts -t "dukfit_adds_no_npm_dependency"`

### Rodada 2 - lacunas do Verifier (acréscimo; nenhum check acima mudou de texto)

A rodada 1 da verificação (FAIL, `verification.md`) achou um mapeamento do De-para sem código nem
check e arranjos do mockup sem asserção. Os checks abaixo são acréscimos; as provas da C2, C8, C12,
C14, C17, C18 e C28 ganharam as asserções de arranjo e valor que o De-para fixa.

**C45** - The landing "Horários" region shows a `Gauge` with 40 ticks, `round(40 × 16 / 24)` = 27 lime for 06:00-22:00, the center reading "<opens> - <closes>" of `SITE.hours[0]` and the pill its `days` (De-para "horários (no `Gauge`)")
Proof: `E2E e2e/dukfit.spec.ts -g "landing_hours_use_the_gauge"`

**C46** - At 767 px: bottom nav, 1-column dashboard, expiring list as rows; at 768 and 1023 px: bottom nav, 2 columns, `table`; at 1024 px: side nav, 3 columns; landing highlights 1 column at 767 and 1023 px and 3 at 1024 px (AC 3, AC 7, AC 19, AC 22, AC 34)
Proof: `E2E e2e/dukfit.spec.ts -g "breakpoints_switch_at_768_and_1024"`

Asserções acrescentadas às provas existentes, com o valor do De-para:

- C2 - avatar e nome à esquerda, botão de menu à direita na mesma linha, 44×44 px, raio 12 px (`header_shows_avatar_initials_name_and_profile_for_four_roles`)
- C8 - botão flutuante `position: fixed`, até 32 px da borda direita; no celular acima da barra inferior, no computador até 32 px do rodapé (`fab_links_to_check_in_for_admin_and_reception`)
- C12 - título do `Panel` 20 px, peso 600 (`dashboard_panels_follow_the_response_with_dark_surface_and_24_radius`)
- C14 - marcas em semicírculo: ângulo em volta do centro do arco decrescente de >170° a <10°, raio constante (±15%), número centrado e dentro do arco (`gauge_lights_ticks_in_proportion_to_the_week_max`)
- C17 - pílula com raio ≥ 9999 px (`students_panel_main_number_and_two_pills`)
- C18 - `MetricTile` raio 16 px e rótulo 12 px (`metric_tiles_for_enrollments_and_payments`)
- C28 - `content-type` `application/problem+json` (`anonymous_401_unauthorized`)

Rodada 3 - as duas lacunas da rodada 2 (acréscimo de asserção, nenhum texto de check mudou):

- C45 - a caixa do texto do centro não cruza nenhuma marca a 360, 390 e 1440 px; o `Gauge` usa `text-2xl` quando recebe `display` (`landing_hours_use_the_gauge`)
- C46 - `main` com padding de 16 px a 1023 px e 32 px a 1024 px, a borda do AC 10 (`breakpoints_switch_at_768_and_1024`)

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /` statuses (1) | 200 C29 | - |
| `GET /dashboard` statuses (3) | 200 C12 · 307 `/login` C37 · 307 `/two-factor/setup` C38 | - |
| `GET /api/dashboard` statuses (2) | 200 C24 · 401 C28 | - |
| Landing doors (4) | door 1 C29 C35 C36 C38 · door 2 C24 C27 · door 3 C7 C13 C39 · door 4 C30 C34 | - |
| roles for bottom nav (4) | admin C4 · hr_finance C4 · reception C4 · instructor C4 | - |
| roles for FAB (4) | admin C8 · reception C8 · hr_finance C9 · instructor C9 | - |
| roles for header (4) | admin C2 · hr_finance C2 · reception C2 · instructor C2 | - |
| week bar colors (3) | lime C16 · orange C16 · gray C16 | - |
| `lastSevenDays` window edges (4) | today-6 C24 · today C24 C26 · today-7 out C25 · today+1 out C25 | - |
| viewports (3) | 360 C11 · 390 C3 C10 C19 C22 C33 C42 · 1440 C7 C11 C19 C22 C33 | - |
| De-para rows implemented (13; the 14th, "não reproduzidos", is Out of scope) | cabeçalho C2 · ponto C23 · barra inferior C3 C4 C5 · lateral C7 · FAB C8 C9 · `Panel` C12 C13 · `Gauge` C14 · `StatPill` C17 · `MetricTile` C18 · `WeekBars` C15 C16 · `ListRow`/`Table` C19 · login C39 · landing C30 C45 | - |
| breakpoint edges (2) | 767/768 C46 · 1023/1024 C46 (inclui o gutter do AC 10) | - |
| landing sections (5) | hero C30 · Por que a DukFit C30 · Modalidades C30 · Horários C30 · Contato C30 | - |
| landing CTA states (2) | sem sessão C31 · com sessão C31 | - |
| destinos que eram `/` (6) | login C35 · 2FA C35 · `/login` logado C36 · Início C40 · 404 C40 · proxy `/` público C29 | - |
| dashboard states (3) | dados C12 · erro C20 · vazio C21 | - |
| shell screens (21) | `/dashboard` C11 C43 · `/students` C11 C43 · `/students/new` C11 C43 · `/students/<id>` C11 C43 · `/students/<id>/edit` C11 C43 · `/staff` C11 C43 · `/staff/new` C11 C43 · `/staff/<id>` C11 C43 · `/staff/<id>/edit` C11 C43 · `/plans` C11 C43 · `/plans/new` C11 C43 · `/plans/<id>/edit` C11 C43 · `/payments` C11 C43 · `/check-ins` C11 C43 · `/check-in` C11 C43 · `/audit` C11 C43 · `/users` C11 C43 · `/privacy` C11 C43 · `/account` C11 C43 · `/students/<id>/print` C11 C43 · `/staff/<id>/print` C11 C43 | - |

- Claims naming a status code, route or response shape: C24 to C29, C35 to C38 - each has a proof that crosses the boundary (HTTP against the API; browser against `next start`)
- No other check claims more than the single case its proof exercises

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, reached across a boundary (`lastSevenDays` window, bottom-nav priority, bar color, gauge proportion) | one at the boundary | one asserted case per member of the decision (window edges, four roles, three colors, zero and non-zero max) |
| Entry point that decides nothing (landing, page wrappers) | one at the boundary | the rendered output |
| Instrumentation (icons, `Panel`, tiles) | none of its own | covered by its consumer's proof |

Evidence:

- `apps/api/src/dashboard/dashboard.service.ts`: the series adds 1 decision (window of 7 days, zero fill) -> decides, proven at the HTTP boundary like the existing `check_ins_count_*` cases
- shell bottom-nav selection: 4 roles × priority list -> decides, proven per role in the browser like `shell.spec.ts`
- closest analogue: `apps/web/e2e/shell.spec.ts`, role-by-role menu proofs at the browser

## Swept

- validation: C27 - the contract rejects a series that is not 7 items
- failure modes: C20 - dashboard load error keeps the shell
- idempotency: n/a - nothing is written; every route here is a read
- authorization: C27, C29, C37, C38 - the series follows the existing `checkIns` cut; `/` is the only new public page and the rest keep the proxy guard
- concurrency: n/a - read-only aggregation; a check-in landing between the count and the series is the same read in one request (`today` fixed once), no write races
- data lifecycle: n/a - no data is stored, migrated or deleted
- dependency failure: C20 - API down on `/dashboard`; the landing calls no API besides the session read that the proxy already tolerates (C29)
- state transitions: C26 - the series turns at São Paulo midnight together with `today`
- observability: n/a - no log, metric or audit row changes; the dashboard still writes no audit row (existing `eight_reads_write_no_audit_row`)

## Handoff

- S1-S6 = ~53k tokens (≈210 KB touched / 4), across web, ui, contracts and api - under the 150k budget - one builder
- Mechanism: one builder (under budget, no ask)

- **Boundary:** C1-C44 closed by one builder over `de214e2..HEAD`; web e2e 347/347 before the final icon proof
- **Settled mid-build:** C3 precisado para "for the admin" antes de qualquer teste (o instrutor tem 3 abas pela C4); a prova da C20 aponta o nome real do teste existente (`load_failure_500_and_403`); o "Continuar" do cadastro de 2FA também ia para `/` e passou a `/dashboard` (Impact atualizado); `Table` ganhou `relative min-w-0` porque o texto `sr-only` das células escapava da rolagem e alargava `/users` a 564 px em 360 px; `icons.tsx` entrou no `@source` do Tailwind (sem isso os ícones da navegação tinham 0 px e a C7 passava), e as provas da C4 e da C7 passaram a medir 20×20 px - com o `@source` removido as duas falham
- **Abandoned:** nada
- **Boundary (rodada 2):** C45-C46 e as asserções acrescentadas; o código mudou em dois pontos que as provas novas pegaram: os horários da landing passaram ao `Gauge` (que ganhou `display`) e o botão de menu passou de `rounded-xl` (16 px no tema) a `rounded-md` (12 px)
- **Boundary (rodada 3):** o texto do centro do `Gauge` com `display` desceu de `text-4xl` a `text-2xl` (a 360 px cruzava 12 marcas, e a prova nova falha com o tamanho antigo); gutter do AC 10 provado na borda de 1024 px
