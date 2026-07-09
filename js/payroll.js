// ==================== PAYROLL MODULE ====================
let payrollEspPage = 1;
let payrollEspPerPage = 10;
let payrollEspFiltered = [];

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="payroll-esp-dd-"],[id^="fi-dd-"]').forEach(d => d.style.display = 'none');
});

// renderSplitView shows nothing in the right panel until an item is selected
// unless cfg.renderAdd is provided (see [[frontend-gotchas]]) — every config
// in this file had onAdd wired but no renderAdd, so there was no visible way
// to reach Add without first selecting an existing record.
function _prAddPlaceholder(label, action, hint) {
  return el => {
    el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
      <div style="font-size:2rem;margin-bottom:12px">&#128196;</div>
      <p style="font-weight:600;margin-bottom:8px">Add a New ${label}</p>
      <p style="font-size:13px;margin-bottom:20px">${hint || ''}</p>
      <button class="btn-primary" style="padding:10px 24px" onclick="${action}">+ Add ${label}</button>
    </div>`;
  };
}
function _prInfoPlaceholder(message, action, actionLabel) {
  return el => {
    el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
      <div style="font-size:2rem;margin-bottom:12px">&#8505;</div>
      <p style="font-size:13px;margin-bottom:20px">${message}</p>
      <button class="btn-primary" style="padding:10px 24px" onclick="${action}">${actionLabel}</button>
    </div>`;
  };
}

async function loadPayrollEspListingView(container) {
  await renderSplitView({
    container,
    title: 'Employee Service Profiles',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Payroll',view:'payroll-esp'},
      {label:'Service Profiles'}
    ],
    apiUrl: `${API_BASE}/payroll/employee-service-profiles/`,
    searchFields: ['employee_name','employee_code','department'],
    col1Label: 'Employee', col2Label: 'Department',
    col1: sp => sp.employee_name || '—',
    col2: sp => sp.department || sp.employee_code || '—',
    rowLabel: sp => sp.employee_name || '—',
    rowSub:   sp => sp.employee_code || '',
    idKey: 'id',
    detailFields: [
      {label:'Employee',    key:'employee_name', fmt:v=>v||'—'},
      {label:'Emp Code',    key:'employee_code', fmt:v=>v||'—'},
      {label:'Department',  key:'department', fmt:v=>v||'—'},
      {label:'Pay Grade',   key:'pay_grade', fmt:v=>v||'—'},
      {label:'Basic Salary',key:'basic_salary', fmt:v=>v!=null?String(v):'—'},
      {label:'Eff. Date',   key:'effective_date', fmt:v=>v||'—'},
    ],
    renderAdd: _prAddPlaceholder('Service Profile', 'payrollEspAdd()', 'Set up a new employee service profile.'),
    onAdd:  () => payrollEspAdd(),
    onEdit: item => {
      hrEspFormState = {
        context: 'edit', sourceView: 'payroll',
        editSourceIdx: -1, lockedEmpCode: item.employee_code || '', lockedEmpName: item.employee_name || '',
        bankAccounts: [...(item.bank_accounts || [])],
        editingBankIdx: -1, existingRecord: item
      };
      renderHrEspFormPage(document.getElementById('main-content'));
    },
  });
}

function _loadPayrollEspListingLegacy(container) {
  payrollEspFiltered = [...employeeServiceProfilesData];
  payrollEspPage = 1;

  container.innerHTML = `
    <div class="payroll-page">
      <div class="hr-header-row">
        <h2 class="hr-title">Employee Service Profile</h2>
        <div class="hr-breadcrumb">Dashboard &rsaquo; Payroll &rsaquo; Employee Service Profile &rsaquo; Listing</div>
      </div>
      <div class="hr-controls-row">
        <div class="hr-controls-left">
          Show <select id="payroll-esp-per-page" onchange="changePayrollEspPerPage(this.value)">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select> entries
          &nbsp;|&nbsp; Total <span id="payroll-esp-total">0</span> entries
        </div>
        <div class="hr-controls-right">
          <button class="hr-icon-btn" title="Export">&uarr;</button>
          <button class="hr-icon-btn" title="Export">&uarr;</button>
          <button class="hr-add-btn" onclick="payrollEspAdd()">+ Add</button>
          <input id="payroll-esp-search" class="hr-search" placeholder="Search..." onkeyup="handlePayrollEspSearch()">
          <button class="hr-filter-btn">Filters</button>
        </div>
      </div>
      <div class="hr-table-wrap">
        <div id="payroll-esp-table-container"></div>
      </div>
      <div id="payroll-esp-pagination"></div>
    </div>
  `;

  const sel = document.getElementById('payroll-esp-per-page');
  if (sel) sel.value = String(payrollEspPerPage);
  renderPayrollEspTable();
}

function renderPayrollEspTable() {
  const totalEl = document.getElementById('payroll-esp-total');
  if (totalEl) totalEl.textContent = payrollEspFiltered.length;

  const start    = (payrollEspPage - 1) * payrollEspPerPage;
  const pageData = payrollEspFiltered.slice(start, start + payrollEspPerPage);

  let html = `<table class="hr-table"><thead><tr>
    <th>EMP. CODE</th><th>EMP NAME</th><th>DEPARTMENT</th><th>REASON/EVENT</th>
    <th>PROCESSING METHOD</th><th>PAY GRADE</th>
    <th>BASIC SALARY</th><th>EFFECTIVE DATE</th><th>ACTION</th>
  </tr></thead><tbody>`;

  if (pageData.length === 0) {
    html += `<tr><td colspan="9" class="hr-empty">No records found</td></tr>`;
  } else {
    pageData.forEach((sp, i) => {
      const idx = start + i;
      html += `<tr>
        <td>${sp.employee_code || ''}</td>
        <td>${sp.employee_name || ''}</td>
        <td>${sp.department || ''}</td>
        <td>${sp.reason_event || ''}</td>
        <td>${sp.processing_method || ''}</td>
        <td>${sp.pay_grade || ''}</td>
        <td>${sp.basic_salary || ''}</td>
        <td>${sp.effective_date || ''}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="togglePayrollEspDropdown(event,${idx})">&#8230;</button>
            <div id="payroll-esp-dd-${idx}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="payrollEspEdit(${idx});return false;">&#9998; Edit</a>
              <a href="#" onclick="payrollEspDelete(${idx});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  html += `</tbody></table>`;
  document.getElementById('payroll-esp-table-container').innerHTML = html;

  const totalPages = Math.ceil(payrollEspFiltered.length / payrollEspPerPage);
  let pagHtml = '';
  if (totalPages > 1) {
    pagHtml = '<div class="hr-pagination">';
    pagHtml += `<button onclick="payrollEspGoToPage(1)" ${payrollEspPage === 1 ? 'disabled' : ''}>&laquo;</button>`;
    for (let i = 1; i <= totalPages; i++) {
      pagHtml += `<button onclick="payrollEspGoToPage(${i})" ${i === payrollEspPage ? 'class="hr-page-active"' : ''}>${i}</button>`;
    }
    pagHtml += `<button onclick="payrollEspGoToPage(${totalPages})" ${payrollEspPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;
    pagHtml += '</div>';
  }
  document.getElementById('payroll-esp-pagination').innerHTML = pagHtml;
}

function changePayrollEspPerPage(val) {
  payrollEspPerPage = parseInt(val);
  payrollEspPage = 1;
  renderPayrollEspTable();
}

function payrollEspGoToPage(page) {
  payrollEspPage = page;
  renderPayrollEspTable();
}

function handlePayrollEspSearch() {
  const q = (document.getElementById('payroll-esp-search')?.value || '').toLowerCase();
  payrollEspFiltered = employeeServiceProfilesData.filter(sp =>
    (sp.employee_code || '').toLowerCase().includes(q) ||
    (sp.employee_name || '').toLowerCase().includes(q)
  );
  payrollEspPage = 1;
  renderPayrollEspTable();
}

function togglePayrollEspDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="payroll-esp-dd-"]').forEach(d => {
    if (d.id !== `payroll-esp-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`payroll-esp-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function payrollEspAdd() {
  hrEspFormState = {
    context: 'add', sourceView: 'payroll',
    editSourceIdx: -1, lockedEmpCode: '', lockedEmpName: '',
    bankAccounts: [], editingBankIdx: -1, existingRecord: null
  };
  renderHrEspFormPage(document.getElementById('main-content'));
}

function payrollEspEdit(idx) {
  const sp = payrollEspFiltered[idx];
  if (!sp) return;
  hrEspFormState = {
    context: 'edit', sourceView: 'payroll',
    editSourceIdx: idx, lockedEmpCode: sp.employee_code || '', lockedEmpName: sp.employee_name || '',
    bankAccounts: [...(sp.bank_accounts || [])],
    editingBankIdx: -1, existingRecord: sp
  };
  renderHrEspFormPage(document.getElementById('main-content'));
}

function payrollEspDelete(idx) {
  const sp = payrollEspFiltered[idx];
  if (!sp) return;
  if (!confirm('Delete this service profile record?')) return;

  const gi = employeeServiceProfilesData.findIndex(r => r === sp || r.id === sp.id);
  if (gi !== -1) employeeServiceProfilesData.splice(gi, 1);

  // Mirror delete in employee record
  if (sp.employee_code) {
    const emp = employeesData.find(e => e.employee_code === sp.employee_code);
    if (emp && emp.service_profile) {
      const si = emp.service_profile.findIndex(r => r.id === sp.id);
      if (si !== -1) emp.service_profile.splice(si, 1);
    }
  }

  payrollEspFiltered = [...employeeServiceProfilesData];
  payrollEspPage = 1;
  renderPayrollEspTable();
}

// ==================== PAYROLL — FINANCIAL INSTITUTIONS ====================
let fiCurrentPage = 1;
let fiPerPage = 10;

function openPayrollDropdowns() {
  const pd = document.getElementById('payroll-dropdown');
  const ud = document.getElementById('payroll-utilities-dropdown');
  if (pd) pd.style.display = 'block';
  if (ud) ud.style.display = 'block';
}

// ---- Listing ----
async function loadPayrollFiListingView(container) {
  await renderSplitView({
    container,
    title: 'Financial Institutions',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Payroll',view:'payroll-fi'},
      {label:'Financial Institutions'}
    ],
    apiUrl: `${API_BASE}/payroll/utilities/financial-institutions/`,
    searchFields: ['institution','code'],
    col1Label: 'Institution', col2Label: 'Code',
    col1: r => r.institution || '—',
    col2: r => r.code || '—',
    rowLabel: r => r.institution || '—',
    rowSub:   r => r.code || '',
    idKey: 'id',
    detailFields: [
      {label:'Code',        key:'code'},
      {label:'Institution', key:'institution'},
      {label:'Default',     key:'is_default', fmt:v=>(v||false)?'Yes':'No'},
      {label:'Status',      key:'is_inactive', fmt:v=>v?'Inactive':'Active'},
    ],
    renderAdd: _prAddPlaceholder('Financial Institution', "loadPayrollFiAddView(document.getElementById('main-content'))", 'Add a bank or financial institution for salary disbursement.'),
    onAdd:  () => loadPayrollFiAddView(document.getElementById('main-content')),
    onEdit: item => loadPayrollFiEditView(document.getElementById('main-content'), item.id),
  });
}

function renderFiTable() {
  const totalEl = document.getElementById('fi-total-count');
  if (totalEl) totalEl.textContent = financialInstitutionsData.length;

  const start    = (fiCurrentPage - 1) * fiPerPage;
  const pageData = financialInstitutionsData.slice(start, start + fiPerPage);

  let html = `<table class="fi-table"><thead><tr>
    <th>CODE</th><th>INSTITUTION</th><th>IS DEFAULT?</th><th>STATUS</th><th>ACTION</th>
  </tr></thead><tbody>`;

  if (pageData.length === 0) {
    html += `<tr><td colspan="6" class="hr-empty">No records found</td></tr>`;
  } else {
    pageData.forEach(rec => {
      html += `<tr>
        <td>${rec.code || ''}</td>
        <td>${rec.institution || ''}</td>
        <td>${(rec.is_default || rec.isDefault) ? 'Yes' : 'No'}</td>
        <td>
          <div class="fi-status-pill ${(rec.is_inactive || rec.isInactive) ? 'fi-pill-inactive' : 'fi-pill-active'}">
            <span>${(rec.is_inactive || rec.isInactive) ? 'Inactive' : 'Active'}</span>
            <button class="fi-pill-toggle" onclick="toggleFiStatus('${rec.id}')" title="Toggle status">&#9660;</button>
          </div>
        </td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleFiDropdown(event,'${rec.id}')">&#8230;</button>
            <div id="fi-dd-${rec.id}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="loadPayrollFiEditView(document.getElementById('main-content'),'${rec.id}');return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteFi('${rec.id}');return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  html += `</tbody></table>`;
  document.getElementById('fi-table-container').innerHTML = html;

  const totalPages = Math.ceil(financialInstitutionsData.length / fiPerPage);
  let pagHtml = '';
  if (totalPages > 1) {
    pagHtml = '<div class="hr-pagination">';
    pagHtml += `<button onclick="fiGoToPage(1)" ${fiCurrentPage === 1 ? 'disabled' : ''}>&laquo;</button>`;
    for (let i = 1; i <= totalPages; i++) {
      pagHtml += `<button onclick="fiGoToPage(${i})" ${i === fiCurrentPage ? 'class="hr-page-active"' : ''}>${i}</button>`;
    }
    pagHtml += `<button onclick="fiGoToPage(${totalPages})" ${fiCurrentPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;
    pagHtml += '</div>';
  }
  document.getElementById('fi-pagination').innerHTML = pagHtml;
}

function changeFiPerPage(val) {
  fiPerPage = parseInt(val);
  fiCurrentPage = 1;
  renderFiTable();
}

function fiGoToPage(page) {
  fiCurrentPage = page;
  renderFiTable();
}

function toggleFiDropdown(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="fi-dd-"]').forEach(d => {
    if (d.id !== `fi-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`fi-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

async function toggleFiStatus(id) {
  const rec = financialInstitutionsData.find(r => r.id === id);
  if (!rec) return;
  rec.is_inactive = !(rec.is_inactive || rec.isInactive);
  rec.isInactive  = rec.is_inactive;   // keep legacy field in sync for any display that still reads it
  renderFiTable();
  await apiFetch(`${API_BASE}/payroll/utilities/financial-institutions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rec)
  });
}

async function deleteFi(id) {
  if (!confirm('Delete this financial institution?')) return;
  const res = await apiFetch(`${API_BASE}/payroll/utilities/financial-institutions/${id}`, { method: 'DELETE' });
  if (!(res && res.ok)) { showToast('Could not delete record.', 'error'); return; }
  const idx = financialInstitutionsData.findIndex(r => r.id === id);
  if (idx !== -1) financialInstitutionsData.splice(idx, 1);
  renderFiTable();
}

// ---- Shared form fields renderer ----
function renderFiFormFields(rec) {
  return `
    <div class="hr-form-grid">
      <div class="hr-form-group">
        <label class="hr-form-label">Code <span class="hr-required">*</span></label>
        <input type="text" id="fi-code" class="hr-form-input" value="${rec.code || ''}" placeholder="e.g. KCB001">
      </div>
      <div class="hr-form-group">
        <label class="hr-form-label">Institution <span class="hr-required">*</span></label>
        <input type="text" id="fi-institution" class="hr-form-input" value="${rec.institution || ''}" placeholder="Institution name">
      </div>
      <div class="hr-form-group">
        <label class="hr-form-label">Tel</label>
        <input type="text" id="fi-tel" class="hr-form-input" value="${rec.tel || ''}" placeholder="Phone number">
      </div>
      <div class="hr-form-group hr-form-span2">
        <label class="hr-form-label">Email</label>
        <input type="email" id="fi-email" class="hr-form-input" value="${rec.email || ''}" placeholder="Email address">
      </div>
      <div class="hr-form-group hr-form-span2">
        <label class="hr-form-label">Notes</label>
        <textarea id="fi-notes" class="hr-form-textarea" rows="3" placeholder="Additional notes...">${rec.notes || ''}</textarea>
      </div>
    </div>
    <div class="hr-form-checkboxes">
      <label class="hr-form-checkbox-label">
        <input type="checkbox" id="fi-inactive" class="hr-form-cb" ${(rec.is_inactive || rec.isInactive) ? 'checked' : ''}> Inactive?
      </label>
      <label class="hr-form-checkbox-label">
        <input type="checkbox" id="fi-default" class="hr-form-cb" ${(rec.is_default || rec.isDefault) ? 'checked' : ''}> Mark As Default?
      </label>
    </div>
  `;
}

function readFiFormValues() {
  return {
    code:        (document.getElementById('fi-code')?.value || '').trim(),
    institution: (document.getElementById('fi-institution')?.value || '').trim(),
    tel:         (document.getElementById('fi-tel')?.value || '').trim(),
    email:       (document.getElementById('fi-email')?.value || '').trim(),
    notes:       document.getElementById('fi-notes')?.value || '',
    is_inactive: document.getElementById('fi-inactive')?.checked || false,
    is_default:  document.getElementById('fi-default')?.checked || false
  };
}

// ---- Add ----
function loadPayrollFiAddView(container) {
  setActiveSidebarItem('sidebar-payroll-fi');
  openPayrollDropdowns();
  container.innerHTML = `
    <div class="fi-page">
      <div class="hr-header-row">
        <h2 class="hr-title">Add Financial Institution</h2>
        <div class="hr-breadcrumb">
          Dashboard &rsaquo; Payroll &rsaquo;
          <a href="#" class="hr-bc-link" onclick="loadPayrollFiListingView(document.getElementById('main-content'));return false;">Financial Institution</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="hr-tab-body">
        ${renderFiFormFields({})}
        <div class="hr-form-actions">
          <button class="hr-btn-form-submit" onclick="submitFiAdd()">Submit</button>
          <button class="hr-btn-form-cancel" onclick="loadPayrollFiListingView(document.getElementById('main-content'))">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitFiAdd() {
  const vals = readFiFormValues();
  if (!vals.code)        { showToast('Code is required.', 'error'); return; }
  if (!vals.institution) { showToast('Institution is required.', 'error'); return; }
  const res = await apiFetch(`${API_BASE}/payroll/utilities/financial-institutions/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vals)
  });
  if (res && res.ok) {
    showToast('Financial institution added!', 'success');
    loadPayrollFiListingView(document.getElementById('main-content'));
  } else if (res) {
    showToast(await parseApiError(res), 'error');
  }
}

// ---- Edit ----
function loadPayrollFiEditView(container, id) {
  setActiveSidebarItem('sidebar-payroll-fi');
  openPayrollDropdowns();
  const rec = financialInstitutionsData.find(r => r.id === id);
  if (!rec) { loadPayrollFiListingView(container); return; }
  container.innerHTML = `
    <div class="fi-page">
      <div class="hr-header-row">
        <h2 class="hr-title">Edit Financial Institution</h2>
        <div class="hr-breadcrumb">
          Dashboard &rsaquo; Payroll &rsaquo;
          <a href="#" class="hr-bc-link" onclick="loadPayrollFiListingView(document.getElementById('main-content'));return false;">Financial Institution</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="hr-tab-body">
        ${renderFiFormFields(rec)}
        <div class="hr-form-actions">
          <button class="hr-btn-form-submit" onclick="submitFiEdit('${id}')">Update</button>
          <button class="hr-btn-form-cancel" onclick="loadPayrollFiListingView(document.getElementById('main-content'))">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitFiEdit(id) {
  const vals = readFiFormValues();
  if (!vals.code)        { showToast('Code is required.', 'error'); return; }
  if (!vals.institution) { showToast('Institution is required.', 'error'); return; }
  const res = await apiFetch(`${API_BASE}/payroll/utilities/financial-institutions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vals)
  });
  if (res && res.ok) {
    showToast('Financial institution updated!', 'success');
    loadPayrollFiListingView(document.getElementById('main-content'));
  } else if (res) {
    showToast(await parseApiError(res), 'error');
  }
}

// ==================== PAY GRADES ====================
let payGradesData = [];
window._currentEditPayGradeId = null;

async function loadPayGradesView(container) {
  await renderSplitView({
    container,
    title: 'Pay Grades',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Payroll',view:'payroll-pay-grades'},
      {label:'Pay Grades'}
    ],
    apiUrl: `${API_BASE}/payroll/utilities/pay-grades`,
    searchFields: ['name'],
    col1Label: 'Name', col2Label: 'Base Salary',
    col1: g => g.name || '—',
    col2: g => g.base_salary != null ? String(g.base_salary) : '—',
    rowLabel: g => g.name || '—',
    rowSub:   g => g.base_salary != null ? `Base: ${g.base_salary}` : '',
    idKey: 'id',
    detailFields: [
      {label:'Name',        key:'name'},
      {label:'Base Salary', key:'base_salary', fmt:v=>v!=null?String(v):'—'},
    ],
    renderAdd: _prAddPlaceholder('Pay Grade', "loadView('payroll-pay-grades-add')", 'Add a new pay grade.'),
    onAdd:  () => loadView('payroll-pay-grades-add'),
    onEdit: item => { window._currentEditPayGradeId = item.id; loadView('payroll-pay-grades-edit'); },
  });
}

function renderPayGradesTable() {
  const el = document.getElementById('pay-grades-table-container');
  if (!el) return;
  const rows = payGradesData.length === 0
    ? `<tr><td colspan="3" class="hr-empty">No records found</td></tr>`
    : payGradesData.map((g, i) => `<tr>
        <td>${g.name || ''}</td>
        <td>${g.base_salary != null ? g.base_salary : '-'}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="togglePayGradeDropdown(event,${i})">&#8230;</button>
            <div id="pay-grade-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="payGradeEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="payGradeDelete(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  el.innerHTML = `<table class="hr-table"><thead><tr><th>NAME</th><th>BASE SALARY</th><th>ACTION</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function togglePayGradeDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="pay-grade-dd-"]').forEach(d => { if (d.id !== `pay-grade-dd-${idx}`) d.style.display = 'none'; });
  const dd = document.getElementById(`pay-grade-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="pay-grade-dd-"]').forEach(d => d.style.display = 'none');
});

function payGradeEdit(idx) {
  window._currentEditPayGradeId = payGradesData[idx].id;
  loadView('payroll-pay-grades-edit');
}

async function payGradeDelete(idx) {
  const grade = payGradesData[idx];
  if (!grade || !confirm(`Delete pay grade "${grade.name}"?`)) return;
  try {
    const res = await apiFetch(`${API_BASE}/payroll/utilities/pay-grades/${grade.id}`, { method: 'DELETE' });
    if (res && res.ok) { showToast('Pay grade deleted.', 'success'); loadPayGradesView(document.getElementById('main-content')); }
    else if (res) showToast(await parseApiError(res), 'error');
  } catch (_) { showToast('Network error.', 'error'); }
}

async function loadPayGradeFormView(container, gradeId) {
  const isEdit = !!gradeId;
  let grade = {};
  if (isEdit) {
    try {
      const res = await apiFetch(`${API_BASE}/payroll/utilities/pay-grades/${gradeId}`);
      if (res && res.ok) grade = await res.json();
    } catch (_) {}
  }
  container.innerHTML = `
    <div class="payroll-page">
      <div class="hr-header-row">
        <h2 class="hr-title">${isEdit ? 'Edit' : 'Add'} Pay Grade</h2>
        <div class="hr-breadcrumb">Dashboard &rsaquo; Payroll &rsaquo; Pay Grades &rsaquo; ${isEdit ? 'Edit' : 'Add'}</div>
      </div>
      <div class="hr-tab-body">
        <div class="hr-form-grid">
          <div class="hr-form-group">
            <label class="hr-form-label">Name <span class="hr-required">*</span></label>
            <input type="text" id="pay-grade-name" class="hr-form-input" value="${(grade.name || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}">
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Base Salary</label>
            <input type="number" id="pay-grade-base-salary" class="hr-form-input" step="0.01" min="0" value="${grade.base_salary ?? ''}">
          </div>
        </div>
        <div class="hr-form-actions">
          <button class="hr-btn-form-submit" onclick="submitPayGradeForm(${isEdit ? `'${gradeId}'` : 'null'})">${isEdit ? 'Update' : 'Submit'}</button>
          <button class="hr-btn-form-cancel" onclick="loadView('payroll-pay-grades')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitPayGradeForm(gradeId) {
  const name = (document.getElementById('pay-grade-name')?.value || '').trim();
  if (!name) { showToast('Name is required.', 'error'); return; }
  const baseSalaryRaw = document.getElementById('pay-grade-base-salary')?.value;
  const payload = {
    name,
    base_salary: baseSalaryRaw === '' ? null : parseFloat(baseSalaryRaw),
  };
  const isEdit = !!gradeId;
  try {
    const res = await apiFetch(`${API_BASE}/payroll/utilities/pay-grades/${isEdit ? gradeId : ''}`, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res && res.ok) {
      showToast(isEdit ? 'Pay grade updated!' : 'Pay grade created!', 'success');
      window._currentEditPayGradeId = null;
      loadView('payroll-pay-grades');
    } else if (res) {
      showToast(await parseApiError(res), 'error');
    }
  } catch (_) { showToast('Network error.', 'error'); }
}

// ==================== PAYROLL RUNS ====================
// New run-based payroll lifecycle: draft → calculated → approved →
// awaiting_payment → paid → payslips_generated. Payment happens exclusively
// through the Tendepay import (js/finance.js) once a voucher is created here.
let _prRuns = [];
let _prSelectedRunId = null;
let _prPollTimer = null;
let _prPollInFlight = false;

const _PR_MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const _PR_STATUS_COLORS = {
  draft: '#888;background:#eee',
  calculated: '#1B3057;background:#dde3ec',
  approved: '#8a6d00;background:#f5e6a8',
  awaiting_payment: '#9a7d0a;background:#fdf3d0',
  paid: '#1e7e34;background:#dcf3e2',
  payslips_generated: '#0f766e;background:#d3f3ef',
};
function _prBadge(status) {
  const c = _PR_STATUS_COLORS[status] || '#888;background:#eee';
  const [color, bg] = c.split(';background:');
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${color};background:${bg};">${_finEsc((status || '').replace(/_/g, ' '))}</span>`;
}

async function loadPayrollRunsView(container) {
  await _pvLoadLookups();
  _prStopPolling();
  await _prLoadRuns();
  _prRenderShell(container);
}

async function _prLoadRuns() {
  const res = await apiFetch(`${API_BASE}/payroll/runs/`);
  _prRuns = res && res.ok ? _toArray(await res.json()) : [];
}

function _prRenderShell(container) {
  container.innerHTML = `
    ${renderBreadcrumb([{label:'Dashboard',view:null},{label:'Payroll',view:'payroll-runs'},{label:'Payroll Runs'}])}
    <div class="split-layout">
      <div class="split-left">
        <div class="split-left-header">
          <span class="split-left-title">Payroll Runs</span>
          <span class="split-left-count">${_prRuns.length}</span>
        </div>
        <div class="split-left-col-headers"><span>Run</span><span>Status</span></div>
        <div class="split-list" id="pr-list-items"></div>
      </div>
      <div class="split-right" id="pr-right-panel"></div>
    </div>`;
  _prRenderList();
  if (_prSelectedRunId && _prRuns.some(r => String(r.id) === String(_prSelectedRunId))) _prSelectRun(_prSelectedRunId);
  else _prRenderAddForm();
}

function _prRenderList() {
  const el = document.getElementById('pr-list-items');
  if (!el) return;
  el.innerHTML = _prRuns.map(r => `
    <div class="split-list-row${String(_prSelectedRunId) === String(r.id) ? ' active' : ''}" onclick="_prSelectRun(${r.id})">
      <div class="split-col1">${_finEsc(r.run_number)}</div>
      <div class="split-col2">${_prBadge(r.status)}</div>
    </div>`).join('') || `<p style="padding:24px;text-align:center;color:var(--grey-400);font-style:italic;font-size:13px">No records found</p>`;
}

function _prRenderAddForm() {
  _prSelectedRunId = null;
  _prStopPolling();
  _prRenderList();
  const right = document.getElementById('pr-right-panel');
  right.className = 'split-right-add';
  right.innerHTML = `
    <div class="fin-form-wrap">
      <h3 class="fin-title" style="font-size:1.1rem;">Add Payroll Run</h3>
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Period Month <span class="fin-required">*</span></label>
          <select id="pr-add-month" class="fin-form-select">
            <option value="">Please Select</option>
            ${_PR_MONTHS.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Period Year <span class="fin-required">*</span></label>
          <input type="number" id="pr-add-year" class="fin-form-input" value="${new Date().getFullYear()}" min="2020" max="2100">
        </div>
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_prCreateRun()">Create Run</button>
      </div>
    </div>`;
}

async function _prCreateRun() {
  const month = parseInt(document.getElementById('pr-add-month').value, 10);
  const year = parseInt(document.getElementById('pr-add-year').value, 10);
  if (!month || !year) { showToast('Period Month and Period Year are required.', 'error'); return; }
  const res = await apiFetch(`${API_BASE}/payroll/runs/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period_month: month, period_year: year }) });
  if (res && res.ok) {
    const run = await res.json();
    showToast('Payroll run created.', 'success');
    await _prLoadRuns();
    await _prSelectRun(run.id);
  } else if (res && res.status === 409) {
    showToast('A payroll run already exists for that period.', 'error');
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function _prSelectRun(runId) {
  _prSelectedRunId = runId;
  _prStopPolling();
  _prRenderList();
  const right = document.getElementById('pr-right-panel');
  right.className = 'split-right-detail';
  right.innerHTML = '<p class="sa-loading">Loading&#8230;</p>';
  const res = await apiFetch(`${API_BASE}/payroll/runs/${runId}`);
  if (!res || !res.ok) { right.innerHTML = `<p class="fin-error-msg">Could not load payroll run.</p>`; return; }
  const run = await res.json();
  _prRenderDetail(right, run);
}

function _prRenderDetail(right, run) {
  const lines = run.lines || [];
  right.innerHTML = `
    <div style="background:var(--navy-700,#1B3057);color:#fff;border-radius:8px;padding:18px 22px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:24px;align-items:center;">
      <div>
        <div style="font-size:1.15rem;font-weight:700;">${_finEsc(run.run_number)}</div>
        <div style="opacity:0.85;font-size:0.85rem;">${_PR_MONTHS[run.period_month] || ''} ${run.period_year} &middot; ${_prBadge(run.status)}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:24px;">
        <div><div style="opacity:0.7;font-size:0.75rem;">GROSS</div><div style="font-weight:700;">${_pvMoney(run.total_gross)}</div></div>
        <div><div style="opacity:0.7;font-size:0.75rem;">DEDUCTIONS</div><div style="font-weight:700;">${_pvMoney(run.total_deductions)}</div></div>
        <div><div style="opacity:0.7;font-size:0.75rem;">NET</div><div style="font-weight:700;">${_pvMoney(run.total_net)}</div></div>
      </div>
    </div>
    <div id="pr-action-row" style="margin-bottom:16px;"></div>
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Employee Code</th><th>Basic Salary</th><th>Gross Pay</th><th>NSSF</th><th>SHIF</th><th>PAYE</th><th>Housing Levy</th><th>Total Deductions</th><th>Net Pay</th></tr></thead>
      <tbody>
        ${lines.length ? lines.map(l => `<tr>
          <td>${_finEsc(l.employee_code)}</td>
          <td>${_pvMoney(l.basic_salary)}</td>
          <td>${_pvMoney(l.gross_pay)}</td>
          <td>${_pvMoney(l.nssf_employee)}</td>
          <td>${_pvMoney(l.shif_employee)}</td>
          <td>${_pvMoney(l.paye)}</td>
          <td>${_pvMoney(l.housing_levy_employee)}</td>
          <td>${_pvMoney(l.total_deductions)}</td>
          <td>${_pvMoney(l.net_pay)}</td>
        </tr>`).join('') : `<tr><td colspan="9" class="fin-empty">No lines yet &mdash; run Calculate first.</td></tr>`}
      </tbody>
    </table></div>
    <div id="pr-payslips-panel" style="margin-top:20px;"></div>`;
  document.getElementById('pr-action-row').innerHTML = _prActionsHtml(run);
  if (run.status === 'paid' || run.status === 'payslips_generated') {
    _prRenderPayslipsPanel(document.getElementById('pr-payslips-panel'), run);
  }
}

function _prActionsHtml(run) {
  let html = '';
  if (run.status === 'draft') {
    html += `<button class="btn" onclick="_prCalculate(${run.id})">Calculate</button>`;
  } else if (run.status === 'calculated') {
    html += `<button class="btn" onclick="_prApprove(${run.id})">Approve</button>`;
  } else if (run.status === 'approved') {
    html += `<button class="btn" onclick="_prOpenCreateVoucherModal(${run.id})">Create Payment Voucher</button>`;
  } else if (run.status === 'awaiting_payment') {
    html += `<div style="color:#666;font-size:0.9rem;">Awaiting Tendepay settlement. The run will move to Paid automatically once the payroll voucher is confirmed in a Tendepay import.</div>`;
  }
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">${html}</div>`;
}

async function _prCalculate(runId) {
  const res = await apiFetch(`${API_BASE}/payroll/runs/${runId}/calculate`, { method: 'POST' });
  if (res && res.ok) { showToast('Statutory deductions calculated.', 'success'); await _prLoadRuns(); await _prSelectRun(runId); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
async function _prApprove(runId) {
  const res = await apiFetch(`${API_BASE}/payroll/runs/${runId}/approve`, { method: 'POST' });
  if (res && res.ok) { showToast('Payroll run approved.', 'success'); await _prLoadRuns(); await _prSelectRun(runId); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

function _prOpenCreateVoucherModal(runId) {
  const wrap = document.createElement('div');
  wrap.id = 'pr-cv-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:auto;padding:24px;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:600px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Create Payment Voucher</h3>
      <div class="fin-form-grid-2">
        <div class="fin-form-group"><label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
          <select id="pr-cv-ledger" class="fin-form-select"><option value="">Please Select</option>${_pvLedgerOptions(null)}</select></div>
        <div class="fin-form-group"><label class="fin-form-label">Cost Center <span class="fin-required">*</span></label>
          <select id="pr-cv-cost-center" class="fin-form-select"><option value="">Please Select</option>${_pvCostCenterOptions(null)}</select></div>
        <div class="fin-form-group"><label class="fin-form-label">Department <span class="fin-required">*</span></label>
          <select id="pr-cv-department" class="fin-form-select"><option value="">Please Select</option>${_pvDepartmentOptions(null)}</select></div>
        <div class="fin-form-group"><label class="fin-form-label">Debit Account <span class="fin-required">*</span></label>
          <select id="pr-cv-debit" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions(null)}</select></div>
        <div class="fin-form-group"><label class="fin-form-label">Tendepay Wallet <span class="fin-required">*</span></label>
          <select id="pr-cv-wallet" class="fin-form-select"><option value="">Please Select</option>${_pvTendepayWalletOptions(null)}</select></div>
      </div>
      <div class="fin-form-group"><label class="fin-form-label">Description</label><textarea id="pr-cv-description" class="fin-form-textarea" rows="2"></textarea></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('pr-cv-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" onclick="_prSubmitCreateVoucher(${runId})">Create</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _prSubmitCreateVoucher(runId) {
  const ledgerId = parseInt(document.getElementById('pr-cv-ledger').value, 10);
  const costCenterId = parseInt(document.getElementById('pr-cv-cost-center').value, 10);
  const departmentId = parseInt(document.getElementById('pr-cv-department').value, 10);
  const debitAccountId = parseInt(document.getElementById('pr-cv-debit').value, 10);
  const walletId = parseInt(document.getElementById('pr-cv-wallet').value, 10);
  const description = document.getElementById('pr-cv-description').value.trim() || null;
  if (!ledgerId || !costCenterId || !departmentId || !debitAccountId || !walletId) {
    showToast('Ledger, Cost Center, Department, Debit Account and Tendepay Wallet are all required.', 'error');
    return;
  }
  const res = await apiFetch(`${API_BASE}/payroll/runs/${runId}/create-voucher`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ledger_id: ledgerId, cost_center_id: costCenterId, department_id: departmentId, tendepay_wallet_account_id: walletId, debit_account_id: debitAccountId, description }),
  });
  if (res && res.ok) {
    document.getElementById('pr-cv-modal-overlay')?.remove();
    showToast('Payment voucher created. Settle it via Tendepay Import to complete payroll.', 'success');
    await _prLoadRuns();
    await _prSelectRun(runId);
  } else if (res && res.status === 409) {
    showToast('A payment voucher already exists for this run.', 'error');
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ── Payslips (run-based) ─────────────────────────────────────────────────────
const _PR_PAYSLIP_COLORS = {
  pending_generation: '#9a7d0a;background:#fdf3d0',
  generated: '#1a5fb4;background:#dce8fb',
  queued: '#9a7d0a;background:#fdf3d0',
  sent: '#1e7e34;background:#dcf3e2',
  send_failed: '#c0392b;background:#fde0de',
  email_missing: '#c0392b;background:#fde0de',
};
function _prPayslipBadge(status) {
  const c = _PR_PAYSLIP_COLORS[status] || '#888;background:#eee';
  const [color, bg] = c.split(';background:');
  const label = status === 'pending_generation' ? 'Generating…' : (status || '').replace(/_/g, ' ');
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${color};background:${bg};">${_finEsc(label)}</span>`;
}

function _prRenderPayslipsPanel(el, run) {
  el.innerHTML = `
    <div class="fin-section-label">Payslips</div>
    <div style="display:flex;gap:10px;margin-bottom:12px;">
      <button class="btn" onclick="_prGeneratePayslips(${run.id})">Generate Payslips</button>
      <button class="btn" id="pr-bulk-send-btn" disabled onclick="_prBulkSend(${run.id})">Send Bulk</button>
    </div>
    <div id="pr-payslips-table"></div>`;
  _prRefreshDeliveryReport(run.id);
}

async function _prGeneratePayslips(runId) {
  const res = await apiFetch(`${API_BASE}/payroll/payslips/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payroll_run_id: runId }) });
  if (res && res.ok) {
    showToast('Payslip generation started.', 'success');
    _prStartPolling(runId);
    await _prRefreshDeliveryReport(runId);
  } else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// Idempotency-aware polling: a single named interval, guarded by an in-flight
// flag so overlapping delivery-report requests never stack, and stopped as
// soon as every payslip reaches a terminal state (or the user navigates away).
function _prStartPolling(runId) {
  _prStopPolling();
  _prPollTimer = setInterval(() => _prRefreshDeliveryReport(runId), 3000);
}
function _prStopPolling() {
  if (_prPollTimer) { clearInterval(_prPollTimer); _prPollTimer = null; }
  _prPollInFlight = false;
}

async function _prRefreshDeliveryReport(runId) {
  if (_prPollInFlight) return;
  _prPollInFlight = true;
  try {
    const res = await apiFetch(`${API_BASE}/payroll/payslips/delivery-report?run_id=${runId}`);
    if (!res || !res.ok) return;
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data.items || data.data || data.results || []);
    _prRenderPayslipsTable(rows, runId);
    const allTerminal = rows.length > 0 && rows.every(r => r.status !== 'pending_generation');
    const bulkBtn = document.getElementById('pr-bulk-send-btn');
    if (bulkBtn) bulkBtn.disabled = !allTerminal;
    if (allTerminal) _prStopPolling();
    else if (!_prPollTimer) _prStartPolling(runId);
  } finally {
    _prPollInFlight = false;
  }
}

function _prRenderPayslipsTable(rows, runId) {
  const el = document.getElementById('pr-payslips-table');
  if (!el) return;
  el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Payslip #</th><th>Employee Code</th><th>Status</th><th>Recipient Email</th><th>Attempts</th><th>Last Error</th><th>Action</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(r => `<tr>
          <td>${_finEsc(r.payslip_number || '')}</td>
          <td>${_finEsc(r.employee_code || '')}</td>
          <td>${_prPayslipBadge(r.status)}</td>
          <td>${_finEsc(r.recipient_email || (r.status === 'email_missing' ? 'No email on file' : '—'))}</td>
          <td>${r.send_attempts ?? 0}</td>
          <td>${_finEsc(r.last_error || '—')}</td>
          <td>${r.id ? `
            <button class="fin-btn-outline" onclick="_prDownloadPayslip(${r.id})">Download</button>
            <button class="fin-btn-outline" onclick="_prResendPayslip(${r.id}, ${runId})">Resend</button>` : ''}
          </td>
        </tr>`).join('') : `<tr><td colspan="7" class="fin-empty">No payslips yet.</td></tr>`}
      </tbody>
    </table></div>`;
}

// Never link pdf_path directly (server filesystem path) — always fetch the
// PDF through the authenticated /download endpoint and open it as a blob.
async function _prDownloadPayslip(payslipId) {
  const res = await apiFetch(`${API_BASE}/payroll/payslips/${payslipId}/download`);
  if (res && res.ok) {
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  } else if (res) showToast('Could not download payslip: ' + await parseApiError(res), 'error');
}

async function _prResendPayslip(payslipId, runId) {
  const res = await apiFetch(`${API_BASE}/payroll/payslips/${payslipId}/send`, { method: 'POST' });
  if (res && res.ok) { showToast('Payslip resent.', 'success'); await _prRefreshDeliveryReport(runId); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

async function _prBulkSend(runId) {
  const res = await apiFetch(`${API_BASE}/payroll/payslips/send-bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payroll_run_id: runId, resend: false }) });
  if (res && res.ok) {
    const data = await res.json();
    showToast(`Queued ${data.queued}, sent ${data.sent}, failed ${data.failed}.`, data.failed > 0 ? 'error' : 'success');
    if (data.email_missing && data.email_missing.length) {
      showToast(`${data.email_missing.length} employees have no email on file — update in HR, then use Resend.`, 'error');
    }
    if (data.errors && data.errors.length) {
      showToast(`${data.errors.length} send error(s) occurred — see delivery report for details.`, 'error');
    }
    await _prRefreshDeliveryReport(runId);
  } else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ── Payslips (standalone, cross-run) ─────────────────────────────────────────
// Payroll Runs' own detail page only shows payslips for that one run — this
// view is the "look up an individual's already-generated payslips" module
// requested separately, backed by the bare GET /payroll/payslips (not scoped
// to a run, unlike delivery-report). Payslip rows only exist once a run has
// reached paid/payslips_generated, so an empty result here just means no
// payrun has completed yet, not a bug.
async function loadPayrollPayslipsView(container) {
  await renderSplitView({
    container,
    title: 'Payslips',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Payroll',view:'payroll-payslips'},
      {label:'Payslips'}
    ],
    apiUrl: `${API_BASE}/payroll/payslips`,
    searchFields: ['employee_code','payslip_number'],
    col1Label: 'Payslip #', col2Label: 'Employee',
    col1: p => p.payslip_number || `#${p.id}`,
    col2: p => `${p.employee_code || '—'} · ${_prMonthName(p.period_month)} ${p.period_year || ''}`,
    rowLabel: p => p.payslip_number || `#${p.id}`,
    rowSub:   p => `${p.employee_code || '—'} · ${_prMonthName(p.period_month)} ${p.period_year || ''}`,
    idKey: 'id',
    detailFields: [
      {label:'Payslip #',      key:'payslip_number', fmt:v=>v||'—'},
      {label:'Employee Code',  key:'employee_code', fmt:v=>v||'—'},
      {label:'Period',         key:'period_month', fmt:(v,p)=>`${_prMonthName(v)} ${p.period_year||''}`},
      {label:'Status',         key:'status', fmt:v=>_prPayslipBadge(v)},
      {label:'Recipient Email',key:'recipient_email', fmt:(v,p)=>v||(p.status==='email_missing'?'No email on file':'—')},
      {label:'Send Attempts',  key:'send_attempts', fmt:v=>v??0},
      {label:'Last Error',     key:'last_error', fmt:v=>v||'—'},
      {label:'Payroll Run',    key:'payroll_run_id', fmt:v=>v?`#${v}`:'—'},
    ],
    detailActions: item => `
      <button class="btn" onclick="_prDownloadPayslip(${item.id})">Download</button>
      <button class="btn" onclick="_prpResendPayslip(${item.id})">Resend</button>`,
    renderAdd: _prInfoPlaceholder('Payslips are generated from a Payroll Run once it is paid — open Payroll Runs to generate them.', "loadView('payroll-runs')", 'Go to Payroll Runs'),
    onAdd: () => {
      showToast('Payslips are generated from a Payroll Run once it is paid — open Payroll Runs to generate them.', 'info');
      loadView('payroll-runs');
    },
  });
}

function _prMonthName(m) {
  const names = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[m] || (m || '');
}

async function _prpResendPayslip(payslipId) {
  const res = await apiFetch(`${API_BASE}/payroll/payslips/${payslipId}/send`, { method: 'POST' });
  if (res && res.ok) { showToast('Payslip resent.', 'success'); window._splitRefreshSelected && window._splitRefreshSelected(); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
