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

function _finGenInvNo() {
  return 'INV-' + String(studentInvoicesData.length + 1).padStart(4, '0');
}

function _finToday() {
  return new Date().toISOString().split('T')[0];
}

// Build a transaction ledger from student-fees (debits) + payments (credits)
async function _finBuildLedger(studentId) {
  try {
    const [feesRes, pymtRes] = await Promise.all([
      fetch(`${API_BASE}/finance/student-fees/${studentId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/finance/payments/student/${studentId}`, { headers: { Authorization: `Bearer ${token}` } })
    ]);
    if (!feesRes.ok || !pymtRes.ok) {
      showToast('Could not load full ledger data. Some entries may be missing.', 'error');
    }
    const fees     = feesRes.ok ? await feesRes.json() : [];
    const payments = pymtRes.ok ? await pymtRes.json() : [];

    const rows = [];
    fees.forEach(f => rows.push({
      date:        f.date_charged || '',
      term:        f.term_id ? `Term ${f.term_id}` : '-',
      description: 'Fee Charge',
      debit:       parseFloat(f.amount) || 0,
      credit:      0
    }));
    payments.forEach(p => rows.push({
      date:        p.payment_date || '',
      term:        '-',
      description: `Payment (${p.payment_method || 'N/A'})`,
      debit:       0,
      credit:      parseFloat(p.amount) || 0
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
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Fees Status</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Student Fees Status &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="sfs-per-page" onchange="changeSfsPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}">${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="sfs-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" id="sfs-search" placeholder="&#128269; Search&#8230;"
                 oninput="onSfsSearch(this.value)">
        </div>
      </div>
      <div id="sfs-table-container"><p class="fin-loading">Loading&#8230;</p></div>
    </div>
  `;
  await _loadSfsTable();
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
    apiFetch(`${API_BASE}/finance/fee-items`),
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
  _invPage   = 1;
  _invSearch = '';
  _renderInvoiceListPage(container);
  await _invLoadLookups();
  try {
    const res = await apiFetch(`${API_BASE}/receivables/fee-invoices`);
    if (res && res.ok) { studentInvoicesData.length = 0; _toArray(await res.json()).forEach(r => studentInvoicesData.push(r)); }
    else if (res) showToast('Could not load invoices: ' + await parseApiError(res), 'error');
  } catch (_) {}
  _renderInvTable();
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
          <button class="fin-btn-teal" onclick="openCreateFeeAssignmentModal()">+ Add Assignment</button>
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
  const rows = _sfaData.length === 0
    ? `<tr><td colspan="7" class="fin-empty">No records found.</td></tr>`
    : _sfaData.map(a => `<tr>
        <td>${_finEsc(_invStudentName(a.student_id))}</td>
        <td>${_finEsc(_invTermName(a.term_id))}</td>
        <td>${a.fee_schedule_id}</td>
        <td>${a.override_amount != null ? _finFmt(parseFloat(a.override_amount)) : '-'}</td>
        <td>${a.created_from_previous_term ? 'Yes' : 'No'}</td>
        <td>${_finEsc(a.source_type || '-')}</td>
        <td class="fin-action-cell"><a href="#" onclick="deleteFeeAssignment(${a.id});return false;">&#128465; Delete</a></td>
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
        <button class="fin-btn-teal" onclick="submitBulkInvoicing()">Submit</button>
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

async function _loadDiscountAccountDropdown() {
  const select = document.getElementById('disc-account');
  if (!select) return;

  let accounts = [];
  const res = await apiFetch(`${API_BASE}/finance/fee-accounts/`);
  if (res && res.ok) {
    const all = await res.json().catch(() => []);
    accounts = _toArray(all).filter(a => {
      const isDiscount  = a.is_discount_account ?? a.isDiscountAccount;
      const deactivated = a.is_deactivated ?? a.isDeactivated;
      return isDiscount === true && !deactivated;
    });
  } else if (res) {
    showToast('Failed to load discount accounts.', 'error');
  }

  accounts.forEach(acct => {
    const opt = document.createElement('option');
    opt.value = acct.id;
    opt.textContent = acct.account_name || acct.accountName || acct.item_name || acct.itemName || `Account ${acct.id}`;
    select.appendChild(opt);
  });

  if (accounts.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'fin-field-hint fin-field-hint-warning';
    hint.textContent = 'No discount accounts found. Please create a discount account under Chart of Accounts before configuring sibling discounts.';
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
let _sgNewPicks = [null, null, null]; // up to 3 {id, student_id, name}

async function loadSiblingGroupsView(container) {
  _sgFoundGroup = null;
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
              <div id="sg-lookup-student-dd" class="fin-action-dropdown" style="display:none;max-height:200px;overflow-y:auto;position:absolute;top:100%;left:0;width:100%;z-index:100;"></div>
            </div>
            <button class="fin-btn-teal" onclick="sgLookupById()">Find</button>
          </div>
        </div>
        <div id="sg-lookup-result" style="margin-top:16px;"></div>
        <div class="fin-form-actions" style="margin-top:24px;">
          <button class="fin-btn-teal" onclick="loadView('finance-sibling-groups-add')">Create New Sibling Group</button>
        </div>
      </div>
    </div>`;
}

async function sgLookupStudentSearch(val) {
  const dd = document.getElementById('sg-lookup-student-dd');
  if (!dd) return;
  if (!val.trim()) { dd.style.display = 'none'; return; }
  const res = await apiFetch(`${API_BASE}/students/?search=${encodeURIComponent(val)}`);
  const list = (res && res.ok) ? await res.json() : [];
  if (!list.length) {
    dd.innerHTML = '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
    dd.style.display = 'block';
    return;
  }
  dd.innerHTML = list.slice(0, 10).map(s =>
    `<a href="#" onclick="sgLookupStudentSelect(${s.id},${s.sibling_group_id ?? 'null'},'${_finEsc(s.student_id||'')} — ${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())}');return false;">
       ${_finEsc(s.student_id||'')} — ${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())}
     </a>`
  ).join('');
  dd.style.display = 'block';
}

function sgLookupStudentSelect(studentId, siblingGroupId, label) {
  const inp = document.getElementById('sg-lookup-student');
  if (inp) inp.value = label;
  const dd = document.getElementById('sg-lookup-student-dd');
  if (dd) dd.style.display = 'none';
  if (!siblingGroupId) {
    document.getElementById('sg-lookup-result').innerHTML =
      '<p style="color:#c0392b;font-size:0.88rem;">This student is not in a sibling group yet.</p>';
    return;
  }
  document.getElementById('sg-lookup-id').value = siblingGroupId;
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

  resultEl.innerHTML = `
    <div style="background:#f9fafb;border:1px solid #e0e0e0;border-radius:6px;padding:16px;">
      <p><strong>Group #${group.id}</strong> — ${_finEsc(group.name || '')}</p>
      <p>Member student IDs: ${(group.student_ids || []).join(', ') || '—'}</p>
      <div style="display:flex;gap:10px;align-items:flex-start;margin-top:10px;">
        <div style="position:relative;flex:1;max-width:360px;">
          <input id="sg-add-student" class="fin-search-input" style="width:100%!important" placeholder="Add a student to this group&#8230;" oninput="sgAddStudentSearch(this.value)" autocomplete="off">
          <div id="sg-add-student-dd" class="fin-action-dropdown" style="display:none;max-height:200px;overflow-y:auto;position:absolute;top:100%;left:0;width:100%;z-index:100;"></div>
        </div>
      </div>
    </div>`;
}

let _sgAddStudentId = null;

async function sgAddStudentSearch(val) {
  const dd = document.getElementById('sg-add-student-dd');
  if (!dd) return;
  if (!val.trim()) { dd.style.display = 'none'; return; }
  const res = await apiFetch(`${API_BASE}/students/?search=${encodeURIComponent(val)}`);
  const list = (res && res.ok) ? await res.json() : [];
  dd.innerHTML = list.length ? list.slice(0, 10).map(s =>
    `<a href="#" onclick="sgAddStudentSelect(${s.id},'${_finEsc(s.student_id||'')} — ${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())}');return false;">
       ${_finEsc(s.student_id||'')} — ${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())}
     </a>`
  ).join('') : '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
  dd.style.display = 'block';
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
    `<a href="#" onclick="sgPickSelect(${slot},${s.id},'${_finEsc(s.student_id||'')} — ${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())}');return false;">
       ${_finEsc(s.student_id||'')} — ${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())}
     </a>`
  ).join('') : '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
  dd.style.display = 'block';
}

function sgPickSelect(slot, studentId, label) {
  _sgNewPicks[slot] = studentId;
  const inp = document.getElementById(`sg-add-pick-${slot}`);
  if (inp) inp.value = label;
  const dd = document.getElementById(`sg-add-pick-${slot}-dd`);
  if (dd) dd.style.display = 'none';
}

async function submitSiblingGroupCreate() {
  const studentIds = _sgNewPicks.filter(id => id != null);
  if (studentIds.length < 1) { showToast('Select at least one student.', 'error'); return; }
  if (studentIds.length > 3) { showToast('A sibling group can have at most 3 students.', 'error'); return; }

  const name = document.getElementById('sg-add-name')?.value.trim();
  const payload = { student_ids: studentIds };
  if (name) payload.name = name;

  const res = await apiFetch(`${API_BASE}/receivables/sibling-groups/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res && res.ok) {
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
  _invAdjPage = 1; _invAdjSearch = '';
  _renderInvAdjListPage(container);
  try {
    const res = await fetch(`${API_BASE}/finance/invoice-adjustments/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { studentInvoiceAdjustmentsData.length = 0; _toArray(await res.json()).forEach(r => studentInvoiceAdjustmentsData.push(r)); }
  } catch (_) {}
  _renderInvAdjTable();
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
  _sponAllocPage = 1; _sponAllocSearch = '';
  _renderSponAllocListPage(container);
  try {
    const res = await fetch(`${API_BASE}/finance/sponsorship-allocations/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { sponsorshipAllocationsData.length = 0; _toArray(await res.json()).forEach(r => sponsorshipAllocationsData.push(r)); }
  } catch (_) {}
  _renderSponAllocTable();
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
    const res = await fetch(`${API_BASE}/finance/fee-items`, { headers: { Authorization: `Bearer ${token}` } });
    _fsFeeItemsCache = res.ok ? await res.json() : [];
  }
}

async function loadFeeSetupPerClassView(container) {
  _feeSetupPage = 1; _feeSetupSearch = '';
  _renderFeeSetupListPage(container);
  try {
    const res = await fetch(`${API_BASE}/finance/fee-setup-per-class/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { feeSetupPerClassData.length = 0; _toArray(await res.json()).forEach(r => feeSetupPerClassData.push(r)); }
  } catch (_) {}
  await _fsLoadLookups();
  _renderFeeSetupTable();
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
      const res = await fetch(`${API_BASE}/finance/fee-setup-per-class/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) okCount++;
      else { lastErr = await parseApiError(res); }
    } catch (_) { lastErr = 'Network error.'; }
  }
  if (okCount === lineItems.length) showToast('Fee setup saved!', 'success');
  else showToast(`Saved ${okCount}/${lineItems.length} items. Error: ${lastErr}`, 'error');
  loadView('fin-fee-setup-per-class');
}

// ==================== CHANGE 5: RECEIVE PAYMENTS ====================

let _rcvPayPerPage = 10, _rcvPayPage = 1, _rcvPaySearch = '';

async function loadReceivePaymentsView(container) {
  _rcvPayPage = 1; _rcvPaySearch = '';
  _renderRcvPayListPage(container);
  try {
    const res = await fetch(`${API_BASE}/finance/receive-payments/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { receivePaymentsData.length = 0; _toArray(await res.json()).forEach(r => receivePaymentsData.push(r)); }
  } catch (_) {}
  _renderRcvPayTable();
}

function _renderRcvPayListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Receive Payment</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Receive Payment &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="rcv-per-page" onchange="changeRcvPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===_rcvPayPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="rcv-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV">&#128202;</button>
          <button class="fin-btn-teal" onclick="renderRcvPayAddPage(document.getElementById('main-content'))">+ Add</button>
          <input type="text" class="fin-search-input" placeholder="&#128269; Search&#8230;" oninput="onRcvSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="rcv-table-container"></div>
      <div id="rcv-pagination"></div>
    </div>`;
  _renderRcvPayTable();
}

function _rcvFiltered() {
  if (!_rcvPaySearch) return receivePaymentsData;
  const q = _rcvPaySearch;
  return receivePaymentsData.filter(p =>
    (p.receiptNo||'').toLowerCase().includes(q) ||
    (p.name||'').toLowerCase().includes(q) ||
    (p.receiveFrom||'').toLowerCase().includes(q));
}

function _renderRcvPayTable() {
  const filtered = _rcvFiltered();
  const totalEl  = document.getElementById('rcv-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_rcvPayPage-1)*_rcvPayPerPage;
  const paged = filtered.slice(start, start+_rcvPayPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length/_rcvPayPerPage));

  let rows = paged.length===0
    ? `<tr><td colspan="9" class="fin-empty">No records found.</td></tr>`
    : paged.map(p=>`<tr>
        <td>${_finEsc(p.receiptNo||'')}</td>
        <td>${_finEsc(p.costCenter||'-')}</td>
        <td>${_finEsc(p.receiveFrom||'-')}</td>
        <td>${_finEsc(p.name||'-')}</td>
        <td>${_finEsc(p.paymentMode||'-')}</td>
        <td>${_finEsc(p.modeNo||'-')}</td>
        <td>${_finEsc(p.docDate||'-')}</td>
        <td>${_finFmt(p.amount||0)}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinRcvDropdown(event,'${p.id}')">&#8230;</button>
            <div id="fin-rcv-dd-${p.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openRcvPayDetail('${p.id}');return false;">&#128065; View Detail</a>
              <a href="#" onclick="alert('Change Date — coming soon.');return false;">&#128197; Change Date</a>
              <a href="#" onclick="window.print();return false;">&#128438; Print</a>
            </div>
          </div>
        </td>
      </tr>`).join('');

  const el = document.getElementById('rcv-table-container');
  if (el) el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>RECEIPT NO</th><th>COST CENTER</th><th>RECEIVE FROM</th><th>NAME</th>
        <th>PAYMENT MODE</th><th>MODE NO</th><th>DOC DATE</th><th>AMOUNT</th><th>ACTION</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  let pg=''; for(let i=1;i<=pages;i++) pg+=`<button class="${i===_rcvPayPage?'fin-pg-active':''}" onclick="rcvGoPage(${i})">${i}</button>`;
  const pgEl=document.getElementById('rcv-pagination');
  if(pgEl) pgEl.innerHTML=`<div class="fin-pagination">${pg}</div>`;
}

function toggleFinRcvDropdown(e,id) {
  e.stopPropagation();
  document.querySelectorAll('[id^="fin-rcv-dd-"]').forEach(d=>{ if(d.id!==`fin-rcv-dd-${id}`) d.style.display='none'; });
  const dd=document.getElementById(`fin-rcv-dd-${id}`);
  if(dd) dd.style.display=dd.style.display==='none'?'block':'none';
}
function changeRcvPerPage(v){ _rcvPayPerPage=parseInt(v); _rcvPayPage=1; _renderRcvPayTable(); }
function onRcvSearch(v)     { _rcvPaySearch=v.trim().toLowerCase(); _rcvPayPage=1; _renderRcvPayTable(); }
function rcvGoPage(p)       { _rcvPayPage=p; _renderRcvPayTable(); }

function openRcvPayDetail(id) {
  document.querySelectorAll('[id^="fin-rcv-dd-"]').forEach(d=>d.style.display='none');
  const pmt = receivePaymentsData.find(p=>p.id===id);
  if (!pmt) return;
  _renderRcvPayDetailPage(document.getElementById('main-content'), pmt);
}

function _renderRcvPayDetailPage(container, pmt) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Receive Payment</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-receive-payments');return false;">Receive Payment</a>
          &rsaquo; Show
        </div>
      </div>
      <div class="fin-send-row">
        <button class="fin-btn-teal" onclick="alert('Send to Parent — coming soon.')">Send to Parent</button>
        <button class="fin-btn-teal" onclick="window.print()">Print Receipt</button>
      </div>
      <div class="fin-info-grid">
        <div class="fin-info-item"><span class="fin-info-label">Receipt Number</span><span class="fin-info-value">${_finEsc(pmt.receiptNo||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Student Number</span><span class="fin-info-value">${_finEsc(pmt.studentLabel||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Ledger</span><span class="fin-info-value">${_finEsc(pmt.ledger||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Payment Mode</span><span class="fin-info-value">${_finEsc(pmt.paymentMode||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Mode No.</span><span class="fin-info-value">${_finEsc(pmt.modeNo||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Doc Date</span><span class="fin-info-value">${_finEsc(pmt.docDate||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Amount (KSH)</span><span class="fin-info-value">${_finFmt(pmt.amount||0)}</span></div>
      </div>
      <div class="fin-section-label">Student Information</div>
      <div class="fin-info-grid">
        <div class="fin-info-item"><span class="fin-info-label">Name</span><span class="fin-info-value">${_finEsc(pmt.name||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Class</span><span class="fin-info-value">${_finEsc(pmt.class||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Cohort</span><span class="fin-info-value">${_finEsc(pmt.cohort||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Balance</span><span class="fin-info-value">${_finEsc(pmt.balance||'-')}</span></div>
      </div>
      <div class="fin-form-actions" style="margin-top:20px;">
        <button class="fin-btn-cancel" onclick="loadView('fin-receive-payments')">Back</button>
      </div>
    </div>`;
}

async function renderRcvPayAddPage(container) {
  container.innerHTML = '<p class="fin-loading">Loading&#8230;</p>';
  let studentOpts = '<option value="">-- Search Student --</option>';
  try {
    const res = await fetch(`${API_BASE}/students/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const students = await res.json();
      studentOpts += students.map(s =>
        `<option value="${s.id}" data-name="${_finEsc((s.first_name||'')+' '+(s.last_name||''))}" data-class="${_finEsc(s.school_class_name||'-')}" data-adm="${_finEsc(s.student_id||'-')}">
          ${_finEsc((s.first_name||'')+' '+(s.last_name||''))} (${_finEsc(s.student_id||'-')} / ${_finEsc(s.school_class_name||'-')})
        </option>`).join('');
    }
  } catch(_) {}

  const ledgerOpts = chartOfAccountsData.map(a =>
    `<option value="${a.id}">${_finEsc(a.account_name||a.accountName||'')}</option>`).join('');

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Receive Payment</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-receive-payments');return false;">Receive Payment</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Receipt Number</label>
            <input type="text" class="fin-form-input" value="${_finEsc(_finGenRefNo('RCP-', receivePaymentsData))}" disabled>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Receive From <span class="fin-required">*</span></label>
            <select id="rcv-add-from" class="fin-form-select">
              <option value="">Please Select</option>
              <option value="Student">Student</option>
              <option value="Parent">Parent</option>
              <option value="Sponsor">Sponsor</option>
              <option value="Other">Other</option>
            </select>
            <span class="fin-field-error" id="rcv-from-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Student Number <span class="fin-required">*</span></label>
            <select id="rcv-add-student" class="fin-form-select">${studentOpts}</select>
            <span class="fin-field-error" id="rcv-student-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
            <select id="rcv-add-ledger" class="fin-form-select">
              <option value="">Please Select</option>${ledgerOpts}
            </select>
            <span class="fin-field-error" id="rcv-ledger-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Payment Mode <span class="fin-required">*</span></label>
            <select id="rcv-add-mode" class="fin-form-select">
              <option value="">Please Select</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mpesa">M-Pesa</option>
            </select>
            <span class="fin-field-error" id="rcv-mode-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Mode No. <span class="fin-required">*</span></label>
            <input type="text" id="rcv-add-mode-no" class="fin-form-input">
            <span class="fin-field-error" id="rcv-modeno-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Doc Date <span class="fin-required">*</span></label>
            <input type="date" id="rcv-add-date" class="fin-form-input">
            <span class="fin-field-error" id="rcv-date-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Actual Amount (KSH) <span class="fin-required">*</span></label>
            <input type="number" id="rcv-add-amount" class="fin-form-input" step="0.01" min="0">
            <span class="fin-field-error" id="rcv-amount-err"></span>
          </div>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Attachment</label>
          <input type="file" id="rcv-add-file" class="fin-form-input" style="padding:6px 10px;">
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitRcvPayAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-receive-payments')">Cancel</button>
        </div>
        <div id="rcv-add-status"></div>
      </div>
    </div>`;
}

async function submitRcvPayAdd() {
  const from   = document.getElementById('rcv-add-from').value;
  const stuEl  = document.getElementById('rcv-add-student');
  const stu    = stuEl.value;
  const ledger = document.getElementById('rcv-add-ledger').value;
  const mode   = document.getElementById('rcv-add-mode').value;
  const modeNo = (document.getElementById('rcv-add-mode-no').value||'').trim();
  const date   = document.getElementById('rcv-add-date').value;
  const amount = parseFloat(document.getElementById('rcv-add-amount').value)||0;
  let valid=true;

  const v=(id,errId,val,msg)=>{ document.getElementById(errId).textContent=val?'':msg; if(!val) valid=false; };
  v('','rcv-from-err',   from,   'This field is required.');
  v('','rcv-student-err',stu,    'This field is required.');
  v('','rcv-ledger-err', ledger, 'This field is required.');
  v('','rcv-mode-err',   mode,   'This field is required.');
  v('','rcv-modeno-err', modeNo, 'This field is required.');
  v('','rcv-date-err',   date,   'This field is required.');
  if (!amount) { document.getElementById('rcv-amount-err').textContent='Amount must be > 0.'; valid=false; }
  else          { document.getElementById('rcv-amount-err').textContent=''; }
  if (!valid) return;

  const selOpt = stuEl.options[stuEl.selectedIndex];
  const stuName  = selOpt?.dataset?.name  || '-';
  const stuClass = selOpt?.dataset?.class || '-';
  const stuAdm   = selOpt?.dataset?.adm   || '-';

  const ledgerRec = chartOfAccountsData.find(a=>String(a.id)===String(ledger));

  const payload = {
    receive_from: from, student_id: stu, ledger_id: ledger,
    payment_mode: mode, mode_no: modeNo, doc_date: date, amount
  };
  try {
    const res = await fetch(`${API_BASE}/finance/receive-payments/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) { showToast('Payment received!', 'success'); }
    else { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-receive-payments');
}

// ==================== CHANGE 7: CHART OF ACCOUNTS ====================

let _coaPerPage = 10, _coaPage = 1, _coaSearch = '';

async function loadChartOfAccountsView(container) {
  _coaPage = 1; _coaSearch = '';
  _renderCoaListPage(container);
  try {
    const res = await fetch(`${API_BASE}/accounts/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const raw = await res.json();
      chartOfAccountsData.length = 0;
      _toArray(raw).forEach(r => chartOfAccountsData.push(r));
    } else {
      showToast(`Could not load accounts: HTTP ${res.status} ${await parseApiError(res)}`, 'error');
    }
  } catch (e) {
    showToast('Network error loading accounts: ' + e.message, 'error');
  }
  _renderCoaTable();
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

function _coaFormHtml(acct) {
  const parentId = acct?.parent_id;
  const parentOpts = chartOfAccountsData
    .filter(a=> !acct || a.id!==acct.id)
    .map(a=>`<option value="${a.id}" ${String(parentId)===String(a.id)?'selected':''}>${_finEsc(a.account_name||'')}</option>`).join('');
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
        <input type="text" id="coa-f-name" class="fin-form-input" value="${_finEsc(acct?.account_name||'')}">
        <span class="fin-field-error" id="coa-f-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Account Type <span class="fin-required">*</span></label>
        <select id="coa-f-type" class="fin-form-select" ${acct?'disabled title="Account type cannot be changed after creation"':''}>
          <option value="">Please Select</option>
          ${['Asset','Liability','Equity','Income','Expense'].map(t=>`<option value="${t}" ${acct?.account_type===t?'selected':''}>${t}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="coa-f-type-err"></span>
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
        <input type="checkbox" id="coa-f-fees-related" class="fin-cb" ${acct?.is_student_fees_related?'checked':''}> Student/Fees Related
      </label>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-check-label" style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="coa-f-budget-item" class="fin-cb" ${acct?.is_budget_item?'checked':''}> Budget Item
      </label>
    </div>`;
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

function renderCoaAddPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Account</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-chart-of-accounts');return false;">Account</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        ${_coaFormHtml(null)}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitCoaAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-chart-of-accounts')">Cancel</button>
        </div>
      </div>
    </div>`;
}

async function submitCoaAdd() {
  const num  = (document.getElementById('coa-f-number').value||'').trim();
  const name = (document.getElementById('coa-f-name').value||'').trim();
  const type = document.getElementById('coa-f-type').value;
  const cfg  = document.getElementById('coa-f-cf-group').value;
  const ordering = document.getElementById('coa-f-ordering').value;
  const parentId = document.getElementById('coa-f-parent').value;
  let valid=true;
  document.getElementById('coa-f-name-err').textContent   = name ? '' : 'This field is required.'; if(!name) valid=false;
  document.getElementById('coa-f-type-err').textContent   = type ? '' : 'This field is required.'; if(!type) valid=false;
  document.getElementById('coa-f-cfg-err').textContent    = '';
  if (!valid) return;
  const payload = {
    number: num || null, account_name: name, account_type: type,
    payment_ordering:      ordering ? parseInt(ordering) : null,
    cash_flow_group:       cfg || null,
    parent_id:             parentId ? parseInt(parentId) : null,
    is_student_fees_related: document.getElementById('coa-f-fees-related').checked,
    is_budget_item:        document.getElementById('coa-f-budget-item').checked
  };
  try {
    const res = await fetch(`${API_BASE}/accounts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('Account added!', 'success');
      if (payload.is_student_fees_related) {
        const faPayload = {
          number:                  num || null,
          account_name:            name,
          item_name:               name,
          item_code:               num || name,
          account_type:            type,
          payment_ordering:        ordering ? parseInt(ordering) : null,
          child_of:                parentId ? parseInt(parentId) : null,
          group:                   '',
          sub_group:               '',
          department:              '',
          is_student_fees_related: true,
          is_discount_account:     false,
          is_budget_item:          payload.is_budget_item,
          is_deactivated:          false,
        };
        const faRes = await fetch(`${API_BASE}/finance/fee-accounts/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(faPayload)
        });
        if (!faRes.ok) showToast('Account saved but Fee Account sync failed: ' + await parseApiError(faRes), 'error');
      }
    } else { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-chart-of-accounts');
}

function openCoaEdit(id) {
  document.querySelectorAll('[id^="fin-coa-dd-"]').forEach(d=>d.style.display='none');
  const acct = chartOfAccountsData.find(a=>String(a.id)===String(id));
  if (!acct) return;
  const container = document.getElementById('main-content');
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Account</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-chart-of-accounts');return false;">Account</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        ${_coaFormHtml(acct)}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitCoaEdit('${acct.id}')">Update</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-chart-of-accounts')">Cancel</button>
        </div>
      </div>
    </div>`;
}

async function submitCoaEdit(id) {
  const idx  = chartOfAccountsData.findIndex(a=>String(a.id)===String(id));
  if (idx===-1) return;
  const name = (document.getElementById('coa-f-name').value||'').trim();
  const type = document.getElementById('coa-f-type').value;
  const cfg  = document.getElementById('coa-f-cf-group').value;
  const ordering = document.getElementById('coa-f-ordering').value;
  const parentId = document.getElementById('coa-f-parent').value;
  document.getElementById('coa-f-name-err').textContent = name ? '' : 'This field is required.';
  document.getElementById('coa-f-cfg-err').textContent  = '';
  if (!name) return;
  const payload = {
    // account_type is fixed at creation — not part of AccountUpdate, intentionally omitted.
    account_name: name, cash_flow_group: cfg || null,
    payment_ordering:       ordering ? parseInt(ordering) : null,
    parent_id:              parentId ? parseInt(parentId) : null,
    is_student_fees_related: document.getElementById('coa-f-fees-related').checked,
    is_budget_item:         document.getElementById('coa-f-budget-item').checked
  };
  try {
    const res = await fetch(`${API_BASE}/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) { showToast('Account updated!', 'success'); }
    else { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-chart-of-accounts');
}

// ==================== CHANGE 8: FEE ACCOUNTS ====================

let _feeAcctPerPage = 10, _feeAcctPage = 1, _feeAcctSearch = '';

async function loadFeeAccountsView(container) {
  _feeAcctPage = 1; _feeAcctSearch = '';
  _renderFeeAcctListPage(container);
  try {
    const res = await fetch(`${API_BASE}/finance/fee-accounts/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { feeAccountsData.length = 0; _toArray(await res.json()).forEach(r => feeAccountsData.push(r)); }
  } catch (_) {}
  _renderFeeAcctTable();
}

function _renderFeeAcctListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Fee Account</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Fee Account &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="fa-per-page" onchange="changeFaPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}" ${n===_feeAcctPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="fa-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" placeholder="&#128269; Search&#8230;" oninput="onFaSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
          <button class="fin-btn-teal" onclick="renderFeeAcctAddPage(document.getElementById('main-content'))">Add Account</button>
        </div>
      </div>
      <div id="fa-table-container"></div>
      <div id="fa-pagination"></div>
    </div>`;
  _renderFeeAcctTable();
}

function _faFiltered() {
  if (!_feeAcctSearch) return feeAccountsData;
  const q = _feeAcctSearch;
  return feeAccountsData.filter(a =>
    (a.number||'').toLowerCase().includes(q) ||
    (a.account_name||a.accountName||'').toLowerCase().includes(q) ||
    (a.item_name||a.itemName||'').toLowerCase().includes(q));
}

// Fee Account records reference their parent (in Chart of Accounts) by id (child_of).
function _faParentName(a) {
  if (!a.child_of) return '-';
  const parent = chartOfAccountsData.find(p => String(p.id) === String(a.child_of));
  return parent ? (parent.account_name || parent.accountName || '-') : '-';
}

function _renderFeeAcctTable() {
  const filtered = _faFiltered();
  const totalEl  = document.getElementById('fa-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_feeAcctPage-1)*_feeAcctPerPage;
  const paged = filtered.slice(start, start+_feeAcctPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length/_feeAcctPerPage));

  let rows = paged.length===0
    ? `<tr><td colspan="11" class="fin-empty">No records found.</td></tr>`
    : paged.map(a=>`<tr>
        <td>${_finEsc(a.number||'')}</td>
        <td>${_finEsc(a.account_name||a.accountName||'')}</td>
        <td>${_finEsc(a.account_type||a.accountType||'-')}</td>
        <td>${_finEsc(_faParentName(a))}</td>
        <td>${_finEsc(a.group||'-')}</td>
        <td>${_finEsc(a.sub_group||a.subGroup||'-')}</td>
        <td>${_finEsc(a.item_name||a.itemName||'-')}</td>
        <td>${_finEsc(a.item_code||a.itemCode||'-')}</td>
        <td>${_finEsc(a.is_deactivated ? 'Inactive' : (a.status||'Active'))}</td>
        <td>${_finEsc(a.personnel||'-')}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinFeeAcctDropdown(event,'${a.id}')">&#8230;</button>
            <div id="fin-fee-acct-dd-${a.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openFeeAcctEdit('${a.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`).join('');

  const el = document.getElementById('fa-table-container');
  if (el) el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table" style="min-width:1000px;">
      <thead><tr>
        <th>NUMBER</th><th>ACCOUNT NAME</th><th>ACCOUNT TYPE</th><th>PARENT ACCOUNT</th>
        <th>GROUP</th><th>SUB GROUP</th><th>ITEM NAME</th><th>ITEM CODE</th>
        <th>STATUS</th><th>PER</th><th>ACTION</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  let pg=''; for(let i=1;i<=pages;i++) pg+=`<button class="${i===_feeAcctPage?'fin-pg-active':''}" onclick="faGoPage(${i})">${i}</button>`;
  const pgEl=document.getElementById('fa-pagination');
  if(pgEl) pgEl.innerHTML=`<div class="fin-pagination">${pg}</div>`;
}

function onFaItemSelect(name) {
  const item = feeItemsData.find(f => f.name === name);
  document.getElementById('fa-f-item-code').value = item ? (item.code || '') : '';
}

function toggleFinFeeAcctDropdown(e,id) {
  e.stopPropagation();
  document.querySelectorAll('[id^="fin-fee-acct-dd-"]').forEach(d=>{ if(d.id!==`fin-fee-acct-dd-${id}`) d.style.display='none'; });
  const dd=document.getElementById(`fin-fee-acct-dd-${id}`);
  if(dd) dd.style.display=dd.style.display==='none'?'block':'none';
}
function changeFaPerPage(v){ _feeAcctPerPage=parseInt(v); _feeAcctPage=1; _renderFeeAcctTable(); }
function onFaSearch(v)     { _feeAcctSearch=v.trim().toLowerCase(); _feeAcctPage=1; _renderFeeAcctTable(); }
function faGoPage(p)       { _feeAcctPage=p; _renderFeeAcctTable(); }

function _faFormHtml(acct) {
  const childOf = acct?.child_of ?? acct?.childOf;
  const parentOpts = chartOfAccountsData.map(a=>
    `<option value="${a.id}" ${String(childOf)===String(a.id)?'selected':''}>${_finEsc(a.account_name||a.accountName||'')}</option>`).join('');
  const typeOpts = ['Asset','Liability','Equity','Revenue','Expense'].map(t=>
    `<option value="${t}" ${(acct?.account_type||acct?.accountType)===t?'selected':''}>${t}</option>`).join('');
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Number <span class="fin-required">*</span></label>
        <input type="text" id="fa-f-number" class="fin-form-input" value="${_finEsc(acct?.number||'')}" ${acct?'disabled':''}>
        <span class="fin-field-error" id="fa-f-num-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Account Name <span class="fin-required">*</span></label>
        <input type="text" id="fa-f-name" class="fin-form-input" value="${_finEsc(acct?.account_name||acct?.accountName||'')}" ${acct?'disabled':''}>
        <span class="fin-field-error" id="fa-f-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Fee Item <span class="fin-required">*</span></label>
        <select id="fa-f-item-name" class="fin-form-select" onchange="onFaItemSelect(this.value)" ${acct?'disabled':''}>
          <option value="">Please Select</option>
          ${feeItemsData.map(f=>`<option value="${_finEsc(f.name)}" ${(acct?.item_name||acct?.itemName)===f.name?'selected':''}>${_finEsc(f.name)}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="fa-f-iname-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Fee Code</label>
        <input type="text" id="fa-f-item-code" class="fin-form-input" value="${_finEsc(acct?.item_code||acct?.itemCode||'')}" readonly style="background:#f5f5f5;color:#555;cursor:default;">
        <span class="fin-field-error" id="fa-f-icode-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Account Type <span class="fin-required">*</span></label>
        <select id="fa-f-type" class="fin-form-select">
          <option value="">Please Select</option>${typeOpts}
        </select>
        <span class="fin-field-error" id="fa-f-type-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Payment Ordering</label>
        <input type="number" id="fa-f-ordering" class="fin-form-input" value="${acct?.payment_ordering ?? acct?.paymentOrdering ?? ''}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Child of</label>
        <select id="fa-f-child-of" class="fin-form-select">
          <option value="">Please Select</option>${parentOpts}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Group</label>
        <select id="fa-f-group" class="fin-form-select">
          <option value="">Please Select</option>
          ${['Operating','Investing','Financing'].map(g=>`<option value="${g}" ${acct?.group===g?'selected':''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Sub Group</label>
        <select id="fa-f-subgroup" class="fin-form-select">
          <option value="">Please Select</option>
          ${['Revenue','Expenses','Assets','Liabilities'].map(s=>`<option value="${s}" ${(acct?.sub_group||acct?.subGroup)===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Department</label>
        <select id="fa-f-dept" class="fin-form-select">
          <option value="">Please Select</option>
          <option value="Admin">Admin</option>
          <option value="Academic">Academic</option>
          <option value="Finance">Finance</option>
        </select>
      </div>
    </div>
    <div class="fin-form-group">
      <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="fa-f-fees" class="fin-cb" ${(acct?.is_student_fees_related ?? acct?.isStudentFeesRelated)?'checked':''}> Student/Fees Related
      </label>
    </div>
    <div class="fin-form-group">
      <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="fa-f-discount" class="fin-cb" ${(acct?.is_discount_account ?? acct?.isDiscountAccount)?'checked':''}> Discount Account
      </label>
    </div>
    <div class="fin-form-group">
      <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="fa-f-budget" class="fin-cb" ${(acct?.is_budget_item ?? acct?.isBudgetItem)?'checked':''}> Budget Item
      </label>
    </div>
    <div class="fin-form-group">
      <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="fa-f-deactivate" class="fin-cb" ${(acct?.is_deactivated ?? acct?.isDeactivated)?'checked':''}> Deactivate/Activate
      </label>
    </div>`;
}

async function renderFeeAcctAddPage(container) {
  if (!feeItemsData.length) {
    try {
      const r = await apiFetch(`${API_BASE}/finance/fee-items`);
      if (r && r.ok) { feeItemsData.length = 0; _toArray(await r.json()).forEach(x => feeItemsData.push(x)); }
    } catch (_) {}
  }
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Account</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-fee-accounts');return false;">Fee Account</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        ${_faFormHtml(null)}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitFeeAcctAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-fee-accounts')">Cancel</button>
        </div>
      </div>
    </div>`;
}

async function submitFeeAcctAdd() {
  const num   = (document.getElementById('fa-f-number').value||'').trim();
  const name  = (document.getElementById('fa-f-name').value||'').trim();
  const iname = (document.getElementById('fa-f-item-name').value||'').trim();
  const icode = (document.getElementById('fa-f-item-code').value||'').trim();
  const type  = document.getElementById('fa-f-type').value;
  let valid=true;
  document.getElementById('fa-f-num-err').textContent   = num   ? '' : 'This field is required.'; if(!num)   valid=false;
  document.getElementById('fa-f-name-err').textContent  = name  ? '' : 'This field is required.'; if(!name)  valid=false;
  document.getElementById('fa-f-iname-err').textContent = iname ? '' : 'Please select a Fee Item.'; if(!iname) valid=false;
  document.getElementById('fa-f-type-err').textContent  = type  ? '' : 'This field is required.'; if(!type)  valid=false;
  if (!valid) return;
  const childOfId = document.getElementById('fa-f-child-of').value;
  const payload = {
    number: num, account_name: name, item_name: iname, item_code: icode, account_type: type,
    payment_ordering:       document.getElementById('fa-f-ordering').value||'',
    child_of:               childOfId,
    group:                  document.getElementById('fa-f-group').value||'',
    sub_group:              document.getElementById('fa-f-subgroup').value||'',
    department:             document.getElementById('fa-f-dept').value||'',
    is_student_fees_related: document.getElementById('fa-f-fees').checked,
    is_discount_account:    document.getElementById('fa-f-discount').checked,
    is_budget_item:         document.getElementById('fa-f-budget').checked,
    is_deactivated:         document.getElementById('fa-f-deactivate').checked
  };
  try {
    const res = await fetch(`${API_BASE}/finance/fee-accounts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) { showToast('Fee account added!', 'success'); }
    else { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-fee-accounts');
}

async function openFeeAcctEdit(id) {
  document.querySelectorAll('[id^="fin-fee-acct-dd-"]').forEach(d=>d.style.display='none');
  const acct = feeAccountsData.find(a=>String(a.id)===String(id));
  if (!acct) return;
  if (!feeItemsData.length) {
    try {
      const r = await apiFetch(`${API_BASE}/finance/fee-items`);
      if (r && r.ok) { feeItemsData.length = 0; _toArray(await r.json()).forEach(x => feeItemsData.push(x)); }
    } catch (_) {}
  }
  const container = document.getElementById('main-content');
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Fee Account</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-fee-accounts');return false;">Fee Account</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        ${_faFormHtml(acct)}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitFeeAcctEdit('${acct.id}')">Update</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-fee-accounts')">Cancel</button>
        </div>
      </div>
    </div>`;
}

async function submitFeeAcctEdit(id) {
  const idx   = feeAccountsData.findIndex(a=>String(a.id)===String(id));
  if (idx===-1) return;
  const iname = (document.getElementById('fa-f-item-name').value||'').trim();
  const icode = (document.getElementById('fa-f-item-code').value||'').trim();
  const type  = document.getElementById('fa-f-type').value;
  document.getElementById('fa-f-iname-err').textContent = iname ? '' : 'This field is required.';
  document.getElementById('fa-f-icode-err').textContent = icode ? '' : 'This field is required.';
  document.getElementById('fa-f-type-err').textContent  = type  ? '' : 'This field is required.';
  if (!iname||!icode||!type) return;
  const childOfId = document.getElementById('fa-f-child-of').value;
  const payload = {
    item_name: iname, item_code: icode, account_type: type,
    payment_ordering:       document.getElementById('fa-f-ordering').value||'',
    child_of:               childOfId,
    group:                  document.getElementById('fa-f-group').value||'',
    sub_group:              document.getElementById('fa-f-subgroup').value||'',
    department:             document.getElementById('fa-f-dept').value||'',
    is_student_fees_related: document.getElementById('fa-f-fees').checked,
    is_discount_account:    document.getElementById('fa-f-discount').checked,
    is_budget_item:         document.getElementById('fa-f-budget').checked,
    is_deactivated:         document.getElementById('fa-f-deactivate').checked
  };
  try {
    const res = await fetch(`${API_BASE}/finance/fee-accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) { showToast('Fee account updated!', 'success'); }
    else { showToast('Error: ' + await parseApiError(res), 'error'); }
  } catch (_) { showToast('Network error.', 'error'); }
  loadView('fin-fee-accounts');
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
  _feeItemPage = 1; _feeItemSearch = '';
  _renderFeeItemsListPage(container);
  await _fiLoadLookups();
  try {
    const res = await apiFetch(`${API_BASE}/finance/fee-items`);
    if (res && res.ok) { feeItemsData.length = 0; _toArray(await res.json()).forEach(r => feeItemsData.push(r)); }
  } catch (_) {}
  _renderFeeItemsTable();
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

async function renderFeeItemAddPage(container, editId) {
  const item = editId ? feeItemsData.find(f => String(f.id) === String(editId)) : null;
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
    const res = await apiFetch(`${API_BASE}/finance/fee-items`, {
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
    const res = await apiFetch(`${API_BASE}/finance/fee-items/${id}`, {
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
    const res = await apiFetch(`${API_BASE}/finance/fee-items/${id}`, { method: 'DELETE' });
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
  _giPage = 1; _giSearch = '';
  _renderGiListPage(container);
  await _giLoadAccounts();
  try {
    const res = await apiFetch(`${API_BASE}/finance/general-items/`);
    if (res && res.ok) { generalItemsData.length = 0; _toArray(await res.json()).forEach(r => generalItemsData.push(r)); }
  } catch (_) {}
  _renderGiTable();
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

async function renderGeneralItemForm(container, editId) {
  await _giLoadAccounts();
  const item = editId ? generalItemsData.find(g => String(g.id) === String(editId)) : null;
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

