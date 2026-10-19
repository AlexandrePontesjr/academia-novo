# DukFit app

## Problem

A `identidade-visual` (#15) trouxe a paleta da referência (fundo #0a0a0a, cartões #141414, acento
#cdf720, Manrope), mas manteve de propósito o layout de formulário administrativo: um cabeçalho com
onze links de texto em linha, conteúdo em `max-w-4xl` e cartões com números soltos. No celular os
links quebram em três ou quatro linhas antes do conteúdo, não existe barra de navegação ao alcance
do polegar, e nenhum componente da referência - cabeçalho com avatar, cartão com título e botão
↗, blocos de métrica, medidor, gráfico de barras semanal, barra inferior de abas, botão flutuante
lime - existe no app. O sistema também não tem nome: o título é "Gestão de Academia".

Quem chega pela raiz do site também não encontra a academia: `/` é o painel autenticado e quem
não tem sessão é redirecionado para `/login`. Não há página que apresente a academia a um visitante.

O dono do produto pediu, em 2026-10-19, o app "exatamente com esse visual" no celular, responsivo no
computador, com um de-para dos componentes da referência, o nome DukFit e uma landing page em `/`.
A fonte não traz número de uso nem prazo.

Quando isto entrar: o app se chama DukFit; no celular cada tela tem o cabeçalho com avatar e a barra
inferior de cinco abas da referência, e o painel é montado com os cartões, blocos e gráficos dela;
no computador o mesmo conteúdo ganha uma barra lateral e grade de colunas; e `/` apresenta a
academia a qualquer visitante, com o painel em `/dashboard`.

## Flow

Reusa os tokens da `identidade-visual` (AD-090), a fonte (AD-091), o `Shell` e o `NavLink`
existentes, as permissões de menu de `lib/*.ts` e o `GET /api/dashboard` com o corte por perfil
da door 1 da `dashboard`; nenhuma cor, fonte ou regra de permissão nova.

1. navegador pede `/` -> `apps/web/src/proxy.ts` (exists) - deixa `/` passar sem sessão (door 1) e
   ainda gera o nonce do CSP; pede `/dashboard` sem sessão -> `307` para `/login`
2. `/` -> `apps/web/src/app/page.tsx` (exists, vira a landing - door 1) - lê o conteúdo da academia de
   `apps/web/src/app/site-content.ts` (door 4) e, se houver sessão, troca o CTA de entrada por
   "Ir para o painel"
3. `/dashboard` -> `apps/web/src/app/dashboard/page.tsx` (door 1, o painel que hoje está em `page.tsx`) -
   chama `GET /api/dashboard` pelo `loadDashboard` (exists)
4. `apps/api/src/dashboard` (exists) - acrescenta `checkIns.lastSevenDays` (door 2) contando
   `check_ins` por `day`, só para o perfil que já recebe `checkIns`
5. `packages/ui` (exists) - ganha os componentes da referência e o conjunto de ícones SVG inline
   (door 3), consumindo os tokens que já existem
6. `apps/web/src/components/shell.tsx` (exists) - monta o cabeçalho com avatar, a barra inferior
   (abaixo de 1024 px) ou a barra lateral (a partir de 1024 px) e o botão flutuante; toda tela com
   sessão herda
7. out: o mesmo HTML de cada tela dentro do novo shell; `/login`, `/login/two-factor` e
   `/two-factor/setup` sem shell, no layout da tela "Welcome Back" da referência

## Impact

| Front | What changes |
| --- | --- |
| domain | novo termo: `DukFit` - o nome da academia e do sistema, em `<title>`, shell, login e landing |
| domain | rota `/` mudou de sentido: era o painel autenticado, agora é a landing pública - quem ramifica nela hoje: `proxy.ts` (manda o logado de `/login` para `/`), `login-form.tsx` e `two-factor-form.tsx` (`window.location.assign('/')`), o "Continuar" de `two-factor-setup.tsx` (`href="/"`), o link "Início" do shell, o `nav-link.tsx` (regra `href === '/'`), o `not-found.tsx` e os 10 `page.goto('/')` de `e2e/dashboard.spec.ts`; todos passam a `/dashboard`, menos o link do 404, que vai para `/` |
| domain | `/dashboard` - novo endereço do painel; favoritos antigos de `/` caem na landing, que oferece "Ir para o painel" a quem tem sessão |
| stored data | nothing - nenhuma migração; o `lastSevenDays` é leitura sobre `check_ins.day`, que já existe com índice `check_ins_one_per_day_idx` |
| contrato da API | `GET /api/dashboard`: chave nova `checkIns.lastSevenDays`, aditiva, só onde `checkIns` já existe; o schema `strictObject` de `packages/contracts` muda junto (AD-011) |
| dependências | nenhum pacote npm novo: os ícones são SVG inline em `packages/ui` (door 3) |
| textos | o título "Gestão de Academia" vira "DukFit"; o `h1` do `/login` vira "Bem-vindo de volta" e o botão continua "Entrar"; os demais títulos, rótulos e mensagens das telas não mudam. Os checks da `identidade-visual` que afirmam o texto antigo do cabeçalho e do `/login` são substituídos pelos desta feature, registrado no `checks.md` |
| telas | as 21 telas com shell trocam o cabeçalho de links por cabeçalho + barra inferior/lateral; o painel é remontado no de-para; as listas, formulários e detalhes mantêm conteúdo e ordem, dentro de cartões da referência; `print` não muda |
| testes | `e2e/shell.spec.ts`, `dashboard.spec.ts`, `login.spec.ts`, `proxy.spec.ts` e `identidade.spec.ts` mudam onde afirmam `/`, o cabeçalho de links ou o título; os demais e2e continuam verdes sem edição |

## Relations

None - no stored-data shape change.

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `GET /` (página) | cookie de sessão opcional | HTML da landing; CTA "Acesso da equipe" -> `/login` sem sessão, "Ir para o painel" -> `/dashboard` com sessão | `200` |
| `GET /dashboard` (página) | cookie de sessão | HTML do painel no shell | `200`, `307` para `/login` sem sessão, `307` para `/two-factor/setup` com cadastro de 2FA pendente |
| `GET /api/dashboard` | cookie de sessão | o corpo de hoje + `checkIns.lastSevenDays: [{ day, count }]` com 7 itens, do mais antigo até hoje | `200`, `401` |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. `/` é a landing pública e o painel mora em `/dashboard` | no `proxy.ts`: `pathname === '/'` passa sem sessão, como `/login`; o logado que abre `/login` vai para `/dashboard`; `login-form.tsx` e `two-factor-form.tsx` fazem `window.location.assign('/dashboard')`; `app/page.tsx` é a landing e `app/dashboard/page.tsx` o painel | landing em `/academia` com `/` no painel - o pedido é a landing na raiz, e é a raiz que um visitante digita; `/painel` - rota em português contraria a AD-003, que fixa rotas em inglês |
| 2. Série semanal de check-ins no contrato do painel | em `dashboardCheckInsSchema`: `z.strictObject({ count: countSchema, lastSevenDays: z.array(z.strictObject({ day: z.string(), count: countSchema })).length(7) })`; `day` em `aaaa-mm-dd` no fuso que o painel já usa para `today`, do dia `today - 6` até `today`, dia sem presença com `count: 0` | calcular no web com sete chamadas a `GET /api/check-ins?from=&to=` - sete requisições por abertura de painel e a lista inteira trafegando só para contar; chave irmã `weeklyCheckIns` - duas chaves com o mesmo corte de perfil, quando o comentário do contrato diz "card novo é chave nova" e isto é o mesmo card |
| 3. Ícones como SVG inline em `@academia/ui` | `packages/ui/src/icons.tsx` exporta componentes `HomeIcon`, `UsersIcon`, `CheckInIcon`, `ChartIcon`, `UserIcon`, `ArrowUpRightIcon`, `MenuIcon`, `BellIcon`, `PlusIcon`, `ArrowLeftIcon` e os demais usados no menu, cada um `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">` | `lucide-react` - dependência npm nova para uns 15 ícones, e cada feature seguinte importaria dali; sprite `.svg` em `public/` - um arquivo a mais por requisição e `<use href>` que o `img-src`/CSP não precisa enfrentar |
| 4. Conteúdo da landing num módulo só | `apps/web/src/app/site-content.ts` exporta `SITE` com `name: 'DukFit'`, `tagline`, `address`, `phone`, `whatsapp`, `hours: Array<{ days, opens, closes }>`, `highlights: Array<{ title, text }>`, `modalities: string[]`; a landing não lê nada da API | variáveis de ambiente - texto de vitrine não é configuração e o `env.ts` (AD-015) recusaria subir sem elas; ler planos da API - `GET /api/plans` exige sessão (AD-022) e abrir uma rota pública é decisão de produto à parte |

- Nothing else in this change is hard to reverse

## De-para

Componente da referência -> componente do DukFit, com o dado que ele passa a mostrar. Valores de
cor saem dos tokens da AD-090; o laranja das barras abaixo do topo é o único tom novo
(#f59e0b, só em gráfico).

| Referência | DukFit | Dado |
| --- | --- | --- |
| Cabeçalho: foto redonda, "MN Nahid", "Level: Beginner" | `Shell` header: avatar 44 px com as iniciais sobre #1f1f1f, nome, "Perfil: <perfil>" | `session.user.name`, `ROLE_LABELS` |
| Botão quadrado do sino com ponto lime | botão quadrado 44 px, raio 12 px, que abre o menu "Mais"; ponto lime quando `payments.overdue > 0` | `GET /api/dashboard` (só no painel); nas outras telas sem ponto |
| Barra inferior de 5 abas, ativa com fundo #1f1f1f e ícone lime | `BottomNav` abaixo de 1024 px: Início, Alunos, a 3ª e a 4ª pela ordem Check-in, Pagamentos, Planos, Presenças, Funcionários que o perfil puder ver, e "Mais" | permissões de `lib/*.ts` |
| (não existe) | `SideNav` a partir de 1024 px: logo DukFit, todos os links com ícone, ativo com fundo #1f1f1f e ícone lime, "Sair" no rodapé | as mesmas permissões |
| Botão flutuante lime 56 px com faísca | `Fab`: quadrado #cdf720, raio 16 px, ícone de check-in, link para `/check-in` | só para quem `canCheckIn`; ausente nos outros perfis |
| Cartão com título e botão ↗ (Training Schedule, Today's Workout...) | `Panel`: #141414, raio 24 px, título 20 px/600, botão ↗ 32 px com borda #262626 que leva à lista | cada cartão do painel e as seções das telas de detalhe |
| Medidor semicircular com marcas e hora no centro (Training Schedule) | `Gauge` no cartão "Check-ins de hoje": 40 marcas, as acesas em lime na proporção hoje / maior dia da semana, número no centro, pílula com a data | `checkIns.count`, `checkIns.lastSevenDays`, `today` |
| Pílulas flutuantes "45 Min", "12 Exercises" (Today's Workout) | `StatPill`: #1f1f1f, raio 9999 px, ponto lime | Inativos e Suspensos no cartão "Alunos" |
| Dois blocos "Target Weight 74 KG → 70 KG / 78% Completed" e "Muscle Growth +3 KG" | `MetricTile`: #1a1a1a, raio 16 px, rótulo lime 12 px, valor 24 px, legenda #a3a3a3 | Matrículas (Ativas, Agendadas) e Pagamentos (Pendentes, Atrasados) |
| "Weekly Consistency" - barras triplas por dia, % no topo, lime no topo / laranja abaixo / cinza no zero | `WeekBars` no cartão "Check-ins da semana": 7 colunas SEG..DOM, número no topo, lime quando `count >= 0,9 × máximo`, #f59e0b quando `0 < count < 0,9 × máximo`, #404040 quando `0` | `checkIns.lastSevenDays` |
| Lista de cartões com ↗ (Body Analytics) | `ListRow` em cartão para "Vencimentos nos próximos 7 dias" e "Matrículas ativas por plano" no celular; a `Table` existente a partir de 768 px | `enrollments.expiringSoon`, `enrollments.byPlan` |
| Tela "Welcome Back": título, subtítulo, campos com ícone, botão lime de largura total | `/login`: wordmark DukFit, `h1` "Bem-vindo de volta", campos com ícone, botão "Entrar" em largura total | o formulário que existe |
| Telas de onboarding (foto, título forte, texto, indicador de página, botão lime) | seções da landing: hero, "Por que a DukFit", modalidades, horários (no `Gauge`), contato | `site-content.ts` |
| Fotos, imagens anatômicas, gráfico de peso, BMI/Body Fat, logotipo Tryvo | não reproduzidos | ver Out of scope |

## Criteria

### S1: Shell DukFit no celular e no computador (P1)

Toda tela com sessão tem o cabeçalho com avatar e a barra inferior no celular, e a barra lateral no
computador.

**Acceptance Criteria**

1. The system SHALL show "DukFit" as the document `<title>` of every page and as the wordmark of the shell, `/login` and the landing.
2. WHEN a page with session renders THEN the shell header SHALL show a 44 px circular avatar with the user's initials (first letter of the first and the last name, uppercase), the user's name and the text "Perfil: <perfil>" with the label from `ROLE_LABELS`.
3. WHILE the viewport is narrower than 1024 px the shell SHALL show a bottom navigation fixed to the bottom with exactly 5 items, background #141414, radius 24 px, and SHALL NOT show the side navigation.
4. WHEN the bottom navigation renders THEN its items SHALL be "Início", "Alunos", the first two of "Check-in", "Pagamentos", "Planos", "Presenças", "Funcionários" that the profile may open, in that order, and "Mais"; each item SHALL carry its text as accessible name.
5. WHEN a navigation item points to the current route THEN it SHALL have `aria-current="page"`, background #1f1f1f and icon color #cdf720.
6. WHEN "Mais" or the header menu button is activated THEN the system SHALL open a dialog listing every link the profile may open, including those not in the bottom navigation, plus "Minha conta" and "Sair".
7. WHILE the viewport is 1024 px or wider the shell SHALL show a side navigation 256 px wide with the DukFit wordmark, every link the profile may open with its icon, and "Sair", and SHALL NOT show the bottom navigation.
8. WHERE the profile may register check-ins the shell SHALL show a floating 56 px button with background #cdf720, radius 16 px and accessible name "Registrar check-in", linking to `/check-in`.
9. IF the profile may not register check-ins THEN the shell SHALL NOT render the floating button.
10. WHILE the viewport is narrower than 1024 px the main content SHALL have 16 px side padding and a bottom padding that keeps the last element above the bottom navigation.
11. The system SHALL show no horizontal page scroll at 360 px and at 1440 px viewport widths on any screen with shell.

**Independent test:** abrir `/students` com cada perfil de desenvolvimento em 390×844 e em 1440×900 e conferir header, barra, menu "Mais" e botão flutuante.

### S2: Painel no de-para da referência (P1)

O painel em `/dashboard` é montado com os componentes da referência sobre os dados que já existem.

**Acceptance Criteria**

12. WHEN a user with session opens `/dashboard` THEN the system SHALL render the dashboard with the cards the API returns for that profile, each as a `Panel` with background #141414, radius 24 px and a title.
13. WHEN a `Panel` has a destination THEN its header SHALL show a 32 px ↗ link with border #262626 and the accessible name of the old text link ("Ver alunos", "Ver presenças de hoje").
14. WHEN the API returns `checkIns` THEN the "Check-ins de hoje" panel SHALL show a semicircular gauge of 40 ticks, with `round(40 × count / max(1, maior count de lastSevenDays))` ticks in #cdf720 and the rest in #404040, `checkIns.count` in the center and the date of `today` in a pill below.
15. WHEN the API returns `checkIns` THEN the "Check-ins da semana" panel SHALL show 7 columns labeled with the weekday abbreviation (SEG, TER, QUA, QUI, SEX, SÁB, DOM) of each `lastSevenDays` day, oldest first, with the count above each column.
16. WHEN a week column renders THEN its bars SHALL be #cdf720 if `count >= 0.9 × máximo da semana`, #f59e0b if `0 < count < 0.9 × máximo`, and #404040 if `count = 0`.
17. WHEN the "Alunos" panel renders THEN it SHALL show the active count as the main number and "Inativos <n>" and "Suspensos <n>" as pills with background #1f1f1f and a #cdf720 dot.
18. WHEN the API returns `enrollments` or `payments` THEN each count SHALL render as a `MetricTile` with a #cdf720 label, a 24 px tabular number and background #1a1a1a, and the pending and overdue numbers SHALL keep linking to `/payments?status=pending` and `/payments?status=overdue`.
19. WHILE the viewport is narrower than 768 px the expiring and by-plan lists SHALL render as stacked rows inside the panel, and from 768 px as the existing `Table`.
20. IF the dashboard fails to load THEN `/dashboard` SHALL keep showing `DashboardLoadError` inside the shell.
21. IF `enrollments.expiringSoon.items` or `enrollments.byPlan` is empty THEN the panel SHALL keep the current empty text ("Nenhum vencimento nos próximos 7 dias.", "Nenhuma matrícula ativa.").
22. WHILE the viewport is 1024 px or wider the dashboard SHALL lay out the panels in a 3-column grid, and 1 column below 768 px.
23. WHEN `payments.overdue` is greater than 0 THEN the header menu button on `/dashboard` SHALL show a 8 px #cdf720 dot with the accessible description "Há pagamentos atrasados".

**Independent test:** abrir `/dashboard` como Administrador e como Instrutor em 390×844 e 1440×900, com presenças semeadas em dias diferentes da semana.

### S3: Série semanal no contrato do painel (P1)

A API entrega a contagem de presenças dos últimos 7 dias para quem já vê o card de check-ins.

**Acceptance Criteria**

24. WHEN a profile that receives `checkIns` calls `GET /api/dashboard` THEN `checkIns.lastSevenDays` SHALL have exactly 7 items, from `today - 6` to `today`, each `{ day: 'aaaa-mm-dd', count }`.
25. IF a day in the window has no check-in THEN its item SHALL be present with `count: 0`.
26. The system SHALL make the last item's `count` equal to `checkIns.count`.
27. IF the profile does not receive `checkIns` THEN the response SHALL NOT contain `lastSevenDays` anywhere.
28. IF the request has no session THEN `GET /api/dashboard` SHALL keep answering `401` in `application/problem+json`.

**Independent test:** teste de integração da API contra Postgres com presenças em 3 dos 7 dias e uma de 8 dias atrás.

### S4: Landing page em `/` (P1)

Qualquer visitante que abre `/` vê a apresentação da DukFit.

**Acceptance Criteria**

29. WHEN a visitor without session opens `/` THEN the system SHALL answer `200` with the landing, and SHALL NOT redirect to `/login`.
30. WHEN the landing renders THEN it SHALL show, in this order, the hero (wordmark, `h1` with `SITE.tagline`, a #cdf720 pill button), "Por que a DukFit" with the `SITE.highlights` cards, "Modalidades", "Horários" and "Contato" with `SITE.address`, `SITE.phone` and a `wa.me` link built from `SITE.whatsapp`.
31. WHILE the visitor has no session the landing CTA SHALL read "Acesso da equipe" and link to `/login`.
32. WHILE the visitor has a session the landing CTA SHALL read "Ir para o painel" and link to `/dashboard`.
33. The landing SHALL render without the shell, load no external origin, and raise zero `securitypolicyviolation` events.
34. WHILE the viewport is narrower than 768 px the landing sections SHALL stack in one column; from 1024 px the highlights SHALL lay out in 3 columns.
35. The landing SHALL take every academy text from `site-content.ts` and none from the API.

**Independent test:** abrir `/` numa janela anônima em 390×844 e 1440×900; entrar e abrir `/` de novo.

### S5: Rotas e entrada (P2)

O painel mudou de endereço sem quebrar a entrada, o 2FA nem a proteção das telas.

**Acceptance Criteria**

36. WHEN login succeeds without second factor THEN the browser SHALL land on `/dashboard`.
37. WHEN the second factor is accepted THEN the browser SHALL land on `/dashboard`.
38. WHEN a user with session opens `/login` THEN the system SHALL answer `307` to `/dashboard`.
39. IF a visitor without session opens `/dashboard` or any other screen route THEN the system SHALL answer `307` to `/login`, as today.
40. WHILE an admin has two-factor enrollment pending, WHEN they open `/` THEN the system SHALL show the landing, and WHEN they open `/dashboard` THEN the system SHALL answer `307` to `/two-factor/setup`.
41. WHEN `/login` renders THEN it SHALL show the DukFit wordmark, the `h1` "Bem-vindo de volta", the fields "E-mail" and "Senha" with a leading icon, and a full-width #cdf720 button "Entrar".
42. WHEN the "Início" navigation item is activated THEN the browser SHALL open `/dashboard`.
43. IF an unknown route is requested THEN the 404 page SHALL keep "Página não encontrada" and link to `/`.

**Independent test:** `e2e/login.spec.ts`, `two-factor.spec.ts` e `proxy.spec.ts` com os destinos novos.

### S6: Telas internas no visual (P2)

Listas, formulários e detalhes herdam cartões e espaçamentos da referência sem mudar conteúdo.

**Acceptance Criteria**

44. WHEN a list, form or detail screen renders THEN its page title SHALL be 24 px weight 700 and its content blocks SHALL be `Panel`s with background #141414 and radius 24 px.
45. WHILE the viewport is narrower than 768 px a `Table` SHALL scroll horizontally inside its panel and SHALL NOT widen the page.
46. WHILE the viewport is narrower than 768 px form fields SHALL take the full width and primary buttons SHALL be full width.
47. The system SHALL keep every heading, label, button text, link destination and column of the screens other than `/`, `/dashboard` and `/login`, and the existing e2e of those screens SHALL pass with no change other than the `/` -> `/dashboard` destination.
48. WHEN `/students/[id]/print` or `/staff/[id]/print` renders THEN it SHALL keep the current print layout, without shell, navigation or floating button.
49. The system SHALL keep `pnpm verify` at exit 0, including `apps/web/e2e/csp.spec.ts` with zero `securitypolicyviolation`.
50. The system SHALL NOT add an npm dependency.

**Independent test:** percorrer `/students`, `/students/new`, `/students/[id]`, `/plans` e `/account` em 390×844 com os quatro perfis.

## Out of scope

| Excluded | Why |
| --- | --- |
| Fotos, imagens anatômicas 3D e o logotipo da referência | são de outro produto; a DukFit não tem esses assets nem direito sobre eles |
| Gráfico de peso, BMI, gordura corporal, metas de treino, nutrição, onboarding de aluno | o sistema é de gestão da academia para a equipe; não guarda dado de treino nem de corpo |
| Área do aluno ou login de aluno | o PRD só tem usuários da equipe; a landing apresenta a academia, não abre conta |
| Notificações reais no botão do sino | não existe feature de notificação; o botão abre o menu e mostra o ponto de atraso só no painel |
| Planos e preços públicos na landing | exigiria rota pública na API (AD-022); a landing usa só `site-content.ts` |
| Formulário de contato ou captura de lead na landing | grava dado pessoal de visitante sem base legal definida (LGPD); o contato é telefone e WhatsApp |
| Tema claro e alternância | AD-090 fixa o tema escuro |
| Redesenho do layout de impressão | `print` continua como está |
| SEO além de `<title>` e `description` (sitemap, Open Graph, dados estruturados) | fica para quando houver domínio (Open question da `operacao`) |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Endereço do painel | `/dashboard` | AD-003 fixa rotas em inglês; o título da tela continua "Painel"; ver door 1 | n |
| Gráfico semanal | série de 7 dias na API do painel | é o único componente da referência que pede dado novo; ver door 2 | n |
| Ponto de virada | barra inferior abaixo de 1024 px, barra lateral a partir de 1024 px; tabela vira linhas abaixo de 768 px | tablet em retrato usa como celular; a referência é só celular | n |
| Botão flutuante | atalho para `/check-in`, ícone de check-in no lugar da faísca | a faísca da referência sugere IA, que o sistema não tem; check-in é a ação mais repetida do balcão | n |
| Sino | abre o menu "Mais"; ponto lime só no painel e só com atraso | sem feature de notificação; o atraso é o único alerta que o painel já conhece | n |
| Logotipo | wordmark "Duk" em #f5f5f5 + "Fit" em #cdf720, Manrope 800 | não há logo da academia; o raio da Tryvo é marca de outro app | n |
| Título do login | "Bem-vindo de volta" | reproduz a tela "Welcome Back"; o botão segue "Entrar" | n |
| Imagens da landing | só tipografia, brilho radial lime e grafismos SVG, nenhuma foto | não há fotos da academia; foto de banco de imagem mostraria outra academia | n |
| Avatar | iniciais em vez da foto do funcionário | o usuário nem sempre tem funcionário vinculado, e a foto é servida por URL assinada (AD-005) que o shell não carrega | n |
| Cor de barra abaixo do topo | #f59e0b | é o laranja da referência e só aparece em gráfico | n |

**Open questions:**

| # | Kind | Question | Until answered |
| --- | --- | --- | --- |
| 1 | blocks go-live | Endereço, telefone, WhatsApp, horários, modalidades e o slogan da DukFit | a landing sobe com o texto de exemplo de `site-content.ts`, marcado como exemplo no próprio arquivo; não pode ir ao ar assim |

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/` (landing) | empty, loading, error | n/a - conteúdo estático de `site-content.ts`, sem chamada à API |
| screen `/` (landing) | unauthorised | AC 29, AC 31, AC 32 - pública, só o CTA muda |
| screen `/` (landing) | density and ordering | AC 30, AC 34 |
| screen `/` (landing) | destructive action | n/a - nenhuma ação |
| screen `/dashboard` | empty state | AC 21 |
| screen `/dashboard` | loading | n/a - server component, renderiza com os dados |
| screen `/dashboard` | error state | AC 20 |
| screen `/dashboard` | unauthorised | AC 39, AC 40 |
| screen `/dashboard` | density and ordering | AC 12, AC 22 |
| screen `/login` | error state | existing - as mensagens de `login-form.tsx` não mudam (AC 47) |
| shell (todas as telas com sessão) | ordering do menu por perfil | AC 4, AC 6, AC 7 |
| shell | destructive action confirms | existing - "Sair" não pede confirmação hoje e continua assim |
| telas internas | empty, loading, error, unauthorised | existing - cada tela mantém os estados que tem (AC 47) |
| API `GET /api/dashboard` | response shape | AC 24, AC 25, AC 26 |
| API `GET /api/dashboard` | error shape and codes | AC 28 |
| API `GET /api/dashboard` | who may call it | AC 27 - o corte por perfil existente |
| API `GET /api/dashboard` | versioning, rate limit | n/a - consumido só pelo web do mesmo deploy; sem limite hoje e nada muda |
| landing (documento lido) | o que o visitante faz em seguida | AC 30 - telefone/WhatsApp; AC 31 - equipe entra |

## Sources

- As duas imagens enviadas pelo usuário em 2026-10-19 (o mockup de três telas e a prancha com as telas do app de treino) - **binding** para disposição, tamanhos, raios e componentes; a paleta já está fixada na AD-090.
- O pedido do usuário em 2026-10-19: nome DukFit, visual da referência no celular, responsivo no computador, de-para dos componentes e landing em `/`.
- `.specs/STATE.md` AD-090, AD-091, AD-022 e AD-084 - o tema, a fonte, o acesso negado por padrão e o CSP que a feature respeita.
