# Fundação do projeto verification

**Verdict**: FAIL
**Profile**: light
**Diff range**: c90611e..05d3c8559a4e5cb38ebe2bcbff65166d0e21e19e
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 1 (at `4942cd0`) failed C13, C14 and C15 on a reproduced counterexample: responses produced
by the Express body parser and URL decoding left without `X-Request-Id`, with body `requestId`
`"undefined"`, with no log line, and an oversized body came out as 500. The fix (`05d3c85`, the
only commit after `4942cd0`) **closes all of that**: reproduced against the built API, the three
round 1 probes now carry the header, a matching body `requestId`, exactly one log line, and the
oversized body is `413`.

All 30 named proofs were re-run at `05d3c85` and passed. The verdict is still FAIL, on one check:
**C15** claims a log line for *each answered request*, and the built API answers well-formed HTTP
requests without ever reaching the request-id code - responses written by Node's own HTTP server
(`417` for `Expect: 200-ok`, `400` for a request with no `Host`, `431`, `408`, parser `400`s). Those
leave with no `X-Request-Id`, no problem+json body and no log line. C13 and C14 name the statuses
`200`/`503`/`404`/`500` only, and no response with one of those statuses was found without the
header, so they pass as written; the plan criteria behind them (AC 9 "toda resposta da API",
AC 10) are wider than the checks and are not met. Details in `## Findings`.

## Scope of this round

- Fix diff `4942cd0..05d3c85`: `apps/api/src/app.module.ts`, `apps/api/src/configure-app.ts` (new),
  `apps/api/src/main.ts`, `apps/api/src/problem.filter.ts`, `apps/api/test/early-errors.test.ts`
  (new), `apps/api/test/support/app.ts`. Nothing outside `apps/api`.
- Blast radius judged from the diff, not the message: `test/support/app.ts` is the harness of every
  `apps/api` proof except `boot.test.ts`, and `problem.filter.ts` now maps statuses differently, so
  C2-C4, C11-C15 and C17 depend on touched code. All of them re-ran green (as did every other
  proof). No cited test file was touched, so their line numbers did not move (checked for
  `request-id.test.ts` and `logging.test.ts` by reading them at `05d3c85`).
- Re-judged from scratch: C13, C14, C15 (the non-PASS verdicts of round 1).
- Carried forward, marked `carried from 4942cd0` per row: the assertion citation and level judgment
  of the 27 checks that passed in round 1. Their **proofs** are not carried: each ran at `05d3c85`.

## Checks

Proof commands were batched per target (5 invocations, verbose/list reporter, every test name
listed individually as passed), all run at `05d3c85`. `api` = `pnpm --filter "./apps/api" exec vitest run test/health.test.ts test/boot.test.ts test/problem.test.ts test/request-id.test.ts test/logging.test.ts test/contracts.test.ts --reporter=verbose -t "<12 names>"`;
`db` = `pnpm --filter "./packages/database" exec vitest run test/migrate.test.ts --reporter=verbose -t "<3 names>"`;
`repo` = `pnpm --filter "./tests/repo" exec vitest run repo.test.ts --reporter=verbose -t "<4 names>"`;
`web` = `pnpm --filter "./apps/web" exec playwright test e2e/home.spec.ts --reporter=list -g "<3 names>"`;
`stack` = `pnpm --filter "./tests/stack" exec vitest run compose.test.ts verify.test.ts --reporter=verbose -t "<8 names>"`.
In the Evidence column, `proof verified at 05d3c85` means the named test was seen passing at the
new HEAD; `citation carried from 4942cd0` means the located assertion is round 1's, in a file the
fix did not touch.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | clean clone, `docker compose up --build --wait` exits 0; `postgres`, `api`, `web` healthy | `stack` -t `up_wait_exits_zero_with_three_healthy` exit 0 | `tests/stack/compose.test.ts:52` - `expect(up.status, ...).toBe(0)`; `tests/stack/compose.test.ts:57` - `expect(container?.Health, ...).toBe('healthy')` over `['postgres', 'api', 'web']`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C2 | `GET /health` with Postgres up -> `200` and exactly `{"status":"ok","checks":{"database":"up"}}` | `api` -t `health_ok_200` exit 0 | `apps/api/test/health.test.ts:23` - `expect(response.status).toBe(200)`; `apps/api/test/health.test.ts:24` - `expect(await response.json()).toEqual({ status: 'ok', checks: { database: 'up' } })`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C3 | Postgres refusing connection -> `503` and exactly the `degraded`/`down` body | `api` -t `health_503_when_db_refuses` exit 0 | `apps/api/test/health.test.ts:33` - `expect(response.status).toBe(503)`; `apps/api/test/health.test.ts:34` - `expect(await response.json()).toEqual({ status: 'degraded', checks: { database: 'down' } })`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C4 | Postgres accepting and never answering -> `503` `degraded` within 3 s | `api` -t `health_503_within_3s_when_db_hangs` exit 0 | `apps/api/test/health.test.ts:47` - `expect(response.status).toBe(503)`; `apps/api/test/health.test.ts:49` - `expect(elapsedMs).toBeLessThanOrEqual(3000)`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C5 | each required env var missing -> real API process exits 1 naming it | `api` -t `missing_var_exits_1_naming_it` exit 0 | `apps/api/test/boot.test.ts:46` - `expect(status, ...).toBe(1)`; `apps/api/test/boot.test.ts:47` - `expect(output, ...).toContain(key)` for every key of `requiredKeys`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C6 | invalid `DATABASE_URL` -> exit 1 printing `DATABASE_URL` | `api` -t `invalid_var_exits_1_naming_it` exit 0 | `apps/api/test/boot.test.ts:54` - `expect(status).toBe(1)`; `apps/api/test/boot.test.ts:55` - `expect(output).toContain('DATABASE_URL')`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C7 | env failure output contains no variable value, including the password inside `DATABASE_URL` | `api` -t `env_failure_prints_no_values` exit 0 | `apps/api/test/boot.test.ts:69` - `expect(output).not.toContain(SECRET)`; `apps/api/test/boot.test.ts:71` - `expect(output).not.toContain(value)`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C8 | every required key of the api and web env schemas is in `.env.example` | `repo` -t `env_example_lists_every_required_key` exit 0 | `tests/repo/repo.test.ts:45` - `expect(listed, ...).toContain(key)` over `[...requiredKeys(apiEnvSchema), ...requiredKeys(webEnvSchema)]`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C9 | `git check-ignore .env` exits 0 | `repo` -t `dotenv_is_git_ignored` exit 0 | `tests/repo/repo.test.ts:52` - `expect(result.status, result.stderr).toBe(0)`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C10 | stack `postgres` runs major version 18 | `stack` -t `postgres_major_is_18` exit 0 | `tests/stack/compose.test.ts:70` - `expect(Math.floor(versionNum / 10000)).toBe(18)`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C11 | unknown route -> `404`, `application/problem+json`, body `type`, `title`, `status` 404, `code` `not_found`, `requestId` | `api` -t `unknown_route_404_problem` exit 0 | `apps/api/test/problem.test.ts:19` - `expect(response.status).toBe(404)`; `apps/api/test/problem.test.ts:20` - `expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json\b/)`; `apps/api/test/problem.test.ts:22` - `expect(body.code).toBe('not_found')`. Proof verified at 05d3c85 (filter and harness touched by the fix, proof still green; also observed on the built API, probe P1); citation carried from 4942cd0 | PASS |
| C12 | throwing handler -> `500` problem+json, `code` `internal_error`, no exception message or stack in body | `api` -t `unhandled_500_hides_exception` exit 0 | `apps/api/test/problem.test.ts:35` - `expect(response.status).toBe(500)`; `apps/api/test/problem.test.ts:37` - `expect(JSON.parse(text).code).toBe('internal_error')`; `apps/api/test/problem.test.ts:38` - `expect(text).not.toContain(BOOM_MESSAGE)`. Proof verified at 05d3c85 (`statusOf` at `apps/api/src/problem.filter.ts:16-20` still maps a plain `Error` to 500); citation carried from 4942cd0 | PASS |
| C13 | `X-Request-Id` present and non-empty on `200`, `503`, `404` and `500` responses | `api` -t `header_on_every_status` exit 0 | `apps/api/test/request-id.test.ts:33` - `expect(response.headers.get('x-request-id'), ...).toMatch(/\S/)` over 200, 503, 404, 500. Re-judged, verified at 05d3c85: round 1's counterexample is gone (oversized body is now `413` with the header, probe P3); every `503` and `404` observed on the built API across 15 Express-level probes carried the header; no response with one of the four named statuses was found without it. The responses found without the header are `400`/`408`/`417`/`431` (F1), outside the claim's set | PASS |
| C14 | on `404` and `500`, `X-Request-Id` equals body `requestId` | `api` -t `header_equals_body_request_id` exit 0 | `apps/api/test/request-id.test.ts:49` - `expect(response.headers.get('x-request-id')).toBe(body.requestId)` over 404, 500. Re-judged, verified at 05d3c85: every problem body observed on the built API (404, 400, 413, 415) had `requestId` equal to the header; `"undefined"` no longer appears; also `apps/api/test/early-errors.test.ts:59` - `expect(response.headers.get('x-request-id'), name).toBe(body.requestId)` (ran, passed, not a named proof) | PASS |
| C15 | each answered request writes exactly one JSON log line with `requestId`, `method`, `path`, `status`, `durationMs`, same id as header | `api` -t `one_json_line_per_request` exit 0 | `apps/api/test/logging.test.ts:62` - `expect(ofRequest, ...).toHaveLength(1)`; `apps/api/test/logging.test.ts:63` - `expect(ofRequest[0]).toMatchObject({ requestId, method: 'GET', path, status })`. Re-judged, verified at 05d3c85: proof green and round 1's counterexample is fixed (P2-P4: one line each), but the built API answered `GET /health` with `Expect: 200-ok` (`417`), `GET /health` without `Host` (`400`) and 6 other requests with **zero** log lines and no header - written by Node's HTTP server before Express; nothing in `apps/api/src` handles them (`apps/api/src/main.ts:22`, `apps/api/src/configure-app.ts:10`) | FAIL - sampling gap, new counterexample reproduced |
| C16 | real stack process: unknown route -> `404` problem+json, `X-Request-Id` equals body `requestId` | `stack` -t `running_api_uses_error_contract` exit 0 | `tests/stack/compose.test.ts:77` - `expect(response.status).toBe(404)`; `tests/stack/compose.test.ts:80` - `expect(response.headers.get('x-request-id')).toBe(body.requestId)`. Proof verified at 05d3c85 (image rebuilt from the fixed source by the proof); citation carried from 4942cd0 | PASS |
| C17 | real `/health` `200` and `503` and the `404` body validate against `packages/contracts` schemas | `api` -t `responses_match_contract_schemas` exit 0 | `apps/api/test/contracts.test.ts:25` - `expect(healthResponseSchema.safeParse(await ok.json()).success).toBe(true)`; `apps/api/test/contracts.test.ts:29` (503); `apps/api/test/contracts.test.ts:33` - `expect(problemSchema.safeParse(await notFound.json()).success).toBe(true)`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C18 | `pnpm db:migrate` on empty db exits 0 and installs `pg_trgm` | `db` -t `empty_db_migrates_and_installs_pg_trgm` exit 0 | `packages/database/test/migrate.test.ts:74` - `expect(result.status, result.stderr).toBe(0)`; `packages/database/test/migrate.test.ts:76` - `expect(extensions).toEqual([{ extname: 'pg_trgm' }])`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C19 | second `pnpm db:migrate` exits 0, schema and applied-migrations record identical | `db` -t `second_run_changes_nothing` exit 0 | `packages/database/test/migrate.test.ts:87` - `expect(second.status, second.stderr).toBe(0)`; `packages/database/test/migrate.test.ts:88` - `expect(await snapshot(url)).toEqual(before)`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C20 | invalid-SQL migration -> `pnpm db:migrate` exits non-zero | `db` -t `failing_migration_exits_nonzero` exit 0 | `packages/database/test/migrate.test.ts:110` - `expect(result.status).not.toBe(0)`; `packages/database/test/migrate.test.ts:111` - `expect(result.status).not.toBeNull()`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C21 | `migrate` exits non-zero -> `docker compose up --wait` exits non-zero and `api` never starts | `stack` -t `api_never_starts_when_migrate_fails` exit 0 | `tests/stack/compose.test.ts:108` - `expect(migrate?.ExitCode).not.toBe(0)`; `tests/stack/compose.test.ts:110` - `expect(up.status).not.toBe(0)`; `tests/stack/compose.test.ts:118` - `expect(startedAt.output.trim()).toBe('0001-01-01T00:00:00Z')`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C22 | API `200` -> `/` answers `200`, heading "Gestão de Academia", text "API: operacional", `html lang="pt-BR"` | `web` -g `shows_api_operational` exit 0 | `apps/web/e2e/home.spec.ts:49` - `expect(response?.status()).toBe(200)`; `apps/web/e2e/home.spec.ts:51` - `expect(page.getByText('API: operacional', { exact: true })).toBeVisible()`; `apps/web/e2e/home.spec.ts:52` - `expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C23 | API `503`, hung or refusing -> `/` answers `200` and shows "API: indisponível" | `web` -g `shows_api_unavailable` exit 0 | `apps/web/e2e/home.spec.ts:61` - `expect(response?.status(), ...).toBe(200)`; `apps/web/e2e/home.spec.ts:62` - `expect(page.getByText('API: indisponível', { exact: true }), ...).toBeVisible()` over `['503', 'hung', 'refusing']`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C24 | hung API -> `/` answers within 4 s | `web` -g `hung_api_answers_within_4s` exit 0 | `apps/web/e2e/home.spec.ts:76` - `expect(elapsedMs).toBeLessThanOrEqual(4000)`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C25 | running stack: `/` from the `web` container shows "API: operacional" | `stack` -t `home_reports_api_operational` exit 0 | `tests/stack/compose.test.ts:87` - `expect(response.status).toBe(200)`; `tests/stack/compose.test.ts:88` - `expect(html).toContain('API: operacional')`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C26 | clean clone, `pnpm install --frozen-lockfile` then `pnpm verify` exits 0 | `stack` -t `verify_exits_zero_on_clean_clone` exit 0 | `tests/stack/verify.test.ts:35` - `expect(install.status, ...).toBe(0)`; `tests/stack/verify.test.ts:36` - `expect(verify.status, ...).toBe(0)`. Proof verified at 05d3c85 (the clone's `pnpm verify` includes the new `early-errors.test.ts`); citation carried from 4942cd0 | PASS |
| C27 | `pnpm verify` runs `lint`, `typecheck`, `test`, `build` on api and web; first three also on contracts and database | `stack` -t `verify_runs_four_tasks_across_workspaces` exit 0 | `tests/stack/verify.test.ts:48` - `expect(expected).toHaveLength(14)`; `tests/stack/verify.test.ts:56` - `expect(task?.execution?.exitCode, ...).toBe(0)` per task id. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C28 | an injected failure in each of `lint`, `typecheck`, `test`, `build` makes `pnpm verify` exit non-zero | `stack` -t `verify_fails_on_each_broken_task` exit 0 | `tests/stack/verify.test.ts:95` - `expect(broken.status, ...).not.toBe(0)`; `tests/stack/verify.test.ts:99` - `expect(failed.map((t) => t.taskId), ...).toEqual([taskId])` over 4 faults. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C29 | each workspace's resolved TS config has `strict: true` and extends the `packages/config` base | `repo` -t `every_workspace_is_strict` exit 0 | `tests/repo/repo.test.ts:67` - `expect(declared.extends, ...).toBe('@academia/config/tsconfig.base.json')`; `tests/repo/repo.test.ts:76` - `expect(resolved.compilerOptions.strict, ...).toBe(true)`; `tests/repo/repo.test.ts:80` - `expect(base.compilerOptions.strict).toBe(true)`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |
| C30 | `.github/workflows/ci.yml` exists, triggers on `push` and `pull_request`, runs `pnpm verify` | `repo` -t `ci_runs_verify_on_push_and_pr` exit 0 | `tests/repo/repo.test.ts:92` - `expect(events).toContain('push')`; `tests/repo/repo.test.ts:93` - `expect(events).toContain('pull_request')`; `tests/repo/repo.test.ts:96` - `expect(commands.some((run) => /^pnpm verify\s*$/m.test(run))).toBe(true)`. Proof verified at 05d3c85; citation carried from 4942cd0 | PASS |

The new `apps/api/test/early-errors.test.ts` (2 tests) was also run at `05d3c85` and passed
(`pnpm --filter "./apps/api" exec vitest run test/early-errors.test.ts --reporter=verbose`, exit 0).
It is not a named proof of any check.

## Probes against the built API (verified at 05d3c85)

`pnpm --filter @academia/api build` (exit 0), then `node apps/api/dist/main.js` with
`DATABASE_URL=postgres://u:p@127.0.0.1:1/db` (unreachable on purpose) and `PORT=4791`; stdout
captured per request; process killed afterwards and the port confirmed free. "Log lines" = JSON
lines with `msg: "request"` written to stdout for that request / of those, lines whose `requestId`
equals the response header. stderr stayed empty for the whole run (no "unhandled exception").

Requested probes:

| # | Request | Status | `X-Request-Id` | Body `requestId` | Log lines (total / with that id) |
| --- | --- | --- | --- | --- | --- |
| P1 | `GET /nope` (control) | 404 `not_found` | present (uuid) | equal to header | 1 / 1 |
| P2 | `POST /health`, `Content-Type: application/json`, body `{bad` | 400 `bad_request` | present | equal to header | 1 / 1 |
| P3 | `POST /health`, ~300 KB JSON body | 413 `payload_too_large` | present | equal to header | 1 / 1 |
| P4 | `GET /%E0%A4%A` | 404 `not_found` | present | equal to header | 1 / 1 (`path` `/%E0%A4%A`) |

Round 1 had P2 = 400 / absent / `"undefined"` / none, P3 = 500 / absent / `"undefined"` / none,
P4 = 400 / absent / `"undefined"`. All three are fixed. P2-P4 were all `application/problem+json`.

Other Express-level paths (all go through the request-id code):

| # | Request | Status | `X-Request-Id` | Body `requestId` | Log lines |
| --- | --- | --- | --- | --- | --- |
| P5 | `GET /health` (db down) | 503 | present | n/a (health body) | 1 / 1 |
| P6 | `HEAD /health` | 503 | present | n/a | 1 / 1 |
| P7 | `OPTIONS /health` | 404 | present | equal | 1 / 1 |
| P8 | `POST /health`, body `{}` | 404 | present | equal | 1 / 1 |
| P9 | `POST`, `Content-Type: application/json; charset=bogus` | 415 `unsupported_media_type` | present | equal | 1 / 1 |
| P10 | `POST`, `Content-Encoding: bogus` | 415 | present | equal | 1 / 1 |
| P11 | `POST`, urlencoded 300 KB | 413 | present | equal | 1 / 1 |
| P12 | `POST`, urlencoded 2000 parameters | 413 | present | equal | 1 / 1 |
| P13 | `GET /health?%E0%A4%A=1` | 503 | present | n/a | 1 / 1 |
| P14 | `GET //a/..%2f` | 404 | present | equal | 1 / 1 |
| P15 | `PROPFIND /health` | 404 | present | equal | 1 / 1 |
| P16 | `GET /health` with `Upgrade: websocket` | 503 | present | n/a | 1 / 1 |

Responses that leave the API **without** passing through the request-id code (raw TCP, written by
Node's HTTP server; none has a body in the error contract):

| # | Request | Status | `X-Request-Id` | Body `requestId` | Log lines |
| --- | --- | --- | --- | --- | --- |
| P17 | `GET /health HTTP/1.1`, `Host: x`, `Expect: 200-ok` (well-formed) | **417** | **absent** | no body | **0** |
| P18 | `GET /health HTTP/1.1` with no `Host` header | **400** | **absent** | no body | **0** |
| P19 | `GET /health` with a 20 KB header | **431** | **absent** | no body | **0** |
| P20 | headers never completed, waited 100 s | **408** | **absent** | no body | **0** |
| P21 | `POST /health`, `Content-Length: 50`, 5 bytes sent, client half-closes | **400** | **absent** | no body | **0** |
| P22 | `GARBAGE` as request line | 400 | absent | no body | 0 |
| P23 | unknown method `FOO /health` | 400 | absent | no body | 0 |
| P24 | `Content-Length` together with `Transfer-Encoding: chunked` | 400 | absent | no body | 0 |
| P25 | invalid chunk size in a chunked body | 400 | absent | no body | 0 |

## Findings

### F1 - responses written by Node's HTTP server bypass request id, error contract and log - C15 (and AC 9, AC 10, door 3)

Run, not inferred: probes P17-P25. `configureApp` registers `requestContext` as the first Express
middleware (`apps/api/src/configure-app.ts:10`), which fixed everything Express produces. But the
HTTP server Nest creates at `apps/api/src/main.ts:22` answers some requests itself and Express is
never called: an unsupported `Expect` value (`417`), a missing `Host` (`400`), oversized headers
(`431`), a request timeout (`408`) and every parser error (`400`). A search of `apps/api/src` and
`apps/api/test` for `clientError`, `checkExpectation`, `requireHostHeader` and `getHttpServer`
returns nothing, so no code or test addresses this layer.

Why it fails C15: the claim is "cada requisição respondida gera exatamente uma linha de log". P17
and P18 are syntactically valid HTTP requests to an existing route; the API answered them and wrote
no line. P21 is a request that Express had already started handling when the 400 was written on
the socket. The named proof samples `GET /health` and an unknown route only
(`apps/api/test/logging.test.ts:43-44`).

Why C13 and C14 are not failed with it: both claims enumerate statuses (`200`, `503`, `404`, `500`;
`404`, `500`) and every escaping response has another status. Their plan criterion is not so
narrow: AC 9 says "em toda resposta da API" and door 3 says "toda resposta de erro é
`application/problem+json`"; P17-P25 violate both. That is a gap between the plan and the checks
(F2), reported here rather than hidden behind two PASS rows.

This is a judgment the orchestrator and the user should see as such: the alternative reading is
that protocol-level rejections by the HTTP server are not "requisições respondidas pela API". Under
that reading C15 would pass, but the checks do not say so; either the code handles this layer
(`clientError` and `checkExpectation` listeners on the HTTP server, `requireHostHeader`), or the
plan and checks state the exemption explicitly. Narrowing an AC is a plan decision, not a
Verifier's.

### F2 - precision gap, carried from 4942cd0 and still open: C13/C14/C15 enumerate by status, not by where the response is produced

`checks.md` was not changed by the fix. C13/C14 and the `Coverage` row "respostas com
`X-Request-Id` (4)" still enumerate status codes, and the fix's own regression tests
(`apps/api/test/early-errors.test.ts:48`, `:63`) are not named by any check, so no check obliges
the body-parser and URL-decoding paths to stay proven. The set that matters is the stage that
produces the response: handler, router miss, exception filter, body parser, URL decoding - and, per
F1, the HTTP server itself.

### F3 - observations on the fix that do not fail a check

- Run: `GET /%E0%A4%A` is now `404` (round 1: `400`). `apps/api/test/early-errors.test.ts:43`
  accepts `[400, 404]`; no criterion fixes the status.
- Read: `statusOf` (`apps/api/src/problem.filter.ts:16-20`) trusts any thrown object's numeric
  `status` in 400-499. A non-`HttpException` error thrown by a handler that happens to carry such
  a `status` (some HTTP client libraries attach the upstream status to their errors) would be
  reported to the caller as that 4xx instead of `500 internal_error`, with no error log. No route
  in this feature can produce it; a heads-up for the first feature that calls an external service.
- Run: body-parser rejections emit `bad_request`, `payload_too_large`, `unsupported_media_type`
  (P2, P3, P9). Door 3's `validation_failed` is still not emitted anywhere; `checks.md` defers it to
  `auth-rbac`.
- Read: the two assemblies (`apps/api/src/main.ts:20` and `apps/api/test/support/app.ts:23`) both
  call `configureApp` before `listen`; a third assembly that forgets it would silently lose request
  id and logging, and only C16 (real stack process) would notice.
- Carried from 4942cd0, unchanged: C29 exempts `packages/config` from "each workspace"
  (`tests/repo/repo.test.ts:62`); C28 samples AC 18's "qualquer workspace" on two workspaces
  (`tests/stack/verify.test.ts:63-86`); C26's "clean clone" is a copy of tracked plus
  untracked-not-ignored files (`tests/stack/support.ts:34`); `apps/api/src/problem.filter.ts`
  logs the exception stack to stderr, which AC 8 does not restrict (now at line 38).

## Level and sampling judgment

- Level (carried from 4942cd0; re-judged for C13-C15 at 05d3c85): every claim naming a status,
  route or response shape has a proof crossing the HTTP boundary. No level gap.
- Sampling (verified at 05d3c85 for C13-C15, carried for the rest): C13 over 4 statuses, C14 over 2,
  C15 over 2 requests. The remaining sampling gap is C15 (F1).
- `Test policy`: `checks.md` carries no such section; nothing to judge.

## Swept

Carried from 4942cd0: no `Swept` row resolves to `existing`; each names checks of this feature or is
`n/a` policy, so there is no cited pre-existing constraint to re-read. The observability row rests
on C13 and C15; C15 fails (F1).

## Steps not run

- Step 1 (binding sources), the `Coverage` recompute, `Test policy` verdicts and step 4 (fault
  injection): not run - scoped to `standard`/`ui`, and the profile is `light`. No tree mutation was
  made; the findings come from requests sent to the built artifact.
- Step 5 (walk the flow with the user): not run - there is no user in the Verifier's session.

## Tree state

`git status --porcelain` showed the same three untracked files before and after
(`.specs/LESSONS.md`, `.specs/lessons.json`, `.specs/features/fundacao/verification.md`). No
tracked file was modified, no `git stash`, no `pnpm install` in the real tree, nothing committed.
`apps/api/dist` (git-ignored) was rebuilt for the probes. No container or Compose project was left
behind (`docker ps -a` empty) and the probe process was stopped.

## Gate

`api` + `db` + `repo` + `web` + `stack` proof invocations at `05d3c85` (5 commands, each exit 0) - 30 passed, 0 failed. 29 of 30 checks proven; C15 fails on sampling with a reproduced counterexample.
