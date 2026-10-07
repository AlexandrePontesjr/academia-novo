# Cadastro de funcionários - checks

Profile: standard
Plan: `.specs/features/funcionarios/plan.md`

## Intent

114 checks in 11 slices (S0, as 9 do plano e S10 de contrato, montagem e stack) · 5 one-way doors · 3 open (a 1, a 2 e a 3, respondidas no padrão recomendado em 2026-10-06), of which 0 block the Build

O plano foi aprovado em 2026-10-06 com as 21 Assumptions confirmadas e as três perguntas no padrão
recomendado: só o Administrador vincula o usuário (AC 11), inativar o funcionário não mexe no usuário e a
ficha avisa (AC 28, AC 82), e abrir a lista grava uma linha `staff.list_viewed` sem alvo (AC 17). As
doors 1 a 5 viraram AD-053 a AD-057 em `STATE.md` e as duas lacunas do `ROADMAP.md` fecharam no mesmo
commit de docs.

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`,
`playwright test <arquivo> -g`). São criados no Build, em `apps/api/test`: `staff-create.test.ts`,
`staff-access.test.ts`, `staff-read.test.ts`, `staff-update.test.ts`, `staff-user.test.ts`,
`staff-audit.test.ts`, `staff-photos.test.ts`, `staff-purge.test.ts` e `support/staff.ts`; em
`packages/database/test`, `staff.test.ts`; em `apps/web/e2e`, `staff.spec.ts`, `staff-photo.spec.ts` e
`support/staff.ts`. Ganham casos, ou são editados como a lista abaixo da `Coverage` descreve:
`photos.test.ts` (banco), `contracts.test.ts`, `audit-auth.test.ts`, `openapi.test.ts`,
`enrollment.test.ts`, `hostile-input.test.ts`, `support/photos.ts`, `support/stack.ts`, `shell.spec.ts`,
`audit.spec.ts`, `fake-api.ts`, `support/photo.ts` (web) e `compose.test.ts`. As regras de
`features/auth-rbac/checks.md`, `auditoria`, `alunos`, `foto-pipeline` e `foto-captura` seguem valendo
sem mudança: Postgres e MinIO reais por `testcontainers` (AD-012), sessão real de cada perfil
(`stack.session(role)`, com 2FA já ativo para `admin`) e `Origin` igual a `WEB_ORIGIN`, "exatamente uma
linha" como diferença de contagem de `audit_logs` (`written`), insert de `audit_logs` que falha por
gatilho do próprio teste (`withAuditInsertFailing`), dois pedidos soltos juntos por uma barreira
(`releasedTogether`), `snapshotOf` (linhas de `photos`, contagem de `audit_logs` e chaves do bucket) antes
e depois de todo caso que não grava, o bucket lido pelo cliente S3 do próprio teste, imagens nascidas de
pixels dentro do teste, "vermelho" como R maior ou igual a 200 com G e B menores ou iguais a 60 e "azul" o
simétrico, `flakyStorage` para o armazenamento que falha, a saída capturada em stdout, stderr e
`console`, e, nas telas, o `FakeApi` que registra método, caminho, corpo e partes. Regras próprias:

- A numeração acompanha o plano: de S1 a S9, **C(n) prova a AC (n - 8)** (C9 é a AC 1, C102 é a AC 94).
  S0 vem antes e S10 depois.
- "Linha de funcionário" é lida por SQL do banco do próprio teste como `to_jsonb(staff)`, sem depender de
  nome de coluna (o plano deixa os nomes para o diff, salvo os que a door 1 fixa: `cpf`, `status` e
  `user_id`). "Linha idêntica" é igualdade desse JSON antes e depois, e "contagem" é `count(*)` de `staff`.
  `snapshotOf` passa a incluir as linhas de `staff`. Quando um caso muda um campo e afirma que "o resto
  ficou", o instante de atualização, se a linha tiver um, fica fora da comparação.
- CPF de teste vem de `cpfOf(n)` (`support/students.ts`); os literais `529.982.247-25` e `123.456.789-09`
  (dígito verificador 0) aparecem onde a AC os nomeia. O CPF de um funcionário e o de um aluno do mesmo
  teste são independentes por construção (AC 6).
- "Autor" é o `id` do usuário da sessão que chamou. "Ficha" é a resposta de `GET /api/staff/:id`.
- "A mesma resposta das rotas de aluno" (C65) é medida no próprio teste: a mesma requisição vai a
  `/api/students/:id/photo` e a `/api/staff/:id/photo`, e `status` e `code` são comparados entre as duas,
  além de afirmados contra o valor do enunciado.
- A data de hoje em `America/Sao_Paulo` é controlada pelo teste (relógio em processo, só `Date`), nunca
  lida do relógio da máquina; a borda é a virada às 03:00 UTC (C15).
- Os limites de tamanho são provados nas duas bordas (aceita no limite, recusa no limite mais um), com um
  caractere acentuado dentro do texto.
- Nas telas, `FakeApi` passa a responder `GET`, `POST`, `PATCH` e `DELETE /api/staff`, `/api/staff/:id`,
  `PUT` e `DELETE /api/staff/:id/user`, `POST`, `PUT` e `DELETE /api/staff/:id/photo` e `GET /api/users`,
  e a guardar o corpo de cada requisição e os bytes de cada parte, como já faz para `/api/students`. A
  ficha lê do estado, que o envio, a troca e a remoção mudam como a API mudaria. "Requisição de foto do
  funcionário" é qualquer requisição, de qualquer método, a `/api/staff/<id>/photo`. As provas de imagem
  decodificam o JPEG recebido por conta própria, nunca pelo código do editor, como na `foto-captura`.
- Os checks de tela que exigem a API de verdade (C81 e C114) rodam na stack do compose, sobre o `web`
  e a `api` reais, lendo `audit_logs` por `psql`. Nenhuma prova de tela contra a `FakeApi` afirma uma
  linha de auditoria: ela só afirma as requisições que a página fez.

### S0 - A tabela, o segundo dono da foto, o vocabulário e o contrato, antes de qualquer rota · ~9 files · ~26 KB · ~7k

**C1** - Depois de `pnpm db:migrate` num banco vazio, `staff` existe sem as colunas `role`, `deleted_at` e `tenant_id`, e a única chave estrangeira dela é `user_id` para `users(id)`, com regra de exclusão `NO ACTION` (nunca `CASCADE` nem `SET NULL`); nenhuma coluna de `staff` aponta para `students` (door 1, AD-016, AD-053)
Proof: `pnpm --filter "./packages/database" exec vitest run test/staff.test.ts -t "staff_table_has_no_role_deleted_at_tenant_id_and_only_the_user_foreign_key"`

**C2** - Uma linha inserida em `staff` só com os campos obrigatórios e sem `id` recebe do banco um `uuid` de versão 7 e `status` igual a `active`; `status` aceita `active` e `inactive` e recusa `suspended`, `Active`, `ativo` e a cadeia vazia por violação de `CHECK`, e a linha continua como estava (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/staff.test.ts -t "staff_defaults_uuidv7_active_and_status_check_five_values"`

**C3** - Dois funcionários com o mesmo `cpf` violam `UNIQUE`, também quando o primeiro está `inactive`; dois com `cpf` diferentes convivem; um `cpf` igual ao de um aluno convive com ele; dois funcionários com o mesmo `user_id` violam `UNIQUE` e muitos com `user_id` nulo convivem; `DELETE` de um usuário com funcionário vinculado falha por violação de chave estrangeira, com a linha de `users` e a de `staff` como estavam (door 1, Relations, Impact "stored data")
Proof: `pnpm --filter "./packages/database" exec vitest run test/staff.test.ts -t "staff_cpf_unique_across_status_user_id_unique_and_linked_user_not_deletable"`

**C4** - Aplicadas as migrações até a `0006`, inseridas duas linhas em `photos` (uma corrente e uma guardada, de dois alunos) e só então aplicada a `0007`, a migração termina sem erro; as duas linhas continuam com os mesmos valores, `staff` existe e está vazia, `photos.student_id` deixa de ser `NOT NULL`, `photos` tem as colunas de antes mais `staff_id` (`uuid`, anulável, chave estrangeira para `staff(id)` com regra `NO ACTION`) e o conjunto de tabelas do banco é o de antes mais `staff` (door 1, door 2, Impact "stored data")
Proof: `pnpm --filter "./packages/database" exec vitest run test/staff.test.ts -t "migration_0007_adds_staff_and_staff_id_and_keeps_existing_photo_rows"`

**C5** - Sobre linhas de `photos` de funcionário, duas com o mesmo `staff_id` e a mesma `version` violam `photos_staff_id_version_unique`, e a mesma `version` em dois funcionários convive; duas correntes do mesmo funcionário violam o índice `photos_one_current_staff_idx`, uma corrente mais várias guardadas convivem, e dois funcionários cada um com a sua corrente convivem; `DELETE` de um funcionário que tem linha em `photos` falha por violação de chave estrangeira, com a linha de `staff` e a de `photos` como estavam (door 2)
Proof: `pnpm --filter "./packages/database" exec vitest run test/staff.test.ts -t "staff_photo_version_unique_one_current_index_and_no_cascade"`

**C6** - Para uma linha de `photos` de dono funcionário, a restrição `photos_expiry_matches_current` aceita uma corrente com `expires_at` nulo e uma guardada com `expires_at` preenchido, e recusa por violação de `CHECK` com esse nome uma corrente com `expires_at` preenchido e uma guardada com `expires_at` nulo, tanto no `INSERT` quanto no `UPDATE` que tira `is_current` sem dar prazo (door 2, AD-047)
Proof: `pnpm --filter "./packages/database" exec vitest run test/staff.test.ts -t "staff_owned_photo_expiry_check_four_combinations"`

**C7** - `AUDIT_ACTIONS` em `packages/contracts` tem trinta e um valores: os vinte de antes, na ordem de antes, seguidos de `staff.created`, `staff.updated`, `staff.inactivated`, `staff.viewed`, `staff.list_viewed`, `staff.user_linked`, `staff.user_unlinked`, `staff.photo_uploaded`, `staff.photo_removed`, `staff.photo_replaced` e `staff.photo_version_purged`, nessa ordem; e depois de percorrer as rotas de funcionário e o expurgo, o conjunto de ações gravadas em `audit_logs` é igual ao vocabulário, com `entity` igual a `staff` nas onze novas (door 4, AD-025, AD-056)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_eleven_staff_actions_in_order"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "ten_actions_written_equal_contract_vocabulary"`

**C8** - Em `packages/contracts`, o schema de criação de funcionário aceita o corpo com os cinco campos obrigatórios e recusa, um a um, o corpo a que falta cada um dos cinco; o schema de resposta da ficha aceita o objeto completo, com `user` e `photoUrl` nulos ou preenchidos, e recusa `status` fora de `active` e `inactive`; o schema do item da lista aceita só `id`, `name`, `position`, `department`, `status` e `photoUrl`; e as regras de CPF e de telefone são uma definição só (AD-011): uma tabela de doze CPFs e de dez telefones dá o mesmo veredito no schema de criação de aluno e no de criação de funcionário (door 4, AD-006, Impact "contrato")
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "staff_schemas_accept_and_reject_and_share_cpf_and_phone_rules_with_students"`

### S1 - Cadastrar um funcionário · ~4 files · ~26 KB · ~7k

**C9** - `POST /api/staff` de `admin` e de `hr_finance`, com `name`, `cpf`, `position`, `hiredAt` e `phone` válidos, responde `201` nos dois casos com exatamente as chaves `id`, `name`, `status`, `cpf`, `position`, `department`, `hiredAt`, `phone`, `email`, `user` e `photoUrl`: `id` igual ao da linha lida por SQL, `status` igual a `active`, `department`, `email`, `user` e `photoUrl` iguais a `null`, e os campos enviados devolvidos iguais; com `department` e `email` enviados, os dois voltam preenchidos (AC 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-create.test.ts -t "create_201_by_admin_and_hr_finance_with_the_eleven_keys"`

**C10** - `POST /api/staff` com `cpf` igual a `529.982.247-25` e `phone` igual a `(11) 91234-5678` grava na linha e devolve `cpf` igual a `52998224725` e `phone` igual a `11912345678`; com `cpf` sem máscara e `phone` igual a `(11) 1234-5678`, devolve o CPF igual e `phone` igual a `1112345678` (AC 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-create.test.ts -t "create_stores_and_returns_cpf_and_phone_as_digits"`

**C11** - `POST /api/staff` responde `422` com um item em `errors` cujo `path` é `cpf`, e a contagem de `staff` não muda, para `529.982.24` (menos de 11 dígitos), `529.982.247-250` (mais de 11), `111.111.111-11`, `529.982.247-24` (primeiro dígito verificador errado) e `529.982.247-26` (segundo errado); com `123.456.789-09` (dígito verificador 0) responde `201` (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-create.test.ts -t "create_cpf_five_refusals_422_and_check_digit_zero_accepted"`

**C12** - `POST /api/staff` com o CPF de um funcionário `active`, e com o de um `inactive`, responde nos dois casos `409` com `code` igual a `cpf_taken`, inclusive quando o CPF vem com máscara e está guardado sem; a contagem e a linha do funcionário existente não mudam (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-create.test.ts -t "create_cpf_of_active_and_inactive_staff_409_cpf_taken"`

**C13** - Dez rodadas de dois `POST /api/staff` com o mesmo CPF soltos juntos respondem `201` a exatamente um e `409` com `cpf_taken` ao outro, e ao fim de cada rodada há uma linha com aquele CPF (AC 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-create.test.ts -t "two_simultaneous_creates_with_one_cpf_one_201_one_409"`

**C14** - `POST /api/staff` com o CPF de um aluno existente, e de funcionário nenhum, responde `201`; a linha do aluno não muda (AC 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-create.test.ts -t "create_with_a_students_cpf_201"`

**C15** - `POST /api/staff` responde `422` com um item cujo `path` é `hiredAt`, e a contagem não muda, para `2026-02-30`, `2026-13-01`, `26-01-01`, `01/02/2020` e `1899-12-31`; responde `201` para `1900-01-01`; com o relógio do teste em `2026-10-06T02:59:59Z` (ainda dia 5 em São Paulo), responde `201` para `2026-10-05` e `422` para `2026-10-06`; e com o relógio em `2026-10-06T03:00:00Z`, responde `201` para `2026-10-06` (hoje em São Paulo) e `422` para `2026-10-07` (AC 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-create.test.ts -t "create_hired_at_ten_cases_around_today_in_sao_paulo"`

**C16** - `POST /api/staff` responde `422` com um item cujo `path` é o campo do caso, e a contagem não muda, em cada um dos casos: `name`, `cpf`, `position`, `hiredAt` e `phone` ausentes (cinco); `name` vazio e só de espaços; `position` vazio; `name` de 121 caracteres (com `é` dentro) e `position` e `department` de 81; `email` igual a `sem-arroba`, e de 255 caracteres; `phone` de 9 e de 12 dígitos, com e sem máscara; e o caractere U+0000 dentro de `name`, `position`, `department` e `email`; e responde `201` para `name` de 120, `position` e `department` de 80, `email` de 254 e `phone` de 10 e de 11 dígitos (AC 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-create.test.ts -t "create_text_digits_and_missing_fields_table_422_with_field_path"`

### S2 - Só Administrador e RH alcançam · ~2 files · ~8 KB · ~2k

**C17** - Para `reception` e para `instructor`, cada uma das dez rotas (`GET` e `POST /api/staff`; `GET`, `PATCH` e `DELETE /api/staff/:id`; `PUT` e `DELETE /api/staff/:id/user`; `POST`, `PUT` e `DELETE /api/staff/:id/photo`), com `:id` de um funcionário que existe e de um `uuid` de ninguém, responde `403` com `code` igual a `forbidden`, o corpo não traz nenhuma chave de funcionário (`name`, `cpf`, `position`, `department`, `hiredAt`, `phone`, `email`, `user`, `photoUrl`) e o `snapshotOf` de depois é igual ao de antes, inclusive as linhas de `staff` (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-access.test.ts -t "reception_and_instructor_403_on_ten_routes_with_existing_and_unknown_id"`

**C18** - As dez rotas, chamadas sem cookie, respondem `401` com `code` igual a `unauthorized`, e o `snapshotOf` de depois é igual ao de antes (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-access.test.ts -t "anonymous_401_on_ten_routes"`

**C19** - `hr_finance` chamando `PUT /api/staff/:id/user` com um usuário existente, sobre um funcionário sem vínculo e sobre um vinculado a outro usuário, e `DELETE /api/staff/:id/user` sobre o vinculado, recebe `403` com `code` igual a `forbidden` nos três casos, e o vínculo e a linha do funcionário ficam como estavam (AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-access.test.ts -t "hr_finance_403_on_user_link_routes_and_link_unchanged"`

### S3 - Ler a lista e a ficha, e cada leitura deixa rastro · ~3 files · ~22 KB · ~6k

**C20** - `GET /api/staff/:id` de `admin` e de `hr_finance` responde `200` com exatamente as chaves `id`, `name`, `status`, `cpf`, `position`, `department`, `hiredAt`, `phone`, `email`, `user` e `photoUrl`, as mesmas e com os mesmos valores para os dois perfis; `cpf` e `phone` vêm só com dígitos (AC 12)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-read.test.ts -t "ficha_eleven_keys_same_for_admin_and_hr_finance"`

**C21** - Para um funcionário vinculado a um usuário de cada um dos quatro perfis (`admin`, `reception`, `hr_finance`, `instructor`), a ficha devolve em `user` exatamente as chaves `id`, `name`, `email`, `role` e `active` com os valores do usuário; depois de o teste mudar por SQL o `role` e pôr `active` em falso, a leitura seguinte já traz os novos valores; sem vínculo, `user` é `null` (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-read.test.ts -t "ficha_user_block_five_keys_read_live_for_four_roles_and_null_without_link"`

**C22** - Com foto corrente, `photoUrl` da ficha casa `^/api/photo-files/<photoId>/medium\?exp=\d+&sig=[A-Za-z0-9_-]+$` com o `photoId` da linha corrente, e abrir a URL entrega os bytes do objeto `medium`; sem foto é `null`; depois de uma troca pelo `PUT`, traz o `photoId` novo (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-read.test.ts -t "ficha_photo_url_medium_signed_for_current_photo_null_without"`

**C23** - `GET /api/staff/:id` que responde `200`, de `admin` e de `hr_finance`, grava exatamente uma linha em `audit_logs`, com `action` igual a `staff.viewed`, `user_id` igual ao id de quem leu, `entity` igual a `staff`, `entity_id` igual a `:id` e `diff` nulo; duas leituras do mesmo funcionário gravam duas linhas (AC 15, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-read.test.ts -t "ficha_200_writes_one_staff_viewed_row"`

**C24** - `GET /api/staff` de `admin` e de `hr_finance` responde `200` com todos os funcionários, ativos e inativos juntos, cada um só com as chaves `id`, `name`, `position`, `department`, `status` e `photoUrl` (variante `thumb`, ou `null`), na ordem de `name` sem diferenciar maiúsculas nem acentos e, no empate, de `id`: com `Ângela`, `angela`, `Bruno`, `bruna`, `Çaio`, `Zélia` e dois `Marcos Lima` de `id` diferentes, a ordem esperada está escrita à mão no teste (AC 16, AD-035)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-read.test.ts -t "list_all_statuses_ordered_by_folded_name_then_id_with_six_keys_and_thumb"`

**C25** - `GET /api/staff` que responde `200`, com `items` vazio e com três funcionários, grava exatamente uma linha com `action` igual a `staff.list_viewed`, `user_id` igual ao id de quem leu, `entity` igual a `staff`, `entity_id` nulo e `diff` nulo, nunca uma por funcionário listado (AC 17, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-read.test.ts -t "list_200_writes_one_list_viewed_row_even_when_empty"`

**C26** - Com o insert em `audit_logs` falhando, `GET /api/staff` e `GET /api/staff/:id` respondem `500` com `code` igual a `internal_error`, o texto do corpo não contém o nome, o CPF nem o telefone de nenhum funcionário, e a contagem de `audit_logs` não muda (AC 18, AD-027, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-read.test.ts -t "read_audit_insert_failure_500_without_staff_data"`

**C27** - `GET /api/staff/:id` com `:id` igual a `abc` e com um `uuid` de funcionário nenhum responde, nos dois casos, `404` com `code` igual a `not_found` (AC 19)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-read.test.ts -t "ficha_404_for_non_uuid_and_unknown_uuid"`

**C28** - Em cada um dos oito casos - `GET /api/staff` sem cookie; `GET /api/staff/:id` sem cookie; os dois `GET` de `reception`; os dois `GET` de `instructor`; `GET /api/staff/:id` com `abc`; `GET /api/staff/:id` com um `uuid` de ninguém - a resposta tem exatamente o status do caso (`401`, `403` ou `404`) e a contagem de `audit_logs` fica igual à de antes (AC 20)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-read.test.ts -t "eight_non_reading_outcomes_write_no_audit_row"`

### S4 - Editar, inativar e reativar · ~3 files · ~24 KB · ~6k

**C29** - `PATCH /api/staff/:id` de `admin` e de `hr_finance` com cada um de `name`, `cpf`, `position`, `department`, `hiredAt`, `phone` e `email` sozinho (sete casos) e com os sete juntos responde `200` com o funcionário atualizado, e a linha fica com o campo novo e todas as outras colunas como estavam (AC 21)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "patch_each_of_seven_fields_and_all_together_keeps_the_rest"`

**C30** - `PATCH /api/staff/:id` com `department` igual a `null`, com `email` igual a `null` e com os dois juntos devolve cada um como `null` e deixa a coluna nula na linha, sobre um funcionário que tinha os dois preenchidos (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "patch_null_clears_department_and_email"`

**C31** - `PATCH /api/staff/:id` com `null` em `name`, em `cpf`, em `position`, em `hiredAt`, em `phone` e em `status`, e com `529.982.247-24` em `cpf`, `1899-12-31` em `hiredAt`, 121 caracteres em `name` e 9 dígitos em `phone`, responde `422` com um item em `errors` cujo `path` é o campo do caso, e a linha fica idêntica (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "patch_null_and_invalid_values_422_with_field_path_row_unchanged"`

**C32** - `PATCH /api/staff/:id` com o CPF de outro funcionário, `active` e `inactive`, responde `409` com `code` igual a `cpf_taken` e deixa as duas linhas idênticas; com o CPF que o próprio funcionário já tem, igual e com máscara, responde `200` (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "patch_cpf_of_another_staff_409_and_own_cpf_200"`

**C33** - `PATCH /api/staff/:id` com `status` igual a `active` sobre um funcionário `inactive` responde `200` e deixa `status` igual a `active` na resposta e na linha, sem mexer no vínculo nem nos outros campos (AC 25)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "patch_status_active_reactivates_inactive_staff"`

**C34** - `PATCH /api/staff/:id` com `status` igual a `inactive`, `suspended`, `Active`, `ativo` e à cadeia vazia responde `422` com um item cujo `path` é `status`, e a linha fica idêntica (AC 26)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "patch_status_other_values_422_on_status"`

**C35** - `DELETE /api/staff/:id` de `admin` e de `hr_finance` sobre um funcionário `active` com usuário vinculado e duas fotos (a corrente e uma guardada) responde `204`; depois, a linha continua, com `status` igual a `inactive` e as outras colunas e o `user_id` como estavam, as duas linhas de `photos` e os seis objetos continuam, e `GET /api/staff/:id` devolve todos os outros campos e o `user` como antes (AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "delete_inactivates_and_keeps_row_link_and_photos"`

**C36** - Depois de `DELETE /api/staff/:id` sobre um funcionário com usuário `active` vinculado, a linha do usuário em `users` é idêntica (`active` verdadeiro), as linhas de `sessions` dele são as mesmas, a sessão dele continua respondendo `200` em `GET /api/auth/session` e nenhuma linha `user.updated` foi gravada (AC 28)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "delete_leaves_linked_user_active_and_sessions"`

**C37** - `DELETE /api/staff/:id` sobre um funcionário que já está `inactive` responde `204` e deixa a linha idêntica (AC 29)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "delete_of_inactive_staff_204_changes_nothing"`

**C38** - Dez rodadas de dois `PATCH /api/staff/:id` soltos juntos sobre o mesmo funcionário, um mudando `position` e o outro `phone`, respondem `200` aos dois, e ao fim de cada rodada a linha tem as duas mudanças (AC 30)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "two_simultaneous_patches_on_different_fields_keep_both"`

**C39** - `PATCH` e `DELETE /api/staff/:id` com `:id` igual a `abc` e com um `uuid` de funcionário nenhum respondem, nos quatro casos, `404` com `code` igual a `not_found`, e a contagem de `staff` não muda (AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-update.test.ts -t "patch_and_delete_404_for_non_uuid_and_unknown_uuid"`

### S5 - Ligar a ficha ao usuário · ~2 files · ~14 KB · ~4k

**C40** - `PUT /api/staff/:id/user` de `admin` com o `userId` de um usuário `active` e, em outro funcionário, de um `inactive` responde `204` nos dois casos, e `GET /api/staff/:id` de `hr_finance` devolve em `user` o `id`, o `name`, o `email`, o `role` e o `active` daquele usuário, `active` em falso no segundo (AC 32)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-user.test.ts -t "put_user_204_for_active_and_inactive_user_and_ficha_shows_it"`

**C41** - `PUT /api/staff/:id/user` sobre um funcionário já vinculado ao usuário A, com o `userId` do usuário B, responde `204` e a ficha passa a mostrar B; depois, vincular A a outro funcionário responde `204` (AC 33)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-user.test.ts -t "put_user_replaces_the_link_and_frees_the_previous_user"`

**C42** - `PUT /api/staff/:id/user` com corpo sem `userId`, com `userId` igual a `abc`, a `123`, a `null` e a um `uuid` de usuário nenhum responde `422` com um item cujo `path` é `userId`, e o vínculo fica como estava (AC 34)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-user.test.ts -t "put_user_five_invalid_user_ids_422_on_user_id"`

**C43** - `PUT /api/staff/:id/user` com o `userId` de um usuário já vinculado a outro funcionário responde `409` com `code` igual a `user_already_linked`, e as linhas dos dois funcionários ficam idênticas (AC 35)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-user.test.ts -t "put_user_already_linked_elsewhere_409_nothing_changes"`

**C44** - Dez rodadas de dois `PUT /api/staff/:id/user` soltos juntos, com o mesmo usuário e dois funcionários diferentes, respondem `204` a exatamente um e `409` com `user_already_linked` ao outro, e ao fim de cada rodada só um funcionário tem aquele usuário (AC 36)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-user.test.ts -t "two_simultaneous_links_of_one_user_one_204_one_409"`

**C45** - `DELETE /api/staff/:id/user` de `admin` sobre um funcionário vinculado responde `204` e a ficha passa a devolver `user` igual a `null`; sobre um sem vínculo responde `204` e a linha fica idêntica; nos dois, a linha do usuário em `users` não muda (AC 37)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-user.test.ts -t "delete_user_unlinks_and_is_idempotent"`

**C46** - `PUT` e `DELETE /api/staff/:id/user` com `:id` igual a `abc` e com um `uuid` de funcionário nenhum, o `PUT` com um `userId` válido, respondem nos quatro casos `404` com `code` igual a `not_found` (AC 38)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-user.test.ts -t "user_routes_404_for_non_uuid_and_unknown_uuid"`

### S6 - Cada escrita deixa rastro, na mesma transação · ~2 files · ~24 KB · ~6k

**C47** - `POST /api/staff` que responde `201`, de `admin` e de `hr_finance`, grava exatamente uma linha em `audit_logs`, com `action` igual a `staff.created`, `user_id` igual ao id do autor, `entity` igual a `staff` e `entity_id` igual ao id do funcionário criado (AC 39)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "create_writes_one_staff_created_row"`

**C48** - A criação só com `name`, `cpf`, `position`, `hiredAt` e `phone` grava `diff` igual a `{"fields":["name","cpf","position","hiredAt","phone","status"],"values":{"status":{"from":null,"to":"active"}}}`; com os sete campos, `fields` contém os sete nomes e `status`, e `values` traz só `status` (AC 40, AD-026)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "create_diff_names_the_fields_and_status_only"`

**C49** - `PATCH /api/staff/:id` que responde `200` tendo mudado `position` e `phone` (enviados nessa ordem) grava exatamente uma linha com `action` igual a `staff.updated`, `user_id` do autor, `entity` igual a `staff`, `entity_id` igual a `:id` e `diff` igual a `{"fields":["position","phone"],"values":{}}`; o mesmo vale quando muda cada um dos outros cinco campos sozinho, com `fields` igual ao nome dele e `values` vazio (AC 41)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "patch_writes_one_staff_updated_row_with_field_names_only"`

**C50** - `PATCH /api/staff/:id` que reativa um funcionário `inactive` grava uma linha `staff.updated` com `diff` igual a `{"fields":["status"],"values":{"status":{"from":"inactive","to":"active"}}}` (AC 42)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "reactivation_diff_records_status_from_inactive_to_active"`

**C51** - `PATCH /api/staff/:id` responde `200` e deixa a contagem de `audit_logs` igual, nos nove casos: `name`, `cpf` (igual ao guardado, com máscara), `position`, `department`, `hiredAt`, `phone` e `email` com o valor que já têm, `status` igual a `active` sobre um funcionário `active`, e corpo vazio (AC 43)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "patch_without_change_nine_cases_writes_no_row"`

**C52** - `DELETE /api/staff/:id` sobre um funcionário `active` grava exatamente uma linha com `action` igual a `staff.inactivated`, `user_id` do autor, `entity` igual a `staff`, `entity_id` igual a `:id` e `diff` igual a `{"fields":["status"],"values":{"status":{"from":"active","to":"inactive"}}}` (AC 44)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "inactivate_writes_one_staff_inactivated_row"`

**C53** - `PUT /api/staff/:id/user` grava exatamente uma linha com `action` igual a `staff.user_linked`, `user_id` do autor, `entity_id` igual a `:id` e `diff` igual a `{"fields":["userId"],"values":{"userId":{"from":null,"to":"<userId>"}}}` sobre um funcionário sem vínculo, e com `from` igual ao id do usuário anterior ao trocar o vínculo; com o `userId` que o funcionário já tem, responde `204` sem gravar linha (AC 45, AD-026)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "link_writes_one_user_linked_row_and_same_user_none"`

**C54** - `DELETE /api/staff/:id/user` sobre um funcionário vinculado grava exatamente uma linha com `action` igual a `staff.user_unlinked` e `diff` igual a `{"fields":["userId"],"values":{"userId":{"from":"<userId>","to":null}}}`; sobre um sem vínculo responde `204` sem gravar linha (AC 46)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "unlink_writes_one_user_unlinked_row_and_none_without_link"`

**C55** - Cada um dos vinte e um desfechos a seguir responde exatamente o status do caso e deixa a contagem de `audit_logs` igual à de antes: `POST /api/staff` com `401`, `403`, `409` e `422`; `PATCH /api/staff/:id` com `401`, `403`, `404`, `409` e `422`; `DELETE /api/staff/:id` com `401`, `403`, `404` e sobre um funcionário já `inactive` (`204`); `PUT /api/staff/:id/user` com `401`, `403`, `404`, `409` e `422`; `DELETE /api/staff/:id/user` com `401`, `403` e `404` (AC 47)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "twenty_one_non_writing_write_outcomes_write_no_audit_row"`

**C56** - Com o insert em `audit_logs` falhando, `POST /api/staff`, `PATCH` e `DELETE /api/staff/:id`, `PUT` e `DELETE /api/staff/:id/user` respondem `500` com `code` igual a `internal_error`, e `staff` fica como estava antes da requisição (contagem e linhas idênticas, `status` e vínculo inclusive) (AC 48, AD-027)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "audit_insert_failure_500_rolls_back_five_write_routes"`

**C57** - Depois de criar com `name` igual a `Rafaela Prado Cunha`, `cpf` igual a `529.982.247-25`, `position` igual a `Fisioterapeuta Esportiva`, `department` igual a `Reabilitação`, `hiredAt` igual a `2021-03-15`, `phone` igual a `(11) 91234-5678` e `email` igual a `rafaela.prado@exemplo.com`, de editar cada um, de vincular e de inativar, o texto de todas as colunas de todas as linhas de `audit_logs` não contém nenhum desses sete valores, antes nem depois da edição, nem o CPF com ou sem máscara (AC 49)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "seven_staff_values_never_reach_audit_logs"`

**C58** - Para cada uma das sete ações de rota (`staff.created`, `staff.updated`, `staff.inactivated`, `staff.viewed`, `staff.list_viewed`, `staff.user_linked`, `staff.user_unlinked`), enviada com `X-Forwarded-For: 198.51.100.1, 203.0.113.7` e `User-Agent` de 513 caracteres, a linha grava `ip` igual a `203.0.113.7` e `user_agent` igual aos 512 primeiros; com `X-Forwarded-For: 203.0.113.7` só, o mesmo `ip`; sem `User-Agent`, `user_agent` nulo (AC 50, AD-028)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "ip_and_user_agent_on_the_seven_staff_actions"`

**C59** - Percorridos criar, editar, vincular, inativar, ler a lista e a ficha, um `422` por CPF inválido, um `409` por CPF repetido e um `500` por falha da auditoria, nenhuma linha de log em stdout, stderr nem `console` contém o CPF (com ou sem máscara), o telefone nem o e-mail de nenhum funcionário (AC 51)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-audit.test.ts -t "staff_cpf_phone_email_never_reach_the_log"`

### S7 - Foto do funcionário · ~4 files · ~42 KB · ~11k

**C60** - `POST /api/staff/:id/photo` de `admin` e de `hr_finance`, com a parte `file` de um JPEG de 800×1000 sobre um funcionário sem foto, responde `201` nos dois casos com exatamente as chaves `id`, `version` e `createdAt`, `version` igual a `1`, `createdAt` um instante ISO 8601 e `id` igual ao da linha de `is_current` verdadeiro lida por SQL; o bucket passa a ter exatamente três chaves, `photos/main/<staffId>/<photoId>/thumb.webp`, `medium.webp` e `large.webp` (AC 52, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "post_201_by_admin_and_hr_finance_three_objects_under_the_staff_id"`

**C61** - `POST /api/staff/:id/photo` sobre um funcionário com foto corrente responde `409` com `code` igual a `photo_exists`, e o `snapshotOf` de depois é igual ao de antes (sem linha nova em `photos`, sem objeto do envio, sem linha em `audit_logs`) (AC 53)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "post_with_current_photo_409_photo_exists_and_nothing_changes"`

**C62** - Dez rodadas de dois `POST /api/staff/:id/photo` soltos juntos sobre um funcionário sem foto respondem `201` a exatamente um e `409` com `photo_exists` ao outro; ao fim de cada rodada o funcionário tem uma linha, corrente, e o bucket tem só as três chaves da que venceu (AC 54, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "two_simultaneous_posts_one_201_one_409_and_only_winner_objects"`

**C63** - `PUT /api/staff/:id/photo` de `admin` e de `hr_finance`, com um JPEG de 800×1000 sobre um funcionário com foto corrente de `version` igual a `1`, responde `201` nos dois casos com `version` igual a `2`; a anterior fica com `is_current` falso e `expires_at` entre T0 + 30 dias e T1 + 30 dias (T0 e T1 lidos de `now()` do banco antes e depois da requisição, numa API sem `PHOTO_VERSION_RETENTION_DAYS`), a nova é a única corrente com `expires_at` nulo, e o prefixo `photos/main/<staffId>/` tem seis chaves, as três anteriores com o mesmo SHA-256 de antes (AC 55, AD-047)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "put_replaces_keeps_previous_with_expiry_and_six_objects"`

**C64** - `PUT /api/staff/:id/photo` sobre um funcionário que nunca teve foto, e sobre um cuja foto foi removida por `DELETE`, responde `201` com `version` igual a `1` nos dois casos; o funcionário fica com uma linha, corrente e sem prazo, e três objetos no prefixo (AC 56, AD-048)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "put_without_current_photo_creates_version_1_never_had_and_removed"`

**C65** - `POST` e `PUT /api/staff/:id/photo` respondem, a cada um dos nove casos, o mesmo status e o mesmo `code` que a rota de aluno ao mesmo corpo, e o `snapshotOf` de depois é igual ao de antes: um texto enviado como `image/jpeg` e um GIF (`415 unsupported_media_type`); corpo `application/json` (`415`); parte `file` de 5 242 881 bytes (`413 payload_too_large`); multipart sem parte `file` e com duas partes `file` (`422 validation_failed` com um item de `path` igual a `file`); PNG de 299×400 (`422`); PNG de 3015×13267 (`422`); JPEG truncado na metade (`422`). A parte `file` de exatamente 5 242 880 bytes responde `201` (AC 57, AD-044)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "post_and_put_refusals_match_the_student_routes_status_and_code"`

**C66** - Em cada uma das duas rotas, `POST` e `PUT`, depois do `201` os três objetos novos são WebP de 96×128, 240×320 e 600×800; um PNG de 800×800 de metade esquerda vermelha e direita azul gera uma `large` vermelha a 25% da largura e azul a 75%; um JPEG de 400×300 com orientação EXIF 6, de metade superior vermelha e inferior azul, gera uma `large` de metade direita vermelha e esquerda azul; um JPEG com GPS e a marca `CAMERA-SECRETA-77` gera variantes sem bloco EXIF e sem esses bytes; enviado `foto-original-unica.jpg`, nenhuma chave do bucket contém esse nome e nenhum objeto tem o SHA-256 dos bytes enviados; e, enviado com o nome `../../etc/passwd.jpg`, toda chave nova casa `^photos/main/<staffId>/<photoId>/(thumb|medium|large)\.webp$` (AC 58)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "post_and_put_run_the_same_variant_pipeline_six_properties"`

**C67** - `DELETE /api/staff/:id/photo` sobre um funcionário com uma foto corrente e uma versão guardada responde `204`; depois, o funcionário não tem linha em `photos`, o prefixo dele não tem chave nenhuma (seis objetos a menos) e `photoUrl` da ficha é `null`; sobre um sem foto responde `204` e o `snapshotOf` fica igual (AC 59)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "delete_removes_current_and_stored_versions_and_is_idempotent"`

**C68** - `POST`, `PUT` e `DELETE /api/staff/:id/photo` com `:id` igual a `abc`, com um `uuid` de funcionário nenhum e com o `id` de um aluno respondem, nos nove casos, `404` com `code` igual a `not_found` e o `snapshotOf` de depois é igual ao de antes; e `POST`, `PUT`, `DELETE` e `GET /api/students/:id/photo` com o `id` de um funcionário respondem, nos quatro casos, `404` (AC 60)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "photo_routes_404_for_bad_unknown_and_student_ids_and_student_routes_404_for_staff_id"`

**C69** - `POST /api/staff/:id/photo` que responde `201` grava exatamente uma linha `staff.photo_uploaded`; `PUT` sobre um funcionário com foto corrente, exatamente uma `staff.photo_replaced` e nenhuma `staff.photo_uploaded`; `PUT` sobre um sem foto corrente, exatamente uma `staff.photo_uploaded`; `DELETE` sobre um com foto corrente e uma guardada, exatamente uma `staff.photo_removed`; em todas, `user_id` igual ao autor, `entity` igual a `staff`, `entity_id` igual ao id do funcionário e `diff` nulo, e nenhuma linha de ação `student.*` (AC 61, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "photo_actions_write_one_row_each_with_null_diff"`

**C70** - Com o armazenamento falhando na escrita de `thumb`, de `medium` e de `large` (um caso por variante) e com o endpoint fora, `POST` (sobre funcionário sem foto) e `PUT` (sobre um com foto corrente) respondem `503` com `code` igual a `storage_unavailable`; com o insert em `audit_logs` falhando depois de as três variantes estarem gravadas, os dois respondem `500` com `code` igual a `internal_error`; nos dez casos a contagem de `photos` e de `audit_logs` não muda, a foto corrente (no `PUT`) continua idêntica, sem prazo, e o bucket tem as mesmas chaves de antes (AC 62, AD-027)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "storage_and_transaction_failures_on_post_and_put_leave_everything_as_before"`

**C71** - Cada um dos vinte e um desfechos a seguir responde exatamente o status do caso e deixa a contagem de `audit_logs` igual à de antes: `POST /api/staff/:id/photo` com `401`, `403`, `404`, `409`, `413`, `415`, `422`, `500` e `503`; `PUT` com `401`, `403`, `404`, `413`, `415`, `422`, `500` e `503`; `DELETE` com `401`, `403`, `404` e sobre um funcionário sem foto (`204`) (AC 63)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "twenty_one_non_writing_photo_outcomes_write_no_audit_row"`

**C72** - O expurgo, executado uma vez, sobre três versões vencidas de dois funcionários, remove as três linhas de `photos` e as nove chaves do bucket e grava exatamente três linhas, cada uma com `action` igual a `staff.photo_version_purged`, `entity` igual a `staff`, `entity_id` igual ao id do funcionário daquela versão, `diff` nulo e `user_id`, `ip` e `user_agent` nulos; com o insert em `audit_logs` falhando, a linha de `photos` da versão vencida e a contagem de `audit_logs` ficam como estavam, e a execução seguinte, sem a falha, remove a linha e grava uma linha (AC 64, AD-049, AD-050)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-purge.test.ts -t "purge_removes_expired_staff_versions_with_authorless_rows_in_the_delete_transaction"`

**C73** - `GET /api/photo-files/<photoId>/<variant>` sem cookie, com `sig` válido e `exp` futuro, para cada uma das três variantes de uma foto de funcionário, responde `200` com `Content-Type` igual a `image/webp`, `Cache-Control` igual a `no-store` e o corpo igual, byte a byte, ao objeto da variante no bucket (AC 65, AD-043, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "signed_url_serves_three_variants_of_a_staff_photo_without_session"`

**C74** - Um `INSERT` em `photos` com `student_id` e `staff_id` preenchidos, e outro com os dois nulos, falham por violação de `CHECK` com o nome `photos_one_owner`, sem gravar a linha; um com só `student_id` e um com só `staff_id` entram (AC 66, door 2)
Proof: `pnpm --filter "./packages/database" exec vitest run test/photos.test.ts -t "owner_check_exactly_one_of_student_or_staff_four_combinations"`

**C75** - Sobre um funcionário `inactive`, `POST` responde `201`, `PUT` responde `201` com `version` igual a `2` e `DELETE` responde `204` (AC 67)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "inactive_staff_accepts_post_put_and_delete_of_photo"`

### S8 - Telas de funcionários · ~14 files · ~66 KB · ~16k

**C76** - O link "Funcionários", que leva a `/staff`, aparece no menu para `admin` e para `hr_finance` e não existe para `reception` nem para `instructor` (AC 68)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "staff_link_only_for_admin_and_hr_finance"`

**C77** - Sem sessão, abrir `/staff`, `/staff/new`, `/staff/<id>` e `/staff/<id>/edit` redireciona, nos quatro casos, para `/login`, sem nenhuma requisição a `/api/staff` registrada pela `FakeApi` (AC 69)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "anonymous_four_staff_urls_redirect_to_login"`

**C78** - Para `reception` e para `instructor`, abrir as quatro URLs exibe "Você não tem permissão para acessar esta página." e o texto da página não contém o nome, o CPF, o cargo nem o telefone do funcionário que a `FakeApi` tem; a `FakeApi` responde `403` com `code` igual a `forbidden` a toda requisição `/api/staff*` feita com a sessão desses perfis, como a API real (AC 70)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "reception_and_instructor_see_no_permission_on_four_staff_urls"`

**C79** - Para `admin` e para `hr_finance`, `/staff` exibe o título "Funcionários", o botão "Novo funcionário" que leva a `/staff/new` e uma tabela de colunas "Nome", "Cargo", "Setor" e "Situação", nessa ordem, com as linhas na ordem em que a API as devolve (uma ordem que não é a alfabética), a miniatura da foto ou o círculo das iniciais antes do nome, e o nome de cada linha como link para `/staff/<id>` (AC 71)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "list_title_button_four_columns_order_thumbnail_and_links"`

**C80** - Com `items` vazio, `/staff` exibe "Nenhum funcionário cadastrado." e não exibe a tabela (AC 72)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "empty_registry_shows_no_staff_message"`

**C81** - Renderizar `/staff` com um ou mais funcionários faz a página pedir à API `GET /api/staff` exatamente uma vez e nenhum `GET /api/staff/<id>`, também depois de os links das fichas ficarem à vista na janela e de o ponteiro passar sobre cada um e de esperar 3 s; e, na stack real, abrir `/staff` pela origem do `web` com a sessão de `hr_finance` deixa em `audit_logs` uma linha `staff.list_viewed` e nenhuma `staff.viewed` (AC 73, door 5, Impact "web")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "list_render_asks_for_the_list_once_and_never_for_a_ficha"`
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "staff_registered_through_web_pages_audited_photo_replaced_and_expired_version_purged"`

**C82** - Quando `GET /api/staff` e `GET /api/staff/<id>` falham (a `FakeApi` responde `500`), `/staff` e `/staff/<id>` exibem "Não foi possível carregar os funcionários." e o botão "Tentar novamente" (AC 74)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "load_failure_shows_retry_on_list_and_ficha"`

**C83** - `/staff/new` e `/staff/<id>/edit` exibem os campos "Nome completo", "CPF", "Cargo", "Setor", "Data de admissão", "Telefone" e "E-mail" e o botão "Salvar", e a edição traz os campos preenchidos com os valores da ficha (AC 75)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "form_labels_and_save_button_on_new_and_edit"`

**C84** - Salvar o formulário de `/staff/new` com a API respondendo `201` de um funcionário de `id` `A` leva a `/staff/A`, e salvar o de `/staff/B/edit` com a API respondendo `200` leva a `/staff/B` (AC 76)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "save_navigates_to_the_ficha_of_the_created_and_the_edited_staff"`

**C85** - Com a API respondendo `409` com `cpf_taken`, os dois formulários exibem "Já existe um funcionário com este CPF." junto do campo "CPF" (descrição acessível do campo) e mantêm "Nome completo", "Cargo", "Setor", "Data de admissão", "Telefone" e "E-mail" com o que foi digitado (AC 77)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "cpf_taken_shown_on_cpf_field_keeps_other_fields_on_both_forms"`

**C86** - Para `admin` e para `hr_finance`, `/staff/<id>` exibe o nome, "Situação" como "Ativo" ou "Inativo", "CPF" como `529.982.247-25`, "Cargo", "Setor", "Data de admissão" como `15/03/2021`, "Telefone" como `(11) 91234-5678` para 11 dígitos e `(11) 1234-5678` para 10, e "E-mail", e exibe "—" no `department` e no `email` nulos (AC 78)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "ficha_formats_cpf_phone_hired_at_and_status_with_dash_for_null"`

**C87** - Em "Acesso ao sistema", a ficha exibe "Sem usuário vinculado" quando `user` é `null` e, com vínculo, o e-mail, o perfil por extenso ("Administrador", "Recepção", "RH/Financeiro" ou "Instrutor", um caso por perfil) e "Ativo" ou "Inativo" do usuário (AC 79)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "ficha_access_block_without_user_and_with_each_of_four_roles"`

**C88** - A ficha exibe o botão "Editar" nos dois casos, o botão "Inativar" e não o "Reativar" para o funcionário `active`, e o "Reativar" e não o "Inativar" para o `inactive` (AC 80)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "ficha_buttons_editar_and_inativar_or_reativar"`

**C89** - Acionar "Inativar" abre um diálogo que nomeia o funcionário e não envia requisição nenhuma; "Cancelar" fecha o diálogo sem requisição; confirmar envia exatamente um `DELETE /api/staff/<id>` e a ficha exibe "Inativo" e o botão "Reativar" depois que a API responde `204` (AC 81)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "inactivate_confirms_naming_the_staff_then_deletes"`

**C90** - A ficha exibe "Este funcionário está inativo e o usuário vinculado continua ativo." só quando o funcionário é `inactive` e o `user.active` é verdadeiro; não exibe com funcionário `active` e usuário `active`, com `inactive` e usuário `inactive`, nem com `inactive` sem vínculo (AC 82)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "inactive_staff_with_active_user_shows_warning_in_four_cases"`

**C91** - Para `admin`, a ficha exibe o campo "Usuário vinculado" com a opção "Nenhum" e uma opção "<nome> (<e-mail>)" por usuário que a `FakeApi` devolve em `GET /api/users` (numa ordem que não é a de nome), em ordem de nome, e o botão "Salvar vínculo"; escolher um usuário e acionar o botão envia exatamente um `PUT /api/staff/<id>/user` com o corpo `{"userId":"<id do usuário>"}`, escolher "Nenhum" envia exatamente um `DELETE /api/staff/<id>/user` sem diálogo, e nos dois casos a ficha exibe o "Acesso ao sistema" novo (AC 83)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "admin_links_and_unlinks_user_with_options_ordered_by_name"`

**C92** - Para `hr_finance`, a ficha exibe "Acesso ao sistema" com o vínculo que a API devolve e não exibe o campo "Usuário vinculado" nem o botão "Salvar vínculo"; a página não faz nenhuma requisição a `/api/users` (AC 84)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "hr_finance_sees_access_block_without_link_field_or_users_request"`

**C93** - Com a API respondendo `409` com `user_already_linked` ao `PUT`, a ficha exibe "Este usuário já está vinculado a outro funcionário." e continua mostrando o vínculo de antes; com `GET /api/users` respondendo `500`, a ficha exibe todos os outros campos e "Não foi possível carregar os usuários." no lugar do campo "Usuário vinculado" (AC 85)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "link_conflict_message_and_users_load_failure_message"`

**C94** - Com a API respondendo `404` ao funcionário, `/staff/<id>` e `/staff/<id>/edit` exibem "Funcionário não encontrado." (AC 86)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "unknown_staff_shows_not_found_on_ficha_and_edit"`

**C95** - A ficha com foto exibe a `img` de nome "Foto de <nome do funcionário>" com o `photoUrl`, os botões "Trocar foto", "Usar câmera" e "Remover foto" e nenhuma área "Arraste uma foto aqui ou escolha um arquivo"; sem foto exibe o círculo das iniciais de nome acessível "Sem foto", a área "Arraste uma foto aqui ou escolha um arquivo" e os botões "Enviar foto" e "Usar câmera" (AC 87)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff-photo.spec.ts -g "staff_photo_block_states_with_and_without_photo"`

**C96** - Escolher um arquivo, largar um arquivo na área e capturar pela câmera abrem o diálogo "Ajustar foto" sem nenhuma requisição de foto do funcionário; "Salvar foto" envia exatamente uma requisição `multipart/form-data` com uma única parte `file`, que decodifica num JPEG de razão 3:4, por `POST /api/staff/<id>/photo` e nenhum `PUT` quando o funcionário não tem foto, e por `PUT /api/staff/<id>/photo` e nenhum `POST` quando tem, nos quatro casos: arquivo sem foto, arquivo com foto, câmera sem foto e câmera com foto (AC 88, AD-052)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff-photo.spec.ts -g "staff_photo_file_save_posts_without_photo_and_puts_with_photo"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff-photo.spec.ts -g "staff_photo_camera_save_posts_without_photo_and_puts_with_photo"`

**C97** - Com a API respondendo ao envio `413`, o diálogo exibe "A foto deve ter no máximo 5 MB."; `415`, "Use um arquivo JPEG, PNG ou WebP."; `422` com `errors` de `path` igual a `file` e `message` "A foto precisa ter pelo menos 300×400 pixels.", exatamente essa mensagem; `503` e `500`, "Não foi possível enviar a foto. Tente novamente."; e `409`, "Este funcionário já tem foto."; nos seis casos o diálogo continua aberto (AC 89)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff-photo.spec.ts -g "staff_photo_six_save_errors_show_their_messages"`

**C98** - Acionar "Remover foto" abre um diálogo que nomeia o funcionário e não envia requisição nenhuma; confirmar envia exatamente um `DELETE /api/staff/<id>/photo`, e depois do `204` a ficha exibe a área "Arraste uma foto aqui ou escolha um arquivo" e o círculo "Sem foto" (AC 90)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff-photo.spec.ts -g "staff_photo_remove_confirms_naming_the_staff_then_deletes"`

### S9 - A trilha de funcionário na tela de Auditoria · ~3 files · ~6 KB · ~2k

**C99** - `/audit` exibe na coluna "Ação" "Funcionário criado", "Funcionário editado", "Funcionário inativado", "Ficha de funcionário visualizada", "Lista de funcionários visualizada", "Usuário vinculado ao funcionário", "Usuário desvinculado do funcionário", "Foto do funcionário enviada", "Foto do funcionário removida", "Foto do funcionário trocada" e "Versão anterior da foto do funcionário excluída" para as linhas das onze ações novas; o filtro "Ação" oferece as trinta e uma ações, as onze novas nas posições 21 a 31, nessa ordem; e a linha do expurgo, de `user`, `ip` e `userAgent` nulos, exibe "—" em "Usuário", "IP" e "Navegador" (AC 91, Observable)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "staff_actions_labelled_filter_has_thirty_one_and_authorless_row_dashes"`

**C100** - Uma linha com `entity` igual a `staff` e `entityId` não nulo exibe em "Alvo" o link "Ver funcionário", que leva a `/staff/<entityId>`; uma linha `staff.list_viewed`, de `entityId` nulo, exibe "—" em "Alvo" e nenhum link (AC 92, Observable)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "staff_target_link_ver_funcionario_and_dash_without_target"`

**C101** - Uma linha com `diff` de `fields` igual a `["status","position"]` e `values.status` de `active` para `inactive` exibe em "Detalhes" "Situação: Ativo → Inativo" e "Cargo alterado", e nenhum valor de cargo (AC 93)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "staff_diff_shows_status_change_and_field_name"`

**C102** - Uma linha com `diff` de `userId` de `null` para o id de um usuário que existe exibe em "Detalhes" "Usuário vinculado: — → <nome atual do usuário>"; e a de um usuário que existe para `null`, "Usuário vinculado: <nome atual do usuário> → —" (AC 94)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "staff_diff_shows_linked_user_by_current_name"`

### S10 - Contrato, montagem, concorrência da foto, regressão do aluno e stack · ~8 files · ~28 KB · ~7k

**C103** - No documento de `GET /api/openapi.json`, `/api/staff` traz `get` e `post`; `/api/staff/{id}` traz `get`, `patch` e `delete`; `/api/staff/{id}/user` traz `put` e `delete`; `/api/staff/{id}/photo` traz `post`, `put` e `delete`; os corpos de `post` e `patch` de `/api/staff` e o de `put` de `/api/staff/{id}/user` são `application/json` pelo schema de `packages/contracts`; o `post` e o `put` da foto declaram `multipart/form-data` com a parte binária `file` e nenhum corpo `application/json`, com a resposta `201` do mesmo schema das de aluno (AD-011, Impact "portão")
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "staff_paths_declared_with_multipart_photo_and_json_bodies"`

**C104** - Os corpos reais de `POST /api/staff` (`201`), `GET /api/staff/:id` e `PATCH` (`200`), `GET /api/staff` (`200`, vazio e com itens) e `POST` e `PUT /api/staff/:id/photo` (`201`) validam contra os schemas de resposta de `packages/contracts`; os corpos reais `401`, `403`, `404`, `409` (`cpf_taken`, `user_already_linked` e `photo_exists`), `413`, `415`, `422` e `503` das rotas de funcionário validam contra o schema de erro, e `user_already_linked` é um `code` conhecido desse schema (AD-009, AD-011, Impact "contrato")
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "staff_bodies_match_contract_schemas_and_new_codes_are_known"`

**C105** - `admin` sem 2FA ativo recebe `403` com `code` igual a `two_factor_enrollment_required` nas dez rotas de funcionário, e a lista de rotas bloqueadas escrita no teste as inclui (Surface, `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C106** - Cada uma das oito rotas de escrita de funcionário (`POST /api/staff`, `PATCH` e `DELETE /api/staff/:id`, `PUT` e `DELETE /api/staff/:id/user`, `POST`, `PUT` e `DELETE /api/staff/:id/photo`), com `Origin` igual a `http://evil.example` e sem `Origin` com `Sec-Fetch-Site: cross-site`, responde `403` com `code` igual a `csrf_rejected`, e o `snapshotOf` de depois é igual ao de antes (AD-020)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-access.test.ts -t "foreign_origin_403_csrf_on_eight_staff_write_routes"`

**C107** - Dez rodadas de um `PUT` e um `POST /api/staff/:id/photo` soltos juntos sobre um funcionário sem foto, e dez de um `PUT` e um `DELETE` soltos juntos sobre um com foto: nenhuma resposta tem status `500` ou maior; o `PUT` responde `201`, o `POST` responde `201` ou `409` com `photo_exists` e o `DELETE` responde `204`; ao fim de cada rodada o funcionário tem no máximo uma linha corrente, toda linha não corrente tem `expires_at`, e as chaves do prefixo são exatamente as três de cada linha que ficou, e dois `PUT` soltos juntos sobre um com foto respondem `201` aos dois com as `version` `2` e `3` (door 2; derivado, sem AC própria)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "put_racing_post_or_delete_never_5xx_and_rows_match_objects_for_staff"`

**C108** - Com entrada hostil (`a\u0000b`, `\ud800`, 50 emojis, 60 000 caracteres, `' or 1=1 --`, `%00`, `\`) em `name`, `position`, `department`, `email` e `phone` de `POST` e `PATCH`, em `userId` do `PUT`, e com segmentos hostis (`%E0%A4%A`, `%00`, `a%2Fb`, `..%2F..`, 5 000 caracteres) no `:id` das oito rotas com `:id`, e com corpos `[]`, `null`, `7`, `"texto"` e `{"name":{"a":1}}` em `POST`, nenhuma resposta tem status `5xx` (derivado: as N1 a N3 da verificação da `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/hostile-input.test.ts -t "hostile_input_never_answers_5xx"`

**C109** - O expurgo, executado uma vez com uma versão vencida de aluno e uma de funcionário, uma versão não vencida e uma foto corrente de cada dono (esta com `created_at` 400 dias no passado), remove as duas vencidas e as seis chaves delas, grava uma linha `student.photo_version_purged` com `entity` igual a `student` e `entity_id` do aluno e uma `staff.photo_version_purged` com `entity` igual a `staff` e `entity_id` do funcionário, e deixa as outras quatro linhas e os doze objetos delas idênticos (door 2, door 3, Impact "comportamento existente")
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-purge.test.ts -t "purge_serves_student_and_staff_versions_in_one_run"`

**C110** - Com um aluno e um funcionário que têm, cada um, uma foto corrente, `GET /api/students/:id/photo` (sem `variant` e com `variant=thumb`), `photoUrl` de `GET /api/students/:id` e o do item do aluno em `GET /api/students` trazem a URL assinada com o `photoId` da foto do aluno, nunca a do funcionário; abrir a de `medium` do aluno devolve os bytes do objeto `photos/main/<studentId>/<photoId>/medium.webp`; `POST` e `PUT /api/students/:id/photo` continuam respondendo `201` e gravando sob `photos/main/<studentId>/` (Impact "comportamento existente", door 2, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-photos.test.ts -t "student_photo_routes_and_files_unchanged_beside_staff_photos"`

**C111** - O formulário de `/staff/new` envia `POST /api/staff` sem as chaves `department` e `email` quando os campos estão vazios e com elas quando preenchidos; o de `/staff/<id>/edit`, depois de o usuário apagar "Setor" e "E-mail" preenchidos, envia `PATCH /api/staff/<id>` com `department` e `email` iguais a `null`, e depois de mudar só "Cargo" envia `position` com o valor digitado (derivado da `Surface`: `null` limpa `department` e `email`)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "new_form_omits_empty_optionals_and_edit_form_sends_null_for_cleared"`

**C112** - Acionar "Reativar" na ficha de um funcionário `inactive` envia exatamente um `PATCH /api/staff/<id>` com corpo `{"status":"active"}`, sem diálogo, e a ficha exibe "Ativo" e o botão "Inativar" depois que a API responde `200` (derivado de AC 25 e AC 80)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "reativar_sends_patch_active_without_dialog"`

**C113** - Enquanto a API não responde ao `POST` de `/staff/new` e ao `PATCH` de `/staff/<id>/edit`, o botão "Salvar" fica desabilitado nas duas telas (Observable, loading state "existing" provado nas telas novas)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/staff.spec.ts -g "save_button_disabled_while_waiting_on_both_forms"`

**C114** - Na stack de pé, com a migração `0007` aplicada ao subir e um usuário `hr_finance` e um `admin` criados pelo próprio teste, pela origem do container `web` e com `User-Agent` e `X-Forwarded-For` escolhidos: `hr_finance` cria um funcionário (`201`), envia a foto por `POST` e a troca por `PUT` (`version` igual a `2`); `admin` vincula um usuário de recepção (`204`); abrir `/staff` com a sessão de `hr_finance` deixa mais uma linha `staff.list_viewed` e nenhuma `staff.viewed`; abrir `/staff/<id>` e `/staff/<id>/edit` deixa mais uma `staff.viewed` em cada, com o `ip` e o `user_agent` enviados; abrir `/staff` com a sessão de `reception` mostra "Você não tem permissão para acessar esta página." e não deixa linha; posto o `expires_at` da versão anterior no passado por SQL e reiniciado o serviço `api`, em até 60 s a linha sai de `photos`, as três chaves saem do bucket da stack, a foto corrente continua sendo entregue pela URL assinada e o banco tem uma `staff.photo_version_purged` com `user_id` nulo (AC 1, AC 15, AC 17, AC 32, AC 55, AC 64, AC 73, door 3, door 4, door 5, Assumptions, Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "staff_registered_through_web_pages_audited_photo_replaced_and_expired_version_purged"`

## Coverage

Uma linha para cada rota da `Surface`, com os status como membros, e uma por perfil; depois as doors, o
que `Relations` acrescenta, os conjuntos enumerados nos critérios, nas `Assumptions` e na `Observable`, e
as montagens.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/staff` statuses (3) | 200 C24 · 401 C18 · 403 C17 | - |
| `POST /api/staff` statuses (5) | 201 C9 · 401 C18 · 403 C17 · 409 C12 · 422 C11 | - |
| `GET /api/staff/:id` statuses (4) | 200 C20 · 401 C18 · 403 C17 · 404 C27 | - |
| `PATCH /api/staff/:id` statuses (6) | 200 C29 · 401 C18 · 403 C17 · 404 C39 · 409 C32 · 422 C31 | - |
| `DELETE /api/staff/:id` statuses (4) | 204 C35 · 401 C18 · 403 C17 · 404 C39 | - |
| `PUT /api/staff/:id/user` statuses (6) | 204 C40 · 401 C18 · 403 C17, C19 · 404 C46 · 409 C43 · 422 C42 | - |
| `DELETE /api/staff/:id/user` statuses (4) | 204 C45 · 401 C18 · 403 C17, C19 · 404 C46 | - |
| `POST /api/staff/:id/photo` statuses (9) | 201 C60 · 401 C18 · 403 C17 · 404 C68 · 409 C61 · 413 C65 · 415 C65 · 422 C65 · 503 C70 | - |
| `PUT /api/staff/:id/photo` statuses (8) | 201 C63 · 401 C18 · 403 C17 · 404 C68 · 413 C65 · 415 C65 · 422 C65 · 503 C70 | - |
| `DELETE /api/staff/:id/photo` statuses (4) | 204 C67 · 401 C18 · 403 C17 · 404 C68 | - |
| status `500` fora da `Surface` (4 groups) | `GET /api/staff` C26 · `GET /api/staff/:id` C26 · as cinco rotas de escrita C56 · `POST` e `PUT` de foto C70 | - |
| as dez rotas por perfil (4) | `admin` C9, C20, C40 · `hr_finance` C9, C20, C19 · `reception` C17 · `instructor` C17 | - |
| quem vincula o usuário (2) | `admin` C40, C45 · `hr_finance` C19 | - |
| linha de erro comum da `auth-rbac` nas rotas novas (3) | `401 unauthorized` C18 · `403 csrf_rejected` C106 · `403 two_factor_enrollment_required` C105 | - |
| rotas negadas a `reception` e `instructor` (10) | C17, table-driven over all 10 | - |
| rotas sem sessão (10) | C18, table-driven over all 10 | - |
| rotas de escrita sob a checagem de origem (8) | C106, table-driven over all 8 | - |
| rotas bloqueadas ao `admin` sem 2FA (10) | C105, table-driven over all 10 | - |
| rotas no documento OpenAPI (10) | C103, table-driven over all 10 | - |
| `:id` inválido por rota com `:id` (8) | `GET` da ficha C27 · `PATCH` C39 · `DELETE` C39 · `PUT` do vínculo C46 · `DELETE` do vínculo C46 · `POST` da foto C68 · `PUT` da foto C68 · `DELETE` da foto C68 | - |
| one-way doors (5) | door 1 C1, C3 · door 2 C4, C5 · door 3 C60, C66 · door 4 C7, C47 · door 5 C23, C25 | - |
| relações de `Relations` (3) | usuário e funcionário C3, C40 · funcionário e foto corrente C5, C60 · funcionário e versões guardadas, com prazo C6, C63 | - |
| one-way constraints de `Relations` (8) | CPF único em qualquer situação C3, C12 · CPF independente do de aluno C14 · situação só `active` e `inactive` C2 · um usuário em no máximo um funcionário C3, C44 · um funcionário com no máximo um usuário C3, C41 · foto com um dono só C74 · uma corrente e versão única por funcionário C5 · prazo da AD-047 C6 | - |
| o que `staff` não tem (3) | `role` C1 · `deleted_at` C1 · `tenant_id` C1 | - |
| valores de `status` no banco (6) | `active` C2 · `inactive` C2 · `suspended` C2 · `Active` C2 · `ativo` C2 · cadeia vazia C2 | - |
| `UNIQUE` e chave estrangeira de `staff` (5) | CPF repetido, primeiro ativo C3 · CPF repetido, primeiro inativo C3 · CPF igual ao de aluno convive C3 · `user_id` repetido C3 · usuário vinculado não é apagado C3 | - |
| combinações de dono em `photos` (4) | só aluno C74 · só funcionário C74 · os dois C74 · nenhum C74 | - |
| combinações de `is_current` e `expires_at` para dono funcionário (4) | corrente sem prazo aceita C6 · corrente com prazo recusada C6 · guardada com prazo aceita C6 · guardada sem prazo recusada C6 | - |
| índices e chaves de `photos` de funcionário (5) | `UNIQUE (staff_id, version)` C5 · mesma versão em dois funcionários C5 · `photos_one_current_staff_idx` C5 · duas correntes de dois funcionários C5 · chave estrangeira sem cascata C5 | - |
| o que a migração `0007` deixa no banco (5) | só `staff` de tabela nova C4 · `staff` vazia C4 · linhas de `photos` intactas C4 · `student_id` anulável C4 · `staff_id` com a chave estrangeira C4 | - |
| vocabulário de `AUDIT_ACTIONS` (31) | C7, table-driven over all 31: os vinte de antes e as onze novas | - |
| quem grava cada ação nova (11) | `staff.created` C47 · `staff.updated` C49 · `staff.inactivated` C52 · `staff.viewed` C23 · `staff.list_viewed` C25 · `staff.user_linked` C53 · `staff.user_unlinked` C54 · `staff.photo_uploaded` C69 · `staff.photo_removed` C69 · `staff.photo_replaced` C69 · `staff.photo_version_purged` C72 | - |
| campos registráveis em `diff` (2) | `status` C48, C50, C52 · `userId` C53, C54 | - |
| campos de que a trilha guarda só o nome (7) | `name` C57 · `cpf` C57 · `position` C57 · `department` C57 · `hiredAt` C57 · `phone` C57 · `email` C57 | - |
| ações de `diff` nulo (6) | `staff.viewed` C23 · `staff.list_viewed` C25 · `staff.photo_uploaded` C69 · `staff.photo_removed` C69 · `staff.photo_replaced` C69 · `staff.photo_version_purged` C72 | - |
| leituras que gravam (2) | a ficha C23 · a lista C25 | - |
| quando o insert de auditoria falha (4) | leituras sem dado C26 · escritas desfeitas C56 · envio e troca de foto C70 · expurgo desfeito C72 | - |
| desfechos que não gravam linha, por família (3) | leituras, oito desfechos C28 · escritas, vinte e um C55 · foto, vinte e um C71 | - |
| desfechos de leitura que não gravam (8) | C28, table-driven over all 8 | - |
| desfechos de escrita que não gravam (21) | C55, table-driven over all 21 | - |
| desfechos de foto que não gravam (21) | C71, table-driven over all 21 | - |
| `ip` e `user_agent` da linha (4) | dois valores em `X-Forwarded-For` C58 · um valor C58 · `User-Agent` de 513 caracteres cortado em 512 C58 · sem `User-Agent` C58 | - |
| ações de rota que gravam `ip` e `user_agent` (7) | C58, table-driven over all 7 | - |
| dados pessoais fora do log (3) | CPF C59 · telefone C59 · e-mail C59 | - |
| validação do CPF na criação (7) | menos de 11 dígitos C11 · mais de 11 C11 · 11 iguais C11 · primeiro dígito errado C11 · segundo dígito errado C11 · dígito verificador 0 aceito C11 · máscara retirada C10 | - |
| campos obrigatórios ausentes na criação (5) | `name` C16 · `cpf` C16 · `position` C16 · `hiredAt` C16 · `phone` C16 | - |
| limites de tamanho e de dígitos (12 edges) | `name` 120 C16 · `name` 121 C16 · `position` 80 C16 · `position` 81 C16 · `department` 80 C16 · `department` 81 C16 · `email` 254 C16 · `email` 255 C16 · `phone` 9 C16 · `phone` 10 C16 · `phone` 11 C16 · `phone` 12 C16 | - |
| campos de texto com U+0000 (4) | `name` C16 · `position` C16 · `department` C16 · `email` C16 | - |
| `hiredAt` (8 edges) | data que não existe C15 · mês 13 C15 · formato curto C15 · formato com barras C15 · `1899-12-31` C15 · `1900-01-01` C15 · hoje em São Paulo C15 · amanhã em São Paulo C15 | - |
| normalização na criação (4) | CPF com máscara C10 · CPF sem máscara C10 · telefone de 11 dígitos C10 · telefone de 10 dígitos C10 | - |
| opcionais da criação (2) | `department` C9 · `email` C9 | - |
| o que o `PATCH` edita (8) | `name` C29 · `cpf` C29 · `position` C29 · `department` C29 · `hiredAt` C29 · `phone` C29 · `email` C29 · os sete juntos C29 | - |
| `null` no `PATCH` (8) | `department` C30 · `email` C30 · `name` C31 · `cpf` C31 · `position` C31 · `hiredAt` C31 · `phone` C31 · `status` C31 | - |
| valores de `status` no `PATCH` (6) | `active` reativa C33 · `inactive` C34 · `suspended` C34 · `Active` C34 · `ativo` C34 · cadeia vazia C34 | - |
| CPF no `PATCH` (3) | de outro ativo C32 · de outro inativo C32 · o próprio C32 | - |
| `PATCH` sem mudança (9) | `name` C51 · `cpf` C51 · `position` C51 · `department` C51 · `hiredAt` C51 · `phone` C51 · `email` C51 · `status` igual C51 · corpo vazio C51 | - |
| o que inativar mantém (5) | a linha C35 · o vínculo C35 · as fotos C35 · o usuário ativo e as sessões C36 · nenhum `user.updated` C36 | - |
| inativar quem já está inativo (2) | ativo vira inativo C35 · já inativo nada muda C37 | - |
| pares concorrentes (7) | dois `POST` com o mesmo CPF C13 · dois `PATCH` de campos diferentes C38 · dois `PUT` de vínculo do mesmo usuário C44 · dois `POST` de foto C62 · dois `PUT` de foto C107 · `PUT` e `POST` de foto C107 · `PUT` e `DELETE` de foto C107 | - |
| `userId` inválido (5) | ausente C42 · `abc` C42 · `123` C42 · `null` C42 · `uuid` de usuário nenhum C42 | - |
| vínculo por estado do usuário (4) | ativo C40 · inativo C40 · já deste funcionário C53 · já de outro funcionário C43 | - |
| trocar e desfazer o vínculo (4) | trocar A por B C41 · A fica livre C41 · desvincular C45 · desvincular sem vínculo C45 | - |
| o que a ficha lê do usuário (7) | `admin` C21 · `reception` C21 · `hr_finance` C21 · `instructor` C21 · `active` falso C21 · lido na hora depois de mudança C21 · `null` sem vínculo C21 | - |
| chaves da ficha (11) | C20, table-driven over all 11 | - |
| chaves do item da lista (6) | C24, table-driven over all 6 | - |
| ordem da lista (4) | caixa C24 · acento C24 · empate por `id` C24 · ativos e inativos juntos C24 | - |
| `photoUrl` (4) | `thumb` na lista C24 · `medium` na ficha C22 · `null` sem foto C22 · `photoId` novo depois da troca C22 | - |
| recusas herdadas pelas rotas de foto, uma por AC da `foto-pipeline` (7) | AC 9 conteúdo C65 · AC 10 corpo que não é multipart C65 · AC 11 tamanho C65 · AC 12 parte `file` C65 · AC 13 dimensão C65 · AC 14 resolução C65 · AC 15 ilegível C65 | - |
| tamanho do arquivo de foto (2 edges) | 5 242 880 C65 · 5 242 881 C65 | - |
| variantes herdadas, uma por AC da `foto-pipeline` (6) | AC 16 tamanhos C66 · AC 17 recorte central C66 · AC 18 orientação C66 · AC 19 sem EXIF C66 · AC 20 sem original C66 · AC 21 chave C66 | - |
| rotas de foto que rodam o pipeline (2) | `POST` C66 · `PUT` C66 | - |
| efeitos da troca (5) | anterior deixa de ser corrente C63 · anterior ganha `expires_at` C63 · nova é a única corrente C63 · seis objetos, três intactos C63 · `version` igual a 2 C63 | - |
| `PUT` sem foto corrente (2) | nunca teve C64 · foto removida C64 | - |
| o que o `DELETE` da foto faz (4) | as linhas saem C67 · os objetos saem C67 · `photoUrl` passa a nulo C67 · sem foto nada muda C67 | - |
| dono trocado na rota de foto (4) | id de aluno em `POST` C68 · id de aluno em `PUT` C68 · id de aluno em `DELETE` C68 · id de funcionário nas rotas de aluno C68 | - |
| falhas da foto (5) | `thumb` C70 · `medium` C70 · `large` C70 · endpoint fora C70 · insert de auditoria depois dos objetos C70 | - |
| situação do funcionário que aceita foto (2) | `active` C60 · `inactive` C75 | - |
| entrega do arquivo por URL assinada (3) | `thumb` C73 · `medium` C73 · `large` C73 | - |
| o que o expurgo decide (5) | versão vencida de funcionário sai C72 · duas versões do mesmo funcionário saem C72 · versão vencida de aluno ao lado sai com a ação de aluno C109 · não vencida fica C109 · corrente antiga fica C109 | - |
| expurgo desfeito quando a auditoria falha (1) | C72 | - |
| o aluno não muda (4) | `photoUrl` e URL do aluno C110 · bytes do objeto do aluno C110 · `POST` e `PUT` do aluno gravam sob o aluno C110 · chaves do aluno intactas no expurgo C109 | - |
| códigos novos de erro (2) | `user_already_linked` C104 · `cpf_taken` nas rotas de funcionário C104 | - |
| corpos reais contra o contrato (8) | `201` da criação C104 · `200` da ficha C104 · `200` do `PATCH` C104 · `200` da lista vazia C104 · `200` da lista com itens C104 · `201` de `POST` da foto C104 · `201` de `PUT` da foto C104 · erros contra o schema de erro C104 | - |
| perfis e o menu (4) | `admin` C76 · `hr_finance` C76 · `reception` C76 · `instructor` C76 | - |
| URLs de tela sem sessão (4) | `/staff` C77 · `/staff/new` C77 · `/staff/<id>` C77 · `/staff/<id>/edit` C77 | - |
| URLs de tela negadas (4) | `/staff` C78 · `/staff/new` C78 · `/staff/<id>` C78 · `/staff/<id>/edit` C78 | - |
| perfis negados nas telas (2) | `reception` C78 · `instructor` C78 | - |
| colunas da lista (4) | "Nome" C79 · "Cargo" C79 · "Setor" C79 · "Situação" C79 | - |
| estados de `/staff` em `Observable` (4) | vazio C80 · erro C82 · sem permissão C77, C78 · densidade e ordem C79 | - |
| estados de `/staff/<id>` em `Observable` (4) | campo vazio C86, C87 · erro C82, C93, C94 · sem permissão C77, C78, C92 · ação destrutiva confirma C89 | - |
| estados dos formulários em `Observable` (3) | carregando C113 · erro C85, C94 · sem permissão C77, C78 | - |
| estados do bloco de foto em `Observable` (4) | vazio C95 · erro C97 · sem permissão C78 · ação destrutiva confirma C98 | - |
| textos do formulário (8) | "Nome completo" C83 · "CPF" C83 · "Cargo" C83 · "Setor" C83 · "Data de admissão" C83 · "Telefone" C83 · "E-mail" C83 · "Salvar" C83 | - |
| formatos da ficha (10) | nome C86 · "Situação" C86 · CPF `000.000.000-00` C86 · "Cargo" C86 · "Setor" C86 · data `dd/MM/aaaa` C86 · telefone de 11 dígitos C86 · telefone de 10 dígitos C86 · "E-mail" C86 · "—" no nulo C86 | - |
| "Acesso ao sistema" (8) | "Sem usuário vinculado" C87 · e-mail C87 · "Administrador" C87 · "Recepção" C87 · "RH/Financeiro" C87 · "Instrutor" C87 · "Ativo" C87 · "Inativo" C87 | - |
| botões da ficha (3) | "Editar" C88 · "Inativar" C88 · "Reativar" C88 | - |
| aviso de inativo com usuário ativo (4) | inativo com usuário ativo exibe C90 · ativo com usuário ativo oculta C90 · inativo com usuário inativo oculta C90 · inativo sem vínculo oculta C90 | - |
| o campo de vínculo na ficha (6) | só para `admin` C91 · opção "Nenhum" C91 · uma opção por usuário em ordem de nome C91 · `PUT` C91 · `DELETE` C91 · `hr_finance` sem o campo C92 | - |
| erros do vínculo na tela (2) | `409` C93 · usuários não carregam C93 | - |
| ficha ou edição de funcionário que não existe (2) | `/staff/<id>` C94 · `/staff/<id>/edit` C94 | - |
| bloco de foto da ficha (5) | imagem com texto alternativo C95 · iniciais "Sem foto" C95 · área de envio sem foto C95 · botões com foto C95 · sem área com foto C95 | - |
| método do envio da foto (4) | arquivo sem foto `POST` C96 · arquivo com foto `PUT` C96 · câmera sem foto `POST` C96 · câmera com foto `PUT` C96 | - |
| mensagens do envio da foto (6) | `413` C97 · `415` C97 · `422` C97 · `409` C97 · `503` C97 · `500` C97 | - |
| diálogos de confirmação (2) | "Inativar" C89 · "Remover foto" C98 | - |
| escritas que a tela envia (6) | `POST` sem opcionais vazios C111 · `PATCH` com `null` C111 · `PATCH` só do que mudou C111 · `PATCH` de `status` igual a `active` C112 · `PUT` do vínculo C91 · `DELETE` do vínculo C91 | - |
| o que a renderização de `/staff` pede à API (2) | uma requisição à lista C81 · nenhuma à ficha C81 | - |
| linhas que a renderização grava na stack (4) | `/staff` uma `staff.list_viewed` C114 · `/staff/<id>` uma `staff.viewed` C114 · `/staff/<id>/edit` uma `staff.viewed` C114 · `/staff` da recepção nenhuma C114 | - |
| ações novas por extenso em `/audit` (11) | "Funcionário criado" C99 · "Funcionário editado" C99 · "Funcionário inativado" C99 · "Ficha de funcionário visualizada" C99 · "Lista de funcionários visualizada" C99 · "Usuário vinculado ao funcionário" C99 · "Usuário desvinculado do funcionário" C99 · "Foto do funcionário enviada" C99 · "Foto do funcionário removida" C99 · "Foto do funcionário trocada" C99 · "Versão anterior da foto do funcionário excluída" C99 | - |
| filtro "Ação" (31) | C99, table-driven over all 31: os vinte de antes e as onze novas, posições 21 a 31 | - |
| linha sem autor ou sem alvo em `/audit` (3) | "Usuário" nulo C99 · "IP" e "Navegador" nulos C99 · "Alvo" nulo C100 | - |
| link "Ver funcionário" (2) | com `entityId` C100 · sem `entityId` C100 | - |
| detalhes de funcionário em `/audit` (4) | `status` de ativo a inativo C101 · nome do campo `position` C101 · vínculo de nulo a usuário C102 · desvínculo de usuário a nulo C102 | - |
| startup config: migração `0007` aplicada (3 assemblies) | banco migrado em `packages/database` C1 · harness de `apps/api` C9 · stack do compose C114 | - |
| startup config: rotas `/api/staff*` e `/staff*` pela origem do web (2 assemblies) | build de produção do web contra a `FakeApi` C79 · container `web` da stack C114 | - |
| startup config: expurgo que alcança a versão de funcionário (2 assemblies) | API montada pelo harness C72 · container `api` da stack C114 | - |

- Claims naming a status code, route or response shape: C9 a C75 e C103 a C110 cruzam a fronteira HTTP da
  API montada pelo `startStack` (C60 a C73, C75, C107, C109 e C110 leem também o bucket); C76 a C102 e
  C111 a C113 cruzam a fronteira do web no navegador, sobre o build de produção; C81 e C114 cruzam as duas
  no processo real da stack. C1 a C6 e C74 provam o banco migrado no próprio nível, C7 e C8 o vocabulário
  e os schemas no próprio nível, e C72 e C109 provam o expurgo no próprio nível (a função chamada sobre
  Postgres e MinIO reais), porque ele não é alcançado por rota nenhuma
- Linhas de `Impact` e onde cada uma é provada: domínio, `staff` e `status` C1 a C3; a foto de dois donos
  C4 a C6, C60 a C75, C109 e C110; "visualização" como ação da trilha C23, C25 e C81; o perfil de acesso
  lido na hora C21; `AUDIT_ACTIONS` e `ACTION_LABELS` C7 e C99; os cinco testes de `audit.spec.ts`
  de outra feature, que passam de vinte para trinta e uma ações (lista abaixo); `user_already_linked` e
  `cpf_taken` C104; as regras de CPF e telefone numa definição só C8; o expurgo C72 e C109; as suítes de
  aluno que provam que nada mudou C110 e a lista abaixo; `GET /api/photo-files/*` público e a URL só
  nas respostas de `/api/staff*` C17 e C73; menu C76; `<Link>` que pré-carrega C81; `/audit` C100 a C102;
  as dez rotas no OpenAPI C103 (a cobertura de 70% de `apps/api/src` é o portão existente de
  `pnpm verify`, sem check novo); ambiente sem variável nova: `env_example_lists_every_required_key` e
  `missing_var_exits_1_naming_it` seguem como estão, e reprovam se o Build acrescentar uma variável;
  stored data C4, C35 (inativar não apaga) e C3 (usuário vinculado não é apagado por SQL); `audit_logs` que
  cresce por leitura C23, C25 e C114
- **Testes existentes que o Build edita** porque o claim deles muda pelo `Impact` do plano; o nome fica, o
  conteúdo ganha o que o plano acrescenta e nenhuma asserção é afrouxada:
  `audit_actions_end_with_replace_and_purge_in_order`, `audit_actions_end_with_two_photo_actions_in_order`,
  `audit_actions_end_with_three_consent_actions_in_order` e
  `audit_actions_end_with_three_student_actions_in_order` em `contracts.test.ts` (o `toHaveLength(20)` das
  linhas 231, 355, 375 e 399 passa a 31, e cada um continua afirmando a ordem das suas ações no começo da
  lista); `auditActionSchema.options` de `ten_actions_written_equal_contract_vocabulary` em
  `audit-auth.test.ts` (linha 322: de vinte para trinta e uma, o teste passa a percorrer as onze ações de
  funcionário e o filtro `row.entity !== 'user' && row.entity !== 'student'` da linha 326 aceita `staff`);
  `ten_actions_shown_by_label` (linha 137, `AUDIT_ACTIONS` de vinte para trinta e uma),
  `student_actions_labelled_and_filter_has_thirteen` (linha 208),
  `consent_actions_labelled_and_filter_has_sixteen` (linha 460), `photo_actions_labelled_and_filter_has_eighteen`
  (linha 521) e `replace_and_purge_actions_labelled_and_filter_has_twenty` (linha 544) em `audit.spec.ts`
  (as quatro contagens de opções do filtro, de vinte para trinta e uma, e a ordem e o texto das vinte
  primeiras intactos); `paths_equal_registered_api_routes` e `request_bodies_come_from_contract_schemas` em
  `openapi.test.ts` (as dez rotas entram na lista de caminhos, e o `post` e o `put` multipart da foto de
  funcionário entram na lista de exceções ao lado dos do aluno); `admin_without_2fa_gets_403_everywhere_else`
  em `enrollment.test.ts` (as dez rotas entram na lista de bloqueadas, C105); `hostile_input_never_answers_5xx`
  em `hostile-input.test.ts` (as rotas de funcionário entram, C108); em `shell.spec.ts`,
  `users_link_only_for_admin`, `students_link_for_all_four_roles` e `audit_link_only_for_admin` seguem como
  estão, e o link novo é provado à parte (C76)
- **Testes de outra feature cujo claim muda e que o Build edita, com a mudança escrita aqui para não ser uma
  surpresa**: em `packages/database/test/photos.test.ts`, `defaults_uuidv7_and_not_null` (C2 da
  `foto-pipeline`: "sem qualquer um dos três campos o insert falha por `NOT NULL`") deixa de valer para
  `student_id`, porque a door 2 o torna anulável: o insert sem dono passa a falhar por violação do `CHECK`
  `photos_one_owner` (código `23514`), e `version` e `is_current` continuam falhando por `NOT NULL`;
  `migration_0005_adds_only_photos_without_tenant_or_owner_columns` compara o conjunto de tabelas do banco
  inteiro migrado, que com a `0007` ganha `staff`: a lista esperada passa a ser a de antes mais `photos` e
  `staff`, e a asserção de que `photos` não tem `tenant_id`, `owner_type` nem `owner_id` fica como está.
  Nenhuma outra asserção dos dois muda, nem as dos outros quatro testes do arquivo. A preparação de
  `version_check_and_unique_per_student` e `partial_unique_index_one_current_per_student` não muda: os
  inserts deles já trazem `student_id`
- **Provas da `foto-pipeline` e da `foto-captura` que seguem como estão e são a regressão do aluno** (Impact
  "comportamento existente"): `photos-upload`, `photos-variants`, `photos-delete`, `photos-replace`,
  `photos-urls`, `photos-purge`, `photos-audit` e `photo-keys.test.ts`, mais `photos.spec.ts`,
  `photo-editor.spec.ts` e `photo-camera.spec.ts`. As de web recebem o `studentId` por prop e o Build as
  executa depois de mover `PhotoBlock`, `PhotoEditor`, `PhotoCamera` e `StudentPhoto` (Impact "web"); um
  teste que precise de edição para continuar compilando só troca o nome da prop. A C110 e a C109 afirmam
  o claim que o plano faz sobre elas sem depender de a suíte inteira ficar verde
- `paths_equal_registered_api_routes`, `responses_match_contract_schemas` e `only_four_routes_answer_without_session`
  leem o roteador ou a lista de rotas e passam a cobrir as dez rotas novas: a primeira é a C103, a segunda
  não ganha check próprio aqui, e a terceira segue com quatro rotas (a C18 prova o `401` das dez)
- C65 e C66 provam um caso por AC herdada, não a tabela inteira de cada uma: a tabela (cinco conteúdos,
  quatro partes malformadas, cinco dimensões, oito orientações) é provada no `POST` de aluno pela C18 a C31
  da `foto-pipeline`, e o `Flow` do plano fixa que a rota de funcionário usa a mesma leitura, a mesma
  validação e a mesma geração de variantes. Se o Build der à foto de funcionário uma segunda implementação
  de qualquer uma delas, um caso por AC deixa de bastar e as tabelas passam a ser devidas também lá: é o
  que o Verifier confere no diff
- Além do texto das AC, derivado do `Impact`, das `Assumptions`, das doors ou da prática do repositório, e
  que o Build pode discutir antes de fechar: o `409 cpf_taken` com o CPF mascarado contra o guardado sem
  máscara (C12); o CPF do próprio funcionário aceito no `PATCH` (C32); as `version` `2` e `3` de dois `PUT`
  simultâneos e as corridas do `PUT` com `POST` e com `DELETE` da foto, que hoje dariam `500` pelo índice
  parcial único se a rota não as tratasse (C107); o `diff` do vínculo trocado com o `from` do usuário
  anterior (C53); a entrada hostil nas rotas novas (C108); o expurgo com os dois donos na mesma execução
  (C109); o texto de desvínculo em `/audit` (C102, simétrico ao da AC 94); a `FakeApi` que responde `403` ao
  perfil negado (C78); a ausência de requisição a `/api/users` para `hr_finance` (C92); a ausência de
  diálogo ao desvincular e ao reativar (C91, C112); os corpos do `POST` e do `PATCH` da tela, sem
  opcionais vazios e com `null` para o que foi apagado (C111); e o botão "Salvar" desabilitado enquanto a
  API não responde (C113, o "existing" da `Observable`, que o Verifier não teria como conferir sem ele)
- Decisões que o plano deixa de fora de AC e que nenhum check afirma: a ordem de `fields` quando o
  `PATCH` muda mais de dois campos (C49 manda `position` e `phone` nessa ordem, e a regra da ordem fica ao
  Build); o que a tela de edição mostra no campo "Data de admissão"
  (o formato de digitação não é de AC; C111 afirma só o corpo enviado); se o `PUT` do vínculo sobre um
  usuário inativo avisa na tela (o aviso da AC 82 é o do funcionário inativo, não o do usuário inativo,
  e a C87 mostra o `Inativo` do usuário); a paginação da lista (fora de escopo no plano); o que acontece
  com o vínculo quando um dia a `privacidade` apagar o usuário (fora de escopo); a qualidade do JPEG do
  recorte, que a `foto-captura` já deixou sem prova
- O recorte, o zoom, o giro e a câmera são os da `foto-captura` (door 6 dela) e não ganham prova nova: a
  C96 prova que o diálogo envia à rota certa, com o método certo, e a decodificação do JPEG de 3:4 usa o
  oráculo daquela feature
- Perguntas respondidas no padrão recomendado (nenhum check muda): a 1, só o Administrador vincula (C19, C91
  e C92); a 2, inativar não mexe no usuário e a ficha avisa (C36, C90); a 3, a lista grava uma linha sem alvo
  (C25, C81)
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md`, `auditoria`, `alunos`, `consentimento`, `foto-pipeline` e
`foto-captura` seguem valendo e respondem as duas perguntas para o que esta feature reaproveita (a rota
que decide, alcançada por HTTP, com o corte por perfil e a linha de auditoria; o expurgo sem fronteira
HTTP; a restrição do banco; o gravador da trilha; a tela contra a `FakeApi`; o diálogo de recorte). Respondem
mal dois casos que lá não existiam, e os dois ganham linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide por dono: a rotina de foto escolhe a coluna do dono, o segmento da chave e a ação da trilha conforme o dono seja aluno ou funcionário (`store`, `remove`, `purgeExpired`, `fileOf`, `currentId`, `currentIds`, `findStudent` e o que os substitui) | uma prova por dono sobre cada rotina, e uma prova com os dois donos na mesma execução, lendo `photos`, `audit_logs` e o bucket depois de cada caso | cada ramo da rotina afirmado para os dois donos: a chave `photos/main/<dono>/...`, a ação `student.*` ou `staff.*`, a coluna preenchida e a outra nula; o aluno não muda quando o funcionário tem foto (C109, C110) |
| Tela cuja renderização tem efeito no servidor (a página renderizada no servidor é a leitura que grava uma linha de auditoria) | uma prova no navegador, contra a `FakeApi`, das requisições que a página faz (quantas e a quais), **e** uma prova na stack real, contando as linhas de `audit_logs` que cada página deixa | um caso por página (lista, ficha, edição) e o caso do perfil negado, que não grava; a prova da `FakeApi` nunca afirma linha de auditoria, e a da stack nunca afirma texto de tela além da mensagem de permissão |

Evidence (o código da feature ainda não existe; a contagem vem do plano e do código que ele altera):

- criação e edição: 5 campos obrigatórios, 12 bordas de tamanho e de dígitos, 8 de `hiredAt`, 7 do CPF, 4
  campos com U+0000, 9 casos sem mudança, 3 conflitos de CPF, 2 corridas por CPF e por campos (C9 a C16,
  C29 a C39, C51) -> decide
- vínculo: 5 `userId` inválidos, 4 estados do usuário, 1 unicidade sob concorrência, 4 trocas e desfazeres
  (C40 a C46, C53, C54) -> decide
- leitura que grava: 2 ações, 8 desfechos que não gravam, 1 insert que falha, 2 formas de chave (C20 a
  C28) -> decide
- perfil: 10 rotas, 2 perfis negados, 1 perfil que não vincula, 4 perfis em `Relations` (C17 a C19) -> decide
- auditoria de escrita: 7 ações de rota, 21 desfechos que não gravam, 5 rotas que desfazem (C47 a C59) ->
  decide
- foto: 9 e 8 status, 9 recusas herdadas, 6 propriedades das variantes, 5 falhas, 4 pares concorrentes, 21
  desfechos que não gravam (C60 a C75, C107) -> decide, por dono; `photos.service.ts` tem hoje 15 pontos de
  decisão (`store` 6, `remove` 1, `purgeExpired` 3, `fileOf` 3, `findStudent` 2), todos reescritos por dono
- expurgo: 5 decisões por linha, mais 2 donos na mesma execução (C72, C109) -> decide, sem rota
- migração `0007`: 1 tabela com 2 `UNIQUE` e 1 `CHECK`, 1 coluna nova com `CHECK` de dono e 2 índices (C1 a C6,
  C74) -> decide
- telas: 4 URLs, 4 colunas, 5 estados da ficha, 6 mensagens do envio, 4 vias de envio, 6 escritas, 2 diálogos
  de confirmação, 3 estados de `Observable` por tela (C76 a C98, C111 a C113) -> decide, na tela
- `staff.controller.ts` (novo): cada rota valida o corpo pelo schema e chama o serviço -> instrumentação além
  do `404` por `:id`, que a C27, C39, C46 e C68 provam
- closest analogue in the repo: `apps/api/test/students-create.test.ts`, `students-update.test.ts` e
  `students-audit.test.ts` (a rota que decide, provada na fronteira com Postgres real e a linha lida por
  SQL); `apps/api/test/students-read.test.ts` (a ficha por perfil e `reading_students_writes_no_audit_row`,
  que a door 5 inverte); `apps/api/test/photos-replace.test.ts` e `photos-purge.test.ts` (a mesma rotina de foto
  sobre o outro dono); `apps/web/e2e/students.spec.ts` e `photos.spec.ts` (as telas contra a `FakeApi`); e
  `tests/stack/compose.test.ts` (`photo_replaced_through_web_then_expired_version_purged_on_api_restart`, a
  stack lendo `audit_logs` por `psql`)

Cost: 9 arquivos de teste novos de API (`staff-create`, `-access`, `-read`, `-update`, `-user`, `-audit`,
`-photos`, `-purge` e `support/staff.ts`), 1 de banco, 2 de tela mais o apoio `support/staff.ts` do web, uma
subida de Postgres por arquivo de API novo e de MinIO nos dois de foto, e a `FakeApi` com 10 rotas a mais.
Sem a primeira linha, a rotina de foto seria provada só no dono que já existia, e o aluno passaria a depender
de a suíte antiga continuar verde por acaso; sem a segunda, a AC 73 seria afirmada por uma tela que não grava
nada ou por uma stack que não vê a requisição.

## Swept

- validation: C8, C11, C15, C16, C31, C34, C42, C65
- failure modes: C26, C56, C70, C72, C82, C93, C97
- idempotency: C37 (inativar quem já está inativo), C45 (desvincular sem vínculo), C51 (editar sem mudar), C53 (vincular o mesmo usuário), C67 (remover sem foto), C72 (a execução seguinte do expurgo remove o que a anterior deixou); ler duas vezes grava duas linhas, e é a decisão da door 5, provada em C23
- authorization: C17, C18, C19, C105, C106, C73; existing - a guarda global (AD-022) e a checagem de origem (AD-020), pelas provas `guard_matrix_three_declarations_five_callers` e `only_four_routes_answer_without_session`; a URL assinada de foto só sai em resposta de `/api/staff*`, que só `admin` e `hr_finance` alcançam (C17)
- concurrency: C13, C38, C44, C62, C107; existing - dois expurgos ao mesmo tempo, pela prova `two_concurrent_purges_remove_once_and_write_one_audit_row`, porque a rotina é a mesma que a do aluno
- data lifecycle: C4, C35, C63, C67, C72, C109 - a inativação mantém a linha, o vínculo e as fotos, a versão guardada ganha prazo na troca e sai sozinha, a corrente nunca expira; exclusão definitiva, anonimização, exportação e a retenção da própria trilha são da `privacidade`
- dependency failure: C26 (auditoria que falha na leitura), C56 (nas escritas), C70 (armazenamento e transação na foto), C82 (a API que não responde à tela), C93 (a lista de usuários que não carrega); existing - banco fora na consulta cai no `500 internal_error` do `ProblemFilter`, pela prova `unhandled_500_hides_exception` da `fundacao`
- state transitions: C2, C33, C34, C35, C41, C45, C50, C52, C53, C54, C63, C64, C112 - `active` e `inactive`, o vínculo que muda de dono, a foto corrente que vira guardada
- observability: C23, C25, C47 a C59, C69, C72, C99 a C102, C114 - a trilha de funcionário, em toda leitura e escrita, é o que esta feature torna observável; C59 mantém CPF, telefone e e-mail fora do log

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado (KB de código e teste, dividido por quatro); o que já existe foi medido com `wc -c`. Código novo: S0 = 7k (a migração `0007`, o snapshot do Drizzle, `contracts/src/staff.ts` e `staff.test.ts` do banco), S1 = 7k (o módulo de funcionários, `support/staff.ts` e `staff-create.test.ts`), S2 = 2k, S3 = 6k, S4 = 6k, S5 = 4k, S6 = 6k, S7 = 11k (a rotina de foto por dono, `staff-photos.test.ts` e `staff-purge.test.ts`), S8 = 16k (as quatro páginas, os formulários, o vínculo, `staff.spec.ts`, `staff-photo.spec.ts` e o apoio da `FakeApi`), S9 = 2k, S10 = 7k (5k de API em C103 a C110 e 2k de tela e stack em C111 a C114): 74k. Arquivos existentes que a feature edita ou lê para editar (43 arquivos, 315 KB: `apps/api/src` 35 KB em 8, `packages` 29 KB em 7, testes de API e de banco 119 KB em 11, `apps/web/src` 54 KB em 11, testes de tela e stack 78 KB em 6; os maiores: `contracts.test.ts` 30 KB, `compose.test.ts` 28 KB, `audit.spec.ts` 21 KB, `support/photos.ts` 16 KB, `photos-purge.test.ts` 15 KB, `audit-auth.test.ts` 14 KB): 315 KB ÷ 4 = 79k. `plan.md` (56 KB, 14k) e este arquivo (103 KB, 26k): 40k. Total 74k + 79k + 40k = 193k, acima do orçamento de 150k
- Corte, nos limites em que a superfície muda (o dado do funcionário, depois o vínculo e a foto, depois as telas), sem dividir slice: batch A = S0 a S4 (C1 a C39: banco, contrato, criar, ler, editar e inativar): código novo 7k + 7k + 2k + 6k + 6k = 28k, arquivos existentes 35k (141 KB em 18: `apps/api/src` 17 KB em 4, `packages` 28 KB em 6, `contracts.test.ts`, `audit-auth.test.ts`, `access.test.ts`, `support/students.ts`, `support/stack.ts` e `photos.test.ts` do banco, 71 KB, e `apps/web/src/lib/audit.ts` e `audit.spec.ts`, 26 KB, que entram aqui pelos onze rótulos e pelas contagens), documentos 40k = 103k; batch B = S5 a S7 e C103 a C110 (C40 a C75 e as provas de contrato, montagem, concorrência e regressão do aluno): código novo 4k + 6k + 11k + 5k = 26k, arquivos existentes 20k (81 KB em 11: `photos.service.ts`, `photo-keys.ts`, `photo-purge.ts`, `photos.controller.ts`, `contracts/src/photos.ts`, `openapi.test.ts`, `enrollment.test.ts`, `hostile-input.test.ts`, `photos-purge.test.ts`, `support/photos.ts`, `photos.test.ts` do banco), documentos 40k = 86k; batch C = S8, S9 e C111 a C114 (as telas, a trilha na tela e a stack): código novo 16k + 2k + 2k = 20k, arquivos existentes 33k (131 KB em 17: `apps/web/src`, `e2e`, `compose.test.ts`), documentos 40k = 93k. Soma: 28k + 26k + 20k = 74k de código novo; 35k + 20k + 33k = 88k de existentes, 9k a mais que os 79k acima porque `audit.ts`, `audit.spec.ts` e `photos.test.ts` são relidos em dois batches; 3 × 40k de documentos. Nenhuma slice sozinha passa de 16k, então nenhuma foi cortada demais
- Por que três e não dois: empacotar S0 a S7 e C103 a C110 num batch só dá 54k de código novo + 52k de existentes + 40k de documentos = 146k, folga de 4k (2%) sobre o orçamento. Na `foto-captura` o batch 1 estimado em 94k passou dos 150k antes de chegar ao web, porque a parcela que cresce é a leitura dos testes existentes que servem de molde e a saída das execuções, não o código novo. O corte entre a S4 e a S5 é o segundo que o plano já mostra (do dado da pessoa para o que se liga a ela), e C103 a C110 vão com a S5 a S7 porque só fazem sentido com as dez rotas de pé
- Ordem: S0 primeiro (a tabela, o segundo dono da foto, o vocabulário e o contrato, de que todo o resto depende). No mesmo commit da migração `0007` entram as duas edições de `photos.test.ts` do banco (`defaults_uuidv7_and_not_null` e `migration_0005_adds_only_photos_without_tenant_or_owner_columns`, ver a lista abaixo da `Coverage`), ou o arquivo reprova; no mesmo commit de `AUDIT_ACTIONS` entram os onze rótulos de `ACTION_LABELS` (`apps/web/src/lib/audit.ts`), as contagens de vinte para trinta e uma em `contracts.test.ts`, `audit-auth.test.ts` (só o `toHaveLength`; o teste passa a percorrer as ações de funcionário na S6 e na S7) e nos cinco testes de `audit.spec.ts`, ou o typecheck do web e sete testes reprovam. Cada commit que cria uma rota de funcionário entra também nas três listas que enumeram as rotas (`paths_equal_registered_api_routes`, `request_bodies_come_from_contract_schemas` e `admin_without_2fa_gets_403_everywhere_else`), ou `pnpm verify` reprova; C103 e C105 só fecham quando as dez estão de pé. Depois S1, S2, S3, S4, S5, S6, S7, C103 a C110, S8, S9, C111 a C114. Antes da S1, conferir que `to_jsonb(staff)` serve às provas de linha idêntica; antes da S7, que a rotina de foto por dono mantém verdes `photos-upload`, `photos-replace`, `photos-delete`, `photos-urls`, `photos-purge`, `photos-audit` e `photo-keys.test.ts` sem editá-los (o tipo do dono vira `string | null` e o typecheck aponta cada uso); antes da S8, que o Next 16 não pré-carrega `/staff/<id>` a partir de um `<Link>` sem `prefetch={false}` (a C81 é quem prova, e o `<Link>` já nasce com `prefetch={false}` como o de `/students` e `/audit`), e para onde vão `PhotoBlock`, `PhotoEditor`, `PhotoCamera` e `StudentPhoto` (o Impact manda o diff decidir) sem mudar uma asserção de `photos.spec.ts`, `photo-editor.spec.ts` e `photo-camera.spec.ts`
- Mechanism: handoff - escolhido pelo usuário em 2026-10-06 (batches A, B e C em sequência e só na verde, cada um em sessão nova que lê este arquivo e o diff do que já entrou; o Verifier só roda depois do batch C)
- Boundary (batch A, S0 a S4, `pnpm verify` verde em `f57adf5`: 21 tarefas, 392 testes de API, 47 de banco, cobertura de `apps/api/src` em 93,8% de linhas): fechados por inteiro C1 a C6, C8 a C16, C20, C21, C23 a C39. Fechados em parte, porque a prova pede uma rota que só existe depois (cada um tem um catraca no código, que só encolhe e que o batch B esvazia): **C7** (a segunda prova, `ten_actions_written_equal_contract_vocabulary`, tem `STAFF_ACTIONS_NOT_ROUTED_YET` em `audit-auth.test.ts`, hoje com `staff.user_linked`, `staff.user_unlinked` e as quatro de foto; a S5 tira as duas de vínculo e a S7 as quatro de foto, e o teste reprova se uma ação da lista já estiver sendo gravada), **C17**, **C18** e **C19** (as tabelas das dez rotas usam `UNBUILT_STAFF_ROUTES` de `support/staff.ts`, hoje com `PUT` e `DELETE /api/staff/:id/user` e as três de foto, e exigem o `404` delas enquanto estiverem na lista; a S5 e a S7 as tiram da lista no commit que cria a rota, e então as tabelas afirmam `403`/`401` de verdade; a C19 hoje só prova o `404` e o vínculo intocado) e **C22** (a foto vem de `seedStaffPhoto` por SQL e o bucket do teste, e a troca é feita por SQL: a S7 refaz esse passo pelo `PUT`). Commits: `7710560` (migração `0007`, C1 a C6 e C74 do banco), `1424499` (vocabulário, rótulos, schemas: C7 e C8), `0c1ab5f` (S1), `d6e7b92` (S2), `0d6e18c` (S3), `f57adf5` (S4). C74 já está provado no banco (`photos.test.ts`), embora seja da S7. O Verifier não foi disparado: só depois do batch C
- Settled mid-build: nada foi decidido pelo usuário durante este batch. Decisões do Build, sem check e reversíveis: (1) `department` vazio é recusado (`min(1)`), como o `position`; os checks só falam de 80 e 81; (2) as regras de CPF, telefone, nome e data viraram `packages/contracts/src/person.ts`, importado por `students.ts` e `staff.ts` (AD-011); (3) colunas de `staff`: `name`, `cpf`, `position`, `department`, `hired_at`, `phone`, `email`, `status`, `user_id`, `created_at`, `updated_at`; (4) a ordem de `fields` do `diff` de `staff.updated` é a de `TRACKED` (`name`, `cpf`, `position`, `department`, `hiredAt`, `phone`, `email`, `status`); (5) a lista ordena por `students_fold(name) collate "C"` e depois `id`; (6) `PhotosService` ganhou só o lado de leitura do segundo dono (`staffPhotoUrls`, e `fileOf` serve o objeto do dono que a linha de `photos` nomeia); `purgeExpired` ainda pula as linhas de funcionário (`studentId === null`), e a S7 troca isso pela rotina por dono
- Abandoned / deviations: (1) além das duas edições de `photos.test.ts` do banco que este arquivo prevê, mais duas foram necessárias e não estão na lista da `Coverage`, sem afrouxar nenhuma asserção: `student_foreign_key_without_cascade_blocks_delete` passou a consultar a chave pelo nome (`photos_student_id_students_id_fk`), porque `photos` agora tem duas chaves estrangeiras, e `migration_0006_adds_only_nullable_expires_at_and_keeps_existing_rows_current` passou a migrar só até a `0006`, porque o segundo `migrate` rodava até a última migração e a `0007` muda `photos`; a nota "nem as dos outros quatro testes do arquivo" da `Coverage` estava errada para esses dois (o arquivo tem oito testes); (2) o commit `7710560` da migração deixou o typecheck de `apps/api` vermelho até o `1424499`, que estreita `student_id` em `photos.service.ts`; (3) a C7 e as tabelas de dez rotas ficam com catraca em vez de vermelhas até o batch B, que é o que torna `pnpm verify` verde ao fim da S4; (4) os commits levam o trailer `Co-Authored-By` que o repositório já usa, apesar de a skill dizer para não pôr atribuição
