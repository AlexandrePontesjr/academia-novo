# Identidade visual checks

Profile: ui
Plan: `.specs/features/identidade-visual/plan.md`

## Intent

25 checks in 3 slices · 2 one-way doors · 0 open, 0 blocking.

O app inteiro passa a vestir a identidade da referência: fundo #0a0a0a, superfícies em camadas
(#141414, #1f1f1f), borda #262626, texto #f5f5f5, secundário #a3a3a3, acento #cdf720 e raio de
16 px, com Manrope self-hosted e estados de foco, erro e impressão legíveis. Rotas, textos, ordem
e comportamento ficam como estão; o que muda é o CSS computado e a página 404.

Scope guard: the checks below are the plan's AC 1 a AC 24, the per-screen enumeration that AC 22
names, the two doors of the `Landing` and every surface the `Observable` lists. Nada fora disso
entra no build.

## Binding sources

| Source | What it decides |
| --- | --- |
| prancha do app de treino (`C:\Users\Admin\.dsh\attachments\v1\objects\bc\bc6ccd743e64de2e4526c9d951cdb57150254557d57a4da825df608d77909e0f`) | paleta amostrada: fundo #0a0a0a, cartões #141414/#1f1f1f, borda #262626, texto #f5f5f5, secundário #a3a3a3, acento #cdf720; hierarquia dos títulos e números de destaque |
| mockup de três telas (`C:\Users\Admin\.dsh\attachments\v1\objects\f3\f3e130ec07c8d5d4f73be87b5c6167ea8b77b7a705d6445f0f6c870892c60e3a`) | raio de cartão ~16 px, cartões em camadas sobre o fundo, botões de ação com acento lime e números tabulares |
| literais de paleta do `plan.md` (`Landing`, door 1) e os hexes dos AC 2 a AC 17 | os valores exatos que os checks abaixo afirmam |

Correção aprovada pelo usuário em 2026-10-19, antes destes checks: no `Landing`, `--primary` e
`--ring` passaram a `oklch(0.914 0.2148 121.5)` (renderiza #cdf720, o do AC 2) e `--destructive`
a `oklch(0.577 0.215 27.3)` (renderiza #dc2626, o do AC 17). Os dois literais anteriores
renderizavam #cdf71f e #e7000b; a paleta e o resto do plano não mudaram.

## Checks

### S1 - A identidade na entrada e no painel · tokens de tema, componentes de `@academia/ui`, shell e o painel

**C1** - Every authenticated page renders the resolved background rgb(10, 10, 10) and the resolved text rgb(245, 245, 245), and the door-1 literal `:root { color-scheme: dark; --background: oklch(0.145 0 0); ... --radius: 1rem; }` is the one in `globals.css` (AC 1, door 1)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "every_authenticated_screen_uses_the_dark_background_and_foreground"`
Proof: `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts -t "identity_tokens_and_radius_resolve_the_door_one_literal"`

**C2** - The primary action button resolves its computed background to rgb(205, 247, 32), its computed text to rgb(10, 10, 10) and its `border-radius` to 9999px (AC 2)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "primary_button_is_the_lime_pill_with_dark_label"`

**C3** - A card renders the resolved background rgb(20, 20, 20), the resolved border rgb(38, 38, 38) and `border-radius: 16px` (AC 3)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "cards_are_layered_surfaces_with_sixteen_radius"`

**C4** - The shell header resolves to rgb(20, 20, 20) with a rgb(38, 38, 38) bottom border, the link of the current route resolves its text to rgb(205, 247, 32) and a link of another route does not (AC 4)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "shell_header_and_active_link_match_the_identity"`

**C5** - `/login` shows the "Entrar" heading, the labels "E-mail" and "Senha" and the submit "Entrar" on the resolved background rgb(10, 10, 10), the submit being the rgb(205, 247, 32) 9999px-radius button (AC 5)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "login_page_keeps_its_copy_on_the_dark_identity"`

**C6** - The body computed `font-family` names Manrope, the family loads with weights 400 and 800, and the font is the self-hosted `apps/web/src/fonts/manrope-variable.woff2` with `apps/web/src/fonts/OFL.txt` and no external `<link>` (AC 6, door 2)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "manrope_is_the_loaded_body_font_from_the_web_origin"`
Proof: `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts -t "manrope_font_asset_is_self_hosted_with_the_ofl_license"`

**C7** - The root declares `color-scheme: dark` and with `prefers-color-scheme: light` emulated the body still resolves to rgb(10, 10, 10)/rgb(245, 245, 245) (AC 7)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "light_scheme_preference_does_not_change_the_dark_palette"`
Proof: `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts -t "identity_tokens_and_radius_resolve_the_door_one_literal"`

**C8** - On `/` the card titles resolve their text to rgb(245, 245, 245) over a rgb(20, 20, 20) card, the stat numbers have computed `font-variant-numeric: tabular-nums` and the card links resolve to rgb(205, 247, 32) (AC 8)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "dashboard_uses_the_identity_hierarchy"`

**C9** - No element with an opaque background resolves to rgb(205, 247, 32) except buttons and links, and no page, header, card or table surface carries the accent; the accent reaches primary buttons, links, the active nav link and the focus ring only (AC 9)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "lime_accent_only_on_primary_actions_links_and_focus"`

### S2 - As telas restantes herdam a identidade · telas de lista, formulário, detalhe, conta e o balcão

**C10** - A table header resolves its background to rgb(31, 31, 31) and its text to rgb(212, 212, 212), the body text to rgb(245, 245, 245), the row border to rgb(38, 38, 38) and the table container `border-radius` to 16px (AC 10)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "tables_use_the_header_body_and_border_values"`

**C11** - An input and a select resolve their background to rgb(20, 20, 20), border to rgb(42, 42, 42) and text to rgb(245, 245, 245), an injected placeholder to rgb(138, 138, 138), and keyboard focus draws a 2px rgb(205, 247, 32) outline with a 2px offset (AC 11)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "form_controls_use_the_dark_surface_and_the_lime_focus"`

**C12** - An invalid form control resolves its border to rgb(248, 113, 113) and the error text beside it resolves to rgb(248, 113, 113) (AC 12)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "invalid_control_and_error_text_use_the_red"`

**C13** - A default `Alert` resolves background rgb(31, 31, 31) and text rgb(212, 212, 212); a destructive `Alert` resolves text and border to rgb(248, 113, 113) (AC 13)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "alert_variants_use_the_dark_and_destructive_values"`

**C14** - An open `Dialog` has its overlay resolving to rgba(0, 0, 0, 0.7) and its content resolving to background rgb(20, 20, 20), border rgb(38, 38, 38) and `border-radius` 16px (AC 14)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "dialog_overlay_and_content_use_the_identity"`

**C15** - The check-in result badge resolves to background rgba(205, 247, 32, 0.15) and text rgb(205, 247, 32) for `allowed`, and background rgba(248, 113, 113, 0.15) and text rgb(248, 113, 113) for `blocked` (AC 15)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "check_in_badges_use_the_allowed_and_blocked_values"`

**C16** - A link outside the nav resolves its text to rgb(205, 247, 32), is underlined and has computed `text-underline-offset` 4px (AC 16)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "links_outside_the_nav_are_lime_with_four_pixel_offset"`

**C17** - A destructive button resolves its background to rgb(220, 38, 38) and its text to rgb(250, 250, 250) (AC 17)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "destructive_button_uses_the_red_surface_and_light_text"`

**C18** - Each of the 24 screens keeps its route, its heading labels and the arrangement of its regions: for the 22 authenticated or setup screens the shell header precedes `main` with the h1 "Gestão de Academia", and every screen shows its heading sequence, table column sequence, form label sequence and section order exactly as today (AC 22 copy clause, `Observable` "todas as telas")
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "every_screen_keeps_its_copy_and_arrangement"`

### S3 - Impressão, exceção e regressão

**C19** - With print media emulated the body resolves to rgb(255, 255, 255) and black text on a normal page and on both `/students/[id]/print` and `/staff/[id]/print`, and the theme reset is the `@media print` block of `globals.css` (AC 18)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "print_media_resets_the_palette_to_white_and_black"`
Proof: `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts -t "print_media_resets_the_tokens_to_white_and_black"`

**C20** - An unknown route renders the 404 state on the resolved background rgb(10, 10, 10) with the heading "Página não encontrada" and a link whose href is `/` (AC 19)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "unknown_route_renders_the_dark_not_found_page"`

**C21** - An interactive element reached by Tab shows computed `outline` of 2px solid rgb(205, 247, 32) and `outline-offset: 2px` (AC 20)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "keyboard_focus_shows_the_lime_ring_with_two_pixel_offset"`

**C22** - The resolved contrast is at least 7:1 for rgb(245, 245, 245) on rgb(10, 10, 10), at least 4.5:1 for rgb(163, 163, 163) on rgb(10, 10, 10) and at least 7:1 for rgb(10, 10, 10) on rgb(205, 247, 32) (AC 21)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "contrast_ratios_meet_the_minimums"`

**C23** - `pnpm verify` exits 0 with every route, heading label and copy unchanged, including the Playwright screens, and `apps/web/e2e/csp.spec.ts` records zero `securitypolicyviolation` on `/login` and `/students` (AC 22)
Proof: `pnpm verify`
Proof: `pnpm --filter @academia/web exec playwright test e2e/csp.spec.ts -g "chromium_opens_login_and_students_without_csp_violations"`

**C24** - The feature adds no npm dependency, changes nothing in `apps/api`, `packages/contracts`, `packages/database/migrations`, `packages/ui/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`, `deploy/` or `.env.example`, and its only new assets are `apps/web/src/fonts/manrope-variable.woff2` and `apps/web/src/fonts/OFL.txt` (AC 23, `Impact` stored data/contrato/dependências/documentos)
Proof: `git diff --name-only b0cabb43e08d0db7327757865d5b82ab2710b44e..HEAD -- apps/api packages/contracts packages/database/migrations package.json apps/web/package.json packages/ui/package.json pnpm-lock.yaml deploy .env.example`
Proof: `git diff --name-only b0cabb43e08d0db7327757865d5b82ab2710b44e..HEAD -- '*.woff2' '*.woff' '*.ttf' '*.otf'`
Proof: `pnpm --filter @academia/repo-tests exec vitest run identidade.test.ts -t "only_the_manrope_asset_and_its_ofl_license_are_new"`

**C25** - When each of the four development profiles opens every screen it can open, the body resolves to rgb(10, 10, 10) and every opaque surface except buttons, links, badges and photos is no lighter than rgb(42, 42, 42) (AC 24)
Proof: `pnpm --filter @academia/web exec playwright test e2e/identidade.spec.ts -g "four_profiles_never_render_a_surface_lighter_than_the_limit"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| screens of `apps/web/src/app` (24) | `/login` C18 · `/login/two-factor` C18 · `/` C18 · `/students` C18 · `/students/new` C18 · `/students/[id]` C18 · `/students/[id]/edit` C18 · `/staff` C18 · `/staff/new` C18 · `/staff/[id]` C18 · `/staff/[id]/edit` C18 · `/plans` C18 · `/plans/new` C18 · `/plans/[id]/edit` C18 · `/payments` C18 · `/check-ins` C18 · `/check-in` C18 · `/audit` C18 · `/users` C18 · `/privacy` C18 · `/account` C18 · `/two-factor/setup` C18 · `/students/[id]/print` C18 · `/staff/[id]/print` C18 | - |
| authenticated screens of AC 1 (22) | `/`, `/students`, `/students/new`, `/students/[id]`, `/students/[id]/edit`, `/staff`, `/staff/new`, `/staff/[id]`, `/staff/[id]/edit`, `/plans`, `/plans/new`, `/plans/[id]/edit`, `/payments`, `/check-ins`, `/check-in`, `/audit`, `/users`, `/privacy`, `/account`, `/two-factor/setup`, `/students/[id]/print`, `/staff/[id]/print` - todas C1, table-driven over all 22 | - |
| Criteria AC 1 a AC 24 (24) | AC1 C1 · AC2 C2 · AC3 C3 · AC4 C4 · AC5 C5 · AC6 C6 · AC7 C7 · AC8 C8 · AC9 C9 · AC10 C10 · AC11 C11 · AC12 C12 · AC13 C13 · AC14 C14 · AC15 C15 · AC16 C16 · AC17 C17 · AC18 C19 · AC19 C20 · AC20 C21 · AC21 C22 · AC22 C23 · AC23 C24 · AC24 C25 | - |
| paleta amostrada da referência (14) | #0a0a0a C1 · #f5f5f5 C1 · #141414 C3 · #1f1f1f C10 · #262626 C4 · #2a2a2a C11 · #a3a3a3 C22 · #d4d4d4 C10 · #8a8a8a C11 · #cdf720 C2 · #dc2626 C17 · #f87171 C12 · radius 16px C3 · radius 9999px C2 | - |
| doors do `Landing` (2) | door 1: tema escuro fixo C1 · door 2: Manrope self-hosted C6 | - |
| componentes de `@academia/ui` (8) | button C2 · button destructive C17 · input C11 · select C11 · alert C13 · dialog C14 · table C10 · badge do check-in C15 | - |
| usos do acento #cdf720 (4) | botão primário C2 · link fora da nav C16 · link da rota ativa C4 · anel de foco C21 | - |
| `Observable` com decisão (10) | erro em `/login` C13 · vazio/densidade do painel C8 · listas vazias/erro/densidade C10 e C13 · validação e foco dos formulários C11, C12 e C21 · diálogos destrutivos C14 e C17 · `/check-in` allowed/blocked C15 · as duas rotas de `print` C19 · nav ativa e foco em todas as telas C4 e C21 · rota desconhecida C20 · superfícies escuras em todas as telas C1 e C25 | - |
| perfis de desenvolvimento (4) | admin C25 · reception C25 · hr_finance C25 · instructor C25 | - |
| rotas de `print` (2) | `/students/[id]/print` C19 · `/staff/[id]/print` C19 | - |
| seções da ficha e da exportação (7) | Dados pessoais C18 · Responsáveis C18 · Consentimentos C18 · Matrículas C18 · Pagamentos C18 · Presenças C18 · Fotos C18 | - |
| `Impact` (8 fronts) | domain C18 · stored data C24 · contrato C24 · dependências C24 · comandos e testes C23 · documentos C24 · CI C23 · telas C18 | - |

- Every claim naming a colour, a radius or a text value has a proof that resolves the computed value at the rendered boundary; `pnpm verify` and the two `git diff` commands are the only proofs that are not per-test.
- C18 is table-driven over the 24 screens with the enumeration in the test; the per-screen tokens are listed in the row above.

## Test policy

The repo answers where e2e live (`apps/web/e2e` with the fake API), how they run (`pnpm verify` via
`pnpm --filter @academia/web test`) and what the browser is (chromium). It does not answer which
level proves a token value or how much of a variant map a proof must assert, so these rows are the
bar this build runs under.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Tokens and print reset (`packages/ui/src/globals.css`) - decides by declaration, reached through every screen | one asserted case at the rendered boundary per token, plus the door literal statically | every token is asserted on an element that uses it; #0a0a0a/#f5f5f5 on the body of every authenticated screen (C1), and the print reset in print media (C19) |
| Component variant maps (`button`, `alert`, `input`/`select`, `dialog`, `table`) - decide, reached from every screen | one asserted case per variant at the rendered boundary | default and destructive button (C2, C17); default and destructive alert (C13); input and select (C11); invalid control (C12); dialog overlay and content (C14); table head/row/container (C10); the two check-in badge states (C15) |
| Screen composition (`apps/web/src/app/**` and `apps/web/src/components/shell.tsx`) - decides nothing, it orders existing regions | one structural assertion per screen, at the boundary | C18 asserts the heading sequence, the table columns, the form labels and the section order of each of the 24 screens, and that the shell header precedes `main` |
| Font wiring (`apps/web/src/app/layout.tsx`) - entry point deciding nothing | one at the boundary | the loaded family on `body` with weights 400 and 800 (C6), plus the asset and licence statically |
| `apps/web/src/app/not-found.tsx` - entry point deciding nothing | one at the boundary | heading, link and dark background on an unknown route (C20) |

Evidence:

- `packages/ui/src/globals.css`: 13 colour tokens, 1 radius and 1 print reset -> decides by declaration
- `packages/ui/src/components/{button,alert,input,dialog,table}.tsx`: 2 button variants, 2 alert variants, 2 controls, overlay + content, 3 table parts -> decisions per variant
- `apps/web/src/components/shell.tsx`: no conditional colour; it applies token classes and marks the active link -> decides nothing beyond that mark
- closest analogue in the repo: `apps/web/src/app/check-in/check-in-desk.tsx`, a screen whose status colour pair is decided in the component and proven at the browser boundary (`e2e/check-in.spec.ts`)

Cost: 20 browser proofs (17 tests) plus 3 static tests. Without these rows the variant maps and the
token values would be proven only by whatever path a screen happens to traverse.

## Swept

- validation: C12 - a campo inválido vira borda e texto rgb(248, 113, 113)
- failure modes: C13 - alerta destrutivo de carga e de validação com texto e borda rgb(248, 113, 113)
- idempotency: n/a - o tema não tem escrita nem repetição; renderizar duas vezes dá o mesmo CSS computado
- authorization: existing - `apps/web/src/proxy.ts` e `requireSession` continuam a guardar as rotas; C18 e C25 abrem as telas de cada perfil
- concurrency: n/a - nenhum estado mutável ou compartilhado entra na feature
- data lifecycle: n/a - nenhum dado é lido, gravado ou migrado (C24 prova o diff vazio)
- dependency failure: n/a - nenhuma dependência externa em runtime; a fonte é asset estático self-hosted (C6)
- state transitions: C7 - a preferência `prefers-color-scheme` não troca o tema; C21 - o estado de foco
- observability: n/a - nenhum requisito de log ou métrica numa mudança visual

## Handoff

- S1 = ~44 KB de texto tocado (globals.css + componentes de `@academia/ui` + shell + layout + `page.tsx` do painel + `check-in-desk.tsx` + a spec de identidade) ≈ 11k tokens; S2 herda os tokens em 24 telas, ~3 KB ≈ 1k; S3 = print, `not-found.tsx`, spec e teste estático, ~8 KB ≈ 2k. A fonte `manrope-variable.woff2` (24 KB) fica fora da conta: asset binário, não é lido como contexto. Total ≈ 14k, sob o budget de 150k - one builder, sem ask.
- Mechanism: one builder (a sessão que escreveu os checks).
- Settled mid-build: em 2026-10-19 o usuário aprovou corrigir dois dígitos do `Landing` (`--primary`/`--ring` `0.215` -> `0.2148`; `--destructive` `0.245` -> `0.215`) porque os literais aprovados renderizavam #cdf71f e #e7000b, não os hexes dos AC 2 e AC 17. O plano foi corrigido antes destes checks; nenhum outro literal mudou.

### Build record (base `b0cabb4`, one builder)

- **Boundary:** C1 a C25 verdes no HEAD do build; commits `47ec954` (estes checks e as decisões da
  revisão), o commit `feat(ui)` e o commit `test(identity)`. Provas no HEAD final:
  `e2e/identidade.spec.ts` **23/23**, `tests/repo/identidade.test.ts` **4/4**, `pnpm verify` exit `0`
  (21 tarefas, web com **313** testes de tela), `e2e/csp.spec.ts` **3/3** dentro do `pnpm verify`.
- **Settled mid-build:** a decisão do usuário que mudou o plano está acima. O resto é detalhe
  reversível: `nav-link.tsx` novo (componente cliente que marca a rota ativa, que o `Shell` servidor
  não consegue ver), `not-found.tsx` nova, e a varredura de `text-destructive` -> `text-[#f87171]`
  nas telas, para todo erro de campo ficar no vermelho do AC 12.
- **Abandoned:** `rounded-full` para o botão primário - o Tailwind v4 compila para
  `calc(infinity * 1px)` e o computado sai `3.35544e+07px`, não o `9999px` do AC 2; ficou
  `rounded-[9999px]`. `bg-black/70` no overlay do diálogo - o modificador de opacidade vira
  `color-mix` e a serialização computada deixa de ser `rgba(0, 0, 0, 0.7)`; ficou
  `bg-[rgb(0_0_0_/_0.7)]`. Os scans de cor da prova reusavam o canvas sem `clearRect`, e uma cor
  transparente herdava o pixel anterior (falso positivo de "TD lime"); corrigido na prova.
- **Focus e impressão:** o anel do AC 20 é `outline: 2px solid var(--ring); outline-offset: 2px` em
  `:focus-visible` no `@layer base`, para todo elemento interativo (o `ring` do Tailwind é
  box-shadow e não serializa como `outline`); a impressão reseta os tokens e força `th { color:
  #000 }` para o cabeçalho de tabela continuar legível no papel.
- **Fonte:** `apps/web/src/fonts/manrope-variable.woff2` (24.836 bytes, subset latin do Manrope
  variável v20, sha256 `A30DDCD349703AFF7464C34BEF3FFFDFF405EE50C113440D7C8693C02D210972`) e
  `apps/web/src/fonts/OFL.txt`, baixados de `fonts.gstatic.com` e do repositório `google/fonts`. O
  eixo interno cobre 200-800; o `next/font/local` declara `weight: '400 800'`, como o plano diz.
- **Arquivos da prova:** `apps/web/e2e/identidade.spec.ts` (23 casos) e
  `tests/repo/identidade.test.ts` (4 casos). O `pnpm verify` passou a rodar 313 testes de tela (290
  antes + 23 novos).
