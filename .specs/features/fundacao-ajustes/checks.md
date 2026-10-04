# Ajustes da fundação - checks

Profile: light
Plan: none - mudança pequena, sem one-way door; ver `Intent`

## Intent

A rodada 4 de verificação da `fundacao` (`.specs/features/fundacao/verification.md`, achados F1 a
F3) passou com 33/33 e deixou três observações que não reprovam check. Hoje: com mais de 10
requisições em voo na mesma conexão, a API imprime `MaxListenersExceededWarning` em stderr (F1);
quando o cliente abandona a requisição sem ter recebido resposta, a linha de log registra `499` se
a requisição não tem corpo e `400` se o corpo estava incompleto, e quem lê o log não distingue esse
`400` de um que o cliente recebeu (F2); e três trechos do texto da `fundacao` ficaram desatualizados
(F3).

Quando isto entrar: o aviso não aparece, por mais requisições que estejam em voo na conexão, e cada
uma continua com a sua linha de log; a requisição abandonada antes de qualquer resposta é sempre
registrada como `499`; e o texto da `fundacao` diz o que a API faz (motivo da door 3 igual ao do
parágrafo de alcance, `code` emitidos e status de erro da `Surface` completos). Decisões do usuário
em 2026-10-03, depois da rodada 4.

"Abandonar" é o cliente fechar a conexão inteira (os dois sentidos) sem ter recebido resposta. O
cliente que fecha só o seu lado e continua lendo não abandonou: recebe o `400` e a linha registra
`400`, como no caso (d) da C31 da `fundacao`, que não muda.

2 checks in 1 slice · 0 one-way doors · 0 open

## Checks

### S1 - Linha de log por requisição: conexão cheia e cliente que abandona · 3 files · 9 KB · ~3k

**C1** - Com 11 e com 16 requisições `GET /health` em voo na mesma conexão (enviadas de uma vez, com o banco pendurado), o processo não emite nenhum aviso `MaxListenersExceededWarning`, o cliente recebe uma resposta `503` por requisição e a API escreve exatamente uma linha de log por requisição, cada uma com um `requestId` diferente (fundacao F1, AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/request-context.test.ts -t "pipelined_requests_log_one_line_each_without_listener_warning"`
Status: concluído

**C2** - Quando o cliente fecha a conexão inteira sem ter recebido resposta, a requisição gera exatamente uma linha de log com `status` igual a `499`, nos dois casos: (a) `GET /health` sem corpo, com a resposta ainda pendente; (b) `POST /health` JSON com `Content-Length: 50` e 5 bytes enviados (fundacao F2, AC 10)
Proof: `pnpm --filter "./apps/api" exec vitest run test/request-context.test.ts -t "abandoned_request_logs_499"`
Status: concluído

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| requisições em voo na mesma conexão (2 edges) | C1, table-driven over all 2: 11, 16 | - |
| requisição abandonada sem resposta (2) | sem corpo, resposta pendente C2 · corpo incompleto C2 | - |
| campos afirmados da linha de log da requisição abandonada (3) | `status` 499 C2 · `method` C2 · `path` C2 | - |

- Claims naming a status code, route or response shape: C1, C2 - cada prova cruza a fronteira HTTP por socket TCP cru contra a montagem de teste, que chama o mesmo `configureApp` do processo real
- A montagem não muda: nenhuma configuração de subida nova, então não há linha de startup config
- F3 é só texto da `fundacao` (`plan.md` door 3 e `Surface`, `checks.md` linha de `Coverage` dos `code`), editado com autorização do usuário; não tem check aqui porque nenhum comportamento muda. Os `code` e status que o texto passa a listar já são provados pela C32 e C31 da `fundacao`

## Swept

- validation: n/a - nenhuma entrada nova é aceita ou rejeitada
- failure modes: C2
- idempotency: n/a - nada é gravado; a garantia de uma linha só por requisição é a C1 e a C2
- authorization: n/a - `GET /health` é aberto por desenho (door 4 da `fundacao`) e nada aqui muda quem chama o quê
- concurrency: C1
- data lifecycle: n/a - nenhum dado armazenado; o log vai para stdout
- dependency failure: n/a - o banco pendurado é só o meio de manter a requisição em voo; o `503` dele já é provado na `fundacao`
- state transitions: n/a - não há máquina de estados
- observability: C1, C2

## Out of scope

- `payload_too_large` (`413`) ganhar check próprio - a API já o emite (sondas N9 e N11 da rodada 4); aqui ele só entra na `Surface` como status emitido hoje, a linha de `Coverage` dos `code` ganha apenas os dois que o usuário nomeou
- Os itens de F4 da rodada 4 - não fazem parte da decisão do usuário
- Aviso em stderr no processo real (`dist/main.js`) - a montagem é a mesma (`configureApp`), e a C33 da `fundacao` já prova que o processo real a usa

## Handoff

- `apps/api/src/request-context.ts` 2,1 KB + `apps/api/test/request-context.test.ts` (novo, ~5 KB) + `apps/api/src/client-error.ts` 2,2 KB se o caso (b) da C2 passar por ele = ~9 KB, ~3k; mais ~14k dos trechos lidos de `plan.md` e `checks.md` da `fundacao`: ~17k, abaixo do orçamento de 150k - one builder
- **Boundary:** C1-C2 fechados no commit `fix(api)` desta mudança
- **Settled mid-build:** no caso (b) da C2 o servidor vê só o FIN do cliente, e fechar a conexão inteira é idêntico, nesse instante, a fechar um lado só (caso (d) da C31 da `fundacao`, que continua `400`). O usuário escolheu, em 2026-10-03, detectar pela segunda escrita: nesse caminho a resposta `400` sai em duas escritas (cabeçalhos, e o corpo 10 ms depois); se o cliente foi embora a segunda falha e a linha registra `499`. Limite aceito: com latência de rede acima desse intervalo a recusa do cliente pode chegar tarde e a linha sair `400`; atrás do proxy reverso local isso não ocorre
- **Abandoned:** tratar todo FIN com corpo incompleto como abandono (sem resposta, `499`) - mudaria o caso (d) da C31 e da C32 da `fundacao`; e deixar a C2 só com o caso sem corpo - contraria a decisão 2
