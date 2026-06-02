// ==================== STUDENT MANAGEMENT ====================

// ── In-memory stores ──────────────────────────────────────────────────────────
let allStudentsData   = [];
let filteredStudentsData = [];
let _stuListPage      = 1;
let _stuListPerPage   = 10;
let _stuListSearch    = '';

let streamsData       = [];
let fundingSourcesData = [];
let studentReportingData = [];

// ── Shared helpers ────────────────────────────────────────────────────────────
function _sEsc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function calculateAge(birthDateStr) {
  if (!birthDateStr) return '';
  const birth = new Date(birthDateStr);
  const now   = new Date();
  let years   = now.getFullYear() - birth.getFullYear();
  let months  = now.getMonth()    - birth.getMonth();
  if (months < 0) { years--; months += 12; }
  if (now.getDate() < birth.getDate()) months--;
  if (months < 0)  { years--; months += 12; }
  return `${years} year(s) ${months} month(s)`;
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
        <h2 class="fin-title">Student</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="stu-per-page" onchange="changeStuPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}">${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="stu-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Browse file to update">&#128193; Browse file to update</button>
          <button class="fin-export-btn" title="Browse file to upload">&#128228; Browse file to upload</button>
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV" onclick="exportStudentsCSV()">&#128202;</button>
          <button class="fin-btn-teal" onclick="showStudentForm(null)">+ Add</button>
          <input type="text" class="fin-search-input" id="stu-search" placeholder="&#128269; Search&#8230;"
                 oninput="onStuSearch(this.value)">
          <button class="fin-btn-filter" onclick="showStuFilterPanel()">&#9776; Filters</button>
        </div>
      </div>
      <div id="stu-table-container"><p class="fin-loading">Loading&#8230;</p></div>
      <div id="stu-pagination"></div>
    </div>
    <div id="stu-filter-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.35);z-index:400;" onclick="closeStuFilterPanel(event)">
      <div class="hr-filter-panel" onclick="event.stopPropagation()">
        <div class="hr-filter-panel-header">
          <span class="hr-filter-panel-title">Filters</span>
          <button class="hr-filter-close-btn" onclick="closeStuFilterPanel()">&#x2715;</button>
        </div>
        <div class="hr-filter-panel-body">
          <div class="hr-filter-group"><label class="hr-filter-label">Level Enrolled</label>
            <select id="sf-level" class="hr-filter-select">
              <option value="">All</option>
              <option>Acorn</option><option>Willow</option><option>Maple</option><option>Oak</option>
            </select>
          </div>
          <div class="hr-filter-group"><label class="hr-filter-label">Class</label>
            <input id="sf-class" class="hr-filter-input" placeholder="e.g. Class 026">
          </div>
          <div class="hr-filter-group"><label class="hr-filter-label">Gender</label>
            <select id="sf-gender" class="hr-filter-select">
              <option value="">All</option><option>Male</option><option>Female</option>
            </select>
          </div>
          <div class="hr-filter-group"><label class="hr-filter-label">Nationality</label>
            <input id="sf-nationality" class="hr-filter-input" placeholder="Nationality">
          </div>
        </div>
        <div style="padding:14px 20px;display:flex;gap:10px;">
          <button class="fin-btn-teal" onclick="applyStuFilters()">Apply</button>
          <button class="fin-btn-outline" onclick="clearStuFilters()">Clear</button>
        </div>
      </div>
    </div>
    <div id="stu-edit-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.45);z-index:500;overflow-y:auto;"></div>
  `;
  await refreshStudentsListing();
}

async function refreshStudentsListing() {
  const c = document.getElementById('stu-table-container');
  if (!c) return;
  try {
    const res = await fetch(`${API_BASE}/students/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { c.innerHTML = '<p class="fin-error">Error loading students.</p>'; return; }
    allStudentsData = await res.json();
    filteredStudentsData = [...allStudentsData];
    _stuListPage = 1;
    _renderStuTable();
  } catch(_) { c.innerHTML = '<p class="fin-error">Failed to load students.</p>'; }
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
  return d;
}

function _renderStuTable() {
  const filtered = _stuFiltered();
  const totalEl  = document.getElementById('stu-total-count');
  if (totalEl) totalEl.textContent = filtered.length;

  const start = (_stuListPage - 1) * _stuListPerPage;
  const paged = filtered.slice(start, start + _stuListPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _stuListPerPage));

  let rows = '';
  if (paged.length === 0) {
    rows = `<tr><td colspan="11" class="fin-empty">No records found.</td></tr>`;
  } else {
    paged.forEach(s => {
      const canEdit = currentUser?.clearance_level <= 3;
      rows += `<tr>
        <td>${_sEsc(s.student_id||'')}</td>
        <td>${_sEsc((s.first_name||'')+' '+(s.last_name||''))}</td>
        <td>${_sEsc(s.gender||'-')}</td>
        <td>${_sEsc(s.cohort||'-')}</td>
        <td>${_sEsc(s.class_name||'-')}</td>
        <td>${_sEsc(s.session||'-')}</td>
        <td>${_sEsc(s.stream||'-')}</td>
        <td>${_sEsc(s.sports_house||'-')}</td>
        <td><span style="color:${s.is_active?'#27ae60':'#e74c3c'}">${s.is_active?'Active':'Inactive'}</span></td>
        <td>${_sEsc(s.created_by||'-')}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,${s.id})">&#8230;</button>
            <div id="stu-dd-${s.id}" class="fin-action-dropdown" style="display:none;">
              ${canEdit ? `<a href="#" onclick="showStudentForm(${s.id});return false;">&#9998; Edit</a>` : ''}
              <a href="#" onclick="openStudentDetailView(${s.id});return false;">&#128065; View Detail</a>
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
          <th>STUDENT ID</th><th>STUDENT NAME</th><th>GENDER</th><th>COHORT</th>
          <th>CLASS</th><th>SESSION</th><th>STREAM</th><th>SPORTS HOUSE</th>
          <th>ACADEMIC STATUS</th><th>PERSONNEL</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  let pgBtns = '';
  for (let i = 1; i <= pages; i++) {
    pgBtns += `<button class="${i===_stuListPage?'fin-pg-active':''}" onclick="stuListGoPage(${i})">${i}</button>`;
  }
  const pgEl = document.getElementById('stu-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pgBtns}</div>`;
}

function toggleStuDd(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="stu-dd-"]').forEach(d => {
    if (d.id !== `stu-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`stu-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}
function changeStuPerPage(v)  { _stuListPerPage = parseInt(v); _stuListPage = 1; _renderStuTable(); }
function onStuSearch(v)       { _stuListSearch = v.trim().toLowerCase(); _stuListPage = 1; _renderStuTable(); }
function stuListGoPage(p)     { _stuListPage = p; _renderStuTable(); }

function showStuFilterPanel()    { const o = document.getElementById('stu-filter-overlay'); if (o) o.style.display = 'block'; }
function closeStuFilterPanel(e)  { if (e && e.target !== document.getElementById('stu-filter-overlay')) return; const o = document.getElementById('stu-filter-overlay'); if (o) o.style.display = 'none'; }

function applyStuFilters() {
  const level       = (document.getElementById('sf-level')?.value||'').toLowerCase();
  const cls         = (document.getElementById('sf-class')?.value||'').toLowerCase();
  const gender      = (document.getElementById('sf-gender')?.value||'').toLowerCase();
  const nationality = (document.getElementById('sf-nationality')?.value||'').toLowerCase();
  filteredStudentsData = allStudentsData.filter(s => {
    if (level && (s.level||'').toLowerCase() !== level) return false;
    if (cls && !(s.class_name||'').toLowerCase().includes(cls)) return false;
    if (gender && (s.gender||'').toLowerCase() !== gender) return false;
    if (nationality && !(s.nationality||'').toLowerCase().includes(nationality)) return false;
    return true;
  });
  _stuListPage = 1;
  _renderStuTable();
  document.getElementById('stu-filter-overlay').style.display = 'none';
}

function clearStuFilters() {
  ['sf-level','sf-class','sf-gender','sf-nationality'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  filteredStudentsData = [...allStudentsData];
  _stuListPage = 1;
  _renderStuTable();
  document.getElementById('stu-filter-overlay').style.display = 'none';
}

function exportStudentsCSV() {
  const cols = ['Student ID','Full Name','Gender','Cohort','Class','Session','Stream','Sports House','Status','Personnel'];
  const rows = filteredStudentsData.map(s => [
    s.student_id||'', `${s.first_name||''} ${s.last_name||''}`,
    s.gender||'', s.cohort||'', s.class_name||'', s.session||'',
    s.stream||'', s.sports_house||'', s.is_active?'Active':'Inactive', s.created_by||''
  ]);
  exportTableCSV(cols, rows, 'students.csv');
}

// ==================== 2. STUDENT EDIT / ADD FORM ====================
// Tabs: Personal Data | Academic Background | Guardian/Family | Disability/Medical | Disciplinary | Documents | Application Documents

let _stuEditData = null;
let _stuEditActiveTab = 'personal';
const _STU_EDIT_TABS = [
  { id:'personal',     label:'Personal Data' },
  { id:'academic',     label:'Academic Background' },
  { id:'guardian',     label:'Guardian/Family' },
  { id:'medical',      label:'Disability/Medical' },
  { id:'disciplinary', label:'Disciplinary' },
  { id:'documents',    label:'Documents' },
  { id:'app-docs',     label:'Application Documents' },
];

async function showStudentForm(studentId) {
  const modal = document.getElementById('stu-edit-modal');
  if (!modal) return;
  modal.style.display = 'block';
  modal.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;"><p style="color:white;font-size:1.1rem;">Loading&#8230;</p></div>`;

  let data = {};
  if (studentId) {
    try {
      const res = await fetch(`${API_BASE}/students/${studentId}/full-profile`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) data = await res.json();
    } catch(_) {}
  }
  _stuEditData   = data;
  _stuEditActiveTab = 'personal';
  _renderStudentFormModal(modal, studentId, data);
}

function _renderStudentFormModal(modal, studentId, data) {
  const isEdit = !!studentId;
  const tabBar = _STU_EDIT_TABS.map(t =>
    `<button class="stu-tab-btn${_stuEditActiveTab===t.id?' stu-tab-btn--active':''}"
       onclick="switchStuEditTab('${t.id}')">${t.label}</button>`
  ).join('');

  modal.innerHTML = `
    <div class="stu-edit-shell">
      <div class="fin-header-row" style="padding:20px 28px 0;margin:0;">
        <h2 class="fin-title">${isEdit?'Edit':'Add'} Student</h2>
        <div style="display:flex;align-items:center;gap:16px;">
          <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student &rsaquo; ${isEdit?'Edit':'Add'}</div>
          <button class="fin-action-btn" onclick="closeStuEditModal()" style="font-size:1.2rem;padding:4px 10px;">&#x2715;</button>
        </div>
      </div>
      <div class="stu-tab-bar" id="stu-edit-tab-bar">${tabBar}</div>
      <div class="stu-edit-body" id="stu-edit-tab-content"></div>
      <div class="stu-edit-footer">
        <button class="fin-btn-teal" onclick="submitStudentForm(${studentId||'null'})">${isEdit?'Update':'Save'}</button>
        <button class="fin-btn-cancel" onclick="closeStuEditModal()">Cancel</button>
      </div>
    </div>
  `;
  _renderStuEditTabContent(_stuEditActiveTab);
}

function closeStuEditModal() {
  const m = document.getElementById('stu-edit-modal');
  if (m) m.style.display = 'none';
}

function switchStuEditTab(tabId) {
  _stuEditActiveTab = tabId;
  document.querySelectorAll('.stu-tab-btn').forEach(b => b.classList.toggle('stu-tab-btn--active', b.textContent === _STU_EDIT_TABS.find(t=>t.id===tabId)?.label));
  _renderStuEditTabContent(tabId);
}

function _renderStuEditTabContent(tabId) {
  const c = document.getElementById('stu-edit-tab-content');
  if (!c) return;
  switch(tabId) {
    case 'personal':     c.innerHTML = _stuTabPersonal();   break;
    case 'academic':     c.innerHTML = _stuTabAcademic();   break;
    case 'guardian':     c.innerHTML = _stuTabGuardian();   break;
    case 'medical':      c.innerHTML = _stuTabMedical();    break;
    case 'disciplinary': c.innerHTML = _stuTabDisciplinary(); break;
    case 'documents':    c.innerHTML = _stuTabDocuments();  break;
    case 'app-docs':     c.innerHTML = _stuTabAppDocs();    break;
    default: c.innerHTML = '<p style="padding:24px">Coming soon.</p>';
  }
  // wire age calc
  const dob = document.getElementById('se-dob');
  if (dob) {
    dob.addEventListener('change', () => {
      const ageEl = document.getElementById('se-age-display');
      if (ageEl) ageEl.textContent = calculateAge(dob.value);
    });
  }
  // wire sibling checkbox
  const sibChk = document.getElementById('se-has-sibling');
  if (sibChk) sibChk.addEventListener('change', toggleSiblingSection);
}

function _f(id) { return document.getElementById(id)?.value || ''; }
function _fcheck(id) { return !!document.getElementById(id)?.checked; }

function _stuTabPersonal() {
  const d = _stuEditData || {};
  return `
    <div class="stu-form-grid">
      <div class="stu-form-group">
        <label>Admission No.</label>
        <input id="se-admission" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.student_id||'')}" readonly>
      </div>
      <div class="stu-form-group">
        <label>Surname*</label>
        <input id="se-surname" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.last_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Other Name*</label>
        <input id="se-other-name" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.first_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Joining Date</label>
        <input id="se-joining-date" type="date" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.joining_date||'')}">
      </div>
      <div class="stu-form-group">
        <label>Gender*</label>
        <select id="se-gender" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>
          ${['Male','Female'].map(g=>`<option${d.gender===g?' selected':''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Birth Date*</label>
        <input id="se-dob" type="date" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.date_of_birth||'')}">
        <small id="se-age-display" style="color:#555;font-size:0.82rem;">${calculateAge(d.date_of_birth)}</small>
        <label style="margin-top:8px;font-size:0.85rem;">Birth Certificate (PDF)</label>
        <input type="file" id="se-birth-cert" accept=".pdf,.jpg,.png" style="margin-top:4px;">
      </div>
      <div class="stu-form-group">
        <label>Nationality*</label>
        <select id="se-nationality" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>
          ${['Kenya','Uganda','Tanzania','Rwanda','Ethiopia','Other'].map(n=>`<option${d.nationality===n?' selected':''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Birth Cert No.</label>
        <input id="se-birth-cert-no" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.birth_cert_no||'')}">
      </div>
      <div class="stu-form-group">
        <label>Tel/Mobile No</label>
        <div style="display:flex;gap:6px;">
          <select id="se-phone-code" class="fin-search-input" style="width:160px!important;padding:7px 8px!important;">
            ${[['Kenya (+254)','254'],['Uganda (+256)','256'],['Tanzania (+255)','255']].map(([l,v])=>`<option value="${v}"${(d.phone_code||'254')===v?' selected':''}>${l}</option>`).join('')}
          </select>
          <input id="se-phone" class="fin-search-input" style="flex:1!important;width:auto!important;" value="${_sEsc(d.phone||'')}">
        </div>
      </div>
      <div class="stu-form-group">
        <label>Religion</label>
        <select id="se-religion" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>
          ${['Christian','Muslim','Hindu','Other'].map(r=>`<option${d.religion===r?' selected':''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Physical Address</label>
        <input id="se-physical-address" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.physical_address||'')}">
      </div>
      <div class="stu-form-group">
        <label>Email Address</label>
        <input id="se-email" type="email" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.email||'')}">
      </div>
      <div class="stu-form-group">
        <label>Extra Curriculum</label>
        <select id="se-extra-curriculum" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Please Select</option>
          ${(typeof extraCurricularData !== 'undefined' ? extraCurricularData : []).map(e=>`<option value="${e.id}"${d.extra_curriculum_id===e.id?' selected':''}>${_sEsc(e.title)}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Funding Source</label>
        <select id="se-funding-source" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Please Select</option>
          ${fundingSourcesData.filter(f=>!f.is_inactive).map(f=>`<option value="${f.id}"${d.funding_source_id===f.id?' selected':''}>${_sEsc(f.title)}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Photo</label>
        <div style="display:flex;align-items:center;gap:16px;">
          <div id="se-photo-preview" style="width:80px;height:80px;border-radius:50%;background:#e0e0e0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#aaa;">
            ${d.photo_url ? `<img src="${_sEsc(d.photo_url)}" style="width:100%;height:100%;object-fit:cover;">` : '&#128100;'}
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
        <label>Parent Consents to Use of Student Photo?</label>
        <div style="display:flex;gap:16px;margin-top:6px;">
          <label><input type="checkbox" id="se-photo-consent"${d.photo_consent?' checked':''}> Yes</label>
        </div>
      </div>
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Notes</label>
        <textarea id="se-notes" style="width:100%;min-height:80px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:0.9rem;">${_sEsc(d.notes||'')}</textarea>
      </div>
    </div>
  `;
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

function _stuTabAcademic() {
  const d = _stuEditData || {};
  return `
    <div class="stu-form-grid">
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>KCPE</label>
        <div style="display:flex;gap:10px;">
          <input class="fin-search-input" style="flex:1!important;width:auto!important;" placeholder="Index No." id="se-kcpe-index" value="${_sEsc(d.kcpe_index||'')}">
          <input class="fin-search-input" style="flex:1!important;width:auto!important;" placeholder="Year" id="se-kcpe-year" value="${_sEsc(d.kcpe_year||'')}">
          <input class="fin-search-input" style="flex:1!important;width:auto!important;" placeholder="Grade" id="se-kcpe-grade" value="${_sEsc(d.kcpe_grade||'')}">
        </div>
      </div>
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>KCSE</label>
        <div style="display:flex;gap:10px;">
          <input class="fin-search-input" style="flex:1!important;width:auto!important;" placeholder="Index No." id="se-kcse-index" value="${_sEsc(d.kcse_index||'')}">
          <input class="fin-search-input" style="flex:1!important;width:auto!important;" placeholder="Year" id="se-kcse-year" value="${_sEsc(d.kcse_year||'')}">
          <input class="fin-search-input" style="flex:1!important;width:auto!important;" placeholder="Grade" id="se-kcse-grade" value="${_sEsc(d.kcse_grade||'')}">
        </div>
      </div>
      <div class="stu-form-group">
        <label>Class*</label>
        <select id="se-class" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Please Select</option>
          ${(typeof studentClassesData!=='undefined'?studentClassesData:[]).map(c=>`<option value="${c.id}"${d.class_id===c.id?' selected':''}>${_sEsc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Stream</label>
        <select id="se-stream" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Please Select</option>
          ${streamsData.filter(s=>!s.is_inactive).map(s=>`<option value="${s.id}"${d.stream_id===s.id?' selected':''}>${_sEsc(s.title)}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Cohort (Session)</label>
        <input id="se-cohort" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.cohort||'')}" readonly>
      </div>
      <div class="stu-form-group">
        <label>Programme</label>
        <input id="se-programme" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.programme||'')}" readonly>
      </div>
      <div class="stu-form-group">
        <label>Department</label>
        <input id="se-department" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.department||'')}" readonly>
      </div>
      <div class="stu-form-group">
        <label>Status*</label>
        <select id="se-status" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="true"${d.is_active!==false?' selected':''}>Active</option>
          <option value="false"${d.is_active===false?' selected':''}>Inactive</option>
        </select>
      </div>
      <div class="stu-form-group">
        <label>Sports House</label>
        <select id="se-sports-house" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Please Select</option>
          ${['Simba','Cheetah','Eagle','Falcon','Lion','Leopard'].map(h=>`<option${d.sports_house===h?' selected':''}>${h}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Transportation</label>
        <select id="se-transport" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;" onchange="toggleStuTransport(this.value)">
          <option value="">Please Select</option>
          <option value="yes"${d.uses_transport?' selected':''}>Yes</option>
          <option value="no"${!d.uses_transport?' selected':''}>No</option>
        </select>
      </div>
      <div id="se-transport-details" style="grid-column:span 2;display:${d.uses_transport?'grid':'none'};grid-template-columns:1fr 1fr;gap:16px;">
        <div class="stu-form-group">
          <label>Route</label>
          <input id="se-route" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.transport_route||'')}">
        </div>
        <div class="stu-form-group">
          <label>Direction</label>
          <select id="se-direction" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
            <option value="">Select</option>
            <option value="TWO_WAY"${d.direction==='TWO_WAY'?' selected':''}>Two-Way</option>
            <option value="ONE_WAY_MORNING"${d.direction==='ONE_WAY_MORNING'?' selected':''}>Morning Only</option>
            <option value="ONE_WAY_EVENING"${d.direction==='ONE_WAY_EVENING'?' selected':''}>Evening Only</option>
          </select>
        </div>
      </div>
    </div>
  `;
}
function toggleStuTransport(v) {
  const d = document.getElementById('se-transport-details');
  if (d) d.style.display = v === 'yes' ? 'grid' : 'none';
}

function _stuTabGuardian() {
  const d = _stuEditData || {};
  const p1 = (d.parents||[])[0] || {};
  const p2 = (d.parents||[])[1] || {};
  const siblings = d.siblings || [];
  const sibRows = siblings.map((s,i) => `
    <div class="stu-sibling-row" id="sib-row-${i}" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;">
      <input class="fin-search-input sib-name" style="flex:1!important;width:auto!important;" placeholder="Sibling Student Name" value="${_sEsc(s.full_name||'')}">
      <input class="fin-search-input sib-id" style="width:130px!important;" placeholder="Student ID" value="${_sEsc(s.student_id||'')}">
      <button class="fin-btn-cancel" style="padding:6px 10px!important;" onclick="removeSiblingRow(${i})">&#x2715;</button>
    </div>`).join('');
  return `
    <div class="stu-form-grid">
      <div class="stu-form-group" style="font-weight:600;grid-column:span 2;color:#2c3e50;border-bottom:1px solid #eee;padding-bottom:6px;">Primary Guardian</div>
      <div class="stu-form-group">
        <label>Full Name*</label>
        <input id="se-p1-name" class="fin-search-input" style="width:100%!important" value="${_sEsc(p1.full_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Relationship</label>
        <select id="se-p1-rel" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          ${['Mother','Father','Guardian','Other'].map(r=>`<option${p1.relationship===r?' selected':''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Email</label>
        <input id="se-p1-email" type="email" class="fin-search-input" style="width:100%!important" value="${_sEsc(p1.email||'')}">
      </div>
      <div class="stu-form-group">
        <label>Phone</label>
        <input id="se-p1-phone" class="fin-search-input" style="width:100%!important" value="${_sEsc(p1.phone||'')}">
      </div>
      <div class="stu-form-group" style="font-weight:600;grid-column:span 2;color:#2c3e50;border-bottom:1px solid #eee;padding-bottom:6px;margin-top:8px;">Secondary Guardian <small style="font-weight:400;color:#888;">(optional)</small></div>
      <div class="stu-form-group">
        <label>Full Name</label>
        <input id="se-p2-name" class="fin-search-input" style="width:100%!important" value="${_sEsc(p2.full_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Relationship</label>
        <select id="se-p2-rel" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          ${['Mother','Father','Guardian','Other'].map(r=>`<option${p2.relationship===r?' selected':''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Email</label>
        <input id="se-p2-email" type="email" class="fin-search-input" style="width:100%!important" value="${_sEsc(p2.email||'')}">
      </div>
      <div class="stu-form-group">
        <label>Phone</label>
        <input id="se-p2-phone" class="fin-search-input" style="width:100%!important" value="${_sEsc(p2.phone||'')}">
      </div>
      <div class="stu-form-group" style="grid-column:span 2;margin-top:8px;">
        <label><input type="checkbox" id="se-has-sibling"${siblings.length?' checked':''} onchange="toggleSiblingSection()"> Have Sibling Enrolled</label>
      </div>
      <div id="se-sibling-section" style="grid-column:span 2;display:${siblings.length?'block':'none'};">
        <div id="se-sibling-rows">${sibRows}</div>
        <button class="fin-btn-outline" onclick="addSiblingRow()" style="margin-top:6px;">+ Add Sibling</button>
      </div>
    </div>
  `;
}

function toggleSiblingSection() {
  const chk = document.getElementById('se-has-sibling');
  const sec = document.getElementById('se-sibling-section');
  if (sec) sec.style.display = chk?.checked ? 'block' : 'none';
  if (chk?.checked) {
    const rows = document.getElementById('se-sibling-rows');
    if (rows && rows.children.length === 0) addSiblingRow();
  }
}

let _sibIdx = 100;
function addSiblingRow() {
  const rows = document.getElementById('se-sibling-rows');
  if (!rows) return;
  const idx = _sibIdx++;
  const div = document.createElement('div');
  div.className = 'stu-sibling-row';
  div.id = `sib-row-${idx}`;
  div.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:8px;';
  div.innerHTML = `
    <input class="fin-search-input sib-name" style="flex:1!important;width:auto!important;" placeholder="Sibling Student Name"
           oninput="stuSiblingAutocomplete(this)">
    <input class="fin-search-input sib-id" style="width:130px!important;" placeholder="Student ID">
    <button class="fin-btn-cancel" style="padding:6px 10px!important;" onclick="this.parentElement.remove()">&#x2715;</button>
  `;
  rows.appendChild(div);
}

function removeSiblingRow(idx) {
  const r = document.getElementById(`sib-row-${idx}`);
  if (r) r.remove();
}

function stuSiblingAutocomplete(input) {
  const q = input.value.toLowerCase();
  const idInput = input.nextElementSibling;
  if (!idInput) return;
  const match = allStudentsData.find(s =>
    (`${s.first_name} ${s.last_name}`).toLowerCase().includes(q)
  );
  if (match) idInput.value = match.student_id;
}

function _stuTabMedical() {
  const d = (_stuEditData||{}).medical || {};
  return `
    <div class="stu-form-grid">
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Allergies</label>
        <textarea id="se-allergies" style="width:100%;min-height:70px;padding:8px;border:1px solid #ccc;border-radius:4px;">${_sEsc(d.allergies||'')}</textarea>
      </div>
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Chronic Symptoms</label>
        <textarea id="se-chronic" style="width:100%;min-height:70px;padding:8px;border:1px solid #ccc;border-radius:4px;">${_sEsc(d.chronic_symptoms||'')}</textarea>
      </div>
      <div class="stu-form-group">
        <label>Health Insurance</label>
        <input id="se-insurance" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.health_insurance||'')}">
      </div>
      <div class="stu-form-group">
        <label>Blood Group</label>
        <select id="se-blood-group" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>
          ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b=>`<option${d.blood_group===b?' selected':''}>${b}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Emergency Contact Name</label>
        <input id="se-emrg-name" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.emergency_contact_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Emergency Contact Phone</label>
        <input id="se-emrg-phone" class="fin-search-input" style="width:100%!important" value="${_sEsc(d.emergency_contact_phone||'')}">
      </div>
    </div>
  `;
}

function _stuTabDisciplinary() {
  return `<div style="padding:24px;color:#888;text-align:center;">
    <p style="font-weight:600;">Disciplinary Records</p>
    <p style="font-size:0.88rem;">No disciplinary records for this student.</p>
  </div>`;
}

function _stuTabDocuments() {
  const docs = (_stuEditData||{}).documents || [];
  const existing = docs.map(doc => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px;background:#f9f9f9;border-radius:4px;margin-bottom:6px;">
      <span style="flex:1;">${_sEsc(doc.name)}</span>
      <a href="${_sEsc(doc.url)}" target="_blank" class="fin-btn-outline" style="padding:4px 10px!important;font-size:0.82rem;">View</a>
    </div>`).join('') || '<p style="color:#888;font-size:0.88rem;">No documents uploaded.</p>';
  return `
    <div style="padding:4px;">
      <p style="font-weight:600;color:#2c3e50;margin-bottom:12px;">Existing Documents</p>
      ${existing}
      <p style="font-weight:600;color:#2c3e50;margin:16px 0 8px;">Upload New Documents</p>
      <div class="stu-form-group"><label>Passport Photo</label><input type="file" id="se-doc-photo" accept="image/*"></div>
      <div class="stu-form-group"><label>Previous School Report (PDF)</label><input type="file" id="se-doc-report" accept=".pdf"></div>
      <div class="stu-form-group"><label>Other Document</label><input type="file" id="se-doc-other"></div>
    </div>
  `;
}

function _stuTabAppDocs() {
  return `<div style="padding:24px;color:#888;text-align:center;">
    <p style="font-weight:600;">Application Documents</p>
    <p style="font-size:0.88rem;">No application documents on file.</p>
  </div>`;
}

async function submitStudentForm(studentId) {
  const surname    = _f('se-surname').trim();
  const otherName  = _f('se-other-name').trim();
  const gender     = _f('se-gender');
  const dob        = _f('se-dob');
  if (!surname)   { showToast('Surname is required.', 'error'); switchStuEditTab('personal'); return; }
  if (!otherName) { showToast('Other Name is required.', 'error'); switchStuEditTab('personal'); return; }
  if (!gender)    { showToast('Gender is required.', 'error'); switchStuEditTab('personal'); return; }
  if (!dob)       { showToast('Birth Date is required.', 'error'); switchStuEditTab('personal'); return; }

  const payload = {
    last_name:      surname,
    first_name:     otherName,
    gender,
    date_of_birth:  dob,
    joining_date:   _f('se-joining-date'),
    nationality:    _f('se-nationality'),
    phone:          _f('se-phone'),
    phone_code:     _f('se-phone-code'),
    religion:       _f('se-religion'),
    physical_address: _f('se-physical-address'),
    email:          _f('se-email'),
    notes:          _f('se-notes'),
    is_active:      _f('se-status') === 'true',
    sports_house:   _f('se-sports-house'),
    uses_transport: _f('se-transport') === 'yes',
    direction:      _f('se-direction'),
    medical: {
      allergies:              _f('se-allergies'),
      chronic_symptoms:       _f('se-chronic'),
      health_insurance:       _f('se-insurance'),
      blood_group:            _f('se-blood-group'),
      emergency_contact_name: _f('se-emrg-name'),
      emergency_contact_phone:_f('se-emrg-phone'),
    },
    parents: (() => {
      const p = [];
      const p1name = _f('se-p1-name').trim();
      if (p1name) p.push({ full_name:p1name, email:_f('se-p1-email'), phone:_f('se-p1-phone'), relationship:_f('se-p1-rel'), is_primary:true });
      const p2name = _f('se-p2-name').trim();
      if (p2name) p.push({ full_name:p2name, email:_f('se-p2-email'), phone:_f('se-p2-phone'), relationship:_f('se-p2-rel'), is_primary:false });
      return p;
    })(),
    siblings: (() => {
      const rows = document.querySelectorAll('.stu-sibling-row');
      return Array.from(rows).map(r => ({
        full_name:  r.querySelector('.sib-name')?.value || '',
        student_id: r.querySelector('.sib-id')?.value   || ''
      })).filter(s => s.full_name);
    })()
  };

  try {
    const url    = studentId ? `${API_BASE}/students/${studentId}` : `${API_BASE}/students/`;
    const method = studentId ? 'PUT' : 'POST';
    const res    = await fetch(url, {
      method,
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast(studentId ? 'Student updated!' : 'Student registered!', 'success');
      closeStuEditModal();
      refreshStudentsListing();
    } else {
      const err = await res.json();
      showToast('Error: ' + (err.detail || JSON.stringify(err)), 'error');
    }
  } catch(_) { showToast('Network error. Please try again.', 'error'); }
}

// ==================== 3. STUDENT DETAIL VIEW ====================

async function openStudentDetailView(studentId) {
  const modal = document.getElementById('stu-edit-modal');
  if (!modal) return;
  modal.style.display = 'block';
  modal.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;"><p style="color:white;font-size:1.1rem;">Loading&#8230;</p></div>`;

  let data = {};
  try {
    const res = await fetch(`${API_BASE}/students/${studentId}/full-profile`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) data = await res.json();
  } catch(_) {}

  const DETAIL_TABS = ['Personal Data','Academic Background','Guardian/Family','Disability/Medical','Disciplinary'];
  let activeDetailTab = 'Personal Data';

  const tabBar = DETAIL_TABS.map(t =>
    `<button class="stu-tab-btn${t===activeDetailTab?' stu-tab-btn--active':''}"
       onclick="switchDetailTab(this,'${t.replace(/'/g,'\\\'')}')">${t}</button>`
  ).join('');

  modal.innerHTML = `
    <div class="stu-edit-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 28px 0;">
        <div style="display:flex;align-items:center;gap:20px;">
          <div style="width:72px;height:72px;border-radius:50%;background:#2db3b3;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:2rem;color:white;">
            ${data.photo_url ? `<img src="${_sEsc(data.photo_url)}" style="width:100%;height:100%;object-fit:cover;">` : '&#128100;'}
          </div>
          <div>
            <h2 class="fin-title" style="margin:0;">${_sEsc((data.first_name||'')+' '+(data.last_name||''))}</h2>
            <div class="fin-breadcrumb" style="text-align:left;">Dashboard &rsaquo; Student Management &rsaquo; Student Detail</div>
          </div>
        </div>
        <button class="fin-action-btn" onclick="closeStuEditModal()" style="font-size:1.2rem;padding:4px 10px;">&#x2715;</button>
      </div>
      <div class="stu-tab-bar">${tabBar}</div>
      <div class="stu-edit-body" id="detail-tab-content">${_renderDetailTab('Personal Data', data)}</div>
    </div>
  `;
}

function switchDetailTab(btn, tabName) {
  document.querySelectorAll('.stu-tab-btn').forEach(b => b.classList.remove('stu-tab-btn--active'));
  btn.classList.add('stu-tab-btn--active');
  const c = document.getElementById('detail-tab-content');
  if (c) c.innerHTML = _renderDetailTab(tabName, _stuEditData);
  const res = document.querySelector('.stu-edit-shell');
  if(res) {
    fetch(`${API_BASE}/students/${_stuEditData?.id || ''}/full-profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && c) { _stuEditData = d; c.innerHTML = _renderDetailTab(tabName, d); } })
      .catch(() => {});
  }
}

function _renderDetailTab(tabName, data) {
  const d = data || {};
  if (tabName === 'Personal Data') return `
    <div class="stu-detail-grid">
      ${_dRow('Admission No.',   d.student_id)}
      ${_dRow('Department',      d.department)}
      ${_dRow('Birth Date',      d.date_of_birth)}
      ${_dRow('Assessment Number', d.assessment_number)}
      ${_dRow('Nationality',     d.nationality)}
      ${_dRow('Religion',        d.religion)}
      ${_dRow('County',          d.county)}
      ${_dRow('Sub County',      d.sub_county)}
      ${_dRow('Postal Address',  d.postal_address)}
      ${_dRow('Physical Address',d.physical_address)}
      ${_dRow('Student Type',    d.student_type)}
      ${_dRow('Student Source',  d.student_source)}
      ${_dRow('Session',         d.session)}
      ${_dRow('Phone',           d.phone)}
      ${_dRow('Mapped to Meal Program', d.meal_program ? 'Yes' : 'No')}
      ${_dRow('Transport',       d.uses_transport ? 'Yes' : 'No')}
      ${_dRow('Academic Status', d.is_active ? 'Active' : 'Inactive')}
      <div class="stu-detail-row" style="grid-column:span 2;margin-top:4px;">
        <span class="stu-detail-label">Fee Balance</span>
        <span class="stu-detail-value" style="color:#e74c3c;font-weight:600;">${d.fee_balance ?? '-'}</span>
        <a href="#" onclick="openFeeStatement(${d.id});return false;" class="fin-btn-teal" style="margin-left:12px;padding:5px 14px!important;font-size:0.82rem;">View Fee Statement</a>
      </div>
    </div>`;
  if (tabName === 'Academic Background') return `
    <div class="stu-detail-grid">
      ${_dRow('Class',    d.class_name)}
      ${_dRow('Stream',   d.stream)}
      ${_dRow('Cohort',   d.cohort)}
      ${_dRow('Programme',d.programme)}
      ${_dRow('Level',    d.level)}
      ${_dRow('Session',  d.session)}
    </div>`;
  if (tabName === 'Guardian/Family') return `
    <div>
      ${(d.parents||[]).map(p=>`
        <div style="border:1px solid #eee;border-radius:6px;padding:14px;margin-bottom:12px;">
          <div class="stu-detail-grid">
            ${_dRow('Name',         p.full_name)}
            ${_dRow('Relationship', p.relationship)}
            ${_dRow('Email',        p.email)}
            ${_dRow('Phone',        p.phone)}
          </div>
        </div>`).join('') || '<p style="color:#888;">No guardian records.</p>'}
      <h4 style="color:#2c3e50;margin-top:16px;">Siblings Enrolled</h4>
      ${(d.siblings||[]).map(s=>`<p>${_sEsc(s.full_name)} — ${_sEsc(s.student_id)}</p>`).join('') || '<p style="color:#888;">No siblings enrolled.</p>'}
    </div>`;
  if (tabName === 'Disability/Medical') return `
    <div class="stu-detail-grid">
      ${_dRow('Allergies',      d.medical?.allergies)}
      ${_dRow('Chronic Symptoms', d.medical?.chronic_symptoms)}
      ${_dRow('Health Insurance', d.medical?.health_insurance)}
      ${_dRow('Blood Group',    d.medical?.blood_group)}
    </div>`;
  if (tabName === 'Disciplinary') return `<div style="padding:24px;color:#888;text-align:center;"><p>No disciplinary records.</p></div>`;
  return '';
}
function _dRow(label, value) {
  return `<div class="stu-detail-row">
    <span class="stu-detail-label">${_sEsc(label)}</span>
    <span class="stu-detail-value">${_sEsc(value||'-')}</span>
  </div>`;
}

async function openFeeStatement(studentId) {
  try {
    const res = await fetch(`${API_BASE}/finance/statement/${studentId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      const w = window.open('', '_blank', 'width=700,height=500');
      w.document.write(`<pre style="font-family:sans-serif;padding:20px;">${JSON.stringify(data, null, 2)}</pre>`);
    } else { showToast('Could not load fee statement.', 'error'); }
  } catch(_) { showToast('Network error.', 'error'); }
}

// ==================== 4. STUDENT SEARCH (GRID VIEW) ====================

let _stuSearchData = [], _stuSearchFiltered = [], _stuSearchPage = 1, _stuSearchPerPage = 12, _stuSearchQ = '';

async function loadStudentSearchView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Search</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Search &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="ss-per-page" onchange="changeSsPerPage(this.value)">
            ${[12,24,48].map(n=>`<option value="${n}">${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="ss-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" id="ss-search" placeholder="&#128269; Search&#8230;" oninput="onSsSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="ss-grid-container"><p class="fin-loading">Loading&#8230;</p></div>
      <div id="ss-pagination"></div>
    </div>
    <div id="stu-edit-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.45);z-index:500;overflow-y:auto;"></div>
  `;
  try {
    const res = await fetch(`${API_BASE}/students/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { document.getElementById('ss-grid-container').innerHTML = '<p class="fin-error">Error loading students.</p>'; return; }
    _stuSearchData = await res.json();
    _stuSearchFiltered = [..._stuSearchData];
    _stuSearchPage = 1;
    _renderSsGrid();
  } catch(_) { document.getElementById('ss-grid-container').innerHTML = '<p class="fin-error">Failed to load.</p>'; }
}

function _renderSsGrid() {
  const totalEl = document.getElementById('ss-total-count');
  if (totalEl) totalEl.textContent = _stuSearchFiltered.length;
  const start = (_stuSearchPage - 1) * _stuSearchPerPage;
  const paged = _stuSearchFiltered.slice(start, start + _stuSearchPerPage);
  const pages = Math.max(1, Math.ceil(_stuSearchFiltered.length / _stuSearchPerPage));

  const cards = paged.map(s => `
    <div class="stu-card" onclick="openStudentDetailView(${s.id})">
      <div class="stu-card-avatar">&#128100;</div>
      <div class="stu-card-name">${_sEsc((s.first_name||'')+' '+(s.last_name||''))}</div>
      <div class="stu-card-sub" style="color:#888;font-size:0.8rem;margin-bottom:2px;">(${_sEsc(s.gender||'')})</div>
      <div class="stu-card-info">&#127963; ${_sEsc(s.student_id||'')}</div>
      <div class="stu-card-info">&#127979; ${_sEsc(s.class_name||'-')} (${_sEsc(s.cohort||'-')})</div>
      ${s.parent_phone ? `<div class="stu-card-info">&#128222; ${_sEsc(s.parent_phone)}</div>` : ''}
      ${s.parent_email ? `<div class="stu-card-info">&#9993; ${_sEsc(s.parent_email)}</div>` : ''}
      <a href="#" class="stu-card-fee" onclick="event.stopPropagation();openFeeStatement(${s.id});return false;">Fee Statement</a>
    </div>
  `).join('') || '<p class="fin-empty" style="padding:24px;">No students found.</p>';

  const gc = document.getElementById('ss-grid-container');
  if (gc) gc.innerHTML = `<div class="stu-cards-grid">${cards}</div>`;

  let pgBtns = '';
  for (let i = 1; i <= pages; i++) {
    pgBtns += `<button class="${i===_stuSearchPage?'fin-pg-active':''}" onclick="ssGoPage(${i})">${i}</button>`;
  }
  const pgEl = document.getElementById('ss-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pgBtns}</div>`;
}
function changeSsPerPage(v) { _stuSearchPerPage = parseInt(v); _stuSearchPage = 1; _renderSsGrid(); }
function onSsSearch(v) {
  _stuSearchQ = v.trim().toLowerCase();
  _stuSearchFiltered = _stuSearchQ
    ? _stuSearchData.filter(s => (`${s.first_name} ${s.last_name}`).toLowerCase().includes(_stuSearchQ) || (s.student_id||'').toLowerCase().includes(_stuSearchQ))
    : [..._stuSearchData];
  _stuSearchPage = 1;
  _renderSsGrid();
}
function ssGoPage(p) { _stuSearchPage = p; _renderSsGrid(); }

// ==================== 5. STUDENT REPORTING ====================

let _srData = [], _srFiltered = [], _srPage = 1, _srPerPage = 10, _srSearch = '';

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
            ${[10,25,50,100].map(n=>`<option value="${n}">${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="sr-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV">&#128202;</button>
          <button class="fin-btn-teal" onclick="showSingleReportView()">+ Add</button>
          <button class="fin-btn-outline" onclick="showBulkReportView()">Bulk Report</button>
          <input type="text" class="fin-search-input" id="sr-search" placeholder="&#128269; Search&#8230;" oninput="onSrSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="sr-table-container"><p class="fin-loading">Loading&#8230;</p></div>
      <div id="sr-pagination"></div>
    </div>
  `;
  _renderSrTable();
}

function _srGetFiltered() {
  if (!_srSearch) return studentReportingData;
  const q = _srSearch;
  return studentReportingData.filter(r =>
    (r.admission_no||'').toLowerCase().includes(q) ||
    (r.name||'').toLowerCase().includes(q)
  );
}

function _renderSrTable() {
  _srFiltered = _srGetFiltered();
  const totalEl = document.getElementById('sr-total-count');
  if (totalEl) totalEl.textContent = _srFiltered.length;

  const start = (_srPage - 1) * _srPerPage;
  const paged = _srFiltered.slice(start, start + _srPerPage);
  const pages = Math.max(1, Math.ceil(_srFiltered.length / _srPerPage));

  let rows = '';
  if (paged.length === 0) {
    rows = `<tr><td colspan="7" class="fin-empty">No reporting records found.</td></tr>`;
  } else {
    paged.forEach(r => {
      rows += `<tr>
        <td>${_sEsc(r.admission_no||'')}</td>
        <td>${_sEsc(r.name||'')}</td>
        <td>${_sEsc(r.session||'')}</td>
        <td>${_sEsc(r.class_name||'')}</td>
        <td>${_sEsc(r.programme||'')}</td>
        <td>${_sEsc(r.reported_at||'')}</td>
        <td>${_sEsc(r.reported_by||'')}</td>
      </tr>`;
    });
  }

  const tbl = document.getElementById('sr-table-container');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>ADMISSION NO.</th><th>NAME</th><th>SESSION</th><th>CLASS</th>
          <th>PROGRAMME</th><th>REPORTED AT</th><th>REPORTED BY</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  let pgBtns = '';
  for (let i = 1; i <= pages; i++) {
    pgBtns += `<button class="${i===_srPage?'fin-pg-active':''}" onclick="srGoPage(${i})">${i}</button>`;
  }
  const pgEl = document.getElementById('sr-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pgBtns}</div>`;
}
function changeSrPerPage(v) { _srPerPage = parseInt(v); _srPage = 1; _renderSrTable(); }
function onSrSearch(v)      { _srSearch = v.trim().toLowerCase(); _srPage = 1; _renderSrTable(); }
function srGoPage(p)        { _srPage = p; _renderSrTable(); }

// Single report – full page view
function showSingleReportView() {
  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Student Reporting</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Reporting &rsaquo; Add</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:480px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:18px;">
          <label style="font-weight:600;">Admission No.*</label>
          <div style="position:relative;">
            <input id="sr-add-admission" class="fin-search-input" style="width:100%!important;" placeholder="Type Admission No." oninput="srAdmissionSearch(this.value)">
            <div id="sr-admission-dropdown" class="fin-action-dropdown" style="display:none;max-height:180px;overflow-y:auto;"></div>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button class="fin-btn-teal" onclick="submitSingleReport()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadStudentReportingView(document.getElementById('main-content'))">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

let _srSelectedStudent = null;
function srAdmissionSearch(val) {
  const dd = document.getElementById('sr-admission-dropdown');
  if (!dd) return;
  if (!val.trim()) { dd.style.display = 'none'; return; }
  const q = val.toLowerCase();
  const matches = allStudentsData.filter(s =>
    (s.student_id||'').toLowerCase().includes(q) ||
    (`${s.first_name} ${s.last_name}`).toLowerCase().includes(q)
  ).slice(0, 8);
  if (!matches.length) {
    dd.innerHTML = '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
    dd.style.display = 'block';
    return;
  }
  dd.innerHTML = matches.map(s =>
    `<a href="#" onclick="selectSrStudent(${s.id},'${_sEsc(s.student_id)}','${_sEsc(s.first_name+' '+s.last_name)}');return false;">
       ${_sEsc(s.student_id)} — ${_sEsc(s.first_name+' '+s.last_name)}
     </a>`
  ).join('');
  dd.style.display = 'block';
}
function selectSrStudent(id, admNo, name) {
  _srSelectedStudent = { id, admNo, name };
  const inp = document.getElementById('sr-add-admission');
  if (inp) inp.value = `${admNo} — ${name}`;
  const dd = document.getElementById('sr-admission-dropdown');
  if (dd) dd.style.display = 'none';
}

function submitSingleReport() {
  if (!_srSelectedStudent) { showToast('Please select a student.', 'error'); return; }
  const now = new Date().toISOString();
  const entry = {
    admission_no: _srSelectedStudent.admNo,
    name:         _srSelectedStudent.name,
    session:      '-',
    class_name:   '-',
    programme:    '-',
    reported_at:  now.replace('T',' ').slice(0,19),
    reported_by:  currentUser?.email || 'System'
  };
  studentReportingData.unshift(entry);
  showToast('Report submitted!', 'success');
  loadStudentReportingView(document.getElementById('main-content'));
}

// Bulk report – full page view
async function showBulkReportView() {
  const main = document.getElementById('main-content');
  if (!main) return;
  let classOptions = '<option value="">Please Select</option>';
  try {
    const res = await fetch(`${API_BASE}/classes/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const classes = await res.json();
      classOptions += classes.map(c => `<option value="${c.id}">${_sEsc(c.name)}</option>`).join('');
    }
  } catch(_) {}

  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Bulk Student Reporting</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Reporting &rsaquo; Add Bulk Report</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="max-width:320px;margin-bottom:20px;">
          <label style="font-weight:600;">Active Classes*</label>
          <select id="br-class-select" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                  onchange="loadBulkClassStudents(this.value)">
            ${classOptions}
          </select>
        </div>
        <p style="font-weight:600;color:#2c3e50;margin-bottom:10px;">List of Students</p>
        <div class="fin-table-wrap">
          <table class="fin-table" id="br-student-table">
            <thead><tr>
              <th><input type="checkbox" id="br-select-all" onchange="toggleBrSelectAll(this)"></th>
              <th>ADMISSION NO.</th><th>NAME</th><th>STUDENT TYPE</th>
            </tr></thead>
            <tbody id="br-student-tbody">
              <tr><td colspan="4" class="fin-empty">Select a class to load students.</td></tr>
            </tbody>
          </table>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="fin-btn-teal" onclick="submitBulkReport()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadStudentReportingView(document.getElementById('main-content'))">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function loadBulkClassStudents(classId) {
  if (!classId) return;
  const tbody = document.getElementById('br-student-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="fin-loading">Loading&#8230;</td></tr>';
  try {
    const res = await fetch(`${API_BASE}/students/?class_id=${classId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { tbody.innerHTML = '<tr><td colspan="4" class="fin-error">Error loading students.</td></tr>'; return; }
    const students = await res.json();
    if (!students.length) { tbody.innerHTML = '<tr><td colspan="4" class="fin-empty">No students in this class.</td></tr>'; return; }
    tbody.innerHTML = students.map(s => `
      <tr>
        <td><input type="checkbox" class="br-check" value="${s.id}" data-admno="${_sEsc(s.student_id)}" data-name="${_sEsc(s.first_name+' '+s.last_name)}" checked></td>
        <td>${_sEsc(s.student_id)}</td>
        <td>${_sEsc(s.first_name+' '+s.last_name)}</td>
        <td>${_sEsc(s.student_type||'Regular')}</td>
      </tr>`).join('');
  } catch(_) { tbody.innerHTML = '<tr><td colspan="4" class="fin-error">Failed to load.</td></tr>'; }
}

function toggleBrSelectAll(master) {
  document.querySelectorAll('.br-check').forEach(cb => cb.checked = master.checked);
}

function submitBulkReport() {
  const checked = document.querySelectorAll('.br-check:checked');
  if (!checked.length) { showToast('No students selected.', 'error'); return; }
  const now = new Date().toISOString().replace('T',' ').slice(0,19);
  checked.forEach(cb => {
    studentReportingData.unshift({
      admission_no: cb.dataset.admno,
      name:         cb.dataset.name,
      session:      '-', class_name: '-', programme: '-',
      reported_at:  now,
      reported_by:  currentUser?.email || 'System'
    });
  });
  showToast(`${checked.length} student(s) reported!`, 'success');
  loadStudentReportingView(document.getElementById('main-content'));
}

// ==================== 6. UTILITIES — STREAMS ====================

let _strPage = 1, _strPerPage = 10;

async function loadStreamsView(container) {
  openStuUtilitiesDropdown();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Stream</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Stream &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="str-list-per-page" onchange="changeStrPerPage(this.value)">
            ${[10,25,50].map(n=>`<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="str-list-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-teal" onclick="showStreamForm(null)">+ Add</button>
        </div>
      </div>
      <div id="str-list-table"><p class="fin-loading">Loading&#8230;</p></div>
      <div id="str-list-pagination"></div>
    </div>
    <div id="stream-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.4);z-index:500;display:none;"></div>
  `;
  _renderStreamsTable();
}

function _renderStreamsTable() {
  const totalEl = document.getElementById('str-list-total');
  if (totalEl) totalEl.textContent = streamsData.length;
  const start = (_strPage - 1) * _strPerPage;
  const paged = streamsData.slice(start, start + _strPerPage);
  const pages = Math.max(1, Math.ceil(streamsData.length / _strPerPage));

  let rows = paged.length ? paged.map(s => `
    <tr>
      <td style="width:80%">${_sEsc(s.title)}</td>
      <td><span style="color:${s.is_inactive?'#e74c3c':'#27ae60'}">${s.is_inactive?'Inactive':'Active'}</span></td>
      <td class="fin-action-cell">
        <div class="fin-action-wrap">
          <button class="fin-action-btn" onclick="toggleStuDd(event,'str-${s.id}')">&#8230;</button>
          <div id="stu-dd-str-${s.id}" class="fin-action-dropdown" style="display:none;">
            <a href="#" onclick="showStreamForm('${s.id}');return false;">&#9998; Edit</a>
            <a href="#" onclick="deleteStream('${s.id}');return false;">&#128465; Delete</a>
          </div>
        </div>
      </td>
    </tr>`).join('') : `<tr><td colspan="3" class="fin-empty">No streams found.</td></tr>`;

  const t = document.getElementById('str-list-table');
  if (t) t.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>TITLE</th><th>STATUS</th><th>ACTION</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  let pgBtns = '';
  for (let i = 1; i <= pages; i++) pgBtns += `<button class="${i===_strPage?'fin-pg-active':''}" onclick="strGoPage(${i})">${i}</button>`;
  const pgEl = document.getElementById('str-list-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pgBtns}</div>`;
}
function changeStrPerPage(v) { _strPerPage = parseInt(v); _strPage = 1; _renderStreamsTable(); }
function strGoPage(p)        { _strPage = p; _renderStreamsTable(); }

function showStreamForm(id) {
  const stream = id ? streamsData.find(s => s.id === id) : null;
  const isEdit = !!stream;
  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit?'Edit':'Add'} Stream</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Stream &rsaquo; ${isEdit?'Edit':'Add'}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:600px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Title*</label>
          <input id="stream-title" class="fin-search-input" style="width:100%!important;" value="${_sEsc(stream?.title||'')}">
        </div>
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Notes</label>
          <textarea id="stream-notes" style="width:100%;min-height:80px;padding:8px;border:1px solid #ccc;border-radius:4px;">${_sEsc(stream?.notes||'')}</textarea>
        </div>
        <div class="stu-form-group" style="margin-bottom:20px;">
          <label><input type="checkbox" id="stream-deactivate"${stream?.is_inactive?' checked':''}> Deactivate/Activate</label>
        </div>
        <div style="display:flex;gap:12px;">
          <button class="fin-btn-teal" onclick="saveStream('${id||''}')">${isEdit?'Update':'Save'}</button>
          <button class="fin-btn-cancel" onclick="loadStreamsView(document.getElementById('main-content'))">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function saveStream(id) {
  const title = document.getElementById('stream-title')?.value.trim();
  if (!title) { showToast('Title is required.', 'error'); return; }
  const item = {
    id:          id || ('str_' + Date.now()),
    title,
    notes:       document.getElementById('stream-notes')?.value || '',
    is_inactive: !!document.getElementById('stream-deactivate')?.checked
  };
  if (id) {
    const idx = streamsData.findIndex(s => s.id === id);
    if (idx !== -1) streamsData[idx] = item;
  } else {
    streamsData.push(item);
  }
  showToast(id ? 'Stream updated!' : 'Stream added!', 'success');
  loadStreamsView(document.getElementById('main-content'));
}

function deleteStream(id) {
  if (!confirm('Delete this stream?')) return;
  streamsData = streamsData.filter(s => s.id !== id);
  _renderStreamsTable();
  showToast('Stream deleted.', 'info');
}

// ==================== 7. UTILITIES — FUNDING SOURCES ====================

let _fsPage = 1, _fsPerPage = 10;

async function loadFundingSourcesView(container) {
  openStuUtilitiesDropdown();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Funding Source</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Funding Source &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="fs-list-per-page" onchange="changeFsPerPage(this.value)">
            ${[10,25,50].map(n=>`<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="fs-list-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-teal" onclick="showFundingSourceForm(null)">+ Add</button>
        </div>
      </div>
      <div id="fs-list-table"><p class="fin-loading">Loading&#8230;</p></div>
      <div id="fs-list-pagination"></div>
    </div>
  `;
  _renderFsTable();
}

function _renderFsTable() {
  const totalEl = document.getElementById('fs-list-total');
  if (totalEl) totalEl.textContent = fundingSourcesData.length;
  const start = (_fsPage - 1) * _fsPerPage;
  const paged = fundingSourcesData.slice(start, start + _fsPerPage);
  const pages = Math.max(1, Math.ceil(fundingSourcesData.length / _fsPerPage));

  let rows = paged.length ? paged.map(f => `
    <tr>
      <td style="width:80%">${_sEsc(f.title)}</td>
      <td><span style="color:${f.is_inactive?'#e74c3c':'#27ae60'}">${f.is_inactive?'Inactive':'Active'}</span></td>
      <td class="fin-action-cell">
        <div class="fin-action-wrap">
          <button class="fin-action-btn" onclick="toggleStuDd(event,'fs-${f.id}')">&#8230;</button>
          <div id="stu-dd-fs-${f.id}" class="fin-action-dropdown" style="display:none;">
            <a href="#" onclick="showFundingSourceForm('${f.id}');return false;">&#9998; Edit</a>
            <a href="#" onclick="deleteFundingSource('${f.id}');return false;">&#128465; Delete</a>
          </div>
        </div>
      </td>
    </tr>`).join('') : `<tr><td colspan="3" class="fin-empty">No funding sources found.</td></tr>`;

  const t = document.getElementById('fs-list-table');
  if (t) t.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>TITLE</th><th>STATUS</th><th>ACTION</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  let pgBtns = '';
  for (let i = 1; i <= pages; i++) pgBtns += `<button class="${i===_fsPage?'fin-pg-active':''}" onclick="fsGoPage(${i})">${i}</button>`;
  const pgEl = document.getElementById('fs-list-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pgBtns}</div>`;
}
function changeFsPerPage(v) { _fsPerPage = parseInt(v); _fsPage = 1; _renderFsTable(); }
function fsGoPage(p)        { _fsPage = p; _renderFsTable(); }

function showFundingSourceForm(id) {
  const item = id ? fundingSourcesData.find(f => f.id === id) : null;
  const isEdit = !!item;
  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit?'Edit':'Add'} Funding Source</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Funding Source &rsaquo; ${isEdit?'Edit':'Add'}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:600px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Title*</label>
          <input id="fs-title" class="fin-search-input" style="width:100%!important;" value="${_sEsc(item?.title||'')}">
        </div>
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Notes</label>
          <textarea id="fs-notes" style="width:100%;min-height:80px;padding:8px;border:1px solid #ccc;border-radius:4px;">${_sEsc(item?.notes||'')}</textarea>
        </div>
        <div class="stu-form-group" style="margin-bottom:20px;">
          <label><input type="checkbox" id="fs-deactivate"${item?.is_inactive?' checked':''}> Deactivate/Activate</label>
        </div>
        <div style="display:flex;gap:12px;">
          <button class="fin-btn-teal" onclick="saveFundingSource('${id||''}')">${isEdit?'Update':'Save'}</button>
          <button class="fin-btn-cancel" onclick="loadFundingSourcesView(document.getElementById('main-content'))">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function saveFundingSource(id) {
  const title = document.getElementById('fs-title')?.value.trim();
  if (!title) { showToast('Title is required.', 'error'); return; }
  const item = {
    id:          id || ('fs_' + Date.now()),
    title,
    notes:       document.getElementById('fs-notes')?.value || '',
    is_inactive: !!document.getElementById('fs-deactivate')?.checked
  };
  if (id) {
    const idx = fundingSourcesData.findIndex(f => f.id === id);
    if (idx !== -1) fundingSourcesData[idx] = item;
  } else {
    fundingSourcesData.push(item);
  }
  showToast(id ? 'Funding source updated!' : 'Funding source added!', 'success');
  loadFundingSourcesView(document.getElementById('main-content'));
}

function deleteFundingSource(id) {
  if (!confirm('Delete this funding source?')) return;
  fundingSourcesData = fundingSourcesData.filter(f => f.id !== id);
  _renderFsTable();
  showToast('Funding source deleted.', 'info');
}

// ==================== 8. STUDENT REPORT (already built – keep) ====================

let _stuRptPerPage = 10, _stuRptPage = 1, _stuRptSearch = '', _stuRptData = [];

async function loadStudentReportView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Report</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Report &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="str-per-page" onchange="changeStuRptPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="str-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV" onclick="exportStuReportCSV()">&#128202;</button>
          <input type="text" class="fin-search-input" id="str-search" placeholder="&#128269; Search&#8230;" oninput="onStuRptSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="str-table-container"><p class="fin-loading">Loading&#8230;</p></div>
      <div id="str-pagination"></div>
    </div>
  `;
  await _loadStuRptTable();
}

async function _loadStuRptTable() {
  const c = document.getElementById('str-table-container');
  if (!c) return;
  try {
    const res = await fetch(`${API_BASE}/students/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { c.innerHTML = '<p class="fin-error">Error loading student report.</p>'; return; }
    _stuRptData = await res.json();
    _stuRptPage = 1;
    _renderStuRptTable();
  } catch(_) { c.innerHTML = '<p class="fin-error">Failed to load student report.</p>'; }
}

function _stuRptFiltered() {
  if (!_stuRptSearch) return _stuRptData;
  const q = _stuRptSearch;
  return _stuRptData.filter(s =>
    (`${s.first_name} ${s.last_name}`).toLowerCase().includes(q) ||
    (s.student_id||'').toLowerCase().includes(q)
  );
}

function _renderStuRptTable() {
  const filtered = _stuRptFiltered();
  const totalEl  = document.getElementById('str-total-count');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_stuRptPage - 1) * _stuRptPerPage;
  const paged = filtered.slice(start, start + _stuRptPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _stuRptPerPage));
  let rows = paged.length ? paged.map(s => `<tr>
    <td>${_sEsc(s.student_id||'')}</td>
    <td>${_sEsc((s.first_name||'')+' '+(s.last_name||''))}</td>
    <td>${_sEsc(s.joining_date||'-')}</td>
    <td>${_sEsc(s.gender||'-')}</td>
    <td>${_sEsc(s.date_of_birth||'-')}</td>
    <td>${_sEsc(s.admission_date||s.joining_date||'-')}</td>
    <td><span style="color:${s.is_active?'#27ae60':'#e74c3c'}">${s.is_active?'Active':'Inactive'}</span></td>
  </tr>`).join('') : `<tr><td colspan="7" class="fin-empty">No records found.</td></tr>`;
  const tbl = document.getElementById('str-table-container');
  if (tbl) tbl.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>ADMISSION NO.</th><th>FULL NAME</th><th>JOINING DATE</th><th>GENDER</th><th>BIRTH DATE</th><th>ADMISSION DATE</th><th>STATUS</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  let pgBtns = '';
  for (let i = 1; i <= pages; i++) pgBtns += `<button class="${i===_stuRptPage?'fin-pg-active':''}" onclick="stuRptGoPage(${i})">${i}</button>`;
  const pgEl = document.getElementById('str-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pgBtns}</div>`;
}
function changeStuRptPerPage(v) { _stuRptPerPage = parseInt(v); _stuRptPage = 1; _renderStuRptTable(); }
function onStuRptSearch(v)      { _stuRptSearch = v.trim().toLowerCase(); _stuRptPage = 1; _renderStuRptTable(); }
function stuRptGoPage(p)        { _stuRptPage = p; _renderStuRptTable(); }
function exportStuReportCSV() {
  exportTableCSV(
    ['Admission No.','Full Name','Joining Date','Gender','Birth Date','Admission Date','Status'],
    _stuRptFiltered().map(s => [s.student_id||'', `${s.first_name||''} ${s.last_name||''}`, s.joining_date||'', s.gender||'', s.date_of_birth||'', s.admission_date||s.joining_date||'', s.is_active?'Active':'Inactive']),
    'student-report.csv'
  );
}

// ==================== 9. STUDENT GUARDIAN REPORT ====================

let _stuGuaPerPage = 10, _stuGuaPage = 1, _stuGuaSearch = '', _stuGuaData = [];

async function loadStudentGuardianReportView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Guardian Report</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Guardian Report &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="sgr-per-page" onchange="changeStuGuaPerPage(this.value)">
            ${[10,25,50,100].map(n=>`<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="sgr-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Browse file to update">&#128193; Browse file to update</button>
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV">&#128202;</button>
          <input type="text" class="fin-search-input" id="sgr-search" placeholder="&#128269; Search&#8230;" oninput="onStuGuaSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="sgr-table-container"><p class="fin-loading">Loading&#8230;</p></div>
      <div id="sgr-pagination"></div>
    </div>
  `;
  await _loadStuGuaTable();
}

async function _loadStuGuaTable() {
  const c = document.getElementById('sgr-table-container');
  if (!c) return;
  try {
    const res = await fetch(`${API_BASE}/students/guardians/`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { c.innerHTML = '<p class="fin-error">Error loading guardian report.</p>'; return; }
    _stuGuaData = await res.json();
    _stuGuaPage = 1;
    _renderStuGuaTable();
  } catch(_) { c.innerHTML = '<p class="fin-error">Failed to load guardian report.</p>'; }
}

function _stuGuaFiltered() {
  if (!_stuGuaSearch) return _stuGuaData;
  const q = _stuGuaSearch;
  return _stuGuaData.filter(g =>
    (g.admission_number||'').toLowerCase().includes(q) ||
    (g.contact_name||'').toLowerCase().includes(q) ||
    (g.email||'').toLowerCase().includes(q)
  );
}

function _renderStuGuaTable() {
  const filtered = _stuGuaFiltered();
  const totalEl  = document.getElementById('sgr-total-count');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_stuGuaPage - 1) * _stuGuaPerPage;
  const paged = filtered.slice(start, start + _stuGuaPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _stuGuaPerPage));
  let rows = paged.length ? paged.map(g => `<tr>
    <td>${_sEsc(g.admission_number||'')}</td>
    <td>${_sEsc(g.contact_name||'')}</td>
    <td>${_sEsc(g.sibling_admission_number||'')}</td>
    <td>${_sEsc(g.relationship||'')}</td>
    <td>${_sEsc(g.primary_phone||'')}</td>
    <td>${_sEsc(g.secondary_phone||'')}</td>
    <td>${_sEsc(g.email||'')}</td>
  </tr>`).join('') : `<tr><td colspan="7" class="fin-empty">No records found.</td></tr>`;
  const tbl = document.getElementById('sgr-table-container');
  if (tbl) tbl.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>ADMISSION NUMBER</th><th>CONTACT NAME</th><th>SIBLING ADMISSION NUMBER</th><th>RELATIONSHIP</th><th>PRIMARY PHONE NO.</th><th>SECONDARY PHONE NO.</th><th>EMAIL ADDRESS</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  let pgBtns = '';
  for (let i = 1; i <= pages; i++) pgBtns += `<button class="${i===_stuGuaPage?'fin-pg-active':''}" onclick="stuGuaGoPage(${i})">${i}</button>`;
  const pgEl = document.getElementById('sgr-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pgBtns}</div>`;
}
function changeStuGuaPerPage(v) { _stuGuaPerPage = parseInt(v); _stuGuaPage = 1; _renderStuGuaTable(); }
function onStuGuaSearch(v)      { _stuGuaSearch = v.trim().toLowerCase(); _stuGuaPage = 1; _renderStuGuaTable(); }
function stuGuaGoPage(p)        { _stuGuaPage = p; _renderStuGuaTable(); }
