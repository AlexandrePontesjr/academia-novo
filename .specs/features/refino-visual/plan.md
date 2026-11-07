# Refino visual

## Problem

A landing e as telas do sistema já têm tema próprio, mas a apresentação ficou no lugar em que o
primeiro esboço a deixou, e quem usa paga por isso todos os dias.

**Landing (`/`).** Ela foi publicada como cópia da referência de 2026-10-21 e nunca passou por um
crivo de desenho de página. O `h1` é o slogan "Treine Todo Dia" e não diz o que a academia é nem
onde fica; a página não declara que é um lugar (`<html>` sem `data-type` e sem as metas da skill);
toda foto tem legenda embaixo; a única interação com foto é um carrossel; o selo redondo gira sem
parar; o herói gasta a primeira tela com três avatares que são as próprias fotos da galeria
repetidas; e oito seções empilhadas com 96/144 px de intervalo deixam a página longa e monótona.
Não há resposta ao ponteiro em link, foto ou botão, não há entrada de herói, não há ação fixa no
celular, e a cena do salão aparece duas vezes (1600 px no herói e 800 px no fecho) enquanto as
outras ocupam cartões iguais. O visitante que chega de celular vê um cartão atrás do outro.

**Portal do aluno (`/minha-conta`).** É uma coluna de 768 px com três seções de título 18 px: foto,
dados de contato e uma tabela de períodos. A tabela não mostra valor nem data de pagamento (os dois
campos existem no contrato, `packages/contracts/src/payments.ts:44,51`), a situação é uma palavra
sem cor, e nada resume "quanto, quando e o que fazer agora". No celular a tabela rola para o lado.
O esqueleto de carregamento (`minha-conta/loading.tsx`) desenha a barra lateral e a barra inferior
da shell da equipe, que esta página não tem, então o conteúdo salta de layout na primeira visita.
E a porta do aluno está rotulada como porta da equipe: `/login` diz "Acesso da equipe"
(`apps/web/src/app/login/page.tsx:18-23`) e a navegação da mesma tela diz "Portal do aluno", mas
depois do login o proxy manda o aluno para `/minha-conta` (`apps/web/src/proxy.ts:38,53-54`).

**Telas da equipe (21 telas com shell).** A auditoria deste plano encontrou quatro escalas de
título convivendo (30 px de página, 20 px de `Panel`, 18 px de bloco de ficha e 16 px de seção de
funcionário); cartão dentro de cartão (o `PAGE_BODY` de 16 px de raio envolve a `Table`, também de
16 px, e come 40 px de largura em 360 px); situação como texto puro em aluno, funcionário, plano,
pagamento, interessado, usuário e 2FA — a única pílula do app é a do check-in, e ela ainda usa o
lime antigo `rgb(205 247 32)`; pelo menos 12 telas usam `<p>` cru como estado vazio; filtros em
quatro formatos diferentes; três paginações diferentes; valores e dinheiro alinhados à esquerda e
sem `tabular-nums`; linhas de 60 a 110 px por causa de botões `h-11` dentro de célula; e o vermelho
de erro `#f87171` repetido em 25 linhas de 13 arquivos, além de `#d4d4d4`, `#f59e0b` e `#404040`
fora dos tokens, o que já produziu a deriva
que a L-036 descreve (a paleta mudou na AD-098 e nem todos os componentes acompanharam). A borda de
campo e de cartão fica em 1,27:1 e 1,33:1 contra o fundo, abaixo dos 3:1 que a WCAG 1.4.11 pede
para o limite de um componente.

Quem paga: a recepção e o administrador, que leem essas telas o dia inteiro e comparam texto em vez
de reconhecer estado por cor; o aluno, que consulta o pagamento no celular e não entende o rótulo
da própria porta; e a academia, cuja imagem na vitrine não corresponde ao cuidado do sistema.

Quando isto entrar: as mesmas rotas, os mesmos dados, os mesmos textos de negócio e as mesmas
permissões, com um sistema visual só — tokens semânticos, uma escala de título, um estado de
situação, um estado vazio, uma tabela e uma lista — e uma landing que apresenta a DukFit como um
lugar: o que é, onde fica, como chegar e quanto custa, com as fotos reais em primeiro plano.

## Flow

Reusa o sistema de tokens e componentes de `packages/ui` (AD-023), os tokens de movimento da
`motion` (AD-099 a AD-104), o `SITE` da `dukfit-landing` (AD-095), as fotos estáticas da AD-096 e
os componentes que já existem (`Panel`, `Table`, `Gauge`, `WeekBars`, `PersonPhoto`, `Button`,
`Alert`, `Dialog`); nenhuma rota, payload ou schema muda.

1. Navegador pede `/` → `apps/web/src/app/page.tsx` (exists) lê `SITE` em
   `apps/web/src/app/site-content.ts` (exists, com a forma da door 2) e monta a landing na ordem da
   door 2; `apps/web/src/components/landing/*` (exists) recebem as composições e o movimento das
   doors 4, 5 e 6.
2. `packages/ui/src/globals.css` (exists) declara os tokens semânticos da door 1; `@academia/ui`
   (exists) exporta as peças da door 7 (`ScreenHeader`, `StatusBadge`, `EmptyState`, `ListOrTable`)
   e a `Table` ganha hover e alinhamento numérico.
3. Sessão de equipe → `apps/web/src/components/shell.tsx` (exists) mantém rail, cabeçalho, abas e
   FAB; cada `apps/web/src/app/**/page.tsx` (exists) compõe `ScreenHeader` + corpo e troca situação
   por `StatusBadge` e vazio por `EmptyState`.
4. `/minha-conta` → `apps/web/src/app/minha-conta/page.tsx` (exists) lê os mesmos
   `GET /api/me/profile` e `GET /api/me/payments`, agora em cartões de resumo + histórico; o
   `student` continua sem shell (AD-124).
5. `/login`, `/primeiro-acesso` e `/esqueci-senha` → `apps/web/src/app/**` (exists) mantêm
   `AuthFrame` e `PortalFrame` e trocam rótulo, `busy` e os desfechos pelos da S3.
6. out: o mesmo HTML semântico, com os mesmos papéis, textos de negócio e rotas, com CSS e
   composição novos; a impressão continua resetando os tokens para papel branco.

## Impact

| Front | What changes |
| --- | --- |
| domain | nenhum termo novo do produto. "Refino visual" é o nome da feature. Os rótulos de situação (`STATUS_LABELS`, `PAYMENT_STATUS_LABELS`, `PERIOD_LABELS`, `PORTAL_LABELS`, `ROLE_LABELS`) continuam sendo a fonte do texto dos badges e não mudam; o rótulo do login muda de "Acesso da equipe" para o da S3 |
| tokens | `packages/ui/src/globals.css` ganha os tokens de situação, de gráfico e de borda de controle da door 1; os valores da AD-098 não mudam. O vermelho de erro `#f87171` (25 linhas em 13 arquivos), `#d4d4d4`, `#f59e0b`, `#404040` e o lime antigo `rgb(205 247 32)` do check-in saem de `apps/web/src` e de `packages/ui/src/components` |
| `site-content.ts` (AD-095, AD-097) | a forma de `SITE` muda (door 2): entram `kind`, `hero.title`, `hero.subline`, `hero.cta`, `visit` e os títulos de `sections` na ordem nova; sai `tagline` como `h1`, saem `scroll`, os avatares do `proof` e `gallery` como carrossel. A regra "todo texto da landing vem daqui" continua |
| stored data | nothing - nenhum dado é lido, gravado ou migrado |
| contrato da API | nothing - nenhuma rota, schema, payload ou status muda |
| dependências | nenhuma. A única dependência acrescentada ao repositório continua sendo `motion` (AD-104) |
| ícones | nenhum pacote novo: os ícones de `packages/ui/src/icons.tsx` cobrem seta, relógio, check, pin, escudo e envelope (AD-094) |
| provas existentes | a composição nova, o rótulo do login e os textos novos do cabeçalho quebram provas aprovadas de outras features: `apps/web/e2e/landing.spec.ts` (18 testes), `dukfit.spec.ts` (herói, ordem das seções e o painel de cartão das telas internas), `landing-header.spec.ts` (CTA do cabeçalho no celular e links da navegação), `login.spec.ts`, `portal.spec.ts` (campos do histórico), `identidade.spec.ts` e `motion.spec.ts` (baseline C39 em `e2e/fixtures/motion-baseline/1440.json` e `390.json`), além de `tests/repo/identidade.test.ts` e `tests/repo/motion.test.ts`, que fixam tokens e blocos de CSS. A reescrita e a regravação do baseline estão na Open question 1 |
| impressão | `@media print` não muda; as duas rotas `/print` continuam claras e sem shell |
| CSP (AD-084) | nada muda. Nenhuma origem nova, nenhum estilo inline fora do nonce e nenhum script de terceiro |
| shell e navegação | as rotas, os links, as abas, o FAB e a ordem de foco de navegação não mudam; o que muda é o cabeçalho de conteúdo de cada tela |
| documentos | `README.md`, `.env.example`, `deploy/` e o runbook não mudam |

## Relations

None - no stored-data shape change.

## Surface

None - nothing consumed outside (nenhuma rota, payload ou status muda; a landing e as telas são
servidas pelas mesmas rotas e recebem os mesmos dados).

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. Tokens de situação, de gráfico e de borda de controle | em `:root` de `packages/ui/src/globals.css`: `--status-ok: var(--primary); --status-ok-surface: rgb(252 244 60 / 0.14); --status-warn: #f59e0b; --status-warn-surface: rgb(245 158 11 / 0.14); --status-bad: #f87171; --status-bad-surface: rgb(248 113 113 / 0.14); --status-idle: #a3a3a3; --status-idle-surface: #1a1a1a; --muted-strong: #d4d4d4; --chart-off: #404040; --border-control: #6b6b6b;` e, em `@theme inline`, `--color-status-ok`, `--color-status-ok-surface`, `--color-status-warn`, `--color-status-warn-surface`, `--color-status-bad`, `--color-status-bad-surface`, `--color-status-idle`, `--color-status-idle-surface`, `--color-muted-strong`, `--color-chart-off` e `--color-border-control` | manter os literais nos componentes: a L-036 já registrou a deriva depois da AD-098, e cada badge novo copiaria mais um hex; um `--success` verde: a identidade é um acento só (AD-098) e o check-in já usa o acento como "liberado"; mudar `--input` ou `--border` para #6b6b6b: a AD-098 fixa #2a2a2a e #262626 para cartão e campo, e o limite de componente é só dos controles |
| 2. Forma de `SITE` e ordem das seções | `SITE = { kind: 'place', name, legalName, logo, instagram, footer, rights, hours, address, neighborhood, routes, routeLabels, labels, menu, newsletter, closing, hero: { src, alt, width, height, title, subline, cta: { label: 'Quero treinar', href: '/matricula' } }, visit: { eyebrow, title, hoursLabel, routesLabel }, about: { eyebrow, title, listTitle, lead, text, highlight, proof, photo }, structure: { eyebrow, title, photos: [cardio, amanhecer], items: [{ title, text }] }, why: [{ title, text }], plans: { eyebrow, title, price, featuresLabel, items: [{ name, text, features, cta }] }, sections: { visit, about, structure, plans, closing } } as const`; a ordem literal é hero, `#visita`, `#academia` (com o bloco `why` dentro), `#estrutura`, `#planos`, `#fecho`, footer; a navegação tem quatro palavras na ordem `Academia (#academia)`, `Estrutura (#estrutura)`, `Planos (#planos)`, `Visita (#visita)` | manter a ordem atual (herói → sobre → modalidades → diferenciais → estrutura → planos → localização → fecho): endereço e horário só aparecem depois de seis seções e o visitante que quer ir à academia não os encontra; manter `tagline` como `h1`: o título não diz o que é nem onde, que é a primeira coisa que a skill exige de um lugar; manter `gallery` e `why` separados: são oito seções para quatro cenas reais |
| 3. Densidade da landing: quatro cenas, cada uma uma vez, sem legenda | herói `salao-cardio-1600.webp`; `#academia` `musculacao-440.webp` (composição `story`, 4:3); `#estrutura` `cardio-440.webp` + `amanhecer-440.webp` (composição `pair`, mesmo ratio, topos alinhados); `#fecho` na faixa do acento, sem foto; `logo-dukfit-96.webp` no cabeçalho e no rodapé; nenhuma foto tem `figcaption` nem legenda; os `alt` existentes continuam | a *short page* de 3 telas que a skill manda abaixo de 8 fotos: apagaria Sobre, Modalidades e Diferenciais, que são conteúdo aprovado da academia; a página longa de 12 a 20 fotos: não existem fotos e uma foto de outra academia seria falsa; manter o carrossel: a skill proíbe carrossel num lugar e ele esconde três das quatro cenas |
| 4. Linguagem de página de lugar na landing | fotos e faixas com raio 0; fundo plano, réguas de 1 px na borda do tema; sem cartão, sem `Panel` e sem sombra na landing; botão segue o pill do sistema; uma composição por seção diferente da vizinha (`story` na academia, `pair` na estrutura, linhas com régua nos planos, faixa no fecho) | manter os cartões de 16 px da AD-098 na landing: a skill trata a página de lugar como editorial (foto, régua e tipo), e manter cartões de recurso é exatamente o "SaaS furniture" que ela recusa; a landing e o app passam a ter linguagens distintas de propósito, compartilhando tokens, tipografia e movimento |
| 5. Barra de ação fixa no celular | abaixo de 1024 px o cabeçalho fica com logo e "Abrir menu" e o `SiteMenu` guarda o CTA da sessão; `<a data-slot="action-bar" href="/matricula">` fixo embaixo, altura 44 px, `padding-bottom: env(safe-area-inset-bottom)`, visível só quando o CTA do herói saiu da tela e nenhum CTA de seção está visível; escondido em `print` e a partir de 1024 px | nenhuma barra (hoje): a ação principal desaparece depois do herói no celular; FAB redondo como o do check-in: o app usa FAB para uma ação de operação, e a landing precisa do rótulo inteiro; manter o CTA da sessão no cabeçalho de celular: duas ações principais na mesma tela, contra a regra "uma ação principal por tela" |
| 6. Camada de movimento da landing | entrada do herói uma vez, opacidade 0→1 e y 12→0 em 300 ms com `MOTION.ease`; um momento `picture-develops` no par de `#estrutura` (escala 1.06→1 e recorte) na primeira entrada da seção, até 900 ms, uma vez; hover: foto linkada cresce 1.03 dentro da moldura e o cartão sobe 2 px, palavra da navegação desenha a régua, botão sobe 1 px e pressiona a 0.98; `prefers-reduced-motion` para tudo | `Reveal` em toda seção: é entrada de cartão do app, não de página, e a skill recusa fade de seção; carrossel com autoplay e selo girando: laço sem pausa e sem ação do usuário, proibidos num lugar; parallax no texto |
| 7. Peças de tela da equipe | `ScreenHeader({ eyebrow?, title, meta?, actions? })` com `h2` 30 px/500, eyebrow 14 px `--muted-foreground` com ponto de 8 px do acento, meta 14 px, ações à direita; `StatusBadge({ status, variant })` com a variante vinda de `--status-*` e o mapa literal `student: active→ok, inactive→idle, suspended→warn; enrollment: active→ok, scheduled→idle, expired→warn, cancelled→idle; payment: paid→ok, pending→warn, overdue→bad, cancelled→idle; check-in: allowed→ok, blocked→bad; staff: active→ok, inactive→idle; lead: new→warn, contacted→idle, converted→ok, discarded→idle; portal: active→ok, pending→warn, none e disabled→idle; user: active→ok, inactive→idle; plan: active→ok, inactive→idle`; `EmptyState({ icon, title, description?, action? })`; `ListOrTable({ head, rows })` com o `data-slot="panel-rows"` que o painel já usa | manter texto puro: a situação é o dado que a recepção lê primeiro e não se distingue do nome; um badge por tela: a mesma situação com duas cores em duas telas; tabela que rola no celular em toda tela: o painel já resolveu com `ListOrTable` e as outras listas podem copiar |

- Nothing else in this change is hard to reverse

## Criteria

### S1: Um sistema só de cor e de peças (P1)

O app inteiro passa a pintar situação, número e vazio pelos mesmos tokens e peças.

**Acceptance Criteria**

1. The system SHALL declare in `:root` of `packages/ui/src/globals.css` the tokens `--status-ok`, `--status-ok-surface`, `--status-warn`, `--status-warn-surface`, `--status-bad`, `--status-bad-surface`, `--status-idle`, `--status-idle-surface`, `--muted-strong`, `--chart-off` and `--border-control` with the literal values of door 1, and SHALL map each one in `@theme inline`.
2. The system SHALL keep the AD-098 values of `--background` (#000000), `--foreground` (#fafafa), `--card` (#0f0f0f), `--muted` (#1a1a1a), `--muted-foreground` (#a3a3a3), `--border` (#262626), `--input` (#2a2a2a), `--primary` (#fcf43c), `--ring` (#fcf43c), `--destructive` (#dc2626), `--destructive-foreground` (#fafafa) and `--radius` (1rem) unchanged.
3. WHEN `apps/web/src/**` and `packages/ui/src/components/**` are searched for a hex color `#rrggbb` or `#rgb` THEN the search SHALL find none outside `packages/ui/src/globals.css`.
4. WHEN a `StatusBadge` renders THEN it SHALL take the variant from the literal map of door 7 and its text color SHALL come from `--status-ok`, `--status-warn`, `--status-bad` or `--status-idle`, on the matching `--status-*-surface`.
5. The system SHALL keep the ratio of each status text over its surface at 4.5:1 or more, and of `--foreground` over `--background` at 7:1 or more.
6. WHEN `ScreenHeader` renders THEN it SHALL show the eyebrow (14 px, `--muted-foreground`, dot of 8 px of `--primary`), the title as `h2` at 30 px and weight 500, an optional meta at 14 px `--muted-foreground`, and the actions right-aligned; at 390 px the actions SHALL stack under the title; the header's left and right edges SHALL sit on the `main` gutter (16 px below 1024 px, 32 px from 1024 px).
7. WHEN `EmptyState` renders THEN it SHALL show a 24 px `aria-hidden` icon, a title at 16 px and weight 500, an optional description at 14 px `--muted-foreground` and an optional action, inside a `data-slot="empty-state"` element, and SHALL NOT be an `Alert`.
8. WHEN `ListOrTable` renders THEN below 768 px each record SHALL be a card with `rounded-xl`, `bg-muted` and `p-3`, and from 768 px the same records SHALL render as a `Table`; both SHALL show the same values in the same order.
9. WHEN a `Table` renders THEN the header SHALL be `--muted-strong` on `--muted` at 12 px uppercase, a body row SHALL change its background to `--muted` at 50% on hover, and a cell marked numeric SHALL be right-aligned with `font-variant-numeric: tabular-nums`.
10. WHEN a form is mid-submit THEN its submit SHALL use `Button busy` (spinner of 16 px, `aria-busy`, disabled) and no screen SHALL pass `disabled={isSubmitting}`.
11. WHEN an `Input`, a `Select` or an outline `Button` renders THEN its border SHALL use `--border-control` and SHALL reach 3:1 against `--card`.
12. The system SHALL keep `pnpm verify` at exit 0 and SHALL NOT add an npm dependency.

**Independent test:** abrir `/students` e `/check-in` num navegador e conferir os quatro estados com os valores computados; `grep` dos literais; medir o contraste da borda do campo.

### S2: A landing como um lugar (P1)

A landing apresenta a DukFit de Flores, Manaus, com tipo, foto e endereço no lugar de cartões.

**Acceptance Criteria**

13. WHEN `/` renders THEN `<html>` SHALL carry `data-type="place"` and the document SHALL carry `<meta name="page-type" content="place">`, `<meta name="site-kind" content="other">` and `<meta name="page-kind" content="place">`.
14. WHEN `/` renders THEN the `h1` SHALL be "Musculação e cardio em Flores, Manaus" and the hero sub-line SHALL be "Treine todos os dias, das 06:00 às 22:00, com acompanhamento de perto.", both read from `SITE.hero`.
15. WHEN `/` renders at 1440×900 THEN the hero SHALL be at least 900 px tall and the next section's `h2` SHALL start below 900 px.
16. WHEN `/` renders THEN the sections SHALL appear in the order hero, `#visita`, `#academia`, `#estrutura`, `#planos`, `#fecho`, footer, and each section except the hero and the footer SHALL carry `scroll-mt-24`.
17. WHEN each section renders at 1440×900 THEN its height SHALL be between 900 px and 1800 px, and the footer SHALL be at most 900 px.
18. WHEN `#visita` renders THEN it SHALL be the second section and SHALL show the street and district at 48 px or more as a link to `SITE.routes.google`, the hours "Todos os dias, 06:00–22:00", and the three route links "Google Maps", "Waze" and "Uber" with at least 44 px of height.
19. WHEN `/` renders THEN it SHALL show exactly four distinct photographs, each used once: `/dukfit/salao-cardio-1600.webp` in the hero, `/dukfit/musculacao-440.webp` in `#academia`, and `/dukfit/cardio-440.webp` plus `/dukfit/amanhecer-440.webp` in `#estrutura`; `#visita`, `#planos` and `#fecho` SHALL show no photograph.
20. WHEN `/` renders THEN no photograph SHALL have a `figcaption` or a caption text, and every `<img>` SHALL have `width`, `height` and a non-empty `alt`; the hero image SHALL carry `fetchpriority="high"` and no `loading="lazy"`, and the other three SHALL carry `loading="lazy"`.
21. WHEN a photograph, band or section rule renders THEN the photograph SHALL have radius 0, the ground SHALL be flat and its separators SHALL be 1 px `--border`; the landing SHALL NOT contain a `Panel`, a rounded card or a shadow.
22. WHEN `/` renders THEN the landing SHALL NOT animate in a loop: no carousel, no autoplay and no spinning badge.
23. WHEN a linked photograph is hovered THEN the image SHALL scale to 1.03 inside its frame; WHEN a linked title is hovered THEN it SHALL draw its underline; WHEN a button is hovered THEN it SHALL translate -1 px and WHEN pressed it SHALL scale to 0.98.
24. WHEN the hero mounts THEN it SHALL enter once with opacity 0→1 and y 12 px→0 in 300 ms with `MOTION.ease`; WHEN `#estrutura` first enters the viewport THEN the photograph pair SHALL develop once with scale 1.06→1 and a clip reveal in at most 900 ms; with `prefers-reduced-motion: reduce` both SHALL rest at the final state.
25. WHEN `#planos` renders THEN the plan SHALL be a ruled block with the title "Plano mensal", the line "Consulte na recepção", the three features and one "Matricule-se" link to `/matricula`, and SHALL show no price value.
26. WHEN `#fecho` renders THEN it SHALL use `--primary` as background and `--primary-foreground` as text, with the heading "Seu treino começa hoje." and one "Quero treinar" link to `/matricula`, and every text/background pair in it SHALL be at 7:1 or more.
27. WHILE the viewport is narrower than 1024 px, the header SHALL show the logo and the "Abrir menu" button only, the menu SHALL keep the session CTA, and a fixed `data-slot="action-bar"` with height 44 px SHALL show the "Quero treinar" link only after the hero's CTA leaves the viewport and while no section's own primary CTA is visible; the bar SHALL be hidden at 1024 px or more and in print.
28. WHEN `/` loads THEN it SHALL make no request to an origin other than the web's and SHALL raise zero `securitypolicyviolation`.
29. WHEN `/` renders at 320, 390, 768, 1024 and 1440 px THEN the document SHALL have no horizontal scroll and every content block SHALL share the same left and right edges as the section head.
30. WHEN `/` renders THEN every text, URL and image path SHALL come from `site-content.ts`, `SITE.kind` SHALL be `'place'`, the navigation SHALL have the four words of door 2 and `site-content.ts` SHALL contain no "EXEMPLO", "Rua Exemplo" or "0000-0000".

**Independent test:** abrir `/` em 1440×900 e em 390×844, com o medidor de layout aberto, e percorrer as seis seções; conferir o `h1`, as fotos, o hover e a barra de ação.

### S3: A entrada e o portal do aluno (P1)

O aluno entra por uma porta que diz o nome dele e vê, num cartão, quanto, quando e o que fazer.

**Acceptance Criteria**

31. WHEN `/login` renders THEN the eyebrow SHALL say "Acesso ao sistema", the link to the student's first access SHALL say "Sou aluno", the `h1` SHALL stay "Bem-vindo de volta", and the `AuthFrame` and the "E-mail", "Senha" and "Entrar" labels SHALL stay as they are.
32. WHEN the login submit is in flight THEN it SHALL use `Button busy`; WHEN a message like "Senha definida" renders THEN it SHALL be an `Alert` of the theme, not a plain paragraph.
33. WHEN `/primeiro-acesso` or `/esqueci-senha` reaches a success state THEN the screen SHALL show a card with a 24 px icon, a title, one line and a link back to `/login`, and SHALL NOT replace the form with a plain paragraph.
34. WHEN `/login`, `/primeiro-acesso`, `/esqueci-senha` and `/definir-senha` render THEN they SHALL keep `AuthFrame` or `PortalFrame` with the `Brand`, the "Portal do aluno" eyebrow at 14 px and the `h1` at 36 px, and SHALL share the same content width.
35. WHEN `/minha-conta` renders THEN the header SHALL show the `Brand` and the sign-out button, and the identity block SHALL show the student photo at 3:4 (120×160 px from 768 px, 96×128 px below), the name at 30 px and weight 500, and the `StatusBadge` of the current period.
36. WHEN the student has periods THEN one summary card SHALL show the next due date as `dd/mm/aaaa`, the plan name, the `StatusBadge` of the situation and one "Ver pagamentos" link that scrolls to the history.
37. WHEN the next due date is in the past and the period is not paid THEN the summary date and the badge SHALL use `--status-bad`.
38. IF the student has no periods THEN the screen SHALL show `EmptyState` with the title "Você ainda não tem matrícula registrada." and SHALL NOT show the summary card.
39. WHEN the history renders THEN it SHALL show the columns Plano, Período, Vencimento, Valor and Situação; the value SHALL be formatted `R$ 1.234,56`, right-aligned and tabular, the situation SHALL be a `StatusBadge`, and a paid period SHALL show its payment date on a second line.
40. WHILE the viewport is narrower than 768 px the history SHALL render as `ListOrTable` cards with no horizontal scroll and the contact form SHALL be one column; from 768 px the history SHALL be a `Table` and the form SHALL be two columns.
41. WHEN the photo section renders THEN it SHALL keep the 3:4 frame, the text "Aguardando aprovação da recepção." while a photo is pending and the upload action when it is not, and the upload dialog SHALL keep the crop at 3:4.
42. IF the profile or the payments request fails THEN the screen SHALL keep the header and the identity block and SHALL show one destructive `Alert` with a "Tentar novamente" button.
43. WHEN `/minha-conta` is loading THEN its `loading.tsx` SHALL show the portal header, the identity block and three cards with the same width and gutters as the loaded screen, and SHALL NOT draw the sidebar or the bottom nav of the team shell.
44. WHEN the portal renders THEN the cards SHALL enter with `Reveal` at the stagger of `MOTION` and the buttons SHALL be `pressable`; with `prefers-reduced-motion: reduce` nothing SHALL move.
45. WHEN a `student` session opens the portal THEN the screen SHALL show no link to a team screen, and `/minha-conta*` SHALL remain the only authenticated area of that session (AD-124).

**Independent test:** entrar como aluno, abrir `/login`, `/minha-conta` em 1440×900 e em 390×844, conferir o resumo, o histórico, a foto pendente, a falha de carga e o esqueleto.

### S4: As telas da equipe (P2)

As 21 telas com shell passam a ter um cabeçalho, uma situação e um vazio só, sem perder rota, dado ou texto de negócio.

**Acceptance Criteria**

46. WHEN any of the 21 shell screens renders THEN it SHALL show exactly one `ScreenHeader` whose title is an `h2` at 30 px and weight 500, and no other text on the screen SHALL use 30 px; the `main` gutter SHALL stay 16 px below 1024 px and 32 px from 1024 px.
47. WHEN `/dashboard` renders THEN the greeting SHALL be part of the `ScreenHeader` and SHALL NOT precede the title, the grid SHALL keep 1, 2 and 3 columns below 768, from 768 and from 1024 px, and the "Alunos" number SHALL stay 48 px and weight 600.
48. WHEN a list screen has no records THEN it SHALL show an `EmptyState` with the record-specific title; WHEN a search or filter returns nothing THEN the `EmptyState` SHALL use the search-specific title ("Nenhum aluno encontrado." instead of "Nenhum aluno cadastrado.").
49. WHEN a list screen renders THEN the `Table` SHALL NOT sit inside a second bordered card: the `PAGE_BODY` panel SHALL become a plain body container (`grid gap-6`, no border and no radius) on `/students`, `/staff`, `/plans`, `/payments`, `/check-ins` and `/audit`.
50. WHEN a list screen has records THEN from 768 px it SHALL render a `Table` with row hover, a `StatusBadge` for each situation and numeric alignment on values and counts; below 768 px it SHALL render the same fields as `ListOrTable` cards on `/students`, `/staff`, `/payments`, `/check-ins`, `/audit` and `/leads`.
51. WHEN a filter bar renders THEN `/students`, `/payments`, `/check-ins`, `/audit` and `/leads` SHALL use one toolbar pattern with a labelled search when the endpoint has `q`, labelled selects, a "Filtrar" and a "Limpar" button pair, and the count of results.
52. WHEN a situation appears on any team screen THEN it SHALL be a `StatusBadge` from the door 7 map, never plain text: student status on `/students` and on the student record, staff status on `/staff` and on the staff record, plan status on `/plans`, payment status on `/payments` and on the student record, check-in access on `/check-in`, lead status on `/leads`, portal state on the student record and user and 2FA state on `/users`.
53. WHEN the student record renders THEN the identity block SHALL show the photo, the name and the `StatusBadge` above the fields; the fields SHALL be grouped in "Identificação", "Contato" and "Emergência" inside the same card; and the status SHALL be visible without scrolling at 1440×900.
54. WHEN the staff record renders THEN the "Acesso ao sistema" section SHALL sit inside a card with the same title scale as the other blocks of the record.
55. WHEN a form renders THEN required fields SHALL carry a visible mark, the fields SHALL be grouped by section, the form SHALL be at most 640 px wide, the submit SHALL use `Button busy`, and an edit form SHALL offer a "Cancelar" that returns to the previous screen.
56. WHEN `/privacy` renders THEN each retention field SHALL show its unit inside the field, the "Desligado" control SHALL be a themed control and not a native checkbox, and each field SHALL carry one line describing its effect.
57. WHEN `/account` renders THEN it SHALL show a page title in the `ScreenHeader` and its two cards SHALL have the same width from 768 px on.
58. WHEN `/check-in` renders THEN the student result SHALL use the `Panel` geometry, the "Liberado" badge SHALL use `--status-ok` on `--status-ok-surface`, and the success feedback SHALL be an `Alert`.
59. WHEN `/plans` renders THEN the "Valor" cell SHALL be right-aligned and tabular, the "Regras" cell SHALL show at most two lines, and the situation SHALL be a `StatusBadge`.
60. WHEN one block of a record fails to load THEN the screen SHALL show one `Alert` for the failure and the other blocks SHALL keep rendering.
61. WHEN a linked card, a text link, a button or a table row is hovered THEN it SHALL answer with the hover of AC 23 and AC 9; with `prefers-reduced-motion: reduce` nothing SHALL move.
62. WHEN a page is printed THEN its computed background SHALL be #ffffff and its text #000000, and `/students/[id]/print` and `/staff/[id]/print` SHALL keep their layout.
63. The system SHALL keep `pnpm verify` at exit 0, SHALL keep the 21 shell screens without horizontal scroll at 360 px and at 1440 px, and SHALL keep the 30 px page title and the 16/32 px gutters that the `dukfit-app` proofs pin.

**Independent test:** com cada perfil de desenvolvimento, percorrer as 21 telas em 1440×900 e em 390×844; conferir cabeçalho, situação, vazio, tabela, lista e impressão.

## Out of scope

| Excluded | Why |
| --- | --- |
| Rotas, campos, permissões, dados ou textos de negócio novos | a feature é visual: nenhuma chamada à API, nenhum payload e nenhum texto de negócio muda |
| Tema claro e alternador | a identidade é escura e fixa (AD-098); um alternador dobraria a superfície de prova de toda tela |
| Novas dependências npm, o kit `assets/` da skill e os scripts `gate.mjs` e `copy-lint.mjs` no `pnpm verify` | AD-007 e AD-104: nada entra sem ser declarado; a skill orienta o desenho, não é dependência de build |
| Ensaio fotográfico e fotos de banco de imagens | a landing usa as fotos reais da academia; uma foto de outra academia seria falsa. A falta de fotos novas é a Open question 3 |
| Telas de 2FA (`/login/two-factor` e `/two-factor/setup`), pré-cadastro (`/matricula*`) e o fluxo de recorte de foto | ficam fora da entrada do aluno que esta slice toca; mudá-los é outra slice, com as próprias provas |
| Layout de impressão novo | a impressão só reseta as cores (AD-090) e as duas rotas `/print` mantêm o layout |
| Gráficos, cartões de KPI ou dados novos no painel | a feature não inventa número; só reapresenta o que a API já devolve |
| Reescrita do `README.md`, do runbook ou de `.specs/STATE.md` antes da aprovação | o `STATE.md` só recebe as doors depois que o plano é aprovado |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Densidade da landing | seis seções com quatro cenas reais, cada uma uma vez, em vez das três telas da *short page* da skill | cortar Sobre, Modalidades e Diferenciais apagaria conteúdo real da academia, e a contagem de fotos da skill supõe um banco de imagens que não existe | n |
| Título e sub-linha do herói | "Musculação e cardio em Flores, Manaus" e a frase das 06:00–22:00 | a skill exige, no primeiro título, o que é vendido e para quem ou onde; a frase tem uma âncora factual (o horário real) | n |
| Fotos | as quatro cenas reais, sem legenda, cada uma uma vez; a quinta foto (`salao-cardio-800`) fica no repositório sem uso | a 800 é a mesma cena da 1600 e repetir cena é o que a skill recusa; o arquivo continua porque a prova da `dukfit-landing` fixa os sete arquivos | n |
| Fecho | faixa do acento em vez de quinta foto | sem cena sobrando, a faixa é o único fecho que não repete foto e não inventa fotografia | n |
| Cor de situação | amarelo do acento para "pago/liberado", âmbar para "pendente/atenção", vermelho para "atrasado/bloqueado" e cinza para "inativo" | um acento só (AD-098); o check-in já usa o acento como "liberado", e o âmbar já aparecia no `WeekBars` | n |
| Borda de controle | um `--border-control: #6b6b6b` só para input, select e botão outline, com `--border` e `--input` da AD-098 intactos | o limite do componente precisa de 3:1 (WCAG 1.4.11) e o #2a2a2a da AD-098 dá 1,33:1; mudar o token de cartão inteiro trocaria a identidade | n |
| Rótulo do login | "Acesso ao sistema" no olho e "Sou aluno" no link do primeiro acesso | a mesma porta serve à equipe e ao aluno (`proxy.ts` manda o aluno a `/minha-conta`), e "Acesso da equipe" contradiz a navegação e as telas de senha | n |
| Título de página da equipe | mantém `h2` de 30 px e peso 500 | é o que as provas da `dukfit-app` fixam e o `h1` do shell continua o logo; mudar seria outra decisão | y |
| Portal do aluno sem navegação | uma tela só, com marca, sair e os blocos; sem shell e sem abas | AD-124 deixa a sessão `student` só em `/minha-conta*`; não há segunda tela para navegar | n |
| Linguagem da landing separada do app | a landing usa foto, régua e tipo com raio 0; o app mantém cartões de 16 px | a skill trata a página de lugar como editorial; o app é ferramenta de balcão e continua com a identidade AD-098. As duas compartilham tokens, tipografia e movimento | n |
| Prova do desenho | Playwright com valores computados e medidas de layout; a skill não entra no `pnpm verify` | o portão do repositório é `pnpm verify` (AD-007); rodar os scripts da skill no CI seria dependência nova | n |

**Open questions:**

| # | Kind | Question | Until answered |
| --- | --- | --- | --- |
| 1 | blocks | Autorizar a reescrita das provas de tela aprovadas nas features `dukfit-landing`, `dukfit-app`, `motion` e `portal-aluno` — os 18 testes da landing, os testes internos que fixam título, grid, gutters e o painel de cartão, `login.spec.ts`, o baseline C39 (`e2e/fixtures/motion-baseline/1440.json` e `390.json`) e os testes de repositório de identidade e movimento — e a consequente regravação do baseline sobre a base desta feature? | sem essa autorização o Build não pode tocar as provas e a feat não fecha com `pnpm verify` verde |
| 2 | open | O amarelo `#fcf43c` fica como a cor de "pago/liberado" ou entra um verde de sucesso? | os status usam a paleta provisória da door 1; trocar depois é mexer em 8 tokens e recontar as provas de cor |
| 3 | blocks go-live | A academia fornece de quatro a oito fotos novas (fachada, recepção, equipe, detalhes) para a landing crescer para a página compacta da skill? | a landing fica nas quatro cenas atuais; sem fotos novas ela não vira a página longa |

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/` | empty, loading, error | n/a - conteúdo estático de `site-content.ts`, sem chamada à API |
| screen `/` | unauthorised | existing - pública (AD-092); só o CTA muda com a sessão |
| screen `/` | density and ordering | AC 15, AC 16, AC 17 |
| screen `/` | destructive action | n/a - nenhuma ação destrutiva na landing |
| screen `/` | empty state of a list or card | n/a - a landing não tem lista de dados |
| screen `/` | hover and motion states | AC 22, AC 23, AC 24 |
| screen `/` | what the visitor does next | AC 18, AC 25, AC 26, AC 27 |
| screen `/login` | error and outcome messages | AC 32, AC 33 |
| screen `/login` | labels and heading | AC 31, AC 34 |
| screens `/primeiro-acesso`, `/esqueci-senha`, `/definir-senha` | success and refusal states | AC 33, AC 34 |
| screen `/minha-conta` | empty (aluno sem matrícula) | AC 38 |
| screen `/minha-conta` | loading | AC 43 |
| screen `/minha-conta` | error | AC 42 |
| screen `/minha-conta` | unauthorised | existing - o `proxy.ts` manda a sessão ausente para `/primeiro-acesso` (AD-124) |
| screens da shell (21 telas) | empty state | AC 48 |
| screens da shell | loading | existing - `loading.tsx` com a geometria da shell (AD-101), mantido |
| screens da shell | error | AC 60, existing - `*-load-error` com "Tentar novamente" |
| screens da shell | unauthorised | existing - `proxy.ts` e a guarda `@Roles` (AD-022) com "Você não tem permissão para acessar esta página." |
| screens da shell | density and ordering | AC 46, AC 49, AC 50, AC 51, AC 52 |
| destructive actions (`StatusActions`, `PrivacyBlock`) | confirmation before acting | existing - `Dialog` com confirmação e o nome do titular; mantido |
| forms | validation and focus | existing - React Hook Form sobre o schema Zod, `aria-invalid` e erro por campo; mantido |
| print | media | AC 62 |

## Sources

- `design-taste-frontend` (tasteskill 2.5.1), instalada em `.agents/skills/design-taste-frontend/` pelo usuário em 2026-11-07 - **a referência de desenho**: `SKILL.md` (regras da casa, kind `place`, plano por tipo de negócio) e `references/sections.md` 292-617 (Place: densidade, composições `story`/`pair`, sem cartão, sem efeito, um momento por página, camada de hover, barra de ação). Vale como sistema visual; a contagem de fotos foi adaptada na Assumptions.
- `.specs/STATE.md` AD-090 e AD-098 (tema e paleta), AD-092/AD-095/AD-096/AD-097 (landing pública, texto em `SITE`, imagens estáticas), AD-099 a AD-106 (movimento, `MOTION` e as peças da shell) e AD-119 a AD-124 (portal do aluno e sessão `student`) - os vínculos que a feat respeita.
- Auditoria visual das telas da equipe e do portal do aluno feita para este plano (21 telas da equipe e 13 telas públicas, com arquivo e linha de cada defeito), `apps/web/e2e/*.spec.ts` e `tests/repo/{identidade,motion}.test.ts` - o que a feat troca e as provas que serão reescritas com a Open question 1.
