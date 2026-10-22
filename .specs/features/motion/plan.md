# Motion

## Problem

A `dukfit-app` entregou a shell, as telas e os componentes da referência, mas o app não tem
movimento em lugar nenhum. A única transição declarada no repositório é um `transition-colors` em
`packages/ui/src/components/button.tsx:7`; não existe `template.tsx`, `loading.tsx` nem uma regra
`prefers-reduced-motion`. Cada navegação troca o HTML inteiro sem transição, o que o servidor está
buscando entre o clique e a tela nova não tem representação visual, e uma ação como registrar
presença, confirmar um pagamento ou abrir o menu "Mais" termina sem sinal visual de que foi
aceita. No celular o botão não responde ao toque e a troca de tela parece um recarregamento de
site, não a troca de tela de um app. O sistema é usado no balcão, em pé, com uma mão; o
computador é a recepção.

O dono do produto pediu, em 2026-10-21, um sistema de animações para carregamentos, transição de
página, ações e afins, pensado para celular e responsivo no computador. A fonte não traz número
de uso, prazo, referência visual nem lista de telas.

Na landing `/`, redesenhada pela AD-098, o menu de seções só existe no topo do hero: a partir do
primeiro rolar ele some, e quem está em "Planos" ou "Onde estamos" volta ao topo para trocar de
seção. Abaixo de 1024 px o menu nem é renderizado (`hidden lg:flex` em `apps/web/src/app/page.tsx`):
no celular, onde chega a maior parte de quem procura academia de bairro, não há como pular para
uma seção. O dono do produto pediu, também em 2026-10-21, que o menu do site fique flutuante,
acessível de qualquer parte da página, e que o celular tenha um menu de acesso fácil, como parte
desta feature.

Quando isto entrar: navegar entre telas internas tem entrada de 200 ms do conteúdo, sem piscar a
shell; uma navegação que espera dados mostra um esqueleto com a geometria da shell; o toque no
botão e o estado pendente têm resposta visual; diálogos, avisos e listas entram com movimento
curto; na landing o cabeçalho flutua sobre a página inteira e, no celular, um botão de menu abre
as seções em tela cheia; e com `prefers-reduced-motion: reduce` nada disso se move.

## Flow

Reusa os tokens da AD-098, a `Shell` e os componentes de `packages/ui` da `dukfit-app`, o
`Dialog` do Radix, o `SITE` da landing (AD-095) e a estrutura de server components do App Router;
nenhuma cor, fonte, permissão, contrato ou dado novo.

1. `apps/web/src/app/layout.tsx` (exists) envolve a árvore em `MotionProvider`
   (`packages/ui/src/motion.tsx`, new, door 1), que fixa `MotionConfig reducedMotion="user"` e os
   tokens de movimento.
2. `apps/web/src/components/shell.tsx` (exists) passa a renderizar o `<main>` por
   `PageTransition` (new, door 2): a navegação entre telas internas entra com opacidade 0→1 e
   deslocamento 8 px → 0 (12 px a partir de 1024 px) em 200 ms, e a shell não anima.
3. `apps/web/src/app/<segmento>/loading.tsx` (new, door 3) monta `AppLoading` (new, door 3) de
   `apps/web/src/components/app-loading.tsx`, o esqueleto com a geometria da shell, enquanto o
   server component busca os dados.
4. telas internas (exist) aplicam `Reveal` de `@academia/ui` (new, door 4) aos cartões do painel, pelo
   `index` do `Panel`, e `StaggerCell` (a célula `td` de um `StaggerItem`) às linhas das listas de
   alunos, planos, pagamentos, funcionários e presenças: a linha `tr` fica parada e o conteúdo dela
   entra. O que veio no documento do servidor chega parado; só o que monta no navegador entra
   (`useEntrance`, em `packages/ui/src/motion.tsx`).
5. `packages/ui/src/globals.css` (exists) e os componentes `Button`, `Dialog` e `Alert` (exist)
   recebem os estados de toque, abertura e feedback pelo CSS do tema (door 5).
6. `/` -> `apps/web/src/app/page.tsx` (exists) deixa de montar o `<header>` dentro do hero e
   monta `SiteHeader` (`apps/web/src/components/landing/site-header.tsx`, new, door 7) antes do
   `<main>`: fixo no topo, com logo, seções de `SITE.nav` e o CTA da sessão; abaixo de 1024 px,
   logo, CTA e o botão "Abrir menu", que abre `SiteMenu` (mesmo arquivo), um `Dialog` em tela
   cheia com as seções em cascata (`Stagger`, door 4). O texto vem de `SITE.menu` (AD-095).
7. out: o mesmo HTML de cada tela interna; na landing, o cabeçalho sai do hero e vira o `banner`
   da página; nenhum endpoint, schema, migração ou permissão muda.

## Impact

| Front | What changes |
| --- | --- |
| domain | novo termo: `movimento reduzido` - o app desliga deslocamento e loops quando o sistema pede; vive em `packages/ui/src/motion.tsx` e no CSS do tema |
| domain | novo termo: `conteúdo de página` - o que fica dentro do `<main>` da shell e é o único que anima na navegação; cabeçalho, abas e barra lateral não animam |
| dependências | `motion@14.5.0` no catálogo do pnpm, declarado em `packages/ui` e `apps/web` (door 1); `pnpm-lock.yaml` muda; nenhum outro manifesto muda de dependência |
| testes | `tests/repo/identidade.test.ts`: o guard `dukfit_adds_no_npm_dependency` (AC 50 da `dukfit-app`) compara todo manifesto com `de214e2` e passa a falhar por desenho; é substituído pelo guard da door 6. Os e2e existentes (`csp`, `print`, `shell`) continuam sem edição, exceto esperas novas da transição. Na landing (door 7) três provas mudam por desenho e são registradas no `checks.md`: `landing.spec.ts` › `hero_shows_logo_nav_eyebrow_two_line_title_intro_and_proof` (logo e navegação saem da região do hero para o `banner`), `dukfit.spec.ts` › `landing_has_no_shell_no_external_request_and_no_csp_violation` (a landing passa a ter um `banner` e a navegação "Seções" visível em todo tamanho) e `tests/repo/identidade.test.ts` › `site_content_has_the_door_five_shape` (chave nova `menu`) |
| telas | as 21 telas com shell ganham transição do conteúdo; 11 `loading.tsx`, um por segmento de topo, cobrem as 21; `/`, `/login`, `/login/two-factor` e `/two-factor/setup` não têm transição de página nem skeleton |
| landing `/` | o cabeçalho sai de dentro do hero e vira um `<header>` fixo antes do `<main>` (door 7); as seções ganham `scroll-margin-top` igual à altura do cabeçalho; no celular entra o botão "Abrir menu" e o menu em tela cheia; o conteúdo das seções não muda nem anima (Out of scope) |
| `site-content.ts` (AD-095, AD-098) | entra `SITE.menu = { open: 'Abrir menu', close: 'Fechar menu', title: 'Menu' }`; `SITE.nav` e `SITE.labels.nav` continuam a fonte dos links e do nome da navegação |
| impressão | `apps/web/src/app/students/[id]/print/page.tsx` e `apps/web/src/app/staff/[id]/print/page.tsx` não montam `PageTransition` e não recebem animação |
| contrato da API | nothing - nenhuma rota, schema, resposta ou status muda |
| stored data | nothing - nenhuma migração, coluna ou dado novo |
| diálogos | `DialogContent` devolve o foco a quem o tinha ao abrir: os diálogos do app abrem por estado, sem `DialogTrigger`, e o Radix só devolve o foco a um `DialogTrigger` (antes o foco caía no `body`; AC 23 e AC 49) |
| e2e existentes | com o `loading.tsx`, o conteúdo do segmento chega por streaming e hidrata um instante depois do `load`: três provas que preenchem um formulário logo após o `goto` (`staff.spec.ts` › `new_form_omits_empty_optionals_and_edit_form_sends_null_for_cleared`, `students.spec.ts` › `guardian_block_shown_only_for_minor_on_both_forms` e `guardian_422_shown_on_each_field_keeps_the_rest`) ganham a espera `formHydrated`; os contadores de id das fixtures ganham leitura e reposição para a C39 |
| acessibilidade | `aria-busy` entra nos carregamentos e nos controles pendentes; `role="alert"` e `role="status"` continuam sendo o sinal que o leitor de tela anuncia, e a animação é decoração |

## Relations

None - no stored-data shape change.

## Surface

None - nothing consumed outside: as rotas mantêm caminho, entrada e saída, e um `loading.tsx` não
acrescenta rota.

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. Dependência e configuração de movimento | `pnpm-workspace.yaml` com `motion: ^14.5.0` no `catalog`; `packages/ui/package.json` e `apps/web/package.json` com `"motion": "catalog:"`; import só de `motion/react` (ou `motion/react-client` quando não há `AnimatePresence`); `packages/ui/src/motion.tsx` exporta `MOTION = { micro: 0.15, base: 0.2, long: 0.3, ease: [0.2, 0.8, 0.2, 1], distance: 8, distanceDesktop: 12, stagger: 0.04, staggerMax: 8 }` e `MotionProvider`, que renderiza `<MotionConfig reducedMotion="user" transition={{ duration: MOTION.base, ease: MOTION.ease }}>` | `framer-motion` - nome antigo do mesmo pacote, e a documentação atual publica `motion` com a entrada `motion/react`; só CSS - não cobre presença, cascata e estado React sem reescrever cada caso; GSAP - licença e bundle para microinterações; animar sem provider - cada componente repete a configuração e nenhum desliga o movimento reduzido de uma vez |
| 2. Transição de página no `<main>` da shell, só de entrada | `apps/web/src/components/page-transition.tsx` com `'use client'` e `motion.main` recebendo o `className` do `<main>`; `initial` é `false` na primeira montagem do bundle e `{ opacity: 0, y: 8 }` (ou `y: 12` a partir de 1024 px) nas seguintes; `animate={{ opacity: 1, y: 0 }}` com `transition={{ duration: reduce ? 0 : 0.2, ease: MOTION.ease }}`; `pathname.endsWith('/print')` devolve `children` sem `motion`; `Shell` troca o `<main>` por esse componente | `app/template.tsx` - anima a shell inteira, e no desktop a barra lateral fixa desliza a cada clique; `AnimatePresence` com saída - atrasa a navegação, mantém a tela antiga no DOM e briga com scroll e foco; `ViewTransition`/`AnimateView` - a integração do App Router do Next 16.3 não ativa enter/exit de classe em navegação client-side (react#37614), e trocar depois é refazer a mecânica de todas as telas; mover as 21 telas para um route group - resolve a shell fixa, mas é um diff de 21 arquivos e imports fora do escopo desta feature |
| 3. Esqueleto de carregamento em `loading.tsx` por segmento | `packages/ui/src/components/skeleton.tsx` exporta `Skeleton` (`aria-hidden`, `data-slot="skeleton"`, `@keyframes skeleton-pulse` de 1,4 s entre opacidade 0,35 e 0,7) e `PageSkeleton` (`role="status"`, `aria-busy="true"`, `data-slot="page-skeleton"`, `<span className="sr-only">Carregando…</span>`); `apps/web/src/components/app-loading.tsx` repete a geometria da shell (avatar de 44 px, coluna de 256 px a partir de 1024 px, barra inferior abaixo de 1024 px, título de 30 px (AD-098) e 4 blocos de 96 px) e é o default export dos 11 `loading.tsx`: `dashboard`, `students`, `staff`, `plans`, `payments`, `check-in`, `check-ins`, `audit`, `users`, `privacy`, `account` | spinner central - não preserva a geometria e o conteúdo salta na chegada; esqueleto sem a shell - a estrutura pisca a cada navegação; `loading.tsx` na raiz - apareceria também em `/`, `/login` e na 2FA; esqueleto com Motion - o loop CSS não precisa de JS e aparece antes da hidratação |
| 4. Entrada de listas e cartões com um componente só | `packages/ui/src/motion.tsx` exporta `Reveal` (`motion.div`, variantes `hidden { opacity: 0, y: 8 }` → `shown { opacity: 1, y: 0 }`, 0,22 s) e `Stagger`/`StaggerItem` (`staggerChildren: 0.04`, `delayChildren: 0`, item a partir do 9º com atraso 0,28 s); a distância sai de `matchMedia('(min-width: 1024px)')`; usados nos cartões do painel e nas listas de alunos, planos, pagamentos, funcionários e presenças; `Table` não é animada | `layout` em cada item - mede o layout de toda linha e reflui a tabela; animar todo `TableRow` - custo por linha em listas longas, sem ganho de leitura; variant copiada por tela - 20 cópias da mesma configuração, que divergem na primeira mudança |
| 5. Duas camadas: Motion para o movimento orquestrado e CSS do tema para microestados | em `packages/ui/src/globals.css`: `.pressable { transition: transform 150ms var(--motion-ease), background-color 150ms var(--motion-ease); }`, `.pressable:active { transform: scale(0.98); }`, `[data-slot='dialog-overlay'][data-state='open'] { animation: overlay-in 150ms var(--motion-ease); }`, `[data-slot='dialog-content'][data-state='open'] { animation: dialog-in 200ms var(--motion-ease); }`, `[role='alert'], [data-motion='feedback'] { animation: feedback-in 180ms var(--motion-ease); }`, os `@keyframes` correspondentes e um bloco `@media (prefers-reduced-motion: reduce)` que zera animação, transição e `transform`; `Button` ganha `busy` (spinner de 16 px `aria-hidden` e `aria-busy="true"`); `Dialog` e `Alert` mantêm a API | tudo com Motion - CSS já cobre `:active` e o `data-state` do Radix e respeita `prefers-reduced-motion` sem JS; Motion nesses pontos paga hidratação por 150 ms; `AnimatePresence` + `forceMount` no Dialog - mantém o conteúdo montado quando fechado, muda foco, trap e os testes que contam diálogos; animação de saída do diálogo - nenhum ganho, e o Radix desmonta na hora |
| 6. Guard de dependência do repositório | em `tests/repo/identidade.test.ts`, sai `dukfit_adds_no_npm_dependency` e entra `motion_is_the_only_added_dependency`: lê `git ls-files '*package.json'`, exige que exatamente `apps/web/package.json` e `packages/ui/package.json` declarem `motion`, que `pnpm-workspace.yaml` traga `motion: ^14.5.0` no catálogo e que `pnpm-lock.yaml` contenha `motion@14.5.0`; `DUKFIT_BASE` sai do arquivo | manter o guard e não instalar nada - contraria o pedido, e a AC 50 da `dukfit-app` deixa de valer por desenho; rebasear `DUKFIT_BASE` para o commit desta feature - vira um teste que sempre passa, porque compara um manifesto consigo mesmo; allowlist global de dependências - mais configuração que a asserção de dois caminhos |
| 7. Cabeçalho flutuante e menu de celular da landing | `apps/web/src/components/landing/site-header.tsx` com `'use client'` exporta `SiteHeader({ session })`: um `<header data-slot="site-header">` fixo (`position: fixed; top: 12px`, `inset-x` de 16 px, 32 px a partir de 1024 px, `z-index: 40`, altura de 64 px), irmão anterior do `<main>`; transparente enquanto `window.scrollY < 24` e, depois, `background-color: rgb(0 0 0 / 0.72)`, `backdrop-filter: blur(12px)` e borda `rgb(255 255 255 / 0.1)`, com `transition: background-color 200ms, border-color 200ms` (CSS, door 5), marcado por `data-scrolled`; a partir de 1024 px mostra logo, `<nav aria-label={SITE.labels.nav}>` com `SITE.nav` e o CTA da sessão, e o link da seção que está na viewport ganha `aria-current="location"` (um `IntersectionObserver` sobre as seções de `SITE.nav`); abaixo de 1024 px mostra logo, CTA e um `<button aria-label={SITE.menu.open} aria-expanded aria-controls="site-menu">` de 44 px que abre `SiteMenu`: `Dialog` do Radix (door 5, sem saída animada) em tela cheia, `id="site-menu"`, título `SITE.menu.title` só para leitor de tela, botão `SITE.menu.close`, os links de `SITE.nav` em 36 px maiúsculos com `Stagger` (door 4), o CTA "Quero treinar", o CTA da sessão e o Instagram; clicar num link fecha o menu e rola até a âncora; as seções de `page.tsx` ganham `scroll-mt-24` | `position: sticky` dentro do hero - o hero é o pai e o cabeçalho sai junto com ele; esconder ao rolar para baixo e mostrar ao rolar para cima - o pedido é acesso de qualquer ponto, e o cabeçalho sumido exige gesto extra no celular; menu em `<details>` ou lista que empurra a página - sem foco preso nem Esc, e empurra o conteúdo para baixo do hero; gaveta lateral - no celular de uma mão o polegar alcança melhor a lista em tela cheia e os links grandes; navegação inferior fixa na landing - repete a barra do app interno num site público e cobre os CTAs dos planos |

- Nothing else in this change is hard to reverse

## Criteria

### S1: Fundação de movimento e dependência (P1)

O app tem a biblioteca, o provider, os tokens e o guard de dependência que as fatias seguintes usam.

**Acceptance Criteria**

1. The system SHALL declare `motion@14.5.0` in the pnpm catalog and as `"catalog:"` in exactly `packages/ui/package.json` and `apps/web/package.json`, and in no other manifest.
2. WHEN the root layout renders THEN `MotionProvider` SHALL wrap the tree and set `MotionConfig reducedMotion="user"`, without rendering a DOM element of its own.
3. The system SHALL expose a single `MOTION` object with `micro: 0.15`, `base: 0.2`, `long: 0.3`, `ease: [0.2, 0.8, 0.2, 1]`, `distance: 8`, `distanceDesktop: 12`, `stagger: 0.04` and `staggerMax: 8`, and every animation SHALL read its duration, easing and distance from it.
4. The system SHALL import the library only from `motion/react` or `motion/react-client`, and SHALL NOT import `framer-motion` anywhere in `apps/web/src` or `packages/ui/src`.
5. WHEN `tests/repo/identidade.test.ts` runs THEN `motion_is_the_only_added_dependency` SHALL pass and `dukfit_adds_no_npm_dependency` SHALL no longer exist.

**Independent test:** `pnpm --filter ./tests/repo exec vitest run identidade.test.ts` e `pnpm --filter @academia/web exec next build`.

### S2: Transição de página (P1)

Navegar entre telas internas tem entrada curta do conteúdo, e a shell não pisca.

**Acceptance Criteria**

6. WHEN a user activates an internal navigation link THEN the destination `<main>` SHALL render with `data-motion="page"` and animate opacity 0→1 and translateY 8px→0 in 200 ms.
7. WHILE the viewport is 1024 px or wider the page transition SHALL use translateY 12px→0, and below 1024 px SHALL use 8px→0.
8. WHILE the first document of a browser session renders the content SHALL be visible without the transition: the `<main>` SHALL NOT be server-rendered with `opacity: 0`, and no page animation SHALL run.
9. WHEN the destination path ends in `/print` THEN the page SHALL render without a `[data-motion="page"]` element and no page animation SHALL run.
10. WHILE `prefers-reduced-motion: reduce` the `<main>` SHALL render with `transform: none` and a transition duration of 0.
11. The page transition SHALL animate only `opacity` and `transform`, and SHALL NOT set `pointer-events: none` on the `<main>`.
12. The page transition SHALL NOT change DOM order, visible copy or accessible names, and every internal route SHALL have exactly one `[data-motion="page"]` element.

**Independent test:** abrir `/dashboard` e acionar o link "Alunos" em 390×844 e em 1440×900, medindo `getAnimations()` no `<main>` novo.

### S3: Carregamento (P1)

Uma navegação que espera dados mostra a geometria da tela, não uma tela em branco.

**Acceptance Criteria**

13. WHEN a navigation to an internal segment is pending THEN the segment SHALL show `[data-slot="page-skeleton"]` with `role="status"`, `aria-busy="true"` and the accessible text "Carregando…".
14. The 11 top-level segments `dashboard`, `students`, `staff`, `plans`, `payments`, `check-in`, `check-ins`, `audit`, `users`, `privacy` and `account` SHALL each have a `loading.tsx` whose default export is `AppLoading`.
15. The skeleton SHALL repeat the shell geometry with `data-slot="skeleton-shell"`, `data-slot="skeleton-title"` and 4 `data-slot="skeleton-panel"` blocks, within the same max-width and padding as the real page.
16. The skeleton blocks SHALL be `aria-hidden="true"`, and their shimmer SHALL be a 1.4 s CSS animation that `prefers-reduced-motion: reduce` renders static at opacity 0.5.
17. IF a route fails to load THEN the existing `*-load-error` SHALL keep its visible text and its `role="alert"` element SHALL animate in 180 ms.
18. The system SHALL NOT add a `loading.tsx` skeleton to `/`, `/login`, `/login/two-factor` or `/two-factor/setup`.

**Independent test:** com a API falsa em `hang`, abrir `/dashboard` e clicar em "Alunos"; conferir o skeleton, o `aria-busy` e o texto para leitor de tela.

### S4: Ações (P1)

Toque, espera, abertura de diálogo e resultado de uma ação têm resposta visual sem atrasar a tarefa.

**Acceptance Criteria**

19. WHEN a `Button` is pressed THEN it SHALL scale to 0.98 over 150 ms, and with reduced motion the scale SHALL be removed.
20. WHEN a `Button` receives `busy` THEN it SHALL render `aria-busy="true"`, a 16 px `aria-hidden` spinner and SHALL stay disabled.
21. The system SHALL use `busy={pending}` instead of `disabled={pending}` on every control that already keeps a `pending` state, and no `disabled={pending}` SHALL remain in `apps/web/src`.
22. WHEN a `Dialog` opens THEN the overlay SHALL fade 0→1 in 150 ms and the content SHALL fade and scale 0.98→1 in 200 ms.
23. WHEN a `Dialog` closes THEN it SHALL unmount immediately, with no exit animation, and focus SHALL return to the trigger as today.
24. WHEN an action succeeds and renders a message THEN that message SHALL carry `data-motion="feedback"` and animate in 180 ms.
25. IF an action fails THEN the `[role="alert"]` element SHALL animate in 180 ms and SHALL keep its role and text.
26. The action animations SHALL animate only `opacity`, `transform` and `background-color`, and SHALL NOT animate `top`, `left`, `width`, `height` or `margin`.

**Independent test:** registrar uma presença em `/check-in`, abrir o diálogo de inativação em `/students/[id]` e conferir toque, spinner, abertura e mensagem de sucesso com `prefers-reduced-motion` ligado e desligado.

### S5: Entrada de conteúdo (P2)

Cartões e listas entram em cascata curta, sem reordenar nem atrasar a leitura.

**Acceptance Criteria**

27. WHEN the dashboard renders THEN its cards SHALL enter with `Reveal` and the index of each card SHALL add 40 ms of delay, up to the 8th card.
28. WHEN the students, plans, payments, staff or check-ins list renders THEN its rows SHALL use `StaggerItem` with a 40 ms stagger and at most 8 animated items, and items from the 9th SHALL render with a delay of at most 280 ms.
29. WHILE `prefers-reduced-motion: reduce` list items SHALL render at opacity 1 with no transform and no delay.
30. The entrance SHALL NOT reorder items, change `aria-*` names or wrap a `TableRow` in a motion element.
31. WHEN a search or filter replaces the list THEN the replacement rows SHALL animate once, and a re-render that keeps the same rows SHALL NOT restart the animation.
32. The entrance animation SHALL NOT run on `/students/[id]/print` or `/staff/[id]/print`.
33. The system SHALL keep the table's horizontal scroll container inside the panel and SHALL NOT widen the page at 360 px.

**Independent test:** abrir `/dashboard`, `/students` e `/plans` em 390×844 com 12 itens e conferir a cascata e o corte no 8º.

### S6: Movimento reduzido, responsividade e portão (P1)

A promessa de acessibilidade, os dois breakpoints e o portão de qualidade valem para todas as fatias.

**Acceptance Criteria**

34. WHILE `prefers-reduced-motion: reduce` every page transition, shimmer, dialog, feedback and list animation SHALL be disabled in CSS and in Motion, and no `document.getAnimations()` SHALL remain on `[data-motion="page"]`, `[data-slot="page-skeleton"]` or `[role="alert"]` after the screen settles.
35. The system SHALL NOT produce horizontal scroll at 360 px or at 1440 px on `/`, `/dashboard`, `/students` and `/staff`.
36. The system SHALL keep `apps/web/e2e/csp.spec.ts` with zero `securitypolicyviolation` and keep the two print e2e green.
37. The system SHALL keep `pnpm verify` at exit 0 with the replaced dependency guard and the new e2e.
38. The system SHALL NOT change any API route, response body, schema, migration or permission.
39. The system SHALL keep the visible copy, link destinations, labels and focus order of every screen unchanged, except the landing header and menu that S7 adds.
40. WHEN the user has `prefers-reduced-motion: no-preference` THEN the page transition SHALL run at 200 ms and the skeleton shimmer at 1.4 s.

**Independent test:** repetir o roteiro de S2 a S5 e S7 com `page.emulateMedia({ reducedMotion: 'reduce' })` e conferir zero animações, zero rolagem horizontal e `pnpm verify` verde.

### S7: Menu flutuante da landing e menu do celular (P1)

Em qualquer ponto da landing o visitante troca de seção ou chega ao CTA sem voltar ao topo; no
celular, um botão abre as seções em tela cheia.

**Acceptance Criteria**

41. WHILE `/` is scrolled to any position the system SHALL keep `[data-slot="site-header"]` visible within the top 88 px of the viewport, at 360, 390, 768, 1024 and 1440 px wide.
42. The landing header SHALL be a `<header>` that is a sibling before `<main>`, exposed as the page's only `banner`, and SHALL NOT render inside the hero region.
43. WHILE `window.scrollY` is below 24 px the header SHALL have a transparent background, and WHEN the page scrolls past 24 px THEN it SHALL set `data-scrolled` and transition to `rgb(0 0 0 / 0.72)` with a 12 px backdrop blur in 200 ms.
44. WHILE the viewport is 1024 px or wider the header SHALL show the logo, the navigation named `SITE.labels.nav` with the 5 links of `SITE.nav` in order, and the session CTA ("Acesso da equipe" without session, "Ir para o painel" with session), and SHALL NOT show the menu button.
45. WHILE the viewport is below 1024 px the header SHALL show the logo, the session CTA and a 44 px button named "Abrir menu" with `aria-expanded="false"` and `aria-controls="site-menu"`, and the desktop navigation SHALL be hidden.
46. WHEN the user activates "Abrir menu" THEN a full-screen dialog `#site-menu` named "Menu" SHALL open with focus inside it, `aria-expanded="true"` on the trigger, the 5 links of `SITE.nav` at 36 px uppercase, the "Quero treinar" link, the session CTA and the Instagram link.
47. WHEN the menu opens THEN the overlay SHALL fade in 150 ms, the panel SHALL fade in 200 ms and the links SHALL enter with a 40 ms stagger, and WHILE `prefers-reduced-motion: reduce` none of them SHALL animate.
48. WHEN the user activates a section link in the menu THEN the menu SHALL close and the page SHALL scroll so that the section's eyebrow is visible below the header, not covered by it.
49. WHEN the user presses Escape or activates "Fechar menu" THEN the menu SHALL close immediately and focus SHALL return to "Abrir menu".
50. WHEN the user activates a desktop navigation link THEN the target section's top SHALL stop at or below the header's bottom edge.
51. WHILE a section of `SITE.nav` occupies the viewport the matching desktop link SHALL carry `aria-current="location"`, and no other link SHALL carry it.
52. The header and the menu SHALL read every visible text and accessible name from `SITE` (AD-095), and `SITE.menu` SHALL be `{ open: 'Abrir menu', close: 'Fechar menu', title: 'Menu' }`.
53. The header SHALL NOT produce horizontal scroll at 360 px and SHALL NOT cover the hero title at 390×844 and 1440×900 on first paint.
54. The landing SHALL keep zero `securitypolicyviolation`, zero requests to another origin and no `loading.tsx` or page transition on `/` (AC 18).

**Independent test:** em 390×844, rolar `/` até "Planos", tocar "Abrir menu", escolher "Onde estamos", conferir o fechamento, o rótulo visível abaixo do cabeçalho e o foco; em 1440×900, rolar até "Nossa estrutura" e conferir o `aria-current` e o cabeçalho com fundo.

## Out of scope

| Excluded | Why |
| --- | --- |
| Entrada animada das seções da landing pública `/` | conteúdo público precisa estar visível no HTML antes da hidratação; `whileInView` esconde o texto até o JS rodar e piora o LCP; só o cabeçalho e o menu (S7) se movem na landing |
| Esconder o cabeçalho da landing ao rolar para baixo | o pedido é o menu acessível de qualquer ponto da página (door 7) |
| Navegação inferior fixa na landing | repete a barra do app interno num site público e cobre os CTAs dos planos (door 7) |
| Animação de saída de página | atrasa a navegação e mantém a tela antiga no DOM, sem ganho sobre a entrada |
| View Transitions API, shared element e morph | não há `startViewTransition` estável no App Router 16.3 para enter/exit de classe; trocar de mecanismo depois custaria todas as telas |
| Contagem animada de números, gráficos animados, parallax e scroll-linked | dado de gestão precisa ser lido no instante em que aparece; a animação atrasa a leitura e a prova fica frágil |
| Animar a shell (cabeçalho, abas, barra lateral) na navegação | exigiria mover as 21 telas para um layout de route group; a transição do conteúdo entrega o mesmo efeito percebido |
| Haptics e som | sem API confiável no navegador e fora do escopo do web |
| Transição de página e skeleton em `/`, `/login`, 2FA | telas sem shell, e a navegação para elas é carregamento de documento |
| `AnimatePresence` para item que sai de lista | nenhuma tela remove item de lista sem recarregar; entra quando houver uma |
| Preferência de movimento por usuário dentro do app | o sistema operacional já a expressa; um controle novo no app é configuração nova |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Intensidade do movimento | curto e discreto: 120–240 ms, 8–12 px, sem mola nem bounce | app de balcão usado o dia inteiro; bounce e atraso competem com a tarefa | n |
| Primeira pintura | transição só a partir da segunda navegação do bundle; o primeiro documento entra visível | `opacity: 0` no SSR deixaria a tela vazia se o JS falhasse e adiaria o LCP | n |
| Shell por página | a shell é montada por página; o conteúdo anima e a shell é substituída por uma idêntica | mover a shell para um layout de route group é um refactor de 21 telas, registrado na door 2 | n |
| Durações | tween fixo, sem spring | spring por componente é mais um parâmetro para revisar e provar; o tween cobre o caso | n |
| Esqueleto | geometria da shell, sem dados e sem interação | mantém a estrutura estável durante a espera; um spinner simples faz o conteúdo saltar | n |
| Listas | 8 itens animados, o resto estático | listas de balcão passam de 20 linhas; animar tudo custa JS e não melhora a leitura | n |
| Tema | tokens atuais da AD-098, sem cor nova | AD-098 (que substitui a AD-090) fixa a paleta e toda tela herda os tokens | y |
| Base do Build | o redesenho da AD-098 entra num commit antes do Build desta feature | o plano descreve `page.tsx`, `site-content.ts` e os testes na forma da AD-098, ainda não commitada em 2026-10-21 | n |
| Cabeçalho da landing | sempre visível, fundo só depois de 24 px de rolagem | pedido do usuário: menu flutuante acessível de qualquer parte da página | y |
| Menu do celular | tela cheia com links grandes, aberto por botão no cabeçalho | pedido do usuário: menu de fácil acesso no celular; o polegar alcança a lista inteira | n |
| Seção ativa no menu do computador | `aria-current="location"` pela seção na viewport | ajuda a se localizar numa página longa; custa um observer, sem texto novo | n |
| Guard de dependência | substituir `dukfit_adds_no_npm_dependency` pelo da door 6 | a AC 50 da `dukfit-app` fixava "nenhum pacote npm" para aquela feature; esta feature existe para instalar um | n |

**Open questions:**

| Question | Blocks | Default if unanswered |
| --- | --- | --- |
| Os preços reais dos planos da landing: a trava `EXEMPLO` de `tests/repo/identidade.test.ts` › `site_content_is_the_only_source_of_landing_copy` fica vermelha enquanto `SITE.plans` tiver os valores de exemplo da AD-098 | verify (AC 37 pede `pnpm verify` com exit 0) | o Build segue; o Verifier só roda depois de os valores reais entrarem ou de a academia escolher "Consulte na recepção" |

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen todas as telas com shell (21) | loading | AC 13, AC 14, AC 15, AC 16 |
| screen todas as telas com shell (21) | empty state | existing - cada tela mantém o texto vazio que já tem; a entrada não muda o conteúdo (AC 39) |
| screen todas as telas com shell (21) | error state | AC 17 |
| screen todas as telas com shell (21) | unauthorised | existing - proxy e 2FA continuam iguais (AC 38) |
| screen todas as telas com shell (21) | density and ordering | existing - ordem, espaçamento e cópia não mudam (AC 39) |
| screen todas as telas com shell (21) | destructive action confirms | existing - `status-actions`, `plan-status-actions` e `privacy-block` continuam pedindo confirmação em diálogo (AC 22, AC 23) |
| overlay diálogo e menu "Mais" | open and close | AC 22, AC 23 |
| screen `/`, `/login`, 2FA | loading and page transition | AC 18 - sem skeleton e sem transição |
| screen `/` cabeçalho | navegação em qualquer ponto da página | AC 41, AC 42, AC 43, AC 44, AC 50, AC 51, AC 53 |
| overlay menu do celular da landing | open and close | AC 45, AC 46, AC 47, AC 48, AC 49 |
| documento e copy da landing | rótulos do menu | AC 52 - `SITE.menu`, três rótulos novos |
| screen `/students/[id]/print` e `/staff/[id]/print` | animation | AC 9, AC 32 |
| API todas | response shape, error shape, versioning, rate limits | n/a - nenhuma rota muda (AC 38) |
| documento e copy | estrutura, tom, profundidade | n/a - nenhum texto novo, só o "Carregando…" do leitor de tela (AC 13) |
| coleção (listas do painel e das telas de lista) | grouping, naming, ordering | existing - a ordem vem da API e a entrada não reordena (AC 30) |

## Sources

- Pedido do usuário em 2026-10-21 (conversa): animações em carregamentos, transição de página, ações e afins, para celular com responsividade no desktop.
- Pedido do usuário em 2026-10-21 (conversa, depois do redesenho da AD-098): "quero que o menu do site seja flutuante para poder ser acessado de qualquer parte da página", e um menu de celular de fácil acesso, como próximo passo do projeto.
- Motion for React 14.5: `motion/react`, `MotionConfig reducedMotion="user"`, `useReducedMotion`, `AnimatePresence` e `motion/react-client` (motion.dev/docs).
- Next.js 16.3: `template.js` remonta na navegação e `loading.js` mostra o fallback por segmento (nextjs.org/docs/app/api-reference/file-conventions).
- `.specs/STATE.md` AD-090 (superseded), AD-091, AD-092, AD-094, AD-095, AD-098, AD-007 e AD-013; `apps/web/src/app/page.tsx` (o `<header>` dentro do hero e a navegação `hidden lg:flex`); `tests/repo/identidade.test.ts`; `packages/ui/src/globals.css`.
