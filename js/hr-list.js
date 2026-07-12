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

async function loadHrEmployeeDirectoryView(container) {
  // hrEditEmployee/hr-esp-form.js/payroll.js all look employees up by id or
  // employee_code from this global cache — renderSplitView keeps its own
  // internal list, so without this the cache stays permanently empty and
  // "Edit" on any employee reports "Employee not found".
  const empRes = await apiFetch(`${API_BASE}/hr/employees`);
  const empList = (empRes && empRes.ok) ? _toArray(await empRes.json().catch(() => [])) : [];
  employeesData.splice(0, employeesData.length, ...empList);

  await renderSplitView({
    container,
    moduleKey: 'human_resource.employee_directory',
    title: 'Employees',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Human Resource',view:'hr-employee-directory'},
      {label:'Employees'}
    ],
    apiUrl: `${API_BASE}/hr/employees`,
    searchFields: ['first_name','last_name','email','employee_code','designation'],
    col1Label: 'Name', col2Label: 'Code / Role',
    col1: e => `${e.first_name||''} ${e.last_name||''}`.trim() || '—',
    col2: e => [e.employee_code, e.designation].filter(Boolean).join(' · ') || '—',
    rowLabel: e => `${e.first_name||''} ${e.last_name||''}`.trim() || '—',
    rowSub:   e => e.email || '',
    idKey: 'id',
    detailFields: [
      {label:'Name',        key:'first_name', fmt:(_,e)=>`${e.first_name||''} ${e.last_name||''}`.trim()},
      {label:'Emp Code',    key:'employee_code', fmt:v=>v||'—'},
      {label:'Email',       key:'email', fmt:v=>v||'—'},
      {label:'Phone',       key:'phone_number', fmt:(v,e)=>v?`${e.phone_country_code||''} ${v}`.trim():'—'},
      {label:'Designation', key:'designation', fmt:v=>v||'—'},
      {label:'Department',  key:'department', fmt:v=>v||'—'},
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

function _hrEmployeeDirectoryLegacy(container) {
  hrCurrentPage = 1;
  setActiveSidebarItem('sidebar-hr-employee-directory');
  const hrDropdown = document.getElementById('hr-dropdown');
  if (hrDropdown) hrDropdown.style.display = 'block';

  container.innerHTML = `
    <div class="hr-page">
      <div class="hr-controls-row">
        <div class="hr-controls-right">
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
  ['hr-f-name', 'hr-f-email', 'hr-f-tutor', 'hr-f-designation', 'hr-f-department', 'hr-f-status'].forEach(id => {
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

