# Portal do aluno verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: a9ebfbf..cf54dc8
**Round**: 13 - scoped
**Verifier**: independent sub-agent (author != verifier)

FAIL, for one reason. The production fix holds. The new sentence of C94 does not.

1. **H2 and H3 survive the sentence they were written against.** In 9cd5b5a, C94 gained "a trava dos administradores não passa de `FOR KEY SHARE`" (`checks.md:310`). Its proof is `enrollment_ahead_of_student_inactivation_201_204_without_deadlock`. That proof kills H1 (`for('update')`), `expected 500 to be 204`. It does not kill H2 (`for('no key update')`) or H3 (`for('share')`), and both are stronger than `FOR KEY SHARE`. H2 passes all 53 tests of the scratch `portal-cutoff.test.ts`, the 49 real ones included. H3 passes the proof. The sentence's reason is also wrong for them: "uma trava mais forte dos administradores no `DELETE` fecharia o ciclo". Only `FOR UPDATE` conflicts with the audit's `KEY SHARE`, so only `FOR UPDATE` closes it. I found no wrong status under H2 or H3. The difference shows up as waiting. With another admin's row held `FOR NO KEY UPDATE`, which is what an admin's own `PUT /api/auth/password` (`users.service.ts:176`) or login check (`:218`) holds, `DELETE /api/students/:id` answers `204` in 14 ms on HEAD and in 1508 ms (H2) or 1500 ms (H3), behind the 1.5 s hold. Under H2, every admin-authored write that opens with the helper also queues behind every other one (`no key update` conflicts with itself). So the claim states a bound that its proof does not pin. That is a check without a located assertion for one of its sentences, plus two surviving mutants.

Everything else holds:

- **The `link` fix works.** All 147 Proof lines pass at cf54dc8 (148 tests, 0 failed). Removing `lockActiveAdmins(tx)` from `StaffService.link` (S1) kills `staff_link_ahead_of_user_patch_204_200_without_deadlock` with `expected 500 to be 200`.
- **The other faults die.** K1 to K5, H1, M1, M3 and M10 all die, each on the test named below.
- **`unlink` is confirmed safe.** `StaffService.unlink` takes no lock on the target user, so it cannot form the cycle. A scratch probe shows this on HEAD and under S1 and H2. The same probe catches the lock that `link` takes under S1.
- **The sweep finds nothing else.** No other admin-authored transaction locks or writes a `users` row before its audit without the helper. That covers foreign keys too.

**Authorization of the round.** `checks.md:549` records round 13 as authorized by the user on 2026-10-31, with the production change in `StaffService.link` authorized. This report cannot confirm that independently. `git diff --stat e7dd251..HEAD` touches four files: `staff.service.ts` (+2 lines: the import and the call), `portal-cutoff.test.ts` (2 imports, `queuedOnStudent`, two tests), `checks.md` and the round-12 `verification.md`. Every changed line was read. In `checks.md` that means the C94 sentence, 2 Proof lines, the Coverage rows at `:451` and `:452`, and the Handoff line at `:549`.

**Handoff read against the code.** `checks.md:549` is accurate on cause, fix and test. I did not reproduce its "falhou com `expected 500 to be 200`" on HEAD~1 directly. S1 reproduces the same failure on HEAD minus the call. Its `unlink` argument was made "sem sonda". I probed it, and it holds (below). Its last clause, "o H1 já estava provado em 9cd5b5a", is true. It does not cover H2 or H3, which is where the bound sentence fails.

Scope: the diff `e7dd251..HEAD` plus every verdict that was not PASS in round 12. Those were H1, the `PUT /api/staff/:id/user` member and the strength bound. Proofs were rerun in full at cf54dc8. Each row below says whether it was verified this round or carried, and from where.

## Binding sources

Not run: the profile is `standard` and the plan marks no source as binding. cf54dc8 and 9cd5b5a touched no interface. No route, status or body changed. Carried from 5881ed0.

## Checks

Proofs were verified at cf54dc8 on the real tree, this round. Each target got one invocation, with the package's own binary (`node node_modules/vitest/vitest.mjs run <files> -t "<alternation>"`, `node node_modules/@playwright/test/cli.js test <files> -g "<alternation>"`) and a JSON reporter. The invocations were built by script from every `Proof:` line of `checks.md`: 147 lines (contracts 3, database 5, repo 1, api 117, web 20, stack 1). Every run exited 0. In total, 148 tests passed and 0 failed (api 118, web 20, contracts 3, database 5, repo 1, stack 1). The JSON was joined against every selector. 146 selectors hit exactly one passing test. C76's `user_linked` hits two, both passing, as recorded since 5881ed0. C92 ran with Docker 29.9.2. `pnpm verify` was not used (AD-118).

Citations: only `apps/api/test/portal-cutoff.test.ts` changed among the cited files. Its lines were remapped with a line-level diff of e7dd251 against HEAD (+0 to old `:5`, +2 to old `:206`, +4 to old `:956`, +33 after) and spot-read at HEAD (`:227`, `:232`, `:338`, `:786`, `:906`, `:919`, `:997`, `:1009`, `:1022`). The two new tests were located this round. Citations of every other file are carried from round 12, since those files did not change.

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
| C29 | consume `204` and its effects | api batch, exit 0; citations carried from round 11, file unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:78`-`:80`; `:82`-`:84`; `:85` | PASS |
| C30 | six invalid tokens, one valid at the edge | api batch, exit 0; citations carried from round 11, file unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:110`-`:112`; `:117` | PASS |
| C31 | password bounds | api batch, exit 0; citations carried from round 11, file unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:126`-`:128`; `:130`; `:132` | PASS |
| C32 | concurrent consume | api batch, exit 0; citations carried from round 11, file unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:143` - `toEqual([204, 422])`; `:148`-`:150` | PASS |
| C33 | token closed by the route, open on a ficha set by SQL, and `suspended` not refused (rewritten) | api batch, exit 0; three Proofs, each one test; citations carried from round 11, file unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:160`-`:163`; `:170`-`:172`; `:188` - `expect((await tokenRows(stack, userId)).map((row) => row.used_at)).toEqual([null])`, `:193` - `expect(refused.status).toBe(422)`, `:194`, `:195` - `expect(await credentials(userId)).toEqual(before)`; `:202` - `expect((await postConsume(stack.client(), { token, password: PASSWORD })).status).toBe(204)`, `:205`, `:210`, `:212`; F12b stays accepted | PASS |
| C34 | login after set, `role: student` | api batch, exit 0; citations carried from round 11, file unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:221`; `:225`-`:226` | PASS |
| C35 | reset token replaces password | api batch, exit 0; citations carried from round 11, file unchanged since 7946cc4 | `apps/api/test/portal-password.test.ts:238`-`:241` | PASS |
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
| C69 | inactivation cuts in one transaction, tokens included, and a refused one leaves the link usable (rewritten) | api batch, exit 0; citations refreshed at cf54dc8 (cf54dc8 and 9cd5b5a moved the file: +2 above old `:207`, +4 to old `:956`, +33 after) | `apps/api/test/portal-cutoff.test.ts:68`-`:71`; `:72` - `expect(await tokenRows(stack, failing.user.id)).toEqual(tokens)`; `:76`; `:82`; `:85`; `:97`; `:98` - `expect((await postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-4' })).status).toBe(204)` | PASS |
| C70 | suspension keeps user | api batch, exit 0; citations refreshed at cf54dc8 (cf54dc8 and 9cd5b5a moved the file: +2 above old `:207`, +4 to old `:956`, +33 after) | `apps/api/test/portal-cutoff.test.ts:108`-`:113`; `:114` | PASS |
| C71 | refused `PATCH` inactive | api batch, exit 0; citations refreshed at cf54dc8 (cf54dc8 and 9cd5b5a moved the file: +2 above old `:207`, +4 to old `:956`, +33 after) | `apps/api/test/portal-cutoff.test.ts:124`-`:127` | PASS |
| C72 | disabled login like inactive staff | api batch, exit 0; citations refreshed at cf54dc8 (cf54dc8 and 9cd5b5a moved the file: +2 above old `:207`, +4 to old `:956`, +33 after) | `apps/api/test/portal-cutoff.test.ts:138`; `:143`-`:145` | PASS |
| C73 | reactivation keeps disabled | api batch, exit 0; citations refreshed at cf54dc8 (cf54dc8 and 9cd5b5a moved the file: +2 above old `:207`, +4 to old `:956`, +33 after) | `apps/api/test/portal-cutoff.test.ts:1009` - `expect(await userActive(user.id)).toBe(false)`; `:1011`; `:1015`-`:1016`; `:1022` | PASS |
| C74 | anonymization clears user | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/privacy-anonymize.test.ts:278`-`:281` | PASS |
| C75 | anonymization failure keeps user | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/privacy-anonymize.test.ts:302`-`:303`; `:308`-`:309` | PASS |
| C76 | staff anonymization still `409` | api batch, exit 0; selector matched two tests, both passed; whole file passed; evidence carried from 5881ed0 | `apps/api/test/staff-privacy.test.ts:201`-`:202` code is `staff_user_linked`; `:359`-`:360` | PASS |
| C93 | open link of each purpose: `DELETE` fills `used_at`; after reactivation consume `422` in `token`, `users.active` false | api batch, exit 0; citations refreshed at cf54dc8 (cf54dc8 and 9cd5b5a moved the file: +2 above old `:207`, +4 to old `:956`, +33 after) | `apps/api/test/portal-cutoff.test.ts:154`-`:157` - `expect(await tokensClosed(user.id)).toEqual([['first_access', true], ['reset', true]])`, `:162`-`:164`; `:174` - `expect(await tokensClosed(user!.id)).toEqual([['first_access', true]])`, `:179`-`:181` | PASS |
| C94 | `consume` queued against every write contending for the user, both orders where the claim says so, the 2FA routes, the challenge in `verifications`, login and `verify` in flight, the own `PUT` in three interleavings and the administrator's `PUT` in four, and (round 12) five routes queued ahead of `PATCH /api/users/:id` on the same user: no deadlock on the queued cases, no `500` on the `PATCH`, no session or challenge left, the link password stands; (9cd5b5a) the admins lock "não passa de `FOR KEY SHARE`", shown by an enrollment queued ahead of `DELETE /api/students/:id`; (cf54dc8) `PUT /api/staff/:id/user` ahead of the `PATCH`: `204`, `200` | api batch, exit 0; forty-one Proofs, one test each, all run at cf54dc8; citations refreshed | `apps/api/test/portal-cutoff.test.ts:227`-`:232`, `:248`-`:253`, `:269`-`:274`, `:291`-`:297`, `:314`-`:319`, `:366`-`:369`, `:377`-`:380`, `:388`-`:391`, `:399`-`:402`, `:414`-`:419`, `:428`-`:433`, `:445`-`:449`, `:459`-`:463`, `:492`-`:498`, `:506`-`:511`, `:519`-`:522`, `:530`-`:533`, `:562`-`:567`, `:649`-`:652`, `:665`-`:668`, `:681`-`:686`, `:703`-`:706`, `:724`-`:728`, `:745`-`:748`, `:765`-`:769`, `:808`-`:811`, `:819`-`:823`, `:831`-`:834`, `:842`-`:845`, `:878`-`:882`, `:890`-`:893`, `:906`-`:908`; new: `:919`-`:922`, `:931`-`:933`, `:943`-`:946`, `:955`-`:958`, `:997`-`:999`; 9cd5b5a: `:972` - `expect(first.status).toBe(201)`, `:973` - `expect(second.status).toBe(204)`, `:974` - `expect(raised).toBe(0)`; cf54dc8: `:984` - `expect(first.status).toBe(204)`, `:985` - `expect(second.status).toBe(200)`, `:986` `staff.user_id` is the user, `:987` - `expect(raised).toBe(0)`; `:864`, `:868`-`:870`; `:338` - `expect((await login(user.email, user.password)).status).toBe(401)`; `:786` - `expect((await login(user.email, replacement)).status).toBe(401)`; sentences below | FAIL - every proof passes, but the sentence "não passa de `FOR KEY SHARE`" is not pinned: H2 and H3 survive it (Faults) |
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

### Sentences of C94 added after round 12

These were verified at cf54dc8. Each assertion is a literal at the cited line. `queuedOn` (`portal-cutoff.test.ts:194`-`:206`) now also takes `students`. It still proves "ambos em `Lock`" with two `waitFor` on `wait_event_type = 'Lock'`, and reads `deadlocks` after `STATS_DELAY`. The round-12 sentences hold at their remapped lines (Checks row C94).

| Sentence | Evidence | Judgment |
| --- | --- | --- |
| "a trava dos administradores não passa de `FOR KEY SHARE`: ... `POST /api/students/:id/enrollments` e depois `DELETE /api/students/:id` ... `201` e `204`, e `deadlocks` não sobe" (9cd5b5a) | `portal-cutoff.test.ts:972` - `expect(first.status).toBe(201)`, `:973` - `expect(second.status).toBe(204)`, `:974` - `expect(raised).toBe(0)` | the interleaving holds, and H1 fails at `:973` with `expected 500 to be 204`. **The bound does not.** H2 (`no key update`) and H3 (`share`) are stronger than `key share` and pass this test. The clause "uma trava mais forte ... fecharia o ciclo" holds only for `FOR UPDATE`, the one row-lock mode that conflicts with `FOR KEY SHARE`. This is a precision gap |
| `PUT /api/staff/:id/user` by `admin` on a staff user, then `PATCH /api/users/:id` of that user, both in `Lock`: `204`, `200`, never `500`, `deadlocks` (cf54dc8) | `:984` - `expect(first.status).toBe(204)`, `:985` - `expect(second.status).toBe(200)`, `:986` the link stuck (`staff.user_id` equals the user), `:987` - `expect(raised).toBe(0)` | holds; `:985` fails under S1 with `expected 500 to be 200` |
| "ligado a um funcionário" | the test seeds a `reception` user and an unlinked staff record (`:979`-`:980`), and the route links them | holds by reading. The user is not linked before the route, so "ligado" names the result, not a precondition |

## Coverage

The rows the fix touched were recomputed from `apps/api/src` at cf54dc8. The lock rows come from PostgreSQL's row-lock conflict table: `FOR KEY SHARE` conflicts only with `FOR UPDATE`, and `FOR NO KEY UPDATE` and `FOR SHARE` both coexist with `FOR KEY SHARE`. A foreign-key insert, or an update that changes the key to a non-null value, takes `FOR KEY SHARE` on the referenced row. Setting it to `NULL`, or an update that leaves it unchanged, takes nothing. A delete of a referencing row takes nothing on the referenced row. `apps/api/src/students/students.service.ts` was read with `tr -d '\000'` and left unedited.

### Sweep: transactions that lock or write `users` before an admin-authored audit

The foreign keys to `users` come from the migrations, not from the drizzle schema alone. There are seven. `accounts`, `sessions` and `two_factors` are in `0001_identity.sql:70`-`:72`. `audit_logs` is in `0002_audit_logs.sql:13`, `staff.user_id` in `0007_staff.sql:21`, `check_ins.checked_in_by` in `0010_check_ins.sql:10` and `password_tokens` in `0013_portal.sql:16`. There is no `students.user_id`: the link is `users.student_id`, which points at `students` and locks no `users` row.

| Transaction | What it takes on `users` before the audit | Audit author | Admins first | Shape of the deadlock with `PATCH /api/users/:id` |
| --- | --- | --- | --- | --- |
| `UsersService.update` (`users.service.ts:110`-`:139`) | admins `FOR UPDATE`, then the target `FOR UPDATE` | admin | is the other side | - |
| `resetPassword` (`:152`-`:161`) | target `no key update`, `accounts` update | admin | yes, `:153`; K1 | no |
| `resetTwoFactor` (`:189`-`:201`) | target update | admin | yes, `:190`; K2 | no |
| `changeOwnPassword` (`:175`-`:183`) | own row | self | n/a | no: the only row it holds is the author, which it already has |
| `create` (`:82`-`:100`) | inserts a new row and its `accounts` | admin or none | no | no: the new row is invisible to a `PATCH` until commit |
| `dropSessionsIfPasswordChanged` (`:217`-`:223`) | own row | no audit | n/a | no |
| `StudentsService.update` (`students.service.ts:170`-`:249`) | linked user `FOR UPDATE` (`:188`), e-mail (`:248`) | admin or the student | yes, `:171`; K3 | no |
| `StudentsService.inactivate` (`:266`-`:283`) | user update (`:277`), `password_tokens.used_at` (FK unchanged, no lock) | admin | yes, `:267`; K4 | no |
| `anonymizeStudent` (`privacy.service.ts:184`-`:220`) | `clearStudentUser` (`:229`, `:232`), deletes | admin | yes, `:185`; K5 | no |
| `StaffService.link` (`staff.service.ts:151`-`:168`) | `staff.user_id` = target, FK `KEY SHARE` on the target (`:159`) | admin | **yes, `:152`; S1** | no at cf54dc8. Under S1 the probe sees the target locked (`55P03`) and the proof gets `500` |
| `StaffService.unlink` (`:178`-`:192`) | `staff.user_id` = `NULL` (`:183`): **nothing on the target** | admin | no | **no.** Confirmed by probe: with the author's row held, `unlink` waits at its audit (in `Lock`) while `select ... from users where id = <target> for update nowait` succeeds ("free"), on HEAD, S1 and H2. The same probe on `link` under S1 gets `55P03`, so it can see the foreign-key lock. Queued behind a `PATCH` of the target, `unlink` gives `PATCH` `200`, `unlink` `204`, `deadlocks` +0, `staff.user_id` `NULL` |
| `anonymizeStaff` (`privacy.service.ts:286`-`:313`) | none: it refuses a linked staff record (`user_linked`) and does not write `user_id` | admin | no | no |
| `StaffService.create`, `update`, `inactivate`, `find`, `list` | none (`userOf` reads without lock) | admin | no | no |
| `CheckInsService.register` (`check-ins.service.ts:88`-`:106`) | `check_ins.checked_in_by` = the author, `KEY SHARE` on the author only | no audit in the transaction | n/a | no |
| portal `firstAccess`, `requestReset`, `consume` (`portal.service.ts:133`, `:165`, `:199`, `:225`) | user rows, `accounts`, `password_tokens` | `null` (`:140`, `:170`, `:230`) | n/a | no: no author lock |
| Better Auth (`sessions`, `two_factors`, `verifications`, login and 2FA routes) | outside any transaction with an admin audit (`auth.controller.ts` records after) | - | n/a | no |
| retention job (`privacy-retention.ts:48`) | as `anonymizeStudent` | `NO_ACTOR` | yes (same function) | no |

Result: no other transaction has the shape. The `unlink` argument of `checks.md:549` is confirmed by probe, not only by reading.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| admin-authored transactions that lock a `users` row before the audit, against `PATCH /api/users/:id` (`checks.md:451` says 7; recomputed 7), verified at cf54dc8 | the sweep above | `PUT /api/users/:id/password` C94 `portal-cutoff.test.ts:907`, K1 · `DELETE /api/students/:id` `:920`, K4 · anonymization `:998`, K5 · `PATCH /api/students/:id` e-mail `:944`, phone `:956`, K3 · `DELETE /api/users/:id/two-factor` `:932`, K2 · `PUT /api/staff/:id/user` `:985`, S1 | - |
| strength of the active-admins lock (bounds 2), verified at cf54dc8 | `apps/api/src/users/active-admins.ts:16`, the conflict table | not weaker than `key share`: K1 to K5 and S1 · not `for update`: C94 `:973`, H1 · not `no key update` or `share`, which C94's "não passa de `FOR KEY SHARE`" also excludes: no proof. H2 survives the 49 tests of the file and H3 survives the proof; the probe shows `DELETE /api/students/:id` waiting 1.5 s behind an admin row held `no key update` under either | `no key update`, `share` (`checks.md:310`, `:452`) |

The rows below are carried from the round-12 report (e7dd251) under their own labels. cf54dc8 touched none of their authorities: it changed only `StaffService.link`, which is no member of these sets. Their citations into `portal-cutoff.test.ts` were remapped to cf54dc8. The two rows whose faults were rerun this round say so.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `POST /api/portal/first-access` statuses (3), carried from round 11; authority untouched by e7dd251 | `portal.controller.ts`, `portal.service.ts` | 202 C16, C94 `portal-cutoff.test.ts:269` · 422 C22 · 429 C23 | - |
| `POST /api/password-tokens/consume` statuses (2), carried from round 11; authority untouched by e7dd251 | `portal.service.ts:198`, `:215` | 204 C29, C33 `portal-password.test.ts:202`, C35, C69, C94 `portal-cutoff.test.ts:291`, `:367` · 422 C30, C31, C33, C93, C94 | - |
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
| refused tokens (16), verified at cf54dc8 (M1, M3, M10 rerun in round 13) | `portal.service.ts:198` `!owner`, `:215`, `students.service.ts:278`, `privacy.service.ts:236`, schema at `packages/contracts/src/portal.ts:23` | absent, empty, `abc`, unknown, used, expired C30 `apps/api/test/portal-password.test.ts:110` · ficha inactivated, token closed C33 `:160` · ficha inactivated, open by SQL C33 `:193` · anonymized, token deleted C33 `:170` · anonymized, open by SQL C33 `:193` · `reset` and `first_access` issued before inactivation, ficha reactivated C93 `apps/api/test/portal-cutoff.test.ts:162`, `:179` · closed by `DELETE` queued C94 `:228` · closed by reset queued C94 `:249` · closed by first access queued C94 `:270` · deleted by anonymization queued C94 `:315`, M8 confirms | - |
| writes and locks contending for the user row with `consume` (`checks.md:446` says 12; recomputed 12, 11 routes and 1 lock, the two `PUT` apart), carried from round 11; authority untouched by e7dd251 | every lock and write on `users` in `apps/api/src`, above | `DELETE /api/students/:id` C94 `portal-cutoff.test.ts:232` · reset C94 `:253` · first access, by `FOR KEY SHARE`, C94 `:274` · anonymization C94 `:319` · `PATCH /api/students/:id` C94 `:369`, `:380` · `PATCH /api/me/profile` C94 `:391`, `:402` · `DELETE /api/users/:id/two-factor` C94 `:419`, `:433` · `confirm` C94 `:511`, `:533` · `disable` C94 `:498`, `:522` · lock of `PATCH /api/users/:id` on a student C94 `:449`, `:463` · login, by the check, C94 `:704`, L confirms · `verify`, by the check, C94 `:766`, L confirms | - |
| routes that swap the session against `consume`, by order (4), carried from round 11; authority untouched by e7dd251 | `auth.controller.ts:254`, `:281`; `better-auth` `totp/index.mjs:210`, `plugins/two-factor/index.mjs:229` | `disable` behind C94 `portal-cutoff.test.ts:493`, D1 confirms · `disable` ahead C94 `:519` · `confirm` behind C94 `:507`, D2 confirms · `confirm` ahead C94 `:530` | - |
| routes that create a session or challenge outside a transaction, against `consume` (`checks.md:448` says 5; recomputed 7 with `disable` and `confirm`, which have the row above), carried from round 11; authority untouched by e7dd251 | session creators and `verifications` writes, above | `verify` after, TOTP and backup code C94 `portal-cutoff.test.ts:562` · `verify` in flight C94 `:681` · login in flight, no 2FA C94 `:649` · login in flight, 2FA C94 `:665` · `disable`, `confirm` C94 `:493`, `:507` | - |
| lock of the check: `consume` past its delete and not committed (`checks.md:449` says 4; recomputed 4 outcomes), carried from round 11; authority untouched by e7dd251 | callers of `dropSessionsIfPasswordChanged`, one lock line `users.service.ts:218`; fault L | login, session C94 `portal-cutoff.test.ts:704` · login with 2FA C94 `:746` · `verify` C94 `:766` · `disable`, second request C94 `:725`; all four fail under L, `expected 200 to be 401` or `204`. `confirm`: a second request does not depend on the lock, carried from round 9 | - |
| writes on the password against `consume` (`checks.md:450` says 7; recomputed 7), carried from round 11; authority untouched by e7dd251 | `accounts` writers, above; `consume` against itself is C32 | `PUT /api/auth/password` in flight `portal-cutoff.test.ts:809`, behind `:820`, ahead `:832` · `PUT /api/users/:id/password` in flight `:843`, during the hash `:868`, behind `:879`, ahead `:891`; A, A2, B, C, D, X1, X2, X3, X4 confirm | - |
| tokens refused by when the token went away, carried from round 11; authority untouched by e7dd251 | `portal.service.ts:198`, `:215` | before the request `!owner` C30, C33 · while `consume` waits on the user, closed C94, M2 confirms · deleted while it waits, `!found` C94 `portal-cutoff.test.ts:315`, M8 confirms | - |
| ficha states accepted at consume (2), carried from round 11; authority untouched by e7dd251 | `students_status_valid` at `packages/database/src/schema.ts:178`, `portal.service.ts:215` | `active` C29 `portal-password.test.ts:78` · `suspended` C33 `:202`, `:210`, M11 and M11b confirm | - |
| lock strength on `users` in `consume` (bounds 2), verified at cf54dc8 (M1, M3, M10 rerun in round 13) | `portal.service.ts:199` | not stronger than `no key update` C94 `portal-cutoff.test.ts:269`, M3 confirms · not weaker C94 `:292`, M10 confirms; `for share` dies at C32, M10b carried | - |
| effects of `inactivate` in one transaction (4), carried from a9ebfbf + round 5 | `plan.md:45`, `students.service.ts:273`-`:278` | ficha, user, sessions C69, `apps/api/test/portal-cutoff.test.ts:69`-`:71` · tokens C69, `:72`, `:98`, F13 confirms | - |
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

## Test policy rows

The third row was rejudged at cf54dc8. The proofs of the fix go through HTTP, but the row does not list `staff.service.ts`, and that file has no row of its own because it predates the feature. The others are carried from round 12 with the sources that round gave them. No file they classify changed.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Eligibility with many conditions | `portal.service.ts` `firstAccessDecision` | service table C89 · boundary C20, C21 | yes - outside the diff |
| State derived from two tables | `portal.service.ts` `portalState` | pure C90 · boundary C26 | yes - outside the diff |
| Route that decides, over HTTP, with role cut and trail (`auth-rbac`: one case per line of the decision table) | `portal.controller.ts`, `me.controller.ts`, `photos.controller.ts`, `students.controller.ts`, `students.service.ts` `inactivate`, `consume`, `auth.controller.ts` routes, `users.controller.ts` `resetPassword`, `users.service.ts` `changeOwnPassword`, `resetPassword`, `dropSessionsIfPasswordChanged`, `dropPendingTwoFactor` | C16 to C83, C93, C94 | yes - every interleaving has its statuses asserted over HTTP (`portal-cutoff.test.ts:907`, `:920`, `:932`, `:944`, `:956`, `:973`, `:985`, `:998`). The lock-strength gap is recorded under Checks, Coverage and Faults, because the lock is not a decision line |
| Database constraint | `0013_portal.sql` | C1 to C5 | yes |
| Count in a window | `lead-throttle.ts` | module C88 · boundary C23, C40 | yes |
| Side effect after commit | `portal.service.ts` `deliver` | capture C17, C18, C38 | yes |
| Screen against the `FakeApi` | `minha-conta`, public pages, ficha | C27, C28, C36, C37, C42, C47 to C50, C56, C67, C68 | yes |
| Stack through `psql` | `tests/stack/compose.test.ts` | C92 | yes |

`Swept`, `existing` rows: carried from round 12. The global guard is at `apps/api/src/app.module.ts:202`, and the origin check is carried from 5881ed0. Neither was touched.

## Faults injected

Verified at cf54dc8, in `git worktree add --detach %TEMP%\r13w HEAD`. The scratch had four directory junctions for `node_modules` (root, `apps/api`, `packages/database`, `packages/contracts`). `globalSetup` was removed from its `vitest.config.ts` only. No `pnpm` command ran in the scratch. Tests ran as `node node_modules\vitest\vitest.mjs run test/portal-cutoff.test.ts -t "^(...)$"` from `apps\api`, with a JSON reporter. Each mutant was applied by script on bytes, run, restored, and checked byte for byte against the saved original. `students.service.ts` kept its NULs. The green baseline came first: the two new tests and the four probes passed on the unmutated scratch. The five-fault cap of `verify.md` does not apply, because every fault here was requested, except H3, which I added to test the bound sentence.

Isolation: `git status` of the real tree was clean at the start of the session and is clean after. At the end, the scratch differed from HEAD only in `vitest.config.ts` (-1 line) and the probes appended to `portal-cutoff.test.ts`. The junctions were removed with `cmd /c rmdir` before `git worktree remove --force`, and `git worktree list` shows only the real tree. `Test-Path apps\api\node_modules\vitest` is `True` after cleanup. No `git stash`, `reset`, `checkout` or `commit` touched the real tree.

| Mutation | Location | Killed |
| --- | --- | --- |
| S1: `lockActiveAdmins(tx)` removed from `StaffService.link` (new route) | `apps/api/src/staff/staff.service.ts:152` | yes - `staff_link_ahead_of_user_patch_204_200_without_deadlock`, `:985`, `expected 500 to be 200` |
| K1: removed from `resetPassword` | `apps/api/src/users/users.service.ts:153` | yes - `:907`, `expected 500 to be 200` |
| K2: removed from `resetTwoFactor` | `apps/api/src/users/users.service.ts:190` | yes - `:932`, `expected 500 to be 200` |
| K3: removed from `StudentsService.update` | `apps/api/src/students/students.service.ts:171` | yes - `:944` and `:956`, `expected 500 to be 404` |
| K4: removed from `inactivate` | `apps/api/src/students/students.service.ts:267` | yes - `:920`, `expected 500 to be 404` |
| K5: removed from `anonymizeStudent` | `apps/api/src/privacy/privacy.service.ts:185` | yes - `:998`, `expected 500 to be 404` |
| H1: `for('key share')` -> `for('update')` in the helper | `apps/api/src/users/active-admins.ts:16` | yes - `enrollment_ahead_of_student_inactivation_201_204_without_deadlock`, `:973`, `expected 500 to be 204` |
| H2: `for('key share')` -> `for('no key update')` in the helper; whole `portal-cutoff.test.ts` (49 tests plus 4 probes) | `apps/api/src/users/active-admins.ts:16` | no - 53 of 53 pass. C94 says the lock "não passa de `FOR KEY SHARE`", which excludes this. Probe: `DELETE /api/students/:id` behind an admin row held `no key update` takes 1508 ms against 14 ms on HEAD; status `204` both |
| H3 (added): `for('key share')` -> `for('share')` | `apps/api/src/users/active-admins.ts:16` | no - the bound proof passes; same probe 1500 ms, `204` |
| M1: old order, token and user locked in one statement (owner lookup and user lock removed, `of: [passwordTokens, users]`) | `apps/api/src/portal/portal.service.ts:194`-`:199`, `:214` | yes - `inactivation_against_consume`, `reset_against_consume`, `anonymization_ahead_of_consume` `expected 500 to be 422`; `first_access_against_consume` `expected 204 to be 422`; `consume_ahead_of_inactivation_on_held_token` `expected 500 to be 204` |
| M3: `users` locked `for update` in `consume` | `apps/api/src/portal/portal.service.ts:199` | yes - `first_access_against_consume_202_422_without_deadlock`, `:269`, `expected 500 to be 202` |
| M10: `users` locked `for key share` in `consume` | `apps/api/src/portal/portal.service.ts:199` | yes - `consume_ahead_of_inactivation_on_held_token_204_204_without_deadlock`, `:292`, `expected 500 to be 204` |
| earlier faults (X1 to X8, A, A2, B to E, L, F, T1, T2, M8, M11 and those carried before): carried from round 12 | `users.service.ts`, `auth.controller.ts`, `portal.service.ts` | yes - carried. The diff since e7dd251 touched none of these files |

**Probes, scratch only** (appended to the scratch copy of `apps/api/test/portal-cutoff.test.ts`, never in the real tree, gone with the worktree). Results were written to a temp file, which was deleted after.

| Probe | Code | Result |
| --- | --- | --- |
| `PATCH /api/users/:id` of a linked staff user, then `DELETE /api/staff/:id/user`, both in `Lock` behind the held user row (`queuedOnUser`) | HEAD, S1, H2 | `PATCH` `200`, `unlink` `204`, `deadlocks` +0, `staff.user_id` `NULL` |
| author's row held `for update`; `DELETE /api/staff/:id/user` waits in `Lock`; meanwhile `select id from users where id = <target> for update nowait` | HEAD, S1, H2 | `free`; `unlink` `204` |
| same, with `PUT /api/staff/:id/user` | HEAD, H2 | `free` (it waits at the helper, before touching the target) |
| same | S1 | **`locked: 55P03`**, so the probe sees the foreign-key lock when it exists |
| another admin's row held `for no key update` for 1.5 s; `DELETE /api/students/:id` by an admin | HEAD | `204` in 14 ms |
| same | H2 / H3 | `204` in 1508 / 1500 ms |

## Gate

`py -3 C:/Users/Admin/.claude/skills/tlc-spec-lean/scripts/validate_verification.py portal-aluno` - exit 1: 1 error, 0 warnings. The one error is "verdict is FAIL - route the ranked gaps back as fixes, then re-verify". The script raised nothing about the structure or consistency of the report. Exit 0 needs a PASS, and these rows do not allow one.

Proofs: 148 tests passed, 0 failed, from 147 Proof lines (contracts 3, database 5, repo 1, api 118, web 20, stack 1).

## Decisions for the user

- **The bound sentence of C94** (`checks.md:310`, Coverage `:452`). Either rewrite it to what is proven and true, for example "a trava dos administradores não chega a `FOR UPDATE`", and drop "uma trava mais forte ... fecharia o ciclo". That is a check rewrite and needs your approval. Or keep "não passa de `FOR KEY SHARE`" and add a proof that pins it. For example: with another admin's row held `FOR NO KEY UPDATE`, as that admin's own password change holds it, `DELETE /api/students/:id` answers without entering `Lock`. That kills H2 and H3 (the probe above), and it is a test change only. Either way it is round 14, past the bound of three.
- **Rounds past the bound.** Rounds 4 to 13 all went past the three of `verify.md`.

## Open findings (do not change the verdict on their own)

- **`unlink` is closed as a question.** It takes no lock on the target, it is confirmed by probe, and it needs no change.
- **`STATE.md` and `.specs/ROADMAP.md:28`:** may still be behind the feature's rounds. Carried, outside this round's edit scope.
- Carried from round 12, unchanged by the diff: `verify` after a `PUT` (`checks.md:546`); a `PUT` in flight when the ficha goes `inactive` changes a disabled user's password; the orphan attempts row; the precision gap of C94's login with 2FA (`portal-cutoff.test.ts:667`, `:748`); the orphan session row if `record` throws in `disable` or `confirm`; the loop at `apps/api/test/portal-password.test.ts:187`; the precision gap of C76 (`user_linked` against `staff_user_linked`, `apps/api/src/privacy/privacy.controller.ts:76`); `DELETE /api/students/:id/photo` deleting the pending photo; `pendingPhoto.url` to all four profiles; the user-approved rewrites of C26, C45, C59, C60, C86 and C91; and C67 proven at desktop width only.
- **Closed by cf54dc8 and 9cd5b5a:** the round-12 finding `PUT /api/staff/:id/user` against `PATCH /api/users/:id` (proven closed at `portal-cutoff.test.ts:985`, S1 confirms), and H1 (killed at `:973`). The `checks.md:548` wording slip ("quatro testes") is unchanged.
