# Planos e matrículas verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 936d1b1..9836853
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Resumo: as 115 provas dos 112 checks rodaram em `9836853` e passaram, cada uma listada pelo nome; os 112
checks têm asserção localizada. O veredito é FAIL por três linhas deste relatório, que apontam para a mesma
causa mais uma segunda lacuna: um mutante sobreviveu (`## Faults injected`, falha 3), a segunda linha de
`Test policy` não foi atendida para o limite superior de `startsAt`, e dois membros de `Coverage` ficaram
sem prova. Os achados estão ordenados em `## Findings`.

Passos que não rodaram, e por quê: o passo 1 (checks contra fontes binding) só roda em `ui`; o passo 5
(percurso com o usuário) e o passo 7 (lessons) são de quem despachou este Verifier.

## Binding sources

Não roda em `standard`. Além disso, `plan.md` não marca nenhuma fonte como binding (`rg -n -i binding
.specs/features/planos-matriculas/plan.md` não tem ocorrência): none.

## Checks

Cada prova foi rodada por mim em `9836853`, uma invocação por alvo, com reporter que lista cada teste pelo
nome. Os rótulos da coluna `Proof run` são os comandos da seção `## Gate`: `G-DB` (`packages/database`),
`G-CT` (`packages/contracts`), `G-API` (`apps/api`), `G-WEB` (`apps/web`) e `G-STACK` (`tests/stack`). Cada
nome abaixo apareceu individualmente na saída como executado e aprovado, e existe exatamente uma vez no
arquivo da `Proof:` (conferido com busca por nome, uma ocorrência por nome nas 115). Os caminhos são
relativos à raiz do repositório.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `plans` sem `deleted_at`, `tenant_id`, chave estrangeira e `UNIQUE` em `name`; padrões do banco | `G-DB` exit 0 - `plans_table_has_no_deleted_at_tenant_id_foreign_key_or_unique_name_and_defaults` | `packages/database/test/plans.test.ts:102` - `expect(await foreignKeysOf('plans')).toEqual([])`; `packages/database/test/plans.test.ts:128` - `expect(row!.version).toBe(7)` | PASS |
| C2 | `CHECK` de `period`, `status` e `price_cents`, dezoito valores | `G-DB` exit 0 - `plans_period_status_and_price_checks_eighteen_values` | `packages/database/test/plans.test.ts:149` - `expect(failure.code, label).toBe(code)`; `packages/database/test/plans.test.ts:173` - `expect(cases).toBe(18)` | PASS |
| C3 | `enrollments` sem `status`, duas chaves estrangeiras `NO ACTION`, cinco `NOT NULL`, padrões | `G-DB` exit 0 - `enrollments_table_has_no_status_column_two_foreign_keys_without_cascade_and_defaults` | `packages/database/test/plans.test.ts:199` - `expect(await foreignKeysOf('enrollments')).toEqual([{ columns: ['plan_id'], references: 'plans', referenced: ['id'], delete_rule: 'NO ACTION' }, { columns: ['student_id'], references: 'students', referenced: ['id'], delete_rule: 'NO ACTION' }])`; `packages/database/test/plans.test.ts:224` - `expect(failure.code, missing).toBe(NOT_NULL_VIOLATION)` | PASS |
| C4 | a `0008` sobre um banco na `0007` acrescenta só `plans`, `enrollments`, `btree_gist` e a exclusão | `G-DB` exit 0 - `migration_0008_adds_plans_enrollments_and_btree_gist_and_keeps_existing_tables` | `packages/database/test/plans.test.ts:328` - `expect(await tablesOf()).toEqual([...tablesBefore, 'enrollments', 'plans'].sort())`; `packages/database/test/plans.test.ts:344` - `expect(constraint).toEqual([{ conname: 'enrollments_no_overlap', contype: 'x' }])` | PASS |
| C5 | `AUDIT_ACTIONS` com trinta e seis valores na ordem; o percurso grava o vocabulário inteiro | `G-API` exit 0 - `audit_actions_end_with_five_plan_and_enrollment_actions_in_order` e `ten_actions_written_equal_contract_vocabulary` | `apps/api/test/contracts.test.ts:966` - `expect([...AUDIT_ACTIONS]).toEqual([...before, 'plan.created', 'plan.updated', 'plan.inactivated', 'student.enrollment_created', 'student.enrollment_cancelled'])`; `apps/api/test/audit-auth.test.ts:355` - `expect(written).toEqual([...auditActionSchema.options].sort())`; `apps/api/test/audit-auth.test.ts:382` - `expect(ofAction.map((row) => [row.entity, row.entity_id]), action).toEqual(ofAction.map(() => ['student', enrolledId]))` | PASS |
| C6 | os cinco schemas aceitam e recusam o que o claim enumera | `G-API` exit 0 - `plan_and_enrollment_schemas_accept_and_reject` | `apps/api/test/contracts.test.ts:991` - `expect(paths(createPlanRequestSchema.safeParse({ ...create, priceCents })), JSON.stringify(priceCents)).toBe('priceCents')`; `apps/api/test/contracts.test.ts:996` - `expect(paths(updatePlanRequestSchema.safeParse({ period })), JSON.stringify(period)).toBe('period')` | PASS |
| C7 | dezessete vencimentos escritos à mão | `G-CT` exit 0 - `ends_at_seventeen_rows_of_calendar_months_minus_one_day` | `packages/contracts/test/plans.test.ts:27` - `expect(enrollmentEndsAt(startsAt, period), ...).toBe(endsAt)`, sobre as dezessete linhas literais de `packages/contracts/test/plans.test.ts:7` a `:23` | PASS |
| C8 | treze situações, nas duas bordas e na virada do dia | `G-CT` exit 0 - `enrollment_status_thirteen_rows_around_both_edges_and_sao_paulo_midnight` | `packages/contracts/test/plans.test.ts:55` - `expect(enrollmentStatus(enrollment, on), label).toBe(expected)`, sobre as treze linhas literais de `:38` a `:51` | PASS |
| C9 | `POST /api/plans` `201` de `admin` e `hr_finance`, seis chaves, quatro periodicidades | `G-API` exit 0 - `create_201_by_admin_and_hr_finance_with_the_six_keys_and_four_periods` | `apps/api/test/plans.test.ts:42` - `expect(response.status, role).toBe(201)`; `apps/api/test/plans.test.ts:47` - `expect(body, role).toEqual({ id: body.id, name: 'Mensal', period: 'monthly', priceCents: 9990, rules: null, status: 'active' })` | PASS |
| C10 | vinte e uma recusas `422` com o `path` do campo e quatro bordas aceitas | `G-API` exit 0 - `create_twenty_one_refusals_422_with_field_path_and_four_edges_accepted` | `apps/api/test/plans.test.ts:103` - `expect(response.status, ...).toBe(422)`; `apps/api/test/plans.test.ts:104` - `expect(await fieldErrorPaths(response), ...).toContain(field)`; contei 21 linhas na tabela (`:74` a `:94`) e 4 aceitas (`:120`) | PASS |
| C11 | nome repetido cria outro plano | `G-API` exit 0 - `create_with_an_existing_name_201_and_two_rows` | `apps/api/test/plans.test.ts:133` - `expect(response.status).toBe(201)`; `apps/api/test/plans.test.ts:136` - `expect(rows.map((row) => row.id).sort()).toEqual([first.id, second.id].sort())` | PASS |
| C12 | lista com todas as situações, ordem por nome dobrado e `id`, corpo igual para três perfis | `G-API` exit 0 - `list_all_statuses_ordered_by_folded_name_then_id_same_body_for_three_roles` | `apps/api/test/plans.test.ts:176` - `expect(body.items.map(({ id: planId, name, status }) => ({ id: planId, name, status })), role).toEqual(expected)` (ordem literal em `:155` a `:163`); `apps/api/test/plans.test.ts:181` - `expect(new Set(bodies).size).toBe(1)` | PASS |
| C13 | onze casos negados com `403 forbidden`, sem dado de plano | `G-API` exit 0 - `reception_writes_and_instructor_everything_403_eleven_cases` | `apps/api/test/plans.test.ts:222` - `expect(response.status, where).toBe(403)`; `apps/api/test/plans.test.ts:223` - `expect(body.code, where).toBe('forbidden')`; 11 casos (`:207`) | PASS |
| C14 | quatro rotas de plano sem cookie respondem `401 unauthorized` | `G-API` exit 0 - `anonymous_401_on_four_plan_routes` | `apps/api/test/plans.test.ts:245` - `expect(response.status, ...).toBe(401)`; `apps/api/test/plans.test.ts:246` - `expect((await problem(response)).code, ...).toBe('unauthorized')` | PASS |
| C15 | `PATCH` de cada campo e dos três juntos mantém o resto | `G-API` exit 0 - `patch_each_of_three_fields_and_all_together_keeps_the_rest` | `apps/api/test/plans.test.ts:267` - `expect(response.status, label).toBe(200)`; `apps/api/test/plans.test.ts:269` - `expect(updated, label).toEqual({ ...created, ...sent })`; `apps/api/test/plans.test.ts:272` - `expect(changed, ...).toHaveLength(fields.length)` | PASS |
| C16 | `rules` igual a `null` limpa o campo | `G-API` exit 0 - `patch_null_clears_rules` | `apps/api/test/plans.test.ts:289` - `expect(updated.rules).toBeNull()`; `apps/api/test/plans.test.ts:293` - `expect(changedKeys(before, after)).toEqual(['rules'])` | PASS |
| C17 | catorze recusas `422` no `PATCH`, linha idêntica | `G-API` exit 0 - `patch_period_null_and_invalid_values_422_fourteen_cases_row_unchanged` | `apps/api/test/plans.test.ts:322` - `expect(response.status, ...).toBe(422)`; `apps/api/test/plans.test.ts:323` - `expect(await fieldErrorPaths(response), ...).toContain(field)`; `apps/api/test/plans.test.ts:324` - `expect(await planRowText(stack, created.id), ...).toBe(before)`; 14 casos (`:315`) | PASS |
| C18 | `DELETE` inativa, mantém a linha e as duas matrículas, e o plano segue na lista | `G-API` exit 0 - `delete_inactivates_and_keeps_row_and_enrollments` | `apps/api/test/plans.test.ts:347` - `expect(response.status, role).toBe(204)`; `apps/api/test/plans.test.ts:351` - `expect(rowAfter, role).toEqual({ ...rowBefore, status: 'inactive' })`; `apps/api/test/plans.test.ts:352` - `expect(await enrollmentRowsTextOfPlan(stack, planId), role).toEqual(enrollmentsBefore)` | PASS |
| C19 | `DELETE` de plano já inativo: `204`, nada muda | `G-API` exit 0 - `delete_of_inactive_plan_204_changes_nothing` | `apps/api/test/plans.test.ts:368` - `expect(response.status).toBe(204)`; `apps/api/test/plans.test.ts:369` - `expect(await planRowText(stack, planId)).toBe(before)` | PASS |
| C20 | `status` igual a `active` reativa | `G-API` exit 0 - `patch_status_active_reactivates_inactive_plan` | `apps/api/test/plans.test.ts:380` - `expect(response.status).toBe(200)`; `apps/api/test/plans.test.ts:383` - `expect(after).toEqual({ ...before, status: 'active' })` | PASS |
| C21 | cinco outros valores de `status`: `422` em `status` | `G-API` exit 0 - `patch_status_other_values_422_on_status` | `apps/api/test/plans.test.ts:400` - `expect(response.status, label).toBe(422)`; `apps/api/test/plans.test.ts:401` - `expect(await fieldErrorPaths(response), label).toContain('status')` | PASS |
| C22 | reajuste mantém as matrículas registradas e vale para a seguinte | `G-API` exit 0 - `price_change_keeps_recorded_enrollments_and_applies_to_the_next` | `apps/api/test/student-enrollments-write.test.ts:477` - `expect(await enrollmentRowsTextOfStudent(stack, studentId)).toEqual(rowsBefore)`; `apps/api/test/student-enrollments-write.test.ts:480` - `expect(read.map((item) => item.priceCents)).toEqual([9990, 9990])`; `apps/api/test/student-enrollments-write.test.ts:486` - `expect(laterBody.priceCents).toBe(10_990)` | PASS |
| C23 | dois `PATCH` simultâneos de campos diferentes ficam os dois, dez rodadas | `G-API` exit 0 - `two_simultaneous_patches_on_different_fields_keep_both` | `apps/api/test/plans.test.ts:420` - `expect(responses.map((response) => response.status), ...).toEqual([200, 200])`; `apps/api/test/plans.test.ts:422` - `expect(row.name, ...).toBe(name)`; `apps/api/test/plans.test.ts:423` - `expect(row.price_cents, ...).toBe(priceCents)` | PASS |
| C24 | `404 not_found` para `abc` e `uuid` de plano nenhum, quatro casos | `G-API` exit 0 - `patch_and_delete_404_for_non_uuid_and_unknown_uuid` | `apps/api/test/plans.test.ts:436` - `expect(response.status, ...).toBe(404)`; `apps/api/test/plans.test.ts:437` - `expect((await problem(response)).code, ...).toBe('not_found')`; ver F6 | PASS |
| C25 | matrícula `201` com oito chaves, por `admin` e `hr_finance`, sem consultar `consents` | `G-API` exit 0 - `enroll_201_by_admin_and_hr_finance_with_the_eight_keys_and_without_consent` | `apps/api/test/student-enrollments-write.test.ts:81` - `expect(response.status, role).toBe(201)`; `apps/api/test/student-enrollments-write.test.ts:82` - `expect(Object.keys(body).sort(), role).toEqual([...ENROLLMENT_KEYS].sort())`; `apps/api/test/student-enrollments-write.test.ts:88` - `expect(body.endsAt, role).toBe('2026-11-06')` | PASS |
| C26 | vencimento das quatro periodicidades a partir de `2026-10-07` | `G-API` exit 0 - `ends_at_for_the_four_periods_from_2026_10_07` | `apps/api/test/student-enrollments-write.test.ts:134` - `expect(body.endsAt, period).toBe(endsAt)` (quatro pares literais em `:119` a `:122`); `apps/api/test/student-enrollments-write.test.ts:135` - `expect((await enrollmentRow(stack, body.id))!.ends_at, period).toBe(endsAt)` | PASS |
| C27 | mês curto e igualdade com o Postgres nas dezessete linhas | `G-API` exit 0 - `ends_at_uses_last_day_of_short_month_and_matches_postgres_on_seventeen_rows` | `apps/api/test/student-enrollments-write.test.ts:159` - `expect(await endsAtOf(startsAt, period), ...).toBe(endsAt)`; `apps/api/test/student-enrollments-write.test.ts:192` - `expect(returned, label).toBe(endsAt)`; `apps/api/test/student-enrollments-write.test.ts:193` - `expect(returned, ...).toBe(computed!.day)` | PASS |
| C28 | situação calculada na leitura, quatro instantes, linha idêntica | `G-API` exit 0 - `status_computed_on_read_four_values_across_sao_paulo_midnight_without_changing_the_row` | `apps/api/test/student-enrollments-read.test.ts:72` - `expect(read[0]!.status, instant).toBe(status)`; `apps/api/test/student-enrollments-read.test.ts:74` - `expect(await enrollmentRowText(stack, created.id), instant).toBe(row)`; `apps/api/test/student-enrollments-read.test.ts:81` - `expect(read.map((item) => item.status), ...).toEqual(['cancelled'])` | PASS |
| C29 | cinco `planId` inválidos: `422` em `planId` | `G-API` exit 0 - `enroll_five_invalid_plan_ids_422_on_plan_id` | `apps/api/test/student-enrollments-write.test.ts:213` - `expect(response.status, label).toBe(422)`; `apps/api/test/student-enrollments-write.test.ts:214` - `expect(await fieldErrorPaths(response), label).toContain('planId')` | PASS |
| C30 | doze casos de `startsAt` em volta de hoje | `G-API` exit 0 - `enroll_starts_at_twelve_cases_around_today_in_sao_paulo` | `apps/api/test/student-enrollments-write.test.ts:228` - `expect(response.status, label).toBe(422)`; `apps/api/test/student-enrollments-write.test.ts:229` - `expect(await fieldErrorPaths(response), label).toContain('startsAt')`; `apps/api/test/student-enrollments-write.test.ts:258` - `expect(cases).toBe(12)`; os doze casos do claim estão lá, mas o limite de 365 dias só é exercitado às 15:00Z: ver F1 | PASS - precision gap (F1) |
| C31 | início no passado com vencimento futuro: `201` e `active` | `G-API` exit 0 - `enroll_started_in_the_past_and_not_ended_201_active` | `apps/api/test/student-enrollments-write.test.ts:269` - `expect(body.endsAt).toBe('2026-10-19')`; `apps/api/test/student-enrollments-write.test.ts:270` - `expect(body.status).toBe('active')` | PASS |
| C32 | plano inativo: `409 plan_inactive` | `G-API` exit 0 - `enroll_in_inactive_plan_409_plan_inactive` | `apps/api/test/student-enrollments-write.test.ts:280` - `expect(response.status).toBe(409)`; `apps/api/test/student-enrollments-write.test.ts:281` - `expect((await problem(response)).code).toBe('plan_inactive')` | PASS |
| C33 | aluno inativo: `409 student_inactive` | `G-API` exit 0 - `enroll_inactive_student_409_student_inactive` | `apps/api/test/student-enrollments-write.test.ts:292` - `expect(response.status).toBe(409)`; `apps/api/test/student-enrollments-write.test.ts:293` - `expect((await problem(response)).code).toBe('student_inactive')` | PASS |
| C34 | aluno suspenso é matriculado como o ativo | `G-API` exit 0 - `enroll_suspended_student_201_like_active` | `apps/api/test/student-enrollments-write.test.ts:307` - `expect(ofSuspended.status).toBe(201)`; `apps/api/test/student-enrollments-write.test.ts:310` - `expect([suspended.endsAt, suspended.priceCents, suspended.status]).toEqual(['2026-11-06', 9990, 'active'])` | PASS |
| C35 | seis sobreposições `409 enrollment_overlap` e outro aluno `201` | `G-API` exit 0 - `enroll_overlap_six_cases_409_and_other_student_201` | `apps/api/test/student-enrollments-write.test.ts:329` - `expect(response.status, label).toBe(409)`; `apps/api/test/student-enrollments-write.test.ts:330` - `expect((await problem(response)).code, label).toBe('enrollment_overlap')`; `apps/api/test/student-enrollments-write.test.ts:350` - `expect(cases).toBe(6)` | PASS |
| C36 | duas matrículas simultâneas: um `201` e um `409`, dez rodadas | `G-API` exit 0 - `two_simultaneous_enrollments_one_201_one_409` | `apps/api/test/student-enrollments-write.test.ts:365` - `expect(responses.map((response) => response.status).sort(), ...).toEqual([201, 409])`; `apps/api/test/student-enrollments-write.test.ts:372` - `expect(alive, ...).toHaveLength(1)` | PASS |
| C37 | a exclusão por SQL, onze relações; `CHECK` de `ends_at` e de `price_cents` | `G-DB` exit 0 - `enrollments_no_overlap_eleven_cases_by_sql` e `enrollments_ends_at_and_price_checks` | `packages/database/test/plans.test.ts:373` - `expect(failure.code, label).toBe(EXCLUSION_VIOLATION)`; `packages/database/test/plans.test.ts:374` - `expect(failure.constraint, label).toBe('enrollments_no_overlap')`; `packages/database/test/plans.test.ts:427` - `expect(cases).toBe(11)`; `packages/database/test/plans.test.ts:441` - `expect(failure.code, label).toBe(CHECK_VIOLATION)` | PASS |
| C38 | seis `404 not_found` por `:id` de aluno | `G-API` exit 0 - `enrollment_routes_404_for_non_uuid_and_unknown_student` | `apps/api/test/student-enrollments-write.test.ts:392` - `expect(response.status, ...).toBe(404)`; `apps/api/test/student-enrollments-write.test.ts:393` - `expect((await problem(response)).code, ...).toBe('not_found')`; `apps/api/test/student-enrollments-write.test.ts:399` - `expect(cases).toBe(6)`; ver F6 | PASS |
| C39 | dez casos negados com `403 forbidden`, sem campo de matrícula | `G-API` exit 0 - `reception_writes_and_instructor_everything_403_ten_cases` | `apps/api/test/student-enrollments-write.test.ts:434` - `expect(response.status, where).toBe(403)`; `apps/api/test/student-enrollments-write.test.ts:435` - `expect(body.code, where).toBe('forbidden')`; 10 casos (`:422`) | PASS |
| C40 | três rotas de matrícula sem cookie: `401 unauthorized` | `G-API` exit 0 - `anonymous_401_on_three_enrollment_routes` | `apps/api/test/student-enrollments-write.test.ts:458` - `expect(response.status, ...).toBe(401)`; `apps/api/test/student-enrollments-write.test.ts:459` - `expect((await problem(response)).code, ...).toBe('unauthorized')` | PASS |
| C41 | renovação colada: `201`, linha anterior idêntica | `G-API` exit 0 - `renewal_glued_to_the_previous_201_and_previous_row_unchanged` | `apps/api/test/student-enrollments-write.test.ts:501` - `expect(response.status).toBe(201)`; `apps/api/test/student-enrollments-write.test.ts:503` - `expect(await enrollmentRowText(stack, previous.id)).toBe(before)` | PASS |
| C42 | renovação antecipada: `scheduled` ao lado da `active` | `G-API` exit 0 - `early_renewal_reads_scheduled_and_current_active` | `apps/api/test/student-enrollments-write.test.ts:517` - `expect(read.find((item) => item.id === renewal.id)!.status).toBe('scheduled')`; `apps/api/test/student-enrollments-write.test.ts:518` - `expect(read.find((item) => item.id === current.id)!.status).toBe('active')` | PASS |
| C43 | renovação em outro plano leva o vencimento e o valor dele | `G-API` exit 0 - `renewal_in_another_plan_takes_its_ends_at_and_price` | `apps/api/test/student-enrollments-write.test.ts:532` - `expect(body.endsAt).toBe('2027-02-06')`; `apps/api/test/student-enrollments-write.test.ts:533` - `expect(body.priceCents).toBe(24_990)` | PASS |
| C44 | renovação depois de um intervalo deixa os dias sem matrícula | `G-API` exit 0 - `renewal_after_a_gap_201_and_gap_days_uncovered` | `apps/api/test/student-enrollments-write.test.ts:545` - `expect(read.map((item) => [item.startsAt, item.endsAt]).sort()).toEqual([['2026-10-07', '2026-11-06'], ['2026-12-01', '2026-12-31']])`; `apps/api/test/student-enrollments-write.test.ts:553` - `expect(read.filter((item) => item.startsAt <= day && day <= item.endsAt), day).toEqual([])` | PASS |
| C45 | cancelar em três situações: `204`, `cancelled_at` do banco, o resto igual | `G-API` exit 0 - `cancel_204_sets_cancelled_at_from_database_and_keeps_row_in_three_states` | `apps/api/test/student-enrollments-write.test.ts:581` - `expect(response.status, label).toBe(204)`; `apps/api/test/student-enrollments-write.test.ts:585` - `expect({ ...after, cancelled_at: null }, label).toEqual(before)`; `apps/api/test/student-enrollments-write.test.ts:587` - `expect(stored!.cancelled_at.getTime(), label).toBeGreaterThanOrEqual(t0.getTime())` | PASS |
| C46 | cancelar a cancelada: `204`, linha idêntica | `G-API` exit 0 - `cancel_of_cancelled_204_changes_nothing` | `apps/api/test/student-enrollments-write.test.ts:609` - `expect(response.status).toBe(204)`; `apps/api/test/student-enrollments-write.test.ts:610` - `expect(await enrollmentRowText(stack, created.id)).toBe(before)` | PASS |
| C47 | depois de cancelar, o mesmo período é aceito | `G-API` exit 0 - `enroll_after_cancel_in_the_same_period_201` | `apps/api/test/student-enrollments-write.test.ts:621` - `expect(response.status).toBe(201)`; `apps/api/test/student-enrollments-write.test.ts:628` - `expect(rows.map((row) => row.cancelled).sort()).toEqual([false, true])` | PASS |
| C48 | três `404` por `:enrollmentId`, matrícula alheia intacta | `G-API` exit 0 - `cancel_404_for_bad_unknown_and_other_students_enrollment` | `apps/api/test/student-enrollments-write.test.ts:648` - `expect(response.status, label).toBe(404)`; `apps/api/test/student-enrollments-write.test.ts:650` - `expect(await enrollmentRowText(stack, ofOther.id), label).toBe(before)` | PASS |
| C49 | lista com canceladas, ordem por `startsAt` e `id` decrescentes, corpo igual para três perfis | `G-API` exit 0 - `list_includes_cancelled_ordered_by_starts_at_desc_then_id_desc_same_body_for_three_roles` | `apps/api/test/student-enrollments-read.test.ts:123` - `expect(body.items.map(({ id, startsAt, endsAt, status }) => ({ id, startsAt, endsAt, status })), role).toEqual(expected)` (ordem literal em `:98` a `:103`); `apps/api/test/student-enrollments-read.test.ts:128` - `expect(new Set(bodies).size).toBe(1)` | PASS |
| C50 | aluno sem matrícula: `200` e `items` vazio | `G-API` exit 0 - `list_of_student_without_enrollment_200_empty` | `apps/api/test/student-enrollments-read.test.ts:136` - `expect(response.status).toBe(200)`; `apps/api/test/student-enrollments-read.test.ts:137` - `expect(await response.json()).toEqual({ items: [] })` | PASS |
| C51 | nome atual do plano, datas e valor gravados | `G-API` exit 0 - `list_shows_current_plan_name_and_recorded_dates_and_price` | `apps/api/test/student-enrollments-read.test.ts:151` - `expect(read[0]!.plan).toEqual({ id: planId, name: 'Mensal Plus', period: 'monthly' })`; `apps/api/test/student-enrollments-read.test.ts:154` - `expect(read[0]!.priceCents).toBe(9990)` | PASS |
| C52 | inativar o aluno mantém as matrículas e a leitura | `G-API` exit 0 - `inactivating_the_student_keeps_enrollments_and_they_stay_readable` | `apps/api/test/student-enrollments-read.test.ts:174` - `expect(await enrollmentRowsTextOfStudent(stack, studentId)).toEqual(rowsBefore)`; `apps/api/test/student-enrollments-read.test.ts:178` - `expect(items.map((item) => [item.id, item.status, item.cancelledAt])).toEqual([[scheduled.id, 'scheduled', null], [active.id, 'active', null]])` | PASS |
| C53 | seis leituras `200` não gravam na trilha | `G-API` exit 0 - `six_reads_of_plans_and_enrollments_write_no_audit_row` | `apps/api/test/student-enrollments-read.test.ts:202` - `expect(await auditCount(stack), ...).toBe(before)`; `apps/api/test/student-enrollments-read.test.ts:207` - `expect(reads).toBe(6)` | PASS |
| C54 | criar plano grava uma linha `plan.created` | `G-API` exit 0 - `create_writes_one_plan_created_row` | `apps/api/test/plans-audit.test.ts:55` - `expect(rows, author.email).toHaveLength(1)`; `apps/api/test/plans-audit.test.ts:56` - `expect(rows[0], author.email).toMatchObject({ action: 'plan.created', user_id: author.id, entity: 'plan', entity_id: created.id })` | PASS |
| C55 | `diff` da criação com quatro valores e `rules` só pelo nome | `G-API` exit 0 - `create_diff_records_four_values_and_names_rules_only` | `apps/api/test/plans-audit.test.ts:77` - `expect(short.rows[0]!.diff).toEqual({ fields: ['name', 'period', 'priceCents', 'status'], values })` (`values` literal em `:66` a `:71`); `apps/api/test/plans-audit.test.ts:88` - `expect(Object.keys(diff.values).sort()).toEqual(['name', 'period', 'priceCents', 'status'])` | PASS |
| C56 | `plan.updated` com o valor de e para, e `rules` só pelo nome | `G-API` exit 0 - `patch_writes_one_plan_updated_row_with_values_and_rules_by_name` | `apps/api/test/plans-audit.test.ts:100` - `expect(both.rows[0]!.diff).toEqual({ fields: ['priceCents', 'rules'], values: { priceCents: { from: 9990, to: 10_990 } } })`; `apps/api/test/plans-audit.test.ts:107` - `expect(nameOnly.rows[0]!.diff).toEqual({ fields: ['name'], values: { name: { from: 'Mensal', to: 'Mensal Plus' } } })` | PASS |
| C57 | `diff` da reativação | `G-API` exit 0 - `reactivation_diff_records_status_from_inactive_to_active` | `apps/api/test/plans-audit.test.ts:118` - `expect(rows[0]!.diff).toEqual({ fields: ['status'], values: { status: { from: 'inactive', to: 'active' } } })` | PASS |
| C58 | seis `PATCH` sem mudança não gravam | `G-API` exit 0 - `patch_without_change_six_cases_writes_no_row` | `apps/api/test/plans-audit.test.ts:141` - `expect(response.status, label).toBe(200)`; `apps/api/test/plans-audit.test.ts:142` - `expect(await auditCount(stack), label).toBe(count)` | PASS |
| C59 | inativar grava uma linha `plan.inactivated` | `G-API` exit 0 - `inactivate_writes_one_plan_inactivated_row` | `apps/api/test/plans-audit.test.ts:154` - `expect(rows[0]).toMatchObject({ action: 'plan.inactivated', user_id: hrUser.id, entity: 'plan', entity_id: created.id })`; `apps/api/test/plans-audit.test.ts:155` - `expect(rows[0]!.diff).toEqual({ fields: ['status'], values: { status: { from: 'active', to: 'inactive' } } })` | PASS |
| C60 | matricular grava uma linha `student.enrollment_created` com `from` nulo | `G-API` exit 0 - `enroll_writes_one_enrollment_created_row_with_null_from` | `apps/api/test/plans-audit.test.ts:165` - `expect(rows).toHaveLength(1)`; `apps/api/test/plans-audit.test.ts:167` - `expect(rows[0]!.diff).toEqual({ fields: ['planId', 'startsAt', 'endsAt', 'priceCents'], values: { planId: { from: null, to: planId }, startsAt: { from: null, to: '2026-10-07' }, endsAt: { from: null, to: '2026-11-06' }, priceCents: { from: null, to: 9990 } } })` | PASS |
| C61 | cancelar grava uma linha `student.enrollment_cancelled` com `to` nulo | `G-API` exit 0 - `cancel_writes_one_enrollment_cancelled_row_with_null_to` | `apps/api/test/plans-audit.test.ts:187` - `expect(rows[0]).toMatchObject({ action: 'student.enrollment_cancelled', user_id: adminUser.id, entity: 'student', entity_id: studentId })`; `apps/api/test/plans-audit.test.ts:188` - `expect(rows[0]!.diff).toEqual({ fields: [...], values: { planId: { from: planId, to: null }, startsAt: { from: '2026-10-07', to: null }, endsAt: { from: '2026-11-06', to: null }, priceCents: { from: 9990, to: null } } })` | PASS |
| C62 | vinte e sete desfechos que não gravam | `G-API` exit 0 - `twenty_seven_non_writing_outcomes_write_no_audit_row` | `apps/api/test/plans-audit.test.ts:249` - `expect(response.status, name).toBe(expected)`; `apps/api/test/plans-audit.test.ts:251` - `expect(await auditCount(stack), name).toBe(count)`; contei 27 linhas (`:214` a `:240`) | PASS |
| C63 | trilha que falha: `500 internal_error` e nada gravado, cinco rotas | `G-API` exit 0 - `audit_insert_failure_500_rolls_back_five_write_routes` | `apps/api/test/plans-audit.test.ts:276` - `expect(response.status, name).toBe(500)`; `apps/api/test/plans-audit.test.ts:277` - `expect((await problem(response)).code, name).toBe('internal_error')`; `apps/api/test/plans-audit.test.ts:278` - `expect(await rowsSnapshot(), name).toEqual(before)` | PASS |
| C64 | `ip` e `user_agent`, três casos em cada uma das cinco ações | `G-API` exit 0 - `ip_and_user_agent_three_cases_on_each_of_five_actions` | `apps/api/test/plans-audit.test.ts:357` - `expect(rows[0]!.ip, ...).toBe('203.0.113.7')`; `apps/api/test/plans-audit.test.ts:358` - `expect(rows[0]!.user_agent, ...).toBe(userAgent)` | PASS |
| C65 | nome, CPF e texto de `rules` fora de `audit_logs` | `G-API` exit 0 - `student_name_cpf_and_rules_text_never_reach_audit_logs` | `apps/api/test/plans-audit.test.ts:383` - `expect(secrets.filter((secret) => text.includes(secret))).toEqual([])` | PASS |
| C66 | link "Planos" para três perfis, nunca para `instructor` | `G-WEB` exit 0 - `plans_link_for_admin_hr_finance_and_reception` | `apps/web/e2e/shell.spec.ts:94` - `await expect(page.getByRole('link', { name: 'Planos', exact: true }), role).toHaveCount(expected ? 1 : 0)`; `apps/web/e2e/shell.spec.ts:96` - `toHaveAttribute('href', '/plans')` | PASS |
| C67 | três URLs sem sessão vão para `/login`, sem requisição de plano | `G-WEB` exit 0 - `anonymous_three_plan_urls_redirect_to_login` | `apps/web/e2e/plans.spec.ts:55` - `await expect(page, path).toHaveURL('/login')`; `apps/web/e2e/plans.spec.ts:58` - `expect(planRequests(api)).toHaveLength(0)` | PASS |
| C68 | cinco casos sem permissão, sem formulário e sem dado de plano | `G-WEB` exit 0 - `instructor_and_reception_see_no_permission_on_five_cases` | `apps/web/e2e/plans.spec.ts:77` - `await expect(page.getByText(NO_PERMISSION, { exact: true }), ...).toBeVisible()`; `apps/web/e2e/plans.spec.ts:82` - `expect(text, ...).not.toContain(secret)` | PASS |
| C69 | título, cinco colunas e a ordem da API para três perfis | `G-WEB` exit 0 - `list_title_five_columns_and_api_order_for_three_roles` | `apps/web/e2e/plans.spec.ts:101` - `expect(await page.getByRole('columnheader').allTextContents(), role).toEqual(['Nome', 'Periodicidade', 'Valor', 'Regras de acesso', 'Situação'])`; `apps/web/e2e/plans.spec.ts:108` - `expect(await page.locator('tbody tr td:nth-child(1)').allTextContents(), role).toEqual(['Zen', 'Anual', 'Mensal'])` | PASS |
| C70 | periodicidade, valor, situação e "—" formatados | `G-WEB` exit 0 - `list_formats_period_price_status_and_dash_for_null_rules` | `apps/web/e2e/plans.spec.ts:136` - `expect(await textsOf(page.locator('tbody tr td:nth-child(3)'))).toEqual(['R$ 99,90', 'R$ 0,00', 'R$ 1.234,56', 'R$ 99.999,99'])`; `apps/web/e2e/plans.spec.ts:130` - `toEqual(['Mensal', 'Trimestral', 'Semestral', 'Anual'])` | PASS |
| C71 | "Novo plano" e links no nome só para quem escreve | `G-WEB` exit 0 - `new_button_and_name_links_only_for_admin_and_hr_finance` | `apps/web/e2e/plans.spec.ts:154` - `await expect(page.getByRole('link', { name: 'Novo plano', exact: true }), role).toHaveAttribute('href', '/plans/new')`; `apps/web/e2e/plans.spec.ts:169` - `await expect(names.getByRole('link')).toHaveCount(0)` | PASS |
| C72 | lista vazia: "Nenhum plano cadastrado." | `G-WEB` exit 0 - `empty_registry_shows_no_plan_message` | `apps/web/e2e/plans.spec.ts:178` - `await expect(page.getByText('Nenhum plano cadastrado.', { exact: true }), role).toBeVisible()`; `apps/web/e2e/plans.spec.ts:179` - `await expect(page.getByRole('table'), role).toHaveCount(0)` | PASS |
| C73 | falha ao carregar: mensagem e "Tentar novamente" | `G-WEB` exit 0 - `load_failure_shows_retry` (de `plans.spec.ts`; ver F8) | `apps/web/e2e/plans.spec.ts:190` - `await expect(page.getByText('Não foi possível carregar os planos.', { exact: true })).toBeVisible()`; `apps/web/e2e/plans.spec.ts:192` - `await expect(retry).toBeVisible()` | PASS |
| C74 | rótulos do formulário, "Salvar", "Periodicidade" desabilitado na edição | `G-WEB` exit 0 - `form_labels_save_button_and_period_disabled_on_edit` | `apps/web/e2e/plans.spec.ts:211` - `await expect(label(page, 'Periodicidade'), path).toBeDisabled()`; `apps/web/e2e/plans.spec.ts:217` - `await expect(label(page, 'Valor (R$)')).toHaveValue('99,90')` | PASS |
| C75 | valor em reais enviado em centavos, cinco valores | `G-WEB` exit 0 - `price_typed_in_reais_is_sent_in_cents_five_values` | `apps/web/e2e/plans.spec.ts:236` - `expect(bodies(api, 'POST')[0]!.priceCents, price).toBe(cents)` (pares literais em `:225` a `:228`); `apps/web/e2e/plans.spec.ts:246` - `expect(bodies(api, 'PATCH')[0]!.priceCents).toBe(10990)` | PASS |
| C76 | quatro valores inválidos: mensagem no campo e nada enviado | `G-WEB` exit 0 - `invalid_price_four_values_shows_message_and_sends_nothing` | `apps/web/e2e/plans.spec.ts:258` - `await expect(label(page, 'Valor (R$)'), ...).toHaveAccessibleDescription(INVALID_PRICE)`; `apps/web/e2e/plans.spec.ts:266` - `expect(api.writes()).toHaveLength(0)` | PASS |
| C77 | salvar leva a `/plans`, do cadastro e da edição | `G-WEB` exit 0 - `save_navigates_to_the_plans_list_from_new_and_edit` | `apps/web/e2e/plans.spec.ts:278` - `await expect(page, ...).toHaveURL('/plans')`; `apps/web/e2e/plans.spec.ts:285` - `await expect(page, ...).toHaveURL('/plans')` | PASS |
| C78 | "Inativar" ou "Reativar" conforme a situação | `G-WEB` exit 0 - `edit_shows_inativar_or_reativar_by_status` | `apps/web/e2e/plans.spec.ts:299` - `await expect(page.getByRole('button', { name: shown, exact: true }), status).toBeVisible()`; `apps/web/e2e/plans.spec.ts:300` - `await expect(page.getByRole('button', { name: hidden, exact: true }), status).toHaveCount(0)` | PASS |
| C79 | inativar confirma nomeando o plano, envia um `DELETE` e vai à lista | `G-WEB` exit 0 - `inactivate_confirms_naming_the_plan_then_deletes_and_goes_to_the_list` | `apps/web/e2e/plans.spec.ts:311` - `await expect(dialog).toContainText('Semestral Família')`; `apps/web/e2e/plans.spec.ts:323` - `expect(api.writes().map((request) => ...)).toEqual([...])` com o único `DELETE` da rota do plano; `apps/web/e2e/plans.spec.ts:322` - `await expect(page).toHaveURL('/plans')` | PASS |
| C80 | plano desconhecido na edição: "Plano não encontrado." | `G-WEB` exit 0 - `unknown_plan_shows_not_found_on_edit` | `apps/web/e2e/plans.spec.ts:331` - `await expect(page.getByText('Plano não encontrado.', { exact: true })).toBeVisible()`; `apps/web/e2e/plans.spec.ts:333` - `await expect(label(page, name), name).toHaveCount(0)` | PASS |
| C81 | bloco "Matrículas": cinco colunas, ordem da API, formatos e quatro rótulos, três perfis | `G-WEB` exit 0 - `block_five_columns_api_order_formats_and_four_status_labels_for_three_roles` | `apps/web/e2e/student-enrollments.spec.ts:75` - `expect(await block(page).getByRole('columnheader').allTextContents(), role).toEqual(['Plano', 'Início', 'Vencimento', 'Valor', 'Situação'])`; `apps/web/e2e/student-enrollments.spec.ts:83` - `toEqual(['07/10/2026', '07/11/2026', '01/08/2026', '01/09/2026'])`; `apps/web/e2e/student-enrollments.spec.ts:88` - `await expect(column(page, 5).nth(index).getByText(text, { exact: true }), ...).toBeVisible()` | PASS |
| C82 | bloco vazio: "Nenhuma matrícula registrada." | `G-WEB` exit 0 - `empty_block_shows_no_enrollment_message` | `apps/web/e2e/student-enrollments.spec.ts:102` - `await expect(block(page).getByText('Nenhuma matrícula registrada.', { exact: true }), role).toBeVisible()`; `apps/web/e2e/student-enrollments.spec.ts:103` - `toHaveCount(0)` | PASS |
| C83 | falha das matrículas não esconde a ficha | `G-WEB` exit 0 - `enrollments_load_failure_shows_retry_without_hiding_ficha` | `apps/web/e2e/student-enrollments.spec.ts:114` - `await expect(block(page).getByText('Não foi possível carregar as matrículas.', { exact: true })).toBeVisible()`; `apps/web/e2e/student-enrollments.spec.ts:119` - `await expect(page.getByRole('heading', { name: 'Rafaela Prado Cunha', exact: true })).toBeVisible()` | PASS |
| C84 | instrutor: sem bloco e sem chamadas de matrícula ou de plano | `G-WEB` exit 0 - `instructor_has_no_block_and_no_enrollment_or_plan_calls` | `apps/web/e2e/student-enrollments.spec.ts:135` - `await expect(page.getByText('Matrículas')).toHaveCount(0)`; `apps/web/e2e/student-enrollments.spec.ts:138` - `expect(enrollmentRequests(api)).toHaveLength(0)`; `apps/web/e2e/student-enrollments.spec.ts:139` - `expect(planRequests(api)).toHaveLength(0)` | PASS |
| C85 | "Matricular" ou "Renovar" em cinco estados, "Cancelar" por linha, recepção sem botão | `G-WEB` exit 0 - `matricular_or_renovar_by_five_states_cancelar_per_row_and_no_buttons_for_reception` | `apps/web/e2e/student-enrollments.spec.ts:160` - `await expect(button(page, shown), ...).toHaveCount(1)`; `apps/web/e2e/student-enrollments.spec.ts:161` - `await expect(button(page, hidden), ...).toHaveCount(0)`; `apps/web/e2e/student-enrollments.spec.ts:180` - `await expect(block(page).getByRole('button'), ...).toHaveCount(0)` | PASS |
| C86 | aluno inativo: a mensagem no lugar dos botões | `G-WEB` exit 0 - `inactive_student_shows_message_instead_of_matricular_and_renovar` | `apps/web/e2e/student-enrollments.spec.ts:196` - `await expect(block(page).getByText(message, { exact: true }), name).toBeVisible()`; `apps/web/e2e/student-enrollments.spec.ts:197` - `await expect(button(page, 'Matricular'), name).toHaveCount(0)` | PASS |
| C87 | diálogo: só planos ativos, três prévias do vencimento, `POST` só depois de "Confirmar" | `G-WEB` exit 0 - `dialog_lists_active_plans_previews_ends_at_and_posts_only_after_confirm` | `apps/web/e2e/student-enrollments.spec.ts:211` - `expect(await textsOf(field(page, 'Plano').locator('option'))).toEqual(['Mensal · Mensal · R$ 99,90', 'Anual · Anual · R$ 999,00'])`; `apps/web/e2e/student-enrollments.spec.ts:225` - `await expect(dialog(page).getByText('Vencimento: 27/02/2026', { exact: true })).toBeVisible()`; `apps/web/e2e/student-enrollments.spec.ts:233` - `expect(api.writes()[0]!.body).toEqual({ planId: PLAN_ID, startsAt: '2026-10-07' })` | PASS |
| C88 | preenchimento do diálogo: hoje em São Paulo nos dois lados da virada, ou o dia seguinte ao maior vencimento com o plano dele | `G-WEB` exit 0 - `dialog_prefills_today_in_sao_paulo_or_day_after_last_ends_at_and_its_plan` | `apps/web/e2e/student-enrollments.spec.ts:249` - `await expect(field(page, 'Início'), instant).toHaveValue(day)` (pares literais em `:239` e `:240`); `apps/web/e2e/student-enrollments.spec.ts:274` - `await expect(field(page, 'Início')).toHaveValue('2026-12-07')`; `apps/web/e2e/student-enrollments.spec.ts:275` - `await expect(field(page, 'Plano')).toHaveValue(QUARTERLY_ID)` | PASS |
| C89 | sem plano ativo: mensagem e "Confirmar" desabilitado | `G-WEB` exit 0 - `dialog_without_active_plan_shows_message_and_disables_confirm` | `apps/web/e2e/student-enrollments.spec.ts:305` - `getByText('Nenhum plano ativo. Cadastre um plano em Planos.', { exact: true })` visível; `apps/web/e2e/student-enrollments.spec.ts:308` - `await expect(confirm(page), name).toBeDisabled()` | PASS |
| C90 | falha dos planos mantém a ficha e a tabela, sem "Matricular" | `G-WEB` exit 0 - `plans_load_failure_keeps_ficha_and_table_without_matricular` | `apps/web/e2e/student-enrollments.spec.ts:326` - `await expect(block(page).getByText('Não foi possível carregar os planos.', { exact: true }), name).toBeVisible()`; `apps/web/e2e/student-enrollments.spec.ts:327` - `await expect(button(page, 'Matricular'), name).toHaveCount(0)` | PASS |
| C91 | depois do `201` o diálogo fecha e a linha nova aparece | `G-WEB` exit 0 - `block_shows_new_enrollment_after_confirm` | `apps/web/e2e/student-enrollments.spec.ts:342` - `await expect(dialog(page)).toHaveCount(0)`; `apps/web/e2e/student-enrollments.spec.ts:346` - `expect(await column(page, 3).allTextContents()).toEqual(['06/10/2027'])` | PASS |
| C92 | três `409` com as três mensagens, escolhas mantidas | `G-WEB` exit 0 - `three_409_codes_show_their_messages_and_keep_the_choices` | `apps/web/e2e/student-enrollments.spec.ts:368` - `await expect(dialog(page).getByText(message, { exact: true }), code).toBeVisible()` (pares literais em `:352` a `:354`); `apps/web/e2e/student-enrollments.spec.ts:370` - `await expect(field(page, 'Plano'), code).toHaveValue(ANNUAL_ID)` | PASS |
| C93 | `422` em `startsAt`: a mensagem da API junto do campo | `G-WEB` exit 0 - `starts_at_422_message_shown_on_the_field` | `apps/web/e2e/student-enrollments.spec.ts:387` - `await expect(field(page, 'Início')).toHaveAccessibleDescription(message)` | PASS |
| C94 | cancelar confirma nomeando aluno, plano e período, e envia um `DELETE` | `G-WEB` exit 0 - `cancel_confirms_naming_student_plan_and_period_then_deletes` | `apps/web/e2e/student-enrollments.spec.ts:404` - `await expect(dialog(page), text).toContainText(text)`; `apps/web/e2e/student-enrollments.spec.ts:418` - `await expect(column(page, 5)).toHaveText(['Cancelada'])`; `apps/web/e2e/student-enrollments.spec.ts:420` - `expect(api.writes().map(...)).toEqual([...])` com o único `DELETE` da matrícula | PASS |
| C95 | cinco ações por extenso e o filtro com trinta e seis | `G-WEB` exit 0 - `plan_and_enrollment_actions_labelled_and_filter_has_thirty_six` | `apps/web/e2e/audit.spec.ts:747` - `expect(await page.locator('tbody tr td:nth-child(3)').allTextContents()).toEqual(PLAN_LABELS)`; `apps/web/e2e/audit.spec.ts:750` - `expect(options).toHaveLength(36)`; `apps/web/e2e/audit.spec.ts:755` - `expect(options.slice(31)).toEqual(PLAN_LABELS)` | PASS |
| C96 | "Ver plano" leva à edição do plano | `G-WEB` exit 0 - `plan_target_link_ver_plano` | `apps/web/e2e/audit.spec.ts:766` - `await expect(target.getByRole('link', { name: 'Ver plano', exact: true })).toHaveAttribute('href', ...)` com `/plans/<planId>/edit` | PASS |
| C97 | detalhes de `plan.updated`: valor de e para, `rules` só pelo nome | `G-WEB` exit 0 - `plan_updated_details_show_price_change_and_rules_by_name` | `apps/web/e2e/audit.spec.ts:786` - `expect(await detailsOf(page, 1)).toEqual(['Valor: R$ 99,90 → R$ 109,90', 'Regras de acesso alterado'])` | PASS |
| C98 | detalhes de `plan.created`: quatro valores | `G-WEB` exit 0 - `plan_created_details_show_four_values` | `apps/web/e2e/audit.spec.ts:809` - `expect(await detailsOf(page, 1)).toEqual(['Nome: Mensal', 'Periodicidade: Mensal', 'Valor: R$ 99,90', 'Situação: Ativo'])` | PASS |
| C99 | detalhes de `student.enrollment_created` e "Ver aluno" | `G-WEB` exit 0 - `enrollment_created_details_show_plan_name_period_and_price_with_ver_aluno` | `apps/web/e2e/audit.spec.ts:833` - `expect(await detailsOf(page, 1)).toEqual(['Plano: — → Mensal Plus', 'Início: — → 07/10/2026', 'Vencimento: — → 06/11/2026', 'Valor: — → R$ 99,90'])`; `apps/web/e2e/audit.spec.ts:841` - `toHaveAttribute('href', ...)` com `/students/<entityId>` | PASS |
| C100 | sete rotas no OpenAPI, três corpos pelo schema do contrato | `G-API` exit 0 - `plan_and_enrollment_paths_declared_with_json_bodies` | `apps/api/test/openapi.test.ts:287` - `expect(declared.sort()).toEqual([...].sort())` com as sete rotas literais de `:289` a `:295`; `apps/api/test/openapi.test.ts:308` - `expect(content['application/json']?.schema, ...).toEqual(json(schema))` | PASS |
| C101 | corpos reais contra os schemas, e os três códigos novos de `409` | `G-API` exit 0 - `plan_and_enrollment_bodies_match_contract_schemas_and_three_new_codes` | `apps/api/test/contracts.test.ts:1104` - `expect(parsed.success, ...).toBe(true)`; `apps/api/test/contracts.test.ts:1111` - `expect(body.code, route).toBe(code)`; `apps/api/test/contracts.test.ts:1113` - `expect(problemSchema.safeParse(body).success, route).toBe(true)` | PASS |
| C102 | `admin` sem 2FA: `403 two_factor_enrollment_required` nas sete rotas | `G-API` exit 0 - `admin_without_2fa_gets_403_everywhere_else` | `apps/api/test/enrollment.test.ts:46` - `expect(response.status, ...).toBe(403)`; `apps/api/test/enrollment.test.ts:47` - `expect((await problem(response)).code, ...).toBe('two_factor_enrollment_required')`; as sete rotas literais em `apps/api/test/enrollment.test.ts:83` a `:89` | PASS |
| C103 | origem estranha: `403 csrf_rejected` nas cinco rotas de escrita | `G-API` exit 0 - `foreign_origin_403_csrf_on_five_write_routes` | `apps/api/test/plans.test.ts:475` - `expect(response.status, where).toBe(403)`; `apps/api/test/plans.test.ts:476` - `expect((await problem(response)).code, where).toBe('csrf_rejected')` | PASS |
| C104 | entrada hostil nunca responde `5xx` | `G-API` exit 0 - `hostile_input_never_answers_5xx` | `apps/api/test/hostile-input.test.ts:116` - `expect(results.filter((line) => line.startsWith('5'))).toEqual([])`; `apps/api/test/hostile-input.test.ts:113` - `expect(results.length - before).toBe(7 * 6 + 5 * 6 + 5 * 2)` | PASS |
| C105 | cinco pares em corrida: nunca `5xx`, uma linha de trilha, nenhuma sobreposição | `G-API` exit 0 - `five_racing_pairs_never_5xx_one_audit_row_and_no_overlap_left` | `apps/api/test/student-enrollments-write.test.ts:675` - `expect(cancels.rows.filter((row) => row.action === 'student.enrollment_cancelled'), ...).toHaveLength(1)`; `apps/api/test/student-enrollments-write.test.ts:696` - `expect(await overlappingPairs(stack, overlapped), ...).toBe(0)`; `apps/api/test/student-enrollments-write.test.ts:723` - `expect(statuses.filter((status) => status >= 500)).toEqual([])`; ver F7 | PASS |
| C106 | rotas de aluno com as mesmas chaves; inativar grava só a sua linha | `G-API` exit 0 - `student_routes_keep_their_keys_and_inactivation_writes_only_its_own_row` | `apps/api/test/student-enrollments-read.test.ts:227` - `expect(enrolledKeys, ...).toEqual(Object.keys((await ofPlain.json()) as Student).sort())`; `apps/api/test/student-enrollments-read.test.ts:242` - `expect(rows.map((row) => row.action)).toEqual(['student.inactivated'])` | PASS |
| C107 | o cadastro omite `rules` vazio; a edição envia só o que mudou e nunca `period` | `G-WEB` exit 0 - `new_form_omits_empty_rules_and_edit_form_sends_only_changes_never_period` | `apps/web/e2e/plans.spec.ts:344` - `expect(bodies(api, 'POST')[0]).toEqual({ name: 'Mensal', period: 'monthly', priceCents: 9990 })`; `apps/web/e2e/plans.spec.ts:356` - `expect(bodies(api, 'PATCH')[0]).toEqual({ name: 'Mensal Plus' })`; `apps/web/e2e/plans.spec.ts:363` - `expect(bodies(api, 'PATCH')[1]).toEqual({ rules: null })` | PASS |
| C108 | "Reativar" envia um `PATCH` com `status` igual a `active`, sem diálogo | `G-WEB` exit 0 - `reativar_sends_patch_active_without_dialog` | `apps/web/e2e/plans.spec.ts:378` - `expect(write!.body).toEqual({ status: 'active' })`; `apps/web/e2e/plans.spec.ts:375` - `await expect(page.getByRole('dialog')).toHaveCount(0)` | PASS |
| C109 | "Salvar" e "Confirmar" desabilitados enquanto a API não responde | `G-WEB` exit 0 - `save_button_disabled_while_waiting_on_both_forms` e `confirm_button_disabled_while_waiting` | `apps/web/e2e/plans.spec.ts:393` - `await expect(save(page), 'novo').toBeDisabled()`; `apps/web/e2e/plans.spec.ts:400` - `await expect(save(page), 'edição').toBeDisabled()`; `apps/web/e2e/student-enrollments.spec.ts:436` - `await expect(confirm(page)).toBeDisabled()` | PASS |
| C110 | a ficha pede as matrículas uma vez, e os planos só para quem escreve | `G-WEB` exit 0 - `ficha_asks_for_enrollments_once_and_for_plans_only_when_the_role_writes` | `apps/web/e2e/student-enrollments.spec.ts:456` - `expect(gets(api, ROUTE), ...).toHaveLength(1)`; `apps/web/e2e/student-enrollments.spec.ts:457` - `expect(gets(api, '/api/plans'), ...).toHaveLength(plans)` (pares literais em `:441` a `:443`) | PASS |
| C111 | detalhes do cancelamento e da inativação, `planId` desconhecido, uma chamada a `/api/plans` | `G-WEB` exit 0 - `enrollment_cancelled_and_plan_inactivated_details_and_unknown_plan_id` | `apps/web/e2e/audit.spec.ts:874` - `expect(await detailsOf(page, 1)).toEqual(['Plano: Mensal Plus → —', 'Início: 07/10/2026 → —', 'Vencimento: 06/11/2026 → —', 'Valor: R$ 99,90 → —'])`; `apps/web/e2e/audit.spec.ts:880` - `toEqual(['Situação: Ativo → Inativo'])`; `apps/web/e2e/audit.spec.ts:886` - `expect(planCalls.map(...)).toEqual(['GET /api/plans'])` | PASS |
| C112 | na stack do compose: plano criado, aluno matriculado, sobreposição recusada, páginas e trilha | `G-STACK` exit 0 - `plan_created_and_student_enrolled_through_web_with_overlap_refused_and_audit_rows` | `tests/stack/compose.test.ts:781` - `expect(psql(...)).toBe('btree_gist')`; `tests/stack/compose.test.ts:818` - `expect(enrollment.endsAt).toBe(psql(...))` com a conta do Postgres da stack; `tests/stack/compose.test.ts:823` - `expect(repeated.status).toBe(409)`; `tests/stack/compose.test.ts:853` - `toEqual([...])` com as duas linhas de `plan.created` e `student.enrollment_created`, `ip` e `user_agent` enviados | PASS |

Conferência contra o diff (`git diff 936d1b1..HEAD --stat`): as 115 provas moram em arquivos novos
(`packages/database/test/plans.test.ts`, `packages/contracts/test/plans.test.ts`, os quatro de `apps/api/test`
e os dois de `apps/web/e2e`) ou em testes que o diff criou ou editou dentro de arquivos existentes
(`contracts.test.ts` +209, `audit-auth.test.ts` +33, `openapi.test.ts` +54, `enrollment.test.ts` +7,
`hostile-input.test.ts` +34, `audit.spec.ts` +203, `shell.spec.ts` +20, `compose.test.ts` +124). Nenhuma
prova resolve só para um teste que a feature não tocou.

## Coverage

Recomputada, não lida. A coluna `Recomputed from` diz de onde os membros foram tirados; as primeiras 126
linhas são as da tabela de `checks.md`, na ordem dela, e as últimas são conjuntos que achei sem linha.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/plans` statuses (3) | `apps/api/src/plans/plans.controller.ts:22` (`200`), `AccessGuard` (`app.module.ts:125`) e `Surface` | 200 C12 · 401 C14 · 403 C13 | - |
| `POST /api/plans` statuses (4) | `plans.controller.ts:29` a `:35` e `Surface` | 201 C9 · 401 C14 · 403 C13 · 422 C10 | - |
| `PATCH /api/plans/:id` statuses (5) | `plans.controller.ts:37` a `:45` e `Surface` | 200 C15 · 401 C14 · 403 C13 · 404 C24 · 422 C17 | - |
| `DELETE /api/plans/:id` statuses (4) | `plans.controller.ts:47` a `:52` e `Surface` | 204 C18 · 401 C14 · 403 C13 · 404 C24 | - |
| `GET /api/students/:id/enrollments` statuses (4) | `student-enrollments.controller.ts:21` a `:28` e `Surface` | 200 C49 · 401 C40 · 403 C39 · 404 C38 | - |
| `POST /api/students/:id/enrollments` statuses (6) | `student-enrollments.controller.ts:30` a `:52` e `Surface` | 201 C25 · 401 C40 · 403 C39 · 404 C38 · 409 C35 · 422 C29 | - |
| `DELETE /api/students/:id/enrollments/:enrollmentId` statuses (4) | `student-enrollments.controller.ts:54` a `:63` e `Surface` | 204 C45 · 401 C40 · 403 C39 · 404 C38, C48 | - |
| status `500` fora da `Surface`, por rota de escrita (5) | os cinco `audit.record` de `plans.service.ts:36`, `:84`, `:101` e `student-enrollments.service.ts:89`, `:145` | as cinco C63 | - |
| códigos do `409` da matrícula (3) | `student-enrollments.controller.ts:47` a `:50` | `enrollment_overlap` C35 · `plan_inactive` C32 · `student_inactive` C33 | - |
| quem escreve, por perfil (4) | `@Roles` de `plans.controller.ts:30`, `:38`, `:48` e `student-enrollments.controller.ts:31`, `:55` | `admin` C9, C15, C18, C25, C45 · `hr_finance` idem · `reception` C13, C39 · `instructor` C13, C39 | - |
| quem lê, por perfil (4) | `@Roles` de `plans.controller.ts:23` e `student-enrollments.controller.ts:22` | `admin` C12, C49 · `hr_finance` C12, C49 · `reception` C12, C49 · `instructor` C13, C39 | - |
| linha de erro comum da `auth-rbac` nas rotas novas (3) | `.specs/features/auth-rbac/plan.md:109`, `apps/api/src/csrf.ts:25`, `access.ts` | `401 unauthorized` C14, C40 · `403 csrf_rejected` C103 · `403 two_factor_enrollment_required` C102 | - |
| casos negados nas rotas de plano (11) | AC 5: cinco de `reception` e seis de `instructor` | C13, tabela de 11 contada em `plans.test.ts:207` a `:209` | - |
| casos negados nas rotas de matrícula (10) | AC 31: quatro de `reception` e seis de `instructor` | C39, tabela de 10 contada em `student-enrollments-write.test.ts:422` a `:424` | - |
| rotas sem sessão (7) | roteador real: dois controllers, quatro e três rotas | quatro C14 · três C40 | - |
| rotas de escrita sob a checagem de origem (5) | os cinco `@Post`, `@Patch` e `@Delete` dos dois controllers | C103, cinco rotas por duas tentativas | - |
| rotas bloqueadas ao `admin` sem 2FA (7) | `stack.api.routes()`, o roteador real, em `enrollment.test.ts:38` | C102, a lista é lida do roteador e comparada com a literal | - |
| rotas no documento OpenAPI (7) | os dois controllers | C100 | - |
| `:id` inválido por rota com `:id` (5) | as cinco rotas com `:id` | duas C24 · três C38 | - |
| `:enrollmentId` inválido (3) | `student-enrollments.service.ts:129` a `:135` | `abc` C48 · `uuid` de matrícula nenhuma C48 · matrícula de outro aluno C48 | - |
| one-way doors (6) | `Landing` do plano | door 1 C1, C2 · door 2 C2, C10 · door 3 C3, C37 · door 4 C7, C8 · door 5 C4, C37 · door 6 C5, C54 (a forma literal da door 1 está na última linha desta tabela) | - |
| relações de `Relations` (2) | `Relations` e `0008_plans_enrollments.sql:28`, `:29` | as duas C3, C25 | - |
| one-way constraints de `Relations` (9) | `Relations` do plano | as nove, como em `checks.md`: C2, C17, C2, C2 e C37, C3, C37, C45 e C46, C3 e C28, C37 | - |
| o que `plans` não tem (4) | door 1 | as quatro C1 | - |
| o que `enrollments` não tem (3) | door 3 | as três C3 | - |
| valores de `period` no banco (8) | `0008_plans_enrollments.sql:23` | os oito C2 | - |
| valores de `status` do plano no banco (6) | `0008_plans_enrollments.sql:24` | os seis C2 | - |
| `price_cents` no banco (6 edges) | `0008_plans_enrollments.sql:25`, `:11`, `:7`, `:18` | quatro C2 · dois C37 | - |
| `NOT NULL` de `enrollments` (5) | `0008_plans_enrollments.sql:3` a `:7` | os cinco C3 | - |
| chaves estrangeiras de `enrollments` (4) | `0008_plans_enrollments.sql:28`, `:29` | as quatro C3 | - |
| relações entre dois períodos, por SQL (11) | `0008_plans_enrollments.sql:36` e a linha 3 de `Test policy` | C37: cinco recusadas no `INSERT`, quatro aceitas, dois `UPDATE` | - |
| `ends_at` contra `starts_at` no banco (2 edges) | `0008_plans_enrollments.sql:10` | as duas C37 | - |
| o que a migração `0008` deixa no banco (7) | `0008_plans_enrollments.sql` inteira | os sete C4 | - |
| vocabulário de `AUDIT_ACTIONS` (36) | `packages/contracts/src/audit.ts`, 36 entradas contadas | C5, lista literal inteira e conjunto gravado | - |
| quem grava cada ação nova (5) | os cinco `audit.record` dos dois serviços | C54 · C56 · C59 · C60 · C61 | - |
| campos de plano na trilha (5) | `plans.service.ts:10` (`REGISTRABLE`) e `:13` (`TRACKED`) | `name` C55, C56 · `period` C55 · `priceCents` C55, C56 · `status` C55, C57, C59 · `rules` só pelo nome C55, C56, C65 | - |
| campos de matrícula na trilha (4) | `student-enrollments.service.ts:17` | os quatro C60, C61 | - |
| forma do `diff` de matrícula (2) | door 6 | C60 · C61 | - |
| `PATCH` de plano sem mudança (6) | `plans.service.ts:76`, `:77` | os seis C58 | - |
| desfechos que não gravam linha (27) | os status de cada rota, recontados: 2 + 3 + 4 + 4 + 3 + 7 + 4 | C62 | - |
| leituras `200` que não gravam (6) | duas rotas `GET` por três perfis | C53 | - |
| rotas que desfazem quando a auditoria falha (5) | as cinco transações dos dois serviços | C63 | - |
| `ip` e `user_agent` da linha (4) | AC 56 | os quatro C64 | - |
| ações que gravam `ip` e `user_agent` (5) | as cinco ações novas | C64 | - |
| o que fica fora de `audit_logs` (4) | AC 57 | os quatro C65 | - |
| `name` do plano na API (5 edges) | `packages/contracts/src/plans.ts:22` a `:28` | os cinco C10 | - |
| `period` na API (10) | `packages/contracts/src/plans.ts:5`, `:6` | quatro C9 · seis C10 | - |
| `priceCents` na API (8 edges) | `packages/contracts/src/plans.ts:31` a `:35` | os oito C10 | - |
| `rules` na API (4 edges) | `packages/contracts/src/plans.ts:38` a `:43` | os quatro C10 | - |
| campos de texto com U+0000 (2) | `packages/contracts/src/plans.ts:27`, `:43` | `name` C10, C17 · `rules` C10 (no `PATCH`, só `name`: ver F3) | - |
| o que o `PATCH` de plano edita (4) | `plans.service.ts:16` (`EDITABLE`) | os quatro C15 | - |
| `null` no `PATCH` de plano (4) | `packages/contracts/src/plans.ts:59` a `:65` | C16 · três C17 | - |
| `period` no `PATCH` (3) | `packages/contracts/src/plans.ts:64` | os três C17 | - |
| valores de `status` no `PATCH` (6) | `packages/contracts/src/plans.ts:63` | C20 · cinco C21 | - |
| o que inativar o plano mantém (3) | AC 10 | os três C18 | - |
| inativar o plano por situação (2) | `plans.service.ts:98` | C18 · C19 | - |
| reajuste de valor (3) | AC 14 | os três C22 | - |
| chaves do plano (6) | `packages/contracts/src/plans.ts:69` a `:76` | C9 | - |
| ordem da lista de planos (4) | AC 4 e `plans.service.ts:55` | os quatro C12 | - |
| chaves da matrícula (8) | `packages/contracts/src/plans.ts:139` a `:148` | C25 | - |
| chaves de `plan` dentro da matrícula (3) | `packages/contracts/src/plans.ts:141` | as três C25 | - |
| tabela do vencimento no próprio nível (17) | C7 e a linha 1 de `Test policy` | C7, dezessete linhas contadas | - |
| vencimento pela API, as quatro periodicidades (4) | AC 18 | as quatro C26 | - |
| mês de destino sem o dia (3) | AC 19 | os três C27 | - |
| vencimento igual ao do Postgres (17) | door 4 | C27, dezessete linhas contadas | - |
| quem usa a conta do vencimento (2) | `student-enrollments.service.ts:78` e `enrollments-block.tsx:240` | a API C26, C27 · a prévia C87 | - |
| valores de `status` da matrícula (4) | `packages/contracts/src/plans.ts:83` | os quatro C8, C28 | - |
| situação nas bordas do período (4 edges) | `packages/contracts/src/plans.ts:119`, `:120` | as quatro C8 | - |
| virada do dia em `America/Sao_Paulo` na situação (4 edges) | AC 20 | as quatro C8, C28 | - |
| `planId` inválido (5) | AC 21 | os cinco C29 | - |
| `startsAt` (12 edges) | AC 22 | os doze C30 (os doze do claim; o que falta é a virada no limite superior, na linha do fim da tabela) | - |
| início no passado (2) | AC 22, AC 23 | C31 · C30 | - |
| situação do aluno que aceita matrícula (3) | os três valores de `StudentStatus` | `active` C25 · `suspended` C34 · `inactive` C33 | - |
| situação do plano que aceita matrícula (2) | `PLAN_STATUSES` | `active` C25 · `inactive` C32 | - |
| sobreposição pela API (7) | AC 27 e a linha 3 de `Test policy` | as sete C35 | - |
| renovação (4) | AC 33 a AC 36 | C41 · C42 · C43 · C44 | - |
| cancelar por situação (4) | AC 37, AC 38 | três C45 · C46 | - |
| o que cancelar faz (4) | AC 37, AC 39 | três C45 · C47 | - |
| leitura das matrículas (5) | AC 41, AC 42 | quatro C49 · C50 | - |
| o que a leitura traz de agora e do registro (4) | AC 43 | os quatro C51 | - |
| o que inativar o aluno mantém (3) | AC 44 | dois C52 · C106 | - |
| pares concorrentes (7) | C23, C36 e C105 | C23 · C36 · cinco C105 | - |
| schemas de `packages/contracts` (5) | `packages/contracts/src/plans.ts`: sete schemas de objeto exportados | os cinco C6; os dois de lista (`plansResponseSchema`, `enrollmentsResponseSchema`) C101 | - |
| entrada hostil nas rotas novas (3) | C104 | as três C104: 42 + 30 + 10 respostas | - |
| códigos novos de erro (3) | `student-enrollments.controller.ts:47` a `:49` | os três C101 | - |
| corpos reais contra o contrato (8) | os `@Output` dos dois controllers | os oito C101 | - |
| rotas de aluno que não mudam (3) | `Impact` "comportamento existente" | as três C106 | - |
| `Assumptions` que viram comportamento (20) | as 22 linhas de `Assumptions`, menos as duas que o plano exclui | as vinte, como em `checks.md` | - |
| perfis e o menu (4) | AC 58 | os quatro C66 | - |
| URLs de tela sem sessão (3) | AC 59 | as três C67 | - |
| casos de tela negados (5) | AC 60 | os cinco C68 | - |
| colunas de `/plans` (5) | AC 61 | as cinco C69 | - |
| periodicidade por extenso (4) | AC 62 | as quatro C70 | - |
| valor em reais (4) | AC 62 mais `9999999` | os quatro C70 | - |
| situação do plano e regra nula na tela (3) | AC 62 | os três C70 | - |
| controles de escrita em `/plans` por perfil (3) | AC 63 | os três C71 | - |
| estados de `/plans` em `Observable` (4) | `Observable`, linhas de `/plans` | vazio C72 · erro C73 · sem permissão C67, C68, C71 · densidade e ordem C69 | - |
| estados dos formulários de plano em `Observable` (4) | `Observable`, linhas dos formulários | carregando C109 · erro C76, C80 · sem permissão C67, C68 · ação destrutiva C79 (o `422` por campo e o `5xx`, que o plano marca `existing`: ver F5) | - |
| textos do formulário de plano (5) | AC 66 | os cinco C74 | - |
| "Periodicidade" no formulário (2) | AC 66 | os dois C74 | - |
| valor digitado que vira centavos (5) | AC 67 mais quatro | os cinco C75 | - |
| valor digitado recusado na tela (4) | AC 68 | os quatro C76 | - |
| para onde vai depois de salvar (2) | AC 69 | os dois C77 | - |
| botões da edição de plano (2) | AC 70 | os dois C78 | - |
| diálogo de inativar (3) | AC 71 | os três C79 | - |
| colunas do bloco "Matrículas" (5) | AC 73 | as cinco C81 | - |
| situação da matrícula por extenso (4) | AC 73 | as quatro C81 | - |
| estados do bloco em `Observable` (5) | `Observable`, linhas do bloco | vazio C82, C89 · erro C83, C90, C92, C93 · sem permissão C84, C85 · densidade e ordem C81 · ação destrutiva C94 | - |
| botões do bloco por estado (8) | AC 77 | os oito C85 | - |
| aluno inativo no bloco (2) | AC 78 | os dois C86 | - |
| o que o diálogo de matrícula mostra (5) | AC 79 | os cinco C87 | - |
| prévia do vencimento no diálogo (3) | a linha 1 de `Test policy` | as três C87 | - |
| preenchimento do diálogo (5) | AC 80 | os cinco C88 | - |
| diálogo sem plano ativo (2) | AC 81 | os dois C89 | - |
| depois de confirmar a matrícula (2) | AC 83 | os dois C91 | - |
| mensagens do `409` no diálogo (3) | AC 84 | as três C92 | - |
| diálogo de cancelar (3) | AC 86 | os três C94 | - |
| o que a ficha pede à API por perfil (4) | `Flow` "Telas" 2 e `Impact` "web" | três C110 · `instructor` C84 | - |
| escritas que as telas enviam (8) | `Surface`, coluna `In` | C107 (quatro) · C108 · C79 · C87 · C94 | - |
| ações novas por extenso em `/audit` (5) | AC 87 | as cinco C95 | - |
| filtro "Ação" (36) | AC 87 | C95 | - |
| "Alvo" das linhas novas (2) | AC 88, AC 91 | C96 · C99 | - |
| detalhes novos em `/audit` (7) | AC 89 a AC 91 e C111 | C98 · C97 · C97 · C111 · C99 · C111 · C111 | - |
| startup config: migração `0008` aplicada (3 assemblies) | cada montagem aberta: `packages/database/test/plans.test.ts:33` (`pnpm db:migrate` no `testcontainers`), `apps/api/test/support/servers.ts:14` (`migrate` do Drizzle no `testcontainers`, `apps/api/test/support/app.ts:66` monta o `AppModule`), `compose.yaml:25` e `Dockerfile:13` (serviço `migrate`, `pnpm db:migrate`) | banco migrado C1 · harness de `apps/api` C9 · stack C112 (`compose.test.ts:782`) | - |
| startup config: `btree_gist` criada por quem migra (2 assemblies) | `packages/database/test/plans.test.ts:31` (papel padrão do `PostgreSqlContainer`) e `compose.yaml:4` (o `DATABASE_URL` do `migrate` usa o `POSTGRES_USER` da imagem, `compose.yaml:10`) | `testcontainers` C4 · `compose.yaml` C112 (`compose.test.ts:781`) | - |
| startup config: rotas novas pela origem do web (2 assemblies) | `apps/web/playwright.config.ts:22` (`next build` e `next start`; `API_URL` na `FakeApi` em `:24`) e `compose.yaml:105` a `:111` (container `web`, `API_URL` na `api`) | build de produção contra a `FakeApi` C69 · container `web` C112 | - |
| sem linha em `checks.md`: `CHECK` da migração `0008` (5) | `0008_plans_enrollments.sql:10`, `:11`, `:23`, `:24`, `:25` | `plans_period_valid` C2 · `plans_status_valid` C2 · `plans_price_cents_not_negative` C2 · `enrollments_ends_at_not_before_starts_at` C37 · `enrollments_price_cents_not_negative` C37 | - |
| sem linha em `checks.md`: valor que depende do dia, dos dois lados da virada (5) | a linha 2 de `Test policy`, AC 20, AC 22 e AC 80, e onde o código lê o dia: `student-enrollments.service.ts:77`, `:120`, `packages/contracts/src/plans.ts:129`, `enrollments-block.tsx:80` | situação no início C8, C28 · situação no vencimento C8, C28 · limite inferior de `startsAt` (vencimento não anterior a hoje) C30 · início sugerido C88 | limite superior de `startsAt` (hoje mais 365 dias) na virada do dia |
| sem linha em `checks.md`: forma literal da door 1 (11) | `Landing`, door 1 | `uuidv7` C1 · `CHECK` de `period` C2 · 1, 3, 6 e 12 meses C7 · nenhuma rota altera `period` C17 · `CHECK` e padrão de `status` C1, C2 · `rules` anulável C1 · `rules` até 500 C10 · `name` sem `UNIQUE` C1 · sem `deleted_at` C1 · sem `tenant_id` C1 | `rules` exibido como texto puro |

Status que uma rota responde e a tabela não lista: nenhum. Os dois controllers só lançam
`NotFoundException`, `validationProblem` (`422`) e `ProblemException(409, ...)`; `401` e `403` vêm da guarda
e da checagem de origem, e o `500` tem linha própria.

`Swept` marcados `existing`, relidos contra o código: a guarda global está em
`apps/api/src/app.module.ts:125` (`APP_GUARD` com `AccessGuard`) e a checagem de origem em
`apps/api/src/configure-app.ts:22` e `apps/api/src/csrf.ts:25`; o `500 internal_error` está em
`apps/api/src/problem.filter.ts:11`. As três provas citadas existem (`apps/api/test/access.test.ts:49` e
`:145`, `apps/api/test/problem.test.ts:31`) e passaram em `9836853` (3 passed).

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Conta pura de `packages/contracts` usada pela API e pela tela | `packages/contracts/src/plans.ts` (`enrollmentEndsAt` em `:101`, `enrollmentStatus` em `:113`) | own level C7 (17 linhas à mão), C8 (13 linhas à mão) · HTTP C26, C27 (valores das AC e igualdade com o Postgres), C28 · browser C87 (três prévias) | yes |
| Valor que depende do dia e é calculado na leitura | `apps/api/src/student-enrollments/student-enrollments.service.ts:77`, `:120` · `packages/contracts/src/plans.ts:129` · `apps/web/src/app/students/[id]/enrollments-block.tsx:80` | situação C8, C28 (quatro instantes e linha idêntica) · limite de `startsAt` C30 · início sugerido C88 | not met - o limite superior de `startsAt` (hoje mais 365 dias) só é provado com o relógio às 15:00Z; nenhum dos dois instantes da virada o exercita, e trocar o dia de São Paulo pelo dia UTC nessa linha passa em todas as provas (falha 3) |
| Restrição do banco que decide entre duas linhas por intervalo | `packages/database/migrations/0008_plans_enrollments.sql:36` · `apps/api/src/student-enrollments/student-enrollments.service.ts:99` · `apps/api/src/db-errors.ts` | SQL C37 (um caso por relação e os dois `UPDATE`) · HTTP C35 (seis casos), C36 (corrida) | yes |

## Faults injected

Cinco mutações, cada uma aplicada e desfeita num worktree de rascunho fora do repositório
(`git worktree add --detach C:\Users\Admin\AppData\Local\Temp\pmv-wt HEAD`, `pnpm install --frozen-lockfile
--offline`), nunca na árvore real e sem `git stash`. Antes das mutações as provas estreitas passaram no
rascunho sem alteração (linha de base). As seis superfícies de asserção receberam ao menos uma falha: o
banco por SQL (1), a conta pura (2), a resposta HTTP da API (2 e 3), a trilha de auditoria (4), o navegador
(2 e 5) e a stack do compose (4, com as imagens reconstruídas a partir do clone do rascunho). As falhas 2 e
4 foram rodadas contra provas de superfícies diferentes para caber no teto de cinco.

| Mutation | Location | Killed | Proof run |
| --- | --- | --- | --- |
| 1. intervalo da exclusão fechado à direita vira aberto: `'[]'` -> `'[)'` | `packages/database/migrations/0008_plans_enrollments.sql:36` | yes | C37 `enrollments_no_overlap_eleven_cases_by_sql` reprovou em `packages/database/test/plans.test.ts:392` ("um dia em comum, o último de A" foi aceito) |
| 2. sem o teto do último dia do mês: `Math.min(day, lastDay)` -> `day` | `packages/contracts/src/plans.ts:106` | yes | C7 reprovou em `packages/contracts/test/plans.test.ts:27` (esperado `2026-02-27`, veio `2026-02-28`); C27 reprovou em `apps/api/test/student-enrollments-write.test.ts:159`; C87 reprovou em `apps/web/e2e/student-enrollments.spec.ts:225` |
| 3. limite superior de `startsAt` contado do dia UTC em vez do dia em `America/Sao_Paulo`: `addDays(today(), 365)` -> `addDays(new Date().toISOString().slice(0, 10), 365)` | `packages/contracts/src/plans.ts:129` | no | C30 `enroll_starts_at_twelve_cases_around_today_in_sao_paulo` passou; com o mutante, também passaram as 66 provas de `apps/api`, os 8 testes de `packages/contracts`, o `tsc` e o `eslint` do pacote |
| 4. matrícula registrada sem a linha de auditoria: removido o `audit.record` do `POST` | `apps/api/src/student-enrollments/student-enrollments.service.ts:89` | yes | C60 reprovou em `apps/api/test/plans-audit.test.ts:165` (zero linhas); C112 reprovou em `tests/stack/compose.test.ts:853` (faltou a linha `student.enrollment_created`), na stack construída do clone com a mutação |
| 5. matrícula vencida conta como vigente no bloco: o filtro de `active` ou `scheduled` vira "não cancelada" | `apps/web/src/app/students/[id]/enrollments-block.tsx:72` | yes | C85 reprovou em `apps/web/e2e/student-enrollments.spec.ts:160` ("admin só vencida": esperava "Matricular") |

Depois da última mutação: `git worktree remove --force` do rascunho e remoção do diretório dele,
`git worktree list` só com a árvore real, nenhum `stash`, e `git status --porcelain` da árvore real igual ao
de antes (`?? CLAUDE.md`), mais este arquivo.

Docker: a sessão foi interrompida depois das cinco mutações e, ao retomar, o daemon estava parado; o
resultado da falha 4 na stack foi relido do log da execução, que terminou (`exit=1`, reprovação em
`tests/stack/compose.test.ts:853`). O Docker Desktop foi iniciado de novo só para conferir sobras:
containers, volumes, redes e imagens são os mesmos da fotografia tirada antes da primeira subida da stack,
sem nada de projeto `academia-up-*` e sem container em execução. A stack `academia` e os volumes
`academia_postgres-data` e `academia_storage-data` não foram tocados.

## Gate

Rodado em `9836853`, na árvore real, uma invocação por alvo. Total: 115 provas, 115 passed, 0 failed.

- `G-DB`: `pnpm --filter "./packages/database" exec vitest run test/plans.test.ts -t "<6 nomes em alternação>" --reporter=verbose` - exit 0, 6 passed, 0 failed
- `G-CT`: `pnpm --filter "./packages/contracts" exec vitest run test/plans.test.ts -t "<2 nomes>" --reporter=verbose` - exit 0, 2 passed, 0 failed
- `G-API`: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts test/contracts.test.ts test/enrollment.test.ts test/hostile-input.test.ts test/openapi.test.ts test/plans-audit.test.ts test/plans.test.ts test/student-enrollments-read.test.ts test/student-enrollments-write.test.ts -t "<66 nomes>" --reporter=verbose` - exit 0, 66 passed, 51 skipped, 0 failed (Postgres real por `testcontainers`)
- `G-WEB`: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts e2e/plans.spec.ts e2e/shell.spec.ts e2e/student-enrollments.spec.ts -g "<40 nomes>" --reporter=list` - exit 0, 41 passed, 0 failed: as 40 provas e um homônimo (F8), sobre o build de produção contra a `FakeApi`
- `G-STACK`: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "plan_created_and_student_enrolled_through_web_with_overlap_refused_and_audit_rows" --reporter=verbose` - exit 0, 1 passed, 16 skipped, 0 failed. A prova sobe a própria stack num projeto compose `academia-up-<pid>`, de um clone limpo em pasta temporária, com portas sorteadas, e a derruba com volumes e imagens ao fim; não colide com o projeto `academia` do usuário, que não foi tocado
- As três provas `existing` do `Swept` (`guard_matrix_three_declarations_five_callers`, `only_four_routes_answer_without_session`, `unhandled_500_hides_exception`): exit 0, 3 passed

`validate_verification.py planos-matriculas`: exit 1, com a única mensagem de que o veredito é FAIL (a
estrutura do relatório foi lida).

## Findings

Ordenados por gravidade. Os dois primeiros são os que reprovam; os demais são observações que não mudam o
veredito e ficam para quem decide.

1. **F1 - mutante sobrevivente; linha 2 de `Test policy` não atendida; precision gap na C30** -
   `packages/contracts/src/plans.ts:129`, `apps/api/test/student-enrollments-write.test.ts:248` a `:256`.
   A AC 22 recusa o `startsAt` "posterior ao dia corrente em `America/Sao_Paulo` mais 365 dias". A C30
   escreve os dois casos desse limite só "com o relógio em `2026-10-07T15:00:00Z`" (`:248`, `:249`), hora
   em que o dia UTC e o dia de São Paulo são o mesmo; a virada (`:254`, `:256`) usa `2026-09-08`, que só
   exercita o limite inferior. Trocar `today()` pelo dia UTC nessa linha passa nas 66 provas de API e nos 8
   testes de contrato: entre 00:00Z e 03:00Z (das 21h à meia-noite em São Paulo) a API aceitaria um início
   366 dias à frente, e nada reprova. Falta, por exemplo: com o relógio em `2026-10-08T02:59:59Z`,
   `2027-10-08` responde `422` e `2027-10-07` responde `201`; em `2026-10-08T03:00:00Z`, `2027-10-08`
   responde `201`. O claim da C30 também precisa dizer isso.
2. **F2 - coverage gap: membro da forma literal da door 1 sem prova** - no evidence; o código está em
   `apps/web/src/app/plans/page.tsx:66`. A door 1 decide que `rules` é "exibido como texto puro". A C70
   afirma que a célula mostra `Somente manhãs` (`apps/web/e2e/plans.spec.ts:142`), o que um texto sem
   marcação não distingue de HTML interpretado; nenhuma prova põe marcação em `rules` (busquei `<b>`,
   `<script`, `&lt;` e `innerHTML` nos quatro arquivos de tela e no da stack: nada). Pela leitura, o risco é
   baixo: é um filho de texto do React, e não há `dangerouslySetInnerHTML` em `apps/web/src`. Continua sem
   prova.
3. **F3 - coverage gap entre a AC 9 e a C17 (observação)** - `apps/api/test/plans.test.ts:299` a `:314`. A
   AC 9 recusa no `PATCH` "um valor que a AC 2 reprova"; a C17 enumera catorze casos e a prova os exercita,
   mas ficam de fora, no `PATCH`: U+0000 em `rules`, `name` e `rules` só de espaços, e `priceCents` como
   texto. A C104 envia `a\u0000b` em `rules` do `PATCH` e só afirma que não é `5xx`. Hoje o `POST` e o
   `PATCH` usam os mesmos objetos de schema (`packages/contracts/src/plans.ts:60` a `:62`), então não há como
   divergirem sem alguém separar os schemas.
4. **F4 - restrições que a migração tem e nenhuma prova afirma por SQL (observação)** -
   `packages/database/migrations/0008_plans_enrollments.sql:16`, `:17`, `:20`. `name`, `period` e `status` de
   `plans` são `NOT NULL`, e só o `NOT NULL` de `price_cents` é provado (C2). Um `period` nulo passaria pelo
   `CHECK` (`NULL in (...)` não reprova); a API o recusa antes de chegar ao banco (C10). O plano não nomeia
   esses três `NOT NULL` e `checks.md` tem linha para os cinco de `enrollments`, não para os de `plans`. O
   índice `enrollments_student_id_starts_at_idx` (`:30`) e os padrões de `created_at` e `updated_at` de
   `plans` também não têm prova, e o `Handoff` os declara como decisão do Build.
5. **F5 - estados `existing` do `Observable` sem prova nas telas novas (observação)** -
   `apps/web/src/app/plans/plan-form.tsx:77`, `:78`; `apps/web/src/app/students/[id]/enrollments-block.tsx:190`,
   `:281`; `apps/web/src/app/plans/[id]/edit/plan-status-actions.tsx:31`. O plano marca o `422` por campo e o
   `5xx` dos formulários de plano como `existing`; a restrição citada existe (`apps/web/src/lib/api.ts:28`,
   `:37`, e as provas `field_errors_shown_on_four_forms` e `unavailable_api_message_on_five_screens` de
   `apps/web/e2e/forms.spec.ts:6` e `:23`, que não abrem as telas novas). O estado "carregando", também
   `existing`, ganhou a C109; estes dois não ganharam prova equivalente.
6. **F6 - a nota do autor sobre os `404` confere (observação)** - `apps/api/test/plans.test.ts:436`,
   `apps/api/test/student-enrollments-write.test.ts:392`. As provas da C24 e os `GET` e `POST` da C38
   passariam sem as rotas. Quem prova que elas existem e decidem: a C13 afirma `403` com `uuid` de plano
   nenhum em `PATCH` e `DELETE` (`apps/api/test/plans.test.ts:192`, `:222`), e a C39 o mesmo nas três de
   matrícula (`apps/api/test/student-enrollments-write.test.ts:408`, `:434`). Sem level gap: os status são
   afirmados na fronteira HTTP.
7. **F7 - a C105 não força o entrelaçamento (observação)** -
   `apps/api/test/student-enrollments-write.test.ts:694`, `:706`, `:717`. Nos três pares de uma escrita
   contra outra a prova aceita `201` ou `409`, como o claim diz; nada afirma que as duas ordens ocorrem. O
   que a prova fixa são os invariantes (`:675`, `:683`, `:696`, `:723`).
8. **F8 - nome de prova repetido em dois arquivos (observação)** - `apps/web/e2e/audit.spec.ts:423` e
   `apps/web/e2e/plans.spec.ts:183` têm ambos um teste `load_failure_shows_retry`. O comando da C73 traz o
   arquivo e resolve para um só; numa invocação que junte os dois arquivos saem 41 testes para 40 nomes.
9. **F9 - a C101 amostra os corpos de erro (observação)** - `apps/api/test/contracts.test.ts:1079` a `:1090`.
   Onze corpos de erro sobre as sete rotas, com os cinco status e os três códigos de `409`; o claim não diz
   quantas rotas por status.
10. **F10 - valor esperado longe da asserção em dois pontos (observação)** - `apps/web/e2e/audit.spec.ts:752`
    compara com `LABELS.slice(0, 31)`, uma lista literal do começo do mesmo arquivo; em
    `apps/api/test/contracts.test.ts:987` e `:1007` "o corpo a que falta o campo" é a chave igual a
    `undefined`, como o `Handoff` declara (a ausência pela fronteira HTTP está na C10, na C29 e na C30).
11. **F11 - contagem de provas** - `checks.md` tem 115 linhas `Proof:` (112 checks, com duas na C5, na C37 e
    na C109), não 116.
12. **F12 - para quem consertar o F1** - o `Handoff` registra que o portão não reexecuta o web quando só
    `packages/contracts` muda (`turbo.json`). As provas deste relatório foram rodadas direto pelo runner, sem
    o cache do Turbo.

Level gaps: nenhum. Os claims que nomeiam status, rota ou forma de resposta são afirmados na fronteira HTTP
da API (C9 a C36, C38 a C65, C100 a C106), no navegador (C66 a C99, C107 a C111) ou na stack real (C112).
