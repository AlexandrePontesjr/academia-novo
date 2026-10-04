# Cadastro de alunos - checks

Profile: standard
Plan: `.specs/features/alunos/plan.md`

## Intent

91 checks in 10 slices (S0 e as 8 do plano, mais S9 de montagem) · 4 one-way doors · 1 open, of which 0 block the Build

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`,
`playwright test <arquivo> -g`). Os arquivos `crypto.test.ts`, `students-create.test.ts`,
`students-health.test.ts`, `students-read.test.ts`, `students-search.test.ts`,
`students-update.test.ts` e `students-audit.test.ts` (em `apps/api/test`),
`packages/database/test/students.test.ts` e `apps/web/e2e/students.spec.ts` são criados no Build;
`contracts.test.ts`, `openapi.test.ts`, `boot.test.ts`, `enrollment.test.ts`, `support/app.ts`,
`repo.test.ts`, `compose.test.ts`, `shell.spec.ts`, `audit.spec.ts` e `fake-api.ts` existem e ganham
casos. As regras de `features/auth-rbac/checks.md` e de `features/auditoria/checks.md` (leitura de
`audit_logs` por SQL, "exatamente uma linha" como diferença de contagem, insert que falha por gatilho
do próprio teste, `FakeApi` que registra query e cabeçalhos) seguem valendo. Regras próprias:

- A numeração acompanha o plano: de S1 a S8, **C(n) prova a AC (n - 8)** (C9 é a AC 1, C84 é a AC 76).
  S0 vem antes e S9 depois.
- "Linha de aluno" é lida por SQL do banco do próprio teste como `to_jsonb(students)`, sem depender de
  nome de coluna (o plano deixa os nomes para o diff). "Linha idêntica" é igualdade desse JSON antes
  e depois, e "contagem" é `count(*)` de `students`.
- As provas de rota usam a sessão real de cada perfil (`stack.session(role)`, com 2FA já ativo para
  `admin`) e `Origin` igual a `WEB_ORIGIN`. CPF de teste vem de um gerador de CPFs válidos do suporte
  `support/students.ts` (novo); os literais `529.982.247-25` e `123.456.789-09` (dígito verificador
  0 no primeiro dígito) aparecem onde a AC os nomeia.
- "Falha de insert em `audit_logs`" e "dois pedidos ao mesmo tempo" seguem as regras da `auditoria`:
  gatilho `BEFORE INSERT` do próprio teste, e uma barreira que solta os dois pedidos juntos.
- A data de hoje em `America/Sao_Paulo` é controlada pelo teste (relógio em processo), nunca lida do
  relógio da máquina.
- Limites de tamanho são provados nas duas bordas (aceita no limite, recusa no limite mais um), com um
  caractere acentuado dentro do texto.
- A saída dos logs é capturada em stdout, stderr e `console` (as três).

### S0 - A tabela, a cifra, a chave e o contrato, antes de qualquer rota · ~10 files · ~24 KB · ~6k

**C1** - Depois de `pnpm db:migrate` num banco vazio, `students` existe sem as colunas `deleted_at`, `guardian_id` e `tenant_id` e sem nenhuma chave estrangeira (door 1, AD-016, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/students.test.ts -t "students_has_no_deleted_at_guardian_or_foreign_key"`

**C2** - Uma linha inserida em `students` só com os campos obrigatórios e sem `id` recebe do banco um `uuid` de versão 7 e `status` igual a `active` (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/students.test.ts -t "defaults_uuidv7_and_active"`

**C3** - `status` aceita `active`, `inactive` e `suspended` e recusa `archived`, `Active` e a cadeia vazia por violação de `CHECK`, e a linha continua como estava (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/students.test.ts -t "status_accepts_three_values_and_rejects_others"`

**C4** - Dois alunos com o mesmo `cpf` violam `UNIQUE`, também quando o primeiro está `inactive` e quando está `suspended`; dois com `cpf` diferentes convivem (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/students.test.ts -t "cpf_unique_across_every_status"`

**C5** - O valor que a cifra grava tem quatro partes separadas por `.`, a primeira igual a `v1`, a segunda um IV de 12 bytes e a quarta uma tag de 16 bytes, cada parte em base64url; decifrado com a mesma chave devolve exatamente o texto, inclusive com acentos, emoji e quebras de linha; o mesmo texto cifrado duas vezes dá dois valores diferentes (door 2, AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/crypto.test.ts -t "v1_format_round_trip_and_fresh_iv"`

**C6** - Decifrar recusa, em cada um dos quatro casos, um valor com o texto cifrado alterado, com a tag alterada, cifrado com outra chave e com prefixo diferente de `v1` (`v2.` e sem prefixo) (door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/crypto.test.ts -t "decrypt_rejects_four_bad_values"`

**C7** - `AUDIT_ACTIONS` em `packages/contracts` tem treze valores: os dez de antes, na ordem de antes, seguidos de `student.created`, `student.updated` e `student.inactivated`, nessa ordem (door 3, AD-025)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_three_student_actions_in_order"`

**C8** - O schema de resposta do aluno, em `packages/contracts`, aceita o objeto só com `id`, `name` e `status` (forma do `instructor`), o objeto sem `healthNotes` (forma do `hr_finance`) e o completo, e recusa o objeto a que falta `id`, `name` ou `status` (door 4, AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "student_schema_has_optional_profile_fields"`

### S1 - Cadastrar um aluno · ~4 files · ~24 KB · ~6k

**C9** - `POST /api/students` de `admin` e de `reception`, com `name`, `cpf`, `birthDate` e `phone` válidos, responde `201` nos dois casos com exatamente as chaves `id`, `name`, `cpf`, `birthDate`, `sex`, `email`, `phone`, `address`, `emergencyContactName`, `emergencyContactPhone`, `healthNotes` e `status`, os quatro enviados com o valor enviado, `status` igual a `active` e as seis opcionais não enviadas iguais a `null` (AC 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "create_201_by_admin_and_reception_with_nulls"`

**C10** - `POST /api/students` com `cpf` igual a `529.982.247-25`, `phone` igual a `(11) 91234-5678` e `emergencyContactPhone` igual a `(11) 1234-5678` grava na linha e devolve `52998224725`, `11912345678` e `1112345678` (AC 2, door 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "cpf_and_phones_stored_and_returned_as_digits"`

**C11** - `POST /api/students` responde `422` com um item em `errors` cujo `path` é `cpf` para dez dígitos, doze dígitos, cada um dos dez CPFs de dígitos repetidos (`000.000.000-00` a `999.999.999-99`), dígito verificador errado no primeiro dígito (`529.982.247-15`), dígito verificador errado no segundo (`529.982.247-24`) e `5299822472a`; e responde `201` para `529.982.247-25` com e sem máscara e para `123.456.789-09` (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "invalid_cpf_422_on_path_valid_cpf_201"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "cpf_check_digit_table"`

**C12** - `POST /api/students` com o CPF de um aluno `active`, de um `suspended` e de um `inactive`, e com o mesmo CPF em forma mascarada, responde `409` com `code` igual a `cpf_taken`, em cada um dos quatro casos, e a contagem de `students` não muda (AC 4, door 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "duplicate_cpf_409_in_every_status"`

**C13** - Dez rodadas de dois `POST /api/students` com o mesmo CPF, soltos juntos, dão em cada rodada um `201` e um `409` com `cpf_taken`, e a contagem de `students` sobe de um por rodada (AC 5, door 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "ten_concurrent_pairs_one_201_one_409"`

**C14** - `POST /api/students` responde `422` com um item em `errors` cujo `path` é `birthDate` para `2000-02-30`, `31/12/2000`, `2000-2-1`, `ontem`, para o dia seguinte ao de hoje em `America/Sao_Paulo` e para `1899-12-31`; responde `201` para `1900-01-01` e para o dia de hoje em `America/Sao_Paulo`, incluindo às 23:30 de São Paulo, quando a data em UTC já é a do dia seguinte (AC 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "birth_date_bounds_in_sao_paulo"`

**C15** - `POST /api/students` responde `422` com um item em `errors` cujo `path` é o campo enviado, para `phone` e para `emergencyContactPhone`, com 9 e com 12 dígitos; e `201` com 10 e com 11 dígitos, com e sem espaços, parênteses e hífen (AC 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "phone_digit_bounds_on_both_fields"`

**C16** - `POST /api/students` responde `422` com um item em `errors` cujo `path` é o campo, para `name` ausente, só com espaços, de 121 caracteres; `email` sem arroba e de 255 caracteres; `sex` igual a `x`; `address` de 201; `emergencyContactName` de 121; `healthNotes` de 2001; e responde `201` com `name` de 120, `email` de 254, `address` de 200, `emergencyContactName` de 120, `healthNotes` de 2000 e cada um dos três valores de `sex` (AC 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "field_validation_both_bounds"`

**C17** - `POST /api/students` com só `emergencyContactName` responde `422` com `path` igual a `emergencyContactPhone`; com só `emergencyContactPhone`, `422` com `path` igual a `emergencyContactName`; com os dois e com nenhum, `201` (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "emergency_contact_pair_422_names_missing_field"`

**C18** - `POST /api/students`, `PATCH /api/students/:id` e `DELETE /api/students/:id` de `hr_finance` e de `instructor` respondem, nos seis casos, `403` com `code` igual a `forbidden`, e a contagem de `students` e a linha do aluno alvo não mudam (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "hr_finance_and_instructor_403_on_three_writes"`

**C19** - As cinco rotas `/api/students*` chamadas sem cookie respondem, nos cinco casos, `401` com `code` igual a `unauthorized` (AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-create.test.ts -t "five_routes_401_without_session"`

### S2 - Observações de saúde cifradas · ~3 files · ~20 KB · ~5k

**C20** - Aluno criado com `healthNotes` e aluno editado com `healthNotes` têm, em `students`, um valor que começa por `v1.` e cujo texto de linha (`to_jsonb`) não contém o texto enviado (AC 12, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-health.test.ts -t "health_notes_stored_as_v1_on_create_and_patch"`

**C21** - Dois alunos gravados com o mesmo `healthNotes` têm valores guardados diferentes (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-health.test.ts -t "same_text_two_students_two_stored_values"`

**C22** - `GET /api/students/:id` de `admin` e de `reception` devolve em `healthNotes` exatamente o texto enviado, com acentos, emoji, quebra de linha e 2000 caracteres (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-health.test.ts -t "health_notes_read_back_exactly_by_admin_and_reception"`

**C23** - Com o valor guardado alterado no último caractere da tag, trocado pelo de outro aluno e sem prefixo, `GET /api/students/:id` de `admin` e de `reception` responde `500` com `code` igual a `internal_error` e corpo sem `name`, `cpf` nem qualquer outro campo do aluno, nos seis casos; e, sobre a mesma linha, `GET /api/students/:id` de `hr_finance` e `GET /api/students` de `admin` respondem `200` (AC 15, Flow)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-health.test.ts -t "unreadable_stored_value_500_without_student_fields"`

**C24** - A API iniciada sem `DATA_ENCRYPTION_KEY`, com um valor que não é base64, com o base64 de 31 bytes e com o de 33 bytes sai com código 1, imprime `DATA_ENCRYPTION_KEY` e não imprime o valor; com o de 32 bytes sobe (AC 16, AD-015)
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "data_key_rejected_exits_1_naming_var"`

**C25** - Percorridas criação com saúde, edição, leitura da ficha, listagem com `q` de CPF, inativação e uma criação cujo insert em `audit_logs` falha, nenhuma linha de log contém o texto de `healthNotes`, o valor cifrado, a chave, o CPF (em dígitos e mascarado) nem o valor de `q` (AC 17)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-health.test.ts -t "five_values_never_reach_the_log_even_on_failure"`

### S3 - A ficha mostra a cada perfil só o que ele pode ver · ~3 files · ~16 KB · ~4k

**C26** - `GET /api/students/:id` de `admin` e de `reception` responde `200` com exatamente as doze chaves `id`, `name`, `status`, `cpf`, `birthDate`, `sex`, `email`, `phone`, `address`, `emergencyContactName`, `emergencyContactPhone` e `healthNotes` (AC 18)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-read.test.ts -t "ficha_twelve_keys_for_admin_and_reception"`

**C27** - `GET /api/students/:id` de `hr_finance`, sobre um aluno com `healthNotes` preenchido, responde `200` com as onze chaves da AC 18 sem `healthNotes`: a chave não existe no JSON, nem como `null` (AC 19, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-read.test.ts -t "ficha_hr_finance_without_health_notes_key"`

**C28** - `GET /api/students/:id` de `instructor`, sobre um aluno com todos os campos preenchidos, responde `200` com exatamente as chaves `id`, `name` e `status` (AC 20, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-read.test.ts -t "ficha_instructor_three_keys_only"`

**C29** - `GET /api/students/:id` com `:id` igual a `abc` e com um `uuid` de aluno nenhum responde, nos dois casos, `404` com `code` igual a `not_found` (AC 21)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-read.test.ts -t "ficha_404_for_non_uuid_and_unknown_uuid"`

**C30** - `GET /api/students` e `GET /api/students/:id` que respondem `200` para cada um dos quatro perfis não mudam a contagem de `audit_logs`, nos oito casos (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-read.test.ts -t "reading_students_writes_no_audit_row"`

### S4 - Buscar por nome, CPF, telefone e situação · ~4 files · ~32 KB · ~8k

**C31** - Com 55 alunos de situações misturadas, nomes com acento, caixa diferente e dois homônimos, `GET /api/students` sem parâmetros de `admin`, de `reception` e de `hr_finance` responde `200` com 50 itens, cada um com exatamente as chaves `id`, `name`, `status`, `cpf` e `phone`, na ordem do nome sem diferenciar maiúsculas nem acentos e, no empate, do `id` (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-search.test.ts -t "list_50_sorted_by_folded_name_then_id"`

**C32** - `GET /api/students` de `instructor` devolve cada item com exatamente as chaves `id`, `name` e `status` (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-search.test.ts -t "list_instructor_three_keys_per_item"`

**C33** - Com "João da Silva" e "Joana Souza", `q=joao silva`, `q=SILVA JOAO` e `q=jo%C3%A3o` (com acento) devolvem, de `reception` e de `instructor`, "João da Silva" e não "Joana Souza"; `q=silva zzz` devolve vazio; e `q=11 joao`, que tem letra e dígitos, compara os dois termos só com o nome e devolve vazio mesmo havendo aluno de telefone `11912345678` (AC 25)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-search.test.ts -t "name_terms_fold_case_and_accents"`

**C34** - Com um aluno de CPF `52998224725` e telefone `11912345678`, `q=529.982.247-25` devolve o aluno por CPF; `q=11912345678`, `q=(11) 91234-5678` e `q=91234` devolvem-no por telefone; `q=5299822` (parte do CPF, sem telefone que a contenha) devolve vazio (AC 26)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-search.test.ts -t "digits_match_cpf_equal_or_phone_contains"`

**C35** - `GET /api/students` de `instructor` com `q=529.982.247-25` e com `q=11912345678` responde `200` com `items` vazio, enquanto os mesmos `q` de `reception` devolvem o aluno (AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-search.test.ts -t "instructor_digit_query_empty_without_comparing"`

**C36** - `status` igual a `active`, a `inactive` e a `suspended`, sozinho, devolve só os alunos daquela situação; `q=silva` com `status=inactive` devolve só os que atendem aos dois (AC 28)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-search.test.ts -t "status_filter_alone_and_with_q"`

**C37** - Com 120 alunos, dos quais 40 com o mesmo nome, seguir `nextCursor` com os mesmos filtros desde a primeira página até ele vir `null` devolve 120 ids distintos na mesma ordem de uma leitura única do banco; o mesmo percurso com `status=active` e com `q` devolve só os que atendem, sem repetir nem pular (AC 29)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-search.test.ts -t "cursor_walks_every_student_once_with_equal_names"`

**C38** - `nextCursor` é `null` com exatamente 50 alunos que atendem ao filtro e não nulo com 51 (AC 29, AC 30)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-search.test.ts -t "next_cursor_null_at_50_and_set_at_51"`

**C39** - `GET /api/students` responde `422` com `code` igual a `validation_failed` e um item em `errors` cujo `path` é o nome do parâmetro, para `status=archived`, `q` vazio, `q` de 101 caracteres, `cursor=xyz`, `cursor` base64url de texto que não é JSON e `cursor` base64url de JSON de outra forma; `q` de 100 caracteres responde `200` (AC 31, AD-029)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-search.test.ts -t "six_invalid_query_parameters_422_on_path"`

### S5 - Editar, suspender, inativar e reativar · ~4 files · ~28 KB · ~7k

**C40** - `PATCH /api/students/:id` de `admin` e de `reception`, com só `phone`, só `address` e `name` mais `email` juntos, responde `200` com o aluno atualizado e os demais campos idênticos aos de antes (AC 32)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "patch_200_changes_only_sent_fields"`

**C41** - `PATCH /api/students/:id` com `null` em `sex`, em `email`, em `address`, em `healthNotes` e no par `emergencyContactName` e `emergencyContactPhone` responde `200` com aquele campo `null` e, na linha, a coluna de `healthNotes` nula (AC 33, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "null_clears_five_optional_fields"`

**C42** - `PATCH /api/students/:id` responde `422` com um item em `errors` cujo `path` é o campo e a linha idêntica à de antes, para `null` em `name`, `cpf`, `birthDate`, `phone` e `status`, e para `cpf` inválido, `birthDate` no futuro, `phone` de 9 dígitos, `name` de 121 e `healthNotes` de 2001 (AC 34)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "patch_422_ten_cases_leave_row_unchanged"`

**C43** - Num aluno com o par de contato gravado, `PATCH` com `emergencyContactName` igual a `null` responde `422` com `path` igual a `emergencyContactName`; num aluno sem o par, `PATCH` só com `emergencyContactName` responde `422` com `path` igual a `emergencyContactPhone`; `PATCH` só com `emergencyContactPhone` num aluno que já tem o nome responde `200` (AC 35)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "emergency_pair_rule_counts_stored_value"`

**C44** - `PATCH /api/students/:id` com o CPF de outro aluno, ativo e inativo, responde `409` com `code` igual a `cpf_taken` e a linha idêntica; com o CPF do próprio aluno, igual e mascarado, responde `200` (AC 36)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "patch_cpf_of_another_409_own_cpf_200"`

**C45** - `PATCH /api/students/:id` com `status` igual a `suspended` e a `active`, a partir de cada uma das situações `active`, `suspended` e `inactive`, responde `200` e grava a situação enviada, nos seis casos (AC 37)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "patch_status_from_any_state_to_suspended_or_active"`

**C46** - `PATCH /api/students/:id` com `status` igual a `inactive`, sozinho e junto de `name` novo, responde `422` com um item em `errors` cujo `path` é `status` e a linha idêntica, inclusive o `name` (AC 38)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "patch_inactive_422_and_nothing_applied"`

**C47** - `DELETE /api/students/:id` de `admin` e de `reception`, sobre aluno `active` e sobre `suspended`, responde `204` sem corpo, deixa `status` igual a `inactive`, mantém a contagem de `students`, e `GET /api/students/:id` seguinte devolve todos os outros campos como estavam (AC 39)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "delete_204_inactivates_and_keeps_row"`

**C48** - `DELETE /api/students/:id` sobre aluno já `inactive` responde `204` e a linha fica idêntica à de antes, inclusive o instante de atualização (AC 40)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "delete_of_inactive_204_changes_nothing"`

**C49** - Dez rodadas de dois `PATCH /api/students/:id` soltos juntos, um com `phone` e outro com `address`, dão `200` aos dois em cada rodada e deixam o aluno com os dois valores (AC 41)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "ten_concurrent_patches_keep_both_changes"`

**C50** - `PATCH /api/students/:id` com corpo válido e `DELETE /api/students/:id`, cada um com `:id` igual a `abc` e com um `uuid` de aluno nenhum, responde, nos quatro casos, `404` com `code` igual a `not_found` (AC 42)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "patch_and_delete_404_for_bad_and_unknown_id"`

### S6 - Cada mudança deixa rastro, na mesma transação · ~3 files · ~28 KB · ~7k

**C51** - `POST /api/students` que responde `201`, de `admin` e de `reception`, grava exatamente uma linha com `action` igual a `student.created`, `user_id` igual ao id do autor, `entity` igual a `student` e `entity_id` igual ao `id` do corpo da resposta (AC 43)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts -t "create_writes_one_student_created_row"`

**C52** - `POST /api/students` só com `name`, `cpf`, `birthDate` e `phone` grava `diff` igual a `{"fields":["name","cpf","birthDate","phone","status"],"values":{"status":{"from":null,"to":"active"}}}` (AC 44, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts -t "diff_of_creation_names_fields_and_status_only"`

**C53** - `PATCH /api/students/:id` que responde `200` mudando só `phone`, e mudando `status` de `active` para `suspended`, de `suspended` para `active` e de `inactive` para `active`, grava em cada um dos quatro casos exatamente uma linha com `action` igual a `student.updated`, `user_id` do autor, `entity` igual a `student` e `entity_id` igual a `:id` (AC 45)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts -t "patch_writes_one_student_updated_row_per_case"`

**C54** - `PATCH /api/students/:id` que muda `phone`, muda `healthNotes` e muda `status` de `active` para `suspended`, com o corpo nessa ordem, grava `diff` igual a `{"fields":["phone","healthNotes","status"],"values":{"status":{"from":"active","to":"suspended"}}}` (AC 46, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts -t "diff_of_patch_values_only_status"`

**C55** - `PATCH /api/students/:id` com todos os campos iguais aos atuais (CPF e telefone em forma mascarada), com `status` igual ao atual e com corpo `{}` responde `200` nos três casos e a contagem de `audit_logs` não muda (AC 47)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts -t "patch_without_change_writes_no_row"`

**C56** - `DELETE /api/students/:id` que inativa um aluno `active` grava exatamente uma linha com `action` igual a `student.inactivated`, `user_id` do autor, `entity` igual a `student`, `entity_id` igual a `:id` e `diff` igual a `{"fields":["status"],"values":{"status":{"from":"active","to":"inactive"}}}`; sobre um aluno `suspended`, o `diff` traz `"from":"suspended"` (AC 48, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts -t "inactivate_writes_one_student_inactivated_row"`

**C57** - Uma requisição a `/api/students*` que termina em `401`, `403`, `404`, `409` e `422`, e o `DELETE` de aluno já inativo, deixam, nos seis casos, a contagem de `audit_logs` igual à de antes (AC 49)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts -t "rejected_students_requests_write_no_row"`

**C58** - Com o insert em `audit_logs` falhando, `POST /api/students`, `PATCH /api/students/:id` e `DELETE /api/students/:id` respondem `500` com `code` igual a `internal_error`, e `students` fica idêntico ao de antes, nos três casos (AC 50, AD-027)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts -t "audit_insert_failure_rolls_back_three_routes"`

**C59** - Percorridas criação com todos os campos, edição de cada um e inativação, o texto de todas as colunas de todas as linhas de `audit_logs` não contém nenhum dos dez valores: o nome, o CPF (em dígitos e mascarado), a data de nascimento, o e-mail, o telefone, o telefone de emergência, o endereço, o nome do contato de emergência, o texto das observações de saúde e o valor cifrado delas (AC 51, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts -t "ten_student_values_never_reach_audit_logs"`

**C60** - Para cada uma das ações `student.created`, `student.updated` e `student.inactivated`, com `X-Forwarded-For: 198.51.100.1, 203.0.113.7` e `User-Agent` de 513 caracteres, a linha grava `ip` igual a `203.0.113.7` e `user_agent` com os primeiros 512; sem o cabeçalho `User-Agent`, `user_agent` é nulo (AC 52)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts -t "ip_and_user_agent_on_the_three_actions"`

### S7 - A trilha de aluno na tela de Auditoria · ~3 files · ~12 KB · ~3k

**C61** - `/audit` exibe "Aluno criado", "Aluno editado" e "Aluno inativado" na coluna "Ação" para linhas de `student.created`, `student.updated` e `student.inactivated`, e o filtro "Ação" oferece as treze ações, as três novas nas posições 11, 12 e 13, nessa ordem (AC 53)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "student_actions_labelled_and_filter_has_thirteen"`

**C62** - Uma linha com `diff` de `status` de `active` para `suspended` e `phone` em `fields` exibe em "Detalhes" "Situação: Ativo → Suspenso" e "Telefone alterado"; uma de `inactive` para `active` exibe "Situação: Inativo → Ativo" (AC 54)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "student_details_show_status_change_and_changed_phone"`

**C63** - Uma linha com `entity` igual a `student` e `entityId` igual a `<id>` exibe em "Alvo" o link "Ver aluno" com `href` igual a `/students/<id>`, e uma linha com `entity` igual a `user` continua exibindo o nome do usuário (AC 55)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "student_target_links_to_the_ficha"`

### S8 - Telas de alunos · ~12 files · ~56 KB · ~14k

**C64** - Em `/`, o link "Alunos" aparece para `admin`, `reception`, `hr_finance` e `instructor` (AC 56)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "students_link_for_all_four_roles"`

**C65** - Sem sessão, abrir `/students`, `/students/new`, `/students/<id>` e `/students/<id>/edit` termina, nos quatro casos, na URL `/login` (AC 57)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "anonymous_four_students_urls_redirect_to_login"`

**C66** - `/students` aberta por `admin`, por `reception` e por `hr_finance` exibe o título "Alunos" e uma tabela com as colunas "Nome", "CPF", "Telefone" e "Situação", nessa ordem, com as linhas na ordem em que a API as devolveu e o nome de cada uma levando a `/students/<id>` (AC 58)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "list_title_four_columns_order_and_links"`

**C67** - `/students` aberta por `instructor` exibe a tabela só com as colunas "Nome" e "Situação" (AC 59)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "list_instructor_two_columns"`

**C68** - O CPF `52998224725` aparece como `529.982.247-25`; os telefones `11912345678` e `1112345678` como `(11) 91234-5678` e `(11) 1234-5678`; a data `2000-01-01` como `01/01/2000`, com o navegador em `America/Sao_Paulo` e em `UTC`; e as situações como "Ativo", "Inativo" e "Suspenso" (AC 60)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "formats_cpf_phone_birth_date_and_status"`

**C69** - `/students` exibe, acima da tabela, o campo "Buscar por nome, CPF ou telefone", o filtro "Situação" com as opções "Todas", "Ativo", "Inativo" e "Suspenso", nessa ordem, e os botões "Buscar" e "Limpar" (AC 61)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "search_field_status_filter_and_two_buttons"`

**C70** - Preenchidos o campo com `529.982.247-25` e o filtro com "Inativo", acionar "Buscar" faz chegar à API `GET /api/students` com `q` igual a `529.982.247-25` e `status` igual a `inactive`, a tabela exibe só o que a API devolveu a essa chamada, e a URL da página não contém `529`, `982` nem o texto do campo (AC 62)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "search_sends_q_without_putting_it_in_the_url"`

**C71** - Com a API devolvendo `nextCursor` não nulo a uma busca com `q` e `status`, `/students` exibe "Próxima página"; acioná-lo faz chegar à API uma chamada com `cursor` igual àquele valor e o mesmo `q` e `status`, a tabela passa a exibir as linhas dessa segunda resposta, e a URL da página continua sem o texto de `q` (AC 63, AC 62)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "next_page_keeps_search_and_status_and_sends_cursor"`

**C72** - Com a API devolvendo `items` vazio a uma busca com `q`, `/students` exibe "Nenhum aluno encontrado." e nenhuma tabela; o mesmo com só o filtro de situação (AC 64)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "empty_search_shows_not_found_message"`

**C73** - Com a API devolvendo `items` vazio a uma abertura sem busca nem filtro, `/students` exibe "Nenhum aluno cadastrado." e nenhuma tabela (AC 65)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "empty_registry_shows_none_registered_message"`

**C74** - Com `GET /api/students` respondendo `500`, `/students` exibe "Não foi possível carregar os alunos." e o botão "Tentar novamente"; o mesmo em `/students/<id>` com `GET /api/students/:id` respondendo `500`; acionar o botão com a API de volta exibe a tabela e a ficha (AC 66)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "load_failure_shows_retry_on_list_and_ficha"`

**C75** - O botão "Novo aluno" em `/students` e os botões "Editar", "Suspender", "Inativar" e "Reativar" na ficha aparecem para `admin` e para `reception`, na medida da situação do aluno, e não aparecem para `hr_finance` nem para `instructor`, em nenhuma das três situações (AC 67)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "write_buttons_only_for_admin_and_reception"`

**C76** - `/students/new` e `/students/<id>/edit` abertas por `hr_finance` e por `instructor` exibem, nos quatro casos, "Você não tem permissão para acessar esta página." e nenhum campo de formulário nem o botão "Salvar" (AC 68)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "form_pages_show_no_permission_for_two_roles"`

**C77** - Os formulários de `/students/new` e de `/students/<id>/edit` exibem os campos "Nome completo", "CPF", "Data de nascimento", "Sexo" com as opções "Feminino", "Masculino", "Outro" e em branco, "E-mail", "Telefone", "Endereço", "Contato de emergência (nome)", "Contato de emergência (telefone)" e "Observações de saúde", e o botão "Salvar" (AC 69)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "form_labels_options_and_save_button_on_new_and_edit"`

**C78** - Salvar o formulário de `/students/new` envia `POST /api/students` com os valores digitados e termina na URL `/students/<id>`, com `<id>` igual ao `id` que a API devolveu, exibindo a ficha daquele aluno (AC 70)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "save_new_student_goes_to_its_ficha"`

**C79** - Com a API respondendo `409` com `code` igual a `cpf_taken`, o formulário de `/students/new` e o de `/students/<id>/edit` exibem "Já existe um aluno com este CPF." junto do campo "CPF" e mantêm os demais campos com o que foi digitado (AC 71)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "cpf_taken_shown_on_cpf_field_keeps_other_fields"`

**C80** - `/students/<id>` exibe o nome, a situação e cada campo que a API devolveu: para `reception`, os doze campos, com "—" nos `null`; para `hr_finance`, sem rótulo "Observações de saúde"; para `instructor`, sem nenhum rótulo além de nome e situação (AC 72)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "ficha_shows_returned_fields_dash_for_null_no_label_for_absent"`

**C81** - Na ficha, o aluno `active` exibe "Suspender" e "Inativar" e não "Reativar"; o `suspended` exibe "Reativar" e "Inativar" e não "Suspender"; o `inactive` exibe só "Reativar" (AC 73)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "situation_buttons_per_status"`

**C82** - Acionar "Inativar" e acionar "Suspender" abre um diálogo que contém o nome do aluno e, antes da confirmação, nenhuma requisição de escrita chega à API; cancelar não envia nada; confirmar envia `DELETE /api/students/:id` e `PATCH /api/students/:id` (AC 74)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "inactivate_and_suspend_confirm_naming_the_student"`

**C83** - Terminada a mudança de situação, a ficha exibe "Suspenso" depois de "Suspender" (corpo `{"status":"suspended"}`), "Inativo" depois de "Inativar" e "Ativo" depois de "Reativar" (corpo `{"status":"active"}`) (AC 75)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "ficha_shows_new_status_after_each_change"`

**C84** - `/students/<id>` e `/students/<id>/edit` com a API respondendo `404` exibem "Aluno não encontrado." (AC 76)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "unknown_student_shows_not_found_message"`

### S9 - Contrato, montagem do processo real e estados herdados · ~7 files · ~20 KB · ~5k

**C85** - No documento de `GET /api/openapi.json`, `paths` traz `get` e `post` em `/api/students` e `get`, `patch` e `delete` em `/api/students/{id}`, e o `get` de `/api/students` tem em `parameters` exatamente três itens com `in` igual a `query` - `q`, `status` e `cursor` - nenhum com `required` igual a `true`, cada um com o `schema` igual ao da propriedade de mesmo nome em `z.toJSONSchema` do schema de query de `packages/contracts` (AD-011, AD-029)
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "students_paths_and_query_parameters_come_from_contract_schema"`

**C86** - Os corpos reais `201` de `POST /api/students`, `200` de `GET /api/students/:id` para cada um dos quatro perfis e `200` de `GET /api/students` para `admin` e para `instructor` validam contra os schemas de resposta em `packages/contracts` (AD-011, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "students_bodies_match_contract_schemas"`

**C87** - O schema de erro em `packages/contracts` conhece `cpf_taken` com `status` `409`, e o corpo real do `409` de `POST /api/students` valida contra ele (AD-009, AD-021)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "cpf_taken_is_a_known_409_code"`

**C88** - `.env.example` lista `DATA_ENCRYPTION_KEY` com o comando que gera uma chave de 32 bytes em base64 (AD-015, Observable)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "env_example_documents_data_encryption_key"`

**C89** - Na stack de pé, um usuário `reception` cria um aluno com observação de saúde por `POST /api/students` na origem do container `web`; o banco da stack tem a linha do aluno com `v1.` e sem o texto da observação, e a linha `student.created` de `audit_logs` com `ip` e `user_agent` enviados (door 2, door 1, Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "student_created_through_web_stores_ciphertext_and_audit_row"`

**C90** - `admin` sem 2FA ativo recebe `403` com `code` igual a `two_factor_enrollment_required` nas cinco rotas `/api/students*`, e a lista escrita no teste das rotas bloqueadas as inclui (Surface, `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C91** - O botão "Salvar" de `/students/new` e o de `/students/<id>/edit` fica desabilitado enquanto a API não responde ao envio (Observable, loading state)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "save_button_disabled_while_waiting_on_both_forms"`

## Coverage

Uma linha para cada rota da `Surface`, com os status como membros, e uma por rota e perfil; depois as
doors, a entidade de `Relations` e os conjuntos enumerados nos critérios.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/students` statuses (4) | 200 C31 · 401 C19 · 403 C90 · 422 C39 | - |
| `POST /api/students` statuses (5) | 201 C9 · 401 C19 · 403 C18 · 409 C12 · 422 C11 | - |
| `GET /api/students/:id` statuses (4) | 200 C26 · 401 C19 · 403 C90 · 404 C29 | - |
| `PATCH /api/students/:id` statuses (6) | 200 C40 · 401 C19 · 403 C18 · 404 C50 · 409 C44 · 422 C42 | - |
| `DELETE /api/students/:id` statuses (4) | 204 C47 · 401 C19 · 403 C18 · 404 C50 | - |
| status fora da `Surface`, `500` (4) | `GET /api/students/:id` C23 · `POST` C58 · `PATCH` C58 · `DELETE` C58 | - |
| `GET /api/students` por perfil (4) | `admin` C31 · `reception` C31 · `hr_finance` C31 · `instructor` C32 | - |
| `GET /api/students/:id` por perfil (4) | `admin` C26 · `reception` C26 · `hr_finance` C27 · `instructor` C28 | - |
| `POST /api/students` por perfil (4) | `admin` C9 · `reception` C9 · `hr_finance` C18 · `instructor` C18 | - |
| `PATCH /api/students/:id` por perfil (4) | `admin` C40 · `reception` C40 · `hr_finance` C18 · `instructor` C18 | - |
| `DELETE /api/students/:id` por perfil (4) | `admin` C47 · `reception` C47 · `hr_finance` C18 · `instructor` C18 | - |
| `q` por perfil (4) | `admin` C34 · `reception` C34 · `hr_finance` C34 · `instructor` C33, C35 | - |
| one-way doors (4) | door 1 C4 · door 2 C20 · door 3 C56 · door 4 C28 | - |
| entidades de `Relations` (1) | `students` C1 | - |
| one-way constraints de `Relations` (4) | CPF único entre todas as situações C4 · situação só com três valores C3 · `uuid` gerado pelo banco C2 · saúde só cifrada C20 | - |
| situação do aluno (3) | `active` C2 · `suspended` C45 · `inactive` C47 | - |
| `status` aceito no `PATCH` (3) | `suspended` C45 · `active` C45 · `inactive` recusado C46 | - |
| transições de `status` (6) | `active` para `suspended` C45 · `suspended` para `active` C45 · `inactive` para `active` C45 · `active` para `inactive` C47 · `suspended` para `inactive` C47 · `inactive` para `inactive` C48 | - |
| formato da cifra (4 partes) | `v1` C5 · IV de 12 bytes C5 · texto cifrado C5 · tag de 16 bytes C5 | - |
| valores recusados ao decifrar (4) | texto alterado C6 · tag alterada C6 · outra chave C6 · prefixo diferente de `v1` C6 | - |
| valor guardado ilegível, `GET` do aluno (3) | tag alterada C23 · valor de outro aluno C23 · sem prefixo C23 | - |
| `DATA_ENCRYPTION_KEY` (4 edges) | ausente C24 · não é base64 C24 · 31 bytes C24 · 33 bytes C24; 32 bytes sobe C24 | - |
| valores fora do log (5) | texto de saúde C25 · valor cifrado C25 · chave C25 · CPF C25 · `q` C25 | - |
| valores fora de `audit_logs` (10) | C59, table-driven over all 10 | - |
| vocabulário de `action` de aluno, quem grava cada uma (3) | `student.created` C51 · `student.updated` C53 · `student.inactivated` C56 | - |
| vocabulário de `AUDIT_ACTIONS` (13) | C7, table-driven over all 13: os dez de antes e os três novos na ordem | - |
| `diff` de cada ação de aluno (3) | `student.created` C52 · `student.updated` C54 · `student.inactivated` C56 | - |
| campos do aluno que o `PATCH` aceita (11) | `name` C40 · `cpf` C44 · `birthDate` C42 · `sex` C41 · `email` C40 · `phone` C40 · `address` C40 · `emergencyContactName` C43 · `emergencyContactPhone` C43 · `healthNotes` C41 · `status` C45 | - |
| campos que o `PATCH` aceita limpar com `null` (5) | `sex` C41 · `email` C41 · `address` C41 · `healthNotes` C41 · par de contato C41 | - |
| campos que o `PATCH` recusa `null` (5) | `name` C42 · `cpf` C42 · `birthDate` C42 · `phone` C42 · `status` C42 | - |
| rotas que desfazem a ação quando o insert falha (3) | C58, table-driven over all 3 | - |
| status que não gravam linha (5 e um caso) | `401` C57 · `403` C57 · `404` C57 · `409` C57 · `422` C57 · `DELETE` de inativo C57 | - |
| leituras que não gravam (8) | C30, table-driven over all 8: 2 rotas e 4 perfis | - |
| chaves da ficha por perfil (3 conjuntos) | `admin` e `reception` doze C26 · `hr_finance` onze C27 · `instructor` três C28 | - |
| chave ausente, nunca `null` (2) | `healthNotes` em `hr_finance` C27 · todas menos três em `instructor` C28 | - |
| chaves de cada item da lista (2 conjuntos) | cinco C31 · três C32 | - |
| página da lista (3 edges) | 50 itens com 55 alunos C31 · `nextCursor` nulo com 50 C38 · não nulo com 51 C38 | - |
| parâmetros de query (3) | `q` C33 · `status` C36 · `cursor` C37 | - |
| caminhos de `q` (4) | só letras C33 · letras e dígitos C33 · só dígitos C34 · só dígitos de `instructor` C35 | - |
| busca por dígitos (3) | CPF igual C34 · telefone contém C34 · parte de CPF sem telefone, vazio C34 | - |
| `status` da query (3) | `active` C36 · `inactive` C36 · `suspended` C36 | - |
| parâmetro de query inválido (6) | C39, table-driven over all 6 | - |
| `q` (2 edges) | 100 C39 · 101 C39 | - |
| ordem da lista (2) | nome sem caixa nem acento C31 · desempate por `id` C31 | - |
| CPF recusado (5 causas) | 10 dígitos C11 · 12 dígitos C11 · dígitos repetidos C11 · primeiro dígito verificador C11 · segundo C11; letra C11 | - |
| CPF aceito (3) | mascarado C11 · sem máscara C11 · dígito verificador zero C11 | - |
| CPF duplicado, situação do dono (4) | `active` C12 · `suspended` C12 · `inactive` C12 · forma mascarada C12 | - |
| `birthDate` (4 edges) | `1899-12-31` C14 · `1900-01-01` C14 · hoje em São Paulo C14 · amanhã C14 | - |
| `birthDate` formato recusado (4) | data impossível C14 · `dd/MM/aaaa` C14 · sem zeros C14 · texto C14 | - |
| telefone (4 edges) | 9 dígitos C15 · 10 C15 · 11 C15 · 12 C15 | - |
| campos de telefone (2) | `phone` C15 · `emergencyContactPhone` C15 | - |
| limites de tamanho (10 edges) | `name` 120 C16 · `name` 121 C16 · `email` 254 C16 · `email` 255 C16 · `address` 200 C16 · `address` 201 C16 · `emergencyContactName` 120 C16 · `emergencyContactName` 121 C16 · `healthNotes` 2000 C16 · `healthNotes` 2001 C16 | - |
| `sex` (4) | `female` C16 · `male` C16 · `other` C16 · `x` recusado C16 | - |
| par de contato de emergência (4) | só nome C17 · só telefone C17 · os dois C17 · nenhum C17 | - |
| par de contato na edição (3) | limpar só o nome C43 · só o nome num aluno sem par C43 · só o telefone num aluno com nome C43 | - |
| CPF no `PATCH` (3) | de outro, ativo C44 · de outro, inativo C44 · o próprio, igual e mascarado C44 | - |
| entradas do `PATCH` sem mudança (3) | campos iguais C55 · `status` igual C55 · corpo vazio C55 | - |
| `PATCH` que grava linha (4) | só `phone` C53 · `active` para `suspended` C53 · `suspended` para `active` C53 · `inactive` para `active` C53 | - |
| `DELETE` que grava linha (2) | de `active` C56 · de `suspended` C56 | - |
| origem da linha de auditoria, por ação (3) | `student.created` C60 · `student.updated` C60 · `student.inactivated` C60 | - |
| `User-Agent` na trilha (2 edges) | 513 cortado em 512 C60 · ausente nulo C60 | - |
| `id` inválido (2) | `abc` C29, C50 · `uuid` sem aluno C29, C50 | - |
| menu `Alunos` por perfil (4) | C64, table-driven over all 4 | - |
| URLs sem sessão (4) | `/students` C65 · `/students/new` C65 · `/students/<id>` C65 · `/students/<id>/edit` C65 | - |
| colunas de `/students` (6) | "Nome" C66 · "CPF" C66 · "Telefone" C66 · "Situação" C66; `instructor`: "Nome" C67 · "Situação" C67 | - |
| formatos de exibição (4) | CPF C68 · telefone de 11 e de 10 dígitos C68 · data C68 · situação C68 | - |
| controles de busca (6) | campo "Buscar por nome, CPF ou telefone" C69 · filtro "Situação" C69 · "Todas" C69 · "Ativo" C69 · "Inativo" C69 · "Suspenso" C69; botões "Buscar" C69 · "Limpar" C69 | - |
| busca -> parâmetro da API (3) | `q` C70 · `status` C70 · `cursor` C71 | - |
| estados de `/students` em `Observable` (5) | vazio de busca C72 · vazio de cadastro C73 · erro de carga C74 · sem sessão C65 · colunas por perfil C66, C67 | - |
| estados da ficha em `Observable` (5) | vazio por campo C80 · erro de carga C74 · não existe C84 · sem sessão C65 · diálogo de confirmação C82 | - |
| estados dos formulários em `Observable` (4) | erro `409` C79 · não existe C84 · sem permissão C76 · botão desabilitado C91 | - |
| botões de escrita por perfil (4) | `admin` C75 · `reception` C75 · `hr_finance` C75 · `instructor` C75 | - |
| botões de situação por situação (3) | `active` C81 · `suspended` C81 · `inactive` C81 | - |
| ações com diálogo (2) | "Inativar" C82 · "Suspender" C82 | - |
| mudança de situação -> requisição (3) | "Suspender" C83 · "Reativar" C83 · "Inativar" C83 | - |
| campos do formulário (11) | "Nome completo" C77 · "CPF" C77 · "Data de nascimento" C77 · "Sexo" C77 · "E-mail" C77 · "Telefone" C77 · "Endereço" C77 · "Contato de emergência (nome)" C77 · "Contato de emergência (telefone)" C77 · "Observações de saúde" C77 · "Salvar" C77 | - |
| opções de "Sexo" (4) | "Feminino" C77 · "Masculino" C77 · "Outro" C77 · em branco C77 | - |
| formulários (2) | `/students/new` C77, C78, C79, C91 · `/students/<id>/edit` C77, C79, C91 | - |
| controles de envio, botão "Salvar" (2) | `/students/new` C91 · `/students/<id>/edit` C91 | - |
| ações novas em `/audit` (3) | "Aluno criado" C61 · "Aluno editado" C61 · "Aluno inativado" C61 | - |
| filtro "Ação" (13) | C61, table-driven over all 13: os dez de antes e as três novas, posições 11 a 13 | - |
| coluna "Alvo" por entidade (2) | `student` -> "Ver aluno" C63 · `user` -> nome C63 | - |
| texto de "Detalhes" de aluno (3) | "Situação: Ativo → Suspenso" C62 · "Situação: Inativo → Ativo" C62 · "Telefone alterado" C62 | - |
| startup config: `DATA_ENCRYPTION_KEY` (4 places) | harness de `startApi`, `support/app.ts` C20 · processo filho dos testes de subida C24 · `.env.example` C88 · `compose.yaml` e processo real na stack C89 | - |
| startup config: migração `0003` aplicada (3 assemblies) | banco migrado em `packages/database` C1 · harness de `apps/api` C9 · stack do compose C89 | - |
| startup config: `trust proxy` e repasse de IP nas rotas novas (2 assemblies) | harness de teste C60 · processo real na stack C89 | - |

- Claims naming a status code, route or response shape: C9 a C19, C23, C26 a C39, C40 a C50, C51 a C58,
  C60 e C85 a C90 cruzam a fronteira HTTP da API montada pelo `startApi`; C61 a C84 e C91 cruzam a
  fronteira do web no navegador; C89 cruza as duas no processo real. C1 a C8 e C24 não cruzam
  fronteira HTTP: provam o banco migrado, a cifra e o schema no próprio nível
- C11 tem duas provas porque o dígito verificador do CPF decide por quatro ramos: a rota prova a
  fronteira (`422` e `201`), a tabela em `contracts.test.ts` prova cada ramo no próprio nível
- C54 envia o corpo na ordem `phone`, `healthNotes`, `status`, a de `fields` na AC 46. A ordem de
  `fields` para um corpo em outra ordem não está no plano e nenhum check a afirma
- C89 troca o perfil do usuário por SQL (`update users set role = 'reception'`) depois de
  `users:create-admin`: a stack não tem gerador de TOTP, e `admin` sem 2FA recebe `403` em tudo fora
  das quatro rotas isentas (C90). A linha do aluno é lida como `students::text`, sem nome de coluna
- C90 edita a lista escrita no teste `admin_without_2fa_gets_403_everywhere_else` (a que a
  `auditoria` já editou para `GET /api/audit-logs`): sem a edição, o teste reprova com as cinco rotas
  novas fora da lista
- C23 acrescenta ao texto da AC 15 o que o `Flow` diz ("decifra só quando o perfil as vê"): o `200` de
  `hr_finance` e o da lista sobre a linha ilegível. A leitura da lista e de `hr_finance` nunca
  decifra, e é essa a prova
- C61 muda a prova `ten_actions_shown_by_label` e C7 muda `ten_actions_written_equal_contract_vocabulary`
  da `auditoria` (C62 e C29 de lá): onde diziam "dez" passa a valer "treze", pelo Impact do plano. Os
  nomes ficam, o conteúdo ganha as três ações; nenhuma asserção é afrouxada
- `auth-rbac` e `auditoria`: `paths_equal_registered_api_routes`, `hostile_input_never_answers_5xx`,
  `every_route_with_body_answers_422`, `request_bodies_come_from_contract_schemas`,
  `responses_match_contract_schemas`, `only_three_routes_answer_without_session` e
  `six_identity_tables_and_no_tenant_id` leem o roteador ou o banco migrado e passam a cobrir as rotas
  e a tabela novas sem check próprio aqui. `ten_new_codes_match_problem_schema` tem lista escrita no
  teste: a C87 cobre o código novo
- Decisões que o plano deixa fora de AC e que nenhum check afirma: o que `q` só com espaços ou só com
  pontuação devolve; o texto de "Detalhes" para os campos `name`, `cpf`, `birthDate`, `sex`, `email`,
  `address`, `emergencyContactName`, `emergencyContactPhone` e `healthNotes`; o que o botão "Limpar"
  faz; o que a edição de um aluno com observação ilegível devolve
- `users:create-admin` também lê o ambiente da API e passa a exigir a chave: a prova existente `create_admin_writes_user_created_row_without_actor` segue valendo e quebra se a chave faltar no suporte
- A meta de p95 da `Assumptions` não é check: nenhuma prova mede percentil
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md` e de `features/auditoria/checks.md` seguem valendo e
respondem as duas perguntas para o que esta feature reaproveita (guarda, validação, gravador, tela).
Respondem mal três casos que lá não existiam: o código que decide dentro da própria rota e é alcançado
por HTTP com o resultado já cortado pelo perfil, a cifra de coluna, e o `CHECK` e o `UNIQUE` de
`students`. Os dois primeiros ganham linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide, alcançado por HTTP (validação de campo, unicidade do CPF, corte por perfil, `q`, cursor, ordem, edição parcial, o que grava e o que não grava linha de auditoria) | uma prova na fronteira HTTP da API montada, com Postgres real, lendo `students` e `audit_logs` por SQL | um caso afirmado por linha da tabela de decisão, nas duas bordas de cada limite; contagem e linha antes e depois em todo caso que não grava |
| Decide, com ramos que a rota não separa (dígito verificador do CPF, cifra e decifra) | uma prova na fronteira **e** uma no próprio nível | a fronteira: `422`/`201` e `500`; o próprio nível: um caso por ramo da tabela |
| Restrição do banco (`CHECK`, `UNIQUE`, `DEFAULT`) | uma prova no banco migrado por `pnpm db:migrate` | cada valor recusado uma vez e cada valor aceito uma vez |
| Tela | Playwright contra a API controlada pelo `FakeApi` | cada estado de `Observable` com landing em AC; cada texto literal da AC; a query e o corpo que chegam à API |
| Instrumentação: o controller que só repassa a query e o corpo validados, o mapa de rótulos, o formatador de CPF e telefone no web (provado por C68 através da tela) | nenhuma própria | coberta pela prova de quem a consome |

Evidence (o código da feature ainda não existe; a contagem vem do plano e do código que ele altera):

- cifra: 4 partes de formato e 4 formas de valor recusado, 6 ramos (C5, C6, C23) -> decide
- validação de campo no contrato: CPF com 4 ramos (tamanho, repetido, dois dígitos), telefone com 2 bordas em 2 campos, `birthDate` com 3 recusas e 2 bordas, 5 limites de tamanho, par de contato com 3 estados (C11 a C17) -> decide
- corte por perfil: 4 perfis, 3 conjuntos de campos, 1 decifra condicionada ao perfil (C26 a C28, C23) -> decide
- busca: 3 caminhos de `q` mais o de `instructor`, 3 buscas por dígito, filtro de situação, cursor de 2 chaves, 6 recusas (C31 a C39) -> decide
- edição: 5 campos que aceitam `null` e 5 que não, regra do par, conflito de CPF, 3 valores de `status` com 1 recusado, caso sem mudança, 2 caminhos concorrentes (C40 a C50) -> decide
- auditoria: 3 ações, o ramo "mudou ou não mudou", 5 status que não gravam, 3 rotas que desfazem (C51 a C60) -> decide
- migração `0003`: 1 `CHECK`, 1 `UNIQUE`, 2 `DEFAULT` (C1 a C4) -> decide
- closest analogue in the repo: `apps/api/test/audit-logs.test.ts`, cursor, filtros e `422` de query provados um a um na fronteira HTTP contra a aplicação do `startApi`; `apps/api/test/audit-users.test.ts`, linha gravada e desfeita por gatilho que falha; e `packages/database/test/audit.test.ts`, restrições do banco provadas uma a uma sobre o banco migrado

Cost: 1 prova além das 91 acima, a da tabela de CPF no próprio nível (segunda `Proof` da C11); as de cifra (C5, C6) e as do banco (C1 a C4) já são checks. Sem a linha de "ramos que a rota não separa", o dígito verificador seria provado só pelos CPFs que a fronteira percorre.

## Swept

- validation: C11, C14, C15, C16, C17, C39, C42, C43, C46, C85
- failure modes: C23, C58, C74, C79, C84
- idempotency: C48 (inativar de novo não altera), C55 (editar sem mudar não grava), C45 (gravar a situação que já está); repetir uma ação que muda algo é outro acontecimento e grava outra linha
- authorization: C18, C19, C26, C27, C28, C35, C64, C67, C75, C76, C90; existing - a guarda global (AD-022) e o `403` de cadastro obrigatório do 2FA pelas provas `guard_matrix_three_declarations_five_callers` e `admin_without_2fa_gets_403_everywhere_else`
- concurrency: C13 (CPF), C49 (campos diferentes do mesmo aluno), C37 (cursor sobre nomes iguais)
- data lifecycle: C47, C48, C4, C12 - inativar mantém a linha e o CPF; exclusão definitiva, anonimização e retenção são da `privacidade`, e a cópia da chave fora do servidor (Open question 1) é da `operacao`
- dependency failure: C58 (insert de auditoria que falha), C23 e C25 (valor cifrado ilegível; a falha não vaza o dado no log), C74 (web sem a API); banco fora na consulta cai no `500 internal_error` do `ProblemFilter` (prova `unhandled_500_hides_exception`, da `fundacao`)
- state transitions: C45, C46, C47, C48, C53, C81, C83
- observability: C25, C51 a C60 - a trilha de cadastro é o que esta feature torna observável; a leitura de ficha não grava (C30, Assumptions)

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado (KB de código e teste, dividido por quatro); o que já existe foi medido com `wc -c`. Código novo: S0 = 6k (inclui migração, o snapshot do Drizzle e o formato da cifra), S1 = 6k, S2 = 5k, S3 = 4k, S4 = 8k, S5 = 7k, S6 = 7k, S7 = 3k, S8 = 14k, S9 = 5k: 65k, dos quais 31k em `apps/api`, `packages/contracts` e `packages/database`, e 34k em `apps/web` e nos testes de tela. Arquivos existentes que a feature edita ou lê para editar (30 arquivos, 116 KB, os maiores: `audit.spec.ts` 13 KB, `users-panel.tsx` 10 KB, `compose.test.ts` 8 KB, `contracts.test.ts` 7 KB, `users.service.ts` 7 KB, `audit/page.tsx` 7 KB): 29k. `plan.md` (40 KB) e este arquivo (60 KB): 25k. Total 65k + 29k + 25k = 119k, abaixo do orçamento de 150k - one builder. Sem corte escrito além da regra: se a medição real passar de 150k, o corte é antes da S7, com 31k + 29k + 25k = 85k até ali
- Ordem: S0 primeiro (a tabela, a cifra, a chave e o contrato, de que todo o resto depende; `DATA_ENCRYPTION_KEY` entra em `.env.example`, `compose.yaml` e `support/app.ts` neste commit, ou nenhuma prova de API sobe), depois S1, S2, S3, S4, S5, S6, S9 salvo C91, S7, S8, e a C91 junto da S8. Antes da S1, conferir que `to_jsonb(students)` serve às provas de linha idêntica (a coluna de atualização entra na igualdade da C48)
- Mechanism: one builder (a estimativa cabe no orçamento, sem pergunta)
