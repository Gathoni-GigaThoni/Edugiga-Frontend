// ==================== FINANCE MODULE ====================


document.addEventListener('click', () => {
  document.querySelectorAll(
    '[id^="fin-sfs-dd-"],[id^="fin-stmt-dd-"],[id^="fin-inv-dd-"]'
  ).forEach(d => d.style.display = 'none');
});

// ── Shared helpers ────────────────────────────────────────────

function _finEsc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _finFmt(num) {
  const n = parseFloat(num);
  return isNaN(n) ? '' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// renderSplitView shows nothing in the right panel until an item is selected
// unless cfg.renderAdd is provided (see [[frontend-gotchas]]) — several configs
// in this file had onAdd wired but no renderAdd, so there was no visible way to
// reach Add without first selecting an existing record. Two flavors: a real
// "+ Add X" trigger, or an informational redirect for resources that aren't
// directly creatable (e.g. Receive Payments, which only exist via an invoice).
function _finAddPlaceholder(label, action, hint) {
  return el => {
    el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
      <div style="font-size:2rem;margin-bottom:12px">&#128196;</div>
      <p style="font-weight:600;margin-bottom:8px">Add a New ${label}</p>
      <p style="font-size:13px;margin-bottom:20px">${hint || ''}</p>
      <button class="btn-primary" style="padding:10px 24px" onclick="${action}">+ Add ${label}</button>
    </div>`;
  };
}
function _finInfoPlaceholder(message, action, actionLabel) {
  return el => {
    el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
      <div style="font-size:2rem;margin-bottom:12px">&#8505;</div>
      <p style="font-size:13px;margin-bottom:20px">${message}</p>
      <button class="btn-primary" style="padding:10px 24px" onclick="${action}">${actionLabel}</button>
    </div>`;
  };
}

function _finToday() {
  return new Date().toISOString().split('T')[0];
}

// Transaction ledger for a student, straight off GET /students/{id}/fee-statement.
//
// This used to be assembled here from two calls — fee invoices as debits,
// receipts as credits — with the running balance summed client-side. There was
// no third call for credit notes, so an applied CN was invisible: the ledger
// showed the full charge, the cash against it, and a balance that still
// claimed money already forgiven was owed. That is the "Student Fee Statement
// does not pick the CN amount" report, and it was ours, not the backend's.
//
// The endpoint now joins credit notes and returns its own running balance,
// which also carries an opening balance forward — something the local sum
// could never do. The balance column is taken as authoritative; nothing here
// recomputes it.
async function _finBuildLedger(studentId) {
  const res = await apiFetch(`${API_BASE}/students/${studentId}/fee-statement`);
  if (!res || !res.ok) {
    showToast('Could not load the fee statement for this student.', 'error');
    return [];
  }
  const data = await res.json().catch(() => null);
  return _toArray(data?.statement || []).map(e => ({
    date:        (e.date || '').split('T')[0],
    type:        e.type || '',
    reference:   e.reference || '',
    description: e.description || '',
    debit:       parseFloat(e.debit)   || 0,
    credit:      parseFloat(e.credit)  || 0,
    balance:     parseFloat(e.balance) || 0,
  }));
}

function _finFilterLedger(rows, startDate, endDate, asAt) {
  let out = rows;
  const effEnd = asAt || endDate;
  if (startDate) out = out.filter(r => r.date >= startDate);
  if (effEnd)    out = out.filter(r => r.date <= effEnd);
  return out;
}

// 'credit_note' joined 'invoice' and 'receipt' on this wire in the 2026-09-02
// addendum §G. The trailing branch renders an unrecognised value as a plain
// label rather than dropping the row, so a fourth type added later shows up as
// itself instead of looking like a blank line in the middle of a ledger.
function _finLedgerTypePill(type) {
  if (type === 'invoice')     return '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;color:#fff;background:var(--navy-700,#1B3057);">Invoice</span>';
  if (type === 'receipt')     return '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;color:#1e7e34;background:#d1fae5;">Receipt</span>';
  if (type === 'credit_note') return '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;color:#7a6110;background:var(--gold-100,#F7EFD5);">&#8630; Credit Note</span>';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;color:#555;background:#eee;">${_finEsc(String(type || '—').replace(/_/g,' '))}</span>`;
}

function _finLedgerTable(rows) {
  let totalDebit = 0, totalCredit = 0;
  let bodyRows = '';
  if (rows.length === 0) {
    bodyRows = `<tr><td colspan="7" class="fin-empty">No transactions found.</td></tr>`;
  } else {
    rows.forEach(r => {
      totalDebit  += r.debit;
      totalCredit += r.credit;
      bodyRows += `<tr>
        <td>${_finEsc(r.date)}</td>
        <td>${_finLedgerTypePill(r.type)}</td>
        <td>${_finEsc(r.reference || '—')}</td>
        <td>${_finEsc(r.description)}</td>
        <td>${r.debit  ? _finFmt(r.debit)  : ''}</td>
        <td>${r.credit ? _finFmt(r.credit) : ''}</td>
        <td>${_finFmt(r.balance)}</td>
      </tr>`;
    });
  }
  return `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>DATE</th><th>TYPE</th><th>REFERENCE</th><th>DESCRIPTION</th>
          <th>DEBIT</th><th>CREDIT</th><th>BALANCE</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr class="fin-tfoot-total">
            <td colspan="4">Totals</td>
            <td>${_finFmt(totalDebit)}</td>
            <td>${_finFmt(totalCredit)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function _finStudentInfoGrid(s) {
  return `
    <div class="fin-info-grid">
      <div class="fin-info-item">
        <span class="fin-info-label">Admission No.</span>
        <span class="fin-info-value">${_finEsc(s.student_id || '-')}</span>
      </div>
      <div class="fin-info-item">
        <span class="fin-info-label">Student Name</span>
        <span class="fin-info-value">${_finEsc((s.first_name || '') + ' ' + (s.last_name || ''))}</span>
      </div>
      <div class="fin-info-item">
        <span class="fin-info-label">Class</span>
        <span class="fin-info-value">${_finEsc(s.school_class_name || '-')}</span>
      </div>
      <div class="fin-info-item">
        <span class="fin-info-label">Admission Status</span>
        <span class="fin-info-value">${s.is_active ? 'Active' : 'Inactive'}</span>
      </div>
      <div class="fin-info-item">
        <span class="fin-info-label">Reporting Status</span>
        <span class="fin-info-value">${s.is_reported ? 'Reported' : 'Not Reported'}</span>
      </div>
      <div class="fin-info-item">
        <span class="fin-info-label">Currency</span>
        <span class="fin-info-value">${_finEsc(s.currency || 'KES')}</span>
      </div>
    </div>
  `;
}

function _finSendActionRow() {
  return `
    <div class="fin-send-row">
      <button class="fin-btn-teal" onclick="alert('Send to Parent — coming soon.')">Send to Parent</button>
      <button class="fin-btn-teal" onclick="alert('Send to Student — coming soon.')">Send to Student</button>
      <button class="fin-btn-teal" onclick="window.print()">Print Fee Statement</button>
    </div>
  `;
}

// ==================== STUDENT FEES STATUS ====================
// This page is named for the status of a student's account, and for a long
// time it listed /students/ — admission number, class, cohort, reporting flag,
// active flag. Six columns, not one of them money. The fee figures existed
// only behind "View Detail", so answering "who owes us anything" meant opening
// students one at a time. The 2026-09-02 work typed StudentFeeStatusRead and
// rebuilt that detail page, but never touched the list in front of it.
//
// There is no bulk fee-status endpoint — /receivables/student-finance/{id}/
// fee-status is per student, and one call per child does not scale to a
// roster. GET /reports/consolidated-student-debtors is the one call that
// answers the question: a row per student with total_invoiced, total_paid,
// current_balance and the four ageing buckets, as at a date, optionally for
// one class.
//
// It is a *debtors* report, so a student who owes nothing may legitimately be
// absent from it. The roster therefore stays the spine of the list — from the
// finance lookup, not /students/, which would put a Student Management grant
// back in an accountant's way — and the report is joined onto it. A student
// with no row is shown as settled rather than dropped, so the count at the top
// is the whole school and not just the part of it in arrears.
//
// total_credited is deliberately not a column here: ConsolidatedStudentDebtorRow
// carries no credited figure, and deriving one per student would mean the
// applied-CN index over every invoice. Credits show on the detail page, which
// reads the typed per-student endpoint. The caption says so.

let _sfsPerPage  = 25;
let _sfsSearch   = '';
let _sfsRows     = [];      // roster joined with debtor rows
let _sfsTotals   = null;    // report totals, or null when the report is unavailable
let _sfsAsOf     = '';
let _sfsClassId  = '';
let _sfsPage     = 1;
let _sfsDebtorsError = '';  // set when the report call fails, shown once above the table
let _sfsRosterScoped = true; // false when a class view could not be scoped by name (see _loadSfsTable)

function _sfsToday() { return new Date().toISOString().split('T')[0]; }

async function loadStudentFeesStatusView(container) {
  _sfsSearch=''; _sfsRows=[]; _sfsTotals=null; _sfsPage=1; _sfsDebtorsError=''; _sfsRosterScoped=true;
  _sfsAsOf = _sfsToday(); _sfsClassId = '';
  await _rcvLoadLookups({ classes:true });
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Fees Status</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Student Fees Status</div>
      </div>
      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field">
            <label class="fin-filter-label">As At</label>
            <input type="date" id="sfs-as-of" class="fin-filter-input" value="${_sfsAsOf}">
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Class</label>
            <select id="sfs-class" class="fin-filter-select">
              <option value="">All Classes</option>${_rcvClassOptions('')}
            </select>
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Search</label>
            <input type="text" id="sfs-search" class="fin-filter-input" placeholder="Name or admission no&#8230;"
                   oninput="onSfsSearch(this.value)">
          </div>
        </div>
        <div class="fin-filter-actions">
          <button class="fin-btn-teal" onclick="sfsReload()">Apply</button>
          <button class="fin-btn-outline" onclick="sfsResetFilters()">Reset</button>
        </div>
      </div>
      <div id="sfs-summary"></div>
      <div id="sfs-table-container"><p class="fin-loading">Loading&#8230;</p></div>
    </div>`;
  await _loadSfsTable();
}

function sfsResetFilters() {
  const d=document.getElementById('sfs-as-of'); if(d) d.value=_sfsToday();
  const c=document.getElementById('sfs-class'); if(c) c.value='';
  const q=document.getElementById('sfs-search'); if(q) q.value='';
  _sfsSearch=''; sfsReload();
}

function sfsReload() {
  _sfsAsOf    = document.getElementById('sfs-as-of')?.value || _sfsToday();
  _sfsClassId = document.getElementById('sfs-class')?.value || '';
  _sfsPage    = 1;
  _loadSfsTable();
}

// A settled student and a student the report could not be fetched for must not
// look the same, so the two failure shapes are kept apart: `hasRow` false with
// the report loaded means nothing outstanding; _sfsDebtorsError set means every
// money column is unknown, and the banner says so rather than showing zeros.
async function _loadSfsTable() {
  const container = document.getElementById('sfs-table-container');
  if (container) container.innerHTML = '<p class="fin-loading">Loading&#8230;</p>';
  _sfsDebtorsError = '';

  const qs = `as_of_date=${encodeURIComponent(_sfsAsOf)}${_sfsClassId ? `&class_id=${_sfsClassId}` : ''}`;
  const [roster, repRes] = await Promise.all([
    loadFinanceStudents(),
    apiFetch(`${API_BASE}/reports/consolidated-student-debtors?${qs}`),
  ]);

  let byStudent = new Map();
  if (repRes && repRes.ok) {
    const data = await repRes.json().catch(() => null);
    _sfsTotals = data || null;
    for (const r of _toArray(data?.rows || [])) byStudent.set(String(r.student_id), r);
  } else {
    _sfsTotals = null;
    _sfsDebtorsError = repRes
      ? (repRes.status === 403
          ? 'Balances need the Finance › Reports permission. The roster is shown without them.'
          : 'Could not load balances: ' + await parseApiError(repRes))
      : 'Could not load balances: network error.';
  }

  // The report is class-filtered server-side on class_id, which is exact. The
  // roster is not: the finance lookup carries class_name and no class_id, and
  // class names repeat across academic years — the same trap that keeps
  // rcvFscBackfill on /students/?class_id=. Matching on the name would list
  // last year's cohort as this class's settled students.
  //
  // So the roster is only used to scope a class view when that class's name is
  // unique across the cache. When it is not, the list falls back to the
  // report's own rows: fewer students (a settled child has no row) but never
  // the wrong ones, and the caption says which of the two is on screen.
  let scoped = roster, rosterScoped = true;
  if (_sfsClassId) {
    const cls = (_rcvClassesCache || []).find(c => String(c.id) === String(_sfsClassId));
    const className = cls ? (cls.name || cls.class_name || '') : '';
    const unique = className && (_rcvClassesCache || [])
      .filter(c => (c.name || c.class_name || '') === className).length === 1;
    if (unique) {
      scoped = roster.filter(st => (st.class_name || '') === className);
    } else {
      rosterScoped = false;
      const ids = new Set([...byStudent.keys()]);
      scoped = roster.filter(st => ids.has(String(st.id)));
    }
  }
  _sfsRosterScoped = rosterScoped;

  _sfsRows = scoped.map(st => {
    const row = byStudent.get(String(st.id)) || null;
    return {
      id: st.id,
      display_id: st.student_id || row?.student_display_id || '',
      name: financeStudentName(st) || row?.student_name || '—',
      class_name: st.class_name || row?.class_name || '',
      hasRow: !!row,
      total_invoiced: row ? parseFloat(row.total_invoiced) || 0 : 0,
      total_paid:     row ? parseFloat(row.total_paid) || 0 : 0,
      balance:        row ? parseFloat(row.current_balance) || 0 : 0,
      overdue:        row ? (parseFloat(row['30_days'])||0) + (parseFloat(row['60_days'])||0) + (parseFloat(row['90_plus'])||0) : 0,
      ninety:         row ? parseFloat(row['90_plus']) || 0 : 0,
    };
  });
  // Biggest debtors first — the reason to open this page is to chase money.
  _sfsRows.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  _renderSfsSummary();
  _renderSfsTable();
}

function _renderSfsSummary() {
  const el = document.getElementById('sfs-summary');
  if (!el) return;
  if (!_sfsTotals) { el.innerHTML = ''; return; }
  const outstanding = parseFloat(_sfsTotals.total_current_balance) || 0;
  const inArrears   = _sfsRows.filter(r => r.balance > 0).length;
  el.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
      ${_sfsStatCard('Total Billed', formatKES(_sfsTotals.total_invoiced))}
      ${_sfsStatCard('Total Paid',   formatKES(_sfsTotals.total_paid))}
      ${_sfsStatCard('Outstanding',  formatKES(outstanding),
                     outstanding > 0 ? 'var(--coral-600,#A62B2B)' : 'var(--navy-700,#1B3057)')}
      ${_sfsStatCard('Students in Arrears', `${inArrears} of ${_sfsRows.length}`)}
    </div>`;
}

function _sfsBalanceCell(r) {
  if (!r.hasRow) {
    return _sfsDebtorsError
      ? '<span style="color:#888;" title="Balances could not be loaded">?</span>'
      : '<span style="color:#065f46;font-size:0.84rem;">Settled</span>';
  }
  const colour = r.balance > 0 ? 'var(--coral-600,#A62B2B)' : r.balance < 0 ? '#7a6110' : 'inherit';
  const overdueTag = r.overdue > 0
    ? `<div style="font-size:0.74rem;color:${r.ninety > 0 ? '#991b1b' : '#92400e'};margin-top:2px;">
         ${formatKES(r.overdue)} overdue${r.ninety > 0 ? ' &middot; 90+ days' : ''}</div>`
    : '';
  return `<span style="color:${colour};font-weight:600;">${_finFmt(r.balance)}</span>${overdueTag}`;
}

function _renderSfsTable() {
  const container = document.getElementById('sfs-table-container');
  if (!container) return;

  const q = _sfsSearch;
  const filtered = q
    ? _sfsRows.filter(r => `${r.name} ${r.display_id} ${r.class_name}`.toLowerCase().includes(q))
    : _sfsRows;

  const pages = Math.max(1, Math.ceil(filtered.length / _sfsPerPage));
  if (_sfsPage > pages) _sfsPage = pages;
  const page = filtered.slice((_sfsPage - 1) * _sfsPerPage, _sfsPage * _sfsPerPage);

  const banner = _sfsDebtorsError
    ? `<div style="background:var(--coral-100,#FBEAEA);border-left:3px solid var(--coral-500,#C74444);border-radius:6px;padding:10px 14px;margin-bottom:12px;color:var(--coral-600,#A62B2B);font-size:0.86rem;">${_finEsc(_sfsDebtorsError)}</div>`
    : '';

  const rows = page.length
    ? page.map(r => `<tr>
        <td>${_finEsc(r.display_id || '—')}</td>
        <td>${_finEsc(r.name)}</td>
        <td>${_finEsc(r.class_name || '—')}</td>
        <td>${r.hasRow ? _finFmt(r.total_invoiced) : '—'}</td>
        <td>${r.hasRow ? _finFmt(r.total_paid) : '—'}</td>
        <td>${_sfsBalanceCell(r)}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinSfsDropdown(event,${r.id})">&#8230;</button>
            <div id="fin-sfs-dd-${r.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openFeesDetail(${r.id});return false;">&#128065; View Detail</a>
              <a href="#" onclick="_sfsStmtOpenFor(${r.id});return false;">&#128203; Summarised Statement</a>
            </div>
          </div>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="fin-empty">No students match this filter.</td></tr>`;

  container.innerHTML = banner + `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>ADMISSION NO</th><th>STUDENT NAME</th><th>CLASS</th>
          <th>BILLED</th><th>PAID</th><th>BALANCE</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:10px;">
      <span style="font-size:0.85rem;color:#666;">
        Showing ${page.length ? (_sfsPage-1)*_sfsPerPage + 1 : 0}&ndash;${(_sfsPage-1)*_sfsPerPage + page.length} of ${filtered.length}
        &middot; <label>Per page
          <select onchange="changeSfsPerPage(this.value)" class="fin-filter-select" style="width:auto;display:inline-block;padding:2px 6px;">
            ${[25,50,100].map(n=>`<option value="${n}"${n===_sfsPerPage?' selected':''}>${n}</option>`).join('')}
          </select></label>
      </span>
      <span>
        <button class="fin-btn-outline" ${_sfsPage<=1?'disabled':''} onclick="sfsGoPage(${_sfsPage-1})">&lsaquo; Prev</button>
        <span style="font-size:0.85rem;color:#666;margin:0 8px;">Page ${_sfsPage} of ${pages}</span>
        <button class="fin-btn-outline" ${_sfsPage>=pages?'disabled':''} onclick="sfsGoPage(${_sfsPage+1})">Next &rsaquo;</button>
      </span>
    </div>
    <p style="font-size:0.8rem;color:#888;margin-top:8px;"><em>Balances are as at ${_finEsc(_sfsAsOf)}, from the consolidated debtors report. A student with no invoices outstanding shows as Settled.${_sfsRosterScoped ? '' : ' This class shares its name with another, so only students holding invoices are listed &mdash; settled classmates are omitted rather than risk listing another cohort\'s.'} Credit notes are netted into the balance but have no column here &mdash; open a student's detail for the billed / paid / credited breakdown.</em></p>`;
}

function sfsGoPage(n) { _sfsPage = n; _renderSfsTable(); }
function changeSfsPerPage(val) { _sfsPerPage = parseInt(val, 10) || 25; _sfsPage = 1; _renderSfsTable(); }
function onSfsSearch(val)      { _sfsSearch = val.trim().toLowerCase(); _sfsPage = 1; _renderSfsTable(); }

// Jump straight from a row into that student's per-term rollup, instead of
// making the user re-find them in the Summarised Fee Statement picker.
async function _sfsStmtOpenFor(studentId) {
  await loadSummarizedFeeStatementView(document.getElementById('main-content'));
  await _sfsStmtSelectStudent(studentId);
}

function toggleFinSfsDropdown(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="fin-sfs-dd-"]').forEach(d => {
    if (d.id !== `fin-sfs-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`fin-sfs-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// Detail view — full page navigation
async function openFeesDetail(studentId) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p class="fin-loading">Loading&#8230;</p>';
  try {
    const res = await apiFetch(`${API_BASE}/students/${studentId}`);
    if (!res || !res.ok) { main.innerHTML = '<p class="fin-error">Could not load student.</p>'; return; }
    const student = await res.json();
    const [status, ledger] = await Promise.all([
      _finFetchFeeStatus(studentId),
      _finBuildLedger(studentId),
    ]);
    _renderFeesDetailPage(main, student, status, ledger, studentId);
  } catch(_) { main.innerHTML = '<p class="fin-error">Failed to load detail.</p>'; }
}

// StudentFeeStatusRead is typed as of the 2026-09-02 addendum §F, and
// total_credited — which the service had been computing all along — is on the
// response now instead of being dropped before it reached the wire. Without it
// the header read "billed 115k, paid 30k, balance 80k" and left the bursar to
// guess at the missing 5k.
async function _finFetchFeeStatus(studentId) {
  const res = await apiFetch(`${API_BASE}/receivables/student-finance/${studentId}/fee-status`);
  if (!res || !res.ok) return null;
  return await res.json().catch(() => null);
}

const _FIN_INV_STATUS_LABEL = {
  draft: 'Draft', issued: 'Issued', partially_paid: 'Partially Paid',
  paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled',
};

function _finFeeStatusPanel(status) {
  if (!status) return '<p class="fin-empty">Fee status is unavailable for this student.</p>';
  const credited = parseFloat(status.total_credited) || 0;
  const balance  = parseFloat(status.balance) || 0;
  const invoices = _toArray(status.invoices || []);

  const cards = invoices.map(inv => {
    const invCredited = parseFloat(inv.amount_credited) || 0;
    const receipts = _toArray(inv.receipts || []);
    return `
      <div style="background:#f9fafb;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:baseline;">
          <div><strong>${_finEsc(inv.invoice_number || ('Invoice #' + inv.invoice_id))}</strong>
            <span style="color:#888;font-size:0.85rem;">&middot; ${_finEsc(_FIN_INV_STATUS_LABEL[inv.status] || inv.status || '—')}</span></div>
          <div style="color:#888;font-size:0.85rem;">Due ${_finEsc((inv.due_date || '').split('T')[0] || '—')}</div>
        </div>
        <div style="display:flex;gap:22px;flex-wrap:wrap;margin-top:8px;font-size:0.86rem;">
          <span>Billed <strong>${_finFmt(inv.amount_due)}</strong></span>
          <span>Paid <strong>${_finFmt(inv.amount_paid)}</strong></span>
          <span${invCredited ? ' style="color:#7a6110;"' : ''}>Credited <strong>${_finFmt(inv.amount_credited)}</strong></span>
          <span>Balance <strong>${_finFmt(inv.balance)}</strong></span>
        </div>
        ${receipts.length ? `<div style="margin-top:8px;font-size:0.82rem;color:#555;">
          ${receipts.map(r => `${_finEsc(r.receipt_number || '')} &middot; ${_finFmt(r.amount)} &middot; ${_finEsc(receiptMethodLabel(r.payment_method))} &middot; ${_finEsc((r.payment_date || '').split('T')[0])}`).join('<br>')}
        </div>` : ''}
        <div style="margin-top:8px;">
          <a href="#" style="font-size:0.84rem;" onclick="window._rcvCurrentInvoiceId=${inv.invoice_id};loadInvoiceDetailView(document.getElementById('main-content'),${inv.invoice_id});return false;">Open invoice</a>
        </div>
      </div>`;
  }).join('');

  return `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
      ${_sfsStatCard('Total Billed',   formatKES(status.total_billed))}
      ${_sfsStatCard('Total Paid',     formatKES(status.total_paid))}
      ${_sfsStatCard('Total Credited', formatKES(status.total_credited), credited > 0 ? '#7a6110' : 'var(--grey-400,#999)')}
      ${_sfsStatCard('Balance',        formatKES(status.balance),
                     balance > 0 ? 'var(--coral-600,#A62B2B)' : balance < 0 ? '#7a6110' : 'var(--navy-700,#1B3057)')}
    </div>
    ${cards || '<p class="fin-empty">No invoices for this student yet.</p>'}`;
}

function _renderFeesDetailPage(container, student, status, ledger, studentId) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Fees Status</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('student-fees-status');return false;">Student Fees Status</a>
          &rsaquo; Detail
        </div>
      </div>
      ${_finSendActionRow()}
      ${_finStudentInfoGrid(student)}
      <div class="fin-section-label">Fee Status</div>
      ${_finFeeStatusPanel(status)}
      <div class="fin-section-label">Transaction Ledger</div>
      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field"><label class="fin-filter-label">Start Date</label><input type="date" id="fin-detail-start" class="fin-filter-input"></div>
          <div class="fin-filter-field"><label class="fin-filter-label">End Date</label><input type="date" id="fin-detail-end" class="fin-filter-input"></div>
          <div class="fin-filter-field"><label class="fin-filter-label">As At</label><input type="date" id="fin-detail-as-at" class="fin-filter-input"></div>
        </div>
        <div class="fin-filter-actions">
          <button class="fin-btn-teal" onclick="finDetailApplyDateFilter()">Apply</button>
          <button class="fin-btn-outline" onclick="finDetailClearDateFilter()">Clear</button>
        </div>
      </div>
      <div id="fin-detail-ledger">${_finLedgerTable(ledger)}</div>
      <div id="fin-detail-date-store" data-student="${studentId}"
           data-ledger='${JSON.stringify(ledger).replace(/'/g,"&#39;")}' style="display:none;"></div>
    </div>
  `;
}

// The BALANCE column stays the server's full-history running balance even when
// the range hides earlier rows — filtering the view must not rewrite what the
// student actually owed on that date. Only the debit/credit totals narrow.
function _finDetailStoredLedger() {
  const store = document.getElementById('fin-detail-date-store');
  if (!store) return null;
  try { return JSON.parse(store.dataset.ledger || '[]'); } catch (_) { return []; }
}

function finDetailApplyDateFilter() {
  const ledger = _finDetailStoredLedger();
  if (!ledger) return;
  const el = document.getElementById('fin-detail-ledger');
  if (el) el.innerHTML = _finLedgerTable(_finFilterLedger(
    ledger,
    document.getElementById('fin-detail-start')?.value,
    document.getElementById('fin-detail-end')?.value,
    document.getElementById('fin-detail-as-at')?.value,
  ));
}

function finDetailClearDateFilter() {
  ['fin-detail-start','fin-detail-end','fin-detail-as-at'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const ledger = _finDetailStoredLedger();
  if (!ledger) return;
  const el = document.getElementById('fin-detail-ledger');
  if (el) el.innerHTML = _finLedgerTable(ledger);
}

// ==================== SUMMARISED FEE STATEMENT ====================
// finance.summarized_fee_statement sat in the permission tree for a long time
// with no endpoint behind it: the page listed students and rendered a dash in
// every money column, and the "View Statement" drill-down rebuilt a
// transaction ledger client-side out of invoices and receipts — which silently
// omitted credit notes, so a forgiven balance still read as owed.
//
// GET /receivables/student-finance/{id}/summarised-fee-statement is the real
// thing: one row per term with billed / paid / credited / balance, computed
// server-side with the same `balance = due − paid − credited` formula the
// individual invoices use, so this summary cannot drift from the invoice
// detail views. CANCELLED invoices are excluded, as everywhere else.
//
// The page is a picker plus that rollup, rather than the old list-then-drill:
// per-term totals are what the endpoint returns, and the transaction-level
// ledger already has two homes (Student Fees Status detail, and the Statement
// of Account tab on the student profile) that both read a server-computed
// statement.

let _sfsStmtStudent = null;

async function loadSummarizedFeeStatementView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Summarised Fee Statement</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Student Fees &rsaquo; Summarised Statement</div>
      </div>
      <div class="fin-filter-section">
        <div class="fin-filter-field" style="position:relative;max-width:460px;">
          <label class="fin-filter-label">Student <span class="fin-required">*</span></label>
          <input type="text" id="sfs-stmt-student-search" class="fin-filter-input" autocomplete="off"
                 placeholder="Search by name, admission no. or class&#8230;"
                 oninput="_sfsStmtStudentSearch(this.value)">
          <div id="sfs-stmt-student-dd" class="fin-search-dropdown" style="display:none;position:absolute;z-index:40;left:0;right:0;background:#fff;border:1px solid var(--grey-100,#ECEEF2);border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,0.10);max-height:280px;overflow:auto;"></div>
        </div>
      </div>
      <div id="sfs-stmt-results">
        <p style="color:#888;font-size:0.9rem;">Select a student to see their per-term fee summary.</p>
      </div>
    </div>`;
  _sfsStmtStudent = null;
  // Warm the cache so the first keystroke filters instead of waiting on a fetch.
  loadFinanceStudents();
}

let _sfsStmtSearchTimer = null;
function _sfsStmtStudentSearch(val) {
  clearTimeout(_sfsStmtSearchTimer);
  const dd = document.getElementById('sfs-stmt-student-dd');
  if (!dd) return;
  if (!val.trim()) { dd.style.display = 'none'; return; }
  _sfsStmtSearchTimer = setTimeout(async () => {
    await loadFinanceStudents();
    const list = searchFinanceStudents(val);
    dd.innerHTML = list.length ? list.map(st => {
      const name = _finEsc(financeStudentName(st));
      return `<a href="#" style="display:block;padding:9px 14px;text-decoration:none;color:var(--navy-900,#0D2137);border-bottom:1px solid var(--grey-100,#ECEEF2);"
                 onclick="_sfsStmtSelectStudent(${st.id});return false;">
        <strong>${name}</strong> <span style="color:#888;font-size:0.85em;">${_finEsc(st.student_id || '')}${st.class_name ? ' &middot; ' + _finEsc(st.class_name) : ''}</span>
      </a>`;
    }).join('') : '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
    dd.style.display = 'block';
  }, 200);
}

document.addEventListener('click', (e) => {
  const dd = document.getElementById('sfs-stmt-student-dd');
  const input = document.getElementById('sfs-stmt-student-search');
  if (dd && input && !dd.contains(e.target) && e.target !== input) dd.style.display = 'none';
});

async function _sfsStmtSelectStudent(studentId) {
  const dd = document.getElementById('sfs-stmt-student-dd');
  if (dd) dd.style.display = 'none';
  const list = await loadFinanceStudents();
  _sfsStmtStudent = list.find(st => String(st.id) === String(studentId)) || null;
  const inp = document.getElementById('sfs-stmt-student-search');
  if (inp && _sfsStmtStudent) inp.value = `${financeStudentName(_sfsStmtStudent)} (${_sfsStmtStudent.student_id || ''})`;

  const out = document.getElementById('sfs-stmt-results');
  if (!out) return;
  out.innerHTML = '<p class="fin-loading">Loading&#8230;</p>';
  const res = await apiFetch(`${API_BASE}/receivables/student-finance/${studentId}/summarised-fee-statement`);
  if (!res || !res.ok) {
    out.innerHTML = `<p class="fin-error">${_finEsc(res ? await parseApiError(res) : 'Network error.')}</p>`;
    return;
  }
  _renderSummarisedStatement(out, await res.json());
}

function _sfsStatCard(label, value, color) {
  return `<div style="flex:1;min-width:150px;background:var(--white,#fff);border:1px solid var(--card-border,#e5e5e5);border-radius:8px;padding:14px 16px;">
    <div style="font-size:11px;font-weight:600;color:var(--grey-400,#999);text-transform:uppercase;letter-spacing:0.06em;">${_finEsc(label)}</div>
    <div style="font-size:1.15rem;font-weight:700;margin-top:4px;color:${color || 'var(--navy-700,#1B3057)'};">${value}</div>
  </div>`;
}

function _renderSummarisedStatement(out, data) {
  const rows   = _toArray(data?.rows || []);
  const totals = data?.totals || { invoice_count: 0, total_billed: 0, total_paid: 0, total_credited: 0, balance: 0 };
  const st     = _sfsStmtStudent;

  const infoCard = `
    <div style="background:var(--navy-700,#1B3057);color:#fff;border-radius:8px;padding:14px 18px;margin-bottom:16px;">
      <div style="font-size:1.05rem;font-weight:700;">${_finEsc(st ? financeStudentName(st) : `Student #${data?.student_id ?? ''}`)}</div>
      <div style="font-size:0.85rem;opacity:0.85;margin-top:2px;">
        ${_finEsc(st?.student_id || '—')} &middot; ${_finEsc(st?.class_name || 'No class assigned')}
      </div>
    </div>`;

  if (!rows.length) {
    out.innerHTML = infoCard + `<p class="fin-empty" style="padding:24px 0;">No invoices yet for this student. Use Fee Invoicing &rsaquo; <a href="#" onclick="loadView('fin-invoice-generate');return false;">Generate</a> to create the first one.</p>`;
    return;
  }

  const credited = parseFloat(totals.total_credited) || 0;
  const balance  = parseFloat(totals.balance) || 0;
  // A negative balance is a student credit — normally from an over-credited
  // CN, where the excess is waiting to offset the next invoice. Gold, not
  // coral: nothing is owed and nobody needs to chase it.
  const balanceColour = balance > 0 ? 'var(--coral-600,#A62B2B)'
                      : balance < 0 ? '#7a6110'
                      : 'var(--navy-700,#1B3057)';

  const bodyRows = rows.map(r => {
    const rowBal = parseFloat(r.balance) || 0;
    const rowCr  = parseFloat(r.total_credited) || 0;
    return `<tr>
      <td>${_finEsc(r.academic_year_title || '—')}</td>
      <td>${_finEsc(r.term_title || `Term #${r.term_id}`)}</td>
      <td>${r.invoice_count ?? 0}</td>
      <td>${_finFmt(r.total_billed)}</td>
      <td>${_finFmt(r.total_paid)}</td>
      <td${rowCr ? ' style="color:#7a6110;"' : ''}>${_finFmt(r.total_credited)}</td>
      <td style="color:${rowBal > 0 ? 'var(--coral-600,#A62B2B)' : rowBal < 0 ? '#7a6110' : 'inherit'};">${_finFmt(r.balance)}</td>
    </tr>`;
  }).join('');

  out.innerHTML = infoCard + `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
      ${_sfsStatCard('Total Billed',    formatKES(totals.total_billed))}
      ${_sfsStatCard('Total Paid',      formatKES(totals.total_paid))}
      ${_sfsStatCard('Total Credited',  formatKES(totals.total_credited), credited > 0 ? '#7a6110' : 'var(--grey-400,#999)')}
      ${_sfsStatCard('Balance',         formatKES(totals.balance), balanceColour)}
    </div>
    ${balance < 0 ? `<div style="background:var(--gold-100,#F7EFD5);border-left:3px solid var(--gold-500,#C9A227);border-radius:6px;padding:10px 14px;margin-bottom:14px;color:#7a6110;font-size:0.86rem;">
      This student is in credit by ${formatKES(Math.abs(balance))}. It will offset their next invoice.
    </div>` : ''}
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>ACADEMIC YEAR</th><th>TERM</th><th>INVOICES</th>
          <th>BILLED</th><th>PAID</th><th>CREDITED</th><th>BALANCE</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr class="fin-tfoot-total" style="font-weight:700;color:var(--navy-700,#1B3057);">
            <td colspan="2">Total</td>
            <td>${totals.invoice_count ?? 0}</td>
            <td>${_finFmt(totals.total_billed)}</td>
            <td>${_finFmt(totals.total_paid)}</td>
            <td>${_finFmt(totals.total_credited)}</td>
            <td>${_finFmt(totals.balance)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p style="font-size:0.8rem;color:#888;margin-top:8px;"><em>Rows are ordered by term start date, with any term missing one sorted last. Cancelled invoices are excluded. A term can carry more than one invoice — the count says how many.</em></p>
    <div class="fin-send-row" style="margin-top:16px;">
      <button class="fin-btn-teal" onclick="window.print()">Print Statement</button>
    </div>`;
}

// ==================== SHARED STUDENT-NAME LOOKUP ====================
// Sole survivor of the old Student Invoices (Legacy) module (removed —
// superseded by Fee Invoices in receivables.js, which hits the same
// /receivables/fee-invoices endpoints correctly). Sibling Groups and Receive
// Payments below still need a plain id -> student name resolver.

// Finance-scoped lookup (see loadFinanceStudents in ui-helpers.js) — the id,
// name and admission number this resolver and the printable receipt need are
// all on it, and it doesn't demand a student_management grant of an
// accountant whose only business with a student is their ledger.
let _invStudentsCache = [];
async function _invLoadLookups() {
  if (_invStudentsCache.length) return;
  _invStudentsCache = await loadFinanceStudents();
}
function _invStudentName(id) {
  const s = _invStudentsCache.find(s => String(s.id) === String(id));
  return s ? `${s.first_name||''} ${s.last_name||''}`.trim() : `#${id}`;
}

// ==================== PLACEHOLDER ====================

function loadFinPlaceholderView(container, title, parentLabel) {
  const parent = parentLabel || 'Finance';
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${_finEsc(title)}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; ${_finEsc(title)}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:48px 24px;text-align:center;
                  color:#888;border:1px solid #eee;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
        <p style="font-size:1rem;font-weight:600;margin:0;">Coming Soon</p>
        <p style="font-size:0.88rem;margin-top:8px;">This module is currently under development.</p>
      </div>
    </div>
  `;
}

function openFinStudentFinanceDropdown() {
  const dd = document.getElementById('fin-sf-dropdown');
  if (dd) dd.style.display = 'block';
}
function openFinReceivablesDropdown() {
  const dd = document.getElementById('fin-receivables-dropdown');
  if (dd) dd.style.display = 'block';
}
function openFinBankCashDropdown() {
  const dd = document.getElementById('fin-bankcash-dropdown');
  if (dd) dd.style.display = 'block';
}
function openFinPayablesDropdown() {
  const dd = document.getElementById('fin-payables-dropdown');
  if (dd) dd.style.display = 'block';
}
function openFinAuditDropdown() {
  const dd = document.getElementById('fin-audit-dropdown');
  if (dd) dd.style.display = 'block';
}
function openFinTendepayDropdown() {
  const dd = document.getElementById('fin-tendepay-dropdown');
  if (dd) dd.style.display = 'block';
}
function openFinReportsDropdown() {
  const dd = document.getElementById('fin-reports-dropdown');
  if (dd) dd.style.display = 'block';
}
function openFinUtilitiesDropdown() {
  const dd = document.getElementById('fin-utilities-dropdown');
  if (dd) dd.style.display = 'block';
}
function openFinSetupDropdown() {
  const dd = document.getElementById('fin-setup-dropdown');
  if (dd) dd.style.display = 'block';
}
function openFinBudgetingDropdown() {
  const dd = document.getElementById('fin-budgeting-dropdown');
  if (dd) dd.style.display = 'block';
}

// ==================== DISCOUNT SETUP ====================
// Singleton settings record: GET fetches the current config (404/null = not
// yet configured), POST creates it the first time, PUT updates it thereafter.

let _discountSettingsId = null;

async function renderFinanceDiscountSetup(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Set-up</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Set-up</div>
      </div>
      <div class="fin-form-wrap">
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Discount Account <span class="fin-required">*</span></label>
            <select id="disc-account" class="fin-form-select">
              <option value="">Please Select</option>
            </select>
            <span class="fin-field-error" id="err-disc-account"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">First Child (%)</label>
            <input type="number" id="disc-first" class="fin-form-input" min="0" max="100" step="0.01">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Second Child (%)</label>
            <input type="number" id="disc-second" class="fin-form-input" min="0" max="100" step="0.01">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Third Child (%)</label>
            <input type="number" id="disc-third" class="fin-form-input" min="0" max="100" step="0.01">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Fourth Child (%)</label>
            <input type="number" id="disc-fourth" class="fin-form-input" min="0" max="100" step="0.01">
          </div>
          <div class="fin-form-group"></div>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" id="disc-submit-btn" onclick="saveDiscountSetup()">Submit</button>
        </div>
      </div>
    </div>
  `;

  await Promise.all([
    _loadDiscountAccountDropdown(),
    _loadExistingDiscountSettings()
  ]);
}

// Discount policies apply against a Fee Account — which isn't a separate
// backend resource, it's Chart of Accounts filtered to
// is_student_fees_related:true (same live-confirmed endpoint loadFeeAccountsView
// uses, see the "FEE ACCOUNTS" comment above). The old /finance/fee-accounts/
// endpoint and is_discount_account/is_deactivated fields this used to filter
// on don't exist on the backend at all, which is why this dropdown was always
// empty.
async function _loadDiscountAccountDropdown() {
  const select = document.getElementById('disc-account');
  if (!select) return;

  let accounts = [];
  const res = await apiFetch(`${API_BASE}/accounts/?is_student_fees_related=true`);
  if (res && res.ok) {
    const all = await res.json().catch(() => []);
    accounts = _toArray(all).filter(a => a.is_active !== false);
  } else if (res) {
    showToast('Failed to load discount accounts.', 'error');
  }

  accounts.forEach(acct => {
    const opt = document.createElement('option');
    opt.value = acct.id;
    opt.textContent = `${acct.number || ''} — ${acct.account_name || `Account ${acct.id}`}`;
    select.appendChild(opt);
  });

  if (accounts.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'fin-field-hint fin-field-hint-warning';
    hint.textContent = 'No fee accounts found. Please create one under Finance › Fee Accounts before configuring sibling discounts.';
    select.insertAdjacentElement('afterend', hint);
  }
}

async function _loadExistingDiscountSettings() {
  _discountSettingsId = null;
  const res = await apiFetch(`${API_BASE}/receivables/setup/discount-policies`);
  if (!res || res.status === 404 || !res.ok) {
    if (res && res.status !== 404) showToast('Failed to load existing discount settings.', 'error');
    return;
  }

  const list = await res.json().catch(() => null);
  const data = Array.isArray(list) ? list[0] : (list?.results ? list.results[0] : list);
  if (!data || !data.id) return;

  _discountSettingsId = data.id;

  const select = document.getElementById('disc-account');
  if (select && data.discount_account_id != null) select.value = String(data.discount_account_id);

  const setField = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== null && val !== undefined) el.value = val;
  };
  setField('disc-first',  data.first_child_percentage);
  setField('disc-second', data.second_child_percentage);
  setField('disc-third',  data.third_child_percentage);
  setField('disc-fourth', data.fourth_child_percentage);
}

async function saveDiscountSetup() {
  const accountSelect = document.getElementById('disc-account');
  const accountId = accountSelect.value;
  const errEl = document.getElementById('err-disc-account');

  if (!accountId) {
    if (errEl) errEl.textContent = 'Please select a discount account.';
    accountSelect.classList.add('error');
    return;
  }
  if (errEl) errEl.textContent = '';
  accountSelect.classList.remove('error');

  const pctIds = ['disc-first', 'disc-second', 'disc-third', 'disc-fourth'];
  for (const id of pctIds) {
    const raw = document.getElementById(id).value;
    if (raw === '') continue;
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0 || val > 100) {
      showToast('Percentage values must be between 0 and 100.', 'error');
      document.getElementById(id).focus();
      return;
    }
  }

  const parseOptional = (id) => {
    const v = document.getElementById(id).value;
    return v === '' ? null : parseFloat(v);
  };

  const payload = {
    discount_account_id:     parseInt(accountId, 10),
    first_child_percentage:  parseOptional('disc-first'),
    second_child_percentage: parseOptional('disc-second'),
    third_child_percentage:  parseOptional('disc-third'),
    fourth_child_percentage: parseOptional('disc-fourth')
  };

  const submitBtn = document.getElementById('disc-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  const method = _discountSettingsId === null ? 'POST' : 'PUT';
  const url = _discountSettingsId === null
    ? `${API_BASE}/receivables/setup/discount-policies`
    : `${API_BASE}/receivables/setup/discount-policies/${_discountSettingsId}`;
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit';

  if (!res) return;
  if (res.ok) {
    const saved = await res.json().catch(() => null);
    if (saved && saved.id) _discountSettingsId = saved.id;
    showToast('Discount setup saved successfully.', 'success');
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

// Used by the Add Student form's sibling-discount preview (js/students.js)
// so it doesn't need to know the discount-setup endpoint shape directly.
async function fetchDiscountSettings() {
  const res = await apiFetch(`${API_BASE}/receivables/setup/discount-policies`);
  if (!res || !res.ok) return null;
  const list = await res.json().catch(() => null);
  return Array.isArray(list) ? (list[0] || null) : (list?.results ? (list.results[0] || null) : list);
}

// ==================== SIBLING GROUPS ====================
// Backend only exposes create (POST), get-by-id (GET) and add-student — there is
// no list-all endpoint, so this view is a lookup (by group id or by a member
// student) rather than a paginated table.

let _sgFoundGroup = null;
let _sgNewPicks = [null, null, null]; // up to 3 slots, each {id, sibling_group_id} or null

async function loadSiblingGroupsView(container) {
  _sgFoundGroup = null;
  await _invLoadLookups();
  const _canAddSiblingGroup = canAdd('finance.setup');
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Sibling Groups</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Set-up &rsaquo; Sibling Groups</div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        <div class="fin-form-group">
          <label class="fin-form-label">Look up a group by Group ID or a member student</label>
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <input id="sg-lookup-id" type="number" min="1" class="fin-form-input" style="max-width:160px;" placeholder="Group ID">
            <span style="padding-top:10px;color:#888;">or</span>
            <div style="position:relative;flex:1;">
              <input id="sg-lookup-student" class="fin-search-input" style="width:100%!important" placeholder="Search student by name or SOIS ID&#8230;" oninput="sgLookupStudentSearch(this.value)" autocomplete="off">
              <div id="sg-lookup-student-dd" class="fin-action-dropdown" style="display:none;max-height:240px;overflow-y:auto;position:absolute;top:100%;left:0;width:100%;z-index:100;"></div>
            </div>
            <button class="fin-btn-teal" onclick="sgLookupById()">Find</button>
          </div>
        </div>
        <div id="sg-lookup-result" style="margin-top:16px;"></div>
        <div class="fin-form-actions" style="margin-top:24px;">
          ${_canAddSiblingGroup ? `<button class="fin-btn-teal" onclick="loadView('finance-sibling-groups-add')">Create New Sibling Group</button>` : ''}
        </div>
      </div>

      <div class="fin-section-label" style="margin-top:32px;max-width:680px;">Recently Created/Joined Groups (this device)</div>
      <div id="sg-known-groups-list" style="max-width:680px;">
        <p style="color:#888;font-size:0.88rem;">Loading&#8230;</p>
      </div>
    </div>`;

  // A group just created/joined from the Add/Edit Student sibling picker
  // (_stuSyncSiblingGroup in students.js) leaves its id here so it shows up
  // immediately on this module without the user having to know the Group ID.
  const pendingId = sessionStorage.getItem('_edugiga_last_sibling_group_id');
  if (pendingId) {
    sessionStorage.removeItem('_edugiga_last_sibling_group_id');
    document.getElementById('sg-lookup-id').value = pendingId;
    sgLookupById();
  }

  await _sgRenderKnownGroups();
}

// The backend has no GET-list endpoint for sibling groups (see the
// rememberSiblingGroupId comment in config.js) — this renders whatever this
// browser has locally recorded, fetched individually by id (the one read
// operation that does exist), so a group created via Student Add/Edit shows
// up here automatically instead of the page always looking empty.
async function _sgRenderKnownGroups() {
  const listEl = document.getElementById('sg-known-groups-list');
  if (!listEl) return;
  const ids = knownSiblingGroupIds();
  if (!ids.length) {
    listEl.innerHTML = '<p style="color:#888;font-size:0.88rem;">No sibling groups created or joined from this browser yet. The backend has no way to list every group system-wide, so use the lookup above if you know a Group ID or a member student — groups created/joined from Student Add/Edit on this device will appear here automatically going forward.</p>';
    return;
  }
  const groups = (await Promise.all(ids.map(async id => {
    const res = await apiFetch(`${API_BASE}/receivables/sibling-groups/${id}`);
    return (res && res.ok) ? await res.json().catch(() => null) : null;
  }))).filter(Boolean);
  listEl.innerHTML = groups.length
    ? groups.map(g => _sgKnownGroupCardHtml(g)).join('')
    : '<p style="color:#888;font-size:0.88rem;">No sibling groups found.</p>';
}

function _sgMemberNamesHtml(group) {
  const memberNames = (group.student_ids || []).map(id => `${_invStudentName(id)} (#${id})`);
  return memberNames.length ? memberNames.map(n => _finEsc(n)).join(', ') : '—';
}

// sibling_adjustments[] shipped live 2026-08-18 (was absent when this module
// was first built) — one row per retroactive discount adjustment posted
// against an open invoice when group composition changed, each with its own
// reversing JE (DR income / CR AR Control). Rendered only when non-empty.
function _sgAdjustmentsHtml(group) {
  const adjustments = group.sibling_adjustments || [];
  if (!adjustments.length) return '';
  return `
    <div style="margin-top:14px;">
      <div style="font-size:0.78rem;font-weight:600;color:var(--navy-700,#1B3057);text-transform:uppercase;margin-bottom:6px;">Discount Adjustments</div>
      <div class="fin-table-wrap"><table class="fin-li-table">
        <thead><tr><th>Student</th><th>Invoice</th><th style="text-align:right;">Amount</th><th>JE</th></tr></thead>
        <tbody>${adjustments.map(a => `<tr>
          <td>${_finEsc(_invStudentName(a.student_id))}</td>
          <td>${_finEsc(a.invoice_number || ('#' + a.invoice_id))}</td>
          <td style="text-align:right;">${_pvMoney(a.amount)}</td>
          <td><a href="#" onclick="_jeOpenDetail(${a.journal_entry_id});return false;">View JE</a></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

function _sgKnownGroupCardHtml(group) {
  return `
    <div style="background:#f9fafb;border:1px solid #e0e0e0;border-radius:6px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <div>
        <p style="margin:0 0 4px;"><strong>Group #${group.id}</strong>${group.name ? ' — ' + _finEsc(group.name) : ''}</p>
        <p style="margin:0;color:#555;font-size:0.88rem;">Members: ${_sgMemberNamesHtml(group)}</p>
      </div>
      <button class="fin-btn-outline" onclick="_sgOpenGroup(${group.id})">Manage</button>
    </div>`;
}

function _sgOpenGroup(id) {
  const idInput = document.getElementById('sg-lookup-id');
  if (idInput) idInput.value = id;
  sgLookupById();
  document.getElementById('sg-lookup-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let _sgLookupSearchTimer = null;
function sgLookupStudentSearch(val) {
  clearTimeout(_sgLookupSearchTimer);
  const dd = document.getElementById('sg-lookup-student-dd');
  if (!dd) return;
  if (!val.trim()) { dd.style.display = 'none'; return; }
  // Debounced — see stuSibPickSearch (students.js) for why: firing on every
  // keystroke let a slower response for an earlier, shorter search term
  // arrive after a faster later one and overwrite the dropdown with stale
  // results, which looked like the search only reacting to the first letter.
  _sgLookupSearchTimer = setTimeout(async () => {
    await loadFinanceStudents();
    const list = searchFinanceStudents(val);
    if (!list.length) {
      dd.innerHTML = '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
      dd.style.display = 'block';
      return;
    }
    dd.innerHTML = list.map(s => {
      const name = _finEsc(`${s.first_name||''} ${s.last_name||''}`.trim());
      const idLabel = _finEsc(s.student_id||'');
      return `<a href="#" class="fin-search-option" onclick="sgLookupStudentSelect(${s.id},${s.sibling_group_id ?? 'null'},'${idLabel} — ${name}');return false;">
         <span class="fin-search-option-name">${name}</span>
         <span class="fin-search-option-sub">${idLabel}</span>
       </a>`;
    }).join('');
    dd.style.display = 'block';
  }, 300);
}

async function sgLookupStudentSelect(studentId, siblingGroupId, label) {
  const inp = document.getElementById('sg-lookup-student');
  if (inp) inp.value = label;
  const dd = document.getElementById('sg-lookup-student-dd');
  if (dd) dd.style.display = 'none';
  const resultEl = document.getElementById('sg-lookup-result');
  // GET /students/?search= (where this student came from) never carries
  // sibling_group_id — it's not on StudentRead, which FastAPI's response_model
  // strictly filters to. full-profile has no declared schema (raw dict), so
  // it's the only endpoint with a chance of actually carrying the field.
  let groupId = siblingGroupId;
  if (!groupId) {
    resultEl.innerHTML = '<p style="color:#888;">Loading&#8230;</p>';
    const res = await apiFetch(`${API_BASE}/students/${studentId}/full-profile`);
    const stu = (res && res.ok) ? await res.json().catch(() => null) : null;
    groupId = stu?.sibling_group_id || null;
  }
  if (!groupId) {
    resultEl.innerHTML =
      '<p style="color:#c0392b;font-size:0.88rem;">This student is not in a sibling group yet.</p>';
    return;
  }
  document.getElementById('sg-lookup-id').value = groupId;
  sgLookupById();
}

async function sgLookupById() {
  const id = document.getElementById('sg-lookup-id')?.value;
  const resultEl = document.getElementById('sg-lookup-result');
  if (!id) { showToast('Enter a Group ID or pick a student.', 'error'); return; }
  resultEl.innerHTML = '<p style="color:#888;">Loading&#8230;</p>';
  const res = await apiFetch(`${API_BASE}/receivables/sibling-groups/${id}`);
  if (!res || !res.ok) {
    _sgFoundGroup = null;
    resultEl.innerHTML = '<p style="color:#c0392b;font-size:0.88rem;">Group not found.</p>';
    return;
  }
  const group = await res.json().catch(() => null);
  _sgFoundGroup = group;
  if (!group) { resultEl.innerHTML = '<p style="color:#c0392b;font-size:0.88rem;">Group not found.</p>'; return; }
  rememberSiblingGroupId(group.id);

  resultEl.innerHTML = `
    <div style="background:#f9fafb;border:1px solid #e0e0e0;border-radius:6px;padding:16px;">
      <p><strong>Group #${group.id}</strong> — ${_finEsc(group.name || '')}</p>
      <p>Members: ${_sgMemberNamesHtml(group)}</p>
      <div style="display:flex;gap:10px;align-items:flex-start;margin-top:10px;">
        <div style="position:relative;flex:1;max-width:360px;">
          <input id="sg-add-student" class="fin-search-input" style="width:100%!important" placeholder="Add a student to this group&#8230;" oninput="sgAddStudentSearch(this.value)" autocomplete="off">
          <div id="sg-add-student-dd" class="fin-action-dropdown" style="display:none;max-height:200px;overflow-y:auto;position:absolute;top:100%;left:0;width:100%;z-index:100;"></div>
        </div>
      </div>
      ${_sgAdjustmentsHtml(group)}
    </div>`;
}

let _sgAddStudentId = null;

let _sgAddSearchTimer = null;
function sgAddStudentSearch(val) {
  clearTimeout(_sgAddSearchTimer);
  const dd = document.getElementById('sg-add-student-dd');
  if (!dd) return;
  if (!val.trim()) { dd.style.display = 'none'; return; }
  _sgAddSearchTimer = setTimeout(async () => {
    await loadFinanceStudents();
    const list = searchFinanceStudents(val);
    dd.innerHTML = list.length ? list.map(s => {
      const name = _finEsc(`${s.first_name||''} ${s.last_name||''}`.trim());
      const idLabel = _finEsc(s.student_id||'');
      return `<a href="#" class="fin-search-option" onclick="sgAddStudentSelect(${s.id},'${idLabel} — ${name}');return false;">
         <span class="fin-search-option-name">${name}</span>
         <span class="fin-search-option-sub">${idLabel}</span>
       </a>`;
    }).join('') : '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
    dd.style.display = 'block';
  }, 300);
}

function sgAddStudentSelect(studentId, label) {
  _sgAddStudentId = studentId;
  const inp = document.getElementById('sg-add-student');
  if (inp) inp.value = label;
  const dd = document.getElementById('sg-add-student-dd');
  if (dd) dd.style.display = 'none';
  sgSubmitAddStudent();
}

async function sgSubmitAddStudent() {
  if (!_sgFoundGroup || !_sgAddStudentId) return;
  const res = await apiFetch(`${API_BASE}/receivables/sibling-groups/${_sgFoundGroup.id}/add-student/${_sgAddStudentId}`, {
    method: 'POST',
  });
  if (res && res.ok) {
    rememberSiblingGroupId(_sgFoundGroup.id);
    showToast('Student added to sibling group.', 'success');
    sgLookupById();
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

async function loadSiblingGroupFormView(container) {
  _sgNewPicks = [null, null, null];
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Create Sibling Group</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Set-up &rsaquo; Sibling Groups &rsaquo; Create</div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        <div class="fin-form-group">
          <label class="fin-form-label">Group Name</label>
          <input id="sg-add-name" class="fin-form-input" placeholder="Optional — auto-derived from parent surname if left blank">
        </div>
        ${[0, 1, 2].map(i => `
          <div class="fin-form-group">
            <label class="fin-form-label">Student ${i + 1}${i === 0 ? ' <span class="fin-required">*</span>' : ' (optional)'}</label>
            <div style="position:relative;">
              <input id="sg-add-pick-${i}" class="fin-search-input" style="width:100%!important" placeholder="Search student by name or SOIS ID&#8230;" oninput="sgPickSearch(${i},this.value)" autocomplete="off">
              <div id="sg-add-pick-${i}-dd" class="fin-action-dropdown" style="display:none;max-height:200px;overflow-y:auto;position:absolute;top:100%;left:0;width:100%;z-index:100;"></div>
            </div>
          </div>`).join('')}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitSiblingGroupCreate()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('finance-sibling-groups')">Cancel</button>
        </div>
      </div>
    </div>`;
}

// Stays on /students/: this picker greys out children who are already in a
// sibling group, and sibling_group_id is not on the finance lookup shape.
async function sgPickSearch(slot, val) {
  const dd = document.getElementById(`sg-add-pick-${slot}-dd`);
  if (!dd) return;
  if (!val.trim()) { dd.style.display = 'none'; return; }
  const res = await apiFetch(`${API_BASE}/students/?search=${encodeURIComponent(val)}`);
  const list = (res && res.ok) ? await res.json() : [];
  dd.innerHTML = list.length ? list.slice(0, 10).map(s =>
    `<a href="#" onclick="sgPickSelect(${slot},${s.id},'${_finEsc(s.student_id||'')} — ${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())}',${s.sibling_group_id ?? 'null'});return false;">
       ${_finEsc(s.student_id||'')} — ${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())}${s.sibling_group_id ? ' <span style="color:#888;font-size:0.8em;">(already in a sibling group)</span>' : ''}
     </a>`
  ).join('') : '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
  dd.style.display = 'block';
}

function sgPickSelect(slot, studentId, label, siblingGroupId) {
  _sgNewPicks[slot] = { id: studentId, sibling_group_id: siblingGroupId || null };
  const inp = document.getElementById(`sg-add-pick-${slot}`);
  if (inp) inp.value = label;
  const dd = document.getElementById(`sg-add-pick-${slot}-dd`);
  if (dd) dd.style.display = 'none';
}

async function submitSiblingGroupCreate() {
  const picks = _sgNewPicks.filter(p => p != null);
  if (picks.length < 1) { showToast('Select at least one student.', 'error'); return; }
  if (picks.length > 3) { showToast('A sibling group can have at most 3 students.', 'error'); return; }

  // A student can only belong to one sibling group on the backend — POSTing a
  // brand-new group that includes someone already grouped 409s. If any pick is
  // already in a group, route everyone into that existing group via
  // add-student instead of creating a duplicate one.
  const targetGroupId = picks.find(p => p.sibling_group_id)?.sibling_group_id;

  if (targetGroupId) {
    for (const p of picks) {
      if (String(p.sibling_group_id) === String(targetGroupId)) continue;
      const res = await apiFetch(`${API_BASE}/receivables/sibling-groups/${targetGroupId}/add-student/${p.id}`, { method: 'POST' });
      if (!(res && res.ok)) { showToast('Error: ' + (res ? await parseApiError(res) : 'unknown error'), 'error'); return; }
    }
    rememberSiblingGroupId(targetGroupId);
    showToast('Student(s) added to the existing sibling group.', 'success');
    loadView('finance-sibling-groups');
    return;
  }

  const name = document.getElementById('sg-add-name')?.value.trim();
  const payload = { student_ids: picks.map(p => p.id) };
  if (name) payload.name = name;

  const res = await apiFetch(`${API_BASE}/receivables/sibling-groups/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    const saved = await res.json().catch(() => null);
    if (saved?.id) rememberSiblingGroupId(saved.id);
    showToast('Sibling group created.', 'success');
    loadView('finance-sibling-groups');
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

// Close all extended finance dropdowns on outside click
document.addEventListener('click', () => {
  ['fin-inv-adj-dd-','fin-spon-alloc-dd-','fin-fee-setup-dd-',
   'fin-rcv-dd-','fin-coa-dd-','fin-fee-acct-dd-'].forEach(prefix => {
    document.querySelectorAll(`[id^="${prefix}"]`).forEach(d => d.style.display = 'none');
  });
});

// ── Shared ID/ref generators ───────────────────────────────────
function _finGenRefNo(prefix, arr) {
  return prefix + String(arr.length + 1).padStart(4, '0');
}

// ==================== CHANGE 1: INVOICE ADJUSTMENTS ====================

let _invAdjPerPage = 10, _invAdjPage = 1, _invAdjSearch = '';

async function loadInvoiceAdjustmentsView(container) {
  await renderSplitView({
    container,
    moduleKey: 'finance.student_finance',
    title: 'Invoice Adjustments',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-invoice-adjustments'},
      {label:'Invoice Adjustments'}
    ],
    apiUrl: `${API_BASE}/finance/invoice-adjustments/`,
    searchFields: ['referenceNo','admissionNo','names'],
    col1Label: 'Reference No', col2Label: 'Type / Date',
    col1: a => a.referenceNo || '—',
    col2: a => a.studentType || a.adjustmentDate || '—',
    rowLabel: a => a.referenceNo || '—',
    rowSub:   a => a.adjustmentDate || '',
    idKey: 'id',
    detailFields: [
      {label:'Reference No',   key:'referenceNo', fmt:v=>v||'—'},
      {label:'Adjustment Date',key:'adjustmentDate', fmt:v=>v||'—'},
      {label:'Student Type',   key:'studentType', fmt:v=>v||'—'},
      {label:'Cost Center',    key:'costCenter', fmt:v=>v||'—'},
      {label:'Reason',         key:'reason', fmt:v=>v||'—'},
    ],
    renderAdd: _finAddPlaceholder('Invoice Adjustment', "renderInvAdjAddPage(document.getElementById('main-content'))", 'Record an adjustment against a student invoice.'),
    onAdd:  () => renderInvAdjAddPage(document.getElementById('main-content')),
    onEdit: item => openInvAdjDetail(item.id),
  });
}

function _renderInvAdjListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Invoice Adjustment</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Invoice Adjustment &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="inv-adj-per-page" onchange="changeInvAdjPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===_invAdjPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="inv-adj-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" placeholder="&#128269; Search&#8230;"
                 oninput="onInvAdjSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
          <button class="fin-btn-teal" onclick="renderInvAdjAddPage(document.getElementById('main-content'))">+ Add</button>
        </div>
      </div>
      <div id="inv-adj-table-container"></div>
      <div id="inv-adj-pagination"></div>
    </div>`;
  _renderInvAdjTable();
}

function _invAdjFiltered() {
  if (!_invAdjSearch) return studentInvoiceAdjustmentsData;
  const q = _invAdjSearch;
  return studentInvoiceAdjustmentsData.filter(a =>
    (a.referenceNo||'').toLowerCase().includes(q) ||
    (a.admissionNo||'').toLowerCase().includes(q) ||
    (a.names||'').toLowerCase().includes(q));
}

function _renderInvAdjTable() {
  const filtered = _invAdjFiltered();
  const totalEl  = document.getElementById('inv-adj-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_invAdjPage-1)*_invAdjPerPage;
  const paged = filtered.slice(start, start+_invAdjPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length/_invAdjPerPage));

  let rows = paged.length === 0
    ? `<tr><td colspan="9" class="fin-empty">No records found.</td></tr>`
    : paged.map(a => `<tr>
        <td>${_finEsc(a.referenceNo||'')}</td>
        <td>${_finEsc(a.costCenter||'-')}</td>
        <td>${_finEsc(a.admissionNo||'-')}</td>
        <td>${_finEsc(a.names||'-')}</td>
        <td>${_finFmt(a.amount||0)}</td>
        <td>${_finEsc(a.stay||'-')}</td>
        <td>${_finEsc(a.class||'-')}</td>
        <td>${_finEsc(a.cohort||'-')}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinInvAdjDropdown(event,'${a.id}')">&#8230;</button>
            <div id="fin-inv-adj-dd-${a.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openInvAdjDetail('${a.id}');return false;">&#128065; View Detail</a>
            </div>
          </div>
        </td>
      </tr>`).join('');

  const el = document.getElementById('inv-adj-table-container');
  if (el) el.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>REFERENCE NO</th><th>COST CENTER</th><th>ADMISSION NO.</th>
          <th>NAMES</th><th>AMOUNT</th><th>STAY</th><th>CLASS</th><th>COHORT</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  let pg = '';
  for (let i=1;i<=pages;i++) pg+=`<button class="${i===_invAdjPage?'fin-pg-active':''}" onclick="invAdjGoPage(${i})">${i}</button>`;
  const pgEl = document.getElementById('inv-adj-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pg}</div>`;
}

function toggleFinInvAdjDropdown(e,id) {
  e.stopPropagation();
  document.querySelectorAll('[id^="fin-inv-adj-dd-"]').forEach(d=>{ if(d.id!==`fin-inv-adj-dd-${id}`) d.style.display='none'; });
  const dd=document.getElementById(`fin-inv-adj-dd-${id}`);
  if(dd) dd.style.display=dd.style.display==='none'?'block':'none';
}
function changeInvAdjPerPage(v) { _invAdjPerPage=parseInt(v); _invAdjPage=1; _renderInvAdjTable(); }
function onInvAdjSearch(v)      { _invAdjSearch=v.trim().toLowerCase(); _invAdjPage=1; _renderInvAdjTable(); }
function invAdjGoPage(p)        { _invAdjPage=p; _renderInvAdjTable(); }

function openInvAdjDetail(id) {
  document.querySelectorAll('[id^="fin-inv-adj-dd-"]').forEach(d=>d.style.display='none');
  const adj = studentInvoiceAdjustmentsData.find(a=>a.id===id);
  if (!adj) return;
  _renderInvAdjDetailPage(document.getElementById('main-content'), adj);
}

function _renderInvAdjDetailPage(container, adj) {
  const feeRows = (adj.lineItems||[]).map(li=>`
    <tr><td>${_finEsc(li.account||'')}</td><td>${_finFmt(li.amount||0)}</td></tr>`).join('') ||
    `<tr><td colspan="2" class="fin-empty">No records found.</td></tr>`;
  const studRows = (adj.students||[]).map(s=>`
    <tr><td>${_finEsc(s.admissionNo||'')}</td><td>${_finEsc(s.name||'')}</td><td>${_finEsc(s.class||'')}</td></tr>`).join('') ||
    `<tr><td colspan="3" class="fin-empty">No records found.</td></tr>`;

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Invoice Adjustment</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-invoice-adjustments');return false;">Invoice Adjustment</a>
          &rsaquo; Show
        </div>
      </div>
      <div class="fin-info-grid">
        <div class="fin-info-item"><span class="fin-info-label">Reference No.</span><span class="fin-info-value">${_finEsc(adj.referenceNo||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Adjustment Date</span><span class="fin-info-value">${_finEsc(adj.adjustmentDate||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Student Type</span><span class="fin-info-value">${_finEsc(adj.studentType||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Reason</span><span class="fin-info-value">${_finEsc(adj.reason||'-')}</span></div>
      </div>
      <div class="fin-section-label">List of Students</div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>ADMISSION NO.</th><th>NAME</th><th>CLASS</th></tr></thead>
        <tbody>${studRows}</tbody>
      </table></div>
      <div class="fin-section-label" style="margin-top:20px;">Fee Items / Accounts</div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>ACCOUNT VOTE/HEAD</th><th>AMOUNT</th></tr></thead>
        <tbody>${feeRows}</tbody>
      </table></div>
      <div class="fin-form-actions" style="margin-top:20px;">
        <button class="fin-btn-cancel" onclick="loadView('fin-invoice-adjustments')">Back</button>
      </div>
    </div>`;
}

function renderInvAdjAddPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Invoice Adjustment</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-invoice-adjustments');return false;">Invoice Adjustment</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:700px;">
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Adjustment Date <span class="fin-required">*</span></label>
            <input type="date" id="ia-date" class="fin-form-input">
            <span class="fin-field-error" id="ia-date-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Student Type <span class="fin-required">*</span></label>
            <select id="ia-student-type" class="fin-form-select">
              <option value="">Please Select</option>
              <option value="Day">Day</option>
              <option value="Boarding">Boarding</option>
            </select>
            <span class="fin-field-error" id="ia-type-err"></span>
          </div>
        </div>

        <div class="fin-section-label">List of Students</div>
        <div class="fin-table-wrap" style="margin-bottom:14px;">
          <table class="fin-table" id="ia-students-table">
            <thead><tr><th>ADMISSION NO.</th><th>NAME</th><th>CLASS</th><th></th></tr></thead>
            <tbody id="ia-students-body">
              <tr><td colspan="4" class="fin-empty">No students added.</td></tr>
            </tbody>
          </table>
        </div>
        <button class="fin-btn-li-add" onclick="addIaStudent()" style="margin-bottom:18px;">+ Add Student</button>

        <div class="fin-section-label">Fee Items / Accounts</div>
        <div class="fin-table-wrap" style="margin-bottom:14px;">
          <table class="fin-table">
            <thead><tr><th>ACCOUNT VOTE/HEAD</th><th>AMOUNT</th><th></th></tr></thead>
            <tbody id="ia-fee-body"></tbody>
          </table>
        </div>
        <button class="fin-btn-li-add" onclick="addIaFeeItem()" style="margin-bottom:18px;">Add Account</button>

        <div class="fin-form-group">
          <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
          <textarea id="ia-reason" class="fin-form-textarea" rows="3"></textarea>
          <span class="fin-field-error" id="ia-reason-err"></span>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitInvAdjAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-invoice-adjustments')">Cancel</button>
        </div>
      </div>
    </div>`;
}

function addIaStudent() {
  const body = document.getElementById('ia-students-body');
  if (!body) return;
  const t = Date.now();
  const empty = body.querySelector('[colspan]');
  if (empty) empty.parentElement.remove();
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="fin-li-input" id="ia-s-adm-${t}" placeholder="Admission No."></td>
    <td><input class="fin-li-input" id="ia-s-name-${t}" placeholder="Name"></td>
    <td><input class="fin-li-input" id="ia-s-class-${t}" placeholder="Class"></td>
    <td><button class="fin-btn-li-rm" onclick="this.closest('tr').remove()">&#10005;</button></td>`;
  body.appendChild(tr);
}

function addIaFeeItem() {
  const body = document.getElementById('ia-fee-body');
  if (!body) return;
  const t = Date.now();
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="fin-li-input" id="ia-f-acct-${t}" placeholder="Account Vote/Head"></td>
    <td><input type="number" class="fin-li-input" id="ia-f-amt-${t}" placeholder="0.00" step="0.01"></td>
    <td><button class="fin-btn-li-rm" onclick="this.closest('tr').remove()">&#10005;</button></td>`;
  body.appendChild(tr);
}

async function submitInvAdjAdd() {
  const date   = document.getElementById('ia-date').value;
  const type   = document.getElementById('ia-student-type').value;
  const reason = (document.getElementById('ia-reason').value||'').trim();
  let valid = true;
  document.getElementById('ia-date-err').textContent   = date   ? '' : 'This field is required.'; if(!date)   valid=false;
  document.getElementById('ia-type-err').textContent   = type   ? '' : 'This field is required.'; if(!type)   valid=false;
  document.getElementById('ia-reason-err').textContent = reason ? '' : 'This field is required.'; if(!reason) valid=false;
  if (!valid) return;

  const students = [], lineItems = [];
  document.querySelectorAll('#ia-students-body tr').forEach(tr=>{
    const admEl  = tr.querySelector('[id^="ia-s-adm-"]');
    const nameEl = tr.querySelector('[id^="ia-s-name-"]');
    const clsEl  = tr.querySelector('[id^="ia-s-class-"]');
    if (admEl) students.push({ admission_no: admEl.value, name: nameEl?.value||'', class_name: clsEl?.value||'' });
  });
  document.querySelectorAll('#ia-fee-body tr').forEach(tr=>{
    const acctEl = tr.querySelector('[id^="ia-f-acct-"]');
    const amtEl  = tr.querySelector('[id^="ia-f-amt-"]');
    if (acctEl) lineItems.push({ account: acctEl.value, amount: parseFloat(amtEl?.value)||0 });
  });

  const total   = lineItems.reduce((s,li)=>s+li.amount, 0);
  const payload = { adjustment_date: date, student_type: type, reason, students, line_items: lineItems, amount: total };
  try {
    const res = await fetch(`${API_BASE}/finance/invoice-adjustments/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) { showToast('Adjustment saved!', 'success'); }
    else { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-invoice-adjustments');
}

// ==================== CHANGE 2: SPONSORSHIP ALLOCATIONS ====================

let _sponAllocPerPage = 10, _sponAllocPage = 1, _sponAllocSearch = '';

async function loadSponsorshipAllocationsView(container) {
  await renderSplitView({
    container,
    moduleKey: 'finance.student_finance',
    title: 'Sponsorship Allocations',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-sponsorship-allocations'},
      {label:'Sponsorship Allocations'}
    ],
    apiUrl: `${API_BASE}/finance/sponsorship-allocations/`,
    searchFields: ['sponsorName','studentName','referenceNumber'],
    col1Label: 'Sponsor', col2Label: 'Student',
    col1: a => a.sponsorName || '—',
    col2: a => a.studentName || '—',
    rowLabel: a => a.sponsorName || a.referenceNumber || '—',
    rowSub:   a => a.studentName || '',
    idKey: 'id',
    detailFields: [
      {label:'Reference',    key:'referenceNumber', fmt:v=>v||'—'},
      {label:'Sponsor',      key:'sponsorName', fmt:v=>v||'—'},
      {label:'Student',      key:'studentName', fmt:v=>v||'—'},
      {label:'Cost Center',  key:'costCenter', fmt:v=>v||'—'},
      {label:'Amount',       key:'amount', fmt:v=>_finFmt(parseFloat(v)||0)},
    ],
    renderAdd: _finAddPlaceholder('Sponsorship Allocation', "renderSponAllocAddPage(document.getElementById('main-content'))", 'Allocate a sponsorship to a student.'),
    onAdd: () => renderSponAllocAddPage(document.getElementById('main-content')),
  });
}

function _renderSponAllocListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Sponsorship Allocation</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Sponsorship Allocation &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="spon-per-page" onchange="changeSponPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===_sponAllocPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="spon-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" placeholder="&#128269; Search&#8230;"
                 oninput="onSponSearch(this.value)">
          <button class="fin-btn-teal" onclick="renderSponAllocAddPage(document.getElementById('main-content'))">Add Sponsorship Allocation</button>
        </div>
      </div>
      <div id="spon-table-container"></div>
      <div id="spon-pagination"></div>
    </div>`;
  _renderSponAllocTable();
}

function _sponFiltered() {
  if (!_sponAllocSearch) return sponsorshipAllocationsData;
  const q = _sponAllocSearch;
  return sponsorshipAllocationsData.filter(a =>
    (a.sponsorName||'').toLowerCase().includes(q) ||
    (a.studentName||'').toLowerCase().includes(q) ||
    (a.referenceNumber||'').toLowerCase().includes(q));
}

function _renderSponAllocTable() {
  const filtered = _sponFiltered();
  const totalEl  = document.getElementById('spon-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_sponAllocPage-1)*_sponAllocPerPage;
  const paged = filtered.slice(start, start+_sponAllocPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length/_sponAllocPerPage));

  let rows = paged.length === 0
    ? `<tr><td colspan="8" class="fin-empty">No records found.</td></tr>`
    : paged.map(a=>`<tr>
        <td>${_finEsc(a.referenceNumber||'')}</td>
        <td>${_finEsc(a.costCenter||'-')}</td>
        <td>${_finEsc(a.sponsorName||'-')}</td>
        <td>${_finEsc(a.studentName||'-')}</td>
        <td>${_finFmt(a.amount||0)}</td>
        <td>${_finEsc(a.createdAt||'-')}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinSponAllocDropdown(event,'${a.id}')">&#8230;</button>
            <div id="fin-spon-alloc-dd-${a.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openSponAllocDetail('${a.id}');return false;">&#128065; View Detail</a>
            </div>
          </div>
        </td>
      </tr>`).join('');

  const el = document.getElementById('spon-table-container');
  if (el) el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>REFERENCE NUMBER</th><th>COST CENTER</th>
        <th>SPONSOR NAME</th><th>STUDENT NAME</th><th>AMOUNT</th><th>CREATED AT</th><th>ACTION</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  let pg=''; for(let i=1;i<=pages;i++) pg+=`<button class="${i===_sponAllocPage?'fin-pg-active':''}" onclick="sponGoPage(${i})">${i}</button>`;
  const pgEl=document.getElementById('spon-pagination');
  if(pgEl) pgEl.innerHTML=`<div class="fin-pagination">${pg}</div>`;
}

function toggleFinSponAllocDropdown(e,id) {
  e.stopPropagation();
  document.querySelectorAll('[id^="fin-spon-alloc-dd-"]').forEach(d=>{ if(d.id!==`fin-spon-alloc-dd-${id}`) d.style.display='none'; });
  const dd=document.getElementById(`fin-spon-alloc-dd-${id}`);
  if(dd) dd.style.display=dd.style.display==='none'?'block':'none';
}
function changeSponPerPage(v){ _sponAllocPerPage=parseInt(v); _sponAllocPage=1; _renderSponAllocTable(); }
function onSponSearch(v)     { _sponAllocSearch=v.trim().toLowerCase(); _sponAllocPage=1; _renderSponAllocTable(); }
function sponGoPage(p)       { _sponAllocPage=p; _renderSponAllocTable(); }

function openSponAllocDetail(id) {
  document.querySelectorAll('[id^="fin-spon-alloc-dd-"]').forEach(d=>d.style.display='none');
  const alloc = sponsorshipAllocationsData.find(a=>a.id===id);
  if (!alloc) return;
  _renderSponAllocDetailPage(document.getElementById('main-content'), alloc);
}

function _renderSponAllocDetailPage(container, alloc) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Sponsorship Allocation</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-sponsorship-allocations');return false;">Sponsorship Allocation</a>
          &rsaquo; Show
        </div>
      </div>
      <div class="fin-send-row">
        <button class="fin-btn-teal" onclick="window.print()">Print Receipt</button>
      </div>
      <div class="fin-info-grid">
        <div class="fin-info-item"><span class="fin-info-label">Sponsor Name</span><span class="fin-info-value">${_finEsc(alloc.sponsorName||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Reference Number</span><span class="fin-info-value">${_finEsc(alloc.referenceNumber||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Admission No.</span><span class="fin-info-value">${_finEsc(alloc.admissionNo||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Amount</span><span class="fin-info-value">${_finFmt(alloc.amount||0)}</span></div>
      </div>
      <div class="fin-section-label">Student Information</div>
      <div class="fin-info-grid">
        <div class="fin-info-item"><span class="fin-info-label">Name</span><span class="fin-info-value">${_finEsc(alloc.studentName||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Class</span><span class="fin-info-value">${_finEsc(alloc.class||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Cohort</span><span class="fin-info-value">${_finEsc(alloc.cohort||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Balance</span><span class="fin-info-value">${_finEsc(alloc.balance||'-')}</span></div>
      </div>
      <div class="fin-form-actions" style="margin-top:20px;">
        <button class="fin-btn-cancel" onclick="loadView('fin-sponsorship-allocations')">Back</button>
      </div>
    </div>`;
}

function renderSponAllocAddPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Sponsorship Allocation</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-sponsorship-allocations');return false;">Sponsorship Allocation</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Sponsor Name <span class="fin-required">*</span></label>
            <input type="text" id="sa-sponsor-name" class="fin-form-input">
            <span class="fin-field-error" id="sa-sponsor-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Admission No. <span class="fin-required">*</span></label>
            <input type="text" id="sa-adm-no" class="fin-form-input">
            <span class="fin-field-error" id="sa-adm-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Student Name</label>
            <input type="text" id="sa-student-name" class="fin-form-input">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Amount <span class="fin-required">*</span></label>
            <input type="number" id="sa-amount" class="fin-form-input" step="0.01" min="0">
            <span class="fin-field-error" id="sa-amount-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Class</label>
            <input type="text" id="sa-class" class="fin-form-input">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Cost Center</label>
            <input type="text" id="sa-cost-center" class="fin-form-input">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Cohort</label>
            <input type="text" id="sa-cohort" class="fin-form-input">
          </div>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitSponAllocAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-sponsorship-allocations')">Cancel</button>
        </div>
      </div>
    </div>`;
}

async function submitSponAllocAdd() {
  const sponsor = (document.getElementById('sa-sponsor-name').value||'').trim();
  const admNo   = (document.getElementById('sa-adm-no').value||'').trim();
  const amount  = parseFloat(document.getElementById('sa-amount').value)||0;
  let valid=true;
  document.getElementById('sa-sponsor-err').textContent = sponsor ? '' : 'This field is required.'; if(!sponsor) valid=false;
  document.getElementById('sa-adm-err').textContent     = admNo   ? '' : 'This field is required.'; if(!admNo)   valid=false;
  document.getElementById('sa-amount-err').textContent  = amount>0? '' : 'Amount must be greater than 0.'; if(!amount) valid=false;
  if (!valid) return;

  const payload = {
    sponsor_name: sponsor, admission_no: admNo, amount,
    student_name: document.getElementById('sa-student-name').value||'',
    class:        document.getElementById('sa-class').value||'',
    cost_center:  document.getElementById('sa-cost-center').value||'',
    cohort:       document.getElementById('sa-cohort').value||''
  };
  try {
    const res = await fetch(`${API_BASE}/finance/sponsorship-allocations/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) { showToast('Sponsorship allocation saved!', 'success'); }
    else { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-sponsorship-allocations');
}

// ==================== CHANGE 5: RECEIVE PAYMENTS ====================

let _rcvPayPerPage = 10, _rcvPayPage = 1, _rcvPaySearch = '';

// Method filter chips (addendum 2026-08-26 §A.5). /receivables/receipts takes
// no payment_method query param, so this filters the already-fetched list
// client-side via renderSplitView's listFilterFn hook.
let _rcvPayMethodFilter = '';

function _rcvPayMethodChipsHtml() {
  const chip = (val, label) => {
    const on = _rcvPayMethodFilter === val;
    return `<button type="button" class="fin-btn-outline" onclick="_rcvPaySetMethodFilter('${val}')"
      style="padding:4px 11px;font-size:0.78rem;${on ? 'background:var(--navy-700,#1B3057);color:#fff;border-color:var(--navy-700,#1B3057);' : ''}">${label}</button>`;
  };
  return `<div style="display:flex;gap:6px;padding:8px 12px;flex-wrap:wrap;">
    ${chip('', 'All')}${RECEIPT_PAYMENT_METHODS.map(([v, l]) => chip(v, l)).join('')}
  </div>`;
}

function _rcvPaySetMethodFilter(v) {
  _rcvPayMethodFilter = v;
  loadView('fin-receive-payments');
}

async function loadReceivePaymentsView(container) {
  await _invLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.receivables',
    title: 'Receive Payments',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-receive-payments'},
      {label:'Receive Payments'}
    ],
    apiUrl: `${API_BASE}/receivables/receipts`,
    searchFields: ['receipt_number','reference'],
    listFilters: _rcvPayMethodChipsHtml(),
    listFilterFn: p => !_rcvPayMethodFilter || p.payment_method === _rcvPayMethodFilter,
    col1Label: 'Receipt No', col2Label: 'Student',
    col1: p => p.receipt_number || `#${p.id}`,
    col2: p => _invStudentName(p.student_id) || '—',
    rowLabel: p => p.receipt_number || `#${p.id}`,
    rowSub:   p => _invStudentName(p.student_id) || '',
    idKey: 'id',
    detailFields: [
      {label:'Receipt No',    key:'receipt_number', fmt:v=>v||'—'},
      {label:'Student',       key:'student_id', fmt:v=>_invStudentName(v)},
      {label:'Invoice',       key:'fee_invoice_id', fmt:v=>v?`#${v}`:'—'},
      {label:'Payment Method',key:'payment_method', fmt:v=>receiptMethodLabel(v)},
      {label:'Reference',     key:'reference', fmt:v=>v||'—'},
      {label:'Date',          key:'payment_date', fmt:v=>v?v.split('T')[0]:'—'},
      {label:'Amount',        key:'amount', fmt:v=>_finFmt(parseFloat(v)||0)},
      {label:'Voided',        key:'voided', fmt:v=>v?'Yes':'No'},
    ],
    renderAdd: _finInfoPlaceholder('Payments are recorded from a Fee Invoice — open the invoice and click Record Payment.', "loadView('fin-fee-invoices')", 'Go to Fee Invoices'),
    onAdd: () => {
      showToast('Payments are recorded from a Fee Invoice — open the invoice and click Record Payment.', 'info');
      loadView('fin-fee-invoices');
    },
    detailActions: p => {
      window._rcvReceiptCache = window._rcvReceiptCache || {};
      window._rcvReceiptCache[p.id] = p;
      return `<button class="btn" onclick="openReceiptPdf(${p.id})">&#128438; Print Receipt</button>`;
    },
  });
  container.insertAdjacentHTML('beforeend', _paAllocationsSectionHtml());
}

// ── Payment Allocations by Student (2026-08-18) — PaymentAllocationRead.
// voided/voided_at shipped live; this is genuinely new surface (no existing
// view reads allocations at all — confirmed nothing to remove per the audit).
// This is a different, older resource (PaymentRead, via
// /receivables/student-finance/payments/student/{id}) than the Receipt list
// above (FinReceiptRead, via /receivables/receipts) — separate lookup rather
// than merged into the split view above.
//
// "Payment history" per the addendum's own framing → dim voided rows rather
// than hide them (contrast with a balance drilldown, which would filter them
// out — no such drilldown exists in this codebase to apply that half to).
function _paAllocationsSectionHtml() {
  return `
    <div class="fin-filter-section" style="margin-top:24px;">
      <div class="fin-section-label">Payment Allocations by Student</div>
      <div style="position:relative;max-width:420px;">
        <input id="pa-student-search" class="fin-search-input" style="width:100%!important" placeholder="Search student by name or SOIS ID&#8230;" oninput="_paStudentSearch(this.value)" autocomplete="off">
        <div id="pa-student-dd" class="fin-action-dropdown" style="display:none;max-height:220px;overflow-y:auto;position:absolute;top:100%;left:0;width:100%;z-index:100;"></div>
      </div>
      <div id="pa-results" style="margin-top:14px;"></div>
    </div>`;
}

let _paSearchTimer = null;
function _paStudentSearch(val) {
  clearTimeout(_paSearchTimer);
  const dd = document.getElementById('pa-student-dd');
  if (!dd) return;
  if (!val.trim()) { dd.style.display = 'none'; return; }
  // The finance lookup takes no ?search=, so the match is client-side over the
  // cached list. The debounce stays: it now saves re-rendering the dropdown on
  // every keystroke rather than saving a round trip.
  _paSearchTimer = setTimeout(async () => {
    await loadFinanceStudents();
    const list = searchFinanceStudents(val);
    dd.innerHTML = list.length ? list.map(s => {
      const name = _finEsc(`${s.first_name||''} ${s.last_name||''}`.trim());
      const idLabel = _finEsc(s.student_id||'');
      return `<a href="#" class="fin-search-option" onclick="_paStudentSelect(${s.id},'${idLabel} — ${name}');return false;">
         <span class="fin-search-option-name">${name}</span>
         <span class="fin-search-option-sub">${idLabel}</span>
       </a>`;
    }).join('') : '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
    dd.style.display = 'block';
  }, 300);
}

async function _paStudentSelect(studentId, label) {
  const inp = document.getElementById('pa-student-search');
  if (inp) inp.value = label;
  const dd = document.getElementById('pa-student-dd');
  if (dd) dd.style.display = 'none';
  const resultsEl = document.getElementById('pa-results');
  resultsEl.innerHTML = '<p style="color:#888;">Loading&#8230;</p>';
  const res = await apiFetch(`${API_BASE}/receivables/student-finance/payments/student/${studentId}`);
  if (!res || !res.ok) { resultsEl.innerHTML = `<p style="color:#c0392b;font-size:0.88rem;">${res ? _finEsc(await parseApiError(res)) : 'Network error.'}</p>`; return; }
  const payments = _toArray(await res.json());
  if (!payments.length) { resultsEl.innerHTML = '<p style="color:#888;font-size:0.88rem;">No payments found for this student.</p>'; return; }
  resultsEl.innerHTML = payments.map(p => `
    <div style="background:#f9fafb;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div><strong>${_finEsc(p.receipt_number || ('Payment #' + p.id))}</strong> &middot; ${_finEsc(receiptMethodLabel(p.payment_method))}</div>
        <div>${_finFmt(parseFloat(p.amount)||0)} &middot; ${_finEsc((p.payment_date||'').split('T')[0]||'')}</div>
      </div>
      ${(p.allocations||[]).length ? `
      <table class="fin-li-table" style="margin-top:8px;">
        <thead><tr><th>Fee Line</th><th style="text-align:right;">Allocated</th><th>Status</th></tr></thead>
        <tbody>${p.allocations.map(a => `
          <tr style="${a.voided ? 'opacity:0.5;text-decoration:line-through;' : ''}">
            <td>#${a.student_fee_id}</td>
            <td style="text-align:right;">${_finFmt(parseFloat(a.amount_allocated)||0)}</td>
            <td style="text-decoration:none;">${a.voided ? `<span style="color:var(--coral-600);font-weight:600;">Voided${a.voided_at ? ' ' + _pvDate(a.voided_at) : ''}</span>` : '<span style="color:#1e7e34;">Active</span>'}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<p style="color:#888;font-size:0.82rem;margin-top:6px;">No allocation lines.</p>'}
    </div>`).join('');
}

// Receipt PDF — same standalone-document pattern/theme as the Fee Statement
// (see openStudentFeeStatement in students.js: navy #1d2d50 / gold #c9a227,
// same panel/table CSS, same synchronous-window.open-before-any-await fix
// for popup blockers). Reads the receipt record from the cache detailActions
// above populates (already the full row from Receive Payments' own fetch, no
// need to re-fetch it or thread it through the onclick attribute — passing a
// whole object through an inline onclick means escaping embedded quotes,
// which this sidesteps entirely) and only fetches the one thing it doesn't
// have: the invoice this receipt was applied against, for context.
async function openReceiptPdf(receiptId) {
  const receipt = (window._rcvReceiptCache || {})[receiptId];
  if (!receipt) { showToast('Receipt not found — please reselect it from the list.', 'error'); return; }
  const win = window.open('', '_blank');
  if (!win) { showToast('Please allow pop-ups to view the receipt.', 'error'); return; }
  win.document.write('<p style="font-family:Arial,sans-serif;padding:24px;color:#888;">Loading receipt&#8230;</p>');

  if (!_invStudentsCache.length) await _invLoadLookups();
  let invoice = null;
  if (receipt.fee_invoice_id) {
    try {
      const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/${receipt.fee_invoice_id}`);
      if (res && res.ok) invoice = await res.json();
    } catch (_) {}
  }

  const studentName = _invStudentName(receipt.student_id);
  const student      = _invStudentsCache.find(s => String(s.id) === String(receipt.student_id));
  const admissionNo  = student?.student_id || '-';
  const receiptNo    = receipt.receipt_number || `#${receipt.id}`;
  const paymentDate  = receipt.payment_date ? receipt.payment_date.split('T')[0] : '-';
  const printedOn    = new Date().toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const methodLabel  = receiptMethodLabel(receipt.payment_method);
  const amount       = parseFloat(receipt.amount) || 0;

  win.document.open();
  win.document.write(`
    <html><head><title>Receipt ${_finEsc(receiptNo)} - ${_finEsc(studentName)}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px;margin:30px auto;padding:0 16px;}
      .crest{color:#c9a227;text-align:center;font-size:0.8rem;letter-spacing:1px;margin-bottom:4px;}
      h1{color:#1d2d50;text-align:center;margin:0 0 4px;font-size:1.6rem;}
      .addr{text-align:center;color:#444;font-size:0.85rem;margin:0;}
      .motto{text-align:center;color:#c9a227;font-style:italic;font-size:0.85rem;margin:4px 0 14px;}
      .rule{border:none;border-top:3px solid #c9a227;margin:0 0 16px;}
      .stmt-title{text-align:center;font-weight:700;margin-bottom:16px;}
      .panel{border:1px solid #d8d8d8;margin-bottom:14px;border-collapse:collapse;width:100%;}
      .panel-head{background:#1d2d50;color:#fff;padding:8px 16px;font-weight:700;}
      .info-cell{padding:8px 16px;border-bottom:1px solid #eee;font-size:0.9rem;}
      .info-label{font-weight:700;display:inline-block;min-width:110px;}
      table{width:100%;border-collapse:collapse;}
      .acct-head th{background:#1d2d50;color:#fff;text-align:left;padding:10px 16px;}
      .acct-head th:last-child{text-align:right;}
      .total-row td{background:#c9a227;font-weight:700;padding:10px 16px;}
      .total-row td:last-child{text-align:right;}
      .footnote{font-size:0.75rem;color:#777;margin:8px 0 18px;}
      .closing{font-size:0.8rem;color:#555;margin-top:16px;}
      .voided-stamp{color:#c0392b;text-align:center;font-weight:700;font-size:1.3rem;letter-spacing:3px;border:3px solid #c0392b;padding:6px;margin-bottom:16px;transform:rotate(-3deg);}
      @media print { .no-print{display:none;} }
    </style></head>
    <body>
      <div class="crest">[ OFFICIAL CREST ]</div>
      <h1>Seven Oaks International School</h1>
      <p class="addr">143 Brookview, Membley | Email: admin@sevenoaks.ac | Phone: 07 XXX XXX XX</p>
      <p class="motto">Rooted in God &middot; Growing through our Pillars &middot; From seed to oak</p>
      <hr class="rule">
      <div class="stmt-title">Official Payment Receipt</div>
      ${receipt.voided ? '<div class="voided-stamp">VOIDED</div>' : ''}

      <table class="panel">
        <tr><td colspan="4" class="panel-head">Receipt Details</td></tr>
        <tr><td class="info-cell"><span class="info-label">Receipt No.</span>${_finEsc(receiptNo)}</td><td class="info-cell"><span class="info-label">Date</span>${_finEsc(paymentDate)}</td></tr>
        <tr><td class="info-cell"><span class="info-label">Received From</span>${_finEsc(studentName)}</td><td class="info-cell"><span class="info-label">Admission No.</span>${_finEsc(admissionNo)}</td></tr>
        <tr><td class="info-cell"><span class="info-label">Invoice Ref.</span>${_finEsc(invoice?.invoice_number || (receipt.fee_invoice_id ? `#${receipt.fee_invoice_id}` : '—'))}</td><td class="info-cell"><span class="info-label">Printed On</span>${_finEsc(printedOn)}</td></tr>
      </table>

      <table class="panel" style="margin-bottom:0;">
        <thead><tr class="acct-head"><th>Payment Method</th><th>Reference</th><th style="text-align:right;">Amount (KES)</th></tr></thead>
        <tbody>
          <tr><td style="padding:10px 16px;">${_finEsc(methodLabel)}</td><td style="padding:10px 16px;">${_finEsc(receipt.reference || '—')}</td><td style="padding:10px 16px;text-align:right;">${amount.toLocaleString()}</td></tr>
        </tbody>
        <tfoot>
          <tr class="total-row"><td colspan="2">AMOUNT RECEIVED</td><td>${amount.toLocaleString()}</td></tr>
        </tfoot>
      </table>
      <p class="footnote">*This receipt confirms payment received against the invoice referenced above.</p>

      <p class="closing">Thank you for partnering with us in your child's journey &mdash; from seed to oak.</p>

      <div class="no-print" style="text-align:center;margin-top:20px;">
        <button onclick="window.print()" style="padding:8px 22px;font-size:0.95rem;">Print</button>
      </div>
    </body></html>`);
  win.document.close();
}


// ==================== CHANGE 7: CHART OF ACCOUNTS ====================

let _coaPerPage = 10, _coaPage = 1, _coaSearch = '';

// chartOfAccountsData (global, config.js) backs the Parent Account dropdown and
// openCoaEdit's lookup-by-id in _coaFormHtml/openCoaEdit/_coaParentName — it was
// declared but never populated anywhere, so Edit silently no-op'd (acct always
// undefined) and the Parent dropdown was always empty. Always load the full
// unfiltered account list here regardless of entry point (Chart of Accounts or
// the is_student_fees_related-filtered Fee Accounts view), since a fee account's
// parent can be a non-fee account.
async function _coaLoadCache() {
  const res = await apiFetch(`${API_BASE}/accounts/`);
  chartOfAccountsData.length = 0;
  if (res && res.ok) _toArray(await res.json()).forEach(a => chartOfAccountsData.push(a));
  // Warm the sub-type catalog here rather than in each caller, so every screen
  // that renders a Subtype picker (Chart of Accounts, Fee Accounts, and the
  // Reclassify modal they both open) has it before the synchronous
  // _coaSubtypeOptions() runs. Cached after the first call, so this is one
  // extra request per session, not per screen.
  await _astLoad();
}

async function loadChartOfAccountsView(container) {
  await _coaLoadCache();
  const cfg = {
    container,
    moduleKey: 'finance.utilities',
    title: 'Chart of Accounts',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-chart-of-accounts'},
      {label:'Chart of Accounts'}
    ],
    apiUrl: `${API_BASE}/accounts/`,
    searchFields: ['account_name','number','account_type','account_subtype'],
    col1Label: 'Account Name', col2Label: 'Type / Subtype',
    col1: a => a.account_name || '—',
    col2: a => `${a.account_type||'—'} · ${a.account_subtype||'Unclassified'}`,
    rowLabel: a => a.account_name || '—',
    rowSub:   a => `#${a.number||''}`,
    idKey: 'id',
    detailFields: [
      {label:'Number',       key:'number'},
      {label:'Account Name', key:'account_name'},
      {label:'Account Type', key:'account_type'},
      {label:'Account Subtype', key:'account_subtype', fmt:v=>v||'Unclassified'},
      {label:'Parent',       key:'parent_id', fmt:(_,a)=>_coaParentName(a)},
      {label:'Cash Flow Grp',key:'cash_flow_group', fmt:v=>v||'—'},
      {label:'Wallet Role',  key:'wallet_role', fmt:v=>_coaWalletRolePill(v)},
      {label:'Status',       key:'is_active', fmt:v=>v===false?'Inactive':'Active'},
    ],
    renderAdd: _finAddPlaceholder('Account', "renderCoaAddPage(document.getElementById('main-content'))", 'Add a new Chart of Accounts entry.'),
    onAdd:  () => renderCoaAddPage(document.getElementById('main-content')),
    onEdit: item => openCoaEdit(item.id),
    detailActions: _coaDetailActions,
    bulkUpload: { module: 'chart-of-accounts' },
  };
  await renderSplitView(cfg);
  _coaInjectSubtypeFilter(cfg);
  // "Reclassify" deep-link from a report's null_subtype_accounts banner
  // (finance-reports.js) — set the account, navigate here, open its edit
  // form once the cache this depends on has loaded. Cleared after use.
  if (window._coaOpenEditId != null) {
    const id = window._coaOpenEditId;
    window._coaOpenEditId = null;
    if (chartOfAccountsData.some(a => String(a.id) === String(id))) openCoaEdit(id);
  }
}

// No first-class filter-row concept in renderSplitView beyond free-text
// search (confirmed: only cfg.searchFields exists) — this injects a Subtype
// dropdown next to the search box and drives it by mutating cfg.apiUrl then
// calling the reload hook renderSplitView already exposes on window, exactly
// the same mechanism _splitReload itself uses. The injected node survives
// _splitReload since that only repaints #split-list-items/#split-right-panel.
function _coaInjectSubtypeFilter(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const allSubtypes = Object.values(ACCOUNT_SUBTYPES_BY_TYPE).flat().sort();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;';
  wrap.innerHTML = `
    <select id="coa-subtype-filter" class="fin-form-select" style="width:100%;font-size:12px;">
      <option value="">All Subtypes</option>
      <option value="Unclassified">Unclassified</option>
      ${allSubtypes.map(s=>`<option value="${s}">${s}</option>`).join('')}
    </select>`;
  searchBox.insertAdjacentElement('afterend', wrap);
  document.getElementById('coa-subtype-filter').addEventListener('change', async e => {
    const v = e.target.value;
    cfg.apiUrl = v ? `${API_BASE}/accounts/?account_subtype=${encodeURIComponent(v)}` : `${API_BASE}/accounts/`;
    await window._splitReload?.();
  });
}

function _renderCoaListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Account</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Account &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="coa-per-page" onchange="changeCoaPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===_coaPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="coa-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV">&#128202;</button>
          <button class="fin-btn-teal" onclick="renderCoaAddPage(document.getElementById('main-content'))">Add Account</button>
          <input type="text" class="fin-search-input" placeholder="&#128269; Search&#8230;" oninput="onCoaSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="coa-table-container"></div>
      <div id="coa-pagination"></div>
    </div>`;
  _renderCoaTable();
}

function _coaFiltered() {
  if (!_coaSearch) return chartOfAccountsData;
  const q = _coaSearch;
  return chartOfAccountsData.filter(a =>
    (a.number||'').toLowerCase().includes(q) ||
    (a.account_name||a.accountName||'').toLowerCase().includes(q) ||
    (a.account_type||a.accountType||'').toLowerCase().includes(q));
}

// Account records reference their parent by id (parent_id) — resolve the name by
// looking it up in the same list rather than expecting a flat "parent name" field.
function _coaParentName(a) {
  if (!a.parent_id) return '-';
  const parent = chartOfAccountsData.find(p => String(p.id) === String(a.parent_id));
  return parent ? (parent.account_name || '-') : '-';
}

const _COA_WALLET_ROLE_COLORS = { main: '#1a5fb4;background:#dce8fb', mini: '#8a6d00;background:#f5e6a8', suspense: '#888;background:#eee', charges: '#c0392b;background:#fde0de' };
function _coaWalletRolePill(role) {
  if (!role) return '—';
  const colors = (_COA_WALLET_ROLE_COLORS[role] || '#888;background:#eee').split(';');
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${colors[0]};${colors[1]};">${_finEsc(role)}</span>`;
}

function _renderCoaTable() {
  const filtered = _coaFiltered();
  const totalEl  = document.getElementById('coa-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_coaPage-1)*_coaPerPage;
  const paged = filtered.slice(start, start+_coaPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length/_coaPerPage));

  let rows = paged.length===0
    ? `<tr><td colspan="7" class="fin-empty">No records found.</td></tr>`
    : paged.map(a=>`<tr>
        <td>${_finEsc(a.number||'')}</td>
        <td>${_finEsc(a.account_name||'')}</td>
        <td>${_finEsc(a.account_type||'-')}</td>
        <td>${_finEsc(_coaParentName(a))}</td>
        <td>${_finEsc(a.cash_flow_group||'-')}</td>
        <td>${a.is_active===false?'Inactive':'Active'}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinCoaDropdown(event,'${a.id}')">&#8230;</button>
            <div id="fin-coa-dd-${a.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openCoaEdit('${a.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`).join('');

  const el = document.getElementById('coa-table-container');
  if (el) el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>NUMBER</th><th>ACCOUNT NAME</th><th>ACCOUNT TYPE</th><th>PARENT ACCOUNT</th>
        <th>GROUP</th><th>STATUS</th><th>ACTION</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  let pg=''; for(let i=1;i<=pages;i++) pg+=`<button class="${i===_coaPage?'fin-pg-active':''}" onclick="coaGoPage(${i})">${i}</button>`;
  const pgEl=document.getElementById('coa-pagination');
  if(pgEl) pgEl.innerHTML=`<div class="fin-pagination">${pg}</div>`;
}

function toggleFinCoaDropdown(e,id) {
  e.stopPropagation();
  document.querySelectorAll('[id^="fin-coa-dd-"]').forEach(d=>{ if(d.id!==`fin-coa-dd-${id}`) d.style.display='none'; });
  const dd=document.getElementById(`fin-coa-dd-${id}`);
  if(dd) dd.style.display=dd.style.display==='none'?'block':'none';
}
function changeCoaPerPage(v){ _coaPerPage=parseInt(v); _coaPage=1; _renderCoaTable(); }
function onCoaSearch(v)     { _coaSearch=v.trim().toLowerCase(); _coaPage=1; _renderCoaTable(); }
function coaGoPage(p)       { _coaPage=p; _renderCoaTable(); }

const _COA_CASH_FLOW_GROUPS = [
  'Cashflow from Operating Activities',
  'Cashflow from Investing Activities',
  'Cashflow from Financing Activities',
];

// The account_subtype axis (2026-07-21 addendum §1.2, split + extended by
// the 2026-08-17 addendum §5.5/§5.7). One copy — the Add/Edit form picker,
// the Reclassify dialog, Asset Categories' Cost Subtype picker, and the
// Fixed Asset Register's Asset Class picker all read from this same
// constant so a diverging local copy can never send a value the backend
// rejects. Asset's first 8 entries are exactly the "non-current" subset
// (order matters — Fixed Assets slices this array for its category/class
// dropdowns). 'Land and Buildings' was split into 'Land' + 'Buildings' by
// migration p5q6r7s8t9u0 — confirmed live via openapi.json, the combined
// value no longer exists on the backend.
const ACCOUNT_SUBTYPES_BY_TYPE = {
  Asset: [
    'Land', 'Buildings', 'Motor Vehicles', 'Furniture and Fittings',
    'Computers and Equipment', 'Kitchen Equipment', 'Playground Equipment',
    'Intangible Asset',
    'Cash and Bank', 'Student Receivable', 'Other Receivable', 'Inventory', 'Prepayment',
  ],
  Liability: [
    'Long-term Loan',
    'Trade Payable', 'Student Prepayment', 'Statutory Payable', 'Tax Payable',
    'Salary Accrual', 'Accrued Expense', 'Short-term Loan',
  ],
  Equity: ['Shareholder Funds', 'Revaluation Reserve', 'Retained Surplus'],
  Income: [
    'Tuition Revenue', 'Transport Revenue', 'Meals Revenue', 'Extra-Curricular Revenue',
    'Admission Revenue', 'Uniform Sales', 'Other Student Fees', 'Other Income',
    'Gain on Disposal of Assets',
  ],
  Expense: [
    'Cost of Uniforms Sold', 'Teaching Staff Costs', 'Non-Teaching Staff Costs',
    'Teaching Supplies', 'Meals and Kitchen', 'Transport Operating',
    'Repairs and Maintenance', 'Utilities', 'Rent and Rates', 'Insurance and Licences',
    'Staff Welfare', 'Depreciation', 'Marketing and Admissions', 'Professional Fees',
    'Office Admin', 'Financial Charge', 'Tax Expense', 'Loss on Disposal of Assets',
  ],
};
// Non-current asset subtypes only — the eight that can hold Fixed Assets (§5).
const ACCOUNT_SUBTYPES_NON_CURRENT_ASSET = ACCOUNT_SUBTYPES_BY_TYPE.Asset.slice(0, 8);

// Subtype options come from the live /finance/account-subtypes/ catalog
// (Addendum 2026-08-28 §C.2, cached once per session in _astSubtypes) so a
// sub-type added under Finance > Utilities > Sub-Types shows up here without a
// FE release. Falls back to the seeded ACCOUNT_SUBTYPES_BY_TYPE map whenever
// that fetch hasn't landed, which leaves this picker behaving exactly as before.
function _coaSubtypeRows(accountType) {
  // Every active subtype is attachable — BE accepts any str matching an
  // active row in account_subtypes (system-seeded OR admin-created). The
  // old `attachable: s.is_system !== false` gate is gone as of the
  // 2026-08-31 AccountCreate loosening; nothing renders greyed anymore.
  if (_astLoaded && _astSubtypes.length) {
    return _astSubtypes
      .filter(s => s.account_type === accountType && s.is_active)
      .map(s => ({ name: s.name }));
  }
  return (ACCOUNT_SUBTYPES_BY_TYPE[accountType] || []).map(name => ({ name }));
}

// Every active subtype is attachable (BE accepts admin-created ones as
// of the 2026-08-31 AccountCreate loosening). No `blocked` branch needed.
function _coaSubtypeOptions(accountType, selected) {
  const rows = _coaSubtypeRows(accountType);
  const placeholder = accountType ? "Please Select" : "Select Account Type first";
  return `<option value="">${placeholder}</option>` +
    rows.map(r => `<option value="${_finEsc(r.name)}" ${r.name===selected?"selected":""}>${_finEsc(r.name)}</option>`).join("");
}
function _coaSubtypeBlockedNote(_accountType) {
  // Retained for call-site compatibility with existing _coaRepopulateSubtype
  // wiring; now always empty since nothing is blocked.
  return "";
}
function _coaRepopulateSubtype(accountType) {
  const sel = document.getElementById('coa-f-subtype');
  if (sel) sel.innerHTML = _coaSubtypeOptions(accountType, null);
  const note = document.getElementById('coa-f-subtype-note');
  if (note) note.innerHTML = _coaSubtypeBlockedNote(accountType);
}

function _coaFormHtml(acct, opts = {}) {
  const parentId = acct?.parent_id;
  // chartOfAccountsData stays unfiltered (it's also the lookup cache for
  // _coaParentName()/wallet-role pills elsewhere) — active-only filtering
  // happens only in this picker's own option list, keeping a stale-but-
  // currently-set parent visible and labeled rather than rendering blank (§5.4).
  const parentOpts = chartOfAccountsData
    .filter(a=> !acct || a.id!==acct.id)
    .filter(a=> a.is_active !== false || String(a.id) === String(parentId))
    .map(a=>`<option value="${a.id}" ${String(parentId)===String(a.id)?'selected':''}>${_finEsc(a.account_name||'')}${a.is_active===false?' (inactive)':''}</option>`).join('');
  // Fee Accounts is not a separate backend resource — it's Chart of Accounts
  // filtered to is_student_fees_related:true (confirmed live, GET /accounts/
  // takes that as a query param) — see loadFeeAccountsView. Adding from that
  // screen pre-checks the box via opts.defaultFeesRelated.
  const feesRelated = acct ? !!acct.is_student_fees_related : !!opts.defaultFeesRelated;
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Number</label>
        <input type="text" id="coa-f-number" class="fin-form-input" value="${_finEsc(acct?.number||'')}" ${acct?'disabled':''}
               placeholder="${acct?'':'Auto-filled from parent — editable'}">
        <span class="fin-field-error" id="coa-f-number-err"></span>
        ${acct ? `<span style="font-size:12px;color:var(--grey-600)">Number moves only via Change Account Number (Super_Admin) once an account exists.</span>` : ''}
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Account Name <span class="fin-required">*</span></label>
        <input type="text" id="coa-f-name" class="fin-form-input" value="${_finEsc(acct?.account_name||'')}" oninput="_coaToggleWalletCode(this.value)">
        <span class="fin-field-error" id="coa-f-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Account Type <span class="fin-required">*</span></label>
        <select id="coa-f-type" class="fin-form-select" ${acct?'disabled':''} onchange="_coaRepopulateSubtype(this.value)">
          <option value="">Please Select</option>
          ${['Asset','Liability','Equity','Income','Expense'].map(t=>`<option value="${t}" ${acct?.account_type===t?'selected':''}>${t}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="coa-f-type-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Subtype <span class="fin-required">*</span></label>
        <select id="coa-f-subtype" class="fin-form-select" ${acct?'disabled':''}>
          ${_coaSubtypeOptions(acct?.account_type, acct?.account_subtype)}
        </select>
        <span class="fin-field-error" id="coa-f-subtype-err"></span>
        <span id="coa-f-subtype-note" style="font-size:11px;color:var(--grey-500);display:block;">${acct ? '' : _coaSubtypeBlockedNote(acct?.account_type)}</span>
        ${acct ? `<span style="font-size:12px;color:var(--grey-600)">Type and Subtype move only via Reclassify (Super_Admin) once an account exists.</span>` : ''}
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Payment Ordering</label>
        <input type="number" id="coa-f-ordering" class="fin-form-input" value="${acct?.payment_ordering ?? ''}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Cash Flow Group</label>
        <select id="coa-f-cf-group" class="fin-form-select">
          <option value="">Please Select</option>
          ${_COA_CASH_FLOW_GROUPS.map(g=>`<option value="${g}" ${acct?.cash_flow_group===g?'selected':''}>${g}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="coa-f-cfg-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Parent Account</label>
        <select id="coa-f-parent" class="fin-form-select" ${acct?'':'onchange="onCoaParentChange(this.value)"'}>
          <option value="">Please Select</option>${parentOpts}
        </select>
      </div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-check-label" style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="coa-f-fees-related" class="fin-cb" ${feesRelated?'checked':''}> Student/Fees Related
      </label>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-check-label" style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="coa-f-budget-item" class="fin-cb" ${acct?.is_budget_item?'checked':''}> Budget Item
      </label>
    </div>
    <div class="fin-form-group" id="coa-f-wallet-code-wrap" style="display:${/^tendepay/i.test(acct?.account_name||'')?'block':'none'};">
      <label class="fin-form-label">Tendepay Wallet Code</label>
      <input type="text" id="coa-f-wallet-code" class="fin-form-input" value="${_finEsc(acct?.tendepay_wallet_code||'')}" placeholder="e.g. KOC5329547696">
      <span style="font-size:12px;color:var(--grey-600)">The code shown in parentheses on the Tendepay statement for this wallet, e.g. KOC5329547696.</span>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Wallet Role</label>
      <select id="coa-f-wallet-role" class="fin-form-select" onchange="_coaCheckWalletRoleMismatch()">
        <option value="">(none)</option>
        ${['main','mini','suspense','charges'].map(r=>`<option value="${r}" ${acct?.wallet_role===r?'selected':''}>${r.charAt(0).toUpperCase()+r.slice(1)}</option>`).join('')}
      </select>
      <span style="font-size:12px;color:var(--grey-600)">Tags this account for the Tendepay pipeline. Required for any new Tendepay wallet seeded after the initial migration.</span>
      <div id="coa-f-wallet-role-warn" style="display:none;background:var(--gold-100,#FAF2D3);border-left:3px solid var(--gold-500,#C9A227);padding:8px 12px;border-radius:6px;margin-top:8px;font-size:0.82rem;color:#6b5400;">
        This account looks like a Tendepay wallet but has no wallet role. It will be invisible to the Tendepay import and reconciliation.
      </div>
    </div>
    ${acct ? `
    <div class="fin-form-group">
      <label class="fin-form-check-label" style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="coa-f-inactive" class="fin-cb" ${acct.is_active===false?'checked':''}> Inactive
      </label>
      <span class="fin-field-hint fin-field-hint-info">Inactive accounts are removed from every Account dropdown across the application. Existing postings and reports are unaffected. Untick to reactivate.</span>
    </div>` : ''}`;
}

// Only Tendepay wallet accounts carry a tendepay_wallet_code — show the field
// once the Account Name starts with "Tendepay" (§5.7).
function _coaToggleWalletCode(name) {
  const wrap = document.getElementById('coa-f-wallet-code-wrap');
  if (wrap) wrap.style.display = /^tendepay/i.test(name || '') ? 'block' : 'none';
  _coaCheckWalletRoleMismatch();
}

// wallet_role is now authoritative for the Tendepay pipeline (replaces the
// account_name ILIKE 'Tendepay%' scan); a name that still looks like a wallet
// but carries no role is the exact failure mode this warns about — non-
// blocking, since a bursar may legitimately name a non-wallet account this way.
function _coaCheckWalletRoleMismatch() {
  const warn = document.getElementById('coa-f-wallet-role-warn');
  if (!warn) return;
  const name = document.getElementById('coa-f-name')?.value || '';
  const role = document.getElementById('coa-f-wallet-role')?.value || '';
  warn.style.display = (/^tendepay/i.test(name) && !role) ? 'block' : 'none';
}

// Prefilling the Number field from the selected Parent Account — user can still override it manually.
async function onCoaParentChange(parentId) {
  const numInput = document.getElementById('coa-f-number');
  if (!numInput) return;
  if (!parentId) { numInput.value = ''; return; }
  const res = await apiFetch(`${API_BASE}/accounts/next-number?parent_id=${parentId}`);
  if (res && res.ok) {
    const data = await res.json();
    numInput.value = data.next_number || '';
  }
}

function renderCoaAddPage(container, opts = {}) {
  const returnView = opts.returnView || 'fin-chart-of-accounts';
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${opts.title || 'Add Account'}</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('${returnView}');return false;">${opts.crumbLabel || 'Account'}</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        ${_coaFormHtml(null, opts)}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitCoaAdd('${returnView}')">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('${returnView}')">Cancel</button>
        </div>
      </div>
    </div>`;
}

async function submitCoaAdd(returnView) {
  returnView = returnView || 'fin-chart-of-accounts';
  const num  = (document.getElementById('coa-f-number').value||'').trim();
  const name = (document.getElementById('coa-f-name').value||'').trim();
  const type = document.getElementById('coa-f-type').value;
  const subtype = document.getElementById('coa-f-subtype').value;
  const cfg  = document.getElementById('coa-f-cf-group').value;
  const ordering = document.getElementById('coa-f-ordering').value;
  const parentId = document.getElementById('coa-f-parent').value;
  let valid=true;
  document.getElementById('coa-f-name-err').textContent   = name ? '' : 'This field is required.'; if(!name) valid=false;
  document.getElementById('coa-f-type-err').textContent   = type ? '' : 'This field is required.'; if(!type) valid=false;
  document.getElementById('coa-f-subtype-err').textContent = subtype ? '' : 'This field is required.'; if(!subtype) valid=false;
  document.getElementById('coa-f-cfg-err').textContent    = '';
  if (!valid) return;
  const payload = {
    number: num || null, account_name: name, account_type: type, account_subtype: subtype,
    payment_ordering:      ordering ? parseInt(ordering) : null,
    cash_flow_group:       cfg || null,
    parent_id:             parentId ? parseInt(parentId) : null,
    is_student_fees_related: document.getElementById('coa-f-fees-related').checked,
    is_budget_item:        document.getElementById('coa-f-budget-item').checked,
    tendepay_wallet_code:  document.getElementById('coa-f-wallet-code')?.value.trim() || null,
    wallet_role:           document.getElementById('coa-f-wallet-role')?.value || null
  };
  // NOTE: no separate "Fee Account" resource to sync to — is_student_fees_related
  // on this single POST is the entire mechanism (confirmed live: GET /accounts/
  // takes is_student_fees_related as a filter). An older version of this function
  // double-POSTed to /finance/fee-accounts/, which doesn't exist on the backend
  // and always failed.
  const res = await apiFetch(`${API_BASE}/accounts/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (res && res.ok) { showToast('Account added!', 'success'); }
  else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  loadView(returnView);
}

function openCoaEdit(id, opts = {}) {
  document.querySelectorAll('[id^="fin-coa-dd-"]').forEach(d=>d.style.display='none');
  const acct = chartOfAccountsData.find(a=>String(a.id)===String(id));
  if (!acct) return;
  const returnView = opts.returnView || 'fin-chart-of-accounts';
  const container = document.getElementById('main-content');
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${opts.title || 'Edit Account'}</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('${returnView}');return false;">${opts.crumbLabel || 'Account'}</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        ${_coaFormHtml(acct)}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitCoaEdit(${JSON.stringify(acct.id)},'${returnView}')">Update</button>
          <button class="fin-btn-cancel" onclick="loadView('${returnView}')">Cancel</button>
        </div>
      </div>
    </div>`;
  _coaCheckWalletRoleMismatch();
}

async function submitCoaEdit(id, returnView) {
  returnView = returnView || 'fin-chart-of-accounts';
  const idx  = chartOfAccountsData.findIndex(a=>String(a.id)===String(id));
  if (idx===-1) return;
  const name = (document.getElementById('coa-f-name').value||'').trim();
  const cfg  = document.getElementById('coa-f-cf-group').value;
  const ordering = document.getElementById('coa-f-ordering').value;
  const parentId = document.getElementById('coa-f-parent').value;
  document.getElementById('coa-f-name-err').textContent = name ? '' : 'This field is required.';
  document.getElementById('coa-f-cfg-err').textContent  = '';
  if (!name) return;
  const wasActive = chartOfAccountsData[idx].is_active !== false;
  const nowActive = !document.getElementById('coa-f-inactive')?.checked;
  const payload = {
    // account_type / account_subtype: AccountUpdate is silent on both per the
    // 2026-07-21 addendum — those two axes move only via reclassification
    // (submitCoaReclassify below), never via this form.
    account_name: name, cash_flow_group: cfg || null,
    payment_ordering:       ordering ? parseInt(ordering) : null,
    parent_id:              parentId ? parseInt(parentId) : null,
    is_student_fees_related: document.getElementById('coa-f-fees-related').checked,
    is_budget_item:         document.getElementById('coa-f-budget-item').checked,
    tendepay_wallet_code:   document.getElementById('coa-f-wallet-code')?.value.trim() || null,
    wallet_role:            document.getElementById('coa-f-wallet-role')?.value || null,
    is_active:              nowActive,
  };
  const res = await apiFetch(`${API_BASE}/accounts/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (res && res.ok) {
    showToast(nowActive !== wasActive ? `Account marked ${nowActive ? 'active' : 'inactive'}.` : 'Account updated!', 'success');
  }
  else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  loadView(returnView);
}

// ── Reclassification + Classification History (§2, Super_Admin only) ───────
// No account detail *page* exists for CoA (split-view's own detail pane is
// the closest thing) — these hang off cfg.detailActions the same way
// Payables' Approve/Void buttons hang off its detail pane.
// PATCH /accounts/{id}/number answers 403 for accounts the backend holds in
// PROTECTED_ACCOUNT_NUMBERS. That set is much larger than the five class roots
// the addendum described: probing staging, every `XX-YY-000` group root is
// refused (10-00-000, 10-01-000, 30-21-000, 50-35-000 all 403) and so are
// sub-headers like 10-01-200 "Bank Accounts", while leaves are accepted
// (10-01-101, 10-01-201, 10-01-301 and 10-01-900 all reach the duplicate check
// instead). The discriminator is almost certainly Account.is_postable, which
// AccountRead does not expose — so this cannot be computed exactly on the FE.
//
// So: withhold the button on the whole `XX-YY-000` family, which is provably
// protected and covers 56 of the 120 accounts, and let the 403 handle the
// handful of sub-headers below that. _coaSubmitRenumber renders that 403 as an
// inline banner rather than a toast precisely because it stays reachable.
// If AccountRead ever carries is_postable, replace this with that flag.
const _COA_GROUP_ROOT_RE = /^\d{2}-\d{2}-000$/;
function _coaIsProtectedRoot(acct) {
  return _COA_GROUP_ROOT_RE.test(String(acct?.number || '').trim());
}

function _coaDetailActions(item) {
  const protectedRoot = _coaIsProtectedRoot(item);
  const superAdminActions = _isSuperAdmin() ? `
    <button class="fin-btn-outline" onclick="_coaOpenReclassifyModal(${item.id})">Reclassify</button>
    <button class="fin-btn-outline" onclick="_coaOpenHistoryModal(${item.id})">Classification History</button>
    ${protectedRoot ? '' : `<button class="fin-btn-outline" onclick="_coaOpenRenumberModal(${item.id})">Change Account Number</button>`}` : '';
  return `${superAdminActions}
    <button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_coaDeleteAccount(${item.id})">Delete</button>
    ${_isSuperAdmin() && protectedRoot ? `<div style="width:100%;margin-top:10px;padding:9px 13px;border-radius:6px;border-left:3px solid var(--navy-700,#1B3057);background:var(--navy-50,#EEF3FA);color:var(--navy-700,#1B3057);font-size:0.82rem;">
      ${_finEsc(item.number || '')} is a protected class root — its number is fixed and cannot be changed.
    </div>` : ''}
    ${_isSuperAdmin() ? _coaNumberHistorySection(item.id) : ''}`;
}

// No backend "in use" check on DELETE /accounts/{id} (confirmed via openapi.json —
// only 204/422 declared, unlike Fee Items' delete which returns a downstream-reference
// summary). Guard client-side against Fee Item / General Item account_id references
// before calling it, since a hard-delete of a referenced account is otherwise unguarded.
async function _coaCheckAccountReferences(accountId) {
  const [fiRes, giRes] = await Promise.all([
    apiFetch(`${API_BASE}/receivables/setup/fee-items`),
    apiFetch(`${API_BASE}/finance/general-items/`),
  ]);
  const feeItems     = (fiRes && fiRes.ok) ? _toArray(await fiRes.json()) : [];
  const generalItems = (giRes && giRes.ok) ? _toArray(await giRes.json()) : [];
  const refs = [];
  feeItems.forEach(f     => { if (String(f.account_id) === String(accountId)) refs.push(`Fee Item "${f.name}"`); });
  generalItems.forEach(g => { if (String(g.account_id) === String(accountId)) refs.push(`General Item "${g.name}"`); });
  return refs;
}

async function _coaDeleteAccount(id) {
  const acct = chartOfAccountsData.find(a => String(a.id) === String(id));
  if (!confirm(`Delete account "${acct ? (acct.account_name||'') : id}"? This cannot be undone.`)) return;
  const refs = await _coaCheckAccountReferences(id);
  if (refs.length) {
    showToast(`Cannot delete — still linked to ${refs.join(', ')}. Unlink or reassign these first.`, 'error');
    return;
  }
  try {
    const res = await apiFetch(`${API_BASE}/accounts/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showToast('Account deleted.', 'success'); loadView('fin-chart-of-accounts'); }
    else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
}

function _coaCloseModal(id) { document.getElementById(id)?.remove(); }

function _coaReclassifyRepopulateSubtype(accountType) {
  const sel = document.getElementById('coa-rc-subtype');
  if (sel) sel.innerHTML = _coaSubtypeOptions(accountType, null);
}

function _coaReasonCounter() {
  const val = document.getElementById('coa-rc-reason')?.value || '';
  const el = document.getElementById('coa-rc-reason-count');
  if (el) el.textContent = `${val.length}/500`;
}

function _coaOpenReclassifyModal(id) {
  const acct = chartOfAccountsData.find(a => String(a.id) === String(id));
  if (!acct) return;
  const wrap = document.createElement('div');
  wrap.id = 'coa-reclassify-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:480px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 8px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Reclassify ${_finEsc(acct.account_name||'')}</h3>
      <div style="padding:10px 12px;border-radius:6px;background:var(--gold-100,#FAF2D3);color:#6b5400;font-size:0.82rem;margin-bottom:14px;">
        Reclassifying will re-render historical Statement of Financial Position and P&amp;L reports under the new classification. Prior classifications remain visible in the history panel below.
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Type <span class="fin-required">*</span></label>
        <select id="coa-rc-type" class="fin-form-select" onchange="_coaReclassifyRepopulateSubtype(this.value)">
          ${['Asset','Liability','Equity','Income','Expense'].map(t=>`<option value="${t}" ${acct.account_type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Subtype <span class="fin-required">*</span></label>
        <select id="coa-rc-subtype" class="fin-form-select">${_coaSubtypeOptions(acct.account_type, acct.account_subtype)}</select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
        <textarea id="coa-rc-reason" class="fin-form-textarea" rows="3" maxlength="500" placeholder="3-500 characters..." oninput="_coaReasonCounter()"></textarea>
        <span style="font-size:11px;color:var(--grey-400,#999);float:right;" id="coa-rc-reason-count">0/500</span>
      </div>
      <div id="coa-rc-error" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;white-space:pre-wrap;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('coa-reclassify-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_coaSubmitReclassify(${id})">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _coaSubmitReclassify(id) {
  const account_type    = document.getElementById('coa-rc-type').value;
  const account_subtype = document.getElementById('coa-rc-subtype').value;
  const reason = (document.getElementById('coa-rc-reason').value || '').trim();
  const errEl = document.getElementById('coa-rc-error');
  errEl.style.display = 'none';
  if (reason.length < 3 || reason.length > 500) {
    errEl.textContent = 'Reason must be 3-500 characters.';
    errEl.style.display = 'block';
    return;
  }
  const res = await apiFetch(`${API_BASE}/accounts/${id}/classification`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_type, account_subtype, reason })
  });
  if (res && res.ok) {
    _coaCloseModal('coa-reclassify-modal-overlay');
    showToast('Account reclassified.', 'success');
    await _coaLoadCache();
    await window._splitRefreshSelected?.();
  } else if (res) {
    // Surfaced inline, not as a toast — the 422 lists every valid subtype for
    // the chosen type and a 3.5s toast isn't long enough to read that list.
    errEl.textContent = await parseApiError(res);
    errEl.style.display = 'block';
  }
}

function _coaHistoryRow(h) {
  return `<tr>
    <td>${_finEsc(new Date(h.changed_at).toLocaleString())}</td>
    <td>${_finEsc(h.old_type||'—')} / ${_finEsc(h.old_subtype||'Unclassified')}</td>
    <td>${_finEsc(h.new_type||'—')} / ${_finEsc(h.new_subtype||'Unclassified')}</td>
    <td>${_finEsc(h.reason||'')}</td>
    <td>${h.changed_by != null ? `Staff #${_finEsc(String(h.changed_by))}` : '—'}</td>
  </tr>`;
}

async function _coaOpenHistoryModal(id) {
  const wrap = document.createElement('div');
  wrap.id = 'coa-history-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:640px;max-width:95vw;max-height:80vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Classification History</h3>
      <div id="coa-history-body"><p class="fin-empty">Loading&#8230;</p></div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('coa-history-modal-overlay')">Close</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const res = await apiFetch(`${API_BASE}/accounts/${id}/classification-history`);
  const body = document.getElementById('coa-history-body');
  if (!body) return;
  if (!res || !res.ok) { body.innerHTML = `<p class="fin-empty">Could not load history.</p>`; return; }
  const rows = _toArray(await res.json());
  if (!rows.length) { body.innerHTML = `<p class="fin-empty">No prior classifications.</p>`; return; }
  body.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>WHEN</th><th>OLD</th><th>NEW</th><th>REASON</th><th>BY</th></tr></thead>
      <tbody>${rows.map(_coaHistoryRow).join('')}</tbody>
    </table></div>`;
}

// ── Renumber + Number History (Task 18, Super_Admin only) ─────────────────
// Deliberately mirrors the Reclassify pair above: same detailActions hook,
// same Super_Admin gate, same mandatory 3-500 char reason, same audit-history
// endpoint shape. Differences are the payload ({new_number, reason}), the
// client-side check (XX-YY-ZZZ instead of type/subtype coherence), and where
// history lives — a lazy-loaded collapse in the detail pane rather than its
// own modal, since a number history is two short columns, not five.

const _COA_NUMBER_RE = /^\d{2}-\d{2}-\d{3}$/;

// Guards double-submits: the Confirm button is disabled while in flight, but
// this also stops a queued Enter keypress from firing a second PATCH.
let _coaRenumberInFlight = false;

function _coaRenumberReasonCounter() {
  const val = document.getElementById('coa-num-reason')?.value || '';
  const el = document.getElementById('coa-num-reason-count');
  if (el) el.textContent = `${val.length}/500`;
  _coaRenumberSyncValid();
}

// Single source of truth for the Confirm button's enabled state. `showNumErr`
// is true only on blur/submit — typing a partial number ("15-0") shouldn't
// paint the field red mid-keystroke.
function _coaRenumberSyncValid(showNumErr = false) {
  const numEl    = document.getElementById('coa-num-new');
  const reasonEl = document.getElementById('coa-num-reason');
  const errEl    = document.getElementById('coa-num-error');
  const btn      = document.getElementById('coa-num-confirm');
  if (!numEl || !reasonEl || !btn) return false;
  const num    = numEl.value.trim();
  const reason = reasonEl.value.trim();
  const numOk    = _COA_NUMBER_RE.test(num);
  const reasonOk = reason.length >= 3 && reason.length <= 500;
  if (errEl) {
    const bad = showNumErr && num !== '' && !numOk;
    errEl.style.display = bad ? 'block' : 'none';
    errEl.textContent = bad ? 'Account number must match XX-YY-ZZZ (e.g. 10-01-201).' : '';
  }
  numEl.classList.toggle('error', showNumErr && num !== '' && !numOk);
  const ready = numOk && reasonOk && !_coaRenumberInFlight;
  btn.disabled = !ready;
  btn.style.opacity = ready ? '1' : '0.55';
  btn.style.cursor  = ready ? 'pointer' : 'not-allowed';
  return ready;
}

function _coaOpenRenumberModal(id) {
  const acct = chartOfAccountsData.find(a => String(a.id) === String(id));
  if (!acct) return;
  // Belt and braces: _coaDetailActions already withholds the button on a
  // protected root, but the modal is reachable from the console and from any
  // future call site.
  if (_coaIsProtectedRoot(acct)) {
    showToast(`${acct.number} is a protected class root — its number cannot be changed.`, 'error');
    return;
  }
  _coaRenumberInFlight = false;
  const wrap = document.createElement('div');
  wrap.id = 'coa-renumber-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:480px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 8px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Change Account Number &mdash; ${_finEsc(acct.account_name||'')}</h3>
      <div style="padding:12px 14px;border-radius:6px;background:var(--gold-100,#FAF2D3);border:2px solid var(--gold-400,#D4A843);color:#6b5400;font-size:0.82rem;margin-bottom:14px;font-weight:bold;">
        Renumbering shifts this account's position in every report that groups by number (SoFP, cash book, cash flow). The account id is unchanged so journal entries and env vars still resolve, but historical PDF exports keep the old number. Confirm below.
      </div>
      <div id="coa-num-banner" style="display:none;padding:10px 13px;border-radius:6px;border-left:3px solid var(--coral-500);background:var(--coral-100,#fdecea);color:var(--coral-600,#c0392b);font-size:0.83rem;margin-bottom:12px;"></div>
      <div class="fin-form-group">
        <label class="fin-form-label">Current account number</label>
        <input class="fin-form-input" type="text" value="${_finEsc(acct.number||'')}" disabled>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">New account number <span class="fin-required">*</span></label>
        <input id="coa-num-new" class="fin-form-input" type="text" placeholder="XX-YY-ZZZ (e.g. 10-01-201)" maxlength="20"
               oninput="_coaRenumberSyncValid()" onblur="_coaRenumberSyncValid(true)">
        <div id="coa-num-error" style="display:none;color:var(--coral-600);font-size:0.78rem;"></div>
        <span class="fin-field-hint">Two-digit class, two-digit group, three-digit leaf (e.g. 10-01-201). Class codes are 10 Assets, 20 Liabilities, 30 Equity, 40 Income, 50 Expense. Must be unique.</span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason for renumber <span class="fin-required">*</span></label>
        <textarea id="coa-num-reason" class="fin-form-textarea" rows="3" maxlength="500" placeholder="3-500 characters..." oninput="_coaRenumberReasonCounter()"></textarea>
        <span class="fin-field-hint">Recorded in the account's Number History. Give the operational reason, not just "typo".</span>
        <span style="font-size:11px;color:var(--grey-400,#999);float:right;" id="coa-num-reason-count">0/500</span>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('coa-renumber-modal-overlay')">Cancel</button>
        <button id="coa-num-confirm" class="fin-btn-teal" onclick="_coaSubmitRenumber(${id})">Confirm Renumber</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  _coaRenumberSyncValid();
  document.getElementById('coa-num-new')?.focus();
}

async function _coaSubmitRenumber(id) {
  if (_coaRenumberInFlight) return;
  // Re-validate on submit as well as blur — a value pasted in and confirmed
  // by Enter never fires blur.
  if (!_coaRenumberSyncValid(true)) return;
  const new_number = document.getElementById('coa-num-new').value.trim();
  const reason     = document.getElementById('coa-num-reason').value.trim();
  const btn = document.getElementById('coa-num-confirm');
  _coaRenumberInFlight = true;
  _coaRenumberSyncValid();
  if (btn) btn.textContent = 'Renumbering…';

  const res = await apiFetch(`${API_BASE}/accounts/${id}/number`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_number, reason })
  });

  if (res && res.ok) {
    _coaCloseModal('coa-renumber-modal-overlay');
    _coaRenumberInFlight = false;
    showToast('Account renumbered.', 'success');
    await _coaLoadCache();
    await window._splitRefreshSelected?.();
    return;
  }
  _coaRenumberInFlight = false;
  if (btn) btn.textContent = 'Confirm Renumber';
  _coaRenumberSyncValid();
  // The 403/404/409/422 bodies are already written for an end user ("Account
  // number '10-01-201' already exists…"), so they go out verbatim. Anything
  // 5xx, or a null res from apiFetch's exhausted retries, is not.
  if (!res || res.status >= 500) { showToast('Network error — try again.', 'error'); return; }
  const msg = await parseApiError(res);
  // 409 is about the value in the New Number field, so it belongs on that
  // field. 403/404 are about the account itself and get a banner — 403 in
  // particular is reachable for non-postable sub-headers the FE cannot
  // identify from AccountRead, and it explains a rule rather than a typo.
  if (res.status === 409) {
    const errEl = document.getElementById('coa-num-error');
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = msg; }
    document.getElementById('coa-num-new')?.focus();
    return;
  }
  const banner = document.getElementById('coa-num-banner');
  if (banner) {
    banner.style.display = 'block';
    banner.textContent = msg;
    return;
  }
  showToast(msg, 'error');
}

// Rendered by _coaDetailActions, so it is rebuilt on every detail re-render —
// which is why the expanded/loaded state lives on the node itself rather than
// in a module-level variable. Collapsed by default; nothing is fetched until
// the first expand.
function _coaNumberHistorySection(id) {
  return `
    <div style="width:100%;margin-top:14px;">
      <button class="fin-btn-outline" style="width:100%!important;text-align:left;"
              onclick="_coaToggleNumberHistory(${id})">
        <span id="coa-numhist-caret">&#9656;</span> Number History
      </button>
      <div id="coa-numhist-body" data-loaded="0" style="display:none;margin-top:10px;"></div>
    </div>`;
}

async function _coaToggleNumberHistory(id) {
  const body  = document.getElementById('coa-numhist-body');
  const caret = document.getElementById('coa-numhist-caret');
  if (!body) return;
  const open = body.style.display !== 'none';
  if (open) {
    body.style.display = 'none';
    if (caret) caret.innerHTML = '&#9656;';
    return;
  }
  body.style.display = 'block';
  if (caret) caret.innerHTML = '&#9662;';
  if (body.dataset.loaded === '1') return;
  body.innerHTML = `<p class="fin-empty" style="padding:16px!important;">Loading&#8230;</p>`;
  const res = await apiFetch(`${API_BASE}/accounts/${id}/number-history`);
  // The pane may have been re-rendered (or another account selected) while the
  // request was in flight — re-read the node instead of closing over the old one.
  const target = document.getElementById('coa-numhist-body');
  if (!target) return;
  if (!res || !res.ok) {
    target.innerHTML = `<p class="fin-empty" style="padding:16px!important;">Could not load number history.</p>`;
    return;
  }
  const rows = _toArray(await res.json());
  target.dataset.loaded = '1';
  if (!rows.length) {
    target.innerHTML = `<p class="fin-empty" style="padding:16px!important;">No previous renames.</p>`;
    return;
  }
  target.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table" style="min-width:0;">
      <thead><tr><th>OLD &rarr; NEW</th><th>REASON</th><th>BY</th><th>AT</th></tr></thead>
      <tbody>${rows.map(_coaNumberHistoryRow).join('')}</tbody>
    </table></div>`;
}

function _coaNumberHistoryRow(h) {
  return `<tr>
    <td style="white-space:nowrap;">${_finEsc(h.old_number||'—')} &rarr; ${_finEsc(h.new_number||'—')}</td>
    <td>${_finEsc(h.reason||'')}</td>
    <td>${h.changed_by != null ? `Staff #${_finEsc(String(h.changed_by))}` : '—'}</td>
    <td style="white-space:nowrap;">${_finEsc(h.changed_at ? new Date(h.changed_at).toLocaleString() : '—')}</td>
  </tr>`;
}

// One-time diagnostic (§9.4) — not a runtime check, a manual post-deploy
// sanity call. Confirms the backend's Unclassified backfill ran cleanly;
// a non-empty result means a leaf account was missed and should go to
// backend, not be papered over here.
async function coaCheckUnclassifiedBacklog() {
  const res = await apiFetch(`${API_BASE}/accounts/?account_subtype=Unclassified`);
  if (!res || !res.ok) { showToast('Could not run the Unclassified check.', 'error'); return; }
  const rows = _toArray(await res.json());
  if (!rows.length) { showToast('No Unclassified accounts — backfill is clean.', 'success'); return; }
  showToast(`${rows.length} account(s) still Unclassified: ${rows.map(a=>a.number||a.id).join(', ')}`, 'error');
}

// ==================== FEE ACCOUNTS ====================
// Not a separate backend resource — Chart of Accounts filtered to
// is_student_fees_related:true (GET /accounts/?is_student_fees_related=true,
// confirmed live). The old /finance/fee-accounts/ endpoint this used to call
// doesn't exist on the backend at all (0 matches in openapi.json), which is
// why the list always showed "Failed to load data." Add/Edit reuse the same
// Chart of Accounts form/submit functions with fee-accounts-specific options
// (default-checked box, return to this view instead of Chart of Accounts).

async function loadFeeAccountsView(container) {
  await _coaLoadCache();
  await renderSplitView({
    container,
    moduleKey: 'finance.utilities',
    title: 'Fee Accounts',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-fee-accounts'},
      {label:'Fee Accounts'}
    ],
    apiUrl: `${API_BASE}/accounts/?is_student_fees_related=true`,
    searchFields: ['account_name','number','account_type'],
    col1Label: 'Account Name', col2Label: 'Type',
    col1: a => a.account_name || '—',
    col2: a => a.account_type || '—',
    rowLabel: a => a.account_name || '—',
    rowSub:   a => `#${a.number||''}`,
    idKey: 'id',
    detailFields: [
      {label:'Number',       key:'number'},
      {label:'Account Name', key:'account_name'},
      {label:'Account Type', key:'account_type'},
      {label:'Parent',       key:'parent_id', fmt:(_,a)=>_coaParentName(a)},
      {label:'Cash Flow Grp',key:'cash_flow_group', fmt:v=>v||'—'},
      {label:'Status',       key:'is_active', fmt:v=>v===false?'Inactive':'Active'},
    ],
    renderAdd: _finAddPlaceholder('Fee Account', "renderCoaAddPage(document.getElementById('main-content'), {returnView: 'fin-fee-accounts', title: 'Add Fee Account', crumbLabel: 'Fee Accounts', defaultFeesRelated: true})", 'Add a Chart of Accounts entry flagged Student/Fees Related.'),
    onAdd: () => renderCoaAddPage(document.getElementById('main-content'), {
      returnView: 'fin-fee-accounts', title: 'Add Fee Account', crumbLabel: 'Fee Accounts', defaultFeesRelated: true,
    }),
    onEdit: item => openCoaEdit(item.id, {
      returnView: 'fin-fee-accounts', title: 'Edit Fee Account', crumbLabel: 'Fee Accounts',
    }),
  });
}

let _feeItemPerPage = 10, _feeItemPage = 1, _feeItemSearch = '';
let _fiAccountsCache = [];
const FEE_ITEM_CATEGORIES = [
  { value: 'TERMLY',  label: 'Termly'  },
  { value: 'YEARLY',  label: 'Yearly'  },
  { value: 'ONE_OFF', label: 'One-off' },
];

function _genFeeItemCode() {
  const max = feeItemsData.reduce((m, f) => {
    const match = (f.code || '').match(/^FI-(\d+)$/);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  return 'FI-' + String(max + 1).padStart(4, '0');
}

async function _fiLoadLookups() {
  const res = await apiFetch(`${API_BASE}/accounts/?is_active=true`);
  _fiAccountsCache = (res && res.ok) ? _toArray(await res.json()) : [];
}
function _fiAccountName(id) {
  const a = _fiAccountsCache.find(a => String(a.id) === String(id));
  return a ? `${a.number || ''} — ${a.account_name || '-'}` : '-';
}

async function loadFeeItemsView(container) {
  await _fiLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.utilities',
    title: 'Fee Items',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-fee-items'},
      {label:'Fee Items'}
    ],
    apiUrl: `${API_BASE}/receivables/setup/fee-items`,
    searchFields: ['name','code'],
    col1Label: 'Name', col2Label: 'Category',
    col1: f => f.name || '—',
    col2: f => (FEE_ITEM_CATEGORIES.find(c=>c.value===f.category)||{label:'—'}).label,
    rowLabel: f => f.name || '—',
    rowSub:   f => f.code || '',
    idKey: 'id',
    detailFields: [
      {label:'Code',           key:'code'},
      {label:'Name',           key:'name'},
      {label:'Category',       key:'category', fmt:v=>(FEE_ITEM_CATEGORIES.find(c=>c.value===v)||{label:'—'}).label},
      {label:'Default Amount', key:'default_amount', fmt:v=>_finFmt(parseFloat(v)||0)},
      {label:'ECA',            key:'is_extra_curricular', fmt:v=>v?'Yes':'No'},
      {label:'Status',         key:'is_active', fmt:v=>v===false?'Inactive':'Active'},
    ],
    renderAdd: _finAddPlaceholder('Fee Item', "renderFeeItemAddPage(document.getElementById('main-content'))", 'Add a new billable fee item.'),
    onAdd:  () => renderFeeItemAddPage(document.getElementById('main-content')),
    onEdit: item => renderFeeItemAddPage(document.getElementById('main-content'), item),
  });
}

function _renderFeeItemsListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Fee Items</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Utilities &rsaquo; Fee Items &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="fi-per-page" onchange="changeFiPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===_feeItemPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="fi-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" placeholder="&#128269; Search&#8230;" oninput="onFiSearch(this.value)">
          <button class="fin-btn-teal" onclick="renderFeeItemAddPage(document.getElementById('main-content'))">+ Add Fee Item</button>
        </div>
      </div>
      <div id="fi-table-container"></div>
      <div id="fi-pagination"></div>
    </div>`;
  _renderFeeItemsTable();
}

function _fiCategoryLabel(v) {
  return (FEE_ITEM_CATEGORIES.find(c=>c.value===v)||{}).label || v || '-';
}

function _fiFiltered() {
  if (!_feeItemSearch) return feeItemsData;
  const q = _feeItemSearch;
  return feeItemsData.filter(f => (f.name||'').toLowerCase().includes(q));
}

function _renderFeeItemsTable() {
  const filtered = _fiFiltered();
  const totalEl  = document.getElementById('fi-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_feeItemPage-1)*_feeItemPerPage;
  const paged = filtered.slice(start, start+_feeItemPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length/_feeItemPerPage));

  let rows = paged.length===0
    ? `<tr><td colspan="7" class="fin-empty">No records found.</td></tr>`
    : paged.map(f=>`<tr>
        <td>${_finEsc(String(f.id))}</td>
        <td>${_finEsc(f.name||'')}</td>
        <td>${_finEsc(_fiCategoryLabel(f.category))}</td>
        <td>${_finEsc(f.account_id ? _fiAccountName(f.account_id) : '-')}</td>
        <td>${_finFmt(parseFloat(f.default_amount)||0)}</td>
        <td>${f.is_extra_curricular ? '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:0.78rem;font-weight:600;color:#1a5fb4;background:#dce8fb;">ECA</span>' : '-'}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="_pvToggleDropdown(event,'fi','${f.id}')">&#8230;</button>
            <div id="fi-dd-${f.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="renderFeeItemAddPage(document.getElementById('main-content'),${f.id});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteFeeItem(${f.id});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');

  const el = document.getElementById('fi-table-container');
  if (el) el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>ID</th><th>NAME</th><th>CATEGORY</th><th>ACCOUNT</th><th>DEFAULT AMOUNT</th><th>ECA</th><th>ACTION</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  let pg=''; for(let i=1;i<=pages;i++) pg+=`<button class="${i===_feeItemPage?'fin-pg-active':''}" onclick="fiGoPage(${i})">${i}</button>`;
  const pgEl=document.getElementById('fi-pagination');
  if(pgEl) pgEl.innerHTML=`<div class="fin-pagination">${pg}</div>`;
}

function changeFiPerPage(v){ _feeItemPerPage=parseInt(v); _feeItemPage=1; _renderFeeItemsTable(); }
function onFiSearch(v)     { _feeItemSearch=v.trim().toLowerCase(); _feeItemPage=1; _renderFeeItemsTable(); }
function fiGoPage(p)       { _feeItemPage=p; _renderFeeItemsTable(); }

// §5.4 — the account_id caches this reads from (_fiAccountsCache,
// _giAccountsCache) are fetched active-only at the source, so a record whose
// account was since deactivated would otherwise vanish from its own picker
// and render blank. Fetch that one stale id and append it labeled
// "(inactive)" instead, so the operator sees the truth rather than a blank
// field.
// A fee item's / general item's account is the revenue side of the accrual JE
// that invoice issue posts, so it has to be a postable leaf (2026-09-01 §2.2)
// — a header account here doesn't fail at pick time, it fails much later when
// somebody tries to issue an invoice carrying that item. Same
// keep-the-selected-id-visible rule as the inactive case above it.
async function _finAccountOptionsWithStaleFallback(cache, selectedId) {
  let list = cache;
  if (selectedId != null && !list.some(a => String(a.id) === String(selectedId))) {
    const res = await apiFetch(`${API_BASE}/accounts/${selectedId}`);
    if (res && res.ok) list = [...list, await res.json()];
  }
  list = list.filter(a => a.is_postable !== false || String(a.id) === String(selectedId));
  return list.map(a => `<option value="${a.id}" ${String(selectedId)===String(a.id)?'selected':''}>${_finEsc(a.number||'')} — ${_finEsc(a.account_name||'')}${a.is_active===false?' (inactive)':''}${a.is_postable===false?' (header — not postable)':''}</option>`).join('');
}

async function renderFeeItemAddPage(container, item) {
  if (!_fiAccountsCache.length) await _fiLoadLookups();
  const accountOptsHtml = await _finAccountOptionsWithStaleFallback(_fiAccountsCache, item?.account_id);
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${item ? 'Edit' : 'Add'} Fee Item</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-fee-items');return false;">Fee Items</a>
          &rsaquo; ${item ? 'Edit' : 'Add'}
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:600px;">
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Fee Item Code</label>
          <input type="text" id="fi-f-code" class="fin-form-input" value="${item ? _finEsc(item.code||'') : _genFeeItemCode()}" readonly style="background:#f5f5f5;color:#555;cursor:default;">
        </div>
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Name <span class="fin-required">*</span></label>
          <input type="text" id="fi-f-name" class="fin-form-input" value="${_finEsc(item?.name||'')}">
          <span class="fin-field-error" id="fi-f-name-err"></span>
        </div>
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Category <span class="fin-required">*</span></label>
          <select id="fi-f-category" class="fin-form-select">
            <option value="">Please Select</option>
            ${FEE_ITEM_CATEGORIES.map(c=>`<option value="${c.value}" ${item?.category===c.value?'selected':''}>${c.label}</option>`).join('')}
          </select>
          <span class="fin-field-error" id="fi-f-category-err"></span>
        </div>
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Account</label>
          <select id="fi-f-account" class="fin-form-select">
            <option value="">Please Select</option>
            ${accountOptsHtml}
          </select>
        </div>
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Default Amount <span class="fin-required">*</span></label>
          <input type="number" id="fi-f-amount" class="fin-form-input" step="0.01" value="${item?.default_amount||''}">
          <span class="fin-field-error" id="fi-f-amount-err"></span>
        </div>
        <div class="fin-form-group" style="margin-bottom:12px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
            <input type="checkbox" id="fi-f-active" class="fin-cb" ${item ? (item.is_active!==false?'checked':'') : 'checked'}> Active
          </label>
        </div>
        <div class="fin-form-group" style="margin-bottom:20px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
            <input type="checkbox" id="fi-f-eca" class="fin-cb" ${item?.is_extra_curricular?'checked':''}> Extra Curricular Activity
          </label>
        </div>
        <details style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;">
          <summary style="font-weight:600;font-size:0.9rem;cursor:pointer;color:#2c3e50;">&#9660; Advanced Options</summary>
          <div style="margin-top:12px;">
            <div class="fin-form-group" style="margin-bottom:10px;">
              <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
                <input type="checkbox" id="fi-f-proratable" class="fin-cb"
                  ${item?.is_proratable?'checked':''}
                  onchange="_fiToggleProration(this.checked)">
                Is Proratable?
              </label>
            </div>
            <div id="fi-f-proration-wrap" style="display:${item?.is_proratable?'block':'none'};margin-top:8px;">
              <label class="fin-form-label">Proration Method</label>
              <select id="fi-f-proration-method" class="fin-form-select">
                <option value="">Please Select</option>
                <option value="BY_ENROLLMENT_DATE" ${item?.proration_method==='BY_ENROLLMENT_DATE'?'selected':''}>By Enrollment Date</option>
                <option value="BY_ATTENDANCE"       ${item?.proration_method==='BY_ATTENDANCE'?'selected':''}>By Attendance</option>
              </select>
            </div>
          </div>
        </details>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="${item ? `submitFeeItemEdit(${item.id})` : 'submitFeeItemAdd()'}">${item ? 'Update' : 'Submit'}</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-fee-items')">Cancel</button>
        </div>
      </div>
    </div>`;
}

function _fiToggleProration(checked) {
  const wrap = document.getElementById('fi-f-proration-wrap');
  if (wrap) wrap.style.display = checked ? 'block' : 'none';
  if (!checked) {
    const sel = document.getElementById('fi-f-proration-method');
    if (sel) sel.value = '';
  }
}

function _fiValidate() {
  const name   = (document.getElementById('fi-f-name').value||'').trim();
  const cat    = document.getElementById('fi-f-category').value;
  const amtStr = document.getElementById('fi-f-amount').value;
  const amount = parseFloat(amtStr);
  let valid=true;
  document.getElementById('fi-f-name-err').textContent     = name ? '' : 'This field is required.'; if(!name) valid=false;
  document.getElementById('fi-f-category-err').textContent = cat  ? '' : 'This field is required.'; if(!cat)  valid=false;
  document.getElementById('fi-f-amount-err').textContent   = (amtStr!=='' && !isNaN(amount)) ? '' : 'This field is required.'; if(amtStr==='' || isNaN(amount)) valid=false;
  return valid;
}
// Map the FE `category` label onto the backend-enforced `billing_cadence`.
// One axis, two field names — cadence is the field the backend acts on.
const _FI_CATEGORY_TO_CADENCE = { TERMLY: 'PER_TERM', YEARLY: 'PER_YEAR', ONE_OFF: 'ONCE' };

function _fiPayload() {
  const category = document.getElementById('fi-f-category').value;
  return {
    code: document.getElementById('fi-f-code').value,
    name: (document.getElementById('fi-f-name').value||'').trim(),
    category,
    billing_cadence: _FI_CATEGORY_TO_CADENCE[category] || 'PER_TERM',
    default_amount: parseFloat(document.getElementById('fi-f-amount').value),
    is_active: document.getElementById('fi-f-active').checked,
    is_extra_curricular: document.getElementById('fi-f-eca').checked,
    is_proratable: document.getElementById('fi-f-proratable')?.checked ?? false,
    proration_method: document.getElementById('fi-f-proratable')?.checked
      ? (document.getElementById('fi-f-proration-method')?.value || null)
      : null,
    account_id: document.getElementById('fi-f-account').value ? parseInt(document.getElementById('fi-f-account').value, 10) : null,
  };
}

async function submitFeeItemAdd() {
  if (!_fiValidate()) return;
  try {
    const res = await apiFetch(`${API_BASE}/receivables/setup/fee-items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_fiPayload())
    });
    if (res && res.ok) { showToast('Fee item added!', 'success'); _rcvFeeItemsCache = null; } // invalidate so Fee Setup/Invoices/Statement pick it up
    else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-fee-items');
}

async function submitFeeItemEdit(id) {
  if (!_fiValidate()) return;
  try {
    const res = await apiFetch(`${API_BASE}/receivables/setup/fee-items/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_fiPayload())
    });
    if (res && res.ok) { showToast('Fee item updated!', 'success'); _rcvFeeItemsCache = null; }
    else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-fee-items');
}

async function deleteFeeItem(id) {
  if (!confirm('Delete this fee item? This cannot be undone.')) return;
  try {
    const res = await apiFetch(`${API_BASE}/receivables/setup/fee-items/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showToast('Fee item deleted.', 'success'); _rcvFeeItemsCache = null; loadView('fin-fee-items'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (_) { showToast('Network error.', 'error'); }
}

// ==================== GENERAL ITEMS ====================
// Non-student income and expense line items (e.g. canteen sales, grants, utilities).
// Each is linked to a Chart-of-Accounts entry and auto-coded GI-0001…
// Backend: GET/POST /finance/general-items/  |  GET/PATCH/DELETE /finance/general-items/{id}
// Model: GeneralItem  |  Schemas: GeneralItemCreate, GeneralItemRead, GeneralItemUpdate
// Fields: id, code, name, type(INCOME|EXPENSE), sub_type, account_id, default_amount,
//         description, is_active

let generalItemsData = [];
let _giPerPage = 10, _giPage = 1, _giSearch = '';
let _giAccountsCache = [];
const GI_TYPES = [
  { value: 'INCOME',  label: 'Income'  },
  { value: 'EXPENSE', label: 'Expense' },
];
const GI_SUBTYPES = {
  INCOME:  ['Sales','Donations','Grants','Rental Income','Interest','Other Income'],
  EXPENSE: ['Utilities','Maintenance','Stationery','Salaries','Transport','Other Expense'],
};

function _genGeneralItemCode() {
  const max = generalItemsData.reduce((m, g) => {
    const match = (g.code || '').match(/^GI-(\d+)$/);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  return 'GI-' + String(max + 1).padStart(4, '0');
}

async function _giLoadAccounts() {
  if (_giAccountsCache.length) return;
  const res = await apiFetch(`${API_BASE}/accounts/?is_active=true`);
  _giAccountsCache = (res && res.ok) ? _toArray(await res.json()) : [];
}

function _giAccountName(id) {
  const a = _giAccountsCache.find(a => String(a.id) === String(id));
  return a ? `${a.number || ''} — ${a.account_name || '-'}` : '-';
}

async function loadGeneralItemsView(container) {
  await _giLoadAccounts();
  await renderSplitView({
    container,
    moduleKey: 'finance.utilities',
    title: 'General Items',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-general-items'},
      {label:'General Items'}
    ],
    apiUrl: `${API_BASE}/finance/general-items/`,
    searchFields: ['name','code','type'],
    col1Label: 'Name', col2Label: 'Type',
    col1: g => g.name || '—',
    col2: g => g.type || '—',
    rowLabel: g => g.name || '—',
    rowSub:   g => g.code || '',
    idKey: 'id',
    detailFields: [
      {label:'Code',           key:'code'},
      {label:'Name',           key:'name'},
      {label:'Type',           key:'type'},
      {label:'Sub-Type',       key:'sub_type', fmt:v=>v||'—'},
      {label:'Default Amount', key:'default_amount', fmt:v=>_finFmt(parseFloat(v)||0)},
      {label:'Status',         key:'is_active', fmt:v=>v===false?'Inactive':'Active'},
    ],
    renderAdd: _finAddPlaceholder('General Item', "renderGeneralItemForm(document.getElementById('main-content'))", 'Add a new general (non-fee) item.'),
    onAdd:  () => renderGeneralItemForm(document.getElementById('main-content')),
    onEdit: item => renderGeneralItemForm(document.getElementById('main-content'), item),
  });
}

function _renderGiListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">General Items</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Utilities &rsaquo; General Items &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="gi-per-page" onchange="_giChangePerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===_giPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="gi-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" placeholder="&#128269; Search&#8230;" oninput="_giOnSearch(this.value)">
          <button class="fin-btn-teal" onclick="renderGeneralItemForm(document.getElementById('main-content'))">+ Add General Item</button>
        </div>
      </div>
      <div id="gi-table-container"></div>
      <div id="gi-pagination"></div>
    </div>`;
  _renderGiTable();
}

function _giFiltered() {
  if (!_giSearch) return generalItemsData;
  const q = _giSearch;
  return generalItemsData.filter(g =>
    (g.code||'').toLowerCase().includes(q) ||
    (g.name||'').toLowerCase().includes(q) ||
    (g.type||'').toLowerCase().includes(q));
}

function _renderGiTable() {
  const filtered = _giFiltered();
  const totalEl  = document.getElementById('gi-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_giPage-1)*_giPerPage;
  const paged = filtered.slice(start, start+_giPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length/_giPerPage));

  let rows = paged.length===0
    ? `<tr><td colspan="8" class="fin-empty">No records found.</td></tr>`
    : paged.map(g=>`<tr>
        <td>${_finEsc(g.code||'')}</td>
        <td>${_finEsc(g.name||'')}</td>
        <td><span style="padding:2px 8px;border-radius:10px;font-size:0.78rem;font-weight:600;${g.type==='INCOME'?'color:#276a3f;background:#d4edda;':'color:#842029;background:#f8d7da;'}">${_finEsc(g.type||'-')}</span></td>
        <td>${_finEsc(g.sub_type||'-')}</td>
        <td>${_finEsc(g.account_id ? _giAccountName(g.account_id) : '-')}</td>
        <td>${_finFmt(parseFloat(g.default_amount)||0)}</td>
        <td>${g.is_active!==false ? '<span style="color:#276a3f;font-weight:600;">Active</span>' : '<span style="color:#842029;font-weight:600;">Inactive</span>'}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="_pvToggleDropdown(event,'gi','${g.id}')">&#8230;</button>
            <div id="gi-dd-${g.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="renderGeneralItemForm(document.getElementById('main-content'),${g.id});return false;">&#9998; Edit</a>
              <a href="#" onclick="_giDelete(${g.id});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');

  const el = document.getElementById('gi-table-container');
  if (el) el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>CODE</th><th>NAME</th><th>TYPE</th><th>SUB-TYPE</th><th>ACCOUNT</th><th>DEFAULT AMOUNT</th><th>STATUS</th><th>ACTION</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  let pg=''; for(let i=1;i<=pages;i++) pg+=`<button class="${i===_giPage?'fin-pg-active':''}" onclick="_giGoPage(${i})">${i}</button>`;
  const pgEl=document.getElementById('gi-pagination');
  if(pgEl) pgEl.innerHTML=`<div class="fin-pagination">${pg}</div>`;
}

function _giChangePerPage(v){ _giPerPage=parseInt(v); _giPage=1; _renderGiTable(); }
function _giOnSearch(v)     { _giSearch=v.trim().toLowerCase(); _giPage=1; _renderGiTable(); }
function _giGoPage(p)       { _giPage=p; _renderGiTable(); }

function _giSubtypeOpts(selectedType, selectedVal) {
  const opts = GI_SUBTYPES[selectedType] || [];
  return opts.map(s=>`<option value="${s}" ${selectedVal===s?'selected':''}>${s}</option>`).join('');
}

async function renderGeneralItemForm(container, item) {
  await _giLoadAccounts();
  const code = item ? (item.code||'') : _genGeneralItemCode();
  const acctOpts = await _finAccountOptionsWithStaleFallback(_giAccountsCache, item?.account_id);
  const incomeSubOpts = _giSubtypeOpts('INCOME', item?.type==='INCOME'?item?.sub_type:'');
  const expSubOpts    = _giSubtypeOpts('EXPENSE', item?.type==='EXPENSE'?item?.sub_type:'');
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${item ? 'Edit' : 'Add'} General Item</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-general-items');return false;">General Items</a>
          &rsaquo; ${item ? 'Edit' : 'Add'}
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:600px;">
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">General Item Code</label>
          <input type="text" id="gi-f-code" class="fin-form-input" value="${_finEsc(code)}" readonly style="background:#f5f5f5;color:#555;cursor:default;">
        </div>
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Name <span class="fin-required">*</span></label>
          <input type="text" id="gi-f-name" class="fin-form-input" value="${_finEsc(item?.name||'')}">
          <span class="fin-field-error" id="gi-f-name-err"></span>
        </div>
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Type <span class="fin-required">*</span></label>
          <select id="gi-f-type" class="fin-form-select" onchange="_giTypeChange(this.value)">
            <option value="">Please Select</option>
            ${GI_TYPES.map(t=>`<option value="${t.value}" ${item?.type===t.value?'selected':''}>${t.label}</option>`).join('')}
          </select>
          <span class="fin-field-error" id="gi-f-type-err"></span>
        </div>
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Sub-Type</label>
          <select id="gi-f-subtype" class="fin-form-select">
            <option value="">Please Select</option>
            ${item?.type==='INCOME' ? incomeSubOpts : (item?.type==='EXPENSE' ? expSubOpts : '')}
          </select>
        </div>
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Account</label>
          <select id="gi-f-account" class="fin-form-select">
            <option value="">Please Select</option>
            ${acctOpts}
          </select>
        </div>
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Default Amount</label>
          <input type="number" id="gi-f-amount" class="fin-form-input" step="0.01" value="${item?.default_amount||''}">
        </div>
        <div class="fin-form-group" style="margin-bottom:16px;">
          <label class="fin-form-label">Description</label>
          <textarea id="gi-f-desc" class="fin-form-textarea" rows="3">${_finEsc(item?.description||'')}</textarea>
        </div>
        <div class="fin-form-group" style="margin-bottom:20px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
            <input type="checkbox" id="gi-f-active" class="fin-cb" ${item ? (item.is_active!==false?'checked':'') : 'checked'}> Active
          </label>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="${item ? `_giSubmitEdit(${item.id})` : '_giSubmitAdd()'}">${item ? 'Update' : 'Submit'}</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-general-items')">Cancel</button>
        </div>
      </div>
    </div>`;
}

function _giTypeChange(type) {
  const sel = document.getElementById('gi-f-subtype');
  if (!sel) return;
  const opts = GI_SUBTYPES[type] || [];
  sel.innerHTML = `<option value="">Please Select</option>` + opts.map(s=>`<option value="${s}">${s}</option>`).join('');
}

function _giPayload() {
  return {
    code:           document.getElementById('gi-f-code').value,
    name:           (document.getElementById('gi-f-name').value||'').trim(),
    type:           document.getElementById('gi-f-type').value,
    sub_type:       document.getElementById('gi-f-subtype').value || null,
    account_id:     document.getElementById('gi-f-account').value ? parseInt(document.getElementById('gi-f-account').value, 10) : null,
    default_amount: document.getElementById('gi-f-amount').value ? parseFloat(document.getElementById('gi-f-amount').value) : null,
    description:    document.getElementById('gi-f-desc').value.trim() || null,
    is_active:      document.getElementById('gi-f-active').checked,
  };
}

function _giValidate() {
  const name = (document.getElementById('gi-f-name').value||'').trim();
  const type = document.getElementById('gi-f-type').value;
  let valid = true;
  document.getElementById('gi-f-name-err').textContent = name ? '' : 'This field is required.'; if(!name) valid=false;
  document.getElementById('gi-f-type-err').textContent = type ? '' : 'This field is required.'; if(!type) valid=false;
  return valid;
}

async function _giSubmitAdd() {
  if (!_giValidate()) return;
  try {
    const res = await apiFetch(`${API_BASE}/finance/general-items/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_giPayload())
    });
    if (res && res.ok) { showToast('General item added!', 'success'); }
    else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-general-items');
}

async function _giSubmitEdit(id) {
  if (!_giValidate()) return;
  const payload = _giPayload();
  delete payload.code;
  try {
    const res = await apiFetch(`${API_BASE}/finance/general-items/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (res && res.ok) { showToast('General item updated!', 'success'); }
    else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-general-items');
}

async function _giDelete(id) {
  if (!confirm('Delete this general item? This cannot be undone.')) return;
  try {
    const res = await apiFetch(`${API_BASE}/finance/general-items/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showToast('General item deleted.', 'success'); loadView('fin-general-items'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (_) { showToast('Network error.', 'error'); }
}

// ==================== TENDEPAY MODULE ====================
// Payment Vouchers now settle exclusively through a Tendepay statement
// import (js/payables.js "Queue for Tendepay" moves a voucher to
// awaiting_tendepay; confirming a batch here marks it paid + posts JEs).
// Route prefix confirmed live: single /api prefix (unlike Payables/Reports,
// which are double-prefixed on this backend).
const _TP_BASE = `${API_BASE}/tendepay`;
function _tpMoney(v) { return _pvMoney(v); }
function _tpDate(v) { return _pvDate(v); }

async function _tpFetchVoucherMap() {
  const map = {};
  try {
    const res = await apiFetch(_PV_PV_API);
    if (res && res.ok) _toArray(await res.json()).forEach(v => { map[v.id] = v.voucher_no || `#${v.id}`; });
  } catch (_) {}
  return map;
}

function _tpEmployeeLabel(code) {
  const emp = (employeesData || []).find(e => e.employee_code === code);
  const name = emp ? ((emp.surname || emp.first_name || '') + ' ' + (emp.other_names || emp.last_name || '')).trim() : '';
  return name ? `${code} — ${name}` : (code || '');
}

// For payroll/consultant imports, a statement row matches to one *employee's*
// run line (payroll_run_line_id / consultant_run_line_id) — the run-level
// voucher (PaymentVoucher.id) is a totally different ID space. The old code
// looked matched_voucher_id up in the voucher map regardless of mode, which
// either showed the wrong voucher's number (on an ID collision) or a bare
// "#<line id>" — reinforcing "this matches a PV" when it never did.
async function _tpFetchMatchTargetMap() {
  if (_tpWiz.importMode === 'supplier') return _tpFetchVoucherMap();
  const map = {};
  try {
    const runId = _tpWiz.importMode === 'consultant' ? _tpWiz.consultantRunId : _tpWiz.payrollRunId;
    const url = _tpWiz.importMode === 'consultant'
      ? `${API_BASE}/payroll/consultant-runs/${runId}` : `${API_BASE}/payroll/runs/${runId}`;
    const res = await apiFetch(url);
    if (res && res.ok) {
      const run = await res.json();
      (run.lines || []).forEach(l => { map[l.id] = _tpEmployeeLabel(l.employee_code); });
    }
  } catch (_) {}
  return map;
}

// ── Import Statement wizard (3 steps: upload → review → confirm) ──────────
let _tpWiz = null;
function _tpNewWizState() {
  return { step: 1, batchId: null, transactions: [], matchedCount: 0, unmatchedCount: 0, totalAmount: 0,
    totalCharges: 0, legacyFormat: false, importMode: 'supplier', payrollRunId: null, consultantRunId: null,
    skippedRows: [], alreadyImported: [], voucherPicks: {}, confirmedIds: {}, voucherMap: {} };
}

async function loadTendepayImportView(container) {
  await _pvLoadLookups();
  _tpWiz = _tpNewWizState();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Import Statement</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Tendepay &rsaquo; Import Statement</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <span class="fin-wizard-step-badge" id="tp-step-badge-1">1. Upload</span>
        <span class="fin-wizard-step-badge" id="tp-step-badge-2">2. Review</span>
        <span class="fin-wizard-step-badge" id="tp-step-badge-3">3. Confirm</span>
      </div>
      <div id="tp-wiz-body"></div>
    </div>`;
  _tpRenderWizStep();
}

function _tpRenderWizStepBadges() {
  [1, 2, 3].forEach(n => {
    const el = document.getElementById(`tp-step-badge-${n}`);
    if (!el) return;
    el.style.cssText = n === _tpWiz.step
      ? 'padding:6px 14px;border-radius:14px;background:var(--navy-700,#1B3057);color:#fff;font-weight:600;font-size:0.85rem;'
      : 'padding:6px 14px;border-radius:14px;background:#eee;color:#888;font-size:0.85rem;';
  });
}

function _tpRenderWizStep() {
  _tpRenderWizStepBadges();
  if (_tpWiz.step === 1) _tpRenderStep1();
  else if (_tpWiz.step === 2) _tpRenderStep2();
  else _tpRenderStep3();
}

async function _tpRenderStep1() {
  // Mode selector renders first — it is the single control that decides which
  // template we download, which columns the on-page table shows, and which
  // notes blurb accompanies them. Everything downstream keys off it.
  const body = document.getElementById('tp-wiz-body');
  body.innerHTML = `
    <div class="fin-form-wrap">
      <div class="fin-form-group">
        <label class="fin-form-label">Import Mode</label>
        <div style="display:flex;gap:20px;margin-top:6px;">
          <label><input type="radio" name="tp-import-mode" value="supplier" checked onchange="_tpToggleImportMode()"> Supplier payments</label>
          <label><input type="radio" name="tp-import-mode" value="payroll" onchange="_tpToggleImportMode()"> Payroll return statement</label>
          <label><input type="radio" name="tp-import-mode" value="consultant" onchange="_tpToggleImportMode()"> Consultant return statement</label>
        </div>
        <div id="tp-import-payroll-run-wrap" style="display:none;margin-top:10px;">
          <div class="fin-form-group" style="max-width:340px;">
            <label class="fin-form-label" id="tp-import-run-label">Payroll Run <span class="fin-required">*</span></label>
            <select id="tp-import-payroll-run" class="fin-form-select"><option value="">Please Select</option></select>
            <div id="tp-import-run-hint" style="font-size:0.8rem;margin-top:4px;"></div>
          </div>
        </div>
      </div>
      <div class="fin-form-group" style="max-width:420px;">
        <label class="fin-form-label">Tendepay Wallet</label>
        <select id="tp-import-wallet-account" class="fin-form-select">
          <option value="">Pick the wallet this batch settled from</option>
        </select>
        <div style="font-size:0.78rem;color:#666;margin-top:4px;">Optional for uploads that carry an ACCOUNT column per row (raw Tendepay exports). Required for the thin per-mode template — every row will settle from this wallet.</div>
        <div id="tp-import-wallet-error" style="font-size:0.8rem;color:var(--coral-600,#c0392b);margin-top:4px;"></div>
      </div>
      <div id="tp-expected-cols-wrap"></div>
      <div style="margin-top:16px;display:flex;gap:10px;align-items:center;">
        <button class="fin-btn-outline" onclick="_tpDownloadTemplate()">Download Template</button>
        <input type="file" id="tp-upload-file" accept=".csv,.xlsx,.xls" style="display:none;" onchange="_tpUploadFile(this)">
        <button class="fin-btn-teal" onclick="document.getElementById('tp-upload-file').click()">Choose File &amp; Upload</button>
        <span id="tp-upload-status" style="color:#888;font-size:0.85rem;"></span>
      </div>
    </div>`;
  await _tpLoadWalletOptions();
  await _tpLoadPayrollRunOptions();
  await _tpRefreshExpectedCols('supplier');
}

// Rebuild the "Columns in this template" table for the picked mode. Called
// on initial render and every time the mode radio changes. The table + notes
// come straight from GET /expected-columns?mode=... — same source of truth
// as the template file itself, so what the operator sees on the page is
// exactly what a download will contain and what an upload will be parsed as.
async function _tpRefreshExpectedCols(mode) {
  const wrap = document.getElementById('tp-expected-cols-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<p class="sa-loading">Loading column contract&#8230;</p>';
  let cols = { required_columns: [], optional_columns: [], notes: '' };
  try {
    const res = await apiFetch(`${_TP_BASE}/import/expected-columns?mode=${encodeURIComponent(mode)}`);
    if (res && res.ok) cols = await res.json();
  } catch (_) {}
  const colRows = (list, required) => (list || []).map(c => `
    <tr><td>${_finEsc(c.header || c.name || '')}</td><td>${required ? 'Required' : 'Optional'}</td><td>${_finEsc(c.description || '')}</td><td>${_finEsc(c.example ?? '')}</td></tr>`).join('');
  const notesHtml = cols.notes ? `
    <div style="background:#eef3fb;border-radius:8px;padding:12px 16px;margin:12px 0;font-size:0.85rem;color:#2c3e50;white-space:pre-wrap;">${_finEsc(cols.notes)}</div>` : '';
  wrap.innerHTML = `
    <div class="fin-section-label" style="margin-top:16px;">Columns in this template</div>
    <div style="font-size:0.82rem;color:#666;margin-bottom:6px;">These are the exact columns the template you download will contain — nothing more, nothing less. Fill them in for each payment on the statement.</div>
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Column</th><th>Required</th><th>Description</th><th>Example</th></tr></thead>
      <tbody>${colRows(cols.required_columns, true)}${colRows(cols.optional_columns, false)}</tbody>
    </table></div>
    ${notesHtml}`;
}

// Consultant promoted to a top-level peer of Supplier/Payroll (2026-08-18
// addendum alignment) — was previously a nested "Run Type" sub-radio under
// Payroll. All downstream logic already keyed off the resolved mode string
// ('supplier'|'payroll'|'consultant'), so this is a pure UI reshuffle.
function _tpToggleImportMode() {
  const mode = (document.querySelector('input[name="tp-import-mode"]:checked') || {}).value || 'supplier';
  const wrap = document.getElementById('tp-import-payroll-run-wrap');
  if (wrap) wrap.style.display = (mode === 'payroll' || mode === 'consultant') ? 'block' : 'none';
  const label = document.getElementById('tp-import-run-label');
  if (label) label.innerHTML = (mode === 'consultant' ? 'Consultant Run' : 'Payroll Run') + ' <span class="fin-required">*</span>';
  if (mode === 'payroll' || mode === 'consultant') _tpLoadPayrollRunOptions();
  // Keep the on-page columns table honest with the picked mode.
  _tpRefreshExpectedCols(mode);
}

async function _tpLoadPayrollRunOptions() {
  const sel = document.getElementById('tp-import-payroll-run');
  if (!sel) return;
  const hint = document.getElementById('tp-import-run-hint');
  const setHint = (msg, isError) => { if (hint) hint.innerHTML = msg ? `<span style="color:${isError ? 'var(--coral-600,#c0392b)' : '#888'};">${_finEsc(msg)}</span>` : ''; };
  setHint('');
  const runType = (document.querySelector('input[name="tp-import-mode"]:checked') || {}).value || 'payroll';
  try {
    // The run's own `status` is NOT a reliable signal for "ready to import" —
    // confirmed live: a run can sit at `approved` indefinitely while its
    // voucher has already progressed past that to `awaiting_tendepay` (queued)
    // or `paid`. The voucher's own status is the authoritative signal, so we
    // fetch runs unfiltered and match purely on `payment_voucher_id` against
    // the voucher ID sets below (payee_type=Staff covers both employee
    // payroll and consultant vouchers — VoucherPayeeType has no separate
    // "Consultant" value).
    const [awaitingVchRes, paidVchRes] = await Promise.all([
      apiFetch(`${API_BASE}/payables/payment-vouchers/?status=awaiting_tendepay&payee_type=Staff`),
      apiFetch(`${API_BASE}/payables/payment-vouchers/?status=paid&payee_type=Staff`),
    ]);
    // Any of these four calls failing (403/422/500/etc.) used to be swallowed
    // silently into an empty list, so a fetch error and "genuinely zero runs
    // qualify" both rendered as the same unexplained empty dropdown. Surface
    // failures instead of hiding them.
    const failures = [];
    if (awaitingVchRes && !awaitingVchRes.ok) failures.push(`awaiting-Tendepay vouchers: ${await parseApiError(awaitingVchRes)}`);
    if (paidVchRes && !paidVchRes.ok) failures.push(`paid vouchers: ${await parseApiError(paidVchRes)}`);
    const awaitingVoucherIds = new Set(((awaitingVchRes && awaitingVchRes.ok) ? _toArray(await awaitingVchRes.json()) : []).map(v => v.id));
    const paidVoucherIds = new Set(((paidVchRes && paidVchRes.ok) ? _toArray(await paidVchRes.json()) : []).map(v => v.id));

    const runsUrl = runType === 'consultant' ? `${API_BASE}/payroll/consultant-runs/` : `${API_BASE}/payroll/runs/`;
    const runsRes = await apiFetch(runsUrl);
    if (runsRes && !runsRes.ok) failures.push(`${runType} runs: ${await parseApiError(runsRes)}`);
    const allRuns = (runsRes && runsRes.ok) ? _toArray(await runsRes.json()) : [];
    if (failures.length) {
      console.error('Tendepay run picker: fetch failure(s)', failures);
      setHint(`Could not fully load runs — ${failures.join('; ')}`, true);
    }
    const runs = allRuns.filter(r => r.payment_voucher_id != null &&
      (awaitingVoucherIds.has(r.payment_voucher_id) || paidVoucherIds.has(r.payment_voucher_id)));
    sel.innerHTML = '<option value="">Please Select</option>' +
      runs.map(r => `<option value="${r.id}">${_finEsc(r.run_number || ('Run #' + r.id))}</option>`).join('');
    if (!failures.length && runs.length === 0) {
      setHint('No runs are currently queued for Tendepay. A run only appears here once its Payment Voucher has been queued via Payables ("Queue for Tendepay").', false);
    }
  } catch (err) {
    console.error('Tendepay run picker: unexpected error', err);
    setHint('Could not load payroll runs — see console for details.', true);
  }
}

// Sourced from the money-holding-accounts lookup (2026-08-18 §F.3), not
// /api/bank-accounts or the general accounts list — Tendepay wallets have no
// BankAccount row, and this is the same registry the Cash Book / Cashflow
// Statement pickers already use (js/finance-reports.js). Filtered
// client-side to kind === "wallet"; label is the bare account_name per the
// 2026-08-24 addendum (no main/mini distinction on this lookup's shape).
async function _tpLoadWalletOptions() {
  const sel = document.getElementById('tp-import-wallet-account');
  if (!sel) return;
  await _repLoadMoneyHoldingAccounts();
  const wallets = (_repMoneyHoldingAccounts || []).filter(a => a.kind === 'wallet');
  sel.innerHTML = '<option value="">Pick the wallet this batch settled from</option>' +
    wallets.map(w => `<option value="${w.gl_account_id}">${_finEsc(w.account_name || ('Account #' + w.gl_account_id))}</option>`).join('');
}

async function _tpDownloadTemplate() {
  // Template is mode-specific: supplier => PV NUMBER, payroll => EMPLOYEE
  // CODE, consultant => CONSULTANT CODE for the match-key column.
  // Source order: (1) Step-1 mode radio when it's still in the DOM, then
  // (2) the batch mode carried on the wizard state (Step 2 legacy-banner
  // download hits this path), then (3) supplier as a safe default.
  const radio = document.querySelector('input[name="tp-import-mode"]:checked');
  const mode = (radio && radio.value) || (_tpWiz && _tpWiz.importMode) || 'supplier';
  await authBlobDownload(`${_TP_BASE}/import/template?mode=${encodeURIComponent(mode)}`, `tendepay-${mode}-template.xlsx`, {
    errorPrefix: 'Could not download template: ',
  });
}

async function _tpUploadFile(input) {
  const file = input.files[0];
  if (!file) return;
  const mode = (document.querySelector('input[name="tp-import-mode"]:checked') || {}).value || 'supplier'; // 'supplier' | 'payroll' | 'consultant'
  const runId = document.getElementById('tp-import-payroll-run')?.value || '';
  const walletId = document.getElementById('tp-import-wallet-account')?.value || '';
  const walletErrEl = document.getElementById('tp-import-wallet-error');
  if (walletErrEl) walletErrEl.textContent = '';
  if ((mode === 'payroll' || mode === 'consultant') && !runId) {
    showToast(`${mode === 'consultant' ? 'Consultant Run' : 'Payroll Run'} is required for a ${mode === 'consultant' ? 'consultant' : 'payroll'} return statement.`, 'error');
    return;
  }
  // wallet_account_id is optional on the wire (§B.5/B.6) — a raw Tendepay
  // export with a per-row ACCOUNT column needs no batch fallback at all.
  // Only include it when picked, so an empty string never lands on the
  // nullable-int form field.
  const statusEl = document.getElementById('tp-upload-status');
  if (statusEl) statusEl.textContent = 'Uploading…';
  const fd = new FormData();
  fd.append('file', file);
  fd.append('import_mode', mode);
  if (walletId) fd.append('wallet_account_id', walletId);
  if (mode === 'consultant') fd.append('consultant_run_id', runId);
  else if (mode === 'payroll') fd.append('payroll_run_id', runId);
  const res = await apiFetch(`${_TP_BASE}/import`, { method: 'POST', body: fd });
  if (!res || !res.ok) {
    if (statusEl) statusEl.textContent = '';
    const detail = res ? await parseApiError(res) : 'network error';
    // Server-side wallet validation (bad/inactive account, wrong wallet_role)
    // reads as a picker-level problem, not a generic upload failure — surface
    // it inline next to the picker, verbatim, instead of only as a toast.
    if (res && res.status === 400 && /wallet_account_id/i.test(detail) && walletErrEl) {
      walletErrEl.textContent = detail;
    } else {
      showToast('Upload failed: ' + detail, 'error');
    }
    return;
  }
  const data = await res.json();
  _tpWiz.batchId = data.batch_id ?? data.id;
  _tpWiz.transactions = data.transactions || [];
  _tpWiz.matchedCount = data.matched_count ?? _tpWiz.transactions.filter(t => t.matched_voucher_id).length;
  _tpWiz.unmatchedCount = data.unmatched_count ?? (_tpWiz.transactions.length - _tpWiz.matchedCount);
  _tpWiz.totalAmount = data.total_amount ?? _tpWiz.transactions.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  _tpWiz.totalCharges = data.total_charges ?? 0;
  _tpWiz.legacyFormat = !!data.legacy_format;
  _tpWiz.importMode = data.import_mode || mode;
  _tpWiz.payrollRunId = data.payroll_run_id ?? (mode === 'payroll' ? parseInt(runId, 10) : null);
  _tpWiz.consultantRunId = data.consultant_run_id ?? (mode === 'consultant' ? parseInt(runId, 10) : null);
  _tpWiz.skippedRows = data.skipped_rows || [];
  _tpWiz.alreadyImported = data.already_imported || [];
  _tpWiz.voucherMap = await _tpFetchMatchTargetMap();
  // Pre-tick rows the backend is confident about — exact/high confidence auto-match;
  // medium confidence is never pre-ticked, the operator must confirm manually (§5.5).
  _tpWiz.transactions.forEach(t => {
    if (t.matched_voucher_id != null) _tpWiz.confirmedIds[t.id] = t.match_confidence !== 'medium';
  });
  _tpWiz.step = 2;
  _tpRenderWizStep();
}

function _tpConfidencePill(conf) {
  const map = { exact: ['Exact', '#1e7e34', '#dcf3e2'], high: ['High', '#1a5fb4', '#dce8fb'], medium: ['Medium — confirm', '#8a6d00', '#f5e6a8'] };
  const entry = map[conf];
  if (!entry) return '';
  const [label, color, bg] = entry;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:600;color:${color};background:${bg};margin-left:6px;">${label}</span>`;
}

function _tpRenderStep2() {
  const body = document.getElementById('tp-wiz-body');
  const isLineMode = _tpWiz.importMode !== 'supplier'; // payroll/consultant match to a run line (employee), not a voucher
  const targetNoun = isLineMode ? 'employee' : 'voucher';
  const refColLabel = isLineMode ? 'Employee Code' : 'Voucher Ref';
  const rows = _tpWiz.transactions.map(t => {
    let matchCell;
    if (t.amount_mismatch) {
      matchCell = `<div style="background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:8px 10px;border-radius:6px;font-size:0.78rem;">
        Amount mismatch — statement says ${_tpMoney(t.amount)}, ${targetNoun} ${_finEsc(t.voucher_ref || '')} expects ${_tpMoney(t.expected_amount ?? t.expected)}. Resolve before confirming.
      </div>`;
    } else if (t.matched_voucher_id != null) {
      const checked = _tpWiz.confirmedIds[t.id] ? 'checked' : '';
      matchCell = `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" ${checked} onchange="_tpWiz.confirmedIds[${t.id}]=this.checked;">
        <span>${_finEsc(_tpWiz.voucherMap[t.matched_voucher_id] || ('#' + t.matched_voucher_id))}</span>${_tpConfidencePill(t.match_confidence)}
      </label>`;
    } else if (t.wallet_unrecognised) {
      matchCell = `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.78rem;font-weight:600;color:#c0392b;background:#fde0de;">Unrecognised wallet</span>`;
    } else if (t.possible_voucher_ids && t.possible_voucher_ids.length) {
      matchCell = `<select class="fin-form-select" style="width:auto;" onchange="_tpWiz.voucherPicks[${t.id}]=this.value?parseInt(this.value,10):null;">
        <option value="">-- Pick ${targetNoun} --</option>
        ${t.possible_voucher_ids.map(id => `<option value="${id}" ${_tpWiz.voucherPicks[t.id] === id ? 'selected' : ''}>${_finEsc(_tpWiz.voucherMap[id] || (targetNoun + ' #' + id))}</option>`).join('')}
      </select>`;
    } else {
      matchCell = `<span style="color:#888;">No match</span>`;
    }
    return `<tr>
      <td>${_finEsc(t.tendepay_reference || '')}</td>
      <td>${_finEsc(t.wallet_name || '')}</td>
      <td>${_finEsc(t.payee_name || '')}</td>
      <td>${_finEsc(t.service_account || '')}</td>
      <td>${_tpMoney(t.amount)}</td>
      <td>${_tpMoney(t.charge)}</td>
      <td>${_tpDate(t.transaction_date)}</td>
      <td>${_finEsc(t.gateway_receipt || '')}</td>
      <td>${_finEsc(t.voucher_ref || '')}</td>
      <td>${matchCell}</td>
    </tr>`;
  }).join('');

  const legacyHtml = _tpWiz.legacyFormat ? `
    <div style="background:#eef3fb;border-left:4px solid var(--navy-700,#1B3057);padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:0.85rem;color:#1B3057;display:flex;align-items:center;gap:12px;">
      <span>This file uses the previous template. It has been accepted, but download the current template for future imports.</span>
      <button class="fin-btn-outline" onclick="_tpDownloadTemplate()">Download current template</button>
    </div>` : '';

  const skippedHtml = _tpWiz.skippedRows.length ? `
    <details style="margin-top:14px;">
      <summary style="cursor:pointer;font-weight:600;color:#2c3e50;">Skipped rows (${_tpWiz.skippedRows.length})</summary>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Row</th><th>Reference</th><th>Reason</th></tr></thead>
        <tbody>${_tpWiz.skippedRows.map(r => `<tr><td>${_finEsc(r.row ?? r.row_number ?? '')}</td><td>${_finEsc(r.reference || '')}</td><td>${_finEsc(r.reason || '')}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>` : '';

  const alreadyHtml = _tpWiz.alreadyImported.length ? `
    <details style="margin-top:14px;">
      <summary style="cursor:pointer;font-weight:600;color:#2c3e50;">Already imported (${_tpWiz.alreadyImported.length})</summary>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Reference</th><th>Batch</th></tr></thead>
        <tbody>${_tpWiz.alreadyImported.map(r => `<tr><td>${_finEsc(r.reference || r.tendepay_reference || '')}</td><td>${_finEsc(r.batch_id ?? r.import_batch_id ?? '')}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>` : '';

  body.innerHTML = `
    <div class="fin-form-wrap">
      ${legacyHtml}
      <div class="fin-controls-row">
        <div class="fin-controls-left">${_tpWiz.matchedCount} matched, ${_tpWiz.unmatchedCount} unmatched &middot; Total ${_tpMoney(_tpWiz.totalAmount)} &middot; Transaction Charges ${_tpMoney(_tpWiz.totalCharges)}</div>
      </div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Tendepay Ref</th><th>Wallet</th><th>Payee</th><th>Service/Account</th><th>Amount</th><th>Charge</th><th>Date</th><th>Receipt</th><th>${_finEsc(refColLabel)}</th><th>Match</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10" class="fin-empty">No transactions in this file.</td></tr>'}</tbody>
      </table></div>
      ${skippedHtml}
      ${alreadyHtml}
      <div class="fin-form-actions">
        <button class="fin-btn-cancel" onclick="_tpWiz.step=1;_tpRenderWizStep();">Back</button>
        <button class="fin-btn-teal" onclick="_tpWiz.step=3;_tpRenderWizStep();">Continue</button>
      </div>
    </div>`;
}

function _tpRenderStep3() {
  const body = document.getElementById('tp-wiz-body');
  body.innerHTML = `
    <div class="fin-form-wrap">
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
          <select id="tp-confirm-ledger" class="fin-form-select"><option value="">Please Select</option>${_pvLedgerOptions(null)}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Cost Center <span class="fin-required">*</span></label>
          <select id="tp-confirm-cost-center" class="fin-form-select"><option value="">Please Select</option>${_pvCostCenterOptions(null)}</select>
        </div>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Unmatched rows</label>
        <div style="display:flex;gap:20px;margin-top:6px;">
          <label><input type="radio" name="tp-unmatched-action" value="suspense" checked> Send to Suspense</label>
          <label><input type="radio" name="tp-unmatched-action" value="skip"> Skip</label>
        </div>
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-cancel" onclick="_tpWiz.step=2;_tpRenderWizStep();">Back</button>
        <button class="fin-btn-teal" onclick="_tpConfirmImport()">Confirm Import</button>
      </div>
      <div id="tp-confirm-msg"></div>
    </div>`;
}

async function _tpConfirmImport() {
  const ledgerId = parseInt(document.getElementById('tp-confirm-ledger').value, 10);
  const costCenterId = parseInt(document.getElementById('tp-confirm-cost-center').value, 10);
  const unmatchedAction = (document.querySelector('input[name="tp-unmatched-action"]:checked') || {}).value || 'suspense';
  if (!ledgerId || !costCenterId) { showToast('Ledger and Cost Center are required.', 'error'); return; }

  // Exactly one target FK per match, dispatched by import_mode: supplier ->
  // voucher_id, payroll -> payroll_run_line_id, consultant -> consultant_run_line_id.
  const idField = _tpWiz.importMode === 'consultant' ? 'consultant_run_line_id'
    : _tpWiz.importMode === 'payroll' ? 'payroll_run_line_id' : 'voucher_id';
  const confirmedMatches = [];
  _tpWiz.transactions.forEach(t => {
    if (t.amount_mismatch) return; // cannot auto-tick; operator must resolve the mismatch first
    if (t.matched_voucher_id != null && _tpWiz.confirmedIds[t.id]) {
      confirmedMatches.push({ tendepay_transaction_id: t.id, [idField]: t.matched_voucher_id, match_method: 'auto' });
    } else if (_tpWiz.voucherPicks[t.id]) {
      confirmedMatches.push({ tendepay_transaction_id: t.id, [idField]: _tpWiz.voucherPicks[t.id], match_method: 'manual' });
    }
  });

  const res = await apiFetch(`${_TP_BASE}/import/${_tpWiz.batchId}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed_matches: confirmedMatches, unmatched_action: unmatchedAction, ledger_id: ledgerId, cost_center_id: costCenterId }),
  });
  if (res && res.ok) {
    const data = await res.json();
    // TendepayConfirmResult is a discriminated union on `mode` (addendum
    // §8.3) — supplier responses carry posted_journal_entries[], but
    // payroll/consultant responses don't have that field at all, they carry
    // voucher_journal_entry_id + paid_line_count + run_completed instead.
    // Reading posted_journal_entries unconditionally silently produced "0
    // journal entries posted" on every payroll/consultant confirm even
    // though a voucher JE had in fact posted.
    let msg;
    if (data.mode === 'payroll' || data.mode === 'consultant') {
      const runNoun = data.mode === 'payroll' ? 'payroll run' : 'consultant run';
      msg = `Batch confirmed. ${data.paid_line_count ?? confirmedMatches.length} line(s) paid`;
      if (data.voucher_journal_entry_id) msg += `, voucher JE #${data.voucher_journal_entry_id} posted`;
      msg += data.run_completed ? `. The ${runNoun} is now fully paid.` : `. The ${runNoun} still has unpaid lines.`;
    } else {
      const jvNumbers = (data.posted_journal_entries || []).map(j => (typeof j === 'object' ? (j.jv_number || j.id) : j)).join(', ');
      msg = `Batch confirmed. ${confirmedMatches.length} vouchers paid, ${(data.posted_journal_entries || []).length} journal entries posted.${jvNumbers ? ' (' + jvNumbers + ')' : ''}`;
    }
    if (data.charges_journal_entry_id) msg += ` Transaction Charges JE #${data.charges_journal_entry_id}.`;
    showToast(msg, 'success');
    loadView('tendepay-import-history');
  } else if (res && res.status === 409) {
    // The global period-lock guard (§G) now also emits 409 from this
    // endpoint — don't assume "already confirmed" without checking the
    // message, or a locked-period rejection gets mislabeled and the batch
    // is wrongly redirected to history as if it were done.
    const msg = await parseApiError(res);
    if (isPeriodLockError(res.status, msg)) {
      showPeriodLockError(document.getElementById('tp-confirm-msg'), msg);
    } else {
      showToast('This batch has already been confirmed.', 'error');
      loadView('tendepay-import-history');
    }
  } else if (res) {
    const body = await res.json().catch(() => null);
    if (body && Array.isArray(body.validation_errors) && body.validation_errors.length) {
      _tpRenderValidationErrors(body.validation_errors);
    } else {
      const detail = body && body.detail;
      const msg = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : `HTTP ${res.status}`);
      showToast('Error: ' + msg, 'error');
    }
  }
}

// Split-salary and other row-level confirm failures — keyed to the affected
// row/line rather than swallowed into a single generic toast (§6.3).
function _tpRenderValidationErrors(errors) {
  const body = document.getElementById('tp-wiz-body');
  if (!body) return;
  const list = errors.map(e => {
    const label = e.tendepay_transaction_id ?? e.payroll_run_line_id ?? e.consultant_run_line_id ?? e.row ?? '';
    const msg = e.msg || e.detail || (typeof e === 'string' ? e : JSON.stringify(e));
    return `<li>${label !== '' ? `<strong>${_finEsc(String(label))}:</strong> ` : ''}${_finEsc(msg)}</li>`;
  }).join('');
  const banner = document.createElement('div');
  banner.style.cssText = 'background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:12px 16px;border-radius:8px;margin-top:14px;font-size:0.85rem;';
  banner.innerHTML = `<strong>Could not confirm batch:</strong><ul style="margin:8px 0 0 18px;">${list}</ul>`;
  body.appendChild(banner);
}

// ── Import History ──────────────────────────────────────────────────────────
async function loadTendepayImportHistoryView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-filter-section">
      <div class="fin-filter-grid">
        <div class="fin-filter-field"><label class="fin-filter-label">Start Date</label><input type="date" id="tp-hist-start" class="fin-filter-input"></div>
        <div class="fin-filter-field"><label class="fin-filter-label">End Date</label><input type="date" id="tp-hist-end" class="fin-filter-input"></div>
      </div>
      <div class="fin-filter-actions"><button class="fin-btn-teal" onclick="_tpHistReload()">Filter</button></div>
    </div>
    <div id="tp-hist-split"></div>`;
  await _tpHistReload();
}

async function _tpHistReload() {
  const start = document.getElementById('tp-hist-start')?.value;
  const end = document.getElementById('tp-hist-end')?.value;
  const params = new URLSearchParams();
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  await renderSplitView({
    container: document.getElementById('tp-hist-split'),
    title: 'Import History',
    breadcrumb: [{label:'Dashboard',view:null},{label:'Finance',view:null},{label:'Tendepay Import History'}],
    apiUrl: `${_TP_BASE}/import-history${params.toString() ? '?' + params.toString() : ''}`,
    searchFields: ['filename'],
    col1Label: 'Filename', col2Label: 'Status',
    col1: b => b.filename || `Batch #${b.id}`,
    col2: b => _pvBadge(b.status),
    rowLabel: b => b.filename || `Batch #${b.id}`,
    rowSub: b => _tpDate(b.imported_at),
    idKey: 'id',
    detailFields: [
      {label:'Filename',     key:'filename', fmt:v=>v||'—'},
      {label:'Imported At',  key:'imported_at', fmt:v=>_tpDate(v)},
      {label:'Status',       key:'status', fmt:v=>_pvBadge(v)},
      {label:'Row Count',    key:'row_count', fmt:v=>v ?? '—'},
      {label:'Matched',      key:'matched_count', fmt:v=>v ?? '—'},
      {label:'Unmatched',    key:'unmatched_count', fmt:v=>v ?? '—'},
      {label:'Total Amount', key:'total_amount', fmt:v=>_tpMoney(v)},
      {label:'Transaction Charges', key:'total_charges', fmt:v=>v!=null?_tpMoney(v):'—'},
      {label:'Charges Journal Entry', key:'charges_journal_entry_id', fmt:v=>v||'—'},
      {label:'Notes',        key:'notes', fmt:v=>v||'—'},
    ],
    detailActions: _tpHistDetailActions,
  });
}

// A batch stays `pending_review` if the operator uploaded a statement but
// didn't finish the Import wizard's Step 3 (Ledger/Cost Center/Confirm) in
// that same session — there was previously no way back into that batch, so
// it just sat there with no path to "payment done." This resumes confirmation
// from History instead of requiring a re-upload.
// A batch can land here CONFIRMED with 0 matched rows and 0 charges — the
// old Resume-from-History flow used to POST exactly this fabricated confirm
// (see the note in _tpHistConfirmBatch) before that path was closed off.
// Nothing was actually posted to the ledger for these, so unlike a normal
// confirmed batch they're safe to unwind without going through JE reversal.
function isEmptyConfirm(b) {
  return b.status === 'confirmed' && b.matched_count === 0 && parseFloat(b.total_charges || '0') === 0;
}

function _tpHistDetailActions(b) {
  // renderSplitView hands the selected item straight to detailActions each
  // render, so it's stashed here for the modal opener below rather than
  // round-tripping fields through an inline onclick string.
  window._tpHistCurrentBatch = b;
  let html = '';
  if (b.status === 'pending_review') {
    if ((b.matched_count ?? 0) > 0) {
      // Resuming a matched batch from History can never actually recover
      // its row-level matches: GET /tendepay/import/{id} only returns
      // batch metadata, and the only other source — the Tendepay
      // Transaction History report — never carries rows for a batch that
      // hasn't been confirmed yet. _tpHistConfirmBatch already refuses to
      // POST a fabricated short/empty confirm rather than silently
      // corrupting the batch (see its own guard), but that's a dead end
      // discovered only after the operator fills the whole modal in.
      // Don't dangle "Confirm Batch" as if it were the primary path when
      // it's guaranteed to fail — say so up front and point at the actual
      // recovery (discard + re-upload).
      html += `<div style="width:100%;padding:10px 14px;border-radius:6px;border-left:3px solid var(--gold-500);background:var(--gold-100);color:#7a6110;font-size:0.85rem;">
        This batch has ${b.matched_count} matched row${b.matched_count === 1 ? '' : 's'} that can't be recovered from Import History — only the original upload session had that detail, and there's no backend route yet to fetch it afterward. Discard this batch (below) and re-run the Import Statement wizard on the original file to confirm it properly.
      </div>`;
    } else {
      html += `<button class="fin-btn-teal" onclick="_tpHistOpenConfirmModal()">Confirm Batch</button>`;
    }
  } else if (isEmptyConfirm(b)) {
    html += `<div style="width:100%;padding:10px 14px;border-radius:6px;border-left:3px solid var(--gold-500);background:var(--gold-100);color:#7a6110;font-size:0.85rem;margin-bottom:10px;">
      This batch confirmed with 0 matched rows and no charges — nothing was actually posted to the ledger. Reset it to Pending Review to confirm it properly.
    </div>
    <button class="fin-btn-teal" onclick="_tpHistOpenResetToPendingModal(${b.id})">Reset to Pending</button>`;
  } else {
    html += `<div style="width:100%;color:var(--grey-600,#666);font-size:0.9rem;">This batch has been ${_finEsc((b.status||'').replace(/_/g,' '))}.</div>`;
  }
  // DELETE /tendepay/import/{batch_id} is real now: 204 for pending_review
  // (and cancelled, unreachable today) batches, 409 for confirmed ones
  // ("its journal entries and voucher settlements are already posted" —
  // unwinding those belongs to the JE reversal flow, not DELETE). Hide the
  // button on confirmed batches so the 409 is a backstop, not the primary UX.
  if (b.status !== 'confirmed') {
    html += `<button class="fin-btn-cancel" onclick="_tpHistOpenDeleteModal(${b.id})">Delete</button>`;
  }
  html += `<div id="tp-hist-action-msg" style="width:100%;"></div>`;
  return html;
}

function _tpHistShowActionMsg(text) {
  const el = document.getElementById('tp-hist-action-msg');
  const html = `<div style="margin-top:10px;width:100%;padding:10px 14px;border-radius:6px;border-left:3px solid var(--coral-500);background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;">${_finEsc(text)}</div>`;
  if (el) el.innerHTML = html; else showToast(text, 'error');
}

function _tpHistOpenDeleteModal(batchId) {
  const wrap = document.createElement('div');
  wrap.id = 'tp-hist-delete-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:420px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:#2c3e50;">Discard Batch</h3>
      <p style="font-size:0.88rem;color:var(--grey-700,#444);line-height:1.5;">Discard this batch? Its parsed preview rows will be permanently removed. This cannot be undone.</p>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('tp-hist-delete-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" onclick="_tpHistDeleteBatch(${batchId})">Discard</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _tpHistDeleteBatch(batchId) {
  const res = await apiFetch(`${_TP_BASE}/import/${batchId}`, { method: 'DELETE' });
  document.getElementById('tp-hist-delete-modal-overlay')?.remove();
  if (res && res.status === 204) {
    showToast('Batch discarded.', 'success');
    window._splitRemoveItem?.(batchId);
  } else if (res && res.status === 409) {
    _tpHistShowActionMsg(await parseApiError(res));
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

function _tpHistOpenResetToPendingModal(batchId) {
  const wrap = document.createElement('div');
  wrap.id = 'tp-hist-reset-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:420px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:#2c3e50;">Reset to Pending</h3>
      <p style="font-size:0.88rem;color:var(--grey-700,#444);line-height:1.5;">This batch confirmed with 0 matched rows and no charges — nothing was posted. Reset it back to Pending Review so it can be confirmed properly?</p>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('tp-hist-reset-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" onclick="_tpHistResetToPending(${batchId})">Reset</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

// Backend refuses (400/409-shaped body with detail.code) unless the batch has
// zero GL footprint — dispatch on the code rather than showing raw English,
// per the addendum's error contract for this endpoint.
async function _tpHistResetToPending(batchId) {
  const res = await apiFetch(`${_TP_BASE}/import/${batchId}/reset-to-pending`, { method: 'POST' });
  document.getElementById('tp-hist-reset-modal-overlay')?.remove();
  if (res && res.ok) {
    showToast('Batch reset to pending review.', 'success');
    await _tpHistReload();
    return;
  }
  let body = null;
  if (res) { try { body = await res.json(); } catch (_) {} }
  const code = body?.detail?.code;
  if (code === 'BATCH_NOT_FOUND') {
    showToast('Batch not found.', 'error');
  } else if (code === 'BATCH_NOT_CONFIRMED') {
    // Should be unreachable: the CTA only renders for status==='confirmed'.
    console.error('Reset to pending: backend says batch is not confirmed.', body);
    showToast('This batch is not in a resettable state.', 'error');
  } else if (code === 'BATCH_HAS_JOURNAL_TRAIL') {
    _tpHistShowActionMsg('This batch has posted activity; reverse it through journal-entry reversal instead.');
  } else if (res) {
    showToast('Error: ' + (typeof body?.detail === 'string' ? body.detail : `HTTP ${res.status}`), 'error');
  } else {
    showToast('Network error.', 'error');
  }
}

async function _tpHistOpenConfirmModal() {
  const batch = window._tpHistCurrentBatch;
  if (!batch) { showToast('Could not find that batch.', 'error'); return; }

  const wrap = document.createElement('div');
  wrap.id = 'tp-hist-confirm-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:440px;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Confirm Batch — ${_finEsc(batch.filename || `#${batch.id}`)}</h3>
      <p style="font-size:0.85rem;color:#666;margin:0 0 14px;">This batch has 0 matched rows${(batch.unmatched_count ?? 0) > 0 ? ` and ${batch.unmatched_count} unmatched` : ''}. Confirming just settles the unmatched-rows handling below — there's nothing else to post.</p>
      <div class="fin-form-group">
        <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
        <select id="tp-hist-confirm-ledger" class="fin-form-select"><option value="">Please Select</option>${_pvLedgerOptions(null)}</select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Cost Center <span class="fin-required">*</span></label>
        <select id="tp-hist-confirm-cc" class="fin-form-select"><option value="">Please Select</option>${_pvCostCenterOptions(null)}</select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Unmatched rows</label>
        <div style="display:flex;gap:20px;margin-top:6px;">
          <label><input type="radio" name="tp-hist-unmatched-action" value="suspense" checked> Send to Suspense</label>
          <label><input type="radio" name="tp-hist-unmatched-action" value="skip"> Skip</label>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('tp-hist-confirm-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" id="tp-hist-confirm-btn">Confirm Import</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('tp-hist-confirm-btn').onclick = () => _tpHistConfirmBatch(batch, wrap);
}

async function _tpHistConfirmBatch(batch, modalWrap) {
  const ledgerId = parseInt(document.getElementById('tp-hist-confirm-ledger').value, 10);
  const costCenterId = parseInt(document.getElementById('tp-hist-confirm-cc').value, 10);
  const unmatchedAction = (document.querySelector('input[name="tp-hist-unmatched-action"]:checked') || {}).value || 'suspense';
  if (!ledgerId || !costCenterId) { showToast('Ledger and Cost Center are required.', 'error'); return; }

  const btn = document.getElementById('tp-hist-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Confirming…'; }

  // There is no backend endpoint that returns a pending batch's row-level
  // matches (GET /tendepay/import/{batch_id} is metadata-only), so this
  // Resume-from-History flow can never reconstruct real matched rows — it
  // used to fake it by querying the Tendepay Transaction History report and
  // filtering by import_batch_id, but that report only carries already-
  // posted transactions, so the lookup silently came back empty for any
  // batch still in pending_review and POSTed a fabricated 0-match confirm.
  // _tpHistDetailActions now only renders this "Confirm Batch" button at
  // all when batch.matched_count is already 0 (see there), so by the time
  // we're here there is genuinely nothing to reconstruct — confirmedMatches
  // is correctly empty by construction, not by a failed guess. Any batch
  // with real matched rows must be re-uploaded through the Import
  // Statement wizard instead, where the matches live in memory.
  const confirmedMatches = [];

  const res = await apiFetch(`${_TP_BASE}/import/${batch.id}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed_matches: confirmedMatches, unmatched_action: unmatchedAction, ledger_id: ledgerId, cost_center_id: costCenterId }),
  });

  if (res && res.ok) {
    const data = await res.json();
    // Discriminated union on `mode` (§8.3) — see the matching comment on
    // _tpConfirmImport above.
    let msg;
    if (data.mode === 'payroll' || data.mode === 'consultant') {
      const runNoun = data.mode === 'payroll' ? 'payroll run' : 'consultant run';
      msg = `Batch confirmed. ${data.paid_line_count ?? confirmedMatches.length} line(s) paid`;
      if (data.voucher_journal_entry_id) msg += `, voucher JE #${data.voucher_journal_entry_id} posted`;
      msg += data.run_completed ? `. The ${runNoun} is now fully paid.` : `. The ${runNoun} still has unpaid lines.`;
    } else {
      const jvNumbers = (data.posted_journal_entries || []).map(j => (typeof j === 'object' ? (j.jv_number || j.id) : j)).join(', ');
      msg = `Batch confirmed. ${confirmedMatches.length} vouchers paid, ${(data.posted_journal_entries || []).length} journal entries posted.${jvNumbers ? ' (' + jvNumbers + ')' : ''}`;
    }
    if (data.charges_journal_entry_id) msg += ` Transaction Charges JE #${data.charges_journal_entry_id}.`;
    showToast(msg, 'success');
    modalWrap.remove();
    await _tpHistReload();
  } else if (res && res.status === 409) {
    showToast('This batch has already been confirmed.', 'error');
    modalWrap.remove();
    await _tpHistReload();
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Import'; }
  }
}

// ── Suspense ─────────────────────────────────────────────────────────────────
async function loadTendepaySuspenseView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    title: 'Suspense',
    breadcrumb: [{label:'Dashboard',view:null},{label:'Finance',view:null},{label:'Tendepay Suspense'}],
    apiUrl: `${_TP_BASE}/suspense`,
    searchFields: ['tendepay_reference', 'payee_name', 'wallet_name'],
    col1Label: 'Reference', col2Label: 'Amount',
    col1: t => t.tendepay_reference || `#${t.id}`,
    col2: t => _tpMoney(t.amount),
    rowLabel: t => t.tendepay_reference || `#${t.id}`,
    rowSub: t => t.wallet_name || '',
    idKey: 'id',
    detailFields: [
      {label:'Reference', key:'tendepay_reference', fmt:v=>v||'—'},
      {label:'Wallet',    key:'wallet_name', fmt:v=>v||'—'},
      {label:'Payee',     key:'payee_name', fmt:v=>v||'—'},
      {label:'Amount',    key:'amount', fmt:v=>_tpMoney(v)},
      {label:'Date',      key:'transaction_date', fmt:v=>_tpDate(v)},
      {label:'Narration', key:'narration', fmt:v=>v||'—'},
    ],
    detailActions: t => `<button class="btn" onclick="_tpOpenResolveModal(${t.id})">Resolve</button>`,
  });
}

async function _tpOpenResolveModal(tendepayTransactionId) {
  const voucherMap = await _tpFetchVoucherMap();
  const options = Object.entries(voucherMap).map(([id, label]) => `<option value="${id}">${_finEsc(label)}</option>`).join('');
  const wrap = document.createElement('div');
  wrap.id = 'tp-resolve-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:420px;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Resolve Suspense Transaction</h3>
      <label class="fin-form-label">Payment Voucher <span class="fin-required">*</span></label>
      <select id="tp-resolve-voucher" class="fin-form-select"><option value="">Please Select</option>${options}</select>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('tp-resolve-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" id="tp-resolve-confirm-btn">Resolve</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('tp-resolve-confirm-btn').onclick = async () => {
    const voucherId = parseInt(document.getElementById('tp-resolve-voucher').value, 10);
    if (!voucherId) { showToast('Please select a payment voucher.', 'error'); return; }
    const res = await apiFetch(`${_TP_BASE}/suspense/${tendepayTransactionId}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voucher_id: voucherId }) });
    if (res && res.ok) {
      const data = await res.json();
      wrap.remove();
      showToast(`Resolved. Correcting entry ${data.jv_number || data.journal_entry_id || ''} posted.`, 'success');
      await window._splitRefreshSelected?.();
    } else if (res) {
      showToast('Error: ' + await parseApiError(res), 'error');
    }
  };
}

// ── Fund Loads (wallet top-ups / transfers) ─────────────────────────────────
// POST {_TP_FL_API} (bare) is retired and now returns 405 — replaced by two
// intent-specific endpoints. See BE/FE contract addendum 2026-07-17 §5.
const _TP_FL_API          = `${_TP_BASE}/fund-loads/`;
const _TP_FL_TOPUPS_API   = `${_TP_FL_API}top-ups`;
const _TP_FL_TRANSFERS_API = `${_TP_FL_API}transfers`;

const _TP_FL_TYPE_LABEL = { bank_topup: 'Top-up', wallet_transfer: 'Transfer' };
function _tpFlTypeBadge(movementType) {
  const isTopup = movementType === 'bank_topup';
  const bg = isTopup ? 'var(--navy-700,#1B3057)' : 'var(--gold-500,#C9A227)';
  const label = _TP_FL_TYPE_LABEL[movementType] || movementType || '—';
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#fff;background:${bg};">${_finEsc(label)}</span>`;
}

// Fund Loads' banks-with-gl-account lookup is specific to this screen (the
// existing shared _pvAccounts is chart-of-accounts GL rows, not the separate
// /bank-accounts/ resource that carries gl_account_id) — loaded lazily once.
let _tpFlBankAccounts = null;
async function _tpFlLoadBankAccounts(force = false) {
  if (_tpFlBankAccounts && !force) return _tpFlBankAccounts;
  const res = await apiFetch(`${API_BASE}/bank-accounts/?is_active=true`);
  _tpFlBankAccounts = (res && res.ok) ? _toArray(await res.json()) : [];
  return _tpFlBankAccounts;
}
function _tpFlBankAccountName(id) {
  const b = (_tpFlBankAccounts || []).find(b => String(b.id) === String(id));
  return b ? `${b.bank_name} — ${b.account_name}` : '—';
}

async function loadTendepayFundLoadsView(container) {
  await _pvLoadLookups();
  await _tpFlLoadBankAccounts();
  const movementType = window._tpFlListFilter || '';
  const filterBar = `
    <div class="fin-filter-section" style="margin-bottom:12px;">
      <div class="fin-filter-grid">
        <div class="fin-filter-field" style="display:flex;gap:6px;">
          ${['', 'bank_topup', 'wallet_transfer'].map(v => `
            <button type="button" class="${movementType===v?'fin-btn-teal':'fin-btn-outline'}"
              onclick="window._tpFlListFilter='${v}'; loadView('tendepay-fund-loads');">
              ${v === '' ? 'All' : (v === 'bank_topup' ? 'Top-ups' : 'Transfers')}
            </button>`).join('')}
        </div>
      </div>
    </div>`;
  container.innerHTML = filterBar + '<div id="tp-fl-split"></div>';
  const splitContainer = document.getElementById('tp-fl-split');
  const apiUrl = _TP_FL_API + (movementType ? `?movement_type=${movementType}` : '');
  await renderSplitView({
    container: splitContainer,
    title: 'Fund Loads',
    breadcrumb: [{label:'Dashboard',view:null},{label:'Finance',view:null},{label:'Tendepay Fund Loads'}],
    apiUrl,
    searchFields: ['reference'],
    col1Label: 'Reference', col2Label: 'Amount',
    col1: f => f.reference || `#${f.id}`,
    col2: f => _tpMoney(f.amount),
    rowLabel: f => f.reference || `#${f.id}`,
    rowSub: f => `${_TP_FL_TYPE_LABEL[f.movement_type] || ''} · ${_tpDate(f.fund_date)}`,
    idKey: 'id',
    detailFields: [
      {label:'Type',             key:'movement_type', fmt:v=>_tpFlTypeBadge(v)},
      {label:'Reference',        key:'reference', fmt:v=>v||'—'},
      {label:'Destination Wallet', key:'wallet_account_id', fmt:v=>_pvAccountName(v)},
      {label:'Source Bank Acct', key:'source_bank_account_id', fmt:v=>v?_tpFlBankAccountName(v):'—'},
      {label:'Source Wallet',    key:'source_wallet_account_id', fmt:v=>v?_pvAccountName(v):'—'},
      {label:'Amount',           key:'amount', fmt:v=>_tpMoney(v)},
      {label:'Charge',           key:'charge', fmt:v=>_tpMoney(v)},
      {label:'Fund Date',        key:'fund_date', fmt:v=>_tpDate(v)},
      {label:'Ledger',           key:'ledger_id', fmt:v=>_pvLedgerName(v)},
      {label:'Cost Center',      key:'cost_center_id', fmt:v=>_pvCostCenterName(v)},
      {label:'Notes',            key:'notes', fmt:v=>v||'—'},
      {label:'Batch',            key:'fund_load_batch_id', fmt:v=>v?`Bulk upload batch #${v}`:'—'},
    ],
    renderAdd: _tpFundLoadAddForm,
  });
}

// client_reference is the idempotency key for a retried submit — must be
// generated once when the Add form opens, never regenerated per-submit,
// otherwise a retry after a network timeout mints a fresh key and creates
// the duplicate this key exists to prevent.
let _tpFlClientRef = null;
let _tpFlMode = 'topup';

function _tpFundLoadAddForm(rightEl) {
  _tpFlClientRef = crypto.randomUUID();
  _tpFlMode = 'topup';
  _tpFlRenderAddForm(rightEl);
}

function _tpFlRenderAddForm(rightEl) {
  const mainWallets = _pvAccounts.filter(a => a.wallet_role === 'main');
  const miniWallets = _pvAccounts.filter(a => a.wallet_role === 'mini');
  const banksWithGl = (_tpFlBankAccounts || []).filter(b => b.gl_account_id);
  const today = new Date().toISOString().split('T')[0];
  const isTopup = _tpFlMode === 'topup';

  rightEl.innerHTML = `
    <div class="fin-form-wrap">
      <h3 class="fin-title" style="font-size:1.1rem;">Add Fund Load</h3>
      <div class="fin-form-group" style="display:flex;gap:8px;">
        <button type="button" class="${isTopup?'fin-btn-teal':'fin-btn-outline'}" onclick="_tpFlSwitchMode('topup')">Top-up Main wallet</button>
        <button type="button" class="${!isTopup?'fin-btn-teal':'fin-btn-outline'}" onclick="_tpFlSwitchMode('transfer')">Transfer to Mini wallet</button>
      </div>
      ${isTopup ? `
        ${!banksWithGl.length ? `
          <div style="background:var(--gold-100,#FAF2D3);border-left:3px solid var(--gold-500,#C9A227);padding:10px 14px;border-radius:6px;margin:10px 0;font-size:0.85rem;color:#6b5400;">
            No bank account has a linked GL account. Set <code>gl_account_id</code> on a bank account first.
          </div>` : ''}
        <div class="fin-form-group">
          <label class="fin-form-label">Source Bank <span class="fin-required">*</span></label>
          <select id="tp-fl-source-bank" class="fin-form-select">
            <option value="">Please Select</option>
            ${banksWithGl.map(b => `<option value="${b.id}">${_finEsc(b.bank_name)} — ${_finEsc(b.account_name)}</option>`).join('')}
          </select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Destination Wallet <span class="fin-required">*</span></label>
          <select id="tp-fl-dest-wallet" class="fin-form-select" ${mainWallets.length===1?'disabled':''}>
            <option value="">Please Select</option>
            ${mainWallets.map(w => `<option value="${w.id}" ${mainWallets.length===1?'selected':''}>${_finEsc(w.account_name)}</option>`).join('')}
          </select>
        </div>
      ` : `
        <div class="fin-form-group">
          <label class="fin-form-label">Source Wallet <span class="fin-required">*</span></label>
          <select id="tp-fl-source-wallet" class="fin-form-select" ${mainWallets.length===1?'disabled':''}>
            <option value="">Please Select</option>
            ${mainWallets.map(w => `<option value="${w.id}" ${mainWallets.length===1?'selected':''}>${_finEsc(w.account_name)}</option>`).join('')}
          </select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Destination Wallet <span class="fin-required">*</span></label>
          <select id="tp-fl-dest-wallet-mini" class="fin-form-select">
            <option value="">Please Select</option>
            ${miniWallets.map(w => `<option value="${w.id}">${_finEsc(w.account_name)}</option>`).join('')}
          </select>
        </div>
      `}
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Amount (KES) <span class="fin-required">*</span></label>
          <input type="number" id="tp-fl-amount" class="fin-form-input" step="0.01" min="0.01">
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Fund Date <span class="fin-required">*</span></label>
          <input type="date" id="tp-fl-date" class="fin-form-input" value="${today}">
        </div>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reference <span class="fin-required">*</span></label>
        <input type="text" id="tp-fl-reference" class="fin-form-input">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="tp-fl-notes" class="fin-form-textarea" rows="3"></textarea>
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="${isTopup?'_tpFundLoadSubmitTopup()':'_tpFundLoadSubmitTransfer()'}">Submit</button>
      </div>
    </div>`;
}

function _tpFlSwitchMode(mode) {
  _tpFlMode = mode;
  const rightEl = document.getElementById('split-right-panel');
  if (rightEl) _tpFlRenderAddForm(rightEl);
}

// Dispatch on the addendum's config-vs-workflow distinction: a missing
// gl_account_id / wallet_role mismatch is a setup problem (gold callout),
// everything else (amount validation, 409 conflicts) is workflow guidance
// surfaced verbatim (coral toast).
async function _tpFundLoadHandleError(res) {
  const msg = await parseApiError(res);
  const isConfigIssue = /gl_account_id|no linked gl account|has no linked gl account/i.test(msg);
  if (isConfigIssue) {
    showToast(msg, 'warning');
  } else {
    showToast('Error: ' + msg, 'error');
  }
}

async function _tpFundLoadSubmitTopup() {
  const sourceBankId = parseInt(document.getElementById('tp-fl-source-bank').value, 10);
  const destWalletId = parseInt(document.getElementById('tp-fl-dest-wallet').value, 10);
  const amount = parseFloat(document.getElementById('tp-fl-amount').value);
  const fundDate = document.getElementById('tp-fl-date').value;
  const reference = document.getElementById('tp-fl-reference').value.trim();
  const notes = document.getElementById('tp-fl-notes').value.trim() || null;
  if (!sourceBankId || !destWalletId || !(amount > 0) || !fundDate || !reference) {
    showToast('Source Bank, Destination Wallet, Amount, Fund Date and Reference are required.', 'error'); return;
  }
  const res = await apiFetch(_TP_FL_TOPUPS_API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_account_id: destWalletId, source_bank_account_id: sourceBankId,
      amount, fund_date: fundDate, reference, notes, client_reference: _tpFlClientRef,
    }),
  });
  if (res && res.ok) { showToast('Fund load recorded. Journal entry posted.', 'success'); await window._splitReload?.(); }
  else if (res) await _tpFundLoadHandleError(res);
}

async function _tpFundLoadSubmitTransfer() {
  const sourceWalletId = parseInt(document.getElementById('tp-fl-source-wallet').value, 10);
  const destWalletId = parseInt(document.getElementById('tp-fl-dest-wallet-mini').value, 10);
  const amount = parseFloat(document.getElementById('tp-fl-amount').value);
  const fundDate = document.getElementById('tp-fl-date').value;
  const reference = document.getElementById('tp-fl-reference').value.trim();
  const notes = document.getElementById('tp-fl-notes').value.trim() || null;
  if (!sourceWalletId || !destWalletId || !(amount > 0) || !fundDate || !reference) {
    showToast('Source Wallet, Destination Wallet, Amount, Fund Date and Reference are required.', 'error'); return;
  }
  if (sourceWalletId === destWalletId) {
    showToast('Source and destination wallets must differ.', 'error'); return;
  }
  const res = await apiFetch(_TP_FL_TRANSFERS_API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_wallet_account_id: sourceWalletId, destination_wallet_account_id: destWalletId,
      amount, fund_date: fundDate, reference, notes, client_reference: _tpFlClientRef,
    }),
  });
  if (res && res.ok) { showToast('Fund load recorded. Journal entry posted.', 'success'); await window._splitReload?.(); }
  else if (res) await _tpFundLoadHandleError(res);
}

// ── Fund Loads Bulk Upload wizard (3 steps: upload → review → commit) ──────
// Mirrors the Import Statement wizard's chrome (step badges, .fin-table,
// grey <details> sections, coral banners) but not its query mechanics: this
// contract is stateless across dry_run — there's no batch_id from the
// preview to resume from, so Commit re-submits the same File object the
// operator picked in Step 1 with dry_run=false. Field names for the preview
// response (postable/already_imported/resolution_errors/skipped_rows/totals)
// come from the BE/FE contract addendum (2026-07-17 §5.2); row-level fields
// reuse the live FundLoad resource's own field names (reference,
// movement_type, amount, charge, fund_date, wallet_account_id,
// source_bank_account_id, source_wallet_account_id) already confirmed
// elsewhere in this file — verify against a real dry-run response the first
// time this runs against staging, since neither shape is typed in
// openapi.json (both routes return a bare `schema: {}`).
let _tpFlWiz = null;
function _tpFlNewWizState() {
  return { step: 1, file: null, filename: null, notes: null,
    postable: [], alreadyImported: [], resolutionErrors: [], skippedRows: [] };
}

async function loadTendepayFundLoadsUploadView(container) {
  await _pvLoadLookups();
  await _tpFlLoadBankAccounts();
  _tpFlWiz = _tpFlNewWizState();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Fund Loads Bulk Upload</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Tendepay &rsaquo; Fund Loads Bulk Upload</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <span class="fin-wizard-step-badge" id="tp-fl-wiz-badge-1">1. Upload</span>
        <span class="fin-wizard-step-badge" id="tp-fl-wiz-badge-2">2. Review</span>
        <span class="fin-wizard-step-badge" id="tp-fl-wiz-badge-3">3. Commit</span>
      </div>
      <div id="tp-fl-wiz-body"></div>
    </div>`;
  _tpFlRenderWizStep();
}

function _tpFlRenderWizStepBadges() {
  [1, 2, 3].forEach(n => {
    const el = document.getElementById(`tp-fl-wiz-badge-${n}`);
    if (!el) return;
    el.style.cssText = n === _tpFlWiz.step
      ? 'padding:6px 14px;border-radius:14px;background:var(--navy-700,#1B3057);color:#fff;font-weight:600;font-size:0.85rem;'
      : 'padding:6px 14px;border-radius:14px;background:#eee;color:#888;font-size:0.85rem;';
  });
}

function _tpFlRenderWizStep() {
  _tpFlRenderWizStepBadges();
  if (_tpFlWiz.step === 1) _tpFlRenderStep1();
  else if (_tpFlWiz.step === 2) _tpFlRenderStep2();
  else _tpFlRenderStep3();
}

async function _tpFlRenderStep1() {
  const body = document.getElementById('tp-fl-wiz-body');
  body.innerHTML = '<p class="sa-loading">Loading column contract&#8230;</p>';
  let cols = { columns: [], notes: '' };
  try {
    const res = await apiFetch(`${_TP_BASE}/fund-loads/upload/expected-columns`);
    if (res && res.ok) cols = await res.json();
  } catch (_) {}
  // Defensive: fall back to a required/optional split if the response uses
  // that shape instead of a flat `columns` list (see file-header comment).
  const colList = cols.columns || [...(cols.required_columns || []), ...(cols.optional_columns || [])];
  const colRows = colList.map(c => `
    <tr><td>${_finEsc(c.header || '')}</td><td>${_finEsc(c.description || '')}</td><td>${_finEsc(c.example ?? '')}</td></tr>`).join('');
  const notesHtml = cols.notes ? `
    <div style="background:#eef3fb;border-radius:8px;padding:12px 16px;margin:12px 0;font-size:0.85rem;color:#2c3e50;white-space:pre-wrap;">${_finEsc(cols.notes)}</div>` : '';
  body.innerHTML = `
    <div class="fin-form-wrap">
      <div class="fin-section-label">Expected File Format</div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Column</th><th>Description</th><th>Example</th></tr></thead>
        <tbody>${colRows || '<tr><td colspan="3" class="fin-empty">Could not load the column contract.</td></tr>'}</tbody>
      </table></div>
      ${notesHtml}
      <div class="fin-form-group" style="margin-top:16px;">
        <label class="fin-form-label">Notes</label>
        <textarea id="tp-fl-wiz-notes" class="fin-form-textarea" rows="2" placeholder="Optional note to attach to this batch"></textarea>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;align-items:center;">
        <button class="fin-btn-outline" onclick="_tpFlDownloadTemplate()">Download Template</button>
        <input type="file" id="tp-fl-wiz-file" accept=".csv,.xlsx,.xls" style="display:none;" onchange="_tpFlUploadFile(this)">
        <button class="fin-btn-teal" onclick="document.getElementById('tp-fl-wiz-file').click()">Choose File &amp; Preview</button>
        <span id="tp-fl-wiz-upload-status" style="color:#888;font-size:0.85rem;"></span>
      </div>
    </div>`;
}

async function _tpFlDownloadTemplate() {
  await authBlobDownload(`${_TP_BASE}/fund-loads/upload/template`, 'fund_loads_upload_template.xlsx', {
    errorPrefix: 'Could not download template: ',
  });
}

async function _tpFlUploadFile(input) {
  const file = input.files[0];
  if (!file) return;
  const notes = document.getElementById('tp-fl-wiz-notes')?.value.trim() || null;
  const statusEl = document.getElementById('tp-fl-wiz-upload-status');
  if (statusEl) statusEl.textContent = 'Uploading…';
  const fd = new FormData();
  fd.append('file', file);
  if (notes) fd.append('notes', notes);
  // dry_run=true — parse + validate + resolve only, zero side effects.
  const res = await apiFetch(`${_TP_BASE}/fund-loads/upload?dry_run=true`, { method: 'POST', body: fd });
  if (!res || !res.ok) {
    if (statusEl) statusEl.textContent = '';
    showToast('Preview failed: ' + (res ? await parseApiError(res) : 'network error'), 'error');
    return;
  }
  const data = await res.json();
  _tpFlWiz.file = file;
  _tpFlWiz.filename = file.name;
  _tpFlWiz.notes = notes;
  _tpFlWiz.postable = data.postable || [];
  _tpFlWiz.alreadyImported = data.already_imported || [];
  _tpFlWiz.resolutionErrors = data.resolution_errors || [];
  _tpFlWiz.skippedRows = data.skipped_rows || [];
  _tpFlWiz.step = 2;
  _tpFlRenderWizStep();
}

function _tpFlComputeTotals(postable) {
  const t = { count: postable.length, amount: 0, charges: 0, topupCount: 0, transferCount: 0 };
  postable.forEach(r => {
    t.amount += parseFloat(r.amount) || 0;
    t.charges += parseFloat(r.charge) || 0;
    if (r.movement_type === 'bank_topup') t.topupCount++;
    else if (r.movement_type === 'wallet_transfer') t.transferCount++;
  });
  return t;
}

// Distinguishes a setup problem (no wallet_role='charges' account configured,
// which blocks any charge>0 row) from an ordinary data/workflow error — the
// former gets a gold "ask the sysadmin" callout per the addendum's
// config-vs-workflow error classification, the latter stays coral.
function _tpFlIsConfigError(e) {
  const text = `${e.code || ''} ${e.reason || e.msg || ''}`;
  return /charges/i.test(text) && /wallet_role|no.*(charges|linked).*account|account.*not.*configured/i.test(text);
}

function _tpFlRenderStep2() {
  const body = document.getElementById('tp-fl-wiz-body');
  const totals = _tpFlComputeTotals(_tpFlWiz.postable);

  const rows = _tpFlWiz.postable.map((r, i) => {
    const rowNum = r.row ?? r.row_number ?? (i + 1);
    const charge = parseFloat(r.charge) || 0;
    const chargeCell = charge > 0
      ? `${_tpMoney(charge)} <span title="Posts a 3-leg journal entry (wallet, charges account, destination)" style="display:inline-block;margin-left:4px;padding:1px 7px;border-radius:9px;font-size:0.68rem;font-weight:600;color:#6b5400;background:var(--gold-100,#FAF2D3);">3-leg JE</span>`
      : _tpMoney(charge);
    const destination = _pvAccountName(r.wallet_account_id ?? r.destination_wallet_account_id);
    const source = r.movement_type === 'bank_topup'
      ? _tpFlBankAccountName(r.source_bank_account_id)
      : _pvAccountName(r.source_wallet_account_id);
    return `<tr>
      <td>${_finEsc(String(rowNum))}</td>
      <td>${_finEsc(r.reference || '')}</td>
      <td>${_tpFlTypeBadge(r.movement_type)}</td>
      <td>${_tpMoney(r.amount)}</td>
      <td>${chargeCell}</td>
      <td>${_tpDate(r.fund_date)}</td>
      <td>${_finEsc(destination)}</td>
      <td>${_finEsc(source)}</td>
    </tr>`;
  }).join('');

  const skippedHtml = _tpFlWiz.skippedRows.length ? `
    <details style="margin-top:14px;">
      <summary style="cursor:pointer;font-weight:600;color:#2c3e50;">Skipped rows (${_tpFlWiz.skippedRows.length})</summary>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Row</th><th>Reference</th><th>Reason</th></tr></thead>
        <tbody>${_tpFlWiz.skippedRows.map(r => `<tr><td>${_finEsc(r.row ?? r.row_number ?? '')}</td><td>${_finEsc(r.reference || '')}</td><td>${_finEsc(r.reason || '')}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>` : '';

  const alreadyHtml = _tpFlWiz.alreadyImported.length ? `
    <details style="margin-top:14px;">
      <summary style="cursor:pointer;font-weight:600;color:#2c3e50;">Already imported (${_tpFlWiz.alreadyImported.length})</summary>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Reference</th><th>Existing Fund Load</th></tr></thead>
        <tbody>${_tpFlWiz.alreadyImported.map(r => {
          const id = r.existing_fund_load_id ?? r.fund_load_id ?? r.id;
          return `<tr><td>${_finEsc(r.reference || r.client_reference || '')}</td><td>${id != null ? `<a href="#" onclick="_tpFlOpenExistingFundLoad(${id});return false;">#${id}</a>` : '—'}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </details>` : '';

  const configErrors = _tpFlWiz.resolutionErrors.filter(_tpFlIsConfigError);
  const dataErrors = _tpFlWiz.resolutionErrors.filter(e => !_tpFlIsConfigError(e));
  const configHtml = configErrors.length ? `
    <div style="background:var(--gold-100,#FAF2D3);border-left:3px solid var(--gold-500,#C9A227);padding:12px 16px;border-radius:8px;margin-top:14px;font-size:0.85rem;color:#6b5400;">
      ${[...new Set(configErrors.map(e => e.reason || e.msg || String(e)))].map(m => `<div>${_finEsc(m)}</div>`).join('')}
    </div>` : '';
  const dataErrorsHtml = dataErrors.length ? `
    <div style="background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:12px 16px;border-radius:8px;margin-top:14px;font-size:0.85rem;">
      <strong>Rows that can't be posted:</strong>
      <ul style="margin:8px 0 0 18px;">
        ${dataErrors.map(e => `<li>${e.row != null || e.row_number != null ? `<strong>Row ${_finEsc(String(e.row ?? e.row_number))}${e.reference ? ' (' + _finEsc(e.reference) + ')' : ''}:</strong> ` : ''}${_finEsc(e.reason || e.msg || JSON.stringify(e))}</li>`).join('')}
      </ul>
    </div>` : '';

  const commitBlocked = _tpFlWiz.resolutionErrors.length > 0;

  body.innerHTML = `
    <div class="fin-form-wrap">
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          ${totals.count} postable &middot; Total ${_tpMoney(totals.amount)} &middot; Charges ${_tpMoney(totals.charges)}
          <span style="margin-left:12px;display:inline-block;padding:2px 10px;border-radius:10px;font-size:0.78rem;font-weight:600;color:#fff;background:var(--navy-700,#1B3057);">${totals.topupCount} Top-up${totals.topupCount===1?'':'s'}</span>
          <span style="margin-left:6px;display:inline-block;padding:2px 10px;border-radius:10px;font-size:0.78rem;font-weight:600;color:#fff;background:var(--gold-500,#C9A227);">${totals.transferCount} Transfer${totals.transferCount===1?'':'s'}</span>
        </div>
      </div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Row</th><th>Ref</th><th>Type</th><th>Amount</th><th>Charge</th><th>Fund Date</th><th>Destination</th><th>Source</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8" class="fin-empty">No postable rows in this file.</td></tr>'}</tbody>
      </table></div>
      ${configHtml}
      ${dataErrorsHtml}
      ${skippedHtml}
      ${alreadyHtml}
      <div class="fin-form-actions">
        <button class="fin-btn-cancel" onclick="_tpFlWiz.step=1;_tpFlRenderWizStep();">Back</button>
        <button class="fin-btn-teal" ${commitBlocked ? 'disabled title="Resolve the errors above before committing."' : ''} onclick="_tpFlWiz.step=3;_tpFlRenderWizStep();">Continue</button>
      </div>
    </div>`;
}

function _tpFlOpenExistingFundLoad(id) {
  loadView('tendepay-fund-loads').then(() => window._splitSelectItem && window._splitSelectItem(id));
}

function _tpFlRenderStep3() {
  const body = document.getElementById('tp-fl-wiz-body');
  const totals = _tpFlComputeTotals(_tpFlWiz.postable);
  body.innerHTML = `
    <div class="fin-form-wrap">
      <p style="font-size:0.9rem;color:#444;">Ready to post ${totals.count} row${totals.count === 1 ? '' : 's'} (${_tpMoney(totals.amount)}, ${_tpMoney(totals.charges)} in charges). This creates one journal entry per row and cannot be undone from here.</p>
      <div class="fin-form-actions">
        <button class="fin-btn-cancel" onclick="_tpFlWiz.step=2;_tpFlRenderWizStep();">Back</button>
        <button class="fin-btn-teal" id="tp-fl-commit-btn" onclick="_tpFlCommit()">Commit</button>
      </div>
      <div id="tp-fl-commit-result" style="margin-top:14px;"></div>
    </div>`;
}

async function _tpFlCommit() {
  const btn = document.getElementById('tp-fl-commit-btn');
  const resultEl = document.getElementById('tp-fl-commit-result');
  if (btn) { btn.disabled = true; btn.textContent = 'Committing…'; }
  const fd = new FormData();
  fd.append('file', _tpFlWiz.file);
  if (_tpFlWiz.notes) fd.append('notes', _tpFlWiz.notes);
  // dry_run=false (default) — posts everything in one transaction, rolls
  // back completely on any error. Re-submitting the same File object from
  // Step 1, not a stored batch_id: this contract has no server-side preview
  // to resume from (see file-header comment).
  const res = await apiFetch(`${_TP_BASE}/fund-loads/upload?dry_run=false`, { method: 'POST', body: fd });

  if (res && res.ok) {
    const data = await res.json();
    const postedCount = data.posted_count ?? (data.posted_fund_load_ids || []).length;
    if (resultEl) {
      resultEl.innerHTML = postedCount > 0
        ? `<div style="background:#dcf3e2;border-left:3px solid #1e7e34;padding:12px 16px;border-radius:8px;color:#1e7e34;font-size:0.85rem;">
            Posted ${postedCount} row${postedCount === 1 ? '' : 's'}${data.posted_amount != null ? ', ' + _tpMoney(data.posted_amount) : ''}${data.posted_charges ? ', ' + _tpMoney(data.posted_charges) + ' in charges' : ''}.${data.batch_id != null ? ` Batch #${data.batch_id}.` : ''}
          </div>`
        // Full-replay idempotent no-op: every row in the file was already imported by an earlier
        // commit, so batch_id is null and nothing new was posted — a success, not an error.
        : `<div style="background:#dcf3e2;border-left:3px solid #1e7e34;padding:12px 16px;border-radius:8px;color:#1e7e34;font-size:0.85rem;">
            Nothing new to post — all ${_tpFlWiz.postable.length} row${_tpFlWiz.postable.length === 1 ? '' : 's'} were already imported.
          </div>`;
    }
    showToast(postedCount > 0 ? 'Fund loads posted.' : 'Nothing new to post — already imported.', 'success');
    if (btn) { btn.textContent = 'Committed'; }
    return;
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Commit'; }
  if (!res) { showToast('Network error.', 'error'); return; }
  const body = await res.json().catch(() => null);
  const detail = body?.detail;

  if (res.status === 400) {
    // Structured validation failure — the whole transaction rolled back,
    // nothing was posted. Mirrors _tpRenderValidationErrors' coral banner,
    // plus the addendum's verbatim `hint` footer.
    const errs = (typeof detail === 'object' && Array.isArray(detail?.errors)) ? detail.errors : [];
    const hint = (typeof detail === 'object' && detail?.hint) || '';
    if (resultEl) resultEl.innerHTML = `
      <div style="background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:12px 16px;border-radius:8px;font-size:0.85rem;">
        <strong>Could not post — nothing has been posted.</strong>
        ${errs.length ? `<ul style="margin:8px 0 0 18px;">${errs.map(e => `<li>${e.row != null ? `Row ${_finEsc(String(e.row))}: ` : ''}${_finEsc(e.reason || e.msg || JSON.stringify(e))}</li>`).join('')}</ul>` : `<div style="margin-top:6px;">${_finEsc(typeof detail === 'string' ? detail : JSON.stringify(detail))}</div>`}
        ${hint ? `<div style="margin-top:8px;font-style:italic;">${_finEsc(hint)}</div>` : ''}
      </div>`;
  } else if (res.status === 409) {
    if (resultEl) resultEl.innerHTML = `<div style="background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:12px 16px;border-radius:8px;font-size:0.85rem;">${_finEsc(typeof detail === 'string' ? detail : (detail?.message || 'Another import for this file is already in progress. Try again in a moment.'))}</div>`;
  } else if (res.status === 413) {
    if (resultEl) resultEl.innerHTML = `<div style="background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:12px 16px;border-radius:8px;font-size:0.85rem;">${_finEsc(typeof detail === 'string' ? detail : (detail?.message || 'File is too large to upload.'))}</div>`;
  } else {
    showToast('Error: ' + (typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : `HTTP ${res.status}`)), 'error');
  }
}

// ── Reconciliation ──────────────────────────────────────────────────────────
// GET /tendepay/reconciliation is confirmed live (openapi.json, 2026-07-18)
// to be a single endpoint with two mutually-exclusive query modes —
// Snapshot (as_of_date) XOR Period (start_date+end_date) — and a response
// shape documented verbatim in the endpoint's own docstring:
//   { as_of_date, start_date, end_date, mode, totals, by_role: {main,mini,suspense}, accounts }
// by_role is the primary render path now; accounts[] (flat list) is kept
// only as a back-compat fallback for a backend that hasn't shipped by_role
// yet. GET /tendepay/reconciliation/transactions (start_date/end_date
// required, wallet_role/account_id optional) is also confirmed live, but its
// response shape is only described in prose, not typed — the per-wallet
// wrapper key and movement field names below are a defensive best guess
// (see the fallback chains in _tpReconWalletCard) pending a live dry run.
function _tpReconWalletRow(a) {
  const charges = parseFloat(a.charges_credited ?? 0);
  const expected = a.expected_balance != null
    ? parseFloat(a.expected_balance)
    : parseFloat(a.fund_loads_total ?? 0) - parseFloat(a.tendepay_posted_total ?? 0) - charges;
  const diff = a.difference != null ? parseFloat(a.difference) : parseFloat(a.gl_balance ?? 0) - expected;
  return { ...a, _expected: expected, _diff: diff, _drift: Math.abs(diff) > 0.005 };
}

async function loadTendepayReconciliationView(container) {
  await _pvLoadLookups();
  window._tpReconTab = 'summary';
  window._tpReconMode = 'snapshot';
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Tendepay Reconciliation</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Tendepay &rsaquo; Reconciliation</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="fin-btn-teal" id="tp-recon-tab-summary" onclick="_tpReconSwitchTab('summary')">Summary</button>
        <button class="fin-btn-outline" id="tp-recon-tab-transactions" onclick="_tpReconSwitchTab('transactions')">Transactions</button>
      </div>
      <div id="tp-recon-body"></div>
    </div>`;
  _tpReconRenderTab();
}

function _tpReconSwitchTab(tab) {
  window._tpReconTab = tab;
  const summaryBtn = document.getElementById('tp-recon-tab-summary');
  const txBtn = document.getElementById('tp-recon-tab-transactions');
  if (summaryBtn) summaryBtn.className = tab === 'summary' ? 'fin-btn-teal' : 'fin-btn-outline';
  if (txBtn) txBtn.className = tab === 'transactions' ? 'fin-btn-teal' : 'fin-btn-outline';
  _tpReconRenderTab();
}

function _tpReconRenderTab() {
  const body = document.getElementById('tp-recon-body');
  if (window._tpReconTab === 'transactions') _tpReconRenderTransactionsFilters(body);
  else _tpReconRenderSummaryFilters(body);
}

// Snapshot XOR Period as a real segmented control — the inactive mode's
// inputs are hidden and never read by _tpReconGenerate, so the server's
// mutual-exclusivity 400 is unreachable from this UI, not just avoided by convention.
function _tpReconRenderSummaryFilters(body) {
  const today = new Date().toISOString().split('T')[0];
  const mode = window._tpReconMode || 'snapshot';
  body.innerHTML = `
    <div class="fin-filter-section">
      <div class="fin-filter-grid" style="align-items:flex-end;">
        <div class="fin-filter-field">
          <label class="fin-filter-label">Mode</label>
          <div style="display:flex;gap:8px;">
            <button type="button" class="${mode === 'snapshot' ? 'fin-btn-teal' : 'fin-btn-outline'}" onclick="_tpReconSetMode('snapshot')">Snapshot</button>
            <button type="button" class="${mode === 'period' ? 'fin-btn-teal' : 'fin-btn-outline'}" onclick="_tpReconSetMode('period')">Period</button>
          </div>
        </div>
        ${mode === 'snapshot' ? `
          <div class="fin-filter-field"><label class="fin-filter-label">As of Date</label><input type="date" id="tp-recon-date" class="fin-filter-input" value="${today}"></div>
        ` : `
          <div class="fin-filter-field"><label class="fin-filter-label">Start Date</label><input type="date" id="tp-recon-start" class="fin-filter-input"></div>
          <div class="fin-filter-field"><label class="fin-filter-label">End Date</label><input type="date" id="tp-recon-end" class="fin-filter-input" value="${today}"></div>
        `}
      </div>
      <div class="fin-filter-actions"><button class="fin-btn-teal" onclick="_tpReconGenerate()">Generate</button></div>
    </div>
    <div id="tp-recon-output"></div>`;
  _tpReconGenerate();
}

function _tpReconSetMode(mode) {
  window._tpReconMode = mode;
  _tpReconRenderSummaryFilters(document.getElementById('tp-recon-body'));
}

async function _tpReconGenerate() {
  const mode = window._tpReconMode || 'snapshot';
  const out = document.getElementById('tp-recon-output');
  if (!out) return;
  out.innerHTML = '<p class="sa-loading">Loading&#8230;</p>';
  const params = new URLSearchParams();
  if (mode === 'period') {
    const start = document.getElementById('tp-recon-start')?.value;
    const end = document.getElementById('tp-recon-end')?.value;
    if (!start || !end) { out.innerHTML = '<p class="fin-error-msg">Start Date and End Date are required in Period mode.</p>'; return; }
    params.set('start_date', start);
    params.set('end_date', end);
  } else {
    const asOf = document.getElementById('tp-recon-date')?.value;
    if (asOf) params.set('as_of_date', asOf);
  }
  const res = await apiFetch(`${_TP_BASE}/reconciliation?${params.toString()}`);
  if (!res || !res.ok) { out.innerHTML = `<p class="fin-error-msg">${res ? await parseApiError(res) : 'Network error.'}</p>`; return; }
  const data = await res.json();
  out.innerHTML = _tpReconRenderSummary(data);
}

function _tpReconSectionHtml(title, accounts) {
  if (!accounts || !accounts.length) return '';
  const rows = accounts.map(_tpReconWalletRow);
  const subtotalGl = rows.reduce((s, a) => s + (parseFloat(a.gl_balance) || 0), 0);
  const subtotalExpected = rows.reduce((s, a) => s + a._expected, 0);
  const hasDrift = rows.some(a => a._drift);
  return `
    <div class="fin-filter-section" style="margin-bottom:16px;${hasDrift ? 'border-left:4px solid var(--coral-500,#D94040);' : ''}">
      <div class="fin-section-label">${_finEsc(title)}${hasDrift ? ' <span style="color:var(--coral-600,#c0392b);font-weight:600;">— drift detected</span>' : ''}</div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Account</th><th>GL Balance</th><th>Tendepay Posted</th><th>Charges Credited</th><th>Expected Balance</th><th>Difference</th></tr></thead>
        <tbody>
          ${rows.map(a => `<tr style="${a._drift ? 'background:var(--coral-100,#fde0de);' : ''}">
            <td>${_finEsc(a.account_name || a.name || '')}</td>
            <td>${_tpMoney(a.gl_balance)}</td>
            <td>${_tpMoney(a.tendepay_posted_total)}</td>
            <td>${_tpMoney(a.charges_credited)}</td>
            <td>${_tpMoney(a._expected)}</td>
            <td style="${a._drift ? 'color:#c0392b;font-weight:700;' : 'color:#1e7e34;font-weight:600;'}">${_tpMoney(a._diff)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr class="fin-tfoot-total"><td><strong>Subtotal</strong></td><td><strong>${_tpMoney(subtotalGl)}</strong></td><td></td><td></td><td><strong>${_tpMoney(subtotalExpected)}</strong></td><td></td></tr></tfoot>
      </table></div>
    </div>`;
}

function _tpReconRenderSummary(data) {
  const byRole = data.by_role || {};
  const hasByRole = ['main', 'mini', 'suspense'].some(r => (byRole[r] || []).length);
  const totals = data.totals || {};
  const totalDiff = parseFloat(totals.difference) || 0;
  const totalsHtml = `
    <div class="fin-controls-row" style="margin-bottom:14px;">
      <div class="fin-controls-left">
        GL Balance ${_tpMoney(totals.gl_balance)} &middot; Fund Loads ${_tpMoney(totals.fund_loads_total)} &middot; Posted ${_tpMoney(totals.tendepay_posted_total)} &middot; Charges ${_tpMoney(totals.charges_credited)} &middot; Expected ${_tpMoney(totals.expected_balance)}
        &middot; Difference <span style="${Math.abs(totalDiff) > 0.005 ? 'color:#c0392b;font-weight:700;' : 'color:#1e7e34;font-weight:600;'}">${_tpMoney(totals.difference)}</span>
      </div>
    </div>`;
  if (hasByRole) {
    const sections = _tpReconSectionHtml('Main', byRole.main) + _tpReconSectionHtml('Mini', byRole.mini) + _tpReconSectionHtml('Suspense', byRole.suspense);
    return totalsHtml + (sections || '<p class="fin-empty">No Tendepay wallet accounts found.</p>');
  }
  // Back-compat fallback for a backend response without by_role.
  const accounts = data.accounts || [];
  if (!accounts.length) return '<p class="fin-empty">No Tendepay wallet accounts found.</p>';
  return totalsHtml + _tpReconSectionHtml('All Wallets', accounts);
}

// ── Reconciliation: Transactions tab ────────────────────────────────────────
function _tpReconRenderTransactionsFilters(body) {
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  body.innerHTML = `
    <div class="fin-filter-section">
      <div class="fin-filter-grid">
        <div class="fin-filter-field"><label class="fin-filter-label">Start Date</label><input type="date" id="tp-recon-tx-start" class="fin-filter-input" value="${monthAgo}"></div>
        <div class="fin-filter-field"><label class="fin-filter-label">End Date</label><input type="date" id="tp-recon-tx-end" class="fin-filter-input" value="${today}"></div>
        <div class="fin-filter-field"><label class="fin-filter-label">Wallet Role</label>
          <select id="tp-recon-tx-role" class="fin-filter-select">
            <option value="">All</option>
            <option value="main">Main</option>
            <option value="mini">Mini</option>
            <option value="suspense">Suspense</option>
          </select>
        </div>
        <div class="fin-filter-field"><label class="fin-filter-label">Account</label>
          <select id="tp-recon-tx-account" class="fin-filter-select"><option value="">All</option>${_pvAccountOptions(null, { includeNonPostable: true })}</select>
        </div>
      </div>
      <div class="fin-filter-actions"><button class="fin-btn-teal" onclick="_tpReconTxGenerate()">Generate</button></div>
    </div>
    <div id="tp-recon-tx-output"></div>`;
  _tpReconTxGenerate();
}

async function _tpReconTxGenerate() {
  const start = document.getElementById('tp-recon-tx-start')?.value;
  const end = document.getElementById('tp-recon-tx-end')?.value;
  const role = document.getElementById('tp-recon-tx-role')?.value;
  const accountId = document.getElementById('tp-recon-tx-account')?.value;
  const out = document.getElementById('tp-recon-tx-output');
  if (!out) return;
  if (!start || !end) { out.innerHTML = '<p class="fin-error-msg">Start Date and End Date are required.</p>'; return; }
  out.innerHTML = '<p class="sa-loading">Loading&#8230;</p>';
  const params = new URLSearchParams({ start_date: start, end_date: end });
  if (role) params.set('wallet_role', role);
  if (accountId) params.set('account_id', accountId);
  const res = await apiFetch(`${_TP_BASE}/reconciliation/transactions?${params.toString()}`);
  if (!res || !res.ok) { out.innerHTML = `<p class="fin-error-msg">${res ? await parseApiError(res) : 'Network error.'}</p>`; return; }
  const data = await res.json();
  out.innerHTML = _tpReconRenderTransactions(data);
}

function _tpReconRenderTransactions(data) {
  const wallets = data.wallets || data.accounts || (Array.isArray(data) ? data : []);
  if (!wallets.length) return '<p class="fin-empty">No wallet activity for the selected criteria.</p>';
  return wallets.map(_tpReconWalletCard).join('');
}

// direction is from THIS wallet's perspective — a wallet_transfer legitimately
// appears once in the source wallet's list (Out) and once in the
// destination's (In). Rendered per-wallet exactly as the backend returns
// them, with no cross-wallet merge/dedup step.
function _tpReconWalletCard(w) {
  const opening = parseFloat(w.opening_balance ?? 0);
  const closing = parseFloat(w.closing_balance ?? 0);
  const movements = w.movements || [];
  let inflows = 0, outflows = 0;
  movements.forEach(m => {
    const amt = parseFloat(m.amount) || 0;
    const dir = (m.direction || '').toLowerCase();
    if (dir === 'in' || dir === 'inflow' || dir === 'credit') inflows += amt;
    else if (dir === 'out' || dir === 'outflow' || dir === 'debit') outflows += amt;
  });
  const balanced = Math.abs((opening + inflows - outflows) - closing) <= 0.005;
  const accountName = w.account_name || w.wallet_name || w.name || `Account #${w.account_id ?? w.id ?? ''}`;
  const role = w.wallet_role || w.role;
  const rolePill = role ? `<span style="display:inline-block;margin-left:8px;padding:2px 9px;border-radius:10px;font-size:0.72rem;font-weight:600;color:#fff;background:${role === 'main' ? 'var(--navy-700,#1B3057)' : role === 'mini' ? 'var(--gold-500,#C9A227)' : '#888'};">${_finEsc(role)}</span>` : '';

  const rows = movements.map(m => {
    const dir = (m.direction || '').toLowerCase();
    const dirLabel = dir === 'in' || dir === 'inflow' || dir === 'credit' ? 'In' : (dir === 'out' || dir === 'outflow' || dir === 'debit' ? 'Out' : (m.direction || '—'));
    const dirColor = dirLabel === 'In' ? 'color:#1e7e34;font-weight:600;' : (dirLabel === 'Out' ? 'color:#c0392b;font-weight:600;' : '');
    const je = m.journal_entry_id ?? m.je_id;
    return `<tr>
      <td>${_tpDate(m.date ?? m.transaction_date ?? m.fund_date)}</td>
      <td>${_finEsc(m.kind || m.type || m.movement_kind || '')}</td>
      <td style="${dirColor}">${dirLabel}</td>
      <td>${_tpMoney(m.amount)}</td>
      <td>${_tpMoney(m.charge ?? 0)}</td>
      <td>${_finEsc(m.reference || m.tendepay_reference || '')}</td>
      <td>${_finEsc(m.counterparty || m.payee_name || m.wallet_name || '')}</td>
      <td>${je != null ? '#' + _finEsc(String(je)) : '—'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="fin-filter-section" style="margin-bottom:16px;${balanced ? '' : 'border-left:4px solid var(--coral-500,#D94040);'}">
      <div class="fin-section-label">${_finEsc(accountName)}${rolePill}${balanced ? '' : ' <span style="color:var(--coral-600,#c0392b);font-weight:600;">— balance identity mismatch: a manual JE likely bypassed the pipeline</span>'}</div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Opening ${_tpMoney(opening)} &middot; Inflows <span style="color:var(--navy-700,#1B3057);font-weight:600;">${_tpMoney(inflows)}</span> &middot; Outflows <span style="color:var(--coral-600,#c0392b);font-weight:600;">${_tpMoney(outflows)}</span> &middot; Closing ${_tpMoney(closing)} &middot; ${movements.length} movement${movements.length === 1 ? '' : 's'}
        </div>
      </div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Date</th><th>Kind</th><th>Direction</th><th>Amount</th><th>Charge</th><th>Reference</th><th>Counterparty</th><th>JE</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8" class="fin-empty">No movements in this window.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

// ==================== GATEWAY TRANSACTIONS (Receivables) ====================
// Route/field names beyond gateway_receipt/gateway_transaction_id/initiated_by
// were not spelled out in the BE_FE_Contract (only /summary, /reconcile-now,
// /reconcile-report were given explicitly) — the base collection path is
// inferred as the natural parent of those three. Detail fields use fallback
// chains for anything not explicitly named, same defensive pattern used
// elsewhere in this file for unconfirmed response shapes. Verify against a
// live openapi.json before trusting field names beyond the three named ones.
const _RT_BASE = `${API_BASE}/receivables/transactions`;
function _rtMoney(v) { return _pvMoney(v); }
function _rtDate(v) { return _pvDate(v); }

const _RT_STATUS_COLORS = { pending: '#9a7d0a;background:#fdf3d0', succeeded: '#1e7e34;background:#dcf3e2', failed: '#c0392b;background:#fde0de' };
function _rtStatusBadge(status) {
  const c = _RT_STATUS_COLORS[status] || '#888;background:#eee';
  const [color, bg] = c.split(';background:');
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${color};background:${bg};">${_finEsc(status || '—')}</span>`;
}

async function loadFinTransactionsView(container) {
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Transactions</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Receivables &rsaquo; Transactions</div>
      </div>
      <div id="rt-summary-card" style="margin-bottom:16px;"></div>
      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field"><label class="fin-filter-label">Start Date</label><input type="date" id="rt-start" class="fin-filter-input" value="${monthAgo}"></div>
          <div class="fin-filter-field"><label class="fin-filter-label">End Date</label><input type="date" id="rt-end" class="fin-filter-input" value="${today}"></div>
          <div class="fin-filter-field"><label class="fin-filter-label">Status</label>
            <select id="rt-status" class="fin-filter-select">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
        <div class="fin-filter-actions" style="align-items:center;flex-wrap:wrap;gap:12px;">
          <button class="fin-btn-teal" onclick="_rtReload()">Filter</button>
          <label style="font-size:0.85rem;color:#666;margin-left:12px;">Stuck after (min)</label>
          <input type="number" id="rt-threshold" value="10" min="1" style="width:70px;" class="fin-filter-input">
          <button class="fin-btn-outline" onclick="_rtReconcileNow()">Reconcile Stuck Payments</button>
        </div>
      </div>
      <div id="rt-recon-report" style="margin-bottom:16px;"></div>
      <div id="rt-split"></div>
    </div>`;
  await Promise.all([_rtLoadSummary(), _rtLoadReconReport(), _rtReload()]);
}

async function _rtLoadSummary() {
  const el = document.getElementById('rt-summary-card');
  if (!el) return;
  const start = document.getElementById('rt-start')?.value;
  const end = document.getElementById('rt-end')?.value;
  const params = new URLSearchParams();
  if (start) params.set('date_from', start);
  if (end) params.set('date_to', end);
  const res = await apiFetch(`${_RT_BASE}/summary${params.toString() ? '?' + params.toString() : ''}`);
  if (!res || !res.ok) { el.innerHTML = ''; return; }
  const data = await res.json();
  const rows = data.by_status || [];
  if (!rows.length) { el.innerHTML = '<p class="fin-empty">No transaction summary for this period.</p>'; return; }
  el.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      ${rows.map(r => {
        const c = _RT_STATUS_COLORS[r.status] || '#888;background:#eee';
        const [color, bg] = c.split(';background:');
        return `<div style="flex:1;min-width:160px;border-radius:8px;padding:14px 18px;background:${bg};">
          <div style="font-size:0.78rem;font-weight:600;color:${color};text-transform:uppercase;">${_finEsc(r.status || '')}</div>
          <div style="font-size:1.3rem;font-weight:700;color:var(--navy-700,#1B3057);margin-top:4px;">${r.count ?? 0}</div>
          <div style="font-size:0.85rem;color:#555;margin-top:2px;">${_rtMoney(r.total_amount)}</div>
        </div>`;
      }).join('')}
    </div>`;
}

async function _rtLoadReconReport() {
  const el = document.getElementById('rt-recon-report');
  if (!el) return;
  const res = await apiFetch(`${_RT_BASE}/reconcile-report`);
  if (res && res.status === 404) { el.innerHTML = '<p style="color:#888;font-size:0.85rem;">No reconciliation run yet.</p>'; return; }
  if (!res || !res.ok) { el.innerHTML = ''; return; }
  _rtRenderReconReport(await res.json());
}

function _rtRenderReconReport(data) {
  const el = document.getElementById('rt-recon-report');
  if (!el) return;
  el.innerHTML = `
    <div style="border:1px solid var(--grey-100,#eee);border-radius:8px;padding:12px 16px;font-size:0.85rem;color:#374151;">
      Last reconciliation run: <strong>${_rtDate(data.run_at)}</strong> &middot;
      Checked ${data.checked ?? 0}, Updated ${data.updated ?? 0}, Receipts created ${data.receipts_created ?? 0}
      ${(data.errors && data.errors.length) ? `<div style="color:#c0392b;margin-top:6px;">${data.errors.length} error(s): ${data.errors.map(e => _finEsc(typeof e === 'string' ? e : (e.message || JSON.stringify(e)))).join('; ')}</div>` : ''}
    </div>`;
}

async function _rtReconcileNow() {
  const threshold = parseInt(document.getElementById('rt-threshold')?.value, 10) || 10;
  const res = await apiFetch(`${_RT_BASE}/reconcile-now?minutes_threshold=${threshold}`, { method: 'POST' });
  if (res && res.ok) {
    showToast('Reconciliation run complete.', 'success');
    await _rtLoadReconReport();
    await _rtLoadSummary();
    await window._splitReload?.();
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function _rtReload() {
  const start = document.getElementById('rt-start')?.value;
  const end = document.getElementById('rt-end')?.value;
  const status = document.getElementById('rt-status')?.value;
  const params = new URLSearchParams();
  if (start) params.set('date_from', start);
  if (end) params.set('date_to', end);
  if (status) params.set('status', status);
  await renderSplitView({
    container: document.getElementById('rt-split'),
    moduleKey: 'finance.receivables',
    title: 'Transactions',
    breadcrumb: [{label:'Dashboard',view:null},{label:'Finance',view:null},{label:'Transactions'}],
    apiUrl: `${_RT_BASE}${params.toString() ? '?' + params.toString() : ''}`,
    searchFields: ['gateway_receipt', 'gateway_transaction_id', 'payee_name', 'student_name'],
    col1Label: 'Reference', col2Label: 'Status',
    col1: t => t.gateway_receipt || t.gateway_transaction_id || `#${t.id}`,
    col2: t => _rtStatusBadge(t.status),
    rowLabel: t => t.gateway_receipt || t.gateway_transaction_id || `#${t.id}`,
    rowSub: t => _rtMoney(t.amount),
    idKey: 'id',
    detailFields: [
      {label:'Confirmation Code (M-Pesa Receipt)', key:'gateway_receipt',       fmt:v=>v||'—'},
      {label:'Initiation Reference',               key:'gateway_transaction_id', fmt:v=>v||'—'},
      {label:'Payee / Student',                    key:'payee_name',           fmt:(v,t)=>v||t.student_name||t.phone_number||'—'},
      {label:'Amount',                             key:'amount',               fmt:v=>_rtMoney(v)},
      {label:'Status',                             key:'status',               fmt:v=>_rtStatusBadge(v)},
      {label:'Initiated By',                       key:'initiated_by',         fmt:v=>v?_finEsc(String(v)):'Paybill (customer-initiated)'},
      {label:'Transaction Date',                   key:'transaction_date',     fmt:v=>_rtDate(v)},
    ],
    detailActions: t => _rtRequeryBlock(t) + _rtBankDetailsCard(t),
  });
}

// Manual requery — POST /receivables/transactions/{id}/requery, confirmed
// live 2026-08-18. Only useful on a transaction that hasn't reached a
// terminal state; the endpoint re-queries the gateway and, on SUCCESS,
// idempotently creates the receipt + JE via the same confirm_transaction()
// path as the webhook.
const _RT_NON_TERMINAL = new Set(['initiated', 'pending', 'failed', 'timeout']);
function _rtRequeryBlock(t) {
  if (!_RT_NON_TERMINAL.has(t.status)) return '';
  return `
    <div style="margin-bottom:14px;">
      <button class="fin-btn-outline" onclick="_rtRequery(${t.id})">Requery Gateway</button>
      <div id="rt-requery-msg"></div>
    </div>`;
}
async function _rtRequery(id) {
  const msgEl = document.getElementById('rt-requery-msg');
  if (msgEl) msgEl.innerHTML = '';
  const res = await apiFetch(`${_RT_BASE}/${id}/requery`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    showToast('Requeried — transaction status refreshed.', 'success');
    await window._splitRefreshSelected?.();
    await _rtLoadSummary();
    return;
  }
  const msg = await parseApiError(res);
  // Documented failure surfacing on this endpoint: 400 no status query,
  // 502 gateway raised, 503 gateway not implemented, 500 config_error (e.g.
  // COOP_SETTLEMENT_ACCOUNT_ID unset) or any other non-terminal confirm
  // outcome — 500 specifically so a caller can't mistake a silent no-op
  // for success. The transaction stays non-terminal server-side either way.
  if (res.status === 500) {
    _pvShowGoldConfigMsg(msgEl, msg);
  } else if (res.status === 502) {
    _pvShowCoralMsg(msgEl, 'Gateway error while requerying — try again shortly.');
  } else if (res.status === 503) {
    _pvShowCoralMsg(msgEl, "Requery isn't implemented for this transaction's gateway yet.");
  } else if (res.status === 400) {
    _pvShowCoralMsg(msgEl, msg || "This transaction's gateway does not support a status query.");
  } else {
    showToast('Error: ' + msg, 'error');
  }
}

// Co-op IPN bank-side fields (BE/FE Contract Addendum 2026-08-06 §2.4) — only
// populated on transactions landed via Co-op Paybill; pre-IPN rows have all
// seven null, so suppress the card entirely rather than show a wall of "—".
function _rtBankDetailsCard(t) {
  const fields = [
    {label:'AcctNo',          value: t.acct_no},
    {label:'Event Type',      value: t.event_type},
    {label:'Narration',       value: t.narration},
    {label:'Booked Balance',  value: t.booked_balance != null ? _rtMoney(t.booked_balance) : null},
    {label:'Cleared Balance', value: t.cleared_balance != null ? _rtMoney(t.cleared_balance) : null},
    {label:'Posting Date',    value: t.posting_date ? _rtDate(t.posting_date) : null},
    {label:'Value Date',      value: t.value_date ? _rtDate(t.value_date) : null},
  ];
  if (!fields.some(f => f.value != null && f.value !== '')) return '';
  return `
    <div class="detail-info-card" style="margin-top:16px;">
      <div style="font-size:0.78rem;font-weight:600;color:var(--navy-700,#1B3057);text-transform:uppercase;margin-bottom:10px;">Bank details</div>
      <div class="detail-fields-grid">
        ${fields.map(f => `
          <div class="detail-field">
            <span class="detail-field-label">${f.label}</span>
            <span class="detail-field-value">${f.value != null && f.value !== '' ? f.value : '—'}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

// ── Unmatched Co-op Payments (BE/FE Contract Addendum 2026-08-06 §2.5) ─────
// Co-op Paybill inflows the backend couldn't auto-attribute to a student.
// Modeled on loadTendepaySuspenseView (unmatched -> resolve-via-modal), but
// this queue additionally offers suggested_students embedded on the detail
// response, a manual student search, and a required-reason reject path.
const _COOP_API = `${API_BASE}/receivables/coop-unmatched`;
const _COOP_STATUS_COLORS = {
  pending_review: '#8a6d00;background:#f5e6a8',
  resolved:       '#1e7e34;background:#dcf3e2',
  rejected:       '#c0392b;background:#fbdcdc',
};
function _coopMoney(v) { return formatKES(v); }
function _coopDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? v : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function _coopStatusBadge(status) {
  const c = _COOP_STATUS_COLORS[status] || '#888;background:#eee';
  const [color, bg] = c.split(';background:');
  const label = { pending_review: 'Pending Review', resolved: 'Resolved', rejected: 'Rejected' }[status] || status || '—';
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${color};background:${bg};">${_finEsc(label)}</span>`;
}

let _coopStatusFilter = 'pending_review';
// Ops → Recovery sub-tab (BE/FE Contract Addendum 2026-08-18 §B.4) — sits
// alongside the existing pending/resolved/rejected queue, not inside it.
let _coopTopTab = 'queue';

async function loadCoopUnmatchedView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Unmatched Co-op Payments</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Receivables &rsaquo; Unmatched Co-op Payments</div>
      </div>
      <div id="coop-top-tabs" style="display:flex;gap:8px;margin-bottom:18px;border-bottom:1px solid var(--grey-100,#eee);padding-bottom:12px;"></div>
      <div id="coop-tab-body"></div>
    </div>`;
  _coopTopTab = 'queue';
  _coopRenderTopTabs();
  await _coopRenderTabBody();
}

function _coopRenderTopTabs() {
  const el = document.getElementById('coop-top-tabs');
  if (!el) return;
  const tabs = [['queue', 'Queue'], ['recovery', 'Ops Recovery']];
  el.innerHTML = tabs.map(([val, label]) => {
    const active = _coopTopTab === val;
    return `<button class="${active ? 'fin-btn-teal' : 'fin-btn-outline'}" style="padding:7px 18px;font-size:0.85rem;" onclick="_coopSetTopTab('${val}')">${label}</button>`;
  }).join('');
}

async function _coopSetTopTab(tab) {
  _coopTopTab = tab;
  _coopRenderTopTabs();
  await _coopRenderTabBody();
}

async function _coopRenderTabBody() {
  const body = document.getElementById('coop-tab-body');
  if (!body) return;
  if (_coopTopTab === 'recovery') {
    _coopRenderRecoveryTab(body);
  } else {
    body.innerHTML = `<div id="coop-status-tabs" style="display:flex;gap:8px;margin-bottom:16px;"></div><div id="coop-split"></div>`;
    _coopRenderTabs();
    await _coopReload();
  }
}

// ── Ops Recovery — /rerun and /sweep (§B.2/B.3) ─────────────────────────────
function _coopRenderRecoveryTab(body) {
  body.innerHTML = `
    <div class="fin-form-wrap" style="max-width:520px;">
      <h3 style="margin-top:0;font-size:1rem;color:var(--navy-700,#1B3057);">Rerun a stuck transaction</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Transaction ID <span class="fin-required">*</span></label>
        <input type="number" id="coop-rerun-txid" class="fin-form-input" min="1">
        <span style="font-size:11px;color:var(--grey-500,#888);">The numeric ID of the stuck Co-op CREDIT transaction. Find it via the variance investigation UI or the raw transactions list.</span>
      </div>
      <div id="coop-rerun-msg"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_coopRerun()">Rerun</button>
      </div>
    </div>
    <div class="fin-form-wrap" style="max-width:520px;margin-top:30px;">
      <h3 style="margin-top:0;font-size:1rem;color:var(--navy-700,#1B3057);">Sweep stuck transactions</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Max Scan</label>
        <input type="number" id="coop-sweep-max" class="fin-form-input" value="100" min="1" max="1000">
        <span style="font-size:11px;color:var(--grey-500,#888);">Upper bound on how many stuck transactions to attempt in this sweep. Safe to run repeatedly.</span>
      </div>
      <div id="coop-sweep-msg"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_coopSweepConfirm()">Sweep</button>
      </div>
      <div style="font-size:11px;color:var(--grey-500,#888);margin-top:8px;">Safe to run repeatedly. The matcher's PENDING guard + the unique constraint on Co-op TransactionId mean duplicate re-runs won't create duplicate receipts.</div>
    </div>`;
}

async function _coopRerun() {
  const txIdEl = document.getElementById('coop-rerun-txid');
  const msgEl = document.getElementById('coop-rerun-msg');
  if (msgEl) msgEl.innerHTML = '';
  const txId = parseInt(txIdEl?.value, 10);
  if (!txId) { showToast('Transaction ID is required.', 'error'); return; }
  const res = await apiFetch(`${_COOP_API}/rerun/${txId}`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    if (data.status === 'success') {
      showToast('Matched and confirmed — receipt created.', 'success');
    } else if (data.queued_unmatched) {
      msgEl.innerHTML = `<div style="margin-top:10px;padding:10px 14px;border-radius:6px;border-left:3px solid var(--gold-500);background:var(--gold-100);color:#7a6110;font-size:0.85rem;">Queued for manual review — check the <a href="#" onclick="_coopSetTopTab('queue');return false;">Unmatched Queue</a> tab.</div>`;
    } else {
      showToast('No change — transaction still pending.', 'info');
    }
    return;
  }
  if (res.status === 404) {
    showToast(`Transaction ${txId} not found.`, 'error');
  } else if (res.status === 422 || res.status === 409) {
    _pvShowCoralMsg(msgEl, await parseApiError(res));
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

function _coopSweepConfirm() {
  const maxScan = parseInt(document.getElementById('coop-sweep-max')?.value, 10) || 100;
  if (!confirm(`Attempt to re-run the matcher for up to ${maxScan} stuck Co-op transactions?`)) return;
  _coopSweep(maxScan);
}
async function _coopSweep(maxScan) {
  const msgEl = document.getElementById('coop-sweep-msg');
  if (msgEl) msgEl.innerHTML = '';
  const res = await apiFetch(`${_COOP_API}/sweep?max_scan=${maxScan}`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    const data = await res.json();
    const stillCoral = data.still_unmatched > 0;
    msgEl.innerHTML = `
      <div style="margin-top:10px;padding:14px 16px;border-radius:6px;background:#f9fafb;border:1px solid #e5e7eb;font-size:0.88rem;">
        <div style="font-weight:600;margin-bottom:8px;">Sweep complete.</div>
        <div>Scanned: ${data.scanned}</div>
        <div style="color:var(--navy-700,#1B3057);font-weight:600;">Matched: ${data.matched}</div>
        <div style="color:${stillCoral ? '#8a6d00' : '#666'};">Still unmatched: ${data.still_unmatched}</div>
        ${stillCoral ? `<div style="margin-top:8px;"><a href="#" onclick="_coopSetTopTab('queue');return false;">&rarr; Review the Unmatched Queue tab</a></div>` : ''}
      </div>`;
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

function _coopRenderTabs() {
  const el = document.getElementById('coop-status-tabs');
  if (!el) return;
  const tabs = [['', 'All'], ['pending_review', 'Pending Review'], ['resolved', 'Resolved'], ['rejected', 'Rejected']];
  el.innerHTML = tabs.map(([val, label]) => {
    const active = _coopStatusFilter === val;
    return `<button class="${active ? 'fin-btn-teal' : 'fin-btn-outline'}" style="padding:6px 14px;font-size:0.85rem;" onclick="_coopSetTab('${val}')">${label}</button>`;
  }).join('');
}

async function _coopSetTab(status) {
  _coopStatusFilter = status;
  _coopRenderTabs();
  await _coopReload();
}

async function _coopReload() {
  const params = _coopStatusFilter ? `?status=${encodeURIComponent(_coopStatusFilter)}` : '';
  await renderSplitView({
    container: document.getElementById('coop-split'),
    moduleKey: 'finance.receivables',
    title: 'Unmatched Co-op Payments',
    breadcrumb: [{label:'Dashboard',view:null},{label:'Finance',view:null},{label:'Unmatched Co-op Payments'}],
    apiUrl: `${_COOP_API}${params}`,
    searchFields: ['narration', 'transaction_gateway_ref', 'transaction_payment_ref'],
    col1Label: 'Amount', col2Label: 'Status',
    col1: t => {
      const sub = (t.narration || '').length > 60 ? _finEsc(t.narration.slice(0, 60)) + '&hellip;' : _finEsc(t.narration || '—');
      return `<strong>${_coopMoney(t.amount)}</strong><br><span style="font-weight:400;font-size:12px;color:#888;" title="${_finEsc(t.narration || '')}">${_coopDate(t.transaction_date || t.created_at)} &middot; ${sub}</span>`;
    },
    col2: t => _coopStatusBadge(t.status),
    rowLabel: t => _coopMoney(t.amount),
    rowSub: t => _coopDate(t.transaction_date || t.created_at),
    idKey: 'id',
    detailFields: [
      {label:'Amount',           key:'amount',                  fmt:v=>_coopMoney(v)},
      {label:'Status',           key:'status',                  fmt:v=>_coopStatusBadge(v)},
      {label:'Transaction Date', key:'transaction_date',        fmt:v=>_coopDate(v)},
      {label:'Received At',      key:'created_at',              fmt:v=>_coopDate(v)},
      {label:'Narration',        key:'narration',                fmt:v=>v||'—', fullWidth:true},
      {label:'AcctNo',           key:'transaction_acct_no',      fmt:v=>v||'—'},
      {label:'Gateway Ref',      key:'transaction_gateway_ref',  fmt:v=>v||'—'},
      {label:'Payment Ref',      key:'transaction_payment_ref',  fmt:v=>v||'—'},
      {label:'Notes',            key:'notes',                    fmt:v=>v||'—', hideWhen:item=>!item.notes},
    ],
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600,#5F6B7C)">
        <p style="font-weight:600;margin-bottom:8px;">Unmatched Co-op Payments</p>
        <p style="font-size:13px;">Co-op Paybill inflows that could not be auto-matched to a student land here.
        Click a row to see the details and any suggested matches.</p>
      </div>`;
    },
    detailActions: item => _coopDetailActions(item),
  });
}

function _coopDetailActions(item) {
  if (item.status !== 'pending_review') {
    return `<div style="color:var(--grey-600,#5F6B7C);font-size:0.9rem;">This payment has already been ${_finEsc((item.status||'').replace('_',' '))}.</div>`;
  }
  const suggestions = item.suggested_students || [];
  const suggestionCards = suggestions.length ? suggestions.map((s, i) => `
    <div style="border:1px solid var(--grey-100,#eee);border-radius:6px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-weight:600;font-size:0.9rem;">${_finEsc(s.first_name)} ${_finEsc(s.last_name)}</div>
        <div style="font-size:12px;color:#888;">${_finEsc(s.student_id)}${suggestions.length > 1 ? ` &middot; Match ${i + 1}` : ''}</div>
      </div>
      <button class="btn" onclick="_coopAssign(${item.id}, ${s.id})">Assign</button>
    </div>`).join('')
    : `<p style="font-size:13px;color:#888;">No suggested matches found.</p>`;

  return `
    <div style="width:100%;">
      <div style="font-size:0.78rem;font-weight:600;color:var(--navy-700,#1B3057);text-transform:uppercase;margin-bottom:10px;">Suggested Students</div>
      ${suggestionCards}
      <div style="font-size:0.78rem;font-weight:600;color:var(--navy-700,#1B3057);text-transform:uppercase;margin:18px 0 10px;">Manual Search</div>
      <div style="position:relative;">
        <input type="text" id="coop-manual-search" class="fin-form-input" placeholder="Search by name or admission number…" oninput="_coopSearchStudent(${item.id}, this.value)" autocomplete="off">
        <div id="coop-manual-search-dd" style="display:none;position:absolute;z-index:20;background:#fff;border:1px solid var(--grey-200,#D6DAE3);border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,0.12);max-height:220px;overflow-y:auto;width:100%;"></div>
      </div>
      <div id="coop-assign-msg"></div>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--grey-100,#eee);">
        <button class="fin-btn-cancel" onclick="_coopOpenRejectModal(${item.id})">Reject</button>
      </div>
    </div>`;
}

let _coopSearchDebounce = null;
function _coopSearchStudent(unmatchedId, val) {
  clearTimeout(_coopSearchDebounce);
  const dd = document.getElementById('coop-manual-search-dd');
  if (!val.trim()) { if (dd) dd.style.display = 'none'; return; }
  _coopSearchDebounce = setTimeout(async () => {
    await loadFinanceStudents();
    const list = searchFinanceStudents(val);
    if (!dd) return;
    if (!list.length) {
      dd.innerHTML = `<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>`;
    } else {
      dd.innerHTML = list.map(s => {
        const name = financeStudentName(s);
        return `<a href="#" style="display:block;padding:9px 14px;text-decoration:none;color:var(--navy-900,#0D2137);border-bottom:1px solid var(--grey-100,#ECEEF2);"
                   onclick="_coopAssign(${unmatchedId}, ${s.id});return false;">
          ${_finEsc(s.student_id || '')} — ${_finEsc(name)}
        </a>`;
      }).join('');
    }
    dd.style.display = 'block';
  }, 300);
}
document.addEventListener('click', (e) => {
  const dd = document.getElementById('coop-manual-search-dd');
  const input = document.getElementById('coop-manual-search');
  if (dd && input && !dd.contains(e.target) && e.target !== input) dd.style.display = 'none';
});

async function _coopAssign(unmatchedId, studentId) {
  const msgEl = document.getElementById('coop-assign-msg');
  if (msgEl) msgEl.innerHTML = '';
  const res = await apiFetch(`${_COOP_API}/${unmatchedId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: studentId })
  });
  if (!res) return;
  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    showToast(`Assigned to ${data.resolved_student_id ? 'student #' + data.resolved_student_id : 'student'}. Fee balance updated.`, 'success');
    await _coopReload();
  } else if (res.status === 500) {
    // Same confirm_transaction() config_error path as manual requery
    // (§ receivables/transactions/{id}/requery) — surfaced distinctly so
    // ops sees "configuration needed" rather than a generic failure. The
    // queue row stays pending_review either way, safe to retry once fixed.
    _pvShowGoldConfigMsg(msgEl, await parseApiError(res));
  } else if (res.status === 409) {
    // Recovery-4 (2026-08-18 addendum §B) — /assign now gates on
    // confirm_transaction() returning "confirmed" before marking the row
    // RESOLVED; a 409 means someone else already processed it from another
    // session (race), rolled back server-side. Don't mark RESOLVED here —
    // reload replaces the detail pane (the row's status may have changed),
    // so this is a toast rather than an inline message that would vanish
    // under the refresh before it's ever read.
    showToast(await parseApiError(res), 'error');
    await _coopReload();
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

function _coopOpenRejectModal(unmatchedId) {
  const wrap = document.createElement('div');
  wrap.id = 'coop-reject-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:440px;max-width:92vw;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Reject Payment</h3>
      <label class="fin-form-label" style="display:block;margin-bottom:6px;">Reason <span class="fin-required">*</span></label>
      <textarea id="coop-reject-reason" class="fin-form-textarea" rows="4" maxlength="500" placeholder="Enter reason..." oninput="document.getElementById('coop-reject-count').textContent = this.value.length"></textarea>
      <div style="text-align:right;font-size:11px;color:#999;"><span id="coop-reject-count">0</span>/500</div>
      <div style="background:#FBEAEA;border-left:3px solid var(--coral-500,#D94040);border-radius:6px;padding:10px 14px;margin-top:10px;font-size:12.5px;color:#7a2020;line-height:1.5;">
        Rejecting leaves the payment PENDING on the transactions table for off-book refund. It does not credit any student.
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('coop-reject-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" id="coop-reject-confirm-btn" style="background:var(--coral-500,#D94040);border-color:var(--coral-500,#D94040);">Reject</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('coop-reject-confirm-btn').onclick = async () => {
    const reason = document.getElementById('coop-reject-reason').value.trim();
    if (!reason) { showToast('Reason is required.', 'error'); return; }
    const res = await apiFetch(`${_COOP_API}/${unmatchedId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res) return;
    if (res.ok) {
      wrap.remove();
      showToast('Payment rejected. Log the reason with the finance lead for the refund process.', 'success');
      await _coopReload();
    } else {
      showToast('Error: ' + await parseApiError(res), 'error');
    }
  };
}

// ==================== BANK RECONCILIATION WORKSPACE ====================
// BE/FE Contract Addendum 2026-08-06 §4. Three routes: sessions list (this
// section), statement imports (below), and the session workspace itself.
// Field names below are verified against the live OpenAPI schema, not the
// addendum's prose, which drifted from the shipped shapes in a few places
// (period_start/period_end not period_from/period_to; opening/closing_
// statement_balance not statement_opening/closing_balance; AdjustmentLine is
// {account_id, line_type, amount} matching journal-entries.js's convention,
// not separate dr/cr fields with a cost_center_id; mark-ignored's body key
// is bank_line_ids not line_ids; workspace.suggestions not suggested_pairs,
// keyed by journal_entry_line_id not book_line_id; complete's failure mode
// is a plain error response, not a 200 with a completed:false/blockers[]
// shape — CompleteResult has no such fields).
const _RECON_API = `${API_BASE}/bank-cash/reconciliation`;
const _RECON_SESSION_STATUS_COLORS = {
  draft:     '#5F6B7C;background:#EEF1F5',
  completed: '#1e7e34;background:#dcf3e2',
  reopened:  '#8a6d00;background:#f5e6a8',
};
function _reconMoney(v) { return formatKES(v); }
function _reconDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? v : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function _reconSessionStatusBadge(status) {
  const c = _RECON_SESSION_STATUS_COLORS[status] || '#888;background:#eee';
  const [color, bg] = c.split(';background:');
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${color};background:${bg};">${_finEsc(label)}</span>`;
}
function _reconBankAccountOptions(selectedId) {
  return (_tpFlBankAccounts || []).filter(b => b.is_active !== false).map(b =>
    `<option value="${b.id}" ${String(b.id) === String(selectedId) ? 'selected' : ''}>${_finEsc(b.bank_name)} — ${_finEsc(b.account_name)}</option>`
  ).join('');
}

// ── Sessions list ────────────────────────────────────────────────────────────
async function loadReconSessionsView(container) {
  await _tpFlLoadBankAccounts();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Reconciliation Sessions</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Bank &amp; Cash &rsaquo; Reconciliation Workspace</div>
      </div>
      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field">
            <label class="fin-filter-label">Bank Account</label>
            <select id="recon-filter-bank" class="fin-filter-select" onchange="_reconSessionsReload()">
              <option value="">All</option>${_reconBankAccountOptions('')}
            </select>
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Status</label>
            <select id="recon-filter-status" class="fin-filter-select" onchange="_reconSessionsReload()">
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="completed">Completed</option>
              <option value="reopened">Reopened</option>
            </select>
          </div>
        </div>
      </div>
      <div id="recon-sessions-split"></div>
    </div>`;
  await _reconSessionsReload();
}

async function _reconSessionsReload() {
  const bankAccountId = document.getElementById('recon-filter-bank')?.value;
  const status = document.getElementById('recon-filter-status')?.value;
  const params = new URLSearchParams();
  if (bankAccountId) params.set('bank_account_id', bankAccountId);
  if (status) params.set('status', status);
  await renderSplitView({
    container: document.getElementById('recon-sessions-split'),
    moduleKey: 'finance.bank_cash_reconciliation',
    title: 'Reconciliation Sessions',
    breadcrumb: [{label:'Dashboard',view:null},{label:'Finance',view:null},{label:'Reconciliation Workspace'}],
    apiUrl: `${_RECON_API}/sessions${params.toString() ? '?' + params.toString() : ''}`,
    searchFields: [],
    col1Label: 'Bank Account', col2Label: 'Status',
    col1: s => `<strong>${_finEsc(_tpFlBankAccountName(s.bank_account_id))}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_reconDate(s.period_start)} &rarr; ${_reconDate(s.period_end)}</span>`,
    col2: s => _reconSessionStatusBadge(s.status),
    rowLabel: s => _tpFlBankAccountName(s.bank_account_id),
    rowSub: s => `${_reconDate(s.period_start)} &rarr; ${_reconDate(s.period_end)}`,
    idKey: 'id',
    detailFields: [
      {label:'Bank Account',              key:'bank_account_id',           fmt:v=>_tpFlBankAccountName(v)},
      {label:'Period',                    key:'period_start',              fmt:(v,s)=>`${_reconDate(s.period_start)} &rarr; ${_reconDate(s.period_end)}`},
      {label:'Status',                    key:'status',                    fmt:v=>_reconSessionStatusBadge(v)},
      {label:'Opening Book Balance',      key:'opening_book_balance',      fmt:v=>_reconMoney(v)},
      {label:'Closing Book Balance',      key:'closing_book_balance',      fmt:v=>_reconMoney(v)},
      {label:'Opening Statement Balance', key:'opening_statement_balance', fmt:v=>v!=null?_reconMoney(v):'—'},
      {label:'Closing Statement Balance', key:'closing_statement_balance', fmt:v=>v!=null?_reconMoney(v):'—'},
      {label:'Reconciled At',             key:'reconciled_at',             fmt:v=>v?_reconDate(v):'—'},
      {label:'Notes',                     key:'notes',                     fmt:v=>v||'—', hideWhen:item=>!item.notes},
    ],
    renderAdd: el => _reconRenderCreateSessionForm(el),
    detailActions: s => `
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn" onclick="_reconOpenWorkspace(${s.id})">Open Workspace</button>
        ${s.status === 'completed' ? `<button class="fin-btn-outline" onclick="_reconReopenSession(${s.id})">Reopen</button>` : ''}
      </div>`,
  });
}

function _reconRenderCreateSessionForm(el) {
  el.innerHTML = `
    <div class="fin-form-wrap">
      <h3 class="fin-title" style="font-size:1.1rem;">New Reconciliation Session</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Bank Account <span class="fin-required">*</span></label>
        <select id="recon-create-bank" class="fin-form-select"><option value="">Please Select</option>${_reconBankAccountOptions('')}</select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Period Start <span class="fin-required">*</span></label>
        <input type="date" id="recon-create-period-start" class="fin-form-input">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Period End <span class="fin-required">*</span></label>
        <input type="date" id="recon-create-period-end" class="fin-form-input">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Statement Opening Balance</label>
        <input type="number" id="recon-create-opening" class="fin-form-input" step="0.01">
        <span style="font-size:0.78rem;color:#888;">Enter the bank's opening balance for this period, if you have the statement in hand. Leaves the book side as the source of truth if blank.</span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Statement Closing Balance</label>
        <input type="number" id="recon-create-closing" class="fin-form-input" step="0.01">
        <span style="font-size:0.78rem;color:#888;">Same as above — optional.</span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="recon-create-notes" class="fin-form-textarea" rows="3"></textarea>
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_reconSubmitCreateSession()">Create Session</button>
      </div>
    </div>`;
}

async function _reconSubmitCreateSession() {
  const bankAccountId = document.getElementById('recon-create-bank')?.value;
  const periodStart = document.getElementById('recon-create-period-start')?.value;
  const periodEnd = document.getElementById('recon-create-period-end')?.value;
  if (!bankAccountId || !periodStart || !periodEnd) {
    showToast('Bank Account, Period Start, and Period End are required.', 'error'); return;
  }
  const opening = document.getElementById('recon-create-opening')?.value;
  const closing = document.getElementById('recon-create-closing')?.value;
  const notes = document.getElementById('recon-create-notes')?.value.trim();
  const payload = {
    bank_account_id: parseInt(bankAccountId, 10),
    period_start: periodStart,
    period_end: periodEnd,
    opening_statement_balance: opening ? opening : null,
    closing_statement_balance: closing ? closing : null,
    notes: notes || null,
  };
  const res = await apiFetch(`${_RECON_API}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res) return;
  if (res.ok) {
    const session = await res.json();
    showToast('Session created.', 'success');
    _reconOpenWorkspace(session.id);
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function _reconReopenSession(sessionId) {
  if (!confirm("Reopen this session? You'll be able to unmatch lines, add adjustments, and re-complete. History is preserved.")) return;
  const res = await apiFetch(`${_RECON_API}/sessions/${sessionId}/reopen`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    showToast('Session reopened.', 'success');
    await window._splitRefreshSelected?.();
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ── Session Workspace — the working screen ──────────────────────────────────
// §4.7: /workspace is the ONLY read the FE needs here. Every mutation
// refetches it — no local patching, no chained per-line calls.
let _reconWsSessionId = null;
let _reconWsData = null;             // last-fetched WorkspaceRead
let _reconWsBankFilter = 'unmatched';
let _reconWsBookFilter = 'unmatched';
let _reconWsBankChecked = {};        // bank_line_id -> true
let _reconWsBookChecked = {};        // journal_entry_line_id -> true
let _reconWsSuggChecked = {};        // "bankId:jelId" -> true

function _reconOpenWorkspace(sessionId) {
  _reconWsSessionId = sessionId;
  _reconWsData = null;
  _reconWsBankFilter = 'unmatched';
  _reconWsBookFilter = 'unmatched';
  _reconWsBankChecked = {};
  _reconWsBookChecked = {};
  _reconWsSuggChecked = {};
  renderReconWorkspacePage(document.getElementById('main-content'));
}

async function renderReconWorkspacePage(container) {
  container.innerHTML = `<div class="fin-page"><div id="recon-ws-mount"><p style="padding:20px;color:#888;">Loading&#8230;</p></div></div>`;
  await _reconWsRefresh();
}

async function _reconWsRefresh() {
  const res = await apiFetch(`${_RECON_API}/sessions/${_reconWsSessionId}/workspace`);
  const mount = document.getElementById('recon-ws-mount');
  if (!res || !res.ok) {
    const msg = res ? await parseApiError(res) : 'Network error.';
    if (mount) mount.innerHTML = `<p style="color:var(--coral-500,#D94040);padding:20px;">Failed to load workspace: ${_finEsc(msg)}</p>`;
    return;
  }
  _reconWsData = await res.json();
  _reconWsBankChecked = {};
  _reconWsBookChecked = {};
  _reconWsSuggChecked = {};
  (_reconWsData.suggestions || []).forEach(sg => {
    if (sg.confidence === 'high') _reconWsSuggChecked[`${sg.bank_line_id}:${sg.journal_entry_line_id}`] = true;
  });
  _reconWsRenderMount();
}

function _reconWsStatCard(label, value, warn) {
  return `<div style="flex:1;min-width:170px;border-radius:8px;padding:14px 18px;background:${warn ? '#FBEAEA' : '#EEF1F5'};">
    <div style="font-size:0.75rem;font-weight:600;color:${warn ? '#c0392b' : '#5F6B7C'};text-transform:uppercase;">${_finEsc(label)}</div>
    <div style="font-size:1.25rem;font-weight:700;color:${warn ? '#c0392b' : 'var(--navy-700,#1B3057)'};margin-top:4px;">${value}</div>
  </div>`;
}

function _reconWsRenderMount() {
  const mount = document.getElementById('recon-ws-mount');
  if (!mount || !_reconWsData) return;
  const { session, summary } = _reconWsData;
  const isOpen = session.status !== 'completed';
  mount.innerHTML = `
    <div class="fin-header-row">
      <div>
        <h2 class="fin-title">${_finEsc(_tpFlBankAccountName(session.bank_account_id))} ${_reconSessionStatusBadge(session.status)}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Bank &amp; Cash &rsaquo; Reconciliation Workspace &rsaquo; ${_reconDate(session.period_start)} &rarr; ${_reconDate(session.period_end)}</div>
      </div>
      <div style="display:flex;gap:10px;">
        ${isOpen ? `<button class="fin-btn-teal" onclick="_reconWsComplete()">Complete</button>` : ''}
        ${session.status === 'completed' ? `<button class="fin-btn-outline" onclick="_reconWsReopen()">Reopen</button>` : ''}
        <button class="fin-btn-cancel" onclick="loadView('bank-cash-reconciliation-workspace')">Back to Sessions</button>
      </div>
    </div>
    <div id="recon-ws-blockers"></div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px;">
      ${_reconWsStatCard('Unmatched Bank Lines', summary.unmatched_bank_count, summary.unmatched_bank_count > 0)}
      ${_reconWsStatCard('Unmatched Book Lines', summary.unmatched_book_count, summary.unmatched_book_count > 0)}
      ${_reconWsStatCard('Book Side Total', _reconMoney(summary.book_movement), false)}
      ${_reconWsStatCard('Bank Side Total', _reconMoney(summary.statement_movement), false)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div>
        <h3 style="font-size:0.92rem;margin-bottom:8px;">Bank Lines</h3>
        ${_reconWsFilterRow('bank')}
        <div id="recon-ws-bank-list" style="max-height:420px;overflow-y:auto;border:1px solid var(--grey-100,#eee);border-radius:6px;"></div>
      </div>
      <div>
        <h3 style="font-size:0.92rem;margin-bottom:8px;">Book Lines</h3>
        ${_reconWsFilterRow('book')}
        <div id="recon-ws-book-list" style="max-height:420px;overflow-y:auto;border:1px solid var(--grey-100,#eee);border-radius:6px;"></div>
      </div>
    </div>
    ${isOpen ? `
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn" onclick="_reconWsManualMatch()">Match Selected</button>
      <button class="fin-btn-outline" onclick="_reconWsOpenIgnoreModal()">Mark Ignored</button>
      <button class="fin-btn-outline" onclick="_reconWsOpenAdjustModal()">Post Adjustment</button>
    </div>` : ''}
    <div id="recon-ws-suggestions" style="margin-top:22px;"></div>
  `;
  _reconWsRenderLists();
  _reconWsRenderSuggestions();
}

function _reconWsFilterRow(side) {
  const current = side === 'bank' ? _reconWsBankFilter : _reconWsBookFilter;
  const tabs = side === 'bank'
    ? [['unmatched','Unmatched'],['matched','Matched'],['ignored','Ignored'],['all','All']]
    : [['unmatched','Unmatched'],['matched','Matched'],['all','All']];
  return `<div style="display:flex;gap:6px;margin-bottom:8px;">
    ${tabs.map(([val,label]) => `<button class="${current===val?'fin-btn-teal':'fin-btn-outline'}" style="padding:4px 10px;font-size:0.78rem;" onclick="_reconWsSetFilter('${side}','${val}')">${label}</button>`).join('')}
  </div>`;
}

function _reconWsSetFilter(side, val) {
  if (side === 'bank') _reconWsBankFilter = val; else _reconWsBookFilter = val;
  _reconWsRenderMount();
}

const _RECON_SOURCE_ICON = { upload: '&#128196;', coop_ipn: '&#127974;' };

function _reconWsRenderLists() {
  const bankEl = document.getElementById('recon-ws-bank-list');
  const bookEl = document.getElementById('recon-ws-book-list');
  if (!bankEl || !bookEl || !_reconWsData) return;
  const isOpen = _reconWsData.session.status !== 'completed';

  const bankLines = (_reconWsData.bank_lines || []).filter(l =>
    _reconWsBankFilter === 'all' || l.reconciliation_status === _reconWsBankFilter);
  bankEl.innerHTML = bankLines.length ? bankLines.map(l => {
    const checked = !!_reconWsBankChecked[l.id];
    const canCheck = isOpen && l.reconciliation_status === 'unmatched';
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-bottom:1px solid var(--grey-100,#eee);${checked?'background:#EEF3FA;':''}">
      ${canCheck ? `<input type="checkbox" ${checked?'checked':''} onchange="_reconWsToggleCheck('bank',${l.id})" style="margin-top:3px;">` : `<span style="width:13px;display:inline-block;"></span>`}
      <div style="flex:1;">
        <div style="font-size:0.85rem;">${_RECON_SOURCE_ICON[l.source]||''} ${_finEsc(l.description)}</div>
        <div style="font-size:11.5px;color:#888;">${_reconDate(l.posting_date)} &middot; ${_reconMoney(l.amount)}${l.reference?` &middot; ${_finEsc(l.reference)}`:''}</div>
        ${l.ignored_reason ? `<div style="font-size:11px;color:#8a6d00;font-style:italic;">Ignored: ${_finEsc(l.ignored_reason)}</div>` : ''}
      </div>
      <div>${_reconLineStatusPill(l.reconciliation_status)}</div>
    </div>`;
  }).join('') : `<p style="padding:20px;text-align:center;color:#aaa;font-size:0.85rem;">No lines.</p>`;

  const bookLines = (_reconWsData.book_lines || []).filter(l =>
    _reconWsBookFilter === 'all' || (_reconWsBookFilter === 'matched' ? l.match_id != null : l.match_id == null));
  bookEl.innerHTML = bookLines.length ? bookLines.map(l => {
    const checked = !!_reconWsBookChecked[l.journal_entry_line_id];
    const canCheck = isOpen && l.match_id == null;
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-bottom:1px solid var(--grey-100,#eee);${checked?'background:#EEF3FA;':''}">
      ${canCheck ? `<input type="checkbox" ${checked?'checked':''} onchange="_reconWsToggleCheck('book',${l.journal_entry_line_id})" style="margin-top:3px;">` : `<span style="width:13px;display:inline-block;"></span>`}
      <div style="flex:1;">
        <div style="font-size:0.85rem;">&#128203; ${_finEsc(l.jv_number)} &mdash; ${_finEsc(l.reference || l.notes || '')}</div>
        <div style="font-size:11.5px;color:#888;">${_reconDate(l.entry_date)} &middot; ${_reconMoney(l.signed_amount)} &middot; ${_finEsc(l.line_type)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        ${l.match_id != null ? _reconLineStatusPill('matched') : ''}
        ${isOpen && l.match_id != null ? `<button class="fin-btn-outline" style="padding:2px 8px;font-size:0.72rem;" onclick="_reconWsUnmatch(${l.match_id})">Unmatch</button>` : ''}
      </div>
    </div>`;
  }).join('') : `<p style="padding:20px;text-align:center;color:#aaa;font-size:0.85rem;">No lines.</p>`;
}

function _reconLineStatusPill(status) {
  const map = { unmatched: '#5F6B7C;background:#EEF1F5', matched: '#1B3057;background:#dce8fb', ignored: '#c0392b;background:#fbdcdc' };
  const c = map[status] || '#888;background:#eee';
  const [color, bg] = c.split(';background:');
  const label = { unmatched: 'Unmatched', matched: 'Matched', ignored: 'Ignored' }[status] || status || '—';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:600;color:${color};background:${bg};">${_finEsc(label)}</span>`;
}

function _reconWsToggleCheck(side, id) {
  const store = side === 'bank' ? _reconWsBankChecked : _reconWsBookChecked;
  if (store[id]) delete store[id]; else store[id] = true;
  _reconWsRenderLists();
}

// ── Suggested matches ────────────────────────────────────────────────────────
function _reconConfidencePill(conf) {
  const map = { high: ['High', '#1e7e34', '#dcf3e2'], medium: ['Medium', '#8a6d00', '#f5e6a8'], low: ['Low', '#5F6B7C', '#EEF1F5'] };
  const entry = map[conf] || [conf, '#888', '#eee'];
  const [label, color, bg] = entry;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:600;color:${color};background:${bg};margin-left:6px;">${_finEsc(label)}</span>`;
}

function _reconWsRenderSuggestions() {
  const el = document.getElementById('recon-ws-suggestions');
  if (!el || !_reconWsData) return;
  const isOpen = _reconWsData.session.status !== 'completed';
  const suggestions = _reconWsData.suggestions || [];
  if (!suggestions.length) { el.innerHTML = ''; return; }
  const bankById = Object.fromEntries((_reconWsData.bank_lines || []).map(l => [l.id, l]));
  const bookById = Object.fromEntries((_reconWsData.book_lines || []).map(l => [l.journal_entry_line_id, l]));
  el.innerHTML = `
    <div style="border:1px solid var(--grey-100,#eee);border-radius:8px;padding:14px 16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="font-size:0.92rem;margin:0;">Suggested Matches</h3>
        ${isOpen ? `<button class="btn" onclick="_reconWsBulkMatchSuggestions()">Match Selected</button>` : ''}
      </div>
      ${suggestions.map(sg => {
        const key = `${sg.bank_line_id}:${sg.journal_entry_line_id}`;
        const bank = bankById[sg.bank_line_id], book = bookById[sg.journal_entry_line_id];
        if (!bank || !book) return '';
        const checked = !!_reconWsSuggChecked[key];
        return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--grey-100,#eee);">
          ${isOpen ? `<input type="checkbox" ${checked?'checked':''} onchange="_reconWsToggleSuggestion('${key}')">` : ''}
          <div style="flex:1;font-size:0.82rem;">${_finEsc(bank.description)} <span style="color:#888;">(${_reconMoney(bank.amount)})</span> &harr; ${_finEsc(book.jv_number)} <span style="color:#888;">(${_reconMoney(book.signed_amount)})</span></div>
          ${_reconConfidencePill(sg.confidence)}
          ${sg.confidence === 'low' ? `<span style="font-size:0.7rem;color:#8a6d00;">Weak signal &mdash; confirm before matching</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

function _reconWsToggleSuggestion(key) {
  if (_reconWsSuggChecked[key]) delete _reconWsSuggChecked[key]; else _reconWsSuggChecked[key] = true;
  _reconWsRenderSuggestions();
}

async function _reconWsBulkMatchSuggestions() {
  const pairs = Object.keys(_reconWsSuggChecked).filter(k => _reconWsSuggChecked[k]).map(k => {
    const [bankId, jelId] = k.split(':');
    return { bank_line_id: parseInt(bankId, 10), journal_entry_line_id: parseInt(jelId, 10) };
  });
  if (!pairs.length) { showToast('Select at least one suggested match.', 'error'); return; }
  await _reconWsSubmitMatch(pairs);
}

async function _reconWsManualMatch() {
  const bankIds = Object.keys(_reconWsBankChecked).filter(k => _reconWsBankChecked[k]);
  const bookIds = Object.keys(_reconWsBookChecked).filter(k => _reconWsBookChecked[k]);
  if (bankIds.length !== 1 || bookIds.length !== 1) {
    showToast('Select exactly one Bank Line and one Book Line to match manually.', 'error'); return;
  }
  await _reconWsSubmitMatch([{ bank_line_id: parseInt(bankIds[0], 10), journal_entry_line_id: parseInt(bookIds[0], 10) }]);
}

async function _reconWsSubmitMatch(pairs) {
  const res = await apiFetch(`${_RECON_API}/sessions/${_reconWsSessionId}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairs })
  });
  if (!res) return;
  if (res.ok) {
    showToast(`Matched ${pairs.length} pair${pairs.length===1?'':'s'}.`, 'success');
    await _reconWsRefresh();
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function _reconWsUnmatch(matchId) {
  if (!confirm('Break this match? Both sides move back to Unmatched.')) return;
  const res = await apiFetch(`${_RECON_API}/sessions/${_reconWsSessionId}/matches/${matchId}`, { method: 'DELETE' });
  if (!res) return;
  if (res.ok || res.status === 204) {
    showToast('Match broken.', 'success');
    await _reconWsRefresh();
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ── Mark Ignored ─────────────────────────────────────────────────────────────
function _reconWsOpenIgnoreModal() {
  const bankIds = Object.keys(_reconWsBankChecked).filter(k => _reconWsBankChecked[k]).map(Number);
  if (!bankIds.length) { showToast('Select at least one Bank Line to ignore.', 'error'); return; }
  const wrap = document.createElement('div');
  wrap.id = 'recon-ignore-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:440px;max-width:92vw;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 10px;font-size:1.05rem;color:#2c3e50;">Mark Ignored</h3>
      <p style="font-size:0.85rem;color:#555;margin:0 0 10px;">${bankIds.length} line${bankIds.length===1?'':'s'} selected.</p>
      <label class="fin-form-label" style="display:block;margin-bottom:6px;">Reason <span class="fin-required">*</span></label>
      <textarea id="recon-ignore-reason" class="fin-form-textarea" rows="3" maxlength="500" placeholder="e.g. 'Awaiting bank reversal', 'Duplicate statement line', 'Belongs to next period'."></textarea>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" style="background:var(--coral-500,#D94040);border-color:var(--coral-500,#D94040);color:#fff;" onclick="document.getElementById('recon-ignore-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" id="recon-ignore-confirm-btn">Mark Ignored</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('recon-ignore-confirm-btn').onclick = async () => {
    const reason = document.getElementById('recon-ignore-reason').value.trim();
    if (!reason) { showToast('Reason is required.', 'error'); return; }
    const res = await apiFetch(`${_RECON_API}/sessions/${_reconWsSessionId}/mark-ignored`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_line_ids: bankIds, reason })
    });
    if (!res) return;
    if (res.ok) {
      wrap.remove();
      showToast('Lines marked ignored.', 'success');
      await _reconWsRefresh();
    } else {
      showToast('Error: ' + await parseApiError(res), 'error');
    }
  };
}

// ── Post Adjustment — reuses journal-entries.js's debit/credit line pattern ─
let _reconAdjDebitLines = [], _reconAdjCreditLines = [];

async function _reconWsOpenAdjustModal() {
  await _pvLoadLookups();
  _reconAdjDebitLines = [{ account_id: '', amount: '' }];
  _reconAdjCreditLines = [{ account_id: '', amount: '' }];
  const today = new Date().toISOString().split('T')[0];
  const wrap = document.createElement('div');
  wrap.id = 'recon-adjust-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow-y:auto;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:560px;max-width:92vw;max-height:90vh;overflow-y:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Post Adjustment</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Description <span class="fin-required">*</span></label>
        <input type="text" id="recon-adj-desc" class="fin-form-input" maxlength="200" placeholder="e.g. Bank charges June 2026">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Posting Date <span class="fin-required">*</span></label>
        <input type="date" id="recon-adj-date" class="fin-form-input" value="${today}">
        <div id="recon-adj-date-msg"></div>
      </div>
      <div class="fin-section-label" style="margin-top:10px;">Debit</div>
      <table class="fin-li-table">
        <thead><tr><th>GL Account</th><th>Amount</th><th></th></tr></thead>
        <tbody id="recon-adj-debit-lines"></tbody>
      </table>
      <a href="#" style="color:#2db3b3;font-weight:600;text-decoration:underline;font-size:0.85rem;" onclick="_reconAdjAddLine('debit');return false;">+ Add More</a>
      <div class="fin-section-label" style="margin-top:14px;">Credit</div>
      <table class="fin-li-table">
        <thead><tr><th>GL Account</th><th>Amount</th><th></th></tr></thead>
        <tbody id="recon-adj-credit-lines"></tbody>
      </table>
      <a href="#" style="color:#2db3b3;font-weight:600;text-decoration:underline;font-size:0.85rem;" onclick="_reconAdjAddLine('credit');return false;">+ Add More</a>
      <div style="margin-top:12px;font-size:0.85rem;">Debit total: <span id="recon-adj-debit-total">KES 0.00</span> &middot; Credit total: <span id="recon-adj-credit-total">KES 0.00</span></div>
      <span style="display:block;color:var(--coral-500,#D94040);font-size:0.82rem;margin-top:4px;" id="recon-adj-balance-err"></span>
      <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('recon-adjust-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" id="recon-adj-post-btn" disabled onclick="_reconWsSubmitAdjustment()">Post Adjustment</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  _reconAdjRenderLines('debit'); _reconAdjRenderLines('credit');
}

function _reconAdjLineHtml(line, idx, type) {
  const list = type === 'debit' ? _reconAdjDebitLines : _reconAdjCreditLines;
  return `<tr>
    <td><select class="fin-li-input" onchange="_reconAdjUpdateLine('${type}',${idx},'account_id',this.value)">
      <option value="">Please Select</option>${_pvAccountOptions(line.account_id)}
    </select></td>
    <td><input type="number" class="fin-li-input" step="0.01" min="0.01" value="${line.amount||''}" oninput="_reconAdjUpdateLine('${type}',${idx},'amount',this.value)"></td>
    <td><button class="fin-btn-li-rm" ${list.length<=1?'disabled':''} onclick="_reconAdjRemoveLine('${type}',${idx})">&times;</button></td>
  </tr>`;
}
function _reconAdjRenderLines(type) {
  const list = type === 'debit' ? _reconAdjDebitLines : _reconAdjCreditLines;
  const el = document.getElementById(`recon-adj-${type}-lines`);
  if (el) el.innerHTML = list.map((l, i) => _reconAdjLineHtml(l, i, type)).join('');
  _reconAdjRecalc();
}
function _reconAdjAddLine(type) {
  (type === 'debit' ? _reconAdjDebitLines : _reconAdjCreditLines).push({ account_id: '', amount: '' });
  _reconAdjRenderLines(type);
}
function _reconAdjRemoveLine(type, idx) {
  const list = type === 'debit' ? _reconAdjDebitLines : _reconAdjCreditLines;
  if (list.length <= 1) return;
  list.splice(idx, 1);
  _reconAdjRenderLines(type);
}
function _reconAdjUpdateLine(type, idx, key, val) {
  const list = type === 'debit' ? _reconAdjDebitLines : _reconAdjCreditLines;
  list[idx][key] = key === 'account_id' ? parseInt(val, 10) : val;
  _reconAdjRecalc();
}
function _reconAdjRecalc() {
  const sum = list => list.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const debitTotal = sum(_reconAdjDebitLines), creditTotal = sum(_reconAdjCreditLines);
  const debitEl = document.getElementById('recon-adj-debit-total');
  const creditEl = document.getElementById('recon-adj-credit-total');
  if (debitEl) debitEl.textContent = _reconMoney(debitTotal);
  if (creditEl) creditEl.textContent = _reconMoney(creditTotal);
  const diff = Math.abs(debitTotal - creditTotal);
  const balanced = diff <= 0.005 && debitTotal > 0;
  const errEl = document.getElementById('recon-adj-balance-err');
  if (errEl) errEl.textContent = balanced ? '' : `Debit and credit totals must match. Difference: ${_reconMoney(diff)}`;
  const btn = document.getElementById('recon-adj-post-btn');
  if (btn) btn.disabled = !balanced;
}

async function _reconWsSubmitAdjustment() {
  const description = document.getElementById('recon-adj-desc')?.value.trim();
  const entryDate = document.getElementById('recon-adj-date')?.value;
  if (!description || !entryDate) { showToast('Description and Posting Date are required.', 'error'); return; }
  const lines = [
    ..._reconAdjDebitLines.filter(l => l.account_id && l.amount).map(l => ({ account_id: l.account_id, line_type: 'debit', amount: l.amount })),
    ..._reconAdjCreditLines.filter(l => l.account_id && l.amount).map(l => ({ account_id: l.account_id, line_type: 'credit', amount: l.amount })),
  ];
  if (lines.length < 2) { showToast('Add at least one debit and one credit line.', 'error'); return; }
  const dateMsgEl = document.getElementById('recon-adj-date-msg');
  if (dateMsgEl) dateMsgEl.innerHTML = '';
  const res = await apiFetch(`${_RECON_API}/sessions/${_reconWsSessionId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry_date: entryDate, description, lines })
  });
  if (!res) return;
  if (res.ok) {
    const data = await res.json();
    document.getElementById('recon-adjust-modal-overlay')?.remove();
    showToast(`Adjustment posted (${data.jv_number}).`, 'success');
    await _reconWsRefresh();
  } else {
    const msg = await parseApiError(res);
    if (isPeriodLockError(res.status, msg)) showPeriodLockError(dateMsgEl, msg);
    else showToast('Error: ' + msg, 'error');
  }
}

// ── Complete / Reopen ────────────────────────────────────────────────────────
async function _reconWsComplete() {
  const blockersEl = document.getElementById('recon-ws-blockers');
  if (blockersEl) blockersEl.innerHTML = '';
  const res = await apiFetch(`${_RECON_API}/sessions/${_reconWsSessionId}/complete`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    showToast('Session completed.', 'success');
    await _reconWsRefresh();
  } else {
    // CompleteResult carries no blockers[] array — failure is a plain error
    // response with a .detail string, possibly listing several reasons
    // separated by "; " or newlines. Render each on its own line either way.
    const msg = await parseApiError(res);
    const reasons = msg.split(/;\s*|\n+/).map(s => s.trim()).filter(Boolean);
    if (blockersEl) {
      blockersEl.innerHTML = `<div style="background:#FBEAEA;border-left:3px solid var(--coral-500,#D94040);border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:0.85rem;color:#7a2020;">
        <div style="font-weight:600;margin-bottom:4px;">Cannot complete:</div>
        <ul style="margin:0;padding-left:18px;">${reasons.map(r => `<li>${_finEsc(r)}</li>`).join('')}</ul>
      </div>`;
    }
  }
}

async function _reconWsReopen() {
  if (!confirm("Reopen this session? You'll be able to unmatch lines, add adjustments, and re-complete. History is preserved.")) return;
  const res = await apiFetch(`${_RECON_API}/sessions/${_reconWsSessionId}/reopen`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    showToast('Session reopened.', 'success');
    await _reconWsRefresh();
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ==================== STATEMENT IMPORTS — sibling utility (§4.6) ====================
let _reconImpActiveTab = 'uploads';
const _RECON_IMPORT_STATUS_COLORS = {
  processing: '#8a6d00;background:#f5e6a8',
  complete:   '#1e7e34;background:#dcf3e2',
  failed:     '#c0392b;background:#fbdcdc',
};
function _reconImportStatusBadge(status) {
  const c = _RECON_IMPORT_STATUS_COLORS[status] || '#888;background:#eee';
  const [color, bg] = c.split(';background:');
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${color};background:${bg};">${_finEsc(label)}</span>`;
}

async function loadReconImportsView(container) {
  await _tpFlLoadBankAccounts();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Statement Imports</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Bank &amp; Cash &rsaquo; Statement Imports</div>
      </div>
      <div id="recon-imp-tabs" style="display:flex;gap:8px;margin-bottom:16px;"></div>
      <div id="recon-imp-tab-content"></div>
    </div>`;
  _reconImpRenderTabs();
  await _reconImpRenderTab();
}

function _reconImpRenderTabs() {
  const el = document.getElementById('recon-imp-tabs');
  if (!el) return;
  el.innerHTML = `
    <button class="${_reconImpActiveTab==='uploads'?'fin-btn-teal':'fin-btn-outline'}" onclick="_reconImpSetTab('uploads')">Uploads</button>
    <button class="${_reconImpActiveTab==='sync'?'fin-btn-teal':'fin-btn-outline'}" onclick="_reconImpSetTab('sync')">Co-op Sync</button>`;
}

async function _reconImpSetTab(tab) {
  _reconImpActiveTab = tab;
  _reconImpRenderTabs();
  await _reconImpRenderTab();
}

async function _reconImpRenderTab() {
  const el = document.getElementById('recon-imp-tab-content');
  if (!el) return;
  if (_reconImpActiveTab === 'sync') {
    _reconImpRenderSyncTab(el);
  } else {
    _reconImpRenderUploadsTab(el);
    await _reconImpReloadList();
  }
}

// ── Uploads tab ──────────────────────────────────────────────────────────────
function _reconImpRenderUploadsTab(el) {
  el.innerHTML = `
    <div class="fin-form-wrap" style="max-width:520px;">
      <div class="fin-form-group">
        <label class="fin-form-label">Bank Account <span class="fin-required">*</span></label>
        <select id="recon-imp-upload-bank" class="fin-form-select"><option value="">Please Select</option>${_reconBankAccountOptions('')}</select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Statement File <span class="fin-required">*</span></label>
        <input type="file" id="recon-imp-upload-file" accept=".xlsx,.csv">
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" id="recon-imp-upload-btn" onclick="_reconImpSubmitUpload()">Upload</button>
      </div>
      <div id="recon-imp-upload-status"></div>
    </div>
    <h3 style="font-size:0.92rem;margin:22px 0 10px;">Imports</h3>
    <div id="recon-imp-list"></div>`;
}

async function _reconImpSubmitUpload() {
  const bankAccountId = document.getElementById('recon-imp-upload-bank')?.value;
  const fileInput = document.getElementById('recon-imp-upload-file');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!bankAccountId || !file) { showToast('Bank Account and a statement file are required.', 'error'); return; }
  const statusEl = document.getElementById('recon-imp-upload-status');
  const btn = document.getElementById('recon-imp-upload-btn');
  btn.disabled = true;
  if (statusEl) statusEl.innerHTML = `<p style="color:#888;font-size:0.85rem;margin-top:10px;">Uploading&#8230;</p>`;
  const formData = new FormData();
  formData.append('bank_account_id', bankAccountId);
  formData.append('file', file);
  const res = await apiFetch(`${_RECON_API}/imports/upload`, { method: 'POST', body: formData });
  btn.disabled = false;
  if (!res) return;
  if (res.ok) {
    const data = await res.json();
    if (statusEl) statusEl.innerHTML = `<p style="color:#888;font-size:0.85rem;margin-top:10px;">Parsing&#8230;</p>`;
    fileInput.value = '';
    await _reconImpPollImport(data.import_id, data.row_count, data.warnings || []);
    await _reconImpReloadList();
  } else {
    if (statusEl) statusEl.innerHTML = '';
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function _reconImpPollImport(importId, rowCountHint, warnings) {
  const statusEl = document.getElementById('recon-imp-upload-status');
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await apiFetch(`${_RECON_API}/imports/${importId}`);
    if (!res || !res.ok) break;
    const data = await res.json();
    if (data.status === 'complete') {
      showToast(`Parsed ${data.row_count} line${data.row_count === 1 ? '' : 's'}.`, 'success');
      if (warnings.length && statusEl) {
        statusEl.innerHTML = `<div style="background:#FBF3D9;border-left:3px solid var(--gold-500,#C9A227);border-radius:6px;padding:8px 12px;margin-top:10px;font-size:12.5px;color:#5c4a00;">${warnings.map(w=>_finEsc(w)).join('<br>')}</div>`;
      } else if (statusEl) {
        statusEl.innerHTML = '';
      }
      return;
    }
    if (data.status === 'failed') {
      if (statusEl) statusEl.innerHTML = `<div style="background:#FBEAEA;border-left:3px solid var(--coral-500,#D94040);border-radius:6px;padding:8px 12px;margin-top:10px;font-size:12.5px;color:#7a2020;">${_finEsc(data.error_message || 'Parse failed.')}</div>`;
      return;
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  if (statusEl) statusEl.innerHTML = `<p style="color:#888;font-size:0.85rem;margin-top:10px;">Still processing &mdash; refresh the Imports list shortly.</p>`;
}

async function _reconImpReloadList() {
  const el = document.getElementById('recon-imp-list');
  if (!el) return;
  const res = await apiFetch(`${_RECON_API}/imports`);
  if (!res || !res.ok) { el.innerHTML = `<p style="color:#888;padding:14px;">Could not load imports.</p>`; return; }
  const list = _toArray(await res.json());
  if (!list.length) { el.innerHTML = `<p style="color:#aaa;padding:14px;font-size:0.85rem;">No imports yet.</p>`; return; }
  el.innerHTML = `
    <table class="fin-li-table">
      <thead><tr><th>Filename</th><th>Bank Account</th><th>Uploaded</th><th>Status</th><th>Lines</th><th></th></tr></thead>
      <tbody>
        ${list.map(imp => `<tr>
          <td>${_finEsc(imp.filename)}</td>
          <td>${_finEsc(_tpFlBankAccountName(imp.bank_account_id))}</td>
          <td>${_reconDate(imp.uploaded_at)}</td>
          <td>${_reconImportStatusBadge(imp.status)}${imp.status==='failed' && imp.error_message ? `<div style="font-size:11px;color:#c0392b;margin-top:2px;">${_finEsc(imp.error_message)}</div>` : ''}</td>
          <td>${imp.row_count ?? '—'}</td>
          <td><button class="fin-btn-outline" style="padding:3px 10px;font-size:0.78rem;" onclick="_reconImpDiscard(${imp.id})">Discard</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function _reconImpDiscard(importId) {
  if (!confirm('Discard this import? This is only allowed if no line from it has been matched yet.')) return;
  const res = await apiFetch(`${_RECON_API}/imports/${importId}/discard`, { method: 'POST' });
  if (!res) return;
  if (res.ok || res.status === 204) {
    showToast('Import discarded.', 'success');
    await _reconImpReloadList();
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ── Co-op Sync tab ───────────────────────────────────────────────────────────
// sync-coop takes bank_account_id as a required query param and no request
// body — the live schema has no from_date/to_date params at all, unlike the
// addendum's prose; it always pulls every unsynced Co-op IPN transaction for
// the account.
function _reconImpRenderSyncTab(el) {
  const coopGuess = (_tpFlBankAccounts || []).find(b => /coop|co-op/i.test(b.bank_name || ''));
  el.innerHTML = `
    <div class="fin-form-wrap" style="max-width:480px;">
      <div class="fin-form-group">
        <label class="fin-form-label">Bank Account <span class="fin-required">*</span></label>
        <select id="recon-sync-bank" class="fin-form-select"><option value="">Please Select</option>${_reconBankAccountOptions(coopGuess ? coopGuess.id : '')}</select>
      </div>
      <span style="font-size:0.78rem;color:#888;">Pulls every unsynced Co-op IPN transaction for this account. Safe to run repeatedly &mdash; duplicates are ignored.</span>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_reconImpSubmitSync()">Sync</button>
      </div>
      <div id="recon-sync-result"></div>
    </div>`;
}

async function _reconImpSubmitSync() {
  const bankAccountId = document.getElementById('recon-sync-bank')?.value;
  if (!bankAccountId) { showToast('Bank Account is required.', 'error'); return; }
  const res = await apiFetch(`${_RECON_API}/sync-coop?bank_account_id=${encodeURIComponent(bankAccountId)}`, { method: 'POST' });
  if (!res) return;
  const resultEl = document.getElementById('recon-sync-result');
  if (res.ok) {
    const data = await res.json();
    const msg = `Synced. Inserted ${data.inserted}, skipped ${data.skipped_duplicates} duplicate${data.skipped_duplicates===1?'':'s'}.`;
    showToast(msg, 'success');
    if (resultEl) resultEl.innerHTML = `<p style="color:#1e7e34;font-size:0.85rem;margin-top:10px;">${_finEsc(msg)}</p>`;
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

