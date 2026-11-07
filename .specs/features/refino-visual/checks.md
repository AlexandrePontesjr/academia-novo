# Refino visual checks

Profile: ui
Plan: `.specs/features/refino-visual/plan.md`

70 checks in 4 slices · 7 one-way doors · 3 open in the plan: a 1 fica resolvida aqui (autorização das
provas reescritas), a 2 segue aberta sem travar o Build (a paleta provisória é a da door 1) e a 3 segue
aberta e trava só o go-live (fotos novas).

Scope guard: os checks abaixo são as AC 1 a AC 63 do plano, as sete doors de `Landing`, as 22 linhas de
`Observable` e as provas que a Open question 1 autoriza reescrever. `Relations` e `Surface` são `None` no
plano: nenhuma rota, payload, schema, permissão ou dado muda. Nada fora disso entra no Build.

Proof commands. `E2E` = `pnpm --filter @academia/web exec playwright test`; `REPO` =
`pnpm --filter @academia/repo-tests exec vitest run`. Viewports: 320×800, 360×800, 390×844, 768×1024,
1024×800, 1440×900 e as bordas 767×900 e 1023×900.

Sampling. "Quadros amostrados", como na `motion`: um `requestAnimationFrame` instalado antes da ação
grava, a cada quadro, `performance.now()` e o `getComputedStyle` do alvo; uma tolerância de medição é de
um quadro (16,7 ms) para cada lado.

## Open question 1 - resolved

**Resposta: sim - o usuário autorizou em 2026-11-07**, na sessão que pediu este `checks.md`. O Build pode
reescrever, e o Verifier deve tratar as provas abaixo como aprovadas no novo texto:

| Proof | O que a autorização cobre |
| --- | --- |
| `apps/web/e2e/landing.spec.ts` | os 18 testes; a composição da página inteira muda (doors 2 a 6) |
| `apps/web/e2e/dukfit.spec.ts` | herói, ordem das seções, o painel de cartão das telas internas e o título de 30 px |
| `apps/web/e2e/landing-header.spec.ts` | CTA do cabeçalho no celular e os links da navegação (4 palavras da door 2) |
| `apps/web/e2e/login.spec.ts` | rótulo, `busy` e a mensagem de senha definida |
| `apps/web/e2e/portal.spec.ts` | os seis testes do portal do aluno (resumo, histórico, vazio, falha, esqueleto) |
| `apps/web/e2e/identidade.spec.ts` | a paleta e a tabela de telas (24 → 26 telas) |
| `apps/web/e2e/motion.spec.ts` | a prova do baseline C39 |
| `apps/web/e2e/fixtures/motion-baseline/1440.json` e `390.json` | a regravação do baseline C39 sobre a base desta feature |
| `apps/web/e2e/support/identidade.ts` e `e2e/support/motion.ts` | a tabela `SCREENS` (26 telas) e `SHELL_PATHS`/`LANDING_EXCLUDED`, que são parte das provas acima |
| `tests/repo/identidade.test.ts` e `tests/repo/motion.test.ts` | os guardas de tokens, dependência, `SITE` e `loading.tsx` |

Limite da autorização: a reescrita não enfraquece nem apaga cláusula que continua valendo; cada prova
reescrita mantém as asserções ainda aplicáveis e o baseline C39 é regravado, nunca relaxado (C69).
`portal-public.spec.ts`, `csp.spec.ts`, `shell.spec.ts`, `proxy.spec.ts`, `privacy-print.spec.ts`,
`forms.spec.ts` e as demais provas não são tocadas; as asserções novas das AC 33 e AC 34 entram em
`refino-visual.spec.ts`.

## Supersedes

Reescritas no mesmo commit do código que mudam, sem perder cláusula que continua valendo:

- `landing.spec.ts` (18 testes) → o novo conjunto de `landing.spec.ts`, provado por C14 a C31.
- `dukfit.spec.ts` → `landing_sections_in_order_from_site_content`,
  `landing_has_no_shell_no_external_request_and_no_csp_violation`,
  `inner_screens_have_30_medium_title_and_dark_panels` e
  `mobile_tables_scroll_inside_panel_and_forms_are_full_width` (C17, C29, C64).
- `landing-header.spec.ts` → `desktop_header_has_logo_nav_and_session_cta` vira
  `desktop_header_has_logo_four_section_links_and_session_cta` e
  `mobile_header_has_logo_cta_and_menu_button` vira
  `mobile_header_has_logo_menu_button_and_session_cta_in_menu` (C28, C70).
- `login.spec.ts` → C32 e C33. `portal.spec.ts` → C36 a C46.
- `identidade.spec.ts` → `every_screen_keeps_its_copy_and_arrangement` passa a 26 telas e as provas de
  tabela/status passam a ler os tokens novos (C63, C70).
- `motion.spec.ts` e o baseline C39 → regravados sobre a cópia desta feature (C69).
- `tests/repo/identidade.test.ts` → `site_content_has_the_door_five_shape` vira
  `site_content_has_the_door_two_shape` (C31).
- `tests/repo/motion.test.ts` → `eleven_segments_have_app_loading` vira
  `twelve_segments_have_app_loading`; `/minha-conta` sai do guard de `AppLoading` (C44, C65).

## Binding sources

| Source | What it decides |
| --- | --- |
| `.agents/skills/design-taste-frontend/SKILL.md` e `references/sections.md` 292-617 (Place) | a linguagem de página de lugar: `data-type="place"`, sem cartão, efeito, laço ou carrossel; foto, régua e tipo; as composições `story` e `pair`; o momento `picture-develops`; a barra de ação `nav.actionbar`; um momento de tipo; o texto de lista em 16 px |
| `plan.md` `## Landing` (doors 1 a 7) e AC 1 a AC 63 | os valores literais: os 11 tokens, o mapa de 27 pares de situação, os títulos de 30/16/14/48/36 px, as 4 fotos, as 6 seções, os 4 links, a barra de 44 px, os 250/200/180/900/300 ms |
| `apps/web/src/app/site-content.ts` (`SITE`) | todo texto, URL e caminho de imagem da landing; a forma nova da door 2 |
| `apps/web/src/lib/{students,plans,payments,leads,roles}.ts` | `STATUS_LABELS`, `ENROLLMENT_STATUS_LABELS`, `PAYMENT_STATUS_LABELS`, `PORTAL_LABELS`, `PERIOD_LABELS`, `PLAN_STATUS_LABELS`, `LEAD_STATUS_LABELS` e `ROLE_LABELS`: o texto de situação que os badges passam a exibir, sem mudar |
| `apps/web/e2e/support/identidade.ts` (`SCREENS`) | a cópia e a disposição de cada tela hoje (títulos, colunas, rótulos, textos), que a reescrita estende a 26 telas |
| `apps/web/src/components/{auth-frame,portal-frame,brand}.tsx` e os `page.tsx` de `/login`, `/primeiro-acesso`, `/esqueci-senha`, `/definir-senha` e `/minha-conta` | a moldura, a marca, o olho e o título das telas de entrada e do portal |
| referência visual da AD-098 (2026-10-21) e AD-099 a AD-104 | o tema escuro, o raio, o acento #fcf43c e o `MOTION` que as peças compartilham |

Não há referência visual nova: o plano é a fonte dos valores; a skill é a fonte da linguagem da landing.

## Screen enumeration

Uma linha por tela e estado que o plano enumera. `copy` = o texto que não muda de negócio ou que a AC
fixa literalmente; `arrangement` = o que o check mede.

| Screen | Copy binding | Arrangement binding | Checks |
| --- | --- | --- | --- |
| `/` | `h1` "Musculação e cardio em Flores, Manaus"; sub-linha "Treine todos os dias, das 06:00 às 22:00, com acompanhamento de perto."; nav Academia/Estrutura/Planos/Visita; "Plano mensal", "Consulte na recepção", "Matricule-se"; "Seu treino começa hoje.", "Quero treinar" | herói ≥900 px; `#visita` 2ª; `#academia` `story` 4:3; `#estrutura` `pair`; `#planos` com réguas; `#fecho` na faixa do acento; footer; 4 fotos | C14 a C31 |
| `/login` | "Acesso ao sistema", "Bem-vindo de volta", "Sou aluno", "Esqueci minha senha", "E-mail", "Senha", "Entrar" | `AuthFrame` + `Brand`; `h1` 36 px; mesma largura das telas do portal; `busy` e `Alert` | C32, C33, C35 |
| `/primeiro-acesso` | "Portal do aluno", "Primeiro acesso", "Informe o CPF e o e-mail que estão na sua ficha da academia."; a mensagem de sucesso atual | `PortalFrame`; cartão com ícone de 24 px, título, uma linha e link para `/login` | C34, C35 |
| `/esqueci-senha` | "Portal do aluno", "Esqueci minha senha", "Informe o e-mail com que você entra no portal."; a mensagem de sucesso atual | idem | C34, C35 |
| `/definir-senha` | "Portal do aluno", "Definir senha", "Escolha uma senha com pelo menos 12 caracteres."; o envio volta ao `/login` | `PortalFrame`; `h1` 36 px; mesma largura | C35 |
| `/minha-conta` | "Minha conta", o nome; "Foto", "Meus dados", "Pagamentos"; "Você ainda não tem matrícula registrada."; "Ver pagamentos"; "Aguardando aprovação da recepção."; colunas Plano/Período/Vencimento/Valor/Situação | foto 3:4; cartão de resumo; histórico; `ListOrTable` abaixo de 768; formulário em 1 e 2 colunas; esqueleto do portal | C36 a C46 |
| `/dashboard` | "Painel"; "Olá, Marina Duarte."; "Alunos", "Check-ins de hoje", "Check-ins da semana", "Matrículas", "Vencimentos nos próximos 7 dias", "Pagamentos", "Matrículas ativas por plano" | saudação dentro do `ScreenHeader`; grid 1/2/3; número "Alunos" 48 px/600 | C47, C48 |
| `/students` | "Alunos"; colunas Nome/CPF/Telefone/Situação; "Buscar por nome, CPF ou telefone", "Situação", "Filtrar", "Limpar"; "Nenhum aluno cadastrado." e "Nenhum aluno encontrado." | `ScreenHeader`; toolbar; tabela e cartões; badges; corpo plano | C47, C49, C50, C51, C52, C53 |
| `/students/new` | "Novo aluno"; os dez rótulos do formulário; "Salvar" | `ScreenHeader`; grupos; ≤640 px; `busy` | C47, C56 |
| `/students/[id]` | o nome; "Responsável e consentimentos", "Matrículas", "Pagamentos", "Presenças", "Privacidade"; "Identificação", "Contato", "Emergência"; "Editar", "Inativar" | bloco de identidade; grupos no mesmo cartão; badges; diálogo de confirmação | C47, C54, C67 |
| `/students/[id]/edit` | "Editar aluno"; os dez rótulos; "Salvar", "Cancelar" | `ScreenHeader`; ≤640 px; `busy`; "Cancelar" volta à ficha | C47, C56 |
| `/students/[id]/print` | "Dados do aluno: …", "Dados pessoais", "Responsáveis", "Consentimentos", "Matrículas", "Pagamentos", "Presenças", "Fotos", "Imprimir" | layout mantido; impressão branca | C63 |
| `/staff` | "Funcionários"; colunas Nome/Cargo/Setor/Situação; "Novo funcionário" | `ScreenHeader`; tabela e cartões; badges | C47, C51, C53 |
| `/staff/new` | "Novo funcionário"; os sete rótulos; "Salvar" | `ScreenHeader`; grupos; ≤640 px | C47, C56 |
| `/staff/[id]` | o nome; "Acesso ao sistema", "Privacidade"; "Sem usuário vinculado" | cartão de acesso com a escala de título dos outros blocos; badge | C47, C55 |
| `/staff/[id]/edit` | "Editar funcionário"; os sete rótulos; "Salvar", "Cancelar" | `ScreenHeader`; "Cancelar" volta à ficha | C47, C56 |
| `/staff/[id]/print` | "Dados do funcionário: …", "Dados pessoais", "Usuário", "Fotos", "Imprimir" | layout mantido; impressão branca | C63 |
| `/plans` | "Planos"; colunas Nome/Periodicidade/Valor/Regras de acesso/Situação; "Novo plano" | `ScreenHeader`; valor tabular à direita; regras ≤2 linhas; badge; corpo plano | C47, C50, C51, C53, C60 |
| `/plans/new` | "Novo plano"; Nome/Periodicidade/Valor (R$)/Regras de acesso; "Salvar" | `ScreenHeader`; grupos; ≤640 px | C47, C56 |
| `/plans/[id]/edit` | "Editar plano"; Nome/Periodicidade/Valor (R$)/Regras de acesso; "Salvar", "Inativar" | `ScreenHeader`; confirmação da inativação; "Cancelar" volta à lista | C47, C56, C67 |
| `/payments` | "Pagamentos"; colunas Aluno/Plano/Período/Pagar até/Valor/Situação; "Situação", "Filtrar", "Limpar" | toolbar; valor tabular; badges; tabela e cartões; corpo plano | C47, C50, C51, C52, C53 |
| `/check-ins` | "Presenças"; colunas Data/Hora/Aluno/Registrado por; "De", "Até"; "Total no período: 1" | toolbar; tabela e cartões; corpo plano | C47, C50, C51, C52 |
| `/check-in` | "Check-in"; "Nome ou CPF", "Buscar"; "Liberado" | resultado em `Panel`; badge `--status-ok`; `Alert` de sucesso | C47, C59 |
| `/audit` | "Auditoria"; "De", "Até", "Usuário", "Ação", "IP"; "Nenhum registro encontrado." | toolbar com Filtrar/Limpar e contagem; tabela e cartões; corpo plano | C47, C49, C50, C51, C52 |
| `/leads` | "Interessados"; "Nenhum interessado."; "Situação" | toolbar com Filtrar/Limpar e contagem; badges; tabela e cartões; corpo plano | C47, C49, C50, C51, C52, C53 |
| `/users` | "Usuários"; colunas Nome/E-mail/Perfil/Situação/2FA/Ações; "Novo usuário" | badges de situação e de 2FA; tabela e cartões | C47, C51, C53 |
| `/privacy` | "Privacidade"; "Anonimizar alunos inativos há mais de", "Desligado", "Guardar versões de foto por" | unidade dentro do campo; controle temático; uma linha de efeito; `busy` | C47, C56, C57 |
| `/account` | "Trocar senha", "Verificação em duas etapas" | título de página no `ScreenHeader`; dois cartões de mesma largura a partir de 768 px; títulos dos cartões abaixo de 30 px | C47, C58 |

Fora da enumeração, por `Out of scope` do plano: `/login/two-factor`, `/two-factor/setup`, `/matricula*`,
`/matricula/confirmar`, `/matricula/enviado`, a rota 404 e o fluxo de recorte de foto.

## Derivation notes

- **21 telas (AC 46) x 22 rotas com `Shell` na árvore.** `identidade.spec.ts` enumera hoje 24 telas, das
  quais 21 com `Shell`; a feature `pre-cadastro` acrescentou `/leads`, que as AC 49 a AC 52 já citam. A
  árvore tem 22 rotas com `Shell` (20 de tela + 2 de impressão), e a `Coverage` abaixo as enumera todas.
  O `ScreenHeader` vale nas 20 telas; as 2 rotas de impressão ficam de fora dele por AC 62 ("keep their
  layout") e são provadas por C63. O "21" do plano é a contagem antiga de `identidade.spec.ts` (que
  também incluía as duas rotas de impressão).
- **AC 31 x AC 34 no olho de `/login`.** A AC 31 dá a `/login` o olho "Acesso ao sistema"; a AC 34 manda
  as quatro telas de entrada manterem a moldura, a marca, o olho de 14 px e o `h1` de 36 px. A regra
  específica vence: `/login` fica com "Acesso ao sistema" e as três telas de `PortalFrame` mantêm "Portal
  do aluno"; as quatro compartilham marca, `h1` de 36 px e largura de conteúdo (C35).
- **Open question 2.** A door 1 usa `--status-ok: var(--primary)` (#fcf43c) com a paleta provisória; se o
  usuário trocar por um verde de sucesso depois, é outra feature, com outra superfície de prova (8
  tokens e as provas de cor). O Build não depende da resposta.
- **Open question 3.** As quatro cenas atuais ficam; a quinta foto (`salao-cardio-800`) continua no
  repositório sem uso. Sem fotos novas a landing não cresce para a página compacta da skill; isso trava
  só o go-live.

## Checks

### S1 - Um sistema só de cor e de peças · `globals.css`, 4 peças novas, guardas · ~13k

**C1** - O `:root` de `packages/ui/src/globals.css` declara `--status-ok: var(--primary)`, `--status-ok-surface: rgb(252 244 60 / 0.14)`, `--status-warn: #f59e0b`, `--status-warn-surface: rgb(245 158 11 / 0.14)`, `--status-bad: #f87171`, `--status-bad-surface: rgb(248 113 113 / 0.14)`, `--status-idle: #a3a3a3`, `--status-idle-surface: #1a1a1a`, `--muted-strong: #d4d4d4`, `--chart-off: #404040` e `--border-control: #6b6b6b`, e mapeia os 11 em `@theme inline` (`--color-status-*`, `--color-muted-strong`, `--color-chart-off`, `--color-border-control`) (AC 1, door 1)
Proof: `REPO refino.test.ts -t "status_control_and_chart_tokens_are_the_door_one_literal"`

**C2** - Os valores da AD-098 não mudam: `--background` #000000, `--foreground` #fafafa, `--card` #0f0f0f, `--muted` #1a1a1a, `--muted-foreground` #a3a3a3, `--border` #262626, `--input` #2a2a2a, `--primary` #fcf43c, `--ring` #fcf43c, `--destructive` #dc2626, `--destructive-foreground` #fafafa e `--radius` 1rem (AC 2)
Proof: `REPO identidade.test.ts -t "identity_tokens_and_radius_resolve_the_door_one_literal"`
Proof: `REPO refino.test.ts -t "theme_keeps_the_ad098_values"`

**C3** - Nenhum literal de cor hexadecimal `#rgb` ou `#rrggbb` aparece em `apps/web/src/**` ou `packages/ui/src/components/**` fora de `globals.css`, e os literais antigos `#f87171`, `#d4d4d4`, `#f59e0b`, `#404040`, `rgb(205 247 32)` e `rgb(205, 247, 32)` não aparecem nesses dois conjuntos (AC 3)
Proof: `REPO refino.test.ts -t "no_hex_colors_outside_the_theme"`

**C4** - `StatusBadge` resolve os 27 pares (entidade, situação) da door 7 (`student` ativo/inativo/suspenso; `enrollment` ativo/agendado/vencido/cancelado; `payment` pago/pendente/atrasado/cancelado; check-in liberado/bloqueado; `staff` ativo/inativo; `lead` novo/contatado/convertido/descartado; portal ativo/pendente/sem acesso/desligado; `user` ativo/inativo; `plan` ativo/inativo) e pinta o texto com `--status-ok`, `--status-warn`, `--status-bad` ou `--status-idle` sobre a superfície `--status-*-surface` correspondente (AC 4, door 7)
Proof: `REPO refino.test.ts -t "status_badge_variant_map_is_the_door_seven_literal"`
Proof: `E2E e2e/refino-visual.spec.ts -g "status_badge_uses_status_tokens_on_their_surfaces"`

**C5** - Cada texto de situação sobre a própria superfície tem razão de contraste ≥4,5:1 e `--foreground` sobre `--background` tem ≥7:1, calculados a partir dos valores literais com as superfícies alfa compostas sobre `--card` (AC 5)
Proof: `REPO refino.test.ts -t "status_and_foreground_contrast_meet_the_minimums"`

**C6** - `ScreenHeader` mostra o olho a 14 px em `--muted-foreground` com ponto de 8 px em `--primary`, o título como `h2` a 30 px e peso 500, meta opcional a 14 px em `--muted-foreground` e ações à direita; a 390 px as ações empilham sob o título; as bordas esquerda e direita ficam no gutter do `main` (16 px abaixo de 1024 px, 32 px a partir de 1024 px) (AC 6, door 7)
Proof: `E2E e2e/refino-visual.spec.ts -g "screen_header_geometry_at_390_and_1440"`

**C7** - `EmptyState` mostra um ícone de 24 px `aria-hidden`, título a 16 px e peso 500, descrição opcional a 14 px em `--muted-foreground` e ação opcional, dentro de `data-slot="empty-state"`, e não é um `Alert` (AC 7, door 7)
Proof: `E2E e2e/refino-visual.spec.ts -g "empty_state_has_icon_title_description_and_slot"`

**C8** - Abaixo de 768 px cada registro de `ListOrTable` é um cartão com `rounded-xl`, `bg-muted` e `p-3`; a partir de 768 px os mesmos registros renderizam como `Table`; os dois mostram os mesmos valores na mesma ordem (AC 8, door 7)
Proof: `E2E e2e/refino-visual.spec.ts -g "list_or_table_switches_at_768_with_the_same_values"`

**C9** - Em `Table` o cabeçalho é `--muted-strong` sobre `--muted` a 12 px em caixa alta, a linha do corpo muda o fundo para `--muted` a 50% no hover, e a célula marcada como numérica fica alinhada à direita com `font-variant-numeric: tabular-nums` (AC 9)
Proof: `E2E e2e/refino-visual.spec.ts -g "table_header_hover_and_numeric_cell"`

**C10** - Formulário em envio usa `Button busy` com spinner de 16 px, `aria-busy="true"` e desabilitado, e nenhum arquivo de `apps/web/src` passa `disabled={isSubmitting}` (AC 10, door 7)
Proof: `E2E e2e/refino-visual.spec.ts -g "form_submit_uses_busy_button"`
Proof: `REPO refino.test.ts -t "no_screen_passes_disabled_is_submitting"`

**C11** - `Input`, `Select` e `Button` outline usam `--border-control` na borda e alcançam 3:1 contra `--card` (AC 11, door 1)
Proof: `E2E e2e/refino-visual.spec.ts -g "control_borders_are_border_control_and_reach_three_to_one"`
Proof: `REPO refino.test.ts -t "border_control_reaches_three_to_one_on_card"`

**C12** - `pnpm verify` sai 0 e nenhum `package.json` ganha dependência npm (AC 12)
Proof: `pnpm verify`
Proof: `REPO identidade.test.ts -t "motion_is_the_only_added_dependency"`

**C13** - O texto de cada badge é o rótulo do mapa de negócio (`STATUS_LABELS`, `ENROLLMENT_STATUS_LABELS`, `PAYMENT_STATUS_LABELS`, `PORTAL_LABELS`, `PLAN_STATUS_LABELS`, `LEAD_STATUS_LABELS`, `ROLE_LABELS`), sem texto novo e sem alteração nos mapas (Impact - `domain`)
Proof: `REPO refino.test.ts -t "status_badge_text_comes_from_the_label_maps"`

### S2 - A landing como um lugar · `page.tsx`, `site-content.ts`, `components/landing`, provas da landing · ~50k

**C14** - `/` entrega `<html data-type="place">` e as metas `<meta name="page-type" content="place">`, `<meta name="site-kind" content="other">` e `<meta name="page-kind" content="place">`, sem sessão e com 200 (AC 13, door 2)
Proof: `E2E e2e/landing.spec.ts -g "landing_declares_place_type_and_page_metas"`

**C15** - O `h1` é "Musculação e cardio em Flores, Manaus" e a sub-linha é "Treine todos os dias, das 06:00 às 22:00, com acompanhamento de perto.", ambos lidos de `SITE.hero` (AC 14, door 2)
Proof: `E2E e2e/landing.spec.ts -g "hero_states_what_where_and_the_hours"`

**C16** - A 1440×900 o herói tem pelo menos 900 px de altura e o `h2` da seção seguinte começa abaixo de y=900 (AC 15, door 2)
Proof: `E2E e2e/landing.spec.ts -g "hero_fills_the_first_screen_and_the_next_h2_starts_below_it"`

**C17** - As seções aparecem na ordem herói, `#visita`, `#academia`, `#estrutura`, `#planos`, `#fecho`, `footer`, e cada uma exceto o herói e o footer tem `scroll-mt-24` (AC 16, door 2)
Proof: `E2E e2e/landing.spec.ts -g "sections_follow_the_door_two_order"`

**C18** - A 1440×900 cada seção tem entre 900 px e 1800 px de altura e o footer tem no máximo 900 px (AC 17, door 2)
Proof: `E2E e2e/landing.spec.ts -g "each_section_is_one_to_two_screens_and_the_footer_is_short"`

**C19** - `#visita` é a segunda seção e mostra a rua e o bairro a 48 px ou mais como link para `SITE.routes.google`, o horário "Todos os dias, 06:00–22:00" e os links "Google Maps", "Waze" e "Uber" com pelo menos 44 px de altura (AC 18, door 2)
Proof: `E2E e2e/landing.spec.ts -g "visit_is_the_second_section_with_large_address_hours_and_routes"`

**C20** - `/` mostra exatamente quatro fotografias distintas, cada uma usada uma vez: `/dukfit/salao-cardio-1600.webp` no herói, `/dukfit/musculacao-440.webp` em `#academia`, `/dukfit/cardio-440.webp` e `/dukfit/amanhecer-440.webp` em `#estrutura`; `#visita`, `#planos` e `#fecho` não mostram fotografia (AC 19, door 3)
Proof: `E2E e2e/landing.spec.ts -g "four_photographs_each_once_and_none_in_visit_plans_or_close"`

**C21** - Nenhuma fotografia tem `figcaption` nem legenda; todo `img` tem `width`, `height` e `alt` não vazio; a imagem do herói tem `fetchpriority="high"` e sem `loading="lazy"`, e as outras três têm `loading="lazy"` (AC 20, door 3)
Proof: `E2E e2e/landing.spec.ts -g "photographs_have_no_caption_and_load_by_priority"`

**C22** - Fotografia, faixa e régua: a foto tem raio 0, o chão é plano e os separadores são de 1 px em `--border`; a landing não contém `Panel`, cartão arredondado nem sombra (AC 21, door 4)
Proof: `E2E e2e/landing.spec.ts -g "place_language_has_square_photos_flat_ground_and_hairlines"`

**C23** - A landing não anima em laço: sem carrossel, sem autoplay, sem selo girando, e nenhuma animação CSS infinita roda por dois segundos de observação (AC 22, door 6)
Proof: `E2E e2e/landing.spec.ts -g "nothing_loops_on_the_landing"`

**C24** - No hover a fotografia linkada cresce para 1.03 dentro da moldura, o título linkado desenha a régua, o botão sobe 1 px e, pressionado, vai a 0.98 (AC 23, door 6)
Proof: `E2E e2e/landing.spec.ts -g "hover_and_press_answer_on_photos_titles_and_buttons"`

**C25** - O herói entra uma vez com opacidade 0→1 e y 12→0 em 300 ms com `MOTION.ease`; o par de `#estrutura` desenvolve uma vez com escala 1.06→1 e recorte em até 900 ms; com `prefers-reduced-motion: reduce` os dois repousam no estado final (AC 24, door 6)
Proof: `E2E e2e/landing.spec.ts -g "hero_enters_once_and_the_pair_develops_once"`
Proof: `E2E e2e/landing.spec.ts -g "reduced_motion_rests_the_landing_at_the_final_state"`

**C26** - `#planos` é um bloco com réguas, título "Plano mensal", a linha "Consulte na recepção", as três features e um link "Matricule-se" para `/matricula`, sem valor de preço (AC 25, door 2)
Proof: `E2E e2e/landing.spec.ts -g "plans_are_a_ruled_block_without_a_price"`

**C27** - `#fecho` usa `--primary` como fundo e `--primary-foreground` como texto, com o título "Seu treino começa hoje." e um link "Quero treinar" para `/matricula`, e todo par texto/fundo nele alcança 7:1 (AC 26, door 2)
Proof: `E2E e2e/landing.spec.ts -g "closing_band_uses_primary_and_meets_seven_to_one"`

**C28** - Abaixo de 1024 px o cabeçalho mostra apenas o logo e o botão "Abrir menu", e o `SiteMenu` guarda o CTA da sessão; o `<a data-slot="action-bar" href="/matricula">` fixo tem 44 px de altura e `padding-bottom: env(safe-area-inset-bottom)`, aparece só depois que o CTA do herói sai da viewport e some enquanto um CTA de seção está visível; fica escondido em `print` e a partir de 1024 px (AC 27, door 5)
Proof: `E2E e2e/landing.spec.ts -g "mobile_action_bar_follows_the_hero_and_section_ctas"`
Proof: `E2E e2e/landing-header.spec.ts -g "mobile_header_has_logo_menu_button_and_session_cta_in_menu"`

**C29** - `/` não faz requisição a origem diferente da do web e levanta zero `securitypolicyviolation` (AC 28)
Proof: `E2E e2e/landing.spec.ts -g "landing_stays_same_origin_without_csp_violation"`

**C30** - A 320, 390, 768, 1024 e 1440 px o documento não tem rolagem horizontal e todo bloco de conteúdo compartilha as bordas esquerda e direita da cabeça de seção (AC 29)
Proof: `E2E e2e/landing.spec.ts -g "no_horizontal_scroll_and_shared_edges_at_five_widths"`

**C31** - Todo texto, URL e caminho de imagem vem de `site-content.ts`; `SITE.kind` é `'place'`; `SITE.nav` tem as quatro palavras Academia/Estrutura/Planos/Visita nessa ordem, com os `href` `#academia`, `#estrutura`, `#planos` e `#visita`; `SITE` não tem `tagline` como `h1`, `scroll` nem carrossel de `gallery`; e o arquivo não contém "EXEMPLO", "Rua Exemplo" nem "0000-0000" (AC 30, doors 2 e 3)
Proof: `REPO identidade.test.ts -t "site_content_has_the_door_two_shape"`
Proof: `REPO identidade.test.ts -t "landing_page_has_no_literal_text_in_jsx"`

### S3 - A entrada e o portal do aluno · `login`, `minha-conta`, molduras, provas do portal · ~16k

**C32** - Em `/login` o olho diz "Acesso ao sistema", o link do primeiro acesso do aluno diz "Sou aluno", o `h1` continua "Bem-vindo de volta", e `AuthFrame` e os rótulos "E-mail", "Senha" e "Entrar" ficam como estão (AC 31)
Proof: `E2E e2e/login.spec.ts -g "login_says_system_access_and_offers_student_entry"`

**C33** - O envio do login em andamento usa `Button busy`; a mensagem "Senha definida" renderiza como `Alert` do tema, com `role="alert"`, e não como parágrafo cru (AC 32)
Proof: `E2E e2e/login.spec.ts -g "login_submit_is_busy_and_the_message_is_an_alert"`

**C34** - `/primeiro-acesso` e `/esqueci-senha` em estado de sucesso mostram um cartão com ícone de 24 px, título, uma linha (a mensagem atual preservada) e um link para `/login`, e não substituem o formulário por um parágrafo cru (AC 33)
Proof: `E2E e2e/refino-visual.spec.ts -g "auth_success_states_are_cards_with_icon_title_line_and_back_link"`

**C35** - `/login`, `/primeiro-acesso`, `/esqueci-senha` e `/definir-senha` mantêm `AuthFrame` ou `PortalFrame` com o `Brand`; as três telas de `PortalFrame` mantêm o olho "Portal do aluno" a 14 px; cada `h1` tem 36 px e as quatro telas compartilham a mesma largura de conteúdo (AC 34; nota de derivação)
Proof: `E2E e2e/refino-visual.spec.ts -g "auth_screens_keep_frame_brand_eyebrow_and_title_scale"`

**C36** - Em `/minha-conta` o cabeçalho mostra o `Brand` e o botão de sair, e o bloco de identidade mostra a foto do aluno em 3:4 (120×160 px a partir de 768 px, 96×128 px abaixo), o nome a 30 px e peso 500 e o `StatusBadge` do período atual (AC 35)
Proof: `E2E e2e/portal.spec.ts -g "minha_conta_header_identity_photo_and_status_badge"`

**C37** - Com períodos, um cartão de resumo mostra o próximo vencimento como `dd/mm/aaaa`, o nome do plano, o `StatusBadge` da situação e um link "Ver pagamentos" que rola até o histórico (AC 36)
Proof: `E2E e2e/portal.spec.ts -g "summary_card_shows_due_date_plan_badge_and_scroll_link"`

**C38** - Quando o próximo vencimento está no passado e o período não está pago, a data do resumo e o badge usam `--status-bad` (AC 37)
Proof: `E2E e2e/portal.spec.ts -g "overdue_summary_uses_status_bad"`

**C39** - Sem períodos, a tela mostra `EmptyState` com o título "Você ainda não tem matrícula registrada." e não mostra o cartão de resumo (AC 38)
Proof: `E2E e2e/portal.spec.ts -g "without_enrollment_shows_empty_state_and_no_summary"`

**C40** - O histórico mostra as colunas Plano, Período, Vencimento, Valor e Situação; o valor sai como `R$ 1.234,56`, alinhado à direita e tabular; a situação é um `StatusBadge`; e um período pago mostra a data do pagamento na segunda linha (AC 39)
Proof: `E2E e2e/portal.spec.ts -g "history_has_value_column_tabular_money_and_payment_date"`

**C41** - Abaixo de 768 px o histórico renderiza como cartões de `ListOrTable` sem rolagem horizontal e o formulário de contato fica em uma coluna; a partir de 768 px o histórico é `Table` e o formulário tem duas colunas (AC 40, door 7)
Proof: `E2E e2e/portal.spec.ts -g "portal_history_and_form_switch_at_768"`

**C42** - A seção de foto mantém a moldura 3:4, o texto "Aguardando aprovação da recepção." enquanto a foto está pendente e a ação de envio quando não está; o diálogo de envio mantém o recorte 3:4 (AC 41)
Proof: `E2E e2e/portal.spec.ts -g "photo_frame_pending_message_and_crop_are_three_by_four"`

**C43** - Se o perfil ou os pagamentos falham, a tela mantém o cabeçalho e o bloco de identidade e mostra um único `Alert` destrutivo com o botão "Tentar novamente" (AC 42)
Proof: `E2E e2e/portal.spec.ts -g "load_failure_keeps_header_identity_and_one_alert"`

**C44** - O `loading.tsx` de `/minha-conta` mostra o cabeçalho do portal, o bloco de identidade e três cartões com a mesma largura e gutters da tela carregada, e não desenha a barra lateral nem a barra inferior da shell da equipe (AC 43; AD-101)
Proof: `E2E e2e/refino-visual.spec.ts -g "portal_loading_matches_the_loaded_geometry_without_the_team_shell"`
Proof: `REPO refino.test.ts -t "portal_loading_does_not_mount_the_team_shell"`

**C45** - Os cartões do portal entram com `Reveal` no stagger de `MOTION` e os botões são `pressable`; com `prefers-reduced-motion: reduce` nada se move (AC 44)
Proof: `E2E e2e/portal.spec.ts -g "portal_cards_reveal_and_buttons_press_and_rest_when_reduced"`

**C46** - Uma sessão `student` não tem link para tela de equipe e `/minha-conta*` continua sendo a única área autenticada dessa sessão (AC 45, AD-124)
Proof: `E2E e2e/portal.spec.ts -g "student_session_has_no_team_link"`
Proof: `E2E e2e/proxy.spec.ts -g "student_session_reaches_only_portal_two_factor_and_public_pages"`

### S4 - As telas da equipe · 20 `page.tsx`, peças, provas de tela, baseline · ~77k

**C47** - Cada uma das 20 telas com `Shell` que não são de impressão mostra exatamente um `ScreenHeader` com título `h2` a 30 px e peso 500, e nenhum outro texto da tela usa 30 px; o gutter do `main` fica em 16 px abaixo de 1024 px e 32 px a partir de 1024 px (AC 46, door 7; nota de derivação)
Proof: `E2E e2e/refino-visual.spec.ts -g "every_shell_screen_has_one_screen_header_at_30px"`

**C48** - Em `/dashboard` a saudação faz parte do `ScreenHeader` e não precede o título; o grid mantém 1, 2 e 3 colunas abaixo de 768, a partir de 768 e a partir de 1024 px; e o número de "Alunos" fica em 48 px e peso 600 (AC 47)
Proof: `E2E e2e/refino-visual.spec.ts -g "dashboard_header_greeting_grid_and_student_number"`

**C49** - Tela de lista sem registros mostra `EmptyState` com o título do registro; busca ou filtro sem resultado usa o título da busca ("Nenhum aluno encontrado." em vez de "Nenhum aluno cadastrado.") (AC 48)
Proof: `E2E e2e/refino-visual.spec.ts -g "empty_states_use_record_and_search_titles"`

**C50** - A `Table` não fica dentro de um segundo cartão com borda: `PAGE_BODY` é um corpo simples (`grid gap-6`, sem borda e sem raio) em `/students`, `/staff`, `/plans`, `/payments`, `/check-ins` e `/audit` (AC 49)
Proof: `REPO refino.test.ts -t "page_body_is_a_plain_body_container"`
Proof: `E2E e2e/refino-visual.spec.ts -g "list_tables_sit_in_a_plain_body_without_a_second_card"`

**C51** - Lista com registros: a partir de 768 px renderiza `Table` com hover de linha, um `StatusBadge` por situação e alinhamento numérico em valores e contagens; abaixo de 768 px renderiza os mesmos campos como cartões de `ListOrTable` em `/students`, `/staff`, `/payments`, `/check-ins`, `/audit` e `/leads` (AC 50, door 7)
Proof: `E2E e2e/refino-visual.spec.ts -g "list_screens_use_table_and_cards_with_the_same_fields"`

**C52** - `/students`, `/payments`, `/check-ins`, `/audit` e `/leads` usam um mesmo padrão de toolbar com busca rotulada quando o endpoint tem `q`, selects rotulados, o par "Filtrar"/"Limpar" e a contagem de resultados (AC 51)
Proof: `E2E e2e/refino-visual.spec.ts -g "filter_toolbars_share_search_selects_reset_and_count"`

**C53** - Toda situação em tela da equipe é um `StatusBadge` do mapa da door 7, nunca texto puro: situação do aluno na lista e na ficha, do funcionário na lista e na ficha, do plano em `/plans`, do pagamento em `/payments` e na ficha do aluno, do acesso em `/check-in`, do interessado em `/leads`, do portal na ficha do aluno e do usuário e 2FA em `/users` (AC 52, door 7)
Proof: `E2E e2e/refino-visual.spec.ts -g "every_situation_is_a_status_badge"`

**C54** - Na ficha do aluno o bloco de identidade mostra foto, nome e `StatusBadge` acima dos campos; os campos ficam agrupados em "Identificação", "Contato" e "Emergência" dentro do mesmo cartão; e a situação está visível sem rolagem a 1440×900 (AC 53)
Proof: `E2E e2e/refino-visual.spec.ts -g "student_record_identity_groups_and_visible_status"`

**C55** - Na ficha do funcionário a seção "Acesso ao sistema" fica dentro de um cartão com a mesma escala de título dos outros blocos da ficha (AC 54)
Proof: `E2E e2e/refino-visual.spec.ts -g "staff_record_access_card_shares_the_title_scale"`

**C56** - Formulário: campo obrigatório tem marca visível, os campos ficam agrupados por seção, o formulário tem no máximo 640 px, o envio usa `Button busy`, e o formulário de edição oferece "Cancelar" que volta à tela anterior (AC 55)
Proof: `E2E e2e/refino-visual.spec.ts -g "forms_are_grouped_under_640px_with_required_marks_and_cancel"`

**C57** - Em `/privacy` cada campo de retenção mostra a unidade dentro do campo, o controle "Desligado" é um controle do tema e não um checkbox nativo, e cada campo carrega uma linha descrevendo o efeito (AC 56)
Proof: `E2E e2e/refino-visual.spec.ts -g "privacy_retention_fields_show_unit_themed_switch_and_effect_line"`

**C58** - Em `/account` o título de página fica no `ScreenHeader` e os dois cartões têm a mesma largura a partir de 768 px (AC 57)
Proof: `E2E e2e/refino-visual.spec.ts -g "account_has_screen_header_and_equal_cards"`

**C59** - Em `/check-in` o resultado do aluno usa a geometria do `Panel`, o badge "Liberado" usa `--status-ok` sobre `--status-ok-surface` e o retorno de sucesso é um `Alert` (AC 58)
Proof: `E2E e2e/refino-visual.spec.ts -g "check_in_panel_status_ok_badge_and_alert"`

**C60** - Em `/plans` a célula "Valor" fica alinhada à direita e tabular, a "Regras" mostra no máximo duas linhas e a situação é um `StatusBadge` (AC 59)
Proof: `E2E e2e/refino-visual.spec.ts -g "plans_value_is_tabular_rules_are_two_lines_and_status_is_a_badge"`

**C61** - Quando um bloco de uma ficha falha ao carregar, a tela mostra um `Alert` para a falha e os outros blocos continuam renderizando (AC 60)
Proof: `E2E e2e/refino-visual.spec.ts -g "one_failed_block_shows_one_alert_and_keeps_the_others"`

**C62** - Cartão linkado, link de texto, botão e linha de tabela respondem com o hover das AC 23 e AC 9; com `prefers-reduced-motion: reduce` nada se move (AC 61)
Proof: `E2E e2e/refino-visual.spec.ts -g "team_hover_and_press_match_the_landing_motion"`

**C63** - Em `print` o fundo computado é #ffffff e o texto #000000, e `/students/[id]/print` e `/staff/[id]/print` mantêm o layout (AC 62)
Proof: `E2E e2e/identidade.spec.ts -g "print_media_resets_the_palette_to_white_and_black"`
Proof: `E2E e2e/privacy-print.spec.ts -g "student_print_sections_dates_photos_empty_and_print_button"`
Proof: `E2E e2e/privacy-print.spec.ts -g "staff_print_sections_user_and_photos"`

**C64** - `pnpm verify` sai 0; as 22 rotas com `Shell` não têm rolagem horizontal a 360 px nem a 1440 px; e continuam o título de página de 30 px e os gutters de 16/32 px que as provas da `dukfit-app` fixam (AC 63)
Proof: `pnpm verify`
Proof: `E2E e2e/refino-visual.spec.ts -g "shell_screens_keep_no_horizontal_scroll_and_the_pinned_title_and_gutters"`
Proof: `E2E e2e/dukfit.spec.ts -g "inner_screens_have_30_medium_title_and_dark_panels"`

**C65** - Os 12 segmentos com shell continuam com `loading.tsx` cujo default é `AppLoading` (`dashboard`, `students`, `staff`, `plans`, `payments`, `check-in`, `check-ins`, `audit`, `users`, `privacy`, `account` e `leads`), e o guard de repositório passa a contar 12 (AD-101, mantido)
Proof: `REPO motion.test.ts -t "twelve_segments_have_app_loading"`

**C66** - O corte de perfil das telas da equipe não muda: os 10 testes de link por perfil da navegação continuam passando, e a sessão de equipe em `/minha-conta` vai a `/dashboard` (AD-022 e AD-124, mantidos)
Proof: `E2E e2e/shell.spec.ts -g "students_link_for_all_four_roles"`
Proof: `E2E e2e/proxy.spec.ts -g "staff_session_on_minha_conta_redirects_to_dashboard"`

**C67** - As ações destrutivas continuam pedindo confirmação em `Dialog` com o nome do titular: inativar e suspender aluno, inativar plano e o bloco de privacidade (AD-022, mantido)
Proof: `E2E e2e/students.spec.ts -g "inactivate_and_suspend_confirm_naming_the_student"`
Proof: `E2E e2e/plans.spec.ts -g "inactivate_confirms_naming_the_plan_then_deletes_and_goes_to_the_list"`
Proof: `E2E e2e/privacy-block.spec.ts -g "anonymize_dialog_text_and_cancel_sends_nothing"`

**C68** - A validação de formulário não muda: React Hook Form sobre o schema Zod, `aria-invalid`, erro por campo ligado ao `path` e foco no primeiro campo inválido (mantido)
Proof: `E2E e2e/forms.spec.ts -g "field_errors_shown_on_four_forms"`
Proof: `E2E e2e/login.spec.ts -g "empty_login_is_rejected_before_any_request"`

**C69** - O baseline C39 é regravado sobre a cópia desta feature (não relaxado): as 22 rotas com `Shell` e `/` têm `main.innerText`, snapshot ARIA e a sequência de foco de 40 Tabs iguais ao baseline novo, gravado com `MOTION_BASELINE=record` sobre o código desta feature (Open question 1; motion C39)
Proof: `E2E e2e/motion.spec.ts -g "copy_names_and_focus_order_match_the_baseline"`

**C70** - As provas que a door 2 a door 6 quebram por desenho continuam verdes no texto novo: a navegação do cabeçalho com as quatro palavras, o menu do celular com o CTA da sessão, a landing sem shell e sem CSP de outra origem, e a tabela de 26 telas com cópia e disposição aprovadas (Open question 1; `Supersedes`)
Proof: `E2E e2e/landing-header.spec.ts -g "desktop_header_has_logo_four_section_links_and_session_cta"`
Proof: `E2E e2e/dukfit.spec.ts -g "landing_has_no_shell_no_external_request_and_no_csp_violation"`
Proof: `E2E e2e/identidade.spec.ts -g "every_screen_keeps_its_copy_and_arrangement"`

## Coverage

Uma linha por tela/estado de `Observable`, mais os conjuntos que as doors e o plano enumeram. O
`Unproven` só pode ficar vazio quando a linha inteira tem prova.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `Landing` doors (7) | door 1 C1 C2 C3 C5 C11 · door 2 C14 C15 C16 C17 C18 C19 C26 C27 C31 · door 3 C20 C21 C31 · door 4 C22 · door 5 C28 · door 6 C23 C24 C25 · door 7 C4 C6 C7 C8 C9 C10 C41 C51 C53 | - |
| `Landing` sections (7) | `hero` C15 C16 · `#visita` C19 · `#academia` C20 · `#estrutura` C20 C25 · `#planos` C26 · `#fecho` C27 · `footer` C17 | - |
| landing photographs (4) | `salao-cardio-1600` C20 C21 · `musculacao-440` C20 C21 · `cardio-440` C20 C21 · `amanhecer-440` C20 C21 | - |
| status tokens (11) | `--status-ok` C1 · `--status-ok-surface` C1 · `--status-warn` C1 · `--status-warn-surface` C1 · `--status-bad` C1 · `--status-bad-surface` C1 · `--status-idle` C1 · `--status-idle-surface` C1 · `--muted-strong` C1 · `--chart-off` C1 · `--border-control` C1 | - |
| `StatusBadge` map (27) | C4, table-driven over all 27 | - |
| screens with `ScreenHeader` (20) | C47, table-driven over all 20 | - |
| shell routes for no horizontal scroll (22) | C64, table-driven over all 22 | - |
| print routes (2) | `/students/<id>/print` C63 · `/staff/<id>/print` C63 | - |
| `loading.tsx` segments (13) | C44 C65, table-driven over all 13 | - |
| auth screens (4) | `/login` C32 C33 · `/primeiro-acesso` C34 · `/esqueci-senha` C34 · `/definir-senha` C35 | - |
| breakpoints measured (5) | 320 C30 · 390 C6 C36 · 768 C41 C51 · 1024 C28 C47 · 1440 C16 C18 C47 | - |
| rewritten proofs (10) | C69 C70, table-driven over all 10 | - |
| startup config (0) | n/a em todos - nenhum módulo, guarda ou variável de ambiente nova antes da primeira requisição | - |
| `screen /` - empty, loading, error (0) | n/a em todos - conteúdo estático de `site-content.ts`, sem chamada à API | - |
| `screen /` - unauthorised (1) | `sem sessão` C14 - existing `landing_is_public_200_without_redirect` | - |
| `screen /` - density and ordering (3) | `herói` C16 · `ordem` C17 · `alturas` C18 | - |
| `screen /` - destructive action (0) | n/a em todos - nenhuma ação destrutiva na landing | - |
| `screen /` - empty state of a list or card (0) | n/a em todos - a landing não tem lista de dados | - |
| `screen /` - hover and motion states (3) | `laço` C23 · `hover` C24 · `entrada` C25 | - |
| `screen /` - what the visitor does next (4) | `rota` C19 · `plano` C26 · `fecho` C27 · `barra` C28 | - |
| `screen /login` - error and outcome messages (2) | `busy` C33 · `mensagem` C33 | - |
| `screen /login` - labels and heading (3) | `eyebrow` C32 · `título` C32 · `moldura` C35 | - |
| screens `/primeiro-acesso`, `/esqueci-senha`, `/definir-senha` - success and refusal (3) | `/primeiro-acesso` C34 · `/esqueci-senha` C34 · `/definir-senha` C35 | - |
| `screen /minha-conta` - empty (1) | `sem matrícula` C39 | - |
| `screen /minha-conta` - loading (1) | `loading.tsx` C44 | - |
| `screen /minha-conta` - error (1) | `falha` C43 | - |
| `screen /minha-conta` - unauthorised (1) | `equipe` C46 - existing `proxy.ts`, AD-124 | - |
| shell screens - empty state (1) | `vazio` C49 | - |
| shell screens - loading (1) | `loading.tsx` C65 | - |
| shell screens - error (1) | `erro` C61 | - |
| shell screens - unauthorised (1) | `guarda` C66 - existing `proxy.ts` e `@Roles`, AD-022 | - |
| shell screens - density and ordering (5) | `cabeçalho` C47 · `corpo` C50 · `tabela` C51 · `filtros` C52 · `situação` C53 | - |
| destructive actions - confirmation (1) | `diálogo` C67 | - |
| forms - validation and focus (1) | `erro por campo` C68 | - |
| print - media (1) | `impressão` C63 | - |

- Claims naming route, tela ou status: C14 a C31, C32 a C64 - cada prova abre a rota no Chromium contra
  `next build && next start` ou lê o arquivo que a check nomeia
- `Relations` e `Surface` são `None` no plano; C12 e C64 provam que nenhuma rota, contrato, schema ou
  permissão mudou
- Nenhuma check afirma mais do que o caso único que a prova exercita

## Test policy

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decisão renderizada no navegador (`ScreenHeader`, `StatusBadge`, `EmptyState`, `ListOrTable`, `Table`, toolbar, herói/seções/hover/barra de ação da landing, resumo e histórico do portal) | uma prova no limite do navegador | um caso por ramo da decisão: breakpoint (767/768, 1023/1024), variante de situação, estado de carga/falha/vazio |
| Regra estrutural sobre arquivos (tokens, grep de hex, mapa de status, `SITE`, `PAGE_BODY`, `disabled={isSubmitting}`, `loading.tsx`) | uma prova de repositório | table-driven sobre o conjunto inteiro, com o tamanho do conjunto declarado |
| Regra de CSS (tokens de status, contraste, `prefers-reduced-motion`) | uma prova de repositório para o literal e uma no navegador para o valor computado | cada regra nomeada nas doors 1, 6 e 7 |
| Instrumentação (`Button busy`, `Table`, `AppLoading`, `Reveal`/`Stagger`) | nenhuma prova própria além da linha estrutural | coberto pela prova do consumidor |

Evidence:

- `packages/ui/src/components/status-badge.tsx`: decide sobre 27 pares (entidade, situação) e 9
  entidades -> decide; C4.
- `packages/ui/src/components/list-or-table.tsx`: 1 decisão de breakpoint em 768 -> decide; C8, C41, C51.
- `packages/ui/src/components/screen-header.tsx`: 1 decisão de breakpoint (ações empilhadas a 390) ->
  decide; C6, C47.
- `packages/ui/src/components/empty-state.tsx`: 2 decisões (descrição e ação opcionais) -> decide; C7,
  C49.
- `apps/web/src/components/landing/site-header.tsx`: 4 decisões (limiar de rolagem de 24 px, breakpoint
  de 1024, CTA de seção visível, menu aberto/fechado) -> decide; C28, C70.
- `apps/web/src/app/page.tsx`: compõe `SITE` sem ramo novo além do CTA da sessão (existing) -> entry
  point; C14 a C31.
- `apps/web/src/app/minha-conta/page.tsx`: 3 decisões (falha de carga, sem períodos, histórico em
  tabela) -> decide; C36 a C45.
- os 20 `page.tsx` com `Shell`: cada um compõe `ScreenHeader` + corpo e herda as decisões das peças ->
  C47 a C64.
- closest analogue: `apps/web/e2e/motion.spec.ts` (medidas e quadros amostrados) e
  `tests/repo/identidade.test.ts` (regras estruturais) já provados neste nível com 24 telas e 7 doors.

Cost: 70 provas nas suas próprias camadas, em 4 slices e cerca de 90 arquivos, incluindo as 8 provas de
tela e os 2 testes de repositório reescritos e o baseline regravado. Sem estas linhas, o mapa de 27
situações e a tabela de 20 telas seriam provados só por um caminho que os atravessa.

## Swept

- validation: C11, C20, C57 - borda de controle a 3:1, `width`/`height`/`alt` de toda imagem e campo de retenção com unidade; nenhum schema de formulário muda
- failure modes: C43, C61 - falha de carga do portal e de um bloco de ficha mantêm o resto na tela; C29 - zero origem de terceiro e zero violação de CSP
- idempotency: n/a - nada é escrito, migrado ou repetido; a feature é CSS, composição e provas (C12)
- authorization: existing - `proxy.ts` e as guardas `@Roles` não mudam (C12, C46, C66); o corte do aluno continua AD-124
- concurrency: n/a - nenhuma requisição nova e nenhuma ordem entre escritas; as animações de C25 e C62 não bloqueiam o ponteiro
- data lifecycle: n/a - nenhum dado é lido, gravado ou migrado; `site-content.ts` é estático (C12)
- dependency failure: C29, C43 - nenhuma origem de terceiro é carregada; a falha da API do portal mostra `Alert` com "Tentar novamente"
- state transitions: C23, C33, C43 - a landing não tem laço; o botão vai de ocioso a `busy` e volta; a carga vai de espera a falha e a retry
- observability: n/a - nenhum log, métrica ou linha de trilha muda; `aria-busy` e `role="alert"` são o sinal de tela (C33, C43)

## Handoff

Size from `wc -c` of the files each slice touches, divided by four.

- S1 = 13k (1,4k de `globals.css`, ~7k das peças de `packages/ui`, 2,5k de `refino.test.ts` e 2,3k de
  `identidade.test.ts`); S3 = 16k (`login`, as três telas de senha, `/minha-conta` e molduras ~7,4k,
  `login.spec.ts` 1k, `portal.spec.ts` 2,3k e os trechos de `refino-visual.spec.ts` ~5k). Batch A
  (S1 + S3) = 29k; com este `checks.md` lido uma vez (~13k) = ~42k.
- S2 = 50k (`page.tsx` 24k, `site-content.ts` 2,1k, `components/landing` 3k, `landing.spec.ts` 4,7k,
  `dukfit.spec.ts` 9,8k, `landing-header.spec.ts` 3,9k e `support/motion.ts` 2k). Batch B = 50k; com o
  `checks.md` = ~63k.
- S4 = 77k (20 `page.tsx` e componentes ~45k, `identidade.spec.ts` 5,7k, `support/identidade.ts` 2,6k,
  `motion.spec.ts` 11,1k, `motion.test.ts` 3,4k, `refino-visual.spec.ts` ~8k e ~1k de código de teste do
  baseline; os dois JSON do baseline são regravados, não lidos). Batch C = 77k; com o `checks.md` = ~90k.
- Total = 29k + 50k + 77k = **156k**, acima do budget de 150k -> mecanismo **handoff**, em 3 batches:
  A (S1 + S3), B (S2), C (S4). Batches sequenciais e só passam adiante no verde; cada builder lê este
  arquivo e o diff do que já entrou, nunca um resumo narrado.
- O baseline C39 é o último passo do batch C: ele compara a cópia de todas as telas, então só pode ser
  regravado depois que a landing, o portal e as 20 telas estiverem no lugar (C69).
- A ordem do batch C é: peças e guardas (C65, C47-C53), depois as telas e os formulários (C54-C62), depois
  impressão e portão (C63-C64) e por último o baseline e as provas reescritas (C69, C70).
- Mechanism: **handoff** - escolhido pelo usuário em 2026-11-07: 3 batches, A (S1 + S3), B (S2) e
  C (S4), sequenciais, cada um só passa adiante no verde. Cada builder lê este arquivo e o diff do
  que já entrou, nunca um resumo narrado; o batch C termina regravando o baseline C39 sobre o código
  final e o pai dispara o Verifier na sequência, sobre `base..HEAD` com todos os 70 checks.
- **Boundary:** vazio - o Build ainda não começou. Base da feature: `67c22e6`. Sem push. Cada builder
  acrescenta aqui as três linhas do template (`Boundary`, `Settled mid-build`, `Abandoned`) ao fechar
  o batch no verde.
- **Boundary (batch A):** S1 + S3 fechadas sobre a base da feature (`67c22e6`, com plano e checks em
  `823fc95`), sem push e sem tocar `.specs/STATE.md`; os checks do batch A (C1-C13 e C32-C46) estão
  provados, e o baseline C39 da `motion` continua verde (regravado só no batch C, sobre o código
  final). As provas do batch foram rodadas uma a uma pelo comando do check: REPO 12/12 verdes (9 de
  `refino.test.ts`, C2 e C12 em `identidade.test.ts`, C44/C65 em `motion.test.ts`) e E2E 25/25 verdes
  em `.turbo/refino-a/proofs-e2e.log` (C4, C6-C11, C32-C46 e o baseline C39). Commits: `c9acd49`
  (tokens e peças), `937ae3f` (literais de cor, borda de controle e `Button busy`), `1e83ec0`
  (entrada e portal do aluno) e `542111d` (provas).
  `pnpm verify` **sai 0** com o arranjo de ambiente do harness (21/21 tarefas, log
  `.turbo/tmp/verify-a-final.log`), sem enfraquecer check nem prova: o turbo confina as tarefas
  filhas ao workspace, então `TEMP`/`TMP` apontam para `.turbo/tmp` (sem isso o `vitest` morre com
  `EPERM` em `%TEMP%`); os testes de `@academia/database`/`@academia/api` usam
  `~/.testcontainers.properties` com `docker.host=tcp://127.0.0.1:2376`, uma ponte TCP→named pipe
  aberta pelo shell porque o filho do turbo não abre o named pipe do Docker (`connect EPERM`); e
  `%LOCALAPPDATA%\ms-playwright` é um junction para `.turbo/pw-browsers`, porque o
  `playwright install` do turbo não escreve fora do workspace. O arranjo é só ambiente: nenhum
  arquivo do repositório mudou por causa dele, e o Verifier roda o mesmo `pnpm verify` com o mesmo
  arranjo.
- **Settled mid-build (batch A):**
  - O `ScreenHeader` foi provado no `/minha-conta`: o bloco de identidade do portal é o próprio
    `ScreenHeader` (olho "Minha conta", nome como `h2` de 30 px, o plano como meta e o `StatusBadge`
    do período atual nas ações, ao lado da foto), porque no batch A nenhuma tela de equipe consome a
    peça ainda; as 20 telas do batch C herdam o componente sem mudar o contrato.
  - O `EmptyState` sem períodos ganhou a descrição "Fale com a recepção para fazer sua matrícula."
    (a C7 pede a descrição de 14 px e a C38 só fixa o título): é texto de tela reversível, não regra
    de negócio, e entra no `Settled` para o Verifier poder cobrá-lo.
  - `/minha-conta` deixou de ter `h1` de página: o título de 30 px do bloco de identidade é o `h2` do
    `ScreenHeader`. O ARIA/foco/cópia da tela não entram no baseline C39, que segue verde.
  - O cartão de resumo usa como "próximo vencimento" o primeiro período por pagar (do vencimento
    mais antigo) e, com todos pagos, o de vencimento mais recente; é o mesmo período cujo badge
    aparece na identidade, e a data sai em `--status-bad` quando a situação é `overdue` (C37, C38).
  - `tests/repo/motion.test.ts` passou a contar 12 segmentos com `AppLoading` e o teste
    `twelve_segments_have_app_loading`, porque o `loading.tsx` de `/minha-conta` virou o esqueleto do
    portal (C44) - é a reescrita que o `Supersedes` já previa para C44/C65.
  - `apps/web/e2e/identidade.spec.ts` e `e2e/support/identidade.ts` foram tocados no mínimo: as duas
    asserções de borda de controle passaram de `--input` para `--border-control` (C11), como a Open
    question 1 autoriza; nenhuma outra cláusula mudou.
  - O lime antigo `rgb(205 247 32)` do `/check-in` **fica** para o batch C: o literal do arquivo é
    `rgb(205_247_32_/_0.15)`, que não é hex nem as formas que a C3 lista, e a tela é S4; ela troca por
    `StatusBadge` na C52/C59. As demais cores antigas saíram na C3.
  - O `PersonPhoto` da ficha virou responsivo (96×128 abaixo de 768 px, 120×160 a partir dele), como a
    C36 pede; a ficha do aluno e o check-in do batch C herdam a mesma moldura.
- **Abandoned (batch A):**
  - Provar a C11 num componente isolado: o `Select` foi medido numa tela existente (`/audit`) e o
    `Input`/`Button` outline no `/login` e no `/minha-conta`; nenhuma tela de equipe mudou de layout.
  - Fazer o `pnpm verify` literal passar sem arranjo de ambiente: o confinamento é do harness, não
    do código; o comando roda com `TEMP`/`TMP` no workspace, a ponte TCP do Docker e o junction do
    Playwright, registrados no `Boundary` acima. As ferramentas do arranjo vivem fora do repositório
    (`.turbo/tmp`, `~/.testcontainers.properties`, `%LOCALAPPDATA%\ms-playwright`).
  - Criar uma rota ou tela de demonstração para as peças: o `ScreenHeader`, o `EmptyState` e a
    `ListOrTable` são provados nas telas que a S3 já entrega.
- **Boundary (batch B):** S2 (C14-C31) fechada sobre o batch A (`d62a830`), sem push e sem tocar
  `.specs/STATE.md`: a landing virou o lugar da DukFit em Flores, Manaus na forma da door 2
  (`site-content.ts`, `page.tsx` e `components/landing`). As provas foram rodadas pelo comando do
  check: E2E 18/18 em `landing.spec.ts` (C14-C30, com C17 e C25 em duas provas cada), 6/6 em
  `dukfit.spec.ts` (C17, C29 e as cláusulas do herói/sessão que a door 2 quebra por desenho) e 13/13
  em `landing-header.spec.ts` (C28 e C70); REPO 9/9 em `identidade.test.ts` (C31, incluindo
  `landing_page_has_no_literal_text_in_jsx`). Junto, a suíte adjacente (csp, portal-public, proxy,
  shell e refino-visual) deu 56/56 verdes, o baseline C39 foi regravado e a prova dele e as 4 provas
  da `motion` que tocam a landing ficaram verdes. `pnpm verify` **sai 0** com o arranjo de ambiente do
  harness: 21/21 tarefas, 467 testes E2E do web, 891 da API e 89 de repositório, log
  `.turbo/tmp/verify-b-final.log`. Commits: `a8ece87` (a landing como lugar), `f298dbf` (as provas) e
  o commit deste handoff.
- **Settled mid-build (batch B):**
  - O `data-type="place"` do `<html>` é marcado no navegador pelo `PlaceDocument` (client, recebe
    `SITE.kind`): o layout raiz é um só para o app inteiro e o Next não oferece atributo de `<html>`
    por rota, então `proxy.ts` e `layout.tsx` ficam intocados; as três metas saem do `metadata` do
    `page.tsx`, server-side. A C14 é provada no DOM renderizado, onde a prova da tela mede.
  - A entrada do herói (opacidade 0→1 e y 12→0 em 300 ms) e o `picture-develops` da `#estrutura`
    (escala 1.06→1 e recorte em 600 ms, uma vez) são transições CSS dirigidas por um efeito de
    montagem e por `IntersectionObserver`, não pelo `motion`: com `MotionConfig reducedMotion="user"`
    o `motion` deixa a opacidade inicial no DOM sob `prefers-reduced-motion` e a C25 falharia; curva e
    duração continuam lidas de `MOTION`.
  - A régua do título linkado e a escala 1.03 da foto linkada são medidas pelo `transform` computado
    dos utilitários arbitrários do Tailwind (`after:[transform:scaleX(…)]`,
    `group-hover:[transform:scale(1.03)]`), e o botão sobe 1 px pela propriedade `translate`
    (`hover:-translate-y-px`) sem conflitar com o `scale(0.98)` do `.pressable` no `:active`.
  - O CTA da sessão saiu do cabeçalho abaixo de 1024 px e vive no `SiteMenu` (door 5): `SITE.cta.*`
    deu lugar a `SITE.labels.guest/member` e `SITE.hero.cta` no `site-header.tsx`, e a prova do menu
    passou a esperar as quatro palavras de `SITE.nav` (a contagem estava fixa em 5).
  - A seção corrente do cabeçalho passou de `IntersectionObserver` para a posição de rolagem: com as
    seções de uma tela, a seção anterior ficava presa na faixa e o `aria-current` atrasava uma seção.
    `current_section_link_has_aria_current_location` continua a mesma.
  - O `auth-frame.tsx` (decoração do login) lia `SITE.eyebrow`/`SITE.tagline`, que a door 2 remove;
    passa a ler `SITE.about.eyebrow`, `SITE.hero.title` e `SITE.hero.subline` (a moldura é
    `aria-hidden`).
  - O baseline C39 foi **regravado com `MOTION_BASELINE=record`** sobre o código deste batch
    (`1440.json` e `390.json`), sem relaxar a comparação: a cópia, a ARIA e o foco da landing mudaram
    por desenho. A `#planos` **entrou** no baseline (a exclusão da `motion` era da AD-106 e não vale
    mais) e a barra de ação fixa entrou no `LANDING_EXCLUDED` porque a presença dela depende da
    rolagem que a sequência de 40 Tabs provoca - ela é provada pela C28. A gravação final continua
    sendo do batch C, sobre o código final.
  - `tests/repo/identidade.test.ts` › `site_content_is_the_only_source_of_landing_copy` teve a lista
    de chaves da door 3 trocada pela da door 2 (as chaves antigas deixaram de existir); as demais
    cláusulas (fonte única, sem telefone/WhatsApp, sem literais no `page.tsx`) continuam.
- **Abandoned (batch B):**
  - `inner_screens_have_30_medium_title_and_dark_panels` e
    `mobile_tables_scroll_inside_panel_and_forms_are_full_width`, do `dukfit.spec.ts`: ficam intocadas
    e verdes, porque as telas da equipe são do batch C (C64), que as reescreve sobre o código final.
  - Provar a C22 por `data-slot` de `Panel`: a peça não expõe slot; a prova mede raio 0 em foto e
    moldura, nenhum bloco de conteúdo arredondado e nenhuma sombra, o que cobre o `Panel` e o cartão.
  - `data-page-mode="short"` e a página compacta da skill (menos de 8 fotos): o plano manteve as seis
    seções com as quatro cenas reais (Assumption "Densidade da landing"), então a landing não é a
    *short page*.
- **Boundary (batch C):** S4 (C47-C70) fechada sobre o batch B (`9aa8210`), sem push e sem tocar
  `.specs/STATE.md`: as 20 telas com `Shell` ganharam o `ScreenHeader` e o corpo simples, as listas
  passaram a `ListOrTable`/`EmptyState`/`StatusBadge` com a toolbar de filtros, as fichas ganharam
  identidade, grupos e cartões, os formulários marcas de obrigatório, seções e "Cancelar", e
  `/privacy`, `/account` e `/check-in` receberam o interruptor temático, os dois cartões e o `Panel`.
  As provas do batch foram rodadas uma a uma pelo comando do check: REPO 10/10 em `refino.test.ts`
  (com a C50 nova) e 25/25 em `motion.test.ts` (C65); E2E 17/17 novos em `refino-visual.spec.ts`
  (C47-C64), 23/23 em `identidade.spec.ts` (C63, C70 e as 26 telas) e 34/34 em `dukfit.spec.ts`
  (C17, C29, C64 e C70). O baseline C39 foi **regravado** com `MOTION_BASELINE=record` sobre o código
  final (`1440.json` e `390.json`, as 22 rotas com `Shell` e `/`) e a prova dele passa comparando o
  baseline novo, sem relaxar texto, ARIA nem foco. `pnpm verify` **sai 0** com o arranjo de ambiente do
  harness: 21/21 tarefas, 484 testes E2E do web, 891 da API, 90 de repositório, 79 de banco e 20 de
  contratos, log `.turbo/tmp/verify-c-final-3.log`. Commits: `068c734` (as telas e as peças),
  `366078a` (as provas) e o commit deste handoff, que carrega o baseline regravado.
- **Settled mid-build (batch C):**
  - C52 exige o par "Filtrar"/"Limpar": `/students` tinha "Buscar"/"Limpar" e `/audit` "Limpar
    filtros". As provas não listadas na Open question 1 passaram a ler o rótulo novo, sem mudar
    asserção nem dado esperado: `apps/web/e2e/students.spec.ts` (o botão da toolbar nas linhas 150,
    170, 191, 211 e 218), `apps/web/e2e/audit.spec.ts` (`'Limpar filtros'` → `'Limpar'`, linhas 372 e
    504) e `apps/web/e2e/motion.spec.ts` (o botão nas provas de press e de busca). Decisão do Lead em
    2026-11-07.
  - C57 exige o "Desligado" temático e não o checkbox nativo: `/privacy` passou a usar
    `role="switch"`; `apps/web/e2e/privacy-settings.spec.ts` trocou `getByRole('checkbox')` por
    `getByRole('switch')`, `.check()`/`.uncheck()` por `.click()` e `toBeChecked()` por
    `toHaveAttribute('aria-checked')` — o estado do controle e o `PUT` com `null` continuam afirmados
    (linhas 14, 40, 48, 110 e 114). Decisão do Lead em 2026-11-07.
  - A `SCREENS` de `apps/web/e2e/support/identidade.ts` passou a 26 telas: entram `/leads` (com
    `Shell`) e `/minha-conta` (sem `Shell`, aberta com a sessão `student`); `serveWorld` ganhou
    `/api/leads`, `/api/me/profile` e `/api/me/payments`, e `open()` escolhe a sessão de cada tela. As
    22 rotas com `Shell` do baseline C39 (21 → 22 com `/leads`) e o guard de `motion` de página
    (19 → 20 telas não-print) acompanham a contagem.
  - C51 manda cartões abaixo de 768 px: a `ListOrTable` virou a apresentação das listas e a prova da
    `motion` de cascata passou a amostrar a apresentação visível (`LIST_CARDS` abaixo de 768 px, as
    células da `Table` a partir dele); o `rowsOf` da `motion` lê `locator('a')` em vez de
    `getByRole('link')`, porque o `<tr>` escondido não expõe papel. A ordem, os nomes e o stagger
    afirmados não mudaram.
  - A `ListOrTable` mantém `StaggerCell` nas células e ganhou `StaggerItem` nos cartões: a mesma lista
    anima nas duas apresentações. O hover do cartão linkado (AC 61) sobe 2 px pelo CSS `.lift` e o
    botão do tema sobe 1 px pela classe `.button-lift`, com o `:active` a 0,98 do `.pressable`.
  - O hover do botão saiu do seletor `.pressable` para a classe `.button-lift` do `Button`: no seletor
    global o CTA do herói da landing mudava de posição depois do hover e a C24 da landing
    (`hover_and_press_answer_on_photos_titles_and_buttons`) ficava vermelha; a classe restrita mantém
    a resposta da AC 61 no app sem tocar no CTA da landing.
  - C54 x `students.spec.ts`: a "Situação" continua sendo um campo (`dt`/`dd`) da ficha e é o próprio
    `StatusBadge`; para cumprir "acima dos campos" ela fica no topo do cartão de identidade, antes dos
    grupos — o `dd` da situação é o primeiro da ficha e a lista de `dt` que `students.spec.ts` fixa não
    mudou. O nome do bloco de identidade não é heading: o único `h2` da ficha continua sendo o
    `ScreenHeader`, e os grupos são `h3` dentro de `section` com `aria-labelledby`.
  - O título de `/account` é "Minha conta" (o rótulo da navegação) no `ScreenHeader`; os dois cartões
    ficaram `md:grid-cols-2` e os títulos deles são `h3` de 20 px, porque a C47 proíbe outro texto a
    30 px.
  - `/privacy` ganhou três linhas de efeito (texto de tela reversível) e as unidades "anos"/"dias"
    dentro da borda do campo.
  - `/users` usa o `StatusBadge` de `user` também para o 2FA (não há entidade 2FA no mapa da door 7),
    com os mesmos rótulos "Ativado"/"Desativado", e ganhou `EmptyState` para a lista sem usuários.
  - `/check-in`: o resultado virou `Panel` (região no nome do aluno), o selo "Liberado" é
    `StatusBadge` de `check-in` e o sucesso é um `Alert` que mantém `data-motion="feedback"` (a prova
    da `motion` de 180 ms continua); a lista de resultados do balcão também usa `StatusBadge`.
  - As listas migradas para `ListOrTable` mantêm os textos de negócio e os `data-slot` que as provas de
    outras features leem (`lead-status` em volta do badge, `panel-rows`, `dt`/`dd` da ficha), e a
    `Table` continua a de antes (raio de 16 px, cabeçalho em `--muted-strong`, hover em `--muted` a
    50%).
  - O baseline C39 foi regravado, não relaxado: a comparação de `main.innerText`, ARIA e foco continua
    a mesma (`motion.spec.ts`); só os dois JSON mudaram, sobre o código final deste batch.
- **Abandoned (batch C):**
  - Provar o "cartão linkado" da C62 como um cartão cujo clique inteiro navega: o cartão de
    `ListOrTable` carrega o link do registro e responde ao hover com a subida de 2 px; transformar o
    cartão inteiro num link exigiria aninhar o link da primeira célula e mudaria a marcação das duas
    apresentações. A prova mede a subida e o link do registro dentro do cartão.
  - Tirar a `Table` do DOM abaixo de 768 px: as duas apresentações ficam no DOM e se escondem por CSS,
    que é o que as provas de C8/C51 medem (`toBeHidden`) e o que mantém a troca de breakpoint sem
    remontar a lista; a cascata da `motion` fica nas duas apresentações.
