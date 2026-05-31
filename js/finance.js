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
  } catch(_) { return []; }
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
