# Pipeline de foto do aluno verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: f3797aa..0e04c4a
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

As duas lacunas da rodada 1 estão fechadas. (1) A rota `GET /api/photo-files/:photoId/:variant` com o armazenamento fora
(`503 storage_unavailable`) agora tem o check C81 e uma prova que afirma os valores que o check define; a linha
"Falha de dependência" da `Test policy` passa a estar cumprida. (2) A C80 foi reescrita de "nunca é criado" para "nunca é
iniciado", e a prova (`State` `created`, `StartedAt` zerado) afirma exatamente isso. As 82 provas nomeadas (81 checks, a
C65 tem duas) existem, rodaram no HEAD `0e04c4a` e passaram. 5 mutantes injetados, 5 mortos. `pnpm verify --force`
verde (21 tarefas, 0 em cache).

Escopo da rodada 2 (verify.md, "Re-verifying after a fix"): `git diff 1b57402..HEAD` toca só `.specs/` (STATE, checks,
plan, verification) e um arquivo de código, `apps/api/test/photos-urls.test.ts` (+21 linhas, o teste da C81). Nada em
`apps/`, `packages/`, `tests/`, `compose.yaml` nem `Dockerfile` mudou. Por isso: provas, Coverage das linhas tocadas,
`Test policy`, citações do arquivo tocado e fault injection estão `verified at 0e04c4a`; o resto está `carried from 1b57402`.

## Binding sources

carried from 1b57402. O perfil é `standard`, então o passo 1 (`ui`) não roda. `plan.md` (Surface, Landing, Relations,
Criteria) foi lido por inteiro de novo nesta rodada e usado como autoridade na Coverage; o parágrafo da `Surface`
acrescentado em `3085cb0` (`plan.md:107`) foi lido e confere com a C81: a linha aprovada de `GET /api/photo-files/...` não foi
reescrita, e o acréscimo diz `503` com `code` `storage_unavailable`, e que a linha existente com objeto sumido continua `404`.

## Checks

verified at 0e04c4a. As provas rodaram em uma invocação por alvo, no HEAD `0e04c4a`:
- `packages/database`: `vitest run test/photos.test.ts -t "<5 nomes>" --reporter=verbose`, 5 passaram
- `apps/api`: `vitest run` em 14 arquivos com `-t "^(<61 nomes>)$" --reporter=verbose`, 61 passaram e 36 foram pulados (inclui o teste novo da C81)
- `apps/web`: `playwright test e2e/photos.spec.ts e2e/audit.spec.ts -g "<11 nomes>"`, 11 passaram
- `tests/repo`: `vitest run repo.test.ts -t env_example_documents_photo_variables_and_secret_command`, 1 passou
- `tests/stack`: `vitest run compose.test.ts -t "<4 nomes>" --reporter=verbose`, 4 passaram e 10 foram pulados (C60, C78, C79, C80, todos provados por `compose.test.ts -t`)

Cada nome aparece individualmente como ✓/ok na saída do runner (a saída da API lista os 61 como `✓ test/<arquivo> > <nome>`).
Cada nome também foi localizado por `rg -n -F "'<nome>'"` no arquivo da prova, e a linha onde o teste é declarado está
citada na coluna "Proof run". Nenhum nome ficou sem resultado (0 de 82 sem hit). O arquivo tocado pelo diff é só
`photos-urls.test.ts`: a prova da C81 é nova e é o único teste que a feature acrescentou na rodada; as linhas de
asserção das C42 a C46 foram refrescadas (+21), as demais asserções estão `carried from 1b57402` (arquivos sem diff).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | FK sem cascata bloqueia DELETE | db: `student_foreign_key_without_cascade_blocks_delete` ✓ (declarado em `packages/database/test/photos.test.ts:74`) | `packages/database/test/photos.test.ts:82` - `toEqual({ delete_rule: 'NO ACTION', references: 'students' })`; `:97` `failure.code).toBe(FOREIGN_KEY_VIOLATION)`; `:98-99` linhas `to_jsonb` iguais | PASS |
| C2 | uuidv7 e NOT NULL | db: `defaults_uuidv7_and_not_null` ✓ (declarado em `packages/database/test/photos.test.ts:102`) | `photos.test.ts:109` `photo!.version).toBe(7)`; `:118` `toBe(NOT_NULL_VIOLATION)` para os 3 campos | PASS |
| C3 | CHECK version, UNIQUE por aluno | db: `version_check_and_unique_per_student` ✓ (declarado em `packages/database/test/photos.test.ts:123`) | `photos.test.ts:129` `toBe(CHECK_VIOLATION)` para 0 e -1; `:131` `toBe(UNIQUE_VIOLATION)`; `:136` outro aluno convive | PASS |
| C4 | índice parcial uma corrente | db: `partial_unique_index_one_current_per_student` ✓ (declarado em `packages/database/test/photos.test.ts:139`) | `photos.test.ts:145-146` `UNIQUE_VIOLATION` e `toContain('photos_one_current_idx')`; `:151` 3 linhas; `:155` | PASS |
| C5 | 0005 só cria photos, sem tenant/owner | db: `migration_0005_adds_only_photos_without_tenant_or_owner_columns` ✓ (declarado em `packages/database/test/photos.test.ts:158`) | `photos.test.ts:175` `toEqual([...before, 'photos'].sort())`; `:181` `not.toContain(forbidden)` | PASS |
| C6 | formato da chave e recusas | api: `key_shape_for_three_variants_and_rejects_foreign_segments` ✓ (declarado em `apps/api/test/photo-keys.test.ts:5`) | `apps/api/test/photo-keys.test.ts:10` `toBe(\`photos/main/${studentId}/${photoId}/${variant}.webp\`)`; `:14`, `:17-18` `toThrow()` | PASS |
| C7 | HMAC-SHA256 base64url | api: `sign_matches_hmac_sha256_base64url_of_id_variant_exp` ✓ (declarado em `apps/api/test/photo-signer.test.ts:18`) | `apps/api/test/photo-signer.test.ts:26` `signed).toBe(\`/api/photo-files/...?exp=${exp}&sig=${expected}\`)` (expected por `node:crypto`, `:8`); `:29` outro segredo `not.toBe(signed)` | PASS |
| C8 | verify true/8 formas false sem lançar | api: `verify_true_once_and_false_for_eight_forms_without_throwing` ✓ (declarado em `apps/api/test/photo-signer.test.ts:33`) | `photo-signer.test.ts:46` `attempt({})).toBe(true)`; `:63` `not.toThrow()`; `:64` `run(), name).toBe(false)` em todas as formas | PASS |
| C9 | 18 ações, duas novas no fim | api: `audit_actions_end_with_two_photo_actions_in_order` ✓ (declarado em `apps/api/test/contracts.test.ts:372`) | `apps/api/test/contracts.test.ts:373` `toHaveLength(18)`; `:374-391` as 16 em ordem; `:392` `slice(16)).toEqual(['student.photo_uploaded','student.photo_removed'])` | PASS |
| C10 | schemas de foto aceitam/recusam | api: `photo_schemas_accept_and_reject_and_student_gains_photo_url` ✓ (declarado em `apps/api/test/contracts.test.ts:396`) | `contracts.test.ts:403-404` texto/null/ausente; `:410` POST sem campo `false`; `:416` GET sem campo `false`; `:419-420` variantes | PASS |
| C11 | POST 201 admin/reception v1 | api: `upload_201_by_admin_and_reception_version_1` ✓ (declarado em `apps/api/test/photos-upload.test.ts:37`) | `apps/api/test/photos-upload.test.ts:45` `toBe(201)`; `:46` chaves `['createdAt','id','version']`; `:47` version 1; `:49` id = linha; `:50` is_current; `:51` ISO | PASS |
| C12 | 409 photo_exists sem mudar nada | api: `second_upload_409_photo_exists_leaves_rows_and_objects` ✓ (declarado em `apps/api/test/photos-upload.test.ts:55`) | `photos-upload.test.ts:65-69` `toBe(409)`, `code 'photo_exists'`, contagem, linha e chaves iguais | PASS |
| C13 | 10 pares concorrentes | api: `ten_concurrent_pairs_one_201_one_409_three_objects` ✓ (declarado em `apps/api/test/photos-upload.test.ts:72`) | `photos-upload.test.ts:83` `toEqual([201, 409])`; `:85` photo_exists; `:87` 1 linha; `:88-90` 3 chaves da linha | PASS |
| C14 | POST 404 abc/uuid nada gravado | api: `post_404_for_bad_and_unknown_id_writes_nothing` ✓ (declarado em `apps/api/test/photos-upload.test.ts:94`) | `photos-upload.test.ts:100-101` 404 `not_found`; `:104` `snapshotOf(...)).toEqual(before)` | PASS |
| C15 | hr_finance/instructor 403 | api: `hr_finance_and_instructor_403_on_post_and_delete` ✓ (declarado em `apps/api/test/photos-upload.test.ts:107`) | `photos-upload.test.ts:121-124` 403 `forbidden` x4; `:128` snapshot igual; `:130` 3 objetos | PASS |
| C16 | 401 nas 3 rotas | api: `three_photo_routes_401_without_session` ✓ (declarado em `apps/api/test/photos-upload.test.ts:133`) | `photos-upload.test.ts:144-145` `toBe(401)`, `'unauthorized'` | PASS |
| C17 | inactive/suspended aceitam | api: `inactive_and_suspended_students_accept_upload_and_removal` ✓ (declarado em `apps/api/test/photos-upload.test.ts:149`) | `photos-upload.test.ts:157-158` 201 e 204 | PASS |
| C18 | magic bytes decidem | api: `accepted_by_magic_bytes_whatever_name_and_part_type` ✓ (declarado em `apps/api/test/photos-validation.test.ts:56`) | `apps/api/test/photos-validation.test.ts:70` `toBe(201)` nos 3 casos (`:60-68`) | PASS |
| C19 | 5 conteúdos 415 | api: `five_non_image_contents_415_writes_nothing` ✓ (declarado em `apps/api/test/photos-validation.test.ts:73`) | `photos-validation.test.ts:82` 5 casos; `:87` → `:47-50` status 415, `unsupported_media_type`, sem linha/objeto | PASS |
| C20 | corpos não multipart 415 | api: `non_multipart_bodies_415` ✓ (declarado em `apps/api/test/photos-validation.test.ts:91`) | `photos-validation.test.ts:111` → `:47-50` | PASS |
| C21 | 5 MiB e +1, em partes | api: `size_limit_at_5_mib_and_one_byte_over_also_chunked` ✓ (declarado em `apps/api/test/photos-validation.test.ts:115`) | `photos-validation.test.ts:119` tamanhos exatos; `:122` 201; `:125` 413 `payload_too_large`; `:128-134` em partes (`ReadableStream`, `support/photos.ts:150`) | PASS |
| C22 | parte file faltando/duplicada 422 | api: `missing_or_duplicate_file_part_422_on_path_file` ✓ (declarado em `apps/api/test/photos-validation.test.ts:137`) | `photos-validation.test.ts:162` → `:49` `errors.map(path)).toContain('file')` | PASS |
| C23 | mínimo 300×400 após orientação | api: `minimum_300x400_after_orientation_five_cases` ✓ (declarado em `apps/api/test/photos-validation.test.ts:166`) | `photos-validation.test.ts:178-179` 201 / 422 com path `file`, 5 casos | PASS |
| C24 | teto 40 MP | api: `pixel_ceiling_at_40_million` ✓ (declarado em `apps/api/test/photos-validation.test.ts:183`) | `photos-validation.test.ts:186` 201 para 8000×5000; `:194` 422 path `file` | PASS |
| C25 | truncado/lixo 422 | api: `truncated_or_garbage_after_magic_422_on_path_file` ✓ (declarado em `apps/api/test/photos-validation.test.ts:198`) | `photos-validation.test.ts:210` | PASS |
| C26 | 3 WebP de tamanho exato | api: `three_webp_variants_exact_sizes_right_after_201` ✓ (declarado em `apps/api/test/photos-variants.test.ts:62`) | `apps/api/test/photos-variants.test.ts:74` chaves; `:79` `format).toBe('webp')`; `:80` `toEqual(SIZES[variant])` | PASS |
| C27 | recorte centralizado | api: `center_crop_without_distortion_four_images` ✓ (declarado em `apps/api/test/photos-variants.test.ts:85`) | `photos-variants.test.ts:94-95`, `:100` sem vermelho, `:105-109` | PASS |
| C28 | EXIF 1-8 | api: `exif_orientation_one_to_eight_read_upright` ✓ (declarado em `apps/api/test/photos-variants.test.ts:124`) | `photos-variants.test.ts:145` `found).toEqual(upright)`; `:154-155` | PASS |
| C29 | sem EXIF/GPS/marcador | api: `no_exif_gps_or_marker_bytes_in_any_variant_of_three_formats` ✓ (declarado em `apps/api/test/photos-variants.test.ts:165`) | `photos-variants.test.ts:183-185` | PASS |
| C30 | original em lugar nenhum | api: `original_kept_nowhere_bucket_or_tmpdir` ✓ (declarado em `apps/api/test/photos-variants.test.ts:190`) | `photos-variants.test.ts:200`, `:202`, `:203` sha256 diferente, `:204/:208/:212` `readdirSync(empty)).toEqual([])` | PASS |
| C31 | chave só de ids | api: `keys_built_only_from_ids_and_variant_whatever_the_client_sends` ✓ (declarado em `apps/api/test/photos-variants.test.ts:222`) | `photos-variants.test.ts:243` 3; `:245` `toMatch(pattern)` | PASS |
| C32 | falha de armazenamento 503 | api: `storage_failure_on_each_variant_and_down_503_leaves_nothing` ✓ (declarado em `apps/api/test/photos-variants.test.ts:250`) | `photos-variants.test.ts:274-276` 503, `storage_unavailable`, snapshot (linhas, auditoria, chaves) igual | PASS |
| C33 | transação falha, objetos removidos | api: `transaction_failure_after_upload_rolls_back_rows_and_removes_objects` ✓ (declarado em `apps/api/test/photos-variants.test.ts:286`) | `photos-variants.test.ts:294-297` 500 `internal_error`, snapshot, sem chaves | PASS |
| C34 | URL para 4 perfis, exp +300 | api: `url_for_four_profiles_expires_300s_after_response` ✓ (declarado em `apps/api/test/photos-urls.test.ts:70`) | `apps/api/test/photos-urls.test.ts:79-81` 200, regex `exp=${T + 300}`, `expiresAt`; `:85` large | PASS |
| C35 | padrão medium | api: `variant_defaults_to_medium` ✓ (declarado em `apps/api/test/photos-urls.test.ts:88`) | `photos-urls.test.ts:93` | PASS |
| C36 | variant inválido 422 | api: `invalid_variant_422_on_path_variant` ✓ (declarado em `apps/api/test/photos-urls.test.ts:96`) | `photos-urls.test.ts:103-105` | PASS |
| C37 | GET foto 404 x3 | api: `photo_url_404_for_unknown_bad_and_photoless` ✓ (declarado em `apps/api/test/photos-urls.test.ts:109`) | `photos-urls.test.ts:115-116` | PASS |
| C38 | arquivo 200 sem sessão | api: `signed_url_serves_three_variants_without_session` ✓ (declarado em `apps/api/test/photos-urls.test.ts:120`) | `photos-urls.test.ts:128-132` 200, `image/webp`, `no-store`, bytes iguais | PASS |
| C39 | exp ±1 s | api: `expired_signature_403_one_second_either_side` ✓ (declarado em `apps/api/test/photos-urls.test.ts:136`) | `photos-urls.test.ts:144` 200; `:149-152` 403, `invalid_signature`, problem+json, sem `RIFF` | PASS |
| C40 | 13 adulterações e id desconhecido 403 | api: `thirteen_tampered_requests_403_and_unknown_id_is_not_a_404` ✓ (declarado em `apps/api/test/photos-urls.test.ts:155`) | `photos-urls.test.ts:187` 14 entradas; `:194-196` 403, `invalid_signature`, problem+json | PASS |
| C41 | assinatura válida, foto ausente 404 | api: `valid_signature_for_missing_photo_404` ✓ (declarado em `apps/api/test/photos-urls.test.ts:201`) | `photos-urls.test.ts:207-208`, `:212-213` | PASS |
| C42 | nada de armazenamento nas respostas | api: `no_storage_address_key_or_credential_in_any_response` ✓ (declarado em `apps/api/test/photos-urls.test.ts:243`) | `photos-urls.test.ts:267` os 12 status; `:273-275` (linhas refrescadas no HEAD, +21 pela C81) | PASS |
| C43 | bucket anônimo 403 | api: `anonymous_request_to_bucket_403_for_objects_and_listing` ✓ (declarado em `apps/api/test/photos-urls.test.ts:283`) | `photos-urls.test.ts:290`, `:292` (linhas refrescadas no HEAD, +21 pela C81) | PASS |
| C44 | segredos fora do log | api: `five_secrets_never_reach_the_log` ✓ (declarado em `apps/api/test/photos-urls.test.ts:296`) | `photos-urls.test.ts:312` log capturado; `:320` `includes(value)).toBe(false)`; captura stdout/stderr/console em `support/log.ts:10-14` (linhas refrescadas no HEAD, +21 pela C81) | PASS |
| C45 | photoUrl da ficha medium, 4 perfis | api: `ficha_photo_url_medium_for_four_profiles_null_when_absent` ✓ (declarado em `apps/api/test/photos-urls.test.ts:346`) | `photos-urls.test.ts:357` `toBe(signer.sign(currentId,'medium',T+300))`; `:358` chaves por perfil; `:361-362` presente e null (linhas refrescadas no HEAD, +21 pela C81) | PASS |
| C46 | photoUrl da lista thumb | api: `list_photo_url_thumb_per_item_for_four_profiles_no_duplicates` ✓ (declarado em `apps/api/test/photos-urls.test.ts:366`) | `photos-urls.test.ts:380` sem duplicata; `:382-384`; `:386` chaves (linhas refrescadas no HEAD, +21 pela C81) | PASS |
| C47 | DELETE 204 e efeitos | api: `delete_204_removes_row_objects_and_every_way_to_see_it` ✓ (declarado em `apps/api/test/photos-delete.test.ts:36`) | `apps/api/test/photos-delete.test.ts:45-56` | PASS |
| C48 | DELETE sem foto não muda nada | api: `delete_without_photo_204_changes_nothing` ✓ (declarado em `apps/api/test/photos-delete.test.ts:60`) | `photos-delete.test.ts:66-67` | PASS |
| C49 | DELETE 404 | api: `delete_404_for_bad_and_unknown_id` ✓ (declarado em `apps/api/test/photos-delete.test.ts:70`) | `photos-delete.test.ts:74-75` | PASS |
| C50 | remoção de objetos falha, ainda 204 | api: `object_removal_failure_still_204_and_logs_photo_id_only` ✓ (declarado em `apps/api/test/photos-delete.test.ts:79`) | `photos-delete.test.ts:91-104` | PASS |
| C51 | reenvio v1 | api: `upload_after_removal_201_version_1` ✓ (declarado em `apps/api/test/photos-delete.test.ts:112`) | `photos-delete.test.ts:119-120` | PASS |
| C52 | linha photo_uploaded | api: `upload_writes_one_photo_uploaded_row_with_null_diff` ✓ (declarado em `apps/api/test/photos-audit.test.ts:47`) | `apps/api/test/photos-audit.test.ts:54-62` `toHaveLength(1)`, `toMatchObject({action, user_id, entity, entity_id, diff: null})` | PASS |
| C53 | linha photo_removed | api: `delete_writes_one_photo_removed_row_with_null_diff` ✓ (declarado em `apps/api/test/photos-audit.test.ts:66`) | `photos-audit.test.ts:73-81` | PASS |
| C54 | 10 desfechos sem linha | api: `ten_non_writing_outcomes_write_no_audit_row` ✓ (declarado em `apps/api/test/photos-audit.test.ts:85`) | `photos-audit.test.ts:107` 10 casos; `:114-115` status e contagem iguais | PASS |
| C55 | auditoria falha no DELETE | api: `audit_failure_on_delete_keeps_row_and_objects` ✓ (declarado em `apps/api/test/photos-audit.test.ts:122`) | `photos-audit.test.ts:132-136` | PASS |
| C56 | nome/chave/conteúdo fora | api: `file_name_key_and_content_never_reach_audit_or_log` ✓ (declarado em `apps/api/test/photos-audit.test.ts:142`) | `photos-audit.test.ts:157-161` | PASS |
| C57 | ip e user_agent | api: `ip_and_user_agent_on_the_two_photo_actions` ✓ (declarado em `apps/api/test/photos-audit.test.ts:199`) | `photos-audit.test.ts:209-211`, `:218` | PASS |
| C58 | /health storage | api: `health_storage_up_down_missing_bucket_and_hanging` ✓ (declarado em `apps/api/test/health.test.ts:55`) | `apps/api/test/health.test.ts:73-78` status, `toEqual({status, checks:{database:'up', storage}})`, `<= 3000` | PASS |
| C59 | env de foto rejeitado | api: `photo_env_rejected_exits_1_naming_var_without_values` ✓ (declarado em `apps/api/test/boot.test.ts:223`) | `apps/api/test/boot.test.ts:233-237` status 1, nome, sem valores; `:256` 32 caracteres sobe (`dist/main.js` reconstruído pelo `globalSetup` `test/support/build.ts`) | PASS |
| C60 | bucket privado, portas em loopback | stack: `storage_bucket_exists_private_and_ports_on_loopback` ✓ (declarado em `tests/stack/compose.test.ts:358`) | `tests/stack/compose.test.ts:366` `mc ls` com status 0; `:377-378` 403 anônimo; `:386-387` `host_ip` `127.0.0.1` | PASS |
| C61 | img com alt | web: `ficha_shows_photo_with_alt_text` ok (declarado em `apps/web/e2e/photos.spec.ts:69`) | `apps/web/e2e/photos.spec.ts:76-77` `toHaveAttribute('src', PHOTO_URL)` | PASS |
| C62 | iniciais para 5 nomes | web: `initials_circle_for_five_names_labelled_sem_foto` ok (declarado em `apps/web/e2e/photos.spec.ts:80`) | `photos.spec.ts:94` role img "Sem foto"; `:95` `getComputedStyle(::before).content` igual a `"${initials}"` (helper `:66-67`) | PASS |
| C63 | imagem quebrada vira iniciais | web: `broken_image_falls_back_to_initials_on_ficha_and_list` ok (declarado em `apps/web/e2e/photos.spec.ts:99`) | `photos.spec.ts:109-110`, `:114-115` | PASS |
| C64 | área, accept, duas vias | web: `upload_area_button_accept_and_both_ways_send_multipart_file_part` ok (declarado em `apps/web/e2e/photos.spec.ts:118`) | `photos.spec.ts:126-130`, `:153-158` | PASS |
| C65 | "Enviando…" e foto nova | web: `upload_button_disabled_with_enviando_while_waiting` ok (declarado em `apps/web/e2e/photos.spec.ts:162`), `successful_upload_shows_the_new_photo` ok (declarado em `apps/web/e2e/photos.spec.ts:176`) | `photos.spec.ts:172-173`; `:191-194` | PASS |
| C66 | 6 mensagens de erro | web: `six_upload_errors_show_their_messages_and_keep_the_form` ok (declarado em `apps/web/e2e/photos.spec.ts:197`) | `photos.spec.ts:219-221` | PASS |
| C67 | remoção confirma pelo nome | web: `remove_photo_confirms_naming_the_student_then_deletes` ok (declarado em `apps/web/e2e/photos.spec.ts:225`) | `photos.spec.ts:241-254` | PASS |
| C68 | perfis só leitura sem controles | web: `read_only_profiles_see_photo_or_initials_without_controls` ok (declarado em `apps/web/e2e/photos.spec.ts:258`) | `photos.spec.ts:268-272` | PASS |
| C69 | miniatura/iniciais na célula Nome | web: `list_cell_name_has_thumbnail_or_initials_for_four_roles` ok (declarado em `apps/web/e2e/photos.spec.ts:277`) | `photos.spec.ts:296-314` | PASS |
| C70 | rótulos do /audit e filtro com 18 | web: `photo_actions_labelled_and_filter_has_eighteen` ok (declarado em `apps/web/e2e/audit.spec.ts:502`) | `apps/web/e2e/audit.spec.ts:511-519` | PASS |
| C71 | paths do OpenAPI | api: `photo_paths_and_query_parameters_come_from_contract_schema` ✓ (declarado em `apps/api/test/openapi.test.ts:174`) | `apps/api/test/openapi.test.ts:178-191` | PASS |
| C72 | corpos reais batem com o contrato | api: `photo_bodies_match_contract_schemas` ✓ (declarado em `apps/api/test/contracts.test.ts:572`) | `contracts.test.ts:603` 12 casos; `:609-610`; `:613` | PASS |
| C73 | 5 códigos conhecidos | api: `photo_codes_are_known_problem_codes` ✓ (declarado em `apps/api/test/contracts.test.ts:616`) | `contracts.test.ts:637-641` | PASS |
| C74 | só 4 rotas abertas | api: `only_four_routes_answer_without_session` ✓ (declarado em `apps/api/test/access.test.ts:145`) | `apps/api/test/access.test.ts:155-157`, `:161-166` | PASS |
| C75 | .env.example | repo: `env_example_documents_photo_variables_and_secret_command` ✓ (declarado em `tests/repo/repo.test.ts:50`) | `tests/repo/repo.test.ts:54`, `:62`, `:64` | PASS |
| C76 | 2FA 403 nas rotas de foto | api: `admin_without_2fa_gets_403_everywhere_else` ✓ (declarado em `apps/api/test/enrollment.test.ts:36`) | `apps/api/test/enrollment.test.ts:46-47`; `:69-71` na lista | PASS |
| C77 | CSRF 403 | api: `foreign_origin_403_csrf_on_multipart_post_and_delete` ✓ (declarado em `apps/api/test/photos-upload.test.ts:162`) | `photos-upload.test.ts:179-185` | PASS |
| C78 | envio pela origem do web na stack | stack: `photo_uploaded_through_web_served_by_signed_url_with_audit_row` ✓ (declarado em `tests/stack/compose.test.ts:390`) | `compose.test.ts:418`, `:421`, `:426-430`, `:434`, `:439`, `:443-445` | PASS |
| C79 | health da stack com storage parado | stack: `health_storage_up_then_down_when_storage_stops` ✓ (declarado em `tests/stack/compose.test.ts:448`) | `compose.test.ts:450-451`, `:458-459` | PASS |
| C80 | init do bucket falha, api "nunca é iniciado" (claim reescrito na rodada 1) | stack: `api_never_starts_when_bucket_init_fails` ✓ (declarado em `tests/stack/compose.test.ts:506`) | `compose.test.ts:509-513` init `exited` com ExitCode diferente de 0 e `up.status` diferente de 0; `:515-521` `if (api) { expect(api.State).toBe('created'); expect(startedAt.output.trim()).toBe('0001-01-01T00:00:00Z') }`. A prova afirma "criado no máximo, nunca iniciado", que é exatamente o claim reescrito; a falha injetada que deixa a `api` iniciar foi morta com `expected 'running' to be 'created'` | PASS |
| C81 | rota de arquivo com armazenamento fora: 503 `storage_unavailable`, `problem+json`, sem dado do armazenamento | api: `file_route_503_storage_unavailable_without_storage_data_when_storage_is_down` ✓ (declarado em `apps/api/test/photos-urls.test.ts:216`) | `photos-urls.test.ts:223` `expect(response.status).toBe(503)`; `:224` `content-type` casa `/^application\/problem\+json/`; `:225` `(await problem(response.clone())).code).toBe('storage_unavailable')`; `:228-229` nenhum de (host do endpoint morto, host do MinIO real, nome do bucket, `photos/main/`, chave de acesso, chave secreta) aparece em cabeçalhos+corpo; `:230` `headers.filter(startsWith('x-amz-'))).toEqual([])`; `:231` `text.includes('RIFF')).toBe(false)`. O endpoint é uma porta sem ouvinte (`freePort`, `:219`) e a URL vem de uma foto real assinada pela API de pé (`:217-218`), então a assinatura é válida e a linha existe | PASS |

Julgamento das duas lacunas da rodada 1, com ceticismo:

- C81. A prova usa um endpoint sem ouvinte (`freePort`, `photos-urls.test.ts:219`) numa segunda API (`apiWith`) sobre o mesmo
  banco e o mesmo `PHOTO_URL_SECRET`, e pede a URL assinada de uma foto que existe (`:217-218`, `studentWithPhoto` mais
  `urlOf`). Se a assinatura fosse inválida a resposta seria `403`, e se a linha não existisse `404`; a asserção `503` (`:223`)
  só passa pelo ramo `photos.service.ts:165-169`. A lista de proibidos (`:228`) é a do check: endereço do armazenamento
  (o morto e o real), nome do bucket, `photos/main/`, chave de acesso, chave secreta; mais `x-amz-` (`:230`) e `RIFF` (`:231`).
  O check também diz "nem bytes de imagem": `RIFF` cobre o WebP que o servidor entrega, e a resposta é `problem+json`
  (`:224`). Alvo certo, valores do check, sem lacuna de precisão. Nível: HTTP real do `startApi`, a fronteira do claim.
- C80. O claim reescrito ("nunca é iniciado") e a asserção (`State` igual a `created` e `StartedAt` igual a
  `0001-01-01T00:00:00Z`, `compose.test.ts:515-521`) dizem a mesma coisa; o `if (api)` também admite o container ausente, e
  "nunca iniciado" cobre os dois. A prova não mudou desde a rodada 1, e a reescrita foi do claim, não da prova (isso está
  registrado em `checks.md:313` e no Handoff, e foi pedido pela lacuna do Verifier). Precisão fechada; mutante da `depends_on`
  morto (ver Faults injected).

## Coverage

verified at 0e04c4a para as linhas que a correção tocou ou que recomputei no HEAD; as demais `carried from 1b57402` (nenhum
arquivo de produção mudou desde então, e as provas das linhas carregadas todas passaram de novo acima). Recalculada a partir
do plano (`Surface`, `Landing`, `Relations`, Criteria, mais o parágrafo da `Surface` de `plan.md:107`) e do código
(`photos.controller.ts`, `photos.service.ts`).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/photo-files/:photoId/:variant` statuses (4), verified at 0e04c4a | plan Surface (`:103` mais o acréscimo `:107`) | 200 C38 · 403 C39, C40 · 404 C41 · 503 C81 | - |
| statuses que o código emite fora da `Surface` (3), verified at 0e04c4a | `rg ProblemException apps/api/src/photos`: `photos.service.ts:46,55,70,93,168`, `photo-upload.ts:24,87`, `photos.controller.ts:75` | POST 500 C33 · DELETE 500 C55 · o `503` da rota de arquivo (`photos.service.ts:168`) saiu do conjunto: agora é membro da `Surface` acrescentada, provado por C81 | - |
| `POST /api/students/:id/photo` statuses (9) carried from 1b57402, re-confirmado no código | plan Surface; códigos `409` `:46,93`, `415` `:55`, `503` `:70`, `413` `photo-upload.ts:87` | 201 C11 · 401 C16 · 403 C15 · 404 C14 · 409 C12 · 413 C21 · 415 C19 · 422 C22 · 503 C32 | - |
| `GET /api/students/:id/photo` statuses (4) carried from 1b57402 | plan Surface | 200 C34 · 401 C16 · 404 C37 · 422 C36 | - |
| `DELETE /api/students/:id/photo` statuses (4) carried from 1b57402 | plan Surface | 204 C47 · 401 C16 · 403 C15 · 404 C49 | - |
| linha de erro comum da auth-rbac nas rotas novas (2) carried from 1b57402 | plan Surface preamble | 403 csrf C77 · 403 2FA C76 | - |
| rotas existentes cuja resposta muda (2) carried from 1b57402 | plan Surface | `GET /api/students/:id` C45 · `GET /api/students` C46 | - |
| perfis por rota (POST, GET, DELETE, ficha, lista: 5x4), re-confirmado no HEAD | plan S1/S4/S5 + `@Roles` no controller (`photos.controller.ts:33,44,55`) | POST adm/rec C11, hr/ins C15 · GET 4 C34 · DELETE adm/rec C47, hr/ins C15 · ficha 4 C45 · lista 4 C46 | - |
| rotas sem sessão (4), verified at 0e04c4a | `rg "@Public\(\)" apps/api/src`: `auth.controller.ts:85,124`, `health.controller.ts:20`, `photos.controller.ts:64` | C74 | - |
| one-way doors (7) carried from 1b57402 | plan Landing | 1 C1-C5 · 2 C6, C31 · 3 C43, C60 · 4 C7, C8, C38-C40 · 5 C19, C21, C32 · 6 C9, C52, C53 · 7 C26 | - |
| restrições de Relations (4) e migração 0005 (2) carried from 1b57402 | plan Relations/Landing door 1 | FK sem cascata C1 · uma corrente C4 · versão única C3 · id do banco C2 · só photos C5 · sem tenant/owner C5 | - |
| variantes gravadas / assinadas / entregues (3x3) carried from 1b57402 | AC 16, 24, 25, 28 | C26 · C34+C35 · C38 | - |
| entrada, tamanho, dimensões, pixels, não decodifica, recorte, EXIF, formatos, original, chave, falha de escrita carried from 1b57402 | AC 8-22 | C18 · C19 · C20 · C21 · C22 · C23 · C24 · C25 · C27 · C28 · C29 · C30 · C31 · C32 | - |
| variant inválido / 404 da URL / cabeçalhos do arquivo / bordas de exp / adulterações / formas do verificador carried from 1b57402 | AC 26-31 | C36 · C37 · C38 · C39 · C40 · C8 | - |
| vazamentos de resposta (6) / pedidos anônimos (4) / segredos fora do log (5), verified at 0e04c4a nas linhas | AC 32-34 | C42 (`:267`, `:273-275`) · C43 (`:290`, `:292`) · C44 (`:312`, `:320`); o vazamento na resposta `503` da rota de arquivo (que a C42 não percorre) é provado por C81 | - |
| chaves da ficha/lista por perfil, photoUrl nulo, corrente vs antiga, verified at 0e04c4a nas linhas | AC 35-36, AD-033 | C45 (`:357-362`) · C46 (`:380-386`) | - |
| remoção, auditoria, /health, variáveis, init com falha, tela carried from 1b57402 | AC 37-60 | C47-C51 · C52-C57 · C58 · C79 · C59 · C60 · C80 · C61-C70 | - |
| startup config: `S3_*` + `PHOTO_URL_SECRET` (4 places), re-confirmado no HEAD | `apps/api/test/support/app.ts:14,18-29,55`; filho do boot `boot.test.ts`; `.env.example:30-31`; `compose.yaml:82-86` | C11 · C59 · C75 · C78 | - |
| startup config: migração 0005, bucket privado, Sharp, teto de 5 MiB, IP/UA, rota sem sessão carried from 1b57402 | harness, `startMinio`, `storage-init` do compose, `dist/main.js`, origem do web | C1/C11/C78 · C43/C60 · C26/C59/C78 · C21/C78 · C57/C78 · C74 | - |

Conjuntos procurados que não tinham linha: nenhum. A exceção que a rodada 1 anotou como observação (linha existe e o objeto
sumiu do bucket, `photos.service.ts:166`, `404`) continua com o status provado (C41) e o ramo não, e agora o parágrafo de
`plan.md:107` o nomeia ("a linha existe e o objeto sumiu do bucket continua `404`"). Como o status `404` é membro provado
da `Surface` (C41 prova o `404` por foto removida e por `photoId` inexistente), isso fica como observação, não como
lacuna: nenhum check afirma o ramo e o plano não o promete como AC.

Nenhuma lacuna de nível: todo claim que nomeia status, rota ou forma de resposta (C11-C58, C71-C74, C76, C77, C81) tem a
prova na fronteira HTTP do `startApi`; C61-C70 no navegador; C78-C80 na stack real. C6-C10 são claims do próprio nível.

## Test policy rows

verified at 0e04c4a (as quatro linhas foram rejulgadas; a linha "Falha de dependência" era a única não cumprida).

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, por HTTP e com armazenamento | `photo-upload.ts`, `photo-image.ts`, `photos.service.ts` (upload/remove) | fronteira HTTP com Postgres e MinIO reais lendo photos/audit/bucket: C11-C33, C47-C57 | yes: todas passaram em 0e04c4a; um caso por linha da tabela nas duas bordas (C21, C23, C24) e `snapshotOf` ou `expectNothingWritten` em todo caso que não grava |
| Decide, ramos que a rota não separa | `photo-signer.ts`, `photo-keys.ts` | fronteira e próprio nível | yes: verificador C8 (próprio nível, todas as formas, `not.toThrow`) + C39/C40/C41 (fronteira 200/403/404); chave C6 + C31 |
| Falha de dependência | `photos.service.ts` (gravação, remoção, leitura do arquivo), `photo-storage.ts`, `health` | proxy `flakyStorage` ou endpoint fora, na fronteira | yes: envio (C32 por variante + endpoint fora), rollback (C33), órfão (C50), /health (C58 pendurado) e agora a leitura da rota de arquivo com o endpoint fora (C81, `photos-urls.test.ts:216`, `:223` `toBe(503)`, `:225` `storage_unavailable`) cobrindo `photos.service.ts:165-169`; a prova de C81 usa um endpoint sem ouvinte, que é uma das formas que a linha admite ("endpoint fora"), e a "variante que falha" não se aplica a uma leitura |
| Instrumentação | controller de repasse, `ACTION_LABELS`, cliente S3, `initialsOf`/`StudentPhoto` | nenhuma própria | yes: coberta por quem consome; carried from 1b57402 (o mutante em `initialsOf` morreu em C62) |

Swept `existing` (carried from 1b57402, o código desses arquivos não mudou): `guard_matrix_three_declarations_five_callers`
(`access.test.ts:49`), `admin_without_2fa_gets_403_everywhere_else` (`enrollment.test.ts:36`), checagem de origem `csrf.ts:25`,
`@Public()` só nas 4 rotas (re-confirmado acima), `env_example_lists_every_required_key` (`repo.test.ts:34`). Todas as
restrições citadas continuam presentes.

## Faults injected

verified at 0e04c4a. Worktree isolado (`git worktree add --detach <scratchpad>/wt HEAD`, `pnpm install --prefer-offline`), uma
falha por vez, revertida com `git checkout -- .` entre elas. `git status --porcelain` da árvore real antes e depois: `?? CLAUDE.md`
nos dois (idêntico). O worktree foi removido e podado (`git worktree list` só lista a árvore real). Duas falhas na
superfície nova da C81, uma na C80 (a prova reescrita) e duas em proofs que a rodada 1 não mutou. As mutações da rodada 1
(`photo-upload.ts:34`, `photo-signer.ts:36`, `photos.controller.ts:65`, `photos.service.ts:116`, `students.ts:39`) estão
`carried from 1b57402` e não foram repetidas.

| Mutation | Location | Killed |
| --- | --- | --- |
| `throw new ProblemException(503, 'storage_unavailable')` -> `throw error` (o 503 da leitura do arquivo vira `500`) | `apps/api/src/photos/photos.service.ts:168` | yes: C81 `AssertionError: expected 500 to be 503` |
| o `503` da rota de arquivo passa a emitir o cabeçalho `x-amz-request-id: leak` (vazamento de cabeçalho do armazenamento) | `apps/api/src/photos/photos.service.ts:168` | yes: C81 `expected [ 'x-amz-request-id: leak' ] to deeply equal []` |
| `depends_on.storage-init.condition` `service_completed_successfully` -> `service_started` (a `api` inicia mesmo com o init do bucket falhando) | `compose.yaml:93` | yes: C80 `expected 'running' to be 'created'` |
| recorte `position: 'centre'` -> `'left'` | `apps/api/src/photos/photo-image.ts:55` | yes: C27 `coluna a 0%: expected true to be false` |
| remoção do `.rotate()` (orientação EXIF ignorada) | `apps/api/src/photos/photo-image.ts:54` | yes: C28 `orientação 2, thumb: expected [ 'red', 'green', 'blue', 'yellow' ] to deeply equal [ 'green', 'red', 'yellow', 'blue' ]` |

O limite de 5 mutações foi atingido. O vazamento da chave de objeto ou do endereço no corpo do `503` da rota de arquivo
não foi mutado separadamente: a asserção `:228-229` é a mesma de C42 (`:273`), e o mutante do cabeçalho exercita o laço
inteiro de `:230`. A asserção `:231` (`RIFF`) foi lida, não mutada.

## Gate

`pnpm verify --force` (turbo, `lint typecheck test build`) no HEAD `0e04c4a` - 21 tarefas com sucesso, 21 no total, 0 em
cache (a primeira execução sem `--force` reutilizou 20 em cache, então foi repetida com `--force` para não depender do
cache). Testes: api 321 passaram (49 arquivos), web Playwright 97 passaram, database 38 passaram, contracts 5 passaram,
repo 9 passaram, 0 falharam; soma 470. `tests/stack` à parte: os 4 nomeados passaram (C60, C78, C79, C80).

Observação, não falha da feature: `pnpm test:stack` também roda `tests/stack/verify.test.ts` (clone limpo), que o builder viu
reprovar por 30 s de timeout em quatro testes de consentimento (`consents-audit`, `consents-write` x2, `contracts`
`consent_codes_are_known_409_codes`), reproduzido em duas execuções, fora do `pnpm verify`. Eu não rodei `pnpm test:stack`
inteiro nem `verify.test.ts` nesta rodada; só `compose.test.ts -t` nos quatro nomes. Nada em `apps/api/src/photos` toca
esses testes, mas a causa (cache frio do turbo no clone) não foi isolada, e o builder não comparou com o HEAD anterior à
feature. Fica para o Handoff como risco do gate de clone limpo.

## Ranked gaps

Nenhuma. Observações sem peso de FAIL: (1) o ramo "linha existe e o objeto sumiu do bucket" (`photos.service.ts:166`)
continua sem prova própria, embora o plano o nomeie em `plan.md:107`; (2) `verify.test.ts` no clone limpo, acima.
