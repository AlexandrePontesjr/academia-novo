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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
