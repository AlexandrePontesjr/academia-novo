# Autenticação e controle de acesso por perfil verification

**Verdict**: FAIL
**Profile**: light
**Diff range**: 41766a8..1d5598fa13ad2b09fbd855ab03d9c54fbd03dbe9
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

As 102 provas nomeadas em `checks.md` foram rodadas em `1d5598f` e as 102 passaram, cada teste
listado individualmente. 99 dos 102 checks estão provados com evidência localizada. Três não estão:

- **C22 e C23** (AC 16, AC 17, door 8): a checagem de origem compara o caminho com diferença de
  maiúsculas (`apps/api/src/csrf.ts:13`), e o roteador do Express não. No processo real
  (`dist/main.js`) com Postgres de pé, `POST /API/auth/login` com `Origin: https://outro.example`,
  sem `Origin`, e sem `Origin` com `Sec-Fetch-Site: cross-site`, com credenciais certas, respondeu
  `200` com cookie de sessão e criou linha em `sessions`; `POST /API/auth/logout` com origem
  estranha respondeu `204` e apagou a sessão. O handler roda com origem estranha.
- **C100** (AC 74): a asserção só enxerga o que passa por `process.stdout.write` e
  `process.stderr.write`; as linhas que o Better Auth escreve por `console` ficam fora da captura
  (demonstrado abaixo). E o processo real escreve dois dos seis valores quando uma consulta ao banco
  falha: o e-mail digitado no login e o token da sessão aparecem no stderr.

Nada disso foi inferido: cada ponto foi executado contra o `dist` construído em `1d5598f`. Os
achados, as lacunas de precisão e o que achei suspeito mesmo onde o check passou estão em
`## Findings`.

## Binding sources

Não roda no profile `light` (passo 1 é do profile `ui`). O plano não marca nenhuma fonte como
binding.

## Checks

As provas foram agrupadas por alvo, uma invocação por alvo, rodadas uma depois da outra da raiz do
repositório, com reporter que lista cada teste pelo nome. Nenhuma invocação foi repetida e nenhum
filtro ficou sem teste: cada um dos 102 nomes aparece uma única vez como aprovado.

```
api    = pnpm --filter "./apps/api" exec vitest run test/access.test.ts test/auth-log.test.ts test/better-auth.test.ts test/boot.test.ts test/contracts.test.ts test/create-admin.test.ts test/csrf.test.ts test/enrollment.test.ts test/login.test.ts test/openapi.test.ts test/password.test.ts test/session.test.ts test/throttle.test.ts test/two-factor.test.ts test/users.test.ts test/validation.test.ts --reporter=verbose -t "<68 nomes unidos por |>"
db     = pnpm --filter "./packages/database" exec vitest run test/schema.test.ts --reporter=verbose -t "<4 nomes>"
repo   = pnpm --filter "./tests/repo" exec vitest run repo.test.ts --reporter=verbose -t "<2 nomes>"
web    = pnpm --filter "./apps/web" exec playwright test e2e/account.spec.ts e2e/forms.spec.ts e2e/login.spec.ts e2e/proxy.spec.ts e2e/shell.spec.ts e2e/two-factor.spec.ts e2e/users.spec.ts --reporter=list -g "<24 nomes>"
stack  = pnpm --filter "./tests/stack" exec vitest run compose.test.ts --reporter=verbose -t "<3 nomes>"
gate   = pnpm --filter "./tests/stack" exec vitest run verify.test.ts --reporter=verbose -t "verify_fails_below_70_percent_coverage"
```

Na coluna `Proof run`, `api -t nome` quer dizer: o teste `nome` apareceu como aprovado na saída da
invocação `api`, que saiu com código 0. Na coluna `Evidence`, uma citação `:NN` sem caminho continua
no arquivo citado imediatamente antes, na mesma célula.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `signInEmail` por `auth.api` com 2FA não cria sessão; `verifyTOTP` cria exatamente uma e o cookie resolve o usuário | `api` -t `two_factor_via_auth_api_with_return_headers` exit 0 | `apps/api/test/better-auth.test.ts:79` - `expect(await sessionRows()).toEqual([])`; `apps/api/test/better-auth.test.ts:87` - `expect(await sessionRows()).toEqual([{ user_id: user.id }])`; `apps/api/test/better-auth.test.ts:92` - `expect(session?.user.id).toBe(user.id)` | PASS |
| C2 | login sem 2FA: `200`, exatamente `{"status":"authenticated"}`, linha em `sessions`, cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain` | `api` -t `login_200_authenticated_with_session_cookie` exit 0 | `apps/api/test/login.test.ts:19` - `expect(response.status).toBe(200)`; `apps/api/test/login.test.ts:20` - `expect(await response.json()).toEqual({ status: 'authenticated' })`; `apps/api/test/login.test.ts:21` (uma linha em `sessions`); `apps/api/test/login.test.ts:29` a `:32` - `expect(attributes).toContain('httponly')`, `'secure'`, `'samesite=lax'`, `'path=/'`; `apps/api/test/login.test.ts:33` - `expect(attributes.filter((attribute) => attribute.startsWith('domain'))).toEqual([])` | PASS |
| C3 | e-mail inexistente, senha errada e usuário inativo: `401` `invalid_credentials`, sem `Set-Cookie`, corpos idênticos salvo `requestId` | `api` -t `login_401_identical_for_three_causes` exit 0 | `apps/api/test/login.test.ts:50` - `expect(response.status).toBe(401)`; `apps/api/test/login.test.ts:51` - `expect(body.code).toBe('invalid_credentials')`; `apps/api/test/login.test.ts:53` - `expect(response.headers.getSetCookie()).toEqual([])`; `apps/api/test/login.test.ts:57` e `:58` - `expect(bodies[1]).toEqual(bodies[0])`, `expect(bodies[2]).toEqual(bodies[0])` | PASS |
| C4 | `GET /api/auth/session` com cookie válido: `200` com os cinco campos de `user` e `twoFactorEnrollmentRequired`, e nenhuma outra chave | `api` -t `session_200_returns_user_fields` exit 0 | `apps/api/test/session.test.ts:34` - `expect(response.status).toBe(200)`; `apps/api/test/session.test.ts:35` - `expect(await response.json()).toStrictEqual({ user: { id, name, email, role: 'reception', twoFactorEnabled: false }, twoFactorEnrollmentRequired: false })` | PASS |
| C5 | sem cookie, cookie adulterado e sessão expirada: `401` `unauthorized` nos três | `api` -t `session_401_without_valid_session` exit 0 | `apps/api/test/session.test.ts:49` e `:50` (sem cookie), `:57` e `:58` (adulterado), `:64` e `:65` (expirada) - `expect(expired.status).toBe(401)`, `expect(await code(expired)).toBe('unauthorized')` | PASS |
| C6 | logout: `204`, linha da sessão some, o mesmo cookie recebe `401` | `api` -t `logout_204_deletes_session_row` exit 0 | `apps/api/test/session.test.ts:75` - `expect(response.status).toBe(204)`; `apps/api/test/session.test.ts:76` - `expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toEqual([])`; `apps/api/test/session.test.ts:78` - `expect(reused.status).toBe(401)` | PASS |
| C7 | sessão com último uso há 30 min recebe `401` | `api` -t `session_expires_after_30_min_idle` exit 0 | `apps/api/test/session.test.ts:89` - `expect(response.status).toBe(401)` depois de `advance(30)`; `apps/api/test/session.test.ts:90` - `expect(await code(response)).toBe('unauthorized')` | PASS |
| C8 | sessão usada aos 29 min responde `200` aos 58 min | `api` -t `session_slides_on_use` exit 0 | `apps/api/test/session.test.ts:98` - `expect((await client.get('/api/auth/session')).status).toBe(200)` em `advance(29)`; `apps/api/test/session.test.ts:101` - a mesma expressão em `advance(58)` | PASS |
| C9 | os quatro caminhos que gravam senha guardam `$argon2id$v=19$m=19456,t=2,p=1$...` sem a senha | `api` -t `every_password_write_stores_argon2id` exit 0 | `apps/api/test/password.test.ts:64` - `expect(stored.startsWith(ARGON2ID_PREFIX), ...).toBe(true)`; `apps/api/test/password.test.ts:65` - `expect(stored, path).not.toContain(password)`; `apps/api/test/password.test.ts:61` - `expect(writes).toHaveLength(4)` (comando real por `pnpm users:create-admin`, `POST /api/users`, `PUT /api/auth/password`, `PUT /api/users/:id/password`) | PASS |
| C10 | troca da própria senha: `204`, sessão atual `200`, a outra `401`, login com a nova `200` e com a antiga `401` | `api` -t `change_password_204_keeps_current_session_only` exit 0 | `apps/api/test/password.test.ts:81` - `expect(response.status).toBe(204)`; `:82` (`current` 200); `:83` - `expect((await other.get('/api/auth/session')).status).toBe(401)`; `:84` (nova 200); `:85` (antiga 401); `:74` - `expect(newPassword).toHaveLength(12)` | PASS |
| C11 | senha atual errada: `422`, exatamente um item, `path` `currentPassword`, senha guardada não muda | `api` -t `wrong_current_password_422` exit 0 | `apps/api/test/password.test.ts:99` - `expect(response.status).toBe(422)`; `:101` - `expect(body.errors).toHaveLength(1)`; `:102` - `expect(body.errors![0]!.path).toBe('currentPassword')`; `:104` - `expect(await storedPassword(user.email)).toBe(before)` | PASS |
| C12 | nas três rotas, 11 e 129 caracteres: `422` com `path` do campo; 12 e 128 aceitos | `api` -t `password_length_bounds_on_three_routes` exit 0 | `apps/api/test/password.test.ts:148` - `expect(response.status, ...).toBe(422)`; `:149` - `expect(body.errors?.map((error) => error.path), ...).toEqual([field])` para `[11, 129]`; `:154` - `expect(response.status, ...).toBe(accepted)` para `[12, 128]`, sobre as três rotas da tabela em `:115-141` | PASS |
| C13 | para `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, o web repassa método, corpo, `Origin` e `Cookie`, e devolve status, corpo, `Set-Cookie` e `X-Request-Id` | `web` -g `proxy_forwards_request_and_response` exit 0 | `apps/web/e2e/proxy.spec.ts:75` - `expect(forwarded[0]!.method, method).toBe(method)`; `:77` (corpo); `:79` (`Origin`); `:80` - `expect(forwarded[0]!.cookie, method).toContain('sessao=valor-da-sessao')`; `:83` - `expect(response.status, method).toBe(218)`; `:85` (`X-Request-Id`); `:87` (cookie `HttpOnly` da API no navegador). Para `GET` o navegador não manda `Origin` e a asserção de `:79` é a ausência | PASS |
| C14 | `AUTH_SECRET` ausente, de 31 caracteres, `WEB_ORIGIN` ausente ou `ftp://x`: código 1, nome impresso, nenhum valor impresso | `api` -t `auth_env_rejected_exits_1_naming_var` exit 0 | `apps/api/test/boot.test.ts:103` - `expect(status, JSON.stringify(env)).toBe(1)`; `:104` - `expect(output).toContain(variable)`; `:106` - `expect(output).not.toContain(value)` sobre os quatro casos de `:92-97`; `:98` - `expect(cases[1]!.env.AUTH_SECRET).toHaveLength(31)`. Processo real: `spawnSync(process.execPath, ['dist/main.js'])` em `:40` | PASS |
| C15 | `POST /api/auth/sign-up/email` e `/sign-in/email`: `404` `not_found`, nenhum usuário criado | `api` -t `better_auth_handler_is_not_mounted` exit 0 | `apps/api/test/login.test.ts:76` - `expect(response.status).toBe(404)`; `:77` - `expect(... .code).toBe('not_found')`; `:79` - `expect(await stack.query('select id from users')).toEqual(usersBefore)` | PASS |
| C16 | stack de pé: admin criado pelo comando no container `api`; login pela origem do web `200` com cookie; sessão `200` pela mesma origem | `stack` -t `login_through_web_origin` exit 0 | `tests/stack/compose.test.ts:92` - `expect(created.status, created.output).toBe(0)`; `:99` - `expect(login.status).toBe(200)`; `:105` - `expect(cookie).toMatch(/session_token=/)`; `:109` - `expect(session.status).toBe(200)` | PASS |
| C17 | login sem `password` e com `email` `x`: `422` problem+json, `validation_failed`, exatamente dois itens (`email`, `password`), `message` não vazia e diferente da padrão em inglês | `api` -t `invalid_body_422_one_error_per_field` exit 0 | `apps/api/test/validation.test.ts:48` - `expect(response.status).toBe(422)`; `:49` (content-type); `:50` - `expect(body.code).toBe('validation_failed')`; `:51` - `expect(body.errors?.map((error) => error.path).sort()).toEqual(['email', 'password'])`; `:53` (não vazia); `:55` - `expect(error.message, error.path).not.toBe(englishByPath.get(error.path))` | PASS |
| C18 | campo aninhado sai com `path` `address.zip` | `api` -t `nested_path_uses_dot_notation` exit 0 | `apps/api/test/validation.test.ts:65` - `expect(body.errors?.map((error) => error.path)).toEqual(['address.zip'])` | PASS |
| C19 | o corpo do `422` não contém nenhum valor enviado | `api` -t `errors_never_echo_client_values` exit 0 | `apps/api/test/validation.test.ts:82` - `expect(text).not.toContain(String(value))` sobre quatro marcadores; `:80` - quatro itens em `errors` | PASS |
| C20 | corpo ilegível: `400` `bad_request`, não `422` | `api` -t `unreadable_body_stays_400` exit 0 | `apps/api/test/validation.test.ts:91` - `expect(response.status).toBe(400)`; `:92` - `expect((await problem(response)).code).toBe('bad_request')` | PASS |
| C21 | as nove rotas com `422` na `Surface` respondem `422` `validation_failed` | `api` -t `every_route_with_body_answers_422` exit 0 | `apps/api/test/validation.test.ts:116` - `expect(response.status, ...).toBe(422)`; `:117` - `expect(parsed.code, ...).toBe('validation_failed')` sobre a tabela de `:98-109`; `:110` - `expect(routes).toHaveLength(9)`. As nove batem com as linhas da `Surface` que listam `422` | PASS |
| C22 | para `POST`, `PUT`, `PATCH`, `DELETE`, requisição `/api` com `Origin` estranha: `403` `csrf_rejected`, handler não executa; login certo nessa condição não cria sessão | `api` -t `foreign_origin_403_without_running_handler` exit 0 | `apps/api/test/csrf.test.ts:37` - `expect(response.status, method).toBe(403)`; `:39` - `expect((await problem(response)).code, method).toBe('csrf_rejected')`; `:41` - `expect(executed).toBe(0)`; `:50` (sem linha em `sessions`). A prova passa em `/api/test/probe` e em `/api/auth/login`. **Contraexemplo rodado no processo real**: `POST /API/auth/login` com `Origin: https://outro.example` e credenciais certas respondeu `200` com cookie de sessão e criou linha em `sessions`; `POST /API/auth/logout` com a mesma origem respondeu `204` e apagou a sessão. Causa: `apps/api/src/csrf.ts:13` compara `req.path` com `/api` sensível a maiúsculas, e o roteador não. Ver F1 | FAIL |
| C23 | `POST /api` sem `Origin`: `403` `csrf_rejected` sem executar o handler quando `Sec-Fetch-Site` está ausente, é `cross-site` ou `same-site` | `api` -t `missing_origin_403_unless_same_origin` exit 0 | `apps/api/test/csrf.test.ts:63` - `expect(response.status, JSON.stringify(headers)).toBe(403)`; `:64` (`csrf_rejected`); `:66` - `expect(executed).toBe(0)` sobre os três casos de `:54-58`. **Contraexemplo rodado no processo real**: `POST /API/auth/login` sem `Origin` (sem `Sec-Fetch-Site`, e com `Sec-Fetch-Site: cross-site`) e credenciais certas respondeu `200` e criou sessão. Mesma causa da C22 (`apps/api/src/csrf.ts:13`). Ver F1 | FAIL |
| C24 | passam: `POST` com `Origin` igual; `POST` sem `Origin` com `same-origin`; `GET`, `HEAD`, `OPTIONS` com origem estranha | `api` -t `same_origin_and_safe_methods_pass` exit 0 | `apps/api/test/csrf.test.ts:83` - `expect(response.status, ...).toBeLessThan(300)`; `:84` - `expect(text, ...).not.toContain('csrf_rejected')`; `:85` - `expect(executed, ...).toBe(before + 1)` sobre os cinco casos de `:70-76` | PASS |
| C25 | `POST /api/auth/login` com origem estranha e corpo `{}`: `403` `csrf_rejected`, não `422` | `api` -t `origin_is_checked_before_body` exit 0 | `apps/api/test/csrf.test.ts:92` - `expect(response.status).toBe(403)`; `:93` - `expect((await problem(response)).code).toBe('csrf_rejected')` | PASS |
| C26 | stack real, pela origem do web: login com origem estranha `403` `csrf_rejected`; `GET /api/users` sem cookie `401` `unauthorized`; ambos problem+json | `stack` -t `running_api_rejects_foreign_origin_and_anonymous` exit 0 | `tests/stack/compose.test.ts:119` - `expect(foreign.status).toBe(403)`; `:120` (content-type); `:121` (`csrf_rejected`); `:124` - `expect(anonymous.status).toBe(401)`; `:125`; `:126` (`unauthorized`) | PASS |
| C27 | `two-factor/enable` com senha certa: `200`, `totpUri` `otpauth://totp/...`, ao menos um `backupCodes`, `twoFactorEnabled` segue `false` | `api` -t `enable_200_returns_uri_and_backup_codes` exit 0 | `apps/api/test/two-factor.test.ts:55` - `expect(response.status).toBe(200)`; `:56` - `expect(body.totpUri.startsWith('otpauth://totp/')).toBe(true)`; `:57` - `expect(body.backupCodes.length).toBeGreaterThanOrEqual(1)`; `:58` - `expect(await twoFactorEnabled(client)).toBe(false)` | PASS |
| C28 | `two-factor/confirm` com TOTP válido: `204`, `twoFactorEnabled` passa a `true` | `api` -t `confirm_204_turns_two_factor_on` exit 0 | `apps/api/test/two-factor.test.ts:69` - `expect(response.status).toBe(204)`; `:70` - `expect(await twoFactorEnabled(client)).toBe(true)` | PASS |
| C29 | login com 2FA ativo: `200`, exatamente `{"status":"two_factor_required"}`, nenhuma sessão | `api` -t `login_with_2fa_returns_two_factor_required` exit 0 | `apps/api/test/two-factor.test.ts:81` - `expect(response.status).toBe(200)`; `:82` - `expect(await response.json()).toStrictEqual({ status: 'two_factor_required' })`; `:83` - `expect(await sessionIds(user.id)).toEqual([])` | PASS |
| C30 | `two-factor/verify` com TOTP válido: `200` `authenticated`, cookie que recebe `200` na sessão | `api` -t `verify_totp_200_authenticates` exit 0 | `apps/api/test/two-factor.test.ts:92` - `expect(response.status).toBe(200)`; `:93` - `toStrictEqual({ status: 'authenticated' })`; `:94` (cookie `session_token`); `:95` - `expect((await client.get('/api/auth/session')).status).toBe(200)` | PASS |
| C31 | `backupCode` não usado autentica; o mesmo código depois: `401` `invalid_code` | `api` -t `backup_code_authenticates_once` exit 0 | `apps/api/test/two-factor.test.ts:104` - `expect(accepted.status).toBe(200)`; `:106` (cookie); `:111` - `expect(reused.status).toBe(401)`; `:112` - `expect((await problem(reused)).code).toBe('invalid_code')` | PASS |
| C32 | `verify` `401` `invalid_code` sem sessão em três casos: TOTP inválido, código de recuperação inexistente, sem login pendente | `api` -t `verify_401_invalid_code_in_three_cases` exit 0 | `apps/api/test/two-factor.test.ts:130` - `expect(response.status, name).toBe(401)`; `:131` - `expect((await problem(response)).code, name).toBe('invalid_code')`; `:132` - `expect(await sessionIds(user.id), name).toEqual([])` sobre os três casos de `:117-125` | PASS |
| C33 | admin sem 2FA: as 8 rotas restantes da `Surface` respondem `403` `two_factor_enrollment_required` | `api` -t `admin_without_2fa_gets_403_everywhere_else` exit 0 | `apps/api/test/enrollment.test.ts:46` - `expect(response.status, ...).toBe(403)`; `:47` - `expect((await problem(response)).code, ...).toBe('two_factor_enrollment_required')`; `:50` - `expect(blocked.map(...).sort()).toEqual([...8 rotas...].sort())`, conjunto lido de `stack.api.routes()` | PASS |
| C34 | as quatro isentas: sessão `200`, `enable` `200`, `confirm` `204`, `logout` `204` | `api` -t `four_exempt_routes_stay_reachable` exit 0 | `apps/api/test/enrollment.test.ts:68` - `expect(session.status).toBe(200)`; `:71` - `expect(enabled.status).toBe(200)`; `:75` - `expect(confirmed.status).toBe(204)`; `:78` e `:84` - `logout` `204` (a segunda com admin ainda sem 2FA, `:83`) | PASS |
| C35 | `twoFactorEnrollmentRequired`: `true` para admin sem 2FA, `false` para admin com 2FA e para `reception` | `api` -t `enrollment_required_only_for_admin_without_2fa` exit 0 | `apps/api/test/enrollment.test.ts:89` - `expect(await enrollmentRequired(admin.client)).toBe(true)`; `:92` - `.toBe(false)` depois do cadastro real; `:95` - `.toBe(false)` para `reception` | PASS |
| C36 | `two-factor/disable`: `204`, `twoFactorEnabled` `false`, linha de `two_factors` some | `api` -t `disable_204_deletes_secret_and_backup_codes` exit 0 | `apps/api/test/two-factor.test.ts:145` - `expect(response.status).toBe(204)`; `:146` - `expect(await twoFactorEnabled(client)).toBe(false)`; `:147` - `expect(await stack.query('select id from two_factors where user_id = $1', [user.id])).toEqual([])` | PASS |
| C37 | `422` com um item: `enable` e `disable` com senha errada (`password`), `confirm` com código inválido (`code`); `twoFactorEnabled` não muda | `api` -t `wrong_password_or_code_422_on_field` exit 0 | `apps/api/test/two-factor.test.ts:187` - `expect(response.status, route).toBe(422)`; `:189` - `expect(parsed.errors?.map((error) => error.path), route).toEqual([path])`; `:190` - `expect(await twoFactorEnabled(client), route).toBe(stays)` sobre os três casos de `:159-181` | PASS |
| C38 | 5 falhas alternando maiúsculas; o sexto login, com a senha certa: `429` `too_many_attempts`, `Retry-After` inteiro de 1 a 900 | `api` -t `fifth_failure_blocks_even_right_password` exit 0 | `apps/api/test/throttle.test.ts:79` - `await expectBlocked(sixth)`, que afirma `:40` `expect(response.status).toBe(429)`, `:42` a `:44` (`Retry-After` inteiro, de 1 a 900) e `:46` `expect(body.code).toBe('too_many_attempts')`; cinco grafias em `:72` | PASS |
| C39 | 15 min depois da quinta falha: `200`; a 14 min 59 s: `429` | `api` -t `block_ends_15_min_after_fifth_failure` exit 0 | `apps/api/test/throttle.test.ts:92` - `await expectBlocked(await login(user.email, user.password))` em `advance(5 * MINUTE + 15 * MINUTE - 1000)`; `:95` - `expect((await login(user.email, user.password)).status).toBe(200)` em `advance(5 * MINUTE + 15 * MINUTE)`, com a quinta falha aos 5 min (`:88-89`) | PASS |
| C40 | 4 falhas, 16 min, 1 falha: a última `401`, não `429` | `api` -t `failures_older_than_window_do_not_count` exit 0 | `apps/api/test/throttle.test.ts:106` - `expect(fifth.status).toBe(401)`; `:107` - `expect((await problem(fifth)).code).toBe('invalid_credentials')` | PASS |
| C41 | e-mail sem usuário: 5 x `401` `invalid_credentials`, a sexta `429` com `Retry-After`, corpo de mesma forma | `api` -t `unknown_email_blocks_identically` exit 0 | `apps/api/test/throttle.test.ts:115` - `await fail(unknown, 5)` (`:34` e `:35` afirmam `401` e `invalid_credentials` por tentativa); `:117` - `expectBlocked(blockedUnknown)`; `:121` - `expect({ ...unknownBody, requestId: '' }).toEqual({ ...existingBody, requestId: '' })` | PASS |
| C42 | 4 falhas, login autenticado, mais 4 falhas: a oitava `401` | `api` -t `successful_login_resets_counter` exit 0 | `apps/api/test/throttle.test.ts:128` - `expect((await login(user.email, user.password)).status).toBe(200)`; `:129` - `await fail(user.email, 4)`, cada uma `401` em `:34` | PASS |
| C43 | 5 códigos inválidos no `verify` bloqueiam o login seguinte com a senha certa | `api` -t `invalid_codes_count_on_login_counter` exit 0 | `apps/api/test/throttle.test.ts:138` e `:139` (`401` `invalid_code` nas cinco); `:142` - `await expectBlocked(await login(user.email, user.password))` | PASS |
| C44 | e-mail bloqueado: `verify` com TOTP válido responde `429` com `Retry-After`, sem sessão | `api` -t `verify_429_when_blocked` exit 0 | `apps/api/test/throttle.test.ts:152` - `await expectBlocked(response)`; `:153` - `expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toEqual([])` | PASS |
| C45 | 10 logins errados simultâneos: no máximo 5 `401`, `429` nos demais, somando 10 | `api` -t `ten_concurrent_failures_yield_at_most_five_401` exit 0 | `apps/api/test/throttle.test.ts:164` - `expect(unauthorized).toBeLessThanOrEqual(5)`; `:165` - `expect(unauthorized + blocked).toBe(10)` | PASS |
| C46 | segunda instância da API no mesmo banco responde `429` | `api` -t `block_survives_restart` exit 0 | `apps/api/test/throttle.test.ts:180` - `await expectBlocked(response)` contra `startApi(stack.postgres.url)` de `:173` | PASS |
| C47 | rota sem declaração, ou com `@Public()` e `@Roles('admin')` juntos: a subida sai com código 1 e imprime método e caminho | `api` -t `route_without_single_access_declaration_exits_1` exit 0 | `apps/api/test/boot.test.ts:125` - `expect(result.status, ...).toBe(1)`; `:126` - `expect(...).toContain(route)` com `'GET /api/undeclared'` e `'GET /api/double'` (`:113-114`). O processo é o `bootstrap` real com um controller a mais (`apps/api/test/fixtures/invalid-access.ts:32`) | PASS |
| C48 | matriz 3 declarações x 5 chamadores, 15 combinações, com `401`/`403` e handler não executado | `api` -t `guard_matrix_three_declarations_five_callers` exit 0 | `apps/api/test/access.test.ts:87` - `expect(response.status, ...).toBe(status)`; `:88` - `expect(body.code, ...).toBe(code)`; `:90` - `expect(executions.length - before, ...).toBe(status === 200 ? 1 : 0)`; `:94` - `expect(combinations).toBe(15)`; esperados literais em `:54-76` | PASS |
| C49 | `reception`, `hr_finance`, `instructor` nas cinco rotas `/api/users*`: `403` `forbidden`, nenhuma linha muda (15) | `api` -t `non_admin_403_on_every_users_route` exit 0 | `apps/api/test/access.test.ts:122` - `expect(response.status, ...).toBe(403)`; `:123` - `.toBe('forbidden')`; `:127` - `expect(combinations).toBe(15)`; `:128` - `expect(await snapshot()).toEqual(before)` | PASS |
| C50 | sem cookie, toda rota registrada responde `401` `unauthorized`, exceto exatamente três | `api` -t `only_three_routes_answer_without_session` exit 0 | `apps/api/test/access.test.ts:147` - `expect(open.sort()).toEqual(['GET /health', 'POST /api/auth/login', 'POST /api/auth/two-factor/verify'])`; `:141` a `:143` (as demais são `401` `unauthorized`); rotas lidas do roteador em `:132` | PASS |
| C51 | `POST /api/users`: `201` com os seis campos, sem senha; o usuário entra com a senha informada | `api` -t `create_user_201_and_user_can_log_in` exit 0 | `apps/api/test/users.test.ts:43` - `expect(response.status).toBe(201)`; `:44` - `expect(body).toStrictEqual({ id, name, email, role, active: true, twoFactorEnabled: false })`; `:55` - `expect(loggedIn.status).toBe(200)` | PASS |
| C52 | e-mail repetido com outras maiúsculas: `409` `email_taken`, contagem de `users` igual | `api` -t `duplicate_email_409_case_insensitive` exit 0 | `apps/api/test/users.test.ts:71` - `expect(response.status).toBe(409)`; `:72` - `.toBe('email_taken')`; `:73` - `expect(await stack.query('select id from users')).toHaveLength(before.length)` | PASS |
| C53 | `Ana.Lima@Exemplo.com` aparece como `ana.lima@exemplo.com` | `api` -t `email_is_stored_lowercase` exit 0 | `apps/api/test/users.test.ts:87` - `expect(listed.users.filter((user) => user.name === 'Ana Lima').map((user) => user.email)).toEqual(['ana.lima@exemplo.com'])` | PASS |
| C54 | `role` `owner` em `POST` e `PATCH`: `422` com `path` `role`; os quatro valores aceitos | `api` -t `role_accepts_only_the_four_values` exit 0 | `apps/api/test/users.test.ts:100` - `expect(response.status).toBe(422)`; `:101` - `expect(body.errors?.map((error) => error.path)).toEqual(['role'])`; `:112` (`POST` `201`) e `:116` (`PATCH` `200`) para os quatro perfis | PASS |
| C55 | `GET /api/users`: `200`, todos (ativos e inativos), em ordem alfabética, cada item com exatamente seis chaves | `api` -t `list_users_200_sorted_with_six_keys` exit 0 | `apps/api/test/users.test.ts:131` - `expect(response.status).toBe(200)`; `:132` (ids iguais aos do banco); `:133` (há inativo); `:135` - `expect(names).toEqual([...names].sort(new Intl.Collator('pt-BR').compare))`; `:139` - `expect(Object.keys(user).sort()).toEqual(['active', 'email', 'id', 'name', 'role', 'twoFactorEnabled'])` | PASS |
| C56 | `PATCH` só com `name`, só com `role`, só com `active`: `200` com o valor novo e o resto inalterado | `api` -t `patch_user_200_per_field` exit 0 | `apps/api/test/users.test.ts:159` - `expect(response.status, ...).toBe(200)`; `:160` - `expect(await response.json(), ...).toStrictEqual(expected)` sobre as três mudanças de `:153` | PASS |
| C57 | mudar `role` ou desativar: o cookie aberto recebe `401` e não resta linha em `sessions` | `api` -t `role_change_or_deactivation_ends_sessions` exit 0 | `apps/api/test/users.test.ts:174` - `expect((await client.get('/api/auth/session')).status, ...).toBe(401)`; `:175` - `expect(await sessionCount(user.id), ...).toBe(0)` para as duas mudanças de `:165` | PASS |
| C58 | `409` `last_admin` sem mudar nada, em três casos | `api` -t `last_admin_409_in_three_cases` exit 0 | `apps/api/test/users.test.ts:192` - `expect(response.status, name).toBe(409)`; `:193` - `.toBe('last_admin')`; `:194` - `expect(await row(only!.user.id), name).toEqual({ role: 'admin', active: true })`. Os três casos rodam com o administrador inativo já criado (`:181`): o 1º e o 3º são o mesmo estado, só muda o perfil de destino. Ver P3 | PASS |
| C59 | dois `PATCH` simultâneos sobre os dois últimos admins: um `200`, um `409` `last_admin`, resta um admin ativo | `api` -t `concurrent_removal_of_last_two_admins` exit 0 | `apps/api/test/users.test.ts:230` - `expect(statuses).toEqual([200, 409])`; `:232` - `.toBe('last_admin')`; `:233` - `expect(await stack.query("select id from users where role = 'admin' and active")).toHaveLength(1)` | PASS |
| C60 | admin redefine a senha: `204`, sessão do usuário `401`, login com a nova `200`, com a antiga `401` | `api` -t `admin_resets_password_204` exit 0 | `apps/api/test/users.test.ts:245` - `expect(response.status).toBe(204)`; `:246` (sessão `401`); `:247` (nova `200`); `:248` (antiga `401`); `:241` (12 caracteres) | PASS |
| C61 | admin zera o 2FA: `204`, `twoFactorEnabled` `false`, linha de `two_factors` some, sessão `401` | `api` -t `admin_resets_two_factor_204` exit 0 | `apps/api/test/users.test.ts:260` - `expect(response.status).toBe(204)`; `:261` a `:263` (`two_factor_enabled: false`); `:264` (`two_factors` vazio); `:265` - `expect((await client.get('/api/auth/session')).status).toBe(401)` | PASS |
| C62 | `:id` `abc` e `uuid` sem usuário nas três rotas: `404` `not_found` (6) | `api` -t `unknown_or_malformed_id_404` exit 0 | `apps/api/test/users.test.ts:280` - `expect(response.status, ...).toBe(404)`; `:281` - `.toBe('not_found')`; `:285` - `expect(combinations).toBe(6)` | PASS |
| C63 | `pnpm users:create-admin` com senha de 12: código 0, usuário ativo `admin`, imprime `id` e e-mail, não imprime a senha | `api` -t `creates_admin_exits_0_without_printing_password` exit 0 | `apps/api/test/create-admin.test.ts:28` - `expect(result.status, result.output).toBe(0)`; `:34` - `expect(rows[0]).toMatchObject({ role: 'admin', active: true, name: 'Administradora' })`; `:35` (id); `:36` (e-mail); `:37` - `expect(result.output).not.toContain(password)`. O comando roda de verdade: `apps/api/test/support/command.ts:11` | PASS |
| C64 | comando sai com 1, nomeia o motivo e não cria nada em seis casos | `api` -t `rejects_six_invalid_invocations` exit 0 | `apps/api/test/create-admin.test.ts:82` - `expect(result.status, ...).toBe(1)`; `:83` - `expect(result.output, name).toMatch(reason)`; `:85` - `expect(await counts(), name).toEqual(before)` (`users` e `accounts`); `:76` - `expect(cases).toHaveLength(6)` | PASS |
| C65 | depois de `pnpm db:migrate`: seis tabelas, nenhuma coluna `tenant_id` | `db` -t `six_identity_tables_and_no_tenant_id` exit 0 | `packages/database/test/schema.test.ts:49` - `expect(names).toContain(expected)` sobre as seis; `packages/database/test/schema.test.ts:55` - `expect(tenantColumns).toEqual([])` | PASS |
| C66 | nas cinco tabelas de identidade, linha sem `id` recebe `uuid` versão 7 | `db` -t `ids_default_to_uuidv7` exit 0 | `packages/database/test/schema.test.ts:86` - `expect(checked!.version, table).toBe(7)` por `uuid_extract_version`; `:79` - `expect(Object.keys(inserts)).toHaveLength(5)` | PASS |
| C67 | segundo `users` com o mesmo `email` falha por unicidade | `db` -t `users_email_is_unique` exit 0 | `packages/database/test/schema.test.ts:93` - `await expect(insertUser('unica@exemplo.com')).rejects.toMatchObject({ code: '23505' })` | PASS |
| C68 | `users.role` `owner` falha no banco | `db` -t `users_role_rejects_fifth_value` exit 0 | `packages/database/test/schema.test.ts:98` - `await expect(insertUser('dona@exemplo.com', 'owner')).rejects.toMatchObject({ code: '23514' })` | PASS |
| C69 | sem sessão, `/`, `/users`, `/account`, `/two-factor/setup` terminam em `/login` | `web` -g `anonymous_is_redirected_to_login` exit 0 | `apps/web/e2e/shell.spec.ts:10` - `await expect(page, path).toHaveURL('/login')` sobre os quatro caminhos de `:7` | PASS |
| C70 | `/login`: título "Entrar", campos "E-mail" e "Senha", botão "Entrar", `lang="pt-BR"` | `web` -g `login_page_shows_form_in_pt_br` exit 0 | `apps/web/e2e/login.spec.ts:14` - `expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible()`; `:15`; `:16`; `:17`; `:18` - `expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')` | PASS |
| C71 | depois do login: URL `/`, "Gestão de Academia", nome, "Sair" e o perfil por extenso para os quatro perfis | `web` -g `home_shows_name_and_role_label_for_four_roles` exit 0 | `apps/web/e2e/login.spec.ts:40` - `expect(page, role).toHaveURL('/')`; `:41`; `:42` (nome); `:43` - `expect(page.getByText(label, { exact: true }), role).toBeVisible()`; `:44`; rótulos literais em `:22-27` | PASS |
| C72 | login `401`: "E-mail ou senha incorretos.", e-mail mantido, senha vazia | `web` -g `login_401_shows_message_and_clears_password` exit 0 | `apps/web/e2e/login.spec.ts:54` - `expect(page.getByText('E-mail ou senha incorretos.', { exact: true })).toBeVisible()`; `:55` - `toHaveValue('digitado@exemplo.com')`; `:56` - `toHaveValue('')` | PASS |
| C73 | login `429`: "Muitas tentativas. Tente novamente em N minutos." com N 15, 2, 1 para 900, 61, 60 | `web` -g `login_429_shows_minutes_rounded_up` exit 0 | `apps/web/e2e/login.spec.ts:78` - `expect(page.getByText(...'Muitas tentativas. Tente novamente em ${minutes} minutos.'..., { exact: true }), ...).toBeVisible()` sobre os três casos de `:61-65` | PASS |
| C74 | `422` com um item: a `message` aparece junto do campo em quatro formulários | `web` -g `field_errors_shown_on_four_forms` exit 0 | `apps/web/e2e/forms.spec.ts:18` - `expect(page.getByLabel(form.field.label, { exact: true }), form.name).toHaveAccessibleDescription(message)`; `:19` (uma ocorrência); `:8` - `expect(forms).toHaveLength(4)`. Em `/two-factor/setup` e em `/users` só um dos formulários da tela é exercitado. Ver P2 | PASS |
| C75 | API pendurada por mais de 3 s e API `500`: a mensagem de indisponível em cinco telas, sem sair da tela (10) | `web` -g `unavailable_api_message_on_five_screens` exit 0 | `apps/web/e2e/forms.spec.ts:39` - `expect(page.getByText(UNAVAILABLE, { exact: true }), ...).toBeVisible({ timeout: 8000 })`; `:42` - `expect(page.url(), ...).toBe(url)`; `:46` - `expect(combinations).toBe(10)`. A prova aceita a mensagem em até 8 s; o teste levou 18,3 s para 5 casos pendurados. Ver P1 | PASS |
| C76 | enquanto a API não responde, o botão de envio fica desabilitado em cinco formulários | `web` -g `submit_disabled_while_pending_on_five_forms` exit 0 | `apps/web/e2e/forms.spec.ts:60` - `await expect(submit, form.name).toBeDisabled()`; `:56` (habilitado antes); `:62` (a requisição chegou); `:50` - `expect(FORMS).toHaveLength(5)`. Ver P2 | PASS |
| C77 | `two_factor_required`: URL `/login/two-factor`, campo "Código de 6 dígitos", link "Usar código de recuperação" | `web` -g `two_factor_required_shows_code_page` exit 0 | `apps/web/e2e/two-factor.spec.ts:16` - `await expect(page).toHaveURL('/login/two-factor')`; `:34` - `expect(page.getByLabel('Código de 6 dígitos')).toBeVisible()`; `:35` - `expect(page.getByRole('link', { name: 'Usar código de recuperação' })).toBeVisible()` | PASS |
| C78 | depois do link, o envio chega a `POST /api/auth/two-factor/verify` com `backupCode` e sem `code` | `web` -g `recovery_link_sends_backup_code` exit 0 | `apps/web/e2e/two-factor.spec.ts:49` - `expect(sent[0]!.method).toBe('POST')`; `:50` - `expect(sent[0]!.body).toEqual({ backupCode: 'aaaaa-11111' })`; `:51` - `expect(sent[0]!.body).not.toHaveProperty('code')` | PASS |
| C79 | `verify` `401`: "Código inválido." | `web` -g `verify_401_shows_invalid_code` exit 0 | `apps/web/e2e/two-factor.spec.ts:61` - `expect(page.getByText('Código inválido.', { exact: true })).toBeVisible()` | PASS |
| C80 | `twoFactorEnrollmentRequired` `true`: `/`, `/users`, `/account` terminam em `/two-factor/setup` | `web` -g `enrollment_required_redirects_three_pages` exit 0 | `apps/web/e2e/two-factor.spec.ts:72` - `await expect(page, path).toHaveURL('/two-factor/setup')` sobre os três caminhos de `:69` | PASS |
| C81 | `/two-factor/setup`: QR code que decodifica para o `totpUri`, o segredo em texto, o campo "Código de 6 dígitos" | `web` -g `setup_shows_qr_secret_and_code_field` exit 0 | `apps/web/e2e/two-factor.spec.ts:85` - `expect(decoded?.data).toBe(TOTP_URI)`; `:87` - `expect(page.getByText('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', { exact: true })).toBeVisible()`; `:88` | PASS |
| C82 | confirmado o cadastro: cada código e o aviso; recarregada, nenhum código | `web` -g `backup_codes_shown_exactly_once` exit 0 | `apps/web/e2e/two-factor.spec.ts:102` a `:104` (aviso literal); `:105` - `expect(page.getByText(code, { exact: true })).toBeVisible()` para os quatro; `:110` - `toHaveCount(0)` depois de `page.reload()` | PASS |
| C83 | `/users`: colunas "Nome", "E-mail", "Perfil", "Situação", "2FA" nesta ordem, linhas em ordem alfabética, "Ativo"/"Inativo", botão "Novo usuário" | `web` -g `users_table_columns_order_and_button` exit 0 | `apps/web/e2e/users.spec.ts:18` - `expect(headers.slice(0, 5)).toEqual(['Nome', 'E-mail', 'Perfil', 'Situação', '2FA'])`; `:24` - `expect(names).toEqual(['Álvaro Dias', 'bruno costa', 'Carla Nunes', 'Zuleica Prado'])`; `:26` - `expect(status).toEqual(['Ativo', 'Ativo', 'Inativo', 'Ativo'])`; `:27`. A tela tem uma sexta coluna, "Ações" (`:19`), que a AC 62 não lista | PASS |
| C84 | `/users` com `reception`: a mensagem de sem permissão e nenhum nome ou e-mail da lista | `web` -g `non_admin_sees_no_permission_and_no_data` exit 0 | `apps/web/e2e/users.spec.ts:37` - `expect(page.getByText('Você não tem permissão para acessar esta página.', { exact: true })).toBeVisible()`; `:40` e `:41` - `expect(content).not.toContain(user.name)`, `user.email` | PASS |
| C85 | link "Usuários" em `/` só para `admin` | `web` -g `users_link_only_for_admin` exit 0 | `apps/web/e2e/shell.spec.ts:27` - `expect(page.getByRole('link', { name: 'Usuários', exact: true }), role).toHaveCount(expected ? 1 : 0)` sobre os quatro perfis de `:15-20` | PASS |
| C86 | "Desativar", "Redefinir senha", "Zerar 2FA": diálogo com o nome, nenhuma escrita antes, uma depois | `web` -g `three_actions_confirm_naming_the_user` exit 0 | `apps/web/e2e/users.spec.ts:68` - `expect(dialog, button).toContainText(target.name)`; `:70` - `expect(api.writes(), ...).toEqual([])`; `:75` - `expect(api.writes().map(...), button).toEqual([write])` sobre as três ações de `:48-52` | PASS |
| C87 | `GET /api/users` `500`: a mensagem, "Tentar novamente", e a tabela depois | `web` -g `list_failure_shows_retry` exit 0 | `apps/web/e2e/users.spec.ts:85` - `expect(page.getByText('Não foi possível carregar os usuários.', { exact: true })).toBeVisible()`; `:87`; `:93` - `expect(page.getByRole('table')).toBeVisible()` depois de `retry.click()` | PASS |
| C88 | `/account`: troca de senha e "Ativar..." ou "Desativar verificação em duas etapas" conforme `twoFactorEnabled` | `web` -g `account_offers_password_and_2fa_toggle` exit 0 | `apps/web/e2e/account.spec.ts:17` a `:19` (formulário de senha); `:20` - `expect(page.getByText(offered, { exact: true }), offered).toBeVisible()`; `:21` - `expect(page.getByText(hidden, { exact: true }), hidden).toHaveCount(0)` nos dois casos de `:8-9` | PASS |
| C89 | "Sair": `POST /api/auth/logout` chega à API e a URL passa a `/login` | `web` -g `sign_out_calls_logout_and_goes_to_login` exit 0 | `apps/web/e2e/shell.spec.ts:41` - `await expect(page).toHaveURL('/login')`; `:42` - `expect(api.writes().map(...)).toEqual(['POST /api/auth/logout'])` | PASS |
| C90 | com sessão, `/login` termina em `/` | `web` -g `signed_in_user_leaves_login` exit 0 | `apps/web/e2e/shell.spec.ts:50` - `await expect(page).toHaveURL('/')` | PASS |
| C91 | login vazio: erro junto de "E-mail" e de "Senha", nenhuma requisição chega à API | `web` -g `empty_login_is_rejected_before_any_request` exit 0 | `apps/web/e2e/login.spec.ts:90` - `expect(page.getByLabel('E-mail')).toHaveAccessibleDescription(/\S/)`; `:91` (senha); `:92` - `expect(api.requests.filter((request) => request.path === '/api/auth/login')).toEqual([])`. O schema é o de contracts: `apps/web/src/app/login/login-form.tsx:16` | PASS |
| C92 | `packages/ui` é workspace com `tailwindcss` e `components.json`; `apps/web` declara as três dependências; `lint` e `typecheck` alcançam `packages/ui` | `repo` -t `ui_package_is_the_shared_interface_base` exit 0 | `tests/repo/repo.test.ts:117` - `expect(workspaceDirs()).toContain('packages/ui')`; `:120` (tailwindcss); `:121` (`components.json`); `:125` (três dependências); `:141` a `:143` (`@academia/ui#lint`, `@academia/ui#typecheck` na resolução do Turborepo) | PASS |
| C93 | stack de pé: `GET /` segue o redirecionamento e responde `200` em `/login` com o título "Entrar" | `stack` -t `home_redirects_to_login` exit 0 | `tests/stack/compose.test.ts:134` - `expect(response.url).toBe(...'/login')`; `:135` - `expect(response.status).toBe(200)`; `:136` - `expect(html).toMatch(/<h1[^>]*>Entrar<\/h1>/)` | PASS |
| C94 | `GET /api/openapi.json` com sessão: `200`, `openapi` começa por `3.1` | `api` -t `openapi_200_is_3_1` exit 0 | `apps/api/test/openapi.test.ts:31` - `expect(response.status).toBe(200)`; `:39` - `expect(body.openapi.startsWith('3.1')).toBe(true)` | PASS |
| C95 | `paths` do documento é igual ao conjunto de rotas registradas sob `/api` | `api` -t `paths_equal_registered_api_routes` exit 0 | `apps/api/test/openapi.test.ts:54` - `expect(documented.sort()).toEqual(registered.sort())`, com `registered` lido de `stack.api.routes()` em `:43` | PASS |
| C96 | o `requestBody` das nove rotas é igual a `z.toJSONSchema` do schema de contracts | `api` -t `request_bodies_come_from_contract_schemas` exit 0 | `apps/api/test/openapi.test.ts:76` - `expect(documented, ...).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(schema))))`; `:69` - nove; `:84` (nenhuma outra rota declara corpo) | PASS |
| C97 | Vitest da API mede `src/**` com limiar 70 de linhas e 70 de ramos, e o script `test` liga a cobertura | `repo` -t `api_coverage_thresholds_are_70_lines_and_branches` exit 0 | `tests/repo/repo.test.ts:104` - `expect(resolved?.coverage?.include).toEqual(['src/**'])`; `:105` - `expect(resolved?.coverage?.thresholds).toMatchObject({ lines: 70, branches: 70 })`; `:111` - `expect(api.scripts.test).toMatch(/^vitest run( .*)? --coverage( $)/)` (expressão abreviada aqui) | PASS |
| C98 | clone limpo com arquivo sem teste em `apps/api/src`: `pnpm verify` sai diferente de 0 | `gate` -t `verify_fails_below_70_percent_coverage` exit 0 | `tests/stack/verify.test.ts:126` - `expect(broken.status).not.toBe(0)`; `:129` - `expect(failed.map((t) => t.taskId), ...).toEqual(['@academia/api#test'])`; `:130` (mensagem do limiar de cobertura na saída) | PASS |
| C99 | um login gera exatamente uma linha `auth.*` com `requestId` igual ao cabeçalho, em quatro casos | `api` -t `login_outcomes_log_one_line_each` exit 0 | `apps/api/test/auth-log.test.ts:73` - `expect(authLines, msg).toHaveLength(1)`; `:74` - `expect(authLines[0], msg).toMatchObject({ msg, requestId })`; `:75` e `:76` (`userId` presente ou ausente); os quatro casos, literais, em `:56-61` | PASS |
| C100 | percorridos cinco caminhos, nenhuma linha escrita pelo processo contém nenhum dos seis valores | `api` -t `six_secrets_never_reach_the_log` exit 0 | `apps/api/test/auth-log.test.ts:129` - `expect(written.includes(value), ...).toBe(false)`. `written` é só o que passou pelos espiões de `:25` e `:26` (`process.stdout.write`, `process.stderr.write`); as linhas que o Better Auth escreve por `console` não entram nela (rodado com e sem `--disableConsoleIntercept`). No processo real, com o banco de pé, os cinco caminhos não vazaram nada (sonda). **Com uma consulta falhando, o processo real escreveu o e-mail digitado no login e o token da sessão no stderr** (`apps/api/src/problem.filter.ts:88`). Ver F2 | FAIL |
| C101 | cada um dos dez `code` da door 9: problem+json, `X-Request-Id` igual ao `requestId`, valida contra o schema de erro | `api` -t `ten_new_codes_match_problem_schema` exit 0 | `apps/api/test/contracts.test.ts:101` - `expect(body.code, code).toBe(code)`; `:102` (content-type); `:104` - `expect(response.headers.get('x-request-id'), code).toBe(body.requestId)`; `:105` - `expect(problemSchema.safeParse(body).success, code).toBe(true)`; `:94` - dez códigos distintos | PASS |
| C102 | o corpo de sucesso de cada uma das sete rotas valida contra o schema de resposta | `api` -t `seven_success_bodies_match_contract_schemas` exit 0 | `apps/api/test/contracts.test.ts:169` - `expect(response.status, route).toBe(status)`; `:170` - `expect(parsed.success, ...).toBe(true)`; `:162` - `expect(cases).toHaveLength(7)` | PASS |

Por alvo, em `1d5598f`: `api` exit 0, 68 aprovados, 0 reprovados (5 testes da `fundacao` filtrados
pelo `-t`), 28,6 s · `db` exit 0, 4 aprovados · `repo` exit 0, 2 aprovados · `web` exit 0, 24
aprovados, 34,3 s · `stack` exit 0, 3 aprovados, 55,2 s · `gate` exit 0, 1 aprovado, 131,6 s.
102 testes nomeados, cada um listado individualmente como aprovado. Todos os arquivos de prova
estão no diff `41766a8..1d5598f` (criados ou editados pela feature).

## Findings

Ordenados por gravidade. F1 e F2 reprovam checks. F3 em diante não reprovam nenhuma linha.

### F1 - a checagem de origem é contornada por um caminho escrito com outras maiúsculas (C22, C23; AC 16, AC 17, door 8)

`apps/api/src/csrf.ts:13` decide se a requisição está sob `/api` com
`req.path === '/api' || req.path.startsWith('/api/')`, sensível a maiúsculas. O roteador do Express
casa `/API/auth/login` com a rota `/api/auth/login`. O middleware deixa passar e o handler roda.

Rodado contra `node apps/api/dist/main.js` (construído em `1d5598f`), Postgres 18 real migrado por
`pnpm db:migrate`, administrador criado por `pnpm users:create-admin`, `WEB_ORIGIN=http://localhost:3000`:

| Requisição | Cabeçalhos | Observado |
| --- | --- | --- |
| `POST /api/auth/login`, credenciais certas | `Origin: https://outro.example` | `403` `csrf_rejected`, 0 sessões (controle) |
| `POST /API/auth/login`, credenciais certas | `Origin: https://outro.example` | `200` `{"status":"authenticated"}`, cookie de sessão, 1 linha nova em `sessions` |
| `POST /API/auth/login`, credenciais certas | sem `Origin`, sem `Sec-Fetch-Site` | `200`, cookie de sessão, 1 linha nova em `sessions` |
| `POST /API/auth/login`, credenciais certas | sem `Origin`, `Sec-Fetch-Site: cross-site` | `200`, cookie de sessão, 1 linha nova em `sessions` |
| `POST /api/auth/logout` com cookie de sessão válido | `Origin: https://outro.example` | `403`, sessão mantida (controle) |
| `POST /API/auth/logout` com cookie de sessão válido | `Origin: https://outro.example` | `204`, a linha da sessão foi apagada |
| `POST /Api/Auth/Login`, corpo `{}` | `Origin: https://outro.example` | `422` `validation_failed` (passou da checagem) |
| `POST /api/AUTH/LOGIN`, corpo `{}` | `Origin: https://outro.example` | `403` `csrf_rejected` (só o prefixo decide) |

Alcance, para não exagerar: isto foi rodado direto na porta da API. Pela origem do web não rodei;
o repasse do Next casa `/api/*` com diferença de maiúsculas no container Linux, então é provável
que `/API/...` nem chegue à API por ali, mas não tenho prova. O `compose.yaml:48` publica a porta da
API em `127.0.0.1`. O cookie de sessão é `SameSite=Lax`, o que limita o que um site de fora
consegue mandar. Nada disso muda o veredito das linhas: a C22 afirma que o handler não executa e que
um login certo com origem estranha não cria sessão, e a C23 afirma o mesmo sem `Origin`; os dois
foram falsificados com o processo real.

A guarda de acesso não tem o mesmo defeito: ela é aplicada por rota, e `/API/users` sem cookie
continua `401` (não é contraexemplo de C50).

### F2 - o e-mail digitado no login e o token da sessão chegam ao log quando uma consulta falha (C100; AC 74)

AC 74: "manter fora de **toda** linha de log a senha, o código TOTP, o código de recuperação, o
valor do cookie de sessão, o `AUTH_SECRET` e o e-mail digitado no login".

Rodado contra `node apps/api/dist/main.js` com `DATABASE_URL` apontando para uma porta fechada (o
caso que o `Swept` chama de "banco fora numa rota `/api`"):

| Requisição | Resposta | O que o processo escreveu |
| --- | --- | --- |
| `POST /api/auth/login` com `email` `email.digitado.na.sonda@exemplo.com` | `500` `internal_error` problem+json | stderr, linha JSON `msg: "unhandled exception"`, campo `error`: `Error: Failed query: select "id", "email", "active" from "users" where "users"."email" = $1` seguido de `params: email.digitado.na.sonda@exemplo.com` |
| `GET /api/users` com cookie `__Secure-better-auth.session_token` assinado com o `AUTH_SECRET` | `500` `internal_error` problem+json | stderr, texto do Better Auth `ERROR [Better Auth]: INTERNAL_SERVER_ERROR DrizzleQueryError: Failed query: select ... from "sessions" where "sessions"."token" = $1` seguido de `params: <o token da sessão>` |

A senha e o `AUTH_SECRET` não apareceram em nenhuma das duas. O valor inteiro do cookie
(`token.assinatura`) também não; o que aparece é o token, a parte que identifica a sessão no banco -
a própria prova da C100 trata o token como segredo (`apps/api/test/auth-log.test.ts:109`).

Duas origens no código:

- `apps/api/src/problem.filter.ts:82-90` escreve `exception.stack` de todo `5xx`. A mensagem de erro
  do Drizzle carrega os parâmetros da consulta. A linha existe desde a `fundacao`; passou a vazar
  dado com as consultas desta feature (`apps/api/src/users/users.service.ts:37-43`, chamada com o
  e-mail digitado em `apps/api/src/auth/auth.controller.ts:70`).
- O logger do próprio Better Auth escreve o erro da consulta, com os parâmetros, direto no stderr.
  `apps/api/src/auth.ts` não configura esse logger.

Por que a prova não pega, além de não percorrer esse caminho: a captura de
`apps/api/test/auth-log.test.ts:25-26` espia `process.stdout.write` e `process.stderr.write`, e o
Vitest intercepta o `console` antes disso. Rodei a prova dos dois jeitos: no modo padrão a linha
`WARN [Better Auth]: Invalid password` aparece no relatório do Vitest atribuída ao teste (logo, não
foi engolida pelo espião); com `--disableConsoleIntercept` ela some do relatório (foi capturada).
No modo em que o check a roda, nenhuma linha do Better Auth entra em `written`.

Para separar as duas coisas: nos cinco caminhos que a C100 enumera, com o banco de pé, o processo
real não vazou nada. Sondei `dist/main.js` com Postgres real por login com senha errada, login com
e-mail inexistente, login autenticado, cadastro do TOTP, código inválido, verificação por TOTP,
verificação por código de recuperação e troca de senha: senha, senha errada, senha nova,
`AUTH_SECRET`, e-mail (como digitado e em minúsculas), segredo TOTP, códigos TOTP, código de
recuperação, valor do cookie e token da sessão não apareceram na saída. O processo escreveu duas
linhas fora de JSON nesse percurso (`WARN [Better Auth]: Invalid password` e
`WARN [Better Auth]: User not found`), sem dado.

### F3 - a linha `502`/`504` da `Surface`, acrescentada no Build, não tem check, linha de `Coverage` nem teste

`plan.md:110` declara: qualquer rota `/api` pela origem do web, com a API fora do ar, responde
`application/problem+json` escrito pelo web com `code` `bad_gateway` ou `gateway_timeout`, status
`502` ou `504`. O código está em `apps/web/src/app/api/[...path]/route.ts:49-52`. Busquei
`bad_gateway` e `gateway_timeout` em `apps`, `packages`, `tests` e em `checks.md`: só aparecem no
arquivo de código e na linha do plano. Nenhuma prova afirma esses status, esses códigos, nem o
prazo de 10 s de `route.ts:8`. Os dois códigos também não estão na lista de códigos novos da
door 9. No profile `light` o `Coverage` não é recomputado, então isto não reprova linha; fica
registrado porque a superfície mudou depois dos checks aprovados.

### P1 - lacuna de precisão: a C75 não fixa quando a mensagem aparece

A AC 55 diz "não responde em 3 s". A C75 diz "API pendurada por mais de 3 s" e a prova espera a
mensagem por até 8 s (`apps/web/e2e/forms.spec.ts:39-41`). Um prazo de 7 s passaria. O valor está no
código (`apps/web/src/lib/api.ts:7`, `TIMEOUT_MS = 3000`) e a duração do teste é compatível com ele
(18,3 s para 5 casos pendurados e 5 de `500`), mas nenhuma asserção mede o limite.

### P2 - lacuna de precisão: "cinco formulários" e "quatro formulários" contam um por tela, e as telas têm mais

C74, C75 e C76 enumeram login, segundo fator, cadastro do 2FA, usuário e troca de senha, e a prova
exercita um envio de cada (`apps/web/e2e/support/forms.ts:17-80`). A AC 56 fala de "um formulário"
qualquer e a AC 55 da "tela em que a ação foi feita". Envios que existem no código e que nenhuma
dessas três provas exercita com erro por campo, API fora ou botão desabilitado:

- o segundo passo de `/two-factor/setup`, "Confirmar" (`apps/web/src/app/two-factor/setup/two-factor-setup.tsx:98`), que é justamente o que recebe `422` com `path` `code` (C37);
- ativar/desativar 2FA em `/account` (`apps/web/src/app/account/two-factor-toggle.tsx:38`);
- "Redefinir senha" em `/users` (`apps/web/src/app/users/users-panel.tsx:182`);
- as confirmações de "Desativar" e "Zerar 2FA" (`apps/web/src/app/users/users-panel.tsx:116`, `:125`);
- "Sair" (`apps/web/src/components/sign-out-button.tsx:12`).

Li no código que todos têm `disabled` ligado ao envio pendente; não rodei nenhum deles.

### P3 - amostragem: os casos 1 e 3 da C58 são o mesmo estado

A prova cria o administrador inativo antes dos três casos (`apps/api/test/users.test.ts:181`). O
caso "tirar o perfil do único administrador ativo" e o caso "tirar o perfil com o outro
administrador inativo" rodam no mesmo banco e só diferem no perfil de destino (`reception`,
`hr_finance`). O estado "não existe outro administrador, ativo ou não" não é exercitado. Li
`apps/api/src/users/users.service.ts:75-87`: a regra conta administradores ativos, então o estado
que faltou é o mais simples dos dois. Não reprova: os três casos como escritos são afirmados.

### Observações menores

- C13: para `GET` a asserção de `Origin` é a ausência (`apps/web/e2e/proxy.spec.ts:79`); o repasse
  de `Origin` é provado em 4 dos 5 métodos, o que é o comportamento do navegador.
- C73: a tela diz "em 1 minutos" (`apps/web/src/lib/api.ts:60`). É o texto literal do check; o
  Handoff já avisa.
- C83: a tabela tem a coluna "Ações" além das cinco da AC 62 (`apps/web/e2e/users.spec.ts:19`).
- AC 73 pede a linha `auth.*` em JSON, e ela é. O processo também escreve linhas do Better Auth que
  não são JSON (ver F2). Nenhum critério trata disso.
- `apps/api/src/auth/auth.controller.ts:253-268`: o usuário do login pendente é lido do cookie
  `two_factor` sem conferir a assinatura, e a tentativa é contada no bloqueio
  (`auth.controller.ts:105`) antes de o Better Auth conferi-la. Para contar falhas contra outra
  conta seria preciso conhecer o identificador da verificação, que é aleatório. Não testei.
- `stack.session('admin')` marca `two_factor_enabled` por SQL
  (`apps/api/test/support/stack.ts:69`), sem segredo TOTP. É o "admin com 2FA" da C48 e o
  administrador que opera nas provas de `apps/api/test/users.test.ts`. Não segui o fixture além
  disso.

## Level and sampling judgment

- Nível: toda afirmação que nomeia status, rota ou forma de resposta tem prova que cruza a
  fronteira. As de `apps/api` passam por HTTP contra a aplicação montada com o mesmo `AppModule` e
  `configureApp` do processo real (`apps/api/test/support/app.ts:28-36`) sobre Postgres real. C14 e
  C47 usam o processo construído (`dist/main.js` e o mesmo `bootstrap`). C63, C64 e a parte do
  comando na C9 rodam `pnpm users:create-admin` de verdade. C65 a C68 rodam contra o banco migrado
  por `pnpm db:migrate`. C13 e C69 a C91 passam pelo navegador contra o Next construído, com a API
  falsa que os checks declaram. C16, C26 e C93 passam pelo processo real da stack. Não encontrei
  lacuna de nível.
- Amostragem: as provas que afirmam N casos são guiadas por tabela e travam a contagem
  (`toHaveLength`, `combinations`): C9 (4), C12 (3 x 4), C14 (4), C21 (9), C22 (4), C23 (3),
  C24 (5), C32 (3), C33 (8, lidas do roteador), C37 (3), C48 (15), C49 (15), C62 (6), C64 (6),
  C66 (5), C69 (4), C71 (4), C73 (3), C74 (4), C75 (10), C76 (5), C80 (3), C85 (4), C86 (3),
  C96 (9), C99 (4), C101 (10), C102 (7). As exceções estão em P2 e P3.
- C33, C50 e C95 leem as rotas do roteador do Express em execução
  (`apps/api/test/support/app.ts:41-48`), não de uma lista escrita no teste; a C33 ainda compara o
  conjunto com as 8 rotas nomeadas no check.
- As provas com tempo (C5, C7, C8, C39, C40) congelam só o `Date` do processo
  (`apps/api/test/session.test.ts:21`, `apps/api/test/throttle.test.ts:25`); nenhuma espera o tempo
  passar.
- O que este profile não entrega: nenhuma falha foi injetada, então não sei quais dessas asserções
  sobreviveriam a uma implementação errada. F1 e F2 são exatamente esse tipo de caso, achado por
  sonda e não por mutação.

## Swept

Linhas que resolvem para código existente, relidas contra o código e rodadas:

- "dependency failure: banco fora numa rota `/api` cai no `500 internal_error` do `ProblemFilter`
  e no `503` de `/health`": confirmado no processo real. Com o banco recusando conexão,
  `POST /api/auth/login` respondeu `500` problem+json com `code` `internal_error`, `GET /api/users`
  com cookie assinado respondeu `500` `internal_error`, e `GET /health` respondeu `503` com
  `{"status":"degraded","checks":{"database":"down"}}`. O código é
  `apps/api/src/problem.filter.ts:41-45` (status) e `:10` (código). A restrição citada está lá; o
  mesmo caminho é o do F2.
- Nota do `Coverage`: "`fundacao` C1, C5 e C8 seguem valendo e passam a cobrir o healthcheck do
  `web` e as chaves `AUTH_SECRET` e `WEB_ORIGIN`": rodei as três em `1d5598f`, fora das 102.
  `up_wait_exits_zero_with_three_healthy` passou (os três serviços `healthy`, com `/` redirecionando
  para `/login`); `missing_var_exits_1_naming_it` passou com as chaves novas em `requiredKeys`
  (`apps/api/src/env.ts:7`, `:9`); `env_example_lists_every_required_key` passou
  (`.env.example:18`, `.env.example:21`).
- Nota "`GET /health` aberto e na raiz: `fundacao` C2 prova o `200`": `health_ok_200` e
  `health_503_when_db_refuses` passaram em `1d5598f`.
- `Observable`, documento `.env.example`, marcado `existing`: coberto pelo item acima.
- As demais linhas de `Swept` nomeiam checks desta feature (julgados na tabela) ou são política
  aprovada (`n/a`, e a ausência de limpeza de linhas vencidas, "levado à revisão"): nada no código
  para conferir.

## Coverage

Não é recomputado no profile `light`. Li a tabela do autor sem refazer a junção; o que encontrei
fora dela está em F3.

## Test policy rows

No profile `light` não há veredito por linha; `checks.md` diz o mesmo. As linhas valeram como regra
de escrita das provas, e o nível está julgado acima.

## Faults injected

Não roda no profile `light`. Nenhuma mutação foi feita na árvore.

## Probes

Fora das 102 provas, tudo contra o `dist` construído em `1d5598f` pelo `globalSetup` das provas da
API. Os scripts ficaram fora do repositório, na pasta temporária da sessão.

- Banco recusando conexão, `dist/main.js`: resultados em F2 e em `## Swept`.
- Postgres 18 real (container próprio, removido ao fim), migrado e com administrador criado pelos
  comandos do repositório, `dist/main.js`: os cinco caminhos da C100 (resultado em F2) e as
  requisições com caminho em outras maiúsculas (resultado em F1).
- `vitest run test/auth-log.test.ts -t six_secrets_never_reach_the_log`, com e sem
  `--disableConsoleIntercept`: passou nos dois; a diferença observada está em F2.
- `verify_exits_zero_on_clean_clone` e `verify_runs_four_tasks_across_workspaces` (da `fundacao`):
  passaram em `1d5598f` - `pnpm verify` sai com 0 num clone limpo, com a cobertura ligada.

## Steps not run

- Passo 1 (fontes binding), recomputação do `Coverage`, vereditos de `Test policy` e passo 4
  (injeção de falhas): são dos profiles `standard` e `ui`.
- Passo 5 (percorrer o fluxo com o usuário): não há usuário na sessão do Verifier. As telas foram
  julgadas só pelas provas; texto, ordem e presença de controles estão afirmados, composição e
  aparência não.

## Tree state

`git status --porcelain` antes e depois das provas e sondas: só `?? CLAUDE.md`, que já estava lá.
Nenhum arquivo de `apps/`, `packages/` ou `tests/` foi alterado, nada foi commitado, nenhum
`git stash` ou `reset`. `apps/api/dist` (ignorado pelo git) foi reconstruído pelas provas. Os
arquivos que este Verifier escreveu: este relatório e, pelo `lessons.py`, `.specs/lessons.json` e
`.specs/LESSONS.md`. Nenhum container ou projeto do Compose ficou para trás e as portas 3100 e 3199
estão livres.

## Gate

`api` + `db` + `repo` + `web` + `stack` + `gate` em `1d5598f` (6 invocações, cada uma exit 0) - 102 passed, 0 failed. 99 de 102 checks provados com evidência localizada; C22, C23 e C100 reprovados por contraexemplo rodado no processo real, apesar da prova verde.
