# Pagamentos - checks

Profile: standard
Plan: `.specs/features/pagamentos/plan.md`

## Intent

85 checks in 9 slices (S0, as 7 do plano e S8 de contrato, montagem, concorrência, regressão, o que a tela envia e stack) · 3 one-way doors · 2 open (as duas respondidas no padrão recomendado em 2026-10-08), of which 0 block

O plano foi revisado em 2026-10-08 com as duas perguntas no padrão recomendado: a cobrança de um período é calculada da matrícula (o período vale `priceCents` e vence em `startsAt`, e só o dinheiro recebido vira linha, door 1 e door 2) e o atraso começa no dia seguinte a `startsAt`, sem carência (door 2). As doors 1 a 3 viram AD-064 a AD-066 em `STATE.md` junto com este arquivo. O dinheiro é o dado em que um erro de conta custa mais caro do que em qualquer feature anterior, e as duas coisas que o `light` não pega (um membro enumerado sem prova e um teste que passa sob uma implementação errada) são justamente a soma dos pagamentos e a situação calculada; por isso `standard`, como nas features anteriores.

Quatro decisões que o plano deixa em aberto e que este arquivo fixa, para a revisão aceitar ou trocar antes do Build:

1. **Período cancelado com saldo zero.** A AC 6 (`enrollment_cancelled`) e a AC 7 (`payment_exceeds_balance`, "inclusive quando o saldo é zero") disparam juntas num período pago por inteiro e depois cancelado. A C11 fixa `enrollment_cancelled`: cancelado é o motivo mais fundamental, e a tela já não oferece "Registrar pagamento" ali (AC 57).
2. **"0,00" na tela.** É valor em reais com duas casas, então a AC 59 não o recusa no navegador: a tela envia `amountCents` igual a `0`, a API responde `422` com `path` igual a `amountCents` e a AC 61 mostra a mensagem junto do campo (C66, C79).
3. **Filtro ao reabrir.** Abrir `/payments?status=overdue` direto mostra "Atrasado" escolhido em "Situação" (C54): a AC 49 só diz o que a escolha carrega, e uma página que mostra só os atrasados com o campo em "Todas" contradiria o que ela exibe.
4. **Formas de pagamento em `/audit`.** A AC 65 e a AC 66 só exemplificam `pix`; `valueLabel` ganha os cinco valores de `method` pelo Impact, e a C84 prova os cinco.

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`, `playwright test <arquivo> -g`). São criados no Build, em `packages/database/test`, `payments.test.ts`; em `packages/contracts/test`, `payments.test.ts`; em `apps/api/test`, `payments-write.test.ts`, `payments-read.test.ts`, `payments-audit.test.ts` e `support/payments.ts`; em `apps/web/e2e`, `payments.spec.ts`, `student-payments.spec.ts` e `support/payments.ts`. Ganham casos, ou são editados como a lista abaixo da `Coverage` descreve: `contracts.test.ts`, `audit-auth.test.ts`, `openapi.test.ts`, `enrollment.test.ts` e `hostile-input.test.ts` (API), `photos.test.ts` (banco), `shell.spec.ts`, `audit.spec.ts`, `fake-api.ts` e `compose.test.ts`. As regras de `features/auth-rbac/checks.md`, `auditoria`, `alunos`, `consentimento`, `funcionarios` e `planos-matriculas` seguem valendo sem mudança: Postgres real por `testcontainers` (AD-012), sessão real de cada perfil (`stack.session(role)`, com 2FA já ativo para `admin`) e `Origin` igual a `WEB_ORIGIN`, "exatamente uma linha" como diferença de contagem de `audit_logs` (`written`), insert de `audit_logs` que falha por gatilho do próprio teste (`withAuditInsertFailing`), dois pedidos soltos juntos por uma barreira (`releasedTogether`), e, nas telas, o `FakeApi` que registra método, caminho, query e corpo. Regras próprias:

- A numeração acompanha o plano: de S1 a S7, **C(n) prova a AC (n - 5)** (C6 é a AC 1, C71 é a AC 66). S0 vem antes e S8 depois.
- "Linha de pagamento" e "linha de período" são lidas por SQL do banco do próprio teste como `to_jsonb(payments)` e `to_jsonb(enrollments)`, sem depender de nome de coluna além dos que as doors fixam (`enrollment_id`, `amount_cents`, `paid_at`, `method`, `created_at`, `voided_at`; `price_cents`, `starts_at`, `cancelled_at`). "Linha idêntica" é igualdade desse JSON antes e depois, e "contagem" é `count(*)` da tabela. A linha de pagamento tem uma exceção só: `voided_at`, de nulo para um instante, uma vez (door 1); nada mais nela muda nunca.
- "Nada gravado" é a contagem e as linhas de `payments` e de `enrollments` iguais às de antes, mais a contagem de `audit_logs` (`paymentSnapshot`).
- O dia de hoje em `America/Sao_Paulo` é controlado pelo teste (relógio em processo, só `Date`), nunca lido do relógio da máquina; salvo quando o caso diz outra coisa, o relógio está em `2026-10-07T15:00:00Z` (dia 7 em São Paulo). A virada do dia é às 03:00 UTC: o último instante do dia 7 é `2026-10-08T02:59:59Z`. Cada requisição feita depois de mover o relógio usa uma sessão aberta naquele instante. Os instantes que vêm do banco (`createdAt`, `voidedAt`) não seguem esse relógio: são conferidos entre T0 e T1, lidos de `now()` do banco antes e depois da requisição.
- "Mensal" de teste é um plano `monthly` de `priceCents` igual a `9990`; o período padrão é `2026-10-07` a `2026-11-06`, e o `dueDate` dele é `2026-10-07`. O "pagamento padrão" é `amountCents` `5000`, `paidAt` `2026-10-07`, `method` `pix`. Aluno de teste vem de `createStudent` (`support/students.ts`); o período vem de `insertEnrollment` (`support/plans.ts`), por SQL, salvo no caso que fala da matrícula; o pagamento que o caso precisa já anulado ou datado fora da regra vem de `insertPayment` (`support/payments.ts`), por SQL. Quando um caso precisa de vários períodos de um aluno que não podem se tocar (planos-matriculas, door 5), usa um aluno por período.
- "Saldo" é `priceCents` menos a soma dos pagamentos não anulados; o valor esperado de cada caso está escrito à mão no teste, nunca recalculado pela conta que a prova mede.
- "Autor" é o `id` do usuário da sessão que chamou. As chaves de resposta são conferidas por igualdade exata do conjunto: as sete de um pagamento no `POST` (`PAYMENT_KEYS`), as seis de um pagamento dentro de `payments[]`, as dez de um período na ficha e as dez de um item da lista geral.
- Um `404` de `:id` ou de `:paymentId` não prova que a rota existe (o Nest responde `404 not_found` a rota que não existe, como notaram os Verifiers de `planos-matriculas`): quem prova que as quatro existem e decidem é a C19 (`403` com `uuid` de ninguém) e as C6, C21, C27 e C35.
- Nas telas, `FakeApi` passa a responder `GET /api/payments` (com o `status` da query), `GET` e `POST /api/students/:id/payments` e `DELETE /api/students/:id/payments/:paymentId`, com estado que as escritas mudam como a API mudaria, `401` sem sessão e `403` com `forbidden` a `reception` e `instructor`. Nenhuma prova de tela contra a `FakeApi` afirma uma linha de auditoria. O relógio do navegador é fixado pelo teste nas provas que dependem do dia (C63). Texto de valor em reais é comparado com o espaço normalizado: o `Intl` de `pt-BR` escreve U+00A0 entre `R$` e o número, e a prova troca U+00A0 por espaço antes de comparar com `R$ 99,90`.
- O check de tela que exige a API de verdade (C85) roda na stack do compose, sobre o `web` e a `api` reais, lendo o banco por `psql`.

### S0 - A tabela, o vocabulário, o contrato e a conta, antes de qualquer rota · ~8 files · ~28 KB · ~7k

**C1** - Depois de `pnpm db:migrate` num banco vazio, `payments` existe com as colunas `id`, `enrollment_id`, `amount_cents`, `paid_at`, `method`, `created_at` e `voided_at` e sem `status`, `due_date`, `student_id`, `deleted_at` e `tenant_id`; `paid_at` é do tipo `date` e `amount_cents` do tipo `integer`; a única chave estrangeira é `enrollment_id` para `enrollments(id)`, com regra de exclusão `NO ACTION`; não há `UNIQUE` além da chave primária (duas linhas iguais no mesmo período convivem); o insert a que falta `enrollment_id`, `amount_cents`, `paid_at` ou `method` falha por `NOT NULL` (quatro casos); uma linha inserida sem `id` recebe do banco um `uuid` de versão 7, `created_at` entre T0 e T1 e `voided_at` nulo; e o `DELETE` de um período que tem pagamento - anulado ou não, em período cancelado ou não (quatro casos) - falha por violação de chave estrangeira, com a linha do período e a do pagamento como estavam (door 1, AD-016, Relations, Impact "stored data")
Proof: `pnpm --filter "./packages/database" exec vitest run test/payments.test.ts -t "payments_table_has_no_status_due_date_student_id_and_defaults_and_no_cascade"`

**C2** - Aplicadas as migrações até a `0008`, inseridos um aluno, um plano e duas matrículas (uma cancelada) e só então aplicada a `0009`, a migração termina sem erro; o conjunto de tabelas do banco é o de antes mais `payments`, vazia; `pg_extension` é a de antes (`btree_gist` e `pg_trgm`, nenhuma a mais); as colunas de todas as tabelas de antes e as linhas de `students`, `plans` e `enrollments` são idênticas; e a soma de `payments` por matrícula é zero para as duas, de modo que o saldo de cada uma é o `price_cents` dela (door 1, Impact "stored data" e "ambiente")
Proof: `pnpm --filter "./packages/database" exec vitest run test/payments.test.ts -t "migration_0009_adds_only_payments_and_keeps_existing_tables_rows_and_extensions"`

**C3** - `AUDIT_ACTIONS` em `packages/contracts` tem trinta e oito valores: os trinta e seis de antes, na ordem de antes, seguidos de `student.payment_registered` e `student.payment_voided`, nessa ordem; e depois de percorrer as rotas de pagamento, o conjunto de ações gravadas em `audit_logs` é igual ao vocabulário inteiro, com `entity` igual a `student` nas duas novas (door 3, AD-025, AD-066)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_two_payment_actions_in_order"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "ten_actions_written_equal_contract_vocabulary"`

**C4** - Em `packages/contracts`, o schema de registro de pagamento aceita o corpo com `enrollmentId`, `amountCents`, `paidAt` e `method` e recusa, um a um, o corpo a que falta cada um dos quatro, o que traz `amountCents` igual a `0`, a `-1`, a `10000000`, a `99.9` e a `"5000"`, `method` igual a `PIX` e a `cheque`, `enrollmentId` igual a `abc` e `paidAt` igual a `2026-02-30` e a `26-10-07`; o schema de resposta do pagamento aceita o objeto de seis chaves e recusa uma sétima e `voidedAt` que não é um instante ISO 8601; o schema do período da ficha aceita o objeto de dez chaves com `status` em cada um de `paid`, `pending`, `overdue` e `cancelled` e recusa `status` igual a `scheduled` e o `plan` sem `period`; o schema do item da lista geral aceita o objeto de dez chaves e recusa um `student` com uma terceira chave; e o schema da query aceita `{}`, `pending` e `overdue` e recusa `paid`, `Pending` e a cadeia vazia (door 1, door 2, AD-006, AD-011, AD-029, Impact "contrato")
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "payment_schemas_accept_and_reject"`

**C5** - A conta do saldo e da situação em `packages/contracts`, chamada sem banco e sem HTTP, recebendo o valor do período, os pagamentos (cada um com o valor e se está anulado), o início, o `cancelledAt` e o dia, devolve para cada uma das dezesseis linhas o `dueDate`, o `paidCents`, o `balanceCents` e o `status` escritos à mão, com `dueDate` igual a `2026-10-07` em todas: para um período de `9990`, sem pagamento, `pending` em `2026-10-06` e em `2026-10-07` e `overdue` em `2026-10-08`; com `[5000]`, saldo `4990`, `pending` em `2026-10-07` e `overdue` em `2026-10-08`; com `[9989]`, saldo `1` e `overdue` em `2026-10-08`; com `[9990]`, saldo `0` e `paid` em `2026-10-06` e em `2026-10-08` (pago ganha de atrasado); com `[5000, 4990]`, `paid`; com `[5000 anulado, 2000]`, `paidCents` `2000`, saldo `7990` e `overdue` em `2026-10-08`; com `[9990 anulado]`, `paidCents` `0`, saldo `9990` e `overdue`; para um período de `0` sem pagamento, `paid` com saldo `0` em `2026-10-08`; cancelado e sem pagamento, saldo `9990` e `cancelled` em `2026-10-08`; cancelado com `[9990]`, saldo `0` e `cancelled` em `2026-10-06` (cancelado ganha de pago); e, recebendo o instante em vez do dia, `pending` em `2026-10-08T02:59:59Z` e `overdue` em `2026-10-08T03:00:00Z` (door 2, AD-061, AD-065)
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/payments.test.ts -t "balance_and_status_sixteen_rows_around_due_date_voided_cancelled_and_sao_paulo_midnight"`

### S1 - Registrar um pagamento · ~5 files · ~48 KB · ~14k

**C6** - `POST /api/students/:id/payments` de `admin` e de `hr_finance`, com o `enrollmentId` de um período `9990` não cancelado do aluno, `amountCents` `5000`, `paidAt` `2026-10-07` e `method` `pix`, responde `201` nos dois casos com exatamente as chaves `id`, `enrollmentId`, `amountCents`, `paidAt`, `method`, `createdAt` e `voidedAt`: `id` igual ao da linha lida por SQL, `enrollmentId`, `amountCents`, `paidAt` e `method` iguais aos enviados, `createdAt` um instante ISO 8601 entre T0 e T1 e `voidedAt` igual a `null`; cada um dos cinco valores de `method` (`cash`, `pix`, `debit_card`, `credit_card`, `bank_transfer`) é aceito e devolvido; e `amountCents` igual a `1` e `amountCents` igual ao saldo inteiro (`9990`, num período sem pagamento) são aceitos (AC 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "register_201_by_admin_and_hr_finance_with_the_seven_keys_five_methods_and_amount_edges"`

**C7** - `POST /api/students/:id/payments` responde `422` com um item em `errors` cujo `path` é `amountCents`, e nada é gravado, em cada um dos casos: `amountCents` ausente, `null`, `0`, `-1`, `10000000`, `99.9` e `"5000"`; e responde `201` para `9999999` num período de `priceCents` igual a `9999999` (AC 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "register_amount_seven_refusals_422_on_amount_cents_and_the_top_edge_accepted"`

**C8** - Com o relógio em `2026-10-07T15:00:00Z` e um período que começa em `2026-10-07`, `POST /api/students/:id/payments` responde `422` com um item cujo `path` é `paidAt`, e nada é gravado, para `paidAt` ausente, `null`, `2026-02-30`, `2026-13-01`, `26-10-07`, `07/10/2026`, `2026-10-08` (amanhã) e `2025-10-06` (366 dias antes do início); e `201` para `2026-10-07` (hoje) e `2025-10-07` (365 dias antes do início); com o relógio em `2026-10-08T02:59:59Z` (ainda dia 7 em São Paulo), `2026-10-08` responde `422` e `2026-10-07` responde `201`; com o relógio em `2026-10-08T03:00:00Z`, `2026-10-08` responde `201`; e, nos `201`, a coluna `paid_at` lida por SQL como texto e o `paidAt` devolvido são o dia enviado, também com o relógio em `02:59:59Z` (AC 3, door 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "register_paid_at_fourteen_cases_around_today_and_start_in_sao_paulo"`

**C9** - `POST /api/students/:id/payments` responde `422` com um item cujo `path` é `method`, e nada é gravado, para `method` ausente, `null`, vazio, `PIX`, `Pix`, `cheque`, `boleto` e `dinheiro` (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "register_method_eight_refusals_422_on_method"`

**C10** - `POST /api/students/:id/payments` responde `422` com um item cujo `path` é `enrollmentId`, e nada é gravado, para `enrollmentId` ausente, `null`, `abc`, `123`, um `uuid` de período nenhum e o `uuid` de um período de outro aluno (AC 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "register_six_invalid_enrollment_ids_422_on_enrollment_id"`

**C11** - `POST /api/students/:id/payments` sobre um período cancelado responde `409` com `code` igual a `enrollment_cancelled`, e nada é gravado, nos três casos: cancelado sem pagamento algum; cancelado com um pagamento de `5000` e saldo `4990`; e cancelado depois de pago por inteiro, com saldo `0` (cancelado vem antes de "maior que o saldo", decisão 1 da Intent) (AC 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "register_on_cancelled_period_409_enrollment_cancelled_three_cases"`

**C12** - `POST /api/students/:id/payments` responde `409` com `code` igual a `payment_exceeds_balance`, e nada é gravado, nos cinco casos: `9991` num período de `9990` sem pagamento; `4991` num período com `5000` pagos; `1` num período pago por inteiro (saldo `0`); `1` num período de `priceCents` igual a `0`; e o segundo de dois `5000` seguidos num período de `9990`, depois do primeiro `201` (AC 7, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "register_above_balance_five_cases_409_payment_exceeds_balance"`

**C13** - Num período de `9990`, `POST /api/students/:id/payments` de `3000` responde `201` duas vezes com o mesmo corpo, com dois `id` diferentes e duas linhas em `payments`; depois disso o período lido por SQL tem soma de não anulados `6000` e saldo `3990`; um terceiro `POST` de `3990` responde `201` e deixa o saldo em `0` e o período `paid` na leitura (AC 8, Assumptions "Pagamento parcial" e "Repetir a mesma requisição")
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "register_partial_twice_same_body_two_rows_then_the_rest_closes_the_balance"`

**C14** - `POST /api/students/:id/payments` responde `201` com as mesmas sete chaves para um período `scheduled` (relógio em `2026-10-06T15:00:00Z`, `paidAt` `2026-10-06`), `active` (relógio em `2026-10-07T15:00:00Z`, `paidAt` `2026-10-07`) e `expired` (relógio em `2026-11-07T15:00:00Z`, `paidAt` `2026-11-07`), sobre o período de `2026-10-07` a `2026-11-06` (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "register_on_scheduled_active_and_expired_period_201_alike"`

**C15** - `POST /api/students/:id/payments` sobre um aluno de `status` igual a `suspended` e sobre um de `inactive` responde `201` com as mesmas sete chaves que para um aluno `active`, e o `status` do aluno fica como estava (AC 10, Assumptions "Aluno inativo")
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "register_for_suspended_and_inactive_student_201_like_active"`

**C16** - Em dez rodadas de dois `POST /api/students/:id/payments` do mesmo período, soltos juntos, de `6000` cada num período de `9990` sem pagamento, um responde `201` e o outro `409` com `payment_exceeds_balance`; e ao fim de cada rodada o período tem exatamente uma linha em `payments`, a soma dos não anulados é `6000`, e `audit_logs` ganhou exatamente uma linha `student.payment_registered` (AC 11, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "two_simultaneous_registers_over_the_balance_one_201_one_409"`

**C17** - Por SQL, sem passar por rota nenhuma, o `INSERT` em `payments` falha por violação de `CHECK` (SQLSTATE `23514`) para `amount_cents` igual a `0` e a `-1`, e para `method` igual a `cheque`, `PIX`, `Pix`, `boleto` e à cadeia vazia; falha por violação de chave estrangeira (`23503`) para um `enrollment_id` que não existe; é aceito para `amount_cents` igual a `1` e a `9999999` e para cada um dos cinco valores de `method`; e depois de cada falha a contagem de `payments` é a de antes (AC 12, door 1)
Proof: `pnpm --filter "./packages/database" exec vitest run test/payments.test.ts -t "payments_checks_and_foreign_key_by_sql_fifteen_cases"`

**C18** - `GET` e `POST /api/students/:id/payments` e `DELETE /api/students/:id/payments/:paymentId`, com `:id` igual a `abc` e com um `uuid` de aluno nenhum, o `POST` com um corpo válido e o `DELETE` com o `:paymentId` de um pagamento que existe, respondem nos seis casos `404` com `code` igual a `not_found`, e nada é gravado (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "payment_routes_404_for_non_uuid_and_unknown_student"`

**C19** - Em cada um dos catorze casos - `reception` e `instructor` em `GET /api/students/:id/payments`, em `POST /api/students/:id/payments` e em `DELETE /api/students/:id/payments/:paymentId`, cada rota com ids que existem e com `uuid` de ninguém (doze), e os dois em `GET /api/payments` (dois) - a resposta é `403` com `code` igual a `forbidden`, o corpo não traz nenhuma das chaves `items`, `enrollmentId`, `amountCents`, `paidAt`, `method`, `priceCents`, `paidCents`, `balanceCents`, `student` e `plan`, e nada é gravado: o pagamento que o `DELETE` visava continua não anulado (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "reception_and_instructor_everything_403_fourteen_cases"`

**C20** - As quatro rotas de pagamento (`GET` e `POST /api/students/:id/payments`, `DELETE /api/students/:id/payments/:paymentId` e `GET /api/payments`), chamadas sem cookie, respondem `401` com `code` igual a `unauthorized`, e nada é gravado (AC 15)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "anonymous_401_on_four_payment_routes"`

### S2 - Anular um pagamento · ~1 file · ~9 KB · ~3k

**C21** - `DELETE /api/students/:id/payments/:paymentId` de `admin` e de `hr_finance` sobre um pagamento não anulado responde `204`; depois, a linha continua em `payments`, com `voided_at` entre T0 e T1 e todas as outras colunas como estavam (a linha sem `voided_at` é idêntica à de antes) (AC 16)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "void_204_sets_voided_at_from_database_and_keeps_row_and_other_columns"`

**C22** - `DELETE /api/students/:id/payments/:paymentId` sobre um pagamento já anulado responde `204` e deixa a linha idêntica, `voided_at` inclusive, com o mesmo instante de antes (AC 17)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "void_of_voided_204_changes_nothing"`

**C23** - Num período de `9990` pago por inteiro com um pagamento de `9990`, `POST` de `1` responde `409` com `payment_exceeds_balance`; depois de anular o pagamento, o saldo lido é `9990`, `POST` de `9990` responde `201` e `POST` de `1` volta a responder `409` (AC 18)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "void_returns_the_value_to_the_balance_and_a_new_register_fits_it"`

**C24** - Com um pagamento de `5000` num período que depois é cancelado por `DELETE /api/students/:id/enrollments/:enrollmentId`, `DELETE` do pagamento responde `204` e preenche `voided_at` do mesmo modo que num período não cancelado (AC 19)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "void_on_cancelled_period_204_like_on_a_live_one"`

**C25** - `DELETE /api/students/:id/payments/:paymentId` com `:paymentId` igual a `abc`, com um `uuid` de pagamento nenhum e com o `id` de um pagamento de outro aluno responde, nos três casos, `404` com `code` igual a `not_found`, e o pagamento do outro aluno fica idêntico, não anulado (AC 20)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "void_404_for_bad_unknown_and_other_students_payment_id"`

**C26** - Em dez rodadas de dois `DELETE /api/students/:id/payments/:paymentId` do mesmo pagamento, soltos juntos, os dois respondem `204`, a linha tem um só `voided_at` e `audit_logs` ganhou exatamente uma linha `student.payment_voided` (AC 21)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "two_simultaneous_voids_204_204_one_voided_at_one_audit_row"`

### S3 - Ver a situação de um aluno · ~1 file · ~11 KB · ~4k

**C27** - `GET /api/students/:id/payments` de `admin` e de `hr_finance` responde `200` com um item em `items` para cada período do aluno, cancelados inclusive, cada um com exatamente as chaves `enrollmentId`, `plan`, `startsAt`, `endsAt`, `dueDate`, `priceCents`, `paidCents`, `balanceCents`, `status` e `payments`, e `plan` com exatamente `id`, `name` e `period`; o corpo é igual para os dois perfis; a ordem é a de `startsAt` da mais recente para a mais antiga e, entre dois períodos de mesmo `startsAt` (um cancelado e o registrado depois no mesmo período), a de `enrollmentId` maior primeiro: com quatro períodos a ordem esperada está escrita à mão no teste (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "student_list_includes_cancelled_ordered_by_starts_at_desc_then_enrollment_id_desc_same_body_for_two_roles"`

**C28** - Em `payments` de cada período vêm todos os pagamentos dele, anulados inclusive, cada um com exatamente as chaves `id`, `amountCents`, `paidAt`, `method`, `createdAt` e `voidedAt`, em ordem de `paidAt` do mais recente para o mais antigo e, no empate, de `id` maior primeiro: com quatro pagamentos (dois no mesmo `paidAt`, um deles anulado) a ordem esperada está escrita à mão; `voidedAt` é `null` nos não anulados e um instante ISO 8601 nos anulados; e um período sem pagamento traz `payments` igual a `[]` (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "payments_inside_a_period_include_voided_ordered_by_paid_at_desc_then_id_desc"`

**C29** - Num período de `priceCents` `9990` e `startsAt` `2026-10-07` com os pagamentos de `5000` e de `2000` não anulados e um de `3000` anulado, o item traz `dueDate` `2026-10-07`, `paidCents` `7000` e `balanceCents` `2990`; sem pagamento algum, `paidCents` `0` e `balanceCents` `9990`; com `9990` não anulados e um de `1000` anulado, `paidCents` `9990` e `balanceCents` `0` (AC 24, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "due_date_paid_and_balance_exclude_voided_payments_three_periods"`

**C30** - Com o relógio em `2026-10-07T15:00:00Z`, um aluno por caso, o `status` do item é `pending` para um período de `startsAt` `2026-10-07` sem pagamento (o próprio `dueDate`) e para um de `startsAt` `2026-10-08` (véspera); `overdue` para um de `startsAt` `2026-10-06` (dia seguinte ao `dueDate`) com saldo; `paid` para um de `startsAt` `2026-09-01` pago por inteiro (pago ganha de atrasado); e `cancelled` para um cancelado com saldo e para um cancelado pago por inteiro; e para o período de `startsAt` `2026-10-07` sem pagamento o `status` é `pending` com o relógio em `2026-10-08T02:59:59Z` e `overdue` em `2026-10-08T03:00:00Z`, com a linha do período e as de `payments` lidas por SQL idênticas entre as duas leituras (AC 25, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "status_computed_on_read_four_values_across_sao_paulo_midnight_without_changing_a_row"`

**C31** - Um período de `priceCents` igual a `0` e sem pagamento devolve `status` igual a `paid`, `paidCents` `0`, `balanceCents` `0` e `payments` igual a `[]`, com o relógio um dia antes de `startsAt`, no dia e um dia depois (AC 26)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "zero_price_period_is_paid_without_any_payment_on_three_days"`

**C32** - `GET /api/students/:id/payments` de um aluno sem período algum responde `200` com `items` igual a `[]` (AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "student_without_period_200_empty"`

**C33** - Depois de o plano de um período ser renomeado de `Mensal` para `Mensal Plus` e reajustado para `10990`, a leitura devolve `plan.name` igual a `Mensal Plus`, `priceCents` igual a `9990` como foi gravado, e `balanceCents` igual a `9990` menos o pago (AC 28)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "student_list_shows_current_plan_name_and_recorded_price"`

**C34** - Depois de `DELETE /api/students/:id/enrollments/:enrollmentId` cancelar um período com um pagamento de `5000` e um anulado de `1000`, `GET /api/students/:id/payments` devolve o período com `status` igual a `cancelled`, `paidCents` `5000`, `balanceCents` `4990` e os dois pagamentos em `payments`; e a linha dos dois pagamentos é idêntica à de antes do cancelamento (AC 29, Assumptions "Período cancelado")
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "cancelled_period_keeps_its_payments_and_reads_cancelled"`

### S4 - Ver o que está pendente ou atrasado · ~1 file · ~12 KB · ~4k

**C35** - Com o relógio em `2026-10-07T15:00:00Z`, `GET /api/payments` de `admin` e de `hr_finance` responde `200` com um item em `items` para cada período não cancelado com `balanceCents` maior que zero, de aluno `active`, `inactive` ou `suspended`, cada um com exatamente as chaves `enrollmentId`, `student`, `plan`, `startsAt`, `endsAt`, `dueDate`, `priceCents`, `paidCents`, `balanceCents` e `status`, `student` com exatamente `id` e `name` (nenhuma chave de CPF, telefone, nascimento, observação de saúde ou situação do aluno) e `plan` com exatamente `id`, `name` e `period`, e `status` igual a `pending` ou `overdue`; o corpo é igual para os dois perfis; a ordem é a de `dueDate` crescente e, no empate, de `enrollmentId` crescente: com cinco períodos (vencimentos `2026-09-15`, `2026-10-07` duas vezes, `2026-10-20` e `2026-10-25`), nomes de aluno em ordem alfabética contrária à do vencimento e os três `status` de aluno, a ordem esperada está escrita à mão (AC 30)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "general_list_balance_periods_of_any_student_status_ordered_by_due_date_then_enrollment_id"`

**C36** - Com três períodos com saldo (`pending` com vencimento hoje, `overdue` com vencimento `2026-10-01` e `pending` com vencimento `2026-10-20`), `GET /api/payments?status=pending` devolve só o primeiro e o terceiro, `?status=overdue` só o segundo e a lista sem `status` os três; e, para o primeiro, com o relógio em `2026-10-08T02:59:59Z` `?status=pending` o traz e `?status=overdue` não, e com o relógio em `2026-10-08T03:00:00Z` `?status=overdue` o traz e `?status=pending` não (AC 31, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "status_filter_pending_overdue_and_none_across_the_sao_paulo_midnight"`

**C37** - `GET /api/payments` com `status` igual a `paid`, `cancelled`, `Pending`, `atrasado`, à cadeia vazia, a `pending&status=overdue` (repetido, com valores diferentes) e a `pending&status=pending` (repetido, com o mesmo valor) responde, nos sete casos, `422` com `code` igual a `validation_failed` e um item em `errors` cujo `path` é `status` (AC 32, AD-029)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "status_filter_seven_invalid_values_422_on_status"`

**C38** - `GET /api/payments` deixa de fora, entre cinco períodos, o cancelado com saldo, o cancelado sem pagamento, o pago por inteiro e o de `priceCents` igual a `0`, e traz só o que tem saldo e não está cancelado (um com pagamento parcial) (AC 33)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "general_list_leaves_out_cancelled_paid_and_zero_price_periods"`

**C39** - `GET /api/payments` sem período algum com saldo responde `200` com `items` igual a `[]` (AC 34)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "general_list_without_balance_200_empty"`

**C40** - Para seis períodos de situações diferentes, `paidCents`, `balanceCents` e `status` de cada período que aparece em `GET /api/payments` são iguais aos do mesmo período em `GET /api/students/:id/payments`, com o relógio em `2026-10-07T15:00:00Z`, em `2026-10-08T02:59:59Z` e em `2026-10-08T03:00:00Z` (AC 35, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "both_read_routes_agree_on_paid_balance_and_status_across_the_sao_paulo_midnight"`

**C41** - `GET /api/students/:id/payments` e `GET /api/payments` que respondem `200`, cada um por `admin` e por `hr_finance` (quatro leituras), deixam a contagem de `audit_logs` igual à de antes (AC 36, Assumptions "Leitura na trilha")
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "four_reads_of_payments_write_no_audit_row"`

### S5 - Cada escrita deixa rastro, na mesma transação · ~1 file · ~21 KB · ~6k

**C42** - `POST /api/students/:id/payments` que responde `201`, de `admin` e de `hr_finance`, grava exatamente uma linha em `audit_logs`, com `action` igual a `student.payment_registered`, `user_id` igual ao id do autor, `entity` igual a `student` e `entity_id` igual ao id do aluno (AC 37)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "register_writes_one_payment_registered_row"`

**C43** - O registro com `amountCents` `5000`, `paidAt` `2026-10-07` e `method` `pix` grava `diff` igual a `{"fields":["enrollmentId","amountCents","paidAt","method"],"values":{"enrollmentId":{"from":null,"to":"<enrollmentId>"},"amountCents":{"from":null,"to":5000},"paidAt":{"from":null,"to":"2026-10-07"},"method":{"from":null,"to":"pix"}}}` (AC 38, AD-026)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "register_diff_records_four_values_with_null_from"`

**C44** - `DELETE /api/students/:id/payments/:paymentId` que anula o pagamento padrão grava exatamente uma linha com `action` igual a `student.payment_voided`, `user_id` do autor, `entity` igual a `student`, `entity_id` igual ao id do aluno e `diff` igual a `{"fields":["enrollmentId","amountCents","paidAt","method"],"values":{"enrollmentId":{"from":"<enrollmentId>","to":null},"amountCents":{"from":5000,"to":null},"paidAt":{"from":"2026-10-07","to":null},"method":{"from":"pix","to":null}}}` (AC 39)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "void_writes_one_payment_voided_row_with_null_to"`

**C45** - Cada um dos dezessete desfechos a seguir responde exatamente o status do caso e deixa a contagem de `audit_logs` igual à de antes: `401` nas quatro rotas; `403` de `reception` nas quatro rotas; `404` em `GET /api/students/:id/payments` e em `POST` com aluno que não existe, e em `DELETE` com aluno que não existe e com pagamento que não existe; `409` com `enrollment_cancelled` e com `payment_exceeds_balance`; `422` em `POST` com corpo inválido e em `GET /api/payments` com `status` inválido; e o `DELETE` de um pagamento já anulado (`204`) (AC 40)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "seventeen_non_writing_outcomes_write_no_audit_row"`

**C46** - Com o insert em `audit_logs` falhando, `POST /api/students/:id/payments` e `DELETE /api/students/:id/payments/:paymentId` respondem `500` com `code` igual a `internal_error`, e `payments` fica como estava antes da requisição (contagem e linhas idênticas, `voided_at` inclusive: o pagamento que o `DELETE` visava continua não anulado) (AC 41, AD-027)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "audit_insert_failure_500_rolls_back_register_and_void"`

**C47** - Para cada uma das duas ações (`student.payment_registered` e `student.payment_voided`), a linha grava `ip` igual a `203.0.113.7` e `user_agent` igual aos 512 primeiros caracteres quando a requisição vem com `X-Forwarded-For: 198.51.100.1, 203.0.113.7` e `User-Agent` de 513 caracteres; o mesmo `ip` com `X-Forwarded-For: 203.0.113.7` só; e `user_agent` nulo sem `User-Agent` - os três casos afirmados em cada uma das duas (AC 42, AD-028)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "ip_and_user_agent_three_cases_on_each_of_two_actions"`

**C48** - Depois de cadastrar o aluno `Rafaela Prado Cunha` de CPF `529.982.247-25`, matriculá-la, registrar um pagamento e anulá-lo, o texto de todas as colunas de todas as linhas de `audit_logs` não contém o nome da aluna nem o CPF, com ou sem máscara (AC 43)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-audit.test.ts -t "student_name_and_cpf_never_reach_audit_logs_on_payments"`

### S6 - Telas de pagamentos · ~7 files · ~58 KB · ~16k

**C49** - O link "Pagamentos", que leva a `/payments`, aparece no menu para `admin` e para `hr_finance` e não existe para `reception` nem para `instructor` (AC 44)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "payments_link_only_for_admin_and_hr_finance"`

**C50** - Sem sessão, abrir `/payments` redireciona para `/login`, sem nenhuma requisição a `/api/payments` registrada pela `FakeApi` (AC 45)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "anonymous_payments_url_redirects_to_login"`

**C51** - Para `reception` e para `instructor`, `/payments` exibe "Você não tem permissão para acessar esta página.", não exibe a tabela, e o texto da página não contém o nome do aluno, o nome do plano nem nenhum valor `R$` que a `FakeApi` tem (AC 46)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "reception_and_instructor_see_no_permission_and_no_payment_data"`

**C52** - Para `admin` e para `hr_finance`, `/payments` exibe o título "Pagamentos", o campo "Situação" cujas opções são, nessa ordem, "Todas", "Pendente" e "Atrasado", e uma tabela de colunas "Aluno", "Plano", "Período", "Pagar até", "Valor", "Pago", "Saldo" e "Situação", nessa ordem, com as linhas na ordem em que a API as devolve (uma ordem que não é a alfabética nem a de saldo) (AC 47)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "list_title_situation_field_eight_columns_and_api_order_for_two_roles"`

**C53** - `/payments` exibe o nome do aluno como link para `/students/<id>`; `startsAt` `2026-10-07` e `endsAt` `2026-11-06` como `07/10/2026 a 06/11/2026` na coluna "Período" e `dueDate` `2026-10-07` como `07/10/2026` em "Pagar até"; `priceCents` `9990`, `paidCents` `5000` e `balanceCents` `4990` como `R$ 99,90`, `R$ 50,00` e `R$ 49,90`; `0` como `R$ 0,00`, `123456` como `R$ 1.234,56` e `9999999` como `R$ 99.999,99`; `pending` e `overdue` como "Pendente" e "Atrasado"; e o plano como `<nome> · <periodicidade>` para `monthly`, `quarterly`, `semiannual` e `annual` (`Mensal · Mensal`, `Black · Trimestral`, `Prata · Semestral`, `Ouro · Anual`) (AC 48)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "list_formats_student_link_dates_period_money_status_and_plan_with_four_periods"`

**C54** - Escolher "Pendente" em "Situação" carrega `/payments?status=pending` e a `FakeApi` recebe `GET /api/payments` com `status` igual a `pending`, e a tabela mostra só as linhas pendentes; escolher "Atrasado" carrega `/payments?status=overdue` com `status` igual a `overdue`; escolher "Todas" carrega `/payments` e a requisição não traz `status`; e abrir `/payments?status=overdue` direto mostra "Atrasado" escolhido no campo (AC 49, decisão 3 da Intent)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "situation_choice_loads_status_query_and_reopening_keeps_it"`

**C55** - Com `items` vazio, e com a escolha "Atrasado" quando a `FakeApi` só tem períodos pendentes, `/payments` exibe "Nenhum pagamento pendente ou atrasado." no lugar da tabela, nos dois casos (AC 50)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "empty_list_shows_no_pending_or_overdue_message_on_two_cases"`

**C56** - Quando `GET /api/payments` falha (a `FakeApi` responde `500`), `/payments` exibe "Não foi possível carregar os pagamentos." e o botão "Tentar novamente"; acionado depois de a `FakeApi` voltar a responder, o botão traz a tabela (AC 51)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "load_failure_shows_retry_and_retry_brings_the_table"`

**C57** - Para `admin` e para `hr_finance`, `/students/<id>` exibe o bloco "Pagamentos" com uma tabela de colunas "Período", "Pagar até", "Valor", "Pago", "Saldo" e "Situação", nessa ordem, com as linhas na ordem em que a API as devolve (uma ordem que não é a de data), `dueDate` como `dd/MM/aaaa`, os valores como `R$ 99,90`, e `paid`, `pending`, `overdue` e `cancelled` como "Pago", "Pendente", "Atrasado" e "Matrícula cancelada" (AC 52, Observable)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "block_six_columns_api_order_and_four_status_labels_for_two_roles"`

**C58** - Sob cada período que tem pagamento, o bloco exibe uma linha por pagamento, anulados inclusive, na ordem em que a API os devolve, com a data como `07/10/2026`, o valor como `R$ 50,00` e a forma como "Dinheiro", "Pix", "Cartão de débito", "Cartão de crédito" ou "Transferência" para `cash`, `pix`, `debit_card`, `credit_card` e `bank_transfer`; o pagamento anulado traz o texto "Anulado" e o não anulado não; e o período sem pagamento não tem linha nenhuma sob ele (AC 53)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "payment_lines_under_each_period_with_five_method_labels_and_anulado_only_on_voided"`

**C59** - Com `items` vazio, o bloco exibe "Nenhum período para cobrar." e não exibe a tabela (AC 54)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "empty_block_shows_no_period_to_charge"`

**C60** - Quando `GET /api/students/<id>/payments` falha (a `FakeApi` responde `500`), o bloco exibe "Não foi possível carregar os pagamentos." e o botão "Tentar novamente", e a ficha continua exibindo o nome do aluno e o bloco "Matrículas" (AC 55)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "payments_load_failure_shows_retry_without_hiding_ficha"`

**C61** - Para `reception` e para `instructor`, `/students/<id>` exibe o nome do aluno, não exibe o texto "Pagamentos" como bloco, e a `FakeApi` não registra nenhuma requisição a `/api/students/<id>/payments` nem a `/api/payments` (AC 56)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "reception_and_instructor_have_no_payments_block_and_no_payment_calls"`

**C62** - Para `admin` e para `hr_finance`, o botão "Registrar pagamento" aparece num período `pending` com saldo `R$ 49,90` e num `overdue` com saldo, e não aparece num período `paid` (saldo zero) nem num `cancelled` com saldo (AC 57)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "registrar_button_only_on_open_balance_of_a_live_period_four_states"`

**C63** - Acionar "Registrar pagamento" num período de saldo `R$ 49,90` abre um diálogo com o campo "Valor (R$)" preenchido com `49,90`, o campo "Data do pagamento" preenchido com `2026-10-07` com o relógio do navegador em `2026-10-08T02:59:59Z` e com `2026-10-08` em `2026-10-08T03:00:00Z`, o campo "Forma de pagamento" cujas opções, descontada uma opção vazia de orientação, se houver, são "Dinheiro", "Pix", "Cartão de débito", "Cartão de crédito" e "Transferência", nessa ordem, e o botão "Confirmar", sem nenhuma requisição de escrita; escolhido "Pix", "Confirmar" envia exatamente um `POST /api/students/<id>/payments` com o corpo `{"enrollmentId":"<id do período>","amountCents":4990,"paidAt":"2026-10-07","method":"pix"}` (AC 58, Assumptions "Formato do valor na tela")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "dialog_prefills_balance_and_sao_paulo_today_and_posts_only_after_confirm"`

**C64** - Com "Valor (R$)" vazio, igual a `abc`, a `99,999` e a `-5,00`, acionar "Confirmar" exibe "Informe um valor em reais, como 99,90." junto do campo (descrição acessível do campo) e a `FakeApi` não registra nenhuma requisição de escrita (AC 59)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "invalid_amount_four_values_shows_message_and_sends_nothing"`

**C65** - Depois de a API responder `201` ao `POST` de `5000` sobre um período de `9990`, o diálogo fecha e o bloco exibe, sob o período, a linha `07/10/2026`, `R$ 50,00` e "Pix", com "Pago" igual a `R$ 50,00`, "Saldo" igual a `R$ 49,90` e a situação como estava; e depois de um segundo `POST` de `4990`, "Saldo" igual a `R$ 0,00`, situação "Pago" e nenhum botão "Registrar pagamento" no período (AC 60, AC 57)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "block_shows_new_payment_balance_and_paid_status_after_confirm"`

**C66** - Com a API respondendo `409` com `enrollment_cancelled` e com `payment_exceeds_balance`, o diálogo exibe, respectivamente, "Esta matrícula foi cancelada." e "O valor é maior que o saldo do período.", continua aberto e mantém o valor, a data e a forma preenchidos; e com a API respondendo `422` com um item de `path` `amountCents`, de `paidAt` ou de `method`, o diálogo exibe a mensagem da API junto do campo "Valor (R$)", "Data do pagamento" ou "Forma de pagamento", respectivamente (descrição acessível do campo) (AC 61, decisão 2 da Intent)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "two_409_codes_and_three_422_paths_show_their_messages_and_keep_the_choices"`

**C67** - Para `admin` e para `hr_finance`, cada linha de pagamento não anulado exibe o botão "Anular" e a linha de pagamento anulado não o exibe (AC 62)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "anular_button_only_on_payments_not_voided"`

**C68** - Acionar "Anular" numa linha abre um diálogo cujo texto contém o nome do aluno, `R$ 50,00` e `07/10/2026`, e não envia requisição nenhuma; desistir fecha o diálogo sem requisição; confirmar envia exatamente um `DELETE /api/students/<id>/payments/<paymentId>`, e depois do `204` a linha exibe "Anulado", não tem mais o botão "Anular" e o "Saldo" do período volta ao valor de antes do pagamento (AC 63)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "void_confirms_naming_student_amount_and_date_then_deletes_and_returns_the_balance"`

### S7 - A trilha de pagamento na tela de Auditoria · ~2 files · ~38 KB · ~2k

**C69** - `/audit` exibe na coluna "Ação" "Pagamento registrado" e "Pagamento anulado" para as linhas das duas ações novas; e o filtro "Ação" oferece as trinta e oito ações, as duas novas nas posições 37 e 38, nessa ordem, com as trinta e seis primeiras na ordem e com o texto de antes (AC 64)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "payment_actions_labelled_and_filter_has_thirty_eight"`

**C70** - Uma linha `student.payment_registered` com o `diff` da C43 exibe em "Detalhes" "Valor: — → R$ 50,00", "Data do pagamento: — → 07/10/2026" e "Forma de pagamento: — → Pix", e em "Alvo" o link "Ver aluno" que leva a `/students/<entityId>` (AC 65)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "payment_registered_details_show_value_date_and_method_with_ver_aluno"`

**C71** - Uma linha `student.payment_voided` com o `diff` da C44 exibe em "Detalhes" "Valor: R$ 50,00 → —", "Data do pagamento: 07/10/2026 → —" e "Forma de pagamento: Pix → —", e em "Alvo" o link "Ver aluno" que leva a `/students/<entityId>` (AC 66; o alvo é derivado de Impact "web")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "payment_voided_details_show_value_date_and_method_to_dash"`

### S8 - Contrato, montagem, concorrência, regressão, o que a tela envia e stack · ~9 files · ~40 KB · ~8k

**C72** - No documento de `GET /api/openapi.json`, `/api/students/{id}/payments` traz `get` e `post`; `/api/students/{id}/payments/{paymentId}` traz `delete` e nenhum corpo; `/api/payments` traz `get` com o parâmetro `status` declarado pelo schema de `packages/contracts` com os valores `pending` e `overdue`; e o corpo de `post` é `application/json` pelo schema de `packages/contracts` (AD-011, AD-029, Impact "portão")
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "payment_paths_declared_with_json_body_and_status_parameter"`

**C73** - Os corpos reais de `POST /api/students/:id/payments` (`201`), `GET /api/students/:id/payments` (`200`, vazio e com itens) e `GET /api/payments` (`200`, vazio e com itens) validam contra os schemas de resposta de `packages/contracts`; os corpos reais `401`, `403`, `404`, `409` e `422` das rotas novas validam contra o schema de erro; e `enrollment_cancelled` e `payment_exceeds_balance` são, cada um, o `code` de um `409` real (AD-009, AD-011, Impact "contrato")
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "payment_bodies_match_contract_schemas_and_two_new_codes"`

**C74** - `admin` sem 2FA ativo recebe `403` com `code` igual a `two_factor_enrollment_required` nas quatro rotas novas, e a lista de rotas bloqueadas escrita no teste as inclui (Surface, `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C75** - Cada uma das duas rotas de escrita (`POST /api/students/:id/payments` e `DELETE /api/students/:id/payments/:paymentId`), com `Origin` igual a `http://evil.example` e sem `Origin` com `Sec-Fetch-Site: cross-site`, responde `403` com `code` igual a `csrf_rejected`, e nada é gravado; reenviadas da origem certa, respondem `201` e `204` (AD-020)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "foreign_origin_403_csrf_on_two_write_routes"`

**C76** - Com entrada hostil (`a\u0000b`, `\ud800`, 50 emojis, 60 000 caracteres, `' or 1=1 --`, `%00`, `\`) em `enrollmentId`, `amountCents`, `paidAt` e `method` do `POST` e em `status` de `GET /api/payments`, com segmentos hostis (`%E0%A4%A`, `%00`, `a%2Fb`, `..%2F..`, 5 000 caracteres) no `:id` das três rotas de aluno e no `:paymentId`, e com corpos `[]`, `null`, `7`, `"texto"` e `{"amountCents":{"a":1}}` no `POST`, nenhuma resposta tem status `5xx` (derivado: as N1 a N3 da verificação da `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/hostile-input.test.ts -t "hostile_input_never_answers_5xx"`

**C77** - Em dez rodadas de cada par solto junto, nenhuma resposta tem status `500` ou maior, e: um `DELETE` do pagamento A (`6000`, num período de `9990`) e um `POST` de `6000` do mesmo período respondem `204` e `201` ou `409` com `payment_exceeds_balance`, e ao fim a soma dos não anulados é `6000`; um `DELETE /api/students/:id/enrollments/:enrollmentId` do período e um `POST` de pagamento nele respondem `204` e `201` ou `409` com `enrollment_cancelled`, e ao fim o período está cancelado e `payments` tem uma linha se o `POST` respondeu `201` e nenhuma se respondeu `409`; e dois `POST` de `3000` do mesmo período respondem `201` aos dois, com soma `6000` (door 2, Assumptions "O teto da soma é do código"; derivado, sem AC própria)
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts -t "three_racing_pairs_never_5xx_and_the_sum_never_passes_the_price"`

**C78** - Para um aluno com dois períodos e dois pagamentos, `GET /api/students/:id/enrollments` traz em cada item exatamente as oito chaves de antes; `GET /api/students/:id` e o item dele em `GET /api/students` trazem, para cada um dos quatro perfis, exatamente as mesmas chaves que trazem para um aluno sem pagamento; `DELETE /api/students/:id/enrollments/:enrollmentId` deixa as linhas de `payments` do período idênticas e grava exatamente uma linha, `student.enrollment_cancelled`, e nenhuma `student.payment_voided`; e `DELETE /api/students/:id` deixa as linhas de `payments` idênticas e grava exatamente uma linha, `student.inactivated` (Impact "comportamento existente")
Proof: `pnpm --filter "./apps/api" exec vitest run test/payments-read.test.ts -t "neighbour_routes_keep_their_keys_and_never_touch_payments"`

**C79** - O diálogo de "Registrar pagamento" envia `amountCents` igual a `4990` para `49,90`, a `5000` para `50`, a `5050` para `50,5`, a `1` para `0,01` e a `0` para `0,00` (o último, que a API recusa com `422`, é o caso da decisão 2 da Intent) (derivado de AC 58, AD-059; Assumptions "Formato do valor na tela")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "amount_typed_in_reais_is_sent_in_cents_five_values"`

**C80** - Enquanto a API não responde ao `POST` do diálogo de registro e ao `DELETE` do diálogo de anulação, o botão "Confirmar" do primeiro e o de confirmação do segundo ficam desabilitados (Observable, loading state "existing" provado nas telas novas; Assumptions "Repetir a mesma requisição")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "confirm_buttons_disabled_while_waiting_on_both_dialogs"`

**C81** - Renderizar `/students/<id>` faz a página pedir à API, para `admin` e para `hr_finance`, `GET /api/students/<id>/payments` exatamente uma vez, `GET /api/students/<id>/enrollments` exatamente uma vez e `GET /api/plans` exatamente uma vez, como antes para os dois últimos (Flow "Telas" 2, Impact "web")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "ficha_asks_for_payments_once_for_the_two_money_roles"`

**C82** - Com o aluno de `status` igual a `inactive`, a ficha exibe o bloco "Pagamentos" com os períodos dele e o botão "Registrar pagamento" nos que têm saldo, e o `POST` do diálogo é enviado (derivado de AC 10; Assumptions "Aluno inativo")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "inactive_student_still_shows_the_block_and_accepts_a_payment"`

**C83** - Um aluno cujo nome é `<b>x</b> Souza` aparece como o texto literal `<b>x</b> Souza`, sem criar nenhum elemento `b`, na coluna "Aluno" de `/payments` e no texto do diálogo de "Anular" (derivado das Assumptions e de Impact "web"; o nome é texto livre de outra feature)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts -g "student_name_markup_shown_as_literal_text_in_list_and_void_dialog"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-payments.spec.ts -g "student_name_markup_shown_as_literal_text_in_void_dialog"`

**C84** - Em `/audit`, cinco linhas `student.payment_registered`, uma por forma, exibem em "Detalhes" "Forma de pagamento: — → Dinheiro", "Forma de pagamento: — → Pix", "Forma de pagamento: — → Cartão de débito", "Forma de pagamento: — → Cartão de crédito" e "Forma de pagamento: — → Transferência" para `cash`, `pix`, `debit_card`, `credit_card` e `bank_transfer` (derivado de Impact "contrato" e da AC 53; decisão 4 da Intent)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "payment_method_five_values_labelled_in_details"`

**C85** - Na stack de pé, com a migração `0009` aplicada ao subir pelo papel do `compose.yaml` (a tabela `payments` existe e `pg_extension` não ganhou extensão nenhuma), e um usuário `hr_finance`, um `reception` e um `instructor` criados pelo próprio teste, pela origem do container `web` e com `User-Agent` e `X-Forwarded-For` escolhidos: `hr_finance` cria um plano `monthly` de `9990` e matricula um aluno a partir de hoje em `America/Sao_Paulo`, registra `5000` em `pix` (`201`) e lê `paidCents` `5000`, `balanceCents` `4990` e `status` `pending` na ficha; um segundo `POST` de `5000` responde `409` com `payment_exceeds_balance`; `reception` recebe `403` ao registrar e ao ler; abrir `/payments` com a sessão de `hr_finance` exibe o nome do aluno e `R$ 49,90`, abrir `/students/<id>` com a mesma sessão exibe "Pagamentos" e "Pix", e abrir `/payments` com a de `reception` e com a de `instructor` exibe "Você não tem permissão para acessar esta página."; anulado o pagamento, o `psql` da stack mostra a linha com `voided_at` preenchido e a leitura volta a `balanceCents` `9990`; ao fim, `audit_logs` tem exatamente uma linha `student.payment_registered` e uma `student.payment_voided`, com o `ip` e o `user_agent` enviados, e a abertura das três páginas não acrescentou linha nenhuma (AC 1, AC 7, AC 14, AC 16, AC 24, AC 37, AC 39, AC 42, AC 46, AC 47, AC 52, door 1, door 3, Impact "ambiente", Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "payment_registered_and_voided_through_web_with_exceeding_refused_and_audit_rows"`

## Coverage

Uma linha para cada rota da `Surface`, com os status como membros, e uma por perfil; depois as doors, o que `Relations` acrescenta, os conjuntos enumerados nos critérios, nas `Assumptions` e na `Observable`, e as montagens.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/students/:id/payments` statuses (4) | 200 C27 · 401 C20 · 403 C19 · 404 C18 | - |
| `POST /api/students/:id/payments` statuses (6) | 201 C6 · 401 C20 · 403 C19 · 404 C18 · 409 C11, C12 · 422 C7 | - |
| `DELETE /api/students/:id/payments/:paymentId` statuses (4) | 204 C21 · 401 C20 · 403 C19 · 404 C18, C25 | - |
| `GET /api/payments` statuses (4) | 200 C35 · 401 C20 · 403 C19 · 422 C37 | - |
| status `500` fora da `Surface`, por rota de escrita (2) | `POST` do pagamento C46 · `DELETE` do pagamento C46 | - |
| códigos do `409` do pagamento (2) | `enrollment_cancelled` C11 · `payment_exceeds_balance` C12 | - |
| quem escreve, por perfil (4) | `admin` C6, C21 · `hr_finance` C6, C21 · `reception` C19 · `instructor` C19 | - |
| quem lê, por perfil (4) | `admin` C27, C35 · `hr_finance` C27, C35 · `reception` C19 · `instructor` C19 | - |
| linha de erro comum da `auth-rbac` nas rotas novas (3) | `401 unauthorized` C20 · `403 csrf_rejected` C75 · `403 two_factor_enrollment_required` C74 | - |
| casos negados nas quatro rotas (14) | C19, table-driven over all 14 | - |
| rotas sem sessão (4) | `GET` do aluno C20 · `POST` C20 · `DELETE` C20 · `GET /api/payments` C20 | - |
| rotas de escrita sob a checagem de origem (2) | C75, table-driven over all 2 | - |
| rotas bloqueadas ao `admin` sem 2FA (4) | C74, table-driven over all 4 | - |
| rotas no documento OpenAPI (4) | C72, table-driven over all 4 | - |
| `:id` inválido por rota com `:id` (3) | `GET` do aluno C18 · `POST` C18 · `DELETE` C18 | - |
| `:paymentId` inválido (3) | `abc` C25 · `uuid` de pagamento nenhum C25 · pagamento de outro aluno C25 | - |
| one-way doors (3) | door 1 C1, C2, C17 · door 2 C5, C12, C30 · door 3 C3, C43, C44 | - |
| relações de `Relations` (1) | período e pagamentos C1, C6 | - |
| one-way constraints de `Relations` (6) | um período por pagamento, sem cascata e sem aluno C1 · valor nunca zero nem negativo C17 · forma é uma de cinco C17 · anular é a única mudança, uma vez C21, C22 · situação não guardada C1, C30 · vencimento da cobrança não guardado C1, C30 | - |
| o que `payments` não tem (6) | `status` C1 · `due_date` C1 · `student_id` C1 · `deleted_at` C1 · `tenant_id` C1 · `UNIQUE` além da chave C1 | - |
| `NOT NULL` de `payments` (4) | `enrollment_id` C1 · `amount_cents` C1 · `paid_at` C1 · `method` C1 | - |
| período que tem pagamento não é apagado (4) | anulado em período vivo C1 · anulado em período cancelado C1 · não anulado em período vivo C1 · não anulado em período cancelado C1 | - |
| valores de `method` no banco (10) | `cash` C17 · `pix` C17 · `debit_card` C17 · `credit_card` C17 · `bank_transfer` C17 · `cheque` C17 · `PIX` C17 · `Pix` C17 · `boleto` C17 · cadeia vazia C17 | - |
| `amount_cents` no banco (5 edges) | `1` C17 · `9999999` C17 · `0` C17 · `-1` C17 · nulo C1 | - |
| `enrollment_id` no banco (2) | existente aceito C17 · inexistente recusado C17 | - |
| o que a migração `0009` deixa no banco (6) | `payments` C2 · vazia C2 · nenhuma extensão nova C2 · tabelas e colunas de antes intactas C2 · linhas de antes intactas C2 · saldo igual ao valor nos períodos de antes C2 | - |
| vocabulário de `AUDIT_ACTIONS` (38) | C3, table-driven over all 38: os trinta e seis de antes e os dois novos | - |
| quem grava cada ação nova (2) | `student.payment_registered` C42 · `student.payment_voided` C44 | - |
| campos de pagamento na trilha (4) | `enrollmentId` C43, C44 · `amountCents` C43, C44 · `paidAt` C43, C44 · `method` C43, C44 | - |
| forma do `diff` de pagamento (2) | `from` nulo no registro C43 · `to` nulo na anulação C44 | - |
| desfechos que não gravam linha (17) | C45, table-driven over all 17 | - |
| leituras `200` que não gravam (4) | C41, table-driven over all 4: duas rotas por dois perfis | - |
| rotas que desfazem quando a auditoria falha (2) | `POST` do pagamento C46 · `DELETE` do pagamento C46 | - |
| `ip` e `user_agent` da linha (4) | dois valores em `X-Forwarded-For` C47 · um valor C47 · `User-Agent` de 513 caracteres cortado em 512 C47 · sem `User-Agent` C47 | - |
| ações que gravam `ip` e `user_agent` (2) | C47, table-driven over all 2, os três casos em cada uma | - |
| o que fica fora de `audit_logs` (3) | nome do aluno C48 · CPF com máscara C48 · CPF sem máscara C48 | - |
| `amountCents` na API (14) | ausente C7 · `null` C7 · `0` C7 · `-1` C7 · `10000000` C7 · `99.9` C7 · `"5000"` C7 · `1` C6 · `9999999` C7 · o saldo inteiro C6 · saldo mais 1 C12 · `1` com saldo zero C12 · `1` em período de valor zero C12 · segundo `5000` de dois C12 | - |
| `paidAt` na API (14) | ausente C8 · `null` C8 · `2026-02-30` C8 · `2026-13-01` C8 · `26-10-07` C8 · `07/10/2026` C8 · amanhã C8 · 366 dias antes do início C8 · hoje C8 · 365 dias antes do início C8 · `02:59:59Z` da virada, o dia 8 recusado C8 · `02:59:59Z` da virada, o dia 7 aceito C8 · `03:00:00Z` da virada, o dia 8 aceito C8 · dia gravado e devolvido sem deslocamento C8 | - |
| `method` na API (13) | `cash` C6 · `pix` C6 · `debit_card` C6 · `credit_card` C6 · `bank_transfer` C6 · ausente C9 · `null` C9 · vazio C9 · `PIX` C9 · `Pix` C9 · `cheque` C9 · `boleto` C9 · `dinheiro` C9 | - |
| `enrollmentId` inválido (6) | ausente C10 · `null` C10 · `abc` C10 · `123` C10 · `uuid` de período nenhum C10 · período de outro aluno C10 | - |
| períodos que aceitam pagamento por situação (4) | `scheduled` C14 · `active` C14 · `expired` C14 · `cancelled` recusado C11 | - |
| período cancelado recusa por estado do saldo (3) | sem pagamento C11 · com saldo C11 · saldo zero C11 | - |
| aluno que aceita pagamento por situação (3) | `active` C6 · `suspended` C15 · `inactive` C15 | - |
| pagamento parcial (4) | parte do saldo aceita C13 · outro até o novo saldo C13 · mesmo corpo duas vezes, duas linhas C13 · o resto fecha o saldo C13 | - |
| teto da soma sob a trava do período (5) | dois que passam do saldo C16 · um pagamento e um estorno C77 · um pagamento e o cancelamento do período C77 · dois que cabem C77 · segundo depois do primeiro C12 | - |
| o que anular faz (5) | `voided_at` do relógio do banco C21 · a linha fica C21 · nenhuma outra coluna muda C21 · o saldo volta C23 · aceita outro registro até o saldo C23 | - |
| anular por estado (3) | não anulado vira anulado C21 · já anulado nada muda C22 · em período cancelado C24 | - |
| leitura da ficha (6) | cancelados inclusive C27 · ordem por `startsAt` decrescente C27 · empate por `enrollmentId` decrescente C27 · mesmo corpo para dois perfis C27 · lista vazia C32 · pagamentos anulados dentro C28 | - |
| ordem dos pagamentos dentro do período (3) | `paidAt` decrescente C28 · empate por `id` decrescente C28 · período sem pagamento, lista vazia C28 | - |
| chaves do período na ficha (10) | C27, table-driven over all 10 | - |
| chaves de `plan` dentro do período (3) | `id` C27 · `name` C27 · `period` C27 | - |
| chaves do pagamento dentro do período (6) | C28, table-driven over all 6 | - |
| chaves do pagamento no `POST` (7) | C6, table-driven over all 7 | - |
| chaves do item da lista geral (10) | C35, table-driven over all 10 | - |
| chaves de `student` na lista geral (2) | `id` C35 · `name` C35 | - |
| o que o aluno da lista geral não traz (5) | CPF C35 · telefone C35 · nascimento C35 · observação de saúde C35 · situação do aluno C35 | - |
| conta do saldo e da situação no próprio nível (16) | C5, table-driven over all 16 | - |
| valores de `status` do pagamento (4) | `paid` C5, C30 · `pending` C5, C30 · `overdue` C5, C30 · `cancelled` C5, C30 | - |
| situação nas bordas do vencimento (4 edges) | véspera do vencimento C5, C30 · dia do vencimento C5, C30 · dia seguinte C5, C30 · saldo de um centavo C5 | - |
| virada do dia em `America/Sao_Paulo` na situação (2 edges) | `02:59:59Z` do vencimento C5, C30, C40 · `03:00:00Z` C5, C30, C40 | - |
| precedência da situação (3) | pago ganha de atrasado C5, C30 · cancelado ganha de pago C5, C30 · período de valor zero é pago C5, C31 | - |
| o que a soma exclui (2) | pagamento anulado C5, C29 · pagamento de outro período C29 | - |
| período de valor zero (3 edges) | um dia antes C31 · no dia C31 · um dia depois C31 | - |
| o que a leitura traz de agora e do registro (3) | `plan.name` atual C33 · `priceCents` gravado C33 · `balanceCents` sobre o valor gravado C33 | - |
| valores do filtro da lista geral (3) | nenhum C36 · `pending` C36 · `overdue` C36 | - |
| filtro nos dois lados da virada (4 edges) | `pending` às `02:59:59Z` C36 · `overdue` às `02:59:59Z` C36 · `pending` às `03:00:00Z` C36 · `overdue` às `03:00:00Z` C36 | - |
| `status` inválido na query (7) | `paid` C37 · `cancelled` C37 · `Pending` C37 · `atrasado` C37 · vazio C37 · repetido com valores diferentes C37 · repetido com o mesmo valor C37 | - |
| o que a lista geral deixa de fora (4) | cancelado com saldo C38 · cancelado sem pagamento C38 · pago por inteiro C38 · valor zero C38 | - |
| quem entra na lista geral (3) | aluno `active` C35 · aluno `inactive` C35 · aluno `suspended` C35 | - |
| ordem da lista geral (3) | `dueDate` crescente C35 · empate por `enrollmentId` crescente C35 · independente do nome C35 | - |
| as duas rotas de leitura concordam (3 instantes) | `15:00:00Z` C40 · `02:59:59Z` C40 · `03:00:00Z` C40 | - |
| quem usa a conta única (2) | a ficha C30 · a lista geral C36 | - |
| rotas de aluno que não mudam (4) | chaves da matrícula C78 · chaves de `GET /api/students/:id` C78 · chaves do item de `GET /api/students` C78 · cancelar e inativar não tocam em `payments` C78 | - |
| entrada hostil nas rotas novas (4) | campos do corpo C76 · segmentos de `:id` e de `:paymentId` C76 · corpos que não são objeto C76 · `status` da query C76 | - |
| códigos novos de erro (2) | `enrollment_cancelled` C73 · `payment_exceeds_balance` C73 | - |
| corpos reais contra o contrato (7) | `201` do pagamento C73 · `200` da ficha vazia C73 · `200` da ficha com itens C73 · `200` da lista geral vazia C73 · `200` da lista geral com itens C73 · erros contra o schema de erro C73 · códigos novos C73 | - |
| schemas de `packages/contracts` (5) | registro do pagamento C4 · resposta do pagamento C4 · período da ficha C4 · item da lista geral C4 · query C4 | - |
| pares concorrentes (4) | dois registros C16 · duas anulações C26 · registro com estorno C77 · registro com cancelamento do período C77 | - |
| `Assumptions` que viram comportamento (14) | quem registra e anula C6, C19, C21 · quem lê C27, C35, C19 · de quando é a cobrança C5, C29, C30 · o que o aluno deve C29, C31 · pagamento parcial C13 · forma de pagamento C6, C9, C17 · data do pagamento C8 · período cancelado C11, C24, C34, C38 · aluno inativo C15, C35, C82 · repetir a mesma requisição C13, C63, C80 · teto da soma é do código C12, C16, C77 · lista geral C35, C39 · leitura na trilha C41 · formato do valor na tela C53, C63, C79 | - |
| perfis e o menu (4) | `admin` C49 · `hr_finance` C49 · `reception` C49 · `instructor` C49 | - |
| URL de tela sem sessão (1) | `/payments` C50 | - |
| casos de tela negados (2) | `reception` em `/payments` C51 · `instructor` em `/payments` C51 | - |
| colunas de `/payments` (8) | "Aluno" C52 · "Plano" C52 · "Período" C52 · "Pagar até" C52 · "Valor" C52 · "Pago" C52 · "Saldo" C52 · "Situação" C52 | - |
| opções do campo "Situação" (3) | "Todas" C52 · "Pendente" C52 · "Atrasado" C52 | - |
| formatos de `/payments` (7) | aluno como link C53 · datas `dd/MM/aaaa` C53 · período `dd/MM/aaaa a dd/MM/aaaa` C53 · valores `R$` C53 · "Pendente" e "Atrasado" C53 · plano `<nome> · <periodicidade>` C53 · espaço normalizado C53 | - |
| periodicidade na lista (4) | `monthly` C53 · `quarterly` C53 · `semiannual` C53 · `annual` C53 | - |
| valor em reais (5) | `9990` C53 · `5000` C53 · `4990` C53 · `0` C53 · `9999999` C53 | - |
| escolhas do campo "Situação" e a URL (4) | "Pendente" C54 · "Atrasado" C54 · "Todas" C54 · reabrir com a query C54 | - |
| estados de `/payments` em `Observable` (4) | vazio C55 · erro C56 · sem permissão C50, C51 · densidade e ordem C52 | - |
| colunas do bloco "Pagamentos" (6) | "Período" C57 · "Pagar até" C57 · "Valor" C57 · "Pago" C57 · "Saldo" C57 · "Situação" C57 | - |
| situação do pagamento por extenso (4) | "Pago" C57 · "Pendente" C57 · "Atrasado" C57 · "Matrícula cancelada" C57 | - |
| forma de pagamento por extenso (5) | "Dinheiro" C58 · "Pix" C58 · "Cartão de débito" C58 · "Cartão de crédito" C58 · "Transferência" C58 | - |
| linhas de pagamento no bloco (4) | uma por pagamento C58 · anulados inclusive C58 · "Anulado" só no anulado C58 · período sem pagamento sem linha C58 | - |
| estados do bloco em `Observable` (5) | vazio C59 · erro C60, C66 · sem permissão C61 · densidade e ordem C57, C58 · ação destrutiva confirma C68 | - |
| botão "Registrar pagamento" por estado do período (4) | `pending` com saldo C62 · `overdue` com saldo C62 · `paid` sem o botão C62 · `cancelled` com saldo sem o botão C62 | - |
| o que o diálogo de registro mostra (6) | "Valor (R$)" com o saldo C63 · "Data do pagamento" com hoje C63 · "Forma de pagamento" com cinco opções C63 · botão "Confirmar" C63 · requisição só depois de "Confirmar" C63 · corpo enviado C63 | - |
| "Data do pagamento" nos dois lados da virada no navegador (2 edges) | `02:59:59Z` C63 · `03:00:00Z` C63 | - |
| valor digitado recusado na tela (4) | vazio C64 · `abc` C64 · `99,999` C64 · `-5,00` C64 | - |
| valor digitado que vira centavos (5) | `49,90` C79 · `50` C79 · `50,5` C79 · `0,01` C79 · `0,00` C79 | - |
| depois de confirmar o registro (4) | o diálogo fecha C65 · o bloco exibe a linha nova C65 · o saldo atualiza C65 · o botão some no saldo zero C65 | - |
| mensagens do diálogo de registro (5) | `enrollment_cancelled` C66 · `payment_exceeds_balance` C66 · `422` em `amountCents` C66 · `422` em `paidAt` C66 · `422` em `method` C66 | - |
| botão "Anular" por linha (2) | no não anulado C67 · não no anulado C67 | - |
| diálogo de anular (4) | abre nomeando aluno, valor e data C68 · desistir não envia C68 · confirmar envia e a linha vira "Anulado" C68 · o saldo volta C68 | - |
| botões desabilitados enquanto a API não responde (2) | confirmar o registro C80 · confirmar a anulação C80 | - |
| o que a ficha pede à API por perfil (4) | `admin` C81 · `hr_finance` C81 · `reception` C61 · `instructor` C61 | - |
| nome do aluno com marcação (2) | na lista C83 · no diálogo de anular C83 | - |
| ações novas por extenso em `/audit` (2) | "Pagamento registrado" C69 · "Pagamento anulado" C69 | - |
| filtro "Ação" (38) | C69, table-driven over all 38: os trinta e seis de antes e os dois novos, posições 37 e 38 | - |
| "Alvo" das linhas novas (2) | registro com "Ver aluno" C70 · anulação com "Ver aluno" C71 | - |
| detalhes novos em `/audit` (8) | registro: valor C70 · registro: data C70 · registro: forma C70 · anulação: valor C71 · anulação: data C71 · anulação: forma C71 · cinco formas por extenso C84 · valor com `—` nos dois lados C70, C71 | - |
| formas de pagamento por extenso em `/audit` (5) | `cash` C84 · `pix` C70, C84 · `debit_card` C84 · `credit_card` C84 · `bank_transfer` C84 | - |
| decisões de `collection payments` em `Observable` (5) | agrupamento C27, C28 · nomes C53, C57, C58, C69 · ordem C27, C28, C35 · duplicados C13, C16 · a exceção que não cabe C11, C24, C31, C34 | - |
| startup config: migração `0009` aplicada (3 assemblies) | banco migrado em `packages/database` C1 · harness de `apps/api` C6 · stack do compose C85 | - |
| startup config: nenhuma extensão nova pelo papel que migra (2 assemblies) | Postgres do `testcontainers` C2 · Postgres do `compose.yaml` C85 | - |
| startup config: rotas novas pela origem do web (2 assemblies) | build de produção do web contra a `FakeApi` C52 · container `web` da stack C85 | - |

- Claims naming a status code, route or response shape: C6 a C48 e C72 a C78 cruzam a fronteira HTTP da API montada pelo `startStack`; C49 a C71 e C79 a C84 cruzam a fronteira do web no navegador, sobre o build de produção; C85 cruza as duas no processo real da stack. C1, C2 e C17 provam o banco migrado no próprio nível; C3 e C4 o vocabulário e os schemas; C5 a conta no próprio nível, sem banco e sem HTTP, e a fronteira dela é a C29 a C31, a C35 a C36 e a C40 (API); a tela não refaz a conta, só mostra o que a API devolve (C57, C53)
- Linhas de `Impact` e onde cada uma é provada: `payment` como valor recebido, uma linha por pagamento, sem cobrança C1, C13; saldo e situação calculados, o quinto "status" do sistema, que não é coluna C1, C5, C30; `dueDate` igual a `startsAt`, a "Pagar até" da tela, e a coluna "Vencimento" de "Matrículas" intocada C29, C53, C57, C78; termos do PRD que mudam (`amount_cents`, sem `status`, sem `due_date`, sem `student_id`) C1; os dois códigos novos de `409` C11, C12, C73; `AUDIT_ACTIONS` de 36 para 38, `ACTION_LABELS`, `FIELD_LABELS` e `valueLabel` C3, C69, C70, C71 e C84 (o typecheck do web reprova até cada rótulo existir: entra no mesmo commit do vocabulário, ver `Handoff`); os sete pontos de `audit.spec.ts` (lista abaixo); `DELETE` de matrícula que só mexe em `enrollments` C34, C78; nenhuma rota existente muda de assinatura C78; menu C49; a ficha com mais uma chamada para dois perfis C81 e nenhuma para os outros dois C61; `/audit` que resolve `student` C70; as quatro rotas no OpenAPI C72 (a cobertura de 70% de `apps/api/src` é o portão existente de `pnpm verify`, sem check novo); ambiente sem variável nova nem extensão: `env_example_lists_every_required_key` e `missing_var_exits_1_naming_it` seguem como estão e reprovam se o Build acrescentar uma variável, e C2 e C85 provam a extensão; stored data: tabela vazia C2, chave estrangeira sem cascata C1, período de antes com saldo igual ao valor C2, situação que muda à meia-noite sem linha mudar C30; `.specs`: AD-064 a AD-066 e a linha 10 do `ROADMAP.md` entram com este arquivo
- `Assumptions` que não viram check, por decisão do plano: "Meta de desempenho" (não é critério) e "Pendências sem dono do Handoff" (nenhuma entra aqui). As outras quatorze estão na linha acima
- **Testes existentes que o Build edita** porque o claim deles muda pelo `Impact` do plano (o plano listou só o `audit.spec.ts`; a leitura dos testes achou mais três arquivos, e este é o lugar onde isso fica escrito); o nome fica, o conteúdo ganha o que o plano acrescenta e nenhuma asserção é afrouxada: em `contracts.test.ts`, o `toHaveLength(36)` das linhas 245, 286, 502, 522, 546 e 965 passa a 38 (`audit_actions_end_with_three_student_actions_in_order`, `audit_actions_end_with_eleven_staff_actions_in_order`, `audit_actions_end_with_three_consent_actions_in_order`, `audit_actions_end_with_two_photo_actions_in_order`, `audit_actions_end_with_replace_and_purge_in_order` e `audit_actions_end_with_five_plan_and_enrollment_actions_in_order`), e o último, que hoje compara a lista inteira com as trinta e seis, passa a comparar as trinta e seis primeiras (`slice(0, 36)`), como os outros já fazem com as suas; em `audit-auth.test.ts`, `ten_actions_written_equal_contract_vocabulary` (linha 353: de trinta e seis para trinta e oito; o percurso ganha o registro e a anulação de um pagamento; o filtro de `entity` da linha 357 já aceita `student`, e as afirmações sobre `staff` e `plan` ficam como estão); em `audit.spec.ts`, `ten_actions_shown_by_label` (linha 142), `student_actions_labelled_and_filter_has_thirteen` (245), `consent_actions_labelled_and_filter_has_sixteen` (497), `photo_actions_labelled_and_filter_has_eighteen` (558), `replace_and_purge_actions_labelled_and_filter_has_twenty` (581), `staff_actions_labelled_filter_has_thirty_one_and_authorless_row_dashes` (650) e `plan_and_enrollment_actions_labelled_and_filter_has_thirty_six` (750), as sete contagens de trinta e seis para trinta e oito e a lista `LABELS` com os dois rótulos novos no fim; no último, o claim da C95 de `planos-matriculas` ("as cinco novas ocupam as posições 32 a 36") passa a afirmar trinta e oito opções com as cinco de plano e matrícula nas posições 32 a 36: os dois `slice(31)` das linhas 755 e 756 passam a `slice(31, 36)`; `serve`, do mesmo arquivo, não muda (a página não pede nada novo); em `photos.test.ts` do banco, `migration_0005_adds_only_photos_without_tenant_or_owner_columns` compara o conjunto de tabelas do banco inteiro migrado: a lista esperada ganha `payments`, e a asserção sobre as colunas de `photos` fica como está; em `openapi.test.ts`, `request_bodies_come_from_contract_schemas` ganha o corpo novo e `paths_equal_registered_api_routes` lê o roteador e passa a cobrir as quatro rotas; em `enrollment.test.ts`, `admin_without_2fa_gets_403_everywhere_else` ganha as quatro rotas na lista (C74); `hostile_input_never_answers_5xx` ganha as rotas novas (C76); em `shell.spec.ts` os testes de link seguem como estão, e o link novo é provado à parte (C49). O teste `migration_0008_adds_plans_enrollments_and_btree_gist_and_keeps_existing_tables`, de `plans.test.ts` do banco, já migra só até a `0008` e não muda
- **Provas existentes que seguem como estão e passam a valer também aqui**: `second_run_changes_nothing` de `migrate.test.ts` (a segunda execução não muda tabela, coluna nem extensão: cobre a `0009`); `six_identity_tables_and_no_tenant_id` de `schema.test.ts` (nenhuma coluna `tenant_id` no banco inteiro); `only_four_routes_answer_without_session` (segue com quatro rotas; a C20 prova o `401` das quatro novas); `guard_matrix_three_declarations_five_callers` (AD-022)
- Suítes de tela que abrem `/students/<id>` sem conhecer as rotas novas (`students.spec.ts`, `consents.spec.ts`, `photos.spec.ts`, `photo-editor.spec.ts`, `photo-camera.spec.ts` e `student-enrollments.spec.ts`): a `FakeApi` responde `404` ao que não conhece, então nelas o bloco "Pagamentos" aparece no estado de erro da C60 para `admin` e `hr_finance`. Nenhuma asserção delas fala do bloco; se alguma reprovar (um botão "Tentar novamente" a mais é o que já aconteceu uma vez, em `consents_load_failure_shows_retry_without_hiding_ficha`), o conserto é a `FakeApi` daquele teste responder à rota nova, nunca mudar a asserção
- A C23 e a C24 precisam de um período cancelado ou de um pagamento já gravado antes de a rota que os cria estar de pé: usam `insertEnrollment` e `insertPayment` por SQL
- Além do texto das AC, derivado do `Impact`, das `Assumptions`, das doors ou da prática do repositório, e que o Build pode discutir antes de fechar: a precedência do cancelado sobre "maior que o saldo" (C11); a leitura do filtro ao reabrir a URL (C54); as cinco formas por extenso em `/audit` (C84); as corridas de registro com estorno e com cancelamento (C77); a leitura do `student` da lista geral só com `id` e `name` (C35); a conta que soma o pago e exclui o anulado dentro da mesma função (C5); o nome do aluno com marcação na lista e no diálogo (C83); o formato `dd/MM/aaaa` de "Pagar até" e dos valores no bloco da ficha, que a `Observable` manda e nenhuma AC repete (C57); o estado de aluno inativo na ficha (C82)
- Decisões que o plano deixa fora de AC e que nenhum check afirma: a forma de pagamento escolhida por padrão no diálogo (a C63 escolhe "Pix" antes de confirmar); o ponto como separador decimal (`50.00`) e o separador de milhar (`1.234,56`) no campo "Valor (R$)", que `parsePrice` de `planos-matriculas` já decide e a C64 não cobre; o que "Detalhes" mostra para `enrollmentId`, que não ganha rótulo no Impact (a C70 e a C71 afirmam os três textos da AC e não afirmam que não haja um quarto); como o campo "Período" do bloco da ficha escreve as datas (a AC 52 não diz; a AC 48 fixa `dd/MM/aaaa a dd/MM/aaaa` só em `/payments`); o que a tela faz com o `enrollmentId` num `422` (não há campo dele no diálogo); o teto da soma contra um SQL fora da API, que a Assumption declara como limite e nenhum check prova; paginação e busca, fora de escopo no plano
- Perguntas respondidas no padrão recomendado (nenhum check muda): a 1, a cobrança é calculada da matrícula (C1, C5, C29); a 2, sem carência (C5, C30, C36)
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md`, `auditoria`, `alunos`, `consentimento`, `funcionarios` e `planos-matriculas` seguem valendo e respondem as duas perguntas para o que esta feature reaproveita (a rota que decide, alcançada por HTTP, com o corte por perfil e a linha de auditoria; a restrição do banco; o gravador da trilha; a tela contra a `FakeApi`; a stack lida por `psql`; a conta pura com a prova na fronteira; o valor que depende do dia, nos dois lados da virada). Respondem mal dois casos que lá não existiam, e os dois ganham linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Invariante sobre a soma de outras linhas, garantida só pela trava da linha pai e sem restrição de banco (o teto de `payment_exceeds_balance`) | uma tabela de bordas do saldo na fronteira HTTP, uma corrida por par de escritores na fronteira HTTP, **e** a conta pura no próprio nível | na tabela, o saldo menos um centavo, o saldo, o saldo mais um, o saldo zero, o período de valor zero e o saldo devolvido por uma anulação; nas corridas, cada par que o código serializa (dois registros que passam do saldo, dois que cabem, registro com estorno, registro com cancelamento do período), com a barreira, dez rodadas, e **na mesma prova** o status de cada resposta, o número de linhas em `payments`, a soma dos não anulados e o número de linhas de auditoria. O banco não defende esta regra: a prova que a trava segura é a das corridas, e a de bordas sozinha passaria numa implementação sem trava |
| Filtro e ordem por um valor calculado do dia, aplicados em código sobre linhas lidas do banco (a lista geral por `pending` e `overdue`) | uma prova de fronteira por valor do filtro, com o relógio controlado, nos dois instantes da virada, **e** uma que compara a lista com a ficha para o mesmo período | cada valor do filtro (nenhum, `pending`, `overdue`) e cada recusa (sete), nos instantes `02:59:59Z` e `03:00:00Z` do vencimento, com a ordem e o empate escritos à mão. A prova da ficha não substitui a da lista: ela passa por um caminho dela, e a igualdade entre as duas rotas (C40) é o que pega uma segunda conta escrita em SQL |

Evidence (o código da feature ainda não existe; a contagem vem do plano e do código que ele altera):

- registrar: 4 campos validados (`amountCents`, `paidAt`, `method`, `enrollmentId`), 3 limites de `paidAt` (formato, hoje, início menos 365 dias), 2 recusas de estado (`enrollment_cancelled`, `payment_exceeds_balance`) e o `404` do aluno, 6 casos negados de perfil e de sessão (C6 a C20) -> decide, com a trava
- anular: 2 `404` (aluno e pagamento), 1 desvio de "já anulado", 1 guarda de `UPDATE` com `voided_at IS NULL`, 1 trava do período (C21 a C26) -> decide
- conta: 4 valores de `status`, 3 precedências, 1 soma que exclui o anulado, 2 viradas, 16 linhas (C5) -> decide, numa função sem dependência; é a segunda conta de data do repositório depois de `enrollmentStatus`
- leitura da ficha: 2 ordens com desempate, cancelados incluídos, 10 chaves; lista geral: 3 valores de filtro, 7 recusas, 4 exclusões, 3 situações de aluno, 1 ordem com desempate, 10 chaves (C27 a C41) -> decide
- banco: 1 tabela, 3 `CHECK` e `NOT NULL` em 4 colunas, 1 chave estrangeira sem cascata (C1, C2, C17) -> decide
- auditoria: 2 ações, 4 campos registráveis, 17 desfechos que não gravam, 2 rotas que desfazem, 4 casos de `ip` e `user_agent` (C42 a C48) -> decide
- telas: 1 URL nova e 1 bloco, 8 e 6 colunas, 4 estados de botão, 6 elementos do diálogo, 4 valores recusados, 5 conversões, 5 mensagens, 4 estados de erro (C49 a C71, C79 a C84) -> decide, na tela
- o controller de pagamentos (novo): cada rota valida o corpo pelo schema e chama o serviço -> instrumentação além do `404` por `:id` e `:paymentId`, que a C18 e a C25 provam
- closest analogue in the repo: `apps/api/test/consents-write.test.ts` (`ten_concurrent_grants_one_201_one_409`, a rota aninhada no aluno com a linha do aluno travada, sem restrição de banco para a regra) ao lado de `apps/api/test/student-enrollments-write.test.ts` (`five_racing_pairs_never_5xx_one_audit_row_and_no_overlap_left` e `enroll_starts_at_twelve_cases_around_today_in_sao_paulo`, as corridas por par e o limite de data nos dois lados da virada) e de `apps/api/test/student-enrollments-read.test.ts` (`status_computed_on_read_four_values_across_sao_paulo_midnight_without_changing_the_row`, a situação calculada sem mudar a linha); `packages/contracts/test/plans.test.ts` (a conta pura com a tabela escrita à mão); `apps/api/test/plans-audit.test.ts` (a trilha das escritas); `apps/web/e2e/student-enrollments.spec.ts` (o bloco da ficha com diálogo) e `apps/web/e2e/plans.spec.ts` (lista e formulário); e `tests/stack/compose.test.ts` (`plan_created_and_student_enrolled_through_web_with_overlap_refused_and_audit_rows`)

Cost: 1 prova no próprio nível em 1 arquivo novo de `packages/contracts`, 1 arquivo novo de banco com 3 testes, 3 arquivos novos de API mais o apoio `support/payments.ts`, 2 de tela mais o apoio do web, uma subida de Postgres por arquivo de API novo, e a `FakeApi` com 4 rotas a mais. Sem a primeira linha, o teto da soma seria provado só pelas bordas em sequência, que passam numa implementação sem trava, e dois operadores que registram ao mesmo tempo gravariam mais do que o período vale; sem a segunda, o filtro `pending` e `overdue` seria provado no dia em que o teste rodou, e uma segunda conta escrita em SQL para o filtro passaria até a primeira virada de dia. As linhas ficam neste arquivo, como nas features anteriores, e não vão para um guia do repositório.

## Swept

- validation: C4, C7, C8, C9, C10, C37, C64, C76, C79
- failure modes: C46, C56, C60, C66, C73
- idempotency: C22 (anular um pagamento já anulado), C26 (duas anulações ao mesmo tempo gravam uma linha só), C13 (repetir o mesmo `POST` cria outro pagamento enquanto couber no saldo, por decisão das Assumptions), C80 (o botão desabilitado enquanto aguarda)
- authorization: C19, C20, C50, C51, C61, C74, C75, C49; existing - a guarda global (AD-022) e a checagem de origem (AD-020), pelas provas `guard_matrix_three_declarations_five_callers` e `only_four_routes_answer_without_session`
- concurrency: C16, C26, C77; o teto da soma é do código, com a trava da linha do período (door 2), e o banco não o defende (limite declarado nas Assumptions)
- data lifecycle: C1, C2, C21, C24, C34, C78 - o pagamento nunca é apagado por rota, anular mantém a linha, a chave estrangeira sem cascata segura o período, cancelar o período não mexe nos pagamentos; a situação muda à meia-noite sem que linha nenhuma mude (C30); exportação, anonimização e exclusão definitiva são da `privacidade`
- dependency failure: C46 (auditoria que falha nas escritas), C56 e C60 (a API que não responde à tela); existing - banco fora na consulta cai no `500 internal_error` do `ProblemFilter`, pela prova `unhandled_500_hides_exception` da `fundacao`
- state transitions: C5, C21, C22, C23, C30, C31 - `paid`, `pending`, `overdue` e `cancelled` do período, calculados, e `não anulado` para `anulado` do pagamento, a única coluna que muda, uma vez (C21, C22)
- observability: C42 a C48, C69 a C71, C84, C85 - a trilha de registro e de anulação é o que esta feature torna observável; C48 mantém nome e CPF fora dela; leitura não grava (C41)

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado (KB de código e teste, dividido por quatro); o que já existe foi medido com `wc -c`. Código novo: S0 = 7k (a migração `0009`, o schema do Drizzle, `contracts/src/payments.ts` com os schemas e a conta, `payments.test.ts` do banco e o de `packages/contracts`, e os dois rótulos e as contagens que entram com o vocabulário), S1 = 14k (o módulo de pagamentos, `support/payments.ts` e `payments-write.test.ts` na parte de registrar), S2 = 3k, S3 = 4k (`payments-read.test.ts`, a ficha), S4 = 4k (a lista geral), S5 = 6k (`payments-audit.test.ts`), S6 = 16k (a página `/payments`, o bloco e os dois diálogos, o apoio da `FakeApi`, `payments.spec.ts` e `student-payments.spec.ts`), S7 = 2k, S8 = 8k (4k de API em C72 a C78, 4k de tela e de stack em C79 a C85): 64k. Arquivos existentes que a feature edita ou lê como molde (45 arquivos, contados uma vez: `apps/api/src` 18 KB em 5, `packages` 70 KB em 9 - o `plans.test.ts` do banco, o `photos.test.ts` e os de contrato entre eles -, testes de API 178 KB em 13, `apps/web/src` 40 KB em 10, testes de tela e de stack 137 KB em 8; os maiores: `contracts.test.ts` 50 KB, `compose.test.ts` 45 KB, `student-enrollments-write.test.ts` 36 KB, `audit.spec.ts` 34 KB, `plans.test.ts` do banco 23 KB, `plans-audit.test.ts` 20 KB, `student-enrollments.spec.ts` 19 KB): 453.553 bytes ÷ 4 = 113k. `plan.md` (42 KB, 10k) e este arquivo (cerca de 96 KB, 24k): 35k. Total 64k + 113k + 35k = 212k, acima do orçamento de 150k
- Corte proposto, nos limites em que a superfície muda (o registro e a anulação, depois as leituras e a trilha, depois as telas), sem dividir slice: batch A = S0 a S2 (C1 a C26: banco, vocabulário, contrato, a conta e as duas rotas de escrita): código novo 7k + 14k + 3k = 24k, arquivos existentes 69k (26 arquivos, 274.869 bytes: `schema.ts`, a migração `0008` e `plans.test.ts` do banco como molde e `photos.test.ts` do banco, 54 KB; `contracts/src` de `plans`, `audit`, `index` e `person` e `plans.test.ts` de `packages/contracts`, 16 KB; `app.module.ts`, `db-errors.ts`, `audit/audit.ts` e o módulo `student-enrollments` como molde da rota aninhada e da trava, 18 KB; `contracts.test.ts`, `audit-auth.test.ts`, `openapi.test.ts`, `enrollment.test.ts`, `student-enrollments-write.test.ts` e cinco apoios, 141 KB; `apps/web/src/lib/audit.ts` e `audit.spec.ts`, 40 KB, que entram aqui pelos dois rótulos e pelas sete contagens do vocabulário), documentos 35k = 128k; batch B = S3 a S5 e C72 a C78 (C27 a C48 e as provas de contrato, montagem, concorrência e regressão): código novo 4k + 4k + 6k + 4k = 18k, arquivos existentes 45k (15 arquivos, 180.891 bytes: os três testes de molde que o batch A não leu, `student-enrollments-read.test.ts`, `plans-audit.test.ts` e `hostile-input.test.ts`, 38 KB, e, relidos, 12 arquivos de 139 KB que C72 a C77 editam ou copiam), documentos 35k, e o diff do que já entrou que ele lê (a migração, o schema, `contracts/src/payments.ts`, o módulo e `support/payments.ts`, cerca de 10k) = 108k; batch C = S6, S7 e C79 a C85 (C49 a C71, o que a tela envia e a stack): código novo 16k + 2k + 4k = 22k, arquivos existentes 45k (18 arquivos, 180.863 bytes: `apps/web/src` de `lib`, `shell.tsx`, a ficha com `enrollments-block.tsx`, as páginas de `plans` como molde e `audit/page.tsx`, 40 KB; `audit.spec.ts`, `shell.spec.ts`, `student-enrollments.spec.ts`, `plans.spec.ts`, `fake-api.ts` e `support/plans.ts`, 89 KB; `compose.test.ts` e o apoio da stack, 48 KB), documentos 35k, e o diff que ele lê (os schemas, os rótulos e a forma das quatro rotas, cerca de 8k) = 110k. Soma: 24k + 18k + 22k = 64k de código novo; nenhuma slice sozinha passa de 16k, então nenhuma foi cortada demais
- Por que três e não dois: A com B dá 42k de código novo + 78k de existentes (69k + 10k, porque os três testes de molde de B são os únicos que A não leu) + 35k de documentos, sem diff a ler, = 155k, e B com C dá 40k + 90k (45k + 45k, sem arquivo em comum) + 35k + 10k de diff do batch A = 175k; os dois passam de 150k, A com B por pouco. Na `foto-captura` um batch estimado em 94k passou dos 150k, porque a parcela que cresce é a leitura dos testes que servem de molde e a saída das execuções: os três batches ficam entre 108k e 128k para deixar essa folga
- Ordem: S0 primeiro (a tabela, o vocabulário, o contrato e a conta, de que todo o resto depende). No mesmo commit da migração `0009` entra a edição do teste do banco (`migration_0005_adds_only_photos_without_tenant_or_owner_columns` ganha `payments` na lista de tabelas), ou o arquivo reprova; no mesmo commit de `AUDIT_ACTIONS` entram os dois rótulos de `ACTION_LABELS` (`apps/web/src/lib/audit.ts`), as seis contagens de trinta e seis para trinta e oito de `contracts.test.ts` (com o `slice(0, 36)` do último), a de `audit-auth.test.ts` e as sete de `audit.spec.ts`, com `LABELS` e os dois `slice(31)` que passam a `slice(31, 36)`, ou o typecheck do web e os testes de contagem reprovam. Cada commit que cria uma rota entra também nas listas que enumeram as rotas (`request_bodies_come_from_contract_schemas`, `paths_equal_registered_api_routes` e `admin_without_2fa_gets_403_everywhere_else`), ou `pnpm verify` reprova; C72 e C74 só fecham quando as quatro rotas estão de pé. Depois S1, S2, S3, S4, S5, C72 a C78, S6, S7, C79 a C85
- O que fecha fora do seu batch: a segunda prova da **C3** (`ten_actions_written_equal_contract_vocabulary`) percorre o registro e a anulação, as duas rotas de escrita do batch A, então fecha no próprio A, sem catraca; a **C72** e a **C74** dependem das quatro rotas e fecham no batch B; a **C23** e a **C24** gravam pagamento e cancelam período por SQL ou por rotas que já existem e não esperam o batch B; a **C34** usa a ficha (S3) e fecha no batch B
- Conferir antes de cada trecho: antes da S1, que a trava do período é um `SELECT ... FOR UPDATE` em `enrollments` e que o `UPDATE ... WHERE cancelled_at IS NULL` de `StudentEnrollmentsService.cancel` espera por ela (é isso que a C77 mede), e que o registro de pagamento não trava a linha do aluno, então não cruza a ordem aluno-depois-plano do `POST` de matrícula; antes da S3, que a conta mora em `packages/contracts` ao lado de `enrollmentStatus` e que a ficha e a lista geral a chamam, sem SQL que classifique (C40); antes da S4, que o filtro por situação é aplicado depois da conta, em código; antes da S6, que `formatPrice`, `priceInputOf` e `parsePrice` de `apps/web/src/lib/plans.ts` servem ao diálogo, que `servePlans` da `FakeApi` registra o prefixo `/api/students` e só responde a `/enrollments` (a rota de pagamentos tem de entrar nele), que os `<Link>` novos nascem com `prefetch={false}` e quais das seis suítes que abrem a ficha passam a ver o bloco em estado de erro (ver a nota da `Coverage`); antes da C85, que `compose.test.ts` roda a stack depois do teste de funcionário, que reinicia a API
- Mechanism: handoff - escolha do usuário na revisão de 2026-10-08, contra um estimado de 212k e um orçamento de 150k: os batches A, B e C acima, em sequência e só na verde, cada um em sessão nova que lê este arquivo e o diff do que já entrou (a alternativa recusada foi `one builder`, uma sessão só, com compactação e perda de contexto a partir de cerca de 150k). Decisões da revisão, todas no padrão recomendado em vez de trocadas (o usuário abriu o batch A com o prompt que as supõe, e nenhum check mudou): (1) período cancelado com saldo zero responde `enrollment_cancelled`, não `payment_exceeds_balance` (C11); (2) as três derivadas que o plano não escreveu ficam: `0,00` vai à API e volta `422` (C66, C79), reabrir `/payments?status=overdue` mantém "Atrasado" escolhido (C54) e `/audit` mostra as cinco formas por extenso (C84); (3) a pergunta da Test policy, se as duas linhas vão para um guia do repositório, fica respondida com não: as duas linhas ficam neste arquivo, como nas features anteriores. Registrado antes da primeira linha de código
