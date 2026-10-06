# Captura, recorte e troca da foto do aluno verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: f369964..14f0e07
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

As 68 provas nomeadas (65 checks; C22, C26 e C44 têm duas) existem, rodaram no HEAD `14f0e07` e passaram, cada uma
listada individualmente pelo runner, e cada check tem uma asserção localizada que afirma o valor que o check define. O
veredito é FAIL por três motivos, todos do lado do web ou da `Test policy`, nenhum por prova vermelha:

1. **Dois mutantes sobreviveram** em `apps/web/src/lib/photo-crop.ts` (`drawRegion`): sem o deslocamento da região
   (`:67`) e sem a redução para 1200 (`:66`), todas as provas de `photo-editor.spec.ts`, `photo-camera.spec.ts` e
   `photos.spec.ts` continuam verdes. O JPEG que sai do navegador pode ser recortado do canto errado, ou ser o canto
   superior esquerdo de uma foto grande em vez da foto reduzida, sem que prova nenhuma acuse.
2. **Linha 2 da `Test policy` não cumprida** ("um caso por linha da tabela de geometria, com as dimensões exatas e a cor
   em dois pontos"): C40, C41, C47 e C53 afirmam só dimensões, sobre imagens de uma cor só; e os dois pontos da C38 e da
   C39 têm a mesma cor na região certa e numa região deslocada.
3. **Linha 1 da `Test policy` cumprida em parte** ("linhas de `photos`, contagem de `audit_logs` e chaves do bucket
   afirmadas depois de cada caso"): as provas da C20 e da C21 não afirmam a contagem de `audit_logs`.

O que foi rodado e o que foi só lido está dito em cada seção. O passo 5 (percorrer o fluxo com o usuário) **não foi
feito**: um sub-agente não tem como conduzi-lo. A feature é de tela (diálogo de recorte, câmera), então esse passo
continua devido ao orquestrador com o usuário.

## Binding sources

O plano não marca nenhuma fonte como binding (`plan.md`, seção `Sources`, lista o PRD e artefatos de `.specs` sem essa
marca), e o perfil é `standard`: o passo 1 não roda. Nada a comparar.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| nenhuma fonte marcada binding em `plan.md` | n/a | - | - |

## Checks

Provas rodadas por mim no HEAD `14f0e07`, uma invocação por alvo:

- `packages/database`: `vitest run test/photos.test.ts -t "<2 nomes>" --reporter=verbose` - 2 passaram, 5 pulados, saída 0
- `apps/api`: `vitest run` em 8 arquivos (`contracts`, `env`, `photos-replace`, `photos-purge`, `boot`, `photos-audit`, `openapi`, `enrollment`) com `-t "<39 nomes>" --reporter=verbose` - 39 passaram, 42 pulados, saída 0
- `tests/repo`: `vitest run repo.test.ts -t "<1 nome>" --reporter=verbose` - 1 passou, 9 pulados, saída 0
- `apps/web`: `playwright test e2e/audit.spec.ts e2e/photo-editor.spec.ts e2e/photo-camera.spec.ts -g "<25 nomes>"` - 25 passaram, saída 0 (sobre `next build`)
- `tests/stack`: `vitest run compose.test.ts -t "photo_replaced_through_web_then_expired_version_purged_on_api_restart" --reporter=verbose` - 1 passou, 14 pulados, saída 0 (stack de clone limpo)

Os 68 nomes aparecem um a um na saída como `✓ <arquivo> > <nome>` ou `ok N ... › <nome>`. Cada nome foi localizado no
arquivo da prova por `grep -n`, e a linha da declaração está na coluna "Proof run". Todo arquivo de prova é criado ou
editado por `f369964..HEAD`; nenhuma prova resolve só para teste que a feature não tocou. A C61 reaproveita um teste
existente (`admin_without_2fa_gets_403_everywhere_else`), que percorre o roteador e ganhou a rota nova na lista (`:71`).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `CHECK` de prazo, quatro combinações, INSERT e UPDATE | db `expiry_check_ties_expires_at_to_not_current_four_combinations` ✓ (decl. `packages/database/test/photos.test.ts:195`) | `packages/database/test/photos.test.ts:204` duas aceitas; `:209-210` e `:212-213` `toBe(CHECK_VIOLATION)` e `toContain('photos_expiry_matches_current')`; `:218-219` o UPDATE; `:224` linha intacta | PASS |
| C2 | `0006` só acrescenta `expires_at` anulável e mantém as linhas | db `migration_0006_adds_only_nullable_expires_at_and_keeps_existing_rows_current` ✓ (`photos.test.ts:227`) | `photos.test.ts:274-277` colunas de antes mais `{ expires_at, 'timestamp with time zone', 'YES' }`; `:278` tabelas iguais; `:280-281` linhas iguais com `expires_at: null` e correntes | PASS |
| C3 | 20 ações, as duas novas no fim | api `audit_actions_end_with_replace_and_purge_in_order` ✓ (`apps/api/test/contracts.test.ts:398`) | `apps/api/test/contracts.test.ts:399` `toHaveLength(20)`; `:400-419` as 18 em ordem; `:420` `slice(18)).toEqual(['student.photo_replaced', 'student.photo_version_purged'])` | PASS |
| C4 | `loadEnv`: padrão 30, 1/7/365, cinco recusados sem o valor | api `retention_days_default_30_bounds_1_and_365_and_five_rejected_values` ✓ (`apps/api/test/env.test.ts:15`) | `apps/api/test/env.test.ts:16` `toBe(30)`; `:24` `toBe(days)` para 1, 7, 365; `:35-37` `EnvError`, `invalid` contém a variável, mensagem `not.toContain(value)` para os 5 | PASS |
| C5 | `PUT` 201 de admin e reception, `version` 2 | api `replace_201_by_admin_and_reception_version_2` ✓ (`apps/api/test/photos-replace.test.ts:73`) | `apps/api/test/photos-replace.test.ts:80` `toBe(201)`; `:81` chaves `['createdAt', 'id', 'version']`; `:82` `toBe(2)`; `:83` ISO; `:86-87` id da corrente e diferente do anterior | PASS |
| C6 | anterior guardada com prazo de 30 dias, nova é a única corrente, a mais antiga não é recarimbada | api `previous_row_kept_with_expiry_30_days_and_new_one_is_the_only_current` ✓ (`photos-replace.test.ts:91`) | `photos-replace.test.ts:100` `{ version: 1, is_current: false, in_window: true }` (janela T0+30 a T1+30 no banco, `support/photos.ts:239`); `:102-103` nova corrente única; `:109` `toBe(3)`; `:114` `expires_at` igual ao de antes; `:115` | PASS |
| C7 | seis objetos, três antigos intactos | api `six_objects_after_replace_three_old_untouched_three_new` ✓ (`:119`) | `photos-replace.test.ts:128` `toHaveLength(6)`; `:129` as seis chaves; `:130` SHA-256 iguais aos de antes | PASS |
| C8 | toda leitura assina a foto nova; URL antiga serve até `exp` | api `every_read_route_signs_the_new_photo_and_old_url_serves_until_exp` ✓ (`:133`) | `photos-replace.test.ts:143-144` `GET` medium e thumb; `:146` ficha; `:150` lista; `:155-156` 200 e bytes do `medium` novo; `:160-161` URL antiga 200 com os bytes antigos | PASS |
| C9 | `PUT` sem foto corrente cria `version` 1 | api `put_without_current_photo_creates_version_1` ✓ (`:164`) | `photos-replace.test.ts:172` `toBe(201)`; `:174` `toBe(1)`; `:176-177` uma linha corrente sem prazo; `:178` três chaves; dois casos em `:169` | PASS |
| C10 | nove recusas iguais às do `POST`, nada muda; 5 242 880 passa | api `nine_rejected_files_same_status_and_code_as_post_and_nothing_changes` ✓ (`:182`) | `photos-replace.test.ts:225-226` status e `code` da tabela `:194-208`; `:227` igual ao `POST`; `:228` `path` `file`; `:229` `snapshotOf` igual; `:233-234` 5 242 880 bytes `toBe(201)` | PASS |
| C11 | o `PUT` gera as mesmas variantes, seis propriedades | api `put_runs_the_same_variant_pipeline_six_properties` ✓ (`:237`) | `photos-replace.test.ts:247` webp e tamanhos; `:257-258` vermelho 25%, azul 75%; `:268-269` EXIF 6; `:289-291` sem EXIF nem marcadores; `:301-303` sem nome nem original; `:312-314` regex da chave | PASS |
| C12 | `PUT` 404 para `abc` e uuid sem aluno | api `put_404_for_bad_and_unknown_id_writes_nothing` ✓ (`:318`) | `photos-replace.test.ts:324-325` `toBe(404)`, `'not_found'`; `:328` snapshot igual | PASS |
| C13 | `hr_finance` e `instructor` 403 | api `hr_finance_and_instructor_403_on_put` ✓ (`:331`) | `photos-replace.test.ts:340-341` `toBe(403)`, `'forbidden'`; `:344` snapshot igual | PASS |
| C14 | `PUT` 401 sem sessão | api `put_401_without_session` ✓ (`:347`) | `photos-replace.test.ts:352-353` `toBe(401)`, `'unauthorized'` | PASS |
| C15 | falha de escrita em cada variante e endpoint fora: 503, anterior segue corrente | api `storage_failure_on_each_variant_and_down_503_keeps_previous_current` ✓ (`:356`) | `photos-replace.test.ts:385-386` `toBe(503)`, `'storage_unavailable'`; `:387-388` linha idêntica, corrente sem prazo; `:389-391` contagens e chaves iguais; 4 casos `:371` | PASS |
| C16 | transação falha depois do envio: 500, linhas e bucket restaurados | api `transaction_failure_after_upload_500_restores_rows_and_bucket` ✓ (`:400`) | `photos-replace.test.ts:409-410` `toBe(500)`, `'internal_error'`; `:411-412` linhas idênticas; `:413` auditoria; `:414` chaves | PASS |
| C17 | dois `PUT` juntos: 201 e 201, versões distintas, uma corrente | api `concurrent_puts_both_201_distinct_versions_one_current` ✓ (`:417`) | `photos-replace.test.ts:427` `[201, 201]`; `:429` `[2, 3]`; `:431-437` três linhas, só a 3 corrente, prazos; `:438` nove chaves (10 rodadas); `:446-454` sem foto, `[1, 2]`, 5 rodadas | PASS |
| C18 | `inactive` e `suspended` aceitam a troca | api `inactive_and_suspended_students_accept_replace` ✓ (`:458`) | `photos-replace.test.ts:465-466` `toBe(201)`, `version` `toBe(2)` | PASS |
| C19 | `DELETE` apaga a corrente e a guardada, uma linha de auditoria | api `delete_removes_current_and_stored_version_with_one_audit_row` ✓ (`:470`) | `photos-replace.test.ts:479` `toBe(204)`; `:480-482` sem linhas, sem chaves, seis a menos; `:483-484` uma linha `student.photo_removed` | PASS |
| C20 | o expurgo remove três vencidas e nove chaves | api `purge_removes_expired_rows_and_their_objects` ✓ (`apps/api/test/photos-purge.test.ts:88`) | `apps/api/test/photos-purge.test.ts:102-103` linha fora e chaves fora para as três; `:105` nove chaves a menos | PASS |
| C21 | o expurgo mantém a não vencida e toda corrente | api `purge_keeps_unexpired_version_and_every_current_photo` ✓ (`:108`) | `photos-purge.test.ts:127` a vencida do terceiro saiu; `:129` linha idêntica; `:130-131` chaves e SHA-256 iguais, três casos `:115-117` | PASS |
| C22 | a subida expurga sem requisição, nas duas montagens | api `startup_purges_expired_version_without_any_request` ✓ (`photos-purge.test.ts:135`) e `real_process_purges_expired_version_on_startup` ✓ (`apps/api/test/boot.test.ts:278`) | `photos-purge.test.ts:144-146` linha e objetos saem, corrente fica (segunda API, `:142`); `apps/api/test/boot.test.ts:309-310` só a corrente e as chaves dela (`dist/main.js`, `:305`); `:317` auditoria sem autor | PASS |
| C23 | executa a cada 60 minutos, sobrevive a uma falha, para no `close()` | api `purge_runs_every_60_minutes_survives_a_failed_run_and_stops_on_close` ✓ (`:152`) | `photos-purge.test.ts:167-168` aos 59 min 59 s a linha e as chaves ficam; `:170` sai com mais 1 s; `:174`; `:180-184` depois da execução que falhou; `:186` e `:189` `getTimerCount()` 1 e depois 0 | PASS |
| C24 | objeto que não sai mantém a linha; a execução seguinte remove | api `object_removal_failure_keeps_row_and_next_run_removes_it` ✓ (`:196`) | `photos-purge.test.ts:213-214` linha e auditoria iguais; `:216` só `large` fica; `:224-227` linha fora, chaves fora, uma linha de auditoria | PASS |
| C25 | dois expurgos juntos removem uma vez, uma linha de auditoria | api `two_concurrent_purges_remove_once_and_write_one_audit_row` ✓ (`:235`) | `photos-purge.test.ts:244-247` linha fora, chaves fora, `toHaveLength(1)`, contagem mais 1, 10 rodadas | PASS |
| C26 | falha do expurgo vira log `error` e a API segue respondendo | api `purge_failure_logs_error_and_api_keeps_answering` ✓ (`:254`) e `real_process_survives_purge_failure_with_database_down` ✓ (`boot.test.ts:326`) | `photos-purge.test.ts:261` `resolves.toBeUndefined()`; `:265-266` uma linha, `level` `error`; `:267` linha igual; `:268-269` 503 e 200; `boot.test.ts:336` `{ level: 'error', msg: 'photo purge failed' }`; `:340-341` processo vivo, `/health` 503 depois de 2 s | PASS |
| C27 | uma linha de log com `count` por execução que removeu | api `one_log_line_with_count_per_run_that_removed_and_none_otherwise` ✓ (`:275`) | `photos-purge.test.ts:283-284` `toHaveLength(1)`, `count` `toBe(3)`; `:289` segunda execução sem linha nova | PASS |
| C28 | retenção 7, 1 e 365; só para as trocas seguintes | api `retention_days_7_1_and_365_set_expiry_only_for_later_replaces` ✓ (`:292`) | `photos-purge.test.ts:304` `in_window: true` com `days`; `:306` fora da janela de 30; `:329` `expires_at` da versão de 30 dias igual; `:330` a nova na janela de 7 | PASS |
| C29 | retenção inválida encerra com 1 nomeando a variável, sem valores | api `retention_days_rejected_exits_1_naming_var_without_values` ✓ (`boot.test.ts:347`) | `boot.test.ts:352-353` `toBe(1)`, `toContain(KEY)` para `0`, `366`, `1.5`, `abc`; `:361-363` os dois valores longos, saída sem valor de variável nenhuma; `:372` `1` e `365` sobem (`/health` 503) | PASS |
| C30 | troca grava uma linha `student.photo_replaced`, `diff` nulo, `ip` do proxy | api `replace_writes_one_photo_replaced_row_with_null_diff` ✓ (`apps/api/test/photos-audit.test.ts:238`) | `apps/api/test/photos-audit.test.ts:247-248` 201, uma linha; `:249-256` `action`, `user_id`, `entity`, `entity_id`, `diff: null`, `ip: '203.0.113.7'`; `:257` nenhuma `photo_uploaded` | PASS |
| C31 | `PUT` sem corrente grava `student.photo_uploaded` | api `put_without_current_photo_writes_one_photo_uploaded_row` ✓ (`:261`) | `photos-audit.test.ts:267-275` 201, uma linha com os cinco campos; `:276` nenhuma `photo_replaced` | PASS |
| C32 | expurgo grava uma linha sem autor por versão, na transação da exclusão | api `purge_writes_one_authorless_row_per_version_in_the_delete_transaction` ✓ (`:279`) | `photos-audit.test.ts:285` `toHaveLength(3)`; `:287-294` campos nulos; `:296` `entity_id` por aluno; `:306-307` com a auditoria falhando, linhas e contagem iguais; `:311-314` execução seguinte | PASS |
| C33 | oito desfechos do `PUT` sem linha de auditoria | api `eight_non_writing_put_outcomes_write_no_audit_row` ✓ (`:317`) | `photos-audit.test.ts:342` `toBe(status)`; `:343` contagem igual; os oito em `:326-333` | PASS |
| C34 | nome, chave e conteúdo fora da trilha e do log | api `file_name_key_and_content_never_reach_audit_or_log_on_replace_and_purge` ✓ (`:350`) | `photos-audit.test.ts:372-375` as ações e as duas `msg` presentes; `:377-378` `includes(value)` `toBe(false)` na trilha e no log para os três valores | PASS |
| C35 | `/audit` nomeia as duas ações, filtro com vinte, linha sem autor com "—" | web `replace_and_purge_actions_labelled_and_filter_has_twenty` ok (`apps/web/e2e/audit.spec.ts:528`) | `apps/web/e2e/audit.spec.ts:539-542` os dois rótulos; `:544-547` vinte opções, as novas nas posições 19 e 20; `:560-562` `toHaveText('—')` em Usuário, IP e Navegador | PASS |
| C36 | escolher ou largar abre "Ajustar foto" em 3:4, sem requisição | web `choosing_or_dropping_opens_ajustar_foto_with_3_4_frame_and_sends_nothing` ok (`apps/web/e2e/photo-editor.spec.ts:62`) | `apps/web/e2e/photo-editor.spec.ts:69-70` área e botão; `:73` `toEqual(TYPES)`; `:74-77` diálogo, imagem, razão 0,74 a 0,76 (`:39-40`), zero requisições; `:83-86` o mesmo ao largar | PASS |
| C37 | "Zoom" de 1 a 3, dois botões de giro, quadro segue 3:4 | web `zoom_1_to_3_and_two_rotate_buttons_keep_the_frame_3_4` ok (`:90`) | `photo-editor.spec.ts:94-96` `min` 1, `max` 3, valor 1; `:99-100` os dois botões; `:111` 3:4 depois de cada um dos cinco giros | PASS |
| C38 | salvar sem mexer: uma parte `file`, `foto.jpg`, JPEG 600×800, vermelho e azul | web `untouched_save_sends_one_600x800_jpeg_file_part_red_left_blue_right` ok (`:115`) | `photo-editor.spec.ts:120-124` multipart, uma parte, `file`, `foto.jpg`, `FF D8 FF`; `:125` `[600, 800]`; `:126-127` `isRed` a 25%, `isBlue` a 75%; `:131` uma requisição. Lacuna de precisão: ver Faults | PASS |
| C39 | giro à direita, à esquerda e duas vezes | web `rotation_right_left_and_twice_moves_the_colours_by_90_degrees` ok (`:134`) | `photo-editor.spec.ts:147` `[600, 800]`; `:148-149` as cores dos três casos de `:136-138`. Lacuna de precisão: ver Faults | PASS |
| C40 | teto de 1200×1600, sem ampliar, cinco origens | web `output_capped_at_1200x1600_and_never_enlarged_five_sources` ok (`:153`) | `photo-editor.spec.ts:167` `toEqual(sent)` para as cinco de `:155-159`. Só dimensões: ver Faults | PASS |
| C41 | o zoom para em 300×400, quatro origens | web `zoom_stops_where_the_region_is_300x400_four_sources` ok (`:171`) | `photo-editor.spec.ts:187` `toEqual(sent)` para as quatro de `:173-176`, com o controle levado ao fim (`:183`) | PASS |
| C42 | pequena demais em todo giro: mensagem, sem "Salvar foto" | web `too_small_in_every_rotation_shows_message_without_save` ok (`:191`) | `photo-editor.spec.ts:203-204` mensagem visível e botão `toHaveCount(0)` nas quatro; `:210-211` 300×400 aceita | PASS |
| C43 | arquivo ilegível: mensagem, sem quadro, sem requisição | web `unreadable_file_shows_message_without_crop_frame_three_files` ok (`:214`) | `photo-editor.spec.ts:237-240` mensagem, quadro `toHaveCount(0)`, botão `toHaveCount(0)`, zero requisições, três arquivos `:220-228` | PASS |
| C44 | `POST` sem foto, `PUT` com foto, por arquivo e pela câmera | web `file_save_posts_without_photo_and_puts_with_photo` ok (`photo-editor.spec.ts:244`) e `camera_save_posts_without_photo_and_puts_with_photo` ok (`apps/web/e2e/photo-camera.spec.ts:230`) | `photo-editor.spec.ts:262` uma requisição; `:264` um diálogo só; `:266-267` `toEqual([method])` e zero do outro; `apps/web/e2e/photo-camera.spec.ts:246-250` o mesmo pela câmera | PASS |
| C45 | "Enviando…" desabilitado enquanto espera | web `save_button_disabled_with_enviando_while_waiting` ok (`:271`) | `photo-editor.spec.ts:280-281` visível e `toBeDisabled()`; `:282` nenhum "Salvar foto" habilitado | PASS |
| C46 | 201 fecha o diálogo e mostra a foto nova, `POST` e `PUT` | web `successful_save_closes_the_dialog_and_shows_the_new_photo` ok (`:285`) | `photo-editor.spec.ts:304-307` diálogo fora, `src` `PHOTO_URL`, área fora; `:322-323` depois do `PUT`, `src` `NEW_URL` | PASS |
| C47 | seis erros no diálogo, enquadramento mantido, reenvio igual | web `six_save_errors_show_their_messages_and_keep_the_framing` ok (`:326`) | `photo-editor.spec.ts:345` mensagem de `:329-334`; `:346-348` quadro, "Zoom" 2, botão habilitado; `:352-353` mesmas dimensões, duas requisições | PASS |
| C48 | "Cancelar" e Escape não enviam e deixam a ficha como estava | web `cancel_and_escape_send_nothing_and_leave_the_ficha_as_it_was` ok (`:358`) | `photo-editor.spec.ts:377-379` diálogo fora, área visível, zero requisições; `:373` reabre com o mesmo arquivo; `:393-395` com foto, mesmo `src` | PASS |
| C49 | "Trocar foto" e "Remover foto", sem a área; três tipos; abre o ajuste | web `trocar_foto_beside_remover_foto_opens_chooser_with_three_types` ok (`:399`) | `photo-editor.spec.ts:407-409` os dois botões, área `toHaveCount(0)`; `:411` `toEqual(TYPES)`; `:412-413` diálogo em 3:4 | PASS |
| C50 | "Usar câmera" para quem escreve, com e sem foto | web `usar_camera_button_for_writers_with_and_without_photo` ok (`photo-camera.spec.ts:46`) | `photo-camera.spec.ts:55` `toBeVisible()` nos quatro casos de `:49-50` | PASS |
| C51 | vídeo ao vivo sem áudio, texto de enquadramento e "Capturar" | web `live_video_without_audio_with_framing_text_and_capturar` ok (`:60`) | `photo-camera.spec.ts:67-69` uma chamada, `video` pedido, `audio` ausente; `:74` `{ video: ['live'], audio: 0 }`; `:75-76` texto e botão; `videoWidth` maior que zero em `:42` | PASS |
| C52 | "Abrindo câmera…" sem "Capturar" enquanto pende | web `abrindo_camera_without_capturar_while_pending` ok (`:79`) | `photo-camera.spec.ts:83-84` texto visível, botão `toHaveCount(0)` | PASS |
| C53 | captura vai ao ajuste, "Tirar outra" volta, o salvo é 3:4 do quadro do vídeo | web `capture_goes_to_the_editor_and_tirar_outra_returns_to_live` ok (`:87`) | `photo-camera.spec.ts:96-102` 3:4, "Zoom", giros, "Tirar outra", zero requisições; `:106-108` de volta ao vivo; `:115` parte `file`; `:119-120` razão 3:4 e largura `min(1200, region)` | PASS |
| C54 | câmera negada: mensagem, e o arquivo ainda abre o ajuste | web `denied_camera_shows_message_and_file_upload_still_opens_the_editor` ok (`:123`) | `photo-camera.spec.ts:127-128` mensagem, sem "Capturar"; `:134-135` "Ajustar foto" com o quadro | PASS |
| C55 | sem câmera e contexto inseguro: mensagem, sem "Capturar" | web `no_camera_and_insecure_context_show_message_without_capturar` ok (`:138`) | `photo-camera.spec.ts:144-145` nos dois casos de `:139` | PASS |
| C56 | "Trocar câmera" alterna duas e some com uma | web `trocar_camera_cycles_two_devices_and_is_absent_with_one` ok (`:149`) | `photo-camera.spec.ts:155`; `:158` `toBe('camera-de-tras')`; `:163` `toBe('camera-da-frente')`; `:169` `toHaveCount(0)` | PASS |
| C57 | toda trilha `ended` nas quatro saídas; "Tirar outra" abre trilha nova | web `every_video_track_ended_after_capture_cancel_escape_and_switch` ok (`:172`) | `photo-camera.spec.ts:187` `[{ kind: 'video', state: 'ended' }]` em Capturar, Cancelar, Escape; `:196-199` `ended` e `live`; `:207-208` a trilha anterior depois de "Trocar câmera" | PASS |
| C58 | perfis de leitura sem controle nenhum | web `read_only_profiles_have_no_camera_replace_or_upload_controls` ok (`:211`) | `photo-camera.spec.ts:221` foto ou iniciais; `:223` `toHaveCount(0)` para os quatro botões; `:225` área fora | PASS |
| C59 | OpenAPI: `put` multipart com o schema 201 do `post` | api `photo_put_is_multipart_with_the_post_response_schema` ✓ (`apps/api/test/openapi.test.ts:196`) | `apps/api/test/openapi.test.ts:200` quatro operações; `:202-203` só `multipart/form-data`; `:204-208` parte binária `file`; `:214` schema 201 igual ao do `post` | PASS |
| C60 | corpos reais do `PUT` validam contra os schemas | api `photo_put_bodies_match_contract_schemas` ✓ (`contracts.test.ts:676`) | `contracts.test.ts:692-693` 201 e `photoCreatedSchema`, com e sem foto anterior; `:707-710` 413, 415, 422, 503 contra `problemSchema` | PASS |
| C61 | admin sem 2FA: 403 `two_factor_enrollment_required` no `PUT` | api `admin_without_2fa_gets_403_everywhere_else` ✓ (`apps/api/test/enrollment.test.ts:36`) | `apps/api/test/enrollment.test.ts:46-47` 403 e o `code` em toda rota bloqueada; `:71` `'PUT /api/students/:id/photo'` na lista | PASS |
| C62 | origem estranha: 403 `csrf_rejected` no `PUT` multipart | api `foreign_origin_403_csrf_on_multipart_put` ✓ (`photos-replace.test.ts:487`) | `photos-replace.test.ts:501-502` `toBe(403)`, `'csrf_rejected'` nos dois casos de `:492-495`; `:505` snapshot igual | PASS |
| C63 | `PUT` com `POST` e com `DELETE`: nunca 5xx, linhas e objetos batem | api `put_racing_post_or_delete_never_5xx_and_rows_match_objects` ✓ (`:508`) | `photos-replace.test.ts:527-529` 201, 201 ou 409 `photo_exists`; `:542-543` 201 e 204; `:513-515` no máximo uma corrente, prazos, chaves iguais às linhas; 10 rodadas cada | PASS |
| C64 | `.env.example` com a linha comentada; variável fora das obrigatórias | repo `env_example_documents_optional_retention_days_commented_with_default` ✓ (`tests/repo/repo.test.ts:67`) | `tests/repo/repo.test.ts:70` `toContain('# PHOTO_VERSION_RETENTION_DAYS=30')`; `:72` nenhuma linha a define; `:77` `not.toContain` nas obrigatórias | PASS |
| C65 | na stack: troca pelo web, 30 dias, auditoria, expurgo ao reiniciar a API | stack `photo_replaced_through_web_then_expired_version_purged_on_api_restart` ✓ (`tests/stack/compose.test.ts:448`) | `tests/stack/compose.test.ts:451` `.env` sem a variável; `:502-504` 201 e `version` 2; `:507-511` não corrente e dentro da janela de 30 dias (`f` e `t`); `:513-515` `ip` e `user_agent`; `:526` só as chaves da corrente; `:541-542` 200 `image/webp`; `:544-548` uma linha `student.photo_version_purged`, com `user_id` nulo | PASS |

Sobre o que os checks pedem que o Verifier olhe no diff (lido por mim, não rodado):

- **Segunda implementação no `PUT`: não há.** `PhotosController.replace` (`apps/api/src/photos/photos.controller.ts:44-53`) usa o mesmo `findStudent` e o mesmo `readFilePart` do `POST`, e `create` e `replace` chamam a mesma função privada `store` (`apps/api/src/photos/photos.service.ts:74`), com um só `detectFormat` e um só `makeVariants`. A única diferença é o ramo `replacing`. Um caso por AC herdada (C10, C11) basta.
- **Testes da `foto-pipeline` em `photos.spec.ts`**, comparados com `git show f369964:apps/web/e2e/photos.spec.ts`: `six_upload_errors_show_their_messages_and_keep_the_form` mantém as seis mensagens e as três asserções (`photos.spec.ts:99`, `:101`, `:102`); mudou a ordem, a área e o botão são conferidos depois de "Cancelar". Dos três testes removidos, duas asserções não têm equivalente: ver Ranked gaps 6.

## Coverage

Recomputado por mim. Autoridade de cada conjunto na coluna "Recomputed from". Montagens de startup lidas direto nos
arquivos que as constroem.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `PUT /api/students/:id/photo` statuses (8) | `plan.md` Surface | 201 C5 `:80` · 401 C14 `:352` · 403 C13 `:340` · 404 C12 `:324` · 413, 415, 422 C10 `:225` · 503 C15 `:385` | - |
| status fora da Surface (1) | AC 12 do plano | 500 C16 `:409` | - |
| `PUT` por perfil (4) | `@Roles('admin', 'reception')` em `photos.controller.ts:45` e os quatro perfis do contrato | admin, reception C5 · hr_finance, instructor C13 | - |
| linha de erro comum da `auth-rbac` (3) | `plan.md` Surface, `csrf.ts:25`, guarda global | 401 C14 · `csrf_rejected` C62 · `two_factor_enrollment_required` C61 | - |
| one-way doors (6) | `plan.md` Landing | door 1 C1, C2, C6 (`0006_photo_expiry.sql:1-2` tem a forma literal) · door 2 C5, C9, C63 · door 3 C3, C30, C32 · door 4 C22, C23, C24, C25 · door 5 C4, C28, C29 · door 6 C37, C39 (`react-easy-crop` `^6.2.3` em `apps/web/package.json`) | - |
| relações (2) e constraint nova (1) | `plan.md` Relations | uma corrente C6, C17 · guardadas com prazo C6, C20 · prazo sse não corrente C1 | - |
| restrições que não mudam (2) | `schema.ts` (`photos_one_current_idx`, `photos_student_id_version_unique`) | as duas sob concorrência C17 | - |
| combinações `is_current` × `expires_at` (4) | `CHECK` em `0006_photo_expiry.sql:2` | as quatro C1 `:204-213` | - |
| o que a `0006` deixa (3) | `0006_photo_expiry.sql` | C2 `:274-281` | - |
| `AUDIT_ACTIONS` (20) | `packages/contracts/src/audit.ts` (20 valores contados) | C3 `:399-420` | - |
| retenção no schema (9) | `apps/api/src/env.ts:21` | ausente, 1, 7, 365, 0, 366, 1.5, abc, -1 C4 | - |
| retenção na subida (8) | `main.ts:7` (`loadEnv(process.env)`) | C29 `:349-378` | - |
| prazo gravado por retenção (4) e mudança só para as seguintes (1) | `photos.service.ts:99` | 30 C6 · 7, 1, 365 C28 · C28 `:329` | - |
| efeitos da troca (5) | `store`, `photos.service.ts:94-116` | C6, C7 | - |
| leituras depois da troca (4) | rotas de leitura do plano (AC 4) | C8 | - |
| `PUT` sem corrente (2) | ramo `previous.length > 0`, `photos.service.ts:113` | C9, C31 | - |
| recusas herdadas (7) e bordas de tamanho (2) | AC 9 a 15 da `foto-pipeline` | C10, nove casos `:194-208`, `:234` | - |
| variantes herdadas (6) | AC 16 a 21 da `foto-pipeline` | C11 | - |
| `id` inválido (2) | AC 8 | C12 | - |
| falha de escrita (4) e falha da transação (1) | `store`: três `storage.put`, `catch` em `:119` | C15, C16 | - |
| pares concorrentes (4) | `lockStudent`, `photos.service.ts:64`, chamado em `store` (`:95`) e `remove` (`:135`) | C17 (dois), C63 (dois) | - |
| situação do aluno (2) | AC 14 | C18 | - |
| `DELETE` com guardada (3) | `remove`, `photos.service.ts:133-153` | C19 | - |
| decisão do expurgo por linha (5) e bordas do prazo (2) | `purgeExpired`, `photos.service.ts:161-190`: seleção `:165`, objeto que não sai `:171-174`, linha já apagada `:180` | vencida C20 · duas do mesmo aluno C20 · não vencida C21 · corrente antiga C21 · corrente de aluno expurgado C21 · `now() - 1 s` C20 · `now() + 1 min` C21 | - |
| quando o expurgo executa (3) e bordas do intervalo (2) | `photo-purge.ts:4`, `:23-24`, `:27-28` | subida C22 · 60 min C23 · para no fechamento C23 · 59 min 59 s e 60 min C23 `:167-170` | - |
| falha ao apagar objeto (3), duas execuções (1) | `photos.service.ts:171-174`, `:180` | C24, C25 | - |
| dependência fora (2), o que sobrevive (3) | `photo-purge.ts:34-38` | armazenamento C26 · banco C26 (`boot.test.ts:336`) · próxima execução C23 | - |
| linhas de log do expurgo (3) | `photo-purge.ts:39-40` | C27, C26 | - |
| quem grava cada ação (3), campos nulos (4), ações desfeitas (2) | `photos.service.ts:113`, `:181-186` | C30, C31, C32, C16 | - |
| status do `PUT` sem linha (8) | AC 29 | C33 `:326-333` | - |
| valores fora da trilha e do log (3) | AC 30 | C34 | - |
| ações em `/audit` (2), filtro (20), linha sem autor (3) | AC 31, `apps/web/src/lib/audit.ts` | C35 | - |
| vias que abrem o ajuste (4) | `photo-block.tsx`: `onChange`, `drop`, "Trocar foto", `onCapture` | C36, C36, C49, C53 | - |
| controles do diálogo (3) | door 6, `photo-editor.tsx:91-122` | C37, C39 | - |
| giro da imagem salva (4) | AC 34, AC 35 | C38, C39 | - |
| tamanho do JPEG (5 edges), limite do zoom (4) | AC 36, AC 37 | C40, C41 (dimensões) | - |
| pequena demais (5 edges), ilegível (3) | AC 38, AC 39 | C42, C43 | - |
| método do envio (4) | `photo-block.tsx:141` | C44 (quatro casos) | - |
| mensagens (6), o que o erro preserva (3), fechar sem enviar (2) | AC 43, AC 44 | C47, C48 | - |
| tipos aceitos (3) | `ACCEPT`, `photo-block.tsx` | C36 `:73`, C49 `:411` | - |
| estados da câmera (5), número de câmeras (2), saídas (4) | `Phase` em `photo-camera.tsx:9` e AC 47 a 53 | C52, C51, C54, C55, C56, C57 | - |
| controles por perfil (4), estados em Observable (2 e 4) | `plan.md` Observable | C36, C49, C50, C58; C45, C52, C42, C43, C47, C54, C55, C37, C51 | - |
| textos literais (18) | AC 32 a 54 do plano | os 18 afirmados com `exact: true` ou nome acessível: C36 a C56 | - |
| checks da `foto-pipeline` substituídos (2) | `foto-pipeline/checks.md` C64, C65 | C36, C38, C44; C45, C46. Duas asserções ficaram sem equivalente: Ranked gaps 6 | - |
| startup: `0006` aplicada (3 assemblies) | `packages/database/test/photos.test.ts:32` (`pnpm db:migrate`); `apps/api/test/support/servers.ts:14` e `:22`; `compose.yaml:25` e `:91` | C1 · C6 · C65 | - |
| startup: retenção padrão de 30 dias (3 places) | `apps/api/src/env.ts:21`; `apps/api/test/support/app.ts:55` (`loadEnv` sem a variável); `compose.yaml:87` | `loadEnv` C4 · `startApi` C6 · stack C65 `:507-511`. Na stack os 30 vêm de `${PHOTO_VERSION_RETENTION_DAYS:-30}`, não do padrão do schema: Ranked gaps 5 | - |
| startup: temporizador ligado (3 assemblies) | `app.module.ts:83` (`PhotoPurge` no módulo que `startApi`, `main.ts` e a imagem usam) | `startApi` C22 `photos-purge.test.ts:142` · `dist/main.js` C22 `boot.test.ts:305` · container C65 `:522-526` | - |
| startup: `PUT` multipart pelo repasse do web (2 assemblies) | `apps/web/src/app/api/[...path]/route.ts`; `playwright.config.ts:22` (`next build`) | build de produção C44 `photo-editor.spec.ts:266` · container `web` C65 `:502` | - |
| startup: câmera falsa (1), `react-easy-crop` no build (1) | `apps/web/playwright.config.ts:16-17`, `:22` | C51 · C38 | - |
| **conjunto sem linha nos artefatos:** o que decide os pixels do JPEG enviado (4) | entradas de `drawRegion`, `apps/web/src/lib/photo-crop.ts:54-70`, e "a região enquadrada" da AC 34 e do Flow | giro C39 · tamanho da região C40, C41 · deslocamento da região (`region.x`, `region.y`) sem prova · conteúdo depois da redução para 1200 sem prova | deslocamento da região; conteúdo na redução para 1200 |

Varredura por conjuntos sem linha: Surface (uma rota, tem linha), Landing (seis doors), Relations, Observable (27 linhas,
cada uma em AC, `n/a` ou `existing`) e os conjuntos dentro dos claims. O único que faltava é o da última linha.
Nenhum claim que nomeia status, rota ou formato de resposta tem prova só abaixo da fronteira (sem level gap): C5 a C19,
C30, C31, C33 e C59 a C63 passam pela fronteira HTTP; C35 a C58 pelo navegador sobre o build de produção.

`Swept`, linhas `existing`, relidas contra o código: a guarda global existe (`apps/api/src/app.module.ts:101`,
`APP_GUARD` com `AccessGuard`), a checagem de origem existe (`apps/api/src/configure-app.ts:22`, `csrfProtection`), e as
duas provas citadas existem (`apps/api/test/access.test.ts:49` e `:145`). Nenhuma restrição citada está ausente.

## Test policy rows

As linhas herdadas das outras features não foram rejulgadas aqui; as quatro que este `checks.md` acrescenta:

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, sem fronteira HTTP (o expurgo) | `apps/api/src/photos/photo-purge.ts`, `purgeExpired` em `photos.service.ts:161` | own level C20, C21, C24, C25, C27, C32 via `app.get(PhotoPurge).run()` (`support/app.ts:85`) · each assembly C22 (two) and C65 | no - partial. Five decision lines and both deadline edges each have a case, and each assembly fires it. But `audit_logs` count is asserted after none of the five cases in their own proofs (`photos-purge.test.ts:99-105`, `:124-131`); the removed lines get it from C32 (`photos-audit.test.ts:285`), the three kept lines from nowhere |
| Decide, no navegador, sobre a imagem | `apps/web/src/lib/photo-crop.ts`, `photo-editor.tsx` | web boundary, test decodes what `FakeApi` received (`e2e/support/photo.ts:106`): C38 to C41 | no. Colour at two points exists only for the four rotation cases (C38, C39). The five size cases and four zoom cases assert dimensions only, on single-colour images (`photo-editor.spec.ts:167`, `:187`). Two mutants in `drawRegion` survive |
| Decide, na tela, sobre um dispositivo | `apps/web/src/app/students/[id]/photo-camera.tsx` | Chromium fake camera C51, C53, C57, C44 · swapped `navigator.mediaDevices` C52, C54, C55, C56 | yes - one case per state; calls and tracks observed by the test wrapper (`e2e/support/camera.ts:68-82`) |
| Instrumentação | `photos.controller.ts:44-53`, `apps/web/src/lib/audit.ts:35-36`, `playwright.config.ts:16-17`, props do `Cropper` | none of its own | yes - covered by C5, C35, C51, C37 |

## Faults injected

Em `git worktree add --detach <scratch> HEAD` (o primeiro caminho, dentro do scratchpad, passou do limite de caminho do
Windows e foi refeito em `C:\Users\Admin\AppData\Local\Temp\claude\fcwt`), com `pnpm install` próprio. Sem `git stash`,
sem tocar a árvore real. Baseline `git status --porcelain` antes: `?? CLAUDE.md`; depois de `git worktree remove
--force` e `git worktree prune`: `?? CLAUDE.md`, HEAD `14f0e07`, uma worktree só. Cinco faltas, o teto.

| Mutation | Location | Killed |
| --- | --- | --- |
| prazo da versão guardada com um dia a menos (`days => N - 1`) | `apps/api/src/photos/photos.service.ts:99` | yes - `previous_row_kept_with_expiry_30_days_and_new_one_is_the_only_current` fails at `apps/api/test/photos-replace.test.ts:100` |
| expurgo apaga a linha mesmo quando um objeto não saiu (removido o `continue`) | `apps/api/src/photos/photos.service.ts:173` | yes - `object_removal_failure_keeps_row_and_next_run_removes_it` fails at `apps/api/test/photos-purge.test.ts:213` |
| trilhas de vídeo não são encerradas ao sair da imagem ao vivo (removido `if (opened) stop(opened)`) | `apps/web/src/app/students/[id]/photo-camera.tsx:50` | yes - `every_video_track_ended_after_capture_cancel_escape_and_switch` fails at `apps/web/e2e/photo-camera.spec.ts:187` |
| recorte ignora o deslocamento da região: sempre a partir do canto (removido `context.translate(-region.x, -region.y)`) | `apps/web/src/lib/photo-crop.ts:67` | no - survived. `photo-editor.spec.ts` (14), `photo-camera.spec.ts` (10) and `photos.spec.ts` (7) all green, 31 passed |
| imagem grande não é reduzida: sai o canto de 1200×1600 da origem (removido `context.scale(scale, scale)`) | `apps/web/src/lib/photo-crop.ts:66` | no - survived. `photo-editor.spec.ts` (14) and `photo-camera.spec.ts` (10) all green, 24 passed |

Por que os dois sobrevivem. O primeiro: na imagem 800×800 da C38 a região certa é a faixa central (x de 100 a 700) e a
do mutante é a da esquerda (x de 0 a 600); a 25% e a 75% da largura as duas caem do mesmo lado da divisa em x = 400, e o
mesmo vale girado (C39). Nas demais provas a imagem é de uma cor só. O segundo: só a C40 usa origem mais larga que 1200
(3000×4000 e 1203×1604), cinza, e afirma só `[1200, 1600]`.

## Gate

`pnpm verify --force` - 533 passed, 0 failed

Rodado por mim no HEAD `14f0e07`, saída 0: 21 tarefas do turbo, 0 em cache (lint, typecheck, test e build de cada
workspace). Testes: `contracts` 5, `tests/repo` 10, `packages/database` 40, `apps/api` 359 em 52 arquivos (cobertura
93,61% de linhas, 91,45% de ramos), `apps/web` 119 no Playwright. `tests/stack` não faz parte do `verify`; a prova da
C65 rodou à parte (1 passou). O gate verde não muda o veredito: os dois mutantes sobreviventes passam por ele.

## Ranked gaps

1. **Mutante sobrevivente: o deslocamento da região não é provado** - C38, C39, C41, C53 - `apps/web/src/lib/photo-crop.ts:67`; oráculo em `apps/web/e2e/photo-editor.spec.ts:126-127`, `:148-149`. É também lacuna de precisão dos checks: "vermelho a 25%, azul a 75%" (AC 34, AC 35) vale para qualquer faixa de 600 pixels da origem. Conserto: uma origem cuja cor mude dentro e fora da região esperada (por exemplo faixas verticais de 100 pixels, ou marcas nas bordas da região), e um caso com zoom maior que 1 que afirme cor.
2. **Mutante sobrevivente: o conteúdo da imagem reduzida a 1200 não é provado** - C40 - `apps/web/src/lib/photo-crop.ts:66`; `apps/web/e2e/photo-editor.spec.ts:167` afirma só dimensões. Conserto: no caso 3000×4000, afirmar cor em dois pontos (metades de cores diferentes).
3. **Linha 2 da `Test policy` não cumprida** - C40, C41 - `apps/web/e2e/photo-editor.spec.ts:153-189`: nove dos treze casos de geometria sem cor em ponto nenhum. Mesmo conserto dos itens 1 e 2.
4. **Linha 1 da `Test policy` cumprida em parte** - C20, C21 - `apps/api/test/photos-purge.test.ts:99-105`, `:124-131`: falta a contagem de `audit_logs` depois de cada caso (mais 3 na C20, igual na C21). No caso "os três objetos falham" da C24 as chaves que ficam também não são afirmadas depois da primeira execução (`:213-217` só afirma chaves em "só large falha").
5. **O padrão de 30 dias passou a ter duas fontes** - C65, linha de Coverage "retenção padrão de 30 dias" - `compose.yaml:87` e `apps/api/src/env.ts:21`. O membro "processo real na stack" segue provado como comportamento (`.env` sem a variável, prazo de 30 dias, `tests/stack/compose.test.ts:451`, `:507-511`), mas o container sempre recebe a variável, então a stack não exercita mais o padrão do schema num processo real; o schema é provado no `loadEnv` (C4) e no `startApi` (C6). Mudar um dos dois padrões sem o outro não deixa prova vermelha. E nenhum check afirma que descomentar a linha no `.env` muda o prazo na stack, que é o motivo do repasse. Lacuna de precisão, não membro sem prova.
6. **Duas asserções da `foto-pipeline` saíram sem equivalente** - C65 de lá (C46 daqui) e C64 de lá (C36, C38 daqui) - `apps/web/e2e/photo-editor.spec.ts:304-307`: depois do 201 o teste antigo afirmava também `getByRole('button', { name: 'Enviar foto' })` com `toHaveCount(0)`, e nenhum teste afirma hoje a ausência de "Enviar foto" para quem escreve num aluno com foto (`:407-409` afirma só a área). E o envio multipart era afirmado para `admin` e `reception` e para o arquivo largado; hoje a C38 o afirma só para `reception` com o arquivo escolhido, e a C36 afirma que largar abre o ajuste. O teste reescrito (`six_upload_errors_show_their_messages_and_keep_the_form`) não perdeu asserção.
7. **Lacunas de precisão menores, sem prova vermelha nem mutante** - C4: `z.coerce.number()` aceita `1e2`, `0x10` e ` 30 ` como inteiros de 1 a 365 (`apps/api/src/env.ts:21`), e o check só enumera cinco recusados - C49: o nome do teste diz "beside", a asserção é só de presença dos dois botões (`photo-editor.spec.ts:407-408`) - C47: as dimensões do primeiro envio com "Zoom" em 2 não têm valor afirmado, só a igualdade com o segundo (`:352`) - o título "Tirar foto" da fase ao vivo (`photo-camera.tsx`) não está em AC nem em check.

Não rodado: o passo 5 (fluxo com o usuário). Lido e não rodado: a comparação de `photos.spec.ts` com `f369964`, o
`compose.yaml`, as montagens de startup e as linhas `existing` do `Swept`.
