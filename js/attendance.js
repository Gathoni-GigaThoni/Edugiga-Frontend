// ==================== ATTENDANCE REGISTER ====================

let _attClassesData  = [];
let _attLevelsData   = [];
let _attSessionsData = [];
let _attStudents     = [];
let _attLoaded       = false;

async function loadAttendanceView(container) {
  _attLoaded = false;
  _attStudents = [];

  // Fetch dropdown data in parallel before rendering
  try {
    const [clsRes, lvlRes, sessRes] = await Promise.all([
      fetch(`${API_BASE}/classes/`,         { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/academic-levels/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/sessions/`,        { headers: { Authorization: `Bearer ${token}` } })
    ]);
    _attClassesData  = clsRes.ok  ? await clsRes.json()  : [];
    _attLevelsData   = lvlRes.ok  ? await lvlRes.json()  : [];
    const rawSess    = sessRes.ok ? await sessRes.json() : [];
    _attSessionsData = (Array.isArray(rawSess) ? rawSess : (rawSess.data || rawSess.results || []))
      .filter(s => !s.is_inactive);
  } catch(_) {
    _attClassesData  = [];
    _attLevelsData   = [];
    _attSessionsData = [];
  }

  const today = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Attendance Register</h2>
        <div class="sa-breadcrumb">Dashboard &rsaquo; Student Academics &rsaquo; Attendance Register</div>
      </div>

      <!-- Filter Bar -->
      <div class="sa-filter-bar">
        <div class="sa-filter-grid">

          <div class="sa-filter-field">
            <label class="sa-filter-label">Session <span class="sa-required">*</span></label>
            <select id="att-session" class="sa-filter-select">
              <option value="">-- Select Session --</option>
              ${_attSessionsData.map(s => `<option value="${s.id}">${s.title || s.name || ''}</option>`).join('')}
            </select>
            <span class="sa-field-error" id="att-session-err"></span>
          </div>

          <div class="sa-filter-field">
            <label class="sa-filter-label">Class</label>
            <select id="att-class" class="sa-filter-select">
              <option value="">-- Select Class --</option>
              ${_attClassesData.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>

          <div class="sa-filter-field">
            <label class="sa-filter-label">Attendance Schedule <span class="sa-required">*</span></label>
            <select id="att-schedule" class="sa-filter-select">
              <option value="">-- Select Schedule --</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <span class="sa-field-error" id="att-schedule-err"></span>
          </div>

          <div class="sa-filter-field">
            <label class="sa-filter-label">Stage <span class="sa-required">*</span></label>
            <select id="att-stage" class="sa-filter-select">
              <option value="">-- Select Stage --</option>
              ${_attLevelsData.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
            </select>
            <span class="sa-field-error" id="att-stage-err"></span>
          </div>

          <div class="sa-filter-field">
            <label class="sa-filter-label">Stream</label>
            <select id="att-stream" class="sa-filter-select">
              <option value="">-- Select Stream --</option>
              <option value="a">Stream A</option>
              <option value="b">Stream B</option>
              <option value="c">Stream C</option>
            </select>
          </div>

          <div class="sa-filter-field">
            <label class="sa-filter-label">Date</label>
            <input type="date" id="att-date" class="sa-filter-input" value="${today}">
          </div>

          <div class="sa-filter-field">
            <label class="sa-filter-label">Student</label>
            <input type="text" id="att-student" class="sa-filter-input" placeholder="Search by name...">
          </div>

        </div>
        <div class="sa-filter-actions">
          <button class="sa-btn-load" onclick="attLoadClass()">Load Class</button>
          <button class="sa-btn-clear" onclick="attClearFilters()">Clear</button>
        </div>
      </div>

      <!-- Student Table — hidden until Load Class is clicked -->
      <div id="att-table-section" style="display:none;">
        <div id="att-table-wrap"></div>
        <div class="sa-mark-attend-row">
          <button class="sa-btn-mark-attend" onclick="attMarkAttendance()">Mark Attendance</button>
        </div>
      </div>

      <div id="att-status-msg"></div>
    </div>
  `;
}

function _attValidateFilters() {
  let valid = true;
  const required = [
    { id: 'att-session',  errId: 'att-session-err'  },
    { id: 'att-schedule', errId: 'att-schedule-err' },
    { id: 'att-stage',    errId: 'att-stage-err'    },
  ];
  required.forEach(f => {
    const el  = document.getElementById(f.id);
    const err = document.getElementById(f.errId);
    if (!el || !el.value) {
      if (err) err.textContent = 'This field is required.';
      valid = false;
    } else {
      if (err) err.textContent = '';
    }
  });
  return valid;
}

async function attLoadClass() {
  if (!_attValidateFilters()) return;

  const date          = (document.getElementById('att-date').value    || new Date().toISOString().split('T')[0]);
  const studentFilter = (document.getElementById('att-student').value || '').trim().toLowerCase();
  const tableSection  = document.getElementById('att-table-section');
  const tableWrap     = document.getElementById('att-table-wrap');

  tableSection.style.display = 'block';
  tableWrap.innerHTML = '<p class="sa-loading">Loading class sheet&#8230;</p>';

  try {
    const params = new URLSearchParams({ class_date: date });
    const session = document.getElementById('att-session')?.value;
    const cls     = document.getElementById('att-class')?.value;
    const stage   = document.getElementById('att-stage')?.value;
    const stream  = document.getElementById('att-stream')?.value;
    if (session) params.set('session_id', session);
    if (cls)     params.set('class_id',   cls);
    if (stage)   params.set('stage_id',   stage);
    if (stream)  params.set('stream',     stream);

    const res  = await fetch(`${API_BASE}/attendance/class-sheet?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (!res.ok) {
      tableWrap.innerHTML = `<p class="sa-error-msg">${data.detail || 'Error loading class sheet.'}</p>`;
      _attLoaded = false;
      return;
    }

    let students = Array.isArray(data.students) ? data.students : [];
    if (studentFilter) {
      students = students.filter(s => (s.student_name || '').toLowerCase().includes(studentFilter));
    }

    _attStudents = students;
    _attLoaded   = true;
    _attRenderTable(tableWrap, students);

  } catch(e) {
    tableWrap.innerHTML = '<p class="sa-error-msg">Failed to load class sheet. Please try again.</p>';
    _attLoaded = false;
  }
}

function _attRenderTable(container, students) {
  if (students.length === 0) {
    container.innerHTML = '<p class="sa-empty-msg">No students found for the selected filters.</p>';
    return;
  }

  let rows = '';
  students.forEach(s => {
    rows += `
      <tr id="att-row-${s.student_id}">
        <td>${s.student_id}</td>
        <td>${s.student_name || ''}</td>
        <td>
          <select id="att-status-${s.student_id}" class="sa-table-select">
            <option value="">Select status</option>
            <option value="Present">Present</option>
            <option value="Absent">Absent</option>
            <option value="Half Day">Half Day</option>
          </select>
          <span class="sa-field-error" id="att-status-err-${s.student_id}"></span>
        </td>
        <td>
          <input type="text" id="att-reason-${s.student_id}" class="sa-table-input" placeholder="Reason (optional)">
        </td>
      </tr>
    `;
  });

  container.innerHTML = `
    <div class="sa-table-wrap">
      <table class="sa-table">
        <thead>
          <tr>
            <th>STUDENT ID</th>
            <th>FULL NAME</th>
            <th>STATUS</th>
            <th>REASON</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function attClearFilters() {
  ['att-session','att-class','att-schedule','att-stage','att-stream','att-student'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dateEl = document.getElementById('att-date');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  ['att-session-err','att-schedule-err','att-stage-err'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });

  const tableSection = document.getElementById('att-table-section');
  if (tableSection) tableSection.style.display = 'none';

  _attLoaded   = false;
  _attStudents = [];
}

async function attMarkAttendance() {
  if (!_attLoaded || _attStudents.length === 0) return;

  let valid   = true;
  const entries = [];

  _attStudents.forEach(s => {
    const statusEl = document.getElementById(`att-status-${s.student_id}`);
    const reasonEl = document.getElementById(`att-reason-${s.student_id}`);
    const errEl    = document.getElementById(`att-status-err-${s.student_id}`);

    if (!statusEl || !statusEl.value) {
      if (errEl) errEl.textContent = 'Status required.';
      valid = false;
    } else {
      if (errEl) errEl.textContent = '';
      // "Half Day" is a UI label — map to "Late" for the API (closest equivalent)
      const apiStatus = statusEl.value === 'Half Day' ? 'Late' : statusEl.value;
      entries.push({
        student_id: s.student_id,
        status: apiStatus,
        notes: reasonEl ? reasonEl.value : ''
      });
    }
  });

  if (!valid) return;

  const date   = (document.getElementById('att-date').value || new Date().toISOString().split('T')[0]);
  const msgEl  = document.getElementById('att-status-msg');

  try {
    const res = await fetch(`${API_BASE}/attendance/bulk?class_date=${date}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(entries)
    });

    if (res.ok) {
      if (msgEl) {
        msgEl.innerHTML = '<div class="sa-toast sa-toast-success">Attendance saved successfully!</div>';
        setTimeout(() => { if (msgEl) msgEl.innerHTML = ''; }, 4000);
      }
    } else {
      const err = await res.json();
      if (msgEl) msgEl.innerHTML = `<div class="sa-toast sa-toast-error">${await parseApiError(res) || 'Error saving attendance.'}</div>`;
    }
  } catch(e) {
    if (msgEl) msgEl.innerHTML = '<div class="sa-toast sa-toast-error">Failed to save attendance. Please try again.</div>';
  }
}

// ==================== ATTENDANCE REGISTER REPORT ====================

let _rptData      = [];
let _rptPage      = 1;
let _rptPerPage   = 10;
let _rptSearch    = '';

async function loadAttendanceRegisterReportView(container) {
  _rptData    = [];
  _rptPage    = 1;
  _rptSearch  = '';

  // Populate dropdowns in parallel
  try {
    const [clsRes, lvlRes, sessRes] = await Promise.all([
      fetch(`${API_BASE}/classes/`,         { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/academic-levels/`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/sessions/`,        { headers: { Authorization: `Bearer ${token}` } })
    ]);
    _attClassesData  = clsRes.ok  ? await clsRes.json()  : [];
    _attLevelsData   = lvlRes.ok  ? await lvlRes.json()  : [];
    const rawSess    = sessRes.ok ? await sessRes.json() : [];
    _attSessionsData = (Array.isArray(rawSess) ? rawSess : (rawSess.data || rawSess.results || []))
      .filter(s => !s.is_inactive);
  } catch(_) {}

  const today = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="sa-page">
      <!-- Header: title left, export buttons right -->
      <div class="sa-header-row">
        <div>
          <h2 class="sa-title">Reports</h2>
          <div class="sa-breadcrumb" style="text-align:left;padding-top:4px;">
            Dashboard &rsaquo; Report &rsaquo; Attendance Register Report
          </div>
        </div>
        <div class="sa-export-row">
          <button class="sa-btn-export" onclick="_rptPrint()" title="Print / PDF">&#128438; Print</button>
          <button class="sa-btn-export" onclick="_rptExportCSV()" title="Export CSV">&#128202; CSV</button>
        </div>
      </div>

      <!-- Filter bar -->
      <div class="sa-filter-bar">
        <!-- Row 1 -->
        <div class="sa-filter-grid" style="grid-template-columns:repeat(4,1fr);">
          <div class="sa-filter-field">
            <label class="sa-filter-label">Session <span class="sa-required">*</span></label>
            <select id="rpt-session" class="sa-filter-select">
              <option value="">-- Select Session --</option>
              ${_attSessionsData.map(s => `<option value="${s.id}">${_rptEsc(s.title || s.name || '')}</option>`).join('')}
            </select>
            <span class="sa-field-error" id="rpt-session-err"></span>
          </div>
          <div class="sa-filter-field">
            <label class="sa-filter-label">Attendance Schedule</label>
            <select id="rpt-schedule" class="sa-filter-select">
              <option value="">-- Select Schedule --</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div class="sa-filter-field">
            <label class="sa-filter-label">Stage <span class="sa-required">*</span></label>
            <select id="rpt-stage" class="sa-filter-select">
              <option value="">-- Select Stage --</option>
              ${_attLevelsData.map(l => `<option value="${l.id}">${_rptEsc(l.name)}</option>`).join('')}
            </select>
            <span class="sa-field-error" id="rpt-stage-err"></span>
          </div>
          <div class="sa-filter-field">
            <label class="sa-filter-label">Status</label>
            <select id="rpt-status" class="sa-filter-select">
              <option value="">Select status</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Half Day">Half Day</option>
            </select>
          </div>
        </div>
        <!-- Row 2 -->
        <div class="sa-filter-grid" style="grid-template-columns:repeat(4,1fr);margin-top:14px;">
          <div class="sa-filter-field">
            <label class="sa-filter-label">Stream</label>
            <select id="rpt-stream" class="sa-filter-select">
              <option value="">-- Select Stream --</option>
              <option value="a">Stream A</option>
              <option value="b">Stream B</option>
              <option value="c">Stream C</option>
            </select>
          </div>
          <div class="sa-filter-field">
            <label class="sa-filter-label">Start Date <span class="sa-required">*</span></label>
            <input type="date" id="rpt-start-date" class="sa-filter-input" value="${today}">
            <span class="sa-field-error" id="rpt-start-err"></span>
          </div>
          <div class="sa-filter-field">
            <label class="sa-filter-label">End Date <span class="sa-required">*</span></label>
            <input type="date" id="rpt-end-date" class="sa-filter-input" value="${today}">
            <span class="sa-field-error" id="rpt-end-err"></span>
          </div>
          <div class="sa-filter-field">
            <label class="sa-filter-label">Gender</label>
            <select id="rpt-gender" class="sa-filter-select">
              <option value="">All</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        </div>
        <!-- Row 3: Student + buttons -->
        <div class="sa-rpt-actions-row" style="margin-top:14px;">
          <div class="sa-rpt-student-field">
            <label class="sa-filter-label">Student</label>
            <input type="text" id="rpt-student" class="sa-filter-input" placeholder="Search by name...">
          </div>
          <button class="sa-btn-load" onclick="_rptSubmit()">Submit</button>
          <button class="sa-btn-clear-dark" onclick="_rptClear()">Clear</button>
        </div>
      </div>

      <!-- Summary stat cards (always visible) -->
      <div class="sa-stats-row">
        <div class="sa-stat-card">
          <div class="sa-stat-label">Expected</div>
          <div class="sa-stat-value" id="rpt-stat-expected">0</div>
        </div>
        <div class="sa-stat-card">
          <div class="sa-stat-label">Present</div>
          <div class="sa-stat-value" id="rpt-stat-present">0</div>
        </div>
        <div class="sa-stat-card">
          <div class="sa-stat-label">Absent</div>
          <div class="sa-stat-value" id="rpt-stat-absent">0</div>
        </div>
        <div class="sa-stat-card">
          <div class="sa-stat-label">Halfday</div>
          <div class="sa-stat-value" id="rpt-stat-halfday">0</div>
        </div>
      </div>

      <!-- Results table -->
      <div id="rpt-table-area">
        ${_rptBuildTableHTML([], 0)}
      </div>
    </div>
  `;
}

function _rptValidate() {
  let ok = true;
  [
    { id: 'rpt-session',    err: 'rpt-session-err'  },
    { id: 'rpt-stage',      err: 'rpt-stage-err'    },
    { id: 'rpt-start-date', err: 'rpt-start-err'    },
    { id: 'rpt-end-date',   err: 'rpt-end-err'      },
  ].forEach(f => {
    const el  = document.getElementById(f.id);
    const err = document.getElementById(f.err);
    if (!el || !el.value) { if (err) err.textContent = 'This field is required.'; ok = false; }
    else                  { if (err) err.textContent = ''; }
  });

  // Additional cross-field check: end date must not be before start date
  const startEl = document.getElementById('rpt-start-date');
  const endEl   = document.getElementById('rpt-end-date');
  const endErr  = document.getElementById('rpt-end-err');
  if (ok && startEl?.value && endEl?.value && endEl.value < startEl.value) {
    if (endErr) endErr.textContent = 'End date must be on or after start date.';
    ok = false;
  }

  return ok;
}

async function _rptSubmit() {
  if (!_rptValidate()) return;

  const startDate    = document.getElementById('rpt-start-date').value;
  const endDate      = document.getElementById('rpt-end-date').value;
  const stageEl      = document.getElementById('rpt-stage');
  const stageName    = stageEl.options[stageEl.selectedIndex]?.text || '';
  const statusFilter = document.getElementById('rpt-status').value;
  const studentFilter = (document.getElementById('rpt-student').value || '').trim().toLowerCase();

  document.getElementById('rpt-table-area').innerHTML = '<p class="sa-loading">Loading&#8230;</p>';

  try {
    // TODO: convert to apiFetch (raw fetch bypasses auth retry logic — out of scope for this patch)
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    const res  = await fetch(`${API_BASE}/attendance/class-sheet?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('rpt-table-area').innerHTML = `<p class="sa-error-msg">${data.detail || 'Error loading report.'}</p>`;
      return;
    }

    let rows = Array.isArray(data.students) ? data.students : [];

    if (studentFilter) rows = rows.filter(s => (s.student_name || '').toLowerCase().includes(studentFilter));
    if (statusFilter) {
      const apiStatus = statusFilter === 'Half Day' ? 'Late' : statusFilter;
      rows = rows.filter(s => s.current_status === apiStatus);
    }

    _rptData = rows.map(s => ({
      admission_no: '-',
      name:         s.student_name || '',
      gender:       '-',
      stage:        stageName,
      date:         startDate,
      status:       s.current_status === 'Late' ? 'Half Day' : (s.current_status || '-'),
      reason:       '-'
    }));

    // Update stat cards
    const present = _rptData.filter(r => r.status === 'Present').length;
    const absent  = _rptData.filter(r => r.status === 'Absent').length;
    const halfday = _rptData.filter(r => r.status === 'Half Day').length;
    document.getElementById('rpt-stat-expected').textContent = _rptData.length;
    document.getElementById('rpt-stat-present').textContent  = present;
    document.getElementById('rpt-stat-absent').textContent   = absent;
    document.getElementById('rpt-stat-halfday').textContent  = halfday;

    _rptPage   = 1;
    _rptSearch = '';
    document.getElementById('rpt-table-area').innerHTML = _rptBuildTableHTML(_rptData, _rptData.length);

  } catch(e) {
    document.getElementById('rpt-table-area').innerHTML = '<p class="sa-error-msg">Failed to load report. Please try again.</p>';
  }
}

function _rptBuildTableHTML(rows, total) {
  const start  = (_rptPage - 1) * _rptPerPage;
  const paged  = rows.slice(start, start + _rptPerPage);
  const pages  = Math.max(1, Math.ceil(rows.length / _rptPerPage));

  let bodyRows = '';
  if (paged.length === 0) {
    bodyRows = `<tr><td colspan="7" class="sa-empty">No record found.</td></tr>`;
  } else {
    paged.forEach(r => {
      bodyRows += `<tr>
        <td>${_rptEsc(r.admission_no)}</td>
        <td>${_rptEsc(r.name)}</td>
        <td>${_rptEsc(r.gender)}</td>
        <td>${_rptEsc(r.stage)}</td>
        <td>${_rptEsc(r.date)}</td>
        <td>${_rptEsc(r.status)}</td>
        <td>${_rptEsc(r.reason)}</td>
      </tr>`;
    });
  }

  let pgBtns = '';
  for (let i = 1; i <= pages; i++) {
    pgBtns += `<button class="${i === _rptPage ? 'sa-pg-active' : ''}" onclick="_rptGoPage(${i})">${i}</button>`;
  }

  return `
    <div class="sa-rpt-toolbar">
      <div class="sa-rpt-toolbar-left">
        Show <select onchange="_rptChangePerPage(this.value)">
          ${[10,25,50,100].map(n => `<option value="${n}" ${n===_rptPerPage?'selected':''}>${n}</option>`).join('')}
        </select> entries
        &nbsp;|&nbsp; Total <strong>${total}</strong> entries
      </div>
      <div class="sa-rpt-toolbar-right">
        <input type="text" class="sa-search-input" placeholder="&#128269; Search&#8230;"
               value="${_rptEsc(_rptSearch)}" oninput="_rptSearchChange(this.value)">
      </div>
    </div>
    <div class="sa-table-wrap">
      <table class="sa-table" id="rpt-result-table">
        <thead><tr>
          <th>ADMISSION NO.</th><th>NAME</th><th>GENDER</th><th>STAGE</th>
          <th>DATE</th><th>STATUS</th><th>REASON</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div class="sa-pagination">${pgBtns}</div>
  `;
}

function _rptSearchChange(val) {
  _rptSearch = val.trim().toLowerCase();
  _rptPage   = 1;
  const filtered = _rptSearch
    ? _rptData.filter(r => r.name.toLowerCase().includes(_rptSearch) || r.admission_no.toLowerCase().includes(_rptSearch))
    : _rptData;
  document.getElementById('rpt-table-area').innerHTML = _rptBuildTableHTML(filtered, filtered.length);
}

function _rptGoPage(p) {
  _rptPage = p;
  const filtered = _rptSearch
    ? _rptData.filter(r => r.name.toLowerCase().includes(_rptSearch) || r.admission_no.toLowerCase().includes(_rptSearch))
    : _rptData;
  document.getElementById('rpt-table-area').innerHTML = _rptBuildTableHTML(filtered, filtered.length);
}

function _rptChangePerPage(val) {
  _rptPerPage = parseInt(val);
  _rptPage    = 1;
  const filtered = _rptSearch
    ? _rptData.filter(r => r.name.toLowerCase().includes(_rptSearch) || r.admission_no.toLowerCase().includes(_rptSearch))
    : _rptData;
  document.getElementById('rpt-table-area').innerHTML = _rptBuildTableHTML(filtered, filtered.length);
}

function _rptClear() {
  ['rpt-session','rpt-schedule','rpt-stage','rpt-status','rpt-stream','rpt-gender','rpt-student'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const today = new Date().toISOString().split('T')[0];
  ['rpt-start-date','rpt-end-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
  ['rpt-session-err','rpt-stage-err','rpt-start-err','rpt-end-err'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  _rptData   = [];
  _rptPage   = 1;
  _rptSearch = '';
  ['rpt-stat-expected','rpt-stat-present','rpt-stat-absent','rpt-stat-halfday']
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0'; });
  document.getElementById('rpt-table-area').innerHTML = _rptBuildTableHTML([], 0);
}

function _rptPrint() {
  window.print();
}

function _rptExportCSV() {
  if (_rptData.length === 0) { alert('No data to export.'); return; }
  const headers = ['Admission No.','Name','Gender','Stage','Date','Status','Reason'];
  const rows    = _rptData.map(r => [r.admission_no, r.name, r.gender, r.stage, r.date, r.status, r.reason]);
  const csv     = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob    = new Blob([csv], { type: 'text/csv' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href = url; a.download = 'attendance-report.csv'; a.click();
  URL.revokeObjectURL(url);
}

function _rptEsc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
