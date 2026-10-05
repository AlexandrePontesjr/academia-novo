# Pipeline de foto do aluno - checks

Profile: standard
Plan: `.specs/features/foto-pipeline/plan.md`

## Intent

80 checks in 10 slices (S0, as 8 do plano e S9 de montagem e contrato) · 7 one-way doors · 1 open (a 4, credenciais do bucket e backup, é do go-live e da `operacao`), of which 0 block the Build

## Checks

Como ler as provas. Os comandos são os que já rodam no repositório (`vitest run <arquivo> -t`,
`playwright test <arquivo> -g`). Os arquivos `photo-keys.test.ts`, `photo-signer.test.ts`,
`photos-upload.test.ts`, `photos-validation.test.ts`, `photos-variants.test.ts`, `photos-urls.test.ts`,
`photos-delete.test.ts` e `photos-audit.test.ts` (em `apps/api/test`), `support/photos.ts` (em
`apps/api/test`), `packages/database/test/photos.test.ts` e `apps/web/e2e/photos.spec.ts` são criados no
Build; `support/app.ts`, `support/servers.ts`, `health.test.ts`, `access.test.ts`, `boot.test.ts`,
`contracts.test.ts`, `openapi.test.ts`, `students-read.test.ts`, `students-search.test.ts`,
`enrollment.test.ts`, `repo.test.ts`, `compose.test.ts`, `audit.spec.ts` e `fake-api.ts` existem e ganham
casos ou são editados (ver a lista abaixo da `Coverage`). As regras de `features/auth-rbac/checks.md`, de
`features/auditoria/checks.md` e de `features/alunos/checks.md` (leitura de `audit_logs` por SQL, "exatamente
uma linha" como diferença de contagem, insert que falha por gatilho do próprio teste, sessão real de cada
perfil, `FakeApi` que registra query, corpo e cabeçalhos, relógio do teste, dois pedidos soltos por uma
barreira) seguem valendo. Regras próprias:

- A numeração acompanha o plano: de S1 a S8, **C(n) prova a AC (n - 10)** (C11 é a AC 1, C70 é a AC 60).
  S0 vem antes e S9 depois.
- O armazenamento dos testes de API é um MinIO real subido por `testcontainers` (`startMinio` em
  `support/servers.ts`, novo), um por arquivo de teste, com o bucket criado privado e as credenciais de teste
  em `support/photos.ts` (AD-012: nada de armazenamento simulado). `startApi` passa a receber o ambiente do
  armazenamento e `PHOTO_URL_SECRET` junto do resto. O teste lê o bucket pelo seu próprio cliente S3, nunca
  pelas rotas: "objetos do envio" é a lista de chaves sob `photos/main/<studentId>/` e "o bucket" é a lista
  de todas as chaves.
- "Linha de foto" é lida por SQL como `to_jsonb(photos)`, sem depender de nome de coluna (o plano deixa os
  nomes para o diff); "contagem" é `count(*)` de `photos` ou de `audit_logs`. "Falha de insert em
  `audit_logs`" é um gatilho `BEFORE INSERT` do próprio teste.
- As imagens dos testes nascem de pixels, dentro do teste, por `support/photos.ts` (Sharp): cor, dimensão,
  orientação EXIF e metadados são escolhidos pelo teste e os pixels das variantes são lidos de volta com
  `sharp(...).raw()`. O oráculo é o enunciado do check, nunca o código que o servidor roda. "Vermelho" é
  canal R maior ou igual a 200 e G e B menores ou iguais a 60; "azul" é o simétrico (WebP tem perdas).
- "Armazenamento que falha" é um proxy HTTP do teste (`flakyStorage`, em `support/photos.ts`) entre a API e
  o MinIO: encaminha tudo e responde `500` à escrita da variante escolhida ou ao `DELETE` de objeto; a
  variante "pendurada" aceita a conexão e nunca responde. "Armazenamento fora" é um endpoint numa porta onde
  ninguém escuta.
- O relógio de `exp` é o `Date` controlado pelo teste em processo (`vi.useFakeTimers({ toFake: ['Date'] })`),
  nunca o da máquina; só a data é falsa, o resto do tempo corre.
- A saída dos logs é capturada em stdout, stderr e `console` (as três).
- Os limites de tamanho e de pixels são provados nas duas bordas. Onde a borda de um pixel não existe
  (nenhum par de lados de 300 ou mais multiplica 40 000 001), a prova usa o par mais próximo acima do limite,
  3015 × 13267 = 40 000 005.
- As provas de tela usam `FakeApi`, que passa a responder `POST`, `GET` e `DELETE /api/students/:id/photo`,
  entrega bytes (a imagem de `photoUrl`) e registra o corpo `multipart/form-data` recebido (cabeçalho
  `Content-Type`, nome da parte, nome do arquivo e tamanho em bytes).

### S0 - A tabela, a chave do objeto, o assinador, o vocabulário de auditoria e o contrato, antes de qualquer rota · ~14 files · ~30 KB · ~8k

**C1** - Depois de `pnpm db:migrate` num banco vazio, `photos.student_id` tem chave estrangeira para `students(id)` com regra de exclusão `NO ACTION` (nunca `CASCADE`), e `DELETE` de um aluno que tem linha em `photos` falha por violação de chave estrangeira, com a linha de `students` e a de `photos` como estavam (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/photos.test.ts -t "student_foreign_key_without_cascade_blocks_delete"`

**C2** - Uma linha inserida em `photos` só com `student_id`, `version` e `is_current` e sem `id` recebe do banco um `uuid` de versão 7; sem qualquer um dos três campos o insert falha por `NOT NULL` (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/photos.test.ts -t "defaults_uuidv7_and_not_null"`

**C3** - `version` aceita `1` e recusa `0` e `-1` por violação de `CHECK`; duas linhas do mesmo aluno com a mesma `version` violam `UNIQUE`, e a mesma `version` em dois alunos convive (door 1)
Proof: `pnpm --filter "./packages/database" exec vitest run test/photos.test.ts -t "version_check_and_unique_per_student"`

**C4** - Duas linhas do mesmo aluno com `is_current` verdadeiro violam o índice `photos_one_current_idx`; uma corrente mais várias não correntes do mesmo aluno convivem, e dois alunos cada um com a sua corrente convivem (door 1, Relations)
Proof: `pnpm --filter "./packages/database" exec vitest run test/photos.test.ts -t "partial_unique_index_one_current_per_student"`

**C5** - A migração `0005` cria só a tabela `photos`: o conjunto de tabelas do banco migrado é o de antes mais `photos`, e `photos` não tem as colunas `tenant_id`, `owner_type` nem `owner_id` (door 1, AD-016)
Proof: `pnpm --filter "./packages/database" exec vitest run test/photos.test.ts -t "migration_0005_adds_only_photos_without_tenant_or_owner_columns"`

**C6** - A função que compõe a chave de objeto devolve `photos/main/<studentId>/<photoId>/<variant>.webp` para `thumb`, `medium` e `large`, e recusa (lança) uma variante fora dos três (`original`, `THUMB`, `../large`, cadeia vazia) e um `studentId` ou `photoId` que não é `uuid` (`a/b`, `..`, cadeia vazia) (door 2, AC 21)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photo-keys.test.ts -t "key_shape_for_three_variants_and_rejects_foreign_segments"`

**C7** - O assinador, com `PHOTO_URL_SECRET` e `exp` escolhidos pelo teste, devolve `/api/photo-files/<photoId>/<variant>?exp=<exp>&sig=<sig>` com `sig` igual ao HMAC-SHA256 de `<photoId>.<variant>.<exp>` em base64url sem preenchimento, calculado no próprio teste pelo `node:crypto`, para as três variantes; e com `PHOTO_URL_SECRET` diferente a `sig` é outra (door 4, AD-005)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photo-signer.test.ts -t "sign_matches_hmac_sha256_base64url_of_id_variant_exp"`

**C8** - O verificador do assinador, com o relógio do teste em T, devolve verdadeiro para a URL assinada com `exp` igual a T + 1 s e falso, sem lançar, em cada um dos oito casos: `exp` igual a T - 1 s, `sig` com um caractere trocado, `sig` vazio, `sig` de outro tamanho, `exp` trocado por outro número, `exp` não numérico (`abc`, `1e10`, `0x10`), `photoId` trocado e variante trocada (door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photo-signer.test.ts -t "verify_true_once_and_false_for_eight_forms_without_throwing"`

**C9** - `AUDIT_ACTIONS` em `packages/contracts` tem dezoito valores: os dezesseis de antes, na ordem de antes, seguidos de `student.photo_uploaded` e `student.photo_removed`, nessa ordem (door 6, AD-025)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "audit_actions_end_with_two_photo_actions_in_order"`

**C10** - O schema de resposta do aluno aceita `photoUrl` texto, `null` e ausente (tolerância do schema), e o do item da lista também; o schema de `POST /api/students/:id/photo` aceita `id`, `version` e `createdAt` e recusa o objeto sem qualquer um; o de `GET /api/students/:id/photo` aceita `url` e `expiresAt` e recusa sem qualquer um; e `variant` aceita `thumb`, `medium` e `large` e recusa `small`, `THUMB` e a cadeia vazia (door 4, AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "photo_schemas_accept_and_reject_and_student_gains_photo_url"`

### S1 - Enviar a foto de um aluno · ~9 files · ~40 KB · ~10k

**C11** - `POST /api/students/:id/photo` de `admin` e de `reception`, com a parte `file` de um JPEG de 800×1000 sobre um aluno sem foto, responde `201` nos dois casos com exatamente as chaves `id`, `version` e `createdAt`, `version` igual a `1`, `id` igual ao `id` da linha de `photos` lida por SQL e `createdAt` um instante ISO 8601; a linha tem `is_current` verdadeiro (AC 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-upload.test.ts -t "upload_201_by_admin_and_reception_version_1"`

**C12** - `POST /api/students/:id/photo` sobre um aluno que já tem foto corrente responde `409` com `code` igual a `photo_exists`, e a contagem de `photos`, a linha da foto corrente e a lista de objetos do bucket (os três da primeira foto, nenhum a mais) ficam iguais às de antes (AC 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-upload.test.ts -t "second_upload_409_photo_exists_leaves_rows_and_objects"`

**C13** - Dez rodadas de dois `POST /api/students/:id/photo` soltos juntos sobre um aluno novo sem foto dão em cada rodada um `201` e um `409` com `photo_exists`; ao fim de cada rodada `photos` tem uma linha do aluno e o bucket tem só as três chaves dessa linha (AC 3, door 1)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-upload.test.ts -t "ten_concurrent_pairs_one_201_one_409_three_objects"`

**C14** - `POST /api/students/:id/photo` com `:id` igual a `abc` e com um `uuid` de aluno nenhum responde, nos dois casos, `404` com `code` igual a `not_found`, sem linha em `photos` e sem objeto no bucket (AC 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-upload.test.ts -t "post_404_for_bad_and_unknown_id_writes_nothing"`

**C15** - `POST` e `DELETE /api/students/:id/photo` de `hr_finance` e de `instructor` respondem, nos quatro casos, `403` com `code` igual a `forbidden`; o `POST` não grava linha nem objeto e o `DELETE`, sobre um aluno que tem foto, deixa a linha e os três objetos como estavam (AC 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-upload.test.ts -t "hr_finance_and_instructor_403_on_post_and_delete"`

**C16** - `POST`, `GET` e `DELETE /api/students/:id/photo` chamados sem cookie respondem, nos três casos, `401` com `code` igual a `unauthorized` (AC 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-upload.test.ts -t "three_photo_routes_401_without_session"`

**C17** - Sobre um aluno `inactive` e sobre um `suspended`, `POST /api/students/:id/photo` responde `201` e, depois, `DELETE /api/students/:id/photo` responde `204`, nos quatro casos (AC 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-upload.test.ts -t "inactive_and_suspended_students_accept_upload_and_removal"`

### S2 - Só entra arquivo que prova ser foto · ~3 files · ~34 KB · ~9k

**C18** - `POST /api/students/:id/photo` responde `201` para um PNG enviado como `foto.jpg` com `Content-Type` da parte igual a `image/jpeg`, para um JPEG enviado como `foto.png` com `image/png`, para um WebP enviado sem nome de arquivo e com `Content-Type` igual a `text/plain`, nos três casos (AC 8)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-validation.test.ts -t "accepted_by_magic_bytes_whatever_name_and_part_type"`

**C19** - `POST /api/students/:id/photo` responde `415` com `code` igual a `unsupported_media_type`, sem linha em `photos` e sem objeto, para uma parte `file` que é um texto com `Content-Type` `image/jpeg` e nome `foto.jpg`, um GIF, um PDF, um SVG e um arquivo RIFF que não é WebP (um WAV, `RIFF....WAVE`), nos cinco casos (AC 9)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-validation.test.ts -t "five_non_image_contents_415_writes_nothing"`

**C20** - `POST /api/students/:id/photo` com corpo `application/json`, com corpo `application/x-www-form-urlencoded` e com o JPEG cru como corpo (`Content-Type: image/jpeg`) responde, nos três casos, `415` com `code` igual a `unsupported_media_type`, sem linha nem objeto (AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-validation.test.ts -t "non_multipart_bodies_415"`

**C21** - Uma parte `file` de exatamente 5 242 880 bytes (um JPEG válido preenchido por segmento de comentário até esse tamanho) responde `201`; a de 5 242 881 bytes responde `413` com `code` igual a `payload_too_large`, sem linha nem objeto; e a de 5 242 881 bytes enviada em partes, sem `Content-Length`, responde o mesmo `413` (AC 11)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-validation.test.ts -t "size_limit_at_5_mib_and_one_byte_over_also_chunked"`

**C22** - `POST /api/students/:id/photo` responde `422` com `code` igual a `validation_failed` e um item em `errors` cujo `path` é `file`, sem linha nem objeto, para um multipart sem nenhuma parte, com só um campo de texto, com um arquivo numa parte de outro nome (`photo`) e com duas partes `file` (AC 12)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-validation.test.ts -t "missing_or_duplicate_file_part_422_on_path_file"`

**C23** - Pelas dimensões depois da correção de orientação, 299×400 e 300×399 respondem `422` com um item em `errors` cujo `path` é `file`, 300×400 responde `201`, um JPEG de 400×300 guardado com orientação EXIF 6 (que se lê em 300×400) responde `201` e um de 300×400 guardado com orientação EXIF 6 (que se lê em 400×300) responde `422`, sem linha nem objeto nos dois `422` (AC 13)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-validation.test.ts -t "minimum_300x400_after_orientation_five_cases"`

**C24** - Um PNG de 8000×5000 (40 000 000 pixels) responde `201`; um de 3015×13267 (40 000 005 pixels) e um de 30 000×30 000 respondem `422` com um item em `errors` cujo `path` é `file`, sem linha nem objeto (AC 14)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-validation.test.ts -t "pixel_ceiling_at_40_million"`

**C25** - Um JPEG truncado na metade, um PNG truncado na metade, um WebP truncado na metade e um arquivo de três bytes `FF D8 FF` seguidos de lixo respondem, nos quatro casos, `422` com um item em `errors` cujo `path` é `file`, sem linha nem objeto (AC 15)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-validation.test.ts -t "truncated_or_garbage_after_magic_422_on_path_file"`

### S3 - O arquivo vira três variantes WebP sem metadado, e o original não fica · ~3 files · ~30 KB · ~8k

**C26** - Logo depois do `201` de um JPEG de 800×1000, e sem esperar, o bucket tem exatamente os três objetos `photos/main/<studentId>/<photoId>/thumb.webp`, `medium.webp` e `large.webp`, cada um com formato WebP e 96×128, 240×320 e 600×800 pixels; e o mesmo vale para um PNG de 300×400, cuja `large` é ampliada ao tamanho exato (AC 16, door 7)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-variants.test.ts -t "three_webp_variants_exact_sizes_right_after_201"`

**C27** - Um PNG de 800×800 com a metade esquerda vermelha e a direita azul gera uma `large` cujo pixel a 25% da largura é vermelho e o a 75% é azul; um de 800×800 vermelho nas colunas 0 a 99 e azul nas demais gera uma `large` sem nenhum pixel vermelho na linha do meio (recorte centralizado, não compressão); um paisagem de 1200×800 e um retrato de 600×1200, cada um com a faixa central de uma cor e as laterais de outra, geram `large` cujos pixels a 25% e a 75% da largura são os da faixa central (AC 17)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-variants.test.ts -t "center_crop_without_distortion_four_images"`

**C28** - Para cada orientação EXIF de 1 a 8, um JPEG guardado com quatro quadrantes de cores diferentes gera variantes cujos quatro quadrantes estão onde a leitura em pé os põe; na orientação 6, um JPEG de 400×300 de metade superior vermelha e inferior azul gera uma `large` de metade direita vermelha e esquerda azul (AC 18)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-variants.test.ts -t "exif_orientation_one_to_eight_read_upright"`

**C29** - Para um JPEG, um PNG com bloco `eXIf` e um WebP com bloco `EXIF`, todos com coordenadas GPS e a marca de câmera `CAMERA-SECRETA-77`, nenhuma das três variantes de cada um tem bloco EXIF (leitura de metadados sem `exif`) nem contém os bytes `CAMERA-SECRETA-77` nem as coordenadas (AC 19)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-variants.test.ts -t "no_exif_gps_or_marker_bytes_in_any_variant_of_three_formats"`

**C30** - Depois de um envio de `foto-original-unica.jpg`, sob o prefixo da foto existem só os três objetos; nenhuma chave do bucket contém `foto-original-unica`; nenhum objeto do bucket tem o SHA-256 dos bytes enviados; e o diretório temporário do processo (`TMPDIR` apontado pelo teste para uma pasta vazia) continua vazio, tanto depois de um envio aceito quanto depois de um recusado com `415` e com `422` (AC 20)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-variants.test.ts -t "original_kept_nowhere_bucket_or_tmpdir"`

**C31** - Envios com o nome de arquivo `../../etc/passwd.jpg`, com `a/b.png`, com `Content-Type` da parte igual a `image/../x`, e com o `id` do aluno na URL em maiúsculas, deixam no bucket só chaves que casam `^photos/main/<studentId>/<photoId>/(thumb|medium|large)\.webp$`, com `<studentId>` igual ao `id` do aluno em minúsculas e `<photoId>` igual ao `id` da linha de `photos`, nos quatro casos (AC 21, door 2)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-variants.test.ts -t "keys_built_only_from_ids_and_variant_whatever_the_client_sends"`

**C32** - Com o armazenamento falhando na escrita de `thumb`, de `medium` e de `large` (um caso por variante), e com o endpoint fora, `POST /api/students/:id/photo` responde `503` com `code` igual a `storage_unavailable`, sem linha em `photos`, sem linha em `audit_logs` e sem objeto no bucket (AC 22, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-variants.test.ts -t "storage_failure_on_each_variant_and_down_503_leaves_nothing"`

**C33** - Com o insert em `audit_logs` falhando depois de as três variantes estarem gravadas, `POST /api/students/:id/photo` responde `500` com `code` igual a `internal_error`, `photos` e `audit_logs` ficam como estavam e o bucket não tem objeto do envio (AC 23)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-variants.test.ts -t "transaction_failure_after_upload_rolls_back_rows_and_removes_objects"`

### S4 - A foto só sai por URL assinada de cinco minutos · ~6 files · ~42 KB · ~10k

**C34** - Com o `Date` do teste em T (segundos inteiros), `GET /api/students/:id/photo?variant=thumb` de `admin`, de `reception`, de `hr_finance` e de `instructor` responde `200` com `url` casando `^/api/photo-files/<photoId>/thumb\?exp=<T/1000 + 300>&sig=[A-Za-z0-9_-]+$` e `expiresAt` igual ao ISO de `exp × 1000`, `<photoId>` igual ao `id` da linha de `photos`; e `variant=large` de `reception` devolve a URL da variante `large` (AC 24)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "url_for_four_profiles_expires_300s_after_response"`

**C35** - `GET /api/students/:id/photo` sem `variant` devolve a URL da variante `medium` (AC 25)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "variant_defaults_to_medium"`

**C36** - `GET /api/students/:id/photo` responde `422` com `code` igual a `validation_failed` e um item em `errors` cujo `path` é `variant` para `variant=huge`, `variant=THUMB`, `variant=` (vazio) e `variant=thumb&variant=large` (repetido) (AC 26, AD-029)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "invalid_variant_422_on_path_variant"`

**C37** - `GET /api/students/:id/photo` responde `404` com `code` igual a `not_found` para um `uuid` de aluno nenhum, para `abc` e para um aluno que existe e não tem foto (AC 27)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "photo_url_404_for_unknown_bad_and_photoless"`

**C38** - `GET /api/photo-files/:photoId/:variant` com a URL assinada de cada uma das três variantes, sem cookie, responde `200` com `Content-Type` igual a `image/webp`, `Cache-Control` igual a `no-store` e o corpo byte a byte igual ao objeto daquela variante lido do bucket pelo teste (AC 28, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "signed_url_serves_three_variants_without_session"`

**C39** - Com o `Date` do teste em `exp - 1 s` a URL assinada responde `200` e em `exp + 1 s` responde `403` com `code` igual a `invalid_signature`, com `Content-Type` de `application/problem+json` e corpo que não é imagem (AC 29)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "expired_signature_403_one_second_either_side"`

**C40** - `GET /api/photo-files/:photoId/:variant` responde `403` com `code` igual a `invalid_signature` e sem corpo de imagem, nos treze casos: `sig` ausente, `sig` vazio, `sig` com o primeiro caractere trocado, `sig` com o último trocado, `sig` de outro tamanho, dois parâmetros `sig`, `exp` ausente, `exp` não numérico, `exp` aumentado em 1, `exp` diminuído em 1, `photoId` trocado pelo de outra foto existente, variante trocada (`thumb` assinada pedida como `large`) e variante `original` ou `../medium` com assinatura de lixo; e um `photoId` que nunca existiu com `sig` de lixo também responde `403`, não `404` (AC 30, AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "thirteen_tampered_requests_403_and_unknown_id_is_not_a_404"`

**C41** - Com assinatura válida, a URL de uma foto removida por `DELETE /api/students/:id/photo` e a de um `photoId` que nunca existiu (assinada pelo teste com o segredo real) respondem, nos dois casos, `404` com `code` igual a `not_found` (AC 31)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "valid_signature_for_missing_photo_404"`

**C42** - Em toda resposta das rotas novas - `201`, `200` da URL, `200` e `404` e `403` do arquivo, `409`, `413`, `415`, `422`, `503` do envio, e `photoUrl` da ficha e da lista - corpo e cabeçalhos não contêm o endpoint do armazenamento (`host:porta`), o nome do bucket, o prefixo `photos/main/`, a chave de acesso nem a chave secreta, e nenhum cabeçalho começa por `x-amz-` nem traz `Server: MinIO` (AC 32)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "no_storage_address_key_or_credential_in_any_response"`

**C43** - Pedido ao bucket sem credencial, pelo endpoint do armazenamento, do objeto de cada uma das três variantes de uma foto enviada e da listagem do bucket, responde `403` nos quatro casos (AC 33, door 3)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "anonymous_request_to_bucket_403_for_objects_and_listing"`

**C44** - Percorridos envio, URL, entrega com assinatura válida, entrega com assinatura inválida e um envio que falha no armazenamento, nenhuma linha de log contém o valor de `sig` (válido ou inválido), `PHOTO_URL_SECRET`, a chave de acesso nem a chave secreta do bucket (AC 34)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "five_secrets_never_reach_the_log"`

**C45** - `GET /api/students/:id` de um aluno com foto responde `200` com `photoUrl` igual à URL assinada da variante `medium` da foto corrente (o `photoId` da linha de `is_current` verdadeiro, mesmo havendo uma versão antiga não corrente do aluno) para os quatro perfis, e de um aluno sem foto responde `200` com a chave `photoUrl` presente e igual a `null`; as chaves são as treze de `admin` e `reception`, as doze de `hr_finance` (sem `healthNotes`) e as quatro `id`, `name`, `status` e `photoUrl` de `instructor` (AC 35, door 1, AD-033)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "ficha_photo_url_medium_for_four_profiles_null_when_absent"`

**C46** - `GET /api/students` devolve em cada item `photoUrl` igual à URL assinada da variante `thumb` da foto corrente do próprio aluno, ou `null`, para os quatro perfis, numa página que mistura alunos com foto, sem foto e um aluno com duas linhas em `photos` (a antiga não corrente) que aparece uma única vez; as chaves por item são as seis de `admin`, `reception` e `hr_finance` e as quatro `id`, `name`, `status` e `photoUrl` de `instructor` (AC 36)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-urls.test.ts -t "list_photo_url_thumb_per_item_for_four_profiles_no_duplicates"`

### S5 - Remover a foto · ~2 files · ~14 KB · ~4k

**C47** - `DELETE /api/students/:id/photo` de `admin` e de `reception` sobre um aluno com foto responde `204` sem corpo nos dois casos; depois, `photos` não tem a linha, o bucket não tem os três objetos, `GET /api/students/:id/photo` responde `404`, `photoUrl` da ficha e da lista é `null` e a URL assinada de antes responde `404` (AC 37)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-delete.test.ts -t "delete_204_removes_row_objects_and_every_way_to_see_it"`

**C48** - `DELETE /api/students/:id/photo` sobre um aluno sem foto responde `204` e a contagem de `photos` e de `audit_logs` e a lista de chaves do bucket ficam iguais às de antes (AC 38)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-delete.test.ts -t "delete_without_photo_204_changes_nothing"`

**C49** - `DELETE /api/students/:id/photo` com `:id` igual a `abc` e com um `uuid` de aluno nenhum responde, nos dois casos, `404` com `code` igual a `not_found` (AC 39)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-delete.test.ts -t "delete_404_for_bad_and_unknown_id"`

**C50** - Com o armazenamento respondendo `500` à remoção dos objetos depois de a linha ter saído, `DELETE /api/students/:id/photo` responde `204`, a linha de `photos` não existe, a linha `student.photo_removed` existe, a URL assinada de antes responde `404`, `photoUrl` é `null`, e alguma linha de log contém o `photoId` e nenhuma contém a chave do objeto (AC 40, AC 46)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-delete.test.ts -t "object_removal_failure_still_204_and_logs_photo_id_only"`

**C51** - Depois de enviar, remover e enviar de novo, o segundo `POST /api/students/:id/photo` responde `201` com `version` igual a `1`, e o aluno tem uma única linha de `photos` (AC 41)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-delete.test.ts -t "upload_after_removal_201_version_1"`

### S6 - Cada envio e remoção deixam rastro, na mesma transação · ~2 files · ~18 KB · ~5k

**C52** - `POST /api/students/:id/photo` que responde `201`, de `admin` e de `reception`, grava exatamente uma linha com `action` igual a `student.photo_uploaded`, `user_id` igual ao id do autor, `entity` igual a `student`, `entity_id` igual ao id do aluno e `diff` nulo (AC 42, door 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "upload_writes_one_photo_uploaded_row_with_null_diff"`

**C53** - `DELETE /api/students/:id/photo` que remove uma foto, de `admin` e de `reception`, grava exatamente uma linha com `action` igual a `student.photo_removed`, `user_id` do autor, `entity` igual a `student`, `entity_id` igual ao id do aluno e `diff` nulo (AC 43, door 6)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "delete_writes_one_photo_removed_row_with_null_diff"`

**C54** - Uma requisição a `/api/students/:id/photo` que termina em `401`, `403`, `404`, `409`, `413`, `415`, `422`, `500` e `503`, e o `DELETE` sobre aluno sem foto (`204`), responde, em cada um dos dez casos, exatamente o status do caso e deixa a contagem de `audit_logs` igual à de antes (AC 44)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "ten_non_writing_outcomes_write_no_audit_row"`

**C55** - Com o insert em `audit_logs` falhando, `DELETE /api/students/:id/photo` sobre um aluno com foto responde `500` com `code` igual a `internal_error`, a linha de `photos` e os três objetos ficam como estavam e a URL assinada da foto responde `200` (AC 45, AD-027)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "audit_failure_on_delete_keeps_row_and_objects"`

**C56** - Percorridos o envio de `foto-original-unica.jpg` (com o marcador `CAMERA-SECRETA-77` dentro da imagem), a remoção, um envio recusado e um envio que falha no armazenamento, o texto de todas as colunas de todas as linhas de `audit_logs` e todas as linhas de log não contêm o nome do arquivo enviado, a chave do objeto (`photos/main/`) nem o marcador (AC 46)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "file_name_key_and_content_never_reach_audit_or_log"`

**C57** - Para `student.photo_uploaded` e para `student.photo_removed`, com `X-Forwarded-For: 198.51.100.1, 203.0.113.7` e `User-Agent` de 513 caracteres, a linha grava `ip` igual a `203.0.113.7` e `user_agent` com os primeiros 512; sem o cabeçalho `User-Agent`, `user_agent` é nulo (AC 47)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-audit.test.ts -t "ip_and_user_agent_on_the_two_photo_actions"`

### S7 - O armazenamento é dependência da stack · ~6 files · ~16 KB · ~4k

**C58** - `GET /health` com o armazenamento e o banco de pé responde `200` com `checks` igual a `{ database: 'up', storage: 'up' }`; com o endpoint do armazenamento recusando a conexão, e com o endpoint de pé mas o bucket inexistente, responde `503` com `status` igual a `degraded` e `storage` igual a `down` (e `database` igual a `up`); com o endpoint aceitando a conexão e nunca respondendo, responde `503` com `storage` igual a `down` em até 3000 ms (AC 48, AD-010)
Proof: `pnpm --filter "./apps/api" exec vitest run test/health.test.ts -t "health_storage_up_down_missing_bucket_and_hanging"`

**C59** - A API iniciada sem `S3_ENDPOINT`, sem `S3_BUCKET`, sem `S3_ACCESS_KEY_ID`, sem `S3_SECRET_ACCESS_KEY`, sem `PHOTO_URL_SECRET` e com um `PHOTO_URL_SECRET` de 31 caracteres sai com código 1, imprime o nome da variável e não imprime o valor de nenhuma delas; com um de 32 caracteres e as outras quatro presentes, sobe e escuta (AC 49, AD-015)
Proof: `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts -t "photo_env_rejected_exits_1_naming_var_without_values"`

**C60** - Com a stack de pé por `docker compose up --build --wait`, o bucket existe, um pedido anônimo (feito de dentro do container `api`, sem credencial) a um objeto do bucket e à sua listagem responde `403`, e toda porta publicada pelo serviço de armazenamento em `docker compose config` tem `host_ip` igual a `127.0.0.1` (AC 50, door 3)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "storage_bucket_exists_private_and_ports_on_loopback"`

### S8 - A foto na ficha, na lista e na trilha · ~8 files · ~52 KB · ~13k

**C61** - Para um aluno com `photoUrl`, `/students/<id>` exibe uma `img` cujo `src` é o `photoUrl` devolvido pela API, com o texto alternativo "Foto de Marina Duarte" para o aluno de nome "Marina Duarte" (AC 51)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photos.spec.ts -g "ficha_shows_photo_with_alt_text"`

**C62** - Para um aluno com `photoUrl` nulo, `/students/<id>` exibe, com o rótulo acessível "Sem foto", um círculo com as iniciais: "JS" para "João da Silva", "M" para "Maria", "AS" para "ana de souza" e para " Ana  Souza " (espaços nas pontas e duplos), e "ÉÁ" para "Érica Álvares" (AC 52)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photos.spec.ts -g "initials_circle_for_five_names_labelled_sem_foto"`

**C63** - Quando a imagem de `photoUrl` não carrega (a API falsa responde `404` ao arquivo), a ficha e a célula "Nome" de `/students` deixam de exibir a `img` e exibem o círculo das iniciais no lugar (AC 53)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photos.spec.ts -g "broken_image_falls_back_to_initials_on_ficha_and_list"`

**C64** - Para `admin` e para `reception`, a ficha de um aluno sem foto exibe a área "Arraste uma foto aqui ou escolha um arquivo" e o botão "Enviar foto", cujo campo de arquivo aceita exatamente `image/jpeg`, `image/png` e `image/webp`; escolher um arquivo e largar um arquivo na área enviam cada um um `POST /api/students/<id>/photo` com `Content-Type` `multipart/form-data` e uma única parte chamada `file`, com o nome e o tamanho em bytes do arquivo escolhido ou largado (AC 54)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photos.spec.ts -g "upload_area_button_accept_and_both_ways_send_multipart_file_part"`

**C65** - Enquanto a API não responde ao envio, o botão fica desabilitado com o texto "Enviando…"; com a API respondendo `201`, a ficha é exibida de novo com a foto nova (a `img` de `photoUrl` e nenhuma área de envio) (AC 55)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photos.spec.ts -g "upload_button_disabled_with_enviando_while_waiting"`
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photos.spec.ts -g "successful_upload_shows_the_new_photo"`

**C66** - Com a API respondendo ao envio `413`, a ficha exibe "A foto deve ter no máximo 5 MB."; `415`, "Use um arquivo JPEG, PNG ou WebP."; `422` com `errors` de `path` igual a `file` e `message` "A foto precisa ter pelo menos 300×400 pixels.", exatamente essa mensagem; `409`, "Este aluno já tem foto."; `503` e `500`, "Não foi possível enviar a foto. Tente novamente."; e, nos seis casos, a área de envio continua exibida e o botão volta a ficar habilitado (AC 56)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photos.spec.ts -g "six_upload_errors_show_their_messages_and_keep_the_form"`

**C67** - Para `admin` e para `reception`, a ficha de um aluno com foto exibe o botão "Remover foto"; acioná-lo abre um diálogo que contém o nome do aluno e, antes da confirmação, nenhum `DELETE` chega à API; cancelar não envia nada; confirmar envia `DELETE /api/students/<id>/photo` e, com a resposta `204`, a ficha é exibida sem foto (AC 57)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photos.spec.ts -g "remove_photo_confirms_naming_the_student_then_deletes"`

**C68** - Para `hr_finance` e para `instructor`, a ficha de um aluno com foto exibe a foto, a de um sem foto exibe as iniciais, e nos quatro casos não há área de envio, botão "Enviar foto" nem botão "Remover foto" (AC 58)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photos.spec.ts -g "read_only_profiles_see_photo_or_initials_without_controls"`

**C69** - Para `admin`, `reception`, `hr_finance` e `instructor`, cada linha de `/students` exibe, na célula "Nome" e antes do nome, a miniatura de `photoUrl` ou, sem foto, o círculo das iniciais; as colunas continuam as da AC 58 e da AC 59 da `alunos` (quatro, ou duas para `instructor`) e o nome continua levando a `/students/<id>` (AC 59)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/photos.spec.ts -g "list_cell_name_has_thumbnail_or_initials_for_four_roles"`

**C70** - `/audit` exibe "Foto do aluno enviada" e "Foto do aluno removida" na coluna "Ação" para linhas de `student.photo_uploaded` e `student.photo_removed`, e o filtro "Ação" oferece as dezoito ações, as duas novas nas posições 17 e 18, nessa ordem (AC 60)
Proof: `pnpm --filter "./apps/web" exec playwright test e2e/audit.spec.ts -g "photo_actions_labelled_and_filter_has_eighteen"`

### S9 - Contrato, montagem do processo real, stack e testes herdados · ~7 files · ~22 KB · ~6k

**C71** - No documento de `GET /api/openapi.json`, `paths` traz `post`, `get` e `delete` em `/api/students/{id}/photo` e `get` em `/api/photo-files/{photoId}/{variant}`; o `get` de `/api/students/{id}/photo` tem em `parameters` exatamente um item `in` igual a `query`, `variant`, não obrigatório, com o `schema` igual ao do contrato; o `get` de `/api/photo-files/{photoId}/{variant}` tem `exp` e `sig` como `query`; e o `post` de `/api/students/{id}/photo` não declara corpo `application/json` (AD-011, AD-029)
Proof: `pnpm --filter "./apps/api" exec vitest run test/openapi.test.ts -t "photo_paths_and_query_parameters_come_from_contract_schema"`

**C72** - Os corpos reais `201` de `POST /api/students/:id/photo`, `200` de `GET /api/students/:id/photo`, `200` de `GET /api/students/:id` para cada um dos quatro perfis e `200` de `GET /api/students` para `admin` e para `instructor`, sobre alunos com e sem foto, validam contra os schemas de resposta de `packages/contracts` (AD-011)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "photo_bodies_match_contract_schemas"`

**C73** - O schema de erro de `packages/contracts` conhece `photo_exists` com `status` `409`, `invalid_signature` com `403`, `payload_too_large` com `413`, `unsupported_media_type` com `415` e `storage_unavailable` com `503`, e o corpo real de cada uma das cinco respostas, obtido pela rota, valida contra ele (AD-009, AD-021, door 5)
Proof: `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts -t "photo_codes_are_known_problem_codes"`

**C74** - Sem sessão, exatamente quatro rotas respondem sem `401 unauthorized`: `GET /health`, `POST /api/auth/login`, `POST /api/auth/two-factor/verify` e `GET /api/photo-files/:photoId/:variant`; as três rotas `/api/students/:id/photo` respondem `401` (AD-022, door 4)
Proof: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts -t "only_four_routes_answer_without_session"`

**C75** - `.env.example` lista `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `PHOTO_URL_SECRET`, e traz junto de `PHOTO_URL_SECRET` o comando que gera um valor de 32 caracteres ou mais (AD-015, Observable)
Proof: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "env_example_documents_photo_variables_and_secret_command"`

**C76** - `admin` sem 2FA ativo recebe `403` com `code` igual a `two_factor_enrollment_required` nas três rotas `/api/students/:id/photo`, e a lista escrita no teste das rotas bloqueadas as inclui (Surface, `auth-rbac`)
Proof: `pnpm --filter "./apps/api" exec vitest run test/enrollment.test.ts -t "admin_without_2fa_gets_403_everywhere_else"`

**C77** - `POST` e `DELETE /api/students/:id/photo` com `Origin` igual a `http://evil.example`, e `POST` sem `Origin` e com `Sec-Fetch-Site: cross-site`, respondem, nos três casos, `403` com `code` igual a `csrf_rejected`, sem linha, sem objeto e sem remoção (AD-020; `multipart/form-data` é um formato que um formulário de outro site consegue enviar)
Proof: `pnpm --filter "./apps/api" exec vitest run test/photos-upload.test.ts -t "foreign_origin_403_csrf_on_multipart_post_and_delete"`

**C78** - Na stack de pé, um usuário `reception` cria um aluno e envia por `POST /api/students/<id>/photo` na origem do container `web` um JPEG de 5 242 880 bytes com todos os valores de byte e `User-Agent` e `X-Forwarded-For` escolhidos: `201`; `GET /api/students/<id>/photo` devolve a URL; abri-la na origem do web sem cookie devolve `200`, `image/webp`, `Cache-Control` igual a `no-store` e corpo que começa por `RIFF` e tem `WEBP` nos bytes 8 a 11; o banco da stack tem a linha de `photos` e a linha `student.photo_uploaded` com `ip` e `user_agent` enviados; um de 5 242 881 bytes responde `413` com `code` igual a `payload_too_large` em `application/problem+json` (AC 1, AC 11, AC 28, AC 42, door 4, door 7, Flow)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "photo_uploaded_through_web_served_by_signed_url_with_audit_row"`

**C79** - Na stack de pé, `GET /health` na API responde `200` com `checks.storage` igual a `up`; depois de parar o serviço de armazenamento, responde `503` com `checks.storage` igual a `down` e `checks.database` igual a `up` (AC 48, AD-010)
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "health_storage_up_then_down_when_storage_stops"`

**C80** - Se a execução única que cria o bucket sai com código diferente de 0, `docker compose up --wait` termina com erro e o container `api` nunca é criado (door 3, Impact "ambiente")
Proof: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "api_never_starts_when_bucket_init_fails"`

## Coverage

Uma linha para cada rota da `Surface`, com os status como membros, e uma por rota e perfil; depois as
doors, a entidade de `Relations` e os conjuntos enumerados nos critérios. Nas duas rotas existentes só a
resposta `200` muda; os demais status delas são os da `alunos` (ver abaixo).

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /api/students/:id/photo` statuses (9) | 201 C11 · 401 C16 · 403 C15 · 404 C14 · 409 C12 · 413 C21 · 415 C19 · 422 C22 · 503 C32 | - |
| `GET /api/students/:id/photo` statuses (4) | 200 C34 · 401 C16 · 404 C37 · 422 C36 | - |
| `DELETE /api/students/:id/photo` statuses (4) | 204 C47 · 401 C16 · 403 C15 · 404 C49 | - |
| `GET /api/photo-files/:photoId/:variant` statuses (3) | 200 C38 · 403 C39 · 404 C41 | - |
| `GET /api/students/:id` resposta que muda (1) | 200 com `photoUrl` C45 | - |
| `GET /api/students` resposta que muda (1) | 200 com `photoUrl` C46 | - |
| status fora da `Surface`, `500` (2) | `POST` C33 · `DELETE` C55 | - |
| `POST /api/students/:id/photo` por perfil (4) | `admin` C11 · `reception` C11 · `hr_finance` C15 · `instructor` C15 | - |
| `GET /api/students/:id/photo` por perfil (4) | C34, table-driven over all 4 | - |
| `DELETE /api/students/:id/photo` por perfil (4) | `admin` C47 · `reception` C47 · `hr_finance` C15 · `instructor` C15 | - |
| `photoUrl` da ficha por perfil (4) | `admin` C45 · `reception` C45 · `hr_finance` C45 · `instructor` C45 | - |
| `photoUrl` da lista por perfil (4) | `admin` C46 · `reception` C46 · `hr_finance` C46 · `instructor` C46 | - |
| one-way doors (7) | door 1 C4 · door 2 C6 · door 3 C43 · door 4 C7 · door 5 C19, C21, C32 · door 6 C52 · door 7 C26 | - |
| entidades de `Relations` (1) | `photos` C1 | - |
| one-way constraints de `Relations` (4) | chave estrangeira sem cascata C1 · uma corrente por aluno C4 · versão única por aluno C3 · `id` gerado pelo banco C2 | - |
| cardinalidade de `Relations` (2) | no máximo uma corrente C4, C13 · várias versões, a servida é a corrente C45, C46 | - |
| o que a migração `0005` deixa no banco (2) | só `photos` nova C5 · sem `tenant_id`, `owner_type` nem `owner_id` C5 | - |
| variantes gravadas, nome e tamanho (3) | `thumb` 96×128 C26 · `medium` 240×320 C26 · `large` 600×800 C26 | - |
| variantes assinadas pela rota de URL (3) | `thumb` C34 · `medium` C35 · `large` C34 | - |
| variantes entregues pela rota de arquivo (3) | `thumb` C38 · `medium` C38 · `large` C38 | - |
| tipo da parte `file` aceito (3) | JPEG C18 · PNG C18 · WebP C18 | - |
| nome e `Content-Type` da parte, que não decidem (3) | nome que mente C18 · `Content-Type` que mente C18 · sem nome C18 | - |
| conteúdo recusado com `415` (5) | texto como `image/jpeg` C19 · GIF C19 · PDF C19 · SVG C19 · RIFF que não é WebP C19 | - |
| corpo que não é `multipart/form-data` (3) | JSON C20 · urlencoded C20 · imagem crua C20 | - |
| tamanho do arquivo (3 edges) | 5 242 880 C21 · 5 242 881 C21 · 5 242 881 em partes C21 | - |
| parte `file` malformada (4) | multipart sem parte C22 · só campo de texto C22 · outro nome de parte C22 · duas partes C22 | - |
| dimensões depois da orientação (5 edges) | 299×400 C23 · 300×399 C23 · 300×400 C23 · EXIF 6 que lê em 300×400 C23 · EXIF 6 que lê em 400×300 C23 | - |
| resolução (3 edges) | 40 000 000 C24 · 40 000 005 C24 · 30 000×30 000 C24 | - |
| arquivo que não decodifica (4) | JPEG truncado C25 · PNG truncado C25 · WebP truncado C25 · assinatura de JPEG com lixo C25 | - |
| recorte centralizado (4) | quadrado de metades C27 · faixa cortada, sem compressão C27 · paisagem C27 · retrato alto C27 | - |
| orientação EXIF (8) | C28, table-driven over all 8 | - |
| formatos de entrada sem metadado na saída (3) | JPEG C29 · PNG C29 · WebP C29 | - |
| o que não pode sobrar do original (4) | chave com o nome C30 · objeto com o conteúdo C30 · diretório temporário C30 · prefixo só com três objetos C30 | - |
| origem dos segmentos da chave (4) | nome com `../` C31 · nome com `/` C31 · `Content-Type` estranho C31 · `id` da URL em maiúsculas C31 | - |
| falha de escrita no armazenamento (4) | `thumb` C32 · `medium` C32 · `large` C32 · endpoint fora C32 | - |
| falha da transação depois dos objetos (2) | insert de auditoria que falha C33 · corrida perdida, objetos do perdedor removidos C13 | - |
| `variant` inválido na rota de URL (4) | `huge` C36 · `THUMB` C36 · vazio C36 · repetido C36 | - |
| `GET /api/students/:id/photo` que responde `404` (3) | aluno nenhum C37 · `abc` C37 · aluno sem foto C37 | - |
| cabeçalhos do arquivo entregue (3) | `Content-Type` `image/webp` C38 · `Cache-Control` `no-store` C38 · corpo igual ao objeto C38 | - |
| validade da URL (2 edges) | `exp - 1 s` C39 · `exp + 1 s` C39 | - |
| pedidos adulterados à rota de arquivo (13) | `sig` ausente C40 · `sig` vazio C40 · primeiro caractere trocado C40 · último trocado C40 · outro tamanho C40 · dois `sig` C40 · `exp` ausente C40 · `exp` não numérico C40 · `exp` +1 C40 · `exp` -1 C40 · `photoId` trocado C40 · variante trocada C40 · variante `original` ou `../medium` C40 | - |
| `403`, e não `404`, para foto que nunca existiu com assinatura de lixo (1) | C40 | - |
| formas que o verificador recusa (8) | C8, table-driven over all 8 | - |
| assinatura válida com foto que não existe (2) | foto removida C41 · `photoId` nunca existente C41 | - |
| o que não vaza nas respostas (6) | endpoint C42 · bucket C42 · prefixo de chave C42 · chave de acesso C42 · chave secreta C42 · cabeçalhos `x-amz-` e `Server` C42 | - |
| pedido anônimo ao armazenamento (4) | objeto `thumb` C43 · `medium` C43 · `large` C43 · listagem C43 | - |
| valores fora do log (5) | `sig` C44 · `sig` inválido C44 · `PHOTO_URL_SECRET` C44 · chave de acesso C44 · chave secreta C44 | - |
| chaves da ficha por perfil (3 conjuntos) | `admin` e `reception` treze C45 · `hr_finance` doze C45 · `instructor` quatro C45 | - |
| chaves de cada item da lista (2 conjuntos) | seis C46 · quatro C46 | - |
| `photoUrl` ausente, nunca omitido (2) | ficha sem foto `null` C45 · item da lista sem foto `null` C46 | - |
| foto corrente contra versão antiga (2) | ficha C45 · lista sem duplicar o aluno C46 | - |
| efeitos da remoção (5) | linha C47 · três objetos C47 · `GET` do aluno `404` C47 · `photoUrl` nulo C47 · URL antiga `404` C47 | - |
| remoção sem foto (1) | C48 | - |
| `id` inválido na remoção (2) | `abc` C49 · `uuid` sem aluno C49 | - |
| remoção em que os objetos não saem (1) | C50 | - |
| reenvio depois da remoção (1) | `version` igual a `1` C51 | - |
| situação do aluno que aceita foto (2) | `inactive` C17 · `suspended` C17 | - |
| `id` inválido no envio (2) | `abc` C14 · `uuid` sem aluno C14 | - |
| vocabulário de `AUDIT_ACTIONS` (18) | C9, table-driven over all 18: os dezesseis de antes e as duas novas | - |
| vocabulário de `action` de foto, quem grava cada uma (2) | `student.photo_uploaded` C52 · `student.photo_removed` C53 | - |
| `diff` de cada ação de foto (2) | `student.photo_uploaded` nulo C52 · `student.photo_removed` nulo C53 | - |
| status que não gravam linha (10) | C54, table-driven over all 10 | - |
| rotas que desfazem a ação quando o insert de auditoria falha (2) | `POST` C33 · `DELETE` C55 | - |
| valores fora de `audit_logs` e do log (3) | nome do arquivo C56 · chave do objeto C56 · conteúdo da imagem C56 | - |
| origem da linha de auditoria, por ação (2) | `student.photo_uploaded` C57 · `student.photo_removed` C57 | - |
| `User-Agent` na trilha (2 edges) | 513 cortado em 512 C57 · ausente nulo C57 | - |
| estado do `/health` (4) | de pé C58 · endpoint recusa C58 · bucket inexistente C58 · endpoint pendurado, em até 3 s C58 | - |
| variáveis obrigatórias do armazenamento (5) | `S3_ENDPOINT` C59 · `S3_BUCKET` C59 · `S3_ACCESS_KEY_ID` C59 · `S3_SECRET_ACCESS_KEY` C59 · `PHOTO_URL_SECRET` C59 | - |
| `PHOTO_URL_SECRET` (2 edges) | 31 caracteres C59 · 32 caracteres C59 | - |
| o que o ambiente da subida da stack garante (3) | bucket criado C60 · acesso anônimo negado C60 · porta só em `127.0.0.1` C60 | - |
| `docker compose up` quando a execução única do bucket falha (1) | C80 | - |
| estados do bloco de foto da ficha em `Observable` (5) | vazio C62, C64 · carregando C65 · erro C63, C66 · sem permissão C68 · confirmação de ação destrutiva C67 | - |
| estados da miniatura de `/students` em `Observable` (3) | com foto ou iniciais C69 · imagem que não carrega C63 · todo perfil vê C69 | - |
| nomes que dão iniciais (5) | "João da Silva" C62 · "Maria" C62 · "ana de souza" C62 · " Ana  Souza " C62 · "Érica Álvares" C62 | - |
| mensagens do envio na ficha (6) | `413` C66 · `415` C66 · `422` C66 · `409` C66 · `503` C66 · outro erro C66 | - |
| tipos aceitos pelo campo de arquivo (3) | `image/jpeg` C64 · `image/png` C64 · `image/webp` C64 | - |
| vias de envio na ficha (2) | escolher o arquivo C64 · largar o arquivo C64 | - |
| controles de escrita da foto por perfil (4) | `admin` C64, C67 · `reception` C64, C67 · `hr_finance` C68 · `instructor` C68 | - |
| textos literais da foto na ficha (6) | "Arraste uma foto aqui ou escolha um arquivo" C64 · "Enviar foto" C64 · "Enviando…" C65 · "Remover foto" C67 · "Sem foto" C62 · "Foto de <nome>" C61 | - |
| ações novas em `/audit` (2) | "Foto do aluno enviada" C70 · "Foto do aluno removida" C70 | - |
| filtro "Ação" (18) | C70, table-driven over all 18: os dezesseis de antes e as duas novas, posições 17 e 18 | - |
| startup config: `S3_*` e `PHOTO_URL_SECRET` (4 places) | harness de `startApi`, `support/app.ts` C11 · processo filho dos testes de subida C59 · `.env.example` C75 · `compose.yaml` e processo real na stack C78 | - |
| startup config: migração `0005` aplicada (3 assemblies) | banco migrado em `packages/database` C1 · harness de `apps/api` C11 · stack do compose C78 | - |
| startup config: bucket privado (2 places) | bucket do harness de teste C43 · bucket criado pela execução única do compose C60 | - |
| startup config: Sharp carregado (3 places) | harness de `apps/api` C26 · `dist` empacotado pelo esbuild, subindo C59 · imagem `node:24-alpine` na stack C78 | - |
| startup config: teto de 5 MiB onde o corpo passa (2 assemblies) | API montada pelo `startApi` C21 · pela origem do web na stack C78 | - |
| startup config: IP e `User-Agent` nas rotas novas (2 assemblies) | harness de teste C57 · processo real na stack C78 | - |
| startup config: rota sem sessão (1 place) | tabela de rotas do `startApi` C74 | - |

- Claims naming a status code, route or response shape: C11 a C58, C71 a C74, C76 e C77 cruzam a fronteira
  HTTP da API montada pelo `startApi` (C26 a C31, C43 e C47 leem também o bucket); C61 a C70 cruzam a
  fronteira do web no navegador; C78, C79 e C80 cruzam as duas no processo real. C1 a C10 provam o banco
  migrado, a função de chave, o assinador e os schemas no próprio nível; C59 inicia o `dist` como processo filho
- C8 e C40 provam a mesma tabela de adulteração em dois níveis: a rota prova a fronteira (`403` e o corpo que
  não é imagem), o verificador prova cada forma sem lançar. Pelo plano, `exp` e `sig` malformados respondem
  `403` (AC 30) e não `422` (AD-029): se o Build validar essa query pelo schema de `packages/contracts`, a C40
  reprova e a AC 30 prevalece
- C21 tem o caso em partes porque a API não confia em `Content-Length`; C30 inclui o diretório temporário
  porque o Problem diz "o arquivo original não fica em lugar nenhum" e um leitor de multipart em disco o deixaria
  lá; C31 inclui o `id` em maiúsculas porque `alunos` aceitou o `id` nas duas formas (C92 de lá)
- Nas duas rotas existentes só a resposta `200` muda (C45, C46). Os demais status são os de `alunos` e não
  ganham check novo: `401`, `403` e `404` de `GET /api/students/:id` (`ficha_404_for_non_uuid_and_unknown_uuid`,
  `five_routes_401_without_session`), `401`, `403` e `422` de `GET /api/students` (`six_invalid_query_parameters_422_on_path`).
  `POST /api/students` e `PATCH /api/students/:id` não aparecem na `Surface` e continuam sem `photoUrl`:
  `create_201_by_admin_and_reception_with_nulls` e `patch_200_changes_only_sent_fields`, da `alunos`, afirmam
  as chaves exatas e seguem como a prova
- Testes existentes que o Build edita porque o claim deles muda pelo `Impact` do plano; o nome fica, o conteúdo
  ganha o que o plano acrescenta e nenhuma asserção é afrouxada:
  `ficha_twelve_keys_for_admin_and_reception` (doze para treze chaves), `ficha_hr_finance_without_health_notes_key`
  (onze para doze), `ficha_instructor_three_keys_only` (`id`, `name`, `status` mais `photoUrl`),
  `list_50_sorted_by_folded_name_then_id` (cinco para seis chaves por item) e `list_instructor_three_keys_per_item`
  (três para quatro), todos em `students-read.test.ts` e `students-search.test.ts`;
  `audit_actions_end_with_three_student_actions_in_order` e `audit_actions_end_with_three_consent_actions_in_order`
  em `contracts.test.ts`, e `ten_actions_shown_by_label` em `audit.spec.ts` (de dezesseis para dezoito ações);
  `health_ok_200`, `health_503_when_db_refuses` e `health_503_within_3s_when_db_hangs` em `health.test.ts`
  (o objeto `checks` ganha `storage`); `only_three_routes_answer_without_session` vira
  `only_four_routes_answer_without_session` com a quarta rota; `request_bodies_come_from_contract_schemas` em
  `openapi.test.ts` (a rota de corpo `multipart/form-data`, sem schema Zod, entra na lista de exceções da última
  asserção, que hoje exige que nenhuma outra rota declare corpo)
- `paths_equal_registered_api_routes`, `hostile_input_never_answers_5xx`, `every_route_with_body_answers_422` e
  `responses_match_contract_schemas` leem o roteador ou a lista de rotas e passam a cobrir as rotas novas sem
  check próprio aqui; `every_route_with_body_answers_422` tem lista escrita no teste e não inclui a rota
  multipart (responde `415` ao JSON, C20)
- Além do texto das AC, derivado do Problem, do `Flow` ou da prática do repositório, e que o Build pode
  discutir antes de fechar: as oito orientações EXIF (C28, o RF-14 diz "orientação corrigida"), o diretório
  temporário (C30), o `id` em maiúsculas (C31), o RIFF que não é WebP (C19), o envio em partes (C21), os
  limites de 40 000 000 e 40 000 005 pixels (C24), o `/health` pendurado em até 3 s (C58, mesma regra do banco),
  `csrf_rejected` na rota multipart (C77) e o `403` para foto que nunca existiu (C40)
- Decisões que o plano deixa de fora de AC e que nenhum check afirma: o que `POST` responde a um arquivo de zero
  byte (a leitura literal da AC 9 é `415`); o que a rota de arquivo responde com `exp` exatamente igual ao
  instante; se `PHOTO_URL_SECRET` igual a `AUTH_SECRET` é recusado (o `Impact` diz "separada", a AC 49 não); o
  que a rota de arquivo responde quando a linha existe e o objeto sumiu do bucket; o tempo-limite de um
  armazenamento que aceita a conexão e nunca responde durante o envio ou a entrega; a ordem do `Cache-Control`
  quando um proxy reescreve cabeçalho; o `DELETE` e o `POST` do mesmo aluno ao mesmo tempo
- A comparação em tempo constante de `sig` (door 4) não é check: nenhuma prova de exit code mede tempo de
  comparação, e a C8 prova só o resultado de cada forma
- A meta "upload + processamento < 5 s" do PRD §4 não é check: o plano não a transforma em AC e uma asserção de
  tempo reprova num executor carregado (commit `1ab03a3`); a C78 percorre o caminho de 5 MiB pela origem do web
  e prova que ele fecha com `201`, não quanto tempo leva
- Nenhuma prova cobre o `Dockerfile` além do que a C78 e a C79 percorrem: se `sharp` instala em `musl` e se o
  `allowBuilds` do `pnpm-workspace.yaml` basta são achados do `docker compose up --build` desses dois checks
- No other check claims more than the cases its proof exercises

## Test policy

As linhas de `features/auth-rbac/checks.md`, de `features/auditoria/checks.md`, de `features/alunos/checks.md`
e de `features/consentimento/checks.md` seguem valendo e respondem as duas perguntas para o que esta feature
reaproveita (guarda, validação, gravador, tela, restrição do banco, corte por perfil). Respondem mal três casos
que lá não existiam: o código que decide dentro da própria rota com um serviço externo real no caminho, o
assinador de URL, e o pipeline de imagem. Os três ganham linha:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide, alcançado por HTTP e dependente do armazenamento (validação do arquivo, dimensões, resolução, recorte, orientação, metadado, o que grava e o que desfaz) | uma prova na fronteira HTTP da API montada, com Postgres e MinIO reais, lendo `photos`, `audit_logs` e o bucket por conta própria | um caso afirmado por linha da tabela de decisão, nas duas bordas de cada limite; contagem de linhas e lista de chaves do bucket antes e depois em todo caso que não grava |
| Decide, com ramos que a rota não separa (o verificador de assinatura, a função de chave) | uma prova na fronteira **e** uma no próprio nível | a fronteira: `200`, `403`, `404` e o corpo; o próprio nível: um caso por forma da tabela, sem lançar |
| Falha de dependência (armazenamento que falha, fora ou pendurado) | uma prova com o proxy `flakyStorage` ou o endpoint fora, na fronteira HTTP | um caso por variante que falha, e o estado que sobra (linhas e objetos) afirmado em cada um |
| Instrumentação: o controller que só repassa a parte `file`, o mapa de rótulos de `ACTION_LABELS`, o cliente S3 (provado através das rotas), o recorte do círculo de iniciais no web (provado por C62 através da tela) | nenhuma própria | coberta pela prova de quem a consome |

Evidence (o código da feature ainda não existe; a contagem vem do plano e do código que ele altera):

- envio: 5 recusas de conteúdo, 3 corpos que não são multipart, 4 formas de parte malformada, 2 bordas de tamanho
  mais o caso em partes, 5 casos de dimensão, 3 de resolução, 4 de arquivo que não decodifica (C18 a C25) -> decide
- variantes: 3 tamanhos, 4 recortes, 8 orientações, 3 formatos sem metadado, 4 coisas que não podem sobrar do
  original, 4 origens da chave (C26 a C31) -> decide
- falha de dependência: 3 variantes que falham mais o endpoint fora, a transação que falha depois dos objetos, a
  corrida perdida, os objetos que não saem (C13, C32, C33, C50) -> decide
- assinatura: 13 pedidos adulterados, 8 formas do verificador, 2 bordas de `exp`, 2 casos de foto ausente, o
  formato da URL e a fórmula do HMAC (C7, C8, C34 a C41) -> decide
- corte por perfil: 4 perfis e 3 conjuntos de chaves da ficha, 2 da lista (C45, C46), `photoUrl` nunca omitido
  -> decide
- auditoria: 2 ações, 10 resultados que não gravam, 2 rotas que desfazem (C52 a C57) -> decide
- migração `0005`: 1 `CHECK`, 1 `UNIQUE`, 1 índice parcial único, 1 chave estrangeira sem cascata, 1 `DEFAULT`
  (C1 a C5) -> decide
- `/health` e ambiente: 4 estados do armazenamento, 5 variáveis mais 2 bordas de `PHOTO_URL_SECRET` (C58, C59) -> decide
- closest analogue in the repo: `apps/api/test/students-create.test.ts` e `students-update.test.ts`, cada caso
  da tabela de decisão provado um a um na fronteira HTTP contra a aplicação do `startApi`; `apps/api/test/audit-users.test.ts`,
  linha gravada e desfeita por gatilho que falha; `packages/database/test/students.test.ts`, restrições do
  banco provadas uma a uma sobre o banco migrado; e `startPostgres` em `apps/api/test/support/servers.ts`, o
  molde de `startMinio`. Não há precedente no repositório de armazenamento de objetos nem de processamento de imagem

Cost: 4 arquivos de teste novos de API além dos 2 de unidade e os 4 de integração que as slices já exigem, 1
arquivo de apoio (`support/photos.ts`, com o gerador de imagens, o cliente do bucket e o `flakyStorage`) e uma
subida de MinIO por arquivo de teste de integração. As provas de unidade (C6 a C8) são checks, não custo extra.
Sem a linha "ramos que a rota não separa", a tabela de adulteração seria provada só pelos pedidos que a
fronteira percorre.

## Swept

- validation: C18, C19, C20, C21, C22, C23, C24, C25, C36, C40, C59
- failure modes: C32, C33, C50, C55, C58, C63, C66
- idempotency: C48 (remover sem foto), C12 (enviar de novo recusa e não altera), C13 (dois envios ao mesmo tempo), C51 (reenviar depois de remover); uma URL pedida duas vezes devolve `exp` diferente e não grava nada (C34, C54)
- authorization: C15, C16, C34, C38, C40, C42, C43, C68, C74, C76, C77; existing - a guarda global (AD-022), a checagem de origem (AD-020) e o `403` de cadastro obrigatório do 2FA, pelas provas `guard_matrix_three_declarations_five_callers` e `admin_without_2fa_gets_403_everywhere_else`
- concurrency: C13 (dois envios do mesmo aluno, o índice parcial decide); remover e enviar ao mesmo tempo não tem check (ver as decisões sem AC)
- data lifecycle: C47, C51, C30, C1 - remover apaga linha e objetos, nada sobra do original e a chave estrangeira não cascateia; exclusão definitiva, versões de 30 dias e retenção são da `privacidade` e da `foto-captura`, e o backup do bucket (Open question 4) é da `operacao`
- dependency failure: C32 (armazenamento que falha, fora), C58 (`/health` com armazenamento fora, sem bucket e pendurado), C33 (banco que falha depois dos objetos), C50 (objetos que não saem na remoção), C63 (imagem que não carrega na tela), C79 (armazenamento que para na stack); o armazenamento pendurado durante o envio ou a entrega não tem tempo-limite no plano e nenhum check o afirma
- state transitions: C17 (aluno `inactive` e `suspended`), C41 (assinatura válida de foto que deixou de existir), C47 (com foto para sem foto), C51 (sem foto, com foto, sem foto, com foto), C12
- observability: C52, C53, C54, C55, C56, C57, C44, C50 (o `photoId` no log do órfão) - a trilha de envio e remoção é o que esta feature torna observável; ver a foto não grava linha (Assumptions)

## Out of scope

Já está em `plan.md` (Out of scope e Assumptions). Aqui só o que os checks acrescentam:

- Qualquer tela ou rota de foto de funcionário - é da `funcionarios`; a tabela deixa a coluna de entrada pronta (door 1)
- Prova de latência (PRD §4, < 5 s) e de carga - não é AC do plano
- Exigir `image_use` ativo antes do envio - Open question 3, resolvida pelo plano: o envio não consulta `consents`

## Handoff

- Tamanhos: os arquivos novos não existem, então cada slice é estimativa do que será criado (KB de código e teste, dividido por quatro); o que já existe foi medido com `wc -c`. Código novo: S0 = 8k (inclui a migração `0005` e o snapshot do Drizzle), S1 = 10k (inclui `support/photos.ts` e `startMinio`), S2 = 9k, S3 = 8k, S4 = 10k, S5 = 4k, S6 = 5k, S7 = 4k, S8 = 13k, S9 = 6k: 77k. Arquivos existentes que a feature edita ou lê para editar (39 arquivos, 200 KB: 26 de código com 90 KB e 13 de teste com 110 KB; os maiores: `students.service.ts` 15 KB, `contracts.test.ts` 21 KB, `audit.spec.ts` 19 KB, `compose.test.ts` 14 KB, `students.ts` de contracts 12 KB, `schema.ts` 9,5 KB, `students-search.test.ts` 9 KB, `fake-api.ts` 7 KB): 50k. `plan.md` (39 KB, 10k) e este arquivo (66 KB, 17k): 27k. Total 77k + 50k + 27k = 154k, acima do orçamento de 150k
- Corte, no limite entre a API e o que a monta: batch 1 = S0 a S6 e C71 a C77 da S9 (API, contracts e database): código novo 54k + 4k = 58k, arquivos existentes 31k (122 KB: `apps/api/src`, `packages/contracts`, `packages/database`, `.env.example`, `pnpm-workspace.yaml` e seus testes), documentos 27k = 116k; batch 2 = S7, S8 e C78 a C80 da S9 (ambiente, stack e web): código novo 4k + 13k + 2k = 19k, arquivos existentes 19k (78 KB: `compose.yaml`, `Dockerfile`, `apps/web/src`, `health.test.ts`, `boot.test.ts`, `audit.spec.ts`, `fake-api.ts`, `compose.test.ts`, `repo.test.ts`), documentos 27k = 65k. Soma dos dois: 58k + 19k = 77k de código novo e 31k + 19k = 50k de existentes, que é o total acima. Nenhuma slice sozinha passa de 13k, então nenhuma foi cortada demais
- Ordem: S0 primeiro (a tabela, a chave, o assinador, o vocabulário e o contrato, de que todo o resto depende); `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `PHOTO_URL_SECRET` entram no `env.ts`, em `.env.example` e em `support/app.ts` neste commit, ou nenhuma prova de API sobe e o teste `env_example_lists_every_required_key` reprova; depois S1, S2, S3, S4, S5, S6, C71 a C77, S7, S8 e C78 a C80. Antes da S1, conferir que `to_jsonb(photos)` serve às provas de linha idêntica e que o `sharp` instala e carrega no `dist` do esbuild (`sharp` é nativo e fica fora do pacote)
- Mechanism: handoff - escolhido pelo usuário em 2026-10-04, antes da primeira linha de código; corte acima, batches em sequência e só na verde. Batch 1 (S0 a S6 e C71 a C77) em andamento; o Verifier só roda depois do batch 2, sobre a feature inteira
