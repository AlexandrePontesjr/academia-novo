# Captura, recorte e troca da foto do aluno verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: f369964..d4d3995
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Rodada 2, escopada pelo diff do conserto (`14f0e07..d4d3995`: `apps/api/test/photos-purge.test.ts`,
`apps/web/e2e/photo-editor.spec.ts`, `apps/web/e2e/support/photo.ts` e arquivos de `.specs`) e por todo veredito da
rodada 1 que não foi PASS. A rodada 1 (FAIL em `14f0e07`) está preservada em `git show d4d3995:.specs/features/foto-captura/verification.md`.

As 69 provas nomeadas (65 checks; C22, C26, C38 e C44 têm duas) existem, rodaram por inteiro no HEAD `d4d3995` e
passaram, cada uma listada individualmente pelo runner. Os três motivos do FAIL da rodada 1 foram fechados, e isso foi
conferido por mim, não lido do `## Handoff`:

1. **Os dois mutantes de `apps/web/src/lib/photo-crop.ts` agora morrem.** Reinjetados por mim sobre `d4d3995`: sem o
   deslocamento da região (`:67`) reprovam quatro provas; sem a redução para 1200 (`:66`) reprova a da C40.
2. **Linha 2 da `Test policy` cumprida:** os treze casos de geometria (quatro giros, cinco tamanhos, quatro limites de
   zoom) afirmam dimensões exatas e cor em dois pontos ou mais.
3. **Linha 1 da `Test policy` cumprida:** as provas da C20 e da C21 afirmam a contagem de `audit_logs`, e a da C24
   afirma as chaves que ficam nos dois casos.

O conserto não tocou código de produção (`git diff --name-only 14f0e07..d4d3995 -- apps/web/src apps/api/src packages
tests compose.yaml .env.example` não lista nada) e não afrouxou nem removeu asserção (ver "Asserções do conserto").

Ficam lacunas de precisão que não reprovam, em `## Ranked gaps`. O passo 5 (percorrer o fluxo com o usuário) **não foi
feito**: um sub-agente não tem como conduzi-lo. A feature é de tela, e esse passo segue devido ao orquestrador com o
usuário.

Marcação de origem: `verified at d4d3995` é o que eu verifiquei nesta rodada; `carried from 14f0e07` é o que vem da
rodada 1 sem reverificação, sempre sobre arquivo que `14f0e07..d4d3995` não tocou.

## Binding sources

carried from 14f0e07. O plano não marca nenhuma fonte como binding e o perfil é `standard`: o passo 1 não roda. O
conserto não tocou interface nenhuma.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| nenhuma fonte marcada binding em `plan.md` | n/a | - | - |

## Checks

Provas: verified at d4d3995, todas, rodadas por mim, uma invocação por alvo:

- `packages/database`: `vitest run test/photos.test.ts -t "<2 nomes>" --reporter=verbose` - 2 passaram, 5 pulados, saída 0
- `apps/api`: `vitest run` em 8 arquivos (`boot`, `contracts`, `enrollment`, `env`, `openapi`, `photos-audit`, `photos-purge`, `photos-replace`) com `-t "<39 nomes>" --reporter=verbose` - 39 passaram, 42 pulados, saída 0
- `tests/repo`: `vitest run repo.test.ts -t "<1 nome>" --reporter=verbose` - 1 passou, 9 pulados, saída 0
- `apps/web`: `playwright test e2e/audit.spec.ts e2e/photo-editor.spec.ts e2e/photo-camera.spec.ts -g "<26 nomes>" --reporter=list` - 26 passaram, saída 0 (sobre `next build`)
- `tests/stack`: `vitest run compose.test.ts -t "photo_replaced_through_web_then_expired_version_purged_on_api_restart" --reporter=verbose` - 1 passou, 14 pulados, saída 0, 167 s (`docker compose up --build --wait`)

Os 69 nomes aparecem um a um na saída como `✓ <arquivo> > <nome>` ou `ok N ... › <nome>`, cada um exatamente uma vez
(conferido por script contra as linhas `Proof:` de `checks.md`). Cada nome foi localizado no arquivo da prova por
`grep -n "test('<nome>'"`; a linha da declaração está na coluna "Proof run".

Evidência: nas linhas de arquivo que o conserto tocou (`photos-purge.test.ts`, `photo-editor.spec.ts`) as citações foram
refeitas por mim sobre `d4d3995`. Nas demais, a citação é a da rodada 1, e o arquivo é byte a byte o de `14f0e07`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `CHECK` de prazo, quatro combinações, INSERT e UPDATE | db `expiry_check_ties_expires_at_to_not_current_four_combinations` ✓ (decl. `packages/database/test/photos.test.ts:195`) | carried from 14f0e07: `packages/database/test/photos.test.ts:204` duas aceitas; `:209-210` e `:212-213` `toBe(CHECK_VIOLATION)` e `toContain('photos_expiry_matches_current')`; `:218-219` o UPDATE; `:224` linha intacta | PASS |
| C2 | `0006` só acrescenta `expires_at` anulável e mantém as linhas | db `migration_0006_adds_only_nullable_expires_at_and_keeps_existing_rows_current` ✓ (`photos.test.ts:227`) | carried from 14f0e07: `packages/database/test/photos.test.ts:274-277` colunas de antes mais `{ expires_at, 'timestamp with time zone', 'YES' }`; `:278` tabelas iguais; `:280-281` linhas iguais, correntes, `expires_at: null` | PASS |
| C3 | 20 ações, as duas novas no fim | api `audit_actions_end_with_replace_and_purge_in_order` ✓ (`apps/api/test/contracts.test.ts:398`) | carried from 14f0e07: `apps/api/test/contracts.test.ts:399` `toHaveLength(20)`; `:400-419` as 18 em ordem; `:420` `slice(18)).toEqual(['student.photo_replaced', 'student.photo_version_purged'])` | PASS |
| C4 | `loadEnv`: padrão 30, 1/7/365, cinco recusados sem o valor | api `retention_days_default_30_bounds_1_and_365_and_five_rejected_values` ✓ (`apps/api/test/env.test.ts:15`) | carried from 14f0e07: `apps/api/test/env.test.ts:16` `toBe(30)`; `:24` `toBe(days)`; `:35-37` `EnvError`, `invalid` contém a variável, mensagem `not.toContain(value)` | PASS |
| C5 | `PUT` 201 de admin e reception, `version` 2 | api `replace_201_by_admin_and_reception_version_2` ✓ (`apps/api/test/photos-replace.test.ts:73`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:80` `toBe(201)`; `:81` chaves `['createdAt', 'id', 'version']`; `:82` `toBe(2)`; `:83` ISO; `:86-87` id da corrente, diferente do anterior | PASS |
| C6 | anterior guardada com prazo de 30 dias, nova é a única corrente, a mais antiga não é recarimbada | api `previous_row_kept_with_expiry_30_days_and_new_one_is_the_only_current` ✓ (`photos-replace.test.ts:91`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:100` `{ version: 1, is_current: false, in_window: true }`; `:102-103` nova corrente única; `:109` `toBe(3)`; `:114` `expires_at` igual ao de antes | PASS |
| C7 | seis objetos, três antigos intactos | api `six_objects_after_replace_three_old_untouched_three_new` ✓ (`:119`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:128` `toHaveLength(6)`; `:129` as seis chaves; `:130` SHA-256 iguais | PASS |
| C8 | toda leitura assina a foto nova; URL antiga serve até `exp` | api `every_read_route_signs_the_new_photo_and_old_url_serves_until_exp` ✓ (`:133`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:143-144` `GET` medium e thumb; `:146` ficha; `:150` lista; `:155-156` 200 e bytes novos; `:160-161` URL antiga 200 com os bytes antigos | PASS |
| C9 | `PUT` sem foto corrente cria `version` 1 | api `put_without_current_photo_creates_version_1` ✓ (`:164`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:172` `toBe(201)`; `:174` `toBe(1)`; `:176-177` uma linha corrente sem prazo; `:178` três chaves | PASS |
| C10 | nove recusas iguais às do `POST`, nada muda; 5 242 880 passa | api `nine_rejected_files_same_status_and_code_as_post_and_nothing_changes` ✓ (`:182`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:225-226` status e `code`; `:227` igual ao `POST`; `:228` `path` `file`; `:229` `snapshotOf` igual; `:233-234` 5 242 880 bytes `toBe(201)` | PASS |
| C11 | o `PUT` gera as mesmas variantes, seis propriedades | api `put_runs_the_same_variant_pipeline_six_properties` ✓ (`:237`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:247` webp e tamanhos; `:257-258` vermelho 25%, azul 75%; `:268-269` EXIF 6; `:289-291` sem EXIF; `:301-303` sem nome nem original; `:312-314` regex da chave | PASS |
| C12 | `PUT` 404 para `abc` e uuid sem aluno | api `put_404_for_bad_and_unknown_id_writes_nothing` ✓ (`:318`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:324-325` `toBe(404)`, `'not_found'`; `:328` snapshot igual | PASS |
| C13 | `hr_finance` e `instructor` 403 | api `hr_finance_and_instructor_403_on_put` ✓ (`:331`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:340-341` `toBe(403)`, `'forbidden'`; `:344` snapshot igual | PASS |
| C14 | `PUT` 401 sem sessão | api `put_401_without_session` ✓ (`:347`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:352-353` `toBe(401)`, `'unauthorized'` | PASS |
| C15 | falha de escrita em cada variante e endpoint fora: 503, anterior segue corrente | api `storage_failure_on_each_variant_and_down_503_keeps_previous_current` ✓ (`:356`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:385-386` `toBe(503)`, `'storage_unavailable'`; `:387-388` linha idêntica; `:389-391` contagens e chaves iguais | PASS |
| C16 | transação falha depois do envio: 500, linhas e bucket restaurados | api `transaction_failure_after_upload_500_restores_rows_and_bucket` ✓ (`:400`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:409-410` `toBe(500)`, `'internal_error'`; `:411-412` linhas idênticas; `:413` auditoria; `:414` chaves | PASS |
| C17 | dois `PUT` juntos: 201 e 201, versões distintas, uma corrente | api `concurrent_puts_both_201_distinct_versions_one_current` ✓ (`:417`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:427` `[201, 201]`; `:429` `[2, 3]`; `:431-437` três linhas, só a 3 corrente; `:438` nove chaves; `:446-454` sem foto, `[1, 2]` | PASS |
| C18 | `inactive` e `suspended` aceitam a troca | api `inactive_and_suspended_students_accept_replace` ✓ (`:458`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:465-466` `toBe(201)`, `version` `toBe(2)` | PASS |
| C19 | `DELETE` apaga a corrente e a guardada, uma linha de auditoria | api `delete_removes_current_and_stored_version_with_one_audit_row` ✓ (`:470`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:479` `toBe(204)`; `:480-482` sem linhas, sem chaves; `:483-484` uma linha `student.photo_removed` | PASS |
| C20 | o expurgo remove três vencidas e nove chaves | api `purge_removes_expired_rows_and_their_objects` ✓ (`apps/api/test/photos-purge.test.ts:88`) | verified at d4d3995: `apps/api/test/photos-purge.test.ts:103-104` `rowExists(id)` `toBe(false)` e `keysUnder` `toEqual([])` para as três; `:106` `toHaveLength(keysBefore.length - 9)`; `:108` `toBe(auditBefore + 3)`; `:109-110` uma e duas linhas de expurgo por aluno | PASS |
| C21 | o expurgo mantém a não vencida e toda corrente | api `purge_keeps_unexpired_version_and_every_current_photo` ✓ (`:113`) | verified at d4d3995: `apps/api/test/photos-purge.test.ts:133` a vencida do terceiro saiu; `:135` `rowText(id)` `toBe(before.row)`; `:136-137` chaves e SHA-256 iguais, três casos `:120-122`; `:140` `toBe(auditBefore + 1)`; `:142-143` nenhuma linha de expurgo dos dois que só têm o que fica | PASS |
| C22 | a subida expurga sem requisição, nas duas montagens | api `startup_purges_expired_version_without_any_request` ✓ (`photos-purge.test.ts:146`) e `real_process_purges_expired_version_on_startup` ✓ (`apps/api/test/boot.test.ts:278`) | verified at d4d3995: `apps/api/test/photos-purge.test.ts:155-157` linha e objetos saem, `uploadKeys` `toEqual(keysOf(studentId, currentId))` (segunda API, `:153`). carried from 14f0e07: `apps/api/test/boot.test.ts:309-310` só a corrente e as chaves dela (`dist/main.js`, `:305`); `:317` auditoria sem autor | PASS |
| C23 | executa a cada 60 minutos, sobrevive a uma falha, para no `close()` | api `purge_runs_every_60_minutes_survives_a_failed_run_and_stops_on_close` ✓ (`:163`) | verified at d4d3995: `apps/api/test/photos-purge.test.ts:178-179` aos 59 min 59 s a linha e as três chaves ficam; `:181` sai com mais 1 s; `:185`; `:191-195` depois da execução que falhou; `:197` e `:200` `getTimerCount()` `toBe(1)` e `toBe(0)` | PASS |
| C24 | objeto que não sai mantém a linha; a execução seguinte remove | api `object_removal_failure_keeps_row_and_next_run_removes_it` ✓ (`:207`) | verified at d4d3995: `apps/api/test/photos-purge.test.ts:224-225` `rowText` igual e `toBe(auditBefore)`; `:227` só `large` fica; `:229` as três chaves ficam; `:237-240` linha fora, `toEqual([])`, `toBe(auditBefore + 1)`, uma linha de expurgo | PASS |
| C25 | dois expurgos juntos removem uma vez, uma linha de auditoria | api `two_concurrent_purges_remove_once_and_write_one_audit_row` ✓ (`:248`) | verified at d4d3995: `apps/api/test/photos-purge.test.ts:257-260` linha fora, chaves fora, `toHaveLength(1)`, `toBe(auditBefore + 1)`, 10 rodadas (`:251`) | PASS |
| C26 | falha do expurgo vira log `error` e a API segue respondendo | api `purge_failure_logs_error_and_api_keeps_answering` ✓ (`:267`) e `real_process_survives_purge_failure_with_database_down` ✓ (`boot.test.ts:326`) | verified at d4d3995: `apps/api/test/photos-purge.test.ts:274` `resolves.toBeUndefined()`; `:278-279` uma linha, `level` `toBe('error')`; `:280` linha igual; `:281-282` 503 e 200. carried from 14f0e07: `apps/api/test/boot.test.ts:336` `{ level: 'error', msg: 'photo purge failed' }`; `:340-341` `/health` 503 depois de 2 s | PASS |
| C27 | uma linha de log com `count` por execução que removeu | api `one_log_line_with_count_per_run_that_removed_and_none_otherwise` ✓ (`:288`) | verified at d4d3995: `apps/api/test/photos-purge.test.ts:296-297` `toHaveLength(1)`, `count` `toBe(3)`; `:302` segunda execução sem linha nova | PASS |
| C28 | retenção 7, 1 e 365; só para as trocas seguintes | api `retention_days_7_1_and_365_set_expiry_only_for_later_replaces` ✓ (`:305`) | verified at d4d3995: `apps/api/test/photos-purge.test.ts:317` `in_window: true` com `days`; `:319` fora da janela de 30; `:342` `expires_at` da versão de 30 dias igual; `:343` a nova na janela de 7 | PASS |
| C29 | retenção inválida encerra com 1 nomeando a variável, sem valores | api `retention_days_rejected_exits_1_naming_var_without_values` ✓ (`boot.test.ts:347`) | carried from 14f0e07: `apps/api/test/boot.test.ts:352-353` `toBe(1)`, `toContain(KEY)`; `:361-363` os dois valores longos fora da saída; `:372` `1` e `365` sobem | PASS |
| C30 | troca grava uma linha `student.photo_replaced`, `diff` nulo, `ip` do proxy | api `replace_writes_one_photo_replaced_row_with_null_diff` ✓ (`apps/api/test/photos-audit.test.ts:238`) | carried from 14f0e07: `apps/api/test/photos-audit.test.ts:247-248` 201, uma linha; `:249-256` `action`, `user_id`, `entity`, `entity_id`, `diff: null`, `ip: '203.0.113.7'`; `:257` nenhuma `photo_uploaded` | PASS |
| C31 | `PUT` sem corrente grava `student.photo_uploaded` | api `put_without_current_photo_writes_one_photo_uploaded_row` ✓ (`:261`) | carried from 14f0e07: `apps/api/test/photos-audit.test.ts:267-275` 201, uma linha com os cinco campos; `:276` nenhuma `photo_replaced` | PASS |
| C32 | expurgo grava uma linha sem autor por versão, na transação da exclusão | api `purge_writes_one_authorless_row_per_version_in_the_delete_transaction` ✓ (`:279`) | carried from 14f0e07: `apps/api/test/photos-audit.test.ts:285` `toHaveLength(3)`; `:287-294` campos nulos; `:296` `entity_id` por aluno; `:306-307` com a auditoria falhando, linhas e contagem iguais; `:311-314` execução seguinte | PASS |
| C33 | oito desfechos do `PUT` sem linha de auditoria | api `eight_non_writing_put_outcomes_write_no_audit_row` ✓ (`:317`) | carried from 14f0e07: `apps/api/test/photos-audit.test.ts:342` `toBe(status)`; `:343` contagem igual; os oito em `:326-333` | PASS |
| C34 | nome, chave e conteúdo fora da trilha e do log | api `file_name_key_and_content_never_reach_audit_or_log_on_replace_and_purge` ✓ (`:350`) | carried from 14f0e07: `apps/api/test/photos-audit.test.ts:372-375` as ações e as duas `msg` presentes; `:377-378` `includes(value)` `toBe(false)` | PASS |
| C35 | `/audit` nomeia as duas ações, filtro com vinte, linha sem autor com "—" | web `replace_and_purge_actions_labelled_and_filter_has_twenty` ok (`apps/web/e2e/audit.spec.ts:528`) | carried from 14f0e07: `apps/web/e2e/audit.spec.ts:539-542` os dois rótulos; `:544-547` vinte opções, as novas nas posições 19 e 20; `:560-562` `toHaveText('—')` | PASS |
| C36 | escolher ou largar abre "Ajustar foto" em 3:4, sem requisição | web `choosing_or_dropping_opens_ajustar_foto_with_3_4_frame_and_sends_nothing` ok (`apps/web/e2e/photo-editor.spec.ts:67`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:74-75` área e botão; `:78` `toEqual(TYPES)`; `:79-82` diálogo, imagem, razão 0,74 a 0,76 (`:43-44`), `toHaveLength(0)`; `:88-91` o mesmo ao largar; dois perfis `:68` | PASS |
| C37 | "Zoom" de 1 a 3, dois botões de giro, quadro segue 3:4 | web `zoom_1_to_3_and_two_rotate_buttons_keep_the_frame_3_4` ok (`:95`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:99-101` `min` 1, `max` 3, valor 1; `:104-105` os dois botões; `:116` 3:4 depois de cada um dos cinco giros | PASS |
| C38 | salvar sem mexer, dois perfis, escolher e largar: uma parte `file`, `foto.jpg`, JPEG 600×800, moldura lateral fora, de cima e de baixo dentro; com "Zoom" 2, a central de 300×400 | web `untouched_save_sends_one_600x800_jpeg_file_part_red_left_blue_right` ok (`:120`) e `zoom_2_save_sends_the_central_300x400_without_the_green_frame` ok (`:157`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:136-140` multipart, uma parte, `file`, `foto.jpg`, `FF D8 FF`; `:141` `toEqual([600, 800])`; `:142-143` `isRed(atWidth25)`, `isBlue(atWidth75)`; `:145-146` vermelho em (0,05; 0,5) e azul em (0,95; 0,5); `:147-148` `isGreen` em (0,25; 0,05) e (0,75; 0,95); `:152` `toHaveLength(1)`; quatro casos `:129-130`. Zoom 2: `:160` valor `2`; `:168` `toEqual([300, 400])`; `:169-170`; `:172-173` vermelho em (0,05; 0,05), azul em (0,95; 0,95) | PASS |
| C39 | giro à direita, à esquerda e duas vezes, com os pontos de borda | web `rotation_right_left_and_twice_moves_the_colours_by_90_degrees` ok (`:176`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:198` `toEqual([600, 800])`; `:199-200` as cores a 25% e 75% dos três casos de `:187-189`; `:202-203` `firstIs(nearFirst)` e `secondIs(nearSecond)` nos pontos (0,05; 0,25) e (0,95; 0,75) ou (0,05; 0,5) e (0,95; 0,5) (`:178-185`), vermelho ou azul, portanto não verdes | PASS |
| C40 | teto de 1200×1600, sem ampliar, cinco origens | web `output_capped_at_1200x1600_and_never_enlarged_five_sources` ok (`:207`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:221` `toEqual(sent)` para as cinco de `:209-213`; `:222-223` `isRed(atWidth25)` e `isBlue(atWidth75)` em cada uma | PASS |
| C41 | o zoom para em 300×400, quatro origens | web `zoom_stops_where_the_region_is_300x400_four_sources` ok (`:227`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:243` `toEqual(sent)` para as quatro de `:229-232`, com o controle levado ao fim (`:239`); `:244-245` vermelho a 25%, azul a 75% | PASS |
| C42 | pequena demais em todo giro: mensagem, sem "Salvar foto" | web `too_small_in_every_rotation_shows_message_without_save` ok (`:249`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:261-262` mensagem visível e botão `toHaveCount(0)` nas quatro de `:253-256`; `:268-269` 300×400 aceita | PASS |
| C43 | arquivo ilegível: mensagem, sem quadro, sem requisição | web `unreadable_file_shows_message_without_crop_frame_three_files` ok (`:272`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:295-298` mensagem, quadro `toHaveCount(0)`, botão `toHaveCount(0)`, `toHaveLength(0)`; três arquivos `:278-286` | PASS |
| C44 | `POST` sem foto, `PUT` com foto, por arquivo e pela câmera | web `file_save_posts_without_photo_and_puts_with_photo` ok (`photo-editor.spec.ts:302`) e `camera_save_posts_without_photo_and_puts_with_photo` ok (`apps/web/e2e/photo-camera.spec.ts:230`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:320` uma requisição; `:322` um diálogo só; `:324-325` `toEqual([method])` e zero do outro. carried from 14f0e07: `apps/web/e2e/photo-camera.spec.ts:246-250` o mesmo pela câmera | PASS |
| C45 | "Enviando…" desabilitado enquanto espera | web `save_button_disabled_with_enviando_while_waiting` ok (`:329`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:338-339` visível e `toBeDisabled()`; `:340` nenhum "Salvar foto" habilitado | PASS |
| C46 | 201 fecha o diálogo e mostra a foto nova, `POST` e `PUT` | web `successful_save_closes_the_dialog_and_shows_the_new_photo` ok (`:343`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:362-365` diálogo fora, `src` `PHOTO_URL`, área fora; `:366` "Enviar foto" `toHaveCount(0)`; `:381-382` depois do `PUT`, `src` `NEW_URL` | PASS |
| C47 | seis erros no diálogo, enquadramento mantido, reenvio igual | web `six_save_errors_show_their_messages_and_keep_the_framing` ok (`:385`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:404` mensagem de `:388-393`; `:405-407` quadro, "Zoom" `2`, botão habilitado; `:411-412` mesmas dimensões, duas requisições | PASS |
| C48 | "Cancelar" e Escape não enviam e deixam a ficha como estava | web `cancel_and_escape_send_nothing_and_leave_the_ficha_as_it_was` ok (`:417`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:436-438` diálogo fora, área visível, zero requisições; `:431` reabre com o mesmo arquivo; `:452-454` com foto, mesmo `src` | PASS |
| C49 | "Trocar foto" e "Remover foto", sem a área; três tipos; abre o ajuste | web `trocar_foto_beside_remover_foto_opens_chooser_with_three_types` ok (`:458`) | verified at d4d3995: `apps/web/e2e/photo-editor.spec.ts:466-468` os dois botões, área `toHaveCount(0)`; `:469` "Enviar foto" `toHaveCount(0)`; `:471` `toEqual(TYPES)`; `:472-473` diálogo em 3:4 | PASS |
| C50 | "Usar câmera" para quem escreve, com e sem foto | web `usar_camera_button_for_writers_with_and_without_photo` ok (`photo-camera.spec.ts:46`) | carried from 14f0e07: `apps/web/e2e/photo-camera.spec.ts:55` `toBeVisible()` nos quatro casos de `:49-50` | PASS |
| C51 | vídeo ao vivo sem áudio, texto de enquadramento e "Capturar" | web `live_video_without_audio_with_framing_text_and_capturar` ok (`:60`) | carried from 14f0e07: `apps/web/e2e/photo-camera.spec.ts:67-69` uma chamada, `video` pedido, `audio` ausente; `:74` `{ video: ['live'], audio: 0 }`; `:75-76` texto e botão | PASS |
| C52 | "Abrindo câmera…" sem "Capturar" enquanto pende | web `abrindo_camera_without_capturar_while_pending` ok (`:79`) | carried from 14f0e07: `apps/web/e2e/photo-camera.spec.ts:83-84` texto visível, botão `toHaveCount(0)` | PASS |
| C53 | captura vai ao ajuste, "Tirar outra" volta, o salvo é 3:4 do quadro do vídeo | web `capture_goes_to_the_editor_and_tirar_outra_returns_to_live` ok (`:87`) | carried from 14f0e07: `apps/web/e2e/photo-camera.spec.ts:96-102` 3:4, "Zoom", giros, "Tirar outra", zero requisições; `:106-108` de volta ao vivo; `:115` parte `file`; `:119-120` razão 3:4 e largura `min(1200, region)`. O `decode` que ela chama em `:116` mudou de assinatura no conserto (`apps/web/e2e/support/photo.ts:122`, terceiro parâmetro opcional); a prova rodou em `d4d3995` | PASS |
| C54 | câmera negada: mensagem, e o arquivo ainda abre o ajuste | web `denied_camera_shows_message_and_file_upload_still_opens_the_editor` ok (`:123`) | carried from 14f0e07: `apps/web/e2e/photo-camera.spec.ts:127-128` mensagem, sem "Capturar"; `:134-135` "Ajustar foto" com o quadro | PASS |
| C55 | sem câmera e contexto inseguro: mensagem, sem "Capturar" | web `no_camera_and_insecure_context_show_message_without_capturar` ok (`:138`) | carried from 14f0e07: `apps/web/e2e/photo-camera.spec.ts:144-145` nos dois casos de `:139` | PASS |
| C56 | "Trocar câmera" alterna duas e some com uma | web `trocar_camera_cycles_two_devices_and_is_absent_with_one` ok (`:149`) | carried from 14f0e07: `apps/web/e2e/photo-camera.spec.ts:158` `toBe('camera-de-tras')`; `:163` `toBe('camera-da-frente')`; `:169` `toHaveCount(0)` | PASS |
| C57 | toda trilha `ended` nas quatro saídas; "Tirar outra" abre trilha nova | web `every_video_track_ended_after_capture_cancel_escape_and_switch` ok (`:172`) | carried from 14f0e07: `apps/web/e2e/photo-camera.spec.ts:187` `[{ kind: 'video', state: 'ended' }]`; `:196-199` `ended` e `live`; `:207-208` a trilha anterior depois de "Trocar câmera" | PASS |
| C58 | perfis de leitura sem controle nenhum | web `read_only_profiles_have_no_camera_replace_or_upload_controls` ok (`:211`) | carried from 14f0e07: `apps/web/e2e/photo-camera.spec.ts:221` foto ou iniciais; `:223` `toHaveCount(0)` para os quatro botões; `:225` área fora | PASS |
| C59 | OpenAPI: `put` multipart com o schema 201 do `post` | api `photo_put_is_multipart_with_the_post_response_schema` ✓ (`apps/api/test/openapi.test.ts:196`) | carried from 14f0e07: `apps/api/test/openapi.test.ts:200` quatro operações; `:202-203` só `multipart/form-data`; `:204-208` parte binária `file`; `:214` schema 201 igual ao do `post` | PASS |
| C60 | corpos reais do `PUT` validam contra os schemas | api `photo_put_bodies_match_contract_schemas` ✓ (`contracts.test.ts:676`) | carried from 14f0e07: `apps/api/test/contracts.test.ts:692-693` 201 e `photoCreatedSchema`; `:707-710` 413, 415, 422, 503 contra `problemSchema` | PASS |
| C61 | admin sem 2FA: 403 `two_factor_enrollment_required` no `PUT` | api `admin_without_2fa_gets_403_everywhere_else` ✓ (`apps/api/test/enrollment.test.ts:36`) | carried from 14f0e07: `apps/api/test/enrollment.test.ts:46-47` 403 e o `code`; `:71` `'PUT /api/students/:id/photo'` na lista | PASS |
| C62 | origem estranha: 403 `csrf_rejected` no `PUT` multipart | api `foreign_origin_403_csrf_on_multipart_put` ✓ (`photos-replace.test.ts:487`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:501-502` `toBe(403)`, `'csrf_rejected'`; `:505` snapshot igual | PASS |
| C63 | `PUT` com `POST` e com `DELETE`: nunca 5xx, linhas e objetos batem | api `put_racing_post_or_delete_never_5xx_and_rows_match_objects` ✓ (`:508`) | carried from 14f0e07: `apps/api/test/photos-replace.test.ts:527-529` 201, 201 ou 409 `photo_exists`; `:542-543` 201 e 204; `:513-515` no máximo uma corrente, prazos, chaves iguais às linhas | PASS |
| C64 | `.env.example` com a linha comentada; variável fora das obrigatórias | repo `env_example_documents_optional_retention_days_commented_with_default` ✓ (`tests/repo/repo.test.ts:67`) | carried from 14f0e07: `tests/repo/repo.test.ts:70` `toContain('# PHOTO_VERSION_RETENTION_DAYS=30')`; `:72` nenhuma linha a define; `:77` `not.toContain` nas obrigatórias | PASS |
| C65 | na stack: troca pelo web, 30 dias, auditoria, expurgo ao reiniciar a API | stack `photo_replaced_through_web_then_expired_version_purged_on_api_restart` ✓ (`tests/stack/compose.test.ts:448`) | carried from 14f0e07: `tests/stack/compose.test.ts:451` `.env` sem a variável; `:502-504` 201 e `version` 2; `:507-511` janela de 30 dias; `:513-515` `ip` e `user_agent`; `:526` só as chaves da corrente; `:541-542` 200 `image/webp`; `:544-548` uma linha `student.photo_version_purged`, `user_id` nulo | PASS |

### Asserções do conserto contra o claim novo e contra `14f0e07`

verified at d4d3995, por leitura de `git diff 14f0e07..d4d3995` e dos três arquivos de teste.

- **Claim novo da C38:** cada cláusula tem a sua asserção em `apps/web/e2e/photo-editor.spec.ts:136-152` (quatro casos)
  e `:168-173` ("Zoom" em `2`). **Claim novo da C39:** `:198-203`; "em nenhum dos três os pontos de borda são verdes" é
  afirmado pelo positivo (`isRed` ou `isBlue` no ponto exclui `isGreen`, pelos limiares de `support/photo.ts:102-104`).
- **Regras novas de "Como ler as provas":** o ponto (fx, fy) é `at(Math.floor(width * fx), Math.floor(height * fy))`
  (`apps/web/e2e/support/photo.ts:139`); verde é `green >= 200 && red <= 60 && blue <= 60` (`:104`); a imagem com
  moldura é 800×800, verde em `x < 100 || x >= 700 || y < 100 || y >= 700`, miolo vermelho em `x < 400` (`:96-100`). O
  JPEG segue decodificado no navegador do teste, por `createImageBitmap`, sem código do editor (`:122-143`).
- **Nada afrouxado nem removido.** `photos-purge.test.ts`: 45 `expect(` em `14f0e07`, 53 agora, nenhuma linha com
  `expect` removida. `photo-editor.spec.ts`: 76 antes, 94 agora; as oito linhas com `expect` que saem do diff são as de
  `untouched_save_...`, e as oito voltam com o mesmo valor esperado dentro do laço de quatro casos (`:136-141`, `:151-152`).
  `support/photo.ts` não tem asserção. A origem das provas da C40 e da C41 passou de `pngFile` (cinza) a
  `redLeftBlueRight(width, height)`: é troca de entrada, e as asserções de dimensão ficaram (`:221`, `:243`).
- **Raio do diff além da intenção:** `support/photo.ts` é apoio compartilhado. `redLeftBlueRight` passou a exigir
  tamanho e só é chamada em `photo-editor.spec.ts`; `decode` ganhou um parâmetro opcional e é chamada também em
  `photo-camera.spec.ts:116` (C53, rodou verde). `photos.spec.ts` importa o apoio e rodou verde no gate.

Carried from 14f0e07, sem reverificação (arquivos de produção intocados pelo conserto): não há segunda implementação no
`PUT` (`photos.controller.ts:44-53`, função privada `store` em `photos.service.ts:74`), e
`six_upload_errors_show_their_messages_and_keep_the_form` de `photos.spec.ts` não perdeu asserção.

## Coverage

Recomputadas por mim (verified at d4d3995): as linhas cuja autoridade ou cujas provas o conserto tocou, e as duas linhas
novas de `checks.md`. As demais são carried from 14f0e07 e estão na última linha da tabela.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| o que decide os pixels do JPEG enviado (4) - linha nova, verified at d4d3995 | entradas de `drawRegion`, `apps/web/src/lib/photo-crop.ts:54-70`: `rotation` (`:69`), `region.width` e `region.height` (`:55-58`), `region.x` e `region.y` (`:67`), `scale` (`:66`) | giro C39 `photo-editor.spec.ts:199-203` · tamanho da região C40 `:221`, C41 `:243` · deslocamento da região C38 `:145-148` e `:172-173`, C39 `:202-203`, C41 `:244-245` (mutante 1 reprova as quatro) · conteúdo depois da redução para 1200 C40 `:223`, caso 3000×4000 (mutante 2 reprova) | - |
| quem envia o recorte, e por qual via (4) - linha nova, verified at d4d3995 | AC 32 e AC 34 do plano (perfis `admin` e `reception`; escolher ou largar) e a C64 da `foto-pipeline` | os quatro casos C38: laço `photo-editor.spec.ts:129-130` sobre `WRITERS` (`support/photo.ts:11`) e `['escolher', 'largar']`, cada um com `:136-152` | - |
| giro da imagem salva (4) - verified at d4d3995 | AC 34, AC 35 | nenhum C38 `:141-148` · direita uma vez, esquerda uma vez, direita duas vezes C39 `:187-189`, `:198-203` | - |
| controles do diálogo (3) - verified at d4d3995 | door 6 | "Zoom" de 1 a 3 C37 `:99-101` · "Girar à esquerda" e "Girar à direita" C37 `:104-105`, C39 `:194` | - |
| tamanho do JPEG enviado (5 edges) - verified at d4d3995 | AC 36 | 3000×4000, 1203×1604, 1200×1600, 900×1200, 300×400 C40 `:209-213`, cada uma com `:221-223` | - |
| limite do zoom por origem (4) - verified at d4d3995 | AC 37 | 600×800, 450×600, 300×400, 1800×2400 C41 `:229-232`, cada uma com `:243-245` | - |
| imagem pequena demais (5 edges), arquivo que o navegador não lê (3) - verified at d4d3995 | AC 38, AC 39 | C42 `:253-256`, `:261-262`, `:268-269` · C43 `:278-286`, `:295-298` | - |
| vias que abrem o ajuste (4), tipos aceitos (3) - verified at d4d3995 | `photo-block.tsx`: `onChange` (`:125`), `drop` (`:73`), "Trocar foto" (`:110`), `onCapture` (`:137`); `ACCEPT` (`:123`) | escolher C36 `:78-82` · largar C36 `:87-91` · "Trocar foto" C49 `:471-473` · câmera C53 (carried) · tipos C36 `:78`, C49 `:471` | - |
| método do envio (4), mensagens (6), o que o erro preserva (3), fechar sem enviar (2) - verified at d4d3995 | `photo-block.tsx:141`; AC 43, AC 44 | C44 `:324-325` e `photo-camera.spec.ts:246-250` (carried) · C47 `:388-393`, `:404-407`, `:411` · C48 `:421-422`, `:436-438` | - |
| checks da `foto-pipeline` substituídos (2) - verified at d4d3995 | `foto-pipeline/checks.md` C64, C65 e `git show f369964:apps/web/e2e/photos.spec.ts` (rodada 1) | C64 de lá: área, botão e tipos C36 `:74-78`; multipart para os dois perfis, escolhendo e largando C38 `:129-141`; método C44. C65 de lá: "Enviando…" C45 `:338-340`; foto nova, sem a área e sem "Enviar foto" C46 `:362-366`, C49 `:469`. As duas asserções que a rodada 1 achou sem equivalente têm equivalente | - |
| o que o expurgo decide por linha (5), prazo (2 edges) - verified at d4d3995 | `purgeExpired`, `apps/api/src/photos/photos.service.ts:161-190`: seleção `:165`, objeto que não sai `:171-174`, linha já apagada `:180` | vencida e duas do mesmo aluno C20 `photos-purge.test.ts:89-90`, `:103-110` · não vencida, corrente antiga, corrente de aluno expurgado C21 `:120-122`, `:135-143` · `now() - 1 s` C20 (`:46`) · `now() + 1 min` C21 (`:47`) | - |
| falha ao apagar objeto no expurgo (3), duas execuções (1) - verified at d4d3995 | `photos.service.ts:171-174`, `:180` | os três falham C24 `:224-225`, `:229` · só `large` C24 `:227` · a execução seguinte remove C24 `:237-240` · C25 `:257-260` | - |
| quando o expurgo executa (3), bordas do intervalo (2), dependência fora (2), linhas de log (3) - verified at d4d3995 (provas em arquivo tocado; a autoridade, `photo-purge.ts`, é carried) | `photo-purge.ts:4`, `:23-24`, `:27-28`, `:34-40` (carried from 14f0e07) | subida C22 `:155-157` · 60 min, 59 min 59 s, fechamento C23 `:178-181`, `:197-200` · armazenamento C26 `:274-282` · banco C26 `boot.test.ts:336` (carried) · `photo versions purged` C27 `:296-297`, `:302` · `photo purge failed` C26 `:278-279` | - |
| prazo gravado por retenção (4), mudança só para as trocas seguintes (1) - verified at d4d3995 | `photos.service.ts:99` (carried) | 30 C6 (carried) · 7, 1, 365 C28 `:306`, `:317-319` · C28 `:342-343` | - |
| startup: temporizador do expurgo ligado (3 assemblies), `PUT` multipart pelo repasse do web (2 assemblies) - citações refeitas, verified at d4d3995 | `app.module.ts:83`; `playwright.config.ts:22` (carried) | `startApi` C22 `photos-purge.test.ts:153` · `dist/main.js` C22 `boot.test.ts:305` · container C65 `compose.test.ts:522-526` · build de produção C44 `photo-editor.spec.ts:324` · container `web` C65 `compose.test.ts:502` | - |
| as demais linhas da tabela da rodada 1 (status, perfis, doors, relações, `CHECK`, `0006`, `AUDIT_ACTIONS`, retenção no schema e na subida, efeitos e leituras da troca, recusas e variantes herdadas, falhas de escrita e de transação, pares concorrentes, `DELETE`, auditoria, `/audit`, estados e textos da câmera, perfis, `Observable`, textos literais, e as startup de `0006`, retenção, câmera falsa e `react-easy-crop`) - carried from 14f0e07 | as autoridades da rodada 1 (`plan.md`, `apps/api/src`, `apps/web/src`, `compose.yaml`), nenhuma tocada pelo conserto | as provas da rodada 1, todas rodadas de novo em `d4d3995` e citadas na tabela `## Checks`; na linha "textos literais (18)" as citações de `photo-editor.spec.ts` são as novas | - |

Varredura por conjuntos sem linha: o único que a rodada 1 achou ("o que decide os pixels do JPEG enviado") ganhou linha em
`checks.md` e está recomputado acima. O conserto não acrescentou ramo a código de produção, então não acrescentou
membro a conjunto nenhum. As linhas `existing` do `Swept` são carried from 14f0e07.

## Test policy rows

Rejulgadas por mim (verified at d4d3995) as duas linhas não cumpridas na rodada 1, e as outras duas porque classificam
arquivo cujo apoio de teste o conserto tocou.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, sem fronteira HTTP (o expurgo) | `apps/api/src/photos/photo-purge.ts`, `purgeExpired` em `photos.service.ts:161` | own level C20, C21, C24, C25, C27, C32 via `app.get(PhotoPurge).run()` (`apps/api/test/support/app.ts:85`) · each assembly C22 (two) and C65 | yes - verified at d4d3995. Each of the five decision lines and both deadline edges has a case, and after each case the proof asserts `photos` rows, `audit_logs` count and bucket keys: C20 `photos-purge.test.ts:103`, `:108`, `:104-106`; C21 `:135`, `:140-143`, `:136-137`; C24 `:224`, `:225`, `:227-229` |
| Decide, no navegador, sobre a imagem | `apps/web/src/lib/photo-crop.ts`, `photo-editor.tsx` | web boundary, test decodes what `FakeApi` received (`apps/web/e2e/support/photo.ts:122`): C38 to C41 | yes - verified at d4d3995. All thirteen geometry cases assert exact dimensions and colour at two points or more: four rotations `photo-editor.spec.ts:141-148`, `:198-203`; five sizes `:221-223`; four zoom limits `:243-245`. The oracle is the claim (`support/photo.ts:139`), and both `drawRegion` mutants are killed |
| Decide, na tela, sobre um dispositivo | `apps/web/src/app/students/[id]/photo-camera.tsx` | Chromium fake camera C51, C53, C57, C44 · swapped `navigator.mediaDevices` C52, C54, C55, C56 | yes - verdict carried from 14f0e07; the ten proofs re-ran green at d4d3995 after the shared helper `support/photo.ts` changed |
| Instrumentação | `photos.controller.ts:44-53`, `apps/web/src/lib/audit.ts:35-36`, `playwright.config.ts:16-17`, props do `Cropper` | none of its own | yes - carried from 14f0e07; covered by C5, C35, C51, C37, all green at d4d3995 |

Sobre a linha 2: a rodada 1 citou também C47 e C53 como provas que afirmam só dimensões. A tabela de geometria que a
linha cobra é a da evidência da própria `Test policy` ("4 giros, 5 tamanhos de saída, 4 limites de zoom, 5 bordas do
piso, 3 arquivos ilegíveis (C38 a C43)"); C47 e C53 não são linhas dela, e ficam como lacuna de precisão (Ranked gaps 5).

## Faults injected

verified at d4d3995. Em `git worktree add --detach C:\Users\Admin\AppData\Local\Temp\claude\fcwt3 HEAD`, com `pnpm install
--frozen-lockfile --prefer-offline` próprio. Sem `git stash`, sem tocar a árvore real. Baseline `git status --porcelain`
da árvore real antes: `?? CLAUDE.md`. Depois de `git worktree remove --force` e `git worktree prune`: `?? CLAUDE.md`,
HEAD `d4d3995`, uma worktree só. Cinco faltas, o teto, todas nas superfícies que o conserto tocou ou criou. As faltas 4
e 5 foram aplicadas juntas num só `next build`, em arquivos diferentes e com asserções disjuntas (pixels contra presença
de botão); a atribuição de cada reprovação está na linha.

| Mutation | Location | Killed |
| --- | --- | --- |
| recorte ignora o deslocamento da região (removido `context.translate(-region.x, -region.y)`); sobreviveu na rodada 1 | `apps/web/src/lib/photo-crop.ts:67` | yes - 4 das 15 provas de `photo-editor.spec.ts` reprovam: C38 em `apps/web/e2e/photo-editor.spec.ts:145` (ponto a 5% da largura leu verde), C38 com zoom em `:169`, C39 em `:202`, C41 em `:245` |
| imagem grande não é reduzida (removido `context.scale(scale, scale)`); sobreviveu na rodada 1 | `apps/web/src/lib/photo-crop.ts:66` | yes - `output_capped_at_1200x1600_and_never_enlarged_five_sources` reprova em `apps/web/e2e/photo-editor.spec.ts:223`, caso 3000×4000 (75% da largura leu vermelho) |
| o expurgo apaga a linha sem gravar auditoria (removido o `audit.record` da transação) | `apps/api/src/photos/photos.service.ts:181-186` | yes - as asserções novas reprovam: C20 em `apps/api/test/photos-purge.test.ts:108` (9 em vez de 12), C21 em `:140` (17 em vez de 18); C24 em `:239` |
| deslocamento vertical errado (`context.translate(-region.x, -region.x)`) | `apps/web/src/lib/photo-crop.ts:67` | yes - C38 reprova em `apps/web/e2e/photo-editor.spec.ts:147` (ponto de cima leu vermelho, esperado verde) e C39 em `:200`. A prova do "Zoom" em `2` (`:157`) passou com esta falta: Ranked gaps 1 |
| a ficha de quem tem foto ganha um botão "Enviar foto" ao lado de "Trocar foto" | `apps/web/src/app/students/[id]/photo-block.tsx:113` | yes - as asserções novas reprovam: C46 em `apps/web/e2e/photo-editor.spec.ts:366` e C49 em `:469` |
| prazo da versão guardada com um dia a menos; trilhas de vídeo não encerradas - carried from 14f0e07, sem reinjetar | `apps/api/src/photos/photos.service.ts:99`; `apps/web/src/app/students/[id]/photo-camera.tsx:50` | yes - na rodada 1, em `apps/api/test/photos-replace.test.ts:100` e `apps/web/e2e/photo-camera.spec.ts:187`, arquivos que o conserto deixou intactos |
| expurgo apaga a linha mesmo quando um objeto ficou (removido o `continue`) - carried from 14f0e07, sem reinjetar | `apps/api/src/photos/photos.service.ts:173` | yes - na rodada 1, na asserção `rowText(expiredId)` `toBe(rowBefore)`, que o diff do conserto deixou igual e hoje está em `apps/api/test/photos-purge.test.ts:224` |

Asserção nova que falta nenhuma fez reprovar: `apps/api/test/photos-purge.test.ts:229` (as três chaves ficam quando as
três remoções falham). É o próprio proxy do teste que recusa toda remoção (`apps/api/test/support/photos.ts:332`), então
nenhuma falta no código de produção a derruba. Ela registra o estado que a linha 1 da `Test policy` pede; não é mutante
sobrevivente, e está em Ranked gaps 2.

## Gate

verified at d4d3995.

`pnpm verify --force` - 534 passed, 0 failed

Rodado por mim no HEAD `d4d3995`, saída 0: 21 tarefas do turbo, 0 em cache, 4 min 1 s (lint, typecheck, test e build de
cada workspace). Testes: `contracts` 5, `tests/repo` 10, `packages/database` 40, `apps/api` 359 em 52 arquivos (cobertura
93,61% de linhas, 91,45% de ramos), `apps/web` 120 no Playwright (um a mais que na rodada 1: a segunda prova da C38).
`tests/stack` não faz parte do `verify`; a prova da C65 rodou à parte (1 passou).

## Ranked gaps

Nenhuma reprova. São lacunas de precisão e pendências, na ordem em que eu as consertaria.

1. **O oráculo do "Zoom" em `2` da C38 tolera uma região deslocada** (nova, verified at d4d3995) - C38 -
   `apps/web/e2e/photo-editor.spec.ts:169-173`. Os quatro pontos afirmados (25% e 75% da largura, (0,05; 0,05) e
   (0,95; 0,95)) caem longe de qualquer divisa de cor: a região de 300×400 pode estar até 75 pixels fora do centro na
   horizontal e 120 na vertical sem que cor nenhuma mude. Medido: a falta 4 desloca essa região 50 pixels para baixo e a
   prova passa. "A região central" do claim está provada só dentro dessa folga; o deslocamento em si é provado pelo caso
   sem zoom (folga de 30 pixels) e pela C39. Conserto: no caso com zoom, pontos junto das divisas (por exemplo uma origem
   com marca de cor nos quatro cantos da região esperada).
2. **Uma asserção nova que nenhuma falta de produção derruba** (nova) - C24 - `apps/api/test/photos-purge.test.ts:229`.
   Ver `## Faults injected`. Sem conserto devido; registrada para não ser lida como prova de comportamento.
3. **Só um dos dois casos reduzidos da C40 distingue a redução** (nova) - C40 - `apps/web/e2e/photo-editor.spec.ts:222-223`.
   Em 1203×1604 a redução é de três pixels e a cor a 25% e a 75% é a mesma com ou sem ela; o conteúdo depois da redução
   é provado só em 3000×4000. Um teto aplicado errado só perto do limite não seria visto pela cor (seria pela dimensão, `:221`).
4. **O padrão de 30 dias tem duas fontes** (carried from 14f0e07, o conserto não tratou) - C65 - `compose.yaml:87` e
   `apps/api/src/env.ts:21`. Mudar um sem o outro não deixa prova vermelha, e nenhum check afirma que descomentar a
   linha no `.env` muda o prazo na stack.
5. **Lacunas de precisão menores** (carried from 14f0e07, o conserto não tratou) - C4: `z.coerce.number()` aceita `1e2`,
   `0x10` e ` 30 ` (`apps/api/src/env.ts:21`) - C49: o nome do teste diz "beside", a asserção é de presença
   (`apps/web/e2e/photo-editor.spec.ts:466-467`) - C47: as dimensões do primeiro envio com "Zoom" em `2` não têm valor
   afirmado, só a igualdade com o segundo (`:411`) - C53: o JPEG da câmera tem dimensões afirmadas e cor nenhuma
   (`apps/web/e2e/photo-camera.spec.ts:119-120`) - o título "Tirar foto" da fase ao vivo não está em AC nem em check.
6. **Passo 5 não feito.** Percorrer o fluxo com o usuário (câmera real, enquadrar, girar, salvar, trocar) segue devido
   ao orquestrador; é o único passo que julga o que o diálogo parece.

Rodado por mim nesta rodada: as 69 provas (cinco invocações), as cinco faltas, o gate. Lido e não rodado: o diff do
conserto, os três arquivos de teste tocados, `photo-crop.ts`, `photo-block.tsx:60-174`, `purgeExpired`. Carregado da
rodada 1 sem reler: as citações dos arquivos intocados, as linhas de `Coverage` restantes, as linhas `existing` do
`Swept`, a comparação de `photos.spec.ts` com `f369964` e as montagens de startup.
