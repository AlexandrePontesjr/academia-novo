# Cadastro de alunos verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 9c8128d..da2c543
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Os 91 checks passam com evidência localizada e os 5 mutantes morreram. O veredito é FAIL por três
defeitos reais que nenhum check alcança, confirmados por sondas executadas sobre o código de HEAD
num worktree descartável (secção "Sondas"), e por duas linhas de `Test policy` não atendidas.

## Ranked gaps

1. **A cifra do `PATCH` usa o `:id` da URL como AAD, não o `id` da linha** - door 5 / AD-034, AC 12 e AC 14, sem check - `apps/api/src/students/students.service.ts:170` - `this.cipher.encrypt(change.healthNotes, id)`, com `id` vindo de `@Param('id')` e aceito em maiúsculas por `UUID = /^...$/i` (`students.service.ts:56`); a decifra usa `row.id`, que o Postgres devolve em minúsculas (`students.service.ts:283`). Sonda A: `PATCH /api/students/<ID EM MAIÚSCULAS>` com `healthNotes` -> `200`; o `GET /api/students/<id>` seguinte -> `500`, para sempre, para `admin` e `reception`. A observação de saúde fica ilegível e a ficha inteira some para quem a registra. A Landing da door 5 diz "o AAD é o `id` do aluno"; o código usa o texto que o cliente mandou.
2. **`PATCH {"healthNotes": null}` sobre valor ilegível responde `200` com `healthNotes: null` e não limpa nada** - AC 33, sem check - `apps/api/src/students/students.service.ts:290-295` (`safeHealthNotes` devolve `null` quando substitui) e `:154-155` (`diffOf` sem diferença -> `return { outcome: 'ok', student: current }`, sem o `update`). Sonda B: a resposta diz `null`, a coluna continua `lixo-ilegivel`, o `GET` seguinte responde `500`, e um `PATCH {"phone": ...}` qualquer também responde `500`. A AC 33 diz que `null` SHALL limpar o campo; a resposta afirma uma limpeza que não aconteceu. O checks.md deixou "a edição de um aluno com observação ilegível" fora de check; este caso, porém, a AC 33 decide.
3. **A dobra de acentos da busca e da ordem cobre só as 46 letras da lista de `students_fold`** - AC 23 e AC 25 ("sem diferenciar acentos"), C31/C33 amostram só letras da lista - `packages/database/migrations/0003_students.sql:3-7` (`translate($1, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', ...)`). Sonda C: alunos "Søren Dvořák", "Gabriela Çavuş" e "Ýrsa Åberg" não são achados por `q=soren`, `dvorak`, `cavus`, `yrsa` nem `aberg` (0 itens cada), e são achados só com o acento exato (`søren`, `çavuş`). A ordem da AC 23 herda a mesma dobra (`students.service.ts:216`, `:236`). Lacuna de cobertura: o conjunto "letras acentuadas" que a AC cobre nunca foi enumerado, e o membro "letra fora da lista" falha.
4. **Test policy, linha "Tela": o corpo do `PATCH` do formulário de edição nunca é afirmado** - `apps/web/e2e/students.spec.ts` - os únicos `api.writes()` com corpo são `:359` (o `POST` de `/students/new`) e `:524` (os botões de situação); C79 e C91 salvam a edição sem olhar o que chegou à API (`apps/web/src/app/students/student-form.tsx:89` envia o `PATCH`). A expectativa da linha é "a query e o corpo que chegam à API".
5. **Test policy, linha "Decide, alcançado por HTTP": linhas da tabela de decisão sem caso afirmado** - os itens 1 a 3 acima (contexto do AAD na edição, `null` sobre valor ilegível, letras fora da lista da dobra) são ramos do código que decide e não têm caso.
6. (precisão, não bloqueia sozinho) **C57 não afirma o status de cada caso** - `apps/api/test/students-audit.test.ts:177` - `expect([401, 403, 404, 409, 422, 204], name).toContain(response.status)`: o caso "404" passaria respondendo `422`. A contagem (`:178`) é a afirmação da AC 49 e está lá; o status de cada entrada é provado em separado por C19, C18, C50, C12 e C46 com as mesmas entradas.
7. (precisão) **C87 afirma que o schema de erro "conhece `cpf_taken` com status 409"** - `packages/contracts/src/problem.ts:11` é `code: z.string().regex(/^[a-z]+(_[a-z]+)*$/)`: não há lista de códigos em `packages/contracts`, e `cpf_taken` não aparece lá (`rg -n cpf_taken packages/contracts` sem resultado). A metade provada é o corpo real: `contracts.test.ts:320-324`. Mesmo padrão de `email_taken`, que também não está nos contratos.
8. (documento) `checks.md` diz "4 one-way doors" no `Intent` e a linha `one-way doors (4)` do `Coverage` não tem a door 5. Recomputada abaixo com 5: a door 5 é provada por C23 (falta 3 morta no caso "valor de outro aluno").

## Binding sources

Nenhuma fonte vinculante de design; PRD aberto e comparado com Surface/Landing.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `PRD — Sistema de Gestão de Academia.md` §2, §3.2 (RF-05, RF-07, RF-08), §3.8 (RF-31), §4, §6 `students`, §7, §8 telas 3 e 4 | yes - lido no repositório: §2 linhas 37 e 39 (Recepção cadastra/edita; Instrutor "nome, foto, status") contra door 4, C26-C28, C32, C18; RF-05 (linha 55) contra os campos da Surface e C9/C16; RF-07 (linha 57) contra C33-C38; RF-08 (linha 58) contra C47/C48; RF-31 (linha 99) contra door 2/5, C5, C20; §4 (linha 107) é Assumption sem check; §6 (linha 176) contra door 1 - `guardian_id` e `deleted_at` ausentes por decisão explícita do Impact, provada por C1; índice trigram de nome (linha 186) existe em `0003_students.sql:27`; §7 (linhas 195-196) contra as cinco rotas da Surface e C85; §8 telas 3 e 4 contra S8 (miniatura e blocos de matrícula estão no Out of scope) | none | - |

## Checks

Rodadas em `da2c543`, em lote por alvo (comandos na secção Gate). Todo nome citado nos checks existe
(`rg -n "^test\('"` em cada arquivo) e aparece executado e verde, um a um, na saída verbose; nenhum
ficou `skipped` (os 18 `↓` da execução de API são testes de outros checks excluídos pelo `-t`).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `students` sem `deleted_at`, `guardian_id`, `tenant_id`, sem FK | database `vitest run test/students.test.ts -t "...students_has_no_deleted_at_guardian_or_foreign_key..."` exit 0 | `packages/database/test/students.test.ts:67` - `expect(columns, absent).not.toContain(absent)`; `:73` - `expect(foreignKeys).toEqual([])` | PASS |
| C2 | id uuidv7 e `status` `active` por padrão | database lote exit 0 | `packages/database/test/students.test.ts:84` - `expect(row!.version).toBe(7)`; `:85` - `expect(row!.status).toBe('active')` | PASS |
| C3 | `CHECK` aceita 3, recusa `archived`/`Active`/`''`, linha intacta | database lote exit 0 | `packages/database/test/students.test.ts:92` - `expect(row!.status).toBe(status)`; `:99-100` - `rejects.toMatchObject({ code: CHECK_VIOLATION })`; `:109` - `expect(await read(id)).toEqual(before)` | PASS |
| C4 | `UNIQUE` do CPF em toda situação | database lote exit 0 | `packages/database/test/students.test.ts:117` - `rejects.toMatchObject({ code: UNIQUE_VIOLATION })`; `:119` - `expect(await count(), status).toBe(total)` | PASS |
| C5 | formato `v1`, IV 12, tag 16, base64url, ida e volta, IV novo | api lote `test/crypto.test.ts` exit 0 | `apps/api/test/crypto.test.ts:22-26` - `toHaveLength(4)`, `toBe('v1')`, `decodedLength(parts[1]!)).toBe(12)`, `decodedLength(parts[3]!)).toBe(16)`; `:28` - `expect(cipher.decrypt(stored, ROW)).toBe(text)`; `:32` - `expect(again[0]).not.toBe(again[1])` | PASS |
| C6 | decifra recusa texto/tag alterados, outra chave, `v2.` e sem prefixo | api lote exit 0 | `apps/api/test/crypto.test.ts:52` - `expect(() => cipher.decrypt(value, ROW), name).toThrow()` sobre os 5 casos de `:43-47` | PASS |
| C7 | `AUDIT_ACTIONS` com 13, três novas no fim, em ordem | api lote exit 0 | `apps/api/test/contracts.test.ts:216` - `expect(AUDIT_ACTIONS).toHaveLength(13)`; `:217` - `toEqual([...before, 'student.created', 'student.updated', 'student.inactivated'])` | PASS |
| C8 | schema do aluno aceita 3 formas, recusa sem `id`/`name`/`status` | api lote exit 0 | `apps/api/test/contracts.test.ts:238` - `expect(studentSchema.safeParse(body).success, name).toBe(true)`; `:242` - `...safeParse(without).success, missing).toBe(false)` | PASS |
| C9 | `POST` 201 por admin e reception, 12 chaves, opcionais `null` | api lote exit 0 | `apps/api/test/students-create.test.ts:55` - `expect(response.status, role).toBe(201)`; `:56` - `expect(Object.keys(created).sort(), role).toEqual([...ALL_KEYS].sort())`; `:57-69` - `toMatchObject({ ..., status: 'active', sex: null, ..., healthNotes: null })` | PASS |
| C10 | CPF e telefones guardados e devolvidos só em dígitos | api lote exit 0 | `apps/api/test/students-create.test.ts:87` - `toMatchObject({ cpf: '52998224725', phone: '11912345678', emergencyContactPhone: '1112345678' })`; `:89-90` - `expect(stored).toContain(digits)` / `not.toContain(masked)` | PASS |
| C11 | 15 CPFs recusados no `path` `cpf`; 3 aceitos | api lote exit 0 (rota e tabela) | `apps/api/test/students-create.test.ts:112-113` - `toBe(422)`, `filter((path) => path === 'cpf')...toHaveLength(1)`; `:123` - `toBe(201)`; `apps/api/test/contracts.test.ts:265` - `toEqual(['cpf'])`; `:270` - `expect(result.data?.cpf, sent).toBe(stored)` | PASS |
| C12 | CPF de active/suspended/inactive e mascarado -> 409 `cpf_taken`, contagem igual | api lote exit 0 | `apps/api/test/students-create.test.ts:144-146` - `toBe(409)`, `code...toBe('cpf_taken')`, `studentCount...toBe(total)` | PASS |
| C13 | 10 pares concorrentes: um 201, um 409, +1 por rodada | api lote exit 0 | `apps/api/test/students-create.test.ts:161` - `expect(statuses, ...).toEqual([201, 409])`; `:164` - `toBe(total + 1)` | PASS |
| C14 | `birthDate` 6 recusas, 2 aceites, 23:30 SP com relógio controlado | api lote exit 0 | `apps/api/test/students-create.test.ts:170` - `vi.useFakeTimers({ ..., now: new Date('2026-10-05T02:30:00Z') })`; `:181-182` - `toBe(422)`, `path === 'birthDate'...toHaveLength(1)`; `:188` - `toBe(201)` para `1900-01-01` e `2026-10-04` | PASS |
| C15 | telefone 9/12 recusados, 10/11 aceitos, nos dois campos | api lote exit 0 | `apps/api/test/students-create.test.ts:208-209` - `toBe(422)`, `toContain(field)`; `:211` - `toBe(201)` | PASS |
| C16 | limites de tamanho nas duas bordas, `sex` | api lote exit 0 | `apps/api/test/students-create.test.ts:251-253` - `toBe(422)`, `toContain(field)`, contagem igual; `:260-261` - `toBe(201)`, `[field]...toBe(value)` | PASS |
| C17 | par de contato: falta nomeada | api lote exit 0 | `apps/api/test/students-create.test.ts:276` - `toBe(status)`; `:277` - `expect(await fieldErrorPaths(response), label).toEqual([missing])` | PASS |
| C18 | hr_finance e instructor: 403 `forbidden` nas 3 escritas, nada muda | api lote exit 0 | `apps/api/test/students-create.test.ts:298-301` - `toBe(403)`, `toBe('forbidden')`, contagem e `studentRowText` iguais | PASS |
| C19 | 5 rotas sem cookie: 401 `unauthorized` | api lote exit 0 | `apps/api/test/students-create.test.ts:320-321` - `toBe(401)`, `toBe('unauthorized')` | PASS |
| C20 | criação e edição guardam `v1.` sem o texto | api lote exit 0 | `apps/api/test/students-health.test.ts:36-37` - `not.toContain('losartana')`, `startsWith('v1.')).toBe(true)`; `:44-45` idem para o `PATCH` | PASS |
| C21 | mesmo texto em dois alunos, valores diferentes | api lote exit 0 | `apps/api/test/students-health.test.ts:52` - `expect(await storedHealth(first.id)).not.toBe(await storedHealth(second.id))` | PASS |
| C22 | ficha devolve o texto exato (acento, emoji, quebra, 2000) | api lote exit 0 | `apps/api/test/students-health.test.ts:61` - `toHaveLength(2000)`; `:70-71` - `toBe(200)`, `healthNotes, role).toBe(text)` | PASS |
| C23 | tag alterada, valor de outro aluno, sem prefixo -> 500 sem campos; hr_finance e lista 200 | api lote exit 0 | `apps/api/test/students-health.test.ts:101-106` - `toBe(500)`, `toBe('internal_error')`, `not.toHaveProperty(key)`, `not.toContain(mine.name)`; `:110` - hr_finance `toBe(200)`; `:112` - lista `toBe(200)`. Door 5: a falta 3 (sem AAD) morre em `valor de outro aluno admin: expected 200 to be 500` | PASS |
| C24 | chave ausente/não base64/31/33 -> exit 1 nomeando a variável; 32 sobe | api lote `test/boot.test.ts` exit 0 | `apps/api/test/boot.test.ts:190-192` - `toBe(1)`, `toContain('DATA_ENCRYPTION_KEY')`, `not.toContain(env.DATA_ENCRYPTION_KEY)`; `:210` - `/health` `toBe(503)` com 32 bytes | PASS |
| C25 | nenhum segredo no log, inclusive na falha | api lote exit 0 | `apps/api/test/students-health.test.ts:137` - `expect(failing.status).toBe(500)`; `:154` - `expect(written.includes(value), ...).toBe(false)` sobre os 11 valores de `:140-152`; captura de stdout, stderr e `console` em `apps/api/test/support/log.ts:10-16` | PASS |
| C26 | ficha de admin e reception: exatamente 12 chaves | api lote exit 0 | `apps/api/test/students-read.test.ts:43-44` - `toBe(200)`, `expect(await keysOf(response), role).toEqual(expected)` | PASS |
| C27 | hr_finance sem a chave `healthNotes` | api lote exit 0 | `apps/api/test/students-read.test.ts:53` - `Object.keys(body).sort()).toEqual([...11 chaves])`; `:68` - `expect('healthNotes' in body).toBe(false)` | PASS |
| C28 | instructor: só `id`, `name`, `status` | api lote exit 0 | `apps/api/test/students-read.test.ts:75` - `expect(await keysOf(response)).toEqual(['id', 'name', 'status'])` | PASS |
| C29 | `abc` e uuid desconhecido -> 404 `not_found` | api lote exit 0 | `apps/api/test/students-read.test.ts:82-83` - `toBe(404)`, `toBe('not_found')` | PASS |
| C30 | 8 leituras sem linha de auditoria | api lote exit 0 | `apps/api/test/students-read.test.ts:97-98` - `toBe(200)`, `auditCount...toBe(before)`; `:102` - `expect(cases).toBe(8)` | PASS |
| C31 | 55 alunos: 50 itens, 5 chaves, ordem por nome dobrado e id | api lote exit 0 | `apps/api/test/students-search.test.ts:82-84` - `toHaveLength(50)`, chaves `toEqual(['cpf', 'id', 'name', 'phone', 'status'])`, `toEqual(expected)` (falta 1 morta). Amostra só com letras da lista de `students_fold` - ver gap 3 | PASS |
| C32 | lista do instructor: 3 chaves por item | api lote exit 0 | `apps/api/test/students-search.test.ts:93` - `expect(Object.keys(item).sort()).toEqual(['id', 'name', 'status'])` | PASS |
| C33 | termos de nome dobram caixa e acento; `11 joao` só nome | api lote exit 0 | `apps/api/test/students-search.test.ts:113` - `expect(namesOf(await search(role, { q })), ...).toEqual(expected)` sobre `:104-108` | PASS |
| C34 | dígitos: CPF igual ou telefone contém; parte de CPF vazio | api lote exit 0 | `apps/api/test/students-search.test.ts:129` - `toEqual([id])`; `:131` - `q: '5299822'...toEqual([])` | PASS |
| C35 | instructor com `q` de dígitos: vazio; reception acha | api lote exit 0 | `apps/api/test/students-search.test.ts:140` - instrutor `toEqual([])`; `:141` - recepção `toEqual([id])` | PASS |
| C36 | `status` sozinho e somado a `q` | api lote exit 0 | `apps/api/test/students-search.test.ts:155-158` - `toEqual(['Ana Silva', 'Edu Souza'])` ... `toEqual(['Bia Silva'])` | PASS |
| C37 | cursor percorre 120 (40 homônimos) sem repetir nem pular, com filtros | api lote exit 0 | `apps/api/test/students-search.test.ts:182` - `expect(await walk({})).toEqual(all.map((student) => student.id))`; `:183-187` com `status` e `q` | PASS |
| C38 | `nextCursor` nulo com 50, não nulo com 51 | api lote exit 0 | `apps/api/test/students-search.test.ts:198-199` - `toHaveLength(50)`, `toBeNull()`; `:205` - `not.toBeNull()` | PASS |
| C39 | 6 parâmetros inválidos -> 422 no `path`; `q` de 100 -> 200 | api lote exit 0 | `apps/api/test/students-search.test.ts:227-229` - `toBe(422)`, `toBe('validation_failed')`, `toEqual([param])`; `:232` - `search(...)` com `expect(response.status).toBe(200)` em `:29` | PASS |
| C40 | `PATCH` 200 muda só o enviado | api lote exit 0 | `apps/api/test/students-update.test.ts:55-57` - `toBe(200)`, `toEqual({ ...before, ...change })` na resposta e no `GET` | PASS |
| C41 | `null` limpa 5 opcionais; coluna de saúde nula | api lote exit 0 | `apps/api/test/students-update.test.ts:82` - `expect(updated[field], ...).toBeNull()`; `:85` - `stored.some(... startsWith('v1.'))).toBe(false)`. Não cobre valor ilegível - ver gap 2 | PASS |
| C42 | 10 casos de 422 no `PATCH`, linha idêntica | api lote exit 0 | `apps/api/test/students-update.test.ts:110-112` - `toBe(422)`, `toContain(field)`, `studentRowText...toBe(before)` | PASS |
| C43 | regra do par conta o gravado | api lote exit 0 | `apps/api/test/students-update.test.ts:120` - `toEqual(['emergencyContactName'])`; `:125` - `toEqual(['emergencyContactPhone'])`; `:128-129` - `toBe(200)`, `toBe('1133334444')` | PASS |
| C44 | CPF de outro 409, próprio 200 | api lote exit 0 | `apps/api/test/students-update.test.ts:142-144` - `toBe(409)`, `toBe('cpf_taken')`, linha igual; `:149-150` - `toBe(200)`, `cpf).toBe(mine.cpf)` | PASS |
| C45 | `status` suspended/active de qualquer situação, 6 casos | api lote exit 0 | `apps/api/test/students-update.test.ts:163-165` - `toBe(200)`, `status...toBe(to)` na resposta e no `GET`; `:169` - `toBe(6)` | PASS |
| C46 | `status: inactive` 422 e nada aplicado | api lote exit 0 | `apps/api/test/students-update.test.ts:179-181` - `toBe(422)`, `toEqual(['status'])`, `studentRowText...toBe(before)` | PASS |
| C47 | `DELETE` 204 sem corpo, inativa, mantém a linha | api lote exit 0 | `apps/api/test/students-update.test.ts:195-198` - `toBe(204)`, `text()).toBe('')`, contagem igual, `toEqual({ ...before, status: 'inactive' })` | PASS |
| C48 | `DELETE` de inativo: linha idêntica, inclusive `updated_at` | api lote exit 0 | `apps/api/test/students-update.test.ts:210-211` - `toBe(204)`, `studentRowText...toBe(before)` (o `to_jsonb` carrega `updated_at`) | PASS |
| C49 | 10 pares de `PATCH` concorrentes somam | api lote exit 0 | `apps/api/test/students-update.test.ts:225-226` - `toEqual([200, 200])`, `toMatchObject({ phone, address })` | PASS |
| C50 | `PATCH`/`DELETE` com `abc` e uuid desconhecido -> 404 | api lote exit 0 | `apps/api/test/students-update.test.ts:237-238` - `toBe(404)`, `toBe('not_found')`; `:242` - `toBe(4)` | PASS |
| C51 | criação grava uma `student.created` com autor e alvo | api lote exit 0 | `apps/api/test/students-audit.test.ts:44-50` - `toHaveLength(1)`, `toMatchObject({ action: 'student.created', user_id: author.id, entity: 'student', entity_id: created.id })` | PASS |
| C52 | `diff` da criação com 4 campos | api lote exit 0 | `apps/api/test/students-audit.test.ts:58-61` - `toEqual({ fields: ['name', 'cpf', 'birthDate', 'phone', 'status'], values: { status: { from: null, to: 'active' } } })`. (iii): o `before` todo nulo (`students.service.ts:52`) faz `fields` listar só o não nulo - coerente com a AC 44 | PASS |
| C53 | 4 `PATCH` com uma `student.updated` cada | api lote exit 0 | `apps/api/test/students-audit.test.ts:78-85` - `toBe(200)`, `toHaveLength(1)`, `toMatchObject({ action: 'student.updated', user_id: receptionUser.id, entity: 'student', entity_id: student.id })` | PASS |
| C54 | `diff` do `PATCH` só com `status` em `values` | api lote exit 0 | `apps/api/test/students-audit.test.ts:97-100` - `toEqual({ fields: ['phone', 'healthNotes', 'status'], values: { status: { from: 'active', to: 'suspended' } } })` (falta 4 morta) | PASS |
| C55 | `PATCH` sem mudança não grava | api lote exit 0 | `apps/api/test/students-audit.test.ts:131-133` - `toBe(200)`, `auditCount...toBe(count)`, linha igual | PASS |
| C56 | `DELETE` grava `student.inactivated` com `diff` de active e de suspended | api lote exit 0 | `apps/api/test/students-audit.test.ts:144-152` - `toBe(204)`, `toHaveLength(1)`, `toMatchObject({ action: 'student.inactivated', ..., diff: { fields: ['status'], values: { status: { from, to: 'inactive' } } } })` | PASS |
| C57 | 401/403/404/409/422 e `DELETE` de inativo não gravam | api lote exit 0 | `apps/api/test/students-audit.test.ts:178` - `expect(await auditCount(stack), name).toBe(count)`; `:177` só afirma que o status está na lista - gap 6 (precisão) | PASS |
| C58 | insert de auditoria falhando: 500 e `students` intacto nas 3 rotas | api lote exit 0 | `apps/api/test/students-audit.test.ts:197-199` - `toBe(500)`, `toBe('internal_error')`, `expect(await snapshot(), name).toEqual(before)` | PASS |
| C59 | nenhum dos dez valores em `audit_logs` | api lote exit 0 | `apps/api/test/students-audit.test.ts:262` - `expect(text.includes(value), value).toBe(false)` sobre os 21 valores de `:237-259`; `:260-261` garantem que as linhas existem | PASS |
| C60 | `ip` do proxy e `user_agent` cortado em 512 ou nulo, nas 3 ações | api lote exit 0 | `apps/api/test/students-audit.test.ts:320-322` - `toHaveLength(1)`, `ip).toBe('203.0.113.7')`, `user_agent).toBe(label === 'com User-Agent' ? agent.slice(0, 512) : null)` | PASS |
| C61 | `/audit` nomeia as 3 ações; filtro com 13, novas em 11-13 | web `playwright test ... -g "...student_actions_labelled_and_filter_has_thirteen..."` exit 0 | `apps/web/e2e/audit.spec.ts:187-191` - `toEqual(['Aluno criado', 'Aluno editado', 'Aluno inativado'])`; `:194-195` - `toHaveLength(13)`, `options.slice(11)).toEqual([...])` | PASS |
| C62 | "Situação: Ativo → Suspenso", "Telefone alterado", "Situação: Inativo → Ativo" | web lote exit 0 | `apps/web/e2e/audit.spec.ts:215-218` - `getByText('Situação: Ativo → Suspenso', { exact: true })).toBeVisible()` ... `'Situação: Inativo → Ativo'` | PASS |
| C63 | "Ver aluno" leva a `/students/<id>`; `user` segue com nome | web lote exit 0 | `apps/web/e2e/audit.spec.ts:231-234` - `toHaveAttribute('href', \`/students/${studentId}\`)`; `:235` - `toHaveText('Pessoa 2')` | PASS |
| C64 | link "Alunos" para os 4 perfis | web lote exit 0 | `apps/web/e2e/shell.spec.ts:39` - `getByRole('link', { name: 'Alunos', exact: true }), role).toHaveCount(1)` | PASS |
| C65 | 4 URLs sem sessão -> `/login` | web lote exit 0 | `apps/web/e2e/students.spec.ts:65` - `await expect(page, path).toHaveURL('/login')` | PASS |
| C66 | título, 4 colunas em ordem, ordem da API, links | web lote exit 0 | `apps/web/e2e/students.spec.ts:78-85` - heading `Alunos`, `toEqual(['Nome', 'CPF', 'Telefone', 'Situação'])`, `toEqual(['Zélia', 'Ana', 'Marcos'])`, `toHaveAttribute('href', ...)` | PASS |
| C67 | instructor: só "Nome" e "Situação" | web lote exit 0 | `apps/web/e2e/students.spec.ts:97` - `toEqual(['Nome', 'Situação'])` | PASS |
| C68 | formatos de CPF, telefone, data (SP e UTC) e situação | web lote exit 0 | `apps/web/e2e/students.spec.ts:117-129` - `'529.982.247-25'`, `'(11) 91234-5678'`, `'(11) 1234-5678'`, `'Ativo'`, `'Inativo'`, `'Suspenso'`; `:132` - `getByText('01/01/2000', { exact: true })` | PASS |
| C69 | campo, filtro com 4 opções em ordem, 2 botões, acima da tabela | web lote exit 0 | `apps/web/e2e/students.spec.ts:146-150` - textbox, `toEqual(['Todas', 'Ativo', 'Inativo', 'Suspenso'])`, botões; `:154` - `expect(field!.y).toBeLessThan(table!.y)` | PASS |
| C70 | busca chega à API com `q` e `status`, URL sem o texto | web lote exit 0 | `apps/web/e2e/students.spec.ts:173-175` - `toEqual([{ q: '529.982.247-25', status: 'inactive' }])`, `page.url()).toBe(before)`, `not.toContain(text)` (falta 5 morta) | PASS |
| C71 | "Próxima página" envia `cursor` com mesmos filtros | web lote exit 0 | `apps/web/e2e/students.spec.ts:197-201` - `toEqual([{ q: 'silva', status: 'suspended' }, { ..., cursor: 'CURSOR-DA-PAGINA-1' }])`, `not.toContain('silva')` | PASS |
| C72 | "Nenhum aluno encontrado." com `q` e com só situação | web lote exit 0 | `apps/web/e2e/students.spec.ts:212-213` e `:219-220` - `getByText('Nenhum aluno encontrado.', { exact: true })).toBeVisible()`, `getByRole('table')).toHaveCount(0)` | PASS |
| C73 | "Nenhum aluno cadastrado." | web lote exit 0 | `apps/web/e2e/students.spec.ts:229-230` - `getByText('Nenhum aluno cadastrado.', { exact: true })).toBeVisible()`, tabela `toHaveCount(0)` | PASS |
| C74 | erro de carga com "Tentar novamente" na lista e na ficha | web lote exit 0 | `apps/web/e2e/students.spec.ts:241-244` - `'Não foi possível carregar os alunos.'` visível, tabela visível após o botão; `:248-251` idem na ficha | PASS |
| C75 | botões de escrita só para admin e reception, por situação | web lote exit 0 | `apps/web/e2e/students.spec.ts:279` - `toEqual(writer ? ['Novo aluno'] : [])`; `:287` - `toEqual(writer ? expected[status] : [])` | PASS |
| C76 | formulários sem permissão para hr_finance e instructor | web lote exit 0 | `apps/web/e2e/students.spec.ts:300-303` - texto visível, `textbox`/`combobox`/`Salvar` `toHaveCount(0)`; `:307` - `toBe(4)` | PASS |
| C77 | rótulos, opções de "Sexo" e "Salvar" nos 2 formulários | web lote exit 0 | `apps/web/e2e/students.spec.ts:329` - `getByLabel(label, { exact: true })).toBeVisible()`; `:331-336` - `toEqual(['', 'Feminino', 'Masculino', 'Outro'])`; `:337` - `Salvar` visível | PASS |
| C78 | salvar `/students/new` envia o `POST` e vai à ficha | web lote exit 0 | `apps/web/e2e/students.spec.ts:357` - `toHaveURL(\`/students/${created.id}\`)`; `:359-370` - `api.writes()...toEqual([{ method: 'POST', path: '/api/students', body: {...} }])` | PASS |
| C79 | `cpf_taken` junto do CPF, demais campos mantidos | web lote exit 0 | `apps/web/e2e/students.spec.ts:387-390` - `toHaveAccessibleDescription('Já existe um aluno com este CPF.')`, `toHaveValue('Nome Digitado')`...; `:396-398` na edição | PASS |
| C80 | ficha com campos devolvidos, "—" no nulo, sem rótulo ausente | web lote exit 0 | `apps/web/e2e/students.spec.ts:408-431` - `dt` e `dd` `toEqual([...])` com `'—'`; `:436` - `not.toContain('Observações de saúde')`; `:442` - `toEqual(['Situação'])` | PASS |
| C81 | botões de situação por situação | web lote exit 0 | `apps/web/e2e/students.spec.ts:459` - `toHaveCount(1)`; `:462` - `toHaveCount(0)` | PASS |
| C82 | diálogo nomeia o aluno; nada antes de confirmar; cancelar não envia | web lote exit 0 | `apps/web/e2e/students.spec.ts:480-481` - `toContainText('Joana Confirmada')`, `toHaveLength(...)`; `:486`; `:492-495` - `toEqual(['PATCH ...', 'DELETE ...'])` | PASS |
| C83 | ficha mostra a situação nova após cada mudança | web lote exit 0 | `apps/web/e2e/students.spec.ts:515` - `toHaveText('Suspenso')`; `:518` - `'Ativo'`; `:522` - `'Inativo'`; `:524-528` - corpos `{ status: 'suspended' }`, `{ status: 'active' }` | PASS |
| C84 | 404 -> "Aluno não encontrado." na ficha e na edição | web lote exit 0 | `apps/web/e2e/students.spec.ts:539` - `getByText('Aluno não encontrado.', { exact: true }), path).toBeVisible()` | PASS |
| C85 | OpenAPI: métodos e 3 parâmetros de query do schema do contrato | api lote `test/openapi.test.ts` exit 0 | `apps/api/test/openapi.test.ts:99-100` - `toEqual(['get', 'post'])`, `toEqual(['delete', 'get', 'patch'])`; `:103` - `toHaveLength(3)`; `:106-108` - `in).toBe('query')`, `required).not.toBe(true)`, `schema).toEqual(properties[parameter.name])` | PASS |
| C86 | corpos reais validam contra os schemas, 7 casos | api lote exit 0 | `apps/api/test/contracts.test.ts:302` - `toHaveLength(7)`; `:308-309` - `toBe(status)`, `parsed.success...toBe(true)` | PASS |
| C87 | `cpf_taken` 409 válido no schema de erro | api lote exit 0 | `apps/api/test/contracts.test.ts:320-324` - `toBe(409)`, `code).toBe('cpf_taken')`, `status).toBe(409)`, `application/problem+json`, `problemSchema.safeParse(body).success).toBe(true)`. Metade "o schema conhece" é vazia - gap 7 | PASS |
| C88 | `.env.example` com a chave e `openssl rand -base64 32` | repo `vitest run repo.test.ts -t "env_example_documents_data_encryption_key"` exit 0 | `tests/repo/repo.test.ts:155` - `toContain('openssl rand -base64 32')`; `:159` - `apiEnvSchema.shape.DATA_ENCRYPTION_KEY.safeParse(example).success).toBe(true)` | PASS |
| C89 | stack: reception cria pela origem `web`, `v1.` sem texto, linha `student.created` com ip e UA | stack `vitest run compose.test.ts -t "student_created_through_web_stores_ciphertext_and_audit_row"` exit 0 (11,4 s) | `tests/stack/compose.test.ts:185` - `toBe(201)`; `:191-192` - `toContain('v1.')`, `not.toContain(healthNotes)`; `:197` - `toEqual(['student.created\|203.0.113.9\|teste-aluno/1.0'])`. (ii): fora do `pnpm verify`, rodada aqui à parte | PASS |
| C90 | admin sem 2FA: 403 nas 5 rotas, lista escrita as inclui | api lote `test/enrollment.test.ts` exit 0 | `apps/api/test/enrollment.test.ts:46-47` - `toBe(403)`, `toBe('two_factor_enrollment_required')`; `:50-67` - lista com as cinco `/api/students*` | PASS |
| C91 | "Salvar" desabilitado enquanto espera, nos 2 formulários | web lote exit 0 | `apps/web/e2e/students.spec.ts:558` - `await expect(save).toBeDisabled()`; `:565` - `await expect(saveEdit).toBeDisabled()` | PASS |

## Coverage

Recomputada a partir do plano (Surface, Landing, Relations, AC 1-76), de
`apps/api/src/students/students.controller.ts`, `packages/database/src/schema.ts`,
`packages/database/migrations/0003_students.sql`, `packages/contracts/src/students.ts` e de
`AUDIT_ACTIONS`. As linhas do checks.md que conferem foram reagrupadas; as divergências estão em
`Unproven`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/students` statuses (4) | Surface; `students.controller.ts:28-35` | 200 C31 · 401 C19 · 403 C90 (único 403 possível: os 4 perfis são aceitos) · 422 C39 | - |
| `POST /api/students` statuses (5) | Surface; `students.controller.ts:37-45` | 201 C9 · 401 C19 · 403 C18 · 409 C12 · 422 C11/C14-C17 | - |
| `GET /api/students/:id` statuses (4) | Surface; `students.controller.ts:47-54` | 200 C26 · 401 C19 · 403 C90 · 404 C29 | - |
| `PATCH /api/students/:id` statuses (6) | Surface; `students.controller.ts:56-80` (inclui o 422 de `incomplete_contact`) | 200 C40 · 401 C19 · 403 C18 · 404 C50 · 409 C44 · 422 C42, C43 | - |
| `DELETE /api/students/:id` statuses (4) | Surface; `students.controller.ts:82-87` | 204 C47 · 401 C19 · 403 C18 · 404 C50 | - |
| `500` fora da Surface (4) | Flow; `ProblemFilter` | GET ficha C23 · POST/PATCH/DELETE C58 | - |
| perfis por rota (5 rotas x 4) | `@Roles` em `students.controller.ts:29,38,48,57,83` | GET lista C31/C32 · GET ficha C26-C28 · POST C9/C18 · PATCH C40/C18 · DELETE C47/C18 | - |
| colunas de `students` (14) | `0003_students.sql:9-22` | `id` C2 · `name`/`cpf`/`birth_date`/`phone` C9, C10 · `sex`/`email`/`address`/`emergency_*` C16, C40, C41 · `health_notes_enc` C20, C41 · `status` C2, C3 · `created_at` sem afirmação própria (default do banco, não decidido pelo plano) · `updated_at` C48 | - |
| constraints de `students` (4) | `0003_students.sql:9,20,23-24` | PK com `uuidv7()` C2 · `DEFAULT 'active'` C2 · `UNIQUE(cpf)` C4 · `CHECK status` C3 | - |
| colunas ausentes (3) | Landing door 1, Relations | `deleted_at`, `guardian_id`, `tenant_id` C1; FK nenhuma C1 | - |
| campos do corpo do `POST` (10) | `contracts/src/students.ts:82-94` | `name` C16 · `cpf` C11 · `birthDate` C14 · `phone` C15 · `sex` C16 · `email` C16 · `address` C16 · `emergencyContactName` C16/C17 · `emergencyContactPhone` C15/C17 · `healthNotes` C16/C20 | - |
| campos do corpo do `PATCH` (11) | `contracts/src/students.ts:119-131` | os 11 da linha do checks.md: C40-C46 | - |
| chaves da resposta do aluno (12) | `contracts/src/students.ts:138-151` | C9, C26 (12) · C27 (11) · C28 (3) | - |
| chaves do item da lista (5) | `contracts/src/students.ts:155-161` | C31 (5) · C32 (3) | - |
| parâmetros de query (3) | `contracts/src/students.ts:198-213` | `q` C33-C35, C39 · `status` C36, C39 · `cursor` C37-C39 · documento C85 | - |
| `AUDIT_ACTIONS` (13) | `packages/contracts/src/audit.ts` | C7, tabela sobre os 13; rótulos na tela C61 | - |
| ações de aluno: quem grava, `diff`, origem (3 x 3) | Landing door 3; `students.service.ts:109-115,177,195-201` | created C51/C52/C60 · updated C53/C54/C60 · inactivated C56/C60 | - |
| one-way doors (5, não 4) | Landing | door 1 C1-C4, C12 · door 2 C5, C6, C20 · door 3 C7, C52, C54, C56 · door 4 C27, C28, C32 · door 5 (AAD = `id` da linha) C23, falta 3 morta | door 5 no `PATCH`: o AAD é o `:id` da URL (`students.service.ts:170`), não o `id` da linha; com o id em maiúsculas a ficha passa a responder `500` (sonda A) - gap 1 |
| `null` limpa opcional no `PATCH` (5 campos x estado gravado) | AC 33 | `sex`, `email`, `address`, par de contato C41 · `healthNotes` com valor legível C41 | `healthNotes: null` com valor guardado ilegível: responde `null` e não limpa a coluna (sonda B) - gap 2 |
| dobra de caixa e acento na busca e na ordem (AC 23, AC 25) | AC 23, AC 25; `0003_students.sql:3-7` | letras da lista de `translate` (á, Â, ã, É, Í, Ó, Ú, Ç, Ñ, ...) C31, C33 | letras acentuadas fora da lista (ø, ř, ş, ý, å e afins): não dobram, `q=soren`/`cavus`/`aberg` devolvem 0 (sonda C) - gap 3 |
| caminhos de `q` (4) | `students.service.ts:248-262` | só letras C33 · letras e dígitos C33 · só dígitos C34 · só dígitos sem contato C35 | - |
| valores fora do log (5) e fora de `audit_logs` (10) | AC 17, AC 51 | C25 (11 valores), C59 (21 valores) | - |
| ACs 1-76 -> C(n+8) | plano, Criteria | 76 de 76 com check de mesma numeração (C38 cobre AC 29 e AC 30) | - |
| telas e estados de `Observable` (lista, ficha, formulários, `/audit`, menu) | Observable | as linhas do checks.md conferem: C61-C84, C91 | - |
| startup config: `DATA_ENCRYPTION_KEY` (5 lugares) | cada assembly aberta | `apps/api/src/env.ts:12` - `DATA_ENCRYPTION_KEY: z.string().refine(isDataKey)` (C24) · `apps/api/src/app.module.ts:61` - `new ColumnCipher(env.DATA_ENCRYPTION_KEY)` · `apps/api/test/support/app.ts:13,32` - chave fixa passada a `AppModule.register` (todas as provas de API) · `.env.example:25` (C88) · `compose.yaml:47` - `DATA_ENCRYPTION_KEY: ${DATA_ENCRYPTION_KEY:?}` (C89) | - |
| startup config: migração `0003` (3 assemblies) | cada assembly | banco de `packages/database` migrado por `pnpm db:migrate` (`packages/database/test/students.test.ts:17-23`, C1) · harness de `apps/api` (C9) · serviço `migrate` de `compose.yaml:25-35`, de que a `api` depende (C89) | - |
| startup config: `trust proxy` (2 assemblies) | `apps/api/src/configure-app.ts:20` - `set('trust proxy', 1)`, chamado por `apps/api/test/support/app.ts:37` e pelo processo real | harness C60 · stack C89 (`ip` `203.0.113.9`) | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, alcançado por HTTP | `students.service.ts`, `students.view.ts`, `contracts/src/students.ts` (validação, cursor) | fronteira HTTP com Postgres real, `students` e `audit_logs` por SQL: C9-C19, C26-C60 | no - gap: três linhas da tabela de decisão sem caso e com defeito - contexto do AAD no `PATCH` (`students.service.ts:170`), `null` sobre valor ilegível (`:290-295`, `:154-155`), letras fora da dobra (`0003_students.sql:3-7`); demais linhas com as duas bordas e contagem/linha antes e depois |
| Decide, com ramos que a rota não separa | `crypto.ts`, dígito verificador em `contracts/src/students.ts:28-37` | fronteira C11, C23; próprio nível `cpf_check_digit_table`, C5, C6 (e `decrypt_rejects_a_value_from_another_row`, existente, sem check) | yes |
| Restrição do banco | `0003_students.sql` | banco migrado por `pnpm db:migrate`: C1-C4 | yes - 3 aceitos e 3 recusados no `CHECK`, `UNIQUE` em 3 situações, 2 `DEFAULT` |
| Tela | `apps/web/src/app/students/*`, `apps/web/src/lib/audit.ts`, `shell.tsx` | Playwright contra `FakeApi`: C61-C84, C91 | no - gap: o corpo do `PATCH` enviado pelo formulário de edição (`student-form.tsx:89`) não é afirmado em nenhum teste; estados e textos literais atendidos |
| Instrumentação | controller, `ACTION_LABELS`, formatadores do web | nenhuma própria | yes - cobertos por C9-C60 (controller), C61 (rótulos), C68 (formatadores) |

## Faults injected

Worktree descartável em `HEAD` (`git worktree add <scratchpad>/wt HEAD`, `pnpm install --offline`).
Baseline da árvore real antes: `?? CLAUDE.md`. Depois de remover o worktree: `?? CLAUDE.md`,
idêntico (`diff` sem saída). Cada mutante foi revertido (`git checkout -- .`) antes do seguinte.

| Mutation | Location | Killed |
| --- | --- | --- |
| desempate da ordem por `id` invertido: `.orderBy(folded collate "C", students.id)` -> `..., sql\`id desc\`` (cursor e ordem) | `apps/api/src/students/students.service.ts:236` | yes - C31 `list_50_sorted_by_folded_name_then_id`: `admin: expected [...] to deeply equal [ Array(50) ]` |
| corte por perfil devolve `healthNotes: null` em vez de remover a chave | `apps/api/src/students/students.view.ts:17` | yes - C27 `ficha_hr_finance_without_health_notes_key`: 12 chaves contra 11 |
| AAD removido da cifra e da decifra (`setAAD`) | `apps/api/src/crypto.ts:31`, `:47` | yes - C23 `unreadable_stored_value_500_without_student_fields`: `valor de outro aluno admin: expected 200 to be 500` |
| `phone` passa a campo registrável (`REGISTRABLE = ['status', 'phone']`) | `apps/api/src/students/students.service.ts:20` | yes - C54 `diff_of_patch_values_only_status`: `values` com `phone` |
| a busca grava `?q=...&status=...` no endereço (`history.replaceState`) | `apps/web/src/app/students/students-list.tsx:49` | yes - C70 `search_sends_q_without_putting_it_in_the_url`: URL recebida `/students?q=529.982.247-25&status=inactive` |

### Sondas (observação, sem mutação, sobre o código de HEAD no mesmo worktree)

Arquivo temporário `apps/api/test/zz-probe.test.ts`, só no worktree, descartado com ele:

- A: `PATCH /api/students/<id em maiúsculas>` `{"healthNotes":"Probe text"}` -> `200`; `GET /api/students/<id>` -> `500`.
- B: valor guardado trocado por `lixo-ilegivel`; `PATCH {"healthNotes": null}` -> `200` com `healthNotes: null`; coluna depois: `lixo-ilegivel`; `GET` -> `500`; `PATCH {"phone": ...}` -> `500`.
- C: `q=soren` 0, `dvorak` 0, `cavus` 0, `yrsa` 0, `aberg` 0; `q=søren` 1, `çavuş` 1.

### Pontos de atenção do pedido

- (i) door 5 / AD-034: plano (Flow linha 39, Landing door 5), `STATE.md` AD-034 e `crypto.ts:28-50` concordam na criação e na leitura (`students.service.ts:101-106`, `:283`); C23 prova a door (falta 3 morta exatamente no caso "valor de outro aluno"). Discorda na edição: `:170` usa o `id` da URL - gap 1.
- (ii) C89 roda só em `tests/stack`, que o `pnpm verify` não executa; rodada aqui, verde. Uma regressão na montagem do compose não quebra o gate do autor.
- (iii) `fields` da criação: `diffOf(NOTHING, ...)` com `before` todo nulo lista só os campos não nulos e grava `status` de `null` para `active` - igual à AC 44 e a C52.
- (iv) `students_fold`: dobra caixa e acento só das 46 letras da lista - gap 3.
- (v) `q` só de dígitos para `instructor`: `students.service.ts:251-252` devolve lista vazia sem consultar (`'nothing'`), provado por C35.
- (vi) `PATCH` com `healthNotes` sobre observação ilegível: com texto, substitui (conta como mudança); com `null` sem outro campo, não limpa (gap 2); sem `healthNotes`, qualquer edição responde `500` - nenhum check decide.

### Swept existing

- guarda global AD-022: `apps/api/src/app.module.ts:76` - `{ provide: APP_GUARD, useClass: AccessGuard }`; `apps/api/src/access.ts:130-133` - `two_factor_enrollment_required`. Rodados: `guard_matrix_three_declarations_five_callers` (`apps/api/test/access.test.ts:49`) e `admin_without_2fa_gets_403_everywhere_else` (`apps/api/test/enrollment.test.ts:36`) verdes.
- `unhandled_500_hides_exception` (`apps/api/test/problem.test.ts:31`) existe e passou.

### Passo 5

n/a - sem humano na sessão.

## Gate

Provas rodadas em `da2c543`, em lote por alvo:

- `pnpm --filter "./apps/api" exec vitest run test/boot.test.ts test/contracts.test.ts test/crypto.test.ts test/enrollment.test.ts test/openapi.test.ts test/students-audit.test.ts test/students-create.test.ts test/students-health.test.ts test/students-read.test.ts test/students-search.test.ts test/students-update.test.ts -t "<61 nomes>" --reporter=verbose` - exit 0, 61 passed, 18 skipped (fora do filtro), 0 failed
- `pnpm --filter "./packages/database" exec vitest run test/students.test.ts -t "<4 nomes>" --reporter=verbose` - exit 0, 4 passed
- `pnpm --filter "./tests/repo" exec vitest run repo.test.ts -t "env_example_documents_data_encryption_key" --reporter=verbose` - exit 0, 1 passed
- `pnpm --filter "./apps/web" exec playwright test e2e/students.spec.ts e2e/audit.spec.ts e2e/shell.spec.ts -g "<25 nomes>" --reporter=list` - exit 0, 25 passed
- `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "student_created_through_web_stores_ciphertext_and_audit_row" --reporter=verbose` - exit 0, 1 passed
- swept: `vitest run test/access.test.ts test/problem.test.ts -t "guard_matrix_three_declarations_five_callers|unhandled_500_hides_exception"` - exit 0, 2 passed

Total: 94 testes nomeados, 94 passed, 0 failed. O veredito é FAIL pelos gaps 1-5, não por prova vermelha.
