# Autenticação e controle de acesso por perfil - checks

Profile: light
Plan: `.specs/features/auth-rbac/plan.md`

## Intent

102 checks in 9 slices (S0 e as 8 do plano) · 13 one-way doors · 0 open

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`,
`playwright test <arquivo> -g`); os arquivos de teste nomeados aqui são criados no Build, salvo
`boot.test.ts`, `contracts.test.ts`, `repo.test.ts`, `compose.test.ts` e `verify.test.ts`, que
existem e ganham casos. Regras que valem para todas:

- Toda prova de `apps/api` e de `packages/database` roda contra Postgres real, que o próprio teste
  sobe (AD-012), pelo mesmo `AppModule` e `configureApp` do processo real.
- Requisição "válida" numa prova de `apps/api` leva `Origin` igual a `WEB_ORIGIN`, salvo quando a
  prova é sobre a origem.
- Onde a prova depende de tempo (30 min, 15 min), o teste controla o relógio ou a data gravada na
  linha; nenhuma prova espera o tempo passar.
- As provas de `apps/web` controlam a API que o web enxerga, como na `fundacao`; o caminho real
  navegador → web → API → banco é provado na stack (C16, C26, C93). `tests/stack` continua fora de
  `pnpm verify`.
- "Rota registrada" é lida do roteador da aplicação em execução, nunca de uma lista escrita no teste.

### S0 - Prova da door 2, antes de qualquer outro código · ~10 files · ~28 KB · ~7k

Se a C1 reprovar, o Build para e a door 2 volta para revisão (linha "O que a documentação não
afirma" de `Assumptions`). Nenhum outro check é tocado antes de ela estar verde.

**C1** - Com `better-auth` configurado como na door 2 (`drizzleAdapter`, plugin `twoFactor()`, handler HTTP não montado) e um usuário com 2FA ativo, `auth.api.signInEmail` chamado com `returnHeaders: true` não cria linha em `sessions`, e `auth.api.verifyTOTP` chamado com `returnHeaders: true`, os cookies devolvidos pela primeira chamada e um código TOTP válido cria exatamente uma linha em `sessions` e devolve um `Set-Cookie` que `auth.api.getSession` resolve para aquele usuário (door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/better-auth.test.ts -t "two_factor_via_auth_api_with_return_headers"`

### S1 - Entrar, permanecer e sair · ~20 files · ~64 KB · ~16k

**C2** - `POST /api/auth/login` com e-mail e senha de um usuário ativo sem 2FA responde `200` com exatamente `{"status":"authenticated"}`, cria uma linha em `sessions` e devolve um `Set-Cookie` de sessão com `HttpOnly`, `Secure`, `SameSite=Lax` e `Path=/`, sem `Domain` (AC 1, door 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/login.test.ts -t "login_200_authenticated_with_session_cookie"`

**C3** - `POST /api/auth/login` com e-mail inexistente, com senha errada e com usuário inativo responde, nos três casos, `401` com `code` igual a `invalid_credentials`, sem `Set-Cookie` e com corpos idênticos entre si salvo o `requestId` (AC 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/login.test.ts -t "login_401_identical_for_three_causes"`

**C4** - `GET /api/auth/session` com cookie de sessão válido responde `200` com `user.id`, `user.name`, `user.email`, `user.role`, `user.twoFactorEnabled` e `twoFactorEnrollmentRequired`, e nenhuma outra chave (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/session.test.ts -t "session_200_returns_user_fields"`

**C5** - `GET /api/auth/session` sem cookie, com cookie adulterado e com sessão expirada responde, nos três casos, `401` com `code` igual a `unauthorized` (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/session.test.ts -t "session_401_without_valid_session"`

**C6** - `POST /api/auth/logout` com sessão válida responde `204`, a linha daquela sessão deixa de existir em `sessions`, e o mesmo cookie recebe `401` em `GET /api/auth/session` (AC 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/session.test.ts -t "logout_204_deletes_session_row"`

**C7** - Uma sessão cujo último uso foi há 30 minutos recebe `401` na requisição seguinte (AC 6, door 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/session.test.ts -t "session_expires_after_30_min_idle"`

**C8** - Uma sessão usada aos 29 minutos responde `200` aos 58 minutos da criação (AC 7, door 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/session.test.ts -t "session_slides_on_use"`

**C9** - Depois de cada um dos quatro caminhos que gravam senha (`pnpm users:create-admin`, `POST /api/users`, `PUT /api/auth/password`, `PUT /api/users/:id/password`), o valor guardado em `accounts` começa por `$argon2id$v=19$m=19456,t=2,p=1$` e não contém a senha (AC 8, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/password.test.ts -t "every_password_write_stores_argon2id"`

**C10** - `PUT /api/auth/password` com a senha atual certa e uma nova de 12 caracteres responde `204`; a sessão que fez a chamada continua respondendo `200`, uma segunda sessão do mesmo usuário passa a receber `401`, e o login seguinte aceita a senha nova e recusa a antiga (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/password.test.ts -t "change_password_204_keeps_current_session_only"`

**C11** - `PUT /api/auth/password` com a senha atual errada responde `422` com exatamente um item em `errors`, de `path` igual a `currentPassword`, e a senha guardada não muda (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/password.test.ts -t "wrong_current_password_422"`

**C12** - Nas três rotas que recebem senha nova (`newPassword` em `PUT /api/auth/password`, `password` em `POST /api/users` e em `PUT /api/users/:id/password`), 11 e 129 caracteres respondem `422` com um item em `errors` cujo `path` é o campo da senha, e 12 e 128 caracteres são aceitos (AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/password.test.ts -t "password_length_bounds_on_three_routes"`

**C13** - Para cada método `GET`, `POST`, `PUT`, `PATCH` e `DELETE`, uma requisição a `/api/*` no web chega à API com o mesmo método, corpo, `Origin` e `Cookie`, e o navegador recebe o status, o corpo, o `Set-Cookie` e o `X-Request-Id` que a API respondeu (AC 12, door 6)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/proxy.spec.ts -g "proxy_forwards_request_and_response"`

**C14** - Iniciar o processo real da API com `AUTH_SECRET` ausente, `AUTH_SECRET` de 31 caracteres, `WEB_ORIGIN` ausente ou `WEB_ORIGIN` igual a `ftp://x` termina, nos quatro casos, com código 1, imprime o nome da variável e não imprime nenhum valor de variável definida (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "auth_env_rejected_exits_1_naming_var"`

**C15** - Os caminhos do handler HTTP do Better Auth não existem na API: `POST /api/auth/sign-up/email` e `POST /api/auth/sign-in/email` respondem `404` com `code` igual a `not_found`, e nenhum usuário é criado (door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/login.test.ts -t "better_auth_handler_is_not_mounted"`

**C16** - Na stack de pé, com um administrador criado por `pnpm users:create-admin` dentro do container `api`, `POST /api/auth/login` feito na origem do container `web` responde `200` com o cookie de sessão, e `GET /api/auth/session` com esse cookie, pela mesma origem, responde `200` (AC 12, door 6)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "login_through_web_origin"`

### S2 - Entrada inválida e origem estranha · ~8 files · ~24 KB · ~6k

**C17** - `POST /api/auth/login` com corpo JSON sem `password` e com `email` igual a `x` responde `422` em `application/problem+json` com `code` igual a `validation_failed` e exatamente dois itens em `errors`, de `path` `email` e `password`, cada um com `message` não vazia e diferente da mensagem padrão em inglês do Zod para o mesmo erro (AC 14, door 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/validation.test.ts -t "invalid_body_422_one_error_per_field"`

**C18** - Um campo reprovado dentro de um objeto aninhado sai em `errors` com `path` em notação de ponto: `address.zip` para o campo `zip` de `address` (AC 14, door 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/validation.test.ts -t "nested_path_uses_dot_notation"`

**C19** - Com um valor marcador distinto em cada campo reprovado, o corpo da resposta `422` não contém nenhum dos valores enviados (AC 15)
Proof: `pnpm --filter "./apps/api" exec vitest run test/validation.test.ts -t "errors_never_echo_client_values"`

**C20** - `POST /api/auth/login` com corpo que não é JSON legível responde `400` com `code` igual a `bad_request`, não `422` (door 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/validation.test.ts -t "unreadable_body_stays_400"`

**C21** - Cada uma das nove rotas da `Surface` que listam `422` responde `422` com `code` igual a `validation_failed` a um corpo `{}` ou, onde todos os campos são opcionais, a um campo de tipo errado (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/validation.test.ts -t "every_route_with_body_answers_422"`

**C22** - Para cada método `POST`, `PUT`, `PATCH` e `DELETE`, uma requisição `/api` com `Origin: https://outro.example` responde `403` com `code` igual a `csrf_rejected` e o handler não executa; um login com credenciais certas nessa condição não cria linha em `sessions` (AC 16, door 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/csrf.test.ts -t "foreign_origin_403_without_running_handler"`

**C23** - Uma requisição `POST /api` sem `Origin` responde `403` com `code` igual a `csrf_rejected`, sem executar o handler, quando `Sec-Fetch-Site` está ausente, é `cross-site` ou é `same-site` (AC 17, door 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/csrf.test.ts -t "missing_origin_403_unless_same_origin"`

**C24** - A checagem de origem deixa passar cinco casos: `POST` com `Origin` igual a `WEB_ORIGIN`; `POST` sem `Origin` e com `Sec-Fetch-Site: same-origin`; e `GET`, `HEAD` e `OPTIONS` com `Origin: https://outro.example` - nenhum responde `csrf_rejected` (door 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/csrf.test.ts -t "same_origin_and_safe_methods_pass"`

**C25** - `POST /api/auth/login` com `Origin: https://outro.example` e corpo `{}` responde `403` com `csrf_rejected`, não `422`: a origem é checada antes do corpo (Flow, login, hop 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/csrf.test.ts -t "origin_is_checked_before_body"`

**C26** - No processo real da stack, pela origem do web, `POST /api/auth/login` com `Origin: https://outro.example` responde `403` com `csrf_rejected` e `GET /api/users` sem cookie responde `401` com `unauthorized`, ambos em `application/problem+json` (AC 4, AC 16)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "running_api_rejects_foreign_origin_and_anonymous"`

### S3 - Segundo fator · ~5 files · ~28 KB · ~7k

**C27** - `POST /api/auth/two-factor/enable` com a senha certa responde `200` com `totpUri` começando por `otpauth://totp/` e `backupCodes` com ao menos um item, e `GET /api/auth/session` continua devolvendo `user.twoFactorEnabled` igual a `false` (AC 18)
Proof: `pnpm --filter "./apps/api" exec vitest run test/two-factor.test.ts -t "enable_200_returns_uri_and_backup_codes"`

**C28** - `POST /api/auth/two-factor/confirm` com um código TOTP válido para o segredo recém-gerado responde `204`, e `GET /api/auth/session` passa a devolver `user.twoFactorEnabled` igual a `true` (AC 19)
Proof: `pnpm --filter "./apps/api" exec vitest run test/two-factor.test.ts -t "confirm_204_turns_two_factor_on"`

**C29** - `POST /api/auth/login` com credenciais certas de um usuário com `twoFactorEnabled` igual a `true` responde `200` com exatamente `{"status":"two_factor_required"}`, e nenhuma linha é criada em `sessions` (AC 20)
Proof: `pnpm --filter "./apps/api" exec vitest run test/two-factor.test.ts -t "login_with_2fa_returns_two_factor_required"`

**C30** - Depois de um login `two_factor_required`, `POST /api/auth/two-factor/verify` com um código TOTP válido responde `200` com `{"status":"authenticated"}` e um cookie de sessão que recebe `200` em `GET /api/auth/session` (AC 21)
Proof: `pnpm --filter "./apps/api" exec vitest run test/two-factor.test.ts -t "verify_totp_200_authenticates"`

**C31** - `POST /api/auth/two-factor/verify` com um `backupCode` ainda não usado responde `200` com o cookie de sessão, e o mesmo código num login seguinte responde `401` com `invalid_code` (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/two-factor.test.ts -t "backup_code_authenticates_once"`

**C32** - `POST /api/auth/two-factor/verify` responde `401` com `code` igual a `invalid_code`, sem criar linha em `sessions`, em três casos: código TOTP inválido, código de recuperação inexistente e chamada sem login pendente (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/two-factor.test.ts -t "verify_401_invalid_code_in_three_cases"`

**C33** - Com a sessão de um `admin` de `twoFactorEnabled` igual a `false`, toda rota registrada sob `/api`, exceto as duas públicas e as quatro isentas, responde `403` com `code` igual a `two_factor_enrollment_required` - as 8 restantes da `Surface`: `PUT /api/auth/password`, `POST /api/auth/two-factor/disable`, `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, `PUT /api/users/:id/password`, `DELETE /api/users/:id/two-factor` e `GET /api/openapi.json` (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C34** - Com a mesma sessão, as quatro rotas isentas não respondem `two_factor_enrollment_required`: `GET /api/auth/session` responde `200`, `POST /api/auth/two-factor/enable` `200`, `POST /api/auth/two-factor/confirm` `204` e `POST /api/auth/logout` `204` (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "four_exempt_routes_stay_reachable"`

**C35** - `GET /api/auth/session` devolve `twoFactorEnrollmentRequired` igual a `true` para `admin` sem 2FA, `false` para `admin` com 2FA e `false` para `reception` sem 2FA (AC 25, RF-01)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "enrollment_required_only_for_admin_without_2fa"`

**C36** - `POST /api/auth/two-factor/disable` com a senha certa responde `204`, `user.twoFactorEnabled` passa a `false` e a linha do usuário em `two_factors` deixa de existir (AC 26)
Proof: `pnpm --filter "./apps/api" exec vitest run test/two-factor.test.ts -t "disable_204_deletes_secret_and_backup_codes"`

**C37** - Responde `422` com um item em `errors`: `two-factor/enable` com senha errada (`path` igual a `password`), `two-factor/disable` com senha errada (`path` igual a `password`) e `two-factor/confirm` com código inválido (`path` igual a `code`); em nenhum dos três `twoFactorEnabled` muda (AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/two-factor.test.ts -t "wrong_password_or_code_422_on_field|long_wrong_password_422_on_enable_and_disable"`

### S4 - Bloqueio por tentativas · ~4 files · ~20 KB · ~5k

**C38** - Depois de 5 logins com senha errada para o mesmo e-mail, escritos alternando maiúsculas e minúsculas, o sexto login, com a senha certa, responde `429` com `code` igual a `too_many_attempts` e um `Retry-After` inteiro entre 1 e 900 (AC 28, door 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/throttle.test.ts -t "fifth_failure_blocks_even_right_password"`

**C39** - 15 minutos depois da quinta falha, o login com a senha certa responde `200`; a 14 minutos e 59 segundos, `429` (AC 28)
Proof: `pnpm --filter "./apps/api" exec vitest run test/throttle.test.ts -t "block_ends_15_min_after_fifth_failure"`

**C40** - 4 falhas, depois 16 minutos sem tentativa, depois 1 falha: a última responde `401`, não `429` - falha com mais de 15 minutos não conta (AC 28)
Proof: `pnpm --filter "./apps/api" exec vitest run test/throttle.test.ts -t "failures_older_than_window_do_not_count"`

**C41** - Para um e-mail que não pertence a usuário nenhum, as 5 primeiras tentativas respondem `401` com `invalid_credentials` e a sexta `429` com `too_many_attempts` e `Retry-After`, com corpo de mesma forma que o de um e-mail existente (AC 29)
Proof: `pnpm --filter "./apps/api" exec vitest run test/throttle.test.ts -t "unknown_email_blocks_identically"`

**C42** - 4 falhas, um login autenticado, e mais 4 falhas: a oitava falha responde `401`, não `429` (AC 30)
Proof: `pnpm --filter "./apps/api" exec vitest run test/throttle.test.ts -t "successful_login_resets_counter"`

**C43** - Depois de um login `two_factor_required`, 5 chamadas a `POST /api/auth/two-factor/verify` com código inválido fazem o login seguinte daquele e-mail, com a senha certa, responder `429` com `too_many_attempts` (AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/throttle.test.ts -t "invalid_codes_count_on_login_counter"`

**C44** - Com o e-mail do login pendente bloqueado, `POST /api/auth/two-factor/verify` com um código TOTP válido responde `429` com `too_many_attempts` e `Retry-After`, sem criar sessão (AC 28, AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/throttle.test.ts -t "verify_429_when_blocked"`

**C45** - 10 logins com senha errada para o mesmo e-mail, disparados ao mesmo tempo, recebem no máximo 5 respostas `401` e `429` nas demais, somando 10 (AC 32, door 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/throttle.test.ts -t "ten_concurrent_failures_yield_at_most_five_401"`

**C46** - Depois de 5 falhas, uma segunda instância da API ligada ao mesmo banco responde `429` ao login daquele e-mail: a contagem vive em `login_throttles`, não em memória (door 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/throttle.test.ts -t "block_survives_restart"`

### S5 - Cada perfil só alcança o que pode · ~6 files · ~20 KB · ~5k

**C47** - Subir a API com uma rota `GET /api/undeclared` sem declaração de acesso, ou com uma rota que declara `@Public()` e `@Roles('admin')` ao mesmo tempo, termina nos dois casos com código 1 e imprime o método e o caminho da rota (AC 33, door 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "route_without_single_access_declaration_exits_1"`

**C48** - Sobre três rotas de teste (`@Public()`, `@Authenticated()` e `@Roles('admin', 'reception')`) e cinco chamadores (sem sessão, `admin` com 2FA, `reception`, `hr_finance`, `instructor`), as 15 combinações respondem: pública, sempre `200`; autenticada, `401` com `unauthorized` sem sessão e `200` nos quatro perfis; por perfil, `401` sem sessão, `200` para `admin` e `reception`, e `403` com `code` igual a `forbidden` para `hr_finance` e `instructor`, sem executar o handler (AC 34, door 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "guard_matrix_three_declarations_five_callers"`

**C49** - Com sessão de `reception`, de `hr_finance` e de `instructor`, cada uma das cinco rotas `/api/users*` (`GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, `PUT /api/users/:id/password`, `DELETE /api/users/:id/two-factor`) responde `403` com `code` igual a `forbidden`, e nenhuma linha de `users` muda - 15 combinações (AC 35)
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "non_admin_403_on_every_users_route"`

**C50** - Sem cookie, toda rota registrada na API responde `401` com `code` igual a `unauthorized`, exceto exatamente três, que não respondem `unauthorized`: `POST /api/auth/login`, `POST /api/auth/two-factor/verify` e `GET /health` (AC 36, AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "only_three_routes_answer_without_session"`

### S6 - O Administrador gere os usuários · ~10 files · ~48 KB · ~12k

**C51** - `POST /api/users` feito por um administrador com dados válidos responde `201` com `id`, `name`, `email`, `role`, `active` igual a `true` e `twoFactorEnabled` igual a `false`, sem nenhum campo de senha, e o login daquele usuário com a senha informada responde `200` (AC 37)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts test/password.test.ts -t "create_user_201_and_user_can_log_in|every_password_accepted_on_write_logs_in"`

**C52** - `POST /api/users` com o e-mail de um usuário existente escrito com outras maiúsculas responde `409` com `code` igual a `email_taken`, e a contagem de linhas de `users` não muda (AC 38)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "duplicate_email_409_case_insensitive"`

**C53** - Um usuário criado com o e-mail `Ana.Lima@Exemplo.com` aparece em `GET /api/users` com `email` igual a `ana.lima@exemplo.com` (door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "email_is_stored_lowercase"`

**C54** - `POST /api/users` e `PATCH /api/users/:id` com `role` igual a `owner` respondem `422` com um item em `errors` de `path` igual a `role`; os quatro valores `admin`, `reception`, `hr_finance` e `instructor` são aceitos (door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "role_accepts_only_the_four_values"`

**C55** - `GET /api/users` feito por um administrador responde `200` com todos os usuários, ativos e inativos, em ordem alfabética de `name`, cada item com exatamente as chaves `id`, `name`, `email`, `role`, `active` e `twoFactorEnabled` (AC 39)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "list_users_200_sorted_with_six_keys"`

**C56** - `PATCH /api/users/:id` com só `name`, com só `role` e com só `active` responde, nos três casos, `200` com o usuário trazendo o valor novo e os demais campos inalterados (AC 40)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "patch_user_200_per_field"`

**C57** - Depois de um `PATCH /api/users/:id` que muda `role`, e depois de um que passa `active` para `false`, o cookie de uma sessão aberta daquele usuário recebe `401`, e ele não tem mais linha em `sessions` (AC 41, door 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "role_change_or_deactivation_ends_sessions"`

**C58** - `PATCH /api/users/:id` responde `409` com `code` igual a `last_admin`, sem mudar `role` nem `active`, em três casos: tirar o perfil `admin` do único administrador ativo, desativá-lo, e tirar o perfil dele quando o outro administrador existente está inativo (AC 42)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "last_admin_409_in_three_cases"`

**C59** - Com exatamente dois administradores ativos, duas requisições `PATCH` simultâneas, cada uma desativando um deles, recebem exatamente um `200` e um `409` com `last_admin`, e resta exatamente um administrador ativo (AC 43)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "concurrent_removal_of_last_two_admins"`

**C60** - `PUT /api/users/:id/password` feito por um administrador com uma senha de 12 caracteres responde `204`; a sessão aberta daquele usuário passa a receber `401`, o login dele com a senha nova responde `200` e com a antiga `401` (AC 44)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts test/password.test.ts -t "admin_resets_password_204|every_password_accepted_on_write_logs_in"`

**C61** - `DELETE /api/users/:id/two-factor` feito por um administrador responde `204`; `twoFactorEnabled` daquele usuário passa a `false`, a linha dele em `two_factors` deixa de existir e a sessão aberta dele passa a receber `401` (AC 45)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "admin_resets_two_factor_204"`

**C62** - Nas três rotas com `:id` (`PATCH /api/users/:id`, `PUT /api/users/:id/password`, `DELETE /api/users/:id/two-factor`), `:id` igual a `abc` e `:id` igual a um `uuid` sem usuário respondem `404` com `code` igual a `not_found` - 6 combinações (AC 46)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "unknown_or_malformed_id_404"`

**C63** - `pnpm users:create-admin --email <e-mail> --name <nome>` com `ADMIN_PASSWORD` de 12 caracteres sai com código 0, cria um usuário ativo de `role` igual a `admin`, imprime o `id` e o e-mail, e a saída não contém a senha (AC 47)
Proof: `pnpm --filter "./apps/api" exec vitest run test/create-admin.test.ts -t "creates_admin_exits_0_without_printing_password"`

**C64** - `pnpm users:create-admin` sai com código 1, nomeia o motivo e deixa a contagem de linhas de `users` e de `accounts` inalterada em seis casos: e-mail já cadastrado, `ADMIN_PASSWORD` de 11 caracteres, de 129 caracteres, `ADMIN_PASSWORD` ausente, sem `--email` e sem `--name` (AC 48)
Proof: `pnpm --filter "./apps/api" exec vitest run test/create-admin.test.ts -t "rejects_six_invalid_invocations"`

**C65** - Depois de `pnpm db:migrate` num banco vazio existem as seis tabelas `users`, `sessions`, `accounts`, `verifications`, `two_factors` e `login_throttles`, e nenhuma tabela do schema `public` tem coluna `tenant_id` (door 1, door 3)
Proof: `pnpm --filter "./packages/database" exec vitest run test/schema.test.ts -t "six_identity_tables_and_no_tenant_id"`

**C66** - Em cada uma das cinco tabelas de identidade (`users`, `sessions`, `accounts`, `verifications`, `two_factors`), uma linha inserida sem `id` recebe do banco um `uuid` de versão 7 (door 3)
Proof: `pnpm --filter "./packages/database" exec vitest run test/schema.test.ts -t "ids_default_to_uuidv7"`

**C67** - Inserir em `users` uma segunda linha com o mesmo `email` falha no banco com violação de unicidade (door 3)
Proof: `pnpm --filter "./packages/database" exec vitest run test/schema.test.ts -t "users_email_is_unique"`

**C68** - Inserir em `users` uma linha com `role` igual a `owner` falha no banco (Relations, door 5)
Proof: `pnpm --filter "./packages/database" exec vitest run test/schema.test.ts -t "users_role_rejects_fifth_value"`

### S7 - Telas · ~40 files · ~120 KB · ~30k

**C69** - Sem sessão, abrir `/`, `/users`, `/account` e `/two-factor/setup` termina, nos quatro casos, na URL `/login` (AC 49)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "anonymous_is_redirected_to_login"`

**C70** - `/login` exibe o título "Entrar", os campos "E-mail" e "Senha" e o botão "Entrar", e o elemento `html` tem `lang="pt-BR"` (AC 50)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/login.spec.ts -g "login_page_shows_form_in_pt_br"`

**C71** - Depois de um login autenticado a URL é `/` e a página exibe "Gestão de Academia", o nome do usuário, o botão "Sair" e o perfil por extenso - "Administrador", "Recepção", "RH/Financeiro" e "Instrutor" para `admin`, `reception`, `hr_finance` e `instructor` (AC 51)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/login.spec.ts -g "home_shows_name_and_role_label_for_four_roles"`

**C72** - Com o login respondendo `401`, `/login` exibe "E-mail ou senha incorretos.", o campo "E-mail" mantém o valor digitado e o campo "Senha" fica vazio (AC 52)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/login.spec.ts -g "login_401_shows_message_and_clears_password"`

**C73** - Com o login respondendo `429`, `/login` exibe "Muitas tentativas. Tente novamente em N minutos." com N igual a 15, 2 e 1 para `Retry-After` igual a 900, 61 e 60 (AC 53)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/login.spec.ts -g "login_429_shows_minutes_rounded_up"`

**C74** - Com a API respondendo `422` e um item em `errors`, a `message` aparece junto do campo indicado em `path` em cada um dos quatro formulários: login, cadastro do 2FA, usuário e troca de senha em `/account` (AC 54)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/forms.spec.ts -g "field_errors_shown_on_four_forms"`

**C75** - Com a API pendurada por mais de 3 s e com a API respondendo `500`, cada uma das cinco telas com envio (`/login`, `/login/two-factor`, `/two-factor/setup`, formulário de usuário, `/account`) exibe "Serviço indisponível. Tente novamente em instantes." sem sair da tela - 10 combinações (AC 55)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/forms.spec.ts -g "unavailable_api_message_on_five_screens"`

**C76** - Enquanto a API não responde, o botão de envio fica desabilitado em cada um dos cinco formulários: login, segundo fator, cadastro do 2FA, usuário e troca de senha (AC 56)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/forms.spec.ts -g "submit_disabled_while_pending_on_five_forms"`

**C77** - Com o login respondendo `two_factor_required`, a URL passa a `/login/two-factor` e a página exibe o campo "Código de 6 dígitos" e o link "Usar código de recuperação" (AC 57)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/two-factor.spec.ts -g "two_factor_required_shows_code_page"`

**C78** - Em `/login/two-factor`, depois de acionar "Usar código de recuperação", o envio chega à API em `POST /api/auth/two-factor/verify` com `backupCode` e sem `code` (AC 22, AC 57)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/two-factor.spec.ts -g "recovery_link_sends_backup_code"`

**C79** - Com a verificação do segundo fator respondendo `401`, `/login/two-factor` exibe "Código inválido." (AC 58)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/two-factor.spec.ts -g "verify_401_shows_invalid_code"`

**C80** - Com a sessão devolvendo `twoFactorEnrollmentRequired` igual a `true`, abrir `/`, `/users` e `/account` termina, nos três casos, na URL `/two-factor/setup` (AC 59)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/two-factor.spec.ts -g "enrollment_required_redirects_three_pages"`

**C81** - `/two-factor/setup` exibe um QR code cujo conteúdo decodificado é o `totpUri` devolvido pela API, o segredo desse `totpUri` em texto e o campo "Código de 6 dígitos" (AC 60)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/two-factor.spec.ts -g "setup_shows_qr_secret_and_code_field"`

**C82** - Confirmado o cadastro do 2FA, a página exibe cada código de `backupCodes` e o aviso "Guarde estes códigos. Eles não serão exibidos novamente."; recarregada, não exibe mais nenhum deles (AC 61)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/two-factor.spec.ts -g "backup_codes_shown_exactly_once"`

**C83** - `/users` aberta por um administrador exibe uma tabela com as colunas "Nome", "E-mail", "Perfil", "Situação" e "2FA", nesta ordem, as linhas em ordem alfabética de nome, "Ativo" para `active` igual a `true` e "Inativo" para `false`, e o botão "Novo usuário" (AC 62)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/users.spec.ts -g "users_table_columns_order_and_button"`

**C84** - `/users` aberta com sessão de `reception` exibe "Você não tem permissão para acessar esta página." e a página não contém nome nem e-mail de nenhum usuário da lista (AC 63)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/users.spec.ts -g "non_admin_sees_no_permission_and_no_data"`

**C85** - Em `/`, o link "Usuários" aparece para `admin` e não aparece para `reception`, `hr_finance` e `instructor` (AC 64)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "users_link_only_for_admin"`

**C86** - Para cada ação "Desativar", "Redefinir senha" e "Zerar 2FA", acionar abre um diálogo que contém o nome do usuário, nenhuma requisição de escrita chega à API antes da confirmação, e uma chega depois dela (AC 65)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/users.spec.ts -g "three_actions_confirm_naming_the_user"`

**C87** - Com `GET /api/users` respondendo `500`, `/users` exibe "Não foi possível carregar os usuários." e o botão "Tentar novamente", que ao ser acionado com a API de volta exibe a tabela (AC 66)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/users.spec.ts -g "list_failure_shows_retry"`

**C88** - `/account` exibe o formulário de troca da própria senha e a ação "Ativar verificação em duas etapas" quando `twoFactorEnabled` é `false`, ou "Desativar verificação em duas etapas" quando é `true` (AC 67)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/account.spec.ts -g "account_offers_password_and_2fa_toggle"`

**C89** - Acionar "Sair" faz `POST /api/auth/logout` chegar à API e a URL passar a `/login` (AC 68)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "sign_out_calls_logout_and_goes_to_login"`

**C90** - Com sessão válida, abrir `/login` termina na URL `/` (AC 69)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "signed_in_user_leaves_login"`

**C91** - Enviar o formulário de login com os dois campos vazios exibe um erro junto de "E-mail" e outro junto de "Senha" e nenhuma requisição chega à API: o formulário valida pelo schema de `packages/contracts` antes de enviar (door 13)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/login.spec.ts -g "empty_login_is_rejected_before_any_request"`

**C92** - `packages/ui` é um workspace que declara `tailwindcss` e tem o `components.json` do shadcn/ui; `apps/web` declara `@academia/ui`, `react-hook-form` e `@academia/contracts`; e as tarefas `lint` e `typecheck` de `pnpm verify` alcançam `packages/ui` (door 13)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "ui_package_is_the_shared_interface_base"`

**C93** - Na stack de pé, `GET /` no container `web`, seguindo o redirecionamento, responde `200` na URL `/login` com o título "Entrar" (AC 49, Impact: healthcheck do `web`)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "home_redirects_to_login"`

### S8 - OpenAPI, cobertura e rastro · ~9 files · ~28 KB · ~7k

**C94** - `GET /api/openapi.json` com sessão válida responde `200` com um documento JSON cujo campo `openapi` começa por `3.1` (AC 70, door 12)
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "openapi_200_is_3_1"`

**C95** - O conjunto de pares método + caminho em `paths` do documento é igual ao conjunto de rotas registradas sob `/api`: nenhuma rota registrada falta e nenhum par do documento deixa de existir no roteador (AC 71)
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "paths_equal_registered_api_routes"`

**C96** - Para cada uma das nove rotas com corpo, o schema de `requestBody` no documento é igual ao resultado de `z.toJSONSchema` sobre o schema de `packages/contracts` daquela rota (door 12, AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "request_bodies_come_from_contract_schemas"`

**C97** - A configuração resolvida do Vitest de `apps/api` mede cobertura sobre `src/**` com limiar 70 para linhas e 70 para ramos, e o script `test` do pacote, que `pnpm verify` executa, roda com a cobertura ligada (AC 72)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "api_coverage_thresholds_are_70_lines_and_branches"`

**C98** - Num clone limpo, com um arquivo de `apps/api/src` acrescentado sem teste e grande o bastante para levar a cobertura abaixo de 70%, `pnpm verify` sai com código diferente de 0 (AC 72)
Proof: `pnpm --filter "./tests/stack" exec vitest run verify.test.ts -t "verify_fails_below_70_percent_coverage"`

**C99** - Um login gera exatamente uma linha de log em JSON com `msg` e `requestId` igual ao `X-Request-Id` da resposta, em quatro casos: autenticado, `auth.login_succeeded` com `userId`; senha errada de usuário existente, `auth.login_failed` com `userId`; e-mail inexistente, `auth.login_failed` sem `userId`; e-mail bloqueado, `auth.login_blocked` (AC 73)
Proof: `pnpm --filter "./apps/api" exec vitest run test/auth-log.test.ts -t "login_outcomes_log_one_line_each"`

**C100** - Percorridos login com falha, login autenticado, verificação por TOTP, verificação por código de recuperação e troca de senha, nenhuma linha escrita pelo processo contém nenhum dos seis valores: a senha, o código TOTP, o código de recuperação, o valor do cookie de sessão, o `AUTH_SECRET` e o e-mail digitado no login (AC 74)
Proof: `pnpm --filter "./apps/api" exec vitest run test/auth-log.test.ts -t "six_secrets_never_reach_the_log"`

**C101** - Uma resposta real de cada um dos dez `code` da door 9 (`validation_failed`, `unauthorized`, `invalid_credentials`, `invalid_code`, `forbidden`, `csrf_rejected`, `two_factor_enrollment_required`, `email_taken`, `last_admin`, `too_many_attempts`) tem `Content-Type: application/problem+json`, `X-Request-Id` igual ao `requestId` do corpo, e valida contra o schema de erro de `packages/contracts` (door 9, AD-009)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "ten_new_codes_match_problem_schema"`

**C102** - A resposta de sucesso real de cada uma das sete rotas que devolvem corpo (`POST /api/auth/login`, `POST /api/auth/two-factor/verify`, `GET /api/auth/session`, `POST /api/auth/two-factor/enable`, `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`) valida contra o schema de resposta daquela rota em `packages/contracts` (AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "seven_success_bodies_match_contract_schemas"`

## Coverage

Uma linha por rota da `Surface`, com os status como membros; depois as doors, as entidades e as
tabelas de decisão enumeradas no plano.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /api/auth/login` statuses (4) | 200 C2 · 401 C3 · 422 C17 · 429 C38 | - |
| `POST /api/auth/two-factor/verify` statuses (4) | 200 C30 · 401 C32 · 422 C21 · 429 C44 | - |
| `POST /api/auth/logout` statuses (2) | 204 C6 · 401 C50 | - |
| `GET /api/auth/session` statuses (2) | 200 C4 · 401 C5 | - |
| `PUT /api/auth/password` statuses (3) | 204 C10 · 401 C50 · 422 C11 | - |
| `POST /api/auth/two-factor/enable` statuses (3) | 200 C27 · 401 C50 · 422 C37 | - |
| `POST /api/auth/two-factor/confirm` statuses (3) | 204 C28 · 401 C50 · 422 C37 | - |
| `POST /api/auth/two-factor/disable` statuses (3) | 204 C36 · 401 C50 · 422 C37 | - |
| `GET /api/users` statuses (3) | 200 C55 · 401 C50 · 403 C49 | - |
| `POST /api/users` statuses (5) | 201 C51 · 401 C50 · 403 C49 · 409 C52 · 422 C54 | - |
| `PATCH /api/users/:id` statuses (6) | 200 C56 · 401 C50 · 403 C49 · 404 C62 · 409 C58 · 422 C54 | - |
| `PUT /api/users/:id/password` statuses (5) | 204 C60 · 401 C50 · 403 C49 · 404 C62 · 422 C12 | - |
| `DELETE /api/users/:id/two-factor` statuses (4) | 204 C61 · 401 C50 · 403 C49 · 404 C62 | - |
| `GET /api/openapi.json` statuses (2) | 200 C94 · 401 C50 | - |
| qualquer rota `/api`, em erro, statuses (4) | 401 C5 · 403 C22 · 422 C17 · 429 C38 | - |
| rotas da `Surface` com `422` de schema (9) | C21, table-driven over all 9 | - |
| `code` novos da door 9 (10) | `validation_failed` C17 · `unauthorized` C5 · `invalid_credentials` C3 · `invalid_code` C32 · `forbidden` C48 · `csrf_rejected` C22 · `two_factor_enrollment_required` C33 · `email_taken` C52 · `last_admin` C58 · `too_many_attempts` C38 | - |
| forma `problem+json` dos `code` novos (10) | C101, table-driven over all 10 | - |
| corpos de sucesso contra `packages/contracts` (7) | C102, table-driven over all 7 | - |
| login recusado, causas (3) | C3, table-driven over all 3: e-mail inexistente, senha errada, usuário inativo | - |
| sessão inválida, causas (3) | C5, table-driven over all 3: sem cookie, adulterado, expirada | - |
| atributos do cookie de sessão (5) | `HttpOnly` C2 · `Secure` C2 · `SameSite=Lax` C2 · `Path=/` C2 · sem `Domain` C2 | - |
| expiração deslizante, lados (2) | 30 min sem uso C7 · uso antes dos 30 min C8 | - |
| caminhos que gravam senha (4) | C9, table-driven over all 4 | - |
| tamanho da senha (4 edges) | 11 C12 · 12 C12 · 128 C12 · 129 C12 | - |
| rotas HTTP que recebem senha nova (3) | C12, table-driven over all 3 | - |
| métodos repassados pelo web (5) | C13, table-driven over all 5: GET, POST, PUT, PATCH, DELETE | - |
| variável de ambiente nova rejeitada (4) | C14, table-driven over all 4: `AUTH_SECRET` ausente, curta; `WEB_ORIGIN` ausente, não `http`/`https` | - |
| door 8, linhas da tabela (6) | `Origin` diferente C22 · sem `Origin` e sem `Sec-Fetch-Site` C23 · sem `Origin` com `Sec-Fetch-Site` de outro valor C23 · `Origin` igual C24 · sem `Origin` com `same-origin` C24 · `GET`/`HEAD`/`OPTIONS` C24 | - |
| métodos de escrita sob CSRF (4) | C22, table-driven over all 4: POST, PUT, PATCH, DELETE | - |
| verificação do segundo fator recusada (3) | C32, table-driven over all 3 | - |
| rotas bloqueadas para `admin` sem 2FA (8) | C33, table-driven over all 8, lidas do roteador | - |
| rotas isentas da AC 24 (4) | `GET /api/auth/session` C34 · `POST /api/auth/logout` C34 · `POST /api/auth/two-factor/enable` C34 · `POST /api/auth/two-factor/confirm` C34 | - |
| `twoFactorEnrollmentRequired` (3) | `admin` sem 2FA C35 · `admin` com 2FA C35 · outro perfil sem 2FA C35 | - |
| `422` de regra nas rotas de 2FA (3) | C37, table-driven over all 3 | - |
| `twoFactorEnabled` transitions (4) | `enable` mantém `false` C27 · `confirm` leva a `true` C28 · `disable` leva a `false` C36 · administrador zera C61 | - |
| bloqueio por tentativas, bordas (4) | 4 falhas não bloqueiam C40 · 5 bloqueiam C38 · falha fora da janela C40 · fim do bloqueio C39 | - |
| quem alimenta o contador (3) | senha errada C38 · e-mail inexistente C41 · código inválido C43 | - |
| rotas que respondem `429` (2) | `POST /api/auth/login` C38 · `POST /api/auth/two-factor/verify` C44 | - |
| declaração de acesso inválida (2) | C47, table-driven over all 2: ausente, dupla | - |
| guarda: declaração x chamador (15) | C48, table-driven over all 15 | - |
| perfil não administrador x rota `/api/users*` (15) | C49, table-driven over all 15 | - |
| rotas abertas sem sessão (3) | `POST /api/auth/login` C50 · `POST /api/auth/two-factor/verify` C50 · `GET /health` C50 | - |
| valores de `role` (4) | C54, table-driven over all 4, mais um quinto valor recusado | - |
| campos do `PATCH` (3) | C56, table-driven over all 3: `name`, `role`, `active` | - |
| alteração que encerra sessões (4) | muda `role` C57 · desativa C57 · senha redefinida C60 · 2FA zerado C61 | - |
| `last_admin` (3) | C58, table-driven over all 3 | - |
| `:id` inválido x rota (6) | C62, table-driven over all 6 | - |
| `pnpm users:create-admin` exit codes (2) | 0 C63 · 1 C64 | - |
| `pnpm users:create-admin` recusado (6) | C64, table-driven over all 6 | - |
| entidades de `Relations` (6) | `users` C65 · `sessions` C65 · `accounts` C65 · `verifications` C65 · `two_factors` C65 · `login_throttles` C65 | - |
| one-way constraints de `Relations` (4) | sem `tenant_id` C65 · `uuid` gerado pelo banco C66 · `users.email` único e em minúsculas C67 · `users.role` com quatro valores C68 | - |
| páginas protegidas sem sessão (4) | C69, table-driven over all 4 | - |
| rótulo do perfil (4) | C71, table-driven over all 4 | - |
| `Retry-After` em minutos (3 edges) | 900 C73 · 61 C73 · 60 C73 | - |
| formulários com erro por campo (4) | C74, table-driven over all 4 | - |
| API indisponível x tela (10) | C75, table-driven over all 10: pendurada e `500`, em 5 telas | - |
| formulários com envio pendente (5) | C76, table-driven over all 5 | - |
| páginas sob cadastro obrigatório do 2FA (3) | C80, table-driven over all 3 | - |
| colunas de `/users` (5) | "Nome" C83 · "E-mail" C83 · "Perfil" C83 · "Situação" C83 · "2FA" C83 | - |
| link "Usuários" por perfil (4) | C85, table-driven over all 4 | - |
| ações com confirmação (3) | C86, table-driven over all 3 | - |
| ação de 2FA em `/account` (2) | "Ativar" C88 · "Desativar" C88 | - |
| corpos do OpenAPI vindos de `packages/contracts` (9) | C96, table-driven over all 9 | - |
| limiar de cobertura (2) | linhas C97 · ramos C97 | - |
| desfechos do login no log (4) | C99, table-driven over all 4 | - |
| segredos fora do log (6) | C100, table-driven over all 6 | - |
| one-way doors (13) | door 1 C65 · door 2 C1 · door 3 C66 · door 4 C9 · door 5 C54 · door 6 C16 · door 7 C2 · door 8 C22 · door 9 C17 · door 10 C47 · door 11 C45 · door 12 C96 · door 13 C92 | - |
| startup config: guarda global, CSRF e prefixo `/api` (2 assemblies) | processo real na stack C26 · harness de teste C50 | - |
| startup config: `AUTH_SECRET` e `WEB_ORIGIN` (2 assemblies) | processo real C14 · stack do compose C16 | - |
| startup config: repasse `/api/*` com `API_URL` em runtime (2 assemblies) | servidor do Playwright C13 · container `web` C16 | - |

- Claims naming a status code, route or response shape: C2 a C12, C15, C17 a C25, C27 a C46, C48 a
  C62, C94 a C96, C99, C101 e C102 cruzam a fronteira HTTP da API montada; C13 e C69 a C91 cruzam a
  fronteira do web no navegador; C16, C26 e C93 cruzam as duas no processo real
- Os conjuntos "rotas bloqueadas" (C33), "rotas abertas sem sessão" (C50) e `paths` (C95) têm a
  enumeração lida do roteador em execução: uma rota nova entra na prova sem editar o teste
- C8 prova a renovação com folga de 1 minuto: a door 7 fixa `updateAge: 60`, então "30 minutos
  depois do último uso" tem precisão de 60 s, e a prova não afirma mais que isso
- C17 prova "em pt-BR" pelo que é observável numa execução: `message` não vazia e diferente da
  mensagem padrão em inglês. O plano não fixa o texto de cada mensagem de validação; se a revisão
  quiser textos literais, eles entram no plano antes do Build
- C78 não tem critério próprio: deriva da AC 57 (o link existe) e da AC 22 (o código de recuperação
  autentica), porque sem ela nada prova que o link leva o `backupCode` à API
- `fundacao`: C22 a C25 de lá (texto "API: operacional/indisponível" em `/`) deixam de valer, como o
  `Impact` registra, e `apps/web/e2e/home.spec.ts` sai junto. O estado "API fora" passa à C75 e a
  prova na stack à C93. Nenhum check da `fundacao` é editado: a troca fica registrada aqui
- `fundacao` C1 (três serviços `healthy`), C5 e C8 (toda chave obrigatória rejeitada na subida e
  presente em `.env.example`) seguem valendo sem edição e passam a cobrir também o healthcheck do
  `web` depois do redirecionamento e as chaves `AUTH_SECRET` e `WEB_ORIGIN`
- `GET /health` aberto e na raiz (AD-010, door 6): `fundacao` C2 prova o `200`; a C50 prova que
  segue sem exigir sessão
- A `Surface` não lista `403` nas rotas de `/api/auth/*` nem em `GET /api/openapi.json`, mas a AC 24
  o exige de três delas e da última: está provado pela C33, fora das linhas por rota
- No other check claims more than the cases its proof exercises

## Test policy

O repositório responde como um teste é construído (AD-012: Vitest contra Postgres real, Playwright
para telas) e onde ele mora. Não responde qual nível prova cada código nem quanto do espaço de
entrada a prova precisa afirmar; estas linhas respondem. No profile `light` o Verifier não dá
veredito por linha - elas valem como regra de escrita dos testes no Build.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide, alcançado por HTTP (checagem de origem, guarda, bloqueio por tentativas, regra do último administrador, validação) | uma prova na fronteira HTTP da API montada, com Postgres real | um caso afirmado por linha da tabela de decisão; onde o conjunto é lido do roteador, todas as rotas |
| Decide, sem fronteira HTTP (comando `pnpm users:create-admin`, restrições do schema) | uma prova no próprio nível: o processo do comando, o banco migrado | cada código de saída e cada entrada recusada; cada restrição violada uma vez |
| Tela | Playwright contra a API controlada pelo teste | cada estado de `Observable` com landing em AC; cada texto literal da AC |
| Montagem do processo real | uma prova em `tests/stack` por conjunto de startup config | um caminho por conjunto, pela origem do web |
| Instrumentação: controller que só repassa a `auth.api`, repasse `/api/*` do web, montagem do OpenAPI a partir dos schemas | nenhuma própria | coberta pela prova de quem a consome |

Evidence (o código ainda não existe; a contagem vem das tabelas do plano):

- door 8: 6 linhas (C22 a C24) -> decide
- door 10: 3 declarações x 5 chamadores, 15 células (C48), mais 8 rotas bloqueadas e 4 isentas pela AC 24 (C33, C34) -> decide
- door 11: 4 bordas, 3 fontes de falha, 1 corrida (C38 a C46) -> decide
- `Flow`, gestão de usuários: 3 formas de ficar sem administrador e 1 corrida (C58, C59) -> decide
- closest analogue in the repo: `apps/api/test/delivered-body-errors.test.ts`, uma tabela de cinco casos provada na fronteira HTTP, caso a caso, contra a aplicação montada pelo `startApi` de `test/support/app.ts`

Cost: 0 provas além das 102 acima - as linhas descrevem o nível em que elas já estão. Sem elas, a
escolha entre provar a guarda por uma rota real ou pela matriz inteira fica com quem escreve o teste.

## Swept

- validation: C12, C17, C21, C54
- failure modes: C58, C64, C75
- idempotency: C31, C52
- authorization: C33, C48, C49, C50
- concurrency: C45, C59
- data lifecycle: C6, C36, C61 - o que o usuário ou o administrador encerra é apagado. Linhas vencidas de `sessions`, `verifications` e `login_throttles` não têm limpeza no plano e nenhum check as cobre: levado à revisão
- dependency failure: C75 para o web sem API; banco fora numa rota `/api` cai no `500 internal_error` do `ProblemFilter` (`fundacao` C12) e no `503` de `/health` (`fundacao` C3)
- state transitions: C28, C36, C39, C57, C61
- observability: C99, C100

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado; o que já existe foi medido com `wc -c`. Código novo: S0 = 7k, S1 = 16k, S2 = 6k, S3 = 7k, S4 = 5k, S5 = 5k, S6 = 12k, S8 = 7k, tudo em `apps/api`, `packages/contracts` e `packages/database`: 65k. S7 entra em `apps/web` e `packages/ui` com 30k: 95k. Arquivos existentes que a feature edita (27 arquivos, 41 KB): 10k. `plan.md` (38 KB) e este arquivo (50 KB): 22k. Total 95k + 10k + 22k = 127k, abaixo do orçamento de 150k - one builder
- Ordem: S0 primeiro e sozinho (C1); depois S1 a S6 e S8; S7 por último, onde a superfície muda de API para web. Se a medição real passar do orçamento durante o Build, o corte já escrito é esse, antes de S7, com 65k + 10k + 22k = 97k até ali
- **Boundary:** C1 fechada no commit `feat(api): prove better auth two factor through auth.api` - a door 2 fica como aprovada
- **Boundary:** C2 a C68 e C94 a C102 fechados nos commits `feat(api): add session auth, access guard, origin check and validation`, `test(api): prove the two-factor flow and the login throttle`, `test(api): prove user management, the admin command and the identity schema`, `feat(web): forward /api requests to the api`, `build(stack): give the api its auth secret and web origin` e `test(api): prove openapi, the coverage gate, auth logging and contracts`; C69 a C93 no commit `feat(web): add login, two-factor, account and user management screens`. Um builder só, sem corte: a ordem foi S0, S1 a S6, S8 e S7
- **Settled mid-build:** nada - o usuário não foi consultado durante o Build. Escolhas reversíveis feitas no caminho, para a revisão do diff: `login_throttles` guarda os instantes das falhas num array e entrou já na migração `0001`; a sessão é gravada com 1 ms a menos para valer só enquanto o último uso tem menos de 30 minutos (o Better Auth ainda a aceita no instante exato de `expiresAt`); `PUT /api/auth/password` grava a senha por código próprio, porque `auth.api.changePassword` troca a sessão de quem chamou; `two-factor/enable` com o 2FA já ativo responde `400 bad_request`; a cobertura é ligada pelo script `test` (`--coverage`) e não pela configuração, senão toda prova isolada tropeçaria no limiar; a tela `/users` também ordena a lista por nome; a C73 foi seguida ao pé da letra, então com `Retry-After` de 60 a tela diz "em 1 minutos"
- **Abandoned:** redirecionamento com `Location` relativo no web - o Next recusa (`Invalid URL`), então o destino é montado sobre o `Host` da requisição; a prova da C59 com as duas requisições soltas - a segunda encontrava a sessão do próprio autor já encerrada pela primeira e respondia `401`, então o teste segura as linhas dos administradores até as duas estarem dentro da alteração
