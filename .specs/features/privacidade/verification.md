# Privacidade verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 8cdaef1..5cf5d86
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

A rodada 1 (registrada em `334b2ce`) tinha um único item vermelho: a linha nova de `Test policy` (operação destrutiva) não era cumprida por C21 e C34. A correção `35d6fd3` ajustou a expectativa da linha em `checks.md` (as nove tabelas e a contagem de `audit_logs` idênticas, o bucket no estado parcial que a remoção interrompida deixa, e a repetição terminando em `204` com o bucket vazio) e `5cf5d86` reescreveu as duas provas com `privacySnapshot` e a asserção do estado parcial; C34 ganhou a repetição. Nenhum claim de check e nenhum código de produção mudaram. Nesta rodada, em `5cf5d86`, os 118 comandos `Proof:` (111 checks) foram rerodados e todos passaram com cada nome individual na saída; as linhas de `Coverage` cuja autoridade o fix tocou foram recomputadas, sem membro `Unproven`; quatro falhas de comportamento foram injetadas e as quatro morreram; a linha de `Test policy` está cumprida como corrigida.

## Binding sources

O plano não marca nenhuma fonte como binding e não há passo `ui`: o passo 1 não tem entrada. O fix tocou só duas provas de API e a linha de `Test policy`, sem mudar interface. `verified at 5cf5d86`.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| nenhuma fonte binding no plano | n/a | - | - |

## Checks

Os 118 comandos das linhas `Proof:` (111 checks) foram rerodados em `5cf5d86`, um por alvo, e cada nome apareceu individualmente na saída:

- banco: `pnpm --filter "./packages/database" exec vitest run test/privacy.test.ts test/students.test.ts test/photos.test.ts --reporter=verbose` - exit 0, 18 passed (C68 a C72, C47, C109 e `photos.test.ts` inteiro, cada um como `✓`)
- contrato: `pnpm --filter "./packages/contracts" exec vitest run test/privacy.test.ts -t "settings_request_and_export_response_schemas_accept_and_reject"` - exit 0, 1 passed
- repo: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "env_example_and_compose_do_not_mention_retention_days"` - exit 0, 1 passed, 9 skipped
- API (depois de `pnpm --filter "./apps/api" run build`, exit 0): uma chamada `vitest run` com os 13 arquivos (`privacy-export`, `privacy-anonymize`, `privacy-anonymized-routes`, `staff-privacy`, `privacy-settings`, `privacy-retention`, `contracts`, `openapi`, `enrollment`, `access`, `env`, `boot`, `photos-purge`) e `-t "^(<os 86 nomes>)$"` - exit 0, 86 passed, 61 skipped (13 arquivos passed); conferi 86 linhas `✓` únicas contra a lista esperada, 0 ausentes
- API, C108: `pnpm --filter "./apps/api" exec vitest run test/students-audit.test.ts` - exit 0, 10 passed
- web (depois de `pnpm --filter "./apps/web" run build`, exit 0): uma chamada `playwright test e2e/privacy-block.spec.ts e2e/privacy-print.spec.ts e2e/privacy-settings.spec.ts e2e/shell.spec.ts e2e/audit.spec.ts -g "<os 18 nomes>"` - exit 0, 18 passed, cada nome como `ok`
- stack (Docker): `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "<C105|C106|up_wait...>"` - exit 0, 3 passed, 18 skipped

As citações dos arquivos que o fix não tocou vêm da rodada 1 e são `carried from 5823ec6`; as de `apps/api/test/privacy-anonymize.test.ts` e `apps/api/test/staff-privacy.test.ts` foram refeitas e são `verified at 5cf5d86`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 200, três cabeçalhos, dez chaves | API batch ✓ | `apps/api/test/privacy-export.test.ts:51` - `toBe(\`attachment; filename="aluno-${subject.id}.json"\`)`; `:52` `cache-control` `'no-store'`; `:54-57` chaves exatas e `formatVersion` `1` | PASS |
| C2 | `student` com 14 chaves, saúde decifrada, nulls | API batch ✓ | `privacy-export.test.ts:82-83` - `Object.keys(student).sort()` igual às 14 e `toEqual({... healthNotes: HEALTH_NOTES ...})`; `:104-106` nulls no aluno mínimo | PASS |
| C3 | responsáveis e consentimentos com revogado e termo | API batch ✓ | `privacy-export.test.ts:120` responsáveis = linhas por `id`; `:130-147` consentimentos com `termText: termOf(...)` e `revokedAt`; `:149` chaves exatas | PASS |
| C4 | períodos, pagamentos, presenças sem autor | API batch ✓ | `privacy-export.test.ts:161` `planName: 'Plano Renomeado'` com o cancelado; `:177-181` pagamentos com desfeito; `:183-187` `checkIns` com chaves `['checkedInAt','day']` | PASS |
| C5 | fotos com bytes `large` do bucket | API batch ✓ | `privacy-export.test.ts:209` prefixo `data:image/webp;base64,`; `:212` `bytes.equals(stored)` | PASS |
| C6 | seis coleções `[]` | API batch ✓ | `privacy-export.test.ts:224` - `expect(body[key], key).toEqual([])` | PASS |
| C7 | uma linha `student.exported` com ator, IP, UA, diff nulo | API batch ✓ | `privacy-export.test.ts:234-243` - `toHaveLength(1)` e `toMatchObject({ action: 'student.exported', ..., diff: null })` | PASS |
| C8 | trilha falha: 500 sem dado | API batch ✓ | `privacy-export.test.ts:252-254` - `500`, `internal_error`, `not.toContain(secret)` | PASS |
| C9 | armazenamento fora: 503 sem linha | API batch ✓ | `privacy-export.test.ts:270-272` - `503`, `storage_unavailable`, `auditCount` igual | PASS |
| C10 | 403 três perfis, 401, 404 desconhecido e `abc` | API batch ✓ | `privacy-export.test.ts:289-290`, `:294-295`, `:298-299`, `:301` | PASS |
| C11 | 204 limpa nove campos, mantém id/criação/inativação | API batch ✓ | `apps/api/test/privacy-anonymize.test.ts:94-105` - `204`, `''`, `ANONYMIZED_NAME`, nove `toBeNull`, `anonymizedAt` entre t0 e t1 | PASS |
| C12 | apaga responsáveis e consentimentos | API batch ✓ | `privacy-anonymize.test.ts:116-117` - contagens `0` | PASS |
| C13 | apaga duas fotos e seis objetos | API batch ✓ | `privacy-anonymize.test.ts:122` seis chaves antes; `:126-127` linhas `[]` e `bucketKeys` `[]` | PASS |
| C14 | períodos, pagamentos e presenças idênticos | API batch ✓ | `privacy-anonymize.test.ts:138-140` - `toEqual(before.*)` | PASS |
| C15 | CPF livre: 201 | API batch ✓ | `privacy-anonymize.test.ts:150-151` | PASS |
| C16 | uma linha `student.anonymized`, antigas intactas | API batch ✓ | `privacy-anonymize.test.ts:163-175` | PASS |
| C17 | active e suspended: 409 `subject_not_inactive`, nada muda | API batch ✓ | `privacy-anonymize.test.ts:185-187` - `privacySnapshot` igual | PASS |
| C18 | período active ou scheduled: 409, nada muda | API batch ✓ | `privacy-anonymize.test.ts:203-205` | PASS |
| C19 | overdue ou pending: 409, nada muda | API batch ✓ | `privacy-anonymize.test.ts:221-223` | PASS |
| C20 | virada em São Paulo, 02:59:59Z e 03:00:00Z | API batch ✓ | `privacy-anonymize.test.ts:231-237` (`BEFORE_TURN` = `2026-10-08T02:59:59Z`, `apps/api/test/support/check-ins.ts:9`) | PASS |
| C21 | 503, linhas como antes, repetição 204 | API batch ✓ | `privacy-anonymize.test.ts:254-255` `503` e `storage_unavailable`; `:258-259` as nove tabelas de `privacySnapshot` iguais e `audit` igual; `:261` bucket no estado parcial (saem os quatro `thumb`/`medium`, ficam os dois `large`); `:266-267` repetição `204` e bucket do titular vazio | PASS |
| C22 | duas anonimizações: 204 e 404, dez rodadas | API batch ✓ | `privacy-anonymize.test.ts:281` `toEqual([204, 404])`; `:283` `not_found`; `:284` uma linha de trilha por rodada | PASS |
| C23 | anonimização e foto: sem linha e sem objeto, dez rodadas | API batch ✓ | `privacy-anonymize.test.ts:295` `204`; `:296` `[201, 404]`; `:297` sem linha de `photos`; `:298` sem chave no bucket | PASS |
| C24 | 403/401/404 incluindo já anonimizado | API batch ✓ | `privacy-anonymize.test.ts:311-312` `403`/`forbidden` nos três perfis; `:316-317` `401` e `privacySnapshot` igual; `:323-324` `404`/`not_found` para desconhecido, `abc` e já anonimizado | PASS |
| C25 | 21 rotas 404, nada muda | API batch ✓ | `apps/api/test/privacy-anonymized-routes.test.ts:72` `toHaveLength(21)`; `:77-78` `404` `not_found`; `:81` snapshot igual | PASS |
| C26 | lista omite em itens e total | API batch ✓ | `privacy-anonymized-routes.test.ts:98`, `:100` - `before[index]! - 1` | PASS |
| C27 | painel: inactive menos um | API batch ✓ | `privacy-anonymized-routes.test.ts:116-118` | PASS |
| C28 | relatório com "Titular anonimizado" e mesmo total | API batch ✓ | `privacy-anonymized-routes.test.ts:136-137` | PASS |
| C29 | trilha mantém todas as linhas mais a nova | API batch ✓ | `privacy-anonymized-routes.test.ts:156-158` | PASS |
| C30 | exportação de funcionário: cabeçalhos, seis chaves, user, fotos | API batch ✓ | `apps/api/test/staff-privacy.test.ts:70-73`, `:79-80`, `:93`, `:112`, `:119` | PASS |
| C31 | `staff.exported`, sem `staff.viewed`, 503 sem linha | API batch ✓ | `staff-privacy.test.ts:129-138`, `:151-153` | PASS |
| C32 | anonimização de funcionário 204 com efeito completo | API batch ✓ | `staff-privacy.test.ts:171-188` | PASS |
| C33 | active 409 not_inactive, vinculado 409 user_linked | API batch ✓ | `staff-privacy.test.ts:201-203` - `privacySnapshot` igual nos dois | PASS |
| C34 | 503 e linhas como antes | API batch ✓ | `staff-privacy.test.ts:222-223` `503` e `storage_unavailable`; `:226-227` as nove tabelas de `privacySnapshot` iguais e `audit` igual; `:229` bucket no estado parcial; `:234-235` repetição `204` e bucket do funcionário vazio | PASS |
| C35 | dez rotas 404, sem `staff.viewed`, fora da lista | API batch ✓ | `staff-privacy.test.ts:260` `toHaveLength(10)`; `:272-273` `404`; `:275` sem `staff.viewed`; `:283` fora da lista | PASS |
| C36 | CPF do funcionário livre: 201 | API batch ✓ | `staff-privacy.test.ts:293-294` | PASS |
| C37 | 403/401/404 nas duas rotas | API batch ✓ | `staff-privacy.test.ts:310-311` `403` nas duas rotas e três perfis; `:317-318` `401`; `:320` snapshot igual; `:328-329` `404` para desconhecido e `abc` | PASS |
| C38 | configuração nova `null` e `30` | API batch ✓ | `apps/api/test/privacy-settings.test.ts:58` | PASS |
| C39 | PUT devolve e grava | API batch ✓ | `privacy-settings.test.ts:67-69` | PASS |
| C40 | anos: aceita 3, recusa 5 com path | API batch ✓ | `privacy-settings.test.ts:76-77`, `:91-95` | PASS |
| C41 | dias: aceita 2, recusa 6 com path | API batch ✓ | `privacy-settings.test.ts:103-104`, `:119-123` | PASS |
| C42 | diff só do que mudou, sem linha sem mudança | API batch ✓ | `privacy-settings.test.ts:133-142`, `:147-153`, `:158` | PASS |
| C43 | troca de foto lê os dias, guardada mantém o prazo | API batch ✓ | `privacy-settings.test.ts:176`, `:178`, `:188-189` | PASS |
| C44 | variável fora de env, ignorada no processo, fora de `.env.example` e `compose.yaml` | API batch ✓ (env, boot) e repo ✓ | `apps/api/test/env.test.ts:17-18`; `apps/api/test/boot.test.ts:360` `/health` `200` com `PHOTO_VERSION_RETENTION_DAYS: '0'`; `tests/repo/repo.test.ts:69-71` | PASS |
| C45 | 403 três perfis, 401, linha não muda | API batch ✓ | `privacy-settings.test.ts:205-206`, `:211-212`, `:214` | PASS |
| C46 | `inactivated_at` grava, limpa, regrava, mantém | API batch ✓ | `apps/api/test/privacy-retention.test.ts:117-118`, `:122`, `:126-127` (PATCH inactive 422, decisão do usuário registrada no Handoff do batch B), `:132-134`, `:138`, `:142` | PASS |
| C47 | backfill da linha mais recente ou `updated_at` | DB batch ✓ | `packages/database/test/privacy.test.ts:517-521` | PASS |
| C48 | retenção desligada não anonimiza | API batch ✓ | `privacy-retention.test.ts:152` - snapshot igual | PASS |
| C49 | exatamente em N anos, efeito completo | API batch ✓ | `privacy-retention.test.ts:162-163` antes; `:168-180` depois | PASS |
| C50 | linha da retenção sem autor | API batch ✓ | `privacy-retention.test.ts:190-199` | PASS |
| C51 | o do meio pulado, os outros anonimizados | API batch ✓ | `privacy-retention.test.ts:212-214` | PASS |
| C52 | active e suspended nunca | API batch ✓ | `privacy-retention.test.ts:230` | PASS |
| C53 | falha num aluno, o seguinte anonimizado, API de pé | API batch ✓ | `privacy-retention.test.ts:245-249` | PASS |
| C54 | subida, 60 min, sobrevive à falha, para ao fechar | API batch ✓ | `privacy-retention.test.ts:262`, `:278`, `:280`, `:295-297`, `:300`, `:303` | PASS |
| C55 | uma linha de log com contagens sem identificadores; erro sem detalhe | API batch ✓ | `privacy-retention.test.ts:329-331`, `:339`, `:356-360` | PASS |
| C56 | bloco só para admin, três controles | web ✓ | `apps/web/e2e/privacy-block.spec.ts:71` `toEqual(CONTROLS)`; `:86` `toHaveCount(0)` | PASS |
| C57 | baixa o arquivo com o nome da rota | web ✓ | `privacy-block.spec.ts:103`, `:105` | PASS |
| C58 | texto exato e Cancelar não chama a API | web ✓ | `privacy-block.spec.ts:115`, `:122-123` | PASS |
| C59 | 204 leva à lista com "Titular anonimizado." | web ✓ | `privacy-block.spec.ts:135-136` | PASS |
| C60 | cinco mensagens por code | web ✓ | `privacy-block.spec.ts:159-160` | PASS |
| C61 | seções, datas, fotos, vazio, Imprimir | web ✓ | `apps/web/e2e/privacy-print.spec.ts:43`, `:56`, `:60`, `:63`, `:73` | PASS |
| C62 | falha da exportação: mensagem e repetir | web ✓ | `privacy-print.spec.ts:84`, `:89`, `:96`, `:104-105` | PASS |
| C63 | link só admin; outros sem permissão e sem pedido | web ✓ (shell e privacy-settings) | `apps/web/e2e/shell.spec.ts:195`; `apps/web/e2e/privacy-settings.spec.ts:30-31` | PASS |
| C64 | Desligado ou anos, salvar, erros por campo | web ✓ | `privacy-settings.spec.ts:40`, `:49`, `:53-54`, `:73-74` | PASS |
| C65 | marcação como texto literal | web ✓ | `privacy-print.spec.ts:120`, `:122` - `main b` `toHaveCount(0)` | PASS |
| C66 | cinco rótulos em `/audit` | web ✓ | `apps/web/e2e/audit.spec.ts:1001`, `:1007` - `toEqual(PRIVACY_LABELS)` | PASS |
| C67 | falha de carga sem formulário | web ✓ | `privacy-settings.spec.ts:84-87` | PASS |
| C68 | CHECKs da door 1, um caso por campo | DB batch ✓ | `packages/database/test/privacy.test.ts:123`, `:140-141`, `:149-150`, `:152`, `:157`, `:168-169`, `:182-183` | PASS |
| C69 | CHECKs da door 2 | DB batch ✓ | `privacy.test.ts:192`, `:217-218`, `:230-231`, `:237` | PASS |
| C70 | `inactivated_at` sse inactive | DB batch ✓ | `privacy.test.ts:251-252`, `:260` | PASS |
| C71 | linha única, null e 30, limites | DB batch ✓ | `privacy.test.ts:269`, `:273`, `:275`, `:287`, `:295`, `:298` | PASS |
| C72 | 0011 só a forma, mantém linhas, idempotente | DB batch ✓ | `privacy.test.ts:346`, `:408`, `:432`, `:448-451`, `:470` | PASS |
| C73 | schemas do PUT e das exportações | contrato ✓ | `packages/contracts/test/privacy.test.ts:70-71`, `:93-94`, `:103-113` | PASS |
| C74 | 43 ações, as cinco por último | API batch ✓ | `apps/api/test/contracts.test.ts:1042` `toHaveLength(43)`; `:1044` `slice(38)` igual às cinco | PASS |
| C75 | três códigos problem+json 409 | API batch ✓ | `privacy-anonymize.test.ts:418-419` `409` e prefixo `application/problem+json`; `:421-422` `problemSchema` aceita e `status`/`code` | PASS |
| C76 | exportação não muda nada além da trilha | API batch ✓ | `privacy-export.test.ts:311-313` | PASS |
| C77 | formato e ordem | API batch ✓ | `privacy-export.test.ts:386-388`, `:390-416`, `:419-432` | PASS |
| C78 | duas exportações, duas linhas | API batch ✓ | `privacy-export.test.ts:443-446` | PASS |
| C79 | nenhuma linha do vizinho | API batch ✓ | `privacy-export.test.ts:467-468` | PASS |
| C80 | vizinho idêntico na anonimização | API batch ✓ | `privacy-anonymize.test.ts:337` `subjectRows(neighbor)` igual ao de antes; `:338` seis chaves do vizinho iguais | PASS |
| C81 | not_inactive antes de open_periods | API batch ✓ | `privacy-anonymize.test.ts:348-349` | PASS |
| C82 | tabela de oito linhas | API batch ✓ | `privacy-anonymize.test.ts:365` `toHaveLength(8)`; `:371-372` status e código por linha | PASS |
| C83 | origem estrangeira 403 csrf, nada muda | API batch ✓ | `privacy-anonymize.test.ts:382-384` | PASS |
| C84 | URL assinada 404 depois | API batch ✓ | `privacy-anonymize.test.ts:398` | PASS |
| C85 | 404 sem trilha, telefone e CPF antigos não acham | API batch ✓ | `privacy-anonymized-routes.test.ts:169`, `:171` | PASS |
| C86 | funcionário vizinho idêntico | API batch ✓ | `staff-privacy.test.ts:343` seis chaves; `:347-351` linha, fotos e chaves do vizinho iguais | PASS |
| C87 | not_inactive antes de user_linked | API batch ✓ | `staff-privacy.test.ts:359-360` | PASS |
| C88 | origem estrangeira na anonimização de funcionário | API batch ✓ | `staff-privacy.test.ts:369-371` | PASS |
| C89 | chave a mais 422, ilegível 400, origem 403 | API batch ✓ | `privacy-settings.test.ts:223-227`, `:230-232`, `:235-238` | PASS |
| C90 | configuração sobrevive ao reinício | API batch ✓ | `privacy-settings.test.ts:255` | PASS |
| C91 | limite de 20 anos | API batch ✓ | `privacy-retention.test.ts:372`, `:375` | PASS |
| C92 | 29/02 mais 1 ano é 28/02 | API batch ✓ | `privacy-retention.test.ts:383`, `:386` | PASS |
| C93 | relógio da API | API batch ✓ | `privacy-retention.test.ts:396`, `:399` | PASS |
| C94 | duas instâncias, cada um uma vez | API batch ✓ | `privacy-retention.test.ts:419-422` | PASS |
| C95 | retenção e pedido juntos, uma linha | API batch ✓ | `privacy-retention.test.ts:439-440` | PASS |
| C96 | não admin não pede rota de privacidade | web ✓ | `privacy-block.spec.ts:175` | PASS |
| C97 | impressão do funcionário | web ✓ | `privacy-print.spec.ts:132`, `:138-142`, `:147` | PASS |
| C98 | sem sessão leva a /login | web ✓ | `privacy-settings.spec.ts:102` | PASS |
| C99 | Desligado envia null, 20 envia 20 | web ✓ | `privacy-settings.spec.ts:119-122` | PASS |
| C100 | botão desabilitado e um POST só | web ✓ | `privacy-block.spec.ts:189`, `:192` | PASS |
| C101 | OpenAPI com as seis rotas e o corpo do contrato | API batch ✓ (duas provas) | `apps/api/test/openapi.test.ts:421-426`, `:444`, `:450`; `:82` `documented` = `registered` | PASS |
| C102 | 403 two_factor nas seis rotas | API batch ✓ | `apps/api/test/enrollment.test.ts:46-47`; lista `:99-104` | PASS |
| C103 | só quatro rotas sem sessão | API batch ✓ | `apps/api/test/access.test.ts:161-166` | PASS |
| C104 | seis rotas e tarefa montadas no harness | API batch ✓ | `privacy-settings.test.ts:276`, `:278`, `:284-285` | PASS |
| C105 | stack: exportar, anonimizar, CPF, config, trilha, página | stack ✓ (9,0 s) | `tests/stack/compose.test.ts:569` (`null` e `30`); `:574` sem a variável; `:617-621`; `:628-630`; `:638`; `:646-647`; `:652-656`; `:661` | PASS |
| C106 | stack da foto-captura: 30 dias de `privacy_settings` | stack ✓ (16,0 s) | `compose.test.ts:456` `toBe('30')`; `:507` janela de 30 dias de `expires_at` | PASS |
| C107 | dias pela configuração; expurgo continua | API batch ✓ (duas provas) | `apps/api/test/photos-purge.test.ts:308` (`update privacy_settings`), `:320`, `:342`; `:103-104` | PASS |
| C108 | inativação existente segue, com `inactivated_at` | students-audit ✓ (10 passed) e API batch ✓ | `apps/api/test/students-audit.test.ts:144-146`; `privacy-retention.test.ts:117-118` | PASS |
| C109 | CHECK de status com door 3 | DB batch ✓ | `packages/database/test/students.test.ts:107`, `:114` (`rejects.toMatchObject`) | PASS |
| C110 | schemas de ficha sem mudança, testes sem edição | API batch ✓ (duas provas) | `contracts.test.ts:488`, `:918` - `parsed.success` `true`; os hunks do diff em `contracts.test.ts` não tocam as linhas 453-503 nem 869-997 | PASS |
| C111 | `privacy_settings` na lista de tabelas | DB batch ✓ | `packages/database/test/photos.test.ts:217` | PASS |

Notas de precisão, sem mudar o resultado:
- C46: o texto do check fala em "`PATCH` com `status` `inactive` grava um instante novo", que o contrato não aceita; a prova mostra a reinativação pelo `DELETE` e o `PATCH` recusado com `422`. O usuário decidiu manter o check como está (Handoff, batch B), e por isso fica PASS. `carried from 334b2ce` (prova verde em `5823ec6`, rerodada em `5cf5d86`).
- C68: o caso "anonimizada com `inactivated_at` nulo" (`privacy.test.ts:153-157`) afirma só `23514`, e essa linha também viola `students_inactivated_at_matches`, então a cláusula `inactivated_at IS NOT NULL` de `students_anonymized_clean` não é isolada. Ela é redundante com a door 3 (anonimizada implica `inactive`), então nenhum comportamento fica sem prova. `carried from 334b2ce` (prova verde em `5823ec6`, rerodada em `5cf5d86`).
- C21 e C34: o texto dos dois checks continua nomeando cinco e três tabelas (`students`, `guardians`, `consents`, `photos`, `audit_logs`; `staff`, `photos`, `audit_logs`), enquanto as provas agora comparam as nove tabelas de `privacySnapshot`. É a prova que ficou mais forte, não o claim que enfraqueceu; a exigência das nove tabelas, do estado parcial e da repetição vive na linha de `Test policy` corrigida. `verified at 5cf5d86`.

## Coverage

O fix não criou membro novo nem mudou código; tocou a autoridade da linha `falhas de dependência (5)`, da linha `forma literal da door 7 (6)` (o "repetir termina" agora também em C34) e da regra "Nada mudou". Essas linhas foram recomputadas em `5cf5d86`; as demais são `carried from 5823ec6` (recomputadas na rodada 1, em `334b2ce`), porque o diff não toca nenhuma autoridade delas.

| Set (size) | Recomputed from | Member -> proof | Unproven | Provenance |
| --- | --- | --- | --- | --- |
| status de `GET /api/students/:id/data-export` (6) | `Surface` do plano e a linha comum da `auth-rbac` | 200 C1 · 401 C10 · 403 forbidden C10 · 403 2FA C102 · 404 C10, C25 · 503 C9 | - | carried from 5823ec6 |
| status de `POST /api/students/:id/anonymization` (9) | `Surface` | 204 C11 · 401 C24 · 403 forbidden C24 · csrf C83 · 2FA C102 · 404 C22, C24 · 409 not_inactive C17, C75 · 409 open_periods C18, C19, C75 · 503 C21 | - | recomputed at 5cf5d86 |
| status de `GET /api/staff/:id/data-export` (6) | `Surface` | 200 C30 · 401 C37 · 403 C37 · 2FA C102 · 404 C35, C37 · 503 C31 | - | carried from 5823ec6 |
| status de `POST /api/staff/:id/anonymization` (9) | `Surface` | 204 C32 · 401 C37 · 403 C37 · csrf C88 · 2FA C102 · 404 C35, C37 · 409 not_inactive C33, C75 · 409 user_linked C33, C75 · 503 C34 | - | recomputed at 5cf5d86 |
| status de `GET /api/privacy-settings` (4) | `Surface` | 200 C38 · 401 C45 · 403 C45 · 2FA C102 | - | carried from 5823ec6 |
| status de `PUT /api/privacy-settings` (7) | `Surface` | 200 C39 · 400 C89 · 401 C45 · 403 C45 · csrf C89 · 2FA C102 · 422 C40, C41, C89 | - | carried from 5823ec6 |
| quem chama, por perfil (4) | Assumptions "só admin" | admin C1, C11, C30, C32, C38, C39 · reception, hr_finance, instructor C10, C24, C37, C45 | - | carried from 5823ec6 |
| door 1 (8) | `Landing` door 1 | C68, C15, C12, C13, C14, C25, C101, C26, C27, C35 | - | carried from 5823ec6 |
| door 2 (5) | `Landing` door 2 | C69, C33, C36 | - | carried from 5823ec6 |
| door 3 (5) | `Landing` door 3 | C70, C46, C47 | - | carried from 5823ec6 |
| door 4 (7) | `Landing` door 4 | C71, C38, C40, C41, C44, C43 | - | carried from 5823ec6 |
| door 5 (7) | `Landing` door 5 | C1, C30, C73, C6, C77, C5, C61, C97 | - | carried from 5823ec6 |
| door 6 (6) | `Landing` door 6 | C74, C7, C16, C31, C32, C42, C50 | - | carried from 5823ec6 |
| door 7 (6) | `Landing` door 7 | trava e confere antes de apagar C17, C18, C82 · objetos antes das linhas, falha desfaz C21, C34 · repetir termina C21, C34 · temporizador C54 · um titular por transação C51, C53 · falha não impede os seguintes C53 | - | recomputed at 5cf5d86 |
| Relations do aluno (6) | erDiagram do plano | guardians e consents C12 · photos C13 · enrollments, payments, check_ins C14 | - | carried from 5823ec6 |
| Relations staff-photos e privacy_settings (2) | erDiagram | C32 · C71 | - | carried from 5823ec6 |
| chaves do topo, aluno (10) | door 5 e `Surface` | C1 (`privacy-export.test.ts:54-55`, igualdade exata) | - | carried from 5823ec6 |
| chaves de `student` (14) | decisão 4 da Intent | C2 (`privacy-export.test.ts:82`) | - | carried from 5823ec6 |
| chaves do topo, funcionário (6) | `Surface` | C30 (`staff-privacy.test.ts:73`) | - | carried from 5823ec6 |
| chaves de `staff` (10) | decisão 4 | C30 (`staff-privacy.test.ts:79`) | - | carried from 5823ec6 |
| campos limpos do aluno (9) | `CHECK` da door 1: cpf, birth_date, sex, email, phone, address, emergency_contact_name, emergency_contact_phone, health_notes_enc | C11 (`apps/api/test/support/privacy.ts:15-25` lista os 9) e C68 | - | carried from 5823ec6 |
| campos limpos do funcionário (6) | `CHECK` da door 2: cpf, position, department, hired_at, phone, email | C32 (`staff-privacy.test.ts:34`) e C69 | - | carried from 5823ec6 |
| decisão de período em aberto (8) | AC 18, AC 19, AD-061, AD-068 | C82, oito linhas em `privacy-anonymize.test.ts:355-363` | - | carried from 5823ec6 |
| situações do aluno (3) | enum de `status` | inactive C11 · active, suspended C17 | - | carried from 5823ec6 |
| precedência das recusas (3) | decisão 1 da Intent | C10, C24, C37 · C81 · C87 | - | carried from 5823ec6 |
| virada em São Paulo (2) | AC 20 | C20 | - | carried from 5823ec6 |
| limites de anos (6) | AC 49, Assumptions | C49 (2) · C91 (2) · C92 · C93 | - | carried from 5823ec6 |
| valores de anos no PUT (9) | AC 40 | C40 (8) · C89 (chave a mais) | - | carried from 5823ec6 |
| valores de dias no PUT (8) | AC 41 | C41 (8) | - | carried from 5823ec6 |
| rotas de aluno 404 (21) | decoradores: `students.controller.ts` 3 (`:56,:66,:98`), `consents.controller.ts` 3, `photos.controller.ts` 4 (`:32,:44,:55,:66`), `student-enrollments.controller.ts` 3, `student-payments.controller.ts` 3, `check-ins.controller.ts` 3 (`:30,:38,:53`), `privacy.controller.ts` 2 (`:26,:40`) = 21 | C25 (`privacy-anonymized-routes.test.ts:29-51`, as 21) | - | carried from 5823ec6 |
| rotas de funcionário 404 (10) | `staff.controller.ts` 5 (`:48,:58,:70,:77,:88`), `photos.controller.ts` 3 (`:76,:87,:98`), `privacy.controller.ts` 2 (`:56,:70`) = 10 | C35 (`staff-privacy.test.ts:248-259`, as 10) | - | carried from 5823ec6 |
| leitores que deixam de ver (4) | Flow "Quem passa a ignorar" | C26 · C27 · C35 · C26 | - | carried from 5823ec6 |
| leitores que continuam vendo (2) | Flow | C28 · C29 | - | carried from 5823ec6 |
| vizinho intocado (3) | Test policy | C79 · C80 · C86 | - | carried from 5823ec6 |
| corridas (4) | AC 22, AC 23, AD-050 | C22 · C23 · C94 · C95 | - | carried from 5823ec6 |
| falhas de dependência (5) | Flow e door 7 (`checks.md:487`) | trilha na exportação C8 · armazenamento na exportação C9, C31 · armazenamento na anonimização C21, C34 · armazenamento na retenção C53 · execução que lança C54 | - | recomputed at 5cf5d86 |
| rótulos em `/audit` (5) | AC 66 | C66 (`audit.spec.ts:966-972`, os cinco literais da AC) | - | carried from 5823ec6 |
| desfechos na tela (6) | AC 59, AC 60 | C59 · C60 (cinco) | - | carried from 5823ec6 |
| estados do bloco (5) | `Observable` | C60, C62 · C56, C96 · C58 · C100 · vazio n/a no plano | - | carried from 5823ec6 |
| estados da impressão (4) | `Observable` | C61, C97 · C62 · C10 · C98 | - | carried from 5823ec6 |
| estados de `/privacy` (5) | `Observable` | C64 · C64 · C67 · C63 · C98 | - | carried from 5823ec6 |
| texto com marcação (4) | AC 65 | C65 (nome, termo, saúde, plano) | - | carried from 5823ec6 |
| checks substituídos da foto-captura (6) | Impact do plano | C44, C107, C43, C106 | - | carried from 5823ec6 |
| startup: módulo montado (2 assemblies) | `apps/api/src/app.module.ts:73-75` (os três controladores) e `:146-151` (`PrivacyService`, `PrivacyRetention`); o processo real chega lá por `apps/api/src/main.ts` -> `bootstrap.ts:12` (`AppModule.register(env)`); o harness por `apps/api/test/support/app.ts:67` (o mesmo `AppModule.register`) | harness C104 · stack C105 | - | carried from 5823ec6 |
| startup: tarefa registrada (2) | `app.module.ts:151`; `privacy-retention.ts:31-33` (`onApplicationBootstrap` com `setInterval`) | C54, C104 · stack C105 sobe a mesma montagem | - | carried from 5823ec6 |
| startup: 0011 aplicada (2) | journal `packages/database/migrations/meta/_journal.json:86` (`0011_privacy`); serviço `migrate` de `compose.yaml:25-28` com `Dockerfile:13` (`pnpm db:migrate`) | C72 · C105 (`compose.test.ts:569`) | - | carried from 5823ec6 |
| startup: variável ausente (3) | `env.ts`, `.env.example`, `compose.yaml` | C44 (três provas) · C105 (`compose.test.ts:574`) | - | carried from 5823ec6 |
| regra "Nada mudou" (9 tabelas + bucket + audit) | `checks.md:51` (as nove tabelas nomeadas) e `apps/api/test/support/privacy.ts:201-227` (`SNAPSHOT_TABLES` = students, guardians, consents, photos, enrollments, payments, check_ins, staff, privacy_settings; mais `bucketKeys` e `count(audit_logs)`) | cada tabela é comparada por C17, C18, C19, C21, C24, C33, C34, C83, C88; a contagem de `audit_logs` por C21 (`:259`) e C34 (`:227`); o bucket por C21 (`:261`) e C34 (`:229`) | - | recomputed at 5cf5d86 |

O conjunto de nove tabelas de `privacySnapshot` contém exatamente as nove que a regra "Nada mudou" nomeia (`students`, `guardians`, `consents`, `photos`, `enrollments`, `payments`, `check_ins`, `staff`, `privacy_settings`), mais a lista de chaves do bucket e a contagem de `audit_logs`: nenhuma tabela nomeada falta e nenhuma sobra. `verified at 5cf5d86`.

Sets que nenhum artefato deixou sem linha: procurei nas enumerações do `Landing`, `Relations`, `Surface` e das AC; não achei conjunto sem linha. Nível: todas as claims com status, rota ou forma de resposta têm prova na fronteira HTTP (`startPhotoStack`/`startApi`) ou no navegador sobre o build de produção, e C105/C106 no processo real da stack; as do banco têm a fronteira em C11, C15, C32, C38, C46. `carried from 334b2ce`.

## Test policy rows

A linha nova foi re-julgada contra a expectativa corrigida em `35d6fd3` e as provas de `5cf5d86`; as linhas herdadas das features anteriores continuam como na rodada 1 (a conta do `checks.md` não mudou) e são `carried from 334b2ce`.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Operação destrutiva que apaga e limpa várias tabelas e objetos de um dono, sob condições, alcançada por uma rota e por uma tarefa periódica (a anonimização) | `apps/api/src/privacy/privacy.service.ts` (`anonymizeStudent`, `anonymizeStaff`, `removePhotos`), `privacy-retention.ts`, `privacy.controller.ts` | na fronteira da rota: cada tabela e o bucket conferidos depois do sucesso, um vizinho conferido idêntico, cada condição de recusa com tudo idêntico, cada falha de armazenamento com as linhas das nove tabelas idênticas, o bucket no estado parcial que a remoção interrompida deixa e a repetição terminando; na tarefa: o mesmo efeito tabela por tabela num caso, cada limite do prazo nos dois lados, e a corrida com a rota e com outra instância | yes - C21 (`privacy-anonymize.test.ts:258-259`, `:261`, `:266-267`) e C34 (`staff-privacy.test.ts:226-227`, `:229`, `:234-235`) comparam as nove tabelas e a contagem de `audit_logs`, afirmam o estado parcial do bucket (saem os quatro `thumb`/`medium`, ficam os dois `large` recusados) e terminam na repetição `204` com o bucket do titular vazio; as recusas usam o `privacySnapshot` inteiro (C17 a C19, C24, C33, C83, C88); o vizinho é C80/C86, as oito linhas C82, o efeito pela tarefa C49, os limites C49/C91/C92 e as corridas C94/C95 |

As linhas herdadas das features anteriores (rota pela fronteira com corte por perfil, restrição por SQL, conta do dia nos dois lados, tarefa no temporizador, leitura auditada na mesma transação, tela contra a `FakeApi`, stack por `psql`) estão cumpridas: C10/C24/C37/C45, C68 a C71, C20, C54, C7/C8, C56 a C67, C105. `carried from 334b2ce`, com as provas rerodadas em `5cf5d86`.

## Swept

`carried from 334b2ce` (o fix não tocou estes arquivos); as provas que exercitam as duas restrições foram rerodadas em `5cf5d86` (C83/C88/C89 e C8/C9).

- authorization, existing: a guarda global está em `apps/api/src/app.module.ts:164` (`APP_GUARD` com `AccessGuard`, `apps/api/src/access.ts:102`, `two_factor_enrollment_required` em `:132`), e a checagem de origem em `apps/api/src/configure-app.ts:22` (`csrfProtection`, `apps/api/src/csrf.ts:25`); as três classes de privacidade levam `@Roles('admin')` (`privacy.controller.ts:22`, `:52`, `:82`). A restrição citada existe.
- dependency failure, existing: `apps/api/src/problem.filter.ts:11` transforma todo 5xx sem código próprio em `internal_error`, e a prova `unhandled_500_hides_exception` existe em `apps/api/test/problem.test.ts:31`. A restrição citada existe.

## Faults injected

Cada falha num `git worktree add --detach <scratch> HEAD` próprio sob `%TEMP%`, com `pnpm install --offline` (exit 0). `git status --porcelain` da árvore real antes: `M .specs/STATE.md`, `?? .specs/features/armazenamento-rustfs/`, `?? CLAUDE.md`; depois de remover as worktrees (`git worktree remove --force` e `git worktree prune`; `git worktree list` mostra só a principal): exatamente as mesmas três linhas. Nenhuma escrita na árvore real, nenhum `git stash`. Uma tentativa intermediária em `wt3` foi descartada por matar a mesma superfície da falha 1 (o estado parcial, não a repetição) e não entra na conta; a falha 3 abaixo foi refeita numa worktree limpa (`wt4`).

| Mutation | Location | Killed |
| --- | --- | --- |
| `removePhotos` remove só a variante `large` de cada foto (os quatro `thumb`/`medium` ficam) | `apps/api/src/privacy/privacy.service.ts:316-318` | yes - C21 `storage_failure_is_503_rolls_back_rows_and_retry_succeeds` reprovou ao comparar o estado parcial: `expected [ …(6) ] to deeply equal [ …(2) ]` |
| `removePhotos` ignora as remoções recusadas (o `503` some) | `apps/api/src/privacy/privacy.service.ts:319` | yes - C21 reprovou: `expected 204 to be 503` |
| `removePhotos` pré-checa a existência de cada objeto e falha num objeto já ausente | `apps/api/src/privacy/privacy.service.ts:314-320` | yes - C21 reprovou na repetição: `expected 503 to be 204` em `:266` |
| a anonimização de funcionário apaga as linhas de `photos` fora da transação quando a remoção falha | `apps/api/src/privacy/privacy.service.ts:260-261` | yes - C34 `staff_storage_failure_is_503_and_rows_unchanged` reprovou ao comparar `interrupted.tables`: as nove tabelas não são iguais às de antes |

As quatro superfícies de asserção que o fix criou ou fortaleceu (estado parcial do bucket, `503`, repetição `204`, linhas das nove tabelas) foram cada uma feita falhar uma vez por uma implementação errada plausível. `verified at 5cf5d86`.

## Gate

Nesta rodada rodei, em `5cf5d86`: `pnpm --filter "./apps/api" run build` (exit 0), `pnpm --filter "./apps/web" run build` (exit 0), `pnpm --filter "./apps/api" run typecheck` (exit 0), `pnpm --filter "./apps/api" run lint` (exit 0), as oito invocações de prova por alvo (DB 18 passed; contrato 1; repo 1; API 86 passed e 61 skipped em 13 arquivos; `students-audit` 10; web 18; stack 3 passed e 18 skipped) e as quatro falhas em worktrees (4 mortas, exit 1 em cada prova mutante, que é o esperado). Não rodei o `pnpm verify` completo como um comando único nesta rodada: o diff `334b2ce..5cf5d86` só toca duas provas de API e a linha de `Test policy`, e as suítes que os checks nomeiam foram todas exercitadas acima. O gate de conclusão é `python C:\Users\Admin\.agents\skills\tlc-spec-lean\scripts\validate_verification.py privacidade`, que o orquestrador roda.
