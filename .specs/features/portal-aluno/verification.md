# Portal do aluno verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: a9ebfbf..e7dd251
**Round**: 12 - scoped
**Verifier**: independent sub-agent (author != verifier)

FAIL, for one reason in the feature and one finding beside it.

1. **Surviving fault H1.** In `apps/api/src/users/active-admins.ts:16`, `for('key share')` changed to `for('update')` survives every test of `apps/api/test/portal-cutoff.test.ts`, 47 of 47, the five new `*_ahead_of_user_patch_*` included. It is not equivalent. A scratch probe on that mutant gives `201`, `500`, `deadlocks` +1 for an admin's `POST /api/students/:id/enrollments` queued on the student row ahead of an admin's `DELETE /api/students/:id`. The same probe on HEAD gives `201`, `204`, 0. No proof pins the upper bound of the new lock, the way `first_access_against_consume_202_422_without_deadlock` pins the bound of `consume`'s. H2 (`for('no key update')`) also survives the whole file. I found no wrong outcome for it, so it is reported but does not decide the verdict.
2. **New finding, outside the five routes: `PUT /api/staff/:id/user` deadlocks against `PATCH /api/users/:id`.** `StaffService.link` (`apps/api/src/staff/staff.service.ts:157`) sets `staff.user_id`. The foreign key takes `FOR KEY SHARE` on the target user, and the audit line at `:158` then asks `FOR KEY SHARE` on the admin author, while `update` holds the admins `FOR UPDATE` and waits for that target (`apps/api/src/users/users.service.ts:111`-`:117`). Probe on HEAD, unmutated: the link `204`, the `PATCH` **`500`**, `deadlocks` **+1**. This is the same cycle e7dd251 closes for five routes. The lock is a foreign-key check, not a write in `users`, so the C94 sentence "toda escrita em `users`" is not literally contradicted. The route predates the feature and is `admin` only.

Everything else holds. All 145 Proof lines pass at e7dd251 (146 tests, 0 failed). All five `lockActiveAdmins` removals die, each on its own new test, with `expected 500`. M1, M3 and M10 still die under the new lock order.

**Authorization of the round.** `checks.md:545` records round 12 as authorized by the user on 2026-10-31, with the production change authorized. This report cannot confirm that independently. Nothing outside the six files in `git diff --stat 7946cc4..HEAD` changed, and `.specs/features/portal-aluno/checks.md` changed only by the C94 sentence, 5 Proof lines, the Coverage row at `:449` and the Handoff line at `:545`. All of that was read.

**Handoff read against the code.** `checks.md:545` is accurate on cause, fix and the five tests. One wording slip: it says "Os quatro testes novos ... falharam antes", while five exist. Its own parenthesis explains that the fifth, the phone, was added later. I did not reproduce "failed before" on 7946cc4. Removing the call per route (K1 to K5) reproduces it for each test. Its claim that M3, M10 and M1 stay dead is confirmed.

Scope: the diff `7946cc4..HEAD` plus every verdict that was not PASS in round 11. There were none, so the diff and the requested faults are the scope. Proofs were rerun in full at e7dd251. Each row below says whether it was verified this round or carried, and from where.

## Binding sources

Not run: the profile is `standard`, the plan marks no source as binding, and e7dd251 touched no interface (no route, status or body changed). Carried from 5881ed0.

## Checks

Proofs verified at e7dd251, this round, on the real tree. There was one invocation per target, with the package's own binary and a JSON reporter, built from every `Proof:` line of `checks.md` (145): contracts 3, database 5, repo 1, api 115, web 20, stack 1. Every run exited 0, with 146 tests passed and 0 failed (api 116, web 20, contracts 3, database 5, repo 1, stack 1). The JSON of each run was joined against every selector. 144 Proof lines resolved to exactly one passing test, and C76 matches two, both passing, as recorded. C92 ran with Docker 29.9.2. `pnpm verify` was not used (AD-118). The api batch took 334 s because of the 11 s `STATS_DELAY` of each queued test.

Citations: e7dd251 touched one test file, `apps/api/test/portal-cutoff.test.ts`, with a single hunk inserted at `:904` (`git diff 7946cc4..HEAD`). Every citation of that file above `:904` is the same line as in round 11. C73's test moved by +62 and was re-cited, and C94's five new proofs were located this round. Citations of every other file are carried from round 11, since those files did not change.

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
| C29 | consume `204` and its effects | api batch, exit 0; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:78`-`:80`; `:82`-`:84`; `:85` | PASS |
| C30 | six invalid tokens, one valid at the edge | api batch, exit 0; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:110`-`:112`; `:117` | PASS |
| C31 | password bounds | api batch, exit 0; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:126`-`:128`; `:130`; `:132` | PASS |
| C32 | concurrent consume | api batch, exit 0; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:143` - `toEqual([204, 422])`; `:148`-`:150` | PASS |
| C33 | token closed by the route, open on a ficha set by SQL, and `suspended` not refused (rewritten) | api batch, exit 0; three Proofs, each one test; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:160`-`:163`; `:170`-`:172`; `:188` - `expect((await tokenRows(stack, userId)).map((row) => row.used_at)).toEqual([null])`, `:193` - `expect(refused.status).toBe(422)`, `:194`, `:195` - `expect(await credentials(userId)).toEqual(before)`; `:202` - `expect((await postConsume(stack.client(), { token, password: PASSWORD })).status).toBe(204)`, `:205`, `:210`, `:212`; F12b stays accepted | PASS |
| C34 | login after set, `role: student` | api batch, exit 0; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:221`; `:225`-`:226` | PASS |
| C35 | reset token replaces password | api batch, exit 0; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:238`-`:241` | PASS |
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
| C69 | inactivation cuts in one transaction, tokens included, and a refused one leaves the link usable (rewritten) | api batch, exit 0; two Proofs, each one test; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-cutoff.test.ts:66`-`:69`; `:70` - `expect(await tokenRows(stack, failing.user.id)).toEqual(tokens)`; `:74`; `:80`; `:83`; `:95`; `:96` - `expect((await postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-4' })).status).toBe(204)` | PASS |
| C70 | suspension keeps user | api batch, exit 0; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-cutoff.test.ts:106`-`:111`; `:112` | PASS |
| C71 | refused `PATCH` inactive | api batch, exit 0; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-cutoff.test.ts:122`-`:125` | PASS |
| C72 | disabled login like inactive staff | api batch, exit 0; citations carried from round 11, lines unchanged since 7946cc4 | `apps/api/test/portal-cutoff.test.ts:136`; `:141`-`:143` | PASS |
| C73 | reactivation keeps disabled | api batch, exit 0; citations refreshed this round (the test moved +62 lines with the insertion at `:904`) | `apps/api/test/portal-cutoff.test.ts:976` - `expect(await userActive(user.id)).toBe(false)`; `:978`; `:982`-`:983`; `:989` | PASS |
| C74 | anonymization clears user | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/privacy-anonymize.test.ts:278`-`:281` | PASS |
| C75 | anonymization failure keeps user | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/privacy-anonymize.test.ts:302`-`:303`; `:308`-`:309` | PASS |
| C76 | staff anonymization still `409` | api batch, exit 0; selector matched two tests, both passed; whole file passed; evidence carried from 5881ed0 | `apps/api/test/staff-privacy.test.ts:201`-`:202` code is `staff_user_linked`; `:359`-`:360` | PASS |
| C93 | open link of each purpose: `DELETE` fills `used_at`; after reactivation consume `422` in `token`, `users.active` false | api batch, exit 0; citations carried from round 11, lines unchanged since 7946cc4; each selector matched one test | `apps/api/test/portal-cutoff.test.ts:152`-`:155` - `expect(await tokensClosed(user.id)).toEqual([['first_access', true], ['reset', true]])`, `:160`-`:162`; `:172` - `expect(await tokensClosed(user!.id)).toEqual([['first_access', true]])`, `:177`-`:179` | PASS |
| C94 | `consume` queued against every write contending for the user, both orders where the claim says so, the 2FA routes, the challenge in `verifications`, login and `verify` in flight, the own `PUT` in three interleavings and the administrator's `PUT` in four, and (round 12) five routes queued ahead of `PATCH /api/users/:id` on the same user: no deadlock on the queued cases, no `500` on the `PATCH`, no session or challenge left, the link password stands | api batch, exit 0; thirty-nine Proofs, one test each; the thirty-four old ones carried from round 11 (every cited line is above the only hunk, `:904`), the five new verified at e7dd251 | `apps/api/test/portal-cutoff.test.ts:223`-`:228`, `:244`-`:249`, `:265`-`:270`, `:287`-`:293`, `:310`-`:315`, `:362`-`:365`, `:373`-`:376`, `:384`-`:387`, `:395`-`:398`, `:410`-`:415`, `:424`-`:429`, `:441`-`:445`, `:455`-`:459`, `:488`-`:494`, `:502`-`:507`, `:515`-`:518`, `:526`-`:529`, `:558`-`:563`, `:645`-`:648`, `:661`-`:664`, `:677`-`:682`, `:699`-`:702`, `:720`-`:724`, `:741`-`:744`, `:761`-`:765`, `:804`-`:807`, `:815`-`:819`, `:827`-`:830`, `:838`-`:841`, `:874`-`:878`, `:886`-`:889`, `:902`-`:904`; new: `:915`-`:918`, `:927`-`:929`, `:939`-`:942`, `:951`-`:954`, `:964`-`:966`; `:860`, `:864`-`:866`; `:334` - `expect((await login(user.email, user.password)).status).toBe(401)`; `:782` - `expect((await login(user.email, replacement)).status).toBe(401)`; sentences below | PASS |
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

### Sentences of C94 added in round 12

Verified at e7dd251. Each assertion is a literal at the cited line. The queue helper `queuedOn` (`portal-cutoff.test.ts:192`-`:204`) proves "ambos em `Lock`" at `:197` and `:199`, and reads `deadlocks` after `STATS_DELAY`. The sentences of earlier rounds are carried from round 11, with lines unchanged.

| Sentence | Evidence | Judgment |
| --- | --- | --- |
| `DELETE /api/students/:id` ahead of `PATCH /api/users/:id`, student with login: `204`, `404`, never `500`, `deadlocks` | `portal-cutoff.test.ts:915` - `expect(first.status).toBe(204)`, `:916` - `expect(second.status).toBe(404)`, `:917` user inactive, `:918` - `expect(raised).toBe(0)` | holds; `:916` failed under K4, `expected 500 to be 404` |
| `POST /api/students/:id/anonymization` ahead of the `PATCH`: `204`, `404`, `deadlocks` | `:964`, `:965`, `:966`; the `DELETE` before it, `:960` | holds; `:965` failed under K5 |
| `PATCH /api/students/:id` of the e-mail ahead of the `PATCH`: `200`, `404`, user e-mail follows, `deadlocks` | `:939`, `:940`, `:941`, `:942` | holds; `:940` failed under K3 |
| `PATCH /api/students/:id` of the phone, with login, ahead of the `PATCH`: `200`, `404`, phone changed, `deadlocks` | `:951`, `:952`, `:953`, `:954` | holds; `:952` failed under K3. This route reaches the cycle without a new e-mail because `update` locks the linked user `FOR UPDATE` whatever the change (`students.service.ts:188`, read with `tr -d '\000'`) |
| `DELETE /api/users/:id/two-factor` on a staff user ahead of the `PATCH`: `204`, `200`, `deadlocks` | `:927`, `:928`, `:929` | holds; `:928` failed under K2, `expected 500 to be 200` |
| `PUT /api/users/:id/password` ahead of the `PATCH`: `204`, `200`, `deadlocks` (round 10, refactored onto the helper) | `:902`, `:903`, `:904` | holds; `:903` failed under K1, `expected 500 to be 200` |
| "cada rota pega os administradores ativos antes do alvo" | `apps/api/src/users/users.service.ts:153`, `:190`; `apps/api/src/students/students.service.ts:171`, `:267`; `apps/api/src/privacy/privacy.service.ts:185`, each the first statement of its transaction | holds by reading. The lock **strength** is not proven: H1 survives |

## Coverage

Recomputed from `apps/api/src` at e7dd251 for the rows the fix touched, and from PostgreSQL's row-lock conflict table for the lock rows. `FOR KEY SHARE` conflicts only with `FOR UPDATE`. `FOR NO KEY UPDATE` conflicts with `FOR SHARE`, `FOR NO KEY UPDATE` and `FOR UPDATE`. A foreign-key insert or update takes `FOR KEY SHARE` on the referenced row. `apps/api/src/students/students.service.ts` was read with `tr -d '\000'`, unedited.

Facts, verified at e7dd251:

- **The cycle.** `UsersService.update` locks the active admins `FOR UPDATE` by `id` (`users.service.ts:111`-`:116`) and then the target `FOR UPDATE` (`:117`). Every `audit.record` with an author inserts `audit_logs.user_id`, a foreign key to `users` (`packages/database/src/schema.ts:133`), so it takes `FOR KEY SHARE` on the author. A transaction authored by an admin that holds **any** lock on a `users` row, which `FOR UPDATE` always conflicts with, before its audit closes the cycle with a `PATCH` of that row.
- **Every lock on a `users` row in `apps/api/src`, by transaction:** `users.service.ts:117` (the `PATCH` itself), `:154` and `:157` (reset), `:176` (own, author is the row), `:191`-`:195` (2FA reset), `:218` (check, no audit); `students.service.ts:188`, `:248` (update), `:277` (inactivate); `privacy.service.ts:229`, `:232` (anonymization; the retention job passes `NO_ACTOR`, `privacy-retention.ts:48`, so it has no author lock); `portal.service.ts:133`, `:138` (first access), `:165` (reset), `:199`, `:225` (consume), all three audited with `userId: null`. Foreign keys to `users` (`schema.ts:30`, `:133`, `:293`, `:434`): `sessions`, `accounts`, `two_factors` and `password_tokens` are only written by the routes above or with the author as the row; `check_ins.checked_in_by` is the author itself; **`staff.user_id`**, written by `StaffService.link` (`staff.service.ts:157`), is not the author, and the route is `admin` only (`staff.controller.ts:77`-`:78`). `unlink` sets it to `null`, which locks nothing. `auth.controller.ts:298`-`:299` records outside any transaction.
- **Writes after the fix:** the five routes of `checks.md:449` open with `lockActiveAdmins` (lines above), the same order as `update`. `changeOwnPassword` and `consume` need no admin lock, because their author is the row they hold or no one, as `checks.md:545` says. `PATCH /api/me/profile` runs `students.update` with the student as author and now also takes the admins in `key share`. That is harmless: by the table above, nothing else holds an admin row in a mode that conflicts with it except `update`, which takes the admins first.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| user writes against `PATCH /api/users/:id`, by route (`checks.md:449` says 6; recomputed 6), verified at e7dd251 | the lock list above | `PUT /api/users/:id/password` C94 `portal-cutoff.test.ts:903`, K1 confirms · `DELETE /api/students/:id` `:916`, K4 · anonymization `:965`, K5 · `PATCH /api/students/:id` e-mail `:940`, phone `:952`, K3 · `DELETE /api/users/:id/two-factor` `:928`, K2 | - |
| transactions authored by an admin that lock a `users` row before the audit, against `PATCH /api/users/:id` (recomputed 7: the six above plus the foreign key of `staff.user_id`), verified at e7dd251 | the lock list and the foreign keys above | the six as above · `PUT /api/staff/:id/user`: no proof, and a scratch probe on HEAD gives `PATCH` `500`, `deadlocks` +1 | `PUT /api/staff/:id/user` (`staff.service.ts:157`-`:158`) |
| strength of the active-admins lock (bounds 2), verified at e7dd251 | `apps/api/src/users/active-admins.ts:16`, the conflict table | not weaker than `key share`: the lock must exist, K1 to K5 · not stronger than `key share`: no proof; H1 (`for('update')`) survives all 47 tests of the file, and the probe shows an admin's enrollment against `DELETE /api/students/:id` giving `500` and `deadlocks` +1 under it | not stronger than `key share` |
| `POST /api/portal/first-access` statuses (3), carried from round 11; authority untouched by e7dd251 | `portal.controller.ts`, `portal.service.ts` | 202 C16, C94 `portal-cutoff.test.ts:265` · 422 C22 · 429 C23 | - |
| `POST /api/password-tokens/consume` statuses (2), carried from round 11; authority untouched by e7dd251 | `portal.service.ts:198`, `:215` | 204 C29, C33 `portal-password.test.ts:202`, C35, C69, C94 `portal-cutoff.test.ts:287`, `:363` · 422 C30, C31, C33, C93, C94 | - |
| `POST /api/password-reset` statuses (3), carried from round 11; authority untouched by e7dd251 | `portal.service.ts` | 202 C38, C94 · 422 C41 · 429 C40 | - |
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
| refused tokens (16), verified at e7dd251 (M1, M3, M10 rerun this round) | `portal.service.ts:198` `!owner`, `:215`, `students.service.ts:278`, `privacy.service.ts:236`, schema at `packages/contracts/src/portal.ts:23` | absent, empty, `abc`, unknown, used, expired C30 `apps/api/test/portal-password.test.ts:110` · ficha inactivated, token closed C33 `:160` · ficha inactivated, open by SQL C33 `:193` · anonymized, token deleted C33 `:170` · anonymized, open by SQL C33 `:193` · `reset` and `first_access` issued before inactivation, ficha reactivated C93 `apps/api/test/portal-cutoff.test.ts:160`, `:177` · closed by `DELETE` queued C94 `:224` · closed by reset queued C94 `:245` · closed by first access queued C94 `:266` · deleted by anonymization queued C94 `:311`, M8 confirms | - |
| writes and locks contending for the user row with `consume` (`checks.md:444` says 12; recomputed 12, 11 routes and 1 lock, the two `PUT` apart), carried from round 11; authority untouched by e7dd251 | every lock and write on `users` in `apps/api/src`, above | `DELETE /api/students/:id` C94 `portal-cutoff.test.ts:228` · reset C94 `:249` · first access, by `FOR KEY SHARE`, C94 `:270` · anonymization C94 `:315` · `PATCH /api/students/:id` C94 `:365`, `:376` · `PATCH /api/me/profile` C94 `:387`, `:398` · `DELETE /api/users/:id/two-factor` C94 `:415`, `:429` · `confirm` C94 `:507`, `:529` · `disable` C94 `:494`, `:518` · lock of `PATCH /api/users/:id` on a student C94 `:445`, `:459` · login, by the check, C94 `:700`, L confirms · `verify`, by the check, C94 `:762`, L confirms | - |
| routes that swap the session against `consume`, by order (4), carried from round 11; authority untouched by e7dd251 | `auth.controller.ts:254`, `:281`; `better-auth` `totp/index.mjs:210`, `plugins/two-factor/index.mjs:229` | `disable` behind C94 `portal-cutoff.test.ts:489`, D1 confirms · `disable` ahead C94 `:515` · `confirm` behind C94 `:503`, D2 confirms · `confirm` ahead C94 `:526` | - |
| routes that create a session or challenge outside a transaction, against `consume` (`checks.md:446` says 5; recomputed 7 with `disable` and `confirm`, which have the row above), carried from round 11; authority untouched by e7dd251 | session creators and `verifications` writes, above | `verify` after, TOTP and backup code C94 `portal-cutoff.test.ts:558` · `verify` in flight C94 `:677` · login in flight, no 2FA C94 `:645` · login in flight, 2FA C94 `:661` · `disable`, `confirm` C94 `:489`, `:503` | - |
| lock of the check: `consume` past its delete and not committed (`checks.md:447` says 4; recomputed 4 outcomes), carried from round 11; authority untouched by e7dd251 | callers of `dropSessionsIfPasswordChanged`, one lock line `users.service.ts:218`; fault L | login, session C94 `portal-cutoff.test.ts:700` · login with 2FA C94 `:742` · `verify` C94 `:762` · `disable`, second request C94 `:721`; all four fail under L, `expected 200 to be 401` or `204`. `confirm`: a second request does not depend on the lock, carried from round 9 | - |
| writes on the password against `consume` (`checks.md:448` says 7; recomputed 7), carried from round 11; authority untouched by e7dd251 | `accounts` writers, above; `consume` against itself is C32 | `PUT /api/auth/password` in flight `portal-cutoff.test.ts:805`, behind `:816`, ahead `:828` · `PUT /api/users/:id/password` in flight `:839`, during the hash `:864`, behind `:875`, ahead `:887`; A, A2, B, C, D, X1, X2, X3, X4 confirm | - |
| tokens refused by when the token went away, carried from round 11; authority untouched by e7dd251 | `portal.service.ts:198`, `:215` | before the request `!owner` C30, C33 · while `consume` waits on the user, closed C94, M2 confirms · deleted while it waits, `!found` C94 `portal-cutoff.test.ts:311`, M8 confirms | - |
| ficha states accepted at consume (2), carried from round 11; authority untouched by e7dd251 | `students_status_valid` at `packages/database/src/schema.ts:178`, `portal.service.ts:215` | `active` C29 `portal-password.test.ts:78` · `suspended` C33 `:202`, `:210`, M11 and M11b confirm | - |
| lock strength on `users` in `consume` (bounds 2), verified at e7dd251 (M1, M3, M10 rerun this round) | `portal.service.ts:199` | not stronger than `no key update` C94 `portal-cutoff.test.ts:265`, M3 confirms · not weaker C94 `:288`, M10 confirms; `for share` dies at C32, M10b carried | - |
| effects of `inactivate` in one transaction (4), carried from a9ebfbf + round 5 | `plan.md:45`, `students.service.ts:273`-`:278` | ficha, user, sessions C69, `apps/api/test/portal-cutoff.test.ts:67`-`:69` · tokens C69, `:70`, `:96`, F13 confirms | - |
| ficha states refused at consume (2 admitted), carried from a9ebfbf + round 5 | `students_status_valid`, `students_anonymized_clean`, `pg_constraint` in the migrated database | `inactive` C33 `apps/api/test/portal-password.test.ts:193`, F12 confirms · `inactive` and anonymized C33 `:193`, F12+F12b confirms. The other two pairs with `anonymized_at` set are refused by the database | - |
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

The rows below the three above are carried from round 11, as their labels say. The fix touched none of their authorities, except the two marked verified, whose faults were rerun. Line numbers into `users.service.ts` were refreshed where the fix moved them.

## Test policy rows

The third row classifies two touched files (`students.service.ts` `inactivate`, `users.service.ts` `resetPassword`) and was rejudged at e7dd251. The others are carried, with the sources round 11 gave them: first, second and sixth from a9ebfbf + round 10, seventh from cf26676, the rest from 5881ed0. No file they classify changed.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Eligibility with many conditions | `portal.service.ts` `firstAccessDecision` | service table C89 · boundary C20, C21 | yes - outside the diff |
| State derived from two tables | `portal.service.ts` `portalState` | pure C90 · boundary C26 | yes - outside the diff |
| Route that decides, over HTTP, with role cut and trail (`auth-rbac`: one case per line of the decision table) | `portal.controller.ts`, `me.controller.ts`, `photos.controller.ts`, `students.controller.ts`, `students.service.ts` `inactivate`, `consume`, `auth.controller.ts` routes, `users.controller.ts` `resetPassword`, `users.service.ts` `changeOwnPassword`, `resetPassword`, `dropSessionsIfPasswordChanged`, `dropPendingTwoFactor` | C16 to C83, C93, C94 | yes - each touched route has its status asserted across HTTP for the new interleaving (`portal-cutoff.test.ts:903`, `:916`, `:928`, `:940`, `:952`, `:965`), and the earlier lines hold. The lock strength gap is recorded under Coverage and Faults, not here: the row asks for one case per decision line, and the lock is not a decision |
| Database constraint | `0013_portal.sql` | C1 to C5 | yes |
| Count in a window | `lead-throttle.ts` | module C88 · boundary C23, C40 | yes |
| Side effect after commit | `portal.service.ts` `deliver` | capture C17, C18, C38 | yes |
| Screen against the `FakeApi` | `minha-conta`, public pages, ficha | C27, C28, C36, C37, C42, C47 to C50, C56, C67, C68 | yes |
| Stack through `psql` | `tests/stack/compose.test.ts` | C92 | yes |

`Swept`, `existing` rows: the global guard is still wired, `apps/api/src/app.module.ts:202` (`APP_GUARD`, `AccessGuard`); the origin check is carried from 5881ed0, untouched.

## Faults injected

Verified at e7dd251, in `git worktree add --detach %TEMP%\r12w HEAD`. The scratch had four directory junctions for `node_modules` (root, `apps/api`, `packages/database`, `packages/contracts`), and `globalSetup` was removed from its `vitest.config.ts` only. No `pnpm` command ran in the scratch. Tests ran with `node node_modules\vitest\vitest.mjs run ... -t "^(...)$"` from `apps\api`, with a JSON reporter. Each mutant was applied by script, run, and restored, then checked byte for byte against the saved original. `students.service.ts` was mutated as bytes, with its NULs kept. The green baseline came first: the 11 targeted tests passed 11 of 11. The five-fault cap of `verify.md` does not apply, because every fault here was requested.

Isolation: `git status --porcelain` of the real tree was empty before and after. At the end the scratch differed from HEAD only by `vitest.config.ts` and the probe file. The junctions were removed with `cmd /c rmdir` before `git worktree remove --force`, and `git worktree list` shows only the real tree. `Test-Path apps\api\node_modules\vitest` is true after cleanup. No `git stash`, `reset`, `checkout` or `commit` touched the real tree.

| Mutation | Location | Killed |
| --- | --- | --- |
| K1: `lockActiveAdmins` removed from `resetPassword` | `apps/api/src/users/users.service.ts:153` | yes - `portal-cutoff.test.ts:903`, `expected 500 to be 200` |
| K2: removed from `resetTwoFactor` | `apps/api/src/users/users.service.ts:190` | yes - `:928`, `expected 500 to be 200` |
| K3: removed from `StudentsService.update` | `apps/api/src/students/students.service.ts:171` | yes - `:940` and `:952`, `expected 500 to be 404` |
| K4: removed from `inactivate` | `apps/api/src/students/students.service.ts:267` | yes - `:916`, `expected 500 to be 404` |
| K5: removed from `anonymizeStudent` | `apps/api/src/privacy/privacy.service.ts:185` | yes - `:965`, `expected 500 to be 404` |
| M1: old order, token and user locked in one statement, as in a9ebfbf (owner lookup and user lock removed, `of: [passwordTokens, users]`) | `apps/api/src/portal/portal.service.ts:194`-`:199`, `:214` | yes - `:224`, `:245`, `:311` `expected 500 to be 422`; `:266` `expected 204 to be 422`; `:287` `expected 500 to be 204` |
| M3: `users` locked `for update` in `consume` | `apps/api/src/portal/portal.service.ts:199` | yes - `:265`, `expected 500 to be 202`; the other four pass |
| M10: `users` locked `for key share` in `consume` | `apps/api/src/portal/portal.service.ts:199` | yes - `:288`, `expected 500 to be 204`; the other four pass |
| H1: `for('key share')` -> `for('update')` in the helper; whole `portal-cutoff.test.ts`, then probe | `apps/api/src/users/active-admins.ts:16` | no - 47 of 47 pass. Not equivalent: probe `probe_enrollment_by_admin_ahead_of_inactivation` gives `201`, `500`, `deadlocks` +1 under H1, and `201`, `204`, 0 on HEAD |
| H2: `for('key share')` -> `for('no key update')` in the helper; whole file, then probe | `apps/api/src/users/active-admins.ts:16` | no - 47 of 47 pass, and the enrollment probe passes. By the conflict table, `no key update` adds waits only against `no key update`, `share` and `update` on admin rows, and nothing that holds such a lock waits on a student or target row. I found no wrong outcome, only serialization (two admin-authored student writes queue on the admins), so I count it as a survivor that does not decide the verdict alone |
| earlier faults (X1 to X8, A, A2, B to E, L, F, T1, T2, M8, M11 and those carried before): carried from round 11 | `users.service.ts`, `auth.controller.ts`, `portal.service.ts` | yes - carried. e7dd251 only replaced the inline admin lock of `resetPassword` with the helper, the same statement; E and X8 are subsumed by K1 |

**Probes, scratch only** (`apps/api/test/zz-probe-r12.test.ts`, never in the real tree, gone with the worktree). Both used the same holding statement and `Lock` waits as `queuedOn`, then read `deadlocks` after 11 s.

| Probe (order in the queue) | Code | Statuses | `deadlocks` raised |
| --- | --- | --- | --- |
| `PUT /api/staff/:id/user` by admin, linking a reception user, ahead of `PATCH /api/users/:id` of that user (held: the user row) | HEAD | `204`, **`500`** | **1** |
| same | H1, H2 (code paths untouched by them) | `204`, `500` | 1, 1 |
| `POST /api/students/:id/enrollments` by admin ahead of `DELETE /api/students/:id` by admin (held: the student row) | HEAD | `201`, `204` | 0 |
| same | H1 | `201`, **`500`** | **1** |
| same | H2 | `201`, `204` | 0 |

## Gate

`py -3 C:/Users/Admin/.claude/skills/tlc-spec-lean/scripts/validate_verification.py portal-aluno` - exit 1: 1 error, 0 warnings. The one error is "verdict is FAIL - route the ranked gaps back as fixes, then re-verify". The script raised nothing about the report's structure or consistency. Exit 0 would need a PASS, which these rows do not allow.

Proofs: 146 tests passed, 0 failed, from 145 Proof lines (contracts 3, database 5, repo 1, api 116, web 20, stack 1). The whole API suite was not rerun this round. The scratch runs cover `portal-cutoff.test.ts` in full under H1 and H2.

## Decisions for the user

- **H1:** add a proof that pins the upper bound of the admins lock. For example, an admin-authored write that holds the student row and then audits, queued ahead of `DELETE /api/students/:id`, like the probe, expecting `201`, `204`, `deadlocks` 0. Or accept the bound as unproven. Either way it is a test change, plus a round past the bound of three, which needs your authorization.
- **`PUT /api/staff/:id/user`:** `StaffService.link` needs `lockActiveAdmins` at the top of its transaction, the same fix as the five routes, and a proof. That is a production change outside this feature's surface, so it is your call whether it enters this feature or becomes its own.
- **Rounds past the bound.** Rounds 4 to 12 all went past the three of `verify.md`.

## Open findings (do not change the verdict on their own)

- **H2 survives**, as described above. A `no key update` admin lock would only serialize, with no wrong result found.
- **`checks.md:545` wording:** "Os quatro testes novos" while five were added; the same line explains the fifth.
- **`STATE.md` and `.specs/ROADMAP.md:28`:** may still be behind the feature's rounds. Carried from round 11, outside this round's edit scope.
- Carried from round 11, unchanged by e7dd251: `verify` after a `PUT` (`checks.md:543`); a `PUT` in flight when the ficha goes `inactive` changes a disabled user's password; the orphan attempts row; the precision gap of C94's login with 2FA (`portal-cutoff.test.ts:663`, `:744`); the orphan session row if `record` throws in `disable` or `confirm`; the loop at `apps/api/test/portal-password.test.ts:187`; the precision gap of C76 (`user_linked` against `staff_user_linked`, `apps/api/src/privacy/privacy.controller.ts:76`); `DELETE /api/students/:id/photo` deleting the pending photo; `pendingPhoto.url` to all four profiles; the user-approved rewrites of C26, C45, C59, C60, C86 and C91; and C67 proven at desktop width only.
- **Closed by e7dd251:** the round-10 and round-11 finding, `DELETE /api/students/:id` against `PATCH /api/users/:id` (deadlock and `500`), is now proven closed at `portal-cutoff.test.ts:916`, as are the anonymization, ficha-e-mail and 2FA-reset shapes the round-11 report named.
