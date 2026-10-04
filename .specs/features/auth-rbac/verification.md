# Autenticação e controle de acesso por perfil verification

**Verdict**: FAIL
**Profile**: light
**Diff range**: 41766a8..328dda1497286095f7706ab372471d46777ad4df
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

As 102 provas nomeadas em `checks.md` foram rodadas de novo em `328dda1` e as 102 passaram, cada
teste listado individualmente. 97 dos 102 checks estão provados com evidência localizada.

O que a rodada 1 reprovou está fechado, com evidência do processo real (`apps/api/dist/main.js`
construído em `328dda1`, Postgres 18 real):

- **C22 e C23** (F1): as oito requisições da rodada 1 com o caminho em outras maiúsculas respondem
  agora `403` `csrf_rejected`, sem sessão criada nem apagada. Em 179 requisições com origem estranha
  ou sem origem, por 33 grafias de caminho e pelas 10 rotas de escrita, nenhuma chegou a um handler.
- **C100** (F2): com o banco recusando conexão, as duas requisições da rodada 1 deixam no log a
  consulta que falhou e nenhum parâmetro. Em 12 situações, 232 valores procurados, nenhum encontrado.

O veredito é FAIL por cinco checks que a rodada 1 tinha aprovado e que caíram por contraexemplo
novo, achado ao sondar os caminhos de erro que a correção tocou. São três defeitos, todos em código
que a correção não mexeu (existiam em `1d5598f`), e nenhum vaza segredo, cria sessão ou altera dado:

- **C3 e C41** (AC 2, AC 29): login com um e-mail inexistente de cerca de 2,7 mil caracteres ou
  mais, que o schema aceita, responde `500` em vez de `401`, e esse e-mail nunca é bloqueado (N1).
- **C51 e C56** (AC 37, AC 40): `POST /api/users` e `PATCH /api/users/:id` com dados que o schema
  aceita - e-mail de 3 mil caracteres, nome com `U+0000` - respondem `500` (N1, N2).
- **C32** (AC 23): `POST /api/auth/two-factor/verify` sem login pendente, com um cookie `two_factor`
  forjado, responde `500` em vez de `401` (N3).

Nada disso foi inferido: cada ponto foi executado. Achados, o destino de cada achado da rodada 1 e
o que achei suspeito mesmo onde o check passou estão em `## Findings`.

## Scope of this round

Rodada com escopo, como manda "Re-verifying after a fix". Cada seção diz de onde vem:

| Parte | Origem |
| --- | --- |
| As 102 provas | verified at 328dda1 - todas rodadas de novo, por alvo |
| C22, C23, C100 (não eram PASS) | verified at 328dda1 - rejulgadas contra o código e com as sondas da rodada 1 refeitas e ampliadas |
| C13, C24, C25, C74, C75, C76, C99 (provas em arquivos que a correção tocou) | verified at 328dda1 - citações refeitas |
| C3, C32, C41, C51, C56 | verified at 328dda1 - contraexemplo novo desta rodada |
| As outras 87 linhas da tabela | carried from 1d5598f - a evidência é a da rodada 1; a prova foi rodada de novo |
| `## Level and sampling judgment`, `## Swept` | carried from 1d5598f, salvo os itens marcados |
| `## Findings`, `## Fix diff`, `## Probes`, `## Gate`, `## Tree state` | verified at 328dda1 |

A correção são dois commits depois do relatório da rodada 1 (`ed57a4b`, só `.specs`): `ff3a98c` e
`328dda1`. `git diff 1d5598f..328dda1 -- . ':(exclude).specs'` toca 8 arquivos, lidos inteiros:
`apps/api/src/auth.ts`, `apps/api/src/csrf.ts`, `apps/api/src/log-safe.ts` (novo),
`apps/api/src/problem.filter.ts`, `apps/api/test/auth-log.test.ts`, `apps/api/test/csrf.test.ts`,
`apps/web/e2e/forms.spec.ts` e `apps/web/e2e/proxy.spec.ts`. `plan.md` e `checks.md` não mudaram.

## Binding sources

Não roda no profile `light` (passo 1 é do profile `ui`). O plano não marca nenhuma fonte como
binding.

## Checks

As provas foram agrupadas por alvo, uma invocação por alvo, rodadas da raiz do repositório em
`328dda1`, com reporter que lista cada teste pelo nome. Nenhum filtro ficou sem teste: cada um dos
102 nomes aparece uma única vez como aprovado.

```
api    = pnpm --filter "./apps/api" exec vitest run test/access.test.ts test/auth-log.test.ts test/better-auth.test.ts test/boot.test.ts test/contracts.test.ts test/create-admin.test.ts test/csrf.test.ts test/enrollment.test.ts test/login.test.ts test/openapi.test.ts test/password.test.ts test/session.test.ts test/throttle.test.ts test/two-factor.test.ts test/users.test.ts test/validation.test.ts --reporter=verbose -t "<68 nomes unidos por |>"
db     = pnpm --filter "./packages/database" exec vitest run test/schema.test.ts --reporter=verbose -t "<4 nomes>"
repo   = pnpm --filter "./tests/repo" exec vitest run repo.test.ts --reporter=verbose -t "<2 nomes>"
web    = pnpm --filter "./apps/web" exec playwright test e2e/account.spec.ts e2e/forms.spec.ts e2e/login.spec.ts e2e/proxy.spec.ts e2e/shell.spec.ts e2e/two-factor.spec.ts e2e/users.spec.ts --reporter=list -g "<24 nomes>"
stack  = pnpm --filter "./tests/stack" exec vitest run compose.test.ts --reporter=verbose -t "<3 nomes>"
gate   = pnpm --filter "./tests/stack" exec vitest run verify.test.ts --reporter=verbose -t "verify_fails_below_70_percent_coverage"
```

Na coluna `Proof run`, `api -t nome` quer dizer: o teste `nome` apareceu como aprovado na saída da
invocação `api` desta rodada, que saiu com código 0. Na coluna `Evidence`, cada célula começa por
`verified at 328dda1` ou `carried from 1d5598f`; uma citação `:NN` sem caminho continua no arquivo
citado imediatamente antes, na mesma célula. As citações `carried` são de arquivos que o diff da
correção não toca, então os números de linha são os mesmos.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `signInEmail` por `auth.api` com 2FA não cria sessão; `verifyTOTP` cria exatamente uma e o cookie resolve o usuário | `api` -t `two_factor_via_auth_api_with_return_headers` exit 0 | carried from 1d5598f: `apps/api/test/better-auth.test.ts:79` - `expect(await sessionRows()).toEqual([])`; `apps/api/test/better-auth.test.ts:87` - `expect(await sessionRows()).toEqual([{ user_id: user.id }])`; `apps/api/test/better-auth.test.ts:92` - `expect(session?.user.id).toBe(user.id)` | PASS |
| C2 | login sem 2FA: `200`, exatamente `{"status":"authenticated"}`, linha em `sessions`, cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain` | `api` -t `login_200_authenticated_with_session_cookie` exit 0 | carried from 1d5598f: `apps/api/test/login.test.ts:19` - `expect(response.status).toBe(200)`; `apps/api/test/login.test.ts:20` - `expect(await response.json()).toEqual({ status: 'authenticated' })`; `apps/api/test/login.test.ts:21` (uma linha em `sessions`); `apps/api/test/login.test.ts:29` a `:32` - `expect(attributes).toContain('httponly')`, `'secure'`, `'samesite=lax'`, `'path=/'`; `apps/api/test/login.test.ts:33` - `expect(attributes.filter((attribute) => attribute.startsWith('domain'))).toEqual([])` | PASS |
| C3 | e-mail inexistente, senha errada e usuário inativo: `401` `invalid_credentials`, sem `Set-Cookie`, corpos idênticos salvo `requestId` | `api` -t `login_401_identical_for_three_causes` exit 0 | verified at 328dda1: `apps/api/test/login.test.ts:50` - `expect(response.status).toBe(401)`; `apps/api/test/login.test.ts:51` - `expect(body.code).toBe('invalid_credentials')`; `:53`; `:57` e `:58` (arquivo intocado pela correção; a prova passa). **Contraexemplo novo, rodado no processo real**: `POST /api/auth/login` com um e-mail inexistente de 2.700 caracteres não compressíveis, que o schema aceita (`packages/contracts/src/auth.ts:16`, sem tamanho máximo), respondeu `500` `internal_error`, não `401`. Causa no log: `index row size 2712 exceeds btree version 4 maximum 2704 for index "login_throttles_pkey"` (`apps/api/src/auth/throttle.ts:22`, `packages/database/src/schema.ts:98`). Com 2.600 caracteres: `401`. Ver N1 | FAIL |
| C4 | `GET /api/auth/session` com cookie válido: `200` com os cinco campos de `user` e `twoFactorEnrollmentRequired`, e nenhuma outra chave | `api` -t `session_200_returns_user_fields` exit 0 | carried from 1d5598f: `apps/api/test/session.test.ts:34` - `expect(response.status).toBe(200)`; `apps/api/test/session.test.ts:35` - `expect(await response.json()).toStrictEqual({ user: { id, name, email, role: 'reception', twoFactorEnabled: false }, twoFactorEnrollmentRequired: false })` | PASS |
| C5 | sem cookie, cookie adulterado e sessão expirada: `401` `unauthorized` nos três | `api` -t `session_401_without_valid_session` exit 0 | carried from 1d5598f: `apps/api/test/session.test.ts:49` e `:50` (sem cookie), `:57` e `:58` (adulterado), `:64` e `:65` (expirada) - `expect(expired.status).toBe(401)`, `expect(await code(expired)).toBe('unauthorized')` | PASS |
| C6 | logout: `204`, linha da sessão some, o mesmo cookie recebe `401` | `api` -t `logout_204_deletes_session_row` exit 0 | carried from 1d5598f: `apps/api/test/session.test.ts:75` - `expect(response.status).toBe(204)`; `apps/api/test/session.test.ts:76` - `expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toEqual([])`; `apps/api/test/session.test.ts:78` - `expect(reused.status).toBe(401)` | PASS |
| C7 | sessão com último uso há 30 min recebe `401` | `api` -t `session_expires_after_30_min_idle` exit 0 | carried from 1d5598f: `apps/api/test/session.test.ts:89` - `expect(response.status).toBe(401)` depois de `advance(30)`; `apps/api/test/session.test.ts:90` - `expect(await code(response)).toBe('unauthorized')` | PASS |
| C8 | sessão usada aos 29 min responde `200` aos 58 min | `api` -t `session_slides_on_use` exit 0 | carried from 1d5598f: `apps/api/test/session.test.ts:98` - `expect((await client.get('/api/auth/session')).status).toBe(200)` em `advance(29)`; `apps/api/test/session.test.ts:101` - a mesma expressão em `advance(58)` | PASS |
| C9 | os quatro caminhos que gravam senha guardam `$argon2id$v=19$m=19456,t=2,p=1$...` sem a senha | `api` -t `every_password_write_stores_argon2id` exit 0 | carried from 1d5598f: `apps/api/test/password.test.ts:64` - `expect(stored.startsWith(ARGON2ID_PREFIX), ...).toBe(true)`; `apps/api/test/password.test.ts:65` - `expect(stored, path).not.toContain(password)`; `apps/api/test/password.test.ts:61` - `expect(writes).toHaveLength(4)` (comando real por `pnpm users:create-admin`, `POST /api/users`, `PUT /api/auth/password`, `PUT /api/users/:id/password`) | PASS |
| C10 | troca da própria senha: `204`, sessão atual `200`, a outra `401`, login com a nova `200` e com a antiga `401` | `api` -t `change_password_204_keeps_current_session_only` exit 0 | carried from 1d5598f: `apps/api/test/password.test.ts:81` - `expect(response.status).toBe(204)`; `:82` (`current` 200); `:83` - `expect((await other.get('/api/auth/session')).status).toBe(401)`; `:84` (nova 200); `:85` (antiga 401); `:74` - `expect(newPassword).toHaveLength(12)` | PASS |
| C11 | senha atual errada: `422`, exatamente um item, `path` `currentPassword`, senha guardada não muda | `api` -t `wrong_current_password_422` exit 0 | carried from 1d5598f: `apps/api/test/password.test.ts:99` - `expect(response.status).toBe(422)`; `:101` - `expect(body.errors).toHaveLength(1)`; `:102` - `expect(body.errors![0]!.path).toBe('currentPassword')`; `:104` - `expect(await storedPassword(user.email)).toBe(before)` | PASS |
| C12 | nas três rotas, 11 e 129 caracteres: `422` com `path` do campo; 12 e 128 aceitos | `api` -t `password_length_bounds_on_three_routes` exit 0 | carried from 1d5598f: `apps/api/test/password.test.ts:148` - `expect(response.status, ...).toBe(422)`; `:149` - `expect(body.errors?.map((error) => error.path), ...).toEqual([field])` para `[11, 129]`; `:154` - `expect(response.status, ...).toBe(accepted)` para `[12, 128]`, sobre as três rotas da tabela em `:115-141` | PASS |
| C13 | para `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, o web repassa método, corpo, `Origin` e `Cookie`, e devolve status, corpo, `Set-Cookie` e `X-Request-Id` | `web` -g `proxy_forwards_request_and_response` exit 0 | verified at 328dda1: `apps/web/e2e/proxy.spec.ts:76` - `expect(forwarded[0]!.method, method).toBe(method)`; `:78` (corpo); `:80` (`Origin`); `:81` - `expect(forwarded[0]!.cookie, method).toContain('sessao=valor-da-sessao')`; `:84` - `expect(response.status, method).toBe(218)`; `:86` (`X-Request-Id`); `:88` (cookie `HttpOnly` da API no navegador). Citações refeitas: a correção acrescentou um teste ao arquivo e mexeu no `afterEach` (`:44`); as asserções desta prova são as mesmas. Para `GET` o navegador não manda `Origin` e a asserção de `:80` é a ausência | PASS |
| C14 | `AUTH_SECRET` ausente, de 31 caracteres, `WEB_ORIGIN` ausente ou `ftp://x`: código 1, nome impresso, nenhum valor impresso | `api` -t `auth_env_rejected_exits_1_naming_var` exit 0 | carried from 1d5598f: `apps/api/test/boot.test.ts:103` - `expect(status, JSON.stringify(env)).toBe(1)`; `:104` - `expect(output).toContain(variable)`; `:106` - `expect(output).not.toContain(value)` sobre os quatro casos de `:92-97`; `:98` - `expect(cases[1]!.env.AUTH_SECRET).toHaveLength(31)`. Processo real: `spawnSync(process.execPath, ['dist/main.js'])` em `:40` | PASS |
| C15 | `POST /api/auth/sign-up/email` e `/sign-in/email`: `404` `not_found`, nenhum usuário criado | `api` -t `better_auth_handler_is_not_mounted` exit 0 | carried from 1d5598f: `apps/api/test/login.test.ts:76` - `expect(response.status).toBe(404)`; `:77` - `expect(... .code).toBe('not_found')`; `:79` - `expect(await stack.query('select id from users')).toEqual(usersBefore)` | PASS |
| C16 | stack de pé: admin criado pelo comando no container `api`; login pela origem do web `200` com cookie; sessão `200` pela mesma origem | `stack` -t `login_through_web_origin` exit 0 | carried from 1d5598f: `tests/stack/compose.test.ts:92` - `expect(created.status, created.output).toBe(0)`; `:99` - `expect(login.status).toBe(200)`; `:105` - `expect(cookie).toMatch(/session_token=/)`; `:109` - `expect(session.status).toBe(200)` | PASS |
| C17 | login sem `password` e com `email` `x`: `422` problem+json, `validation_failed`, exatamente dois itens (`email`, `password`), `message` não vazia e diferente da padrão em inglês | `api` -t `invalid_body_422_one_error_per_field` exit 0 | carried from 1d5598f: `apps/api/test/validation.test.ts:48` - `expect(response.status).toBe(422)`; `:49` (content-type); `:50` - `expect(body.code).toBe('validation_failed')`; `:51` - `expect(body.errors?.map((error) => error.path).sort()).toEqual(['email', 'password'])`; `:53` (não vazia); `:55` - `expect(error.message, error.path).not.toBe(englishByPath.get(error.path))` | PASS |
| C18 | campo aninhado sai com `path` `address.zip` | `api` -t `nested_path_uses_dot_notation` exit 0 | carried from 1d5598f: `apps/api/test/validation.test.ts:65` - `expect(body.errors?.map((error) => error.path)).toEqual(['address.zip'])` | PASS |
| C19 | o corpo do `422` não contém nenhum valor enviado | `api` -t `errors_never_echo_client_values` exit 0 | carried from 1d5598f: `apps/api/test/validation.test.ts:82` - `expect(text).not.toContain(String(value))` sobre quatro marcadores; `:80` - quatro itens em `errors` | PASS |
| C20 | corpo ilegível: `400` `bad_request`, não `422` | `api` -t `unreadable_body_stays_400` exit 0 | carried from 1d5598f: `apps/api/test/validation.test.ts:91` - `expect(response.status).toBe(400)`; `:92` - `expect((await problem(response)).code).toBe('bad_request')` | PASS |
| C21 | as nove rotas com `422` na `Surface` respondem `422` `validation_failed` | `api` -t `every_route_with_body_answers_422` exit 0 | carried from 1d5598f: `apps/api/test/validation.test.ts:116` - `expect(response.status, ...).toBe(422)`; `:117` - `expect(parsed.code, ...).toBe('validation_failed')` sobre a tabela de `:98-109`; `:110` - `expect(routes).toHaveLength(9)`. As nove batem com as linhas da `Surface` que listam `422` | PASS |
| C22 | para `POST`, `PUT`, `PATCH`, `DELETE`, requisição `/api` com `Origin` estranha: `403` `csrf_rejected`, handler não executa; login certo nessa condição não cria sessão | `api` -t `foreign_origin_403_without_running_handler` exit 0 | verified at 328dda1: `apps/api/test/csrf.test.ts:37` - `expect(response.status, method).toBe(403)`; `:39` - `expect((await problem(response)).code, method).toBe('csrf_rejected')`; `:41` - `expect(executed).toBe(0)`; `:50` (sem linha em `sessions`). Código: `apps/api/src/csrf.ts:10` (o prefixo `/api` passou a ser testado sem diferenciar maiúsculas) e `apps/api/src/csrf.ts:19`. **Sondas da rodada 1 refeitas no processo real**: `POST /API/auth/login` com `Origin: https://outro.example` e credenciais certas respondeu `403` `csrf_rejected`, sem cookie e sem linha nova em `sessions`; `POST /API/auth/logout` com a mesma origem respondeu `403` e a sessão ficou. Em 179 requisições com origem estranha ou sem origem (33 grafias do caminho, 19 variações de cabeçalho, 6 de método, as 10 rotas de escrita em 4 grafias cada), nenhuma chegou a um handler. F1 fechado; ver `## Probes` | PASS |
| C23 | `POST /api` sem `Origin`: `403` `csrf_rejected` sem executar o handler quando `Sec-Fetch-Site` está ausente, é `cross-site` ou `same-site` | `api` -t `missing_origin_403_unless_same_origin` exit 0 | verified at 328dda1: `apps/api/test/csrf.test.ts:63` - `expect(response.status, JSON.stringify(headers)).toBe(403)`; `:64` (`csrf_rejected`); `:66` - `expect(executed).toBe(0)` sobre os três casos de `:54-58`. Código: `apps/api/src/csrf.ts:19` e `:23`. **Sondas da rodada 1 refeitas no processo real**: `POST /API/auth/login` sem `Origin` (sem `Sec-Fetch-Site`, e com `Sec-Fetch-Site: cross-site`) e credenciais certas respondeu `403` `csrf_rejected` nas duas, sem sessão nova. Sem `Origin`, só `Sec-Fetch-Site: same-origin` exato passa (a linha da door 8 que a C24 prova); `same-site`, `none`, `Same-Origin` e o cabeçalho repetido respondem `403`. F1 fechado; ver `## Probes` | PASS |
| C24 | passam: `POST` com `Origin` igual; `POST` sem `Origin` com `same-origin`; `GET`, `HEAD`, `OPTIONS` com origem estranha | `api` -t `same_origin_and_safe_methods_pass` exit 0 | verified at 328dda1: `apps/api/test/csrf.test.ts:83` - `expect(response.status, ...).toBeLessThan(300)`; `:84` - `expect(text, ...).not.toContain('csrf_rejected')`; `:85` - `expect(executed, ...).toBe(before + 1)` sobre os cinco casos de `:70-76`. O arquivo ganhou um teste ao fim; estas linhas não se moveram. No processo real, `POST` com `Origin` igual a `WEB_ORIGIN` e `POST` sem `Origin` com `Sec-Fetch-Site: same-origin` responderam `200` | PASS |
| C25 | `POST /api/auth/login` com origem estranha e corpo `{}`: `403` `csrf_rejected`, não `422` | `api` -t `origin_is_checked_before_body` exit 0 | verified at 328dda1: `apps/api/test/csrf.test.ts:92` - `expect(response.status).toBe(403)`; `:93` - `expect((await problem(response)).code).toBe('csrf_rejected')`. Linhas não se moveram. No processo real, `POST /Api/Auth/Login` com origem estranha e corpo `{}` respondeu `403` (na rodada 1 respondia `422`) | PASS |
| C26 | stack real, pela origem do web: login com origem estranha `403` `csrf_rejected`; `GET /api/users` sem cookie `401` `unauthorized`; ambos problem+json | `stack` -t `running_api_rejects_foreign_origin_and_anonymous` exit 0 | carried from 1d5598f: `tests/stack/compose.test.ts:119` - `expect(foreign.status).toBe(403)`; `:120` (content-type); `:121` (`csrf_rejected`); `:124` - `expect(anonymous.status).toBe(401)`; `:125`; `:126` (`unauthorized`) | PASS |
| C27 | `two-factor/enable` com senha certa: `200`, `totpUri` `otpauth://totp/...`, ao menos um `backupCodes`, `twoFactorEnabled` segue `false` | `api` -t `enable_200_returns_uri_and_backup_codes` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:55` - `expect(response.status).toBe(200)`; `:56` - `expect(body.totpUri.startsWith('otpauth://totp/')).toBe(true)`; `:57` - `expect(body.backupCodes.length).toBeGreaterThanOrEqual(1)`; `:58` - `expect(await twoFactorEnabled(client)).toBe(false)` | PASS |
| C28 | `two-factor/confirm` com TOTP válido: `204`, `twoFactorEnabled` passa a `true` | `api` -t `confirm_204_turns_two_factor_on` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:69` - `expect(response.status).toBe(204)`; `:70` - `expect(await twoFactorEnabled(client)).toBe(true)` | PASS |
| C29 | login com 2FA ativo: `200`, exatamente `{"status":"two_factor_required"}`, nenhuma sessão | `api` -t `login_with_2fa_returns_two_factor_required` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:81` - `expect(response.status).toBe(200)`; `:82` - `expect(await response.json()).toStrictEqual({ status: 'two_factor_required' })`; `:83` - `expect(await sessionIds(user.id)).toEqual([])` | PASS |
| C30 | `two-factor/verify` com TOTP válido: `200` `authenticated`, cookie que recebe `200` na sessão | `api` -t `verify_totp_200_authenticates` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:92` - `expect(response.status).toBe(200)`; `:93` - `toStrictEqual({ status: 'authenticated' })`; `:94` (cookie `session_token`); `:95` - `expect((await client.get('/api/auth/session')).status).toBe(200)` | PASS |
| C31 | `backupCode` não usado autentica; o mesmo código depois: `401` `invalid_code` | `api` -t `backup_code_authenticates_once` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:104` - `expect(accepted.status).toBe(200)`; `:106` (cookie); `:111` - `expect(reused.status).toBe(401)`; `:112` - `expect((await problem(reused)).code).toBe('invalid_code')` | PASS |
| C32 | `verify` `401` `invalid_code` sem sessão em três casos: TOTP inválido, código de recuperação inexistente, sem login pendente | `api` -t `verify_401_invalid_code_in_three_cases` exit 0 | verified at 328dda1: `apps/api/test/two-factor.test.ts:130` - `expect(response.status, name).toBe(401)`; `:131` - `expect((await problem(response)).code, name).toBe('invalid_code')`; `:132` (sem sessão) sobre os três casos de `:117-125` (arquivo intocado pela correção; a prova passa). **Contraexemplo novo, rodado no processo real**: `POST /api/auth/two-factor/verify` sem login pendente e com um cookie `__Secure-better-auth.two_factor` forjado respondeu `500` `internal_error`, não `401`: com o valor `%E0%A4%A.x` (`URIError: URI malformed`, `apps/api/src/auth/auth.controller.ts:263`) e com o valor `ab%00cd.assinatura` (`invalid byte sequence for encoding "UTF8": 0x00`, `apps/api/src/auth/auth.controller.ts:265`). Sem cookie, com `abc.def`, vazio e sem ponto: `401` `invalid_code`. Nenhuma sessão criada. Ver N3 | FAIL |
| C33 | admin sem 2FA: as 8 rotas restantes da `Surface` respondem `403` `two_factor_enrollment_required` | `api` -t `admin_without_2fa_gets_403_everywhere_else` exit 0 | carried from 1d5598f: `apps/api/test/enrollment.test.ts:46` - `expect(response.status, ...).toBe(403)`; `:47` - `expect((await problem(response)).code, ...).toBe('two_factor_enrollment_required')`; `:50` - `expect(blocked.map(...).sort()).toEqual([...8 rotas...].sort())`, conjunto lido de `stack.api.routes()` | PASS |
| C34 | as quatro isentas: sessão `200`, `enable` `200`, `confirm` `204`, `logout` `204` | `api` -t `four_exempt_routes_stay_reachable` exit 0 | carried from 1d5598f: `apps/api/test/enrollment.test.ts:68` - `expect(session.status).toBe(200)`; `:71` - `expect(enabled.status).toBe(200)`; `:75` - `expect(confirmed.status).toBe(204)`; `:78` e `:84` - `logout` `204` (a segunda com admin ainda sem 2FA, `:83`) | PASS |
| C35 | `twoFactorEnrollmentRequired`: `true` para admin sem 2FA, `false` para admin com 2FA e para `reception` | `api` -t `enrollment_required_only_for_admin_without_2fa` exit 0 | carried from 1d5598f: `apps/api/test/enrollment.test.ts:89` - `expect(await enrollmentRequired(admin.client)).toBe(true)`; `:92` - `.toBe(false)` depois do cadastro real; `:95` - `.toBe(false)` para `reception` | PASS |
| C36 | `two-factor/disable`: `204`, `twoFactorEnabled` `false`, linha de `two_factors` some | `api` -t `disable_204_deletes_secret_and_backup_codes` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:145` - `expect(response.status).toBe(204)`; `:146` - `expect(await twoFactorEnabled(client)).toBe(false)`; `:147` - `expect(await stack.query('select id from two_factors where user_id = $1', [user.id])).toEqual([])` | PASS |
| C37 | `422` com um item: `enable` e `disable` com senha errada (`password`), `confirm` com código inválido (`code`); `twoFactorEnabled` não muda | `api` -t `wrong_password_or_code_422_on_field` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:187` - `expect(response.status, route).toBe(422)`; `:189` - `expect(parsed.errors?.map((error) => error.path), route).toEqual([path])`; `:190` - `expect(await twoFactorEnabled(client), route).toBe(stays)` sobre os três casos de `:159-181` | PASS |
| C38 | 5 falhas alternando maiúsculas; o sexto login, com a senha certa: `429` `too_many_attempts`, `Retry-After` inteiro de 1 a 900 | `api` -t `fifth_failure_blocks_even_right_password` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:79` - `await expectBlocked(sixth)`, que afirma `:40` `expect(response.status).toBe(429)`, `:42` a `:44` (`Retry-After` inteiro, de 1 a 900) e `:46` `expect(body.code).toBe('too_many_attempts')`; cinco grafias em `:72` | PASS |
| C39 | 15 min depois da quinta falha: `200`; a 14 min 59 s: `429` | `api` -t `block_ends_15_min_after_fifth_failure` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:92` - `await expectBlocked(await login(user.email, user.password))` em `advance(5 * MINUTE + 15 * MINUTE - 1000)`; `:95` - `expect((await login(user.email, user.password)).status).toBe(200)` em `advance(5 * MINUTE + 15 * MINUTE)`, com a quinta falha aos 5 min (`:88-89`) | PASS |
| C40 | 4 falhas, 16 min, 1 falha: a última `401`, não `429` | `api` -t `failures_older_than_window_do_not_count` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:106` - `expect(fifth.status).toBe(401)`; `:107` - `expect((await problem(fifth)).code).toBe('invalid_credentials')` | PASS |
| C41 | e-mail sem usuário: 5 x `401` `invalid_credentials`, a sexta `429` com `Retry-After`, corpo de mesma forma | `api` -t `unknown_email_blocks_identically` exit 0 | verified at 328dda1: `apps/api/test/throttle.test.ts:115` - `await fail(unknown, 5)` (`:34` e `:35` afirmam `401` e `invalid_credentials` por tentativa); `:117` - `expectBlocked(blockedUnknown)`; `:121` (corpo de mesma forma) (arquivo intocado pela correção; a prova passa). **Contraexemplo novo, rodado no processo real**: sete tentativas seguidas com o mesmo e-mail inexistente de 3.000 caracteres não compressíveis responderam `500` nas sete, sem linha em `login_throttles` e sem nunca chegar ao `429`; o controle com um e-mail inexistente comum respondeu `401` cinco vezes e `429` duas. Mesma causa da C3 (`apps/api/src/auth/throttle.ts:22`). Ver N1 | FAIL |
| C42 | 4 falhas, login autenticado, mais 4 falhas: a oitava `401` | `api` -t `successful_login_resets_counter` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:128` - `expect((await login(user.email, user.password)).status).toBe(200)`; `:129` - `await fail(user.email, 4)`, cada uma `401` em `:34` | PASS |
| C43 | 5 códigos inválidos no `verify` bloqueiam o login seguinte com a senha certa | `api` -t `invalid_codes_count_on_login_counter` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:138` e `:139` (`401` `invalid_code` nas cinco); `:142` - `await expectBlocked(await login(user.email, user.password))` | PASS |
| C44 | e-mail bloqueado: `verify` com TOTP válido responde `429` com `Retry-After`, sem sessão | `api` -t `verify_429_when_blocked` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:152` - `await expectBlocked(response)`; `:153` - `expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toEqual([])` | PASS |
| C45 | 10 logins errados simultâneos: no máximo 5 `401`, `429` nos demais, somando 10 | `api` -t `ten_concurrent_failures_yield_at_most_five_401` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:164` - `expect(unauthorized).toBeLessThanOrEqual(5)`; `:165` - `expect(unauthorized + blocked).toBe(10)` | PASS |
| C46 | segunda instância da API no mesmo banco responde `429` | `api` -t `block_survives_restart` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:180` - `await expectBlocked(response)` contra `startApi(stack.postgres.url)` de `:173` | PASS |
| C47 | rota sem declaração, ou com `@Public()` e `@Roles('admin')` juntos: a subida sai com código 1 e imprime método e caminho | `api` -t `route_without_single_access_declaration_exits_1` exit 0 | carried from 1d5598f: `apps/api/test/boot.test.ts:125` - `expect(result.status, ...).toBe(1)`; `:126` - `expect(...).toContain(route)` com `'GET /api/undeclared'` e `'GET /api/double'` (`:113-114`). O processo é o `bootstrap` real com um controller a mais (`apps/api/test/fixtures/invalid-access.ts:32`) | PASS |
| C48 | matriz 3 declarações x 5 chamadores, 15 combinações, com `401`/`403` e handler não executado | `api` -t `guard_matrix_three_declarations_five_callers` exit 0 | carried from 1d5598f: `apps/api/test/access.test.ts:87` - `expect(response.status, ...).toBe(status)`; `:88` - `expect(body.code, ...).toBe(code)`; `:90` - `expect(executions.length - before, ...).toBe(status === 200 ? 1 : 0)`; `:94` - `expect(combinations).toBe(15)`; esperados literais em `:54-76` | PASS |
| C49 | `reception`, `hr_finance`, `instructor` nas cinco rotas `/api/users*`: `403` `forbidden`, nenhuma linha muda (15) | `api` -t `non_admin_403_on_every_users_route` exit 0 | carried from 1d5598f: `apps/api/test/access.test.ts:122` - `expect(response.status, ...).toBe(403)`; `:123` - `.toBe('forbidden')`; `:127` - `expect(combinations).toBe(15)`; `:128` - `expect(await snapshot()).toEqual(before)` | PASS |
| C50 | sem cookie, toda rota registrada responde `401` `unauthorized`, exceto exatamente três | `api` -t `only_three_routes_answer_without_session` exit 0 | carried from 1d5598f: `apps/api/test/access.test.ts:147` - `expect(open.sort()).toEqual(['GET /health', 'POST /api/auth/login', 'POST /api/auth/two-factor/verify'])`; `:141` a `:143` (as demais são `401` `unauthorized`); rotas lidas do roteador em `:132` | PASS |
| C51 | `POST /api/users`: `201` com os seis campos, sem senha; o usuário entra com a senha informada | `api` -t `create_user_201_and_user_can_log_in` exit 0 | verified at 328dda1: `apps/api/test/users.test.ts:43` - `expect(response.status).toBe(201)`; `:44` - `expect(body).toStrictEqual({ id, name, email, role, active: true, twoFactorEnabled: false })`; `:55` - `expect(loggedIn.status).toBe(200)` (arquivo intocado pela correção; a prova passa). **Contraexemplo novo, rodado no processo real**, com dados que o schema da rota aceita (`packages/contracts/src/users.ts:20`): e-mail de 3.000 caracteres não compressíveis respondeu `500` `internal_error` (`index row size 3016 exceeds btree version 4 maximum 2704 for index "users_email_unique"`, `packages/database/src/schema.ts:23`); nome `Nome\u0000Nulo` respondeu `500` (`invalid byte sequence for encoding "UTF8": 0x00`, `packages/contracts/src/users.ts:4`). Com e-mail de 254 e de 2.600 caracteres: `201`. Ver N1 e N2 | FAIL |
| C52 | e-mail repetido com outras maiúsculas: `409` `email_taken`, contagem de `users` igual | `api` -t `duplicate_email_409_case_insensitive` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:71` - `expect(response.status).toBe(409)`; `:72` - `.toBe('email_taken')`; `:73` - `expect(await stack.query('select id from users')).toHaveLength(before.length)` | PASS |
| C53 | `Ana.Lima@Exemplo.com` aparece como `ana.lima@exemplo.com` | `api` -t `email_is_stored_lowercase` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:87` - `expect(listed.users.filter((user) => user.name === 'Ana Lima').map((user) => user.email)).toEqual(['ana.lima@exemplo.com'])` | PASS |
| C54 | `role` `owner` em `POST` e `PATCH`: `422` com `path` `role`; os quatro valores aceitos | `api` -t `role_accepts_only_the_four_values` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:100` - `expect(response.status).toBe(422)`; `:101` - `expect(body.errors?.map((error) => error.path)).toEqual(['role'])`; `:112` (`POST` `201`) e `:116` (`PATCH` `200`) para os quatro perfis | PASS |
| C55 | `GET /api/users`: `200`, todos (ativos e inativos), em ordem alfabética, cada item com exatamente seis chaves | `api` -t `list_users_200_sorted_with_six_keys` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:131` - `expect(response.status).toBe(200)`; `:132` (ids iguais aos do banco); `:133` (há inativo); `:135` - `expect(names).toEqual([...names].sort(new Intl.Collator('pt-BR').compare))`; `:139` - `expect(Object.keys(user).sort()).toEqual(['active', 'email', 'id', 'name', 'role', 'twoFactorEnabled'])` | PASS |
| C56 | `PATCH` só com `name`, só com `role`, só com `active`: `200` com o valor novo e o resto inalterado | `api` -t `patch_user_200_per_field` exit 0 | verified at 328dda1: `apps/api/test/users.test.ts:159` - `expect(response.status, ...).toBe(200)`; `:160` - `expect(await response.json(), ...).toStrictEqual(expected)` sobre as três mudanças de `:153` (arquivo intocado pela correção; a prova passa). **Contraexemplo novo, rodado no processo real**: `PATCH /api/users/:id` com só `name` igual a `Outro\u0000Nulo`, que o schema aceita (`packages/contracts/src/users.ts:29`), respondeu `500` `internal_error` (`invalid byte sequence for encoding "UTF8": 0x00` no `update "users"`, `apps/api/src/users/users.service.ts:89`). Ver N2 | FAIL |
| C57 | mudar `role` ou desativar: o cookie aberto recebe `401` e não resta linha em `sessions` | `api` -t `role_change_or_deactivation_ends_sessions` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:174` - `expect((await client.get('/api/auth/session')).status, ...).toBe(401)`; `:175` - `expect(await sessionCount(user.id), ...).toBe(0)` para as duas mudanças de `:165` | PASS |
| C58 | `409` `last_admin` sem mudar nada, em três casos | `api` -t `last_admin_409_in_three_cases` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:192` - `expect(response.status, name).toBe(409)`; `:193` - `.toBe('last_admin')`; `:194` - `expect(await row(only!.user.id), name).toEqual({ role: 'admin', active: true })`. Os três casos rodam com o administrador inativo já criado (`:181`): o 1º e o 3º são o mesmo estado, só muda o perfil de destino. Ver P3 | PASS |
| C59 | dois `PATCH` simultâneos sobre os dois últimos admins: um `200`, um `409` `last_admin`, resta um admin ativo | `api` -t `concurrent_removal_of_last_two_admins` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:230` - `expect(statuses).toEqual([200, 409])`; `:232` - `.toBe('last_admin')`; `:233` - `expect(await stack.query("select id from users where role = 'admin' and active")).toHaveLength(1)` | PASS |
| C60 | admin redefine a senha: `204`, sessão do usuário `401`, login com a nova `200`, com a antiga `401` | `api` -t `admin_resets_password_204` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:245` - `expect(response.status).toBe(204)`; `:246` (sessão `401`); `:247` (nova `200`); `:248` (antiga `401`); `:241` (12 caracteres) | PASS |
| C61 | admin zera o 2FA: `204`, `twoFactorEnabled` `false`, linha de `two_factors` some, sessão `401` | `api` -t `admin_resets_two_factor_204` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:260` - `expect(response.status).toBe(204)`; `:261` a `:263` (`two_factor_enabled: false`); `:264` (`two_factors` vazio); `:265` - `expect((await client.get('/api/auth/session')).status).toBe(401)` | PASS |
| C62 | `:id` `abc` e `uuid` sem usuário nas três rotas: `404` `not_found` (6) | `api` -t `unknown_or_malformed_id_404` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:280` - `expect(response.status, ...).toBe(404)`; `:281` - `.toBe('not_found')`; `:285` - `expect(combinations).toBe(6)` | PASS |
| C63 | `pnpm users:create-admin` com senha de 12: código 0, usuário ativo `admin`, imprime `id` e e-mail, não imprime a senha | `api` -t `creates_admin_exits_0_without_printing_password` exit 0 | carried from 1d5598f: `apps/api/test/create-admin.test.ts:28` - `expect(result.status, result.output).toBe(0)`; `:34` - `expect(rows[0]).toMatchObject({ role: 'admin', active: true, name: 'Administradora' })`; `:35` (id); `:36` (e-mail); `:37` - `expect(result.output).not.toContain(password)`. O comando roda de verdade: `apps/api/test/support/command.ts:11` | PASS |
| C64 | comando sai com 1, nomeia o motivo e não cria nada em seis casos | `api` -t `rejects_six_invalid_invocations` exit 0 | carried from 1d5598f: `apps/api/test/create-admin.test.ts:82` - `expect(result.status, ...).toBe(1)`; `:83` - `expect(result.output, name).toMatch(reason)`; `:85` - `expect(await counts(), name).toEqual(before)` (`users` e `accounts`); `:76` - `expect(cases).toHaveLength(6)` | PASS |
| C65 | depois de `pnpm db:migrate`: seis tabelas, nenhuma coluna `tenant_id` | `db` -t `six_identity_tables_and_no_tenant_id` exit 0 | carried from 1d5598f: `packages/database/test/schema.test.ts:49` - `expect(names).toContain(expected)` sobre as seis; `packages/database/test/schema.test.ts:55` - `expect(tenantColumns).toEqual([])` | PASS |
| C66 | nas cinco tabelas de identidade, linha sem `id` recebe `uuid` versão 7 | `db` -t `ids_default_to_uuidv7` exit 0 | carried from 1d5598f: `packages/database/test/schema.test.ts:86` - `expect(checked!.version, table).toBe(7)` por `uuid_extract_version`; `:79` - `expect(Object.keys(inserts)).toHaveLength(5)` | PASS |
| C67 | segundo `users` com o mesmo `email` falha por unicidade | `db` -t `users_email_is_unique` exit 0 | carried from 1d5598f: `packages/database/test/schema.test.ts:93` - `await expect(insertUser('unica@exemplo.com')).rejects.toMatchObject({ code: '23505' })` | PASS |
| C68 | `users.role` `owner` falha no banco | `db` -t `users_role_rejects_fifth_value` exit 0 | carried from 1d5598f: `packages/database/test/schema.test.ts:98` - `await expect(insertUser('dona@exemplo.com', 'owner')).rejects.toMatchObject({ code: '23514' })` | PASS |
| C69 | sem sessão, `/`, `/users`, `/account`, `/two-factor/setup` terminam em `/login` | `web` -g `anonymous_is_redirected_to_login` exit 0 | carried from 1d5598f: `apps/web/e2e/shell.spec.ts:10` - `await expect(page, path).toHaveURL('/login')` sobre os quatro caminhos de `:7` | PASS |
| C70 | `/login`: título "Entrar", campos "E-mail" e "Senha", botão "Entrar", `lang="pt-BR"` | `web` -g `login_page_shows_form_in_pt_br` exit 0 | carried from 1d5598f: `apps/web/e2e/login.spec.ts:14` - `expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible()`; `:15`; `:16`; `:17`; `:18` - `expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')` | PASS |
| C71 | depois do login: URL `/`, "Gestão de Academia", nome, "Sair" e o perfil por extenso para os quatro perfis | `web` -g `home_shows_name_and_role_label_for_four_roles` exit 0 | carried from 1d5598f: `apps/web/e2e/login.spec.ts:40` - `expect(page, role).toHaveURL('/')`; `:41`; `:42` (nome); `:43` - `expect(page.getByText(label, { exact: true }), role).toBeVisible()`; `:44`; rótulos literais em `:22-27` | PASS |
| C72 | login `401`: "E-mail ou senha incorretos.", e-mail mantido, senha vazia | `web` -g `login_401_shows_message_and_clears_password` exit 0 | carried from 1d5598f: `apps/web/e2e/login.spec.ts:54` - `expect(page.getByText('E-mail ou senha incorretos.', { exact: true })).toBeVisible()`; `:55` - `toHaveValue('digitado@exemplo.com')`; `:56` - `toHaveValue('')` | PASS |
| C73 | login `429`: "Muitas tentativas. Tente novamente em N minutos." com N 15, 2, 1 para 900, 61, 60 | `web` -g `login_429_shows_minutes_rounded_up` exit 0 | carried from 1d5598f: `apps/web/e2e/login.spec.ts:78` - `expect(page.getByText(...'Muitas tentativas. Tente novamente em ${minutes} minutos.'..., { exact: true }), ...).toBeVisible()` sobre os três casos de `:61-65` | PASS |
| C74 | `422` com um item: a `message` aparece junto do campo em quatro formulários | `web` -g `field_errors_shown_on_four_forms` exit 0 | verified at 328dda1: `apps/web/e2e/forms.spec.ts:18` - `expect(page.getByLabel(form.field.label, { exact: true }), form.name).toHaveAccessibleDescription(message)`; `:19` (uma ocorrência); `:8` - `expect(forms).toHaveLength(4)`. Linhas acima da edição da correção, inalteradas. Em `/two-factor/setup` e em `/users` só um dos formulários da tela é exercitado. Ver P2 | PASS |
| C75 | API pendurada por mais de 3 s e API `500`: a mensagem de indisponível em cinco telas, sem sair da tela (10) | `web` -g `unavailable_api_message_on_five_screens` exit 0 | verified at 328dda1: `apps/web/e2e/forms.spec.ts:40` - `expect(page.getByText(UNAVAILABLE, { exact: true }), ...).toBeVisible({ timeout: 4000 })`; `:43` - `expect(page.url(), ...).toBe(url)`; `:47` - `expect(combinations).toBe(10)`. A correção baixou a espera de 8 s para 4 s: um prazo de 7 s já não passaria. O teste levou 18,3 s (5 casos pendurados, cerca de 3 s cada). Ver P1 | PASS |
| C76 | enquanto a API não responde, o botão de envio fica desabilitado em cinco formulários | `web` -g `submit_disabled_while_pending_on_five_forms` exit 0 | verified at 328dda1: `apps/web/e2e/forms.spec.ts:61` - `await expect(submit, form.name).toBeDisabled()`; `:57` (habilitado antes); `:63` (a requisição chegou); `:51` - `expect(FORMS).toHaveLength(5)`. Linhas deslocadas em 1 pela correção. Ver P2 | PASS |
| C77 | `two_factor_required`: URL `/login/two-factor`, campo "Código de 6 dígitos", link "Usar código de recuperação" | `web` -g `two_factor_required_shows_code_page` exit 0 | carried from 1d5598f: `apps/web/e2e/two-factor.spec.ts:16` - `await expect(page).toHaveURL('/login/two-factor')`; `:34` - `expect(page.getByLabel('Código de 6 dígitos')).toBeVisible()`; `:35` - `expect(page.getByRole('link', { name: 'Usar código de recuperação' })).toBeVisible()` | PASS |
| C78 | depois do link, o envio chega a `POST /api/auth/two-factor/verify` com `backupCode` e sem `code` | `web` -g `recovery_link_sends_backup_code` exit 0 | carried from 1d5598f: `apps/web/e2e/two-factor.spec.ts:49` - `expect(sent[0]!.method).toBe('POST')`; `:50` - `expect(sent[0]!.body).toEqual({ backupCode: 'aaaaa-11111' })`; `:51` - `expect(sent[0]!.body).not.toHaveProperty('code')` | PASS |
| C79 | `verify` `401`: "Código inválido." | `web` -g `verify_401_shows_invalid_code` exit 0 | carried from 1d5598f: `apps/web/e2e/two-factor.spec.ts:61` - `expect(page.getByText('Código inválido.', { exact: true })).toBeVisible()` | PASS |
| C80 | `twoFactorEnrollmentRequired` `true`: `/`, `/users`, `/account` terminam em `/two-factor/setup` | `web` -g `enrollment_required_redirects_three_pages` exit 0 | carried from 1d5598f: `apps/web/e2e/two-factor.spec.ts:72` - `await expect(page, path).toHaveURL('/two-factor/setup')` sobre os três caminhos de `:69` | PASS |
| C81 | `/two-factor/setup`: QR code que decodifica para o `totpUri`, o segredo em texto, o campo "Código de 6 dígitos" | `web` -g `setup_shows_qr_secret_and_code_field` exit 0 | carried from 1d5598f: `apps/web/e2e/two-factor.spec.ts:85` - `expect(decoded?.data).toBe(TOTP_URI)`; `:87` - `expect(page.getByText('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', { exact: true })).toBeVisible()`; `:88` | PASS |
| C82 | confirmado o cadastro: cada código e o aviso; recarregada, nenhum código | `web` -g `backup_codes_shown_exactly_once` exit 0 | carried from 1d5598f: `apps/web/e2e/two-factor.spec.ts:102` a `:104` (aviso literal); `:105` - `expect(page.getByText(code, { exact: true })).toBeVisible()` para os quatro; `:110` - `toHaveCount(0)` depois de `page.reload()` | PASS |
| C83 | `/users`: colunas "Nome", "E-mail", "Perfil", "Situação", "2FA" nesta ordem, linhas em ordem alfabética, "Ativo"/"Inativo", botão "Novo usuário" | `web` -g `users_table_columns_order_and_button` exit 0 | carried from 1d5598f: `apps/web/e2e/users.spec.ts:18` - `expect(headers.slice(0, 5)).toEqual(['Nome', 'E-mail', 'Perfil', 'Situação', '2FA'])`; `:24` - `expect(names).toEqual(['Álvaro Dias', 'bruno costa', 'Carla Nunes', 'Zuleica Prado'])`; `:26` - `expect(status).toEqual(['Ativo', 'Ativo', 'Inativo', 'Ativo'])`; `:27`. A tela tem uma sexta coluna, "Ações" (`:19`), que a AC 62 não lista | PASS |
| C84 | `/users` com `reception`: a mensagem de sem permissão e nenhum nome ou e-mail da lista | `web` -g `non_admin_sees_no_permission_and_no_data` exit 0 | carried from 1d5598f: `apps/web/e2e/users.spec.ts:37` - `expect(page.getByText('Você não tem permissão para acessar esta página.', { exact: true })).toBeVisible()`; `:40` e `:41` - `expect(content).not.toContain(user.name)`, `user.email` | PASS |
| C85 | link "Usuários" em `/` só para `admin` | `web` -g `users_link_only_for_admin` exit 0 | carried from 1d5598f: `apps/web/e2e/shell.spec.ts:27` - `expect(page.getByRole('link', { name: 'Usuários', exact: true }), role).toHaveCount(expected ? 1 : 0)` sobre os quatro perfis de `:15-20` | PASS |
| C86 | "Desativar", "Redefinir senha", "Zerar 2FA": diálogo com o nome, nenhuma escrita antes, uma depois | `web` -g `three_actions_confirm_naming_the_user` exit 0 | carried from 1d5598f: `apps/web/e2e/users.spec.ts:68` - `expect(dialog, button).toContainText(target.name)`; `:70` - `expect(api.writes(), ...).toEqual([])`; `:75` - `expect(api.writes().map(...), button).toEqual([write])` sobre as três ações de `:48-52` | PASS |
| C87 | `GET /api/users` `500`: a mensagem, "Tentar novamente", e a tabela depois | `web` -g `list_failure_shows_retry` exit 0 | carried from 1d5598f: `apps/web/e2e/users.spec.ts:85` - `expect(page.getByText('Não foi possível carregar os usuários.', { exact: true })).toBeVisible()`; `:87`; `:93` - `expect(page.getByRole('table')).toBeVisible()` depois de `retry.click()` | PASS |
| C88 | `/account`: troca de senha e "Ativar..." ou "Desativar verificação em duas etapas" conforme `twoFactorEnabled` | `web` -g `account_offers_password_and_2fa_toggle` exit 0 | carried from 1d5598f: `apps/web/e2e/account.spec.ts:17` a `:19` (formulário de senha); `:20` - `expect(page.getByText(offered, { exact: true }), offered).toBeVisible()`; `:21` - `expect(page.getByText(hidden, { exact: true }), hidden).toHaveCount(0)` nos dois casos de `:8-9` | PASS |
| C89 | "Sair": `POST /api/auth/logout` chega à API e a URL passa a `/login` | `web` -g `sign_out_calls_logout_and_goes_to_login` exit 0 | carried from 1d5598f: `apps/web/e2e/shell.spec.ts:41` - `await expect(page).toHaveURL('/login')`; `:42` - `expect(api.writes().map(...)).toEqual(['POST /api/auth/logout'])` | PASS |
| C90 | com sessão, `/login` termina em `/` | `web` -g `signed_in_user_leaves_login` exit 0 | carried from 1d5598f: `apps/web/e2e/shell.spec.ts:50` - `await expect(page).toHaveURL('/')` | PASS |
| C91 | login vazio: erro junto de "E-mail" e de "Senha", nenhuma requisição chega à API | `web` -g `empty_login_is_rejected_before_any_request` exit 0 | carried from 1d5598f: `apps/web/e2e/login.spec.ts:90` - `expect(page.getByLabel('E-mail')).toHaveAccessibleDescription(/\S/)`; `:91` (senha); `:92` - `expect(api.requests.filter((request) => request.path === '/api/auth/login')).toEqual([])`. O schema é o de contracts: `apps/web/src/app/login/login-form.tsx:16` | PASS |
| C92 | `packages/ui` é workspace com `tailwindcss` e `components.json`; `apps/web` declara as três dependências; `lint` e `typecheck` alcançam `packages/ui` | `repo` -t `ui_package_is_the_shared_interface_base` exit 0 | carried from 1d5598f: `tests/repo/repo.test.ts:117` - `expect(workspaceDirs()).toContain('packages/ui')`; `:120` (tailwindcss); `:121` (`components.json`); `:125` (três dependências); `:141` a `:143` (`@academia/ui#lint`, `@academia/ui#typecheck` na resolução do Turborepo) | PASS |
| C93 | stack de pé: `GET /` segue o redirecionamento e responde `200` em `/login` com o título "Entrar" | `stack` -t `home_redirects_to_login` exit 0 | carried from 1d5598f: `tests/stack/compose.test.ts:134` - `expect(response.url).toBe(...'/login')`; `:135` - `expect(response.status).toBe(200)`; `:136` - `expect(html).toMatch(/<h1[^>]*>Entrar<\/h1>/)` | PASS |
| C94 | `GET /api/openapi.json` com sessão: `200`, `openapi` começa por `3.1` | `api` -t `openapi_200_is_3_1` exit 0 | carried from 1d5598f: `apps/api/test/openapi.test.ts:31` - `expect(response.status).toBe(200)`; `:39` - `expect(body.openapi.startsWith('3.1')).toBe(true)` | PASS |
| C95 | `paths` do documento é igual ao conjunto de rotas registradas sob `/api` | `api` -t `paths_equal_registered_api_routes` exit 0 | carried from 1d5598f: `apps/api/test/openapi.test.ts:54` - `expect(documented.sort()).toEqual(registered.sort())`, com `registered` lido de `stack.api.routes()` em `:43` | PASS |
| C96 | o `requestBody` das nove rotas é igual a `z.toJSONSchema` do schema de contracts | `api` -t `request_bodies_come_from_contract_schemas` exit 0 | carried from 1d5598f: `apps/api/test/openapi.test.ts:76` - `expect(documented, ...).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(schema))))`; `:69` - nove; `:84` (nenhuma outra rota declara corpo) | PASS |
| C97 | Vitest da API mede `src/**` com limiar 70 de linhas e 70 de ramos, e o script `test` liga a cobertura | `repo` -t `api_coverage_thresholds_are_70_lines_and_branches` exit 0 | carried from 1d5598f: `tests/repo/repo.test.ts:104` - `expect(resolved?.coverage?.include).toEqual(['src/**'])`; `:105` - `expect(resolved?.coverage?.thresholds).toMatchObject({ lines: 70, branches: 70 })`; `:111` - `expect(api.scripts.test).toMatch(/^vitest run( .*)? --coverage( $)/)` (expressão abreviada aqui) | PASS |
| C98 | clone limpo com arquivo sem teste em `apps/api/src`: `pnpm verify` sai diferente de 0 | `gate` -t `verify_fails_below_70_percent_coverage` exit 0 | carried from 1d5598f: `tests/stack/verify.test.ts:126` - `expect(broken.status).not.toBe(0)`; `:129` - `expect(failed.map((t) => t.taskId), ...).toEqual(['@academia/api#test'])`; `:130` (mensagem do limiar de cobertura na saída) | PASS |
| C99 | um login gera exatamente uma linha `auth.*` com `requestId` igual ao cabeçalho, em quatro casos | `api` -t `login_outcomes_log_one_line_each` exit 0 | verified at 328dda1: `apps/api/test/auth-log.test.ts:81` - `expect(authLines, msg).toHaveLength(1)`; `:82` - `expect(authLines[0], msg).toMatchObject({ msg, requestId })`; `:83` e `:84` (`userId` presente ou ausente); os quatro casos, literais, em `:64-69`. A captura passou a incluir o `console` (`:30-34`), e o Better Auth agora escreve linhas JSON de `msg` `better-auth`, que o filtro `auth.` de `:80` não conta. No processo real, 12 desfechos de login geraram 12 linhas `auth.*` (7 falhas, 3 autenticados, 2 bloqueados) | PASS |
| C100 | percorridos cinco caminhos, nenhuma linha escrita pelo processo contém nenhum dos seis valores | `api` -t `six_secrets_never_reach_the_log` exit 0 | verified at 328dda1: `apps/api/test/auth-log.test.ts:137` - `expect(written.includes(value), ...).toBe(false)` sobre os valores de `:97`, `:112` e `:116-117`; `written` agora junta `process.stdout.write` e `process.stderr.write` (`:27-28`) e os cinco métodos do `console` (`:30-34`). Código: `apps/api/src/problem.filter.ts:89` - `error: describeError(exception)`; `apps/api/src/log-safe.ts:9` (a consulta sem os parâmetros); `apps/api/src/auth.ts:33` - `logger: { log: logBetterAuth }`. **Sondas da rodada 1 refeitas no processo real**: com o banco recusando conexão, `POST /api/auth/login` (`500`) e `GET /api/users` com cookie assinado (`500`) deixaram no log a consulta e nenhum parâmetro. Em 12 situações (operação normal e 10 modos de falha do banco), 232 valores procurados - os seis da AC 74 e os que os cercam - e nenhum encontrado. Resta uma escrita fora de JSON que leva o id do usuário, que não é um dos seis. F2 fechado; ver N4 e `## Probes` | PASS |
| C101 | cada um dos dez `code` da door 9: problem+json, `X-Request-Id` igual ao `requestId`, valida contra o schema de erro | `api` -t `ten_new_codes_match_problem_schema` exit 0 | carried from 1d5598f: `apps/api/test/contracts.test.ts:101` - `expect(body.code, code).toBe(code)`; `:102` (content-type); `:104` - `expect(response.headers.get('x-request-id'), code).toBe(body.requestId)`; `:105` - `expect(problemSchema.safeParse(body).success, code).toBe(true)`; `:94` - dez códigos distintos | PASS |
| C102 | o corpo de sucesso de cada uma das sete rotas valida contra o schema de resposta | `api` -t `seven_success_bodies_match_contract_schemas` exit 0 | carried from 1d5598f: `apps/api/test/contracts.test.ts:169` - `expect(response.status, route).toBe(status)`; `:170` - `expect(parsed.success, ...).toBe(true)`; `:162` - `expect(cases).toHaveLength(7)` | PASS |

Por alvo, em `328dda1`: `api` exit 0, 68 aprovados, 0 reprovados (7 testes filtrados pelo `-t`: 5 da
`fundacao` e os 2 que a correção acrescentou), 34,4 s · `db` exit 0, 4 aprovados · `repo` exit 0,
2 aprovados · `web` exit 0, 24 aprovados, 34,5 s · `stack` exit 0, 3 aprovados, 121,1 s · `gate`
exit 0, 1 aprovado, 144,0 s. 102 testes nomeados, cada um listado individualmente como aprovado.

Fora das 102, também em `328dda1`: a suíte inteira da API com cobertura
(`pnpm --filter "./apps/api" exec vitest run --coverage --reporter=verbose`) saiu com 0, 23 arquivos,
90 testes aprovados, linhas 87,8% e ramos 80,38% - inclui os dois testes novos e os da `fundacao`
que passam pelo `ProblemFilter` que a correção mexeu. O teste novo do web
(`unreachable_api_answers_502_or_504_problem`) passou em 10,3 s.

## Findings

verified at 328dda1. N1 a N3 reprovam checks. N4 e os demais não reprovam nenhuma linha.

### Round 1 findings - what became of each

| Achado da rodada 1 | Estado em 328dda1 | Evidência |
| --- | --- | --- |
| F1 - checagem de origem contornada por caminho em outras maiúsculas (C22, C23) | fechado | `apps/api/src/csrf.ts:10`, `:19`; as 8 requisições do F1 refeitas no processo real: `403` nas 7 com origem estranha ou sem origem, sem sessão criada, e `403` com a sessão mantida no logout; 179 requisições, 0 chegaram a handler; teste novo falha com o código antigo |
| F2 - e-mail digitado e token da sessão no log quando a consulta falha (C100) | fechado para os seis valores da AC 74; resta N4 | `apps/api/src/problem.filter.ts:89`, `apps/api/src/log-safe.ts:9`, `apps/api/src/auth.ts:33`; as 2 requisições do F2 refeitas; 232 valores em 12 situações, 0 encontrados; teste novo falha com o código antigo, nas duas metades |
| F2, parte da prova - a captura não via o `console` | fechado | `apps/api/test/auth-log.test.ts:30-34`; com só o `logger` do Better Auth desfeito, o teste novo falha em `token no log` |
| F3 - linha `502`/`504` da `Surface` sem check, sem `Coverage`, sem teste | aberto em parte | agora há teste e ele passa (`apps/web/e2e/proxy.spec.ts:112-115`, `:122-125`); `checks.md` não mudou: segue sem check, sem linha de `Coverage`, e `bad_gateway`/`gateway_timeout` seguem fora da lista de códigos da door 9. O prazo de 10 s de `apps/web/src/app/api/[...path]/route.ts:8` não tem asserção própria |
| P1 - a C75 não fixa quando a mensagem aparece | fechado na prova | `apps/web/e2e/forms.spec.ts:40-42`: a mensagem tem de aparecer em até 4 s. O texto da C75 não mudou, e nada afirma o limite de baixo (uma tela que desistisse com 1 s também passaria) |
| P2 - "cinco formulários" contam um por tela | intocado | o diff não toca `apps/web/e2e/support/forms.ts` nem as telas |
| P3 - casos 1 e 3 da C58 são o mesmo estado | intocado | o diff não toca `apps/api/test/users.test.ts` |
| Menor: C13, `Origin` ausente no `GET` | intocado | `apps/web/e2e/proxy.spec.ts:80` |
| Menor: C73, "em 1 minutos" | intocado | `apps/web/src/lib/api.ts:60` |
| Menor: C83, coluna "Ações" | intocado | - |
| Menor: linhas do Better Auth fora de JSON | fechado, salvo N4 | no processo real, `Invalid password` e `User not found` saem como `{"level":"warn","msg":"better-auth","detail":"..."}` |
| Menor: cookie `two_factor` lido sem conferir a assinatura (`auth.controller.ts:253-268`) | intocado, e agora com contraexemplo | N3 |
| Menor: `stack.session('admin')` marca o 2FA por SQL | intocado | - |

### N1 - e-mail sem tamanho máximo: o schema aceita, o índice do banco recusa, a API responde `500` (C3, C41, C51; AC 2, AC 29, AC 37)

`packages/contracts/src/auth.ts:16` define `emailSchema = z.email(...)` sem limite de tamanho. O
e-mail é chave primária de `login_throttles` (`packages/database/src/schema.ts:98`) e tem índice
único em `users` (`packages/database/src/schema.ts:23`); uma entrada de índice btree do Postgres não
passa de 2.704 bytes. Um e-mail que o schema aceita e que não cabe no índice faz o `insert` falhar, e
a exceção vira `500 internal_error`.

Rodado contra `node apps/api/dist/main.js` (construído em `328dda1`), Postgres 18 real, `Origin`
igual a `WEB_ORIGIN`. Os e-mails têm a parte local aleatória (o Postgres não a comprime):

| Requisição | Observado |
| --- | --- |
| `POST /api/auth/login`, e-mail inexistente de 64, 254, 320, 1.000, 2.000 e 2.600 caracteres | `401` `invalid_credentials`, 1 linha em `login_throttles` (controle) |
| `POST /api/auth/login`, e-mail inexistente de 2.700, 2.712, 2.720, 2.800, 3.000 e 6.000 caracteres | `500` `internal_error`, nenhuma linha em `login_throttles`; no log, `index row size 2712 exceeds btree version 4 maximum 2704 for index "login_throttles_pkey"` |
| 7 logins seguidos com o mesmo e-mail inexistente de 3.000 caracteres | `500` nos sete; nunca `429` |
| 7 logins seguidos com um e-mail inexistente comum | `401` x5, `429` x2 (controle) |
| `POST /api/auth/login`, e-mail de 6.012 caracteres todos iguais (compressível) | `401` |
| `POST /api/users` por administrador com 2FA, e-mail de 254 e de 2.600 caracteres | `201` (controle) |
| `POST /api/users` por administrador com 2FA, e-mail de 3.000 caracteres | `500` `internal_error`; no log, `index row size 3016 ... "users_email_unique"`; nenhum usuário criado |

Por que reprova: o plano só conhece três destinos para um corpo - ilegível (`400`), reprovado no
schema (`422`, AC 14) ou aceito. Aceito, o e-mail existe ou não existe; a AC 2 manda `401` para o que
não existe, a AC 29 manda bloquear igual, e a AC 37 manda `201` para dados válidos. O `500` não é
nenhum deles, e a rota de login é pública.

Alcance, para não exagerar: precisa de um e-mail de uns 2,7 mil caracteres que não comprima; não
vaza nada (o e-mail não aparece no log, conferido), não cria sessão, não altera dado. O e-mail que
nunca é bloqueado não pertence a ninguém. O efeito é um `500` e uma linha `unhandled exception` por
requisição, ao alcance de quem não tem sessão.

### N2 - `U+0000` num campo de texto: o schema aceita, o Postgres recusa, a API responde `500` (C51, C56; AC 37, AC 40)

`packages/contracts/src/users.ts:4` limita o nome a 120 caracteres e não recusa o caractere nulo, que
uma coluna `text` do Postgres não guarda. No processo real, com sessão de administrador com 2FA:

| Requisição | Observado |
| --- | --- |
| `POST /api/users` com `name` igual a `Nome\u0000Nulo` e o resto válido | `500` `internal_error`; no log, `invalid byte sequence for encoding "UTF8": 0x00` no `insert into "users"` |
| `PATCH /api/users/:id` com só `name` igual a `Outro\u0000Nulo` | `500` `internal_error`; a mesma causa no `update "users"` (`apps/api/src/users/users.service.ts:89`) |
| `POST /api/users` com `name` de 200.000 caracteres | `413` `payload_too_large` (o leitor de corpo; fora do alcance deste achado) |

Reprova pela mesma leitura do N1: "dados válidos" (AC 37) e "`name` válido" (AC 40) só têm uma
definição no plano, o schema da rota. Só um administrador autenticado alcança estas duas rotas. O
e-mail não tem o problema (o `z.email` recusa o caractere), e a senha não chega ao banco em texto.

### N3 - cookie `two_factor` forjado derruba a verificação com `500` (C32; AC 23)

`apps/api/src/auth/auth.controller.ts:253-268` (`pendingLogin`) lê o cookie do login pendente antes
de qualquer conferência de assinatura: `decodeURIComponent` em `:263` lança `URIError` para um valor
com `%` mal formado, e o identificador decodificado vai direto para a consulta de `:265`. Nenhum dos
dois erros é tratado, e a rota é pública (`@Public()`, `:95`).

| `POST /api/auth/two-factor/verify`, corpo `{"code":"123456"}`, sem login pendente | Observado |
| --- | --- |
| sem cookie | `401` `invalid_code` (controle; é o caso que a prova da C32 exercita) |
| cookie `two_factor` igual a `abc.def`, vazio, ou `semponto` | `401` `invalid_code` |
| cookie `two_factor` igual a `%E0%A4%A.x` | `500` `internal_error`; no log, `URIError: URI malformed` |
| cookie `two_factor` igual a `ab%00cd.assinatura` | `500` `internal_error`; no log, `invalid byte sequence for encoding "UTF8": 0x00` na consulta de `verifications` |

A AC 23 manda `401` `invalid_code` quando a verificação "é chamada sem um login pendente"; nas duas
últimas linhas não há login pendente e a resposta é `500`. Nenhuma sessão é criada e nada vaza. A
rodada 1 tinha anotado a leitura sem assinatura como observação menor, sem testar.

### N4 - o Better Auth ainda escreve no `console`, fora de JSON e com os parâmetros da consulta, num caminho (não reprova a C100)

A correção passou o registro do Better Auth pelo `logBetterAuth` (`apps/api/src/auth.ts:33`). Um
ponto do pacote não usa o logger: em `@better-auth/core@1.7.7`, `dist/db/adapter/factory.mjs:392`,
quando a segunda consulta de uma junção falha, ele chama `console.error(error)` com o erro inteiro.
O adaptador do Drizzle não faz junção nativa aqui, então toda leitura de sessão (sessão, depois
usuário) e todo login (usuário, depois contas) são duas consultas, e a falha da segunda cai ali.

Rodado no processo real com o banco de pé e uma tabela renomeada: com `users` fora, cada requisição
autenticada escreveu no stderr um bloco de cerca de 40 linhas fora de JSON, com
`params: [ '<id do usuário>' ]`; com `accounts` fora, o mesmo, com `params: [ '<id do usuário>', 100 ]`.
574 linhas fora de JSON nas duas situações. Com o banco inteiro fora (recusando, parado, pendurado)
o caminho não é alcançado, porque a primeira consulta já falha - por isso o teste novo, que só
exercita o banco recusando conexão, afirma "tudo o que o processo escreveu é JSON" e passa.

Não reprova a C100: o parâmetro dessa segunda consulta é sempre a chave estrangeira lida da primeira
(o id do usuário), que não é um dos seis valores da AC 74 e que a AC 73 manda registrar. Fica como
achado porque o comentário de `apps/api/src/auth.ts:32` promete mais do que o código entrega, e
porque uma junção nova do pacote com outra chave mudaria o que é escrito.

### Suspeito, sem reprovar linha

- `apps/api/src/log-safe.ts:9` e `:17` reconhecem o erro do Drizzle pela forma (`query` e `params`
  no objeto, `\nparams: ` no texto). Uma versão do Drizzle que mude o formato da mensagem reabre o F2
  sem ruído; o teste novo pegaria no caminho do banco recusando conexão, e só nele.
- A causa do erro (`[cause]`, a mensagem do Postgres) é registrada como veio. Algumas mensagens do
  Postgres citam o valor recusado (`invalid input syntax for type uuid: "..."`). Hoje nenhum valor do
  cliente chega a uma coluna tipada sem passar por `UUID.test` (`apps/api/src/users/users.service.ts:19`,
  `:73`), então não achei como alcançar; vale para as próximas features, que herdam o `describeError`.
- O teste novo da checagem de origem afirma só `>= 400` para as grafias que o roteador não despacha
  (`apps/api/test/csrf.test.ts:118`); um `500` passaria. No processo real as três respondem `404`.
- `apps/api/src/auth/auth.controller.ts:71` conta a tentativa antes de conferir a senha e só a
  desfaz quando o login termina bem. Li, não rodei: uma falha do banco depois da contagem deve
  contar como tentativa errada de quem digitou a senha certa.
- `pnpm users:create-admin` não passa pelo `describeError`: uma falha de consulta ali sairia pelo
  erro cru do Node, com os parâmetros (nome, e-mail, hash). Não rodei; o comando é do operador e
  nenhum desses valores está na AC 74.
- Pela origem do web continuo sem ter rodado as grafias do F1 (a rodada 1 também não). Deixou de
  importar para as linhas: a API recusa todas diretamente.

## Fix diff

verified at 328dda1. Lido inteiro; o escopo abaixo é o do diff, não o das mensagens de commit.

| Arquivo | O que mudou | Rejulgado |
| --- | --- | --- |
| `apps/api/src/csrf.ts` | o prefixo `/api` é testado por expressão regular sem diferenciar maiúsculas (`:10`, `:19`) | C22, C23, C24, C25 (tabela); C26 passa na stack real |
| `apps/api/src/log-safe.ts` (novo) | `describeError` (nome, consulta sem parâmetros, quadros da pilha, causa) e `logBetterAuth` (linha JSON; objetos anexos ficam de fora) | C100, C99; N4 |
| `apps/api/src/problem.filter.ts` | a linha `unhandled exception` leva `describeError(exception)` em vez de `exception.stack` (`:89`) | C100; C101 passa; `unhandled_500_hides_exception` e `health_503_when_db_refuses` da `fundacao` passam na suíte inteira |
| `apps/api/src/auth.ts` | `logger: { log: logBetterAuth }` (`:33`) | C100; C1 passa |
| `apps/api/test/auth-log.test.ts` | a captura inclui o `console`; teste novo `query_failures_log_no_parameters` | C99, C100 (citações refeitas) |
| `apps/api/test/csrf.test.ts` | teste novo `origin_check_covers_every_spelling_the_router_dispatches`, ao fim do arquivo | C22 a C25 (linhas não se moveram) |
| `apps/web/e2e/forms.spec.ts` | espera da mensagem de indisponível de 8 s para 4 s | C74, C75, C76 (citações refeitas) |
| `apps/web/e2e/proxy.spec.ts` | teste novo `unreachable_api_answers_502_or_504_problem`; `afterEach` tolera servidor já fechado | C13 (citações refeitas) |

Os testes novos, julgados. Nenhum deles é prova de check: `checks.md` não os nomeia.

- `origin_check_covers_every_spelling_the_router_dispatches` (`apps/api/test/csrf.test.ts:96-134`):
  primeiro prova que as quatro grafias chegam ao handler com a origem do web (`:102`, `:104`), depois
  afirma `403` `csrf_rejected` com origem estranha e sem origem (`:111`, `:112`), handler não
  executado (`:120`), login por `/API/auth/login` sem cookie e sem sessão (`:126` a `:128`) e logout
  por `/API/auth/logout` com a sessão mantida (`:132`, `:133`). Afirma a propriedade. **Rodado contra
  o código antigo** (cópia da árvore fora do repositório, com `auth.ts`, `csrf.ts` e
  `problem.filter.ts` de `1d5598f`): falha em `:111`, "/API/test/probe, origem https://outro.example:
  expected 200 to be 403". As quatro provas antigas da C22 a C25 passam contra o código antigo, como
  a rodada 1 mostrou.
- `query_failures_log_no_parameters` (`apps/api/test/auth-log.test.ts:141-177`): API com o banco
  recusando conexão, login com e-mail digitado e `GET /api/users` com cookie de sessão real; afirma
  que as duas consultas foram registradas (`:167`, `:168`), que e-mail, senha, token, cookie e
  `AUTH_SECRET` não aparecem (`:171`) e que toda linha é JSON (`:175`). Afirma a propriedade no modo
  de falha da rodada 1. **Contra o código antigo**: falha em `:171`, "email no log". Com só o
  `logger` do Better Auth desfeito (`auth.ts` antigo, o resto de `328dda1`): falha em `:171`, "token
  no log" - a captura do `console` funciona. Limites: um modo de falha só (ver N4), e o `cookie`
  comparado é o par `nome=valor`, mais fraco que a comparação do token.
- `unreachable_api_answers_502_or_504_problem` (`apps/web/e2e/proxy.spec.ts:96-126`): API que aceita a
  conexão e não responde, `504` `gateway_timeout` em `application/problem+json` com `requestId`
  (`:112` a `:115`); porta sem ninguém, `502` `bad_gateway` (`:122` a `:125`). Afirma a linha da
  `Surface`. Não veio com mudança de código, então não há comportamento antigo para comparar.
- `apps/web/e2e/forms.spec.ts:40-42`: limite de 4 s. Uma tela que só desistisse aos 7 s reprovaria.

## Probes

verified at 328dda1. Tudo contra `node apps/api/dist/main.js`, construído em `328dda1` com
`pnpm --filter @academia/api build`, com Postgres 18 real num container próprio, migrado por
`pnpm db:migrate`, administrador criado por `pnpm users:create-admin`, `WEB_ORIGIN=http://localhost:3000`.
As requisições foram escritas direto no socket, para o caminho e os cabeçalhos irem como dados. Os
scripts e os logs ficaram fora do repositório, na pasta temporária da sessão.

**Checagem de origem (F1; C22, C23).** 181 requisições, 179 delas com origem estranha ou sem origem.

| Grupo | Requisições | Observado |
| --- | --- | --- |
| Controle: `POST /api/auth/login` com `Origin: https://outro.example` | 1 | `403` `csrf_rejected` |
| Controle: `POST /api/auth/login` com `Origin` igual a `WEB_ORIGIN` | 1 | `200`, cookie, 1 sessão nova |
| As do F1: `/API/auth/login` com origem estranha, sem `Origin`, com `Sec-Fetch-Site: cross-site`; `/Api/Auth/Login` e `/api/AUTH/LOGIN` com origem estranha | 5 | `403` `csrf_rejected` nas cinco; sem cookie, 0 sessões novas |
| A do F1: `POST /API/auth/logout` com cookie válido e origem estranha | 1 | `403`; sessões antes e depois: 3 e 3 |
| 33 grafias do caminho do login, cada uma com origem estranha e sem origem: maiúsculas, barra final, barras duplas, `/./`, `/x/../`, `%61pi`, `%2F`, `%00`, `;v=1`, barra invertida, `?`, `#`, forma absoluta (`http://outro.example/API/auth/login`), `ı` | 66 | 38 respostas `403` `csrf_rejected` (as grafias que o roteador despacha, e as que ficam sob `/api`), 24 `404` e 4 `400` (as que não chegam a rota nenhuma); 0 cookies, 0 sessões |
| 19 variações de cabeçalho em `POST /api/auth/login`: `Origin: null`, vazio, com barra final, em maiúsculas, com sufixo, outra porta, outro esquema, dois valores, `Origin` repetido, origem estranha com `Sec-Fetch-Site: same-origin`, `Sec-Fetch-Site` `same-site`, `none`, `Same-Origin`, repetido, `X-Forwarded-Host`, `Referer` | 19 | `403` `csrf_rejected` nas 19 |
| `Origin` repetido, com `WEB_ORIGIN` primeiro | 1 | `403` (o Node junta os dois valores) |
| Por desenho da door 8: sem `Origin`, `Sec-Fetch-Site: same-origin` | 1 | `200` (é a linha que a C24 prova) |
| Método: `GET` com `X-HTTP-Method-Override: POST`, `GET` com `?_method=POST`, `post` e `Post` em minúsculas, `HEAD`, `OPTIONS` | 6 | `404` x4, `400` x2; nenhum handler de escrita |
| As 10 rotas de escrita registradas, com sessão válida de administrador, em 4 grafias (como registrada, em maiúsculas, com barra final, `/Api`), com origem estranha e sem origem | 80 | `403` `csrf_rejected` nas 80; usuários antes e depois: 1 e 1; a sessão do administrador continuou valendo |

**Segredos no log (F2; C100).** Um processo principal com o banco de pé e dois processos com o banco
fora. Antes de cada situação: sessão nova de recepção, sessão nova de administrador com 2FA, dois
logins pendentes de segundo fator. Em cada situação, 18 requisições que levam ao menos um dos valores
da AC 74: login certo, com senha errada, com e-mail inexistente, do administrador; verificação por
TOTP válido e por código de recuperação; sessão; lista de usuários; OpenAPI; troca de senha; ativar,
confirmar e desativar 2FA; criar, alterar e redefinir a senha de um usuário; logout; `/health`.
Procurados em tudo o que cada processo escreveu: os e-mails como digitados (com maiúsculas) e em
minúsculas, todas as senhas, o `AUTH_SECRET`, o segredo TOTP, cada código TOTP enviado, os códigos de
recuperação, e de cada cookie (sessão e `two_factor`) o valor como enviado, decodificado, o token e
a assinatura - 232 valores ao fim.

| Situação | Respostas | Fora de JSON | Valores encontrados |
| --- | --- | --- | --- |
| Banco de pé: cadastro do 2FA, criação de usuário | `200`, `204`, `201` | 0 | 0 |
| Banco de pé: os cinco caminhos da C100, código inválido, bloqueio | `401`, `200`, `204`, `429` | 0 | 0 |
| Tabela `users` renomeada | `500` em 17 de 18 | 451 linhas (N4) | 0 |
| Tabela `sessions` renomeada | `500` em 15 de 18 | 0 | 0 |
| Tabela `accounts` renomeada | `500` em 8 de 18 | 123 linhas (N4) | 0 |
| Tabela `verifications` renomeada | `500` em 3 de 18 | 0 | 0 |
| Tabela `two_factors` renomeada | `500` em 5 de 18 | 0 | 0 |
| Tabela `login_throttles` renomeada | `500` em 6 de 18 | 0 | 0 |
| E-mail maior que o índice; byte nulo no nome | `500`, `500` | 0 | 0 |
| Postgres parado com a API no ar (`docker stop`) | `500` em 17 de 18, `/health` `503` | 0 | 0 |
| **As do F2**: processo novo, banco recusando conexão - `POST /api/auth/login` com `email.digitado.na.sonda@exemplo.com`, `GET /api/users` com cookie assinado - e as 18 | `500` `internal_error` nas duas e em 17 de 18, `/health` `503` | 0 | 0 |
| Processo novo, banco que aceita a conexão e não responde | `500` nas três | 0 | 0 |

O que o processo escreve agora nas duas requisições do F2: para o login, uma linha JSON
`msg: "unhandled exception"` cujo `error` começa por `Error: Failed query: select "id", "email",
"active" from "users" where "users"."email" = $1`, seguido dos quadros da pilha e de
`[cause] Error: connect ECONNREFUSED`; para `GET /api/users`, uma linha JSON `msg: "better-auth"`,
`detail: "INTERNAL_SERVER_ERROR"`, com a consulta de `sessions` sem parâmetro, e uma linha
`unhandled exception` com `APIError: Failed to get session`. Nenhuma linha JSON de nenhum dos logs
contém a palavra `params`. Os três processos seguiram vivos até o fim.

**Entradas que o schema aceita** (por onde saíram N1, N2 e N3): resultados nas tabelas daqueles
achados. 18 linhas `unhandled exception`, nenhuma fora de JSON, nenhum valor digitado no log.

**Testes novos contra o código antigo**: cópia da árvore de `328dda1` numa pasta temporária fora do
repositório (`git archive`, sem `git worktree` e sem tocar a árvore real), com os arquivos de
`apps/api/src` de `1d5598f`; resultados em `## Fix diff`. A cópia foi apagada.

## Level and sampling judgment

carried from 1d5598f, com três acréscimos desta rodada.

- Nível: toda afirmação que nomeia status, rota ou forma de resposta tem prova que cruza a
  fronteira. As de `apps/api` passam por HTTP contra a aplicação montada com o mesmo `AppModule` e
  `configureApp` do processo real (`apps/api/test/support/app.ts:28-36`) sobre Postgres real. C14 e
  C47 usam o processo construído. C63, C64 e a parte do comando na C9 rodam
  `pnpm users:create-admin` de verdade. C65 a C68 rodam contra o banco migrado. C13 e C69 a C91
  passam pelo navegador contra o Next construído, com a API falsa que os checks declaram. C16, C26 e
  C93 passam pelo processo real da stack. Não há lacuna de nível.
- Amostragem: as provas que afirmam N casos são guiadas por tabela e travam a contagem. As exceções
  da rodada 1 (P2, P3) seguem.
- Acréscimo (verified at 328dda1): C3, C32, C41, C51 e C56 afirmam uma classe ("e-mail inexistente",
  "sem login pendente", "dados válidos") e a prova exercita um membro comum dela. Os contraexemplos
  de N1 a N3 são membros da mesma classe que a prova não alcança: valores no limite do que o banco
  guarda e um cookie que não veio do servidor.
- Acréscimo (verified at 328dda1): a prova da C100 continua percorrendo só o banco de pé; o modo de
  falha está no teste novo, fora dos checks, e cobre um modo de dez.
- Acréscimo (verified at 328dda1): este profile não injeta falhas. Os dois testes novos da API foram
  rodados contra o código antigo e falham nele; é a única evidência desta rodada de que uma asserção
  pega uma implementação errada.

## Swept

- "dependency failure: banco fora numa rota `/api` cai no `500 internal_error` do `ProblemFilter` e
  no `503` de `/health`": verified at 328dda1, porque a correção mexeu no `ProblemFilter`. No
  processo real, com o banco recusando conexão, parado e pendurado, toda rota `/api` da sonda
  respondeu `500` `internal_error` em `application/problem+json` e `/health` respondeu `503`.
  `health_503_when_db_refuses`, `health_ok_200` e `unhandled_500_hides_exception` passaram na suíte
  inteira. O código é `apps/api/src/problem.filter.ts:42-45` (status) e `:11` (código); as linhas andaram 1 com o `import` novo.
- "`AUTH_SECRET` e `WEB_ORIGIN` rejeitadas na subida": `missing_var_exits_1_naming_it` passou em
  `328dda1` (suíte inteira). `up_wait_exits_zero_with_three_healthy` e
  `env_example_lists_every_required_key`: carried from 1d5598f (não rodadas de novo; a correção não
  toca `compose.yaml`, `.env.example` nem `apps/api/src/env.ts`).
- As demais linhas de `Swept`: carried from 1d5598f - nomeiam checks desta feature (julgados na
  tabela) ou são política aprovada.

## Coverage

Não é recomputado no profile `light`. O que encontrei fora da tabela do autor: F3 (segue sem linha)
e N1 a N3.

## Test policy rows

No profile `light` não há veredito por linha; `checks.md` diz o mesmo.

## Faults injected

Não roda no profile `light`. Nenhuma mutação foi feita na árvore real.

## Steps not run

- Passo 1 (fontes binding), recomputação do `Coverage`, vereditos de `Test policy` e passo 4
  (injeção de falhas): são dos profiles `standard` e `ui`.
- Passo 5 (percorrer o fluxo com o usuário): não há usuário na sessão do Verifier. A correção não
  toca nenhuma tela.
- As 87 linhas `carried` não foram rejulgadas contra o código: a prova de cada uma foi rodada, a
  evidência é a da rodada 1.

## Tree state

`git status --porcelain` antes e depois das provas e sondas: só `?? CLAUDE.md`, que já estava lá.
Nenhum arquivo de `apps/`, `packages/` ou `tests/` foi alterado, nada foi commitado, nenhum
`git stash`, `reset` ou `worktree`. `apps/api/dist` (ignorado pelo git) foi reconstruído. Os arquivos
que este Verifier escreveu: este relatório e, pelo `lessons.py`, `.specs/lessons.json` e
`.specs/LESSONS.md`. O container do Postgres das sondas foi removido, nenhum projeto do Compose
ficou para trás e as portas 3100 e 3199 estão livres.

## Gate

`api` + `db` + `repo` + `web` + `stack` + `gate` em `328dda1` (6 invocações, cada uma exit 0) - 102 passed, 0 failed. 97 de 102 checks provados com evidência localizada; C22, C23 e C100 passaram a provados; C3, C32, C41, C51 e C56 reprovados por contraexemplo novo rodado no processo real, apesar da prova verde.
