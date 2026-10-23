# Pré-cadastro verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: 6e67520..e4c114d
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

One check is half unproven: C96 says an `admin` without 2FA is blocked on the two staff routes
"e não nas seis públicas", and no proof anywhere asserts the second half. The other 107 checks
are proven at `e4c114d` with located assertions, the five injected faults were all killed, and
the three Test policy rows are met. Two precision gaps in the checks are listed at the end; they
do not change the verdict on their own.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| none - `plan.md` marks no external binding design source (Sources lists the user request, `STATE.md` ADs and the `planos-matriculas` plan as format) | n/a | none | - |

The doors were read as the authority for the door set: `STATE.md` AD-107 to AD-117, plus AD-017,
AD-020, AD-025 and AD-084 where the doors cite them. No check contradicts a door as the doors
now stand. That includes AD-115 as corrected on 2026-10-23: `admin` and `reception` convert,
which C51, C56 and C64 follow.

## Checks

Proof runs, all at `e4c114d`, each batched per target. Every named test appears individually in
the output as passed, and each name was found in the tree with `grep -n` (one hit per name).
- API: `pnpm --filter "./apps/api" exec vitest run <18 files> -t "<72-name alternation>"`: exit 0, `Tests 72 passed | 81 skipped`, 72 distinct `✓` lines.
- Database: `pnpm --filter "./packages/database" exec vitest run test/leads.test.ts -t "<6 names>"`: exit 0, 6 passed.
- Contracts: `pnpm --filter "./packages/contracts" exec vitest run test/leads.test.ts -t "lead_schemas_accept_and_reject"`: exit 0, 1 passed.
- Repo: `pnpm --filter "./tests/repo" exec vitest run repo.test.ts identidade.test.ts -t "<5 names>"`: exit 0, 5 passed.
- Web: `pnpm --filter "./apps/web" exec playwright test <9 files> -g "<27-name alternation>" --reporter=list`: exit 0, `27 passed`, 27 `ok` lines.
- Stack: `pnpm --filter "./tests/stack" exec vitest run compose.test.ts -t "lead_submitted_confirmed_and_listed_through_real_stack"`: exit 0, 1 passed.

C7's second proof, `actions_written_equal_contract_vocabulary`, matches `ten_actions_written_equal_contract_vocabulary` as a substring. That is the only test with the name, and it ran.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `leads` defaults, no identity columns, `phone NOT NULL` | database batch, `leads_table_defaults_and_no_identity_columns` passed | `packages/database/test/leads.test.ts:103` - `expect(columns, forbidden).not.toContain(forbidden)`; `:111` - `expect(row!.id).toMatch(UUID_V7)`; `:122` - `expect(failure.code).toBe(NOT_NULL_VIOLATION)` | PASS |
| C2 | status/source/consent CHECKs and FK, count unchanged | database batch, `leads_status_source_and_consent_checks` passed | `packages/database/test/leads.test.ts:153` - `expect(failure.code, label).toBe(code)` over the 9 refused rows at `:135-143`; `:154` - count equal to before | PASS |
| C3 | converted iff `student_id`, FK without cascade | database batch, `converted_iff_student_id_and_student_fk_without_cascade` passed | `packages/database/test/leads.test.ts:167` and `:174` - `toMatchObject({ code: CHECK_VIOLATION, constraint: 'leads_converted_iff_student_id' })`; `:188` - `expect(deleted.code).toBe(FOREIGN_KEY_VIOLATION)`; `:189-190` - both rows unchanged | PASS |
| C4 | one open lead per e-mail, six combinations | database batch, `one_open_lead_per_email_six_combinations` passed | `packages/database/test/leads.test.ts:217` - `toMatchObject({ code: UNIQUE_VIOLATION, constraint: 'leads_one_open_email_idx' })`; `:210` - accepted cases add one row | PASS |
| C5 | unique hash, cascade, throttles key | database batch, `verifications_cascade_unique_hash_and_throttles_key` passed | `packages/database/test/leads.test.ts:239` - `UNIQUE_VIOLATION`; `:242-243` - own tokens gone, other lead's token kept; `:254` - `expect(primaryKey).toEqual([{ columns: ['key'] }])` | PASS |
| C6 | `0012` over populated DB adds three empty tables | database batch, `migration_0012_adds_three_empty_tables_and_keeps_existing_rows` passed | `packages/database/test/leads.test.ts:305` - tables equal before plus the three; `:307` - `toEqual([{ n: 0 }])`; `:309` - owned rows equal before | PASS |
| C7 | 47 actions in order; written set equals vocabulary with `entity` `lead` | API batch, both proofs passed | `apps/api/test/contracts.test.ts:1105` - `expect(AUDIT_ACTIONS.slice(43)).toEqual(['lead.created', 'lead.confirmed', 'lead.status_changed', 'lead.purged'])`; `apps/api/test/audit-auth.test.ts:388` - `expect(written).toEqual([...auditActionSchema.options].sort())`; `:437` - `['lead', id]` per lead action | PASS |
| C8 | lead schemas accept and reject | contracts batch, `lead_schemas_accept_and_reject` passed | `packages/contracts/test/leads.test.ts:14` and `:26` - refusals by path; `:31` - `expect(parsed.email).toBe('ana@example.com')`; `:38` - PATCH refuses `converted`, `New`, `''`; `:54` - `status: 'lead'` refused | PASS |
| C9 | eight keys optional with defaults | API batch, `smtp_and_google_keys_optional_with_defaults` passed | `apps/api/test/env.test.ts:35` - `expect(absent.SMTP_PORT).toBe(587)`; `:43` - blanks undefined; `:48-50` - three accepted shapes | PASS |
| C10 | seven refusals name the variable without the value | API batch, `smtp_and_google_seven_refusals_name_the_variable_without_value` passed | `apps/api/test/env.test.ts:73` - `expect(message, label).toContain(named)`; `:74` - `not.toContain(value)` | PASS |
| C11 | `202 {"status":"pending"}` and a new form row | API batch, `create_202_pending_and_new_form_row` passed | `apps/api/test/leads-create.test.ts:80` - `expect(await response.text()).toBe('{"status":"pending"}')`; `:83` - `toMatchObject({ status: 'new', source: 'form', email: ANA, phone: '11987654321', ... email_verified_at: null })` | PASS |
| C12 | 24 h token hash and the confirm e-mail | API batch, `create_stores_token_hash_and_mails_the_confirm_link` passed | `apps/api/test/leads-create.test.ts:119` - `expect(tokens[0]!.lifetime).toBe('24:00:00')`; `:124-125` - recipient and subject; `:127` - 43 base64url chars; `:130` - `expect(sha256(token)).toBe(tokens[0]!.token_hash)`; `:131-132` - `SITE.name` and the closing line | PASS |
| C13 | field refusals 422 by path, bounds accepted | API batch, `create_fourteen_refusals_422_and_bounds_accepted` passed | `apps/api/test/leads-create.test.ts:162` - `errors...toContain(path)`; `:163` - nothing recorded; `:173` - 10/11 digits and 120 chars `202`. Thirteen cases, all of those the check names; "fourteen" in the name is a miscount the author recorded | PASS |
| C14 | `adult` not `true`: 422 with the minor message | API batch, `adult_not_true_422_with_minor_message` passed | `apps/api/test/leads-create.test.ts:189-192` - `toContainEqual({ path: 'adult', message: 'Menores de 18 anos fazem a matrícula na recepção, com o responsável.' })`; `:193` - nothing recorded | PASS |
| C15 | only the current term version accepted | API batch, `term_version_must_be_the_current_one` passed | `apps/api/test/leads-create.test.ts:213` - `toEqual(['termVersion'])`; `:220` - `consent_term_version: 2` | PASS |
| C16 | resend to open unconfirmed: same row, new token, new mail | API batch, `resend_to_open_unconfirmed_lead_updates_same_row_and_mails_new_token` passed | `apps/api/test/leads-create.test.ts:236` - `toMatchObject({ id: first!.id, name: 'Ana S.', phone: '2133334444' })`; `:241` - `toEqual([true, true])`; `:243` - new mail carries token 2; `:254` - `contacted` case | PASS |
| C17 | resend to confirmed open lead changes nothing | API batch, `resend_to_confirmed_open_lead_changes_nothing_and_mails_nothing` passed | `apps/api/test/leads-create.test.ts:270` - `expect(await rowText(id), status).toBe(before)`; `:272-273` - no token, no mail | PASS |
| C18 | converted, discarded or student e-mail creates a new lead | API batch, `converted_discarded_or_student_email_creates_new_lead` passed | `apps/api/test/leads-create.test.ts:296` - one new `{ status: 'new', source: 'form' }`; `:297` - previous row unchanged | PASS |
| C19 | three concurrent creates, one open row (as rewritten for batch A) | API batch, `three_concurrent_creates_same_email_one_open_row` passed | `apps/api/test/leads-create.test.ts:307` - `toEqual([202, 202, 202])`; `:309` - `expect(open).toHaveLength(1)` | PASS |
| C20 | honeypot: 202, nothing recorded or counted | API batch, `honeypot_filled_202_and_nothing_recorded_or_counted` passed | `apps/api/test/leads-create.test.ts:320-323` - `202`, `{"status":"pending"}`, `recorded` equal, `mail.sent` empty, for valid and invalid fields | PASS |
| C21 | mail failure or 15 s delay keeps 202 and logs the id without the address | API batch, `mail_failure_or_timeout_keeps_202_and_logs_id_without_address` passed (10.1 s) | `apps/api/test/leads-create.test.ts:341` - `toBeLessThan(2000)`; `:347` - one `lead_mail_failed` line with the id; `:348` - no line with the address | PASS |
| C22 | log transport prints the link only outside production | API batch, `log_transport_without_smtp_prints_link_only_outside_production` passed | `apps/api/test/mail.test.ts:38` - the phrase; `:41` - no `token=` line in production; `:43` - link regex in `test` | PASS |
| C23 | options: `google` and the current term | API batch, `options_200_with_google_flag_and_current_term` passed | `apps/api/test/leads-create.test.ts:368` - `toEqual(['google', 'term'])`; `:371` - `body.term` equals SQL; `:377` - version 2 after insert | PASS |
| C24 | confirm sets `used_at` and `email_verified_at` from the DB clock | API batch, `confirm_200_sets_used_at_and_email_verified_at` passed | `apps/api/test/leads-confirm.test.ts:56-57` - both instants between T0 and T1 | PASS |
| C25 | used or sibling token of a confirmed lead: 200, nothing changes | API batch, `used_token_or_sibling_token_of_confirmed_lead_200_changes_nothing` passed | `apps/api/test/leads-confirm.test.ts:76` - `{"status":"confirmed"}`; `:77` - `recorded` equal | PASS |
| C26 | six invalid tokens 422, token before expiry 200 | API batch, `six_invalid_tokens_422_and_token_before_expiry_200` passed | `apps/api/test/leads-confirm.test.ts:101` - `toContainEqual({ path: 'token', message: INVALID })` with `INVALID` at `:11` = the exact message; `:102` - nothing changed | PASS |
| C27 | used token of an unconfirmed lead: 422 | API batch, `used_token_of_unconfirmed_lead_422` passed | `apps/api/test/leads-confirm.test.ts:120` - `toContainEqual({ path: 'token', message: INVALID })` | PASS |
| C28 | two concurrent confirms, one audit row | API batch, `two_concurrent_confirms_one_audit_row` passed | `apps/api/test/leads-confirm.test.ts:129` - `toEqual([200, 200])`; `:131` - `expect(confirmed).toHaveLength(1)` | PASS |
| C29 | sixth from one IP: 429 with Retry-After, window edge | API batch, `sixth_from_same_ip_429_with_retry_after_and_window_edge` passed | `apps/api/test/leads-throttle.test.ts:30-31` - `429`, `too_many_attempts`; `:50-51` - Retry-After 55..60; `:52-53` - no row, no mail; `:57` - `202` past the window | PASS |
| C30 | fourth for one e-mail, any IP: 429 | API batch, `fourth_for_same_email_any_ip_429` passed | `apps/api/test/leads-throttle.test.ts:73` - `expect429`; `:74` - `toEqual([row])` | PASS |
| C31 | six concurrent from one IP: at most five accepted | API batch, `six_concurrent_same_ip_at_most_five_accepted` passed | `apps/api/test/leads-throttle.test.ts:86` - `toBeLessThanOrEqual(5)`; `:88` - new rows equal accepted | PASS |
| C32 | lead attempts never touch `login_throttles` | API batch, `lead_attempts_never_touch_login_throttles` passed | `apps/api/test/leads-throttle.test.ts:99` - `toEqual([])`; `apps/api/test/support/stack.ts:65` - login `toBe(200)`; `apps/api/test/leads-throttle.test.ts:104` - both keys in `lead_throttles` | PASS |
| C33 | public writes under the origin check | API batch, `lead_public_writes_under_origin_check` passed | `apps/api/test/csrf.test.ts:157` - `toBe('csrf_rejected')` for both routes and both refusals; `:158` - nothing recorded; `:164-167` - same-origin `202` and `200` | PASS |
| C34 | same 202 body and headers for five situations | API batch, `same_202_body_and_headers_for_five_email_situations` passed | `apps/api/test/leads-create.test.ts:403` - each answer equals the first, headers minus `x-request-id` and `date`; `:405` - `202`, `{"status":"pending"}` | PASS |
| C35 | start: 302 with PKCE and the state cookie | API batch, `start_302_to_google_with_pkce_and_state_cookie` passed | `apps/api/test/leads-google.test.ts:117` - exact query keys; `:120-127` - values; `:133-136` - `HttpOnly`, `SameSite=Lax`, `Path=/api/leads/google`, `Max-Age=600`; `:140` - S256 challenge of the stored verifier | PASS |
| C36 | without keys: `google: false` and three 404 | API batch, `without_google_keys_options_false_and_three_routes_404` passed | `apps/api/test/leads-google.test.ts:149` - `google` `false`; `:152-153` - `404`, `not_found` | PASS |
| C37 | valid callback: 302 ok, state cleared, profile cookie | API batch, `callback_valid_id_token_302_ok_and_profile_cookie` passed | `apps/api/test/leads-google.test.ts:170` - token request body; `:179` - `/matricula?google=ok`; `:180` - `Max-Age=0`; `:183` - profile cookie attributes, for both `iss` values | PASS |
| C38 | ten callback failures: 302 erro, no profile | API batch, `callback_ten_failures_302_erro_without_profile` passed | `apps/api/test/leads-google.test.ts:226` - ten cases; `:241` - `/matricula?google=erro`; `:242` - profile cookie `toBeUndefined()` | PASS |
| C39 | profile 200 with a valid cookie, 404 otherwise | API batch, `profile_200_with_valid_cookie_404_otherwise` passed | `apps/api/test/leads-google.test.ts:251` - `{"name":"Bia Lima","email":"bia@gmail.com"}`; `:254`, `:258`, `:263` - three `404` | PASS |
| C40 | create with the Google cookie: confirmed, `source` google, no mail | API batch, `create_with_google_cookie_confirmed_source_google_no_mail` passed | `apps/api/test/leads-google.test.ts:275` - `{"status":"confirmed"}`; `:278` - cookie e-mail and name, `source: 'google'`; `:281-282` - verified between T0 and T1; `:284` - no mail; `:285` - cookie `Max-Age=0` | PASS |
| C41 | tampered profile cookie treated as absent | API batch, `tampered_profile_cookie_treated_as_absent` passed | `apps/api/test/leads-google.test.ts:297` - `{ source: 'form', email, email_verified_at: null }`; `:298` - mail sent | PASS |
| C42 | Google over an existing open lead confirms the same row | API batch, `google_create_over_existing_open_lead_confirms_same_row` passed | `apps/api/test/leads-google.test.ts:317` - `{ id, source: 'google' }`; `:325` - confirmed row unchanged on the second post | PASS |
| C43 | open leads newest first, same body for three roles | API batch, `list_open_leads_newest_first_same_body_for_three_roles` passed | `apps/api/test/leads-staff.test.ts:44-45` - bodies equal; `:48` - `toEqual([newest, tieHigh, tieLow, older])`; `:49` - nine keys | PASS |
| C44 | filter by four statuses, three invalid 422 | API batch, `list_filter_four_statuses_and_three_invalid_422` passed | `apps/api/test/leads-staff.test.ts:73` - order per status; `:76` - `studentId` only on converted; `:83` - `toEqual(['status'])` | PASS |
| C45 | five transitions 200 by three roles, other columns unchanged | API batch, `patch_five_transitions_200_by_three_roles` passed | `apps/api/test/leads-staff.test.ts:102` - `200`; `:105` - item; `:108` - `without(after, 'status')` equal to before | PASS |
| C46 | six invalid PATCH bodies 422 | API batch, `patch_six_invalid_statuses_422` passed | `apps/api/test/leads-staff.test.ts:119` - `toEqual(['status'])`; `:121` - row unchanged | PASS |
| C47 | PATCH on converted: 409 `lead_converted` | API batch, `patch_converted_lead_409` passed | `apps/api/test/leads-staff.test.ts:130` - `toBe('lead_converted')`; `:132` - row unchanged | PASS |
| C48 | reopen with an open sibling: 409 `lead_email_open` | API batch, `reopen_discarded_with_open_sibling_409_lead_email_open` passed | `apps/api/test/leads-staff.test.ts:144` - `toBe('lead_email_open')`; `:146` - unchanged; `:150` - `200` once the sibling is gone | PASS |
| C49 | instructor 403 without lead data; no session 401 | API batch, `instructor_403_and_no_session_401` passed | `apps/api/test/leads-staff.test.ts:167` - `toBe('forbidden')`; `:168` - no `name`/`email`/`phone`/`items`; `:175` - `unauthorized`; `:177-178` - nothing changed | PASS |
| C50 | PATCH 404 for non-uuid and unknown uuid | API batch, `patch_404_for_non_uuid_and_unknown_uuid` passed | `apps/api/test/leads-staff.test.ts:188-189` - `404`, `not_found` for admin twice and reception once | PASS |
| C51 | admin and reception convert new and contacted | API batch, `create_student_with_lead_id_converts_new_and_contacted` passed | `apps/api/test/leads-convert.test.ts:42` - `201`; `:45` - `toMatchObject({ status: 'converted', student_id: student.id })` | PASS |
| C52 | converted/discarded 409, unknown 422 `leadId` | API batch, `lead_id_converted_discarded_409_and_unknown_422` passed | `apps/api/test/leads-convert.test.ts:60` - `lead_converted`; `:61-62` - no student, lead unchanged; `:69` - `toEqual(['leadId'])` | PASS |
| C53 | two concurrent conversions, one student | API batch, `two_concurrent_conversions_one_student` passed | `apps/api/test/leads-convert.test.ts:83` - `toEqual([201, 409])`; `:85` - `lead_converted`; `:86` - `students + 1` | PASS |
| C54 | student insert failure leaves the lead open | API batch, `student_insert_failure_leaves_lead_open` passed | `apps/api/test/leads-convert.test.ts:97` - `cpf_taken`; `:98` - `{ status: 'new', student_id: null }` | PASS |
| C55 | without `leadId` unchanged | API batch, `create_student_without_lead_id_unchanged` passed; `git diff --stat 6e67520..HEAD -- apps/api/test/students-create*` is empty, and that suite passes in the Gate | `apps/api/test/leads-convert.test.ts:108-109` - keys equal `STUDENT_KEYS`, no `leadId`; `:112` - `leads` untouched | PASS |
| C56 | `hr_finance` converting: 403 (as corrected in batch B) | API batch, `reception_cannot_convert` passed | `apps/api/test/leads-convert.test.ts:122-123` - `403`, `forbidden`; `:124` - lead unchanged | PASS |
| C57 | "Interessados" link only for three roles, to `/leads` | web batch, `leads_link_only_for_admin_reception_hr_finance` ok | `apps/web/e2e/shell.spec.ts:213` - link count `expected ? 1 : 0` per role, instructor `false`; `:215` - `href` `/leads` | PASS |
| C58 | title, filter options and seven columns; first call without `status` | web batch, `title_filter_and_seven_columns` ok | `apps/web/e2e/leads.spec.ts:32` - `Interessados`; `:34` - five options in order; `:36` - `Em aberto` checked; `:39` - `toEqual(COLUMNS)`; `:40` - `listCalls(api)[0]` `''` | PASS |
| C59 | each filter value sends its status | web batch, `filter_sends_each_status` ok | `apps/web/e2e/leads.spec.ts:64` - row shown; `:65` - `toContain(`status=${status}`)` | PASS |
| C60 | labels and São Paulo date-time | web batch, `labels_and_sao_paulo_datetime` ok | `apps/web/e2e/leads.spec.ts:78` - `['Formulário', 'Não', '22/10/2026 10:05', 'Novo']`; `:79` - `['Google', 'Sim', '22/10/2026 23:30', 'Contatado']`; `:82`, `:84` - `Matriculado`, `Descartado` | PASS |
| C61 | empty state in two filters | web batch, `empty_state` ok | `apps/web/e2e/leads.spec.ts:92` - `Nenhum interessado.` visible; `:93` - no `table` | PASS |
| C62 | load error and retry | web batch, `load_error_and_retry` ok | `apps/web/e2e/leads.spec.ts:102` - error text; `:104` - retry button; `:109` - the row after retry | PASS |
| C63 | no session redirects, instructor denied without a call | web batch, `no_session_redirects_and_instructor_denied` ok | `apps/web/e2e/leads.spec.ts:114` - `/login`; `:119` - denial text; `:121` - `listCalls(api)` `toEqual([])` | PASS |
| C64 | row buttons by status and role (as corrected in batch B) | web batch, `row_buttons_by_status_and_role` ok | `apps/web/e2e/leads.spec.ts:152` - button sets per role from the hand-written map at `:134-148`; `:154` - `['Reabrir']`; `:156` - `[]` | PASS |
| C65 | status actions and the discard confirmation | web batch, `status_actions_and_discard_confirmation` ok | `apps/web/e2e/leads.spec.ts:173` - `{ status: 'contacted' }` and no dialog (`:172`); `:177` - dialog names the lead; `:180` - "Voltar" sends nothing; `:185`, `:190` - `discarded` and `new` | PASS |
| C66 | "Matricular" prefills and sends `leadId` | web batch, `matricular_prefills_student_form_and_sends_lead_id` ok | `apps/web/e2e/leads.spec.ts:202` - URL; `:204-206` - three fields; `:213` - `leadId` equals the id; `:225` - no `leadId` without `lead` | PASS |
| C67 | conflict messages | web batch, `conflict_messages` ok | `apps/web/e2e/leads.spec.ts:237` - `Já existe um pré-cadastro em aberto com este e-mail.`; `:245` - `Este interessado já foi matriculado.`; `:246-247` - fields kept | PASS |
| C68 | real SMTP with and without AUTH | API batch, `smtp_transport_delivers_with_and_without_auth` passed | `apps/api/test/mail.test.ts:120` - user/password equal to `auth`; `:121` - `MAIL FROM`; `:122` - `RCPT TO`; `:123` - subject | PASS |
| C69 | "Matricule-se" to `/matricula` with and without session | web batch, `matricule_se_links_to_matricula` ok | `apps/web/e2e/landing.spec.ts:371` - `href` `/matricula`; `:373` - URL after the click | PASS |
| C70 | nine public cases with CSP; no prefix leak | web batch, `matricula_pages_public_with_csp_and_no_prefix_leak` ok | `apps/web/e2e/proxy.spec.ts:149-152` - `200`, same path, no redirect; `:154-155` - `'nonce-` and `form-action 'self'`; `:158` - `toBe(9)`; `:164` - `/matriculas` and `/matricula-x` to `/login` | PASS |
| C71 | form fields, checkboxes and expandable term | web batch, `form_fields_checkboxes_and_expandable_term` ok | `apps/web/e2e/matricula.spec.ts:44-48` - title, three fields, two boxes, "Enviar"; `:50`, `:52` - term hidden, then visible | PASS |
| C72 | client and server validation messages | web batch, `client_and_server_validation_messages` ok | `apps/web/e2e/matricula.spec.ts:64-69` - accessible descriptions; `:70` - `leadPosts(api)` `toEqual([])`; `:76` - API message on "Telefone" | PASS |
| C73 | submit body; pending and confirmed messages | web batch, `submit_sends_body_and_shows_pending_or_confirmed` ok | `apps/web/e2e/matricula.spec.ts:87-88` - `/matricula/enviado`, pending text; `:89-91` - exact body; `:98` - confirmed text | PASS |
| C74 | 429 message keeps the fields | web batch, `too_many_attempts_message_keeps_fields` ok | `apps/web/e2e/matricula.spec.ts:110` - message; `:111-114` - fields kept | PASS |
| C75 | Google link follows the options flag | web batch, `google_link_follows_options_flag` ok | `apps/web/e2e/matricula.spec.ts:121` - `href` `/api/leads/google/start`; `:126` - count `0` | PASS |
| C76 | `google=ok` prefill, `google=erro` message | web batch, `google_ok_prefill_and_google_erro_message` ok | `apps/web/e2e/matricula.spec.ts:135-138` - name and e-mail shown, not editable; `:144-146` - body with the Google name and e-mail; `:151` - profile `404` gives the full form; `:154-155` - error message, empty form | PASS |
| C77 | confirm page posts only on click | web batch, `confirm_page_posts_only_on_click` ok | `apps/web/e2e/matricula.spec.ts:163` - `confirms()` `toEqual([])` after 1 s; `:167` - `{ token: 't1' }`; `:172-173` - invalid-link message and link `href` `/matricula` | PASS |
| C78 | same-origin only, no CSP violation | web batch, `matricula_pages_load_only_same_origin_without_csp_violation` ok | `apps/web/e2e/csp.spec.ts:108` - violations `toEqual([])`; `:110` - origins equal the web origin; `:111` - no console errors | PASS |
| C79 | 375 px, no horizontal scroll | web batch, `mobile_width_no_horizontal_scroll` ok | `apps/web/e2e/matricula.spec.ts:182` - `widths.scroll` equals `widths.client`; `:186` - submit in viewport | PASS |
| C80 | `lead.created` for form and Google | API batch, `created_row_for_form_and_google_with_source_and_status` passed | `apps/api/test/leads-audit.test.ts:82` - `user_id: null, entity: 'lead', entity_id, ip`; `:83` - exact form `diff`; `:91` - one row on Google; `:93` - `"to":"google"` | PASS |
| C81 | `lead.confirmed` without a diff | API batch, `confirmed_row_without_diff` passed | `apps/api/test/leads-audit.test.ts:106` - `toMatchObject({ action: 'lead.confirmed', user_id: null, entity: 'lead', entity_id: leadId, ip, diff: null })` | PASS |
| C82 | `lead.status_changed` on PATCH and on conversion; none when unchanged | API batch, `status_changed_rows_on_patch_and_conversion_none_when_unchanged` passed | `apps/api/test/leads-audit.test.ts:125` - exact `diff`; `:134` - `['student.created', 'lead.status_changed']`; `:142` - same transaction by `xmin`; `:148` - `toEqual([])` | PASS |
| C83 | no row for resends, honeypot, repeat confirm and 4xx | API batch, `no_row_for_resends_honeypot_repeat_confirm_and_4xx` passed | `apps/api/test/leads-audit.test.ts:190` - `auditCount` equal to before across the 21 cases at `:164-184` | PASS |
| C84 | no personal data in any audit column | API batch, `no_personal_data_in_any_audit_column` passed | `apps/api/test/leads-audit.test.ts:218` - no name, e-mail or phone in `to_jsonb`; `:221` - no such key in `diff.fields` | PASS |
| C85 | audit failure: 500, four writes rolled back | API batch, `audit_failure_500_rolls_back_four_writes` passed | `apps/api/test/leads-audit.test.ts:246` - `500`; `:247` - tables unchanged; `:249` - no mail | PASS |
| C86 | retention across six ages | API batch, `purge_six_ages_deletes_four_keeps_two_and_audits_each` passed | `apps/api/test/leads-retention.test.ts:73-74` - four gone with their tokens; `:77` - two unchanged; `:80` - student unchanged; `:85` - `lead.purged` with nulls | PASS |
| C87 | timer at boot, every 60 min, survives a failure | API batch, `timer_runs_at_boot_every_sixty_minutes_and_survives_failure` passed | `apps/api/test/leads-retention.test.ts:101` - still there at 59 min; `:116-117` - one failure line; `:121` - next cycle purges | PASS |
| C88 | four lead labels, order and status detail on `/audit` | web batch, `four_lead_actions_labels_order_and_status_detail` ok | `apps/web/e2e/audit.spec.ts:1036` - four labels; `:1038` - `options.slice(43)` equals the labels; `:1041` - `Situação: Novo → Contatado` | PASS |
| C89 | boots without the eight keys and with them blank | API batch, `boots_without_smtp_and_google_keys` passed (12.2 s, real process) | `apps/api/test/boot.test.ts:402` - `toEqual({ status: 'ok', checks: { database: 'up', storage: 'up' } })` for both cases | PASS |
| C90 | `SMTP_HOST` without `MAIL_FROM` refuses and names it | API batch, `refuses_smtp_host_without_mail_from_naming_it` passed | `apps/api/test/boot.test.ts:418` - status `1`; `:419` - `MAIL_FROM`; `:420` - not the host | PASS |
| C91 | `.env.example` lists eight empty keys with "opcional" comments | repo batch, `env_example_lists_eight_optional_smtp_and_google_keys_empty` passed | `tests/repo/repo.test.ts:574` - `[`${key}=`]`; `:585` - comment contains `opcional` | PASS |
| C92 | `nodemailer` only in the API; motion guard unedited | repo batch, `nodemailer_only_in_api` passed; `motion_is_the_only_added_dependency` (`tests/repo/identidade.test.ts:115`) unchanged in the diff and passes in the Gate | `tests/repo/repo.test.ts:599` - `toEqual(['apps/api/package.json'])`; `:601` - `catalog:`; `:608` - `smtp-server` dev-only | PASS |
| C93 | custody list has `SMTP_PASS` and `GOOGLE_CLIENT_SECRET` | repo batch, `secret_custody_list_includes_smtp_pass_and_google_secret` passed | `tests/repo/repo.test.ts:616` - `expect(listed).toEqual([...])`, eight secrets | PASS |
| C94 | OpenAPI: eight lead routes, contract bodies, `leadId` optional | API batch, both proofs passed | `apps/api/test/openapi.test.ts:164` - each body equals `z.toJSONSchema(schema)`, lead bodies at `:153-155`; `:477` - `toEqual([...surface].sort())`; `:493-494` - `leadId` uuid, not required | PASS |
| C95 | only listed routes answer without a session | API batch, `only_listed_routes_answer_without_session` passed | `apps/api/test/access.test.ts:161-172` - `open.sort()` equals the previous four plus the six lead routes; the `@Roles` half is settled by behaviour in C43, C45 and C49 | PASS |
| C96 | admin without 2FA gets 403 on the two staff routes, "e não nas seis públicas" | API batch, `admin_without_2fa_gets_403_everywhere_else` passed | `apps/api/test/enrollment.test.ts:57` - `two_factor_enrollment_required` for every blocked route, with `'GET /api/leads'` and `'PATCH /api/leads/:id'` in the list at `:115-116`. The six public routes are only excluded by name from `blocked` (`:51`, list at `:8-18`): no proof in the suite sends a 2FA-less admin's request to any public lead route. The guard's early `return true` for `@Public()` (`apps/api/src/access.ts:108`) runs before the 2FA test (`:131`), but moving the 2FA test above it would pass every proof | FAIL - half unproven: 2 of 8 route outcomes asserted |
| C97 | PATCH under the origin check | API batch, `lead_patch_under_origin_check` passed | `apps/api/test/csrf.test.ts:179-180` - `403`, `csrf_rejected`; `:183` - row unchanged; `:186` - accepted with origin | PASS |
| C98 | hostile bodies on `POST /api/leads` | API batch, `lead_create_hostile_bodies` passed | `apps/api/test/hostile-input.test.ts:125-126` - `400 bad_request`; `:129` - `413`; `:134-135` - `422` on `name` | PASS |
| C99 | landing guard unedited; plans CTA href | repo batch, both passed; `git diff 6e67520..HEAD -- tests/repo/identidade.test.ts` touches only `site_content_has_the_door_five_shape` | `tests/repo/identidade.test.ts:110` - `not.toMatch(/fetchApi\|loadDashboard\|\/api\//)`; `tests/repo/repo.test.ts:632` - `toEqual({ label: 'Matricule-se', href: '/matricula' })` | PASS |
| C100 | motion C39 passes without re-recording for the href | web batch, `copy_names_and_focus_order_match_the_baseline` ok (31.7 s) | `apps/web/e2e/motion.spec.ts:878-880` - text, ARIA and focus equal the baseline. The baseline diff has no `matricula`/`#localizacao` line: its edits are the `/audit` options and the "Interessados" link, both recorded in the Handoff and planned in Impact | PASS |
| C101 | 47 everywhere 43 was counted; one label each | API and web batches, both proofs passed; web typecheck in the Gate | `apps/api/test/contracts.test.ts:1315` - `toHaveLength(47)`; `:1318` - `ACTION_LABELS` keys equal the actions; `:1328` - no `toHaveLength(43)` left; `apps/web/e2e/audit.spec.ts:1050-1053` - options equal the 47 | PASS |
| C102 | students form unchanged; no leads read without `lead` | web batch, `new_student_without_lead_does_not_read_leads` ok; the `students.spec.ts` diff only adds this test | `apps/web/e2e/students.spec.ts:812` - no `/api/leads` request | PASS |
| C103 | `id_token` claims table | API batch, `id_token_claims_table_twelve_rows` passed | `apps/api/test/leads-google.test.ts:350-351` - accepted equals the profile, refused `toBeUndefined()`, over the 13 hand-written rows at `:334-346` (one per item the check names) | PASS |
| C104 | signed cookie table, six rows | API batch, `signed_cookie_table_six_rows` passed | `apps/api/test/leads-google.test.ts:368` - six rows; `:371-372` - accepted/refused per row | PASS |
| C105 | throttle module bounds and window edges | API batch, `throttle_module_bounds_and_window_edges` passed | `apps/api/test/leads-throttle.test.ts:109` - `{ ip: 5, email: 3 }`; `:123` - `toBe(3600)`; `:144-145` - 59:59 counted with `retryAfter` 1, 60:01 not | PASS |
| C106 | resend decision table, eight rows | API batch, `resend_decision_table_eight_rows` passed | `apps/api/test/leads-create.test.ts:422` - eight rows; `:436` - `{ status: 'pending' }`; `:440-451` - per-effect assertions written by hand | PASS |
| C107 | real stack: submit, production log, confirm, list (as rewritten in batch B) | stack run passed (13.3 s inside `docker compose up --build --wait`) | `tests/stack/compose.test.ts:1593` - landing `href="/matricula"`; `:1615-1616` - phrase, no `token=`; `:1635` - `{ status: 'confirmed' }`; `:1660` - `Sim`; `:1663` - `new\|true`; `:1664-1667` - `['lead.created', 'lead.confirmed']` | PASS |
| C108 | first 43 actions unchanged | web batch, `first_forty_three_actions_unchanged` ok | `apps/web/e2e/audit.spec.ts:1064` - `options.slice(0, 43)` equals `LABELS.slice(0, 43)`; `:1065-1066` - position 43 is `privacy.settings_updated` | PASS |

## Coverage

Each set was recomputed from its authority: the plan's `Surface` and `Landing` for routes,
statuses and door literals; `STATE.md` AD-107 to AD-117 for the doors; the plan's `Relations`
and Criteria for the enumerations; `stack.api.routes()` (the framework) for the route lists that
`access.test.ts` and `enrollment.test.ts` walk; and `apps/api/src/app.module.ts` for the assembly.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/leads/options` statuses (1) | plan Surface | 200 C23, C35, C36 | - |
| `POST /api/leads` statuses (3) | plan Surface | 202 C11, C40 · 422 C13, C14, C15 · 429 C29, C30 | - |
| `POST /api/leads/confirm` statuses (2) | plan Surface | 200 C24, C25 · 422 C26, C27 | - |
| `GET /api/leads/google/start` statuses (2) | plan Surface | 302 C35 · 404 C36 | - |
| `GET /api/leads/google/callback` statuses (2) | plan Surface | 302 C37, C38 · 404 C36 | - |
| `GET /api/leads/google/profile` statuses (2) | plan Surface | 200 C39 · 404 C36, C39 | - |
| `GET /api/leads` statuses (4) | plan Surface | 200 C43, C44 · 401 C49 · 403 C49 · 422 C44 | - |
| `PATCH /api/leads/:id` statuses (6) | plan Surface | 200 C45 · 401 C49 · 403 C49 · 404 C50 · 409 C47, C48 · 422 C46 | - |
| `POST /api/students` new statuses with `leadId` (3) | plan Surface, door 9 | 201 C51 · 409 `lead_converted` C52, C53 · 422 `leadId` C52 | - |
| Surface out shapes (9 routes) | plan Surface `Out` | options C23 · create C11, C40 · confirm C24 · start C35 · callback C37 · profile C39 · list nine keys C43 · PATCH item C45 · students unchanged C55 | - |
| `403 csrf_rejected` on the new writes (3) | plan Surface preamble, AD-020 | `POST /api/leads` C33 · confirm C33 · PATCH C97 | - |
| `409` codes (2) | plan Impact "contrato" | `lead_converted` C47, C52, C53 · `lead_email_open` C48 | - |
| who reads and marks, by role (4) | plan S5, AD-018 roles | admin, reception, hr_finance C43, C45 · instructor C49 | - |
| who converts, by role (3) | AD-115 as corrected | admin C51 · reception C51 · hr_finance 403 C56 | - |
| public routes answer without a session (6) | plan Surface, framework route list | C95 equality at `access.test.ts:161`, plus C23, C11, C24, C35, C37, C39 | - |
| staff routes without a session (2) | plan Surface | GET C49 · PATCH C49 | - |
| admin-without-2FA outcome on the new routes (8) | C96 claim, framework route list | blocked: `GET /api/leads` C96 · `PATCH /api/leads/:id` C96; not blocked: none of the six | the six public routes not blocked for an admin without 2FA (C96 claim) |
| routes in OpenAPI (8) | plan Surface | C94, `openapi.test.ts:477` over all 8 | - |
| one-way doors (11) | `STATE.md` AD-107 to AD-117 | 1 C1-C4 · 2 C5, C12, C26 · 3 C77 · 4 C29, C32, C105 · 5 C21, C22, C68, C92 · 6 C9, C10, C91, C93 · 7 C35, C37, C38, C103, C104 · 8 C7, C80 · 9 C51, C53, C54 · 10 C86, C87 · 11 C69, C70 | - (literal-level precision gaps in doors 5 and 7, below) |
| `Relations` (3) | plan Relations | lead-tokens C5, C12 · term C2, C11 · student-lead C3, C51 | - |
| one-way constraints in `Relations` (6) | plan Relations | one open per e-mail C4, C19 · four statuses C2 · converted iff student C3 · `data_processing` term C2 · token hash/24 h/single use C12, C26, C27 · token cascade C5, C86 | - |
| `status` values in the DB (4 accepted + 4 refused) | door 1 | C2, table at `leads.test.ts:129-143` | - |
| `source` values in the DB (2 + 3) | door 1 | C2 | - |
| PATCH transitions (5) and refusals (3) | plan S5 | C45 all 5 · C46, C47, C48 | - |
| e-mail situation on resend (8) | plan AC 6-8 | C106 all 8; boundary C11, C16, C17, C18 | - |
| uniform 202 cases (5) | AC 26 | C34 all 5 | - |
| refused tokens (7) | AC 16 | C26 six · C27 one | - |
| Google callback failures (10) | AC 30 | C38 all 10 | - |
| `id_token` claim rows (13 named) | door 7 | C103 all 13 | - |
| signed cookie rows (6) | door 7 | C104 all 6 | - |
| throttle limits and window edges (4 + 2) | door 4 | C29, C30, C105 | - |
| retention ages (6) | door 10, AC 72-73 | C86 all 6 | - |
| env keys (8) and refusals (7) | door 6 | C9, C10, C89, C90 | - |
| mail transports (3) | door 5 | SMTP with AUTH C68 · without AUTH C68 · log C22 | - |
| new audit actions (4) | door 8, contract | C80 · C81 · C82 · C86; all four C7 | - |
| screens (6 incl. students form) | plan Observable | `/matricula` C71-C76, C79 · `/matricula/confirmar` C77 · `/matricula/enviado` C73 · `/leads` C58-C67 · `/audit` C88 · `/students/new?lead=` C66, C67 | - |
| startup config: `MailService`, retention timer, Google routes (one assembly) | `apps/api/src/app.module.ts:159-189` read directly | transport by env `:160`; `LeadRetention` `:159`; Google flag `:173`; booted by C89 and C107 | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decision on third-party input, pure (`id_token` claims, cookie signature) | `apps/api/src/leads/lead-google.ts` | own level C103 (13 rows), C104 (6 rows) · boundary C38 (10 outcomes), C37, C39, C41 | yes - one asserted line per table row (`leads-google.test.ts:350-351`, `:371-372`); all ten outcomes at the boundary (`:241-242`) |
| Window count over the database (form limit) | `apps/api/src/leads/lead-throttle.ts` | module with real DB C105 · boundary C29, C30, C31 | yes - both keys either side of the limit, 59:59/60:01 (`leads-throttle.test.ts:123`, `:144-145`); 429 with Retry-After and the race at the boundary (`:50-51`, `:86`) |
| Side effect after commit (e-mail) | `apps/api/src/mail/mail.service.ts`, `leads.service.ts` send path | capture transport C11, C12, C16, C21 · in-process SMTP C68 | yes - success, failure and delay with the 202 kept (`leads-create.test.ts:341`, `:347`); the env values reach the protocol (`mail.test.ts:120-123`) |
| Inherited from `planos-matriculas` (HTTP route with role cut and trail; DB constraint; screen against FakeApi; stack by psql) | lead controllers/service, migration `0012`, `/leads` and `/matricula*` pages, `compose.test.ts` | C43-C56 with C80-C85 · C1-C6 · C57-C79 · C107 | yes |

## Faults injected

Isolated in `git worktree add C:/Users/Admin/projetos/pcv-wt HEAD`, with dependencies from
`pnpm install --frozen-lockfile --offline`. The first try, under the scratchpad, failed on
Windows path length. In this worktree the `esbuild.exe` that the API `globalSetup` runs was
denied writes (node and bash could write there), so the API proofs ran with a scratch-only
`vitest.fault.config.ts`: the repo config without the `dist` build, which none of the four
proofs uses. Each fault was applied alone and reverted with `git checkout -- <file>`, then the
worktree was removed. Real-tree `git status --porcelain` before:
` M .specs/LESSONS.md`, ` M .specs/lessons.json`, `?? .specs/features/motion/verification.md`,
`?? CLAUDE.md`. After: identical (`diff` empty).

| Mutation | Location | Killed |
| --- | --- | --- |
| throttle bound `< ${max}` -> `<= ${max}` (one extra attempt per key) | `apps/api/src/leads/lead-throttle.ts:25` | yes - C29 (`sexto: expected 202 to be 429`) and C105 (`ip 6: expected true to be false`) |
| token expiry `expires_at <= now()` -> `<= now() - interval '1 minute'` | `apps/api/src/leads/leads.service.ts:223` | yes - C26 (`vencido há um segundo: expected 200 to be 422`) |
| `aud` check removed from `profileFromClaims` | `apps/api/src/leads/lead-google.ts:65` | yes - C103 (`aud de outro cliente`) and C38 (`expected '/matricula?google=ok' to be '/matricula?google=erro'`) |
| conversion accepts a `discarded` lead | `apps/api/src/leads/leads.service.ts:72` | yes - C52 (`expected 201 to be 409`) |
| named public branch `=== '/matricula' \|\| startsWith('/matricula/')` -> prefix `startsWith('/matricula')` | `apps/web/src/proxy.ts:35` | yes - C70 (`/matriculas`: expected `/login`, received `/matriculas`) |

## Gate

`pnpm verify` was not used: under turbo it exits 1 here with the known `EPERM mkdir <TEMP>\...\ssr`. Each task was run directly at `e4c114d`, sequentially:

- `pnpm -r --workspace-concurrency=1 run lint` - exit 0
- `pnpm -r --workspace-concurrency=1 run typecheck` - exit 0 (covers the `ACTION_LABELS` part of C101)
- `pnpm -r --workspace-concurrency=1 run build` - exit 0
- `pnpm --filter "./packages/contracts" test` - 17 passed, 0 failed
- `pnpm --filter "./packages/database" test` - 74 passed, 0 failed
- `pnpm --filter "./tests/repo" test` - 79 passed, 0 failed (includes `motion_is_the_only_added_dependency`, C92)
- `pnpm --filter "./apps/api" test` - 781 passed, 0 failed in 86 files; coverage of `apps/api/src` 96.24% lines, 94.12% branches (includes the unedited `students-create` suites, C55)
- `pnpm --filter "./apps/web" exec playwright test` - 433 passed, 0 failed (includes all of `students.spec.ts`, C102)
- C107 stack proof (above) - 1 passed

Total: 1384 passed, 0 failed. The gate is green. The verdict is FAIL because of the C96 coverage gap, not because of the gate.

## Ranked gaps

1. Coverage gap: the six public lead routes are never asserted to stay reachable for an `admin` without 2FA. The check claims it ("e não nas seis públicas"), the proof only filters those routes out by name, and moving the 2FA check above the `@Public()` early return in `AccessGuard` would pass every proof. - C96 - `apps/api/test/enrollment.test.ts:51` (exclusion by name, no response assertion); `apps/api/src/access.ts:108`, `:131`
2. Precision gap, door 5: the 10 s mail timeout (AD-111) is bounded only by the C21 wait, `wait + 2000` with a 15 s delay, which accepts any timeout up to about 13 s. No check fixes 10 s. - C21 - `apps/api/test/leads-create.test.ts:346`
3. Precision gap, door 7: the `Secure` attribute of `lead_google_state` and `lead_google_profile` ("Secure fora de desenvolvimento", AD-113) has no check. C35 and C37 list `HttpOnly`, `SameSite`, `Path` and `Max-Age` only, and every test origin is `http:`. - C35, C37 - `apps/api/test/leads-google.test.ts:133-136`, `:183`
4. Naming, not behaviour: `create_fourteen_refusals...` holds the 13 cases C13 names, and `id_token_claims_table_twelve_rows` holds the 13 rows C103 names. Both are recorded in the Handoff and do not change a result. - C13, C103
