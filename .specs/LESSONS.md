# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Plan/Checks)

Corroborated across multiple features. Safe to apply as guidance.

### L-019 - When a criterion says a valid value, state the check on both bounds of validity, not on one sample value
- signal: `spec_precision_gap` · recurrence: 2 feature(s) · scope: `api` · harmful: 0
- features: auth-rbac, dashboard
- evidence: C60, C10 - .specs/features/auth-rbac/checks.md:222 (N5) (api) (+1 more)
- last seen: 2026-10-10T02:15:50Z

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

### L-025 - Prove every bound that depends on today in a time zone at both instants of the day turn, not only the bound nearest to today
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: planos-matriculas
- evidence: verification.md fault 3; packages/contracts/src/plans.ts:129; C30 (api)
- last seen: 2026-10-09T00:05:30Z

### L-026 - When a check pins the clock for one bound of a day-dependent limit, state the day turn cases for every other bound of that limit
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: planos-matriculas
- evidence: verification.md F1; C30; apps/api/test/student-enrollments-write.test.ts:248 (api)
- last seen: 2026-10-09T00:05:30Z

### L-027 - Prove that free text is displayed as plain text on a value that contains markup, not on a value that has none
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: planos-matriculas
- evidence: verification.md F2; door 1; apps/web/src/app/plans/page.tsx:66 (web)
- last seen: 2026-10-09T00:05:31Z

### L-028 - When a claim says a write happened once, count what a repeat would multiply, such as audit rows, not a column that is one whenever the row is set
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: pagamentos
- evidence: C18 (api)
- last seen: 2026-10-09T21:04:17Z

### L-029 - Assert a recorded diff with exact equality, not a partial match that accepts an extra key
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: pagamentos
- evidence: C34 (api)
- last seen: 2026-10-09T21:04:17Z

### L-030 - Name in the proof of a check every half of its claim, or cite the other check that proves the missing half
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: pagamentos
- evidence: C63 (api)
- last seen: 2026-10-09T21:04:17Z

### L-031 - List in the Proof line of a check every test that asserts its claim, including tests added during Build
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: pagamentos
- evidence: C67 (api)
- last seen: 2026-10-09T21:04:18Z

### L-032 - Prove at the schema level that each required key is refused when missing, not only one of them
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: pagamentos
- evidence: C65 (api)
- last seen: 2026-10-09T21:04:18Z

### L-033 - Cite as proof of a swept constraint a test that exercises it, such as one that sends the forbidden input, not one that only runs on the same route
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: pagamentos
- evidence: Swept AD-020 (api)
- last seen: 2026-10-09T21:04:18Z

### L-034 - When a destructive operation removes objects from storage before its transaction commits, state what the bucket holds after a mid-way failure instead of asking for it to stay identical, and prove the retry on every failure point
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: privacidade
- evidence: C21, C34 - .specs/features/privacidade/checks.md (Test policy, operação destrutiva) (api)
- last seen: 2026-10-17T18:05:16Z

### L-035 - Keep the RustFS clause on the **Branch** line of .specs/STATE.md; the repo suite asserts it and a handoff rewrite can drop it
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `repo` · harmful: 0
- features: identidade-visual
- evidence: C23 - tests/repo/repo.test.ts:344 / .specs/STATE.md:144 (repo)
- last seen: 2026-10-19T22:07:48Z

### L-036 - When an AC fixes a colour the Landing token set does not carry, add the token to the door instead of hard-coding the literal in screen components
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `ui` · harmful: 0
- features: identidade-visual
- evidence: C12 - packages/ui/src/globals.css:23 / apps/web/src/app/students/student-form.tsx:149 (ui)
- last seen: 2026-10-19T22:07:48Z

### L-037 - Count the shell-bearing screens from the table before claiming the shell in the check prose; 24 screens split 21 with the shell and 3 without
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `ui` · harmful: 0
- features: identidade-visual
- evidence: C18 - apps/web/e2e/identidade.spec.ts:118-137 / :680-693 (ui)
- last seen: 2026-10-19T22:07:48Z

### L-038 - Enumerate a set of rendered messages by grepping every state setter that fires on a success result, not by the attribute the messages already carry at the base commit
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: motion
- evidence: apps/web/src/app/account/change-password-form.tsx:38 (C24, AC 24) (web)
- last seen: 2026-10-23T00:37:32Z

### L-039 - When a shared hook decides a breakpoint for several components, assert the breakpoint branch through each component that consumes it, not only through one
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: motion
- evidence: F5 packages/ui/src/motion.tsx:65 (Test policy row 1) (web)
- last seen: 2026-10-23T00:37:32Z

### L-040 - When a test policy asks for a literal test of a CSS block, assert every rule inside the block, not only the one the first feature slice added
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `ui` · harmful: 0
- features: motion
- evidence: packages/ui/src/globals.css:182-206 (Test policy row 3) (ui)
- last seen: 2026-10-23T00:37:32Z

### L-041 - Prove the repo gate command itself in the environment that runs verification, and record any per-package substitute as not proving the gate
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `repo` · harmful: 0
- features: motion
- evidence: C37 pnpm verify exit 1 (turbo EPERM in %TEMP%, testcontainers runtime not found) (repo)
- last seen: 2026-10-23T00:37:32Z

### L-042 - Assert at the HTTP boundary every response field a screen reads, not only in the fake API the screen test uses
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: portal-aluno
- evidence: F1 apps/api/src/photos/photos.service.ts:345 (api)
- last seen: 2026-10-30T19:04:02Z

### L-043 - When a claim says a guard does not apply to a set of routes, call every route of that set, including routes added by the feature
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: portal-aluno
- evidence: C79 apps/api/test/enrollment.test.ts:64 (api)
- last seen: 2026-10-30T19:04:02Z

### L-044 - Before citing a baseline in a check, confirm the screen is a key in the baseline file
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: portal-aluno
- evidence: C86 apps/web/e2e/motion.spec.ts:920 (web)
- last seen: 2026-10-30T19:04:02Z

### L-045 - When a check says one element sits next to another, assert both elements, not only the new one
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `web` · harmful: 0
- features: portal-aluno
- evidence: C67 apps/web/e2e/students.spec.ts:834 (web)
- last seen: 2026-10-30T19:04:03Z

### L-046 - When a check says same as an existing route, read that route's statuses before listing them
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: portal-aluno
- evidence: C59 apps/api/test/portal-photo.test.ts:168 (api)
- last seen: 2026-10-30T19:04:03Z

### L-047 - Enumerate the query parameters of each new route in the Surface and give an invalid value its status and proof
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: portal-aluno
- evidence: verification.md portal-aluno round 1 (api)
- last seen: 2026-10-30T19:04:03Z

### L-048 - Prove a side effect over every enumerated value it touches, not one representative
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: portal-aluno
- evidence: F6b apps/api/test/portal-cutoff.test.ts:157 (api) (api)
- last seen: 2026-10-30T23:25:54Z

### L-049 - Compare every table a transactional write touches in the rollback branch of its proof
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: portal-aluno
- evidence: F13 apps/api/test/portal-cutoff.test.ts:55 (api) (api)
- last seen: 2026-10-30T23:25:54Z

### L-050 - Check database constraints before writing a defensive clause that may be unreachable
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `api` · harmful: 0
- features: portal-aluno
- evidence: F12b apps/api/src/portal/portal.service.ts:202 (api) (api)
- last seen: 2026-10-30T23:25:54Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
