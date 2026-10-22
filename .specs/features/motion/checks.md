# Motion checks

Profile: ui
Plan: `.specs/features/motion/plan.md`

54 checks in 7 slices · 7 one-way doors (AD-099 a AD-105) · 1 open, of which 1 blocks (verify, not build).

Scope guard: the checks below are the plan's AC 1 a AC 54, the seven doors of `Landing` and every
row of `Observable`. `Relations` and `Surface` são `None` no plano, então não há rota nem entidade
a juntar. Nada fora disso entra no build.

Base do Build: `7471232` (o redesenho da AD-098). Toda comparação "antes/depois" desta feature usa
esse commit.

Proof commands. `E2E` = `pnpm --filter @academia/web exec playwright test`; `REPO` =
`pnpm --filter @academia/repo-tests exec vitest run`. Viewports: celular 390×844 e 360×800,
computador 1440×900, bordas 1023×800 e 1024×800.

Sampling. "Sampled frames" num check quer dizer: um `requestAnimationFrame` instalado antes da ação
grava, a cada frame, `performance.now()` e o `getComputedStyle` do alvo (`opacity`, `transform`,
`pointer-events` e as propriedades que o check nomear) até 600 ms depois da ação. Um frame é 16,7 ms;
toda tolerância de tempo abaixo é de um frame para cada lado.

## Binding sources

| Source | What it decides |
| --- | --- |
| `plan.md` `## Landing` (doors 1 a 7) | os valores literais: `MOTION`, 200 ms / 8 px / 12 px da página, 150 / 200 / 180 ms do CSS, 1,4 s do pulso, 0,98 do toque, 40 ms e 8 itens da cascata, 64 px / 12 px / 24 px / `rgb(0 0 0 / 0.72)` / `blur(12px)` do cabeçalho, 44 px e 36 px do menu |
| `plan.md` AC 1 a AC 54 | as medidas e os estados que cada check afirma |
| referência visual da AD-098 (2026-10-21) | o cabeçalho e o menu herdam os tokens, o raio e o acento #fcf43c; nenhuma cor nova |

Não há referência visual de movimento: o pedido não trouxe nenhuma (plan.md, Problem). Os números
das doors são a fonte.

## Supersedes

Mudam por desenho, com a aprovação do plano em 2026-10-21, e são reescritas no mesmo commit da
mudança; nenhuma é apagada nem enfraquecida no que ainda vale:

- `tests/repo/identidade.test.ts` › `dukfit_adds_no_npm_dependency` (AC 50 da `dukfit-app`) sai e
  entra `motion_is_the_only_added_dependency` (door 6, C5); `DUKFIT_BASE` sai do arquivo.
- `apps/web/e2e/landing.spec.ts` › `hero_shows_logo_nav_eyebrow_two_line_title_intro_and_proof`: o
  logo e a navegação deixam a região do hero e passam ao `banner` (door 7); eyebrow, título,
  introdução e prova continuam afirmados como estão.
- `apps/web/e2e/dukfit.spec.ts` › `landing_has_no_shell_no_external_request_and_no_csp_violation`:
  a landing passa a ter um `banner` e a navegação "Seções" visível em todo tamanho (a partir de
  1024 px no cabeçalho, abaixo disso no menu); continua sem a navegação da shell, sem requisição a
  outra origem e sem violação de CSP.
- `tests/repo/identidade.test.ts` › `site_content_has_the_door_five_shape`: ganha a chave `menu`.

## Checks

Grouped by the plan's slices; numbering runs across the whole feature and follows the AC numbers
(C*n* proves AC *n*).

### S1 - Fundação de movimento e dependência · manifests, `motion.tsx`, `layout.tsx`, guard · 7 files · 24 KB · ~6k

**C1** - `pnpm-workspace.yaml` has `motion: ^14.5.0` under `catalog`; of the tracked `package.json` files, exactly `apps/web/package.json` and `packages/ui/package.json` declare `motion`, both as `"catalog:"`; `pnpm-lock.yaml` resolves `motion@14.5.0` (AC 1, door 1)
Proof: `REPO identidade.test.ts -t "motion_is_the_only_added_dependency"`

**C2** - `apps/web/src/app/layout.tsx` renders `MotionProvider` around `{children}`; `MotionProvider` returns `<MotionConfig reducedMotion="user" transition={{ duration: MOTION.base, ease: MOTION.ease }}>` with no host element (no `<div>`, `<span>` or other lowercase JSX tag) in its body; and at 390×844 `/dashboard`'s `body` has the same direct-children tag list with and without the provider's subtree (no wrapper element in the DOM) (AC 2, door 1)
Proof: `REPO motion.test.ts -t "motion_provider_is_motion_config_user_without_a_host_element"`
Proof: `E2E e2e/motion.spec.ts -g "motion_provider_adds_no_element_to_the_body"`

**C3** - `packages/ui/src/motion.tsx` exports `MOTION` equal to `{ micro: 0.15, base: 0.2, long: 0.3, ease: [0.2, 0.8, 0.2, 1], distance: 8, distanceDesktop: 12, stagger: 0.04, staggerMax: 8 }`; no `.ts`/`.tsx` file under `apps/web/src` or `packages/ui/src` other than `motion.tsx` passes a numeric literal to a Motion `duration`, `delay`, `ease`, `staggerChildren`, `delayChildren`, `x` or `y` (AC 3, door 1)
Proof: `REPO motion.test.ts -t "motion_tokens_are_the_door_one_literal"`
Proof: `REPO motion.test.ts -t "motion_props_read_durations_and_distances_from_the_tokens"`

**C4** - Every import of the library in `apps/web/src` and `packages/ui/src` is from `'motion/react'` or `'motion/react-client'`, there is at least one, and the string `framer-motion` appears in no file under those two trees (AC 4, door 1)
Proof: `REPO motion.test.ts -t "motion_imports_only_from_motion_react"`

**C5** - `tests/repo/identidade.test.ts` has a test named `motion_is_the_only_added_dependency` that passes, and contains neither `dukfit_adds_no_npm_dependency` nor `DUKFIT_BASE` (AC 5, door 6)
Proof: `REPO identidade.test.ts -t "motion_is_the_only_added_dependency"`
Proof: `REPO motion.test.ts -t "the_dukfit_dependency_guard_is_gone"`

### S2 - Transição de página · `page-transition.tsx`, `shell.tsx` · 3 files · 12 KB · ~3k

**C6** - At 390×844, after loading `/dashboard` and clicking the link "Alunos", the new `main` has `data-motion="page"`; across its sampled frames the first one has `opacity` ≤ 0.2 and translateY in (6, 8] px, opacity and translateY change monotonically, and the first frame with `opacity: 1` and `transform: none` lands 200 ± 17 ms after the first frame (AC 6, AC 40, door 2)
Proof: `E2E e2e/motion.spec.ts -g "page_enters_with_opacity_and_eight_pixels_in_200ms_on_mobile"`

**C7** - The same navigation starts at translateY in (10, 12] px at 1440×900 and at 1024×800, and in (6, 8] px at 1023×800, with the same 200 ± 17 ms (AC 7, door 2)
Proof: `E2E e2e/motion.spec.ts -g "page_distance_is_twelve_from_1024_and_eight_below"`

**C8** - The HTML of `GET /dashboard` (signed in) has no `opacity:0` and no `transform` in the `style` of `main`; and after `page.goto('/dashboard')`, with no further navigation, every sampled frame of `main` has `opacity: 1` and `transform: none` (AC 8, door 2)
Proof: `E2E e2e/motion.spec.ts -g "first_document_renders_visible_without_transition"`

**C9** - On `/students/<id>/print` and `/staff/<id>/print`, reached both by `page.goto` and by a client navigation from the ficha, there are 0 `[data-motion="page"]` elements and every sampled frame of `main` and of each of its descendants has `opacity: 1` and `transform: none` (AC 9, AC 32, door 2)
Proof: `E2E e2e/motion.spec.ts -g "print_pages_render_without_page_or_entrance_motion"`

**C10** - With `page.emulateMedia({ reducedMotion: 'reduce' })`, the C6 navigation produces a new `main` whose every sampled frame has `opacity: 1` and `transform: none` (AC 10)
Proof: `E2E e2e/motion.spec.ts -g "reduced_motion_page_is_static"`

**C11** - Across the C6 sampled frames, `pointer-events` of `main` is `auto` on every frame, and among `opacity`, `transform`, `width`, `height`, `top`, `left`, `margin-top`, `padding-top`, `filter` and `clip-path` only `opacity` and `transform` differ between any two frames (AC 11, door 2)
Proof: `E2E e2e/motion.spec.ts -g "page_transition_animates_only_opacity_and_transform"`

**C12** - Each of the 19 shell routes that do not end in `/print` (Coverage row "shell routes") has exactly 1 `[data-motion="page"]` element, and it is the page's only `main` (AC 12; AC 9 é a exceção explícita das 2 rotas de impressão)
Proof: `E2E e2e/motion.spec.ts -g "every_shell_route_has_one_page_motion_main"`

### S3 - Carregamento · `skeleton.tsx`, `app-loading.tsx`, 11 `loading.tsx` · 15 files · 14 KB · ~4k

**C13** - At 390×844, with the fake API in `hang` for the students list, clicking "Alunos" from `/dashboard` shows, before any student row, one `[data-slot="page-skeleton"]` with `role="status"`, `aria-busy="true"` and accessible name containing "Carregando…" (AC 13, door 3)
Proof: `E2E e2e/motion.spec.ts -g "pending_navigation_shows_the_page_skeleton"`

**C14** - Each of the 11 files `apps/web/src/app/{dashboard,students,staff,plans,payments,check-in,check-ins,audit,users,privacy,account}/loading.tsx` exists and its default export is the `AppLoading` imported from `components/app-loading` (AC 14, door 3; table-driven over the 11)
Proof: `REPO motion.test.ts -t "eleven_segments_have_app_loading"`

**C15** - With the C13 hang, at 390×844 and at 1440×900, the skeleton has 1 `[data-slot="skeleton-shell"]`, 1 `[data-slot="skeleton-title"]` of height 30 px and 4 `[data-slot="skeleton-panel"]` of height 96 px; the skeleton's content box has the same `max-width`, `padding-left` and `padding-right` as the `main` of `/students` once loaded; at 1440×900 the skeleton column is 256 px wide and at 390×844 the skeleton bottom bar is visible (AC 15, door 3)
Proof: `E2E e2e/motion.spec.ts -g "skeleton_repeats_the_shell_geometry"`

**C16** - Every `[data-slot="skeleton"]` block has `aria-hidden="true"`, `animation-name: skeleton-pulse` and `animation-duration: 1.4s`, and the keyframes go between opacity 0.35 and 0.7; with `reducedMotion: 'reduce'` each block has `animation-name: none` and `opacity: 0.5` (AC 16, AC 40, door 3)
Proof: `E2E e2e/motion.spec.ts -g "skeleton_pulses_in_1_4s_and_is_static_when_reduced"`
Proof: `REPO motion.test.ts -t "skeleton_pulse_keyframes_are_the_door_three_literal"`

**C17** - When the students list load fails (fake API 500), the existing load-error text stays as asserted today and its `[role="alert"]` has `animation-name: feedback-in` and `animation-duration: 0.18s` (AC 17, door 5)
Proof: `E2E e2e/students.spec.ts -g "load_failure_shows_retry_on_list_and_ficha"`
Proof: `E2E e2e/motion.spec.ts -g "load_error_alert_animates_in_180ms"`

**C18** - No `loading.tsx` and no `template.tsx` exist at `apps/web/src/app/`, `app/login/`, `app/login/two-factor/` or `app/two-factor/setup/`; and opening `/login` with the fake API in `hang` shows 0 `[data-slot="page-skeleton"]` (AC 18, AC 54, door 3)
Proof: `REPO motion.test.ts -t "no_skeleton_on_landing_login_or_two_factor"`
Proof: `E2E e2e/motion.spec.ts -g "landing_and_login_have_no_skeleton_or_page_motion"`

### S4 - Ações · `globals.css`, `Button`, `Dialog`, `Alert`, 14 telas com `pending` · 22 files · 96 KB · ~24k

**C19** - A `Button` has `transition-property` including `transform` with 0.15s; while the mouse is held down on it its computed `transform` is `matrix(0.98, 0, 0, 0.98, 0, 0)`; with `reducedMotion: 'reduce'` it stays `none` while held (AC 19, door 5)
Proof: `E2E e2e/motion.spec.ts -g "button_presses_to_0_98_in_150ms_and_not_when_reduced"`

**C20** - At `/check-in`, with the register request in `hang`, the clicked button has `aria-busy="true"`, is `disabled`, and contains one `svg` of 16×16 px with `aria-hidden="true"`; when the request answers, `aria-busy` is gone (AC 20, door 5)
Proof: `E2E e2e/motion.spec.ts -g "busy_button_has_aria_busy_spinner_and_stays_disabled"`

**C21** - `apps/web/src` contains 0 occurrences of `disabled={pending}`, and each of the 14 files that had it at `7471232` (Coverage row "pending controls") now contains `busy={pending}` at least once (AC 21, door 5; table-driven over the 14)
Proof: `REPO motion.test.ts -t "pending_controls_use_busy"`

**C22** - Opening the student inactivation dialog on `/students/<id>`: `[data-slot="dialog-overlay"]` has `animation-name: overlay-in` with 0.15s, `[data-slot="dialog-content"]` has `animation-name: dialog-in` with 0.2s; in `globals.css` `overlay-in` goes opacity 0→1 and `dialog-in` goes opacity 0→1 with `scale(0.98)`→`scale(1)` (AC 22, door 5)
Proof: `E2E e2e/motion.spec.ts -g "dialog_opens_with_overlay_150ms_and_content_200ms"`
Proof: `REPO motion.test.ts -t "action_keyframes_are_the_door_five_literal"`

**C23** - Closing that dialog by Escape and by its cancel button leaves 0 `[role="dialog"]` in the DOM on the next frame, and focus is on the trigger button (AC 23, door 5)
Proof: `E2E e2e/motion.spec.ts -g "dialog_unmounts_at_once_and_returns_focus"`

**C24** - The 2 success messages of the app (Coverage row "success messages": "Presença registrada às …" on `/check-in` and "Configurações salvas." on `/privacy`) carry `data-motion="feedback"`, `animation-name: feedback-in` and 0.18s (AC 24, door 5)
Proof: `E2E e2e/motion.spec.ts -g "success_messages_are_feedback_in_180ms"`

**C25** - A failed register on `/check-in` (fake API 409) renders `[role="alert"]` with its current text, `animation-name: feedback-in` and 0.18s (AC 25, door 5)
Proof: `E2E e2e/motion.spec.ts -g "failed_action_alert_keeps_role_and_text_and_animates"`

**C26** - In `packages/ui/src/globals.css` the keyframes `overlay-in`, `dialog-in` and `feedback-in` set only `opacity` and `transform`, and `.pressable`'s `transition` lists only `transform` and `background-color`; no rule added by this feature animates or transitions `top`, `left`, `width`, `height` or `margin` (AC 26, door 5)
Proof: `REPO motion.test.ts -t "action_animations_touch_only_opacity_transform_background"`

### S5 - Entrada de conteúdo · `Reveal`/`Stagger`, painel e 5 listas · 14 files · 62 KB · ~16k

**C27** - At 390×844 on `/dashboard` (admin, 7 cards), card *i* (0-based) first shows `opacity` > 0 at *i* × 40 ± 17 ms after card 0, and each card reaches `opacity: 1` and `transform: none` (AC 27, door 4)
Proof: `E2E e2e/motion.spec.ts -g "dashboard_cards_reveal_with_40ms_steps"`

**C28** - At 390×844, with 12 items from the fake API, on `/students`, `/plans`, `/payments`, `/staff` and `/check-ins` (table-driven over the 5), item *i* (0-based) for *i* < 8 first shows `opacity` > 0 at *i* × 40 ± 17 ms after item 0, and items 9 to 12 do so at ≤ 280 + 17 ms (AC 28, door 4)
Proof: `E2E e2e/motion.spec.ts -g "lists_stagger_8_items_at_40ms_and_cap_the_rest"`

**C29** - With `reducedMotion: 'reduce'`, on the same 5 lists and on `/dashboard`, every sampled frame of every item has `opacity: 1` and `transform: none` (AC 29, door 4)
Proof: `E2E e2e/motion.spec.ts -g "reduced_motion_lists_are_static"`

**C30** - On the 5 lists, at 390×844 and at 1440×900, the item text order equals the fixture order and each item's accessible name equals its name with `reducedMotion: 'reduce'`; at 1440×900 every sampled frame of every `tbody tr` has `opacity: 1` and `transform: none` (AC 30, door 4)
Proof: `E2E e2e/motion.spec.ts -g "entrance_keeps_order_names_and_leaves_table_rows_alone"`

**C31** - At 390×844 on `/students`, submitting a search that returns different rows makes the new first row start at `opacity` < 1; submitting the same search again (same rows) yields no sampled frame with `opacity` < 1 on any row (AC 31, door 4)
Proof: `E2E e2e/motion.spec.ts -g "replaced_rows_animate_once_and_same_rows_do_not_restart"`

**C32** - The entrance animation does not run on `/students/<id>/print` or `/staff/<id>/print` (AC 32) - same proof as C9, which asserts every descendant of `main`
Proof: `E2E e2e/motion.spec.ts -g "print_pages_render_without_page_or_entrance_motion"`

**C33** - At 360×800, on the 5 lists, on every sampled frame of the entrance `document.documentElement.scrollWidth` equals `clientWidth`, and the table scroll container's right edge is inside its panel (AC 33)
Proof: `E2E e2e/motion.spec.ts -g "entrance_does_not_widen_the_page_at_360"`
Proof: `E2E e2e/dukfit.spec.ts -g "mobile_tables_scroll_inside_panel_and_forms_are_full_width"`

### S6 - Movimento reduzido, responsividade e portão · baseline, provas transversais · 4 files · 20 KB · ~5k

**C34** - With `reducedMotion: 'reduce'`, after each of: navigation `/dashboard`→`/students`, pending skeleton (C13 setup), dialog open (C22 setup), failed register (C25 setup), list entrance (C28 setup) and opening the landing menu (C46 setup), once the screen settles `document.getAnimations()` has 0 entries whose target is or is inside `[data-motion="page"]`, `[data-slot="page-skeleton"]`, `[role="alert"]`, `[role="dialog"]` or `[data-motion="feedback"]`, and those elements have `animation-name: none` (AC 34)
Proof: `E2E e2e/motion.spec.ts -g "reduced_motion_leaves_no_running_animation"`

**C35** - At 360×800 and 1440×900, on `/`, `/dashboard`, `/students` and `/staff`, `scrollWidth` equals `clientWidth` on every sampled frame from navigation to settle (AC 35)
Proof: `E2E e2e/motion.spec.ts -g "no_horizontal_scroll_during_motion_at_360_and_1440"`

**C36** - The CSP proofs report zero `securitypolicyviolation`, now also across a client navigation with the page transition, a dialog opening and the landing menu; the two print e2e stay green (AC 36)
Proof: `E2E e2e/csp.spec.ts -g "chromium_opens_login_and_students_without_csp_violations"`
Proof: `E2E e2e/motion.spec.ts -g "motion_raises_no_csp_violation"`
Proof: `E2E e2e/privacy-print.spec.ts -g "student_print_sections_dates_photos_empty_and_print_button"`
Proof: `E2E e2e/privacy-print.spec.ts -g "staff_print_sections_user_and_photos"`

**C37** - `pnpm verify` exits 0 at the feature's last commit (AC 37). Blocked by the plan's Open question: the `EXEMPLO` guard of `site_content_is_the_only_source_of_landing_copy` is red until the real plan prices land
Proof: `pnpm verify`

**C38** - `git diff --exit-code 7471232..HEAD -- apps/api packages/contracts packages/database apps/web/src/proxy.ts apps/web/src/lib` exits 0 (AC 38)
Proof: `git diff --exit-code 7471232..HEAD -- apps/api packages/contracts packages/database apps/web/src/proxy.ts apps/web/src/lib`

**C39** - For each of the 21 shell routes and for `/` outside `[data-slot="site-header"]` and `#site-menu`, at 390×844 and 1440×900, `main`'s `innerText`, the page's ARIA snapshot (outside the landing header) and the sequence of focused elements over 40 Tab presses equal the baseline recorded at `7471232` in `apps/web/e2e/fixtures/motion-baseline/`, which is written before any code of this feature (AC 39)
Proof: `E2E e2e/motion.spec.ts -g "copy_names_and_focus_order_match_the_baseline"`

**C40** - With `reducedMotion: 'no-preference'` the page transition lasts 200 ± 17 ms (C6) and the shimmer is 1.4s (C16) (AC 40) - same proofs
Proof: `E2E e2e/motion.spec.ts -g "page_enters_with_opacity_and_eight_pixels_in_200ms_on_mobile"`
Proof: `E2E e2e/motion.spec.ts -g "skeleton_pulses_in_1_4s_and_is_static_when_reduced"`

### S7 - Menu flutuante da landing e menu do celular · `site-header.tsx`, `page.tsx`, `site-content.ts`, provas da landing · 8 files · 116 KB · ~29k

**C41** - At 360, 390, 768, 1024 and 1440 px wide (height 844 / 900), with `/` scrolled to 0, to the middle and to the bottom, `[data-slot="site-header"]` is visible, its `top` ≥ 0 and its `bottom` ≤ 88 px, `position: fixed`, `top: 12px`, height 64 px and `z-index: 40`; left/right inset is 16 px below 1024 and 32 px from 1024 (AC 41, door 7)
Proof: `E2E e2e/landing-header.spec.ts -g "header_stays_in_the_top_88px_at_every_scroll_and_width"`

**C42** - On `/`, `getByRole('banner')` resolves to exactly 1 element, it is `[data-slot="site-header"]`, a `header` whose `nextElementSibling` is `main`, and the hero region contains no `header` and no `[data-slot="site-header"]` (AC 42, door 7)
Proof: `E2E e2e/landing-header.spec.ts -g "header_is_the_only_banner_before_main_outside_the_hero"`
Proof: `E2E e2e/landing.spec.ts -g "hero_shows_logo_nav_eyebrow_two_line_title_intro_and_proof"`

**C43** - At `scrollY` 0 and 23 the header has background `rgba(0, 0, 0, 0)` and no `data-scrolled`; at `scrollY` 25 and 400 it has `data-scrolled`, background `rgba(0, 0, 0, 0.72)`, `backdrop-filter: blur(12px)`, and `transition` covering `background-color` and `border-color` with 0.2s (AC 43, door 7)
Proof: `E2E e2e/landing-header.spec.ts -g "header_turns_solid_after_24px_in_200ms"`

**C44** - At 1024×800 and 1440×900, the header shows the logo, a `navigation` named `SITE.labels.nav` with exactly the 5 links of `SITE.nav` in order and `href`, and the CTA "Acesso da equipe" → `/login` without session, "Ir para o painel" → `/dashboard` with session; no "Abrir menu" button is visible (AC 44, door 7)
Proof: `E2E e2e/landing-header.spec.ts -g "desktop_header_has_logo_nav_and_session_cta"`

**C45** - At 360×800, 390×844, 768×1024 and 1023×800, the header shows the logo, the session CTA and a visible button named "Abrir menu" of 44×44 px with `aria-expanded="false"` and `aria-controls="site-menu"`; the navigation named `SITE.labels.nav` inside the header is not visible (AC 45, door 7)
Proof: `E2E e2e/landing-header.spec.ts -g "mobile_header_has_logo_cta_and_menu_button"`

**C46** - At 390×844, activating "Abrir menu" opens `[role="dialog"]#site-menu` named "Menu" that covers the viewport (its box equals 0,0,390,844); `document.activeElement` is inside it; the trigger has `aria-expanded="true"`; it lists the 5 `SITE.nav` links with `font-size: 36px` and `text-transform: uppercase`, the "Quero treinar" link, the session CTA (both states) and the Instagram link (AC 46, door 7)
Proof: `E2E e2e/landing-header.spec.ts -g "menu_opens_full_screen_with_focus_links_and_ctas"`
Proof: `E2E e2e/dukfit.spec.ts -g "landing_has_no_shell_no_external_request_and_no_csp_violation"`

**C47** - Opening the menu: overlay `animation-name: overlay-in` 0.15s, panel `animation-name: dialog-in` 0.2s, and link *i* (0-based) of the 5 first shows `opacity` > 0 at *i* × 40 ± 17 ms after link 0; with `reducedMotion: 'reduce'` overlay and panel have `animation-name: none` and every sampled frame of every link has `opacity: 1` and `transform: none` (AC 47, doors 4 e 5)
Proof: `E2E e2e/landing-header.spec.ts -g "menu_animates_overlay_panel_and_stagger_and_not_when_reduced"`

**C48** - At 390×844, from `/` scrolled to "Planos", for each of the 5 `SITE.nav` links: activating it in the menu leaves 0 `#site-menu` in the DOM, and after scrolling settles the target section's eyebrow is inside the viewport with its `top` ≥ the header's `bottom` (AC 48, door 7)
Proof: `E2E e2e/landing-header.spec.ts -g "menu_link_closes_and_shows_the_eyebrow_below_the_header"`

**C49** - With the menu open, pressing Escape, and separately activating "Fechar menu", leaves 0 `#site-menu` in the DOM on the next frame and focus on "Abrir menu" (AC 49, doors 5 e 7)
Proof: `E2E e2e/landing-header.spec.ts -g "escape_and_close_return_focus_to_the_menu_button"`

**C50** - At 1440×900, for each of the 5 desktop navigation links, after clicking and scrolling settles, the target section's `top` ≥ the header's `bottom` (AC 50, door 7)
Proof: `E2E e2e/landing-header.spec.ts -g "desktop_link_stops_the_section_below_the_header"`

**C51** - At 1440×900, with each of the 5 `SITE.nav` sections scrolled into the viewport in turn, exactly one header link has `aria-current="location"` and it is the link of that section (AC 51, door 7; table-driven over the 5)
Proof: `E2E e2e/landing-header.spec.ts -g "current_section_link_has_aria_current_location"`

**C52** - `site-content.ts` has `menu: { open: 'Abrir menu', close: 'Fechar menu', title: 'Menu' }` in `SITE`; `site-header.tsx` has no literal text between JSX tags, no literal-text JSX line and no literal `alt`, `aria-label`, `title` or `placeholder`, and imports `SITE` from `site-content` (AC 52, door 7)
Proof: `REPO identidade.test.ts -t "site_content_has_the_door_five_shape"`
Proof: `REPO motion.test.ts -t "site_header_reads_every_text_from_site"`

**C53** - At 360×800, with the menu closed and open, `scrollWidth` equals `clientWidth`; at 390×844 and 1440×900 on first paint, the bounding box of the hero `h1` does not intersect the header's (AC 53, door 7)
Proof: `E2E e2e/landing-header.spec.ts -g "header_does_not_widen_or_cover_the_hero_title"`

**C54** - On `/` with the header and the menu used (scroll past 24 px, open and close the menu), there are 0 `securitypolicyviolation`, 0 requests to an origin other than the web's, 0 `[data-motion="page"]` and 0 `[data-slot="page-skeleton"]` (AC 54, AC 18)
Proof: `E2E e2e/landing-header.spec.ts -g "landing_menu_keeps_csp_same_origin_and_no_page_motion"`
Proof: `E2E e2e/dukfit.spec.ts -g "landing_has_no_shell_no_external_request_and_no_csp_violation"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| Landing doors (7) | door 1 C1 C2 C3 C4 · door 2 C6 C7 C8 C9 C11 · door 3 C13 C14 C15 C16 C18 · door 4 C27 C28 C29 C30 C31 · door 5 C19 C20 C21 C22 C23 C24 C25 C26 · door 6 C5 · door 7 C41 to C53 | - |
| shell routes for `[data-motion="page"]` (21) | `/dashboard` C12 · `/students` C12 · `/students/new` C12 · `/students/<id>` C12 · `/students/<id>/edit` C12 · `/staff` C12 · `/staff/new` C12 · `/staff/<id>` C12 · `/staff/<id>/edit` C12 · `/plans` C12 · `/plans/new` C12 · `/plans/<id>/edit` C12 · `/payments` C12 · `/check-ins` C12 · `/check-in` C12 · `/audit` C12 · `/users` C12 · `/privacy` C12 · `/account` C12 · `/students/<id>/print` C9 · `/staff/<id>/print` C9 | - |
| shell routes for copy, names and focus (21) | C39, table-driven over all 21 | - |
| `loading.tsx` segments (11) | C14, table-driven over all 11 | - |
| routes without skeleton or page motion (4) | `/` C18 C54 · `/login` C18 · `/login/two-factor` C18 · `/two-factor/setup` C18 | - |
| page transition decisions (4) | first document C8 · later navigation C6 · `/print` C9 · reduced motion C10 | - |
| distance breakpoint edges (2) | 1023 → 8 px C7 · 1024 → 12 px C7 | - |
| pending controls (14 files) | C21, table-driven over the 14 files with `disabled={pending}` at `7471232` | - |
| success messages (2) | "Presença registrada" C24 · "Configurações salvas." C24 | - |
| CSS microstates (4) | press C19 · dialog open C22 · dialog close C23 · feedback/alert C17 C24 C25 | - |
| animated lists (5) | students C28 C31 · plans C28 · payments C28 · staff C28 · check-ins C28 | - |
| stagger edges (3) | item 1 C28 · item 8 C28 · items 9-12 C28 | - |
| reduced-motion surfaces (6) | page C10 C34 · skeleton C16 C34 · dialog C34 · feedback C34 · lists C29 C34 · landing menu C47 C34 | - |
| header widths (5) | 360 C41 C45 C53 · 390 C41 C45 C46 · 768 C41 C45 · 1024 C41 C44 · 1440 C41 C44 C50 C51 | - |
| header breakpoint edge (2) | 1023 menu button C45 · 1024 desktop nav C44 | - |
| header scroll states (2) | below 24 px C43 · past 24 px C43 | - |
| session CTA states (2) | without session C44 C46 · with session C44 C46 | - |
| `SITE.nav` sections (5) | C48 C50 C51, each table-driven over all 5 | - |
| menu close paths (3) | Escape C49 · "Fechar menu" C49 · section link C48 | - |
| superseded proofs (4) | `dukfit_adds_no_npm_dependency` C5 · `hero_shows_logo_nav_…` C42 · `landing_has_no_shell_…` C46 C54 · `site_content_has_the_door_five_shape` C52 | - |
| startup config: `MotionProvider` (1 assembly) | `apps/web/src/app/layout.tsx`, the only root layout, built by `next build` in the e2e web server - C2 | - |

- Claims naming a route: C12, C14, C18, C39 - each proof opens the route in Chromium against `next build && next start` or reads the segment file it names
- `Surface` and `Relations` are `None` in the plan; C38 proves that no API route, contract, schema or proxy rule changed
- No other check claims more than the single case its proof exercises

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decides, rendered in the browser (`PageTransition`, `Stagger`, `SiteHeader`, `Button` `busy`) | one at the browser boundary | one asserted case per branch of the decision |
| Structural rule over files (dependency, imports, tokens, `loading.tsx`, `busy`, copy from `SITE`) | one repo test | table-driven over the whole set |
| CSS rule (keyframes, `.pressable`, reduced-motion block) | one repo test for the literal **and** one browser test for the computed value | each rule named in door 5 |
| Instrumentation (`MotionProvider`, `Skeleton`, `AppLoading`, the 11 `loading.tsx`) | none of its own beyond the structural row | covered by its consumer's proof |

Evidence:

- `page-transition.tsx` (door 2): 4 decisions - first mount, `/print`, reduced motion, breakpoint -> decides; C7 C8 C9 C10
- `Stagger`/`StaggerItem` (door 4): 2 decisions - index below 8 vs from the 9th, breakpoint distance -> decides; C28 at the 1st, 8th and 9th-12th items
- `site-header.tsx` (door 7): 4 decisions - scroll threshold 24 px, breakpoint 1024, open/closed, active section -> decides; C43 C44 C45 C49 C51
- `Button` `busy` (door 5): 1 decision -> decides; C20
- closest analogue: `apps/web/e2e/dukfit.spec.ts`, breakpoint and arrangement proofs measured in Chromium at named viewports; `tests/repo/identidade.test.ts`, structural rules over source files

## Swept

- validation: n/a - no input is read or validated; every form keeps its current schema (C38, C39)
- failure modes: C17, C25 - load errors and failed actions keep role and text and animate in
- idempotency: C31 - a re-render with the same rows does not restart the entrance
- authorization: existing - `proxy.ts` and the role cut of every screen are unchanged (C38); the landing header shows the session CTA by the same `readSession` (C44)
- concurrency: C23, C49 - closing a dialog or the menu unmounts at once, so no exit animation races the next action; C11 - the transition never blocks pointer input
- data lifecycle: n/a - nothing is stored, migrated or deleted (C38)
- dependency failure: C8 - the first document is visible without JS running the transition; C13 - a hanging API shows the skeleton
- state transitions: C43 (header transparent → solid), C46 C49 (menu closed → open → closed), C20 (button idle → busy → idle)
- observability: n/a - no log, metric or audit row changes; `aria-busy` and `role="status"` are the user-facing signal (C13, C20)

## Handoff

Size from `wc -c` of the files each slice touches, divided by four:

- S1 = 6k (manifests, `motion.tsx`, `layout.tsx`, `identidade.test.ts`, `motion.test.ts`); S2 enters the shell at 9k; S3 at 13k; S4 (`globals.css`, `Button`, `Dialog`, `Alert` and the 14 `pending` files, 96 KB) at 37k; S5 (painel e 5 listas, 62 KB) at 53k; S6 (baseline and cross-cutting proofs) at 58k; S7 (`page.tsx` 20 KB, `site-content.ts` 8 KB, `landing.spec.ts` 18 KB, `dukfit.spec.ts` 38 KB, `identidade.test.ts`, `site-header.tsx`, `landing-header.spec.ts`) at 87k; plus `plan.md` and this file read once (≈ 75 KB, 19k) = ~106k, under the 150k budget - one builder
- Mechanism: one builder (under budget, no ask)
- Order: the C39 baseline under `apps/web/e2e/fixtures/motion-baseline/` is recorded at `7471232` before any code of this feature; S1's first commit also carries the four dependency files that are uncommitted today (`apps/web/package.json`, `packages/ui/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`)
- Verifier: blocked by the plan's Open question (real plan prices) through C37; the Build is not
- **Progress:** baseline C39 em `70e9826` (gravado sobre o código de `7471232`); S1 (C1-C5), S2 (C6-C12), S3 (C13-C18) e S4 (C19-C26) fechadas
