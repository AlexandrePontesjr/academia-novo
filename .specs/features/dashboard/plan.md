# Dashboard

## Problem

Quem entra no sistema cai em `/`, uma página que só diz "Olá, <nome>. Escolha uma opção no menu acima." O sistema já sabe quantos alunos estão ativos, quais matrículas vencem nesta semana e quantos períodos estão sem pagamento, e ninguém vê isso sem abrir a lista de alunos, ficha por ficha, ou a tela `Pagamentos`. Quem paga é a recepção, que só descobre que a matrícula venceu quando o aluno já está no balcão, e o dono, que não tem um lugar para responder "como está a academia hoje?". A matrícula que vence sem ninguém avisar é a que não renova.

O PRD traz uma linha sobre isto, no §8: "2. Dashboard: alunos ativos, vencimentos próximos, check-ins do dia." Não traz número, janela de "próximo", nem quem vê o quê; a matriz do §2 não cita o painel. "Relatórios avançados" são fase 2 (§10). A apresentação do projeto precisa de uma tela de relatórios simples e funcional (pedido do usuário em 2026-10-09, sem data fixada), e o `check-in` (#11) não será construído antes dela.

Quando isto entrar: a página inicial passa a ser o painel. Cada perfil vê, na situação do dia em que olha, os cards do que já pode ler no resto do sistema: alunos por situação; matrículas ativas e agendadas e a lista das que vencem nos próximos 7 dias, com o nome do aluno ligado à ficha; pagamentos pendentes e atrasados, ligados à tela `Pagamentos`; matrículas ativas por plano. O card "check-ins do dia" não existe nesta versão: entra com a #11.

## Flow

Reutiliza a guarda por perfil (`apps/api/src/access.ts`), o `ValidationInterceptor` com `@Output`, o `ProblemFilter`, `saoPauloToday`, `addDays` e `enrollmentStatus` de `packages/contracts/src/plans.ts`, `paymentStatus` de `packages/contracts/src/payments.ts`, o corte por perfil no molde de `students.view.ts` e, no web, o `Shell`, o `fetchApi`, `requireSession`, a página renderizada no servidor e o bloco de erro com "Tentar novamente" no molde do de `/payments`, `PERIOD_LABELS` de `apps/web/src/lib/plans.ts` e `formatBirthDate` de `apps/web/src/lib/students.ts` (os rótulos do card "Alunos" são plurais, e por isso não são os `STATUS_LABELS`): nenhuma conta de situação é escrita de novo, nem em SQL nem em TypeScript, e a rota nova não ganha guarda, erro, validação nem layout próprio. O que não existe e esta feature cria: a rota do painel e a definição de "vencimento próximo".

**Ler o painel (`GET /api/dashboard`)**

1. `GET /api/dashboard` -> `apps/web` (exists) repassa -> `AccessGuard` (exists): os quatro perfis
2. módulo do painel em `apps/api` (new, no door - placement per conventions) - fixa `today = saoPauloToday()` uma vez e o usa em todos os cards
3. o mesmo módulo lê `students` (exists) agrupado pela coluna `status`, que é guardada (AD-030); lê `enrollments` (exists) com `plans` (exists), `students` (exists) e as confirmações vivas de `payments` (exists), e para cada período chama `enrollmentStatus` (exists) e `paymentStatus` (exists) de `packages/contracts` com `today`; o vencimento próximo é a conta nova de `packages/contracts` (door 1), sobre `enrollmentStatus` e `addDays`
4. o mesmo módulo corta a resposta pelo perfil (door 1): a chave do card que o perfil não lê sai do objeto
5. out: `200` com as chaves do perfil; a leitura não grava na trilha

**Tela**

1. navegador `GET /` -> `proxy.ts` (exists) exige sessão -> a página inicial (exists), renderizada no servidor, chama `GET /api/dashboard` por `fetchApi` (exists) e monta os cards dentro do `Shell` (exists), abaixo da saudação
2. os links dos cards levam a `/students`, `/students/<id>` e `/payments?status=...` (exists)

## Impact

| Front | What changes |
| --- | --- |
| domain | novo termo: `dashboard` (painel) - a leitura agregada do dia, por perfil; nome da rota e do schema. Mora em `packages/contracts` e num módulo novo de `apps/api`. Vai ramificar nele: `check-in` (#11), que acrescenta o card de check-ins do dia como chave nova |
| domain | novo termo: vencimento próximo (`expiringSoon`) - período `active` hoje cujo `endsAt` cai de hoje a hoje mais 7 dias, as duas pontas incluídas. Usa `endsAt`, o "Vencimento" de `planos-matriculas`, e não `dueDate`, o "Pagar até" de `pagamentos`: é o que o plano da `pagamentos` (Impact) já previa para o painel |
| domain | `matrícula` continua sendo um período (AD-060): "matrículas ativas" conta períodos `active`, e como dois períodos não cancelados do mesmo aluno não se sobrepõem (AD-062), esse número é também o de alunos com matrícula vigente |
| contrato | uma rota nova e um schema novo em `packages/contracts`; nenhum código de erro novo; `AUDIT_ACTIONS` fica em 38 |
| comportamento existente | `/` deixa de mostrar "Escolha uma opção no menu acima." e passa a mostrar a saudação e o painel. Nenhum teste afirma o texto antigo (só `apps/web/src/app/page.tsx:12` o contém). `apps/web/e2e/shell.spec.ts` abre `/` em oito pontos para conferir o menu, que não muda; a página que ele abre passa a pedir `GET /api/dashboard` |
| comportamento existente | nenhuma rota existente muda de assinatura; `GET /api/payments`, `GET /api/students` e as rotas de matrícula ficam como estão |
| web | o menu do `Shell` não muda: o painel é o "Início" que já existe para os quatro perfis |
| web | cada abertura de `/` (todo login termina nela, `proxy.ts:21`) faz uma chamada a mais à API, que lê todos os períodos não cancelados e as confirmações vivas, como `GET /api/payments` já faz |
| portão | a rota nova entra na regra de `paths` do OpenAPI e nos 70% de cobertura de `apps/api/src`, sem mudança no portão |
| ambiente | nenhuma variável nova, nenhuma migração, nenhuma extensão |
| stored data | nothing to migrate: o painel só lê. Os números mudam sozinhos à meia-noite de `America/Sao_Paulo` sem que nenhuma linha mude, e nada é guardado nem posto em cache |
| `.specs` | aprovado o plano: a door 1 vira AD-070 em `STATE.md`; a linha 12 do `ROADMAP.md` passa a depender só da 9 e perde "check-ins do dia"; a linha 11 ganha o card de check-ins do dia como acréscimo dela |

## Relations

None - no stored-data shape change: nenhuma tabela, coluna, índice ou migração; o painel lê `students`, `enrollments`, `plans` e `payments` como estão.

## Surface

Só a rota nova. Também pode responder com a linha de erro comum da `auth-rbac`.

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `GET /api/dashboard` | nada | `today` · `students` (`active` · `inactive` · `suspended`) · `enrollments` (`active` · `scheduled` · `expiringSoon` (`days` · `items[]`: `enrollmentId` · `student` (`id` · `name`) · `plan` (`id` · `name` · `period`) · `endsAt`) · `byPlan[]`: `plan` (`id` · `name` · `period`) · `active`) · `payments` (`pending` · `overdue`); `enrollments` e `payments` só existem para o perfil que os lê | `200`, `401`, `403` |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. o painel é uma rota só, com uma chave por card, e a chave que o perfil não lê não existe | `GET /api/dashboard`, `@Roles` com os quatro perfis; resposta `{ today, students, enrollments?, payments? }`, as duas últimas opcionais no schema de `packages/contracts` (AD-033 aplicada ao card inteiro); `instructor`: `today`, `students`; `reception`: mais `enrollments`; `admin` e `hr_finance`: mais `payments` - cada perfil recebe o card do que já lê hoje pelas rotas de aluno, de matrícula e de pagamento. `today` é o dia em `America/Sao_Paulo` fixado uma vez por resposta, e todos os números são desse dia. As situações vêm de `enrollmentStatus` (AD-061) e `paymentStatus` (AD-068), chamadas em código; `EXPIRING_SOON_DAYS = 7` e a conta do vencimento próximo (`active` em `today` e `endsAt <= addDays(today, 7)`) ficam numa definição só em `packages/contracts`. A leitura não grava na trilha (a AD-057 vale para dado de funcionário e exportação). Fecha: card novo é chave nova, nunca mudança numa chave existente; `check-in` (#11) acrescenta `checkIns` e decide lá que perfil a recebe | uma rota por card - quatro chamadas por abertura de `/`, cada uma com o seu `saoPauloToday()`: na virada do dia um card responde por ontem e outro por hoje, e a guarda passa a depender de o front chamar só as rotas do perfil, o que a AD-033 recusou. Card oculto como `null` ou com zeros - se confunde com "nenhum pagamento pendente" (AD-033). Contar em SQL (`CASE WHEN ends_at < current_date`) - segunda definição das AD-061 e AD-068, e `current_date` é o dia do servidor, não o de São Paulo. Gravar `dashboard.viewed` na trilha - uma linha a cada login e a cada clique em "Início", de todos os perfis, numa tabela que não apaga (AD-024), para uma leitura que não traz dado de funcionário nem dado que o perfil já não leia sem rastro |

- Nothing else in this change is hard to reverse

## Criteria

### S1: O painel responde por perfil (P1)

Uma rota para os quatro perfis; cada um recebe só as chaves do que pode ler.

**Acceptance Criteria**

1. WHEN um usuário de perfil `admin`, `hr_finance`, `reception` ou `instructor` chama `GET /api/dashboard` THEN the system SHALL responder `200` com `today` igual ao dia corrente em `America/Sao_Paulo`, no formato `aaaa-mm-dd`
2. The system SHALL devolver a `admin` e a `hr_finance` um objeto com exatamente as chaves `today`, `students`, `enrollments` e `payments`
3. The system SHALL devolver a `reception` um objeto com exatamente as chaves `today`, `students` e `enrollments`, sem a chave `payments`
4. The system SHALL devolver a `instructor` um objeto com exatamente as chaves `today` e `students`, sem as chaves `enrollments` e `payments`
5. IF `GET /api/dashboard` é chamada sem sessão THEN the system SHALL responder `401` com `code` igual a `unauthorized`
6. IF `GET /api/dashboard` é chamada por um `admin` que ainda não ativou o 2FA THEN the system SHALL responder `403` com `code` igual a `two_factor_enrollment_required`, sem nenhuma chave do painel no corpo
7. WHEN `GET /api/dashboard` responde `200` THEN the system SHALL deixar `audit_logs` com o mesmo número de linhas de antes
8. WHEN a chamada chega às `02:59:59Z` do dia D+1 THEN the system SHALL devolver `today` igual a D, e WHEN chega às `03:00:00Z` THEN the system SHALL devolver `today` igual a D+1

**Independent test:** chamar a rota com a sessão de cada um dos quatro perfis e comparar a lista de chaves do JSON.

### S2: Alunos por situação (P1)

Quantos alunos há em cada `status`.

**Acceptance Criteria**

9. The system SHALL devolver em `students` exatamente as chaves `active`, `inactive` e `suspended`, cada uma com o número inteiro de alunos cujo `status` é aquele
10. WHEN nenhum aluno tem um dos três `status` THEN the system SHALL devolver `0` na chave dele, nunca omiti-la

**Independent test:** com 3 alunos ativos, 1 inativo e nenhum suspenso, ler `students` e achar `{ "active": 3, "inactive": 1, "suspended": 0 }`.

### S3: Matrículas e vencimentos próximos (P1)

Quantos períodos estão valendo ou agendados, e quais vencem de hoje a 7 dias.

**Acceptance Criteria**

11. The system SHALL devolver em `enrollments.active` o número de períodos cuja situação pela `enrollmentStatus` em `today` é `active`, e em `enrollments.scheduled` o dos que são `scheduled`, de aluno de qualquer `status`
12. The system SHALL deixar fora de `enrollments.active` e de `enrollments.scheduled` todo período `expired` ou `cancelled`
13. The system SHALL devolver `enrollments.expiringSoon.days` igual a `7`
14. The system SHALL devolver em `enrollments.expiringSoon.items` um item para cada período `active` em `today` cujo `endsAt` é igual ou posterior a `today` e igual ou anterior a `today` mais 7 dias, cada um com `enrollmentId`, `student` (`id`, `name`), `plan` (`id`, `name`, `period`) e `endsAt`
15. WHEN `endsAt` é igual a `today` ou igual a `today` mais 7 dias THEN the system SHALL incluir o período em `expiringSoon.items`
16. IF `endsAt` é igual a `today` mais 8 dias THEN the system SHALL deixar o período fora de `expiringSoon.items` e contá-lo em `enrollments.active`
17. IF um período com `endsAt` dentro da janela está cancelado THEN the system SHALL deixá-lo fora de `expiringSoon.items`
18. WHEN um período tem `endsAt` igual a D THEN the system SHALL incluí-lo em `expiringSoon.items` na chamada das `02:59:59Z` de D+1 e deixá-lo fora, e fora de `enrollments.active`, na das `03:00:00Z`
19. WHEN um período `active` tem `endsAt` igual a D+8 THEN the system SHALL deixá-lo fora de `expiringSoon.items` na chamada das `02:59:59Z` de D+1 e incluí-lo na das `03:00:00Z`
20. The system SHALL ordenar `expiringSoon.items` por `endsAt` crescente e, no empate, por `enrollmentId` crescente
21. WHEN o plano de um período foi renomeado depois dele THEN the system SHALL devolver em `plan.name` o nome atual do plano
22. WHEN nenhum período vence na janela THEN the system SHALL devolver `expiringSoon.items` igual a `[]`

**Independent test:** com o relógio fixado, criar períodos que vencem ontem, hoje, em 7 e em 8 dias, um cancelado dentro da janela e um agendado; ler `enrollments` e achar na lista só os de hoje e de 7 dias, nessa ordem.

### S4: Pagamentos pendentes e atrasados (P1)

Quantos períodos faltam pagar, pela mesma conta da tela `Pagamentos`.

**Acceptance Criteria**

23. The system SHALL devolver em `payments.pending` o número de períodos cuja situação pela `paymentStatus` em `today` é `pending`, e em `payments.overdue` o dos que são `overdue`
24. The system SHALL deixar fora de `payments.pending` e de `payments.overdue` todo período `paid` ou `cancelled`
25. The system SHALL devolver, para os mesmos dados no mesmo instante, `payments.pending` igual ao número de itens de `GET /api/payments?status=pending` e `payments.overdue` igual ao de `GET /api/payments?status=overdue`
26. WHEN um período sem confirmação tem `startsAt` igual a D THEN the system SHALL contá-lo em `payments.pending` na chamada das `02:59:59Z` de D+1 e em `payments.overdue` na das `03:00:00Z`

**Independent test:** com um período pago, um pendente de hoje, dois atrasados e um cancelado, ler `payments` e achar `{ "pending": 1, "overdue": 2 }`; abrir `GET /api/payments` e contar os mesmos três.

### S5: Matrículas ativas por plano (P2)

Quantos períodos ativos cada plano tem hoje. Opcional no pedido; sai sem tocar os outros slices.

**Acceptance Criteria**

27. The system SHALL devolver em `enrollments.byPlan` um item para cada plano com ao menos um período `active` em `today`, com `plan` (`id`, `name`, `period`) e `active`, o número desses períodos
28. The system SHALL ordenar `enrollments.byPlan` por `active` decrescente e, no empate, por `plan.id` crescente
29. The system SHALL devolver a soma de `active` de todos os itens de `enrollments.byPlan` igual a `enrollments.active`
30. WHEN um plano de `status` igual a `inactive` tem um período `active` THEN the system SHALL incluí-lo em `enrollments.byPlan`
31. WHEN nenhum período está `active` THEN the system SHALL devolver `enrollments.byPlan` igual a `[]`

**Independent test:** com dois períodos ativos no plano "Mensal" e um no "Anual", ler `byPlan` e achar "Mensal" com 2 antes de "Anual" com 1.

### S6: A tela do painel (P1)

A página inicial mostra os cards do perfil, em pt-BR.

**Acceptance Criteria**

32. WHEN um usuário com sessão abre `/` e a API responde `200` THEN the system SHALL exibir "Olá, <nome>.", o título "Painel" e o texto "Situação em dd/MM/aaaa" com o `today` da resposta
33. The system SHALL exibir o card "Alunos" com os números de `students` sob os rótulos "Ativos", "Inativos" e "Suspensos" e o link "Ver alunos" para `/students`
34. WHERE a resposta traz `enrollments` the system SHALL exibir o card "Matrículas" com `active` sob "Ativas" e `scheduled` sob "Agendadas"
35. WHERE a resposta traz `enrollments` the system SHALL exibir o card "Vencimentos nos próximos 7 dias", com o número vindo de `expiringSoon.days`, e uma tabela de colunas "Aluno", "Plano" e "Vence em", na ordem que a API devolve
36. The system SHALL exibir em "Aluno" o nome como link para `/students/<id>`, em "Plano" `<nome> · <periodicidade>` e em "Vence em" a data como `dd/MM/aaaa`
37. IF `expiringSoon.items` é `[]` THEN the system SHALL exibir "Nenhum vencimento nos próximos 7 dias." no lugar da tabela
38. WHERE a resposta traz `payments` the system SHALL exibir o card "Pagamentos" com `pending` sob "Pendentes", como link para `/payments?status=pending`, e `overdue` sob "Atrasados", como link para `/payments?status=overdue`
39. WHERE a resposta traz `enrollments` the system SHALL exibir o card "Matrículas ativas por plano" com uma tabela de colunas "Plano" e "Matrículas ativas", na ordem que a API devolve, com o plano como `<nome> · <periodicidade>`
40. IF `enrollments.byPlan` é `[]` THEN the system SHALL exibir "Nenhuma matrícula ativa." no lugar da tabela
41. WHEN um usuário de perfil `instructor` abre `/` THEN the system SHALL exibir só o card "Alunos", sem os títulos "Matrículas", "Vencimentos nos próximos 7 dias", "Pagamentos" e "Matrículas ativas por plano"
42. WHEN um usuário de perfil `reception` abre `/` THEN the system SHALL exibir os cards "Alunos", "Matrículas", "Vencimentos nos próximos 7 dias" e "Matrículas ativas por plano", sem o card "Pagamentos"
43. IF `GET /api/dashboard` não responde `200` THEN the system SHALL exibir "Não foi possível carregar o painel." e o botão "Tentar novamente", mantendo a saudação e o menu
44. WHEN alguém sem sessão abre `/` THEN the system SHALL redirecionar para `/login`

**Independent test:** subir a stack, entrar como administrador e ver os cinco cards com os números do banco; seguir um nome da lista de vencimentos até a ficha e o número de atrasados até `/payments?status=overdue`; entrar como recepção e não ver "Pagamentos"; entrar como instrutor e ver só "Alunos".

## Out of scope

Product capabilities only. Process and harness rules live in AGENTS.md or as Observable `n/a`.

| Excluded | Why |
| --- | --- |
| Card "check-ins do dia" | o `check-in` (#11) não existe; entra com ele, como a chave `checkIns` (door 1) |
| Relatório de presença por período | RF-23, feature `check-in` |
| Contagem de períodos vencidos e cancelados | um período por linha (AD-060): os dois números somam todo o histórico e só crescem; não respondem nada sobre hoje (Assumptions) |
| "Alunos ativos sem matrícula vigente" e "quem não renovou" | pergunta por aluno, não por período: é uma conta nova, que nenhuma das duas de `packages/contracts` responde |
| Receita do mês, total a receber em reais, ticket médio | "relatórios avançados" são fase 2 (PRD §10); o plano da `pagamentos` já os deixou fora |
| Gráficos, séries históricas e comparação com o mês anterior | idem; o painel é a fotografia de hoje, e nada guarda o número de ontem |
| Filtro por período, por plano ou por data, e exportação em CSV ou PDF | idem |
| Janela de vencimento configurável pela tela | seria a tela de configurações da RF-30 (`privacidade`); a janela é uma constante (door 1) |
| Atualização automática do painel sem recarregar | a página é renderizada no servidor a cada abertura; nada no PRD pede tempo real |
| Funcionários no painel (quantos ativos, quem está de plantão) | o §8 não os cita, e leitura de dado de funcionário é auditada (AD-057) |
| Aviso de vencimento por e-mail ou WhatsApp | notificações são fase 2 (PRD §10) |

## Assumptions

Defaults that are not already a numbered criterion. Drop a row once it is.

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Sem check-ins | o painel sai sem o card de check-ins do dia e sem depender da #11 | pedido do usuário em 2026-10-09 | y |
| Onde o painel mora | em `/`, a página "Início" que já existe para os quatro perfis; sem rota `/dashboard` e sem item novo no menu | o login termina em `/` e hoje ela é um texto vazio; o PRD §8 põe o Dashboard logo depois do login | y |
| "Matrículas por situação" | só `active` e `scheduled`; `expired` e `cancelled` não são contados | os dois somariam o histórico inteiro (Out of scope); se o usuário quiser os quatro, são duas chaves a mais em `enrollments` e dois rótulos no card | y |
| Período que vence e já foi renovado | continua na lista de vencimentos próximos | a definição fica igual à coluna "Vencimento" da ficha; esconder o renovado é uma conta por aluno, a mesma que ficou fora do escopo | y |
| Aluno inativo ou suspenso | os períodos dele contam nos cards de matrícula e de pagamento | inativar não cancela matrícula, e `GET /api/payments` já os lista (AC 25 da `pagamentos`): contar diferente faria o painel discordar da tela `Pagamentos` | y |
| Matrículas por plano | entra, como S5 (P2) | o pedido a marcou como opcional; custa um laço sobre os períodos já lidos e uma tabela; cortar é apagar os critérios 27 a 31, 39 e 40 | y |
| Tamanho da lista de vencimentos | todos os itens da janela numa resposta só, sem paginação | academia de bairro: os vencimentos de 7 dias são dezenas, como na lista da `pagamentos` | y |
| Links do card "Alunos" | um link só, "Ver alunos", sem um link por situação | o filtro por situação de `/students` já existe na tela; o card não precisa conhecê-lo | y |
| Meta de desempenho (PRD §4) | não é critério | um percentil não se prova numa execução; a rota lê os períodos não cancelados inteiros, como `GET /api/payments` | y |
| Pendências sem dono do Handoff | nenhuma entra aqui | são de outras features | y |

**Open questions:** none - all resolved or logged above.

## Observable

Worksheet, not the review. `n/a` needs its reason. One row may group the same decision across several routes.

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/` | empty state | AC 37, AC 40; contagem zero é o número `0` (AC 10) |
| screen `/` | loading state | n/a - página renderizada no servidor, como `/payments`: só sai com os dados ou com a AC 43 |
| screen `/` | error state | AC 43 |
| screen `/` | unauthorised state | AC 44 sem sessão; AC 41 e AC 42 por perfil - o card que o perfil não lê não aparece, sem mensagem de permissão |
| screen `/` | density and ordering | AC 33 a AC 39 - cards na ordem Alunos, Matrículas, Vencimentos, Pagamentos, Matrículas por plano; listas na ordem da API (AC 20, AC 28) |
| screen `/` | destructive action confirms | n/a - a tela só lê |
| API `GET /api/dashboard` | response shape | AC 1 a AC 4, AC 9, AC 11, AC 13, AC 14, AC 23, AC 27 |
| API `GET /api/dashboard` | error shape and codes | AC 5, AC 6 - os da `auth-rbac`; nenhum código novo e nenhuma entrada a validar |
| API `GET /api/dashboard` | who may call it | AC 1 a AC 4 |
| API `GET /api/dashboard` | versioning | n/a - o único consumidor é `apps/web`, versionado e implantado junto |
| API `GET /api/dashboard` | rate limit | n/a - rota só de usuário autenticado; limite por IP fica no proxy, em `operacao` |
| scheduled task | output, flags, exit codes, failure halfway | n/a - nenhuma tarefa: os números são calculados na leitura |
| document `.env.example` | structure, what the reader does next | n/a - nenhuma variável nova |
| collection cards do painel | grouping criterion | AC 2 a AC 4 - um card por chave, agrupado pelo que o perfil já lê |
| collection cards do painel | naming | AC 32 a AC 39 - títulos e rótulos em pt-BR |
| collection `expiringSoon.items` e `byPlan` | ordering | AC 20, AC 28 |
| collection `expiringSoon.items` e `byPlan` | duplicates | n/a - um item por período e um por plano; dois períodos não cancelados do mesmo aluno não se sobrepõem (AD-062) |
| collection `expiringSoon.items` | the exception that does not fit | AC 17 - o cancelado dentro da janela fica fora; o já renovado fica dentro (Assumptions) |

## Sources

- `PRD — Sistema de Gestão de Academia.md` §8 tela 2 ("Dashboard: alunos ativos, vencimentos próximos, check-ins do dia"), §2 (o que cada perfil lê) e §10 (relatórios avançados na fase 2)
- `.specs/STATE.md` AD-033, AD-057, AD-060 a AD-062 e AD-068 - chave que o perfil não vê não existe, leitura auditada só de funcionário, matrícula é um período, as duas situações calculadas numa definição só
- pedido do usuário de 2026-10-09 (conversa): painel enxuto sem check-ins, só com dados que já existem; a linha 12 do `ROADMAP.md` passa a depender só da 9
