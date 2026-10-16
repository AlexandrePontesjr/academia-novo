# Check-in - checks

Profile: standard
Plan: `.specs/features/check-in/plan.md`

## Intent

107 checks em 11 slices (S0, as 9 do plano e S10 de montagem, regressão e stack) · 4 one-way doors · 0 open, of which 0 block

O plano foi aprovado como escrito em 2026-10-16. As duas perguntas foram respondidas "não": pagamento `overdue` não bloqueia (AC 7) e desfazer presença fica fora desta versão. As Assumptions estão marcadas como confirmadas, as doors 1 a 4 são as AD-071 a AD-074 em `STATE.md` e a linha 11 do `ROADMAP.md` registra que `checkIns` vai a `admin` e `reception`. O perfil é `standard`, como nas features anteriores. O que o `light` não pega (um membro enumerado sem prova e um teste que passa sob uma implementação errada) é o que esta feature erra em silêncio: um motivo de bloqueio que só o `GET` respeita, e um "hoje" que só vira na meia-noite UTC.

Seis coisas que o plano deixa em aberto e que este arquivo fixa, para a revisão aceitar ou trocar antes do Build:

1. **`check_in_blocked` vem antes de `already_checked_in`.** Aluno que já entrou hoje e depois foi inativado recebe `409 check_in_blocked` no `POST`. É a ordem do Flow (passo 4: a decisão da door 2 é refeita antes do insert) e o que o cartão mostra (AC 55 antes da AC 57) (C89).
2. **`404` cobre também o `id` que não é `uuid`, nas três rotas aninhadas, e quem prova que a rota existe é o `403` com o `uuid` de ninguém.** O Nest responde `404 not_found` a rota que não existe, e os Verifiers da `planos-matriculas` já apontaram isso. A guarda por perfil roda antes do handler, então `hr_finance` com um `uuid` desconhecido recebe `403`, não `404` (C13, C23, C32, C90).
3. **A trava `FOR UPDATE` do `POST` contra uma inativação concorrente não tem prova de fora.** As duas ordens possíveis dão respostas certas (presença antes da inativação, ou `409` depois dela). O que se prova é a unicidade sob corrida, pelo índice (C20), e a decisão refeita no `POST` (C18, C22). A trava fica para o diff, como a decisão 3 da `pagamentos`.
4. **O empate das duas ordenações é provado com `id` escolhido pelo teste**, de modo que a ordem de inserção seja a inversa da do `id` (C28, C36), como na `dashboard`.
5. **"`day` gravado pela API" é provado pela diferença entre os dois relógios.** O teste move só o relógio da API, e o `now()` do banco segue no dia real da máquina. Uma presença registrada às `2026-10-08T03:00:00Z` do relógio da API tem `day` igual a `2026-10-08`, qualquer que seja o dia do banco (C21, C77). Um `day` gerado pelo banco reprova.
6. **`HH:mm` em `America/Sao_Paulo` é provado com um instante cujo dia UTC é outro.** `2026-10-08T02:30:00Z` aparece como `23:30`, nas três telas (C57, C58, C62, C68). Um horário formatado em UTC mostraria `02:30`.

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`, `playwright test <arquivo> -g`).

Arquivos novos do Build:
- `packages/database/test`: `check-ins.test.ts`
- `packages/contracts/test`: `check-in.test.ts`
- `apps/api/test`: `check-in-status.test.ts`, `check-ins-write.test.ts`, `check-ins-read.test.ts` (histórico e relatório) e `support/check-ins.ts`
- `apps/web/e2e`: `check-in.spec.ts`, `student-check-ins.spec.ts`, `check-ins.spec.ts` e `support/check-ins.ts`

Testes existentes que ganham casos ou são editados, como descrito abaixo da `Coverage`:
- `packages/contracts/test/dashboard.test.ts`
- `apps/api/test`: `dashboard.test.ts`, `enrollment.test.ts` e `openapi.test.ts`
- `apps/web/e2e`: `dashboard.spec.ts`, `shell.spec.ts`, `support/dashboard.ts` e `support/fake-api.ts`, se a rota nova precisar de resposta padrão
- `tests/stack/compose.test.ts`

As regras de `features/auth-rbac/checks.md`, `auditoria`, `alunos`, `foto-pipeline`, `planos-matriculas`, `pagamentos` e `dashboard` seguem valendo sem mudança:
- Postgres real por `testcontainers` (AD-012)
- sessão real de cada perfil (`stack.session(role)`, com 2FA já ativo para `admin`) e `Origin` igual a `WEB_ORIGIN`
- contagem de `audit_logs` como diferença (`auditCount`)
- dois pedidos soltos juntos por uma barreira (`releasedTogether`)
- relógio controlado só em `Date` (`clockAt`)
- nas telas, a `FakeApi` que registra método, caminho, query e corpo

Regras próprias:

- A numeração acompanha o plano: **C1 a C76 provam a AC de mesmo número** (C33 é a AC 33). C77 a C84 (S0) são o que o plano deriva do banco, da conta e do contrato. C85 a C97 são o que as doors, a `Observable`, as decisões da Intent e as lições L-019, L-025 a L-033 pedem além do texto das AC, cada um dentro do slice a que pertence. C98 a C107 (S10) são a montagem, a regressão e a stack.
- O relógio está em `2026-10-07T15:00:00Z` (`NOON`), salvo quando o caso diz outra coisa, e então **D** é `2026-10-07`. A virada do dia é às 03:00 UTC: `2026-10-08T02:59:59Z` (`BEFORE_TURN`) ainda é D, e `2026-10-08T03:00:00Z` (`AFTER_TURN`) já é D+1 (`2026-10-08`). Cada requisição feita depois de mover o relógio usa uma sessão aberta naquele instante, e todo caso de virada confere também o `today` (ou o `day`) da mesma resposta.
- O relógio do banco não segue o do teste. `checkedInAt` vem do `now()` do banco e é conferido entre T0 e T1, lidos do banco antes e depois da requisição. `day` vem do relógio da API (decisão 5 da Intent).
- "Mensal" de teste é um plano `monthly` de `9990`. Aluno vem de `insertStudents`, período de `insertEnrollment` e presença feita fora da rota de `insertCheckIn` (`support/check-ins.ts`: aluno, `day`, `checkedInAt`, autor e, quando o caso pede, `id`), todos por SQL. Usa-se um aluno por período quando os períodos não podem se tocar (AD-062). Períodos cancelados podem se tocar.
- "Linha de presença" é lida por SQL como `to_jsonb(check_ins)`. "Nada gravado" é a contagem e as linhas de `check_ins` iguais às de antes, mais a contagem de `audit_logs` igual (`checkInSnapshot`, L-028).
- "Autor" é o `id` do usuário da sessão que chamou. As chaves de resposta são conferidas por igualdade exata do conjunto, e os objetos com mais de uma contagem por `toEqual` do objeto inteiro.
- Nas telas, as respostas são as que o teste entrega à `FakeApi`, com valores que a máquina não calcularia: a tela não refaz conta nenhuma (nem a liberação, nem o total).

### S0 - A tabela, a conta da liberação e o contrato · 12 files · 71 KB · ~3k

**C77** - Depois da `0010`, `check_ins` tem exatamente as cinco colunas da door 1:
- `id` (`uuid`, v7)
- `student_id` (`uuid`, `NOT NULL`)
- `day` (`date`, `NOT NULL`, sem padrão e sem expressão gerada)
- `checked_in_at` (`timestamptz`, `NOT NULL`, padrão do relógio do banco)
- `checked_in_by` (`uuid`, `NOT NULL`)

Não existem `status`, `voided_at` nem `tenant_id`. As duas chaves estrangeiras são `student_id` para `students(id)` e `checked_in_by` para `users(id)`, as duas com regra `NO ACTION` (door 1, Relations, AD-016).
Proof: `pnpm --filter "./packages/database" exec vitest run test/check-ins.test.ts -t "check_ins_table_has_five_columns_two_foreign_keys_without_cascade_and_defaults"`

**C78** - Os índices únicos de `check_ins` são exatamente a chave primária e `check_ins_one_per_day_idx`, único sobre `(student_id, day)`, sem predicado. Uma segunda linha do mesmo aluno no mesmo `day` falha com `23505`. A do mesmo aluno em outro `day` e a de outro aluno no mesmo `day` entram (door 1).
Proof: `pnpm --filter "./packages/database" exec vitest run test/check-ins.test.ts -t "check_ins_one_per_day_idx_is_the_only_unique_index_besides_the_key_and_second_row_same_day_fails_23505"`

**C79** - Uma linha com `student_id` ou `checked_in_by` que não existe falha com `23503` e não grava nada. Apagar um aluno ou um usuário que tem presença falha com `23503`, e a presença fica idêntica (door 1, Impact `privacidade`).
Proof: `pnpm --filter "./packages/database" exec vitest run test/check-ins.test.ts -t "unknown_student_or_user_fails_23503_and_deleting_an_owner_with_check_ins_fails_23503"`

**C80** - A `0010` é a décima primeira entrada do diário. Aplicada sobre o banco já com as tabelas de `0001` a `0009` e com linhas, ela:
- cria só `check_ins`
- deixa as linhas e as colunas das outras tabelas e as extensões como estavam
- não muda nada numa segunda execução

(Impact "stored data", "ambiente")
Proof: `pnpm --filter "./packages/database" exec vitest run test/check-ins.test.ts -t "migration_0010_adds_only_check_ins_and_keeps_rows_and_extensions"`

**C81** - A conta única `checkInAccess(student, periods, today)` de `packages/contracts`, com hoje em `2026-10-07`, responde certo nas dezesseis linhas:
- aluno `active` com:
  - período `active` que cobre D com folga: `allowed`, `[]`
  - período que começa em D: `allowed`, `[]`
  - período que termina em D: `allowed`, `[]`
  - período que termina em `2026-10-06`: `blocked`, `[no_active_enrollment]`
  - período que começa em `2026-10-08`: `blocked`, `[no_active_enrollment]`
  - período cancelado que cobriria D: `blocked`, `[no_active_enrollment]`
  - nenhum período: `blocked`, `[no_active_enrollment]`
  - um vencido e um `active` ao lado: `allowed`, `[]`
  - um cancelado e um `active` ao lado: `allowed`, `[]`
- aluno `inactive`:
  - com período `active`: `blocked`, `[student_inactive]`
  - sem período: `blocked`, `[student_inactive, no_active_enrollment]`
  - com período vencido: `blocked`, `[student_inactive, no_active_enrollment]`
- aluno `suspended`:
  - com período `active`: `blocked`, `[student_suspended]`
  - só com período agendado: `blocked`, `[student_suspended, no_active_enrollment]`
- com hoje em `2026-10-08`, o período que termina em `2026-10-07`: `blocked`, `[no_active_enrollment]`
- com hoje em `2026-10-08`, o período que começa em `2026-10-08`: `allowed`, `[]`

Em toda linha, `access` é `allowed` se e somente se `blockReasons` é `[]`, e `blockReasons` não repete motivo (door 2, AC 2 a AC 6).
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/check-in.test.ts -t "check_in_access_sixteen_rows_three_student_statuses_four_period_situations_both_reasons_in_order"`

**C82** - Os schemas de `packages/contracts` das quatro rotas novas:
- aceitam a forma da `Surface`: as sete chaves da situação, com `photoUrl`, `enrollment` e `checkedInAt` iguais a `null` e preenchidos; as três do `201`; `items` e `nextCursor` do histórico; as cinco do relatório
- recusam a falta de cada chave obrigatória, uma por vez (L-032)
- recusam uma chave a mais em cada objeto estrito
- recusam em `access` um valor fora de `allowed` e `blocked`, e em `blockReasons` um fora dos três motivos
- no schema da query do relatório:
  - aceitam a ausência de `from`, `to` e `cursor`
  - aceitam `2024-02-29`
  - recusam `2026-02-29`, `2026-13-01`, `2026-10-7`, `26-10-07`, `2026-10-07T00:00:00Z` e vazio, cada um com um item em `errors` do `path` do parâmetro
- o schema de `cursor` recusa o que não é `uuid`

(Surface, AD-011, AD-033, L-019)
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/check-in.test.ts -t "check_in_schemas_accept_the_surface_shapes_and_refuse_each_missing_key_extra_key_and_bad_value"`

**C83** - `dashboardResponseSchema` aceita as quatro formas por perfil da door 4:
- as cinco chaves de `admin`
- as quatro de `hr_finance`
- as quatro de `reception`, com `checkIns` e sem `payments`
- as duas de `instructor`

Aceita `checkIns.count` igual a `0`. Recusa `checkIns` igual a `null`, `checkIns` sem `count`, `checkIns` com uma chave a mais, e `-1`, `1.5` e `"3"` em `count` (door 4, AD-070, L-019).
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/dashboard.test.ts -t "dashboard_schema_accepts_check_ins_for_admin_and_reception_shapes_and_refuses_bad_check_ins"`

**C84** - `AUDIT_ACTIONS` continua com 38 valores, e os dois últimos são `student.payment_confirmed` e `student.payment_undone`: nenhuma ação de check-in existe (door 3, Impact "contrato").
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_two_payment_actions_in_order"`

### S1 - O balcão vê se o aluno pode entrar · 26 files · 193 KB · ~4k

**C1** - `GET /api/students/:id/check-in-status`, chamado como `admin` e como `reception` para um aluno que existe, responde `200` com exatamente as chaves `today`, `student`, `photoUrl`, `access`, `blockReasons`, `enrollment` e `checkedInAt`. `today` é `2026-10-07` e está no formato `aaaa-mm-dd`, e `student` tem exatamente `id`, `name` e `status`, com os valores do aluno (AC 1).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "status_200_for_admin_and_reception_with_seven_keys_and_today_in_sao_paulo"`

**C2** - Aluno `active` com período `active` em D: `access` é `allowed` e `blockReasons` é `[]` (AC 2).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "active_student_with_active_period_allowed_without_reasons"`

**C3** - Aluno `inactive` com período `active` em D: `access` é `blocked` e `blockReasons` é exatamente `["student_inactive"]` (AC 3).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "inactive_student_with_active_period_blocked_student_inactive"`

**C4** - Aluno `suspended` com período `active` em D: `access` é `blocked` e `blockReasons` é exatamente `["student_suspended"]` (AC 4).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "suspended_student_with_active_period_blocked_student_suspended"`

**C5** - Aluno `active` sem período `active` em D, nos quatro casos (sem período, só agendado para `2026-10-08`, só vencido em `2026-10-06`, só cancelado cobrindo D): `access` é `blocked` e `blockReasons` é exatamente `["no_active_enrollment"]` (AC 5).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "no_active_period_blocked_no_active_enrollment_four_cases"`

**C6** - Aluno `inactive` sem período e aluno `suspended` só com período vencido: `blockReasons` é exatamente `["student_inactive", "no_active_enrollment"]` e `["student_suspended", "no_active_enrollment"]`, nessa ordem e sem repetição (AC 6).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "student_reason_first_then_enrollment_reason_without_repetition"`

**C7** - Aluno `active` com período `active` em D e sem confirmação de pagamento, de `startsAt` em `2026-09-07`: o período é `overdue` em `GET /api/payments?status=overdue` lido como `hr_finance`, e `access` é `allowed` com `blockReasons` `[]` (AC 7, pergunta 1).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "overdue_payment_still_allowed_while_period_is_active"`

**C8** - Com período `active` em D, `enrollment` tem exatamente `id`, `plan` (exatamente `id`, `name`, `period`), `startsAt` e `endsAt`, com os valores do período. Renomeado o plano depois da matrícula, `plan.name` é o nome de agora. Sem período `active` (só vencido, e sem nenhum), `enrollment` é `null` (AC 8).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "enrollment_is_the_active_period_with_current_plan_name_or_null"`

**C9** - Com foto corrente, `photoUrl` é uma URL assinada que, pedida sem sessão, serve a imagem de 600×800, a variante `large`. Depois de trocada a foto, serve a nova. Sem foto, `photoUrl` é `null` (AC 9, AD-043).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "photo_url_serves_the_large_variant_of_the_current_photo_or_null"`

**C10** - Sem presença em D, `checkedInAt` é `null`. Com uma presença de `day` igual a `2026-10-06` e nenhuma em D, também é `null`. Registrada a presença pela rota, `checkedInAt` é igual ao `checkedInAt` do `201` (AC 10).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "checked_in_at_is_todays_check_in_or_null"`

**C11** - Os dois limites do período na virada do dia:
- período de `endsAt` igual a `2026-10-07`: `allowed` às `02:59:59Z` e `blocked` com `no_active_enrollment` às `03:00:00Z`
- período de `startsAt` igual a `2026-10-08`: `blocked` às `02:59:59Z` e `allowed` às `03:00:00Z`

O `today` de cada resposta é `2026-10-07` e `2026-10-08` (AC 11, L-025, L-026).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "access_follows_both_period_edges_at_the_sao_paulo_turn"`

**C12** - Com presença de `day` `2026-10-07`, `checkedInAt` vem preenchido na chamada das `02:59:59Z` e `null` na das `03:00:00Z` (AC 12).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "checked_in_at_cleared_at_the_sao_paulo_turn"`

**C13** - `hr_finance` e `instructor` recebem `403` com `code` `forbidden`, para um aluno que existe e para um `uuid` de ninguém (decisão 2 da Intent) (AC 13).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "hr_finance_and_instructor_403_forbidden_for_known_and_unknown_id"`

**C14** - Sem sessão, a resposta é `401` com `code` `unauthorized` (AC 14).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "anonymous_401_unauthorized"`

**C15** - `admin` e `reception` recebem `404` com `code` `not_found` para um `uuid` de ninguém e para um `id` que não é `uuid` (AC 15, decisão 2 da Intent).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "unknown_and_non_uuid_student_404_not_found"`

**C16** - As leituras que respondem `200` (os dois perfis, aluno liberado, bloqueado e já com presença) deixam `audit_logs` e `check_ins` com o mesmo número de linhas, e as linhas de `check_ins` idênticas (AC 16).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "status_reads_write_no_audit_and_no_check_in_row"`

**C85** - Para um período que termina em `2026-10-07` e um, de outro aluno, que começa em `2026-10-08`, nos três instantes `NOON`, `02:59:59Z` e `03:00:00Z`:
- `access` é `allowed` se e somente se o `status` do período em `GET /api/students/:id/enrollments` é `active`
- `enrollment.id` é o `id` desse período quando `allowed`

(door 2: a liberação vem de `enrollmentStatus`, não de uma segunda conta)
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-in-status.test.ts -t "status_and_enrollment_ficha_agree_across_sao_paulo_midnight"`

### S2 - Registrar a presença · 0 files · 0 KB · ~5k

**C17** - `POST /api/students/:id/check-ins`, sem corpo, como `admin` e como `reception`, para um aluno liberado sem presença em D:
- responde `201` com exatamente `id`, `day` igual a `2026-10-07` e `checkedInAt`, entre T0 e T1 do banco
- grava exatamente uma linha em `check_ins`, com esse `id`, o `student_id` do aluno, esse `day` e `checked_in_by` igual ao autor

(AC 17)
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "check_in_201_for_admin_and_reception_with_three_keys_and_one_row_by_the_author"`

**C18** - Os seis casos de bloqueio da C5 e da C3 a C4 respondem `409` com `code` `check_in_blocked`, num corpo que o `problemSchema` aceita, e deixam `check_ins` como estava. Os casos são: aluno `inactive` com período, aluno `suspended` com período, e aluno `active` sem período, só agendado, só vencido e só cancelado (AC 18, Test policy).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "blocked_student_409_check_in_blocked_six_cases_and_nothing_written"`

**C19** - Um segundo `POST` do mesmo aluno em D responde `409` com `code` `already_checked_in`, num corpo que o `problemSchema` aceita, e deixa `check_ins` como estava. Vale tanto para a primeira presença registrada pela rota quanto para a posta por SQL (AC 19).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "second_check_in_same_day_409_already_checked_in_and_nothing_written"`

**C20** - Dois `POST` do mesmo aluno liberado, soltos juntos por uma barreira, em dez rodadas, um como `admin` e outro como `reception`. Cada rodada termina com exatamente um `201` e um `409` `already_checked_in`, nunca `5xx`, e com exatamente uma linha do aluno em `check_ins` (AC 20, door 1).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "two_simultaneous_check_ins_one_201_one_409_over_ten_rounds"`

**C21** - Com presença registrada em `2026-10-07`:
- o `POST` das `02:59:59Z` responde `409` `already_checked_in`
- o das `03:00:00Z` responde `201` com `day` igual a `2026-10-08`

A linha nova tem `day` `2026-10-08` enquanto o `now()::date` do banco, lido na mesma rodada, é outro dia (AC 21, decisão 5 da Intent).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "next_day_check_in_allowed_at_the_sao_paulo_turn_with_day_from_the_api_clock"`

**C22** - Com um aluno, para cada instante, cujo único período termina em `2026-10-07`:
- o `POST` das `02:59:59Z` responde `201`
- o das `03:00:00Z` responde `409` `check_in_blocked`

Com o período que começa em `2026-10-08`, as respostas são `409` `check_in_blocked` e `201` (AC 22, L-025, L-026).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "check_in_follows_both_period_edges_at_the_sao_paulo_turn"`

**C23** - `hr_finance` e `instructor` recebem `403` com `code` `forbidden`, para um aluno liberado e para um `uuid` de ninguém, e `check_ins` fica como estava (AC 23, decisão 2 da Intent).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "hr_finance_and_instructor_403_forbidden_and_nothing_written"`

**C24** - Sem sessão, a resposta é `401` com `code` `unauthorized`, e nada é gravado (AC 24).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "anonymous_401_unauthorized_and_nothing_written"`

**C25** - Para um `uuid` de ninguém e para um `id` que não é `uuid`, a resposta é `404` com `code` `not_found`, e nada é gravado (AC 25).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "unknown_and_non_uuid_student_404_and_nothing_written"`

**C26** - O `POST` que responde `201` deixa `audit_logs` com o mesmo número de linhas de antes (AC 26, door 3).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "check_in_201_writes_no_audit_row"`

**C86** - Um `POST` com corpo `{ "studentId": "<outro>", "day": "2026-10-01", "checkedInBy": "<outro usuário>" }` responde `201` e grava a linha com o aluno da URL, `day` igual a `2026-10-07` e o autor da sessão. O corpo não entra na linha (Surface "sem corpo", AD-004).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "body_fields_are_ignored_student_day_and_author_come_from_url_clock_and_session"`

**C87** - Um `POST` com `Origin` de outra origem, e um sem `Origin`, respondem `403` com `code` `csrf_rejected`, e nada é gravado (Surface, AD-020, L-033).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "foreign_or_missing_origin_403_csrf_rejected_and_nothing_written"`

**C88** - Nenhum desfecho do `POST` grava em `audit_logs`: `201`, `409` `check_in_blocked`, `409` `already_checked_in`, `403`, `404` e `401`, cada um como diferença de contagem igual a `0` (door 3, L-028).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "no_check_in_outcome_writes_an_audit_row_six_outcomes"`

**C89** - Aluno que tem presença em D e depois é inativado pela rota que já existe: o `POST` seguinte responde `409` com `check_in_blocked`, não `already_checked_in`, e a situação responde `blocked` com `checkedInAt` preenchido (decisão 1 da Intent, Flow passo 4).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "blocked_takes_precedence_over_already_checked_in"`

### S3 - Histórico de presença do aluno · 0 files · 0 KB · ~3k

**C27** - `GET /api/students/:id/check-ins` como `admin` e `reception` responde `200` com exatamente `items` e `nextCursor`:
- cada item tem exatamente `id`, `day`, `checkedInAt` e `checkedInBy`, e `checkedInBy` tem exatamente `id` e `name`
- os itens são só os do aluno: com três presenças dele e duas de outro, são três
- renomeado o usuário que registrou, `checkedInBy.name` é o nome de agora

(AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "history_200_only_this_students_items_with_four_keys_and_current_author_name"`

**C28** - `items` sai em `checkedInAt` decrescente e, no empate, em `id` decrescente. A prova usa três presenças em dias distintos, inseridas fora de ordem, e um par com o mesmo `checkedInAt` (dias diferentes), cujos `id` o teste escolhe para que a inserção seja a inversa do `id` (AC 28, decisão 4 da Intent).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "history_ordered_by_checked_in_at_desc_then_id_desc_against_insertion_order"`

**C29** - Paginação do histórico:
- com 50 presenças, uma página de 50 e `nextCursor` `null`
- com 51, 50 e `nextCursor` preenchido, e a página seguinte, pedida com ele, traz a 51ª e `nextCursor` `null`
- percorridas as páginas de 120 presenças com empates de `checkedInAt`, cada presença aparece uma vez só
- uma presença nova inserida entre as duas páginas não desloca a segunda

(AC 29, L-019)
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "history_cursor_50_51_walks_every_row_once_and_new_rows_do_not_shift_the_next_page"`

**C30** - Aluno sem presença: `items` é `[]` e `nextCursor` é `null` (AC 30).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "history_empty_items_and_null_cursor"`

**C31** - `cursor` igual a `abc`, a um `uuid` de ninguém e ao `id` de uma presença de outro aluno: `422` com `code` `validation_failed` e um item em `errors` de `path` `cursor`, nos três casos (AC 31).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "history_cursor_never_issued_422_three_cases"`

**C32** - Recusas do histórico (AC 32, decisão 2 da Intent):
- `hr_finance` e `instructor`: `403` `forbidden`, com aluno que existe e com `uuid` de ninguém
- sem sessão: `401` `unauthorized`
- `admin` com `uuid` de ninguém e com `id` que não é `uuid`: `404` `not_found`

Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "history_403_401_404"`

### S4 - Relatório de presença por período · 0 files · 0 KB · ~4k

**C33** - Com presenças em `2026-10-05`, `2026-10-06`, `2026-10-07` e `2026-10-08`, `GET /api/check-ins?from=2026-10-06&to=2026-10-07`, como `admin` e `reception`, responde `200` com exatamente `from`, `to`, `total`, `items` e `nextCursor`. `items` traz só as presenças de `2026-10-06` e `2026-10-07`, as duas pontas incluídas. Cada item tem exatamente `id`, `day`, `checkedInAt`, `student` (exatamente `id`, `name`) e `checkedInBy` (exatamente `id`, `name`) (AC 33).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_200_both_ends_included_with_five_keys_and_item_keys"`

**C34** - Com 53 presenças no período, `total` é `53` na primeira página (50 itens) e na segunda (3 itens), e presenças fora do período não entram nele (AC 34).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_total_is_the_whole_period_on_every_page"`

**C35** - Padrões do relatório:
- sem parâmetro: `from` e `to` são `2026-10-07`, e `items` é o mesmo que com `from=2026-10-07&to=2026-10-07`
- só com `from=2026-10-01`: `to` é `2026-10-07`
- só com `to=2026-10-06`: `from` é `2026-10-06`

(AC 35)
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_defaults_to_today_and_from_defaults_to_to"`

**C36** - `items` sai em `checkedInAt` decrescente e, no empate, em `id` decrescente, contra a ordem de inserção, com `id` escolhidos pelo teste. São 50 por página, e o `nextCursor` percorre 120 presenças sem repetir nem pular (AC 36, decisão 4 da Intent).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_ordered_desc_then_id_desc_fifty_per_page_cursor_walks_every_row_once"`

**C37** - `from` igual a `2026-02-29`, `2026-13-01`, `2026-10-7` e `abc` recebe `422` `validation_failed` com um item em `errors` de `path` `from`. O mesmo vale para `to`, com `path` `to`. `from=2024-02-29&to=2024-02-29` responde `200` (AC 37, L-019).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_bad_dates_422_on_their_path_and_leap_day_200"`

**C38** - Com `from=2026-10-08&to=2026-10-07`, e só com `from=2026-10-08` (o `to` padrão é `2026-10-07`), a resposta é `422` `validation_failed` com um item em `errors` de `path` `to`. Com `from` igual a `to`, `200` (AC 38).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_from_after_to_422_on_to_and_equal_ends_200"`

**C39** - O tamanho do período, as duas pontas contadas, dos dois lados do limite (AC 39, L-019):
- `from=2025-10-07&to=2026-10-07`, 366 dias: `200`
- `from=2023-03-01&to=2024-02-29`, 366 dias com o 29 de fevereiro: `200`
- `from=2025-10-06&to=2026-10-07`, 367 dias: `422` `validation_failed` com um item de `path` `from`

Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_366_days_200_and_367_days_422_on_from"`

**C40** - Período sem presença: `total` é `0`, `items` é `[]` e `nextCursor` é `null` (AC 40).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_empty_period_total_zero"`

**C41** - `hr_finance` e `instructor` recebem `403` `forbidden`, e sem sessão a resposta é `401` `unauthorized` (AC 41).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_403_for_hr_finance_and_instructor_and_401_anonymous"`

**C90** - No relatório, `cursor` igual a `abc` e a um `uuid` de ninguém responde `422` `validation_failed` com `path` `cursor`. Um cursor emitido para `from=2026-10-01&to=2026-10-07` e reusado com `from=2026-10-01&to=2026-10-03` não repete item já entregue (Surface `cursor?`, AC 29 aplicada à AC 36).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_cursor_never_issued_422_and_reused_cursor_repeats_nothing"`

**C91** - Sem parâmetro, o relatório chamado às `02:59:59Z` responde `from` e `to` iguais a `2026-10-07`, com a presença de `2026-10-07`. Chamado às `03:00:00Z`, responde `2026-10-08`, sem ela (L-025: o padrão de `to` depende de hoje).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "report_default_period_turns_at_sao_paulo_midnight"`

**C92** - Leituras do histórico e do relatório, pelos dois perfis, deixam `audit_logs` com o mesmo número de linhas e `check_ins` idêntica (Impact, door 3).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "history_and_report_reads_write_no_row"`

### S5 - O card de check-ins no painel · 0 files · 0 KB · ~2k

**C42** - `admin` recebe um objeto cujas chaves são exatamente `today`, `students`, `enrollments`, `payments` e `checkIns` (AC 42; substitui a parte de `admin` da C2 da `dashboard`).
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "top_level_keys_exactly_by_role_four_roles"`

**C43** - `reception` recebe exatamente `today`, `students`, `enrollments` e `checkIns`. A chave `payments` não existe, nem como `null` (AC 43; substitui a C3 da `dashboard`).
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "top_level_keys_exactly_by_role_four_roles"`

**C44** - `hr_finance` recebe exatamente `today`, `students`, `enrollments` e `payments`, e `instructor` exatamente `today` e `students`. A chave `checkIns` não existe para os dois, nem como `null` (AC 44).
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "top_level_keys_exactly_by_role_four_roles"`

**C45** - Com duas presenças em `2026-10-07`, uma em `2026-10-06` e uma em `2026-10-08`, `checkIns` é exatamente `{ "count": 2 }` para `admin` e para `reception`. Sem presença em D, é `{ "count": 0 }` (AC 45).
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "check_ins_count_is_todays_rows_for_admin_and_reception_and_zero_when_none"`

**C46** - Com uma presença de `day` `2026-10-07`, `checkIns.count` é `1` na chamada das `02:59:59Z` (com `today` `2026-10-07`) e `0` na das `03:00:00Z` (com `today` `2026-10-08`) (AC 46).
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "check_ins_count_turns_at_sao_paulo_midnight"`

**C47** - Com presenças em `2026-10-06`, `2026-10-07` e `2026-10-08`, nos três instantes `NOON`, `02:59:59Z` e `03:00:00Z`, `checkIns.count` é igual ao `total` de `GET /api/check-ins` sem parâmetros, como `admin` e como `reception` (AC 47).
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "check_ins_count_and_report_total_agree_across_sao_paulo_midnight"`

### S6 - A tela de check-in · 14 files · 53 KB · ~8k

**C48** - O menu tem o link "Check-in" para `admin` e `reception`, e não o tem para `hr_finance` e `instructor` (AC 48).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "check_in_link_only_for_admin_and_reception"`

**C49** - `hr_finance` e `instructor` abrindo `/check-in` veem "Você não tem permissão para acessar esta página.", e a `FakeApi` não recebe chamada a `/api/students` nem a nenhuma rota `check-in` (AC 49).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "hr_finance_and_instructor_see_no_permission_without_any_request"`

**C50** - `admin` e `reception` abrindo `/check-in` veem o título "Check-in" e o campo "Nome ou CPF" com o foco nele, sem cartão (AC 50).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "check_in_title_and_focused_name_or_cpf_field_without_card"`

**C51** - Uma busca que devolve três alunos lista os três com a miniatura (`img` com o `photoUrl` do item), o nome e a situação do cadastro, na ordem em que a `FakeApi` devolveu, embaralhada de propósito. Escolhido o segundo, a tela pede a situação dele e abre o cartão dele (AC 51).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "several_results_listed_in_api_order_with_thumb_name_status_and_choice_opens_card"`

**C52** - Uma busca que devolve exatamente um aluno abre o cartão dele sem lista (AC 52).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "single_result_opens_the_card_directly"`

**C53** - Uma busca sem resultado mostra "Nenhum aluno encontrado." (AC 53).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "no_result_shows_nenhum_aluno_encontrado"`

**C54** - O cartão:
- com `photoUrl`, um `img` com essa URL
- com `photoUrl` `null`, o marcador com as iniciais
- o nome
- o selo "Liberado" ou "Bloqueado"
- com `enrollment`, "Mensal Plus · Mensal" e "Vence em 14/10/2026"
- com `enrollment` `null`, "Sem matrícula vigente"

(AC 54)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "card_shows_large_photo_or_initials_name_badge_and_plan_or_no_enrollment"`

**C55** - Com `access` `blocked`, cada motivo aparece como "Aluno inativo", "Aluno suspenso" ou "Sem matrícula vigente". Com os dois motivos, aparecem os dois, na ordem da API. O botão "Registrar presença" não existe (AC 55).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "blocked_card_lists_each_reason_label_without_register_button"`

**C56** - Com `access` `allowed` e `checkedInAt` `null`, o botão "Registrar presença" existe (AC 56).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "allowed_card_without_check_in_shows_register_button"`

**C57** - Com `checkedInAt` `2026-10-08T02:30:00Z`, o cartão mostra "Presença já registrada hoje às 23:30." sem o botão (AC 57, decisão 6 da Intent).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "already_checked_in_card_shows_sao_paulo_time_without_button"`

**C58** - Clicado "Registrar presença" e a API respondendo `201` com `checkedInAt` `2026-10-08T02:30:00Z`:
- a tela mostra "Presença registrada às 23:30."
- o campo de busca fica vazio e com o foco
- a `FakeApi` recebeu exatamente um `POST /api/students/<id>/check-ins`

(AC 58, decisão 6 da Intent)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "register_201_shows_time_clears_and_refocuses_search"`

**C59** - Com o registro respondendo `409` `already_checked_in`, a tela pede de novo a situação e mostra "Presença já registrada hoje às HH:mm.". Com `409` `check_in_blocked`, mostra "Bloqueado" e os motivos da resposta nova, sem botão (AC 59).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "register_409_reloads_the_card_two_codes"`

**C60** - Cada falha mostra a sua mensagem e o botão "Tentar novamente", com o campo mantendo o texto digitado (AC 60):
- busca com `500`: "Não foi possível carregar o aluno."
- situação com `500` e com `404`: "Não foi possível carregar o aluno."
- registro com `500`: "Não foi possível registrar a presença."

"Tentar novamente", com a API de volta, completa a ação que falhou.
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "search_card_and_register_failures_show_message_and_retry_keeping_the_field"`

**C61** - Um nome de aluno com marcação (`<b>Ana</b>`) e um nome de plano com marcação (`<i>Mensal</i>`) aparecem como texto literal, sem criar elemento, na lista de resultados e no cartão (AC 61, L-027).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "student_and_plan_markup_shown_as_literal_text_in_list_and_card"`

**C93** - A busca pede `GET /api/students` com `q` igual ao texto digitado (nome e CPF com máscara) e nenhum outro parâmetro. O cartão pede `GET /api/students/<id>/check-in-status`. O registro envia o `POST` sem corpo e nenhuma outra escrita (Flow passos 2 a 4, Impact "comportamento existente").
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "search_card_and_register_request_exactly_the_flow_routes"`

**C94** - Sem sessão, abrir `/check-in` redireciona para `/login`, e a `FakeApi` não recebe chamada de dados (Observable "unauthorised state").
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-in.spec.ts -g "anonymous_check_in_redirects_to_login_without_requests"`

### S7 - Presenças na ficha do aluno · 3 files · 24 KB · ~3k

**C62** - Como `admin` e `reception`, `/students/<id>` mostra o bloco "Presenças" com a tabela de colunas "Data", "Hora" e "Registrado por", na ordem da `FakeApi`, embaralhada de propósito. A linha de `day` `2026-10-07` e `checkedInAt` `2026-10-08T02:30:00Z` mostra "07/10/2026" e "23:30" (AC 62, decisão 6 da Intent).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-check-ins.spec.ts -g "ficha_check_ins_table_three_columns_in_api_order_with_sao_paulo_time"`

**C63** - Com `nextCursor` preenchido, o botão "Carregar mais" pede `GET /api/students/<id>/check-ins?cursor=<nextCursor>` e acrescenta as linhas abaixo das que já estão. Com o `nextCursor` da página seguinte `null`, o botão some (AC 63).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-check-ins.spec.ts -g "load_more_appends_the_next_page_and_disappears_on_the_last"`

**C64** - Sem presença, a ficha mostra "Nenhuma presença registrada." e nenhuma tabela no bloco (AC 64).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-check-ins.spec.ts -g "no_check_in_shows_empty_message_without_table"`

**C65** - Como `hr_finance` e `instructor`, a ficha não tem o bloco "Presenças", e a `FakeApi` não recebe chamada a `/api/students/<id>/check-ins` (AC 65).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-check-ins.spec.ts -g "hr_finance_and_instructor_see_no_block_and_make_no_request"`

**C66** - Com a rota respondendo `500` e `403`, o bloco mostra "Não foi possível carregar as presenças." e o botão "Tentar novamente". Os blocos "Matrículas" e "Pagamentos" e o nome do aluno continuam na ficha (AC 66).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-check-ins.spec.ts -g "check_ins_failure_shows_retry_without_hiding_other_blocks"`

### S8 - A tela do relatório de presenças · 3 files · 21 KB · ~5k

**C67** - O menu tem o link "Presenças" para `admin` e `reception`, e não o tem para `hr_finance` e `instructor`. Os dois últimos, abrindo `/check-ins`, veem "Você não tem permissão para acessar esta página." sem chamada a `/api/check-ins` (AC 67).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "check_ins_link_only_for_admin_and_reception"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-ins.spec.ts -g "hr_finance_and_instructor_see_no_permission_without_report_request"`

**C68** - Com a resposta de `from` `2026-10-01`, `to` `2026-10-07` e `total` `17`, `/check-ins` mostra:
- o título "Presenças"
- "De" com `2026-10-01` e "Até" com `2026-10-07`
- "Total no período: 17"
- a tabela "Data", "Hora", "Aluno" e "Registrado por" na ordem da `FakeApi`, embaralhada
- o nome do aluno como link para `/students/<id>`
- a hora em `America/Sao_Paulo` (`2026-10-08T02:30:00Z` como "23:30")

(AC 68)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-ins.spec.ts -g "report_title_fields_from_response_total_and_four_columns_in_api_order"`

**C69** - Enviados "De" `2026-09-30` e "Até" `2026-10-06`, a página vai a `/check-ins?from=2026-09-30&to=2026-10-06`, e a `FakeApi` recebe `GET /api/check-ins` com essas duas datas (AC 69).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-ins.spec.ts -g "submitting_de_and_ate_navigates_and_requests_both_dates"`

**C70** - Com `422` e dois itens em `errors` (`path` `from` e `path` `to`), cada `message` aparece junto do campo do seu `path` (AC 70).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-ins.spec.ts -g "report_422_messages_next_to_their_fields"`

**C71** - Com `total` `0` e `items` `[]`, a página mostra "Total no período: 0" e "Nenhuma presença no período." sem tabela (AC 71).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-ins.spec.ts -g "empty_period_shows_zero_total_and_message_without_table"`

**C72** - Com `nextCursor` preenchido, "Carregar mais" pede `GET /api/check-ins` com o mesmo `from`, o mesmo `to` e `cursor` igual a `nextCursor`, e acrescenta a página seguinte (AC 72).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-ins.spec.ts -g "report_load_more_keeps_period_and_appends"`

**C73** - Com `500` e com `403`, a página mostra "Não foi possível carregar as presenças." e o botão "Tentar novamente" (AC 73).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-ins.spec.ts -g "report_failure_500_and_403_shows_retry"`

**C95** - O nome de aluno com marcação aparece como texto literal na tabela do relatório e no link dele (L-027).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-ins.spec.ts -g "student_name_markup_shown_as_literal_text_in_report"`

**C96** - Sem sessão, abrir `/check-ins` redireciona para `/login` sem chamada a `/api/check-ins` (Observable "unauthorised state").
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/check-ins.spec.ts -g "anonymous_report_redirects_to_login_without_request"`

### S9 - O card no painel · 2 files · 17 KB · ~2k

**C74** - Com `checkIns` igual a `{ "count": 13 }`, `/` mostra o card "Check-ins de hoje" com `13` e o link "Ver presenças de hoje" para `/check-ins`. Com `{ "count": 0 }`, mostra `0` (AC 74).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "check_ins_card_count_zero_and_link_to_the_report"`

**C75** - Com as cinco chaves, os seis cards saem nesta ordem: "Alunos", "Check-ins de hoje", "Matrículas", "Vencimentos nos próximos 7 dias", "Pagamentos", "Matrículas ativas por plano". Sem `checkIns`, o card some e os outros mantêm a ordem (AC 75; substitui a ordem da C52 da `dashboard`).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "six_cards_in_order_and_check_ins_card_follows_its_key"`

**C76** - Com a resposta de cada perfil na forma da door 4, `/` mostra os cards de cada perfil (AC 76; substitui a C42 e a C52 da `dashboard`):
- `admin`: os seis
- `reception`: cinco, sem "Pagamentos"
- `hr_finance`: cinco, sem "Check-ins de hoje"
- `instructor`: só "Alunos"

Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "cards_by_role_six_five_five_one"`

**C97** - Cada abertura de `/` faz exatamente uma chamada `GET /api/dashboard` e nenhuma a `/api/check-ins`, nos quatro perfis (Flow "Painel": o card vem da chave, não do relatório).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/dashboard.spec.ts -g "home_requests_the_dashboard_once_and_no_other_data_route_for_four_roles"`

### S10 - Montagem, regressão e stack · 2 files · 64 KB · ~4k

**C98** - O `/api/openapi.json` documenta (AD-011):
- `GET /api/students/{id}/check-in-status` e `GET /api/students/{id}/check-ins`, este com o parâmetro `cursor`
- `POST /api/students/{id}/check-ins` sem corpo de requisição
- `GET /api/check-ins` com os parâmetros `from`, `to` e `cursor` vindos do schema de query do contrato

Os caminhos documentados continuam iguais aos registrados.
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "check_in_paths_and_report_query_parameters_come_from_contract_schema"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "paths_equal_registered_api_routes"`

**C99** - `admin` sem 2FA recebe `403` com `two_factor_enrollment_required` nas quatro rotas novas, e a lista de rotas bloqueadas as inclui (AD-022, Surface).
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C100** - As quatro rotas novas não entram na lista das que respondem sem sessão, que segue com quatro (AD-022).
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "only_four_routes_answer_without_session"`

**C101** - O schema do painel continua recusando uma chave a mais em cada um dos nove objetos. No topo, a chave a mais deixa de ser `checkIns`, que agora é aceita (C83), e passa a ser `attendance`. As outras recusas da C46 da `dashboard` seguem iguais (C46 da `dashboard`, door 4).
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/dashboard.test.ts -t "dashboard_schema_accepts_three_profile_shapes_and_refuses_each_missing_key_extra_key_null_card_and_bad_count"`

**C102** - As leituras do painel, pelos quatro perfis e nos dois instantes da virada, deixam idênticas todas as linhas de `students`, `enrollments`, `plans`, `payments` e `check_ins`, e não criam linha em nenhuma (Impact "stored data"; amplia a C56 da `dashboard` com a tabela nova).
Proof: `pnpm --filter "./apps/api" exec vitest run test/dashboard.test.ts -t "reading_the_dashboard_changes_no_row_of_four_tables_across_the_turn"`

**C103** - O `GET /api/students?q=` que a tela usa responde como antes: as provas de `students-search.test.ts` passam sem edição, e a busca por CPF devolve o `photoUrl` `thumb` do item (Impact "comportamento existente").
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-search.test.ts -t "digits_match_cpf_equal_or_phone_contains"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "list_photo_url_thumb_per_item_for_four_profiles_no_duplicates"`

**C104** - Na stack de pé, com a `0010` aplicada ao subir pelo papel do `compose.yaml` (`check_ins` e `check_ins_one_per_day_idx` lidos do `psql` da stack, `pg_extension` sem extensão nova), e um `reception`, um `hr_finance` e um `instructor` criados pelo próprio teste, pela origem do container `web`:
- matriculado um aluno a partir de hoje em `America/Sao_Paulo`, o `reception` lê a situação `allowed`, registra a presença (`201`) e repete (`409` `already_checked_in`)
- o `psql` lê a linha com `day` igual ao dia de São Paulo, lido do `psql` antes ou depois, e `checked_in_by` igual ao `reception`
- o histórico e o relatório sem parâmetro trazem a presença, com `total` um a mais que antes
- `GET /api/dashboard` do `reception` traz `checkIns.count` um a mais que antes
- o `instructor` recebe `403` na situação
- a página `/check-in` com a sessão do `reception` traz "Check-in", e com a do `instructor` traz "Você não tem permissão para acessar esta página."
- as escritas, as leituras e as aberturas de página não acrescentam linha a `audit_logs`

(AC 1, AC 17, AC 19, AC 26, AC 27, AC 33, AC 45, AC 49, AC 50, door 1, door 3, Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "check_in_through_web_by_reception_with_duplicate_refused_history_report_and_dashboard_count_without_audit_rows"`

**C105** - No caso da stack da `dashboard`, o `reception` recebe `200` com exatamente `today`, `students`, `enrollments` e `checkIns`, sem `payments`. O `hr_finance` recebe as quatro chaves de antes, sem `checkIns`. O resto do caso segue igual (substitui a parte de C58 da `dashboard` que lista as chaves do `reception`; door 4).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "dashboard_read_through_web_by_three_roles_follows_enrollment_and_payment_without_audit_rows"`

**C106** - Os dois códigos novos chegam como `problem+json` que o `problemSchema` aceita, com `status` `409`, e `code` `check_in_blocked` e `already_checked_in` (Impact "contrato", AD-009).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-write.test.ts -t "two_new_codes_are_problem_json_409"`

**C107** - O módulo de check-in está montado no harness de `apps/api` (`startStack`): as quatro rotas respondem `200` ou `201` a `reception` no mesmo processo. Estão também na lista de rotas registradas que o OpenAPI compara (startup config).
Proof: `pnpm --filter "./apps/api" exec vitest run test/check-ins-read.test.ts -t "four_check_in_routes_mounted_in_the_test_harness"`

## Coverage

Uma linha por rota da `Surface`, com os status como membros. Depois vêm as doors, as entidades de `Relations`, os conjuntos enumerados nos critérios, nas `Assumptions` e na `Observable`, e as montagens.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/students/:id/check-in-status` statuses (5) | 200 C1 · 401 C14 · 403 `forbidden` C13 · 403 `two_factor_enrollment_required` C99 · 404 C15 | - |
| `POST /api/students/:id/check-ins` statuses (8) | 201 C17 · 401 C24 · 403 `forbidden` C23 · 403 `csrf_rejected` C87 · 403 `two_factor_enrollment_required` C99 · 404 C25 · 409 `check_in_blocked` C18, C106 · 409 `already_checked_in` C19, C106 | - |
| `GET /api/students/:id/check-ins` statuses (6) | 200 C27 · 401 C32 · 403 `forbidden` C32 · 403 `two_factor_enrollment_required` C99 · 404 C32 · 422 C31 | - |
| `GET /api/check-ins` statuses (5) | 200 C33 · 401 C41 · 403 `forbidden` C41 · 403 `two_factor_enrollment_required` C99 · 422 C37, C38, C39, C90 | - |
| `GET /api/dashboard` statuses, sem mudança (3) | 200 C42 · 401 C5 da `dashboard` · 403 C6 da `dashboard` | - |
| quem chama as quatro rotas de presença, por perfil (4) | `admin` C1, C17, C27, C33 · `reception` C1, C17, C27, C33 · `hr_finance` C13, C23, C32, C41 · `instructor` C13, C23, C32, C41 | - |
| forma literal da door 1 (9) | cinco colunas C77 · duas chaves estrangeiras sem cascata C77, C79 · `day` gravado pela API C21, C86 · `checked_in_at` do banco C17 · autor da sessão C17, C86 · índice único por aluno e dia C78, C20 · sem `status`, `voided_at` e `tenant_id` C77 · nenhuma rota edita ou apaga C98, C100 · o nome `check-in`, não `attendance` C98, C77 | - |
| forma literal da door 2 (7) | conta única em `packages/contracts` C81 · três motivos C81, C3, C4, C5 · ordem e sem repetição C6, C81 · `allowed` se e somente se `[]` C81, C2 · nada guardado C16, C77 · `GET` e `POST` pela mesma conta C18, C22, C85 · `overdue` não bloqueia C7 | - |
| forma literal da door 3 (3) | o `POST` não grava trilha C26, C88 · autor e instante na linha e no histórico C17, C27 · `AUDIT_ACTIONS` em 38 C84 | - |
| forma literal da door 4 (5) | `checkIns` opcional e estrito no schema C83 · `count` é as linhas do `today` da resposta C45, C46 · `admin` cinco chaves C42 · `reception` quatro chaves C43, C105 · `hr_finance` e `instructor` sem `checkIns` C44, C105 | - |
| Relations: `check_ins` aponta para (2 entities) | `students` C77, C79 · `users` C77, C79, C27 | - |
| chaves da situação (7) | `today` C1 · `student` C1 · `photoUrl` C9 · `access` C2 · `blockReasons` C2 · `enrollment` C8 · `checkedInAt` C10 | - |
| chaves de `student` da situação (3) | `id` C1 · `name` C1 · `status` C1 | - |
| chaves de `enrollment`, `plan` com as suas três (4) | `id` C8 · `plan` (`id`, `name`, `period`) C8 · `startsAt` C8 · `endsAt` C8 | - |
| situação do aluno na liberação (3) | `active` C2 · `inactive` C3 · `suspended` C4 | - |
| `enrollmentStatus` na liberação (5) | `active` libera C2 · `scheduled` bloqueia C5 · `expired` bloqueia C5 · `cancelled` bloqueia C5 · sem período bloqueia C5 | - |
| motivos de `blockReasons` (3) | `student_inactive` C3, C81 · `student_suspended` C4, C81 · `no_active_enrollment` C5, C81 | - |
| combinações de motivos (2) | `inactive` com matrícula C6 · `suspended` com matrícula C6 | - |
| linhas de `checkInAccess` (16) | C81, table-driven over all 16 | - |
| bloqueio no `POST`, por caso (6) | `inactive` C18 · `suspended` C18 · sem período C18 · só agendado C18 · só vencido C18 · só cancelado C18 | - |
| virada do dia em São Paulo, por limite que depende de hoje (14) | `today` da situação às `02:59:59Z` C11 · às `03:00:00Z` C11 · `endsAt` na situação às `02:59:59Z` C11, C85 · às `03:00:00Z` C11, C85 · `startsAt` na situação às `02:59:59Z` C11, C85 · às `03:00:00Z` C11, C85 · `checkedInAt` às `02:59:59Z` C12 · às `03:00:00Z` C12 · `already_checked_in` às `02:59:59Z` C21 · `day` novo às `03:00:00Z` C21 · `endsAt` no `POST` às `02:59:59Z` e `03:00:00Z` C22 · `startsAt` no `POST` às `02:59:59Z` e `03:00:00Z` C22 · `checkIns.count` às `02:59:59Z` e `03:00:00Z` C46, C47 · padrão do relatório às `02:59:59Z` e `03:00:00Z` C91 | - |
| chaves do `201` (3) | `id` C17 · `day` C17 · `checkedInAt` C17 | - |
| precedência dos dois `409` (2) | só bloqueado C18 · bloqueado e já registrado: `check_in_blocked` C89 | - |
| desfechos do `POST` que não gravam trilha (6) | C88, table-driven over all 6 | - |
| chaves de um item do histórico, `checkedInBy` com as suas duas (4) | `id` C27 · `day` C27 · `checkedInAt` C27 · `checkedInBy` (`id`, `name`) C27 | - |
| chaves do relatório (5) | `from` C33 · `to` C33 · `total` C33, C34 · `items` C33 · `nextCursor` C33, C36 | - |
| chaves de um item do relatório (5) | `id` C33 · `day` C33 · `checkedInAt` C33 · `student` C33 · `checkedInBy` C33 | - |
| ordem do histórico e do relatório (4) | histórico `checkedInAt` C28 · histórico empate por `id` C28 · relatório `checkedInAt` C36 · relatório empate por `id` C36 | - |
| tamanho da página (2 edges) | 50, `nextCursor` `null` C29 · 51, `nextCursor` preenchido C29 | - |
| cursor que a rota não emitiria (5) | histórico `abc` C31 · histórico `uuid` de ninguém C31 · histórico presença de outro aluno C31 · relatório `abc` C90 · relatório `uuid` de ninguém C90 | - |
| bordas do período do relatório (6 edges) | `from` incluído C33 · `to` incluído C33 · dia antes fora C33 · dia depois fora C33 · 366 dias aceitos C39 · 367 recusados C39 | - |
| padrões de `from` e `to` (3) | sem os dois C35 · só `from` C35 · só `to` C35 | - |
| datas inválidas, cada uma em `from` e em `to` (4) | `2026-02-29` C37 · `2026-13-01` C37 · `2026-10-7` C37 · `abc` C37, em `from` e em `to` | - |
| datas válidas na borda (2) | `2024-02-29` C37, C82 · 366 dias com o 29 de fevereiro C39 | - |
| `from` contra `to` (2) | `from` depois de `to` C38 · `from` depois do `to` padrão C38 | - |
| chaves do topo do painel, por perfil (4) | `admin` cinco C42 · `reception` quatro C43 · `hr_finance` quatro C44 · `instructor` duas C44 | - |
| `checkIns.count` (3) | dois de hoje entre outros dias C45 · zero C45 · igual ao `total` do relatório C47 | - |
| schema do painel com `checkIns` (7) | `count` `0` aceito C83 · `null` recusado C83 · sem `count` C83 · chave a mais C83 · `-1` C83 · `1.5` C83 · `"3"` C83 | - |
| formas por perfil no schema (4) | `admin` C83 · `hr_finance` C83 · `reception` C83 · `instructor` C83 | - |
| links novos do menu, cada um em `admin` e `reception` e ausente em `hr_finance` e `instructor` (2) | "Check-in" C48 · "Presenças" C67 | - |
| estados de `/check-in` em `Observable`, menos o carregando, que é `n/a` e fica no diff (5) | vazio C50, C53 · erro C60 · sem permissão C49, C94 · densidade e ordem C51, C54 · ação destrutiva sem confirmação, um clique só C58 | - |
| rótulos de motivo na tela (3) | "Aluno inativo" C55 · "Aluno suspenso" C55 · "Sem matrícula vigente" C55 | - |
| estados do cartão (4) | `blocked` sem botão C55 · `allowed` com botão C56 · já registrado C57 · registrado agora C58 | - |
| `409` na tela (2) | `already_checked_in` C59 · `check_in_blocked` C59 | - |
| falhas na tela de check-in (3) | busca C60 · cartão C60 · registro C60 | - |
| resultado da busca (3) | vários C51 · um C52 · nenhum C53 | - |
| foto do cartão (2) | `photoUrl` C54, C9 · iniciais C54 | - |
| plano do cartão (2) | com `enrollment` C54 · `null` C54 | - |
| estados do bloco "Presenças" (5) | vazio C64 · erro C66 · sem permissão C65 · ordem C62 · carregar mais C63 | - |
| colunas do bloco (3) | "Data" C62 · "Hora" C62 · "Registrado por" C62 | - |
| estados de `/check-ins` (6) | vazio C71 · erro C73 · validação C70 · sem permissão C67, C96 · ordem C68 · carregar mais C72 | - |
| colunas do relatório (4) | "Data" C68 · "Hora" C68 · "Aluno" C68 · "Registrado por" C68 | - |
| hora em São Paulo, por tela (4) | cartão já registrado C57 · cartão registrado agora C58 · ficha C62 · relatório C68 | - |
| texto livre com marcação (5) | aluno na lista C61 · aluno no cartão C61 · plano no cartão C61 · aluno no relatório C95 · nome no link do relatório C95 | - |
| cards por perfil, na tela (4) | `admin` seis C76 · `reception` cinco C76 · `hr_finance` cinco C76 · `instructor` um C76 | - |
| ordem dos cards (6) | C75, table-driven over all 6 | - |
| card "Check-ins de hoje" (3) | `count` C74 · zero C74 · link para `/check-ins` C74 | - |
| checks da `dashboard` substituídos (6) | C2 `admin` por C42 · C3 por C43 · C46 `checkIns` recusada por C83, C101 · C42 por C76 · C52 por C75, C76 · C58 chaves do `reception` por C105 | - |
| tabelas que a leitura do painel não muda (5) | `students` C102 · `enrollments` C102 · `plans` C102 · `payments` C102 · `check_ins` C102 | - |
| rotas no OpenAPI (4) | situação C98 · `POST` C98 · histórico C98 · relatório C98 | - |
| startup config: módulo de check-in montado (2 assemblies) | harness de `apps/api` (`startStack`) C107 · stack do compose C104 | - |
| startup config: migração `0010` aplicada (2 assemblies) | `migrate` do harness de teste C80 · papel de migração do `compose.yaml` C104 | - |
| startup config: telas novas pela origem do web (2 assemblies) | build de produção do web contra a `FakeApi` C50 · container `web` da stack C104 | - |

- Claims naming a status code, route or response shape:
  - C1 a C47, C85 a C92 e C106 cruzam a fronteira HTTP da API montada pelo `startStack`
  - C48 a C76 e C93 a C97 cruzam a fronteira do web no navegador, sobre o build de produção
  - C104 e C105 cruzam as duas no processo real da stack
  - C81 prova a conta no próprio nível, sem banco e sem HTTP, e a fronteira dela é a C2 a C6, a C11, a C18 e a C22
  - C82 e C83 provam os schemas no próprio nível, e a fronteira deles é a C1, a C17, a C27, a C33 e a C42 a C44
  - C77 a C80 provam o banco por SQL, e a fronteira deles é a C17, a C19 e a C20
- Linhas de `Impact` e onde cada uma é provada:
  - o termo `check-in`: C77, C98
  - liberação, que não se confunde com `access.ts`: C81
  - `enrollmentStatus` com consumidor novo: C85
  - `paymentStatus` não lido: C7
  - quatro rotas novas e o painel com `checkIns`: C98, C42 a C47
  - os dois códigos novos: C106
  - `AUDIT_ACTIONS` em 38: C84
  - checks da `dashboard` substituídos: a linha de `Coverage` acima
  - menu e ficha: C48, C67, C62, C65
  - `shell.spec.ts` ganha dois testes e nenhum muda
  - busca, ficha e foto sem mudança: C103, e as suítes existentes de `students-*`, sem edição
  - `privacidade`: C79
  - `0010` e tabela vazia: C80
  - nenhuma variável nem extensão: C80, C104
  - a linha de `.specs` já está feita (AD-071 a AD-074 e `ROADMAP.md`) e não é check
- `Assumptions` e onde cada uma landou:
  - perfil do card `checkIns`: C42 a C44, C76
  - quem lê histórico e relatório: C32, C41, C65, C67
  - pagamento atrasado: C7
  - bloqueado não registra: C18
  - uma presença por dia: C19, C20, C78
  - desfazer fora: C98 (nenhuma rota de `DELETE`), C77 (sem `voided_at`)
  - trilha: C26, C88, C84
  - variante `large`: C9
  - `checkedInBy` com nome atual: C27
  - 366 dias: C39
  - Não viram check, por decisão do plano: "Meta check-in < 10 s" e "Pendências sem dono do Handoff"
- **Testes existentes que o Build edita** porque o claim deles muda pelo plano. O nome fica, salvo os dois de tela, e nenhuma asserção é afrouxada:
  - `top_level_keys_exactly_by_role_four_roles` de `dashboard.test.ts`: `admin` com cinco chaves, `reception` com quatro (C42, C43)
  - `reading_the_dashboard_changes_no_row_of_four_tables_across_the_turn`: ganha `check_ins` (C102)
  - `dashboard_schema_accepts_three_profile_shapes_...` de `contracts/test/dashboard.test.ts`: a chave a mais do topo passa de `checkIns` a `attendance` (C101)
  - `reception_sees_four_cards_without_payments` e `admin_and_hr_finance_see_five_cards_in_order` de `dashboard.spec.ts`: saem, trocados por `cards_by_role_six_five_five_one` (C76) e `six_cards_in_order_and_check_ins_card_follows_its_key` (C75)
  - `CARD_TITLES` e `dashboardFor` de `support/dashboard.ts`: ganham o card e a chave
  - `home_requests_the_dashboard_once_and_no_other_data_route_for_four_roles`: ganha `/api/check-ins` na lista do que não é chamado (C97)
  - o caso `dashboard_read_through_web_...` de `compose.test.ts`: as chaves do `reception` ganham `checkIns` (C105)
  - `admin_without_2fa_gets_403_everywhere_else` de `enrollment.test.ts`: a lista escrita à mão ganha as quatro rotas (C99)

  No mesmo commit, `features/dashboard/checks.md` ganha uma nota, abaixo da sua `Coverage`, apontando C2 (parte de `admin`), C3, C42, C46 (o membro `checkIns`), C52 e C58 (as chaves do `reception`) para C42, C43, C76, C83 e C101, C75 e C76, e C105 daqui. Nenhum check de lá é editado. C4 e o `hr_finance` de C2 seguem valendo como estão.
- **Provas existentes que seguem como estão e passam a valer também aqui**:
  - `only_four_routes_answer_without_session` (C100) e `paths_equal_registered_api_routes` (C98)
  - `audit_actions_end_with_two_payment_actions_in_order` (C84)
  - as de `students-search.test.ts` e `photos-urls.test.ts` (C103)
  - os testes de `shell.spec.ts`, que conferem um link por vez e não mudam
- Suítes de tela que abrem a ficha sem conhecer a rota nova (`students.spec.ts`, `student-enrollments.spec.ts`, `student-payments.spec.ts`, `consents.spec.ts`, `photos.spec.ts`): como `reception` ou `admin`, a ficha passa a pedir `GET /api/students/<id>/check-ins`, a `FakeApi` responde `404` e o bloco cai no erro da C66, sem esconder os outros. Se alguma delas reprovar (um "Tentar novamente" a mais), o conserto é a `FakeApi` daquele teste responder à rota nova, nunca mudar a asserção.
- Além do texto das AC, derivado das doors, da `Observable`, da Intent ou das lições, e que o Build pode discutir antes de fechar:
  - a precedência dos dois `409` (C89)
  - o corpo ignorado (C86)
  - o CSRF e a trilha por desfecho (C87, C88)
  - o acordo com a ficha de matrículas (C85)
  - o cursor de outro aluno e o reusado (C31, C90)
  - a virada do padrão do relatório (C91)
  - as rotas pedidas pela tela (C93)
  - a falta de sessão nas duas telas novas (C94, C96)
  - a marcação no relatório (C95)
  - nenhuma chamada a `/api/check-ins` em `/` (C97)
- Decisões que o plano deixa fora de AC e que nenhum check afirma:
  - o botão desabilitado enquanto o `POST` aguarda (Observable "loading", no diff)
  - a trava `FOR UPDATE` contra uma inativação concorrente (decisão 3 da Intent)
  - o que a busca faz com um texto vazio (a rota existente já responde, e a tela não a chama sem texto, no diff)
  - quantas consultas cada rota faz ao banco
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md`, `alunos`, `planos-matriculas`, `pagamentos` e `dashboard` seguem valendo e respondem as duas perguntas para quase tudo que esta feature reaproveita:
- a rota que decide, alcançada por HTTP, com o corte por perfil
- a restrição do banco (o índice único, provado por SQL e por uma corrida na rota, como `payments_one_alive_idx`)
- a conta pura em linhas de tabela, com a prova na fronteira
- o valor que depende do dia, nos dois lados da virada
- o cursor de página (`audit-logs`)
- a contagem agregada do painel, com a comparação entre duas rotas
- a tela contra a `FakeApi`
- a stack lida por `psql`

Uma situação nova fica sem resposta e ganha linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Regra de decisão única, numa função de `packages/contracts`, consumida por uma leitura que mostra o resultado e por uma escrita que o aplica (a liberação: o `GET` de situação mostra, o `POST` recusa) | uma prova no próprio nível, em linhas de tabela; **e**, na fronteira da leitura, um caso por motivo; **e**, na fronteira da escrita, um caso por linha da tabela que bloqueia, não um caso só; **e** cada limite que depende de hoje nos dois instantes da virada, **nas duas rotas** | cada motivo (três) e cada situação de período que bloqueia (quatro) na escrita (C18); os dois limites do período às `02:59:59Z` e às `03:00:00Z` no `GET` (C11) e no `POST` (C22). A prova da leitura não substitui a da escrita: um `POST` que lê `status` do aluno e esquece a matrícula passaria em toda prova do `GET`, e só a enumeração no `POST` o pega |

Evidence (o código novo ainda não existe; a contagem vem do plano e do que ele reaproveita, em `packages/contracts/src/plans.ts`, `apps/api/src/student-payments` e `apps/api/src/audit`):

- `checkInAccess`: 3 situações de aluno, 1 conta de período com 4 valores mais a ausência, 1 ordem de motivos, 16 linhas (C81) -> decide, numa função sem dependência; é a quarta conta de data do repositório, depois de `enrollmentStatus`, `paymentStatus` e `isExpiringSoon`
- schemas: 4 respostas estritas, 1 query com 3 parâmetros, 3 motivos, 2 valores de `access`, 1 chave opcional nova no painel (C82, C83) -> decide (aceita e recusa)
- `GET` de situação: 1 corte por perfil, 1 leitura do relógio, 1 escolha do período `active`, 1 leitura da presença do dia, 1 foto opcional (C1 a C16, C85) -> decide
- `POST`: 1 trava, 1 decisão refeita, 2 recusas com precedência, 1 mapeamento de `23505`, o `404` do aluno (C17 a C26, C86 a C89) -> decide, com a trava do aluno e o índice
- histórico e relatório: 2 ordens com desempate, 1 cursor, 2 padrões de data, 3 validações de período, 1 total (C27 a C41, C90 a C92) -> decide
- painel: 1 chave nova condicional a 2 perfis, 1 contagem do dia (C42 a C47) -> decide, no serviço que já existe
- banco: 1 tabela de 5 colunas, 2 chaves estrangeiras sem cascata, 1 índice único (C77 a C80) -> decide
- telas: 2 páginas novas e 1 bloco, 3 resultados de busca, 4 estados de cartão, 2 `409`, 3 falhas, 2 cargas paginadas, 1 card (C48 a C76, C93 a C97) -> decide, na tela
- os controllers: cada rota declara `@Roles` e `@Output`, valida a query e repassa ao serviço; o `POST` mapeia três desfechos para `201`, `404` e `409` -> decide só nesse mapeamento, que as C17 a C19 e a C25 provam; o resto é instrumentação
- closest analogue in the repo:
  - `apps/api/test/payments-write.test.ts` (`two_simultaneous_confirms_one_201_one_409_over_ten_rounds`: a escrita aninhada no aluno com índice único e `409` sob corrida)
  - `apps/api/test/dashboard.test.ts` (`dashboard_and_enrollment_ficha_agree_on_status_across_sao_paulo_midnight`: o acordo com a ficha nos três instantes)
  - `apps/api/test/audit-logs.test.ts` (`cursor_the_api_never_issued_is_422`, `period_includes_from_and_excludes_to`: o cursor e o período)
  - `packages/contracts/test/plans.test.ts` (a conta pura em linhas)

  Nenhum deles tem uma regra aplicada por duas rotas, e por isso a linha nova.

Cost: 1 arquivo novo de teste no banco e 1 no contrato, 3 de API (uma subida de Postgres cada, a de situação com o armazenamento de fotos), 3 de tela com o apoio deles e 1 caso na stack. Sem a linha acima, o bloqueio seria provado no `POST` com um aluno inativo só, e um `POST` que esquecesse a matrícula, ou que a contasse pelo dia UTC, passaria. A linha fica neste arquivo. Escrevê-la nas diretrizes do repositório alcança todo agente futuro e pede o aval do usuário, então o Build roda sob ela e deixa os arquivos de diretriz como estão.

## Swept

- validation: C82, C37, C38, C39, C31, C90, C86 - a query do relatório e o cursor são as únicas entradas; o `id` do aluno é validado como `uuid` (C15, C25, C32), e o `POST` não lê corpo
- failure modes: C18, C19, C89 (as recusas de estado), C60, C66, C73 (a API que não responde à tela)
- idempotency: C19, C20 - repetir o registro no mesmo dia dá `409`, pelo índice; as leituras não gravam (C16, C92, C102)
- authorization: C13, C23, C32, C41, C42 a C44, C48, C49, C65, C67, C99, C100; existing - a guarda global (AD-022) e a checagem de origem (AD-020), exercitadas aqui pela C87, que envia a origem proibida, e pela C99, que chama sem 2FA
- concurrency: C20 - dois registros juntos dão um só, pelo índice da door 1; a trava do aluno contra a inativação é do Flow, sem prova de fora (decisão 3 da Intent)
- data lifecycle: C77, C78, C79, C80 - a presença nunca é editada nem apagada por rota, e a chave estrangeira sem cascata segura o aluno e o usuário; a situação muda à meia-noite sem que linha nenhuma mude (C11, C12, C46); exportação, anonimização e exclusão definitiva são da `privacidade`
- dependency failure: C60, C66, C73 (a API fora para a tela); C9 (sem foto, `photoUrl` `null`); existing - banco fora na consulta cai no `500 internal_error` do `ProblemFilter`, pela prova `unhandled_500_hides_exception` da `fundacao`, que exercita o filtro e não estas rotas
- state transitions: C81, C11, C22, C12, C21 - `allowed` e `blocked`, calculados, mudando com o dia nos dois limites do período; a presença do dia que deixa de ser "de hoje" à meia-noite; nenhuma transição guardada
- observability: C26, C88, C84 - o check-in não grava trilha, por decisão da door 3; o autor e o instante ficam na linha e são lidos no histórico e no relatório (C27, C33); nenhum requisito de log neste slice

## Handoff

- Tamanhos medidos com `wc -c` no que já existe. O que será escrito é estimado em KB de código e teste novos, divididos por quatro.
- **Documentos que o builder lê**: `checks.md` (77 KB), `plan.md` (39 KB) e o trecho de `STATE.md` que importa (~10 KB), 126 KB = 32k.
- **Arquivos existentes**:
  - S0 = 71 KB:
    - `packages/database`: `schema.ts` 15,9, `0009_payments.sql` 0,6, `_journal.json` 1,4; como molde, `payments.test.ts` 13,7 e `migrate.test.ts` 4,0
    - `contracts/src`: `plans.ts` 6,9, `dashboard.ts` 2,7, `students.ts` 10,8, `index.ts` 0,4
    - `contracts/test`: `dashboard.test.ts` 6,7 e `plans.test.ts` 3,1
    - o trecho de `contracts.test.ts` da API (~5)
  - S1 a S5 = 193 KB:
    - código, como molde: `student-payments` (controller 3,0, serviço 8,4), `dashboard` (serviço 4,8, controller 0,8), `students.service.ts` 15,2 (busca e trava), `photos.service.ts` 14,1 (`urlFor`), `access.ts` 5,4, `app.module.ts` 6,3, `db-errors.ts` 0,6, `audit-logs` (serviço 3,0 e controller 1,1, o cursor)
    - testes: `dashboard.test.ts` 32,5 (editado), `payments-write.test.ts` 20,8 e `audit-logs.test.ts` 11,6 como molde, `enrollment.test.ts` 4,8, `openapi.test.ts` 16,4, `access.test.ts` 5,6
    - `support/`: `plans.ts` 7,8, `students.ts` 4,2, `stack.ts` 3,9, `audit.ts` 1,8, `payments.ts` 4,0, `photos.ts` 17,2
  - S6 a S9 = 115 KB:
    - páginas e componentes: `shell.tsx` 2,1, `page.tsx` 5,9, a ficha 6,7, `payments-block.tsx` 6,8 e `payments-load-error.tsx` 0,7 como molde do bloco, `students-list.tsx` 5,6, `/payments` (página 3,2, erro 0,5, filtro 1,1), `person-photo.tsx` 1,9, `proxy.ts` 1,7
    - `lib/`: `api.ts` 2,3, `students.ts` 3,1, `plans.ts` 1,9, `session.ts` 1,9, `dashboard-server.ts` 0,6, `payments-server.ts` 0,7
    - `e2e/support/`: `fake-api.ts` 9,9, `dashboard.ts` 3,6, `payments.ts` 6,7, `plans.ts` 8,2
    - `e2e/`: `shell.spec.ts` 5,0, `dashboard.spec.ts` 13,6, e como molde `student-payments.spec.ts` 14,1 e `payments.spec.ts` 7,6
  - S10 = 64 KB: `compose.test.ts` 59,6 e `tests/stack/support.ts` 4,2
  - Total 443 KB = 111k
- **Código novo**:

  | Slice | Estimativa |
  | --- | --- |
  | S0 | 3k |
  | S1 | 4k |
  | S2 | 5k |
  | S3 | 3k |
  | S4 | 4k |
  | S5 | 2k |
  | S6 | 8k |
  | S7 | 3k |
  | S8 | 5k |
  | S9 | 2k |
  | S10 | 4k |
  | **Total** | **43k** |

- Soma corrida, com os documentos em cada batch:
  - S0 = 18k lidos + 3k, tudo em `packages/database` e `packages/contracts`
  - S1 a S5 entram em `apps/api` aos 21k + 48k + 18k = 87k; com os documentos, 119k
  - S6 entra em `apps/web` aos 87k + 29k + 8k = 124k, e S9 fecha a tela aos 124k + 10k = 134k; com os documentos, 166k
  - S10 fecha na stack aos 134k + 16k + 4k = 154k; com os documentos, **154k + 32k = 186k**, acima do orçamento de 150k (o padrão, sem declaração em `AGENTS.md`)
- Corte proposto onde a superfície muda, depois da S5:
  - **batch A**: S0 a S5 e as provas de montagem de API (C77 a C92, C98 a C103, C106, C107): banco, conta, contrato, as quatro rotas e o painel; 87k + 32k = 119k
  - **batch B**: S6 a S10 restante (C48 a C76, C93 a C97, C104, C105): as telas e a stack; 29k + 16k lidos e 22k escritos = 67k, mais 32k de documentos e o diff do batch A (~25k) = 124k
- Mechanism: **`handoff`, escolhido pelo usuário em 2026-10-16**: batch A = S0 a S5 com C77 a C92, C98 a C103, C106 e C107; batch B = S6 a S10. Sequenciais e só na verde.
- Ordem dentro de cada batch:
  - A: S0 primeiro (a migração, `checkInAccess` e os schemas, de que as rotas dependem), depois S1, S2, S3, S4 e S5. No mesmo commit das rotas entram as quatro linhas de `enrollment.test.ts` e o teste do OpenAPI, senão as duas suítes reprovam com as rotas registradas. No commit da S5 entram as edições de `dashboard.test.ts` e do schema do painel.
  - B: S6, S7, S8, S9 (com as edições de `dashboard.spec.ts`, de `support/dashboard.ts` e a nota em `features/dashboard/checks.md`) e S10 (o caso novo e a edição do caso da `dashboard` em `compose.test.ts`)
- Conferir antes de cada trecho:
  - antes da S1, que o módulo lê `saoPauloToday()` uma vez por requisição e passa o mesmo dia à conta da liberação e à leitura da presença
  - antes da S2, que o `POST` trava a linha do aluno, refaz `checkInAccess` com esse dia, grava `day` a partir dele e não do banco, e que o `23505` de `check_ins_one_per_day_idx` vira `409 already_checked_in` pelo mapeamento de `db-errors.ts`
  - antes da S5, que a contagem usa o `today` que o painel já fixou e não lê o relógio de novo
  - antes da S6, que a tela segue `access` e `blockReasons` da resposta e não recalcula nada
- O Verifier não é do builder: quem tem a feature inteira o dispara depois do último commit, sobre `<base da feature>..HEAD`, com os 107 checks.
- Boundary (batch A): S0 a S5 verdes em `2fb19b9`, sobre a base `c2f2e9f`; `pnpm verify` verde nele (21 tarefas, 8 do cache: database 62 testes, contracts 14, API 632 em 71 arquivos com 95,44% de linhas em `apps/api/src`, repo 10; as tarefas de `web` saíram do cache porque nada em `apps/web` mudou, o F12 herdado). Commits: `e6a2783` (a `0010` e `check_ins`; C77 a C80), `97e74d9` (`checkInAccess` e os schemas; C81, C82; C84 passa como está), `52f5a0e` (as quatro rotas, `support/check-ins.ts`, as quatro linhas de `enrollment.test.ts` e o teste do OpenAPI; C1 a C41, C85 a C92, C98, C99, C106, C107; C100 e C103 passam como estão) e `2fb19b9` (o card do painel; C42 a C47, C83, C101, C102). Fechados: C1 a C47, C77 a C92, C98 a C103, C106 e C107. O batch B (S6 a S10: C48 a C76, C93 a C97, C104, C105) lê este arquivo e o diff `c2f2e9f..2fb19b9`
- Settled mid-build (batch A): nada foi decidido pelo usuário além do mecanismo. Decididas aqui, sem tocar check nem door: a mudança de `dashboardResponseSchema` saiu do commit da S0 para o da S5, junto com as edições de `dashboard.test.ts`, como o pedido de build mandava, e por isso a C83 fecha em `2fb19b9`; o módulo mora em `apps/api/src/check-ins` (`CheckInsService` e dois controllers, `StudentCheckInsController` em `api/students/:id` e `CheckInsController` em `api/check-ins`, os dois com `@Roles('admin', 'reception')` na classe); o `POST` não declara `@Input` (sem corpo, e o OpenAPI não documenta corpo); o autor é o `id` de `@CurrentUser`; a recusa de `23505` é apanhada fora da transação, como na matrícula, e não há conferência de presença antes do insert, que fica só com o índice; a precedência `check_in_blocked` vem de a decisão rodar antes do insert; o cursor do histórico tem de ser de presença do próprio aluno, e o do relatório de qualquer presença, e os dois são o `id` (`z.uuid`); a validação de dia do relatório é um `refine` só, para dar um item por parâmetro; a ordem das pontas e o limite de 366 dias são conferidos no serviço, depois dos padrões, com as mensagens "A data final deve ser igual ou posterior à inicial." (`to`) e "O período deve ter no máximo 366 dias." (`from`); a contagem do painel mora no `DashboardService` (`readsCheckIns`), não no serviço de presença. Três testes existentes mudaram fora da lista do `Coverage`, sem afrouxar o que afirmavam: `photos.test.ts` do banco ganhou `check_ins` na lista de tabelas, como cada migração anterior fez; `migration_0009_adds_only_payments_rewritten_in_place_without_a_0010_and_keeps_rows_and_extensions` manteve o nome, aplica a pasta cortada na `0009` e troca o "não há `0010`" por "nenhuma migração depois da `0009` menciona `payments`", com uma nota em `features/pagamentos/checks.md` abaixo da `Coverage` (a C62 de lá não foi editada); `dashboard.test.ts` esvazia `check_ins` antes de apagar os alunos
- Abandoned (batch A): nada. Nenhum check editado, nenhum teste afrouxado ou pulado. Fica para o batch B, como o Handoff já previa: a nota em `features/dashboard/checks.md` sobre C2, C3, C42, C46, C52 e C58 de lá, embora os testes de C2, C3 e C46 já tenham mudado aqui (em `2fb19b9`); vale escrevê-la no commit da S9 cobrindo os seis
- Boundary (batch B): S6 a S10 verdes em `1eaf7b2`, sobre `36c8956`. `pnpm verify` verde em `314a285` (21 tarefas, 14 do cache; web 269 testes), e o build e o test de `apps/web` rodados à parte sem cache (`turbo run build test --filter=@academia/web --force`) verdes em `1eaf7b2`, 269 testes; as três suítes novas de tela repetidas três vezes, 87 verdes. A stack rodada à parte no Docker (`-t "check_in_through_web_by_reception|dashboard_read_through_web_by_three_roles"`): 2 verdes, 18 pulados pelo filtro. Commits: `7b819ce` (`/check-in`, `lib/check-ins.ts`, os dois links do menu e `e2e/support/check-ins.ts`; C48 a C61, C93, C94 e a prova de menu da C67), `689d6ed` (o bloco "Presenças" da ficha; C62 a C66), `1012708` (`/check-ins`; C67 a C73, C95, C96), `ba60b71` (o card do painel, `dashboard.spec.ts`, `support/dashboard.ts` e a nota em `features/dashboard/checks.md`; C74 a C76, C97), `314a285` (a stack; C104, C105) e `1eaf7b2` (uma espera que faltava na prova da C61, ver Settled). Fechados: C48 a C76, C93 a C97, C104 e C105; com o batch A, os 107. O Verifier é disparado pelo orquestrador sobre `c2f2e9f..HEAD`
- Settled mid-build (batch B): nada foi decidido pelo usuário. Decididas aqui, sem tocar check nem door: o balcão é um componente de cliente (`check-in-desk.tsx`) que chama a API pelo navegador, como a busca de `/students`, e não põe o texto digitado na URL; um resultado só abre o cartão sem lista; depois do `201` o cartão fica e troca o botão por "Presença registrada às HH:mm."; uma falha substitui a lista ou o cartão pela mensagem e "Tentar novamente", que refaz a ação que falhou; o botão "Buscar" acompanha o campo; a lista de resultados é uma `ul` "Alunos encontrados" de botões e os motivos uma `ul` "Motivos do bloqueio"; o cartão usa `PersonPhoto` na forma `ficha`; "HH:mm" é `formatTime` em `lib/check-ins.ts`, com `Intl` em `America/Sao_Paulo`. A ficha pede a primeira página do histórico no servidor e "Carregar mais" pede as seguintes pelo navegador. O relatório é uma página de servidor; "De" e "Até" são preenchidos com o `from` e o `to` da resposta e o botão de envio é "Filtrar", como em `/audit`; "Carregar mais" manda o `from` e o `to` da resposta com o `cursor`. Os links "Check-in" e "Presenças" do menu ficam depois de "Alunos" e entraram juntos no commit da S6. Dois testes existentes mudaram fora da lista do `Coverage`, sem afrouxar o que afirmavam: `consents_load_failure_shows_retry_without_hiding_ficha` (`consents.spec.ts`) responde à rota nova de presenças, como já respondia à de matrículas, para que o único "Tentar novamente" seja o dos consentimentos (o caso que o `Coverage` previa; as outras suítes que abrem a ficha passaram sem edição); `cards_follow_the_response_keys_not_the_session_role` (`dashboard.spec.ts`) usa a resposta da Recepção, que pela door 4 traz `checkIns`, e a lista esperada ganhou "Check-ins de hoje". `instructor_sees_only_the_students_card` ganhou "Check-ins de hoje" na lista do que não aparece. `cards_by_role_six_five_five_one` herdou a asserção de que o link "Pagamentos" do menu não existe para a Recepção, que estava no teste removido. Na prova da C61, a leitura da lista vinha logo depois da busca e num build frio não via nenhum item; `1eaf7b2` espera os dois itens antes de ler, com a mesma asserção
- Abandoned (batch B): nada. Nenhum check editado, nenhum teste afrouxado ou pulado. Os dois testes de tela que o `Coverage` mandava trocar (`reception_sees_four_cards_without_payments` e `admin_and_hr_finance_see_five_cards_in_order`) saíram, substituídos pela C75 e pela C76. O passo 5 do Verifier, o percurso de tela com o usuário na stack real, não foi conduzido
