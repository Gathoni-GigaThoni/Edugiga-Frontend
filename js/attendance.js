// ==================== ATTENDANCE REGISTER ====================

let _attClassesData  = [];
let _attLevelsData   = [];
let _attTermsData = [];
let _attSchedulesData = [];
let _attStudents     = [];
let _attLoaded       = false;

async function loadAttendanceView(container) {
  _attLoaded = false;
  _attStudents = [];

  // Fetch dropdown data in parallel before rendering. Academic Level isn't a
  // register filter (load-class/class-sheet don't accept it) so it isn't
  // fetched here — see the Report view below for that.
  try {
    const [clsRes, sessRes, schedRes] = await Promise.all([
      fetch(`${API_BASE}/classes/`,               { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/terms/`,                 { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/attendance-schedules`,   { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    _attClassesData  = clsRes.ok  ? await clsRes.json()  : [];
    const rawSess  = sessRes.ok ? await sessRes.json() : [];
    _attTermsData  = (Array.isArray(rawSess) ? rawSess : (rawSess.data || rawSess.results || []))
      .filter(t => t.is_active !== false);
    _attSchedulesData = schedRes.ok ? await schedRes.json() : [];
  } catch(_) {
    _attClassesData  = [];
    _attTermsData    = [];
    _attSchedulesData = [];
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
            <label class="sa-filter-label">Term <span class="sa-required">*</span></label>
            <select id="att-term" class="sa-filter-select">
              <option value="">-- Select Term --</option>
              ${_attTermsData.map(t => `<option value="${t.id}">${t.title || t.name || ''}</option>`).join('')}
            </select>
            <span class="sa-field-error" id="att-term-err"></span>
          </div>

          <div class="sa-filter-field">
            <label class="sa-filter-label">Class <span class="sa-required">*</span></label>
            <select id="att-class" class="sa-filter-select">
              <option value="">-- Select Class --</option>
              ${_attClassesData.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
            <span class="sa-field-error" id="att-class-err"></span>
          </div>

          <div class="sa-filter-field">
            <label class="sa-filter-label">Attendance Schedule</label>
            <select id="att-schedule" class="sa-filter-select">
              <option value="">-- Not set --</option>
              ${_attSchedulesData.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
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
          <button class="sa-btn-export" onclick="_attUploadPickFile()" title="Upload attendance a class recorded in a CSV/Excel sheet, for one day or many">&#128228; Upload Attendance</button>
          <button class="sa-btn-export" onclick="_attDownloadUploadTemplate()" title="Download the expected CSV template">&#128196; Template</button>
          <input type="file" id="att-upload-file" accept=".csv,.xlsx,.xls" style="display:none;" onchange="_attUploadAttendanceFile(this)">
        </div>
      </div>

      <div id="att-upload-result"></div>

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
    { id: 'att-term',     errId: 'att-term-err'     },
    { id: 'att-class',    errId: 'att-class-err'    },
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
    const params = new URLSearchParams({ date_of: date });
    const term     = document.getElementById('att-term')?.value;
    const cls      = document.getElementById('att-class')?.value;
    const schedule = document.getElementById('att-schedule')?.value;
    const stream   = document.getElementById('att-stream')?.value;
    if (term)     params.set('term_id', term);
    if (cls)      params.set('class_id',   cls);
    if (schedule) params.set('attendance_schedule_id', schedule);
    if (stream)   params.set('stream',     stream);

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
      students = students.filter(s => (s.full_name || '').toLowerCase().includes(studentFilter));
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
        <td>${s.student_id_number || s.student_id}</td>
        <td>${s.full_name || ''}</td>
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
  ['att-term','att-class','att-schedule','att-stream','att-student'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dateEl = document.getElementById('att-date');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  ['att-term-err','att-class-err'].forEach(id => {
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
  const records = [];

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
      const reason = reasonEl ? reasonEl.value : '';
      records.push({ student_id: s.student_id, status: apiStatus, reason, notes: reason });
    }
  });

  if (!valid) return;

  const date     = (document.getElementById('att-date').value || new Date().toISOString().split('T')[0]);
  const term     = document.getElementById('att-term')?.value;
  const cls      = document.getElementById('att-class')?.value;
  const schedule = document.getElementById('att-schedule')?.value;
  const stream   = document.getElementById('att-stream')?.value;
  const msgEl    = document.getElementById('att-status-msg');

  // POST /attendance/bulk expects a BulkAttendanceRequest body (term_id,
  // class_id, date, records[]) — not a bare array with class_date on the
  // query string, which the backend rejects with a 422.
  const payload = { term_id: parseInt(term, 10), class_id: parseInt(cls, 10), date, records };
  if (schedule) payload.attendance_schedule_id = parseInt(schedule, 10);
  if (stream)   payload.stream = stream;

  try {
    const res = await apiFetch(`${API_BASE}/attendance/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res && res.ok) {
      if (msgEl) {
        msgEl.innerHTML = '<div class="sa-toast sa-toast-success">Attendance saved successfully!</div>';
        setTimeout(() => { if (msgEl) msgEl.innerHTML = ''; }, 4000);
      }
    } else {
      if (msgEl) msgEl.innerHTML = `<div class="sa-toast sa-toast-error">${res ? (await parseApiError(res)) : 'Network error.'}</div>`;
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
    const [clsRes, sessRes, schedRes] = await Promise.all([
      fetch(`${API_BASE}/classes/`,               { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/terms/`,                 { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/attendance-schedules`,   { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    _attClassesData  = clsRes.ok  ? await clsRes.json()  : [];
    const rawSess  = sessRes.ok ? await sessRes.json() : [];
    _attTermsData  = (Array.isArray(rawSess) ? rawSess : (rawSess.data || rawSess.results || []))
      .filter(t => t.is_active !== false);
    _attSchedulesData = schedRes.ok ? await schedRes.json() : [];
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
          <button class="sa-btn-export" onclick="_rptExportExcel()" title="Export Excel">&#128202; Excel</button>
        </div>
      </div>

      <!-- Filter bar -->
      <div class="sa-filter-bar">
        <!-- Row 1 -->
        <div class="sa-filter-grid" style="grid-template-columns:repeat(4,1fr);">
          <div class="sa-filter-field">
            <label class="sa-filter-label">Term <span class="sa-required">*</span></label>
            <select id="rpt-term" class="sa-filter-select">
              <option value="">-- Select Term --</option>
              ${_attTermsData.map(t => `<option value="${t.id}">${_rptEsc(t.title || t.name || '')}</option>`).join('')}
            </select>
            <span class="sa-field-error" id="rpt-term-err"></span>
          </div>
          <div class="sa-filter-field">
            <label class="sa-filter-label">Attendance Schedule</label>
            <select id="rpt-schedule" class="sa-filter-select">
              <option value="">-- Not set --</option>
              ${_attSchedulesData.map(s => `<option value="${s.id}">${_rptEsc(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="sa-filter-field">
            <label class="sa-filter-label">Class <span class="sa-required">*</span></label>
            <select id="rpt-class" class="sa-filter-select">
              <option value="">-- Select Class --</option>
              ${_attClassesData.map(c => `<option value="${c.id}">${_rptEsc(c.name)}</option>`).join('')}
            </select>
            <span class="sa-field-error" id="rpt-class-err"></span>
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
    { id: 'rpt-term',       err: 'rpt-term-err'     },
    { id: 'rpt-class',      err: 'rpt-class-err'    },
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

  const startDate      = document.getElementById('rpt-start-date').value;
  const endDate        = document.getElementById('rpt-end-date').value;
  const termId         = document.getElementById('rpt-term').value;
  const classId        = document.getElementById('rpt-class').value;
  const classEl        = document.getElementById('rpt-class');
  const className      = classEl.options[classEl.selectedIndex]?.text || '';
  const scheduleId     = document.getElementById('rpt-schedule').value;
  const statusFilter   = document.getElementById('rpt-status').value;
  const streamFilter   = document.getElementById('rpt-stream').value;
  const genderFilter   = document.getElementById('rpt-gender').value;
  const studentFilter  = (document.getElementById('rpt-student').value || '').trim();

  document.getElementById('rpt-table-area').innerHTML = '<p class="sa-loading">Loading&#8230;</p>';

  try {
    // TODO: convert to apiFetch (raw fetch bypasses auth retry logic — out of scope for this patch)
    // GET /attendance/report requires term_id, class_id, start_date, end_date.
    // attendance_schedule_id is optional.
    const params = new URLSearchParams({ term_id: termId, class_id: classId, start_date: startDate, end_date: endDate });
    if (scheduleId)    params.set('attendance_schedule_id', scheduleId);
    if (streamFilter)  params.set('stream_id', streamFilter);
    if (statusFilter)  params.set('status', statusFilter === 'Half Day' ? 'Late' : statusFilter);
    if (genderFilter)  params.set('gender', genderFilter);
    if (studentFilter) params.set('student_search', studentFilter);

    const res  = await fetch(`${API_BASE}/attendance/report?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      document.getElementById('rpt-table-area').innerHTML = `<p class="sa-error-msg">${await parseApiError(res) || 'Error loading report.'}</p>`;
      return;
    }
    const data = await res.json();

    // Confirmed live shape: { summary: {expected,present,absent,late}, records: [...] }
    // — rows live under `records`, not `students`/`results`/`data` (the previous
    // fallback chain didn't include it, so rows silently came out empty on every
    // submit — indistinguishable from "nothing happened" since the pre-submit
    // state is also empty). Field names on each record are exactly admission_no/
    // name/gender/class_name/date/status/notes, no guessing needed.
    const rows = Array.isArray(data) ? data : (data.records || []);

    _rptData = rows.map(s => ({
      admission_no: s.admission_no || '-',
      name:         s.name || '',
      gender:       s.gender || '-',
      class_name:   s.class_name || className,
      date:         s.date || startDate,
      status:       s.status === 'Late' ? 'Half Day' : (s.status || '-'),
      reason:       s.notes || '-'
    }));

    // Update stat cards — prefer the server's own summary block (covers the
    // full date range server-side) over a client count of the current page.
    const summary = data.summary || {};
    document.getElementById('rpt-stat-expected').textContent = summary.expected ?? _rptData.length;
    document.getElementById('rpt-stat-present').textContent  = summary.present  ?? _rptData.filter(r => r.status === 'Present').length;
    document.getElementById('rpt-stat-absent').textContent   = summary.absent   ?? _rptData.filter(r => r.status === 'Absent').length;
    document.getElementById('rpt-stat-halfday').textContent  = summary.late     ?? _rptData.filter(r => r.status === 'Half Day').length;

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
        <td>${_rptEsc(r.class_name)}</td>
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
          <th>ADMISSION NO.</th><th>NAME</th><th>GENDER</th><th>CLASS</th>
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
  ['rpt-term','rpt-schedule','rpt-class','rpt-status','rpt-stream','rpt-gender','rpt-student'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const today = new Date().toISOString().split('T')[0];
  ['rpt-start-date','rpt-end-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
  ['rpt-term-err','rpt-class-err','rpt-start-err','rpt-end-err'].forEach(id => {
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
  const headers = ['Admission No.','Name','Gender','Class','Date','Status','Reason'];
  const rows    = _rptData.map(r => [r.admission_no, r.name, r.gender, r.class_name, r.date, r.status, r.reason]);
  const csv     = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob    = new Blob([csv], { type: 'text/csv' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href = url; a.download = 'attendance-report.csv'; a.click();
  URL.revokeObjectURL(url);
}

function _rptExportExcel() {
  if (_rptData.length === 0) { alert('No data to export.'); return; }
  if (typeof XLSX === 'undefined') { showToast('Excel export library failed to load. Please check your connection and reload.', 'error'); return; }
  const headers = ['Admission No.','Name','Gender','Class','Date','Status','Reason'];
  const rows    = _rptData.map(r => [r.admission_no, r.name, r.gender, r.class_name, r.date, r.status, r.reason]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
  XLSX.writeFile(wb, 'attendance-report.xlsx');
}

// ==================== ATTENDANCE UPLOAD (CSV/Excel) ====================
// Lets a class that recorded attendance offline in a spreadsheet (one day, or
// many days in one sheet) bulk-import it. POST /attendance/bulk requires a
// BulkAttendanceRequest body — term_id, class_id, date, records[] (confirmed
// live via openapi.json) — so Term/Class/Attendance Schedule/Stream must be
// selected in the filter bar above (same fields attLoadClass() uses) before
// uploading; the sheet itself only needs Student ID, Date, Status, Reason
// since one file can cover many dates for that one class.

const _ATT_UPLOAD_HEADERS = ['Student ID', 'Date', 'Status', 'Reason'];

function _attUploadPickFile() {
  if (!_attValidateFilters()) {
    showToast('Select Term, Class, Attendance Schedule and Level first — the upload applies to that one class.', 'error');
    return;
  }
  document.getElementById('att-upload-file').click();
}

function _attDownloadUploadTemplate() {
  const sample = [
    _ATT_UPLOAD_HEADERS,
    ['101', new Date().toISOString().split('T')[0], 'Present', ''],
    ['102', new Date().toISOString().split('T')[0], 'Absent', 'Sick'],
  ];
  const csv  = sample.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'attendance-upload-template.csv'; a.click();
  URL.revokeObjectURL(url);
}

// Reads a .csv/.xlsx/.xls File and resolves to an array of row objects
// (raw header text as keys, e.g. { 'Student ID': '101', 'Date': '2026-07-03', ... }).
function _attParseSheetFile(file) {
  return new Promise((resolve, reject) => {
    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = (e) => {
      try {
        if (isCsv) {
          resolve(_attParseCSV(String(e.target.result)));
        } else {
          if (typeof XLSX === 'undefined') { reject(new Error('Excel parser failed to load. Please check your connection and reload.')); return; }
          const wb    = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
        }
      } catch (err) { reject(err); }
    };
    if (isCsv) reader.readAsText(file);
    else       reader.readAsArrayBuffer(file);
  });
}

function _attParseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return [];
  const splitLine = line => {
    const cells = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  };
  const headers = splitLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = splitLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

// Maps a raw parsed row (arbitrary header spelling) to { student_id, date, status, notes }.
function _attNormalizeUploadRow(row) {
  const getRaw = (...keys) => {
    for (const k of Object.keys(row)) {
      if (keys.includes(k.trim().toLowerCase().replace(/[\s_]+/g, ' '))) return row[k];
    }
    return '';
  };
  const studentId = String(getRaw('student id', 'studentid', 'id') ?? '').trim();
  const statusRaw = String(getRaw('status') ?? '').trim();
  const notes     = String(getRaw('reason', 'notes', 'comment') ?? '').trim();

  // Date cells come through as JS Date objects (cellDates:true) for real Excel
  // dates, raw serial numbers for some numeric-formatted cells, or plain text
  // for CSV files — handle all three.
  const dateRaw = getRaw('date', 'class date', 'attendance date');
  let date = '';
  if (dateRaw instanceof Date && !isNaN(dateRaw)) {
    date = dateRaw.toISOString().split('T')[0];
  } else {
    const dateStr = String(dateRaw ?? '').trim();
    if (/^\d+(\.\d+)?$/.test(dateStr) && typeof XLSX !== 'undefined' && XLSX.SSF) {
      const parsed = XLSX.SSF.parse_date_code(Number(dateStr));
      date = parsed ? `${parsed.y}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}` : dateStr;
    } else {
      date = dateStr;
    }
  }

  let status = '';
  const s = statusRaw.trim().toLowerCase();
  if (['present','p'].includes(s)) status = 'Present';
  else if (['absent','a'].includes(s)) status = 'Absent';
  else if (['half day','halfday','late','h'].includes(s)) status = 'Late';
  else if (statusRaw) status = statusRaw.trim();

  return { student_id: studentId, date, status, notes };
}

async function _attUploadAttendanceFile(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  const resultEl = document.getElementById('att-upload-result');
  if (resultEl) resultEl.innerHTML = '<p class="sa-loading">Reading file&#8230;</p>';

  let rawRows;
  try {
    rawRows = await _attParseSheetFile(file);
  } catch (err) {
    if (resultEl) resultEl.innerHTML = `<p class="sa-error-msg">${err.message || 'Failed to read file.'}</p>`;
    inputEl.value = '';
    return;
  }
  inputEl.value = '';

  const normalized = rawRows.map(_attNormalizeUploadRow);
  const invalid = normalized.filter(r => !r.student_id || !r.date || !r.status);
  const valid   = normalized.filter(r => r.student_id && r.date && r.status);

  if (valid.length === 0) {
    if (resultEl) resultEl.innerHTML = `<p class="sa-error-msg">No valid rows found. Each row needs Student ID, Date and Status — see the Template.</p>`;
    return;
  }

  if (resultEl) resultEl.innerHTML = `<p class="sa-loading">Uploading ${valid.length} record(s)&#8230;</p>`;

  // One class per upload (the filters above), one /attendance/bulk call per
  // distinct date in the sheet.
  const term     = document.getElementById('att-term')?.value;
  const cls      = document.getElementById('att-class')?.value;
  const schedule = document.getElementById('att-schedule')?.value;
  const stream   = document.getElementById('att-stream')?.value;

  const byDate = {};
  valid.forEach(r => {
    (byDate[r.date] = byDate[r.date] || []).push({ student_id: parseInt(r.student_id, 10), status: r.status, reason: r.notes, notes: r.notes });
  });

  let importedCount = 0;
  const errors = [];
  for (const date of Object.keys(byDate)) {
    const payload = { term_id: parseInt(term, 10), class_id: parseInt(cls, 10), date, records: byDate[date] };
    if (schedule) payload.attendance_schedule_id = parseInt(schedule, 10);
    if (stream)   payload.stream = stream;
    try {
      const res = await apiFetch(`${API_BASE}/attendance/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res && res.ok) importedCount += byDate[date].length;
      else errors.push(`${date}: ${res ? await parseApiError(res) : 'network error'}`);
    } catch (e) {
      errors.push(`${date}: network error`);
    }
  }

  if (resultEl) {
    const parts = [`Imported ${importedCount} record(s) across ${Object.keys(byDate).length} date(s).`];
    if (invalid.length) parts.push(`Skipped ${invalid.length} row(s) missing Student ID/Date/Status.`);
    let html = `<div class="sa-toast ${errors.length ? 'sa-toast-error' : 'sa-toast-success'}">${_rptEsc(parts.join(' '))}</div>`;
    if (errors.length) html += `<ul class="fin-bulk-error-list">${errors.map(e => `<li>${_rptEsc(e)}</li>`).join('')}</ul>`;
    resultEl.innerHTML = html;
  }
}

function _rptEsc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
