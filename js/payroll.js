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

function _prEspDepartment(sp) {
  const emp = employeesData.find(e => e.employee_code === sp.employee_code);
  return emp ? departmentLabelFor(emp.department_id) : '—';
}

async function loadPayrollEspListingView(container) {
  await ensureDepartmentCache();
  await ensurePayGradeCache();
  await renderSplitView({
    container,
    moduleKey: 'payroll.employee_service_profiles',
    title: 'Employee Service Profiles',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Payroll',view:'payroll-esp'},
      {label:'Service Profiles'}
    ],
    apiUrl: `${API_BASE}/payroll/employee-service-profiles/`,
    searchFields: ['employee_name','employee_code'],
    col1Label: 'Employee', col2Label: 'Department',
    col1: sp => sp.employee_name || '—',
    col2: sp => _prEspDepartment(sp) !== '—' ? _prEspDepartment(sp) : (sp.employee_code || '—'),
    rowLabel: sp => sp.employee_name || '—',
    rowSub:   sp => sp.employee_code || '',
    idKey: 'id',
    detailFields: [
      {label:'Employee',    key:'employee_name', fmt:v=>v||'—'},
      {label:'Emp Code',    key:'employee_code', fmt:v=>v||'—'},
      {label:'Department',  key:'employee_code', fmt:(_,sp)=>_prEspDepartment(sp)},
      {label:'Pay Grade',   key:'pay_grade_id', fmt:v=>payGradeLabelFor(v)},
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
    moduleKey: 'payroll.utilities.financial_institutions',
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
// Natural key is (position, effective_from) — the same position may hold
// several time-slotted grades (BE/FE Contract 2026-07-15 §2).
function _pgBadge(isActive) {
  return isActive ? '' : `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#888;background:#eee;margin-left:6px;">Retired</span>`;
}
function _pgRange(g) {
  return `${g.effective_from || '—'} &rarr; ${g.effective_to || 'open'}`;
}

async function loadPayGradesView(container) {
  container.innerHTML = `
    <div class="fin-filter-section">
      <div class="fin-filter-grid">
        <div class="fin-filter-field"><label class="fin-filter-label">Position</label><input type="text" id="pg-f-position" class="fin-filter-input" placeholder="e.g. Assistant Teacher"></div>
        <div class="fin-filter-field" style="display:flex;align-items:flex-end;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="pg-f-active-only" checked style="width:auto;"> Active only</label>
        </div>
      </div>
      <div class="fin-filter-actions"><button class="fin-btn-teal" onclick="_pgReload()">Filter</button></div>
    </div>
    <div id="pg-split"></div>`;
  await _pgReload();
}

async function _pgReload() {
  const position = (document.getElementById('pg-f-position')?.value || '').trim();
  const activeOnly = document.getElementById('pg-f-active-only')?.checked ?? true;
  const params = new URLSearchParams();
  if (position) params.set('position', position);
  if (activeOnly) params.set('active_only', 'true');

  await renderSplitView({
    container: document.getElementById('pg-split'),
    moduleKey: 'payroll.utilities.pay_grades',
    title: 'Pay Grades',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Human Resource',view:null},
      {label:'Utilities',view:null},
      {label:'Pay Grades'}
    ],
    apiUrl: `${API_BASE}/payroll/utilities/pay-grades/${params.toString() ? '?' + params.toString() : ''}`,
    searchFields: ['position', 'name'],
    col1Label: 'Position', col2Label: 'Amount',
    col1: g => `${g.position || '—'}${_pgBadge(g.is_active)}`,
    col2: g => formatKES(g.amount),
    rowLabel: g => g.position || '—',
    rowSub:   g => g.name || _pgRange(g),
    idKey: 'id',
    detailFields: [
      {label:'Position',        key:'position'},
      {label:'Name',            key:'name', fmt:v=>v||'—'},
      {label:'Effective From',  key:'effective_from'},
      {label:'Effective To',    key:'effective_to', fmt:v=>v||'—'},
      {label:'Amount',          key:'amount', fmt:v=>formatKES(v)},
      {label:'Status',          key:'is_active', fmt:v=>v?'Active':'Retired'},
    ],
    renderAdd:  el => _pgSplitForm(null, el),
    renderEdit: (item, el) => _pgSplitForm(item, el),
    detailActions: item => `
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${item.is_active ? `<button class="btn" onclick="_pgRetire(${item.id})">Retire</button>` : ''}
        <button class="btn-danger" onclick="_pgDelete(${item.id})">Delete</button>
      </div>
      <div id="pg-action-error" style="margin-top:12px;"></div>
    `,
  });
}

function _pgSplitForm(item, el) {
  const id = item?.id ?? null;
  const isEdit = !!item;
  el.innerHTML = `
    <div style="max-width:480px">
      <h3 class="split-right-add-title">${isEdit ? 'Edit' : 'Add'} Pay Grade</h3>
      <div class="stu-form-grid" style="grid-template-columns:1fr 1fr;gap:14px 20px">
        <div class="stu-form-group" style="grid-column:span 2">
          <label>Position <span style="color:var(--coral-500)">*</span></label>
          <input id="pg-f-pos" value="${_finEsc(item?.position || '')}" style="max-width:none;width:100%">
        </div>
        <div class="stu-form-group">
          <label>Effective From <span style="color:var(--coral-500)">*</span></label>
          <input id="pg-f-eff-from" type="date" value="${item?.effective_from || ''}" style="max-width:none;width:100%">
        </div>
        <div class="stu-form-group">
          <label>Effective To</label>
          <input id="pg-f-eff-to" type="date" value="${item?.effective_to || ''}" style="max-width:none;width:100%">
          <span style="font-size:12px;color:var(--grey-600)">Leave blank for open-ended.</span>
        </div>
        <div class="stu-form-group">
          <label>Amount <span style="color:var(--coral-500)">*</span></label>
          <input id="pg-f-amount" type="number" step="0.01" min="0" value="${item?.amount ?? ''}" style="max-width:none;width:100%">
        </div>
        <div class="stu-form-group">
          <label>Name</label>
          <input id="pg-f-name" value="${_finEsc(item?.name || '')}" style="max-width:none;width:100%">
          <span style="font-size:12px;color:var(--grey-600)">Optional label. Does not need to be unique.</span>
        </div>
        <div class="stu-form-group" style="grid-column:span 2">
          <label><input type="checkbox" id="pg-f-active" style="width:auto;margin:0 6px 0 0;padding:0"${(item ? item.is_active : true) ? ' checked' : ''}> Active</label>
        </div>
      </div>
      <div id="pg-split-status" style="margin-top:10px;font-size:13px;color:var(--coral-500)"></div>
      <div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn-primary" style="padding:9px 20px" onclick="_pgSaveSplit(${id ?? 'null'})">${isEdit ? 'Update' : 'Save'}</button>
        <button class="btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>
  `;
}

async function _pgSaveSplit(id) {
  const statusEl = document.getElementById('pg-split-status');
  const position = (document.getElementById('pg-f-pos')?.value || '').trim();
  const effectiveFrom = document.getElementById('pg-f-eff-from')?.value || '';
  const effectiveTo = document.getElementById('pg-f-eff-to')?.value || '';
  const amountRaw = document.getElementById('pg-f-amount')?.value;
  const name = (document.getElementById('pg-f-name')?.value || '').trim();
  const isActive = document.getElementById('pg-f-active')?.checked ?? true;

  if (!position || !effectiveFrom || amountRaw === '') {
    if (statusEl) statusEl.textContent = 'Position, Effective From, and Amount are required.';
    return;
  }
  const payload = {
    position,
    effective_from: effectiveFrom,
    effective_to: effectiveTo || null,
    amount: parseFloat(amountRaw),
    name: name || null,
    is_active: isActive,
  };
  const res = await apiFetch(
    id ? `${API_BASE}/payroll/utilities/pay-grades/${id}` : `${API_BASE}/payroll/utilities/pay-grades/`,
    { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
  if (res && res.ok) {
    showToast(id ? 'Pay grade updated!' : 'Pay grade created!', 'success');
    loadView('hr-utilities-pay-grades');
  } else {
    if (statusEl) statusEl.textContent = res ? await parseApiError(res) : 'Save failed.';
  }
}

async function _pgRetire(id) {
  const res = await apiFetch(`${API_BASE}/payroll/utilities/pay-grades/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }),
  });
  if (res && res.ok) {
    showToast('Pay grade retired. Existing service profiles keep their reference.', 'success');
    window._splitRefreshSelected?.();
  } else if (res) {
    showToast(await parseApiError(res), 'error');
  }
}

async function _pgDelete(id) {
  if (!confirm('Delete this pay grade? This cannot be undone.')) return;
  const errEl = document.getElementById('pg-action-error');
  const res = await apiFetch(`${API_BASE}/payroll/utilities/pay-grades/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    showToast('Pay grade deleted.', 'success');
    window._splitReload?.();
  } else if (res && res.status === 409) {
    const msg = await parseApiError(res);
    if (errEl) errEl.innerHTML = `
      <div style="background:var(--coral-100);color:var(--coral-600);padding:12px 14px;border-radius:8px;font-size:13px;">
        ${_finEsc(msg)}
        <div style="margin-top:10px;"><button class="btn" onclick="_pgRetire(${id})">Retire instead</button></div>
      </div>`;
  } else if (res) {
    showToast(await parseApiError(res), 'error');
  }
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
  if (String(_prSelectedRunId) !== String(runId)) _prDetailTab = 'lines';
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

let _prCurrentRun = null;
let _prDetailTab = 'lines';

function _prRenderDetail(right, run) {
  _prCurrentRun = run;
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
    <div id="pr-export-error" style="margin-bottom:16px;"></div>
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button onclick="_prSwitchDetailTab('lines')" style="padding:6px 14px;border-radius:14px;border:none;cursor:pointer;font-size:0.85rem;${_prDetailTab==='lines'?'background:var(--navy-700,#1B3057);color:#fff;font-weight:600;':'background:#eee;color:#888;'}">Lines</button>
      <button onclick="_prSwitchDetailTab('reconciliation')" style="padding:6px 14px;border-radius:14px;border:none;cursor:pointer;font-size:0.85rem;${_prDetailTab==='reconciliation'?'background:var(--navy-700,#1B3057);color:#fff;font-weight:600;':'background:#eee;color:#888;'}">Payment Reconciliation</button>
    </div>
    <div id="pr-detail-tab-body"></div>`;
  document.getElementById('pr-action-row').innerHTML = _prActionsHtml(run);
  _prRenderDetailTabBody();
}

function _prSwitchDetailTab(tab) {
  _prDetailTab = tab;
  const right = document.getElementById('pr-right-panel');
  if (right && _prCurrentRun) _prRenderDetail(right, _prCurrentRun);
}

function _prRenderDetailTabBody() {
  const el = document.getElementById('pr-detail-tab-body');
  if (!el || !_prCurrentRun) return;
  if (_prDetailTab === 'reconciliation') _prRenderReconciliationTab(el, _prCurrentRun);
  else _prRenderLinesTab(el, _prCurrentRun);
}

function _prPaymentStatusBadge(status) {
  const colors = { pending: '#888;background:#eee', paid: '#1e7e34;background:#dcf3e2', failed: '#c0392b;background:#fde0de' };
  const c = colors[status] || colors.pending;
  const [color, bg] = c.split(';background:');
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${color};background:${bg};">${_finEsc(status || 'pending')}</span>`;
}

function _prRenderLinesTab(el, run) {
  const lines = run.lines || [];
  el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Employee Code</th><th>Basic Salary</th><th>Gross Pay</th><th>NSSF</th><th>SHIF</th><th>PAYE</th><th>Housing Levy</th><th>Total Deductions</th><th>Net Pay</th><th>Payment Status</th><th>Tendepay Ref</th><th>Receipt</th><th>Paid At</th><th>Failure Reason</th></tr></thead>
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
          <td>${_prPaymentStatusBadge(l.payment_status)}</td>
          <td>${_finEsc(l.tendepay_reference || '—')}</td>
          <td>${_finEsc(l.gateway_receipt || '—')}</td>
          <td>${l.paid_at ? _pvDate(l.paid_at) : '—'}</td>
          <td>${l.payment_status === 'failed' ? `<span style="color:#c0392b;">${_finEsc(l.failure_reason || '—')}</span>` : ''}</td>
        </tr>`).join('') : `<tr><td colspan="14" class="fin-empty">No lines yet &mdash; run Calculate first.</td></tr>`}
      </tbody>
    </table></div>
    <div id="pr-payslips-panel" style="margin-top:20px;"></div>`;
  if (run.status === 'paid' || run.status === 'payslips_generated') {
    _prRenderPayslipsPanel(document.getElementById('pr-payslips-panel'), run);
  }
}

function _prReconStatCard(label, value, bg, fg) {
  return `<div style="flex:1;min-width:140px;background:${bg};color:${fg};border-radius:8px;padding:14px 16px;">
    <div style="font-size:0.75rem;opacity:0.8;">${label}</div>
    <div style="font-size:1.15rem;font-weight:700;">${value}</div>
  </div>`;
}

// Read-only accountant view: who got paid, who didn't, and why (§10.3).
async function _prRenderReconciliationTab(el, run) {
  el.innerHTML = '<p class="sa-loading">Loading&#8230;</p>';
  const res = await apiFetch(`${API_BASE}/payroll/runs/${run.id}/payment-reconciliation`);
  if (!res || !res.ok) { el.innerHTML = `<p class="fin-error-msg">Could not load payment reconciliation.</p>`; return; }
  const data = await res.json();
  const lines = data.lines || [];
  const strip = `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px;">
      ${_prReconStatCard('Expected Total', _pvMoney(data.expected_total), 'var(--navy-700,#1B3057)', '#fff')}
      ${_prReconStatCard('Paid Total', _pvMoney(data.paid_total), '#f5e6a8', '#8a6d00')}
      ${_prReconStatCard('Paid', data.paid_line_count ?? 0, '#dcf3e2', '#1e7e34')}
      ${_prReconStatCard('Pending', data.pending_line_count ?? 0, '#eee', '#888')}
      ${_prReconStatCard('Failed', data.failed_line_count ?? 0, '#fde0de', '#c0392b')}
    </div>`;
  const rows = lines.map(l => `<tr>
    <td>${_finEsc(l.employee_code || '')}</td>
    <td>${_finEsc(l.employee_name || '')}</td>
    <td>${_pvMoney(l.expected_net)}</td>
    <td>${_prPaymentStatusBadge(l.payment_status)}</td>
    <td>${_finEsc(l.tendepay_reference || '—')}</td>
    <td>${_finEsc(l.gateway_receipt || '—')}</td>
    <td>${l.paid_at ? _pvDate(l.paid_at) : '—'}</td>
    <td>${l.payment_status === 'failed' ? `<span style="color:#c0392b;">${_finEsc(l.failure_reason || '—')}</span>` : '—'}</td>
  </tr>`).join('');
  const retryBtn = data.failed_line_count > 0
    ? `<div style="margin-top:14px;"><button class="btn" onclick="_prRetryExport(${run.id})">Retry export (unpaid only)</button></div>` : '';
  el.innerHTML = `
    ${strip}
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>Employee Code</th><th>Employee Name</th><th>Expected Net</th><th>Payment Status</th><th>Tendepay Ref</th><th>Receipt</th><th>Paid At</th><th>Failure Reason</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="fin-empty">No lines.</td></tr>'}</tbody>
    </table></div>
    ${retryBtn}`;
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
  if (['approved', 'awaiting_payment', 'paid', 'payslips_generated'].includes(run.status)) {
    html += `
      <select id="pr-export-format-${run.id}" class="fin-form-select" style="width:auto;">
        <option value="xlsx">XLSX</option><option value="csv">CSV</option>
      </select>
      <button class="btn" onclick="_prExportTendepay(${run.id})">Export to Tendepay</button>`;
  }
  if ((run.failed_line_count > 0) || (run.pending_line_count > 0)) {
    html += `<button class="btn" onclick="_prRetryExport(${run.id})">Retry export (unpaid only)</button>`;
  }
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">${html}</div>`;
}

// Authenticated blob download — the export/retry-export endpoints require
// auth and stream a file, so a plain <a href> would send no Authorization
// header and 401 (§11.5).
async function _prDownloadRunFile(url, runId) {
  const res = await apiFetch(url);
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (body && body.detail && typeof body.detail === 'object' && Array.isArray(body.detail.affected)) {
      _prShowExportFixList(body.detail);
      return;
    }
    const detail = body && body.detail;
    const msg = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : `HTTP ${res.status}`);
    showToast('Export failed: ' + msg, 'error');
    return;
  }
  const errEl = document.getElementById('pr-export-error');
  if (errEl) errEl.innerHTML = '';
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const filename = match ? decodeURIComponent(match[1]) : `payroll-run-${runId}-tendepay.xlsx`;
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(objUrl);
}

async function _prExportTendepay(runId) {
  const format = document.getElementById(`pr-export-format-${runId}`)?.value || 'xlsx';
  await _prDownloadRunFile(`${API_BASE}/payroll/runs/${runId}/tendepay-export?format=${format}&only_unpaid=false`, runId);
}

async function _prRetryExport(runId) {
  const format = document.getElementById(`pr-export-format-${runId}`)?.value || 'xlsx';
  await _prDownloadRunFile(`${API_BASE}/payroll/runs/${runId}/retry-export?format=${format}`, runId);
}

// Turns the export's blocking 400 into a work queue — the single highest-value
// UX detail in the Tendepay export spec (§9.2).
function _prShowExportFixList(detail) {
  const el = document.getElementById('pr-export-error');
  if (!el) return;
  const rows = (detail.affected || []).map(a => `
    <li><a href="#" onclick="_prGoToServiceProfile('${_finEsc(a.employee_code)}');return false;">${_finEsc(a.employee_code)}</a> — ${_finEsc(a.error)}</li>`).join('');
  el.innerHTML = `
    <div style="background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:14px 16px;border-radius:8px;">
      <strong>${_finEsc(detail.error || 'Cannot export — some employees are missing payment details.')}</strong>
      <ul style="margin:10px 0 0 18px;">${rows}</ul>
    </div>`;
}

function _prGoToServiceProfile(employeeCode) {
  const emp = employeesData.find(e => e.employee_code === employeeCode);
  if (!emp) { showToast('Employee not found in cache — open HR ▸ Employee Directory first.', 'error'); return; }
  const existing = (emp.service_profile && emp.service_profile[0]) || null;
  hrEspFormState = {
    context: existing ? 'edit' : 'add', sourceView: 'payroll',
    editSourceIdx: existing ? 0 : -1,
    lockedEmpCode: emp.employee_code, lockedEmpName: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
    bankAccounts: existing ? [...(existing.bank_accounts || [])] : [],
    editingBankIdx: -1, existingRecord: existing,
  };
  renderHrEspFormPage(document.getElementById('main-content'));
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
  const failedCount = (run.lines || []).filter(l => l.payment_status === 'failed').length;
  const failedNote = failedCount > 0 ? `
    <div style="background:#fde0de;color:#c0392b;padding:10px 14px;border-radius:6px;margin-bottom:12px;font-size:0.85rem;">
      ${failedCount} employee(s) have no payslip because their payment failed. Resolve via Payment Reconciliation &rarr; Retry export.
    </div>` : '';
  el.innerHTML = `
    <div class="fin-section-label">Payslips</div>
    ${failedNote}
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
    moduleKey: 'payroll.payslips',
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
