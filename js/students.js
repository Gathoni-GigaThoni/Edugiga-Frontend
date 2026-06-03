// ==================== STUDENT MANAGEMENT ====================

// ── Module-level state ────────────────────────────────────────────────────────
let allStudentsData      = [];
let streamsData          = [];
let fundingSourcesData   = [];
let studentSourcesData   = [];
let studentReportingData = [];

let _stuListPage    = 1;
let _stuListPerPage = 10;
let _stuListSearch  = '';
let _stuListFilters = {};

let _currentEditStudentId = null; // null = Add mode
let _stuEditActiveTab     = 'personal';
let _stuEditDirty         = false;

// Cached dropdown data for the edit form
let _stuFormClasses       = [];
let _stuFormStreams        = [];
let _stuFormFundingSources = [];
let _stuFormTransportRoutes = [];
let _stuFormExtraCurriculum = [];

// ── Shared helpers ────────────────────────────────────────────────────────────
function _esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function calculateAge(birthDateStr) {
  if (!birthDateStr) return '';
  const birth = new Date(birthDateStr);
  const now   = new Date();
  let years   = now.getFullYear() - birth.getFullYear();
  let months  = now.getMonth() - birth.getMonth();
  if (months < 0) { years--; months += 12; }
  if (now.getDate() < birth.getDate()) { months--; if (months < 0) { years--; months += 12; } }
  return `${years} year(s) ${months} month(s)`;
}

function _fv(id)    { return document.getElementById(id)?.value ?? ''; }
function _fc(id)    { return !!document.getElementById(id)?.checked; }
function _fradio(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}

function _mkPagination(containerId, page, pages, goFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let btns = '';
  for (let i = 1; i <= pages; i++) {
    btns += `<button class="${i === page ? 'fin-pg-active' : ''}" onclick="${goFn}(${i})">${i}</button>`;
  }
  el.innerHTML = `<div class="fin-pagination">${btns}</div>`;
}

function openStuMgmtDropdowns() {
  const d = document.getElementById('student-management-dropdown');
  if (d) d.style.display = 'block';
}
function openStuReportsDropdown() {
  openStuMgmtDropdowns();
  const d = document.getElementById('stu-reports-dropdown');
  if (d) d.style.display = 'block';
}
function openStuUtilitiesDropdown() {
  openStuMgmtDropdowns();
  const d = document.getElementById('stu-utilities-dropdown');
  if (d) d.style.display = 'block';
}

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="stu-dd-"]').forEach(d => d.style.display = 'none');
});

// ==================== 1. STUDENTS LISTING ====================

async function loadStudentsListView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Students</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Students &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="stu-per-page" onchange="changeStuPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}"${n===_stuListPerPage?' selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="stu-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Browse file to update">&#128193; Browse file to update</button>
          <button class="fin-export-btn" title="Browse file to upload">&#128228; Browse file to upload</button>
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV" onclick="exportStudentsCSV()">&#128202;</button>
          <button class="fin-btn-teal" onclick="loadView('students-add')">+ Add</button>
          <input type="text" class="fin-search-input" id="stu-search" placeholder="&#128269; Search&#8230;"
                 value="${_esc(_stuListSearch)}" oninput="onStuSearch(this.value)">
          <button class="fin-btn-filter" onclick="showStuFilterPanel()">&#9776; Filters</button>
        </div>
      </div>
      <div id="stu-table-container"></div>
      <div id="stu-pagination"></div>
    </div>

    <div id="stu-filter-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.35);z-index:400;" onclick="closeStuFilterPanel(event)">
      <div class="hr-filter-panel" onclick="event.stopPropagation()">
        <div class="hr-filter-panel-header">
          <span class="hr-filter-panel-title">Filters</span>
          <button class="hr-filter-close-btn" onclick="closeStuFilterPanel()">&#x2715;</button>
        </div>
        <div class="hr-filter-panel-body">
          <div class="hr-filter-group">
            <label class="hr-filter-label">Gender</label>
            <select id="sf-gender" class="hr-filter-select">
              <option value="">All</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Status</label>
            <select id="sf-status" class="hr-filter-select">
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
        <div style="padding:14px 20px;display:flex;gap:10px;">
          <button class="fin-btn-teal" onclick="applyStuFilters()">Apply</button>
          <button class="fin-btn-outline" onclick="clearStuFilters()">Clear</button>
        </div>
      </div>
    </div>
  `;

  renderSkeletonRows('stu-table-container', 8);
  await refreshStudentsListing();
}

async function refreshStudentsListing() {
  const c = document.getElementById('stu-table-container');
  if (!c) return;
  try {
    const res = await apiFetch(`${API_BASE}/students/`);
    if (!res || !res.ok) { c.innerHTML = '<p class="fin-error">Error loading students.</p>'; return; }
    allStudentsData = await res.json();
  } catch (_) { c.innerHTML = '<p class="fin-error">Failed to load students.</p>'; return; }
  _stuListPage = 1;
  _renderStuTable();
}

function _stuFiltered() {
  let d = allStudentsData;
  if (_stuListSearch) {
    const q = _stuListSearch;
    d = d.filter(s =>
      (`${s.first_name} ${s.last_name}`).toLowerCase().includes(q) ||
      (s.student_id || '').toLowerCase().includes(q)
    );
  }
  if (_stuListFilters.gender) d = d.filter(s => (s.gender || '') === _stuListFilters.gender);
  if (_stuListFilters.status !== undefined && _stuListFilters.status !== '')
    d = d.filter(s => String(s.is_active) === _stuListFilters.status);
  return d;
}

function _renderStuTable() {
  const filtered = _stuFiltered();
  const totalEl  = document.getElementById('stu-total-count');
  if (totalEl) totalEl.textContent = filtered.length;

  const start = (_stuListPage - 1) * _stuListPerPage;
  const paged = filtered.slice(start, start + _stuListPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _stuListPerPage));
  const COLS  = 8;

  let rows = '';
  if (paged.length === 0) {
    rows = `<tr><td colspan="${COLS}" class="fin-empty">No records found.</td></tr>`;
  } else {
    paged.forEach(s => {
      const statusColor = s.is_active ? '#27ae60' : '#e74c3c';
      const statusText  = s.is_active ? 'Active' : 'Inactive';
      rows += `<tr>
        <td>${_esc(s.student_id || '')}</td>
        <td>${_esc(`${s.first_name || ''} ${s.last_name || ''}`.trim())}</td>
        <td>${_esc(s.gender || '-')}</td>
        <td>${_esc(s.cohort || s.session || '-')}</td>
        <td>${_esc(s.class_name || s.level_of_academics || '-')}</td>
        <td>${_esc(s.stream || '-')}</td>
        <td><span style="color:${statusColor};font-weight:600;">${statusText}</span></td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,${s.id})">&#8230;</button>
            <div id="stu-dd-${s.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="stuOpenEdit(${s.id});return false;">&#9998; Edit</a>
              <a href="#" onclick="stuOpenView(${s.id});return false;">&#128065; View</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  const tbl = document.getElementById('stu-table-container');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>STUDENT ID</th><th>STUDENT NAME</th><th>GENDER</th><th>SESSION</th>
          <th>LEVEL OF ACADEMICS</th><th>STREAM</th><th>STATUS</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  _mkPagination('stu-pagination', _stuListPage, pages, 'stuListGoPage');
}

function toggleStuDd(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="stu-dd-"]').forEach(d => {
    if (d.id !== `stu-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`stu-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function stuOpenEdit(id) {
  _currentEditStudentId = id;
  loadView('students-edit');
}
function stuOpenView(id) {
  _currentEditStudentId = id;
  loadView('students-view');
}

function changeStuPerPage(v) { _stuListPerPage = parseInt(v); _stuListPage = 1; _renderStuTable(); }
function onStuSearch(v)      { _stuListSearch  = v.trim().toLowerCase(); _stuListPage = 1; _renderStuTable(); }
function stuListGoPage(p)    { _stuListPage = p; _renderStuTable(); }

function showStuFilterPanel()   { const o = document.getElementById('stu-filter-overlay'); if (o) o.style.display = 'block'; }
function closeStuFilterPanel(e) {
  if (e && e.target !== document.getElementById('stu-filter-overlay')) return;
  const o = document.getElementById('stu-filter-overlay');
  if (o) o.style.display = 'none';
}
function applyStuFilters() {
  _stuListFilters.gender = document.getElementById('sf-gender')?.value || '';
  _stuListFilters.status = document.getElementById('sf-status')?.value ?? '';
  _stuListPage = 1;
  _renderStuTable();
  closeStuFilterPanel();
}
function clearStuFilters() {
  _stuListFilters = {};
  ['sf-gender','sf-status'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _stuListPage = 1;
  _renderStuTable();
  closeStuFilterPanel();
}

function exportStudentsCSV() {
  const cols = ['Student ID','Full Name','Gender','Session','Level of Academics','Stream','Status'];
  const rows = _stuFiltered().map(s => [
    s.student_id || '',
    `${s.first_name || ''} ${s.last_name || ''}`.trim(),
    s.gender || '',
    s.cohort || s.session || '',
    s.class_name || s.level_of_academics || '',
    s.stream || '',
    s.is_active ? 'Active' : 'Inactive'
  ]);
  exportTableCSV(cols, rows, 'students.csv');
}

// ==================== 2. EDIT / ADD STUDENT FORM ====================

const _STU_TABS = [
  { id: 'personal',   label: 'Personal Data' },
  { id: 'prev-edu',   label: 'Previous Education' },
  { id: 'guardian',   label: 'Guardian/Family' },
  { id: 'medical',    label: 'Medical Information' },
  { id: 'documents',  label: 'Document Uploads' },
];

async function loadStudentFormView(container) {
  const isEdit = !!_currentEditStudentId;
  const title  = isEdit ? 'Edit Student' : 'Add Student';

  container.innerHTML = `
    <div class="fin-page" style="padding:0;">
      <div class="stu-edit-shell">
        <div class="fin-header-row" style="padding:20px 28px 0;margin:0;">
          <h2 class="fin-title">${title}</h2>
          <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Students &rsaquo; ${title}</div>
        </div>
        <div class="stu-tab-bar" id="stu-edit-tab-bar">
          ${_STU_TABS.map(t =>
            `<button class="stu-tab-btn${_stuEditActiveTab===t.id?' stu-tab-btn--active':''}"
               id="stu-tab-btn-${t.id}" onclick="switchStuEditTab('${t.id}')">${t.label}</button>`
          ).join('')}
        </div>
        <div class="stu-edit-body" id="stu-edit-tab-content">
          <p class="fin-loading">Loading&#8230;</p>
        </div>
        <div class="stu-edit-footer">
          <button class="fin-btn-teal" id="stu-form-submit-btn" onclick="submitStudentForm()">
            ${isEdit ? 'Update' : 'Save'}
          </button>
          <button class="fin-btn-cancel" onclick="cancelStudentForm()">Cancel</button>
        </div>
      </div>
    </div>
  `;

  await _loadStuFormDropdowns();

  let data = {};
  if (isEdit) {
    const res = await apiFetch(`${API_BASE}/students/${_currentEditStudentId}/full-profile`);
    if (res && res.ok) data = await res.json();
    else { const r2 = await apiFetch(`${API_BASE}/students/${_currentEditStudentId}`); if (r2 && r2.ok) data = await r2.json(); }
  }
  window._stuFormData = data;
  _stuEditDirty = false;
  _renderStuEditTabContent(_stuEditActiveTab);
}

async function _loadStuFormDropdowns() {
  const [clsRes, strRes, fsRes, trRes, ecRes] = await Promise.all([
    apiFetch(`${API_BASE}/academics/classes`),
    apiFetch(`${API_BASE}/student-management/streams`),
    apiFetch(`${API_BASE}/student-management/funding-sources`),
    apiFetch(`${API_BASE}/transport/routes`),
    apiFetch(`${API_BASE}/finance/extra-curriculum-activities`),
  ]);
  _stuFormClasses        = (clsRes && clsRes.ok) ? await clsRes.json() : [];
  _stuFormStreams         = (strRes && strRes.ok) ? await strRes.json() : [];
  _stuFormFundingSources  = (fsRes  && fsRes.ok)  ? await fsRes.json()  : [];
  _stuFormTransportRoutes = (trRes  && trRes.ok)  ? await trRes.json()  : [];
  _stuFormExtraCurriculum = (ecRes  && ecRes.ok)  ? await ecRes.json()  : [];
}

function switchStuEditTab(tabId) {
  _stuEditActiveTab = tabId;
  document.querySelectorAll('.stu-tab-btn').forEach(b => {
    b.classList.toggle('stu-tab-btn--active', b.id === `stu-tab-btn-${tabId}`);
  });
  _renderStuEditTabContent(tabId);
}

function _renderStuEditTabContent(tabId) {
  const c = document.getElementById('stu-edit-tab-content');
  if (!c) return;
  const d = window._stuFormData || {};
  switch (tabId) {
    case 'personal':  c.innerHTML = _stuTabPersonal(d);    _wireStuPersonalTab(); break;
    case 'prev-edu':  c.innerHTML = _stuTabPrevEdu(d);     break;
    case 'guardian':  c.innerHTML = _stuTabGuardian(d);    _wireStuGuardianTab(); break;
    case 'medical':   c.innerHTML = _stuTabMedical(d);     break;
    case 'documents': c.innerHTML = _stuTabDocuments(d);   break;
    default: c.innerHTML = '<p style="padding:24px;">Coming soon.</p>';
  }
  c.querySelectorAll('input,select,textarea').forEach(el => {
    el.addEventListener('change', () => { _stuEditDirty = true; });
    el.addEventListener('input',  () => { _stuEditDirty = true; });
  });
}

function _opts(items, valueKey, labelKey, selectedVal) {
  return items.map(it =>
    `<option value="${_esc(String(it[valueKey]))}"${String(it[valueKey])===String(selectedVal)?' selected':''}>${_esc(it[labelKey])}</option>`
  ).join('');
}

function _stuTabPersonal(d) {
  const classOpts   = `<option value="">Please Select</option>${_opts(_stuFormClasses, 'id', 'name', d.class_id)}`;
  const streamOpts  = `<option value="">Please Select</option>${_opts(_stuFormStreams.filter(s=>!s.is_inactive), 'id', 'title', d.stream_id)}`;
  const fsOpts      = `<option value="">Please Select</option>${_opts(_stuFormFundingSources.filter(f=>!f.is_inactive), 'id', 'title', d.funding_source_id)}`;
  const transOpts   = `<option value="">Please Select</option>${_opts(_stuFormTransportRoutes, 'id', 'name', d.transport_route_id)}`;
  const natOpts     = ['Kenya','Uganda','Tanzania','Rwanda','Ethiopia','Other'].map(n =>
    `<option${d.nationality===n?' selected':''}>${n}</option>`).join('');
  const relOpts     = ['Christian','Muslim','Hindu','Other'].map(r =>
    `<option${d.religion===r?' selected':''}>${r}</option>`).join('');
  const statusOpts  = ['Active','Inactive','Graduated','Transferred'].map(s =>
    `<option value="${s}"${(d.status||'Active')===s?' selected':''}>${s}</option>`).join('');
  const genderOpts  = ['Male','Female','Other'].map(g =>
    `<option${d.gender===g?' selected':''}>${g}</option>`).join('');

  const ecIds = d.extra_curriculum_ids || (d.extra_curriculum_id ? [d.extra_curriculum_id] : []);
  const ecOpts = _stuFormExtraCurriculum.map(e =>
    `<option value="${_esc(String(e.id))}"${ecIds.includes(e.id)?' selected':''}>${_esc(e.title)}</option>`).join('');

  const hasSibling    = !!(d.siblings && d.siblings.length);
  const siblingName   = hasSibling ? _esc(d.siblings[0].full_name || '') : '';
  const siblingId     = hasSibling ? _esc(d.siblings[0].student_id || '') : '';
  const sibDisplay    = hasSibling ? 'block' : 'none';

  const isEdit = !!_currentEditStudentId;
  const admVal  = isEdit ? _esc(d.student_id || '') : '';
  const admAttr = 'readonly';

  return `
    <div class="stu-form-grid">
      <div class="stu-form-group">
        <label>Student ID</label>
        <input id="se-student-id" class="fin-search-input" style="width:100%!important"
               value="${admVal}" placeholder="Auto-generated" ${admAttr}>
      </div>
      <div class="stu-form-group">
        <label>Surname <span style="color:#e74c3c">*</span></label>
        <input id="se-surname" class="fin-search-input" style="width:100%!important" value="${_esc(d.last_name||'')}">
        <span class="stu-field-error" id="err-se-surname"></span>
      </div>

      <div class="stu-form-group">
        <label>Other Name <span style="color:#e74c3c">*</span></label>
        <input id="se-other-name" class="fin-search-input" style="width:100%!important" value="${_esc(d.first_name||'')}">
        <span class="stu-field-error" id="err-se-other-name"></span>
      </div>
      <div class="stu-form-group">
        <label>Joining Date</label>
        <input id="se-joining-date" type="date" class="fin-search-input" style="width:100%!important" value="${_esc(d.joining_date||'')}">
      </div>

      <div class="stu-form-group">
        <label>Gender <span style="color:#e74c3c">*</span></label>
        <select id="se-gender" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>${genderOpts}
        </select>
        <span class="stu-field-error" id="err-se-gender"></span>
      </div>
      <div class="stu-form-group">
        <label>Birth Date <span style="color:#e74c3c">*</span></label>
        <input id="se-dob" type="date" class="fin-search-input" style="width:100%!important" value="${_esc(d.date_of_birth||'')}">
        <small id="se-age-display" style="color:#555;font-size:0.82rem;">${calculateAge(d.date_of_birth)}</small>
        <span class="stu-field-error" id="err-se-dob"></span>
      </div>

      <div class="stu-form-group">
        <label>Nationality <span style="color:#e74c3c">*</span></label>
        <select id="se-nationality" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>${natOpts}
        </select>
        <span class="stu-field-error" id="err-se-nationality"></span>
      </div>
      <div class="stu-form-group">
        <label>Religion</label>
        <select id="se-religion" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>${relOpts}
        </select>
      </div>

      <div class="stu-form-group">
        <label>Email Address</label>
        <input id="se-email" type="email" class="fin-search-input" style="width:100%!important" value="${_esc(d.email||'')}">
      </div>
      <div class="stu-form-group">
        <label>Physical Address</label>
        <input id="se-physical-address" class="fin-search-input" style="width:100%!important" value="${_esc(d.physical_address||'')}">
      </div>

      <div class="stu-form-group">
        <label>Funding Source</label>
        <select id="se-funding-source" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          ${fsOpts}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Student Status <span style="color:#e74c3c">*</span></label>
        <select id="se-status" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          ${statusOpts}
        </select>
        <span class="stu-field-error" id="err-se-status"></span>
      </div>

      <div class="stu-form-group">
        <label>Level of Academics <span style="color:#e74c3c">*</span></label>
        <select id="se-class" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                onchange="onStuClassChange(this.value)">
          ${classOpts}
        </select>
        <span class="stu-field-error" id="err-se-class"></span>
      </div>
      <div class="stu-form-group">
        <label>Stream</label>
        <select id="se-stream" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          ${streamOpts}
        </select>
      </div>

      <div class="stu-form-group">
        <label>Session</label>
        <input id="se-session" class="fin-search-input" style="width:100%!important"
               value="${_esc(d.cohort||d.session||'')}" readonly placeholder="Auto-filled">
      </div>
      <div class="stu-form-group">
        <label>Sports House</label>
        <select id="se-sports-house" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Please Select</option>
          ${(d.sports_house ? `<option selected>${_esc(d.sports_house)}</option>` : '')}
        </select>
      </div>

      <div class="stu-form-group">
        <label>Extra Curriculum</label>
        <select id="se-extra-curriculum" class="stu-multiselect" multiple>${ecOpts}</select>
      </div>
      <div class="stu-form-group">
        <label>Transportation</label>
        <select id="se-transport" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          ${transOpts}
        </select>
      </div>

      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Photo</label>
        <div style="display:flex;align-items:center;gap:16px;">
          <div id="se-photo-preview" style="width:80px;height:80px;border-radius:50%;background:#e0e0e0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#aaa;">
            ${d.photo_url ? `<img src="${_esc(d.photo_url)}" style="width:100%;height:100%;object-fit:cover;">` : '&#128100;'}
          </div>
          <input type="file" id="se-photo" accept="image/*" onchange="handleStuPhotoPreview(this)">
        </div>
      </div>

      <div class="stu-form-group">
        <label><input type="checkbox" id="se-record-closed"${d.record_closed?' checked':''}> Record Closed</label>
      </div>
      <div class="stu-form-group">
        <label>Mapped to Meal Program?</label>
        <div style="display:flex;gap:16px;margin-top:6px;">
          <label><input type="radio" name="se-meal" value="yes"${d.meal_program?' checked':''}> Yes</label>
          <label><input type="radio" name="se-meal" value="no"${!d.meal_program?' checked':''}> No</label>
        </div>
      </div>

      <div class="stu-form-group" style="grid-column:span 2;">
        <label><input type="checkbox" id="se-photo-consent"${d.photo_consent?' checked':''}> Parent Consents to Use of Student Photo?</label>
      </div>

      <div class="stu-form-group" style="grid-column:span 2;">
        <label><input type="checkbox" id="se-has-sibling"${hasSibling?' checked':''} onchange="toggleSiblingSection()"> Has Sibling Enrolled?</label>
        <div id="se-sibling-section" style="display:${sibDisplay};margin-top:10px;padding:14px;background:#f9fafb;border-radius:6px;border:1px solid #e0e0e0;">
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <div class="stu-form-group" style="flex:1;min-width:180px;">
              <label>Sibling Student Name</label>
              <input id="se-sibling-name" class="fin-search-input" style="width:100%!important" value="${siblingName}">
            </div>
            <div class="stu-form-group" style="flex:1;min-width:140px;">
              <label>Sibling Student ID</label>
              <input id="se-sibling-id" class="fin-search-input" style="width:100%!important" value="${siblingId}">
            </div>
          </div>
          <p class="stu-sibling-note">Sibling discount will be applied automatically based on age order.</p>
        </div>
      </div>

      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Notes</label>
        <textarea id="se-notes" style="width:100%;min-height:80px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:0.9rem;">${_esc(d.notes||'')}</textarea>
      </div>
    </div>
  `;
}

function _wireStuPersonalTab() {
  const dob = document.getElementById('se-dob');
  if (dob) {
    dob.addEventListener('change', () => {
      const ageEl = document.getElementById('se-age-display');
      if (ageEl) ageEl.textContent = calculateAge(dob.value);
    });
  }
  // If editing and class already selected, load sports houses
  const cls = document.getElementById('se-class');
  if (cls && cls.value) onStuClassChange(cls.value, false);
}

async function onStuClassChange(classId, clearHouse = true) {
  const houseSelect = document.getElementById('se-sports-house');
  const sessionInput = document.getElementById('se-session');
  if (!houseSelect) return;

  // Auto-fill session from the selected class data
  if (sessionInput) {
    const cls = _stuFormClasses.find(c => String(c.id) === String(classId));
    if (cls) sessionInput.value = cls.cohort || cls.session || cls.name || '';
  }

  houseSelect.innerHTML = '<option value="">Loading&#8230;</option>';
  if (!classId) { houseSelect.innerHTML = '<option value="">Please Select</option>'; return; }

  const d = window._stuFormData || {};
  const currentHouse = clearHouse ? '' : (d.sports_house || '');

  try {
    const res = await apiFetch(`${API_BASE}/academics/classes/${classId}/sports-houses`);
    if (res && res.ok) {
      const houses = await res.json();
      houseSelect.innerHTML = `<option value="">Please Select</option>` +
        houses.map(h =>
          `<option value="${_esc(h.name||h.title||String(h.id))}"${(h.name||h.title)===currentHouse?' selected':''}>${_esc(h.name||h.title)}</option>`
        ).join('');
    } else {
      houseSelect.innerHTML = '<option value="">No houses found</option>';
    }
  } catch (_) { houseSelect.innerHTML = '<option value="">Error loading</option>'; }
}

function toggleSiblingSection() {
  const chk = document.getElementById('se-has-sibling');
  const sec = document.getElementById('se-sibling-section');
  if (sec) sec.style.display = chk?.checked ? 'block' : 'none';
}

function handleStuPhotoPreview(input) {
  if (!input.files[0]) return;
  const preview = document.getElementById('se-photo-preview');
  if (!preview) return;
  const url = URL.createObjectURL(input.files[0]);
  const img = document.createElement('img');
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
  img.onload = () => URL.revokeObjectURL(url);
  img.src = url;
  preview.innerHTML = '';
  preview.appendChild(img);
}

function _stuTabPrevEdu(d) {
  const typeOpts = ['Primary','Secondary','Tertiary','Other'].map(t =>
    `<option${d.prev_school_type===t?' selected':''}>${t}</option>`).join('');
  return `
    <div class="stu-form-grid">
      <div class="stu-form-group">
        <label>Previous School Name</label>
        <input id="se-prev-school" class="fin-search-input" style="width:100%!important" value="${_esc(d.prev_school_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Previous School Type</label>
        <select id="se-prev-school-type" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>${typeOpts}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Year Left Previous School</label>
        <input id="se-year-left" class="fin-search-input" style="width:100%!important" value="${_esc(d.year_left_prev_school||'')}">
      </div>
    </div>
  `;
}

function _stuTabGuardian(d) {
  const p1 = (d.parents || [])[0] || {};
  const p2 = (d.parents || [])[1] || {};
  const relOpts = (sel) => ['Mother','Father','Guardian','Other'].map(r =>
    `<option${sel===r?' selected':''}>${r}</option>`).join('');
  return `
    <div class="stu-form-grid">
      <div class="stu-form-group" style="grid-column:span 2;font-weight:600;color:#2c3e50;border-bottom:1px solid #eee;padding-bottom:6px;">
        Primary Guardian
      </div>
      <div class="stu-form-group">
        <label>Full Name <span style="color:#e74c3c">*</span></label>
        <input id="se-p1-name" class="fin-search-input" style="width:100%!important" value="${_esc(p1.full_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Relationship</label>
        <select id="se-p1-rel" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          ${relOpts(p1.relationship)}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Email</label>
        <input id="se-p1-email" type="email" class="fin-search-input" style="width:100%!important" value="${_esc(p1.email||'')}">
      </div>
      <div class="stu-form-group">
        <label>Phone</label>
        <input id="se-p1-phone" class="fin-search-input" style="width:100%!important" value="${_esc(p1.phone||'')}">
      </div>

      <div class="stu-form-group" style="grid-column:span 2;font-weight:600;color:#2c3e50;border-bottom:1px solid #eee;padding-bottom:6px;margin-top:8px;">
        Secondary Guardian <small style="font-weight:400;color:#888;">(optional)</small>
      </div>
      <div class="stu-form-group">
        <label>Full Name</label>
        <input id="se-p2-name" class="fin-search-input" style="width:100%!important" value="${_esc(p2.full_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Relationship</label>
        <select id="se-p2-rel" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          ${relOpts(p2.relationship)}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Email</label>
        <input id="se-p2-email" type="email" class="fin-search-input" style="width:100%!important" value="${_esc(p2.email||'')}">
      </div>
      <div class="stu-form-group">
        <label>Phone</label>
        <input id="se-p2-phone" class="fin-search-input" style="width:100%!important" value="${_esc(p2.phone||'')}">
      </div>
    </div>
  `;
}
function _wireStuGuardianTab() {} // placeholder for future autocomplete

function _stuTabMedical(d) {
  const med = d.medical || {};
  return `
    <div class="stu-form-grid">
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Allergies</label>
        <textarea id="se-allergies" style="width:100%;min-height:70px;padding:8px;border:1px solid #ccc;border-radius:4px;">${_esc(med.allergies||'')}</textarea>
      </div>
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Chronic Symptoms</label>
        <textarea id="se-chronic" style="width:100%;min-height:70px;padding:8px;border:1px solid #ccc;border-radius:4px;">${_esc(med.chronic_symptoms||'')}</textarea>
      </div>
      <div class="stu-form-group">
        <label>Health Insurance</label>
        <input id="se-insurance" class="fin-search-input" style="width:100%!important" value="${_esc(med.health_insurance||'')}">
      </div>
      <div class="stu-form-group">
        <label>Blood Group</label>
        <select id="se-blood-group" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>
          ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => `<option${med.blood_group===b?' selected':''}>${b}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Emergency Contact Name</label>
        <input id="se-emrg-name" class="fin-search-input" style="width:100%!important" value="${_esc(med.emergency_contact_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Emergency Contact Phone</label>
        <input id="se-emrg-phone" class="fin-search-input" style="width:100%!important" value="${_esc(med.emergency_contact_phone||'')}">
      </div>
    </div>
  `;
}

function _stuTabDocuments(d) {
  const docs = d.documents || [];
  const existing = docs.length
    ? docs.map(doc => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;background:#f9f9f9;border-radius:4px;margin-bottom:6px;">
          <span style="flex:1;">${_esc(doc.name)}</span>
          <a href="${_esc(doc.url)}" target="_blank" class="fin-btn-outline" style="padding:4px 10px!important;font-size:0.82rem;">View</a>
        </div>`).join('')
    : '<p style="color:#888;font-size:0.88rem;">No documents uploaded.</p>';
  return `
    <div style="padding:4px;">
      <p style="font-weight:600;color:#2c3e50;margin-bottom:12px;">Existing Documents</p>
      ${existing}
      <p style="font-weight:600;color:#2c3e50;margin:16px 0 8px;">Upload New Documents</p>
      <div class="stu-form-group" style="margin-bottom:12px;">
        <label>Passport Photo</label>
        <input type="file" id="se-doc-photo" accept="image/*">
      </div>
      <div class="stu-form-group" style="margin-bottom:12px;">
        <label>Previous School Report (PDF)</label>
        <input type="file" id="se-doc-report" accept=".pdf">
      </div>
      <div class="stu-form-group">
        <label>Other Document</label>
        <input type="file" id="se-doc-other">
      </div>
    </div>
  `;
}

function _stuValidatePersonal() {
  const required = [
    { id: 'se-surname',     err: 'err-se-surname',     msg: 'Surname is required.' },
    { id: 'se-other-name',  err: 'err-se-other-name',  msg: 'Other Name is required.' },
    { id: 'se-gender',      err: 'err-se-gender',      msg: 'Gender is required.' },
    { id: 'se-dob',         err: 'err-se-dob',         msg: 'Birth Date is required.' },
    { id: 'se-nationality', err: 'err-se-nationality',  msg: 'Nationality is required.' },
    { id: 'se-status',      err: 'err-se-status',      msg: 'Status is required.' },
    { id: 'se-class',       err: 'err-se-class',       msg: 'Level of Academics is required.' },
  ];
  let valid = true;
  required.forEach(({ id, err, msg }) => {
    const el = document.getElementById(id);
    const errEl = document.getElementById(err);
    if (!el || !el.value.trim()) {
      if (el) el.classList.add('error');
      if (errEl) errEl.textContent = msg;
      valid = false;
    } else {
      if (el) el.classList.remove('error');
      if (errEl) errEl.textContent = '';
    }
  });
  return valid;
}

async function submitStudentForm() {
  if (_stuEditActiveTab !== 'personal') {
    switchStuEditTab('personal');
    await new Promise(r => setTimeout(r, 50));
  }
  if (!_stuValidatePersonal()) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const ecSelect = document.getElementById('se-extra-curriculum');
  const ecIds = ecSelect ? Array.from(ecSelect.selectedOptions).map(o => o.value) : [];

  const payload = {
    last_name:         _fv('se-surname').trim(),
    first_name:        _fv('se-other-name').trim(),
    gender:            _fv('se-gender'),
    date_of_birth:     _fv('se-dob'),
    joining_date:      _fv('se-joining-date'),
    nationality:       _fv('se-nationality'),
    religion:          _fv('se-religion'),
    email:             _fv('se-email'),
    physical_address:  _fv('se-physical-address'),
    funding_source_id: _fv('se-funding-source') || null,
    status:            _fv('se-status'),
    class_id:          _fv('se-class') || null,
    stream_id:         _fv('se-stream') || null,
    sports_house:      _fv('se-sports-house'),
    transport_route_id: _fv('se-transport') || null,
    extra_curriculum_ids: ecIds,
    record_closed:     _fc('se-record-closed'),
    meal_program:      _fradio('se-meal') === 'yes',
    photo_consent:     _fc('se-photo-consent'),
    notes:             _fv('se-notes'),
    siblings: _fc('se-has-sibling') ? [{
      full_name:  _fv('se-sibling-name'),
      student_id: _fv('se-sibling-id'),
    }] : [],
    prev_school_name:      _fv('se-prev-school'),
    prev_school_type:      _fv('se-prev-school-type'),
    year_left_prev_school: _fv('se-year-left'),
    medical: {
      allergies:               _fv('se-allergies'),
      chronic_symptoms:        _fv('se-chronic'),
      health_insurance:        _fv('se-insurance'),
      blood_group:             _fv('se-blood-group'),
      emergency_contact_name:  _fv('se-emrg-name'),
      emergency_contact_phone: _fv('se-emrg-phone'),
    },
    parents: (() => {
      const p = [];
      const p1 = _fv('se-p1-name').trim();
      if (p1) p.push({ full_name: p1, email: _fv('se-p1-email'), phone: _fv('se-p1-phone'), relationship: _fv('se-p1-rel'), is_primary: true });
      const p2 = _fv('se-p2-name').trim();
      if (p2) p.push({ full_name: p2, email: _fv('se-p2-email'), phone: _fv('se-p2-phone'), relationship: _fv('se-p2-rel'), is_primary: false });
      return p;
    })(),
  };

  const isEdit  = !!_currentEditStudentId;
  const url     = isEdit ? `${API_BASE}/students/${_currentEditStudentId}` : `${API_BASE}/students/`;
  const method  = isEdit ? 'PUT' : 'POST';
  const btn     = document.getElementById('stu-form-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (btn) { btn.disabled = false; btn.textContent = isEdit ? 'Update' : 'Save'; }

  if (res && res.ok) {
    _stuEditDirty = false;
    showToast(isEdit ? 'Student updated successfully!' : 'Student added successfully!', 'success');
    _currentEditStudentId = null;
    _stuEditActiveTab = 'personal';
    loadView('students-list');
  } else {
    let msg = 'An error occurred.';
    if (res) { try { const e = await res.json(); msg = e.detail || JSON.stringify(e); } catch (_) {} }
    showToast('Error: ' + msg, 'error');
  }
}

function cancelStudentForm() {
  if (_stuEditDirty && !confirm('You have unsaved changes. Discard them?')) return;
  _stuEditDirty = false;
  _currentEditStudentId = null;
  _stuEditActiveTab = 'personal';
  loadView('students-list');
}

// ==================== 3. STUDENT VIEW (READ-ONLY) ====================

async function loadStudentViewPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Detail</h2>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Detail</div>
          <button class="fin-btn-outline" onclick="loadView('students-list')" style="padding:5px 14px!important;">&#8592; Back</button>
        </div>
      </div>
      <div id="stu-view-body"><p class="fin-loading">Loading&#8230;</p></div>
    </div>
  `;

  if (!_currentEditStudentId) { document.getElementById('stu-view-body').innerHTML = '<p class="fin-error">No student selected.</p>'; return; }
  const res = await apiFetch(`${API_BASE}/students/${_currentEditStudentId}`);
  if (!res || !res.ok) { document.getElementById('stu-view-body').innerHTML = '<p class="fin-error">Failed to load student.</p>'; return; }
  const d = await res.json();
  window._stuViewData = d;
  window._stuViewTab  = 'Personal Data';
  _renderStudentViewBody(d, 'Personal Data');
}

function _renderStudentViewBody(d, activeTab) {
  const TABS = ['Personal Data','Academic Background','Guardian/Family','Medical Information','Disciplinary'];
  const statusBadge = d.is_active
    ? '<span class="stu-status-badge stu-status-badge--active">Active</span>'
    : '<span class="stu-status-badge stu-status-badge--inactive">Inactive</span>';

  const tabBar = TABS.map(t =>
    `<button class="stu-tab-btn${t===activeTab?' stu-tab-btn--active':''}"
       onclick="switchStuViewTab(this,'${t.replace(/'/g,'\\\'')}')">${t}</button>`
  ).join('');

  document.getElementById('stu-view-body').innerHTML = `
    <div class="stu-view-layout">
      <div class="stu-view-card">
        <div class="stu-view-avatar">
          ${d.photo_url ? `<img src="${_esc(d.photo_url)}" alt="Photo">` : '&#128100;'}
        </div>
        <div class="stu-view-name">${_esc(`${d.first_name||''} ${d.last_name||''}`.trim())}</div>
        <div class="stu-view-id">${_esc(d.student_id||'')}</div>
        <div class="stu-view-card-rows">
          ${_svRow('Department',     d.department)}
          ${_svRow('Gender',         d.gender)}
          ${_svRow('Level',          d.class_name||d.level_of_academics)}
          ${_svRow('Email',          d.email)}
          ${_svRow('Programme',      d.programme)}
          ${_svRow('Session',        d.cohort||d.session)}
          ${_svRow('Phone',          d.phone)}
          ${_svRow('Meal Program',   d.meal_program ? 'Yes' : 'No')}
          ${_svRow('Photo Consent',  d.photo_consent ? 'Yes' : 'No')}
          ${_svRow('Transport',      d.uses_transport ? 'Yes' : 'No')}
          <div class="stu-view-card-row">
            <span class="stu-view-card-label">Status</span>
            <span>${statusBadge}</span>
          </div>
        </div>
        <div class="stu-view-fee-row">
          <span style="font-size:0.83rem;color:#888;">Fee Balance</span>
          <span style="color:#e74c3c;font-weight:700;font-size:1rem;">${_esc(String(d.fee_balance ?? '-'))}</span>
          <a href="#" onclick="openFeeStatement(${d.id});return false;" class="fin-btn-teal"
             style="padding:5px 12px!important;font-size:0.78rem;margin-top:4px;">View Fee Statement</a>
        </div>
      </div>

      <div class="stu-view-panel">
        <div class="stu-tab-bar">${tabBar}</div>
        <div class="stu-edit-body" id="stu-view-tab-content">
          ${_renderStuViewTab(activeTab, d)}
        </div>
      </div>
    </div>
  `;
}

function _svRow(label, value) {
  return `<div class="stu-view-card-row">
    <span class="stu-view-card-label">${_esc(label)}</span>
    <span class="stu-view-card-value">${_esc(value||'-')}</span>
  </div>`;
}

function switchStuViewTab(btn, tabName) {
  document.querySelectorAll('.stu-view-panel .stu-tab-btn').forEach(b => b.classList.remove('stu-tab-btn--active'));
  btn.classList.add('stu-tab-btn--active');
  const c = document.getElementById('stu-view-tab-content');
  if (c) c.innerHTML = _renderStuViewTab(tabName, window._stuViewData || {});
}

function _renderStuViewTab(tabName, d) {
  if (tabName === 'Personal Data') return `
    <div class="stu-detail-grid">
      ${_dRow('Student ID',       d.student_id)}
      ${_dRow('Surname',          d.last_name)}
      ${_dRow('Other Name',       d.first_name)}
      ${_dRow('Joining Date',     d.joining_date)}
      ${_dRow('Gender',           d.gender)}
      ${_dRow('Birth Date',       d.date_of_birth)}
      ${_dRow('Age',              calculateAge(d.date_of_birth))}
      ${_dRow('Nationality',      d.nationality)}
      ${_dRow('Religion',         d.religion)}
      ${_dRow('Email',            d.email)}
      ${_dRow('Physical Address', d.physical_address)}
      ${_dRow('Record Closed',    d.record_closed ? 'Yes' : 'No')}
    </div>`;
  if (tabName === 'Academic Background') return `
    <div class="stu-detail-grid">
      ${_dRow('Level of Academics', d.class_name||d.level_of_academics)}
      ${_dRow('Stream',             d.stream)}
      ${_dRow('Session',            d.cohort||d.session)}
      ${_dRow('Sports House',       d.sports_house)}
      ${_dRow('Status',             d.status||(d.is_active?'Active':'Inactive'))}
      ${_dRow('Transport',          d.uses_transport ? 'Yes' : 'No')}
    </div>`;
  if (tabName === 'Guardian/Family') return `
    <div>
      ${(d.parents||[]).map(p => `
        <div style="border:1px solid #eee;border-radius:6px;padding:14px;margin-bottom:12px;">
          <div class="stu-detail-grid">
            ${_dRow('Name',         p.full_name)}
            ${_dRow('Relationship', p.relationship)}
            ${_dRow('Email',        p.email)}
            ${_dRow('Phone',        p.phone)}
          </div>
        </div>`).join('') || '<p style="color:#888;padding:16px;">No guardian records.</p>'}
    </div>`;
  if (tabName === 'Medical Information') return `
    <div class="stu-detail-grid">
      ${_dRow('Allergies',         d.medical?.allergies)}
      ${_dRow('Chronic Symptoms',  d.medical?.chronic_symptoms)}
      ${_dRow('Health Insurance',  d.medical?.health_insurance)}
      ${_dRow('Blood Group',       d.medical?.blood_group)}
      ${_dRow('Emergency Contact', d.medical?.emergency_contact_name)}
      ${_dRow('Emergency Phone',   d.medical?.emergency_contact_phone)}
    </div>`;
  if (tabName === 'Disciplinary') return `
    <div style="padding:32px;text-align:center;color:#888;">No disciplinary records for this student.</div>`;
  return '';
}
function _dRow(label, value) {
  return `<div class="stu-detail-row">
    <span class="stu-detail-label">${_esc(label)}</span>
    <span class="stu-detail-value">${_esc(value||'-')}</span>
  </div>`;
}

async function openFeeStatement(studentId) {
  const res = await apiFetch(`${API_BASE}/finance/statement/${studentId}`);
  if (res && res.ok) {
    const data = await res.json();
    const w = window.open('', '_blank', 'width=700,height=500');
    if (w) w.document.write(`<pre style="font-family:sans-serif;padding:20px;">${JSON.stringify(data, null, 2)}</pre>`);
  } else {
    showToast('Could not load fee statement.', 'error');
  }
}

// ==================== 4. STUDENT SEARCH (CARD GRID) ====================

let _ssData = [], _ssFiltered = [], _ssPage = 1, _ssPerPage = 12, _ssQ = '';

async function loadStudentSearchView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Search</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Search</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="ss-per-page" onchange="changeSsPerPage(this.value)">
            ${[12,25,50].map(n => `<option value="${n}"${n===_ssPerPage?' selected':''}>${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="ss-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" id="ss-search" placeholder="&#128269; Search&#8230;"
                 oninput="onSsSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="ss-grid"><p class="fin-loading">Loading&#8230;</p></div>
      <div id="ss-pagination"></div>
    </div>
  `;

  const res = await apiFetch(`${API_BASE}/students/`);
  if (res && res.ok) {
    _ssData = await res.json();
    _ssFiltered = [..._ssData];
    _ssPage = 1;
    _renderSsGrid();
  } else {
    document.getElementById('ss-grid').innerHTML = '<p class="fin-error">Failed to load students.</p>';
  }
}

function _renderSsGrid() {
  const totalEl = document.getElementById('ss-total');
  if (totalEl) totalEl.textContent = _ssFiltered.length;
  const start = (_ssPage - 1) * _ssPerPage;
  const paged = _ssFiltered.slice(start, start + _ssPerPage);
  const pages = Math.max(1, Math.ceil(_ssFiltered.length / _ssPerPage));

  const cards = paged.length
    ? paged.map(s => `
      <div class="stu-card" onclick="stuOpenViewFromSearch(${s.id})">
        <div class="stu-card-avatar">
          ${s.photo_url ? `<img src="${_esc(s.photo_url)}" alt="">` : '&#128100;'}
        </div>
        <div class="stu-card-name">${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}</div>
        <div class="stu-card-sub">(${_esc(s.gender||'')})</div>
        <div class="stu-card-info">&#127963; ${_esc(s.student_id||'')}</div>
        <div class="stu-card-info">&#127979; ${_esc(s.class_name||'-')} (${_esc(s.cohort||s.session||'-')})</div>
        ${s.phone ? `<div class="stu-card-info">&#128222; ${_esc(s.phone)}</div>` : ''}
        ${s.email ? `<div class="stu-card-info">&#9993; ${_esc(s.email)}</div>` : ''}
      </div>`).join('')
    : '<p class="fin-empty" style="padding:24px;">No students found.</p>';

  const gc = document.getElementById('ss-grid');
  if (gc) gc.innerHTML = `<div class="stu-cards-grid">${cards}</div>`;
  _mkPagination('ss-pagination', _ssPage, pages, 'ssGoPage');
}

function stuOpenViewFromSearch(id) {
  _currentEditStudentId = id;
  loadView('students-view');
}

function changeSsPerPage(v) { _ssPerPage = parseInt(v); _ssPage = 1; _renderSsGrid(); }
function onSsSearch(v) {
  _ssQ = v.trim().toLowerCase();
  _ssFiltered = _ssQ
    ? _ssData.filter(s =>
        (`${s.first_name} ${s.last_name}`).toLowerCase().includes(_ssQ) ||
        (s.student_id||'').toLowerCase().includes(_ssQ))
    : [..._ssData];
  _ssPage = 1;
  _renderSsGrid();
}
function ssGoPage(p) { _ssPage = p; _renderSsGrid(); }

// ==================== 5. STUDENT REPORTING ====================

let _srData = [], _srPage = 1, _srPerPage = 10, _srSearch = '';
let _srSelectedStudent = null;

async function loadStudentReportingView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Reporting</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Reporting &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="sr-per-page" onchange="changeSrPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="sr-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV">&#128202;</button>
          <button class="fin-btn-teal" onclick="loadView('student-reporting-add')">+ Add</button>
          <button class="fin-btn-outline" onclick="loadView('student-reporting-bulk')">Bulk Report</button>
          <input type="text" class="fin-search-input" id="sr-search" placeholder="&#128269; Search&#8230;"
                 oninput="onSrSearch(this.value)">
        </div>
      </div>
      <div id="sr-table-container"></div>
      <div id="sr-pagination"></div>
    </div>
  `;

  renderSkeletonRows('sr-table-container', 6);
  const res = await apiFetch(`${API_BASE}/student-reporting/`);
  if (res && res.ok) {
    _srData = await res.json();
  } else {
    _srData = studentReportingData;
  }
  _srPage = 1;
  _renderSrTable();
}

function _srFiltered() {
  if (!_srSearch) return _srData;
  const q = _srSearch;
  return _srData.filter(r =>
    (r.admission_no||r.student_id||'').toLowerCase().includes(q) ||
    (r.name||r.full_name||'').toLowerCase().includes(q)
  );
}

function _renderSrTable() {
  const filtered = _srFiltered();
  const totalEl  = document.getElementById('sr-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_srPage - 1) * _srPerPage;
  const paged = filtered.slice(start, start + _srPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _srPerPage));

  let rows = paged.length
    ? paged.map(r => `<tr>
        <td>${_esc(r.admission_no||r.student_id||'')}</td>
        <td>${_esc(r.name||r.full_name||'')}</td>
        <td>${_esc(r.session||'')}</td>
        <td>${_esc(r.class_name||'')}</td>
        <td>${_esc(r.reported_at||'')}</td>
        <td>${_esc(r.reported_by||'')}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="fin-empty">No reporting records found.</td></tr>';

  const tbl = document.getElementById('sr-table-container');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>ADMISSION NO.</th><th>NAME</th><th>SESSION</th>
        <th>CLASS</th><th>REPORTED AT</th><th>REPORTED BY</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  _mkPagination('sr-pagination', _srPage, pages, 'srGoPage');
}

function changeSrPerPage(v) { _srPerPage = parseInt(v); _srPage = 1; _renderSrTable(); }
function onSrSearch(v)      { _srSearch  = v.trim().toLowerCase(); _srPage = 1; _renderSrTable(); }
function srGoPage(p)        { _srPage = p; _renderSrTable(); }

// Single reporting form
async function loadSingleReportingView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Student Reporting</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Reporting &rsaquo; Add</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:480px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:18px;">
          <label style="font-weight:600;">Admission No. <span style="color:#e74c3c">*</span></label>
          <div style="position:relative;">
            <input id="sr-add-admission" class="fin-search-input" style="width:100%!important;"
                   placeholder="Type to search student&#8230;" oninput="srAdmissionSearch(this.value)" autocomplete="off">
            <div id="sr-admission-dd" class="fin-action-dropdown" style="display:none;max-height:200px;overflow-y:auto;position:absolute;top:100%;left:0;width:100%;z-index:100;"></div>
          </div>
        </div>
        <div style="display:flex;gap:12px;">
          <button class="fin-btn-teal" onclick="submitSingleReport()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('student-reporting')">Cancel</button>
        </div>
      </div>
    </div>
  `;
  _srSelectedStudent = null;
}

async function srAdmissionSearch(val) {
  const dd = document.getElementById('sr-admission-dd');
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
    `<a href="#" onclick="srSelectStudent(${s.id},'${_esc(s.student_id||'')}','${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}');return false;">
       ${_esc(s.student_id||'')} — ${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}
     </a>`
  ).join('');
  dd.style.display = 'block';
}

function srSelectStudent(id, admNo, name) {
  _srSelectedStudent = { id, admNo, name };
  const inp = document.getElementById('sr-add-admission');
  if (inp) inp.value = `${admNo} — ${name}`;
  const dd = document.getElementById('sr-admission-dd');
  if (dd) dd.style.display = 'none';
}

async function submitSingleReport() {
  if (!_srSelectedStudent) { showToast('Please select a student.', 'error'); return; }
  const res = await apiFetch(`${API_BASE}/student-reporting/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: _srSelectedStudent.id }),
  });
  if (res && res.ok) {
    showToast('Report submitted!', 'success');
    loadView('student-reporting');
  } else {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    studentReportingData.unshift({
      admission_no: _srSelectedStudent.admNo, name: _srSelectedStudent.name,
      session: '-', class_name: '-', reported_at: now, reported_by: currentUser?.email || 'System'
    });
    showToast('Report submitted!', 'success');
    loadView('student-reporting');
  }
}

// Bulk reporting form
async function loadBulkReportingView(container) {
  let classOptions = '<option value="">Please Select</option>';
  const res = await apiFetch(`${API_BASE}/academics/classes?status=active`);
  if (res && res.ok) {
    const classes = await res.json();
    classOptions += classes.map(c => `<option value="${_esc(String(c.id))}">${_esc(c.name)}</option>`).join('');
  }

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Bulk Student Reporting</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Reporting &rsaquo; Bulk</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="max-width:320px;margin-bottom:20px;">
          <label style="font-weight:600;">Active Classes <span style="color:#e74c3c">*</span></label>
          <select id="br-class" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                  onchange="loadBulkClassStudents(this.value)">${classOptions}</select>
        </div>
        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead><tr>
              <th><input type="checkbox" id="br-select-all" onchange="toggleBrSelectAll(this)"></th>
              <th>ADMISSION NO.</th><th>NAME</th><th>STUDENT TYPE</th>
            </tr></thead>
            <tbody id="br-tbody">
              <tr><td colspan="4" class="fin-empty">Select a class to load students.</td></tr>
            </tbody>
          </table>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="fin-btn-teal" onclick="submitBulkReport()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('student-reporting')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function loadBulkClassStudents(classId) {
  const tbody = document.getElementById('br-tbody');
  if (!tbody || !classId) return;
  tbody.innerHTML = '<tr><td colspan="4" class="fin-loading">Loading&#8230;</td></tr>';
  const res = await apiFetch(`${API_BASE}/students/?class_id=${classId}`);
  if (!res || !res.ok) { tbody.innerHTML = '<tr><td colspan="4" class="fin-error">Error loading students.</td></tr>'; return; }
  const students = await res.json();
  if (!students.length) { tbody.innerHTML = '<tr><td colspan="4" class="fin-empty">No students in this class.</td></tr>'; return; }
  tbody.innerHTML = students.map(s => `
    <tr>
      <td><input type="checkbox" class="br-check" value="${s.id}"
          data-admno="${_esc(s.student_id||'')}" data-name="${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}" checked></td>
      <td>${_esc(s.student_id||'')}</td>
      <td>${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}</td>
      <td>${_esc(s.student_type||'Regular')}</td>
    </tr>`).join('');
}

function toggleBrSelectAll(master) {
  document.querySelectorAll('.br-check').forEach(cb => cb.checked = master.checked);
}

async function submitBulkReport() {
  const checked = document.querySelectorAll('.br-check:checked');
  if (!checked.length) { showToast('No students selected.', 'error'); return; }
  const student_ids = Array.from(checked).map(cb => cb.value);
  const res = await apiFetch(`${API_BASE}/student-reporting/bulk/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_ids }),
  });
  if (res && res.ok) {
    showToast(`${checked.length} student(s) reported!`, 'success');
    loadView('student-reporting');
  } else {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    Array.from(checked).forEach(cb => {
      studentReportingData.unshift({
        admission_no: cb.dataset.admno, name: cb.dataset.name,
        session: '-', class_name: '-', reported_at: now, reported_by: currentUser?.email || 'System'
      });
    });
    showToast(`${checked.length} student(s) reported!`, 'success');
    loadView('student-reporting');
  }
}

// ==================== 6. UTILITIES — STUDENT SOURCES ====================

let _stuSrcData = [], _stuSrcPage = 1, _stuSrcPerPage = 10;

async function loadStudentSourcesView(container) {
  openStuUtilitiesDropdown();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Sources</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Utilities &rsaquo; Student Sources</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="stusrc-per-page" onchange="changeStuSrcPerPage(this.value)">
            ${[10,25,50].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="stusrc-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-teal" onclick="showStudentSourceForm(null)">+ Add</button>
        </div>
      </div>
      <div id="stusrc-table"></div>
      <div id="stusrc-pagination"></div>
    </div>
  `;
  renderSkeletonRows('stusrc-table', 3);
  const res = await apiFetch(`${API_BASE}/student-management/student-sources`);
  if (res && res.ok) _stuSrcData = await res.json();
  _stuSrcPage = 1;
  _renderStuSrcTable();
}

function _renderStuSrcTable() {
  const totalEl = document.getElementById('stusrc-total');
  if (totalEl) totalEl.textContent = _stuSrcData.length;
  const start = (_stuSrcPage - 1) * _stuSrcPerPage;
  const paged = _stuSrcData.slice(start, start + _stuSrcPerPage);
  const pages = Math.max(1, Math.ceil(_stuSrcData.length / _stuSrcPerPage));

  let rows = paged.length
    ? paged.map(s => `<tr>
        <td>${_esc(s.title||s.name||'')}</td>
        <td><span style="color:${s.is_inactive?'#e74c3c':'#27ae60'};font-weight:600;">${s.is_inactive?'Inactive':'Active'}</span></td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,'stusrc-${s.id}')">&#8230;</button>
            <div id="stu-dd-stusrc-${s.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="showStudentSourceForm('${s.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="fin-empty">No student sources found.</td></tr>';

  const t = document.getElementById('stusrc-table');
  if (t) t.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>TITLE</th><th>STATUS</th><th>ACTION</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  _mkPagination('stusrc-pagination', _stuSrcPage, pages, 'stuSrcGoPage');
}
function changeStuSrcPerPage(v) { _stuSrcPerPage = parseInt(v); _stuSrcPage = 1; _renderStuSrcTable(); }
function stuSrcGoPage(p)        { _stuSrcPage = p; _renderStuSrcTable(); }

function showStudentSourceForm(id) {
  const item   = id ? _stuSrcData.find(s => String(s.id) === String(id)) : null;
  const isEdit = !!item;
  const main   = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit?'Edit':'Add'} Student Source</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Utilities &rsaquo; Student Sources &rsaquo; ${isEdit?'Edit':'Add'}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:600px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Title <span style="color:#e74c3c">*</span></label>
          <input id="stusrc-title" class="fin-search-input" style="width:100%!important;" value="${_esc(item?.title||item?.name||'')}">
        </div>
        ${isEdit ? `<div class="stu-form-group" style="margin-bottom:20px;">
          <label><input type="checkbox" id="stusrc-deactivate"${item?.is_inactive?' checked':''}> Deactivate/Activate</label>
        </div>` : ''}
        <div style="display:flex;gap:12px;">
          <button class="fin-btn-teal" onclick="saveStudentSource('${id||''}')">${isEdit?'Update':'Save'}</button>
          <button class="fin-btn-cancel" onclick="loadView('utilities-student-sources')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function saveStudentSource(id) {
  const title = document.getElementById('stusrc-title')?.value.trim();
  if (!title) { showToast('Title is required.', 'error'); return; }
  const payload = { title, is_inactive: id ? _fc('stusrc-deactivate') : false };
  const url    = id ? `${API_BASE}/student-management/student-sources/${id}` : `${API_BASE}/student-management/student-sources`;
  const method = id ? 'PUT' : 'POST';
  const res    = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    showToast(id ? 'Student source updated!' : 'Student source added!', 'success');
    loadView('utilities-student-sources');
  } else {
    if (id) { const idx = _stuSrcData.findIndex(s => String(s.id) === String(id)); if (idx !== -1) _stuSrcData[idx] = { ..._stuSrcData[idx], ...payload }; }
    else    { _stuSrcData.push({ id: 'src_' + Date.now(), ...payload }); }
    showToast(id ? 'Student source updated!' : 'Student source added!', 'success');
    loadView('utilities-student-sources');
  }
}

// ==================== 7. UTILITIES — STREAMS ====================

let _strPage = 1, _strPerPage = 10;

async function loadStreamsView(container) {
  openStuUtilitiesDropdown();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Stream</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Utilities &rsaquo; Stream &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="str-per-page" onchange="changeStrPerPage(this.value)">
            ${[10,25,50].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="str-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-teal" onclick="showStreamForm(null)">+ Add</button>
        </div>
      </div>
      <div id="str-table"></div>
      <div id="str-pagination"></div>
    </div>
  `;
  renderSkeletonRows('str-table', 3);
  const res = await apiFetch(`${API_BASE}/student-management/streams`);
  if (res && res.ok) streamsData = await res.json();
  _strPage = 1;
  _renderStreamsTable();
}

function _renderStreamsTable() {
  const totalEl = document.getElementById('str-total');
  if (totalEl) totalEl.textContent = streamsData.length;
  const start = (_strPage - 1) * _strPerPage;
  const paged = streamsData.slice(start, start + _strPerPage);
  const pages = Math.max(1, Math.ceil(streamsData.length / _strPerPage));

  let rows = paged.length
    ? paged.map(s => `<tr>
        <td>${_esc(s.title||'')}</td>
        <td><span style="color:${s.is_inactive?'#e74c3c':'#27ae60'};font-weight:600;">${s.is_inactive?'Inactive':'Active'}</span></td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,'str-${s.id}')">&#8230;</button>
            <div id="stu-dd-str-${s.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="showStreamForm('${s.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="fin-empty">No streams found.</td></tr>';

  const t = document.getElementById('str-table');
  if (t) t.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>TITLE</th><th>STATUS</th><th>ACTION</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  _mkPagination('str-pagination', _strPage, pages, 'strGoPage');
}
function changeStrPerPage(v) { _strPerPage = parseInt(v); _strPage = 1; _renderStreamsTable(); }
function strGoPage(p)        { _strPage = p; _renderStreamsTable(); }

function showStreamForm(id) {
  const stream = id ? streamsData.find(s => String(s.id) === String(id)) : null;
  const isEdit = !!stream;
  const main   = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit?'Edit':'Add'} Stream</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Utilities &rsaquo; Streams &rsaquo; ${isEdit?'Edit':'Add'}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:600px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Title <span style="color:#e74c3c">*</span></label>
          <input id="stream-title" class="fin-search-input" style="width:100%!important;" value="${_esc(stream?.title||'')}">
        </div>
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Notes</label>
          <textarea id="stream-notes" style="width:100%;min-height:80px;padding:8px;border:1px solid #ccc;border-radius:4px;">${_esc(stream?.notes||'')}</textarea>
        </div>
        <div class="stu-form-group" style="margin-bottom:20px;">
          <label><input type="checkbox" id="stream-deactivate"${stream?.is_inactive?' checked':''}> Deactivate/Activate</label>
        </div>
        <div style="display:flex;gap:12px;">
          <button class="fin-btn-teal" onclick="saveStream('${id||''}')">${isEdit?'Update':'Save'}</button>
          <button class="fin-btn-cancel" onclick="loadView('utilities-streams')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function saveStream(id) {
  const title = document.getElementById('stream-title')?.value.trim();
  if (!title) { showToast('Title is required.', 'error'); return; }
  const payload = { title, notes: _fv('stream-notes'), is_inactive: _fc('stream-deactivate') };
  const url     = id ? `${API_BASE}/student-management/streams/${id}` : `${API_BASE}/student-management/streams`;
  const method  = id ? 'PUT' : 'POST';
  const res     = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    showToast(id ? 'Stream updated!' : 'Stream added!', 'success');
    loadView('utilities-streams');
  } else {
    const item = { id: id || ('str_' + Date.now()), ...payload };
    if (id) { const idx = streamsData.findIndex(s => String(s.id) === String(id)); if (idx !== -1) streamsData[idx] = item; }
    else    { streamsData.push(item); }
    showToast(id ? 'Stream updated!' : 'Stream added!', 'success');
    loadView('utilities-streams');
  }
}

// ==================== 8. UTILITIES — FUNDING SOURCES ====================

let _fsPage = 1, _fsPerPage = 10;

async function loadFundingSourcesView(container) {
  openStuUtilitiesDropdown();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Funding Source</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Utilities &rsaquo; Funding Source &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="fs-per-page" onchange="changeFsPerPage(this.value)">
            ${[10,25,50].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="fs-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-teal" onclick="showFundingSourceForm(null)">+ Add</button>
        </div>
      </div>
      <div id="fs-table"></div>
      <div id="fs-pagination"></div>
    </div>
  `;
  renderSkeletonRows('fs-table', 3);
  const res = await apiFetch(`${API_BASE}/student-management/funding-sources`);
  if (res && res.ok) fundingSourcesData = await res.json();
  _fsPage = 1;
  _renderFsTable();
}

function _renderFsTable() {
  const totalEl = document.getElementById('fs-total');
  if (totalEl) totalEl.textContent = fundingSourcesData.length;
  const start = (_fsPage - 1) * _fsPerPage;
  const paged = fundingSourcesData.slice(start, start + _fsPerPage);
  const pages = Math.max(1, Math.ceil(fundingSourcesData.length / _fsPerPage));

  let rows = paged.length
    ? paged.map(f => `<tr>
        <td>${_esc(f.title||'')}</td>
        <td><span style="color:${f.is_inactive?'#e74c3c':'#27ae60'};font-weight:600;">${f.is_inactive?'Inactive':'Active'}</span></td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,'fs-${f.id}')">&#8230;</button>
            <div id="stu-dd-fs-${f.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="showFundingSourceForm('${f.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="fin-empty">No funding sources found.</td></tr>';

  const t = document.getElementById('fs-table');
  if (t) t.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>TITLE</th><th>STATUS</th><th>ACTION</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  _mkPagination('fs-pagination', _fsPage, pages, 'fsGoPage');
}
function changeFsPerPage(v) { _fsPerPage = parseInt(v); _fsPage = 1; _renderFsTable(); }
function fsGoPage(p)        { _fsPage = p; _renderFsTable(); }

function showFundingSourceForm(id) {
  const item   = id ? fundingSourcesData.find(f => String(f.id) === String(id)) : null;
  const isEdit = !!item;
  const main   = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit?'Edit':'Add'} Funding Source</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Utilities &rsaquo; Funding Sources &rsaquo; ${isEdit?'Edit':'Add'}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:600px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Title <span style="color:#e74c3c">*</span></label>
          <input id="fs-title" class="fin-search-input" style="width:100%!important;" value="${_esc(item?.title||'')}">
        </div>
        ${isEdit ? `<div class="stu-form-group" style="margin-bottom:20px;">
          <label><input type="checkbox" id="fs-deactivate"${item?.is_inactive?' checked':''}> Deactivate/Activate</label>
        </div>` : ''}
        <div style="display:flex;gap:12px;">
          <button class="fin-btn-teal" onclick="saveFundingSource('${id||''}')">${isEdit?'Update':'Save'}</button>
          <button class="fin-btn-cancel" onclick="loadView('utilities-funding-sources')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function saveFundingSource(id) {
  const title = document.getElementById('fs-title')?.value.trim();
  if (!title) { showToast('Title is required.', 'error'); return; }
  const payload = { title, is_inactive: id ? _fc('fs-deactivate') : false };
  const url     = id ? `${API_BASE}/student-management/funding-sources/${id}` : `${API_BASE}/student-management/funding-sources`;
  const method  = id ? 'PUT' : 'POST';
  const res     = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    showToast(id ? 'Funding source updated!' : 'Funding source added!', 'success');
    loadView('utilities-funding-sources');
  } else {
    const item = { id: id || ('fs_' + Date.now()), ...payload };
    if (id) { const idx = fundingSourcesData.findIndex(f => String(f.id) === String(id)); if (idx !== -1) fundingSourcesData[idx] = item; }
    else    { fundingSourcesData.push(item); }
    showToast(id ? 'Funding source updated!' : 'Funding source added!', 'success');
    loadView('utilities-funding-sources');
  }
}

// ==================== 9. STUDENT REPORT ====================

let _stuRptData = [], _stuRptPage = 1, _stuRptPerPage = 10, _stuRptSearch = '';

async function loadStudentReportView(container) {
  openStuReportsDropdown();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Report</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Reports &rsaquo; Student Report</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="srpt-per-page" onchange="changeStuRptPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="srpt-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV" onclick="exportStuReportCSV()">&#128202;</button>
          <input type="text" class="fin-search-input" id="srpt-search" placeholder="&#128269; Search&#8230;" oninput="onStuRptSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="srpt-table"></div>
      <div id="srpt-pagination"></div>
    </div>
  `;
  renderSkeletonRows('srpt-table', 7);
  const res = await apiFetch(`${API_BASE}/reports/students`);
  if (res && res.ok) _stuRptData = await res.json();
  _stuRptPage = 1;
  _renderStuRptTable();
}

function _stuRptFiltered() {
  if (!_stuRptSearch) return _stuRptData;
  const q = _stuRptSearch;
  return _stuRptData.filter(s =>
    (`${s.first_name||''} ${s.last_name||''}`).toLowerCase().includes(q) ||
    (s.student_id||s.admission_no||'').toLowerCase().includes(q)
  );
}

function _renderStuRptTable() {
  const filtered = _stuRptFiltered();
  const totalEl  = document.getElementById('srpt-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_stuRptPage - 1) * _stuRptPerPage;
  const paged = filtered.slice(start, start + _stuRptPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _stuRptPerPage));

  let rows = paged.length
    ? paged.map(s => `<tr>
        <td>${_esc(s.student_id||s.admission_no||'')}</td>
        <td>${_esc(`${s.first_name||''} ${s.last_name||''}`.trim()||s.full_name||'')}</td>
        <td>${_esc(s.joining_date||'-')}</td>
        <td>${_esc(s.gender||'-')}</td>
        <td>${_esc(s.date_of_birth||'-')}</td>
        <td>${_esc(s.admission_date||s.joining_date||'-')}</td>
        <td><span style="color:${s.is_active?'#27ae60':'#e74c3c'};font-weight:600;">${s.is_active?'Active':'Inactive'}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="fin-empty">No records found.</td></tr>';

  const tbl = document.getElementById('srpt-table');
  if (tbl) tbl.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>ADMISSION NO.</th><th>FULL NAME</th><th>JOINING DATE</th><th>GENDER</th><th>BIRTH DATE</th><th>ADMISSION DATE</th><th>STATUS</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  _mkPagination('srpt-pagination', _stuRptPage, pages, 'stuRptGoPage');
}
function changeStuRptPerPage(v) { _stuRptPerPage = parseInt(v); _stuRptPage = 1; _renderStuRptTable(); }
function onStuRptSearch(v)      { _stuRptSearch  = v.trim().toLowerCase(); _stuRptPage = 1; _renderStuRptTable(); }
function stuRptGoPage(p)        { _stuRptPage = p; _renderStuRptTable(); }
function exportStuReportCSV() {
  exportTableCSV(
    ['Admission No.','Full Name','Joining Date','Gender','Birth Date','Admission Date','Status'],
    _stuRptFiltered().map(s => [
      s.student_id||s.admission_no||'', `${s.first_name||''} ${s.last_name||''}`.trim()||s.full_name||'',
      s.joining_date||'', s.gender||'', s.date_of_birth||'', s.admission_date||s.joining_date||'',
      s.is_active ? 'Active' : 'Inactive'
    ]),
    'student-report.csv'
  );
}

// ==================== 10. STUDENT GUARDIAN REPORT ====================

let _stuGuaData = [], _stuGuaPage = 1, _stuGuaPerPage = 10, _stuGuaSearch = '';

async function loadStudentGuardianReportView(container) {
  openStuReportsDropdown();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Guardian Report</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Reports &rsaquo; Student Guardian Report</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="sgr-per-page" onchange="changeStuGuaPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="sgr-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV">&#128202;</button>
          <input type="text" class="fin-search-input" id="sgr-search" placeholder="&#128269; Search&#8230;" oninput="onStuGuaSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="sgr-table"></div>
      <div id="sgr-pagination"></div>
    </div>
  `;
  renderSkeletonRows('sgr-table', 6);
  const res = await apiFetch(`${API_BASE}/reports/student-guardians`);
  if (res && res.ok) _stuGuaData = await res.json();
  _stuGuaPage = 1;
  _renderStuGuaTable();
}

function _stuGuaFiltered() {
  if (!_stuGuaSearch) return _stuGuaData;
  const q = _stuGuaSearch;
  return _stuGuaData.filter(g =>
    (g.admission_no||g.student_id||'').toLowerCase().includes(q) ||
    (g.student_name||g.contact_name||'').toLowerCase().includes(q)
  );
}

function _renderStuGuaTable() {
  const filtered = _stuGuaFiltered();
  const totalEl  = document.getElementById('sgr-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_stuGuaPage - 1) * _stuGuaPerPage;
  const paged = filtered.slice(start, start + _stuGuaPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _stuGuaPerPage));

  let rows = paged.length
    ? paged.map(g => `<tr>
        <td>${_esc(g.admission_no||g.student_id||'')}</td>
        <td>${_esc(g.student_name||'')}</td>
        <td>${_esc(g.guardian_name||g.contact_name||'')}</td>
        <td>${_esc(g.relationship||'')}</td>
        <td>${_esc(g.phone||g.primary_phone||'')}</td>
        <td>${_esc(g.email||'')}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="fin-empty">No records found.</td></tr>';

  const tbl = document.getElementById('sgr-table');
  if (tbl) tbl.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>ADMISSION NO.</th><th>STUDENT NAME</th><th>GUARDIAN NAME</th><th>RELATIONSHIP</th><th>PHONE</th><th>EMAIL</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  _mkPagination('sgr-pagination', _stuGuaPage, pages, 'stuGuaGoPage');
}
function changeStuGuaPerPage(v) { _stuGuaPerPage = parseInt(v); _stuGuaPage = 1; _renderStuGuaTable(); }
function onStuGuaSearch(v)      { _stuGuaSearch  = v.trim().toLowerCase(); _stuGuaPage = 1; _renderStuGuaTable(); }
function stuGuaGoPage(p)        { _stuGuaPage = p; _renderStuGuaTable(); }

// ==================== 11. CLASSES ====================

let _clsData = [], _clsPage = 1, _clsPerPage = 10, _clsSearch = '';
let _clsAcademicYears = [];

async function loadStudentClassesView(container) {
  setActiveSidebarItem('sidebar-stu-classes');
  openStuMgmtDropdowns();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Classes</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Classes &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="cls-per-page" onchange="changeClsPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="cls-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" id="cls-search" placeholder="&#128269; Search&#8230;"
                 oninput="onClsSearch(this.value)">
          <button class="fin-btn-teal" onclick="showClassForm(null)">+ Add Class</button>
        </div>
      </div>
      <div id="cls-table"></div>
      <div id="cls-pagination"></div>
    </div>
  `;
  renderSkeletonRows('cls-table', 5);

  const [clsRes, ayRes] = await Promise.all([
    apiFetch(`${API_BASE}/academics/classes`),
    apiFetch(`${API_BASE}/academic-years/`)
  ]);
  _clsData          = (clsRes && clsRes.ok) ? await clsRes.json() : [];
  _clsAcademicYears = (ayRes  && ayRes.ok)  ? await ayRes.json()  : [];
  _clsPage = 1;
  _renderClsTable();
}

function _clsFiltered() {
  if (!_clsSearch) return _clsData;
  const q = _clsSearch;
  return _clsData.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.code || c.class_code || '').toLowerCase().includes(q)
  );
}

function _renderClsTable() {
  const filtered = _clsFiltered();
  const totalEl  = document.getElementById('cls-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_clsPage - 1) * _clsPerPage;
  const paged = filtered.slice(start, start + _clsPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _clsPerPage));

  let rows = paged.length
    ? paged.map(c => {
        const ay = _clsAcademicYears.find(y => y.id === (c.academic_year_id || c.academic_year));
        const ayName = ay ? ay.name : (c.academic_year_name || '-');
        const statusColor = c.is_active !== false ? '#27ae60' : '#e74c3c';
        const statusText  = c.is_active !== false ? 'Active'  : 'Inactive';
        return `<tr>
          <td>${_esc(c.code || c.class_code || '-')}</td>
          <td>${_esc(c.name || '-')}</td>
          <td>${_esc(c.level || c.level_name || '-')}</td>
          <td>${_esc(ayName)}</td>
          <td>${_esc(c.stream || '-')}</td>
          <td><span style="color:${statusColor};font-weight:600;">${statusText}</span></td>
          <td class="fin-action-cell">
            <div class="fin-action-wrap">
              <button class="fin-action-btn" onclick="toggleStuDd(event,'cls-${c.id}')">&#8230;</button>
              <div id="stu-dd-cls-${c.id}" class="fin-action-dropdown" style="display:none;">
                <a href="#" onclick="showClassForm('${c.id}');return false;">&#9998; Edit</a>
              </div>
            </div>
          </td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7" class="fin-empty">No classes found. Add one to get started.</td></tr>';

  const t = document.getElementById('cls-table');
  if (t) t.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>CLASS CODE</th><th>CLASS NAME</th><th>LEVEL</th>
        <th>ACADEMIC YEAR</th><th>STREAM</th><th>STATUS</th><th>ACTION</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  _mkPagination('cls-pagination', _clsPage, pages, 'clsGoPage');
}

function changeClsPerPage(v) { _clsPerPage = parseInt(v); _clsPage = 1; _renderClsTable(); }
function onClsSearch(v)      { _clsSearch  = v.trim().toLowerCase(); _clsPage = 1; _renderClsTable(); }
function clsGoPage(p)        { _clsPage = p; _renderClsTable(); }

async function showClassForm(id) {
  const item   = id ? _clsData.find(c => String(c.id) === String(id)) : null;
  const isEdit = !!item;

  // Always re-fetch both academic years and academic levels for freshest dropdowns
  const [_ayRes, _lvlRes] = await Promise.all([
    apiFetch(`${API_BASE}/academic-years/`),
    apiFetch(`${API_BASE}/academic-levels/`),
  ]);
  if (_ayRes  && _ayRes.ok)  _clsAcademicYears = await _ayRes.json();
  const _levels = (_lvlRes && _lvlRes.ok) ? await _lvlRes.json() : [];

  const ayOpts = _clsAcademicYears.map(y =>
    `<option value="${_esc(String(y.id))}"${String(item?.academic_year_id || item?.academic_year) === String(y.id) ? ' selected' : ''}>${_esc(y.name)}</option>`
  ).join('');

  const currentLevel = item?.level || item?.level_name || '';
  const levelOpts = _levels.map(l =>
    `<option value="${_esc(String(l.id))}"${currentLevel === l.name || currentLevel === String(l.id) ? ' selected' : ''}>${_esc(l.name)}</option>`
  ).join('');

  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit ? 'Edit' : 'Add'} Class</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Classes &rsaquo; ${isEdit ? 'Edit' : 'Add'}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:640px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-grid">
          <div class="stu-form-group">
            <label>Class Name <span style="color:#e74c3c">*</span></label>
            <input id="cls-f-name" class="fin-search-input" style="width:100%!important"
                   value="${_esc(item?.name || '')}" placeholder="e.g. Acorn 2026">
            <span class="stu-field-error" id="cls-f-name-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Class Code <span style="color:#e74c3c">*</span></label>
            <input id="cls-f-code" class="fin-search-input" style="width:100%!important"
                   value="${_esc(item?.code || item?.class_code || '')}" placeholder="e.g. ACN-2026">
            <span class="stu-field-error" id="cls-f-code-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Level <span style="color:#e74c3c">*</span></label>
            <select id="cls-f-level" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                    onchange="autoFillClassName()">
              <option value="">Select</option>${levelOpts}
            </select>
            <span class="stu-field-error" id="cls-f-level-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Academic Year <span style="color:#e74c3c">*</span></label>
            <select id="cls-f-ay" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                    onchange="autoFillClassName()">
              <option value="">Select Academic Year</option>${ayOpts}
            </select>
            <span class="stu-field-error" id="cls-f-ay-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Stream</label>
            <input id="cls-f-stream" class="fin-search-input" style="width:100%!important"
                   value="${_esc(item?.stream || '')}" placeholder="e.g. A, B, Red">
          </div>
          <div class="stu-form-group">
            <label>Capacity</label>
            <input id="cls-f-capacity" type="number" class="fin-search-input" style="width:100%!important"
                   value="${_esc(String(item?.capacity || ''))}" placeholder="Max students">
          </div>
          <div class="stu-form-group" style="grid-column:span 2;">
            <label>Status</label>
            <select id="cls-f-status" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
              <option value="true"${item?.is_active !== false ? ' selected' : ''}>Active</option>
              <option value="false"${item?.is_active === false ? ' selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="fin-btn-teal" onclick="saveClass('${id || ''}')">${isEdit ? 'Update' : 'Save'}</button>
          <button class="fin-btn-cancel" onclick="loadView('student-classes')">Cancel</button>
        </div>
        <div id="cls-form-status" style="margin-top:10px;"></div>
      </div>
    </div>
  `;
}

function autoFillClassName() {
  const levelEl = document.getElementById('cls-f-level');
  const ayEl    = document.getElementById('cls-f-ay');
  const nameEl  = document.getElementById('cls-f-name');
  const codeEl  = document.getElementById('cls-f-code');
  if (!levelEl || !ayEl || !nameEl || !codeEl) return;

  // Get the display text of the selected level (not the id value)
  const levelText = levelEl.options[levelEl.selectedIndex]?.text || '';
  const ay        = _clsAcademicYears.find(y => String(y.id) === ayEl.value);
  if (!ay || !levelText) return;

  const yearPart = ay.name.match(/\d{4}/)?.[0] || ay.name;
  if (!nameEl.value) nameEl.value = `${levelText} ${yearPart}`;
  if (!codeEl.value) codeEl.value = `${levelText.slice(0, 3).toUpperCase()}-${yearPart}`;
}

async function saveClass(id) {
  const name     = (document.getElementById('cls-f-name')?.value || '').trim();
  const code     = (document.getElementById('cls-f-code')?.value || '').trim();
  const levelEl  = document.getElementById('cls-f-level');
  const level    = levelEl?.value || '';
  const levelName = levelEl?.options[levelEl?.selectedIndex]?.text || level;
  const ayId     = document.getElementById('cls-f-ay')?.value || '';
  const statusEl = document.getElementById('cls-form-status');

  let valid = true;
  const setErr = (errId, val, msg) => {
    const el = document.getElementById(errId);
    if (el) el.textContent = val ? '' : msg;
    if (!val) valid = false;
  };
  setErr('cls-f-name-err',  name,  'Class name is required.');
  setErr('cls-f-code-err',  code,  'Class code is required.');
  setErr('cls-f-level-err', level, 'Level is required.');
  setErr('cls-f-ay-err',    ayId,  'Academic Year is required.');
  if (!valid) return;

  const payload = {
    name,
    code,
    class_code:       code,
    level_id:         level,
    level:            levelName,
    academic_year_id: ayId,
    stream:           document.getElementById('cls-f-stream')?.value || '',
    capacity:         parseInt(document.getElementById('cls-f-capacity')?.value) || null,
    is_active:        document.getElementById('cls-f-status')?.value !== 'false',
  };

  const url    = id ? `${API_BASE}/academics/classes/${id}` : `${API_BASE}/academics/classes`;
  const method = id ? 'PUT' : 'POST';
  const res    = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res && res.ok) {
    showToast(id ? 'Class updated!' : 'Class added!', 'success');
    loadView('student-classes');
  } else {
    const msg = res ? await parseApiError(res) : 'Could not save class.';
    if (statusEl) statusEl.innerHTML = `<span style="color:#e74c3c;font-size:0.88rem;">${_esc(msg)}</span>`;
  }
}

// ==================== 12. COHORT SESSION PLANNER ====================

// ── State ────────────────────────────────────────────────────────────────────
let _cspData         = [];
let _cspPage         = 1;
let _cspPerPage      = 10;
let _cspTotalRecords = 0;
let _cspTotalPages   = 1;
let _cspFilterOpen   = false;
let _cspFilters      = { session_name: '', period_from: '', period_to: '' };
let _currentCspId    = null;
let _cspSessions     = [];
let _cspDirty        = false;

// ── Date helpers ──────────────────────────────────────────────────────────────
const _CSP_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function _cspFmtDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return `${String(d.getUTCDate()).padStart(2,'0')} ${_CSP_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function _cspFmtDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d)) return isoStr;
  const day  = String(d.getDate()).padStart(2,'0');
  const mon  = _CSP_MONTHS[d.getMonth()];
  const yr   = d.getFullYear();
  let   h    = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min  = String(d.getMinutes()).padStart(2,'0');
  return `${day} ${mon} ${yr} ${h}:${min} ${ampm}`;
}

function _cspFmtPeriod(start, end) {
  const s = _cspFmtDate(start);
  const e = _cspFmtDate(end);
  if (s === '-' && e === '-') return '-';
  return `${s} – ${e}`;
}

// ── Listing ───────────────────────────────────────────────────────────────────
async function loadCohortSessionPlannerView(container) {
  setActiveSidebarItem('sidebar-stu-cohort');
  openStuMgmtDropdowns();
  _cspPage       = 1;
  _cspFilterOpen = false;

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Cohort Session Planner</h2>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Cohort Session Planner &rsaquo; Listing</div>
          <button class="fin-btn-teal" onclick="cspOpenAdd()">+ Add Cohort Session Planner</button>
        </div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="csp-per-page" onchange="changeCspPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}"${n===_cspPerPage?' selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="csp-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-filter" onclick="toggleCspFilterPanel()">&#9776; Filters</button>
        </div>
      </div>

      <!-- Inline filter panel -->
      <div id="csp-filter-panel" style="display:none;background:white;border:1px solid #e0e0e0;border-radius:6px;padding:16px 20px;margin-bottom:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px 16px;align-items:end;">
          <div class="stu-form-group">
            <label>Session Name</label>
            <input id="csp-f-session" class="fin-search-input" style="width:100%!important;"
                   placeholder="Filter by session" value="${_esc(_cspFilters.session_name)}">
          </div>
          <div class="stu-form-group">
            <label>Period From</label>
            <input id="csp-f-from" type="date" class="fin-search-input" style="width:100%!important;"
                   value="${_esc(_cspFilters.period_from)}">
          </div>
          <div class="stu-form-group">
            <label>Period To</label>
            <input id="csp-f-to" type="date" class="fin-search-input" style="width:100%!important;"
                   value="${_esc(_cspFilters.period_to)}">
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px;">
          <button class="fin-btn-teal"    onclick="applyCspFilters()">Apply</button>
          <button class="fin-btn-outline" onclick="clearCspFilters()">Clear</button>
        </div>
      </div>

      <div id="csp-table-container"></div>
      <div id="csp-pagination"></div>
    </div>
  `;

  renderSkeletonRows('csp-table-container', 7);
  await _fetchCspListing();
}

async function _fetchCspListing() {
  const params = new URLSearchParams({
    page:     _cspPage,
    per_page: _cspPerPage,
  });
  if (_cspFilters.session_name) params.set('session_name', _cspFilters.session_name);
  if (_cspFilters.period_from)  params.set('period_from',  _cspFilters.period_from);
  if (_cspFilters.period_to)    params.set('period_to',    _cspFilters.period_to);

  const res = await apiFetch(`${API_BASE}/cohort-session-planner?${params}`);
  if (!res || !res.ok) {
    showToast('Failed to load Cohort Session Planner records.', 'error');
    const c = document.getElementById('csp-table-container');
    if (c) c.innerHTML = '<p class="fin-error">Error loading records.</p>';
    return;
  }

  const json = await res.json();
  // Support both wrapped { data, meta } and plain array responses
  if (Array.isArray(json)) {
    _cspData         = json;
    _cspTotalRecords = json.length;
    _cspTotalPages   = Math.max(1, Math.ceil(json.length / _cspPerPage));
  } else {
    _cspData         = json.data || [];
    _cspTotalRecords = json.meta?.total     ?? _cspData.length;
    _cspTotalPages   = json.meta?.total_pages ?? Math.max(1, Math.ceil(_cspTotalRecords / _cspPerPage));
  }

  const totalEl = document.getElementById('csp-total-count');
  if (totalEl) totalEl.textContent = _cspTotalRecords;

  _renderCspTable();
}

function _renderCspTable() {
  const COLS = 7;
  let rows = '';

  if (!_cspData.length) {
    rows = `<tr><td colspan="${COLS}" class="fin-empty">No records found.</td></tr>`;
  } else {
    _cspData.forEach(r => {
      rows += `<tr>
        <td>${_esc(r.session_name || '-')}</td>
        <td>${_cspFmtPeriod(r.period_start, r.period_end)}</td>
        <td>${_esc(String(r.total_cohorts ?? '-'))}</td>
        <td>${_esc(r.personnel || '-')}</td>
        <td>${_cspFmtDateTime(r.created_at)}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,'csp-${r.id}')">&#8230;</button>
            <div id="stu-dd-csp-${r.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="cspOpenEdit(${r.id});return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  const tbl = document.getElementById('csp-table-container');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>SESSION NAME</th><th>PERIOD</th>
          <th>TOTAL COHORTS</th><th>PERSONNEL</th><th>CREATED AT</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  _mkPagination('csp-pagination', _cspPage, _cspTotalPages, 'cspGoPage');
}

async function cspGoPage(p) {
  _cspPage = p;
  renderSkeletonRows('csp-table-container', 7);
  await _fetchCspListing();
}

function changeCspPerPage(v) {
  _cspPerPage = parseInt(v);
  _cspPage    = 1;
  _fetchCspListing();
}

function toggleCspFilterPanel() {
  _cspFilterOpen = !_cspFilterOpen;
  const p = document.getElementById('csp-filter-panel');
  if (p) p.style.display = _cspFilterOpen ? 'block' : 'none';
}

function applyCspFilters() {
  _cspFilters.session_name = document.getElementById('csp-f-session')?.value.trim() || '';
  _cspFilters.period_from  = document.getElementById('csp-f-from')?.value || '';
  _cspFilters.period_to    = document.getElementById('csp-f-to')?.value   || '';
  _cspPage = 1;
  renderSkeletonRows('csp-table-container', 7);
  _fetchCspListing();
}

function clearCspFilters() {
  _cspFilters = { session_name: '', period_from: '', period_to: '' };
  ['csp-f-session','csp-f-from','csp-f-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  _cspPage = 1;
  _fetchCspListing();
}

function cspOpenAdd() {
  _currentCspId = null;
  _cspDirty     = false;
  loadView('cohort-session-planner-add');
}

function cspOpenEdit(id) {
  _currentCspId = id;
  _cspDirty     = false;
  loadView('cohort-session-planner-edit');
}

// ── Add / Edit Form ───────────────────────────────────────────────────────────
async function loadCohortSessionPlannerFormView(container) {
  const isEdit = !!_currentCspId;
  const title  = isEdit ? 'Edit Cohort Session Planner' : 'Add Cohort Session Planner';

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${title}</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Student Management &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('cohort-session-planner');return false;">Cohort Session Planner</a>
          &rsaquo; ${isEdit ? 'Edit' : 'Add'}
        </div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div id="csp-form-loading" style="padding:32px;text-align:center;color:#888;">Loading&#8230;</div>
      </div>
    </div>
  `;

  // Load sessions (and existing record if editing) in parallel
  const fetches = [apiFetch(`${API_BASE}/sessions`)];
  if (isEdit) fetches.push(apiFetch(`${API_BASE}/cohort-session-planner/${_currentCspId}`));

  const [sessRes, recordRes] = await Promise.all(fetches);
  _cspSessions = (sessRes && sessRes.ok) ? await sessRes.json() : [];
  const record = (isEdit && recordRes && recordRes.ok) ? await recordRes.json() : null;

  if (isEdit && !record) {
    showToast('Could not load record.', 'error');
    loadView('cohort-session-planner');
    return;
  }

  _renderCspForm(container, isEdit, record);
}

function _renderCspForm(container, isEdit, record) {
  const sessOpts = _cspSessions.map(s =>
    `<option value="${_esc(String(s.id))}"${String(record?.session_id) === String(s.id) ? ' selected' : ''}>${_esc(s.name || s.title || '')}</option>`
  ).join('');

  // Pre-fill auto-populated fields from loaded record
  const selSession  = record ? _cspSessions.find(s => String(s.id) === String(record.session_id)) : null;
  const acYear      = record?.academic_year  || selSession?.academic_year  || '';
  const sessType    = record?.session_type   || selSession?.session_type   || '';
  const periodStart = record?.period_start   || selSession?.period_start   || '';
  const periodEnd   = record?.period_end     || selSession?.period_end     || '';
  const period      = (periodStart || periodEnd) ? _cspFmtPeriod(periodStart, periodEnd) : '';
  const personnel   = record?.personnel || _cspGetCurrentUserName();
  const notes       = record?.notes || '';
  const existingClassIds = record?.class_ids || [];

  const wrapper = container.querySelector('div > div');
  if (!wrapper) return;
  wrapper.innerHTML = `
    <div class="stu-form-grid" id="csp-form-grid">

      <!-- Row 1: Session Name + Academic Year -->
      <div class="stu-form-group">
        <label>Session Name <span style="color:#e74c3c">*</span></label>
        <select id="csp-session-id" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                onchange="onCspSessionChange(this.value)">
          <option value="">— Select Session —</option>${sessOpts}
        </select>
        <span class="stu-field-error" id="csp-session-err"></span>
      </div>
      <div class="stu-form-group">
        <label>Academic Year</label>
        <input id="csp-academic-year" class="fin-search-input" style="width:100%!important;"
               value="${_esc(acYear)}" readonly placeholder="Auto-populated">
      </div>

      <!-- Row 2: Period + Session Type -->
      <div class="stu-form-group">
        <label>Period</label>
        <input id="csp-period" class="fin-search-input" style="width:100%!important;"
               value="${_esc(period)}" readonly placeholder="Auto-populated">
      </div>
      <div class="stu-form-group">
        <label>Session Type</label>
        <input id="csp-session-type" class="fin-search-input" style="width:100%!important;"
               value="${_esc(sessType)}" readonly placeholder="Auto-populated">
      </div>

      <!-- Row 3: Class table (full width) -->
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Classes</label>
        <div id="csp-class-table-wrap" class="csp-class-table-wrap">
          <p style="color:#888;font-size:0.88rem;padding:12px 0;">Loading classes&#8230;</p>
        </div>
      </div>

      <!-- Row 5: Personnel + Total Cohorts -->
      <div class="stu-form-group">
        <label>Personnel</label>
        <input id="csp-personnel" class="fin-search-input" style="width:100%!important;"
               value="${_esc(personnel)}" readonly>
      </div>
      <div class="stu-form-group">
        <label>Total Cohorts</label>
        <input id="csp-total-cohorts" type="text" class="fin-search-input" style="width:100%!important;"
               value="0" readonly>
      </div>

      <!-- Row 6: Notes (full width) -->
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Notes</label>
        <textarea id="csp-notes" style="width:100%;min-height:90px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:0.9rem;resize:vertical;">${_esc(notes)}</textarea>
      </div>

    </div>

    <div style="display:flex;gap:12px;margin-top:24px;">
      <button class="fin-btn-teal" onclick="submitCspForm()">${isEdit ? 'Update' : 'Save'}</button>
      <button class="fin-btn-cancel" onclick="cancelCspForm()">Cancel</button>
    </div>
    <div id="csp-form-status" style="margin-top:10px;"></div>
  `;

  // Mark dirty on any change
  wrapper.querySelectorAll('input,select,textarea').forEach(el => {
    el.addEventListener('change', () => { _cspDirty = true; });
    el.addEventListener('input',  () => { _cspDirty = true; });
  });

  // Load all classes immediately
  _loadCspClasses(existingClassIds);
}

function _cspGetCurrentUserName() {
  if (!currentUser) return '';
  return currentUser.full_name || currentUser.name ||
         ((currentUser.first_name || '') + ' ' + (currentUser.last_name || '')).trim() ||
         currentUser.email || '';
}

function onCspSessionChange(sessionId) {
  _cspDirty = true;
  const sess = _cspSessions.find(s => String(s.id) === String(sessionId));
  if (!sess) {
    ['csp-academic-year','csp-period','csp-session-type'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    return;
  }
  const ayEl   = document.getElementById('csp-academic-year');
  const perEl  = document.getElementById('csp-period');
  const typeEl = document.getElementById('csp-session-type');
  if (ayEl)   ayEl.value   = sess.academic_year  || sess.academic_year_name || '';
  if (perEl)  perEl.value  = (sess.period_start || sess.period_end)
    ? _cspFmtPeriod(sess.period_start || sess.start_date, sess.period_end || sess.end_date)
    : '';
  if (typeEl) typeEl.value = sess.session_type || sess.type || '';
  // Clear session name error on selection
  const errEl = document.getElementById('csp-session-err');
  if (errEl) errEl.textContent = '';
}

async function _loadCspClasses(preCheckedIds = []) {
  const wrap = document.getElementById('csp-class-table-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table"><tbody id="csp-class-tbody"></tbody></table>
    </div>`;
  renderSkeletonRows('csp-class-tbody', 5, 3);

  const res = await apiFetch(`${API_BASE}/academics/classes`);
  const classes = (res && res.ok) ? await res.json() : [];

  if (!classes.length) {
    wrap.innerHTML = '<p style="color:#888;font-size:0.88rem;padding:12px 0;">No classes available.</p>';
    _updateCspTotalCohorts();
    return;
  }

  const rows = classes.map(c => {
    const checked = preCheckedIds.map(String).includes(String(c.id)) ? 'checked' : '';
    return `<tr class="csp-class-row${checked ? ' csp-row-checked' : ''}">
      <td style="width:40px;"><input type="checkbox" class="csp-cls-cb" value="${c.id}"
          data-id="${c.id}" onchange="cspRowCheck(this)" ${checked}></td>
      <td>${_esc(c.code || c.class_code || '-')}</td>
      <td>${_esc(c.programme || c.programme_name || '-')}</td>
      <td>${_esc(c.stage || c.level || c.level_name || '-')}</td>
      <td>${_esc(String(c.session_no || c.session_number || '-'))}</td>
      <td>${_esc(c.milestone || '-')}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th style="width:40px;">
            <input type="checkbox" id="csp-select-all" onchange="toggleCspSelectAll(this)"
                   title="Select all">
          </th>
          <th>CLASS CODE</th><th>PROGRAMME</th><th>STAGE</th>
          <th>SESSION NO</th><th>MILESTONE</th>
        </tr></thead>
        <tbody id="csp-class-tbody">${rows}</tbody>
      </table>
    </div>`;

  _updateCspTotalCohorts();
  _syncCspSelectAll();
}

function cspRowCheck(cb) {
  const row = cb.closest('tr');
  if (row) row.classList.toggle('csp-row-checked', cb.checked);
  _updateCspTotalCohorts();
  _syncCspSelectAll();
}

function toggleCspSelectAll(masterCb) {
  document.querySelectorAll('.csp-cls-cb').forEach(cb => {
    cb.checked = masterCb.checked;
    const row = cb.closest('tr');
    if (row) row.classList.toggle('csp-row-checked', masterCb.checked);
  });
  _updateCspTotalCohorts();
}

function _syncCspSelectAll() {
  const all   = document.querySelectorAll('.csp-cls-cb');
  const master = document.getElementById('csp-select-all');
  if (!master || !all.length) return;
  const checkedCount = document.querySelectorAll('.csp-cls-cb:checked').length;
  master.checked       = checkedCount === all.length;
  master.indeterminate = checkedCount > 0 && checkedCount < all.length;
}

function _updateCspTotalCohorts() {
  const count = document.querySelectorAll('.csp-cls-cb:checked').length;
  const el    = document.getElementById('csp-total-cohorts');
  if (el) el.value = String(count);
}

async function submitCspForm() {
  const sessionId = document.getElementById('csp-session-id')?.value || '';
  const sessionErr = document.getElementById('csp-session-err');
  if (!sessionId) {
    if (sessionErr) sessionErr.textContent = 'Session Name is required.';
    showToast('Please select a session.', 'error');
    return;
  }
  if (sessionErr) sessionErr.textContent = '';

  const classIds = Array.from(document.querySelectorAll('.csp-cls-cb:checked')).map(cb => cb.value);
  const payload  = {
    session_id: parseInt(sessionId),
    class_ids:  classIds.map(Number),
    notes:      document.getElementById('csp-notes')?.value || '',
  };

  const btn = document.querySelector('[onclick="submitCspForm()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const url    = _currentCspId
    ? `${API_BASE}/cohort-session-planner/${_currentCspId}`
    : `${API_BASE}/cohort-session-planner`;
  const method = _currentCspId ? 'PUT' : 'POST';

  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (btn) { btn.disabled = false; btn.textContent = _currentCspId ? 'Update' : 'Save'; }

  if (res && res.ok) {
    _cspDirty = false;
    const msg = _currentCspId
      ? 'Cohort Session Planner updated successfully.'
      : 'Cohort Session Planner created successfully.';
    showToast(msg, 'success');
    _currentCspId = null;
    loadView('cohort-session-planner');
  } else {
    const msg = res ? await parseApiError(res) : 'Could not save. Please try again.';
    showToast(msg, 'error');
    const statusEl = document.getElementById('csp-form-status');
    if (statusEl) statusEl.innerHTML = `<span style="color:#e74c3c;font-size:0.88rem;">${_esc(msg)}</span>`;
  }
}

function cancelCspForm() {
  if (_cspDirty && !confirm('You have unsaved changes. Are you sure you want to leave?')) return;
  _cspDirty     = false;
  _currentCspId = null;
  loadView('cohort-session-planner');
}
