# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Plan/Checks)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Prove a per-request pipeline property on a response produced before the framework middleware runs, such as a body parser rejection, not only on handler and router responses
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: fundacao
- evidence: C13, C14, C15 - apps/api/src/app.module.ts:39 (api)
- last seen: 2026-10-04T00:11:24Z

### L-002 - Enumerate a claim about every response by the pipeline stage that produces the response, not by status code
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: fundacao
- evidence: C13 - apps/api/test/request-id.test.ts:33 (api)
- last seen: 2026-10-04T00:11:24Z

### L-003 - Prove a claim about every answered request on a response written by the HTTP server itself, such as a rejected Expect header or a missing Host, not only on responses the framework produces
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: fundacao
- evidence: C15 - apps/api/src/main.ts:22 (api)
- last seen: 2026-10-04T00:20:13Z

### L-004 - Prove a one log line per request claim on a request with a body that the HTTP parser rejects after dispatch, such as an invalid chunk size, where the response never emits finish
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: fundacao
- evidence: C15 - apps/api/src/request-context.ts:13 (api)
- last seen: 2026-10-04T02:14:59Z

### L-005 - Draw an exemption boundary on behaviour observed in the built artifact, and check each enumerated member against the stated criterion
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: fundacao
- evidence: C15 - .specs/features/fundacao/plan.md:107 (api)
- last seen: 2026-10-04T02:14:59Z

### L-006 - State which status a request log line records when the client disconnects before any response is sent
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: fundacao
- evidence: F2 - apps/api/src/request-context.ts:44 (probes R28, N8, S3) (api)
- last seen: 2026-10-04T02:50:59Z

### L-007 - When a check adds a response code or status, add it as a member of every coverage set that enumerates codes or statuses
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: fundacao
- evidence: F3 - .specs/features/fundacao/checks.md:183 (C32) (api)
- last seen: 2026-10-04T02:50:59Z

### L-008 - Prove a path-prefix middleware on a differently cased path that the router still dispatches to the same handler
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: auth-rbac
- evidence: C22, C23 - apps/api/src/csrf.ts:13 (api)
- last seen: 2026-10-04T05:11:12Z

### L-009 - Prove a claim that secrets never reach the log on a dependency failure path, where the logged exception carries the query parameters
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: auth-rbac
- evidence: C100 - apps/api/src/problem.filter.ts:88 (api)
- last seen: 2026-10-04T05:11:12Z

### L-010 - Capture console output as well as direct stdout and stderr writes when a test asserts what the process logs
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: auth-rbac
- evidence: C100 - apps/api/test/auth-log.test.ts:25 (api)
- last seen: 2026-10-04T05:11:12Z

### L-011 - State a time limit in a check as an upper bound the proof measures, not as a precondition of the scenario
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: auth-rbac
- evidence: C75 - apps/web/e2e/forms.spec.ts:39 (web)
- last seen: 2026-10-04T05:11:13Z

### L-012 - Enumerate a claim about every form by submit control, not by screen
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: auth-rbac
- evidence: C74, C75, C76 - apps/web/e2e/support/forms.ts:17 (web)
- last seen: 2026-10-04T05:11:13Z

### L-013 - When the Build adds a status or code to the plan Surface, add a check and a Coverage row for it before the feature closes
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: auth-rbac
- evidence: F3 - .specs/features/auth-rbac/plan.md:110 (web)
- last seen: 2026-10-04T05:11:13Z

### L-014 - Bound every string a request schema accepts to what its column and indexes can store, and prove the upper bound at the HTTP boundary
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: auth-rbac
- evidence: C3, C41, C51 - packages/contracts/src/auth.ts:16 (N1) (api)
- last seen: 2026-10-04T05:54:53Z

### L-015 - Reject the NUL character in every text field that reaches a Postgres text column, and prove the rejection at the HTTP boundary
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: auth-rbac
- evidence: C51, C56 - packages/contracts/src/users.ts:4 (N2) (api)
- last seen: 2026-10-04T05:54:53Z

### L-016 - Prove a route that parses a cookie itself on a malformed cookie value, such as invalid percent-encoding or a NUL byte, not only on an absent cookie
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: auth-rbac
- evidence: C32 - apps/api/src/auth/auth.controller.ts:263 (N3) (api)
- last seen: 2026-10-04T05:54:53Z

### L-017 - Measure a length limit in the same unit in the request schema and in every library that enforces it again, and prove the upper bound with a character that takes two UTF-16 units
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: auth-rbac
- evidence: C51, C60 - packages/contracts/src/auth.ts:11 (N5) (api)
- last seen: 2026-10-04T06:22:59Z

### L-018 - Prove a wrong-secret rejection on a value longer than the verifying library accepts, where the library refuses before comparing
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: auth-rbac
- evidence: C37 - apps/api/src/auth/auth.controller.ts:295 (N6) (api)
- last seen: 2026-10-04T06:22:59Z

### L-019 - When a criterion says a valid value, state the check on both bounds of validity, not on one sample value
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: auth-rbac
- evidence: C60, C10 - .specs/features/auth-rbac/checks.md:222 (N5) (api)
- last seen: 2026-10-04T06:22:59Z

### L-020 - Prove an image crop on a source whose colour differs between the expected region and any shifted region, not on halves that agree at the sampled points
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: foto-captura
- evidence: apps/web/src/lib/photo-crop.ts:67 (C38, C39, C41, C53) (web)
- last seen: 2026-10-06T01:40:34Z

### L-021 - Assert pixel colour, not only dimensions, on every case that resizes an image
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: foto-captura
- evidence: apps/web/src/lib/photo-crop.ts:66 (C40) (web)
- last seen: 2026-10-06T01:40:34Z

### L-022 - State a pixel oracle in a check at points whose expected colour changes when the cropped region moves
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: foto-captura
- evidence: C38, C39 - apps/web/e2e/photo-editor.spec.ts:126 (web)
- last seen: 2026-10-06T01:40:34Z

### L-023 - Assert every observable a Test policy row names in the same proof that exercises the case
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: foto-captura
- evidence: Test policy row 1 - apps/api/test/photos-purge.test.ts:124 (api)
- last seen: 2026-10-06T01:40:35Z

### L-024 - Sample a crop oracle within a few pixels of a colour boundary on every side of the expected region, so the shift it tolerates is small and stated
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: foto-captura
- evidence: C38 - apps/web/e2e/photo-editor.spec.ts:172 (fault 4, round 2) (web)
- last seen: 2026-10-06T02:55:34Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
