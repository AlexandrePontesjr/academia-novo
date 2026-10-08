# Planos e matrículas - checks

Profile: standard
Plan: `.specs/features/planos-matriculas/plan.md`

## Intent

112 checks in 12 slices (S0, as 10 do plano e S11 de contrato, montagem, concorrência, regressão e stack) · 6 one-way doors · 4 open (a 1, a 2 e a 3, respondidas no padrão recomendado em 2026-10-08; a 4 só trava o go-live), of which 0 block the Build

O plano foi aprovado em 2026-10-08 com as 22 Assumptions confirmadas e as três perguntas no padrão
recomendado: só `admin` e `hr_finance` matriculam, renovam e cancelam (AC 31, AC 77), as regras de acesso
são texto livre que o sistema não interpreta (door 1, AC 2), e matricular não consulta `consents` (C25). As
doors 1 a 6 viraram AD-058 a AD-063 em `STATE.md` e a lacuna "Regras de acesso" do `ROADMAP.md` fechou junto com
este arquivo. A pergunta 4 (quem cadastra os planos reais antes do primeiro dia) segue aberta e
não muda check nenhum.

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`,
`playwright test <arquivo> -g`). São criados no Build, em `packages/database/test`, `plans.test.ts`; em
`packages/contracts/test`, `plans.test.ts`; em `apps/api/test`, `plans.test.ts`,
`student-enrollments-write.test.ts`, `student-enrollments-read.test.ts`, `plans-audit.test.ts` e
`support/plans.ts`; em `apps/web/e2e`, `plans.spec.ts`, `student-enrollments.spec.ts` e
`support/plans.ts`. Nenhum arquivo novo se chama só `enrollment`: `apps/api/test/enrollment.test.ts` é o
do cadastro de 2FA e continua sendo (Impact "domain"). Ganham casos, ou são editados como a lista abaixo
da `Coverage` descreve: `contracts.test.ts`, `audit-auth.test.ts`, `openapi.test.ts`, `enrollment.test.ts`,
`hostile-input.test.ts`, `staff.test.ts` e `photos.test.ts` (banco), `shell.spec.ts`, `audit.spec.ts`,
`fake-api.ts` e `compose.test.ts`. As regras de `features/auth-rbac/checks.md`, `auditoria`, `alunos`,
`consentimento` e `funcionarios` seguem valendo sem mudança: Postgres real por `testcontainers` (AD-012),
sessão real de cada perfil (`stack.session(role)`, com 2FA já ativo para `admin`) e `Origin` igual a
`WEB_ORIGIN`, "exatamente uma linha" como diferença de contagem de `audit_logs` (`written`), insert de
`audit_logs` que falha por gatilho do próprio teste (`withAuditInsertFailing`), dois pedidos soltos juntos
por uma barreira (`releasedTogether`), a saída capturada em stdout, stderr e `console`, e, nas telas, o
`FakeApi` que registra método, caminho e corpo. Regras próprias:

- A numeração acompanha o plano: de S1 a S10, **C(n) prova a AC (n - 8)** (C9 é a AC 1, C99 é a AC 91).
  S0 vem antes e S11 depois.
- "Linha de plano" e "linha de matrícula" são lidas por SQL do banco do próprio teste como
  `to_jsonb(plans)` e `to_jsonb(enrollments)`, sem depender de nome de coluna além dos que as doors fixam
  (`period`, `status`, `rules`, `name`, `price_cents`, `student_id`, `plan_id`, `starts_at`, `ends_at`,
  `created_at`, `cancelled_at`). "Linha idêntica" é igualdade desse JSON antes e depois, e "contagem" é
  `count(*)` da tabela. Quando um caso muda um campo de plano e afirma que "o resto ficou", o instante de
  atualização, se a linha tiver um, fica fora da comparação. A linha de matrícula não tem exceção: fora
  `cancelled_at`, nada nela muda nunca (door 3).
- "Nada gravado" é a contagem e as linhas de `plans` e de `enrollments` iguais às de antes, mais a
  contagem de `audit_logs`.
- O dia de hoje em `America/Sao_Paulo` é controlado pelo teste (relógio em processo, só `Date`, como em
  `staff-create.test.ts`), nunca lido do relógio da máquina; salvo quando o caso diz outra coisa, o
  relógio está em `2026-10-07T15:00:00Z` (dia 7 em São Paulo). A virada do dia é às 03:00 UTC. Cada
  requisição feita depois de mover o relógio usa uma sessão aberta naquele instante. Os instantes que
  vêm do banco (`createdAt`, `cancelledAt`) não seguem esse relógio: são conferidos entre T0 e T1, lidos
  de `now()` do banco antes e depois da requisição.
- "Mensal" de teste é um plano `monthly` de `priceCents` igual a `9990`; o período padrão é
  `2026-10-07` a `2026-11-06`. Aluno de teste vem de `createStudent` (`support/students.ts`), com CPF de
  `cpfOf(n)`.
- "Autor" é o `id` do usuário da sessão que chamou.
- Os limites de tamanho são provados nas duas bordas (aceita no limite, recusa no limite mais um), com um
  caractere acentuado dentro do texto.
- Nas telas, `FakeApi` passa a responder `GET` e `POST /api/plans`, `PATCH` e `DELETE /api/plans/:id`,
  `GET` e `POST /api/students/:id/enrollments` e `DELETE /api/students/:id/enrollments/:enrollmentId`, com
  estado que as escritas mudam como a API mudaria, `401` sem sessão e `403` com `forbidden` ao perfil que
  a API real nega. Nenhuma prova de tela contra a `FakeApi` afirma uma linha de auditoria. O relógio do
  navegador é fixado pelo teste nas provas que dependem do dia (C88).
- Texto de valor em reais é comparado com o espaço normalizado: o `Intl` de `pt-BR` escreve U+00A0 entre
  `R$` e o número (Assumptions), e a prova troca U+00A0 por espaço antes de comparar com `R$ 99,90`.
- O check de tela que exige a API de verdade (C112) roda na stack do compose, sobre o `web` e a `api`
  reais, lendo o banco por `psql`.

### S0 - As duas tabelas, a restrição de exclusão, o vocabulário, o contrato e as duas contas, antes de qualquer rota · ~9 files · ~33 KB · ~8k

**C1** - Depois de `pnpm db:migrate` num banco vazio, `plans` existe sem as colunas `deleted_at` e `tenant_id`, sem chave estrangeira nenhuma e sem `UNIQUE` além da chave primária (duas linhas com o mesmo `name` convivem); uma linha inserida só com `name`, `period` e `price_cents` e sem `id` recebe do banco um `uuid` de versão 7, `status` igual a `active` e `rules` nulo (door 1, AD-016, AD-058)
Proof: `pnpm --filter "./packages/database" exec vitest run test/plans.test.ts -t "plans_table_has_no_deleted_at_tenant_id_foreign_key_or_unique_name_and_defaults"`

**C2** - Em `plans`, `period` aceita `monthly`, `quarterly`, `semiannual` e `annual` e recusa `weekly`, `Monthly`, `mensal` e a cadeia vazia por violação de `CHECK`; `status` aceita `active` e `inactive` e recusa `suspended`, `Active`, `ativo` e a cadeia vazia por violação de `CHECK`; `price_cents` aceita `0` e `9999999`, recusa `-1` por violação de `CHECK` e o nulo por `NOT NULL`; depois de cada recusa a contagem de `plans` é a de antes (door 1, door 2, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/plans.test.ts -t "plans_period_status_and_price_checks_eighteen_values"`

**C3** - `enrollments` existe sem as colunas `status`, `deleted_at` e `tenant_id`; `starts_at` e `ends_at` são do tipo `date`; as únicas chaves estrangeiras dela são `student_id` para `students(id)` e `plan_id` para `plans(id)`, as duas com regra de exclusão `NO ACTION`; o insert a que falta `student_id`, `plan_id`, `starts_at`, `ends_at` ou `price_cents` (cinco casos) falha por `NOT NULL`; uma linha inserida sem `id` recebe um `uuid` de versão 7, `created_at` entre T0 e T1 e `cancelled_at` nulo; `DELETE` de um aluno que tem matrícula e `DELETE` de um plano que tem matrícula falham por violação de chave estrangeira, também quando a matrícula está cancelada, com as três linhas como estavam (door 3, Relations, Impact "stored data")
Proof: `pnpm --filter "./packages/database" exec vitest run test/plans.test.ts -t "enrollments_table_has_no_status_column_two_foreign_keys_without_cascade_and_defaults"`

**C4** - Aplicadas as migrações até a `0007`, inseridos um aluno, um funcionário e uma foto, e só então aplicada a `0008`, a migração termina sem erro; o conjunto de tabelas do banco é o de antes mais `enrollments` e `plans`, as duas vazias (nenhum plano de fábrica); `pg_extension` tem `btree_gist` e continua com `pg_trgm`; as colunas de todas as tabelas de antes e as linhas de `students`, `staff` e `photos` são idênticas; e `enrollments_no_overlap` existe em `enrollments` como restrição de exclusão (`contype` igual a `x`) (door 1, door 3, door 5, Impact "stored data" e "ambiente")
Proof: `pnpm --filter "./packages/database" exec vitest run test/plans.test.ts -t "migration_0008_adds_plans_enrollments_and_btree_gist_and_keeps_existing_tables"`

**C5** - `AUDIT_ACTIONS` em `packages/contracts` tem trinta e seis valores: os trinta e um de antes, na ordem de antes, seguidos de `plan.created`, `plan.updated`, `plan.inactivated`, `student.enrollment_created` e `student.enrollment_cancelled`, nessa ordem; e depois de percorrer as rotas de plano e de matrícula, o conjunto de ações gravadas em `audit_logs` é igual ao vocabulário, com `entity` igual a `plan` nas três de plano e igual a `student` nas duas de matrícula (door 6, AD-025, AD-063)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_five_plan_and_enrollment_actions_in_order"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "ten_actions_written_equal_contract_vocabulary"`

**C6** - Em `packages/contracts`, o schema de criação de plano aceita o corpo com `name`, `period` e `priceCents`, com e sem `rules`, e recusa, um a um, o corpo a que falta cada um dos três e o que traz `priceCents` igual a `99.9`, a `"9990"`, a `-1` e a `10000000`; o schema de edição de plano recusa qualquer corpo com a chave `period` e o que traz `status` igual a `inactive`; o schema de criação de matrícula aceita `planId` com `startsAt` e recusa o corpo a que falta cada um dos dois; o schema de resposta do plano aceita o objeto de seis chaves e recusa `period` igual a `weekly` e `status` igual a `suspended`; e o schema de resposta da matrícula aceita o objeto de oito chaves com `status` em cada um de `scheduled`, `active`, `expired` e `cancelled`, e recusa `status` igual a `suspended` e o `plan` sem `period` (door 1, door 2, door 4, AD-006, AD-011, Impact "contrato")
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "plan_and_enrollment_schemas_accept_and_reject"`

**C7** - A conta do vencimento em `packages/contracts`, chamada sem banco e sem HTTP, devolve para cada uma das dezessete linhas o valor escrito à mão: de `2026-10-07`, `2026-11-06` (`monthly`), `2027-01-06` (`quarterly`), `2027-04-06` (`semiannual`) e `2027-10-06` (`annual`); `monthly` de `2026-01-01` dá `2026-01-31`, de `2026-01-28`, `2026-01-29`, `2026-01-30` e `2026-01-31` dá `2026-02-27` nos quatro, de `2026-03-31` dá `2026-04-29`, de `2026-12-31` dá `2027-01-30`, de `2028-01-31` dá `2028-02-28` e de `2028-02-29` dá `2028-03-28`; `quarterly` de `2026-11-30` dá `2027-02-27`; `semiannual` de `2026-08-31` dá `2027-02-27`; `annual` de `2027-02-28` dá `2028-02-27` e de `2028-02-29` dá `2029-02-27` (door 4, AD-061)
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/plans.test.ts -t "ends_at_seventeen_rows_of_calendar_months_minus_one_day"`

**C8** - A conta da situação em `packages/contracts`, chamada sem banco e sem HTTP para uma matrícula de `2026-10-07` a `2026-11-06`, devolve `scheduled` em `2026-10-06`, `active` em `2026-10-07` e em `2026-11-06` e `expired` em `2026-11-07`; com `cancelledAt` preenchido devolve `cancelled` nesses quatro dias; para um período de um dia só (`startsAt` igual a `endsAt`) devolve `active` nesse dia; e, recebendo o instante em vez do dia, devolve `scheduled` em `2026-10-07T02:59:59Z`, `active` em `2026-10-07T03:00:00Z` e em `2026-11-07T02:59:59Z` e `expired` em `2026-11-07T03:00:00Z` (door 4, AD-061)
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/plans.test.ts -t "enrollment_status_thirteen_rows_around_both_edges_and_sao_paulo_midnight"`

### S1 - Cadastrar e listar planos · ~4 files · ~24 KB · ~6k

**C9** - `POST /api/plans` de `admin` e de `hr_finance`, com `name` igual a `Mensal`, `period` igual a `monthly` e `priceCents` igual a `9990`, responde `201` nos dois casos com exatamente as chaves `id`, `name`, `period`, `priceCents`, `rules` e `status`: `id` igual ao da linha lida por SQL, os três campos enviados devolvidos iguais, `status` igual a `active` e `rules` igual a `null`; com `rules` enviado, ele volta igual; e cada um dos quatro valores de `period` é aceito e devolvido (AC 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "create_201_by_admin_and_hr_finance_with_the_six_keys_and_four_periods"`

**C10** - `POST /api/plans` responde `422` com um item em `errors` cujo `path` é o campo do caso, e a contagem de `plans` não muda, em cada um dos casos: `name` ausente, vazio, só de espaços e de 81 caracteres (com `é` dentro); `period` ausente, `null`, vazio, `weekly`, `Monthly` e `mensal`; `priceCents` ausente, `null`, `-1`, `10000000`, `99.9` e `"9990"`; `rules` vazio, só de espaços e de 501 caracteres; e o caractere U+0000 dentro de `name` e de `rules`; e responde `201` para `name` de 80 caracteres, `rules` de 500 e `priceCents` igual a `0` e a `9999999` (AC 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "create_twenty_one_refusals_422_with_field_path_and_four_edges_accepted"`

**C11** - `POST /api/plans` com `name` igual ao de um plano que já existe responde `201`, e `plans` passa a ter duas linhas com aquele `name` e `id` diferentes (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "create_with_an_existing_name_201_and_two_rows"`

**C12** - `GET /api/plans` de `admin`, de `hr_finance` e de `reception` responde `200` com todos os planos, ativos e inativos juntos, cada um com exatamente as chaves `id`, `name`, `period`, `priceCents`, `rules` e `status`, e o corpo é igual para os três perfis; a ordem é a de `name` sem diferenciar maiúsculas nem acentos e, no empate, de `id`: com `Ágil`, `agil`, `Bronze`, `bronze`, `Zen` e dois `Mensal` de `id` diferentes, um deles inativo, a ordem esperada está escrita à mão no teste (AC 4, AD-035)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "list_all_statuses_ordered_by_folded_name_then_id_same_body_for_three_roles"`

**C13** - Em cada um dos onze casos - `reception` em `POST /api/plans` e em `PATCH` e `DELETE /api/plans/:id` com o `:id` de um plano que existe e com um `uuid` de plano nenhum (cinco); `instructor` em `GET` e `POST /api/plans` e em `PATCH` e `DELETE /api/plans/:id` com os dois `:id` (seis) - a resposta é `403` com `code` igual a `forbidden`, o corpo não traz nenhuma das chaves `name`, `period`, `priceCents` e `rules`, e nada é gravado (AC 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "reception_writes_and_instructor_everything_403_eleven_cases"`

**C14** - As quatro rotas `/api/plans*`, chamadas sem cookie, respondem `401` com `code` igual a `unauthorized`, e nada é gravado (AC 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "anonymous_401_on_four_plan_routes"`

### S2 - Editar, inativar e reativar um plano · ~1 file · ~13 KB · ~3k

**C15** - `PATCH /api/plans/:id` de `admin` e de `hr_finance` com cada um de `name`, `priceCents` e `rules` sozinho (três casos) e com os três juntos responde `200` com o plano atualizado, e a linha fica com o campo novo e todas as outras colunas como estavam (AC 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "patch_each_of_three_fields_and_all_together_keeps_the_rest"`

**C16** - `PATCH /api/plans/:id` com `rules` igual a `null`, sobre um plano que tinha `rules` preenchido, devolve `rules` igual a `null` e deixa a coluna nula na linha (AC 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "patch_null_clears_rules"`

**C17** - `PATCH /api/plans/:id` responde `422` com um item em `errors` cujo `path` é o campo do caso, e a linha fica idêntica, em cada um dos casos: `period` com o valor que o plano já tem, com outro dos quatro valores e com `null`; `null` em `name`, em `priceCents` e em `status`; `name` vazio e de 81 caracteres; `priceCents` igual a `-1`, a `10000000` e a `99.9`; `rules` vazio e de 501 caracteres; e U+0000 dentro de `name` (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "patch_period_null_and_invalid_values_422_fourteen_cases_row_unchanged"`

**C18** - `DELETE /api/plans/:id` de `admin` e de `hr_finance` sobre um plano `active` com duas matrículas (uma não cancelada e uma cancelada) responde `204`; depois, a linha do plano continua, com `status` igual a `inactive` e as outras colunas como estavam, as duas linhas de matrícula são idênticas e `GET /api/plans` continua trazendo o plano (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "delete_inactivates_and_keeps_row_and_enrollments"`

**C19** - `DELETE /api/plans/:id` sobre um plano que já está `inactive` responde `204` e deixa a linha idêntica (AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "delete_of_inactive_plan_204_changes_nothing"`

**C20** - `PATCH /api/plans/:id` com `status` igual a `active` sobre um plano `inactive` responde `200` e deixa `status` igual a `active` na resposta e na linha, sem mexer nos outros campos (AC 12)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "patch_status_active_reactivates_inactive_plan"`

**C21** - `PATCH /api/plans/:id` com `status` igual a `inactive`, `suspended`, `Active`, `ativo` e à cadeia vazia responde `422` com um item cujo `path` é `status`, e a linha fica idêntica (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "patch_status_other_values_422_on_status"`

**C22** - Depois de `PATCH /api/plans/:id` mudar `priceCents` de `9990` para `10990` num plano com duas matrículas, as duas linhas de matrícula são idênticas e `GET /api/students/:id/enrollments` devolve `priceCents` igual a `9990` nas duas; uma matrícula registrada depois do reajuste nasce com `priceCents` igual a `10990` (AC 14, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "price_change_keeps_recorded_enrollments_and_applies_to_the_next"`

**C23** - Dez rodadas de dois `PATCH /api/plans/:id` soltos juntos sobre o mesmo plano, um mudando `name` e o outro `priceCents`, respondem `200` aos dois, e ao fim de cada rodada a linha tem as duas mudanças (AC 15)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "two_simultaneous_patches_on_different_fields_keep_both"`

**C24** - `PATCH` e `DELETE /api/plans/:id` com `:id` igual a `abc` e com um `uuid` de plano nenhum respondem, nos quatro casos, `404` com `code` igual a `not_found`, e a contagem de `plans` não muda (AC 16)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "patch_and_delete_404_for_non_uuid_and_unknown_uuid"`

### S3 - Matricular um aluno num plano · ~4 files · ~34 KB · ~9k

**C25** - `POST /api/students/:id/enrollments` de `admin` e de `hr_finance`, com o `planId` do "Mensal" ativo e `startsAt` igual a `2026-10-07`, responde `201` nos dois casos com exatamente as chaves `id`, `plan`, `startsAt`, `endsAt`, `priceCents`, `status`, `createdAt` e `cancelledAt`: `id` igual ao da linha lida por SQL, `plan` com exatamente `id`, `name` e `period`, `startsAt` igual ao enviado, `endsAt` igual a `2026-11-06`, `priceCents` igual a `9990`, `status` igual a `active`, `createdAt` um instante ISO 8601 entre T0 e T1 e `cancelledAt` igual a `null`; e o mesmo `201` sai para um aluno que não tem linha nenhuma em `consents` e para um menor cujo responsável não concedeu consentimento nenhum (AC 17, Assumptions "Consentimento")
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "enroll_201_by_admin_and_hr_finance_with_the_eight_keys_and_without_consent"`

**C26** - Com `startsAt` igual a `2026-10-07`, a resposta do `POST` e a coluna `ends_at` da linha trazem `2026-11-06` para o plano `monthly`, `2027-01-06` para o `quarterly`, `2027-04-06` para o `semiannual` e `2027-10-06` para o `annual` (AC 18)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "ends_at_for_the_four_periods_from_2026_10_07"`

**C27** - Com o relógio do teste no dia de cada `startsAt`, o `POST` devolve `endsAt` igual a `2026-02-27` para `2026-01-31` `monthly`, a `2028-02-28` para `2028-01-31` `monthly` e a `2029-02-27` para `2028-02-29` `annual`; e, para cada uma das dezessete linhas da tabela da C7, o `endsAt` devolvido é igual ao valor escrito à mão e igual ao que o Postgres do teste calcula em `(startsAt::date + make_interval(months => N) - interval '1 day')::date` (AC 19, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "ends_at_uses_last_day_of_short_month_and_matches_postgres_on_seventeen_rows"`

**C28** - Para uma matrícula de `2026-10-07` a `2026-11-06`, `GET /api/students/:id/enrollments` devolve `status` igual a `scheduled` com o relógio em `2026-10-07T02:59:59Z`, `active` em `2026-10-07T03:00:00Z` e em `2026-11-07T02:59:59Z` e `expired` em `2026-11-07T03:00:00Z`, e a linha de matrícula é idêntica entre as quatro leituras; depois de cancelada, devolve `cancelled` nos quatro instantes (AC 20, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-read.test.ts -t "status_computed_on_read_four_values_across_sao_paulo_midnight_without_changing_the_row"`

**C29** - `POST /api/students/:id/enrollments` com corpo sem `planId`, com `planId` igual a `abc`, a `123`, a `null` e a um `uuid` de plano nenhum responde `422` com um item cujo `path` é `planId`, e nada é gravado (AC 21)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "enroll_five_invalid_plan_ids_422_on_plan_id"`

**C30** - `POST /api/students/:id/enrollments` no plano `monthly` responde `422` com um item cujo `path` é `startsAt`, e nada é gravado, para `startsAt` ausente, `null`, `2026-02-30`, `2026-13-01`, `26-10-07` e `07/10/2026`; com o relógio em `2026-10-07T15:00:00Z`, responde `422` para `2027-10-08` (hoje mais 366 dias) e `201` para `2027-10-07` (hoje mais 365), `422` para `2026-09-07` (vencimento `2026-10-06`, ontem) e `201` para `2026-09-08` (vencimento hoje); e para `2026-09-08` responde `201` com o relógio em `2026-10-08T02:59:59Z` (ainda dia 7 em São Paulo) e `422` em `2026-10-08T03:00:00Z` (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "enroll_starts_at_twelve_cases_around_today_in_sao_paulo"`

**C31** - Com o relógio em `2026-10-07T15:00:00Z`, `POST /api/students/:id/enrollments` com `startsAt` igual a `2026-09-20` no plano `monthly` responde `201` com `endsAt` igual a `2026-10-19` e `status` igual a `active` (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "enroll_started_in_the_past_and_not_ended_201_active"`

**C32** - `POST /api/students/:id/enrollments` com o `planId` de um plano `inactive` responde `409` com `code` igual a `plan_inactive`, e nada é gravado (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "enroll_in_inactive_plan_409_plan_inactive"`

**C33** - `POST /api/students/:id/enrollments` sobre um aluno de `status` igual a `inactive` responde `409` com `code` igual a `student_inactive`, e nada é gravado (AC 25)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "enroll_inactive_student_409_student_inactive"`

**C34** - `POST /api/students/:id/enrollments` sobre um aluno de `status` igual a `suspended` responde `201` com as mesmas oito chaves e os mesmos `endsAt`, `priceCents` e `status` que o mesmo corpo dá para um aluno `active` (AC 26)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "enroll_suspended_student_201_like_active"`

**C35** - Com uma matrícula não cancelada de `2026-10-07` a `2026-11-06`, `POST /api/students/:id/enrollments` do mesmo aluno responde `409` com `code` igual a `enrollment_overlap`, e nada é gravado, em cada um dos casos: o mesmo `startsAt` no mesmo plano; o mesmo `startsAt` em outro plano; `startsAt` igual a `2026-11-06` (um dia em comum, o último); `startsAt` igual a `2026-09-08` no `monthly` (vencimento `2026-10-07`, um dia em comum, o primeiro); `startsAt` igual a `2026-09-10` no `quarterly` (contém o período); e, com o relógio em `2026-12-01T15:00:00Z`, quando a primeira já está `expired`, `startsAt` igual a `2026-11-06` no `monthly`; o mesmo período para outro aluno responde `201` (AC 27, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "enroll_overlap_six_cases_409_and_other_student_201"`

**C36** - Dez rodadas de dois `POST /api/students/:id/enrollments` do mesmo aluno soltos juntos, um no `monthly` e o outro no `quarterly` com o mesmo `startsAt`, respondem `201` a exatamente um e `409` com `enrollment_overlap` ao outro, e ao fim de cada rodada o aluno tem uma linha não cancelada naquele período (AC 28, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "two_simultaneous_enrollments_one_201_one_409"`

**C37** - Por SQL, sem passar por rota nenhuma, com uma linha A não cancelada de `2026-10-07` a `2026-11-06`: o `INSERT` de outra linha do mesmo aluno falha com SQLSTATE `23P01` e a restrição `enrollments_no_overlap` para o mesmo período, para `2026-11-06` a `2026-12-05`, para `2026-09-08` a `2026-10-07`, para `2026-10-10` a `2026-10-20` e para `2026-10-01` a `2026-12-31`; é aceito para `2026-11-07` a `2026-12-06`, para `2026-09-07` a `2026-10-06`, para o mesmo período de outro aluno e para o mesmo período quando A está cancelada; o `UPDATE` que limpa `cancelled_at` de uma linha cancelada sobreposta a uma viva e o que recua em um dia o `starts_at` da linha colada falham com `23P01`; `ends_at` um dia antes de `starts_at` e `price_cents` igual a `-1` falham por violação de `CHECK`, e `ends_at` igual a `starts_at` com `price_cents` igual a `0` é aceito; depois de cada falha a contagem de `enrollments` é a de antes (AC 29, door 2, door 3, door 5)
Proof: `pnpm --filter "./packages/database" exec vitest run test/plans.test.ts -t "enrollments_no_overlap_eleven_cases_by_sql"`
Proof: `pnpm --filter "./packages/database" exec vitest run test/plans.test.ts -t "enrollments_ends_at_and_price_checks"`

**C38** - `GET` e `POST /api/students/:id/enrollments` e `DELETE /api/students/:id/enrollments/:enrollmentId`, com `:id` igual a `abc` e com um `uuid` de aluno nenhum, o `POST` com um corpo válido e o `DELETE` com o `:enrollmentId` de uma matrícula que existe, respondem nos seis casos `404` com `code` igual a `not_found`, e nada é gravado (AC 30)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "enrollment_routes_404_for_non_uuid_and_unknown_student"`

**C39** - Em cada um dos dez casos - `reception` em `POST /api/students/:id/enrollments` e em `DELETE /api/students/:id/enrollments/:enrollmentId` (quatro), `instructor` nas três rotas (seis), cada rota com ids que existem e com `uuid` de ninguém - a resposta é `403` com `code` igual a `forbidden`, o corpo não traz nenhuma das chaves `plan`, `startsAt`, `endsAt`, `priceCents` e `cancelledAt`, e nada é gravado (AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "reception_writes_and_instructor_everything_403_ten_cases"`

**C40** - As três rotas `/api/students/:id/enrollments*`, chamadas sem cookie, respondem `401` com `code` igual a `unauthorized`, e nada é gravado (AC 32)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "anonymous_401_on_three_enrollment_routes"`

### S4 - Renovar · ~1 file · ~5 KB · ~1k

**C41** - Com uma matrícula não cancelada de `endsAt` igual a `2026-11-06`, `POST /api/students/:id/enrollments` com `startsAt` igual a `2026-11-07` responde `201`, e a linha da matrícula anterior é idêntica (AC 33)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "renewal_glued_to_the_previous_201_and_previous_row_unchanged"`

**C42** - Com o relógio em `2026-10-20T15:00:00Z`, depois de registrar a matrícula seguinte (`2026-11-07` a `2026-12-06`) antes de a atual vencer, `GET /api/students/:id/enrollments` devolve a nova com `status` igual a `scheduled` e a atual com `status` igual a `active` (AC 34)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "early_renewal_reads_scheduled_and_current_active"`

**C43** - A matrícula seguinte, de `startsAt` igual a `2026-11-07`, registrada num plano `quarterly` de `priceCents` igual a `24990` depois de uma no "Mensal", responde `201` com `plan.id` do plano novo, `endsAt` igual a `2027-02-06` e `priceCents` igual a `24990` (AC 35)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "renewal_in_another_plan_takes_its_ends_at_and_price"`

**C44** - Com uma matrícula de `endsAt` igual a `2026-11-06`, `POST /api/students/:id/enrollments` com `startsAt` igual a `2026-12-01` responde `201`, e a lista do aluno fica com duas matrículas, a de `2026-10-07` a `2026-11-06` e a de `2026-12-01` a `2026-12-31`, sem nenhuma que cubra os dias de `2026-11-07` a `2026-11-30` (AC 36)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "renewal_after_a_gap_201_and_gap_days_uncovered"`

### S5 - Cancelar uma matrícula · ~1 file · ~6 KB · ~2k

**C45** - `DELETE /api/students/:id/enrollments/:enrollmentId` de `admin` e de `hr_finance` sobre uma matrícula não cancelada, em cada uma das três situações (`scheduled`, `active` e `expired`, postas pelo relógio do teste), responde `204`; depois, a linha continua, com `cancelled_at` entre T0 e T1 e todas as outras colunas como estavam, e a leitura a devolve com `status` igual a `cancelled` e `cancelledAt` igual àquele instante (AC 37)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "cancel_204_sets_cancelled_at_from_database_and_keeps_row_in_three_states"`

**C46** - `DELETE /api/students/:id/enrollments/:enrollmentId` sobre uma matrícula já cancelada responde `204` e deixa a linha idêntica, `cancelled_at` inclusive (AC 38)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "cancel_of_cancelled_204_changes_nothing"`

**C47** - Depois de cancelada a matrícula de `2026-10-07` a `2026-11-06`, `POST /api/students/:id/enrollments` do mesmo aluno com o mesmo `startsAt` responde `201`, e o aluno fica com duas linhas naquele período, uma cancelada e uma não (AC 39)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "enroll_after_cancel_in_the_same_period_201"`

**C48** - `DELETE /api/students/:id/enrollments/:enrollmentId` com `:enrollmentId` igual a `abc`, com um `uuid` de matrícula nenhuma e com o `id` de uma matrícula de outro aluno responde, nos três casos, `404` com `code` igual a `not_found`, e a matrícula do outro aluno fica idêntica (AC 40)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "cancel_404_for_bad_unknown_and_other_students_enrollment"`

### S6 - Ler as matrículas de um aluno · ~1 file · ~8 KB · ~2k

**C49** - `GET /api/students/:id/enrollments` de `admin`, de `hr_finance` e de `reception` responde `200` com todas as matrículas do aluno, canceladas inclusive, cada uma com exatamente as oito chaves da C25, e o corpo é igual para os três perfis; a ordem é a de `startsAt` da mais recente para a mais antiga e, entre duas de mesmo `startsAt` (uma cancelada e a que foi registrada depois no mesmo período), a de `id` maior primeiro: com quatro matrículas a ordem esperada está escrita à mão no teste (AC 41)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-read.test.ts -t "list_includes_cancelled_ordered_by_starts_at_desc_then_id_desc_same_body_for_three_roles"`

**C50** - `GET /api/students/:id/enrollments` de um aluno sem matrícula responde `200` com `items` igual a `[]` (AC 42)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-read.test.ts -t "list_of_student_without_enrollment_200_empty"`

**C51** - Depois de o plano de uma matrícula ser renomeado de `Mensal` para `Mensal Plus`, reajustado para `10990` e inativado, a leitura devolve `plan.name` igual a `Mensal Plus` e mantém `startsAt`, `endsAt` e `priceCents` (`9990`) como foram gravados (AC 43)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-read.test.ts -t "list_shows_current_plan_name_and_recorded_dates_and_price"`

**C52** - Depois de `DELETE /api/students/:id` inativar um aluno com duas matrículas (uma `active` e uma `scheduled`), as duas linhas de matrícula são idênticas, e `GET /api/students/:id/enrollments` responde `200` com as duas, com o mesmo `status` e `cancelledAt` igual a `null` (AC 44)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-read.test.ts -t "inactivating_the_student_keeps_enrollments_and_they_stay_readable"`

**C53** - `GET /api/plans` e `GET /api/students/:id/enrollments` que respondem `200`, cada um por `admin`, por `hr_finance` e por `reception` (seis leituras), deixam a contagem de `audit_logs` igual à de antes (AC 45)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-read.test.ts -t "six_reads_of_plans_and_enrollments_write_no_audit_row"`

### S7 - Cada escrita deixa rastro, na mesma transação · ~1 file · ~22 KB · ~6k

**C54** - `POST /api/plans` que responde `201`, de `admin` e de `hr_finance`, grava exatamente uma linha em `audit_logs`, com `action` igual a `plan.created`, `user_id` igual ao id do autor, `entity` igual a `plan` e `entity_id` igual ao id do plano criado (AC 46)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "create_writes_one_plan_created_row"`

**C55** - A criação com `name` igual a `Mensal`, `period` igual a `monthly` e `priceCents` igual a `9990`, sem `rules`, grava `diff` igual a `{"fields":["name","period","priceCents","status"],"values":{"name":{"from":null,"to":"Mensal"},"period":{"from":null,"to":"monthly"},"priceCents":{"from":null,"to":9990},"status":{"from":null,"to":"active"}}}`; com `rules` enviado, `fields` contém também `rules` e `values` continua só com as quatro chaves (AC 47, AD-026)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "create_diff_records_four_values_and_names_rules_only"`

**C56** - `PATCH /api/plans/:id` que responde `200` tendo mudado `priceCents` de `9990` para `10990` e mudado `rules` grava exatamente uma linha com `action` igual a `plan.updated`, `user_id` do autor, `entity` igual a `plan`, `entity_id` igual a `:id` e `diff` igual a `{"fields":["priceCents","rules"],"values":{"priceCents":{"from":9990,"to":10990}}}`; mudando só `name` de `Mensal` para `Mensal Plus`, `diff` igual a `{"fields":["name"],"values":{"name":{"from":"Mensal","to":"Mensal Plus"}}}` (AC 48)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "patch_writes_one_plan_updated_row_with_values_and_rules_by_name"`

**C57** - `PATCH /api/plans/:id` que reativa um plano `inactive` grava uma linha `plan.updated` com `diff` igual a `{"fields":["status"],"values":{"status":{"from":"inactive","to":"active"}}}` (AC 49)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "reactivation_diff_records_status_from_inactive_to_active"`

**C58** - `PATCH /api/plans/:id` responde `200` e deixa a contagem de `audit_logs` igual, nos seis casos: `name`, `priceCents` e `rules` com o valor que já têm, `rules` igual a `null` sobre um plano sem `rules`, `status` igual a `active` sobre um plano `active`, e corpo vazio (AC 50)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "patch_without_change_six_cases_writes_no_row"`

**C59** - `DELETE /api/plans/:id` sobre um plano `active` grava exatamente uma linha com `action` igual a `plan.inactivated`, `user_id` do autor, `entity` igual a `plan`, `entity_id` igual a `:id` e `diff` igual a `{"fields":["status"],"values":{"status":{"from":"active","to":"inactive"}}}` (AC 51)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "inactivate_writes_one_plan_inactivated_row"`

**C60** - `POST /api/students/:id/enrollments` que responde `201` grava exatamente uma linha com `action` igual a `student.enrollment_created`, `user_id` do autor, `entity` igual a `student`, `entity_id` igual ao id do aluno e `diff` igual a `{"fields":["planId","startsAt","endsAt","priceCents"],"values":{"planId":{"from":null,"to":"<planId>"},"startsAt":{"from":null,"to":"2026-10-07"},"endsAt":{"from":null,"to":"2026-11-06"},"priceCents":{"from":null,"to":9990}}}` (AC 52, AD-063)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "enroll_writes_one_enrollment_created_row_with_null_from"`

**C61** - `DELETE /api/students/:id/enrollments/:enrollmentId` que cancela uma matrícula grava exatamente uma linha com `action` igual a `student.enrollment_cancelled`, `user_id` do autor, `entity` igual a `student`, `entity_id` igual ao id do aluno e `diff` igual a `{"fields":["planId","startsAt","endsAt","priceCents"],"values":{"planId":{"from":"<planId>","to":null},"startsAt":{"from":"2026-10-07","to":null},"endsAt":{"from":"2026-11-06","to":null},"priceCents":{"from":9990,"to":null}}}` (AC 53)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "cancel_writes_one_enrollment_cancelled_row_with_null_to"`

**C62** - Cada um dos vinte e sete desfechos a seguir responde exatamente o status do caso e deixa a contagem de `audit_logs` igual à de antes: `POST /api/plans` com `401`, `403` e `422`; `PATCH /api/plans/:id` com `401`, `403`, `404` e `422`; `DELETE /api/plans/:id` com `401`, `403`, `404` e sobre um plano já `inactive` (`204`); `POST /api/students/:id/enrollments` com `401`, `403`, `404`, `422` e os três `409` (`enrollment_overlap`, `plan_inactive` e `student_inactive`); `DELETE /api/students/:id/enrollments/:enrollmentId` com `401`, `403`, `404` e sobre uma matrícula já cancelada (`204`); `GET /api/plans` com `401` e `403`; `GET /api/students/:id/enrollments` com `401`, `403` e `404` (AC 54)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "twenty_seven_non_writing_outcomes_write_no_audit_row"`

**C63** - Com o insert em `audit_logs` falhando, `POST /api/plans`, `PATCH` e `DELETE /api/plans/:id`, `POST /api/students/:id/enrollments` e `DELETE /api/students/:id/enrollments/:enrollmentId` respondem `500` com `code` igual a `internal_error`, e `plans` e `enrollments` ficam como estavam antes da requisição (contagem e linhas idênticas, `status` do plano e `cancelled_at` inclusive) (AC 55, AD-027)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "audit_insert_failure_500_rolls_back_five_write_routes"`

**C64** - Para cada uma das cinco ações (`plan.created`, `plan.updated`, `plan.inactivated`, `student.enrollment_created`, `student.enrollment_cancelled`), a linha grava `ip` igual a `203.0.113.7` e `user_agent` igual aos 512 primeiros caracteres quando a requisição vem com `X-Forwarded-For: 198.51.100.1, 203.0.113.7` e `User-Agent` de 513 caracteres; o mesmo `ip` com `X-Forwarded-For: 203.0.113.7` só; e `user_agent` nulo sem `User-Agent` - os três casos afirmados em cada uma das cinco (AC 56, AD-028)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "ip_and_user_agent_three_cases_on_each_of_five_actions"`

**C65** - Depois de cadastrar o aluno `Rafaela Prado Cunha` de CPF `529.982.247-25`, criar um plano com `rules` igual a `Acesso livre de segunda a sábado, das 6h às 22h`, editar `rules` para `Somente manhãs, até as 12h`, matricular a aluna e cancelar, o texto de todas as colunas de todas as linhas de `audit_logs` não contém o nome da aluna, o CPF com ou sem máscara, nem nenhum dos dois textos de `rules` (AC 57)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans-audit.test.ts -t "student_name_cpf_and_rules_text_never_reach_audit_logs"`

### S8 - Tela de planos · ~10 files · ~46 KB · ~11k

**C66** - O link "Planos", que leva a `/plans`, aparece no menu para `admin`, para `hr_finance` e para `reception` e não existe para `instructor` (AC 58)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "plans_link_for_admin_hr_finance_and_reception"`

**C67** - Sem sessão, abrir `/plans`, `/plans/new` e `/plans/<id>/edit` redireciona, nos três casos, para `/login`, sem nenhuma requisição a `/api/plans` registrada pela `FakeApi` (AC 59)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "anonymous_three_plan_urls_redirect_to_login"`

**C68** - Em cada um dos cinco casos - `instructor` em `/plans`, `/plans/new` e `/plans/<id>/edit`; `reception` em `/plans/new` e `/plans/<id>/edit` - a página exibe "Você não tem permissão para acessar esta página.", não exibe o campo "Nome" nem o botão "Salvar", e o texto da página não contém o nome, o valor nem as regras de acesso do plano que a `FakeApi` tem (AC 60)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "instructor_and_reception_see_no_permission_on_five_cases"`

**C69** - Para `admin`, `hr_finance` e `reception`, `/plans` exibe o título "Planos" e uma tabela de colunas "Nome", "Periodicidade", "Valor", "Regras de acesso" e "Situação", nessa ordem, com as linhas na ordem em que a API as devolve (uma ordem que não é a alfabética), ativos e inativos juntos (AC 61)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "list_title_five_columns_and_api_order_for_three_roles"`

**C70** - `/plans` exibe a periodicidade `monthly`, `quarterly`, `semiannual` e `annual` como "Mensal", "Trimestral", "Semestral" e "Anual"; `priceCents` igual a `9990` como `R$ 99,90`, `0` como `R$ 0,00`, `123456` como `R$ 1.234,56` e `9999999` como `R$ 99.999,99`; a situação como "Ativo" e "Inativo"; e "—" no `rules` nulo (AC 62)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "list_formats_period_price_status_and_dash_for_null_rules"`

**C71** - Para `admin` e para `hr_finance`, `/plans` exibe o botão "Novo plano", que leva a `/plans/new`, e o nome de cada plano como link para `/plans/<id>/edit`; para `reception` exibe a mesma tabela sem o botão e sem link nenhum na coluna "Nome" (AC 63)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "new_button_and_name_links_only_for_admin_and_hr_finance"`

**C72** - Com `items` vazio, `/plans` exibe "Nenhum plano cadastrado." e não exibe a tabela (AC 64)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "empty_registry_shows_no_plan_message"`

**C73** - Quando `GET /api/plans` falha (a `FakeApi` responde `500`), `/plans` exibe "Não foi possível carregar os planos." e o botão "Tentar novamente" (AC 65)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "load_failure_shows_retry"`

**C74** - `/plans/new` e `/plans/<id>/edit` exibem os campos "Nome", "Periodicidade", "Valor (R$)" e "Regras de acesso" e o botão "Salvar"; "Periodicidade" está habilitado em `/plans/new` e desabilitado em `/plans/<id>/edit`; e a edição traz os campos preenchidos com os valores do plano, o valor como `99,90` (AC 66)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "form_labels_save_button_and_period_disabled_on_edit"`

**C75** - Salvar o formulário de `/plans/new` com "Valor (R$)" igual a `99,90` envia `POST /api/plans` com `priceCents` igual a `9990`, e o de `/plans/<id>/edit` com `109,90` envia `PATCH /api/plans/<id>` com `priceCents` igual a `10990`; `99` envia `9900`, `99,9` envia `9990` e `0,00` envia `0` (AC 67, door 2)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "price_typed_in_reais_is_sent_in_cents_five_values"`

**C76** - Com "Valor (R$)" vazio, igual a `abc`, a `99,999` e a `-5,00`, acionar "Salvar" exibe "Informe um valor em reais, como 99,90." junto do campo (descrição acessível do campo) e a `FakeApi` não registra nenhuma requisição de escrita, nos dois formulários (AC 68)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "invalid_price_four_values_shows_message_and_sends_nothing"`

**C77** - Salvar o formulário de `/plans/new` com a API respondendo `201` e o de `/plans/<id>/edit` com a API respondendo `200` leva, nos dois casos, a `/plans` (AC 69)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "save_navigates_to_the_plans_list_from_new_and_edit"`

**C78** - `/plans/<id>/edit` exibe o botão "Inativar" e não o "Reativar" para o plano `active`, e o "Reativar" e não o "Inativar" para o `inactive` (AC 70)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "edit_shows_inativar_or_reativar_by_status"`

**C79** - Acionar "Inativar" abre um diálogo que nomeia o plano e não envia requisição nenhuma; "Cancelar" fecha o diálogo sem requisição; confirmar envia exatamente um `DELETE /api/plans/<id>`, e a página vai para `/plans` depois que a API responde `204` (AC 71)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "inactivate_confirms_naming_the_plan_then_deletes_and_goes_to_the_list"`

**C80** - `/plans/<id>/edit` com um `<id>` que não está entre os planos que a API devolve exibe "Plano não encontrado." e nenhum campo de formulário (AC 72)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "unknown_plan_shows_not_found_on_edit"`

### S9 - Matrículas na ficha do aluno · ~6 files · ~38 KB · ~10k

**C81** - Para `admin`, `hr_finance` e `reception`, `/students/<id>` exibe o bloco "Matrículas" com uma tabela de colunas "Plano", "Início", "Vencimento", "Valor" e "Situação", nessa ordem, com as linhas na ordem em que a API as devolve (uma ordem que não é a de data), o nome do plano, `startsAt` igual a `2026-10-07` como `07/10/2026`, `endsAt` igual a `2026-11-06` como `06/11/2026`, `priceCents` igual a `9990` como `R$ 99,90`, e `scheduled`, `active`, `expired` e `cancelled` como "Agendada", "Ativa", "Vencida" e "Cancelada" (AC 73)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "block_five_columns_api_order_formats_and_four_status_labels_for_three_roles"`

**C82** - Com `items` vazio, o bloco exibe "Nenhuma matrícula registrada." e não exibe a tabela (AC 74)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "empty_block_shows_no_enrollment_message"`

**C83** - Quando `GET /api/students/<id>/enrollments` falha (a `FakeApi` responde `500`), o bloco exibe "Não foi possível carregar as matrículas." e o botão "Tentar novamente", e a ficha continua exibindo o nome do aluno e os demais blocos (AC 75)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "enrollments_load_failure_shows_retry_without_hiding_ficha"`

**C84** - Para `instructor`, `/students/<id>` exibe o nome do aluno, não exibe o texto "Matrículas", e a `FakeApi` não registra nenhuma requisição a `/api/students/<id>/enrollments` nem a `/api/plans` (AC 76)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "instructor_has_no_block_and_no_enrollment_or_plan_calls"`

**C85** - Para `admin` e para `hr_finance`, o bloco exibe "Matricular" e não "Renovar" quando o aluno não tem matrícula, quando só tem uma `expired` e quando só tem uma `cancelled`; exibe "Renovar" e não "Matricular" quando tem uma `active` e quando tem uma `scheduled`; e exibe um botão "Cancelar" em cada linha `scheduled`, `active` e `expired` e nenhum na linha `cancelled`; para `reception`, nos mesmos cinco estados, exibe a tabela sem nenhum dos três botões (AC 77)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "matricular_or_renovar_by_five_states_cancelar_per_row_and_no_buttons_for_reception"`

**C86** - Com o aluno de `status` igual a `inactive`, o bloco exibe "Aluno inativo: reative o aluno para matricular." e nenhum dos botões "Matricular" e "Renovar", tanto sem matrícula quanto com uma `active` (AC 78)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "inactive_student_shows_message_instead_of_matricular_and_renovar"`

**C87** - Acionar "Matricular" abre um diálogo com o campo "Plano", cujas opções são só os planos `active`, cada uma como "<nome> · <periodicidade> · <valor>" (`Mensal · Mensal · R$ 99,90`), o campo "Início", o texto "Vencimento: dd/MM/aaaa" e o botão "Confirmar", sem nenhuma requisição de escrita; com "Início" igual a `2026-10-07`, o texto é "Vencimento: 06/11/2026" no plano `monthly` e passa a "Vencimento: 06/10/2027" ao escolher o `annual`, e com "Início" igual a `2026-01-31` no `monthly` é "Vencimento: 27/02/2026"; "Confirmar" envia exatamente um `POST /api/students/<id>/enrollments` com o corpo `{"planId":"<id do plano>","startsAt":"2026-10-07"}` (AC 79, door 4)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "dialog_lists_active_plans_previews_ends_at_and_posts_only_after_confirm"`

**C88** - O diálogo aberto por "Matricular" traz "Início" igual a `2026-10-07` com o relógio do navegador em `2026-10-08T02:59:59Z` e igual a `2026-10-08` em `2026-10-08T03:00:00Z`; aberto por "Renovar", com uma `active` até `2026-11-06`, uma `scheduled` até `2026-12-06` e uma `cancelled` até `2027-03-31`, traz "Início" igual a `2026-12-07` e "Plano" igual ao plano da `scheduled`; e, quando esse plano está `inactive`, ele não está entre as opções nem vem escolhido (AC 80)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "dialog_prefills_today_in_sao_paulo_or_day_after_last_ends_at_and_its_plan"`

**C89** - Quando a API não devolve plano nenhum, e quando só devolve planos `inactive`, o diálogo exibe "Nenhum plano ativo. Cadastre um plano em Planos." e o botão "Confirmar" está desabilitado (AC 81)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "dialog_without_active_plan_shows_message_and_disables_confirm"`

**C90** - Quando `GET /api/plans` falha (`500`) e `GET /api/students/<id>/enrollments` responde, a ficha exibe o nome do aluno e a tabela de matrículas, e "Não foi possível carregar os planos." no lugar dos botões "Matricular" e "Renovar" (AC 82)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "plans_load_failure_keeps_ficha_and_table_without_matricular"`

**C91** - Depois de a API responder `201` ao `POST`, o diálogo fecha e o bloco exibe a linha da matrícula nova, com o plano, o início e o vencimento dela (AC 83)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "block_shows_new_enrollment_after_confirm"`

**C92** - Com a API respondendo `409` com `enrollment_overlap`, `plan_inactive` e `student_inactive`, o diálogo exibe, respectivamente, "Já existe uma matrícula neste período.", "Este plano foi inativado. Escolha outro." e "Reative o aluno antes de matricular.", continua aberto e mantém o plano e o início escolhidos (AC 84)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "three_409_codes_show_their_messages_and_keep_the_choices"`

**C93** - Com a API respondendo `422` com um item de `path` igual a `startsAt` e `message` igual a "Escolha um início dentro de 365 dias.", o diálogo exibe exatamente essa mensagem junto do campo "Início" (descrição acessível do campo) (AC 85)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "starts_at_422_message_shown_on_the_field"`

**C94** - Acionar "Cancelar" numa linha abre um diálogo cujo texto contém o nome do aluno, o nome do plano, `07/10/2026` e `06/11/2026`, e não envia requisição nenhuma; desistir fecha o diálogo sem requisição; confirmar envia exatamente um `DELETE /api/students/<id>/enrollments/<enrollmentId>`, e depois do `204` a linha exibe "Cancelada" e não tem mais o botão "Cancelar" (AC 86)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "cancel_confirms_naming_student_plan_and_period_then_deletes"`

### S10 - A trilha de plano e de matrícula na tela de Auditoria · ~3 files · ~9 KB · ~2k

**C95** - `/audit` exibe na coluna "Ação" "Plano criado", "Plano editado", "Plano inativado", "Matrícula registrada" e "Matrícula cancelada" para as linhas das cinco ações novas; e o filtro "Ação" oferece as trinta e seis ações, as cinco novas nas posições 32 a 36, nessa ordem, com as trinta e uma primeiras na ordem e com o texto de antes (AC 87)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "plan_and_enrollment_actions_labelled_and_filter_has_thirty_six"`

**C96** - Uma linha com `entity` igual a `plan` exibe em "Alvo" o link "Ver plano", que leva a `/plans/<entityId>/edit` (AC 88)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "plan_target_link_ver_plano"`

**C97** - Uma linha `plan.updated` com `diff` de `fields` igual a `["priceCents","rules"]` e `values.priceCents` de `9990` para `10990` exibe em "Detalhes" "Valor: R$ 99,90 → R$ 109,90" e "Regras de acesso alterado" (AC 89)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "plan_updated_details_show_price_change_and_rules_by_name"`

**C98** - Uma linha `plan.created` com o `diff` da C55 exibe em "Detalhes" "Nome: Mensal", "Periodicidade: Mensal", "Valor: R$ 99,90" e "Situação: Ativo" (AC 90)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "plan_created_details_show_four_values"`

**C99** - Uma linha `student.enrollment_created` com `planId` de um plano que a API devolve, `startsAt` igual a `2026-10-07`, `endsAt` igual a `2026-11-06` e `priceCents` igual a `9990` exibe em "Detalhes" "Plano: — → <nome atual do plano>", "Início: — → 07/10/2026", "Vencimento: — → 06/11/2026" e "Valor: — → R$ 99,90", e em "Alvo" o link "Ver aluno", que leva a `/students/<entityId>` (AC 91)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "enrollment_created_details_show_plan_name_period_and_price_with_ver_aluno"`

### S11 - Contrato, montagem, concorrência, regressão do aluno, o que a tela envia e stack · ~10 files · ~36 KB · ~9k

**C100** - No documento de `GET /api/openapi.json`, `/api/plans` traz `get` e `post`; `/api/plans/{id}` traz `patch` e `delete`; `/api/students/{id}/enrollments` traz `get` e `post`; `/api/students/{id}/enrollments/{enrollmentId}` traz `delete`; e os corpos de `post` e `patch` de plano e o de `post` de matrícula são `application/json` pelo schema de `packages/contracts` (AD-011, Impact "portão")
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "plan_and_enrollment_paths_declared_with_json_bodies"`

**C101** - Os corpos reais de `POST /api/plans` (`201`), `PATCH /api/plans/:id` (`200`), `GET /api/plans` (`200`, vazio e com itens), `POST /api/students/:id/enrollments` (`201`) e `GET /api/students/:id/enrollments` (`200`, vazio e com itens) validam contra os schemas de resposta de `packages/contracts`; os corpos reais `401`, `403`, `404`, `409` e `422` das rotas novas validam contra o schema de erro; e `enrollment_overlap`, `plan_inactive` e `student_inactive` são, cada um, o `code` de um `409` real (AD-009, AD-011, Impact "contrato")
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "plan_and_enrollment_bodies_match_contract_schemas_and_three_new_codes"`

**C102** - `admin` sem 2FA ativo recebe `403` com `code` igual a `two_factor_enrollment_required` nas sete rotas novas, e a lista de rotas bloqueadas escrita no teste as inclui (Surface, `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C103** - Cada uma das cinco rotas de escrita (`POST /api/plans`, `PATCH` e `DELETE /api/plans/:id`, `POST /api/students/:id/enrollments` e `DELETE /api/students/:id/enrollments/:enrollmentId`), com `Origin` igual a `http://evil.example` e sem `Origin` com `Sec-Fetch-Site: cross-site`, responde `403` com `code` igual a `csrf_rejected`, e nada é gravado (AD-020)
Proof: `pnpm --filter "./apps/api" exec vitest run test/plans.test.ts -t "foreign_origin_403_csrf_on_five_write_routes"`

**C104** - Com entrada hostil (`a\u0000b`, `\ud800`, 50 emojis, 60 000 caracteres, `' or 1=1 --`, `%00`, `\`) em `name` e `rules` de `POST` e `PATCH` de plano e em `planId` e `startsAt` do `POST` de matrícula, com segmentos hostis (`%E0%A4%A`, `%00`, `a%2Fb`, `..%2F..`, 5 000 caracteres) no `:id` das duas rotas de plano e no `:id` e no `:enrollmentId` das três de matrícula, e com corpos `[]`, `null`, `7`, `"texto"` e `{"name":{"a":1}}` nos dois `POST`, nenhuma resposta tem status `5xx` (derivado: as N1 a N3 da verificação da `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/hostile-input.test.ts -t "hostile_input_never_answers_5xx"`

**C105** - Em dez rodadas de cada par solto junto, nenhuma resposta tem status `500` ou maior, e: dois `DELETE` da mesma matrícula respondem `204` aos dois e gravam exatamente uma linha `student.enrollment_cancelled`; dois `DELETE /api/plans/:id` do mesmo plano `active` respondem `204` aos dois e gravam exatamente uma linha `plan.inactivated`; um `DELETE` da matrícula A e um `POST` de um período sobreposto a A respondem `204` e `201` ou `409` com `enrollment_overlap`, e ao fim o aluno não tem duas linhas não canceladas com um dia em comum; um `DELETE /api/plans/:id` e um `POST` de matrícula naquele plano respondem `204` e `201` ou `409` com `plan_inactive`; e um `DELETE /api/students/:id` e um `POST` de matrícula daquele aluno respondem `204` e `201` ou `409` com `student_inactive` (door 3, door 5; derivado, sem AC própria)
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-write.test.ts -t "five_racing_pairs_never_5xx_one_audit_row_and_no_overlap_left"`

**C106** - Para um aluno com duas matrículas, `GET /api/students/:id` e o item dele em `GET /api/students` trazem, para cada um dos quatro perfis, exatamente as mesmas chaves que trazem para um aluno sem matrícula; e `DELETE /api/students/:id` sobre ele grava exatamente uma linha, `student.inactivated`, e nenhuma `student.enrollment_cancelled` (Impact "comportamento existente")
Proof: `pnpm --filter "./apps/api" exec vitest run test/student-enrollments-read.test.ts -t "student_routes_keep_their_keys_and_inactivation_writes_only_its_own_row"`

**C107** - O formulário de `/plans/new` envia `POST /api/plans` sem a chave `rules` quando o campo está vazio e com ela quando preenchido; o de `/plans/<id>/edit`, depois de o usuário mudar só "Nome", envia `PATCH /api/plans/<id>` só com `name`; depois de apagar "Regras de acesso" preenchido, envia `rules` igual a `null`; e em nenhum dos `PATCH` o corpo tem a chave `period` (derivado da `Surface`: `period` não é aceito e `null` limpa `rules`)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "new_form_omits_empty_rules_and_edit_form_sends_only_changes_never_period"`

**C108** - Acionar "Reativar" em `/plans/<id>/edit` de um plano `inactive` envia exatamente um `PATCH /api/plans/<id>` com corpo `{"status":"active"}`, sem diálogo (derivado de AC 12 e AC 70; Observable: reativar não confirma)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "reativar_sends_patch_active_without_dialog"`

**C109** - Enquanto a API não responde ao `POST` de `/plans/new`, ao `PATCH` de `/plans/<id>/edit` e ao `POST` do diálogo de matrícula, o botão "Salvar" das duas telas e o "Confirmar" do diálogo ficam desabilitados (Observable, loading state "existing" provado nas telas novas)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/plans.spec.ts -g "save_button_disabled_while_waiting_on_both_forms"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "confirm_button_disabled_while_waiting"`

**C110** - Renderizar `/students/<id>` faz a página pedir à API, para `admin` e para `hr_finance`, `GET /api/students/<id>/enrollments` exatamente uma vez e `GET /api/plans` exatamente uma vez; e para `reception`, `GET /api/students/<id>/enrollments` exatamente uma vez e nenhuma requisição a `/api/plans` (Flow "Telas" 2, Impact "web")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/student-enrollments.spec.ts -g "ficha_asks_for_enrollments_once_and_for_plans_only_when_the_role_writes"`

**C111** - Em `/audit`, uma linha `student.enrollment_cancelled` com os quatro campos de `from` preenchido e `to` nulo exibe em "Detalhes" "Plano: <nome atual do plano> → —", "Início: 07/10/2026 → —", "Vencimento: 06/11/2026 → —" e "Valor: R$ 99,90 → —"; uma linha `plan.inactivated` exibe "Situação: Ativo → Inativo"; uma linha de matrícula cujo `planId` não está entre os planos que a API devolve exibe o próprio id no lugar do nome; e a página pede `GET /api/plans` exatamente uma vez (derivado, simétrico à AC 91; Impact "web")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "enrollment_cancelled_and_plan_inactivated_details_and_unknown_plan_id"`

**C112** - Na stack de pé, com a migração `0008` aplicada ao subir pelo papel do `compose.yaml` (`pg_extension` tem `btree_gist` e as tabelas `plans` e `enrollments` existem), e um usuário `hr_finance`, um `reception` e um `instructor` criados pelo próprio teste, pela origem do container `web` e com `User-Agent` e `X-Forwarded-For` escolhidos: `hr_finance` cria um plano `monthly` de `9990` (`201`) e matricula um aluno a partir de hoje em `America/Sao_Paulo` (`201`), com `endsAt` igual ao que o `psql` da stack calcula em `date + interval '1 month' - interval '1 day'`; repetir o mesmo `POST` responde `409` com `enrollment_overlap`; `reception` lê as matrículas (`200`) e recebe `403` ao matricular; abrir `/plans` com a sessão de `reception` exibe o nome do plano e `R$ 99,90`, abrir `/students/<id>` com a de `hr_finance` exibe "Matrículas" e "Ativa", e abrir `/plans` com a de `instructor` exibe "Você não tem permissão para acessar esta página."; ao fim, `audit_logs` tem exatamente uma linha `plan.created` e uma `student.enrollment_created`, com o `ip` e o `user_agent` enviados, e a abertura das três páginas não acrescentou linha nenhuma (AC 1, AC 17, AC 27, AC 31, AC 45, AC 46, AC 52, AC 56, AC 61, AC 73, door 5, Impact "ambiente", Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "plan_created_and_student_enrolled_through_web_with_overlap_refused_and_audit_rows"`

## Coverage

Uma linha para cada rota da `Surface`, com os status como membros, e uma por perfil; depois as doors, o
que `Relations` acrescenta, os conjuntos enumerados nos critérios, nas `Assumptions` e na `Observable`, e
as montagens.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/plans` statuses (3) | 200 C12 · 401 C14 · 403 C13 | - |
| `POST /api/plans` statuses (4) | 201 C9 · 401 C14 · 403 C13 · 422 C10 | - |
| `PATCH /api/plans/:id` statuses (5) | 200 C15 · 401 C14 · 403 C13 · 404 C24 · 422 C17 | - |
| `DELETE /api/plans/:id` statuses (4) | 204 C18 · 401 C14 · 403 C13 · 404 C24 | - |
| `GET /api/students/:id/enrollments` statuses (4) | 200 C49 · 401 C40 · 403 C39 · 404 C38 | - |
| `POST /api/students/:id/enrollments` statuses (6) | 201 C25 · 401 C40 · 403 C39 · 404 C38 · 409 C35 · 422 C29 | - |
| `DELETE /api/students/:id/enrollments/:enrollmentId` statuses (4) | 204 C45 · 401 C40 · 403 C39 · 404 C38, C48 | - |
| status `500` fora da `Surface`, por rota de escrita (5) | `POST /api/plans` C63 · `PATCH /api/plans/:id` C63 · `DELETE /api/plans/:id` C63 · `POST` da matrícula C63 · `DELETE` da matrícula C63 | - |
| códigos do `409` da matrícula (3) | `enrollment_overlap` C35 · `plan_inactive` C32 · `student_inactive` C33 | - |
| quem escreve, por perfil (4) | `admin` C9, C25 · `hr_finance` C9, C25 · `reception` C13, C39 · `instructor` C13, C39 | - |
| quem lê, por perfil (4) | `admin` C12, C49 · `hr_finance` C12, C49 · `reception` C12, C49 · `instructor` C13, C39 | - |
| linha de erro comum da `auth-rbac` nas rotas novas (3) | `401 unauthorized` C14, C40 · `403 csrf_rejected` C103 · `403 two_factor_enrollment_required` C102 | - |
| casos negados nas rotas de plano (11) | C13, table-driven over all 11 | - |
| casos negados nas rotas de matrícula (10) | C39, table-driven over all 10 | - |
| rotas sem sessão (7) | `GET /api/plans` C14 · `POST /api/plans` C14 · `PATCH /api/plans/:id` C14 · `DELETE /api/plans/:id` C14 · `GET` das matrículas C40 · `POST` da matrícula C40 · `DELETE` da matrícula C40 | - |
| rotas de escrita sob a checagem de origem (5) | C103, table-driven over all 5 | - |
| rotas bloqueadas ao `admin` sem 2FA (7) | C102, table-driven over all 7 | - |
| rotas no documento OpenAPI (7) | C100, table-driven over all 7 | - |
| `:id` inválido por rota com `:id` (5) | `PATCH` do plano C24 · `DELETE` do plano C24 · `GET` das matrículas C38 · `POST` da matrícula C38 · `DELETE` da matrícula C38 | - |
| `:enrollmentId` inválido (3) | `abc` C48 · `uuid` de matrícula nenhuma C48 · matrícula de outro aluno C48 | - |
| one-way doors (6) | door 1 C1, C2 · door 2 C2, C10 · door 3 C3, C37 · door 4 C7, C8 · door 5 C4, C37 · door 6 C5, C54 | - |
| relações de `Relations` (2) | plano e matrículas C3, C25 · aluno e períodos de matrícula C3, C25 | - |
| one-way constraints de `Relations` (9) | periodicidade em quatro valores C2 · periodicidade que não muda depois de criada C17 · situação do plano em dois valores C2 · dinheiro inteiro e nunca negativo C2, C37 · um aluno e um plano por matrícula, sem cascata C3 · vencimento nunca anterior ao início C37 · cancelamento é o que muda, uma vez C45, C46 · situação da matrícula não guardada C3, C28 · sem dia em comum entre dois períodos não cancelados C37 | - |
| o que `plans` não tem (4) | `deleted_at` C1 · `tenant_id` C1 · `UNIQUE` em `name` C1 · chave estrangeira C1 | - |
| o que `enrollments` não tem (3) | `status` C3 · `deleted_at` C3 · `tenant_id` C3 | - |
| valores de `period` no banco (8) | `monthly` C2 · `quarterly` C2 · `semiannual` C2 · `annual` C2 · `weekly` C2 · `Monthly` C2 · `mensal` C2 · cadeia vazia C2 | - |
| valores de `status` do plano no banco (6) | `active` C2 · `inactive` C2 · `suspended` C2 · `Active` C2 · `ativo` C2 · cadeia vazia C2 | - |
| `price_cents` no banco (6 edges) | `0` em `plans` C2 · `9999999` em `plans` C2 · `-1` em `plans` C2 · nulo em `plans` C2 · `-1` em `enrollments` C37 · `0` em `enrollments` C37 | - |
| `NOT NULL` de `enrollments` (5) | `student_id` C3 · `plan_id` C3 · `starts_at` C3 · `ends_at` C3 · `price_cents` C3 | - |
| chaves estrangeiras de `enrollments` (4) | `student_id` com `NO ACTION` C3 · `plan_id` com `NO ACTION` C3 · aluno com matrícula não é apagado C3 · plano com matrícula não é apagado C3 | - |
| relações entre dois períodos, por SQL (11) | C37, table-driven over all 11: cinco recusadas no `INSERT`, quatro aceitas e duas recusadas no `UPDATE` | - |
| `ends_at` contra `starts_at` no banco (2 edges) | um dia antes recusado C37 · igual aceito C37 | - |
| o que a migração `0008` deixa no banco (7) | `plans` C4 · `enrollments` C4 · as duas vazias C4 · `btree_gist` C4 · `pg_trgm` continua C4 · tabelas e linhas de antes intactas C4 · `enrollments_no_overlap` do tipo exclusão C4 | - |
| vocabulário de `AUDIT_ACTIONS` (36) | C5, table-driven over all 36: os trinta e um de antes e os cinco novos | - |
| quem grava cada ação nova (5) | `plan.created` C54 · `plan.updated` C56 · `plan.inactivated` C59 · `student.enrollment_created` C60 · `student.enrollment_cancelled` C61 | - |
| campos de plano na trilha (5) | `name` com valor C55, C56 · `period` com valor C55 · `priceCents` com valor C55, C56 · `status` com valor C55, C57, C59 · `rules` só pelo nome C55, C56, C65 | - |
| campos de matrícula na trilha (4) | `planId` C60, C61 · `startsAt` C60, C61 · `endsAt` C60, C61 · `priceCents` C60, C61 | - |
| forma do `diff` de matrícula (2) | `from` nulo no registro C60 · `to` nulo no cancelamento C61 | - |
| `PATCH` de plano sem mudança (6) | `name` igual C58 · `priceCents` igual C58 · `rules` igual C58 · `rules` nulo sobre nulo C58 · `status` igual C58 · corpo vazio C58 | - |
| desfechos que não gravam linha (27) | C62, table-driven over all 27 | - |
| leituras `200` que não gravam (6) | C53, table-driven over all 6: duas rotas por três perfis | - |
| rotas que desfazem quando a auditoria falha (5) | `POST /api/plans` C63 · `PATCH /api/plans/:id` C63 · `DELETE /api/plans/:id` C63 · `POST` da matrícula C63 · `DELETE` da matrícula C63 | - |
| `ip` e `user_agent` da linha (4) | dois valores em `X-Forwarded-For` C64 · um valor C64 · `User-Agent` de 513 caracteres cortado em 512 C64 · sem `User-Agent` C64 | - |
| ações que gravam `ip` e `user_agent` (5) | C64, table-driven over all 5, os três casos em cada uma | - |
| o que fica fora de `audit_logs` (4) | nome do aluno C65 · CPF com e sem máscara C65 · texto de `rules` de antes C65 · texto de `rules` de depois C65 | - |
| `name` do plano na API (5 edges) | ausente C10 · vazio C10 · só espaços C10 · 80 caracteres C10 · 81 caracteres C10 | - |
| `period` na API (10) | `monthly` C9 · `quarterly` C9 · `semiannual` C9 · `annual` C9 · ausente C10 · `null` C10 · vazio C10 · `weekly` C10 · `Monthly` C10 · `mensal` C10 | - |
| `priceCents` na API (8 edges) | ausente C10 · `null` C10 · `-1` C10 · `0` C10 · `9999999` C10 · `10000000` C10 · `99.9` C10 · `"9990"` C10 | - |
| `rules` na API (4 edges) | vazio C10 · só espaços C10 · 500 caracteres C10 · 501 caracteres C10 | - |
| campos de texto com U+0000 (2) | `name` C10, C17 · `rules` C10 | - |
| o que o `PATCH` de plano edita (4) | `name` C15 · `priceCents` C15 · `rules` C15 · os três juntos C15 | - |
| `null` no `PATCH` de plano (4) | `rules` limpa C16 · `name` C17 · `priceCents` C17 · `status` C17 | - |
| `period` no `PATCH` (3) | o valor que já tem C17 · outro valor C17 · `null` C17 | - |
| valores de `status` no `PATCH` (6) | `active` reativa C20 · `inactive` C21 · `suspended` C21 · `Active` C21 · `ativo` C21 · cadeia vazia C21 | - |
| o que inativar o plano mantém (3) | a linha C18 · as matrículas C18 · o plano na lista C18 | - |
| inativar o plano por situação (2) | ativo vira inativo C18 · já inativo nada muda C19 | - |
| reajuste de valor (3) | linhas de matrícula intactas C22 · leitura com o valor antigo C22 · matrícula seguinte com o valor novo C22 | - |
| chaves do plano (6) | C9, table-driven over all 6 | - |
| ordem da lista de planos (4) | caixa C12 · acento C12 · empate por `id` C12 · ativos e inativos juntos C12 | - |
| chaves da matrícula (8) | C25, table-driven over all 8 | - |
| chaves de `plan` dentro da matrícula (3) | `id` C25 · `name` C25 · `period` C25 | - |
| tabela do vencimento no próprio nível (17) | C7, table-driven over all 17 | - |
| vencimento pela API, as quatro periodicidades (4) | `monthly` C26 · `quarterly` C26 · `semiannual` C26 · `annual` C26 | - |
| mês de destino sem o dia (3) | `2026-01-31` mensal C27 · `2028-01-31` mensal C27 · `2028-02-29` anual C27 | - |
| vencimento igual ao do Postgres (17) | C27, table-driven over all 17 | - |
| quem usa a conta do vencimento (2) | a API C26 · a prévia do diálogo C87 | - |
| valores de `status` da matrícula (4) | `scheduled` C8, C28 · `active` C8, C28 · `expired` C8, C28 · `cancelled` C8, C28 | - |
| situação nas bordas do período (4 edges) | véspera do início C8 · dia do início C8 · dia do vencimento C8 · dia seguinte ao vencimento C8 | - |
| virada do dia em `America/Sao_Paulo` na situação (4 edges) | `02:59:59Z` do início C8, C28 · `03:00:00Z` do início C8, C28 · `02:59:59Z` depois do vencimento C8, C28 · `03:00:00Z` depois do vencimento C8, C28 | - |
| `planId` inválido (5) | ausente C29 · `abc` C29 · `123` C29 · `null` C29 · `uuid` de plano nenhum C29 | - |
| `startsAt` (12 edges) | ausente C30 · `null` C30 · data que não existe C30 · mês 13 C30 · formato curto C30 · formato com barras C30 · hoje mais 365 C30 · hoje mais 366 C30 · vencimento hoje C30 · vencimento ontem C30 · `02:59:59Z` da virada C30 · `03:00:00Z` da virada C30 | - |
| início no passado (2) | vencimento não anterior a hoje aceito C31 · vencimento anterior recusado C30 | - |
| situação do aluno que aceita matrícula (3) | `active` C25 · `suspended` C34 · `inactive` C33 | - |
| situação do plano que aceita matrícula (2) | `active` C25 · `inactive` C32 | - |
| sobreposição pela API (7) | mesmo início no mesmo plano C35 · mesmo início em outro plano C35 · um dia em comum, o último C35 · um dia em comum, o primeiro C35 · período que contém C35 · contra uma vencida não cancelada C35 · outro aluno aceito C35 | - |
| renovação (4) | colada à anterior C41 · antecipada, agendada ao lado da ativa C42 · em outro plano C43 · depois de um intervalo C44 | - |
| cancelar por situação (4) | `scheduled` C45 · `active` C45 · `expired` C45 · já cancelada C46 | - |
| o que cancelar faz (4) | `cancelled_at` do relógio do banco C45 · a linha fica C45 · nenhuma outra coluna muda C45 · as datas ficam livres C47 | - |
| leitura das matrículas (5) | canceladas inclusive C49 · ordem por `startsAt` decrescente C49 · empate por `id` decrescente C49 · mesmo corpo para três perfis C49 · lista vazia C50 | - |
| o que a leitura traz de agora e do registro (4) | `plan.name` atual C51 · `startsAt` gravado C51 · `endsAt` gravado C51 · `priceCents` gravado C51 | - |
| o que inativar o aluno mantém (3) | as linhas de matrícula C52 · a leitura delas C52 · nenhuma `student.enrollment_cancelled` C106 | - |
| pares concorrentes (7) | dois `PATCH` do plano C23 · dois `POST` de matrícula C36 · dois `DELETE` da matrícula C105 · dois `DELETE` do plano C105 · `DELETE` da matrícula com `POST` C105 · `DELETE` do plano com `POST` C105 · `DELETE` do aluno com `POST` C105 | - |
| schemas de `packages/contracts` (5) | criação de plano C6 · edição de plano C6 · criação de matrícula C6 · resposta do plano C6 · resposta da matrícula C6 | - |
| entrada hostil nas rotas novas (3) | campos de texto C104 · segmentos de `:id` e de `:enrollmentId` C104 · corpos que não são objeto C104 | - |
| códigos novos de erro (3) | `enrollment_overlap` C101 · `plan_inactive` C101 · `student_inactive` C101 | - |
| corpos reais contra o contrato (8) | `201` do plano C101 · `200` do `PATCH` C101 · `200` da lista de planos vazia C101 · `200` da lista de planos com itens C101 · `201` da matrícula C101 · `200` das matrículas vazia C101 · `200` das matrículas com itens C101 · erros contra o schema de erro C101 | - |
| rotas de aluno que não mudam (3) | chaves de `GET /api/students/:id` C106 · chaves do item de `GET /api/students` C106 · `DELETE /api/students/:id` grava só a sua linha C106 | - |
| `Assumptions` que viram comportamento (20) | quem cadastra planos C9, C13 · quem matricula C25, C39 · quem lê C12, C49 · periodicidade C2, C9 · valor de `0` a `9999999` C10 · regras em texto livre C10, C16 · vencimento C7, C26 · status C8, C28 · renovação C41, C43, C88 · início no passado e no futuro C30, C31 · intervalo C44 · aluno inativo e suspenso C33, C34 · inativar o aluno C52 · plano inativo C18, C32 · reajuste C22 · nome repetido C11 · cancelar C45 · consentimento C25 · leitura na trilha C53 · formato do valor C70 | - |
| perfis e o menu (4) | `admin` C66 · `hr_finance` C66 · `reception` C66 · `instructor` C66 | - |
| URLs de tela sem sessão (3) | `/plans` C67 · `/plans/new` C67 · `/plans/<id>/edit` C67 | - |
| casos de tela negados (5) | `instructor` em `/plans` C68 · `instructor` em `/plans/new` C68 · `instructor` em `/plans/<id>/edit` C68 · `reception` em `/plans/new` C68 · `reception` em `/plans/<id>/edit` C68 | - |
| colunas de `/plans` (5) | "Nome" C69 · "Periodicidade" C69 · "Valor" C69 · "Regras de acesso" C69 · "Situação" C69 | - |
| periodicidade por extenso (4) | "Mensal" C70 · "Trimestral" C70 · "Semestral" C70 · "Anual" C70 | - |
| valor em reais (4) | `9990` C70 · `0` C70 · `123456` C70 · `9999999` C70 | - |
| situação do plano e regra nula na tela (3) | "Ativo" C70 · "Inativo" C70 · "—" C70 | - |
| controles de escrita em `/plans` por perfil (3) | `admin` C71 · `hr_finance` C71 · `reception` C71 | - |
| estados de `/plans` em `Observable` (4) | vazio C72 · erro C73 · sem permissão C67, C68, C71 · densidade e ordem C69 | - |
| estados dos formulários de plano em `Observable` (4) | carregando C109 · erro C76, C80 · sem permissão C67, C68 · ação destrutiva confirma C79 | - |
| textos do formulário de plano (5) | "Nome" C74 · "Periodicidade" C74 · "Valor (R$)" C74 · "Regras de acesso" C74 · "Salvar" C74 | - |
| "Periodicidade" no formulário (2) | habilitado em `/plans/new` C74 · desabilitado em `/plans/<id>/edit` C74 | - |
| valor digitado que vira centavos (5) | `99,90` C75 · `109,90` C75 · `99` C75 · `99,9` C75 · `0,00` C75 | - |
| valor digitado recusado na tela (4) | vazio C76 · `abc` C76 · `99,999` C76 · `-5,00` C76 | - |
| para onde vai depois de salvar (2) | de `/plans/new` C77 · de `/plans/<id>/edit` C77 | - |
| botões da edição de plano (2) | "Inativar" C78 · "Reativar" C78 | - |
| diálogo de inativar (3) | abre nomeando o plano C79 · desistir não envia C79 · confirmar envia e vai à lista C79 | - |
| colunas do bloco "Matrículas" (5) | "Plano" C81 · "Início" C81 · "Vencimento" C81 · "Valor" C81 · "Situação" C81 | - |
| situação da matrícula por extenso (4) | "Agendada" C81 · "Ativa" C81 · "Vencida" C81 · "Cancelada" C81 | - |
| estados do bloco em `Observable` (5) | vazio C82, C89 · erro C83, C90, C92, C93 · sem permissão C84, C85 · densidade e ordem C81 · ação destrutiva confirma C94 | - |
| botões do bloco por estado (8) | sem matrícula "Matricular" C85 · só vencida "Matricular" C85 · só cancelada "Matricular" C85 · ativa "Renovar" C85 · agendada "Renovar" C85 · "Cancelar" na linha não cancelada C85 · nenhum na linha cancelada C85 · `reception` sem botão C85 | - |
| aluno inativo no bloco (2) | sem matrícula C86 · com matrícula ativa C86 | - |
| o que o diálogo de matrícula mostra (5) | só planos ativos C87 · opção com nome, periodicidade e valor C87 · campo "Início" C87 · "Vencimento" recalculado C87 · requisição só depois de "Confirmar" C87 | - |
| prévia do vencimento no diálogo (3) | mensal de `2026-10-07` C87 · anual de `2026-10-07` C87 · mensal de `2026-01-31` C87 | - |
| preenchimento do diálogo (5) | "Matricular" antes da virada C88 · "Matricular" depois da virada C88 · "Renovar" com o dia seguinte ao maior vencimento C88 · "Renovar" com o plano daquela matrícula C88 · plano inativo fora das opções C88 | - |
| diálogo sem plano ativo (2) | nenhum plano C89 · só inativos C89 | - |
| depois de confirmar a matrícula (2) | o diálogo fecha C91 · o bloco exibe a linha nova C91 | - |
| mensagens do `409` no diálogo (3) | `enrollment_overlap` C92 · `plan_inactive` C92 · `student_inactive` C92 | - |
| diálogo de cancelar (3) | abre nomeando aluno, plano e período C94 · desistir não envia C94 · confirmar envia e a linha vira "Cancelada" C94 | - |
| o que a ficha pede à API por perfil (4) | `admin` C110 · `hr_finance` C110 · `reception` C110 · `instructor` C84 | - |
| escritas que as telas enviam (8) | `POST` do plano sem `rules` vazio C107 · `PATCH` só do que mudou C107 · `PATCH` com `rules` nulo C107 · `PATCH` nunca com `period` C107 · `PATCH` de `status` igual a `active` C108 · `DELETE` do plano C79 · `POST` da matrícula com `planId` e `startsAt` C87 · `DELETE` da matrícula C94 | - |
| ações novas por extenso em `/audit` (5) | "Plano criado" C95 · "Plano editado" C95 · "Plano inativado" C95 · "Matrícula registrada" C95 · "Matrícula cancelada" C95 | - |
| filtro "Ação" (36) | C95, table-driven over all 36: os trinta e um de antes e os cinco novos, posições 32 a 36 | - |
| "Alvo" das linhas novas (2) | plano com "Ver plano" C96 · matrícula com "Ver aluno" C99 | - |
| detalhes novos em `/audit` (7) | criação de plano, quatro valores C98 · valor de plano de e para C97 · `rules` só pelo nome C97 · inativação de plano C111 · registro de matrícula C99 · cancelamento de matrícula C111 · `planId` fora da lista C111 | - |
| startup config: migração `0008` aplicada (3 assemblies) | banco migrado em `packages/database` C1 · harness de `apps/api` C9 · stack do compose C112 | - |
| startup config: `btree_gist` criada por quem migra (2 assemblies) | Postgres do `testcontainers` C4 · Postgres do `compose.yaml` C112 | - |
| startup config: rotas novas pela origem do web (2 assemblies) | build de produção do web contra a `FakeApi` C69 · container `web` da stack C112 | - |

- Claims naming a status code, route or response shape: C9 a C36, C38 a C65 e C100 a C106 cruzam a
  fronteira HTTP da API montada pelo `startStack`; C66 a C99 e C107 a C111 cruzam a fronteira do web no
  navegador, sobre o build de produção; C112 cruza as duas no processo real da stack. C1 a C4 e C37 provam
  o banco migrado no próprio nível; C5 e C6 o vocabulário e os schemas; C7 e C8 as duas contas no próprio
  nível, sem banco e sem HTTP, e a fronteira delas é a C26 a C28 (API) e a C87 (tela)
- Linhas de `Impact` e onde cada uma é provada: `plan` e `enrollment` como um período por linha C1 a C4 e
  C41; `enrollment` do 2FA intocado: `apps/api/test/enrollment.test.ts` segue com os três testes que tem
  e a C102 só acrescenta rotas à lista; a situação que não é coluna C3, C8 e C28; `enrollments.status` não
  criado e `price_cents` C1 a C3; os três `409` C101; `AUDIT_ACTIONS`, `ACTION_LABELS`, `FIELD_LABELS` e
  `valueLabel` C5, C95, C97 a C99 e C111; os seis pontos de `audit.spec.ts` (lista abaixo); `DELETE
  /api/students/:id` que só mexe em `students` C52 e C106; menu C66; a ficha com uma ou duas chamadas a
  mais C110 e nenhuma para o Instrutor C84; `/audit` que resolve `plan` e nomeia `planId` C96, C99 e
  C111; dinheiro na tela C70 e C75; as sete rotas no OpenAPI C100 (a cobertura de 70% de `apps/api/src`
  é o portão existente de `pnpm verify`, sem check novo); ambiente sem variável nova:
  `env_example_lists_every_required_key` e `missing_var_exits_1_naming_it` seguem como estão e reprovam
  se o Build acrescentar uma; `btree_gist` criada pelo papel que migra C4 e C112; stored data: tabelas
  vazias e sem plano de fábrica C4, chaves estrangeiras sem cascata C3, situação que muda sozinha à
  meia-noite sem linha mudar C28
- `Assumptions` que não viram check, por decisão do plano: "Meta de desempenho" (não é critério) e
  "Pendências sem dono do Handoff" (nenhuma entra aqui). As outras vinte estão na linha acima
- **Testes existentes que o Build edita** porque o claim deles muda pelo `Impact` do plano; o nome fica, o
  conteúdo ganha o que o plano acrescenta e nenhuma asserção é afrouxada: em `contracts.test.ts`, o
  `toHaveLength(31)` das linhas 236, 277, 493, 513 e 537 passa a 36
  (`audit_actions_end_with_three_student_actions_in_order`,
  `audit_actions_end_with_eleven_staff_actions_in_order`,
  `audit_actions_end_with_three_consent_actions_in_order`,
  `audit_actions_end_with_two_photo_actions_in_order` e
  `audit_actions_end_with_replace_and_purge_in_order`), e o de funcionário, que hoje compara a lista
  inteira com as trinta e uma, passa a comparar as trinta e uma primeiras (`slice(0, 31)`), como os
  outros quatro já fazem com as suas; em `audit-auth.test.ts`, `ten_actions_written_equal_contract_vocabulary`
  (linha 343: de trinta e uma para trinta e seis; o percurso ganha as cinco ações novas; o filtro de
  `entity` da linha 347 aceita `plan`); em `audit.spec.ts`, `ten_actions_shown_by_label` (linha 137),
  `student_actions_labelled_and_filter_has_thirteen` (230),
  `consent_actions_labelled_and_filter_has_sixteen` (482),
  `photo_actions_labelled_and_filter_has_eighteen` (543),
  `replace_and_purge_actions_labelled_and_filter_has_twenty` (566) e
  `staff_actions_labelled_filter_has_thirty_one_and_authorless_row_dashes` (635), as seis contagens de
  trinta e uma para trinta e seis e a lista `LABELS` com os cinco rótulos novos no fim; `serve`, do
  mesmo arquivo, passa a responder `GET /api/plans`, que a página agora pede; em `openapi.test.ts`,
  `request_bodies_come_from_contract_schemas` ganha os três corpos novos e
  `paths_equal_registered_api_routes` lê o roteador e passa a cobrir as sete rotas; em
  `enrollment.test.ts`, `admin_without_2fa_gets_403_everywhere_else` ganha as sete rotas na lista (C102);
  `hostile_input_never_answers_5xx` ganha as rotas novas (C104); em `shell.spec.ts` os quatro testes de
  link seguem como estão, e o link novo é provado à parte (C66)
- **Testes de outra feature cujo claim muda e que o Build edita, com a mudança escrita aqui para não ser
  uma surpresa**: (1) `staff_actions_labelled_filter_has_thirty_one_and_authorless_row_dashes` (C99 da
  `funcionarios`: "o filtro oferece as trinta e uma ações, as onze novas nas posições 21 a 31") passa a
  afirmar trinta e seis opções com as onze de funcionário nas posições 21 a 31: os dois `slice(20)` das
  linhas 637 e 638, que liam "da 21 até o fim", passam a `slice(20, 31)`. O plano contava cinco pontos
  nesse arquivo; são seis, e a linha de `Impact` foi corrigida; (2) em
  `packages/database/test/staff.test.ts`, `migration_0007_adds_staff_and_staff_id_and_keeps_existing_photo_rows`
  (C4 da `funcionarios`) roda o segundo `migrate` até a última migração e compara o conjunto de tabelas
  com "o de antes mais `staff`": passa a migrar só até a `0007`, como o `migration_0006_...` de
  `photos.test.ts` já faz desde a `funcionarios`, e nenhuma asserção muda; (3) em
  `packages/database/test/photos.test.ts`, `migration_0005_adds_only_photos_without_tenant_or_owner_columns`
  compara o conjunto de tabelas do banco inteiro migrado: a lista esperada ganha `enrollments` e
  `plans`, e a asserção sobre as colunas de `photos` fica como está
- **Provas existentes que seguem como estão e passam a valer também aqui**: `second_run_changes_nothing`
  de `migrate.test.ts` (a segunda execução não muda tabela, coluna nem extensão: cobre a `0008` e o
  `CREATE EXTENSION IF NOT EXISTS`); `six_identity_tables_and_no_tenant_id` de `schema.test.ts` (nenhuma
  coluna `tenant_id` no banco inteiro); `only_four_routes_answer_without_session` (segue com quatro
  rotas; a C14 e a C40 provam o `401` das sete); `guard_matrix_three_declarations_five_callers` (AD-022)
- Suítes de tela que abrem `/students/<id>` sem conhecer as rotas novas (`students.spec.ts`,
  `consents.spec.ts`, `photos.spec.ts`, `photo-editor.spec.ts` e `photo-camera.spec.ts`): a `FakeApi`
  responde `404` ao que não conhece, então nelas o bloco "Matrículas" aparece no estado de erro da C83.
  Nenhuma asserção delas fala do bloco; se alguma reprovar, o conserto é a `FakeApi` daquele teste
  responder às duas rotas, nunca mudar a asserção
- A C18 e a C22 precisam de matrículas antes de as rotas de matrícula existirem: a C18 as insere por SQL,
  e a prova da C22 mora em `student-enrollments-write.test.ts` e fecha com a S3 (ver o `Handoff`)
- Além do texto das AC, derivado do `Impact`, das `Assumptions`, das doors ou da prática do repositório, e
  que o Build pode discutir antes de fechar: a tabela de dezessete vencimentos e a comparação com o
  Postgres (C7, C27, a door 4 diz "a mesma conta"); o `UPDATE` que desfaz um cancelamento ou move um
  período para cima de outro, recusado pelo banco (C37); a sobreposição contra uma matrícula vencida
  (C35); o `endsAt` igual a hoje aceito e a virada do dia no `startsAt` (C30); as três situações em que
  se cancela (C45); o `diff` de `plan.updated` com o `from` e o `to` de `name` (C56, a door 6 o declara
  registrável); os seis casos sem mudança (C58); as corridas de dois cancelamentos, de duas inativações
  e de uma escrita contra outra (C105); a entrada hostil nas rotas novas (C104); as chaves de aluno que
  não mudam (C106); `99`, `99,9` e `0,00` aceitos e os quatro valores recusados no campo de valor (C75,
  C76); o corpo do `PATCH` da tela sem `period` e só com o que mudou (C107); "Reativar" sem diálogo
  (C108); os botões desabilitados enquanto a API não responde (C109); as chamadas da ficha por perfil
  (C110); o texto do cancelamento em `/audit` e o `planId` desconhecido (C111)
- Decisões que o plano deixa de fora de AC e que nenhum check afirma: se o `name` e o `rules` são
  gravados aparados (a AC 2 só diz que o vazio depois de aparado é recusado); `rules` igual a `null` no
  `POST` (a `Surface` só diz "opcional"); a ordem de `fields` quando o `PATCH` muda dois campos
  registráveis e quando a criação traz `rules`; o que "Reativar" faz depois do `200` (a AC 71 só manda
  navegar ao inativar); o ponto ou o separador de milhar no campo "Valor (R$)" (`99.90`, `1.234,56`) e o
  valor acima de `99.999,99`, que a API recusa com `422`; o que `/audit` mostra quando `GET /api/plans`
  falha (hoje a página inteira cai no estado de erro quando `GET /api/users` falha); qual plano vem
  escolhido em "Renovar" quando o da matrícula anterior está inativo (a C88 só afirma que não é ele); o
  texto exato do diálogo de cancelar além dos quatro valores que a C94 procura; a mensagem do `422` de
  `startsAt` (a C93 afirma que a tela repete a da API, qualquer que seja); paginação e filtro, fora de
  escopo no plano
- Perguntas respondidas no padrão recomendado (nenhum check muda): a 1, só `admin` e `hr_finance`
  matriculam (C25, C39, C85); a 2, regras em texto livre (C1, C10, C16); a 3, matricular não consulta
  `consents` (C25). A 4 (quem cadastra os planos reais) segue aberta e só trava o go-live: a C4 prova
  que nenhuma migração traz plano e a C89 o que a tela diz enquanto não houver um
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md`, `auditoria`, `alunos`, `consentimento` e `funcionarios`
seguem valendo e respondem as duas perguntas para o que esta feature reaproveita (a rota que decide,
alcançada por HTTP, com o corte por perfil e a linha de auditoria; a restrição do banco; o gravador da
trilha; a tela contra a `FakeApi`; a stack lida por `psql`). Respondem mal três casos que lá não existiam,
e os três ganham linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Conta pura de `packages/contracts` usada pela API e pela tela (o vencimento e a situação da matrícula) | uma no próprio nível, sem banco e sem HTTP, **e** uma na fronteira HTTP, **e** uma no navegador onde a tela a usa | no próprio nível, uma linha asserida por linha da tabela (17 vencimentos, 13 situações), com o valor esperado escrito à mão; na fronteira, os valores das AC e a igualdade com o que o Postgres calcula; no navegador, três prévias. A prova de fronteira não substitui a tabela: ela passa por um caminho dela |
| Valor que depende do dia e é calculado na leitura (a situação; o limite de `startsAt`; o início sugerido) | uma prova com o relógio controlado pelo teste, nunca o da máquina, dos dois lados da virada do dia em `America/Sao_Paulo` | os dois instantes de cada virada (`02:59:59Z` e `03:00:00Z`); e, para a situação, a linha lida por SQL idêntica entre as leituras, que é o que distingue "calculado" de "atualizado por alguém" |
| Restrição do banco que decide entre duas linhas por intervalo (a exclusão `enrollments_no_overlap`) | uma por SQL no próprio banco, sem rota, **e** uma na fronteira HTTP para a tradução em `409` e para a corrida | por SQL, um caso por relação entre os dois períodos (igual, um dia em comum de cada lado, contido, contém, colado de cada lado, outro aluno, cancelado) e os dois `UPDATE`; na fronteira, os seis casos da C35 e a corrida da C36. A prova por SQL é a que vale para quem não passa pela rota (`pagamentos`, `privacidade`, SQL de suporte) |

Evidence (o código da feature ainda não existe; a contagem vem do plano e do código que ele altera):

- planos: 21 recusas de validação e 4 bordas aceitas, 14 recusas no `PATCH`, 6 valores de `status`, 6
  casos sem mudança, 1 corrida por campos, 11 casos negados (C9 a C24, C58) -> decide
- matrícula: 5 `planId` inválidos, 12 bordas de `startsAt`, 3 códigos de `409`, 7 relações de
  sobreposição, 4 formas de renovar, 4 situações ao cancelar, 10 casos negados, 6 corridas (C25 a C48,
  C105) -> decide
- vencimento: 4 periodicidades por 17 inícios com 3 regras de fim de mês; situação: 4 valores, 4 bordas,
  2 viradas (C7, C8) -> decide, numa função sem dependência; é a primeira conta de data do repositório
  que não é só "hoje ou antes"
- banco: 2 tabelas, 4 `CHECK`, 2 chaves estrangeiras sem cascata, 1 restrição de exclusão com 11 relações,
  1 extensão nova (C1 a C4, C37) -> decide
- auditoria: 5 ações, 27 desfechos que não gravam, 5 rotas que desfazem, 9 campos entre registráveis e
  só nomeados (C54 a C65) -> decide
- telas: 3 URLs novas e 1 bloco, 5 e 5 colunas, 5 estados de botão, 5 preenchimentos do diálogo, 3
  mensagens de `409`, 9 valores digitados, 8 escritas (C66 a C99, C107 a C111) -> decide, na tela; a
  conversão de reais para centavos e de volta é a primeira do repositório
- o controller de planos e o de matrículas (novos): cada rota valida o corpo pelo schema e chama o
  serviço -> instrumentação além do `404` por `:id`, que a C24, a C38 e a C48 provam
- closest analogue in the repo: `packages/contracts/test/staff.test.ts`
  (`hired_at_ten_cases_around_today_in_sao_paulo`, a regra de data provada no próprio nível) ao lado de
  `apps/api/test/staff-create.test.ts` (`create_hired_at_ten_cases_around_today_in_sao_paulo`, a mesma
  regra na fronteira, com o relógio do teste); `packages/database/test/consent.test.ts`
  (`consents_one_active_per_student_and_purpose`, o banco decidindo entre duas linhas) ao lado de
  `apps/api/test/consents-write.test.ts` (`ten_concurrent_grants_one_201_one_409` e
  `revoke_204_keeps_row_and_sets_revoked_at`, a rota aninhada no aluno, com a linha do aluno travada e o
  instante do banco); `apps/api/test/staff-audit.test.ts` (a trilha das escritas);
  `apps/web/e2e/staff.spec.ts` (lista e formulário) e `apps/web/e2e/consents.spec.ts` (o bloco da ficha
  com diálogo); e `tests/stack/compose.test.ts`
  (`staff_registered_through_web_pages_audited_photo_replaced_and_expired_version_purged`)

Cost: 2 provas no próprio nível em 1 arquivo novo de `packages/contracts`, 1 arquivo novo de banco com 6
testes, 4 arquivos novos de API mais o apoio `support/plans.ts`, 2 de tela mais o apoio do web, uma
subida de Postgres por arquivo de API novo, e a `FakeApi` com 7 rotas a mais. Sem a primeira linha, a
tabela de fim de mês seria provada só pelos três exemplos da AC 19; sem a segunda, a situação seria
provada no dia em que o teste rodou; sem a terceira, a door 5 seria provada só pelo caminho que trava a
linha do aluno, que é justamente o que ela existe para não exigir. As linhas ficam neste arquivo, como
nas features anteriores, e não vão para um guia do repositório.

## Swept

- validation: C6, C10, C17, C21, C29, C30, C76
- failure modes: C63, C73, C83, C90, C92, C93
- idempotency: C19 (inativar um plano já inativo), C46 (cancelar uma matrícula já cancelada), C58 (editar sem mudar), C105 (dois cancelamentos e duas inativações ao mesmo tempo gravam uma linha só); repetir o mesmo `POST` de matrícula não cria a segunda, pela door 5 (C35, C36); repetir o `POST` de plano cria outro plano, e é a decisão da AC 3 (C11)
- authorization: C13, C14, C39, C40, C68, C84, C85, C102, C103; existing - a guarda global (AD-022) e a checagem de origem (AD-020), pelas provas `guard_matrix_three_declarations_five_callers` e `only_four_routes_answer_without_session`
- concurrency: C23, C36, C105; a door 5 decide no banco também para quem não passa pela rota (C37)
- data lifecycle: C3, C18, C45, C52 - o plano e a matrícula nunca são apagados por rota, inativar e cancelar mantêm a linha, e as chaves estrangeiras sem cascata seguram o aluno e o plano; a matrícula vence sem que linha nenhuma mude (C28); exportação, anonimização e exclusão definitiva são da `privacidade`
- dependency failure: C63 (auditoria que falha nas escritas), C73, C83 e C90 (a API que não responde à tela); existing - banco fora na consulta cai no `500 internal_error` do `ProblemFilter`, pela prova `unhandled_500_hides_exception` da `fundacao`
- state transitions: C8, C18, C20, C21, C28, C42, C45, C46 - `active` e `inactive` do plano, e `scheduled`, `active`, `expired` e `cancelled` da matrícula, das quais só `cancelled` é gravada e não volta (C37 recusa desfazê-la sobre outro período)
- observability: C54 a C65, C95 a C99, C111, C112 - a trilha de plano e de matrícula é o que esta feature torna observável; C65 mantém nome, CPF e o texto das regras fora dela; leitura não grava (C53)

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado (KB de código e teste, dividido por quatro); o que já existe foi medido com `wc -c`. Código novo: S0 = 8k (a migração `0008`, o schema do Drizzle, `contracts/src` de plano e matrícula com as duas contas, `plans.test.ts` do banco e o de `packages/contracts`, e os rótulos e contagens que entram com o vocabulário), S1 = 6k (o módulo de planos, `support/plans.ts` e a parte de criar e listar de `plans.test.ts`), S2 = 3k, S3 = 9k (o módulo de matrículas e `student-enrollments-write.test.ts`), S4 = 1k, S5 = 2k, S6 = 2k, S7 = 6k (`plans-audit.test.ts`), S8 = 11k (as três páginas, o formulário, o formatador de moeda, `plans.spec.ts` e o apoio da `FakeApi`), S9 = 10k (o bloco, o diálogo e `student-enrollments.spec.ts`), S10 = 2k, S11 = 9k (5k de API em C100 a C106, 2k de tela em C107 a C111 e 2k de stack na C112): 69k. Arquivos existentes que a feature edita ou lê como molde (64 arquivos, 492 KB: `apps/api/src` 60 KB em 12, `packages` 31 KB em 9, testes de API, de banco e de contrato 220 KB em 20, `apps/web/src` 47 KB em 15, testes de tela e stack 134 KB em 8; os maiores: `contracts.test.ts` 40 KB, `compose.test.ts` 37 KB, `staff.spec.ts` 31 KB, `audit.spec.ts` 26 KB, `staff-audit.test.ts` 21 KB, `staff.test.ts` do banco 17 KB, `consents-write.test.ts` 17 KB): 492 KB ÷ 4 = 123k. `plan.md` (56 KB, 14k) e este arquivo (103 KB, 26k): 40k. Total 69k + 123k + 40k = 232k, acima do orçamento de 150k
- Corte proposto, nos limites em que a superfície muda (o plano, depois a matrícula, depois as telas), sem dividir slice: batch A = S0 a S2 (C1 a C24: banco, vocabulário, contrato, as duas contas e as quatro rotas de plano): código novo 8k + 6k + 3k = 17k, arquivos existentes 58k (232 KB em 30: `access.ts`, `routes.ts`, `app.module.ts`, `db-errors.ts`, `validation.ts`, `audit/audit.ts` e o módulo `staff` como molde, 32 KB; `packages/contracts/src` de `audit`, `person`, `staff`, `index` e `problem`, `schema.ts` e as migrações `0004` e `0007`, 28 KB; `contracts.test.ts`, `audit-auth.test.ts`, `staff-create`, `staff-update`, `staff-access`, quatro apoios, `staff.test.ts` e `photos.test.ts` do banco e `staff.test.ts` de `packages/contracts`, 140 KB; `apps/web/src/lib/audit.ts` e `audit.spec.ts`, 32 KB, que entram aqui pelos cinco rótulos e pelas seis contagens), documentos 40k = 115k; batch B = S3 a S7 e C100 a C106 (C25 a C65 e as provas de contrato, montagem, concorrência e regressão do aluno): código novo 9k + 1k + 2k + 2k + 6k + 5k = 25k, arquivos existentes 44k (177 KB em 19: `consents.service.ts` e `consents.controller.ts` como molde da rota aninhada e da trava do aluno, `students.service.ts`, `openapi.controller.ts`, `contracts/src/consents.ts`, `consents-write`, `consents-read`, `staff-audit`, `students-update`, `openapi.test.ts`, `enrollment.test.ts`, `hostile-input.test.ts` e, relidos, `contracts.test.ts`, `audit-auth.test.ts`, `app.module.ts`, `db-errors.ts` e dois apoios), documentos 40k = 109k; batch C = S8 a S10 e C107 a C112 (C66 a C99, o que as telas enviam e a stack): código novo 11k + 10k + 2k + 4k = 27k, arquivos existentes 45k (181 KB em 23: `apps/web/src` de `lib`, `shell.tsx`, `audit/page.tsx`, as páginas de `staff` como molde e a ficha do aluno com `consents-block.tsx`, 47 KB; `audit.spec.ts`, `shell.spec.ts`, `staff.spec.ts`, `consents.spec.ts`, `fake-api.ts` e `support/staff.ts`, 92 KB; `compose.test.ts` e o apoio da stack, 41 KB), documentos 40k = 112k. Soma: 17k + 25k + 27k = 69k de código novo; 58k + 44k + 45k = 147k de existentes, 24k a mais que os 123k acima porque `contracts.test.ts`, `audit-auth.test.ts`, `app.module.ts`, `db-errors.ts`, dois apoios, `lib/audit.ts` e `audit.spec.ts` são relidos em dois batches (99 KB); 3 × 40k de documentos. Nenhuma slice sozinha passa de 11k, então nenhuma foi cortada demais
- Por que três e não dois: A com B dá 42k de código novo + 85k de existentes (58k + 44k menos os 17k relidos) + 40k = 167k, e B com C dá 52k + 89k + 40k = 181k; os dois passam de 150k. Na `foto-captura` um batch estimado em 94k passou dos 150k, porque a parcela que cresce é a leitura dos testes que servem de molde e a saída das execuções, não o código novo: os três batches ficam entre 109k e 115k para deixar essa folga
- Ordem: S0 primeiro (as duas tabelas, a exclusão, o vocabulário, o contrato e as duas contas, de que todo o resto depende). No mesmo commit da migração `0008` entram as duas edições de teste do banco (`migration_0007_adds_staff_and_staff_id_and_keeps_existing_photo_rows` passa a migrar só até a `0007`, e a lista de tabelas de `migration_0005_adds_only_photos_without_tenant_or_owner_columns` ganha `enrollments` e `plans`), ou os dois arquivos reprovam; no mesmo commit de `AUDIT_ACTIONS` entram os cinco rótulos de `ACTION_LABELS` (`apps/web/src/lib/audit.ts`), as contagens de trinta e uma para trinta e seis nos cinco pontos de `contracts.test.ts`, em `audit-auth.test.ts` (só o `toHaveLength`) e nos seis pontos de `audit.spec.ts`, com `LABELS` e os dois `slice(20, 31)`, ou o typecheck do web e doze testes reprovam. Cada commit que cria uma rota entra também nas listas que enumeram as rotas (`request_bodies_come_from_contract_schemas` e `admin_without_2fa_gets_403_everywhere_else`), ou `pnpm verify` reprova; C100 e C102 só fecham quando as sete estão de pé. Depois S1, S2, S3, S4, S5, S6, S7, C100 a C106, S8, S9, S10, C107 a C112
- O que fecha fora do seu batch: a segunda prova da **C5** (`ten_actions_written_equal_contract_vocabulary`) só percorre as cinco ações quando as rotas de matrícula existem: no batch A ela fica com uma catraca das ações ainda sem rota, que só encolhe, como a `STAFF_ACTIONS_NOT_ROUTED_YET` da `funcionarios`, e o batch B a esvazia; a **C22** é da S2 e a prova dela mora em `student-enrollments-write.test.ts`, porque precisa matricular e ler pela API: fecha no batch B; a **C18** insere as duas matrículas por SQL no batch A e não espera rota
- Conferir antes de cada trecho: antes da S1, que `to_jsonb(plans)` e `to_jsonb(enrollments)` servem às provas de linha idêntica; antes da S3, que a trava da linha do aluno é a de `consents.service.ts` (linha 66) e que a tradução de `23P01` em `409` não depende de uma conferência prévia (a C37 prova o banco sozinho, e a C36 a corrida); antes da S6, que mover o relógio do teste em semanas não derruba a sessão (cada leitura abre a sua); antes da S8, que não existe `GET /api/plans/:id` na `Surface`: a edição acha o plano na lista (C80), e os `<Link>` novos nascem com `prefetch={false}` como os de `/staff`; antes da S9, quais das cinco suítes que abrem a ficha passam a ver o bloco em estado de erro (ver a nota da `Coverage`), e que `serve` de `audit.spec.ts` responde `GET /api/plans`
- Mechanism: handoff - escolhido pelo usuário em 2026-10-08, antes da primeira linha de código: batches A, B e C em sequência e só na verde, cada um em sessão nova que lê este arquivo e o diff do que já entrou; o Verifier só roda depois do batch C. A alternativa recusada era `one builder` (uma sessão só, aceitando compactação e perda de contexto a partir de cerca de 150k)
- Boundary (batch A, S0 a S2, `pnpm verify` verde em `03246e5`: 21 tarefas, 452 testes de API, 51 de banco, 8 de contrato, 10 de repositório, 155 de tela, cobertura de `apps/api/src` em 94,56% de linhas; as 24 Proofs de C1 a C21, C23 e C24 rodadas uma a uma pelo comando do check, cada uma com exatamente um teste passando): fechados por inteiro **C1 a C4, C6 a C21, C23 e C24**. Fechado em parte: **C5** - a primeira prova (`audit_actions_end_with_five_plan_and_enrollment_actions_in_order`) está fechada; a segunda (`ten_actions_written_equal_contract_vocabulary`) percorre as três ações de plano, afirma `entity` igual a `plan` nelas e guarda a catraca `PLAN_ACTIONS_NOT_ROUTED_YET` com `student.enrollment_created` e `student.enrollment_cancelled`, que o batch B esvazia ao percorrer as duas rotas de matrícula, acrescentando a afirmação de `entity` igual a `student` nas duas. Aberto: **C22** (prova em `student-enrollments-write.test.ts`, batch B). Commits, sobre a base `936d1b1`: `0f89f71` (docs), `f07099e` (migração `0008`, C1 a C4), `8a995cc` (contrato, as duas contas e o vocabulário, C5 a C8), `e45caab` (`POST` e `GET /api/plans`, C9 a C12), `03246e5` (`PATCH` e `DELETE /api/plans/:id`, C13 a C21, C23, C24). O que o batch B encontra pronto e deve reusar: em `packages/contracts/src/plans.ts`, `createEnrollmentRequestSchema`, `enrollmentSchema`, `enrollmentsResponseSchema`, `enrollmentEndsAt(startsAt, period)`, `enrollmentStatus(enrollment, on)` (aceita o dia `aaaa-mm-dd` ou um `Date`), `addDays` e `PERIOD_MONTHS`; em `packages/database/src/schema.ts`, `plans` e `enrollments`; em `apps/api/test/support/plans.ts`, `planBody`, `createPlan`, `insertPlan`, `insertEnrollment`, `planSnapshot` (o "nada gravado": linhas de `plans` e de `enrollments` mais a contagem de `audit_logs`), `planRowText` e `enrollmentRowsTextOfPlan`. Listas que cada rota nova tem de entrar no commit que a cria: `request_bodies_come_from_contract_schemas` de `openapi.test.ts` (hoje com 17 corpos) e `admin_without_2fa_gets_403_everywhere_else` de `enrollment.test.ts` (hoje com as quatro de plano)
- Settled mid-build (batch A): nada foi decidido pelo usuário durante este batch. Decisões do Build, sem check e reversíveis: (1) `name` e `rules` são gravados aparados (`.trim()` no schema, como o `nameSchema` de pessoa); (2) `rules` igual a `null` no `POST` é recusado com `422`: no cadastro o campo é omitido ou é texto, e só o `PATCH` aceita `null` para limpar; (3) a ordem de `fields` na trilha é a de `TRACKED` em `plans.service.ts`: `name`, `period`, `priceCents`, `rules`, `status` (a criação com `rules` grava `["name","period","priceCents","rules","status"]`); (4) o `PATCH` recusa `period` por `z.never().optional()` em `updatePlanRequestSchema`, que sai no OpenAPI como `not: {}`; (5) colunas além das que as doors fixam: `created_at` e `updated_at` em `plans`; nomes dos `CHECK`: `plans_period_valid`, `plans_status_valid`, `plans_price_cents_not_negative`, `enrollments_ends_at_not_before_starts_at`, `enrollments_price_cents_not_negative`; índice de leitura `enrollments_student_id_starts_at_idx` (btree em `student_id`, `starts_at`); (6) `createEnrollmentRequestSchema` já recusa `startsAt` posterior a hoje mais 365 dias em `America/Sao_Paulo`, com a mensagem "Escolha um início dentro de 365 dias."; a recusa do vencimento anterior a hoje depende do plano e fica para o serviço de matrículas (batch B); (7) `PlansService.update` e `inactivate` travam a linha do plano com `FOR UPDATE`: o `POST` de matrícula do batch B precisa ler o plano de um jeito que conviva com essa trava para a corrida da C105; (8) a `0008` foi gerada pelo `drizzle-kit` a partir do `schema.ts` e ganhou à mão o `CREATE EXTENSION` e a restrição de exclusão, que o Drizzle não descreve: o snapshot `0008` não a conhece, e uma migração futura gerada pelo `drizzle-kit` deve ser lida antes de aplicada para confirmar que não a remove
- Abandoned / deviations (batch A): (1) o daemon do Docker Desktop estava parado ao começar e foi iniciado pela sessão (as provas dependem de `testcontainers`); (2) os commits seguem com o trailer `Co-Authored-By` que o repositório já usa, apesar de a skill dizer para não pôr atribuição; (3) dois cabeçalhos de commit passam dos 72 caracteres que o validador recomenda (aviso, não erro): `0f89f71` com 85 e `8a995cc` com 75; (4) os checks não são marcados um a um no arquivo: como nas features anteriores, quem diz o que fechou é a linha `Boundary`; (5) além do que a C21 pede, `patch_status_other_values_422_on_status` roda os cinco valores sobre um plano ativo e sobre um inativo; (6) `list_all_statuses_ordered_by_folded_name_then_id_same_body_for_three_roles` esvazia `enrollments` e `plans` antes de semear os sete planos com `id` escolhido, para a ordem esperada poder ser escrita à mão; (7) em `plan_and_enrollment_schemas_accept_and_reject`, "o corpo a que falta o campo" é montado com a chave igual a `undefined`, que para o Zod e para o JSON é a chave ausente; a ausência de verdade pela fronteira HTTP está na C10; (8) para o Verifier: `patch_and_delete_404_for_non_uuid_and_unknown_uuid` (C24) também passaria sem as rotas, porque o Nest responde `404 not_found` a rota que não existe; quem prova que as duas rotas existem e decidem é a C13 (`403` com `uuid` de plano nenhum) e as C15 a C21. Nada foi abandonado: nenhum check foi editado, nenhuma asserção existente foi afrouxada, e as únicas edições em testes de outras features são as que a `Coverage` deste arquivo previa
- Boundary (batch B, S3 a S7 e C100 a C106, `pnpm verify` verde em `c146268`: 21 tarefas, 499 testes de API em 64 arquivos, 53 de banco, 8 de contrato, 10 de repositório, 155 de tela, cobertura de `apps/api/src` em 94,81% de linhas e 92,6% de ramos; as 51 Proofs de C5 (a segunda), C22, C25 a C65 e C100 a C106 rodadas uma a uma pelo comando do check, cada uma com exatamente um teste passando): fechados por inteiro **C5** (a catraca `PLAN_ACTIONS_NOT_ROUTED_YET` saiu de `audit-auth.test.ts`: o percurso grava as trinta e seis ações, o conjunto gravado é igual ao vocabulário inteiro, e as duas de matrícula são afirmadas com `entity` igual a `student` e o id do aluno matriculado), **C22**, **C25 a C65** e **C100 a C106**. Somado ao batch A, estão fechados C1 a C65 e C100 a C106; abertos, todos do batch C: **C66 a C99 e C107 a C112**. Commits do batch B, sobre `8ba610f`: `0f84e65` (as três rotas de matrícula, com C22, C25 a C36, C38 a C53, C105, C106 e a segunda prova da C5), `5de2889` (as duas provas da C37, no banco), `e5cad84` (`plans-audit.test.ts`, C54 a C65), `56453d4` (conserto de um `500` achado pela C104, ver Abandoned) e `c146268` (C100 a C104). O que o batch C encontra pronto e deve reusar: as sete rotas da `Surface`, de pé e com o corpo que a C101 prova contra `planSchema`, `plansResponseSchema`, `enrollmentSchema` e `enrollmentsResponseSchema`; em `packages/contracts/src/plans.ts`, além do que o batch A deixou, os tipos `Plan`, `Enrollment`, `CreatePlanRequest`, `UpdatePlanRequest` e `CreateEnrollmentRequest`, `enrollmentEndsAt` para a prévia do diálogo (C87) e `STARTS_AT_MAX_DAYS_AHEAD`; os três `code` de `409` que a tela traduz (`enrollment_overlap`, `plan_inactive`, `student_inactive`, C92); as duas mensagens de `422` em `startsAt` que a API emite e a tela repete (C93): "Escolha um início dentro de 365 dias." (do schema) e "O vencimento desse início já passou. Escolha um início mais recente." (do serviço); em `apps/api/test/support/plans.ts`, `enroll`, `listEnrollments`, `enrollmentsPath`, `clockAt` e `NOON`, se a stack ou outro teste de API precisar. Nenhuma lista de rotas de API fica pendente: `openapi.test.ts` tem 18 corpos e `enrollment.test.ts` as sete rotas novas
- Settled mid-build (batch B): nada foi decidido pelo usuário durante este batch. As duas conferências pedidas antes da S3 fecharam assim: a trava da linha do aluno é a de `consents.service.ts` (`select ... from students where id = $1 for update`, linhas 62 a 66), e o `POST` de matrícula a copia; a tradução de `23P01` em `409` não depende de conferência prévia, porque não existe nenhuma: o serviço insere e é a `enrollments_no_overlap` quem recusa (`isExclusionViolation`, novo em `db-errors.ts`), o que a C35 prova caso a caso, a C36 na corrida e a C37 no banco sozinho. Decisões do Build, sem check e reversíveis: (1) o módulo mora em `apps/api/src/student-enrollments/` (`StudentEnrollmentsController` e `StudentEnrollmentsService`), fora de `plans/` e sem arquivo chamado só `enrollment` (Impact "domain"); (2) a ordem das recusas do `POST`: `404` do aluno, `422` em `planId` (plano que não existe, mensagem "Escolha um plano válido."), `422` em `startsAt` (vencimento anterior a hoje), `409 student_inactive`, `409 plan_inactive` e, por último e vindo do banco, `409 enrollment_overlap`; (3) dentro da transação o plano é lido com `FOR SHARE`, depois da trava do aluno: convive com o `FOR UPDATE` de `PlansService.update` e `inactivate` (decisão 7 do batch A), de modo que o valor copiado e a situação conferida são os que ficaram, e na corrida da C105 o `POST` responde `201` ou `409 plan_inactive` conforme a ordem; a ordem das travas é sempre aluno e depois plano, e as rotas de plano e de aluno travam uma linha só; (4) o cancelamento não trava o aluno: lê a linha e faz `UPDATE ... WHERE cancelled_at IS NULL`, como a revogação de consentimento, e só grava a trilha se o `UPDATE` mudou a linha; (5) a situação devolvida pelo `POST` e pelo `GET` é a de `saoPauloToday()` lido uma vez por requisição; (6) o nome do plano passou a recusar com `422` um substituto UTF-16 solto (`noLoneSurrogate` em `planNameSchema`), no `POST` e no `PATCH`; `rules` não mudou; (7) nos três arquivos de teste que dependem do dia (`student-enrollments-write`, `student-enrollments-read` e `plans-audit`), o relógio é congelado em `2026-10-07T15:00:00Z` no `beforeAll` e reposto a cada teste, as quatro sessões nascem nele, e todo caso que move o relógio abre a sua (`sessionAt`); conferido antes da S6: uma sessão aberta com o relógio em qualquer instante entre `2026-01-01` e `2028-02-29` vale naquele instante, e o que vem do banco (`created_at`, `cancelled_at`, o `uuidv7`) segue o relógio real
- Abandoned / deviations (batch B): (1) **um defeito do código do batch A, achado pela C104 e consertado**: `PATCH /api/plans/:id` com `name` igual a `\ud800` alterava a linha e falhava no insert da trilha, porque o `jsonb` de `diff` recusa o escape de um substituto solto, e respondia `500`; o nome do plano é o primeiro texto livre cujo valor entra no `diff` (door 6). O conserto está no schema (`56453d4`), com um teste além das provas, `lone_surrogate_in_name_422_on_create_and_patch`; nenhum check foi editado, e a C104 é a que o pegou; (2) as duas provas da **C37** não existiam: a aritmética do batch A contava o `plans.test.ts` do banco na S0, mas a C37 é da S3, e entrou agora, em commit próprio; (3) os commits seguem com o trailer `Co-Authored-By` que o repositório já usa; (4) os checks não são marcados um a um no arquivo: quem diz o que fechou é a linha `Boundary`; (5) além do que os checks pedem: a C103 reenvia as cinco requisições da origem certa e confere `201`, `200`, `201`, `204` e `204`; a C100 confere que sob os dois prefixos só existem as sete rotas e que as quatro sem corpo não declaram nenhum; a C63 confere, depois dos cinco `500`, o valor, a situação e o `cancelled_at` das linhas que cada rota mudaria; a C27 roda os três casos da AC 19 à parte e de novo dentro das dezessete linhas; (6) o construtor injetou duas falhas de conferência própria, as duas mortas e desfeitas (empate por `id` crescente, morta pela C49; `endsAt <= hoje`, morta pela C30): não substituem as do Verifier; (7) para o Verifier: os `404` de `GET` e `POST` da C38 também passariam sem as rotas, porque o Nest responde `404 not_found` a rota que não existe: quem prova que as três existem e decidem é a C39 (`403` com `uuid` de ninguém), a C25, a C45 e a C49; na C105 um par solto junto não força o entrelaçamento, e numa execução o `POST` de um par pode sair sempre `201` ou sempre `409` (a C36 tem sempre um de cada); a C101 esvazia `enrollments` e `plans` do banco de `contracts.test.ts` no começo, para a lista vazia existir; o percurso da C5 matricula um segundo aluno, porque o primeiro é inativado antes; a C45 registra a matrícula `scheduled` com o relógio em `2026-10-06T15:00:00Z`; (8) **o portão não reexecuta o web quando só `packages/contracts` muda**: em `turbo.json` nenhuma tarefa depende da do pacote de cima, o hash de `@academia/web#build` e `#test` não mudou com `56453d4`, e os 155 testes de tela do `pnpm verify` deste batch vieram do cache; o build, o typecheck e o lint do web foram rodados à força e passaram. Não é deste batch consertar, e o batch C mexe em `apps/web`, o que reexecuta tudo; fica registrado para o usuário e para o Verifier. Nada foi abandonado: nenhum check foi editado e nenhuma asserção existente foi afrouxada; as edições em testes de outras features são as que a `Coverage` previa (`audit-auth.test.ts`, `openapi.test.ts`, `enrollment.test.ts` e `hostile-input.test.ts`)
- Boundary (batch C, S8 a S10 e C107 a C112, `pnpm verify` verde em `f21018e`: 21 tarefas, das quais executadas de fato as quatro do `web` (build, lint, typecheck e 195 testes de tela em 2,7 min: os 155 de antes e os 40 deste batch) e o lint e o typecheck de `stack-tests`; as de `api`, `database`, `contracts` e `ui` saíram do cache do Turbo, porque nada nelas mudou desde `c146268`: 499 testes de API, 53 de banco, 8 de contrato, cobertura de `apps/api/src` em 94,81% de linhas; 10 de repositório, sempre executados. As 40 Proofs de tela de C66 a C99 e de C107 a C111 rodadas uma a uma pelo comando do check, cada uma com exatamente um teste passando (as duas da C109 inclusive); a Proof da C112 rodada pelo comando do check, numa stack do compose construída de um clone limpo, com a migração `0008` aplicada ao subir (1 passou, 16 pulados), e depois o `compose.test.ts` inteiro, com os 17 testes passando na mesma stack): fechados por inteiro **C66 a C99 e C107 a C112**. Somado aos batches A e B, **os 112 checks estão fechados**; nenhum fica aberto, e o que falta é o Verifier. Commits do batch C, sobre `622535e`: `f9d4696` (S8: o menu, as três páginas de `/plans` e o formulário, com C66 a C80, C107, C108 e a primeira prova da C109), `6c9f0e7` (S9: o bloco "Matrículas" e os dois diálogos, com C81 a C94, a segunda prova da C109 e C110), `7384d36` (S10: `/audit`, com C95 a C99 e C111) e `f21018e` (C112, em `tests/stack/compose.test.ts`). O que o Verifier encontra: a feature inteira em `936d1b1..HEAD`, em três batches; o batch C só tocou `apps/web` e `tests/stack` (21 arquivos), nenhum arquivo de `apps/api`, de `packages` ou de migração. No web: `src/lib/plans.ts` (quem lê e quem escreve, os rótulos, `formatPrice`, `priceInputOf` e `parsePrice`), `src/lib/plans-server.ts` (`loadPlans`, que as três páginas que pedem planos usam), `src/app/plans/` (lista, cadastro, edição, `plan-form.tsx` e `plan-status-actions.tsx`), `src/app/students/[id]/enrollments-block.tsx` e `enrollments-load-error.tsx`, e as edições em `shell.tsx`, `students/[id]/page.tsx`, `audit/page.tsx` e `lib/audit.ts`; nas provas: `e2e/plans.spec.ts` (17 testes), `e2e/student-enrollments.spec.ts` (16), seis testes novos em `audit.spec.ts`, um em `shell.spec.ts`, o apoio `e2e/support/plans.ts` (`servePlans`, `serveFicha`, `planOf`, `enrollmentOf`, `spaced` e `textsOf`, que trocam U+00A0 por espaço) e um teste em `compose.test.ts`
- Settled mid-build (batch C): nada foi decidido pelo usuário durante este batch. As conferências pedidas fecharam assim. Antes da S8: não existe `GET /api/plans/:id` (o `PlansController` tem a lista, o `POST`, o `PATCH` e o `DELETE`), e a edição acha o plano na lista que `loadPlans` devolve, com "Plano não encontrado." quando ele não está lá (C80); os quatro `<Link>` novos nasceram com `prefetch={false}` ("Planos" no menu, "Novo plano", o nome de cada plano e "Ver plano" em `/audit`), e a C110 e a C111 contam as requisições com o ponteiro sobre o menu. Antes da S9: as cinco suítes que abrem a ficha (`students.spec.ts`, `consents.spec.ts`, `photos.spec.ts`, `photo-editor.spec.ts` e `photo-camera.spec.ts`) passam todas a ver o bloco no estado de erro da C83 sempre que o perfil não é `instructor`, porque a `FakeApi` delas responde `404` às matrículas; uma asserção só reprovou, a de `consents_load_failure_shows_retry_without_hiding_ficha`, em que a ficha ficou com dois botões "Tentar novamente": a `FakeApi` daquele teste passou a responder às matrículas, e nenhuma asserção mudou; e `serve` de `audit.spec.ts` responde `GET /api/plans`. Decisões do Build, sem check e reversíveis, inclusive as que a `Coverage` listava como fora de AC: (1) o campo "Valor (R$)" aceita `99`, `99,9`, `99,90` e a forma com milhar `1.234,56`; recusa o ponto como decimal (`99.90`) com a mensagem da AC 68, e o valor acima de `99.999,99` recebe a mensagem do schema junto do campo, sem enviar; a conta de reais para centavos é feita com inteiros; (2) "Periodicidade" começa vazia no cadastro e exige escolha, porque não muda depois (door 1); (3) "Reativar", depois do `200`, fica na edição e a recarrega, como o `StatusActions` de funcionário; "Inativar" e "Reativar" ficam no cabeçalho da edição, ao lado do título; (4) quando `GET /api/plans` falha em `/audit`, a trilha segue de pé e o plano aparece pelo id, em vez de a página inteira cair no estado de erro; (5) em "Renovar", quando o plano da matrícula anterior está inativo, vem escolhido o primeiro plano ativo da lista; (6) o diálogo de cancelar diz "Cancelar a matrícula de <aluno> no plano <plano>, de <início> a <vencimento>? O registro continua guardado, e as datas ficam livres para outra matrícula.", com os botões "Voltar" e "Cancelar matrícula", para não haver dois "Cancelar" no mesmo diálogo; (7) a tabela do bloco tem exatamente as cinco colunas da AC 73 para os três perfis: o botão "Cancelar" da linha mora dentro da célula "Situação"; (8) o diálogo de matrícula não valida no navegador: envia e mostra o que a API responde, o `422` de `startsAt` e de `planId` junto do campo e os três `409` num alerta; "Confirmar" só fica desabilitado sem plano ativo e enquanto aguarda; (9) com o aluno inativo, a mensagem da AC 78 tem precedência sobre "Não foi possível carregar os planos.", e os botões "Cancelar" das linhas continuam; (10) o "hoje" do diálogo é lido do relógio do navegador no clique que o abre, não na renderização; (11) "Planos" entra no menu entre "Alunos" e "Funcionários"; (12) a ficha pede as matrículas e os planos em paralelo, depois dos consentimentos; (13) datas do bloco e da trilha usam o `formatBirthDate` que a ficha de funcionário já usa para a admissão; (14) na `FakeApi`, `servePlans` registra os prefixos `/api/plans` e `/api/students` (este só responde a `/enrollments`, e o resto segue `404`), e o `POST` falso de matrícula calcula o vencimento com `enrollmentEndsAt` do contrato e recusa plano inexistente (`422`), plano inativo e sobreposição (`409`); os valores esperados nas provas estão escritos à mão
- Abandoned / deviations (batch C): (1) os commits seguem com o trailer `Co-Authored-By` que o repositório já usa; (2) o cabeçalho de `f21018e` tem 77 caracteres, acima dos 72 que o validador recomenda (aviso, não erro); (3) os checks não são marcados um a um no arquivo: quem diz o que fechou é a linha `Boundary`; (4) além do que os checks pedem: a C73 e a C83 acionam "Tentar novamente" e conferem que a tabela volta; a C85 confere que o "Cancelar" está dentro da linha da matrícula e que a recepção não tem botão nenhum no bloco; a C90 roda com uma matrícula ativa e com uma vencida; a C96 confere que "Ver plano" é o único link da célula; a C110 conta também qualquer método em `/api/plans`; a C112 confere o `code` do `403`, que o `409` não deixou segunda linha em `enrollments`, que a página negada ao instrutor não traz o nome do plano, e `entity` e `entity_id` das duas linhas da trilha; (5) o construtor injetou duas falhas de conferência própria, as duas mortas e desfeitas (o campo de valor aceitando três casas, morta pela C76; "Renovar" começando no próprio dia do vencimento, morta pela C88): não substituem as do Verifier; (6) **duas falhas intermitentes em testes da `alunos`, vistas uma vez cada durante o desenvolvimento e não reproduzidas**: `formats_cpf_phone_birth_date_and_status` (`net::ERR_NO_BUFFER_SPACE` no `page.goto`, do sistema, com os containers da stack de pé ao mesmo tempo) e `ficha_shows_new_status_after_each_change` (o clique em "Suspender" chegou antes de a página hidratar: o botão ficou em foco e o diálogo não abriu); oito repetições de cada passaram, e os 195 testes do `pnpm verify` também. O segundo é uma corrida de um teste que clica logo depois do `goto`, e a ficha ganhou um componente de cliente a mais; não está em check nenhum e não foi consertado; (7) para o Verifier: nenhuma prova de tela contra a `FakeApi` afirma linha de auditoria (regra de leitura deste arquivo), e a trilha das telas é a da C112; na C81, para quem escreve, a situação é afirmada pelo texto exato dentro da célula, e a célula inteira só para a recepção, porque a célula de quem escreve traz também o botão; a C88 fixa só o relógio do navegador (`page.clock.setFixedTime`), que é quem decide o "hoje" do diálogo; a C84 espera um segundo antes de contar as requisições, e a C110 um segundo e meio; na C112 o HTML é comparado depois de trocar U+00A0 e `&nbsp;` por espaço, e "Ativa" é procurada como `>Ativa<`; rodada pelo comando do check, a C112 sobe uma stack nova e pula os outros dezesseis testes, e rodada com o arquivo inteiro vem depois do teste de funcionário, que reinicia a API; (8) o portão continua não reexecutando o web quando só `packages/contracts` muda (achado do batch B, sem dono): neste batch não pesou, porque `apps/web` mudou e as quatro tarefas dele foram executadas. Nada foi abandonado: nenhum check foi editado e nenhuma asserção existente foi afrouxada; as edições em testes de outras features são as duas que a `Coverage` previa (a rota de matrículas respondida num teste de `consents.spec.ts` e o `GET /api/plans` em `serve` de `audit.spec.ts`)
