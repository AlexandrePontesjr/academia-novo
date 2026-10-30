# Portal do aluno - checks

Profile: standard
Plan: `.specs/features/portal-aluno/plan.md`

## Intent

92 checks in 10 slices (S0, as 8 do plano e S9 de montagem, regressão e stack) · 7 one-way doors · 1 open, of which 0 block the Build

O plano foi aprovado como escrito em 2026-10-28, com as Assumptions marcadas `n` valendo no padrão escrito
(primeiro acesso 24 h e redefinição 1 h; 2FA do aluno opcional; foto pendente com 30 dias; aluno sem e-mail
na ficha sem primeiro acesso). As doors 1 a 7 são AD-119 a AD-125 em `STATE.md`. A pergunta aberta
(credenciais de SMTP, as mesmas da `pre-cadastro`) só trava o go-live e não muda check nenhum.

Uma leitura da derivação, sem contradizer o plano: hoje `PATCH /api/students/:id` com `status: 'inactive'`
responde `422` em `status` (`patch_inactive_422_and_nothing_applied` de `students-update.test.ts`), e a AD
da `alunos` não muda aqui; a ficha só fica `inactive` pelo `DELETE`. A AC 53 ("by `DELETE` or `PATCH`")
dispara então só pelo `DELETE`, e a C71 prova que o `PATCH` recusado não mexe no usuário.

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`,
`playwright test <arquivo> -g`). São criados no Build: em `packages/database/test`, `portal.test.ts`; em
`packages/contracts/test`, `portal.test.ts`; em `apps/api/test`, `portal-roles.test.ts`,
`portal-first-access.test.ts`, `portal-password.test.ts`, `portal-reset.test.ts`, `portal-throttle.test.ts`,
`portal-me.test.ts`, `portal-photo.test.ts`, `portal-cutoff.test.ts`, `portal-audit.test.ts` e o apoio
`support/portal.ts`; em `apps/web/e2e`, `portal.spec.ts` (`/minha-conta`), `portal-public.spec.ts`
(`/primeiro-acesso`, `/definir-senha`, `/esqueci-senha`) e `support/portal.ts`. Ganham casos:
`contracts.test.ts`, `audit-auth.test.ts`, `users.test.ts`, `students-read.test.ts`, `students-update.test.ts`,
`privacy-anonymize.test.ts`, `photos-purge.test.ts`, `access.test.ts`, `enrollment.test.ts`, `openapi.test.ts`,
`csrf.test.ts`, `hostile-input.test.ts`, `migrate.test.ts` (banco), `proxy.spec.ts`, `login.spec.ts`,
`students.spec.ts`, `users.spec.ts`, `audit.spec.ts`, `motion.spec.ts`, `fake-api.ts`,
`tests/repo/motion.test.ts` e `tests/stack/compose.test.ts`. As regras de leitura de
`features/pre-cadastro/checks.md` seguem valendo sem mudança: Postgres real por `testcontainers` (AD-012),
sessão real de cada perfil, `Origin` igual a `WEB_ORIGIN` nas escritas, "exatamente uma linha" como diferença
de contagem de `audit_logs`, `withAuditInsertFailing`, `releasedTogether` para pedidos simultâneos, saída
capturada em stdout, stderr e `console`, `captureMail()` para o e-mail enviado, `X-Forwarded-For` escolhido
pelo teste para o IP, e o relógio do banco para "24 horas", "1 hora", "30 dias" e "na última hora" (as provas
movem `created_at`, `expires_at` e os instantes de `hits` por SQL). Nas telas, a `FakeApi` que registra
método, caminho e corpo. Regras próprias:

- "Sessão de aluno" é a de um usuário `student` vinculado a uma ficha adulta, criado pelo apoio
  `support/portal.ts` pelo caminho real (primeiro acesso e consumo do token lido de `captureMail()`), salvo
  nas provas de S0 e S1 que inserem o usuário por SQL para não depender de S2.
- "Nada gravado" num pedido público é: as linhas de `users`, `accounts`, `password_tokens` e a contagem de
  `audit_logs` iguais às de antes, e `captureMail()` sem e-mail novo. A contagem de `lead_throttles` só é
  conferida onde o check diz.
- "Corpo do `202`" é o corpo vazio: a `Surface` declara `Out` igual a `-` nas três rotas públicas.
- "A senha mudou" é lido por login: `POST /api/auth/login` com a senha nova responde `200` e com a antiga
  `401`; "nenhuma senha mudou" é o `password` de `accounts` do usuário byte a byte igual ao de antes.
- A idade é a do dia de São Paulo por `isMinor`; as provas fixam `birth_date` por SQL relativo ao
  `current_date` do banco em `America/Sao_Paulo`.

### S0 - Tabelas, vocabulário e contrato, antes de qualquer rota · ~9 files · ~30 KB · ~8k

**C1** - Depois de `pnpm db:migrate` num banco vazio, `users` aceita uma linha `role = 'student'` com `student_id` de uma ficha; recusa por `CHECK users_student_link` um `student` sem `student_id` e um `admin`, um `reception`, um `hr_finance` e um `instructor` com `student_id`; recusa por `UNIQUE` um segundo usuário com o mesmo `student_id`; recusa por chave estrangeira um `student_id` de ficha nenhuma; e `DELETE` da ficha que tem usuário falha por chave estrangeira (`NO ACTION`) com as duas linhas como estavam (door 1, AC 1, AD-119)
Proof: `pnpm --filter "./packages/database" exec vitest run test/portal.test.ts -t "student_link_check_unique_and_fk_without_cascade"`

**C2** - `USER_ROLES` é exatamente `['admin','reception','hr_finance','instructor','student']`, nessa ordem; `STAFF_ROLES`, exportado de `packages/contracts/src/auth.ts`, é exatamente os quatro primeiros; `users_role_valid` aceita `student` e continua recusando `Student` e a cadeia vazia (door 1, Impact "contrato")
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/portal.test.ts -t "user_roles_five_and_staff_roles_four_in_order"`
Proof: `pnpm --filter "./packages/database" exec vitest run test/portal.test.ts -t "role_check_accepts_student"`

**C3** - `password_tokens` aceita `purpose` `first_access` e `reset` e recusa `Reset`, `invite` e a cadeia vazia por `CHECK`; o segundo insert com o mesmo `token_hash` falha por `UNIQUE`; `user_id` de usuário nenhum falha por chave estrangeira; apagar o usuário (por SQL, só no teste) apaga os seus dois tokens e não toca o token de outro usuário (door 2, AD-120)
Proof: `pnpm --filter "./packages/database" exec vitest run test/portal.test.ts -t "password_tokens_purpose_unique_hash_and_user_cascade"`

**C4** - Em `photos`, `pending` nasce `false` quando omitido; `pending = true` com `is_current = true` é recusado por `photos_pending_not_current`; `pending = true` numa foto de funcionário (`student_id` nulo) é recusado por `photos_pending_student`; uma segunda pendente do mesmo aluno é recusada por `photos_one_pending_idx`, e a pendente de outro aluno é aceita; uma pendente com `expires_at` preenchido e `is_current = false` passa por `photos_expiry_matches_current` (door 3, AD-121)
Proof: `pnpm --filter "./packages/database" exec vitest run test/portal.test.ts -t "pending_photo_checks_and_one_per_student"`

**C5** - Aplicadas as migrações até a `0012`, inseridos um usuário de cada um dos quatro perfis, um aluno com foto corrente e uma versão guardada, e só então aplicada a `0013`, a migração termina sem erro; `users.student_id` é nulo nas quatro linhas, `photos.pending` é `false` nas duas, `password_tokens` existe vazia, e as demais colunas de `users`, `photos` e `students` são idênticas às de antes (Impact "stored data")
Proof: `pnpm --filter "./packages/database" exec vitest run test/portal.test.ts -t "migration_0013_keeps_existing_rows_and_adds_empty_tokens"`

**C6** - `AUDIT_ACTIONS` tem 52 valores: os 47 de antes, na ordem de antes, seguidos de `student.portal_access_requested`, `student.portal_password_set`, `student.portal_reset_requested`, `student.photo_approved` e `student.photo_rejected`, nessa ordem; e depois de percorrer primeiro acesso, consumo, redefinição, envio, aprovação e recusa de foto, o conjunto de ações gravadas em `audit_logs` é igual ao vocabulário, com `entity` igual a `student` nas cinco novas (door 7, AD-125)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_five_portal_actions_in_order"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "actions_written_equal_contract_vocabulary"`

**C7** - Em `packages/contracts`, o schema do primeiro acesso aceita `cpf` válido com e sem máscara e `email`, devolvendo o e-mail aparado e em minúsculas (`  Ana@Example.COM ` vira `ana@example.com`), e recusa `cpf` com dígito errado, de 10 dígitos e ausente, e `email` `ana@` e ausente; o do consumo aceita `token` e `password` de 12 e de `PASSWORD_MAX_LENGTH` caracteres e recusa 11 e `PASSWORD_MAX_LENGTH + 1`; o da redefinição aceita `email` e recusa `ana@`; o do `PATCH /api/me/profile` aceita `{}` e cada uma das quatro chaves sozinha e recusa cada uma de `email`, `cpf`, `name`, `birthDate`, `sex`, `healthNotes`, `status` e `guardian`; o da resposta do perfil aceita o objeto de onze chaves da `Surface` e recusa o mesmo objeto com `healthNotes` (AC 13, AC 20, AC 29, AC 31, AC 39)
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/portal.test.ts -t "portal_schemas_accept_and_reject"`

**C8** - O schema da ficha (`GET /api/students/:id`) aceita `portal` igual a `none`, `pending`, `active` e `disabled` e `pendingPhoto` nulo ou com `id`, `version` e `createdAt`, e recusa `portal` igual a `invited` e ausente (Impact "contrato", AC 15)
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/portal.test.ts -t "student_schema_gains_portal_and_pending_photo"`

### S1 - O perfil `student` não alcança nada da equipe · ~8 files · ~40 KB · ~10k

**C9** - Uma sessão de aluno (usuário inserido por SQL) recebe `403` com `forbidden` em cada rota de `listRoutes` que existia antes desta feature, exceto `GET /api/auth/session`, `POST /api/auth/logout`, `PUT /api/auth/password` e as rotas `two-factor`; a tabela de rotas é a de `listRoutes` menos as dez novas, e o teste falha se uma rota nova da equipe entrar sem `403` para o aluno (AC 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-roles.test.ts -t "student_403_on_every_pre_existing_route_but_four_groups"`

**C10** - A mesma sessão de aluno recebe `200` em `GET /api/auth/session` com `role` igual a `student` e `twoFactorEnrollmentRequired` igual a `false`, `204` em `PUT /api/auth/password` com a senha atual e uma nova de 12 caracteres, `200` na rota de início de cadastro do 2FA, e `204` em `POST /api/auth/logout` (AC 2, AC 23, Assumption "2FA do aluno")
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-roles.test.ts -t "student_reaches_session_password_two_factor_and_logout"`

**C11** - Com dois usuários `student` e os quatro da equipe no banco, `GET /api/users` de `admin` responde `200` com exatamente os quatro da equipe, na ordem de `list_users_200_sorted_with_six_keys`, e nenhum item tem `role` igual a `student` (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "list_users_omits_students"`

**C12** - `POST /api/users` com `role: 'student'` e `PATCH /api/users/:id` de um usuário `reception` com `role: 'student'` respondem `422` com um item de `path` igual a `role`; a contagem de `users` e a linha do `reception` ficam como estavam; e `PATCH /api/users/:id` de um usuário `student` com qualquer corpo responde `404` (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/users.test.ts -t "role_student_422_on_create_and_patch"`

**C13** - Com sessão de aluno, `/dashboard`, `/students`, `/students/<id>`, `/users`, `/audit`, `/check-in`, `/payments`, `/plans`, `/leads`, `/staff`, `/privacy` e `/account` redirecionam para `/minha-conta`; `/minha-conta`, `/two-factor/setup`, `/`, `/matricula`, `/primeiro-acesso`, `/definir-senha?token=x` e `/esqueci-senha` respondem `200` sem redirecionar (AC 5, door 6)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/proxy.spec.ts -g "student_session_reaches_only_portal_two_factor_and_public_pages"`

**C14** - Com sessão de cada um dos quatro perfis da equipe, `/minha-conta` e `/minha-conta/qualquer` redirecionam para `/dashboard` (AC 6, door 6)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/proxy.spec.ts -g "staff_session_on_minha_conta_redirects_to_dashboard"`

**C15** - Com sessão de aluno, `/login` redireciona para `/minha-conta`; com sessão de `reception`, continua redirecionando para `/dashboard`; sem sessão, `/minha-conta` redireciona para `/login` (AC 7, Observable "unauthorised")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/proxy.spec.ts -g "login_with_student_session_goes_to_minha_conta"`

### S2 - Primeiro acesso pelo próprio aluno · ~6 files · ~44 KB · ~11k

**C16** - Com um aluno `active`, adulto, sem responsável, com `email` `ana@example.com` e sem usuário, `POST /api/portal/first-access` sem sessão com `cpf` mascarado e `email` `  Ana@Example.COM ` responde `202` com corpo vazio; `users` ganha uma linha com `role` `student`, `student_id` do aluno, `email` `ana@example.com`, `name` igual ao do aluno e `active` `false`, sem linha em `accounts`; `password_tokens` ganha uma linha `first_access` desse usuário com `expires_at - created_at` igual a `24:00:00` e `used_at` nulo; `audit_logs` ganha exatamente uma linha `student.portal_access_requested` com `user_id` nulo, `entity_id` do aluno e o IP da requisição; com o aluno `suspended` o resultado é o mesmo (AC 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-first-access.test.ts -t "first_access_202_creates_inactive_student_user_token_and_audit"`

**C17** - Depois da C16, `captureMail()` tem exatamente um e-mail, para `ana@example.com` (o da ficha), cujos `text` e `html` contêm `<WEB_ORIGIN>/definir-senha?token=<t>` com `t` de 43 caracteres base64url e SHA-256 em hex de `t` igual ao `token_hash` gravado, e cujo `text` contém "24 horas"; com `withAuditInsertFailing` a resposta é `500`, nenhuma linha fica em `users` nem em `password_tokens`, e `captureMail()` fica vazio (AC 9, door 2, Observable "e-mail")
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-first-access.test.ts -t "first_access_mails_link_to_file_email_only_after_commit"`

**C18** - Com o transporte de captura configurado para falhar, e depois para demorar 15 s, `POST /api/portal/first-access` responde `202` em menos de 2 s nos dois casos, o usuário e o token ficam gravados, e a saída capturada tem uma linha com `portal_mail_failed` e o id do usuário, sem `ana@example.com` em nenhuma linha (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-first-access.test.ts -t "mail_failure_or_timeout_keeps_202_and_logs_without_recipient"`

**C19** - Um segundo pedido do mesmo aluno responde `202`, mantém a contagem de `users` e o mesmo `id` de usuário, preenche `used_at` do primeiro token e grava um segundo `first_access` com `used_at` nulo; `POST /api/password-tokens/consume` com o primeiro token responde `422` em `token`, e com o segundo responde `204` (AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-first-access.test.ts -t "second_request_reuses_user_and_only_newest_link_works"`

**C20** - `POST /api/portal/first-access` responde `202` com corpo vazio e não grava nada em cada um dos nove casos: CPF de aluno nenhum, e-mail diferente do da ficha, aluno com 18 anos completos amanhã, aluno com responsável, aluno `inactive`, aluno anonimizado, e-mail da ficha igual ao de um usuário `reception`, aluno cujo usuário está ativo com senha, e aluno sem e-mail na ficha (AC 12, Assumption "aluno sem e-mail")
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-first-access.test.ts -t "nine_ineligible_cases_202_and_nothing_recorded"`

**C21** - Status, corpo e cabeçalhos da resposta são iguais, além de `X-Request-Id` e `Date`, entre o caso aceito da C16 e os nove da C20 (AC 12, Observable "enumeration")
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-first-access.test.ts -t "same_202_status_body_and_headers_for_ten_cases"`

**C22** - `POST /api/portal/first-access` responde `422` com um item de `path` igual ao campo, sem gravar nada e sem contar em `lead_throttles`, em cada caso: `cpf` ausente, com dígito verificador errado e com 10 dígitos; `email` ausente, `ana` e `ana@` (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-first-access.test.ts -t "six_invalid_bodies_422_with_field_path"`

**C23** - Três pedidos com o mesmo CPF de três IPs respondem `202`; o quarto, de um quarto IP, responde `429` com `too_many_attempts` e `Retry-After` entre `55` e `60` com o primeiro movido para 59 minutos atrás, sem token novo; dez pedidos do mesmo IP com dez CPFs respondem `202` e o 11º responde `429`; com o primeiro movido para 61 minutos atrás, o pedido seguinte responde `202` (AC 14, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-throttle.test.ts -t "first_access_fourth_cpf_and_eleventh_ip_429_and_window_edge"`

**C24** - Os pedidos de primeiro acesso e de redefinição contam em `lead_throttles` sob `access-ip:<ip>`, `access-cpf:<cpf>`, `reset-ip:<ip>` e `reset-email:<e-mail>`, e deixam `login_throttles` sem linha; o login do aluno logo depois de três redefinições do próprio e-mail responde `200`; as chaves `ip:` e `email:` da `pre-cadastro` ficam como estavam (door 4, AD-122)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-throttle.test.ts -t "portal_keys_in_lead_throttles_never_login_throttles"`

**C25** - Dois `POST /api/portal/first-access` simultâneos do mesmo aluno respondem `202` os dois, e o aluno termina com exatamente um usuário e exatamente um token `first_access` com `used_at` nulo (AC 8, AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-first-access.test.ts -t "two_concurrent_requests_one_user_one_open_token"`

**C26** - `GET /api/students/:id`, de `reception`, devolve `portal` `none` para aluno sem usuário, `pending` para usuário sem linha em `accounts`, `active` para usuário ativo com senha e `disabled` para usuário inativo com senha, e `pendingPhoto` nulo sem pendente; os testes de `students-read.test.ts` de antes passam com só as duas chaves novas acrescentadas às listas de chaves, para os quatro perfis (AC 15)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-read.test.ts -t "ficha_portal_four_states_and_pending_photo_null"`

**C27** - A ficha `/students/<id>` mostra "Sem acesso ao portal", "Primeiro acesso pedido", "Acesso ativo" e "Acesso desligado" para `portal` `none`, `pending`, `active` e `disabled` devolvidos pela `FakeApi`, e não tem botão nem link cujo clique chame rota de portal ou de senha (AC 16)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "ficha_shows_four_portal_states_without_mail_button"`

**C28** - `/primeiro-acesso` mostra os campos "CPF" e "E-mail" e o botão "Pedir acesso"; o envio manda `POST /api/portal/first-access` com `cpf` e `email`; com `202` mostra exatamente "Se o CPF e o e-mail forem de um aluno com cadastro, enviamos um link para o e-mail da ficha. Ele vale por 24 horas. Se você já tem senha, use Esqueci minha senha."; com `422` em `cpf` mostra a mensagem junto de "CPF"; com `429` e `Retry-After: 120` mostra "Muitas tentativas. Tente novamente em 2 minutos." (AC 17, Observable "`/primeiro-acesso`")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/portal-public.spec.ts -g "first_access_page_states"`

### S3 - Definir a senha pelo link · ~4 files · ~30 KB · ~8k

**C29** - Com um usuário de primeiro acesso, uma sessão dele inserida por SQL e o token da C17, `POST /api/password-tokens/consume` sem sessão com o token e uma senha de 12 caracteres responde `204`; `accounts` ganha uma linha `provider_id = 'credential'` do usuário; `users.active` vira `true`; `used_at` do token fica entre T0 e T1 lidos de `now()` do banco; `sessions` do usuário fica vazia; `audit_logs` ganha exatamente uma linha `student.portal_password_set` com `user_id` nulo, `entity_id` do aluno e o IP (AC 18, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-password.test.ts -t "consume_204_sets_credential_activates_marks_used_and_drops_sessions"`

**C30** - `POST /api/password-tokens/consume` responde `422` com um item de `path` igual a `token`, sem mudar `accounts`, `users` nem `password_tokens`, em cada caso: `token` ausente, vazio, `abc`, 43 caracteres de token nenhum, token usado e token com `expires_at` um segundo no passado; o token com `expires_at` um minuto no futuro responde `204` (AC 19)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-password.test.ts -t "six_invalid_tokens_422_and_token_before_expiry_204"`

**C31** - Com um token válido, `password` de 11 caracteres e de `PASSWORD_MAX_LENGTH + 1` responde `422` com `path` igual a `password` e o token continua com `used_at` nulo; de 12 e de `PASSWORD_MAX_LENGTH` responde `204` (AC 20)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-password.test.ts -t "password_bounds_11_and_max_plus_one_422_token_unused"`

**C32** - Dois consumos simultâneos do mesmo token com senhas diferentes: exatamente um `204` e um `422` em `token`; a senha que entra no login é a do `204`, e `audit_logs` ganha exatamente uma linha `student.portal_password_set` (AC 21)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-password.test.ts -t "two_concurrent_consumes_one_204_one_422"`

**C33** - Com o token emitido e a ficha depois inativada por `DELETE /api/students/:id`, o consumo responde `422` em `token` e nenhuma senha muda; com a ficha depois anonimizada, o consumo responde `422` em `token` (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-password.test.ts -t "token_of_inactivated_or_anonymized_student_422"`

**C34** - Depois da C29, `POST /api/auth/login` com `ana@example.com` e a senha definida responde `200`, e `GET /api/auth/session` com o cookie devolvido responde `role` `student` e `twoFactorEnrollmentRequired` `false` (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-password.test.ts -t "login_after_set_password_role_student_no_enrollment"`

**C35** - Com um usuário de aluno com senha e duas sessões, o consumo de um token `reset` com uma senha nova responde `204`; o login com a senha antiga responde `401` e com a nova `200`; as duas sessões antigas deixam de existir (AC 18 pela redefinição)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-password.test.ts -t "reset_token_replaces_password_and_drops_sessions"`

**C36** - `/definir-senha?token=t1` mostra os campos "Nova senha" e "Confirmar senha" e o botão "Definir senha", e a `FakeApi` registra zero chamadas a `POST /api/password-tokens/consume` depois de 1 s; senha de 11 caracteres ou confirmação diferente mostra a mensagem junto do campo sem chamada; um envio válido manda `{"token":"t1","password":"<senha>"}` (AC 24)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/portal-public.spec.ts -g "set_password_page_posts_only_on_submit"`

**C37** - Com `204`, a página navega para `/login`, que mostra "Senha definida. Entre com seu e-mail e a nova senha."; com `422` em `token`, mostra "Este link não vale mais. Peça outro em Primeiro acesso ou em Esqueci minha senha." com links para `/primeiro-acesso` e `/esqueci-senha`; com `422` em `password`, mostra a mensagem junto de "Nova senha" (AC 25)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/portal-public.spec.ts -g "set_password_success_and_invalid_link_messages"`

### S4 - Esqueci minha senha · ~4 files · ~22 KB · ~6k

**C38** - Com um usuário de aluno ativo com senha e um token `reset` aberto anterior, `POST /api/password-reset` sem sessão com o e-mail em maiúsculas responde `202` com corpo vazio; `password_tokens` ganha um `reset` com `expires_at - created_at` igual a `01:00:00`; o `reset` anterior ganha `used_at`; um `first_access` usado do mesmo usuário fica como estava; `audit_logs` ganha exatamente uma linha `student.portal_reset_requested` com `user_id` nulo e o IP; `captureMail()` tem um e-mail para o e-mail do usuário com o link `/definir-senha?token=<t>` do token novo e "1 hora" no `text`; com `withAuditInsertFailing`, `500` e nenhum e-mail (AC 26)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-reset.test.ts -t "reset_202_stores_one_hour_token_invalidates_previous_and_mails_after_commit"`

**C39** - `POST /api/password-reset` responde `202` com corpo vazio e não grava nada nos quatro casos: e-mail de usuário nenhum, de um usuário `reception` ativo, de um usuário de aluno inativo com senha e de um usuário de aluno sem senha; status, corpo e cabeçalhos iguais aos da C38, além de `X-Request-Id` e `Date` (AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-reset.test.ts -t "four_ineligible_emails_202_same_response_nothing_recorded"`

**C40** - Três redefinições do mesmo e-mail de três IPs respondem `202`; a quarta responde `429` com `too_many_attempts` e `Retry-After`, sem token novo; dez do mesmo IP com dez e-mails respondem `202` e a 11ª `429`; com a primeira movida para 61 minutos atrás, a seguinte responde `202` (AC 28, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-throttle.test.ts -t "reset_fourth_email_and_eleventh_ip_429_and_window_edge"`

**C41** - `POST /api/password-reset` com `email` ausente, `ana` e `ana@` responde `422` com `path` igual a `email`, sem gravar nada (AC 29)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-reset.test.ts -t "invalid_email_422"`

**C42** - `/login` mostra os links "Primeiro acesso" com `href` `/primeiro-acesso` e "Esqueci minha senha" com `href` `/esqueci-senha`; `/esqueci-senha` mostra o campo "E-mail" e, com `202`, exatamente "Se o e-mail for de um aluno com acesso, enviamos um link. Ele vale por 1 hora."; com `429` e `Retry-After: 120` mostra "Muitas tentativas. Tente novamente em 2 minutos." (AC 30)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/login.spec.ts -g "login_links_first_access_and_forgot_password"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/portal-public.spec.ts -g "forgot_password_page_states"`

### S5 - Perfil e pagamentos do aluno · ~6 files · ~40 KB · ~10k

**C43** - `GET /api/me/profile` com sessão de aluno responde `200` com exatamente as chaves `name`, `cpf`, `birthDate`, `email`, `phone`, `address`, `emergencyContactName`, `emergencyContactPhone`, `status`, `photoUrl` e `pendingPhoto`, com os valores da ficha vinculada (a ficha tem `healthNotes` preenchido e a chave não aparece); `photoUrl` é a URL assinada da variante `medium` da foto corrente e `null` sem foto; `pendingPhoto` é `null` sem pendente (AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-me.test.ts -t "profile_200_eleven_keys_without_health_notes"`

**C44** - Com os alunos A e B, cada um com sessão: `GET /api/me/profile?studentId=<B>` com a sessão de A devolve a ficha de A; `GET /api/me/payments?studentId=<B>` devolve os períodos de A; `PATCH /api/me/profile` de A com `phone` muda só a ficha de A; a ficha e os períodos de B ficam idênticos; e `GET /api/me/profile/<B>` responde `404` (AC 32)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-me.test.ts -t "me_routes_resolve_only_by_session_student_id"`

**C45** - Com um aluno com três períodos `paid`, `pending` e `overdue` em duas matrículas, `GET /api/me/payments` responde `200` com corpo igual ao de `GET /api/students/:id/payments` lido por `hr_finance` para o mesmo aluno, e com exatamente os três status; sem matrícula, responde `200` com lista vazia (AC 33)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-me.test.ts -t "me_payments_equal_staff_payments_for_the_student"`

**C46** - Sessões de `admin`, `reception`, `hr_finance` e `instructor` recebem `403` com `forbidden` em `GET` e `PATCH /api/me/profile`, `GET /api/me/payments` e `GET` e `POST /api/me/photo`, sem chave da ficha no corpo; sem sessão, as cinco respondem `401` com `unauthorized` (AC 34)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-me.test.ts -t "staff_403_and_anonymous_401_on_five_me_routes"`

**C47** - `/minha-conta` mostra o nome, a foto (`img` com o `photoUrl` da `FakeApi`), telefone, endereço, contato de emergência, e a lista de períodos com plano, período, vencimento e situação ("Pago", "Pendente", "Atrasado"), na ordem do vencimento mais novo primeiro, com três períodos devolvidos fora de ordem; sem foto, mostra o espaço vazio do componente de foto (AC 35, Observable "empty state")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/portal.spec.ts -g "minha_conta_profile_photo_and_periods_newest_first"`

**C48** - Com `GET /api/me/payments` devolvendo lista vazia, a seção de pagamentos mostra "Você ainda não tem matrícula registrada." e nenhuma tabela (AC 36)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/portal.spec.ts -g "minha_conta_without_enrollment_message"`

**C49** - Com `GET /api/me/profile` respondendo `500`, e depois com `GET /api/me/payments` respondendo `503`, `/minha-conta` mostra "Não foi possível carregar seus dados agora. Tente de novo em instantes." e o botão "Tentar novamente"; com a `FakeApi` voltando a `200`, o clique mostra o perfil (AC 37)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/portal.spec.ts -g "minha_conta_load_error_and_retry"`

**C50** - Com a largura de 390 px, `/minha-conta` não tem rolagem horizontal (`scrollWidth` igual a `clientWidth`) e as seções ficam em uma coluna (o topo de cada seção abaixo do fim da anterior) (Observable "density")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/portal.spec.ts -g "minha_conta_one_column_at_390"`

### S6 - O aluno altera os dados de contato · ~5 files · ~30 KB · ~8k

**C51** - `PATCH /api/me/profile` com `phone`, `address`, `emergencyContactName` e `emergencyContactPhone` válidos responde `200` com o perfil de onze chaves já com os valores novos; a linha de `students` muda só nessas quatro colunas e em `updated_at`; `audit_logs` ganha exatamente uma linha `student.updated` com `user_id` igual ao usuário do aluno e `diff` com exatamente as chaves mudadas; enviar só `phone` gera `diff` só com `phone`; enviar o mesmo valor guardado não grava linha (AC 38)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-me.test.ts -t "patch_four_contact_fields_200_with_student_as_author"`

**C52** - `PATCH /api/me/profile` com `phone` `123` e com `emergencyContactName` sem `emergencyContactPhone` (regra do par que `emergency_pair_rule_counts_stored_value` prova para a equipe) responde `422` com o `path` do campo, e a linha fica idêntica (AC 38, mesmos schemas)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-me.test.ts -t "patch_contact_fields_use_student_schemas_422"`

**C53** - `PATCH /api/me/profile` com cada uma das chaves `email`, `cpf`, `name`, `birthDate`, `sex`, `healthNotes`, `status` e `guardian`, sozinha e junto de um `phone` válido, responde `422` com um item cujo `path` é a chave, e a linha de `students`, a de `users` e a contagem de `audit_logs` ficam como estavam (AC 39)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-me.test.ts -t "eight_forbidden_keys_422_and_nothing_changes"`

**C54** - Depois de percorrer com a sessão do aluno todas as chamadas de `/api/me/*` das C43 a C53, C57, C58 e C65 (inclusive as recusadas), `students.email`, `students.cpf` e `users.email` são os de antes (AC 40)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-me.test.ts -t "me_routes_never_change_email_or_cpf"`

**C55** - `PATCH /api/students/:id` de `reception` com `email` `Novo@Example.com` num aluno com usuário responde `200` e, na mesma leitura, `students.email` e `users.email` são `novo@example.com`; com o e-mail de um usuário `instructor`, responde `409` com `email_in_use` e as duas linhas ficam idênticas; num aluno sem usuário, o `PATCH` de e-mail responde como antes e `users` não muda (AC 41)
Proof: `pnpm --filter "./apps/api" exec vitest run test/students-update.test.ts -t "email_change_follows_to_linked_user_or_409_email_in_use"`

**C56** - O formulário de `/minha-conta` tem campos editáveis só para telefone, endereço e os dois do contato de emergência; e-mail e CPF aparecem como texto sem `input`; salvar envia `PATCH /api/me/profile` só com as chaves mudadas e, com `200`, mostra "Dados atualizados." e os valores novos; com `422` e `errors[]` em `phone` e `address`, mostra cada mensagem junto do seu campo (AC 42)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/portal.spec.ts -g "contact_form_saves_and_shows_field_errors"`

### S7 - Foto enviada pelo aluno e aprovada pela recepção · ~7 files · ~56 KB · ~14k

**C57** - Com um aluno com foto corrente versão 1, `POST /api/me/photo` com um JPEG aceito responde `201` com `pendingPhoto` (`id`, `version` 2, `createdAt`); a linha nova tem `pending` `true`, `is_current` `false`, `version` 2 e `expires_at - created_at` igual a `30 days`; o bucket ganha as três variantes; a versão 1 continua `is_current`; `audit_logs` ganha exatamente uma linha `student.photo_uploaded` com `user_id` igual ao usuário do aluno (AC 43, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-photo.test.ts -t "me_photo_201_stores_pending_version_with_30_days_and_student_author"`

**C58** - Com uma pendente, um segundo `POST /api/me/photo` responde `409` com `pending_photo_exists`, sem linha nova e sem objeto novo no bucket; dois envios simultâneos sem pendente resultam em exatamente um `201` e um `409` (AC 44)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-photo.test.ts -t "second_or_concurrent_upload_409_pending_photo_exists"`

**C59** - Para cada um dos nove arquivos recusados de `nine_rejected_files_same_status_and_code_as_post_and_nothing_changes`, `POST /api/me/photo` responde o mesmo status (`413`, `415` ou `422`) e o mesmo `code` que `POST /api/students/:id/photo`, sem linha e sem objeto novos (AC 45)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-photo.test.ts -t "nine_rejected_files_same_status_and_code_as_staff_upload"`

**C60** - Com uma pendente, `GET /api/students` (item do aluno), `GET /api/students/:id` e a foto do check-in do aluno assinam a versão 1 (o `photoId` da URL é o da versão 1); `GET /api/students/:id` devolve `pendingPhoto` com o `id` da pendente; e `PUT /api/students/:id/photo` da recepção nesse estado responde `201` com versão 3, torna a 3 corrente e deixa a pendente idêntica (AC 46, Impact "comportamento existente")
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-photo.test.ts -t "pending_never_served_and_staff_replace_leaves_it_alone"`

**C61** - `POST /api/students/:id/photo/pending/approve` de `admin` e de `reception` responde `200` com a foto corrente; a pendente fica `pending` `false`, `is_current` `true` e `expires_at` nulo; a corrente anterior fica `is_current` `false` com `expires_at` igual a `now()` mais os dias de retenção configurados (AD-047), também com a retenção mudada para 7 dias; o check-in passa a assinar a nova; `audit_logs` ganha exatamente uma linha `student.photo_approved` com o autor da equipe (AC 47)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-photo.test.ts -t "approve_200_makes_pending_current_and_gives_previous_the_retention"`

**C62** - `POST /api/students/:id/photo/pending/reject` de `admin` e de `reception` responde `204`; a pendente fica `pending` `false`, `is_current` `false` e `expires_at` entre T0 e T1 de `now()` do banco; `audit_logs` ganha exatamente uma linha `student.photo_rejected`; o ciclo seguinte de `PhotoPurge` remove a linha e os três objetos, e a corrente fica idêntica (AC 48)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-photo.test.ts -t "reject_204_expires_pending_and_next_purge_removes_it"`

**C63** - Sem pendente, `approve` e `reject` de `reception` respondem `404` com `no_pending_photo`; com pendente, `hr_finance`, `instructor` e o próprio aluno recebem `403` nas duas, sem mudar a linha; sem sessão, `401`; com `:id` `abc` e com `uuid` de ninguém, `404` com `not_found` (AC 49)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-photo.test.ts -t "approve_reject_404_no_pending_403_three_roles_401_anonymous"`

**C64** - Uma pendente com `expires_at` movido por SQL para um segundo no passado é removida, com os três objetos, pelo ciclo seguinte de `PhotoPurge`, como as versões vencidas de `purge_removes_expired_rows_and_their_objects`; a corrente fica idêntica (AC 50)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "purge_removes_expired_pending_photo"`

**C65** - `GET /api/me/photo` com sessão de aluno responde `200` com a URL assinada da corrente e da pendente na variante `medium` por omissão e na `thumb` com `variant=thumb`; com só a corrente, a da pendente é `null`; sem foto nenhuma, responde `404`; com `variant` fora das três, `422` (Surface `GET /api/me/photo`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-photo.test.ts -t "me_photo_get_signs_current_and_pending_or_404"`

**C66** - `approve` e `reject` simultâneos da mesma pendente: exatamente um responde com sucesso (`200` ou `204`) e o outro `404` com `no_pending_photo`; `audit_logs` ganha exatamente uma linha entre `student.photo_approved` e `student.photo_rejected` (AC 47, AC 48)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-photo.test.ts -t "concurrent_approve_and_reject_one_wins"`

**C67** - A ficha `/students/<id>` aberta por `reception` com `pendingPhoto` mostra a pendente ao lado da corrente com os botões "Aprovar" e "Recusar"; "Aprovar" envia `POST /api/students/<id>/photo/pending/approve`; "Recusar" abre um diálogo, "Voltar" não envia nada e confirmar envia `.../reject`; depois de cada resposta a pendente some; para `hr_finance` e `instructor` os dois botões não aparecem (AC 51, Observable "destructive")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "pending_photo_approve_and_reject_with_confirmation"`

**C68** - Com `pendingPhoto` no perfil, `/minha-conta` mostra a pendente com "Aguardando aprovação da recepção." e não mostra o botão "Enviar foto"; sem pendente, mostra "Enviar foto", que abre o recorte 3:4 e envia `POST /api/me/photo`; com `409` mostra a mensagem de `pending_photo_exists` (AC 52)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/portal.spec.ts -g "pending_photo_message_hides_upload"`

### S8 - Corte de acesso · ~5 files · ~34 KB · ~9k

**C69** - Com um aluno com usuário ativo e duas sessões, `DELETE /api/students/:id` responde `204` e, na mesma leitura, a ficha é `inactive`, `users.active` é `false` e `sessions` do usuário está vazia; a chamada seguinte a `GET /api/me/profile` com o cookie antigo responde `401`; com `withAuditInsertFailing` a resposta é `500` e ficha, usuário e sessões ficam como estavam (AC 53)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-cutoff.test.ts -t "inactivation_disables_user_and_drops_sessions_in_one_transaction"`

**C70** - `PATCH /api/students/:id` com `status: 'suspended'` num aluno com usuário ativo e uma sessão responde `200`; o usuário e a sessão ficam idênticos, `GET /api/me/profile` com a sessão responde `200` com `status` `suspended`, e o login responde `200` (AC 54)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-cutoff.test.ts -t "suspension_keeps_user_and_sessions"`

**C71** - `PATCH /api/students/:id` com `status: 'inactive'` num aluno com usuário responde `422` em `status`, como `patch_inactive_422_and_nothing_applied`, e o usuário e as sessões ficam idênticos (AC 53, leitura do `## Intent`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-cutoff.test.ts -t "refused_patch_inactive_leaves_user_alone"`

**C72** - Com o usuário do aluno desligado pela C69, `POST /api/auth/login` com a senha certa responde `401` com corpo igual, além de `requestId`, ao do login de um funcionário inativo de `login_401_identical_for_three_causes`, sem `Set-Cookie` e sem linha nova em `sessions` (AC 55)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-cutoff.test.ts -t "disabled_student_login_401_like_inactive_staff"`

**C73** - Reativada a ficha por `PATCH` com `status: 'active'`, o usuário continua `active` `false` e `GET /api/students/:id` devolve `portal` `disabled`; um novo primeiro acesso responde `202` reusando o mesmo usuário e mandando um link; consumido o link, `portal` é `active` e o login responde `200` (AC 56)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-cutoff.test.ts -t "reactivation_keeps_user_disabled_until_new_first_access"`

**C74** - `anonymizeStudent` de um aluno inativo com usuário responde `204` e, na mesma leitura, o usuário tem `name` `Titular anonimizado`, `email` `anonimizado+<user_id>@invalid`, `active` `false` e o mesmo `student_id`; `accounts`, `sessions`, `two_factors` e `password_tokens` do usuário estão vazias; nenhuma linha de `users` tem o nome nem o e-mail antigos do aluno; as linhas de `audit_logs` com `user_id` do aluno continuam todas (AC 57, door 5, AD-123)
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "anonymize_clears_linked_student_user_and_its_credentials"`

**C75** - Com a falha de armazenamento de `storage_failure_is_503_rolls_back_rows_and_retry_succeeds`, a anonimização de um aluno com usuário responde `503` e o usuário, `accounts` e `password_tokens` ficam idênticos; a nova tentativa responde `204` com o resultado da C74 (AC 57, mesma transação)
Proof: `pnpm --filter "./apps/api" exec vitest run test/privacy-anonymize.test.ts -t "anonymize_failure_keeps_linked_user_identical"`

**C76** - A anonimização de funcionário com usuário vinculado continua respondendo `409` com `user_linked`: os testes de `staff-privacy.test.ts` passam sem edição de asserção (Impact "comportamento existente")
Proof: `pnpm --filter "./apps/api" exec vitest run test/staff-privacy.test.ts -t "user_linked"`

### S9 - Montagem, regressão e stack · ~14 files · ~60 KB · ~15k

**C77** - O documento OpenAPI tem as dez rotas novas da `Surface` com os métodos dela; os corpos de `POST /api/portal/first-access`, `POST /api/password-tokens/consume`, `POST /api/password-reset` e `PATCH /api/me/profile` vêm dos schemas de `packages/contracts`
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "portal_routes_listed_with_surface_methods"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "request_bodies_come_from_contract_schemas"`

**C78** - A guarda declara `@Public()` exatamente em `POST /api/portal/first-access`, `POST /api/password-tokens/consume` e `POST /api/password-reset`, `@Roles('student')` nas cinco de `/api/me/*` e `@Roles('admin','reception')` em `approve` e `reject`; a lista de rotas que respondem sem sessão passa a ter as de antes mais essas três e nenhuma outra; os `ALL` locais de `students.controller.ts` e `photos.controller.ts` são `STAFF_ROLES` (AD-022, door 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "only_listed_routes_answer_without_session"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "portal_routes_declare_public_student_or_photo_review_roles"`

**C79** - `admin` sem 2FA ativo recebe `403` com `two_factor_enrollment_required` em `approve` e `reject` e não nas três públicas; o aluno sem 2FA nunca recebe `two_factor_enrollment_required` em `/api/me/*`
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "student_never_required_to_enroll"`

**C80** - Sem `Origin` e sem `Sec-Fetch-Site`, e com `Origin` igual a `https://evil.example`, as sete escritas novas (`first-access`, `consume`, `password-reset`, `PATCH /api/me/profile`, `POST /api/me/photo`, `approve`, `reject`) respondem `403` com `csrf_rejected` sem gravar nada (AD-020)
Proof: `pnpm --filter "./apps/api" exec vitest run test/csrf.test.ts -t "portal_writes_under_origin_check"`

**C81** - Corpo que não é JSON em `first-access`, `consume`, `password-reset` e `PATCH /api/me/profile` responde `400` `bad_request`; corpo de 1 MB responde `413`; `address` e `password` com substituto UTF-16 solto respondem `422` sem `500` (hostile input)
Proof: `pnpm --filter "./apps/api" exec vitest run test/hostile-input.test.ts -t "portal_hostile_bodies"`

**C82** - Com `withAuditInsertFailing`, cada uma das sete escritas novas responde `500` e deixa `users`, `accounts`, `password_tokens`, `students` e `photos` como estavam, e o bucket sem objeto novo (failure modes)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-audit.test.ts -t "audit_failure_rolls_back_seven_writes"`

**C83** - Nenhuma linha de `audit_logs` gravada pelas rotas públicas tem o CPF, o e-mail nem o token em `values` ou `diff`; os desfechos que não gravam trilha (as nove recusas da C20, as quatro da C39, os `422` e os `429`) não mudam a contagem de `audit_logs` (observability)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-audit.test.ts -t "public_trail_has_no_cpf_email_or_token_and_refusals_write_none"`

**C84** - `contracts.test.ts` e `audit.spec.ts` contam 52 ações em todos os pontos que contavam 47; `ACTION_LABELS` tem um rótulo para cada uma; as 47 primeiras seguem na ordem e com o texto de antes (Impact "contrato")
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_action_count_is_fifty_two"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "portal_actions_labelled_and_filter_has_fifty_two"`

**C85** - `ROLE_LABELS` tem `student` igual a "Aluno"; o select de perfil de `/users` lista exatamente os quatro perfis da equipe, sem "Aluno" (Impact "domain")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/users.spec.ts -g "role_select_lists_only_staff_roles"`

**C86** - A guarda `tests/repo/motion.test.ts` conta os segmentos com `app-loading` com `minha-conta` entre eles; e a C39 da `motion` passa com os baselines `390.json` e `1440.json` mudados só no trecho de `/audit`, pelas cinco opções novas do filtro "Ação"; os baselines não têm `/login`, e os dois links novos dessa tela são os da C42 (Impact "web")
Proof: `pnpm --filter "./tests/repo" exec vitest run motion.test.ts -t "segments_have_app_loading"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/motion.spec.ts -g "copy_names_and_focus_order_match_the_baseline"`

**C87** - `/primeiro-acesso`, `/definir-senha?token=x` e `/esqueci-senha`, sem sessão, com sessão de `reception` e com sessão de 2FA pendente, respondem `200` sem redirecionar (nove casos), com `Content-Security-Policy` contendo `'nonce-` e `form-action 'self'`; `/primeiro-acessos` e `/esqueci-senha-x` sem sessão redirecionam para `/login` (door 6, AD-124)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/proxy.spec.ts -g "portal_public_pages_with_csp_and_no_prefix_leak"`

**C88** - A contagem generalizada é testada no próprio módulo sobre `lead_throttles` real, sem HTTP: para cada uma das quatro chaves, o limite (10, 3, 10, 3) aceito e o seguinte recusado; a janela de 60 minutos nas duas bordas (59:59 conta, 60:01 não); o `retryAfter` escrito à mão; e as chaves `ip:` e `email:` da `pre-cadastro` com os limites 5 e 3 de antes (door 4, Test policy)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-throttle.test.ts -t "throttle_module_four_keys_bounds_and_window_edges"`

**C89** - A elegibilidade do primeiro acesso é uma tabela testada no serviço com banco real, uma linha por situação, com o efeito esperado (usuário criado, reusado ou nada) escrito à mão: ativo adulto sem usuário, suspenso adulto sem usuário, 18 anos completos hoje, 18 anos completos amanhã, com responsável, inativo, anonimizado, e-mail diferente, e-mail de outro usuário, usuário pendente sem senha, usuário inativo com senha, usuário ativo com senha, ficha sem e-mail (AC 8, AC 12, Test policy)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-first-access.test.ts -t "eligibility_decision_table_thirteen_rows"`

**C90** - O estado `portal` é uma função pura testada sem banco sobre a tabela de quatro linhas (sem usuário, usuário sem senha, ativo com senha, inativo com senha) e mais duas de borda (inativo sem senha é `pending`; ativo sem senha é `pending`) (AC 15, Test policy)
Proof: `pnpm --filter "./apps/api" exec vitest run test/portal-first-access.test.ts -t "portal_state_table_six_rows"`

**C91** - As provas de foto existentes não mudam: `photos-replace.test.ts`, `photos-upload.test.ts` e `photos-urls.test.ts` passam com a coluna `pending`, com só as duas chaves novas (`portal` e `pendingPhoto`) acrescentadas às listas de chaves da ficha de `photos-urls.test.ts` (Impact "comportamento existente")
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "previous_row_kept_with_expiry_30_days_and_new_one_is_the_only_current"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "ficha_photo_url_medium_for_four_profiles_null_when_absent"`

**C92** - Na stack do compose, sem `SMTP_HOST`: com uma ficha adulta inserida pelo `psql`, o primeiro acesso pelo `web` real responde com a mensagem da C28; o log da `api` (`NODE_ENV=production`) tem "e-mail não enviado: SMTP não configurado" e nenhuma linha com `token=`; um token conhecido gravado pelo `psql` em `password_tokens` (o SHA-256 em hex dele) abre `/definir-senha`, define a senha, e o login leva a `/minha-conta` com o nome do aluno
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "student_first_access_set_password_and_minha_conta_through_real_stack"`

## Coverage

Uma linha para cada rota da `Surface`, com os status como membros; depois perfis, doors, `Relations`, os
conjuntos enumerados nos critérios e nas Assumptions, e as montagens.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /api/portal/first-access` statuses (3) | 202 C16, C20 · 422 C22 · 429 C23 | - |
| `POST /api/password-tokens/consume` statuses (2) | 204 C29, C35 · 422 C30, C31, C33 | - |
| `POST /api/password-reset` statuses (3) | 202 C38, C39 · 422 C41 · 429 C40 | - |
| `GET /api/me/profile` statuses (3) | 200 C43, C44 · 401 C46, C69 · 403 C46 | - |
| `PATCH /api/me/profile` statuses (4) | 200 C51 · 401 C46 · 403 C46 · 422 C52, C53 | - |
| `GET /api/me/payments` statuses (3) | 200 C45 · 401 C46 · 403 C46 | - |
| `POST /api/me/photo` statuses (7) | 201 C57 · 401 C46 · 403 C46 · 409 C58 · 413 C59 · 415 C59 · 422 C59 | - |
| `GET /api/me/photo` statuses (5) | 200 C65 · 401 C46 · 403 C46 · 404 C65 · 422 C65 | - |
| `POST /api/students/:id/photo/pending/approve` statuses (4) | 200 C61 · 401 C63 · 403 C63 · 404 C63, C66 | - |
| `POST /api/students/:id/photo/pending/reject` statuses (4) | 204 C62 · 401 C63 · 403 C63 · 404 C63, C66 | - |
| status `500` por escrita nova (7) | C82, table-driven over all 7 | - |
| `403 csrf_rejected` nas escritas novas (7) | C80, table-driven over all 7 | - |
| códigos de erro novos (3) | `no_pending_photo` C63 · `pending_photo_exists` C58 · `email_in_use` C55 | - |
| rotas que existiam antes, sessão de aluno (5 grupos) | as demais de `listRoutes`, `403` C9 (table-driven na prova) · `session` C10 · `logout` C10 · `password` C10 · `two-factor` C10 | - |
| perfis em `/api/me/*` (5) | `student` C43 · `admin` C46 · `reception` C46 · `hr_finance` C46 · `instructor` C46 | - |
| perfis em `approve` e `reject` (5) | `admin` C61, C62 · `reception` C61, C62 · `hr_finance` C63 · `instructor` C63 · `student` C63 | - |
| rotas públicas novas (3) | `first-access` C16 · `consume` C29 · `password-reset` C38; todas juntas C78 | - |
| rotas no OpenAPI (10) | C77, table-driven over all 10 | - |
| one-way doors (7) | door 1 C1, C2, C9, C78 · door 2 C3, C17, C29, C30 · door 3 C4, C57, C61, C62 · door 4 C23, C24, C40, C88 · door 5 C74, C75 · door 6 C13, C14, C15, C87 · door 7 C6, C83 | - |
| relações de `Relations` (3) | aluno e usuário C1, C16 · usuário e tokens C3, C19 · aluno e fotos pendentes C4, C57 | - |
| one-way constraints de `Relations` (6) | `student_id` único C1 · `student_id` sse `student` C1 · `token_hash` único C3 · `purpose` em dois valores C3 · uma pendente por aluno C4, C58 · pendente nunca corrente e só de aluno C4 | - |
| valores de `role` (7) | `admin` C1, C2 · `reception` C1, C2 · `hr_finance` C1, C2 · `instructor` C1, C2 · `student` C1, C2 · `Student` C2 · cadeia vazia C2 | - |
| valores de `purpose` (5) | `first_access` C3 · `reset` C3 · `Reset` C3 · `invite` C3 · cadeia vazia C3 | - |
| situações do primeiro acesso (13) | C89, table-driven over all 13; pela fronteira: aceito C16 · nove recusas C20 · usuário pendente C19 · inativo com senha C73 | - |
| recusas do primeiro acesso pela fronteira (9) | C20, table-driven over all 9 | - |
| resposta uniforme do primeiro acesso (10) | C21, table-driven over all 10 | - |
| campos recusados no primeiro acesso (2 campos) | `cpf` C22 · `email` C22 | - |
| tokens recusados (8) | ausente C30 · vazio C30 · `abc` C30 · desconhecido C30 · usado C30, C19 · vencido C30 · ficha inativada C33 · ficha anonimizada C33 | - |
| bordas da senha (4) | 11 C31 · 12 C31 · `PASSWORD_MAX_LENGTH` C31 · `PASSWORD_MAX_LENGTH + 1` C31 | - |
| propósitos consumidos (2) | `first_access` C29 · `reset` C35 | - |
| e-mails recusados na redefinição (4) | nenhum usuário C39 · equipe C39 · aluno inativo C39 · aluno sem senha C39 | - |
| validade dos links (2) | 24 h C16 · 1 h C38 | - |
| limites públicos (4 chaves) | `access-ip` C23, C88 · `access-cpf` C23, C88 · `reset-ip` C40, C88 · `reset-email` C40, C88 | - |
| janela de uma hora (2 bordas) | 59 min C23, C88 · 61 min C23, C40, C88 | - |
| estados `portal` (4) | `none` C26 · `pending` C26 · `active` C26, C73 · `disabled` C26, C73; função pura C90 | - |
| rótulos do estado na ficha (4) | "Sem acesso ao portal" C27 · "Primeiro acesso pedido" C27 · "Acesso ativo" C27 · "Acesso desligado" C27 | - |
| chaves editáveis pelo aluno (4) | `phone` C51 · `address` C51 · `emergencyContactName` C51 · `emergencyContactPhone` C51 | - |
| chaves recusadas pelo aluno (8) | C53, table-driven over all 8 | - |
| situações do período (3) | `paid` C45, C47 · `pending` C45, C47 · `overdue` C45, C47 | - |
| transições da foto pendente (4) | nasce pendente C57 · aprovada C61 · recusada C62 · vencida sem revisão C64 | - |
| arquivos recusados pelo pipeline (9) | C59, table-driven over all 9 | - |
| leituras que seguem servindo a corrente (3) | lista C60 · ficha C60 · check-in C60 | - |
| transições da ficha que tocam o usuário (4) | `inactive` por `DELETE` C69 · `inactive` por `PATCH` recusado C71 · `suspended` C70 · volta a `active` C73 | - |
| tabelas limpas na anonimização (5) | `users` C74 · `accounts` C74 · `sessions` C74 · `two_factors` C74 · `password_tokens` C74 | - |
| ações novas da trilha (5) | `student.portal_access_requested` C16 · `student.portal_password_set` C29 · `student.portal_reset_requested` C38 · `student.photo_approved` C61 · `student.photo_rejected` C62 | - |
| ações reaproveitadas com o aluno como autor (2) | `student.updated` C51 · `student.photo_uploaded` C57 | - |
| caminhos do web para sessão de aluno (19) | C13, table-driven over all 19 | - |
| telas (5) | `/primeiro-acesso` C28 · `/definir-senha` C36, C37 · `/esqueci-senha` C42 · `/minha-conta` C47 a C50, C56, C68 · `/students/[id]` C27, C67 | - |
| estados de `/minha-conta` além do carregando, que é existing (3) | vazio C48 · erro C49 · não autorizado C14, C15 | - |
| mensagens das telas públicas (6) | primeiro acesso C28 · redefinição C42 · senha definida C37 · link inválido C37 · `429` C28, C42 · campo C28, C36 | - |
| startup config: `MailService` (2 assemblies) | montagem dos testes C17 · stack C92 | - |
| startup config: `PhotoPurge` sobre a pendente (2 assemblies) | montagem dos testes C62, C64 · subida da API existing (`startup_purges_expired_version_without_any_request`) C64 | - |

- Claims naming a status code, route or response shape: C9 a C12, C16 a C26, C29 a C35, C38 a C41, C43 a
  C46, C51 a C55, C57 a C66, C69 a C83 - each has a proof that crosses the HTTP boundary; C88 a C90 are the
  same rules at their own layer and do not substitute for the boundary proofs
- Nenhuma prova de tela contra a `FakeApi` afirma linha de auditoria nem gravação; o caminho de ponta a ponta
  das telas é o da C92

## Test policy

As linhas de `features/pre-cadastro/checks.md` seguem valendo para o que esta feature reaproveita (rota que
decide, alcançada por HTTP, com corte por perfil e trilha; restrição do banco; contagem em janela no módulo
e na fronteira; efeito depois do commit com transporte de captura; tela contra a `FakeApi`; stack por
`psql`). Dois casos que lá não existiam ganham linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Elegibilidade com muitas condições cumulativas (primeiro acesso) | uma tabela no serviço com banco real **e** a fronteira | no serviço, uma linha asserida por situação (13); na fronteira, cada recusa (9) e a resposta uniforme (10). A fronteira passa por um caminho da tabela e não a substitui |
| Estado derivado de duas tabelas (`portal`) | uma função pura sem banco **e** a ficha pela fronteira | as quatro linhas e as duas bordas na função; os quatro valores na fronteira |

Evidence (o código ainda não existe; a contagem vem do plano):

- primeiro acesso: 13 situações de elegibilidade, 6 recusas de campo, 2 chaves de limite, 1 corrida (C16 a
  C25, C89) -> decide
- consumo: 8 tokens recusados, 4 bordas de senha, 2 propósitos, 1 corrida (C29 a C35) -> decide
- foto pendente: 4 transições, 9 arquivos recusados, 5 perfis, 1 corrida (C57 a C66) -> decide
- corte de acesso: 4 transições da ficha, 5 tabelas na anonimização (C69 a C75) -> decide
- controllers de `/api/me/*`: resolvem a ficha pela sessão e chamam o serviço existente -> instrumentação,
  além do isolamento que a C44 prova
- closest analogue in the repo: `apps/api/test/leads-create.test.ts` (`resend_decision_table_eight_rows`,
  tabela no serviço ao lado da fronteira); `apps/api/test/leads-throttle.test.ts`
  (`throttle_module_bounds_and_window_edges`); `apps/api/test/photos-replace.test.ts` (o pipeline e a
  retenção da versão anterior)

Cost: 2 provas no próprio nível (C89, C90) além da do módulo de limite (C88). Sem a primeira linha, as
treze situações seriam provadas só pelas que a fronteira percorre; sem a segunda, o `portal` `pending` de um
usuário inativo sem senha ficaria sem caso. As linhas ficam neste arquivo, como nas features anteriores, e
não vão para um guia do repositório.

## Swept

- validation: C7, C22, C30, C31, C41, C52, C53, C59, C81
- failure modes: C17, C18, C69, C75, C82
- idempotency: C19 (pedir de novo invalida o link anterior), C25, C32 (consumir duas vezes vale uma), C38, C51 (mesmo valor não grava trilha), C58
- authorization: C9, C10, C12, C13, C14, C44, C46, C63, C78, C79, C80; existing - guarda global (AD-022) e checagem de origem (AD-020)
- concurrency: C25, C32, C58, C66
- data lifecycle: C3, C62, C64, C74, C75 - tokens em cascata do usuário, pendente vencida ou recusada pelo `PhotoPurge`, usuário limpo na anonimização
- dependency failure: C18 (SMTP fora ou lento), C49 (API fora na tela), C75 (armazenamento fora na anonimização)
- state transitions: C26, C69, C70, C71, C73 (ficha e usuário); C57, C61, C62, C64 (foto pendente)
- observability: C6, C83 - a trilha sem CPF, e-mail nem token; C18 - o log do e-mail sem destinatário; C92 - o link só fora de produção

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado (KB de código e teste, dividido por quatro): S0 = 8k, S1 = 10k, S2 = 11k, S3 = 8k, S4 = 6k, S5 = 10k, S6 = 8k, S7 = 14k, S8 = 9k, S9 = 15k: 99k. Arquivos existentes que a feature edita ou lê como molde, medidos por `wc -c`: `apps/api/src` de `access`, `auth`, `password`, `users`, `students`, `photos`, `privacy`, `leads` (`lead-throttle.ts`, `leads.service.ts`), `mail`, `student-payments`, `audit` e `app.module.ts` (158 KB); `packages/contracts/src` de `auth`, `audit`, `students` e `photos` (20 KB); `schema.ts` e a migração `0012` (25 KB); `apps/web/src` de `proxy.ts`, `lib/roles.ts`, `lib/audit.ts`, `login`, `students/[id]`, `shell`, `components/photo` e `matricula` (90 KB); testes da API que ganham casos ou servem de molde (`access`, `enrollment`, `users`, `students-update`, `photos-upload`, `photos-purge`, `photos-replace`, `privacy-anonymize`, `contracts`, `audit-auth`, `openapi`, `leads-throttle` e os apoios, 305 KB); testes do web (`audit.spec`, `proxy.spec`, `login.spec`, `students.spec`, `photos.spec`, `fake-api.ts`, `motion.test.ts`, 121 KB): 719 KB ÷ 4 = 180k. `plan.md` (33 KB, 8k) e este arquivo (63 KB, 16k): 24k. Total 99k + 180k + 24k = 303k, acima do orçamento de 150k
- Corte proposto, onde a superfície muda (a API pública e o perfil, depois a área do aluno, a foto, o corte e as telas), sem dividir slice: batch A = S0 a S4 (banco, contrato, perfil `student` isolado, primeiro acesso, consumo, redefinição e as telas públicas): código novo 8k + 10k + 11k + 8k + 6k = 43k, existentes 92k (`access`, `auth`, `password`, `users`, `leads`, `mail`, `audit`, contratos, `schema.ts`, `proxy.ts`, `login`, `roles.ts`, `audit.ts`, `access.test.ts`, `enrollment.test.ts`, `users.test.ts`, `contracts.test.ts`, `audit-auth.test.ts`, `leads-throttle.test.ts`, apoios, `proxy.spec.ts`, `login.spec.ts`, `audit.spec.ts`), documentos 24k = 159k; batch B = S5 a S9 (perfil e pagamentos, contato, foto, corte de acesso, montagem e stack): código novo 10k + 8k + 14k + 9k + 15k = 56k, existentes 88k (`students`, `photos`, `privacy`, `student-payments`, `students/[id]`, `components/photo`, `students-update.test.ts`, `photos-*.test.ts`, `privacy-anonymize.test.ts`, `openapi.test.ts`, `students.spec.ts`, `fake-api.ts`, `motion.test.ts`, `compose.test.ts`), documentos 24k = 168k. Os dois batches passam um pouco dos 150k mesmo cortados, porque os testes de molde são grandes; um terceiro corte (S5 e S6 / S7 a S9) baixaria o B para cerca de 120k e 130k, ao preço de mais uma sessão. Nenhuma slice sozinha passa de 15k
- Ordem: S0 primeiro; no mesmo commit de `AUDIT_ACTIONS` entram os cinco rótulos de `ACTION_LABELS` e as contagens de 47 para 52 em `contracts.test.ts`, `audit-auth.test.ts` e `audit.spec.ts`, e no mesmo commit de `USER_ROLES` entra o rótulo de `ROLE_LABELS`, ou o typecheck do web reprova; no mesmo commit da `0013` entra a lista de tabelas de `migrate.test.ts` e de `photos.test.ts` do banco. Cada rota nova entra no commit que a cria nas listas de `openapi.test.ts`, `access.test.ts` e `enrollment.test.ts`. A C6 (segunda prova) fica com uma catraca das ações ainda sem rota no batch A (`student.photo_approved` e `student.photo_rejected`), que o batch B esvazia
- Conferir antes de cada trecho: antes da S1, se `listRoutes` enxerga as rotas de `two-factor` por um prefixo estável (a C9 as exclui por nome); antes da S2, se `attemptLead` aceita a chave e o limite por argumento ou precisa de `LEAD_LIMITS` por prefixo (door 4); antes da S7, como `PhotosService.store` calcula a próxima versão, para a pendente entrar na contagem sem ser corrente
- Mechanism: handoff - escolhido pelo usuário em 2026-10-28, antes da primeira linha de código: batch A (S0 a S4) e batch B (S5 a S9), em sequência e só na verde, cada um em sessão nova que lê este arquivo e o diff do que já entrou; o Verifier só roda depois do batch B. A alternativa recusada era `one builder`
- Boundary (batch A, S0 a S4, sobre a base `6bec03d`; `pnpm verify` sai `1` neste ambiente pelo `EPERM` do turbo (AD-118), e cada tarefa passa fora do turbo em `7cf4852`: `pnpm -r --workspace-concurrency=1 run lint`, `typecheck` e `build` saem `0`; `pnpm --filter <pacote> test` dá 20 testes de contrato, 79 de banco e 80 de repositório (em `d12b116`, sem mudança nesses pacotes depois), 808 de API em 91 arquivos em `7cf4852` (cobertura de `apps/api/src` em 96,41% de linhas e 94,19% de ramos) e 442 de tela (`playwright test` inteiro, em `1777b98`); as 45 Proofs de C1 a C42 rodadas uma a uma pelo comando do check, cada uma com exatamente um teste passando, logs em `.turbo/portal-a/`): fechados por inteiro **C1 a C5, C7 a C42**. Fechado em parte: **C6** - a primeira prova (`audit_actions_end_with_five_portal_actions_in_order`) está fechada; a segunda (`actions_written_equal_contract_vocabulary`, que casa com `ten_actions_written_equal_contract_vocabulary` de `audit-auth.test.ts`) percorre o primeiro acesso, o consumo e a redefinição, afirma `entity` igual a `student` nas cinco ações do portal e guarda a catraca `notYetWritten` com `student.photo_approved` e `student.photo_rejected`, que o batch B esvazia ao percorrer `approve` e `reject`. Commits: `a4106ef` (a linha `Mechanism`), `33b3a57` (S0: migração `0013`, `users.student_id`, `password_tokens`, `photos.pending`, `STAFF_ROLES`, `portal.ts` do contrato, `studentDetailSchema`, `AUDIT_ACTIONS` 47→52 com os rótulos de `ACTION_LABELS`, `ROLE_LABELS.student`, as contagens de `contracts.test.ts`, `audit-auth.test.ts` e `audit.spec.ts`, e as tabelas de `photos.test.ts` do banco; C1 a C8), `21bc1bf` (S1 na API: `STAFF_ROLES` em `students.controller.ts`, `photos.controller.ts` e no `openapi.json`, `GET /api/users` sem aluno, `PATCH` de usuário aluno `404`; C9 a C12), `f5a5335` (S2 a S4 na API: as três rotas públicas, `PortalService`, `attemptPortal`, as listas de `access.test.ts`, `enrollment.test.ts` e `openapi.test.ts`; C16 a C25, C29 a C35, C38 a C41), `d12b116` (web das S1 a S4: `proxy.ts`, `/primeiro-acesso`, `/definir-senha`, `/esqueci-senha`, `/minha-conta` provisória, links e mensagem do `/login`, o trecho de `/audit` do baseline da `motion`; C13 a C15, C28, C36, C37, C42), `1dc93e5` (C26 e a reescrita aprovada da C26 e da C91), `1777b98` (C27) e `7cf4852` (a comparação de `patch_200_changes_only_sent_fields` sem as duas chaves novas da ficha). O que o batch B encontra pronto e deve reusar: em `packages/contracts/src/portal.ts`, `updateMyProfileRequestSchema` (as quatro chaves de contato pelas regras do `PATCH` da equipe; qualquer outra chave sai com o próprio nome no `path`, já provado pela C7) e `myProfileSchema` (as onze chaves); em `students.ts`, `PORTAL_STATES`, `pendingPhotoSchema` e `studentDetailSchema`; em `auth.ts`, `STAFF_ROLES` e `staffRoleSchema`. Em `apps/api/src/portal/`: `PortalService` (`requestFirstAccess`, `requestReset`, `consume`, `portalOf`), as funções puras `firstAccessDecision` (a tabela da C89) e `portalState` (a da C90), e os três controllers públicos; as rotas `/api/me/*` não existem. `PhotosService.pendingOf` lê a pendente; `store`, `purgeExpired` e as listagens de versão ainda não conhecem `pending` (conferência da S7). Nos testes: `test/support/portal.ts` (`insertAdultStudent`, `insertStudentUser`, `portalSession` pelo caminho real, `postFirstAccess`, `postConsume`, `postReset`, `firstAccessBody`, `passwordLink`, `portalRecorded`, `tokenRows`, `nextPortalEmail`). No web: `PortalFrame`, `fichaSchema` e `PORTAL_LABELS` em `lib/students.ts`; `/minha-conta` é só o nome e "Sair", sem `loading.tsx` (a C86 e a guarda `tests/repo/motion.test.ts` entram no batch B)
- Settled mid-build (batch A): **a C26 e a C91 foram reescritas com a aprovação do usuário em 2026-10-28** ("All four profiles"): a C26 pedia `portal` e `pendingPhoto` em `GET /api/students/:id` e, ao mesmo tempo, os testes de `students-read.test.ts` sem edição de asserção, mas `ficha_twelve_keys_for_admin_and_reception`, `ficha_hr_finance_without_health_notes_key` e `ficha_instructor_three_keys_only` fixam a lista exata de chaves (o `FICHA_KEYS` de `photos-urls.test.ts`, da C91, também); as duas chaves vão aos quatro perfis, as quatro listas ganharam só elas em `1dc93e5`, e a cláusula das duas passou a "com só as duas chaves novas acrescentadas às listas de chaves"; `contracts.test.ts` passou a ler `GET /api/students/:id` por `studentDetailSchema`, e `patch_200_changes_only_sent_fields` (`students-update.test.ts`), que compara a resposta do `PATCH` com a ficha menos `photoUrl`, passou a tirar também `portal` e `pendingPhoto` em `7cf4852` (a resposta do `PATCH` segue comparada inteira); a sessão-mãe repassou a decisão, e o usuário a confirmou nesta sessão ("Sim, quatro perfis"). Fora isso, nada foi decidido pelo usuário. As conferências pedidas: antes da S1, `listRoutes` vê o 2FA pelo prefixo estável `/api/auth/two-factor/` (a C9 o usa, e `two-factor/verify` sai por ser pública); antes da S2, `attemptLead` tomava a chave por `LEAD_LIMITS[kind]` e `leads-throttle.test.ts` fixa `LEAD_LIMITS` igual a `{ ip: 5, email: 3 }`, então a contagem virou `attemptKey(executor, key, max)` privada, com `attemptLead` (como antes) e `attemptPortal` sobre `PORTAL_LIMITS` (as quatro chaves da door 4) na mesma tabela e na mesma instrução. Decisões do Build, sem check e reversíveis: (1) `GET /api/openapi.json` era `@Authenticated()` e passou a `@Roles(...STAFF_ROLES)`, ou o aluno teria `200` ali e a C9 exige `403`; (2) a C9 descobre as rotas abertas chamando-as sem sessão e pula as que não respondem `401`, e confere que as exceções são exatamente as seis rotas dos quatro grupos; (3) o primeiro acesso conta IP e CPF na transação, trava a ficha por CPF `FOR UPDATE` e decide por `firstAccessDecision`; e-mail de outro usuário é qualquer `users.email` igual cujo `student_id` não é o da ficha; o usuário novo nasce `active = false`, sem `accounts`; o e-mail sai para `students.email`; (4) o consumo trava token e usuário, recusa token de ficha `inactive` ou anonimizada com o mesmo `422` em `token` ("Este link não vale mais..."), atualiza ou cria a conta `credential`, liga o usuário, marca o uso e apaga as sessões; o hash da senha é calculado antes da transação; (5) a redefinição só acha usuário `student` ativo com `accounts.password` preenchido, trava a linha e grava `entity_id` igual à ficha; (6) os e-mails têm assunto "Crie sua senha do portal" e "Redefina sua senha do portal", dizem "Olá." (sem nome) e o prazo por extenso; a falha sai em stderr como `portal_mail_failed` com `userId`; (7) no web, `callApi` lê o corpo vazio do `202`; `/login?senha=definida` mostra a mensagem da C37; `/definir-senha` confere 12 caracteres e a confirmação antes de chamar a API; a ficha e a edição leem `GET /api/students/:id` por `fichaSchema` (com `portal` e `pendingPhoto` opcionais, para as fixtures antigas da `FakeApi`), e a edição os tira com `studentSchema.strip()`; (8) as provas que precisam de `ana@example.com` em mais de um teste do mesmo arquivo liberam o endereço por SQL antes (`freeAna`)
- Abandoned / deviations (batch A): (1) `pnpm verify` sai `1` pelo `EPERM` do turbo (AD-118); fora do turbo os números estão na linha `Boundary`; (2) **provas de outras features mudaram por efeito desta, sem afrouxar asserção**: o trecho de `/audit` de `fixtures/motion-baseline/390.json` e `1440.json` ganhou as cinco opções novas do filtro "Ação" depois de "Pré-cadastro expirado", por script e sem regravar, como a `pre-cadastro` fez; o baseline não tem `/login`, então a parte da C86 sobre `/login` não tem o que mudar; em `audit.spec.ts` e `contracts.test.ts` as contagens 47→52, as duas listas de rótulos e o `slice(43)` das ações de interessado (agora `slice(43, 47)`); `audit_action_count_is_forty_seven` foi renomeado `audit_action_count_is_fifty_two` (o seletor da C84) e a guarda dele procura 47; os `Record<Role, …>` de `dukfit.spec.ts`, `leads.spec.ts`, `login.spec.ts`, `shell.spec.ts`, `dashboard.test.ts` e `photos-urls.test.ts` passaram a `StaffRole`; o `seed` de `stack.ts` converte o perfil para `StaffRole`; o select de perfil de `/users` passou a `STAFF_ROLES` no commit do vocabulário (a C85 o prova no batch B); (3) a C28 da `motion` (`lists_stagger_8_items_at_40ms_and_cap_the_rest`) falhou em rodadas isoladas de `motion.spec.ts` com distância de 9,77 contra o limite de mais de 10 a 1440 px em `/students`, e outras provas de tempo da `motion` oscilaram entre rodadas; na suíte de tela inteira em `1777b98` as 442 passaram, inclusive essas; esta feature não toca as animações nem `/students`, e a falha não foi reproduzida na base; (4) os checks não são marcados um a um no arquivo: quem diz o que fechou é a linha `Boundary`; (5) um cabeçalho de commit passa dos 72 caracteres (aviso de `check_commit.py`): `1dc93e5` com 73; (6) nada foi abandonado: nenhuma asserção foi afrouxada e os checks só mudaram na correção aprovada da C26 e da C91
- Boundary (batch B, S5 a S9, sobre `51dcf95`; `pnpm verify` segue saindo `1` pelo `EPERM` do turbo (AD-118), e cada tarefa passa fora do turbo em `1feeb7a`: `pnpm -r --workspace-concurrency=1 run lint`, `typecheck` e `build` saem `0`; `pnpm --filter <pacote> test` dá 20 testes de contrato, 79 de banco, 81 de repositório e 844 de API em 95 arquivos (sem linha de cobertura no log); `playwright test` inteiro, 452 de tela; as Proofs da C6 e de C43 a C92 rodadas uma a uma pelo comando do check, cada uma com exatamente um teste passando, salvo a C76, cujo seletor `user_linked` acha os dois testes que a própria C76 nomeia no plural; logs em `.turbo/portal-b/`): fechados **C6** (a catraca `notYetWritten` foi esvaziada: `approve` e `reject` entram em `ten_actions_written_equal_contract_vocabulary`) e **C43 a C92**, com isso os 92. Commits: `4c9c62a` (a correção aprovada da C45 e da C60), `c0312a4` (API das S5 a S8: `MeController`, a foto pendente em `PhotosService`, o e-mail que acompanha, o corte em `inactivate`, `clearStudentUser` na anonimização, a catraca da C6 e as provas de OpenAPI, acesso, 2FA, CSRF, entrada hostil e trilha), `b1bb4f8` (web: `/minha-conta`, `loading.tsx`, `PendingPhotoReview`, a guarda da `motion`, C84, C85 e C87), `f349caa` (C92) e `1feeb7a` (C88 a C90)
- Settled mid-build (batch B): **a C45 e a C60 foram reescritas com a aprovação do usuário em 2026-10-30**: a C45 lia `GET /api/students/:id/payments` por `reception`, que recebe `403` (a rota é de `admin` e `hr_finance`, PRD §2), e passou a ler por `hr_finance`; a C60 trocava a corrente por `POST`, que responde `409 photo_exists`, e passou a `PUT`. Fora isso, nada foi decidido pelo usuário. A conferência pedida antes da S7: `store` calcula a versão por `max(version)` sobre todas as linhas do dono, então a pendente entra na contagem sem mudança. Decisões do Build, sem check e reversíveis: (1) `pendingPhotoSchema` ganhou `url` opcional, a URL assinada `medium` nas leituras, porque a ficha só recebia `id`, `version` e `createdAt` e a C67 pede a imagem; assim a Surface segue com dez rotas; o `POST /api/me/photo` devolve o objeto sem `url`, direto no corpo; (2) `GET /api/me/photo` devolve `currentUrl` e `pendingUrl`, `null` na que falta; (3) `approve` devolve `id`, `version` e `createdAt` (`photoCreatedSchema`); (4) a C81 pediu `noLoneSurrogate` em `addressSchema` e `newPasswordSchema`, que saiu de `plans.ts` para `auth.ts` e vale também para a equipe; (5) o e-mail só acompanha no `PATCH` com valor: limpar `students.email` (`null`) deixa `users.email` como está, porque a coluna é `not null`, caso que a AC 41 não cobre; num aluno com usuário o e-mail vai em minúsculas às duas tabelas (C55), sem usuário segue como veio; a corrida no índice único sai por `isUniqueViolationOf(error, 'users_email_unique')`; (6) em `/minha-conta`, a foto é um componente próprio (`MyPhoto`), porque o `PhotoBlock` troca com `PUT` e mostra "Trocar foto"; o formulário não valida no navegador e deixa o `422` da API aparecer junto do campo; (7) o `PATCH` nunca chega a `inactive`, então o corte vive só em `inactivate`, e `Flow` e `Impact` do plano foram acertados no commit do corte
- Abandoned / deviations (batch B): (1) `pnpm verify` sai `1` pelo `EPERM` do turbo (AD-118); (2) **a C88, a C89 e a C90 não tinham teste**: o batch A as deixou para a S9, o filtro não achava nada e o `vitest` saía `0`; escritas em `1feeb7a` depois que a contagem das Proofs mostrou zero testes; (3) o parêntese "(`413` ou `422`)" da C59 é menor que o conjunto: três dos nove arquivos respondem `415`, como no `POST` da equipe; a prova compara status e código com a equipe, que é o que a C59 afirma, e confere os três status; a `Surface` de `POST /api/me/photo` não lista `415`; (4) **provas de outras features mudaram por efeito desta, sem afrouxar asserção**: `openapi.test.ts` conta 4 caminhos com `/payments` (o quarto é `/api/me/payments`), 27 corpos e o `multipart` novo; `enrollment.test.ts` lista as sete rotas novas; em `tests/repo/motion.test.ts`, `SEGMENTS` tem 13 e o título do `test.each` virou `segment_has_app_loading: %s`, para o seletor da C86 achar um teste só (o `eleven_segments_have_app_loading` da `motion` continua); (5) o baseline da `motion` não tem `/login` (nota do batch A), então a parte da C86 sobre `/login` não tem o que mudar, e a prova `copy_names_and_focus_order_match_the_baseline` passa sem regravar; (6) a ficha passou a envolver o `PhotoBlock` num `flex`, sem mudança de texto, nomes nem ordem de foco; (7) nada foi abandonado: nenhuma asserção foi afrouxada, e os checks só mudaram na correção aprovada da C45 e da C60
- Rodada 1 do Verifier (FAIL em `5881ed0`, `verification.md`; 89 de 92, um mutante vivo): **a C86 e a C59 foram reescritas com a aprovação do usuário em 2026-10-30**: a C86 falava de um `/login` que os baselines não têm e de telas da equipe sem mudança, e passou a dizer que `390.json` e `1440.json` mudam só no trecho de `/audit`, pelas cinco opções do filtro; o parêntese da C59 passou a `413`, `415` ou `422`. Sem pedir aprovação, por só acrescentarem: a C65 e a `Coverage` ganharam o `422` de `variant`, a `Coverage` ganhou o `415`, e a `Surface` ganhou uma nota com os dois status abaixo da tabela. Fechado no código e nas provas: `pendingPhoto.url` asserido na ficha e no perfil (o mutante F1), as três públicas do portal na prova da C79, "ao lado da corrente" na C67, e `inactivate` passou a marcar como usados os tokens abertos do usuário, porque um `reset` aberto religaria o login depois da reativação, contra a AC 56 (`reactivation_does_not_revive_links_issued_before_inactivation`). A `pendingPhoto.url` vai aos quatro perfis, como o `photoUrl` (AD-033); a tela só a mostra a `admin` e `reception`. `DELETE /api/students/:id/photo` continua apagando também a pendente, porque "remover a foto" apaga toda linha do dono e nenhum critério pede o contrário
