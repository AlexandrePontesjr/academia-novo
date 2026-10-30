# Portal do aluno verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 6bec03d..5881ed0
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

All 92 checks ran at `5881ed0`: 102 named tests passed and none failed. The behaviour under test
holds. The verdict is FAIL on the proofs: 89 of 92 checks are proven, and three (C67, C79, C86)
each name something no assertion reads. One of five injected faults survived: removing
`pendingPhoto.url` from the API fails no test, so the field that makes the pending photo visible
on both screens is proven only against the `FakeApi`. One Coverage member (`422` on
`GET /api/me/photo`) also has no proof.

C79 repeats the gap that failed round 1 of `pre-cadastro` (its C96): "e não nas N públicas" with
the loop over public routes filtered to the lead routes only.

## Binding sources

Not run: the profile is `standard`, and the plan marks no source as binding.

## Checks

Batches, one invocation per target with verbose reporters; each row's test appeared individually
as passed: contracts 3, db 5, repo 1, api 72 (71 selectors, C76 matches two tests), web 20,
stack 1. No proof resolved to skipped only. C6's second selector resolves to
`ten_actions_written_equal_contract_vocabulary`, and C86's first to
`eleven_segments_have_app_loading`, both edited in this diff.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `users_student_link`, unique, FK no cascade | db batch, exit 0 | `packages/database/test/portal.test.ts:91` - `expect(orphan.constraint).toBe('users_student_link')`; `:102` `users_student_id_unique`; `:120` delete fails with FK | PASS |
| C2 | five roles, four staff, role check | contracts and db batches, exit 0 | `packages/contracts/test/portal.test.ts:18` - `expect(USER_ROLES).toEqual([...,'student'])`; `:19`; `packages/database/test/portal.test.ts:131` `users_role_valid` | PASS |
| C3 | `password_tokens` constraints and cascade | db batch, exit 0 | `packages/database/test/portal.test.ts:155` `password_tokens_purpose_valid`; `:161`; `:166`; `:170` owner's tokens gone, `:171` other's kept | PASS |
| C4 | pending photo checks, one per student | db batch, exit 0 | `packages/database/test/portal.test.ts:186` `photos_pending_not_current`; `:197` `photos_pending_student`; `:205` `photos_one_pending_idx` | PASS |
| C5 | `0013` keeps rows | db batch, exit 0 | `packages/database/test/portal.test.ts:263` zero tokens; `:266`-`:268` other columns equal | PASS |
| C6 | 52 actions, written set equals vocabulary | api batch, exit 0 | `apps/api/test/contracts.test.ts:1117` - `expect(AUDIT_ACTIONS.slice(47)).toEqual([...])`; `apps/api/test/audit-auth.test.ts:408` - `expect(written).toEqual([...auditActionSchema.options].sort())`; `:411` entity `student` | PASS |
| C7 | portal schemas accept and reject | contracts batch, exit 0 | `packages/contracts/test/portal.test.ts:27` trimmed and lowercased; `:50` password bounds; `:83` each forbidden key; `:102` `healthNotes` refused | PASS |
| C8 | ficha schema gains `portal`, `pendingPhoto` | contracts batch, exit 0 | `packages/contracts/test/portal.test.ts:109`; `:112` `invited` refused; `:113` absent refused | PASS |
| C9 | student `403` on every prior route | api batch, exit 0 | `apps/api/test/portal-roles.test.ts:57` - `expect(response.status).toBe(403)`; `:58` `forbidden`; `:63` exceptions are exactly the six routes | PASS |
| C10 | session, password, 2FA, logout reachable | api batch, exit 0 | `apps/api/test/portal-roles.test.ts:86`-`:87`; `:90` `204`; `:93` `200`; `:96` `204` | PASS |
| C11 | `GET /api/users` omits students | api batch, exit 0 | `apps/api/test/users.test.ts:326` ids equal staff ids; `:327`; `:330` order | PASS |
| C12 | `role: student` `422`, student user `404` | api batch, exit 0 | `apps/api/test/users.test.ts:337` path `role`; `:345`; `:352` `404` | PASS |
| C13 | student web paths (19) | web batch, exit 0 | `apps/web/e2e/proxy.spec.ts:221` - `toHaveURL('/minha-conta')`; `:227` `200`; `:228` no redirect; `:231` count 19 | PASS |
| C14 | staff off `/minha-conta` | web batch, exit 0 | `apps/web/e2e/proxy.spec.ts:239` - `toHaveURL('/dashboard')` | PASS |
| C15 | `/login` by role, anonymous to `/login` | web batch, exit 0 | `apps/web/e2e/proxy.spec.ts:247`; `:251`; `:255` | PASS |
| C16 | first access `202`, user, token, trail | api batch, exit 0 | `apps/api/test/portal-first-access.test.ts:71`; `:72` empty body; `:75` user row; `:78` `24:00:00`; `:81` trail with null author and IP | PASS |
| C17 | one mail after commit, hash, `500` rolls back | api batch, exit 0 | `apps/api/test/portal-first-access.test.ts:97`; `:100` 43 chars; `:104` `sha256(token)`; `:110`-`:113` | PASS |
| C18 | mail failure or delay keeps `202` | api batch, exit 0 | `apps/api/test/portal-first-access.test.ts:127`; `:128` under 2 s; `:135` one `portal_mail_failed` line; `:136` no recipient | PASS |
| C19 | second request, only newest link | api batch, exit 0 | `apps/api/test/portal-first-access.test.ts:154`; `:157`-`:158`; `:163`; `:165` `204` | PASS |
| C20 | nine ineligible cases | api batch, exit 0 | `apps/api/test/portal-first-access.test.ts:301`-`:304` status, body, `portalRecorded`, no mail; `:293` nine cases | PASS |
| C21 | same response for ten cases | api batch, exit 0 | `apps/api/test/portal-first-access.test.ts:322` - `expect(await shapeOf(...)).toEqual(reference)` | PASS |
| C22 | six invalid bodies `422` | api batch, exit 0 | `apps/api/test/portal-first-access.test.ts:346`-`:349` | PASS |
| C23 | 4th CPF, 11th IP, window edge | api batch, exit 0 | `apps/api/test/portal-throttle.test.ts:92`; `:95`-`:96` 55 to 60; `:97`; `:105`; `:111` | PASS |
| C24 | keys in `lead_throttles` only | api batch, exit 0 | `apps/api/test/portal-throttle.test.ts:130`-`:135`; `:139`; `:140` | PASS |
| C25 | two concurrent, one user, one open token | api batch, exit 0 | `apps/api/test/portal-first-access.test.ts:361`; `:363`; `:365` | PASS |
| C26 | four `portal` values; key lists gain two keys (user-approved rewrite) | api batch, exit 0; whole `students-read.test.ts` passed | `apps/api/test/students-read.test.ts:129` - `expect(body.portal, portal).toBe(portal)`; `:130`; `:82` instructor list. Diff confirms the older tests gained only the two keys | PASS |
| C27 | four labels, no mail control | web batch, exit 0 | `apps/web/e2e/students.spec.ts:885`; `:894`; `:898` | PASS |
| C28 | `/primeiro-acesso` states | web batch, exit 0 | `apps/web/e2e/portal-public.spec.ts:28`; `:31`; `:37`; `:43` | PASS |
| C29 | consume `204` and its effects | api batch, exit 0 | `apps/api/test/portal-password.test.ts:78`-`:80`; `:82`-`:84`; `:85` | PASS |
| C30 | six invalid tokens, one valid at the edge | api batch, exit 0 | `apps/api/test/portal-password.test.ts:110`-`:112`; `:117` | PASS |
| C31 | password bounds | api batch, exit 0 | `apps/api/test/portal-password.test.ts:126`-`:128`; `:130`; `:132` | PASS |
| C32 | concurrent consume | api batch, exit 0 | `apps/api/test/portal-password.test.ts:143` - `toEqual([204, 422])`; `:148`-`:150` | PASS |
| C33 | token of inactivated or anonymized student | api batch, exit 0 | `apps/api/test/portal-password.test.ts:160`-`:163`; `:170`-`:172` | PASS |
| C34 | login after set, `role: student` | api batch, exit 0 | `apps/api/test/portal-password.test.ts:181`; `:185`-`:186` | PASS |
| C35 | reset token replaces password | api batch, exit 0 | `apps/api/test/portal-password.test.ts:198`-`:201` | PASS |
| C36 | `/definir-senha` posts only on submit | web batch, exit 0 | `apps/web/e2e/portal-public.spec.ts:57`; `:64`; `:71`; `:78` | PASS |
| C37 | success and invalid link messages | web batch, exit 0 | `apps/web/e2e/portal-public.spec.ts:93`; `:104`; `:106`-`:107`; `:113` | PASS |
| C38 | reset `202`, one hour, invalidates previous | api batch, exit 0 | `apps/api/test/portal-reset.test.ts:43`-`:62`; `:50` `01:00:00`; `:68`-`:70` | PASS |
| C39 | four ineligible e-mails | api batch, exit 0 | `apps/api/test/portal-reset.test.ts:93`-`:95` | PASS |
| C40 | 4th e-mail, 11th IP, window | api batch, exit 0 | `apps/api/test/portal-throttle.test.ts:151`-`:154`; `:162`; `:167` | PASS |
| C41 | invalid e-mail `422` | api batch, exit 0 | `apps/api/test/portal-reset.test.ts:110`-`:113` | PASS |
| C42 | login links, `/esqueci-senha` states | web batch, exit 0 | `apps/web/e2e/login.spec.ts:100`-`:101`; `apps/web/e2e/portal-public.spec.ts:126`; `:131` | PASS |
| C43 | profile eleven keys, no `healthNotes` | api batch, exit 0 | `apps/api/test/portal-me.test.ts:60`; `:61`; `:79` `medium`; `:80` | PASS |
| C44 | `/api/me/*` only by session | api batch, exit 0 | `apps/api/test/portal-me.test.ts:93`; `:97`; `:102`; `:104`; `:107` `404` | PASS |
| C45 | payments equal staff's, read by `hr_finance` (user-approved rewrite) | api batch, exit 0 | `apps/api/test/portal-me.test.ts:125` - `expect(body).toEqual(await staff.json())`; `:126`; `:131` | PASS |
| C46 | staff `403`, anonymous `401` on five routes | api batch, exit 0 | `apps/api/test/portal-me.test.ts:150`-`:151`; `:159`-`:160` | PASS |
| C47 | `/minha-conta` data, newest first | web batch, exit 0 | `apps/web/e2e/portal.spec.ts:58`; `:66`-`:69`; `:74` | PASS |
| C48 | no enrollment message | web batch, exit 0 | `apps/web/e2e/portal.spec.ts:82`-`:83` | PASS |
| C49 | load error and retry | web batch, exit 0 | `apps/web/e2e/portal.spec.ts:90`-`:91`; `:96`; `:101`-`:102` | PASS |
| C50 | one column at 390 px | web batch, exit 0 | `apps/web/e2e/portal.spec.ts:116`; `:120` | PASS |
| C51 | four contact fields, student as author | api batch, exit 0 | `apps/api/test/portal-me.test.ts:183`; `:185`; `:188`; `:192`; `:196` | PASS |
| C52 | same schemas `422` | api batch, exit 0 | `apps/api/test/portal-me.test.ts:205`; `:209`; `:211` | PASS |
| C53 | eight forbidden keys | api batch, exit 0 | `apps/api/test/portal-me.test.ts:234`-`:235`; `:239`-`:241` | PASS |
| C54 | `/api/me/*` never changes e-mail or CPF | api batch, exit 0 | `apps/api/test/portal-me.test.ts:273` - `expect(await identity()).toEqual(before)` | PASS |
| C55 | e-mail follows, `409 email_in_use` | api batch, exit 0 | `apps/api/test/students-update.test.ts:135`; `:143`-`:146`; `:152`-`:153` | PASS |
| C56 | contact form | web batch, exit 0 | `apps/web/e2e/portal.spec.ts:131`-`:136`; `:145`; `:148`; `:162`-`:163` | PASS |
| C57 | pending stored with 30 days | api batch, exit 0 | `apps/api/test/portal-photo.test.ts:87`; `:91` `30 days`; `:92` three objects; `:93` author | PASS |
| C58 | `409 pending_photo_exists`, race | api batch, exit 0 | `apps/api/test/portal-photo.test.ts:104`-`:106`; `:112`; `:117` | PASS |
| C59 | nine files same as staff `POST` | api batch, exit 0 | `apps/api/test/portal-photo.test.ts:162` - `expect(response.status, name).toBe(staff.status)`; `:163`; `:168` statuses are `413`, `415`, `422`. Precision gap: the parenthetical names two statuses, see Open findings | PASS |
| C60 | pending never served, `PUT` leaves it (user-approved rewrite) | api batch, exit 0 | `apps/api/test/portal-photo.test.ts:176`; `:179`; `:180`; `:182`; `:187`-`:192` | PASS |
| C61 | approve | api batch, exit 0 | `apps/api/test/portal-photo.test.ts:207`-`:215`; `:212` `in_window` for 30 and 7 days | PASS |
| C62 | reject and purge | api batch, exit 0 | `apps/api/test/portal-photo.test.ts:231`; `:236`; `:241`-`:243` | PASS |
| C63 | `404`, `403`, `401`, `not_found` | api batch, exit 0 | `apps/api/test/portal-photo.test.ts:251`-`:252`; `:264`; `:267`; `:270`-`:271`; `:274` | PASS |
| C64 | expired pending purged | api batch, exit 0 | `apps/api/test/photos-purge.test.ts:129`-`:131` | PASS |
| C65 | `GET /api/me/photo` | api batch, exit 0 | `apps/api/test/portal-photo.test.ts:279`; `:283`-`:284`; `:290`-`:295` | PASS |
| C66 | concurrent approve and reject | api batch, exit 0 | `apps/api/test/portal-photo.test.ts:309`; `:311`; `:313` | PASS |
| C67 | pending next to the current, approve, reject | web batch, exit 0 | `apps/web/e2e/students.spec.ts:834`; `:842`-`:849`; `:858`; `:865`-`:866`. No assertion reads the current photo or the two side by side: "ao lado da corrente" (AC 51) has no evidence | FAIL |
| C68 | pending hides upload | web batch, exit 0 | `apps/web/e2e/portal.spec.ts:178`-`:185`; `:192`-`:197` | PASS |
| C69 | inactivation cuts in one transaction | api batch, exit 0 | `apps/api/test/portal-cutoff.test.ts:46`-`:49`; `:59`; `:62` | PASS |
| C70 | suspension keeps user | api batch, exit 0 | `apps/api/test/portal-cutoff.test.ts:74`-`:79` | PASS |
| C71 | refused `PATCH` inactive | api batch, exit 0 | `apps/api/test/portal-cutoff.test.ts:89`-`:92` | PASS |
| C72 | disabled login like inactive staff | api batch, exit 0 | `apps/api/test/portal-cutoff.test.ts:103`; `:108`-`:110` | PASS |
| C73 | reactivation keeps disabled | api batch, exit 0 | `apps/api/test/portal-cutoff.test.ts:120`; `:122`; `:127`; `:133`-`:134` | PASS |
| C74 | anonymization clears user | api batch, exit 0 | `apps/api/test/privacy-anonymize.test.ts:278`-`:281` | PASS |
| C75 | anonymization failure keeps user | api batch, exit 0 | `apps/api/test/privacy-anonymize.test.ts:302`-`:303`; `:308`-`:309` | PASS |
| C76 | staff anonymization still `409` | api batch, exit 0; selector matched two tests, both passed; whole file passed; file unchanged in the diff | `apps/api/test/staff-privacy.test.ts:201`-`:202` code is `staff_user_linked`; `:359`-`:360` | PASS |
| C77 | OpenAPI ten routes, contract bodies | api batch, exit 0 | `apps/api/test/openapi.test.ts:491`; `:172` | PASS |
| C78 | declared access | api batch, exit 0 | `apps/api/test/access.test.ts:154`; `:157`; `:160`; `:171`; `:191` | PASS |
| C79 | admin without 2FA blocked on `approve`/`reject` "e não nas três públicas"; student never | api batch, exit 0 | `apps/api/test/enrollment.test.ts:59`-`:60`; `:161`-`:162`. `:64`-`:65` iterates only the six lead routes: the three portal public routes are never called by this admin, so the second half has no assertion | FAIL |
| C80 | seven writes under origin check | api batch, exit 0 | `apps/api/test/csrf.test.ts:206`-`:209` | PASS |
| C81 | hostile bodies | api batch, exit 0 | `apps/api/test/hostile-input.test.ts:135`-`:136`; `:139`; `:147`-`:148`; `:154`-`:155` | PASS |
| C82 | audit failure rolls back seven writes | api batch, exit 0 | `apps/api/test/portal-audit.test.ts:92`-`:93` | PASS |
| C83 | public trail clean, refusals write none | api batch, exit 0 | `apps/api/test/portal-audit.test.ts:114`-`:117`; `:180` | PASS |
| C84 | 52 counted, labels | api and web batches, exit 0 | `apps/api/test/contracts.test.ts:1333`; `:1336`; `:1346`; `apps/web/e2e/audit.spec.ts:613`-`:617` | PASS |
| C85 | `ROLE_LABELS.student`, select with four | web batch, exit 0 | `apps/web/e2e/users.spec.ts:55`-`:58` | PASS |
| C86 | `minha-conta` segment; motion baseline of `/login` changed only by two links, staff screens unchanged | repo and web batches, exit 0 | `tests/repo/motion.test.ts:121` - `expect(SEGMENTS).toContain('minha-conta')`; `apps/web/e2e/motion.spec.ts:920`-`:924`. Both baselines hold 22 paths and none is `/login`, so the `/login` clause has nothing to assert, and the `/audit` entry of each baseline did change (`apps/web/e2e/fixtures/motion-baseline/1440.json:739`) | FAIL |
| C87 | public pages with CSP, no prefix leak | web batch, exit 0 | `apps/web/e2e/proxy.spec.ts:181`-`:187`; `:190`; `:196` | PASS |
| C88 | throttle module | api batch, exit 0 | `apps/api/test/portal-throttle.test.ts:46`; `:49`; `:65`; `:77`; `:79` | PASS |
| C89 | eligibility table, 13 rows | api batch, exit 0 | `apps/api/test/portal-first-access.test.ts:258`; `:267`; `:270`-`:274` | PASS |
| C90 | `portalState`, six rows | api batch, exit 0 | `apps/api/test/portal-first-access.test.ts:287`-`:288` | PASS |
| C91 | photo proofs unchanged (user-approved rewrite) | api batch, exit 0; whole files passed | `apps/api/test/photos-replace.test.ts:100`-`:102`; `apps/api/test/photos-urls.test.ts:360`-`:361`. `photos-upload` and `photos-replace` have no diff; `photos-urls` gained only the two keys and the `StaffRole` type | PASS |
| C92 | real stack | stack run, exit 0 | `tests/stack/compose.test.ts:1694`; `:1704`-`:1705`; `:1719`; `:1731`; `:1734` | PASS |

## Coverage

Recomputed from the code, the framework or the plan, as each row says. The rows of `checks.md` not
listed one by one below (`Relations`, roles, purposes, token cases, password bounds, labels, keys,
transitions, tables, audit actions, web paths, screens, messages) were each walked against the
evidence in `## Checks`, with no member unproven beyond those shown.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `POST /api/portal/first-access` statuses (3) | `portal.controller.ts`, `portal.service.ts` | 202 C16 · 422 C22 · 429 C23 | - |
| `POST /api/password-tokens/consume` statuses (2) | `portal.service.ts` | 204 C29 · 422 C30, C31, C33 | - |
| `POST /api/password-reset` statuses (3) | `portal.service.ts` | 202 C38 · 422 C41 · 429 C40 | - |
| `GET /api/me/profile` statuses (3) | `me.controller.ts` | 200 C43 · 401 C46 · 403 C46 | - |
| `PATCH /api/me/profile` statuses (4) | `me.controller.ts` | 200 C51 · 401, 403 C46 · 422 C52, C53 | - |
| `GET /api/me/payments` statuses (3) | `me.controller.ts` | 200 C45 · 401, 403 C46 | - |
| `POST /api/me/photo` statuses (7, the `Surface` lists 6) | `photos.service.ts` | 201 C57 · 401, 403 C46 · 409 C58 · 413, 415, 422 C59 | - |
| `GET /api/me/photo` statuses (5, the `Surface` lists 4) | `me.controller.ts`, `photoQuerySchema` via `@QueryInput` | 200, 404 C65 · 401, 403 C46 | `422` on an invalid `variant`: no test sends one |
| `approve` statuses (4) | `photos.controller.ts` | 200 C61 · 401, 403, 404 C63 | - |
| `reject` statuses (4) | `photos.controller.ts` | 204 C62 · 401, 403, 404 C63 | - |
| `500` by new write (7) | `portal-audit.test.ts` table | C82 | - |
| `403 csrf_rejected` by new write (7) | `csrf.test.ts` table | C80 | - |
| new error codes (3) | `photos.service.ts`, `students.controller.ts` | `no_pending_photo` C63 · `pending_photo_exists` C58 · `email_in_use` C55 | - |
| `pendingPhoto` fields at the API (4) | `pendingPhotoSchema`, `pendingOf` | `id` C60 · `version`, `createdAt` C57 | `url`: no API test reads it, and F1 survived |
| admin without 2FA on new routes (9) | C79's claim | `approve`, `reject` and the five `/api/me/*` C79 | the three public routes, named in the claim and never called |
| new routes in OpenAPI (10) | `listRoutes` | C77 | - |
| public routes (13) | `access.test.ts` | C78 | - |
| first access situations (13), refusals (9), uniform response (10) | `firstAccessDecision` | C89, C20, C21 | - |
| `portal` states (4) and edges (2) | `portalState` | C26, C90 | - |
| limits (4 keys), window (2 edges) | `PORTAL_LIMITS` | C23, C40, C88 | - |
| files refused by the pipeline (9) | `photos-upload.test.ts` | C59 | - |
| readings of the current photo (3) | `photos.service.ts:376` `is_current` filter | list, ficha, check-in C60 | - |
| ficha transitions touching the user (4) | `students.service.ts:262` | C69, C70, C71, C73 | - |
| tables cleared on anonymization (5) | `privacy.service.ts`, `clearStudentUser` | C74, and F2 confirms `two_factors` is really exercised | - |
| ficha elements of the pending review (2) | AC 51 | pending photo and buttons C67 | the current photo beside it |
| screens in the motion baseline (22 paths) | `motion-baseline/1440.json`, `390.json` | C86 for those 22 | `/login`: not in either file, though C86 and `Impact` say it is checked |
| startup config: `MailService` (2 assemblies) | `apps/api/src/app.module.ts:169`, `:186`; `tests/stack/compose.test.ts:1704` | tests C17 · stack C92 | - |
| startup config: `PhotoPurge` (2 assemblies) | `apps/api/src/app.module.ts:128`; `apps/api/test/photos-purge.test.ts:167` | C62, C64 | - |

`Swept` rows resolving to existing: the global guard is at `apps/api/src/app.module.ts:202`
(`APP_GUARD`, `AccessGuard`), and the origin check at `apps/api/src/csrf.ts:25`. Both are there.

Level: every claim naming a status, route or response shape has a proof crossing HTTP, except
`pendingPhoto.url`, a response field whose only proofs are against the `FakeApi`.

## Test policy rows

The two rows of this feature, plus the rows inherited from `pre-cadastro` and earlier.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Eligibility with many conditions | `portal.service.ts` `firstAccessDecision` | service table C89 · boundary C20, C21 | yes |
| State derived from two tables | `portal.service.ts` `portalState` | pure C90 · boundary C26 | yes |
| Route that decides, over HTTP, with role cut and trail | `portal.controller.ts`, `me.controller.ts`, `photos.controller.ts`, `students.controller.ts` | C16 to C83 | no |
| Database constraint | `0013_portal.sql` | C1 to C5 | yes |
| Count in a window | `lead-throttle.ts` | module C88 · boundary C23, C40; the race runs on the shared statement at `apps/api/test/leads-throttle.test.ts:78` | yes |
| Side effect after commit | `portal.service.ts` `deliver` | capture C17, C18, C38; `apps/api/src/mail` is not in the diff | yes |
| Screen against the `FakeApi` | `minha-conta`, public pages, ficha | C27, C28, C36, C37, C42, C47 to C50, C56, C67, C68 | yes |
| Stack through `psql` | `tests/stack/compose.test.ts` | C92 | yes |

The third row is unmet by `pendingPhoto.url` only: `pendingOf` returns it across HTTP and no
boundary proof asserts it.

## Faults injected

Worktree at `5881ed0` under the scratchpad. Porcelain of the real tree was empty before and after.
A first pass was discarded: `esbuild.exe` got "Acesso negado" writing `dist` under the scratchpad,
so every proof died in `pnpm build` and "exit 1" meant nothing. In the scratch `build.mjs` only,
Node then wrote the bundle (`write: false`), and all five results below come from runs that reached
the tests.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1: `url` dropped from `pendingOf` | `apps/api/src/photos/photos.service.ts:345` | no - survived `portal-photo`, `portal-me`, `photos-urls`, `students-read`, 37 passed |
| F2: `two_factors` not deleted on anonymization | `apps/api/src/privacy/privacy.service.ts` `clearStudentUser` | yes - C74 |
| F3: sessions not deleted on consume | `apps/api/src/portal/portal.service.ts:214` | yes - C29, C35 |
| F4: guardian ignored in the decision | `apps/api/src/portal/portal.service.ts:68` | yes - C20, C89 |
| F5: `/two-factor` not reachable by a student | `apps/web/src/proxy.ts` | yes - C13 |

## Gate

`py -3 C:/Users/Admin/.claude/skills/tlc-spec-lean/scripts/validate_verification.py portal-aluno --root C:/Users/Admin/projetos/academia-bairro` - exit 1 by design, because this report's verdict is FAIL. Proofs: 102 passed, 0 failed.

The whole files named by C26, C76 and C91 were also run. The first run shared the machine with the
stack proof: 55 passed, one test in `staff-privacy.test.ts` got a `500` where it expected `204`, and
two `afterAll` hooks timed out at 10 s. Run again with nothing else on the machine,
`staff-privacy.test.ts` and `photos-urls.test.ts` passed 25 of 25, so this reads as load, not a
defect, though the `500` itself was not explained.

## Ranked gaps

1. `pendingPhoto.url` unproven at the API; F1 survived - C67, C68 - `apps/api/src/photos/photos.service.ts:345`. Assert it in `GET /api/students/:id` and `GET /api/me/profile`.
2. Three public routes never called by the admin without 2FA - C79 - `apps/api/test/enrollment.test.ts:64`. Widen the filter.
3. C86 claims a `/login` baseline that does not exist and unchanged staff screens while `/audit` changed - C86 - `apps/web/e2e/fixtures/motion-baseline/1440.json:739`. Needs a user-approved rewrite of the check, or a `/login` proof.
4. "ao lado da corrente" has no assertion - C67 - `apps/web/e2e/students.spec.ts:834`.
5. `422` on an invalid `variant` has no proof and is not in the `Surface` - Coverage - `apps/api/src/portal/me.controller.ts:74`.

## Open findings (do not change the verdict)

- **Precision gap, C59 and AC 45:** "(`413` ou `422`)" is narrower than the behaviour. Three of the nine files answer `415`, the same as the staff `POST`, and the `Surface` omits `415`. The test asserts the true set, so the check text is what is wrong. Unlike C26, C45, C60 and C91, this has no recorded user approval.
- **Precision gap, C76:** the check says `user_linked`; the code is `staff_user_linked`. The selector matches two tests, as the check's plural allows, and the file has no diff.
- **`pendingPhotoSchema.url`:** additive and optional, so C8 holds, and `POST /api/me/photo` returns the object without it. Being optional is why the schema did not catch F1. It also carries a signed URL to all four staff profiles, including those AC 51 hides the buttons from; the user approved the keys for the four profiles, and the record does not say whether that covered the URL.
- **No check covers these, both outside the verdict:** `PhotosService.remove` deletes every row of the owner, so staff removing the photo also deletes a pending one (`apps/api/src/photos/photos.service.ts:273`), while `Impact` says version listings ignore it. Inactivation leaves open tokens in place, so after reactivation an unexpired `reset` link can turn the user back on without the new first access AC 56 asks for (`apps/api/src/portal/portal.service.ts:202`). The second comes from reading the code and was not run.
- **C26, C45, C60, C91:** the rewritten text matches the tests. The approvals are recorded in `checks.md`; this report cannot confirm them independently.
