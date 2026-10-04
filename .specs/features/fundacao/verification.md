# Fundação do projeto verification

**Verdict**: FAIL
**Profile**: light
**Diff range**: c90611e..253302df95dd80d10490582aee49151c7af0c0a7
**Round**: 3 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 2 (at `05d3c85`) failed C15 only: the built API answered requests that never reached the
request-id code (responses written by Node's HTTP server) with no log line. Since then the code did
not change; the user renegotiated the text (`253302d`): AC 9, AC 10, door 3 and C15 now apply to
"toda requisição que o servidor HTTP entrega à aplicação", with an enumerated exemption for what
the HTTP server rejects before that.

All 30 named proofs were re-run at `253302d` and passed. The verdict is still FAIL, on the same
check, for a narrower reason. The new text draws the line at **delivery to the application**, and
the built API still loses the log line for requests that **are** delivered:

- a request with an invalid chunk size is delivered, **answered by the application itself** (`404`
  `application/problem+json`, with `X-Request-Id` equal to the body `requestId`) and writes **zero**
  log lines - 10 runs out of 10 (probe R12);
- a JSON request whose body has an invalid chunk size (`400`, round 2's P25) or never completes
  (`408` after 330 s) is delivered, held by the application, then answered by the HTTP server with
  no `X-Request-Id` and no log line (R13, R14, R17). Neither case is in the enumerated exemption.

Seven of round 2's nine counterexamples (P17-P20, P22-P24) are genuinely out under the new text:
they are rejected before delivery, and they match the enumeration. P21 is named by the enumeration
but is in fact delivered; P25 is neither enumerated nor rejected before delivery. Details in
`## Findings`.

## Scope of this round

- Diff `05d3c85..253302d` (run: `git diff --stat 05d3c85..HEAD`): 7 files, all under `.specs/` -
  `LESSONS.md`, `ROADMAP.md`, `STATE.md`, `lessons.json`, `features/fundacao/checks.md`,
  `features/fundacao/plan.md`, `features/fundacao/verification.md`.
  `git diff --name-only 05d3c85..HEAD -- apps packages tests` is empty: no code, test or fixture
  changed.
- `plan.md` diff: door 3 got a caveat appended; AC 9 and AC 10 reworded; a scope paragraph added
  under them. `checks.md` diff: C15's claim reworded (proof line unchanged); one `Coverage` note
  added. No other check, proof or assertion changed.
- Re-judged from scratch: C15 (the only non-PASS verdict of round 2), against the text as now
  written, with probes against the built API.
- Carried forward, marked `carried from 05d3c85` per row: the assertion citation and level judgment
  of the other 29 checks. Their **proofs** are not carried: each ran at `253302d`. No test file
  changed, so no cited line moved (spot-checked by reading `logging.test.ts`, `request-id.test.ts`
  and grepping the `expect(` lines of `problem.test.ts` and `compose.test.ts` at `253302d`).

## Checks

Proof commands were batched per target (5 invocations, run one after another, verbose/list reporter,
every test name listed individually as passed), all at `253302d`. `api` = `pnpm --filter "./apps/api" exec vitest run test/health.test.ts test/boot.test.ts test/problem.test.ts test/request-id.test.ts test/logging.test.ts test/contracts.test.ts --reporter=verbose -t "<12 names>"`;
`db` = `pnpm --filter "./packages/database" exec vitest run test/migrate.test.ts --reporter=verbose -t "<3 names>"`;
`repo` = `pnpm --filter "./tests/repo" exec vitest run repo.test.ts --reporter=verbose -t "<4 names>"`;
`web` = `pnpm --filter "./apps/web" exec playwright test e2e/home.spec.ts --reporter=list -g "<3 names>"`;
`stack` = `pnpm --filter "./tests/stack" exec vitest run compose.test.ts verify.test.ts --reporter=verbose -t "<8 names>"`.
No invocation was retried. In the Evidence column, `proof verified at 253302d` means the named test
was seen passing at the new HEAD; `carried from 05d3c85` means the located assertion and its level
judgment are round 2's, in a file that did not change.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | clean clone, `docker compose up --build --wait` exits 0; `postgres`, `api`, `web` healthy | `stack` -t `up_wait_exits_zero_with_three_healthy` exit 0 | `tests/stack/compose.test.ts:52` - `expect(up.status, ...).toBe(0)`; `tests/stack/compose.test.ts:57` - `expect(container?.Health, ...).toBe('healthy')` over `['postgres', 'api', 'web']`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C2 | `GET /health` with Postgres up -> `200` and exactly `{"status":"ok","checks":{"database":"up"}}` | `api` -t `health_ok_200` exit 0 | `apps/api/test/health.test.ts:23` - `expect(response.status).toBe(200)`; `apps/api/test/health.test.ts:24` - `expect(await response.json()).toEqual({ status: 'ok', checks: { database: 'up' } })`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C3 | Postgres refusing connection -> `503` and exactly the `degraded`/`down` body | `api` -t `health_503_when_db_refuses` exit 0 | `apps/api/test/health.test.ts:33` - `expect(response.status).toBe(503)`; `apps/api/test/health.test.ts:34` - `expect(await response.json()).toEqual({ status: 'degraded', checks: { database: 'down' } })`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C4 | Postgres accepting and never answering -> `503` `degraded` within 3 s | `api` -t `health_503_within_3s_when_db_hangs` exit 0 | `apps/api/test/health.test.ts:47` - `expect(response.status).toBe(503)`; `apps/api/test/health.test.ts:49` - `expect(elapsedMs).toBeLessThanOrEqual(3000)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C5 | each required env var missing -> real API process exits 1 naming it | `api` -t `missing_var_exits_1_naming_it` exit 0 | `apps/api/test/boot.test.ts:46` - `expect(status, ...).toBe(1)`; `apps/api/test/boot.test.ts:47` - `expect(output, ...).toContain(key)` for every key of `requiredKeys`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C6 | invalid `DATABASE_URL` -> exit 1 printing `DATABASE_URL` | `api` -t `invalid_var_exits_1_naming_it` exit 0 | `apps/api/test/boot.test.ts:54` - `expect(status).toBe(1)`; `apps/api/test/boot.test.ts:55` - `expect(output).toContain('DATABASE_URL')`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C7 | env failure output contains no variable value, including the password inside `DATABASE_URL` | `api` -t `env_failure_prints_no_values` exit 0 | `apps/api/test/boot.test.ts:69` - `expect(output).not.toContain(SECRET)`; `apps/api/test/boot.test.ts:71` - `expect(output).not.toContain(value)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C8 | every required key of the api and web env schemas is in `.env.example` | `repo` -t `env_example_lists_every_required_key` exit 0 | `tests/repo/repo.test.ts:45` - `expect(listed, ...).toContain(key)` over `[...requiredKeys(apiEnvSchema), ...requiredKeys(webEnvSchema)]`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C9 | `git check-ignore .env` exits 0 | `repo` -t `dotenv_is_git_ignored` exit 0 | `tests/repo/repo.test.ts:52` - `expect(result.status, result.stderr).toBe(0)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C10 | stack `postgres` runs major version 18 | `stack` -t `postgres_major_is_18` exit 0 | `tests/stack/compose.test.ts:70` - `expect(Math.floor(versionNum / 10000)).toBe(18)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C11 | unknown route -> `404`, `application/problem+json`, body `type`, `title`, `status` 404, `code` `not_found`, `requestId` | `api` -t `unknown_route_404_problem` exit 0 | `apps/api/test/problem.test.ts:19` - `expect(response.status).toBe(404)`; `apps/api/test/problem.test.ts:20` - `expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json\b/)`; `apps/api/test/problem.test.ts:22` - `expect(body.code).toBe('not_found')`. Proof verified at 253302d (also observed on the built API, probe R1); citation carried from 05d3c85 | PASS |
| C12 | throwing handler -> `500` problem+json, `code` `internal_error`, no exception message or stack in body | `api` -t `unhandled_500_hides_exception` exit 0 | `apps/api/test/problem.test.ts:35` - `expect(response.status).toBe(500)`; `apps/api/test/problem.test.ts:37` - `expect(JSON.parse(text).code).toBe('internal_error')`; `apps/api/test/problem.test.ts:38` - `expect(text).not.toContain(BOOM_MESSAGE)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C13 | `X-Request-Id` present and non-empty on `200`, `503`, `404` and `500` responses | `api` -t `header_on_every_status` exit 0 | `apps/api/test/request-id.test.ts:33` - `expect(response.headers.get('x-request-id'), ...).toMatch(/\S/)` over 200, 503, 404, 500. Proof verified at 253302d; judgment carried from 05d3c85 and re-checked against the reworded AC 9: every `503` and `404` observed on the built API this round carried the header (R1, R2, R12, R18-R26), including the `404` of R12; the responses without it are `400`/`408`/`417`/`431`, outside the claim's four statuses | PASS |
| C14 | on `404` and `500`, `X-Request-Id` equals body `requestId` | `api` -t `header_equals_body_request_id` exit 0 | `apps/api/test/request-id.test.ts:49` - `expect(response.headers.get('x-request-id')).toBe(body.requestId)` over 404, 500. Proof verified at 253302d; judgment carried from 05d3c85 and re-checked: every problem body observed on the built API this round (404, 400 of R25) had `requestId` equal to the header | PASS |
| C15 | each request the HTTP server delivers to the application and that is answered writes exactly one JSON log line with `requestId`, `method`, `path`, `status`, `durationMs`, same id as header | `api` -t `one_json_line_per_request` exit 0 | `apps/api/test/logging.test.ts:62` - `expect(ofRequest, ...).toHaveLength(1)`; `apps/api/test/logging.test.ts:63` - `expect(ofRequest[0]).toMatchObject({ requestId, method: 'GET', path, status })`. Re-judged from scratch, verified at 253302d: proof green, sampling is `GET /health` and one unknown route (`apps/api/test/logging.test.ts:43-44`). The built API delivered `POST /health` with an invalid chunk size to the application, the application answered it `404` problem+json with `X-Request-Id`, and wrote **zero** log lines (R12, 10 of 10); the same request with a JSON content type (R13, R14) and a JSON body never completed (R17) are delivered and answered `400`/`408` with no header and no line. The line is written on `finish` only (`apps/api/src/request-context.ts:13`) | FAIL - sampling gap, counterexample reproduced on a delivered request |
| C16 | real stack process: unknown route -> `404` problem+json, `X-Request-Id` equals body `requestId` | `stack` -t `running_api_uses_error_contract` exit 0 | `tests/stack/compose.test.ts:77` - `expect(response.status).toBe(404)`; `tests/stack/compose.test.ts:80` - `expect(response.headers.get('x-request-id')).toBe(body.requestId)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C17 | real `/health` `200` and `503` and the `404` body validate against `packages/contracts` schemas | `api` -t `responses_match_contract_schemas` exit 0 | `apps/api/test/contracts.test.ts:25` - `expect(healthResponseSchema.safeParse(await ok.json()).success).toBe(true)`; `apps/api/test/contracts.test.ts:29` (503); `apps/api/test/contracts.test.ts:33` - `expect(problemSchema.safeParse(await notFound.json()).success).toBe(true)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C18 | `pnpm db:migrate` on empty db exits 0 and installs `pg_trgm` | `db` -t `empty_db_migrates_and_installs_pg_trgm` exit 0 | `packages/database/test/migrate.test.ts:74` - `expect(result.status, result.stderr).toBe(0)`; `packages/database/test/migrate.test.ts:76` - `expect(extensions).toEqual([{ extname: 'pg_trgm' }])`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C19 | second `pnpm db:migrate` exits 0, schema and applied-migrations record identical | `db` -t `second_run_changes_nothing` exit 0 | `packages/database/test/migrate.test.ts:87` - `expect(second.status, second.stderr).toBe(0)`; `packages/database/test/migrate.test.ts:88` - `expect(await snapshot(url)).toEqual(before)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C20 | invalid-SQL migration -> `pnpm db:migrate` exits non-zero | `db` -t `failing_migration_exits_nonzero` exit 0 | `packages/database/test/migrate.test.ts:110` - `expect(result.status).not.toBe(0)`; `packages/database/test/migrate.test.ts:111` - `expect(result.status).not.toBeNull()`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C21 | `migrate` exits non-zero -> `docker compose up --wait` exits non-zero and `api` never starts | `stack` -t `api_never_starts_when_migrate_fails` exit 0 | `tests/stack/compose.test.ts:108` - `expect(migrate?.ExitCode).not.toBe(0)`; `tests/stack/compose.test.ts:110` - `expect(up.status).not.toBe(0)`; `tests/stack/compose.test.ts:118` - `expect(startedAt.output.trim()).toBe('0001-01-01T00:00:00Z')`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C22 | API `200` -> `/` answers `200`, heading "Gestão de Academia", text "API: operacional", `html lang="pt-BR"` | `web` -g `shows_api_operational` exit 0 | `apps/web/e2e/home.spec.ts:49` - `expect(response?.status()).toBe(200)`; `apps/web/e2e/home.spec.ts:51` - `expect(page.getByText('API: operacional', { exact: true })).toBeVisible()`; `apps/web/e2e/home.spec.ts:52` - `expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C23 | API `503`, hung or refusing -> `/` answers `200` and shows "API: indisponível" | `web` -g `shows_api_unavailable` exit 0 | `apps/web/e2e/home.spec.ts:61` - `expect(response?.status(), ...).toBe(200)`; `apps/web/e2e/home.spec.ts:62` - `expect(page.getByText('API: indisponível', { exact: true }), ...).toBeVisible()` over `['503', 'hung', 'refusing']`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C24 | hung API -> `/` answers within 4 s | `web` -g `hung_api_answers_within_4s` exit 0 | `apps/web/e2e/home.spec.ts:76` - `expect(elapsedMs).toBeLessThanOrEqual(4000)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C25 | running stack: `/` from the `web` container shows "API: operacional" | `stack` -t `home_reports_api_operational` exit 0 | `tests/stack/compose.test.ts:87` - `expect(response.status).toBe(200)`; `tests/stack/compose.test.ts:88` - `expect(html).toContain('API: operacional')`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C26 | clean clone, `pnpm install --frozen-lockfile` then `pnpm verify` exits 0 | `stack` -t `verify_exits_zero_on_clean_clone` exit 0 | `tests/stack/verify.test.ts:35` - `expect(install.status, ...).toBe(0)`; `tests/stack/verify.test.ts:36` - `expect(verify.status, ...).toBe(0)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C27 | `pnpm verify` runs `lint`, `typecheck`, `test`, `build` on api and web; first three also on contracts and database | `stack` -t `verify_runs_four_tasks_across_workspaces` exit 0 | `tests/stack/verify.test.ts:48` - `expect(expected).toHaveLength(14)`; `tests/stack/verify.test.ts:56` - `expect(task?.execution?.exitCode, ...).toBe(0)` per task id. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C28 | an injected failure in each of `lint`, `typecheck`, `test`, `build` makes `pnpm verify` exit non-zero | `stack` -t `verify_fails_on_each_broken_task` exit 0 | `tests/stack/verify.test.ts:95` - `expect(broken.status, ...).not.toBe(0)`; `tests/stack/verify.test.ts:99` - `expect(failed.map((t) => t.taskId), ...).toEqual([taskId])` over 4 faults. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C29 | each workspace's resolved TS config has `strict: true` and extends the `packages/config` base | `repo` -t `every_workspace_is_strict` exit 0 | `tests/repo/repo.test.ts:67` - `expect(declared.extends, ...).toBe('@academia/config/tsconfig.base.json')`; `tests/repo/repo.test.ts:76` - `expect(resolved.compilerOptions.strict, ...).toBe(true)`; `tests/repo/repo.test.ts:80` - `expect(base.compilerOptions.strict).toBe(true)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |
| C30 | `.github/workflows/ci.yml` exists, triggers on `push` and `pull_request`, runs `pnpm verify` | `repo` -t `ci_runs_verify_on_push_and_pr` exit 0 | `tests/repo/repo.test.ts:92` - `expect(events).toContain('push')`; `tests/repo/repo.test.ts:93` - `expect(events).toContain('pull_request')`; `tests/repo/repo.test.ts:96` - `expect(commands.some((run) => /^pnpm verify\s*$/m.test(run))).toBe(true)`. Proof verified at 253302d; citation carried from 05d3c85 | PASS |

Per target at `253302d`: `api` exit 0, 12 passed, 0 failed · `db` exit 0, 3 passed, 0 failed ·
`repo` exit 0, 4 passed, 0 failed · `web` exit 0, 3 passed, 0 failed · `stack` exit 0, 8 passed,
0 failed (186.7 s). 30 named tests, each listed individually as passed.

## Probes against the built API (verified at 253302d)

`pnpm --filter @academia/api build` (exit 0), then `node apps/api/dist/main.js` with
`DATABASE_URL=postgres://u:p@127.0.0.1:1/db` (unreachable on purpose) and `PORT` 4791 (4792 and 4793
for the two timeout probes, one instance each). Requests sent over raw TCP; stdout captured per
request, with 0.7-3 s of waiting after each response before counting. "Log lines" = JSON lines with
`msg: "request"` written for that request / of those, lines whose `requestId` equals the response
header. stderr stayed empty in every run. All processes stopped afterwards; ports confirmed free.

Rejected before delivery - out of C15, AC 9 and AC 10 as now written (round 2's P17-P20, P22-P24):

| # | Request | Status | `X-Request-Id` | Log lines | Enumerated as |
| --- | --- | --- | --- | --- | --- |
| R3 | `GET /health`, `Expect: 200-ok` (P17) | 417 | absent | 0 | `Expect` inválido |
| R4 | `GET /health` with no `Host` (P18) | 400 | absent | 0 | sem `Host` |
| R5 | `GET /health` with a 20 KB header (P19) | 431 | absent | 0 | cabeçalho grande demais |
| R6 | headers never completed (P20), answered after 90 s | 408 | absent | 0 | cabeçalhos nunca concluídos |
| R7 | `GARBAGE` as request line (P22) | 400 | absent | 0 | linha de requisição inválida |
| R8 | unknown method `FOO /health` (P23) | 400 | absent | 0 | linha de requisição inválida |
| R9 | `Content-Length` together with `Transfer-Encoding: chunked` (P24) | 400 | absent | 0 | `Content-Length` inconsistente |
| R10 | two different `Content-Length` headers | 400 | absent | 0 | `Content-Length` inconsistente |

Delivered to the application (headers complete, request dispatched) and the log line is missing:

| # | Request | Status | `X-Request-Id` | Body `requestId` | Log lines |
| --- | --- | --- | --- | --- | --- |
| R12 | `POST /health`, `Transfer-Encoding: chunked`, no content type, chunk size `zz` | **404** problem+json, written by the application | **present** | equal to header | **0** (10 runs of 10) |
| R13 | same, `Content-Type: application/json` (round 2's P25) | **400**, written by the HTTP server | absent | no body | **0** (6 runs of 6) |
| R14 | same, `Content-Type: application/x-www-form-urlencoded` | 400 | absent | no body | 0 |
| R15 | JSON, one valid chunk, then chunk size `zz` | 400 | absent | no body | 0 |
| R16 | JSON, `Content-Length: 50`, 5 bytes sent, client half-closes (round 2's P21) | 400 | absent | no body | 0 |
| R17 | JSON, `Content-Length: 50`, 5 bytes sent, connection held open | **408** after 330 s | absent | no body | **0** |
| R27 | complete JSON `POST /health` followed by `GARBAGE` in the same TCP segment | 400 | absent | no body | 0 (the application's own `404` is lost) |

Evidence that these are delivered, taken from the artifact rather than from Node's documentation:
R12 is answered by the application (the response carries its request id and its error contract);
R11 - `Content-Length: 50`, 5 bytes, **no** content type, half-close - is answered `404` by the
application with one log line while the body is still incomplete, so dispatch happens when the
headers end; R28 - the JSON request of R16/R17 with the connection left open - gets no response in
3 s, i.e. the application's body reader is holding it. In R13-R17 the request id had therefore
already been generated by `requestContext` and set on a response that is never sent.

Delivered and correct (one line, id equal to the header):

| # | Request | Status | `X-Request-Id` | Log lines |
| --- | --- | --- | --- | --- |
| R1 | `GET /nope` (control) | 404 | present, equals body | 1 / 1 |
| R2 | `GET /health` (db down) | 503 | present | 1 / 1 |
| R11 | `POST /health`, `Content-Length: 50`, 5 bytes, no content type, half-close | 404 (then a trailing raw 400 on the broken connection) | present, equals body | 1 / 1 |
| R18 | `POST` JSON `{}` with `Expect: 100-continue` | 100, then 404 | present, equals body | 1 / 1 |
| R19 | two pipelined `GET`s | 404, 404 | present on both | 2 / 2 |
| R20 | `GET /health HTTP/1.0` with no `Host` | 503 | present | 1 / 1 |
| R21 | absolute-form target `GET http://x/health` | 503 | present | 1 / 1 (`path` logged as `http://x/health`) |
| R22 | `OPTIONS *` | 404 | present, equals body | 1 / 1 |
| R23 | `HEAD /nope` | 404 | present | 1 / 1 |
| R24 | `GET /health?x=1&y=%zz` | 503 | present | 1 / 1 |
| R25 | `POST` with body `{bad` | 400 problem+json | present, equals body | 1 / 1 |
| R26 | `GET /health` with `Upgrade: websocket` | 503 | present | 1 / 1 |
| R29 | one valid chunk, then chunk size `zz`, no content type | 404 (then a trailing raw 400) | present, equals body | 1 / 1 |
| R30 | complete JSON request, connection then left idle | 404 | present, equals body | 1 / 1 |

Not answered, informational: `CONNECT x:443` - connection closed with no response and no line;
client destroying the socket right after sending `GET /health` - one line is still written.

## Findings

### F1 - a request delivered to the application can be answered with no log line - C15 (and AC 9, AC 10, door 3)

Run, not inferred: R12-R17, R27. The line is written from `res.on('finish', ...)`
(`apps/api/src/request-context.ts:13`). When Node's HTTP parser hits an error in the **body** of a
request it has already dispatched, the HTTP server destroys the socket (and, if the application has
not sent headers yet, writes its own `400`/`408` first). `finish` then never fires. A search of
`apps/api/src` and `apps/api/test` for `clientError`, `checkExpectation`, `requireHostHeader` and
`on('close'` returns nothing in `src`: no code handles this path.

Why it fails C15 as now written. The claim is "cada requisição que o servidor HTTP entrega à
aplicação e que é respondida gera exatamente uma linha de log". The criterion the user chose is
delivery, and:

- **R12** is the clean case: delivered, answered **by the application** with `404`, problem+json and
  `X-Request-Id`, and no line. It is not a response of the HTTP server at all, so no reading of the
  exemption reaches it. Deterministic, 10 of 10.
- **R13/R14/R15** (invalid chunk size; R13 is round 2's P25) and **R17** (body never completed,
  `408`) are delivered, then answered by the HTTP server. Neither is in the enumeration (which names
  "cabeçalhos nunca concluídos", not the body, and names no chunk error), and neither is "rejected
  before delivery". They also leave without `X-Request-Id` (AC 9) and without the error contract
  (door 3) - no check claims those two for a `400` or `408` (see F2).
- **R16** (round 2's P21) is arguably named by the enumeration ("`Content-Length` inconsistente"),
  so I do not rest the FAIL on it. But it is delivered, so the text contradicts itself on it (F4).

What is settled by the renegotiation: R3-R10 (round 2's P17-P20, P22-P24) are rejected before the
application is called and each matches an enumerated case. They no longer falsify anything.

The alternative reading, stated so it is visible: "respondida" could be read as "answered by the
application without the connection being torn down by a protocol error". Under it R13-R17 would be
out - but R12 still would not, since the application did answer it; and the text does not say so.
Either the code covers the path (for instance writing the line on `close` as well as on `finish`,
and a `clientError` listener for the responses the HTTP server writes), or the text draws the
boundary where the behaviour actually is and enumerates the body-phase cases. That is a decision
for the user, not for the Verifier - and this was the third round.

### F2 - precision gap, carried from 05d3c85 (first recorded at 4942cd0) and still open: C13/C14 enumerate by status, not by where the response is produced

Unchanged by `253302d`: C13, C14 and the `Coverage` row "respostas com `X-Request-Id` (4)" still
enumerate status codes, and the regression tests of the round 1 fix
(`apps/api/test/early-errors.test.ts:48`, `:63`) are still named by no check. Against the reworded
AC 9 ("toda resposta a uma requisição que o servidor HTTP entrega à aplicação") the gap is concrete
again: R13-R17 are delivered requests answered with no `X-Request-Id`, and C13/C14 pass only
because those answers are `400`/`408`, outside their sets. It fails no check as written; it stays a
finding.

### F3 - observations carried from 05d3c85, still open, none fails a check

No code changed, so all of these stand as written in round 2:

- `GET /%E0%A4%A` is `404`; `apps/api/test/early-errors.test.ts:43` accepts `[400, 404]`; no
  criterion fixes the status.
- `statusOf` (`apps/api/src/problem.filter.ts:16-20`) trusts any thrown object's numeric `status`
  in 400-499, so a non-`HttpException` error carrying an upstream status would surface as that 4xx
  instead of `500 internal_error`. No route in this feature can produce it.
- Body-parser rejections emit `bad_request`, `payload_too_large`, `unsupported_media_type`; door
  3's `validation_failed` is still emitted nowhere and `checks.md` defers it to `auth-rbac`.
- Both assemblies (`apps/api/src/main.ts:20`, `apps/api/test/support/app.ts:23`) call
  `configureApp` before `listen`; a third that forgets it would lose request id and logging and
  only C16 would notice.
- C29 exempts `packages/config` (`tests/repo/repo.test.ts:62`); C28 samples "qualquer workspace" on
  two (`tests/stack/verify.test.ts:63-86`); C26's "clean clone" is a copy of tracked plus
  untracked-not-ignored files (`tests/stack/support.ts:34`); `apps/api/src/problem.filter.ts:38`
  logs the exception stack to stderr, which AC 8 does not restrict.
- New, minor: an absolute-form request target is logged verbatim as `path` (`http://x/health`, R21).
  No criterion fixes the shape of `path`.

### F4 - the new delimitation: consistent and enumerated, but its criterion does not match its own list

Read at `253302d`, in all five places: AC 9 (`plan.md:104`), AC 10 (`plan.md:105`), the scope
paragraph (`plan.md:107-112`), door 3 (`plan.md:72`), C15 (`checks.md:83`) and the `Coverage` note
(`checks.md:175`).

- Consistent: all five use the same criterion (delivered to the application / rejected by Node's
  HTTP server before that) and the same reason. The scope paragraph and the `Coverage` note carry
  the same six cases and four statuses; the `Coverage` note says outright that the layer has no
  check and no member in any set. It is an enumerated exemption with a reason, not a blanket clause.
- Door 3 gives the statuses only (`400`, `408`, `417`, `431` "de protocolo"), not the six cases. A
  status list is not a criterion: R25 is a `400` that is in, R13 a `400` that the criterion puts in
  and the status list suggests is out.
- The criterion and the list disagree on one member. "`Content-Length` inconsistente" covers R9/R10
  (rejected in the headers, truly before delivery) but also R16, where the request is delivered and
  the application is holding it. And the stated reason - "não há método nem caminho interpretados" -
  is true for R7/R8 only in part and false for every body-phase case: in R12-R17 method and path
  were parsed and the request id generated.
- Missing members, if the intent is "whatever the HTTP server answers by itself": invalid chunk
  size (R13-R15), body never completed (R17), garbage after a complete request (R27).

## Level and sampling judgment

- Level (carried from 05d3c85; re-judged for C15 at 253302d): every claim naming a status, route or
  response shape has a proof crossing the HTTP boundary. C15's proof crosses it too. No level gap.
- Sampling (verified at 253302d for C15, carried for the rest): C13 over 4 statuses, C14 over 2,
  C15 over 2 requests, both bodyless `GET`s answered through `finish`. The sampling gap is C15 (F1):
  no sampled request has a body, so no sampled response ends any other way.
- `Test policy`: `checks.md` carries no such section; nothing to judge.

## Swept

Carried from 05d3c85: no `Swept` row resolves to `existing`; each names checks of this feature or is
`n/a` policy, so there is no cited pre-existing constraint to re-read. The `Swept` section of
`checks.md` was not touched by `253302d`. The observability row rests on C13 and C15; C15 fails
(F1).

## Steps not run

- Step 1 (binding sources), the `Coverage` recompute, `Test policy` verdicts and step 4 (fault
  injection): not run - scoped to `standard`/`ui`, and the profile is `light`. No tree mutation was
  made; the findings come from requests sent to the built artifact.
- Step 5 (walk the flow with the user): not run - there is no user in the Verifier's session.

## Tree state

`git status --porcelain` was empty before the round. After it, the only changes are this report
(`.specs/features/fundacao/verification.md`) and, through `lessons.py`, `.specs/lessons.json` and
`.specs/LESSONS.md`. No file under `apps/`, `packages/` or `tests/` was modified, no `git stash`, no
`pnpm install` in the real tree, nothing committed. `apps/api/dist` (git-ignored) was rebuilt for
the probes. No container or Compose project was left behind (`docker ps -a` and
`docker compose ls -a` empty), the probe processes were stopped and ports 4791-4793, 3100 and 3199
are free.

## Gate

`api` + `db` + `repo` + `web` + `stack` proof invocations at `253302d` (5 commands, each exit 0) - 30 passed, 0 failed. 29 of 30 checks proven; C15 fails on sampling with a counterexample reproduced on a request delivered to the application.
