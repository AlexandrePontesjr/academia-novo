# Motion verification

**Verdict**: FAIL
**Profile**: ui
**Diff range**: 7471232..HEAD
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

HEAD is `6e67520` (`git rev-parse --short HEAD`). All 54 checks were run at HEAD in three invocations:
the full web e2e suite (`apps/web/node_modules/.bin/playwright test`, run from `apps/web`, **407
passed, 0 failed, 8.7 min**), the repo suite (`pnpm --filter @academia/repo-tests exec vitest run
--reporter=verbose`, **74 passed**), and the C38 diff (`git diff --exit-code 7471232..HEAD -- apps/api
packages/contracts packages/database apps/web/src/proxy.ts apps/web/src/lib`, **exit 0**). Each of the
49 distinct e2e names in checks.md was found individually as `ok` in the e2e output, and each of the
repo names as `✓` in the vitest output (listing in the Checks table). 53 of 54 checks are proven with
located evidence. The verdict is FAIL for four reasons, ranked at the end: a success message the
Coverage set left out, which also breaks AC 24 in the code; two `Test policy` rows that nobody met,
one of them shown by a fault that survived; and C37, whose literal proof does not exit 0 here.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `plan.md` `## Landing`, doors 1-7 | yes - read in full | none - every literal a check names matches its door (`MOTION` in C3, 200 ms / 8 / 12 px in C6 C7, 150 / 200 / 180 ms in C19 C22 C24, 1.4 s in C16, 0.98 in C19, 40 ms and the 8-item cap in C27 C28, 64 / 12 / 24 px, `rgb(0 0 0 / 0.72)` and `blur(12px)` in C41 C43, 44 px and 36 px in C45 C46) | - |
| `plan.md` AC 1-54 | yes - read in full | none | AC 24 - "Senha alterada." on `/account` (see Coverage) |
| `plan.md` `## Observable`, `Out of scope`, Open question | yes | none - the Open question (real prices) was settled by AD-106; `site_content_is_the_only_source_of_landing_copy` (the `EXEMPLO` guard) now passes | - |
| AD-098 visual reference (2026-10-21) | **no - not openable**. The image was sent in conversation and is not in the repo. The only images under the repo (`.turbo/percurso/ref/mockup-tres-telas.png`, `prancha-treino.png`) are dated 2026-10-19, so they predate AD-098 and are not that reference. What I checked instead: the AD-098 row in `.specs/STATE.md:143` and the tokens in `packages/ui/src/globals.css:10-29` (`--primary: #fcf43c`, `--radius: 1rem`, etc.) | none found against the record: `site-header.tsx` uses only tokens (`bg-primary`, `bg-card`, `bg-background`, `text-muted-foreground`), the door-7 literals, and the nav pill classes `border-white/10 bg-black/40`, which come unchanged from the 7471232 hero nav (`git show 7471232:apps/web/src/app/page.tsx:123`); the feature adds no new colour literal to `globals.css` | - (arrangement against the image itself could not be judged; see Observations) |
| `.specs/STATE.md` AD-098 to AD-106 | yes | none - AD-099 to AD-105 restate doors 1-7. AD-106 is recorded in checks.md `## Supersedes` and matches what C39 does now (below) | - |

Element enumeration, door 7 (the only new screen surface): header = logo (C44 C45), nav `SITE.labels.nav` with 5 links in order (C44, C42 via `landing.spec.ts:35`), session CTA in both states (C44 C46), "Abrir menu" 44 px with aria (C45); menu = full-screen dialog `#site-menu` named "Menu" (C46), close "Fechar menu" (C49), 5 links 36 px uppercase in a cascade (C46 C47), "Quero treinar" → `#planos`, session CTA, Instagram (C46). Regions: header is the only `banner`, a sibling before `main`, not in the hero (C42); the menu covers the viewport (C46). Door 3 skeleton: shell, avatar 44 px, 256 px side column, bottom bar, 30 px title, 4 × 96 px panels, same content box as `main` (C15). No element drawn by a door is missing a check, and the code renders nothing in these surfaces that the doors do not name.

**C39 and AD-106.** I checked the author's claim myself (`git diff 70e9826 HEAD -- apps/web/e2e/fixtures/motion-baseline`, plus a JSON comparison of each entry): in both `390.json` and `1440.json` the 21 shell-route entries are identical to the 70e9826 baseline (21/21 `json.dumps`-equal; the git diff touches only the 26 string lines of the `/` entry). The `/` entry differs **only by removals**: 47 text lines and 42 ARIA lines, all inside `region "Planos"`, and 10 focus entries (`Mensal`, `Anual`, `Matricule-se` ×3, twice). The remaining focus list is unchanged as a prefix, followed by the wrap-around stops that used to sit past the 40th press. So the new `/` entry is the original 7471232 recording with `#planos` cut out, whatever code re-recorded it. This matches checks.md `## Supersedes` (lines 54-63) and the `LANDING_EXCLUDED` change at `apps/web/e2e/support/motion.ts:119`. The `#planos` content is now covered by `landing.spec.ts:189` `plans_show_one_card_without_a_price`. Consistent; no finding.

## Checks

E2E = `apps/web/node_modules/.bin/playwright test` (whole suite, one invocation, 407 passed). REPO = `pnpm --filter @academia/repo-tests exec vitest run` (one invocation, 74 passed). "ok #n" is the line in the e2e output.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `motion ^14.5.0` in catalog; only web and ui declare it, as `catalog:`; lock has 14.5.0 | REPO ✓ `motion_is_the_only_added_dependency` | `tests/repo/identidade.test.ts:123` `expect(deps.motion, path).toBe('catalog:')`; `:126` `expect(declaring.sort()).toEqual(['apps/web/package.json','packages/ui/package.json'])`; `:129` catalog regex `motion: \^14\.5\.0`; `:130` `toContain('motion@14.5.0')` | PASS |
| C2 | provider wraps children, MotionConfig user, no host element; no wrapper in DOM | REPO ✓ `motion_provider_is_motion_config_user_without_a_host_element`; E2E ok 192 `motion_provider_adds_no_element_to_the_body` | `tests/repo/motion.test.ts:46` `toContain('<MotionConfig reducedMotion="user" transition={{ duration: MOTION.base, ease: MOTION.ease }}>')`; `:48` no lowercase tag `toEqual([])`; `:52` `<body>\s*<MotionProvider>{children}</MotionProvider>`; `apps/web/e2e/motion.spec.ts:51` `expect(children).toEqual([{ tag: 'div', shell: true }])` | PASS |
| C3 | `MOTION` literal; no numeric literal in Motion props outside motion.tsx | REPO ✓ `motion_tokens_are_the_door_one_literal`, ✓ `motion_props_read_durations_and_distances_from_the_tokens` | `tests/repo/motion.test.ts:60` `toEqual({ micro: 0.15, base: 0.2, long: 0.3, ease: [0.2, 0.8, 0.2, 1], distance: 8, distanceDesktop: 12, stagger: 0.04, staggerMax: 8 })`; `:72` `expect(literals, path).toEqual([])` | PASS |
| C4 | imports only `motion/react(-client)`, ≥1, no `framer-motion` | REPO ✓ `motion_imports_only_from_motion_react` | `tests/repo/motion.test.ts:80` `toBeGreaterThan(0)`; `:81` `toMatch(/ motion\/react(?:-client)?$/)`; `:83` `not.toContain('framer-motion')` | PASS |
| C5 | new guard passes; old guard and `DUKFIT_BASE` gone | REPO ✓ both | `tests/repo/motion.test.ts:89-91` `toContain("test('motion_is_the_only_added_dependency'")`, `not.toContain('dukfit_adds_no_npm_dependency')`, `not.toContain('DUKFIT_BASE')` | PASS |
| C6 | 390: first frame opacity ≤ 0.2, y in (6,8], monotonic, end at 200 ± 17 ms | E2E ok 193 | `apps/web/e2e/motion.spec.ts:82-84` `toBeLessThanOrEqual(0.2)`, `toBeGreaterThan(low)`, `toBeLessThanOrEqual(high)`; `:86-87` monotonic; `:91` `Math.abs(end.t - first.t - 200) <= 17`; `:97` `expectEntrance(..., 6, 8, '390')` | PASS |
| C7 | (10,12] at 1440 and 1024, (6,8] at 1023 | E2E ok 194 | `apps/web/e2e/motion.spec.ts:103-105` `[DESKTOP,10,12]`, `[1024,10,12]`, `[1023,6,8]`; `:108` `expectEntrance` | PASS |
| C8 | SSR `main` has no opacity:0/transform; first doc frames static | E2E ok 195 | `apps/web/e2e/motion.spec.ts:119-120` `not.toContain('opacity:0')`, `not.toContain('transform')`; `:139-140` 36 frames `toMatchObject({ opacity: '1', transform: 'none' })` | PASS |
| C9 | print pages: 0 page-motion, main and descendants still, by goto and by client nav | E2E ok 196 | `apps/web/e2e/motion.spec.ts:164,180` `toHaveCount(0)`; `:150` and `:177` `toMatchObject({ opacity: '1', transform: 'none' })` over `main, main *` | PASS |
| C10 | reduced: new main static on every frame | E2E ok 197 | `apps/web/e2e/motion.spec.ts:190` `toMatchObject({ opacity: '1', transform: 'none' })` | PASS |
| C11 | pointer-events auto; only opacity/transform change | E2E ok 198 | `apps/web/e2e/motion.spec.ts:200` `toBe('auto')`; `:201` each fixed property `toBe(frames[0].style[property])`; `:197` transform changed | PASS |
| C12 | 19 non-print shell routes: 1 page-motion element, the only main | E2E ok 199 | `apps/web/e2e/motion.spec.ts:209` `toHaveLength(19)`; `:212-214` `toHaveCount(1)` ×2, `toHaveAttribute('data-motion','page')` | PASS |
| C13 | pending nav shows one skeleton with status, aria-busy, "Carregando…" | E2E ok 200 | `apps/web/e2e/motion.spec.ts:236-239` count 1, `role` `status`, `aria-busy` `true`, `getByRole('status', { name: /Carregando…/ })` count 1 | PASS |
| C14 | 11 `loading.tsx` re-export AppLoading | REPO ✓ `eleven_segments_have_app_loading` (11 cases + set) | `tests/repo/motion.test.ts:114` `toBe("export { AppLoading as default } from '../../components/app-loading.tsx';")`; `:121` all `loading.tsx` dirs `toEqual(SEGMENTS)` | PASS |
| C15 | skeleton geometry and content box equal to `main` | E2E ok 201 | `apps/web/e2e/motion.spec.ts:252` title `toBe(30)`; `:254` panels `toHaveCount(4)`; `:256` `toBe(96)`; `:267` side `toBe(256)`; `:270` bottom bar visible; `:282` `expect(box).toEqual(main)` | PASS |
| C16 | blocks aria-hidden, skeleton-pulse 1.4s; keyframes 0.35↔0.7; reduced none / 0.5 | E2E ok 202; REPO ✓ `skeleton_pulse_keyframes_are_the_door_three_literal` | `apps/web/e2e/motion.spec.ts:299-301` `toBe('true')`, `{ name: 'none', opacity: '0.5' }`, `{ name: 'skeleton-pulse', duration: '1.4s' }`; `tests/repo/motion.test.ts:127` `toEqual([0.35, 0.7])`; `:130` reduced literal | PASS |
| C17 | load-error text unchanged; alert feedback-in 0.18s | E2E ok 381 `students.spec.ts` `load_failure_shows_retry_on_list_and_ficha`, ok 203 `load_error_alert_animates_in_180ms` | `apps/web/e2e/students.spec.ts:242` `getByText('Não foi possível carregar os alunos.')` visible; `apps/web/e2e/motion.spec.ts:312` `toEqual({ name: 'feedback-in', duration: '0.18s' })` | PASS |
| C18 | no loading/template at root, login, 2FA; `/login` hang shows 0 skeleton | REPO ✓ `no_skeleton_on_landing_login_or_two_factor`; E2E ok 204 | `tests/repo/motion.test.ts:136-137` `not.toContain('loading.tsx')`, `not.toContain('template.tsx')`; `apps/web/e2e/motion.spec.ts:319-320,326` `toHaveCount(0)` | PASS |
| C19 | transition includes transform 0.15s; held = 0.98; reduced none | E2E ok 205 | `apps/web/e2e/motion.spec.ts:371-372` `toContain('transform')`, `toBe('0.15s')`; `:373` `toBe('matrix(0.98, 0, 0, 0.98, 0, 0)')`; `:378` `toBe('none')` | PASS |
| C20 | busy: aria-busy, disabled, one 16 px aria-hidden svg; cleared on answer | E2E ok 206 | `apps/web/e2e/motion.spec.ts:393-397` aria-busy `true`, `toBeDisabled()`, svg count 1, `aria-hidden` `true`; `:399` `toEqual(['16px','16px'])`; `:403` `[aria-busy="true"]` count 0 | PASS |
| C21 | 0 `disabled={pending}`; the 14 base files have `busy={pending}` | REPO ✓ `pending_controls_use_busy` | `tests/repo/motion.test.ts:162` `toHaveLength(14)`; `:164` `not.toContain('disabled={pending}')`; `:166` `toContain('busy={pending}')` | PASS |
| C22 | overlay-in 0.15s, dialog-in 0.2s; keyframe literals | E2E ok 207; REPO ✓ `action_keyframes_are_the_door_five_literal` | `apps/web/e2e/motion.spec.ts:412-413` `toEqual({ name: 'overlay-in', duration: '0.15s' })`, `{ name: 'dialog-in', duration: '0.2s' }`; `tests/repo/motion.test.ts:175-176` keyframe regexes | PASS |
| C23 | Escape and Cancelar: 0 dialogs next frame, focus on trigger | E2E ok 208 | `apps/web/e2e/motion.spec.ts:428` `expect(left, close).toBe(0)`; `:429` `toBeFocused()` | PASS |
| C24 | the 2 success messages carry feedback, feedback-in 0.18s | E2E ok 209 | `apps/web/e2e/motion.spec.ts:443-444` and `:453-454` `toHaveAttribute('data-motion','feedback')`, `toEqual({ name: 'feedback-in', duration: '0.18s' })`. Passes as written, but the claim's set is wrong: the app has 3 success messages (Coverage) | PASS |
| C25 | failed register alert keeps role and text, animates | E2E ok 210 | `apps/web/e2e/motion.spec.ts:464-465` `toHaveText('Não foi possível carregar o aluno.')` + `feedback-in 0.18s`; `:472-473` `toHaveText('Não foi possível registrar a presença.')` + same | PASS |
| C26 | keyframes only opacity/transform; `.pressable` lists transform, background-color; no geometry | REPO ✓ `action_animations_touch_only_opacity_transform_background` | `tests/repo/motion.test.ts:188` property set `toEqual`; `:192` `toEqual(['transform','background-color'])`; `:200,203` `not.toMatch(banned)` | PASS |
| C27 | 7 cards, i × 40 ± 17 ms, end static | E2E ok 211 | `apps/web/e2e/motion.spec.ts:548` `toBe(7)`; `:550` `Math.abs(time - index*40) <= 17`; `:551` `{ opacity: '1', transform: 'none' }` | PASS |
| C28 | 5 lists, 12 items, i<8 at i × 40 ± 17, 9th-12th ≤ 297 | E2E ok 212 | `apps/web/e2e/motion.spec.ts:560` `toHaveLength(12)`; `:563` `<= 17`; `:564` `toBeLessThanOrEqual(280 + 17)`; `:567` item 0 starts `< 1` | PASS |
| C29 | reduced: 5 lists + dashboard static | E2E ok 213 | `apps/web/e2e/motion.spec.ts:584` `toMatchObject({ opacity: '1', transform: 'none' })` | PASS |
| C30 | order = fixture, names = reduced, `tr` still at 1440 | E2E ok 214 | `apps/web/e2e/motion.spec.ts:615` `toEqual(names[list.key])`; `:616` `toEqual(still)`; `:620` `tr` `{ opacity: '1', transform: 'none' }` | PASS |
| C31 | new rows start < 1; same rows never < 1 | E2E ok 215 | `apps/web/e2e/motion.spec.ts:647` `some(opacity < 1)` `toBe(true)`; `:655` `toBe(1)` | PASS |
| C32 | no entrance on print pages | E2E ok 196 (same as C9) | `apps/web/e2e/motion.spec.ts:150,177` every descendant of `main` `{ opacity: '1', transform: 'none' }` | PASS |
| C33 | 360: scrollWidth = clientWidth every frame; scroller inside panel | E2E ok 216; ok 127 `dukfit.spec.ts` `mobile_tables_scroll_inside_panel_and_forms_are_full_width` | `apps/web/e2e/motion.spec.ts:681` `expect(scroll).toBe(client)`; `:687` `toBeLessThanOrEqual(edges.panel)`; `apps/web/e2e/dukfit.spec.ts:747` `overflow` `toBe('auto')` | PASS |
| C34 | reduced: 0 running animations, animation-name none, over 6 setups | E2E ok 217 | `apps/web/e2e/motion.spec.ts:712-714` `count > 0`, `running` `toBe(0)`, `toBe('none')`; setups `:719,724,732,741,748,754` | PASS |
| C35 | no h-scroll at 360/1440 on `/`, dashboard, students, staff | E2E ok 218 | `apps/web/e2e/motion.spec.ts:797` and `:809` `expect(scroll).toBe(client)` | PASS |
| C36 | 0 CSP violations incl. transition, dialog, menu; print e2e green | E2E ok 78 csp, ok 219, ok 286, ok 289 | `apps/web/e2e/csp.spec.ts:69` and `:80` `toEqual([])`; `apps/web/e2e/motion.spec.ts:835,843` `toEqual([])`; `apps/web/e2e/privacy-print.spec.ts:43` and `:132` section titles `toEqual` | PASS |
| C37 | `pnpm verify` exits 0 | `pnpm verify` **exit 1** twice: first run `EPERM: operation not permitted, mkdir 'C:\Users\Admin\AppData\Local\Temp\...'` in `@academia/database:test` (11 files) and `@academia/api#test`; second run with `TMP`/`TEMP` = `node_modules/.tmp-verify`: `@academia/database:test` "Could not find a working container runtime strategy" (11 files). Outside turbo, every task `verify` runs is green: `pnpm -r --workspace-concurrency=1 run lint` / `typecheck` / `build` exit 0; `pnpm --filter` `test` contracts 16, repo-tests 74, database 68, api 713 passed; web test = the 407-pass e2e run above | no `file:line` - the literal proof does not exit 0 in this environment. The failure is turbo's child-process environment (temp dir and Docker detection), not product code, but the check names `pnpm verify` and that command is red here | NOT PROVEN |
| C38 | no API/contract/schema/proxy/lib change | `git diff --exit-code ...` exit 0 | command exit code 0 at `6e67520` (no file:line by nature; the diff is empty) | PASS |
| C39 | copy, ARIA and 40-Tab focus equal the baseline on 21 routes + `/` | E2E ok 220 | `apps/web/e2e/motion.spec.ts:857` `toHaveLength(21)`; `:876` keys `toEqual`; `:878-880` `text` `toBe`, `aria` `toBe`, `focus` `toEqual`; exclusion `apps/web/e2e/support/motion.ts:119` | PASS |
| C40 | no-preference: 200 ms and 1.4 s | E2E ok 193, ok 202 | `apps/web/e2e/motion.spec.ts:91` duration `<= 17` around 200; `:301` `duration: '1.4s'` | PASS |
| C41 | header visible within 88 px at 5 widths × 3 scrolls; fixed, top 12, 64 px, z 40, insets | E2E ok 157 | `apps/web/e2e/landing-header.spec.ts:53-58` `>= 0`, `<= 88`, `toBe(64)`, `'fixed'`, `'12px'`, `'40'`; `:60-61` inset `toBe(inset)` | PASS |
| C42 | the only banner, header before main, not in the hero | E2E ok 158; ok 170 `landing.spec.ts` hero | `apps/web/e2e/landing-header.spec.ts:71` `toHaveCount(1)`; `:79` `toEqual({ tag: 'header', slot: 'site-header', next: 'main' })`; `:81-82` `toHaveCount(0)`; `apps/web/e2e/landing.spec.ts:36-37` hero nav/logo `toHaveCount(0)` | PASS |
| C43 | 0/23 transparent no flag; 25/400 flag, 0.72, blur 12, 0.2s on bg and border | E2E ok 159 | `apps/web/e2e/landing-header.spec.ts:91,93` `not.toHaveAttribute('data-scrolled')`, `'rgba(0, 0, 0, 0)'`; `:97,108,109,113` flag, `'rgba(0, 0, 0, 0.72)'`, `'blur(12px)'`, `'0.2s'` | PASS |
| C44 | 1024/1440: logo, nav 5 links in order + href, session CTA both states, no menu button | E2E ok 160 | `apps/web/e2e/landing-header.spec.ts:128-129` labels and hrefs `toEqual`; `:132` href `/dashboard` or `/login`; `:133` `toBeHidden()` | PASS |
| C45 | < 1024: logo, CTA, 44 × 44 button with aria; desktop nav hidden | E2E ok 161 | `apps/web/e2e/landing-header.spec.ts:148` `toEqual([44, 44])`; `:149-150` `aria-expanded` `false`, `aria-controls` `site-menu`; `:151` `toBeHidden()` | PASS |
| C46 | full-screen `#site-menu` "Menu", focus in, expanded, 36 px uppercase links, CTAs, Instagram | E2E ok 162; ok 121 `dukfit.spec.ts` landing | `apps/web/e2e/landing-header.spec.ts:167` `toEqual([0, 0, 390, 844])`; `:168` `toBe(true)`; `:170` `aria-expanded` `true`; `:174` `toEqual(['36px','uppercase'])`; `:176-181` hrefs; `apps/web/e2e/dukfit.spec.ts:631` | PASS |
| C47 | overlay-in 0.15s, dialog-in 0.2s, links at i × 40 ± 17; reduced none and still | E2E ok 163 | `apps/web/e2e/landing-header.spec.ts:193-194` `toEqual(['overlay-in','0.15s'])`, `['dialog-in','0.2s']`; `:197` `<= 17`; `:207-208` `toBe('none')`; `:212` still | PASS |
| C48 | each menu link closes the menu; eyebrow below the header and in view | E2E ok 164 | `apps/web/e2e/landing-header.spec.ts:224` `toHaveCount(0)`; `:229` `toBeGreaterThanOrEqual(headerBottom)`; `:230` `toBeLessThan(MOBILE.height)` | PASS |
| C49 | Escape / "Fechar menu": 0 menu next frame, focus on button | E2E ok 165 | `apps/web/e2e/landing-header.spec.ts:243` `toBe(0)`; `:244` `toBeFocused()` | PASS |
| C50 | desktop link: section top ≥ header bottom | E2E ok 166 | `apps/web/e2e/landing-header.spec.ts:256` `toBeGreaterThanOrEqual(headerBottom)` | PASS |
| C51 | one `aria-current="location"`, the section's | E2E ok 167 | `apps/web/e2e/landing-header.spec.ts:267-268` `toHaveCount(1)`, `toHaveAttribute('href', item.href)` | PASS |
| C52 | `SITE.menu` literal; header has no literal text and imports SITE | REPO ✓ `site_content_has_the_door_five_shape`, ✓ `site_header_reads_every_text_from_site` | `tests/repo/identidade.test.ts:194` `toEqual({ open: 'Abrir menu', close: 'Fechar menu', title: 'Menu' })`; `tests/repo/motion.test.ts:211,214,220,222` | PASS |
| C53 | 360 no h-scroll closed/open; h1 not under the header at 390/1440 | E2E ok 168 | `apps/web/e2e/landing-header.spec.ts:277,281` `toBe(client)`; `:290` `overlaps` `toBe(false)` | PASS |
| C54 | landing with menu: 0 CSP, same origin, 0 page motion, 0 skeleton | E2E ok 169; ok 121 | `apps/web/e2e/landing-header.spec.ts:312-315` `toEqual([])`, `toEqual([origin])`, `toHaveCount(0)` ×2; `apps/web/e2e/dukfit.spec.ts:634-635` | PASS |

Diff relevance: every proof above sits in a file the feature added (`motion.spec.ts`, `landing-header.spec.ts`, `tests/repo/motion.test.ts`, `support/motion.ts`) or edited inside `7471232..HEAD` (`identidade.test.ts`, `landing.spec.ts`, `dukfit.spec.ts`, `students.spec.ts`), except C36's `csp.spec.ts` and `privacy-print.spec.ts` and C33's second proof, which are existing regression guards and are named as such by the check.

## Coverage

Recomputed from the authority over each set, not read from checks.md.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| success messages after an action (3, not 2) | the code: every success notice set after an `ok` result in `apps/web/src` (`grep` of `setNotice`/`setMessage`, and `role="status"` at 7471232) | "Presença registrada às …" (`check-in-desk.tsx:186`) C24 · "Configurações salvas." (`privacy-form.tsx:94`) C24 · **"Senha alterada."** (`apps/web/src/app/account/change-password-form.tsx:25`, rendered at `:38` as `<Alert variant=...>` with no `data-motion`) - no proof, and the code does not meet AC 24: the message animates only because `Alert` is `role="alert"` (`packages/ui/src/components/alert.tsx:21`) and carries no `data-motion="feedback"` | "Senha alterada." (AC 24) |
| shell routes for `[data-motion="page"]` (21) | the framework: the 25 `page.tsx` files under `apps/web/src/app`, minus `/`, `/login`, `/login/two-factor`, `/two-factor/setup`; 21 files render `<Shell` | 19 non-print C12 (`motion.spec.ts:209` asserts 19) · 2 print C9 | - |
| shell routes for copy, names and focus (21) + `/` | same as above | C39, `motion.spec.ts:857` asserts 21; baseline keys match (22) | - |
| `loading.tsx` segments (11) | plan door 3 / AD-101 list | C14 table-driven, and `motion.test.ts:121` asserts no other `loading.tsx` exists | - |
| routes without skeleton or page motion (4) | plan AC 18 | `/` C18 C54 · `/login` C18 · `/login/two-factor`, `/two-factor/setup` C18 (repo, file absence) | - |
| page transition decisions (4 + breakpoint) | `apps/web/src/components/page-transition.tsx:17-36` and `useEntrance` (`packages/ui/src/motion.tsx:40-47`) | first document C8 · later nav C6 · `/print` C9 · reduced C10 · 1023/1024 C7 | - |
| pending controls (14 files) | `git grep 'disabled={pending}' 7471232 -- apps/web/src`: 14 files, the same list as `motion.test.ts:144-159` | C21 table-driven | - |
| CSS microstates (4) | door 5 rules in `globals.css:112-179` | press C19 · dialog open C22 · close C23 · alert/feedback C17 C24 C25 | - |
| animated lists (5) | plan door 4 | students, plans, payments, staff, check-ins C28 C29 C30 C33 | - |
| stagger edges (3) | `delayOf`, `packages/ui/src/motion.tsx:50` | index 0, index 7 (8th) and indexes 8-11 C28 (fault F3 killed at item 8) | - |
| entrance distance by breakpoint (2) | `useEntrance` / `Enter`, `packages/ui/src/motion.tsx:44,65` | 8 px below 1024 asserted only for the page (C6 C7); **12 px from 1024 for `Reveal`/`StaggerItem`/`StaggerCell`: no proof** (fault F5 survived) | `Reveal`/`Stagger` at ≥ 1024 px |
| reduced-motion surfaces (6) | AC 34 | page C10 C34 · skeleton C16 C34 · dialog C34 · feedback C34 · lists C29 C34 · landing menu C47 C34 | - |
| header widths (5) and breakpoint edge (2) | AC 41, AC 44-45 | 360 / 390 / 768 / 1024 / 1440 C41; 1023 C45, 1024 C44 | - |
| header scroll states (2) | `site-header.tsx:90` (`scrollY >= 24`) | 0, 23 / 25, 400 C43 (fault F4 killed) | - |
| session CTA states (2) | `site-header.tsx:18-24` | without / with session C44 C46 | - |
| `SITE.nav` sections (5) | `apps/web/src/app/site-content.ts` `SITE.nav` | C48 C50 C51 iterate `SITE.nav` | - |
| menu close paths (3) | `site-header.tsx:31-35,45` and Radix Escape | Escape, "Fechar menu" C49 · section link C48 | - |
| app dialogs (all `DialogContent`) | `packages/ui` `Dialog` is the only dialog component; the "Mais" menu (`apps/web/src/components/nav.tsx:131-132`) and `#site-menu` use it | inactivation dialog C22 C23 · site menu C47 C49; the CSS rule is per component, so one instance per rule is enough | - |
| superseded proofs (4) + AD-106 (2) | checks.md `## Supersedes` | `dukfit_adds_no_npm_dependency` gone (C5) · hero proof rewritten (`landing.spec.ts:28-37`) · `landing_has_no_shell_…` rewritten (`dukfit.spec.ts:619-631`) · `menu` key (`identidade.test.ts:194`) · `plans_show_one_card_without_a_price` (`landing.spec.ts:189`) · `#planos` exclusion (`support/motion.ts:119`) | - |
| startup config: `MotionProvider` (1 assembly) | `apps/web/src/app/layout.tsx`, the only root layout | read directly: the provider wraps `{children}` inside `<body>` (asserted at `motion.test.ts:52`); the e2e server is `next build && next start` of this same app (`apps/web/playwright.config.ts:22`) | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, rendered in the browser | `page-transition.tsx`, `packages/ui/src/motion.tsx` (`Reveal`/`Stagger`/`StaggerItem`/`StaggerCell`), `site-header.tsx`, `Button` `busy` | browser proof, one case per branch | **no** - every branch is proven except one: the breakpoint decision that the row's own evidence names for `Stagger` ("breakpoint distance"). No proof asserts a list item or card distance at ≥ 1024 px, and fault F5 (always 8 px in `Enter`) survived all 5 entrance proofs. `PageTransition` (C6-C10), `SiteHeader` (C43 C44 C45 C49 C51) and `busy` (C20) are met |
| Structural rule over files | `identidade.test.ts`, `motion.test.ts` over manifests, imports, tokens, `loading.tsx`, `busy`, `site-header.tsx` | one repo test, table-driven over the set | yes - C1 C3 C4 C5 C14 C21 C52 each go over the whole set (fault F1 killed) |
| CSS rule (keyframes, `.pressable`, reduced-motion block) | `packages/ui/src/globals.css` | a repo test for the literal **and** a browser test for the computed value, for each door-5 rule | **no** - keyframes, `.pressable`, dialog and alert/feedback rules have both. The reduced-motion block (`globals.css:182-206`) has a repo literal only for `[data-slot='skeleton']` (`motion.test.ts:129-130`); its `.pressable`, dialog and `[role='alert']`/`[data-motion='feedback']` rules have browser proofs (C19 `:378`, C34, C47) but no repo literal test (`grep` of `tests/repo` for `transition: none` / `animation: none` / `reduced` finds only the skeleton line) |
| Instrumentation | `MotionProvider`, `Skeleton`, `AppLoading`, 11 `loading.tsx` | none beyond the structural row | yes - covered by C2, C13-C16, C14 |

## Faults injected

One worktree at `HEAD` (`git worktree add --detach <scratchpad>/wt HEAD`, deps by `pnpm install --offline --frozen-lockfile`), each fault applied alone with `sed`, the narrowest proof run, then `git checkout -- .` before the next. Real-tree `git status --porcelain` before: `?? CLAUDE.md`; after the worktree was removed: `?? CLAUDE.md` (diffed, identical). The worktree is unregistered (`git worktree list` shows only the main tree) and its directory is deleted.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1: `busy={pending}` → `disabled={pending}` (the sign-out control loses its busy state) | `apps/web/src/components/sign-out-button.tsx:18` | yes - `pending_controls_use_busy` failed at `tests/repo/motion.test.ts:164` |
| F2: page transition `duration: MOTION.base` → `MOTION.long` (300 ms) | `apps/web/src/components/page-transition.tsx:32` | yes - `page_enters_with_opacity_and_eight_pixels_in_200ms_on_mobile`: "390 duração, Expected <= 17, Received 100" |
| F3: stagger cap shifted by one, `MOTION.staggerMax - 1` → `MOTION.staggerMax` | `packages/ui/src/motion.tsx:50` | yes - `lists_stagger_8_items_at_40ms_and_cap_the_rest`: "/students item 8, Expected <= 297, Received 316.7" |
| F4: header threshold `scrollY >= 24` → `>= 40` | `apps/web/src/components/landing/site-header.tsx:90` | yes - `header_turns_solid_after_24px_in_200ms`: "y=25, Expected: have attribute" |
| F5: card/list entrance ignores the desktop distance, `enter(distance)` → `enter(MOTION.distance)` | `packages/ui/src/motion.tsx:65` | **no - survived**: `dashboard_cards_reveal_with_40ms_steps`, `lists_stagger_8_items_at_40ms_and_cap_the_rest`, `reduced_motion_lists_are_static`, `entrance_keeps_order_names_and_leaves_table_rows_alone` and `menu_animates_overlay_panel_and_stagger_and_not_when_reduced` all passed (5 passed) |

## Observations (not counted in the verdict)

- **C39 claim text is stale.** It still says `/` is compared "outside `[data-slot="site-header"]` and `#site-menu`". The proof also excludes `header` (the old hero header) and, since AD-106, `#planos` (`support/motion.ts:119`). `## Supersedes` records `#planos`, so this is not a contradiction, but the claim line should say what the proof does.
- **AC 3 against door 4.** `ENTER = 0.22` (`packages/ui/src/motion.tsx:23`) is a duration that does not come from `MOTION`. Door 4 asks for 0.22 s and `MOTION` has no such member, so C3 exempts `motion.tsx` and stays green. The plan contradicts itself here; a `MOTION` member would settle it.
- **AC 21's set is the literal `disabled={pending}`.** 10 submit buttons still use `disabled={isSubmitting}` (`change-password-form.tsx:53`, `plan-form.tsx:132`, `staff-form.tsx:104`, `student-form.tsx:234`, `users-panel.tsx:207,277`, `login-form.tsx:59`, `two-factor-form.tsx:57`, `two-factor-setup.tsx:80,123`, `two-factor-toggle.tsx:55`). They get no spinner. That fits door 5 as written; it is a scoping choice worth knowing.
- **Precision.** C2's e2e test asserts that the body's only child is the shell root, not a with/without-provider comparison. C30 compares `innerText` as the "accessible name". The header border literal `rgb(255 255 255 / 0.1)` (door 7) is not asserted. The order of elements inside the header (logo, nav, CTA) and inside the menu (links, then CTAs, then Instagram) is not asserted. The doors list these elements but give an explicit order only for the `SITE.nav` links (AC 44), and I could not open the AD-098 image to see whether it fixes the rest.
- Step 5 (walking the flow with the user) was not done. This is a sub-agent run with no user in the loop.

## Gate

- E2E `apps/web/node_modules/.bin/playwright test` (from `apps/web`) - **407 passed, 0 failed** (8.7 min)
- REPO `pnpm --filter @academia/repo-tests exec vitest run` - **74 passed, 0 failed**
- C38 `git diff --exit-code 7471232..HEAD -- apps/api packages/contracts packages/database apps/web/src/proxy.ts apps/web/src/lib` - exit 0
- `pnpm verify` - **exit 1**, environment: turbo's child tasks hit `EPERM` under `%LOCALAPPDATA%\Temp`, and with a repo-local temp dir testcontainers cannot find the Docker runtime. Outside turbo: `pnpm -r --workspace-concurrency=1 run lint|typecheck|build` exit 0; `pnpm --filter <pkg> test` contracts 16, repo-tests 74, database 68, api 713 passed, 0 failed
- Faults: 5 injected, 4 killed, 1 survived

**Ranked gaps**:
1. AC 24 / Coverage "success messages" - "Senha alterada." on `/account` renders without `data-motion="feedback"`, and no proof covers it; C24's "the 2 success messages" undercounts the set - `apps/web/src/app/account/change-password-form.tsx:38`
2. Test policy row "Decides, rendered in the browser" unmet - no proof of the 12 px entrance distance from 1024 px for `Reveal`/`Stagger`/`StaggerCell`; fault F5 survived - `packages/ui/src/motion.tsx:44,65`
3. Test policy row "CSS rule" unmet - the reduced-motion block's door-5 rules (`.pressable`, dialog, alert/feedback) have no repo literal test - `packages/ui/src/globals.css:182-206`, `tests/repo/motion.test.ts:129`
4. C37 not proven - `pnpm verify` exits 1 in this environment (turbo temp/Docker), although every constituent task passes when run directly - no file:line
