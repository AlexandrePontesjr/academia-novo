# Cadastro de alunos verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: da2c543..HEAD (HEAD = 417bf8b; feature base 9c8128d)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Os 94 checks passam em `417bf8b` com evidência localizada (95 provas nomeadas: a C11 tem duas), os 4
mutantes novos morreram nas superfícies que o diff tocou e os 5 da rodada 1 seguem valendo (o diff
não os tocou). Os gaps bloqueantes da rodada 1 (1, 2, 4 e 5) estão fechados por correção mais check
novo cujo mutante morre; o gap 3 está fechado por decisão do usuário registrada (AD-035 e bullet do
`checks.md`); o gap 6 está fechado; o gap 8 está fechado. Ficam notas de precisão que não bloqueiam
(gap 7, mantido, e três notas novas), listadas abaixo.

## Gaps da rodada 1, re-julgados em 417bf8b

verified at 417bf8b

| Gap | Rodada 1 | Em HEAD | Estado |
| --- | --- | --- | --- |
| 1 | `PATCH` cifrava com o `:id` da URL como AAD | `apps/api/src/students/students.service.ts:173` - `this.cipher.encrypt(change.healthNotes, row.id)`; C92 (`apps/api/test/students-update.test.ts:248` manda o `id` em maiúsculas; `:250` `toBe(200)`; `:251` `healthNotes).toBe('Texto novo')` no `GET` em minúsculas). Mutante (a) volta ao `id` da URL e a C92 falha com `expected undefined to be 'Texto novo'` | fechado |
| 2 | `PATCH {"healthNotes": null}` sobre ilegível respondia `null` sem limpar | `students.service.ts:57` - sentinela `UNREADABLE = '\0unreadable'` (U+0000, que `packages/contracts/src/students.ts:15,74` recusa em `healthNotes`), devolvida em `:298` quando a linha é substituída; `diffOf` passa a ver mudança e o `update` de `:160-179` grava `null`. C93 (`students-update.test.ts:256` grava `v1.lixo.lixo.lixo`; `:260` `toBe(200)`; `:261` `healthNotes).toBeNull()` no `GET`). Mutante (b) volta a `return null` e a C93 falha com `expected undefined to be null` (o `GET` responde `500`) | fechado |
| 3 | dobra de acento só das 46 letras de `students_fold` | inalterado no código (`packages/database/migrations/0003_students.sql:3-7`). Decisão do usuário "só português": `.specs/STATE.md` AD-035 (ativa) e `.specs/features/alunos/checks.md:472` (bullet que exclui `ø`, `ř`, `ş`, `å`, `ý` e diz que nenhum check as afirma). A fonte vinculante (PRD) não decide acento (`rg -n -i acento "PRD — Sistema de Gestão de Academia.md"` sem resultado), então não há contradição; C31 e C33 não afirmam mais do que exercitam (`checks.md:141,147`). O conjunto passa a ter como autoridade AC 23/25 restritas pela AD-035 | fechado por decisão registrada; nota: `plan.md:172,174` ainda leem "sem diferenciar acentos" sem citar a AD-035 |
| 4 | Test policy "Tela": corpo do `PATCH` do formulário de edição nunca afirmado | C94 - `apps/web/e2e/students.spec.ts:583-600` - `api.writes()...toEqual([{ method: 'PATCH', path: ..., body: { name: 'Nome Corrigido', ..., email: null, address: null, ... } }])`; `:582` `toHaveURL`. Mutante (c) deixa de mandar `null` nos opcionais esvaziados e a C94 falha (`- "address": null`, `- "email": null`) | fechado |
| 5 | Test policy "Decide, alcançado por HTTP": três linhas sem caso | AAD na edição C92, `null` sobre ilegível C93, letras fora da dobra excluídas pela AD-035 | fechado |
| 6 | C57 não afirmava o status de cada caso | `apps/api/test/students-audit.test.ts:177` - `expect(response.status, name).toBe(expected)` sobre `:162-169` (`401`, `403`, `404`, `409`, `422`, `204`); `:178` contagem igual. Mutante (d) faz o `DELETE` de inativo responder `404` e a C57 falha com `DELETE de inativo: expected 404 to be 204` (a asserção antiga, `toContain`, aceitaria) | fechado |
| 7 | C87 diz que o schema de erro "conhece `cpf_taken`" | inalterado: `packages/contracts/src/problem.ts:11` - `code: z.string().regex(/^[a-z]+(_[a-z]+)*$/)`; `rg -n cpf_taken packages` sem resultado. Ver "Notas de precisão" | mantido como precisão, não bloqueia |
| 8 | `checks.md` com 4 doors | `checks.md:8` (Intent: 5 doors, a 5 é a AD-034) e `checks.md:364` (`one-way doors (5)` com door 5 C23, C92) | fechado |

## Notas de precisão (não bloqueiam)

1. **C87, metade "o schema conhece `cpf_taken`"** - `packages/contracts/src/problem.ts:11` aceita qualquer `code` em snake_case; não há lista de códigos em `packages/contracts`. A leitura que se prova é "o schema aceita o corpo `cpf_taken`/`409`": `apps/api/test/contracts.test.ts:320-324` (`toBe(409)`, `code).toBe('cpf_taken')`, `status).toBe(409)`, `problem+json`, `problemSchema.safeParse(body).success).toBe(true)`). Peso pela regra do verify.md: é lacuna de precisão do texto do check, não membro sem prova nem mutante sobrevivente - uma API que respondesse outro código falharia em `:321`. Mesmo padrão de `email_taken` nas features anteriores. Sugestão: reescrever a C87 como "o corpo real do `409` tem `code` `cpf_taken` e valida contra o schema de erro".
2. **C93, "com `200`" do `GET`** - `fetchStudent` (`apps/api/test/students-update.test.ts:39`) não afirma o status do `GET`; o `200` é provado só por consequência: `:261` `toBeNull()` recusa `undefined`, e o corpo de erro do `ProblemFilter` não tem a chave `healthNotes`. Nenhum caminho do código responde não-`200` com `healthNotes: null`.
3. **C94 cita AC 70**, que fala de `/students/new`; a navegação para a ficha depois de salvar a edição não tem AC no plano. A asserção `:582` existe; a citação é que está imprecisa.
4. **`students.service.ts:57` contém um byte U+0000 literal** - o git passa a tratar o arquivo como binário (`git diff --stat da2c543..HEAD` mostra `Bin 11799 -> 12082 bytes`), e revisões futuras desse arquivo só aparecem com `git diff --text`. Não afeta comportamento; `'\u0000unreadable'` teria o mesmo valor sem o byte cru.

## Binding sources

carried from da2c543 - o diff não tocou a interface (rotas, schemas, telas); o step 1 é do profile `ui` e foi feito na rodada 1 por completude. Re-aberto só o PRD para o gap 3: nenhuma menção a acento.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `PRD — Sistema de Gestão de Academia.md` §2, §3.2 (RF-05, RF-07, RF-08), §3.8 (RF-31), §4, §6 `students`, §7, §8 telas 3 e 4 | yes - rodada 1 (detalhe em `da2c543:.specs/features/alunos/verification.md`); rodada 2: `rg -n -i acento` no PRD sem resultado, então a AD-035 não contradiz RF-07 | none | - |

## Checks

verified at 417bf8b - todas as provas re-rodadas em HEAD, em lote por alvo (comandos em Gate). Cada nome
existe (`rg -n "^test\('"` por arquivo; os quatro tocados: `apps/api/test/students-update.test.ts:245`
`patch_with_uppercase_id_keeps_health_notes_readable`, `:254` `patch_null_clears_an_unreadable_health_notes_value`,
`apps/api/test/students-audit.test.ts:156` `rejected_students_requests_write_no_row`,
`apps/web/e2e/students.spec.ts:569` `edit_form_sends_patch_with_typed_values_and_null_for_cleared`) e aparece
individualmente como executado e verde na saída (`✓ ... > <nome>` no vitest, `ok N ... › <nome> (` no
Playwright), conferido nome a nome por script contra as 95 linhas `Proof:` do `checks.md`, 0 ausentes. Os
arquivos tocados só ganharam testes no fim ou trocaram linhas 1:1 (`students-audit.test.ts:162-177`), então
as linhas citadas na rodada 1 seguem iguais; conferidas por amostra (`students-update.test.ts:55-57,82,237-238`,
`students-audit.test.ts:97-100,144-146,177-178`, `students.spec.ts:359,524,558,565`).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `students` sem `deleted_at`, `guardian_id`, `tenant_id`, sem FK | database lote exit 0 | `packages/database/test/students.test.ts:67` - `expect(columns, absent).not.toContain(absent)`; `:73` - `expect(foreignKeys).toEqual([])` | PASS |
| C2 | id uuidv7 e `status` `active` por padrão | database lote exit 0 | `packages/database/test/students.test.ts:84` - `expect(row!.version).toBe(7)`; `:85` - `expect(row!.status).toBe('active')` | PASS |
| C3 | `CHECK` aceita 3, recusa `archived`/`Active`/`''`, linha intacta | database lote exit 0 | `packages/database/test/students.test.ts:92` - `expect(row!.status).toBe(status)`; `:99-100` - `rejects.toMatchObject({ code: CHECK_VIOLATION })`; `:109` - `expect(await read(id)).toEqual(before)` | PASS |
| C4 | `UNIQUE` do CPF em toda situação | database lote exit 0 | `packages/database/test/students.test.ts:117` - `rejects.toMatchObject({ code: UNIQUE_VIOLATION })`; `:119` - `expect(await count(), status).toBe(total)` | PASS |
| C5 | formato `v1`, IV 12, tag 16, base64url, ida e volta, IV novo | api lote exit 0 | `apps/api/test/crypto.test.ts:22-26` - `toHaveLength(4)`, `toBe('v1')`, `decodedLength(parts[1]!)).toBe(12)`, `decodedLength(parts[3]!)).toBe(16)`; `:28` - `expect(cipher.decrypt(stored, ROW)).toBe(text)`; `:32` - `expect(again[0]).not.toBe(again[1])` | PASS |
| C6 | decifra recusa texto/tag alterados, outra chave, `v2.` e sem prefixo | api lote exit 0 | `apps/api/test/crypto.test.ts:52` - `expect(() => cipher.decrypt(value, ROW), name).toThrow()` sobre os 5 casos de `:43-47` | PASS |
| C7 | `AUDIT_ACTIONS` com 13, três novas no fim, em ordem | api lote exit 0 | `apps/api/test/contracts.test.ts:216` - `expect(AUDIT_ACTIONS).toHaveLength(13)`; `:217` - `toEqual([...before, 'student.created', 'student.updated', 'student.inactivated'])` | PASS |
| C8 | schema do aluno aceita 3 formas, recusa sem `id`/`name`/`status` | api lote exit 0 | `apps/api/test/contracts.test.ts:238` - `expect(studentSchema.safeParse(body).success, name).toBe(true)`; `:242` - `...safeParse(without).success, missing).toBe(false)` | PASS |
| C9 | `POST` 201 por admin e reception, 12 chaves, opcionais `null` | api lote exit 0 | `apps/api/test/students-create.test.ts:55` - `expect(response.status, role).toBe(201)`; `:56` - `Object.keys(created).sort(), role).toEqual([...ALL_KEYS].sort())`; `:57-69` - `toMatchObject({ ..., status: 'active', sex: null, ..., healthNotes: null })` | PASS |
| C10 | CPF e telefones guardados e devolvidos só em dígitos | api lote exit 0 | `apps/api/test/students-create.test.ts:87` - `toMatchObject({ cpf: '52998224725', phone: '11912345678', emergencyContactPhone: '1112345678' })`; `:89-90` - `expect(stored).toContain(digits)` / `not.toContain(masked)` | PASS |
| C11 | 15 CPFs recusados no `path` `cpf`; 3 aceitos | api lote exit 0 (rota e tabela) | `apps/api/test/students-create.test.ts:112-113` - `toBe(422)`, `filter((path) => path === 'cpf')...toHaveLength(1)`; `:123` - `toBe(201)`; `apps/api/test/contracts.test.ts:265` - `toEqual(['cpf'])`; `:270` - `expect(result.data?.cpf, sent).toBe(stored)` | PASS |
| C12 | CPF de active/suspended/inactive e mascarado -> 409 `cpf_taken`, contagem igual | api lote exit 0 | `apps/api/test/students-create.test.ts:144-146` - `toBe(409)`, `code...toBe('cpf_taken')`, `studentCount...toBe(total)` | PASS |
| C13 | 10 pares concorrentes: um 201, um 409, +1 por rodada | api lote exit 0 | `apps/api/test/students-create.test.ts:161` - `expect(statuses, ...).toEqual([201, 409])`; `:164` - `toBe(total + 1)` | PASS |
| C14 | `birthDate` 6 recusas, 2 aceites, 23:30 SP com relógio controlado | api lote exit 0 | `apps/api/test/students-create.test.ts:170` - `vi.useFakeTimers({ ..., now: new Date('2026-10-05T02:30:00Z') })`; `:181-182` - `toBe(422)`, `path === 'birthDate'...toHaveLength(1)`; `:188` - `toBe(201)` | PASS |
| C15 | telefone 9/12 recusados, 10/11 aceitos, nos dois campos | api lote exit 0 | `apps/api/test/students-create.test.ts:208-209` - `toBe(422)`, `toContain(field)`; `:211` - `toBe(201)` | PASS |
| C16 | limites de tamanho nas duas bordas, `sex` | api lote exit 0 | `apps/api/test/students-create.test.ts:251-253` - `toBe(422)`, `toContain(field)`, contagem igual; `:260-261` - `toBe(201)`, `[field]...toBe(value)` | PASS |
| C17 | par de contato: falta nomeada | api lote exit 0 | `apps/api/test/students-create.test.ts:276` - `toBe(status)`; `:277` - `expect(await fieldErrorPaths(response), label).toEqual([missing])` | PASS |
| C18 | hr_finance e instructor: 403 `forbidden` nas 3 escritas, nada muda | api lote exit 0 | `apps/api/test/students-create.test.ts:298-301` - `toBe(403)`, `toBe('forbidden')`, contagem e `studentRowText` iguais | PASS |
| C19 | 5 rotas sem cookie: 401 `unauthorized` | api lote exit 0 | `apps/api/test/students-create.test.ts:320-321` - `toBe(401)`, `toBe('unauthorized')` | PASS |
| C20 | criação e edição guardam `v1.` sem o texto | api lote exit 0 | `apps/api/test/students-health.test.ts:36-37` - `not.toContain('losartana')`, `startsWith('v1.')).toBe(true)`; `:44-45` idem para o `PATCH` | PASS |
| C21 | mesmo texto em dois alunos, valores diferentes | api lote exit 0 | `apps/api/test/students-health.test.ts:52` - `expect(await storedHealth(first.id)).not.toBe(await storedHealth(second.id))` | PASS |
| C22 | ficha devolve o texto exato (acento, emoji, quebra, 2000) | api lote exit 0 | `apps/api/test/students-health.test.ts:61` - `toHaveLength(2000)`; `:70-71` - `toBe(200)`, `healthNotes, role).toBe(text)` | PASS |
| C23 | tag alterada, valor de outro aluno, sem prefixo -> 500 sem campos; hr_finance e lista 200 | api lote exit 0 | `apps/api/test/students-health.test.ts:101-106` - `toBe(500)`, `toBe('internal_error')`, `not.toHaveProperty(key)`, `not.toContain(mine.name)`; `:110` - hr_finance `toBe(200)`; `:112` - lista `toBe(200)`. Door 5 na criação e na leitura; na edição, C92 | PASS |
| C24 | chave ausente/não base64/31/33 -> exit 1 nomeando a variável; 32 sobe | api lote exit 0 | `apps/api/test/boot.test.ts:190-192` - `toBe(1)`, `toContain('DATA_ENCRYPTION_KEY')`, `not.toContain(env.DATA_ENCRYPTION_KEY)`; `:210` - `/health` `toBe(503)` com 32 bytes | PASS |
| C25 | nenhum segredo no log, inclusive na falha | api lote exit 0 | `apps/api/test/students-health.test.ts:137` - `expect(failing.status).toBe(500)`; `:154` - `expect(written.includes(value), ...).toBe(false)` sobre os 11 valores de `:140-152` | PASS |
| C26 | ficha de admin e reception: exatamente 12 chaves | api lote exit 0 | `apps/api/test/students-read.test.ts:43-44` - `toBe(200)`, `expect(await keysOf(response), role).toEqual(expected)` | PASS |
| C27 | hr_finance sem a chave `healthNotes` | api lote exit 0 | `apps/api/test/students-read.test.ts:53` - `Object.keys(body).sort()).toEqual([...11 chaves])`; `:68` - `expect('healthNotes' in body).toBe(false)` | PASS |
| C28 | instructor: só `id`, `name`, `status` | api lote exit 0 | `apps/api/test/students-read.test.ts:75` - `expect(await keysOf(response)).toEqual(['id', 'name', 'status'])` | PASS |
| C29 | `abc` e uuid desconhecido -> 404 `not_found` | api lote exit 0 | `apps/api/test/students-read.test.ts:82-83` - `toBe(404)`, `toBe('not_found')` | PASS |
| C30 | 8 leituras sem linha de auditoria | api lote exit 0 | `apps/api/test/students-read.test.ts:97-98` - `toBe(200)`, `auditCount...toBe(before)`; `:102` - `expect(cases).toBe(8)` | PASS |
| C31 | 55 alunos: 50 itens, 5 chaves, ordem por nome dobrado e id | api lote exit 0 | `apps/api/test/students-search.test.ts:82-84` - `toHaveLength(50)`, chaves `toEqual(['cpf', 'id', 'name', 'phone', 'status'])`, `toEqual(expected)`. Alcance das letras: AD-035 | PASS |
| C32 | lista do instructor: 3 chaves por item | api lote exit 0 | `apps/api/test/students-search.test.ts:93` - `expect(Object.keys(item).sort()).toEqual(['id', 'name', 'status'])` | PASS |
| C33 | termos de nome dobram caixa e acento; `11 joao` só nome | api lote exit 0 | `apps/api/test/students-search.test.ts:113` - `expect(namesOf(await search(role, { q })), ...).toEqual(expected)` sobre `:104-108` | PASS |
| C34 | dígitos: CPF igual ou telefone contém; parte de CPF vazio | api lote exit 0 | `apps/api/test/students-search.test.ts:129` - `toEqual([id])`; `:131` - `q: '5299822'...toEqual([])` | PASS |
| C35 | instructor com `q` de dígitos: vazio; reception acha | api lote exit 0 | `apps/api/test/students-search.test.ts:140` - instrutor `toEqual([])`; `:141` - recepção `toEqual([id])` | PASS |
| C36 | `status` sozinho e somado a `q` | api lote exit 0 | `apps/api/test/students-search.test.ts:155-158` - `toEqual(['Ana Silva', 'Edu Souza'])` ... `toEqual(['Bia Silva'])` | PASS |
| C37 | cursor percorre 120 (40 homônimos) sem repetir nem pular, com filtros | api lote exit 0 | `apps/api/test/students-search.test.ts:182` - `expect(await walk({})).toEqual(all.map((student) => student.id))`; `:183-187` com `status` e `q` | PASS |
| C38 | `nextCursor` nulo com 50, não nulo com 51 | api lote exit 0 | `apps/api/test/students-search.test.ts:198-199` - `toHaveLength(50)`, `toBeNull()`; `:205` - `not.toBeNull()` | PASS |
| C39 | 6 parâmetros inválidos -> 422 no `path`; `q` de 100 -> 200 | api lote exit 0 | `apps/api/test/students-search.test.ts:227-229` - `toBe(422)`, `toBe('validation_failed')`, `toEqual([param])`; `:232` com `expect(response.status).toBe(200)` em `:29` | PASS |
| C40 | `PATCH` 200 muda só o enviado | api lote exit 0 | `apps/api/test/students-update.test.ts:55-57` - `toBe(200)`, `toEqual({ ...before, ...change })` na resposta e no `GET` | PASS |
| C41 | `null` limpa 5 opcionais; coluna de saúde nula | api lote exit 0 | `apps/api/test/students-update.test.ts:82` - `expect(updated[field], ...).toBeNull()`; `:85` - `stored.some(... startsWith('v1.'))).toBe(false)`. Valor ilegível: C93 | PASS |
| C42 | 10 casos de 422 no `PATCH`, linha idêntica | api lote exit 0 | `apps/api/test/students-update.test.ts:110-112` - `toBe(422)`, `toContain(field)`, `studentRowText...toBe(before)` | PASS |
| C43 | regra do par conta o gravado | api lote exit 0 | `apps/api/test/students-update.test.ts:120` - `toEqual(['emergencyContactName'])`; `:125` - `toEqual(['emergencyContactPhone'])`; `:128-129` - `toBe(200)`, `toBe('1133334444')` | PASS |
| C44 | CPF de outro 409, próprio 200 | api lote exit 0 | `apps/api/test/students-update.test.ts:142-144` - `toBe(409)`, `toBe('cpf_taken')`, linha igual; `:149-150` - `toBe(200)`, `cpf).toBe(mine.cpf)` | PASS |
| C45 | `status` suspended/active de qualquer situação, 6 casos | api lote exit 0 | `apps/api/test/students-update.test.ts:163-165` - `toBe(200)`, `status...toBe(to)` na resposta e no `GET`; `:169` - `toBe(6)` | PASS |
| C46 | `status: inactive` 422 e nada aplicado | api lote exit 0 | `apps/api/test/students-update.test.ts:179-181` - `toBe(422)`, `toEqual(['status'])`, `studentRowText...toBe(before)` | PASS |
| C47 | `DELETE` 204 sem corpo, inativa, mantém a linha | api lote exit 0 | `apps/api/test/students-update.test.ts:195-198` - `toBe(204)`, `text()).toBe('')`, contagem igual, `toEqual({ ...before, status: 'inactive' })` | PASS |
| C48 | `DELETE` de inativo: linha idêntica, inclusive `updated_at` | api lote exit 0 | `apps/api/test/students-update.test.ts:210-211` - `toBe(204)`, `studentRowText...toBe(before)` | PASS |
| C49 | 10 pares de `PATCH` concorrentes somam | api lote exit 0 | `apps/api/test/students-update.test.ts:225-226` - `toEqual([200, 200])`, `toMatchObject({ phone, address })` | PASS |
| C50 | `PATCH`/`DELETE` com `abc` e uuid desconhecido -> 404 | api lote exit 0 | `apps/api/test/students-update.test.ts:237-238` - `toBe(404)`, `toBe('not_found')`; `:242` - `toBe(4)` | PASS |
| C51 | criação grava uma `student.created` com autor e alvo | api lote exit 0 | `apps/api/test/students-audit.test.ts:44-50` - `toHaveLength(1)`, `toMatchObject({ action: 'student.created', user_id: author.id, entity: 'student', entity_id: created.id })` | PASS |
| C52 | `diff` da criação com 4 campos | api lote exit 0 | `apps/api/test/students-audit.test.ts:58-61` - `toEqual({ fields: ['name', 'cpf', 'birthDate', 'phone', 'status'], values: { status: { from: null, to: 'active' } } })` | PASS |
| C53 | 4 `PATCH` com uma `student.updated` cada | api lote exit 0 | `apps/api/test/students-audit.test.ts:78-85` - `toBe(200)`, `toHaveLength(1)`, `toMatchObject({ action: 'student.updated', user_id: receptionUser.id, entity: 'student', entity_id: student.id })` | PASS |
| C54 | `diff` do `PATCH` só com `status` em `values` | api lote exit 0 | `apps/api/test/students-audit.test.ts:97-100` - `toEqual({ fields: ['phone', 'healthNotes', 'status'], values: { status: { from: 'active', to: 'suspended' } } })` | PASS |
| C55 | `PATCH` sem mudança não grava | api lote exit 0 | `apps/api/test/students-audit.test.ts:131-133` - `toBe(200)`, `auditCount...toBe(count)`, linha igual | PASS |
| C56 | `DELETE` grava `student.inactivated` com `diff` de active e de suspended | api lote exit 0 | `apps/api/test/students-audit.test.ts:144-152` - `toBe(204)`, `toHaveLength(1)`, `toMatchObject({ action: 'student.inactivated', ..., diff: { fields: ['status'], values: { status: { from, to: 'inactive' } } } })` | PASS |
| C57 | seis casos: status exato de cada um (401/403/404/409/422/204) e nenhuma linha | api lote exit 0 | `apps/api/test/students-audit.test.ts:162-170` - casos com `expected` e `toHaveLength(6)`; `:177` - `expect(response.status, name).toBe(expected)`; `:178` - `expect(await auditCount(stack), name).toBe(count)` | PASS |
| C58 | insert de auditoria falhando: 500 e `students` intacto nas 3 rotas | api lote exit 0 | `apps/api/test/students-audit.test.ts:197-199` - `toBe(500)`, `toBe('internal_error')`, `expect(await snapshot(), name).toEqual(before)` | PASS |
| C59 | nenhum dos dez valores em `audit_logs` | api lote exit 0 | `apps/api/test/students-audit.test.ts:262` - `expect(text.includes(value), value).toBe(false)` sobre os 21 valores de `:237-259` | PASS |
| C60 | `ip` do proxy e `user_agent` cortado em 512 ou nulo, nas 3 ações | api lote exit 0 | `apps/api/test/students-audit.test.ts:320-322` - `toHaveLength(1)`, `ip).toBe('203.0.113.7')`, `user_agent).toBe(label === 'com User-Agent' ? agent.slice(0, 512) : null)` | PASS |
| C61 | `/audit` nomeia as 3 ações; filtro com 13, novas em 11-13 | web lote exit 0 | `apps/web/e2e/audit.spec.ts:187-191` - `toEqual(['Aluno criado', 'Aluno editado', 'Aluno inativado'])`; `:194-195` - `toHaveLength(13)`, `options.slice(11)).toEqual([...])` | PASS |
| C62 | "Situação: Ativo → Suspenso", "Telefone alterado", "Situação: Inativo → Ativo" | web lote exit 0 | `apps/web/e2e/audit.spec.ts:215-218` - `getByText('Situação: Ativo → Suspenso', { exact: true })).toBeVisible()` ... `'Situação: Inativo → Ativo'` | PASS |
| C63 | "Ver aluno" leva a `/students/<id>`; `user` segue com nome | web lote exit 0 | `apps/web/e2e/audit.spec.ts:231-234` - `toHaveAttribute('href', \`/students/${studentId}\`)`; `:235` - `toHaveText('Pessoa 2')` | PASS |
| C64 | link "Alunos" para os 4 perfis | web lote exit 0 | `apps/web/e2e/shell.spec.ts:39` - `getByRole('link', { name: 'Alunos', exact: true }), role).toHaveCount(1)` | PASS |
| C65 | 4 URLs sem sessão -> `/login` | web lote exit 0 | `apps/web/e2e/students.spec.ts:65` - `await expect(page, path).toHaveURL('/login')` | PASS |
| C66 | título, 4 colunas em ordem, ordem da API, links | web lote exit 0 | `apps/web/e2e/students.spec.ts:78-85` - heading `Alunos`, `toEqual(['Nome', 'CPF', 'Telefone', 'Situação'])`, `toEqual(['Zélia', 'Ana', 'Marcos'])`, `toHaveAttribute('href', ...)` | PASS |
| C67 | instructor: só "Nome" e "Situação" | web lote exit 0 | `apps/web/e2e/students.spec.ts:97` - `toEqual(['Nome', 'Situação'])` | PASS |
| C68 | formatos de CPF, telefone, data (SP e UTC) e situação | web lote exit 0 | `apps/web/e2e/students.spec.ts:117-129` - `'529.982.247-25'`, `'(11) 91234-5678'`, `'(11) 1234-5678'`, `'Ativo'`, `'Inativo'`, `'Suspenso'`; `:132` - `getByText('01/01/2000', { exact: true })` | PASS |
| C69 | campo, filtro com 4 opções em ordem, 2 botões, acima da tabela | web lote exit 0 | `apps/web/e2e/students.spec.ts:146-150` - textbox, `toEqual(['Todas', 'Ativo', 'Inativo', 'Suspenso'])`, botões; `:154` - `expect(field!.y).toBeLessThan(table!.y)` | PASS |
| C70 | busca chega à API com `q` e `status`, URL sem o texto | web lote exit 0 | `apps/web/e2e/students.spec.ts:173-175` - `toEqual([{ q: '529.982.247-25', status: 'inactive' }])`, `page.url()).toBe(before)`, `not.toContain(text)` | PASS |
| C71 | "Próxima página" envia `cursor` com mesmos filtros | web lote exit 0 | `apps/web/e2e/students.spec.ts:197-201` - `toEqual([{ q: 'silva', status: 'suspended' }, { ..., cursor: 'CURSOR-DA-PAGINA-1' }])`, `not.toContain('silva')` | PASS |
| C72 | "Nenhum aluno encontrado." com `q` e com só situação | web lote exit 0 | `apps/web/e2e/students.spec.ts:212-213` e `:219-220` - `getByText('Nenhum aluno encontrado.', { exact: true })).toBeVisible()`, `getByRole('table')).toHaveCount(0)` | PASS |
| C73 | "Nenhum aluno cadastrado." | web lote exit 0 | `apps/web/e2e/students.spec.ts:229-230` - `getByText('Nenhum aluno cadastrado.', { exact: true })).toBeVisible()`, tabela `toHaveCount(0)` | PASS |
| C74 | erro de carga com "Tentar novamente" na lista e na ficha | web lote exit 0 | `apps/web/e2e/students.spec.ts:241-244` - `'Não foi possível carregar os alunos.'` visível, tabela visível após o botão; `:248-251` idem na ficha | PASS |
| C75 | botões de escrita só para admin e reception, por situação | web lote exit 0 | `apps/web/e2e/students.spec.ts:279` - `toEqual(writer ? ['Novo aluno'] : [])`; `:287` - `toEqual(writer ? expected[status] : [])` | PASS |
| C76 | formulários sem permissão para hr_finance e instructor | web lote exit 0 | `apps/web/e2e/students.spec.ts:300-303` - texto visível, `textbox`/`combobox`/`Salvar` `toHaveCount(0)`; `:307` - `toBe(4)` | PASS |
| C77 | rótulos, opções de "Sexo" e "Salvar" nos 2 formulários | web lote exit 0 | `apps/web/e2e/students.spec.ts:329` - `getByLabel(label, { exact: true })).toBeVisible()`; `:331-336` - `toEqual(['', 'Feminino', 'Masculino', 'Outro'])`; `:337` - `Salvar` visível | PASS |
| C78 | salvar `/students/new` envia o `POST` e vai à ficha | web lote exit 0 | `apps/web/e2e/students.spec.ts:357` - `toHaveURL(\`/students/${created.id}\`)`; `:359-370` - `api.writes()...toEqual([{ method: 'POST', path: '/api/students', body: {...} }])` | PASS |
| C79 | `cpf_taken` junto do CPF, demais campos mantidos | web lote exit 0 | `apps/web/e2e/students.spec.ts:387-390` - `toHaveAccessibleDescription('Já existe um aluno com este CPF.')`, `toHaveValue('Nome Digitado')`; `:396-398` na edição | PASS |
| C80 | ficha com campos devolvidos, "—" no nulo, sem rótulo ausente | web lote exit 0 | `apps/web/e2e/students.spec.ts:408-431` - `dt` e `dd` `toEqual([...])` com `'—'`; `:436` - `not.toContain('Observações de saúde')`; `:442` - `toEqual(['Situação'])` | PASS |
| C81 | botões de situação por situação | web lote exit 0 | `apps/web/e2e/students.spec.ts:459` - `toHaveCount(1)`; `:462` - `toHaveCount(0)` | PASS |
| C82 | diálogo nomeia o aluno; nada antes de confirmar; cancelar não envia | web lote exit 0 | `apps/web/e2e/students.spec.ts:480-481` - `toContainText('Joana Confirmada')`, `toHaveLength(...)`; `:486`; `:492-495` - `toEqual(['PATCH ...', 'DELETE ...'])` | PASS |
| C83 | ficha mostra a situação nova após cada mudança | web lote exit 0 | `apps/web/e2e/students.spec.ts:515` - `toHaveText('Suspenso')`; `:518` - `'Ativo'`; `:522` - `'Inativo'`; `:524-528` - corpos `{ status: 'suspended' }`, `{ status: 'active' }` | PASS |
| C84 | 404 -> "Aluno não encontrado." na ficha e na edição | web lote exit 0 | `apps/web/e2e/students.spec.ts:539` - `getByText('Aluno não encontrado.', { exact: true }), path).toBeVisible()` | PASS |
| C85 | OpenAPI: métodos e 3 parâmetros de query do schema do contrato | api lote exit 0 | `apps/api/test/openapi.test.ts:99-100` - `toEqual(['get', 'post'])`, `toEqual(['delete', 'get', 'patch'])`; `:103` - `toHaveLength(3)`; `:106-108` - `in).toBe('query')`, `required).not.toBe(true)`, `schema).toEqual(properties[parameter.name])` | PASS |
| C86 | corpos reais validam contra os schemas, 7 casos | api lote exit 0 | `apps/api/test/contracts.test.ts:302` - `toHaveLength(7)`; `:308-309` - `toBe(status)`, `parsed.success...toBe(true)` | PASS |
| C87 | `cpf_taken` 409 válido no schema de erro | api lote exit 0 | `apps/api/test/contracts.test.ts:320-324` - `toBe(409)`, `code).toBe('cpf_taken')`, `status).toBe(409)`, `application/problem+json`, `problemSchema.safeParse(body).success).toBe(true)`. Metade "o schema conhece": nota de precisão 1 | PASS |
| C88 | `.env.example` com a chave e `openssl rand -base64 32` | repo exit 0 | `tests/repo/repo.test.ts:155` - `toContain('openssl rand -base64 32')`; `:159` - `apiEnvSchema.shape.DATA_ENCRYPTION_KEY.safeParse(example).success).toBe(true)` | PASS |
| C89 | stack: reception cria pela origem `web`, `v1.` sem texto, linha `student.created` com ip e UA | stack exit 0 (11,6 s; só em `tests/stack`) | `tests/stack/compose.test.ts:185` - `toBe(201)`; `:191-192` - `toContain('v1.')`, `not.toContain(healthNotes)`; `:197` - `toEqual([...])` com uma linha só: `student.created`, `203.0.113.9` e `teste-aluno/1.0` unidos por barra vertical (a barra fica fora da tabela para não partir a célula) | PASS |
| C90 | admin sem 2FA: 403 nas 5 rotas, lista escrita as inclui | api lote exit 0 | `apps/api/test/enrollment.test.ts:46-47` - `toBe(403)`, `toBe('two_factor_enrollment_required')`; `:50-67` - lista com as cinco `/api/students*` | PASS |
| C91 | "Salvar" desabilitado enquanto espera, nos 2 formulários | web lote exit 0 | `apps/web/e2e/students.spec.ts:558` - `await expect(save).toBeDisabled()`; `:565` - `await expect(saveEdit).toBeDisabled()` | PASS |
| C92 | `PATCH` com `id` em maiúsculas e `healthNotes` novo: 200; `GET` em minúsculas devolve o texto | api lote exit 0 | `apps/api/test/students-update.test.ts:248` - `reception.patch(\`/api/students/${student.id.toUpperCase()}\`, { healthNotes: 'Texto novo' })`; `:250` - `expect(response.status).toBe(200)`; `:251` - `expect((await fetchStudent(student.id)).healthNotes).toBe('Texto novo')` | PASS |
| C93 | `null` sobre valor ilegível: 200 e `GET` devolve `healthNotes` `null` | api lote exit 0 | `apps/api/test/students-update.test.ts:256` - `update students set health_notes_enc = 'v1.lixo.lixo.lixo'`; `:260` - `expect(response.status).toBe(200)`; `:261` - `expect((await fetchStudent(student.id)).healthNotes).toBeNull()`. `200` do `GET` só por consequência: nota de precisão 2 | PASS |
| C94 | edição salva envia um `PATCH` com valores digitados (nome aparado) e `null` nos opcionais esvaziados, e vai à ficha | web lote exit 0 | `apps/web/e2e/students.spec.ts:577-579` - `fill('  Nome Corrigido  ')`, `fill('')` em "E-mail" e "Endereço"; `:582` - `await expect(page).toHaveURL(\`/students/${student.id}\`)`; `:583-600` - `api.writes()...toEqual([{ method: 'PATCH', path: \`/api/students/${student.id}\`, body: { name: 'Nome Corrigido', cpf: '529.982.247-25', birthDate: '2000-01-01', phone: '(11) 91234-5678', sex: 'female', email: null, address: null, emergencyContactName: 'Maria da Penha', emergencyContactPhone: '(11) 3456-7890', healthNotes: 'Hipertensão controlada' } }])` | PASS |

## Coverage

Recomputadas em 417bf8b as linhas cuja autoridade o diff tocou (marcadas `verified at 417bf8b`); as
demais são `carried from da2c543` - o diff não tocou rota, schema, migração, tela nem perfil (só
`students.service.ts:57,173,298` e testes).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| one-way doors (5) - verified at 417bf8b | plano Landing (`plan.md:111` door 5), AD-034; `students.service.ts:107` (criação, `row.id`), `:173` (edição, `row.id`), `:286` (decifra, `row.id`) | door 1 C1-C4, C12 · door 2 C5, C6, C20 · door 3 C7, C52, C54, C56 · door 4 C27, C28, C32 · door 5: valor de outro aluno recusado C23 · cifra da criação lida de volta C22 · cifra da edição com o `id` da linha C92 (mutante a morto) | - |
| `null` limpa opcional no `PATCH` (5 campos x estado gravado) - verified at 417bf8b | AC 33 (`plan.md:191`); `students.service.ts:146,157,172-174,293-299` | `sex`, `email`, `address`, par de contato C41 · `healthNotes` legível C41 · `healthNotes` ilegível C93 (mutante b morto) | - |
| corpo do `PATCH` do formulário de edição - verified at 417bf8b | Test policy "Tela" (`checks.md:489`, "o corpo que chega à API"), AC 33, AC 69; `apps/web/src/app/students/student-form.tsx:51-64,89` | método e caminho C94 · obrigatórios aparados (`name` com espaços) C94 · `cpf`, `birthDate`, `phone` C94 · opcionais preenchidos (`sex`, par de contato, `healthNotes`) C94 · opcionais esvaziados vão como `null` (`email`, `address`) C94 (mutante c morto) · navegação para a ficha C94 | - |
| `id` da URL do `PATCH` em maiúsculas - verified at 417bf8b | `students.service.ts:59` (`UUID` com `/i`), `:143` (busca pela linha), `:173` (AAD), `:178,180` (`where` e `entity_id`, coluna `uuid` em `0002_audit_logs.sql:6`, normalizada pelo Postgres) | cifra com o `id` da linha C92 | - |
| status que não gravam linha (5 e um caso) - verified at 417bf8b | AC 49; `students.controller.ts`; `students-audit.test.ts:162-169` | `401`, `403`, `404`, `409`, `422`, `DELETE` de inativo `204`: cada status afirmado em `:177` e contagem em `:178` (C57; mutante d morto) | - |
| `GET /api/students` statuses (4) - carried from da2c543 | Surface; `students.controller.ts:28-35` | 200 C31 · 401 C19 · 403 C90 · 422 C39 | - |
| `POST /api/students` statuses (5) - carried from da2c543 | Surface; `students.controller.ts:37-45` | 201 C9 · 401 C19 · 403 C18 · 409 C12 · 422 C11/C14-C17 | - |
| `GET /api/students/:id` statuses (4) - carried from da2c543 | Surface; `students.controller.ts:47-54` | 200 C26 · 401 C19 · 403 C90 · 404 C29 | - |
| `PATCH /api/students/:id` statuses (6) - carried from da2c543 | Surface; `students.controller.ts:56-80` | 200 C40 · 401 C19 · 403 C18 · 404 C50 · 409 C44 · 422 C42, C43 | - |
| `DELETE /api/students/:id` statuses (4) - carried from da2c543 | Surface; `students.controller.ts:82-87` | 204 C47 · 401 C19 · 403 C18 · 404 C50 | - |
| `500` fora da Surface (4) - carried from da2c543 | Flow; `ProblemFilter` | GET ficha C23 · POST/PATCH/DELETE C58 | - |
| perfis por rota (5 rotas x 4) - carried from da2c543 | `@Roles` em `students.controller.ts:29,38,48,57,83` | GET lista C31/C32 · GET ficha C26-C28 · POST C9/C18 · PATCH C40/C18 · DELETE C47/C18 | - |
| colunas de `students` (14) - carried from da2c543 | `0003_students.sql:9-22` | `id` C2 · `name`/`cpf`/`birth_date`/`phone` C9, C10 · `sex`/`email`/`address`/`emergency_*` C16, C40, C41 · `health_notes_enc` C20, C41, C93 · `status` C2, C3 · `updated_at` C48 · `created_at` default do banco, não decidido pelo plano | - |
| constraints de `students` (4) - carried from da2c543 | `0003_students.sql:9,20,23-24` | PK `uuidv7()` C2 · `DEFAULT 'active'` C2 · `UNIQUE(cpf)` C4 · `CHECK status` C3 | - |
| colunas ausentes (3) - carried from da2c543 | Landing door 1, Relations | `deleted_at`, `guardian_id`, `tenant_id` C1; FK nenhuma C1 | - |
| campos do corpo do `POST` (10) - carried from da2c543 | `contracts/src/students.ts:82-94` | `name` C16 · `cpf` C11 · `birthDate` C14 · `phone` C15 · `sex` C16 · `email` C16 · `address` C16 · `emergencyContactName` C16/C17 · `emergencyContactPhone` C15/C17 · `healthNotes` C16/C20 | - |
| campos do corpo do `PATCH` (11) - carried from da2c543 | `contracts/src/students.ts:119-131` | C40-C46 | - |
| chaves da resposta do aluno (12) - carried from da2c543 | `contracts/src/students.ts:138-151` | C9, C26 (12) · C27 (11) · C28 (3) | - |
| chaves do item da lista (5) - carried from da2c543 | `contracts/src/students.ts:155-161` | C31 (5) · C32 (3) | - |
| parâmetros de query (3) - carried from da2c543 | `contracts/src/students.ts:198-213` | `q` C33-C35, C39 · `status` C36, C39 · `cursor` C37-C39 · documento C85 | - |
| `AUDIT_ACTIONS` (13) - carried from da2c543 | `packages/contracts/src/audit.ts` | C7; rótulos C61 | - |
| ações de aluno: quem grava, `diff`, origem (3 x 3) - carried from da2c543 | Landing door 3 | created C51/C52/C60 · updated C53/C54/C60 · inactivated C56/C60 | - |
| dobra de caixa e acento na busca e na ordem - re-julgada em 417bf8b | AC 23, AC 25 restritas pela AD-035 (`STATE.md`) e `checks.md:472`; `0003_students.sql:3-7` | letras do português da lista de `translate` (amostra: ã, á, Â, É, Í, Ó, Ú, Ç, caixa) C31, C33; letras de outras línguas fora do conjunto por decisão do usuário | - |
| caminhos de `q` (4) - carried from da2c543 | `students.service.ts` (busca) | só letras C33 · letras e dígitos C33 · só dígitos C34 · só dígitos de `instructor` C35 | - |
| valores fora do log (5) e de `audit_logs` (10) - carried from da2c543 | AC 17, AC 51 | C25 (11 valores), C59 (21 valores) | - |
| ACs 1-76 -> checks - carried from da2c543 | plano, Criteria | 76 de 76 com check (C38 cobre AC 29 e AC 30); C92-C94 reforçam AC 12/14, AC 33 e a linha "Tela" | - |
| telas e estados de `Observable` - carried from da2c543 | Observable | C61-C84, C91, C94 | - |
| startup config: `DATA_ENCRYPTION_KEY` (5 lugares) - carried from da2c543 | cada assembly aberta | `apps/api/src/env.ts:12` (C24) · `apps/api/src/app.module.ts:61` · `apps/api/test/support/app.ts:13,32` · `.env.example:25` (C88) · `compose.yaml:47` (C89) | - |
| startup config: migração `0003` (3 assemblies) - carried from da2c543 | cada assembly | `packages/database` (C1) · harness de `apps/api` (C9) · `compose.yaml:25-35` (C89) | - |
| startup config: `trust proxy` (2 assemblies) - carried from da2c543 | `apps/api/src/configure-app.ts:20` | harness C60 · stack C89 | - |

## Test policy rows

Re-julgadas em 417bf8b as duas linhas não atendidas na rodada 1 e a que classifica o arquivo tocado
(`students.service.ts`, linha "Decide, alcançado por HTTP"); as demais `carried from da2c543`.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, alcançado por HTTP - verified at 417bf8b | `students.service.ts`, `students.view.ts`, `contracts/src/students.ts` | fronteira HTTP com Postgres real, `students` e `audit_logs` por SQL: C9-C19, C26-C60, C92, C93 | yes - as três linhas da rodada 1 agora têm caso ou decisão: AAD da edição C92 (`students-update.test.ts:250-251`), `null` sobre ilegível C93 (`:260-261`), letras fora da dobra excluídas pela AD-035; texto sobre ilegível segue o mesmo ramo da sentinela (`students.service.ts:298`) que a C93 exercita; os seis status que não gravam afirmados um a um (C57, `students-audit.test.ts:177-178`); a edição sem `healthNotes` de aluno ilegível segue fora de AC (`checks.md:470`) |
| Decide, com ramos que a rota não separa - carried from da2c543 | `crypto.ts`, dígito verificador em `contracts/src/students.ts:28-37` | fronteira C11, C23; próprio nível `cpf_check_digit_table`, C5, C6 | yes |
| Restrição do banco - carried from da2c543 | `0003_students.sql` | banco migrado: C1-C4 | yes - 3 aceitos e 3 recusados pelo `CHECK`, `UNIQUE` em 3 situações, 2 `DEFAULT` |
| Tela - verified at 417bf8b | `apps/web/src/app/students/*`, `apps/web/src/lib/audit.ts`, `shell.tsx` | Playwright contra `FakeApi`: C61-C84, C91, C94 | yes - query C70, C71; corpo do `POST` C78; corpo do `PATCH` da edição C94 (`students.spec.ts:583-600`); corpos dos botões de situação C83; estados e textos literais C61-C84, C91 |
| Instrumentação - carried from da2c543 | controller, `ACTION_LABELS`, formatadores do web | nenhuma própria | yes - cobertos por C9-C60, C61, C68 |

## Faults injected

verified at 417bf8b para as 4 primeiras linhas; as 5 seguintes `carried from da2c543` (nenhuma das
superfícies delas foi tocada pelo diff; a linha do desempate da ordem mudou de `:236` para `:239` só
pelas 3 linhas inseridas em `:56-58`).

Worktree descartável: `git worktree add <scratchpad>/wt HEAD` em `417bf8b`, `pnpm install --offline`,
provas rodadas com o binário local (`apps/api/node_modules/.bin/vitest`, `apps/web/node_modules/.bin/playwright`,
que sobe o próprio `next build` com `reuseExistingServer: false`). Cada mutante revertido com
`git checkout -- .` e `git status --porcelain` do worktree vazio antes do seguinte. Baseline da árvore
real antes: `?? CLAUDE.md`; depois de `git worktree remove` (diretório apagado à parte por caminho longo do
Windows) e `git worktree prune`: `?? CLAUDE.md`, idêntico (`diff` sem saída); `git worktree list` só com a
árvore principal.

| Mutation | Location | Killed |
| --- | --- | --- |
| (a) a edição volta a cifrar com o `id` da URL: `encrypt(change.healthNotes, row.id)` -> `encrypt(change.healthNotes, id)` | `apps/api/src/students/students.service.ts:173` | yes - C92 `patch_with_uppercase_id_keeps_health_notes_readable`: `expected undefined to be 'Texto novo'` |
| (b) substituição sobre ilegível volta a valer `null`: `if (replacing) return UNREADABLE;` -> `if (replacing) return null;` (o `diffOf` não vê mudança e nada é gravado) | `apps/api/src/students/students.service.ts:298` | yes - C93 `patch_null_clears_an_unreadable_health_notes_value`: `expected undefined to be null` |
| (c) o formulário de edição deixa de mandar `null` nos opcionais esvaziados: linha `else if (editing) body[key] = null;` removida | `apps/web/src/app/students/student-form.tsx:62` | yes - C94 `edit_form_sends_patch_with_typed_values_and_null_for_cleared`: diff `- "address": null`, `- "email": null` |
| (d) o `DELETE` de aluno já inativo responde `404`: `if (row.status === 'inactive') return true;` -> `return false;` | `apps/api/src/students/students.service.ts:195` | yes - C57 `rejected_students_requests_write_no_row`: `DELETE de inativo: expected 404 to be 204` (a asserção da rodada 1, `toContain`, aceitaria) |
| desempate da ordem por `id` invertido | `apps/api/src/students/students.service.ts:239` (era `:236`) | yes - carried from da2c543, C31 |
| corte por perfil devolve `healthNotes: null` em vez de remover a chave | `apps/api/src/students/students.view.ts:17` | yes - carried from da2c543, C27 |
| AAD removido da cifra e da decifra | `apps/api/src/crypto.ts:31`, `:47` | yes - carried from da2c543, C23 |
| `phone` passa a campo registrável | `apps/api/src/students/students.service.ts:20` | yes - carried from da2c543, C54 |
| a busca grava `?q=...&status=...` no endereço | `apps/web/src/app/students/students-list.tsx:49` | yes - carried from da2c543, C70 |

### Swept existing

verified at 417bf8b - guarda global AD-022 (`apps/api/src/app.module.ts:76`) e `unhandled_500_hides_exception`
(`apps/api/test/problem.test.ts:31`): `guard_matrix_three_declarations_five_callers` e
`unhandled_500_hides_exception` re-rodados, verdes; `admin_without_2fa_gets_403_everywhere_else` é a prova da C90,
verde no lote de API.

### Passo 5

n/a - sem humano na sessão; a C94 cobre por seletor o que a rodada 1 deixou aberto na tela.

## Gate

Provas rodadas em `417bf8b`, em lote por alvo:

- `pnpm --filter "./packages/database" exec vitest run test/students.test.ts -t "^(<4 nomes>)$" --reporter=verbose` - exit 0, 4 passed
- `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts test/contracts.test.ts test/crypto.test.ts test/enrollment.test.ts test/openapi.test.ts test/students-audit.test.ts test/students-create.test.ts test/students-health.test.ts test/students-read.test.ts test/students-search.test.ts test/students-update.test.ts -t "^(<63 nomes>)$" --reporter=verbose` - exit 0, 63 passed, 18 skipped (fora do filtro), 0 failed
- `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "^(env_example_documents_data_encryption_key)$" --reporter=verbose` - exit 0, 1 passed
- `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts e2e/audit.spec.ts e2e/shell.spec.ts -g "(<26 nomes>)$" --reporter=list` - exit 0, 26 passed
- `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "student_created_through_web_stores_ciphertext_and_audit_row" --reporter=verbose` - exit 0, 1 passed (C89, só em `tests/stack`)
- swept: `pnpm --filter "./apps/api" exec vitest run test/access.test.ts test/problem.test.ts -t "^(guard_matrix_three_declarations_five_callers|unhandled_500_hides_exception)$"` - exit 0, 2 passed

Total: 97 testes nomeados (95 provas dos 94 checks e 2 do swept), 97 passed, 0 failed.
