# Privacidade - checks

Profile: standard
Plan: `.specs/features/privacidade/plan.md`

## Intent

111 checks em 9 slices (S0 de banco e contrato, as 7 do plano e S8 de montagem, regressão e stack) · 7 one-way doors · 1 open, of which 0 block (a pergunta 1 do plano é `blocks go-live`)

O plano foi aprovado como escrito em 2026-10-17. As duas perguntas foram respondidas: a exclusão a pedido anonimiza no lugar (door 1) e a retenção automática é um temporizador que começa desligado (doors 4 e 7). As Assumptions estão marcadas como confirmadas, as doors 1 a 7 são as AD-075 a AD-081 em `STATE.md`, a AD-051 passou a `superseded by AD-078`, e o `ROADMAP.md` registra a linha 13 e a questão de retenção. Uma correção de fato entrou no plano ao derivar os checks: a AC 25 citava rotas de responsável que não existem (o responsável entra pelo `POST` e pelo `PATCH` do aluno); a enumeração da AC 25 é a das rotas registradas, 21 (C25). O perfil é `standard`, como nas features anteriores: o que o `light` não pega (um membro enumerado sem prova e um teste que passa sob uma implementação errada) é exatamente o que uma anonimização erra em silêncio - um campo pessoal que ninguém limpou, ou um `DELETE` sem o `WHERE` do titular.

Oito coisas que o plano deixa em aberto e que este arquivo fixa, para a revisão aceitar ou trocar antes do Build:

1. **Precedência das recusas.** `403` por perfil vem antes de tudo (a guarda roda antes do handler); depois `404` (inexistente, `id` que não é `uuid`, ou anonimizado); depois `subject_not_inactive`; por último `subject_has_open_periods` ou `staff_user_linked`. Um aluno `active` com período em aberto recebe `subject_not_inactive` (C81, C89).
2. **`inactivated_at` vem do relógio do banco; a retenção compara com o relógio da API.** A escrita grava `now()` na mesma transação da mudança de `status` (C46). A execução da retenção passa o instante da API como parâmetro e escolhe `inactivated_at <= $agora - make_interval(years => N)`. As provas da retenção gravam `inactivated_at` por SQL e movem só o relógio da API (C49, C95, C96).
3. **Ordem das coleções da exportação**: `guardians` por `id` crescente; `consents` por `grantedAt` crescente e, no empate, `id`; `enrollments` por `startsAt` crescente e `id`; `payments` por `createdAt` crescente e `id`; `checkIns` por `day` crescente; `photos` por `version` crescente (C77; a linha "ordering" da `Observable` do plano).
4. **As chaves de `student` e de `staff` na exportação são todas presentes, com `null` quando não há valor.** A exportação não é a ficha cortada por perfil da AD-033: só `admin` a chama, e um campo ausente se confundiria com "o sistema não guarda". `student`: `id`, `name`, `cpf`, `birthDate`, `sex`, `email`, `phone`, `address`, `emergencyContactName`, `emergencyContactPhone`, `healthNotes`, `status`, `createdAt`, `inactivatedAt` (C2). `staff`: `id`, `name`, `cpf`, `position`, `department`, `hiredAt`, `phone`, `email`, `status`, `createdAt` (C30).
5. **`404` cobre também o `id` que não é `uuid`, e quem prova que a rota existe é o `403` com o `uuid` de ninguém**, como na `check-in` (C10, C24, C37).
6. **Na retenção, `skipped` conta só quem venceu e tem período em aberto.** Quem falhou pelo armazenamento conta numa linha de erro à parte, e quem outra instância já anonimizou no meio da execução não conta em nada (C55, C94).
7. **A corrida entre anonimização e envio de foto é decidida pela trava da linha do dono**, que o envio já usa (`photos.service.ts`): o envio que perde a corrida responde `404` e remove os objetos que gravou, como já faz quando perde para outro envio. O que se prova é o estado final: nenhuma linha e nenhum objeto (C23).
8. **A AC 47 (backfill) e a escrita de `inactivated_at` (AC 46) entram no mesmo commit da migração `0011`.** O `CHECK` da door 3 recusaria toda inativação feita pelo código de hoje; por isso os helpers de teste `setStatus` e `insertStudents` também mudam nesse commit (Coverage, "testes existentes que o Build edita").

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`, `playwright test <arquivo> -g`).

Arquivos novos do Build:
- `packages/database/test`: `privacy.test.ts`
- `packages/contracts/test`: `privacy.test.ts`
- `apps/api/test`: `privacy-export.test.ts`, `privacy-anonymize.test.ts`, `privacy-anonymized-routes.test.ts`, `staff-privacy.test.ts`, `privacy-settings.test.ts`, `privacy-retention.test.ts` e `support/privacy.ts`
- `apps/web/e2e`: `privacy-block.spec.ts`, `privacy-print.spec.ts`, `privacy-settings.spec.ts` e `support/privacy.ts`

Testes existentes que ganham casos ou são editados, como descrito abaixo da `Coverage`:
- `packages/database/test`: `students.test.ts`, `migrate.test.ts`, `photos.test.ts` (lista de tabelas)
- `apps/api/test`: `contracts.test.ts`, `openapi.test.ts`, `enrollment.test.ts`, `access.test.ts`, `env.test.ts`, `boot.test.ts`, `photos-purge.test.ts`, `support/students.ts`, `support/photos.ts` (`apiWith`)
- `apps/web/e2e`: `shell.spec.ts`, `audit.spec.ts`, `support/fake-api.ts`
- `tests/repo/repo.test.ts`, `tests/stack/compose.test.ts`

As regras de `features/auth-rbac/checks.md`, `auditoria`, `alunos`, `foto-pipeline`, `foto-captura`, `funcionarios`, `planos-matriculas`, `pagamentos` e `check-in` seguem valendo sem mudança:
- Postgres real por `testcontainers` e MinIO real (`startPhotoStack`), com o armazenamento que falha de `flakyStorage` (AD-012)
- sessão real de cada perfil (`stack.session(role)`, com 2FA já ativo para `admin`) e `Origin` igual a `WEB_ORIGIN`
- contagem de `audit_logs` como diferença (`auditCount`), a falha da gravação de trilha por `withAuditInsertFailing`
- dois pedidos soltos juntos por uma barreira (`releasedTogether`)
- relógio controlado só em `Date` (`clockAt`), com `NOON`, `BEFORE_TURN` e `AFTER_TURN` da `check-in`
- nas telas, a `FakeApi` que registra método, caminho, query e corpo

Regras próprias:

- A numeração acompanha o plano: **C1 a C67 provam a AC de mesmo número** (C33 é a AC 33). C68 a C75 (S0) são o que o plano deriva do banco e do contrato. C76 a C103 são o que as doors, a `Observable`, as decisões da Intent e as lições L-019, L-025 a L-033 pedem além do texto das AC, cada um dentro do slice a que pertence. C104 a C111 (S8) são a montagem, a regressão e a stack.
- "Titular completo" é um aluno criado por SQL (`support/privacy.ts`, `seedFullStudent`) com todos os campos da RF-05 preenchidos, `healthNotes` cifrado pela chave de teste, dois responsáveis, um consentimento de cada finalidade (um revogado), um período pago e vencido, um período cancelado, duas presenças e uma foto trocada uma vez (duas linhas de `photos`, seis objetos). "Titular vizinho" é outro titular completo no mesmo banco, que nenhuma ação do teste deve tocar.
- "Nada mudou" é o `to_jsonb` de todas as linhas de `students`, `guardians`, `consents`, `photos`, `enrollments`, `payments`, `check_ins`, `staff` e `privacy_settings`, a lista de chaves do bucket e a contagem de `audit_logs`, iguais antes e depois (`privacySnapshot`, L-028).
- O `diff` das linhas de trilha é conferido por igualdade exata (L-029). As chaves das respostas, por igualdade exata do conjunto.
- "Vencido pela retenção" é um aluno `inactive` com `inactivated_at` gravado por SQL. A execução da retenção nos testes é chamada pelo método `run()` da tarefa, com o relógio da API movido; o temporizador é provado à parte (C54, C93).

### S0 - O banco e o contrato · 14 files · 152 KB · ~4k

**C68** - Depois da `0011`, `students` tem `anonymized_at` e `inactivated_at` (`timestamptz`, anuláveis), e `cpf`, `birth_date` e `phone` aceitam nulo. Os dois `CHECK` da door 1 valem por SQL, um caso por campo:
- uma linha com `anonymized_at` preenchido e qualquer um dos nove campos pessoais preenchido falha com `23514` (`students_anonymized_clean`), nove casos
- o mesmo com `name` diferente de `Titular anonimizado`, com `status` `active` e com `inactivated_at` nulo falha com `23514`, três casos
- uma linha sem `anonymized_at` e sem `cpf`, sem `birth_date` ou sem `phone` falha com `23514` (`students_identified_complete`), três casos
- duas linhas anonimizadas, as duas com `cpf` nulo, coexistem, e `students_cpf_unique` continua recusando dois CPFs iguais identificados (door 1)
Proof: `pnpm --filter "./packages/database" exec vitest run test/privacy.test.ts -t "students_anonymized_and_identified_checks_one_case_per_field"`

**C69** - Depois da `0011`, `staff` tem `anonymized_at`, e `cpf`, `position`, `hired_at` e `phone` aceitam nulo. Os dois `CHECK` da door 2 valem por SQL, um caso por campo: os seis campos pessoais, `name`, `status` `active` e `user_id` preenchido, cada um, recusam a linha anonimizada com `23514`; a identificada sem `cpf`, `position`, `hired_at` ou `phone` falha com `23514`; duas anonimizadas sem CPF coexistem (door 2).
Proof: `pnpm --filter "./packages/database" exec vitest run test/privacy.test.ts -t "staff_anonymized_and_identified_checks_one_case_per_field"`

**C70** - `students_inactivated_at_matches` vale por SQL: `inactive` sem `inactivated_at`, `active` com ele e `suspended` com ele falham com `23514`; `inactive` com ele, `active` e `suspended` sem ele entram (door 3).
Proof: `pnpm --filter "./packages/database" exec vitest run test/privacy.test.ts -t "inactivated_at_present_iff_status_inactive"`

**C71** - Depois da `0011`, `privacy_settings` tem exatamente uma linha, com `id` `true`, `inactive_student_retention_years` nulo e `photo_version_retention_days` `30`. Um segundo `INSERT` falha com `23505`; `id` `false` falha com `23514`; anos `1` e `20` e nulo entram, `0` e `21` falham com `23514`; dias `1` e `365` entram, `0`, `366` e nulo falham (door 4, L-019).
Proof: `pnpm --filter "./packages/database" exec vitest run test/privacy.test.ts -t "privacy_settings_single_row_with_null_and_30_and_both_bounds"`

**C72** - A `0011` é a décima segunda entrada do diário. Aplicada sobre o banco já com as tabelas de `0001` a `0010` e com linhas de aluno `active`, `suspended` e `inactive` e de funcionário, ela:
- cria só `privacy_settings` e acrescenta só as colunas e as restrições das doors 1 a 4
- deixa as outras linhas como estavam, salvo `inactivated_at` dos alunos `inactive` (C47)
- não muda nada numa segunda execução

(Impact "stored data")
Proof: `pnpm --filter "./packages/database" exec vitest run test/privacy.test.ts -t "migration_0011_adds_only_privacy_shape_and_keeps_rows"`

**C73** - Em `packages/contracts`, o schema do `PUT /api/privacy-settings` aceita `{ inactiveStudentRetentionYears: null | 1 | 20, photoVersionRetentionDays: 1 | 365 }` e recusa, um caso por item: cada chave ausente (L-032), uma chave a mais, anos `0`, `21`, `1.5`, `"5"`, dias `0`, `366`, `1.5`, `null`, `"30"`, e o `path` de cada recusa é o nome da chave. Os schemas de resposta das duas exportações são estritos: recusam uma chave a mais no topo e em `student`/`staff`, e `formatVersion` diferente de `1` (door 5).
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/privacy.test.ts -t "settings_request_and_export_response_schemas_accept_and_reject"`

**C74** - `AUDIT_ACTIONS` tem 43 itens e termina, nesta ordem, com `student.exported`, `student.anonymized`, `staff.exported`, `staff.anonymized` e `privacy.settings_updated`; os 38 de antes seguem na mesma ordem (door 6).
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_five_privacy_actions_in_order"`

**C75** - Os três códigos novos chegam como `problem+json` que o `problemSchema` aceita, com `status` `409`: `subject_not_inactive`, `subject_has_open_periods` e `staff_user_linked` (Impact "contrato", AD-009).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "three_new_codes_are_problem_json_409"`

### S1 - Exportar os dados de um aluno · 18 files · 160 KB · ~6k

**C1** - `GET /api/students/:id/data-export` de `admin` sobre um titular completo responde `200` com `Content-Type` começando por `application/json`, `Content-Disposition` igual a `attachment; filename="aluno-<id>.json"`, `Cache-Control` igual a `no-store` e um corpo com exatamente as dez chaves `formatVersion` (`1`), `exportedAt`, `subject` (`student`), `student`, `guardians`, `consents`, `enrollments`, `payments`, `checkIns` e `photos` (AC 1).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "student_export_200_attachment_no_store_and_ten_keys"`

**C2** - `student` tem exatamente as catorze chaves da decisão 4 da Intent, com os valores gravados, `healthNotes` igual ao texto em claro que foi cifrado e `inactivatedAt` igual ao da linha; num aluno sem `sex`, `email`, `address`, contatos de emergência e saúde, essas chaves existem com `null` (AC 2).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "student_has_fourteen_keys_decrypted_health_notes_and_nulls_when_absent"`

**C3** - `guardians` traz os dois responsáveis do titular com `id`, `name`, `cpf`, `phone`, `relationship` e `createdAt`; `consents` traz as duas linhas, a revogada inclusive, cada uma com exatamente `purpose`, `termVersion`, `termText` (igual ao texto de `consent_terms`), `grantedBy`, `grantedAt` e `revokedAt` (AC 3).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "guardians_all_rows_and_consents_with_revoked_and_term_text"`

**C4** - `enrollments` traz os dois períodos, o cancelado inclusive, cada um com exatamente `id`, `planName` (o nome atual, depois de um `PATCH` no plano), `startsAt`, `endsAt`, `priceCents` e `cancelledAt`; `payments` traz a confirmação viva e uma desfeita, cada uma com exatamente `startsAt`, `createdAt` e `voidedAt`; `checkIns` traz as duas presenças com exatamente `day` e `checkedInAt`, sem chave de quem registrou (AC 4).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "enrollments_payments_and_check_ins_all_rows_without_who_registered"`

**C5** - `photos` traz duas entradas, a corrente e a guardada, cada uma com exatamente `version`, `isCurrent`, `createdAt`, `expiresAt` e `image`; `image` começa por `data:image/webp;base64,`, e os bytes decodificados são iguais, byte a byte, ao objeto `large` daquela foto no bucket (AC 5, door 5).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "photos_current_and_stored_with_large_bytes_equal_to_bucket_object"`

**C6** - A exportação de um aluno só com os campos obrigatórios devolve `guardians`, `consents`, `enrollments`, `payments`, `checkIns` e `photos` iguais a `[]`, as seis (AC 6).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "six_empty_collections_are_empty_arrays"`

**C7** - Depois do `200`, há exatamente uma linha nova em `audit_logs`: `action` `student.exported`, `entity` `student`, `entity_id` do aluno, `user_id` do `admin`, `ip` e `user_agent` da requisição e `diff` nulo (AC 7, door 6).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "export_writes_one_student_exported_row_with_actor_ip_user_agent_and_null_diff"`

**C8** - Com a gravação da trilha falhando (`withAuditInsertFailing`), a exportação responde `500` com `code` `internal_error`, e o corpo não contém o nome, o CPF nem o texto de saúde do aluno (AC 8, AD-057).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "audit_failure_is_500_without_any_student_data"`

**C9** - Com o armazenamento fora (`flakyStorage` recusando leitura), a exportação de um aluno com foto responde `503` com `code` `storage_unavailable`, e `audit_logs` fica com a mesma contagem (AC 9).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "storage_down_is_503_without_audit_row"`

**C10** - `reception`, `hr_finance` e `instructor` recebem `403` `forbidden` com o `uuid` de um aluno que existe e com o de ninguém, sem linha de trilha; sem sessão, `401` `unauthorized`; `admin` com o `uuid` de ninguém e com `abc` recebe `404` `not_found` (AC 10, decisão 5 da Intent).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "export_403_three_roles_401_anonymous_404_unknown_and_non_uuid"`

**C76** - A exportação não muda nada além da linha de trilha: `privacySnapshot` antes e depois é igual, com `audit_logs` uma linha a mais (Flow "Exportar").
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "export_changes_no_row_and_no_object"`

**C77** - Formato e ordem da exportação (door 5, decisão 3 da Intent):
- `exportedAt` termina em `Z` e fica entre T0 e T1 lidos antes e depois da requisição
- `birthDate`, `startsAt`, `endsAt` e `day` estão em `aaaa-mm-dd`; `createdAt`, `grantedAt`, `revokedAt`, `voidedAt`, `cancelledAt`, `checkedInAt`, `expiresAt` e `inactivatedAt` são ISO 8601 terminados em `Z`
- cada coleção na ordem da decisão 3, com as linhas inseridas na ordem inversa

Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "export_dates_instants_and_collection_order"`

**C78** - Duas exportações seguidas do mesmo aluno gravam duas linhas `student.exported`, sem janela de deduplicação (AD-057).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "two_exports_two_audit_rows"`

**C79** - A exportação do titular não traz nenhuma linha do titular vizinho: nenhum `id` de responsável, consentimento, período, pagamento, presença ou foto do vizinho aparece no arquivo.
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-export.test.ts -t "export_contains_no_row_of_another_student"`

### S2 - Anonimizar um aluno a pedido · 0 files · 0 KB · ~8k

**C11** - `POST /api/students/:id/anonymization` de `admin` sobre um titular completo `inactive`, sem período em aberto, responde `204` sem corpo, e a linha fica com `name` `Titular anonimizado`, `status` `inactive`, `anonymized_at` entre T0 e T1, os nove campos pessoais nulos, e `id`, `created_at` e `inactivated_at` iguais aos de antes (AC 11, door 1).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "anonymize_204_clears_nine_fields_keeps_id_created_and_inactivated"`

**C12** - Depois do `204`, `guardians` e `consents` não têm nenhuma linha do aluno (AC 12).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "anonymize_deletes_all_guardians_and_consents_of_the_student"`

**C13** - Depois do `204`, `photos` não tem linha do aluno e o bucket não tem nenhuma chave sob `photos/main/<id>/`: as seis chaves das duas fotos sumiram (AC 13).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "anonymize_deletes_current_and_stored_photos_and_their_six_objects"`

**C14** - Depois do `204`, o `to_jsonb` de cada linha de `enrollments`, `payments` e `check_ins` do aluno é igual ao de antes, e as contagens também (AC 14).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "anonymize_keeps_enrollments_payments_and_check_ins_identical"`

**C15** - Depois do `204`, `POST /api/students` de `reception` com o CPF que o anonimizado tinha responde `201` (AC 15, AD-030).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "cpf_of_anonymized_student_can_be_registered_again"`

**C16** - Depois do `204`, há exatamente uma linha nova em `audit_logs`: `student.anonymized`, `entity` `student`, `entity_id` do aluno, `user_id` do `admin`, `ip` e `user_agent` da requisição e `diff` nulo; as linhas de antes têm `to_jsonb` igual (AC 16, door 6).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "anonymize_writes_one_row_and_keeps_every_previous_audit_row"`

**C17** - Um aluno `active` e um `suspended`, sem período, recebem `409` `subject_not_inactive`, e `privacySnapshot` fica igual (AC 17).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "active_and_suspended_are_409_subject_not_inactive_and_nothing_changes"`

**C18** - Um aluno `inactive` com período não cancelado `active` hoje, e outro com período `scheduled`, recebem `409` `subject_has_open_periods`, os dois pagos, e `privacySnapshot` fica igual (AC 18).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "active_or_scheduled_period_is_409_open_periods_and_nothing_changes"`

**C19** - Um aluno `inactive` com período vencido `overdue`, e outro com período `pending`, recebem `409` `subject_has_open_periods`, e `privacySnapshot` fica igual (AC 19).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "overdue_or_pending_period_is_409_open_periods_and_nothing_changes"`

**C20** - Com o único período pago e `endsAt` igual a `2026-10-07`, a chamada com o relógio em `2026-10-08T02:59:59Z` responde `409` `subject_has_open_periods`, e a das `2026-10-08T03:00:00Z` responde `204` (AC 20, L-025).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "open_period_ends_at_the_sao_paulo_turn"`

**C21** - Com o armazenamento recusando a remoção de um objeto, a anonimização responde `503` `storage_unavailable`, e `students`, `guardians`, `consents`, `photos` e `audit_logs` ficam com o `to_jsonb` de antes; com o armazenamento de volta, a mesma chamada responde `204` e o bucket fica sem chave do aluno (AC 21, door 7).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "storage_failure_is_503_rolls_back_rows_and_retry_succeeds"`

**C22** - Em dez rodadas, duas anonimizações do mesmo aluno soltas juntas dão um `204` e um `404` `not_found`, com exatamente uma linha `student.anonymized` por rodada (AC 22).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "two_simultaneous_anonymizations_one_204_one_404_over_ten_rounds"`

**C23** - Em dez rodadas, uma anonimização e um `POST` de foto do mesmo aluno sem foto, soltos juntos, terminam sem linha de `photos` do aluno e sem chave sob `photos/main/<id>/`; a anonimização responde `204` e o envio `201` (se chegou antes, e a foto foi apagada pela anonimização) ou `404` (decisão 7 da Intent) (AC 23).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "anonymize_and_photo_upload_together_leave_no_row_and_no_object_over_ten_rounds"`

**C24** - `reception`, `hr_finance` e `instructor` recebem `403` `forbidden` com aluno que existe e com o `uuid` de ninguém, e `privacySnapshot` fica igual; sem sessão, `401`; `admin` com `uuid` de ninguém, com `abc` e com um aluno já anonimizado recebe `404` `not_found` (AC 24).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "anonymize_403_three_roles_401_anonymous_404_unknown_non_uuid_and_anonymized"`

**C80** - A anonimização do titular deixa o titular vizinho idêntico: o `to_jsonb` das linhas do vizinho em `students`, `guardians`, `consents`, `photos`, `enrollments`, `payments` e `check_ins`, e as seis chaves dele no bucket.
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "anonymize_leaves_another_student_rows_and_objects_identical"`

**C81** - Um aluno `active` com período `active` recebe `409` `subject_not_inactive`, não `subject_has_open_periods` (decisão 1 da Intent).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "not_inactive_comes_before_open_periods"`

**C82** - A decisão de período em aberto, um caso por linha, num aluno `inactive` com um período só (AC 18, AC 19, door 7):

| Período | Resposta |
| --- | --- |
| nenhum | `204` |
| `active`, pago | `409` |
| `scheduled`, pago | `409` |
| `expired`, pago | `204` |
| `expired`, não pago (`overdue`) | `409` |
| `cancelled`, não pago | `204` |
| `cancelled`, agendado | `204` |
| `expired`, pagamento desfeito (`overdue`) | `409` |

Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "open_period_decision_table_eight_rows"`

**C83** - Com `Origin` de outra origem, a anonimização responde `403` `csrf_rejected` e `privacySnapshot` fica igual (AD-020, L-033).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "foreign_origin_is_403_csrf_and_nothing_changes"`

**C84** - Uma URL assinada de foto emitida antes da anonimização, ainda dentro do `exp`, responde `404` depois dela (Impact "comportamento existente", AD-043).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "signed_photo_url_issued_before_is_404_after"`

### S3 - O aluno anonimizado some do uso diário · 10 files · 60 KB · ~5k

**C25** - Com o aluno anonimizado, cada uma das 21 rotas sob `/api/students/:id` responde `404` `not_found` a `admin`, e `privacySnapshot` fica igual depois de todas: `GET`, `PATCH` e `DELETE /api/students/:id`; `GET` e `POST .../consents` e `DELETE .../consents/:consentId`; `POST`, `PUT`, `GET` e `DELETE .../photo`; `GET` e `POST .../enrollments` e `DELETE .../enrollments/:enrollmentId`; `GET` e `POST .../payments` e `DELETE .../payments/:paymentId`; `GET .../check-in-status`; `GET` e `POST .../check-ins`; `GET .../data-export`; `POST .../anonymization`. Os ids das rotas aninhadas são os das linhas que o aluno tinha (AC 25). Table-driven sobre as 21.
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymized-routes.test.ts -t "every_student_route_is_404_for_anonymized_twenty_one_routes"`

**C26** - `GET /api/students` sem filtro, com `status=inactive` e com `q` igual a `Titular` não traz o anonimizado, e o `total` é um a menos que antes da anonimização (AC 26).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymized-routes.test.ts -t "student_list_omits_anonymized_in_items_and_total"`

**C27** - `GET /api/dashboard` de `admin` tem `students.inactive` um a menos depois da anonimização de um aluno `inactive`, e `active` e `suspended` iguais (AC 27).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymized-routes.test.ts -t "dashboard_student_counts_omit_anonymized"`

**C28** - `GET /api/check-ins` do dia de uma presença do aluno traz o item com `student.name` igual a `Titular anonimizado` e o `student.id` de antes, e `total` igual ao de antes (AC 28).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymized-routes.test.ts -t "check_in_report_keeps_presence_named_titular_anonimizado"`

**C29** - `GET /api/audit-logs?entityId=<id>` depois da anonimização traz todas as linhas de antes, com os mesmos `id`, e mais a de `student.anonymized` (AC 29).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymized-routes.test.ts -t "audit_log_keeps_every_row_of_the_anonymized_student"`

**C85** - Os `404` da C25 não gravam linha em `audit_logs`, e a busca por `q` com o telefone e com o CPF que o aluno tinha não o traz.
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymized-routes.test.ts -t "anonymized_404s_write_no_audit_and_old_phone_or_cpf_finds_nothing"`

### S4 - Exportar e anonimizar um funcionário · 6 files · 55 KB · ~6k

**C30** - `GET /api/staff/:id/data-export` de `admin` sobre um funcionário com usuário vinculado e foto trocada responde `200` com os cabeçalhos da C1 e `filename="funcionario-<id>.json"`, e um corpo com exatamente `formatVersion` (`1`), `exportedAt`, `subject` (`staff`), `staff` (as dez chaves da decisão 4 da Intent), `user` (exatamente `email` e `role` do vinculado) e `photos` (duas entradas no formato da C5); sem usuário, `user` é `null` (AC 30).
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "staff_export_200_six_keys_user_and_photos"`

**C31** - Depois do `200`, há uma linha `staff.exported` com o `entity_id` do funcionário e `diff` nulo, e nenhuma `staff.viewed`; com o armazenamento fora, `503` `storage_unavailable` sem linha (AC 31).
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "staff_export_writes_staff_exported_and_storage_down_is_503_without_row"`

**C32** - `POST /api/staff/:id/anonymization` de `admin` sobre um funcionário `inactive` sem usuário, com foto trocada, responde `204`; a linha fica com `name` `Titular anonimizado`, `anonymized_at` entre T0 e T1, os seis campos pessoais nulos; `photos` sem linha do funcionário e o bucket sem chave sob `photos/main/<id>/`; uma linha `staff.anonymized` com `diff` nulo (AC 32).
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "staff_anonymize_204_clears_six_fields_photos_objects_and_writes_row"`

**C33** - Um funcionário `active` recebe `409` `subject_not_inactive`; um `inactive` com usuário vinculado recebe `409` `staff_user_linked`; nos dois, `privacySnapshot` fica igual (AC 33).
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "staff_active_409_not_inactive_and_linked_user_409_staff_user_linked"`

**C34** - Com o armazenamento recusando a remoção, a anonimização de funcionário responde `503` `storage_unavailable`, e `staff`, `photos` e `audit_logs` ficam com o `to_jsonb` de antes (AC 34).
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "staff_storage_failure_is_503_and_rows_unchanged"`

**C35** - Com o funcionário anonimizado, as dez rotas (`GET`, `PATCH` e `DELETE /api/staff/:id`, `PUT` e `DELETE .../user`, `POST`, `PUT` e `DELETE .../photo`, `GET .../data-export`, `POST .../anonymization`) respondem `404` a `admin`, nenhuma grava `staff.viewed`, e `GET /api/staff` não o traz (AC 35). Table-driven sobre as 10.
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "every_staff_route_is_404_for_anonymized_ten_routes_and_list_omits_it"`

**C36** - Depois da anonimização, `POST /api/staff` de `hr_finance` com o CPF que o funcionário tinha responde `201` (AC 36).
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "cpf_of_anonymized_staff_can_be_registered_again"`

**C37** - Nas duas rotas, `hr_finance`, `reception` e `instructor` recebem `403` `forbidden` com funcionário que existe e com `uuid` de ninguém, sem linha e sem mudança; sem sessão, `401`; `admin` com `uuid` de ninguém e com `abc`, `404` (AC 37).
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "staff_privacy_403_three_roles_401_anonymous_404_unknown_and_non_uuid"`

**C86** - A anonimização do funcionário deixa um funcionário vizinho, com foto, idêntico em `staff`, `photos` e no bucket.
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "staff_anonymize_leaves_another_staff_identical"`

**C87** - Um funcionário `active` com usuário vinculado recebe `409` `subject_not_inactive`, não `staff_user_linked` (decisão 1 da Intent).
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "staff_not_inactive_comes_before_user_linked"`

**C88** - Com `Origin` de outra origem, a anonimização de funcionário responde `403` `csrf_rejected`, sem mudança (AD-020, L-033).
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "staff_foreign_origin_is_403_csrf_and_nothing_changes"`

### S5 - Configurar a retenção · 8 files · 44 KB · ~4k

**C38** - `GET /api/privacy-settings` de `admin` numa instalação recém-migrada responde `200` com exatamente `{ "inactiveStudentRetentionYears": null, "photoVersionRetentionDays": 30 }` (AC 38).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-settings.test.ts -t "fresh_settings_are_null_and_30"`

**C39** - `PUT` com `{ 5, 7 }` responde `200` com os mesmos valores, e o `GET` seguinte e a linha de `privacy_settings` também (AC 39).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-settings.test.ts -t "put_returns_and_persists_values"`

**C40** - `inactiveStudentRetentionYears`: `null`, `1` e `20` dão `200`; `0`, `21`, `1.5`, `"5"` e a chave ausente dão `422` `validation_failed` com exatamente um item em `errors` de `path` `inactiveStudentRetentionYears`, e a linha não muda (AC 40, L-019, L-032).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-settings.test.ts -t "years_accepts_null_1_20_and_rejects_five_values"`

**C41** - `photoVersionRetentionDays`: `1` e `365` dão `200`; `0`, `366`, `1.5`, `null`, `"30"` e a chave ausente dão `422` `validation_failed` com um item de `path` `photoVersionRetentionDays`, e a linha não muda (AC 41, L-019, L-032).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-settings.test.ts -t "days_accepts_1_365_and_rejects_six_values"`

**C42** - Um `PUT` que muda só os anos grava uma linha `privacy.settings_updated` com `entity` `privacy_settings`, `entity_id` nulo e `diff` igual a `{ "fields": ["inactiveStudentRetentionYears"], "values": { "inactiveStudentRetentionYears": { "from": null, "to": 5 } } }`; um que muda os dois traz os dois; um que repete os valores responde `200` sem linha (AC 42, door 6, L-029).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-settings.test.ts -t "settings_update_audits_only_changed_fields_and_no_row_when_unchanged"`

**C43** - Com `photoVersionRetentionDays` `7`, a troca de foto de um aluno e a de um funcionário gravam na anterior `expires_at` entre T0 e T1 mais 7 dias; mudado para `1`, uma troca seguinte grava mais 1 dia, e a versão guardada antes mantém o `expires_at` de 7 dias (AC 43, AD-047).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-settings.test.ts -t "photo_replace_reads_days_from_settings_for_student_and_staff_and_keeps_stored_expiry"`

**C44** - `loadEnv` com as variáveis obrigatórias devolve um objeto sem a chave `PHOTO_VERSION_RETENTION_DAYS`, e o schema de ambiente não a declara; a API iniciada como processo com `PHOTO_VERSION_RETENTION_DAYS=0` no ambiente sobe e responde `/health` `200` (a variável é ignorada); `.env.example` e `compose.yaml` não contêm a string `PHOTO_VERSION_RETENTION_DAYS` (AC 44; substitui C4, C29 e C64 da `foto-captura`).
Proof: `pnpm --filter "./apps/api" exec vitest run test/env.test.ts -t "env_schema_has_no_retention_days_key"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "retention_days_in_environment_is_ignored_and_api_starts"`
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "env_example_and_compose_do_not_mention_retention_days"`

**C45** - `reception`, `hr_finance` e `instructor` recebem `403` `forbidden` no `GET` e no `PUT`, e a linha não muda; sem sessão, `401` (AC 45).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-settings.test.ts -t "settings_403_three_roles_and_401_anonymous"`

**C89** - O `PUT` com uma chave a mais responde `422` `validation_failed` com o `path` da chave; com corpo ilegível, `400` `bad_request`; com `Origin` de outra origem, `403` `csrf_rejected`; nos três, a linha não muda (AD-021, AD-020, L-033).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-settings.test.ts -t "extra_key_422_unreadable_400_foreign_origin_403_and_row_unchanged"`

**C90** - Valores gravados por uma API são lidos por outra API iniciada depois, sobre o mesmo banco (door 4: a configuração é do banco, não do processo).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-settings.test.ts -t "settings_survive_api_restart"`

### S6 - Anonimização automática de inativos · 6 files · 72 KB · ~6k

**C46** - `DELETE /api/students/:id` de um aluno `active` grava `inactivated_at` entre T0 e T1; `PATCH` com `status` `active` o deixa nulo; `PATCH` com `status` `inactive` grava um instante novo, depois do primeiro; `PATCH` que muda só o telefone de um inativo não muda `inactivated_at`; `PATCH` com `status` `suspended` o deixa nulo (AC 46, door 3).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "inactivated_at_set_on_inactivation_cleared_on_leaving_and_kept_on_other_edits"`

**C47** - Aplicada sobre um banco com três alunos `inactive` em `0010`: o que foi inativado por `student.inactivated` e reativado e inativado de novo por `student.updated` recebe o `created_at` da linha mais recente; o inativado só por `student.updated` recebe o dessa linha; o que não tem linha recebe o `updated_at`; os `active` e `suspended` ficam com nulo (AC 47, door 3).
Proof: `pnpm --filter "./packages/database" exec vitest run test/privacy.test.ts -t "backfill_inactivated_at_from_latest_audit_row_or_updated_at"`

**C48** - Com `inactiveStudentRetentionYears` `null`, uma execução com o relógio 30 anos depois do `inactivated_at` de um aluno inativo sem período não muda nada (`privacySnapshot` igual) (AC 48).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "retention_off_anonymizes_nobody"`

**C49** - Com N igual a `2` e `inactivated_at` igual a `2024-10-07T15:00:00Z`, a execução com o relógio em `2026-10-07T14:59:59Z` não anonimiza, e a em `2026-10-07T15:00:00Z` anonimiza com o efeito das C11 a C14 (linha limpa, responsáveis, consentimentos, fotos e objetos apagados, períodos, pagamentos e presenças idênticos) (AC 49, L-019).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "anonymizes_exactly_at_n_years_with_full_effect"`

**C50** - A linha da anonimização pela retenção é `student.anonymized` com `user_id`, `ip`, `user_agent` e `diff` nulos (AC 50, AD-049).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "retention_audit_row_has_no_actor"`

**C51** - Com três vencidos, o do meio com período `overdue`, uma execução anonimiza os outros dois e deixa o do meio idêntico (AC 51).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "open_period_student_skipped_and_others_anonymized"`

**C52** - Com N `1`, um aluno `active` e um `suspended` com `created_at` e `updated_at` de 10 anos atrás não são anonimizados (AC 52).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "active_and_suspended_never_anonymized_by_retention"`

**C53** - Com dois vencidos com foto e o armazenamento recusando a remoção de um objeto só do primeiro, a execução deixa o primeiro idêntico, anonimiza o segundo, e a API responde `/health` em seguida (AC 53, door 7).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "storage_failure_on_one_student_keeps_it_and_anonymizes_the_next"`

**C54** - A API iniciada com um vencido anonimiza-o sem nenhuma requisição; com relógio falso, uma nova execução acontece a cada 60 minutos e nenhuma antes; uma execução que lança não impede a seguinte; depois de fechada a API, nenhuma execução acontece (AC 54, AD-050).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "retention_runs_on_startup_every_60_minutes_survives_failure_and_stops_on_close"`

**C55** - Uma execução que anonimiza um e pula um escreve, na saída padrão, exatamente uma linha JSON com `level` `info`, `msg` `retention applied`, `anonymized` `1` e `skipped` `1`, e essa linha não contém o nome, o CPF, nem o id de nenhum dos dois; uma execução sem vencidos não escreve linha; uma falha de armazenamento escreve uma linha com `level` `error` que não contém a mensagem do erro nem `photos/main` (AC 55, decisão 6 da Intent, L-010).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "one_log_line_with_counts_no_identifiers_and_error_line_without_details"`

**C91** - Com N `20`, o aluno inativado em `2006-10-07T15:00:00Z` é anonimizado na execução em `2026-10-07T15:00:00Z` e não na de um segundo antes (L-019: o outro limite do intervalo de anos).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "twenty_years_bound_anonymizes_exactly_at_twenty"`

**C92** - Com N `1` e `inactivated_at` `2024-02-29T15:00:00Z`, a execução em `2025-02-28T14:59:59Z` não anonimiza e a em `2025-02-28T15:00:00Z` anonimiza (Assumptions, "Conta dos N anos").
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "leap_day_plus_one_year_is_february_28"`

**C93** - O vencimento é calculado pelo relógio da API, não pelo do banco: com o relógio da API em 2040 e o do banco no dia real, um aluno com `inactivated_at` igual ao `now()` do banco e N `5` é anonimizado (decisão 2 da Intent).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "retention_compares_with_api_clock"`

**C94** - Duas APIs sobre o mesmo banco executam a retenção juntas, em dez rodadas: cada vencido é anonimizado uma vez, com uma linha `student.anonymized` só, e a soma de `anonymized` das duas linhas de log é igual ao número de vencidos (AD-050, decisão 6 da Intent).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "two_instances_anonymize_each_student_once_over_ten_rounds"`

**C95** - Uma execução da retenção e um `POST .../anonymization` do mesmo vencido, soltos juntos, em dez rodadas: uma linha `student.anonymized` só; o `POST` responde `204` ou `404`.
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "retention_and_request_together_anonymize_once_over_ten_rounds"`

### S7 - As telas · 16 files · 118 KB · ~12k

**C56** - Na ficha do aluno e na do funcionário, `admin` vê o bloco "Privacidade" com os três controles "Exportar dados", "Versão para impressão" e "Anonimizar"; `reception` e `instructor` (aluno) e `hr_finance` (aluno e funcionário) não veem o bloco (AC 56).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-block.spec.ts -g "privacy_block_only_for_admin_on_student_and_staff_ficha"`

**C57** - "Exportar dados" na ficha do aluno baixa um arquivo de nome `aluno-<id>.json`, com o corpo que a `FakeApi` entregou, e na do funcionário `funcionario-<id>.json` (AC 57).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-block.spec.ts -g "export_downloads_the_file_named_by_the_route"`

**C58** - "Anonimizar" abre um diálogo com o texto exato da AC 58 e os botões "Cancelar" e "Anonimizar"; "Cancelar" fecha sem nenhum `POST` registrado na `FakeApi`, na ficha do aluno e na do funcionário (AC 58).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-block.spec.ts -g "anonymize_dialog_text_and_cancel_sends_nothing"`

**C59** - Confirmado, com a API respondendo `204`, a tela vai a `/students` (ou `/staff`) e exibe "Titular anonimizado." (AC 59).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-block.spec.ts -g "after_204_goes_to_list_with_titular_anonimizado"`

**C60** - Confirmado, com a API respondendo cada um dos cinco desfechos, o diálogo exibe a mensagem da AC 60: `409 subject_not_inactive`, `409 subject_has_open_periods`, `409 staff_user_linked`, `503 storage_unavailable` e `500`, e fica aberto (AC 60). Table-driven sobre os cinco.
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-block.spec.ts -g "anonymize_failure_messages_by_code_five_cases"`

**C61** - A versão para impressão do aluno exibe as seções "Dados pessoais", "Responsáveis", "Consentimentos", "Matrículas", "Pagamentos", "Presenças" e "Fotos" com os valores da resposta, datas `aaaa-mm-dd` como `dd/MM/aaaa`, cada foto como `img` com `src` igual à `image`, "Nenhum registro." em cada seção vazia, e o botão "Imprimir", que chama `window.print` (AC 61).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-print.spec.ts -g "student_print_sections_dates_photos_empty_and_print_button"`

**C62** - Com a exportação respondendo `500`, a versão para impressão e o download exibem "Não foi possível exportar os dados." e "Tentar novamente", que refaz o pedido (AC 62).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-print.spec.ts -g "export_failure_shows_message_and_retry_on_print_and_download"`

**C63** - O link "Privacidade" do menu existe para `admin` e não para `reception`, `hr_finance` e `instructor`; esses três, abrindo `/privacy`, veem "Você não tem permissão para acessar esta página." sem pedido a `/api/privacy-settings` (AC 63).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "privacy_link_only_for_admin"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-settings.spec.ts -g "non_admin_sees_no_permission_without_any_request"`

**C64** - `/privacy` de `admin` exibe "Anonimizar alunos inativos há mais de" com "Desligado" quando a resposta traz `null` e com `5 anos` quando traz `5`, e "Guardar versões de foto por" com `30 dias`; salvar envia o `PUT` com os dois valores e exibe "Configurações salvas."; com `422`, exibe a `message` de cada item de `errors` junto do campo do `path` (AC 64).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-settings.spec.ts -g "settings_form_shows_off_or_years_saves_and_shows_field_errors"`

**C65** - Nome, termo de consentimento, texto de saúde e nome de plano com `<b>x</b>` aparecem na versão para impressão como texto literal, sem elemento `b` (AC 65, L-027).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-print.spec.ts -g "markup_in_export_shown_as_literal_text"`

**C66** - O filtro "Ação" de `/audit` e a coluna "Ação" mostram os cinco rótulos da AC 66 para as cinco ações novas (AC 66).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "five_privacy_action_labels"`

**C67** - Com `GET /api/privacy-settings` respondendo `500`, `/privacy` exibe "Não foi possível carregar a configuração." e "Tentar novamente", sem o formulário (AC 67).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-settings.spec.ts -g "settings_load_failure_shows_message_and_retry_without_form"`

**C96** - Como `reception` e `hr_finance`, abrir a ficha do aluno não registra na `FakeApi` nenhum pedido a `data-export` nem a `anonymization` (Observable, unauthorised).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-block.spec.ts -g "non_admin_ficha_requests_no_privacy_route"`

**C97** - A versão para impressão do funcionário exibe "Dados pessoais", "Usuário" (ou "Sem usuário vinculado.") e "Fotos" com os valores da resposta e o botão "Imprimir" (AC 61 para funcionário).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-print.spec.ts -g "staff_print_sections_user_and_photos"`

**C98** - Sem sessão, `/privacy` e as duas versões para impressão levam a `/login` (Observable; o `proxy.ts` que já existe).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-settings.spec.ts -g "anonymous_privacy_pages_redirect_to_login"`

**C99** - Em `/privacy`, escolher "Desligado" e salvar envia `inactiveStudentRetentionYears` igual a `null`; escrever `20` envia `20` (door 4).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-settings.spec.ts -g "off_sends_null_and_twenty_sends_twenty"`

**C100** - Enquanto o `POST` de anonimização não responde, "Anonimizar" do diálogo fica desabilitado, e um segundo clique não registra segundo `POST` na `FakeApi` (Observable, loading).
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/privacy-block.spec.ts -g "anonymize_button_disabled_while_pending_and_single_post"`

### S8 - Montagem, regressão e stack · 6 files · 120 KB · ~5k

**C101** - O `/api/openapi.json` documenta as seis rotas novas: as duas `data-export` e as duas `anonymization` sem corpo de requisição, `GET /api/privacy-settings` e `PUT /api/privacy-settings` com o corpo vindo do schema do contrato (AD-011); os caminhos documentados continuam iguais aos registrados.
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "privacy_paths_declared_with_settings_body_from_contract"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "paths_equal_registered_api_routes"`

**C102** - `admin` sem 2FA recebe `403` `two_factor_enrollment_required` nas seis rotas novas, e a lista de rotas bloqueadas as inclui (AD-022, Surface).
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C103** - As seis rotas novas não entram na lista das que respondem sem sessão, que segue com quatro (AD-022).
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "only_four_routes_answer_without_session"`

**C104** - O módulo de privacidade está montado no harness de `apps/api` (`startPhotoStack`): as seis rotas respondem `200` ou `204` a `admin` no mesmo processo, e a tarefa de retenção é registrada (startup config).
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-settings.test.ts -t "six_privacy_routes_and_retention_task_mounted_in_the_test_harness"`

**C105** - Na stack de pé, com a `0011` aplicada ao subir (`privacy_settings` lida do `psql` com `null` e `30`), sem `PHOTO_VERSION_RETENTION_DAYS` no ambiente do container `api`, e um `admin` com 2FA, pela origem do container `web`:
- cria um aluno com foto, inativa-o, exporta (`200`, anexo, `photos[0].image` decodificável) e o anonimiza (`204`)
- o `psql` lê a linha com `name` `Titular anonimizado` e `cpf` nulo, e o bucket da stack não tem chave sob `photos/main/<id>/`
- um aluno novo com o mesmo CPF recebe `201`
- `PUT /api/privacy-settings` com `{ null, 7 }` responde `200`
- `audit_logs` tem `student.exported`, `student.anonymized` e `privacy.settings_updated` com o `admin`
- a página `/privacy` com a sessão do `admin` traz "Guardar versões de foto por"

(AC 1, AC 11, AC 13, AC 15, AC 39, AC 44, AC 64, Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "student_exported_and_anonymized_through_web_with_cpf_reused_settings_saved_and_audit_rows"`

**C106** - No caso da stack da `foto-captura`, a troca de foto sem a variável no ambiente grava `expires_at` a 30 dias, lidos de `privacy_settings`, e o resto do caso segue igual (substitui a parte "sem `PHOTO_VERSION_RETENTION_DAYS`" de C65 da `foto-captura`).
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "photo_replaced_through_web_then_expired_version_purged_on_api_restart"`

**C107** - A expiração das versões guardadas continua: o expurgo da `foto-captura` passa com a API montada sem a variável, e `retention_days_7_1_and_365_set_expiry_only_for_later_replaces` passa a configurar os dias por `privacy_settings` com a mesma asserção (substitui C28 e C6 da `foto-captura` na parte "sem a variável").
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "retention_days_7_1_and_365_set_expiry_only_for_later_replaces"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "purge_removes_expired_rows_and_their_objects"`

**C108** - A inativação que já existia continua: `DELETE /api/students/:id` responde `204`, é idempotente e grava `student.inactivated`, pelas provas existentes da `alunos`, agora com `inactivated_at` preenchido.
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts`
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-retention.test.ts -t "inactivated_at_set_on_inactivation_cleared_on_leaving_and_kept_on_other_edits"`

**C109** - A restrição de `status` de `students` da `alunos` continua valendo com a door 3: a prova existente aceita os três valores (com `inactivated_at` coerente) e recusa outro.
Proof: `pnpm --filter "./packages/database" exec vitest run test/students.test.ts -t "status_accepts_three_values_and_rejects_others"`

**C110** - O schema de resposta da ficha de aluno e de funcionário não muda: os testes de contrato existentes passam sem edição (Impact "contrato").
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "students_bodies_match_contract_schemas"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "staff_bodies_match_contract_schemas_and_new_codes_are_known"`

**C111** - Os três novos códigos e as cinco ações estão no OpenAPI e no contrato sem quebrar a lista de tabelas do banco: `photos.test.ts` do banco ganha `privacy_settings` na lista de tabelas, como cada migração anterior fez.
Proof: `pnpm --filter "./packages/database" exec vitest run test/photos.test.ts`

## Coverage

Uma linha por rota da `Surface`, com os status como membros. Depois vêm as doors, as entidades de `Relations`, os conjuntos enumerados nos critérios, nas `Assumptions` e na `Observable`, e as montagens.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/students/:id/data-export` statuses (6) | 200 C1 · 401 C10 · 403 `forbidden` C10 · 403 `two_factor_enrollment_required` C102 · 404 C10, C25 · 503 C9 | - |
| `POST /api/students/:id/anonymization` statuses (9) | 204 C11 · 401 C24 · 403 `forbidden` C24 · 403 `csrf_rejected` C83 · 403 `two_factor_enrollment_required` C102 · 404 C24, C22 · 409 `subject_not_inactive` C17, C75 · 409 `subject_has_open_periods` C18, C19, C75 · 503 C21 | - |
| `GET /api/staff/:id/data-export` statuses (6) | 200 C30 · 401 C37 · 403 `forbidden` C37 · 403 `two_factor_enrollment_required` C102 · 404 C37, C35 · 503 C31 | - |
| `POST /api/staff/:id/anonymization` statuses (9) | 204 C32 · 401 C37 · 403 `forbidden` C37 · 403 `csrf_rejected` C88 · 403 `two_factor_enrollment_required` C102 · 404 C37, C35 · 409 `subject_not_inactive` C33, C75 · 409 `staff_user_linked` C33, C75 · 503 C34 | - |
| `GET /api/privacy-settings` statuses (4) | 200 C38 · 401 C45 · 403 `forbidden` C45 · 403 `two_factor_enrollment_required` C102 | - |
| `PUT /api/privacy-settings` statuses (7) | 200 C39 · 400 C89 · 401 C45 · 403 `forbidden` C45 · 403 `csrf_rejected` C89 · 403 `two_factor_enrollment_required` C102 · 422 C40, C41, C89 | - |
| quem chama as seis rotas, por perfil (4) | `admin` C1, C11, C30, C32, C38, C39 · `reception` C10, C24, C37, C45 · `hr_finance` C10, C24, C37, C45 · `instructor` C10, C24, C37, C45 | - |
| forma literal da door 1 (8) | marca e campos anuláveis C68 · `students_anonymized_clean` C68 · `students_identified_complete` C68 · CPF livre C15, C68 · apaga fotos, consentimentos e responsáveis C12, C13 · mantém períodos, pagamentos e presenças C14 · nenhuma rota limpa a marca C25, C101 · toda leitura filtra C25, C26, C27, C35 | - |
| forma literal da door 2 (5) | marca e campos anuláveis C69 · `staff_anonymized_clean` com `user_id` nulo C69 · `staff_identified_complete` C69 · recusa com usuário vinculado C33 · CPF livre C36 | - |
| forma literal da door 3 (5) | coluna e `CHECK` C70 · grava na inativação C46 · limpa ao sair C46 · recomeça na reinativação C46 · backfill C47 | - |
| forma literal da door 4 (7) | linha única C71 · padrão `null` e `30` C71, C38 · anos 1 a 20 C71, C40 · dias 1 a 365 C71, C41 · variável fora C44 · troca lê na hora C43 · guardadas mantêm o prazo C43 | - |
| forma literal da door 5 (7) | três cabeçalhos C1, C30 · `formatVersion` `1` C1, C73 · coleções sempre presentes C6 · camelCase e datas C77 · instantes em UTC C77 · foto `large` em `data:` C5 · versão para impressão C61, C97 | - |
| forma literal da door 6 (6) | cinco ações em ordem C74 · `student.exported` C7 · `student.anonymized` C16 · `staff.exported` C31 · `staff.anonymized` C32 · `privacy.settings_updated` com só o que mudou C42; `NO_ACTOR` na retenção C50 | - |
| forma literal da door 7 (6) | trava e confere antes de apagar C17, C18, C82 · objetos antes das linhas, falha desfaz C21, C34 · repetir termina C21 · temporizador na subida e a cada 60 min C54 · um titular por transação C51, C53 · falha não impede os seguintes C53 | - |
| Relations: o que o aluno anonimizado perde e mantém (6 entities) | `guardians` apagados C12 · `consents` apagados C12 · `photos` apagadas C13 · `enrollments` mantidos C14 · `payments` mantidos C14 · `check_ins` mantidos C14 | - |
| Relations: `staff` perde `photos`, e `privacy_settings` única (2) | `staff`-`photos` C32 · `privacy_settings` C71 | - |
| chaves do topo da exportação de aluno (10) | `formatVersion` C1 · `exportedAt` C1, C77 · `subject` C1 · `student` C2 · `guardians` C3 · `consents` C3 · `enrollments` C4 · `payments` C4 · `checkIns` C4 · `photos` C5 | - |
| chaves de `student` na exportação (14) | C2, table-driven over all 14 | - |
| chaves do topo da exportação de funcionário (6) | `formatVersion` C30 · `exportedAt` C30 · `subject` C30 · `staff` C30 · `user` C30 · `photos` C30 | - |
| chaves de `staff` na exportação (10) | C30, table-driven over all 10 | - |
| campos pessoais limpos do aluno (9) | C11, C68, table-driven over all 9 | - |
| campos pessoais limpos do funcionário (6) | C32, C69, table-driven over all 6 | - |
| linhas da decisão de período em aberto (8) | C82, table-driven over all 8 | - |
| situações de aluno na anonimização (3) | `inactive` C11 · `active` C17 · `suspended` C17 | - |
| precedência das recusas (3) | `403` antes de `404` C10, C24, C37 · `not_inactive` antes de `open_periods` C81 · `not_inactive` antes de `user_linked` C87 | - |
| virada do dia em São Paulo, por limite que depende de hoje (2) | período em aberto às `02:59:59Z` C20 · às `03:00:00Z` C20 | - |
| limites da retenção em anos (6 edges) | N `2` um segundo antes C49 · N `2` no instante C49 · N `20` um segundo antes C91 · N `20` no instante C91 · 29 de fevereiro C92 · relógio da API C93 | - |
| valores de anos no `PUT` (9) | `null` C40 · `1` C40 · `20` C40 · `0` C40 · `21` C40 · `1.5` C40 · `"5"` C40 · ausente C40 · chave a mais C89 | - |
| valores de dias no `PUT` (8) | `1` C41 · `365` C41 · `0` C41 · `366` C41 · `1.5` C41 · `null` C41 · `"30"` C41 · ausente C41 | - |
| rotas de aluno que respondem `404` ao anonimizado (21) | C25, table-driven over all 21 | - |
| rotas de funcionário que respondem `404` ao anonimizado (10) | C35, table-driven over all 10 | - |
| leitores que deixam de ver o anonimizado (4) | lista de alunos C26 · painel C27 · lista de funcionários C35 · busca do check-in, pela lista C26 | - |
| leitores que continuam vendo, sem nome (2) | relatório de presenças C28 · trilha C29 | - |
| titular vizinho intocado (3) | exportação C79 · anonimização de aluno C80 · anonimização de funcionário C86 | - |
| corridas (4) | duas anonimizações C22 · anonimização e foto C23 · duas instâncias da retenção C94 · retenção e pedido C95 | - |
| falhas de dependência (5) | trilha na exportação C8 · armazenamento na exportação C9, C31 · armazenamento na anonimização C21, C34 · armazenamento na retenção C53 · execução que lança C54 | - |
| rótulos das ações em `/audit` (5) | C66, table-driven over all 5 | - |
| desfechos da anonimização na tela (6) | `204` C59 · `subject_not_inactive` C60 · `subject_has_open_periods` C60 · `staff_user_linked` C60 · `storage_unavailable` C60 · outro C60 | - |
| estados do bloco "Privacidade" na `Observable` (5) | erro C60, C62 · sem permissão C56, C96 · confirma a destrutiva C58 · carregando C100 · vazio n/a no plano, sem prova a dever C56 | - |
| estados da versão para impressão (4) | seções e vazio C61, C97 · erro C62 · sem permissão C10 · sem sessão C98 | - |
| estados de `/privacy` (5) | desligado C64 · erro de validação C64 · erro de carga C67 · sem permissão C63 · sem sessão C98 | - |
| texto livre com marcação na impressão (4) | nome C65 · termo C65 · saúde C65 · plano C65 | - |
| checks da `foto-captura` substituídos (6) | C4 por C44 · C6 "sem a variável" por C107 · C28 por C43, C107 · C29 por C44 · C64 por C44 · C65 "sem a variável" por C106 | - |
| startup config: módulo de privacidade montado (2 assemblies) | harness de `apps/api` C104 · stack do compose C105 | - |
| startup config: tarefa de retenção registrada (2 assemblies) | harness de `apps/api` C54, C104 · stack do compose C105 (a API sobe e o temporizador roda; a execução com vencido é provada só no harness) | - |
| startup config: migração `0011` aplicada (2 assemblies) | `migrate` do harness de teste C72 · papel de migração do `compose.yaml` C105 | - |
| startup config: variável ausente (3 places) | schema de `env.ts` C44 · `.env.example` C44 · `compose.yaml` C44, C105 | - |

- Claims naming a status code, route or response shape:
  - C1 a C55, C76 a C95 e C101 a C104 cruzam a fronteira HTTP da API montada por `startPhotoStack` (as que mexem em foto) ou `startStack`
  - C56 a C67 e C96 a C100 cruzam a fronteira do web no navegador, sobre o build de produção
  - C105 e C106 cruzam as duas no processo real da stack
  - C68 a C72, C47, C109 e C111 provam o banco por SQL, e a fronteira deles é a C11, a C15, a C32, a C38 e a C46
  - C73 prova os schemas no próprio nível, e a fronteira dele é a C1, a C30, a C39 a C41 e a C89
- Linhas de `Impact` e onde cada uma é provada:
  - titular, anonimizar e período em aberto: C11 a C19, C82
  - `status` `inactive` conta tempo: C46, C49
  - CPF único entre identificados: C15, C36, C68
  - AD-051 `superseded`: C44, C107; AD-036, AD-038 e AD-040 seguem nas rotas existentes, e a anonimização é o único caminho que apaga: C12, C13, C25
  - seis rotas e três códigos: C101, C75; `storage_unavailable` em duas rotas: C9, C21; `AUDIT_ACTIONS` em 43: C74; schemas de ficha sem mudança: C110
  - rotas existentes com `404`, listas e painel: C25 a C27, C35
  - relatório e trilha: C28, C29; `GET /api/photo-files`: C84
  - menu e fichas: C56, C63
  - checks da `foto-captura` substituídos: a linha de `Coverage` acima
  - `0011`: C72, C47; variável fora: C44; backups: Out of scope do plano, sem check
  - a linha de `.specs` já está feita (AD-075 a AD-081, AD-051, `ROADMAP.md`) e não é check
- `Assumptions` e onde cada uma landou:
  - anonimizar no lugar: C11 a C14; retenção desligada por padrão: C38, C48
  - funcionário é titular: C30 a C37
  - só `admin`: C10, C24, C37, C45, C56, C63
  - PDF pela impressão: C61, C97
  - todas as fotos com a `large`: C5
  - período não pago impede: C19, C82
  - consentimentos e responsáveis apagados: C12
  - nome literal: C11, C32, C28
  - limite de 1 a 20 anos: C40, C71
  - conta dos N anos: C92, C93
  - busca do check-in: C26
  - Não vira check, por decisão do plano: a meta "atendidas no prazo: 100%"
- **Testes existentes que o Build edita** porque o claim deles muda pelo plano. O nome fica, salvo onde dito, e nenhuma asserção é afrouxada:
  - `support/students.ts`: `setStatus` grava `inactivated_at = now()` quando o status vai a `inactive` e `null` nos outros; `insertStudents` grava `inactivated_at` quando a linha nasce `inactive` (decisão 8 da Intent). As 33 chamadas existentes não mudam
  - `status_accepts_three_values_and_rejects_others` de `packages/database/test/students.test.ts`: o `update` que põe `inactive` grava também `inactivated_at` (C109)
  - `retention_days_default_30_bounds_1_and_365_and_five_rejected_values` de `env.test.ts`: sai, trocado por `env_schema_has_no_retention_days_key` (C44)
  - `retention_days_rejected_exits_1_naming_var_without_values` de `boot.test.ts`: sai, trocado por `retention_days_in_environment_is_ignored_and_api_starts` (C44)
  - `env_example_documents_optional_retention_days_commented_with_default` de `repo.test.ts`: sai, trocado por `env_example_and_compose_do_not_mention_retention_days` (C44)
  - `retention_days_7_1_and_365_set_expiry_only_for_later_replaces` de `photos-purge.test.ts`: configura os dias por `privacy_settings` em vez de `apiWith(..., { PHOTO_VERSION_RETENTION_DAYS })`, com a mesma asserção (C107); `apiWith` deixa de repassar a variável
  - `photo_replaced_through_web_then_expired_version_purged_on_api_restart` de `compose.test.ts`: a menção à variável sai e a asserção de 30 dias fica (C106)
  - `admin_without_2fa_gets_403_everywhere_else` de `enrollment.test.ts`: a lista escrita à mão ganha as seis rotas (C102)
  - `photos.test.ts` do banco: `privacy_settings` na lista de tabelas (C111)
  - `migrate.test.ts`: o que conta entradas do diário passa a doze, se contar

  No mesmo commit dos testes da variável, `features/foto-captura/checks.md` ganha uma nota, abaixo da sua `Coverage`, apontando C4, C6 (parte), C28, C29, C64 e C65 (parte) para C44, C106 e C107 daqui. Nenhum check de lá é editado.
- **Provas existentes que seguem como estão e passam a valer também aqui**: `only_four_routes_answer_without_session` (C103), `paths_equal_registered_api_routes` (C101), `students_bodies_match_contract_schemas` e `staff_bodies_match_contract_schemas_and_new_codes_are_known` (C110), `purge_removes_expired_rows_and_their_objects` (C107), as de `students-audit.test.ts` (C108).
- Suítes de tela que abrem a ficha como `admin` sem conhecer o bloco novo (`students.spec.ts`, `staff.spec.ts`, `student-payments.spec.ts`): o bloco "Privacidade" não pede nada ao abrir (só ao clicar), então nenhuma delas deve mudar. Se alguma reprovar por um botão "Anonimizar" a mais num seletor por texto, o conserto é estreitar o seletor daquele teste, nunca mudar a asserção.
- Além do texto das AC, derivado das doors, da `Observable`, da Intent ou das lições, e que o Build pode discutir antes de fechar: C76 a C100 (cada um diz de onde vem).
- Decisões que o plano deixa fora de AC e que nenhum check afirma:
  - a forma dos itens de `guardians` além das seis chaves (o `relationship` em inglês, como no banco)
  - quantas consultas cada rota faz ao banco e se a exportação lê o bucket em paralelo
  - a ordem dos alunos numa execução da retenção
  - o texto exato do log de erro da retenção além do `level` e do que ele não contém
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md`, `alunos`, `foto-captura`, `funcionarios`, `planos-matriculas`, `pagamentos` e `check-in` seguem valendo e respondem as duas perguntas para quase tudo que esta feature reaproveita:
- a rota que decide, alcançada por HTTP, com o corte por perfil
- a restrição do banco provada por SQL, um caso por coluna
- a conta pura que depende do dia, nos dois lados da virada
- a tarefa periódica no temporizador (`photos-purge.test.ts`)
- a leitura que grava na trilha na mesma transação (`staff-read.test.ts`)
- a tela contra a `FakeApi`
- a stack lida por `psql`

Uma situação nova fica sem resposta e ganha linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Operação destrutiva que apaga e limpa várias tabelas e objetos de um dono, sob condições, alcançada por uma rota e por uma tarefa periódica (a anonimização) | na fronteira da rota: cada tabela e o bucket conferidos depois do sucesso, **e** um vizinho conferido idêntico, **e** cada condição de recusa com tudo idêntico, **e** cada ponto de falha de dependência com tudo idêntico e a repetição terminando; na tarefa: o mesmo efeito conferido tabela por tabela num caso, cada limite do prazo nos dois lados, e a corrida com a rota e com outra instância | as 9 tabelas e o bucket do `privacySnapshot` em cada recusa e falha (C17 a C19, C21, C24, C33, C34, C83, C88); o vizinho em C80 e C86; as 8 linhas da decisão de período (C82); o efeito completo também pela tarefa (C49). Uma prova que confere só a ficha limpa não pega um `DELETE` sem `WHERE` nem um responsável esquecido, e só o vizinho e a lista de tabelas pegam |

Evidence (o código novo ainda não existe; a contagem vem do plano e do que ele reaproveita, em `apps/api/src/photos/photos.service.ts`, `photo-purge.ts`, `apps/api/src/staff` e `packages/contracts/src/plans.ts`):

- anonimização de aluno: 1 trava, 1 conferência de marca, 1 de `status`, 1 de período em aberto com 2 contas e 4 valores, 3 tabelas apagadas, 9 campos limpos, 1 laço de objetos, 1 recusa de armazenamento (C11 a C24, C80 a C84) -> decide, com três dependências reais (banco, bucket, trilha)
- anonimização de funcionário: 1 trava, 3 conferências, 1 tabela apagada, 6 campos (C32 a C37, C86 a C88) -> decide
- exportação: 2 rotas, 6 e 2 coleções com ordem, 1 decifra, 1 leitura de bucket por foto, 1 trilha (C1 a C10, C30, C31, C76 a C79) -> decide pouco (montagem com ordem), mas carrega o contrato que sai do sistema
- configuração: 2 campos com 2 limites cada, 1 trilha condicional (C38 a C45, C89, C90) -> decide
- retenção: 1 desligamento, 1 limite de tempo, 1 laço com 3 desfechos por aluno (anonimizado, pulado, falhou), 1 log (C48 a C55, C91 a C95) -> decide
- leitores existentes: 21 rotas de aluno, 10 de funcionário, 2 listas e 1 painel ganham o filtro da marca (C25 a C27, C35) -> decide, uma condição repetida em muitos lugares, por isso table-driven
- banco: 3 tabelas alteradas, 6 `CHECK`, 1 tabela nova, 1 backfill (C68 a C72, C47) -> decide
- telas: 1 bloco em duas fichas, 2 páginas de impressão, 1 página de configuração, 6 desfechos (C56 a C67, C96 a C100) -> decide, na tela
- closest analogue in the repo:
  - `apps/api/test/photos-purge.test.ts` (a tarefa periódica, a falha de armazenamento e as duas instâncias)
  - `apps/api/test/photos-delete.test.ts` (linhas e objetos de um dono)
  - `apps/api/test/staff-read.test.ts` (a leitura auditada, com a falha da trilha dando `500` sem dado)

  Nenhum deles apaga em mais de uma tabela nem tem um vizinho a conferir, e por isso a linha nova.

Cost: 1 arquivo novo de teste no banco e 1 no contrato, 6 de API (uma subida de Postgres e MinIO cada), 3 de tela com o apoio deles e 1 caso na stack. Sem a linha acima, a anonimização seria provada pela ficha limpa e pelo bucket vazio do titular, e um `DELETE FROM guardians` sem `WHERE` passaria. A linha fica neste arquivo. Escrevê-la nas diretrizes do repositório alcança todo agente futuro e pede o aval do usuário, então o Build roda sob ela e deixa os arquivos de diretriz como estão.

## Swept

- validation: C40, C41, C73, C89 - o corpo do `PUT` é a única entrada; os `id` são validados como `uuid` (C10, C24, C37), e as rotas de exportação e anonimização não leem corpo
- failure modes: C17 a C19, C33, C81, C82, C87 (as recusas de estado), C62, C67 (a API que não responde à tela)
- idempotency: C22, C24 (repetir a anonimização dá `404`), C42 (repetir a configuração não grava trilha), C78 (exportar de novo grava de novo, por decisão da AD-057)
- authorization: C10, C24, C37, C45, C56, C63, C96, C102, C103; existing - a guarda global (AD-022) e a checagem de origem (AD-020), exercitadas aqui pelas C83, C88 e C89, que enviam a origem proibida, e pela C102, que chama sem 2FA
- concurrency: C22, C23, C94, C95 - a trava da linha do dono decide anonimização contra anonimização, contra envio de foto e contra a retenção; duas instâncias da retenção
- data lifecycle: C11 a C15, C32, C36, C46 a C55, C91, C92 - anonimização a pedido e por prazo, o CPF liberado, o instante de inativação com backfill; a retenção dos backups fica com `operacao`
- dependency failure: C8, C9, C21, C31, C34, C53, C54 - a trilha e o armazenamento, cada um com tudo desfeito; existing - banco fora cai no `500 internal_error` do `ProblemFilter`, pela prova `unhandled_500_hides_exception` da `fundacao`, que exercita o filtro e não estas rotas
- state transitions: C46 (`inactive` grava e limpa o instante), C11 e C32 (identificado para anonimizado, sem volta: C25, C35), C20 (período que deixa de estar em aberto na virada)
- observability: C7, C16, C31, C32, C42, C50 (a trilha de cada exportação, anonimização e configuração), C55 (a linha de log da retenção, sem identificador)

## Handoff

- Tamanhos medidos com `wc -c` no que já existe. O que será escrito é estimado em KB de código e teste novos, divididos por quatro.
- **Documentos que o builder lê**: `checks.md` (77 KB), `plan.md` (48 KB) e o trecho de `STATE.md` que importa (~12 KB), 137 KB = 34k.
- **Arquivos existentes**:
  - S0 = 152 KB:
    - `packages/database`: `schema.ts` 16,4, `_journal.json` 1,6; testes `students.test.ts` 4,9, `staff.test.ts` 17,8, `migrate.test.ts` 4,0 e, como molde, `check-ins.test.ts` 15,6
    - `contracts/src`: `audit.ts` 3,6, `students.ts` 10,8, `staff.ts` 4,2, `plans.ts` 6,9, `payments.ts` 4,1
    - `students.service.ts` 15,2 e `staff.service.ts` 10,3 (a escrita de `inactivated_at` entra com a migração, decisão 8), `support/students.ts` 4,2, o trecho de `contracts.test.ts` (~20)
  - S1 a S3 = 160 KB:
    - código: `students.controller.ts` 4,3, `photos.service.ts` 14,1, `consents.service.ts` 8,6, `student-enrollments` 9,0, `student-payments` 11,4, `check-ins` 11,8, `dashboard.service.ts` 5,4, `audit.ts` 2,9, `access.ts` 5,4, `crypto.ts` 2,4, `app.module.ts` 6,8
    - testes e apoio: `support/photos.ts` 17,2, `support/stack.ts` 3,9, `support/consents.ts` 5,6, `support/plans.ts` 7,8, `support/payments.ts` 4,0, `support/check-ins.ts` 3,7, `support/audit.ts` 1,8, `staff-read.test.ts` 11,6 e `payments-write.test.ts` 20,8 como molde
  - S4 a S6 = 116 KB: `staff.controller.ts` 3,9, `photo-purge.ts` 1,6, `env.ts` 2,2, `support/staff.ts` 9,2, `photos-purge.test.ts` 15,2, `env.test.ts` 1,3, `boot.test.ts` 14,6, `repo.test.ts` 9,6, `compose.yaml` 3,9, `.env.example` 2,7, `enrollment.test.ts` 5,0, `openapi.test.ts` 18,8, `access.test.ts` 5,6, e de novo `photos.service.ts` 14,1 e `app.module.ts` 6,8 se o batch for outro
  - S7 = 118 KB: a ficha do aluno 7,8 e a do funcionário 6,2, `payments-block.tsx` 6,8 como molde do bloco, `shell.tsx` 2,4, `lib/api.ts` 2,3, `lib/audit.ts` (~3), `proxy.ts` 1,7, `e2e/support/fake-api.ts` 9,9, `support/staff.ts` 6,6, `shell.spec.ts` 6,4, `student-payments.spec.ts` 14,1 como molde, trechos de `staff.spec.ts`, `students.spec.ts` e `audit.spec.ts` (~45)
  - S8 = 71 KB: `compose.test.ts` 67,1 e `tests/stack/support.ts` 4,2
  - Total 617 KB = 154k
- **Código novo**:

  | Slice | Estimativa |
  | --- | --- |
  | S0 | 4k |
  | S1 | 6k |
  | S2 | 8k |
  | S3 | 5k |
  | S4 | 6k |
  | S5 | 4k |
  | S6 | 6k |
  | S7 | 12k |
  | S8 | 5k |
  | **Total** | **56k** |

- Soma corrida, com os documentos em cada batch:
  - S0 = 38k lidos + 4k, em `packages/database`, `packages/contracts` e a escrita de `inactivated_at` em `apps/api`
  - S1 a S3 entram nas rotas de aluno aos 42k + 40k + 19k = 101k; com os documentos, 135k
  - S4 a S6 entram em funcionário, configuração e retenção aos 101k + 29k + 16k = 146k; com os documentos, 180k
  - S7 e S8 fecham nas telas e na stack aos 146k + 47k + 17k = 210k; com os documentos, **210k + 34k = 244k**, acima do orçamento de 150k (o padrão, sem declaração em `AGENTS.md`)
- Corte proposto onde a superfície muda:
  - **batch A**: S0 a S3 (C1 a C29, C68 a C85): banco, contrato, exportação, anonimização e os leitores de aluno; 101k + 34k = 135k
  - **batch B**: S4 a S6 e as provas de montagem de API (C30 a C55, C86 a C95, C101 a C104, C107 a C111): funcionário, configuração, retenção, variável e regressão; 29k + 16k lidos e escritos, mais o diff do batch A (~30k) e 34k de documentos = 109k
  - **batch C**: S7 e o restante de S8 (C56 a C67, C96 a C100, C105, C106): telas e stack; 47k + 17k, mais o diff de A e B (~35k) e 34k de documentos = 133k
- Mechanism: **handoff em três batches** (A, B e C acima, sequenciais e só na verde), escolhido pelo usuário em 2026-10-17, antes de qualquer código.
- Ordem dentro de cada batch:
  - A: S0 primeiro, num commit só com a `0011`, a escrita de `inactivated_at` em `students.service.ts` e os helpers `setStatus` e `insertStudents` (decisão 8); depois os schemas e as ações; depois S1, S2 e S3. No commit das rotas entram as linhas novas de `enrollment.test.ts` e do OpenAPI para as duas rotas de aluno, senão as duas suítes reprovam com as rotas registradas.
  - B: S4, depois S5 com a saída da variável e as edições de `env.test.ts`, `boot.test.ts`, `repo.test.ts`, `photos-purge.test.ts` e a nota em `features/foto-captura/checks.md`, depois S6.
  - C: S7 (com `shell.spec.ts`, `audit.spec.ts` e `lib/audit.ts`) e S8 (o caso novo e a edição do caso da `foto-captura` em `compose.test.ts`).
- Conferir antes de cada trecho:
  - antes da S2, que a anonimização trava a linha antes de qualquer remoção de objeto e que as condições usam `enrollmentStatus` e `paymentStatus` com um `today` só
  - antes da S3, que o filtro da marca está em cada leitura de aluno por id (a lista das 21 rotas da C25) e não só no serviço de alunos
  - antes da S6, que a retenção chama o mesmo caminho da anonimização a pedido, com `NO_ACTOR`, e não uma segunda implementação
  - antes da S7, que a tela não decide elegibilidade: ela mostra o que o `409` diz
- O Verifier não é do builder: quem tem a feature inteira o dispara depois do último commit, sobre `<base da feature>..HEAD`, com os 111 checks.
- Boundary (batch A): S0 a S3 verdes em `2ef3ea1`, sobre a base `8cdaef1`; `pnpm verify` verde com a árvore de `2ef3ea1` (21 tarefas: database 68 testes, contracts 15, API 671 em 74 arquivos, web 269, repo 10). Commits: `206dd92` (a `0011`, a escrita de `inactivated_at` em `students.service.ts` e os helpers `setStatus` e `insertStudents`; C68 a C72 e C47), `bc1d414` (`privacy.ts` do contrato, as duas ações de aluno em `AUDIT_ACTIONS`, os rótulos delas em `lib/audit.ts` e as contagens de 38 para 40; C73), `2960b58` (as duas rotas de aluno em `apps/api/src/privacy`, a trava do envio de foto contra o anonimizado, `support/privacy.ts`, as duas linhas de `enrollment.test.ts` e o percurso de `audit-auth.test.ts`; C1 a C24, C76 a C84) e `2ef3ea1` (o filtro da marca nas 21 rotas, na lista e no painel; C25 a C29, C85). Fechados: C1 a C29, C47, C68 a C73 e C76 a C85. **C74 e C75 passam ao batch B** (ver Settled). O batch B (S4 a S6, C74, C75, C101 a C104, C107 a C111) lê este arquivo e o diff `8cdaef1..2ef3ea1`
- Settled mid-build (batch A): decidido pelo usuário: (1) a C74 fecha no batch B, não no A: o teste existente `ten_actions_written_equal_contract_vocabulary` exige que toda ação do vocabulário seja gravada por uma rota, e `staff.exported`, `staff.anonymized` e `privacy.settings_updated` só têm rota no B; por isso o A acrescentou só `student.exported` e `student.anonymized` (na posição final da door 6) e o B acrescenta as três outras, escreve a prova `audit_actions_end_with_five_privacy_actions_in_order` e leva as contagens de 40 para 43 (`contracts.test.ts`, `audit-auth.test.ts`, `audit.spec.ts`, os rótulos em `lib/audit.ts`). Pelo mesmo motivo a C75 também fecha no B: `staff_user_linked` só sai da rota de funcionário, e a prova `three_new_codes_are_problem_json_409` não foi escrita no A. (2) Na C26, o "`total`" de `GET /api/students`, que não tem esse campo, é a contagem de itens percorrendo todas as páginas; o contrato não mudou. Decididas aqui, sem tocar check nem door: o módulo mora em `apps/api/src/privacy` (`PrivacyService`, com a cifra e o `PhotoStorage`, e `StudentPrivacyController` em `api/students/:id` com `@Roles('admin')` na classe); a exportação lê tudo numa transação, lê o `large` de cada foto pelo `PhotoStorage` e só então grava a trilha, e um objeto ausente também responde `503`; a anonimização remove os objetos pelo `PhotoStorage.remove` dentro da transação e lança `503` se alguma remoção falhar (o `removeObjects` de `PhotosService`, que engole a falha, não serve a door 7), apaga `consents` antes de `guardians` (a chave estrangeira do responsável) e grava `anonymized_at = now()`; `lockOwner` de `PhotosService` passa a travar só o dono não anonimizado e o envio que o perde responde `404` (decisão 7), e `find` filtra a marca para aluno e funcionário; o schema do `PUT` da configuração é um `looseObject` com `superRefine` que nomeia cada chave a mais (o objeto estrito do Zod 4 dá `path` vazio); as leituras de `students`, `staff` e `consents` que mapeiam colunas agora anuláveis usam `!`, porque a ficha lida é sempre identificada. Testes existentes que mudaram fora da lista do `Coverage`, sem afrouxar o que afirmavam: `students_keeps_the_columns_of_0003_and_gains_no_foreign_key` (`consent.test.ts` do banco) ganhou as duas colunas da `0011` na lista exata; as contagens de `AUDIT_ACTIONS` (38 para 40) e os `slice(36)` que viraram `slice(36, 38)` em `contracts.test.ts` e `audit.spec.ts`, e as duas rotas no percurso de `audit-auth.test.ts`, como a `pagamentos` fez. A C109 (`students.test.ts`) e a C111 (`photos.test.ts`) tiveram a edição prevista no commit da `0011`, porque a migração as reprovaria; as duas seguem como checks do batch B
- Abandoned (batch A): nada. Nenhum check editado, nenhum teste afrouxado ou pulado. Uma armadilha de teste para o B: o cliente S3 do teste corrige o próprio relógio pelo do MinIO, e uma listagem do bucket feita com `clockAt` ativo desvia as seguintes (`RequestTimeTooSkewed`); em `privacy-anonymize.test.ts` o relógio falso cobre só a chamada à API (`anonymizeAtNoon`)
