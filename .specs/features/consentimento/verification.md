# Consentimento e responsável legal - verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 4f463a3..4022b5f
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Resumo: rodada 2 escopada à C30, a única não PASS da rodada 1. Entre a rodada 1 (`7c5525c`) e o `HEAD`
(`4022b5f`) só mudaram `plan.md` (AC 15) e `checks.md` (texto da C30 e a linha de Coverage de
`consent_terms`): `git diff 7c5525c..HEAD --stat` mostra 2 arquivos em `.specs/`, nenhum teste, migração
ou código. Todas as provas foram re-rodadas em full no `HEAD`, as 89 provas nomeadas (88 checks; a C16 tem
duas) aparecem individualmente como passadas. A C30, julgada contra o texto novo, está provada parte por
parte com asserção localizada; dois mutantes novos na superfície da C30 (o gatilho de `UPDATE`/`DELETE` e a
chave estrangeira que produz o `0A000`) foram mortos. Os 88 checks passam.

## Binding sources

Carried from 7c5525c. O perfil é `standard`: o passo 1 é do perfil `ui` e não é devido, e a correção não
tocou interface. Reconferido em 4022b5f só o que a correção mudou: a AC 15 nova do `plan.md` e a C30 nova
do `checks.md` dizem a mesma coisa (simples por FK `0A000`; `CASCADE`, `UPDATE`, `DELETE` pelo gatilho com
a mensagem; linhas como estavam).

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `.specs/STATE.md` AD-024 a AD-035 e Handoff | yes (carried from 7c5525c) | - | - |
| `plan.md` (Surface, Relations, Landing, Criteria 1 a 64; AC 15 relida em 4022b5f) | yes | - | - |

Fora de check, para o orquestrador (carried from 7c5525c, ainda verdadeiro em 4022b5f): o Impact `.specs`
do plano diz que, aprovado o plano, as doors 1 a 4 viram AD-036 em diante em `STATE.md`; `STATE.md` não
mudou em `4f463a3..HEAD` e para em AD-035.

## Checks

Provas re-rodadas por mim no `HEAD` `4022b5f`, uma invocação por alvo (ver Gate); cada nome abaixo aparece
individualmente como `✓`/`ok` na saída (conferido por busca nome a nome nas saídas, 89 de 89). Citações:
verified at 4022b5f para a C30 (refeitas por `rg -n`); para as demais, carried from 7c5525c - os arquivos
citados não mudaram em `7c5525c..4022b5f`, então as linhas são as mesmas.
Arquivos de prova: `consent.test.ts` = `packages/database/test/consent.test.ts`;
`sg` = `apps/api/test/students-guardian.test.ts`; `cw` = `apps/api/test/consents-write.test.ts`;
`cr` = `apps/api/test/consents-read.test.ts`; `ca` = `apps/api/test/consents-audit.test.ts`;
`ct` = `apps/api/test/consent-terms.test.ts`; `contracts` = `apps/api/test/contracts.test.ts`;
`cs` = `apps/web/e2e/consents.spec.ts`; `ss` = `apps/web/e2e/students.spec.ts`; `as` = `apps/web/e2e/audit.spec.ts`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `students` sem coluna nova nem FK | db, `students_keeps_the_columns_of_0003_and_gains_no_foreign_key` ✓ | `packages/database/test/consent.test.ts:125` `toEqual([...14 colunas])`; `:142` FKs `toEqual([])` | PASS |
| C2 | defaults e NOT NULL de `guardians`, sem `tenant_id` | db ✓ | `packages/database/test/consent.test.ts:157` `version toBe(7)`; `:159-160` entre os dois `now()`; `:176` `NOT_NULL_VIOLATION` por campo; `:179` | PASS |
| C3 | `relationship` com quatro valores | db ✓ | `packages/database/test/consent.test.ts:191` `before + 4`; `:198` `CHECK_VIOLATION` para `uncle`, `Mother`, `''`; `:200` | PASS |
| C4 | sem UNIQUE em aluno nem CPF | db ✓ | `packages/database/test/consent.test.ts:215` `toBe(3)`; `:217` `toBe(2)` | PASS |
| C5 | FK de `guardians` restringe | db ✓ | `packages/database/test/consent.test.ts:226` e `:231` `FOREIGN_KEY_VIOLATION`; `:232-233` linhas ainda lá | PASS |
| C6 | `text` NOT NULL, `created_at` default | db ✓ | `packages/database/test/consent.test.ts:240` `NOT_NULL_VIOLATION`; `:249-250` | PASS |
| C7 | defaults e NOT NULL de `consents` | db ✓ | `packages/database/test/consent.test.ts:266-269`; `:285`; `:288` | PASS |
| C8 | três FKs recusam alvo inexistente | db ✓ | `packages/database/test/consent.test.ts:299`, `:304`, `:310` `FOREIGN_KEY_VIOLATION` | PASS |
| C9 | `granted_by` com dois valores | db ✓ | `packages/database/test/consent.test.ts:317-318` aceitos; `:325` `CHECK_VIOLATION` | PASS |
| C10 | `guardian_id` sse `guardian` | db ✓ | `packages/database/test/consent.test.ts:334-335` aceitos; `:342`, `:348` `CHECK_VIOLATION` | PASS |
| C11 | índice parcial de um ativo | db ✓ | `packages/database/test/consent.test.ts:364-365` `UNIQUE_VIOLATION` e `consents_one_active_idx`; `:372` outra versão; `:379` `toBe(5)` | PASS |
| C12 | FKs de `consents` restringem | db ✓ | `packages/database/test/consent.test.ts:391`, `:393`; `:395-397` | PASS |
| C13 | 16 ações, as três novas no fim | api ✓ | `apps/api/test/contracts.test.ts:360` `slice(13)).toEqual([guardian_saved, consent_granted, consent_revoked])` | PASS |
| C14 | schemas de pedido aceitam e recusam | api ✓ | `apps/api/test/contracts.test.ts:384` recusas (`marketing`, 0, 1.5, `"1"`, `staff`); `:392` `null` recusado | PASS |
| C15 | schemas de resposta | api ✓ | `apps/api/test/contracts.test.ts:410` `guardian null`; `:413` cada ausência recusada | PASS |
| C16 | `isMinor` e o dia de São Paulo | api, as duas provas ✓ | `apps/api/test/contracts.test.ts:423`, `:430` (29/02 em 01/03 `false`); `apps/api/test/students-guardian.test.ts:51` `201` e `:55-56` `422` com `['guardian']` às 23:30 de SP | PASS |
| C17 | `201` com responsável em dígitos e duas linhas | api ✓ | `apps/api/test/students-guardian.test.ts:72-75` dígitos sim, máscara não; `:76-78` uma `created`, uma `guardian_saved`, duas ao todo | PASS |
| C18 | menor sem responsável `422` | api ✓ | `apps/api/test/students-guardian.test.ts:90-93` | PASS |
| C19 | campos do responsável nas duas bordas | api ✓ | `apps/api/test/students-guardian.test.ts:120` `guardian.${field}`; `:137` `201` nos aceitos | PASS |
| C20 | CPF do responsável igual ao do aluno | api ✓ | `apps/api/test/students-guardian.test.ts:153`, `:162`, `:169` `guardian.cpf`; `:179` `201` | PASS |
| C21 | adulto com responsável | api ✓ | `apps/api/test/students-guardian.test.ts:189-190` | PASS |
| C22 | `PATCH` de `birthDate` de menor | api ✓ | `apps/api/test/students-guardian.test.ts:199-200`, `:204-205`, `:210`, `:216-218`, `:223` | PASS |
| C23 | responsável novo insere outra linha | api ✓ | `apps/api/test/students-guardian.test.ts:240-242` duas linhas, anterior idêntica, `['student.guardian_saved']`; `:248` | PASS |
| C24 | mesmo responsável não grava | api ✓ | `apps/api/test/students-guardian.test.ts:261-262` | PASS |
| C25 | menor legado sem `birthDate` | api ✓ | `apps/api/test/students-guardian.test.ts:270-271` | PASS |
| C26 | `guardian` nulo ou incompleto | api ✓ | `apps/api/test/students-guardian.test.ts:294` caminho; `:296-297` | PASS |
| C27 | escritas recusadas não tocam `guardians` | api ✓ | `apps/api/test/students-guardian.test.ts:307-317` status; `:319` `toEqual(before)` | PASS |
| C28 | termos `200` por perfil | api ✓ | `apps/api/test/consent-terms.test.ts:23`, `:26-28` | PASS |
| C29 | maior versão numérica | api ✓ | `apps/api/test/consent-terms.test.ts:47-49` versão 10 e texto dela | PASS |
| C30 | `UPDATE` de `purpose`, `version`, `text`, `created_at` e com o mesmo valor, `DELETE` e `TRUNCATE ... CASCADE` falham com `consent_terms is append-only`; `TRUNCATE` simples falha por FK com `0A000`, antes do gatilho; linhas idênticas (texto de 4022b5f) | db, `consent_terms_update_delete_truncate_refused` ✓ (verified at 4022b5f) | `packages/database/test/consent.test.ts:405-409` as cinco instruções `UPDATE` (`purpose`, `version`, `text`, `created_at`, `set text = text`), `:410` `delete from consent_terms`, `:413` `truncate consent_terms cascade`, todas sob `:417` `expect(error.message, label).toContain('consent_terms is append-only')`; `:419-420` `expect(plainTruncate.code, 'TRUNCATE simples').toBe('0A000')`; `:422-424` `toEqual(before)` contra `:401-402` (`to_jsonb` de todas as linhas, `toHaveLength(2)`); `failureOf` (`:45-52`) lança se a instrução não falhar | PASS |
| C31 | inserts recusados em `consent_terms` | db ✓ | `packages/database/test/consent.test.ts:439` `23514` ou `23505` por caso; `:441`, `:445` | PASS |
| C32 | semente de duas versões 1 | db ✓ | `packages/database/test/consent.test.ts:455`, `:459` | PASS |
| C33 | concessão por aluno adulto, relógio do banco | api ✓ | `apps/api/test/consents-write.test.ts:56-61`; `:71` com `Date` de 2000 | PASS |
| C34 | concessão pelo responsável atual | api ✓ | `apps/api/test/consents-write.test.ts:81-83`; `:88-89`; `:97-98` | PASS |
| C35 | menor por `student` `422` | api ✓ | `apps/api/test/consents-write.test.ts:111-112`; `:114` | PASS |
| C36 | `guardian` sem responsável `422` | api ✓ | `apps/api/test/consents-write.test.ts:127-128`; `:130` | PASS |
| C37 | sete campos inválidos | api ✓ | `apps/api/test/consents-write.test.ts:151` `toEqual([path])`; `:153` | PASS |
| C38 | termo inexistente | api ✓ | `apps/api/test/consents-write.test.ts:164`; `:166` | PASS |
| C39 | versão antiga `409` | api ✓ | `apps/api/test/consents-write.test.ts:179-181`; `:184-185` | PASS |
| C40 | ativo de qualquer versão `409` | api ✓ | `apps/api/test/consents-write.test.ts:200-201`, `:205-207`, `:210` | PASS |
| C41 | dez rodadas de corrida | api ✓ | `apps/api/test/consents-write.test.ts:224` `[201, 409]`; `:226`; `:231-232` (mutante 3 mostra que a corrida chega ao índice) | PASS |
| C42 | revogar mantém a linha | api ✓ | `apps/api/test/consents-write.test.ts:248-256` | PASS |
| C43 | revogar de novo não muda nada | api ✓ | `apps/api/test/consents-write.test.ts:269-271` | PASS |
| C44 | conceder depois de revogar | api ✓ | `apps/api/test/consents-write.test.ts:283-288` | PASS |
| C45 | nove `404` | api ✓ | `apps/api/test/consents-write.test.ts:307` nove; `:312-313`; `:316` | PASS |
| C46 | aluno inativo e suspenso | api ✓ | `apps/api/test/consents-write.test.ts:326` | PASS |
| C47 | oito `403` | api ✓ | `apps/api/test/consents-write.test.ts:349-350`; `:353-355` | PASS |
| C48 | quatro `401` | api ✓ | `apps/api/test/consents-write.test.ts:370-371` | PASS |
| C49 | ficha com responsável atual e ordem | api ✓ | `apps/api/test/consents-read.test.ts:70-75` (quinto telefone, ordem `[newest, middle, oldest]`); `:77-81` | PASS |
| C50 | responsável de quando foi concedido | api ✓ | `apps/api/test/consents-read.test.ts:100-103` | PASS |
| C51 | ficha vazia | api ✓ | `apps/api/test/consents-read.test.ts:112` `toEqual({ guardian: null, items: [] })` | PASS |
| C52 | leitura não grava | api ✓ | `apps/api/test/consents-read.test.ts:126-127` | PASS |
| C53 | uma linha por ato | api ✓ | `apps/api/test/consents-audit.test.ts:41-46` (ação, `user_id`, `entity`, `entity_id`), chamada em `:57`, `:66`, `:70`, `:74`, `:83` | PASS |
| C54 | `diff` na criação | api ✓ | `apps/api/test/consents-audit.test.ts:96` | PASS |
| C55 | `diff` da troca do telefone | api ✓ | `apps/api/test/consents-audit.test.ts:106-107` | PASS |
| C56 | `diff` da concessão | api ✓ | `apps/api/test/consents-audit.test.ts:117-132` | PASS |
| C57 | `diff` da revogação | api ✓ | `apps/api/test/consents-audit.test.ts:144-159` | PASS |
| C58 | onze recusas sem linha | api ✓ | `apps/api/test/consents-audit.test.ts:201` onze; `:208-210` | PASS |
| C59 | falha da trilha desfaz as quatro rotas | api ✓ | `apps/api/test/consents-audit.test.ts:246-248` `500`, `internal_error`, snapshot igual; `:252` ainda ativo | PASS |
| C60 | sete valores fora de `audit_logs` | api ✓ | `apps/api/test/consents-audit.test.ts:294` sete; `:297` cada forma de cada valor | PASS |
| C61 | `ip` e `user_agent` nas três ações | api ✓ | `apps/api/test/consents-audit.test.ts:342-347` | PASS |
| C62 | sete valores fora do log | api ✓ | `apps/api/test/consents-audit.test.ts:361`, `:364`, `:366`, `:368` | PASS |
| C63 | bloco só para menor, SP contra UTC | web ✓ | `apps/web/e2e/students.spec.ts:636` (2008-10-05 exibe), `:646` (2008-10-04 não), `:663` sem escrita | PASS |
| C64 | `guardian` no mesmo pedido e preenchido | web ✓ | `apps/web/e2e/students.spec.ts:703` `relationship: value`; `:726`; `:739`, `:749` sem chave `guardian` | PASS |
| C65 | `422` de cada campo | web ✓ | `apps/web/e2e/students.spec.ts:786`, `:788`, `:790` | PASS |
| C66 | bloco com responsável ou nenhum | web ✓ | `apps/web/e2e/consents.spec.ts:99-102`; `:107` | PASS |
| C67 | pendência só para menor | web ✓ | `apps/web/e2e/consents.spec.ts:117`, `:123`, `:129` | PASS |
| C68 | três estados por finalidade | web ✓ | `apps/web/e2e/consents.spec.ts:149` (04/10, não 05/10); `:159-160` | PASS |
| C69 | botões por estado | web ✓ | `apps/web/e2e/consents.spec.ts:178-179` | PASS |
| C70 | diálogo com o termo em texto puro, nada antes de Confirmar | web ✓ | `apps/web/e2e/consents.spec.ts:193`, `:195` quebras de linha, `:196` `locator('b')).toHaveCount(0)`, `:200`, `:204`, `:221` | PASS |
| C71 | menor só o responsável | web ✓ | `apps/web/e2e/consents.spec.ts:234-238`; `:248-253` | PASS |
| C72 | diálogo de revogar | web ✓ | `apps/web/e2e/consents.spec.ts:265-267`, `:271`, `:277-278` | PASS |
| C73 | estado novo depois do ato | web ✓ | `apps/web/e2e/consents.spec.ts:289`, `:294` | PASS |
| C74 | mensagens de `409` e recarga do termo | web ✓ | `apps/web/e2e/consents.spec.ts:315-316`, `:322-326`, `:331` | PASS |
| C75 | falha de carga e Tentar novamente | web ✓ | `apps/web/e2e/consents.spec.ts:341-346`; `:351-352` | PASS |
| C76 | sem bloco nem chamadas para dois perfis | web ✓ | `apps/web/e2e/consents.spec.ts:364-365` | PASS |
| C77 | rótulos e filtro de 16 | web ✓ | `apps/web/e2e/audit.spec.ts:445`; `:452-453` | PASS |
| C78 | detalhes da concessão | web ✓ | `apps/web/e2e/audit.spec.ts:477-479` | PASS |
| C79 | Telefone alterado | web ✓ | `apps/web/e2e/audit.spec.ts:494` | PASS |
| C80 | OpenAPI das rotas e do `guardian` | api ✓ | `apps/api/test/openapi.test.ts:151-156`; `:168` | PASS |
| C81 | corpos reais contra os schemas | api ✓ | `apps/api/test/contracts.test.ts:479` | PASS |
| C82 | os dois `409` como problem | api ✓ | `apps/api/test/contracts.test.ts:503-505` | PASS |
| C83 | 2FA nas quatro rotas | api ✓ | `apps/api/test/enrollment.test.ts:46-47`; `:50` lista com as quatro rotas | PASS |
| C84 | stack real | stack ✓ | `tests/stack/compose.test.ts:264`, `:266`, `:268`, `:273-276` | PASS |
| C85 | versão 1 começa por RASCUNHO | db ✓ | `packages/database/test/consent.test.ts:467` | PASS |
| C86 | corrida com o mesmo responsável | api ✓ | `apps/api/test/students-guardian.test.ts:336-338` | PASS |
| C87 | corrida com responsáveis diferentes | api ✓ | `apps/api/test/students-guardian.test.ts:356-357`, `:364` | PASS |
| C88 | `isMinor` definida uma vez | repo ✓ | `tests/repo/repo.test.ts:177-178` | PASS |

C30 parte por parte contra o texto novo (verified at 4022b5f):

- quatro colunas e mesmo valor: `:405` `purpose`, `:406` `version`, `:407` `text`, `:408` `created_at`, `:409`
  `set text = text`, cada um com a mensagem em `:417` (o `label` identifica qual falhou; o mutante A morreu
  em `UPDATE purpose` com a mensagem da PK, não a do gatilho);
- `DELETE`: `:410`, mensagem em `:417`;
- `TRUNCATE ... CASCADE`: `:413`, mensagem em `:417` (mutante 1 da rodada 1 mostra que, sem o gatilho, a
  instrução passa);
- `TRUNCATE` simples com `0A000`: `:420` afirma o código pelo `toBe('0A000')`, não só "rejeita"; o mutante B
  desta rodada (sem a FK) fez o simples chegar ao gatilho e a asserção pegou `P0001`, então o `0A000`
  distingue "antes do gatilho" de "pelo gatilho";
- linhas idênticas: `:422-424` `toEqual(before)` sobre `to_jsonb` de todas as linhas, depois das oito
  instruções, rodadas em autocommit (sem rollback do teste), então qualquer instrução que mudasse algo
  deixaria a diferença.

Notas de precisão (não reprovam):

- C30, "por chave estrangeira": `:420` amarra o SQLSTATE `0A000`, que é o que o texto da C30 nomeia, mas não
  a mensagem do Postgres (`cannot truncate a table referenced in a foreign key constraint`); `0A000`
  (`feature_not_supported`) não é exclusivo de FK. O mutante B mostra que, sem a FK, o código muda, o que
  basta para o que o check afirma.
- C30, "em todos os casos": uma única comparação de linhas no fim cobre as oito instruções em conjunto, não
  uma por instrução; como todas falham e nada é desfeito pelo teste, uma mudança de qualquer uma persistiria
  até `:422`.
- Carried from 7c5525c: C23 segunda metade (provada em `apps/api/test/consents-audit.test.ts:342`); C70
  "faz a página chamar `GET /api/consent-terms`" (`consents.spec.ts:194`, com C76 separando a carga da ficha);
  C31 aceita `23514` ou `23505` por caso; C41, C86, C87 dependem de `releasedTogether`
  (`apps/api/test/support/students.ts:93`), e o mutante 3 mostra que a corrida da C41 chega ao índice.

## Desvios do Handoff

1. **C30, `TRUNCATE`** (verified at 4022b5f). Resolvido pela decisão do usuário registrada em `4022b5f`: a
   AC 15 (`plan.md:124`) e a C30 (`checks.md:143`) agora dizem que o `TRUNCATE` simples é recusado pela FK
   de `consents` (`0004_consent.sql:37`) com `0A000` e o `CASCADE` pelo gatilho (`0004_consent.sql:50`) com a
   mensagem. O teste, inalterado desde a rodada 1, prova exatamente esse texto.
2. **`birth_date_bounds_in_sao_paulo`** (carried from 7c5525c). Só ganhou `guardian` nos dois casos aceitos;
   asserções iguais, nada afrouxado.
3. **Testes existentes editados** (carried from 7c5525c). Só contagens 13 -> 16, a lista 11 -> 12 do
   OpenAPI, `slice(11, 14)` coberto pela igualdade da lista inteira; nenhum `skip`, `only`, `fixme` ou `todo`.
   `7c5525c..4022b5f` não toca teste algum.

## Coverage

Linhas de `consent_terms` verified at 4022b5f; as demais carried from 7c5525c (a correção só tocou
`.specs/`, nenhuma autoridade dessas linhas mudou).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| operações recusadas em `consent_terms` (4) | AC 15 de 4022b5f, door 2; gatilhos `0004_consent.sql:49-50` e FK `:37` | `UPDATE` C30 `consent.test.ts:405-409`/`:417` · `DELETE` C30 `:410`/`:417` · `TRUNCATE ... CASCADE` C30 `:413`/`:417` · `TRUNCATE` simples C30 `:419-420` (`0A000`) | - |
| colunas de `consent_terms` sob `UPDATE` (4 + mesmo valor) | `CREATE TABLE "consent_terms"` em `0004_consent.sql` (4 colunas: `purpose`, `version`, `text`, `created_at`) | `purpose` `:405` · `version` `:406` · `text` `:407` · `created_at` `:408` · mesmo valor `:409`, todos sob `:417` | - |
| `GET /api/consent-terms` statuses (3) | plan `Surface` | 200 C28 · 401 C48 · 403 C47 | - |
| `GET /api/students/:id/consents` statuses (4) | plan `Surface` | 200 C49 · 401 C48 · 403 C47 · 404 C45 | - |
| `POST /api/students/:id/consents` statuses (6) | plan `Surface` | 201 C33 · 401 C48 · 403 C47 · 404 C45 · 409 C39, C40 · 422 C37 | - |
| `DELETE /api/students/:id/consents/:consentId` statuses (4) | plan `Surface` | 204 C42 · 401 C48 · 403 C47 · 404 C45 | - |
| `POST`/`PATCH /api/students` status novos (4) | plan `Surface` | 422 por menor C18, C22 · 201/200 com `guardian` C17, C23 | - |
| perfis por rota nova (16 pares) | plan Assumptions, AC 32 | `admin`/`reception` C28, C49, C33, C42 · `hr_finance`/`instructor` C47 (8 pares) | - |
| `500` com falha da trilha (4 rotas) | AC 44 | C59, as quatro em `consents-audit.test.ts:228-239` | - |
| constraints da `Landing` (doors 1 a 3) | plan `Landing` | NOT NULL C2, C6, C7 · CHECK relationship C3 · CHECK purpose/version C31 · CHECK granted_by C9 · CHECK sse C10 · FKs C5, C8, C12 · índice parcial C11 · sem UNIQUE C4 · defaults uuid v7 e `now()` C2, C7 | - |
| `relationship` (4) | door 1 | API C19 (`:130`), banco C3, tela C64, ficha C66 | - |
| `purpose` (2) | door 2 | C28, C56, C68 | - |
| `grantedBy` (2) | door 3 | C33, C34, C56 | - |
| `AUDIT_ACTIONS` (16) | door 4 | C13, `contracts.test.ts:360` e `:221-233` | - |
| `diff` por ação nova (3) | door 4 | C54, C55 · C56 · C57 | - |
| bordas de `isMinor` (5) | AC 1, Assumptions | hoje, amanhã, ontem `contracts.test.ts:422-424` · 29/02 `:429-430` · SP contra UTC `students-guardian.test.ts:46-56` | - |
| lugares que decidem menor (3) | Flow, AC 48, AC 52 | API C16 · formulário C63 · ficha C67 | - |
| campos do `guardian` (4) x recusas (AC 4) | AC 4 | `name` ausente, espaços, 121 · `cpf` 10, 12, repetido, DV · `phone` 9, 12 · `relationship` três | - |
| tabela de quem concede (5) | AC 18 a 21, Assumptions | C33, C34 (menor e adulto), C35, C36 | - |
| termo na concessão (3) | AC 23, 24 | inexistente C38 · antigo C39 · vigente C33 | - |
| ids inválidos (9) | AC 30 | C45, nove casos em `consents-write.test.ts:296-306` | - |
| recusas sem linha de trilha (11 + `403`/`401`) | AC 43 | C58, onze casos; C47 | - |
| valores fora da trilha e do log (7 + 7) | AC 45, AC 47 | C60, C62, cada valor com as duas versões do responsável e o termo inteiro, em JSON e a primeira linha | - |
| estados da ficha e botões (3 x 2) | AC 53, 54 | C68 por finalidade · C69 | - |
| quem concede no diálogo (3) | AC 55, 56 | C70 · C71 | - |
| mensagens de `409` (2) | AC 59 | C74 | - |
| rótulos novos em `/audit` (3 + 3 detalhes) | AC 62 a 64 | C77 · C78 · C79 | - |
| montagem do módulo (3 assemblies) | `app.module.ts:42-43`, `:70-71` | harness `startApi` C33 · stack real C84 · banco migrado C1 | - |

Nenhum membro sem prova.

## Test policy rows

Carried from 7c5525c: as duas linhas estavam atendidas e a correção não toca arquivo que elas classificam
(`0004_consent.sql`, `consents.service.ts`, `students.service.ts`, `packages/contracts/src/students.ts`
inalterados em `7c5525c..4022b5f`); as provas que elas exigem rodaram verdes em 4022b5f.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide pelo índice ou FK, alcançado por HTTP | `0004_consent.sql`, `consents.service.ts`, `students.service.ts` | banco C11 (`consent.test.ts:359-379`) · HTTP C41 e, para o responsável atual, C49 e C87 | yes - o mutante 3 confirma que a corrida da C41 chega ao índice |
| Decide, o mesmo código na API e no navegador (`isMinor`) | `packages/contracts/src/students.ts` | próprio nível C16 (`contracts.test.ts:420-432`) · rota C16 (`students-guardian.test.ts:44-58`) · tela C63 (`students.spec.ts:622-668`) | yes - o mutante 2 (dia em UTC) mata a prova da rota |

## Swept existing

Verified at 4022b5f (re-rodados): `guard_matrix_three_declarations_five_callers`
(`apps/api/test/access.test.ts:49`), `admin_without_2fa_gets_403_everywhere_else`,
`unhandled_500_hides_exception` (`apps/api/test/problem.test.ts:31`), `paths_equal_registered_api_routes`,
`hostile_input_never_answers_5xx`, `every_route_with_body_answers_422`,
`only_three_routes_answer_without_session` e `six_identity_tables_and_no_tenant_id`
(`packages/database/test/schema.test.ts:43`) passaram. A guarda global continua em
`apps/api/src/app.module.ts:86` (carried from 7c5525c; arquivo inalterado).

## Faults injected

Rodada 2 (verified at 4022b5f): worktree descartável `git worktree add --detach` de `4022b5f` fora da árvore
real (`C:\Users\Admin\AppData\Local\Temp\wtc30`), um mutante por vez, restaurado com `git checkout -- .`,
worktree removido no fim. Porcelain da árvore real antes e depois: `?? .specs/features/consentimento/verification.md`
e `?? CLAUDE.md`, igual. Linhas 1 a 5 carried from 7c5525c.

| Mutation | Location | Killed |
| --- | --- | --- |
| apagar o gatilho `consent_terms_no_truncate` (carried from 7c5525c) | `packages/database/migrations/0004_consent.sql:50` | yes - C30: "a instrução não falhou: truncate consent_terms cascade" |
| `saoPauloToday` com `timeZone: 'UTC'` (carried from 7c5525c) | `packages/contracts/src/students.ts:53` | yes - C16 rota: "faz 18 anos amanhã: expected 201 to be 422" |
| tirar o `for('update')` da concessão e o mapa de `23505` para `consent_active` (carried from 7c5525c) | `apps/api/src/consents/consents.service.ts:66`, `:133` | yes - C41: "rodada 1: expected [201, 500] to deeply equal [201, 409]" |
| `UPDATE` da revogação fora da transação (carried from 7c5525c) | `apps/api/src/consents/consents.service.ts:198` | yes - C59: "DELETE de consentimento: expected {...} to deeply equal {...}" |
| texto do termo como HTML (carried from 7c5525c) | `apps/web/src/app/students/[id]/consents-block.tsx:200` | yes - C70: `toContainText('Linha dois com <b>negrito</b> dentro.')` falhou |
| A: apagar o gatilho `consent_terms_no_change` (`BEFORE UPDATE OR DELETE`) (rodada 2) | `packages/database/migrations/0004_consent.sql:49` | yes - C30 `:417`: "UPDATE purpose: expected 'duplicate key value violates unique c…' to contain 'consent_terms is append-only'" |
| B: apagar a FK `consents_purpose_term_version_consent_terms_purpose_version_fk` (rodada 2) | `packages/database/migrations/0004_consent.sql:37` | yes - C30 `:420`: "TRUNCATE simples: expected 'P0001' to be '0A000'" |

Uma primeira tentativa de worktree dentro do scratchpad não chegou a rodar o teste (caminho longo demais
para o `pnpm` no Windows ao migrar); foi descartada e refeita em caminho curto. Não conta como mutante.

## Gate

Comandos rodados por mim no `HEAD` `4022b5f`:

- `pnpm --filter "./packages/database" exec vitest run test/consent.test.ts --reporter=verbose` - 16 passed, 0 failed
- `pnpm --filter "./apps/api" exec vitest run test/contracts.test.ts test/students-guardian.test.ts test/consent-terms.test.ts test/consents-write.test.ts test/consents-read.test.ts test/consents-audit.test.ts test/openapi.test.ts test/enrollment.test.ts test/students-create.test.ts test/audit-auth.test.ts --reporter=verbose` - 10 files, 97 passed, 0 failed
- `pnpm --filter "./apps/web" exec playwright test e2e/consents.spec.ts e2e/students.spec.ts e2e/audit.spec.ts --reporter=list` - 59 passed, 0 failed
- `pnpm --filter "./tests/repo" exec vitest run repo.test.ts --reporter=verbose` - 8 passed, 0 failed
- `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "minor_with_guardian_and_consent_through_web_store_rows_and_audit" --reporter=verbose` - 1 passed, 9 skipped, 0 failed
- Swept existing: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts test/hostile-input.test.ts test/problem.test.ts test/validation.test.ts` - 12 passed; `pnpm --filter "./packages/database" exec vitest run test/schema.test.ts -t six_identity_tables_and_no_tenant_id` - 1 passed, 3 skipped

Os 89 nomes de prova do `checks.md` (88 checks) foram buscados um a um nas saídas e cada um aparece como
passado; nenhum filtro casou com zero testes.
