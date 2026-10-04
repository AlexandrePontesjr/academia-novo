# Fundação do projeto verification

**Verdict**: PASS
**Profile**: light
**Diff range**: c90611e..d06051743d55c04c84580bab63fef4dfa5d48110
**Round**: 4 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 4 exceeds the three-round bound of `verify.md`. The user explicitly authorized a fourth and
final round after round 3; this is that round.

Round 3 (at `253302d`) failed C15 only: the built API delivered requests to the application and
then lost the log line (and, for some, the request id and the error contract) when the HTTP parser
rejected the **body**. Since then the user decided to fix the code instead of moving the boundary
again: `3a8874f` rewrote the scope text and added C31, C32 and C33; `d060517` changed `apps/api`.

All 33 named proofs were run at `d060517` and passed. Every counterexample of round 3 (R12-R17,
R27) was sent again to the built `dist/main.js` and now gets exactly one log line, `X-Request-Id`
and `application/problem+json` with the same id - including R17, run for real with Node's default
timeouts (answered `408` after 329.5 s). 27 further adversarial probes (pipelining, keep-alive
reuse, garbage after a complete request, client disconnect, slow handler) produced no duplicate
line and no delivered-and-answered request without a line. Nothing found fails a check. The
findings below are open observations: one side effect introduced by the fix (F1), one status the
text does not define (F2) and stale enumerations in the text (F3, F4).

## Scope of this round

- Diff `253302d..d060517` (run: `git diff --stat 253302d..HEAD`): 15 files. Code and tests only
  under `apps/api` (`src/client-error.ts` new, `src/configure-app.ts`, `src/problem.filter.ts`,
  `src/request-context.ts`, `test/boot.test.ts`, `test/delivered-body-errors.test.ts` new,
  `test/support/app.ts`, `test/support/raw.ts` new, `test/support/servers.ts`); the rest is
  `.specs/`. `git diff --stat 253302d..HEAD -- packages tests apps/web` is empty.
  `git diff --name-status 253302d..HEAD` shows no deleted or renamed file.
- Text (`3a8874f`), read from the diff: `plan.md` - scope paragraph of AC 9/AC 10 and the list in
  door 3; `checks.md` - `Intent` count, a new section with C31-C33, four `Coverage` rows, the
  "Claims naming a status" line and the protocol note; `STATE.md` - AD-009. **The claim and proof
  lines of C1-C30 are untouched** (the only `checks.md` hunks are the ones just listed).
- No pre-existing assertion was weakened, deleted or skipped: `boot.test.ts` gained two imports and
  one appended test, its three earlier tests are byte-identical apart from position (+2 lines);
  `support/app.ts` returns one more field; `support/servers.ts` split `refusingDatabaseUrl` into
  `freePort` + the same URL. A search for `.skip`, `.only`, `.todo`, `xit(`, `xtest(` in
  `apps/api/test`, `packages/database/test`, `tests` and `apps/web/e2e` returns nothing.
- Judged from scratch at `d060517`: C15 (the only non-PASS of round 3) and the new C31, C32, C33.
- Carried forward, marked per row `carried from 05d3c85`: the assertion citation and level judgment
  of C1-C14 and C16-C30. Their **proofs** are not carried: each ran at `d060517`. Citations in
  `apps/api/test/boot.test.ts` (C5, C6, C7) were refreshed - they moved by two lines.

## Checks

Proof commands were batched per target (5 invocations, run one after another, verbose/list
reporter, every test name listed individually as passed), all at `d060517`.
`api` = `pnpm --filter "./apps/api" exec vitest run test/health.test.ts test/boot.test.ts test/problem.test.ts test/request-id.test.ts test/logging.test.ts test/contracts.test.ts test/delivered-body-errors.test.ts --reporter=verbose -t "<15 names>"`;
`db` = `pnpm --filter "./packages/database" exec vitest run test/migrate.test.ts --reporter=verbose -t "<3 names>"`;
`repo` = `pnpm --filter "./tests/repo" exec vitest run repo.test.ts --reporter=verbose -t "<4 names>"`;
`web` = `pnpm --filter "./apps/web" exec playwright test e2e/home.spec.ts --reporter=list -g "<3 names>"`;
`stack` = `pnpm --filter "./tests/stack" exec vitest run compose.test.ts verify.test.ts --reporter=verbose -t "<8 names>"`.
No invocation was retried. `stack` and `web` did not overlap. In the Evidence column,
`proof verified at d060517` means the named test was seen passing at the new HEAD; `carried from
05d3c85` means the located assertion and its level judgment are round 2's, in a file whose cited
lines were re-located by search at `d060517`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | clean clone, `docker compose up --build --wait` exits 0; `postgres`, `api`, `web` healthy | `stack` -t `up_wait_exits_zero_with_three_healthy` exit 0 | `tests/stack/compose.test.ts:52` - `expect(up.status, ...).toBe(0)`; `tests/stack/compose.test.ts:57` - `expect(container?.Health, ...).toBe('healthy')` over `['postgres', 'api', 'web']`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C2 | `GET /health` with Postgres up -> `200` and exactly `{"status":"ok","checks":{"database":"up"}}` | `api` -t `health_ok_200` exit 0 | `apps/api/test/health.test.ts:23` - `expect(response.status).toBe(200)`; `apps/api/test/health.test.ts:24` - `expect(await response.json()).toEqual({ status: 'ok', checks: { database: 'up' } })`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C3 | Postgres refusing connection -> `503` and exactly the `degraded`/`down` body | `api` -t `health_503_when_db_refuses` exit 0 | `apps/api/test/health.test.ts:33` - `expect(response.status).toBe(503)`; `apps/api/test/health.test.ts:34` - `expect(await response.json()).toEqual({ status: 'degraded', checks: { database: 'down' } })`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C4 | Postgres accepting and never answering -> `503` `degraded` within 3 s | `api` -t `health_503_within_3s_when_db_hangs` exit 0 | `apps/api/test/health.test.ts:47` - `expect(response.status).toBe(503)`; `apps/api/test/health.test.ts:49` - `expect(elapsedMs).toBeLessThanOrEqual(3000)`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C5 | each required env var missing -> real API process exits 1 naming it | `api` -t `missing_var_exits_1_naming_it` exit 0 | `apps/api/test/boot.test.ts:48` - `expect(status, ...).toBe(1)`; `apps/api/test/boot.test.ts:49` - `expect(output, ...).toContain(key)` for every key of `requiredKeys`. Proof verified at d060517; judgment carried from 05d3c85, line numbers refreshed at d060517 (file edited by the fix) | PASS |
| C6 | invalid `DATABASE_URL` -> exit 1 printing `DATABASE_URL` | `api` -t `invalid_var_exits_1_naming_it` exit 0 | `apps/api/test/boot.test.ts:56` - `expect(status).toBe(1)`; `apps/api/test/boot.test.ts:57` - `expect(output).toContain('DATABASE_URL')`. Proof verified at d060517; judgment carried from 05d3c85, line numbers refreshed at d060517 | PASS |
| C7 | env failure output contains no variable value, including the password inside `DATABASE_URL` | `api` -t `env_failure_prints_no_values` exit 0 | `apps/api/test/boot.test.ts:71` - `expect(output).not.toContain(SECRET)`; `apps/api/test/boot.test.ts:73` - `expect(output).not.toContain(value)`. Proof verified at d060517; judgment carried from 05d3c85, line numbers refreshed at d060517 | PASS |
| C8 | every required key of the api and web env schemas is in `.env.example` | `repo` -t `env_example_lists_every_required_key` exit 0 | `tests/repo/repo.test.ts:45` - `expect(listed, ...).toContain(key)` over `[...requiredKeys(apiEnvSchema), ...requiredKeys(webEnvSchema)]`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C9 | `git check-ignore .env` exits 0 | `repo` -t `dotenv_is_git_ignored` exit 0 | `tests/repo/repo.test.ts:52` - `expect(result.status, result.stderr).toBe(0)`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C10 | stack `postgres` runs major version 18 | `stack` -t `postgres_major_is_18` exit 0 | `tests/stack/compose.test.ts:70` - `expect(Math.floor(versionNum / 10000)).toBe(18)`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C11 | unknown route -> `404`, `application/problem+json`, body `type`, `title`, `status` 404, `code` `not_found`, `requestId` | `api` -t `unknown_route_404_problem` exit 0 | `apps/api/test/problem.test.ts:19` - `expect(response.status).toBe(404)`; `apps/api/test/problem.test.ts:20` - `expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json\b/)`; `apps/api/test/problem.test.ts:22` - `expect(body.code).toBe('not_found')`. Proof verified at d060517 (also observed on the built API, probe R1); citation carried from 05d3c85 | PASS |
| C12 | throwing handler -> `500` problem+json, `code` `internal_error`, no exception message or stack in body | `api` -t `unhandled_500_hides_exception` exit 0 | `apps/api/test/problem.test.ts:35` - `expect(response.status).toBe(500)`; `apps/api/test/problem.test.ts:37` - `expect(JSON.parse(text).code).toBe('internal_error')`; `apps/api/test/problem.test.ts:38` - `expect(text).not.toContain(BOOM_MESSAGE)`. Proof verified at d060517; citation carried from 05d3c85. The fix moved the write into `sendProblem` (`apps/api/src/problem.filter.ts:23`); the body is still built from the status only | PASS |
| C13 | `X-Request-Id` present and non-empty on `200`, `503`, `404` and `500` responses | `api` -t `header_on_every_status` exit 0 | `apps/api/test/request-id.test.ts:33` - `expect(response.headers.get('x-request-id'), ...).toMatch(/\S/)` over 200, 503, 404, 500. Proof verified at d060517; judgment carried from 05d3c85. Every response to a delivered request observed on the built API this round carried the header | PASS |
| C14 | on `404` and `500`, `X-Request-Id` equals body `requestId` | `api` -t `header_equals_body_request_id` exit 0 | `apps/api/test/request-id.test.ts:49` - `expect(response.headers.get('x-request-id')).toBe(body.requestId)` over 404, 500. Proof verified at d060517; judgment carried from 05d3c85. Every problem body observed on the built API this round (404, 400, 408, 413) had `requestId` equal to the header | PASS |
| C15 | each request the HTTP server delivers to the application and that is answered writes exactly one JSON log line with `requestId`, `method`, `path`, `status`, `durationMs`, same id as header | `api` -t `one_json_line_per_request` exit 0 | `apps/api/test/logging.test.ts:62` - `expect(ofRequest, ...).toHaveLength(1)`; `apps/api/test/logging.test.ts:63` - `expect(ofRequest[0]).toMatchObject({ requestId, method: 'GET', path, status })`; `apps/api/test/logging.test.ts:57` - `expect(lines).toHaveLength(cases.length)`. Re-judged from scratch, verified at d060517. The proof's own sample is still two bodyless `GET`s (`logging.test.ts:43-44`); the family that falsified the claim in round 3 is now claimed and proven by C31-C33, and no counterexample remains on the built API: R12 (10 of 10), R13 (6 of 6), R14-R17 and R27 each wrote exactly one line whose `requestId` equals the response header, and 27 further delivered-request probes wrote one line each, never two. The line is now written once on `finish` or `close` (`apps/api/src/request-context.ts:49-51`, guard at `:32`) | PASS |
| C16 | real stack process: unknown route -> `404` problem+json, `X-Request-Id` equals body `requestId` | `stack` -t `running_api_uses_error_contract` exit 0 | `tests/stack/compose.test.ts:77` - `expect(response.status).toBe(404)`; `tests/stack/compose.test.ts:80` - `expect(response.headers.get('x-request-id')).toBe(body.requestId)`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C17 | real `/health` `200` and `503` and the `404` body validate against `packages/contracts` schemas | `api` -t `responses_match_contract_schemas` exit 0 | `apps/api/test/contracts.test.ts:25` - `expect(healthResponseSchema.safeParse(await ok.json()).success).toBe(true)`; `apps/api/test/contracts.test.ts:29` (503); `apps/api/test/contracts.test.ts:33` - `expect(problemSchema.safeParse(await notFound.json()).success).toBe(true)`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C18 | `pnpm db:migrate` on empty db exits 0 and installs `pg_trgm` | `db` -t `empty_db_migrates_and_installs_pg_trgm` exit 0 | `packages/database/test/migrate.test.ts:74` - `expect(result.status, result.stderr).toBe(0)`; `packages/database/test/migrate.test.ts:76` - `expect(extensions).toEqual([{ extname: 'pg_trgm' }])`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C19 | second `pnpm db:migrate` exits 0, schema and applied-migrations record identical | `db` -t `second_run_changes_nothing` exit 0 | `packages/database/test/migrate.test.ts:87` - `expect(second.status, second.stderr).toBe(0)`; `packages/database/test/migrate.test.ts:88` - `expect(await snapshot(url)).toEqual(before)`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C20 | invalid-SQL migration -> `pnpm db:migrate` exits non-zero | `db` -t `failing_migration_exits_nonzero` exit 0 | `packages/database/test/migrate.test.ts:110` - `expect(result.status).not.toBe(0)`; `packages/database/test/migrate.test.ts:111` - `expect(result.status).not.toBeNull()`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C21 | `migrate` exits non-zero -> `docker compose up --wait` exits non-zero and `api` never starts | `stack` -t `api_never_starts_when_migrate_fails` exit 0 | `tests/stack/compose.test.ts:108` - `expect(migrate?.ExitCode).not.toBe(0)`; `tests/stack/compose.test.ts:110` - `expect(up.status).not.toBe(0)`; `tests/stack/compose.test.ts:118` - `expect(startedAt.output.trim()).toBe('0001-01-01T00:00:00Z')`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C22 | API `200` -> `/` answers `200`, heading "Gestão de Academia", text "API: operacional", `html lang="pt-BR"` | `web` -g `shows_api_operational` exit 0 | `apps/web/e2e/home.spec.ts:49` - `expect(response?.status()).toBe(200)`; `apps/web/e2e/home.spec.ts:51` - `expect(page.getByText('API: operacional', { exact: true })).toBeVisible()`; `apps/web/e2e/home.spec.ts:52` - `expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C23 | API `503`, hung or refusing -> `/` answers `200` and shows "API: indisponível" | `web` -g `shows_api_unavailable` exit 0 | `apps/web/e2e/home.spec.ts:61` - `expect(response?.status(), ...).toBe(200)`; `apps/web/e2e/home.spec.ts:62` - `expect(page.getByText('API: indisponível', { exact: true }), ...).toBeVisible()` over `['503', 'hung', 'refusing']`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C24 | hung API -> `/` answers within 4 s | `web` -g `hung_api_answers_within_4s` exit 0 | `apps/web/e2e/home.spec.ts:76` - `expect(elapsedMs).toBeLessThanOrEqual(4000)`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C25 | running stack: `/` from the `web` container shows "API: operacional" | `stack` -t `home_reports_api_operational` exit 0 | `tests/stack/compose.test.ts:87` - `expect(response.status).toBe(200)`; `tests/stack/compose.test.ts:88` - `expect(html).toContain('API: operacional')`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C26 | clean clone, `pnpm install --frozen-lockfile` then `pnpm verify` exits 0 | `stack` -t `verify_exits_zero_on_clean_clone` exit 0 | `tests/stack/verify.test.ts:35` - `expect(install.status, ...).toBe(0)`; `tests/stack/verify.test.ts:36` - `expect(verify.status, ...).toBe(0)`. Proof verified at d060517 (so lint, typecheck, test and build pass with the fix's new files); citation carried from 05d3c85 | PASS |
| C27 | `pnpm verify` runs `lint`, `typecheck`, `test`, `build` on api and web; first three also on contracts and database | `stack` -t `verify_runs_four_tasks_across_workspaces` exit 0 | `tests/stack/verify.test.ts:48` - `expect(expected).toHaveLength(14)`; `tests/stack/verify.test.ts:56` - `expect(task?.execution?.exitCode, ...).toBe(0)` per task id. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C28 | an injected failure in each of `lint`, `typecheck`, `test`, `build` makes `pnpm verify` exit non-zero | `stack` -t `verify_fails_on_each_broken_task` exit 0 | `tests/stack/verify.test.ts:95` - `expect(broken.status, ...).not.toBe(0)`; `tests/stack/verify.test.ts:99` - `expect(failed.map((t) => t.taskId), ...).toEqual([taskId])` over 4 faults. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C29 | each workspace's resolved TS config has `strict: true` and extends the `packages/config` base | `repo` -t `every_workspace_is_strict` exit 0 | `tests/repo/repo.test.ts:67` - `expect(declared.extends, ...).toBe('@academia/config/tsconfig.base.json')`; `tests/repo/repo.test.ts:76` - `expect(resolved.compilerOptions.strict, ...).toBe(true)`; `tests/repo/repo.test.ts:80` - `expect(base.compilerOptions.strict).toBe(true)`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C30 | `.github/workflows/ci.yml` exists, triggers on `push` and `pull_request`, runs `pnpm verify` | `repo` -t `ci_runs_verify_on_push_and_pr` exit 0 | `tests/repo/repo.test.ts:92` - `expect(events).toContain('push')`; `tests/repo/repo.test.ts:93` - `expect(events).toContain('pull_request')`; `tests/repo/repo.test.ts:96` - `expect(commands.some((run) => /^pnpm verify\s*$/m.test(run))).toBe(true)`. Proof verified at d060517; citation carried from 05d3c85 | PASS |
| C31 | in each of the five delivered-then-rejected-body cases, exactly one JSON log line with `requestId`, `method` `POST`, `path` `/health`, `status`, `durationMs`; line status equals the response status: (a) 404, (b) 400, (c) 400, (d) 400, (e) 408 | `api` -t `delivered_body_error_logs_one_line` exit 0 | `apps/api/test/delivered-body-errors.test.ts:102` - `expect(lines, ...).toHaveLength(1)`; `apps/api/test/delivered-body-errors.test.ts:103` - `expect(lines[0], name).toMatchObject({ method: 'POST', path: '/health', status })`; `apps/api/test/delivered-body-errors.test.ts:101` - `expect(response?.status, name).toBe(status)`; `:104` (`requestId` matches a UUID), `:105` (`durationMs` is a number). Expected statuses are literals in the table at `:11-45` (404, 400, 400, 400, 408); `:97` - `expect(outcomes).toHaveLength(cases.length)` keeps all five in. Judged from scratch, verified at d060517. Same five requests observed on the built API: R12, R13, R14, R16, R17 | PASS |
| C32 | in each of the five cases, `X-Request-Id` equals the log line's `requestId`, `Content-Type: application/problem+json`, body `status` equal to the response's, `requestId` equal to the header, `code` (a) `not_found`, (b)-(d) `bad_request`, (e) `request_timeout` | `api` -t `delivered_body_error_has_request_id_and_error_contract` exit 0 | `apps/api/test/delivered-body-errors.test.ts:118` - `expect(lines.map((line) => line.requestId), name).toEqual([requestId])`; `:119` - `expect(response?.headers['content-type'], name).toMatch(/^application\/problem\+json\b/)`; `:121` - `expect(body.status, name).toBe(status)`; `:122` - `expect(body.code, name).toBe(code)`; `:123` - `expect(body.requestId, name).toBe(requestId)`. Expected codes are literals in the table at `:11-45`. Judged from scratch, verified at d060517 | PASS |
| C33 | real process `dist/main.js`, case (b): `400` problem+json, `X-Request-Id` equals body `requestId`, exactly one stdout log line with that `requestId` and `status` 400 | `api` -t `real_process_logs_delivered_body_error` exit 0 | `apps/api/test/boot.test.ts:108` - `expect(response?.status).toBe(400)`; `apps/api/test/boot.test.ts:109` - `expect(response?.headers['content-type']).toMatch(/^application\/problem\+json\b/)`; `apps/api/test/boot.test.ts:111` - `expect(body.requestId).toBe(requestId)`; `apps/api/test/boot.test.ts:116` - `expect(lines).toHaveLength(1)`; `apps/api/test/boot.test.ts:117` - `expect(lines[0]).toMatchObject({ requestId, status: 400 })`. The process is `spawn(process.execPath, ['dist/main.js'], ...)` at `:80`, built by `pnpm build` in `beforeAll` (`:21`). Judged from scratch, verified at d060517. Same request observed by hand on the built API: R13, 6 of 6 | PASS |

Per target at `d060517`: `api` exit 0, 15 passed, 0 failed (1 unnamed test filtered out by `-t`) ·
`db` exit 0, 3 passed, 0 failed · `repo` exit 0, 4 passed, 0 failed · `web` exit 0, 3 passed,
0 failed · `stack` exit 0, 8 passed, 0 failed (196.9 s). 33 named tests, each listed individually
as passed. Extra, not a proof of any check: the whole `apps/api` suite (`vitest run`, no filter)
ran afterwards - 8 files, 18 passed, 0 failed, including the three tests no check names
(`errors_before_routing_use_error_contract_and_request_id`, `errors_before_routing_are_logged_once`,
`client_disconnect_before_response_logs_one_line`).

## Probes against the built API (verified at d060517)

`pnpm --filter @academia/api build` (exit 0), then `node apps/api/dist/main.js` with
`DATABASE_URL=postgres://u:p@127.0.0.1:1/db` (unreachable on purpose) and `PORT` 4791 (4792 for R6,
4793 for R17, one instance each; 4794 for the S probes, with `DATABASE_URL` pointing at a TCP
server that accepts and never answers, so `GET /health` takes about 2 s). Requests sent over raw
TCP; stdout captured per request, counted 1.2-5 s after the connection ended. "Log lines" = JSON
lines with `msg: "request"` written for that request / of those, lines whose `requestId` equals a
response header. No probe produced two lines with the same `requestId`. stderr stayed empty except
in N7. All processes stopped afterwards; ports confirmed free.

Rejected before delivery - out of C15, AC 9 and AC 10 (unchanged from round 3, each matches the
enumeration now in the text):

| # | Request | Status | `X-Request-Id` | Log lines | Enumerated as |
| --- | --- | --- | --- | --- | --- |
| R3 | `GET /health`, `Expect: 200-ok` | 417 | absent | 0 | `Expect` inválido |
| R4 | `GET /health` with no `Host` | 400 | absent | 0 | sem header `Host` |
| R5 | `GET /health` with a 20 KB header | 431 | absent | 0 | cabeçalho grande demais |
| R6 | headers never completed, answered after 89.4 s | 408 | absent | 0 | cabeçalhos nunca concluídos |
| R7 | `GARBAGE` as request line | 400 | absent | 0 | linha de requisição inválida |
| R8 | unknown method `FOO /health` | 400 | absent | 0 | linha de requisição inválida |
| R9 | `Content-Length` together with `Transfer-Encoding: chunked` | 400 | absent | 0 | `Content-Length` junto de `Transfer-Encoding` |
| R10 | two different `Content-Length` headers | 400 | absent | 0 | `Content-Length` duplicado |

Round 3's counterexamples - delivered, body rejected afterwards. All fixed:

| # | Request | Status | `X-Request-Id` | Body `requestId` / `code` | Log lines | Round 3 |
| --- | --- | --- | --- | --- | --- | --- |
| R12 | `POST /health`, `Transfer-Encoding: chunked`, no content type, chunk size `zz` | 404 problem+json | present | equal to header / `not_found` | 1 / 1, status 404 (10 runs of 10) | 0 lines |
| R13 | same, `Content-Type: application/json` | 400 problem+json | present | equal to header / `bad_request` | 1 / 1, status 400 (6 runs of 6) | raw 400, no id, 0 lines |
| R14 | same, `Content-Type: application/x-www-form-urlencoded` | 400 problem+json | present | equal to header / `bad_request` | 1 / 1, status 400 | raw 400, no id, 0 lines |
| R15 | JSON, one valid chunk, then chunk size `zz` | 400 problem+json | present | equal to header / `bad_request` | 1 / 1, status 400 | raw 400, no id, 0 lines |
| R16 | JSON, `Content-Length: 50`, 5 bytes sent, client half-closes | 400 problem+json | present | equal to header / `bad_request` | 1 / 1, status 400 | raw 400, no id, 0 lines |
| R17 | JSON, `Content-Length: 50`, 5 bytes sent, connection held open (Node defaults) | 408 problem+json after 329.5 s | present | equal to header / `request_timeout` | 1 / 1, status 408, `durationMs` 329512 | raw 408, no id, 0 lines |
| R27 | complete JSON `POST /health` followed by `GARBAGE` in the same TCP segment | 404 problem+json, `Connection: close` | present | equal to header / `not_found` | 1 / 1, status 404 | raw 400, no id, 0 lines |

Delivered and correct, as in round 3 (one line, id equal to the header):

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

New adversarial probes this round:

| # | Request | Status | `X-Request-Id` | Body `requestId` / `code` | Log lines |
| --- | --- | --- | --- | --- | --- |
| N1 | R12 in two TCP segments (head, 300 ms, `zz`) | 404 (then a trailing raw 400) | present | equal / `not_found` | 1 / 1 |
| N2 | R13 in two TCP segments (3 runs) | 400 problem+json | present | equal / `bad_request` | 1 / 1 each |
| N3 | `GET /health` + `GARBAGE` in the same segment (3 runs) | 503, `Connection: close` | present | - | 1 / 1 each |
| N4 | pipelined `GET /nope` + JSON chunked `zz`, same segment (3 runs) | 404, then 400 problem+json | present on both, different ids | equal on both | 2 / 2 each |
| N5 | keep-alive: `POST` `{bad` (400), then `GET /nope` on the same connection | 400, 404 | present on both | equal on both | 2 / 2 |
| N6 | keep-alive: `GET /nope`, 500 ms, then `GARBAGE` | 404, then raw 400 (not delivered) | present on the 404 | equal | 1 / 1 |
| N7 | 16 pipelined `GET /health` on one connection | 16 x 503 | present on all 16 | - | 16 / 16; **stderr: `MaxListenersExceededWarning`** (F1) |
| N9 | JSON chunked with a 20 KB chunk extension | 413 problem+json | present | equal / `payload_too_large` | 1 / 1 |
| N10 | keep-alive: valid chunked JSON `POST`, then JSON chunked `zz` | 404, then 400 problem+json | present on both | equal on both | 2 / 2 |
| N11 | JSON body of 200 KB (over the body reader's limit) | 413 problem+json | present | equal / `payload_too_large` | 1 / 1 |
| N12 | JSON chunked: one valid chunk, 300 ms, then `zz` | 400 problem+json | present | equal / `bad_request` | 1 / 1 |
| N13 | pipelined `GET /nope` + truncated JSON (R16), half-close | 404, then 400 problem+json | present on both | equal on both | 2 / 2 |
| N14 | R13, then `GET /nope` on the same connection | 400 problem+json, connection closed; the second request is never read | present | equal | 1 / 1 |
| N15 | `GET /health`, 100 ms, then binary garbage | 503, then raw 400 (not delivered) | present on the 503 | - | 1 / 1 |
| N16 | `Content-Type: text/plain`, chunked `zz` | 404 problem+json | present | equal / `not_found` | 1 / 1 |
| N17 | `GET /nope` after all of the above (server still healthy) | 404 | present | equal | 1 / 1 |
| S1 | slow `GET /health` (control) | 503 after 2.0 s | present | - | 1 / 1 |
| S2 | slow `GET /health`, 500 ms later `GARBAGE` on the same connection | 503 after 2.0 s, `Connection: close` | present | - | 1 / 1 |
| S4 | slow `GET /health` pipelined with JSON chunked `zz` | 503, then 400 problem+json | present on both | equal on the 400 | 2 / 2 |

Delivered and never answered (the client left) - outside "e que é respondida", informational:

| # | Request | Response | Log lines | Line status |
| --- | --- | --- | --- | --- |
| R28 | JSON, `Content-Length: 50`, 5 bytes, client destroys the socket after 3 s | none | 1 | **400** (F2) |
| N8 | same, client destroys after 300 ms | none | 1 | **400** (F2) |
| S3 | slow `GET /health`, client destroys after 500 ms | none | 1 | 499 |
| S5 | slow `GET /health`, client half-closes right after sending | none - Node closes the connection | 1 | 499 |
| I2 | `GET /health` (fast), client destroys right after sending | 503 written before the close | 1 / 1 | 503 |
| I1 | `CONNECT x:443` | connection closed, no response | 0 | - (never delivered to the application) |

## Findings

No finding fails a check.

### F1 - new, introduced by the fix: more than 10 requests in flight on one connection print `MaxListenersExceededWarning` on stderr

Run, not inferred: N7. `requestContext` adds one `close` listener to the **socket** per request
(`apps/api/src/request-context.ts:51`) and removes it when that request is logged (`:34`). With 11
or more pipelined requests still unanswered on one connection, Node prints
`MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 close listeners added
to [Socket]` (once per process). The behaviour stays correct - 16 responses, 16 lines, one each -
and the listeners are removed, so it is noise on stderr, not a leak. A reverse proxy that reuses
upstream connections without pipelining will not trigger it. No criterion covers stderr.

### F2 - precision gap, new: the status of the log line for a request the client abandons is not defined, and the code gives two answers

Run: R28, N8, S3, S5. The code introduces a status the text never names: `499` when no response
header was sent (`apps/api/src/request-context.ts:8`, `:44`). A bodyless request abandoned by the
client is logged `499` (S3, S5). A request abandoned **while its body is incomplete** is logged
`400` although the client received nothing (R28, N8): the line's status is whatever was last set on
the response object (`:44`), and something writes a `400` to the dead connection first - I did not
determine whether it is `onClientError` (`apps/api/src/client-error.ts:56`) or the body reader's
abort reaching `ProblemFilter` (`apps/api/src/problem.filter.ts:56`). AC 10 and C15 speak of
requests that are answered, and C31 fixes the line's status only for its five cases, so nothing
fails; but a log reader cannot tell this `400` from one the client actually got. The text should
say what the line records when no response reaches the client.

### F3 - text: enumerations left stale by `3a8874f`, and the one sentence left on purpose

- `checks.md:183` - the `Coverage` row "`code` emitidos nesta feature (2)" still lists `not_found`
  and `internal_error` only, while C32 (`checks.md:167`) asserts `bad_request` and
  `request_timeout` as emitted, and the built API also emits `payload_too_large` (N9, N11). The
  members are proven (C32); the set is miscounted.
- `plan.md:61` - `Surface` still gives the error row's statuses as `404`, `500`; C31 now fixes
  `400` and `408` for the same row.
- `plan.md:72` - door 3 now carries the same six excluded cases as the scope paragraph, but keeps
  the old reason, "porque não há método nem caminho interpretados". The scope paragraph
  (`plan.md:113`), the `Coverage` note (`checks.md:201`) and AD-009 say "a aplicação nunca é
  chamada". The old reason is false for R3, R4 and R5, where method and path were parsed. Left as it
  was on the user's instruction; recorded because the two sentences still disagree.
- The criterion and the list now agree on every member I could test: R3-R10 are all rejected before
  the application is called (no id, no line), and round 3's misfit ("`Content-Length`
  inconsistente", which also named the delivered R16) is gone - R9 and R10 are what the new wording
  names, and R16 is in and proven (C31 case (d)).

### F4 - carried from 05d3c85, still open, none fails a check

- F2 of round 3 (C13/C14 and the row `checks.md:184` enumerate by status, not by where the
  response is produced) is narrowed, not closed: the body-phase `400`/`408` are now claimed by C32,
  but the regression tests of the round 1 fix (`apps/api/test/early-errors.test.ts:48`, `:63`) and
  the new `client_disconnect_before_response_logs_one_line`
  (`apps/api/test/delivered-body-errors.test.ts:129`) are named by no check. Its two assertions
  (`:141`, `:142`) do not fix the line's status - see F2.
- `GET /%E0%A4%A` is `404`; `apps/api/test/early-errors.test.ts:43` accepts `[400, 404]`.
- `statusOf` (`apps/api/src/problem.filter.ts:16-20`) trusts any thrown object's numeric `status`
  in 400-499.
- Door 3's `validation_failed` is emitted nowhere; `checks.md` defers it to `auth-rbac`.
- Both assemblies call `configureApp` before `listen` (`apps/api/src/main.ts:20`,
  `apps/api/test/support/app.ts:24`), and it now also registers the `clientError` listener
  (`apps/api/src/configure-app.ts:14`); a third assembly that forgets it loses request id, logging
  and the protocol-error path together.
- C29 exempts `packages/config` (`tests/repo/repo.test.ts:62`); C28 samples "qualquer workspace" on
  two (`tests/stack/verify.test.ts:63-86`); C26's "clean clone" is a copy of tracked plus
  untracked-not-ignored files (`tests/stack/support.ts:34`); `apps/api/src/problem.filter.ts:44`
  logs the exception stack to stderr, which AC 8 does not restrict.
- An absolute-form request target is logged verbatim as `path` (`http://x/health`, R21).
- A delivered request answered by the application before the parser reaches the bad body (R11, R29,
  N1) is followed on the same connection by Node-style raw `400` bytes
  (`apps/api/src/client-error.ts:41`): the request is already logged, so the error is treated as
  "before delivery". The request itself has its one line and its id.

## Level and sampling judgment

- Level (C15, C31, C32, C33 judged at d060517; the rest carried from 05d3c85): every claim naming a
  status, route or response shape has a proof crossing the HTTP boundary. C31 and C32 cross it with
  a raw TCP socket against the test assembly, which calls the same `configureApp`; C33 crosses it
  against the real `dist/main.js`. No level gap.
- Sampling (verified at d060517): C31 and C32 are table-driven over all five cases the claim names,
  with the expected status and code as literals per case; `toHaveLength(cases.length)` prevents a
  case from dropping out silently. Both tests assert on one shared run made in `beforeAll`
  (`apps/api/test/delivered-body-errors.test.ts:67-90`); each captures stdout for the whole
  exchange plus 500 ms, so "exactly one" counts every request line in the window, not only lines
  matching an id. C33 samples one case, (b), as its claim says.
- One thing the harness does not exercise and the probe does: case (e) runs with
  `requestTimeout` and `headersTimeout` lowered to 1 s on the test server
  (`apps/api/test/delivered-body-errors.test.ts:71-72`). The claim says "até o tempo limite de
  requisição do servidor", so this is within the claim; the default 300 s path was run against the
  built process (R17: `408` after 329.5 s, one line).
- C15's own proof still samples two bodyless `GET`s. Under `light` I do not rest its PASS on that
  sample alone: the gap round 3 reproduced is closed by C31-C33 and by the probes above.
- `Test policy`: `checks.md` carries no such section; nothing to judge.

## Swept

Carried from 05d3c85 and re-read at d060517: no `Swept` row resolves to `existing`; each names
checks of this feature or is `n/a` policy, so there is no cited pre-existing constraint to re-read.
`3a8874f` did not touch the `Swept` section. The observability row rests on C13 and C15, both PASS.

## Steps not run

- Step 1 (binding sources), the `Coverage` recompute, `Test policy` verdicts and step 4 (fault
  injection): not run - scoped to `standard`/`ui`, and the profile is `light`. The plan marks no
  binding source. No tree mutation was made; the findings come from requests sent to the built
  artifact. F3 reports a stale `Coverage` row that I read, not recomputed.
- Step 5 (walk the flow with the user): not run - there is no user in the Verifier's session.

## Tree state

`git status --porcelain` was empty before the round and empty again after the proofs and probes.
The only changes are this report (`.specs/features/fundacao/verification.md`) and, through
`lessons.py`, `.specs/lessons.json` and `.specs/LESSONS.md`. No file under `apps/`, `packages/` or
`tests/` was modified, no `git stash`, no `pnpm install` in the real tree, nothing committed.
`apps/api/dist` (git-ignored) was rebuilt for the probes and by `boot.test.ts`. No container or
Compose project was left behind (`docker ps -a` and `docker compose ls -a` empty), the probe
processes were stopped and ports 4791-4794, 3100 and 3199 are free.

## Gate

`api` + `db` + `repo` + `web` + `stack` proof invocations at `d060517` (5 commands, each exit 0) - 33 passed, 0 failed. 33 of 33 checks proven with located evidence.
