# Dashboard - checks

Profile: standard
Plan: `.specs/features/dashboard/plan.md`

## Intent

58 checks em 8 slices (S0, as 6 do plano e S7 de montagem, regressão e stack) · 1 one-way door · 0 open, of which 0 block

O plano foi aprovado como escrito em 2026-10-09: as Assumptions estão marcadas como confirmadas, a door 1 é a AD-070 em `STATE.md` e o `ROADMAP.md` tem a linha 12 dependendo só da 9, sem os check-ins do dia, que passam à linha 11 como a chave `checkIns`. `standard`, como nas features anteriores: o que o `light` não pega (um membro enumerado sem prova e um teste que passa sob uma implementação errada) é justamente o que um painel de contagens erra em silêncio, um número que está certo no dia em que o teste rodou e uma contagem que dobra quando a leitura ganha um `join`.

Cinco coisas que o plano deixa em aberto e que este arquivo fixa, para a revisão aceitar ou trocar antes do Build:

1. **`expiringSoon.days` é um inteiro positivo no schema, não o literal `7`.** A AC 35 diz que o número do título vem de `expiringSoon.days`; a única prova disso é uma resposta com outro número (a C35 usa `5`), e um `z.literal(7)` faria a tela cair no erro da AC 43 em vez de mostrar "5 dias". A API continua devolvendo sempre `7` (C13).
2. **"`today` fixado uma vez por resposta" (door 1) não se distingue de fora** com um relógio que não anda sozinho: quatro chamadas a `saoPauloToday()` no mesmo instante dão o mesmo dia. O que se prova é a consequência: em cada instante da virada, cada card está no dia do `today` da mesma resposta (C8, C18, C19, C26, C48). A leitura única do relógio é do Flow (passo 2) e fica para o diff.
3. **O `403` da `Surface` é só o `two_factor_enrollment_required`** (C6). `403 forbidden` não tem quem o provoque: os quatro perfis estão no `@Roles`, e não existe quinto perfil.
4. **O empate das duas ordenações é provado com `id` escolhido pelo teste**, de modo que a ordem de inserção seja a inversa da ordem do `id` (C20, C28). Com o `uuidv7` do banco as duas coincidem, e uma ordenação por inserção passaria.
5. **"Não responde `200`" (AC 43) é provado com `500` e com `403`** (C43). O corpo `200` fora do contrato não vira check: nenhuma AC o cita, e o que a tela faz com ele é do diff.

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`, `playwright test <arquivo> -g`). Arquivos do Build, todos novos salvo onde dito: em `packages/contracts/test`, `dashboard.test.ts`; em `apps/api/test`, `dashboard.test.ts` e, se preciso, `support/dashboard.ts`; em `apps/web/e2e`, `dashboard.spec.ts` e `support/dashboard.ts`; em `tests/stack`, `compose.test.ts` (ganha um caso). Ganham um caso ou uma linha: `enrollment.test.ts` (a lista de rotas bloqueadas ganha `GET /api/dashboard`) e `openapi.test.ts` (um teste novo). As regras de `features/auth-rbac/checks.md`, `auditoria`, `alunos`, `planos-matriculas` e `pagamentos` seguem valendo sem mudança: Postgres real por `testcontainers` (AD-012), sessão real de cada perfil (`stack.session(role)`, com 2FA já ativo para `admin`), contagem de `audit_logs` como diferença (`auditCount`), e, nas telas, a `FakeApi` que registra método, caminho e query. Regras próprias:

- A numeração acompanha o plano: **C1 a C44 provam a AC de mesmo número** (C26 é a AC 26). C45 e C46 (S0) são o que o plano deriva da conta e do contrato; C47 a C55, o que as doors, as Assumptions, a `Observable` e as lições L-025 a L-033 pedem além do texto das AC, cada um dentro do slice a que pertence; C56 a C58 (S7), a regressão, a montagem e a stack.
- **As contagens são do banco inteiro.** Cada caso de API parte do banco sem alunos, períodos, pagamentos nem planos de outro caso (`emptyTheGym`: apaga `payments`, `enrollments`, `students` e os planos do arquivo) e afirma números exatos, nunca "ao menos". Os usuários das sessões não são alunos e não entram em conta nenhuma.
- **Números distintos por chave.** Onde um objeto tem mais de uma contagem, a preparação dá um número diferente a cada chave (3, 2 e 1, por exemplo), para que duas chaves trocadas reprovem. O objeto é conferido por igualdade exata (`toEqual` do objeto inteiro), nunca chave a chave com casamento parcial.
- O dia de hoje em `America/Sao_Paulo` é controlado pelo teste (`clockAt`, só `Date`); salvo quando o caso diz outra coisa, o relógio está em `2026-10-07T15:00:00Z` (`NOON`), e então **D** é `2026-10-07`, hoje mais 7 é `2026-10-14` e hoje mais 8 é `2026-10-15`. A virada do dia é às 03:00 UTC: `2026-10-08T02:59:59Z` ainda é D, `2026-10-08T03:00:00Z` já é D+1 (`2026-10-08`, com hoje mais 7 igual a `2026-10-15`). Cada requisição feita depois de mover o relógio usa uma sessão aberta naquele instante (`sessionAt`), e todo caso de virada confere também o `today` da mesma resposta.
- "Mensal" de teste é um plano `monthly` de `9990`. Aluno vem de `insertStudents`, período de `insertEnrollment` e confirmação de `insertPayment`, por SQL, com `startsAt` e `endsAt` dados pelo caso (o banco aceita um período de qualquer tamanho); um aluno por período, salvo no caso do período renovado (C49). Períodos cancelados podem se tocar.
- Salvo onde o caso nomeia o perfil, as contagens de `enrollments` são lidas como `reception` e as de `payments` como `hr_finance`.
- Na tela, a resposta de `GET /api/dashboard` é a que o teste entrega à `FakeApi` (`serveDashboard`), com números que não coincidem entre si nem com o que a máquina calcularia: a tela não refaz conta nenhuma.

### S0 - A conta do vencimento próximo e o contrato · 7 files · 30 KB · ~2k

**C45** - `EXPIRING_SOON_DAYS` é `7`, e a conta única do vencimento próximo de `packages/contracts`, com hoje dado como dia, responde certo nas treze linhas: com hoje em `2026-10-07` e um período iniciado antes, `endsAt` em `2026-10-06` fora (vencido), em `2026-10-07`, `2026-10-08` e `2026-10-14` dentro, em `2026-10-15` e em `2026-11-06` fora; o cancelado com `endsAt` em `2026-10-10` fora; o agendado de `2026-10-08` a `2026-10-12` fora; o período de um dia só, que começa e termina em `2026-10-07`, dentro; com hoje em `2026-10-28`, `endsAt` em `2026-11-04` dentro e em `2026-11-05` fora; com hoje em `2026-12-28`, `endsAt` em `2027-01-04` dentro e em `2027-01-05` fora (door 1, Impact "vencimento próximo")
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/dashboard.test.ts -t "expiring_soon_thirteen_rows_around_both_edges_cancelled_scheduled_and_month_and_year_end"`

**C46** - O schema da resposta do painel aceita as três formas (as quatro chaves; `today`, `students` e `enrollments`; só `today` e `students`) e aceita `expiringSoon.days` igual a `5`; recusa a falta de cada uma das 24 chaves obrigatórias, uma por vez (`today`, `students`; `active`, `inactive` e `suspended` de `students`; `active`, `scheduled`, `expiringSoon` e `byPlan` de `enrollments`; `days` e `items`; `enrollmentId`, `student`, `plan` e `endsAt` de um item; `id` e `name` de `student`; `id`, `name` e `period` de `plan`; `plan` e `active` de um item de `byPlan`; `pending` e `overdue` de `payments`); recusa uma chave a mais em cada um dos nove objetos, entre elas `checkIns` no topo e `expired` em `enrollments`; recusa `enrollments` e `payments` iguais a `null`; e recusa `-1`, `1.5` e `"3"` em cada uma das oito contagens (Surface, door 1, AD-033, AD-011)
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/dashboard.test.ts -t "dashboard_schema_accepts_three_profile_shapes_and_refuses_each_missing_key_extra_key_null_card_and_bad_count"`

### S1 - O painel responde por perfil · 14 files · 88 KB · ~4k

**C1** - `GET /api/dashboard` chamado como `admin`, `hr_finance`, `reception` e `instructor` responde `200` aos quatro, com `today` igual a `2026-10-07` (o relógio em `NOON`) e no formato `aaaa-mm-dd` (AC 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "four_roles_200_with_today_in_sao_paulo"`

**C2** - `admin` e `hr_finance` recebem um objeto cujas chaves são exatamente `today`, `students`, `enrollments` e `payments` (AC 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "top_level_keys_exactly_by_role_four_roles"`

**C3** - `reception` recebe um objeto cujas chaves são exatamente `today`, `students` e `enrollments`; a chave `payments` não existe, nem como `null` (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "top_level_keys_exactly_by_role_four_roles"`

**C4** - `instructor` recebe um objeto cujas chaves são exatamente `today` e `students`; as chaves `enrollments` e `payments` não existem, nem como `null` (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "top_level_keys_exactly_by_role_four_roles"`

**C5** - `GET /api/dashboard` sem sessão responde `401` com `code` `unauthorized`, e a rota não entra na lista das quatro que respondem sem sessão (AC 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "anonymous_401_unauthorized"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "only_four_routes_answer_without_session"`

**C6** - `admin` que ainda não ativou o 2FA recebe `403` com `code` `two_factor_enrollment_required` e um corpo sem nenhuma das chaves `today`, `students`, `enrollments` e `payments`; a lista de rotas bloqueadas inclui `GET /api/dashboard` (AC 6, AD-022)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "admin_without_2fa_403_without_any_dashboard_key"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C7** - As oito leituras que respondem `200` (os quatro perfis, com o banco sem alunos e com alunos, períodos e pagamentos) deixam `audit_logs` com o mesmo número de linhas; as sessões são abertas antes da fotografia, porque o login grava (AC 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "eight_reads_write_no_audit_row"`

**C8** - A chamada das `2026-10-08T02:59:59Z` devolve `today` igual a `2026-10-07`, e a das `2026-10-08T03:00:00Z` devolve `2026-10-08` (AC 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "today_on_both_sides_of_the_sao_paulo_turn"`

**C47** - Na resposta de `admin`, as chaves aninhadas são exatamente as da `Surface`: `students` tem `active`, `inactive` e `suspended`; `enrollments` tem `active`, `scheduled`, `expiringSoon` e `byPlan`; `expiringSoon` tem `days` e `items`; `payments` tem `pending` e `overdue`; e a de `reception` traz o mesmo `students` e o mesmo `enrollments` que a de `admin` para os mesmos dados (Surface, door 1: cada perfil recebe o card inteiro ou não o recebe)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "nested_keys_exactly_the_surface_and_cards_equal_across_roles"`

### S2 - Alunos por situação · 0 files · 0 KB · ~1k

**C9** - Com três alunos `active`, dois `inactive` e um `suspended`, `students` é exatamente `{ "active": 3, "inactive": 2, "suspended": 1 }`, igual para os quatro perfis (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "students_three_two_one_by_status_for_four_roles"`

**C10** - A situação sem aluno aparece com `0`, nunca omitida, nos quatro casos: sem aluno nenhum (`{0, 0, 0}`), só `active` e `inactive`, só `active` e `suspended`, só `inactive` e `suspended` (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "students_zero_kept_for_each_missing_status_four_cases"`

### S3 - Matrículas e vencimentos próximos · 0 files · 0 KB · ~5k

**C11** - Com três períodos `active` em D, um de aluno `active`, um de `inactive` e um de `suspended` (um que começa em D, um que termina em D e um que cobre D com folga), e dois `scheduled` (início em `2026-10-08` e em `2026-12-01`), `enrollments.active` é `3` e `enrollments.scheduled` é `2` (AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "enrollments_active_three_scheduled_two_with_edges_on_today_and_any_student_status"`

**C12** - Só com períodos `expired` (fim em `2026-10-06` e em `2026-08-31`) e `cancelled` (um que cobriria D e um que começaria em `2026-12-01`), `enrollments.active` e `enrollments.scheduled` são `0`; somados à preparação da C11, os dois números continuam `3` e `2` (AC 12)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "expired_and_cancelled_periods_are_in_neither_count"`

**C13** - `enrollments.expiringSoon.days` é `7`, igual a `EXPIRING_SOON_DAYS`, com `items` vazio e com `items` cheio (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "expiring_soon_days_is_seven_with_and_without_items"`

**C14** - Com períodos de `endsAt` em `2026-10-06`, `2026-10-07`, `2026-10-10`, `2026-10-14`, `2026-10-15` e `2026-11-06`, mais um agendado de `2026-10-08` a `2026-10-12`, de alunos das três situações, `expiringSoon.items` tem exatamente três itens, os de `2026-10-07`, `2026-10-10` e `2026-10-14`; cada item tem exatamente as chaves `enrollmentId`, `student`, `plan` e `endsAt`, `student` exatamente `id` e `name` e `plan` exatamente `id`, `name` e `period`, com os valores do período, do aluno e do plano (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "expiring_soon_items_only_active_periods_inside_the_window_with_four_keys"`

**C15** - Só com um período de `endsAt` igual a D e um de `endsAt` igual a D mais 7 dias, os dois estão em `expiringSoon.items` (AC 15)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "window_includes_today_and_today_plus_seven"`

**C16** - O período de `endsAt` igual a D mais 8 dias fica fora de `expiringSoon.items` e é contado em `enrollments.active` (AC 16)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "today_plus_eight_is_out_of_the_list_and_counted_as_active"`

**C17** - O período cancelado com `endsAt` em `2026-10-10` fica fora de `expiringSoon.items`, ao lado de um não cancelado com o mesmo `endsAt`, que entra (AC 17)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "cancelled_period_inside_the_window_is_left_out"`

**C18** - O período de `endsAt` igual a `2026-10-07` está em `expiringSoon.items` e em `enrollments.active` na chamada das `2026-10-08T02:59:59Z`, e fora dos dois na das `03:00:00Z`: `items` perde o item e `enrollments.active` cai de `1` para `0` (AC 18)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "period_ending_today_leaves_list_and_active_count_at_the_sao_paulo_turn"`

**C19** - O período `active` de `endsAt` igual a `2026-10-15` está fora de `expiringSoon.items` na chamada das `2026-10-08T02:59:59Z` e dentro na das `03:00:00Z`, contado em `enrollments.active` nas duas (AC 19)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "period_ending_in_eight_days_enters_the_list_at_the_sao_paulo_turn"`

**C20** - `expiringSoon.items` sai em ordem de `endsAt` crescente e, no empate, de `enrollmentId` crescente: com `endsAt` em `2026-10-14`, `2026-10-07` e um par em `2026-10-10`, inseridos fora de ordem e com os `id` do par escolhidos pelo teste para que a inserção seja a inversa do `id` (AC 20, decisão 4 da Intent)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "expiring_soon_ordered_by_ends_at_then_enrollment_id_against_insertion_order"`

**C21** - Renomeado o plano depois da matrícula, `plan.name` do item de `expiringSoon.items` é o nome de agora, e o de `byPlan` também (AC 21; `byPlan` usa o mesmo `plan` na Surface)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "renamed_plan_shows_current_name_in_list_and_by_plan"`

**C22** - Sem período na janela, `expiringSoon.items` é `[]`, nos dois casos: com períodos ativos que vencem depois de D mais 7, e sem período nenhum (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "expiring_soon_empty_list_two_cases"`

**C48** - O período de `startsAt` igual a `2026-10-08` é contado em `enrollments.scheduled` e não em `enrollments.active` na chamada das `2026-10-08T02:59:59Z`, e o contrário na das `03:00:00Z`; em `byPlan`, o plano cujo único período começa em `2026-10-08` está ausente na primeira e presente com `active` igual a `1` na segunda, e o plano cujo único período termina em `2026-10-07` faz o caminho inverso (L-025, L-026: o limite de `startsAt` e o card por plano nos dois instantes, que as AC 18 e 19 não tocam)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "scheduled_becomes_active_and_by_plan_follows_at_the_sao_paulo_turn"`

**C49** - O aluno com um período que termina em `2026-10-10` e outro, já feito, que começa em `2026-10-11` continua em `expiringSoon.items` pelo primeiro; o segundo é contado em `enrollments.scheduled` (Assumptions "Período que vence e já foi renovado")
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "already_renewed_period_stays_in_the_expiring_list"`

**C50** - Para um período que termina em `2026-10-07` e um que começa em `2026-10-08`, nos três instantes `NOON`, `2026-10-08T02:59:59Z` e `2026-10-08T03:00:00Z`, `enrollments.active` é o número dos dois cujo `status` em `GET /api/students/:id/enrollments` é `active`, e `enrollments.scheduled` o dos que lá são `scheduled` (door 1: a situação vem de `enrollmentStatus`, não de uma segunda conta)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "dashboard_and_enrollment_ficha_agree_on_status_across_sao_paulo_midnight"`

### S4 - Pagamentos pendentes e atrasados · 0 files · 0 KB · ~2k

**C23** - Com períodos sem confirmação de `startsAt` em `2026-10-01` e `2026-10-06` (atrasados) e em `2026-10-07`, `2026-10-20` e `2026-12-01` (pendentes), de alunos das três situações, `payments` é exatamente `{ "pending": 3, "overdue": 2 }`, igual para `admin` e `hr_finance` (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "payments_pending_three_overdue_two_for_admin_and_hr_finance"`

**C24** - Não entram em `payments.pending` nem em `payments.overdue` o período com confirmação viva de vencimento passado, o com confirmação viva de vencimento futuro, o cancelado sem confirmação e o cancelado com confirmação viva: só com eles, `payments` é `{ "pending": 0, "overdue": 0 }`; o período só com confirmação desfeita entra, como `overdue` com vencimento em `2026-10-06` e como `pending` com vencimento em `2026-10-07` (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "paid_and_cancelled_periods_are_in_neither_payment_count_and_undone_counts"`

**C25** - Para os mesmos dados (vencimentos em `2026-10-06`, `2026-10-07` e `2026-10-08`, um pago e um cancelado), nos três instantes `NOON`, `2026-10-08T02:59:59Z` e `2026-10-08T03:00:00Z`, `payments.pending` é o número de itens de `GET /api/payments?status=pending` e `payments.overdue` o de `GET /api/payments?status=overdue`, como `admin` e como `hr_finance` (AC 25)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "dashboard_and_open_list_agree_on_both_counts_across_sao_paulo_midnight"`

**C26** - O período sem confirmação de `startsAt` igual a `2026-10-07` é contado em `payments.pending` na chamada das `2026-10-08T02:59:59Z` (`{ "pending": 1, "overdue": 0 }`) e em `payments.overdue` na das `03:00:00Z` (`{ "pending": 0, "overdue": 1 }`) (AC 26)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "unpaid_period_moves_from_pending_to_overdue_at_the_sao_paulo_turn"`

**C51** - Um período `active` com `endsAt` em `2026-10-10` e três linhas em `payments` (duas desfeitas e uma viva) conta uma vez em `enrollments.active`, é um item só em `expiringSoon.items`, soma `1` no `active` do plano dele em `byPlan` e não entra em `payments`; outro, com duas linhas desfeitas e nenhuma viva, conta uma vez nos mesmos três e uma vez em `payments.pending` (L-028: o que um `join` com `payments` multiplicaria)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "period_with_several_payment_rows_counts_once_in_every_card"`

### S5 - Matrículas ativas por plano · 0 files · 0 KB · ~2k

**C27** - Com três períodos ativos no "Mensal", um no "Anual", e três planos mais, um só com período agendado, um só com vencido e cancelado e um sem período, `enrollments.byPlan` tem exatamente dois itens, cada um com exatamente as chaves `plan` (`id`, `name`, `period`) e `active`: "Mensal" com `3` e "Anual" com `1` (AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "by_plan_one_item_per_plan_with_an_active_period_and_two_keys"`

**C28** - `enrollments.byPlan` sai em ordem de `active` decrescente e, no empate, de `plan.id` crescente: com planos de `1`, `3`, `2` e `2` períodos ativos, inseridos nessa ordem e com os `id` do par empatado escolhidos pelo teste para que a inserção seja a inversa do `id` (AC 28, decisão 4 da Intent)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "by_plan_ordered_by_active_desc_then_plan_id_against_insertion_order"`

**C29** - A soma de `active` dos itens de `enrollments.byPlan` é igual a `enrollments.active`, na preparação da C11 (`3`), na da C27 (`4`) e nos dois instantes da virada da C48 (AC 29)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "by_plan_sum_equals_enrollments_active_in_four_setups"`

**C30** - O plano de `status` `inactive` com um período `active` aparece em `enrollments.byPlan` com `active` igual a `1` (AC 30)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "inactive_plan_with_an_active_period_is_listed"`

**C31** - Sem período `active`, `enrollments.byPlan` é `[]`, nos dois casos: só com períodos agendados, vencidos e cancelados, e sem período nenhum (AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "by_plan_empty_list_two_cases"`

### S6 - A tela do painel · 16 files · 56 KB · ~8k

**C32** - Com sessão e a API respondendo `200` com `today` igual a `2026-03-05`, `/` mostra "Olá, <nome>." com o nome da sessão, o título "Painel" e "Situação em 05/03/2026", e não mostra "Escolha uma opção no menu acima." (AC 32, Impact "comportamento existente")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "home_shows_greeting_painel_title_and_situation_date_from_the_response"`

**C33** - O card "Alunos" mostra `31` sob "Ativos", `4` sob "Inativos" e `2` sob "Suspensos", e o link "Ver alunos" para `/students`; com as três contagens em `0`, mostra "0" sob cada rótulo (AC 33, Observable "empty state")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "students_card_three_labelled_counts_zeros_and_ver_alunos_link"`

**C34** - Com `enrollments` na resposta, o card "Matrículas" mostra `27` sob "Ativas" e `6` sob "Agendadas" (AC 34)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "enrollments_card_ativas_and_agendadas"`

**C35** - Com `expiringSoon.days` igual a `7` o card se chama "Vencimentos nos próximos 7 dias", e com `5` se chama "Vencimentos nos próximos 5 dias"; a tabela tem as colunas "Aluno", "Plano" e "Vence em", com as linhas na ordem em que a `FakeApi` devolveu, que o teste embaralha de propósito (AC 35, decisão 1 da Intent)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "expiring_card_title_from_days_three_columns_in_api_order"`

**C36** - Numa linha com aluno "Ana Souza" (`id` conhecido), plano "Mensal Plus" `monthly` e `endsAt` `2026-10-14`, a tela mostra o nome como link para `/students/<id>`, "Mensal Plus · Mensal" e "14/10/2026" (AC 36)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "expiring_row_formats_name_link_plan_and_date"`

**C37** - Com `expiringSoon.items` igual a `[]`, o card mostra "Nenhum vencimento nos próximos 7 dias." e nenhuma tabela dentro dele (AC 37)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "expiring_card_empty_state_replaces_table"`

**C38** - Com `payments` na resposta, o card "Pagamentos" mostra `9` sob "Pendentes", como link para `/payments?status=pending`, e `4` sob "Atrasados", como link para `/payments?status=overdue` (AC 38)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "payments_card_counts_link_to_the_filtered_payments_page"`

**C39** - Com `enrollments` na resposta, o card "Matrículas ativas por plano" mostra uma tabela de colunas "Plano" e "Matrículas ativas", com as linhas na ordem em que a `FakeApi` devolveu, embaralhada de propósito, e o plano como "Mensal Plus · Mensal" e "Anual · Anual" (AC 39)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "by_plan_card_two_columns_in_api_order_with_plan_and_period"`

**C40** - Com `enrollments.byPlan` igual a `[]`, o card mostra "Nenhuma matrícula ativa." e nenhuma tabela dentro dele (AC 40)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "by_plan_card_empty_state_replaces_table"`

**C41** - Como `instructor`, com a resposta só de `today` e `students`, `/` mostra o card "Alunos" e nenhum dos títulos "Matrículas", "Vencimentos nos próximos 7 dias", "Pagamentos" e "Matrículas ativas por plano" (AC 41)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "instructor_sees_only_the_students_card"`

**C42** - Como `reception`, com a resposta sem `payments`, `/` mostra os cards "Alunos", "Matrículas", "Vencimentos nos próximos 7 dias" e "Matrículas ativas por plano", e não mostra o título "Pagamentos" como card (o link "Pagamentos" do menu também não existe para ela) (AC 42)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "reception_sees_four_cards_without_payments"`

**C43** - Com `GET /api/dashboard` respondendo `500` e respondendo `403`, `/` mostra "Não foi possível carregar o painel." e o botão "Tentar novamente", sem card nenhum, mantendo "Olá, <nome>." e o menu; clicar no botão com a API de volta mostra os cards (AC 43, decisão 5 da Intent)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "load_failure_500_and_403_shows_retry_keeps_greeting_and_menu_and_retry_shows_the_cards"`

**C44** - Sem sessão, abrir `/` redireciona para `/login`, e a `FakeApi` não recebe nenhuma chamada a `/api/dashboard` (AC 44)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "anonymous_home_redirects_to_login_without_dashboard_request"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "anonymous_is_redirected_to_login"`

**C52** - Como `admin` e como `hr_finance`, com a resposta de quatro chaves, `/` mostra os cinco cards nesta ordem: "Alunos", "Matrículas", "Vencimentos nos próximos 7 dias", "Pagamentos", "Matrículas ativas por plano" (Observable "density and ordering", AC 2)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "admin_and_hr_finance_see_five_cards_in_order"`

**C53** - O card segue a chave da resposta, não o perfil da sessão: com sessão de `admin` e uma resposta sem `payments`, o card "Pagamentos" não aparece e os outros quatro aparecem; com uma resposta sem `enrollments` e sem `payments`, só "Alunos" aparece (AC 34, AC 35, AC 38 e AC 39: "WHERE a resposta traz")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "cards_follow_the_response_keys_not_the_session_role"`

**C54** - Um nome de aluno com marcação (`<b>Ana</b>`) e um nome de plano com marcação (`<i>Mensal</i>`) aparecem como texto literal, sem criar elemento, na tabela de vencimentos (aluno e plano) e na tabela por plano (L-027; a tela repete os dois textos livres em três lugares)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "student_and_plan_name_markup_shown_as_literal_text_in_both_tables"`

**C55** - Cada abertura de `/` com sessão faz exatamente uma chamada `GET /api/dashboard`, sem query, e nenhuma a `/api/payments`, `/api/students` nem `/api/plans`, nos quatro perfis (Impact "web": uma chamada a mais; Flow "Tela")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "home_requests_the_dashboard_once_and_no_other_data_route_for_four_roles"`

### S7 - Regressão, montagem e stack · 2 files · 58 KB · ~3k

**C56** - As leituras do painel, pelos quatro perfis e nos dois instantes da virada, deixam idênticas todas as linhas de `students`, `enrollments`, `plans` e `payments` (o `to_jsonb` de cada tabela antes e depois) e não criam linha em nenhuma (Impact "stored data": o painel só lê, e os números mudam à meia-noite sem que linha nenhuma mude)
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "reading_the_dashboard_changes_no_row_of_four_tables_across_the_turn"`

**C57** - O `/api/openapi.json` documenta `/api/dashboard` só com `get`, sem parâmetro e sem corpo de requisição, com a resposta `200` e nenhuma outra declarada; os caminhos documentados continuam iguais aos registrados (Impact "portão", AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "dashboard_path_declared_as_get_without_parameters_or_body"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "paths_equal_registered_api_routes"`

**C58** - Na stack de pé, pela origem do container `web`, com um `hr_finance`, um `reception` e um `instructor` criados pelo próprio teste: `GET /api/dashboard` responde `200` ao `hr_finance` com as quatro chaves e `today` igual ao dia em `America/Sao_Paulo` lido do `psql` da stack antes ou depois da chamada; matriculado um aluno novo a partir de hoje, a leitura seguinte tem `students.active`, `enrollments.active` e `payments.pending` cada um com um a mais que a anterior, e confirmado o pagamento `payments.pending` volta ao valor anterior; o `reception` recebe `200` sem a chave `payments` e o `instructor` só `today` e `students`; sem cookie a resposta é `401`; a página `/` com a sessão do `hr_finance` traz "Painel" e o card "Pagamentos", e com a do `instructor` não traz "Pagamentos" nem "Matrículas"; e as leituras e as aberturas de página não acrescentam linha a `audit_logs` (AC 1 a AC 5, AC 7, AC 11, AC 23, AC 32, AC 41, door 1, Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "dashboard_read_through_web_by_three_roles_follows_enrollment_and_payment_without_audit_rows"`

## Coverage

Uma linha para a rota da `Surface`, com os status como membros; depois a door, os conjuntos enumerados nos critérios, nas `Assumptions` e na `Observable`, e as montagens. `Relations` não acrescenta linha: o plano diz que nenhuma tabela muda, e é a C56 que o afirma.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/dashboard` statuses (3) | 200 C1 · 401 C5 · 403 C6 | - |
| quem chama, por perfil (4) | `admin` C1, C2 · `hr_finance` C1, C2 · `reception` C1, C3 · `instructor` C1, C4 | - |
| chaves do topo, por perfil (4) | `admin` quatro C2 · `hr_finance` quatro C2 · `reception` três C3 · `instructor` duas C4 | - |
| card que o perfil não lê (3) | `payments` para `reception` C3 · `payments` para `instructor` C4 · `enrollments` para `instructor` C4 | - |
| forma literal da door 1 (8) | uma rota para os quatro perfis C1 · chave do card não lido ausente C3, C4 · as duas chaves opcionais no schema C46 · todos os números no dia do `today` C8, C18, C19, C26, C48 · situações pelas duas contas existentes C25, C50 · `EXPIRING_SOON_DAYS` e a conta numa definição C45, C13 · a leitura não grava na trilha C7 · card novo é chave nova, `checkIns` ainda recusada C46 | - |
| chaves de `students` (3) | `active` C9 · `inactive` C9 · `suspended` C9 | - |
| situação de aluno sem ninguém (4) | sem aluno nenhum C10 · sem `suspended` C10 · sem `inactive` C10 · sem `active` C10 | - |
| chaves de `enrollments` (4) | `active` C11 · `scheduled` C11 · `expiringSoon` C14 · `byPlan` C27 | - |
| chaves de `expiringSoon` (2) | `days` C13 · `items` C14 | - |
| chaves de um item de `expiringSoon.items` (4) | `enrollmentId` C14 · `student` C14 · `plan` C14 · `endsAt` C14 | - |
| chaves de `student` e de `plan` do item (5) | `student.id` C14 · `student.name` C14 · `plan.id` C14 · `plan.name` C14, C21 · `plan.period` C14 | - |
| chaves de um item de `byPlan` (2) | `plan` C27 · `active` C27 | - |
| chaves de `payments` (2) | `pending` C23 · `overdue` C23 | - |
| chaves aninhadas na fronteira (4 objects) | `students` C47 · `enrollments` C47 · `expiringSoon` C47 · `payments` C47 | - |
| `enrollmentStatus` nas contagens (4) | `active` contado C11 · `scheduled` contado C11 · `expired` fora C12 · `cancelled` fora C12 | - |
| limites de dia de `enrollments.active` (4 edges) | `startsAt` igual a hoje, ativo C11 · `startsAt` igual a hoje mais 1, agendado C11 · `endsAt` igual a hoje, ativo C11 · `endsAt` igual a hoje menos 1, vencido C12 | - |
| janela do vencimento próximo (5 edges) | hoje menos 1 fora C14, C45 · hoje dentro C15, C45 · hoje mais 7 dentro C15, C45 · hoje mais 8 fora C16, C45 · meio da janela dentro C14 | - |
| a exceção da janela (3) | cancelado dentro da janela fora C17 · agendado com `endsAt` na janela fora C14, C45 · já renovado dentro C49 | - |
| linhas da conta do vencimento próximo (13) | C45, table-driven over all 13 | - |
| virada do dia em São Paulo, por limite que depende de hoje (12) | `today` às `02:59:59Z` C8 · `today` às `03:00:00Z` C8 · piso da janela (`endsAt` D) às `02:59:59Z` C18 · piso da janela às `03:00:00Z` C18 · teto da janela (`endsAt` D mais 8) às `02:59:59Z` C19 · teto da janela às `03:00:00Z` C19 · `active` para `expired` às `02:59:59Z` C18, C50 · `active` para `expired` às `03:00:00Z` C18, C50 · `scheduled` para `active` às `02:59:59Z` C48, C50 · `scheduled` para `active` às `03:00:00Z` C48, C50 · `pending` para `overdue` às `02:59:59Z` C26, C25 · `pending` para `overdue` às `03:00:00Z` C26, C25 | - |
| `byPlan` na virada (2) | plano que entra C48 · plano que sai C48 | - |
| situação do aluno nos cards de período (3) | `active` C11, C14, C23 · `inactive` C11, C14, C23 · `suspended` C11, C14, C23 | - |
| ordem de `expiringSoon.items` (2) | `endsAt` crescente C20 · empate por `enrollmentId` crescente C20 | - |
| lista de vencimentos vazia (2) | períodos ativos fora da janela C22 · nenhum período C22 | - |
| `paymentStatus` nas contagens (4) | `pending` contado C23 · `overdue` contado C23 · `paid` fora C24 · `cancelled` fora C24 | - |
| o que fica fora e o que entra em `payments` (6) | confirmação viva de vencimento passado fora C24 · confirmação viva de vencimento futuro fora C24 · cancelado sem confirmação fora C24 · cancelado com confirmação viva fora C24 · só desfeita, vencida, `overdue` C24 · só desfeita, do dia, `pending` C24 | - |
| acordo com as rotas que já existem (4) | `payments.pending` com `?status=pending` C25 · `payments.overdue` com `?status=overdue` C25 · `enrollments.active` com a ficha de matrículas C50 · `enrollments.scheduled` com a ficha de matrículas C50 | - |
| instantes do acordo (3) | `NOON` C25, C50 · `02:59:59Z` C25, C50 · `03:00:00Z` C25, C50 | - |
| período com várias linhas em `payments` (5) | uma vez em `enrollments.active` C51 · um item em `expiringSoon.items` C51 · uma vez em `byPlan` C51 · com viva, fora de `payments` C51 · só com desfeitas, uma vez em `payments.pending` C51 | - |
| quem entra em `byPlan` (6) | plano com período ativo C27 · só com agendado, fora C27 · só com vencido e cancelado, fora C27 · sem período, fora C27 · plano `inactive` com período ativo, dentro C30 · nenhum período ativo, `[]` C31 | - |
| ordem de `byPlan` (2) | `active` decrescente C28 · empate por `plan.id` crescente C28 | - |
| soma de `byPlan` igual a `enrollments.active` (4 setups) | preparação da C11 C29 · preparação da C27 C29 · `02:59:59Z` C29 · `03:00:00Z` C29 | - |
| leituras que não gravam trilha (8) | C7, table-driven over all 8: quatro perfis, banco vazio e banco cheio | - |
| tabelas que a leitura não muda (4) | `students` C56 · `enrollments` C56 · `plans` C56 · `payments` C56 | - |
| formas que o schema aceita (3) | quatro chaves C46 · três chaves C46 · duas chaves C46 | - |
| chaves obrigatórias do schema (24) | C46, table-driven over all 24, uma falta por vez | - |
| chave a mais, por objeto do schema (9) | C46, table-driven over all 9 objetos, com `checkIns` no topo e `expired` em `enrollments` | - |
| card `null` (2) | `enrollments` C46 · `payments` C46 | - |
| contagem inválida (3) | `-1` C46 · `1.5` C46 · `"3"` C46 | - |
| cards por perfil, na tela (4) | `admin` cinco C52 · `hr_finance` cinco C52 · `reception` quatro C42 · `instructor` um C41 | - |
| títulos dos cards (5) | "Alunos" C33 · "Matrículas" C34 · "Vencimentos nos próximos 7 dias" C35 · "Pagamentos" C38 · "Matrículas ativas por plano" C39 | - |
| cabeçalho da página (3) | "Olá, <nome>." C32 · "Painel" C32 · "Situação em dd/MM/aaaa" C32 | - |
| rótulos do card "Alunos" (4) | "Ativos" C33 · "Inativos" C33 · "Suspensos" C33 · link "Ver alunos" C33 | - |
| rótulos do card "Matrículas" (2) | "Ativas" C34 · "Agendadas" C34 | - |
| colunas de vencimentos (3) | "Aluno" C35 · "Plano" C35 · "Vence em" C35 | - |
| formatos da linha de vencimento (3) | nome como link para a ficha C36 · `<nome> · <periodicidade>` C36 · `dd/MM/aaaa` C36 | - |
| card "Pagamentos" (4) | "Pendentes" C38 · link `?status=pending` C38 · "Atrasados" C38 · link `?status=overdue` C38 | - |
| colunas por plano (2) | "Plano" C39 · "Matrículas ativas" C39 | - |
| estados de `/` em `Observable` (6) | vazio C37, C40, C33 · carregando n/a, página no servidor C32 · erro C43 · sem permissão C44, C41, C42 · densidade e ordem C52, C35, C39 · ação destrutiva n/a, a tela só lê C55 | - |
| resposta que não é `200` (2) | `500` C43 · `403` C43 | - |
| card pela chave, não pelo perfil (2) | sem `payments` C53 · sem `enrollments` e sem `payments` C53 | - |
| texto livre com marcação (3) | aluno na tabela de vencimentos C54 · plano na tabela de vencimentos C54 · plano na tabela por plano C54 | - |
| o que `/` pede à API, por perfil (4) | `admin` C55 · `hr_finance` C55 · `reception` C55 · `instructor` C55 | - |
| decisões da API em `Observable` (5) | forma da resposta C2, C3, C4, C47 · erro e códigos C5, C6 · quem chama C1 · versão n/a, um consumidor só C57 · limite de taxa n/a, fica em `operacao` C5 | - |
| decisões das coleções em `Observable` (5) | agrupamento C2, C3, C4 · nomes C33, C34, C35, C38, C39 · ordem C20, C28 · duplicados C51 · a exceção que não cabe C17, C49 | - |
| rota no OpenAPI (1) | `GET /api/dashboard` C57 | - |
| startup config: módulo do painel montado (2 assemblies) | harness de `apps/api` (`startStack`) C1 · stack do compose C58 | - |
| startup config: rota nova pela origem do web (2 assemblies) | build de produção do web contra a `FakeApi` C32 · container `web` da stack C58 | - |

- Claims naming a status code, route or response shape: C1 a C31, C47 a C51, C56 e C57 cruzam a fronteira HTTP da API montada pelo `startStack`; C32 a C44 e C52 a C55 cruzam a fronteira do web no navegador, sobre o build de produção; C58 cruza as duas no processo real da stack. C45 prova a conta no próprio nível, sem banco e sem HTTP, e a fronteira dela é a C14 a C19; C46 prova o schema no próprio nível, e a fronteira dele é a C2 a C4 e a C47. A tela não refaz conta: só mostra o que a API devolve (C33 a C40, com números que a máquina não calcularia)
- Linhas de `Impact` e onde cada uma é provada: o termo `dashboard`, nome da rota e do schema C1, C46; `expiringSoon` por `endsAt` e não por `dueDate` C45, C14 (os períodos da C14 têm `startsAt` anterior a D, e nenhum sai por estar atrasado); matrícula é um período, e "matrículas ativas" conta períodos C11, C51; uma rota e um schema novos, nenhum código de erro novo C5, C6 (os dois códigos são os da `auth-rbac`); `AUDIT_ACTIONS` em 38, pela prova existente abaixo; `/` troca o texto antigo pela saudação e pelo painel C32; `shell.spec.ts` segue abrindo `/` para conferir o menu, pelas provas existentes abaixo; nenhuma rota existente muda de assinatura C25, C50 (as duas leem `GET /api/payments` e `GET /api/students/:id/enrollments` como estão); o menu não muda, pelas provas existentes de `shell.spec.ts`; uma chamada a mais por abertura de `/` C55; o portão C57 e o gate do `pnpm verify`; nenhuma variável, migração nem extensão C58 (a stack sobe com o `.env.example` e as migrações de antes) e C56; nada guardado nem em cache, os números mudam à meia-noite C18, C19, C26, C48, C56; a linha de `.specs` já está feita (AD-070 e `ROADMAP.md`) e não é check
- `Assumptions` e onde cada uma landou: "Sem check-ins" C46 (`checkIns` recusada) e C52 (cinco cards, nenhum de check-in); "Onde o painel mora" C32, C55 (em `/`; o menu, pelas provas existentes de `shell.spec.ts`); "Matrículas por situação" C12, C46 (`expired` recusada em `enrollments`); "Período que vence e já foi renovado" C49; "Aluno inativo ou suspenso" C11, C14, C23, C25; "Matrículas por plano" C27 a C31, C39, C40; "Tamanho da lista de vencimentos" C14 (todos os itens da janela numa resposta, sem chave de paginação: as chaves são as da C47); "Links do card Alunos" C33 (um link só). Não viram check, por decisão do plano: "Meta de desempenho (PRD §4)" e "Pendências sem dono do Handoff"
- **Teste existente que o Build edita** porque o claim dele muda pelo plano; o nome fica e nenhuma asserção é afrouxada: `enrollment.test.ts`, `admin_without_2fa_gets_403_everywhere_else`, cuja lista escrita à mão ganha `GET /api/dashboard` (o laço já chama a rota nova sozinho; sem a linha, a igualdade da lista reprova)
- **Provas existentes que seguem como estão e passam a valer também aqui**: `only_four_routes_answer_without_session` de `access.test.ts` (percorre todas as rotas registradas, a nova inclusive, e segue com quatro abertas: prova citada na C5); `paths_equal_registered_api_routes` de `openapi.test.ts` (citada na C57); `audit_actions_end_with_two_payment_actions_in_order` de `contracts.test.ts` (`AUDIT_ACTIONS` com 38 valores: reprova se o painel ganhar uma ação); os oito pontos de `shell.spec.ts` que abrem `/` e conferem o menu, e `home_redirects_to_login` de `compose.test.ts`
- Suítes de tela que abrem `/` sem conhecer a rota nova (`shell.spec.ts` em oito pontos, `login.spec.ts` em um, `proxy.spec.ts` em dois): a `FakeApi` responde `404` ao que não conhece, então nelas a página aparece no estado de erro da C43, com a saudação e o menu. Nenhuma asserção delas fala do painel; se alguma reprovar (um botão "Tentar novamente" a mais é o que já aconteceu uma vez, na `pagamentos`), o conserto é a `FakeApi` daquele teste responder à rota nova, nunca mudar a asserção
- Além do texto das AC, derivado da door, das `Assumptions`, da `Observable` ou das lições, e que o Build pode discutir antes de fechar: `days` como inteiro positivo (C46, C35); o empate provado contra a ordem de inserção (C20, C28); as chaves aninhadas exatas e os cards iguais entre perfis (C47); a virada do `startsAt` e do card por plano (C48); o período renovado (C49); o acordo com a ficha de matrículas (C50); o período com várias linhas em `payments` (C51); a ordem dos cards (C52); o card pela chave (C53); a marcação nos nomes (C54); a chamada única (C55); a leitura que não muda linha (C56)
- Decisões que o plano deixa fora de AC e que nenhum check afirma: o que a tela faz com um `200` fora do contrato; a leitura única do relógio dentro de uma resposta (decisão 2 da Intent); o `403 forbidden`, que não tem quem o provoque (decisão 3); o que a rota responde a uma query desconhecida (não há entrada a validar, e o repositório ignora o que não declara); quantas consultas o módulo faz ao banco
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md`, `alunos`, `planos-matriculas` e `pagamentos` seguem valendo e respondem as duas perguntas para o que esta feature reaproveita: a rota que decide, alcançada por HTTP, com o corte por perfil (como `ficha_instructor_three_keys_only`); a conta pura com a prova na fronteira; o valor que depende do dia, nos dois lados da virada; o filtro e a ordem por um valor calculado, com a comparação entre duas rotas; a tela contra a `FakeApi`; a stack lida por `psql`. Uma situação nova fica sem resposta e ganha linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Contagem agregada, feita em código sobre linhas lidas do banco, de um valor calculado do dia (os números de `enrollments` e de `payments`, a janela e o agrupamento por plano) | uma prova de fronteira por chave contada, com o relógio controlado e números distintos por chave, conferidos por igualdade exata do objeto; **e** cada limite que depende de hoje nos dois instantes da virada; **e** uma prova que compara cada contagem com a rota que já lista a mesma coisa; **e** um caso em que a linha contada tem várias linhas filhas | cada valor da situação contado ou deixado fora (quatro de `enrollmentStatus`, quatro de `paymentStatus`); cada borda da janela (hoje menos 1, hoje, hoje mais 7, hoje mais 8); os seis limites de dia às `02:59:59Z` e às `03:00:00Z`; as duas ordens com o empate contra a ordem de inserção. A prova da rota que lista não substitui a do painel: ela passa por um caminho dele, e é a igualdade entre as duas (C25, C50) que pega uma segunda conta escrita em SQL; o caso das linhas filhas (C51) é o que pega um `join` que multiplica |

Evidence (o código novo ainda não existe; a contagem vem do plano e do que ele reaproveita, em `packages/contracts/src/plans.ts`, `payments.ts` e `apps/api/src/student-payments`):

- conta do vencimento próximo: 2 limites (piso pela `enrollmentStatus`, teto por `addDays`), 1 constante, 13 linhas (C45) -> decide, numa função sem dependência; é a terceira conta de data do repositório, depois de `enrollmentStatus` e `paymentStatus`
- schema da resposta: 2 chaves opcionais, 24 obrigatórias, 9 objetos estritos, 8 contagens (C46) -> decide (aceita e recusa)
- módulo do painel: 1 corte por perfil com 4 perfis e 2 chaves opcionais; 3 contagens de aluno por uma coluna guardada; 2 contagens por `enrollmentStatus`; 1 filtro de janela com 2 limites; 2 contagens por `paymentStatus`; 1 agrupamento por plano; 2 ordenações com desempate; 1 leitura do relógio (C1 a C31, C47 a C51) -> decide
- o controller do painel: uma rota sem entrada, que repassa o perfil ao serviço e declara `@Roles` e `@Output` -> instrumentação, coberta pelas C1 a C6 e pela C57
- tela: 1 página, 5 cards condicionais a 2 chaves, 2 tabelas com estado vazio, 1 estado de erro, 4 links, 3 formatos (C32 a C44, C52 a C55) -> decide, na tela
- closest analogue in the repo: `apps/api/test/payments-read.test.ts` (`open_list_filter_pending_and_overdue_across_sao_paulo_midnight` e `open_list_and_ficha_agree_on_status_across_sao_paulo_midnight`: o valor calculado do dia lido em código, nos dois instantes, com o acordo entre duas rotas) ao lado de `apps/api/test/students-read.test.ts` (`ficha_instructor_three_keys_only`: a chave que o perfil não lê não existe) e de `packages/contracts/test/plans.test.ts` (`enrollment_status_thirteen_rows_around_both_edges_and_sao_paulo_midnight`: a conta pura em linhas de tabela)

Cost: 1 arquivo novo de teste em `packages/contracts`, 1 de API com uma subida de Postgres, 1 de tela com o apoio dele, 1 caso na stack e 1 teste no `openapi.test.ts`. Sem a linha acima, as contagens seriam provadas com um período por situação no dia em que o teste rodou: uma contagem em SQL com `current_date` passaria até a primeira virada, e um `join` com `payments` passaria até o primeiro pagamento desfeito. A linha fica neste arquivo; escrevê-la nas diretrizes do repositório alcança todo agente futuro e pede o aval do usuário, então o Build roda sob ela e deixa os arquivos de diretriz como estão.

## Swept

- validation: C46 (o schema recusa cada chave que falta, cada chave a mais, o card `null` e a contagem inválida); a rota não tem entrada (Surface "In: nada")
- failure modes: C43 (a API que não responde `200` à tela), C5, C6
- idempotency: n/a - a rota só lê; ler de novo no mesmo instante devolve o mesmo corpo, e nada é gravado (C7, C56)
- authorization: C1 a C6, C41, C42, C44, C53; existing - a guarda global (AD-022) pela prova `only_four_routes_answer_without_session`, que chama `GET /api/dashboard` sem sessão, e pela `admin_without_2fa_gets_403_everywhere_else`, que a chama sem 2FA
- concurrency: n/a - nenhuma escrita e nenhuma trava; a leitura concorrente com uma matrícula ou uma confirmação vê o banco antes ou depois dela, e os dois são respostas certas
- data lifecycle: C56 - o painel não cria, não muda e não apaga linha, e nada é guardado nem posto em cache; os números mudam à meia-noite sem que linha nenhuma mude (C18, C19, C26, C48)
- dependency failure: C43 (a API fora para a tela); existing - banco fora na consulta cai no `500 internal_error` do `ProblemFilter`, pela prova `unhandled_500_hides_exception` da `fundacao`, que exercita o filtro e não esta rota
- state transitions: C18, C19, C26, C48, C50 - as situações são calculadas e mudam com o dia: `scheduled` para `active`, `active` para `expired`, `pending` para `overdue`, e a entrada e a saída da janela, cada uma nos dois instantes da virada
- observability: C7 - a leitura não grava na trilha, por decisão da door 1 (a AD-057 vale para dado de funcionário e exportação); nenhum requisito de log neste slice

## Handoff

- Tamanhos, medidos com `wc -c` no que já existe e estimados (KB de código e teste novos, dividido por quatro) no que será escrito; os documentos que o builder lê somam `checks.md` (54 KB) + `plan.md` (25 KB) + o trecho de `STATE.md` que importa (~10 KB) = 89 KB = 22k
- **Arquivos existentes**: S0 = 30 KB (`plans.ts` 6,9, `payments.ts` 4,1, `person.ts` 2,3, `index.ts` 0,4 e `students.ts` 10,8 de `contracts/src`; `plans.test.ts` 3,1 e `payments.test.ts` 2,5 como molde); S1 a S5 = 88 KB (o serviço 8,4 e o controller 3,0 de `student-payments` como molde, `app.module.ts` 6,0, `access.ts` 5,4, `students.view.ts` 1,3; `payments-read.test.ts` 16,1 como molde, `enrollment.test.ts` 4,8, `openapi.test.ts` 15,8, `access.test.ts` 5,6; `support/plans.ts` 7,8, `support/payments.ts` 4,0, `support/students.ts` 4,2, `support/stack.ts` 3,9, `support/audit.ts` 1,8); S6 = 56 KB (`page.tsx` 0,4, `payments/page.tsx` 3,2 e `payments-load-error.tsx` 0,5 como molde, `lib/payments.ts` 0,7, `lib/payments-server.ts` 0,7, `lib/plans.ts` 1,9, `lib/students.ts` 3,1, `lib/api.ts` 2,3, `lib/session.ts` 1,9, `shell.tsx` 2,1, `proxy.ts` 1,7; `fake-api.ts` 9,9, `support/payments.ts` 6,7, `support/plans.ts` 8,2, `shell.spec.ts` 5,0 e `payments.spec.ts` 7,6 como molde); S7 = 58 KB (`compose.test.ts` 53,3, de que o caso da `pagamentos`, linhas 859 a 1003, é o molde, e `tests/stack/support.ts` 4,2). Total 232 KB = 58k
- **Código novo**: S0 = 2k (a constante, a conta e o schema em `contracts/src`, e `dashboard.test.ts`), S1 = 4k (o módulo, o controller, o corte por perfil e a preparação do arquivo de teste), S2 = 1k, S3 = 5k, S4 = 2k, S5 = 2k, S6 = 8k (a página, os cards, o bloco de erro, `lib`, `dashboard.spec.ts` e o apoio), S7 = 3k (o teste do OpenAPI e o caso da stack). Total 27k
- S0 = 2k + 8k lidos, tudo em `packages/contracts`; S1 a S5 entram em `apps/api` aos 10k + 14k + 22k = 46k; S6 entra em `apps/web` aos 46k + 8k + 14k = 68k; S7 fecha na stack aos 68k + 3k + 14k = 85k; com os documentos, **58k + 27k + 22k = 107k**, abaixo do orçamento de 150k, com 43k de folga para a saída das execuções - one builder
- Mechanism: one builder (a conta cabe; sem pergunta)
- Ordem: S0 primeiro (a constante, a conta e o schema, de que a rota e a tela dependem), depois S1 (a rota com o corte por perfil e `today`), S2 a S5 (os cards, cada um sem tocar os outros; S5 é P2 e sai sem mexer nos demais), S6 (a tela) e S7. No mesmo commit da rota entram a linha `GET /api/dashboard` na lista de `enrollment.test.ts` e o teste do OpenAPI, ou as duas suítes reprovam com a rota registrada
- Conferir antes de cada trecho: antes da S1, que o módulo lê `saoPauloToday()` uma vez e passa o dia às duas contas e à do vencimento próximo; antes da S3 e da S4, que nenhuma consulta classifica por data em SQL (nem `current_date`, nem `CASE` sobre `ends_at` ou `starts_at`) e que as confirmações vivas são lidas à parte, como `aliveOf` do serviço de pagamentos, e não por `join` que multiplique o período (C51); antes da S6, que a página segue a chave da resposta e não o perfil da sessão (C53) e que `PERIOD_LABELS` e a formatação de data são as de `lib/plans.ts` e `lib/students.ts`
- O Verifier não é do builder: quem tem a feature inteira o dispara depois do último commit, sobre `<base da feature>..HEAD`, com os 58 checks
