# Identidade visual

## Problem

O app de hoje é um admin claro e genérico: fundo branco, tipografia do sistema, bordas cinza-claro
e o mesmo formulário padrão em toda tela. A academia usa o sistema o dia inteiro no balcão e na
recepção, e a interface não carrega nenhuma identidade própria: ações primárias, status e números
não se destacam. O dono do produto enviou duas pranchas de referência de um app de treino - fundo
quase preto, acento lime, cartões em camadas, tipografia forte - e pediu para copiar essa identidade
visual para o sistema da academia.

Quem paga hoje: o operador, que perde hierarquia visual em cada tela; e a academia, que quer chegar
na homologação com uma cara própria em vez da aparência de formulário padrão.

Quando isto entrar: as mesmas rotas, os mesmos textos e os mesmos comportamentos, agora com fundo
#0a0a0a, acento #cdf720, cartões #141414 com borda #262626 e raio de 16 px, tipografia Manrope e
estados de foco/erro legíveis no escuro, nas 24 telas do `apps/web`.

## Flow

Reusa o sistema de tokens shadcn/Tailwind que já existe (AD-023): a identidade vive em
`packages/ui/src/globals.css` e nos componentes compartilhados, não em cada tela.

1. `packages/ui/src/globals.css` (exists) - redefine os tokens de cor, raio e tipografia para o tema
   escuro e a fonte local; entrega `--background`, `--foreground`, `--card`, `--muted`, `--border`,
   `--input`, `--ring`, `--primary`, `--destructive` e `--radius`.
2. `@academia/ui` (exists) - `button`, `input`, `select`, `alert`, `dialog` e `table` consomem os
   tokens; recebem os ajustes de superfície, raio e estado de foco.
3. `apps/web/src/components/shell.tsx` (exists) - aplica a superfície e o acento na navegação;
   entrega o cabeçalho, a lista de links e o conteúdo.
4. `apps/web/src/app/**/page.tsx` (exists) - mantém rotas, títulos, textos e ordem; recebe as cores
   calculadas. A exceção é `apps/web/src/app/check-in/check-in-desk.tsx` (exists), que troca as duas
   classes claras de status pelas versões escuras.
5. out: o mesmo HTML com os mesmos papéis e textos e o CSS computado novo; em `@media print` o tema
   reseta para fundo branco e texto preto.

## Impact

| Front | What changes |
| --- | --- |
| domain | none - nenhum termo, rota, texto ou permissão muda; "identidade visual" é o nome da feature, não um termo do produto |
| stored data | nothing - nenhum dado é lido, gravado ou migrado |
| contrato da API | nothing - nenhuma rota, schema, payload ou status muda |
| dependências | nenhum pacote npm novo; entra um asset: `apps/web/src/fonts/manrope-variable.woff2` (OFL) carregado por `next/font/local`; `packages/ui` mantém as dependências |
| comandos e testes | os comandos não mudam; `pnpm verify` continua o portão; os e2e de tela e o `apps/web/e2e/csp.spec.ts` continuam verdes |
| documentos | `deploy/README.md`, `.env.example` e o runbook não mudam |
| CI | nothing - o workflow continua rodando só `pnpm verify` |
| telas | as 24 páginas de `apps/web/src/app` ganham a identidade; as duas rotas de `print` mantêm o layout e imprimem claras |

## Relations

None - no stored-data shape change.

## Surface

None - nothing consumed outside (nenhuma rota, payload ou status muda).

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Tema escuro fixo como identidade | `:root { color-scheme: dark; --background: oklch(0.145 0 0); --foreground: oklch(0.970 0 0); --card: oklch(0.191 0 0); --muted: oklch(0.239 0 0); --muted-foreground: oklch(0.715 0 0); --border: oklch(0.269 0 0); --input: oklch(0.285 0 0); --ring: oklch(0.914 0.2148 121.5); --primary: oklch(0.914 0.2148 121.5); --primary-foreground: oklch(0.145 0 0); --secondary: oklch(0.239 0 0); --secondary-foreground: oklch(0.970 0 0); --destructive: oklch(0.577 0.215 27.3); --destructive-foreground: oklch(0.985 0 0); --radius: 1rem; }` - correção de dois dígitos aprovada pelo usuário em 2026-10-19, porque `oklch(0.914 0.215 121.5)` renderiza #cdf71f (não o #cdf720 do AC 2) e `oklch(0.577 0.245 27.3)` renderiza #e7000b (não o #dc2626 do AC 17) | claro/escuro com alternância - a referência é escura e o alternador dobraria a superfície de prova de toda tela; um tema claro futuro é um novo conjunto de tokens, não uma media query |
| Fonte Manrope self-hosted | `next/font/local` com `apps/web/src/fonts/manrope-variable.woff2` (variable, 400-800, OFL) e fallback `system-ui, sans-serif`; nenhum `<link>` externo | Google Fonts por CDN - o `font-src 'self'` do CSP da `operacao` recusaria; pacote npm de fonte - uma dependência para um asset; `system-ui` puro - não carrega a identidade da referência |

- Nothing else in this change is hard to reverse

## Criteria

### S1: A identidade na entrada e no painel (P1)

Abrir `/login` e `/` mostra a identidade escura completa, sem mudar texto, rota ou comportamento.

**Acceptance Criteria**

1. The system SHALL render every authenticated page with `--background: oklch(0.145 0 0)` (#0a0a0a) and `--foreground: oklch(0.970 0 0)` (#f5f5f5).
2. WHEN a primary action button renders THEN its computed `background-color` SHALL be `rgb(205, 247, 32)` and its computed `color` `rgb(10, 10, 10)`, with `border-radius: 9999px`.
3. The system SHALL render cards and panels with background #141414 (`--card`), border #262626 (`--border`) and radius 16 px (`--radius: 1rem`).
4. WHEN the shell renders THEN the header SHALL use the #141414 surface with a #262626 bottom border, and the link of the current route SHALL use #cdf720.
5. WHEN `/login` renders THEN it SHALL show the "Entrar" heading and the form on #0a0a0a, with the submit button #cdf720 and 9999 px radius, and the labels SHALL stay "E-mail", "Senha" and "Entrar".
6. The system SHALL load the Manrope variable font (400-800) from `apps/web/src/fonts/` and apply it to `body`, with `system-ui, sans-serif` as fallback.
7. The system SHALL declare `color-scheme: dark` and SHALL NOT change the palette under `prefers-color-scheme: light`.
8. WHEN `/` renders THEN the dashboard card titles SHALL be #f5f5f5 on #141414, the stat numbers SHALL use `font-variant-numeric: tabular-nums`, and links SHALL use #cdf720.
9. The system SHALL use the #cdf720 accent only on primary buttons, links, the active nav link and the focus ring, never as a page or card surface.

### S2: As telas restantes herdam a identidade (P2)

As telas de lista, formulário, detalhe e conta (`/students`, `/students/new`, `/students/[id]`,
`/students/[id]/edit`, `/staff`, `/staff/new`, `/staff/[id]`, `/staff/[id]/edit`, `/plans`,
`/plans/new`, `/plans/[id]/edit`, `/payments`, `/check-ins`, `/check-in`, `/audit`, `/users`,
`/privacy`, `/account`, `/login/two-factor`, `/two-factor/setup`) passam a herdar os tokens, sem
mudar conteúdo, ordem ou comportamento.

**Acceptance Criteria**

10. WHEN a list screen renders THEN its table header SHALL be #1f1f1f with #d4d4d4 text, its body text #f5f5f5, its row border #262626, and the table container SHALL keep radius 16 px.
11. WHEN a form control renders THEN the input or select SHALL use background #141414, border #2a2a2a, text #f5f5f5, placeholder #8a8a8a and a 2 px #cdf720 focus-visible ring.
12. IF a form control is invalid THEN its border SHALL be #f87171 and its error text SHALL use #f87171.
13. WHEN an `Alert` with the default variant renders THEN it SHALL use background #1f1f1f and text #d4d4d4; with the destructive variant, text and border SHALL be #f87171.
14. WHEN a `Dialog` opens THEN the overlay SHALL be `rgb(0 0 0 / 0.7)`, the content background #141414, the border #262626 and the radius 16 px.
15. WHEN the check-in result badge shows `allowed` THEN it SHALL use background `rgb(205 247 32 / 0.15)` and text #cdf720; when it shows `blocked` THEN background `rgb(248 113 113 / 0.15)` and text #f87171.
16. WHEN a link outside the nav renders THEN it SHALL use #cdf720 and `underline-offset: 4px`.
17. WHEN a destructive button renders THEN it SHALL use background #dc2626 and text #fafafa.

### S3: Impressão, exceção e regressão (P3)

A identidade cobre a impressão e a página não encontrada, e não derruba CSP, e2e ou contrastes.

**Acceptance Criteria**

18. WHEN a page is printed THEN its computed background SHALL be #ffffff and its text #000000, including `/students/[id]/print` and `/staff/[id]/print`.
19. IF an unknown route is requested THEN the system SHALL render the 404 state on the dark identity, with the heading "Página não encontrada" and a link to `/`.
20. WHEN an interactive element receives keyboard focus THEN it SHALL show a 2 px #cdf720 ring with a 2 px offset.
21. The system SHALL keep #f5f5f5 on #0a0a0a at 7:1 or more, #a3a3a3 on #0a0a0a at 4.5:1 or more, and #0a0a0a on #cdf720 at 7:1 or more.
22. The system SHALL keep every route, heading label and copy unchanged, and `pnpm verify` SHALL exit 0, including the Playwright screens and the zero `securitypolicyviolation` of `apps/web/e2e/csp.spec.ts`.
23. The system SHALL NOT add an npm dependency; the only new asset SHALL be the Manrope `woff2` plus its OFL license file.
24. WHEN the four development profiles open their screens THEN every screen SHALL render with the dark identity and no surface lighter than #2a2a2a, except student/staff photos and print media.

**Independent test:**
- S1: abrir `/login` num navegador e conferir cabeçalho, cor de fundo e botão; entrar e ver o painel.
- S2: com cada perfil de desenvolvimento, percorrer lista, formulário, detalhe e diálogo de uma tela e conferir os valores computados.
- S3: `pnpm --filter @academia/web test` (Playwright), `pnpm verify`, impressão em PDF das duas rotas de `print` e a página de uma URL inexistente.

## Out of scope

| Excluded | Why |
| --- | --- |
| Alternância claro/escuro | a referência é escura; um alternador dobraria a superfície de prova de toda tela |
| Telas, funcionalidades, gráficos, anéis de progresso, ícones e animações novos | a feature é identidade visual sobre o que existe; gráfico novo é feature própria |
| Reproduzir a marca, o logotipo, as imagens anatômicas e as telas do app de referência | a referência fixa a linguagem visual, não o produto nem o conteúdo; são de outro app |
| Mudar layout, informação, textos, rotas, perfis ou permissões | a identidade não altera comportamento nem informação |
| Overlay ou filtro nas fotos de aluno e funcionário | as fotos continuam como estão |
| Redesenho do layout de impressão | impressão só reseta as cores; o conteúdo é o mesmo |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Tema claro/escuro | só escuro, `color-scheme: dark` | é a identidade pedida; um alternador dobra a superfície de prova | n |
| Tipografia | Manrope variável self-hosted (OFL), fallback `system-ui` | a referência tem grotesca geométrica; self-hosted respeita `font-src 'self'` e não adiciona pacote npm | n |
| Escala de raio | cartão 16 px, controle 12 px, botão primário pill (9999 px) | reproduz os cartões e botões da referência | n |
| Uso do acento | só em ação primária, link, nav ativa e foco | o lime é raro na referência; superfície lime inteira quebraria o contraste | n |
| Estrutura das telas | mantém `max-w-4xl`, ordem e textos | identidade não é redesenho de informação; mudar layout é outra feature | n |
| Pesos da fonte | 400, 500, 600, 700 e 800 | a referência usa títulos 700/800 e corpo 400 | n |
| Impressão | `@media print` reseta os tokens para claro | o papel não carrega o fundo escuro nem o lime | n |
| Imagens | fotos de aluno e funcionário sem filtro | a referência tem fotos, mas o dado é outro | n |
| 404 | uma `not-found.tsx` na identidade | sem ela o Next mostra a página padrão clara no meio do tema escuro | n |

**Open questions:** none - all resolved or logged above.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/login` | error state (credenciais, 429, indisponível) | AC 13 |
| screen `/login` | empty e loading | n/a - server component sem lista |
| screen `/` (painel) | empty states ("Nenhum vencimento...") e densidade | AC 3, AC 8 |
| screens de lista (`/students`, `/staff`, `/plans`, `/payments`, `/check-ins`, `/audit`, `/users`) | empty, erro de carga e densidade | AC 10, AC 13 |
| screens de formulário (`/students/new`, `/students/[id]/edit`, `/staff/new`, `/staff/[id]/edit`, `/plans/new`, `/plans/[id]/edit`, `/account`) | validação e foco | AC 11, AC 12, AC 20 |
| dialogs de ação destrutiva | confirmação antes de agir | AC 14, AC 17 |
| screen `/check-in` | status `allowed` e `blocked` | AC 15 |
| screens `/students/[id]/print` e `/staff/[id]/print` | mídia de impressão | AC 18 |
| todas as telas | nav ativa e foco por teclado | AC 4, AC 20 |
| rota desconhecida | 404 | AC 19 |
| todas as telas com sessão | superfícies escuras, sem superfície clara | AC 1, AC 24 |

## Sources

- Duas imagens de referência enviadas pelo usuário em 2026-10-19 (a prancha com as telas do app de treino e o mockup de três telas) - **binding**: fixam a paleta amostrada (fundo #0a0a0a, superfícies #141414/#1f1f1f, borda #262626, texto #f5f5f5, secundário #a3a3a3, acento #cdf720), o raio e a hierarquia tipográfica. Cópias em `C:\Users\Admin\.dsh\attachments\v1\objects\bc\bc6ccd743e64de2e4526c9d951cdb57150254557d57a4da825df608d77909e0f` e `C:\Users\Admin\.dsh\attachments\v1\objects\f3\f3e130ec07c8d5d4f73be87b5c6167ea8b77b7a705d6445f0f6c870892c60e3a`.
- `.specs/STATE.md` AD-023 (Tailwind + shadcn/ui em `packages/ui`) - o sistema de tokens que a identidade reusa, sem dependência nova.
- `packages/ui/src/globals.css` e `apps/web/src/components/shell.tsx` (hoje) - os tokens e a estrutura que a feature troca.
