# Consentimento e responsável legal - checks

Profile: standard
Plan: `.specs/features/consentimento/plan.md`

## Intent

88 checks in 9 slices (S0 e as 7 do plano, mais S8 de contrato, montagem e corrida) · 4 one-way doors · 2 open, of which 0 block the Build (a 2, o texto jurídico, bloqueia o go-live)

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`,
`playwright test <arquivo> -g`). Os arquivos `students-guardian.test.ts`, `consent-terms.test.ts`,
`consents-write.test.ts`, `consents-read.test.ts` e `consents-audit.test.ts` (em `apps/api/test`),
`support/consents.ts` (em `apps/api/test`), `packages/database/test/consent.test.ts` e
`apps/web/e2e/consents.spec.ts` são criados no Build; `contracts.test.ts`, `openapi.test.ts`,
`enrollment.test.ts`, `support/students.ts`, `repo.test.ts`, `compose.test.ts`, `students.spec.ts`,
`audit.spec.ts` e `fake-api.ts` existem e ganham casos. As regras de `features/auth-rbac/checks.md`,
`features/auditoria/checks.md` e `features/alunos/checks.md` (leitura de `audit_logs` por SQL, "exatamente
uma linha" como diferença de contagem, insert que falha por gatilho do próprio teste, `FakeApi` que
registra query, corpo e cabeçalhos, sessão real de cada perfil, relógio do teste, dois pedidos soltos por
uma barreira) seguem valendo. Regras próprias:

- A numeração acompanha o plano: de S1 a S7, **C(n) prova a AC (n - 15)** (C16 é a AC 1, C79 é a AC 64).
  S0 vem antes e S8 depois.
- "Linha de responsável" e "linha de consentimento" são lidas por SQL do banco do próprio teste como
  `to_jsonb(guardians)` e `to_jsonb(consents)`, sem depender de nome de coluna (o plano deixa os nomes
  para o diff). "Linha idêntica" é igualdade desse JSON antes e depois; "contagem" é `count(*)` da tabela.
- `consent_terms` só aceita `INSERT` (door 2) e nada o desfaz. O teste que acrescenta uma versão (C29,
  C31, C39, C40) sobe o banco dele, como `next_cursor_null_at_50_and_set_at_51` da `auditoria`, para que a
  versão 2 nunca apareça em outro teste. O texto de um termo é sempre lido por SQL de `consent_terms`,
  nunca escrito no teste, porque o texto jurídico ainda vai mudar (Open question 2).
- O menor de um teste de API nasce numa data calculada do relógio que o teste controla (hoje em
  `America/Sao_Paulo` menos 10 anos), nunca de uma data fixa de 2008. As provas de tela da ficha, que o
  servidor renderiza com o relógio dele, usam datas a mais de um ano de qualquer fronteira; a fronteira
  de 18 anos é provada na API (C16) e no formulário, que é cliente e aceita o relógio do teste (C63).
- O menor "legado", sem responsável, só existe por `INSERT` direto em `students` (a API o recusa):
  `support/consents.ts` traz esse inserto, o inserto de uma versão de termo e o de um consentimento com
  `granted_at` escolhido, que são as escritas de preparação por SQL.
- CPF de teste vem de `cpfOf(n)` de `support/students.ts`; o responsável usa `529.982.247-25`, nome
  "Ana Souza" e telefone `(11) 91234-5678` onde a prova não nomeia outro valor.
- Limites de tamanho são provados nas duas bordas (aceita no limite, recusa no limite mais um), com um
  caractere acentuado dentro do texto.
- A saída dos logs é capturada em stdout, stderr e `console` (as três).
- As provas de tela usam `FakeApi`, que passa a responder `GET /api/students/:id/consents`,
  `POST /api/students/:id/consents`, `DELETE /api/students/:id/consents/:consentId` e
  `GET /api/consent-terms`, e registra método, caminho, corpo e a ordem das chamadas.

### S0 - As três tabelas, o vocabulário de auditoria e os schemas, antes de qualquer rota · ~7 files · ~46 KB · ~11k

**C1** - Depois de `pnpm db:migrate` num banco vazio, `students` tem exatamente as colunas que a migração `0003` criou, sem coluna nova, sem `guardian_id` e sem chave estrangeira (door 1, AD-030)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "students_keeps_the_columns_of_0003_and_gains_no_foreign_key"`

**C2** - Uma linha de `guardians` inserida só com `student_id`, `name`, `cpf`, `phone` e `relationship` e sem `id` nem `created_at` recebe do banco um `uuid` de versão 7 e o instante do insert; faltando qualquer um dos cinco campos obrigatórios, o insert falha por `NOT NULL`; a tabela não tem a coluna `tenant_id` (door 1, AD-016)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "guardians_defaults_and_not_null"`

**C3** - `relationship` aceita `mother`, `father`, `legal_guardian` e `other` e recusa `uncle`, `Mother` e a cadeia vazia por violação de `CHECK`, e a tabela continua com as linhas de antes (door 1)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "guardians_relationship_check_four_values"`

**C4** - `guardians` aceita duas linhas do mesmo `student_id` e aceita o mesmo `cpf` em linhas de dois alunos, e em duas do mesmo aluno: não há `UNIQUE` sobre `student_id` nem sobre `cpf` (door 1)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "guardians_has_no_unique_on_student_or_cpf"`

**C5** - Um `student_id` que não existe em `students` faz o insert em `guardians` falhar por chave estrangeira, e um `DELETE` em `students` que atinge um aluno com linha em `guardians` falha por chave estrangeira, com o aluno e o responsável ainda lá (door 1, Impact `stored data`)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "guardians_student_foreign_key_restricts_delete"`

**C6** - Uma linha de `consent_terms` sem `text` falha por `NOT NULL`, e uma sem `created_at` recebe do banco o instante do insert (door 2)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "consent_terms_text_not_null_and_created_at_default"`

**C7** - Uma linha de `consents` inserida só com `student_id`, `purpose`, `term_version` e `granted_by` recebe do banco um `uuid` de versão 7, `granted_at` igual ao instante do insert e `revoked_at` nulo; faltando `purpose`, `term_version` ou `granted_by`, o insert falha por `NOT NULL`; a tabela não tem `tenant_id` (door 3, AD-016)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "consents_defaults_and_not_null"`

**C8** - Em `consents`, um par `(purpose, term_version)` que não existe em `consent_terms` (por exemplo `image_use` e 99), um `student_id` que não existe e um `guardian_id` que não existe fazem o insert falhar, cada um por violação de chave estrangeira (door 3)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "consents_three_foreign_keys_refuse_unknown_targets"`

**C9** - `granted_by` aceita `student` e `guardian` e recusa `staff`, `Student` e a cadeia vazia por violação de `CHECK` (door 3)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "consents_granted_by_check_two_values"`

**C10** - Em `consents`, `granted_by` igual a `student` com `guardian_id` nulo e `guardian_id` preenchido com `granted_by` igual a `guardian` são aceitos; `student` com `guardian_id` preenchido e `guardian` com `guardian_id` nulo são recusados por violação de `CHECK`, nos quatro casos (door 3)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "consents_guardian_id_iff_granted_by_guardian"`

**C11** - Dois consentimentos ativos (`revoked_at` nulo) do mesmo aluno e da mesma finalidade violam o índice único `consents_one_active_idx`, também quando as versões do termo diferem; um ativo e um revogado, dois revogados, o mesmo aluno com finalidades diferentes e dois alunos com a mesma finalidade convivem (door 3)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "consents_one_active_per_student_and_purpose"`

**C12** - Um `DELETE` em `students` que atinge um aluno com linha em `consents` falha por chave estrangeira, e um `DELETE` em `guardians` que atinge um responsável referenciado por `consents.guardian_id` falha por chave estrangeira, com as linhas ainda lá, nos dois casos (door 3, Impact `stored data`)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "consents_foreign_keys_restrict_delete_of_student_and_guardian"`

**C13** - `AUDIT_ACTIONS` em `packages/contracts` tem dezesseis valores: os treze de antes, na ordem de antes, seguidos de `student.guardian_saved`, `student.consent_granted` e `student.consent_revoked`, nessa ordem (door 4, AD-025)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_three_consent_actions_in_order"`

**C14** - Em `packages/contracts`, o schema do corpo de `POST /api/students/:id/consents` aceita `purpose` `data_processing` ou `image_use`, `termVersion` inteiro maior que zero e `grantedBy` `student` ou `guardian`, e recusa cada campo ausente, `purpose` `marketing`, `termVersion` igual a 0, a 1.5 e a `"1"`, e `grantedBy` `staff`; o schema de `guardian` aceita os quatro campos e recusa cada ausência, e recusa `null` (AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "consent_and_guardian_request_schemas_accept_and_reject"`

**C15** - Em `packages/contracts`, o schema de um consentimento aceita `guardian` igual a `null` ou a um objeto de `id` e `name`, e `revokedAt` igual a `null` ou a um instante, e recusa o objeto a que falta `id`, `purpose`, `termVersion`, `grantedBy`, `grantedAt` ou `revokedAt`; o schema da leitura da ficha aceita `guardian` igual a `null` e `items` vazio (AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "consent_response_schemas_accept_and_reject"`

### S1 - O menor exige responsável legal · ~5 files · ~28 KB · ~7k

**C16** - `isMinor(birthDate, today)` em `packages/contracts` devolve `true` para quem faz 18 anos amanhã e `false` para quem os faz hoje e para quem os fez ontem; para quem nasceu em 29/02/2008, `true` em 28/02/2026 e `false` em 01/03/2026; e `POST /api/students` com o relógio do teste em `2026-10-04T23:30:00-03:00` (já dia 05 em UTC) responde `201` sem `guardian` para `birthDate` `2008-10-04` e `422` com `path` `guardian` para `2008-10-05` (AC 1, Assumptions "Menor")
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "is_minor_boundaries_in_sao_paulo"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "post_minor_boundary_follows_the_sao_paulo_day"`

**C17** - `POST /api/students` de `admin` e de `reception`, para um aluno de dez anos com `guardian` de `name` "Ana Souza", `cpf` `529.982.247-25`, `phone` `(11) 91234-5678` e `relationship` `mother`, responde `201` nos dois casos; `guardians` tem uma linha do aluno criado com `cpf` `52998224725`, `phone` `11912345678`, o `name` e o `relationship` enviados; e `audit_logs` ganha exatamente uma linha `student.created` e exatamente uma `student.guardian_saved` (AC 2, door 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "create_201_stores_guardian_as_digits_and_two_audit_rows"`

**C18** - `POST /api/students` de um aluno de dez anos sem `guardian` responde `422` com exatamente um item em `errors`, cujo `path` é `guardian`, e a contagem de `students` e a de `guardians` não mudam (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "create_minor_without_guardian_422_creates_nothing"`

**C19** - `POST /api/students` responde `422` com um item em `errors` cujo `path` é `guardian.` seguido do campo, para `name` ausente, só com espaços e de 121 caracteres; `cpf` de 10 dígitos, de 12 dígitos, `111.111.111-11` e com dígito verificador errado (`529.982.247-15`); `phone` de 9 e de 12 dígitos; `relationship` `uncle`, `Mãe` e vazio; e responde `201` com `name` de 120 caracteres, `cpf` mascarado e sem máscara, `phone` de 10 e de 11 dígitos, e cada um dos quatro `relationship` (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "guardian_fields_422_on_dotted_path_both_bounds"`

**C20** - `POST /api/students` com `guardian.cpf` igual ao `cpf` do aluno, em dígitos e mascarado, e `PATCH /api/students/:id` com `guardian.cpf` igual ao `cpf` gravado do aluno (corpo sem `cpf`) e igual ao `cpf` novo enviado no mesmo corpo, respondem `422` com um item em `errors` cujo `path` é `guardian.cpf`, nos quatro casos; com o `cpf` de outro aluno, o `POST` responde `201` (AC 5, Assumptions "Dados do responsável")
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "guardian_cpf_equal_to_student_cpf_422"`

**C21** - `POST /api/students` de um aluno nascido em `2000-01-01` com `guardian` válido responde `201` e `guardians` tem uma linha dele (AC 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "create_adult_with_guardian_201_stores_it"`

**C22** - `PATCH /api/students/:id` com `birthDate` de menor e sem `guardian`: num aluno adulto sem responsável gravado responde `422` com um item cujo `path` é `guardian`, e a linha do aluno fica idêntica; no mesmo corpo com `guardian` responde `200` e `guardians` ganha uma linha; num menor que já tem responsável gravado responde `200`; num menor legado com o mesmo `birthDate` reenviado responde `422` com `path` `guardian`; e com `birthDate` de adulto, num aluno sem responsável, responde `200` (AC 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "patch_birth_date_of_minor_needs_a_stored_or_sent_guardian"`

**C23** - `PATCH /api/students/:id` com `guardian` de `phone` diferente do responsável atual responde `200`, `guardians` passa de uma para duas linhas do aluno, a linha anterior fica idêntica à de antes, e `audit_logs` ganha exatamente uma linha, `student.guardian_saved`, com os demais campos do corpo iguais aos atuais; o mesmo para um aluno sem responsável gravado, que passa de zero para uma linha (AC 8, door 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "patch_guardian_inserts_new_row_and_keeps_the_old"`

**C24** - `PATCH /api/students/:id` com `guardian` igual em todos os campos ao atual, com `cpf` e `phone` mascarados e o `name` com espaços nas pontas, responde `200`, e a contagem de `guardians` e a de `audit_logs` não mudam (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "patch_same_guardian_inserts_nothing"`

**C25** - Num menor legado, sem responsável gravado, `PATCH /api/students/:id` só com `phone` responde `200` e grava o telefone novo (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "patch_without_birth_date_on_legacy_minor_200"`

**C26** - `PATCH /api/students/:id` com `guardian` igual a `null`, e com `guardian` sem `name`, sem `cpf`, sem `phone` e sem `relationship`, responde `422` com um item em `errors` cujo `path` é `guardian` no primeiro caso e `guardian.` seguido do campo que falta nos outros quatro, e a linha do aluno e a contagem de `guardians` não mudam (AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "patch_guardian_null_or_incomplete_422"`

**C27** - `POST /api/students` com `guardian` válido e `cpf` já usado (`409` com `cpf_taken`), `POST` com `guardian` válido e `phone` do aluno de 9 dígitos (`422`), `PATCH` com `guardian` novo e `cpf` de outro aluno (`409`) e `PATCH` com `guardian` novo e `phone` de 9 dígitos (`422`) respondem cada um o status do caso e deixam todas as linhas de `guardians` idênticas às de antes (AC 12)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "rejected_student_writes_leave_guardians_untouched"`

### S2 - Termos versionados e imutáveis · ~4 files · ~12 KB · ~3k

**C28** - `GET /api/consent-terms` de `admin` e de `reception` responde `200` com exatamente dois itens, um `data_processing` e um `image_use`, cada um com exatamente as chaves `purpose`, `version`, `text` e `createdAt`, `version` igual a 1 e `text` igual ao de `consent_terms` lido por SQL (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consent-terms.test.ts -t "terms_200_one_per_purpose_for_admin_and_reception"`

**C29** - Com as versões 2 e 10 inseridas para `data_processing`, `GET /api/consent-terms` devolve `data_processing` na versão 10, com o texto dela, e `image_use` na versão 1, dois itens ao todo: a maior versão é a numérica, não a de texto (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consent-terms.test.ts -t "terms_returns_only_the_highest_version_numerically"`

**C30** - Em `consent_terms`, um `UPDATE` de cada uma das colunas `purpose`, `version`, `text` e `created_at`, um `UPDATE` que grava na coluna o valor que ela já tem, e um `DELETE` falham com a mensagem `consent_terms is append-only`; um `TRUNCATE ... CASCADE` falha com a mesma mensagem; um `TRUNCATE` simples falha recusado pelo Postgres por chave estrangeira (SQLSTATE `0A000`), antes do gatilho; e as linhas lidas depois são idênticas às de antes em todos os casos (AC 15, door 2, AD-024)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "consent_terms_update_delete_truncate_refused"`

**C31** - Em `consent_terms`, o insert de `marketing`, de `Data_Processing`, de `version` 0, de `version` -1 e da versão 1 de `data_processing` que já existe falha, nos cinco casos; o insert da versão 2 de `data_processing` e da versão 2 de `image_use` é aceito (AC 16, door 2)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "consent_terms_rejects_bad_purpose_version_and_duplicate"`

**C32** - Depois de `pnpm db:migrate` num banco vazio, `consent_terms` tem exatamente duas linhas, a versão 1 de `data_processing` e a versão 1 de `image_use`, cada uma com `text` de mais de 20 caracteres depois de aparado (AC 17)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "migrate_on_empty_database_seeds_version_1_of_both_purposes"`

### S3 - Registrar e revogar consentimento · ~4 files · ~30 KB · ~8k

**C33** - `POST /api/students/:id/consents` de `admin` e de `reception`, com `purpose` `image_use`, `termVersion` 1 e `grantedBy` `student`, para um aluno adulto, responde `201` com exatamente as chaves `id`, `purpose`, `termVersion`, `grantedBy`, `guardian`, `grantedAt` e `revokedAt`, `guardian` e `revokedAt` iguais a `null`, e `grantedAt` entre o `now()` do banco lido antes e o lido depois, mesmo com `grantedAt` de `2000-01-01T00:00:00Z` no corpo e `Date` de 2000 no cabeçalho (AC 18, Assumptions "Instante do aceite")
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "grant_201_by_student_for_adult_with_database_clock"`

**C34** - Para um menor com responsável gravado, `POST` com `grantedBy` `guardian` responde `201` com `guardian` igual a exatamente as chaves `id` e `name` do responsável atual, e a linha em `consents` aponta para esse `id`; o mesmo para um adulto que tem responsável gravado; e, depois de `PATCH` trocar o responsável, a concessão seguinte aponta para o novo (AC 19, door 3, Assumptions "Quem concede, adulto com responsável gravado")
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "grant_201_by_guardian_links_the_current_guardian"`

**C35** - `POST` com `grantedBy` `student` para um menor, com e sem responsável gravado, responde `422` com exatamente um item em `errors` cujo `path` é `grantedBy`, nos dois casos, e a contagem de `consents` não muda (AC 20)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "grant_by_student_for_minor_422_on_granted_by"`

**C36** - `POST` com `grantedBy` `guardian` para um aluno adulto sem responsável gravado e para um menor legado sem responsável responde `422` com um item em `errors` cujo `path` é `grantedBy`, nos dois casos, e a contagem de `consents` não muda (AC 21)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "grant_by_guardian_without_guardian_422_on_granted_by"`

**C37** - `POST` responde `422` com um item em `errors` cujo `path` é o campo, para `purpose` `marketing` e ausente, `termVersion` igual a 0, a 1.5 e a `"1"`, e `grantedBy` `staff` e ausente, nos sete casos, e a contagem de `consents` não muda (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "grant_invalid_fields_422_on_each_path"`

**C38** - `POST` com `image_use` e `termVersion` 99, e com `data_processing` e `termVersion` 99, responde `422` com um item em `errors` cujo `path` é `termVersion`, nos dois casos, e a contagem de `consents` não muda (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "grant_unknown_term_422_on_term_version"`

**C39** - Com as versões 1 e 2 de `data_processing` em `consent_terms`, `POST` com `termVersion` 1 responde `409` com `code` igual a `consent_term_outdated` e a contagem de `consents` não muda; com `termVersion` 2 responde `201` (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "grant_outdated_term_409_consent_term_outdated"`

**C40** - Para um aluno com `image_use` ativo na versão 1, `POST` de `image_use` na versão 1 responde `409` com `code` igual a `consent_active`; depois de a versão 2 existir, `POST` de `image_use` na versão 2 responde também `409` com `consent_active`; e `POST` de `data_processing` responde `201`; a contagem de `consents` não muda nos dois `409` (AC 25)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "grant_with_active_consent_409_consent_active"`

**C41** - Dez rodadas de dois `POST /api/students/:id/consents` da mesma finalidade para o mesmo aluno, soltos juntos, dão em cada rodada um `201` e um `409` com `code` igual a `consent_active`, `consents` tem um único consentimento ativo daquele aluno e finalidade, e `audit_logs` ganha exatamente uma linha `student.consent_granted` por rodada (AC 26, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "ten_concurrent_grants_one_201_one_409"`

**C42** - `DELETE /api/students/:id/consents/:consentId` de `admin` e de `reception`, sobre consentimento ativo, responde `204` sem corpo, preenche `revoked_at` com um instante entre o `now()` do banco lido antes e o lido depois, mantém a contagem de `consents`, e a linha lida depois é idêntica à de antes em todas as colunas menos `revoked_at` (AC 27, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "revoke_204_keeps_row_and_sets_revoked_at"`

**C43** - `DELETE` sobre um consentimento já revogado responde `204`, `revoked_at` fica igual ao de antes e a contagem de `audit_logs` não muda (AC 28)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "revoke_of_revoked_204_changes_nothing"`

**C44** - Depois de revogar, `POST` da mesma finalidade para o mesmo aluno responde `201`, a contagem de `consents` sobe de um, a linha nova tem `revoked_at` nulo e a revogada fica idêntica à de antes, inclusive `revoked_at` (AC 29, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "grant_after_revoke_inserts_another_row"`

**C45** - Respondem `404` com `code` igual a `not_found`, nos nove casos: `GET` e `POST` de consentimentos com `:id` igual a `abc` e com um `uuid` de aluno nenhum; `DELETE` com `:id` igual a `abc` e com `uuid` de aluno nenhum; `DELETE` com `:consentId` igual a `abc`, com `uuid` de consentimento nenhum e com o `consentId` de outro aluno, que continua ativo (AC 30)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "consent_routes_404_for_nine_bad_ids"`

**C46** - `POST` de consentimento para um aluno `inactive` e para um `suspended` responde `201` nos dois casos (AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "grant_for_inactive_and_suspended_student_201"`

**C47** - `GET /api/consent-terms`, `GET` e `POST /api/students/:id/consents` e `DELETE /api/students/:id/consents/:consentId` de `hr_finance` e de `instructor` respondem, nos oito casos, `403` com `code` igual a `forbidden`, e a contagem de `consents` e a de `audit_logs` não mudam, com o consentimento do `DELETE` ainda ativo (AC 32)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "consent_routes_403_for_hr_finance_and_instructor"`

**C48** - As quatro rotas de consentimento chamadas sem cookie respondem, nos quatro casos, `401` com `code` igual a `unauthorized` (AC 33)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-write.test.ts -t "consent_routes_401_without_session"`

### S4 - A ficha do consentimento, lida de volta · ~3 files · ~8 KB · ~2k

**C49** - `GET /api/students/:id/consents` de `admin` e de `reception` responde `200` com exatamente as chaves `guardian` e `items`; `guardian` tem exatamente `id`, `name`, `cpf`, `phone`, `relationship` e `createdAt` e é o responsável de maior `id` do aluno, também depois de cinco `PATCH` seguidos que trocam o responsável (o quinto é o atual); cada item tem exatamente `id`, `purpose`, `termVersion`, `grantedBy`, `guardian`, `grantedAt` e `revokedAt`; `items` traz os três consentimentos do aluno, o revogado inclusive, do `granted_at` mais recente ao mais antigo (AC 34)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-read.test.ts -t "ficha_200_current_guardian_and_all_items_newest_first"`

**C50** - Para um consentimento concedido pelo responsável G1 e um `PATCH` que depois trocou o responsável para G2, o item traz em `guardian` o `id` e o `name` de G1, e o `guardian` do topo traz G2; um item concedido por `student` traz `guardian` igual a `null` (AC 35, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-read.test.ts -t "item_guardian_is_the_one_at_grant_time"`

**C51** - Para um aluno sem responsável e sem consentimento, `GET /api/students/:id/consents` responde `200` com o corpo igual a `{"guardian":null,"items":[]}` (AC 36)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-read.test.ts -t "ficha_200_empty_for_student_without_anything"`

**C52** - `GET /api/consent-terms` e `GET /api/students/:id/consents` que respondem `200` para `admin` e para `reception` não mudam a contagem de `audit_logs`, nos quatro casos (AC 37)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-read.test.ts -t "reading_consents_writes_no_audit_row"`

### S5 - Cada ato deixa rastro, na mesma transação · ~3 files · ~18 KB · ~5k

**C53** - Cada ato grava exatamente uma linha, com `user_id` igual ao id do autor, `entity` igual a `student` e `entity_id` igual ao id do aluno: `POST /api/students` com `guardian` grava `student.created` e `student.guardian_saved`; `PATCH` com `guardian` novo grava `student.guardian_saved`; `POST` de consentimento grava `student.consent_granted`; `DELETE` grava `student.consent_revoked`; e um `PATCH` que muda o `phone` do aluno e o responsável grava duas linhas, `student.updated` e `student.guardian_saved`; os atos feitos por `admin` e por `reception` (AC 38, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-audit.test.ts -t "one_audit_row_per_act_with_actor_and_student_target"`

**C54** - `POST /api/students` de um menor com `guardian` grava na linha `student.guardian_saved` o `diff` igual a `{"fields":["name","cpf","phone","relationship"],"values":{}}` (AC 39, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-audit.test.ts -t "diff_of_guardian_saved_on_create_names_four_fields_only"`

**C55** - `PATCH /api/students/:id` que troca só o `phone` do responsável grava `student.guardian_saved` com `diff` igual a `{"fields":["phone"],"values":{}}` (AC 40, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-audit.test.ts -t "diff_of_guardian_saved_on_patch_names_the_changed_field"`

**C56** - A concessão de `image_use`, versão 1, por `guardian` grava `diff` igual a `{"fields":["purpose","termVersion","grantedBy"],"values":{"purpose":{"from":null,"to":"image_use"},"termVersion":{"from":null,"to":1},"grantedBy":{"from":null,"to":"guardian"}}}`; a de `data_processing`, versão 1, por `student` grava o mesmo formato com `data_processing`, 1 e `student` em `to` (AC 41, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-audit.test.ts -t "diff_of_consent_granted_has_null_from"`

**C57** - A revogação dos dois consentimentos da C56 grava `diff` com `fields` igual a `["purpose","termVersion","grantedBy"]` e, em `values`, cada campo com o valor do consentimento em `from` e `null` em `to` (AC 42, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-audit.test.ts -t "diff_of_consent_revoked_has_null_to"`

**C58** - Onze requisições terminam, cada uma, no status do caso e deixam `audit_logs` com a contagem de antes: `POST` de consentimento sem cookie (`401`), de `hr_finance` (`403`), para aluno que não existe (`404`), com consentimento ativo (`409` `consent_active`), com versão antiga (`409` `consent_term_outdated`) e com `grantedBy` `staff` (`422`); `DELETE` de `consentId` que não existe (`404`) e de consentimento já revogado (`204`); `POST /api/students` de menor sem `guardian` (`422`) e com `guardian` e CPF repetido (`409` `cpf_taken`); `PATCH` com `guardian` igual a `null` (`422`) (AC 43)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-audit.test.ts -t "rejected_consent_requests_write_no_row"`

**C59** - Com o insert em `audit_logs` falhando, `POST /api/students` com `guardian`, `PATCH /api/students/:id` com `guardian` novo, `POST` de consentimento e `DELETE` de consentimento respondem `500` com `code` igual a `internal_error`, e `students`, `guardians` e `consents` ficam idênticos aos de antes, com o consentimento do `DELETE` ainda ativo, nos quatro casos (AC 44, AD-027)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-audit.test.ts -t "audit_insert_failure_rolls_back_four_routes"`

**C60** - Percorridos o `POST` de aluno com responsável, a troca do responsável por `PATCH`, a concessão e a revogação, o texto de todas as colunas de todas as linhas de `audit_logs` não contém nenhum dos sete valores: o nome do responsável (o primeiro e o trocado), o CPF dele em dígitos, o CPF mascarado, o telefone em dígitos, o telefone como digitado, o texto do termo de `data_processing` e o texto do termo de `image_use` (AC 45, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-audit.test.ts -t "seven_guardian_and_term_values_never_reach_audit_logs"`

**C61** - Para cada uma das ações `student.guardian_saved`, `student.consent_granted` e `student.consent_revoked`, com `X-Forwarded-For: 198.51.100.1, 203.0.113.7` e `User-Agent` de 513 caracteres, a linha grava `ip` igual a `203.0.113.7` e `user_agent` com os primeiros 512; sem o cabeçalho `User-Agent`, `user_agent` é nulo (AC 46, AD-028)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-audit.test.ts -t "ip_and_user_agent_on_the_three_consent_actions"`

**C62** - Percorridas as mesmas quatro operações da C60, a leitura da ficha e uma operação cujo insert em `audit_logs` falha, nenhuma linha de log, em stdout, stderr e `console`, contém os sete valores da C60 (AC 47)
Proof: `pnpm --filter "./apps/api" exec vitest run test/consents-audit.test.ts -t "seven_guardian_and_term_values_never_reach_the_log"`

### S6 - Formulário e ficha com responsável e consentimentos · ~10 files · ~48 KB · ~12k

**C63** - Em `/students/new` e em `/students/<id>/edit`, com o relógio do navegador em `2026-10-04T23:30:00-03:00` e o navegador em `UTC`, digitar a data de nascimento `2008-10-05` exibe o bloco "Responsável legal" com os campos "Nome do responsável", "CPF do responsável", "Telefone do responsável" e "Parentesco", e as opções "Mãe", "Pai", "Responsável legal" e "Outro"; digitar `2008-10-04` e digitar `1990-11-30` não exibe o bloco; trocar de volta para uma data de adulto o esconde; e com o bloco exibido e os quatro campos vazios, acionar "Salvar" não envia escrita à API (AC 48)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "guardian_block_shown_only_for_minor_on_both_forms"`

**C64** - Salvar o formulário de um menor envia `guardian` no mesmo `POST` ou `PATCH` do aluno, com `name`, `cpf`, `phone` e `relationship` iguais ao digitado e `relationship` igual a `mother`, `father`, `legal_guardian` e `other` para "Mãe", "Pai", "Responsável legal" e "Outro", nos quatro casos; em `/students/<id>/edit` de um menor que já tem responsável, a página chama `GET /api/students/<id>/consents`, os quatro campos vêm preenchidos com o atual e, salvo sem tocá-los, o `PATCH` leva `guardian` com `name` e `relationship` iguais e `cpf` e `phone` iguais em dígitos aos gravados; e o `POST` e o `PATCH` de um adulto, com ou sem responsável gravado, não levam a chave `guardian` (AC 49)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "form_sends_guardian_in_the_same_write_and_prefills_on_edit"`

**C65** - Com a API respondendo `422` com `path` `guardian.name`, `guardian.cpf`, `guardian.phone`, `guardian.relationship` e `guardian`, nos cinco casos, a `message` aparece junto do campo "Nome do responsável", "CPF do responsável", "Telefone do responsável" e "Parentesco" nos quatro primeiros e dentro do bloco "Responsável legal" no quinto, e os demais campos do formulário mantêm o que foi digitado (AC 50)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "guardian_422_shown_on_each_field_keeps_the_rest"`

**C66** - `/students/<id>` aberta por `admin` e por `reception` exibe o bloco "Responsável e consentimentos" com o nome, o CPF `529.982.247-25`, o telefone `(11) 91234-5678` e o parentesco por extenso do responsável que a API devolveu, "Mãe", "Pai", "Responsável legal" e "Outro" para os quatro valores; sem responsável, exibe "Nenhum responsável cadastrado." (AC 51)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "ficha_block_shows_guardian_or_none"`

**C67** - Para um aluno menor sem responsável, o bloco exibe "Responsável pendente: edite o aluno para cadastrar o responsável legal."; para um adulto sem responsável exibe "Nenhum responsável cadastrado." e não exibe o texto de pendência; para um menor com responsável não exibe o texto de pendência (AC 52)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "ficha_block_shows_pending_guardian_for_minor_only"`

**C68** - Para cada finalidade, "Uso de dados pessoais" e "Uso da imagem", o bloco exibe "Consentido, versão 1, em 04/10/2026" para um consentimento ativo com `grantedAt` `2026-10-05T02:30:00.000Z`, "Revogado em 04/10/2026" quando só há revogados com `revokedAt` `2026-10-05T02:30:00.000Z`, e "Pendente" quando não há nenhum; com um revogado e um ativo da mesma finalidade, exibe o texto de "Consentido" e não o de "Revogado" (AC 53)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "ficha_shows_three_states_for_each_purpose"`

**C69** - Para cada finalidade pendente ou só com consentimento revogado, o bloco exibe o botão "Registrar consentimento" e não o "Revogar"; para a finalidade com consentimento ativo, exibe "Revogar" e não "Registrar consentimento" (AC 54)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "ficha_buttons_follow_the_state_of_each_purpose"`

**C70** - Acionar "Registrar consentimento" de "Uso da imagem", num adulto com responsável, faz a página chamar `GET /api/consent-terms` e abre um diálogo com o texto vigente inteiro, com as quebras de linha e com `<b>negrito</b>` do texto mostrado como caracteres, sem elemento `b`; com as escolhas "O próprio aluno" e "O responsável: Ana Souza" e o botão "Confirmar"; antes de "Confirmar" nenhuma escrita chega à API, e cancelar não envia nada; confirmar com "O próprio aluno" envia um único `POST /api/students/<id>/consents` com o corpo `{"purpose":"image_use","termVersion":3,"grantedBy":"student"}` e, com "O responsável: Ana Souza", o mesmo corpo com `grantedBy` `guardian`, sendo 3 a versão que o `FakeApi` serviu (AC 55)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "grant_dialog_shows_term_and_confirms_before_sending"`

**C71** - Para um menor com responsável, o diálogo oferece só "O responsável: Ana Souza" e não "O próprio aluno", e confirmar envia `grantedBy` igual a `guardian`; para um menor sem responsável gravado, "Confirmar" fica desabilitado, o diálogo exibe o texto de pendência da C67 e nenhuma escrita chega à API (AC 56)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "grant_dialog_for_minor_offers_only_the_guardian"`

**C72** - Acionar "Revogar" de "Uso da imagem" abre um diálogo que contém "Uso da imagem" e o nome do aluno; antes de confirmar nenhuma escrita chega à API, e cancelar não envia nada; confirmar envia `DELETE /api/students/<id>/consents/<consentId>` com o `id` do consentimento ativo (AC 57)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "revoke_dialog_names_purpose_and_student_before_sending"`

**C73** - Terminada a concessão, o bloco exibe "Consentido, versão 1, em dd/MM/aaaa" para a finalidade, com a data devolvida pela API a leitura seguinte; terminada a revogação, exibe "Revogado em dd/MM/aaaa" (AC 58)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "block_shows_new_state_after_grant_and_revoke"`

**C74** - Com a API respondendo `409` com `consent_active` ao `POST`, o diálogo exibe "Este consentimento já foi registrado." e a página chama de novo `GET /api/consent-terms`; com `409` com `consent_term_outdated`, exibe "O termo foi atualizado. Leia a nova versão e confirme de novo.", mostra o texto da versão 2 que o `FakeApi` passa a servir, e confirmar de novo envia `termVersion` igual a 2 (AC 59)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "grant_409_messages_reload_the_term"`

**C75** - Com `GET /api/students/<id>/consents` respondendo `500`, `/students/<id>` exibe "Não foi possível carregar os consentimentos." e o botão "Tentar novamente", com o nome e os campos do aluno ainda na página; acionar o botão com a API de volta exibe o bloco (AC 60)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "consents_load_failure_shows_retry_without_hiding_ficha"`

**C76** - `/students/<id>` aberta por `hr_finance` e por `instructor` não contém o texto "Responsável e consentimentos", e o `FakeApi` não registra chamada a `GET /api/students/<id>/consents` nem a `GET /api/consent-terms`, nos dois casos (AC 61)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts -g "ficha_has_no_consent_block_or_calls_for_hr_finance_and_instructor"`

### S7 - A trilha na tela de Auditoria · ~3 files · ~4 KB · ~1k

**C77** - `/audit` exibe "Responsável do aluno salvo", "Consentimento registrado" e "Consentimento revogado" na coluna "Ação" para linhas de `student.guardian_saved`, `student.consent_granted` e `student.consent_revoked`, e o filtro "Ação" oferece as dezesseis ações, as três novas nas posições 14, 15 e 16, nessa ordem (AC 62)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "consent_actions_labelled_and_filter_has_sixteen"`

**C78** - Uma linha `student.consent_granted` com `purpose` `image_use`, `termVersion` 1 e `grantedBy` `guardian` em `fields` exibe em "Detalhes" "Finalidade: — → Uso da imagem", "Versão do termo: — → 1" e "Concedido por: — → Responsável" (AC 63)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "consent_granted_details_show_purpose_version_and_grantor"`

**C79** - Uma linha `student.guardian_saved` com `phone` em `fields` exibe em "Detalhes" "Telefone alterado" (AC 64)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "guardian_saved_details_show_changed_phone"`

### S8 - Contrato, montagem do processo real, corrida do responsável e definição única · ~7 files · ~8 KB · ~2k

**C80** - No documento de `GET /api/openapi.json`, `paths` traz `get` em `/api/consent-terms`, `get` e `post` em `/api/students/{id}/consents` e `delete` em `/api/students/{id}/consents/{consentId}`; o `requestBody` do `post` de consentimentos e a propriedade `guardian` do corpo de `post` em `/api/students` e de `patch` em `/api/students/{id}` têm o schema igual ao de `z.toJSONSchema` do schema de `packages/contracts` (AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "consent_paths_and_guardian_body_come_from_contract_schemas"`

**C81** - Os corpos reais `200` de `GET /api/consent-terms`, `200` de `GET /api/students/:id/consents` (para um aluno com responsável e consentimentos, e para um sem nada) e `201` de `POST /api/students/:id/consents` validam contra os schemas de resposta em `packages/contracts` (AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "consent_bodies_match_contract_schemas"`

**C82** - Os corpos reais dos dois `409` de `POST /api/students/:id/consents`, `consent_active` e `consent_term_outdated`, têm `status` igual a 409, o `code` do caso, `Content-Type` `application/problem+json` e validam contra `problemSchema` (AD-009, AD-021)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "consent_codes_are_known_409_codes"`

**C83** - `admin` sem 2FA ativo recebe `403` com `code` igual a `two_factor_enrollment_required` nas quatro rotas de consentimento, e a lista escrita no teste das rotas bloqueadas as inclui (Surface, `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C84** - Na stack de pé, um usuário `reception` cria um menor com `guardian` por `POST /api/students`, lê `GET /api/consent-terms`, concede `image_use` por `grantedBy` `guardian` e revoga, tudo na origem do container `web`; o banco da stack tem a linha de `guardians`, a de `consents` com `revoked_at` preenchido, as duas linhas de `consent_terms` da migração, e as linhas `student.created`, `student.guardian_saved`, `student.consent_granted` e `student.consent_revoked` de `audit_logs` com `ip` e `user_agent` enviados (door 1, door 2, door 3, Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "minor_with_guardian_and_consent_through_web_store_rows_and_audit"`

**C85** - O `text` da versão 1 de `data_processing` e o da versão 1 de `image_use` começam por `RASCUNHO` (door 2, Open question 2)
Proof: `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts -t "version_1_texts_are_marked_as_draft"`

**C86** - Dez rodadas de dois `PATCH /api/students/:id` soltos juntos, os dois com o mesmo `guardian` novo, dão `200` aos dois em cada rodada e `guardians` sobe de exatamente uma linha por rodada, com uma só linha `student.guardian_saved` (AC 8, AC 9, Flow)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "ten_concurrent_patches_with_same_guardian_insert_one_row"`

**C87** - Dez rodadas de dois `PATCH /api/students/:id` soltos juntos, com dois `guardian` novos diferentes entre si, dão `200` aos dois em cada rodada, `guardians` sobe de exatamente duas linhas por rodada, e `GET /api/students/:id/consents` devolve como atual o `guardian` de uma das duas, nunca um misto dos campos (AC 8, door 1, Flow)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-guardian.test.ts -t "ten_concurrent_patches_with_different_guardians_insert_two_rows"`

**C88** - `isMinor` é exportada por `packages/contracts` e nenhum outro arquivo de `apps/` ou de `packages/` declara função ou constante com esse nome (Impact `minor`, AD-011)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "is_minor_defined_once_in_contracts"`

## Coverage

Uma linha para cada rota da `Surface`, com os status como membros, e uma por rota e perfil; depois as
doors, as entidades de `Relations` e os conjuntos enumerados nos critérios. Nas duas rotas de alunos que
a feature muda, a linha traz só os status que a feature acrescenta ou muda; `401`, `403` e `404` delas
seguem provados em `alunos`.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/consent-terms` statuses (3) | 200 C28 · 401 C48 · 403 C47 | - |
| `GET /api/students/:id/consents` statuses (4) | 200 C49 · 401 C48 · 403 C47 · 404 C45 | - |
| `POST /api/students/:id/consents` statuses (6) | 201 C33 · 401 C48 · 403 C47 · 404 C45 · 409 C40 · 422 C37 | - |
| `DELETE /api/students/:id/consents/:consentId` statuses (4) | 204 C42 · 401 C48 · 403 C47 · 404 C45 | - |
| `POST /api/students` statuses que a feature acrescenta (3) | 201 com `guardian` C17 · 409 com `guardian` C27 · 422 por menor sem `guardian` C18 | - |
| `PATCH /api/students/:id` statuses que a feature acrescenta (3) | 200 com `guardian` novo C23 · 409 com `guardian` C27 · 422 por menor sem responsável C22 | - |
| status fora da `Surface`, `500` (4) | `POST /api/students` C59 · `PATCH /api/students/:id` C59 · `POST` de consentimento C59 · `DELETE` de consentimento C59 | - |
| rotas de consentimento sem sessão (4) | `GET /api/consent-terms` C48 · `GET` de consentimentos C48 · `POST` C48 · `DELETE` C48 | - |
| `GET /api/consent-terms` por perfil (4) | `admin` C28 · `reception` C28 · `hr_finance` C47 · `instructor` C47 | - |
| `GET /api/students/:id/consents` por perfil (4) | `admin` C49 · `reception` C49 · `hr_finance` C47 · `instructor` C47 | - |
| `POST /api/students/:id/consents` por perfil (4) | `admin` C33 · `reception` C33 · `hr_finance` C47 · `instructor` C47 | - |
| `DELETE /api/students/:id/consents/:consentId` por perfil (4) | `admin` C42 · `reception` C42 · `hr_finance` C47 · `instructor` C47 | - |
| one-way doors (4) | door 1 C4 · door 2 C30 · door 3 C11 · door 4 C13 | - |
| entidades de `Relations` (3) | `guardians` C2 · `consent_terms` C6 · `consents` C7 | - |
| one-way constraints de `Relations` (7) | `students` sem coluna de responsável C1 · finalidade e versão como chave C31 · finalidade restrita a dois valores C31 · consentimento aponta para a versão exata do termo C8 · consentimento aponta para o aluno C8 · `guardian_id` se e somente se `granted_by` é `guardian` C10 · um consentimento ativo por aluno e finalidade C11 | - |
| operações recusadas em `consent_terms` (4) | `UPDATE` C30 · `DELETE` C30 · `TRUNCATE ... CASCADE` C30 · `TRUNCATE` simples C30 (`0A000`) | - |
| colunas de `consent_terms` sob `UPDATE` (4) | C30, table-driven over all 4: `purpose`, `version`, `text`, `created_at` | - |
| operações recusadas pelo banco em `guardians` e `consents` (4) | `DELETE` do aluno com responsável C5 · `DELETE` do aluno com consentimento C12 · `DELETE` do responsável referenciado C12 · segundo consentimento ativo C11 | - |
| `relationship` do responsável (4) | `mother` C3, C19 · `father` C3, C19 · `legal_guardian` C3, C19 · `other` C3, C19; `uncle` recusado C3, C19 | - |
| `granted_by` (2) | `student` C33 · `guardian` C34 | - |
| `purpose` (2) | `data_processing` C28 · `image_use` C28 | - |
| `purpose` no `diff` da concessão (2) | `image_use` C56 · `data_processing` C56 | - |
| termos publicados na migração (2) | versão 1 de `data_processing` C32 · versão 1 de `image_use` C32 | - |
| marca de rascunho no texto (2) | `data_processing` C85 · `image_use` C85 | - |
| versão vigente do termo (3) | uma versão C28 · duas versões C29 · versão 10 contra 2 C29 | - |
| inserts recusados em `consent_terms` (5) | finalidade fora do conjunto C31 · `version` 0 C31 · `version` -1 C31 · versão repetida C31 · `Data_Processing` C31; versão 2 aceita C31 | - |
| `isMinor`, bordas (5) | faz 18 anos hoje C16 · faz 18 anos amanhã C16 · 29/02 em 28/02 do ano comum C16 · 29/02 em 01/03 do ano comum C16 · 23:30 de São Paulo com o dia seguinte em UTC C16 | - |
| lugares que decidem "menor" (3) | API C16 · formulário C63 · ficha C67 | - |
| definição única de `isMinor` (1) | C88 | - |
| `POST /api/students` por idade e `guardian` (3) | menor com `guardian` C17 · menor sem C18 · adulto com C21 | - |
| `PATCH /api/students/:id` com `birthDate` (5) | menor sem responsável e sem `guardian` C22 · menor com `guardian` no corpo C22 · menor com responsável gravado C22 · menor legado com o mesmo `birthDate` C22 · adulto C22 | - |
| `PATCH` sem `birthDate` num menor legado (1) | C25 | - |
| `guardian` no `PATCH` (5) | dados diferentes C23 · aluno sem responsável C23 · dados iguais C24 · `null` C26 · campo ausente C26 | - |
| campos de `guardian` (4) | `name` C19, C26 · `cpf` C19, C26 · `phone` C19, C26 · `relationship` C19, C26 | - |
| `guardian.name`, limites (2 edges) | 120 C19 · 121 C19 | - |
| `guardian.phone`, bordas (4 edges) | 9 C19 · 10 C19 · 11 C19 · 12 C19 | - |
| `guardian.cpf` recusado (4 causas) | 10 dígitos C19 · 12 dígitos C19 · dígitos repetidos C19 · dígito verificador errado C19; mascarado aceito C19 | - |
| `guardian.cpf` igual ao do aluno (5) | `POST` em dígitos C20 · `POST` mascarado C20 · `PATCH` com `cpf` gravado C20 · `PATCH` com `cpf` novo C20 · `cpf` de outro aluno aceito C20 | - |
| escritas de aluno recusadas que não gravam em `guardians` (4) | `POST` `409` C27 · `POST` `422` C27 · `PATCH` `409` C27 · `PATCH` `422` C27 | - |
| corrida sobre o responsável (2) | mesmo `guardian` em dois `PATCH` C86 · `guardian` diferentes C87 | - |
| responsável atual (2) | o de maior `id` C49 · cinco trocas seguidas C49 | - |
| tabela de decisão da concessão (5) | adulto por `student` C33 · menor por `guardian` C34 · adulto com responsável por `guardian` C34 · menor por `student` C35 · sem responsável por `guardian` C36 | - |
| valores recusados no `POST` de consentimento (7) | `purpose` `marketing` C37 · `purpose` ausente C37 · `termVersion` 0 C37 · `termVersion` 1.5 C37 · `termVersion` `"1"` C37 · `grantedBy` `staff` C37 · `grantedBy` ausente C37 | - |
| termo na concessão (3) | não existe C38 · não é o vigente C39 · vigente C33, C39 | - |
| consentimento ativo na concessão (3) | mesma versão C40 · outra versão C40 · outra finalidade C40 | - |
| corrida sobre a concessão (1) | dez rodadas de dois `POST` C41 | - |
| revogação (3) | consentimento ativo C42 · já revogado C43 · de outro aluno, `404` C45 | - |
| conceder depois de revogar (2) | segunda linha inserida C44 · revogada intacta C44 | - |
| `id` inválido nas rotas de consentimento (9) | C45, table-driven over all 9 | - |
| situação do aluno na concessão (2) | `inactive` C46 · `suspended` C46 | - |
| perfis sem acesso às rotas de consentimento (8) | C47, table-driven over all 8: 4 rotas e 2 perfis | - |
| chaves do corpo de `GET /api/students/:id/consents` (3 conjuntos) | topo, duas chaves C49 · `guardian`, seis chaves C49 · item, sete chaves C49 | - |
| leitura de consentimentos (4) | ordem do mais recente ao mais antigo C49 · revogado incluso C49 · responsável de quando foi concedido C50 · vazio C51 | - |
| leituras que não gravam (4) | C52, table-driven over all 4: 2 rotas e 2 perfis | - |
| atos que gravam uma linha (5) | `POST` de aluno com responsável C17, C53 · `PATCH` com responsável novo C23, C53 · concessão C53 · revogação C53 · `PATCH` com `phone` e responsável, duas linhas C53 | - |
| vocabulário de `AUDIT_ACTIONS` (16) | C13, table-driven over all 16: os treze de antes e as três novas na ordem | - |
| `diff` de cada ação nova (3) | `student.guardian_saved` C54, C55 · `student.consent_granted` C56 · `student.consent_revoked` C57 | - |
| requisições que não gravam linha (11) | C58, table-driven over all 11, cada uma com o status afirmado | - |
| rotas que desfazem a ação quando o insert falha (4) | C59, table-driven over all 4 | - |
| valores fora de `audit_logs` (7) | C60, table-driven over all 7 | - |
| valores fora do log (7) | C62, table-driven over all 7 | - |
| origem da linha de auditoria, por ação nova (3) | `student.guardian_saved` C61 · `student.consent_granted` C61 · `student.consent_revoked` C61 | - |
| `User-Agent` na trilha (2 edges) | 513 cortado em 512 C61 · ausente nulo C61 | - |
| exibição do bloco "Responsável legal" (4) | menor C63 · adulto C63 · faz 18 anos hoje C63 · faz 18 anos amanhã C63 | - |
| campos do bloco "Responsável legal" (4) | "Nome do responsável" C63 · "CPF do responsável" C63 · "Telefone do responsável" C63 · "Parentesco" C63 | - |
| opções de "Parentesco" -> `relationship` enviado (4) | "Mãe" C63, C64 · "Pai" C63, C64 · "Responsável legal" C63, C64 · "Outro" C63, C64 | - |
| formulários com o bloco (2) | `/students/new` C63, C64, C65 · `/students/<id>/edit` C63, C64, C65 | - |
| `path` do `422` do responsável -> campo (5) | C65, table-driven over all 5 | - |
| parentesco por extenso na ficha (4) | "Mãe" C66 · "Pai" C66 · "Responsável legal" C66 · "Outro" C66 | - |
| estados da ficha, por finalidade (3) | "Consentido, versão 1, em dd/MM/aaaa" C68 · "Revogado em dd/MM/aaaa" C68 · "Pendente" C68 | - |
| finalidades na ficha (2) | "Uso de dados pessoais" C68 · "Uso da imagem" C68 | - |
| botões da ficha (3 estados) | pendente C69 · só revogado C69 · ativo C69 | - |
| quem concede, no diálogo (3) | "O próprio aluno" C70 · "O responsável: <nome>" C70 · menor só o responsável C71 | - |
| mensagens de `409` no diálogo (2) | `consent_active` C74 · `consent_term_outdated` C74 | - |
| estados do bloco da ficha em `Observable` (5) | vazio C66, C68 · erro de carga C75 · erro de ação C74 · sem permissão C76 · confirmação destrutiva C70, C72 | - |
| perfis sem o bloco (2) | `hr_finance` C76 · `instructor` C76 | - |
| ações novas em `/audit` (3) | "Responsável do aluno salvo" C77 · "Consentimento registrado" C77 · "Consentimento revogado" C77 | - |
| filtro "Ação" (16) | C77, table-driven over all 16: as treze de antes e as três novas, posições 14 a 16 | - |
| texto de "Detalhes" das ações novas (4) | "Finalidade: — → Uso da imagem" C78 · "Versão do termo: — → 1" C78 · "Concedido por: — → Responsável" C78 · "Telefone alterado" C79 | - |
| startup config: migração `0004` aplicada (3 assemblies) | banco migrado em `packages/database` C1 · harness de `apps/api` C28 · stack do compose C84 | - |
| startup config: módulo de consentimento montado (2 assemblies) | harness de `apps/api`, `startApi` C33 · processo real na stack C84 | - |
| startup config: `trust proxy` e repasse de IP nas ações novas (2 assemblies) | harness de teste C61 · processo real na stack C84 | - |

- Claims naming a status code, route or response shape: C16 a C27, C28, C29, C33 a C52, C53 a C59, C61,
  C80 a C83 e C86 a C87 cruzam a fronteira HTTP da API montada pelo `startApi`; C63 a C79 cruzam a
  fronteira do web no navegador; C84 cruza as duas no processo real. C1 a C15, C30 a C32, C85 e C88
  não cruzam fronteira HTTP: provam o banco migrado, os schemas e a definição no próprio nível
- C16 tem duas provas porque o limite de 18 anos decide por quatro ramos (ano, mês, dia e o 29/02): a
  tabela no próprio nível prova cada ramo e a rota prova que o dia vem de `America/Sao_Paulo`, não de
  UTC. A C63 prova o mesmo no formulário, com o relógio do navegador
- C13 muda os testes que dizem "treze" para "dezesseis", pelo Impact do plano: `audit_actions_end_with_three_student_actions_in_order` (`contracts.test.ts:216`), `ten_actions_written_equal_contract_vocabulary` (`audit-auth.test.ts:300` e `:303`), `ten_actions_shown_by_label` (`audit.spec.ts:137`) e `student_actions_labelled_and_filter_has_thirteen` (`audit.spec.ts:194`). Os nomes ficam, o conteúdo ganha as três ações; nenhuma asserção é afrouxada, a contagem sobe porque o vocabulário sobe
- C14 e C15 provam a validação dos corpos no próprio nível porque os `422` de rota não separam o ramo de cada campo do schema; as rotas provam a fronteira (C19, C26, C37, C38)
- C23 fixa que o `PATCH` só com `guardian` novo grava uma linha: o corpo traz os demais campos iguais aos atuais, e a AC 47 de `alunos` diz que o que não muda não grava `student.updated`
- C45 acrescenta à AC 30 o `consentId` de outro aluno, que o texto da AC cobre em "não pertence àquele aluno"
- C49 acrescenta ao texto da AC 34 o caso das cinco trocas seguidas: "responsável de maior `id`" só é o último gravado se o `uuid` v7 ordena trocas no mesmo milissegundo, e é isso que a prova mede. Se falhar, é uma door a reabrir, não um teste a afrouxar
- C84 cria o menor por `POST` com `guardian` e lê os termos da stack. O `reception` é criado como em `alunos`, por `users:create-admin` seguido de troca do perfil por SQL, porque a stack não tem gerador de TOTP
- C83 edita a lista escrita no teste `admin_without_2fa_gets_403_everywhere_else`: sem a edição, o teste reprova com as quatro rotas novas fora da lista
- C85 fixa a marca `RASCUNHO` que a Open question 2 deixa em palavras ("marcado como tal"); se o jurídico entregar o texto final como versão 2, a versão 1 continua rascunho e a prova continua valendo
- `auth-rbac`, `auditoria` e `alunos`: `paths_equal_registered_api_routes`, `hostile_input_never_answers_5xx`, `every_route_with_body_answers_422`, `request_bodies_come_from_contract_schemas`, `responses_match_contract_schemas`, `only_three_routes_answer_without_session` e `six_identity_tables_and_no_tenant_id` leem o roteador ou o banco migrado e passam a cobrir as rotas e as tabelas novas sem check próprio aqui
- Decisões que o plano deixa fora de AC e que nenhum check afirma: se o `diff` de `student.created`, quando o corpo traz `guardian`, nomeia `guardian` em `fields`; a ordem de `fields` de `student.guardian_saved` quando mais de um campo muda; o que `POST /api/students` faz com `guardian: null`; o que o diálogo oferece a um adulto sem responsável (só o próprio aluno, ou também o responsável); qual `409` vence quando a versão é antiga e já há consentimento ativo; qual data "Revogado em" exibe quando há vários revogados; o texto de "Detalhes" das linhas de revogação, de `grantedBy` igual a `student` e dos campos de `guardian_saved` além de `phone`; se a comparação do nome do responsável na AC 9 ignora caixa; a mensagem de campo obrigatório do bloco "Responsável legal"; a ordem de `items` em `GET /api/consent-terms`; como a ficha lista o histórico além do estado por finalidade
- Nenhuma chave de ambiente é nova (Impact `ambiente`), então não há check de `.env.example` nem de `compose.yaml`
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md`, `features/auditoria/checks.md` e `features/alunos/checks.md`
seguem valendo e respondem as duas perguntas para o que esta feature reaproveita (guarda, validação,
gravador, tela, restrição de banco, cifra). Respondem mal dois casos que lá não existiam, e esses dois
ganham linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide, e a decisão final é de um índice ou de uma chave estrangeira do banco, alcançado por HTTP (a corrida entre dois consentimentos, o responsável atual por ordem de `id`) | uma prova no banco migrado **e** uma na fronteira HTTP com dois pedidos soltos juntos | o banco: cada par aceito e cada par recusado uma vez; a fronteira: dez rodadas de dois pedidos, um `2xx` e um `409` por rodada, e a contagem da tabela |
| Decide, e o mesmo código roda na API e no navegador (`isMinor`) | uma prova no próprio nível, uma na rota e uma na tela | o próprio nível: um caso por ramo da tabela de bordas; a rota e a tela: o dia de `America/Sao_Paulo` contra o de UTC |

Evidence (o código da feature ainda não existe; a contagem vem do plano e do código que ele altera):

- `isMinor`: 3 comparações (ano, mês, dia) e o ramo de 29/02, 4 pontos de decisão, 5 bordas nomeadas (C16) -> decide
- `guardian` no `POST` e no `PATCH` de alunos: idade de 2 valores por presença de `guardian` e por responsável gravado, 4 comparações de campo para "dados iguais", 5 recusas (AC 3 a AC 5, AC 7, AC 9, AC 11), 1 inserção condicional (C16 a C27) -> decide
- `POST` de consentimento: 5 linhas na tabela de quem concede, 3 resultados para o termo (não existe, antigo, vigente), 1 conferência de ativo decidida pelo índice, 3 `grantedBy`/`purpose`/`termVersion` inválidos (C33 a C41) -> decide
- `DELETE` de consentimento: 2 ramos (ativo, já revogado) e 3 `404` (C42 a C45) -> decide
- `GET /api/students/:id/consents`: 1 ordem, 1 escolha do responsável por `id`, 1 responsável por item (C49 a C51) -> decide
- migração `0004`: 3 tabelas, 3 gatilhos de `consent_terms`, 2 `CHECK`, 1 `CHECK` de equivalência, 1 índice único parcial, 5 chaves estrangeiras, 1 semente de 2 linhas (C1 a C12, C30 a C32) -> decide
- controllers de consentimento e de termos que repassam a query e o corpo já validados, o mapa de rótulos de `/audit` e os formatadores de CPF e telefone do web -> instrumentation
- closest analogue in the repo: `apps/api/test/students-create.test.ts`, dez rodadas de dois pedidos soltos juntos para o `409` de CPF repetido (C13 de `alunos`), e `packages/database/test/students.test.ts`, `UNIQUE` e `CHECK` provados um a um sobre o banco migrado

Cost: 1 prova além das 88 acima na linha do índice e da corrida, a C87 (dois responsáveis diferentes soltos juntos); na linha de `isMinor`, a segunda `Proof` da C16 e a C63 já são checks, e a tabela de bordas no próprio nível é a primeira `Proof` da C16. Sem as linhas, a corrida seria provada só pela rota, que passa com uma conferência feita antes do insert sempre que a corrida não é perdida, e as bordas de 18 anos só por um caminho que atravessa o ramo.

## Swept

- validation: C14, C15, C19, C37, C38, C26
- failure modes: C59, C62, C74, C75
- idempotency: C24 (responsável igual não grava), C43 (revogar de novo não grava), C40 (conceder de novo, `409`), C86 (dois `PATCH` iguais, uma linha); repetir um ato que muda algo é outro acontecimento e grava outra linha
- authorization: C47, C48, C76, C83; existing - a guarda global (AD-022) e o `403` de cadastro obrigatório do 2FA pelas provas `guard_matrix_three_declarations_five_callers` e `admin_without_2fa_gets_403_everywhere_else`
- concurrency: C41, C86, C87
- data lifecycle: C5, C12, C42, C43, C44 - nada é apagado: revogar mantém a linha, trocar o responsável insere outra, e as chaves sem `ON DELETE` obrigam a `privacidade` a tratar as duas tabelas antes da linha do aluno; a exclusão do titular e a anonimização são da `privacidade` (Out of scope do plano)
- dependency failure: C59 (insert de auditoria que falha), C62 (a falha não vaza o dado no log), C75 (web sem a API); banco fora na consulta cai no `500 internal_error` do `ProblemFilter` (prova `unhandled_500_hides_exception`, da `fundacao`)
- state transitions: C42, C43, C44, C57, C23, C68 - o consentimento só vai de ativo a revogado, uma vez, e conceder de novo é outra linha; o responsável só ganha versão nova
- observability: C53 a C57, C60, C62 - a trilha de responsável e de consentimento é o que esta feature torna observável; a leitura não grava (C52)

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado (KB de código e teste, dividido por quatro); o que já existe foi medido com `wc -c`. Código novo: S0 = 11k (inclui a migração, o snapshot do Drizzle, ~29 KB, e os schemas), S1 = 7k, S2 = 3k, S3 = 8k, S4 = 2k, S5 = 5k, S6 = 12k, S7 = 1k, S8 = 2k: 51k, dos quais 38k em `apps/api`, `packages/contracts` e `packages/database`, e 13k em `apps/web` e nos testes de tela. Arquivos existentes que a feature edita ou lê para editar (28 arquivos, 175 KB, os maiores: `students.spec.ts` 26 KB, `students.service.ts` 12 KB, `audit.spec.ts` 16 KB, `audit-auth.test.ts` 13 KB, `contracts.test.ts` 12 KB, `compose.test.ts` 10 KB, `student-form.tsx` 7 KB): 44k. `plan.md` (43 KB) e este arquivo (66 KB): 27k. Total 51k + 44k + 27k = 122k, abaixo do orçamento de 150k - one builder. Corte já escrito, se a medição real passar de 150k: antes da S6, com S0 a S5 e S8 em 38k, os 16 arquivos de API, contratos e banco que a feature edita em 24k e `plan.md` mais este arquivo em 27k: 38k + 24k + 27k = 89k até ali
- Ordem: S0 primeiro (as três tabelas, o vocabulário de auditoria e os schemas, de que todo o resto depende), depois S1, S2, S3, S4, S5, S8 inteira, S6 e S7 por último, onde a superfície muda de API para web. Antes da S1, conferir que `isMinor` recebe a data de hoje como argumento (`isMinor(birthDate, today)`, Flow 2), para que a C16 controle o relógio, e que o `uuidv7()` do banco ordena inserts feitos em conexões diferentes no mesmo milissegundo, de que a C49 depende; se não ordenar, parar e reabrir a door 1, não afrouxar a C49
- Mechanism: one builder (a estimativa cabe no orçamento, sem pergunta)
- Boundary: base da feature `4f463a3`, um builder, a ordem S0, S1, S2, S3, S4, S5, S8, S6, S7. S0 banco `44cbb2f` (C1 a C12, C30 a C32, C85; o teste `consent.test.ts` foi acertado depois em `1ab03a3`) · S0 contratos `6f12f1d` (C13 a C15) · S1 `82835d8` (C16 a C27) · S2 `0a82681` (C28, C29) · S3 e S4 juntas em `e323d86` (C33 a C52: C45, C47 e C48 atravessam a rota de leitura, que a S3 sozinha não fecharia) · S5 `dec775b` (C53 a C62) · S8 `7f0467f` (C80 a C84, C86 a C88) · S6 `d0e398e` (C63 a C76) · S7 `984f672` (C77 a C79). Provas rodadas no fim: banco 33, API 262, Playwright 86, `tests/repo` 8, stack real (C84) 1, `turbo lint typecheck build` verde
- Premissas conferidas antes da S1: o `uuidv7()` do Postgres 18 ordena inserts de conexões diferentes, também no mesmo milissegundo (20.000 pares em duas conexões, 10.596 no mesmo ms, 0 inversões; a fração abaixo do ms desempata), então a C49 não reabre a door 1; `isMinor(birthDate, today)` nasceu com a data por argumento, e a API e o formulário passam o dia de `America/Sao_Paulo` (`saoPauloToday`, exportada de `packages/contracts`)
- Desvios, para o Verifier e para o usuário: (1) **C30, TRUNCATE.** `consents` aponta para `consent_terms`, então o `TRUNCATE` simples é recusado pelo Postgres por chave estrangeira (`0A000`) antes de o gatilho rodar, e a mensagem `consent_terms is append-only` não aparece; só o `TRUNCATE ... CASCADE`, a forma que levaria `consents` junto, chega ao gatilho. A C30, como escrita, não é alcançável; o teste afirma os dois fatos (CASCADE com a mensagem, simples com `0A000`) e as linhas idênticas depois. Decisão para o usuário: aceitar o desvio e ajustar o texto da C30 e da AC 15, ou pedir outra proteção do `TRUNCATE` simples. (2) **Impact `contrato` do plano.** A frase "nenhum caso de `alunos` passa a falhar" não vale para `birth_date_bounds_in_sao_paulo` (`students-create.test.ts`), que aceita `birthDate` de hoje, um recém-nascido, sem responsável; a asserção `201` ficou, e o corpo do caso aceito ganhou `guardian`. (3) **C47 e C58 e as sessões.** O login de cada sessão grava na trilha, então os testes criam as sessões antes de contar `audit_logs`. (4) `audit-auth.test.ts` (`ten_actions_written_equal_contract_vocabulary`) ganhou os três atos no percurso e a contagem 16, como a C13 pede; ficou vermelho de `6f12f1d` a `dec775b` por construção
- Decidido sem pergunta: com versão antiga e consentimento ativo ao mesmo tempo, vence `consent_term_outdated`; a ordem de `items` de `GET /api/consent-terms` é por finalidade; adulto sem responsável só oferece "O próprio aluno" no diálogo, e menor sem responsável vê o texto de pendência com "Confirmar" desabilitado; a comparação do nome na AC 9 distingue caixa; menor sem responsável mostra "Nenhum responsável cadastrado." e a pendência juntos; o `DELETE` repete `revoked_at IS NULL` no `UPDATE`, então duas revogações juntas gravam uma linha. Sem `Landing` novo: dois índices de leitura (`guardians_student_id_idx`, `consents_student_id_granted_at_idx`) ficaram no diff, abaixo da barra da door
- Abandonado: nada
