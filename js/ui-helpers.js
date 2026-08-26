// ==================== UI HELPERS ====================
// Shared utilities used across all modules.

// ── Period-lock guard (BE/FE Contract Addendum 2026-08-18 §G) ───────────────
// The locked-period guard that used to live on 3 endpoints now fires from a
// Session.before_flush event on every JE-emitting form. Same 409 shape
// everywhere ("Cannot post: entry_date {date} is in a closed fiscal period
// ..."), so one detector + one renderer keeps every call site consistent.
// Adapted from the addendum's isPeriodLockError(res, body) to this codebase's
// actual error flow, where parseApiError(res) already consumes res.json()
// once and returns the flattened detail string — re-reading res.json() here
// would throw on an already-consumed stream.
function isPeriodLockError(status, msg) {
  return status === 409 && typeof msg === 'string' && msg.startsWith('Cannot post: entry_date');
}
// Only the manual JE form (journal-entries.js) exposes lock_override_reason —
// every other JE-emitting form's fix is "pick a different date," so this is
// a terminal coral message, never paired with a bypass affordance.
function showPeriodLockError(el, msg) {
  const text = msg || 'Cannot post: entry_date is in a closed fiscal period.';
  if (!el) { showToast(text, 'error'); return; }
  el.innerHTML = `<div style="margin-top:10px;padding:10px 14px;border-radius:6px;border-left:3px solid var(--coral-500);background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;">${typeof _finEsc === 'function' ? _finEsc(text) : text}</div>`;
}

// ── Money formatting ─────────────────────────────────────────────────────────
function formatKES(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'KES 0.00';
  return 'KES ' + n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Receipt payment methods ──────────────────────────────────────────────────
// ReceiptPaymentMethod on the wire (verified on the live OpenAPI):
// cash | bank_transfer | mpesa | cheque | card | coop_paybill. coop_paybill
// arrived with Co-op Bank B2B v1.4 (addendum 2026-08-26 §A.5) and is written
// by BOTH the 2023 IPN receiver and the v1.4 pipeline — receipts carrying it
// are created by webhook, never by hand, but the value still has to render
// and filter everywhere the other methods do.
//
// A generic underscore -> Title Case transform mangles this one specifically
// ("Coop Paybill"), so the label comes from the map, not from string surgery.
const RECEIPT_PAYMENT_METHODS = [
  ['cash',          'Cash'],
  ['bank_transfer', 'Bank Transfer'],
  ['mpesa',         'M-Pesa'],
  ['cheque',        'Cheque'],
  ['card',          'Card'],
  ['coop_paybill',  'Co-op Paybill'],
];
const _RECEIPT_METHOD_LABELS = Object.fromEntries(RECEIPT_PAYMENT_METHODS);

function receiptMethodLabel(v) {
  if (!v) return '—';
  return _RECEIPT_METHOD_LABELS[v]
    || String(v).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Inventory quantity/cost formatting (BE/FE Contract Addendum 2026-07-29) ──
// Quantities are 3 DP, unit costs 4 DP — distinct from money's 2 DP, so never
// reuse formatKES() for either; raw .toFixed() also rounds inconsistently for
// large numbers, hence centralising here.
function formatQty(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '0.000';
  return n.toLocaleString('en-KE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
function formatUnitCost(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'KES 0.0000';
  return 'KES ' + n.toLocaleString('en-KE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// ── Relative time (Stock Ledger "last movement" column) ─────────────────────
function formatRelativeTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '—';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? '' : 's'} ago`;
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear} year${diffYear === 1 ? '' : 's'} ago`;
}

// ── Shared Department picker (BE/FE Contract 2026-07-15 §1.4) ──────────────
// Departments is a single shared lookup used by Employee, PaymentVoucher and
// PettyCash. This is the canonical picker for NEW consumers (Employee
// create/edit, HR list filter, send-email filter, PV create) — it is
// deliberately separate from payables.js's _pvDepartmentOptions/_pvDepartments,
// which batch-fetch departments together with ledgers/cost-centers/suppliers
// for the Payables screens already built against that cache.
let _deptOptionsCache = null; // active-only, for pickers
let _deptAllCache = null;     // active + archived, for label resolution

async function loadDepartmentOptions(selectId, selectedId = null) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;
  if (_deptOptionsCache === null) {
    try {
      const res = await apiFetch(`${API_BASE}/departments/?is_active=true`);
      _deptOptionsCache = (res && res.ok) ? _toArray(await res.json()) : [];
    } catch (_) { _deptOptionsCache = []; }
  }
  let list = _deptOptionsCache;
  const hasSelected = selectedId != null && list.some(d => String(d.id) === String(selectedId));
  selectEl.innerHTML = '<option value="">Please Select</option>' +
    list.map(d => `<option value="${d.id}" ${String(selectedId) === String(d.id) ? 'selected' : ''}>${d.name}</option>`).join('');
  // Edge case: editing a record whose department_id points at an archived
  // department — it won't be in the active-only list above. Fetch it
  // directly so the picker shows the truth instead of a blank selection.
  if (selectedId != null && !hasSelected) {
    try {
      const res = await apiFetch(`${API_BASE}/departments/${selectedId}`);
      if (res && res.ok) {
        const d = await res.json();
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.name} (archived)`;
        opt.selected = true;
        opt.disabled = true;
        selectEl.appendChild(opt);
        selectEl.value = String(d.id);
      }
    } catch (_) {}
  }
}

// Pre-fetch once per view (await this before rendering), then resolve
// id -> name synchronously via departmentLabelFor — avoids a lookup per row
// (BE/FE Contract 2026-07-15 §11.2).
async function ensureDepartmentCache() {
  if (_deptAllCache !== null) return;
  try {
    const [activeRes, inactiveRes] = await Promise.all([
      apiFetch(`${API_BASE}/departments/?is_active=true`),
      apiFetch(`${API_BASE}/departments/?is_active=false`),
    ]);
    const active   = (activeRes && activeRes.ok)   ? _toArray(await activeRes.json())   : [];
    const inactive = (inactiveRes && inactiveRes.ok) ? _toArray(await inactiveRes.json()) : [];
    _deptAllCache = [...active, ...inactive];
  } catch (_) { _deptAllCache = []; }
}

function departmentLabelFor(id) {
  if (id == null || id === '') return '—';
  const d = (_deptAllCache || []).find(d => String(d.id) === String(id));
  return d ? d.name : '—';
}

// employeesData (config.js) is only ever populated as a side effect of
// visiting HR ▸ Employee Directory (hr-list.js) — any employee-picker
// dropdown opened first (P9A, Payslips, Salary Deductions/Advances, ...)
// otherwise sees an empty cache. Call this before building such a dropdown;
// it's a one-time fetch per session, not a refresh — loadHrEmployeeDirectoryView
// still does its own unconditional fetch to keep the Directory itself live.
let _employeesCacheLoaded = false;
async function ensureEmployeesCache() {
  if (_employeesCacheLoaded) return;
  try {
    const res = await apiFetch(`${API_BASE}/hr/employees`);
    const list = (res && res.ok) ? _toArray(await res.json().catch(() => [])) : [];
    employeesData.splice(0, employeesData.length, ...list);
    _employeesCacheLoaded = true;
  } catch (_) {}
}

// ── Shared Pay Grade label resolver (BE/FE Contract 2026-07-15 §4.1) ───────
// ServiceProfileRead.pay_grade_id returns an id with no label — pre-fetch
// once per view and resolve locally rather than a lookup per row.
let _payGradeAllCache = null;

async function ensurePayGradeCache() {
  if (_payGradeAllCache !== null) return;
  try {
    const res = await apiFetch(`${API_BASE}/payroll/utilities/pay-grades/`);
    _payGradeAllCache = (res && res.ok) ? _toArray(await res.json()) : [];
  } catch (_) { _payGradeAllCache = []; }
}

function payGradeLabelFor(id) {
  if (id == null || id === '') return '—';
  const g = (_payGradeAllCache || []).find(g => String(g.id) === String(id));
  return g ? `${g.position} — ${formatKES(g.amount)}` : '—';
}

// ── Paginated table renderer ──────────────────────────────────────────────────
// containerId   — id of the wrapping element for the table
// paginationId  — id of the element for pagination buttons (can be null)
// data          — full dataset array
// columns       — array of header label strings, e.g. ['Name', 'Status']
// renderRowFn   — function(item) => HTML string for one <tr>
// state         — object { page, perPage, activeClass } – mutated by this call
// Returns the slice rendered (useful for callers that need it).
function renderPaginatedTable(containerId, paginationId, data, columns, renderRowFn, state) {
  const container = document.getElementById(containerId);
  if (!container) return [];

  const { page = 1, perPage = 10, activeClass = 'fin-pg-active' } = state;
  const total  = data.length;
  const start  = (page - 1) * perPage;
  const paged  = data.slice(start, start + perPage);
  const pages  = Math.max(1, Math.ceil(total / perPage));

  const colHeaders = columns.map(c => `<th>${c}</th>`).join('');
  const colSpan    = columns.length;

  let rows = '';
  if (paged.length === 0) {
    rows = `<tr><td colspan="${colSpan}" class="fin-empty">No records found.</td></tr>`;
  } else {
    rows = paged.map(renderRowFn).join('');
  }

  container.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>${colHeaders}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  if (paginationId) {
    const pgEl = document.getElementById(paginationId);
    if (pgEl) {
      let btns = '';
      for (let i = 1; i <= pages; i++) {
        btns += `<button class="${i === page ? activeClass : ''}"
                         onclick="(${state.__goPage})(${i})">${i}</button>`;
      }
      pgEl.innerHTML = `<div class="fin-pagination">${btns}</div>`;
    }
  }

  return paged;
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
// Insert animated placeholder rows while data loads.
// colCount — number of columns; rowCount — how many skeleton rows to show.
function renderSkeletonRows(containerId, colCount, rowCount = 5) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const cell = `<td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>`;
  const row  = `<tr class="skeleton-row">${cell.repeat(colCount)}</tr>`;
  container.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <tbody>${row.repeat(rowCount)}</tbody>
      </table>
    </div>
  `;
}

// ── CSV export ────────────────────────────────────────────────────────────────
// columns   — array of header label strings
// rows      — array of arrays of cell values
// filename  — e.g. 'student-report.csv'
function exportTableCSV(columns, rows, filename) {
  if (!rows || rows.length === 0) {
    showToast('No data to export.', 'info');
    return;
  }
  const escape = v => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const header = columns.map(escape).join(',');
  const body   = rows.map(r => r.map(escape).join(',')).join('\n');
  const blob   = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = filename || 'export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Bulk CSV/Excel upload ────────────────────────────────────────────────────
// Backed by the real POST /bulk/{module}/upload + GET /bulk/{module}/template
// endpoints (confirmed live via openapi.json). module is one of:
// 'chart-of-accounts', 'fee-invoices', 'journal-entries'.
// refreshFnName — name of a global function to call (no args) after a
// successful import, so the calling page's list re-fetches and shows the
// newly imported rows.
function renderBulkUploadBar(module, refreshFnName) {
  const uid = `bulkup-${module}`;
  return `
    <div class="fin-bulk-upload-bar">
      <input type="file" id="${uid}-file" accept=".csv,.xlsx,.xls" style="display:none;"
             onchange="handleBulkUpload('${module}','${uid}','${refreshFnName || ''}')">
      <button type="button" class="fin-bulk-btn" onclick="document.getElementById('${uid}-file').click()">&#128228; Upload CSV/Excel</button>
      <button type="button" class="fin-bulk-btn" onclick="downloadBulkTemplate('${module}')">&#128196; Download Template</button>
    </div>
    <div id="${uid}-result"></div>
  `;
}

async function handleBulkUpload(module, uid, refreshFnName) {
  const inputEl  = document.getElementById(`${uid}-file`);
  const resultEl = document.getElementById(`${uid}-result`);
  const file = inputEl && inputEl.files[0];
  if (!file) return;

  if (resultEl) resultEl.innerHTML = '<p class="sa-loading">Uploading&#8230;</p>';

  const fd = new FormData();
  fd.append('file', file);

  const res = await apiFetch(`${API_BASE}/bulk/${module}/upload`, { method: 'POST', body: fd });
  if (inputEl) inputEl.value = '';

  if (!res) { if (resultEl) resultEl.innerHTML = ''; return; }
  if (!res.ok) {
    if (resultEl) resultEl.innerHTML = `<div class="sa-toast sa-toast-error">${await parseApiError(res) || 'Upload failed.'}</div>`;
    return;
  }

  const data = await res.json();
  if (resultEl) resultEl.innerHTML = _bulkUploadResultHTML(data);

  if (refreshFnName && typeof window[refreshFnName] === 'function') window[refreshFnName]();
}

function _bulkUploadResultHTML(data) {
  const imported = data.imported ?? 0;
  const skipped  = data.skipped  ?? 0;
  const errors   = Array.isArray(data.errors) ? data.errors : [];
  const esc      = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let html = `<div class="sa-toast ${errors.length ? 'sa-toast-error' : 'sa-toast-success'}">
    Imported ${imported}${skipped ? `, skipped ${skipped}` : ''}${errors.length ? `, ${errors.length} row error(s)` : ''}.
  </div>`;

  if (errors.length) {
    const shown = errors.slice(0, 25);
    html += '<ul class="fin-bulk-error-list">' +
      shown.map(e => `<li>${esc(typeof e === 'string' ? e : JSON.stringify(e))}</li>`).join('') +
      '</ul>';
    if (errors.length > shown.length) html += `<div class="sa-empty-msg">&hellip;and ${errors.length - shown.length} more.</div>`;
  }
  return html;
}

// ── Active WHT schedule lookup (BE/FE Contract Addendum 2026-08-06 §3.3) ────
// Employee create/edit forms need the in-force WHT schedule's payment types
// to populate the consultant payment-type picker. WHTScheduleRead carries
// is_active directly, so no client-side date-range math is needed. Cached
// module-wide for the page session — the addendum only asks that it not be
// re-queried per keystroke, and the active schedule can't change mid-session.
let _whtActiveScheduleCache; // undefined = not fetched yet; null = fetched, none active
async function fetchActiveWhtSchedule() {
  if (_whtActiveScheduleCache !== undefined) return _whtActiveScheduleCache;
  try {
    const res = await apiFetch(`${API_BASE}/payroll/utilities/statutory-rates/wht`);
    const list = (res && res.ok) ? _toArray(await res.json().catch(() => [])) : [];
    const active = list.find(s => s.is_active);
    _whtActiveScheduleCache = active ? { scheduleId: active.id, rates: active.rates || [] } : null;
  } catch (_) {
    _whtActiveScheduleCache = null;
  }
  return _whtActiveScheduleCache;
}
function whtPaymentTypeLabel(key) {
  return String(key || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ── Statutory pipeline fieldset (BE/FE Contract Addendum 2026-08-06 §3.2) ───
// Identical markup on both the Add and Edit Employee forms, so it's rendered
// from one place with an id prefix ('add' | 'edit') rather than duplicated —
// hr-add.js/hr-edit.js stay separate near-duplicate forms otherwise, but this
// fieldset didn't previously exist on either, so there's no established
// duplication to match.
function renderHrTaxProfileFieldset(prefix, s) {
  const isConsultant = s.tax_profile === 'consultant';
  return `
    <div style="font-size:0.78rem;font-weight:600;color:var(--navy-700,#1B3057);text-transform:uppercase;margin:18px 0 10px;">Statutory pipeline</div>
    <div class="hr-radio-row" style="margin-bottom:14px;">
      <label class="hr-form-checkbox-label">
        <input type="radio" name="hr-${prefix}-tax-profile" value="employee" ${!isConsultant ? 'checked' : ''} onchange="toggleHrTaxProfile('${prefix}')"> Employee (default)
      </label>
      <label class="hr-form-checkbox-label">
        <input type="radio" name="hr-${prefix}-tax-profile" value="consultant" ${isConsultant ? 'checked' : ''} onchange="toggleHrTaxProfile('${prefix}')"> Consultant
      </label>
    </div>
    <div id="hr-${prefix}-consultant-fields" class="hr-form-grid" style="display:${isConsultant ? 'grid' : 'none'};">
      <div class="hr-form-group">
        <label class="hr-form-label">Payment Type <span class="hr-required">*</span></label>
        <select id="hr-${prefix}-wht-type" class="hr-form-select"><option value="">Loading&#8230;</option></select>
      </div>
      <div class="hr-form-group">
        <label class="hr-form-label">KRA PIN</label>
        <input type="text" id="hr-${prefix}-consultant-kra-pin" class="hr-form-input" value="${s.consultant_kra_pin || ''}" placeholder="Optional">
        <span style="font-size:0.78rem;color:#888;">Optional. Displayed on fee notes; falls back to "N/A" when blank.</span>
      </div>
      <div class="hr-form-group hr-form-span2">
        <label class="hr-form-checkbox-label">
          <input type="checkbox" id="hr-${prefix}-non-resident" class="hr-form-cb" ${s.is_non_resident ? 'checked' : ''}> Non-resident
        </label>
        <span style="font-size:0.78rem;color:#888;">Non-residents pay the higher WHT rate and are never exempt.</span>
      </div>
    </div>`;
}

function toggleHrTaxProfile(prefix) {
  const checked = document.querySelector(`input[name="hr-${prefix}-tax-profile"]:checked`);
  const sec = document.getElementById(`hr-${prefix}-consultant-fields`);
  if (sec) sec.style.display = (checked && checked.value === 'consultant') ? 'grid' : 'none';
}

// Populates the #hr-{prefix}-wht-type <select> from the in-force WHT schedule.
// No-ops quietly if the element isn't in the currently-rendered tab, matching
// loadDepartmentOptions()'s convention.
async function loadHrWhtPaymentTypes(prefix, selectedValue) {
  const sel = document.getElementById(`hr-${prefix}-wht-type`);
  if (!sel) return;
  const active = await fetchActiveWhtSchedule();
  if (!active || !active.rates.length) {
    sel.innerHTML = '<option value="">No active WHT schedule configured</option>';
    sel.disabled = true;
    const hint = document.createElement('div');
    hint.style = 'background:#FBF3D9;border-left:3px solid var(--gold-500,#C9A227);border-radius:6px;padding:8px 12px;margin-top:6px;font-size:12.5px;color:#5c4a00;';
    hint.textContent = 'No active WHT schedule configured. Ask ops to set up statutory rates under Payroll → Utilities → Statutory Rates.';
    sel.parentElement?.appendChild(hint);
    return;
  }
  sel.disabled = false;
  sel.innerHTML = '<option value="">Please Select</option>' +
    active.rates.map(r => `<option value="${r.payment_type}" ${r.payment_type === selectedValue ? 'selected' : ''}>${whtPaymentTypeLabel(r.payment_type)}</option>`).join('');
}

// Authenticated blob download for any endpoint that streams a file behind
// the Bearer token (a raw <a href> sends no Authorization header and 401s).
// Every download call site in the admin app is migrated onto this: the
// original five (procurement.js _reqDownloadPdf, payroll.js
// _prDownloadRunFile/_prDownloadPayslip, finance.js's two template
// downloaders) plus a later sweep (finance-reports.js _repExport,
// document-approvals.js _daExportPv, transport.js _bsUpDownloadTemplate,
// payables.js _pvPvPrint/_pvWhtDownload, students.js _stuExportSoa).
// Deliberately NOT migrated: parent-portal.js's ppDownloadDocument — the
// parent portal is a separate app/token context (ppToken, its own
// sessionStorage key), not the admin session apiFetch()/authBlobDownload()
// both assume; routing it through here would send the wrong bearer token
// and trigger the admin app's logout() on a 401 instead of the parent
// portal's own handling. It keeps its own fetch() with an explicit
// Authorization header.
//   - options.openInline: window.open() the blob instead of triggering a
//     download (payslip preview never had a real filename/CD parse either).
//   - options.errorPrefix: prefix for the default parseApiError() toast.
//   - options.onError(res): full override when a caller needs custom error
//     handling (e.g. the Tendepay export's JSON affected-employees fix-list).
// Returns true/false so callers can chain success-only follow-up (e.g.
// clearing a previous error banner) without duplicating the ok-check.
async function authBlobDownload(url, fallbackFilename, options = {}) {
  const res = await apiFetch(url);
  if (!res) return false;
  if (!res.ok) {
    if (typeof options.onError === 'function') await options.onError(res);
    else showToast((options.errorPrefix || 'Error: ') + await parseApiError(res), 'error');
    return false;
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const filename = match ? decodeURIComponent(match[1]) : fallbackFilename;
  const objUrl = URL.createObjectURL(blob);
  if (options.openInline) {
    window.open(objUrl, '_blank');
    return true;
  }
  const a = document.createElement('a');
  a.href = objUrl; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(objUrl);
  return true;
}

async function downloadBulkTemplate(module) {
  const res = await apiFetch(`${API_BASE}/bulk/${module}/template`);
  if (!res || !res.ok) { showToast('Could not download template.', 'error'); return; }
  const blob = await res.blob();
  const cd    = res.headers.get('Content-Disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const filename = match ? decodeURIComponent(match[1]) : `${module}-template.csv`;
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
