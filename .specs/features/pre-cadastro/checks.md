# Pré-cadastro - checks

Profile: standard
Plan: `.specs/features/pre-cadastro/plan.md`

## Intent

108 checks in 11 slices (S0, as 9 do plano e S10 de montagem, regressão e stack) · 11 one-way doors · 2 open, of which 0 block the Build

O plano foi aprovado como escrito em 2026-10-22, com as Assumptions marcadas `n` valendo no padrão escrito
(termo `data_processing` vigente, maioridade declarada, `admin`, `reception` e `hr_finance` veem e marcam,
só `admin` e `hr_finance` convertem, 7 e 90 dias, 5 por IP e 3 por e-mail por hora, `202` uniforme, link
de 24 horas). As doors 1 a 11 viraram AD-107 a AD-117 em `STATE.md`; a AD-106 ganhou a nota do novo destino
do "Matricule-se". As duas perguntas abertas (credenciais de SMTP e Google; texto jurídico do termo) só
travam o go-live e não mudam check nenhum.

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`,
`playwright test <arquivo> -g`). São criados no Build: em `packages/database/test`, `leads.test.ts`; em
`packages/contracts/test`, `leads.test.ts`; em `apps/api/test`, `leads-create.test.ts`,
`leads-confirm.test.ts`, `leads-throttle.test.ts`, `leads-google.test.ts`, `leads-staff.test.ts`,
`leads-convert.test.ts`, `leads-audit.test.ts`, `leads-retention.test.ts`, `mail.test.ts` e os apoios
`support/leads.ts` e `support/mail.ts`; em `apps/web/e2e`, `matricula.spec.ts`, `leads.spec.ts` e
`support/leads.ts`. Ganham casos: `env.test.ts`, `boot.test.ts`, `contracts.test.ts`, `audit-auth.test.ts`,
`openapi.test.ts`, `enrollment.test.ts`, `csrf.test.ts`, `hostile-input.test.ts`, `access.test.ts`,
`migrate.test.ts` (banco), `landing.spec.ts`, `proxy.spec.ts`, `csp.spec.ts`, `shell.spec.ts`,
`audit.spec.ts`, `students.spec.ts`, `fake-api.ts`, `tests/repo/repo.test.ts` e
`tests/stack/compose.test.ts`. As regras de leitura de `features/planos-matriculas/checks.md` seguem
valendo sem mudança: Postgres real por `testcontainers` (AD-012), sessão real de cada perfil, `Origin`
igual a `WEB_ORIGIN` nas escritas, "exatamente uma linha" como diferença de contagem de `audit_logs`,
`withAuditInsertFailing`, `releasedTogether` para pedidos simultâneos, saída capturada em stdout, stderr e
`console`, e, nas telas, a `FakeApi` que registra método, caminho e corpo. Regras próprias:

- "Linha de interessado" é `to_jsonb(leads)` lida por SQL; "nada gravado" é a contagem e as linhas de
  `leads`, `lead_verifications` e `lead_throttles` iguais às de antes, mais a contagem de `audit_logs`.
- "E-mail enviado" é lido de `captureMail()` (`support/mail.ts`), um transporte de captura entregue ao
  `MailService` na montagem do teste, que guarda `to`, `subject`, `text` e `html` e permite atrasar ou
  falhar o envio. Nenhuma prova de API abre conexão SMTP, salvo a C68, que fala com um servidor SMTP em
  processo (`smtp-server` só como dependência de teste de `apps/api`) para provar o transporte de verdade.
- O Google nunca é chamado: as provas da S4 trocam `fetch` só para `https://oauth2.googleapis.com/token`
  por um dublê que devolve o corpo do caso, e montam o `id_token` como JWT sem assinatura conferida
  (door 7). "Cookie assinado válido" é o que `start` e `callback` emitem; "assinatura inválida" é o mesmo
  valor com um caractere trocado.
- `req.ip` de cada requisição é escolhido pelo teste por `X-Forwarded-For`, como em `audit-origin.test.ts`
  (AD-028). Cada teste que conta envios usa IP e e-mail próprios.
- O relógio que decide "há mais de 7 dias", "24 horas" e "na última hora" é o do banco: as provas movem
  `created_at`, `expires_at` e os instantes de `hits` por SQL, nunca o relógio da máquina.
- "Termo vigente" é a maior `version` de `data_processing` em `consent_terms`; as provas que precisam de
  uma versão 2 a inserem por SQL no banco do próprio teste.

### S0 - Tabelas, vocabulário, contrato e ambiente, antes de qualquer rota · ~10 files · ~36 KB · ~9k

**C1** - Depois de `pnpm db:migrate` num banco vazio, `leads` existe sem as colunas `cpf`, `birth_date` e `tenant_id`; uma linha inserida só com `name`, `email`, `phone`, `source`, `consent_purpose` e `consent_term_version` e sem `id` recebe do banco um `uuid` de versão 7, `status` igual a `new`, `email_verified_at` e `student_id` nulos; a falta de `phone` falha por `NOT NULL` (door 1, AD-107)
Proof: `pnpm --filter "./packages/database" exec vitest run test/leads.test.ts -t "leads_table_defaults_and_no_identity_columns"`

**C2** - Em `leads`, `status` aceita `new`, `contacted` e `discarded` (sem aluno) e `converted` (com aluno) e recusa `New`, `novo`, `lead` e a cadeia vazia por `CHECK`; `source` aceita `form` e `google` e recusa `Google`, `site` e a cadeia vazia; `consent_purpose` igual a `image_use` é recusado por `CHECK`; `consent_term_version` igual a `99` é recusado por chave estrangeira; depois de cada recusa a contagem de `leads` é a de antes (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/leads.test.ts -t "leads_status_source_and_consent_checks"`

**C3** - O `CHECK ((status = 'converted') = (student_id IS NOT NULL))` recusa `converted` sem `student_id` e `new`, `contacted` e `discarded` com `student_id`; `student_id` de aluno nenhum falha por chave estrangeira; `DELETE` de um aluno com interessado convertido falha por chave estrangeira (`NO ACTION`) com as duas linhas como estavam (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/leads.test.ts -t "converted_iff_student_id_and_student_fk_without_cascade"`

**C4** - `leads_one_open_email_idx` recusa a segunda linha `new` ou `contacted` com o mesmo `email` (quatro combinações) e aceita a segunda quando a primeira é `converted` ou `discarded` (duas combinações); recusa também quando a primeira é `contacted` e a segunda `new` (door 1, AD-107)
Proof: `pnpm --filter "./packages/database" exec vitest run test/leads.test.ts -t "one_open_lead_per_email_six_combinations"`

**C5** - `lead_verifications` tem `token_hash` `UNIQUE` (o segundo insert com o mesmo hash falha) e chave estrangeira para `leads(id)` com `ON DELETE CASCADE`: apagar o interessado apaga os seus dois tokens e não toca o token de outro interessado; `lead_throttles` tem `key` como chave primária e `hits` `NOT NULL` (door 2, door 4, AD-108, AD-110)
Proof: `pnpm --filter "./packages/database" exec vitest run test/leads.test.ts -t "verifications_cascade_unique_hash_and_throttles_key"`

**C6** - Aplicadas as migrações até a `0011`, inseridos um aluno, um consentimento e um plano, e só então aplicada a `0012`, a migração termina sem erro; o conjunto de tabelas é o de antes mais `lead_throttles`, `lead_verifications` e `leads`, as três vazias; as linhas de `students`, `consents`, `consent_terms` e `plans` são idênticas (Impact "stored data")
Proof: `pnpm --filter "./packages/database" exec vitest run test/leads.test.ts -t "migration_0012_adds_three_empty_tables_and_keeps_existing_rows"`

**C7** - `AUDIT_ACTIONS` tem 47 valores: os 43 de antes, na ordem de antes, seguidos de `lead.created`, `lead.confirmed`, `lead.status_changed` e `lead.purged`, nessa ordem; e depois de percorrer as rotas de interessado, a conversão e um ciclo de retenção, o conjunto de ações gravadas em `audit_logs` é igual ao vocabulário, com `entity` igual a `lead` nas quatro novas (door 8, AD-025, AD-114)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_four_lead_actions_in_order"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/audit-auth.test.ts -t "actions_written_equal_contract_vocabulary"`

**C8** - Em `packages/contracts`, o schema de criação de interessado aceita `name`, `email`, `phone`, `adult: true` e `termVersion`, com e sem `website` vazio, e recusa um a um: a falta de cada um dos cinco, `adult` igual a `false` e a `"true"`, `termVersion` igual a `0` e a `1.5`; o e-mail sai aparado e em minúsculas (`  Ana@Example.COM ` vira `ana@example.com`) e o telefone sem `(`, `)`, `-` e espaços; o schema do `PATCH` aceita `new`, `contacted` e `discarded` e recusa `converted`, `New` e a cadeia vazia; o schema da resposta de `GET /api/leads` aceita o item de nove chaves e recusa `status` igual a `lead` (door 1, AD-011)
Proof: `pnpm --filter "./packages/contracts" exec vitest run test/leads.test.ts -t "lead_schemas_accept_and_reject"`

**C9** - `envSchema` aceita o ambiente sem nenhuma das oito chaves da door 6 e com as oito vazias, devolvendo `SMTP_PORT` igual a `587` e `SMTP_SECURE` igual a `false`; aceita `SMTP_HOST` com `MAIL_FROM` sem usuário e senha, e com os dois; aceita `GOOGLE_CLIENT_ID` com `GOOGLE_CLIENT_SECRET` (door 6, AC 75, AD-112)
Proof: `pnpm --filter "./apps/api" exec vitest run test/env.test.ts -t "smtp_and_google_keys_optional_with_defaults"`

**C10** - `loadEnv` lança `EnvError` nomeando a variável e sem o valor em cada um dos sete casos: `SMTP_HOST` sem `MAIL_FROM` (nomeia `MAIL_FROM`), `SMTP_USER` sem `SMTP_PASS`, `SMTP_PASS` sem `SMTP_USER`, `GOOGLE_CLIENT_ID` sem o segredo, `GOOGLE_CLIENT_SECRET` sem o id, `SMTP_PORT` igual a `0` e igual a `70000` (AC 76)
Proof: `pnpm --filter "./apps/api" exec vitest run test/env.test.ts -t "smtp_and_google_seven_refusals_name_the_variable_without_value"`

### S1 - Enviar o pré-cadastro · ~5 files · ~30 KB · ~8k

**C11** - `POST /api/leads` sem sessão, com `name` `Ana Souza`, `email` `Ana@Example.com`, `phone` `(11) 98765-4321`, `adult: true`, `termVersion` igual ao vigente e sem `website`, responde `202` com corpo exatamente `{"status":"pending"}`; `leads` ganha uma linha com `status` `new`, `source` `form`, `email` `ana@example.com`, `phone` `11987654321`, `consent_purpose` `data_processing`, `consent_term_version` igual ao vigente e `email_verified_at` nulo; com `website` igual a `""` o resultado é o mesmo (AC 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "create_202_pending_and_new_form_row"`

**C12** - Depois da C11, `lead_verifications` tem uma linha do interessado com `expires_at` igual a `created_at` mais 24 horas (diferença lida por SQL igual a `24:00:00`) e `used_at` nulo; `captureMail()` tem exatamente um e-mail, para `ana@example.com`, com `subject` igual a `Confirme seu pré-cadastro`, e `text` e `html` contêm um link `<WEB_ORIGIN>/matricula/confirmar?token=<t>` em que `t` tem 43 caracteres base64url e o SHA-256 em hex de `t` é o `token_hash` gravado; o `text` contém `SITE.name` e "O link vale por 24 horas. Se você não pediu, ignore este e-mail." (AC 2, door 2, Observable "e-mail")
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "create_stores_token_hash_and_mails_the_confirm_link"`

**C13** - `POST /api/leads` responde `422` com um item em `errors` cujo `path` é o campo do caso, sem gravar nada e sem e-mail, em cada um dos casos: `name` ausente, vazio, só de espaços e com U+0000; `email` ausente, `ana`, `ana@` e com U+0000; `phone` ausente, `123`, `119876543210` (12 dígitos) e com letras; e responde `202` para `phone` de 10 e de 11 dígitos e para `name` de 120 caracteres com `é` dentro (o máximo de `nameSchema`), e `422` para 121 (AC 3, L-019)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "create_fourteen_refusals_422_and_bounds_accepted"`

**C14** - `adult` ausente, `false`, `"true"` e `1` respondem `422` com o item de `path` `adult` e `message` exatamente "Menores de 18 anos fazem a matrícula na recepção, com o responsável.", sem gravar nada (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "adult_not_true_422_with_minor_message"`

**C15** - Com as versões 1 e 2 de `data_processing` no banco, `termVersion` igual a `1`, ausente e igual a `3` responde `422` com `path` `termVersion` sem gravar nada, e `2` responde `202` com `consent_term_version` igual a `2` (AC 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "term_version_must_be_the_current_one"`

**C16** - Com um interessado `new` não confirmado de `ana@example.com`, `POST /api/leads` com `ANA@example.com`, `name` `Ana S.` e outro telefone responde `202` `{"status":"pending"}`; `leads` continua com uma linha daquele e-mail, o mesmo `id`, com o `name` e o `phone` novos; `lead_verifications` passa a ter dois tokens dela, os dois válidos; `captureMail()` ganha um segundo e-mail com o link do token novo; com o interessado `contacted` não confirmado o resultado é o mesmo (AC 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "resend_to_open_unconfirmed_lead_updates_same_row_and_mails_new_token"`

**C17** - Com um interessado aberto já confirmado, `POST /api/leads` com o e-mail dele e outro nome responde `202` `{"status":"pending"}`, a linha fica idêntica, nenhum token é criado e nenhum e-mail é enviado (AC 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "resend_to_confirmed_open_lead_changes_nothing_and_mails_nothing"`

**C18** - `POST /api/leads` com o e-mail de um interessado `converted`, de um `discarded` e de um aluno (`students.email`) sem interessado responde `202` nos três casos e cria uma linha nova `new` em cada, mantendo as anteriores idênticas (AC 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "converted_discarded_or_student_email_creates_new_lead"`

**C19** - Três `POST /api/leads` simultâneos com o mesmo e-mail novo, de IPs diferentes, respondem `202` os três, e `leads` termina com exatamente uma linha aberta daquele e-mail (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "three_concurrent_creates_same_email_one_open_row"`

**C20** - `POST /api/leads` com `website` igual a `http://spam` responde `202` com `{"status":"pending"}` e deixa `leads`, `lead_verifications` e `lead_throttles` idênticas e `captureMail()` vazio; também com os outros campos inválidos (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "honeypot_filled_202_and_nothing_recorded_or_counted"`

**C21** - Com o transporte de captura configurado para falhar, e depois para demorar 15 s, `POST /api/leads` responde `202` em menos de 2 s nos dois casos, a linha e o token ficam gravados, e a saída capturada tem uma linha com `lead_mail_failed` e o id do interessado, sem o endereço `ana@example.com` em nenhuma linha (AC 11, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "mail_failure_or_timeout_keeps_202_and_logs_id_without_address"`

**C22** - Sem `SMTP_HOST`, com `NODE_ENV` igual a `test`, `POST /api/leads` responde como na C11 e a saída tem "e-mail não enviado: SMTP não configurado" e o link de confirmação; com `NODE_ENV` igual a `production`, a saída tem a frase e não tem `token=` em linha nenhuma (AC 12, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/mail.test.ts -t "log_transport_without_smtp_prints_link_only_outside_production"`

**C23** - `GET /api/leads/options` sem sessão responde `200` com exatamente as chaves `google` e `term`; `term` tem exatamente `version` e `text`, iguais à maior versão de `data_processing` lida por SQL, também depois de inserir a versão 2 (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "options_200_with_google_flag_and_current_term"`

### S2 - Confirmar o e-mail · ~3 files · ~14 KB · ~4k

**C24** - `POST /api/leads/confirm` com o token do e-mail da C12 responde `200` com `{"status":"confirmed"}`; `used_at` do token e `email_verified_at` do interessado ficam entre T0 e T1 lidos de `now()` do banco (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-confirm.test.ts -t "confirm_200_sets_used_at_and_email_verified_at"`

**C25** - Repetir o `POST /api/leads/confirm` com o mesmo token responde `200` `{"status":"confirmed"}` com as linhas de `leads` e `lead_verifications` idênticas; e o segundo token válido do mesmo interessado (C16) também responde `200` sem mudar nenhuma linha (AC 15, AC 17)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-confirm.test.ts -t "used_token_or_sibling_token_of_confirmed_lead_200_changes_nothing"`

**C26** - `POST /api/leads/confirm` responde `422` com um item de `path` `token` e `message` exatamente "Link inválido ou expirado. Envie o pré-cadastro de novo.", sem mudar nenhuma linha, em cada caso: `token` ausente, vazio, `abc`, 43 caracteres de token nenhum, token com `expires_at` um segundo no passado (movido por SQL), e token de interessado apagado; e o token com `expires_at` um minuto no futuro responde `200` (AC 16, L-019)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-confirm.test.ts -t "six_invalid_tokens_422_and_token_before_expiry_200"`

**C27** - Um token já usado de um interessado ainda não confirmado (o `used_at` preenchido e `email_verified_at` nulo por SQL) responde `422` como na C26 (AC 16)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-confirm.test.ts -t "used_token_of_unconfirmed_lead_422"`

**C28** - Dois `POST /api/leads/confirm` simultâneos com o mesmo token respondem `200` aos dois, e `audit_logs` ganha exatamente uma linha `lead.confirmed` (AC 14, AC 15)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-confirm.test.ts -t "two_concurrent_confirms_one_audit_row"`

### S3 - Limite e abuso do formulário público · ~3 files · ~16 KB · ~4k

**C29** - Cinco `POST /api/leads` do mesmo IP com cinco e-mails diferentes respondem `202`; o sexto responde `429` com `code` `too_many_attempts` e `Retry-After` igual ao número de segundos até o primeiro sair da janela de uma hora (com o primeiro movido por SQL para 59 minutos atrás, `Retry-After` entre `55` e `60`), sem gravar em `leads` nem enviar e-mail; com o primeiro movido para 61 minutos atrás, o sexto responde `202` (AC 21, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-throttle.test.ts -t "sixth_from_same_ip_429_with_retry_after_and_window_edge"`

**C30** - Três `POST /api/leads` com o mesmo e-mail de três IPs diferentes respondem `202`; o quarto, de um quarto IP, responde `429` como na C29, sem mudar a linha do interessado (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-throttle.test.ts -t "fourth_for_same_email_any_ip_429"`

**C31** - Seis `POST /api/leads` simultâneos do mesmo IP com e-mails diferentes resultam em no máximo cinco `202`, e a contagem de linhas novas em `leads` é igual à de `202` (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-throttle.test.ts -t "six_concurrent_same_ip_at_most_five_accepted"`

**C32** - Três `POST /api/leads` com o e-mail do Administrador deixam `login_throttles` sem linha daquele e-mail, e o login dele em seguida responde `200`; as contagens estão em `lead_throttles` sob `ip:<ip>` e `email:<e-mail>` (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-throttle.test.ts -t "lead_attempts_never_touch_login_throttles"`

**C33** - `POST /api/leads` e `POST /api/leads/confirm` sem `Origin` e sem `Sec-Fetch-Site`, e com `Origin` igual a `https://evil.example`, respondem `403` com `csrf_rejected` sem gravar nada; com `Sec-Fetch-Site: same-origin` e sem `Origin` respondem como de costume (AC 25, AD-020)
Proof: `pnpm --filter "./apps/api" exec vitest run test/csrf.test.ts -t "lead_public_writes_under_origin_check"`

**C34** - O corpo e o status da resposta são byte a byte iguais nos cinco casos das AC 1, 6, 7, 8 e 10 (e-mail novo, aberto não confirmado, aberto confirmado, de aluno, armadilha), e nenhum cabeçalho da resposta difere entre eles além de `X-Request-Id` e `Date` (AC 26)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "same_202_body_and_headers_for_five_email_situations"`

### S4 - Entrar com Google · ~3 files · ~22 KB · ~6k

**C35** - Com `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, `GET /api/leads/options` responde `google: true`, e `GET /api/leads/google/start` responde `302` com `Location` em `https://accounts.google.com/o/oauth2/v2/auth` cuja query tem exatamente `client_id`, `redirect_uri` igual a `<WEB_ORIGIN>/api/leads/google/callback`, `response_type` `code`, `scope` `openid email profile`, `state` de ao menos 32 caracteres, `code_challenge` igual ao SHA-256 em base64url do verificador guardado no cookie, `code_challenge_method` `S256` e `prompt` `select_account`; o `Set-Cookie` de `lead_google_state` tem `HttpOnly`, `SameSite=Lax`, `Path=/api/leads/google` e `Max-Age=600` (AC 27, door 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-google.test.ts -t "start_302_to_google_with_pkce_and_state_cookie"`

**C36** - Sem as duas variáveis, `GET /api/leads/options` responde `google: false` e `GET /api/leads/google/start`, `/callback` e `/profile` respondem `404` com `not_found` (AC 28; com só uma das duas a API não sobe, C10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-google.test.ts -t "without_google_keys_options_false_and_three_routes_404"`

**C37** - O callback com o `state` do cookie e um `code`, quando o dublê do endpoint de token recebe `grant_type=authorization_code`, o `code`, o `code_verifier`, o `client_id`, o `client_secret` e o `redirect_uri` e devolve um `id_token` com `iss` `https://accounts.google.com`, `aud` igual ao `client_id`, `exp` no futuro, `email` `Bia@Gmail.com`, `email_verified: true` e `name` `Bia Lima`, responde `302` com `Location` `/matricula?google=ok`, apaga `lead_google_state` (`Max-Age=0`) e grava `lead_google_profile` com `HttpOnly`, `SameSite=Lax`, `Path=/api/leads` e `Max-Age=900`; com `iss` `accounts.google.com` o resultado é o mesmo (AC 29)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-google.test.ts -t "callback_valid_id_token_302_ok_and_profile_cookie"`

**C38** - O callback responde `302` para `/matricula?google=erro` sem `lead_google_profile` em cada um dos dez casos: `state` diferente do cookie, sem cookie, cookie de assinatura inválida, `error=access_denied` na query, endpoint de token respondendo `400`, `fetch` lançando erro de rede, `iss` `https://evil.example`, `aud` de outro cliente, `exp` no passado, `email_verified: false` (AC 30)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-google.test.ts -t "callback_ten_failures_302_erro_without_profile"`

**C39** - `GET /api/leads/google/profile` com o cookie da C37 responde `200` com exatamente `{"name":"Bia Lima","email":"bia@gmail.com"}`; sem cookie, com cookie de assinatura inválida e com cookie emitido há 16 minutos (instante do cookie fixado pelo teste) responde `404` (AC 31, AC 33)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-google.test.ts -t "profile_200_with_valid_cookie_404_otherwise"`

**C40** - `POST /api/leads` com o cookie da C37, `name` `Outro Nome` e `email` `outra@x.com` no corpo, telefone, `adult` e termo válidos responde `202` com `{"status":"confirmed"}`; a linha tem `email` `bia@gmail.com` e `name` `Bia Lima`, os do cookie, `source` `google` e `email_verified_at` entre T0 e T1; nenhum token é criado, `captureMail()` fica vazio, e a resposta apaga `lead_google_profile` (`Max-Age=0`) (AC 32)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-google.test.ts -t "create_with_google_cookie_confirmed_source_google_no_mail"`

**C41** - `POST /api/leads` com `lead_google_profile` de assinatura inválida se comporta como na C11: `202` `pending`, `source` `form`, o e-mail do corpo e um e-mail de confirmação enviado (AC 33)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-google.test.ts -t "tampered_profile_cookie_treated_as_absent"`

**C42** - Com um interessado `new` não confirmado de `bia@gmail.com`, `POST /api/leads` com o cookie do Google responde `202` `confirmed`, mantém o mesmo `id` e grava `source` `google` e `email_verified_at`; com um interessado aberto já confirmado, responde `202` `confirmed` e a linha fica idêntica (AC 32, AC 6, AC 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-google.test.ts -t "google_create_over_existing_open_lead_confirms_same_row"`

### S5 - Interessados no painel e conversão · ~5 files · ~34 KB · ~9k

**C43** - `GET /api/leads` sem `status`, de `admin`, `reception` e `hr_finance`, responde `200` com corpo igual para os três, só os interessados `new` e `contacted`, cada um com exatamente as chaves `id`, `name`, `email`, `phone`, `source`, `status`, `emailVerified`, `createdAt` e `studentId`; a ordem é `createdAt` decrescente e, no empate (dois `created_at` iguais fixados por SQL), `id` decrescente, escrita à mão no teste (AC 34)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-staff.test.ts -t "list_open_leads_newest_first_same_body_for_three_roles"`

**C44** - `GET /api/leads?status=<s>` devolve só os daquele `status` para cada um de `new`, `contacted`, `converted` e `discarded`, na mesma ordem, com `studentId` preenchido só em `converted`; `status=lead`, `status=` e `status=NEW` respondem `422` com `path` `status` (AC 35, AC 36)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-staff.test.ts -t "list_filter_four_statuses_and_three_invalid_422"`

**C45** - `PATCH /api/leads/:id` de cada um dos três perfis faz as transições `new`→`contacted`, `contacted`→`discarded`, `discarded`→`new`, `new`→`discarded` e `contacted`→`new`, cada uma respondendo `200` com o item atualizado e as demais colunas da linha idênticas (AC 37)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-staff.test.ts -t "patch_five_transitions_200_by_three_roles"`

**C46** - `PATCH /api/leads/:id` com `status` `converted`, `New`, `""`, `null`, ausente e corpo `{}` responde `422` com `path` `status` sem mudar a linha (AC 38)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-staff.test.ts -t "patch_six_invalid_statuses_422"`

**C47** - `PATCH /api/leads/:id` em interessado `converted`, com cada um dos três valores, responde `409` com `lead_converted` e a linha idêntica (AC 39)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-staff.test.ts -t "patch_converted_lead_409"`

**C48** - Com um `discarded` e outro interessado aberto do mesmo e-mail, `PATCH` do `discarded` para `new` e para `contacted` responde `409` com `lead_email_open` e a linha idêntica; sem o aberto, responde `200` (AC 40)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-staff.test.ts -t "reopen_discarded_with_open_sibling_409_lead_email_open"`

**C49** - `instructor` em `GET /api/leads` e em `PATCH /api/leads/:id` (com `:id` existente e inexistente) responde `403` com `forbidden`, sem nenhuma das chaves `name`, `email` e `phone` no corpo e sem mudar nada; sem sessão as duas rotas respondem `401` com `unauthorized` (AC 41)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-staff.test.ts -t "instructor_403_and_no_session_401"`

**C50** - `PATCH /api/leads/abc` e `PATCH /api/leads/<uuid de ninguém>` respondem `404` com `not_found` para `admin`; e `PATCH` para um `uuid` de ninguém por `reception` também responde `404` (prova de que a rota existe e decide: o `403` do `instructor` na C49 vem antes) (AC 42)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-staff.test.ts -t "patch_404_for_non_uuid_and_unknown_uuid"`

**C51** - `POST /api/students` de `admin` e de `hr_finance` com os campos de aluno válidos e `leadId` de um interessado `new`, e de outro `contacted`, responde `201`; na mesma leitura, o interessado tem `status` `converted` e `student_id` igual ao `id` do aluno criado (AC 43, door 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-convert.test.ts -t "create_student_with_lead_id_converts_new_and_contacted"`

**C52** - `POST /api/students` com `leadId` de um interessado `converted` e de um `discarded` responde `409` com `lead_converted`, sem aluno novo e com o interessado idêntico; com `leadId` `abc` e com `uuid` de ninguém responde `422` com `path` `leadId` sem aluno novo (AC 44)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-convert.test.ts -t "lead_id_converted_discarded_409_and_unknown_422"`

**C53** - Dois `POST /api/students` simultâneos com o mesmo `leadId` e CPFs diferentes: exatamente um `201` e um `409` com `lead_converted`; `students` ganha exatamente uma linha (AC 45)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-convert.test.ts -t "two_concurrent_conversions_one_student"`

**C54** - Com o insert do aluno falhando por CPF repetido (`409` da `alunos`), o interessado do `leadId` continua `new` e sem `student_id` (door 9: aluno e conversão juntos ou nenhum)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-convert.test.ts -t "student_insert_failure_leaves_lead_open"`

**C55** - `POST /api/students` sem `leadId` responde como antes: os testes de `students-create` existentes passam sem edição, e a resposta não ganha chave nova (AC 46)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-convert.test.ts -t "create_student_without_lead_id_unchanged"`

**C56** - `reception` em `POST /api/students` com `leadId` responde `403` com `forbidden` e o interessado idêntico (door 9: só quem cria aluno converte)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-convert.test.ts -t "reception_cannot_convert"`

### S6 - Tela "Interessados" · ~6 files · ~40 KB · ~10k

**C57** - O link "Interessados" aparece no menu da `Shell` para `admin`, `reception` e `hr_finance` e não aparece para `instructor`, e aponta para `/leads` (AC 47)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/shell.spec.ts -g "leads_link_only_for_admin_reception_hr_finance"`

**C58** - `/leads` aberto por `reception` mostra o título "Interessados", o filtro "Situação" com as opções "Em aberto", "Novo", "Contatado", "Matriculado" e "Descartado" nessa ordem e "Em aberto" escolhido, e a tabela com as colunas "Nome", "E-mail", "Telefone", "Origem", "E-mail confirmado", "Recebido em" e "Situação" nessa ordem; a primeira chamada da página é `GET /api/leads` sem `status` (AC 48)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/leads.spec.ts -g "title_filter_and_seven_columns"`

**C59** - Escolher cada uma das quatro situações no filtro chama `GET /api/leads?status=<s>` com `new`, `contacted`, `converted` e `discarded`, e a tabela mostra o que a `FakeApi` devolveu (AC 48, AC 35)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/leads.spec.ts -g "filter_sends_each_status"`

**C60** - Uma linha com `source` `form`, `emailVerified` `false`, `createdAt` `2026-10-22T13:05:00Z` e `status` `new` mostra "Formulário", "Não", "22/10/2026 10:05" e "Novo"; outra com `google`, `true`, `2026-10-23T02:30:00Z` e `contacted` mostra "Google", "Sim", "22/10/2026 23:30" e "Contatado"; e `converted` e `discarded` mostram "Matriculado" e "Descartado" (AC 49)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/leads.spec.ts -g "labels_and_sao_paulo_datetime"`

**C61** - Com `items` vazio, `/leads` mostra "Nenhum interessado." e nenhuma tabela, em "Em aberto" e em "Descartado" (AC 50)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/leads.spec.ts -g "empty_state"`

**C62** - Com `GET /api/leads` respondendo `500`, `/leads` mostra "Não foi possível carregar os interessados." e o botão "Tentar novamente"; com a `FakeApi` voltando a `200`, o clique mostra a tabela (AC 51)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/leads.spec.ts -g "load_error_and_retry"`

**C63** - Sem sessão, `/leads` redireciona para `/login`; `instructor` vê "Você não tem permissão para acessar esta página." e a `FakeApi` não recebe `GET /api/leads` (AC 52)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/leads.spec.ts -g "no_session_redirects_and_instructor_denied"`

**C64** - Para `reception`, a linha `new` tem "Marcar contatado" e "Descartar" e não tem "Matricular"; a `contacted` tem só "Descartar"; a `discarded` tem só "Reabrir"; a `converted` não tem botão; para `admin` e `hr_finance`, as linhas `new` e `contacted` também têm "Matricular" (AC 53)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/leads.spec.ts -g "row_buttons_by_status_and_role"`

**C65** - "Marcar contatado" envia `PATCH /api/leads/<id>` com `{"status":"contacted"}` sem diálogo; "Reabrir" envia `{"status":"new"}`; "Descartar" abre um diálogo que contém o nome do interessado, "Voltar" não envia nada, e confirmar envia `{"status":"discarded"}`; depois de cada `200` a linha mostra a situação nova (AC 53, AC 54)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/leads.spec.ts -g "status_actions_and_discard_confirmation"`

**C66** - "Matricular" leva a `/students/new?lead=<id>` com "Nome", "E-mail" e "Telefone" preenchidos com os do interessado; salvar o formulário com CPF e nascimento envia `POST /api/students` com `leadId` igual ao `<id>`; abrir `/students/new` sem `lead` envia o corpo sem `leadId` (AC 55)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/leads.spec.ts -g "matricular_prefills_student_form_and_sends_lead_id"`

**C67** - Com o `PATCH` respondendo `409` `lead_email_open`, a linha mostra "Já existe um pré-cadastro em aberto com este e-mail."; com o `POST /api/students` respondendo `409` `lead_converted`, o formulário mostra "Este interessado já foi matriculado." e mantém os campos (AC 56)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/leads.spec.ts -g "conflict_messages"`

### S7 - Páginas públicas `/matricula` · ~6 files · ~34 KB · ~9k

**C68** - Com `SMTP_HOST` e `SMTP_PORT` de um servidor SMTP em processo, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE=false` e `MAIL_FROM` igual a `Academia <no-reply@academia.test>`, um `POST /api/leads` faz o servidor receber uma mensagem autenticada com aquele usuário e senha, `MAIL FROM` `no-reply@academia.test`, `RCPT TO` do interessado e o assunto da C12; sem `SMTP_USER` e `SMTP_PASS`, a mensagem chega sem `AUTH` (AC 77, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/mail.test.ts -t "smtp_transport_delivers_with_and_without_auth"`

**C69** - Em `/` com e sem sessão, o "Matricule-se" do card de planos tem `href` igual a `/matricula`, e o clique leva a `/matricula` (AC 57, AD-117)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/landing.spec.ts -g "matricule_se_links_to_matricula"`

**C70** - `GET /matricula`, `/matricula/confirmar?token=x` e `/matricula/enviado`, sem sessão, com sessão e com sessão de 2FA pendente, respondem `200` (nove casos), sem redirecionar, com `Content-Security-Policy` contendo `'nonce-` e `form-action 'self'`; e `/matriculas` e `/matricula-x` sem sessão continuam redirecionando para `/login` (AC 58, door 11)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/proxy.spec.ts -g "matricula_pages_public_with_csp_and_no_prefix_leak"`

**C71** - `/matricula` mostra o título "Pré-cadastro", os campos "Nome", "E-mail" e "Telefone", as caixas "Tenho 18 anos ou mais" e "Li e aceito o termo de tratamento de dados", o botão "Enviar", e um controle que, acionado, mostra o `text` do termo devolvido por `GET /api/leads/options` (AC 59)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/matricula.spec.ts -g "form_fields_checkboxes_and_expandable_term"`

**C72** - Enviar com o e-mail `ana@`, com o telefone `123`, sem "Tenho 18 anos ou mais" e sem o aceite mostra a mensagem do schema junto de cada campo e a `FakeApi` não recebe `POST /api/leads`; com a API respondendo `422` em `phone` com uma mensagem, ela aparece junto de "Telefone" (AC 60)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/matricula.spec.ts -g "client_and_server_validation_messages"`

**C73** - Um envio válido manda `POST /api/leads` com `name`, `email`, `phone`, `adult: true`, `termVersion` igual ao de `options` e `website` vazio; com `202` `pending` navega para `/matricula/enviado`, que mostra "Enviamos um link para o seu e-mail. Abra-o em até 24 horas para confirmar."; com `202` `confirmed` mostra "E-mail confirmado. A recepção vai entrar em contato para concluir sua matrícula." (AC 61)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/matricula.spec.ts -g "submit_sends_body_and_shows_pending_or_confirmed"`

**C74** - Com a API respondendo `429`, a página mostra "Muitas tentativas. Tente de novo em alguns minutos." e os campos mantêm o que foi digitado (AC 62)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/matricula.spec.ts -g "too_many_attempts_message_keeps_fields"`

**C75** - Com `options` `google: true`, a página tem o link "Continuar com Google" com `href` `/api/leads/google/start`; com `google: false` não há esse texto na página (AC 63)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/matricula.spec.ts -g "google_link_follows_options_flag"`

**C76** - `/matricula?google=ok` com `GET /api/leads/google/profile` em `200` mostra "Bia Lima" e "bia@gmail.com" sem campo editável de nome nem de e-mail, pede "Telefone" e as duas caixas, e o envio manda o `POST` com `name` e `email` do Google, `phone`, `adult` e `termVersion`; com `profile` em `404`, mostra o formulário completo; `/matricula?google=erro` mostra "Não foi possível entrar com o Google. Preencha o formulário." e o formulário vazio (AC 64)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/matricula.spec.ts -g "google_ok_prefill_and_google_erro_message"`

**C77** - `/matricula/confirmar?token=t1` não chama `POST /api/leads/confirm` ao abrir (a `FakeApi` registra zero chamadas depois de 1 s); o clique em "Confirmar e-mail" envia `{"token":"t1"}`; com `200` mostra a mensagem da C73 para `confirmed`; com `422` mostra "Link inválido ou expirado. Envie o pré-cadastro de novo." e o link "Voltar ao pré-cadastro" com `href` `/matricula` (AC 18, AC 19, AC 20, door 3)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/matricula.spec.ts -g "confirm_page_posts_only_on_click"`

**C78** - Em `/matricula`, `/matricula/confirmar` e `/matricula/enviado`, toda requisição feita pela página (script, folha de estilo, fonte, imagem e `fetch`) tem a origem do web, e o console não tem violação de CSP (AC 65)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/csp.spec.ts -g "matricula_pages_load_only_same_origin_without_csp_violation"`

**C79** - Com a largura de 375 px, `/matricula` não tem rolagem horizontal (`scrollWidth` igual a `clientWidth`) e o botão "Enviar" fica visível ao rolar até o fim (Observable "density")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/matricula.spec.ts -g "mobile_width_no_horizontal_scroll"`

### S8 - Trilha e retenção · ~3 files · ~26 KB · ~7k

**C80** - A C11 grava exatamente uma linha `lead.created` com `user_id` nulo, `entity` `lead`, `entity_id` igual ao id, `ip` igual ao IP do teste e `diff` igual a `{"fields":["source","status"],"values":{"source":{"from":null,"to":"form"},"status":{"from":null,"to":"new"}}}`; a C40 grava o mesmo com `"to":"google"` em `source` e mais nenhuma linha (`lead.confirmed` não é gravada no caminho do Google) (AC 66)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-audit.test.ts -t "created_row_for_form_and_google_with_source_and_status"`

**C81** - A C24 grava exatamente uma linha `lead.confirmed` com `user_id` nulo, `entity_id` do interessado, o IP do teste e `diff` nulo (AC 67)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-audit.test.ts -t "confirmed_row_without_diff"`

**C82** - Cada transição da C45 grava exatamente uma linha `lead.status_changed` com `user_id` do autor e `diff` igual a `{"fields":["status"],"values":{"status":{"from":"<antes>","to":"<depois>"}}}`; a conversão da C51 grava `student.created` e `lead.status_changed` de `new` para `converted`, as duas na mesma transação; `PATCH` com o mesmo `status` atual responde `200` sem linha nova (AC 68)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-audit.test.ts -t "status_changed_rows_on_patch_and_conversion_none_when_unchanged"`

**C83** - Não muda a contagem de `audit_logs`: o reenvio da C16, o da C17, a armadilha da C20, a confirmação repetida da C25, e cada resposta `401`, `403`, `404`, `409`, `422` e `429` das rotas `/api/leads*` e da conversão (AC 69)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-audit.test.ts -t "no_row_for_resends_honeypot_repeat_confirm_and_4xx"`

**C84** - Depois de percorrer criar, reenviar, confirmar, Google, mudar situação, converter e reter com `name` `Zé Único`, `email` `ze.unico@example.com` e `phone` `11912345678`, nenhuma coluna de `audit_logs` (texto de cada linha por `to_jsonb`) contém `Zé Único`, `ze.unico`, `11912345678` nem as chaves `name`, `email` e `phone` em `diff.fields` (AC 70, AD-114)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-audit.test.ts -t "no_personal_data_in_any_audit_column"`

**C85** - Com o insert de `audit_logs` falhando, `POST /api/leads`, `POST /api/leads/confirm`, `PATCH /api/leads/:id` e `POST /api/students` com `leadId` respondem `500`, e `leads`, `lead_verifications` e `students` ficam como estavam; nenhum e-mail é enviado no primeiro caso (AC 71)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-audit.test.ts -t "audit_failure_500_rolls_back_four_writes"`

**C86** - Um ciclo de retenção com seis interessados - não confirmado de 7 dias e 1 minuto, não confirmado de 6 dias e 23 horas, confirmado de 89 dias, confirmado de 90 dias e 1 minuto, `converted` de 90 dias e 1 minuto e `discarded` não confirmado de 8 dias (idades postas por SQL em `created_at`) - apaga exatamente o primeiro, o quarto, o quinto e o sexto, com os tokens deles, mantém o segundo e o terceiro idênticos, mantém o aluno do quinto, e grava uma linha `lead.purged` por apagado, com `user_id`, `ip` e `user_agent` nulos, `entity_id` do apagado e `diff` nulo (AC 72, AC 73, door 10, L-019)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-retention.test.ts -t "purge_six_ages_deletes_four_keeps_two_and_audits_each"`

**C87** - O temporizador roda na subida e a cada 60 minutos (relógio de temporizadores do teste avançado em 60 minutos dispara a segunda execução, 59 não); uma falha de banco num ciclo vira uma linha de log e o ciclo seguinte roda (door 10, molde AD-050)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-retention.test.ts -t "timer_runs_at_boot_every_sixty_minutes_and_survives_failure"`

**C88** - `/audit` mostra as quatro ações novas como "Pré-cadastro recebido", "E-mail do pré-cadastro confirmado", "Situação do interessado alterada" e "Pré-cadastro expirado", e o filtro "Ação" as oferece nessa ordem depois das 43 existentes; a linha `lead.status_changed` mostra em "Detalhes" "Situação: Novo → Contatado" (AC 74)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "four_lead_actions_labels_order_and_status_detail"`

### S9 - Configuração por ambiente · ~3 files · ~10 KB · ~3k

**C89** - A API montada sem nenhuma das oito chaves, e com as oito vazias, sobe e `/health` responde `200` com o corpo de antes (AC 75)
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "boots_without_smtp_and_google_keys"`

**C90** - A API com `SMTP_HOST` e sem `MAIL_FROM` não sobe, e a saída nomeia `MAIL_FROM` sem imprimir o valor de `SMTP_HOST` (AC 76)
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "refuses_smtp_host_without_mail_from_naming_it"`

**C91** - `.env.example` lista `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, cada uma com valor vazio, e um comentário antes do grupo SMTP e outro antes do grupo Google contendo "opcional" (AC 78, Observable ".env.example")
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "env_example_lists_eight_optional_smtp_and_google_keys_empty"`

**C92** - `nodemailer` é declarado só em `apps/api/package.json` (pelo catálogo) e não em `apps/web`, `packages/*` nem na raiz; `smtp-server`, se usado, só em `devDependencies` de `apps/api`; o guard `motion_is_the_only_added_dependency` continua passando sem edição (door 5, AD-104)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "nodemailer_only_in_api"`

**C93** - A lista de custódia de `deploy/README.md` (AD-089) contém `SMTP_PASS` e `GOOGLE_CLIENT_SECRET` ao lado dos seis segredos de antes (door 6, AD-112)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "secret_custody_list_includes_smtp_pass_and_google_secret"`

### S10 - Montagem, regressão e stack · ~10 files · ~40 KB · ~10k

**C94** - O documento OpenAPI tem as oito rotas novas de `/api/leads*` com os métodos da `Surface`; os corpos de `POST /api/leads`, `POST /api/leads/confirm` e `PATCH /api/leads/:id` vêm dos schemas de `packages/contracts`; o corpo de `POST /api/students` declara `leadId` opcional
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "request_bodies_come_from_contract_schemas"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "lead_routes_listed_with_surface_methods"`

**C95** - A guarda declara `@Public()` exatamente nas seis rotas públicas (`options`, `POST /api/leads`, `confirm`, `start`, `callback`, `profile`) e `@Roles('admin','reception','hr_finance')` nas duas da equipe; a lista de rotas que respondem sem sessão passa a ter as de antes mais essas seis e nenhuma outra (AD-022)
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "only_listed_routes_answer_without_session"`

**C96** - `admin` sem 2FA ativo recebe `403` com `two_factor_enrollment_required` em `GET /api/leads` e `PATCH /api/leads/:id`, e não nas seis públicas
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C97** - `PATCH /api/leads/:id` sem `Origin` da origem responde `403` `csrf_rejected` (as três escritas novas sob a checagem de origem, com a C33)
Proof: `pnpm --filter "./apps/api" exec vitest run test/csrf.test.ts -t "lead_patch_under_origin_check"`

**C98** - Corpo de `POST /api/leads` que não é JSON responde `400` `bad_request`; corpo de 1 MB responde `413` como as demais rotas; `name` com substituto UTF-16 solto responde `422` sem `500` (o nome não entra no `diff`, mas entra no `jsonb` do e-mail capturado e da linha) (hostile input)
Proof: `pnpm --filter "./apps/api" exec vitest run test/hostile-input.test.ts -t "lead_create_hostile_bodies"`

**C99** - A guarda de `tests/repo/identidade.test.ts` sobre `apps/web/src/app/page.tsx` (sem `/api/` nem `fetchApi`) passa sem edição, e `SITE.plans.items[0].cta.href` é `/matricula` (AD-117, Impact "web")
Proof: `pnpm --filter "./tests/repo" exec vitest run identidade.test.ts -t "landing_page_imports_only_session_from_lib"`
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "plans_cta_points_to_matricula"`

**C100** - A C39 da `motion` (`motion.spec.ts`, baseline em `fixtures/motion-baseline`) passa sem regravar o baseline depois da troca do `href` (Impact "comportamento existente")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/motion.spec.ts -g "C39"`

**C101** - `contracts.test.ts` e `audit.spec.ts` contam 47 ações em todos os pontos que contavam 43, e `ACTION_LABELS` tem um rótulo para cada uma (o typecheck do web passa) (Impact "contrato")
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_action_count_is_forty_seven"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "action_filter_lists_all_actions"`

**C102** - `students.spec.ts` (o formulário de aluno de antes) passa sem edição de asserção, e `/students/new` sem `lead` não chama `GET /api/leads` (AC 46 na tela)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts -g "new_student_without_lead_does_not_read_leads"`

**C103** - O `id_token` é aceito por `iss` em exatamente dois valores; a validação é uma função pura testada sem HTTP sobre a tabela de doze linhas: dois `iss` aceitos, dois recusados (`https://evil.example`, `""`), `aud` igual e diferente, `aud` como lista contendo o cliente e não contendo, `exp` um segundo no futuro e um no passado, `email_verified` `true`, `false` e ausente (door 7, Test policy)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-google.test.ts -t "id_token_claims_table_twelve_rows"`

**C104** - A assinatura dos cookies é uma função pura testada sem HTTP: assina e confere o mesmo valor; recusa um caractere trocado no valor, na assinatura, assinatura com outro `AUTH_SECRET` e cookie vencido por um segundo; aceita o cookie um segundo antes de vencer (door 7, L-019)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-google.test.ts -t "signed_cookie_table_six_rows"`

**C105** - A contagem do limite é testada no próprio módulo sobre `lead_throttles` real, sem HTTP: 5 e 3 aceitas e a seguinte recusada para as duas chaves, a janela de 60 minutos nas duas bordas (59:59 conta, 60:01 não), e o `retryAfter` igual ao esperado escrito à mão (door 4, Test policy)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-throttle.test.ts -t "throttle_module_bounds_and_window_edges"`

**C106** - A decisão de reenvio é uma tabela testada no serviço com banco real, uma linha por situação do e-mail: nenhum interessado, `new` não confirmado, `contacted` não confirmado, `new` confirmado, `contacted` confirmado, `converted`, `discarded`, aluno sem interessado - cada uma com o efeito esperado (linha nova, mesma linha atualizada com token e e-mail, ou nada) escrito à mão (AC 6 a AC 8, Test policy)
Proof: `pnpm --filter "./apps/api" exec vitest run test/leads-create.test.ts -t "resend_decision_table_eight_rows"`

**C107** - Na stack do compose, sem `SMTP_HOST`: abrir `/` pelo `web` real, seguir "Matricule-se", enviar o formulário, ler o link no log da `api`, abrir a página de confirmação, clicar, entrar como recepção e ver o interessado em `/leads` com "E-mail confirmado" "Sim"; o `psql` mostra a linha `new` com `email_verified_at` preenchido e duas linhas da trilha (`lead.created` e `lead.confirmed`)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "lead_submitted_confirmed_and_listed_through_real_stack"`

**C108** - Os 47 rótulos de ação e a ordem do filtro de `/audit` não quebram as provas existentes da `auditoria` que fixam as 43 primeiras posições: as 43 primeiras seguem na ordem e com o texto de antes (Impact "contrato")
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "first_forty_three_actions_unchanged"`

## Coverage

Uma linha para cada rota da `Surface`, com os status como membros; depois perfis, doors, `Relations`,
os conjuntos enumerados nos critérios e nas Assumptions, e as montagens.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/leads/options` statuses (1) | 200 C23, C35, C36 | - |
| `POST /api/leads` statuses (3) | 202 C11, C40 · 422 C13, C14, C15 · 429 C29, C30 | - |
| `POST /api/leads/confirm` statuses (2) | 200 C24, C25 · 422 C26, C27 | - |
| `GET /api/leads/google/start` statuses (2) | 302 C35 · 404 C36 | - |
| `GET /api/leads/google/callback` statuses (2) | 302 C37, C38 · 404 C36 | - |
| `GET /api/leads/google/profile` statuses (2) | 200 C39 · 404 C36, C39 | - |
| `GET /api/leads` statuses (4) | 200 C43, C44 · 401 C49 · 403 C49 · 422 C44 | - |
| `PATCH /api/leads/:id` statuses (6) | 200 C45 · 401 C49 · 403 C49 · 404 C50 · 409 C47, C48 · 422 C46 | - |
| `POST /api/students` com `leadId`, status novos ou que mudam (3) | 201 C51 · 409 `lead_converted` C52, C53 · 422 `leadId` C52 | - |
| status `500` por escrita (4) | `POST /api/leads` C85 · `confirm` C85 · `PATCH` C85 · conversão C85 | - |
| `403 csrf_rejected` nas escritas novas (3) | `POST /api/leads` C33 · `confirm` C33 · `PATCH` C97 | - |
| códigos de `409` (2) | `lead_converted` C47, C52, C53 · `lead_email_open` C48 | - |
| quem lê e marca, por perfil (4) | `admin` C43, C45 · `reception` C43, C45 · `hr_finance` C43, C45 · `instructor` C49 | - |
| quem converte, por perfil (3) | `admin` C51 · `hr_finance` C51 · `reception` C56 | - |
| rotas públicas (6) | `options` C23 · `POST` C11 · `confirm` C24 · `start` C35 · `callback` C37 · `profile` C39; todas juntas C95 | - |
| rotas da equipe sem sessão (2) | `GET` C49 · `PATCH` C49 | - |
| rotas da equipe bloqueadas ao `admin` sem 2FA (2) | `GET /api/leads` C96 · `PATCH /api/leads/:id` C96 | - |
| rotas no OpenAPI (8) | C94, table-driven over all 8 | - |
| one-way doors (11) | door 1 C1, C2, C3, C4 · door 2 C5, C12, C26 · door 3 C77 · door 4 C29, C32, C105 · door 5 C21, C22, C68, C92 · door 6 C9, C10, C91, C93 · door 7 C35, C37, C38, C103, C104 · door 8 C7, C80 · door 9 C51, C53, C54 · door 10 C86, C87 · door 11 C69, C70 | - |
| relações de `Relations` (3) | interessado e links C5, C12 · termo aceito C2, C11 · aluno e interessado C3, C51 | - |
| one-way constraints de `Relations` (6) | um aberto por e-mail C4, C19 · quatro situações C2 · `converted` sse aluno C3 · termo `data_processing` existente C2 · token só hash, 24 h, uso único C12, C26, C27 · cascata dos tokens C5, C86 | - |
| valores de `status` no banco (8) | `new` C2 · `contacted` C2 · `converted` C2, C3 · `discarded` C2 · `New` C2 · `novo` C2 · `lead` C2 · cadeia vazia C2 | - |
| valores de `source` no banco (5) | `form` C2 · `google` C2 · `Google` C2 · `site` C2 · cadeia vazia C2 | - |
| transições do `PATCH` (5) | C45, table-driven over all 5 | - |
| transições recusadas (3) | para `converted` C46 · a partir de `converted` C47 · reabrir com aberto do mesmo e-mail C48 | - |
| situação do e-mail no reenvio (8) | C106, table-driven over all 8; pela fronteira: nenhum C11 · `new` não confirmado C16 · `contacted` não confirmado C16 · confirmado C17 · `converted` C18 · `discarded` C18 · aluno C18 | - |
| casos da resposta uniforme (5) | C34, table-driven over all 5 | - |
| campos recusados no envio (4 campos) | `name` C13 · `email` C13 · `phone` C13 · `adult` C14 · `termVersion` C15 | - |
| tokens recusados (7) | ausente C26 · vazio C26 · `abc` C26 · desconhecido C26 · vencido C26 · interessado apagado C26 · usado de não confirmado C27 | - |
| falhas do callback do Google (10) | C38, table-driven over all 10 | - |
| claims do `id_token` (12 linhas) | C103, table-driven over all 12 | - |
| cookie assinado (6 linhas) | C104, table-driven over all 6 | - |
| limites do formulário (4) | IP 5 C29, C105 · IP 6 C29 · e-mail 3 C30, C105 · e-mail 4 C30 | - |
| janela de uma hora (2 bordas) | 59 min C29, C105 · 61 min C29, C105 | - |
| idades da retenção (6) | C86, table-driven over all 6 | - |
| variáveis do ambiente (8) | `SMTP_HOST` C9, C10, C90 · `SMTP_PORT` C9, C10 · `SMTP_SECURE` C9 · `SMTP_USER` C10 · `SMTP_PASS` C10 · `MAIL_FROM` C10, C90 · `GOOGLE_CLIENT_ID` C10 · `GOOGLE_CLIENT_SECRET` C10 | - |
| recusas do ambiente (7) | C10, table-driven over all 7 | - |
| transportes de e-mail (3) | SMTP com `AUTH` C68 · SMTP sem `AUTH` C68 · log C22 | - |
| ações novas da trilha (4) | `lead.created` C80 · `lead.confirmed` C81 · `lead.status_changed` C82 · `lead.purged` C86 | - |
| desfechos que não gravam trilha (6 grupos) | C83, table-driven over all 6 | - |
| telas (5) | `/matricula` C71 a C76, C79 · `/matricula/confirmar` C77 · `/matricula/enviado` C73 · `/leads` C58 a C67 · `/audit` C88 | - |
| estados de `/leads` além do carregando, que é existing pela AD-101 (3) | vazio C61 · erro C62 · não autorizado C63 | - |
| botões de linha de `/leads` por situação (4) | `new` C64 · `contacted` C64 · `discarded` C64 · `converted` C64 | - |
| rótulos de `/leads` (10) | "Formulário" C60 · "Google" C60 · "Sim" C60 · "Não" C60 · "Novo" C60 · "Contatado" C60 · "Matriculado" C60 · "Descartado" C60 · data em São Paulo C60 · opções do filtro C58 | - |
| mensagens de `/matricula*` (6) | pendente C73 · confirmado C73, C77 · `429` C74 · Google erro C76 · link inválido C77 · menor (da API) C14 | - |
| startup config: `MailService` (2 assemblies) | montagem da API C89, C107 · montagem dos testes C11, C68 | - |
| startup config: temporizador de retenção (2 assemblies) | subida da API C87 · stack C107 | - |
| startup config: rotas Google (2 assemblies) | com as variáveis C35 · sem C36, C89 | - |

- Claims naming a status code, route or response shape: C11 a C56, C80 a C87, C94 a C98 - each has a
  proof that crosses the HTTP boundary; C103 a C106 are the same rules at their own layer, and do not
  substitute for the boundary proofs
- Nenhuma prova de tela contra a `FakeApi` afirma linha de auditoria; a trilha das telas é a da C107

## Test policy

As linhas de `features/planos-matriculas/checks.md` seguem valendo para o que esta feature reaproveita
(rota que decide, alcançada por HTTP, com corte por perfil e trilha; restrição do banco; tela contra a
`FakeApi`; stack por `psql`). Três casos que lá não existiam ganham linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decisão sobre entrada de terceiro, pura (claims do `id_token`, assinatura de cookie) | uma no próprio nível, sem HTTP, **e** uma na fronteira | no próprio nível, uma linha asserida por linha da tabela (12 claims, 6 cookies); na fronteira, os dez desfechos do callback. A fronteira passa por um caminho de cada tabela e não a substitui |
| Contagem em janela sobre o banco (limite do formulário) | uma no módulo com banco real **e** uma na fronteira | as duas chaves nos dois lados do limite e a janela nas duas bordas; na fronteira, o `429` com `Retry-After` e a corrida |
| Efeito colateral depois do commit (envio de e-mail) | uma com transporte de captura e uma com servidor SMTP em processo | sucesso, falha e demora com o `202` mantido; o transporte real só para provar que as variáveis chegam ao protocolo |

Evidence (o código ainda não existe; a contagem vem do plano):

- interessados: 8 situações de reenvio, 14 recusas de campo, 7 tokens recusados, 5 transições e 3 recusadas,
  6 idades de retenção (C11 a C56, C86) -> decide
- Google: 10 desfechos de callback, 12 linhas de claims, 6 de cookie (C35 a C42, C103, C104) -> decide
- limite: 2 chaves, 2 bordas de contagem, 2 bordas de janela, 1 corrida (C29 a C32, C105) -> decide
- `MailService`: 3 transportes, 1 caminho de falha e 1 de demora (C21, C22, C68) -> decide pouco, mas é
  efeito fora da transação
- controllers novos: validam pelo schema e chamam o serviço -> instrumentação além dos `404`, que a C36 e
  a C50 provam
- closest analogue in the repo: `apps/api/src/auth/throttle.ts` com `apps/api/test/login.test.ts` (a
  contagem em janela por HTTP); `apps/api/test/photo-signer.test.ts` (assinatura pura em tabela, ao lado
  de `photos-urls.test.ts` na fronteira); `apps/api/test/privacy-retention.test.ts` (o temporizador)

Cost: 3 provas no próprio nível (C103, C104, C105) e 1 tabela de serviço (C106), um servidor SMTP em
processo numa prova (C68). Sem a primeira linha, a validação do `id_token` seria provada só pelos caminhos
que o callback percorre; sem a segunda, a janela seria provada só no instante em que o teste roda; sem a
terceira, a falha do e-mail seria indistinguível de nunca ter tentado. As linhas ficam neste arquivo, como
nas features anteriores, e não vão para um guia do repositório.

## Swept

- validation: C8, C13, C14, C15, C26, C44, C46, C98
- failure modes: C21, C54, C85, C87, C38
- idempotency: C16, C17, C25, C28 (confirmar duas vezes grava uma linha), C82 (`PATCH` sem mudança não grava), C53 (converter duas vezes cria um aluno)
- authorization: C33, C49, C56, C63, C95, C96, C97; existing - guarda global (AD-022) e checagem de origem (AD-020)
- concurrency: C19, C28, C31, C53
- data lifecycle: C5, C86, C87 - tokens em cascata, retenção de 7 e 90 dias; a anonimização de aluno não toca `leads` (C3: aluno não é apagado)
- dependency failure: C21 (SMTP fora ou lento), C38 (Google fora ou recusando), C62 (API fora na tela)
- state transitions: C45, C46, C47, C48, C51 - `new`, `contacted`, `discarded` entre si; `converted` só pela conversão e sem volta
- observability: C7, C80 a C88 - a trilha sem dado pessoal (C84); C21 e C22 - o log do e-mail sem endereço e o link só fora de produção

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado (KB de código e teste, dividido por quatro); os existentes medidos pela mesma ordem de grandeza da `planos-matriculas`. Código novo: S0 = 9k, S1 = 8k, S2 = 4k, S3 = 4k, S4 = 6k, S5 = 9k, S6 = 10k, S7 = 9k, S8 = 7k, S9 = 3k, S10 = 10k: 79k. Arquivos existentes que a feature edita ou lê como molde (cerca de 480 KB: `apps/api/src` de `auth`, `access`, `audit`, `students`, `privacy` e `env`; `packages/contracts/src` de `audit`, `person`, `students`; `schema.ts` e as migrações `0004` e `0011`; `contracts.test.ts`, `audit-auth.test.ts`, `login.test.ts`, `students-create`, `privacy-retention.test.ts`, `photo-signer.test.ts` e os apoios; `apps/web/src` de `proxy.ts`, `site-content.ts`, `shell.tsx`, `lib/audit.ts` e `students/new`; `audit.spec.ts`, `shell.spec.ts`, `landing.spec.ts`, `proxy.spec.ts`, `fake-api.ts`; `compose.test.ts`): 480 KB ÷ 4 = 120k. `plan.md` (48 KB, 12k) e este arquivo (64 KB, 16k): 28k. Total 79k + 120k + 28k = 227k, acima do orçamento de 150k
- Corte proposto, onde a superfície muda (a API pública, depois a API da equipe e as telas), sem dividir slice: batch A = S0 a S4 e S9 (banco, contrato, ambiente, `MailService`, criar, confirmar, limite, Google): código novo 9k + 8k + 4k + 4k + 6k + 3k = 34k, existentes 62k (`auth`, `access`, `env`, `audit`, contratos, migrações, `login.test.ts`, `contracts.test.ts`, `audit-auth.test.ts`, `env.test.ts`, `boot.test.ts`, `csrf.test.ts`, `photo-signer.test.ts`, apoios e `tests/repo`), documentos 28k = 124k; batch B = S5 a S8 e S10 (equipe, conversão, telas, trilha, retenção, montagem e stack): código novo 9k + 10k + 9k + 7k + 10k = 45k, existentes 70k (`students` da API e do web, `privacy-retention`, `proxy.ts`, `site-content.ts`, `shell.tsx`, `lib/audit.ts`, as suítes de tela e `compose.test.ts`, mais `contracts.test.ts` e `audit-auth.test.ts` relidos), documentos 28k = 143k. Nenhuma slice sozinha passa de 10k
- Ordem: S0 primeiro; no mesmo commit de `AUDIT_ACTIONS` entram os quatro rótulos de `ACTION_LABELS` e as contagens de 43 para 47 em `contracts.test.ts`, `audit-auth.test.ts` e `audit.spec.ts`, ou o typecheck do web reprova; no mesmo commit da `0012` entra a lista de tabelas de `migrate.test.ts`. Cada rota nova entra no commit que a cria nas listas de `openapi.test.ts`, `access.test.ts` e `enrollment.test.ts`. A C7 (segunda prova) fica com uma catraca das ações ainda sem rota no batch A (`lead.status_changed` e `lead.purged`), que o batch B esvazia
- Conferir antes de cada trecho: antes da S4, que o repasse de `/api/*` do web devolve os dois `Set-Cookie` e o `302` sem segui-lo (o código mostra `redirect: 'manual'` e cabeçalhos repassados); antes da S5, como `POST /api/students` trava e grava hoje, para a conversão entrar na mesma transação; antes da S7, se `SiteHeader` entra nas páginas `/matricula*`
- Mechanism: handoff - escolhido pelo usuário em 2026-10-22, antes da primeira linha de código: batch A (S0 a S4 e S9) e batch B (S5 a S8 e S10), em sequência e só na verde, cada um em sessão nova que lê este arquivo e o diff do que já entrou; o Verifier só roda depois do batch B. A alternativa recusada era `one builder` (uma sessão só, aceitando compactação a partir de cerca de 150k)
