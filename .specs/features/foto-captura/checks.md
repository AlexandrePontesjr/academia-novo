# Captura, recorte e troca da foto do aluno - checks

Profile: standard
Plan: `.specs/features/foto-captura/plan.md`

## Intent

65 checks in 7 slices (S0, as 5 do plano e S6 de contrato, montagem e stack) · 6 one-way doors · 1 open (a 3, HTTPS nos dispositivos da recepção, é do go-live e da `operacao`), of which 0 block the Build

O plano foi aprovado como está em 2026-10-05. As perguntas 1 e 2 ficaram no padrão recomendado: as
versões guardadas não aparecem em tela nem em rota nenhuma, e o expurgo roda num temporizador dentro
da API (door 4, AD-050).

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`,
`playwright test <arquivo> -g`). São criados no Build: `apps/api/test/env.test.ts`,
`photos-replace.test.ts` e `photos-purge.test.ts` (em `apps/api/test`), `photo-editor.spec.ts` e
`photo-camera.spec.ts` (em `apps/web/e2e`). Ganham casos: `packages/database/test/photos.test.ts`,
`contracts.test.ts`, `photos-audit.test.ts`, `boot.test.ts`, `openapi.test.ts`, `enrollment.test.ts`,
`audit.spec.ts`, `repo.test.ts` e `compose.test.ts`. As regras de `features/foto-pipeline/checks.md`
seguem valendo sem mudança: MinIO e Postgres reais por `testcontainers` (AD-012), o bucket lido pelo
cliente S3 do próprio teste, linha de foto lida por SQL como `to_jsonb(photos)`, `snapshotOf` (linhas
de `photos`, contagem de `audit_logs` e chaves do bucket) antes e depois de todo caso que não grava,
imagens nascidas de pixels dentro do teste, "vermelho" como R maior ou igual a 200 com G e B menores
ou iguais a 60 e "azul" o simétrico, `flakyStorage` para o armazenamento que falha, "exatamente uma
linha" como diferença de contagem, insert de `audit_logs` que falha por gatilho do próprio teste, e a
saída capturada em stdout, stderr e `console`. Regras próprias:

- A numeração acompanha o plano: de S1 a S5, **C(n) prova a AC (n - 4)** (C5 é a AC 1, C58 é a AC 54).
  S0 vem antes e S6 depois.
- `expires_at` e `is_current` são nomes fixados pela door 1 e as provas os leem por nome. "30 dias
  depois do instante da troca" é: o teste lê `now()` do banco antes (T0) e depois (T1) da requisição,
  e `expires_at` fica entre T0 + 30 dias e T1 + 30 dias. O relógio é o do banco, nunca o da máquina.
- "Versão vencida" é uma linha não corrente cujo `expires_at` o teste põe, por SQL, em
  `now() - interval '1 second'`; "não vencida" é `now() + interval '1 minute'`.
- "O expurgo executa" é: o teste chama uma vez, e espera terminar, a mesma função que o temporizador
  chama, por um acesso que `startApi` passa a devolver. Que o temporizador a chama é provado à parte
  (C22, C23), e nenhuma outra prova depende de esperar 60 minutos.
- O temporizador da C23 é o do teste (`vi.useFakeTimers`, só as funções de temporizador que o expurgo
  usa; `Date` e o resto do tempo correm).
- As provas de tela usam `FakeApi`, que passa a responder `PUT /api/students/:id/photo` e a guardar os
  bytes de cada parte do multipart. O teste decodifica o JPEG recebido por conta própria (no navegador
  do teste, com `createImageBitmap`, ou por uma biblioteca de imagem do próprio teste), nunca pelo
  código do editor: o oráculo é o enunciado do check. "Pixel a 25% da largura" é o da coluna
  `floor(largura × 0,25)`, na linha do meio; "a 25% da altura" é o da linha `floor(altura × 0,25)`, na
  coluna do meio.
- "Requisição de foto" é qualquer requisição, de qualquer método, a `/api/students/<id>/photo`
  registrada pela `FakeApi`.
- "O quadro de recorte" é o elemento que delimita a região que será salva; o seletor fica num único
  ponto do apoio do teste, e a proporção é lida do `getBoundingClientRect` (largura ÷ altura entre
  0,74 e 0,76).
- A câmera das provas de tela tem duas formas. A imagem ao vivo, a captura e o envio (C51, C53, C44,
  C57) usam a câmera falsa do Chromium, com a permissão concedida na configuração do Playwright. Os
  estados que a câmera falsa não produz (pedido pendente, permissão negada, nenhuma câmera, contexto
  inseguro, duas câmeras) são produzidos por um `page.addInitScript` que troca
  `navigator.mediaDevices` antes de a página carregar. Nos dois casos um invólucro do teste em torno de
  `getUserMedia` registra as restrições pedidas e cada trilha entregue.

### S0 - O prazo na tabela, o vocabulário de auditoria e a variável de retenção, antes de qualquer rota · ~9 files · ~14 KB · ~4k

**C1** - Depois de `pnpm db:migrate` num banco vazio, a restrição `photos_expiry_matches_current` aceita uma linha corrente com `expires_at` nulo e uma não corrente com `expires_at` preenchido, e recusa por violação de `CHECK` com esse nome uma linha corrente com `expires_at` preenchido e uma não corrente com `expires_at` nulo, tanto no `INSERT` quanto no `UPDATE` que tira `is_current` sem dar prazo (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/photos.test.ts -t "expiry_check_ties_expires_at_to_not_current_four_combinations"`

**C2** - Aplicadas as migrações até a `0005`, inseridas duas linhas correntes em `photos` e só então aplicada a `0006`, a migração termina sem erro, as duas linhas continuam correntes com `expires_at` nulo e os demais valores iguais, `photos` tem as colunas de antes mais `expires_at` (`timestamptz`, anulável) e o conjunto de tabelas do banco é o de antes (door 1, Impact "stored data")
Proof: `pnpm --filter "./packages/database" exec vitest run test/photos.test.ts -t "migration_0006_adds_only_nullable_expires_at_and_keeps_existing_rows_current"`

**C3** - `AUDIT_ACTIONS` em `packages/contracts` tem vinte valores: os dezoito de antes, na ordem de antes, seguidos de `student.photo_replaced` e `student.photo_version_purged`, nessa ordem (door 3, AD-025)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_replace_and_purge_in_order"`

**C4** - `loadEnv`, com as variáveis obrigatórias válidas, devolve `PHOTO_VERSION_RETENTION_DAYS` igual ao número `30` quando a variável está ausente, e iguais aos números `1`, `7` e `365` para `1`, `7` e `365`; para `0`, `366`, `1.5`, `abc` e `-1` lança `EnvError` cujo `invalid` contém `PHOTO_VERSION_RETENTION_DAYS` e cuja mensagem não contém o valor recusado (door 5, AD-015)
Proof: `pnpm --filter "./apps/api" exec vitest run test/env.test.ts -t "retention_days_default_30_bounds_1_and_365_and_five_rejected_values"`

### S1 - Trocar a foto guardando a anterior · ~7 files · ~25 KB · ~6k

**C5** - `PUT /api/students/:id/photo` de `admin` e de `reception`, com a parte `file` de um JPEG de 800×1000 sobre um aluno com foto corrente de `version` igual a `1`, responde `201` nos dois casos com exatamente as chaves `id`, `version` e `createdAt`, `version` igual a `2`, `createdAt` um instante ISO 8601 e `id` igual ao da linha de `is_current` verdadeiro lida por SQL e diferente do `id` da foto anterior (AC 1, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "replace_201_by_admin_and_reception_version_2"`

**C6** - Depois do `201` de uma troca numa API sem `PHOTO_VERSION_RETENTION_DAYS`, o aluno tem duas linhas em `photos`: a anterior com `is_current` falso e `expires_at` entre T0 + 30 dias e T1 + 30 dias, e a nova com `is_current` verdadeiro e `expires_at` nulo, a única corrente; depois de uma segunda troca, a `version` nova é `3`, a linha de `version` `2` ganha prazo e a de `version` `1` continua com o mesmo `expires_at` de antes, byte a byte (AC 2, door 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "previous_row_kept_with_expiry_30_days_and_new_one_is_the_only_current"`

**C7** - Depois do `201` de uma troca, o prefixo `photos/main/<studentId>/` do bucket tem exatamente seis chaves: as três do `photoId` anterior, cada objeto com o mesmo SHA-256 de antes da troca, e `thumb.webp`, `medium.webp` e `large.webp` sob o `photoId` novo (AC 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "six_objects_after_replace_three_old_untouched_three_new"`

**C8** - Depois de uma troca, `GET /api/students/:id/photo` (sem `variant` e com `variant=thumb`), `photoUrl` de `GET /api/students/:id` e `photoUrl` do item do aluno em `GET /api/students` trazem a URL assinada com o `photoId` da foto nova, e abrir a de `medium` devolve bytes iguais aos do objeto `medium` novo; a URL assinada da foto anterior, emitida antes da troca, continua respondendo `200` com os bytes do objeto anterior enquanto `exp` não passa (AC 4, Impact "comportamento existente")
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "every_read_route_signs_the_new_photo_and_old_url_serves_until_exp"`

**C9** - `PUT /api/students/:id/photo` sobre um aluno que nunca teve foto, e sobre um aluno cuja foto foi removida por `DELETE`, responde `201` com `version` igual a `1` nos dois casos; o aluno fica com uma linha, corrente e com `expires_at` nulo, e três objetos no prefixo (AC 5, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "put_without_current_photo_creates_version_1"`

**C10** - Sobre um aluno com foto corrente, `PUT /api/students/:id/photo` responde com o mesmo status e o mesmo `code` do `POST` em cada um dos nove casos, e em todos o `snapshotOf` de depois é igual ao de antes: um texto enviado como `image/jpeg` e um GIF (`415 unsupported_media_type`, AC 9); corpo `application/json` (`415`, AC 10); parte `file` de 5 242 881 bytes (`413 payload_too_large`, AC 11); multipart sem parte `file` e com duas partes `file` (`422 validation_failed` com um item de `path` igual a `file`, AC 12); PNG de 299×400 (`422`, AC 13); PNG de 3015×13267 (`422`, AC 14); JPEG truncado na metade (`422`, AC 15). A parte `file` de exatamente 5 242 880 bytes responde `201` (AC 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "nine_rejected_files_same_status_and_code_as_post_and_nothing_changes"`

**C11** - Depois do `201` de um `PUT`, os três objetos novos são WebP de 96×128, 240×320 e 600×800 (AC 16); um PNG de 800×800 de metade esquerda vermelha e direita azul gera uma `large` vermelha a 25% da largura e azul a 75% (AC 17); um JPEG de 400×300 com orientação EXIF 6, de metade superior vermelha e inferior azul, gera uma `large` de metade direita vermelha e esquerda azul (AC 18); um JPEG com GPS e a marca `CAMERA-SECRETA-77` gera variantes sem bloco EXIF e sem esses bytes (AC 19); enviado `foto-original-unica.jpg`, nenhuma chave do bucket contém esse nome e nenhum objeto tem o SHA-256 dos bytes enviados (AC 20); e, enviado com o nome `../../etc/passwd.jpg`, toda chave nova casa `^photos/main/<studentId>/<photoId>/(thumb|medium|large)\.webp$` (AC 21) (AC 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "put_runs_the_same_variant_pipeline_six_properties"`

**C12** - `PUT /api/students/:id/photo` com `:id` igual a `abc` e com um `uuid` de aluno nenhum responde, nos dois casos, `404` com `code` igual a `not_found`, e o `snapshotOf` de depois é igual ao de antes (AC 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "put_404_for_bad_and_unknown_id_writes_nothing"`

**C13** - `PUT /api/students/:id/photo` de `hr_finance` e de `instructor`, sobre um aluno com foto corrente, responde nos dois casos `403` com `code` igual a `forbidden`, e o `snapshotOf` de depois é igual ao de antes (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "hr_finance_and_instructor_403_on_put"`

**C14** - `PUT /api/students/:id/photo` chamado sem cookie responde `401` com `code` igual a `unauthorized` (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "put_401_without_session"`

**C15** - Com o armazenamento falhando na escrita de `thumb`, de `medium` e de `large` (um caso por variante), e com o endpoint fora, `PUT /api/students/:id/photo` sobre um aluno com foto corrente responde `503` com `code` igual a `storage_unavailable`; a linha da foto anterior fica idêntica (corrente, `expires_at` nulo), a contagem de `photos` e de `audit_logs` não muda e o bucket tem as mesmas chaves de antes (AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "storage_failure_on_each_variant_and_down_503_keeps_previous_current"`

**C16** - Com o insert em `audit_logs` falhando depois de as três variantes da foto nova estarem gravadas, `PUT /api/students/:id/photo` sobre um aluno com foto corrente responde `500` com `code` igual a `internal_error`; as linhas de `photos` ficam idênticas (a anterior corrente e sem prazo), a contagem de `audit_logs` não muda e o bucket tem as mesmas chaves de antes (AC 12, AD-027)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "transaction_failure_after_upload_500_restores_rows_and_bucket"`

**C17** - Dez rodadas de dois `PUT /api/students/:id/photo` soltos juntos sobre um aluno com foto corrente de `version` `1` respondem `201` aos dois, com as `version` `2` e `3`; ao fim de cada rodada o aluno tem três linhas, exatamente uma corrente, a de `version` `3`, as outras duas com `expires_at` preenchido, e nove chaves no prefixo. Cinco rodadas de dois `PUT` soltos juntos sobre um aluno sem foto respondem `201` aos dois, com as `version` `1` e `2`, deixam uma corrente, a de `version` `2`, e a de `version` `1` com `expires_at` preenchido (AC 13, door 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "concurrent_puts_both_201_distinct_versions_one_current"`

**C18** - Sobre um aluno `inactive` com foto e sobre um `suspended` com foto, `PUT /api/students/:id/photo` responde `201` com `version` igual a `2` nos dois casos (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "inactive_and_suspended_students_accept_replace"`

**C19** - `DELETE /api/students/:id/photo` sobre um aluno com uma foto corrente e uma versão guardada responde `204`; depois, o aluno não tem linha em `photos`, o prefixo dele não tem chave nenhuma (seis objetos a menos) e `audit_logs` ganhou exatamente uma linha, de `action` igual a `student.photo_removed` (AC 15)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "delete_removes_current_and_stored_version_with_one_audit_row"`

### S2 - A versão guardada some sozinha no prazo · ~7 files · ~32 KB · ~8k

**C20** - Com três versões vencidas (uma de um aluno, duas de outro), o expurgo executa e as três linhas saem de `photos` e as nove chaves delas saem do bucket (AC 16, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "purge_removes_expired_rows_and_their_objects"`

**C21** - O expurgo executa e mantém, com a linha idêntica e os três objetos de mesmo SHA-256: uma versão não vencida; uma foto corrente cujo `created_at` o teste pôs 400 dias no passado; e a foto corrente de um aluno que teve uma versão vencida removida na mesma execução (AC 17)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "purge_keeps_unexpired_version_and_every_current_photo"`

**C22** - Com uma versão vencida já no banco e os objetos dela no bucket, subir a API remove a linha e os três objetos sem que o teste envie requisição nenhuma, nas duas montagens: uma segunda API montada pelo `startApi` sobre o mesmo banco, e o `dist/main.js` iniciado como processo filho (AC 18, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "startup_purges_expired_version_without_any_request"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "real_process_purges_expired_version_on_startup"`

**C23** - Com o temporizador do teste e a API no ar, uma versão vencida criada depois da subida continua no banco com o temporizador adiantado 59 min 59 s, e sai (linha e objetos) com ele adiantado mais 1 s; uma segunda versão vencida sai depois de mais 60 minutos, inclusive quando a execução anterior falhou por armazenamento fora; e, depois de `close()` da API, `vi.getTimerCount()` é `0` (AC 19, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "purge_runs_every_60_minutes_survives_a_failed_run_and_stops_on_close"`

**C24** - Com o armazenamento respondendo `500` à remoção dos três objetos de uma versão vencida, e com ele respondendo `500` só à remoção de `large` (as outras duas saem), o expurgo executa e, nos dois casos, a linha de `photos` fica idêntica e a contagem de `audit_logs` não muda; com o armazenamento de volta, a execução seguinte remove a linha, não deixa chave da versão no bucket e grava uma linha de auditoria (AC 20)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "object_removal_failure_keeps_row_and_next_run_removes_it"`

**C25** - Dez rodadas de duas execuções do expurgo soltas juntas, uma em cada uma de duas APIs montadas sobre o mesmo banco e o mesmo bucket, com uma versão vencida: ao fim de cada rodada a linha saiu, as chaves saíram e `audit_logs` ganhou exatamente uma linha `student.photo_version_purged` daquele aluno (AC 21, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "two_concurrent_purges_remove_once_and_write_one_audit_row"`

**C26** - Com o armazenamento fora (endpoint sem ninguém ouvindo) e uma versão vencida, o expurgo executa sem lançar para quem o chama, a saída ganha uma linha JSON de `level` igual a `error` e `msg` igual a `photo purge failed`, a linha de `photos` fica como estava e, em seguida, `GET /health` e `GET /api/students/:id` de `reception` respondem (`503` e `200`); com o banco recusando conexão, o `dist/main.js` iniciado como processo filho escreve a mesma linha de log e continua respondendo `GET /health` (`503`) 2 s depois (AC 22)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "purge_failure_logs_error_and_api_keeps_answering"`
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "real_process_survives_purge_failure_with_database_down"`

**C27** - Uma execução do expurgo que remove três versões escreve exatamente uma linha de log de `msg` igual a `photo versions purged`, com `count` igual a `3`; uma execução sem nada a remover não escreve linha nenhuma com essa `msg` (AC 23, Observable)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "one_log_line_with_count_per_run_that_removed_and_none_otherwise"`

**C28** - Numa API montada com `PHOTO_VERSION_RETENTION_DAYS` igual a `7`, a `1` e a `365`, a foto trocada recebe `expires_at` entre T0 e T1 mais 7 dias, mais 1 dia e mais 365 dias; e uma versão guardada por uma API de 30 dias mantém o mesmo `expires_at` depois de uma segunda troca do mesmo aluno feita por uma API de 7 dias sobre o mesmo banco, cuja versão recebe 7 dias (AC 24, door 1, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-purge.test.ts -t "retention_days_7_1_and_365_set_expiry_only_for_later_replaces"`

**C29** - A API iniciada como processo com `PHOTO_VERSION_RETENTION_DAYS` igual a `0`, a `366`, a `1.5` e a `abc` sai com código 1 e imprime `PHOTO_VERSION_RETENTION_DAYS`; iniciada com os valores inválidos `36600077` e `valor-secreto-da-retencao`, sai com código 1 e a saída não contém o valor nem o de nenhuma outra variável; com `1` e com `365` sobe e responde `GET /health` (AC 25, AD-015)
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "retention_days_rejected_exits_1_naming_var_without_values"`

### S3 - A troca e o expurgo deixam rastro · ~4 files · ~10 KB · ~3k

**C30** - `PUT /api/students/:id/photo` que responde `201` sobre um aluno com foto corrente, de `admin` e de `reception`, grava exatamente uma linha em `audit_logs`, com `action` igual a `student.photo_replaced`, `user_id` igual ao id do autor, `entity` igual a `student`, `entity_id` igual ao id do aluno e `diff` nulo, e nenhuma linha `student.photo_uploaded`; enviado com `X-Forwarded-For: 198.51.100.1, 203.0.113.7`, a linha grava `ip` igual a `203.0.113.7` (AC 26, door 3, AD-028)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "replace_writes_one_photo_replaced_row_with_null_diff"`

**C31** - `PUT /api/students/:id/photo` que responde `201` sobre um aluno sem foto corrente grava exatamente uma linha, com `action` igual a `student.photo_uploaded`, `user_id` do autor, `entity` igual a `student`, `entity_id` igual ao id do aluno e `diff` nulo, e nenhuma linha `student.photo_replaced` (AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "put_without_current_photo_writes_one_photo_uploaded_row"`

**C32** - Um expurgo que remove três versões de dois alunos grava exatamente três linhas, cada uma com `action` igual a `student.photo_version_purged`, `entity` igual a `student`, `entity_id` igual ao id do aluno daquela versão, `diff` nulo e `user_id`, `ip` e `user_agent` nulos; com o insert em `audit_logs` falhando, o expurgo deixa a linha de `photos` da versão vencida e a contagem de `audit_logs` como estavam, e a execução seguinte, sem a falha, remove a linha e grava uma linha de auditoria (AC 28, AD-027)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "purge_writes_one_authorless_row_per_version_in_the_delete_transaction"`

**C33** - Um `PUT /api/students/:id/photo` que termina em `401`, `403`, `404`, `413`, `415`, `422`, `500` e `503` responde, em cada um dos oito casos, exatamente o status do caso e deixa a contagem de `audit_logs` igual à de antes (AC 29)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "eight_non_writing_put_outcomes_write_no_audit_row"`

**C34** - Percorridos a troca por `foto-original-unica.jpg` (com o marcador `CAMERA-SECRETA-77` dentro da imagem), um `PUT` recusado com `422`, um `PUT` que falha no armazenamento, um expurgo que remove uma versão e um expurgo que falha, o texto de todas as colunas de todas as linhas de `audit_logs` e todas as linhas de log não contêm o nome do arquivo enviado, a chave do objeto (`photos/main/`) nem o marcador (AC 30)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "file_name_key_and_content_never_reach_audit_or_log_on_replace_and_purge"`

**C35** - `/audit` exibe "Foto do aluno trocada" e "Versão anterior da foto excluída" na coluna "Ação" para linhas de `student.photo_replaced` e `student.photo_version_purged`; o filtro "Ação" oferece as vinte ações, as duas novas nas posições 19 e 20, nessa ordem; e a linha do expurgo, de `user`, `ip` e `userAgent` nulos, exibe "—" nas colunas "Usuário", "IP" e "Navegador" (AC 31, Observable)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "replace_and_purge_actions_labelled_and_filter_has_twenty"`

### S4 - Ajustar o enquadramento antes de enviar · ~8 files · ~49 KB · ~12k

**C36** - Para `admin` e para `reception`, a ficha de um aluno sem foto exibe a área "Arraste uma foto aqui ou escolha um arquivo" e o botão "Enviar foto", cujo campo de arquivo aceita exatamente `image/jpeg`, `image/png` e `image/webp`; escolher um arquivo e largar um arquivo na área abrem, cada um, um diálogo de nome acessível "Ajustar foto" com a imagem dentro de um quadro de recorte de proporção 3:4, e nenhuma requisição de foto chega à API (AC 32)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "choosing_or_dropping_opens_ajustar_foto_with_3_4_frame_and_sends_nothing"`

**C37** - Com uma imagem de 1800×2400, o diálogo tem o controle de nome acessível "Zoom", com mínimo `1`, máximo `3` e valor inicial `1`, e os botões "Girar à esquerda" e "Girar à direita"; depois de cada acionamento de um e de outro, o quadro de recorte continua em 3:4 (AC 33, door 6)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "zoom_1_to_3_and_two_rotate_buttons_keep_the_frame_3_4"`

**C38** - Escolhida uma imagem de 800×800 de metade esquerda vermelha e direita azul e acionado "Salvar foto" sem mexer em nada, a API recebe exatamente uma requisição de foto, `multipart/form-data`, com uma única parte, de nome `file` e nome de arquivo `foto.jpg`, cujos bytes começam por `FF D8 FF` e decodificam num JPEG de 600×800 pixels, vermelho a 25% da largura e azul a 75% (AC 34, Assumptions)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "untouched_save_sends_one_600x800_jpeg_file_part_red_left_blue_right"`

**C39** - Com a imagem da C38, "Girar à direita" uma vez e "Salvar foto" enviam um JPEG de 600×800 vermelho a 25% da altura e azul a 75%; "Girar à esquerda" uma vez, um JPEG de 600×800 azul a 25% da altura e vermelho a 75%; e "Girar à direita" duas vezes, um de 600×800 azul a 25% da largura e vermelho a 75% (AC 35, AC 33)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "rotation_right_left_and_twice_moves_the_colours_by_90_degrees"`

**C40** - Salvo sem mexer em nada, o JPEG enviado tem 1200×1600 para uma origem de 3000×4000 e para uma de 1203×1604, 1200×1600 para uma de 1200×1600, 900×1200 para uma de 900×1200 e 300×400 para uma de 300×400 (AC 36)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "output_capped_at_1200x1600_and_never_enlarged_five_sources"`

**C41** - Com o controle "Zoom" levado ao máximo que o diálogo permite e "Salvar foto" acionado, o JPEG enviado tem 300×400 para uma origem de 600×800, 300×400 para uma de 450×600, 300×400 para uma de 300×400 e 600×800 para uma de 1800×2400 (AC 37)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "zoom_stops_where_the_region_is_300x400_four_sources"`

**C42** - Para imagens de 299×400, 300×399, 399×299 e 200×200, a tela exibe "A foto precisa ter pelo menos 300×400 pixels." e não há botão "Salvar foto"; para uma de 300×400 a mensagem não aparece e o botão "Salvar foto" existe (AC 38)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "too_small_in_every_rotation_shows_message_without_save"`

**C43** - Para um arquivo de texto escolhido com o nome `foto.jpg` e o tipo `image/jpeg`, um PDF largado na área e um arquivo de bytes aleatórios escolhido com o nome `foto.png`, a tela exibe "Use um arquivo JPEG, PNG ou WebP.", não há quadro de recorte nem botão "Salvar foto", e nenhuma requisição de foto chega à API (AC 39)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "unreadable_file_shows_message_without_crop_frame_three_files"`

**C44** - "Salvar foto" envia exatamente uma requisição `POST /api/students/<id>/photo` e nenhum `PUT` quando o aluno não tem foto, e exatamente uma `PUT /api/students/<id>/photo` e nenhum `POST` quando tem, nos quatro casos: arquivo escolhido sem foto, arquivo escolhido por "Trocar foto", captura pela câmera sem foto e captura pela câmera com foto; em nenhum deles há outro diálogo entre "Salvar foto" e a requisição (AC 40, door 2)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "file_save_posts_without_photo_and_puts_with_photo"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-camera.spec.ts -g "camera_save_posts_without_photo_and_puts_with_photo"`

**C45** - Enquanto a API não responde ao envio, o botão do diálogo fica desabilitado com o texto "Enviando…" e não há botão habilitado de nome "Salvar foto" (AC 41)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "save_button_disabled_with_enviando_while_waiting"`

**C46** - Com a API respondendo `201` ao `POST`, o diálogo fecha e a ficha exibe a `img` de nome "Foto de Marina Duarte" com o `photoUrl` novo, sem a área de envio; com a API respondendo `201` ao `PUT`, o diálogo fecha e o `src` da `img` passa do `photoUrl` anterior ao novo (AC 42)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "successful_save_closes_the_dialog_and_shows_the_new_photo"`

**C47** - Com o "Zoom" em `2` e a API respondendo ao envio `413`, o diálogo exibe "A foto deve ter no máximo 5 MB."; `415`, "Use um arquivo JPEG, PNG ou WebP."; `422` com `errors` de `path` igual a `file` e `message` "A foto precisa ter pelo menos 300×400 pixels.", exatamente essa mensagem; `409`, "Este aluno já tem foto."; `503` e `500`, "Não foi possível enviar a foto. Tente novamente."; e, nos seis casos, o diálogo continua aberto com o quadro de recorte, o "Zoom" continua em `2`, "Salvar foto" volta a ficar habilitado e um segundo acionamento envia um JPEG das mesmas dimensões do primeiro (AC 43)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "six_save_errors_show_their_messages_and_keep_the_framing"`

**C48** - Acionar "Cancelar" e fechar o diálogo pela tecla Escape fecham o diálogo, nenhuma requisição de foto chega à API e a ficha continua como estava (a área de envio para o aluno sem foto, a `img` com o mesmo `src` para o aluno com foto); escolher de novo o mesmo arquivo depois de cancelar abre o diálogo outra vez (AC 44)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "cancel_and_escape_send_nothing_and_leave_the_ficha_as_it_was"`

**C49** - Para `admin` e para `reception`, a ficha de um aluno com foto exibe o botão "Trocar foto" e o botão "Remover foto", e não exibe a área "Arraste uma foto aqui ou escolha um arquivo"; "Trocar foto" abre a escolha de arquivo de um campo que aceita exatamente `image/jpeg`, `image/png` e `image/webp`, e o arquivo escolhido abre o diálogo "Ajustar foto" (AC 45, Assumptions)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-editor.spec.ts -g "trocar_foto_beside_remover_foto_opens_chooser_with_three_types"`

### S5 - Capturar pela câmera · ~4 files · ~24 KB · ~6k

**C50** - Para `admin` e para `reception`, a ficha de um aluno sem foto e a de um aluno com foto exibem o botão "Usar câmera", nos quatro casos (AC 46)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-camera.spec.ts -g "usar_camera_button_for_writers_with_and_without_photo"`

**C51** - Acionado "Usar câmera" com a câmera falsa do Chromium, `getUserMedia` é chamado uma vez, com `video` pedido e `audio` ausente ou `false`; o diálogo exibe um elemento `video` com `videoWidth` maior que zero, cuja fonte tem uma trilha de vídeo `live` e nenhuma de áudio, o texto "Enquadre o rosto e os ombros" e o botão "Capturar" (AC 47)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-camera.spec.ts -g "live_video_without_audio_with_framing_text_and_capturar"`

**C52** - Enquanto `getUserMedia` não resolve, o diálogo exibe "Abrindo câmera…" e não há botão "Capturar" (AC 48)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-camera.spec.ts -g "abrindo_camera_without_capturar_while_pending"`

**C53** - Acionado "Capturar", o diálogo exibe o quadro de recorte em 3:4, o "Zoom", os dois botões de giro e o botão "Tirar outra", e nenhuma requisição de foto chega à API; "Tirar outra" volta à imagem ao vivo com o botão "Capturar", ainda sem requisição; e capturar e acionar "Salvar foto" envia uma parte `file` que decodifica num JPEG de largura ÷ altura igual a 3:4 e largura igual à da maior região 3:4 do quadro do vídeo (`videoWidth` × `videoHeight` lidos pelo teste), limitada a 1200 (AC 49)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-camera.spec.ts -g "capture_goes_to_the_editor_and_tirar_outra_returns_to_live"`

**C54** - Com `getUserMedia` rejeitando com `NotAllowedError`, o diálogo exibe "Permita o uso da câmera no navegador ou envie um arquivo." e não há botão "Capturar"; fechado o diálogo, escolher um arquivo abre o "Ajustar foto" (AC 50)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-camera.spec.ts -g "denied_camera_shows_message_and_file_upload_still_opens_the_editor"`

**C55** - Com `getUserMedia` rejeitando com `NotFoundError`, e com `navigator.mediaDevices` indefinido (página fora de contexto seguro), o diálogo exibe nos dois casos "Nenhuma câmera disponível neste dispositivo. Envie um arquivo." e não há botão "Capturar" (AC 51)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-camera.spec.ts -g "no_camera_and_insecure_context_show_message_without_capturar"`

**C56** - Com duas câmeras em `enumerateDevices`, o diálogo exibe o botão "Trocar câmera"; acioná-lo chama `getUserMedia` com o `deviceId` da segunda câmera, e acioná-lo de novo, com o da primeira; com uma câmera só, o botão "Trocar câmera" não existe (AC 52)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-camera.spec.ts -g "trocar_camera_cycles_two_devices_and_is_absent_with_one"`

**C57** - Toda trilha entregue por `getUserMedia` tem `readyState` igual a `ended` depois de cada uma das quatro saídas da imagem ao vivo: "Capturar", "Cancelar", fechar pela tecla Escape e "Trocar câmera" (a trilha da câmera anterior); depois de "Tirar outra", a trilha nova está `live` e a anterior continua `ended` (AC 53)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-camera.spec.ts -g "every_video_track_ended_after_capture_cancel_escape_and_switch"`

**C58** - Para `hr_finance` e para `instructor`, a ficha de um aluno com foto exibe a foto e a de um sem foto exibe as iniciais, e nos quatro casos não há botão "Usar câmera", "Trocar foto", "Enviar foto" nem "Remover foto", nem a área de envio (AC 54)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photo-camera.spec.ts -g "read_only_profiles_have_no_camera_replace_or_upload_controls"`

### S6 - Contrato, montagem do processo real, stack e testes herdados · ~7 files · ~14 KB · ~4k

**C59** - No documento de `GET /api/openapi.json`, `/api/students/{id}/photo` traz `put` ao lado de `post`, `get` e `delete`; o `put` declara corpo `multipart/form-data` com a parte binária `file`, não declara corpo `application/json`, e a resposta `201` dele tem o mesmo schema da resposta `201` do `post` (AD-011, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "photo_put_is_multipart_with_the_post_response_schema"`

**C60** - Os corpos reais `201` de `PUT /api/students/:id/photo`, com e sem foto anterior, validam contra o schema de resposta de foto criada de `packages/contracts`, e os corpos reais `413`, `415`, `422` e `503` do `PUT` validam contra o schema de erro (AD-009, AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "photo_put_bodies_match_contract_schemas"`

**C61** - `admin` sem 2FA ativo recebe `403` com `code` igual a `two_factor_enrollment_required` em `PUT /api/students/:id/photo`, e a lista de rotas bloqueadas escrita no teste a inclui (Surface, `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C62** - `PUT /api/students/:id/photo` com `Origin` igual a `http://evil.example`, e sem `Origin` com `Sec-Fetch-Site: cross-site`, responde nos dois casos `403` com `code` igual a `csrf_rejected`, e o `snapshotOf` de depois é igual ao de antes (AD-020)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "foreign_origin_403_csrf_on_multipart_put"`

**C63** - Dez rodadas de um `PUT` e um `POST /api/students/:id/photo` soltos juntos sobre um aluno sem foto, e dez de um `PUT` e um `DELETE` soltos juntos sobre um aluno com foto: nenhuma resposta tem status `500` ou maior; o `PUT` responde `201`, o `POST` responde `201` ou `409` com `photo_exists` e o `DELETE` responde `204`; ao fim de cada rodada o aluno tem no máximo uma linha corrente, toda linha não corrente tem `expires_at`, e as chaves do prefixo são exatamente as três de cada linha que ficou (door 1, door 2; derivado, sem AC própria)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-replace.test.ts -t "put_racing_post_or_delete_never_5xx_and_rows_match_objects"`

**C64** - `.env.example` traz a linha comentada `# PHOTO_VERSION_RETENTION_DAYS=30`, e a lista de chaves obrigatórias do schema de ambiente da API não contém `PHOTO_VERSION_RETENTION_DAYS` (Impact "ambiente", Observable, AD-015)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "env_example_documents_optional_retention_days_commented_with_default"`

**C65** - Na stack de pé, sem `PHOTO_VERSION_RETENTION_DAYS` no ambiente, um usuário `reception` cria um aluno, envia uma foto por `POST` e a troca por `PUT /api/students/<id>/photo`, os dois na origem do container `web`, com `User-Agent` e `X-Forwarded-For` escolhidos: o `PUT` responde `201` com `version` igual a `2`; o banco da stack tem a linha anterior não corrente com `expires_at` entre 29 dias e 23 horas e 30 dias e 1 hora à frente do `now()` do banco, e a linha `student.photo_replaced` com o `ip` e o `user_agent` enviados. Posto o `expires_at` dela no passado por SQL e reiniciado o serviço `api`, em até 60 s a linha sai de `photos`, as três chaves dela saem do bucket da stack, a foto corrente continua sendo entregue pela URL assinada (`200`, `image/webp`) e o banco tem uma linha `student.photo_version_purged` com `user_id` nulo (AC 1, AC 2, AC 18, AC 26, AC 28, door 4, door 5, Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "photo_replaced_through_web_then_expired_version_purged_on_api_restart"`

## Coverage

Uma linha para a rota da `Surface`, com os status como membros, e uma por perfil; depois as doors, o
que `Relations` acrescenta e os conjuntos enumerados nos critérios, nas `Assumptions` e na `Observable`.

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `PUT /api/students/:id/photo` statuses (8) | 201 C5 · 401 C14 · 403 C13 · 404 C12 · 413 C10 · 415 C10 · 422 C10 · 503 C15 | - |
| `PUT /api/students/:id/photo`, status fora da `Surface` (1) | 500 C16 | - |
| `PUT /api/students/:id/photo` por perfil (4) | `admin` C5 · `reception` C5 · `hr_finance` C13 · `instructor` C13 | - |
| linha de erro comum da `auth-rbac` na rota nova (3) | `401 unauthorized` C14 · `403 csrf_rejected` C62 · `403 two_factor_enrollment_required` C61 | - |
| one-way doors (6) | door 1 C1, C6 · door 2 C5, C9 · door 3 C3, C30, C32 · door 4 C22, C23, C25 · door 5 C4, C28 · door 6 C37, C39 | - |
| relações de `Relations` (2) | uma foto corrente por aluno C6, C17 · versões guardadas, com prazo C6, C20 | - |
| one-way constraint nova de `Relations` (1) | prazo se e somente se não corrente C1 | - |
| restrições que já existiam e não mudam (2) | uma corrente por aluno sob concorrência C17 · `version` única por aluno sob concorrência C17 | - |
| combinações de `is_current` e `expires_at` (4) | corrente sem prazo aceita C1 · corrente com prazo recusada C1 · guardada com prazo aceita C1 · guardada sem prazo recusada C1 | - |
| o que a migração `0006` deixa no banco (3) | só a coluna `expires_at` nova C2 · linhas anteriores seguem correntes e sem prazo C2 · mesmo conjunto de tabelas C2 | - |
| vocabulário de `AUDIT_ACTIONS` (20) | C3, table-driven over all 20: os dezoito de antes e as duas novas | - |
| `PHOTO_VERSION_RETENTION_DAYS` no schema de ambiente (9) | ausente dá 30 C4 · `1` C4 · `7` C4 · `365` C4 · `0` C4 · `366` C4 · `1.5` C4 · `abc` C4 · `-1` C4 | - |
| `PHOTO_VERSION_RETENTION_DAYS` na subida do processo (8) | `0` C29 · `366` C29 · `1.5` C29 · `abc` C29 · valor longo fora da saída C29 · texto fora da saída C29 · `1` sobe C29 · `365` sobe C29 | - |
| prazo gravado na troca, por retenção (4) | padrão 30 C6 · 7 C28 · 1 C28 · 365 C28 | - |
| mudança da retenção só vale para as trocas seguintes (1) | C28 | - |
| efeitos da troca (5) | anterior deixa de ser corrente C6 · anterior ganha `expires_at` C6 · nova é a única corrente C6 · versão mais antiga não é recarimbada C6 · seis objetos, três intactos C7 | - |
| leituras depois da troca (4) | `GET` da URL C8 · `photoUrl` da ficha C8 · `photoUrl` da lista C8 · URL anterior até `exp` C8 | - |
| `PUT` sem foto corrente (2) | aluno que nunca teve C9 · aluno com a foto removida C9 | - |
| recusas do `POST` herdadas pelo `PUT`, uma por AC da `foto-pipeline` (7) | AC 9 conteúdo C10 · AC 10 corpo que não é multipart C10 · AC 11 tamanho C10 · AC 12 parte `file` C10 · AC 13 dimensão C10 · AC 14 resolução C10 · AC 15 ilegível C10 | - |
| tamanho do arquivo no `PUT` (2 edges) | 5 242 880 C10 · 5 242 881 C10 | - |
| variantes herdadas pelo `PUT`, uma por AC da `foto-pipeline` (6) | AC 16 tamanhos C11 · AC 17 recorte central C11 · AC 18 orientação C11 · AC 19 sem EXIF C11 · AC 20 sem original C11 · AC 21 chave C11 | - |
| `id` inválido no `PUT` (2) | `abc` C12 · `uuid` sem aluno C12 | - |
| falha de escrita no armazenamento durante a troca (4) | `thumb` C15 · `medium` C15 · `large` C15 · endpoint fora C15 | - |
| falha da transação da troca depois dos objetos (1) | insert de auditoria que falha C16 | - |
| pares concorrentes sobre o mesmo aluno (4) | dois `PUT` com foto C17 · dois `PUT` sem foto C17 · `PUT` e `POST` C63 · `PUT` e `DELETE` C63 | - |
| situação do aluno que aceita a troca (2) | `inactive` C18 · `suspended` C18 | - |
| `DELETE` com versão guardada (3) | duas linhas saem C19 · seis objetos saem C19 · uma linha `student.photo_removed` C19 | - |
| o que o expurgo decide por linha (5) | vencida sai C20 · duas vencidas do mesmo aluno saem C20 · não vencida fica C21 · corrente antiga fica C21 · corrente de aluno expurgado fica C21 | - |
| prazo (2 edges) | `now() - 1 s` sai C20 · `now() + 1 min` fica C21 | - |
| quando o expurgo executa (3) | na subida C22 · a cada 60 minutos C23 · para no fechamento da API C23 | - |
| intervalo do temporizador (2 edges) | 59 min 59 s não executa C23 · 60 min executa C23 | - |
| falha ao apagar objeto no expurgo (3) | os três falham C24 · só `large` falha C24 · a execução seguinte remove C24 | - |
| duas execuções sobre a mesma versão (1) | C25 | - |
| dependência fora durante o expurgo (2) | armazenamento C26 · banco C26 | - |
| o que sobrevive a um expurgo que falha (3) | a API responde C26 · o processo real responde C26 · a execução seguinte acontece C23 | - |
| linhas de log do expurgo (3) | `photo versions purged` com `count` C27 · nenhuma quando nada saiu C27 · `photo purge failed` em `error` C26 | - |
| quem grava cada ação de auditoria (3) | `student.photo_replaced` C30 · `student.photo_uploaded` pelo `PUT` C31 · `student.photo_version_purged` C32 | - |
| campos nulos da linha do expurgo (4) | `user_id` C32 · `ip` C32 · `user_agent` C32 · `diff` C32 | - |
| ações desfeitas quando o insert de auditoria falha (2) | troca C16 · exclusão da linha no expurgo C32 | - |
| status do `PUT` que não gravam linha (8) | C33, table-driven over all 8 | - |
| valores fora de `audit_logs` e do log (3) | nome do arquivo C34 · chave do objeto C34 · conteúdo da imagem C34 | - |
| ações novas em `/audit` (2) | "Foto do aluno trocada" C35 · "Versão anterior da foto excluída" C35 | - |
| filtro "Ação" (20) | C35, table-driven over all 20: os dezoito de antes e as duas novas, posições 19 e 20 | - |
| linha sem autor em `/audit` (3) | "Usuário" C35 · "IP" C35 · "Navegador" C35 | - |
| vias que abrem o ajuste (4) | escolher o arquivo C36 · largar o arquivo C36 · "Trocar foto" C49 · captura pela câmera C53 | - |
| controles do diálogo (3) | "Zoom" de 1 a 3 C37 · "Girar à esquerda" C37, C39 · "Girar à direita" C37, C39 | - |
| giro da imagem salva (4) | nenhum C38 · direita uma vez C39 · esquerda uma vez C39 · direita duas vezes C39 | - |
| tamanho do JPEG enviado (5 edges) | 3000×4000 C40 · 1203×1604 C40 · 1200×1600 C40 · 900×1200 C40 · 300×400 C40 | - |
| limite do zoom por origem (4) | 600×800 C41 · 450×600 C41 · 300×400 C41 · 1800×2400 chega a 3 C41 | - |
| imagem pequena demais (5 edges) | 299×400 C42 · 300×399 C42 · 399×299 C42 · 200×200 C42 · 300×400 aceita C42 | - |
| arquivo que o navegador não lê (3) | texto como `foto.jpg` C43 · PDF largado C43 · bytes aleatórios como `foto.png` C43 | - |
| método do envio (4) | arquivo sem foto `POST` C44 · arquivo com foto `PUT` C44 · câmera sem foto `POST` C44 · câmera com foto `PUT` C44 | - |
| mensagens do envio no diálogo (6) | `413` C47 · `415` C47 · `422` C47 · `409` C47 · `503` C47 · outro erro C47 | - |
| o que o erro do envio preserva (3) | diálogo e quadro C47 · "Zoom" C47 · reenvio das mesmas dimensões C47 | - |
| fechar sem enviar (2) | "Cancelar" C48 · Escape C48 | - |
| tipos aceitos pelo campo de arquivo (3) | `image/jpeg` C36, C49 · `image/png` C36, C49 · `image/webp` C36, C49 | - |
| estados da câmera (5) | abrindo C52 · ao vivo C51 · negada C54 · nenhuma câmera C55 · contexto inseguro C55 | - |
| número de câmeras (2) | uma, sem "Trocar câmera" C56 · duas, alterna e volta C56 | - |
| saídas da imagem ao vivo que encerram as trilhas (4) | "Capturar" C57 · "Cancelar" C57 · Escape C57 · "Trocar câmera" C57 | - |
| controles de escrita da foto por perfil (4) | `admin` C36, C49, C50 · `reception` C36, C49, C50 · `hr_finance` C58 · `instructor` C58 | - |
| estados do bloco de foto em `Observable` (2) | vazio C36, C50 · sem permissão C58 | - |
| estados do diálogo em `Observable` (4) | carregando C45, C52 · erro C42, C43, C47, C54, C55 · sem permissão C58 · densidade e ordem C37, C51 | - |
| textos literais do diálogo e da ficha (18) | "Ajustar foto" C36 · "Zoom" C37 · "Girar à esquerda" C37 · "Girar à direita" C37 · "Salvar foto" C38 · "Enviando…" C45 · "Cancelar" C48 · "Trocar foto" C49 · "Usar câmera" C50 · "Enquadre o rosto e os ombros" C51 · "Capturar" C51 · "Abrindo câmera…" C52 · "Tirar outra" C53 · "Trocar câmera" C56 · "A foto precisa ter pelo menos 300×400 pixels." C42 · "Use um arquivo JPEG, PNG ou WebP." C43 · "Permita o uso da câmera no navegador ou envie um arquivo." C54 · "Nenhuma câmera disponível neste dispositivo. Envie um arquivo." C55 | - |
| checks da `foto-pipeline` substituídos (2) | C64 de lá por C36, C38 e C44 · C65 de lá por C45 e C46 | - |
| startup config: migração `0006` aplicada (3 assemblies) | banco migrado em `packages/database` C1 · harness de `apps/api` C6 · stack do compose C65 | - |
| startup config: retenção padrão de 30 dias (3 places) | `loadEnv` C4 · ambiente montado pelo `startApi` C6 · processo real na stack, sem a variável C65 | - |
| startup config: temporizador do expurgo ligado (3 assemblies) | API montada pelo `startApi` C22 · `dist/main.js` como processo filho C22 · container `api` da stack C65 | - |
| startup config: `PUT` multipart pelo repasse do web (2 assemblies) | build de produção do web contra a `FakeApi` C44 · container `web` da stack C65 | - |
| startup config: câmera falsa e permissão no Playwright (1 place) | `playwright.config.ts` C51 | - |
| startup config: `react-easy-crop` no build de produção do web (1 place) | C38 | - |

- Claims naming a status code, route or response shape: C5 a C19, C30, C31, C33 e C59 a C63 cruzam a
  fronteira HTTP da API montada pelo `startApi` (C7, C11, C15, C16, C19 e C63 leem também o bucket); C35
  a C58 cruzam a fronteira do web no navegador, sobre o build de produção; C65 cruza as duas no processo
  real. C1 a C4 provam o banco migrado, o vocabulário e o schema de ambiente no próprio nível; C20 a C28
  e C32 provam o expurgo no próprio nível (a função chamada sobre Postgres e MinIO reais), porque ele não
  é alcançado por rota nenhuma; C22, C26 e C29 iniciam o `dist` como processo filho
- **Checks da `foto-pipeline` substituídos.** A C64 e a C65 de `features/foto-pipeline/checks.md` (AC 54
  e AC 55 de lá) deixam de valer como escritas, como o `Impact` do plano registra: escolher ou largar um
  arquivo abre o ajuste em vez de enviar o arquivo como veio (C36), o que sai do navegador é o recorte,
  com outro nome e outro tamanho (C38, C44), e o "Enviando…" e a ficha com a foto nova passam ao botão do
  diálogo (C45, C46). A área, o botão "Enviar foto" e os três tipos aceitos, que a C64 também afirmava,
  continuam afirmados pela C36. Nenhum check da `foto-pipeline` é editado: a troca fica registrada aqui,
  como a `auth-rbac` fez com a C22 a C25 da `fundacao`. Os testes
  `upload_area_button_accept_and_both_ways_send_multipart_file_part`,
  `upload_button_disabled_with_enviando_while_waiting` e `successful_upload_shows_the_new_photo` de
  `apps/web/e2e/photos.spec.ts` saem, e as provas da C36, C38, C44, C45 e C46 entram no lugar
- Checks da `foto-pipeline` que seguem valendo, com o que muda em volta: a C12 (`POST` com foto corrente
  responde `409`) é o que a door 2 preserva; a C66 mantém o claim, e o teste dela,
  `six_upload_errors_show_their_messages_and_keep_the_form`, é reescrito para passar pelo ajuste sem
  afrouxar asserção (as seis mensagens, a área de envio ainda exibida e "Enviar foto" habilitado); a C67
  e a C68 seguem como estão, e a C58 daqui acrescenta os controles novos à C68; a C9 e a C70 passam de
  dezoito para vinte ações na contagem total, com as posições 17 e 18 que elas afirmam intactas, do mesmo
  jeito que a `foto-pipeline` levou as de `consentimento` de dezesseis para dezoito
- Testes existentes que o Build edita porque o claim deles muda pelo `Impact` do plano; o nome fica, o
  conteúdo ganha o que o plano acrescenta e nenhuma asserção é afrouxada:
  `audit_actions_end_with_two_photo_actions_in_order`, `audit_actions_end_with_three_consent_actions_in_order`
  e `audit_actions_end_with_three_student_actions_in_order` em `contracts.test.ts`, e
  `ten_actions_shown_by_label`, `student_actions_labelled_and_filter_has_thirteen`,
  `consent_actions_labelled_and_filter_has_sixteen` e `photo_actions_labelled_and_filter_has_eighteen` em
  `audit.spec.ts` (de dezoito para vinte ações); `ten_actions_written_equal_contract_vocabulary` em
  `audit-auth.test.ts` (passa a percorrer a troca e o expurgo); `request_bodies_come_from_contract_schemas`
  em `openapi.test.ts` (o `put` multipart entra na lista de exceções ao lado do `post`);
  `version_check_and_unique_per_student` e `partial_unique_index_one_current_per_student` em
  `packages/database/test/photos.test.ts`, e a preparação de
  `ficha_photo_url_medium_for_four_profiles_null_when_absent` e de
  `list_photo_url_thumb_per_item_for_four_profiles_no_duplicates` em `photos-urls.test.ts`: as quatro
  inserem linha não corrente sem `expires_at`, que a door 1 passa a recusar, e a preparação ganha o prazo.
  Nas duas de `photos.test.ts` isso importa para a asserção: a violação do `CHECK` novo tem o mesmo código
  da violação de `version >= 1`, e sem o prazo o teste passaria pelo motivo errado
- `paths_equal_registered_api_routes`, `hostile_input_never_answers_5xx` e `responses_match_contract_schemas`
  leem o roteador ou a lista de rotas e passam a cobrir o `PUT` sem check próprio aqui;
  `only_four_routes_answer_without_session` segue com quatro rotas (a C14 prova o `401` do `PUT`);
  `env_example_lists_every_required_key` e `missing_var_exits_1_naming_it` leem as chaves obrigatórias e
  não mudam, porque a variável nova é opcional (C64)
- C10 e C11 provam um caso por AC herdada, não a tabela inteira de cada uma: a tabela (cinco conteúdos,
  quatro partes malformadas, cinco dimensões, oito orientações) é provada no `POST` pela C18 a C31 da
  `foto-pipeline`, e o `Flow` do plano fixa que o `PUT` usa a mesma leitura, a mesma validação e a mesma
  geração de variantes. Se o Build der ao `PUT` uma segunda implementação de qualquer uma delas, um caso
  por AC deixa de bastar e as tabelas passam a ser devidas também no `PUT`: é o que o Verifier confere no diff
- C40 e C41 usam origens em 3:4 exatos e fatores de zoom que dão regiões inteiras, para a dimensão do
  JPEG ser um número só; o arredondamento de uma região de lado fracionário não é afirmado
- Além do texto das AC, derivado do `Impact`, das `Assumptions`, das doors ou da prática do repositório,
  e que o Build pode discutir antes de fechar: a versão mais antiga não recarimbada na segunda troca (C6);
  a URL anterior entregando até `exp` (C8); os dois `PUT` sobre aluno sem foto (C17); a falha de só um
  objeto no expurgo (C24); o temporizador parado no `close()` e a execução seguinte depois de uma que
  falhou (C23); o `ip` na linha da troca (C30); o expurgo desfeito quando a auditoria falha (C32); o nome
  `foto.jpg` da parte (C38); o reenvio depois do erro e reabrir o mesmo arquivo depois de cancelar (C47,
  C48); a ausência da área de arrastar com foto (C49); o envio por arquivo depois da câmera negada (C54);
  `csrf_rejected`, 2FA e OpenAPI na rota nova (C59, C61, C62); e as corridas do `PUT` com `POST` e com
  `DELETE` (C63), que nenhuma AC cobre e que hoje dariam `500` pelo índice parcial único se o `PUT` não
  as tratasse
- Decisões que o plano deixa de fora de AC e que nenhum check afirma: o que o diálogo faz com uma imagem
  que só comporta 300×400 girada, como 640×360 (a AC 38 só fala de quem não comporta em giro nenhum; na
  posição original a região 3:4 tem 270×360 e o servidor a recusaria com `422`); qual mensagem aparece
  para os outros erros de `getUserMedia` (`NotReadableError` de câmera em uso por outro programa,
  `AbortError`, `OverconstrainedError`); se uma versão que falha no expurgo impede as outras vencidas da
  mesma execução de sair, e que linhas de log uma execução que removeu umas e falhou em outras escreve;
  quantas versões uma execução apaga e o que acontece se ela dura mais de 60 minutos; o que a subida faz
  com `PHOTO_VERSION_RETENTION_DAYS` vazio; a ordem das câmeras em "Trocar câmera" com três ou mais; e a
  qualidade 0,9 do JPEG, que nenhuma prova de exit code mede
- Pergunta 1 respondida (versões invisíveis): nenhuma rota lista ou entrega uma versão guardada por
  conta própria. `paths_equal_registered_api_routes` e a C59 fixam que a única rota nova é o `PUT`, e a
  C8 prova que as leituras assinam só a corrente. A URL assinada emitida antes da troca vale até `exp`
  (C8) e depois responde `403` (C39 da `foto-pipeline`)
- O arrastar, a pinça, a roda do mouse e o teclado dentro do quadro são do `react-easy-crop` (door 6) e
  não ganham prova própria; o que sai do navegador é provado pelos pixels (C38 a C41)
- Nenhuma prova de navegador roda contra a imagem Docker do web: que o `Dockerfile` instala a dependência
  nova é achado do `docker compose up --build` da C65, e o diálogo é provado sobre o `next build` do Playwright
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md`, `features/auditoria/checks.md`, `features/alunos/checks.md`,
`features/consentimento/checks.md` e `features/foto-pipeline/checks.md` seguem valendo e respondem as duas
perguntas para o que esta feature reaproveita (a rota que decide com o armazenamento no caminho, a falha de
dependência, a restrição do banco, o gravador da trilha, a tela contra a `FakeApi`). Respondem mal três
casos que lá não existiam: o código que decide sem ser alcançado por rota nenhuma, a decisão sobre pixels
tomada no navegador, e a tela que depende de um dispositivo. Os três ganham linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide, sem fronteira HTTP (o expurgo: quais linhas saem, em que ordem objeto e linha, o que fica quando algo falha) | uma prova no próprio nível, chamando a função sobre Postgres e MinIO reais, **e** uma prova de que cada montagem a dispara (o `startApi`, o `dist` como processo filho, a stack) | um caso afirmado por linha da tabela de decisão e as duas bordas do prazo; linhas de `photos`, contagem de `audit_logs` e chaves do bucket afirmadas depois de cada caso |
| Decide, no navegador, sobre a imagem (região, giro, teto de 1200×1600, piso de 300×400) | uma prova na fronteira do web: o teste decodifica o que a `FakeApi` recebeu | um caso afirmado por linha da tabela de geometria, com as dimensões exatas e a cor em dois pontos; o oráculo é o enunciado, nunca o código do editor |
| Decide, na tela, sobre um dispositivo (estados da câmera, número de câmeras, encerramento das trilhas) | uma prova com a câmera falsa do Chromium para o caminho que entrega vídeo, e uma com `navigator.mediaDevices` trocado pelo teste para cada estado que a câmera falsa não produz | um caso por estado; `getUserMedia` e as trilhas observados por um invólucro do teste, nunca por estado interno do componente |
| Instrumentação: o controller do `PUT` que repassa a parte `file` ao serviço, os dois rótulos novos de `ACTION_LABELS`, a configuração do Playwright, as props fixas do `react-easy-crop` | nenhuma própria | coberta pela prova de quem a consome (C5, C35, C51, C37) |

Evidence (o código da feature ainda não existe; a contagem vem do plano e do código que ele altera):

- troca: 8 status, 4 perfis, 7 recusas herdadas, 4 falhas de escrita, 1 falha de transação, 4 pares
  concorrentes, 5 efeitos sobre as linhas (C5 a C19, C63) -> decide; `photos.service.ts` tem hoje 6
  pontos de decisão em `create` e a troca acrescenta o ramo "tem corrente ou não" e a trava do aluno
- expurgo: 5 decisões por linha, 2 bordas do prazo, 3 falhas ao apagar objeto, 2 dependências fora, 2
  execuções ao mesmo tempo, 3 momentos em que executa (C20 a C27) -> decide, sem rota
- retenção: 9 valores no schema e 8 na subida, 4 prazos gravados (C4, C28, C29) -> decide
- migração `0006`: 1 `CHECK` com 4 combinações, 1 coluna anulável (C1, C2) -> decide
- auditoria: 3 ações por caminho, 8 status que não gravam, 2 ações desfeitas (C30 a C34) -> decide
- geometria do recorte: 4 giros, 5 tamanhos de saída, 4 limites de zoom, 5 bordas do piso, 3 arquivos
  ilegíveis (C38 a C43) -> decide, no navegador
- diálogo e câmera: 4 vias de abrir, 4 métodos de envio, 6 mensagens, 5 estados da câmera, 2 números de
  câmeras, 4 saídas que encerram trilhas (C36, C44 a C57) -> decide, na tela
- `photos.controller.ts`: cada rota chama `findStudent`, lê a parte e repassa ao serviço -> instrumentação
  além do `404`, que a C12 prova
- closest analogue in the repo: `apps/api/test/photos-variants.test.ts` e `photos-delete.test.ts`, cada
  linha da tabela provada na fronteira com Postgres e MinIO reais e o estado que sobra afirmado;
  `apps/api/test/boot.test.ts` (`real_process_logs_delivered_body_error`), o `dist` como processo filho;
  `apps/api/test/photos-urls.test.ts`, relógio do teste em processo; e `apps/web/e2e/photos.spec.ts`, a
  tela contra a `FakeApi` lendo o multipart recebido. Não há precedente no repositório de tarefa em
  segundo plano, de teste que decodifica imagem saída do navegador nem de câmera

Cost: 5 arquivos de teste novos (`env.test.ts`, `photos-replace.test.ts`, `photos-purge.test.ts`,
`photo-editor.spec.ts`, `photo-camera.spec.ts`), um acesso ao expurgo no `startApi`, os bytes das partes
na `FakeApi`, um apoio de imagem e de câmera para o Playwright e uma subida de MinIO por arquivo de teste
de API novo. `apps/web` não tem executor de teste de unidade, e esta política não cria um: a geometria é
provada só na fronteira, pelos pixels. Sem a linha "sem fronteira HTTP", o expurgo seria provado só pela
subida da stack, um caminho que percorre uma linha da tabela.

## Swept

- validation: C1, C4, C10, C12, C29, C40, C41, C42, C43
- failure modes: C15, C16, C24, C26, C32, C47, C54, C55
- idempotency: C24 (o expurgo repetido remove o que a execução anterior deixou, inclusive com objetos já apagados), C25 (duas execuções, uma linha de auditoria), C9 (`PUT` repetido depois de uma remoção cria a primeira foto), C19 (remover apaga tudo de uma vez); um `PUT` repetido com o mesmo arquivo cria outra versão, e nenhuma AC pede o contrário
- authorization: C13, C14, C58, C61, C62; existing - a guarda global (AD-022) e a checagem de origem (AD-020), pelas provas `guard_matrix_three_declarations_five_callers` e `only_four_routes_answer_without_session`; as versões guardadas não têm rota (pergunta 1), e a URL anterior vale só até `exp` (C8)
- concurrency: C17 (dois `PUT` do mesmo aluno, a trava da linha do aluno decide), C25 (dois expurgos), C63 (`PUT` com `POST` e com `DELETE`); um expurgo e um `DELETE` do mesmo aluno ao mesmo tempo não têm check, e a exclusão dos dois é idempotente
- data lifecycle: C6, C19, C20, C21, C22, C28, C65 - a versão guardada ganha prazo na troca, sai sozinha no prazo, sai junto na remoção, e a corrente nunca expira; exportar ou excluir as versões a pedido do titular é da `privacidade`
- dependency failure: C15 (armazenamento que falha na troca), C24 (objeto que não sai no expurgo), C26 (armazenamento e banco fora no expurgo), C47 (API que responde erro ao envio), C54 e C55 (câmera negada ou ausente); o envio que o navegador não consegue completar por rede cai em "outro erro" da AC 43 e é provado pelo `500` (C47)
- state transitions: C6 (corrente para guardada, uma vez, com prazo), C1 (o banco recusa as duas combinações inválidas), C9 (sem foto para com foto pelo `PUT`), C20 (guardada para apagada), C21 (a corrente não expira), C53 e C57 (ao vivo, capturado, ao vivo de novo, com as trilhas encerradas em cada saída)
- observability: C27 (uma linha de log por execução que removeu), C26 (`photo purge failed`), C30, C31, C32, C33, C34, C35 - a troca e o expurgo na trilha, sem nome de arquivo, chave nem conteúdo

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado (KB de código e teste, dividido por quatro); o que já existe foi medido com `wc -c`. Código novo: S0 = 4k (a migração `0006`; o snapshot do Drizzle é gerado, não escrito), S1 = 6k, S2 = 8k, S3 = 3k, S4 = 12k (o diálogo, o apoio de imagem do Playwright e a prova de pixels), S5 = 6k, S6 = 4k: 43k. Arquivos existentes que a feature edita ou lê para editar (46 arquivos, 294 KB): `apps/api/src` 37 KB em 12 arquivos (`photos.service.ts` 8 KB, `app.module.ts` 4,5 KB, `validation.ts` 4 KB), `packages/database` e `packages/contracts` 16 KB em 4 (`schema.ts` 10 KB), testes de API e de banco 133 KB em 14 (`contracts.test.ts` 28 KB, `photos-urls.test.ts` 19 KB, `audit-auth.test.ts` 14 KB, `support/photos.ts` 14 KB, `boot.test.ts` 9 KB, `photos-audit.test.ts` 9 KB), `apps/web` 65 KB em 11 (`audit.spec.ts` 20 KB, `photos.spec.ts` 14 KB, `fake-api.ts` 9 KB, `photo-block.tsx` 5 KB), stack e repositório 43 KB em 5 (`compose.test.ts` 23 KB, `repo.test.ts` 9 KB): 294 KB ÷ 4 = 73k. `plan.md` (33 KB, 8k) e este arquivo (65 KB, 16k): 24k. Total 43k + 73k + 24k = 140k, abaixo do orçamento de 150k: um builder, sem pergunta
- A folga é de 10k, 7% do orçamento, e a parcela estimada (43k de código novo) é a que pode crescer: se a S4 passar de 12k para mais de 22k o total estoura. Corte já escrito para esse caso, no limite entre a API e o web, sem dividir slice: batch 1 = S0 a S3 e C59 a C63 (API, contracts, database): 21k + 3k de código novo, 46k de existentes (186 KB: `apps/api`, `packages`, seus testes), 24k de documentos = 94k; batch 2 = S4, S5, C64 e C65 (web, repositório e stack): 18k + 1k de código novo, 27k de existentes (108 KB: `apps/web`, `tests/stack`, `tests/repo`, `.env.example`, `compose.yaml`), 24k de documentos = 70k. Soma dos dois: 24k + 19k = 43k de código novo e 46k + 27k = 73k de existentes, que é o total acima. Nenhuma slice sozinha passa de 12k, então nenhuma foi cortada demais
- Ordem: S0 primeiro (a coluna, o `CHECK`, o vocabulário e a variável, de que todo o resto depende). No mesmo commit da migração entram o prazo nas preparações dos quatro testes que inserem linha não corrente (ver a lista abaixo da `Coverage`), ou `photos.test.ts` e `photos-urls.test.ts` reprovam; no mesmo commit de `AUDIT_ACTIONS` entram os dois rótulos de `ACTION_LABELS` e as contagens de dezoito para vinte, ou o typecheck do web e sete testes reprovam. Depois S1, S2, S3, C59 a C63, S4, S5, C64 e C65. Antes da S2, conferir que um temporizador vivo não segura o processo do Vitest nem o `close()` do `startApi`; antes da S4, conferir no `react-easy-crop` 6.2 o seletor do quadro de recorte e que a região devolvida vem em pixels da origem, e que o Chromium do Playwright entrega a câmera falsa com `--use-fake-device-for-media-stream`
- Mechanism: one builder - a estimativa cabe no orçamento, então não há pergunta. Checks aprovados como estão em 2026-10-05; o Build começa depois do commit deste arquivo. Mudou no meio do Build para handoff no corte já escrito (API | web), por instrução do usuário dada com a aprovação: a sessão do batch 1 passou do orçamento antes de chegar ao web (ver o Boundary abaixo)
- Boundary (batch 1, API, contracts e database, fechado em 2026-10-05 com `pnpm verify` verde (21 tarefas, saída 0)): base da feature `f369964` (o commit de docs deste arquivo; o código é `f369964..HEAD`). Fechados C1 a C35 e C59 a C63. S0: banco `55d84c2` (C1, C2; migração `0006_photo_expiry`, e o prazo nas preparações que inserem linha não corrente), vocabulário, rótulos e variável `328f0f1` (C3, C4; `ACTION_LABELS` e as contagens de dezoito para vinte em `contracts.test.ts` e `audit.spec.ts`) · S1 e C62, C63 `b831e2e` (`PUT`, `photos-replace.test.ts`, 17 testes) · S2 `227ff8c` (C20 a C29; `photo-purge.ts`, `photos-purge.test.ts` com 9 testes e 3 em `boot.test.ts`) · S3 `85df420` (C30 a C34) e `05053a6` (C35) · C59 a C61 `bd83caa`. Provas rodadas no fim: banco 40, API 359 em 52 arquivos (cobertura 93,6% de linhas, 91,4% de ramos), `audit.spec.ts` 25. Fica para o batch 2, nesta ordem: S4 (C36 a C49), S5 (C50 a C58), C64 e C65; antes da S4, as três conferências que a linha de Ordem acima pede (`react-easy-crop` 6.2, câmera falsa do Chromium). O Verifier só roda depois do último commit do batch 2, sobre `f369964..HEAD` e os 65 checks
- Por que o corte: a estimativa de 94k para o batch 1 não se confirmou. A parcela que cresceu não foi o código novo e sim a leitura dos testes existentes que servem de molde (`photos-upload`, `-delete`, `-audit`, `-variants`, `-validation`, `boot`, `contracts`, `openapi`, `support/photos.ts`) e a saída das execuções; a sessão não mede os próprios tokens, então não há número a registrar, só que o limite de 150k ficou para trás antes do web. O batch 2 (estimado em 70k) começa em sessão nova e lê este arquivo e o diff `f369964..HEAD`
- Resolvido pelo usuário no meio do Build: nada além da instrução de parar neste corte se o orçamento estourasse. Nenhum check foi discutido ou alterado
- Desvios do batch 1, para o batch 2 e o Verifier verem: (1) `ten_actions_written_equal_contract_vocabulary` ficou vermelho entre `328f0f1` e `85df420`: o vocabulário entra na S0 e a troca e o expurgo que o teste percorre só existem depois da S2. (2) `photo_paths_and_query_parameters_come_from_contract_schema` (`openapi.test.ts`) não estava na lista de testes existentes que o Build edita, mas afirmava as operações do caminho da foto como `delete`, `get`, `post`; ganhou o `put`, sem afrouxar nada. (3) O prazo na linha não corrente entrou pelo apoio `insertPhoto` de `packages/database/test/photos.test.ts`, o que alcança também `defaults_uuidv7_and_not_null` (fora da lista de quatro); `version_check_and_unique_per_student` passou a afirmar o nome `photos_version_positive`, para não passar pela restrição nova. (4) `startApi` monta o ambiente pelo `loadEnv` do processo real (o padrão de 30 dias vem do schema, que é o que a linha de `Coverage` da retenção pede) e aceita variáveis extras; devolve `purge`, o acesso que a regra "o expurgo executa" descreve. (5) `flakyStorage` ganhou `failDeleteOf` (só uma variante) e `down` (derruba a conexão), para a C24 e a C23. (6) `@academia/database` passou a exportar `lte`
- Decisões do builder sem check, para o batch 2 e o Verifier: `POST`, `PUT` e `DELETE` da foto travam a linha do aluno (`select ... for update`) dentro da transação, e é isso que fecha a C63 (o `POST` que perde a corrida para um `PUT` responde `409` pela checagem ou pelo índice; o `PUT` que perde para o `POST` troca a foto recém-enviada); `create` e `replace` são a mesma função privada `store`, com uma só leitura, validação e geração de variantes (o caso que a nota da C10 e C11 manda o Verifier conferir); o prazo é `now() + make_interval(days => N)` no `UPDATE`; no expurgo, a versão cujo objeto não sai é pulada e as outras vencidas da mesma execução saem, a execução escreve `photo versions purged` com o que removeu e `photo purge failed` se alguma falhou, e uma falha de banco ou de auditoria interrompe a execução; as linhas de log do expurgo levam só `level`, `time`, `msg` e `count`, sem texto de erro (a C34); o temporizador é um `setInterval` criado em `onApplicationBootstrap` e limpo em `onApplicationShutdown`, sem `unref`; `PHOTO_VERSION_RETENTION_DAYS` vazio impede a subida, nomeado entre as ausentes; a URL assinada de uma versão já expurgada responde `404`
- Abandonado no batch 1: nada. Nenhuma door nova, então `Landing` não ganhou linha; o `Impact` do plano ganhou uma linha (a trava do aluno no `POST` e no `DELETE`)
- Boundary (batch 2, web, repositório e stack, fechado em 2026-10-05 com `pnpm verify` verde (21 tarefas, saída 0)): fechados C36 a C58, C64 e C65; com o batch 1, os 65. As três conferências da linha de Ordem, antes da S4: o quadro de recorte do `react-easy-crop` 6.2.3 é `[data-testid="cropper"]` (classe `reactEasyCrop_CropArea`), nomeado só em `e2e/support/photo.ts`; `croppedAreaPixels` vem em pixels naturais da caixa da imagem já girada (não da origem sem giro), e é nesse sistema que `drawRegion` desenha; o Chromium do Playwright entrega a câmera falsa com `--use-fake-device-for-media-stream` e `--use-fake-ui-for-media-stream` (640×480, uma `videoinput`, sem áudio pedido). S4 `9ed6932` (C36 a C49, a C44 pela via do arquivo; `photo-editor.tsx`, `lib/photo-crop.ts`, `photo-editor.spec.ts` com 14 testes, `e2e/support/photo.ts`, os bytes das partes na `FakeApi`) · S5 `a873e50` (C50 a C58 e a via da câmera da C44; `photo-camera.tsx`, `photo-camera.spec.ts` com 10 testes, `e2e/support/camera.ts`, a câmera falsa e a permissão em `playwright.config.ts`) · C64 e C65 `7068dea` (`.env.example`, `compose.yaml`, `repo.test.ts`, `compose.test.ts`). Provas rodadas uma a uma pelo comando do check: 24 de tela (saída 0 em cada), C64 (1 passou), C65 na stack de um clone limpo (1 passou, 190 s). No `pnpm verify` do fim: banco 40, API 359 em 52 arquivos, repositório 10, web 119. O Verifier roda agora, sobre `f369964..HEAD` e os 65 checks
- Resolvido pelo usuário no batch 2: nada. Nenhum check foi discutido ou alterado, nenhuma asserção afrouxada
- Testes da `foto-pipeline` no batch 2, como a seção abaixo da `Coverage` manda: saíram de `photos.spec.ts` `upload_area_button_accept_and_both_ways_send_multipart_file_part`, `upload_button_disabled_with_enviando_while_waiting` e `successful_upload_shows_the_new_photo` (substituídos pelas provas da C36, C38, C44, C45 e C46); `six_upload_errors_show_their_messages_and_keep_the_form` passa pelo ajuste com as três asserções de antes (a mensagem, a área de envio exibida, "Enviar foto" habilitado), e a ordem mudou num ponto: a área e o botão são conferidos depois de "Cancelar", porque com o diálogo aberto o resto da página fica fora da árvore de acessibilidade. Os apoios `studentOf`, `serveFicha` e `serveMutableFicha` foram de `photos.spec.ts` para `e2e/support/photo.ts`, sem mudar
- Desvio do batch 2, para o Verifier ver: `compose.yaml` passou a repassar `PHOTO_VERSION_RETENTION_DAYS: ${PHOTO_VERSION_RETENTION_DAYS:-30}` ao serviço `api`. Nenhum check pede; sem isso, descomentar a linha que a C64 põe no `.env.example` não teria efeito na stack, que só entrega ao container as variáveis listadas. Consequência para a linha de `Coverage` "retenção padrão de 30 dias, processo real na stack, sem a variável" (C65): o `.env` da stack segue sem a variável (a C65 afirma isso), mas o container a recebe com `30` vindo do compose, e não do padrão do schema; o padrão do schema é provado pela C4 e pela C6. O `Impact` do plano ganhou essa frase na linha de ambiente
- Decisões do builder sem check no batch 2: o arquivo ilegível (C43) e a imagem pequena em todo giro (C42) não abrem o diálogo, a mensagem aparece na ficha; a imagem que só comporta 300×400 num dos giros (640×360, a decisão que os checks deixam aberta) abre o diálogo, e no giro que não comporta a mensagem aparece dentro dele com "Salvar foto" desabilitado; o máximo do "Zoom" é `min(3, largura da maior região 3:4 ÷ 300)` truncado em centésimos, recalculado a cada giro, e é o atributo `max` do controle; girar recentra o recorte; o quadro capturado da câmera vai ao ajuste como PNG do tamanho do vídeo; a fase ao vivo do diálogo tem o título "Tirar foto"; `NotAllowedError` dá a mensagem de permissão e qualquer outro erro de `getUserMedia` (`NotFoundError`, `NotReadableError`, `OverconstrainedError`) dá "Nenhuma câmera disponível"; "Trocar câmera" segue a ordem de `enumerateDevices`, partindo do `deviceId` da trilha ou, sem ele, da primeira; clicar fora do diálogo não o fecha, e ele não fecha enquanto envia; a fundo branco entra no JPEG onde a origem é transparente
- Abandonado no batch 2: nada. Nenhuma door nova, então `Landing` não ganhou linha
