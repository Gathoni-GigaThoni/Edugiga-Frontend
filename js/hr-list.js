// ==================== HUMAN RESOURCE MODULE ====================
let hrAddFormState = {};
let hrAddActiveTab = 'basic';
let hrEditRecord = null;
let hrEditActiveTab = 'basic';
let hrEditingEduIdx = -1;
let hrEditingIdocIdx = -1;
let hrEditingDepIdx = -1;
let hrEspFormState = {};


document.addEventListener('click', () => {
  document.querySelectorAll(
    '[id^="hr-dd-"],[id^="hr-edit-edu-dd-"],[id^="hr-edit-idoc-dd-"],[id^="hr-edit-dep-dd-"],[id^="hr-edit-sp-dd-"],[id^="hr-esp-bank-dd-"]'
  ).forEach(d => d.style.display = 'none');
});

function openHrDropdowns() {
  const hd = document.getElementById('hr-dropdown');
  const ud = document.getElementById('hr-utilities-dropdown');
  if (hd) hd.style.display = 'block';
  if (ud) ud.style.display = 'block';
}

async function loadHrEmployeeDirectoryView(container) {
  // hrEditEmployee/hr-esp-form.js/payroll.js all look employees up by id or
  // employee_code from this global cache — renderSplitView keeps its own
  // internal list, so without this the cache stays permanently empty and
  // "Edit" on any employee reports "Employee not found".
  const empRes = await apiFetch(`${API_BASE}/hr/employees`);
  const empList = (empRes && empRes.ok) ? _toArray(await empRes.json().catch(() => [])) : [];
  employeesData.splice(0, employeesData.length, ...empList);
  _employeesCacheLoaded = true;
  await ensureDepartmentCache();

  container.innerHTML = `
    <div class="fin-filter-section">
      <div class="fin-filter-grid">
        <div class="fin-filter-field">
          <label class="fin-filter-label">Department</label>
          <select id="hr-f-department-id" class="fin-filter-input"></select>
        </div>
        <div class="fin-filter-field">
          <label class="fin-filter-label">Exclude Directors</label>
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;">
            <input type="checkbox" id="hr-f-exclude-director" onchange="_hrDirReload()">
            <span>Hide Director profiles</span>
          </label>
        </div>
      </div>
      <div class="fin-filter-actions">
        <button class="fin-btn-teal" onclick="_hrDirReload()">Filter</button>
        <button class="btn" onclick="_hrOpenSendEmailModal()">Send Email</button>
      </div>
    </div>
    <div id="hr-dir-split"></div>
    <div id="hr-send-email-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)_hrCloseSendEmailModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Send Email</h3>
        <div class="hr-modal-body">
          <p style="font-size:13px;color:var(--grey-600);margin-top:0;">Sends to employees in the selected department filter, or all employees if no department is selected.</p>
          <div class="hr-modal-field"><label class="hr-form-label">Message</label><textarea id="hr-send-email-body" class="hr-modal-input" rows="6" placeholder="Type your message..."></textarea></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="_hrCloseSendEmailModal()">Cancel</button>
          <button class="hr-modal-btn-submit" onclick="_hrSendEmail()">Send</button>
        </div>
      </div>
    </div>
  `;
  loadDepartmentOptions('hr-f-department-id');
  await _hrDirReload();
}

async function _hrDirReload() {
  const deptId = document.getElementById('hr-f-department-id')?.value || '';
  const excludeDir = document.getElementById('hr-f-exclude-director')?.checked || false;
  const params = new URLSearchParams();
  if (deptId) params.set('department_id', deptId);
  if (excludeDir) params.set('exclude_director', 'true');

  await renderSplitView({
    container: document.getElementById('hr-dir-split'),
    moduleKey: 'human_resource.employee_directory',
    title: 'Employees',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Human Resource',view:'hr-employee-directory'},
      {label:'Employees'}
    ],
    apiUrl: `${API_BASE}/hr/employees${params.toString() ? '?' + params.toString() : ''}`,
    searchFields: ['first_name','last_name','email','employee_code','designation'],
    col1Label: 'Name', col2Label: 'Code / Role',
    col1: e => `${e.first_name||''} ${e.last_name||''}`.trim() || '—',
    col2: e => [e.employee_code, e.designation].filter(Boolean).join(' · ') || '—',
    rowLabel: e => `${e.first_name||''} ${e.last_name||''}`.trim() || '—',
    rowSub:   e => e.email || '',
    idKey: 'id',
    // The list endpoint doesn't filter Directors out, so a Manager still sees
    // the row and its list-level fields — only the single-record GET is
    // gated. Marking the row is the honest middle: nothing is hidden that the
    // backend still returns, but Edit not opening is no longer a surprise.
    detailFields: [
      {label:'Name',        key:'first_name', fmt:(_,e)=>`${e.first_name||''} ${e.last_name||''}`.trim()},
      {label:'Access',      key:'is_director', hideWhen:e=>!e.is_director || _isSuperAdmin(),
        fmt:()=>'<span style="color:var(--navy-700,#1B3057);font-weight:600;">Director profile — the full record is restricted to Directors and Super Admins.</span>',
        fullWidth:true},
      {label:'Emp Code',    key:'employee_code', fmt:v=>v||'—'},
      {label:'Email',       key:'email', fmt:v=>v||'—'},
      {label:'Phone',       key:'phone_number', fmt:(v,e)=>v?`${e.phone_country_code||''} ${v}`.trim():'—'},
      {label:'Designation', key:'designation', fmt:v=>v||'—'},
      {label:'Department',  key:'department_id', fmt:v=>departmentLabelFor(v)},
    ],
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#128100;</div>
        <p style="font-weight:600;margin-bottom:8px">Add a New Employee</p>
        <p style="font-size:13px;margin-bottom:20px">Register a new employee record.</p>
        <button class="btn-primary" style="padding:10px 24px" onclick="hrAddEmployee()">+ Add Employee</button>
      </div>`;
    },
    onAdd:  () => hrAddEmployee(),
    onEdit: item => hrEditEmployee(item.id !== undefined ? item.id : item.employee_code),
  });
}

function _hrOpenSendEmailModal() {
  const ov = document.getElementById('hr-send-email-overlay');
  if (ov) ov.style.display = 'flex';
}

function _hrCloseSendEmailModal() {
  const ov = document.getElementById('hr-send-email-overlay');
  if (ov) ov.style.display = 'none';
}

async function _hrSendEmail() {
  const message = (document.getElementById('hr-send-email-body')?.value || '').trim();
  if (!message) { showToast('Message is required.', 'error'); return; }
  const deptId = document.getElementById('hr-f-department-id')?.value || '';
  const res = await apiFetch(`${API_BASE}/hr/employees/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, department_id: deptId ? parseInt(deptId, 10) : null }),
  });
  if (res && res.ok) {
    showToast('Email sent.', 'success');
    _hrCloseSendEmailModal();
  } else if (res) {
    showToast(await parseApiError(res), 'error');
  }
}

function hrAddEmployee() {
  hrAddActiveTab = 'basic';
  hrAddFormState = {
    employeeCode: 'EMP-' + String(Date.now()).slice(-6),
    employment_terms: '', surname: '', other_names: '', department_id: '',
    email: '', phone_code: '+254', phone: '',
    birth_date: '', gender: '', joining_date: '',
    probation_period: '', confirmation_date: '', address: '',
    emergency_contact: null, nationality: '', national_id: '',
    is_director: false, photo: null, photoFile: null,
    disability_type: '', medical_info: '',
    education: [], kra_pin: '', nssf_number: '', shif_number: '',
    tax_profile: 'employee', consultant_wht_payment_type: '', is_non_resident: false, consultant_kra_pin: '',
    identity_docs: [], dependents: [], service_profile: []
  };
  renderHrAddPage(document.getElementById('main-content'));
}

// employeesData (from GET /hr/employees, the list endpoint) is EmployeeRead —
// it has the flat emergency_contact_* fields but no medical/identity/education/
// dependents data, that only comes back on the single-record GET (EmployeeReadFull).
// So opening Edit re-fetches by id and maps the backend's field names onto the
// internal shape the rest of hr-edit.js already reads/writes (phone_code/phone,
// probation_period, national_id, nested emergency_contact, flat medical/identity fields).
function _hrMapEditRecord(full, listRecord) {
  const r = Object.assign({}, listRecord, full);
  r.phone_code       = full.phone_country_code || '';
  r.phone            = full.phone_number || '';
  r.probation_period = full.probation_days ?? '';
  r.national_id      = full.national_id_no || '';
  r.emergency_contact = full.emergency_contact_name ? {
    name:         full.emergency_contact_name,
    phone_code:   full.emergency_contact_country_code || '',
    phone:        full.emergency_contact_number || '',
    relationship: full.emergency_contact_relationship || '',
  } : null;
  r.disability_type = full.medical?.disability_type || '';
  r.medical_info     = full.medical?.medical_info || '';
  r.kra_pin          = full.identity?.kra_pin || '';
  r.nssf_number      = full.identity?.nssf_number || '';
  r.shif_number      = full.identity?.shif_number || '';
  r.tax_profile                  = full.tax_profile || 'employee';
  r.consultant_wht_payment_type  = full.consultant_wht_payment_type || '';
  r.is_non_resident              = !!full.is_non_resident;
  r.consultant_kra_pin           = full.consultant_kra_pin || '';
  r.identity_docs    = full.identity?.documents || [];
  r.education        = full.education || [];
  r.dependents       = full.dependents || [];
  return r;
}

// Every HR endpoint that returns an Employee with is_director=True now calls
// _assert_director_visibility(): Super_Admin and Director see the profile,
// everybody else gets a 403 naming the rule. That is a governance decision,
// not an error the user can retry out of, so it renders as its own screen
// rather than as a red toast over a half-drawn edit form.
function _hrIsDirectorRestriction(status, msg) {
  return status === 403 && /director profile/i.test(String(msg || ''));
}

function _hrRenderRestricted(container, msg) {
  container.innerHTML = `
    <div class="fin-page">
      <div style="max-width:560px;margin:40px auto;background:var(--white,#fff);border-radius:8px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div style="padding:12px 16px;border-radius:6px;background:var(--navy-50,#EEF3FA);border-left:3px solid var(--navy-700,#1B3057);color:var(--navy-700,#1B3057);font-weight:700;font-size:1rem;">
          Access Restricted
        </div>
        <p style="font-size:0.9rem;color:#555;margin:16px 0 0;">
          Director profiles are visible only to Directors and Super Admins.
          Ask a Super Admin if you need access to this profile.
        </p>
        ${msg ? `<p style="font-size:0.8rem;color:#888;margin:12px 0 0;">${_finEsc(msg)}</p>` : ''}
        <div style="margin-top:22px;">
          <button class="btn-primary" style="padding:9px 20px;" onclick="loadView('hr-employee-directory')">Back to Employees</button>
        </div>
      </div>
    </div>`;
}

async function hrEditEmployee(empKey) {
  document.querySelectorAll('[id^="hr-dd-"]').forEach(d => d.style.display = 'none');
  const listRecord = employeesData.find(e =>
    String(e.id) === String(empKey) || String(e.employee_code) === String(empKey)
  );
  if (!listRecord) { showPlaceholder(document.getElementById('main-content'), 'Employee not found'); return; }
  const res = await apiFetch(`${API_BASE}/hr/employees/${listRecord.id}`);
  if (!res || !res.ok) {
    const msg = res ? await parseApiError(res) : '';
    if (res && _hrIsDirectorRestriction(res.status, msg)) {
      _hrRenderRestricted(document.getElementById('main-content'), msg);
      return;
    }
    showToast('Could not load employee details.', 'error');
    return;
  }
  const full = await res.json();
  hrEditRecord = _hrMapEditRecord(full, listRecord);
  hrEditActiveTab = 'basic';
  renderHrEditPage(document.getElementById('main-content'), hrEditRecord);
}

// ---- Add Employee page ----
const HR_ADD_TABS = [
  { id: 'basic',          label: 'Basic Information' },
  { id: 'medical',        label: 'Medical Information' },
  { id: 'education',      label: 'Education' },
  { id: 'identity',       label: 'Identity' },
  { id: 'dependents',     label: 'Dependents' },
  { id: 'service-profile',label: 'Employee Service Profile' }
];

function getHrTabLabel(tabId) {
  return (HR_ADD_TABS.find(t => t.id === tabId) || {}).label || tabId;
}

function buildHrTabBar(activeId, switchFn) {
  return HR_ADD_TABS.map(t =>
    `<button class="hr-tab-btn${activeId === t.id ? ' hr-tab-btn--active' : ''}"
      data-tab-id="${t.id}" onclick="${switchFn}('${t.id}')">${t.label}</button>`
  ).join('');
}

