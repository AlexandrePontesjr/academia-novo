# Auditoria verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 1b7a662..cf337723c5bfd9a3b1de7237629eabd4c629aca6
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Escopo: os 73 checks de `checks.md` (C1 a C73), sem amostragem, todos rodados por este Verifier em
`HEAD` = `cf33772`, com a árvore limpa salvo `CLAUDE.md` (não rastreado, do usuário). Nenhum arquivo
além deste relatório foi escrito.

## Binding sources

O plano não marca nenhuma fonte como binding, e o profile é `light`: o passo 1 do `verify.md` não se
aplica. Nada a comparar.

## Proof runs

Uma invocação por alvo. Cada teste nomeado em `checks.md` foi localizado na árvore e aparece
individualmente como aprovado na saída do runner (reporter `verbose` no vitest, `list` no Playwright).

- `packages/database`: `pnpm --filter "./packages/database" exec vitest run test/audit.test.ts --reporter=verbose` - exit 0, 6 passed, 0 failed
- `apps/api`: `pnpm --filter "./apps/api" exec vitest run test/audit-users.test.ts test/audit-diff.test.ts test/audit-auth.test.ts test/audit-origin.test.ts test/audit-logs.test.ts test/create-admin.test.ts test/access.test.ts test/openapi.test.ts test/contracts.test.ts --reporter=verbose` - exit 0, 9 arquivos, 59 passed, 0 failed
- `apps/web`: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts e2e/shell.spec.ts --reporter=list` - exit 0, 22 passed, 0 failed
- `tests/stack`: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "login_through_web_writes_audit_row_with_ip_and_user_agent" --reporter=verbose` - exit 0, 1 passed, 7 skipped pelo filtro, 0 failed (130,9 s)

Nenhuma prova falhou, então não houve segunda execução isolada. Na coluna `Proof run` abaixo, o alvo
é abreviado por `db`, `api`, `web` e `stack`, e o resultado é o da linha daquele teste na saída.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `POST /api/users` 201 grava uma linha `user.created` com autor, `entity` e `entity_id` | api `create_user_writes_one_user_created_row` ✓ | `apps/api/test/audit-users.test.ts:33` - `expect(rows).toHaveLength(1)`; `apps/api/test/audit-users.test.ts:34` - `expect(rows[0]).toMatchObject({ action: 'user.created', user_id: author.id, entity: 'user', entity_id: created.id })` | PASS |
| C2 | `PATCH` 200 mudando só `name`, só `role`, só `active` grava uma linha `user.updated` em cada caso | api `patch_writes_one_user_updated_row_per_field` ✓ | `apps/api/test/audit-users.test.ts:45` - `expect(changes).toHaveLength(3)`; `:51` - `expect(rows, ...).toHaveLength(1)`; `:52` - `expect(rows[0], ...).toMatchObject({ action: 'user.updated', user_id: author.id, entity_id: target.id })` | PASS |
| C3 | `PATCH` com valores iguais responde 200 sem linha | api `patch_without_change_writes_no_row` ✓ | `apps/api/test/audit-users.test.ts:66` - `expect(response.status).toBe(200)`; `:67` - `expect(await auditCount(stack)).toBe(before)` | PASS |
| C4 | `PUT /api/users/:id/password` 204 grava uma linha `user.password_reset` com `diff` nulo | api `password_reset_writes_one_row_with_null_diff` ✓ | `apps/api/test/audit-users.test.ts:78` - `expect(rows).toHaveLength(1)`; `:79` - `expect(rows[0]).toMatchObject({ action: 'user.password_reset', user_id: author.id, entity_id: target.id, diff: null })` | PASS |
| C5 | `DELETE /api/users/:id/two-factor` 204 grava uma linha `user.two_factor_reset` com `diff` nulo | api `two_factor_reset_writes_one_row_with_null_diff` ✓ | `apps/api/test/audit-users.test.ts:94` - `expect(rows).toHaveLength(1)`; `:95` - `expect(rows[0]).toMatchObject({ action: 'user.two_factor_reset', user_id: author.id, entity_id: target.id, diff: null })` | PASS |
| C6 | seis recusas (401, 403, 404, 409 x2, 422) não gravam linha | api `rejected_users_requests_write_no_row` ✓ | `apps/api/test/audit-users.test.ts:117` - `expect(cases).toHaveLength(6)`; `:124` - `expect(response.status, name).toBe(status)`; `:126` - `expect(await auditCount(stack), name).toBe(before)` | PASS |
| C7 | insert falhando: cinco rotas respondem 500 `internal_error` e quatro tabelas ficam idênticas | api `audit_insert_failure_rolls_back_five_routes` ✓ | `apps/api/test/audit-users.test.ts:150` - `expect(routes).toHaveLength(5)`; `:164` - `expect(response.status, name).toBe(500)`; `:165` - `expect((await problem(response)).code, name).toBe('internal_error')`; `:166` - `expect(await snapshot(), name).toEqual(before)` | PASS |
| C8 | `users:create-admin` com saída 0 grava `user.created` sem autor, IP nem user-agent | api `create_admin_writes_user_created_row_without_actor` ✓ | `apps/api/test/create-admin.test.ts:53` - `expect(result.status, result.output).toBe(0)`; `:57` - `expect(result.output).toContain(created!.id)`; `:59` - `expect(rows[0]).toMatchObject({ action: 'user.created', entity_id: created!.id, user_id: null, ip: null, user_agent: null })` | PASS |
| C9 | insert falhando: o comando sai com 1 e `users` e `accounts` não mudam | api `create_admin_exits_1_when_audit_insert_fails` ✓ | `apps/api/test/create-admin.test.ts:77` - `expect(result.status, result.output).toBe(1)`; `:78` - `expect(await counts()).toEqual(before)` | PASS |
| C10 | `diff` de `name` + `role` reception -> admin | api `diff_names_every_field_and_values_only_role` ✓ | `apps/api/test/audit-diff.test.ts:27` - `expect(rows[0]!.diff).toStrictEqual({ fields: ['name', 'role'], values: { role: { from: 'reception', to: 'admin' } } })` | PASS |
| C11 | `diff` da desativação | api `diff_of_deactivation` ✓ | `apps/api/test/audit-diff.test.ts:42` - `expect(rows[0]!.diff).toStrictEqual({ fields: ['active'], values: { active: { from: true, to: false } } })` | PASS |
| C12 | `diff` da criação com `from` nulo | api `diff_of_creation_has_null_from` ✓ | `apps/api/test/audit-diff.test.ts:60` - `expect(rows[0]!.diff).toStrictEqual({ fields: ['name', 'email', 'role'], values: { role: { from: null, to: 'reception' } } })` | PASS |
| C13 | dez ações + login de e-mail desconhecido: nove valores fora de toda coluna | api `nine_values_never_reach_audit_logs` ✓ | `apps/api/test/audit-diff.test.ts:110` - `expect(new Set(rows.map((row) => row.action)).size).toBe(10)`; `:131` - `expect(Object.keys(forbidden)).toHaveLength(9)`; `:137` - `expect(text.includes(value), ...).toBe(false)` | PASS |
| C14 | login 200 `authenticated` grava uma linha `auth.login_succeeded` | api `login_authenticated_writes_one_succeeded_row` ✓ | `apps/api/test/audit-auth.test.ts:49` - `expect(await response.json()).toStrictEqual({ status: 'authenticated' })`; `:50` - `expect(rows).toHaveLength(1)`; `:51` - `expect(rows[0]).toMatchObject({ action: 'auth.login_succeeded', user_id: user.id, entity_id: user.id })` | PASS |
| C15 | login 200 `two_factor_required` não grava | api `two_factor_required_writes_no_row` ✓ | `apps/api/test/audit-auth.test.ts:61` - `expect(await response.json()).toStrictEqual({ status: 'two_factor_required' })`; `:62` - `expect(await auditCount(stack)).toBe(before)` | PASS |
| C16 | `two-factor/verify` 200 por TOTP e por código de recuperação grava uma linha em cada caso | api `verify_200_writes_one_succeeded_row` ✓ | `apps/api/test/audit-auth.test.ts:71` - `expect(cases).toHaveLength(2)`; `:78` - `expect(response.status, name).toBe(200)`; `:80` - `expect(rows[0], name).toMatchObject({ action: 'auth.login_succeeded', user_id: user.id, entity_id: user.id })` | PASS |
| C17 | login 401 de usuário ativo com senha errada e de usuário inativo grava `auth.login_failed` com o id | api `login_401_of_known_email_writes_failed_row_with_user` ✓ | `apps/api/test/audit-auth.test.ts:91` - `expect(cases).toHaveLength(2)`; `:96` - `expect(response.status, name).toBe(401)`; `:98` - `expect(rows[0], name).toMatchObject({ action: 'auth.login_failed', user_id: user.id, entity_id: user.id })` | PASS |
| C18 | login 401 de e-mail desconhecido grava linha sem usuário, alvo nem `diff` | api `login_401_of_unknown_email_writes_failed_row_without_user` ✓ | `apps/api/test/audit-auth.test.ts:109` - `expect(rows).toHaveLength(1)`; `:110` - `expect(rows[0]).toMatchObject({ action: 'auth.login_failed', user_id: null, entity_id: null, diff: null })` | PASS |
| C19 | `verify` 401 com login pendente grava `auth.login_failed` com o usuário pendente | api `verify_401_with_pending_login_writes_failed_row` ✓ | `apps/api/test/audit-auth.test.ts:121` - `expect(response.status).toBe(401)`; `:123` - `expect(rows[0]).toMatchObject({ action: 'auth.login_failed', user_id: user.id })` | PASS |
| C20 | `verify` 401 sem login pendente não grava | api `verify_401_without_pending_login_writes_no_row` ✓ | `apps/api/test/audit-auth.test.ts:132` - `expect(response.status).toBe(401)`; `:133` - `expect(await auditCount(stack)).toBe(before)` | PASS |
| C21 | 429 no login e no segundo passo não gravam | api `blocked_attempts_write_no_row` ✓ | `apps/api/test/audit-auth.test.ts:146` - `expect(cases).toHaveLength(2)`; `:153` - `expect(response.status, name).toBe(429)`; `:154` - `expect(await auditCount(stack), name).toBe(before)` | PASS |
| C22 | 10 falhas simultâneas: linhas `auth.login_failed` = respostas 401; 401 + 429 = 10 | api `ten_concurrent_failures_write_one_row_per_401` ✓ | `apps/api/test/audit-auth.test.ts:168` - `expect(unauthorized + blocked).toBe(10)`; `:170` - `expect(rows.filter((row) => row.action === 'auth.login_failed')).toHaveLength(unauthorized)` | PASS |
| C23 | logout 204 grava uma linha `auth.logout` de quem saiu | api `logout_writes_one_row` ✓ | `apps/api/test/audit-auth.test.ts:180` - `expect(rows).toHaveLength(1)`; `:181` - `expect(rows[0]).toMatchObject({ action: 'auth.logout', user_id: user.id })` | PASS |
| C24 | troca da própria senha 204 grava `auth.password_changed` com `diff` nulo | api `own_password_change_writes_one_row` ✓ | `apps/api/test/audit-auth.test.ts:192` - `expect(rows).toHaveLength(1)`; `:193` - `expect(rows[0]).toMatchObject({ action: 'auth.password_changed', user_id: user.id, entity_id: user.id, diff: null })` | PASS |
| C25 | `two-factor/confirm` 204 grava `auth.two_factor_enabled` | api `confirm_writes_one_two_factor_enabled_row` ✓ | `apps/api/test/audit-auth.test.ts:211` - `expect(rows).toHaveLength(1)`; `:212` - `expect(rows[0]).toMatchObject({ action: 'auth.two_factor_enabled', user_id: user.id, entity_id: user.id })` | PASS |
| C26 | `two-factor/disable` 204 grava `auth.two_factor_disabled` | api `disable_writes_one_two_factor_disabled_row` ✓ | `apps/api/test/audit-auth.test.ts:224` - `expect(rows).toHaveLength(1)`; `:225` - `expect(rows[0]).toMatchObject({ action: 'auth.two_factor_disabled', user_id: user.id, entity_id: user.id })` | PASS |
| C27 | quatro 422 e o `enable` 200 não gravam | api `four_422_and_enable_200_write_no_row` ✓ | `apps/api/test/audit-auth.test.ts:254` - `expect(cases).toHaveLength(5)`; `:261` - `expect(response.status, name).toBe(status)`; `:262` - `expect(await auditCount(stack), name).toBe(before)` | PASS |
| C28 | insert falhando no login certo: 500 sem `Set-Cookie` | api `login_500_without_cookie_when_audit_insert_fails` ✓ | `apps/api/test/audit-auth.test.ts:271` - `expect(response.status).toBe(500)`; `:274` - `expect(response.headers.getSetCookie()).toEqual([])` | PASS |
| C29 | ações gravadas = enum do contrato, que tem dez; toda linha com `entity` `user` | api `ten_actions_written_equal_contract_vocabulary` ✓ | `apps/api/test/audit-auth.test.ts:296` - `expect(auditActionSchema.options).toHaveLength(10)`; `:298` - `expect(written).toEqual([...auditActionSchema.options].sort())`; `:300` - `expect(rows.filter((row) => row.entity !== 'user')).toEqual([])` | PASS |
| C30 | `X-Forwarded-For: 203.0.113.7` grava esse `ip` | api `ip_comes_from_forwarded_for` ✓ | `apps/api/test/audit-origin.test.ts:56` - `expect(row.ip).toBe('203.0.113.7')` | PASS |
| C31 | `X-Forwarded-For: 198.51.100.1, 203.0.113.7` grava o mais à direita | api `ip_is_the_rightmost_forwarded_address` ✓ | `apps/api/test/audit-origin.test.ts:62` - `expect(row.ip).toBe('203.0.113.7')` | PASS |
| C32 | `User-Agent` de 20, 512 e 513 caracteres grava 20, 512 e os primeiros 512 | api `user_agent_is_cut_at_512_characters` ✓ | `apps/api/test/audit-origin.test.ts:79` - `expect(row.user_agent, ...).toBe(header.slice(0, stored))`; `:80` - `expect(row.user_agent, ...).toHaveLength(stored)` (casos `[20, 20]`, `[512, 512]`, `[513, 512]` em `:68`-`:70`) | PASS |
| C33 | sem `User-Agent` grava nulo | api `missing_user_agent_is_null` ✓ | `apps/api/test/audit-origin.test.ts:87` - `expect(row.user_agent).toBeNull()` | PASS |
| C34 | `created_at` fica entre o `now()` do banco antes e depois, apesar de `Date` e `createdAt` de 2000 | api `created_at_comes_from_the_database_clock` ✓ | `apps/api/test/audit-origin.test.ts:100` - `expect(row.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime())`; `:101` - `expect(row.created_at.getTime()).toBeLessThanOrEqual(after.getTime())` | PASS |
| C35 | o servidor do web repassa `User-Agent` e `X-Forwarded-For` em `GET /api/auth/session` e `GET /api/users` | web `server_render_forwards_client_ip_and_user_agent` ok | `apps/web/e2e/audit.spec.ts:51` - `expect(call.headers['user-agent'], path).toBe('teste/1.0')`; `:52` - `expect(call.headers['x-forwarded-for'], path).toBe('203.0.113.7')` | PASS |
| C36 | na stack, login pela origem do web grava `auth.login_succeeded` com `ip` e `user_agent` | stack `login_through_web_writes_audit_row_with_ip_and_user_agent` ✓ (10,9 s) | `tests/stack/compose.test.ts:132` - `expect(login.status).toBe(200)`; `:139` - `expect(rows.output.trim().split(/\r?\n/)).toEqual(['203.0.113.7&#124;teste/1.0'])` (o separador no literal é a barra vertical do `psql -tA`) | PASS |
| C37 | `UPDATE` em cada uma das nove colunas falha com `audit_logs is append-only` e a linha fica idêntica | db `update_fails_on_each_of_nine_columns` ✓ | `packages/database/test/audit.test.ts:132` - `expect(Object.keys(changes)).toHaveLength(9)`; `:140` - `.rejects.toThrow(APPEND_ONLY)`; `:141` - `expect(await read(id), column).toEqual(before)` | PASS |
| C38 | `DELETE` falha com a mensagem e a linha fica | db `delete_fails_and_keeps_the_row` ✓ | `packages/database/test/audit.test.ts:149` - `await expect(rows('delete from audit_logs where id = $1', [id])).rejects.toThrow(APPEND_ONLY)`; `:151` - `expect(await read(id)).toEqual(before)` | PASS |
| C39 | `TRUNCATE audit_logs` falha e a contagem fica | db `truncate_fails_and_keeps_every_row` ✓ | `packages/database/test/audit.test.ts:161` - `await expect(rows('truncate audit_logs')).rejects.toThrow()`; `:163` - `expect(await count()).toBe(before)` | PASS |
| C40 | `DELETE` do autor em `users` falha por chave estrangeira; usuário e linha ficam | db `author_of_a_row_cannot_be_deleted` ✓ | `packages/database/test/audit.test.ts:169` - `.rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION })`; `:173` - `expect(await rows('select id from users where id = $1', [author])).toEqual([{ id: author }])`; `:174` - `expect(await read(id)).toHaveLength(1)` | PASS |
| C41 | sob `/api/audit-logs` só `GET` está registrado | api `only_get_is_registered_under_audit_logs` ✓ | `apps/api/test/audit-logs.test.ts:85` - `expect(routes).toEqual(['GET /api/audit-logs'])` | PASS |
| C42 | nove colunas, nessa ordem, e índice `(created_at, user_id)` | db `audit_logs_has_nine_columns_and_the_index` ✓ | `packages/database/test/audit.test.ts:69` - `expect(columns.map((column) => column.column_name)).toEqual(['id', 'user_id', 'action', 'entity', 'entity_id', 'ip', 'user_agent', 'diff', 'created_at'])`; `:90` - `expect(indexes.map((index) => index.columns)).toContainEqual(['created_at', 'user_id'])` | PASS |
| C43 | `uuid` v7 e instante por default; autor nulo e `entity_id` solto aceitos; autor inexistente recusado por FK | db `defaults_optional_author_and_unbound_entity_id` ✓ | `packages/database/test/audit.test.ts:100` - `expect(byDefault!.version).toBe(7)`; `:101` - `expect(byDefault!.created_at.getTime()).toBeGreaterThanOrEqual(before!.now.getTime())`; `:109` - `expect(unbound).toEqual({ user_id: null, entity_id: nowhere })`; `:114` - `.rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION })` | PASS |
| C44 | 60 linhas: 200, exatamente 50 itens, mais recente primeiro, nove chaves | api `list_200_fifty_newest_first_with_nine_keys` ✓ | `apps/api/test/audit-logs.test.ts:96` - `expect(response.status).toBe(200)`; `:97` - `expect(items).toHaveLength(50)`; `:100` - `expect(instants).toEqual([...instants].sort((a, b) => b - a))`; `:103` - `expect(Object.keys(item).sort()).toEqual(['id', 'createdAt', 'user', 'action', 'entity', 'entityId', 'ip', 'userAgent', 'diff'].sort())` | PASS |
| C45 | `user` nulo sem autor; `id` e `name` com autor; nome novo depois de renomear | api `user_is_current_name_or_null` ✓ | `apps/api/test/audit-logs.test.ts:120` - `expect(before.items[0]!.user).toStrictEqual({ id: author.id, name: 'Nome da autora' })`; `:121` - `expect(before.items[1]!.user).toBeNull()`; `:127` - `expect(after.items[0]!.user).toStrictEqual({ id: author.id, name: 'Nome trocado' })` | PASS |
| C46 | 120 linhas, 60 no mesmo instante: o cursor percorre 120 ids distintos na ordem do banco | api `cursor_walks_every_row_once_even_with_equal_instants` ✓ | `apps/api/test/audit-logs.test.ts:138` - `expect(expected).toHaveLength(120)`; `:150` - `expect(cursor).toBeNull()`; `:152` - `expect(new Set(walked).size).toBe(120)`; `:153` - `expect(walked).toEqual(expected)` | PASS |
| C47 | `nextCursor` nulo com 50 linhas e não nulo com 51 | api `next_cursor_null_at_50_and_set_at_51` ✓ | `apps/api/test/audit-logs.test.ts:165` - `expect(await auditCount(counted)).toBe(50)`; `:170` - `expect(atFifty.nextCursor).toBeNull()`; `:173` - `expect(await auditCount(counted)).toBe(51)`; `:177` - `expect(atFiftyOne.nextCursor).not.toBeNull()` | PASS |
| C48 | 5 linhas novas entre páginas não deslocam os 10 ids da segunda | api `rows_written_between_pages_do_not_shift_the_next_page` ✓ | `apps/api/test/audit-logs.test.ts:187` - `expect(expected).toHaveLength(10)`; `:199` - `expect(second.items.map((item) => item.id)).toEqual(expected)` | PASS |
| C49 | cinco filtros de igualdade sozinhos, e `userId` + `action` juntos | api `five_equality_filters_alone_and_combined` ✓ | `apps/api/test/audit-logs.test.ts:225` - `expect(cases).toHaveLength(6)`; `:231` - `expect(items.filter((item) => !holds(item)), ...).toEqual([])`; `:232` - `expect(items.map((item) => item.id).filter((id) => mine.includes(id)), ...).toEqual(expected)` | PASS |
| C50 | período inclui `from` e exclui `to`, nas quatro bordas | api `period_includes_from_and_excludes_to` ✓ | `apps/api/test/audit-logs.test.ts:249` - `expect(await ids({ from: from.toISOString() })).toEqual([atTo, beforeTo, atFrom])`; `:250` - `expect(await ids({ to: to.toISOString() })).toEqual([beforeTo, atFrom, beforeFrom])`; `:251` - `expect(await ids({ from: from.toISOString(), to: to.toISOString() })).toEqual([beforeTo, atFrom])` | PASS |
| C51 | sete parâmetros inválidos: 422 `validation_failed` com `path` do parâmetro; `ip` de 45 responde 200 | api `seven_invalid_query_parameters_422_on_path` ✓ | `apps/api/test/audit-logs.test.ts:264` - `expect(cases).toHaveLength(7)`; `:270` - `expect(response.status, param).toBe(422)`; `:271` - `expect(body.code, param).toBe('validation_failed')`; `:272` - `expect(body.errors?.map((error) => error.path), param).toEqual([param])`; `:276` - `expect(longest.status).toBe(200)` | PASS |
| C52 | `reception`, `hr_finance` e `instructor` recebem 403 `forbidden` | api `non_admin_403_on_audit_logs` ✓ | `apps/api/test/access.test.ts:133` - `expect(roles).toHaveLength(3)`; `:140` - `expect(response.status, role).toBe(403)`; `:141` - `expect((await problem(response)).code, role).toBe('forbidden')` | PASS |
| C53 | sem cookie, 401 `unauthorized`: a rota é percorrida e não está entre as três abertas | api `only_three_routes_answer_without_session` ✓ | `apps/api/test/access.test.ts:155` - `if (response.status === 401 && code === 'unauthorized') continue;`; `:161` - `expect(open.sort()).toEqual(['GET /health', 'POST /api/auth/login', 'POST /api/auth/two-factor/verify'])`; a rota está no mesmo `stack.api.routes()` por `apps/api/test/audit-logs.test.ts:85` | PASS |
| C54 | ler a trilha não grava linha | api `reading_the_trail_writes_no_row` ✓ | `apps/api/test/audit-logs.test.ts:292` - `expect(response.status).toBe(200)`; `:293` - `expect(await auditCount(stack)).toBe(before)` | PASS |
| C55 | OpenAPI: oito `parameters` de query, nenhum `required`, `schema` igual ao do contrato | api `audit_logs_query_parameters_come_from_contract_schema` ✓ | `apps/api/test/openapi.test.ts:78` - `expect(parameters).toHaveLength(8)`; `:79` - `expect(parameters.map((parameter) => parameter.name).sort()).toEqual([...names].sort())`; `:81` - `expect(parameter.in, parameter.name).toBe('query')`; `:82` - `expect(parameter.required, parameter.name).not.toBe(true)`; `:83` - `expect(parameter.schema, parameter.name).toEqual(properties[parameter.name])` | PASS |
| C56 | o corpo 200 real valida contra o schema de resposta, com e sem autor e `diff` | api `audit_logs_body_matches_contract_schema` ✓ | `apps/api/test/contracts.test.ts:191` - `expect(body.items.some((item) => item.user?.id === admin.user.id && item.diff !== null)).toBe(true)`; `:192` - `expect(body.items.some((item) => item.user === null && item.diff === null)).toBe(true)`; `:193` - `expect(parsed.success, ...).toBe(true)` | PASS |
| C57 | link "Auditoria" só para `admin`, nos quatro perfis | web `audit_link_only_for_admin` ok | `apps/web/e2e/shell.spec.ts:44` - `await expect(page.getByRole('link', { name: 'Auditoria', exact: true }), role).toHaveCount(expected ? 1 : 0)` (mapa dos quatro perfis em `:32`-`:37`) | PASS |
| C58 | sem sessão, `/audit` termina em `/login` | web `anonymous_audit_redirects_to_login` ok | `apps/web/e2e/audit.spec.ts:65` - `await expect(page).toHaveURL('/login')` | PASS |
| C59 | três perfis não administradores veem a mensagem e nenhum `ip` nem `userAgent` | web `non_admin_sees_no_permission_and_no_trail` ok | `apps/web/e2e/audit.spec.ts:74` - `expect(roles).toHaveLength(3)`; `:84` - `page.getByText('Você não tem permissão para acessar esta página.', { exact: true })` com `.toBeVisible()` em `:86`; `:89` - `expect(content, role).not.toContain(item.ip!)`; `:90` - `expect(content, role).not.toContain(item.userAgent!)` | PASS |
| C60 | título "Auditoria", sete colunas na ordem, linhas na ordem da API | web `audit_table_title_seven_columns_and_order` ok | `apps/web/e2e/audit.spec.ts:107` - `await expect(page.getByRole('heading', { name: 'Auditoria', exact: true })).toBeVisible()`; `:108` - `expect(await page.getByRole('columnheader').allTextContents()).toEqual(['Data e hora', 'Usuário', 'Ação', 'Alvo', 'IP', 'Navegador', 'Detalhes'])`; `:119` - `expect(await body.locator('td:nth-child(5)').allTextContents()).toEqual(['203.0.113.1', '203.0.113.3', '203.0.113.2'])` | PASS |
| C61 | dois instantes exibidos em `America/Sao_Paulo` | web `instants_shown_in_sao_paulo_time` ok | `apps/web/e2e/audit.spec.ts:130` - `expect(await page.locator('tbody tr td:nth-child(1)').allTextContents()).toEqual(['04/10/2026 12:04:05', '04/10/2026 23:30:00'])` | PASS |
| C62 | dez rótulos de ação, na ordem da door 3 | web `ten_actions_shown_by_label` ok | `apps/web/e2e/audit.spec.ts:137` - `expect(AUDIT_ACTIONS).toHaveLength(10)`; `:145` - `expect(await page.locator('tbody tr td:nth-child(3)').allTextContents()).toEqual(['Login', 'Falha de login', 'Logout', 'Troca da própria senha', '2FA ativado', '2FA desativado', 'Usuário criado', 'Usuário editado', 'Senha redefinida', '2FA zerado'])` | PASS |
| C63 | linha sem autor exibe "—" em "Usuário" | web `row_without_author_shows_dash` ok | `apps/web/e2e/audit.spec.ts:165` - `await expect(page.locator('tbody tr td:nth-child(2)')).toHaveText('—')` | PASS |
| C64 | "Alvo" exibe "Pessoa 2" | web `target_shows_current_user_name` ok | `apps/web/e2e/audit.spec.ts:175` - `await expect(page.locator('tbody tr td:nth-child(4)')).toHaveText('Pessoa 2')` | PASS |
| C65 | "Detalhes" exibe "Perfil: Recepção → Administrador" e "Nome alterado" | web `details_show_role_change_and_changed_name` ok | `apps/web/e2e/audit.spec.ts:195` - `await expect(details.getByText('Perfil: Recepção → Administrador', { exact: true })).toBeVisible()`; `:196` - `await expect(details.getByText('Nome alterado', { exact: true })).toBeVisible()` | PASS |
| C66 | cinco filtros e dois botões acima da tabela | web `five_filters_and_two_buttons_above_the_table` ok | `apps/web/e2e/audit.spec.ts:211` - `expect(controls).toHaveLength(7)`; `:213` - `await expect(control).toBeVisible()`; `:215` - `expect(box.y + box.height).toBeLessThanOrEqual(tableTop)` | PASS |
| C67 | "Filtrar" leva os cinco filtros à URL e os limites do dia, em São Paulo, à API | web `filter_puts_filters_in_url_and_day_bounds_in_sao_paulo` ok | `apps/web/e2e/audit.spec.ts:242` - `expect(Object.fromEntries(url.searchParams)).toEqual({ from: '2026-10-01', to: '2026-10-04', userId: USERS[1]!.id, action: 'auth.login_failed', ip: '203.0.113.7' })`; `:250` - `expect(Object.fromEntries(sent)).toEqual({ from: '2026-10-01T03:00:00.000Z', to: '2026-10-05T03:00:00.000Z', userId: USERS[1]!.id, action: 'auth.login_failed', ip: '203.0.113.7' })`; `:258` - `expect(await page.locator('tbody tr td:nth-child(6)').allTextContents()).toEqual(['Só a filtrada/1.0'])` | PASS |
| C68 | "Próxima página" mantém `action`, manda `cursor` e exibe a segunda resposta | web `next_page_link_keeps_filters_and_sends_cursor` ok | `apps/web/e2e/audit.spec.ts:274` - `await expect(next).toBeVisible()`; `:277` - `await expect(page.locator('tbody tr td:nth-child(5)')).toHaveText(['198.51.100.2'])`; `:279` - `expect(Object.fromEntries(sent)).toEqual({ action: 'auth.login_failed', cursor })` | PASS |
| C69 | `items` vazio exibe "Nenhum registro encontrado." sem tabela | web `empty_trail_shows_message_instead_of_table` ok | `apps/web/e2e/audit.spec.ts:288` - `await expect(page.getByText('Nenhum registro encontrado.', { exact: true })).toBeVisible()`; `:289` - `await expect(page.getByRole('table')).toHaveCount(0)` | PASS |
| C70 | 500 exibe a mensagem e "Tentar novamente", que traz a tabela de volta | web `load_failure_shows_retry` ok | `apps/web/e2e/audit.spec.ts:298` - `await expect(page.getByText('Não foi possível carregar a auditoria.', { exact: true })).toBeVisible()`; `:300` - `await expect(retry).toBeVisible()`; `:306` - `await expect(page.getByRole('table')).toBeVisible()` | PASS |
| C71 | `message` do 422 junto do filtro, nos cinco pares | web `query_errors_shown_on_five_filters` ok | `apps/web/e2e/audit.spec.ts:319` - `expect(pairs).toHaveLength(5)`; `:329` - `await expect(page.getByLabel(label, { exact: true }), path).toHaveAccessibleDescription(message)` | PASS |
| C72 | `entityId` nulo exibe "—" em "Alvo" | web `row_without_target_shows_dash` ok | `apps/web/e2e/audit.spec.ts:184` - `await expect(page.locator('tbody tr td:nth-child(4)')).toHaveText('—')` | PASS |
| C73 | "Limpar filtros" termina em `/audit` sem query, e a API recebe a chamada sem query | web `clear_filters_goes_to_audit_without_query` ok | `apps/web/e2e/audit.spec.ts:343` - `await expect(page).toHaveURL('/audit')`; `:344` - `expect(new URL(page.url()).search).toBe('')`; `:347` - `expect(auditCalls(api).at(-1)!.query).toBe('')` | PASS |

73 de 73 checks com prova verde em `HEAD` e asserção localizada.

## Level and sampling

Julgado check a check, sem achado que reprove.

- **Nível.** Todo check que nomeia status, rota ou forma de resposta é provado na fronteira que
  nomeia: C1 a C7, C14 a C34, C41 e C44 a C56 fazem a requisição HTTP contra a API montada por
  `startApi`, que usa o mesmo `AppModule` e o mesmo `configureApp` do processo real
  (`apps/api/test/support/app.ts:35`, `apps/api/src/bootstrap.ts:18`); C35 e C57 a C73 rodam no
  navegador contra o web construído; C36 cruza web, API e banco nos containers reais. C8 e C9 rodam
  o processo `pnpm users:create-admin` de verdade (`apps/api/test/support/command.ts:11`). C37 a
  C40, C42 e C43 rodam SQL sobre o banco migrado por `pnpm db:migrate`
  (`packages/database/test/audit.test.ts:19`). Nenhum check de status é provado abaixo da fronteira.
- **Amostragem.** Todo check que afirma N casos exercita os N, e cada prova trava o próprio N com
  uma asserção de tamanho: C2 (3), C6 (6), C7 (5), C13 (10 ações, 9 valores), C16 (2), C17 (2), C21
  (2), C27 (5), C29 (10), C32 (3), C37 (9), C49 (5 + 1 combinado), C50 (4 bordas, 3 consultas), C51
  (7 + a borda de 45), C52 (3), C55 (8), C57 (4), C59 (3), C62 (10), C66 (7), C71 (5).
- **Prova tocada pelo diff.** 72 das 73 provas são testes criados ou editados em `1b7a662..HEAD`. A
  exceção é a C53, declarada em `checks.md`: `only_three_routes_answer_without_session` não foi
  editado, mas percorre as rotas lidas do roteador em execução, e a rota nova está nesse roteador
  (C41, mesma função `routes()`). Aceito, com a observação 1 abaixo.

## Swept existing

Linhas de `## Swept` que resolvem para algo já existente, relidas contra o código e rodadas em
`HEAD` (`pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts test/problem.test.ts test/auth-log.test.ts --reporter=verbose` - exit 0, 8 passed, 0 failed).

| Swept row | Cited constraint | Where it is | Present |
| --- | --- | --- | --- |
| authorization | o 403 de cadastro obrigatório do 2FA vale para a rota nova, pela prova `admin_without_2fa_gets_403_everywhere_else` | `apps/api/test/enrollment.test.ts:36`; a lista esperada inclui `'GET /api/audit-logs'` em `apps/api/test/enrollment.test.ts:59`; a rota declara `@Roles('admin')` em `apps/api/src/audit/audit-logs.controller.ts:15` | yes |
| dependency failure | banco fora na consulta cai no 500 `internal_error` do `ProblemFilter`, pela prova `unhandled_500_hides_exception` | `apps/api/test/problem.test.ts:31`, `:35` - `expect(response.status).toBe(500)`, `:37` - `expect(JSON.parse(text).code).toBe('internal_error')` | yes |
| observability | as linhas de log de login seguem na prova `login_outcomes_log_one_line_each` | `apps/api/test/auth-log.test.ts:58`; o arquivo não está no diff `1b7a662..HEAD` | yes |

As linhas `state transitions` (n/a) e as demais, que só citam checks desta feature, não têm o que
reler.

## Steps not run under light

- **Fault injection**: não roda em `light`. Nenhuma mutação foi injetada; este relatório não diz se
  alguma prova passaria sob uma implementação errada.
- **Coverage recompute**: não roda em `light`. A tabela `## Coverage` de `checks.md` foi lida, não
  recomputada a partir da autoridade de cada conjunto; só a amostragem por check foi julgada acima.
- **Test policy**: sem veredito por linha em `light`, como o próprio `checks.md` registra.
- **Walk the flow with the user**: não feito; este Verifier não fala com o usuário.

## Observations

Nenhuma reprova check. Ficam como lacunas de precisão e notas para o dono da feature.

1. C53 depende de um teste que o diff não tocou e que não nomeia `/api/audit-logs`: a presença da
   rota na enumeração é inferida do roteador (C41). Se `routes()` deixasse de enxergar a rota, a C53
   continuaria verde sem ela.
2. C39 afirma só "falha": a asserção `rejects.toThrow()` em
   `packages/database/test/audit.test.ts:161` aceita qualquer erro, sem mensagem nem código. A
   migração levanta `audit_logs is append-only` também no `TRUNCATE`
   (`packages/database/migrations/0002_audit_logs.sql`), mas o check e a AC 37 não fixam isso.
3. C19 e C23 (e as AC 19 e 23) não fixam `entity_id`, ao contrário de C14, C16, C17 e C24 a C26; as
   provas seguem o texto e também não o afirmam.
4. C62 diz "na ordem da door 3": a prova usa a ordem de `AUDIT_ACTIONS`
   (`packages/contracts/src/audit.ts:7`), que hoje coincide com a da door 3; nada trava as duas
   ordens uma à outra.
5. `cursor_the_api_never_issued_is_422` (`apps/api/test/audit-logs.test.ts:279`) roda e passa, mas
   nenhum check o cita: o caso "uuid que não é de linha nenhuma responde 422 em `cursor`" está só no
   Handoff de `checks.md`.
6. `.specs/STATE.md` (Handoff) e `.specs/ROADMAP.md` em `HEAD` ainda descrevem a `auditoria` como
   "checks escritos, à espera da revisão" / "não iniciada" e falam em 71 checks; `checks.md` tem 73 e
   o código está todo em `1b7a662..HEAD`.
7. C36 manda o `X-Forwarded-For` do lado de fora, como `checks.md` declara: prova a montagem, não que
   o IP seja confiável (Open question 1 do plano, que bloqueia o go-live).

## Gate

`pnpm --filter "./packages/database" exec vitest run test/audit.test.ts` + `pnpm --filter "./apps/api" exec vitest run <9 arquivos>` + `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts e2e/shell.spec.ts` + `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "login_through_web_writes_audit_row_with_ip_and_user_agent"` - 88 passed, 0 failed
