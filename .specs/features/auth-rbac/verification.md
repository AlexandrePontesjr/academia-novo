# Autenticação e controle de acesso por perfil verification

**Verdict**: FAIL
**Profile**: light
**Diff range**: 41766a8..bd273b6b86ce2bcd205b75997b8805837945bc7d
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

As 102 provas nomeadas em `checks.md` foram rodadas de novo em `bd273b6` e as 102 passaram, cada
teste listado individualmente. 99 dos 102 checks estão provados com evidência localizada.

O que a rodada 2 reprovou está fechado, com evidência do processo real (`apps/api/dist/main.js`
construído em `bd273b6`, Postgres 18 real):

- **N1** (C3, C41, C51): e-mail de 255 caracteres ou mais responde `422` com `path` `email`, no
  login e em `POST /api/users`; o de 254, inexistente, responde `401` cinco vezes e depois `429`.
- **N2** (C51, C56): `U+0000` no nome responde `422` com `path` `name`, em `POST` e em `PATCH`.
- **N3** (C32): o cookie `two_factor` forjado responde `401` `invalid_code`, em 45 variações.

Em 483 requisições ao processo real nesta rodada (todo campo de texto, todo `:id`, cookies,
cabeçalhos e codificações do corpo), nenhuma respondeu `5xx` e nenhuma linha `unhandled exception`
foi escrita. C3, C32, C41 e C56 passam a provados.

O veredito é FAIL por três checks, todos por contraexemplo novo desta rodada, achado ao procurar
outros limites de tamanho e de codificação da mesma classe do N1. São dois defeitos, os dois em
código que as correções não mexeram (existem desde `c87ec24`), e nenhum vaza segredo, cria sessão
indevida ou responde `5xx`:

- **C51 e C60** (AC 37, AC 44): uma senha que o schema aceita - até 128 caracteres - e que passa de
  128 unidades UTF-16 (por exemplo 127 letras e um emoji) é gravada com `201`/`204` e depois é
  recusada no login com `401`. O usuário criado, ou com a senha redefinida, não consegue entrar (N5).
- **C37** (AC 27): `two-factor/enable` e `two-factor/disable` com uma senha errada de 129 caracteres
  ou mais respondem `400` `bad_request`, e não `422` com `path` `password` (N6).

Nada disso foi inferido: cada ponto foi executado. É a terceira rodada, o limite do `verify.md`
antes de levar a decisão ao usuário. Achados, o destino de cada achado das rodadas 1 e 2 e o que
achei suspeito mesmo onde o check passou estão em `## Findings`.

## Scope of this round

Rodada com escopo, como manda "Re-verifying after a fix". Cada seção diz de onde vem:

| Parte | Origem |
| --- | --- |
| As 102 provas | verified at bd273b6 - todas rodadas de novo, por alvo |
| C3, C32, C41, C51, C56 (não eram PASS) | verified at bd273b6 - rejulgadas contra o código, com as sondas N1, N2 e N3 da rodada 2 refeitas e ampliadas |
| C2, C9, C12, C15, C17, C30, C31, C43, C44, C53, C63, C64, C91, C96 (código ou prova que o diff da correção toca) | verified at bd273b6 - citações refeitas ou conferidas, rejulgadas |
| C10, C37, C60 | verified at bd273b6 - sondadas nesta rodada; C37 e C60 com contraexemplo novo |
| C13, C22 a C25, C74 a C76, C99, C100 (10 linhas) | carried from 328dda1 - a evidência é a da rodada 2; a prova foi rodada de novo |
| As outras 70 linhas da tabela | carried from 1d5598f - a evidência é a da rodada 1; a prova foi rodada de novo |
| `## Level and sampling judgment`, `## Swept` | carried, salvo os itens marcados |
| `## Findings`, `## Fix diff`, `## Probes`, `## Gate`, `## Tree state` | verified at bd273b6 |

A correção são três commits depois do relatório da rodada 2 (`4ec3172`, só `.specs`): `3eba0b4`,
`3f8aa37` e `bd273b6`. `git diff 328dda1..bd273b6 -- . ':(exclude).specs'` toca 9 arquivos, lidos
inteiros: `apps/api/src/auth/auth.controller.ts`, `apps/api/src/create-admin.ts`,
`packages/contracts/src/auth.ts`, `packages/contracts/src/users.ts`,
`apps/api/test/hostile-input.test.ts` (novo), `apps/api/test/login.test.ts`,
`apps/api/test/session.test.ts`, `apps/api/test/two-factor.test.ts` e `apps/api/test/users.test.ts`.
`plan.md` e `checks.md` não mudaram.

## Binding sources

Não roda no profile `light` (passo 1 é do profile `ui`). O plano não marca nenhuma fonte como
binding. A correção não toca nenhuma tela.

## Checks

As provas foram agrupadas por alvo, uma invocação por alvo, rodadas da raiz do repositório em
`bd273b6`, com reporter que lista cada teste pelo nome. Nenhum filtro ficou sem teste: cada um dos
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
invocação `api` desta rodada, em `bd273b6`, que saiu com código 0. Na coluna `Evidence`, cada célula
começa por `verified at bd273b6`, `carried from 328dda1` (última verificação na rodada 2) ou
`carried from 1d5598f` (última verificação na rodada 1); uma citação `:NN` sem caminho continua no
arquivo citado imediatamente antes, na mesma célula. As citações `carried` são de arquivos que o diff
desta correção não toca, então os números de linha são os mesmos; onde o texto de uma célula
`carried` diz "nesta rodada" ou "da rodada 1", é a voz do relatório de onde ela veio, e um "ver
`## Probes`" nela aponta para aquele relatório (`4ec3172` o da rodada 2, `ed57a4b` o da rodada 1).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `signInEmail` por `auth.api` com 2FA não cria sessão; `verifyTOTP` cria exatamente uma e o cookie resolve o usuário | `api` -t `two_factor_via_auth_api_with_return_headers` exit 0 | carried from 1d5598f: `apps/api/test/better-auth.test.ts:79` - `expect(await sessionRows()).toEqual([])`; `apps/api/test/better-auth.test.ts:87` - `expect(await sessionRows()).toEqual([{ user_id: user.id }])`; `apps/api/test/better-auth.test.ts:92` - `expect(session?.user.id).toBe(user.id)` | PASS |
| C2 | login sem 2FA: `200`, exatamente `{"status":"authenticated"}`, linha em `sessions`, cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain` | `api` -t `login_200_authenticated_with_session_cookie` exit 0 | verified at bd273b6: `apps/api/test/login.test.ts:20` - `expect(response.status).toBe(200)`; `apps/api/test/login.test.ts:21` - `expect(await response.json()).toEqual({ status: 'authenticated' })`; `apps/api/test/login.test.ts:22` (uma linha em `sessions`); `apps/api/test/login.test.ts:30` a `:33` - `expect(attributes).toContain('httponly')`, `'secure'`, `'samesite=lax'`, `'path=/'`; `apps/api/test/login.test.ts:34` - `expect(attributes.filter((attribute) => attribute.startsWith('domain'))).toEqual([])`. Citações refeitas: a correção acrescentou um `import` ao arquivo e as linhas andaram 1. O schema do e-mail mudou (`packages/contracts/src/auth.ts:17`); a prova passa | PASS |
| C3 | e-mail inexistente, senha errada e usuário inativo: `401` `invalid_credentials`, sem `Set-Cookie`, corpos idênticos salvo `requestId` | `api` -t `login_401_identical_for_three_causes` exit 0 | verified at bd273b6: `apps/api/test/login.test.ts:51` - `expect(response.status).toBe(401)`; `apps/api/test/login.test.ts:52` - `expect(body.code).toBe('invalid_credentials')`; `:54` (sem `Set-Cookie`); `:58` e `:59` (corpos iguais). **N1 fechado.** Código: `packages/contracts/src/auth.ts:17` a `:19` - `z.email(...).max(254, ...)`. **Sonda da rodada 2 refeita no processo real**: e-mail inexistente de 64 e de 254 caracteres não compressíveis respondeu `401` `invalid_credentials`; de 255, 320, 1.000, 2.600, 2.700, 2.712, 2.800, 3.000 e 6.000 respondeu `422` `validation_failed` com um item de `path` `email` (na rodada 2, de 2.700 em diante era `500`). Nenhuma linha `unhandled exception`. O plano manda `422` para o que o schema reprova (AC 14) e `401` para o e-mail que não existe (AC 2): as duas respostas são as do plano. Ver `## Probes` | PASS |
| C4 | `GET /api/auth/session` com cookie válido: `200` com os cinco campos de `user` e `twoFactorEnrollmentRequired`, e nenhuma outra chave | `api` -t `session_200_returns_user_fields` exit 0 | carried from 1d5598f: `apps/api/test/session.test.ts:34` - `expect(response.status).toBe(200)`; `apps/api/test/session.test.ts:35` - `expect(await response.json()).toStrictEqual({ user: { id, name, email, role: 'reception', twoFactorEnabled: false }, twoFactorEnrollmentRequired: false })` | PASS |
| C5 | sem cookie, cookie adulterado e sessão expirada: `401` `unauthorized` nos três | `api` -t `session_401_without_valid_session` exit 0 | carried from 1d5598f: `apps/api/test/session.test.ts:49` e `:50` (sem cookie), `:57` e `:58` (adulterado), `:64` e `:65` (expirada) - `expect(expired.status).toBe(401)`, `expect(await code(expired)).toBe('unauthorized')` | PASS |
| C6 | logout: `204`, linha da sessão some, o mesmo cookie recebe `401` | `api` -t `logout_204_deletes_session_row` exit 0 | carried from 1d5598f: `apps/api/test/session.test.ts:75` - `expect(response.status).toBe(204)`; `apps/api/test/session.test.ts:76` - `expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toEqual([])`; `apps/api/test/session.test.ts:78` - `expect(reused.status).toBe(401)` | PASS |
| C7 | sessão com último uso há 30 min recebe `401` | `api` -t `session_expires_after_30_min_idle` exit 0 | carried from 1d5598f: `apps/api/test/session.test.ts:89` - `expect(response.status).toBe(401)` depois de `advance(30)`; `apps/api/test/session.test.ts:90` - `expect(await code(response)).toBe('unauthorized')` | PASS |
| C8 | sessão usada aos 29 min responde `200` aos 58 min | `api` -t `session_slides_on_use` exit 0 | carried from 1d5598f: `apps/api/test/session.test.ts:98` - `expect((await client.get('/api/auth/session')).status).toBe(200)` em `advance(29)`; `apps/api/test/session.test.ts:101` - a mesma expressão em `advance(58)` | PASS |
| C9 | os quatro caminhos que gravam senha guardam `$argon2id$v=19$m=19456,t=2,p=1$...` sem a senha | `api` -t `every_password_write_stores_argon2id` exit 0 | verified at bd273b6: `apps/api/test/password.test.ts:64` - `expect(stored.startsWith(ARGON2ID_PREFIX), ...).toBe(true)`; `apps/api/test/password.test.ts:65` - `expect(stored, path).not.toContain(password)`; `apps/api/test/password.test.ts:61` - `expect(writes).toHaveLength(4)` (comando real por `pnpm users:create-admin`, `POST /api/users`, `PUT /api/auth/password`, `PUT /api/users/:id/password`). A correção mexeu em `apps/api/src/create-admin.ts:59` a `:65` (só o `try`/`catch` em volta de `main`); o caminho que grava a senha é o mesmo. No processo real, o comando com uma senha de 65 caracteres astrais gravou `$argon2id$v=19$m=19456,t=2,p=1$...` (ver N5 para o que acontece no login) | PASS |
| C10 | troca da própria senha: `204`, sessão atual `200`, a outra `401`, login com a nova `200` e com a antiga `401` | `api` -t `change_password_204_keeps_current_session_only` exit 0 | verified at bd273b6: `apps/api/test/password.test.ts:81` - `expect(response.status).toBe(204)`; `:82` (`current` 200); `:83` - `expect((await other.get('/api/auth/session')).status).toBe(401)`; `:84` (nova 200); `:85` (antiga 401); `:74` - `expect(newPassword).toHaveLength(12)`. A afirmação do check é sobre uma senha nova de 12 caracteres, e com 12 caracteres ela vale (12 caracteres astrais são 24 unidades). Fora do que o check e a AC 9 afirmam, anotado: com uma senha nova de 65 caracteres astrais a rota responde `204` e o login seguinte com a senha nova responde `401` - a pessoa se tranca para fora quando a sessão acabar. Ver N5 | PASS |
| C11 | senha atual errada: `422`, exatamente um item, `path` `currentPassword`, senha guardada não muda | `api` -t `wrong_current_password_422` exit 0 | carried from 1d5598f: `apps/api/test/password.test.ts:99` - `expect(response.status).toBe(422)`; `:101` - `expect(body.errors).toHaveLength(1)`; `:102` - `expect(body.errors![0]!.path).toBe('currentPassword')`; `:104` - `expect(await storedPassword(user.email)).toBe(before)` | PASS |
| C12 | nas três rotas, 11 e 129 caracteres: `422` com `path` do campo; 12 e 128 aceitos | `api` -t `password_length_bounds_on_three_routes` exit 0 | verified at bd273b6: `apps/api/test/password.test.ts:148` - `expect(response.status, ...).toBe(422)`; `:149` - `expect(body.errors?.map((error) => error.path), ...).toEqual([field])` para `[11, 129]`; `:154` - `expect(response.status, ...).toBe(accepted)` para `[12, 128]`, sobre as três rotas da tabela em `:115-141`. A prova usa `'x'.repeat(n)`; o que ela afirma (a rota aceita 12 e 128, recusa 11 e 129) é sobre a gravação, e no processo real uma senha de 128 caracteres astrais também foi aceita (`201`). Se a senha aceita entra depois no login é assunto da C51 e da C60 (N5) | PASS |
| C13 | para `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, o web repassa método, corpo, `Origin` e `Cookie`, e devolve status, corpo, `Set-Cookie` e `X-Request-Id` | `web` -g `proxy_forwards_request_and_response` exit 0 | carried from 328dda1: `apps/web/e2e/proxy.spec.ts:76` - `expect(forwarded[0]!.method, method).toBe(method)`; `:78` (corpo); `:80` (`Origin`); `:81` - `expect(forwarded[0]!.cookie, method).toContain('sessao=valor-da-sessao')`; `:84` - `expect(response.status, method).toBe(218)`; `:86` (`X-Request-Id`); `:88` (cookie `HttpOnly` da API no navegador). Citações refeitas: a correção acrescentou um teste ao arquivo e mexeu no `afterEach` (`:44`); as asserções desta prova são as mesmas. Para `GET` o navegador não manda `Origin` e a asserção de `:80` é a ausência | PASS |
| C14 | `AUTH_SECRET` ausente, de 31 caracteres, `WEB_ORIGIN` ausente ou `ftp://x`: código 1, nome impresso, nenhum valor impresso | `api` -t `auth_env_rejected_exits_1_naming_var` exit 0 | carried from 1d5598f: `apps/api/test/boot.test.ts:103` - `expect(status, JSON.stringify(env)).toBe(1)`; `:104` - `expect(output).toContain(variable)`; `:106` - `expect(output).not.toContain(value)` sobre os quatro casos de `:92-97`; `:98` - `expect(cases[1]!.env.AUTH_SECRET).toHaveLength(31)`. Processo real: `spawnSync(process.execPath, ['dist/main.js'])` em `:40` | PASS |
| C15 | `POST /api/auth/sign-up/email` e `/sign-in/email`: `404` `not_found`, nenhum usuário criado | `api` -t `better_auth_handler_is_not_mounted` exit 0 | verified at bd273b6: `apps/api/test/login.test.ts:77` - `expect(response.status).toBe(404)`; `apps/api/test/login.test.ts:78` - `expect(... .code).toBe('not_found')`; `apps/api/test/login.test.ts:80` - `expect(await stack.query('select id from users')).toEqual(usersBefore)`. Citações refeitas (linhas andaram 1) | PASS |
| C16 | stack de pé: admin criado pelo comando no container `api`; login pela origem do web `200` com cookie; sessão `200` pela mesma origem | `stack` -t `login_through_web_origin` exit 0 | carried from 1d5598f: `tests/stack/compose.test.ts:92` - `expect(created.status, created.output).toBe(0)`; `:99` - `expect(login.status).toBe(200)`; `:105` - `expect(cookie).toMatch(/session_token=/)`; `:109` - `expect(session.status).toBe(200)` | PASS |
| C17 | login sem `password` e com `email` `x`: `422` problem+json, `validation_failed`, exatamente dois itens (`email`, `password`), `message` não vazia e diferente da padrão em inglês | `api` -t `invalid_body_422_one_error_per_field` exit 0 | verified at bd273b6: `apps/api/test/validation.test.ts:48` - `expect(response.status).toBe(422)`; `:49` (content-type); `:50` - `expect(body.code).toBe('validation_failed')`; `:51` - `expect(body.errors?.map((error) => error.path).sort()).toEqual(['email', 'password'])`; `:53` (não vazia); `:55` - `expect(error.message, error.path).not.toBe(englishByPath.get(error.path))`. O schema do e-mail ganhou um segundo teste (formato e tamanho); a resposta segue com um item por campo porque `apps/api/src/validation.ts:44` a `:51` guarda o primeiro defeito de cada `path`. No processo real, um e-mail de 255 caracteres e de formato inválido respondeu `422` com um item só, e um nome de 121 caracteres com `U+0000` também | PASS |
| C18 | campo aninhado sai com `path` `address.zip` | `api` -t `nested_path_uses_dot_notation` exit 0 | carried from 1d5598f: `apps/api/test/validation.test.ts:65` - `expect(body.errors?.map((error) => error.path)).toEqual(['address.zip'])` | PASS |
| C19 | o corpo do `422` não contém nenhum valor enviado | `api` -t `errors_never_echo_client_values` exit 0 | carried from 1d5598f: `apps/api/test/validation.test.ts:82` - `expect(text).not.toContain(String(value))` sobre quatro marcadores; `:80` - quatro itens em `errors` | PASS |
| C20 | corpo ilegível: `400` `bad_request`, não `422` | `api` -t `unreadable_body_stays_400` exit 0 | carried from 1d5598f: `apps/api/test/validation.test.ts:91` - `expect(response.status).toBe(400)`; `:92` - `expect((await problem(response)).code).toBe('bad_request')` | PASS |
| C21 | as nove rotas com `422` na `Surface` respondem `422` `validation_failed` | `api` -t `every_route_with_body_answers_422` exit 0 | carried from 1d5598f: `apps/api/test/validation.test.ts:116` - `expect(response.status, ...).toBe(422)`; `:117` - `expect(parsed.code, ...).toBe('validation_failed')` sobre a tabela de `:98-109`; `:110` - `expect(routes).toHaveLength(9)`. As nove batem com as linhas da `Surface` que listam `422` | PASS |
| C22 | para `POST`, `PUT`, `PATCH`, `DELETE`, requisição `/api` com `Origin` estranha: `403` `csrf_rejected`, handler não executa; login certo nessa condição não cria sessão | `api` -t `foreign_origin_403_without_running_handler` exit 0 | carried from 328dda1: `apps/api/test/csrf.test.ts:37` - `expect(response.status, method).toBe(403)`; `:39` - `expect((await problem(response)).code, method).toBe('csrf_rejected')`; `:41` - `expect(executed).toBe(0)`; `:50` (sem linha em `sessions`). Código: `apps/api/src/csrf.ts:10` (o prefixo `/api` passou a ser testado sem diferenciar maiúsculas) e `apps/api/src/csrf.ts:19`. **Sondas da rodada 1 refeitas no processo real**: `POST /API/auth/login` com `Origin: https://outro.example` e credenciais certas respondeu `403` `csrf_rejected`, sem cookie e sem linha nova em `sessions`; `POST /API/auth/logout` com a mesma origem respondeu `403` e a sessão ficou. Em 179 requisições com origem estranha ou sem origem (33 grafias do caminho, 19 variações de cabeçalho, 6 de método, as 10 rotas de escrita em 4 grafias cada), nenhuma chegou a um handler. F1 fechado; ver `## Probes` | PASS |
| C23 | `POST /api` sem `Origin`: `403` `csrf_rejected` sem executar o handler quando `Sec-Fetch-Site` está ausente, é `cross-site` ou `same-site` | `api` -t `missing_origin_403_unless_same_origin` exit 0 | carried from 328dda1: `apps/api/test/csrf.test.ts:63` - `expect(response.status, JSON.stringify(headers)).toBe(403)`; `:64` (`csrf_rejected`); `:66` - `expect(executed).toBe(0)` sobre os três casos de `:54-58`. Código: `apps/api/src/csrf.ts:19` e `:23`. **Sondas da rodada 1 refeitas no processo real**: `POST /API/auth/login` sem `Origin` (sem `Sec-Fetch-Site`, e com `Sec-Fetch-Site: cross-site`) e credenciais certas respondeu `403` `csrf_rejected` nas duas, sem sessão nova. Sem `Origin`, só `Sec-Fetch-Site: same-origin` exato passa (a linha da door 8 que a C24 prova); `same-site`, `none`, `Same-Origin` e o cabeçalho repetido respondem `403`. F1 fechado; ver `## Probes` | PASS |
| C24 | passam: `POST` com `Origin` igual; `POST` sem `Origin` com `same-origin`; `GET`, `HEAD`, `OPTIONS` com origem estranha | `api` -t `same_origin_and_safe_methods_pass` exit 0 | carried from 328dda1: `apps/api/test/csrf.test.ts:83` - `expect(response.status, ...).toBeLessThan(300)`; `:84` - `expect(text, ...).not.toContain('csrf_rejected')`; `:85` - `expect(executed, ...).toBe(before + 1)` sobre os cinco casos de `:70-76`. O arquivo ganhou um teste ao fim; estas linhas não se moveram. No processo real, `POST` com `Origin` igual a `WEB_ORIGIN` e `POST` sem `Origin` com `Sec-Fetch-Site: same-origin` responderam `200` | PASS |
| C25 | `POST /api/auth/login` com origem estranha e corpo `{}`: `403` `csrf_rejected`, não `422` | `api` -t `origin_is_checked_before_body` exit 0 | carried from 328dda1: `apps/api/test/csrf.test.ts:92` - `expect(response.status).toBe(403)`; `:93` - `expect((await problem(response)).code).toBe('csrf_rejected')`. Linhas não se moveram. No processo real, `POST /Api/Auth/Login` com origem estranha e corpo `{}` respondeu `403` (na rodada 1 respondia `422`) | PASS |
| C26 | stack real, pela origem do web: login com origem estranha `403` `csrf_rejected`; `GET /api/users` sem cookie `401` `unauthorized`; ambos problem+json | `stack` -t `running_api_rejects_foreign_origin_and_anonymous` exit 0 | carried from 1d5598f: `tests/stack/compose.test.ts:119` - `expect(foreign.status).toBe(403)`; `:120` (content-type); `:121` (`csrf_rejected`); `:124` - `expect(anonymous.status).toBe(401)`; `:125`; `:126` (`unauthorized`) | PASS |
| C27 | `two-factor/enable` com senha certa: `200`, `totpUri` `otpauth://totp/...`, ao menos um `backupCodes`, `twoFactorEnabled` segue `false` | `api` -t `enable_200_returns_uri_and_backup_codes` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:55` - `expect(response.status).toBe(200)`; `:56` - `expect(body.totpUri.startsWith('otpauth://totp/')).toBe(true)`; `:57` - `expect(body.backupCodes.length).toBeGreaterThanOrEqual(1)`; `:58` - `expect(await twoFactorEnabled(client)).toBe(false)` | PASS |
| C28 | `two-factor/confirm` com TOTP válido: `204`, `twoFactorEnabled` passa a `true` | `api` -t `confirm_204_turns_two_factor_on` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:69` - `expect(response.status).toBe(204)`; `:70` - `expect(await twoFactorEnabled(client)).toBe(true)` | PASS |
| C29 | login com 2FA ativo: `200`, exatamente `{"status":"two_factor_required"}`, nenhuma sessão | `api` -t `login_with_2fa_returns_two_factor_required` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:81` - `expect(response.status).toBe(200)`; `:82` - `expect(await response.json()).toStrictEqual({ status: 'two_factor_required' })`; `:83` - `expect(await sessionIds(user.id)).toEqual([])` | PASS |
| C30 | `two-factor/verify` com TOTP válido: `200` `authenticated`, cookie que recebe `200` na sessão | `api` -t `verify_totp_200_authenticates` exit 0 | verified at bd273b6: `apps/api/test/two-factor.test.ts:92` - `expect(response.status).toBe(200)`; `:93` - `toStrictEqual({ status: 'authenticated' })`; `:94` (cookie `session_token`); `:95` - `expect((await client.get('/api/auth/session')).status).toBe(200)`. A rota passou a filtrar o identificador do cookie (`apps/api/src/auth/auth.controller.ts:56` - `/^[\w-]+$/`); o identificador que o Better Auth gera é `2fa-` mais 20 caracteres de `a-z`, `0-9`, `A-Z`, `-` e `_`, e passa no filtro. No processo real, login pendente de verdade e código TOTP válido: `200` `authenticated` | PASS |
| C31 | `backupCode` não usado autentica; o mesmo código depois: `401` `invalid_code` | `api` -t `backup_code_authenticates_once` exit 0 | verified at bd273b6: `apps/api/test/two-factor.test.ts:104` - `expect(accepted.status).toBe(200)`; `:106` (cookie); `:111` - `expect(reused.status).toBe(401)`; `:112` - `expect((await problem(reused)).code).toBe('invalid_code')`. Mesma observação da C30: a rota mudou, as linhas da prova não | PASS |
| C32 | `verify` `401` `invalid_code` sem sessão em três casos: TOTP inválido, código de recuperação inexistente, sem login pendente | `api` -t `verify_401_invalid_code_in_three_cases` exit 0 | verified at bd273b6: `apps/api/test/two-factor.test.ts:130` - `expect(response.status, name).toBe(401)`; `:131` - `expect((await problem(response)).code, name).toBe('invalid_code')`; `:132` (sem sessão) sobre os três casos de `:117-125`. **N3 fechado.** Código: `apps/api/src/auth/auth.controller.ts:48` a `:57` (`pendingIdentifier`: a decodificação que falha e o identificador fora de `[A-Za-z0-9_-]` viram `undefined`) e `apps/api/src/auth/auth.controller.ts:279` e `:280`. **Sonda da rodada 2 refeita no processo real**: sem login pendente, o cookie `two_factor` igual a `%E0%A4%A.x` e a `ab%00cd.assinatura` respondeu `401` `invalid_code` (era `500`). Mais 17 valores forjados, cada um com `code` e com `backupCode`, e 7 variações com o identificador de um login pendente real (assinatura trocada, sem assinatura, bytes altos, cookie repetido): `401` `invalid_code` em todas, nenhuma sessão criada, nenhuma linha `unhandled exception`. Ver `## Probes` | PASS |
| C33 | admin sem 2FA: as 8 rotas restantes da `Surface` respondem `403` `two_factor_enrollment_required` | `api` -t `admin_without_2fa_gets_403_everywhere_else` exit 0 | carried from 1d5598f: `apps/api/test/enrollment.test.ts:46` - `expect(response.status, ...).toBe(403)`; `:47` - `expect((await problem(response)).code, ...).toBe('two_factor_enrollment_required')`; `:50` - `expect(blocked.map(...).sort()).toEqual([...8 rotas...].sort())`, conjunto lido de `stack.api.routes()` | PASS |
| C34 | as quatro isentas: sessão `200`, `enable` `200`, `confirm` `204`, `logout` `204` | `api` -t `four_exempt_routes_stay_reachable` exit 0 | carried from 1d5598f: `apps/api/test/enrollment.test.ts:68` - `expect(session.status).toBe(200)`; `:71` - `expect(enabled.status).toBe(200)`; `:75` - `expect(confirmed.status).toBe(204)`; `:78` e `:84` - `logout` `204` (a segunda com admin ainda sem 2FA, `:83`) | PASS |
| C35 | `twoFactorEnrollmentRequired`: `true` para admin sem 2FA, `false` para admin com 2FA e para `reception` | `api` -t `enrollment_required_only_for_admin_without_2fa` exit 0 | carried from 1d5598f: `apps/api/test/enrollment.test.ts:89` - `expect(await enrollmentRequired(admin.client)).toBe(true)`; `:92` - `.toBe(false)` depois do cadastro real; `:95` - `.toBe(false)` para `reception` | PASS |
| C36 | `two-factor/disable`: `204`, `twoFactorEnabled` `false`, linha de `two_factors` some | `api` -t `disable_204_deletes_secret_and_backup_codes` exit 0 | carried from 1d5598f: `apps/api/test/two-factor.test.ts:145` - `expect(response.status).toBe(204)`; `:146` - `expect(await twoFactorEnabled(client)).toBe(false)`; `:147` - `expect(await stack.query('select id from two_factors where user_id = $1', [user.id])).toEqual([])` | PASS |
| C37 | `422` com um item: `enable` e `disable` com senha errada (`password`), `confirm` com código inválido (`code`); `twoFactorEnabled` não muda | `api` -t `wrong_password_or_code_422_on_field` exit 0 | verified at bd273b6: `apps/api/test/two-factor.test.ts:187` - `expect(response.status, route).toBe(422)`; `:189` - `expect(parsed.errors?.map((error) => error.path), route).toEqual([path])`; `:190` - `expect(await twoFactorEnabled(client), route).toBe(stays)` sobre os três casos de `:159-181` (a prova passa). **Contraexemplo novo, rodado no processo real**: `POST /api/auth/two-factor/enable` e `POST /api/auth/two-factor/disable` com uma senha errada de 129, 130, 200, 1.000 e 60.000 caracteres, que o schema da rota aceita (`packages/contracts/src/auth.ts:64` a `:66`, sem tamanho máximo), responderam `400` `bad_request`, sem `errors`, e não `422`. Com senha errada de 1, 12, 127 e 128 caracteres: `422` com `path` `password`. Causa: o Better Auth recusa a senha com mais de 128 unidades antes de compará-la (`better-auth/dist/utils/password.mjs:10`), e `apps/api/src/auth/auth.controller.ts:292` a `:295` só transforma em `422` a recusa `INVALID_PASSWORD`. `twoFactorEnabled` não mudou. Ver N6 | FAIL |
| C38 | 5 falhas alternando maiúsculas; o sexto login, com a senha certa: `429` `too_many_attempts`, `Retry-After` inteiro de 1 a 900 | `api` -t `fifth_failure_blocks_even_right_password` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:79` - `await expectBlocked(sixth)`, que afirma `:40` `expect(response.status).toBe(429)`, `:42` a `:44` (`Retry-After` inteiro, de 1 a 900) e `:46` `expect(body.code).toBe('too_many_attempts')`; cinco grafias em `:72` | PASS |
| C39 | 15 min depois da quinta falha: `200`; a 14 min 59 s: `429` | `api` -t `block_ends_15_min_after_fifth_failure` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:92` - `await expectBlocked(await login(user.email, user.password))` em `advance(5 * MINUTE + 15 * MINUTE - 1000)`; `:95` - `expect((await login(user.email, user.password)).status).toBe(200)` em `advance(5 * MINUTE + 15 * MINUTE)`, com a quinta falha aos 5 min (`:88-89`) | PASS |
| C40 | 4 falhas, 16 min, 1 falha: a última `401`, não `429` | `api` -t `failures_older_than_window_do_not_count` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:106` - `expect(fifth.status).toBe(401)`; `:107` - `expect((await problem(fifth)).code).toBe('invalid_credentials')` | PASS |
| C41 | e-mail sem usuário: 5 x `401` `invalid_credentials`, a sexta `429` com `Retry-After`, corpo de mesma forma | `api` -t `unknown_email_blocks_identically` exit 0 | verified at bd273b6: `apps/api/test/throttle.test.ts:115` - `await fail(unknown, 5)` (`:34` e `:35` afirmam `401` e `invalid_credentials` por tentativa); `:117` - `expectBlocked(blockedUnknown)`; `:121` (corpo de mesma forma). **N1 fechado.** **Sonda da rodada 2 refeita no processo real**: sete tentativas com o mesmo e-mail inexistente de 254 caracteres não compressíveis (o maior que o schema aceita agora, `packages/contracts/src/auth.ts:19`) responderam `401` cinco vezes e `429` `too_many_attempts` com `Retry-After: 900` duas, e a linha de `login_throttles` ficou com 5 falhas; alternando maiúsculas, o mesmo. Com 3.000 caracteres as sete responderam `422` (era `500`): já não é um e-mail para o schema, e a AC 29 fala de e-mail. Ver `## Probes` | PASS |
| C42 | 4 falhas, login autenticado, mais 4 falhas: a oitava `401` | `api` -t `successful_login_resets_counter` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:128` - `expect((await login(user.email, user.password)).status).toBe(200)`; `:129` - `await fail(user.email, 4)`, cada uma `401` em `:34` | PASS |
| C43 | 5 códigos inválidos no `verify` bloqueiam o login seguinte com a senha certa | `api` -t `invalid_codes_count_on_login_counter` exit 0 | verified at bd273b6: `apps/api/test/throttle.test.ts:138` e `:139` (`401` `invalid_code` nas cinco); `:142` - `await expectBlocked(await login(user.email, user.password))`. A rota de verificação mudou (`apps/api/src/auth/auth.controller.ts:279`); o arquivo da prova não, e ela passa pelo login pendente real | PASS |
| C44 | e-mail bloqueado: `verify` com TOTP válido responde `429` com `Retry-After`, sem sessão | `api` -t `verify_429_when_blocked` exit 0 | verified at bd273b6: `apps/api/test/throttle.test.ts:152` - `await expectBlocked(response)`; `:153` - `expect(await stack.query('select id from sessions where user_id = $1', [user.id])).toEqual([])`. Mesma observação da C43 | PASS |
| C45 | 10 logins errados simultâneos: no máximo 5 `401`, `429` nos demais, somando 10 | `api` -t `ten_concurrent_failures_yield_at_most_five_401` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:164` - `expect(unauthorized).toBeLessThanOrEqual(5)`; `:165` - `expect(unauthorized + blocked).toBe(10)` | PASS |
| C46 | segunda instância da API no mesmo banco responde `429` | `api` -t `block_survives_restart` exit 0 | carried from 1d5598f: `apps/api/test/throttle.test.ts:180` - `await expectBlocked(response)` contra `startApi(stack.postgres.url)` de `:173` | PASS |
| C47 | rota sem declaração, ou com `@Public()` e `@Roles('admin')` juntos: a subida sai com código 1 e imprime método e caminho | `api` -t `route_without_single_access_declaration_exits_1` exit 0 | carried from 1d5598f: `apps/api/test/boot.test.ts:125` - `expect(result.status, ...).toBe(1)`; `:126` - `expect(...).toContain(route)` com `'GET /api/undeclared'` e `'GET /api/double'` (`:113-114`). O processo é o `bootstrap` real com um controller a mais (`apps/api/test/fixtures/invalid-access.ts:32`) | PASS |
| C48 | matriz 3 declarações x 5 chamadores, 15 combinações, com `401`/`403` e handler não executado | `api` -t `guard_matrix_three_declarations_five_callers` exit 0 | carried from 1d5598f: `apps/api/test/access.test.ts:87` - `expect(response.status, ...).toBe(status)`; `:88` - `expect(body.code, ...).toBe(code)`; `:90` - `expect(executions.length - before, ...).toBe(status === 200 ? 1 : 0)`; `:94` - `expect(combinations).toBe(15)`; esperados literais em `:54-76` | PASS |
| C49 | `reception`, `hr_finance`, `instructor` nas cinco rotas `/api/users*`: `403` `forbidden`, nenhuma linha muda (15) | `api` -t `non_admin_403_on_every_users_route` exit 0 | carried from 1d5598f: `apps/api/test/access.test.ts:122` - `expect(response.status, ...).toBe(403)`; `:123` - `.toBe('forbidden')`; `:127` - `expect(combinations).toBe(15)`; `:128` - `expect(await snapshot()).toEqual(before)` | PASS |
| C50 | sem cookie, toda rota registrada responde `401` `unauthorized`, exceto exatamente três | `api` -t `only_three_routes_answer_without_session` exit 0 | carried from 1d5598f: `apps/api/test/access.test.ts:147` - `expect(open.sort()).toEqual(['GET /health', 'POST /api/auth/login', 'POST /api/auth/two-factor/verify'])`; `:141` a `:143` (as demais são `401` `unauthorized`); rotas lidas do roteador em `:132` | PASS |
| C51 | `POST /api/users`: `201` com os seis campos, sem senha; o usuário entra com a senha informada | `api` -t `create_user_201_and_user_can_log_in` exit 0 | verified at bd273b6: `apps/api/test/users.test.ts:43` - `expect(response.status).toBe(201)`; `:44` - `expect(body).toStrictEqual({ id, name, email, role, active: true, twoFactorEnabled: false })`; `:55` - `expect(loggedIn.status).toBe(200)` (a prova passa). **N1 e N2 fechados nesta rota**: no processo real, e-mail de 255, 2.600 e 3.000 caracteres respondeu `422` com `path` `email` (254: `201`), e nome com `U+0000` respondeu `422` com `path` `name` (`packages/contracts/src/users.ts:10`). **Contraexemplo novo, rodado no processo real**, com dados que o schema da rota aceita (`packages/contracts/src/auth.ts:11` a `:14`, `packages/contracts/src/users.ts:26` a `:31`): `POST /api/users` por administrador com 2FA e uma senha de 127 letras mais 1 caractere astral (128 caracteres) respondeu `201`, e o login daquele usuário com a senha informada respondeu `401` `invalid_credentials`, não `200`. O mesmo com 120 letras mais 8 astrais, 124 mais 3, 65 astrais e 65 ideogramas da extensão B. Controles: 128 letras, 126 letras mais 1 astral e 64 astrais - `201` e login `200`. Causa: o schema mede a senha em caracteres (`zod/v4/core/checks.js:273`), o Better Auth recusa no login a senha com mais de 128 unidades UTF-16 (`better-auth/dist/api/routes/sign-in.mjs:317`, `apps/api/src/auth.ts:58`). Ver N5 | FAIL |
| C52 | e-mail repetido com outras maiúsculas: `409` `email_taken`, contagem de `users` igual | `api` -t `duplicate_email_409_case_insensitive` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:71` - `expect(response.status).toBe(409)`; `:72` - `.toBe('email_taken')`; `:73` - `expect(await stack.query('select id from users')).toHaveLength(before.length)` | PASS |
| C53 | `Ana.Lima@Exemplo.com` aparece como `ana.lima@exemplo.com` | `api` -t `email_is_stored_lowercase` exit 0 | verified at bd273b6: `apps/api/test/users.test.ts:87` - `expect(listed.users.filter((user) => user.name === 'Ana Lima').map((user) => user.email)).toEqual(['ana.lima@exemplo.com'])`. O schema do e-mail mudou; no processo real, um e-mail de 253 caracteres em maiúsculas foi criado (`201`) e devolvido em minúsculas, e `A@SONDA.TEST` voltou como `a@sonda.test` | PASS |
| C54 | `role` `owner` em `POST` e `PATCH`: `422` com `path` `role`; os quatro valores aceitos | `api` -t `role_accepts_only_the_four_values` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:100` - `expect(response.status).toBe(422)`; `:101` - `expect(body.errors?.map((error) => error.path)).toEqual(['role'])`; `:112` (`POST` `201`) e `:116` (`PATCH` `200`) para os quatro perfis | PASS |
| C55 | `GET /api/users`: `200`, todos (ativos e inativos), em ordem alfabética, cada item com exatamente seis chaves | `api` -t `list_users_200_sorted_with_six_keys` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:131` - `expect(response.status).toBe(200)`; `:132` (ids iguais aos do banco); `:133` (há inativo); `:135` - `expect(names).toEqual([...names].sort(new Intl.Collator('pt-BR').compare))`; `:139` - `expect(Object.keys(user).sort()).toEqual(['active', 'email', 'id', 'name', 'role', 'twoFactorEnabled'])` | PASS |
| C56 | `PATCH` só com `name`, só com `role`, só com `active`: `200` com o valor novo e o resto inalterado | `api` -t `patch_user_200_per_field` exit 0 | verified at bd273b6: `apps/api/test/users.test.ts:159` - `expect(response.status, ...).toBe(200)`; `:160` - `expect(await response.json(), ...).toStrictEqual(expected)` sobre as três mudanças de `:153`. **N2 fechado.** Código: `packages/contracts/src/users.ts:4` a `:10` (`.refine((name) => !name.includes('\0'), ...)`), usado em `packages/contracts/src/users.ts:35`. **Sonda da rodada 2 refeita no processo real**: `PATCH /api/users/:id` com só `name` igual a `Outro\u0000Nulo` respondeu `422` `validation_failed` com `path` `name` (era `500`), e também com `U+0000` sozinho, entre espaços, no começo e no fim; o nome guardado não mudou. Outros 18 nomes que o schema aceita (substituto solto, `U+FFFF`, controles `U+0001` a `U+001F`, 61 caracteres astrais, texto de SQL e de HTML) responderam `200`. Ver `## Probes` | PASS |
| C57 | mudar `role` ou desativar: o cookie aberto recebe `401` e não resta linha em `sessions` | `api` -t `role_change_or_deactivation_ends_sessions` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:174` - `expect((await client.get('/api/auth/session')).status, ...).toBe(401)`; `:175` - `expect(await sessionCount(user.id), ...).toBe(0)` para as duas mudanças de `:165` | PASS |
| C58 | `409` `last_admin` sem mudar nada, em três casos | `api` -t `last_admin_409_in_three_cases` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:192` - `expect(response.status, name).toBe(409)`; `:193` - `.toBe('last_admin')`; `:194` - `expect(await row(only!.user.id), name).toEqual({ role: 'admin', active: true })`. Os três casos rodam com o administrador inativo já criado (`:181`): o 1º e o 3º são o mesmo estado, só muda o perfil de destino. Ver P3 | PASS |
| C59 | dois `PATCH` simultâneos sobre os dois últimos admins: um `200`, um `409` `last_admin`, resta um admin ativo | `api` -t `concurrent_removal_of_last_two_admins` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:230` - `expect(statuses).toEqual([200, 409])`; `:232` - `.toBe('last_admin')`; `:233` - `expect(await stack.query("select id from users where role = 'admin' and active")).toHaveLength(1)` | PASS |
| C60 | admin redefine a senha: `204`, sessão do usuário `401`, login com a nova `200`, com a antiga `401` | `api` -t `admin_resets_password_204` exit 0 | verified at bd273b6: `apps/api/test/users.test.ts:245` - `expect(response.status).toBe(204)`; `:246` (sessão `401`); `:247` (nova `200`); `:248` (antiga `401`); `:241` (12 caracteres) (a prova passa, e com 12 caracteres a afirmação vale). **Contraexemplo novo, rodado no processo real, à AC 44**, que fala de "uma senha válida" e que o check estreitou para 12 caracteres: `PUT /api/users/:id/password` por administrador com 2FA e uma senha de 124 letras mais 3 caracteres astrais (127 caracteres, que o schema aceita, `packages/contracts/src/users.ts:41`) respondeu `204`, e o login seguinte com a senha nova respondeu `401` `invalid_credentials`; com a antiga, `401`. A pessoa fica sem senha que entre. Mesma causa da C51 (`better-auth/dist/api/routes/sign-in.mjs:317`). Ver N5 | FAIL |
| C61 | admin zera o 2FA: `204`, `twoFactorEnabled` `false`, linha de `two_factors` some, sessão `401` | `api` -t `admin_resets_two_factor_204` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:260` - `expect(response.status).toBe(204)`; `:261` a `:263` (`two_factor_enabled: false`); `:264` (`two_factors` vazio); `:265` - `expect((await client.get('/api/auth/session')).status).toBe(401)` | PASS |
| C62 | `:id` `abc` e `uuid` sem usuário nas três rotas: `404` `not_found` (6) | `api` -t `unknown_or_malformed_id_404` exit 0 | carried from 1d5598f: `apps/api/test/users.test.ts:280` - `expect(response.status, ...).toBe(404)`; `:281` - `.toBe('not_found')`; `:285` - `expect(combinations).toBe(6)` | PASS |
| C63 | `pnpm users:create-admin` com senha de 12: código 0, usuário ativo `admin`, imprime `id` e e-mail, não imprime a senha | `api` -t `creates_admin_exits_0_without_printing_password` exit 0 | verified at bd273b6: `apps/api/test/create-admin.test.ts:28` - `expect(result.status, result.output).toBe(0)`; `:34` - `expect(rows[0]).toMatchObject({ role: 'admin', active: true, name: 'Administradora' })`; `:35` (id); `:36` (e-mail); `:37` - `expect(result.output).not.toContain(password)`. O comando roda de verdade: `apps/api/test/support/command.ts:11`. A correção mexeu no arquivo do comando (`apps/api/src/create-admin.ts:59` a `:65`); o caminho de sucesso é o mesmo. Rodado nesta rodada para criar o administrador das sondas: código 0, `id` e e-mail impressos, senha não. Anotado, fora do que a AC 47 afirma: com `ADMIN_PASSWORD` de 65 caracteres astrais o comando sai com 0 e o administrador criado não consegue entrar (N5) | PASS |
| C64 | comando sai com 1, nomeia o motivo e não cria nada em seis casos | `api` -t `rejects_six_invalid_invocations` exit 0 | verified at bd273b6: `apps/api/test/create-admin.test.ts:82` - `expect(result.status, ...).toBe(1)`; `:83` - `expect(result.output, name).toMatch(reason)`; `:85` - `expect(await counts(), name).toEqual(before)` (`users` e `accounts`); `:76` - `expect(cases).toHaveLength(6)`. A correção acrescentou um sétimo caminho de saída com código 1 (`apps/api/src/create-admin.ts:61` a `:64`, falha de consulta); os seis do check saem antes dele, por `apps/api/src/create-admin.ts:36` e `:49`. Rodado de verdade nesta rodada: `--email` de 255 caracteres, código 1 com `--email não é um e-mail válido`; banco recusando conexão, código 1; tabela `users` fora, a saída traz a consulta e nenhum parâmetro | PASS |
| C65 | depois de `pnpm db:migrate`: seis tabelas, nenhuma coluna `tenant_id` | `db` -t `six_identity_tables_and_no_tenant_id` exit 0 | carried from 1d5598f: `packages/database/test/schema.test.ts:49` - `expect(names).toContain(expected)` sobre as seis; `packages/database/test/schema.test.ts:55` - `expect(tenantColumns).toEqual([])` | PASS |
| C66 | nas cinco tabelas de identidade, linha sem `id` recebe `uuid` versão 7 | `db` -t `ids_default_to_uuidv7` exit 0 | carried from 1d5598f: `packages/database/test/schema.test.ts:86` - `expect(checked!.version, table).toBe(7)` por `uuid_extract_version`; `:79` - `expect(Object.keys(inserts)).toHaveLength(5)` | PASS |
| C67 | segundo `users` com o mesmo `email` falha por unicidade | `db` -t `users_email_is_unique` exit 0 | carried from 1d5598f: `packages/database/test/schema.test.ts:93` - `await expect(insertUser('unica@exemplo.com')).rejects.toMatchObject({ code: '23505' })` | PASS |
| C68 | `users.role` `owner` falha no banco | `db` -t `users_role_rejects_fifth_value` exit 0 | carried from 1d5598f: `packages/database/test/schema.test.ts:98` - `await expect(insertUser('dona@exemplo.com', 'owner')).rejects.toMatchObject({ code: '23514' })` | PASS |
| C69 | sem sessão, `/`, `/users`, `/account`, `/two-factor/setup` terminam em `/login` | `web` -g `anonymous_is_redirected_to_login` exit 0 | carried from 1d5598f: `apps/web/e2e/shell.spec.ts:10` - `await expect(page, path).toHaveURL('/login')` sobre os quatro caminhos de `:7` | PASS |
| C70 | `/login`: título "Entrar", campos "E-mail" e "Senha", botão "Entrar", `lang="pt-BR"` | `web` -g `login_page_shows_form_in_pt_br` exit 0 | carried from 1d5598f: `apps/web/e2e/login.spec.ts:14` - `expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible()`; `:15`; `:16`; `:17`; `:18` - `expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')` | PASS |
| C71 | depois do login: URL `/`, "Gestão de Academia", nome, "Sair" e o perfil por extenso para os quatro perfis | `web` -g `home_shows_name_and_role_label_for_four_roles` exit 0 | carried from 1d5598f: `apps/web/e2e/login.spec.ts:40` - `expect(page, role).toHaveURL('/')`; `:41`; `:42` (nome); `:43` - `expect(page.getByText(label, { exact: true }), role).toBeVisible()`; `:44`; rótulos literais em `:22-27` | PASS |
| C72 | login `401`: "E-mail ou senha incorretos.", e-mail mantido, senha vazia | `web` -g `login_401_shows_message_and_clears_password` exit 0 | carried from 1d5598f: `apps/web/e2e/login.spec.ts:54` - `expect(page.getByText('E-mail ou senha incorretos.', { exact: true })).toBeVisible()`; `:55` - `toHaveValue('digitado@exemplo.com')`; `:56` - `toHaveValue('')` | PASS |
| C73 | login `429`: "Muitas tentativas. Tente novamente em N minutos." com N 15, 2, 1 para 900, 61, 60 | `web` -g `login_429_shows_minutes_rounded_up` exit 0 | carried from 1d5598f: `apps/web/e2e/login.spec.ts:78` - `expect(page.getByText(...'Muitas tentativas. Tente novamente em ${minutes} minutos.'..., { exact: true }), ...).toBeVisible()` sobre os três casos de `:61-65` | PASS |
| C74 | `422` com um item: a `message` aparece junto do campo em quatro formulários | `web` -g `field_errors_shown_on_four_forms` exit 0 | carried from 328dda1: `apps/web/e2e/forms.spec.ts:18` - `expect(page.getByLabel(form.field.label, { exact: true }), form.name).toHaveAccessibleDescription(message)`; `:19` (uma ocorrência); `:8` - `expect(forms).toHaveLength(4)`. Linhas acima da edição da correção, inalteradas. Em `/two-factor/setup` e em `/users` só um dos formulários da tela é exercitado. Ver P2 | PASS |
| C75 | API pendurada por mais de 3 s e API `500`: a mensagem de indisponível em cinco telas, sem sair da tela (10) | `web` -g `unavailable_api_message_on_five_screens` exit 0 | carried from 328dda1: `apps/web/e2e/forms.spec.ts:40` - `expect(page.getByText(UNAVAILABLE, { exact: true }), ...).toBeVisible({ timeout: 4000 })`; `:43` - `expect(page.url(), ...).toBe(url)`; `:47` - `expect(combinations).toBe(10)`. A correção baixou a espera de 8 s para 4 s: um prazo de 7 s já não passaria. O teste levou 18,3 s (5 casos pendurados, cerca de 3 s cada). Ver P1 | PASS |
| C76 | enquanto a API não responde, o botão de envio fica desabilitado em cinco formulários | `web` -g `submit_disabled_while_pending_on_five_forms` exit 0 | carried from 328dda1: `apps/web/e2e/forms.spec.ts:61` - `await expect(submit, form.name).toBeDisabled()`; `:57` (habilitado antes); `:63` (a requisição chegou); `:51` - `expect(FORMS).toHaveLength(5)`. Linhas deslocadas em 1 pela correção. Ver P2 | PASS |
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
| C91 | login vazio: erro junto de "E-mail" e de "Senha", nenhuma requisição chega à API | `web` -g `empty_login_is_rejected_before_any_request` exit 0 | verified at bd273b6: `apps/web/e2e/login.spec.ts:90` - `expect(page.getByLabel('E-mail')).toHaveAccessibleDescription(/\S/)`; `:91` (senha); `:92` - `expect(api.requests.filter((request) => request.path === '/api/auth/login')).toEqual([])`. O schema é o de contracts, que a correção mudou: `apps/web/src/app/login/login-form.tsx:16` - `resolver: zodResolver(loginRequestSchema)`. Com o campo vazio o e-mail reprova só no formato, e a prova passa | PASS |
| C92 | `packages/ui` é workspace com `tailwindcss` e `components.json`; `apps/web` declara as três dependências; `lint` e `typecheck` alcançam `packages/ui` | `repo` -t `ui_package_is_the_shared_interface_base` exit 0 | carried from 1d5598f: `tests/repo/repo.test.ts:117` - `expect(workspaceDirs()).toContain('packages/ui')`; `:120` (tailwindcss); `:121` (`components.json`); `:125` (três dependências); `:141` a `:143` (`@academia/ui#lint`, `@academia/ui#typecheck` na resolução do Turborepo) | PASS |
| C93 | stack de pé: `GET /` segue o redirecionamento e responde `200` em `/login` com o título "Entrar" | `stack` -t `home_redirects_to_login` exit 0 | carried from 1d5598f: `tests/stack/compose.test.ts:134` - `expect(response.url).toBe(...'/login')`; `:135` - `expect(response.status).toBe(200)`; `:136` - `expect(html).toMatch(/<h1[^>]*>Entrar<\/h1>/)` | PASS |
| C94 | `GET /api/openapi.json` com sessão: `200`, `openapi` começa por `3.1` | `api` -t `openapi_200_is_3_1` exit 0 | carried from 1d5598f: `apps/api/test/openapi.test.ts:31` - `expect(response.status).toBe(200)`; `:39` - `expect(body.openapi.startsWith('3.1')).toBe(true)` | PASS |
| C95 | `paths` do documento é igual ao conjunto de rotas registradas sob `/api` | `api` -t `paths_equal_registered_api_routes` exit 0 | carried from 1d5598f: `apps/api/test/openapi.test.ts:54` - `expect(documented.sort()).toEqual(registered.sort())`, com `registered` lido de `stack.api.routes()` em `:43` | PASS |
| C96 | o `requestBody` das nove rotas é igual a `z.toJSONSchema` do schema de contracts | `api` -t `request_bodies_come_from_contract_schemas` exit 0 | verified at bd273b6: `apps/api/test/openapi.test.ts:76` - `expect(documented, ...).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(schema))))`; `:69` - nove; `:84` (nenhuma outra rota declara corpo). Dois dos nove schemas mudaram com a correção. No processo real, o documento traz `"maxLength":254` no e-mail do login e de `POST /api/users`, e `"minLength":1,"maxLength":120` no nome; a recusa do `U+0000` não tem forma em JSON Schema e não aparece no documento (observação, não reprova: a C96 afirma igualdade com `z.toJSONSchema`, e ela vale) | PASS |
| C97 | Vitest da API mede `src/**` com limiar 70 de linhas e 70 de ramos, e o script `test` liga a cobertura | `repo` -t `api_coverage_thresholds_are_70_lines_and_branches` exit 0 | carried from 1d5598f: `tests/repo/repo.test.ts:104` - `expect(resolved?.coverage?.include).toEqual(['src/**'])`; `:105` - `expect(resolved?.coverage?.thresholds).toMatchObject({ lines: 70, branches: 70 })`; `:111` - `expect(api.scripts.test).toMatch(/^vitest run( .*)? --coverage( $)/)` (expressão abreviada aqui) | PASS |
| C98 | clone limpo com arquivo sem teste em `apps/api/src`: `pnpm verify` sai diferente de 0 | `gate` -t `verify_fails_below_70_percent_coverage` exit 0 | carried from 1d5598f: `tests/stack/verify.test.ts:126` - `expect(broken.status).not.toBe(0)`; `:129` - `expect(failed.map((t) => t.taskId), ...).toEqual(['@academia/api#test'])`; `:130` (mensagem do limiar de cobertura na saída) | PASS |
| C99 | um login gera exatamente uma linha `auth.*` com `requestId` igual ao cabeçalho, em quatro casos | `api` -t `login_outcomes_log_one_line_each` exit 0 | carried from 328dda1: `apps/api/test/auth-log.test.ts:81` - `expect(authLines, msg).toHaveLength(1)`; `:82` - `expect(authLines[0], msg).toMatchObject({ msg, requestId })`; `:83` e `:84` (`userId` presente ou ausente); os quatro casos, literais, em `:64-69`. A captura passou a incluir o `console` (`:30-34`), e o Better Auth agora escreve linhas JSON de `msg` `better-auth`, que o filtro `auth.` de `:80` não conta. No processo real, 12 desfechos de login geraram 12 linhas `auth.*` (7 falhas, 3 autenticados, 2 bloqueados) | PASS |
| C100 | percorridos cinco caminhos, nenhuma linha escrita pelo processo contém nenhum dos seis valores | `api` -t `six_secrets_never_reach_the_log` exit 0 | carried from 328dda1: `apps/api/test/auth-log.test.ts:137` - `expect(written.includes(value), ...).toBe(false)` sobre os valores de `:97`, `:112` e `:116-117`; `written` agora junta `process.stdout.write` e `process.stderr.write` (`:27-28`) e os cinco métodos do `console` (`:30-34`). Código: `apps/api/src/problem.filter.ts:89` - `error: describeError(exception)`; `apps/api/src/log-safe.ts:9` (a consulta sem os parâmetros); `apps/api/src/auth.ts:33` - `logger: { log: logBetterAuth }`. **Sondas da rodada 1 refeitas no processo real**: com o banco recusando conexão, `POST /api/auth/login` (`500`) e `GET /api/users` com cookie assinado (`500`) deixaram no log a consulta e nenhum parâmetro. Em 12 situações (operação normal e 10 modos de falha do banco), 232 valores procurados - os seis da AC 74 e os que os cercam - e nenhum encontrado. Resta uma escrita fora de JSON que leva o id do usuário, que não é um dos seis. F2 fechado; ver N4 e `## Probes` | PASS |
| C101 | cada um dos dez `code` da door 9: problem+json, `X-Request-Id` igual ao `requestId`, valida contra o schema de erro | `api` -t `ten_new_codes_match_problem_schema` exit 0 | carried from 1d5598f: `apps/api/test/contracts.test.ts:101` - `expect(body.code, code).toBe(code)`; `:102` (content-type); `:104` - `expect(response.headers.get('x-request-id'), code).toBe(body.requestId)`; `:105` - `expect(problemSchema.safeParse(body).success, code).toBe(true)`; `:94` - dez códigos distintos | PASS |
| C102 | o corpo de sucesso de cada uma das sete rotas valida contra o schema de resposta | `api` -t `seven_success_bodies_match_contract_schemas` exit 0 | carried from 1d5598f: `apps/api/test/contracts.test.ts:169` - `expect(response.status, route).toBe(status)`; `:170` - `expect(parsed.success, ...).toBe(true)`; `:162` - `expect(cases).toHaveLength(7)` | PASS |

Por alvo, em `bd273b6`: `api` exit 0, 68 aprovados, 0 reprovados (11 testes filtrados pelo `-t`: 5 da
`fundacao`, os 2 da correção da rodada 1 e 4 dos 5 desta correção), 29,9 s · `db` exit 0, 4 aprovados
· `repo` exit 0, 2 aprovados · `web` exit 0, 24 aprovados, 34,0 s · `stack` exit 0, 3 aprovados,
113,1 s · `gate` exit 0, 1 aprovado, 143,8 s. 102 testes nomeados, cada um listado individualmente
como aprovado. Linhas `verified at bd273b6`: 22; `carried from 328dda1`: 10;
`carried from 1d5598f`: 70.

Fora das 102, também em `bd273b6`: a suíte inteira da API com cobertura
(`pnpm --filter "./apps/api" exec vitest run --coverage --reporter=verbose`) saiu com 0, 24 arquivos,
95 testes aprovados, linhas 87,36% e ramos 81,43% - inclui os cinco testes novos desta correção.

## Findings

verified at bd273b6. N5 e N6 reprovam checks. Os demais não reprovam nenhuma linha.

### Earlier findings - what became of each

| Achado | Rodada | Estado em bd273b6 | Evidência |
| --- | --- | --- | --- |
| F1 - checagem de origem contornada por caminho em outras maiúsculas (C22, C23) | 1 | fechado na rodada 2; carried from 328dda1 | `apps/api/src/csrf.ts:10`, `:19` (arquivo intocado por esta correção); as provas C22 a C26 passam em `bd273b6`; `origin_check_covers_every_spelling_the_router_dispatches` passa na suíte inteira |
| F2 - e-mail digitado e token da sessão no log quando a consulta falha (C100) | 1 | fechado na rodada 2 para os seis valores da AC 74; carried from 328dda1; resta N4 | `apps/api/src/problem.filter.ts:89`, `apps/api/src/log-safe.ts:9` (intocados); a C100 e `query_failures_log_no_parameters` passam em `bd273b6`; nas 483 requisições desta rodada, o e-mail e as senhas dos dois usuários das sondas e o `AUTH_SECRET` não apareceram no log do processo |
| F3 - linha `502`/`504` da `Surface` sem check, sem `Coverage` | 1 | aberto em parte, intocado | `plan.md` e `checks.md` não mudaram desde `1d5598f`: a linha segue sem check e sem linha de `Coverage`, e `bad_gateway`/`gateway_timeout` fora da lista de códigos da door 9. O teste da rodada 2 (`apps/web/e2e/proxy.spec.ts:96`) existe e não é prova de check; não foi rodado de novo (carried from 328dda1) |
| P1 - a C75 não fixa quando a mensagem aparece | 1 | fechado na prova na rodada 2; carried from 328dda1 | `apps/web/e2e/forms.spec.ts:40` (intocado); a C75 passou em 18,2 s. O texto do check não mudou, e nada afirma o limite de baixo |
| P2 - "cinco formulários" contam um por tela | 1 | intocado | o diff não toca `apps/web/e2e/support/forms.ts` nem as telas |
| P3 - casos 1 e 3 da C58 são o mesmo estado | 1 | intocado | o diff acrescenta um teste ao fim de `apps/api/test/users.test.ts`; `:181` a `:194` não mudaram |
| N1 - e-mail sem tamanho máximo responde `500` (C3, C41, C51) | 2 | fechado | `packages/contracts/src/auth.ts:17` a `:19`; sonda refeita: `422` de 255 a 6.000 caracteres, `401` e bloqueio com 254; `POST /api/users` `422` com 255, 2.600 e 3.000; teste novo falha com o código antigo. A C51 segue reprovada por outro motivo (N5) |
| N2 - `U+0000` no nome responde `500` (C51, C56) | 2 | fechado | `packages/contracts/src/users.ts:4` a `:10`; sonda refeita: `422` com `path` `name` em `POST` e `PATCH`, em 5 posições do caractere; teste novo falha com o código antigo |
| N3 - cookie `two_factor` forjado responde `500` (C32) | 2 | fechado | `apps/api/src/auth/auth.controller.ts:48` a `:57`, `:279`, `:280`; sonda refeita: `401` `invalid_code` em 45 variações; teste novo falha com o código antigo |
| N4 - o Better Auth escreve no `console`, fora de JSON e com o id do usuário, quando a segunda consulta de uma junção falha | 2 | aberto, intocado; refeito | o diff não toca `apps/api/src/auth.ts` nem `apps/api/src/log-safe.ts`. No processo real, com a tabela `users` renomeada, três requisições (`GET /api/auth/session` e `GET /api/users` com cookie válido, um login) responderam `500` e deixaram 82 linhas fora de JSON no stderr, com `params: <id do usuário>`. Não é um dos seis valores da AC 74: não reprova a C100 |
| Suspeito: `pnpm users:create-admin` não passava pelo `describeError` | 2 | fechado | `apps/api/src/create-admin.ts:59` a `:65`; rodado com o banco recusando conexão e com a tabela `users` fora: a saída traz `Failed query: insert into "users" ...` e nenhum de nome, e-mail, senha, hash ou `params` |
| Menor: cookie `two_factor` lido sem conferir a assinatura | 1 | fechado quanto ao `500` (N3); a leitura sem assinatura continua, por desenho | `apps/api/src/auth/auth.controller.ts:278`. Efeito que resta, medido: um cookie com o identificador de um login pendente real e a assinatura trocada responde `401` e conta uma falha no e-mail daquele login (`:121`) antes de qualquer conferência. Só quem tem o cookie conhece o identificador |
| Suspeito: `apps/api/src/log-safe.ts` reconhece o erro do Drizzle pela forma | 2 | intocado | - |
| Suspeito: a causa do erro (mensagem do Postgres) vai para o log como veio | 2 | intocado; menos caminhos a alcançam | com N1 e N2 fechados, as duas mensagens que a rodada 2 viu no log não acontecem mais |
| Suspeito: o teste da checagem de origem afirma só `>= 400` nas grafias que o roteador não despacha | 2 | intocado | `apps/api/test/csrf.test.ts:118` |
| Suspeito: a tentativa é contada antes de a senha ser conferida | 2 | intocado, não rodado | agora em `apps/api/src/auth/auth.controller.ts:87` |
| Menor: C13, `Origin` ausente no `GET` | 1 | intocado | `apps/web/e2e/proxy.spec.ts:80` |
| Menor: C73, "em 1 minutos" | 1 | intocado | `apps/web/src/lib/api.ts:60` |
| Menor: C83, coluna "Ações" | 1 | intocado | - |
| Menor: linhas do Better Auth fora de JSON | 1 | fechado na rodada 2, salvo N4 | nas 483 requisições com o banco de pé, 0 linhas fora de JSON no stdout e 0 linhas no stderr |
| Menor: `stack.session('admin')` marca o 2FA por SQL | 1 | intocado | o teste novo `hostile_input_never_answers_5xx` usa o mesmo atalho (`apps/api/test/hostile-input.test.ts:15`) |

### Rounds 1 and 2 in short

- Rodada 1 (`1d5598f`, FAIL): C22 e C23 reprovadas pelo F1, C100 pelo F2; F3, P1 a P3 e observações
  menores anotados.
- Rodada 2 (`328dda1`, FAIL): F1 e F2 fechados; C3, C32, C41, C51 e C56 reprovadas por N1, N2 e N3,
  contraexemplos novos no processo real; N4 anotado.
- Rodada 3 (`bd273b6`, FAIL): N1, N2 e N3 fechados; C37, C51 e C60 reprovadas por N5 e N6.

### N5 - a senha é medida em caracteres pelo schema e em unidades UTF-16 pelo Better Auth: uma senha aceita na gravação é recusada no login (C51, C60; AC 37, AC 44)

`packages/contracts/src/auth.ts:11` a `:14` aceita senha de 12 a 128 caracteres. Nesta versão do Zod
(4.6.5) o tamanho de um texto é contado em caracteres Unicode, não em unidades UTF-16
(`zod/v4/core/checks.js:273`, com o comentário "Strings are measured in Unicode code points").
O Better Auth, configurado com `maxPasswordLength: 128` (`apps/api/src/auth.ts:58`), recusa no login
a senha cujo `length` passa de 128 (`better-auth/dist/api/routes/sign-in.mjs:317`,
`better-auth/dist/utils/password.mjs:10`), antes de comparar. Um caractere fora do plano básico
(emoji, ideogramas da extensão B) vale 1 para o schema e 2 para o Better Auth. As quatro gravações
de senha passam pelo schema e gravam o hash direto (`apps/api/src/users/users.service.ts:52`,
`:104`, `:126`); só o login passa pelo Better Auth, e a recusa dele vira `401`
(`apps/api/src/auth/auth.controller.ts:262` a `:264`).

Rodado contra `node apps/api/dist/main.js` (construído em `bd273b6`), Postgres 18 real, sessão de
administrador com 2FA, `Origin` igual a `WEB_ORIGIN`:

| Requisição | Senha | Gravação | Login com a senha informada |
| --- | --- | --- | --- |
| `POST /api/users` | 128 letras (128 caracteres, 128 unidades) | `201` | `200` (controle) |
| `POST /api/users` | 126 letras e 1 astral (127 caracteres, 128 unidades) | `201` | `200` (controle) |
| `POST /api/users` | 64 astrais (64 caracteres, 128 unidades) | `201` | `200` (controle) |
| `POST /api/users` | 127 letras e 1 astral (128 caracteres, 129 unidades) | `201` | `401` `invalid_credentials` |
| `POST /api/users` | 124 letras e 3 astrais (127 caracteres, 130 unidades) | `201` | `401` |
| `POST /api/users` | 120 letras e 8 astrais (128 caracteres, 136 unidades) | `201` | `401` |
| `POST /api/users` | 65 astrais (65 caracteres, 130 unidades) | `201` | `401` |
| `POST /api/users` | 65 ideogramas da extensão B (65 caracteres, 130 unidades) | `201` | `401` |
| `POST /api/users`, perfil `admin` | 65 astrais | `201` | `401`; o administrador novo não chega a cadastrar o 2FA |
| `PUT /api/users/:id/password` | 124 letras e 3 astrais | `204` | `401` com a nova e `401` com a antiga |
| `PUT /api/auth/password`, senha atual certa | 65 astrais | `204`; a sessão atual segue `200` | `401` com a nova e `401` com a antiga; com a sessão ainda aberta, a troca de volta responde `204` |
| `pnpm users:create-admin` | `ADMIN_PASSWORD` de 65 astrais | código 0, hash `$argon2id$...` gravado | não rodado para este usuário; a senha e a recusa do login são as das linhas acima |

Por que reprova: a AC 37 diz que, criado com dados válidos, "aquele usuário SHALL conseguir entrar
com a senha informada", e a C51 afirma o `200` desse login para "dados válidos" - a única definição
de válido que o plano tem é o schema da rota. A AC 44 diz "com uma senha válida ... aceitar a senha
nova no login seguinte"; a C60 estreitou a afirmação para uma senha de 12 caracteres, que vale, e
reprova pela AC que ela cobre. A C10 (AC 9 não fala do login; o check fala de 12 caracteres) e a C63
(AC 47 não fala do login) não são contraditas e seguem PASS, com a nota na linha. A C12 afirma só a
aceitação e a recusa na gravação, que valem.

Alcance, para não exagerar: precisa de uma senha com ao menos um caractere fora do plano básico e
mais de 128 unidades UTF-16 - na prática, uma senha de 65 caracteres ou mais com emoji. Não vaza
nada, não cria sessão, não responde `5xx`. O efeito é silencioso: quem grava recebe `201`/`204`, a
pessoa recebe "E-mail ou senha incorretos" e, na quinta tentativa, o bloqueio de 15 minutos. Só o
Administrador desfaz, redefinindo a senha.

### N6 - senha errada com mais de 128 unidades em `two-factor/enable` e `two-factor/disable` responde `400`, não `422` (C37; AC 27)

`packages/contracts/src/auth.ts:64` a `:66` (`passwordConfirmationRequestSchema`) não tem tamanho
máximo. O Better Auth recusa a senha longa antes de compará-la, com `PASSWORD_TOO_LONG`
(`better-auth/dist/utils/password.mjs:10` a `:12`, chamado em
`better-auth/dist/plugins/two-factor/index.mjs:109` e `:212`), e
`apps/api/src/auth/auth.controller.ts:292` a `:295` só transforma em `422` a recusa
`INVALID_PASSWORD`; qualquer outra vira `400`.

No processo real, com sessão de recepção sem 2FA:

| Senha errada enviada | `two-factor/enable` | `two-factor/disable` |
| --- | --- | --- |
| 1, 12, 127 e 128 caracteres | `422`, um item, `path` `password` (controle) | `422`, um item, `path` `password` (controle) |
| 129, 130, 200 e 1.000 caracteres | `400` `bad_request`, sem `errors` | `400` `bad_request`, sem `errors` |
| 60.000 caracteres | `400` `bad_request` | `400` `bad_request` |

`PUT /api/auth/password` com a senha atual errada de 129 caracteres respondeu `422` com `path`
`currentPassword` (código próprio, `apps/api/src/users/users.service.ts:124`), e o login com senha
de mais de 128 unidades responde `401`: só as duas rotas do 2FA saem do contrato.

Por que reprova: a AC 27 manda `422` com um item cujo `path` é o campo enviado quando a rota "recebe
a senha errada", e a C37 afirma o mesmo sem restringir o tamanho; a door 9 reserva o `400` para corpo
ilegível, e a `Surface` não lista `400` nessas duas rotas. Alcance: nada muda de estado
(`twoFactorEnabled` seguiu `false`), nada vaza. É o achado de menor peso desta rodada; fica como
reprovação porque é contraexemplo executado ao texto da AC.

### Suspeito, sem reprovar linha

- As três correções não têm check: `checks.md` não mudou, então o limite de 254 caracteres do e-mail,
  a recusa do `U+0000` e o `401` do cookie forjado são guardados só por cinco testes que nenhum check
  nomeia. O limite de 254 também é decisão de contrato que o plano não registra. É o mesmo padrão do F3.
- `apps/api/test/hostile-input.test.ts:53` afirma só "nenhum `5xx`". Qualquer outra resposta passa,
  inclusive o `400` do N6 e o `201` seguido de `401` do N5, e o teste não manda e-mail longo nem
  cookie forjado. Contra o código antigo ele falha por duas linhas, as do `U+0000` no nome.
- `forged_session_cookie_401` (`apps/api/test/session.test.ts:104`) passa também contra o código
  antigo: guarda um caminho que nunca esteve quebrado, não prova correção nenhuma.
- O filtro do identificador (`apps/api/src/auth/auth.controller.ts:56`) depende do alfabeto que o
  Better Auth usa hoje (`better-auth/dist/crypto/random.mjs:3`). Se uma versão nova gerar outro
  formato, todo login em dois passos responde `401`; as provas C30, C31, C43 e C44 acusariam.
- `pnpm users:create-admin` valida o e-mail pelo schema e o nome só por não estar vazio
  (`apps/api/src/create-admin.ts:22`): rodado com `--name` de 5.000 caracteres, criou o usuário com
  código 0. A API recusaria esse nome com `422`. Nenhuma AC limita o nome do comando.
- A API aceita corpo `application/x-www-form-urlencoded` nas rotas de escrita (rodado: `POST /api/users`
  com corpo de formulário chegou à validação e reprovou só o campo com `%00`). A checagem de origem
  barra o formulário de outra origem; o documento OpenAPI declara só `application/json`.
- Um corpo JSON que não é objeto (`[]`, 40 mil colchetes aninhados) responde `422` com um item de
  `path` vazio. A AC 14 fala de `path` por campo; nenhum check afirma este caso.
- Senhas feitas só de substitutos soltos (`\ud800` repetido) são equivalentes entre si: todas viram
  `U+FFFD` antes do hash, e o login com `\udfff` repetido entrou na conta criada com `\ud800`
  repetido. Não se digita isso num formulário; anotado por ser colisão de senha.
- Um nome feito só de `U+200B` (espaço de largura zero) é aceito e fica invisível na lista.
- A recusa do `U+0000` não aparece no documento OpenAPI (uma regra `refine` não tem forma em JSON
  Schema): o documento diz que o nome é qualquer texto de 1 a 120.

## Fix diff

verified at bd273b6. Lido inteiro; o escopo abaixo é o do diff, não o das mensagens de commit.

| Arquivo | O que mudou | Rejulgado |
| --- | --- | --- |
| `apps/api/src/auth/auth.controller.ts` | `pendingIdentifier` (`:48` a `:57`): decodificação que falha e identificador fora de `[A-Za-z0-9_-]` viram `undefined`; `pendingLogin` usa a função (`:279`, `:280`). O resto do arquivo andou 16 linhas | C32 (tabela); C30, C31, C43, C44 (a rota de verificação com login pendente real) |
| `apps/api/src/create-admin.ts` | `main` dentro de `try`/`catch`; a falha sai por `describeError` com código 1 (`:59` a `:65`) | C9, C63, C64 |
| `packages/contracts/src/auth.ts` | `emailSchema` com `.max(254, ...)` (`:17` a `:19`) | C2, C3, C15, C17, C41, C51, C53, C91, C96; as provas de login (C38 a C46), de `POST /api/users` (C52, C54) e as telas que usam o schema passam em `bd273b6` |
| `packages/contracts/src/users.ts` | `nameSchema` recusa `U+0000` por `refine` (`:4` a `:10`) | C51, C56, C96; C54, C55 e as provas do formulário de usuário (C74 a C76) passam em `bd273b6` |
| `apps/api/test/login.test.ts` | um `import` a mais (linhas +1) e o teste novo `email_longer_than_254_is_422_and_never_500` (`:83` a `:107`) | C2, C3, C15 (citações refeitas) |
| `apps/api/test/session.test.ts` | teste novo `forged_session_cookie_401` ao fim (`:104` a `:117`) | C4 a C8 (linhas não se moveram) |
| `apps/api/test/two-factor.test.ts` | teste novo `forged_two_factor_cookie_401_invalid_code` ao fim (`:194` a `:213`) | C27 a C32, C36, C37 (linhas não se moveram) |
| `apps/api/test/users.test.ts` | `import` alterado na mesma linha; teste novo `input_the_database_cannot_store_is_422` ao fim (`:288` a `:310`) | C51 a C62 (linhas não se moveram) |
| `apps/api/test/hostile-input.test.ts` (novo) | `hostile_input_never_answers_5xx` | não é prova de check |

Quem mais depende dos schemas que mudaram: `apps/api/src/auth/auth.controller.ts:78` (login),
`apps/api/src/users/users.controller.ts:32` e `:41`, `apps/api/src/create-admin.ts:21`, o documento
OpenAPI (C96, conferido no processo real) e dois formulários do web,
`apps/web/src/app/login/login-form.tsx:16` e `apps/web/src/app/users/users-panel.tsx:10`, que validam
pelo mesmo schema antes de enviar. As 24 provas do web passam em `bd273b6`.

Os testes novos, julgados. Nenhum deles é prova de check: `checks.md` não os nomeia. Os cinco foram
**rodados contra o código antigo** (cópia da árvore de `bd273b6` fora do repositório, com
`apps/api/src` e `packages/contracts/src` de `328dda1`): quatro falham, um passa.

- `email_longer_than_254_is_422_and_never_500` (`apps/api/test/login.test.ts:83-107`): e-mail não
  compressível de 255 e de 3.000 caracteres, `422` com `path` `email` (`:93`, `:94`); com 254, cinco
  `401` `invalid_credentials` e o sexto `429` (`:101`, `:102`, `:105`, `:106`). Afirma a propriedade
  nas duas bordas e no bloqueio. Contra o código antigo: falha em `:93`, "255 caracteres: expected
  401 to be 422".
- `input_the_database_cannot_store_is_422` (`apps/api/test/users.test.ts:288-310`): `U+0000` no nome
  em `POST` e em `PATCH`, e-mail de 3.012 caracteres, nome de 121; `422` `validation_failed` com o
  `path` do campo (`:304` a `:306`), contagem de usuários e nome guardado inalterados (`:308`,
  `:309`). Afirma a propriedade. Contra o código antigo: falha em `:304`, "POST com U+0000 no nome:
  expected 500 to be 422".
- `forged_two_factor_cookie_401_invalid_code` (`apps/api/test/two-factor.test.ts:194-213`): seis
  valores do cookie, entre eles os dois da rodada 2; `401` `invalid_code` (`:209`, `:210`) e nenhuma
  sessão (`:212`). Afirma a propriedade. Contra o código antigo: falha em `:209`, "%E0%A4%A.x:
  expected 500 to be 401".
- `hostile_input_never_answers_5xx` (`apps/api/test/hostile-input.test.ts:14-54`): 7 valores em 11
  campos, 6 segmentos de `:id` em 2 rotas, 6 corpos em 2 rotas; afirma mais de 100 respostas e
  nenhuma começando por `5` (`:52`, `:53`). Contra o código antigo: falha em `:53` com
  `500 create name "a\u0000b"` e mais uma linha. Limite: ver "Suspeito".
- `forged_session_cookie_401` (`apps/api/test/session.test.ts:104-117`): cinco valores do cookie de
  sessão, `401` `unauthorized` (`:114`, `:115`). Contra o código antigo: passa.

## Probes

verified at bd273b6. Tudo contra `node apps/api/dist/main.js`, construído em `bd273b6` com
`pnpm --filter @academia/api build`, com Postgres 18 real num container próprio, migrado por
`pnpm db:migrate`, administrador criado por `pnpm users:create-admin`, `WEB_ORIGIN=http://localhost:3000`.
As requisições foram escritas direto no socket, para cookies, bytes e cabeçalhos irem como dados. Os
scripts e os logs ficaram fora do repositório, na pasta temporária da sessão.

Com o banco de pé: 483 requisições, respostas `200` x122, `201` x50, `204` x10, `400` x16, `401`
x114, `404` x16, `413` x1, `415` x2, `422` x146, `429` x6. Nenhum `5xx`. O stderr do processo ficou
vazio (nenhuma linha `unhandled exception`), e o stdout só com linhas JSON; o e-mail e as senhas dos
dois usuários das sondas e o `AUTH_SECRET` não aparecem nele.

**N1 refeito e ampliado (C3, C41, C51).**

| Requisição | Observado |
| --- | --- |
| `POST /api/auth/login`, e-mail inexistente de 64 e 254 caracteres não compressíveis | `401` `invalid_credentials` |
| o mesmo, de 255, 320, 1.000, 2.600, 2.700, 2.712, 2.800, 3.000 e 6.000 caracteres | `422` `validation_failed`, `errors` com `path` `email` (na rodada 2: `500` de 2.700 em diante) |
| 7 logins seguidos com o mesmo e-mail inexistente de 3.000 caracteres | `422` nos sete (na rodada 2: `500` nos sete) |
| 7 logins seguidos com o mesmo e-mail inexistente de 254 caracteres | `401` x5, `429` `too_many_attempts` x2 com `Retry-After: 900`; 1 linha em `login_throttles` com 5 falhas |
| o mesmo, alternando maiúsculas e minúsculas | `401` x5, `429` x2; 1 linha com 5 falhas |
| 7 logins seguidos com um e-mail inexistente comum | `401` x5, `429` x2 (controle) |
| e-mail de 6.012 caracteres todos iguais (compressível) | `422` (na rodada 2: `401`) |
| `POST /api/users` por administrador com 2FA, e-mail de 254 caracteres | `201` |
| o mesmo, de 255, 2.600 e 3.000 caracteres | `422`, `path` `email` (na rodada 2: `500` com 3.000) |
| e-mail de 88 a 90 mil caracteres em cinco formas (sem `@`, só pontos, `a.a.a.`, símbolos) | `422` em 1 a 3 ms: a expressão do e-mail não degenera |
| e-mail com `U+0000`, com substituto solto, com acento, número, `null`, lista, objeto | `422`, `path` `email` |

**N2 refeito e ampliado (C51, C56).**

| Requisição | Observado |
| --- | --- |
| `POST /api/users` com `name` igual a `Nome\u0000Nulo` | `422`, `path` `name`, "O nome contém um caractere inválido." (na rodada 2: `500`) |
| `PATCH /api/users/:id` com só `name` igual a `Outro\u0000Nulo` | `422`, `path` `name` (na rodada 2: `500`) |
| `POST` e `PATCH` com `U+0000` sozinho, entre espaços, no começo e no fim | `422` nas oito |
| `POST` e `PATCH` com 18 outros nomes: substituto solto, `U+FFFF`, BOM, controles `U+0001` a `U+001F`, 60 e 61 astrais, 120 letras, 120 letras entre 100 espaços, `U+200B`, texto de SQL e de HTML, `%00`, `\0` em texto | `201` e `200`; o substituto solto é guardado como `U+FFFD` |
| nome de 121 letras, nome só de `U+00A0` | `422`, `path` `name` |
| nome de 121 letras com `U+0000` (dois defeitos no mesmo campo) | `422` com um item só |
| nome com `U+0000` em corpo UTF-16LE declarado, em corpo gzip, e em chave repetida | `422`, `path` `name`, nas três |
| nome com bytes `0xFF 0xFE` ou `0xC0 0x80` crus no corpo | `201`, guardado como `U+FFFD` |
| nome com o byte `0x00` cru no corpo | `400` `bad_request` (JSON ilegível) |
| senha com `U+0000` em `POST /api/users` e em `PUT /api/auth/password` | `201`/`204`; login com a mesma `200`; login com o prefixo até o `U+0000` e com outra cauda `401` - a senha não é truncada no caractere nulo |
| `role` igual a `admin\u0000`; `active` igual a `"true"`; corpo com `__proto__` | `422`, `422`, `200` sem mudar o perfil |
| `:id` igual a `%00`, `abc%00`, `<uuid>%00`, `<uuid>%20`, `{<uuid>}`, `..%2F..`, 8.000 letras, em `PATCH` e em `PUT .../password` | `404` `not_found`; `%E0%A4%A` responde `400`; o `uuid` em maiúsculas chega ao usuário |

**N3 refeito e ampliado (C32).** `POST /api/auth/two-factor/verify`, sem login pendente salvo onde dito.

| Cookie `__Secure-better-auth.two_factor` | Observado |
| --- | --- |
| ausente | `401` `invalid_code` (controle) |
| `%E0%A4%A.x` e `ab%00cd.assinatura`, com `code` e com `backupCode` | `401` `invalid_code` nas quatro (na rodada 2: `500`) |
| outros 17 valores, cada um com `code` e com `backupCode`: `abc.def`, vazio, `semponto`, `%`, `%E0%A4%A`, `%00`, `.`, `..`, `a.`, `.a`, `%2E`, texto de SQL, `a%20b.c`, `%C3%A9.x`, `a%0Ab.c`, `a%27b.c`, entre aspas | `401` `invalid_code` nas 34 |
| com um login pendente real: o identificador real com assinatura trocada, sem assinatura, com assinatura `%E0%A4%A` e `%00`; bytes `0xFF 0xFE` no valor; o cookie real ao lado de um cookie de bytes altos e código errado; dois cookies `two_factor`, o forjado primeiro | `401` `invalid_code` nas sete; nenhuma sessão |
| o cookie real e um código TOTP válido | `200` `authenticated` |

**Outros cookies e cabeçalhos lidos antes da validação.**

| Requisição | Observado |
| --- | --- |
| cookie de sessão forjado (8 valores, entre eles `%E0%A4%A.x`, `ab%00cd.assinatura`, 4.000 letras) em `GET /api/auth/session` e `POST /api/auth/logout` | `401` `unauthorized` nas 16 |
| login certo de usuário sem 2FA com um cookie malformado de nome `session_token`, `two_factor`, `trust_device`, `dont_remember`, `session_data`, `account_data` ou `oauth_state` (3 valores cada) | `200` `authenticated` nas 21 |
| login certo de usuário com 2FA com cookie `trust_device`, `two_factor`, `dont_remember` ou `session_token` forjado (6 valores cada) | `200` `two_factor_required` nas 24: o cookie de dispositivo confiável forjado não pula o segundo passo |
| sessão válida com um cookie malformado ao lado (7 formas), em seis rotas autenticadas | a resposta de cada rota como sem o cookie, nas 42 |
| um cookie de sessão malformado antes do válido, no mesmo cabeçalho | `401` `unauthorized` (vale o primeiro) |
| login certo com `User-Agent` de bytes altos, de 8 KB, com `%00`; `X-Forwarded-For` com texto de SQL, de 6 KB, de bytes altos; `X-Request-Id` do cliente | `200` nas 9; o `User-Agent` de 8.000 caracteres foi gravado em `sessions` |
| corpo com `charset=latin1` ou `charset=bogus`; gzip inválido; `Content-Encoding: br`; UTF-16 sem declarar | `415`, `415`, `400`, `400`, `400` |

**N5 e N6**: tabelas nos achados. **N4**: linha do N4 na tabela de achados anteriores.

**Comando `pnpm users:create-admin`** (rodado de verdade, fora do processo da API): com o banco
recusando conexão, código 1 e `users:create-admin: Error: connect ECONNREFUSED`; com a tabela `users`
renomeada, a saída começa por `users:create-admin: Error: Failed query: insert into "users" (...)
values (default, $1, $2, ...)` e não contém o nome, o e-mail, a senha, o hash nem a palavra `params`;
`--email` de 255 caracteres, código 1 com `--email não é um e-mail válido`.

**Testes novos contra o código antigo**: cópia da árvore de `bd273b6` numa pasta temporária fora do
repositório (`git archive`, sem `git worktree` e sem tocar a árvore real), com `apps/api/src` e
`packages/contracts/src` de `328dda1`; resultados em `## Fix diff`. A cópia foi apagada.

## Level and sampling judgment

carried from 1d5598f e 328dda1, com dois acréscimos desta rodada.

- Nível: toda afirmação que nomeia status, rota ou forma de resposta tem prova que cruza a
  fronteira (carried from 1d5598f). Os cinco testes novos também cruzam a fronteira HTTP da API
  montada, sobre Postgres real.
- Amostragem: as exceções das rodadas 1 e 2 (P2, P3, e "a prova exercita um membro comum da
  classe") seguem.
- Acréscimo (verified at bd273b6): C10, C12, C51 e C60 provam a senha com letras ASCII
  (`apps/api/test/password.test.ts:148`, `apps/api/test/users.test.ts:241`). Com ASCII, caractere e
  unidade UTF-16 coincidem, e a divergência do N5 fica fora do alcance de todas as provas. A C10 e a
  C60 estreitam "uma senha válida" das AC 9 e AC 44 para "12 caracteres": provam um ponto da classe
  que a AC nomeia.
- Acréscimo (verified at bd273b6): a C37 prova a "senha errada" com um valor curto; o N6 é um
  membro da mesma classe acima do limite da biblioteca.
- Este profile não injeta falhas. Os cinco testes novos foram rodados contra o código antigo; é a
  única evidência desta rodada de que uma asserção pega uma implementação errada.

## Swept

- "validation: C12, C17, C21, C54": verified at bd273b6 quanto ao que a correção mexeu - as quatro
  provas passam com os schemas novos, e a C17 foi conferida no processo real com dois defeitos no
  mesmo campo.
- "dependency failure: banco fora numa rota `/api` cai no `500 internal_error` do `ProblemFilter`":
  carried from 328dda1; nesta rodada, com a tabela `users` renomeada, as três requisições da sonda
  do N4 responderam `500` `internal_error`.
- "`AUTH_SECRET` e `WEB_ORIGIN` rejeitadas na subida": a C14 passou em `bd273b6`; o resto, carried
  from 1d5598f (a correção não toca `compose.yaml`, `.env.example` nem `apps/api/src/env.ts`).
- As demais linhas de `Swept`: carried from 1d5598f - nomeiam checks desta feature (julgados na
  tabela) ou são política aprovada.

## Coverage

Não é recomputado no profile `light`. O que encontrei fora da tabela do autor: F3 (segue sem linha),
os limites que as correções criaram (e-mail de 254, `U+0000` no nome, cookie forjado) e N5 e N6.

## Test policy rows

No profile `light` não há veredito por linha; `checks.md` diz o mesmo.

## Faults injected

Não roda no profile `light`. Nenhuma mutação foi feita na árvore real.

## Steps not run

- Passo 1 (fontes binding), recomputação do `Coverage`, vereditos de `Test policy` e passo 4
  (injeção de falhas): são dos profiles `standard` e `ui`.
- Passo 5 (percorrer o fluxo com o usuário): não há usuário na sessão do Verifier. A correção não
  toca nenhuma tela.
- As linhas `carried` não foram rejulgadas contra o código: a prova de cada uma foi rodada, a
  evidência é a da rodada indicada na célula.
- `unreachable_api_answers_502_or_504_problem` (o teste do F3) e a sonda das 179 requisições da
  checagem de origem não foram refeitos: a correção não toca o web nem `apps/api/src/csrf.ts`.

## Tree state

`git status --porcelain` antes e depois das provas e sondas: só `?? CLAUDE.md`, que já estava lá.
Nenhum arquivo de `apps/`, `packages/` ou `tests/` foi alterado, nada foi commitado, nenhum
`git stash`, `reset` ou `worktree`. `apps/api/dist` e `coverage/` (ignorados pelo git) foram
reconstruídos. Os arquivos que este Verifier escreveu: este relatório e, pelo `lessons.py`,
`.specs/lessons.json` e `.specs/LESSONS.md`. O container do Postgres das sondas foi removido, o
processo da API das sondas foi encerrado, a cópia da árvore foi apagada, nenhum projeto do Compose
ficou para trás e as portas 3100, 3199 e a da sonda estão livres.

## Gate

`api` + `db` + `repo` + `web` + `stack` + `gate` em `bd273b6` (6 invocações, cada uma exit 0) - 102 passed, 0 failed. 99 de 102 checks provados com evidência localizada; C3, C32, C41 e C56 passaram a provados; C51 segue reprovada, agora pelo N5; C37 e C60 reprovadas por contraexemplo novo rodado no processo real, apesar da prova verde.
