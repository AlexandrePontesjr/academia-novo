# Pipeline de foto do aluno verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: f3797aa..1b57402
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Duas lacunas, nenhuma de comportamento quebrado: (1) a C80 afirma "o container `api` nunca é criado" e a prova
aceita um container `api` criado e nunca iniciado (lacuna de precisão: o claim diz mais do que a prova); (2) a rota
`GET /api/photo-files/:photoId/:variant` emite `503 storage_unavailable` (`photos.service.ts:168`), um status fora
da `Surface` (200/403/404) sem check nem prova. Isso também deixa sem cumprimento a linha "Falha de dependência" da
`Test policy`. Todas as 82 provas nomeadas existem, rodaram no HEAD e passaram. Os 5 mutantes injetados morreram.

## Binding sources

O perfil é `standard`, então o passo 1 (`ui`) não roda. `plan.md` (Surface, Landing, Relations, Criteria) foi
lido por inteiro e usado como autoridade na Coverage. Os ADs e as seções do PRD só valem por meio do plano.

## Checks

As provas rodaram em uma invocação por alvo, no HEAD `1b57402`:
- `packages/database`: `vitest run test/photos.test.ts --reporter=verbose`, 5 passaram
- `apps/api`: `vitest run` em 14 arquivos com `-t "^(<58 nomes>)$"`, 58 passaram e 38 foram pulados; depois `contracts.test.ts -t audit_actions_end_with_two_photo_actions_in_order`, 1 passou
- `apps/web`: `playwright test e2e/photos.spec.ts e2e/audit.spec.ts -g "<11 nomes>"`, 11 passaram
- `tests/repo`: `-t env_example_documents_photo_variables_and_secret_command`, 1 passou
- `tests/stack`: `compose.test.ts -t "<4 nomes>"`, 4 passaram e 10 foram pulados

Cada nome aparece individualmente como ✓/ok na saída do runner. Cada nome também foi localizado por `rg -n -F "'<nome>'"`, e a linha onde o teste é declarado vem citada na tabela.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | FK sem cascata bloqueia DELETE | db `student_foreign_key_without_cascade_blocks_delete` ✓ | `packages/database/test/photos.test.ts:82` - `toEqual({ delete_rule: 'NO ACTION', references: 'students' })`; `:97` `failure.code).toBe(FOREIGN_KEY_VIOLATION)`; `:98-99` linhas `to_jsonb` iguais | PASS |
| C2 | uuidv7 e NOT NULL | db `defaults_uuidv7_and_not_null` ✓ | `photos.test.ts:109` `photo!.version).toBe(7)`; `:118` `toBe(NOT_NULL_VIOLATION)` para os 3 campos | PASS |
| C3 | CHECK version, UNIQUE por aluno | db `version_check_and_unique_per_student` ✓ | `photos.test.ts:129` `toBe(CHECK_VIOLATION)` para 0 e -1; `:131` `toBe(UNIQUE_VIOLATION)`; `:136` outro aluno convive | PASS |
| C4 | índice parcial uma corrente | db `partial_unique_index_one_current_per_student` ✓ | `photos.test.ts:145-146` `UNIQUE_VIOLATION` e `toContain('photos_one_current_idx')`; `:151` 3 linhas; `:155` | PASS |
| C5 | 0005 só cria photos, sem tenant/owner | db `migration_0005_adds_only_photos_without_tenant_or_owner_columns` ✓ | `photos.test.ts:175` `toEqual([...before, 'photos'].sort())`; `:181` `not.toContain(forbidden)` | PASS |
| C6 | formato da chave e recusas | api `key_shape_for_three_variants_and_rejects_foreign_segments` ✓ | `apps/api/test/photo-keys.test.ts:10` `toBe(\`photos/main/${studentId}/${photoId}/${variant}.webp\`)`; `:14`, `:17-18` `toThrow()` | PASS |
| C7 | HMAC-SHA256 base64url | api `sign_matches_hmac_sha256_base64url_of_id_variant_exp` ✓ | `apps/api/test/photo-signer.test.ts:26` `signed).toBe(\`/api/photo-files/...?exp=${exp}&sig=${expected}\`)` (expected por `node:crypto`, `:8`); `:29` outro segredo `not.toBe(signed)` | PASS |
| C8 | verify true/8 formas false sem lançar | api `verify_true_once_and_false_for_eight_forms_without_throwing` ✓ | `photo-signer.test.ts:46` `attempt({})).toBe(true)`; `:63` `not.toThrow()`; `:64` `run(), name).toBe(false)` em todas as formas | PASS |
| C9 | 18 ações, duas novas no fim | api `audit_actions_end_with_two_photo_actions_in_order` ✓ | `apps/api/test/contracts.test.ts:373` `toHaveLength(18)`; `:374-391` as 16 em ordem; `:392` `slice(16)).toEqual(['student.photo_uploaded','student.photo_removed'])` | PASS |
| C10 | schemas de foto aceitam/recusam | api `photo_schemas_accept_and_reject_and_student_gains_photo_url` ✓ | `contracts.test.ts:403-404` texto/null/ausente; `:410` POST sem campo `false`; `:416` GET sem campo `false`; `:419-420` variantes | PASS |
| C11 | POST 201 admin/reception v1 | api `upload_201_by_admin_and_reception_version_1` ✓ | `apps/api/test/photos-upload.test.ts:45` `toBe(201)`; `:46` chaves `['createdAt','id','version']`; `:47` version 1; `:49` id = linha; `:50` is_current; `:51` ISO | PASS |
| C12 | 409 photo_exists sem mudar nada | api `second_upload_409_photo_exists_leaves_rows_and_objects` ✓ | `photos-upload.test.ts:65-69` `toBe(409)`, `code 'photo_exists'`, contagem, linha e chaves iguais | PASS |
| C13 | 10 pares concorrentes | api `ten_concurrent_pairs_one_201_one_409_three_objects` ✓ | `photos-upload.test.ts:83` `toEqual([201, 409])`; `:85` photo_exists; `:87` 1 linha; `:88-90` 3 chaves da linha | PASS |
| C14 | POST 404 abc/uuid nada gravado | api `post_404_for_bad_and_unknown_id_writes_nothing` ✓ | `photos-upload.test.ts:100-101` 404 `not_found`; `:104` `snapshotOf(...)).toEqual(before)` | PASS |
| C15 | hr_finance/instructor 403 | api `hr_finance_and_instructor_403_on_post_and_delete` ✓ | `photos-upload.test.ts:121-124` 403 `forbidden` x4; `:128` snapshot igual; `:130` 3 objetos | PASS |
| C16 | 401 nas 3 rotas | api `three_photo_routes_401_without_session` ✓ | `photos-upload.test.ts:144-145` `toBe(401)`, `'unauthorized'` | PASS |
| C17 | inactive/suspended aceitam | api `inactive_and_suspended_students_accept_upload_and_removal` ✓ | `photos-upload.test.ts:157-158` 201 e 204 | PASS |
| C18 | magic bytes decidem | api `accepted_by_magic_bytes_whatever_name_and_part_type` ✓ | `apps/api/test/photos-validation.test.ts:70` `toBe(201)` nos 3 casos (`:60-68`) | PASS |
| C19 | 5 conteúdos 415 | api `five_non_image_contents_415_writes_nothing` ✓ | `photos-validation.test.ts:82` 5 casos; `:87` → `:47-50` status 415, `unsupported_media_type`, sem linha/objeto | PASS |
| C20 | corpos não multipart 415 | api `non_multipart_bodies_415` ✓ | `photos-validation.test.ts:111` → `:47-50` | PASS |
| C21 | 5 MiB e +1, em partes | api `size_limit_at_5_mib_and_one_byte_over_also_chunked` ✓ | `photos-validation.test.ts:119` tamanhos exatos; `:122` 201; `:125` 413 `payload_too_large`; `:128-134` em partes (`ReadableStream`, `support/photos.ts:150`) | PASS |
| C22 | parte file faltando/duplicada 422 | api `missing_or_duplicate_file_part_422_on_path_file` ✓ | `photos-validation.test.ts:162` → `:49` `errors.map(path)).toContain('file')` | PASS |
| C23 | mínimo 300×400 após orientação | api `minimum_300x400_after_orientation_five_cases` ✓ | `photos-validation.test.ts:178-179` 201 / 422 com path `file`, 5 casos | PASS |
| C24 | teto 40 MP | api `pixel_ceiling_at_40_million` ✓ | `photos-validation.test.ts:186` 201 para 8000×5000; `:194` 422 path `file` | PASS |
| C25 | truncado/lixo 422 | api `truncated_or_garbage_after_magic_422_on_path_file` ✓ | `photos-validation.test.ts:210` | PASS |
| C26 | 3 WebP de tamanho exato | api `three_webp_variants_exact_sizes_right_after_201` ✓ | `apps/api/test/photos-variants.test.ts:74` chaves; `:79` `format).toBe('webp')`; `:80` `toEqual(SIZES[variant])` | PASS |
| C27 | recorte centralizado | api `center_crop_without_distortion_four_images` ✓ | `photos-variants.test.ts:94-95`, `:100` sem vermelho, `:105-109` | PASS |
| C28 | EXIF 1-8 | api `exif_orientation_one_to_eight_read_upright` ✓ | `photos-variants.test.ts:145` `found).toEqual(upright)`; `:154-155` | PASS |
| C29 | sem EXIF/GPS/marcador | api `no_exif_gps_or_marker_bytes_in_any_variant_of_three_formats` ✓ | `photos-variants.test.ts:183-185` | PASS |
| C30 | original em lugar nenhum | api `original_kept_nowhere_bucket_or_tmpdir` ✓ | `photos-variants.test.ts:200`, `:202`, `:203` sha256 diferente, `:204/:208/:212` `readdirSync(empty)).toEqual([])` | PASS |
| C31 | chave só de ids | api `keys_built_only_from_ids_and_variant_whatever_the_client_sends` ✓ | `photos-variants.test.ts:243` 3; `:245` `toMatch(pattern)` | PASS |
| C32 | falha de armazenamento 503 | api `storage_failure_on_each_variant_and_down_503_leaves_nothing` ✓ | `photos-variants.test.ts:274-276` 503, `storage_unavailable`, snapshot (linhas, auditoria, chaves) igual | PASS |
| C33 | transação falha, objetos removidos | api `transaction_failure_after_upload_rolls_back_rows_and_removes_objects` ✓ | `photos-variants.test.ts:294-297` 500 `internal_error`, snapshot, sem chaves | PASS |
| C34 | URL para 4 perfis, exp +300 | api `url_for_four_profiles_expires_300s_after_response` ✓ | `apps/api/test/photos-urls.test.ts:79-81` 200, regex `exp=${T + 300}`, `expiresAt`; `:85` large | PASS |
| C35 | padrão medium | api `variant_defaults_to_medium` ✓ | `photos-urls.test.ts:93` | PASS |
| C36 | variant inválido 422 | api `invalid_variant_422_on_path_variant` ✓ | `photos-urls.test.ts:103-105` | PASS |
| C37 | GET foto 404 x3 | api `photo_url_404_for_unknown_bad_and_photoless` ✓ | `photos-urls.test.ts:115-116` | PASS |
| C38 | arquivo 200 sem sessão | api `signed_url_serves_three_variants_without_session` ✓ | `photos-urls.test.ts:128-132` 200, `image/webp`, `no-store`, bytes iguais | PASS |
| C39 | exp ±1 s | api `expired_signature_403_one_second_either_side` ✓ | `photos-urls.test.ts:144` 200; `:149-152` 403, `invalid_signature`, problem+json, sem `RIFF` | PASS |
| C40 | 13 adulterações e id desconhecido 403 | api `thirteen_tampered_requests_403_and_unknown_id_is_not_a_404` ✓ | `photos-urls.test.ts:187` 14 entradas; `:194-196` 403, `invalid_signature`, problem+json | PASS |
| C41 | assinatura válida, foto ausente 404 | api `valid_signature_for_missing_photo_404` ✓ | `photos-urls.test.ts:207-208`, `:212-213` | PASS |
| C42 | nada de armazenamento nas respostas | api `no_storage_address_key_or_credential_in_any_response` ✓ | `photos-urls.test.ts:246` os 12 status; `:252-254` | PASS |
| C43 | bucket anônimo 403 | api `anonymous_request_to_bucket_403_for_objects_and_listing` ✓ | `photos-urls.test.ts:269`, `:271` | PASS |
| C44 | segredos fora do log | api `five_secrets_never_reach_the_log` ✓ | `photos-urls.test.ts:291` log capturado; `:299` `includes(value)).toBe(false)`; captura stdout/stderr/console em `support/log.ts:10-14` | PASS |
| C45 | photoUrl da ficha medium, 4 perfis | api `ficha_photo_url_medium_for_four_profiles_null_when_absent` ✓ | `photos-urls.test.ts:336` `toBe(signer.sign(currentId,'medium',T+300))`; `:337` chaves por perfil; `:340-341` presente e null | PASS |
| C46 | photoUrl da lista thumb | api `list_photo_url_thumb_per_item_for_four_profiles_no_duplicates` ✓ | `photos-urls.test.ts:359` sem duplicata; `:361-363`; `:365` chaves | PASS |
| C47 | DELETE 204 e efeitos | api `delete_204_removes_row_objects_and_every_way_to_see_it` ✓ | `apps/api/test/photos-delete.test.ts:45-56` | PASS |
| C48 | DELETE sem foto não muda nada | api `delete_without_photo_204_changes_nothing` ✓ | `photos-delete.test.ts:66-67` | PASS |
| C49 | DELETE 404 | api `delete_404_for_bad_and_unknown_id` ✓ | `photos-delete.test.ts:74-75` | PASS |
| C50 | remoção de objetos falha, ainda 204 | api `object_removal_failure_still_204_and_logs_photo_id_only` ✓ | `photos-delete.test.ts:91-104` | PASS |
| C51 | reenvio v1 | api `upload_after_removal_201_version_1` ✓ | `photos-delete.test.ts:119-120` | PASS |
| C52 | linha photo_uploaded | api `upload_writes_one_photo_uploaded_row_with_null_diff` ✓ | `apps/api/test/photos-audit.test.ts:54-62` `toHaveLength(1)`, `toMatchObject({action, user_id, entity, entity_id, diff: null})` | PASS |
| C53 | linha photo_removed | api `delete_writes_one_photo_removed_row_with_null_diff` ✓ | `photos-audit.test.ts:73-81` | PASS |
| C54 | 10 desfechos sem linha | api `ten_non_writing_outcomes_write_no_audit_row` ✓ | `photos-audit.test.ts:107` 10 casos; `:114-115` status e contagem iguais | PASS |
| C55 | auditoria falha no DELETE | api `audit_failure_on_delete_keeps_row_and_objects` ✓ | `photos-audit.test.ts:132-136` | PASS |
| C56 | nome/chave/conteúdo fora | api `file_name_key_and_content_never_reach_audit_or_log` ✓ | `photos-audit.test.ts:157-161` | PASS |
| C57 | ip e user_agent | api `ip_and_user_agent_on_the_two_photo_actions` ✓ | `photos-audit.test.ts:209-211`, `:218` | PASS |
| C58 | /health storage | api `health_storage_up_down_missing_bucket_and_hanging` ✓ | `apps/api/test/health.test.ts:73-78` status, `toEqual({status, checks:{database:'up', storage}})`, `<= 3000` | PASS |
| C59 | env de foto rejeitado | api `photo_env_rejected_exits_1_naming_var_without_values` ✓ | `apps/api/test/boot.test.ts:233-237` status 1, nome, sem valores; `:256` 32 caracteres sobe (`dist/main.js` reconstruído pelo `globalSetup` `test/support/build.ts`) | PASS |
| C60 | bucket privado, portas em loopback | stack `storage_bucket_exists_private_and_ports_on_loopback` ✓ | `tests/stack/compose.test.ts:366` `mc ls` com status 0; `:377-378` 403 anônimo; `:386-387` `host_ip` `127.0.0.1` | PASS |
| C61 | img com alt | web `ficha_shows_photo_with_alt_text` ok | `apps/web/e2e/photos.spec.ts:76-77` `toHaveAttribute('src', PHOTO_URL)` | PASS |
| C62 | iniciais para 5 nomes | web `initials_circle_for_five_names_labelled_sem_foto` ok | `photos.spec.ts:94` role img "Sem foto"; `:95` `getComputedStyle(::before).content` igual a `"${initials}"` (helper `:66-67`) | PASS |
| C63 | imagem quebrada vira iniciais | web `broken_image_falls_back_to_initials_on_ficha_and_list` ok | `photos.spec.ts:109-110`, `:114-115` | PASS |
| C64 | área, accept, duas vias | web `upload_area_button_accept_and_both_ways_send_multipart_file_part` ok | `photos.spec.ts:126-130`, `:153-158` | PASS |
| C65 | "Enviando…" e foto nova | web `upload_button_disabled_with_enviando_while_waiting` ok, `successful_upload_shows_the_new_photo` ok | `photos.spec.ts:172-173`; `:191-194` | PASS |
| C66 | 6 mensagens de erro | web `six_upload_errors_show_their_messages_and_keep_the_form` ok | `photos.spec.ts:219-221` | PASS |
| C67 | remoção confirma pelo nome | web `remove_photo_confirms_naming_the_student_then_deletes` ok | `photos.spec.ts:241-254` | PASS |
| C68 | perfis só leitura sem controles | web `read_only_profiles_see_photo_or_initials_without_controls` ok | `photos.spec.ts:268-272` | PASS |
| C69 | miniatura/iniciais na célula Nome | web `list_cell_name_has_thumbnail_or_initials_for_four_roles` ok | `photos.spec.ts:296-314` | PASS |
| C70 | rótulos do /audit e filtro com 18 | web `photo_actions_labelled_and_filter_has_eighteen` ok | `apps/web/e2e/audit.spec.ts:511-519` | PASS |
| C71 | paths do OpenAPI | api `photo_paths_and_query_parameters_come_from_contract_schema` ✓ | `apps/api/test/openapi.test.ts:178-191` | PASS |
| C72 | corpos reais batem com o contrato | api `photo_bodies_match_contract_schemas` ✓ | `contracts.test.ts:603` 12 casos; `:609-610`; `:613` | PASS |
| C73 | 5 códigos conhecidos | api `photo_codes_are_known_problem_codes` ✓ | `contracts.test.ts:637-641` | PASS |
| C74 | só 4 rotas abertas | api `only_four_routes_answer_without_session` ✓ | `apps/api/test/access.test.ts:155-157`, `:161-166` | PASS |
| C75 | .env.example | repo `env_example_documents_photo_variables_and_secret_command` ✓ | `tests/repo/repo.test.ts:54`, `:62`, `:64` | PASS |
| C76 | 2FA 403 nas rotas de foto | api `admin_without_2fa_gets_403_everywhere_else` ✓ | `apps/api/test/enrollment.test.ts:46-47`; `:69-71` na lista | PASS |
| C77 | CSRF 403 | api `foreign_origin_403_csrf_on_multipart_post_and_delete` ✓ | `photos-upload.test.ts:179-185` | PASS |
| C78 | envio pela origem do web na stack | stack `photo_uploaded_through_web_served_by_signed_url_with_audit_row` ✓ | `compose.test.ts:418`, `:421`, `:426-430`, `:434`, `:439`, `:443-445` | PASS |
| C79 | health da stack com storage parado | stack `health_storage_up_then_down_when_storage_stops` ✓ | `compose.test.ts:450-451`, `:458-459` | PASS |
| C80 | init do bucket falha, api "nunca é criado" | stack `api_never_starts_when_bucket_init_fails` ✓ | `compose.test.ts:509-513` init saiu com status diferente de 0 e `up` também; `:515-521` `if (api) { expect(api.State).toBe('created') ... StartedAt 0001-01-01 }`. Isso prova "nunca iniciado", não "nunca criado": a prova aceita um container `api` criado (lacuna de precisão; o compose cria todos os containers antes de iniciá-los em ordem, então o claim literal provavelmente é falso) | FAIL |

## Coverage

Recalculada a partir do plano (`Surface`, `Landing`, `Relations`, Criteria) e do código das rotas
(`apps/api/src/photos/photos.controller.ts`, `photos.service.ts`).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `POST /api/students/:id/photo` statuses (9) | plan Surface | 201 C11 · 401 C16 · 403 C15 · 404 C14 · 409 C12 · 413 C21 · 415 C19 · 422 C22 · 503 C32 | - |
| `GET /api/students/:id/photo` statuses (4) | plan Surface | 200 C34 · 401 C16 · 404 C37 · 422 C36 | - |
| `DELETE /api/students/:id/photo` statuses (4) | plan Surface | 204 C47 · 401 C16 · 403 C15 · 404 C49 | - |
| `GET /api/photo-files/:photoId/:variant` statuses (3) | plan Surface | 200 C38 · 403 C39, C40 · 404 C41 | - |
| linha de erro comum da auth-rbac nas rotas novas (2) | plan Surface preamble | 403 csrf C77 · 403 2FA C76 | - |
| statuses que o código emite fora da `Surface` (3) | `photos.controller.ts`, `photos.service.ts:70,92,168` | POST 500 C33 · DELETE 500 C55 · GET photo-files 503 `storage_unavailable` (`photos.service.ts:168`) sem prova | GET photo-files 503 |
| rotas existentes cuja resposta muda (2) | plan Surface | `GET /api/students/:id` C45 · `GET /api/students` C46 | - |
| perfis por rota (POST, GET, DELETE, ficha, lista: 5×4) | plan S1/S4/S5 + `@Roles` no controller `:33,:44,:55` | POST adm/rec C11, hr/ins C15 · GET 4 C34 · DELETE adm/rec C47, hr/ins C15 · ficha 4 C45 · lista 4 C46 | - |
| rotas sem sessão (4) | `@Public()` (rg: auth.controller.ts:85,124, health.controller.ts:20, photos.controller.ts:64) | C74 | - |
| one-way doors (7) | plan Landing | 1 C1-C5 · 2 C6, C31 · 3 C43, C60 · 4 C7, C8, C38-C40 · 5 C19, C21, C32 · 6 C9, C52, C53 · 7 C26 | - |
| restrições de Relations (4) | plan Relations/Landing door 1 | FK sem cascata C1 · uma corrente C4 · versão única C3 · id do banco C2 | - |
| migração 0005 (2) | Landing door 1 | só photos C5 · sem tenant/owner C5 | - |
| variantes: gravadas / assinadas / entregues (3×3) | AC 16, 24, 25, 28 | C26 · C34+C35 · C38 | - |
| entrada aceita / nome e tipo que não decidem / 415 de conteúdo / não multipart (3/3/5/3) | AC 8-10 | C18 · C18 · C19 · C20 | - |
| bordas de tamanho / parte malformada / dimensões / pixels / não decodifica (3/4/5/3/4) | AC 11-15 | C21 · C22 · C23 · C24 · C25 | - |
| recorte / EXIF 1-8 / formatos sem metadado / sobras do original / origem da chave / falha de escrita (4/8/3/4/4/4) | AC 17-22 | C27 · C28 · C29 · C30 · C31 · C32 | - |
| variant inválido / 404 da URL / cabeçalhos do arquivo / bordas de exp / adulterações / formas do verificador (4/3/3/2/13+1/8) | AC 26-31 | C36 · C37 · C38 · C39 · C40 · C8 | - |
| vazamentos de resposta / pedidos anônimos ao bucket / segredos fora do log (6/4/5) | AC 32-34 | C42 · C43 · C44 | - |
| chaves da ficha/lista por perfil, photoUrl nulo, corrente vs antiga | AC 35-36, AD-033 | C45 · C46 | - |
| efeitos da remoção / sem foto / id inválido / órfão / reenvio (5/1/2/1/1) | AC 37-41 | C47 · C48 · C49 · C50 · C51 | - |
| auditoria: 2 ações, diff, 10 desfechos, 2 rollbacks, 3 valores fora, ip/UA (2 bordas) | AC 42-47 | C52 · C53 · C54 · C33+C55 · C56 · C57 | - |
| estados do /health (4) e na stack (2) | AC 48 | C58 · C79 | - |
| variáveis de foto (5) + bordas do segredo (2) | AC 49 | C59 | - |
| garantias da subida da stack (3) + init com falha (1) | AC 50, door 3 | C60 · C80 (lacuna de precisão, ver Checks) | - |
| tela: iniciais (5 nomes), mensagens (6), accept (3), vias (2), controles por perfil (4), textos literais (6), audit (2+18) | AC 51-60 | C62 · C66 · C64 · C64 · C64/C67/C68 · C61/C62/C64/C65/C67 · C70 | - |
| startup config: `S3_*` + `PHOTO_URL_SECRET` (4 places) | lido: `apps/api/test/support/app.ts` (diff: `PHOTO_URL_SECRET`, `...storage` em `AppModule.register`); filho do boot `boot.test.ts:243-252`; `.env.example:29-37`; `compose.yaml` api `S3_ENDPOINT..PHOTO_URL_SECRET` | C11 · C59 · C75 · C78 | - |
| startup config: migração 0005 (3 assemblies) | db de teste; harness da API (SQL `photos`); serviço `migrate` do compose (o `api` depende dele) | C1 · C11 · C78 (`psql ... from photos`, `compose.test.ts:433-434`) | - |
| startup config: bucket privado (2) | `startMinio`; `storage-init` `mc mb --ignore-existing` em `compose.yaml` | C43 · C60 | - |
| startup config: Sharp carregado (3) | harness; `dist/main.js:2161` `import sharp from "sharp"` no topo (externo, então a subida do C59 carrega o sharp); imagem alpine | C26 · C59 · C78 | - |
| startup config: teto de 5 MiB (2) | `photo-upload.ts:6,34`; origem do web na stack | C21 · C78 (5 242 880 → 201, 5 242 881 → 413) | - |
| startup config: IP e UA (2) | harness; proxy do web na stack | C57 · C78 (`:439`) | - |
| startup config: rota sem sessão (1) | tabela de rotas do `startApi` | C74 | - |

Conjuntos procurados que não tinham linha: nenhum além do 503 da rota de arquivo. A linha `Handoff` do
builder também cita "linha existe e o objeto sumiu → 404" (`photos.service.ts:166`, exceção que não é
`StorageUnavailable`). O status 404 em si está provado (C41), mas esse ramo não: fica como observação, porque o
status já é membro provado.

Nenhuma lacuna de nível: todo claim que nomeia status, rota ou forma de resposta (C11-C58, C71-C74, C76, C77)
tem a prova na fronteira HTTP do `startApi`; C61-C70 no navegador; C78-C80 na stack real. C6-C10 são claims do
próprio nível (função, schema), e a fronteira correspondente está coberta por C31, C34, C38-C41 e C72.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, por HTTP e com armazenamento | `photo-upload.ts`, `photo-image.ts`, `photos.service.ts` (upload/remove) | fronteira HTTP com Postgres e MinIO reais lendo photos/audit/bucket: C11-C33, C47-C57 | yes: um caso por linha da tabela nas duas bordas (C21, C23, C24); `snapshotOf` (linhas, contagem de audit, chaves) ou `expectNothingWritten` em todo caso que não grava |
| Decide, ramos que a rota não separa | `photo-signer.ts`, `photo-keys.ts` | fronteira e próprio nível | yes: verificador C8 (próprio nível, todas as formas, `not.toThrow`) + C39/C40/C41 (fronteira 200/403/404); chave C6 + C31 |
| Falha de dependência | `photos.service.ts` (gravação, remoção, leitura do arquivo), `photo-storage.ts`, `health` | proxy `flakyStorage` ou endpoint fora, na fronteira | no: envio (C32 por variante + fora), rollback (C33), órfão (C50) e /health (C58 pendurado) estão cobertos, mas a leitura da rota de arquivo com o armazenamento fora (`photos.service.ts:165-169` → `503 storage_unavailable`) não tem nenhuma prova |
| Instrumentação | controller de repasse, `ACTION_LABELS`, cliente S3, `initialsOf`/`StudentPhoto` | nenhuma própria | yes: coberta por quem consome; o mutante em `initialsOf` morreu em C62 |

Swept `existing` relido no código: `guard_matrix_three_declarations_five_callers` (`access.test.ts:49`),
`admin_without_2fa_gets_403_everywhere_else` (`enrollment.test.ts:36`), checagem de origem `csrf.ts:25`
(`csrf_rejected`), `@Public()` só nas 4 rotas; Observable `.env.example` → `env_example_lists_every_required_key`
(`repo.test.ts:34`). Os testes herdados citados nos Notes (`ficha_404_for_non_uuid_and_unknown_uuid`
`students-read.test.ts:80`, `five_routes_401_without_session` `students-create.test.ts:308`,
`six_invalid_query_parameters_422_on_path` `students-search.test.ts:211`) existem. Todas as restrições citadas estão
presentes.

Pontos de atenção do pedido:
- Desvio nº 4 do batch 2 (iniciais em pseudo-elemento): `student-photo.tsx:39-40` põe `data-initials={initialsOf(name)}` com `before:content-[attr(data-initials)]`; C62 lê o `content` computado do `::before` do elemento com papel `img` e rótulo "Sem foto", e compara com as iniciais exatas. A maiúscula é aplicada em JS (`students.ts:36-40`), não por `text-transform`, então o valor computado é o que aparece na tela. Um mutante plausível (`words[1]` no lugar de `words.at(-1)`) foi morto ("JD" ≠ "JS"). A C62 prova as iniciais. Ela não prova que o elemento é circular (`rounded-full`): isso é estilo, e as iniciais na lista (célula "Nome") só têm o rótulo provado (C69).
- C60: o pedido anônimo vai a uma chave inexistente (`photos/main/x/y/thumb.webp`). Ainda discrimina, porque um bucket público responderia 404, e não 403.

## Faults injected

Worktree isolado (`git worktree add --detach <scratchpad>/wt HEAD`, `pnpm install --prefer-offline`), uma falha por
vez, revertida com `git checkout -- .` entre elas. `git status --porcelain` da árvore real antes e depois: `?? CLAUDE.md`
nos dois (idêntico). O worktree foi removido e podado.

| Mutation | Location | Killed |
| --- | --- | --- |
| `fileSize: MAX_FILE_BYTES + 1` → `+ 2` (teto do Busboy um byte acima) | `apps/api/src/photos/photo-upload.ts:34` | yes: C21 `5 242 881 bytes: expected 201 to be 413` |
| `Number(exp) * 1000 > Date.now()` → `> Date.now() - 2000` (tolerância em `exp`) | `apps/api/src/photos/photo-signer.ts:36` | yes: C8 `exp igual a T - 1 s: expected true to be false` |
| `Cache-Control` `no-store` → `private, max-age=300` | `apps/api/src/photos/photos.controller.ts:65` | yes: C38 `expected 'private, max-age=300' to be 'no-store'` |
| remoção dos objetos depois do commit pulada (`removed.slice(0, 0)`) | `apps/api/src/photos/photos.service.ts:116` | yes: C47 `admin: objetos: expected [ …(3) ] to deeply equal []` |
| iniciais com a segunda palavra no lugar da última | `apps/web/src/lib/students.ts:39` | yes: C62 `João da Silva: Expected "JS" Received "JD"` |

O limite de 5 mutações foi atingido. O recorte centralizado (`photo-image.ts:55`) e o corte de `photoUrl` por perfil
não foram mutados. As asserções deles (C27 com a faixa das colunas 0-99, C45/C46 com chaves exatas por perfil) foram
lidas e fixam o valor que o check define.

## Gate

`pnpm verify` - 21 tarefas com sucesso, 21 no total (api 320 passaram, web Playwright 97 passaram, repo 9 passaram, 0 falharam). `tests/stack`, rodado à parte: 4 nomeados passaram (C60, C78, C79, C80).

## Ranked gaps

1. Status fora da `Surface` sem prova: `GET /api/photo-files/:photoId/:variant` responde `503 storage_unavailable` com o armazenamento fora (`apps/api/src/photos/photos.service.ts:165-169`), e nenhum check ou teste o afirma. A linha "Falha de dependência" da `Test policy` fica sem cumprimento. Correção: um check (ou uma decisão no plano), mais uma prova com o endpoint fora na rota de arquivo, que afirme status, código e corpo sem dado do armazenamento.
2. C80, lacuna de precisão: o claim diz "nunca é criado" e a prova (`tests/stack/compose.test.ts:515-521`) aceita `State: created`, nunca iniciado. Reescrever o claim para "nunca é iniciado" (o que a prova e o compose de fato garantem), ou endurecer a prova.
