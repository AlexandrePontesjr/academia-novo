# Pagamentos - checks

Profile: standard
Plan: `.specs/features/pagamentos/plan.md`

## Intent

74 checks em 9 slices (S0, as 7 do plano e S8 de montagem, regressão, concorrência e stack) · 3 one-way doors · 0 open, of which 0 block

O plano da versão simples foi aprovado como está em 2026-10-09: pagar é uma confirmação sobre o período inteiro, sem valor digitado, sem parcial e sem forma, e se desfaz com outra confirmação. As Assumptions foram marcadas como confirmadas e as doors 1 a 3 viram AD-067 a AD-069 em `STATE.md` (AD-064 a AD-066, da versão com saldo, ficam `superseded`). Este arquivo **reescreve** o `checks.md` da versão anterior, guardado em `v1-parcial/`: nenhum check de lá vale, e o que o batch A daquela versão já construiu (a tabela, o contrato, a conta, as quatro rotas e a trilha, em `0e44fde`, `f00f602` e `c66f77d`) é adaptado a este plano, não refeito. `standard`, como nas features anteriores: o que o `light` não pega (um membro enumerado sem prova e um teste que passa sob uma implementação errada) é justamente a unicidade de uma confirmação viva por período e a situação calculada do dia.

Três coisas que o plano deixa em aberto e que este arquivo fixa, para a revisão aceitar ou trocar antes do Build:

1. **Período cancelado que já tem confirmação viva.** A AC 3 (`enrollment_cancelled`) e a AC 4 (`payment_already_confirmed`) disparam juntas. A C3 fixa `enrollment_cancelled`: cancelado é o motivo mais fundamental, e a tela já não oferece "Confirmar pagamento" ali (AC 51).
2. **Filtro ao reabrir a URL.** Abrir `/payments?status=overdue` direto mostra "Atrasado" escolhido em "Situação" (C72): a AC 44 só diz o que a escolha carrega, e uma página que mostra só os atrasados com o campo em "Todas" contradiria o que ela exibe.
3. **A corrida entre confirmar e cancelar o período** não vira check: o resultado visto de fora (`201` e `204`, ou `409` e `204`) é o mesmo com e sem a trava da linha do período, então nenhuma prova a distingue. A trava é do Flow (passo 3) e fica para o diff; a corrida entre confirmar e desfazer, que o índice da door 1 resolve e a resposta mostra, é a C70.

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`, `playwright test <arquivo> -g`). Arquivos do Build: em `packages/database/test`, `payments.test.ts` (**reescrito**, a tabela agora tem quatro colunas); em `packages/contracts/test`, `payments.test.ts` (**reescrito**, a conta perdeu o saldo); em `apps/api/test`, `payments-write.test.ts` (**reescrito**: os testes da versão anterior afirmam valor, forma e saldo, que deixam de existir, e nenhum é mantido), `payments-read.test.ts` e `payments-audit.test.ts` (novos) e `support/payments.ts` (adaptado); em `apps/web/e2e`, `payments.spec.ts`, `student-payments.spec.ts` e `support/payments.ts` (novos); em `tests/stack`, `compose.test.ts` (ganha um caso). Ganham casos, ou são editados como a lista abaixo da `Coverage` descreve: `contracts.test.ts`, `audit-auth.test.ts` e `openapi.test.ts` (API), `shell.spec.ts`, `audit.spec.ts` e `support/fake-api.ts` (web). As regras de `features/auth-rbac/checks.md`, `auditoria`, `alunos`, `consentimento`, `funcionarios` e `planos-matriculas` seguem valendo sem mudança: Postgres real por `testcontainers` (AD-012), sessão real de cada perfil (`stack.session(role)`, com 2FA já ativo para `admin`) e `Origin` igual a `WEB_ORIGIN`, "exatamente uma linha" como diferença de contagem de `audit_logs` (`written`), insert de `audit_logs` que falha por gatilho do próprio teste (`withAuditInsertFailing`), dois pedidos soltos juntos por uma barreira (`releasedTogether`), e, nas telas, o `FakeApi` que registra método, caminho, query e corpo. Regras próprias:

- A numeração acompanha o plano: **C1 a C59 provam a AC de mesmo número** (C33 é a AC 33). C60 a C66 (S0) são o que o plano deriva do banco, do vocabulário, do contrato e da conta; C67 a C71 (S8), a montagem, a regressão e a stack; C72 a C74 (dentro de S6), o que a tela afirma além do texto das AC. As ACs 8 e 9 são do banco, e as demais ACs de S1 a S5 cruzam a fronteira HTTP.
- "Linha de pagamento" e "linha de período" são lidas por SQL do banco do próprio teste como `to_jsonb(payments)` e `to_jsonb(enrollments)`, sem depender de nome de coluna além dos que a door 1 fixa (`enrollment_id`, `created_at`, `voided_at`; `price_cents`, `starts_at`, `cancelled_at`). "Linha idêntica" é igualdade desse JSON antes e depois, e "contagem" é `count(*)` da tabela. A linha de pagamento tem uma exceção só: `voided_at`, de nulo para um instante, uma vez (door 1); nada mais nela muda nunca.
- "Nada gravado" é a contagem e as linhas de `payments` e de `enrollments` iguais às de antes, mais a contagem de `audit_logs` (`paymentSnapshot`).
- O dia de hoje em `America/Sao_Paulo` é controlado pelo teste (relógio em processo, só `Date`), nunca lido do relógio da máquina; salvo quando o caso diz outra coisa, o relógio está em `2026-10-07T15:00:00Z` (`NOON`, dia 7 em São Paulo). A virada do dia é às 03:00 UTC: o último instante do dia 7 é `2026-10-08T02:59:59Z`. Cada requisição feita depois de mover o relógio usa uma sessão aberta naquele instante. Os instantes que vêm do banco (`createdAt`, `voided_at`) não seguem esse relógio: são conferidos entre T0 e T1, lidos de `now()` do banco antes e depois da requisição.
- "Mensal" de teste é um plano `monthly` de `priceCents` igual a `9990`; o período padrão é `2026-10-07` a `2026-11-06`, e o `dueDate` dele é `2026-10-07`. Aluno de teste vem de `insertStudents` (`support/students.ts`); o período vem de `insertEnrollment` (`support/plans.ts`), por SQL, salvo nos casos que falam da matrícula; a confirmação que o caso precisa já desfeita ou posta fora da rota vem de `insertPayment` (`support/payments.ts`, adaptado: só `enrollmentId` e `voided`), por SQL. Quando um caso precisa de vários períodos de um aluno que não podem se tocar (planos-matriculas, door 5), usa um aluno por período; períodos cancelados podem se tocar.
- "Autor" é o `id` do usuário da sessão que chamou. As chaves de resposta são conferidas por igualdade exata do conjunto: as três de um pagamento no `POST` (`id`, `enrollmentId`, `createdAt`), as duas do `payment` de um item (`id`, `createdAt`), as oito de um período na ficha e as oito de um item da lista geral.
- Um `404` de `:id` ou de `:paymentId` não prova que a rota existe (o Nest responde `404 not_found` a rota que não existe, como notaram os Verifiers de `planos-matriculas`): quem prova que as quatro existem e decidem é a C11 (`403` com `uuid` de ninguém) e as C1, C13, C19 e C25.

### S0 - A tabela, o vocabulário, o contrato e a conta, antes de qualquer rota · ~12 files · ~162 KB · ~8k

**C60** - Depois da `0009` (reescrita no lugar), `payments` tem exatamente as quatro colunas `id` (`uuid`, v7), `enrollment_id` (`uuid`, `NOT NULL`), `created_at` (`timestamptz`, `NOT NULL`, padrão do relógio do banco) e `voided_at` (`timestamptz`, anulável, nulo por padrão); não existem `amount_cents`, `paid_at`, `method`, `status`, `due_date`, `student_id` nem `tenant_id`; a única chave estrangeira é `enrollment_id` para `enrollments(id)` com regra `NO ACTION`, e nenhuma `CHECK` de `payments` sobrou da versão anterior (door 1, Relations, Impact "termos do PRD que mudam")
Proof: `pnpm --filter "./packages/database" exec vitest run test/payments.test.ts -t "payments_table_has_four_columns_no_amount_method_status_due_date_or_student_id_and_defaults"`

**C61** - Os índices únicos de `payments` são exatamente a chave primária e `payments_one_alive_idx`, único, sobre `enrollment_id` e parcial em `voided_at IS NULL`; não existe `UNIQUE (enrollment_id)` simples nem restrição de unicidade na tabela (door 1)
Proof: `pnpm --filter "./packages/database" exec vitest run test/payments.test.ts -t "payments_one_alive_idx_is_the_only_unique_index_besides_the_key_and_is_partial_on_voided_at_null"`

**C62** - A `0009` reescrita é a décima entrada do diário e não há `0010`; aplicada sobre o banco já com as tabelas de `0001` a `0008` e com linhas, cria só `payments`, deixa as linhas e as colunas das outras tabelas e as extensões como estavam, e uma segunda execução não muda nada (Impact "stored data": `0009` cria `payments` vazia e não toca tabela existente, sem `0010` que a desfaça; "ambiente": nenhuma extensão)
Proof: `pnpm --filter "./packages/database" exec vitest run test/payments.test.ts -t "migration_0009_adds_only_payments_rewritten_in_place_without_a_0010_and_keeps_rows_and_extensions"`

**C63** - `AUDIT_ACTIONS` tem 38 valores e os dois últimos são, nesta ordem, `student.payment_confirmed` e `student.payment_undone`; `student.payment_registered` e `student.payment_voided` não existem mais; e `ACTION_LABELS` do web traz `Pagamento confirmado` e `Pagamento desfeito` para as duas e nenhum rótulo para as antigas (door 3, Impact "contrato")
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_two_payment_actions_in_order"`

**C64** - As 38 ações do vocabulário aparecem todas ao menos uma vez em `audit_logs` depois de percorrer o sistema, e as duas de pagamento saem com `entity` igual a `student` e `entity_id` igual ao id do aluno matriculado (door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "ten_actions_written_equal_contract_vocabulary"`

**C65** - `createPaymentRequestSchema` aceita `{ enrollmentId }` com um `uuid` e recusa a ausência, `null`, uma string que não é `uuid` e um número, cada um com um item em `errors` de `path` `enrollmentId`; `registeredPaymentSchema` aceita exatamente as chaves `id`, `enrollmentId` e `createdAt`; `studentPaymentSchema` as oito da Surface e `openPaymentSchema` as oito da Surface; os dois são estritos e recusam `paidCents`, `balanceCents` e `payments`, chaves da versão anterior; `openPaymentsQuerySchema` aceita `pending`, `overdue` e a ausência, e recusa `paid`, `cancelled` e vazio com `path` `status` (Surface, AD-011, AD-029)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "payment_schemas_accept_and_reject"`

**C66** - A conta única de `packages/contracts` devolve `dueDate` igual a `startsAt` e `status` correto nas quinze linhas: cancelado sem confirmação, cancelado com confirmação viva e cancelado com só uma desfeita, os três `cancelled`; confirmação viva antes do vencimento, depois dele, e com uma desfeita ao lado de uma viva, os três `paid`; só desfeita depois do vencimento `overdue` e no próprio dia `pending`; sem confirmação antes do vencimento, no próprio dia e um dia depois, `pending`, `pending` e `overdue`; sem confirmação com o instante `2026-10-08T02:59:59Z` (dia 7 em São Paulo, vencimento 7) `pending` e com `2026-10-08T03:00:00Z` `overdue`; período de `priceCents` igual a `0` sem confirmação um dia depois `overdue`, e com confirmação viva `paid` (door 2, Assumptions "Período de valor zero")
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/payments.test.ts -t "payment_status_fifteen_rows_around_due_date_voided_cancelled_zero_price_and_sao_paulo_midnight"`

### S1 - Confirmar o pagamento de um período · ~8 files · ~61 KB · ~9k

**C1** - `POST /api/students/:id/payments` com `{ enrollmentId }` de um período não cancelado do aluno e sem confirmação viva, chamado como `admin` e como `hr_finance`, responde `201` com exatamente as chaves `id`, `enrollmentId` e `createdAt`, o `id` é o da única linha que passou a existir para o período, `createdAt` é um instante ISO entre T0 e T1 do relógio do banco, e a linha tem `voided_at` nulo (AC 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "confirm_201_by_admin_and_hr_finance_with_three_keys_and_database_instant"`

**C2** - `POST` com `enrollmentId` ausente, `null`, `"abc"`, `123`, um `uuid` de nenhum período e o `uuid` de um período de outro aluno responde `422` com `code` `validation_failed` e um item em `errors` de `path` `enrollmentId`, e deixa `payments`, `enrollments` e `audit_logs` como estavam (AC 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "confirm_six_invalid_enrollment_ids_422_on_enrollment_id"`

**C3** - `POST` de um período cancelado responde `409` com `code` `enrollment_cancelled` e nada gravado, nos três casos: cancelado sem pagamento, cancelado com uma confirmação já desfeita, e cancelado com confirmação viva (onde também valeria `payment_already_confirmed`: o cancelamento vence) (AC 3, decisão 1 da Intent)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "confirm_on_cancelled_period_409_enrollment_cancelled_three_cases"`

**C4** - `POST` de um período que já tem confirmação viva responde `409` com `code` `payment_already_confirmed` e nada gravado, nos três casos: depois de um `POST` anterior, com a confirmação posta por SQL, e depois de desfazer e confirmar de novo (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "confirm_on_confirmed_period_409_payment_already_confirmed_three_cases"`

**C5** - `POST` aceita com `201` a confirmação de um período agendado (início 2026-12-01), de um ativo (2026-10-07 a 2026-11-06) e de um vencido (2026-08-01 a 2026-08-31), do mesmo modo (AC 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "confirm_on_scheduled_active_and_expired_period_201_alike"`

**C6** - `POST` de um período de aluno com `status` `inactive` e de um com `suspended` responde `201`, como para um `active` (AC 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "confirm_for_inactive_and_suspended_student_201_like_active"`

**C7** - Dois `POST` do mesmo período soltos juntos por uma barreira, em dez rodadas, respondem `201` a exatamente um e `409` com `payment_already_confirmed` ao outro, nunca `5xx`, e cada rodada termina com uma só linha viva e uma só linha de `student.payment_confirmed` (AC 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "two_simultaneous_confirms_one_201_one_409_over_ten_rounds"`

**C8** - Um `INSERT` em `payments` com `enrollment_id` que não existe falha com o código `23503` (chave estrangeira) e não grava a linha (AC 8)
Proof: `pnpm --filter "./packages/database" exec vitest run test/payments.test.ts -t "insert_with_unknown_enrollment_id_fails_23503_and_writes_nothing"`

**C9** - Um `INSERT` em `payments` para um `enrollment_id` que já tem uma linha de `voided_at` nulo falha com o código `23505` no índice `payments_one_alive_idx` e não grava a linha; para um período só com linhas desfeitas, o insert passa, e um período pode ter várias linhas desfeitas ao lado de uma viva (AC 9)
Proof: `pnpm --filter "./packages/database" exec vitest run test/payments.test.ts -t "second_alive_row_fails_23505_and_voided_rows_do_not_count"`

**C10** - `GET`, `POST` e `DELETE` de `/api/students/:id/payments*` com `:id` que não é `uuid` e com um `uuid` de aluno nenhum respondem `404` com `code` `not_found`, nas seis combinações, e o `POST` de um `uuid` de aluno nenhum com um `enrollmentId` válido de outro aluno também é `404`, não `422` (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "student_routes_404_for_non_uuid_and_unknown_student_on_all_three"`

**C11** - `reception` e `instructor` chamando cada uma das quatro rotas novas, com ids que existem e com `uuid` de ninguém (dezesseis casos), recebem `403` com `code` `forbidden`, sem nenhuma das chaves `items`, `enrollmentId`, `payment`, `student`, `plan` e `priceCents` no corpo, e nada é gravado (AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "reception_and_instructor_everything_403_sixteen_cases"`

**C12** - As quatro rotas novas chamadas sem sessão respondem `401` com `code` `unauthorized`, e nada é gravado (AC 12)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "anonymous_401_on_four_payment_routes"`

### S2 - Desfazer a confirmação · ~1 file · ~0 KB · ~3k

**C13** - `DELETE /api/students/:id/payments/:paymentId` de um pagamento vivo, como `admin` e como `hr_finance`, responde `204`, preenche `voided_at` com um instante entre T0 e T1 do relógio do banco, mantém a linha e deixa todas as outras colunas dela idênticas (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "undo_204_sets_voided_at_from_database_and_keeps_row_and_other_columns"`

**C14** - `DELETE` de um pagamento já desfeito responde `204` e deixa a linha idêntica, com o `voided_at` do primeiro desfazimento (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "undo_of_undone_204_changes_nothing"`

**C15** - Depois de desfazer, um novo `POST` do mesmo período responde `201` com um `id` diferente; a linha desfeita continua lá, o período tem duas linhas e só a nova está viva (AC 15)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "confirm_again_after_undo_201_new_row_old_row_kept"`

**C16** - `DELETE` do pagamento de um período cancelado (cancelado depois de confirmado, pela rota de matrícula que já existe) responde `204` e preenche `voided_at`, como em um período vivo (AC 16)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "undo_on_cancelled_period_204_like_on_a_live_one"`

**C17** - `DELETE` com `:paymentId` que não é `uuid`, com um `uuid` de pagamento nenhum e com o id de um pagamento de outro aluno responde `404` com `code` `not_found`, e o pagamento do outro aluno continua vivo (AC 17)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "undo_404_for_bad_unknown_and_other_students_payment_id"`

**C18** - Dois `DELETE` do mesmo pagamento soltos juntos por uma barreira, em dez rodadas, respondem `204` aos dois e cada rodada termina com um só `voided_at` e uma só linha de `student.payment_undone` (AC 18)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "two_simultaneous_undos_204_204_one_voided_at_one_audit_row_over_ten_rounds"`

### S3 - Ver a situação de um aluno · ~1 file · ~0 KB · ~4k

**C19** - `GET /api/students/:id/payments`, como `admin` e como `hr_finance`, responde `200` com um item por período do aluno, cancelados inclusive, cada um com exatamente as oito chaves `enrollmentId`, `plan` (`id`, `name`, `period`), `startsAt`, `endsAt`, `dueDate`, `priceCents`, `status` e `payment`; para um aluno com períodos em 2026-12-01, 2026-10-07 (vivo), 2026-10-07 (cancelado) e 2026-08-01, a ordem é a de `startsAt` decrescente e, no empate, a de `enrollmentId` decrescente, nos dois sentidos de inserção do par empatado (AC 19)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "ficha_lists_every_period_with_eight_keys_ordered_by_starts_at_desc_then_id_desc"`

**C20** - Com o relógio fixo, a ficha devolve `dueDate` igual a `startsAt` e `status` `cancelled` para o período cancelado, `paid` para o que tem confirmação viva, `overdue` para o de vencimento anterior a hoje e `pending` para o de vencimento hoje ou depois; o período de vencimento 2026-10-07 é `pending` em `2026-10-08T02:59:59Z` e `overdue` em `2026-10-08T03:00:00Z`; e ler não muda nenhuma linha (AC 20)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "ficha_status_four_values_and_due_date_across_sao_paulo_midnight_without_changing_rows"`

**C21** - O `payment` de um item é um objeto com exatamente `id` e `createdAt` da confirmação viva do período, e `null` quando o período nunca teve confirmação e quando só tem uma desfeita; depois de desfazer e confirmar de novo, é o `id` da nova (AC 21)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "ficha_payment_is_the_alive_one_with_two_keys_or_null"`

**C22** - O aluno sem período recebe `200` com `items` igual a `[]` (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "ficha_of_student_without_period_200_empty"`

**C23** - Renomeado o plano e alterado o preço dele depois da matrícula, a ficha devolve em `plan.name` o nome de agora e em `priceCents` o valor gravado no período (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "ficha_shows_current_plan_name_and_recorded_price"`

**C24** - Um período confirmado e depois cancelado continua devolvendo o `payment` com o mesmo `id` e `status` `cancelled` (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "ficha_of_confirmed_then_cancelled_period_keeps_payment_and_says_cancelled"`

### S4 - Ver o que está pendente ou atrasado · ~1 file · ~0 KB · ~4k

**C25** - `GET /api/payments`, como `admin` e como `hr_finance`, responde `200` com um item por período não cancelado e sem confirmação viva, de aluno `active`, `inactive` ou `suspended`, cada um com exatamente as oito chaves `enrollmentId`, `student` (só `id` e `name`), `plan`, `startsAt`, `endsAt`, `dueDate`, `priceCents` e `status`, em ordem de `dueDate` crescente e, no empate (dois alunos com vencimento 2026-10-07), de `enrollmentId` crescente (AC 25)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "open_list_every_unpaid_period_of_any_student_status_eight_keys_ordered_by_due_date_then_id"`

**C26** - Com vencimentos 2026-10-06, 2026-10-07 e 2026-10-08 e o relógio em `NOON`, `?status=pending` devolve só os de 07 e 08 e `?status=overdue` só o de 06; com o relógio em `2026-10-08T02:59:59Z` o de 07 está em `pending` e com `2026-10-08T03:00:00Z` está em `overdue`, nas duas consultas (AC 26)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "open_list_filter_pending_and_overdue_across_sao_paulo_midnight"`

**C27** - `GET /api/payments` com `status` igual a `paid`, `cancelled`, vazio, `Pending`, `pending ` (com espaço), `all`, `pending` junto de `overdue` e `pending` repetido responde `422` com `code` `validation_failed` e um só item em `errors` de `path` `status`, sem a chave `items` (AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "open_list_status_eight_refusals_422_on_status"`

**C28** - A lista geral não traz o período cancelado sem confirmação, o cancelado com confirmação viva nem o de confirmação viva, e traz o que só tem confirmação desfeita; confirmar tira o período da lista e desfazer o devolve (AC 28)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "open_list_leaves_out_cancelled_and_confirmed_and_keeps_undone"`

**C29** - Sem nenhum período por pagar, `GET /api/payments` responde `200` com `items` igual a `[]` (AC 29)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "open_list_with_nothing_unpaid_200_empty"`

**C30** - Para o mesmo período e o mesmo instante, `GET /api/payments` e `GET /api/students/:id/payments` devolvem o mesmo `status`, em três instantes: `NOON`, `2026-10-08T02:59:59Z` e `2026-10-08T03:00:00Z`, com o vencimento em 2026-10-07 (AC 30)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "open_list_and_ficha_agree_on_status_across_sao_paulo_midnight"`

**C31** - As duas leituras que respondem `200`, como `admin` e como `hr_finance`, com a lista vazia e com a cheia, não acrescentam linha a `audit_logs` (AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "eight_reads_of_payments_write_no_audit_row"`

### S5 - Cada escrita deixa rastro, na mesma transação · ~1 file · ~15 KB de molde · ~5k

**C32** - `POST` que responde `201`, como `admin` e como `hr_finance`, grava exatamente uma linha em `audit_logs` com `action` `student.payment_confirmed`, `user_id` do autor, `entity` `student` e `entity_id` do aluno (AC 32)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "confirm_writes_one_payment_confirmed_row"`

**C33** - Para o período de `2026-10-07` com `9990`, o `diff` da confirmação é exatamente `{"fields":["startsAt","priceCents"],"values":{"startsAt":{"from":null,"to":"2026-10-07"},"priceCents":{"from":null,"to":9990}}}`, e para um período de `2026-12-01` com `15000` é o mesmo formato com esses dois valores (AC 33)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "confirm_diff_records_start_and_price_with_null_from"`

**C34** - `DELETE` que desfaz grava exatamente uma linha com `action` `student.payment_undone`, `user_id` do autor, `entity` `student`, `entity_id` do aluno e `diff` igual a `{"fields":["startsAt","priceCents"],"values":{"startsAt":{"from":"2026-10-07","to":null},"priceCents":{"from":9990,"to":null}}}` (AC 34)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "undo_writes_one_payment_undone_row_with_null_to"`

**C35** - Dez desfechos deixam `audit_logs` com o mesmo número de linhas: `POST` e `DELETE` sem sessão (`401`), como `reception` (`403`), de aluno que não existe (`404`), `POST` em período cancelado e em período já confirmado (`409`), `POST` com `enrollmentId` inválido (`422`) e o `DELETE` de um pagamento já desfeito (AC 35)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "ten_non_writing_outcomes_write_no_audit_row"`

**C36** - Com o insert em `audit_logs` falhando por gatilho do teste, `POST` e `DELETE` respondem `500`: o `POST` deixa `payments` sem a linha nova e o `DELETE` deixa `voided_at` nulo (AC 36)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "audit_insert_failure_500_rolls_back_confirm_and_undo"`

**C37** - Nas duas ações de pagamento, `ip` e `user_agent` seguem as AC 29 a 32 da `auditoria`: `X-Forwarded-For: 203.0.113.7` grava `203.0.113.7`; `198.51.100.1, 203.0.113.7` grava `203.0.113.7`; um `User-Agent` de 513 caracteres grava os primeiros 512; sem `User-Agent` grava nulo (AC 37)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "ip_and_user_agent_four_cases_on_each_of_two_actions"`

**C38** - Nenhuma coluna de nenhuma linha de `audit_logs` das duas ações contém o nome nem o CPF do aluno, em texto corrido nem formatado (AC 38)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "student_name_and_cpf_never_reach_payment_audit_rows"`

### S6 - Telas de pagamentos · ~10 files · ~100 KB · ~18k

**C39** - O link "Pagamentos" do menu existe para `admin` e `hr_finance` e não existe para `reception` nem `instructor` (AC 39)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "payments_link_only_for_admin_and_hr_finance"`

**C40** - Sem sessão, abrir `/payments` redireciona para `/login` (AC 40)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "anonymous_payments_redirects_to_login"`

**C41** - Como `reception` e como `instructor`, abrir `/payments` mostra "Você não tem permissão para acessar esta página.", nenhum nome de aluno nem valor da `FakeApi`, e nenhuma chamada a `/api/payments` (AC 41)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "reception_and_instructor_see_no_permission_and_no_payment_data"`

**C42** - Como `admin` e como `hr_finance`, `/payments` mostra o título "Pagamentos", o campo "Situação" com as opções "Todas", "Pendente" e "Atrasado", e uma tabela de colunas "Aluno", "Plano", "Período", "Pagar até", "Valor" e "Situação", com as linhas na ordem em que a `FakeApi` devolveu, que o teste embaralha de propósito (AC 42)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "payments_page_title_filter_options_six_columns_in_api_order"`

**C43** - Numa linha com aluno "Ana Souza" (`id` conhecido), plano "Mensal Plus" `monthly`, período `2026-10-07` a `2026-11-06`, `priceCents` `123456` e `overdue`, a tela mostra o nome como link para `/students/<id>`, "Mensal Plus · Mensal", "07/10/2026 a 06/11/2026", "07/10/2026" em "Pagar até", "R$ 1.234,56" e "Atrasado"; uma linha `pending` mostra "Pendente" (AC 43)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "payments_row_formats_name_link_plan_period_dates_price_and_status"`

**C44** - Escolher "Pendente" carrega `/payments?status=pending`, "Atrasado" carrega `/payments?status=overdue` e "Todas" carrega `/payments` sem query, e a `FakeApi` recebe a query correspondente (AC 44)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "situacao_choice_loads_status_query_and_todas_drops_it"`

**C45** - Sem período por pagar na situação escolhida, a tela mostra "Nenhum pagamento pendente ou atrasado." no lugar da tabela (AC 45)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "payments_empty_state_replaces_table"`

**C46** - Se a lista não carrega, a tela mostra "Não foi possível carregar os pagamentos." e o botão "Tentar novamente", e clicar nele com a API de volta mostra a tabela (AC 46)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "payments_load_failure_shows_retry_and_retry_shows_the_table"`

**C47** - Como `admin` e como `hr_finance`, a ficha `/students/<id>` mostra o bloco "Pagamentos" com uma tabela de colunas "Período", "Pagar até", "Valor" e "Situação", na ordem da API, com o período como "dd/MM/aaaa a dd/MM/aaaa", "Pagar até" como "dd/MM/aaaa" e o valor como "R$ 99,90", e a situação como "Pago", "Pendente", "Atrasado" ou "Matrícula cancelada" para os quatro `status`; a ficha pediu `GET /api/students/<id>/payments` uma vez por renderização (AC 47)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "ficha_block_four_columns_four_statuses_formats_and_one_request"`

**C48** - O aluno sem período mostra "Nenhum período para cobrar." no lugar da tabela (AC 48)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "ficha_block_empty_state"`

**C49** - Se o bloco não carrega, mostra "Não foi possível carregar os pagamentos." e o botão "Tentar novamente", e o nome do aluno e o bloco "Matrículas" continuam visíveis (AC 49)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "ficha_block_load_failure_keeps_the_rest_of_the_ficha"`

**C50** - Como `reception` e como `instructor`, a ficha não mostra o bloco "Pagamentos" e a `FakeApi` não recebe nenhuma chamada a `/api/students/<id>/payments` (AC 50)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "reception_and_instructor_ficha_has_no_payments_block_and_no_request"`

**C51** - O botão "Confirmar pagamento" aparece nos períodos `pending` e `overdue` e não aparece no `paid` nem no `cancelled` (AC 51)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "confirm_button_only_on_pending_and_overdue_periods"`

**C52** - Acionar "Confirmar pagamento" abre um diálogo que nomeia o aluno, o período "dd/MM/aaaa a dd/MM/aaaa" e o valor, com o botão "Confirmar"; até clicar nele a `FakeApi` não recebe `POST`, desistir do diálogo não envia nada, e o clique envia `POST /api/students/<id>/payments` com o corpo `{"enrollmentId":"<id do período>"}` e nenhuma outra chave (AC 52)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "confirm_dialog_names_student_period_and_value_and_sends_only_enrollment_id_after_confirmar"`

**C53** - Com `201`, o diálogo fecha e o período aparece como "Pago", sem o botão "Confirmar pagamento" e com o botão "Desfazer pagamento" (AC 53)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "after_201_dialog_closes_and_period_is_pago"`

**C54** - Com `409` de `enrollment_cancelled` o diálogo mostra "Esta matrícula foi cancelada." e com `409` de `payment_already_confirmed` mostra "Este período já está pago.", e nos dois casos o diálogo continua aberto (AC 54)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "confirm_409_messages_for_cancelled_and_already_confirmed"`

**C55** - O botão "Desfazer pagamento" aparece no período com confirmação viva, inclusive no cancelado com confirmação viva ("Matrícula cancelada"), e não aparece em `pending` nem em `overdue` sem confirmação (AC 55)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "undo_button_only_on_periods_with_an_alive_confirmation"`

**C56** - Acionar "Desfazer pagamento" abre um diálogo que nomeia o aluno, o período e o valor; até confirmar a `FakeApi` não recebe `DELETE`; confirmar envia `DELETE /api/students/<id>/payments/<paymentId>` e, com `204`, o período aparece como "Pendente" quando o vencimento é hoje ou depois e como "Atrasado" quando já passou (AC 56)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "undo_dialog_confirms_before_delete_and_period_returns_to_pendente_or_atrasado"`

**C72** - Abrir `/payments?status=overdue` direto mostra "Atrasado" escolhido em "Situação", `/payments?status=pending` mostra "Pendente" e `/payments` mostra "Todas" (decisão 2 da Intent)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "reopening_the_url_keeps_the_situacao_choice"`

**C73** - Enquanto a API não responde, os botões "Confirmar" do diálogo de confirmação e do diálogo de desfazimento ficam desabilitados e a `FakeApi` recebe uma única requisição mesmo com dois cliques (Assumptions "Repetir a mesma requisição")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "dialog_confirm_buttons_disabled_while_waiting_one_request"`

**C74** - Um nome de aluno com marcação (`<b>Ana</b>`) aparece como texto literal, sem criar elemento, na lista de `/payments` e nos dois diálogos da ficha (derivado do `Impact`: a tela repete o nome do aluno em três lugares)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "student_name_markup_shown_as_literal_text_in_list_and_both_dialogs"`

### S7 - A trilha de pagamento na tela de Auditoria · ~2 files · ~40 KB · ~2k

**C57** - `/audit` mostra as ações por extenso "Pagamento confirmado" e "Pagamento desfeito", oferecidas no filtro "Ação" nas posições 37 e 38, nessa ordem, depois das trinta e seis existentes, e o filtro tem 38 opções (AC 57)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "action_filter_offers_all_38_with_the_two_payment_labels_last"`

**C58** - A linha `student.payment_confirmed` com o `diff` da C33 mostra em "Detalhes" "Início: — → 07/10/2026" e "Valor: — → R$ 99,90", e em "Alvo" o link "Ver aluno" para a ficha (AC 58)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "payment_confirmed_row_shows_inicio_valor_and_ver_aluno"`

**C59** - A linha `student.payment_undone` com o `diff` da C34 mostra em "Detalhes" "Início: 07/10/2026 → —" e "Valor: R$ 99,90 → —" (AC 59)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "payment_undone_row_shows_inicio_and_valor_with_dash_on_the_right"`

### S8 - Montagem, regressão, concorrência e stack · ~5 files · ~125 KB · ~6k

**C67** - O `/api/openapi.json` documenta as quatro rotas novas: `POST /api/students/{id}/payments` com o corpo vindo de `createPaymentRequestSchema`, `GET /api/payments` com o parâmetro `status` de valores `pending` e `overdue` vindo de `openPaymentsQuerySchema`, e `GET` e `DELETE` das rotas aninhadas; os caminhos documentados continuam iguais aos registrados (Impact "portão", AD-011, AD-029)
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "request_bodies_come_from_contract_schemas"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "paths_equal_registered_api_routes"`

**C68** - `admin` sem 2FA recebe `403` com `two_factor_enrollment_required` nas quatro rotas novas, e a lista de rotas bloqueadas as inclui (AD-022, `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C69** - Cancelar um período pela rota de matrícula que já existe não muda nenhuma linha de `payments` do período (linha viva e linha desfeita idênticas antes e depois), não grava `student.payment_*` e acrescenta exatamente uma linha, a de `student.enrollment_cancelled` (Impact "comportamento existente")
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "cancelling_a_period_leaves_its_payment_rows_identical_and_writes_only_its_own_audit_row"`

**C70** - Um `POST` do período e o `DELETE` da confirmação viva dele soltos juntos por uma barreira, em dez rodadas, respondem `204` ao `DELETE` e `201` ou `409` com `payment_already_confirmed` ao `POST`, nunca `5xx`; se o `POST` foi `201` a rodada termina com uma linha viva e as linhas `student.payment_undone` e `student.payment_confirmed`, e se foi `409` termina sem linha viva e só com `student.payment_undone` (índice da door 1 contra o preenchimento de `voided_at`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "confirm_racing_undo_never_5xx_and_leaves_at_most_one_alive_row_over_ten_rounds"`

**C71** - Na stack de pé, com a `0009` aplicada ao subir pelo papel do `compose.yaml` (`payments` com as quatro colunas e `payments_one_alive_idx`, e `pg_extension` sem extensão nova), e um `hr_finance`, um `reception` e um `instructor` criados pelo próprio teste, pela origem do container `web` e com `User-Agent` e `X-Forwarded-For` escolhidos: o `hr_finance` matricula um aluno a partir de hoje em `America/Sao_Paulo`, confirma o pagamento (`201`), repete o `POST` (`409` com `payment_already_confirmed`) e lê a ficha com o período `paid`; abrir `/students/<id>` com a sessão dele mostra "Pago" e abrir `/payments` não lista o período; o `reception` recebe `403` na leitura, e abrir `/payments` com a sessão dele e com a do `instructor` mostra "Você não tem permissão para acessar esta página."; desfeito o pagamento, o `psql` da stack lê a linha com `voided_at` preenchido e `/payments` lista o período; ao fim `audit_logs` tem exatamente uma linha `student.payment_confirmed` e uma `student.payment_undone`, com o `ip` e o `user_agent` enviados, e a abertura das páginas e as leituras não acrescentaram linha (AC 1, AC 4, AC 11, AC 13, AC 31, AC 32, AC 34, AC 37, AC 41, AC 47, door 1, Impact "ambiente", Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "payment_confirmed_and_undone_through_web_with_duplicate_refused_and_audit_rows"`

## Coverage

Uma linha para cada rota da `Surface`, com os status como membros; depois as doors, o que `Relations` acrescenta, os conjuntos enumerados nos critérios, nas `Assumptions` e na `Observable`, e as montagens.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/students/:id/payments` statuses (4) | 200 C19 · 401 C12 · 403 C11 · 404 C10 | - |
| `POST /api/students/:id/payments` statuses (6) | 201 C1 · 401 C12 · 403 C11 · 404 C10 · 409 C3, C4 · 422 C2 | - |
| `DELETE /api/students/:id/payments/:paymentId` statuses (4) | 204 C13 · 401 C12 · 403 C11 · 404 C10, C17 | - |
| `GET /api/payments` statuses (4) | 200 C25 · 401 C12 · 403 C11 · 422 C27 | - |
| status `500` fora da `Surface`, por rota de escrita (2) | `POST` do pagamento C36 · `DELETE` do pagamento C36 | - |
| códigos do `409` do pagamento (2) | `enrollment_cancelled` C3 · `payment_already_confirmed` C4 | - |
| quem escreve, por perfil (4) | `admin` C1, C13 · `hr_finance` C1, C13 · `reception` C11 · `instructor` C11 | - |
| quem lê, por perfil (4) | `admin` C19, C25 · `hr_finance` C19, C25 · `reception` C11 · `instructor` C11 | - |
| `admin` sem 2FA nas rotas novas (4 routes) | `GET` da ficha C68 · `POST` C68 · `DELETE` C68 · `GET /api/payments` C68 | - |
| `status` da conta (4) | `paid` C66, C20 · `pending` C66, C20 · `overdue` C66, C20 · `cancelled` C66, C20 | - |
| precedência da conta (3) | cancelado antes de pago C66 · pago antes de atrasado C66 · confirmação desfeita não paga C66 | - |
| virada do dia em São Paulo, vencimento 2026-10-07 (2 edges) | `2026-10-08T02:59:59Z` pendente C66, C20, C26, C30 · `2026-10-08T03:00:00Z` atrasado C66, C20, C26, C30 | - |
| período de valor zero (2) | sem confirmação `overdue` C66 · com confirmação `paid` C66 | - |
| `dueDate` igual a `startsAt` (2) | na conta C66 · na ficha e na lista C20, C25 | - |
| `status` da query de `GET /api/payments` (3) | ausente C25 · `pending` C26 · `overdue` C26 | - |
| recusas de `status` da query (8) | `paid` C27 · `cancelled` C27 · vazio C27 · `Pending` C27 · `pending ` C27 · `all` C27 · `pending` e `overdue` juntos C27 · `pending` repetido C27 | - |
| recusas de `enrollmentId` no `POST` (6) | ausente C2 · `null` C2 · `"abc"` C2 · `123` C2 · uuid de nenhum período C2 · uuid de período de outro aluno C2 | - |
| recusas de `enrollmentId` no schema (4) | ausente C65 · `null` C65 · não-uuid C65 · número C65 | - |
| `:id` das três rotas aninhadas, não-uuid e aluno que não existe (3) | `GET` C10 · `POST` C10 · `DELETE` C10 | - |
| `:paymentId` do `DELETE` (3) | não-uuid C17 · uuid de ninguém C17 · pagamento de outro aluno C17 | - |
| estado temporal do período na confirmação (3) | agendado C5 · ativo C5 · vencido C5 | - |
| estado do aluno na confirmação (3) | `active` C1 · `inactive` C6 · `suspended` C6 | - |
| estado do aluno na lista geral (3) | `active` C25 · `inactive` C25 · `suspended` C25 | - |
| `409` quando as duas condições valem (1) | cancelado com confirmação viva responde `enrollment_cancelled` C3 | - |
| desfazimento do pagamento (3) | vivo C13 · já desfeito C14 · de período cancelado C16 | - |
| depois de desfazer (2) | novo `POST` aceito C15 · a linha desfeita fica C15 | - |
| escritas simultâneas, por par (3) | `POST` com `POST` C7 · `DELETE` com `DELETE` C18 · `POST` com `DELETE` C70 | - |
| exclusões da lista geral (4) | cancelado sem confirmação C28 · cancelado com confirmação viva C28 · confirmação viva C28 · só a desfeita permanece C28 | - |
| `payment` de um item da ficha (3) | viva, com `id` e `createdAt` C21 · sem confirmação `null` C21 · só desfeita `null` C21 | - |
| chaves de um item da ficha (8) | C19, igualdade exata das 8 chaves, table-driven over all 8 | - |
| chaves de um item da lista geral (8) | C25, igualdade exata das 8 chaves, table-driven over all 8 | - |
| chaves do `student` da lista geral (2) | `id` C25 · `name` C25 | - |
| chaves do `payment` de um item (2) | `id` C21 · `createdAt` C21 | - |
| chaves da resposta do `POST` (3) | `id` C1 · `enrollmentId` C1 · `createdAt` C1 | - |
| colunas de `payments` (4) | `id` C60 · `enrollment_id` C60 · `created_at` C60 · `voided_at` C60 | - |
| colunas que a versão anterior tinha e esta não tem, mais as que o plano proíbe (7) | `amount_cents` C60 · `paid_at` C60 · `method` C60 · `status` C60 · `due_date` C60 · `student_id` C60 · `tenant_id` C60 | - |
| unicidade da confirmação viva (3) | forma do índice `payments_one_alive_idx` C61 · recusa do segundo vivo no banco C9 · corrida pela rota C7 | - |
| chave estrangeira sem cascata (2) | recusa de período que não existe C8 · regra `NO ACTION` C60 | - |
| `0009` reescrita (3) | décima entrada e nenhuma `0010` C62 · só `payments` criada C62 · outras tabelas, linhas e extensões intactas C62 | - |
| ações novas em `AUDIT_ACTIONS` (2) | `student.payment_confirmed` C63, C32, C64 · `student.payment_undone` C63, C34, C64 | - |
| ações da versão anterior que somem (2) | `student.payment_registered` C63 · `student.payment_voided` C63 | - |
| campos registráveis do `diff` (2) | `startsAt` C33, C34 · `priceCents` C33, C34 | - |
| forma do `diff` nos dois sentidos (2) | `from` nulo na confirmação C33 · `to` nulo no desfazimento C34 | - |
| dados pessoais fora da linha de auditoria (2) | nome do aluno C38 · CPF do aluno C38 | - |
| desfechos que não gravam trilha (10) | `POST` sem sessão C35 · `DELETE` sem sessão C35 · `POST` como `reception` C35 · `DELETE` como `reception` C35 · `POST` de aluno que não existe C35 · `DELETE` de aluno que não existe C35 · `POST` de período cancelado C35 · `POST` de período já confirmado C35 · `POST` com `enrollmentId` inválido C35 · `DELETE` de pagamento já desfeito C35 | - |
| `ip` e `user_agent` (4) | um salto C37 · dois saltos C37 · `User-Agent` de 513 caracteres C37 · sem `User-Agent` C37 | - |
| leituras que não gravam trilha (2) | `GET` da ficha C31 · `GET /api/payments` C31 | - |
| menu por perfil (4) | `admin` C39 · `hr_finance` C39 · `reception` C39 · `instructor` C39 | - |
| `/payments` por quem abre (5) | sem sessão C40 · `reception` C41 · `instructor` C41 · `admin` C42 · `hr_finance` C42 | - |
| colunas de `/payments` (6) | "Aluno" C42 · "Plano" C42 · "Período" C42 · "Pagar até" C42 · "Valor" C42 · "Situação" C42 | - |
| opções de "Situação" (3) | "Todas" C42, C44, C72 · "Pendente" C42, C44, C72 · "Atrasado" C42, C44, C72 | - |
| o que cada opção carrega (3) | `?status=pending` C44 · `?status=overdue` C44 · sem query C44 | - |
| a URL reaberta (3) | `?status=overdue` C72 · `?status=pending` C72 · sem query C72 | - |
| formatos em `/payments` (7) | nome como link C43 · plano `<nome> · <periodicidade>` C43 · período C43 · "Pagar até" C43 · valor em reais C43 · "Pendente" C43 · "Atrasado" C43 | - |
| estados de `/payments` em `Observable` (5) | vazio C45 · erro C46 · sem permissão C40, C41 · carregando n/a, página no servidor C42 · densidade e ordem C42 | - |
| colunas do bloco da ficha (4) | "Período" C47 · "Pagar até" C47 · "Valor" C47 · "Situação" C47 | - |
| situação por extenso na ficha (4) | "Pago" C47 · "Pendente" C47 · "Atrasado" C47 · "Matrícula cancelada" C47 | - |
| estados do bloco em `Observable` (5) | vazio C48 · erro C49 · sem permissão C50 · densidade e ordem C47 · ação destrutiva confirma C52, C56 | - |
| o que a ficha pede à API por perfil (4) | `admin` C47 · `hr_finance` C47 · `reception` C50 · `instructor` C50 | - |
| botão "Confirmar pagamento" por estado do período (4) | `pending` com o botão C51 · `overdue` com o botão C51 · `paid` sem o botão C51 · `cancelled` sem o botão C51 | - |
| botão "Desfazer pagamento" por estado do período (4) | `paid` com o botão C55 · cancelado com confirmação viva com o botão C55 · `pending` sem o botão C55 · `overdue` sem o botão C55 | - |
| o que o diálogo de confirmação faz (6) | nomeia o aluno C52 · nomeia o período C52 · nomeia o valor C52 · botão "Confirmar" C52 · requisição só depois dele C52 · corpo `{"enrollmentId"}` e nada mais C52 | - |
| depois de confirmar (3) | o diálogo fecha C53 · o período é "Pago" C53 · o botão trocou por "Desfazer pagamento" C53 | - |
| mensagens do diálogo de confirmação (2) | `enrollment_cancelled` C54 · `payment_already_confirmed` C54 | - |
| o que o diálogo de desfazimento faz (5) | nomeia aluno, período e valor C56 · requisição só depois de confirmar C56 · `DELETE` com o `paymentId` C56 · volta a "Pendente" C56 · volta a "Atrasado" C56 | - |
| botões desabilitados enquanto a API não responde (2) | confirmar a confirmação C73 · confirmar o desfazimento C73 | - |
| nome do aluno com marcação (3) | na lista C74 · no diálogo de confirmação C74 · no diálogo de desfazimento C74 | - |
| ações novas por extenso em `/audit` (2) | "Pagamento confirmado" C57 · "Pagamento desfeito" C57 | - |
| filtro "Ação" (38) | C57, table-driven over all 38: as trinta e seis de antes e as duas novas, posições 37 e 38 | - |
| "Alvo" das linhas novas (2) | confirmação com "Ver aluno" C58 · desfazimento, mesma regra da `auditoria` C59 | - |
| detalhes novos em `/audit` (4) | confirmação: "Início: — → 07/10/2026" C58 · confirmação: "Valor: — → R$ 99,90" C58 · desfazimento: "Início: 07/10/2026 → —" C59 · desfazimento: "Valor: R$ 99,90 → —" C59 | - |
| rotas no OpenAPI (4) | `GET` da ficha C67 · `POST` C67 · `DELETE` C67 · `GET /api/payments` com `status` C67 | - |
| cancelar o período (3) | linha viva idêntica C69 · linha desfeita idêntica C69 · só a própria linha de trilha C69 | - |
| decisões de `collection payments` em `Observable` (5) | agrupamento C19, C21 · nomes C43, C47, C57 · ordem C19, C25 · duplicados C4, C7, C9 · a exceção que não cabe C3, C16, C24 | - |
| startup config: migração `0009` aplicada (3 assemblies) | banco migrado em `packages/database` C62 · harness de `apps/api` C1 · stack do compose C71 | - |
| startup config: nenhuma extensão nova pelo papel que migra (2 assemblies) | Postgres do `testcontainers` C62 · Postgres do `compose.yaml` C71 | - |
| startup config: rotas novas pela origem do web (2 assemblies) | build de produção do web contra a `FakeApi` C42 · container `web` da stack C71 | - |

- Claims naming a status code, route or response shape: C1 a C7, C10 a C38, C67 a C70 cruzam a fronteira HTTP da API montada pelo `startStack`; C39 a C59 e C72 a C74 cruzam a fronteira do web no navegador, sobre o build de produção; C71 cruza as duas no processo real da stack. C8, C9 e C60 a C62 provam o banco migrado no próprio nível; C63 a C65 o vocabulário e os schemas; C66 a conta, no próprio nível, sem banco e sem HTTP, e a fronteira dela é a C20, a C26, a C30 e a C28 (API); a tela não refaz a conta, só mostra o que a API devolve (C43, C47)
- Linhas de `Impact` e onde cada uma é provada: `payment` como confirmação sem valor, dia nem forma C60, C1; situação de pagamento calculada, o quinto "status" do sistema, que não é coluna C60, C66, C20; `dueDate` igual a `startsAt`, a "Pagar até" da tela, e a coluna "Vencimento" de "Matrículas" intocada C20, C43, C47 (as provas existentes de `student-enrollments.spec.ts` seguem como estão); termos do PRD que mudam (`amount`, `method`, `paid_at`, `status`, `due_date` e `student_id` não criados) C60; os dois códigos novos de `409` C3, C4; `AUDIT_ACTIONS` de 36 para 38, `ACTION_LABELS` e `audit.spec.ts` C63, C57 (a troca de nome das duas ações, no `audit.ts` de `packages/contracts`, no `ACTION_LABELS`, nos quatro rótulos de `audit.spec.ts` e no serviço, entra no mesmo commit, ver `Handoff`); o menu C39; a ficha faz mais uma chamada só para dois perfis C47, C50; `/audit` mostra as ações pelo `Alvo` que já resolve C58; o portão (as quatro rotas no OpenAPI e nos 70% de cobertura) C67 e o gate do `pnpm verify`; nenhuma variável nem extensão C62, C71; `0009` vazia, sem importar histórico, e período vencido nascendo `overdue` C62, C66, C25; chave estrangeira sem cascata C60, C8; a situação muda sozinha à meia-noite sem linha mudar C20, C26, C30; cancelar não mexe na confirmação C69, C24; o batch A adaptado, que sai com valor, saldo, data, forma, teto e trava de soma C60, C65
- `Assumptions` que não viram check, por decisão do plano: "Meta de desempenho (PRD §4)" (não é critério), "Pendências sem dono do Handoff" (nenhuma entra aqui) e "Formato do valor na tela" (o que `formatPrice` já emite: C43 e C47 afirmam o resultado, não a função). As outras onze têm check: "Como se paga" C1, C13; "Quem confirma e desfaz" C11, C1; "De quando é a cobrança" C66, C20; "O que o aluno deve" C23, C47; "Período de valor zero" C66; "Data do pagamento" C1 (`createdAt`) e C33 (a trilha não leva o dia, só o início e o valor); "Período cancelado" C3, C24, C28, C47; "Aluno inativo" C6, C25; "Repetir a mesma requisição" C4, C73; "O desfazimento é do pagamento" C13, C34; "Lista geral" C25, C28; "Leitura na trilha" C31
- **Testes existentes que o Build edita** porque o claim deles muda pelo plano; o nome fica (salvo onde dito), o conteúdo ganha o que o plano muda e nenhuma asserção é afrouxada: `contracts.test.ts`, `audit_actions_end_with_two_payment_actions_in_order` (os dois nomes novos) e `payment_schemas_accept_and_reject` (os schemas sem valor, data e forma); `audit-auth.test.ts`, `ten_actions_written_equal_contract_vocabulary` (o `POST` sem `amountCents`, `paidAt` e `method`, e os dois comentários de ação); `audit.spec.ts`, os quatro rótulos das linhas 187, 188, 229 e 230, que passam a `Pagamento confirmado` e `Pagamento desfeito`; `openapi.test.ts`, `request_bodies_come_from_contract_schemas` (já cita `createPaymentRequestSchema`, que muda de forma). `enrollment.test.ts` já lista as quatro rotas e não muda. **Os testes da versão anterior que afirmam valor, forma, data ou saldo não são editados, são substituídos**: `payments-write.test.ts` e os dois arquivos de `payments.test.ts` (banco e contrato) são reescritos de ponta a ponta, porque o claim de cada teste deles deixa de existir; nenhum teste é apagado para fazer uma suíte passar, os checks é que mudaram
- **Provas existentes que seguem como estão e passam a valer também aqui**: `second_run_changes_nothing` de `migrate.test.ts` (a segunda execução não muda tabela, coluna nem extensão: cobre a `0009`); `six_identity_tables_and_no_tenant_id` de `schema.test.ts` (nenhuma coluna `tenant_id` no banco inteiro); `only_four_routes_answer_without_session` (segue com quatro rotas; a C12 prova o `401` das quatro novas); `guard_matrix_three_declarations_five_callers` (AD-022); a tabela de `photos.test.ts` do banco que lista as tabelas (já tem `payments`)
- Suítes de tela que abrem `/students/<id>` sem conhecer as rotas novas (`students.spec.ts`, `consents.spec.ts`, `photos.spec.ts`, `photo-editor.spec.ts`, `photo-camera.spec.ts` e `student-enrollments.spec.ts`): a `FakeApi` responde `404` ao que não conhece, então nelas o bloco "Pagamentos" aparece no estado de erro da C49 para `admin` e `hr_finance`. Nenhuma asserção delas fala do bloco; se alguma reprovar (um botão "Tentar novamente" a mais é o que já aconteceu uma vez, em `consents_load_failure_shows_retry_without_hiding_ficha`), o conserto é a `FakeApi` daquele teste responder à rota nova, nunca mudar a asserção
- Além do texto das AC, derivado do `Impact`, das `Assumptions`, das doors ou da prática do repositório, e que o Build pode discutir antes de fechar: a precedência do cancelado sobre "já confirmado" (C3); a leitura do filtro ao reabrir a URL (C72); o nome do aluno com marcação (C74); a corrida do `POST` com o `DELETE` (C70); os desfechos da C35 além dos que a AC 35 lista (aluno que não existe e `enrollmentId` inválido, que a AC 35 cobre por `404` e `422`); o formato `dd/MM/aaaa` do período, de "Pagar até" e dos valores no bloco da ficha, que a `Observable` manda e nenhuma AC repete (C47)
- Decisões que o plano deixa fora de AC e que nenhum check afirma: o corpo do `POST` com chave a mais (`amountCents`, por exemplo) segue a regra do repositório de ignorar chave desconhecida em `z.object`, e nenhuma prova a afirma ou a nega; o que "Detalhes" mostra para um campo que o `diff` não traz; como a tela escolhe entre "Pendente" e "Atrasado" depois do desfazimento (ela relê a lista, C56); o que a ficha mostra para o período cancelado cujo `payment` ainda é vivo além do botão de desfazer (C55)
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md`, `auditoria`, `alunos`, `consentimento`, `funcionarios` e `planos-matriculas` seguem valendo e respondem as duas perguntas para o que esta feature reaproveita: a rota que decide, alcançada por HTTP, com o corte por perfil e a linha de auditoria; a restrição do banco (aqui o índice parcial, provado por SQL e por uma corrida na rota, como `consents_one_active_idx` e `ten_concurrent_grants_one_201_one_409`); o gravador da trilha; a tela contra a `FakeApi`; a stack lida por `psql`; a conta pura com a prova na fronteira; o valor que depende do dia, nos dois lados da virada. A linha sobre "invariante da soma de outras linhas" da versão anterior some junto com o saldo: não há soma aqui. Uma situação continua mal respondida e ganha linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Filtro e ordem por um valor calculado do dia, aplicados em código sobre linhas lidas do banco (a lista geral por `pending` e `overdue`) | uma prova de fronteira por valor do filtro, com o relógio controlado, nos dois instantes da virada, **e** uma que compara a lista com a ficha para o mesmo período | cada valor do filtro (nenhum, `pending`, `overdue`) e cada recusa (oito), nos instantes `02:59:59Z` e `03:00:00Z` do vencimento, com a ordem e o empate escritos à mão. A prova da ficha não substitui a da lista: ela passa por um caminho dela, e a igualdade entre as duas rotas (C30) é o que pega uma segunda conta escrita em SQL |

Evidence (o código novo ainda não existe; a contagem vem do plano e do código do batch A que ele adapta, em `apps/api/src/student-payments` e `packages/contracts/src/payments.ts`):

- confirmar: 1 campo validado (`enrollmentId`, 6 recusas), 2 recusas de estado (`enrollment_cancelled`, `payment_already_confirmed`, com precedência) e o `404` do aluno, 6 casos negados de perfil e de sessão (C1 a C12) -> decide, com a trava do período e o índice
- desfazer: 2 `404` (aluno e pagamento), 1 desvio de "já desfeito", 1 guarda de `UPDATE` com `voided_at IS NULL` (C13 a C18) -> decide
- conta: 4 valores de `status`, 3 precedências, 2 viradas, 15 linhas (C66) -> decide, numa função sem dependência; é a segunda conta de data do repositório depois de `enrollmentStatus`
- leitura da ficha: 1 ordem com desempate, cancelados incluídos, 8 chaves; lista geral: 3 valores de filtro, 8 recusas, 4 exclusões, 3 situações de aluno, 1 ordem com desempate, 8 chaves (C19 a C31) -> decide
- banco: 1 tabela de 4 colunas, 1 chave estrangeira sem cascata, 1 índice parcial único (C8, C9, C60 a C62) -> decide
- auditoria: 2 ações, 2 campos registráveis, 10 desfechos que não gravam, 2 rotas que desfazem, 4 casos de `ip` e `user_agent` (C32 a C38) -> decide
- telas: 1 URL nova e 1 bloco, 6 e 4 colunas, 4 estados de botão em cada um dos dois botões, 2 diálogos, 2 mensagens, 4 estados de erro (C39 a C59, C72 a C74) -> decide, na tela
- o controller de pagamentos (adaptado): cada rota valida o corpo pelo schema e chama o serviço; o `switch` do `POST` mapeia três desfechos para `404`, `409` e `422` -> decide só nesse mapeamento, que as C2 a C4 e C10 provam; o resto é instrumentação
- closest analogue in the repo: `apps/api/test/consents-write.test.ts` (`ten_concurrent_grants_one_201_one_409`, a rota aninhada no aluno com índice parcial único e linha que só muda de nula para um instante) ao lado de `apps/api/test/student-enrollments-read.test.ts` (`status_computed_on_read_four_values_across_sao_paulo_midnight_without_changing_the_row`, a situação calculada sem mudar a linha) e de `packages/contracts/test/plans.test.ts` (a conta pura em linhas de tabela)

Cost: 1 arquivo novo de teste de API para as leituras e 1 para a trilha, mais o `payments-write.test.ts` reescrito e o `support/payments.ts` adaptado; 2 arquivos novos de tela e o apoio do web; uma subida de Postgres por arquivo de API novo; a `FakeApi` com 4 rotas a mais; 1 caso na stack. Sem a linha acima, o filtro `pending` e `overdue` seria provado no dia em que o teste rodou, e uma segunda conta escrita em SQL para o filtro passaria até a primeira virada de dia. A linha fica neste arquivo; escrevê-la nas diretrizes do repositório alcança todo agente futuro e pede o aval do usuário, então o Build roda sob ela e deixa os arquivos de diretriz como estão.

## Swept

- validation: C2, C27, C65, C10, C17
- failure modes: C36, C46, C49, C54
- idempotency: C14 (desfazer o já desfeito), C18 (dois desfazimentos juntos gravam uma linha só), C4 e C7 (repetir ou duplicar o `POST` dá `409`, pelo índice, por decisão das Assumptions), C73 (o botão desabilitado enquanto aguarda)
- authorization: C11, C12, C41, C50, C39, C68; existing - a guarda global (AD-022) e a checagem de origem (AD-020), pelas provas `guard_matrix_three_declarations_five_callers` e `only_four_routes_answer_without_session`
- concurrency: C7, C18, C70; a unicidade da confirmação viva é do índice parcial (door 1) e a trava da linha do período no `POST` é do Flow, sem prova de fora (decisão 3 da Intent)
- data lifecycle: C60, C61, C62, C13, C69, C24 - o pagamento nunca é apagado por rota, desfazer mantém a linha, a chave estrangeira sem cascata segura o período, cancelar o período não mexe na confirmação; a situação muda à meia-noite sem que linha nenhuma mude (C20, C26); exportação, anonimização e exclusão definitiva são da `privacidade`
- dependency failure: C36 (auditoria que falha nas escritas), C46 e C49 (a API que não responde à tela); existing - banco fora na consulta cai no `500 internal_error` do `ProblemFilter`, pela prova `unhandled_500_hides_exception` da `fundacao`
- state transitions: C66, C13, C14, C15, C20 - `paid`, `pending`, `overdue` e `cancelled` do período, calculados, e `viva` para `desfeita` do pagamento, a única coluna que muda, uma vez (C13, C14), com a volta a `pending` ou `overdue` ao desfazer (C56)
- observability: C32 a C38, C57 a C59, C64, C71 - a trilha de confirmação e de desfazimento é o que esta feature torna observável; C38 mantém nome e CPF fora dela; leitura não grava (C31)

## Handoff

- Tamanhos, medidos com `wc -c` no que já existe e estimados (KB de código e teste novos, dividido por quatro) no que será escrito; os documentos que todo batch lê somam `checks.md` (68 KB) + `plan.md` (38 KB) + o trecho de `STATE.md` que importa (~10 KB) = 116 KB = 29k. **Código novo**: S0 = 8k (a `0009` reescrita e o schema do Drizzle, `contracts/src/payments.ts` sem valor e sem saldo, a conta nova, `payments.test.ts` do banco e o de `packages/contracts` reescritos, e a troca de nome das duas ações), S1 = 9k (o serviço e o controller adaptados, `support/payments.ts` e `payments-write.test.ts` reescrito na parte de confirmar), S2 = 3k, S3 = 4k (`payments-read.test.ts`, a ficha), S4 = 4k (a lista geral), S5 = 5k (`payments-audit.test.ts`), S6 = 18k (a página `/payments`, o bloco e os dois diálogos, `payments.spec.ts`, `student-payments.spec.ts`, a `FakeApi` e o apoio), S7 = 2k, S8 = 6k (OpenAPI, cancelamento, corrida, stack)
- Corte proposto, no limite em que a superfície muda (banco, contrato e API, depois telas), sem dividir slice: **batch A = S0 a S5 e C67 a C70** (C1 a C38, C60 a C70: banco, vocabulário, contrato, a conta e as quatro rotas com a trilha): código novo 8k + 9k + 3k + 4k + 4k + 5k + 3k (C67 a C70) = 36k; arquivos existentes 217 KB = 54k (schema.ts 16,3 KB, a `0009` 0,7 KB, o diário 1,4 KB, `payments.test.ts` do banco 15,9 KB, `contracts/src/payments.ts` 5,9 KB, `audit.ts` e `index.ts` de `contracts/src` 4,1 KB, `payments.test.ts` de `contracts` 2,9 KB, `contracts.test.ts` 54,9 KB, `audit-auth.test.ts` 19,3 KB, `openapi.test.ts` 14,2 KB, `enrollment.test.ts` 4,8 KB, o serviço 9,7 KB, o controller 2,9 KB, `app.module.ts` 6 KB, `payments-write.test.ts` 26,6 KB, `support/payments.ts` 3,5 KB, `support/plans.ts` 7,8 KB, `support/audit.ts` 1,8 KB, `support/students.ts` ~3 KB, `audit.ts` do web 7,6 KB e `audit.spec.ts` 32,8 KB, este só nos quatro rótulos), documentos 29k: **36k + 54k + 29k = 119k**. **batch B = S6, S7, C71 e C72 a C74**: código novo 18k + 2k + 3k (C71) = 23k; arquivos existentes 172 KB = 43k (`enrollments-block.tsx` 10,9 KB, `students/[id]/page.tsx` 5,6 KB, `enrollments-load-error.tsx` 0,7 KB, `plans/page.tsx` 2,8 KB, `plans-load-error.tsx` 0,4 KB, `shell.tsx` 1,8 KB, `proxy.ts` 1,7 KB, `lib/plans.ts` 1,9 KB, `lib/audit.ts` 7,6 KB, `lib/api.ts`, `lib/plans-server.ts` ~3 KB, `fake-api.ts` 9,9 KB, `support/plans.ts` do web 8,2 KB, `student-enrollments.spec.ts` 19,5 KB e `plans.spec.ts` 16 KB como molde, `shell.spec.ts` 4,1 KB, `audit.spec.ts` 32,8 KB, `tests/stack/compose.test.ts` 44,9 KB), documentos 29k, mais ~9k do diff do batch A: **23k + 43k + 29k + 9k = 104k**
- Um builder só: os arquivos existentes são 217 KB + 172 KB menos ~40 KB que os dois batches leem (`lib/audit.ts`, `audit.spec.ts`, `lib/plans.ts`, `proxy.ts`) = ~349 KB = 87k; código novo 36k + 23k = 59k; documentos 29k: **87k + 59k + 29k = 175k**, contra um orçamento de 150k, e a saída das execuções ainda não entrou. Passa do orçamento, então o Build **não começa** antes da escolha do mecanismo (abaixo). Os dois batches ficam entre 104k e 119k, com folga para a saída das execuções e para os testes de molde que cresceram na `foto-captura` e na `planos-matriculas`
- Por que dois e não três: a versão anterior precisou de três (212k) porque tinha o saldo, a trava de soma e o diálogo de valor, forma e data; sem eles, S0 a S5 já é adaptação de código existente (o serviço, o controller e as rotas estão de pé) e S6 e S7 formam o outro lado da fronteira, sem arquivo em comum além de `lib/audit.ts`
- Ordem do batch A: S0 primeiro (a tabela, o vocabulário, o contrato e a conta, de que todo o resto depende). No mesmo commit da `0009` reescrita entra o schema do Drizzle, o teste do banco reescrito e o `_journal.json` e o `0009_snapshot.json` regenerados (nunca uma `0010`); no mesmo commit da troca de `AUDIT_ACTIONS` entram o serviço (as duas strings de ação e o `diffOf` de `startsAt` e `priceCents`, ou o typecheck da API reprova), os dois rótulos de `ACTION_LABELS`, os quatro rótulos de `audit.spec.ts` e o `contracts.test.ts` e o `audit-auth.test.ts` editados, ou o typecheck do web e os testes de contagem reprovam. Depois S1 e S2 (as duas escritas), S3 e S4 (as duas leituras), S5 (a trilha) e C67 a C70
- O que fecha fora do seu batch: a **C71** (stack) e as telas dependem das quatro rotas e fecham no batch B; a **C64** (`ten_actions_written_equal_contract_vocabulary`) percorre a confirmação e o desfazimento, as duas rotas de escrita do batch A, então fecha no próprio A; a **C69** e a **C70** não esperam o batch B
- Conferir antes de cada trecho: antes da S1, que a trava do período é um `SELECT ... FOR UPDATE` em `enrollments` e que o `UPDATE ... WHERE cancelled_at IS NULL` de `StudentEnrollmentsService.cancel` espera por ela, e que o registro de pagamento não trava a linha do aluno (não cruza a ordem aluno-depois-plano do `POST` de matrícula); antes da S3, que a conta mora em `packages/contracts` ao lado de `enrollmentStatus` e que a ficha e a lista geral a chamam, sem SQL que classifique (C30); antes da S4, que o filtro por situação é aplicado depois da conta, em código; antes da S6, que `formatPrice` e o bloco `EnrollmentsBlock` de `planos-matriculas` são o molde do bloco e dos diálogos
- Mechanism: handoff
- Escolha do usuário em 2026-10-09, contra um estimado de 175k e um orçamento de 150k: `handoff`, os batches A e B acima, em sequência e só na verde, cada um em sessão nova que lê este arquivo e o diff do que já entrou. Batch A em construção nesta sessão; o batch B (S6, S7, C71 e C72 a C74) não começa nela e o Verifier só roda depois do último batch
- Boundary, batch A: S0 a S5 e C67 a C70, C1 a C38 e C60 a C70 verdes em `593c6c3` (`pnpm verify` verde). Commits: `b0ee95a` (banco), `c6cb25c` (contrato e conta), `1b3e5af` (serviço, controller e a troca de nome das ações), `9d6482e` (leituras), `8f6c232` (trilha), `cb3749d` (OpenAPI), `593c6c3` (lint). Base da feature: `3e32475`. O batch B (S6, S7, C71 e C72 a C74) lê este arquivo e o diff `c66f77d..593c6c3`
- Settled mid-build: o usuário não decidiu nada além do mecanismo `handoff`. Decididas aqui, sem tocar check nem door: a conta pura se chama `paymentStatus(period, payments, on)` e devolve só `{ dueDate, status }`; o serviço usa `confirm`/`undo` (era `register`/`void`); o `payment` de um item é `paymentSummarySchema` (`id`, `createdAt`); a C11 conta as 16 chamadas como 2 perfis x 2 conjuntos de ids x 4 rotas, a lista geral com e sem `?status=overdue`
- Abandoned: o `PAYMENT_METHODS` e o `paymentBalance` da versão anterior, os testes `payments-write.test.ts` e `payments.test.ts` (banco e contrato) dela, substituídos e não editados. Um teste a mais em `openapi.test.ts` (`payment_paths_and_status_query_parameter_come_from_contract_schema`) cobre o que a C67 diz do parâmetro `status` e das rotas `GET` e `DELETE`, que os dois testes citados na prova não afirmam. Sem desvio: nenhum check editado, nenhum teste afrouxado ou pulado
- Boundary, batch B: S6, S7, C71 e C72 a C74, C39 a C59, C71 a C74 verdes em `41b66a6`. Commits: `e44e1fa` (C57 a C59, que o batch A já deixara prontos no código), `c9e5bce` (menu, `/payments` e o apoio `e2e/support/payments.ts`; C39 a C46, C72), `60c828e` (bloco "Pagamentos" da ficha e os dois diálogos; C47 a C56, C73, C74), `41b66a6` (stack; C71). O Verifier ainda não rodou: o orquestrador o dispara sobre `3e32475..HEAD` com os 74 checks
- Settled mid-build (batch B): nenhuma decisão do usuário. Decididas aqui, sem tocar check nem door: o `FakeApi` não mudou, as rotas de pagamento da API falsa moram em `e2e/support/payments.ts` (`servePayments`, `serveOpenPayments`), como `servePlans` mora em `support/plans.ts`; `?status=` com valor que não é `pending` nem `overdue` abre `/payments` como "Todas", sem pedir `422`; o bloco da ficha atualiza por `router.refresh()` depois do `201` e do `204`, e um `409` deixa o diálogo aberto sem recarregar
- Abandoned (batch B): nada. Sem desvio: nenhum check editado, nenhum teste afrouxado ou pulado; C57 a C59 passaram sem código novo, porque os rótulos e o `Alvo` vieram no batch A
