# Trilha de auditoria - checks

Profile: light
Plan: `.specs/features/auditoria/plan.md`

## Intent

73 checks in 7 slices · 7 one-way doors · 1 open, of which 0 block

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`,
`playwright test <arquivo> -g`). Os arquivos `audit-users.test.ts`, `audit-diff.test.ts`,
`audit-auth.test.ts`, `audit-origin.test.ts`, `audit-logs.test.ts` (em `apps/api/test`),
`packages/database/test/audit.test.ts` e `apps/web/e2e/audit.spec.ts` são criados no Build;
`create-admin.test.ts`, `access.test.ts`, `openapi.test.ts`, `contracts.test.ts`, `shell.spec.ts` e
`tests/stack/compose.test.ts` existem e ganham casos, salvo `only_three_routes_answer_without_session`
(C53), que já existe e passa a cobrir a rota nova sem edição. Regras que valem para todas, além das
cinco de `features/auth-rbac/checks.md`, que seguem valendo:

- "Linha" é linha de `audit_logs`, lida do banco do próprio teste por SQL, nunca pela rota de
  consulta - salvo nas provas da S6, que são sobre a rota.
- "Exatamente uma linha" é a diferença entre a contagem de `audit_logs` antes e depois da requisição,
  mais a leitura da linha nova.
- "O insert em `audit_logs` falhando" é um gatilho `BEFORE INSERT` que o teste cria no próprio banco
  e que recusa a instrução: a falha vem do Postgres real (AD-012), sem dublê do gravador.
- Nas provas da S6 as linhas são inseridas por SQL, com `created_at` escolhido pelo teste; `INSERT`
  é a única escrita que a door 2 deixa passar.
- As provas de `apps/web` controlam a API pelo `FakeApi`, que passa a registrar também a query
  string e os cabeçalhos de cada requisição recebida.

### S1 - Gestão de usuários deixa rastro, na mesma transação · ~9 files · ~26 KB · ~7k

**C1** - `POST /api/users` que responde `201` grava exatamente uma linha com `action` igual a `user.created`, `user_id` igual ao id do Administrador autor, `entity` igual a `user` e `entity_id` igual ao `id` do corpo da resposta (AC 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-users.test.ts -t "create_user_writes_one_user_created_row"`

**C2** - `PATCH /api/users/:id` que responde `200` mudando só `name`, só `role` e só `active` grava, em cada um dos três casos, exatamente uma linha com `action` igual a `user.updated`, `user_id` do autor e `entity_id` igual a `:id` (AC 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-users.test.ts -t "patch_writes_one_user_updated_row_per_field"`

**C3** - `PATCH /api/users/:id` com `name`, `role` e `active` iguais aos valores atuais responde `200` e a contagem de linhas não muda (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-users.test.ts -t "patch_without_change_writes_no_row"`

**C4** - `PUT /api/users/:id/password` que responde `204` grava exatamente uma linha com `action` igual a `user.password_reset`, `user_id` do autor, `entity_id` igual a `:id` e `diff` nulo (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-users.test.ts -t "password_reset_writes_one_row_with_null_diff"`

**C5** - `DELETE /api/users/:id/two-factor` que responde `204` grava exatamente uma linha com `action` igual a `user.two_factor_reset`, `user_id` do autor, `entity_id` igual a `:id` e `diff` nulo (AC 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-users.test.ts -t "two_factor_reset_writes_one_row_with_null_diff"`

**C6** - Uma requisição a `/api/users*` que termina em `401` (sem sessão), `403` (perfil `reception`), `404` (`uuid` sem usuário), `409` (`email_taken` e `last_admin`) e `422` (`role` igual a `owner`) deixa, nos seis casos, a contagem de linhas igual à de antes (AC 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-users.test.ts -t "rejected_users_requests_write_no_row"`

**C7** - Com o insert em `audit_logs` falhando, cada uma das cinco rotas `POST /api/users`, `PATCH /api/users/:id`, `PUT /api/users/:id/password`, `DELETE /api/users/:id/two-factor` e `PUT /api/auth/password` responde `500` com `code` igual a `internal_error`, e o conteúdo de `users`, `accounts`, `sessions` e `two_factors` é idêntico ao de antes da requisição (AC 7, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-users.test.ts -t "audit_insert_failure_rolls_back_five_routes"`

**C8** - `pnpm users:create-admin` que sai com código 0 grava exatamente uma linha com `action` igual a `user.created`, `entity_id` igual ao id impresso, e `user_id`, `ip` e `user_agent` nulos (AC 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/create-admin.test.ts -t "create_admin_writes_user_created_row_without_actor"`

**C9** - Com o insert em `audit_logs` falhando, `pnpm users:create-admin` sai com código 1 e a contagem de linhas de `users` e de `accounts` não muda (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/create-admin.test.ts -t "create_admin_exits_1_when_audit_insert_fails"`

### S2 - O diff diz o que mudou sem guardar dado pessoal · ~2 files · ~10 KB · ~3k

**C10** - `PATCH /api/users/:id` que muda `name` e muda `role` de `reception` para `admin` grava `diff` igual a `{"fields":["name","role"],"values":{"role":{"from":"reception","to":"admin"}}}` (AC 10, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-diff.test.ts -t "diff_names_every_field_and_values_only_role"`

**C11** - `PATCH /api/users/:id` que muda `active` de `true` para `false` grava `diff` igual a `{"fields":["active"],"values":{"active":{"from":true,"to":false}}}` (AC 11, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-diff.test.ts -t "diff_of_deactivation"`

**C12** - `POST /api/users` que cria um usuário de perfil `reception` grava `diff` igual a `{"fields":["name","email","role"],"values":{"role":{"from":null,"to":"reception"}}}` (AC 12, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-diff.test.ts -t "diff_of_creation_has_null_from"`

**C13** - Percorridas as dez ações do vocabulário, mais um login recusado com e-mail que não pertence a usuário nenhum, o texto de todas as colunas de todas as linhas de `audit_logs` não contém nenhum dos nove valores: a senha, o hash da senha, o segredo TOTP, o código TOTP, o código de recuperação, o valor do cookie de sessão, o nome de usuário (o anterior e o novo de um usuário renomeado), o e-mail de usuário e o e-mail digitado no login (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-diff.test.ts -t "nine_values_never_reach_audit_logs"`

### S3 - Entrada, saída, senha e 2FA deixam rastro · ~3 files · ~26 KB · ~7k

**C14** - `POST /api/auth/login` que responde `200` com `status` igual a `authenticated` grava exatamente uma linha com `action` igual a `auth.login_succeeded` e `user_id` e `entity_id` iguais ao id do usuário (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "login_authenticated_writes_one_succeeded_row"`

**C15** - `POST /api/auth/login` que responde `200` com `status` igual a `two_factor_required` não muda a contagem de linhas (AC 15)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "two_factor_required_writes_no_row"`

**C16** - `POST /api/auth/two-factor/verify` que responde `200`, por código TOTP e por código de recuperação, grava em cada um dos dois casos exatamente uma linha com `action` igual a `auth.login_succeeded` e `user_id` e `entity_id` iguais ao id do usuário (AC 16)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "verify_200_writes_one_succeeded_row"`

**C17** - `POST /api/auth/login` que responde `401` para o e-mail de um usuário ativo com a senha errada e para o e-mail de um usuário inativo grava, em cada um dos dois casos, exatamente uma linha com `action` igual a `auth.login_failed` e `user_id` e `entity_id` iguais ao id daquele usuário (AC 17)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "login_401_of_known_email_writes_failed_row_with_user"`

**C18** - `POST /api/auth/login` que responde `401` para um e-mail que não pertence a usuário nenhum grava exatamente uma linha com `action` igual a `auth.login_failed` e `user_id`, `entity_id` e `diff` nulos (AC 18)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "login_401_of_unknown_email_writes_failed_row_without_user"`

**C19** - Havendo um login pendente, `POST /api/auth/two-factor/verify` que responde `401` grava exatamente uma linha com `action` igual a `auth.login_failed` e `user_id` igual ao id do usuário do login pendente (AC 19)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "verify_401_with_pending_login_writes_failed_row"`

**C20** - Sem login pendente, `POST /api/auth/two-factor/verify` que responde `401` não muda a contagem de linhas (AC 20)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "verify_401_without_pending_login_writes_no_row"`

**C21** - `POST /api/auth/login` que responde `429` e `POST /api/auth/two-factor/verify` que responde `429` não mudam, nos dois casos, a contagem de linhas (AC 21)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "blocked_attempts_write_no_row"`

**C22** - 10 logins com senha errada para o mesmo e-mail, disparados ao mesmo tempo: o número de linhas `auth.login_failed` gravadas é igual ao número de respostas `401`, e as respostas `401` e `429` somam 10 (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "ten_concurrent_failures_write_one_row_per_401"`

**C23** - `POST /api/auth/logout` que responde `204` grava exatamente uma linha com `action` igual a `auth.logout` e `user_id` igual ao id de quem saiu (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "logout_writes_one_row"`

**C24** - `PUT /api/auth/password` que responde `204` grava exatamente uma linha com `action` igual a `auth.password_changed`, `user_id` e `entity_id` iguais ao id do próprio usuário e `diff` nulo (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "own_password_change_writes_one_row"`

**C25** - `POST /api/auth/two-factor/confirm` que responde `204` grava exatamente uma linha com `action` igual a `auth.two_factor_enabled` e `user_id` e `entity_id` iguais ao id do próprio usuário (AC 25)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "confirm_writes_one_two_factor_enabled_row"`

**C26** - `POST /api/auth/two-factor/disable` que responde `204` grava exatamente uma linha com `action` igual a `auth.two_factor_disabled` e `user_id` e `entity_id` iguais ao id do próprio usuário (AC 26)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "disable_writes_one_two_factor_disabled_row"`

**C27** - A contagem de linhas não muda em cinco casos: `PUT /api/auth/password` com a senha atual errada (`422`), `two-factor/enable` com senha errada (`422`), `two-factor/confirm` com código inválido (`422`), `two-factor/disable` com senha errada (`422`) e `two-factor/enable` com a senha certa (`200`) (AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "four_422_and_enable_200_write_no_row"`

**C28** - Com o insert em `audit_logs` falhando, `POST /api/auth/login` com e-mail e senha certos de um usuário sem 2FA responde `500` e a resposta não traz `Set-Cookie` de sessão (AC 28)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "login_500_without_cookie_when_audit_insert_fails"`

**C29** - Percorridas as dez ações, o conjunto de valores distintos de `action` em `audit_logs` é igual ao conjunto de valores do enum de ações de `packages/contracts`, que tem exatamente dez, e toda linha tem `entity` igual a `user` (door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "ten_actions_written_equal_contract_vocabulary"`

### S4 - Cada linha diz de onde e quando · ~6 files · ~14 KB · ~4k

**C30** - Uma ação auditada que chega à API com `X-Forwarded-For: 203.0.113.7` grava `ip` igual a `203.0.113.7` (AC 29, door 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-origin.test.ts -t "ip_comes_from_forwarded_for"`

**C31** - Uma ação auditada que chega à API com `X-Forwarded-For: 198.51.100.1, 203.0.113.7` grava `ip` igual a `203.0.113.7` (AC 30, door 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-origin.test.ts -t "ip_is_the_rightmost_forwarded_address"`

**C32** - Uma ação auditada com `User-Agent` de 20, de 512 e de 513 caracteres grava em `user_agent`, respectivamente, os 20, os 512 e os primeiros 512 caracteres do cabeçalho (AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-origin.test.ts -t "user_agent_is_cut_at_512_characters"`

**C33** - Uma ação auditada que chega sem o cabeçalho `User-Agent` grava `user_agent` nulo (AC 32)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-origin.test.ts -t "missing_user_agent_is_null"`

**C34** - Numa ação auditada cuja requisição leva o cabeçalho `Date` de `2000-01-01` e, no corpo, `createdAt` igual a `2000-01-01T00:00:00Z`, o `created_at` gravado fica entre o `now()` do banco lido antes e o lido depois da requisição (AC 33)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-origin.test.ts -t "created_at_comes_from_the_database_clock"`

**C35** - Abrir `/users` no web com `User-Agent: teste/1.0` e `X-Forwarded-For: 203.0.113.7` faz as chamadas do servidor do web a `GET /api/auth/session` e a `GET /api/users` chegarem à API com esses mesmos dois cabeçalhos (AC 34)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "server_render_forwards_client_ip_and_user_agent"`

**C36** - Na stack de pé, `POST /api/auth/login` feito na origem do container `web` com `User-Agent: teste/1.0` e `X-Forwarded-For: 203.0.113.7` grava no banco da stack uma linha `auth.login_succeeded` com `user_agent` igual a `teste/1.0` e `ip` igual a `203.0.113.7` (door 6, door 1, Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "login_through_web_writes_audit_row_with_ip_and_user_agent"`

### S5 - A trilha não se altera nem se apaga · ~6 files · ~30 KB · ~8k

**C37** - Para cada uma das nove colunas de `audit_logs`, um `UPDATE` que muda aquela coluna falha com a mensagem `audit_logs is append-only` e a linha lida depois é idêntica à de antes (AC 35, door 2)
Proof: `pnpm --filter "./packages/database" exec vitest run test/audit.test.ts -t "update_fails_on_each_of_nine_columns"`

**C38** - Um `DELETE` em `audit_logs` falha com a mensagem `audit_logs is append-only` e a linha continua lá (AC 36, door 2)
Proof: `pnpm --filter "./packages/database" exec vitest run test/audit.test.ts -t "delete_fails_and_keeps_the_row"`

**C39** - `TRUNCATE audit_logs` falha e a contagem de linhas é a de antes (AC 37, door 2)
Proof: `pnpm --filter "./packages/database" exec vitest run test/audit.test.ts -t "truncate_fails_and_keeps_every_row"`

**C40** - Um `DELETE` em `users` que atinge o autor de uma linha de `audit_logs` falha por violação de chave estrangeira, e o usuário e a linha continuam lá (AC 38, door 1)
Proof: `pnpm --filter "./packages/database" exec vitest run test/audit.test.ts -t "author_of_a_row_cannot_be_deleted"`

**C41** - Entre as rotas registradas no roteador da aplicação em execução, as de caminho `/api/audit-logs` ou começado por `/api/audit-logs/` são exatamente uma: `GET /api/audit-logs` (AC 39)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-logs.test.ts -t "only_get_is_registered_under_audit_logs"`

**C42** - Depois de `pnpm db:migrate` num banco vazio, `audit_logs` tem exatamente as nove colunas `id`, `user_id`, `action`, `entity`, `entity_id`, `ip`, `user_agent`, `diff` e `created_at`, e um índice sobre `(created_at, user_id)`, nessa ordem (door 1)
Proof: `pnpm --filter "./packages/database" exec vitest run test/audit.test.ts -t "audit_logs_has_nine_columns_and_the_index"`

**C43** - Em `audit_logs`: uma linha inserida sem `id` e sem `created_at` recebe do banco um `uuid` de versão 7 e o instante do insert; uma linha com `user_id` nulo e `entity_id` igual a um `uuid` que não existe em tabela nenhuma é aceita; uma linha com `user_id` igual a um `uuid` que não existe em `users` falha por violação de chave estrangeira (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/audit.test.ts -t "defaults_optional_author_and_unbound_entity_id"`

### S6 - O Administrador consulta por API · ~8 files · ~38 KB · ~10k

**C44** - Com 60 linhas gravadas, `GET /api/audit-logs` sem parâmetros, feito por um administrador, responde `200` com exatamente 50 itens em `items`, do `createdAt` mais recente para o mais antigo, cada item com exatamente as nove chaves `id`, `createdAt`, `user`, `action`, `entity`, `entityId`, `ip`, `userAgent` e `diff` (AC 40)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-logs.test.ts -t "list_200_fifty_newest_first_with_nine_keys"`

**C45** - Em `items`, `user` é `null` na linha sem autor e, na linha com autor, tem exatamente `id` e `name`; depois de o autor ser renomeado, a mesma linha traz o nome novo (AC 41)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-logs.test.ts -t "user_is_current_name_or_null"`

**C46** - Com 120 linhas, das quais 60 com o mesmo `created_at`, seguir `nextCursor` desde a primeira página até ele vir `null` devolve 120 ids distintos, na mesma ordem de uma leitura única do banco por `created_at` e `id` decrescentes (AC 42)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-logs.test.ts -t "cursor_walks_every_row_once_even_with_equal_instants"`

**C47** - `nextCursor` é `null` com exatamente 50 linhas gravadas e não nulo com 51 (AC 42, AC 43)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-logs.test.ts -t "next_cursor_null_at_50_and_set_at_51"`

**C48** - Com 60 linhas, lida a primeira página e gravadas depois mais 5 linhas, a chamada com o `cursor` recebido devolve os mesmos 10 ids, na mesma ordem, que devolveria sem as 5 novas (AC 44)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-logs.test.ts -t "rows_written_between_pages_do_not_shift_the_next_page"`

**C49** - Cada um dos cinco filtros `userId`, `action`, `entity`, `entityId` e `ip`, usado sozinho, devolve só as linhas cujo campo é igual ao valor informado; `userId` e `action` usados juntos devolvem só as linhas que atendem aos dois (AC 45)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-logs.test.ts -t "five_equality_filters_alone_and_combined"`

**C50** - Com linhas gravadas exatamente em `from`, 1 ms antes de `from`, 1 ms antes de `to` e exatamente em `to`: só `from` devolve as três últimas, só `to` devolve as três primeiras, e os dois juntos devolvem a de `from` e a de 1 ms antes de `to` (AC 46)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-logs.test.ts -t "period_includes_from_and_excludes_to"`

**C51** - `GET /api/audit-logs` responde `422` com `code` igual a `validation_failed` e um item em `errors` cujo `path` é o nome do parâmetro em sete casos: `userId` igual a `abc`, `entityId` igual a `abc`, `action` igual a `user.deleted`, `from` igual a `2026-10-04T10:00:00` (sem fuso), `to` igual a `ontem`, `ip` de 46 caracteres e `cursor` igual a `xyz`; `ip` de 45 caracteres responde `200` (AC 47, door 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-logs.test.ts -t "seven_invalid_query_parameters_422_on_path"`

**C52** - `GET /api/audit-logs` com sessão de `reception`, de `hr_finance` e de `instructor` responde, nos três casos, `403` com `code` igual a `forbidden` (AC 48)
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "non_admin_403_on_audit_logs"`

**C53** - `GET /api/audit-logs` sem cookie responde `401` com `code` igual a `unauthorized`: a rota está entre as registradas que a prova percorre, e não entre as três abertas (AC 49)
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "only_three_routes_answer_without_session"`

**C54** - `GET /api/audit-logs` que responde `200` não muda a contagem de linhas de `audit_logs` (AC 50)
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-logs.test.ts -t "reading_the_trail_writes_no_row"`

**C55** - No documento de `GET /api/openapi.json`, a operação `get` de `/api/audit-logs` tem em `parameters` exatamente oito itens com `in` igual a `query` - `from`, `to`, `userId`, `action`, `entity`, `entityId`, `ip` e `cursor` - nenhum com `required` igual a `true`, cada um com o `schema` igual ao da propriedade de mesmo nome em `z.toJSONSchema` do schema de query de `packages/contracts` (door 7, AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "audit_logs_query_parameters_come_from_contract_schema"`

**C56** - O corpo `200` real de `GET /api/audit-logs`, com uma linha de autor e `diff` preenchidos e uma linha sem autor e de `diff` nulo, valida contra o schema de resposta da rota em `packages/contracts` (AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_logs_body_matches_contract_schema"`

### S7 - Tela de auditoria · ~10 files · ~42 KB · ~11k

**C57** - Em `/`, o link "Auditoria" aparece para `admin` e não aparece para `reception`, `hr_finance` e `instructor` (AC 51)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "audit_link_only_for_admin"`

**C58** - Sem sessão, abrir `/audit` termina na URL `/login` (AC 52)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "anonymous_audit_redirects_to_login"`

**C59** - `/audit` aberta com sessão de `reception`, de `hr_finance` e de `instructor` exibe, nos três casos, "Você não tem permissão para acessar esta página." e a página não contém o `ip` nem o `userAgent` de nenhuma linha que a API devolveria (AC 53)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "non_admin_sees_no_permission_and_no_trail"`

**C60** - `/audit` aberta por um administrador exibe o título "Auditoria" e uma tabela com as colunas "Data e hora", "Usuário", "Ação", "Alvo", "IP", "Navegador" e "Detalhes", nesta ordem, com as linhas na ordem em que a API as devolveu (AC 54)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "audit_table_title_seven_columns_and_order"`

**C61** - Em "Data e hora", `createdAt` igual a `2026-10-04T15:04:05.000Z` aparece como `04/10/2026 12:04:05`, e igual a `2026-10-05T02:30:00.000Z` aparece como `04/10/2026 23:30:00` (AC 55)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "instants_shown_in_sao_paulo_time"`

**C62** - A coluna "Ação" exibe, para as dez ações na ordem da door 3, "Login", "Falha de login", "Logout", "Troca da própria senha", "2FA ativado", "2FA desativado", "Usuário criado", "Usuário editado", "Senha redefinida" e "2FA zerado" (AC 56)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "ten_actions_shown_by_label"`

**C63** - Uma linha com `user` igual a `null` exibe "—" na coluna "Usuário" (AC 57)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "row_without_author_shows_dash"`

**C64** - Uma linha com `entity` igual a `user` e `entityId` igual ao id de um usuário que `GET /api/users` devolve com `name` igual a "Pessoa 2" exibe "Pessoa 2" na coluna "Alvo" (AC 58)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "target_shows_current_user_name"`

**C65** - Uma linha com `diff` igual a `{"fields":["name","role"],"values":{"role":{"from":"reception","to":"admin"}}}` exibe em "Detalhes" o texto "Perfil: Recepção → Administrador" e o texto "Nome alterado" (AC 59)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "details_show_role_change_and_changed_name"`

**C66** - `/audit` exibe, acima da tabela, os cinco filtros "De", "Até", "Usuário", "Ação" e "IP" e os dois botões "Filtrar" e "Limpar filtros" (AC 60)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "five_filters_and_two_buttons_above_the_table"`

**C67** - Preenchidos "De" com 01/10/2026, "Até" com 04/10/2026, um usuário, a ação "Falha de login" e o IP `203.0.113.7`, acionar "Filtrar" leva os cinco para a query string de `/audit`, e a chamada que chega à API em `GET /api/audit-logs` tem `from` no instante `2026-10-01T03:00:00.000Z`, `to` no instante `2026-10-05T03:00:00.000Z`, `userId` igual ao id daquele usuário, `action` igual a `auth.login_failed` e `ip` igual a `203.0.113.7`; a tabela exibe só as linhas que a API devolveu a essa chamada (AC 61)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "filter_puts_filters_in_url_and_day_bounds_in_sao_paulo"`

**C68** - Com a API devolvendo `nextCursor` não nulo a uma consulta filtrada por `action`, `/audit` exibe o link "Próxima página"; acioná-lo faz chegar à API uma chamada com `cursor` igual àquele valor e o mesmo `action`, e a tabela passa a exibir as linhas dessa segunda resposta (AC 62)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "next_page_link_keeps_filters_and_sends_cursor"`

**C69** - Com a API devolvendo `items` vazio, `/audit` exibe "Nenhum registro encontrado." e nenhuma tabela (AC 63)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "empty_trail_shows_message_instead_of_table"`

**C70** - Com `GET /api/audit-logs` respondendo `500`, `/audit` exibe "Não foi possível carregar a auditoria." e o botão "Tentar novamente", que ao ser acionado com a API de volta exibe a tabela (AC 64)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "load_failure_shows_retry"`

**C71** - Com a API respondendo `422` e um item em `errors`, a `message` aparece junto do filtro indicado em `path` para cada um dos cinco pares: `from` em "De", `to` em "Até", `userId` em "Usuário", `action` em "Ação" e `ip` em "IP" (AC 65)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "query_errors_shown_on_five_filters"`

**C72** - Uma linha com `entityId` igual a `null` exibe "—" na coluna "Alvo" (AC 66)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "row_without_target_shows_dash"`

**C73** - Em `/audit` aberta com os filtros `action` e `ip` na query string, acionar "Limpar filtros" termina na URL `/audit` sem query string, e a chamada seguinte que chega à API em `GET /api/audit-logs` não tem query string (AC 67)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "clear_filters_goes_to_audit_without_query"`

## Coverage

Uma linha para a rota da `Surface`, com os status como membros; depois as doors, a entidade de
`Relations` e os conjuntos enumerados nos critérios.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/audit-logs` statuses (4) | 200 C44 · 401 C53 · 403 C52 · 422 C51 | - |
| one-way doors (7) | door 1 C42 · door 2 C37 · door 3 C29 · door 4 C10 · door 5 C7 · door 6 C31 · door 7 C51 | - |
| entidades de `Relations` (1) | `audit_logs` C42 | - |
| one-way constraints de `Relations` (6) | sem `UPDATE` C37 · sem `DELETE` C38 · sem `TRUNCATE` C39 · autor opcional C43 · autor impede apagar o usuário C40 · `uuid` gerado pelo banco C43 | - |
| colunas de `audit_logs` sob `UPDATE` (9) | C37, table-driven over all 9 | - |
| vocabulário de `action`, quem grava cada uma (10) | `auth.login_succeeded` C14 · `auth.login_failed` C17 · `auth.logout` C23 · `auth.password_changed` C24 · `auth.two_factor_enabled` C25 · `auth.two_factor_disabled` C26 · `user.created` C1 · `user.updated` C2 · `user.password_reset` C4 · `user.two_factor_reset` C5 | - |
| vocabulário igual ao enum do contrato (10) | C29, table-driven over all 10 | - |
| campos do `PATCH` que gravam linha (3) | C2, table-driven over all 3: `name`, `role`, `active` | - |
| status de `/api/users*` que não gravam (5) | 401 C6 · 403 C6 · 404 C6 · 409 C6 · 422 C6 | - |
| rotas que desfazem a ação quando o insert falha (5) | C7, table-driven over all 5 | - |
| `pnpm users:create-admin` com auditoria (2) | grava linha sem autor C8 · insert falha, código 1 C9 | - |
| formas do `diff` (4) | campo registrável e campo só nomeado C10 · booleano C11 · criação com `from` nulo C12 · nulo em ação sem campo C4 | - |
| valores fora de `audit_logs` (9) | C13, table-driven over all 9 | - |
| login autenticado, caminhos (3) | sem 2FA C14 · TOTP C16 · código de recuperação C16 | - |
| `auth.login_failed`, causas (4) | senha errada de usuário ativo C17 · usuário inativo C17 · e-mail desconhecido C18 · código inválido com login pendente C19 | - |
| desfechos de autenticação que não gravam (9) | `two_factor_required` C15 · `401` sem login pendente C20 · `429` no login C21 · `429` no segundo passo C21 · `422` em `PUT /api/auth/password` C27 · `422` em `enable` C27 · `422` em `confirm` C27 · `422` em `disable` C27 · `200` em `enable` C27 | - |
| `X-Forwarded-For` (2) | um endereço C30 · dois endereços C31 | - |
| `User-Agent` (4 edges) | ausente C33 · 20 C32 · 512 C32 · 513 C32 | - |
| operações recusadas pelo banco (4) | `UPDATE` C37 · `DELETE` C38 · `TRUNCATE` C39 · `DELETE` do autor em `users` C40 | - |
| chaves de cada item (9) | C44, table-driven over all 9 | - |
| tamanho da página (3 edges) | 50 linhas, `nextCursor` nulo C47 · 51 linhas, não nulo C47 · 60 linhas, 50 itens C44 | - |
| filtros de igualdade (5) | C49, table-driven over all 5: `userId`, `action`, `entity`, `entityId`, `ip` | - |
| período (3) | só `from` C50 · só `to` C50 · os dois C50 | - |
| bordas do período (4 edges) | em `from` C50 · 1 ms antes de `from` C50 · 1 ms antes de `to` C50 · em `to` C50 | - |
| parâmetros de query (8) | `from` C50 · `to` C50 · `userId` C49 · `action` C49 · `entity` C49 · `entityId` C49 · `ip` C49 · `cursor` C46 | - |
| parâmetro inválido (7) | C51, table-driven over all 7 | - |
| `ip` (2 edges) | 45 C51 · 46 C51 | - |
| perfis sem acesso à rota (3) | C52, table-driven over all 3 | - |
| link "Auditoria" por perfil (4) | C57, table-driven over all 4 | - |
| perfis sem acesso à tela (3) | C59, table-driven over all 3 | - |
| colunas de `/audit` (7) | "Data e hora" C60 · "Usuário" C60 · "Ação" C60 · "Alvo" C60 · "IP" C60 · "Navegador" C60 · "Detalhes" C60 | - |
| rótulo de cada `action` (10) | C62, table-driven over all 10 | - |
| coluna "Alvo" (2) | nome atual do usuário C64 · "—" sem `entityId` C72 | - |
| filtros e botões (7) | "De" C66 · "Até" C66 · "Usuário" C66 · "Ação" C66 · "IP" C66 · "Filtrar" C66 · "Limpar filtros" C66 | - |
| filtro da tela -> parâmetro da API (5) | "De" C67 · "Até" C67 · "Usuário" C67 · "Ação" C67 · "IP" C67 | - |
| `path` do `422` -> filtro (5) | C71, table-driven over all 5 | - |
| estados de `/audit` em `Observable` (5) | vazio C69 · erro de carga C70 · erro de filtro C71 · sem sessão C58 · sem permissão C59 | - |
| startup config: `trust proxy` (2 assemblies) | harness de teste C31 · processo real na stack C36 | - |
| startup config: migração `0002` aplicada (3 assemblies) | banco migrado em `packages/database` C42 · harness de `apps/api` C1 · stack do compose C36 | - |
| startup config: repasse de IP e user-agent pelo web (2 assemblies) | servidor do Playwright C35 · container `web` C36 | - |

- Claims naming a status code, route or response shape: C1 a C7, C14 a C28, C30 a C34, C41 e C44 a
  C56 cruzam a fronteira HTTP da API montada pelo `startApi`; C35 e C57 a C73 cruzam a fronteira do
  web no navegador; C36 cruza as duas no processo real
- `trust proxy` tem dois membros porque hoje há duas montagens; a resolução é a segunda da regra: a
  chamada entra em `configureApp`, que o processo real e o `startApi` já compartilham, e a C36 prova
  que a montagem real a recebeu
- C53 é provada por um teste que já existe e lê as rotas do roteador: a rota nova entra nele sem
  edição. Pela mesma leitura do roteador, três provas da `auth-rbac` passam a cobrir a rota nova sem
  check próprio aqui: `admin_without_2fa_gets_403_everywhere_else` (o `403` de cadastro obrigatório
  do 2FA), `paths_equal_registered_api_routes` (a rota no documento OpenAPI) e
  `hostile_input_never_answers_5xx`
- C46 acrescenta ao texto da AC 42 o caso de várias linhas com o mesmo `created_at`: "sem repetir
  nem pular nenhuma" não se sustenta sem ele, porque as linhas gravadas na mesma transação têm o
  mesmo `now()`. A ordem de desempate que a prova usa é `id` decrescente
- C67 fixa o que a AC 61 deixa em palavras: "fim daquele dia" vira `to` no início do dia seguinte
  (`2026-10-05T03:00:00.000Z`), porque a AC 46 trata `to` como exclusivo
- C36 manda o `X-Forwarded-For` de fora porque é o que a Open question 1 descreve: sem proxy na
  frente, o web mantém o que o cliente escreveu. A prova é sobre a montagem (`trust proxy`, migração,
  repasse), não sobre o IP ser confiável
- A consulta não tem prova na stack: o Administrador precisa de 2FA para ler a rota, e
  `tests/stack` não tem gerador de TOTP. A leitura é provada em duas metades (C44 a C56 na API
  montada, C60 a C73 no web) e nenhuma startup config dela difere das três linhas acima
- Revisão do usuário em 2026-10-04, registrada antes de qualquer código: AC 25 e AC 26 passam a fixar
  `user_id` e `entity_id` iguais ao id do próprio usuário, afirmados em C25 e C26; a AC 66 e a C72
  fixam "—" em "Alvo" quando `entityId` é nulo; a AC 67 e a C73 fixam que "Limpar filtros" leva a
  `/audit` sem query string
- `auth-rbac`: as provas `login_outcomes_log_one_line_each` e `six_secrets_never_reach_the_log`
  seguem valendo sem edição - as linhas de log não mudam (`Impact`). Os dois checks de lá sobre o comando seguem valendo
  (`creates_admin_exits_0_without_printing_password`, `rejects_six_invalid_invocations`); C8 e C9 daqui se somam a eles. `six_identity_tables_and_no_tenant_id` confere
  `tenant_id` em toda tabela do schema `public`, então passa a cobrir `audit_logs` (AD-016)
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md` seguem valendo e respondem as duas perguntas para tudo o
que esta feature toca, salvo um caso que lá não existia: restrição imposta por gatilho. No profile
`light` o Verifier não dá veredito por linha - elas valem como regra de escrita dos testes no Build.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide, alcançado por HTTP (o que grava e o que não grava linha, o `diff`, a origem do IP, filtros, cursor, validação da query) | uma prova na fronteira HTTP da API montada, com Postgres real, lendo `audit_logs` por SQL | um caso afirmado por linha da tabela de decisão; contagem antes e depois em todo caso que não grava |
| Decide, sem fronteira HTTP (gatilhos e restrições de `audit_logs`, comando `pnpm users:create-admin`) | uma prova no próprio nível: o banco migrado por `pnpm db:migrate`, o processo do comando | cada operação recusada uma vez, e o `UPDATE` em cada coluna; cada código de saída |
| Tela | Playwright contra a API controlada pelo teste | cada estado de `Observable` com landing em AC; cada texto literal da AC; a query e os cabeçalhos que chegam à API |
| Montagem do processo real | uma prova em `tests/stack` por conjunto de startup config | um caminho, pela origem do web |
| Instrumentação: o gravador que só insere o que recebe, o controller de consulta que só repassa a query validada, o mapa de rótulos | nenhuma própria | coberta pela prova de quem a consome |

Evidence (o código da feature ainda não existe; a contagem vem do plano e do código que ele altera):

- `apps/api/src/users/users.service.ts`: 5 métodos com transação passam a gravar; `update` ganha 1 ramo novo (mudou ou não mudou) e a montagem do `diff` sobre 3 campos, 2 deles registráveis (C2, C3, C10 a C12) -> decide
- `apps/api/src/auth/auth.controller.ts`: 7 handlers, 10 desfechos que gravam e 9 que não gravam (C14 a C28) -> decide
- consulta: 5 filtros de igualdade, 2 de período, 1 cursor, 7 recusas (C44 a C51) -> decide
- migração `0002`: 2 gatilhos, 1 chave estrangeira (C37 a C40) -> decide
- closest analogue in the repo: `apps/api/test/throttle.test.ts`, uma tabela de bordas e uma corrida provadas na fronteira HTTP contra a aplicação do `startApi`; e `packages/database/test/schema.test.ts`, restrições do banco provadas uma a uma sobre o banco migrado

Cost: 0 provas além das 73 acima - as linhas descrevem o nível em que elas já estão.

## Swept

- validation: C51, C55
- failure modes: C7, C9, C28, C70
- idempotency: C3 - a edição que não muda nada não grava; repetir uma ação é outro acontecimento e grava outra linha (`Observable`, duplicates)
- authorization: C52, C53, C57, C59; existing - o `403` de cadastro obrigatório do 2FA vem da guarda global, pela prova `admin_without_2fa_gets_403_everywhere_else`
- concurrency: C22, C46, C48
- data lifecycle: C37, C38, C39, C40 - nada é apagado; retenção e expurgo são da `privacidade` (Out of scope do plano)
- dependency failure: C7, C9 e C28 para o insert que falha; C70 para o web sem a API; banco fora na consulta cai no `500 internal_error` do `ProblemFilter` (prova `unhandled_500_hides_exception`, da `fundacao`)
- state transitions: n/a - `audit_logs` não tem estado: a linha nasce e não muda (C37); as transições de `twoFactorEnabled` e de sessão são da `auth-rbac`
- observability: C13, C29 - a trilha é o que esta feature torna observável; as linhas de log de login seguem na prova `login_outcomes_log_one_line_each` da `auth-rbac`

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado; o que já existe foi medido com `wc -c`. Código novo: S1 = 7k, S2 = 3k, S3 = 7k, S4 = 4k (inclui o caso novo em `tests/stack`), S5 = 8k (inclui o snapshot que o Drizzle gera, ~15 KB), S6 = 10k, tudo em `apps/api`, `packages/contracts` e `packages/database`: 39k. S7 entra em `apps/web` com 11k: 50k. Arquivos existentes que a feature edita ou lê para editar (23 arquivos, 75 KB, os maiores: `auth.controller.ts` 10 KB, `compose.test.ts` 6 KB, `contracts.test.ts` 6 KB, `users.service.ts` 6 KB, `access.ts` 5 KB): 19k. `plan.md` (33 KB) e este arquivo (39 KB): 18k. Total 50k + 19k + 18k = 87k, abaixo do orçamento de 150k - one builder
- Ordem: S5 primeiro (a tabela e os gatilhos, de que todo o resto depende), depois S1 a S4, S6, e S7 por último, onde a superfície muda de API para web. Antes de escrever a S3, conferir na documentação do Better Auth se `auth.api.*` aceita uma transação de fora (primeira linha de `Assumptions` do plano): se aceitar, os eventos dele ficam atômicos sem mudar check nenhum. Se a medição real passar do orçamento durante o Build, o corte já escrito é antes da S7, com 39k + 19k + 18k = 76k até ali
- **Boundary:** C37 a C40, C42 e C43 fechados no commit `feat(database): add the append-only audit_logs table`. A C41, da mesma slice, depende da rota e fecha com a S6
- **Boundary:** C1 a C29 fechados no commit `feat(api): record audit rows for user management and authentication`: o gravador (door 5), o vocabulário (door 3) e o `diff` (door 4)
- **Boundary:** C30 a C34 fechados no commit `feat(api): take the audit ip from the forwarded address` (door 6)
- **Boundary:** C35 e C36 fechados no commit `feat(web): forward the client ip and user agent to the api`
- **Boundary:** C41 e C44 a C56 fechados no commit `feat(api): add the audit log query route` (door 7)
- **Boundary:** C57 a C73 fechados no commit `feat(web): add the audit screen`. Um builder só, sem corte: a ordem foi S5, S1 a S4, S6 e S7. `pnpm verify` verde no último commit
- **Settled mid-build:** nada - o usuário não foi consultado durante o Build. Conferido antes da S3: a documentação do Better Auth (`concepts/database`, `reference/options`) não descreve como entregar uma transação de fora a `auth.api.*`; o pacote instalado (1.7.7) tem um `runWithTransaction` interno, sobre o adaptador dele e marcado como de uso interno, que não recebe a transação do Drizzle de quem chama. Vale o padrão da primeira linha de `Assumptions`: a linha dessas ações é gravada logo depois do desfecho, fora de transação. Escolhas reversíveis feitas no caminho, para a revisão do diff: o cursor é o id da última linha da página, e um `uuid` que não é de linha nenhuma responde `422` em `cursor`; `entity` aceita de 1 a 64 caracteres; `PATCH` que não muda nada não toca em `users` (nem em `updated_at`); `two-factor/confirm` grava `auth.two_factor_enabled` a cada `204`, também quando o 2FA já estava ativo; no login e no segundo passo a linha é gravada antes de o cookie ser repassado, e no logout, no `confirm` e no `disable`, depois; a tela pede também `GET /api/users` (nomes do "Alvo" e opções do filtro "Usuário") e, se ele falha, mostra o erro de carga; "Alvo" de um `entityId` que não está na lista de usuários exibe o próprio id; em `user.created` "Detalhes" mostra só o valor de nascimento ("Perfil: Recepção"); um `422` que não aponta nenhum dos cinco filtros (o `cursor`) cai no erro de carga; o início do dia usa o deslocamento fixo `-03:00`
- **Abandoned:** a prova `next_cursor_null_at_50_and_set_at_51` subindo o próprio Postgres dentro do teste - estourava os 30 s quando o `pnpm verify` rodava a suíte do web ao lado; o segundo banco passou a subir no `beforeAll`. A lista de rotas bloqueadas em `admin_without_2fa_gets_403_everywhere_else` (`auth-rbac`) é escrita no teste, não só lida do roteador: ganhou `GET /api/audit-logs`, ao contrário do "sem edição" que a nota de `Coverage` previa. Num `pnpm verify`, `every_password_accepted_on_write_logs_in` (`auth-rbac`) falhou uma vez com `ECONNRESET` e passou nas três repetições isoladas e na rodada seguinte do portão: o teste bloqueia o processo com `spawnSync` enquanto a API em processo mantém conexões abertas; fica registrado, sem mudança
