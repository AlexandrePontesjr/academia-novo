# Portal do aluno verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: a9ebfbf..working tree
**Round**: 11 - scoped
**Verifier**: independent sub-agent (author != verifier)

PASS. The one surviving fault of round 10 is dead and nothing took its place. All 140 Proof lines pass (141 tests), all 94 checks hold, no coverage member is unproven, every `Test policy` row is met, and all 20 faults injected this round die: the 18 requested and two of mine on the same window. The whole API suite on the real tree gives 883 passed, 0 failed.

**Round 11 was authorized by the user on 2026-10-31,** past the bound of three rounds in `verify.md`, with no production change. That last part is measured, not taken from the Handoff: removing from `portal-cutoff.test.ts` the mock block, the two lines and the new test gives a `git diff a9ebfbf -- apps` with exactly round 10's MD5, `ABFD414E9EE2FBC8B2025E117A95AFEF`. So since round 10 `apps` changed only in that one test file and only by those additions; no line was removed and no assertion weakened. `checks.md` gained the C94 sentence, the Proof, the count 7, the count 32 and the Handoff line, read below. Nothing is committed: this verdict is about the working tree on `a9ebfbf`.

**Round 10 failures, by code.**

| Round 10 failure | State |
| --- | --- |
| Surviving fault X1, `before` read after `hashPassword`, `apps/api/src/users/users.service.ts:149`-`:150` | closed: `apps/api/test/portal-cutoff.test.ts:864`, `expected 204 to be 422`; the other four `reset_password_` proofs pass under it, so this is the only proof that reaches the window |
| `Unproven` cell of `escritas na senha contra o consumo` | closed: member at `.specs/features/portal-aluno/checks.md:443`, proof `apps/api/test/portal-cutoff.test.ts:844` |
| Unmet `Test policy` row, line "hash changed while the request hashed" | closed: same proof; the sentence "lido no início do pedido", `.specs/features/portal-aluno/checks.md:310`, now has an assertion |

**The new test's mechanism, judged.** It holds.

| Question | Answer | Evidence |
| --- | --- | --- |
| Does the `vi.mock` intercept the production path? | yes. The API runs in the test process (`apps/api/test/support/app.ts:7` imports `AppModule` from `src`), and `users.service.ts:4` imports the module the mock replaces. Measured: with only the `vi.mock` block taken out, the same test never reaches `await reached` and times out at 20 s; with it, it passes. A proof that did not intercept could only hang, not pass | scratch, `mock_removed`; `portal-cutoff.test.ts:14`, `:859` |
| Does it stop the right request? | yes. `hashes.before` acts only on the `replacement` password, `:852`, so the hash of `consume`, `portal.service.ts:192`, passes through; the wrapper keeps `verifyPassword` by `...actual`, `:17` | reading, and `consume` answers `204` at `:860` |
| Does it change what another test in the file proves? | no. With `hashes.before` undefined the wrapper adds one `await` and calls the real function. Also wrapped: `auth.ts:61`, `auth.controller.ts:311`, `users.service.ts:80`, `:178`, `apps/api/test/support/portal.ts:2`; none is stopped, since only the new test sets the hook and `afterEach` clears it, `:605`. Measured: the file with no mock at all, the tree of round 10, gives 41 of 41, the same tests that pass with the mock. The mock is per file, so no other test file sees it | scratch, `no_mock_r10_tree` |
| Is the wait deterministic? | yes. No sleep, no timer and no poll: `reached` resolves when the `PUT` enters the hash, `consume` is awaited to its `204` with the `PUT` stopped, then `release()`. The `PUT` holds no lock and no transaction there, so `consume` cannot queue behind it. Eight consecutive process runs passed 8 of 8; if the production order changed so the hash were never reached, the test would fail by timeout, not pass | `:853`, `:859`-`:861`, `users.service.ts:149`-`:151` |

Its limit, stated: it stops at the start of the hash, so it proves "read before the hash", which is what `checks.md:310` claims; it says nothing about a concurrent read, which no code does.

**Accepted by the user, recorded and not failing this round (`.specs/features/portal-aluno/checks.md:534`):** the first-access race with the token held and `consume` ahead, and the classifications of F12b and M2c. This report cannot confirm the acceptance independently; it is as `checks.md` records it. The items the Handoff lists as open do not contradict the code: `verify` after a `PUT` (`checks.md:537`, `:538`, confirmed in round 10) and the `inactivate` deadlock shape (`checks.md:538`; `students.service.ts:274` writes the target and `:280` records the audit after it, unchanged since `a9ebfbf` by `git diff`).

Scope: every verdict not PASS in round 10, plus the diff. Proofs are verified at a9ebfbf + working tree for all 94. Rows that say `carried from` keep their original source and were not re-derived here. `a9ebfbf + working tree` below means this round's tree unless a round is named.

## Binding sources

Not run: the profile is `standard`, the plan marks no source as binding, and nothing since round 10 touched an interface. `carried from 5881ed0`.

## Checks

Proofs verified at a9ebfbf + working tree, this round. One invocation per target, with a JSON reporter, on the real tree, run with the package's own binary so the name alternation survives the Windows shell: contracts 3, database 5, repo 1, api 111, web 20, stack 1, so 141 tests passed and 0 failed, every run exit 0, from 140 Proof lines. The JSON of each run was joined against every selector: 139 Proof lines resolved to exactly one passing test, and C76 matches two, both passing, as recorded. C92 ran with Docker 29.9.2. `pnpm verify` was not used (AD-118). Citations of `portal-cutoff.test.ts` were refreshed on every row, since the mock moved the whole file; the citations of the other files did not move, because `git diff` of everything else is byte-identical to round 10 (see the top of this report). A row that says `carried from` still carries its claim from there; its proof ran this round.

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
| C29 | consume `204` and its effects | api batch, exit 0; citations verified at a9ebfbf + working tree | `apps/api/test/portal-password.test.ts:78`-`:80`; `:82`-`:84`; `:85` | PASS |
| C30 | six invalid tokens, one valid at the edge | api batch, exit 0; citations verified at a9ebfbf + working tree | `apps/api/test/portal-password.test.ts:110`-`:112`; `:117` | PASS |
| C31 | password bounds | api batch, exit 0; citations verified at a9ebfbf + working tree | `apps/api/test/portal-password.test.ts:126`-`:128`; `:130`; `:132` | PASS |
| C32 | concurrent consume | api batch, exit 0; citations verified at a9ebfbf + working tree | `apps/api/test/portal-password.test.ts:143` - `toEqual([204, 422])`; `:148`-`:150` | PASS |
| C33 | token closed by the route, open on a ficha set by SQL, and `suspended` not refused (rewritten) | api batch, exit 0; three Proofs, each one test; verified at a9ebfbf + working tree | `apps/api/test/portal-password.test.ts:160`-`:163`; `:170`-`:172`; `:188` - `expect((await tokenRows(stack, userId)).map((row) => row.used_at)).toEqual([null])`, `:193` - `expect(refused.status).toBe(422)`, `:194`, `:195` - `expect(await credentials(userId)).toEqual(before)`; `:202` - `expect((await postConsume(stack.client(), { token, password: PASSWORD })).status).toBe(204)`, `:205`, `:210`, `:212`; F12b stays accepted | PASS |
| C34 | login after set, `role: student` | api batch, exit 0; citations verified at a9ebfbf + working tree | `apps/api/test/portal-password.test.ts:221`; `:225`-`:226` | PASS |
| C35 | reset token replaces password | api batch, exit 0; citations verified at a9ebfbf + working tree | `apps/api/test/portal-password.test.ts:238`-`:241` | PASS |
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
| C69 | inactivation cuts in one transaction, tokens included, and a refused one leaves the link usable (rewritten) | api batch, exit 0; two Proofs, each one test; verified at a9ebfbf + working tree | `apps/api/test/portal-cutoff.test.ts:66`-`:69`; `:70` - `expect(await tokenRows(stack, failing.user.id)).toEqual(tokens)`; `:74`; `:80`; `:83`; `:95`; `:96` - `expect((await postConsume(stack.client(), { token, password: 'senha-nova-do-aluno-4' })).status).toBe(204)` | PASS |
| C70 | suspension keeps user | api batch, exit 0; citations verified at a9ebfbf + working tree | `apps/api/test/portal-cutoff.test.ts:106`-`:111`; `:112` | PASS |
| C71 | refused `PATCH` inactive | api batch, exit 0; citations verified at a9ebfbf + working tree | `apps/api/test/portal-cutoff.test.ts:122`-`:125` | PASS |
| C72 | disabled login like inactive staff | api batch, exit 0; citations verified at a9ebfbf + working tree | `apps/api/test/portal-cutoff.test.ts:136`; `:141`-`:143` | PASS |
| C73 | reactivation keeps disabled | api batch, exit 0; citations verified at a9ebfbf + working tree | `apps/api/test/portal-cutoff.test.ts:914` - `expect(await userActive(user.id)).toBe(false)`; `:916`; `:920`-`:921`; `:927` | PASS |
| C74 | anonymization clears user | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/privacy-anonymize.test.ts:278`-`:281` | PASS |
| C75 | anonymization failure keeps user | api batch, exit 0; evidence carried from 5881ed0 | `apps/api/test/privacy-anonymize.test.ts:302`-`:303`; `:308`-`:309` | PASS |
| C76 | staff anonymization still `409` | api batch, exit 0; selector matched two tests, both passed; whole file passed; evidence carried from 5881ed0 | `apps/api/test/staff-privacy.test.ts:201`-`:202` code is `staff_user_linked`; `:359`-`:360` | PASS |
| C93 | open link of each purpose: `DELETE` fills `used_at`; after reactivation consume `422` in `token`, `users.active` false | api batch, exit 0; verified at a9ebfbf + working tree; each selector matched one test | `apps/api/test/portal-cutoff.test.ts:152`-`:155` - `expect(await tokensClosed(user.id)).toEqual([['first_access', true], ['reset', true]])`, `:160`-`:162`; `:172` - `expect(await tokensClosed(user!.id)).toEqual([['first_access', true]])`, `:177`-`:179` | PASS |
| C94 | `consume` queued against every write contending for the user, both orders where the claim says so, the 2FA routes, the challenge in `verifications`, login and `verify` in flight, the own `PUT` in three interleavings and the administrator's `PUT` in four: no deadlock on the queued cases, no session or challenge left, the link password stands | api batch, exit 0; thirty-four Proofs, one test each; verified at a9ebfbf + working tree | `apps/api/test/portal-cutoff.test.ts:223`-`:228`, `:244`-`:249`, `:265`-`:270`, `:287`-`:293`, `:310`-`:315`, `:362`-`:365`, `:373`-`:376`, `:384`-`:387`, `:395`-`:398`, `:410`-`:415`, `:424`-`:429`, `:441`-`:445`, `:455`-`:459`, `:488`-`:494`, `:502`-`:507`, `:515`-`:518`, `:526`-`:529`, `:558`-`:563`, `:645`-`:648`, `:661`-`:664`, `:677`-`:682`, `:699`-`:702`, `:720`-`:724`, `:741`-`:744`, `:761`-`:765`, `:804`-`:807`, `:815`-`:819`, `:827`-`:830`, `:838`-`:841`, `:874`-`:878`, `:886`-`:889`, `:902`-`:904`; `:860`, `:864`-`:866`; `:334` - `expect((await login(user.email, user.password)).status).toBe(401)`; `:782` - `expect((await login(user.email, replacement)).status).toBe(401)`; sentences below | PASS |
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

### Sentences of C94

Verified at a9ebfbf + working tree. All assertions are literals at the line cited, so none needs its fixture walked. "Both in `Lock`" is `portal-cutoff.test.ts:197`, `:199`. The C33 sentences are `carried from a9ebfbf + round 7`, with M11 rerun. Fault lines in the table are this round where the fault was rerun, otherwise the round named under Faults injected.

| Sentence | Evidence | Judgment |
| --- | --- | --- |
| `DELETE` ahead: `204`, `422` in `token`, inactive, accounts equal, `deadlocks` | `portal-cutoff.test.ts:223`-`:228` | holds; `:224` failed under M1 |
| reset ahead: `202`, `422`, active, accounts equal, `deadlocks` | `:244`-`:249` | holds; `:245` failed under M1 |
| first access behind `consume`: `202`, `422`, inactive, no account, `deadlocks` | `:265`-`:270` | holds; `:265` failed under M3, `:266` under M1 |
| held token: `204`, `204`, inactive, no open token, `deadlocks` | `:287`-`:293` | holds; `:288` failed under M10, `:287` under M1 |
| anonymization: `204`, `422`, no account, no token, `deadlocks` | `:310`-`:315` | holds; `:311` failed under M1, M8 |
| `PATCH`, both orders: `200`, `204`, phone and password changed, `deadlocks` | `:362`, `:363`, `:351`, `:333`, `:334`, `:365`; `:373`, `:374`, `:376` | holds |
| `PATCH /api/me/profile`, both orders: same | `:384`, `:385`, `:387`; `:395`, `:396`, `:398`; `:351`, `:334` | holds |
| `DELETE /api/users/:id/two-factor`, both orders: `204`, `204`, flag false, no session, `deadlocks` | `:410`-`:413`, `:415`; `:424`-`:427`, `:429` | holds |
| `PATCH /api/users/:id`, both orders: `404`, `204`, name kept, password changed, `deadlocks` | `:441`-`:445`; `:455`-`:459` | holds |
| `consume` ahead of `disable`: `204`, `401`, flag false, no session, profile `401`, `deadlocks` | `:488`, `:489`, `:491`, `:477`, `:478`, `:494` | holds; `:489` failed under D1 and hash read late |
| `consume` ahead of `confirm`: `204`, `401`, flag true, no session, profile `401`, `deadlocks` | `:502`, `:503`, `:505`, `:477`, `:478`, `:507` | holds; `:503` failed under D2 and hash read late |
| `disable` ahead of `consume`: consume `204`, route `204` or `401`, no session, profile `401`, `deadlocks` | `:515`, `:516`, `:477`, `:478`, `:518` | holds; the alternative is in the claim |
| `confirm` ahead of `consume`: same | `:526`, `:527`, `:477`, `:478`, `:529` | holds; no fault failed these two, because they do not depend on the correction: `consume` deletes after the route |
| the `401` of `consume` ahead of `disable` and `confirm` has no `Set-Cookie` | `:490`, `:504` | holds; both failed under F |
| `verify` after `consume`, by TOTP and backup code: `401` `invalid_code`, no `Set-Cookie`, no session, both challenge rows gone, profile `401` | `:558`, `:559`, `:560`, `:561`, `:562`, `:563`; both rows present before, `:553` | holds; `:558` failed with the drop taken out of `consume`, `:562` with the `2fa-attempts-` line not deleted |
| gate on `sessions`, login in flight, `consume` `204`: `401` `invalid_credentials`, no `Set-Cookie`, no session | `:641`, `:645`-`:648` | holds |
| same stop, 2FA on: `401`, no `Set-Cookie`, no challenge row | `:661`-`:664` | holds. Precision gap, below |
| same stop, `verify` in flight: `401` `invalid_code`, no `Set-Cookie`, no session | `:677`-`:680` | holds |
| that `401` of `verify` leaves exactly one `auth.login_failed` and the counter at one attempt | `:681`, `:682` | holds; `:681` failed under T1, `:682` under T2 |
| `consume` stopped on `audit_logs`, login released: answers after the commit, `401`, no `Set-Cookie`, no session | `:699`-`:702` | holds; `:700` failed under L. "Only after the commit" is implied: without the wait the answer is `200` |
| two `disable` on one session, first stopped, second `204`, `consume` stopped: first `401`, no `Set-Cookie`, no session | `:712`, `:720`-`:724` | holds; `:721` failed under L, `:722` under F |
| same stop, login with 2FA: `401`, no `Set-Cookie`, no challenge row | `:741`-`:744` | holds; `:742` failed under L |
| same stop, `verify`: `401` `invalid_code`, no `Set-Cookie`, no session | `:761`-`:765` | holds; `:762` failed under L |
| `PUT /api/auth/password` in flight behind `consume`: `204`, `422` in `currentPassword`, link password `200`, `PUT` password `401`, no session | `:804`-`:807`, `:780`-`:782` | holds; `:805` failed under A, A2, B |
| same route queued, `consume` ahead: same, `deadlocks` | `:815`-`:819` | holds; `:816` failed under A, A2, B |
| same route queued, `PUT` ahead: `204`, `204`, link password stands, `deadlocks` | `:827`-`:830` | holds; no fault fails it, because `consume` after the `PUT` wins with or without the correction, as the Handoff says |
| `PUT /api/users/:id/password` in flight: `204`, `422` in `password`, link password stands | `:838`-`:841` | holds; `:839` failed under C, D, X2, X4 |
| `PUT /api/users/:id/password` stopped by the test around `hashPassword`, `consume` `204` in that interval: `422` in `password`, link password stands, `PUT` password `401`, no session (new) | `:851`-`:856`, `:860`, `:864`, `:865`, `:866`, `:780`-`:782` | holds; `:864` failed under X1, X3, D, X2, `expected 204 to be 422`. This is the sentence "o hash lido no início do pedido" now has an assertion for |
| same route queued, `consume` ahead: same, `deadlocks` | `:874`-`:878` | holds; `:875` failed under D, X2, X4; C fails earlier, at the queue itself |
| same route queued, `PUT` ahead: `204`, `204`, link password stands, `deadlocks` | `:886`-`:889` | holds |
| staff row held, `PUT /api/users/:id/password` then `PATCH /api/users/:id`: `204`, `200`, `deadlocks` | `:902`-`:904` | holds; `:903` failed under E and X8, `expected 500 to be 200`, so the order of the locks is proven, not only their presence |

## Coverage

Recomputed from `apps/api/src` and `better-auth` 1.7.7, for the rows marked verified. Rows marked verified at a9ebfbf + working tree this round are the two the new proof touches, plus every row whose citations were refreshed; since `apps/api/src` is byte-identical to round 10, the other members are the same as round 10 found. `apps/api/src/students/students.service.ts` was read with `grep -a` and a byte read, unedited. Facts, carried from a9ebfbf + round 10 unless the bullet says otherwise:

- **Session creators in `better-auth`:** `api/routes/sign-in.mjs:353`, `plugins/two-factor/verify-two-factor.mjs:31`, `totp/index.mjs:210`, `plugins/two-factor/index.mjs:229`; lines `:119`, `:142` and `otp/index.mjs:227` need OTP or `skipVerificationOnEnable`, and `twoFactor()` at `apps/api/src/auth.ts:65` has neither. All `auth.api.*` calls: 8, in `auth.controller.ts` and `access.ts:113`; `getSession` creates nothing.
- **The challenge:** `plugins/two-factor/index.mjs:292`-`:303` writes `2fa-<20 chars>` with the user id in `value` and `2fa-attempts-2fa-<id>` with `"0"`, both for 600 s, in plain text, since `apps/api/src/auth.ts` sets no `verification.storeIdentifier`. The login hook first creates and deletes a session, `:288`, then writes the challenge.
- **Writes on `verifications`:** those two; `consumeVerificationValue` of the challenge and of the attempts row, and the rearm of the attempts row, `verify-two-factor.mjs:26`, `:72`, `:89`; `trust-device-*`, `:51`, which needs `body.trustDevice`, and the controller passes only `code` or `backupCode`; ours, `users.service.ts:37`, called at `portal.service.ts:228` and `users.service.ts:224`.
- **Writes on `accounts`:** `portal.service.ts:218`, `:223`; `users.service.ts:89` (a new user, no contention), `:239`, called at `:161` and `:183` (both `PUT`); `privacy.service.ts:233`. All of them now hold the `users` row, by `portal.service.ts:199`, `users.service.ts:158`, `:180`, `privacy.service.ts:227`.
- **Writes and locks on `users`:** `students.service.ts:186`, `:246`, `:274`; `portal.service.ts:133`, `:165`, `:199`, `:225`; `privacy.service.ts:227`, `:230`; `users.service.ts:83`, `:115`-`:116`, `:129`, `:152`-`:158`, `:180`, `:195`, `:221`; Better Auth's flag in `confirm` and `disable`. Audit's foreign key takes `FOR KEY SHARE` on the actor, which conflicts with `FOR UPDATE` and not with `no key update`.
- **Callers of the check:** `auth.controller.ts:105`, `:162`, `:294`, the last reached from `:264` and `:288`: 4 routes.
- **Counts of `checks.md`, by my count:** verified at a9ebfbf + working tree. 12 at `checks.md:439` holds: 11 routes and 1 lock, the two `PUT` apart, as its label says. 4 at `:442` holds: L fails exactly those four tests; `confirm` stays out, as in round 9, because a second request does not depend on the lock. 7 at `:443` holds: the own `PUT` by 3 interleavings, the administrator's `PUT` by 4. The own `PUT` has no fourth member because it reads no hash ahead: `users.service.ts:181`-`:182` read and verify under the lock, so a commit during its hash, `users.service.ts:178`, is the in-flight case. 32 races at `checks.md:491` holds: C32 plus 31 of the 34 Proofs of C94, leaving out the two sequential `verify` and `reset_password_ahead_of_user_patch`, which is not against `consume`.
- **`refused tokens (16)`:** as in round 8, no route added.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `POST /api/portal/first-access` statuses (3), verified at a9ebfbf + working tree | `portal.controller.ts`, `portal.service.ts` | 202 C16, C94 `portal-cutoff.test.ts:265` · 422 C22 · 429 C23 | - |
| `POST /api/password-tokens/consume` statuses (2), verified at a9ebfbf + working tree | `portal.service.ts:198`, `:215` | 204 C29, C33 `portal-password.test.ts:202`, C35, C69, C94 `portal-cutoff.test.ts:287`, `:363` · 422 C30, C31, C33, C93, C94 | - |
| `POST /api/password-reset` statuses (3), verified at a9ebfbf + working tree | `portal.service.ts` | 202 C38, C94 · 422 C41 · 429 C40 | - |
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
| refused tokens (16), verified at a9ebfbf + working tree | `portal.service.ts:198` `!owner`, `:215`, `students.service.ts:278`, `privacy.service.ts:236`, schema at `packages/contracts/src/portal.ts:23` | absent, empty, `abc`, unknown, used, expired C30 `apps/api/test/portal-password.test.ts:110` · ficha inactivated, token closed C33 `:160` · ficha inactivated, open by SQL C33 `:193` · anonymized, token deleted C33 `:170` · anonymized, open by SQL C33 `:193` · `reset` and `first_access` issued before inactivation, ficha reactivated C93 `apps/api/test/portal-cutoff.test.ts:160`, `:177` · closed by `DELETE` queued C94 `:224` · closed by reset queued C94 `:245` · closed by first access queued C94 `:266` · deleted by anonymization queued C94 `:311`, M8 confirms | - |
| writes and locks contending for the user row with `consume` (`checks.md:439` says 12; recomputed 12, 11 routes and 1 lock, the two `PUT` apart), verified at a9ebfbf + working tree | every lock and write on `users` in `apps/api/src`, above | `DELETE /api/students/:id` C94 `portal-cutoff.test.ts:228` · reset C94 `:249` · first access, by `FOR KEY SHARE`, C94 `:270` · anonymization C94 `:315` · `PATCH /api/students/:id` C94 `:365`, `:376` · `PATCH /api/me/profile` C94 `:387`, `:398` · `DELETE /api/users/:id/two-factor` C94 `:415`, `:429` · `confirm` C94 `:507`, `:529` · `disable` C94 `:494`, `:518` · lock of `PATCH /api/users/:id` on a student C94 `:445`, `:459` · login, by the check, C94 `:700`, L confirms · `verify`, by the check, C94 `:762`, L confirms | - |
| routes that swap the session against `consume`, by order (4), verified at a9ebfbf + working tree | `auth.controller.ts:254`, `:281`; `better-auth` `totp/index.mjs:210`, `plugins/two-factor/index.mjs:229` | `disable` behind C94 `portal-cutoff.test.ts:489`, D1 confirms · `disable` ahead C94 `:515` · `confirm` behind C94 `:503`, D2 confirms · `confirm` ahead C94 `:526` | - |
| routes that create a session or challenge outside a transaction, against `consume` (`checks.md:441` says 5; recomputed 7 with `disable` and `confirm`, which have the row above), verified at a9ebfbf + working tree | session creators and `verifications` writes, above | `verify` after, TOTP and backup code C94 `portal-cutoff.test.ts:558` · `verify` in flight C94 `:677` · login in flight, no 2FA C94 `:645` · login in flight, 2FA C94 `:661` · `disable`, `confirm` C94 `:489`, `:503` | - |
| lock of the check: `consume` past its delete and not committed (`checks.md:442` says 4; recomputed 4 outcomes), verified at a9ebfbf + working tree | callers of `dropSessionsIfPasswordChanged`, one lock line `users.service.ts:221`; fault L | login, session C94 `portal-cutoff.test.ts:700` · login with 2FA C94 `:742` · `verify` C94 `:762` · `disable`, second request C94 `:721`; all four fail under L, `expected 200 to be 401` or `204`. `confirm`: a second request does not depend on the lock, carried from round 9 | - |
| writes on the password against `consume` (`checks.md:443` says 7; recomputed 7), verified at a9ebfbf + working tree | `accounts` writers, above; `consume` against itself is C32 | `PUT /api/auth/password` in flight `portal-cutoff.test.ts:805`, behind `:816`, ahead `:828` · `PUT /api/users/:id/password` in flight `:839`, during the hash `:864`, behind `:875`, ahead `:887`; A, A2, B, C, D, X1, X2, X3, X4 confirm | - |
| tokens refused by when the token went away, verified at a9ebfbf + working tree | `portal.service.ts:198`, `:215` | before the request `!owner` C30, C33 · while `consume` waits on the user, closed C94, M2 confirms · deleted while it waits, `!found` C94 `portal-cutoff.test.ts:311`, M8 confirms | - |
| ficha states accepted at consume (2), verified at a9ebfbf + working tree | `students_status_valid` at `packages/database/src/schema.ts:178`, `portal.service.ts:215` | `active` C29 `portal-password.test.ts:78` · `suspended` C33 `:202`, `:210`, M11 and M11b confirm | - |
| lock strength on `users` in `consume` (bounds 2), verified at a9ebfbf + working tree | `portal.service.ts:199` | not stronger than `no key update` C94 `portal-cutoff.test.ts:265`, M3 confirms · not weaker C94 `:288`, M10 confirms; `for share` dies at C32, M10b carried | - |
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

No row has `Unproven` filled. Every enumeration of `Surface`, `Relations` and `Landing` was untouched since round 10.

## Test policy rows

The third row was rejudged, the only one unmet in round 10, and verified at a9ebfbf + working tree. The first, second and sixth are `carried from a9ebfbf + round 10`; the others are `carried from 5881ed0`, except the seventh, `carried from cf26676`. No file they classify changed since round 10.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Eligibility with many conditions | `portal.service.ts` `firstAccessDecision` | service table C89 · boundary C20, C21 | yes - outside the diff |
| State derived from two tables | `portal.service.ts` `portalState` | pure C90 · boundary C26 | yes - outside the diff |
| Route that decides, over HTTP, with role cut and trail (`auth-rbac`: one case per line of the decision table) | `portal.controller.ts`, `me.controller.ts`, `photos.controller.ts`, `students.controller.ts`, `students.service.ts` `inactivate`, `consume` behind `portal.controller.ts`, `auth.controller.ts` `login`, `verifyTwoFactor`, `confirm`, `disable`, `changePassword`, `users.controller.ts` `resetPassword`, `users.service.ts` `changeOwnPassword`, `resetPassword`, `dropSessionsIfPasswordChanged`, `dropPendingTwoFactor` | C16 to C83, C93, C94 | yes - statuses, bodies and trail: `portal-cutoff.test.ts:681`, `:682`; the `currentPassword` and `password` lines `:806`, `:876`; the line "hash changed while the request hashed" of `resetPassword`, `users.service.ts:149`-`:150`, now has its case, `portal-cutoff.test.ts:864`, X1 and X3 die there; the `200` paths by the whole API suite |
| Database constraint | `0013_portal.sql` | C1 to C5 | yes |
| Count in a window | `lead-throttle.ts` | module C88 · boundary C23, C40 | yes |
| Side effect after commit | `portal.service.ts` `deliver` | capture C17, C18, C38; outside the diff | yes |
| Screen against the `FakeApi` | `minha-conta`, public pages, ficha | C27, C28, C36, C37, C42, C47 to C50, C56, C67, C68 | yes |
| Stack through `psql` | `tests/stack/compose.test.ts` | C92 | yes |

## Faults injected

Verified at a9ebfbf + the changed files, in `git worktree add --detach %TEMP%\r11w HEAD`, with the six files of `git diff --name-only a9ebfbf` under `apps` copied in, four directory junctions for `node_modules` (root, `apps/api`, `packages/database`, `packages/contracts`), and `globalSetup` removed from `vitest.config.ts` in the scratch only. No `pnpm` command ran in the scratch; tests ran with `node node_modules\vitest\vitest.mjs` from `apps\api`. Green baseline first: `portal-cutoff` and `portal-password`, 51 of 51. Each fault was one run of the proofs covering it, the source restored by script between runs and checked byte for byte against the real tree at the end. The five-fault cap of `verify.md` does not apply: all were requested.

Isolation: `git status --porcelain` of the real tree identical before and after, twelve lines, MD5 `A92978788B239C9430E1A70BCC3E4CD0`, taken before this file was written, so this report is the only change; `git diff a9ebfbf -- apps` kept the same hash, MD5 `BF96FFE56BAB570E0DC7D52BB50B91EA`; no `git stash`, `reset`, `checkout` or `commit`. Each junction was removed with `cmd /c rmdir` before `git worktree remove --force`. `git worktree list` shows only the real tree. `Test-Path apps\api\node_modules\vitest` is true before and after; no link under `apps\api\node_modules` points at the scratch.

| Mutation | Location | Killed |
| --- | --- | --- |
| X1: `before` read after `hashPassword`, as defined in round 10 | `apps/api/src/users/users.service.ts:149`-`:150` | yes - `apps/api/test/portal-cutoff.test.ts:864`, `expected 204 to be 422`; the other four `reset_password_` proofs pass, as the Handoff says |
| X3, mine: `before` read inside the transaction, after the admins and before the target lock | `apps/api/src/users/users.service.ts:149`, `:157` | yes - `portal-cutoff.test.ts:864`, `expected 204 to be 422`; only that proof fails, so the window has one wall and it holds on a second path |
| X4, mine: hash compared before the target lock | `apps/api/src/users/users.service.ts:158`-`:160` | yes - `portal-cutoff.test.ts:839`, `:875`; `:864` passes, correctly: the commit is already visible there |
| A: `changeOwnPassword` reads and verifies outside the transaction, lock kept | `apps/api/src/users/users.service.ts:179`-`:182` | yes - `portal-cutoff.test.ts:805`, `:816`, `expected 204 to be 422` |
| A2: as in round 9, read outside and no lock | `apps/api/src/users/users.service.ts:178`-`:182` | yes - `portal-cutoff.test.ts:805`, `:816` |
| B: lock removed from `changeOwnPassword` | `apps/api/src/users/users.service.ts:180` | yes - `portal-cutoff.test.ts:805`, `:816` |
| C: target lock removed from `resetPassword` | `apps/api/src/users/users.service.ts:158` | yes - `portal-cutoff.test.ts:839`, `expected 204 to be 422`; the three queued proofs fail at the queue helper, `:197`, `:199`, because the route no longer queues |
| D: hash comparison removed from `resetPassword` | `apps/api/src/users/users.service.ts:160` | yes - `portal-cutoff.test.ts:839`, `:864`, `:875` |
| E: active-admins lock removed from `resetPassword` | `apps/api/src/users/users.service.ts:152`-`:157` | yes - `portal-cutoff.test.ts:903`, `expected 500 to be 200` |
| X8: active admins locked after the target | `apps/api/src/users/users.service.ts:152`-`:158` | yes - `portal-cutoff.test.ts:903`, `expected 500 to be 200` |
| X2: `password_changed` branch dropped from the controller | `apps/api/src/users/users.controller.ts:65`-`:67` | yes - `portal-cutoff.test.ts:839`, `:864`, `:875` |
| L: `no key update` lock removed from `dropSessionsIfPasswordChanged` | `apps/api/src/users/users.service.ts:221` | yes - `portal-cutoff.test.ts:700`, `:721`, `:742`, `:762` |
| F: `forwardCookies` ahead of the check, both routes | `apps/api/src/auth/auth.controller.ts:264`-`:265`, `:288`-`:289` | yes - `portal-cutoff.test.ts:490`, `:504`, `:722`, `expected [ Array(1) ] to deeply equal []` |
| T1: `auth.login_failed` removed from the changed-password branch of `verify` | `apps/api/src/auth/auth.controller.ts:163`-`:164` | yes - `portal-cutoff.test.ts:681` |
| T2: counter reset on that branch | `apps/api/src/auth/auth.controller.ts:162` | yes - `portal-cutoff.test.ts:682` |
| M1: old order, token and user locked in one statement, as in a9ebfbf | `apps/api/src/portal/portal.service.ts:199`, `:214` | yes - `portal-cutoff.test.ts:224`, `:245`, `:311`, `expected 500 to be 422`; `:266`, `expected 204 to be 422`; `:287`, `expected 500 to be 204` |
| M3: `users` locked `for update` | `apps/api/src/portal/portal.service.ts:199` | yes - `portal-cutoff.test.ts:265`, `expected 500 to be 202` |
| M8: `!found` removed | `apps/api/src/portal/portal.service.ts:215` | yes - `portal-cutoff.test.ts:311`, `expected 500 to be 422` |
| M10: `users` locked `for key share` | `apps/api/src/portal/portal.service.ts:199` | yes - `portal-cutoff.test.ts:288`, `expected 500 to be 204` |
| M11: clause becomes `found.studentStatus !== 'active'` | `apps/api/src/portal/portal.service.ts:215` | yes - `apps/api/test/portal-password.test.ts:202`, `expected 422 to be 204` |
| `dropPendingTwoFactor` out of `consume` and of the check, `2fa-attempts-` line, check out of `login` and `verify`, D1, D2, hash read late on four routes: carried from a9ebfbf + round 9 | `auth.controller.ts`, `users.service.ts`, `portal.service.ts` | yes - carried; those lines did not change since |
| M2, F12, F14, F12+F12b, M2b, M7, M9, M10b, M12: carried from a9ebfbf + rounds 6 and 7 | `apps/api/src/portal/portal.service.ts` | yes - carried |
| C1, C2, X1, X2 of round 8: carried from a9ebfbf + round 8 | `apps/api/src/users/users.service.ts`, `apps/api/src/auth/auth.controller.ts` | yes - carried |
| F13, F6, F6b, F6c, F6d, F10, F11: carried from a9ebfbf + round 5 | `apps/api/src/students/students.service.ts` | yes - carried |
| F1, F7, F8, F9: carried from cf26676; F2 to F5: carried from 5881ed0 | see round 1 and round 2 | yes - carried |

F12b and M2c were not rerun: their classifications are accepted (`checks.md:534`). The two scratch runs on the mock (`mock_removed`, `no_mock_r10_tree`) are test edits, not production faults, so they are in the mechanism table at the top and not here.

`carried from a9ebfbf + round 10`, from here to the Gate section: no production line changed since, and the probes were not rerun. Citations of `checks.md` were refreshed.

**Deadlocks: what I tried.** Each row in the probes below is `pg_stat_database.deadlocks` read before and after the stats delay, on the row held `FOR UPDATE` until both requests were in `Lock`, unmodified code. By reading: `no key update` does not conflict with the audit `FOR KEY SHARE`, so `changeOwnPassword` needs nothing another holder has, and it only ever locks its own row. `resetPassword` takes the admins in `key share` by `id` before the target, the order of `update`, and only `FOR UPDATE` or a key update conflicts with that; the sole transaction taking `FOR UPDATE` on admins is `update` itself, which takes them first.

| Probe (order in the queue) | Statuses | `deadlocks` raised |
| --- | --- | --- |
| `PATCH /api/users/:id` same admin, ahead of `PUT /api/users/:id/password` | `200`, `204` | 0 |
| `PATCH` by another admin, ahead of the `PUT` | `200`, `204` | 0 |
| the `PUT` ahead of `PATCH` by another admin | `204`, `200` | 0 |
| the `PUT` on an admin target ahead of `PATCH`, and the reverse | `204`, `200`; `200`, `204` | 0, 0 |
| two admins resetting each other | `204`, `204` | 0 |
| `DELETE /api/users/:id/two-factor` and the `PUT`, both orders | `204`, `204` both | 0, 0 |
| `PUT /api/auth/password` and `PATCH /api/users/:id`, both orders | `204`, `200`; `200`, `204` | 0, 0 |
| an admin's own `PUT` ahead of `PATCH` of a third user, which locks that admin | `204`, `200` | 0 |
| own `PUT` and administrator's `PUT`, both orders | `204`, `422` both | 0, 0 |
| own `PUT`, administrator's `PUT` and `PATCH` together on one admin row | `204`, `422`, `200` | 0 |
| administrator's `PUT` and `DELETE /api/students/:id`, both orders | `204`, `204` both | 0, 0 |
| administrator's `PUT` and `PATCH /api/students/:id` of the e-mail, which takes a key update, both orders | `204`, `200`; `200`, `204` | 0, 0 |
| anonymization ahead of the administrator's `PUT` | `204`, `422` | 0 |
| `POST /api/password-reset` ahead of the administrator's `PUT` | `202`, `204` | 0 |
| own `PUT` and `DELETE /api/students/:id`, both orders | `204`, `204` both | 0, 0 |
| own `PUT` ahead of `POST /api/password-reset` | `204`, `202` | 0 |
| own `PUT` and `PATCH /api/me/profile`, both orders | `204`, `200`; `200`, `204` | 0, 0 |
| own `PUT` ahead of `PATCH` of the e-mail | `204`, `200` | 0 |
| 24 ungated races, below | - | 0 |
| `DELETE /api/students/:id` by an admin ahead of `PATCH /api/users/:id` on that student's user: not a `PUT` | `204`, `500` | **1**, now recorded as open at `checks.md:538` |
| `DELETE /api/users/:id/two-factor` ahead of `PATCH /api/users/:id`: the shape the Handoff records as unchanged | `204`, `500` | **1**, as recorded |

**Lock changes judged:** no lock change of round 10 raises `deadlocks`. The last two rows are the audit shape on routes that diff does not touch, both reproduced to know the edge of the claim.

**Interleavings on the unmodified code**, scratch probes:

| Interleaving | Statuses | Result |
| --- | --- | --- |
| `PUT /api/auth/password` and `consume` started together, 12 runs, no gate | `422`, `204` in all 12 | link password `200`, `PUT` password `401`, in all 12 |
| `consume` and `PUT /api/users/:id/password` started together, 12 runs, no gate | `204`, `422` in all 12 | link password `200`, `PUT` password `401`, in all 12 |
| login in flight across `PUT /api/auth/password` | `204`, `401` | 0 sessions, the session the `PUT` keeps included, as round 9 |
| login between the `delete` of `PUT /api/auth/password` and its commit | `204`, `401`, no cookie | 0 sessions: the second open item of round 9 is closed, by test and not only by reading. Round 9: `200`, 2 sessions. The kept session falls with it, the safe side |
| same, `PUT /api/users/:id/password` | `204`, `401` | 0 sessions |
| `verify` at the same point of `PUT /api/auth/password` | `204`, `401` | 0 sessions, profile `401` |
| `verify` after `PUT /api/auth/password` and after `PUT /api/users/:id/password` | `204`, `200` both | profile `200`: the open item of `checks.md:537`, confirmed |
| two `PUT /api/auth/password` together | `204`, `422` | the first password `200`, the second `401`: in round 9's code the last one won |
| administrator's `PUT` behind the `consume` of a `first_access`, no account before | `204`, `422` | link password `200`, `PUT` password `401`; `null` against a hash compares as changed |
| administrator's `PUT` sequentially after `consume` | `204`, `204` | the `PUT` password `200`: a later act by an administrator, not a route defeating `consume`, and the same outcome the plan's `Impact` limits to "enquanto o pedido esperava" |
| 40 wrong `PUT /api/auth/password` on one session, with a second session reading `GET /api/auth/session`, for the cost of verifying the password under the lock, which the Handoff records | all `422`, 1.7 s | reader 2 ms to 3 ms before, peak 368 ms during, on the test Argon2. No failure; the check under the lock holds a pool connection for one verification each |

**Other routes against `consume`.** All `auth.api.*` calls: 8, unchanged. `enable` writes no session and no password; `confirm` and `disable` have the check; the only writers of the password are in the Coverage facts. I found no route left that defeats `consume`.

**The Handoff, read against the code, verified at a9ebfbf + working tree.** `checks.md:538` is accurate: no production change, measured by hash; the window has no database statement, so `gate()` cannot reach it; the mock and `hashes.before` are as it says; with X1 the new proof fails with `expected 204 to be 422` and the other four `reset_password_` proofs pass, reproduced; without it all five pass. Its open item is the `inactivate` deadlock, matches the code, and is a recorded open item, not a failure.

## Gate

`py -3 C:/Users/Admin/.claude/skills/tlc-spec-lean/scripts/validate_verification.py portal-aluno --root C:/Users/Admin/projetos/academia-bairro` - exit 0: 0 errors, 0 warnings.

Proofs: 141 tests passed, 0 failed, from 140 Proof lines (contracts 3, database 5, repo 1, api 111, web 20, stack 1). Beyond the Proof lines, the whole API suite on the real tree, `pnpm --filter "./apps/api" test`: 883 passed, 0 failed, 95 files, exit 0, coverage 96.61% of lines and 94.1% of branches.

## Decisions for the user

- **Rounds past the bound.** Rounds 4 to 11 all went past the three of `verify.md`, each with recorded authorization.
- **The `inactivate` shape:** stays open by `checks.md:538`; closing it needs a production change, which this round did not have.
- **Commit.** Nothing is committed; the green above is of the working tree on `a9ebfbf`, and a commit is the user's call.

## Open findings (do not change the verdict)

- **`STATE.md`:** the recorded state of the feature is behind this round, and `.specs/ROADMAP.md:28` may be too. Both out of this round's edit scope.
- **Deadlock on the `users` audit shape, recorded at `checks.md:538`:** `DELETE /api/students/:id` by an admin against `PATCH /api/users/:id` on that student's user, `deadlocks` +1 and `500` on the `PATCH`, whose normal answer is `404`. `inactivate` holds the user and then `audit` asks `FOR KEY SHARE` on the actor, `apps/api/src/students/students.service.ts:274`, while `update` holds the admins and waits for the user, `apps/api/src/users/users.service.ts:115`-`:116`. By reading, `PATCH /api/students/:id` of the e-mail and the anonymization share it, not probed; the Handoff names only `inactivate`. Carried from a9ebfbf + round 10.
- **`verify` after a `PUT`:** recorded as open at `checks.md:537`, `:538`, older than this feature.
- **A `PUT` in flight when the ficha goes `inactive`:** own and administrator's `PUT` queued behind `DELETE /api/students/:id` answer `204` and change the password of a disabled user. The user stays inactive and the sessions gone, so no access follows; no check speaks of it. Carried from a9ebfbf + round 10.
- **Orphan attempts row:** a wrong code in flight across `consume` rearms `2fa-attempts-2fa-<id>` after the delete (`verify-two-factor.mjs:89`). No session and no challenge; the row lapses in 600 s and no new challenge uses its id. Carried from round 9.
- **Precision gap, C94 login with 2FA:** "nenhuma linha de desafio" is read at `portal-cutoff.test.ts:663`, `:744` by `pendingChallenges`, which filters `value = <user id>` and cannot see the attempts row, whose `value` is a count. The sequential proof at `:562` does read it. Carried from a9ebfbf + round 10.
- **`deadlocks`:** the proofs with a gate or none do not read it, and C94 does not claim it there, the new proof included. The queued lines only ever follow a status that fails first; M12 is the carried witness.
- **An orphan session row:** if `record` throws in `disable` or `confirm` (`auth.controller.ts:263`, `:287`), the check does not run and the new row stays, but no cookie goes out, so no client holds it. Carried from a9ebfbf + round 10.

Carried, from the earlier rounds named:

- **The loop at `apps/api/test/portal-password.test.ts:187` stops at the first case that fails.** Reversed, it dies. Carried from a9ebfbf + round 5.
- **Precision gap, C76:** `checks.md:303` says `user_linked`; the HTTP code is `staff_user_linked` (`apps/api/src/privacy/privacy.controller.ts:76`). Carried from 5881ed0.
- **`DELETE /api/students/:id/photo` also deletes a pending photo:** `checks.md:531` records it as deliberate, without a check. Carried from cf26676.
- **`pendingPhoto.url` to all four profiles:** `checks.md:531` records it as AD-033 behaviour. Carried from cf26676.
- **C26, C45, C59, C60, C86, C91:** the approvals are recorded in `checks.md`; this report cannot confirm them independently. Carried from cf26676.
- **C67's proof runs at the desktop width.** Carried from cf26676.
