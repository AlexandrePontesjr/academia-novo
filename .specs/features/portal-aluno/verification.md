# Portal do aluno verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 6bec03d..cf26676
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

All 92 checks hold at `cf26676`: every proof in `checks.md` was run again and passed, 102 selected
tests plus the new `reactivation_does_not_revive_links_issued_before_inactivation`. Every verdict
that was not PASS in round 1 now passes: C67, C79, C86, the `422` of `GET /api/me/photo`, the
`pendingPhoto.url` level gap and the third Test policy row. F1 is killed. Five faults were injected
and five killed, each against a green baseline in the same scratch.

Scope: the diff `5881ed0..cf26676` plus those verdicts. Proofs are `verified at cf26676` for all 92.
Evidence of rows in files the fix did not touch is `carried from 5881ed0`; rows the fix touched are
marked `verified at cf26676` with refreshed lines.

## Binding sources

Not run: the profile is `standard`, and the plan marks no source as binding. `carried from 5881ed0`.

## Checks

Proofs `verified at cf26676`. Batches, one invocation per target with verbose reporters; each named
test appeared individually as passed: contracts 3, db 5, repo 1, api 73 (71 selectors, C76 matches
two tests, plus the new reactivation test), web 20, stack 1. No proof resolved to skipped only. C6's
second selector resolves to `ten_actions_written_equal_contract_vocabulary`, and C86's first to
`eleven_segments_have_app_loading`. The whole files of C26, C76 and C91 (`students-read`,
`staff-privacy`, `photos-upload`, `photos-replace`, `photos-urls`) also ran: 56 of 56 with nothing
else on the machine, so the load-related `500` of round 1 did not recur.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `users_student_link`, unique, FK no cascade | db batch, exit 0; evidence carried from 5881ed0 | `packages/database/test/portal.test.ts:91` - `expect(orphan.constraint).toBe('users_student_link')`; `:102` `users_student_id_unique`; `:120` delete fails with FK | PASS |
| C2 | five roles, four staff, role check | contracts and db batches, exit 0; evidence carried from 5881ed0 | `packages/contracts/test/portal.test.ts:18` - `expect(USER_ROLES).toEqual([...,'student'])`; `:19`; `packages/database/test/portal.test.ts:131` `users_role_valid` | PASS |
| C3 | `password_tokens` constraints and cascade | db batch, exit 0; evidence carried from 5881ed0 | `packages/database/test/portal.test.ts:155` `password_tokens_purpose_valid`; `:161`; `:166`; `:170` owner's tokens gone, `:171` other's kept | PASS |
| C4 | pending photo checks, one per student | db batch, exit 0; evidence carried from 5881ed0 | `packages/database/test/portal.test.ts:186` `photos_pending_not_current`; `:197` `photos_pending_student`; `:205` `photos_one_pending_idx` | PASS |
| C5 | `0013` keeps rows | db batch, exit 0; evidence carried from 5881ed0 | `packages/database/test/portal.test.ts:263` zero tokens; `:266`-`:268` other columns equal | PASS |
| C6 | 52 actions, written set equals vocabulary | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/contracts.test.ts:1117` - `expect(AUDIT_ACTIONS.slice(47)).toEqual([...])`; `apps/api/test/audit-auth.test.ts:408` - `expect(written).toEqual([...auditActionSchema.options].sort())`; `:411` entity `student` | PASS |
| C7 | portal schemas accept and reject | contracts batch, exit 0; evidence carried from 5881ed0 | `packages/contracts/test/portal.test.ts:27` trimmed and lowercased; `:50` password bounds; `:83` each forbidden key; `:102` `healthNotes` refused | PASS |
| C8 | ficha schema gains `portal`, `pendingPhoto` | contracts batch, exit 0; evidence carried from 5881ed0 | `packages/contracts/test/portal.test.ts:109`; `:112` `invited` refused; `:113` absent refused | PASS |
| C9 | student `403` on every prior route | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-roles.test.ts:57` - `expect(response.status).toBe(403)`; `:58` `forbidden`; `:63` exceptions are exactly the six routes | PASS |
| C10 | session, password, 2FA, logout reachable | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-roles.test.ts:86`-`:87`; `:90` `204`; `:93` `200`; `:96` `204` | PASS |
| C11 | `GET /api/users` omits students | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/users.test.ts:326` ids equal staff ids; `:327`; `:330` order | PASS |
| C12 | `role: student` `422`, student user `404` | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/users.test.ts:337` path `role`; `:345`; `:352` `404` | PASS |
| C13 | student web paths (19) | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/proxy.spec.ts:221` - `toHaveURL('/minha-conta')`; `:227` `200`; `:228` no redirect; `:231` count 19 | PASS |
| C14 | staff off `/minha-conta` | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/proxy.spec.ts:239` - `toHaveURL('/dashboard')` | PASS |
| C15 | `/login` by role, anonymous to `/login` | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/proxy.spec.ts:247`; `:251`; `:255` | PASS |
| C16 | first access `202`, user, token, trail | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:71`; `:72` empty body; `:75` user row; `:78` `24:00:00`; `:81` trail with null author and IP | PASS |
| C17 | one mail after commit, hash, `500` rolls back | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:97`; `:100` 43 chars; `:104` `sha256(token)`; `:110`-`:113` | PASS |
| C18 | mail failure or delay keeps `202` | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:127`; `:128` under 2 s; `:135` one `portal_mail_failed` line; `:136` no recipient | PASS |
| C19 | second request, only newest link | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:154`; `:157`-`:158`; `:163`; `:165` `204` | PASS |
| C20 | nine ineligible cases | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:301`-`:304` status, body, `portalRecorded`, no mail; `:293` nine cases | PASS |
| C21 | same response for ten cases | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:322` - `expect(await shapeOf(...)).toEqual(reference)` | PASS |
| C22 | six invalid bodies `422` | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:346`-`:349` | PASS |
| C23 | 4th CPF, 11th IP, window edge | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-throttle.test.ts:92`; `:95`-`:96` 55 to 60; `:97`; `:105`; `:111` | PASS |
| C24 | keys in `lead_throttles` only | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-throttle.test.ts:130`-`:135`; `:139`; `:140` | PASS |
| C25 | two concurrent, one user, one open token | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:361`; `:363`; `:365` | PASS |
| C26 | four `portal` values; key lists gain two keys (user-approved rewrite) | api batch, exit 0; whole `students-read.test.ts` passed; evidence carried from 5881ed0 | `apps/api/test/students-read.test.ts:129` - `expect(body.portal, portal).toBe(portal)`; `:130`; `:82` instructor list | PASS |
| C27 | four labels, no mail control | web batch, exit 0; verified at cf26676, lines refreshed | `apps/web/e2e/students.spec.ts:894` - `getByText(label)` visible; `:903` no portal control; `:907` no portal request | PASS |
| C28 | `/primeiro-acesso` states | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal-public.spec.ts:28`; `:31`; `:37`; `:43` | PASS |
| C29 | consume `204` and its effects | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-password.test.ts:78`-`:80`; `:82`-`:84`; `:85` | PASS |
| C30 | six invalid tokens, one valid at the edge | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-password.test.ts:110`-`:112`; `:117` | PASS |
| C31 | password bounds | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-password.test.ts:126`-`:128`; `:130`; `:132` | PASS |
| C32 | concurrent consume | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-password.test.ts:143` - `toEqual([204, 422])`; `:148`-`:150` | PASS |
| C33 | token of inactivated or anonymized student | api batch, exit 0; verified at cf26676, see Open findings on what now refuses it | `apps/api/test/portal-password.test.ts:160`-`:163`; `:170`-`:172` | PASS |
| C34 | login after set, `role: student` | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-password.test.ts:181`; `:185`-`:186` | PASS |
| C35 | reset token replaces password | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-password.test.ts:198`-`:201` | PASS |
| C36 | `/definir-senha` posts only on submit | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal-public.spec.ts:57`; `:64`; `:71`; `:78` | PASS |
| C37 | success and invalid link messages | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal-public.spec.ts:93`; `:104`; `:106`-`:107`; `:113` | PASS |
| C38 | reset `202`, one hour, invalidates previous | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-reset.test.ts:43`-`:62`; `:50` `01:00:00`; `:68`-`:70` | PASS |
| C39 | four ineligible e-mails | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-reset.test.ts:93`-`:95` | PASS |
| C40 | 4th e-mail, 11th IP, window | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-throttle.test.ts:151`-`:154`; `:162`; `:167` | PASS |
| C41 | invalid e-mail `422` | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-reset.test.ts:110`-`:113` | PASS |
| C42 | login links, `/esqueci-senha` states | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/login.spec.ts:100`-`:101`; `apps/web/e2e/portal-public.spec.ts:126`; `:131` | PASS |
| C43 | profile eleven keys, no `healthNotes` | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-me.test.ts:60`; `:61`; `:79` `medium`; `:80` | PASS |
| C44 | `/api/me/*` only by session | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-me.test.ts:93`; `:97`; `:102`; `:104`; `:107` `404` | PASS |
| C45 | payments equal staff's, read by `hr_finance` (user-approved rewrite) | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-me.test.ts:125` - `expect(body).toEqual(await staff.json())`; `:126`; `:131` | PASS |
| C46 | staff `403`, anonymous `401` on five routes | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-me.test.ts:150`-`:151`; `:159`-`:160` | PASS |
| C47 | `/minha-conta` data, newest first | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal.spec.ts:58`; `:66`-`:69`; `:74` | PASS |
| C48 | no enrollment message | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal.spec.ts:82`-`:83` | PASS |
| C49 | load error and retry | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal.spec.ts:90`-`:91`; `:96`; `:101`-`:102` | PASS |
| C50 | one column at 390 px | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal.spec.ts:116`; `:120` | PASS |
| C51 | four contact fields, student as author | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-me.test.ts:183`; `:185`; `:188`; `:192`; `:196` | PASS |
| C52 | same schemas `422` | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-me.test.ts:205`; `:209`; `:211` | PASS |
| C53 | eight forbidden keys | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-me.test.ts:234`-`:235`; `:239`-`:241` | PASS |
| C54 | `/api/me/*` never changes e-mail or CPF | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-me.test.ts:273` - `expect(await identity()).toEqual(before)` | PASS |
| C55 | e-mail follows, `409 email_in_use` | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/students-update.test.ts:135`; `:143`-`:146`; `:152`-`:153` | PASS |
| C56 | contact form | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal.spec.ts:131`-`:136`; `:145`; `:148`; `:162`-`:163` | PASS |
| C57 | pending stored with 30 days | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-photo.test.ts:87`; `:91` `30 days`; `:92` three objects; `:93` author | PASS |
| C58 | `409 pending_photo_exists`, race | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-photo.test.ts:104`-`:106`; `:112`; `:117` | PASS |
| C59 | nine files same as staff `POST`, status `413`, `415` or `422` (rewritten, user-approved) | api batch, exit 0; verified at cf26676 | `apps/api/test/portal-photo.test.ts:162` - `expect(response.status, name).toBe(staff.status)`; `:163` same `code`; `:164` nothing changed; `:168` - `expect([...seen].sort()).toEqual([413, 415, 422])`, the set the claim now names | PASS |
| C60 | pending never served, `PUT` leaves it (user-approved rewrite) | api batch, exit 0; verified at cf26676, lines refreshed | `apps/api/test/portal-photo.test.ts:179` ficha signs the current; `:180` - `expect(ficha.pendingPhoto?.id).toBe(pending.id)`; `:182` - `expect(ficha.pendingPhoto?.url).toContain(...medium?)`; `:189`-`:194` `201`, version 3, current, pending row identical | PASS |
| C61 | approve | api batch, exit 0; verified at cf26676, lines refreshed | `apps/api/test/portal-photo.test.ts:209`-`:217`; `:214` `in_window` for 30 and 7 days | PASS |
| C62 | reject and purge | api batch, exit 0; verified at cf26676, lines refreshed | `apps/api/test/portal-photo.test.ts:233`; `:238`; `:243`-`:245` | PASS |
| C63 | `404`, `403`, `401`, `not_found` | api batch, exit 0; verified at cf26676, lines refreshed | `apps/api/test/portal-photo.test.ts:253`-`:254`; `:266`; `:269`; `:272`-`:273`; `:276` | PASS |
| C64 | expired pending purged | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/photos-purge.test.ts:129`-`:131` | PASS |
| C65 | `GET /api/me/photo`, now with `422` on an invalid `variant` | api batch, exit 0; verified at cf26676 | `apps/api/test/portal-photo.test.ts:281` `404`; `:285`-`:286` pending `null`; `:296`-`:297` `medium`; `:300`-`:301` `thumb`; `:304` - `expect(invalid.status).toBe(422)`; `:305` path `variant` | PASS |
| C66 | concurrent approve and reject | api batch, exit 0; verified at cf26676, lines refreshed | `apps/api/test/portal-photo.test.ts:319`; `:321`; `:323` | PASS |
| C67 | pending next to the current, approve, reject | web batch, exit 0; verified at cf26676 | `apps/web/e2e/students.spec.ts:836` pending `src`; `:841` - `expect(beside!.x).toBeGreaterThanOrEqual(current!.x + current!.width)`; `:842`-`:843` same height band; `:851`; `:858`; `:866`-`:867`; `:874`-`:875` no buttons for two roles. F9 stacks them and fails at `:841` | PASS |
| C68 | pending hides upload | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal.spec.ts:178`-`:185`; `:192`-`:197` | PASS |
| C69 | inactivation cuts in one transaction | api batch, exit 0; evidence carried from 5881ed0 (lines unmoved) | `apps/api/test/portal-cutoff.test.ts:46`-`:49`; `:59`; `:62` | PASS |
| C70 | suspension keeps user | api batch, exit 0; evidence carried from 5881ed0 (lines unmoved) | `apps/api/test/portal-cutoff.test.ts:74`-`:79` | PASS |
| C71 | refused `PATCH` inactive | api batch, exit 0; evidence carried from 5881ed0 (lines unmoved) | `apps/api/test/portal-cutoff.test.ts:89`-`:92` | PASS |
| C72 | disabled login like inactive staff | api batch, exit 0; evidence carried from 5881ed0 (lines unmoved) | `apps/api/test/portal-cutoff.test.ts:103`; `:108`-`:110` | PASS |
| C73 | reactivation keeps disabled | api batch, exit 0; verified at cf26676, lines refreshed | `apps/api/test/portal-cutoff.test.ts:135` - `expect(await userActive(user.id)).toBe(false)`; `:137`; `:142`-`:143`; `:148`-`:149` | PASS |
| C74 | anonymization clears user | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/privacy-anonymize.test.ts:278`-`:281` | PASS |
| C75 | anonymization failure keeps user | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/privacy-anonymize.test.ts:302`-`:303`; `:308`-`:309` | PASS |
| C76 | staff anonymization still `409` | api batch, exit 0; selector matched two tests, both passed; whole file passed; evidence carried from 5881ed0 | `apps/api/test/staff-privacy.test.ts:201`-`:202` code is `staff_user_linked`; `:359`-`:360` | PASS |
| C77 | OpenAPI ten routes, contract bodies | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/openapi.test.ts:491`; `:172` | PASS |
| C78 | declared access | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/access.test.ts:154`; `:157`; `:160`; `:171`; `:191` | PASS |
| C79 | admin without 2FA blocked on `approve`/`reject` "e não nas três públicas"; student never | api batch, exit 0; verified at cf26676 | `apps/api/test/enrollment.test.ts:59`-`:60` blocked; `:76` - `expect(portalPublic).toHaveLength(3)`; `:81` `422`; `:82` - `expect(text, route).not.toContain('two_factor_enrollment_required')`; `:172`-`:173` student. F7 fails at `:81` | PASS |
| C80 | seven writes under origin check | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/csrf.test.ts:206`-`:209` | PASS |
| C81 | hostile bodies | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/hostile-input.test.ts:135`-`:136`; `:139`; `:147`-`:148`; `:154`-`:155` | PASS |
| C82 | audit failure rolls back seven writes | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-audit.test.ts:92`-`:93` | PASS |
| C83 | public trail clean, refusals write none | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-audit.test.ts:114`-`:117`; `:180` | PASS |
| C84 | 52 counted, labels | api and web batches, exit 0; evidence carried from 5881ed0 | `apps/api/test/contracts.test.ts:1333`; `:1336`; `:1346`; `apps/web/e2e/audit.spec.ts:613`-`:617` | PASS |
| C85 | `ROLE_LABELS.student`, select with four | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/users.spec.ts:55`-`:58` | PASS |
| C86 | `minha-conta` segment; baselines changed only in `/audit`, by five options; no `/login`, whose links are C42 (rewritten, user-approved) | repo and web batches, exit 0; verified at cf26676 | `tests/repo/motion.test.ts:121` - `expect(SEGMENTS).toContain('minha-conta')`; `apps/web/e2e/motion.spec.ts:920`-`:924` compare against the baselines. Baselines compared as JSON at `6bec03d` and HEAD: same 22 keys, only `/audit` differs, only `text` and `aria`, five lines added and none removed in each of `390.json` and `1440.json` (`apps/web/e2e/fixtures/motion-baseline/1440.json:739`); no `/login` key; links at `apps/web/e2e/login.spec.ts:100`-`:101` | PASS |
| C87 | public pages with CSP, no prefix leak | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/proxy.spec.ts:181`-`:187`; `:190`; `:196` | PASS |
| C88 | throttle module | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-throttle.test.ts:46`; `:49`; `:65`; `:77`; `:79` | PASS |
| C89 | eligibility table, 13 rows | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:258`; `:267`; `:270`-`:274` | PASS |
| C90 | `portalState`, six rows | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:287`-`:288` | PASS |
| C91 | photo proofs unchanged (user-approved rewrite) | api batch, exit 0; whole files passed; evidence carried from 5881ed0 | `apps/api/test/photos-replace.test.ts:100`-`:102`; `apps/api/test/photos-urls.test.ts:360`-`:361` | PASS |
| C92 | real stack | stack run, exit 0; evidence carried from 5881ed0 | `tests/stack/compose.test.ts:1694`; `:1704`-`:1705`; `:1719`; `:1731`; `:1734` | PASS |

## Coverage

Rows the fix touched are `verified at cf26676`, recomputed from the code. The rest are
`carried from 5881ed0`, as are the rows of `checks.md` not listed one by one (`Relations`, roles,
purposes, password bounds, labels, keys, transitions, tables, audit actions, web paths, screens,
messages).

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `POST /api/portal/first-access` statuses (3), carried from 5881ed0 | `portal.controller.ts`, `portal.service.ts` | 202 C16 · 422 C22 · 429 C23 | - |
| `POST /api/password-tokens/consume` statuses (2), carried from 5881ed0 | `portal.service.ts` | 204 C29 · 422 C30, C31, C33 | - |
| `POST /api/password-reset` statuses (3), carried from 5881ed0 | `portal.service.ts` | 202 C38 · 422 C41 · 429 C40 | - |
| `GET /api/me/profile` statuses (3), carried from 5881ed0 | `me.controller.ts` | 200 C43 · 401 C46 · 403 C46 | - |
| `PATCH /api/me/profile` statuses (4), carried from 5881ed0 | `me.controller.ts` | 200 C51 · 401, 403 C46 · 422 C52, C53 | - |
| `GET /api/me/payments` statuses (3), carried from 5881ed0 | `me.controller.ts` | 200 C45 · 401, 403 C46 | - |
| `POST /api/me/photo` statuses (7), verified at cf26676 | `photos.service.ts`, note under `Surface` in `plan.md` | 201 C57 · 401, 403 C46 · 409 C58 · 413, 415, 422 C59 | - |
| `GET /api/me/photo` statuses (5), verified at cf26676 | `me.controller.ts`, `photoQuerySchema` via `@QueryInput`, note under `Surface` | 200, 404 C65 · 401, 403 C46 · 422 C65 (`apps/api/test/portal-photo.test.ts:304`), F8 confirms | - |
| `approve` statuses (4), carried from 5881ed0 | `photos.controller.ts` | 200 C61 · 401, 403, 404 C63 | - |
| `reject` statuses (4), carried from 5881ed0 | `photos.controller.ts` | 204 C62 · 401, 403, 404 C63 | - |
| `500` by new write (7), carried from 5881ed0 | `portal-audit.test.ts` table | C82 | - |
| `403 csrf_rejected` by new write (7), carried from 5881ed0 | `csrf.test.ts` table | C80 | - |
| new error codes (3), carried from 5881ed0 | `photos.service.ts`, `students.controller.ts` | `no_pending_photo` C63 · `pending_photo_exists` C58 · `email_in_use` C55 | - |
| `pendingPhoto` fields at the API (4), verified at cf26676 | `pendingPhotoSchema`, `pendingOf` | `id` C60 · `version`, `createdAt` C57 · `url` C60 (ficha) and C65 (perfil), `apps/api/test/portal-photo.test.ts:182`, `:292`, F1 confirms | - |
| admin without 2FA on new routes (10), verified at cf26676 | `listRoutes`, `PUBLIC` in `enrollment.test.ts` | `approve`, `reject` and the five `/api/me/*` C79 · the three public routes C79 at `:75`-`:83`, F7 confirms | - |
| new routes in OpenAPI (10), carried from 5881ed0 | `listRoutes` | C77 | - |
| public routes (13), carried from 5881ed0 | `access.test.ts` | C78 | - |
| refused tokens (9: the 8 of `checks.md` plus one closed by inactivation), verified at cf26676 | `portal.service.ts:202`, `students.service.ts:278` | 8 C30, C33 · link issued before inactivation: `reactivation_does_not_revive_links_issued_before_inactivation`, `apps/api/test/portal-cutoff.test.ts:123`, F6 confirms | - |
| first access situations (13), refusals (9), uniform response (10), carried from 5881ed0 | `firstAccessDecision` | C89, C20, C21 | - |
| `portal` states (4) and edges (2), carried from 5881ed0 | `portalState` | C26, C90 | - |
| limits (4 keys), window (2 edges), carried from 5881ed0 | `PORTAL_LIMITS` | C23, C40, C88 | - |
| files refused by the pipeline (9), verified at cf26676 | `photos-upload.test.ts` | C59, with statuses `413`, `415`, `422` | - |
| readings of the current photo (3), carried from 5881ed0 | `photos.service.ts:376` `is_current` filter | list, ficha, check-in C60 | - |
| ficha transitions touching the user (4), verified at cf26676 | `students.service.ts:262` | C69, C70, C71, C73 | - |
| tables cleared on anonymization (5), carried from 5881ed0 | `privacy.service.ts`, `clearStudentUser` | C74 | - |
| ficha elements of the pending review (2), verified at cf26676 | AC 51 | pending photo, buttons and the current photo beside it C67, F9 confirms | - |
| screens in the motion baseline (22 paths), verified at cf26676 | `motion-baseline/1440.json`, `390.json` | C86 for all 22; `/login` is no longer claimed | - |
| startup config: `MailService` (2 assemblies), carried from 5881ed0 | `apps/api/src/app.module.ts:169`, `:186`; `tests/stack/compose.test.ts:1704` | tests C17 · stack C92 | - |
| startup config: `PhotoPurge` (2 assemblies), carried from 5881ed0 | `apps/api/src/app.module.ts:128`; `apps/api/test/photos-purge.test.ts:167` | C62, C64 | - |

`Swept` rows resolving to existing, carried from 5881ed0: the global guard is at
`apps/api/src/app.module.ts:202` (`APP_GUARD`, `AccessGuard`), and the origin check at
`apps/api/src/csrf.ts:25`. Both are there.

Level, verified at cf26676: every claim naming a status, route or response shape has a proof crossing
HTTP. The gap on `pendingPhoto.url` is closed.

## Test policy rows

The two rows of this feature, plus the rows inherited from `pre-cadastro` and earlier. The third and
seventh rows are re-judged at cf26676, as they were unmet or classify touched files, and the row for
`inactivate` is the third. The others are carried from 5881ed0.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Eligibility with many conditions | `portal.service.ts` `firstAccessDecision` | service table C89 · boundary C20, C21 | yes |
| State derived from two tables | `portal.service.ts` `portalState` | pure C90 · boundary C26 | yes |
| Route that decides, over HTTP, with role cut and trail | `portal.controller.ts`, `me.controller.ts`, `photos.controller.ts`, `students.controller.ts`, `students.service.ts` `inactivate` | C16 to C83, plus the reactivation test at `apps/api/test/portal-cutoff.test.ts:113`; `pendingPhoto.url` now at the boundary | yes |
| Database constraint | `0013_portal.sql` | C1 to C5 | yes |
| Count in a window | `lead-throttle.ts` | module C88 · boundary C23, C40; the race runs on the shared statement at `apps/api/test/leads-throttle.test.ts:78` | yes |
| Side effect after commit | `portal.service.ts` `deliver` | capture C17, C18, C38; `apps/api/src/mail` is not in the diff | yes |
| Screen against the `FakeApi` | `minha-conta`, public pages, ficha | C27, C28, C36, C37, C42, C47 to C50, C56, C67, C68 | yes |
| Stack through `psql` | `tests/stack/compose.test.ts` | C92 | yes |

## Faults injected

Verified at cf26676, in a worktree at `cf26676` under the scratchpad. The real tree's porcelain was
empty before and after. Each surface the fix touched or created has a fault. F2 to F5 of round 1 are
`carried from 5881ed0`: their code did not change.

A first pass was discarded: every `pnpm` command died in the scratch with "O sistema não pode
encontrar o caminho especificado" writing `node_modules/.pnpm-task-run-state-v1`, so all those exits
of 1 meant nothing. In the scratch only, `vitest`, the build, `next` and Playwright then ran through
`node` directly, and `build.mjs` wrote the bundle from Node as in round 1. With that, the API
baseline passed 5 of 5 and the web baseline 1 of 1 before any fault, and each kill below is the named
assertion failing, not a process error.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 (re-injected): `url` dropped from `pendingOf` | `apps/api/src/photos/photos.service.ts:345` | yes - C60 at `portal-photo.test.ts:182`, C65 at `:292` |
| F6: open tokens not closed in `inactivate` | `apps/api/src/students/students.service.ts:278` | yes - `reactivation_does_not_revive_links_issued_before_inactivation`, `expected 204 to be 422`, so the hazard was real |
| F7: public portal routes pass through the session and enrollment check when a cookie comes | `apps/api/src/access.ts` `canActivate` | yes - C79, `POST /api/portal/first-access: expected 403 to be 422` |
| F8: invalid `variant` swallowed by `.catch(undefined)` | `packages/contracts/src/photos.ts:10` | yes - C65, `expected 200 to be 422` |
| F9: photo row `flex-wrap` changed to `flex-col`, stacking the pending under the current | `apps/web/src/app/students/[id]/page.tsx:136` | yes - C67 at `students.spec.ts:841`, `Received: 309`, `Expected: >= 429` |

## Gate

`py -3 C:/Users/Admin/.claude/skills/tlc-spec-lean/scripts/validate_verification.py portal-aluno --root C:/Users/Admin/projetos/academia-bairro` - exit 0. Proofs: 103 passed, 0 failed (contracts 3, db 5, repo 1, api 73, web 20, stack 1); whole files of C26, C76, C91: 56 passed, 0 failed.

## Open findings (do not change the verdict)

- **The new behaviour has a test but no check.** `reactivation_does_not_revive_links_issued_before_inactivation` passed and F6 shows it bites, but no `Cn` names it: C73's Proof is the older test, and the `tokens recusados (8)` row of `checks.md` does not list it. It is counted above only because it was run by name. Worth a C73 Proof line and a ninth member.
- **C33 now passes for a second reason.** A token of an inactivated student is closed by `inactivate`, so C33's first half is refused by `usable` before it reaches the `studentStatus === 'inactive'` clause of `apps/api/src/portal/portal.service.ts:202`. That clause stays as defence, but no proof isolates it any more. Read from the code, not run.
- **`plan.md` step 1 of the `Flow` (line 45)** still lists only the user and the sessions in `inactivate`, not the tokens.
- **Precision gap, C76 (carried from 5881ed0):** the check says `user_linked`; the code is `staff_user_linked`.
- **`DELETE /api/students/:id/photo` also deletes a pending photo:** `checks.md` now records this as deliberate. It remains without a check, and `Impact` says version listings ignore a pending one.
- **`pendingPhoto.url` to all four profiles:** `checks.md` records it as AD-033 behaviour, and the screen shows it only to `admin` and `reception`.
- **C26, C45, C59, C60, C86, C91:** the rewritten text matches the tests. The approvals are recorded in `checks.md`; this report cannot confirm them independently.
- **C67's proof runs at the desktop width.** Beside-ness below the wrap width of `flex-wrap` is not claimed by the check and was not measured.
