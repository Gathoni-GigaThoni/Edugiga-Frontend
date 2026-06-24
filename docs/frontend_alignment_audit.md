# Frontend ↔ Backend Alignment Audit

Generated: 2026-06-25 | Stack note: this is a vanilla JS/HTML/CSS app — no TypeScript,
no build step, no package.json. "Types" are documented via JSDoc/runtime checks,
not interfaces. `tsc --noEmit` does not apply; verification was done by reading
code and grepping for stale references.

Legend: ✅ DONE · ⚠️ FLAGGED (left as-is, needs confirmation) · ❌ N/A

## Students / core fields — ✅ DONE (no change needed)
- `is_reported_back` was already absent everywhere (no display, form, filter, or payload references).
- `PATCH .../set-reported-back` was never called — nothing to delete.
- `has_sibling_enrolled`, `sibling_student_name`, `sibling_student_id` correctly read/displayed/sent (`js/students.js`).

## Sibling Groups — ✅ DONE
- Net-new: lookup-by-group-id-or-student + create form added to `js/finance.js` (Finance → Set-up → Sibling Groups).
- Backend exposes no list-all endpoint, only create/get-by-id/add-student — UI matches that (no paginated table).
- `POST /api/receivables/sibling-groups/` (student_ids[1-3], optional name) and `POST .../{id}/add-student/{id}` both wired.

## Fee Invoices — ✅ DONE
- Repointed list/create/update from `/api/invoices/` to `/api/receivables/fee-invoices`.
- `void` action replaced with `issue` (draft→issued) and `cancel` actions.
- Added "Generate Invoice" (single) and "Generate Invoices (Bulk)" modals calling `/generate` and `/generate-bulk`.
- The older class-based "Student Bulk Invoicing" feature (`/finance/invoices/bulk`, not in the contract at all) was left untouched as a separate, pre-existing tool.

## Student Fee Assignments — ✅ DONE
- Net-new grid added (Finance → Student Finance → Student Fee Assignments), filter by student/term, create/delete wired to `/api/receivables/student-fee-assignments/`.

## Discount Policies — ✅ DONE
- Repointed from `/api/finance/discount-setup/` to `/api/receivables/setup/discount-policies`.
- Structural fix: old code treated this as a singleton (PUT with no id in the URL); now lists and PUTs to `.../discount-policies/{id}`, matching the contract's list-based resource.
- Fields kept as-is (`discount_account_id`, `first/second/third/fourth_child_percentage`) per user decision — contract gives no schema for this resource.

## Transport — Buses — ✅ DONE
- Net-new CRUD added (Transport → Utilities → Vehicles), replacing the old "Coming Soon" placeholder.
- `id` is a required text input (registration plate) on create, read-only on edit, matching `Bus.id: string`.
- Wired to `POST/GET/PUT/DELETE /api/buses/{bus_id}`.

## Transport — Routes — ✅ DONE / confirmed
- `POST/GET/PUT/DELETE /api/routes/` paths were already correct (trailing slash, route_id as string). The "previously broken route save" bug was not reproducible from the code — treated as already-fixed per user decision; revisit only if it recurs.
- Bus↔Route assignment added: assign/unassign UI on the Bus edit page, wired to `POST/DELETE /api/buses/{bus_id}/routes/{route_id}`.

## Transport Pricing — ✅ DONE
- Replaced the embedded `two_way_price`/`one_way_morning_price`/`one_way_evening_price`/`daily_rate` fields on Route (which a prior session had empirically verified the live backend required) with a pricing sub-table on the Route edit page, backed by `GET/POST /api/routes/{route_id}/pricing/` + `PUT/DELETE .../{id}` (`{direction, price}` rows).
- **Risk accepted per explicit user decision**: if the live backend still requires the 4 flat fields on `RouteCreate`/`RouteUpdate`, route saving will break again (a previous session hit a 422 under that exact condition). Test route create/update manually after deploy.
- Student enrollment's transport price lookup (`js/students.js`) now reads from a per-route pricing cache fetched from this new sub-resource instead of the old flat fields.
- `daily_rate` has no equivalent in the contract's `TransportDirection` enum and was dropped entirely — there is no "daily rate" pricing option anymore.

## Transport report — ✅ DONE
- "Student Report per Route" repointed from `GET /students/?transport_route_id=` to `GET /api/student-routes/report?route_id=`.
- Contract gives no query-param/response schema for this endpoint — `route_id` query param is a best-effort guess; flagged in code comments to confirm against actual backend response shape.

## HR — Pay Grades — ✅ DONE
- Net-new CRUD added (Payroll → Pay Grades), replacing a placeholder. Fields: `name`, `base_salary` only — no ranks sub-resource.
- Employee Service Profile's previously hardcoded "Grade 1"–"Grade 5" pay grade dropdown now lazily loads real pay grade names from this endpoint.

## HR — Employee Service Profile — ✅ DONE
- Removed `rank` field entirely (`hr-esp-form.js` dropdown/validation/payload, `payroll.js` listing, `hr-edit.js`/`hr-add.js` service-profile sub-tables).
- Flattened `sheltered_from_paying.{paye,nhif,shif,nssf,housing_levy,pension}` to top-level `sheltered_paye/shif/nssf/housing_levy`; `nhif`/`pension` deleted outright (not just renamed).
- `basic_salary` (renamed from `amount`) is now a direct editable number input instead of a read-only pay-grade+rank auto-calc.
- ⚠️ `js/hr.js` still contains an old duplicate of this form with `rank`/`sheltered_from_paying` present, but **`hr.js` is not loaded by `index.html`** (superseded by hr-list/hr-add/hr-edit/hr-esp-form.js) — confirmed dead code, left untouched.
- ⚠️ `hr-add.js`/`hr-edit.js` Basic tab has an unrelated `Employee.rank` field (job rank, posted to `/employees/{id}/`, not `/employee-service-profiles/`). The contract never defines the `Employee` model, so this is out of scope — left untouched.
- ⚠️ Bank accounts sub-object still uses `bank_id`/`account_details` while the contract's `ServiceProfileCreate.bank_accounts` shows `{account_no, financial_institution_id, percentage}`. Not in the contract's explicit breaking-changes list, so left as-is — changing it would silently drop the `account_details` free-text field with no replacement. Needs explicit confirmation before touching.

## Branches — ✅ DONE (no change needed)
- No `/api/branches` calls, no branch selector UI existed. `branch_id`/`branch_name` usage in Cohort Term Planner payload is fine per contract (field persists, always null).

## Cohort Term Planner rename — ✅ DONE
- Renamed `loadCohortSessionPlannerView`/`loadCohortSessionPlannerFormView` → `loadCohortTermPlannerView`/`loadCohortTermPlannerFormView`.
- Removed stale `'cohort-session-planner'`/`'student-cohort-planner'` route aliases in `dashboard.js`, keeping only `'cohort-term-planner'`.
- Fixed permission key in `roles.js` (`cohort-session-planner` → `cohort-term-planner`).
- Fixed section header text in `students.js` ("COHORT SESSION PLANNER" → "COHORT TERM PLANNER").

## PaymentMethod — ✅ DONE
- Per explicit user decision, **both** the legacy `Payment` enum and `ReceiptPaymentMethod` (FinReceipt) are trimmed to `bank_transfer`/`mpesa` only — broader than the contract states (contract only restricts legacy `Payment`, leaves `ReceiptPaymentMethod` with cash/cheque/card).
- "Receive Payment" dropdown (`js/finance.js`, confirmed posts to FinReceipt) now offers only Bank Transfer and M-Pesa.
- Unrelated `salary_disbursement_mode` dropdowns (HR) were left untouched — different enum, not in scope.

## Routing/sidebar — ✅ DONE
- No `/branches` route or nav item existed.
- Stale `cohort-session-planner` route alias removed (see above).

---

## Decisions made during this work (override contract where noted)
1. **PaymentMethod is stricter than the contract states** — both legacy `Payment` and `ReceiptPaymentMethod` lose cash/cheque/card, leaving only bank_transfer/mpesa. User-confirmed, not contract-literal.
2. **"Receive Payment" dropdown posts to FinReceipt** — confirmed by user.
3. **Discount Policy fields** — kept existing field names, only repointed the URL.
4. **Route "save was broken" bug** — treated as already-fixed/non-reproducible.
5. **Transport Pricing** — fully replaced the embedded Route price fields with the contract's sub-resource, accepting the risk that the live backend may still require the old fields (see Transport Pricing section above — test manually).
6. **Net-new scope** — built everything: Sibling Groups rewrite, Bus management, Transport Pricing, Pay Grade CRUD, Student Fee Assignments, Invoice generate/generate-bulk.

## Items intentionally left unresolved (need explicit confirmation, not yet changed)
- ESP `bank_accounts` shape (`bank_id`/`account_details` vs contract's `financial_institution_id`/no `account_details`).
- `student-routes/report` query param/response shape (best-effort guess, not contract-specified).
- `js/hr.js` dead code with old ESP fields — recommend deleting the file outright in a follow-up if confirmed truly unused.
