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
      session:     f.term_id ? `Term ${f.term_id}` : '-',
      description: 'Fee Charge',
      debit:       parseFloat(f.amount) || 0,
      credit:      0
    }));
    payments.forEach(p => rows.push({
      date:        p.payment_date || '',
      session:     '-',
      description: `Payment (${p.payment_method || 'Cash'})`,
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
        <td>${_finEsc(r.session)}</td>
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
        <span class="fin-info-value">${_finEsc(s.class_name || '-')}</span>
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
        <td>${_finEsc(s.class_name || '-')}</td>
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
  const sessOptions = sessionData.map(s =>
    `<option value="${s.id}">${_finEsc(s.sessionName)}</option>`
  ).join('');

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
            <label class="fin-filter-label">Session <span class="fin-required">*</span></label>
            <select id="sfs-stmt-session" class="fin-filter-select">
              <option value="">-- Select Session --</option>${sessOptions}
            </select>
            <span class="fin-field-error" id="sfs-stmt-session-err"></span>
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
}

async function submitSummarizedFilter() {
  const sessionVal = document.getElementById('sfs-stmt-session').value;
  const errEl      = document.getElementById('sfs-stmt-session-err');
  if (!sessionVal) { if (errEl) errEl.textContent = 'This field is required.'; return; }
  if (errEl) errEl.textContent = '';

  const admno      = (document.getElementById('sfs-stmt-admno').value   || '').trim().toLowerCase();
  const nameQ      = (document.getElementById('sfs-stmt-name').value     || '').trim().toLowerCase();
  const classQ     = (document.getElementById('sfs-stmt-class').value    || '').trim().toLowerCase();
  const statusQ    = document.getElementById('sfs-stmt-status').value;

  const resultsEl = document.getElementById('sfs-stmt-results');
  if (resultsEl) resultsEl.innerHTML = '<p class="fin-loading">Loading&#8230;</p>';

  try {
    const res = await fetch(`${API_BASE}/students/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { if (resultsEl) resultsEl.innerHTML = '<p class="fin-error">Failed to load students.</p>'; return; }
    let students = await res.json();

    if (admno)   students = students.filter(s => (s.student_id || '').toLowerCase().includes(admno));
    if (nameQ)   students = students.filter(s => (`${s.first_name} ${s.last_name}`).toLowerCase().includes(nameQ));
    if (classQ)  students = students.filter(s => (s.class_name || '').toLowerCase().includes(classQ));
    if (statusQ === 'active')   students = students.filter(s =>  s.is_active);
    if (statusQ === 'inactive') students = students.filter(s => !s.is_active);

    _sfsFilteredStudents = students;
    _renderSummarizedResults(resultsEl, students);
  } catch(_) {
    if (resultsEl) resultsEl.innerHTML = '<p class="fin-error">Failed to load results.</p>';
  }
}

function clearSummarizedFilter() {
  ['sfs-stmt-session','sfs-stmt-admno','sfs-stmt-stream','sfs-stmt-name','sfs-stmt-class','sfs-stmt-status']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const errEl = document.getElementById('sfs-stmt-session-err');
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
        <td>${_finEsc(s.class_name || '-')}</td>
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
          <th>ADMISSION NO.</th><th>NAME</th><th>BRANCH</th><th>CLASS</th>
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

function loadStudentInvoicesView(container) {
  _invPage   = 1;
  _invSearch = '';
  _renderInvoiceListPage(container);
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
          <button class="fin-btn-filter">&#9776; Filters</button>
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
    (inv.invoiceNo   || '').toLowerCase().includes(q) ||
    (inv.admissionNo || '').toLowerCase().includes(q) ||
    (inv.studentName || '').toLowerCase().includes(q)
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
    rows = `<tr><td colspan="13" class="fin-empty">No records found.</td></tr>`;
  } else {
    paged.forEach(inv => {
      rows += `<tr>
        <td>${_finEsc(inv.invoiceNo   || '')}</td>
        <td>${_finEsc(inv.branch      || '-')}</td>
        <td>${_finEsc(inv.costCenter  || '-')}</td>
        <td>${_finEsc(inv.admissionNo || '-')}</td>
        <td>${_finEsc(inv.studentName || '-')}</td>
        <td>${_finEsc(inv.session     || '-')}</td>
        <td>${_finEsc(inv.class       || '-')}</td>
        <td>${_finEsc(inv.cohort      || '-')}</td>
        <td>${_finEsc(inv.programme   || '-')}</td>
        <td>${_finEsc(inv.department  || '-')}</td>
        <td>${inv.amount ? _finFmt(inv.amount) : '-'}</td>
        <td>${_finEsc(inv.createdDate || '-')}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleFinInvDropdown(event,'${inv.id}')">&#8230;</button>
            <div id="fin-inv-dd-${inv.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openInvoiceView('${inv.id}');return false;">&#128065; View</a>
              <a href="#" onclick="openInvoicePrint('${inv.id}');return false;">&#128438; Print</a>
              <a href="#" onclick="openInvoiceEdit('${inv.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  const tblEl = document.getElementById('inv-table-container');
  if (tblEl) tblEl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table" style="min-width:1100px;">
        <thead><tr>
          <th>INVOICE NO.</th><th>BRANCH</th><th>COST CENTER</th><th>ADMISSION NO.</th>
          <th>STUDENT NAME</th><th>SESSION</th><th>CLASS</th><th>COHORT</th>
          <th>PROGRAMME</th><th>DEPARTMENT</th><th>AMOUNT</th><th>CREATED</th><th>ACTION</th>
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

function openInvoiceView(id) {
  document.querySelectorAll('[id^="fin-inv-dd-"]').forEach(d => d.style.display = 'none');
  loadFinPlaceholderView(document.getElementById('main-content'), 'View Invoice', 'Student Invoice');
}

function openInvoicePrint(id) {
  document.querySelectorAll('[id^="fin-inv-dd-"]').forEach(d => d.style.display = 'none');
  loadFinPlaceholderView(document.getElementById('main-content'), 'Print Invoice', 'Student Invoice');
}

function openInvoiceEdit(id) {
  document.querySelectorAll('[id^="fin-inv-dd-"]').forEach(d => d.style.display = 'none');
  const inv = studentInvoicesData.find(x => x.id === id);
  if (!inv) return;
  _renderInvoiceEditPage(document.getElementById('main-content'), inv);
}

// ==================== CHANGE 5: STUDENT INVOICES — EDIT ====================

function _renderInvoiceEditPage(container, inv) {
  const liRows = (inv.lineItems || []).map((li, i) => `
    <tr id="li-row-${i}">
      <td><input type="text"   class="fin-li-input" id="li-desc-${i}"   value="${_finEsc(li.description||'')}"></td>
      <td><input type="number" class="fin-li-input" id="li-amount-${i}" value="${li.amount||0}" step="0.01"></td>
      <td><button class="fin-btn-li-rm" onclick="removeLineItem(${i})">&#10005;</button></td>
    </tr>
  `).join('');

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

      <!-- Read-only info -->
      <div class="fin-section-label" style="margin-bottom:14px;">Invoice Information</div>
      <div class="fin-info-grid" style="margin-bottom:20px;">
        <div class="fin-info-item">
          <span class="fin-info-label">Invoice No.</span>
          <span class="fin-info-value">${_finEsc(inv.invoiceNo||'-')}</span>
        </div>
        <div class="fin-info-item">
          <span class="fin-info-label">Invoice Date</span>
          <span class="fin-info-value">${_finEsc(inv.invoiceDate||'-')}</span>
        </div>
        <div class="fin-info-item">
          <span class="fin-info-label">Admission No.</span>
          <span class="fin-info-value">${_finEsc(inv.admissionNo||'-')}</span>
        </div>
        <div class="fin-info-item">
          <span class="fin-info-label">Student Name</span>
          <span class="fin-info-value">${_finEsc(inv.studentName||'-')}</span>
        </div>
        <div class="fin-info-item">
          <span class="fin-info-label">Session</span>
          <span class="fin-info-value">${_finEsc(inv.session||'-')}</span>
        </div>
        <div class="fin-info-item">
          <span class="fin-info-label">Session Type</span>
          <span class="fin-info-value">${_finEsc(inv.sessionType||'-')}</span>
        </div>
        <div class="fin-info-item">
          <span class="fin-info-label">Student Type</span>
          <span class="fin-info-value">${_finEsc(inv.studentType||'-')}</span>
        </div>
        <div class="fin-info-item">
          <span class="fin-info-label">Stay Status</span>
          <span class="fin-info-value">${_finEsc(inv.stayStatus||'-')}</span>
        </div>
        <div class="fin-info-item">
          <span class="fin-info-label">Class</span>
          <span class="fin-info-value">${_finEsc(inv.class||'-')}</span>
        </div>
      </div>

      <!-- Editable fields -->
      <div class="fin-section-label" style="margin-bottom:14px;">Edit Details</div>
      <div class="fin-form-wrap">
        <div class="fin-form-group">
          <label class="fin-form-label">Amount</label>
          <input type="number" id="inv-edit-amount" class="fin-form-input"
                 value="${inv.amount||0}" step="0.01" min="0">
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Notes</label>
          <textarea id="inv-edit-notes" class="fin-form-textarea" rows="3">${_finEsc(inv.notes||'')}</textarea>
        </div>

        <!-- Line items -->
        <div class="fin-form-group">
          <label class="fin-form-label">Line Items</label>
          <table class="fin-li-table">
            <thead><tr><th>Description</th><th>Amount</th><th></th></tr></thead>
            <tbody id="inv-li-body">${liRows}</tbody>
          </table>
          <button class="fin-btn-li-add" onclick="addLineItem()">+ Add Line</button>
        </div>

        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="submitInvoiceEdit('${inv.id}')">Update</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-student-invoices')">Cancel</button>
        </div>
        <div id="inv-edit-status"></div>
      </div>
    </div>
  `;
}

let _liCount = 0;
function addLineItem() {
  const body = document.getElementById('inv-li-body');
  if (!body) return;
  const i = Date.now();
  const tr = document.createElement('tr');
  tr.id = `li-row-${i}`;
  tr.innerHTML = `
    <td><input type="text"   class="fin-li-input" id="li-desc-${i}"   placeholder="Description"></td>
    <td><input type="number" class="fin-li-input" id="li-amount-${i}" placeholder="0.00" step="0.01"></td>
    <td><button class="fin-btn-li-rm" onclick="this.closest('tr').remove()">&#10005;</button></td>
  `;
  body.appendChild(tr);
}

function removeLineItem(i) {
  const row = document.getElementById(`li-row-${i}`);
  if (row) row.remove();
}

function submitInvoiceEdit(id) {
  const idx = studentInvoicesData.findIndex(x => x.id === id);
  if (idx === -1) return;

  const amount = parseFloat(document.getElementById('inv-edit-amount').value) || 0;
  const notes  = document.getElementById('inv-edit-notes').value || '';

  // Collect line items from DOM
  const liBody   = document.getElementById('inv-li-body');
  const lineItems = [];
  if (liBody) {
    liBody.querySelectorAll('tr').forEach(tr => {
      const descEl = tr.querySelector('input[id^="li-desc-"]');
      const amtEl  = tr.querySelector('input[id^="li-amount-"]');
      if (descEl && amtEl) {
        lineItems.push({ description: descEl.value, amount: parseFloat(amtEl.value) || 0 });
      }
    });
  }

  studentInvoicesData[idx] = { ...studentInvoicesData[idx], amount, notes, lineItems };
  loadView('fin-student-invoices');
}

// ==================== CHANGE 6: STUDENT BULK INVOICING ====================

function loadStudentBulkInvoicingView(container) {
  const sessOptions = sessionData.map(s =>
    `<option value="${s.id}">${_finEsc(s.sessionName)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Student Bulk Invoicing</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Student Bulk Invoicing &rsaquo; Add</div>
      </div>

      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field">
            <label class="fin-filter-label">Session <span class="fin-required">*</span></label>
            <select id="bulk-session" class="fin-filter-select" onchange="onBulkSessionChange(this.value)">
              <option value="">Please Select</option>${sessOptions}
            </select>
            <span class="fin-field-error" id="bulk-session-err"></span>
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
                <th>CODE</th><th>START DATE</th><th>END DATE</th>
              </tr>
            </thead>
            <tbody id="bulk-class-tbody">
              <tr><td colspan="4" class="fin-empty">Select a session to load classes.</td></tr>
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
}

function onBulkSessionChange(sessionId) {
  const tbody = document.getElementById('bulk-class-tbody');
  if (!tbody) return;
  if (!sessionId) {
    tbody.innerHTML = `<tr><td colspan="4" class="fin-empty">Select a session to load classes.</td></tr>`;
    return;
  }
  const classes = studentClassesData.filter(c => String(c.sessionId) === String(sessionId));
  if (classes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="fin-empty">No classes found for this session.</td></tr>`;
    return;
  }
  tbody.innerHTML = classes.map((c, i) => `
    <tr>
      <td><input type="checkbox" class="fin-cb bulk-class-cb" value="${c.classCode}" data-start="${c.startDate||''}" data-end="${c.endDate||''}"></td>
      <td>${_finEsc(c.classCode)}</td>
      <td>${_finEsc(c.startDate || '-')}</td>
      <td>${_finEsc(c.endDate   || '-')}</td>
    </tr>
  `).join('');
  // reset select-all
  const all = document.getElementById('bulk-select-all');
  if (all) all.checked = false;
}

function toggleBulkSelectAll(cb) {
  document.querySelectorAll('.bulk-class-cb').forEach(c => { c.checked = cb.checked; });
}

function submitBulkInvoicing() {
  const sessionEl = document.getElementById('bulk-session');
  const dateEl    = document.getElementById('bulk-inv-date');
  let valid = true;

  const sessionErrEl = document.getElementById('bulk-session-err');
  const dateErrEl    = document.getElementById('bulk-date-err');

  if (!sessionEl.value) { if (sessionErrEl) sessionErrEl.textContent = 'This field is required.'; valid = false; }
  else                  { if (sessionErrEl) sessionErrEl.textContent = ''; }
  if (!dateEl.value)    { if (dateErrEl)    dateErrEl.textContent    = 'This field is required.'; valid = false; }
  else                  { if (dateErrEl)    dateErrEl.textContent    = ''; }
  if (!valid) return;

  const checked = Array.from(document.querySelectorAll('.bulk-class-cb:checked'));
  if (checked.length === 0) {
    const statusEl = document.getElementById('bulk-status');
    if (statusEl) statusEl.innerHTML = '<div class="fin-toast fin-toast-error">Please select at least one class.</div>';
    return;
  }

  const sessionRec = sessionData.find(s => String(s.id) === String(sessionEl.value));
  const sessionName = sessionRec ? sessionRec.sessionName : sessionEl.value;
  const invDate     = dateEl.value;
  const today       = _finToday();

  checked.forEach(cb => {
    studentInvoicesData.push({
      id:          'inv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      invoiceNo:   _finGenInvNo(),
      invoiceDate: invDate,
      branch:      '-',
      costCenter:  '-',
      admissionNo: '-',
      studentName: `Bulk — ${cb.value}`,
      session:     sessionName,
      sessionType: '-',
      studentType: '-',
      stayStatus:  '-',
      class:       cb.value,
      cohort:      '-',
      programme:   '-',
      department:  '-',
      amount:      0,
      lineItems:   [],
      notes:       'Bulk invoice generated',
      createdDate: today,
      status:      'pending'
    });
  });

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
function openFinUtilitiesDropdown() {
  const dd = document.getElementById('fin-utilities-dropdown');
  if (dd) dd.style.display = 'block';
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

function loadInvoiceAdjustmentsView(container) {
  _invAdjPage = 1; _invAdjSearch = '';
  _renderInvAdjListPage(container);
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

function submitInvAdjAdd() {
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
    if (admEl) students.push({ admissionNo: admEl.value, name: nameEl?.value||'', class: clsEl?.value||'' });
  });
  document.querySelectorAll('#ia-fee-body tr').forEach(tr=>{
    const acctEl = tr.querySelector('[id^="ia-f-acct-"]');
    const amtEl  = tr.querySelector('[id^="ia-f-amt-"]');
    if (acctEl) lineItems.push({ account: acctEl.value, amount: parseFloat(amtEl?.value)||0 });
  });

  const total = lineItems.reduce((s,li)=>s+li.amount, 0);
  studentInvoiceAdjustmentsData.push({
    id:             'ia-' + Date.now(),
    referenceNo:    _finGenRefNo('ADJ-', studentInvoiceAdjustmentsData),
    adjustmentDate: date,
    studentType:    type,
    students,
    lineItems,
    amount:         total,
    costCenter:     '-',
    admissionNo:    students[0]?.admissionNo || '-',
    names:          students.map(s=>s.name).join(', '),
    stay:           '-',
    class:          students[0]?.class || '-',
    cohort:         '-',
    reason,
    createdDate:    _finToday()
  });
  loadView('fin-invoice-adjustments');
}

// ==================== CHANGE 2: SPONSORSHIP ALLOCATIONS ====================

let _sponAllocPerPage = 10, _sponAllocPage = 1, _sponAllocSearch = '';

function loadSponsorshipAllocationsView(container) {
  _sponAllocPage = 1; _sponAllocSearch = '';
  _renderSponAllocListPage(container);
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
        <td>${_finEsc(a.branch||'-')}</td>
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
        <th>REFERENCE NUMBER</th><th>BRANCH</th><th>COST CENTER</th>
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
        <div class="fin-info-item"><span class="fin-info-label">Programme</span><span class="fin-info-value">${_finEsc(alloc.programme||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Balance</span><span class="fin-info-value">${_finEsc(alloc.balance||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Branch</span><span class="fin-info-value">${_finEsc(alloc.branch||'-')}</span></div>
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
            <label class="fin-form-label">Branch</label>
            <input type="text" id="sa-branch" class="fin-form-input">
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

function submitSponAllocAdd() {
  const sponsor = (document.getElementById('sa-sponsor-name').value||'').trim();
  const admNo   = (document.getElementById('sa-adm-no').value||'').trim();
  const amount  = parseFloat(document.getElementById('sa-amount').value)||0;
  let valid=true;
  document.getElementById('sa-sponsor-err').textContent = sponsor ? '' : 'This field is required.'; if(!sponsor) valid=false;
  document.getElementById('sa-adm-err').textContent     = admNo   ? '' : 'This field is required.'; if(!admNo)   valid=false;
  document.getElementById('sa-amount-err').textContent  = amount>0? '' : 'Amount must be greater than 0.'; if(!amount) valid=false;
  if (!valid) return;

  sponsorshipAllocationsData.push({
    id:              'sa-'+Date.now(),
    referenceNumber: _finGenRefNo('SPN-', sponsorshipAllocationsData),
    sponsorName:     sponsor,
    admissionNo:     admNo,
    studentName:     document.getElementById('sa-student-name').value||'',
    amount,
    class:           document.getElementById('sa-class').value||'-',
    branch:          document.getElementById('sa-branch').value||'-',
    costCenter:      document.getElementById('sa-cost-center').value||'-',
    cohort:          document.getElementById('sa-cohort').value||'-',
    programme:       '-',
    balance:         '-',
    createdAt:       _finToday()
  });
  loadView('fin-sponsorship-allocations');
}

// ==================== CHANGE 3: FEE SET-UP PER CLASS ====================

let _feeSetupPerPage = 10, _feeSetupPage = 1, _feeSetupSearch = '';

function loadFeeSetupPerClassView(container) {
  _feeSetupPage = 1; _feeSetupSearch = '';
  _renderFeeSetupListPage(container);
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
          <button class="fin-btn-teal" onclick="alert('Advance Fee Setup — coming soon.')">Advance Fee Setup</button>
          <button class="fin-btn-teal" onclick="renderFeeSetupAddPage(document.getElementById('main-content'))">+ Add</button>
          <input type="text" class="fin-search-input" placeholder="&#128269; Search&#8230;" oninput="onFsSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="fs-table-container"></div>
      <div id="fs-pagination"></div>
    </div>`;
  _renderFeeSetupTable();
}

function _fsFiltered() {
  if (!_feeSetupSearch) return feeSetupPerClassData;
  const q = _feeSetupSearch;
  return feeSetupPerClassData.filter(f =>
    (f.classCode||'').toLowerCase().includes(q) ||
    (f.session||'').toLowerCase().includes(q));
}

function _renderFeeSetupTable() {
  const filtered = _fsFiltered();
  const totalEl  = document.getElementById('fs-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_feeSetupPage-1)*_feeSetupPerPage;
  const paged = filtered.slice(start, start+_feeSetupPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length/_feeSetupPerPage));

  let rows = paged.length===0
    ? `<tr><td colspan="9" class="fin-empty">No records found.</td></tr>`
    : paged.map(f=>`<tr>
        <td>${_finEsc(f.classCode||'')}</td>
        <td>${_finEsc(f.session||'-')}</td>
        <td>${_finEsc(f.sessionType||'-')}</td>
        <td>${_finEsc(f.academicYear||'-')}</td>
        <td>${_finEsc(f.studentName||'-')}</td>
        <td>${_finFmt(f.amount||0)}</td>
        <td>${_finEsc(f.status||'-')}</td>
        <td>${_finEsc(f.personnel||'-')}</td>
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
        <th>CLASS</th><th>SESSION</th><th>SESSION TYPE</th><th>ACADEMIC YEAR</th>
        <th>STUDENT NAME</th><th>AMOUNT</th><th>STATUS</th><th>PERSONNEL</th><th>ACTION</th>
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
  const fee = feeSetupPerClassData.find(f=>f.id===id);
  if (!fee) return;
  _renderFeeSetupDetailPage(document.getElementById('main-content'), fee);
}

function _renderFeeSetupDetailPage(container, fee) {
  const liRows = (fee.lineItems||[]).map((li,i)=>`
    <tr><td>${i+1}</td><td>${_finEsc(li.account||'')}</td><td>${_finFmt(li.amount||0)}</td></tr>`).join('') ||
    `<tr><td colspan="3" class="fin-empty">No records found.</td></tr>`;
  const total = (fee.lineItems||[]).reduce((s,li)=>s+(li.amount||0),0);

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
        <div class="fin-info-item"><span class="fin-info-label">Class Code</span><span class="fin-info-value">${_finEsc(fee.classCode||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Session</span><span class="fin-info-value">${_finEsc(fee.session||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Student Type</span><span class="fin-info-value">${_finEsc(fee.studentType||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Session Type</span><span class="fin-info-value">${_finEsc(fee.sessionType||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Programme</span><span class="fin-info-value">${_finEsc(fee.programme||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Department</span><span class="fin-info-value">${_finEsc(fee.department||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Academic Year</span><span class="fin-info-value">${_finEsc(fee.academicYear||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Study Mode</span><span class="fin-info-value">${_finEsc(fee.studyMode||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Branch</span><span class="fin-info-value">${_finEsc(fee.branch||'-')}</span></div>
      </div>
      <div class="fin-section-label">Line Items</div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>SN</th><th>ACCOUNT VOTE/HEAD</th><th>AMOUNT</th></tr></thead>
        <tbody>${liRows}</tbody>
        <tfoot><tr class="fin-tfoot-total"><td colspan="2">Total Amount</td><td>${_finFmt(total)}</td></tr></tfoot>
      </table></div>
      <div class="fin-form-actions" style="margin-top:20px;">
        <button class="fin-btn-cancel" onclick="loadView('fin-fee-setup-per-class')">Back</button>
      </div>
    </div>`;
}

function renderFeeSetupAddPage(container) {
  const sessOpts = sessionData.map(s=>`<option value="${s.id}">${_finEsc(s.sessionName||'')}</option>`).join('');
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
            <label class="fin-form-label">Class Code <span class="fin-required">*</span></label>
            <input type="text" id="fs-class-code" class="fin-form-input">
            <span class="fin-field-error" id="fs-code-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Session <span class="fin-required">*</span></label>
            <select id="fs-session" class="fin-form-select">
              <option value="">Please Select</option>${sessOpts}
            </select>
            <span class="fin-field-error" id="fs-sess-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Student Type <span class="fin-required">*</span></label>
            <select id="fs-student-type" class="fin-form-select">
              <option value="">Please Select</option>
              <option value="Day">Day</option>
              <option value="Boarding">Boarding</option>
            </select>
            <span class="fin-field-error" id="fs-stype-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Session Type</label>
            <input type="text" id="fs-session-type" class="fin-form-input">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Programme</label>
            <input type="text" id="fs-programme" class="fin-form-input">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Department</label>
            <input type="text" id="fs-department" class="fin-form-input">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Academic Year</label>
            <input type="text" id="fs-acad-year" class="fin-form-input">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Study Mode</label>
            <input type="text" id="fs-study-mode" class="fin-form-input">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Branch</label>
            <input type="text" id="fs-branch" class="fin-form-input">
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

let _fsLiCount = 0;
function addFsLineItem() {
  const body = document.getElementById('fs-li-body');
  if (!body) return;
  const t = Date.now();
  const sn = body.querySelectorAll('tr').length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${sn}</td>
    <td><input class="fin-li-input" id="fs-li-acct-${t}" placeholder="Account Vote/Head"></td>
    <td><input type="number" class="fin-li-input" id="fs-li-amt-${t}" placeholder="0.00" step="0.01"></td>
    <td><button class="fin-btn-li-rm" onclick="this.closest('tr').remove()">&#10005;</button></td>`;
  body.appendChild(tr);
}

function submitFeeSetupAdd() {
  const code  = (document.getElementById('fs-class-code').value||'').trim();
  const sess  = document.getElementById('fs-session').value;
  const stype = document.getElementById('fs-student-type').value;
  let valid=true;
  document.getElementById('fs-code-err').textContent  = code  ? '' : 'This field is required.'; if(!code)  valid=false;
  document.getElementById('fs-sess-err').textContent  = sess  ? '' : 'This field is required.'; if(!sess)  valid=false;
  document.getElementById('fs-stype-err').textContent = stype ? '' : 'This field is required.'; if(!stype) valid=false;
  if (!valid) return;

  const lineItems = [];
  document.querySelectorAll('#fs-li-body tr').forEach(tr=>{
    const acctEl = tr.querySelector('[id^="fs-li-acct-"]');
    const amtEl  = tr.querySelector('[id^="fs-li-amt-"]');
    if (acctEl) lineItems.push({ account: acctEl.value, amount: parseFloat(amtEl?.value)||0 });
  });
  const total = lineItems.reduce((s,li)=>s+li.amount, 0);
  const sessRec = sessionData.find(s=>String(s.id)===String(sess));

  feeSetupPerClassData.push({
    id:           'fs-'+Date.now(),
    classCode:    code,
    session:      sessRec?.sessionName||sess,
    studentType:  stype,
    sessionType:  document.getElementById('fs-session-type').value||'-',
    programme:    document.getElementById('fs-programme').value||'-',
    department:   document.getElementById('fs-department').value||'-',
    academicYear: document.getElementById('fs-acad-year').value||'-',
    studyMode:    document.getElementById('fs-study-mode').value||'-',
    branch:       document.getElementById('fs-branch').value||'-',
    lineItems,
    amount:       total,
    notes:        document.getElementById('fs-notes').value||'',
    status:       'Active',
    personnel:    currentUser ? (currentUser.email||'-') : '-',
    studentName:  stype,
    createdDate:  _finToday()
  });
  loadView('fin-fee-setup-per-class');
}

// ==================== CHANGE 5: RECEIVE PAYMENTS ====================

let _rcvPayPerPage = 10, _rcvPayPage = 1, _rcvPaySearch = '';

async function loadReceivePaymentsView(container) {
  _rcvPayPage = 1; _rcvPaySearch = '';
  _renderRcvPayListPage(container);
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
        <div class="fin-info-item"><span class="fin-info-label">Programme</span><span class="fin-info-value">${_finEsc(pmt.programme||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Balance</span><span class="fin-info-value">${_finEsc(pmt.balance||'-')}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Branch</span><span class="fin-info-value">${_finEsc(pmt.branch||'-')}</span></div>
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
        `<option value="${s.id}" data-name="${_finEsc((s.first_name||'')+' '+(s.last_name||''))}" data-class="${_finEsc(s.class_name||'-')}" data-adm="${_finEsc(s.student_id||'-')}">
          ${_finEsc((s.first_name||'')+' '+(s.last_name||''))} (${_finEsc(s.student_id||'-')} / ${_finEsc(s.class_name||'-')})
        </option>`).join('');
    }
  } catch(_) {}

  const ledgerOpts = chartOfAccountsData.map(a =>
    `<option value="${a.id}">${_finEsc(a.accountName||'')}</option>`).join('');

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
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Other">Other</option>
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

function submitRcvPayAdd() {
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

  receivePaymentsData.push({
    id:           'rcv-'+Date.now(),
    receiptNo:    _finGenRefNo('RCP-', receivePaymentsData),
    receiveFrom:  from,
    studentId:    stu,
    studentLabel: `${stuName} (${stuAdm} / ${stuClass})`,
    name:         stuName,
    class:        stuClass,
    cohort:       '-',
    programme:    '-',
    balance:      '-',
    branch:       '-',
    ledger:       ledgerRec?.accountName || ledger,
    paymentMode:  mode,
    modeNo,
    docDate:      date,
    amount,
    costCenter:   '-',
    createdDate:  _finToday()
  });
  loadView('fin-receive-payments');
}

// ==================== CHANGE 7: CHART OF ACCOUNTS ====================

let _coaPerPage = 10, _coaPage = 1, _coaSearch = '';

function loadChartOfAccountsView(container) {
  _coaPage = 1; _coaSearch = '';
  _renderCoaListPage(container);
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
    (a.accountName||'').toLowerCase().includes(q) ||
    (a.accountType||'').toLowerCase().includes(q));
}

function _renderCoaTable() {
  const filtered = _coaFiltered();
  const totalEl  = document.getElementById('coa-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_coaPage-1)*_coaPerPage;
  const paged = filtered.slice(start, start+_coaPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length/_coaPerPage));

  let rows = paged.length===0
    ? `<tr><td colspan="9" class="fin-empty">No records found.</td></tr>`
    : paged.map(a=>`<tr>
        <td>${_finEsc(a.number||'')}</td>
        <td>${_finEsc(a.accountName||'')}</td>
        <td>${_finEsc(a.accountType||'-')}</td>
        <td>${_finEsc(a.parentAccount||'-')}</td>
        <td>${_finEsc(a.group||'-')}</td>
        <td>${_finEsc(a.subGroup||'-')}</td>
        <td>${_finEsc(a.status||'Active')}</td>
        <td>${_finEsc(a.personnel||'-')}</td>
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
        <th>GROUP</th><th>SUB GROUP</th><th>STATUS</th><th>PERSONNEL</th><th>ACTION</th>
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

function _coaFormHtml(acct) {
  const parentOpts = chartOfAccountsData
    .filter(a=> !acct || a.id!==acct.id)
    .map(a=>`<option value="${a.id}" ${acct?.childOf===a.id?'selected':''}>${_finEsc(a.accountName||'')}</option>`).join('');
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Number <span class="fin-required">*</span></label>
        <input type="text" id="coa-f-number" class="fin-form-input" value="${_finEsc(acct?.number||'')}" ${acct?'disabled':''}>
        <span class="fin-field-error" id="coa-f-number-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Account Name <span class="fin-required">*</span></label>
        <input type="text" id="coa-f-name" class="fin-form-input" value="${_finEsc(acct?.accountName||'')}">
        <span class="fin-field-error" id="coa-f-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Account Type <span class="fin-required">*</span></label>
        <select id="coa-f-type" class="fin-form-select">
          <option value="">Please Select</option>
          ${['Asset','Liability','Equity','Revenue','Expense'].map(t=>`<option value="${t}" ${acct?.accountType===t?'selected':''}>${t}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="coa-f-type-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Payment Ordering</label>
        <input type="number" id="coa-f-ordering" class="fin-form-input" value="${acct?.paymentOrdering||''}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Cash Flow Group <span class="fin-required">*</span></label>
        <select id="coa-f-cf-group" class="fin-form-select">
          <option value="">Please Select</option>
          ${['Operating','Investing','Financing'].map(g=>`<option value="${g}" ${acct?.cashFlowGroup===g?'selected':''}>${g}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="coa-f-cfg-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Cash Flow Subgroup Name</label>
        <input type="text" id="coa-f-cf-subgroup" class="fin-form-input" value="${_finEsc(acct?.cashFlowSubgroupName||'')}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Child of</label>
        <select id="coa-f-child-of" class="fin-form-select">
          <option value="">Please Select</option>${parentOpts}
        </select>
      </div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-check-label" style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="coa-f-fees-related" class="fin-cb" ${acct?.isStudentFeesRelated?'checked':''}> Student/Fees Related
      </label>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-check-label" style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="coa-f-budget-item" class="fin-cb" ${acct?.isBudgetItem?'checked':''}> Budget Item
      </label>
    </div>`;
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

function submitCoaAdd() {
  const num  = (document.getElementById('coa-f-number').value||'').trim();
  const name = (document.getElementById('coa-f-name').value||'').trim();
  const type = document.getElementById('coa-f-type').value;
  const cfg  = document.getElementById('coa-f-cf-group').value;
  let valid=true;
  document.getElementById('coa-f-number-err').textContent = num  ? '' : 'This field is required.'; if(!num)  valid=false;
  document.getElementById('coa-f-name-err').textContent   = name ? '' : 'This field is required.'; if(!name) valid=false;
  document.getElementById('coa-f-type-err').textContent   = type ? '' : 'This field is required.'; if(!type) valid=false;
  document.getElementById('coa-f-cfg-err').textContent    = cfg  ? '' : 'This field is required.'; if(!cfg)  valid=false;
  if (!valid) return;
  chartOfAccountsData.push({
    id:                    'coa-'+Date.now(),
    number:                num,
    accountName:           name,
    accountType:           type,
    paymentOrdering:       document.getElementById('coa-f-ordering').value||'',
    cashFlowGroup:         cfg,
    cashFlowSubgroupName:  document.getElementById('coa-f-cf-subgroup').value||'',
    childOf:               document.getElementById('coa-f-child-of').value||'',
    parentAccount:         chartOfAccountsData.find(a=>a.id===document.getElementById('coa-f-child-of').value)?.accountName||'-',
    group:                 cfg,
    subGroup:              document.getElementById('coa-f-cf-subgroup').value||'-',
    isStudentFeesRelated:  document.getElementById('coa-f-fees-related').checked,
    isBudgetItem:          document.getElementById('coa-f-budget-item').checked,
    status:                'Active',
    personnel:             currentUser?.email||'-'
  });
  loadView('fin-chart-of-accounts');
}

function openCoaEdit(id) {
  document.querySelectorAll('[id^="fin-coa-dd-"]').forEach(d=>d.style.display='none');
  const acct = chartOfAccountsData.find(a=>a.id===id);
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

function submitCoaEdit(id) {
  const idx  = chartOfAccountsData.findIndex(a=>a.id===id);
  if (idx===-1) return;
  const name = (document.getElementById('coa-f-name').value||'').trim();
  const type = document.getElementById('coa-f-type').value;
  const cfg  = document.getElementById('coa-f-cf-group').value;
  document.getElementById('coa-f-name-err').textContent = name ? '' : 'This field is required.';
  document.getElementById('coa-f-type-err').textContent = type ? '' : 'This field is required.';
  document.getElementById('coa-f-cfg-err').textContent  = cfg  ? '' : 'This field is required.';
  if (!name||!type||!cfg) return;
  chartOfAccountsData[idx] = { ...chartOfAccountsData[idx],
    accountName: name, accountType: type, cashFlowGroup: cfg,
    paymentOrdering: document.getElementById('coa-f-ordering').value||'',
    cashFlowSubgroupName: document.getElementById('coa-f-cf-subgroup').value||'',
    childOf: document.getElementById('coa-f-child-of').value||'',
    parentAccount: chartOfAccountsData.find(a=>a.id===document.getElementById('coa-f-child-of').value)?.accountName||'-',
    group: cfg,
    subGroup: document.getElementById('coa-f-cf-subgroup').value||'-',
    isStudentFeesRelated: document.getElementById('coa-f-fees-related').checked,
    isBudgetItem: document.getElementById('coa-f-budget-item').checked
  };
  loadView('fin-chart-of-accounts');
}

// ==================== CHANGE 8: FEE ACCOUNTS ====================

let _feeAcctPerPage = 10, _feeAcctPage = 1, _feeAcctSearch = '';

function loadFeeAccountsView(container) {
  _feeAcctPage = 1; _feeAcctSearch = '';
  _renderFeeAcctListPage(container);
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
    (a.accountName||'').toLowerCase().includes(q) ||
    (a.itemName||'').toLowerCase().includes(q));
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
        <td>${_finEsc(a.accountName||'')}</td>
        <td>${_finEsc(a.accountType||'-')}</td>
        <td>${_finEsc(a.parentAccount||'-')}</td>
        <td>${_finEsc(a.group||'-')}</td>
        <td>${_finEsc(a.subGroup||'-')}</td>
        <td>${_finEsc(a.itemName||'-')}</td>
        <td>${_finEsc(a.itemCode||'-')}</td>
        <td>${_finEsc(a.status||'Active')}</td>
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
  const parentOpts = chartOfAccountsData.map(a=>
    `<option value="${a.id}" ${acct?.childOf===a.id?'selected':''}>${_finEsc(a.accountName||'')}</option>`).join('');
  const typeOpts = ['Asset','Liability','Equity','Revenue','Expense'].map(t=>
    `<option value="${t}" ${acct?.accountType===t?'selected':''}>${t}</option>`).join('');
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Number <span class="fin-required">*</span></label>
        <input type="text" id="fa-f-number" class="fin-form-input" value="${_finEsc(acct?.number||'')}" ${acct?'disabled':''}>
        <span class="fin-field-error" id="fa-f-num-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Account Name <span class="fin-required">*</span></label>
        <input type="text" id="fa-f-name" class="fin-form-input" value="${_finEsc(acct?.accountName||'')}" ${acct?'disabled':''}>
        <span class="fin-field-error" id="fa-f-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Item Name <span class="fin-required">*</span></label>
        <input type="text" id="fa-f-item-name" class="fin-form-input" value="${_finEsc(acct?.itemName||'')}">
        <span class="fin-field-error" id="fa-f-iname-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Item Code <span class="fin-required">*</span></label>
        <input type="text" id="fa-f-item-code" class="fin-form-input" value="${_finEsc(acct?.itemCode||'')}">
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
        <input type="number" id="fa-f-ordering" class="fin-form-input" value="${acct?.paymentOrdering||''}">
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
          ${['Revenue','Expenses','Assets','Liabilities'].map(s=>`<option value="${s}" ${acct?.subGroup===s?'selected':''}>${s}</option>`).join('')}
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
        <input type="checkbox" id="fa-f-fees" class="fin-cb" ${acct?.isStudentFeesRelated?'checked':''}> Student/Fees Related
      </label>
    </div>
    <div class="fin-form-group">
      <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="fa-f-discount" class="fin-cb" ${acct?.isDiscountAccount?'checked':''}> Discount Account
      </label>
    </div>
    <div class="fin-form-group">
      <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="fa-f-budget" class="fin-cb" ${acct?.isBudgetItem?'checked':''}> Budget Item
      </label>
    </div>
    <div class="fin-form-group">
      <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
        <input type="checkbox" id="fa-f-deactivate" class="fin-cb" ${acct?.isDeactivated?'checked':''}> Deactivate/Activate
      </label>
    </div>`;
}

function renderFeeAcctAddPage(container) {
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

function submitFeeAcctAdd() {
  const num   = (document.getElementById('fa-f-number').value||'').trim();
  const name  = (document.getElementById('fa-f-name').value||'').trim();
  const iname = (document.getElementById('fa-f-item-name').value||'').trim();
  const icode = (document.getElementById('fa-f-item-code').value||'').trim();
  const type  = document.getElementById('fa-f-type').value;
  let valid=true;
  document.getElementById('fa-f-num-err').textContent   = num   ? '' : 'This field is required.'; if(!num)   valid=false;
  document.getElementById('fa-f-name-err').textContent  = name  ? '' : 'This field is required.'; if(!name)  valid=false;
  document.getElementById('fa-f-iname-err').textContent = iname ? '' : 'This field is required.'; if(!iname) valid=false;
  document.getElementById('fa-f-icode-err').textContent = icode ? '' : 'This field is required.'; if(!icode) valid=false;
  document.getElementById('fa-f-type-err').textContent  = type  ? '' : 'This field is required.'; if(!type)  valid=false;
  if (!valid) return;
  const childOfId = document.getElementById('fa-f-child-of').value;
  feeAccountsData.push({
    id:                    'fa-'+Date.now(),
    number:                num,
    accountName:           name,
    itemName:              iname,
    itemCode:              icode,
    accountType:           type,
    paymentOrdering:       document.getElementById('fa-f-ordering').value||'',
    childOf:               childOfId,
    parentAccount:         chartOfAccountsData.find(a=>a.id===childOfId)?.accountName||'-',
    group:                 document.getElementById('fa-f-group').value||'-',
    subGroup:              document.getElementById('fa-f-subgroup').value||'-',
    department:            document.getElementById('fa-f-dept').value||'-',
    isStudentFeesRelated:  document.getElementById('fa-f-fees').checked,
    isDiscountAccount:     document.getElementById('fa-f-discount').checked,
    isBudgetItem:          document.getElementById('fa-f-budget').checked,
    isDeactivated:         document.getElementById('fa-f-deactivate').checked,
    status:                document.getElementById('fa-f-deactivate').checked ? 'Inactive' : 'Active',
    personnel:             currentUser?.email||'-'
  });
  loadView('fin-fee-accounts');
}

function openFeeAcctEdit(id) {
  document.querySelectorAll('[id^="fin-fee-acct-dd-"]').forEach(d=>d.style.display='none');
  const acct = feeAccountsData.find(a=>a.id===id);
  if (!acct) return;
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

function submitFeeAcctEdit(id) {
  const idx   = feeAccountsData.findIndex(a=>a.id===id);
  if (idx===-1) return;
  const iname = (document.getElementById('fa-f-item-name').value||'').trim();
  const icode = (document.getElementById('fa-f-item-code').value||'').trim();
  const type  = document.getElementById('fa-f-type').value;
  document.getElementById('fa-f-iname-err').textContent = iname ? '' : 'This field is required.';
  document.getElementById('fa-f-icode-err').textContent = icode ? '' : 'This field is required.';
  document.getElementById('fa-f-type-err').textContent  = type  ? '' : 'This field is required.';
  if (!iname||!icode||!type) return;
  const childOfId = document.getElementById('fa-f-child-of').value;
  feeAccountsData[idx] = { ...feeAccountsData[idx],
    itemName: iname, itemCode: icode, accountType: type,
    paymentOrdering: document.getElementById('fa-f-ordering').value||'',
    childOf: childOfId,
    parentAccount: chartOfAccountsData.find(a=>a.id===childOfId)?.accountName||'-',
    group:     document.getElementById('fa-f-group').value||'-',
    subGroup:  document.getElementById('fa-f-subgroup').value||'-',
    department: document.getElementById('fa-f-dept').value||'-',
    isStudentFeesRelated: document.getElementById('fa-f-fees').checked,
    isDiscountAccount:    document.getElementById('fa-f-discount').checked,
    isBudgetItem:         document.getElementById('fa-f-budget').checked,
    isDeactivated:        document.getElementById('fa-f-deactivate').checked,
    status: document.getElementById('fa-f-deactivate').checked ? 'Inactive' : 'Active'
  };
  loadView('fin-fee-accounts');
}
