// ==================== HUMAN RESOURCE MODULE ====================
let hrCurrentPage = 1;
let hrPerPage = 10;
let hrFiltered = [];
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

function loadHrEmployeeDirectoryView(container) {
  hrFiltered = [...employeesData];
  hrCurrentPage = 1;
  setActiveSidebarItem('sidebar-hr-employee-directory');
  const hrDropdown = document.getElementById('hr-dropdown');
  if (hrDropdown) hrDropdown.style.display = 'block';

  container.innerHTML = `
    <div class="hr-page">
      <div class="hr-header-row">
        <h2 class="hr-title">Employee</h2>
        <div class="hr-breadcrumb">Dashboard &rsaquo; Human Resource &rsaquo; Employee &rsaquo; Listing</div>
      </div>
      <div class="hr-controls-row">
        <div class="hr-controls-left">
          Show <select id="hr-per-page" onchange="changeHrPerPage(this.value)">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select> entries
          &nbsp;|&nbsp; Total <span id="hr-total-count">0</span> entries
        </div>
        <div class="hr-controls-right">
          <button class="hr-icon-btn" title="Browse file to update">Browse file to update</button>
          <button class="hr-icon-btn" title="Download">&darr;</button>
          <button class="hr-icon-btn" title="Browse file to upload">Browse file to upload</button>
          <button class="hr-icon-btn" title="Download">&darr;</button>
          <button class="hr-icon-btn" title="Export">&uarr;</button>
          <button class="hr-icon-btn" title="Export">&uarr;</button>
          <button class="hr-add-btn" onclick="hrAddEmployee()">+ Add</button>
          <input id="hr-search-input" placeholder="Search..." onkeyup="handleHrSearch()" class="hr-search">
          <button class="hr-filter-btn" onclick="showHrFilters()">Filters</button>
        </div>
      </div>
      <div class="hr-table-wrap">
        <div id="hr-table-container"></div>
      </div>
      <div id="hr-pagination"></div>
    </div>
    <div id="hr-filter-overlay" class="hr-filter-overlay" style="display:none;" onclick="closeHrFiltersOnOverlay(event)">
      <div class="hr-filter-panel">
        <div class="hr-filter-panel-header">
          <span class="hr-filter-panel-title">Filters</span>
          <button class="hr-filter-close-btn" onclick="closeHrFilters()">&#x2715;</button>
        </div>
        <div class="hr-filter-panel-body">
          <div class="hr-filter-group">
            <label class="hr-filter-label">Name</label>
            <input type="text" id="hr-f-name" class="hr-filter-input" placeholder="Name">
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Email</label>
            <input type="text" id="hr-f-email" class="hr-filter-input" placeholder="Email">
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Is Tutor?</label>
            <select id="hr-f-tutor" class="hr-filter-select">
              <option value="">Please Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Designation</label>
            <select id="hr-f-designation" class="hr-filter-select">
              <option value="">Please Select</option>
            </select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Department</label>
            <select id="hr-f-department" class="hr-filter-select">
              <option value="">Please Select</option>
            </select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Branch</label>
            <select id="hr-f-branch" class="hr-filter-select">
              <option value="">Please Select</option>
            </select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Employee Status</label>
            <select id="hr-f-status" class="hr-filter-select">
              <option value="">Please Select</option>
              <option value="active">Active</option>
            </select>
          </div>
        </div>
        <div class="hr-filter-panel-footer">
          <button class="hr-btn-submit" onclick="applyHrFilters()">Submit</button>
          <button class="hr-btn-send" onclick="showHrMessageModal()">Send Email</button>
          <div class="hr-clear-wrap">
            <a href="#" class="hr-clear-link" onclick="clearHrFilters(); return false;">Clear All Filters</a>
          </div>
        </div>
      </div>
    </div>
    <div id="hr-msg-overlay" class="hr-msg-overlay" style="display:none;">
      <div class="hr-msg-modal">
        <div class="hr-filter-group">
          <label class="hr-msg-label">Message</label>
          <textarea id="hr-msg-textarea" class="hr-msg-textarea" rows="6" placeholder="Type your message..."></textarea>
        </div>
        <div class="hr-msg-actions">
          <button class="hr-btn-send-msg" onclick="sendHrMessage()">Send</button>
          <button class="hr-btn-close-msg" onclick="closeHrMessageModal()">Close</button>
        </div>
      </div>
    </div>
  `;

  const sel = document.getElementById('hr-per-page');
  if (sel) sel.value = String(hrPerPage);
  renderHrTable();
}

function renderHrTable() {
  const totalEl = document.getElementById('hr-total-count');
  if (totalEl) totalEl.textContent = hrFiltered.length;

  const start = (hrCurrentPage - 1) * hrPerPage;
  const pageData = hrFiltered.slice(start, start + hrPerPage);

  let html = `<table class="hr-table"><thead><tr>
    <th>EMP. CODE</th><th>NAME</th><th>EMAIL</th><th>PHONE NUMBER</th>
    <th>DESIGNATION</th><th>DEPARTMENT</th><th>ACTION</th>
  </tr></thead><tbody>`;

  if (pageData.length === 0) {
    html += `<tr><td colspan="7" class="hr-empty">No records found</td></tr>`;
  } else {
    pageData.forEach(emp => {
      const empKey = emp.id !== undefined ? emp.id : emp.employee_code;
      const name = ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim();
      html += `<tr>
        <td>${emp.employee_code || emp.id || ''}</td>
        <td>${name}</td>
        <td>${emp.email || ''}</td>
        <td>${emp.phone || ''}</td>
        <td>${emp.designation || ''}</td>
        <td>${emp.department || ''}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrActionDropdown(event, '${empKey}')">&#8230;</button>
            <div id="hr-dd-${empKey}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="hrEditEmployee('${empKey}'); return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  html += `</tbody></table>`;
  document.getElementById('hr-table-container').innerHTML = html;

  const totalPages = Math.ceil(hrFiltered.length / hrPerPage);
  let pagHtml = '';
  if (totalPages > 1) {
    pagHtml = '<div class="hr-pagination">';
    pagHtml += `<button onclick="hrGoToPage(1)" ${hrCurrentPage === 1 ? 'disabled' : ''}>&laquo;</button>`;
    for (let i = 1; i <= totalPages; i++) {
      pagHtml += `<button onclick="hrGoToPage(${i})" ${i === hrCurrentPage ? 'class="hr-page-active"' : ''}>${i}</button>`;
    }
    pagHtml += `<button onclick="hrGoToPage(${totalPages})" ${hrCurrentPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;
    pagHtml += '</div>';
  }
  document.getElementById('hr-pagination').innerHTML = pagHtml;
}

function handleHrSearch() {
  const query = (document.getElementById('hr-search-input')?.value || '').toLowerCase();
  hrFiltered = employeesData.filter(emp => {
    const name = ((emp.first_name || '') + ' ' + (emp.last_name || '')).toLowerCase();
    return name.includes(query) ||
      (emp.email || '').toLowerCase().includes(query) ||
      String(emp.employee_code || emp.id || '').toLowerCase().includes(query);
  });
  hrCurrentPage = 1;
  renderHrTable();
}

function changeHrPerPage(val) {
  hrPerPage = parseInt(val);
  hrCurrentPage = 1;
  renderHrTable();
}

function hrGoToPage(page) {
  hrCurrentPage = page;
  renderHrTable();
}

function toggleHrActionDropdown(event, empKey) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-dd-"]').forEach(d => {
    if (d.id !== `hr-dd-${empKey}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-dd-${empKey}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function hrAddEmployee() {
  hrAddActiveTab = 'basic';
  hrAddFormState = {
    employeeCode: 'EMP-' + String(Date.now()).slice(-6),
    employment_terms: '', surname: '', other_names: '', alias: '',
    email: '', phone_code: '+254', phone: '',
    birth_date: '', gender: '', joining_date: '',
    probation_period: '', confirmation_date: '', address: '',
    emergency_contact: null, nationality: '', national_id: '',
    rank: '', is_director: false, photo: null,
    disability_type: '', medical_info: '',
    education: [], kra_pin: '', nssf_number: '', nhif_number: '', shif_number: '',
    identity_docs: [], dependents: [], service_profile: []
  };
  renderHrAddPage(document.getElementById('main-content'));
}

function hrEditEmployee(empKey) {
  document.querySelectorAll('[id^="hr-dd-"]').forEach(d => d.style.display = 'none');
  const record = employeesData.find(e =>
    String(e.id) === String(empKey) || String(e.employee_code) === String(empKey)
  );
  if (!record) { showPlaceholder(document.getElementById('main-content'), 'Employee not found'); return; }
  hrEditRecord = record;
  hrEditActiveTab = 'basic';
  renderHrEditPage(document.getElementById('main-content'), record);
}

function showHrFilters() {
  const overlay = document.getElementById('hr-filter-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeHrFilters() {
  const overlay = document.getElementById('hr-filter-overlay');
  if (overlay) overlay.style.display = 'none';
}

function closeHrFiltersOnOverlay(event) {
  if (event.target === document.getElementById('hr-filter-overlay')) closeHrFilters();
}

function applyHrFilters() {
  const name = (document.getElementById('hr-f-name')?.value || '').toLowerCase();
  const email = (document.getElementById('hr-f-email')?.value || '').toLowerCase();
  const status = document.getElementById('hr-f-status')?.value || '';

  hrFiltered = employeesData.filter(emp => {
    const empName = ((emp.first_name || '') + ' ' + (emp.last_name || '')).toLowerCase();
    if (name && !empName.includes(name)) return false;
    if (email && !(emp.email || '').toLowerCase().includes(email)) return false;
    if (status === 'active' && !emp.is_active) return false;
    return true;
  });
  hrCurrentPage = 1;
  closeHrFilters();
  renderHrTable();
}

function clearHrFilters() {
  ['hr-f-name', 'hr-f-email', 'hr-f-tutor', 'hr-f-designation', 'hr-f-department', 'hr-f-branch', 'hr-f-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  hrFiltered = [...employeesData];
  hrCurrentPage = 1;
  renderHrTable();
}

function showHrMessageModal() {
  const overlay = document.getElementById('hr-msg-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeHrMessageModal() {
  const overlay = document.getElementById('hr-msg-overlay');
  if (overlay) overlay.style.display = 'none';
}

function sendHrMessage() {
  closeHrMessageModal();
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

function renderHrAddPage(container) {
  container.innerHTML = `
    <div class="hr-page">
      <div class="hr-header-row">
        <h2 class="hr-title">Add Employee</h2>
        <div class="hr-breadcrumb">Dashboard &rsaquo; Human Resource &rsaquo; Employee &rsaquo; Add</div>
      </div>
      <div class="hr-form-tabs">${buildHrTabBar(hrAddActiveTab, 'switchHrAddTab')}</div>
      <div id="hr-add-tab-content"></div>
    </div>
    ${hrAddModalsHtml()}
  `;
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabContent(hrAddActiveTab);
}

function hrAddModalsHtml() {
  return `
    <div id="hr-ec-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrEmergencyContactModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Add Emergency Contact Detail</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field">
            <label class="hr-form-label">Emergency Contact Name <span class="hr-required">*</span></label>
            <input type="text" id="hr-ec-name" class="hr-modal-input" placeholder="Full Name">
          </div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Emergency Contact Number</label>
            <div class="hr-phone-row">
              <select id="hr-ec-phone-code" class="hr-phone-code-sel">
                <option value="+254">+254 (KE)</option><option value="+1">+1 (US)</option><option value="+44">+44 (UK)</option>
              </select>
              <input type="tel" id="hr-ec-phone" class="hr-modal-input" placeholder="Number">
            </div>
          </div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Relationship</label>
            <select id="hr-ec-relationship" class="hr-modal-select">
              <option value="">Please Select</option>
              <option value="Spouse">Spouse</option><option value="Parent">Parent</option>
              <option value="Sibling">Sibling</option><option value="Friend">Friend</option><option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrEmergencyContactModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEmergencyContact()">Select</button>
        </div>
      </div>
    </div>
    <div id="hr-edu-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddEducationModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Add Education</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Qualification</label><input type="text" id="hr-edu-qualification" class="hr-modal-input" placeholder="e.g. Bachelor of Science"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Institution</label><input type="text" id="hr-edu-institution" class="hr-modal-input" placeholder="e.g. University of Nairobi"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Academic Time</label><input type="text" id="hr-edu-time" class="hr-modal-input" placeholder="e.g. 2015 – 2019"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Awards / Grades</label><input type="text" id="hr-edu-grades" class="hr-modal-input" placeholder="e.g. First Class Honours"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Attachment</label><input type="file" id="hr-edu-attachment" class="hr-modal-input"></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddEducationModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEducationRecord()">Submit</button>
        </div>
      </div>
    </div>
    <div id="hr-idoc-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddIdentityModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Add Identity Document</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Document Title</label><input type="text" id="hr-idoc-title" class="hr-modal-input" placeholder="e.g. National ID"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Attachment</label><input type="file" id="hr-idoc-file" class="hr-modal-input"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Date Attached</label><input type="date" id="hr-idoc-date" class="hr-modal-input"></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddIdentityModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrIdentityDoc()">Submit</button>
        </div>
      </div>
    </div>
    <div id="hr-dep-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddDependentModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Add Dependent</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Dependent Name <span class="hr-required">*</span></label><input type="text" id="hr-dep-name" class="hr-modal-input" placeholder="Full Name"></div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Relationship <span class="hr-required">*</span></label>
            <select id="hr-dep-relationship" class="hr-modal-select">
              <option value="">Please Select</option><option value="Spouse">Spouse</option>
              <option value="Child">Child</option><option value="Parent">Parent</option><option value="Sibling">Sibling</option>
            </select>
          </div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Gender <span class="hr-required">*</span></label>
            <select id="hr-dep-gender" class="hr-modal-select">
              <option value="">Please Select</option><option value="Male">Male</option><option value="Female">Female</option>
            </select>
          </div>
          <div class="hr-modal-field"><label class="hr-form-label">Birth Date <span class="hr-required">*</span></label><input type="date" id="hr-dep-birth-date" class="hr-modal-input"></div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Insurance Type</label>
            <select id="hr-dep-insurance" class="hr-modal-select">
              <option value="">Please Select</option><option value="NHIF">NHIF</option>
              <option value="Private">Private</option><option value="None">None</option>
            </select>
          </div>
          <div class="hr-modal-field">
            <label class="hr-dep-enrolled-label">
              <input type="checkbox" id="hr-dep-enrolled" class="hr-dep-cb" onchange="toggleHrDependentEnrolled()"> Enrolled in this School?
            </label>
          </div>
          <div id="hr-dep-enrolled-section" class="hr-dep-enrolled-section" style="display:none;">
            <div class="hr-modal-field"><label class="hr-form-label">Student Name</label><input type="text" id="hr-dep-student-name" class="hr-modal-input" placeholder="Student Name"></div>
            <div class="hr-modal-field"><label class="hr-form-label">Student ID</label><input type="text" id="hr-dep-student-id" class="hr-modal-input" placeholder="Student ID"></div>
          </div>
          <div class="hr-modal-field"><label class="hr-form-label">Notes</label><textarea id="hr-dep-notes" class="hr-modal-textarea" rows="3" placeholder="Additional notes..."></textarea></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddDependentModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrDependent()">Submit</button>
        </div>
      </div>
    </div>
  `;
}

function switchHrAddTab(tabId) {
  saveHrAddCurrentTabState();
  hrAddActiveTab = tabId;
  document.querySelectorAll('.hr-form-tabs .hr-tab-btn').forEach(btn => {
    btn.classList.toggle('hr-tab-btn--active', btn.getAttribute('data-tab-id') === tabId);
  });
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabContent(tabId);
}

function saveHrAddCurrentTabState() {
  const get = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  const set = (key, id) => { const v = get(id); if (v !== undefined) hrAddFormState[key] = v; };
  set('employment_terms', 'hr-add-employment-terms');
  set('surname',          'hr-add-surname');
  set('other_names',      'hr-add-other-names');
  set('alias',            'hr-add-alias');
  set('email',            'hr-add-email');
  set('phone_code',       'hr-add-phone-code');
  set('phone',            'hr-add-phone');
  set('birth_date',       'hr-add-birth-date');
  set('gender',           'hr-add-gender');
  set('joining_date',     'hr-add-joining-date');
  set('probation_period', 'hr-add-probation');
  set('address',          'hr-add-address');
  set('nationality',      'hr-add-nationality');
  set('national_id',      'hr-add-national-id');
  set('rank',             'hr-add-rank');
  set('disability_type',  'hr-add-disability-type');
  set('medical_info',     'hr-add-medical-info');
  set('kra_pin',          'hr-add-kra-pin');
  set('nssf_number',      'hr-add-nssf');
  set('nhif_number',      'hr-add-nhif');
  set('shif_number',      'hr-add-shif');
  const dirCb = document.getElementById('hr-add-director');
  if (dirCb) hrAddFormState.is_director = dirCb.checked;
  const photoInput = document.getElementById('hr-add-photo');
  if (photoInput && photoInput.files[0]) hrAddFormState.photo = photoInput.files[0].name;
}

function renderHrAddTabContent(tabId) {
  switch (tabId) {
    case 'basic':          return renderHrAddTabBasic();
    case 'medical':        return renderHrAddTabMedical();
    case 'education':      return renderHrAddTabEducation();
    case 'identity':       return renderHrAddTabIdentity();
    case 'dependents':     return renderHrAddTabDependents();
    case 'service-profile':return renderHrAddTabServiceProfile();
    default: return '<p>Unknown tab.</p>';
  }
}

function renderHrAddTabBasic() {
  const s = hrAddFormState;
  const sel = (val, opt) => val === opt ? 'selected' : '';
  const ecInfo = s.emergency_contact
    ? `<span class="hr-ec-saved">Saved: ${s.emergency_contact.name}</span>` : '';
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">Employee Code <span class="hr-required">*</span></label>
          <input type="text" id="hr-add-emp-code" class="hr-form-input hr-form-readonly" value="${s.employeeCode}" readonly>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Employment Terms <span class="hr-required">*</span></label>
          <select id="hr-add-employment-terms" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Permanent" ${sel(s.employment_terms,'Permanent')}>Permanent</option>
            <option value="Contract" ${sel(s.employment_terms,'Contract')}>Contract</option>
            <option value="Casual" ${sel(s.employment_terms,'Casual')}>Casual</option>
            <option value="Intern" ${sel(s.employment_terms,'Intern')}>Intern</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Surname <span class="hr-required">*</span></label>
          <input type="text" id="hr-add-surname" class="hr-form-input" value="${s.surname}" placeholder="Surname">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Other Names <span class="hr-required">*</span></label>
          <input type="text" id="hr-add-other-names" class="hr-form-input" value="${s.other_names}" placeholder="Other Names">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Alias</label>
          <input type="text" id="hr-add-alias" class="hr-form-input" value="${s.alias}" placeholder="Alias">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Email <span class="hr-required">*</span></label>
          <input type="email" id="hr-add-email" class="hr-form-input" value="${s.email}" placeholder="Email">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Phone Number</label>
          <div class="hr-phone-row">
            <select id="hr-add-phone-code" class="hr-phone-code-sel">
              <option value="+254" ${sel(s.phone_code,'+254')}>+254 (KE)</option>
              <option value="+1"   ${sel(s.phone_code,'+1')}>+1 (US)</option>
              <option value="+44"  ${sel(s.phone_code,'+44')}>+44 (UK)</option>
              <option value="+91"  ${sel(s.phone_code,'+91')}>+91 (IN)</option>
            </select>
            <input type="tel" id="hr-add-phone" class="hr-form-input" value="${s.phone}" placeholder="Phone number">
          </div>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Birth Date <span class="hr-required">*</span></label>
          <input type="date" id="hr-add-birth-date" class="hr-form-input" value="${s.birth_date}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Gender <span class="hr-required">*</span></label>
          <select id="hr-add-gender" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Male"   ${sel(s.gender,'Male')}>Male</option>
            <option value="Female" ${sel(s.gender,'Female')}>Female</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Joining Date <span class="hr-required">*</span></label>
          <input type="date" id="hr-add-joining-date" class="hr-form-input" value="${s.joining_date}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Probation Period (days) <span class="hr-required">*</span></label>
          <input type="number" id="hr-add-probation" class="hr-form-input" value="${s.probation_period}" placeholder="e.g. 90" min="0">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Confirmation Date</label>
          <input type="text" id="hr-add-confirm-date" class="hr-form-input hr-form-readonly" value="${s.confirmation_date}" readonly placeholder="Auto-calculated">
        </div>
        <div class="hr-form-group hr-form-span2">
          <label class="hr-form-label">Address</label>
          <textarea id="hr-add-address" class="hr-form-textarea" rows="3" placeholder="Address">${s.address}</textarea>
        </div>
      </div>
      <div class="hr-form-ec-row">
        <button class="hr-form-section-btn" onclick="showHrEmergencyContactModal()">+ Add Emergency Contact Details</button>
        ${ecInfo}
      </div>
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">Nationality <span class="hr-required">*</span></label>
          <select id="hr-add-nationality" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Kenyan"     ${sel(s.nationality,'Kenyan')}>Kenyan</option>
            <option value="Ugandan"    ${sel(s.nationality,'Ugandan')}>Ugandan</option>
            <option value="Tanzanian"  ${sel(s.nationality,'Tanzanian')}>Tanzanian</option>
            <option value="British"    ${sel(s.nationality,'British')}>British</option>
            <option value="American"   ${sel(s.nationality,'American')}>American</option>
            <option value="Other"      ${sel(s.nationality,'Other')}>Other</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">National ID No</label>
          <input type="text" id="hr-add-national-id" class="hr-form-input" value="${s.national_id}" placeholder="National ID">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Rank</label>
          <select id="hr-add-rank" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Junior" ${sel(s.rank,'Junior')}>Junior</option>
            <option value="Mid"    ${sel(s.rank,'Mid')}>Mid</option>
            <option value="Senior" ${sel(s.rank,'Senior')}>Senior</option>
            <option value="Lead"   ${sel(s.rank,'Lead')}>Lead</option>
          </select>
        </div>
        <div class="hr-form-group"></div>
      </div>
      <div class="hr-form-checkboxes">
        <label class="hr-form-checkbox-label">
          <input type="checkbox" id="hr-add-director" class="hr-form-cb" ${s.is_director ? 'checked' : ''}> Director?
        </label>
      </div>
      <div class="hr-photo-section">
        <label class="hr-form-label">Photo</label>
        <div class="hr-photo-row">
          <label class="hr-photo-box" for="hr-add-photo">
            <span class="hr-photo-icon">&#8679;</span>
            <span class="hr-photo-text">Click to upload</span>
            <input type="file" id="hr-add-photo" accept="image/*" style="display:none;" onchange="handleHrPhotoPreview(this)">
          </label>
          <div class="hr-photo-avatar" id="hr-photo-preview">
            <span class="hr-avatar-placeholder">&#128100;</span>
          </div>
        </div>
      </div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="submitHrAddEmployee()">Submit</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrAddEmployee()">Cancel</button>
      </div>
    </div>
  `;
}

function renderHrAddTabMedical() {
  const s = hrAddFormState;
  const sel = (val, opt) => val === opt ? 'selected' : '';
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid-single">
        <div class="hr-form-group">
          <label class="hr-form-label">Disability Type <span class="hr-required">*</span></label>
          <select id="hr-add-disability-type" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="None"     ${sel(s.disability_type,'None')}>None</option>
            <option value="Physical" ${sel(s.disability_type,'Physical')}>Physical</option>
            <option value="Visual"   ${sel(s.disability_type,'Visual')}>Visual</option>
            <option value="Hearing"  ${sel(s.disability_type,'Hearing')}>Hearing</option>
            <option value="Other"    ${sel(s.disability_type,'Other')}>Other</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Medical Info</label>
          <textarea id="hr-add-medical-info" class="hr-form-textarea" rows="5" placeholder="Medical information...">${s.medical_info}</textarea>
        </div>
      </div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="submitHrAddEmployee()">Submit</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrAddEmployee()">Cancel</button>
      </div>
    </div>
  `;
}

function renderHrAddTabEducation() {
  const s = hrAddFormState;
  const rows = s.education.length === 0
    ? `<tr><td colspan="6" class="hr-empty">No records found</td></tr>`
    : s.education.map((e, i) => `<tr>
        <td>${e.qualification}</td><td>${e.institution}</td><td>${e.academic_time}</td>
        <td>${e.awards_grades}</td><td>${e.attachment || '—'}</td>
        <td class="hr-action-cell"><button class="hr-action-btn" onclick="removeHrEducationRecord(${i})">&#10005;</button></td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="showHrAddEducationModal()">Add Education</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>QUALIFICATION</th><th>INSTITUTION</th><th>ACADEMIC TIME</th>
          <th>AWARDS/GRADES</th><th>ATTACHMENT</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

function renderHrAddTabIdentity() {
  const s = hrAddFormState;
  const rows = s.identity_docs.length === 0
    ? `<tr><td colspan="4" class="hr-empty">No records found</td></tr>`
    : s.identity_docs.map((d, i) => `<tr>
        <td>${d.doc_title}</td><td>${d.attachment || '—'}</td><td>${d.date_attached}</td>
        <td class="hr-action-cell"><button class="hr-action-btn" onclick="removeHrIdentityDoc(${i})">&#10005;</button></td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">KRA PIN</label>
          <input type="text" id="hr-add-kra-pin" class="hr-form-input" value="${s.kra_pin}" placeholder="KRA PIN">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">NSSF Number</label>
          <input type="text" id="hr-add-nssf" class="hr-form-input" value="${s.nssf_number}" placeholder="NSSF Number">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">NHIF Number</label>
          <input type="text" id="hr-add-nhif" class="hr-form-input" value="${s.nhif_number}" placeholder="NHIF Number">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">SHIF Number</label>
          <input type="text" id="hr-add-shif" class="hr-form-input" value="${s.shif_number}" placeholder="SHIF Number">
        </div>
      </div>
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="showHrAddIdentityModal()">Add Identity</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>DOCUMENT TITLE</th><th>ATTACHMENTS</th><th>DATE ATTACHED</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="submitHrAddEmployee()">Submit</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrAddEmployee()">Cancel</button>
      </div>
    </div>
  `;
}

function renderHrAddTabDependents() {
  const s = hrAddFormState;
  const rows = s.dependents.length === 0
    ? `<tr><td colspan="6" class="hr-empty">No records found</td></tr>`
    : s.dependents.map((d, i) => `<tr>
        <td>${d.name}</td><td>${d.insurance_type}</td><td>${d.relationship}</td>
        <td>${d.gender}</td><td>${d.birth_date}</td>
        <td class="hr-action-cell"><button class="hr-action-btn" onclick="removeHrDependent(${i})">&#10005;</button></td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="showHrAddDependentModal()">Add Dependents</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>DEPENDENT NAME</th><th>INSURANCE TYPE</th><th>RELATIONSHIP</th>
          <th>GENDER</th><th>BIRTH DATE</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

function renderHrAddTabServiceProfile() {
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="hrAddServiceProfileRecord()">Add Employee Service Profile</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>REASON/EVENT</th><th>PAY GRADE</th><th>RANK</th>
          <th>AMOUNT</th><th>EFFECTIVE DATE</th><th>END DATE</th><th>ACTION</th>
        </tr></thead><tbody>
          <tr><td colspan="7" class="hr-empty">No records found</td></tr>
        </tbody></table>
      </div>
    </div>
  `;
}

function hrAddServiceProfileRecord() {
  hrEspFormState = {
    context: 'add', sourceView: 'hr-add',
    editSourceIdx: -1, lockedEmpCode: '', lockedEmpName: '',
    bankAccounts: [], editingBankIdx: -1, existingRecord: null
  };
  renderHrEspFormPage(document.getElementById('main-content'));
}

// ---- Add Employee submission ----
function submitHrAddEmployee() {
  saveHrAddCurrentTabState();
  const s = hrAddFormState;
  if (!s.employment_terms)    { alert('Employment Terms is required.'); return; }
  if (!s.surname.trim())      { alert('Surname is required.'); return; }
  if (!s.other_names.trim())  { alert('Other Names is required.'); return; }
  if (!s.email.trim())        { alert('Email is required.'); return; }
  if (!s.birth_date)          { alert('Birth Date is required.'); return; }
  if (!s.gender)              { alert('Gender is required.'); return; }
  if (!s.joining_date)        { alert('Joining Date is required.'); return; }
  if (!s.probation_period)    { alert('Probation Period is required.'); return; }
  if (!s.nationality)         { alert('Nationality is required.'); return; }

  const emp = {
    id: Date.now(),
    employee_code: s.employeeCode,
    employment_terms: s.employment_terms,
    surname: s.surname,
    other_names: s.other_names,
    first_name: s.other_names,
    last_name: s.surname,
    alias: s.alias,
    email: s.email,
    phone_code: s.phone_code,
    phone: s.phone,
    birth_date: s.birth_date,
    gender: s.gender,
    joining_date: s.joining_date,
    probation_period: s.probation_period,
    confirmation_date: s.confirmation_date,
    address: s.address,
    emergency_contact: s.emergency_contact,
    nationality: s.nationality,
    national_id: s.national_id,
    rank: s.rank,
    is_director: s.is_director,
    photo: s.photo,
    is_active: true,
    designation: '',
    department: '',
    disability_type: s.disability_type,
    medical_info: s.medical_info,
    education: [...s.education],
    kra_pin: s.kra_pin,
    nssf_number: s.nssf_number,
    nhif_number: s.nhif_number,
    shif_number: s.shif_number,
    identity_docs: [...s.identity_docs],
    dependents: [...s.dependents],
    service_profile: []
  };
  employeesData.push(emp);
  loadHrEmployeeDirectoryView(document.getElementById('main-content'));
}

function cancelHrAddEmployee() {
  loadHrEmployeeDirectoryView(document.getElementById('main-content'));
}

// ---- Emergency Contact modal ----
function showHrEmergencyContactModal() {
  const ov = document.getElementById('hr-ec-overlay');
  if (ov) ov.style.display = 'flex';
}
function closeHrEmergencyContactModal() {
  const ov = document.getElementById('hr-ec-overlay');
  if (ov) ov.style.display = 'none';
}
function saveHrEmergencyContact() {
  const name = (document.getElementById('hr-ec-name')?.value || '').trim();
  if (!name) { alert('Emergency contact name is required.'); return; }
  hrAddFormState.emergency_contact = {
    name,
    phone_code: document.getElementById('hr-ec-phone-code')?.value || '',
    phone:      document.getElementById('hr-ec-phone')?.value || '',
    relationship: document.getElementById('hr-ec-relationship')?.value || ''
  };
  closeHrEmergencyContactModal();
  const saved = document.querySelector('.hr-ec-saved');
  const row   = document.querySelector('.hr-form-ec-row');
  if (saved) { saved.textContent = 'Saved: ' + name; }
  else if (row) { const sp = document.createElement('span'); sp.className = 'hr-ec-saved'; sp.textContent = 'Saved: ' + name; row.appendChild(sp); }
}

// ---- Education modal ----
function showHrAddEducationModal() {
  ['hr-edu-qualification','hr-edu-institution','hr-edu-time','hr-edu-grades'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const f = document.getElementById('hr-edu-attachment'); if (f) f.value = '';
  const ov = document.getElementById('hr-edu-overlay'); if (ov) ov.style.display = 'flex';
}
function closeHrAddEducationModal() {
  const ov = document.getElementById('hr-edu-overlay'); if (ov) ov.style.display = 'none';
}
function saveHrEducationRecord() {
  hrAddFormState.education.push({
    qualification: document.getElementById('hr-edu-qualification')?.value || '',
    institution:   document.getElementById('hr-edu-institution')?.value || '',
    academic_time: document.getElementById('hr-edu-time')?.value || '',
    awards_grades: document.getElementById('hr-edu-grades')?.value || '',
    attachment:    document.getElementById('hr-edu-attachment')?.files?.[0]?.name || ''
  });
  closeHrAddEducationModal();
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabEducation();
}
function removeHrEducationRecord(idx) {
  hrAddFormState.education.splice(idx, 1);
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabEducation();
}

// ---- Identity doc modal ----
function showHrAddIdentityModal() {
  ['hr-idoc-title','hr-idoc-date'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const f = document.getElementById('hr-idoc-file'); if (f) f.value = '';
  const ov = document.getElementById('hr-idoc-overlay'); if (ov) ov.style.display = 'flex';
}
function closeHrAddIdentityModal() {
  const ov = document.getElementById('hr-idoc-overlay'); if (ov) ov.style.display = 'none';
}
function saveHrIdentityDoc() {
  hrAddFormState.identity_docs.push({
    doc_title:     document.getElementById('hr-idoc-title')?.value || '',
    attachment:    document.getElementById('hr-idoc-file')?.files?.[0]?.name || '',
    date_attached: document.getElementById('hr-idoc-date')?.value || ''
  });
  closeHrAddIdentityModal();
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabIdentity();
}
function removeHrIdentityDoc(idx) {
  hrAddFormState.identity_docs.splice(idx, 1);
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabIdentity();
}

// ---- Dependent modal ----
function showHrAddDependentModal() {
  ['hr-dep-name','hr-dep-student-name','hr-dep-student-id','hr-dep-birth-date','hr-dep-notes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['hr-dep-relationship','hr-dep-gender','hr-dep-insurance'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const cb = document.getElementById('hr-dep-enrolled'); if (cb) cb.checked = false;
  const sec = document.getElementById('hr-dep-enrolled-section'); if (sec) sec.style.display = 'none';
  const ov = document.getElementById('hr-dep-overlay'); if (ov) ov.style.display = 'flex';
}
function closeHrAddDependentModal() {
  const ov = document.getElementById('hr-dep-overlay'); if (ov) ov.style.display = 'none';
}
function toggleHrDependentEnrolled() {
  const cb  = document.getElementById('hr-dep-enrolled');
  const sec = document.getElementById('hr-dep-enrolled-section');
  if (sec) sec.style.display = cb?.checked ? 'block' : 'none';
}
function saveHrDependent() {
  const name         = (document.getElementById('hr-dep-name')?.value || '').trim();
  const relationship = document.getElementById('hr-dep-relationship')?.value || '';
  const gender       = document.getElementById('hr-dep-gender')?.value || '';
  const birth_date   = document.getElementById('hr-dep-birth-date')?.value || '';
  if (!name)         { alert('Dependent name is required.'); return; }
  if (!relationship) { alert('Relationship is required.');  return; }
  if (!gender)       { alert('Gender is required.');        return; }
  if (!birth_date)   { alert('Birth Date is required.');    return; }
  const enrolled = document.getElementById('hr-dep-enrolled')?.checked || false;
  hrAddFormState.dependents.push({
    name, relationship, gender, birth_date,
    insurance_type:    document.getElementById('hr-dep-insurance')?.value || '',
    enrolled_in_school: enrolled,
    student_name:      enrolled ? (document.getElementById('hr-dep-student-name')?.value || '') : '',
    student_id:        enrolled ? (document.getElementById('hr-dep-student-id')?.value || '')   : '',
    notes:             document.getElementById('hr-dep-notes')?.value || ''
  });
  closeHrAddDependentModal();
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabDependents();
}
function removeHrDependent(idx) {
  hrAddFormState.dependents.splice(idx, 1);
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabDependents();
}

function handleHrPhotoPreview(input) {
  if (!input.files[0]) return;
  hrAddFormState.photo = input.files[0].name;
  const preview = document.getElementById('hr-photo-preview');
  if (preview) {
    const url = URL.createObjectURL(input.files[0]);
    const img = document.createElement('img');
    img.alt = 'Preview';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
    img.onload = () => URL.revokeObjectURL(url);
    img.src = url;
    preview.innerHTML = '';
    preview.appendChild(img);
  }
}

// ---- Edit Employee shell ----
function renderHrEditPage(container, record) {
  const name = ((record.surname || record.first_name || '') + ' ' + (record.other_names || record.last_name || '')).trim();
  container.innerHTML = `
    <div class="hr-page">
      <div class="hr-header-row">
        <h2 class="hr-title">Employee</h2>
        <div class="hr-breadcrumb" id="hr-edit-breadcrumb">
          Dashboard &rsaquo; Human Resource &rsaquo; Employee &rsaquo; ${getHrTabLabel(hrEditActiveTab)}
        </div>
      </div>
      <div class="hr-edit-info-strip">
        <div class="hr-edit-info-item">
          <span class="hr-edit-info-label">Employee Code:</span>
          <span class="hr-edit-info-value">${record.employee_code || record.id || '—'}</span>
        </div>
        <div class="hr-edit-info-item">
          <span class="hr-edit-info-label">Employee Name:</span>
          <span class="hr-edit-info-value" id="hr-edit-info-name">${name || '—'}</span>
        </div>
      </div>
      <div class="hr-form-tabs" id="hr-edit-tab-bar">
        ${buildHrTabBar(hrEditActiveTab, 'switchHrEditTab')}
      </div>
      <div id="hr-edit-tab-content">
        ${renderHrEditTabContent(hrEditActiveTab)}
      </div>
    </div>
    ${hrEditModalsHtml()}
  `;
}

function hrEditTabPlaceholder() {
  return `<div class="hr-tab-body"><h3 style="color:#777;margin-top:0;">Coming Soon</h3><p>This tab will be implemented in Prompt 3.</p></div>`;
}

// ==================== EDIT EMPLOYEE — FULL TAB IMPLEMENTATIONS ====================

// ---- Modals HTML for Edit context (same IDs as Add, different save handlers) ----
function hrEditModalsHtml() {
  return `
    <div id="hr-ec-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrEmergencyContactModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Emergency Contact Detail</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field">
            <label class="hr-form-label">Emergency Contact Name <span class="hr-required">*</span></label>
            <input type="text" id="hr-ec-name" class="hr-modal-input" placeholder="Full Name">
          </div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Emergency Contact Number</label>
            <div class="hr-phone-row">
              <select id="hr-ec-phone-code" class="hr-phone-code-sel">
                <option value="+254">+254 (KE)</option><option value="+1">+1 (US)</option><option value="+44">+44 (UK)</option>
              </select>
              <input type="tel" id="hr-ec-phone" class="hr-modal-input" placeholder="Number">
            </div>
          </div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Relationship</label>
            <select id="hr-ec-relationship" class="hr-modal-select">
              <option value="">Please Select</option>
              <option value="Spouse">Spouse</option><option value="Parent">Parent</option>
              <option value="Sibling">Sibling</option><option value="Friend">Friend</option><option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrEmergencyContactModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEditEmergencyContact()">Select</button>
        </div>
      </div>
    </div>
    <div id="hr-edu-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddEducationModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title" id="hr-edu-modal-title">Add Education</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Qualification</label><input type="text" id="hr-edu-qualification" class="hr-modal-input" placeholder="e.g. Bachelor of Science"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Institution</label><input type="text" id="hr-edu-institution" class="hr-modal-input" placeholder="e.g. University of Nairobi"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Academic Time</label><input type="text" id="hr-edu-time" class="hr-modal-input" placeholder="e.g. 2015 – 2019"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Awards / Grades</label><input type="text" id="hr-edu-grades" class="hr-modal-input" placeholder="e.g. First Class Honours"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Attachment</label><input type="file" id="hr-edu-attachment" class="hr-modal-input"></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddEducationModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEditEducation()">Submit</button>
        </div>
      </div>
    </div>
    <div id="hr-idoc-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddIdentityModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title" id="hr-idoc-modal-title">Add Identity Document</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Document Title</label><input type="text" id="hr-idoc-title" class="hr-modal-input" placeholder="e.g. National ID"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Attachment</label><input type="file" id="hr-idoc-file" class="hr-modal-input"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Date Attached</label><input type="date" id="hr-idoc-date" class="hr-modal-input"></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddIdentityModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEditIdentityDoc()">Submit</button>
        </div>
      </div>
    </div>
    <div id="hr-dep-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddDependentModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title" id="hr-dep-modal-title">Add Dependent</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Dependent Name <span class="hr-required">*</span></label><input type="text" id="hr-dep-name" class="hr-modal-input" placeholder="Full Name"></div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Relationship <span class="hr-required">*</span></label>
            <select id="hr-dep-relationship" class="hr-modal-select">
              <option value="">Please Select</option><option value="Spouse">Spouse</option>
              <option value="Child">Child</option><option value="Parent">Parent</option><option value="Sibling">Sibling</option>
            </select>
          </div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Gender <span class="hr-required">*</span></label>
            <select id="hr-dep-gender" class="hr-modal-select">
              <option value="">Please Select</option><option value="Male">Male</option><option value="Female">Female</option>
            </select>
          </div>
          <div class="hr-modal-field"><label class="hr-form-label">Birth Date <span class="hr-required">*</span></label><input type="date" id="hr-dep-birth-date" class="hr-modal-input"></div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Insurance Type</label>
            <select id="hr-dep-insurance" class="hr-modal-select">
              <option value="">Please Select</option><option value="NHIF">NHIF</option>
              <option value="Private">Private</option><option value="None">None</option>
            </select>
          </div>
          <div class="hr-modal-field">
            <label class="hr-dep-enrolled-label">
              <input type="checkbox" id="hr-dep-enrolled" class="hr-dep-cb" onchange="toggleHrDependentEnrolled()"> Enrolled in this School?
            </label>
          </div>
          <div id="hr-dep-enrolled-section" class="hr-dep-enrolled-section" style="display:none;">
            <div class="hr-modal-field"><label class="hr-form-label">Student Name</label><input type="text" id="hr-dep-student-name" class="hr-modal-input" placeholder="Student Name"></div>
            <div class="hr-modal-field"><label class="hr-form-label">Student ID</label><input type="text" id="hr-dep-student-id" class="hr-modal-input" placeholder="Student ID"></div>
          </div>
          <div class="hr-modal-field"><label class="hr-form-label">Notes</label><textarea id="hr-dep-notes" class="hr-modal-textarea" rows="3" placeholder="Additional notes..."></textarea></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddDependentModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEditDependent()">Submit</button>
        </div>
      </div>
    </div>
  `;
}

// ---- Tab content dispatcher ----
function renderHrEditTabContent(tabId) {
  switch (tabId) {
    case 'basic':           return renderHrEditTabBasic();
    case 'medical':         return renderHrEditTabMedical();
    case 'education':       return renderHrEditTabEducation();
    case 'identity':        return renderHrEditTabIdentity();
    case 'dependents':      return renderHrEditTabDependents();
    case 'service-profile': return renderHrEditTabServiceProfile();
    default: return '<p>Unknown tab.</p>';
  }
}

// ---- Shared helpers ----
function showHrEditSuccess(containerId, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => { if (el) el.style.display = 'none'; }, 2500);
}

function cancelHrEdit() {
  loadHrEmployeeDirectoryView(document.getElementById('main-content'));
}

function handleHrEditPhotoPreview(input) {
  if (!input.files[0]) return;
  hrEditRecord.photo = input.files[0].name;
  const preview = document.getElementById('hr-edit-photo-preview');
  if (preview) {
    const url = URL.createObjectURL(input.files[0]);
    const img = document.createElement('img');
    img.alt = 'Preview';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
    img.onload = () => URL.revokeObjectURL(url);
    img.src = url;
    preview.innerHTML = '';
    preview.appendChild(img);
  }
}

// ==================== EDIT TAB A — Basic Information ====================
function renderHrEditTabBasic() {
  const r = hrEditRecord;
  const sel = (val, opt) => val === opt ? 'selected' : '';
  const ecInfo = r.emergency_contact
    ? `<span class="hr-ec-saved">Saved: ${r.emergency_contact.name}</span>` : '';
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">Employee Code <span class="hr-required">*</span></label>
          <input type="text" class="hr-form-input hr-form-readonly" value="${r.employee_code || r.id || ''}" readonly>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Employment Terms <span class="hr-required">*</span></label>
          <select id="hr-edit-employment-terms" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Permanent" ${sel(r.employment_terms,'Permanent')}>Permanent</option>
            <option value="Contract"  ${sel(r.employment_terms,'Contract')}>Contract</option>
            <option value="Casual"    ${sel(r.employment_terms,'Casual')}>Casual</option>
            <option value="Intern"    ${sel(r.employment_terms,'Intern')}>Intern</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Surname <span class="hr-required">*</span></label>
          <input type="text" id="hr-edit-surname" class="hr-form-input" value="${r.surname || r.last_name || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Other Names <span class="hr-required">*</span></label>
          <input type="text" id="hr-edit-other-names" class="hr-form-input" value="${r.other_names || r.first_name || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Alias</label>
          <input type="text" id="hr-edit-alias" class="hr-form-input" value="${r.alias || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Email <span class="hr-required">*</span></label>
          <input type="email" id="hr-edit-email" class="hr-form-input" value="${r.email || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Phone Number</label>
          <div class="hr-phone-row">
            <select id="hr-edit-phone-code" class="hr-phone-code-sel">
              <option value="+254" ${sel(r.phone_code||'+254','+254')}>+254 (KE)</option>
              <option value="+1"   ${sel(r.phone_code,'+1')}>+1 (US)</option>
              <option value="+44"  ${sel(r.phone_code,'+44')}>+44 (UK)</option>
              <option value="+91"  ${sel(r.phone_code,'+91')}>+91 (IN)</option>
            </select>
            <input type="tel" id="hr-edit-phone" class="hr-form-input" value="${r.phone || ''}">
          </div>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Birth Date <span class="hr-required">*</span></label>
          <input type="date" id="hr-edit-birth-date" class="hr-form-input" value="${r.birth_date || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Gender <span class="hr-required">*</span></label>
          <select id="hr-edit-gender" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Male"   ${sel(r.gender,'Male')}>Male</option>
            <option value="Female" ${sel(r.gender,'Female')}>Female</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Joining Date <span class="hr-required">*</span></label>
          <input type="date" id="hr-edit-joining-date" class="hr-form-input" value="${r.joining_date || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Probation Period (days) <span class="hr-required">*</span></label>
          <input type="number" id="hr-edit-probation" class="hr-form-input" value="${r.probation_period || ''}" min="0">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Confirmation Date</label>
          <input type="text" class="hr-form-input hr-form-readonly" value="${r.confirmation_date || ''}" readonly placeholder="Auto-calculated">
        </div>
        <div class="hr-form-group hr-form-span2">
          <label class="hr-form-label">Address</label>
          <textarea id="hr-edit-address" class="hr-form-textarea" rows="3">${r.address || ''}</textarea>
        </div>
      </div>
      <div class="hr-form-ec-row">
        <button class="hr-form-section-btn" onclick="showHrEditEcModal()">+ Add Emergency Contact Details</button>
        ${ecInfo}
      </div>
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">Nationality <span class="hr-required">*</span></label>
          <select id="hr-edit-nationality" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Kenyan"    ${sel(r.nationality,'Kenyan')}>Kenyan</option>
            <option value="Ugandan"   ${sel(r.nationality,'Ugandan')}>Ugandan</option>
            <option value="Tanzanian" ${sel(r.nationality,'Tanzanian')}>Tanzanian</option>
            <option value="British"   ${sel(r.nationality,'British')}>British</option>
            <option value="American"  ${sel(r.nationality,'American')}>American</option>
            <option value="Other"     ${sel(r.nationality,'Other')}>Other</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">National ID No</label>
          <input type="text" id="hr-edit-national-id" class="hr-form-input" value="${r.national_id || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Rank</label>
          <select id="hr-edit-rank" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Junior" ${sel(r.rank,'Junior')}>Junior</option>
            <option value="Mid"    ${sel(r.rank,'Mid')}>Mid</option>
            <option value="Senior" ${sel(r.rank,'Senior')}>Senior</option>
            <option value="Lead"   ${sel(r.rank,'Lead')}>Lead</option>
          </select>
        </div>
        <div class="hr-form-group"></div>
      </div>
      <div class="hr-form-checkboxes">
        <label class="hr-form-checkbox-label">
          <input type="checkbox" id="hr-edit-director" class="hr-form-cb" ${r.is_director ? 'checked' : ''}> Director?
        </label>
      </div>
      <div class="hr-photo-section">
        <label class="hr-form-label">Photo</label>
        <div class="hr-photo-row">
          <label class="hr-photo-box" for="hr-edit-photo">
            <span class="hr-photo-icon">&#8679;</span>
            <span class="hr-photo-text">Click to upload</span>
            <input type="file" id="hr-edit-photo" accept="image/*" style="display:none;" onchange="handleHrEditPhotoPreview(this)">
          </label>
          <div class="hr-photo-avatar" id="hr-edit-photo-preview">
            <span class="hr-avatar-placeholder">&#128100;</span>
          </div>
        </div>
      </div>
      <div id="hr-edit-status-basic" class="hr-edit-success" style="display:none;"></div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="updateHrEditBasic()">Update</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrEdit()">Cancel</button>
      </div>
    </div>
  `;
}

function updateHrEditBasic() {
  const gv  = id => document.getElementById(id)?.value || '';
  const gvt = id => (document.getElementById(id)?.value || '').trim();
  const employment_terms = gv('hr-edit-employment-terms');
  const surname          = gvt('hr-edit-surname');
  const other_names      = gvt('hr-edit-other-names');
  const email            = gvt('hr-edit-email');
  const birth_date       = gv('hr-edit-birth-date');
  const gender           = gv('hr-edit-gender');
  const joining_date     = gv('hr-edit-joining-date');
  const probation_period = gv('hr-edit-probation');
  const nationality      = gv('hr-edit-nationality');

  if (!employment_terms) { alert('Employment Terms is required.'); return; }
  if (!surname)          { alert('Surname is required.'); return; }
  if (!other_names)      { alert('Other Names is required.'); return; }
  if (!email)            { alert('Email is required.'); return; }
  if (!birth_date)       { alert('Birth Date is required.'); return; }
  if (!gender)           { alert('Gender is required.'); return; }
  if (!joining_date)     { alert('Joining Date is required.'); return; }
  if (!probation_period) { alert('Probation Period is required.'); return; }
  if (!nationality)      { alert('Nationality is required.'); return; }

  hrEditRecord.employment_terms = employment_terms;
  hrEditRecord.surname          = surname;
  hrEditRecord.last_name        = surname;
  hrEditRecord.other_names      = other_names;
  hrEditRecord.first_name       = other_names;
  hrEditRecord.alias            = gvt('hr-edit-alias');
  hrEditRecord.email            = email;
  hrEditRecord.phone_code       = gv('hr-edit-phone-code');
  hrEditRecord.phone            = gv('hr-edit-phone');
  hrEditRecord.birth_date       = birth_date;
  hrEditRecord.gender           = gender;
  hrEditRecord.joining_date     = joining_date;
  hrEditRecord.probation_period = probation_period;
  hrEditRecord.address          = gv('hr-edit-address');
  hrEditRecord.nationality      = nationality;
  hrEditRecord.national_id      = gvt('hr-edit-national-id');
  hrEditRecord.rank             = gv('hr-edit-rank');
  hrEditRecord.is_director      = document.getElementById('hr-edit-director')?.checked || false;

  const nameEl = document.getElementById('hr-edit-info-name');
  if (nameEl) nameEl.textContent = (other_names + ' ' + surname).trim();
  showHrEditSuccess('hr-edit-status-basic', 'Basic information updated successfully.');
}

// ---- Emergency contact (Edit context) ----
function showHrEditEcModal() {
  const ec = hrEditRecord.emergency_contact;
  if (ec) {
    const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setv('hr-ec-name', ec.name);
    setv('hr-ec-phone-code', ec.phone_code || '+254');
    setv('hr-ec-phone', ec.phone);
    setv('hr-ec-relationship', ec.relationship);
  } else {
    ['hr-ec-name','hr-ec-phone','hr-ec-relationship'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  }
  const ov = document.getElementById('hr-ec-overlay');
  if (ov) ov.style.display = 'flex';
}

function saveHrEditEmergencyContact() {
  const name = (document.getElementById('hr-ec-name')?.value || '').trim();
  if (!name) { alert('Emergency contact name is required.'); return; }
  hrEditRecord.emergency_contact = {
    name,
    phone_code:   document.getElementById('hr-ec-phone-code')?.value || '',
    phone:        document.getElementById('hr-ec-phone')?.value || '',
    relationship: document.getElementById('hr-ec-relationship')?.value || ''
  };
  closeHrEmergencyContactModal();
  const saved = document.querySelector('.hr-ec-saved');
  const row   = document.querySelector('.hr-form-ec-row');
  if (saved) { saved.textContent = 'Saved: ' + name; }
  else if (row) { const sp = document.createElement('span'); sp.className = 'hr-ec-saved'; sp.textContent = 'Saved: ' + name; row.appendChild(sp); }
}

// ==================== EDIT TAB B — Medical Information ====================
function renderHrEditTabMedical() {
  const r = hrEditRecord;
  const sel = (val, opt) => val === opt ? 'selected' : '';
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid-single">
        <div class="hr-form-group">
          <label class="hr-form-label">Disability Type <span class="hr-required">*</span></label>
          <select id="hr-edit-disability-type" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="None"     ${sel(r.disability_type,'None')}>None</option>
            <option value="Physical" ${sel(r.disability_type,'Physical')}>Physical</option>
            <option value="Visual"   ${sel(r.disability_type,'Visual')}>Visual</option>
            <option value="Hearing"  ${sel(r.disability_type,'Hearing')}>Hearing</option>
            <option value="Other"    ${sel(r.disability_type,'Other')}>Other</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Medical Info</label>
          <textarea id="hr-edit-medical-info" class="hr-form-textarea" rows="5">${r.medical_info || ''}</textarea>
        </div>
      </div>
      <div id="hr-edit-status-medical" class="hr-edit-success" style="display:none;"></div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="updateHrEditMedical()">Update</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrEdit()">Cancel</button>
      </div>
    </div>
  `;
}

function updateHrEditMedical() {
  const disability_type = document.getElementById('hr-edit-disability-type')?.value || '';
  if (!disability_type) { alert('Disability Type is required.'); return; }
  hrEditRecord.disability_type = disability_type;
  hrEditRecord.medical_info    = document.getElementById('hr-edit-medical-info')?.value || '';
  showHrEditSuccess('hr-edit-status-medical', 'Medical information updated successfully.');
}

// ==================== EDIT TAB C — Education ====================
function renderHrEditTabEducation() {
  const rows = (hrEditRecord.education || []).length === 0
    ? `<tr><td colspan="6" class="hr-empty">No records found</td></tr>`
    : (hrEditRecord.education || []).map((e, i) => `<tr>
        <td>${e.qualification}</td><td>${e.institution}</td><td>${e.academic_time}</td>
        <td>${e.awards_grades}</td><td>${e.attachment || '—'}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrEditEduDropdown(event,${i})">&#8230;</button>
            <div id="hr-edit-edu-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="openHrEditEduModalEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteHrEditEducation(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="openHrEditEduModalNew()">Add Education</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>QUALIFICATION</th><th>INSTITUTION</th><th>ACADEMIC TIME</th>
          <th>AWARDS/GRADES</th><th>ATTACHMENT</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

function toggleHrEditEduDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-edit-edu-dd-"]').forEach(d => {
    if (d.id !== `hr-edit-edu-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-edit-edu-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function openHrEditEduModalNew() {
  hrEditingEduIdx = -1;
  ['hr-edu-qualification','hr-edu-institution','hr-edu-time','hr-edu-grades'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const f = document.getElementById('hr-edu-attachment'); if (f) f.value = '';
  const title = document.getElementById('hr-edu-modal-title'); if (title) title.textContent = 'Add Education';
  const ov = document.getElementById('hr-edu-overlay'); if (ov) ov.style.display = 'flex';
}

function openHrEditEduModalEdit(idx) {
  hrEditingEduIdx = idx;
  const e = (hrEditRecord.education || [])[idx];
  if (!e) return;
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setv('hr-edu-qualification', e.qualification);
  setv('hr-edu-institution',   e.institution);
  setv('hr-edu-time',          e.academic_time);
  setv('hr-edu-grades',        e.awards_grades);
  const title = document.getElementById('hr-edu-modal-title'); if (title) title.textContent = 'Edit Education';
  const ov = document.getElementById('hr-edu-overlay'); if (ov) ov.style.display = 'flex';
}

function saveHrEditEducation() {
  const rec = {
    qualification: document.getElementById('hr-edu-qualification')?.value || '',
    institution:   document.getElementById('hr-edu-institution')?.value || '',
    academic_time: document.getElementById('hr-edu-time')?.value || '',
    awards_grades: document.getElementById('hr-edu-grades')?.value || '',
    attachment:    document.getElementById('hr-edu-attachment')?.files?.[0]?.name || ((hrEditingEduIdx >= 0 ? (hrEditRecord.education[hrEditingEduIdx]?.attachment || '') : ''))
  };
  if (!hrEditRecord.education) hrEditRecord.education = [];
  if (hrEditingEduIdx === -1) {
    hrEditRecord.education.push(rec);
  } else {
    hrEditRecord.education[hrEditingEduIdx] = rec;
  }
  closeHrAddEducationModal();
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabEducation();
}

function deleteHrEditEducation(idx) {
  if (!confirm('Delete this education record?')) return;
  hrEditRecord.education.splice(idx, 1);
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabEducation();
}

// ==================== EDIT TAB D — Identity ====================
function renderHrEditTabIdentity() {
  const r = hrEditRecord;
  const rows = (r.identity_docs || []).length === 0
    ? `<tr><td colspan="4" class="hr-empty">No records found</td></tr>`
    : (r.identity_docs || []).map((d, i) => `<tr>
        <td>${d.doc_title}</td><td>${d.attachment || '—'}</td><td>${d.date_attached}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrEditIdocDropdown(event,${i})">&#8230;</button>
            <div id="hr-edit-idoc-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="openHrEditIdocModalEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteHrEditIdentityDoc(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">KRA PIN</label>
          <input type="text" id="hr-edit-kra-pin" class="hr-form-input" value="${r.kra_pin || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">NSSF Number</label>
          <input type="text" id="hr-edit-nssf" class="hr-form-input" value="${r.nssf_number || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">NHIF Number</label>
          <input type="text" id="hr-edit-nhif" class="hr-form-input" value="${r.nhif_number || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">SHIF Number</label>
          <input type="text" id="hr-edit-shif" class="hr-form-input" value="${r.shif_number || ''}">
        </div>
      </div>
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="openHrEditIdocModalNew()">Add Identity</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>DOCUMENT TITLE</th><th>ATTACHMENTS</th><th>DATE ATTACHED</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div id="hr-edit-status-identity" class="hr-edit-success" style="display:none;"></div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="updateHrEditIdentity()">Update</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrEdit()">Cancel</button>
      </div>
    </div>
  `;
}

function updateHrEditIdentity() {
  hrEditRecord.kra_pin     = (document.getElementById('hr-edit-kra-pin')?.value || '').trim();
  hrEditRecord.nssf_number = (document.getElementById('hr-edit-nssf')?.value || '').trim();
  hrEditRecord.nhif_number = (document.getElementById('hr-edit-nhif')?.value || '').trim();
  hrEditRecord.shif_number = (document.getElementById('hr-edit-shif')?.value || '').trim();
  showHrEditSuccess('hr-edit-status-identity', 'Identity information updated successfully.');
}

function toggleHrEditIdocDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-edit-idoc-dd-"]').forEach(d => {
    if (d.id !== `hr-edit-idoc-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-edit-idoc-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function openHrEditIdocModalNew() {
  hrEditingIdocIdx = -1;
  ['hr-idoc-title','hr-idoc-date'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const f = document.getElementById('hr-idoc-file'); if (f) f.value = '';
  const title = document.getElementById('hr-idoc-modal-title'); if (title) title.textContent = 'Add Identity Document';
  const ov = document.getElementById('hr-idoc-overlay'); if (ov) ov.style.display = 'flex';
}

function openHrEditIdocModalEdit(idx) {
  hrEditingIdocIdx = idx;
  const d = (hrEditRecord.identity_docs || [])[idx];
  if (!d) return;
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setv('hr-idoc-title', d.doc_title);
  setv('hr-idoc-date',  d.date_attached);
  const title = document.getElementById('hr-idoc-modal-title'); if (title) title.textContent = 'Edit Identity Document';
  const ov = document.getElementById('hr-idoc-overlay'); if (ov) ov.style.display = 'flex';
}

function saveHrEditIdentityDoc() {
  const doc = {
    doc_title:     document.getElementById('hr-idoc-title')?.value || '',
    attachment:    document.getElementById('hr-idoc-file')?.files?.[0]?.name || (hrEditingIdocIdx >= 0 ? (hrEditRecord.identity_docs[hrEditingIdocIdx]?.attachment || '') : ''),
    date_attached: document.getElementById('hr-idoc-date')?.value || ''
  };
  if (!hrEditRecord.identity_docs) hrEditRecord.identity_docs = [];
  if (hrEditingIdocIdx === -1) {
    hrEditRecord.identity_docs.push(doc);
  } else {
    hrEditRecord.identity_docs[hrEditingIdocIdx] = doc;
  }
  closeHrAddIdentityModal();
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabIdentity();
}

function deleteHrEditIdentityDoc(idx) {
  if (!confirm('Delete this identity document?')) return;
  hrEditRecord.identity_docs.splice(idx, 1);
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabIdentity();
}

// ==================== EDIT TAB E — Dependents ====================
function renderHrEditTabDependents() {
  const rows = (hrEditRecord.dependents || []).length === 0
    ? `<tr><td colspan="6" class="hr-empty">No records found</td></tr>`
    : (hrEditRecord.dependents || []).map((d, i) => `<tr>
        <td>${d.name}</td><td>${d.insurance_type}</td><td>${d.relationship}</td>
        <td>${d.gender}</td><td>${d.birth_date}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrEditDepDropdown(event,${i})">&#8230;</button>
            <div id="hr-edit-dep-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="openHrEditDepModalEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteHrEditDependent(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="openHrEditDepModalNew()">Add Dependents</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>DEPENDENT NAME</th><th>INSURANCE TYPE</th><th>RELATIONSHIP</th>
          <th>GENDER</th><th>BIRTH DATE</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

function toggleHrEditDepDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-edit-dep-dd-"]').forEach(d => {
    if (d.id !== `hr-edit-dep-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-edit-dep-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function openHrEditDepModalNew() {
  hrEditingDepIdx = -1;
  ['hr-dep-name','hr-dep-student-name','hr-dep-student-id','hr-dep-birth-date','hr-dep-notes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['hr-dep-relationship','hr-dep-gender','hr-dep-insurance'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const cb  = document.getElementById('hr-dep-enrolled'); if (cb) cb.checked = false;
  const sec = document.getElementById('hr-dep-enrolled-section'); if (sec) sec.style.display = 'none';
  const title = document.getElementById('hr-dep-modal-title'); if (title) title.textContent = 'Add Dependent';
  const ov = document.getElementById('hr-dep-overlay'); if (ov) ov.style.display = 'flex';
}

function openHrEditDepModalEdit(idx) {
  hrEditingDepIdx = idx;
  const d = (hrEditRecord.dependents || [])[idx];
  if (!d) return;
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setv('hr-dep-name',         d.name);
  setv('hr-dep-relationship', d.relationship);
  setv('hr-dep-gender',       d.gender);
  setv('hr-dep-birth-date',   d.birth_date);
  setv('hr-dep-insurance',    d.insurance_type);
  setv('hr-dep-notes',        d.notes);
  const cb  = document.getElementById('hr-dep-enrolled');
  const sec = document.getElementById('hr-dep-enrolled-section');
  if (cb) { cb.checked = !!d.enrolled_in_school; }
  if (sec) { sec.style.display = d.enrolled_in_school ? 'block' : 'none'; }
  if (d.enrolled_in_school) {
    setv('hr-dep-student-name', d.student_name);
    setv('hr-dep-student-id',   d.student_id);
  }
  const title = document.getElementById('hr-dep-modal-title'); if (title) title.textContent = 'Edit Dependent';
  const ov = document.getElementById('hr-dep-overlay'); if (ov) ov.style.display = 'flex';
}

function saveHrEditDependent() {
  const name         = (document.getElementById('hr-dep-name')?.value || '').trim();
  const relationship = document.getElementById('hr-dep-relationship')?.value || '';
  const gender       = document.getElementById('hr-dep-gender')?.value || '';
  const birth_date   = document.getElementById('hr-dep-birth-date')?.value || '';
  if (!name)         { alert('Dependent name is required.'); return; }
  if (!relationship) { alert('Relationship is required.');  return; }
  if (!gender)       { alert('Gender is required.');        return; }
  if (!birth_date)   { alert('Birth Date is required.');    return; }
  const enrolled = document.getElementById('hr-dep-enrolled')?.checked || false;
  const dep = {
    name, relationship, gender, birth_date,
    insurance_type:     document.getElementById('hr-dep-insurance')?.value || '',
    enrolled_in_school: enrolled,
    student_name:       enrolled ? (document.getElementById('hr-dep-student-name')?.value || '') : '',
    student_id:         enrolled ? (document.getElementById('hr-dep-student-id')?.value || '')   : '',
    notes:              document.getElementById('hr-dep-notes')?.value || ''
  };
  if (!hrEditRecord.dependents) hrEditRecord.dependents = [];
  if (hrEditingDepIdx === -1) {
    hrEditRecord.dependents.push(dep);
  } else {
    hrEditRecord.dependents[hrEditingDepIdx] = dep;
  }
  closeHrAddDependentModal();
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabDependents();
}

function deleteHrEditDependent(idx) {
  if (!confirm('Delete this dependent?')) return;
  hrEditRecord.dependents.splice(idx, 1);
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabDependents();
}

// ==================== EDIT TAB F — Employee Service Profile ====================
function renderHrEditTabServiceProfile() {
  const rows = (hrEditRecord.service_profile || []).length === 0
    ? `<tr><td colspan="7" class="hr-empty">No records found</td></tr>`
    : (hrEditRecord.service_profile || []).map((sp, i) => `<tr>
        <td>${sp.reason_event || ''}</td><td>${sp.pay_grade || ''}</td><td>${sp.rank || ''}</td>
        <td>${sp.amount || ''}</td><td>${sp.effective_date || ''}</td><td>${sp.end_date || ''}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrEditSpDropdown(event,${i})">&#8230;</button>
            <div id="hr-edit-sp-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="hrEditSpEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteHrEditServiceProfile(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="hrEditSpAdd()">Add Employee Service Profile</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>REASON/EVENT</th><th>PAY GRADE</th><th>RANK</th>
          <th>AMOUNT</th><th>EFFECTIVE DATE</th><th>END DATE</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

function toggleHrEditSpDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-edit-sp-dd-"]').forEach(d => {
    if (d.id !== `hr-edit-sp-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-edit-sp-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function hrEditSpAdd() {
  const code = hrEditRecord.employee_code || String(hrEditRecord.id);
  const name = ((hrEditRecord.surname || hrEditRecord.first_name || '') + ' ' + (hrEditRecord.other_names || hrEditRecord.last_name || '')).trim();
  hrEspFormState = {
    context: 'add', sourceView: 'hr-edit',
    editSourceIdx: -1, lockedEmpCode: code, lockedEmpName: name,
    bankAccounts: [], editingBankIdx: -1, existingRecord: null
  };
  renderHrEspFormPage(document.getElementById('main-content'));
}

function hrEditSpEdit(idx) {
  const sp = (hrEditRecord.service_profile || [])[idx] || {};
  const code = hrEditRecord.employee_code || String(hrEditRecord.id);
  const name = ((hrEditRecord.surname || hrEditRecord.first_name || '') + ' ' + (hrEditRecord.other_names || hrEditRecord.last_name || '')).trim();
  hrEspFormState = {
    context: 'edit', sourceView: 'hr-edit',
    editSourceIdx: idx, lockedEmpCode: code, lockedEmpName: name,
    bankAccounts: [...(sp.bank_accounts || [])],
    editingBankIdx: -1, existingRecord: sp
  };
  renderHrEspFormPage(document.getElementById('main-content'));
}

function deleteHrEditServiceProfile(idx) {
  if (!confirm('Delete this service profile record?')) return;
  hrEditRecord.service_profile.splice(idx, 1);
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabServiceProfile();
}

function switchHrEditTab(tabId) {
  hrEditActiveTab = tabId;
  const bc = document.getElementById('hr-edit-breadcrumb');
  if (bc) bc.innerHTML = `Dashboard &rsaquo; Human Resource &rsaquo; Employee &rsaquo; ${getHrTabLabel(tabId)}`;
  document.querySelectorAll('#hr-edit-tab-bar .hr-tab-btn').forEach(btn => {
    btn.classList.toggle('hr-tab-btn--active', btn.getAttribute('data-tab-id') === tabId);
  });
  const content = document.getElementById('hr-edit-tab-content');
  if (content) content.innerHTML = renderHrEditTabContent(tabId);
}

// ==================== EMPLOYEE SERVICE PROFILE — SHARED FORM ====================

function renderHrEspFormPage(container) {
  const isEdit     = hrEspFormState.context === 'edit';
  const sp         = hrEspFormState.existingRecord || {};
  const locked     = hrEspFormState.sourceView === 'hr-edit' ||
                     (hrEspFormState.sourceView === 'payroll' && isEdit);
  const showStrip  = hrEspFormState.sourceView === 'hr-edit';
  const bcPrefix   = hrEspFormState.sourceView === 'payroll'
    ? 'Dashboard &rsaquo; Payroll &rsaquo;'
    : 'Dashboard &rsaquo; Human Resource &rsaquo; Employee &rsaquo;';
  const sel = (val, opt) => val === opt ? 'selected' : '';
  const pre = key  => sp[key] || '';

  // Pre-compute department for locked employee
  let lockedDept = pre('department');
  if (locked && hrEspFormState.lockedEmpCode && !lockedDept) {
    const lockedEmp = employeesData.find(e => e.employee_code === hrEspFormState.lockedEmpCode);
    if (lockedEmp) lockedDept = lockedEmp.department || '';
  }

  const empOptions = employeesData.map(e => {
    const name = ((e.surname || e.first_name || '') + ' ' + (e.other_names || e.last_name || '')).trim();
    return `<option value="${e.employee_code}">${name} (${e.employee_code})</option>`;
  }).join('');

  const stripHtml = showStrip ? `
    <div class="hr-edit-info-strip">
      <div class="hr-edit-info-item">
        <span class="hr-edit-info-label">Employee Code:</span>
        <span class="hr-edit-info-value">${hrEspFormState.lockedEmpCode}</span>
      </div>
      <div class="hr-edit-info-item">
        <span class="hr-edit-info-label">Employee Name:</span>
        <span class="hr-edit-info-value">${hrEspFormState.lockedEmpName}</span>
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="hr-page">
      <div class="hr-header-row">
        <h2 class="hr-title">${isEdit ? 'Edit' : 'Add'} Employee Service Profile</h2>
        <div class="hr-breadcrumb">${bcPrefix} Employee Service Profile &rsaquo; ${isEdit ? 'Edit' : 'Add'}</div>
      </div>
      ${stripHtml}
      <div class="hr-tab-body">
        <div class="hr-form-grid">
          <div class="hr-form-group">
            <label class="hr-form-label">Employee Code <span class="hr-required">*</span></label>
            ${locked
              ? `<input type="text" id="hr-esp-emp-code" class="hr-form-input hr-form-readonly" value="${hrEspFormState.lockedEmpCode}" readonly>`
              : `<input type="text" id="hr-esp-emp-code" list="hr-esp-emp-list" class="hr-form-input" placeholder="Search employee..." onchange="onHrEspEmpCodeChange()">
                 <datalist id="hr-esp-emp-list">${empOptions}</datalist>`}
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Department</label>
            <input type="text" id="hr-esp-department" class="hr-form-input hr-form-readonly" value="${lockedDept}" readonly placeholder="Auto-populated">
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Reason/Event <span class="hr-required">*</span></label>
            <select id="hr-esp-reason-event" class="hr-form-select">
              <option value="">Please Select</option>
              <option value="New Hire"      ${sel(pre('reason_event'),'New Hire')}>New Hire</option>
              <option value="Promotion"     ${sel(pre('reason_event'),'Promotion')}>Promotion</option>
              <option value="Salary Review" ${sel(pre('reason_event'),'Salary Review')}>Salary Review</option>
              <option value="Demotion"      ${sel(pre('reason_event'),'Demotion')}>Demotion</option>
              <option value="Transfer"      ${sel(pre('reason_event'),'Transfer')}>Transfer</option>
              <option value="Termination"   ${sel(pre('reason_event'),'Termination')}>Termination</option>
            </select>
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Processing Method</label>
            <select id="hr-esp-processing-method" class="hr-form-select">
              <option value="Pay Grade" ${sel(pre('processing_method')||'Pay Grade','Pay Grade')}>Pay Grade</option>
              <option value="Basic"     ${sel(pre('processing_method'),'Basic')}>Basic</option>
              <option value="Hourly"    ${sel(pre('processing_method'),'Hourly')}>Hourly</option>
            </select>
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Pay Grade <span class="hr-required">*</span></label>
            <select id="hr-esp-pay-grade" class="hr-form-select" onchange="onHrEspSalaryFields()">
              <option value="">Please Select</option>
              <option value="Grade 1" ${sel(pre('pay_grade'),'Grade 1')}>Grade 1</option>
              <option value="Grade 2" ${sel(pre('pay_grade'),'Grade 2')}>Grade 2</option>
              <option value="Grade 3" ${sel(pre('pay_grade'),'Grade 3')}>Grade 3</option>
              <option value="Grade 4" ${sel(pre('pay_grade'),'Grade 4')}>Grade 4</option>
              <option value="Grade 5" ${sel(pre('pay_grade'),'Grade 5')}>Grade 5</option>
            </select>
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Rank <span class="hr-required">*</span></label>
            <select id="hr-esp-rank" class="hr-form-select" onchange="onHrEspSalaryFields()">
              <option value="">Please Select</option>
              <option value="Junior" ${sel(pre('rank'),'Junior')}>Junior</option>
              <option value="Mid"    ${sel(pre('rank'),'Mid')}>Mid</option>
              <option value="Senior" ${sel(pre('rank'),'Senior')}>Senior</option>
              <option value="Lead"   ${sel(pre('rank'),'Lead')}>Lead</option>
            </select>
          </div>
          <div class="hr-form-group hr-form-span2">
            <label class="hr-form-label">Basic Salary</label>
            <input type="text" id="hr-esp-basic-salary" class="hr-form-input hr-form-readonly" value="${pre('amount')}" readonly placeholder="Auto-populated from Pay Grade and Rank">
          </div>
        </div>

        <div class="hr-esp-sheltered-section">
          <label class="hr-form-label">Shettered from Paying</label>
          <div class="hr-esp-sheltered-row">
            <label class="hr-form-checkbox-label"><input type="checkbox" id="hr-esp-sh-paye"    class="hr-form-cb" ${sp.sheltered_from_paying?.paye         ? 'checked' : ''}> P.A.Y.E.</label>
            <label class="hr-form-checkbox-label"><input type="checkbox" id="hr-esp-sh-nhif"    class="hr-form-cb" ${sp.sheltered_from_paying?.nhif         ? 'checked' : ''}> N.H.I.F.</label>
            <label class="hr-form-checkbox-label"><input type="checkbox" id="hr-esp-sh-shif"    class="hr-form-cb" ${sp.sheltered_from_paying?.shif         ? 'checked' : ''}> S.H.I.F.</label>
            <label class="hr-form-checkbox-label"><input type="checkbox" id="hr-esp-sh-nssf"    class="hr-form-cb" ${sp.sheltered_from_paying?.nssf         ? 'checked' : ''}> N.S.S.F.</label>
            <label class="hr-form-checkbox-label"><input type="checkbox" id="hr-esp-sh-housing" class="hr-form-cb" ${sp.sheltered_from_paying?.housing_levy  ? 'checked' : ''}> Housing Levy</label>
            <label class="hr-form-checkbox-label"><input type="checkbox" id="hr-esp-sh-pension" class="hr-form-cb" ${sp.sheltered_from_paying?.pension        ? 'checked' : ''}> Pension</label>
          </div>
        </div>

        <div class="hr-form-grid">
          <div class="hr-form-group">
            <label class="hr-form-label">Employee Status</label>
            <select id="hr-esp-emp-status" class="hr-form-select">
              <option value="">Please Select</option>
              <option value="Active"     ${sel(pre('employee_status'),'Active')}>Active</option>
              <option value="Inactive"   ${sel(pre('employee_status'),'Inactive')}>Inactive</option>
              <option value="Suspended"  ${sel(pre('employee_status'),'Suspended')}>Suspended</option>
              <option value="On Leave"   ${sel(pre('employee_status'),'On Leave')}>On Leave</option>
            </select>
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Salary Disbursement Mode <span class="hr-required">*</span></label>
            <select id="hr-esp-disbursement-mode" class="hr-form-select">
              <option value="">Please Select</option>
              <option value="Bank Transfer"  ${sel(pre('salary_disbursement_mode'),'Bank Transfer')}>Bank Transfer</option>
              <option value="Cash"           ${sel(pre('salary_disbursement_mode'),'Cash')}>Cash</option>
              <option value="Cheque"         ${sel(pre('salary_disbursement_mode'),'Cheque')}>Cheque</option>
              <option value="Mobile Money"   ${sel(pre('salary_disbursement_mode'),'Mobile Money')}>Mobile Money</option>
            </select>
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Effective Date <span class="hr-required">*</span></label>
            <input type="date" id="hr-esp-effective-date" class="hr-form-input" value="${pre('effective_date')}">
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">End Date</label>
            <input type="date" id="hr-esp-end-date" class="hr-form-input" value="${pre('end_date')}">
          </div>
        </div>

        <div id="hr-esp-bank-section-wrap">${renderHrEspBankSection()}</div>

        <div class="hr-form-group" style="margin-top:20px;">
          <label class="hr-form-label">Notes / Details</label>
          <textarea id="hr-esp-notes" class="hr-form-textarea" rows="4" placeholder="Additional notes...">${pre('notes')}</textarea>
        </div>

        <div class="hr-form-actions">
          <button class="hr-btn-form-submit" onclick="submitHrEspForm()">${isEdit ? 'Update' : 'Submit'}</button>
          <button class="hr-btn-form-cancel" onclick="cancelHrEspForm()">Cancel</button>
        </div>
      </div>
    </div>
    <div id="hr-esp-bank-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrEspBankModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Add Bank Details</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Account No.</label><input type="text" id="hr-esp-bank-acct-no" class="hr-modal-input" placeholder="Account Number"></div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Bank <span class="hr-required">*</span></label>
            <select id="hr-esp-bank-select" class="hr-modal-select"><option value="">Please Select</option>${buildHrEspBankOptions()}</select>
          </div>
          <div class="hr-modal-field"><label class="hr-form-label">Account and Branch</label><input type="text" id="hr-esp-bank-acct-branch" class="hr-modal-input" placeholder="e.g. Main Branch"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Percentage</label><input type="number" id="hr-esp-bank-pct" class="hr-modal-input" min="0" max="100" placeholder="e.g. 100"></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrEspBankModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEspBankAccount()">Select</button>
        </div>
      </div>
    </div>
  `;
}

function renderHrEspBankSection() {
  const banks = hrEspFormState.bankAccounts || [];
  const maxReached = banks.length >= 2;
  const total = banks.reduce((s, b) => s + (parseFloat(b.percentage) || 0), 0);
  const totalCls = total === 100 ? 'hr-esp-bank-total--ok' : 'hr-esp-bank-total--warn';
  const rows = banks.length === 0
    ? `<tr><td colspan="5" class="hr-empty">No bank accounts added</td></tr>`
    : banks.map((b, i) => `<tr>
        <td>${b.accountNo || ''}</td>
        <td>${b.bank || ''}</td>
        <td>${b.accountAndBranch || ''}</td>
        <td>${b.percentage || 0}%</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrEspBankDropdown(event,${i})">&#8230;</button>
            <div id="hr-esp-bank-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="openHrEspBankModalEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteHrEspBankAccount(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  return `
    <div class="hr-esp-bank-section">
      <div class="hr-esp-bank-header">
        <div>
          <span class="hr-form-label">Add Bank Account</span>
          <p class="hr-esp-bank-hint">Only 2 bank accounts at a time</p>
        </div>
        <button class="hr-add-btn${maxReached ? ' hr-esp-bank-btn--disabled' : ''}"
          ${maxReached ? 'disabled' : 'onclick="openHrEspBankModalNew()"'}>Add Bank Account</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>ACCOUNT NO.</th><th>BANK</th><th>ACCOUNT AND BRANCH</th><th>PERCENTAGE</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="hr-esp-bank-total ${totalCls}">Total: ${total}%</div>
    </div>
  `;
}

function buildHrEspBankOptions() {
  return financialInstitutionsData
    .filter(fi => !fi.isInactive && !(fi.branch || '').toLowerCase().includes('seven oaks'))
    .map(fi => `<option value="${fi.id}">${fi.institution}</option>`)
    .join('');
}

function toggleHrEspBankDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-esp-bank-dd-"]').forEach(d => {
    if (d.id !== `hr-esp-bank-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-esp-bank-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function openHrEspBankModalNew() {
  hrEspFormState.editingBankIdx = -1;
  ['hr-esp-bank-acct-no','hr-esp-bank-acct-branch'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const pct = document.getElementById('hr-esp-bank-pct'); if (pct) pct.value = '';
  const sel = document.getElementById('hr-esp-bank-select');
  if (sel) { sel.innerHTML = `<option value="">Please Select</option>${buildHrEspBankOptions()}`; sel.value = ''; }
  const ov = document.getElementById('hr-esp-bank-overlay'); if (ov) ov.style.display = 'flex';
}

function openHrEspBankModalEdit(idx) {
  hrEspFormState.editingBankIdx = idx;
  const b = hrEspFormState.bankAccounts[idx];
  if (!b) return;
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setv('hr-esp-bank-acct-no', b.accountNo);
  setv('hr-esp-bank-acct-branch', b.accountAndBranch);
  setv('hr-esp-bank-pct', b.percentage);
  const sel = document.getElementById('hr-esp-bank-select');
  if (sel) { sel.innerHTML = `<option value="">Please Select</option>${buildHrEspBankOptions()}`; sel.value = b.bankId || ''; }
  const ov = document.getElementById('hr-esp-bank-overlay'); if (ov) ov.style.display = 'flex';
}

function closeHrEspBankModal() {
  const ov = document.getElementById('hr-esp-bank-overlay'); if (ov) ov.style.display = 'none';
}

function saveHrEspBankAccount() {
  const sel = document.getElementById('hr-esp-bank-select');
  const bankId   = sel?.value || '';
  const bankName = sel?.options[sel.selectedIndex]?.text || '';
  const entry = {
    accountNo:        document.getElementById('hr-esp-bank-acct-no')?.value || '',
    bankId,
    bank:             bankName,
    accountAndBranch: document.getElementById('hr-esp-bank-acct-branch')?.value || '',
    percentage:       parseFloat(document.getElementById('hr-esp-bank-pct')?.value || 0)
  };
  if (hrEspFormState.editingBankIdx === -1) {
    hrEspFormState.bankAccounts.push(entry);
  } else {
    hrEspFormState.bankAccounts[hrEspFormState.editingBankIdx] = entry;
  }
  closeHrEspBankModal();
  const wrap = document.getElementById('hr-esp-bank-section-wrap');
  if (wrap) wrap.innerHTML = renderHrEspBankSection();
}

function deleteHrEspBankAccount(idx) {
  if (!confirm('Remove this bank account?')) return;
  hrEspFormState.bankAccounts.splice(idx, 1);
  const wrap = document.getElementById('hr-esp-bank-section-wrap');
  if (wrap) wrap.innerHTML = renderHrEspBankSection();
}

function onHrEspEmpCodeChange() {
  const code = (document.getElementById('hr-esp-emp-code')?.value || '').trim();
  const emp  = employeesData.find(e => e.employee_code === code);
  const deptEl = document.getElementById('hr-esp-department');
  if (deptEl) deptEl.value = emp ? (emp.department || '') : '';
}

function onHrEspSalaryFields() {
  const payGrade = document.getElementById('hr-esp-pay-grade')?.value || '';
  const rank     = document.getElementById('hr-esp-rank')?.value || '';
  const el = document.getElementById('hr-esp-basic-salary');
  if (el) el.value = (payGrade && rank) ? '' : '';
}

function cancelHrEspForm() {
  const main = document.getElementById('main-content');
  switch (hrEspFormState.sourceView) {
    case 'hr-add':
      renderHrAddPage(main);
      switchHrAddTab('service-profile');
      break;
    case 'hr-edit':
      renderHrEditPage(main, hrEditRecord);
      switchHrEditTab('service-profile');
      break;
    case 'payroll':
      loadPayrollEspListingView(main);
      break;
  }
}

function submitHrEspForm() {
  const empCode = (document.getElementById('hr-esp-emp-code')?.value || '').trim();
  const reasonEvent       = document.getElementById('hr-esp-reason-event')?.value || '';
  const payGrade          = document.getElementById('hr-esp-pay-grade')?.value || '';
  const rank              = document.getElementById('hr-esp-rank')?.value || '';
  const disbursementMode  = document.getElementById('hr-esp-disbursement-mode')?.value || '';
  const effectiveDate     = document.getElementById('hr-esp-effective-date')?.value || '';

  if (!empCode)          { alert('Employee Code is required.'); return; }
  if (!reasonEvent)      { alert('Reason/Event is required.'); return; }
  if (!payGrade)         { alert('Pay Grade is required.'); return; }
  if (!rank)             { alert('Rank is required.'); return; }
  if (!disbursementMode) { alert('Salary Disbursement Mode is required.'); return; }
  if (!effectiveDate)    { alert('Effective Date is required.'); return; }

  const emp     = employeesData.find(e => e.employee_code === empCode);
  const empName = emp
    ? ((emp.surname || emp.first_name || '') + ' ' + (emp.other_names || emp.last_name || '')).trim()
    : hrEspFormState.lockedEmpName;

  const record = {
    id:                     hrEspFormState.context === 'edit' ? (hrEspFormState.existingRecord?.id || Date.now()) : Date.now(),
    employee_code:          empCode,
    employee_name:          empName,
    department:             document.getElementById('hr-esp-department')?.value || '',
    reason_event:           reasonEvent,
    processing_method:      document.getElementById('hr-esp-processing-method')?.value || '',
    pay_grade:              payGrade,
    rank:                   rank,
    amount:                 document.getElementById('hr-esp-basic-salary')?.value || '',
    effective_date:         effectiveDate,
    end_date:               document.getElementById('hr-esp-end-date')?.value || '',
    employee_status:        document.getElementById('hr-esp-emp-status')?.value || '',
    salary_disbursement_mode: disbursementMode,
    sheltered_from_paying: {
      paye:         document.getElementById('hr-esp-sh-paye')?.checked    || false,
      nhif:         document.getElementById('hr-esp-sh-nhif')?.checked    || false,
      shif:         document.getElementById('hr-esp-sh-shif')?.checked    || false,
      nssf:         document.getElementById('hr-esp-sh-nssf')?.checked    || false,
      housing_levy: document.getElementById('hr-esp-sh-housing')?.checked || false,
      pension:      document.getElementById('hr-esp-sh-pension')?.checked  || false
    },
    bank_accounts: [...hrEspFormState.bankAccounts],
    notes: document.getElementById('hr-esp-notes')?.value || ''
  };

  if (hrEspFormState.context === 'edit') {
    const gi = employeeServiceProfilesData.findIndex(r => r.id === record.id);
    if (gi !== -1) employeeServiceProfilesData[gi] = record;
    if (hrEspFormState.sourceView === 'hr-edit' && hrEditRecord) {
      if (!hrEditRecord.service_profile) hrEditRecord.service_profile = [];
      if (hrEspFormState.editSourceIdx >= 0) hrEditRecord.service_profile[hrEspFormState.editSourceIdx] = record;
    }
  } else {
    employeeServiceProfilesData.push(record);
    if (hrEspFormState.sourceView === 'hr-add') {
      if (!hrAddFormState.service_profile) hrAddFormState.service_profile = [];
      hrAddFormState.service_profile.push(record);
    } else if (hrEspFormState.sourceView === 'hr-edit' && hrEditRecord) {
      if (!hrEditRecord.service_profile) hrEditRecord.service_profile = [];
      hrEditRecord.service_profile.push(record);
    } else if (hrEspFormState.sourceView === 'payroll' && emp) {
      if (!emp.service_profile) emp.service_profile = [];
      emp.service_profile.push(record);
    }
  }
  cancelHrEspForm();
}

