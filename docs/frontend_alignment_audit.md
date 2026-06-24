# Frontend ↔ Backend Alignment Audit

Generated: 2026-06-25 | Stack note: this is a vanilla JS/HTML/CSS app — no TypeScript,
no build step, no package.json. "Types" below are documented via JSDoc/runtime checks,
not interfaces.

Legend: ✅ OK · ⚠️ MISMATCH (exists but wrong) · ❌ MISSING (not implemented) · 🏷️ NEEDS RENAME

## Students / core fields
- ✅ `is_reported_back` already absent everywhere (no display, form, filter, or payload references). `js/students.js`.
- ✅ `PATCH .../set-reported-back` endpoint not called anywhere — nothing to delete.
- ✅ `has_sibling_enrolled`, `sibling_student_name`, `sibling_student_id` correctly read/displayed/sent. `js/students.js:519-521,656-665,1510-1512,1647-1649`.

## Sibling Groups
- ❌ `POST /api/receivables/sibling-groups/` (create group + `student_ids[1-3]`) — not implemented at all.
- ❌ `POST /api/receivables/sibling-groups/{id}/add-student/{student_id}` — not implemented.
- Action: build new single-form UI (multi-student picker, optional group name) + service calls.

## Fee Invoices
- ⚠️ Existing invoice CRUD uses **old paths**: `GET/POST /api/invoices/`, `PATCH /api/invoices/{id}`, `POST /api/invoices/{id}/void`, `POST /api/finance/invoices/bulk` (`js/finance.js:564,803,890,681,1025`). Contract wants `/api/receivables/fee-invoices` (+ `/issue`, `/cancel` instead of `/void`).
- ❌ `POST /api/receivables/fee-invoices/generate` (single) — missing.
- ❌ `POST /api/receivables/fee-invoices/generate-bulk` — missing, including bulk modal UI.
- Action: repoint existing invoice CRUD to new paths/verbs, add generate + generate-bulk UI/service calls.

## Student Fee Assignments
- ❌ Entire feature missing: `GET/POST /api/receivables/student-fee-assignments/`, `GET/DELETE .../{id}`. No grid exists.
- Action: net-new feature — build grid + CRUD calls.

## Discount Policies
- ⚠️ Discount Setup UI exists (`js/finance.js:1082-1230`) but calls `/api/finance/discount-setup/` instead of contract path `/api/receivables/setup/discount-policies`. Fields used (`discount_account_id`, `first/second/third/fourth_child_percentage`) need verification against actual `DiscountPolicy` schema (contract doesn't give the full field list — only endpoint paths) — flagged for confirmation before changing field names blindly.

## Transport — Buses
- ❌ No bus management UI exists at all (`transport.js` "Vehicles" view is a "Coming Soon" placeholder, `dashboard.js:543`). No `POST/GET/PUT/DELETE /api/buses/` calls.
- Action: net-new — build bus create/edit/list with `id` as a required text (plate) field, read-only on edit.

## Transport — Routes
- ✅ `POST/GET/PUT/DELETE /api/routes/` paths correct, trailing slashes present, `route_id` handled as string (`js/transport.js:58,171,203-205,360`). The "previously broken" route save bug is **not currently reproducible** from the code — `API_BASE` already includes `/api` (`config.js:3`) and the URL composes correctly. Needs manual re-test to confirm whether the bug is already fixed or environment-specific.
- ❌ `POST/DELETE /api/buses/{bus_id}/routes/{route_id}` (bus↔route assignment) — missing (depends on Buses feature above).

## Transport Pricing
- ⚠️ Pricing currently lives as flat fields on the Route object (`two_way_price`, `one_way_morning_price`, `one_way_evening_price`, `daily_rate` — `transport.js:85-88,352-357`), not as a separate `TransportPricing` sub-resource. Contract wants `GET/POST /api/routes/{route_id}/pricing/` + `PUT/DELETE .../{id}` with `{direction, price}` rows.
- Action: replace embedded price fields with a pricing sub-table UI + CRUD calls. `direction` enum already used correctly elsewhere (`students.js:1664-1666`).

## Transport report
- ❌ `GET /api/student-routes/report` missing; current code filters students client-side via `GET /students/?transport_route_id=`. Needs repointing once confirmed this new endpoint returns equivalent/better data.

## HR — Pay Grades
- ❌ No Pay Grade CRUD UI implemented at all (dashboard has a dead nav entry `payroll-pay-grades`, `dashboard.js:725-726`). Cannot have wrong `ranks[]"` UI because there's no UI yet.
- Action: net-new — build Pay Grade list/create/edit with single `base_salary` field (no ranks).

## HR — Employee Service Profile — ✅ FIXED
- Removed `rank` field entirely from `hr-esp-form.js` (dropdown, validation, payload), `payroll.js` listing, `hr-edit.js`/`hr-add.js` service-profile sub-tables.
- Flattened `sheltered_from_paying.{paye,nhif,shif,nssf,housing_levy,pension}` to top-level `sheltered_paye/shif/nssf/housing_levy` per contract; `nhif`/`pension` checkboxes and fields deleted outright.
- `basic_salary` (renamed from `amount`) is now a direct editable number input instead of a read-only pay-grade+rank auto-calc.
- Note: `js/hr.js` contains an old duplicate of this same form with `rank`/`sheltered_from_paying` still present, but **`hr.js` is not loaded by `index.html`** (superseded by hr-list/hr-add/hr-edit/hr-esp-form.js) — dead code, left untouched.
- Note: `hr-add.js`/`hr-edit.js` Basic tab has an unrelated `Employee.rank` field (job rank, posted to `/employees/{id}/`, not `/employee-service-profiles/`). The contract never defines the `Employee` model, so this is out of scope — left untouched.
- Bank accounts sub-object uses `bank_id`/`account_details` while the contract's `ServiceProfileCreate.bank_accounts` shows `{account_no, financial_institution_id, percentage}` — not in the contract's explicit breaking-changes list, so left as-is pending confirmation (changing it would drop the `account_details` free-text field with no replacement).
- Endpoint paths already correct: `/api/payroll/employee-service-profiles/`.

## Branches
- ✅ No `/api/branches` calls, no branch selector UI found. `branch_id`/`branch_name` field usage in Cohort Term Planner payload (`students.js:4837`) is fine per contract (field persists, always null).
- Minor: stray non-Branch-concept text mentioning "branch" (bank branch text, "Main Branch" label) is unrelated and should NOT be touched.

## Cohort Term Planner rename
- 🏷️ Internal function names `loadCohortSessionPlannerView()`, `loadCohortSessionPlannerFormView()` (`students.js:4361,4548`) — rename to `...CohortTermPlanner...`.
- 🏷️ Permission/route key `'cohort-session-planner'` / label "Cohort Session Planner" still present (`roles.js:246`, `dashboard.js` route alias ~366,436-448) alongside the correct `'cohort-term-planner'` key — remove the stale alias/dupe, keep one canonical key.
- 🏷️ Section header text "COHORT SESSION PLANNER" (`students.js:4313`) — rename to "Cohort Term Planner".
- ✅ API endpoint already correct: `/cohort-term-planner` (`students.js:4431,4844-4845`).

## PaymentMethod (legacy `Payment`, not `FinReceipt`)
- ⚠️ "Receive Payment" form dropdown (`js/finance.js:2335-2339`) uses `Cash`/`Bank Transfer`/`Cheque`/`Mobile Money`/`Other` — needs investigation: contract's restricted `PaymentMethod` enum (`BANK_TRANSFER`/`MPESA` only) is for the **legacy Payment model**, while `ReceiptPaymentMethod` (cash/bank_transfer/mpesa/cheque/card) is for `FinReceipt` and legitimately keeps cash/cheque. Need to confirm which backend model this specific "Receive Payment" screen posts to before deciding whether to strip Cash/Cheque/Mobile Money/Other or leave as-is — flagged for confirmation, not yet changed.

## Routing/sidebar
- ✅ No `/branches` route or nav item to remove.
- 🏷️ Remove stale `cohort-session-planner` route alias (see above).

---

## Decisions (confirmed by user, override contract where noted)
1. **PaymentMethod is stricter than the contract states.** The contract only restricts the legacy `Payment` model to BANK_TRANSFER/MPESA and leaves `ReceiptPaymentMethod` (FinReceipt) unchanged. Per direct user instruction, **both** enums lose cash/cheque: `ReceiptPaymentMethod` is also trimmed to `bank_transfer`/`mpesa` only (card and cash dropped too).
2. **"Receive Payment" dropdown (`js/finance.js:2335-2339`) posts to FinReceipt** — confirmed by user. Its options (`Cash`/`Bank Transfer`/`Cheque`/`Mobile Money`/`Other`) must be trimmed to Bank Transfer + M-Pesa only, consistent with decision #1.
3. **Discount Policy fields** — keep existing field names (`discount_account_id`, `first/second/third/fourth_child_percentage`), only repoint the URL to `/api/receivables/setup/discount-policies`.
4. **Route "save was broken" bug** — code already looks correct; treating as already-fixed/non-reproducible, will revisit if it recurs.
5. **Net-new scope** — build everything: Sibling Groups rewrite, Bus management, Transport Pricing, Pay Grade CRUD, Student Fee Assignments, Invoice generate/generate-bulk.
