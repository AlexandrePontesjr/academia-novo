# DukFit landing checks

Profile: ui
Plan: `.specs/features/dukfit-landing/plan.md`

20 checks in 3 slices · 5 one-way doors · 2 open, of which 0 block.

Scope guard: the checks below are the plan's AC 1 to AC 22, the four doors of `Landing`, the route of
`Surface` and every row of `Observable`. Nada fora disso entra no build.

Proof commands. `E2E` = `pnpm --filter @academia/web exec playwright test`; `REPO` =
`pnpm --filter @academia/repo-tests exec vitest run`. Viewports: 360×800, 390×844 and 1440×900.

## Binding sources

| Source | What it decides |
| --- | --- |
| `D:\projetos\dukfit\apps\web\src\app\public-landing.component.ts` | the copy, address, hours, neighborhood, Instagram, route URLs, gallery captions and image `alt` texts the checks assert |
| `D:\projetos\dukfit\apps\web\src\assets\dukfit\` | the six source images; the seven derived files of door 1 come from five of them |
| `plan.md` `Landing` and AC 1 to AC 22 | file names, sizes, the `SITE` shape and the logo placement |

## Supersedes

The approved door 3 changes the shape of `SITE` (supersedes the literal shape of AD-095; its rule
"every landing text comes from `site-content.ts`" stays). These earlier proofs are rewritten for the
new shape in the same commit; none loses an assertion that still applies:

- `dukfit-app` C30 (`landing_sections_in_order_from_site_content`): the sections are now the plan's
  AC 3 order, with no "Modalidades" and no WhatsApp.
- `dukfit-app` C34 (`site_content_is_the_only_source_of_landing_copy`): the key list is now the door 3
  keys.
- `dukfit-app` C45 (`landing_hours_use_the_gauge`): `SITE.hours` is now one range, not an array.
- `dukfit-app` C1, C33 and C39: unchanged in claim; the shell and login wordmark now sit next to the
  logo, and the "O que você encontra" cards keep `data-slot="highlights"`.

## Checks

### S1 - Landing com a academia real · `page.tsx`, `site-content.ts` · 2 files · 20 KB · ~5k

**C1** - The hero shows the logo `/dukfit/logo-dukfit-512.webp` with alt "DUK FIT Academia", the eyebrow "Academia em Flores, Manaus", the `h1` "Seu corpo. Seu ritmo. Sua evolução." made of three line-separated parts, the intro text from `SITE.intro`, and the proof "10+" with "Anos fazendo parte da rotina de Flores" (AC 1)
Proof: `E2E e2e/landing.spec.ts -g "hero_shows_logo_eyebrow_three_line_title_intro_and_proof"`

**C2** - The hero photo is `/dukfit/salao-cardio-1600.webp` with `fetchpriority="high"` and no `loading` attribute; the `h1` text on its overlay has a contrast of at least 4.5:1 against the overlay's composited color (AC 2)
Proof: `E2E e2e/landing.spec.ts -g "hero_photo_loads_first_under_a_dark_overlay"`

**C3** - The `main` headings, in DOM order, are the `h1` then "Sobre a Dukfit"-section title, "O que você encontra"-section title, "Nossa estrutura"-section title, "Horário", "Onde estamos"; and a `footer` follows `main` (AC 3)
Proof: `E2E e2e/landing.spec.ts -g "sections_follow_the_approved_order"`
Proof: `E2E e2e/dukfit.spec.ts -g "landing_sections_in_order_from_site_content"`

**C4** - "Sobre a Dukfit" shows "Treino de verdade. Presença todos os dias.", the text naming "Conjunto Duque de Caxias", and the images `/dukfit/musculacao-440.webp` and `/dukfit/cardio-440.webp` with their `alt` from `SITE` (AC 4)
Proof: `E2E e2e/landing.spec.ts -g "about_section_has_title_text_and_two_photos"`

**C5** - "O que você encontra" shows exactly three `Panel` cards with the numbers and titles "01 Musculação", "02 Acompanhamento", "03 Cardio" and the texts of `SITE.structure` (AC 5)
Proof: `E2E e2e/landing.spec.ts -g "structure_cards_are_the_three_numbered_panels"`

**C6** - "Nossa estrutura" shows four `figure`s in order with images `salao-cardio-800`, `musculacao-440`, `cardio-440`, `amanhecer-440`, each with its `alt`, and the captions "01 Cardio e musculação", "02 Treino em movimento", "03 Estrutura completa", "04 Desde cedo com você" (AC 6)
Proof: `E2E e2e/landing.spec.ts -g "gallery_shows_four_captioned_photos_in_order"`

**C7** - "Horário" shows a `Gauge` reading "06:00 - 22:00", the pill "Todos os dias", and 27 of 40 ticks lime (AC 7)
Proof: `E2E e2e/dukfit.spec.ts -g "landing_hours_use_the_gauge"`

**C8** - "Onde estamos" has an `address` element with "Rua Uberaba, Av. Duque de Caxias, 135" and "Conjunto Flores, Manaus–AM, 69093-000", the neighborhood "Conjunto Flores", and links "Google Maps", "Waze", "Uber" whose `href` equal `SITE.routes.google`, `.waze`, `.uber`, each starting with `https://www.google.com/maps/`, `https://waze.com/ul`, `https://m.uber.com/` (AC 8)
Proof: `E2E e2e/landing.spec.ts -g "location_has_address_neighborhood_and_three_route_links"`

**C9** - The `footer` shows the image `/dukfit/logo-dukfit-96.webp`, "Musculação e acompanhamento em Flores, Manaus." and a link "@dukfitacademia" to `https://www.instagram.com/dukfitacademia/` (AC 9)
Proof: `E2E e2e/landing.spec.ts -g "footer_has_small_logo_tagline_and_instagram"`

**C10** - Every `a` whose `href` starts with `http` has `target="_blank"` and a `rel` containing `noopener` and `noreferrer`; there are 4 such links (AC 10)
Proof: `E2E e2e/landing.spec.ts -g "external_links_open_in_a_new_tab_without_referrer"`

**C11** - The page text contains no "(" phone pattern `\(\d{2}\) \d`, no link to `wa.me`, and no "Criar conta"; `site-content.ts` contains none of "EXEMPLO", "Rua Exemplo", "0000-0000", "whatsapp", "phone"; the landing module reads no API helper but the session (AC 11, AC 12, door 3)
Proof: `E2E e2e/landing.spec.ts -g "no_phone_whatsapp_or_sign_up"`
Proof: `REPO identidade.test.ts -t "site_content_is_the_only_source_of_landing_copy"`

### S2 - Imagens servidas e leves · `proxy.ts`, `public/dukfit/` · 9 files · 1 MB assets · ~2k code

**C12** - Without a cookie, `GET /dukfit/logo-dukfit-512.webp` answers 200 with `content-type: image/webp` and no redirect; `GET /dukfit/nao-existe.webp` answers 404 (AC 13, AC 14, door 2)
Proof: `E2E e2e/landing.spec.ts -g "images_are_public_webp_and_unknown_is_404"`

**C13** - `apps/web/public/dukfit/` holds exactly the seven files of door 1, each a WebP (`RIFF....WEBP` header) of at most 400 KB, and the proxy `matcher` excludes `dukfit/` (AC 15, door 1, door 2)
Proof: `REPO identidade.test.ts -t "dukfit_images_are_the_seven_light_webp_files"`

**C14** - Every `img` on `/` has `width`, `height` and an `alt` attribute, the `alt` is non-empty for all but the logo next to the name, every `img` but the hero photo and the hero logo has `loading="lazy"`, and every `img` finished loading with `naturalWidth > 0` (AC 16)
Proof: `E2E e2e/landing.spec.ts -g "images_have_size_alt_and_lazy_loading"`

**C15** - Loading `/` makes requests only to the web's origin and raises zero `securitypolicyviolation` (AC 17)
Proof: `E2E e2e/dukfit.spec.ts -g "landing_has_no_shell_no_external_request_and_no_csp_violation"`

**C16** - At 360×800 and 1440×900 `scrollWidth` equals `clientWidth` on `/`, and no `img` box extends past its parent box (AC 18)
Proof: `E2E e2e/landing.spec.ts -g "no_image_overflow_and_no_horizontal_scroll"`

### S3 - A marca no login e no shell · `Brand`, login, shell · 4 files · 10 KB · ~3k

**C17** - `/login` and, at 1440×900, the shell `h1` show an `img` `/dukfit/logo-dukfit-96.webp` rendered 40×40 px immediately before the wordmark "DukFit", and the shell `h1` accessible name is "DukFit"; at 390×844 the shell header shows no logo image (AC 19, AC 20, AC 21, door 4)
Proof: `E2E e2e/landing.spec.ts -g "logo_sits_before_the_wordmark_on_login_and_desktop_shell"`

**C18** - `pnpm verify` exits 0 and no `package.json` dependency changes against the base of this feature (AC 22)
Proof: `pnpm verify`
Proof: `REPO identidade.test.ts -t "dukfit_adds_no_npm_dependency"`

### Rodada 2 - lacunas da verificação 1 (acréscimo; nenhum check acima mudou de texto)

**C19** - `page.tsx` has no letter-bearing text between JSX tags, no line of bare JSX text, and no literal `alt`/`aria-label`/`title`/`placeholder`; every landing text comes from `SITE` (AC 12, first clause; door 5)
Proof: `REPO identidade.test.ts -t "landing_page_has_no_literal_text_in_jsx"`

**C20** - `SITE` has exactly the top-level keys of door 5, and `sections` (five, each `{ eyebrow, title }`), `address` (`street`, `district`), `about`, `logo`, `routes`, `routeLabels`, `cta` and `hours` have exactly their door 5 keys (door 3, door 5)
Proof: `REPO identidade.test.ts -t "site_content_has_the_door_five_shape"`

Asserções acrescentadas às provas existentes, com o valor literal da fonte binding:

- C1 - a linha do horário do hero, "Todos os dias, 06:00–22:00" (`hero_shows_logo_eyebrow_three_line_title_intro_and_proof`)
- C4 - o destaque "Treine com consistência" e o texto dele (`about_section_has_title_text_and_two_photos`)
- C5 - o título "Estrutura para um treino completo." (`structure_cards_are_the_three_numbered_panels`)
- C6 - o título "A Dukfit por dentro." (`gallery_shows_four_captioned_photos_in_order`)
- C7 - "06:00 - 22:00", "Todos os dias" e o título "Todos os dias, das 06:00 às 22:00." como literais, e `SITE.hours` igual à faixa da fonte (`landing_hours_use_the_gauge`)
- C8 - as três URLs de rota iguais, caractere a caractere, às da landing anterior (com `dir_action=navigate` e `utm_source=dukfit`), o título "Perto da sua rotina. Em Flores, Manaus." e o horário da lista (`location_has_address_neighborhood_and_three_route_links`)

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /dukfit/<arquivo>.webp` statuses (2) | 200 C12 · 404 C12 | - |
| Landing doors (5) | door 1 C13 · door 2 C12 C13 · door 3 C11 C20 · door 4 C17 · door 5 C19 C20 | - |
| landing sections (7) | hero C1 C2 · Sobre C4 · O que você encontra C5 · Nossa estrutura C6 · Horário C7 · Onde estamos C8 · footer C9 | - |
| image files (7) | `logo-dukfit-512` C1 C13 · `logo-dukfit-96` C9 C13 C17 · `salao-cardio-1600` C2 C13 · `salao-cardio-800` C6 C13 · `musculacao-440` C4 C6 C13 · `cardio-440` C4 C6 C13 · `amanhecer-440` C6 C13 | - |
| external links (4) | Google Maps C8 C10 · Waze C8 C10 · Uber C8 C10 · Instagram C9 C10 | - |
| logo placements (3) | login C17 · shell desktop C17 · shell mobile absent C17 | - |
| viewports (2) | 360 C16 · 1440 C16 C17 | - |

- Claims naming a status code or route: C12 - proven at the HTTP boundary through `next start`
- No other check claims more than the single case its proof exercises

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Entry point that decides nothing (landing page, `Brand`) | one at the boundary | the rendered output in Chromium |
| Decides, reached across a boundary (proxy `matcher` exclusion) | one at the boundary | the public file, the unknown file, and an existing protected route still redirecting (existing `anonymous_is_redirected_to_login`) |
| Static assets | a repository proof | names, format, size bound |

Evidence:

- `apps/web/src/proxy.ts`: the `matcher` gains one exclusion -> decides, proven by HTTP in C12 and by the existing redirect proof in `shell.spec.ts`
- `apps/web/src/app/page.tsx`: renders `SITE`, no branch but the session CTA (already proven by `landing_cta_depends_on_session`) -> entry point

## Swept

- validation: C13 - the size and format bound of every image
- failure modes: C12 - an unknown image is a 404, not a redirect to `/login`
- idempotency: n/a - nothing is written
- authorization: C12 - only `/dukfit/*` becomes public; the existing `anonymous_is_redirected_to_login` keeps every screen route behind the session
- concurrency: n/a - static files and a read-only page
- data lifecycle: n/a - no stored data
- dependency failure: C15 - no third-party origin is loaded, so none can fail the page
- state transitions: n/a - no state
- observability: n/a - no log, metric or audit change

## Handoff

- S1-S3 ≈ 10k tokens of code plus ~1 MB of binary assets that are copied, not read - under the 150k budget - one builder
- Mechanism: one builder (under budget, no ask)
- **Boundary (rodada 2):** C19-C20 e as asserções literais. O código mudou em dois pontos: as URLs de rota voltaram às literais da fonte (a versão montada perdia `dir_action=navigate` e `utm_source=dukfit`), e todo texto que `page.tsx` escrevia direto (títulos, rótulos, CTA, nomes dos links de rota) foi para `SITE`, na forma registrada como door 5 no plano antes do código. A prova da C19 falha quando um "Bairro" literal volta à página
