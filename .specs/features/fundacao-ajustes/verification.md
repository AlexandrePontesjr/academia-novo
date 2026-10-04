# Ajustes da fundação verification

**Verdict**: PASS
**Profile**: light
**Diff range**: cc93253..3d8e1500665e10c7d13e4394399a890ba944acee
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Both named proofs were run by the Verifier at `3d8e150` in a single invocation; each test appears
individually in the output as run and passed. Both tests exist in the tree, both were added by this
diff, and each check has a located assertion that targets the value the check defines. The samples
are as wide as the claims (11 and 16; cases (a) and (b)) and both proofs cross the HTTP boundary
over a raw TCP socket. Nothing found fails a check. The findings at the end are observations only.

There is no `plan.md` for this feature by design (`Plan: none` in `checks.md`); the `## Intent`
section was read in its place. No source is marked binding.

## Scope of this round

- Baseline `git status --porcelain` before starting: empty (clean tree).
- `git log --oneline cc93253..HEAD`: `e2b7042 docs(specs): align fundacao door 3, codes and error
  statuses`, `3d8e150 fix(api): log abandoned requests as 499 without listener warning`.
- `git diff --name-status cc93253..HEAD`: 8 files. Code and tests only under `apps/api`
  (`M src/client-error.ts`, `M src/problem.filter.ts`, `M src/request-context.ts`,
  `A test/request-context.test.ts`); the rest is `.specs/` (`STATE.md`, `fundacao/plan.md`,
  `fundacao/checks.md`, `fundacao-ajustes/checks.md` new). Nothing under `packages/`, `tests/` or
  `apps/web`. No deleted or renamed file.
- No pre-existing test or assertion was weakened, deleted or skipped: the only test-side change is
  the new file `apps/api/test/request-context.test.ts` (+124 lines). No existing `*.test.ts` and
  nothing under `apps/api/test/support/` is in the diff (last commit touching `support/` is
  `d060517`, before the base). The new file contains no `skip`, `todo` or `only`.

## Checks

Proof run, one invocation for both, at `3d8e150`:
`pnpm --filter "./apps/api" exec vitest run test/request-context.test.ts -t "pipelined_requests_log_one_line_each_without_listener_warning|abandoned_request_logs_499" --reporter=verbose`
- exit 0, `Tests 2 passed (2)`, with the lines
`✓ test/request-context.test.ts > pipelined_requests_log_one_line_each_without_listener_warning 6047ms`
and `✓ test/request-context.test.ts > abandoned_request_logs_499 2648ms`.

Existence (`rg -n` over the tree, `node_modules` excluded): each name has exactly one hit,
`apps/api/test/request-context.test.ts:82` and `:104`. Both are in a file added by this diff.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | with 11 and with 16 pipelined `GET /health` on one connection: no `MaxListenersExceededWarning`, one `503` per request, exactly one log line per request, each with a distinct `requestId` | `vitest run test/request-context.test.ts -t "pipelined_requests_log_one_line_each_without_listener_warning"` exit 0, test listed as passed | `apps/api/test/request-context.test.ts:87` - `for (const count of [11, 16])`; `:93` - `expect(responses, ...).toBe(count)` (count of `HTTP/1.1 503 ` status lines, `:62`); `:94` - `expect(lines, ...).toHaveLength(count)`; `:95` - `expect(new Set(lines.map((line) => line.requestId)).size, ...).toBe(count)`; `:98` - `expect(warnings.map((warning) => warning.name)).not.toContain('MaxListenersExceededWarning')` | PASS |
| C2 | client closes the whole connection without a response: exactly one log line with `status` 499, for (a) bodyless `GET /health` with the response pending and (b) `POST /health` JSON, `Content-Length: 50`, 5 bytes sent | `vitest run test/request-context.test.ts -t "abandoned_request_logs_499"` exit 0, test listed as passed | `apps/api/test/request-context.test.ts:105-112` - the two cases, (a) `'GET /health HTTP/1.1\r\nHost: x\r\n\r\n'` and (b) `truncatedJson()`; `:120` - `expect(response, ...).toBeUndefined()`; `:121` - `expect(lines, ...).toHaveLength(1)`; `:122` - `expect(lines[0], name).toMatchObject({ method, path: '/health', status: 499 })` | PASS |

## Level and sampling

- **Level.** Both claims name a status and a route. Both proofs write raw bytes to a TCP socket
  (`request-context.test.ts:65` `connect(port, '127.0.0.1', ...)`; `:117` `rawExchange(port, ...)`)
  against an API started by `startApi`, which calls the same `configureApp` as the real process
  (`apps/api/test/support/app.ts:24`, `apps/api/src/main.ts:20`). No level gap.
- **Sampling, C1.** The claim names two sizes, 11 and 16; the loop at `:87` runs exactly those two,
  and the three per-size assertions sit inside the loop. The warning assertion at `:98` runs once
  after both sizes with a listener registered before the first (`:85`), so it covers both.
- **Sampling, C2.** The claim names two cases; the table at `:105-112` has both and the three
  assertions at `:120-122` sit inside the loop over them. The three asserted log fields of the
  `Coverage` row (`status` 499, `method`, `path`) are all in the expression at `:122`.
- **Whole connection closed.** The call at `:117` passes no `halfClose`, so the client helper
  destroys the socket after 300 ms (`apps/api/test/support/raw.ts:43`) instead of ending its side;
  this is the "fecha a conexão inteira" of the claim, not case (d) of the `fundacao` C31.

## Swept existing

No `Swept` row resolves to **existing** code. `failure modes`, `concurrency` and `observability`
resolve to C1/C2 (settled above); the other six rows are `n/a`, policy approved with the checks, and
there is nothing in the code for them to be wrong about. Nothing to re-read.

## Steps not run

Profile is `light`, so the following steps of `verify.md` did not run, by profile and not by
omission:

- Step 1, binding sources (`ui` only) - and no source is marked binding.
- `Coverage` recompute (`standard`, `ui`) - the `Coverage` table of `checks.md` was read, not
  recomputed. Its three rows were only confronted with the assertions cited above.
- `Test policy` verdicts (`standard`, `ui`) - `checks.md` carries no `Test policy` section.
- Step 4, fault injection (`standard`, `ui`) - no mutant was injected. This report therefore does
  not show that either test would fail under a wrong implementation (for example, that the C1 test
  goes red when the per-request `socket.on('close')` listener is restored).
- Step 5, walking the flow with the user - backend change, and no user in this session.

## Gate

`pnpm --filter "./apps/api" exec vitest run --reporter=verbose` - 20 passed, 0 failed

9 test files, exit 0, at `3d8e150`. Both named tests appear in this run as passed as well.

## Findings that fail no check

- **O1 - the request bytes of C2 (b) are not readable at the assertion.** The claim's
  "`Content-Length: 50` e 5 bytes enviados" lives in the helper `truncatedJson()`
  (`apps/api/test/support/raw.ts:66-67`: `'Content-Length: 50'` plus `'{"a":'`), not in the test.
  This is the input, not the expected value (which is literal at `:122`), and the helper predates
  the diff, so it fails nothing; it was opened once to confirm the bytes match the claim.
- **O2 - case (b) of C2 is timing-dependent by design.** `sendProblemProbing`
  (`apps/api/src/client-error.ts:35-41`) writes the headers, waits `ABANDON_PROBE_MS = 10` and
  writes the body; the line reads `499` only if the peer's refusal arrived in that interval
  (`apps/api/src/request-context.ts:64`, `res.headersSent && !socket.errored`). The `Handoff` of
  `checks.md` records this as an accepted limit. The proof exercises it on loopback only.
- **O3 - `!socket.errored` is wider than the claim.** The expression at
  `apps/api/src/request-context.ts:64` logs `499` for any request whose socket errored before the
  line is written, including one whose headers had already been sent by the normal path. No check
  defines or forbids this, and no pre-existing test changed outcome (full suite green).
- **O4 - F3 has no check.** The text edits of `e2b7042` to the `fundacao` `plan.md`/`checks.md` and
  to `STATE.md` are declared in `Coverage` as text-only with no behaviour change. They were not
  verified here beyond confirming that the commit touches only `.specs/`.
