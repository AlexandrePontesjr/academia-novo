# DukFit landing

## Problem

A landing em `/` (feature `dukfit-app`) está no ar só com texto de exemplo: endereço "Rua Exemplo,
123", telefone "(11) 0000-0000", WhatsApp fictício, horários inventados e nenhuma foto. O próprio
`site-content.ts` diz que não pode ir ao ar assim (Open question `blocks go-live` da `dukfit-app`).
Quem abre o site hoje não vê a academia de verdade: nem onde ela fica, nem a cara do espaço, nem o
logo.

O conteúdo real já existe. O projeto anterior da DukFit (`D:\projetos\dukfit`, Angular) tem uma landing
pública com o endereço, o horário, o bairro, o Instagram, os textos de apresentação e seis imagens
reais: o logo redondo e cinco fotos do salão. O dono do produto pediu, em 2026-10-19, para trazer as
imagens e as informações de lá e recriar o plano da landing.

Quando isto entrar: `/` apresenta a DUK FIT Academia de Flores, Manaus, com o logo, fotos reais do
salão, o horário verdadeiro (todos os dias, das 06:00 às 22:00), o endereço com rota por Google Maps,
Waze e Uber, e o Instagram. O logo também aparece no login e no shell do app.

## Flow

Reusa a landing, o `Gauge`, o `Panel`, os tokens (AD-090) e a regra da AD-095 de que todo texto da
landing vem de `site-content.ts`. Nenhuma chamada nova à API, nenhuma dependência nova.

1. Imagens: as seis do projeto antigo são convertidas uma vez, fora do repositório, em versões
   menores, e entram como arquivos em `apps/web/public/dukfit/` (door 1). O app não converte nada em
   tempo de execução.
2. Navegador pede `/dukfit/<arquivo>.webp` -> `apps/web/src/proxy.ts` (exists). O `matcher` deixa
   de cobrir `/dukfit/` (door 2) -> o Next serve o arquivo estático de `public/` sem sessão.
3. `/` -> `apps/web/src/app/page.tsx` (exists) - lê `SITE` de `apps/web/src/app/site-content.ts`
   (exists, com a forma nova da door 3) e monta as seções na ordem do Criteria. Os links de rota e o
   do Instagram saem para fora como `<a target="_blank">`, sem `iframe` nem script de terceiros.
4. `/login` (exists) e o `Shell` (exists) - trocam o wordmark de texto pelo logo + nome (door 4).
5. Saída: HTML com `<img>` de `src` na própria origem, com `width`/`height` fixos e `loading="lazy"`
   fora da primeira dobra.

## Impact

| Front | What changes |
| --- | --- |
| domain | o nome exibido segue "DukFit". Nos `alt` e no rodapé aparece "DUK FIT Academia", a grafia do logo. Nenhum identificador muda |
| `site-content.ts` (AD-095) | a forma de `SITE` muda (door 3). Saem `phone`, `whatsapp` e `modalities`; entram `eyebrow`, `about`, `structure`, `gallery`, `hours` de uma faixa, `address`, `neighborhood`, `routes`, `instagram`, `logo`, `hero`. Quem lê `SITE` hoje: `page.tsx`, `e2e/dukfit.spec.ts` (C30, C45) e `tests/repo/identidade.test.ts` (C34, que lista as chaves). As três provas são reescritas para a forma nova, registradas no `checks.md` desta feature |
| dashboard e app interno | nada muda além do logo no shell (door 4) |
| proxy | o `matcher` passa a excluir `dukfit/`. Nenhuma rota de tela muda |
| CSP (AD-084) | nada muda. `img-src 'self'` cobre as imagens; o mapa do projeto antigo era um `iframe` do Google, que o `default-src 'self'` recusaria, e por isso não entra (ver Out of scope) |
| assets | +7 arquivos `webp` em `apps/web/public/dukfit/` (logo em dois tamanhos, a foto do hero em dois tamanhos, três fotos de ~440 px), gerados uma vez a partir dos originais (dois deles têm 1,4 MB e 2,6 MB); `academia-esteiraas.webp` não entra, porque a landing antiga não a usa |
| dependências | nenhuma. A conversão é feita uma vez, fora do repositório, e não vira script versionado (AD-007: nenhum pacote usado sem estar declarado) |
| stored data, API, contratos | nothing |
| Docker | o `COPY . .` do `Dockerfile` já leva `public/` para a imagem. Nada muda |
| testes | `dukfit.spec.ts` (C30, C33, C45 e C1 no wordmark) e `identidade.test.ts` (C34) mudam onde afirmam o texto de exemplo, o WhatsApp ou o wordmark |

## Relations

None - no stored-data shape change.

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `GET /dukfit/<arquivo>.webp` | nada (sem sessão) | o arquivo, `Content-Type: image/webp` | `200`, `404` para nome que não existe |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. Imagens da academia como arquivos estáticos pré-convertidos | `apps/web/public/dukfit/` com `logo-dukfit-512.webp` (512×512, alfa) e `logo-dukfit-96.webp` (96×96, alfa); `salao-cardio-1600.webp` e `salao-cardio-800.webp` (a partir de `academia-esteiras.webp`, 1448×1086); `musculacao-440.webp`, `cardio-440.webp` e `amanhecer-440.webp` (os três originais de ~440 px, só recomprimidos). Todos em WebP com qualidade 80. Um arquivo com mais de 400 KB falha o teste de repositório | `next/image` com otimização em tempo de execução: o servidor passaria a depender de `sharp`, que hoje não é dependência declarada do web, e os caminhos `/_next/image` precisariam de regra no proxy; copiar os originais: dois deles somam 4 MB e o logo tem 1,4 MB para aparecer a 96 px |
| 2. `/dukfit/*` fora do proxy | `matcher: ['/((?!api/\|_next/\|favicon.ico\|dukfit/).*)']` | deixar o proxy decidir: hoje ele redireciona para `/login` todo caminho sem sessão, e o visitante da landing não veria nenhuma imagem; uma regra no corpo do `proxy()` em vez do `matcher`: a requisição de imagem passaria a gerar nonce e a ler a sessão na API a cada arquivo |
| 3. A forma de `SITE` (supersede a forma literal da AD-095; a regra "todo texto da landing vem daqui" continua) | `export const SITE = { name: 'DukFit', legalName: 'DUK FIT Academia', eyebrow, tagline: ['Seu corpo.', 'Seu ritmo.', 'Sua evolução.'], intro, proof: { value: '10+', label }, about: { title, text, highlight }, structure: Array<{ title, text }>, gallery: Array<{ src, alt, caption, width, height }>, hours: { days: 'Todos os dias', opens: '06:00', closes: '22:00' }, address: { street, district, city, zip }, neighborhood, routes: { google, waze, uber }, instagram: { handle: '@dukfitacademia', url }, logo: { src, alt }, hero: { src, alt, width, height } } as const` | manter `phone` e `whatsapp` vazios: um campo sem dado vira um link quebrado ou um bloco vazio, e o projeto antigo não tem número da academia; ler de JSON em `public/`: o texto ficaria fora do tipo e do lint, e a landing teria que buscá-lo por requisição |
| 4. Logo da academia no login e no shell | componente `Brand` em `apps/web/src/components/`: `<img src="/dukfit/logo-dukfit-96.webp" alt="" width="40" height="40">` seguido do `Wordmark` existente; o `h1` do shell e o wordmark do login passam a ser o `Brand`; o nome acessível continua "DukFit" | logo sozinho, sem o nome: o `h1` do shell perderia o texto que as telas e os testes leem; logo só na landing: o login e o app ficariam sem a marca que o visitante acabou de ver |
| 5. Forma final de `SITE`, acrescentada depois da verificação 1 (detalha a door 3 sem reescrevê-la: a door 3 previa `address: { street, district, city, zip }` e não tinha onde pôr os rótulos e títulos que a página escrevia direto, o que quebrava o AC 12) | chaves de topo da door 3 mais `cta: { guest: 'Acesso da equipe', member: 'Ir para o painel' }`, `footer` e `sections: { about, structure, gallery, hours, location }`, cada uma `{ eyebrow, title }`; `address: { street, district }` (cidade e CEP ficam no `district`, como no texto da fonte); `about: { title, text, highlight: { title, text }, photos }`; `logo: { src, small, alt }`; `routes: { google, waze, uber }` com as URLs literais da fonte e `routeLabels: { google: 'Google Maps', waze: 'Waze', uber: 'Uber' }`; `labels: { hours: 'Horário', neighborhood: 'Bairro' }`. `page.tsx` não tem nenhum texto literal em JSX | `city` e `zip` separados: a fonte escreve "Conjunto Flores, Manaus–AM, 69093-000" numa linha só e nenhum uso separa cidade de CEP; títulos fixos na página: contradiz o AC 12, que pede todo texto vindo de `site-content.ts` |

- Nothing else in this change is hard to reverse

## Criteria

### S1: Landing com a academia real (P1)

Quem abre `/` vê a DUK FIT de Flores, Manaus, com logo, fotos, horário e endereço reais.

**Acceptance Criteria**

1. WHEN `/` renders THEN the hero SHALL show the logo (`/dukfit/logo-dukfit-512.webp`, alt "DUK FIT Academia"), the eyebrow "Academia em Flores, Manaus", the `h1` "Seu corpo. Seu ritmo. Sua evolução." in three lines, the intro text and the proof "10+" with "Anos fazendo parte da rotina de Flores".
2. WHEN `/` renders THEN the hero SHALL use `/dukfit/salao-cardio-1600.webp` as a photo behind the text, with a dark overlay that keeps the `h1` at a contrast of at least 4.5:1, and the image SHALL load with `fetchpriority="high"` and without `loading="lazy"`.
3. WHEN `/` renders THEN the sections SHALL appear in this order: hero, "Sobre a Dukfit", "O que você encontra", "Nossa estrutura", "Horário", "Onde estamos", and the footer.
4. WHEN "Sobre a Dukfit" renders THEN it SHALL show the title "Treino de verdade. Presença todos os dias.", the text about the family, old-school gym in Conjunto Duque de Caxias, and the photos `musculacao-440.webp` and `cardio-440.webp` with their `alt`.
5. WHEN "O que você encontra" renders THEN it SHALL show three numbered `Panel` cards, "01 Musculação", "02 Acompanhamento" and "03 Cardio", each with its text from `SITE.structure`.
6. WHEN "Nossa estrutura" renders THEN it SHALL show the four photos of `SITE.gallery` in order, each with its `alt` and the caption "01 Cardio e musculação", "02 Treino em movimento", "03 Estrutura completa" and "04 Desde cedo com você".
7. WHEN "Horário" renders THEN it SHALL show the `Gauge` reading "06:00 - 22:00", with the pill "Todos os dias" and 27 of 40 ticks lit.
8. WHEN "Onde estamos" renders THEN it SHALL show "Rua Uberaba, Av. Duque de Caxias, 135", "Conjunto Flores, Manaus–AM, 69093-000" inside an `address` element, the neighborhood "Conjunto Flores", and three links "Google Maps", "Waze" and "Uber" pointing to the URLs in `SITE.routes`.
9. WHEN the footer renders THEN it SHALL show the 96 px logo, "Musculação e acompanhamento em Flores, Manaus." and a link "@dukfitacademia" to `https://www.instagram.com/dukfitacademia/`.
10. The system SHALL open every external link (routes and Instagram) with `target="_blank"` and `rel="noopener noreferrer"`.
11. The landing SHALL show no phone number, no WhatsApp link and no "Criar conta" action.
12. The landing SHALL take every text, URL and image path from `site-content.ts`, and `site-content.ts` SHALL contain no "EXEMPLO", "Rua Exemplo" or "0000-0000".

**Independent test:** abrir `/` numa janela anônima em 390×844 e em 1440×900 e percorrer as seções.

### S2: Imagens servidas e leves (P1)

As imagens chegam ao visitante sem sessão e sem pesar a página.

**Acceptance Criteria**

13. WHEN a visitor without a session requests `/dukfit/logo-dukfit-512.webp` THEN the system SHALL answer `200` with `content-type: image/webp`, without a redirect.
14. IF a visitor requests `/dukfit/nao-existe.webp` THEN the system SHALL answer `404`.
15. The system SHALL keep each file in `apps/web/public/dukfit/` at or under 400 KB, and SHALL ship exactly the seven files named in door 1.
16. WHEN `/` renders THEN every `<img>` SHALL have `width`, `height` and a non-empty `alt` (the decorative logo next to the name excepted, with `alt=""`), and every image below the hero SHALL carry `loading="lazy"`.
17. WHEN `/` loads THEN it SHALL make no request to an origin other than the web's and SHALL raise zero `securitypolicyviolation`.
18. WHEN `/` renders at 360 px and at 1440 px THEN no image SHALL overflow its container and the page SHALL have no horizontal scroll.

**Independent test:** `curl -I` sem cookie nos sete arquivos; abrir `/` com a aba de rede aberta.

### S3: A marca no login e no shell (P2)

O logo que o visitante vê na landing aparece também na entrada e no app.

**Acceptance Criteria**

19. WHEN `/login` renders THEN it SHALL show the 96 px logo at 40×40 px followed by the "DukFit" wordmark, and the wordmark SHALL keep its text "DukFit".
20. WHILE the viewport is 1024 px or wider the shell `h1` SHALL show the logo at 40×40 px followed by the wordmark, and its accessible name SHALL stay "DukFit".
21. WHILE the viewport is narrower than 1024 px the shell SHALL keep the header of the `dukfit-app` (avatar, name, profile, menu button) with no logo added.
22. The system SHALL keep `pnpm verify` at exit 0 and SHALL NOT add an npm dependency.

**Independent test:** abrir `/login` e `/students` em 1440×900 e em 390×844.

## Out of scope

| Excluded | Why |
| --- | --- |
| Mapa embutido (iframe do Google Maps) | o CSP da AD-084 (`default-src 'self'`) recusa o frame, e o iframe envia a visita ao Google sem consentimento; a rota por link resolve o "como chego" |
| "Criar conta" / cadastro de aluno | o sistema não tem conta de aluno (PRD: só a equipe entra); no projeto antigo isso era o portal do aluno |
| Telefone e WhatsApp da academia | o projeto antigo não traz número; entra numa feature futura quando o número existir |
| Animação de entrada nas seções (o `IntersectionObserver` do projeto antigo) | é enfeite; sem ela o conteúdo aparece igual e não há o que provar |
| Trocar a cor de acento do app para o amarelo da marca | é decisão do produto, registrada como Open question 1; esta feature não muda tokens |
| Planos e preços na landing | `GET /api/plans` exige sessão (AD-022) |
| Open Graph, sitemap, favicon com o logo | ficam para quando houver domínio (Open question da `operacao`) |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Fonte do conteúdo | os textos, o endereço, o horário, o Instagram e as fotos da landing de `D:\projetos\dukfit\apps\web\src\app\public-landing.component.ts` e `src/assets/dukfit/` | pedido do usuário em 2026-10-19 | y |
| Onde o logo entra | landing (hero e rodapé), login e o `h1` do shell no computador | o logo é a marca que o visitante acabou de ver; no celular o cabeçalho da referência não tem logo | n |
| Nome exibido | "DukFit" na interface, "DUK FIT Academia" nos `alt` e no rodapé | o usuário nomeou "DukFit"; o logo grafa "DUK FIT" | n |
| Contato | só Instagram e as rotas | o projeto antigo não tem telefone nem WhatsApp da academia | n |
| Prova social "10+ anos" | entra como no projeto antigo | é afirmação da própria academia na landing anterior | n |

**Open questions:**

| # | Kind | Question | Until answered |
| --- | --- | --- | --- |
| 1 | open | O acento do app inteiro passa do lime da referência (#CDF720, AD-090) para o amarelo do logo (~#F8D000)? | esta feature mantém o lime; mudar é trocar `--primary`/`--ring` numa feature à parte, que supersede a AD-090 e revê as provas de cor das duas features visuais |
| 2 | open | O logo no shell deve entrar também no celular? | o default é só no computador (AC 21), para manter o cabeçalho da referência |

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/` | empty, loading, error | n/a - conteúdo estático, sem chamada à API |
| screen `/` | unauthorised | existing - pública (AD-092); só o CTA muda com a sessão |
| screen `/` | density and ordering | AC 3, AC 18 |
| screen `/` | destructive action | n/a - nenhuma ação |
| imagens `/dukfit/*` | sem sessão, inexistente | AC 13, AC 14 |
| imagens `/dukfit/*` | peso e formato | AC 15, AC 16 |
| links externos | abertura e vazamento de referrer | AC 10 |
| documento lido (landing) | o que o visitante faz em seguida | AC 8 (rota), AC 9 (Instagram), CTA da equipe existente |
| `/login` e shell | a marca | AC 19, AC 20, AC 21 |

## Sources

- `D:\projetos\dukfit\apps\web\src\app\public-landing.component.ts` - **binding** para textos, endereço, horário, bairro, Instagram, links de rota, legendas e `alt` das fotos.
- `D:\projetos\dukfit\apps\web\src\assets\dukfit\` (logo e cinco fotos) - **binding** para as imagens.
- `.specs/features/dukfit-app/plan.md` e `.specs/STATE.md` AD-084, AD-090, AD-092 e AD-095 - a landing, o CSP e os tokens que esta feature respeita.
