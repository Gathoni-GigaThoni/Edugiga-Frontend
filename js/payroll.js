// ==================== PAYROLL MODULE ====================
let payrollEspPage = 1;
let payrollEspPerPage = 10;
let payrollEspFiltered = [];

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="payroll-esp-dd-"],[id^="fi-dd-"]').forEach(d => d.style.display = 'none');
});

async function loadPayrollEspListingView(container) {
  await renderSplitView({
    container,
    title: 'Employee Service Profiles',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Payroll',view:'payroll-esp'},
      {label:'Service Profiles'}
    ],
    apiUrl: `${API_BASE}/employee-service-profiles/`,
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
    apiUrl: `${API_BASE}/payroll/financial-institutions/`,
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
  try {
    await fetch(`${API_BASE}/payroll/financial-institutions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(rec)
    });
  } catch (_) {}
}

async function deleteFi(id) {
  if (!confirm('Delete this financial institution?')) return;
  try {
    const res = await fetch(`${API_BASE}/payroll/financial-institutions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) { showToast('Could not delete record.', 'error'); return; }
  } catch (_) { showToast('Network error.', 'error'); return; }
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
  try {
    const res = await fetch(`${API_BASE}/payroll/financial-institutions/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(vals)
    });
    if (res.ok) {
      showToast('Financial institution added!', 'success');
      loadPayrollFiListingView(document.getElementById('main-content'));
    } else {
      showToast(await parseApiError(res), 'error');
    }
  } catch (_) { showToast('Network error. Please try again.', 'error'); }
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
  try {
    const res = await fetch(`${API_BASE}/payroll/financial-institutions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(vals)
    });
    if (res.ok) {
      showToast('Financial institution updated!', 'success');
      loadPayrollFiListingView(document.getElementById('main-content'));
    } else {
      showToast(await parseApiError(res), 'error');
    }
  } catch (_) { showToast('Network error. Please try again.', 'error'); }
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
