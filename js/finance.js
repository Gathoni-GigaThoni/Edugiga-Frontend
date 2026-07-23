// ==================== FINANCE MODULE ====================

let _invPerPage = 10;
let _invPage    = 1;
let _invSearch  = '';
let _sfsFilteredStudents = [];  // persists Summarized Fee Statement results for back-navigation

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

function _finGenInvNo() {
  return 'INV-' + String(studentInvoicesData.length + 1).padStart(4, '0');
}

function _finToday() {
  return new Date().toISOString().split('T')[0];
}

// Build a transaction ledger from fee invoices (debits) + receipts (credits).
// draft/cancelled invoices are excluded — they haven't posted an AR charge.
async function _finBuildLedger(studentId) {
  try {
    const [invRes, rcptRes] = await Promise.all([
      apiFetch(`${API_BASE}/receivables/fee-invoices?student_id=${studentId}`),
      apiFetch(`${API_BASE}/receivables/receipts?student_id=${studentId}&voided=false`)
    ]);
    if (!invRes || !invRes.ok || !rcptRes || !rcptRes.ok) {
      showToast('Could not load full ledger data. Some entries may be missing.', 'error');
    }
    const invoices = invRes && invRes.ok ? await invRes.json() : [];
    const receipts = rcptRes && rcptRes.ok ? await rcptRes.json() : [];

    const rows = [];
    invoices
      .filter(inv => inv.status !== 'draft' && inv.status !== 'cancelled')
      .forEach(inv => rows.push({
        date:        inv.issue_date || '',
        term:        inv.term_id ? `Term ${inv.term_id}` : '-',
        description: `Fee Invoice ${inv.invoice_number || ''}`.trim(),
        debit:       parseFloat(inv.amount_due) || 0,
        credit:      0
      }));
    receipts.forEach(r => rows.push({
      date:        r.payment_date || '',
      term:        '-',
      description: `Payment (${r.payment_method || 'N/A'})`,
      debit:       0,
      credit:      parseFloat(r.amount) || 0
    }));

    rows.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
    let running = 0;
    rows.forEach(r => { running += r.debit - r.credit; r.balance = running; });
    return rows;
  } catch(_) {
    showToast('Failed to build ledger. Please try again.', 'error');
    return [];
  }
}

function _finFilterLedger(rows, startDate, endDate, asAt) {
  let out = rows;
  const effEnd = asAt || endDate;
  if (startDate) out = out.filter(r => r.date >= startDate);
  if (effEnd)    out = out.filter(r => r.date <= effEnd);
  return out;
}

function _finLedgerTable(rows) {
  let totalDebit = 0, totalCredit = 0;
  let bodyRows = '';
  if (rows.length === 0) {
    bodyRows = `<tr><td colspan="6" class="fin-empty">No transactions found.</td></tr>`;
  } else {
    rows.forEach(r => {
      totalDebit  += r.debit;
      totalCredit += r.credit;
      bodyRows += `<tr>
        <td>${_finEsc(r.date)}</td>
        <td>${_finEsc(r.term)}</td>
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
          <th>DATE</th><th>SESSION</th><th>DESCRIPTION</th>
          <th>DEBIT</th><th>CREDIT</th><th>BALANCE</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr class="fin-tfoot-total">
            <td colspan="3">Totals</td>
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

// ==================== CHANGE 1: STUDENT FEES STATUS ====================

async function loadStudentFeesStatusView(container) {
  await renderSplitView({
    container,
    moduleKey: 'finance.student_fees_status',
    title: 'Student Fees Status',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-student-fees-status'},
      {label:'Student Fees Status'}
    ],
    apiUrl: `${API_BASE}/students/`,
    searchFields: ['first_name','last_name','student_id'],
    col1Label: 'Student', col2Label: 'Class',
    col1: s => `${s.first_name||''} ${s.last_name||''}`.trim() || '—',
    col2: s => s.school_class_name || s.cohort || '—',
    rowLabel: s => `${s.first_name||''} ${s.last_name||''}`.trim() || '—',
    rowSub:   s => s.student_id || '',
    idKey: 'id',
    detailFields: [
      {label:'Student ID',  key:'student_id'},
      {label:'Name',        key:'first_name', fmt:(_,s)=>`${s.first_name||''} ${s.last_name||''}`.trim()},
      {label:'Class',       key:'school_class_name', fmt:v=>v||'—'},
      {label:'Cohort',      key:'cohort', fmt:v=>v||'—'},
      {label:'Reporting',   key:'is_reported', fmt:v=>v?'Reported':'Not Reported'},
      {label:'Status',      key:'is_active', fmt:v=>v?'Active':'Inactive'},
    ],
    onEdit: item => openFeesDetail(item.id),
  });
}

let _sfsPerPage = 10;
let _sfsSearch  = '';
let _sfsStudents = [];

async function _loadSfsTable() {
  const container = document.getElementById('sfs-table-container');
  if (!container) return;
  try {
    const res = await fetch(`${API_BASE}/students/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { container.innerHTML = '<p class="fin-error">Error loading students.</p>'; return; }
    _sfsStudents = await res.json();
    _renderSfsTable();
  } catch(_) { container.innerHTML = '<p class="fin-error">Failed to load students.</p>'; }
}

function _renderSfsTable() {
  const totalEl = document.getElementById('sfs-total-count');
  const filtered = _sfsSearch
    ? _sfsStudents.filter(s =>
        (`${s.first_name} ${s.last_name}`.toLowerCase().includes(_sfsSearch) ||
         (s.student_id || '').toLowerCase().includes(_sfsSearch)))
    : _sfsStudents;
  if (totalEl) totalEl.textContent = filtered.length;
  const page = filtered.slice(0, _sfsPerPage);

  let rows = '';
  if (page.length === 0) {
    rows = `<tr><td colspan="7" class="fin-empty">No records found.</td></tr>`;
  } else {
    page.forEach(s => {
      rows += `<tr>
        <td>${_finEsc(s.student_id || '')}</td>
        <td>${_finEsc((s.first_name || '') + ' ' + (s.last_name || ''))}</td>
        <td>${_finEsc(s.school_class_name || '-')}</td>
        <td>${_finEsc(s.cohort || '-')}</td>
        <td>${s.is_reported ? 'Reported' : 'Not Reported'}</td>
        <td>${s.is_active ? 'Active' : 'Inactive'}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinSfsDropdown(event,${s.id})">&#8230;</button>
            <div id="fin-sfs-dd-${s.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openFeesDetail(${s.id});return false;">&#128065; View Detail</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  const container = document.getElementById('sfs-table-container');
  if (!container) return;
  container.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>STUDENT ID</th><th>STUDENT NAME</th><th>CLASS</th><th>COHORT</th>
          <th>REPORTING STATUS</th><th>ACADEMIC STATUS</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function changeSfsPerPage(val) { _sfsPerPage = parseInt(val); _renderSfsTable(); }
function onSfsSearch(val)       { _sfsSearch = val.trim().toLowerCase(); _renderSfsTable(); }

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
    const res = await fetch(`${API_BASE}/students/${studentId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { main.innerHTML = '<p class="fin-error">Could not load student.</p>'; return; }
    const student = await res.json();
    const ledger  = await _finBuildLedger(studentId);
    _renderFeesDetailPage(main, student, ledger, studentId);
  } catch(_) { main.innerHTML = '<p class="fin-error">Failed to load detail.</p>'; }
}

function _renderFeesDetailPage(container, student, ledger, studentId) {
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
      <div class="fin-section-label">Transaction Ledger</div>
      <div id="fin-detail-ledger">${_finLedgerTable(ledger)}</div>
      <div id="fin-detail-date-store" data-student="${studentId}"
           data-ledger='${JSON.stringify(ledger).replace(/'/g,"&#39;")}' style="display:none;"></div>
    </div>
  `;
}

// ==================== CHANGE 2: SUMMARIZED FEE STATEMENT ====================

async function loadSummarizedFeeStatementView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Summarized Fee Statement</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Summarized Fee Statement</div>
      </div>

      <!-- Filter form -->
      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field">
            <label class="fin-filter-label">Term <span class="fin-required">*</span></label>
            <select id="sfs-stmt-term" class="fin-filter-select">
              <option value="">-- Select Term --</option>
            </select>
            <span class="fin-field-error" id="sfs-stmt-term-err"></span>
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Admission No.</label>
            <input type="text" id="sfs-stmt-admno" class="fin-filter-input" placeholder="">
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Stream</label>
            <input type="text" id="sfs-stmt-stream" class="fin-filter-input" placeholder="">
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Student Name</label>
            <input type="text" id="sfs-stmt-name" class="fin-filter-input" placeholder="">
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Class</label>
            <input type="text" id="sfs-stmt-class" class="fin-filter-input" placeholder="">
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Academic Records Status</label>
            <select id="sfs-stmt-status" class="fin-filter-select">
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div class="fin-filter-actions">
          <button class="fin-btn-teal" onclick="submitSummarizedFilter()">Submit</button>
          <button class="fin-btn-outline" onclick="clearSummarizedFilter()">Clear</button>
        </div>
      </div>

      <!-- Results -->
      <div id="sfs-stmt-results"></div>
    </div>
  `;
  populateTermDropdown('sfs-stmt-term');
}

async function submitSummarizedFilter() {
  const termVal = document.getElementById('sfs-stmt-term').value;
  const errEl   = document.getElementById('sfs-stmt-term-err');
  if (!termVal) { if (errEl) errEl.textContent = 'This field is required.'; return; }
  if (errEl) errEl.textContent = '';

  const admno      = (document.getElementById('sfs-stmt-admno').value   || '').trim().toLowerCase();
  const nameQ      = (document.getElementById('sfs-stmt-name').value     || '').trim().toLowerCase();
  const classQ     = (document.getElementById('sfs-stmt-class').value    || '').trim().toLowerCase();
  const statusQ    = document.getElementById('sfs-stmt-status').value;

  const resultsEl = document.getElementById('sfs-stmt-results');
  if (resultsEl) resultsEl.innerHTML = '<p class="fin-loading">Loading&#8230;</p>';

  try {
    const res = await apiFetch(`${API_BASE}/students/`);
    if (!res || !res.ok) { if (resultsEl) resultsEl.innerHTML = '<p class="fin-error">Failed to load students.</p>'; return; }
    let students = await res.json();

    if (admno)   students = students.filter(s => (s.student_id || '').toLowerCase().includes(admno));
    if (nameQ)   students = students.filter(s => (`${s.first_name} ${s.last_name}`).toLowerCase().includes(nameQ));
    if (classQ)  students = students.filter(s => (s.school_class_name || '').toLowerCase().includes(classQ));
    if (statusQ === 'active')   students = students.filter(s =>  s.is_active);
    if (statusQ === 'inactive') students = students.filter(s => !s.is_active);

    _sfsFilteredStudents = students;
    _renderSummarizedResults(resultsEl, students);
  } catch(_) {
    if (resultsEl) resultsEl.innerHTML = '<p class="fin-error">Failed to load results.</p>';
  }
}

function clearSummarizedFilter() {
  ['sfs-stmt-term','sfs-stmt-admno','sfs-stmt-stream','sfs-stmt-name','sfs-stmt-class','sfs-stmt-status']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const errEl = document.getElementById('sfs-stmt-term-err');
  if (errEl) errEl.textContent = '';
  const resultsEl = document.getElementById('sfs-stmt-results');
  if (resultsEl) resultsEl.innerHTML = '';
  _sfsFilteredStudents = [];
}

function _renderSummarizedResults(container, students) {
  if (!container) return;
  let rows = '';
  if (students.length === 0) {
    rows = `<tr><td colspan="10" class="fin-empty">No records found.</td></tr>`;
  } else {
    students.forEach(s => {
      rows += `<tr>
        <td>${_finEsc(s.student_id || '-')}</td>
        <td>${_finEsc((s.first_name||'') + ' ' + (s.last_name||''))}</td>
        <td>-</td>
        <td>${_finEsc(s.school_class_name || '-')}</td>
        <td>${_finEsc(s.currency || 'KES')}</td>
        <td>${s.is_active ? 'Active' : 'Inactive'}</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinStmtDropdown(event,${s.id})">&#8230;</button>
            <div id="fin-stmt-dd-${s.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openSummarizedStatementDetail(${s.id});return false;">&#128065; View Statement</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }
  container.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>ADMISSION NO.</th><th>NAME</th><th>CLASS</th>
          <th>CURRENCY</th><th>ACADEMIC STATUS</th><th>ARREARS/PREPAID</th>
          <th>FEES EXPECTED</th><th>FEE BALANCE (CURRENT)</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function toggleFinStmtDropdown(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="fin-stmt-dd-"]').forEach(d => {
    if (d.id !== `fin-stmt-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`fin-stmt-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

async function openSummarizedStatementDetail(studentId) {
  const main = document.getElementById('main-content');
  main.innerHTML = '<p class="fin-loading">Loading&#8230;</p>';
  try {
    const res = await fetch(`${API_BASE}/students/${studentId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { main.innerHTML = '<p class="fin-error">Could not load student.</p>'; return; }
    const student = await res.json();
    const ledger  = await _finBuildLedger(studentId);
    _renderSummarizedStatementPage(main, student, ledger, studentId);
  } catch(_) { main.innerHTML = '<p class="fin-error">Failed to load statement.</p>'; }
}

function _renderSummarizedStatementPage(container, student, ledger, studentId) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Summarized Fee Statement</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('summarized-fee-statement');return false;">Summarized Fee Statement</a>
          &rsaquo; Show
        </div>
      </div>

      <!-- Date range filter -->
      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field">
            <label class="fin-filter-label">Start Date</label>
            <input type="date" id="stmt-start-date" class="fin-filter-input">
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">End Date</label>
            <input type="date" id="stmt-end-date" class="fin-filter-input">
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">As At</label>
            <input type="date" id="stmt-as-at" class="fin-filter-input">
          </div>
        </div>
        <div class="fin-filter-actions">
          <button class="fin-btn-teal" onclick="submitStmtDateFilter(${studentId})">Submit</button>
          <button class="fin-btn-outline" onclick="clearStmtDateFilter(${studentId})">Clear</button>
        </div>
      </div>

      ${_finSendActionRow()}
      ${_finStudentInfoGrid(student)}
      <div class="fin-section-label">Transaction Ledger</div>
      <div id="fin-stmt-ledger">${_finLedgerTable(ledger)}</div>
      <div id="fin-stmt-ledger-store"
           data-student="${studentId}"
           data-ledger='${JSON.stringify(ledger).replace(/'/g,"&#39;")}'
           style="display:none;"></div>
    </div>
  `;
}

function submitStmtDateFilter(studentId) {
  const store  = document.getElementById('fin-stmt-ledger-store');
  if (!store) return;
  const ledger = JSON.parse(store.dataset.ledger || '[]');
  const start  = document.getElementById('stmt-start-date').value;
  const end    = document.getElementById('stmt-end-date').value;
  const asAt   = document.getElementById('stmt-as-at').value;
  const el     = document.getElementById('fin-stmt-ledger');
  if (el) el.innerHTML = _finLedgerTable(_finFilterLedger(ledger, start, end, asAt));
}

function clearStmtDateFilter(studentId) {
  ['stmt-start-date','stmt-end-date','stmt-as-at'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const store = document.getElementById('fin-stmt-ledger-store');
  if (!store) return;
  const ledger = JSON.parse(store.dataset.ledger || '[]');
  const el = document.getElementById('fin-stmt-ledger');
  if (el) el.innerHTML = _finLedgerTable(ledger);
}

// ==================== CHANGE 4: STUDENT INVOICES — LISTING ====================
// Rewritten against the real /invoices/ API (InvoiceRead: invoice_no, student_id,
// term_id, issue_date, due_date, status, notes, line_items[], total_amount,
// amount_paid, balance_due) — the old /finance/invoices/ endpoint and its
// camelCase fields (invoiceNo/studentName/session/cohort/...) never existed.

let _invStudentsCache = [], _invFeeItemsCache = [];
async function _invLoadLookups() {
  const [stuRes, fiRes, termsRes] = await Promise.all([
    apiFetch(`${API_BASE}/students/`),
    apiFetch(`${API_BASE}/receivables/setup/fee-items`),
    _stuTermsCache && _stuTermsCache.length ? Promise.resolve(null) : apiFetch(`${API_BASE}/terms/`),
  ]);
  _invStudentsCache = (stuRes && stuRes.ok) ? _toArray(await stuRes.json()) : [];
  _invFeeItemsCache = (fiRes && fiRes.ok) ? _toArray(await fiRes.json()) : [];
  if (termsRes && termsRes.ok) window._stuTermsCache = _toArray(await termsRes.json());
}
function _invStudentName(id) {
  const s = _invStudentsCache.find(s => String(s.id) === String(id));
  return s ? `${s.first_name||''} ${s.last_name||''}`.trim() : `#${id}`;
}
function _invTermName(id) {
  if (!id) return '-';
  const t = (window._stuTermsCache||[]).find(t => String(t.id) === String(id));
  return t ? (t.title || t.name || `Term ${id}`) : `Term ${id}`;
}
function _invFeeItemName(id) { return (_invFeeItemsCache.find(f => String(f.id) === String(id)) || {}).name || '-'; }

async function loadStudentInvoicesView(container) {
  await _invLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.student_finance',
    title: 'Student Invoices',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-student-invoices'},
      {label:'Invoices'}
    ],
    apiUrl: `${API_BASE}/receivables/fee-invoices`,
    searchFields: ['invoice_no'],
    col1Label: 'Invoice No', col2Label: 'Student',
    col1: inv => inv.invoice_no || `#${inv.id}`,
    col2: inv => _invStudentName(inv.student_id) || '—',
    rowLabel: inv => inv.invoice_no || `#${inv.id}`,
    rowSub:   inv => _invStudentName(inv.student_id),
    idKey: 'id',
    detailFields: [
      {label:'Invoice No', key:'invoice_no'},
      {label:'Student',    key:'student_id', fmt:v=>_invStudentName(v)},
      {label:'Term',       key:'term_id', fmt:v=>_invTermName(v)},
      {label:'Issue Date', key:'issue_date', fmt:v=>v||'—'},
      {label:'Due Date',   key:'due_date', fmt:v=>v||'—'},
      {label:'Amount',     key:'total_amount', fmt:v=>_finFmt(parseFloat(v)||0)},
      {label:'Status',     key:'status'},
    ],
    renderAdd: _finAddPlaceholder('Student Invoice', "loadView('fin-student-invoices-add')", 'Create a new legacy student invoice.'),
    onAdd:  () => loadView('fin-student-invoices-add'),
    onEdit: item => openInvoiceEdit(item.id),
  });
}

function _renderInvoiceListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Invoice</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Student Invoice &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="inv-per-page" onchange="changeInvPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===_invPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="inv-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV">&#128202;</button>
          <input type="text" class="fin-search-input" id="inv-search" placeholder="&#128269; Search&#8230;"
                 value="" oninput="onInvSearch(this.value)">
          <button class="fin-btn-cancel" onclick="openGenerateInvoiceModal()">Generate Invoice</button>
          <button class="fin-btn-cancel" onclick="openGenerateBulkInvoiceModal()">Generate Invoices (Bulk)</button>
          <button class="fin-btn-teal" onclick="loadView('fin-student-invoices-add')">+ Add</button>
        </div>
      </div>
      <div id="inv-table-container"></div>
      <div id="inv-pagination"></div>
    </div>
  `;
  _renderInvTable();
}

function _invFilteredData() {
  if (!_invSearch) return studentInvoicesData;
  const q = _invSearch;
  return studentInvoicesData.filter(inv =>
    (inv.invoice_no || '').toLowerCase().includes(q) ||
    _invStudentName(inv.student_id).toLowerCase().includes(q)
  );
}

function _renderInvTable() {
  const filtered = _invFilteredData();
  const totalEl  = document.getElementById('inv-total-count');
  if (totalEl) totalEl.textContent = filtered.length;

  const start  = (_invPage - 1) * _invPerPage;
  const paged  = filtered.slice(start, start + _invPerPage);
  const pages  = Math.max(1, Math.ceil(filtered.length / _invPerPage));

  let rows = '';
  if (paged.length === 0) {
    rows = `<tr><td colspan="8" class="fin-empty">No records found.</td></tr>`;
  } else {
    paged.forEach(inv => {
      rows += `<tr>
        <td>${_finEsc(inv.invoice_no || '')}</td>
        <td>${_finEsc(_invStudentName(inv.student_id))}</td>
        <td>${_finEsc(_invTermName(inv.term_id))}</td>
        <td>${_finEsc(inv.issue_date || '-')}</td>
        <td>${_finEsc(inv.due_date || '-')}</td>
        <td>${inv.total_amount ? _finFmt(parseFloat(inv.total_amount)) : '-'}</td>
        <td>${_finEsc(inv.status || '-')}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinInvDropdown(event,'${inv.id}')">&#8230;</button>
            <div id="fin-inv-dd-${inv.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openInvoiceEdit(${inv.id});return false;">&#9998; Edit</a>
              ${inv.status === 'draft' ? `<a href="#" onclick="issueInvoice(${inv.id});return false;">&#10003; Issue</a>` : ''}
              ${inv.status !== 'cancelled' ? `<a href="#" onclick="cancelInvoice(${inv.id});return false;">&#10005; Cancel</a>` : ''}
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  const tblEl = document.getElementById('inv-table-container');
  if (tblEl) tblEl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table" style="min-width:900px;">
        <thead><tr>
          <th>INVOICE NO.</th><th>STUDENT</th><th>TERM</th>
          <th>ISSUE DATE</th><th>DUE DATE</th><th>TOTAL AMOUNT</th><th>STATUS</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  // Pagination
  let pgBtns = '';
  for (let i = 1; i <= pages; i++) {
    pgBtns += `<button class="${i===_invPage?'fin-pg-active':''}" onclick="invGoPage(${i})">${i}</button>`;
  }
  const pgEl = document.getElementById('inv-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pgBtns}</div>`;
}

function changeInvPerPage(val)  { _invPerPage = parseInt(val); _invPage = 1; _renderInvTable(); }
function onInvSearch(val)       { _invSearch = val.trim().toLowerCase(); _invPage = 1; _renderInvTable(); }
function invGoPage(p)           { _invPage = p; _renderInvTable(); }

function toggleFinInvDropdown(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="fin-inv-dd-"]').forEach(d => {
    if (d.id !== `fin-inv-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`fin-inv-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

async function cancelInvoice(id) {
  if (!confirm('Cancel this invoice? This cannot be undone.')) return;
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/${id}/cancel`, { method: 'POST' });
  if (res && res.ok) { showToast('Invoice cancelled.', 'success'); loadView('fin-student-invoices'); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

async function issueInvoice(id) {
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/${id}/issue`, { method: 'POST' });
  if (res && res.ok) { showToast('Invoice issued.', 'success'); loadView('fin-student-invoices'); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ==================== INVOICE GENERATE / GENERATE-BULK ====================

function _finCloseModal() {
  const ov = document.getElementById('fin-gen-modal-overlay');
  if (ov) ov.remove();
}

async function _finLedgerAccountOptions() {
  const res = await apiFetch(`${API_BASE}/accounts/?is_active=true`);
  const accounts = (res && res.ok) ? _toArray(await res.json()) : [];
  return accounts.map(a => `<option value="${a.id}">${_finEsc(a.number)} — ${_finEsc(a.account_name || '')}</option>`).join('');
}

async function openGenerateInvoiceModal() {
  await _invLoadLookups();
  const accountOpts = await _finLedgerAccountOptions();
  const overlay = document.createElement('div');
  overlay.id = 'fin-gen-modal-overlay';
  overlay.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;max-width:480px;width:90%;">
      <h3 style="margin-top:0;">Generate Invoice</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Student <span class="fin-required">*</span></label>
        <select id="gen-inv-student" class="fin-form-select">
          <option value="">Please Select</option>
          ${_invStudentsCache.map(s => `<option value="${s.id}">${_finEsc(_invStudentName(s.id))} (${_finEsc(s.student_id||'')})</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Term <span class="fin-required">*</span></label>
        <select id="gen-inv-term" class="fin-form-select">
          <option value="">Please Select</option>
          ${(window._stuTermsCache||[]).map(t => `<option value="${t.id}">${_finEsc(t.title||t.name||'')}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Due Date <span class="fin-required">*</span></label>
        <input type="date" id="gen-inv-due-date" class="fin-form-input">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
        <select id="gen-inv-ledger" class="fin-form-select"><option value="">Please Select</option>${accountOpts}</select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Income Account <span class="fin-required">*</span></label>
        <select id="gen-inv-income-account" class="fin-form-select"><option value="">Please Select</option>${accountOpts}</select>
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="submitGenerateInvoice()">Generate</button>
        <button class="fin-btn-cancel" onclick="_finCloseModal()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function submitGenerateInvoice() {
  const studentId = document.getElementById('gen-inv-student').value;
  const termId = document.getElementById('gen-inv-term').value;
  const dueDate = document.getElementById('gen-inv-due-date').value;
  const ledgerId = document.getElementById('gen-inv-ledger').value;
  const incomeAccountId = document.getElementById('gen-inv-income-account').value;
  if (!studentId || !termId || !dueDate || !ledgerId || !incomeAccountId) {
    showToast('All fields are required.', 'error'); return;
  }
  const payload = {
    student_id: parseInt(studentId, 10),
    term_id: parseInt(termId, 10),
    due_date: dueDate,
    ledger_id: parseInt(ledgerId, 10),
    income_account_id: parseInt(incomeAccountId, 10),
  };
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    showToast('Invoice generated.', 'success');
    _finCloseModal();
    loadView('fin-student-invoices');
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function openGenerateBulkInvoiceModal() {
  const accountOpts = await _finLedgerAccountOptions();
  const overlay = document.createElement('div');
  overlay.id = 'fin-gen-modal-overlay';
  overlay.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;max-width:520px;width:90%;">
      <h3 style="margin-top:0;">Generate Invoices (Bulk)</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Term <span class="fin-required">*</span></label>
        <select id="gen-bulk-term" class="fin-form-select">
          <option value="">Please Select</option>
          ${(window._stuTermsCache||[]).map(t => `<option value="${t.id}">${_finEsc(t.title||t.name||'')}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Due Date <span class="fin-required">*</span></label>
        <input type="date" id="gen-bulk-due-date" class="fin-form-input">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
        <select id="gen-bulk-ledger" class="fin-form-select"><option value="">Please Select</option>${accountOpts}</select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Income Account <span class="fin-required">*</span></label>
        <select id="gen-bulk-income-account" class="fin-form-select"><option value="">Please Select</option>${accountOpts}</select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">
          <input type="checkbox" id="gen-bulk-all-students" checked onchange="document.getElementById('gen-bulk-student-ids-wrap').style.display=this.checked?'none':'block'">
          Process all active students
        </label>
      </div>
      <div class="fin-form-group" id="gen-bulk-student-ids-wrap" style="display:none;">
        <label class="fin-form-label">Student IDs (comma-separated)</label>
        <input type="text" id="gen-bulk-student-ids" class="fin-form-input" placeholder="e.g. 12,13,14">
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="submitGenerateBulkInvoice()">Generate</button>
        <button class="fin-btn-cancel" onclick="_finCloseModal()">Cancel</button>
      </div>
      <div id="gen-bulk-result" style="margin-top:14px;"></div>
    </div>`;
  document.body.appendChild(overlay);
}

async function submitGenerateBulkInvoice() {
  const termId = document.getElementById('gen-bulk-term').value;
  const dueDate = document.getElementById('gen-bulk-due-date').value;
  const ledgerId = document.getElementById('gen-bulk-ledger').value;
  const incomeAccountId = document.getElementById('gen-bulk-income-account').value;
  if (!termId || !dueDate || !ledgerId || !incomeAccountId) {
    showToast('Term, Due Date, Ledger, and Income Account are required.', 'error'); return;
  }
  const payload = {
    term_id: parseInt(termId, 10),
    due_date: dueDate,
    ledger_id: parseInt(ledgerId, 10),
    income_account_id: parseInt(incomeAccountId, 10),
  };
  const allStudents = document.getElementById('gen-bulk-all-students').checked;
  if (!allStudents) {
    const raw = document.getElementById('gen-bulk-student-ids').value.trim();
    payload.student_ids = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  }
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/generate-bulk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const resultEl = document.getElementById('gen-bulk-result');
  if (res && res.ok) {
    const result = await res.json().catch(() => null);
    if (resultEl && result) {
      resultEl.innerHTML = `
        <p style="color:#2e7d32;">Created: ${result.created?.length || 0}</p>
        <p style="color:#888;">Skipped (already invoiced): ${result.skipped?.length || 0}</p>
        ${result.errors?.length ? `<p style="color:#c0392b;">Errors: ${result.errors.length}</p>` : ''}`;
    }
    showToast('Bulk invoice generation complete.', 'success');
    loadView('fin-student-invoices');
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

function openInvoiceEdit(id) {
  document.querySelectorAll('[id^="fin-inv-dd-"]').forEach(d => d.style.display = 'none');
  const inv = studentInvoicesData.find(x => x.id === id);
  if (!inv) return;
  _renderInvoiceEditPage(document.getElementById('main-content'), inv);
}

// ==================== CHANGE 5: STUDENT INVOICES — ADD / EDIT ====================
// PATCH /invoices/{id} only accepts term_id/issue_date/due_date/status/notes
// (InvoiceUpdate) — line items can't be edited after creation on this backend,
// so Edit only exposes the header fields; line items are Add-only.

async function loadStudentInvoicesAddView(container) {
  await _invLoadLookups();
  window._invLineItems = [{ description: '', fee_item_id: '', quantity: 1, unit_price: '', discount_amount: 0 }];
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Student Invoice</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-student-invoices');return false;">Student Invoice</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:760px;">
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Student <span class="fin-required">*</span></label>
            <select id="inv-f-student" class="fin-form-select">
              <option value="">Please Select</option>
              ${_invStudentsCache.map(s => `<option value="${s.id}">${_finEsc(_invStudentName(s.id))} (${_finEsc(s.student_id||'')})</option>`).join('')}
            </select>
            <span class="fin-field-error" id="inv-f-student-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Term</label>
            <select id="inv-f-term" class="fin-form-select">
              <option value="">Please Select</option>
              ${(window._stuTermsCache||[]).map(t => `<option value="${t.id}">${_finEsc(t.title||t.name||'')}</option>`).join('')}
            </select>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Issue Date <span class="fin-required">*</span></label>
            <input type="date" id="inv-f-issue-date" class="fin-form-input" value="${_finToday()}">
            <span class="fin-field-error" id="inv-f-issue-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Due Date</label>
            <input type="date" id="inv-f-due-date" class="fin-form-input">
          </div>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Line Items</label>
          <table class="fin-li-table">
            <thead><tr><th>Description</th><th>Fee Item</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th></th></tr></thead>
            <tbody id="inv-li-body"></tbody>
          </table>
          <button class="fin-btn-li-add" onclick="addInvLineItem()">+ Add Line</button>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Notes</label>
          <textarea id="inv-f-notes" class="fin-form-textarea" rows="3"></textarea>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitInvoiceAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-student-invoices')">Cancel</button>
        </div>
      </div>
    </div>`;
  _renderInvLineItems();
}

function _renderInvLineItems() {
  const body = document.getElementById('inv-li-body');
  if (!body) return;
  body.innerHTML = window._invLineItems.map((li, i) => `
    <tr>
      <td><input type="text" class="fin-li-input" value="${_finEsc(li.description)}" oninput="_invLineItems[${i}].description=this.value"></td>
      <td><select class="fin-li-input" onchange="_invLineItems[${i}].fee_item_id=this.value">
        <option value="">Please Select</option>
        ${_invFeeItemsCache.map(f => `<option value="${f.id}" ${String(li.fee_item_id)===String(f.id)?'selected':''}>${_finEsc(f.name)}</option>`).join('')}
      </select></td>
      <td><input type="number" class="fin-li-input" value="${li.quantity}" min="1" oninput="_invLineItems[${i}].quantity=this.value"></td>
      <td><input type="number" class="fin-li-input" value="${li.unit_price}" step="0.01" oninput="_invLineItems[${i}].unit_price=this.value"></td>
      <td><input type="number" class="fin-li-input" value="${li.discount_amount}" step="0.01" oninput="_invLineItems[${i}].discount_amount=this.value"></td>
      <td><button class="fin-btn-li-rm" ${window._invLineItems.length<=1?'disabled':''} onclick="removeInvLineItem(${i})">&#10005;</button></td>
    </tr>`).join('');
}
function addInvLineItem() {
  window._invLineItems.push({ description: '', fee_item_id: '', quantity: 1, unit_price: '', discount_amount: 0 });
  _renderInvLineItems();
}
function removeInvLineItem(i) {
  if (window._invLineItems.length <= 1) return;
  window._invLineItems.splice(i, 1);
  _renderInvLineItems();
}

async function submitInvoiceAdd() {
  const studentId = document.getElementById('inv-f-student').value;
  const issueDate = document.getElementById('inv-f-issue-date').value;
  let valid = true;
  document.getElementById('inv-f-student-err').textContent = studentId ? '' : 'This field is required.'; if (!studentId) valid = false;
  document.getElementById('inv-f-issue-err').textContent   = issueDate ? '' : 'This field is required.'; if (!issueDate) valid = false;
  const lineItems = window._invLineItems
    .filter(li => li.description.trim() && li.unit_price !== '')
    .map(li => ({ description: li.description.trim(), fee_item_id: li.fee_item_id ? parseInt(li.fee_item_id, 10) : null, quantity: parseInt(li.quantity, 10) || 1, unit_price: parseFloat(li.unit_price) || 0, discount_amount: parseFloat(li.discount_amount) || 0 }));
  if (!valid) return;

  const payload = {
    student_id: parseInt(studentId, 10),
    term_id: document.getElementById('inv-f-term').value ? parseInt(document.getElementById('inv-f-term').value, 10) : null,
    issue_date: issueDate,
    due_date: document.getElementById('inv-f-due-date').value || null,
    notes: document.getElementById('inv-f-notes').value.trim() || null,
    line_items: lineItems,
  };
  try {
    const res = await apiFetch(`${API_BASE}/receivables/fee-invoices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) { showToast('Invoice created!', 'success'); loadView('fin-student-invoices'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (_) { showToast('Network error.', 'error'); }
}

function _renderInvoiceEditPage(container, inv) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Student Invoice</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-student-invoices');return false;">Student Invoice</a>
          &rsaquo; Edit
        </div>
      </div>

      <div class="fin-section-label" style="margin-bottom:14px;">Invoice Information</div>
      <div class="fin-info-grid" style="margin-bottom:20px;">
        <div class="fin-info-item"><span class="fin-info-label">Invoice No.</span><span class="fin-info-value">${_finEsc(inv.invoice_no||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Student</span><span class="fin-info-value">${_finEsc(_invStudentName(inv.student_id))}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Total Amount</span><span class="fin-info-value">${inv.total_amount ? _finFmt(parseFloat(inv.total_amount)) : '-'}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Balance Due</span><span class="fin-info-value">${inv.balance_due ? _finFmt(parseFloat(inv.balance_due)) : '-'}</span></div>
      </div>

      <!-- Line items can't be edited after creation on this backend (PATCH /invoices/{id}
           only accepts header fields) — shown read-only for reference. -->
      <div class="fin-section-label" style="margin-bottom:14px;">Line Items</div>
      <table class="fin-li-table" style="margin-bottom:24px;">
        <thead><tr><th>Description</th><th>Fee Item</th><th>Qty</th><th>Unit Price</th><th>Discount</th></tr></thead>
        <tbody>${(inv.line_items||[]).map(li => `<tr>
          <td>${_finEsc(li.description)}</td>
          <td>${_finEsc(li.fee_item_id ? _invFeeItemName(li.fee_item_id) : '-')}</td>
          <td>${_finEsc(li.quantity)}</td>
          <td>${_finFmt(parseFloat(li.unit_price)||0)}</td>
          <td>${_finFmt(parseFloat(li.discount_amount)||0)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="fin-empty">No line items.</td></tr>'}</tbody>
      </table>

      <div class="fin-section-label" style="margin-bottom:14px;">Edit Details</div>
      <div class="fin-form-wrap">
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Term</label>
            <select id="inv-edit-term" class="fin-form-select">
              <option value="">Please Select</option>
              ${(window._stuTermsCache||[]).map(t => `<option value="${t.id}" ${String(inv.term_id)===String(t.id)?'selected':''}>${_finEsc(t.title||t.name||'')}</option>`).join('')}
            </select>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Status</label>
            <select id="inv-edit-status" class="fin-form-select">
              ${['draft','issued','partially_paid','paid','cancelled','overdue'].map(s => `<option value="${s}" ${inv.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Issue Date</label>
            <input type="date" id="inv-edit-issue-date" class="fin-form-input" value="${inv.issue_date||''}">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Due Date</label>
            <input type="date" id="inv-edit-due-date" class="fin-form-input" value="${inv.due_date||''}">
          </div>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Notes</label>
          <textarea id="inv-edit-notes" class="fin-form-textarea" rows="3">${_finEsc(inv.notes||'')}</textarea>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitInvoiceEdit(${inv.id})">Update</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-student-invoices')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitInvoiceEdit(id) {
  const payload = {
    term_id: document.getElementById('inv-edit-term').value ? parseInt(document.getElementById('inv-edit-term').value, 10) : null,
    issue_date: document.getElementById('inv-edit-issue-date').value || null,
    due_date: document.getElementById('inv-edit-due-date').value || null,
    status: document.getElementById('inv-edit-status').value,
    notes: document.getElementById('inv-edit-notes').value || null,
  };
  try {
    const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) { showToast('Invoice updated!', 'success'); }
    else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-student-invoices');
}

// ==================== STUDENT FEE ASSIGNMENTS ====================

let _sfaData = [], _sfaFilterStudentId = '', _sfaFilterTermId = '';

async function loadStudentFeeAssignmentsView(container) {
  await _invLoadLookups();
  const _canAddSfa = canAdd('finance.student_finance');
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Fee Assignments</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Student Finance &rsaquo; Student Fee Assignments</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          <select id="sfa-filter-student" class="fin-filter-select" onchange="onSfaFilterChange()">
            <option value="">All Students</option>
            ${_invStudentsCache.map(s => `<option value="${s.id}">${_finEsc(_invStudentName(s.id))} (${_finEsc(s.student_id||'')})</option>`).join('')}
          </select>
          <select id="sfa-filter-term" class="fin-filter-select" onchange="onSfaFilterChange()" style="margin-left:8px;">
            <option value="">All Terms</option>
            ${(window._stuTermsCache||[]).map(t => `<option value="${t.id}">${_finEsc(t.title||t.name||'')}</option>`).join('')}
          </select>
        </div>
        <div class="fin-controls-right">
          ${_canAddSfa ? `<button class="fin-btn-teal" onclick="openCreateFeeAssignmentModal()">+ Add Assignment</button>` : ''}
        </div>
      </div>
      <div id="sfa-table-container"></div>
    </div>`;
  await _sfaLoad();
}

async function onSfaFilterChange() {
  _sfaFilterStudentId = document.getElementById('sfa-filter-student')?.value || '';
  _sfaFilterTermId    = document.getElementById('sfa-filter-term')?.value || '';
  await _sfaLoad();
}

async function _sfaLoad() {
  const params = new URLSearchParams();
  if (_sfaFilterStudentId) params.set('student_id', _sfaFilterStudentId);
  if (_sfaFilterTermId)    params.set('term_id', _sfaFilterTermId);
  const qs = params.toString();
  const res = await apiFetch(`${API_BASE}/receivables/student-fee-assignments/${qs ? '?' + qs : ''}`);
  _sfaData = (res && res.ok) ? _toArray(await res.json()) : [];
  _sfaRenderTable();
}

function _sfaRenderTable() {
  const el = document.getElementById('sfa-table-container');
  if (!el) return;
  const _canDeleteSfa = canDelete('finance.student_finance');
  const rows = _sfaData.length === 0
    ? `<tr><td colspan="7" class="fin-empty">No records found.</td></tr>`
    : _sfaData.map(a => `<tr>
        <td>${_finEsc(_invStudentName(a.student_id))}</td>
        <td>${_finEsc(_invTermName(a.term_id))}</td>
        <td>${a.fee_schedule_id}</td>
        <td>${a.override_amount != null ? _finFmt(parseFloat(a.override_amount)) : '-'}</td>
        <td>${a.created_from_previous_term ? 'Yes' : 'No'}</td>
        <td>${_finEsc(a.source_type || '-')}</td>
        <td class="fin-action-cell">${_canDeleteSfa ? `<a href="#" onclick="deleteFeeAssignment(${a.id});return false;">&#128465; Delete</a>` : ''}</td>
      </tr>`).join('');
  el.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>STUDENT</th><th>TERM</th><th>FEE SCHEDULE</th><th>OVERRIDE AMOUNT</th>
          <th>FROM PREV. TERM</th><th>SOURCE</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function deleteFeeAssignment(id) {
  if (!confirm('Delete this fee assignment?')) return;
  const res = await apiFetch(`${API_BASE}/receivables/student-fee-assignments/${id}`, { method: 'DELETE' });
  if (res && res.ok) { showToast('Assignment deleted.', 'success'); await _sfaLoad(); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

async function openCreateFeeAssignmentModal() {
  const schedRes = await apiFetch(`${API_BASE}/receivables/setup/fee-schedules`);
  const schedules = (schedRes && schedRes.ok) ? _toArray(await schedRes.json()) : [];
  const overlay = document.createElement('div');
  overlay.id = 'fin-gen-modal-overlay';
  overlay.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;max-width:480px;width:90%;">
      <h3 style="margin-top:0;">Add Student Fee Assignment</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Student <span class="fin-required">*</span></label>
        <select id="sfa-add-student" class="fin-form-select">
          <option value="">Please Select</option>
          ${_invStudentsCache.map(s => `<option value="${s.id}">${_finEsc(_invStudentName(s.id))} (${_finEsc(s.student_id||'')})</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Term <span class="fin-required">*</span></label>
        <select id="sfa-add-term" class="fin-form-select">
          <option value="">Please Select</option>
          ${(window._stuTermsCache||[]).map(t => `<option value="${t.id}">${_finEsc(t.title||t.name||'')}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Fee Schedule <span class="fin-required">*</span></label>
        <select id="sfa-add-schedule" class="fin-form-select">
          <option value="">Please Select</option>
          ${schedules.map(s => `<option value="${s.id}">${_finEsc(s.name || `Schedule ${s.id}`)}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Override Amount</label>
        <input type="number" id="sfa-add-override" class="fin-form-input" step="0.01" placeholder="Optional">
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="submitCreateFeeAssignment()">Submit</button>
        <button class="fin-btn-cancel" onclick="_finCloseModal()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function submitCreateFeeAssignment() {
  const studentId = document.getElementById('sfa-add-student').value;
  const termId = document.getElementById('sfa-add-term').value;
  const scheduleId = document.getElementById('sfa-add-schedule').value;
  if (!studentId || !termId || !scheduleId) { showToast('Student, Term, and Fee Schedule are required.', 'error'); return; }
  const overrideRaw = document.getElementById('sfa-add-override').value;
  const payload = {
    student_id: parseInt(studentId, 10),
    term_id: parseInt(termId, 10),
    fee_schedule_id: parseInt(scheduleId, 10),
    override_amount: overrideRaw === '' ? null : parseFloat(overrideRaw),
  };
  const res = await apiFetch(`${API_BASE}/receivables/student-fee-assignments/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    showToast('Fee assignment created.', 'success');
    _finCloseModal();
    await _sfaLoad();
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ==================== CHANGE 6: STUDENT BULK INVOICING ====================
// studentClassesData (the old data source here) is a global declared in config.js
// but never populated anywhere in the app — this view's class list never actually
// loaded. Classes don't carry session/start/end dates at all (SchoolClassRead has
// no such fields — that's term data); rewritten to resolve the selected Term's
// academic_year_id, then load real classes for that year via GET /classes/.
// POST /finance/invoices/bulk's body has no fixed schema (additionalProperties:
// true) — term_id/invoice_date/class_ids is a best-effort guess matching the
// original shape with session_id renamed to term_id; confirm against the backend
// if bulk invoicing doesn't behave as expected.

let _bulkClassesData = [];

async function loadStudentBulkInvoicingView(container) {
  const _canAddBulkInv = canAdd('finance.student_finance');
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Student Bulk Invoicing</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Student Bulk Invoicing &rsaquo; Add</div>
      </div>

      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field">
            <label class="fin-filter-label">Term <span class="fin-required">*</span></label>
            <select id="bulk-term" class="fin-filter-select" onchange="onBulkTermChange(this.value)">
              <option value="">Please Select</option>
            </select>
            <span class="fin-field-error" id="bulk-term-err"></span>
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Invoicing Date <span class="fin-required">*</span></label>
            <input type="date" id="bulk-inv-date" class="fin-filter-input">
            <span class="fin-field-error" id="bulk-date-err"></span>
          </div>
        </div>
      </div>

      <!-- Class table -->
      <div class="fin-section-label">List of Classes</div>
      <div id="bulk-classes-container">
        <div class="fin-table-wrap">
          <table class="fin-table" id="bulk-class-table">
            <thead>
              <tr>
                <th style="width:42px;">
                  <input type="checkbox" class="fin-cb" id="bulk-select-all"
                         onchange="toggleBulkSelectAll(this)">
                </th>
                <th>CODE</th><th>NAME</th><th>LEVEL</th>
              </tr>
            </thead>
            <tbody id="bulk-class-tbody">
              <tr><td colspan="4" class="fin-empty">Select a term to load classes.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="fin-form-actions" style="margin-top:20px;">
        ${_canAddBulkInv ? `<button class="fin-btn-teal" onclick="submitBulkInvoicing()">Submit</button>` : ''}
        <button class="fin-btn-cancel" onclick="loadView('student-finance')">Cancel</button>
      </div>
      <div id="bulk-status"></div>
    </div>
  `;
  await populateTermDropdown('bulk-term');
}

async function onBulkTermChange(termId) {
  const tbody = document.getElementById('bulk-class-tbody');
  if (!tbody) return;
  if (!termId) {
    tbody.innerHTML = `<tr><td colspan="4" class="fin-empty">Select a term to load classes.</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr><td colspan="4" class="fin-loading">Loading classes&#8230;</td></tr>`;
  try {
    const termRes = await apiFetch(`${API_BASE}/terms/${termId}`);
    const term = termRes && termRes.ok ? await termRes.json() : null;
    if (!term || !term.academic_year_id) { tbody.innerHTML = `<tr><td colspan="4" class="fin-empty">Could not resolve this term's academic year.</td></tr>`; return; }
    const res = await apiFetch(`${API_BASE}/classes/?academic_year_id=${term.academic_year_id}`);
    _bulkClassesData = (res && res.ok) ? _toArray(await res.json()) : [];
  } catch (_) { _bulkClassesData = []; }
  if (_bulkClassesData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="fin-empty">No classes found for this term's academic year.</td></tr>`;
    return;
  }
  tbody.innerHTML = _bulkClassesData.map(c => `
    <tr>
      <td><input type="checkbox" class="fin-cb bulk-class-cb" value="${c.id}"></td>
      <td>${_finEsc(c.class_code || '-')}</td>
      <td>${_finEsc(c.name)}</td>
      <td>${_finEsc(c.level_name || '-')}</td>
    </tr>
  `).join('');
  const all = document.getElementById('bulk-select-all');
  if (all) all.checked = false;
}

function toggleBulkSelectAll(cb) {
  document.querySelectorAll('.bulk-class-cb').forEach(c => { c.checked = cb.checked; });
}

async function submitBulkInvoicing() {
  const termEl = document.getElementById('bulk-term');
  const dateEl = document.getElementById('bulk-inv-date');
  let valid = true;

  const termErrEl = document.getElementById('bulk-term-err');
  const dateErrEl = document.getElementById('bulk-date-err');

  if (!termEl.value) { if (termErrEl) termErrEl.textContent = 'This field is required.'; valid = false; }
  else               { if (termErrEl) termErrEl.textContent = ''; }
  if (!dateEl.value) { if (dateErrEl) dateErrEl.textContent = 'This field is required.'; valid = false; }
  else               { if (dateErrEl) dateErrEl.textContent = ''; }
  if (!valid) return;

  const checked = Array.from(document.querySelectorAll('.bulk-class-cb:checked'));
  if (checked.length === 0) {
    const statusEl = document.getElementById('bulk-status');
    if (statusEl) statusEl.innerHTML = '<div class="fin-toast fin-toast-error">Please select at least one class.</div>';
    return;
  }

  const classIds = checked.map(cb => cb.value);
  const payload  = { term_id: termEl.value, invoice_date: dateEl.value, class_ids: classIds };
  try {
    const res = await apiFetch(`${API_BASE}/finance/invoices/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) { showToast('Bulk invoices created!', 'success'); }
    else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-student-invoices');
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
function openFinPayablesDropdown() {
  const dd = document.getElementById('fin-payables-dropdown');
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
    const res = await apiFetch(`${API_BASE}/students/?search=${encodeURIComponent(val.trim())}`);
    const list = (res && res.ok) ? await res.json() : [];
    if (!list.length) {
      dd.innerHTML = '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
      dd.style.display = 'block';
      return;
    }
    dd.innerHTML = list.slice(0, 10).map(s => {
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
    const res = await apiFetch(`${API_BASE}/students/?search=${encodeURIComponent(val.trim())}`);
    const list = (res && res.ok) ? await res.json() : [];
    dd.innerHTML = list.length ? list.slice(0, 10).map(s => {
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

// ==================== CHANGE 3: FEE SET-UP PER CLASS ====================
// Backend models this as one FeeSchedule row per (fee_item, class, term) — not a
// single multi-field document with session/department/study-mode — so the
// "line items" UX below issues one POST per line item, each scoped to the
// chosen Class + Term (verified against the live API's OpenAPI schema).

let _feeSetupPerPage = 10, _feeSetupPage = 1, _feeSetupSearch = '';
let _fsAcademicYearsCache = null, _fsClassesCache = null, _fsTermsCache = null, _fsFeeItemsCache = null;

async function _fsLoadLookups() {
  if (!_fsAcademicYearsCache) {
    const res = await fetch(`${API_BASE}/academic-years/`, { headers: { Authorization: `Bearer ${token}` } });
    _fsAcademicYearsCache = res.ok ? await res.json() : [];
  }
  if (!_fsClassesCache) {
    const res = await fetch(`${API_BASE}/classes/`, { headers: { Authorization: `Bearer ${token}` } });
    _fsClassesCache = res.ok ? await res.json() : [];
  }
  if (!_fsTermsCache) {
    const res = await fetch(`${API_BASE}/terms`, { headers: { Authorization: `Bearer ${token}` } });
    _fsTermsCache = res.ok ? await res.json() : [];
  }
  if (!_fsFeeItemsCache) {
    const res = await fetch(`${API_BASE}/receivables/setup/fee-items`, { headers: { Authorization: `Bearer ${token}` } });
    _fsFeeItemsCache = res.ok ? await res.json() : [];
  }
}

async function loadFeeSetupPerClassView(container) {
  await _fsLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.student_finance',
    title: 'Class Fee Setup',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-fee-setup-per-class'},
      {label:'Class Fee'}
    ],
    apiUrl: `${API_BASE}/finance/fee-setup-per-class`,
    searchFields: [],
    col1Label: 'Class', col2Label: 'Fee Item',
    col1: f => _fsClassName(f.class_id),
    col2: f => _fsFeeItemName(f.fee_item_id),
    rowLabel: f => _fsClassName(f.class_id),
    rowSub:   f => _fsFeeItemName(f.fee_item_id),
    idKey: 'id',
    detailFields: [
      {label:'Class',          key:'class_id', fmt:v=>_fsClassName(v)},
      {label:'Academic Year',  key:'class_id', fmt:v=>_fsAcademicYearName(v)},
      {label:'Term',           key:'term_id', fmt:v=>_fsTermName(v)},
      {label:'Fee Item',       key:'fee_item_id', fmt:v=>_fsFeeItemName(v)},
      {label:'Amount',         key:'amount', fmt:v=>_finFmt(parseFloat(v)||0)},
    ],
    renderAdd: _finAddPlaceholder('Class Fee Setup', "renderFeeSetupAddPage(document.getElementById('main-content'))", 'Set up per-class fee line items.'),
    onAdd:  () => renderFeeSetupAddPage(document.getElementById('main-content')),
    onEdit: item => openFeeSetupDetail(item.id),
  });

  // restore the "Generate Fees for Term" trigger in case it's needed
  // (old UI had it, but it's now accessible via Add)
  const triggerTermSel = document.getElementById('fs-trigger-term');
  if (triggerTermSel) triggerTermSel.innerHTML = '<option value="">Please Select</option>' +
    (_fsTermsCache||[]).map(t=>`<option value="${t.id}">${_finEsc(t.title||'')}</option>`).join('');
}

function _renderFeeSetupListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Class Fee</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Class Fee &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="fs-per-page" onchange="changeFsPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===_feeSetupPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="fs-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-teal" onclick="renderFeeSetupAddPage(document.getElementById('main-content'))">+ Add</button>
          <button class="fin-btn-outline" onclick="toggleFsTriggerBar()">Generate Fees for Term</button>
          <input type="text" class="fin-search-input" placeholder="&#128269; Search&#8230;" oninput="onFsSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="fs-trigger-bar" style="display:none;margin-bottom:14px;padding:12px 16px;background:#f4f1ea;border-radius:6px;align-items:center;gap:10px;">
        <label style="font-weight:600;font-size:0.85rem;">Term</label>
        <select id="fs-trigger-term" class="fin-form-select" style="max-width:240px;">
          <option value="">Please Select</option>
          ${(_fsTermsCache||[]).map(t=>`<option value="${t.id}">${_finEsc(t.title||'')}</option>`).join('')}
        </select>
        <button class="fin-btn-teal" onclick="submitTriggerTermlyFees()">Generate</button>
        <span id="fs-trigger-status" style="font-size:0.85rem;"></span>
      </div>
      <div id="fs-table-container"></div>
      <div id="fs-pagination"></div>
    </div>`;
  _renderFeeSetupTable();
}

function toggleFsTriggerBar() {
  const bar = document.getElementById('fs-trigger-bar');
  if (bar) bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
}

// Bulk action — converts every Fee Schedule (Class Fee Setup) row for this term into
// per-student StudentFee charges on the backend. This is what actually generates the
// figures a student's Fee Statement (View Fee Statement, on the Student profile) shows.
async function submitTriggerTermlyFees() {
  const termId = document.getElementById('fs-trigger-term').value;
  const statusEl = document.getElementById('fs-trigger-status');
  if (!termId) { if (statusEl) statusEl.textContent = 'Please select a term.'; return; }
  if (statusEl) statusEl.textContent = 'Generating…';
  try {
    const res = await fetch(`${API_BASE}/finance/trigger-termly-fees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ term_id: parseInt(termId) })
    });
    if (res.ok) { showToast('Fees generated for the selected term!', 'success'); if (statusEl) statusEl.textContent = ''; }
    else { showToast('Error: ' + await parseApiError(res), 'error'); if (statusEl) statusEl.textContent = ''; }
  } catch (_) { showToast('Network error.', 'error'); if (statusEl) statusEl.textContent = ''; }
}

function _fsClassName(classId) {
  const c = (_fsClassesCache||[]).find(c=>String(c.id)===String(classId));
  return c ? (c.name||'') : (classId ? `#${classId}` : '-');
}
function _fsTermName(termId) {
  const t = (_fsTermsCache||[]).find(t=>String(t.id)===String(termId));
  return t ? (t.title||'') : (termId ? `#${termId}` : '-');
}
function _fsAcademicYearName(classId) {
  const c = (_fsClassesCache||[]).find(c=>String(c.id)===String(classId));
  if (!c) return '-';
  const ay = (_fsAcademicYearsCache||[]).find(y=>String(y.id)===String(c.academic_year_id));
  return ay ? (ay.title||'') : '-';
}
function _fsFeeItemName(feeItemId) {
  const fi = (_fsFeeItemsCache||[]).find(f=>String(f.id)===String(feeItemId));
  return fi ? (fi.name||'') : `#${feeItemId}`;
}

function _fsFiltered() {
  if (!_feeSetupSearch) return feeSetupPerClassData;
  const q = _feeSetupSearch;
  return feeSetupPerClassData.filter(f =>
    _fsClassName(f.class_id).toLowerCase().includes(q) ||
    _fsTermName(f.term_id).toLowerCase().includes(q) ||
    _fsFeeItemName(f.fee_item_id).toLowerCase().includes(q));
}

function _renderFeeSetupTable() {
  const filtered = _fsFiltered();
  const totalEl  = document.getElementById('fs-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_feeSetupPage-1)*_feeSetupPerPage;
  const paged = filtered.slice(start, start+_feeSetupPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length/_feeSetupPerPage));

  let rows = paged.length===0
    ? `<tr><td colspan="6" class="fin-empty">No records found.</td></tr>`
    : paged.map(f=>`<tr>
        <td>${_finEsc(_fsClassName(f.class_id))}</td>
        <td>${_finEsc(_fsAcademicYearName(f.class_id))}</td>
        <td>${_finEsc(_fsTermName(f.term_id))}</td>
        <td>${_finEsc(_fsFeeItemName(f.fee_item_id))}</td>
        <td>${_finFmt(parseFloat(f.amount)||0)}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinFeeSetupDropdown(event,'${f.id}')">&#8230;</button>
            <div id="fin-fee-setup-dd-${f.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openFeeSetupDetail('${f.id}');return false;">&#128065; View Detail</a>
              <a href="#" onclick="window.print();return false;">&#128438; Print</a>
            </div>
          </div>
        </td>
      </tr>`).join('');

  const el = document.getElementById('fs-table-container');
  if (el) el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>CLASS</th><th>ACADEMIC YEAR</th><th>TERM</th>
        <th>ACCOUNT VOTE/HEAD</th><th>AMOUNT</th><th>ACTION</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  let pg=''; for(let i=1;i<=pages;i++) pg+=`<button class="${i===_feeSetupPage?'fin-pg-active':''}" onclick="fsGoPage(${i})">${i}</button>`;
  const pgEl=document.getElementById('fs-pagination');
  if(pgEl) pgEl.innerHTML=`<div class="fin-pagination">${pg}</div>`;
}

function toggleFinFeeSetupDropdown(e,id) {
  e.stopPropagation();
  document.querySelectorAll('[id^="fin-fee-setup-dd-"]').forEach(d=>{ if(d.id!==`fin-fee-setup-dd-${id}`) d.style.display='none'; });
  const dd=document.getElementById(`fin-fee-setup-dd-${id}`);
  if(dd) dd.style.display=dd.style.display==='none'?'block':'none';
}
function changeFsPerPage(v){ _feeSetupPerPage=parseInt(v); _feeSetupPage=1; _renderFeeSetupTable(); }
function onFsSearch(v)     { _feeSetupSearch=v.trim().toLowerCase(); _feeSetupPage=1; _renderFeeSetupTable(); }
function fsGoPage(p)       { _feeSetupPage=p; _renderFeeSetupTable(); }

function openFeeSetupDetail(id) {
  document.querySelectorAll('[id^="fin-fee-setup-dd-"]').forEach(d=>d.style.display='none');
  const fee = feeSetupPerClassData.find(f=>String(f.id)===String(id));
  if (!fee) return;
  _renderFeeSetupDetailPage(document.getElementById('main-content'), fee);
}

function _renderFeeSetupDetailPage(container, fee) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Class Fee</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-fee-setup-per-class');return false;">Class Fee</a>
          &rsaquo; Show
        </div>
      </div>
      <div class="fin-send-row">
        <button class="fin-btn-teal" onclick="window.print()">Print</button>
      </div>
      <div class="fin-info-grid">
        <div class="fin-info-item"><span class="fin-info-label">Class</span><span class="fin-info-value">${_finEsc(_fsClassName(fee.class_id))}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Academic Year</span><span class="fin-info-value">${_finEsc(_fsAcademicYearName(fee.class_id))}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Term</span><span class="fin-info-value">${_finEsc(_fsTermName(fee.term_id))}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Account Vote/Head</span><span class="fin-info-value">${_finEsc(_fsFeeItemName(fee.fee_item_id))}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Amount</span><span class="fin-info-value">${_finFmt(parseFloat(fee.amount)||0)}</span></div>
      </div>
      <div class="fin-form-actions" style="margin-top:20px;">
        <button class="fin-btn-cancel" onclick="loadView('fin-fee-setup-per-class')">Back</button>
      </div>
    </div>`;
}

async function renderFeeSetupAddPage(container) {
  await _fsLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Class Fee</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-fee-setup-per-class');return false;">Class Fee</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:700px;">
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Academic Year <span class="fin-required">*</span></label>
            <select id="fs-acad-year" class="fin-form-select" onchange="onFsAcademicYearChange(this.value)">
              <option value="">Please Select</option>
              ${(_fsAcademicYearsCache||[]).map(y=>`<option value="${y.id}">${_finEsc(y.title||'')}</option>`).join('')}
            </select>
            <span class="fin-field-error" id="fs-ay-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Class Name <span class="fin-required">*</span></label>
            <select id="fs-class-name" class="fin-form-select" onchange="onFsClassChange(this.value)">
              <option value="">Select Academic Year first</option>
            </select>
            <span class="fin-field-error" id="fs-class-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Class Code</label>
            <input type="text" id="fs-class-code" class="fin-form-input" readonly>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Term <span class="fin-required">*</span></label>
            <select id="fs-term" class="fin-form-select">
              <option value="">Please Select</option>
              ${(_fsTermsCache||[]).map(t=>`<option value="${t.id}">${_finEsc(t.title||'')}</option>`).join('')}
            </select>
            <span class="fin-field-error" id="fs-term-err"></span>
          </div>
        </div>
        <div class="fin-section-label">Line Items</div>
        <div class="fin-table-wrap" style="margin-bottom:10px;">
          <table class="fin-table"><thead><tr><th>SN</th><th>ACCOUNT VOTE/HEAD</th><th>AMOUNT</th><th></th></tr></thead>
          <tbody id="fs-li-body"></tbody></table>
        </div>
        <button class="fin-btn-li-add" onclick="addFsLineItem()" style="margin-bottom:18px;">+ Add Item</button>
        <div class="fin-form-group">
          <label class="fin-form-label">Notes</label>
          <textarea id="fs-notes" class="fin-form-textarea" rows="3"></textarea>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitFeeSetupAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-fee-setup-per-class')">Cancel</button>
        </div>
      </div>
    </div>`;
}

// Class options must be scoped to the chosen Academic Year, so Academic Year has
// to be picked first even though Class Name is the visually-primary field.
function onFsAcademicYearChange(yearId) {
  const classSel = document.getElementById('fs-class-name');
  if (!classSel) return;
  document.getElementById('fs-class-code').value = '';
  if (!yearId) { classSel.innerHTML = '<option value="">Select Academic Year first</option>'; return; }
  const classes = (_fsClassesCache||[]).filter(c=>String(c.academic_year_id)===String(yearId));
  classSel.innerHTML = '<option value="">Please Select</option>' +
    classes.map(c=>`<option value="${c.id}">${_finEsc(c.name||'')}</option>`).join('');
}

function onFsClassChange(classId) {
  const cls = (_fsClassesCache||[]).find(c=>String(c.id)===String(classId));
  const codeEl = document.getElementById('fs-class-code');
  if (codeEl) codeEl.value = cls ? (cls.class_code||'') : '';
}

let _fsLiCount = 0;
function addFsLineItem() {
  const body = document.getElementById('fs-li-body');
  if (!body) return;
  const t = Date.now() + (_fsLiCount++);
  const sn = body.querySelectorAll('tr').length + 1;
  const acctOpts = (_fsFeeItemsCache||[]).map(f=>`<option value="${f.id}">${_finEsc(f.name||'')}</option>`).join('');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${sn}</td>
    <td><select class="fin-li-input" id="fs-li-acct-${t}"><option value="">Please Select</option>${acctOpts}</select></td>
    <td><input type="number" class="fin-li-input" id="fs-li-amt-${t}" placeholder="0.00" step="0.01"></td>
    <td><button class="fin-btn-li-rm" onclick="this.closest('tr').remove()">&#10005;</button></td>`;
  body.appendChild(tr);
}

async function submitFeeSetupAdd() {
  const yearId  = document.getElementById('fs-acad-year').value;
  const classId = document.getElementById('fs-class-name').value;
  const termId  = document.getElementById('fs-term').value;
  let valid=true;
  document.getElementById('fs-ay-err').textContent    = yearId  ? '' : 'This field is required.'; if(!yearId)  valid=false;
  document.getElementById('fs-class-err').textContent = classId ? '' : 'This field is required.'; if(!classId) valid=false;
  document.getElementById('fs-term-err').textContent  = termId  ? '' : 'This field is required.'; if(!termId)  valid=false;
  if (!valid) return;

  const lineItems = [];
  document.querySelectorAll('#fs-li-body tr').forEach(tr=>{
    const acctEl = tr.querySelector('[id^="fs-li-acct-"]');
    const amtEl  = tr.querySelector('[id^="fs-li-amt-"]');
    if (acctEl && acctEl.value) lineItems.push({ fee_item_id: parseInt(acctEl.value), amount: parseFloat(amtEl?.value)||0 });
  });
  if (!lineItems.length) { showToast('Add at least one line item.', 'error'); return; }

  // Backend requires exactly one of academic_level_id/class_id/student_id — this form
  // is scoped to a specific Class, so class_id alone is the right one to send.
  let okCount = 0, lastErr = '';
  for (const li of lineItems) {
    const payload = {
      fee_item_id: li.fee_item_id, amount: li.amount,
      class_id: parseInt(classId), term_id: parseInt(termId),
    };
    try {
      const res = await apiFetch(`${API_BASE}/finance/fee-setup-per-class`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res && res.ok) okCount++;
      else if (res) { lastErr = await parseApiError(res); }
    } catch (_) { lastErr = 'Network error.'; }
  }
  if (okCount === lineItems.length) showToast('Fee setup saved!', 'success');
  else showToast(`Saved ${okCount}/${lineItems.length} items. Error: ${lastErr}`, 'error');
  loadView('fin-fee-setup-per-class');
}

// ==================== CHANGE 5: RECEIVE PAYMENTS ====================

let _rcvPayPerPage = 10, _rcvPayPage = 1, _rcvPaySearch = '';

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
      {label:'Payment Method',key:'payment_method', fmt:v=>v||'—'},
      {label:'Reference',     key:'reference', fmt:v=>v||'—'},
      {label:'Date',          key:'payment_date', fmt:v=>v?v.split('T')[0]:'—'},
      {label:'Amount',        key:'amount', fmt:v=>_finFmt(parseFloat(v)||0)},
      {label:'Voided',        key:'voided', fmt:v=>v?'Yes':'No'},
    ],
    renderAdd: _finInfoPlaceholder('Payments are recorded from a Student Invoice — open the invoice and click Record Payment.', "loadView('fin-student-invoices')", 'Go to Student Invoices'),
    onAdd: () => {
      showToast('Payments are recorded from a Student Invoice — open the invoice and click Record Payment.', 'info');
      loadView('fin-student-invoices');
    },
    detailActions: p => {
      window._rcvReceiptCache = window._rcvReceiptCache || {};
      window._rcvReceiptCache[p.id] = p;
      return `<button class="btn" onclick="openReceiptPdf(${p.id})">&#128438; Print Receipt</button>`;
    },
  });
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
  const methodLabel  = (receipt.payment_method || '-').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

// The 48-value account_subtype axis (2026-07-21 addendum §1.2). One copy —
// the Add/Edit form picker, the Reclassify dialog, and the Fixed Asset
// Register's Asset Class picker all read from this same constant so a
// diverging local copy can never send a value the backend rejects.
// Asset's first 7 entries are exactly the "non-current" subset (order
// matters — Fixed Assets slices this array for its Asset Class dropdown).
const ACCOUNT_SUBTYPES_BY_TYPE = {
  Asset: [
    'Land and Buildings', 'Motor Vehicles', 'Furniture and Fittings',
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
  ],
  Expense: [
    'Cost of Uniforms Sold', 'Teaching Staff Costs', 'Non-Teaching Staff Costs',
    'Teaching Supplies', 'Meals and Kitchen', 'Transport Operating',
    'Repairs and Maintenance', 'Utilities', 'Rent and Rates', 'Insurance and Licences',
    'Staff Welfare', 'Depreciation', 'Marketing and Admissions', 'Professional Fees',
    'Office Admin', 'Financial Charge', 'Tax Expense',
  ],
};
// Non-current asset subtypes only — the seven that can hold Fixed Assets (§5).
const ACCOUNT_SUBTYPES_NON_CURRENT_ASSET = ACCOUNT_SUBTYPES_BY_TYPE.Asset.slice(0, 7);

function _coaSubtypeOptions(accountType, selected) {
  const opts = ACCOUNT_SUBTYPES_BY_TYPE[accountType] || [];
  const placeholder = accountType ? 'Please Select' : 'Select Account Type first';
  return `<option value="">${placeholder}</option>` +
    opts.map(s => `<option value="${s}" ${selected===s?'selected':''}>${s}</option>`).join('');
}
function _coaRepopulateSubtype(accountType) {
  const sel = document.getElementById('coa-f-subtype');
  if (sel) sel.innerHTML = _coaSubtypeOptions(accountType, null);
}

function _coaFormHtml(acct, opts = {}) {
  const parentId = acct?.parent_id;
  const parentOpts = chartOfAccountsData
    .filter(a=> !acct || a.id!==acct.id)
    .map(a=>`<option value="${a.id}" ${String(parentId)===String(a.id)?'selected':''}>${_finEsc(a.account_name||'')}</option>`).join('');
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
    </div>`;
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
    wallet_role:            document.getElementById('coa-f-wallet-role')?.value || null
  };
  const res = await apiFetch(`${API_BASE}/accounts/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (res && res.ok) { showToast('Account updated!', 'success'); }
  else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  loadView(returnView);
}

// ── Reclassification + Classification History (§2, Super_Admin only) ───────
// No account detail *page* exists for CoA (split-view's own detail pane is
// the closest thing) — these hang off cfg.detailActions the same way
// Payables' Approve/Void buttons hang off its detail pane.
function _coaDetailActions(item) {
  const superAdminActions = _isSuperAdmin() ? `
    <button class="fin-btn-outline" onclick="_coaOpenReclassifyModal(${item.id})">Reclassify</button>
    <button class="fin-btn-outline" onclick="_coaOpenHistoryModal(${item.id})">Classification History</button>` : '';
  return `${superAdminActions}
    <button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_coaDeleteAccount(${item.id})">Delete</button>`;
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
        Reclassifying will re-render historical Balance Sheet and P&amp;L reports under the new classification. Prior classifications remain visible in the history panel below.
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

async function renderFeeItemAddPage(container, item) {
  if (!_fiAccountsCache.length) await _fiLoadLookups();
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
            ${_fiAccountsCache.map(a=>`<option value="${a.id}" ${String(item?.account_id)===String(a.id)?'selected':''}>${_finEsc(a.number)} — ${_finEsc(a.account_name||'')}</option>`).join('')}
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
function _fiPayload() {
  return {
    code: document.getElementById('fi-f-code').value,
    name: (document.getElementById('fi-f-name').value||'').trim(),
    category: document.getElementById('fi-f-category').value,
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
    if (res && res.ok) { showToast('Fee item added!', 'success'); _fsFeeItemsCache = null; } // invalidate so Class Fee Setup picks it up
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
    if (res && res.ok) { showToast('Fee item updated!', 'success'); _fsFeeItemsCache = null; }
    else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-fee-items');
}

async function deleteFeeItem(id) {
  if (!confirm('Delete this fee item? This cannot be undone.')) return;
  try {
    const res = await apiFetch(`${API_BASE}/receivables/setup/fee-items/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showToast('Fee item deleted.', 'success'); _fsFeeItemsCache = null; loadView('fin-fee-items'); }
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
  const acctOpts = _giAccountsCache.map(a=>
    `<option value="${a.id}" ${String(item?.account_id)===String(a.id)?'selected':''}>${_finEsc(a.number||'')} — ${_finEsc(a.account_name||'')}</option>`).join('');
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

// ── Import Statement wizard (3 steps: upload → review → confirm) ──────────
let _tpWiz = null;
function _tpNewWizState() {
  return { step: 1, batchId: null, transactions: [], matchedCount: 0, unmatchedCount: 0, totalAmount: 0,
    totalCharges: 0, legacyFormat: false, importMode: 'supplier', payrollRunId: null,
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
  const body = document.getElementById('tp-wiz-body');
  body.innerHTML = '<p class="sa-loading">Loading column contract&#8230;</p>';
  let cols = { required_columns: [], optional_columns: [], notes: '' };
  try {
    const res = await apiFetch(`${_TP_BASE}/import/expected-columns`);
    if (res && res.ok) cols = await res.json();
  } catch (_) {}
  const colRows = (list, required) => (list || []).map(c => `
    <tr><td>${_finEsc(c.header || c.name || '')}</td><td>${required ? 'Required' : 'Optional'}</td><td>${_finEsc(c.description || '')}</td><td>${_finEsc(c.example ?? '')}</td></tr>`).join('');
  const notesHtml = cols.notes ? `
    <div style="background:#eef3fb;border-radius:8px;padding:12px 16px;margin:12px 0;font-size:0.85rem;color:#2c3e50;white-space:pre-wrap;">${_finEsc(cols.notes)}</div>` : '';
  body.innerHTML = `
    <div class="fin-form-wrap">
      <div class="fin-section-label">Expected File Format</div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Column</th><th>Required</th><th>Description</th><th>Example</th></tr></thead>
        <tbody>${colRows(cols.required_columns, true)}${colRows(cols.optional_columns, false)}</tbody>
      </table></div>
      ${notesHtml}
      <div class="fin-form-group" style="margin-top:16px;">
        <label class="fin-form-label">Mode</label>
        <div style="display:flex;gap:20px;margin-top:6px;">
          <label><input type="radio" name="tp-import-mode" value="supplier" checked onchange="_tpToggleImportMode()"> Supplier payments</label>
          <label><input type="radio" name="tp-import-mode" value="payroll" onchange="_tpToggleImportMode()"> Payroll return statement</label>
        </div>
        <div id="tp-import-payroll-run-wrap" style="display:none;margin-top:10px;max-width:340px;">
          <label class="fin-form-label">Payroll Run <span class="fin-required">*</span></label>
          <select id="tp-import-payroll-run" class="fin-form-select"><option value="">Please Select</option></select>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;align-items:center;">
        <button class="fin-btn-outline" onclick="_tpDownloadTemplate()">Download Template</button>
        <input type="file" id="tp-upload-file" accept=".csv,.xlsx,.xls" style="display:none;" onchange="_tpUploadFile(this)">
        <button class="fin-btn-teal" onclick="document.getElementById('tp-upload-file').click()">Choose File &amp; Upload</button>
        <span id="tp-upload-status" style="color:#888;font-size:0.85rem;"></span>
      </div>
    </div>`;
  await _tpLoadPayrollRunOptions();
}

function _tpToggleImportMode() {
  const mode = (document.querySelector('input[name="tp-import-mode"]:checked') || {}).value || 'supplier';
  const wrap = document.getElementById('tp-import-payroll-run-wrap');
  if (wrap) wrap.style.display = mode === 'payroll' ? 'block' : 'none';
}

async function _tpLoadPayrollRunOptions() {
  const sel = document.getElementById('tp-import-payroll-run');
  if (!sel) return;
  try {
    const [awaitingRes, paidRes] = await Promise.all([
      apiFetch(`${API_BASE}/payroll/runs/?status=awaiting_payment`),
      apiFetch(`${API_BASE}/payroll/runs/?status=paid`),
    ]);
    const awaiting = (awaitingRes && awaitingRes.ok) ? _toArray(await awaitingRes.json()) : [];
    const paid     = (paidRes && paidRes.ok)     ? _toArray(await paidRes.json())     : [];
    const runs = [...awaiting, ...paid];
    sel.innerHTML = '<option value="">Please Select</option>' +
      runs.map(r => `<option value="${r.id}">${_finEsc(r.run_number || ('Run #' + r.id))}</option>`).join('');
  } catch (_) {}
}

async function _tpDownloadTemplate() {
  const res = await apiFetch(`${_TP_BASE}/import/template`);
  if (res && res.ok) {
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tendepay-import-template.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
  } else if (res) showToast('Could not download template: ' + await parseApiError(res), 'error');
}

async function _tpUploadFile(input) {
  const file = input.files[0];
  if (!file) return;
  const mode = (document.querySelector('input[name="tp-import-mode"]:checked') || {}).value || 'supplier';
  const payrollRunId = document.getElementById('tp-import-payroll-run')?.value || '';
  if (mode === 'payroll' && !payrollRunId) { showToast('Payroll Run is required for a payroll return statement.', 'error'); return; }
  const statusEl = document.getElementById('tp-upload-status');
  if (statusEl) statusEl.textContent = 'Uploading…';
  const fd = new FormData();
  fd.append('file', file);
  fd.append('import_mode', mode);
  if (mode === 'payroll') fd.append('payroll_run_id', payrollRunId);
  const res = await apiFetch(`${_TP_BASE}/import`, { method: 'POST', body: fd });
  if (!res || !res.ok) {
    if (statusEl) statusEl.textContent = '';
    showToast('Upload failed: ' + (res ? await parseApiError(res) : 'network error'), 'error');
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
  _tpWiz.payrollRunId = data.payroll_run_id ?? (mode === 'payroll' ? parseInt(payrollRunId, 10) : null);
  _tpWiz.skippedRows = data.skipped_rows || [];
  _tpWiz.alreadyImported = data.already_imported || [];
  _tpWiz.voucherMap = await _tpFetchVoucherMap();
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
  const rows = _tpWiz.transactions.map(t => {
    let matchCell;
    if (t.amount_mismatch) {
      matchCell = `<div style="background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:8px 10px;border-radius:6px;font-size:0.78rem;">
        Amount mismatch — statement says ${_tpMoney(t.amount)}, voucher ${_finEsc(t.voucher_ref || '')} expects ${_tpMoney(t.expected_amount ?? t.expected)}. Resolve before confirming.
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
        <option value="">-- Pick voucher --</option>
        ${t.possible_voucher_ids.map(id => `<option value="${id}" ${_tpWiz.voucherPicks[t.id] === id ? 'selected' : ''}>${_finEsc(_tpWiz.voucherMap[id] || ('Voucher #' + id))}</option>`).join('')}
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
        <thead><tr><th>Tendepay Ref</th><th>Wallet</th><th>Payee</th><th>Service/Account</th><th>Amount</th><th>Charge</th><th>Date</th><th>Receipt</th><th>Voucher Ref</th><th>Match</th></tr></thead>
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
    </div>`;
}

async function _tpConfirmImport() {
  const ledgerId = parseInt(document.getElementById('tp-confirm-ledger').value, 10);
  const costCenterId = parseInt(document.getElementById('tp-confirm-cost-center').value, 10);
  const unmatchedAction = (document.querySelector('input[name="tp-unmatched-action"]:checked') || {}).value || 'suspense';
  if (!ledgerId || !costCenterId) { showToast('Ledger and Cost Center are required.', 'error'); return; }

  const isPayroll = _tpWiz.importMode === 'payroll';
  const confirmedMatches = [];
  _tpWiz.transactions.forEach(t => {
    if (t.amount_mismatch) return; // cannot auto-tick; operator must resolve the mismatch first
    if (t.matched_voucher_id != null && _tpWiz.confirmedIds[t.id]) {
      confirmedMatches.push(isPayroll
        ? { tendepay_transaction_id: t.id, payroll_run_line_id: t.matched_voucher_id, match_method: 'auto' }
        : { tendepay_transaction_id: t.id, voucher_id: t.matched_voucher_id, match_method: 'auto' });
    } else if (_tpWiz.voucherPicks[t.id]) {
      confirmedMatches.push(isPayroll
        ? { tendepay_transaction_id: t.id, payroll_run_line_id: _tpWiz.voucherPicks[t.id], match_method: 'manual' }
        : { tendepay_transaction_id: t.id, voucher_id: _tpWiz.voucherPicks[t.id], match_method: 'manual' });
    }
  });

  const res = await apiFetch(`${_TP_BASE}/import/${_tpWiz.batchId}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed_matches: confirmedMatches, unmatched_action: unmatchedAction, ledger_id: ledgerId, cost_center_id: costCenterId }),
  });
  if (res && res.ok) {
    const data = await res.json();
    const jvNumbers = (data.posted_journal_entries || []).map(j => (typeof j === 'object' ? (j.jv_number || j.id) : j)).join(', ');
    let msg = `Batch confirmed. ${confirmedMatches.length} vouchers paid, ${(data.posted_journal_entries || []).length} journal entries posted.${jvNumbers ? ' (' + jvNumbers + ')' : ''}`;
    if (data.charges_journal_entry_id) msg += ` Transaction Charges JE #${data.charges_journal_entry_id}.`;
    showToast(msg, 'success');
    loadView('tendepay-import-history');
  } else if (res && res.status === 409) {
    showToast('This batch has already been confirmed.', 'error');
    loadView('tendepay-import-history');
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
    const label = e.tendepay_transaction_id ?? e.payroll_run_line_id ?? e.row ?? '';
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
    const jvNumbers = (data.posted_journal_entries || []).map(j => (typeof j === 'object' ? (j.jv_number || j.id) : j)).join(', ');
    let msg = `Batch confirmed. ${confirmedMatches.length} vouchers paid, ${(data.posted_journal_entries || []).length} journal entries posted.${jvNumbers ? ' (' + jvNumbers + ')' : ''}`;
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
  const res = await apiFetch(`${_TP_BASE}/fund-loads/upload/template`);
  if (res && res.ok) {
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fund_loads_upload_template.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
  } else if (res) showToast('Could not download template: ' + await parseApiError(res), 'error');
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
          <select id="tp-recon-tx-account" class="fin-filter-select"><option value="">All</option>${_pvAccountOptions()}</select>
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
      {label:'Narration',                          key:'narration',            fmt:v=>v||'—'},
    ],
  });
}

