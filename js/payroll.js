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
    <div style="font-size:12px;color:#888;margin:-4px 0 10px;">
      Employees only. Contractors are on their own runs &rarr;
      <a href="#" onclick="loadView('payroll-contractor-runs');return false;">Contractor Runs</a>
    </div>
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
  const ok = await authBlobDownload(url, `payroll-run-${runId}-tendepay.xlsx`, {
    onError: async (res) => {
      const body = await res.json().catch(() => null);
      if (body && body.detail && typeof body.detail === 'object' && Array.isArray(body.detail.affected)) {
        _prShowExportFixList(body.detail);
        return;
      }
      const detail = body && body.detail;
      const msg = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : `HTTP ${res.status}`);
      showToast('Export failed: ' + msg, 'error');
    },
  });
  if (ok) {
    const errEl = document.getElementById('pr-export-error');
    if (errEl) errEl.innerHTML = '';
  }
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

// ==================== CONTRACTOR RUNS ====================
// BE/FE Contract Addendum 2026-08-06 §6. Separate pipeline from Payroll
// Runs (WHT-only, no PAYE/SHIF/NSSF/AHL) — regular payroll_runs now filter
// contractors out. No withdraw/delete endpoint exists on the live backend
// (only list/create/detail/calculate/approve/fee-note), unlike the
// addendum's action table which also mentions Delete/Withdraw — the FE
// only wires what's actually there.
let _crRuns = [];
let _crSelectedRunId = null;
let _crStatusFilter = '';
let _crYearFilter = new Date().getFullYear();
let _crMonthFilter = '';

const _CR_STATUS_COLORS = {
  draft: '#888;background:#eee',
  calculated: '#1B3057;background:#dde3ec',
  approved: '#8a6d00;background:#f5e6a8',
  awaiting_payment: '#9a7d0a;background:#fdf3d0',
  paid: '#1e7e34;background:#dcf3e2',
  fee_notes_generated: '#0f766e;background:#d3f3ef',
};
function _crBadge(status) {
  const c = _CR_STATUS_COLORS[status] || '#888;background:#eee';
  const [color, bg] = c.split(';background:');
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${color};background:${bg};">${_finEsc((status || '').replace(/_/g, ' '))}</span>`;
}

async function loadContractorRunsView(container) {
  await _pvLoadLookups();
  await _crLoadRuns();
  _crRenderShell(container);
}

async function _crLoadRuns() {
  const params = new URLSearchParams();
  if (_crYearFilter) params.set('year', _crYearFilter);
  if (_crMonthFilter) params.set('month', _crMonthFilter);
  const res = await apiFetch(`${API_BASE}/payroll/contractor-runs/?${params.toString()}`);
  _crRuns = res && res.ok ? _toArray(await res.json()) : [];
}

function _crFilteredRuns() {
  return _crStatusFilter ? _crRuns.filter(r => r.status === _crStatusFilter) : _crRuns;
}

function _crRenderShell(container) {
  container.innerHTML = `
    ${renderBreadcrumb([{label:'Dashboard',view:null},{label:'Payroll',view:'payroll-contractor-runs'},{label:'Contractor Runs'}])}
    <div style="background:#EEF3FA;border-left:3px solid var(--navy-400,#4A6FA5);border-radius:6px;padding:10px 16px;margin-bottom:14px;font-size:12.5px;color:var(--navy-900,#0D2137);">
      Employees only appear on the regular <a href="#" onclick="loadView('payroll-runs');return false;">Payroll Runs</a>.
      Contractors (tax_profile = contractor) are on their own runs here.
    </div>
    <div class="split-layout">
      <div class="split-left">
        <div class="split-left-header">
          <span class="split-left-title">Contractor Runs</span>
          <span class="split-left-count">${_crFilteredRuns().length}</span>
        </div>
        <div style="display:flex;gap:6px;padding:8px 12px;flex-wrap:wrap;">
          <select id="cr-filter-year" class="fin-filter-select" style="max-width:100px;" onchange="_crApplyFilters()">
            ${Array.from({length:6},(_,i)=>new Date().getFullYear()-2+i).map(y=>`<option value="${y}" ${y===_crYearFilter?'selected':''}>${y}</option>`).join('')}
          </select>
          <select id="cr-filter-month" class="fin-filter-select" style="max-width:120px;" onchange="_crApplyFilters()">
            <option value="">All Months</option>
            ${_PR_MONTHS.slice(1).map((m,i)=>`<option value="${i+1}" ${String(i+1)===String(_crMonthFilter)?'selected':''}>${m}</option>`).join('')}
          </select>
          <select id="cr-filter-status" class="fin-filter-select" style="max-width:140px;" onchange="_crApplyFilters()">
            <option value="">All Statuses</option>
            ${Object.keys(_CR_STATUS_COLORS).map(s=>`<option value="${s}" ${s===_crStatusFilter?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}
          </select>
        </div>
        <div class="split-left-col-headers"><span>Run</span><span>Status</span></div>
        <div class="split-list" id="cr-list-items"></div>
      </div>
      <div class="split-right" id="cr-right-panel"></div>
    </div>`;
  _crRenderList();
  if (_crSelectedRunId && _crRuns.some(r => String(r.id) === String(_crSelectedRunId))) _crSelectRun(_crSelectedRunId);
  else _crRenderAddForm();
}

async function _crApplyFilters() {
  _crYearFilter = parseInt(document.getElementById('cr-filter-year')?.value, 10) || '';
  _crMonthFilter = document.getElementById('cr-filter-month')?.value || '';
  _crStatusFilter = document.getElementById('cr-filter-status')?.value || '';
  await _crLoadRuns();
  _crRenderShell(document.getElementById('main-content'));
}

function _crRenderList() {
  const el = document.getElementById('cr-list-items');
  if (!el) return;
  const runs = _crFilteredRuns();
  el.innerHTML = runs.map(r => `
    <div class="split-list-row${String(_crSelectedRunId) === String(r.id) ? ' active' : ''}" onclick="_crSelectRun(${r.id})">
      <div class="split-col1">${_finEsc(r.run_number)}<br><span style="font-weight:400;font-size:11.5px;color:#888;">${_PR_MONTHS[r.period_month]||''} ${r.period_year}</span></div>
      <div class="split-col2">${_crBadge(r.status)}</div>
    </div>`).join('') || `<p style="padding:24px;text-align:center;color:var(--grey-400);font-style:italic;font-size:13px">No records found</p>`;
}

function _crRenderAddForm() {
  _crSelectedRunId = null;
  _crRenderList();
  const right = document.getElementById('cr-right-panel');
  if (!right) return;
  right.className = 'split-right-add';
  right.innerHTML = `
    <div class="fin-form-wrap">
      <h3 class="fin-title" style="font-size:1.1rem;">New Contractor Run</h3>
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Period Month <span class="fin-required">*</span></label>
          <select id="cr-add-month" class="fin-form-select">
            <option value="">Please Select</option>
            ${_PR_MONTHS.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Period Year <span class="fin-required">*</span></label>
          <input type="number" id="cr-add-year" class="fin-form-input" value="${new Date().getFullYear()}" min="2020" max="2100">
        </div>
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_crCreateRun()">Create Run</button>
      </div>
    </div>`;
}

async function _crCreateRun() {
  const month = parseInt(document.getElementById('cr-add-month').value, 10);
  const year = parseInt(document.getElementById('cr-add-year').value, 10);
  if (!month || !year) { showToast('Period Month and Period Year are required.', 'error'); return; }
  const res = await apiFetch(`${API_BASE}/payroll/contractor-runs/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period_month: month, period_year: year }) });
  if (res && res.ok) {
    const run = await res.json();
    showToast('Contractor run created.', 'success');
    await _crLoadRuns();
    await _crSelectRun(run.id);
  } else if (res && res.status === 409) {
    showToast('A contractor run already exists for that period.', 'error');
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function _crSelectRun(runId) {
  _crSelectedRunId = runId;
  _crRenderList();
  const right = document.getElementById('cr-right-panel');
  right.className = 'split-right-detail';
  right.innerHTML = '<p class="sa-loading">Loading&#8230;</p>';
  const res = await apiFetch(`${API_BASE}/payroll/contractor-runs/${runId}`);
  if (!res || !res.ok) { right.innerHTML = `<p class="fin-error-msg">Could not load contractor run.</p>`; return; }
  const run = await res.json();
  _crRenderDetail(right, run);
}

const _CR_EXEMPT_REASON_LABELS = {
  resident_below_threshold: 'Resident, gross below the exempt threshold.',
  unknown_payment_type: 'Payment type not found on the active WHT schedule.',
};
function _crExemptTooltip(reason) {
  if (!reason) return '';
  const [key, arg] = reason.split(':');
  const base = _CR_EXEMPT_REASON_LABELS[key] || reason;
  return key === 'resident_below_threshold' && arg ? `Resident, gross below KES ${Number(arg).toLocaleString()} threshold.` : base;
}

function _crRenderDetail(right, run) {
  const isSubmitter = currentUser && run.created_by != null && String(currentUser.id) === String(run.created_by);
  let actions = '';
  if (run.status === 'draft' || run.status === 'calculated') {
    actions += `<button class="btn" onclick="_crCalculate(${run.id})">${run.status === 'calculated' ? 'Recalculate' : 'Calculate'}</button>`;
  }
  if (run.status === 'calculated') {
    if (isSubmitter) {
      actions += `<div style="color:var(--coral-500,#D94040);font-size:0.85rem;">You created this run — segregation of duties means you cannot approve it yourself.</div>`;
    } else {
      actions += `<button class="fin-btn-teal" onclick="_crApprove(${run.id})">Approve</button>`;
    }
  }
  right.innerHTML = `
    <div class="detail-banner" style="background:var(--navy-700,#1B3057);color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
      <div style="font-size:1.15rem;font-weight:700;">${_finEsc(run.run_number)}</div>
      <div style="opacity:0.85;font-size:0.85rem;">${_PR_MONTHS[run.period_month]||''} ${run.period_year} &middot; ${_crBadge(run.status)}</div>
    </div>
    <div style="display:flex;gap:24px;padding:14px 20px;background:#f8fafc;">
      <div><div style="opacity:0.6;font-size:0.75rem;">GROSS</div><div style="font-weight:700;">${_pvMoney(run.total_gross)}</div></div>
      <div><div style="opacity:0.6;font-size:0.75rem;">WHT</div><div style="font-weight:700;">${_pvMoney(run.total_wht)}</div></div>
      <div><div style="opacity:0.6;font-size:0.75rem;">NET</div><div style="font-weight:700;">${_pvMoney(run.total_net)}</div></div>
    </div>
    <div style="padding:14px 20px;display:flex;gap:10px;flex-wrap:wrap;">${actions}</div>
    <div id="cr-warnings" style="padding:0 20px;"></div>
    <div style="padding:0 20px 20px;">
      <table class="fin-li-table">
        <thead><tr><th>Employee</th><th>Payment Type</th><th>Resident?</th><th>Gross</th><th>WHT %</th><th>WHT</th><th>Net</th><th>Payment</th><th></th></tr></thead>
        <tbody>
          ${(run.lines || []).map(l => {
            const exempt = parseFloat(l.wht_rate_percent) === 0;
            return `<tr${exempt ? ' style="color:var(--gold-600,#8a6d00);"' : ''} title="${exempt ? _finEsc(_crExemptTooltip(l.exempt_reason)) : ''}">
              <td>${_finEsc(l.employee_code)}</td>
              <td>${_finEsc(whtPaymentTypeLabel(l.payment_type))}</td>
              <td>${l.is_non_resident ? 'No' : 'Yes'}</td>
              <td>${_pvMoney(l.gross_amount)}</td>
              <td>${parseFloat(l.wht_rate_percent).toFixed(2)}%</td>
              <td>${_pvMoney(l.wht_amount)}</td>
              <td>${_pvMoney(l.net_amount)}</td>
              <td>${_finEsc((l.payment_status||'').replace(/_/g,' '))}</td>
              <td>${l.payment_status === 'paid' ? `<button class="fin-btn-outline" style="padding:2px 8px;font-size:0.72rem;" onclick="_crDownloadFeeNote(${run.id},${l.id})">Fee Note</button>` : ''}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="9" class="hr-empty">No lines yet &mdash; run Calculate.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function _crCalculate(runId) {
  const res = await apiFetch(`${API_BASE}/payroll/contractor-runs/${runId}/calculate`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    const data = await res.json();
    showToast('Contractor run calculated.', 'success');
    await _crLoadRuns();
    await _crSelectRun(runId);
    if (data.warnings && data.warnings.length) _crRenderWarnings(data.warnings);
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

function _crRenderWarnings(warnings) {
  const el = document.getElementById('cr-warnings');
  if (!el) return;
  const reasonCopy = { no_contract_amount: 'Set the monthly consultancy fee on their service profile', missing_wht_payment_type: 'Set a WHT payment type on their statutory pipeline' };
  el.innerHTML = `
    <div style="background:#FBF3D9;border-left:3px solid var(--gold-500,#C9A227);border-radius:6px;padding:12px 16px;margin-bottom:14px;">
      <div style="font-weight:600;font-size:0.85rem;color:#5c4a00;margin-bottom:8px;">${warnings.length} contractor${warnings.length===1?'':'s'} need onboarding before this run can be finalised.</div>
      <table style="width:100%;font-size:0.8rem;">
        ${warnings.map(w => `<tr>
          <td style="padding:3px 0;"><a href="#" onclick="${w.reason==='no_contract_amount' ? `_prGoToServiceProfile('${_finEsc(w.employee_code)}')` : `hrEditEmployee('${_finEsc(w.employee_code)}')`};return false;">${_finEsc(w.employee_code)} &mdash; ${_finEsc(w.employee_name)}</a></td>
          <td style="padding:3px 0;color:#5c4a00;">${_finEsc(reasonCopy[w.reason] || w.reason)}</td>
        </tr>`).join('')}
      </table>
    </div>`;
}

async function _crApprove(runId) {
  const res = await apiFetch(`${API_BASE}/payroll/contractor-runs/${runId}/approve`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    showToast('Contractor run approved.', 'success');
    await _crLoadRuns();
    await _crSelectRun(runId);
  } else if (res.status === 403) {
    showToast('You cannot approve a run you created (segregation of duties).', 'error');
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function _crDownloadFeeNote(runId, lineId) {
  await authBlobDownload(`${API_BASE}/payroll/contractor-runs/${runId}/fee-note/${lineId}`, `FeeNote-${runId}-${lineId}.pdf`);
}

// ==================== STATUTORY RATES (Payroll > Utilities) ====================
// BE/FE Contract Addendum 2026-08-06 §5. Five rate types, no PATCH/DELETE —
// in-force schedules are immutable; a new schedule with a future
// effective_from auto-closes the previous one. WHTScheduleRead (and its
// siblings) already carry is_active directly, so "current" is a lookup, not
// a client-side date-range computation.
const _SR_API = `${API_BASE}/payroll/utilities/statutory-rates`;
const _SR_TYPES = [['paye','PAYE'],['nssf','NSSF'],['shif','SHIF'],['ahl','AHL'],['wht','WHT']];
const _SR_LABELS = Object.fromEntries(_SR_TYPES);
let _srActiveTab = 'paye';
let _srLists = {};
let _srSelected = {};
let _srBandsEditor = [];
let _srRatesEditor = [];

function _srMoney(v) { return formatKES(v); }
function _srPercent(v) { return v == null || v === '' ? '—' : `${parseFloat(v).toFixed(2)}%`; }
function _srDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? v : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function _srStatusOf(s) {
  if (s.is_active) return 'current';
  return new Date(s.effective_from) > new Date() ? 'future' : 'historical';
}
function _srStatusPill(status) {
  const map = { future: ['Future','#1B3057','#dce8fb'], current: ['Current','#8a6d00','#f5e6a8'], historical: ['Historical','#5F6B7C','#EEF1F5'] };
  const [label, color, bg] = map[status] || [status, '#888', '#eee'];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:600;color:${color};background:${bg};">${label}</span>`;
}
function _srCurrentOf(type) { return (_srLists[type] || []).find(s => s.is_active) || null; }

async function loadStatutoryRatesView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Statutory Rates</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Payroll &rsaquo; Utilities &rsaquo; Statutory Rates</div>
      </div>
      <div id="sr-summary"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 12px;flex-wrap:wrap;gap:10px;">
        <div id="sr-tabs" style="display:flex;gap:6px;"></div>
        <button class="fin-btn-teal" onclick="_srOpenAddForm(_srActiveTab)">+ Add future schedule</button>
      </div>
      <div id="sr-tab-content"></div>
    </div>`;
  await _srLoadAll();
  _srRenderSummary();
  _srRenderTabs();
  _srRenderTabContent();
}

async function _srLoadAll() {
  const results = await Promise.all(_SR_TYPES.map(([type]) => apiFetch(`${_SR_API}/${type}`)));
  for (let i = 0; i < _SR_TYPES.length; i++) {
    const [type] = _SR_TYPES[i];
    const res = results[i];
    _srLists[type] = res && res.ok ? _toArray(await res.json()) : [];
  }
}

function _srRenderSummary() {
  const el = document.getElementById('sr-summary');
  if (!el) return;
  const paye = _srCurrentOf('paye'), nssf = _srCurrentOf('nssf'), shif = _srCurrentOf('shif'), ahl = _srCurrentOf('ahl'), wht = _srCurrentOf('wht');
  el.innerHTML = `
    <div style="border:1px solid var(--grey-100,#eee);border-radius:8px;padding:16px 20px;margin-bottom:20px;background:#fff;">
      <div style="font-size:0.78rem;font-weight:600;color:var(--navy-700,#1B3057);text-transform:uppercase;margin-bottom:12px;">Current Rates</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;font-size:0.82rem;">
        <div><strong>PAYE</strong><br>${paye ? (paye.bands||[]).slice().sort((a,b)=>a.band_order-b.band_order).map(b=>`&le;${b.upper_bound?_srMoney(b.upper_bound):'&infin;'} @ ${_srPercent(b.rate_percent)}`).join('<br>') + `<br><span style="color:#888;">Relief ${_srMoney(paye.personal_relief)}</span>` : '<span style="color:#aaa;">Not configured</span>'}</div>
        <div><strong>NSSF</strong><br>${nssf ? `Tier I &le; ${_srMoney(nssf.tier1_limit)} @ ${_srPercent(nssf.tier1_rate)}<br>Tier II &le; ${_srMoney(nssf.tier2_upper_limit)} @ ${_srPercent(nssf.tier2_rate)}` : '<span style="color:#aaa;">Not configured</span>'}</div>
        <div><strong>SHIF</strong><br>${shif ? `${_srPercent(shif.rate)} &middot; min ${_srMoney(shif.minimum)}` : '<span style="color:#aaa;">Not configured</span>'}</div>
        <div><strong>AHL</strong><br>${ahl ? `Employee ${_srPercent(ahl.employee_rate)}<br>Employer ${_srPercent(ahl.employer_rate)}` : '<span style="color:#aaa;">Not configured</span>'}</div>
        <div><strong>WHT</strong><br>${wht ? (wht.rates||[]).slice(0,3).map(r=>`${_finEsc(whtPaymentTypeLabel(r.payment_type))} ${_srPercent(r.resident_rate)}/${_srPercent(r.nonresident_rate)}`).join('<br>') + ((wht.rates||[]).length>3?`<br><span style="color:#888;">+ ${wht.rates.length-3} more</span>`:'') : '<span style="color:#aaa;">Not configured</span>'}</div>
      </div>
    </div>`;
}

function _srRenderTabs() {
  const el = document.getElementById('sr-tabs');
  if (!el) return;
  el.innerHTML = _SR_TYPES.map(([type,label]) => `<button class="${_srActiveTab===type?'fin-btn-teal':'fin-btn-outline'}" onclick="_srSetTab('${type}')">${label}</button>`).join('');
}
function _srSetTab(type) {
  _srActiveTab = type;
  _srRenderTabs();
  _srRenderTabContent();
}

function _srRenderTabContent() {
  const type = _srActiveTab;
  const list = (_srLists[type] || []).slice().sort((a,b) => new Date(b.effective_from) - new Date(a.effective_from));
  if (!_srSelected[type] && list.length) _srSelected[type] = list[0].id;
  const el = document.getElementById('sr-tab-content');
  if (!el) return;
  el.innerHTML = `
    <div class="split-layout">
      <div class="split-left">
        <div class="split-left-header">
          <span class="split-left-title">${_SR_LABELS[type]} Schedules</span>
          <span class="split-left-count">${list.length}</span>
        </div>
        <div class="split-list">
          ${list.map(s => {
            const status = _srStatusOf(s);
            const active = String(_srSelected[type]) === String(s.id);
            return `<div class="split-list-row${active?' active':''}" onclick="_srSelectSchedule('${type}',${s.id})">
              <div class="split-col1">${_srDate(s.effective_from)} &rarr; ${s.effective_to?_srDate(s.effective_to):'open'}</div>
              <div class="split-col2">${_srStatusPill(status)}</div>
            </div>`;
          }).join('') || `<p style="padding:24px;text-align:center;color:var(--grey-400);font-style:italic;font-size:13px">No schedules yet</p>`}
        </div>
      </div>
      <div class="split-right" id="sr-detail-panel"></div>
    </div>`;
  _srRenderDetail(type);
}

function _srSelectSchedule(type, id) {
  _srSelected[type] = id;
  _srRenderTabContent();
}

function _srRenderDetail(type) {
  const el = document.getElementById('sr-detail-panel');
  if (!el) return;
  const s = (_srLists[type] || []).find(x => String(x.id) === String(_srSelected[type]));
  if (!s) { el.className = 'split-right-add'; el.innerHTML = `<p style="padding:40px;text-align:center;color:#aaa;">Select a schedule.</p>`; return; }
  const status = _srStatusOf(s);
  let body = '';
  if (type === 'paye') {
    body = `
      <div class="detail-fields-grid">
        <div class="detail-field"><span class="detail-field-label">Personal Relief</span><span class="detail-field-value">${_srMoney(s.personal_relief)}</span></div>
        <div class="detail-field"><span class="detail-field-label">Insurance Relief Rate</span><span class="detail-field-value">${_srPercent(s.insurance_relief_rate)}</span></div>
        <div class="detail-field"><span class="detail-field-label">Insurance Relief Cap</span><span class="detail-field-value">${_srMoney(s.insurance_relief_cap)}</span></div>
        <div class="detail-field"><span class="detail-field-label">NCPWD Exemption</span><span class="detail-field-value">${_srMoney(s.ncpwd_exemption)}</span></div>
      </div>
      <table class="fin-li-table" style="margin-top:14px;">
        <thead><tr><th>Band</th><th>Lower</th><th>Upper</th><th>Rate</th></tr></thead>
        <tbody>${(s.bands||[]).slice().sort((a,b)=>a.band_order-b.band_order).map(b=>`<tr><td>${b.band_order}</td><td>${_srMoney(b.lower_bound)}</td><td>${b.upper_bound!=null?_srMoney(b.upper_bound):'Uncapped'}</td><td>${_srPercent(b.rate_percent)}</td></tr>`).join('')}</tbody>
      </table>`;
  } else if (type === 'nssf') {
    body = `<div class="detail-fields-grid">
      <div class="detail-field"><span class="detail-field-label">Tier I Limit</span><span class="detail-field-value">${_srMoney(s.tier1_limit)}</span></div>
      <div class="detail-field"><span class="detail-field-label">Tier I Rate</span><span class="detail-field-value">${_srPercent(s.tier1_rate)}</span></div>
      <div class="detail-field"><span class="detail-field-label">Tier II Upper Limit</span><span class="detail-field-value">${_srMoney(s.tier2_upper_limit)}</span></div>
      <div class="detail-field"><span class="detail-field-label">Tier II Rate</span><span class="detail-field-value">${_srPercent(s.tier2_rate)}</span></div>
    </div>`;
  } else if (type === 'shif') {
    body = `<div class="detail-fields-grid">
      <div class="detail-field"><span class="detail-field-label">Rate</span><span class="detail-field-value">${_srPercent(s.rate)}</span></div>
      <div class="detail-field"><span class="detail-field-label">Minimum</span><span class="detail-field-value">${_srMoney(s.minimum)}</span></div>
    </div>`;
  } else if (type === 'ahl') {
    body = `<div class="detail-fields-grid">
      <div class="detail-field"><span class="detail-field-label">Employee Rate</span><span class="detail-field-value">${_srPercent(s.employee_rate)}</span></div>
      <div class="detail-field"><span class="detail-field-label">Employer Rate</span><span class="detail-field-value">${_srPercent(s.employer_rate)}</span></div>
      <div class="detail-field"><span class="detail-field-label">Reduces PAYE Taxable</span><span class="detail-field-value">${s.reduces_paye_taxable?'Yes':'No'}</span></div>
    </div>`;
  } else if (type === 'wht') {
    body = `<table class="fin-li-table">
      <thead><tr><th>Payment Type</th><th>Resident</th><th>Non-Resident</th><th>Exempt Below</th><th>Notes</th></tr></thead>
      <tbody>${(s.rates||[]).map(r=>`<tr><td>${_finEsc(whtPaymentTypeLabel(r.payment_type))}</td><td>${_srPercent(r.resident_rate)}</td><td>${_srPercent(r.nonresident_rate)}</td><td>${r.resident_exempt_below!=null?_srMoney(r.resident_exempt_below):'Always deduct'}</td><td>${_finEsc(r.notes||'—')}</td></tr>`).join('')}</tbody>
    </table>`;
  }
  el.className = 'split-right-detail';
  el.innerHTML = `
    <div class="detail-banner">
      <div class="detail-banner-initials">${_SR_LABELS[type].charAt(0)}</div>
      <div>
        <div class="detail-banner-name">${_SR_LABELS[type]} &mdash; ${_srDate(s.effective_from)} &rarr; ${s.effective_to?_srDate(s.effective_to):'open'}</div>
        <div class="detail-banner-sub">${_srStatusPill(status)}</div>
      </div>
    </div>
    <div class="detail-info-card">
      ${body}
      ${s.notes?`<p style="margin-top:12px;font-size:0.85rem;color:#555;"><strong>Notes:</strong> ${_finEsc(s.notes)}</p>`:''}
      <p style="margin-top:10px;font-size:11.5px;color:#888;">Created ${_srDate(s.created_at)}${s.created_by?` by staff #${s.created_by}`:''}</p>
    </div>`;
}

// ── Add future schedule — full-window form ──────────────────────────────────
function _srOpenAddForm(type) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  if (type === 'paye') _srBandsEditor = [{ band_order: 1, lower_bound: '0', upper_bound: '', rate_percent: '' }];
  if (type === 'wht') _srRatesEditor = [{ payment_type: '', resident_rate: '', nonresident_rate: '', resident_exempt_below: '', notes: '' }];
  const container = document.getElementById('main-content');
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add ${_SR_LABELS[type]} Schedule</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Payroll &rsaquo; Utilities &rsaquo; Statutory Rates &rsaquo; ${_SR_LABELS[type]} &rsaquo; Add</div>
      </div>
      <div style="background:#EEF3FA;border-left:3px solid var(--navy-400,#4A6FA5);border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:12.5px;color:var(--navy-900,#0D2137);">
        New schedules take effect from a future date. The currently in-force schedule will be automatically closed on that date.
      </div>
      <div class="fin-form-wrap" id="sr-add-form-body"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_srSubmitAdd('${type}')">Save</button>
        <button class="fin-btn-cancel" onclick="loadView('payroll-utilities-statutory-rates')">Cancel</button>
      </div>
    </div>`;
  document.getElementById('sr-add-form-body').innerHTML = _srAddFormFieldsHtml(type, tomorrow);
  if (type === 'paye') _srRenderBandsEditor();
  if (type === 'wht') _srRenderRatesEditor();
}

function _srAddFormFieldsHtml(type, tomorrow) {
  const common = `
    <div class="fin-form-group">
      <label class="fin-form-label">Effective From <span class="fin-required">*</span></label>
      <input type="date" id="sr-add-eff-from" class="fin-form-input" min="${tomorrow}">
    </div>`;
  const notes = `
    <div class="fin-form-group">
      <label class="fin-form-label">Notes</label>
      <textarea id="sr-add-notes" class="fin-form-textarea" rows="2"></textarea>
    </div>`;
  if (type === 'paye') {
    return `${common}
      <div class="fin-form-grid-2">
        <div class="fin-form-group"><label class="fin-form-label">Personal Relief</label><input type="number" id="sr-add-personal-relief" class="fin-form-input" step="0.01"></div>
        <div class="fin-form-group"><label class="fin-form-label">Insurance Relief Rate (%)</label><input type="number" id="sr-add-ins-relief-rate" class="fin-form-input" step="0.01"></div>
        <div class="fin-form-group"><label class="fin-form-label">Insurance Relief Cap</label><input type="number" id="sr-add-ins-relief-cap" class="fin-form-input" step="0.01"></div>
        <div class="fin-form-group"><label class="fin-form-label">NCPWD Exemption</label><input type="number" id="sr-add-ncpwd" class="fin-form-input" step="0.01"></div>
      </div>
      <div class="fin-section-label" style="margin-top:14px;">Bands</div>
      <table class="fin-li-table"><thead><tr><th>Order</th><th>Lower</th><th>Upper (blank = uncapped)</th><th>Rate %</th><th></th></tr></thead><tbody id="sr-bands-editor"></tbody></table>
      <a href="#" style="color:#2db3b3;font-weight:600;text-decoration:underline;font-size:0.85rem;" onclick="_srAddBandRow();return false;">+ Add Band</a>
      ${notes}`;
  }
  if (type === 'nssf') {
    return `${common}
      <div class="fin-form-grid-2">
        <div class="fin-form-group"><label class="fin-form-label">Tier I Limit</label><input type="number" id="sr-add-tier1-limit" class="fin-form-input" step="0.01"></div>
        <div class="fin-form-group"><label class="fin-form-label">Tier I Rate (%)</label><input type="number" id="sr-add-tier1-rate" class="fin-form-input" step="0.01"></div>
        <div class="fin-form-group"><label class="fin-form-label">Tier II Upper Limit</label><input type="number" id="sr-add-tier2-limit" class="fin-form-input" step="0.01"></div>
        <div class="fin-form-group"><label class="fin-form-label">Tier II Rate (%)</label><input type="number" id="sr-add-tier2-rate" class="fin-form-input" step="0.01"></div>
      </div>${notes}`;
  }
  if (type === 'shif') {
    return `${common}
      <div class="fin-form-grid-2">
        <div class="fin-form-group"><label class="fin-form-label">Rate (%)</label><input type="number" id="sr-add-rate" class="fin-form-input" step="0.01"></div>
        <div class="fin-form-group"><label class="fin-form-label">Minimum</label><input type="number" id="sr-add-minimum" class="fin-form-input" step="0.01"></div>
      </div>${notes}`;
  }
  if (type === 'ahl') {
    return `${common}
      <div class="fin-form-grid-2">
        <div class="fin-form-group"><label class="fin-form-label">Employee Rate (%)</label><input type="number" id="sr-add-emp-rate" class="fin-form-input" step="0.01"></div>
        <div class="fin-form-group"><label class="fin-form-label">Employer Rate (%)</label><input type="number" id="sr-add-empr-rate" class="fin-form-input" step="0.01"></div>
      </div>
      <label class="hr-form-checkbox-label" style="margin-top:8px;"><input type="checkbox" id="sr-add-reduces-paye" class="hr-form-cb"> Reduces PAYE Taxable</label>
      ${notes}`;
  }
  if (type === 'wht') {
    return `${common}
      <div class="fin-section-label" style="margin-top:14px;">Rates</div>
      <table class="fin-li-table"><thead><tr><th>Payment Type</th><th>Resident %</th><th>Non-Resident %</th><th>Exempt Below</th><th>Notes</th><th></th></tr></thead><tbody id="sr-rates-editor"></tbody></table>
      <a href="#" style="color:#2db3b3;font-weight:600;text-decoration:underline;font-size:0.85rem;" onclick="_srAddRateRow();return false;">+ Add Rate</a>
      ${notes}`;
  }
  return '';
}

function _srRenderBandsEditor() {
  const el = document.getElementById('sr-bands-editor');
  if (!el) return;
  el.innerHTML = _srBandsEditor.map((b,i) => `<tr>
    <td><input type="number" class="fin-li-input" value="${b.band_order}" min="1" max="20" style="width:60px;" oninput="_srUpdateBand(${i},'band_order',this.value)"></td>
    <td><input type="number" class="fin-li-input" value="${b.lower_bound}" step="0.01" oninput="_srUpdateBand(${i},'lower_bound',this.value)"></td>
    <td><input type="number" class="fin-li-input" value="${b.upper_bound}" step="0.01" placeholder="Uncapped" oninput="_srUpdateBand(${i},'upper_bound',this.value)"></td>
    <td><input type="number" class="fin-li-input" value="${b.rate_percent}" step="0.01" oninput="_srUpdateBand(${i},'rate_percent',this.value)"></td>
    <td><button class="fin-btn-li-rm" ${_srBandsEditor.length<=1?'disabled':''} onclick="_srRemoveBand(${i})">&times;</button></td>
  </tr>`).join('');
}
function _srAddBandRow() { _srBandsEditor.push({ band_order: _srBandsEditor.length+1, lower_bound: '', upper_bound: '', rate_percent: '' }); _srRenderBandsEditor(); }
function _srRemoveBand(i) { if (_srBandsEditor.length<=1) return; _srBandsEditor.splice(i,1); _srRenderBandsEditor(); }
function _srUpdateBand(i,key,val) { _srBandsEditor[i][key] = val; }

function _srRenderRatesEditor() {
  const el = document.getElementById('sr-rates-editor');
  if (!el) return;
  el.innerHTML = _srRatesEditor.map((r,i) => `<tr>
    <td><input type="text" class="fin-li-input" value="${_finEsc(r.payment_type)}" maxlength="60" oninput="_srUpdateRate(${i},'payment_type',this.value)"></td>
    <td><input type="number" class="fin-li-input" value="${r.resident_rate}" step="0.01" oninput="_srUpdateRate(${i},'resident_rate',this.value)"></td>
    <td><input type="number" class="fin-li-input" value="${r.nonresident_rate}" step="0.01" oninput="_srUpdateRate(${i},'nonresident_rate',this.value)"></td>
    <td><input type="number" class="fin-li-input" value="${r.resident_exempt_below}" step="0.01" placeholder="Always deduct" oninput="_srUpdateRate(${i},'resident_exempt_below',this.value)"></td>
    <td><input type="text" class="fin-li-input" value="${_finEsc(r.notes||'')}" oninput="_srUpdateRate(${i},'notes',this.value)"></td>
    <td><button class="fin-btn-li-rm" ${_srRatesEditor.length<=1?'disabled':''} onclick="_srRemoveRate(${i})">&times;</button></td>
  </tr>`).join('');
}
function _srAddRateRow() { _srRatesEditor.push({ payment_type:'', resident_rate:'', nonresident_rate:'', resident_exempt_below:'', notes:'' }); _srRenderRatesEditor(); }
function _srRemoveRate(i) { if (_srRatesEditor.length<=1) return; _srRatesEditor.splice(i,1); _srRenderRatesEditor(); }
function _srUpdateRate(i,key,val) { _srRatesEditor[i][key] = val; }

async function _srSubmitAdd(type) {
  const effFrom = document.getElementById('sr-add-eff-from')?.value;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  if (!effFrom) { showToast('Effective From is required.', 'error'); return; }
  if (effFrom < tomorrow) { showToast('Effective From must be strictly after today.', 'error'); return; }
  const notes = document.getElementById('sr-add-notes')?.value.trim() || null;
  const payload = { effective_from: effFrom, notes };
  if (type === 'paye') {
    const uncappedCount = _srBandsEditor.filter(b => !b.upper_bound).length;
    if (uncappedCount !== 1) { showToast('Exactly one band must be uncapped (blank Upper Bound) — the top band.', 'error'); return; }
    payload.personal_relief = document.getElementById('sr-add-personal-relief')?.value || '0';
    payload.insurance_relief_rate = document.getElementById('sr-add-ins-relief-rate')?.value || '0';
    payload.insurance_relief_cap = document.getElementById('sr-add-ins-relief-cap')?.value || '0';
    payload.ncpwd_exemption = document.getElementById('sr-add-ncpwd')?.value || '0';
    payload.bands = _srBandsEditor.map(b => ({ band_order: parseInt(b.band_order,10), lower_bound: b.lower_bound || '0', upper_bound: b.upper_bound || null, rate_percent: b.rate_percent || '0' }));
  } else if (type === 'nssf') {
    payload.tier1_limit = document.getElementById('sr-add-tier1-limit')?.value || '0';
    payload.tier1_rate = document.getElementById('sr-add-tier1-rate')?.value || '0';
    payload.tier2_upper_limit = document.getElementById('sr-add-tier2-limit')?.value || '0';
    payload.tier2_rate = document.getElementById('sr-add-tier2-rate')?.value || '0';
  } else if (type === 'shif') {
    payload.rate = document.getElementById('sr-add-rate')?.value || '0';
    payload.minimum = document.getElementById('sr-add-minimum')?.value || '0';
  } else if (type === 'ahl') {
    payload.employee_rate = document.getElementById('sr-add-emp-rate')?.value || '0';
    payload.employer_rate = document.getElementById('sr-add-empr-rate')?.value || '0';
    payload.reduces_paye_taxable = document.getElementById('sr-add-reduces-paye')?.checked || false;
  } else if (type === 'wht') {
    const types = _srRatesEditor.map(r => (r.payment_type||'').trim());
    if (types.some(t => !t)) { showToast('Every rate row needs a Payment Type.', 'error'); return; }
    if (new Set(types).size !== types.length) { showToast('Payment Type must be unique across rows.', 'error'); return; }
    payload.rates = _srRatesEditor.map(r => ({ payment_type: r.payment_type.trim(), resident_rate: r.resident_rate || '0', nonresident_rate: r.nonresident_rate || '0', resident_exempt_below: r.resident_exempt_below || null, notes: r.notes || null }));
  }
  const res = await apiFetch(`${_SR_API}/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res) return;
  if (res.ok) {
    showToast(`${_SR_LABELS[type]} schedule created.`, 'success');
    if (type === 'wht') _whtActiveScheduleCache = undefined; // invalidate the Employee-form WHT picker cache
    loadView('payroll-utilities-statutory-rates');
  } else {
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
  await authBlobDownload(`${API_BASE}/payroll/payslips/${payslipId}/download`, `payslip-${payslipId}.pdf`, {
    openInline: true,
    errorPrefix: 'Could not download payslip: ',
  });
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

// ==================== P9A TAX DEDUCTION CARD ====================
// BE/FE Contract Addendum 2026-08-06 §7. Not a split-view — a compact form
// with three download actions. Params verified against the live schema:
// employee_id (int), period_from/period_to ("YYYY-MM" strings), year (int).
let _p9aSelectedEmp = null; // { id, employee_code, name }

async function loadP9AView(container) {
  const years = Array.from({length: 6}, (_, i) => new Date().getFullYear() - 4 + i);
  const empOptions = (employeesData || []).map(e => {
    const name = ((e.surname || e.first_name || '') + ' ' + (e.other_names || e.last_name || '')).trim();
    return `<option value="${e.employee_code}">${_finEsc(name)} (${_finEsc(e.employee_code)})</option>`;
  }).join('');
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">P9A Tax Deduction Card</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Payroll &rsaquo; P9A Tax Deduction Card</div>
      </div>
      <div class="fin-form-wrap" style="max-width:560px;">
        <div class="fin-form-group">
          <label class="fin-form-label">Employee</label>
          <input type="text" id="p9a-emp-search" list="p9a-emp-list" class="fin-form-input" placeholder="Search employee&#8230;" oninput="_p9aPickEmployee(this.value)">
          <datalist id="p9a-emp-list">${empOptions}</datalist>
          <span style="font-size:0.78rem;color:#888;">Leave blank for the Bulk-year action.</span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Year</label>
          <select id="p9a-year" class="fin-form-select">${years.map(y=>`<option value="${y}" ${y===new Date().getFullYear()?'selected':''}>${y}</option>`).join('')}</select>
        </div>
        <details style="margin:6px 0 14px;">
          <summary style="cursor:pointer;font-size:0.85rem;color:var(--navy-700,#1B3057);font-weight:600;">Custom range</summary>
          <div class="fin-form-grid-2" style="margin-top:10px;">
            <div class="fin-form-group"><label class="fin-form-label">Period From</label><input type="month" id="p9a-period-from" class="fin-form-input"></div>
            <div class="fin-form-group"><label class="fin-form-label">Period To</label><input type="month" id="p9a-period-to" class="fin-form-input"></div>
          </div>
        </details>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="fin-btn-teal" onclick="_p9aDownloadSingle()">Single (custom range)</button>
          <button class="fin-btn-outline" onclick="_p9aDownloadFullYear()">Single (full year)</button>
          <button class="fin-btn-teal" style="background:var(--gold-500,#C9A227);border-color:var(--gold-500,#C9A227);" onclick="_p9aDownloadBulk()">Bulk (year)</button>
        </div>
      </div>
    </div>`;
}

function _p9aPickEmployee(code) {
  const emp = (employeesData || []).find(e => e.employee_code === code);
  _p9aSelectedEmp = emp || null;
}

async function _p9aDownloadSingle() {
  if (!_p9aSelectedEmp) { showToast('Select an employee first.', 'error'); return; }
  const from = document.getElementById('p9a-period-from')?.value;
  const to = document.getElementById('p9a-period-to')?.value;
  if (!from || !to) { showToast('Period From and Period To are required for a custom range.', 'error'); return; }
  if (from > to) { showToast('Period From must be on or before Period To.', 'error'); return; }
  await authBlobDownload(
    `${API_BASE}/payroll/p9?employee_id=${_p9aSelectedEmp.id}&period_from=${from}&period_to=${to}`,
    `P9A_${_p9aSelectedEmp.employee_code}.pdf`
  );
}

async function _p9aDownloadFullYear() {
  if (!_p9aSelectedEmp) { showToast('Select an employee first.', 'error'); return; }
  const year = document.getElementById('p9a-year')?.value;
  await authBlobDownload(
    `${API_BASE}/payroll/p9/full-year?employee_id=${_p9aSelectedEmp.id}&year=${year}`,
    `P9A_${_p9aSelectedEmp.employee_code}_${year}.pdf`
  );
}

async function _p9aDownloadBulk() {
  const year = document.getElementById('p9a-year')?.value;
  if (!confirm(`Generate P9A for every employee in ${year}? Contractors are excluded.`)) return;
  await authBlobDownload(`${API_BASE}/payroll/p9/bulk?year=${year}`, `P9A_${year}.zip`);
}

// ==================== SALARY DEDUCTIONS (BE/FE Contract Addendum 2026-08-11 §3) ====
// Pause/resume/end lifecycle (not immutable, unlike Statutory Rates), so a
// standard renderSplitView CRUD module rather than the tabbed schedule view.
const _SD_API = `${API_BASE}/payroll/deductions`;
const _SD_TYPES = [
  ['sacco', 'SACCO'], ['welfare', 'Welfare'], ['insurance', 'Insurance'], ['union_dues', 'Union Dues'],
  ['court_order', 'Court Order'], ['helb', 'HELB'], ['overpayment_recovery', 'Overpayment Recovery'],
  ['damage_recovery', 'Damage Recovery'], ['other', 'Other'],
];
const _SD_TYPE_LABEL = Object.fromEntries(_SD_TYPES);
const _SD_TIER_LABEL = { legal: 'Legal', company: 'Company', voluntary: 'Voluntary' };
// Priority tier governs how the two-thirds cap treats the deduction (§5.4),
// so the colour is the key visual cue — reused by the Payroll Run
// deductions breakdown table, not just this module.
const _SD_TIER_STYLE = {
  legal:     'color:var(--coral-600,#B03030);background:var(--coral-100,#fbe3e3);',
  company:   'color:#fff;background:var(--navy-700,#1B3057);',
  voluntary: 'color:#8a6d00;background:var(--gold-100,#fdf3d6);',
};
function _sdPriorityPill(tier) {
  const style = _SD_TIER_STYLE[tier] || 'color:#666;background:#eee;';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.72rem;font-weight:600;${style}">${_finEsc(_SD_TIER_LABEL[tier] || tier || '—')}</span>`;
}
const _SD_STATUS_STYLE = {
  active: 'color:#fff;background:var(--navy-700,#1B3057);',
  paused: 'color:#8a6d00;background:var(--gold-100,#fdf3d6);',
  ended:  'color:#666;background:#eee;',
};
function _sdStatusPill(status) {
  const style = _SD_STATUS_STYLE[status] || 'color:#666;background:#eee;';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;${style}">${_finEsc((status || '').replace(/_/g, ' ') || '—')}</span>`;
}
function _sdAmountSummary(d) {
  if (d.amount_type === 'fixed') return formatKES(d.amount);
  if (d.amount_type === 'percent_of_basic') return `${d.percent_rate}% of basic`;
  if (d.amount_type === 'percent_of_gross') return `${d.percent_rate}% of gross`;
  return '—';
}

// Employee label/picker — reuses the global employeesData cache, same
// convention as _p9aPickEmployee (§P9A tax deduction card).
function _sdComputeEmpLabel(e) {
  const name = ((e.surname || e.first_name || '') + ' ' + (e.other_names || e.last_name || '')).trim();
  return `${name} (${e.employee_code || e.id})`;
}
function _sdEmployeeLabel(id) {
  const e = (employeesData || []).find(x => String(x.id) === String(id));
  return e ? _sdComputeEmpLabel(e) : `Employee #${id}`;
}
function _sdEmployeeDatalistHtml(listId) {
  return `<datalist id="${listId}">${(employeesData || []).map(e => `<option value="${_finEsc(_sdComputeEmpLabel(e))}"></option>`).join('')}</datalist>`;
}

let _sdActiveSuppliers = null;
async function _sdEnsureActiveSuppliers() {
  if (_sdActiveSuppliers) return;
  const res = await apiFetch(`${API_BASE}/suppliers/?is_active=true`);
  _sdActiveSuppliers = (res && res.ok) ? _toArray(await res.json()) : [];
}
function _sdSupplierLabel(id) {
  if (id == null) return '—';
  const s = (_sdActiveSuppliers || []).find(x => String(x.id) === String(id));
  return s ? s.name : `#${id}`;
}

// ── List (split-view) ────────────────────────────────────────────────────
async function loadPayrollSalaryDeductionsView(container) {
  await Promise.all([_pvLoadLookups(), _sdEnsureActiveSuppliers()]);
  const cfg = {
    container,
    title: 'Salary Deductions',
    moduleKey: 'payroll.salary_deductions',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Human Resource', view: null },
      { label: 'Payroll', view: null },
      { label: 'Deductions' },
    ],
    apiUrl: `${_SD_API}/`,
    searchFields: ['ref_number'],
    col1Label: 'Employee', col2Label: 'Amount',
    col1: d => `<strong>${_finEsc(_sdEmployeeLabel(d.employee_id))}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_finEsc(_SD_TYPE_LABEL[d.deduction_type] || d.deduction_type)} ${_sdPriorityPill(d.priority_tier)}</span>`,
    col2: d => `${_sdAmountSummary(d)}<br>${_sdStatusPill(d.status)}`,
    rowLabel: d => _sdEmployeeLabel(d.employee_id),
    rowSub: d => `${_SD_TYPE_LABEL[d.deduction_type] || d.deduction_type} &middot; ${_sdAmountSummary(d)}`,
    idKey: 'id',
    detailFields: [
      { label: 'Employee',           key: 'employee_id',            fmt: v => _sdEmployeeLabel(v) },
      { label: 'Deduction Type',     key: 'deduction_type',         fmt: v => _SD_TYPE_LABEL[v] || v },
      { label: 'Priority Tier',      key: 'priority_tier',          fmt: v => _sdPriorityPill(v) },
      { label: 'Recipient Supplier', key: 'recipient_supplier_id',  fmt: v => v ? _sdSupplierLabel(v) : '—' },
      { label: 'Reference Number',   key: 'ref_number',             fmt: v => v || '—' },
      { label: 'Amount',             key: 'id',                     fmt: (_, d) => _sdAmountSummary(d) },
      { label: 'Liability Account',  key: 'liability_account_id',   fmt: v => _pvAccountName(v) },
      { label: 'Expense Account',    key: 'expense_account_id',     fmt: v => v ? _pvAccountName(v) : '—' },
      { label: 'Effective From',     key: 'id',                     fmt: (_, d) => `${_PR_MONTHS[d.effective_from_month] || ''} ${d.effective_from_year || ''}`.trim() || '—' },
      { label: 'Effective To',       key: 'id',                     fmt: (_, d) => d.effective_to_month ? `${_PR_MONTHS[d.effective_to_month]} ${d.effective_to_year}` : '—' },
      { label: 'Recurring',          key: 'is_recurring',           fmt: v => v ? 'Yes' : 'No' },
      { label: 'Notes',              key: 'notes',                  fmt: v => v || '—' },
      { label: 'Status',             key: 'status',                 fmt: v => _sdStatusPill(v) },
      { label: 'Created By',         key: 'created_by',             fmt: v => v != null ? `Staff #${v}` : '—' },
      { label: 'Created At',         key: 'created_at',             fmt: v => v ? new Date(v).toLocaleString() : '—' },
      { label: 'Updated At',         key: 'updated_at',             fmt: v => v ? new Date(v).toLocaleString() : '—' },
    ],
    canEdit: item => item.status !== 'ended',
    renderAdd: el => _sdRenderForm(null, el),
    renderEdit: (item, el) => _sdRenderForm(item, el),
    detailActions: item => _sdDetailActionsHtml(item),
  };
  await renderSplitView(cfg);
  _sdInjectFilters(cfg);
}

function _sdInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;';
  wrap.innerHTML = `
    <select id="sd-filter-status" class="fin-form-select" style="flex:1;min-width:100px;font-size:12px;">
      <option value="">All Statuses</option>
      <option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option>
    </select>
    <select id="sd-filter-type" class="fin-form-select" style="flex:1;min-width:130px;font-size:12px;">
      <option value="">All Types</option>${_SD_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
    </select>
    <input type="text" id="sd-filter-employee" list="sd-filter-employee-datalist" class="fin-form-input" style="flex:1;min-width:150px;font-size:12px;" placeholder="Employee…">
    ${_sdEmployeeDatalistHtml('sd-filter-employee-datalist')}`;
  searchBox.insertAdjacentElement('afterend', wrap);
  ['sd-filter-status', 'sd-filter-type'].forEach(id => document.getElementById(id).addEventListener('change', () => _sdReapplyFilters(cfg)));
  document.getElementById('sd-filter-employee').addEventListener('change', () => _sdReapplyFilters(cfg));
}
function _sdReapplyFilters(cfg) {
  const status = document.getElementById('sd-filter-status')?.value || '';
  const type = document.getElementById('sd-filter-type')?.value || '';
  const empLabel = document.getElementById('sd-filter-employee')?.value || '';
  const emp = (employeesData || []).find(e => _sdComputeEmpLabel(e) === empLabel);
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('deduction_type', type);
  if (emp) params.set('employee_id', emp.id);
  const qs = params.toString();
  cfg.apiUrl = `${_SD_API}/` + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}

// ── Add/Edit form — segmented Priority Tier + Amount Type controls ────────
let _sdFormState = { priority: 'voluntary', amountType: 'fixed' };
let _sdSelectedEmployeeId = null;

function _sdSegButton(value, label, groupField, activeValue) {
  return `<button type="button" class="${activeValue === value ? 'fin-btn-teal' : 'fin-btn-outline'}" onclick="_sdSetSeg('${groupField}','${value}')">${label}</button>`;
}
function _sdSetSeg(field, value) {
  _sdFormState[field] = value;
  _sdRenderSegButtons();
  if (field === 'amountType') _sdToggleAmountFields();
}
function _sdRenderSegButtons() {
  const priEl = document.getElementById('sd-f-priority-seg');
  if (priEl) priEl.innerHTML = ['legal', 'company', 'voluntary'].map(t => _sdSegButton(t, _SD_TIER_LABEL[t], 'priority', _sdFormState.priority)).join('');
  const amtEl = document.getElementById('sd-f-amounttype-seg');
  if (amtEl) amtEl.innerHTML = [['fixed', 'Fixed'], ['percent_of_basic', '% of Basic'], ['percent_of_gross', '% of Gross']].map(([v, l]) => _sdSegButton(v, l, 'amountType', _sdFormState.amountType)).join('');
}
function _sdToggleAmountFields() {
  const amtGroup = document.getElementById('sd-f-amount-group');
  const pctGroup = document.getElementById('sd-f-percent-group');
  if (amtGroup) amtGroup.style.display = _sdFormState.amountType === 'fixed' ? '' : 'none';
  if (pctGroup) pctGroup.style.display = _sdFormState.amountType === 'fixed' ? 'none' : '';
}
function _sdPickEmployee(label) {
  const emp = (employeesData || []).find(e => _sdComputeEmpLabel(e) === label);
  _sdSelectedEmployeeId = emp ? emp.id : null;
}
function _sdMonthYearSelectHtml(idPrefix, month, year, includeEmpty) {
  const years = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 2 + i);
  return `
    <select id="${idPrefix}-month" class="fin-form-select" style="width:auto;display:inline-block;">
      ${includeEmpty ? '<option value="">Month</option>' : ''}
      ${_PR_MONTHS.slice(1).map((m, i) => `<option value="${i + 1}" ${Number(month) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
    </select>
    <select id="${idPrefix}-year" class="fin-form-select" style="width:auto;display:inline-block;">
      ${includeEmpty ? '<option value="">Year</option>' : ''}
      ${years.map(y => `<option value="${y}" ${Number(year) === y ? 'selected' : ''}>${y}</option>`).join('')}
    </select>`;
}

function _sdRenderForm(d, el) {
  _sdFormState = { priority: d?.priority_tier || 'voluntary', amountType: d?.amount_type || 'fixed' };
  _sdSelectedEmployeeId = d ? d.employee_id : null;
  const isEdit = !!d;
  el.innerHTML = `
    <div class="fin-form-wrap" style="max-width:100%;">
      <h3 class="fin-title" style="font-size:1rem;">${isEdit ? 'Edit' : 'New'} Salary Deduction</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Employee <span class="fin-required">*</span></label>
        <input type="text" id="sd-f-employee" list="sd-employee-datalist" class="fin-form-input" placeholder="Search employee…" value="${d ? _finEsc(_sdEmployeeLabel(d.employee_id)) : ''}" oninput="_sdPickEmployee(this.value)">
        ${_sdEmployeeDatalistHtml('sd-employee-datalist')}
        <span class="fin-field-error" id="sd-f-employee-err"></span>
      </div>
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Deduction Type <span class="fin-required">*</span></label>
          <select id="sd-f-type" class="fin-form-select">${_SD_TYPES.map(([v, l]) => `<option value="${v}" ${d?.deduction_type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Priority Tier <span class="fin-required">*</span></label>
          <div id="sd-f-priority-seg" style="display:flex;gap:6px;"></div>
        </div>
      </div>
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Recipient Supplier</label>
          <select id="sd-f-supplier" class="fin-form-select"><option value="">None</option>${(_sdActiveSuppliers || []).map(s => `<option value="${s.id}" ${String(d?.recipient_supplier_id) === String(s.id) ? 'selected' : ''}>${_finEsc(s.name)}</option>`).join('')}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Reference Number</label>
          <input type="text" id="sd-f-ref" class="fin-form-input" maxlength="100" value="${_finEsc(d?.ref_number || '')}">
        </div>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Amount Type <span class="fin-required">*</span></label>
        <div id="sd-f-amounttype-seg" style="display:flex;gap:6px;"></div>
      </div>
      <div class="fin-form-grid-2">
        <div class="fin-form-group" id="sd-f-amount-group">
          <label class="fin-form-label">Amount (KES)</label>
          <input type="number" id="sd-f-amount" class="fin-form-input" step="0.01" min="0.01" value="${d?.amount ?? ''}">
        </div>
        <div class="fin-form-group" id="sd-f-percent-group" style="display:none;">
          <label class="fin-form-label">Percent Rate (%)</label>
          <input type="number" id="sd-f-percent" class="fin-form-input" step="0.01" min="0.01" max="100" value="${d?.percent_rate ?? ''}">
        </div>
      </div>
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Liability Account <span class="fin-required">*</span></label>
          <select id="sd-f-liab-acct" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions(d?.liability_account_id)}</select>
          <span style="font-size:11px;color:#888;">CR account for the deduction — where the withheld amount is parked pending remittance.</span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Expense Account</label>
          <select id="sd-f-exp-acct" class="fin-form-select"><option value="">None</option>${_pvAccountOptions(d?.expense_account_id)}</select>
          <span style="font-size:11px;color:#888;">DR account for recovery-style deductions (damage / overpayment). Blank for ordinary payables.</span>
        </div>
      </div>
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Effective From <span class="fin-required">*</span></label>
          ${_sdMonthYearSelectHtml('sd-f-eff-from', d?.effective_from_month, d?.effective_from_year, false)}
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Effective To</label>
          ${_sdMonthYearSelectHtml('sd-f-eff-to', d?.effective_to_month, d?.effective_to_year, true)}
        </div>
      </div>
      <div class="fin-form-group">
        <label><input type="checkbox" id="sd-f-recurring" style="width:auto;margin-right:6px;" ${(d ? d.is_recurring : true) ? 'checked' : ''}> Recurring</label>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="sd-f-notes" class="fin-form-textarea" rows="3">${_finEsc(d?.notes || '')}</textarea>
      </div>
      <div id="sd-f-msg" style="margin-top:12px;"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_sdSubmit(${d?.id ?? 'null'})">${isEdit ? 'Update' : 'Save'}</button>
        <button class="fin-btn-cancel" onclick="${isEdit ? 'window._splitRefreshSelected && window._splitRefreshSelected()' : 'window._splitReload && window._splitReload()'}">Cancel</button>
      </div>
    </div>`;
  _sdRenderSegButtons();
  _sdToggleAmountFields();
}

function _sdValidate() {
  document.getElementById('sd-f-employee-err').textContent = '';
  document.getElementById('sd-f-msg').innerHTML = '';
  let valid = true;
  if (!_sdSelectedEmployeeId) { document.getElementById('sd-f-employee-err').textContent = 'Select a valid employee.'; valid = false; }
  if (_sdFormState.amountType === 'fixed') {
    const v = parseFloat(document.getElementById('sd-f-amount').value);
    if (!(v > 0)) { document.getElementById('sd-f-msg').innerHTML = `<div class="fin-field-error">amount must be &gt; 0 when amount_type = 'fixed'</div>`; valid = false; }
  } else {
    const v = parseFloat(document.getElementById('sd-f-percent').value);
    if (!(v > 0) || v > 100) { document.getElementById('sd-f-msg').innerHTML = `<div class="fin-field-error">percent_rate must be in (0, 100] when amount_type is a percentage</div>`; valid = false; }
  }
  if (!document.getElementById('sd-f-liab-acct').value) {
    document.getElementById('sd-f-msg').innerHTML = `<div class="fin-field-error">Liability Account is required.</div>`; valid = false;
  }
  const fromMonth = document.getElementById('sd-f-eff-from-month').value;
  const fromYear = document.getElementById('sd-f-eff-from-year').value;
  if (!fromMonth || !fromYear) {
    document.getElementById('sd-f-msg').innerHTML = `<div class="fin-field-error">Effective From is required.</div>`; valid = false;
  }
  const toMonth = document.getElementById('sd-f-eff-to-month').value;
  const toYear = document.getElementById('sd-f-eff-to-year').value;
  if ((toMonth && !toYear) || (!toMonth && toYear)) {
    document.getElementById('sd-f-msg').innerHTML = `<div class="fin-field-error">effective_to_year and effective_to_month must both be set or both null</div>`; valid = false;
  } else if (toMonth && toYear && fromMonth && fromYear) {
    const from = parseInt(fromYear) * 12 + parseInt(fromMonth);
    const to = parseInt(toYear) * 12 + parseInt(toMonth);
    if (to < from) { document.getElementById('sd-f-msg').innerHTML = `<div class="fin-field-error">effective_to must be &gt;= effective_from</div>`; valid = false; }
  }
  return valid;
}
async function _sdSubmit(id) {
  if (!_sdValidate()) return;
  const toMonth = document.getElementById('sd-f-eff-to-month').value;
  const toYear = document.getElementById('sd-f-eff-to-year').value;
  const payload = {
    employee_id: _sdSelectedEmployeeId,
    deduction_type: document.getElementById('sd-f-type').value,
    priority_tier: _sdFormState.priority,
    recipient_supplier_id: document.getElementById('sd-f-supplier').value ? parseInt(document.getElementById('sd-f-supplier').value) : null,
    ref_number: (document.getElementById('sd-f-ref').value || '').trim() || null,
    amount_type: _sdFormState.amountType,
    amount: _sdFormState.amountType === 'fixed' ? document.getElementById('sd-f-amount').value : null,
    percent_rate: _sdFormState.amountType !== 'fixed' ? document.getElementById('sd-f-percent').value : null,
    liability_account_id: parseInt(document.getElementById('sd-f-liab-acct').value),
    expense_account_id: document.getElementById('sd-f-exp-acct').value ? parseInt(document.getElementById('sd-f-exp-acct').value) : null,
    effective_from_month: parseInt(document.getElementById('sd-f-eff-from-month').value),
    effective_from_year: parseInt(document.getElementById('sd-f-eff-from-year').value),
    effective_to_month: toMonth ? parseInt(toMonth) : null,
    effective_to_year: toYear ? parseInt(toYear) : null,
    is_recurring: document.getElementById('sd-f-recurring').checked,
    notes: (document.getElementById('sd-f-notes').value || '').trim() || null,
  };
  const res = await apiFetch(id ? `${_SD_API}/${id}` : `${_SD_API}/`, {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    showToast(id ? 'Deduction updated.' : 'Deduction created.', 'success');
    if (id) await window._splitRefreshSelected?.(); else await window._splitReload?.();
    return;
  }
  if (!res) return;
  document.getElementById('sd-f-msg').innerHTML = `<div class="fin-field-error">${_finEsc(await parseApiError(res))}</div>`;
}

// ── Detail actions — status-conditional lifecycle (§3.8) ─────────────────
function _sdDetailActionsHtml(item) {
  window._sdCurrentItem = item;
  let actions = '';
  if (item.status === 'active') {
    actions += `<button class="fin-btn-outline" onclick="_sdPause(${item.id})">Pause</button>`;
    actions += `<button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_sdOpenEndModal(${item.id})">End</button>`;
  } else if (item.status === 'paused') {
    actions += `<button class="fin-btn-teal" onclick="_sdResume(${item.id})">Resume</button>`;
    actions += `<button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_sdOpenEndModal(${item.id})">End</button>`;
  }
  actions += `<button class="btn-danger" onclick="_sdDelete(${item.id})">Delete</button>`;
  return `
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">${actions}</div>
    <div id="sd-action-error" style="margin-top:12px;"></div>`;
}
async function _sdPause(id) {
  const res = await apiFetch(`${_SD_API}/${id}/pause`, { method: 'POST' });
  if (res && res.ok) { showToast('Deduction paused.', 'success'); await window._splitRefreshSelected?.(); }
  else if (res) showToast(await parseApiError(res), 'error');
}
async function _sdResume(id) {
  const res = await apiFetch(`${_SD_API}/${id}/resume`, { method: 'POST' });
  if (res && res.ok) { showToast('Deduction resumed.', 'success'); await window._splitRefreshSelected?.(); }
  else if (res) showToast(await parseApiError(res), 'error');
}
function _sdOpenEndModal(id) {
  const wrap = document.createElement('div');
  wrap.id = 'sd-end-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:420px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">End Deduction</h3>
      <p style="font-size:0.88rem;color:#444;">End this deduction? It will stop applying from the current payroll period onward.</p>
      <div id="sd-end-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-outline" onclick="_coaCloseModal('sd-end-modal-overlay')">Keep Deduction</button>
        <button class="fin-btn-cancel" onclick="_sdSubmitEnd(${id})">End Deduction</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _sdSubmitEnd(id) {
  const errEl = document.getElementById('sd-end-err');
  errEl.style.display = 'none';
  const res = await apiFetch(`${_SD_API}/${id}/end`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('sd-end-modal-overlay');
    showToast('Deduction ended.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  errEl.textContent = await parseApiError(res); errEl.style.display = 'block';
}
async function _sdDelete(id) {
  if (!confirm('Delete this deduction? This cannot be undone.')) return;
  const errEl = document.getElementById('sd-action-error');
  const res = await apiFetch(`${_SD_API}/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    showToast('Deduction deleted.', 'success');
    window._splitReload?.();
  } else if (res && res.status === 409) {
    const msg = await parseApiError(res);
    if (errEl) errEl.innerHTML = `
      <div style="background:var(--coral-100);color:var(--coral-600);padding:12px 14px;border-radius:8px;font-size:13px;">
        ${_finEsc(msg)}
        <div style="margin-top:10px;"><button class="btn" onclick="_sdOpenEndModal(${id})">End instead</button></div>
      </div>`;
  } else if (res) {
    showToast(await parseApiError(res), 'error');
  }
}
