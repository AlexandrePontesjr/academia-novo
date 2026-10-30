# Portal do aluno verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 1e19a01..working tree
**Round**: 5 - scoped
**Verifier**: independent sub-agent (author != verifier)

PASS, with one mutation left alive on purpose and named here so that nobody reads the verdict as "everything died":
**F12b was not killed.** It removes `found.anonymized` from `apps/api/src/portal/portal.service.ts:202`, and all 38
tests of the narrow set pass under it. I judge it **not a behaviour-level fault**, so it does not fail this round:
in every state the database admits it answers exactly what the unmutated code answers, and I could not produce a
state where it differs by any path I tried, races included. Evidence below, under `Faults injected`. That judgment
is mine, and it is the one thing in this PASS that rests on a conclusion instead of a red test. It is also why the
gate does not see F12b at all: see the note under `Faults injected`.

Everything round 4 left open is closed. All 93 checks hold, with the rewritten C69 and C33 judged sentence by
sentence. F13, the failure of round 4, now dies twice, at `apps/api/test/portal-cutoff.test.ts:55` (the comparison
of `password_tokens` after the `500`) and at `:81` (the open link still consumes). F12 dies at
`apps/api/test/portal-password.test.ts:193`, and the joint F12+F12b dies at the same line, on either order of the
loop. F6, F6b and F6c still die, and a fault of mine, F14, makes the new credentials comparison at `:195` fail, which
no other fault reaches. The third Test policy row is met. One precision gap remains in the wording of C33, and one
sentence of the `Handoff` needs a correction; both are reported and neither changes a row.

The change is uncommitted at the time of this run: `HEAD` is `1e19a01` and the diff lives in the working tree, in
`.specs/features/portal-aluno/checks.md`, `apps/api/test/portal-cutoff.test.ts` and
`apps/api/test/portal-password.test.ts`. `verification.md` also shows as modified: that was the round 4 report and is
not part of the change. Confirmed: `git diff --stat cf26676 -- apps/api/src packages apps/web/src` prints nothing, so
production code is that of `cf26676`, and `git diff --stat cf26676..HEAD -- apps packages tests` prints nothing either,
so the two changed test files are the working-tree ones and no support file moved (`tokenRows` already existed). The
author's description holds: C69 and C33 were rewritten and gained the named Proofs, C69's existing test gained
`password_tokens` in the failing branch, the flagged lines of `checks.md` were adjusted, and `## Handoff` gained text
(`checks.md:488`). The parser found 93 checks and 105 Proof lines; `validate_checks.py portal-aluno` exits 0 with no
warning.

Scope: that diff, plus every verdict not PASS in round 4 (the third Test policy row, F13, F12, F12b). Proofs are
`verified at 1e19a01 + working tree` for all 93. Rows citing `portal-cutoff.test.ts` or `portal-password.test.ts`
(C29 to C35, C69 to C73, C93) are judged at that state, with every citation rechecked. Evidence of every other row is
carried and says from where: `carried from cf26676` or, where it already said so, `carried from 5881ed0`.

## Binding sources

Not run: the profile is `standard`, and the plan marks no source as binding; the diff touched no interface. `carried from 5881ed0`.

## Checks

Proofs `verified at 1e19a01 + working tree`. All 105 Proof lines, one invocation per target and one target at a time
with nothing else of mine running, JSON reporter: contracts 3, db 5, repo 1, api 76, web 20, stack 1, so 106 tests
passed and 0 failed. The API count is 75 selectors plus one, because C76's selector matches two tests
(`staff_active_409_not_inactive_and_linked_user_409_staff_user_linked`, `staff_not_inactive_comes_before_user_linked`).
The JSON of each run was joined against every selector in its own file: 0 selectors without a passing test, and no
proof resolved to skipped only. Beyond C76, two selectors are substrings: C6's second resolves to
`ten_actions_written_equal_contract_vocabulary`, C86's first to `eleven_segments_have_app_loading`. The six selectors
of C33, C69 and C93 each resolved to one test of exactly that name. C92 ran: Docker answered (server 29.9.2) and the
stack proof passed in 121 s, so it is not carried. The whole files of C26, C76 and C91 (`students-read`,
`staff-privacy`, `photos-upload`, `photos-replace`, `photos-urls`) ran again, with `portal-cutoff` and
`portal-password`: 72 of 72. `pnpm verify` was not used (AD-118); the runners were called through `node` from each
package.

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
| C27 | four labels, no mail control | web batch, exit 0; evidence carried from cf26676 | `apps/web/e2e/students.spec.ts:894` - `getByText(label)` visible; `:903` no portal control; `:907` no portal request | PASS |
| C28 | `/primeiro-acesso` states | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal-public.spec.ts:28`; `:31`; `:37`; `:43` | PASS |
| C29 | consume `204` and its effects | api batch, exit 0; citations rechecked at 1e19a01 + working tree, lines unchanged | `apps/api/test/portal-password.test.ts:78`-`:80`; `:82`-`:84`; `:85` | PASS |
| C30 | six invalid tokens, one valid at the edge | api batch, exit 0; citations rechecked at 1e19a01 + working tree, lines unchanged | `apps/api/test/portal-password.test.ts:110`-`:112`; `:117` | PASS |
| C31 | password bounds | api batch, exit 0; citations rechecked at 1e19a01 + working tree, lines unchanged | `apps/api/test/portal-password.test.ts:126`-`:128`; `:130`; `:132` | PASS |
| C32 | concurrent consume | api batch, exit 0; citations rechecked at 1e19a01 + working tree, lines unchanged | `apps/api/test/portal-password.test.ts:143` - `toEqual([204, 422])`; `:148`-`:150` | PASS |
| C33 | token closed by the route, or open on a ficha set by SQL (rewritten) | api batch, exit 0; two Proofs, each one test; verified at 1e19a01 + working tree | `apps/api/test/portal-password.test.ts:160`-`:163`; `:170`-`:172`; `:188` - `expect((await tokenRows(stack, userId)).map((row) => row.used_at)).toEqual([null])`, `:193` - `expect(refused.status).toBe(422)`, `:194`, `:195` - `expect(await credentials(userId)).toEqual(before)`. See the judgment below; F12b is not killed | PASS |
| C34 | login after set, `role: student` | api batch, exit 0; citations verified at 1e19a01 + working tree | `apps/api/test/portal-password.test.ts:205`; `:209`-`:210` | PASS |
| C35 | reset token replaces password | api batch, exit 0; citations verified at 1e19a01 + working tree | `apps/api/test/portal-password.test.ts:222`-`:225` | PASS |
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
| C59 | nine files same as staff `POST`, status `413`, `415` or `422` (rewritten, user-approved) | api batch, exit 0; evidence carried from cf26676 | `apps/api/test/portal-photo.test.ts:162` - `expect(response.status, name).toBe(staff.status)`; `:163` same `code`; `:164` nothing changed; `:168` - `expect([...seen].sort()).toEqual([413, 415, 422])`, the set the claim now names | PASS |
| C60 | pending never served, `PUT` leaves it (user-approved rewrite) | api batch, exit 0; evidence carried from cf26676 | `apps/api/test/portal-photo.test.ts:179` ficha signs the current; `:180` - `expect(ficha.pendingPhoto?.id).toBe(pending.id)`; `:182` - `expect(ficha.pendingPhoto?.url).toContain(...medium?)`; `:189`-`:194` `201`, version 3, current, pending row identical | PASS |
| C61 | approve | api batch, exit 0; evidence carried from cf26676 | `apps/api/test/portal-photo.test.ts:209`-`:217`; `:214` `in_window` for 30 and 7 days | PASS |
| C62 | reject and purge | api batch, exit 0; evidence carried from cf26676 | `apps/api/test/portal-photo.test.ts:233`; `:238`; `:243`-`:245` | PASS |
| C63 | `404`, `403`, `401`, `not_found` | api batch, exit 0; evidence carried from cf26676 | `apps/api/test/portal-photo.test.ts:253`-`:254`; `:266`; `:269`; `:272`-`:273`; `:276` | PASS |
| C64 | expired pending purged | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/photos-purge.test.ts:129`-`:131` | PASS |
| C65 | `GET /api/me/photo`, now with `422` on an invalid `variant` | api batch, exit 0; evidence carried from cf26676 | `apps/api/test/portal-photo.test.ts:281` `404`; `:285`-`:286` pending `null`; `:296`-`:297` `medium`; `:300`-`:301` `thumb`; `:304` - `expect(invalid.status).toBe(422)`; `:305` path `variant` | PASS |
| C66 | concurrent approve and reject | api batch, exit 0; evidence carried from cf26676 | `apps/api/test/portal-photo.test.ts:319`; `:321`; `:323` | PASS |
| C67 | pending next to the current, approve, reject | web batch, exit 0; evidence carried from cf26676 | `apps/web/e2e/students.spec.ts:836` pending `src`; `:841` - `expect(beside!.x).toBeGreaterThanOrEqual(current!.x + current!.width)`; `:842`-`:843` same height band; `:851`; `:858`; `:866`-`:867`; `:874`-`:875` no buttons for two roles. F9 stacks them and fails at `:841` | PASS |
| C68 | pending hides upload | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/portal.spec.ts:178`-`:185`; `:192`-`:197` | PASS |
| C69 | inactivation cuts in one transaction, tokens included, and a refused one leaves the link usable (rewritten) | api batch, exit 0; two Proofs, each one test; verified at 1e19a01 + working tree | `apps/api/test/portal-cutoff.test.ts:51`-`:54`; `:55` - `expect(await tokenRows(stack, failing.user.id)).toEqual(tokens)`; `:59`; `:65`; `:68`; `:80`; `:81` - `expect((await postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-4' })).status).toBe(204)`. See the judgment below | PASS |
| C70 | suspension keeps user | api batch, exit 0; citations verified at 1e19a01 + working tree | `apps/api/test/portal-cutoff.test.ts:91`-`:96`; `:97` | PASS |
| C71 | refused `PATCH` inactive | api batch, exit 0; citations verified at 1e19a01 + working tree | `apps/api/test/portal-cutoff.test.ts:107`-`:110` | PASS |
| C72 | disabled login like inactive staff | api batch, exit 0; citations verified at 1e19a01 + working tree | `apps/api/test/portal-cutoff.test.ts:121`; `:126`-`:128` | PASS |
| C73 | reactivation keeps disabled | api batch, exit 0; citations verified at 1e19a01 + working tree | `apps/api/test/portal-cutoff.test.ts:174` - `expect(await userActive(user.id)).toBe(false)`; `:176`; `:181`-`:182`; `:187`-`:188` | PASS |
| C74 | anonymization clears user | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/privacy-anonymize.test.ts:278`-`:281` | PASS |
| C75 | anonymization failure keeps user | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/privacy-anonymize.test.ts:302`-`:303`; `:308`-`:309` | PASS |
| C76 | staff anonymization still `409` | api batch, exit 0; selector matched two tests, both passed; whole file passed; evidence carried from 5881ed0 | `apps/api/test/staff-privacy.test.ts:201`-`:202` code is `staff_user_linked`; `:359`-`:360` | PASS |
| C93 | open link of each purpose: `DELETE` fills `used_at`; after reactivation consume `422` in `token`, `users.active` false | api batch, exit 0; verified at 1e19a01 + working tree; each selector matched one test | `apps/api/test/portal-cutoff.test.ts:137`-`:140` - `expect(await tokensClosed(user.id)).toEqual([['first_access', true], ['reset', true]])`, `:145`-`:147`; `:157` - `expect(await tokensClosed(user!.id)).toEqual([['first_access', true]])`, `:162`-`:164`. See the judgment below | PASS |
| C77 | OpenAPI ten routes, contract bodies | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/openapi.test.ts:491`; `:172` | PASS |
| C78 | declared access | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/access.test.ts:154`; `:157`; `:160`; `:171`; `:191` | PASS |
| C79 | admin without 2FA blocked on `approve`/`reject` "e não nas três públicas"; student never | api batch, exit 0; evidence carried from cf26676 | `apps/api/test/enrollment.test.ts:59`-`:60` blocked; `:76` - `expect(portalPublic).toHaveLength(3)`; `:81` `422`; `:82` - `expect(text, route).not.toContain('two_factor_enrollment_required')`; `:172`-`:173` student. F7 fails at `:81` | PASS |
| C80 | seven writes under origin check | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/csrf.test.ts:206`-`:209` | PASS |
| C81 | hostile bodies | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/hostile-input.test.ts:135`-`:136`; `:139`; `:147`-`:148`; `:154`-`:155` | PASS |
| C82 | audit failure rolls back seven writes | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-audit.test.ts:92`-`:93` | PASS |
| C83 | public trail clean, refusals write none | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-audit.test.ts:114`-`:117`; `:180` | PASS |
| C84 | 52 counted, labels | api and web batches, exit 0; evidence carried from 5881ed0 | `apps/api/test/contracts.test.ts:1333`; `:1336`; `:1346`; `apps/web/e2e/audit.spec.ts:613`-`:617` | PASS |
| C85 | `ROLE_LABELS.student`, select with four | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/users.spec.ts:55`-`:58` | PASS |
| C86 | `minha-conta` segment; baselines changed only in `/audit`, by five options; no `/login`, whose links are C42 (rewritten, user-approved) | repo and web batches, exit 0; evidence carried from cf26676 | `tests/repo/motion.test.ts:121` - `expect(SEGMENTS).toContain('minha-conta')`; `apps/web/e2e/motion.spec.ts:920`-`:924` compare against the baselines. Baselines compared as JSON at `6bec03d` and HEAD: same 22 keys, only `/audit` differs, only `text` and `aria`, five lines added and none removed in each of `390.json` and `1440.json` (`apps/web/e2e/fixtures/motion-baseline/1440.json:739`); no `/login` key; links at `apps/web/e2e/login.spec.ts:100`-`:101` | PASS |
| C87 | public pages with CSP, no prefix leak | web batch, exit 0; evidence carried from 5881ed0 | `apps/web/e2e/proxy.spec.ts:181`-`:187`; `:190`; `:196` | PASS |
| C88 | throttle module | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-throttle.test.ts:46`; `:49`; `:65`; `:77`; `:79` | PASS |
| C89 | eligibility table, 13 rows | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:258`; `:267`; `:270`-`:274` | PASS |
| C90 | `portalState`, six rows | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/portal-first-access.test.ts:287`-`:288` | PASS |
| C91 | photo proofs unchanged (user-approved rewrite) | api batch, exit 0; whole files passed; evidence carried from 5881ed0 | `apps/api/test/photos-replace.test.ts:100`-`:102`; `apps/api/test/photos-urls.test.ts:360`-`:361` | PASS |
| C92 | real stack | stack run, exit 0; evidence carried from 5881ed0 | `tests/stack/compose.test.ts:1694`; `:1704`-`:1705`; `:1719`; `:1731`; `:1734` | PASS |

### C69, sentence by sentence

Judged against `.specs/features/portal-aluno/checks.md:280`. Both tests are in `apps/api/test/portal-cutoff.test.ts`:
T is `inactivation_disables_user_and_drops_sessions_in_one_transaction` (`:39`), L is
`failed_inactivation_keeps_open_link_usable` (`:72`).

| Claim | Evidence | Judgment |
| --- | --- | --- |
| "Com um aluno com usuário ativo e duas sessões" | T `:40` `withTwoSessions`, `:44` `expect(sessions).toHaveLength(2)` | holds; the second session comes from a real login, which only an active user gets |
| "`DELETE /api/students/:id` responde `204`" | T `:59` `expect(response.status).toBe(204)` | holds |
| "na mesma leitura, a ficha é `inactive`, `users.active` é `false` e `sessions` do usuário está vazia" | T `:60`-`:64` one `select`, `:65` `expect(row).toEqual({ status: 'inactive', active: false, sessions: '0' })` | holds, one statement |
| "a chamada seguinte a `GET /api/me/profile` com o cookie antigo responde `401`" | T `:67`-`:69`, `expect(next.status).toBe(401)`, code `unauthorized` | holds |
| "com `withAuditInsertFailing` e um link de `reset` aberto" | T `:45` real `POST /api/password-reset` `202`, `:47` `expect(tokens.filter((row) => row.used_at === null)).toHaveLength(1)`, `:49`; L `:75`-`:78` | holds. `:47` does not name the purpose, but `:45` is the only open token issued: the `first_access` was consumed by `portalSession` |
| "a resposta é `500`" | T `:51`, L `:80`, `expect(refused.status).toBe(500)` | holds on both |
| "ficha, usuário, sessões e `password_tokens` ficam como estavam" | T `:52` to `:54`, `:55` `expect(await tokenRows(stack, failing.user.id)).toEqual(tokens)` | holds, exact: ficha and user as `to_jsonb` text, and `tokenRows` carries `id`, `purpose`, `token_hash`, `used_at`, `validity`. F13 dies at `:55` |
| "e o link aberto segue valendo: o consumo responde `204`" | L `:81` `expect((await postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-4' })).status).toBe(204)` | holds. F13 dies at `:81`, `expected 422 to be 204`, the observable round 4 described |

**Does it close `plan.md:45`?** Yes. "Na mesma transação" names four effects: ficha, user, sessions, tokens. `:52` to `:55`
read all four after a refused `DELETE`, and F13, the fault that moves one of them out, fails. The citation "AC 53, `Flow`
"Corte de acesso"" resolves: `plan.md:225` and `plan.md:43`-`:45`. **Level:** both proofs cross HTTP. T still goes on to
the successful `DELETE` in the same fixture, which is fine: the `500` branch is compared before it.

### C33, sentence by sentence

Judged against `.specs/features/portal-aluno/checks.md:160`. Both tests are in `apps/api/test/portal-password.test.ts`:
A is `token_of_inactivated_or_anonymized_student_422` (`:153`), B is `open_token_on_ficha_inactive_or_anonymized_by_sql_422`
(`:175`).

| Claim | Evidence | Judgment |
| --- | --- | --- |
| "Com o token emitido e a ficha depois inativada por `DELETE /api/students/:id`, o consumo responde `422` em `token`" | A `:157` `204`, `:160` `expect(refused.status).toBe(422)`, `:161` `expect(await pathsOf(refused)).toEqual(['token'])` | holds |
| "e nenhuma senha muda" | A `:162` no `accounts` row, `:163` `expect(await credentials(inactivated.userId)).toEqual(beforeInactivated)` | holds |
| "com a ficha depois anonimizada, o consumo responde `422` em `token`" | A `:166`, `:167` real anonymization `204`, `:170`, `:171`, `:172` | holds |
| "Como nenhuma rota deixa token aberto nesses estados" | a premise, not an assertion. Reasoned and probed in round 4, `carried from 1e19a01 + round 4 working tree`: production code did not change, so the analysis stands, with the weakness it stated (no race interleaving was observed; the lock reasoning carries it) | accepted as stated, unproven by a test, and no test could prove a universal over routes |
| "as cláusulas do consumo são provadas à parte" | B as a whole | **precision gap.** True of `inactive`: F12 dies at `:193`. Not true of `anonymized` as a clause: F12b leaves B green, because `:202` reaches `inactive` first on that row. What B proves there is the behaviour, not the clause. See below |
| "com o token aberto (`used_at` nulo)" | B `:188` `expect((await tokenRows(stack, userId)).map((row) => row.used_at)).toEqual([null])` | holds, read per case before the consume |
| "numa ficha posta `inactive` por SQL" | B `:177` `update students set status = 'inactive', inactivated_at = now()` | holds |
| "e numa ficha anonimizada por SQL" | B `:179`-`:185`, all the fields `students_anonymized_clean` requires | holds; the update succeeded, so the row is one the constraint accepts |
| "o consumo responde `422` em `token`" | B `:193` `expect(refused.status).toBe(422)`, `:194` `expect(await pathsOf(refused)).toEqual(['token'])` | holds, both cases, in the loop at `:187` |
| "e conta, usuário e tokens ficam idênticos" | B `:189`, `:195` `expect(await credentials(userId)).toEqual(before)`; `credentials` (`:56`) reads `accounts`, `users`, `password_tokens` as `to_jsonb` text | holds, exact. F14 dies at `:195` |

**Limit of the loop.** The loop at `:187` stops at its first failure, so under a fault that hits both cases only `inactive`
is seen to fail. I ran it reversed in the scratch (`[anonymized, inactive]`): the joint F12+F12b dies at `:193` on the
anonymized case, `expected 204 to be 422`, and F12 alone dies on the inactive one. So each case can fail and is carrying
weight; the shipped order just never shows the second one failing.

**Level:** the state is set by SQL, as the claim says, and the consume crosses HTTP. The citation "AC 22"
resolves at `plan.md:157`; it sits before the second sentence, which carries no citation of its own.

### C93, sentence by sentence

Citations refreshed at 1e19a01 + working tree; lines moved by 16 and the judgment is unchanged from round 4. Judged against
`.specs/features/portal-aluno/checks.md:305`. Both tests are in `apps/api/test/portal-cutoff.test.ts`: R is
`reactivation_does_not_revive_links_issued_before_inactivation` (`:131`), P is
`reactivation_does_not_revive_first_access_link_issued_before_inactivation` (`:150`).

| Claim | Evidence | Judgment |
| --- | --- | --- |
| "Com um link aberto de um aluno com usuário, de `reset` (usuário ativo)" | R `:132`-`:135`: `portalSession`, a real `POST /api/password-reset` answering `202`, token read from the mail | holds |
| "e de `first_access` (usuário pendente)" | P `:151`-`:155`: `insertAdultStudent`, a real first access answering `202`, token read from the mail. That the user is pending is C16's assertion | holds |
| "`DELETE /api/students/:id` deixa `used_at` preenchido no token desse link" | R `:136` `204`, `:137`-`:140` `expect(await tokensClosed(user.id)).toEqual([['first_access', true], ['reset', true]])`; P `:156` `204`, `:157` `expect(await tokensClosed(user!.id)).toEqual([['first_access', true]])` | holds. `tokensClosed` (`:30`) reads every token of the user, ordered. In R the `first_access` pair was consumed by `portalSession`; `reset` is the live member |
| "depois da reativação por `PATCH` com `status: 'active'`" | R `:141`, P `:158`, `200` | holds, across HTTP |
| "`POST /api/password-tokens/consume` com esse token responde `422` em `token`" | R `:145`, `:146`; P `:162`, `:163` | holds, exact on both |
| "e `users.active` é `false`" | R `:147` `expect(await userActive(user.id)).toBe(false)`; P `:164` | holds |

## Coverage

`tokens recusados` and `POST /api/password-tokens/consume` statuses are `verified at 1e19a01 + working tree`, the rows the
diff touched or whose proofs moved, recomputed from `apps/api/src/portal/portal.service.ts` and
`apps/api/src/students/students.service.ts`. Two rows are new in this report, for sets `checks.md` has no row for. Production
code did not change, so the rest stay carried: `carried from cf26676` or `carried from 5881ed0` as marked, and the rows of
`checks.md` not listed one by one (`Relations`, roles, purposes, password bounds, labels, keys, transitions, tables, audit
actions, web paths, screens, messages) `carried from 5881ed0`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `POST /api/portal/first-access` statuses (3), carried from 5881ed0 | `portal.controller.ts`, `portal.service.ts` | 202 C16 · 422 C22 · 429 C23 | - |
| `POST /api/password-tokens/consume` statuses (2), verified at 1e19a01 + working tree | `portal.service.ts` | 204 C29, C35, C69 · 422 C30, C31, C33, C93 | - |
| `POST /api/password-reset` statuses (3), carried from 5881ed0 | `portal.service.ts` | 202 C38 · 422 C41 · 429 C40 | - |
| `GET /api/me/profile` statuses (3), carried from 5881ed0 | `me.controller.ts` | 200 C43 · 401 C46 · 403 C46 | - |
| `PATCH /api/me/profile` statuses (4), carried from 5881ed0 | `me.controller.ts` | 200 C51 · 401, 403 C46 · 422 C52, C53 | - |
| `GET /api/me/payments` statuses (3), carried from 5881ed0 | `me.controller.ts` | 200 C45 · 401, 403 C46 | - |
| `POST /api/me/photo` statuses (7), carried from cf26676 | `photos.service.ts`, note under `Surface` in `plan.md` | 201 C57 · 401, 403 C46 · 409 C58 · 413, 415, 422 C59 | - |
| `GET /api/me/photo` statuses (5), carried from cf26676 | `me.controller.ts`, `photoQuerySchema` via `@QueryInput`, note under `Surface` | 200, 404 C65 · 401, 403 C46 · 422 C65 (`apps/api/test/portal-photo.test.ts:304`), F8 confirms | - |
| `approve` statuses (4), carried from 5881ed0 | `photos.controller.ts` | 200 C61 · 401, 403, 404 C63 | - |
| `reject` statuses (4), carried from 5881ed0 | `photos.controller.ts` | 204 C62 · 401, 403, 404 C63 | - |
| `500` by new write (7), carried from 5881ed0 | `portal-audit.test.ts` table | C82 | - |
| `403 csrf_rejected` by new write (7), carried from 5881ed0 | `csrf.test.ts` table | C80 | - |
| new error codes (3), carried from 5881ed0 | `photos.service.ts`, `students.controller.ts` | `no_pending_photo` C63 · `pending_photo_exists` C58 · `email_in_use` C55 | - |
| `pendingPhoto` fields at the API (4), carried from cf26676 | `pendingPhotoSchema`, `pendingOf` | `id` C60 · `version`, `createdAt` C57 · `url` C60 (ficha) and C65 (perfil), `apps/api/test/portal-photo.test.ts:182`, `:292`, F1 confirms | - |
| admin without 2FA on new routes (10), carried from cf26676 | `listRoutes`, `PUBLIC` in `enrollment.test.ts` | `approve`, `reject` and the five `/api/me/*` C79 · the three public routes C79 at `:75`-`:83`, F7 confirms | - |
| new routes in OpenAPI (10), carried from 5881ed0 | `listRoutes` | C77 | - |
| public routes (13), carried from 5881ed0 | `access.test.ts` | C78 | - |
| refused tokens (10), verified at 1e19a01 + working tree | `portal.service.ts:202`, `students.service.ts:278`, schema at `packages/contracts/src/portal.ts:23` | absent, empty C30 · `abc`, unknown C30 (`!found`) · used C30, C19 · expired C30 · ficha inactivated C33, closed token `apps/api/test/portal-password.test.ts:160`, open token by SQL `:193`, F12 confirms · ficha anonymized C33, token deleted `:170`, open token by SQL `:193`, F12+F12b confirms · `reset` issued before inactivation, ficha reactivated C93, `apps/api/test/portal-cutoff.test.ts:145`, F6c confirms · `first_access` issued before inactivation, ficha reactivated C93, `:162`, F6b confirms | - |
| effects of `inactivate` in one transaction (4), new here, verified at 1e19a01 + working tree | `plan.md:45`, `students.service.ts:273`-`:278` | ficha, user, sessions C69, `apps/api/test/portal-cutoff.test.ts:52`-`:54` · tokens C69, `:55`, `:81`, F13 confirms | - |
| ficha states refused at consume (2 admitted), new here, verified at 1e19a01 + working tree | `students_status_valid`, `students_anonymized_clean`, `pg_constraint` in the migrated database | `inactive` C33 `apps/api/test/portal-password.test.ts:193`, F12 confirms · `inactive` and anonymized C33 `:193`, F12+F12b confirms. The other two pairs with `anonymized_at` set are refused by the database | - |
| first access situations (13), refusals (9), uniform response (10), carried from 5881ed0 | `firstAccessDecision` | C89, C20, C21 | - |
| `portal` states (4) and edges (2), carried from 5881ed0 | `portalState` | C26, C90 | - |
| limits (4 keys), window (2 edges), carried from 5881ed0 | `PORTAL_LIMITS` | C23, C40, C88 | - |
| files refused by the pipeline (9), carried from cf26676 | `photos-upload.test.ts` | C59, with statuses `413`, `415`, `422` | - |
| readings of the current photo (3), carried from 5881ed0 | `photos.service.ts:376` `is_current` filter | list, ficha, check-in C60 | - |
| ficha transitions touching the user (4), carried from cf26676 | `students.service.ts:262` | C69, C70, C71, C73 | - |
| tables cleared on anonymization (5), carried from 5881ed0 | `privacy.service.ts`, `clearStudentUser` | C74 | - |
| ficha elements of the pending review (2), carried from cf26676 | AC 51 | pending photo, buttons and the current photo beside it C67, F9 confirms | - |
| screens in the motion baseline (22 paths), carried from cf26676 | `motion-baseline/1440.json`, `390.json` | C86 for all 22; `/login` is no longer claimed | - |
| startup config: `MailService` (2 assemblies), carried from 5881ed0 | `apps/api/src/app.module.ts:169`, `:186`; `tests/stack/compose.test.ts:1704` | tests C17 · stack C92 | - |
| startup config: `PhotoPurge` (2 assemblies), carried from 5881ed0 | `apps/api/src/app.module.ts:128`; `apps/api/test/photos-purge.test.ts:167` | C62, C64 | - |

**Is ten still right?** As a count of the situations `checks.md:399` names, yes, and every one has a proof asserting the
`422`. But the two members "ficha inativada" and "ficha anonimizada" now each hold two different situations: the token
closed by the route (`!usable`, `!found`) and the token left open by SQL (the `inactive` clause). Split by what the code
does, the row is 12. Nothing is unproven either way; the count just reads smaller than what C33 now proves. Reported below.

**Which clause decides each refusal, recomputed.** `consume` has four refusing conditions at `portal.service.ts:202`, and the
schema at `packages/contracts/src/portal.ts:23` adds two before them. Absent and empty stop at the schema; `abc` and unknown at
`!found`; used and expired at `!usable`; the two members of C93 at `!usable`. A's inactivated token stops at `!usable`, because
`inactivate` closed it; A's anonymized one at `!found`, because anonymization deleted it. B's inactive case stops at the `inactive`
clause, and F12 proves it. B's anonymized case stops at that same clause, and no state reaches the fourth condition as the first
true one. That is F12b.

**Sweep of `checks.md`.** The inconsistencies of round 4 are closed: `:443` now states its exception for the two links of C93, and
`:488` names F12 as a survivor of round 3. C69 at `:280` now says the closing rolls back, so `plan.md:45` has its claim. `:8` says
93 and the file holds 93. Still inconsistent, reported and not fixed:

- `:160`, "as cláusulas do consumo são provadas à parte": see C33. The word that fits is the states, not the clauses. `:488` records
  the limit, so the artifact is not hiding it, but the check itself overclaims by one clause.
- `:399` and `:447`, ten: see above. The same count under `Evidence`, which is now said to come from the plan except for the C93
  links, while the row hides the SQL situations too.
- `:488`, "a prova da ficha anonimizada mata a retirada das duas cláusulas juntas": true of the case, shown by my reversed run, and
  not what the shipped test does. In the shipped order the joint fault dies on the `inactive` case at `:193`, and the anonymized case
  is never reached. "A prova" kills it; "da ficha anonimizada" is the part the run does not show.
- `:373`, 204 lists C29 and C35 and not C69, whose second Proof now consumes with `204`. It adds a proof to a proven member.

`Swept` rows resolving to existing, carried from 5881ed0: the global guard is at `apps/api/src/app.module.ts:202` (`APP_GUARD`,
`AccessGuard`), and the origin check at `apps/api/src/csrf.ts:25`. Both are there.

Level, carried from cf26676, plus C33, C69 and C93 verified here, all their proofs: every claim naming a status, route or response
shape has a proof crossing HTTP.

## Test policy rows

The two rows of this feature, plus the rows inherited from `pre-cadastro` and earlier. The third row is re-judged at 1e19a01 +
working tree, the one unmet in round 4. The others are carried: the seventh from cf26676, the rest from 5881ed0.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Eligibility with many conditions | `portal.service.ts` `firstAccessDecision` | service table C89 · boundary C20, C21 | yes |
| State derived from two tables | `portal.service.ts` `portalState` | pure C90 · boundary C26 | yes |
| Route that decides, over HTTP, with role cut and trail | `portal.controller.ts`, `me.controller.ts`, `photos.controller.ts`, `students.controller.ts`, `students.service.ts` `inactivate` | C16 to C83, C93 | yes - see the note under this table |
| Database constraint | `0013_portal.sql` | C1 to C5 | yes |
| Count in a window | `lead-throttle.ts` | module C88 · boundary C23, C40; the race runs on the shared statement at `apps/api/test/leads-throttle.test.ts:78` | yes |
| Side effect after commit | `portal.service.ts` `deliver` | capture C17, C18, C38; `apps/api/src/mail` is not in the diff | yes |
| Screen against the `FakeApi` | `minha-conta`, public pages, ficha | C27, C28, C36, C37, C42, C47 to C50, C56, C67, C68 | yes |
| Stack through `psql` | `tests/stack/compose.test.ts` | C92 | yes |

**Note on the third row.** The half round 4 left open is met: the place of `students.service.ts:278` in the transaction is asserted at
`apps/api/test/portal-cutoff.test.ts:55` and `:81`, and F13 dies at both. The consume decision behind `portal.controller.ts` has its
`inactive` clause proven, F12 dies at `apps/api/test/portal-password.test.ts:193`; its `anonymized` clause changes no response in any
state the database admits, which is the judgment on F12b under `Faults injected`. This text sits here and not in the cell because the
gate greps the cell for the bare word "no" and read this sentence as an unmet row on its first run; the sentence is unchanged.

## Faults injected

Verified at 1e19a01 + the working-tree `portal-cutoff.test.ts` and `portal-password.test.ts`, in a `git worktree add <temp> HEAD`
with both files copied in, one fault at a time and the source restored by `git checkout -- apps/api/src` between them. `git status
--porcelain` of the real tree, before and after, was the same four lines (`checks.md`, `verification.md`, both test files, all ` M`),
compared by `diff`. No `git stash`. The worktree was removed: the directory is gone and `git worktree list` shows only the real tree.
This round ran eight mutations, past the cap of five in `verify.md`: the brief named seven, and F14 is mine, because the new assertion
at `portal-password.test.ts:195` had never been made to fail.

Green baseline first. `pnpm install --frozen-lockfile --offline` worked. In the scratch only, the `globalSetup` at
`test/support/build.ts` was a no-op, because the narrow set does not use `dist`, and `vitest` ran through `node`. Baseline:
`portal-cutoff`, `portal-password` and `privacy-anonymize` 38 of 38, exit 0, so each kill below is the named assertion failing and not
a process error. The whole API suite did not run under any mutant this round.

F6d, F10 and F11 are `carried from 1e19a01 + round 4 working tree`, with line numbers translated to the current file; F1, F7, F8 and F9
are `carried from cf26676`; F2 to F5 of round 1 `carried from 5881ed0`. Their code did not change, and the diff only adds assertions
near them.

| Mutation | Location | Killed |
| --- | --- | --- |
| F13 (re-injected): the closing runs on `this.db`, outside the transaction | `apps/api/src/students/students.service.ts:278` | yes - `portal-cutoff.test.ts:55`, tokens differ after the `500`, and `:81`, `expected 422 to be 204`; the survivor of round 4 |
| F12 (re-injected): `found.studentStatus === 'inactive'` removed from `consume` | `apps/api/src/portal/portal.service.ts:202` | yes - `portal-password.test.ts:193`, `expected 204 to be 422`; not killed in rounds 3 and 4 |
| F12+F12b (new): both clauses removed | `apps/api/src/portal/portal.service.ts:202` | yes - `portal-password.test.ts:193`, on the `inactive` case in the shipped order and on the anonymized case with the loop reversed |
| F6 (re-injected): open tokens not closed in `inactivate` | `apps/api/src/students/students.service.ts:278` | yes - `portal-cutoff.test.ts:137` and `:157` |
| F6b (re-injected): closes `reset` only | `apps/api/src/students/students.service.ts:278` | yes - `portal-cutoff.test.ts:157`, `expected [ [ 'first_access', false ] ] to deeply equal [ [ 'first_access', true ] ]` |
| F6c (re-injected): closes `first_access` only | `apps/api/src/students/students.service.ts:278` | yes - `portal-cutoff.test.ts:137` |
| F14 (new, mine): a refused `consume` burns the token, commits, and still answers `422` | `apps/api/src/portal/portal.service.ts:202` | yes - `portal-password.test.ts:195`, the credentials differ; the status at `:193` passes under it |
| F6d: closing moved from `inactivate` to the reactivation, carried | `students.service.ts:278` and `:247`, `update` | yes - `portal-cutoff.test.ts:137` and `:157`; the `422` alone would not see it |
| F10: reactivation clears `used_at`, carried | `apps/api/src/students/students.service.ts:247`, `update` | yes - `portal-cutoff.test.ts:145` and `:162`, `expected 204 to be 422` |
| F11: reactivation sets `users.active` true, carried | `apps/api/src/students/students.service.ts:247`, `update` | yes - `portal-cutoff.test.ts:147`, `:164`, and C73 at `:174` |
| F1: `url` dropped from `pendingOf`, carried from cf26676 | `apps/api/src/photos/photos.service.ts:345` | yes - C60 at `portal-photo.test.ts:182`, C65 at `:292` |
| F7: public portal routes pass through the session and enrollment check when a cookie comes, carried from cf26676 | `apps/api/src/access.ts` `canActivate` | yes - C79, `POST /api/portal/first-access: expected 403 to be 422` |
| F8: invalid `variant` swallowed by `.catch(undefined)`, carried from cf26676 | `packages/contracts/src/photos.ts:10` | yes - C65, `expected 200 to be 422` |
| F9: photo row `flex-wrap` changed to `flex-col`, carried from cf26676 | `apps/web/src/app/students/[id]/page.tsx:136` | yes - C67 at `students.spec.ts:841`, `Received: 309`, `Expected: >= 429` |

**Run and not in the table above, because under step 3 of `verify.md` it is not a fault:**

| Mutation | Location | Outcome | Classification |
| --- | --- | --- | --- |
| F12b: `found.anonymized` removed from `consume` | `apps/api/src/portal/portal.service.ts:202` | **not killed**: 38 of 38 at the narrow set, 8 of 8 in `portal-password` with the loop reversed. No test run went red | not a behaviour-level fault: same response as the unmutated code in every state the database admits, evidence below |

**On that second table, stated plainly.** `verify.md` asks for a "behaviour-level fault", and a surviving one is a finding. F12b
changes no behaviour I can reach, so I do not count it as either a kill or a survivor. The placement has a consequence: the gate reads
columns named `Killed`, so it does not read this row, and its exit 0 says nothing about F12b. I did not separate the row to obtain that
exit; a `no` in the first table would assert a fault that I conclude does not exist, and `verify.md` would then require a FAIL no test
could ever clear while the clause is in the code. If you read the classification differently, this row is the one to overturn, and
the verdict goes with it.

**F12b, judged adversarially.** The author's claim is that `students_anonymized_clean` (`packages/database/src/schema.ts:180`) makes
`found.anonymized` unreachable as the deciding clause. Tested as a claim to break, in a temporary test in the scratch, deleted with
it, run four times against unmutated, F12, F12b and F12+F12b:

- **Logic.** Under the mutant `consume` differs from the original only where `anonymized` is true and `status` is not `inactive`. So the
  whole question is whether a row with that pair can exist, and whether a read can return that pair.
- **The constraint is real in the migrated database, not just in `schema.ts`.** PostgreSQL 18.6, `pg_constraint`: `convalidated` true,
  `conenforced` true, `condeferrable` false, `conislocal` true. No trigger on `students`, no partition or inheritance. It comes from
  `packages/database/migrations/0011_privacy.sql:30` with no `NOT VALID`; `NOT VALID`, `NOT ENFORCED` or `DISABLE` appear in no migration,
  and the only `DROP CONSTRAINT` is `users_role_valid` in `0013_portal.sql:13`.
- **A false disjunct cannot be dodged by NULL.** A CHECK passes on NULL, so a NULL in another conjunct could matter, but `status =
  'inactive'` false makes the conjunction false whatever the others are, and `status` is `NOT NULL` (`23502` when tried).
- **Direct attempts, as a superuser, all refused with `23514` on `students_anonymized_clean`:** `UPDATE` of an anonymized row to `active`, to
  `suspended`, to `suspended` keeping `inactivated_at`; `INSERT` as `active` and as `suspended`; `status = 'INACTIVE'`; under `session_replication_role
  = replica`; under `set constraints all deferred`; `COPY ... FROM PROGRAM`; a writable CTE. `count(*)` of anonymized rows not `inactive`: 0.
- **Races on the row, two real connections.** Reactivation open, then an anonymization that does not touch `status` waits on it: on commit
  it is refused `23514`, because the CHECK runs on the tuple after re-evaluation. Anonymization open, then an unqualified reactivation waits:
  refused `23514`. A `repeatable read` transaction with an old snapshot sees the old consistent row (`active`, not anonymized), not a mix.
- **The read inside `consume`.** Both values come from one tuple in one statement: one `inner join` on `students`, `users.student_id` unique,
  `students` not in the `FOR UPDATE OF`, so a re-check after a lock wait reuses the same row version. A CHECK binds each tuple version, so that
  pair exists in no version. Instrumented, not only reasoned: `consume` counted what it read, with a writer flipping one ficha between
  active and anonymized in single statements while 240 consumes of an expired token ran. Per run: 530 to 590 flips, 105 to 134 reads as anonymized,
  110 to 139 as not, **0 reads of anonymized and not `inactive`**. Both states were really seen, so the sample means something; the tuple argument
  carries the claim, the sample only fails to contradict it.
- **Truth table at the HTTP boundary**, consume of an open token:

| Ficha | Unmutated | F12 | F12b | F12+F12b |
| --- | --- | --- | --- | --- |
| `active`, not anonymized | 204 | 204 | 204 | 204 |
| `suspended`, not anonymized | 204 | 204 | 204 | 204 |
| `inactive`, not anonymized | 422 | 204 | 422 | 204 |
| `inactive`, anonymized | 422 | 422 | 422 | 204 |
| `active` or `suspended`, anonymized | database refuses the state | | | |

F12b's column equals the unmutated one on every admitted row. That is the conclusion: the mutation is equivalent under the schema. The
reservation I keep: this holds while the constraint exists. A DDL that drops or weakens it changes the schema, not a state of this one,
and then the clause becomes live again; that is the only case for keeping it. It also means the clause is defence for a different
database, and `found.anonymized` is dead code today.

**F14 is a fault of mine.** It separates the refusal from the rollback: the transaction marks the token used and commits, and `422` is
thrown after it. The status assertion passes and only `:195` sees it, which confirms the new comparison is not decoration.

## Gate

`py -3 C:/Users/Admin/.claude/skills/tlc-spec-lean/scripts/validate_verification.py portal-aluno --root C:/Users/Admin/projetos/academia-bairro` - exit 0, 0 errors and 0 warnings. That exit does not read F12b, by the placement explained under `Faults injected`. Proofs: 106 passed, 0 failed (contracts 3, db 5, repo 1, api 76, web 20, stack 1); whole files of C26, C76, C91, `portal-cutoff` and `portal-password`: 72 passed, 0 failed.

## Findings that fail this round

None. Round 4's one finding is closed: F13 dies at `apps/api/test/portal-cutoff.test.ts:55` and `:81`.

## Decision for the user (does not fail this round by itself)

- **F12b: accept the classification, and what to do with the clause.** `found.anonymized` at `apps/api/src/portal/portal.service.ts:202`
  is not killed and decides nothing in any state this schema admits. Keeping it is harmless defence against a future change to the
  constraint; removing it is a production change, out of this round, and would make the question disappear. Either way, the row under
  `Faults injected` is the judgment to overturn if you want this treated as a survivor, and then this PASS is a FAIL.

## Open findings (do not change the verdict)

New in this round:

- **Precision gap, C33:** `checks.md:160`, "as cláusulas do consumo são provadas à parte", overclaims by one clause. Listed under Coverage.
- **`checks.md:399` and `:447`:** ten hides two situations of C33. Listed under Coverage.
- **`checks.md:488`:** attributes the joint kill to the anonymized case, which the shipped loop never reaches. Listed under Coverage.
- **The loop at `apps/api/test/portal-password.test.ts:187` stops at the first case that fails,** so the anonymized case never shows
  failing in the shipped order. One test per case, or `expect.soft`, would show both. Not a gap in the claim: reversed, it dies.
- **Consume on a `suspended` ficha has no assertion.** My truth table reads `204`, and a first access is allowed for `suspended` (C16), so a
  link can be issued there. No check or AC states the consume outcome. A mutation of the clause to `status !== 'active'` was not injected;
  from the code, I expect it to survive. No artifact claims this, so it is a note and not a coverage gap.

Re-read against the current tree:

- **CLOSED: F13 and "the token closing is outside any rollback assertion".** See above.
- **CLOSED: F12.** Killed at `portal-password.test.ts:193`. The state is still unreachable through the API, per round 4; a SQL state proves it.
- **CLOSED: `checks.md:441` and `:486` of round 4.** Now `:443` and `:488`, both fixed.
- **CLOSED, by the new Proof: C33 passes for a second reason.** `open_token_on_ficha_inactive_or_anonymized_by_sql_422` reaches the clause.
- **Possible deadlock, still open, read from the code, not observed:** `consume` locks token then user
  (`apps/api/src/portal/portal.service.ts:201`), `inactivate` updates user then token
  (`apps/api/src/students/students.service.ts:274`, `:278`). A true interleaving could abort one with a `500`. No state is left wrong. I did
  not try to produce it this round, and nothing in the diff bears on it. Out of scope for a fix.
- **`STATE.md` and `ROADMAP.md`, still true:** both still record the feature as verified at round 2 (`.specs/STATE.md:183`,
  `.specs/ROADMAP.md:28`). Out of this round's edit scope.
- **Precision gap, C76, still true (carried from 5881ed0):** `checks.md:302` says `user_linked`; the HTTP code is
  `staff_user_linked` (`apps/api/src/privacy/privacy.controller.ts:76`). `user_linked` is only the internal outcome.
- **`DELETE /api/students/:id/photo` also deletes a pending photo, still true:** `checks.md:487` records it as deliberate.
  It remains without a check, and `plan.md:62` says version listings ignore a pending one. Code unchanged.
- **`pendingPhoto.url` to all four profiles, still true:** `checks.md:487` records it as AD-033 behaviour, and the screen
  shows it only to `admin` and `reception`. Code unchanged.
- **C26, C45, C59, C60, C86, C91, still true:** the rewritten text matches the tests. The approvals are recorded in
  `checks.md`; this report cannot confirm them independently. The same goes for the user's request and authorizations that
  `checks.md:488` records for C93, C69, C33 and rounds 4 and 5.
- **C67's proof runs at the desktop width, still true.** Beside-ness below the wrap width of `flex-wrap` is not claimed by
  the check and was not measured.
