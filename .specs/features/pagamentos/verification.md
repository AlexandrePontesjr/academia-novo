# Pagamentos verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 3e32475..d6cedcd
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Os 74 checks foram rodados por este Verifier no HEAD `d6cedcd` (confirmado por `git rev-parse HEAD`), em invocações em lote por alvo; cada teste nomeado (75 nomes: a C67 tem duas provas) apareceu individualmente na saída como executado e verde, e cada nome foi achado na árvore com o `file:line` abaixo. O plano não marca nenhuma fonte como binding (`Sources` lista o PRD, o `STATE.md`, a decisão do usuário e o molde de `planos-matriculas`, nenhum como binding), então não há `## Binding sources`: o passo 1 é do profile `ui` e não roda aqui. Nenhum check falhou, os 5 mutantes morreram, nenhum membro de conjunto ficou sem prova e a linha nova de `Test policy` foi atendida. As lacunas de precisão encontradas, que não derrubam check nenhum, estão em `## Observations`.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C60 | `payments` com exatamente 4 colunas, sem as 7 proibidas, FK única `NO ACTION`, sem `CHECK`, padrões | `vitest run test/payments.test.ts` (database) exit 0 | `packages/database/test/payments.test.ts:102` - `toEqual([['id','uuid','NO'],['enrollment_id','uuid','NO'],['created_at','timestamp with time zone','NO'],['voided_at','timestamp with time zone','YES']])`; `:110` `not.toContain(absent)` nas 7; `:114` FK `delete_rule: 'NO ACTION'`; `:118` `contype = 'c'` `toEqual([])`; `:130-133` v7, `created_at` entre T0 e T1, `voided_at` nulo | PASS |
| C61 | únicos são só a PK e `payments_one_alive_idx` parcial em `voided_at IS NULL` | idem, exit 0 | `packages/database/test/payments.test.ts:142` - `toEqual([['payments_pkey', true], ['payments_one_alive_idx', false]])`; `:149` `toMatch(/WHERE \(?voided_at IS NULL\)?/)`; `:155` restrições `toEqual(['p'])` | PASS |
| C62 | `0009` é a 10a entrada, sem `0010`; só cria `payments`, preserva linhas, colunas e extensões; 2a execução idempotente | idem, exit 0 | `packages/database/test/payments.test.ts:162` - `journal.entries toHaveLength(10)`; `:164` arquivos `0010` `toEqual([])`; `:223` tabelas `toEqual([...tablesBefore, 'payments'].sort())`; `:225-227` extensões, colunas e linhas iguais; `:232-233` segunda execução repete `onlyPaymentsAdded` | PASS |
| C63 | `AUDIT_ACTIONS` com 38, as duas de pagamento por último; antigas somem; `ACTION_LABELS` com os dois rótulos | `vitest run test/contracts.test.ts` (api) exit 0 | `apps/api/test/contracts.test.ts:994` - `AUDIT_ACTIONS.slice(36) toEqual(['student.payment_confirmed', 'student.payment_undone'])` com `toHaveLength(38)` em `:983`; rótulos: `apps/web/e2e/audit.spec.ts:918` `options.slice(36) toEqual(['Pagamento confirmado','Pagamento desfeito'])` e `apps/web/src/lib/audit.ts:27` `Record<AuditAction, string>` (tsc do web exit 0 recusa chave a mais); nenhuma ocorrência de `payment_registered`/`payment_voided` na árvore (`grep` vazio) | PASS |
| C64 | as 38 ações aparecem em `audit_logs`; as de pagamento com `entity` `student` e o id do aluno | `vitest run test/audit-auth.test.ts` exit 0 | `apps/api/test/audit-auth.test.ts:358` - `expect(written).toEqual([...auditActionSchema.options].sort())` com `:356` `toHaveLength(38)`; `:393` `toEqual(ofAction.map(() => ['student', enrolledId]))` nas duas de `:389` | PASS |
| C65 | schemas aceitam e recusam conforme a Surface | `vitest run test/contracts.test.ts` exit 0 | `apps/api/test/contracts.test.ts:1068` - `toBe('enrollmentId')` para `undefined`, `null`, `'abc'`, `123`; `:1103` e `:1113` `paidCents`/`balanceCents`/`payments` recusados nos dois schemas; `:1120` `paid`, `cancelled`, `''` `toBe('status')` | PASS |
| C66 | conta única: `dueDate = startsAt` e `status` nas 15 linhas escritas à mão | `vitest run test/payments.test.ts` (contracts) exit 0 | `packages/contracts/test/payments.test.ts:35` - `expect(paymentStatus(period, payments, on), label).toEqual({ dueDate: '2026-10-07', status })` sobre as 15 linhas de `:16-31`, `:33` `toHaveLength(15)`; viradas em `:28-29` (`02:59:59Z` `pending`, `03:00:00Z` `overdue`) | PASS |
| C1 | `POST` 201 por `admin` e `hr_finance`, 3 chaves, `id` da única linha, `createdAt` do banco, `voided_at` nulo | `vitest run test/payments-write.test.ts` exit 0 | `apps/api/test/payments-write.test.ts:79` - `toBe(201)`; `:80` chaves `toEqual(['createdAt','enrollmentId','id'])`; `:82` `toEqual([{ id: body.id }])`; `:86-87` entre `t0` e `t1` de `databaseNow`; `:88` `toMatchObject({ ..., voided_at: null })` | PASS |
| C2 | 6 `enrollmentId` inválidos dão 422 `validation_failed` em `enrollmentId`, nada gravado | idem | `apps/api/test/payments-write.test.ts:110` - `toBe(422)`; `:111` `toBe('validation_failed')`; `:112` `toEqual(['enrollmentId'])`; `:113` `paymentSnapshot` igual; `:103` 6 casos | PASS |
| C3 | período cancelado dá 409 `enrollment_cancelled` nos 3 casos, inclusive com confirmação viva | idem | `apps/api/test/payments-write.test.ts:134` - `toBe(409)`; `:135` `toBe('enrollment_cancelled')`; `:136` snapshot igual; caso de precedência montado em `:122-123` | PASS |
| C4 | já confirmado dá 409 `payment_already_confirmed` nos 3 casos | idem | `apps/api/test/payments-write.test.ts:159` - `toBe(409)`; `:160` `toBe('payment_already_confirmed')`; `:161` snapshot igual | PASS |
| C5 | agendado, ativo e vencido aceitos com 201 | idem | `apps/api/test/payments-write.test.ts:177` - `toBe(201)` nos 3; `:178` 3 chaves; `:179` `enrollmentId` | PASS |
| C6 | aluno `inactive` e `suspended` aceitos como `active` | idem | `apps/api/test/payments-write.test.ts:190` - `toBe(201)` para `active`, `inactive`, `suspended`; `:192` situação do aluno conferida no banco | PASS |
| C7 | dois `POST` juntos: um 201, um 409, 1 viva, 1 linha de trilha, 10 rodadas | idem | `apps/api/test/payments-write.test.ts:207` - `toEqual([201, 409])`; `:209` `payment_already_confirmed`; `:210` `aliveCountOf toBe(1)`; `:212` `student.payment_confirmed` `toHaveLength(1)` | PASS |
| C8 | `INSERT` com período inexistente falha `23503` sem gravar | `vitest run test/payments.test.ts` (database) | `packages/database/test/payments.test.ts:243` - `failure.code toBe('23503')`; `:244` `count()` igual | PASS |
| C9 | 2a viva falha `23505` no índice; desfeitas não contam | idem | `packages/database/test/payments.test.ts:254-256` - `toBe('23505')`, `constraint toBe('payments_one_alive_idx')`, contagem igual; `:263` 1 viva ao lado de 2 desfeitas; `:270` viva aceita sobre só desfeitas | PASS |
| C10 | `:id` não-uuid e de aluno nenhum dão 404 `not_found` nas 3 rotas; `POST` de aluno nenhum com período válido é 404 | `vitest run test/payments-write.test.ts` | `apps/api/test/payments-write.test.ts:233` - `toBe(404)`; `:234` `toBe('not_found')`; `:240` `cases toBe(6)`; o `POST` leva `paymentBody(existing.enrollmentId)` em `:225` | PASS |
| C11 | `reception` e `instructor`: 16 casos 403 `forbidden`, sem chaves de pagamento, nada gravado | idem | `apps/api/test/payments-write.test.ts:262` - `toHaveLength(16)`; `:272` `toBe(403)`; `:273` `toBe('forbidden')`; `:274` nenhuma de `PAYMENT_DATA_KEYS`; `:275` snapshot igual | PASS |
| C12 | as 4 rotas sem sessão dão 401 `unauthorized`, nada gravado | idem | `apps/api/test/payments-write.test.ts:298` - `toBe(401)`; `:299` `toBe('unauthorized')`; `:300` snapshot igual; `:291` 4 rotas | PASS |
| C13 | `DELETE` 204, `voided_at` do banco entre T0 e T1, linha mantida, resto idêntico | idem | `apps/api/test/payments-write.test.ts:318` - `toBe(204)`; `:321-322` `voidedAt` entre `t0` e `t1`; `:324` `paymentRowWithoutVoidedAt toBe(before)` | PASS |
| C14 | desfazer o já desfeito: 204 e linha idêntica | idem | `apps/api/test/payments-write.test.ts:336` - `toBe(204)`; `:337` `paymentRowText toBe(before)` (inclui o `voided_at` original); `:338` snapshot igual | PASS |
| C15 | depois de desfazer, novo `POST` 201 com outro `id`, 2 linhas, só a nova viva | idem | `apps/api/test/payments-write.test.ts:350-351` - `toBe(201)`, `not.toBe(first.id)`; `:353` linha desfeita idêntica; `:354` `toHaveLength(2)`; `:355` vivas `toEqual([{ id: second.id }])` | PASS |
| C16 | desfazer em período cancelado: 204 e `voided_at` preenchido | idem | `apps/api/test/payments-write.test.ts:362` cancelamento pela rota de matrícula `toBe(204)`; `:370` `toBe(204)`; `:372-373` `voidedAt` entre `t0` e `t1` | PASS |
| C17 | `:paymentId` não-uuid, de ninguém e de outro aluno: 404 `not_found`; o do outro segue vivo | idem | `apps/api/test/payments-write.test.ts:392-393` - `toBe(404)`, `toBe('not_found')`; `:397` `voided_at toBeNull()` | PASS |
| C18 | dois `DELETE` juntos: 204 e 204, um `voided_at`, uma linha de trilha, 10 rodadas | idem | `apps/api/test/payments-write.test.ts:412` - `toEqual([204, 204])`; `:414` `count(voided_at) toBe(1)`; `:415` `student.payment_undone` `toHaveLength(1)` | PASS |
| C19 | ficha 200 por `admin` e `hr_finance`, 8 chaves, ordem `startsAt` desc e `enrollmentId` desc nos dois sentidos | `vitest run test/payments-read.test.ts` exit 0 | `apps/api/test/payments-read.test.ts:99` - chaves `toEqual(FICHA_KEYS)`; `:100` `plan` `['id','name','period']`; `:103` `toEqual([december, tieFirst, tieSecond, august])`; `:111` o par inserido no outro sentido | PASS |
| C20 | `dueDate = startsAt`, 4 situações, virada em `02:59:59Z`/`03:00:00Z`, ler não muda linha | idem | `apps/api/test/payments-read.test.ts:135-137` - `status`, `dueDate`, `dueDate toBe(startsAt)`; `:142` `toBe('pending')` em `02:59:59Z`; `:144` `toBe('overdue')` em `03:00:00Z`; `:147` snapshot igual | PASS |
| C21 | `payment` com `id` e `createdAt` da viva, `null` sem viva e com só desfeita; a nova depois de refazer | idem | `apps/api/test/payments-read.test.ts:156-157` - `toBeNull()`; `:159` `toEqual(['createdAt', 'id'])`; `:160-161` `id` e `createdAt` do `POST`; `:168` `toBe(second.id)` | PASS |
| C22 | aluno sem período: 200 `items: []` | idem | `apps/api/test/payments-read.test.ts:176-177` - `toBe(200)`, `toEqual({ items: [] })` | PASS |
| C23 | nome atual do plano e preço gravado no período | idem | `apps/api/test/payments-read.test.ts:188` - `plan toEqual({ id: plan, name: 'Mensal Novo', period: 'monthly' })`; `:189` `priceCents toBe(9990)` | PASS |
| C24 | confirmado e cancelado mantém `payment` e diz `cancelled` | idem | `apps/api/test/payments-read.test.ts:199-200` - `toBe('cancelled')`, `payment.id toBe(payment.id)` | PASS |
| C25 | lista geral 200, 8 chaves, aluno de qualquer situação, ordem `dueDate` asc e `enrollmentId` asc | idem | `apps/api/test/payments-read.test.ts:218` - chaves `toEqual(OPEN_KEYS)`; `:219-220` `student` só `id` e `name`; `:223` `toEqual([older, tieFirst, tieSecond, newer])`; `:224-225` `dueDate` e `status` escritos à mão | PASS |
| C26 | `?status=pending`/`overdue` em `NOON`, `02:59:59Z` e `03:00:00Z` | idem | `apps/api/test/payments-read.test.ts:237-238` (NOON); `:242-243` (`02:59:59Z`: 07 em `pending`); `:247` `toEqual([d08])` e `:248` `toEqual([d06, d07])` em `03:00:00Z` | PASS |
| C27 | 8 valores de `status` dão 422 `validation_failed` com um só erro em `status`, sem `items` | idem | `apps/api/test/payments-read.test.ts:262` - `toHaveLength(8)`; `:268` `toBe(422)`; `:269` `validation_failed`; `:270` `toEqual(['status'])`; `:271` `not.toContain('items')` | PASS |
| C28 | sai cancelado, cancelado com viva e com viva; fica a só desfeita; confirmar tira e desfazer devolve | idem | `apps/api/test/payments-read.test.ts:283` - `toEqual([undone, toggled].sort())`; `:287` `toEqual([undone])`; `:289` volta a `[undone, toggled]` | PASS |
| C29 | nada por pagar: 200 `items: []` | idem | `apps/api/test/payments-read.test.ts:299-300` - `toBe(200)`, `toEqual({ items: [] })` | PASS |
| C30 | lista e ficha concordam nos 3 instantes | idem | `apps/api/test/payments-read.test.ts:313` - `onList.status toBe(onFicha.status)`; `:314` `pending`, `pending`, `overdue` escritos à mão | PASS |
| C31 | 8 leituras 200 não gravam trilha | idem | `apps/api/test/payments-read.test.ts:336-337` - `insertedAudit toBe(before)` e `auditCount toBe(before)` depois das 8 leituras de `:324-334` | PASS |
| C32 | `POST` 201 grava 1 linha `student.payment_confirmed` com autor, `student` e id do aluno | `vitest run test/payments-audit.test.ts` exit 0 | `apps/api/test/payments-audit.test.ts:58` - `toHaveLength(1)`; `:59-64` `toMatchObject({ action: 'student.payment_confirmed', user_id: author.id, entity: 'student', entity_id: studentId })` | PASS |
| C33 | `diff` da confirmação exato, nos dois períodos | idem | `apps/api/test/payments-audit.test.ts:75-78` - `toEqual({ fields: ['startsAt','priceCents'], values: { startsAt: { from: null, to: '2026-10-07' }, priceCents: { from: null, to: 9990 } } })`; `:79-82` o de `2026-12-01` e `15000` | PASS |
| C34 | `DELETE` grava 1 linha `student.payment_undone` com `diff` de `to` nulo | idem | `apps/api/test/payments-audit.test.ts:96` - `toHaveLength(1)`; `:97-106` `toMatchObject({ action: 'student.payment_undone', user_id, entity: 'student', entity_id, diff: { fields: [...], values: { startsAt: { from: '2026-10-07', to: null }, priceCents: { from: 9990, to: null } } } })` | PASS |
| C35 | 10 desfechos sem trilha | idem | `apps/api/test/payments-audit.test.ts:133` - `toHaveLength(10)`; `:140` status esperado; `:141` `auditCount toBe(before)` | PASS |
| C36 | insert de trilha falhando: 500 e nada gravado no `POST` e no `DELETE` | idem | `apps/api/test/payments-audit.test.ts:159-161` - `toBe(500)`, `internal_error`, snapshot igual; `:164` sem linha nova; `:165` `voided_at toBeNull()` | PASS |
| C37 | `ip` e `user_agent` nos 4 casos das 2 ações | idem | `apps/api/test/payments-audit.test.ts:231` - `ip toBe('203.0.113.7')`; `:232` `user_agent toBe(userAgent)` (`teste/1.0`, os 512 primeiros, `null`), 4 variantes x 2 ações | PASS |
| C38 | nome e CPF fora das linhas de trilha | idem | `apps/api/test/payments-audit.test.ts:245` - as duas ações presentes; `:249` `secrets.filter(...) toEqual([])` (nome, partes, CPF cru e formatado) | PASS |
| C39 | link "Pagamentos" só para `admin` e `hr_finance` | `playwright test e2e/shell.spec.ts` exit 0 | `apps/web/e2e/shell.spec.ts:114` - `toHaveCount(expected ? 1 : 0)` sobre `{admin: true, reception: false, hr_finance: true, instructor: false}`; `:116` `href` `/payments` | PASS |
| C40 | sem sessão `/payments` vai para `/login` | `playwright test e2e/payments.spec.ts` exit 0 | `apps/web/e2e/payments.spec.ts:28` - `toHaveURL('/login')`; `:29` nenhuma chamada a `/api/payments` | PASS |
| C41 | `reception`/`instructor`: mensagem de permissão, sem dado, sem chamada | idem | `apps/web/e2e/payments.spec.ts:44` - texto de permissão visível; `:47` `not.toContain(secret)`; `:50` `openPaymentRequests toHaveLength(0)` | PASS |
| C42 | título, opções de "Situação", 6 colunas, ordem da API | idem | `apps/web/e2e/payments.spec.ts:69` - `toEqual(['Todas', 'Pendente', 'Atrasado'])`; `:70-77` as 6 colunas; `:78` `toEqual(['Carla', 'Ana', 'Bruno'])` | PASS |
| C43 | formatos da linha | idem | `apps/web/e2e/payments.spec.ts:102` - `href` `/students/${id}`; `:103` `'Mensal Plus · Mensal'`; `:104` `'07/10/2026 a 06/11/2026'`; `:105` `'07/10/2026'`; `:106` `'R$ 1.234,56'`; `:107` `['Atrasado', 'Pendente']` | PASS |
| C44 | escolher carrega a URL e a query certas; "Todas" tira a query | idem | `apps/web/e2e/payments.spec.ts:119-120` - `toHaveURL('/payments?status=pending')`, `lastQuery toBe('status=pending')`; `:125-126` `overdue`; `:131-132` `/payments` e `''` | PASS |
| C45 | estado vazio no lugar da tabela | idem | `apps/web/e2e/payments.spec.ts:147-148` - texto vazio visível e `table toHaveCount(0)` | PASS |
| C46 | erro com "Tentar novamente" e retorno da tabela | idem | `apps/web/e2e/payments.spec.ts:161` mensagem; `:163` botão; `:169` `table toBeVisible()` depois do clique | PASS |
| C47 | bloco da ficha: 4 colunas, formatos, 4 situações, 1 `GET` | `playwright test e2e/student-payments.spec.ts` exit 0 | `apps/web/e2e/student-payments.spec.ts:60-65` colunas; `:66-72` período e "Pagar até"; `:73` `toEqual(['R$ 99,90', 'R$ 249,90', 'R$ 89,90', 'R$ 0,00'])`; `:76` os 4 rótulos; `:78` `gets(api) toHaveLength(1)` | PASS |
| C48 | "Nenhum período para cobrar." | idem | `apps/web/e2e/student-payments.spec.ts:88-89` - texto visível e `table toHaveCount(0)` | PASS |
| C49 | erro do bloco mantém o resto da ficha | idem | `apps/web/e2e/student-payments.spec.ts:101` mensagem; `:103` botão; `:106-107` nome e região "Matrículas" visíveis | PASS |
| C50 | `reception`/`instructor`: sem bloco e sem chamada | idem | `apps/web/e2e/student-payments.spec.ts:123` `block toHaveCount(0)`; `:124` `studentPaymentRequests toHaveLength(0)` | PASS |
| C51 | "Confirmar pagamento" só em `pending` e `overdue` | idem | `apps/web/e2e/student-payments.spec.ts:144-147` - `toHaveCount(count)` com `[1, 1, 0, 0]` para `pending`, `overdue`, `paid`, `cancelled` | PASS |
| C52 | diálogo nomeia aluno, período e valor; só envia depois de "Confirmar"; corpo só `enrollmentId` | idem | `apps/web/e2e/student-payments.spec.ts:161-162` textos; `:165` e `:170` `writes toHaveLength(0)`; `:176` `toEqual(['POST ' + ROUTE])`; `:177` `body toEqual({ enrollmentId })` | PASS |
| C53 | depois do 201: fecha, "Pago", troca de botão | idem | `apps/web/e2e/student-payments.spec.ts:187-190` - diálogo `toHaveCount(0)`, "Pago" visível, "Confirmar pagamento" 0, "Desfazer pagamento" 1 | PASS |
| C54 | mensagens dos dois 409, diálogo aberto | idem | `apps/web/e2e/student-payments.spec.ts:207` - mensagem por código visível; `:208` `dialog toBeVisible()` | PASS |
| C55 | "Desfazer pagamento" só com confirmação viva, inclusive cancelado | idem | `apps/web/e2e/student-payments.spec.ts:230-233` - `[1, 1, 0, 0]`; `:236` "Matrícula cancelada" na linha com viva | PASS |
| C56 | diálogo de desfazer, `DELETE` só depois, volta a "Pendente" ou "Atrasado" | idem | `apps/web/e2e/student-payments.spec.ts:256-257` textos; `:259` sem escrita; `:271` "Pendente"; `:272` `toEqual(['DELETE ' + ROUTE + '/' + paymentId])`; `:278` "Atrasado" | PASS |
| C72 | reabrir a URL mantém a escolha | `playwright test e2e/payments.spec.ts` | `apps/web/e2e/payments.spec.ts:183` - `option:checked toHaveText(chosen)` para `overdue`, `pending` e sem query | PASS |
| C73 | botões desabilitados enquanto aguarda, uma requisição | `playwright test e2e/student-payments.spec.ts` | `apps/web/e2e/student-payments.spec.ts:292` `toBeDisabled()`; `:296` `toEqual(['POST'])`; `:304` `toBeDisabled()`; `:308` `toEqual(['DELETE'])` | PASS |
| C74 | nome com marcação como texto na lista e nos 2 diálogos | idem | `apps/web/e2e/student-payments.spec.ts:316-317` - `toHaveText([name])`, `tbody b toHaveCount(0)`; `:323-324` e `:328-329` nos dois diálogos | PASS |
| C57 | 38 opções, as 2 novas nas posições 37 e 38 | `playwright test e2e/audit.spec.ts` exit 0 | `apps/web/e2e/audit.spec.ts:913` - `options toHaveLength(38)`; `:918` `options.slice(36) toEqual(PAYMENT_LABELS)` | PASS |
| C58 | detalhes da confirmação e "Ver aluno" | idem | `apps/web/e2e/audit.spec.ts:935` - `toEqual(['Início: — → 07/10/2026', 'Valor: — → R$ 99,90'])`; `:937-938` link "Ver aluno" com `href` da ficha | PASS |
| C59 | detalhes do desfazimento | idem | `apps/web/e2e/audit.spec.ts:953` - `toEqual(['Início: 07/10/2026 → —', 'Valor: R$ 99,90 → —'])` | PASS |
| C67 | OpenAPI documenta as 4 rotas, o corpo do `POST` e o `status` da query vindos dos schemas | `vitest run test/openapi.test.ts` exit 0 (as 2 provas e o teste extra do Handoff) | `apps/api/test/openapi.test.ts:144` + `:153` - corpo de `post /api/students/{id}/payments` `toEqual(z.toJSONSchema(createPaymentRequestSchema))`; `:79` `documented.sort() toEqual(registered.sort())`; teste extra: `:328` `enum toEqual(['pending', 'overdue'])`, `:331-333` `['get','post']`, `['delete']`, `['get']`, `:341` `schema toEqual(properties.status)` | PASS |
| C68 | `admin` sem 2FA: 403 `two_factor_enrollment_required` nas 4 | `vitest run test/enrollment.test.ts` exit 0 | `apps/api/test/enrollment.test.ts:45-46` - `toBe(403)`, `toBe('two_factor_enrollment_required')` para cada rota de `stack.api.routes()`; `:90-93` a lista bloqueada inclui as 4 | PASS |
| C69 | cancelar não muda as linhas de pagamento e grava só a própria trilha | `vitest run test/payments-write.test.ts` | `apps/api/test/payments-write.test.ts:428` - `toBe(204)`; `:429` linhas viva e desfeita `toEqual(before)`; `:430` `toEqual(['student.enrollment_cancelled'])` | PASS |
| C70 | `POST` contra `DELETE`: 204 e 201 ou 409, nunca 5xx, no máximo uma viva | idem | `apps/api/test/payments-write.test.ts:446` - `undo.status toBe(204)`; `:449-450` com 201: 1 viva e as 2 ações; `:452-455` senão `toBe(409)`, `payment_already_confirmed`, 0 viva, só `student.payment_undone` | PASS |
| C71 | stack de pé: `0009` aplicada, confirmar, repetir 409, ficha "Pago", permissões, desfazer, trilha com `ip` e `user_agent` | `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "payment_confirmed_and_undone..."` exit 0 (Docker 29.8.1, 1 passed, 17 skipped, 35 s) | `tests/stack/compose.test.ts:908` - colunas `toBe('created_at,enrollment_id,id,voided_at')`; `:910` índice parcial; `:912` `toBe('btree_gist,pg_trgm,plpgsql')`; `:951` 201; `:956-957` 409 `payment_already_confirmed`; `:965` `toBe('paid')`; `:967` `toMatch(/>Pago</)`; `:968` `/payments` sem o aluno; `:971` 403; `:975` permissão; `:978` e `:987` trilha inalterada pelas leituras; `:983` `voided_at is not null` `toBe('t')`; `:995` as 2 linhas com `ip` e `user_agent` enviados | PASS |

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| rotas novas (4) | roteador do Nest: `apps/api/src/student-payments/student-payments.controller.ts:25,34,57,74`, enumerado por `stack.api.routes()` em `apps/api/test/enrollment.test.ts:90-93` | `GET` ficha C19 · `POST` C1 · `DELETE` C13 · `GET /api/payments` C25 | - |
| `GET /api/students/:id/payments` statuses (4) | Surface do plano + caminhos do controller (`NotFoundException` em `controller.ts:30`) | 200 C19 (`payments-read.test.ts:98`) · 401 C12 (`payments-write.test.ts:298`) · 403 C11 (`:272`) · 404 C10 (`:233`) | - |
| `POST /api/students/:id/payments` statuses (6) | Surface + `switch` de `controller.ts:44-54` | 201 C1 · 401 C12 · 403 C11 · 404 C10 · 409 C3, C4 · 422 C2 (inclui o `invalid_enrollment` de `controller.ts:50`) | - |
| `DELETE .../:paymentId` statuses (4) | Surface + `controller.ts:59,65` | 204 C13 · 401 C12 · 403 C11 · 404 C10, C17 | - |
| `GET /api/payments` statuses (4) | Surface + `@QueryInput` em `controller.ts:76` | 200 C25 · 401 C12 · 403 C11 · 422 C27 | - |
| 500 fora da Surface, por rota de escrita (2) | `audit.record` dentro da transação, `student-payments.service.ts:66,189` | `POST` C36 · `DELETE` C36 (`payments-audit.test.ts:159`) | - |
| linha de erro comum nas rotas novas (2 códigos além de `unauthorized`/`forbidden`) | `access.ts` (`two_factor_enrollment_required`) e `configure-app.ts:22` (`csrf_rejected`, global por `UNDER_API` em `csrf.ts:10`) | `two_factor_enrollment_required` C68 · `csrf_rejected` existente, `csrf.test.ts:39` sobre todo método de escrita (ver Observations 6) | - |
| códigos do 409 (2) | `controller.ts:51-53` | `enrollment_cancelled` C3 · `payment_already_confirmed` C4 | - |
| precedência dos dois 409 (1) | `service.ts:56` antes de `:62` | cancelado com viva dá `enrollment_cancelled` C3 (`payments-write.test.ts:135`); mutante 1 morto | - |
| perfis que escrevem e leem (4 + 4) | `@Roles('admin', 'hr_finance')` em `controller.ts:26,35,58,75` | `admin` e `hr_finance` C1, C13, C19, C25 · `reception` e `instructor` C11 | - |
| `admin` sem 2FA nas rotas novas (4) | `stack.api.routes()` em `enrollment.test.ts:39-42` | as 4 C68 (`enrollment.test.ts:90-93`) | - |
| linhas da conta (15) | `paymentStatus` em `packages/contracts/src/payments.ts:80-96`: 4 valores, 3 precedências, 2 viradas, valor zero | as 15 linhas escritas à mão em `packages/contracts/test/payments.test.ts:16-31`, C66; mutante 2 morto | - |
| `status` da conta na fronteira (4) | `PAYMENT_STATUSES` em `payments.ts:6` | `paid`, `pending`, `overdue`, `cancelled` C20 (`payments-read.test.ts:127-131`) | - |
| virada do dia em São Paulo (2 edges) | `saoPauloToday` + `day > dueDate` (`payments.ts:86,92`) | `02:59:59Z` e `03:00:00Z` em C66, C20, C26, C30 | - |
| `status` da query (3) e recusas (8) | `openPaymentsQuerySchema`, `payments.ts:70` | ausente C25 · `pending` C26 · `overdue` C26 · as 8 recusas C27 (`payments-read.test.ts:252-261`) | - |
| recusas de `enrollmentId` na rota (6) e no schema (4) | `createPaymentRequestSchema` (`payments.ts:16`) + `invalid_enrollment` (`service.ts:55`) | as 6 C2 (`payments-write.test.ts:95-102`) · as 4 C65 (`contracts.test.ts:1067-1068`) | - |
| `:id` e `:paymentId` (3 + 3) | `UUID` e as buscas de `service.ts:45,48,87-89,172,179` | `GET`, `POST`, `DELETE` C10 · não-uuid, ninguém, de outro aluno C17 | - |
| estado do período e do aluno na confirmação (3 + 3) | o `POST` não lê datas nem a situação do aluno (`service.ts:47-62`) | agendado, ativo, vencido C5 · `active`, `inactive`, `suspended` C1, C6 | - |
| aluno na lista geral por situação (3) | `listOpen` sem filtro de aluno (`service.ts:120-130`) | `active`, `inactive`, `suspended` C25 (`payments-read.test.ts:206-209`) | - |
| exclusões da lista geral (4) | `where(isNull(cancelledAt))` e o corte de `service.ts:129,140` | cancelado, cancelado com viva, viva, desfeita fica C28 | - |
| desfazer e depois (3 + 2) | `undo` em `service.ts:171-198` | vivo C13 · já desfeito C14 · cancelado C16 · novo `POST` C15 · linha desfeita mantida C15 | - |
| escritas simultâneas (3 pares) | travas de `service.ts:54,182` e índice | `POST`x`POST` C7 · `DELETE`x`DELETE` C18 (mutante 3 morto) · `POST`x`DELETE` C70 | - |
| chaves: ficha (8), lista (8), `student` (2), `payment` (2), resposta do `POST` (3) | schemas estritos `payments.ts:22,30,48,59` | C19 `:99` · C25 `:218-219` · C21 `:159` · C1 `:80`, cada uma igualdade exata do conjunto | - |
| colunas de `payments` (4) e ausentes (7) | banco migrado (`information_schema`) e `migrations/0009_payments.sql` | as 4 e as 7 C60 (`packages/database/test/payments.test.ts:102,110`) | - |
| índices únicos (2) e FK (1) | `pg_index`, `pg_constraint` do banco migrado | PK e `payments_one_alive_idx` C61 · FK `NO ACTION` C60 · recusas C8, C9 | - |
| `0009` reescrita (3) | `_journal.json` e o banco que para na `0008` | 10a entrada sem `0010`, só `payments`, resto intacto C62 | - |
| `AUDIT_ACTIONS` (38) | `packages/contracts/src/audit.ts` | todas escritas C64 (`audit-auth.test.ts:358`) · as 2 novas em ordem C63 (`contracts.test.ts:994`) · 38 rótulos no filtro C57 | - |
| campos e forma do `diff` (2 x 2) | `TRACKED` e `diffOf` em `service.ts:18,71,194` | `startsAt`, `priceCents`, `from` nulo C33 · `to` nulo C34 | - |
| desfechos sem trilha (10) e leituras sem trilha (2 rotas x 2 perfis x 2 estados) | AC 35 e AC 31 | C35 (`payments-audit.test.ts:121-132`) · C31 (`payments-read.test.ts:324-334`) | - |
| `ip`/`user_agent` (4 x 2 ações) | AC 37 + auditoria AC 29-32 | C37 (`payments-audit.test.ts:196-201`) | - |
| dados pessoais fora da trilha (2) | AD-069 | nome e CPF C38 | - |
| menu por perfil (4) | `shell.tsx:30` `canReadPayments` | C39 (`shell.spec.ts:102-107`) | - |
| `/payments` por quem abre (5) | `proxy.ts` + `page.tsx:18-20` | sem sessão C40 · `reception`, `instructor` C41 · `admin`, `hr_finance` C42 | - |
| colunas de `/payments` (6) e opções de "Situação" (3) | `apps/web/src/app/payments/page.tsx:40-45` e `status-filter.tsx:24-26` | C42 (`payments.spec.ts:69-77`); escolha C44; reabrir C72 | - |
| formatos de `/payments` (7) | `page.tsx:51-68` | C43 (`payments.spec.ts:102-107`) | - |
| estados de `/payments` (5) | Observable | vazio C45 · erro C46 · sem permissão C40, C41 · carregando n/a (página no servidor) · ordem C42 | - |
| colunas (4) e situações por extenso (4) da ficha | `payments-block.tsx` e `PAYMENT_STATUS_LABELS` | C47 (`student-payments.spec.ts:60-76`) | - |
| estados do bloco (5) e chamada por perfil (4) | Observable + `students/[id]/page.tsx:93` | vazio C48 · erro C49 · sem permissão e sem chamada C50 · ordem e 1 `GET` C47 · diálogos C52, C56 | - |
| botões por estado (4 + 4) | `payments-block.tsx:75,80` | "Confirmar pagamento" C51 (mutante 5 morto) · "Desfazer pagamento" C55 | - |
| diálogos: conteúdo, envio, mensagens, espera, marcação | `payments-block.tsx:132,154,184,205` | C52, C53, C54, C56, C73, C74 | - |
| `/audit`: rótulos (2), posições (38), detalhes (4), "Alvo" (2) | `lib/audit.ts:64-65` | C57, C58, C59 | - |
| OpenAPI (4 rotas + corpo + parâmetro) | documento gerado em `/api/openapi.json` | C67 (`openapi.test.ts:79,153,328,331-333,341`) | - |
| cancelar o período (3) | `StudentEnrollmentsService.cancel`, fora do diff | viva idêntica, desfeita idêntica, só a própria trilha C69 | - |
| startup config: `0009` aplicada (3 assemblies) | `packages/database/src/migrate.ts:14,18` (`pnpm db:migrate`, chamado em `packages/database/test/payments.test.ts:19`) · `apps/api/test/support/servers.ts:19-23` (`runMigrations` da pasta de `packages/database`, de que o `startStack` depende) · `compose.yaml:25-28` serviço `migrate` com `Dockerfile:10,13` `pnpm db:migrate`, e a API `depends_on` dele em `compose.yaml:91-92` | banco do pacote C62 · harness da API C1 · stack C71 (`compose.test.ts:908-910`) | - |
| startup config: nenhuma extensão nova (2 assemblies) | Postgres do `testcontainers` (`payments.test.ts:29`) · Postgres do `compose.yaml` | C62 `payments.test.ts:225` · C71 `compose.test.ts:912` | - |
| startup config: rotas novas pela origem do web (2 assemblies) | `apps/web/src/app/api/[...path]/route.ts:35-41` repassa a `API_URL`; `playwright.config.ts:20-24` sobe o build de produção com `API_URL` da `FakeApi`; `compose.yaml:105,111` `web` com `API_URL: http://api:3001` | build contra a `FakeApi` C42, C52 (`student-payments.spec.ts:176`) · container `web` C71 (`compose.test.ts:951-957`) | - |

Varredura por conjuntos sem linha: as enumerações de `Surface`, `Landing` (doors 1 a 3), `Relations`, `Assumptions`, `Observable` e das claims têm linha acima. Da prosa do `Impact`, "`GET /api/students/:id/enrollments` e `enrollmentSchema` não ganham chave" e "a coluna Vencimento intocada" não têm check, mas o diff não toca `packages/contracts/src/plans.ts` nem `apps/api/src/student-enrollments` nem o bloco de matrículas, e as suítes existentes delas rodaram verdes nesta verificação (API completa 541/541, web completa 220/220). A trava `FOR UPDATE` do `POST` (Flow passo 3) segue sem check por decisão da Intent (decisão 3) e está no código em `student-payments.service.ts:54`.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Filtro e ordem por valor calculado do dia, aplicados em código (lista geral por `pending` e `overdue`) | `apps/api/src/student-payments/student-payments.service.ts` (`listOpen`, `:119-154`), `packages/contracts/src/payments.ts` | prova de fronteira por valor do filtro com relógio controlado nos dois instantes: `pending` e `overdue` C26 (`payments-read.test.ts:242-248`), nenhum filtro C30 (`:307-314`); comparação lista x ficha C30 (`:313`) | sim - os 3 valores do filtro nos instantes `02:59:59Z` e `03:00:00Z`, ordem e empate escritos à mão (C25 `:223-225`, C26 `:242-248`), as 8 recusas em C27 (validadas pelo schema antes do serviço, sem leitura de relógio); a igualdade entre as duas rotas é a C30 |
| (herdada) rota que decide, por HTTP, com corte por perfil e linha de auditoria | `student-payments.controller.ts`, `student-payments.service.ts` | C1 a C38 sobre `startStack` (Postgres real) | sim - fronteira HTTP com sessão real de cada perfil, `paymentSnapshot` e `written` |
| (herdada) restrição do banco provada por SQL e por corrida na rota | `migrations/0009_payments.sql`, `schema.ts` | C9, C61 por SQL; C7 e C70 pela rota | sim - mutante 3 morto pela corrida C18 |
| (herdada) gravador da trilha na mesma transação | `service.ts:66,189` | C32 a C38, C36 com gatilho que falha | sim |
| (herdada) tela contra a `FakeApi` sobre o build de produção | `apps/web/src/app/payments/*`, `students/[id]/payments-block.tsx`, `shell.tsx`, `lib/audit.ts` | C39 a C59, C72 a C74 | sim - mutante 5 morto |
| (herdada) stack lida por `psql` | `compose.yaml`, `0009` | C71 | sim |
| (herdada) conta pura com prova na fronteira, nos dois lados da virada | `packages/contracts/src/payments.ts` | C66 no próprio nível; C20, C26, C30 na fronteira | sim - mutante 2 morto |

## Swept existing

| Row | Constraint cited | Found in code | Verdict |
| --- | --- | --- | --- |
| authorization - guarda global (AD-022) | `AccessGuard` como `APP_GUARD`, negação por padrão | `apps/api/src/app.module.ts:134` `{ provide: APP_GUARD, useClass: AccessGuard }`; as 4 rotas declaram `@Roles` em `controller.ts:26,35,58,75`; `guard_matrix_three_declarations_five_callers` e `only_four_routes_answer_without_session` verdes (`apps/api/test/access.test.ts:49,145`) | presente |
| authorization - checagem de origem (AD-020) | escrita em `/api` só da origem do web | `apps/api/src/configure-app.ts:22` `app.use(csrfProtection(...))`, global por `UNDER_API` (`csrf.ts:10,19`), cobre o `POST` e o `DELETE` novos; a prova que exercita é `foreign_origin_403_without_running_handler` (`apps/api/test/csrf.test.ts:33-39`), verde | presente (prova citada no checks.md é outra, ver Observations 6) |
| dependency failure - banco fora cai no `500 internal_error` | `ProblemFilter` | `unhandled_500_hides_exception` verde (`apps/api/test/problem.test.ts:31`) | presente |

## Faults injected

Worktree descartável em `scratchpad/wt` a partir de `HEAD` (`git worktree add`, `pnpm install --frozen-lockfile --offline`), nunca na árvore real e sem `git stash`. Porcelain da árvore real antes: `?? CLAUDE.md`; depois de `git worktree remove --force` e `prune`: `?? CLAUDE.md` (igual). Cada mutação foi revertida (`git checkout -- .`) antes da seguinte.

| Mutation | Location | Killed |
| --- | --- | --- |
| precedência invertida: checar confirmação viva antes de `cancelledAt` | `apps/api/src/student-payments/student-payments.service.ts:56-62` | sim - C3 falhou: `cancelado com confirmação viva: expected 'payment_already_confirmed' to be 'enrollment_cancelled'` |
| virada do dia: `day > dueDate` para `day >= dueDate` | `packages/contracts/src/payments.ts:92` | sim - C66 falhou na linha "só desfeita, no próprio dia" |
| desfazer sem a guarda: `UPDATE ... WHERE id = ?` sem `voided_at IS NULL` | `apps/api/src/student-payments/student-payments.service.ts:186` | sim - C18 falhou: `rodada 1: expected [...] to have a length of 1 but got 2` (duas linhas `student.payment_undone`) |
| lista geral sem desempate: `orderBy(asc(startsAt))` sem `asc(enrollments.id)` | `apps/api/src/student-payments/student-payments.service.ts:130` | sim - C25 falhou 3 de 3 execuções, o par empatado veio invertido |
| botão "Confirmar pagamento" também em `cancelled`: condição trocada para `status !== 'paid'` | `apps/web/src/app/students/[id]/payments-block.tsx:75` | sim - C51 falhou: linha 3 (`cancelled`) `Expected: 0 Received: 1` |

## Observations

Lacunas de precisão, nenhuma derruba um check (cada claim tem asserção localizada que o estabelece), registradas para o checks.md e para lições:

1. **C18** - `count(voided_at)` de um `id` só (`payments-write.test.ts:414`) é 1 sempre que o pagamento está desfeito, então não vê uma regravação de `voided_at`; quem pega a dupla escrita é a contagem de linhas de trilha (`:415`), como o mutante 3 mostrou. A parte "um só `voided_at`" do claim é estruturalmente verdadeira.
2. **C34** - o `diff` é afirmado com `toMatchObject` (`payments-audit.test.ts:97-106`), que aceita chave a mais em `diff.values`; a C33 usa `toEqual`. O array `fields` é comparado exato, o que limita o risco.
3. **C63** - a prova nomeada (`contracts.test.ts:982-996`) só afirma `AUDIT_ACTIONS`; a metade do claim sobre `ACTION_LABELS` está provada pela C57 (`audit.spec.ts:918`) e pelo tipo `Record<AuditAction, string>` (`lib/audit.ts:27`, tsc do web exit 0). A ausência das ações antigas nas posições 1 a 30 vem dos outros testes de vocabulário do mesmo arquivo, não da prova nomeada.
4. **C67** - os dois testes citados na prova não afirmam o parâmetro `status` nem as rotas `GET`/`DELETE` por método; o teste extra `payment_paths_and_status_query_parameter_come_from_contract_schema` (`openapi.test.ts:324-350`), registrado no Handoff, afirma e rodou verde. A linha `Proof:` da C67 deveria citá-lo.
5. **C65** - os schemas de item são provados estritos contra chave a mais, mas só `plan.period` é testado como obrigatório; a falta de cada uma das outras chaves não é afirmada no nível do schema (a C19 e a C25 afirmam o conjunto exato na resposta).
6. **Swept, AD-020** - o checks.md cita `guard_matrix_three_declarations_five_callers` e `only_four_routes_answer_without_session` como prova da checagem de origem, mas nenhum dos dois manda `Origin` estrangeiro; a restrição existe e é global (`configure-app.ts:22`), e a prova que a exercita é `csrf.test.ts:33-39`.

## Gate

Rodado por este Verifier no HEAD `d6cedcd`:

- `pnpm --filter "./packages/database" exec vitest run test/payments.test.ts test/migrate.test.ts test/schema.test.ts test/photos.test.ts --reporter=verbose` - 20 passed, 0 failed
- `pnpm --filter "./packages/contracts" exec vitest run test/payments.test.ts --reporter=verbose` - 1 passed, 0 failed
- `pnpm --filter "./apps/api" exec vitest run test/payments-write.test.ts test/payments-read.test.ts test/payments-audit.test.ts test/contracts.test.ts test/audit-auth.test.ts test/openapi.test.ts test/enrollment.test.ts --reporter=verbose` - 97 passed, 0 failed
- `pnpm --filter "./apps/api" exec vitest run --coverage` (suíte inteira, regressão e provas `Swept`) - 541 passed, 0 failed, 67 arquivos; cobertura de `apps/api/src` 95,09% linhas, 92,98% branches (limiar 70/70)
- `pnpm --filter "./apps/web" exec playwright test e2e/payments.spec.ts e2e/student-payments.spec.ts e2e/shell.spec.ts e2e/audit.spec.ts` - 67 passed, 0 failed
- `pnpm --filter "./apps/web" exec playwright test` (suíte inteira, regressão) - 220 passed, 0 failed
- `pnpm --filter "./apps/web" exec tsc --noEmit` - exit 0
- `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "payment_confirmed_and_undone_through_web_with_duplicate_refused_and_audit_rows"` - 1 passed, 0 failed (17 skipped pelo filtro)

Total sem sobreposição (database 20 + contracts 1 + API inteira 541 + web inteira 220 + stack 1): 783 passed, 0 failed.
