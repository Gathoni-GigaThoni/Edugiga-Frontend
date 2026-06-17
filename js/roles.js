// ==================== ROLES ====================
// Single source-of-truth for the navigation structure.
// The Permissions table is generated entirely from this object.
// Adding a module/sub-module here automatically adds it to every role's Permissions table.
const NAV_STRUCTURE = [
  { id: 'student-management', label: 'Student Management', children: [
    { id: 'student-search',          label: 'Student Search' },
    { id: 'student-id-cards',        label: 'ID Cards' },
    { id: 'students-list',           label: 'Students' },
    { id: 'student-applicants',      label: 'Applicants' },
    { id: 'student-reporting',       label: 'Student Reporting' },
    { id: 'student-cohort-planner',  label: 'Cohort Term Planner' },
    { id: 'student-classes',         label: 'Classes' },
    { id: 'student-close-records',   label: 'Close Records Per Class' },
    { id: 'student-management-utilities', label: 'Utilities', children: [
      { id: 'utilities-student-sources',   label: 'Student Sources' },
      { id: 'utilities-streams',           label: 'Streams' },
      { id: 'utilities-funding-sources',   label: 'Funding Sources' },
      { id: 'utilities-sports-houses',     label: 'Sports Houses' },
    ]},
    { id: 'student-management-reports', label: 'Reports', children: [
      { id: 'reports-student',  label: 'Student Report' },
      { id: 'reports-guardian', label: 'Student Guardian Report' },
    ]},
  ]},
  { id: 'student-academics', label: 'Student Academics', children: [
    { id: 'attendance-register', label: 'Attendance Register' },
    { id: 'attendance-reports',  label: 'Attendance Reports', children: [
      { id: 'attendance-register-report', label: 'Attendance Register Report' }
    ]},
    { id: 'formative-assessment',  label: 'Formative Assessment' },
    { id: 'sa-subjects',           label: 'Subjects' },
    { id: 'sa-utilities',          label: 'Utilities' },
    { id: 'sa-setup',              label: 'Set-up' },
    { id: 'sa-sessions',           label: 'Terms' },
    { id: 'sa-session-types',      label: 'Term Types' },
    { id: 'sa-academic-years',     label: 'Academic Years' }
  ]},
  { id: 'transport-management', label: 'Transport Management' },
  { id: 'finance', label: 'Finance', children: [
    { id: 'student-fees-status',       label: 'Student Fees Status' },
    { id: 'summarized-fee-statement',  label: 'Summarized Fee Statement' },
    { id: 'student-finance', label: 'Student Finance', children: [
      { id: 'fin-student-invoices',         label: 'Student Invoices' },
      { id: 'fin-student-bulk-invoicing',   label: 'Student Bulk Invoicing' },
      { id: 'fin-invoice-adjustments',      label: 'Student Invoice Adjustments' },
      { id: 'fin-sponsorship-allocations',  label: 'Sponsorship Allocations' },
      { id: 'fin-sponsorship-managements',  label: 'Sponsorship Managements' },
      { id: 'fin-fee-setup-per-class',      label: 'Fee Set-up per Class' }
    ]},
    { id: 'cash-bank-management',      label: 'Cash and Bank Management' },
    { id: 'payables',                  label: 'Payables' },
    { id: 'receivables', label: 'Receivables', children: [
      { id: 'fin-receive-payments', label: 'Receive Payments' },
      { id: 'fin-transactions',     label: 'Transactions' },
      { id: 'fin-deposit-slip',     label: 'Deposit Slip' },
      { id: 'fin-credit-notes',     label: 'Credit Notes' }
    ]},
    { id: 'cancellations',             label: 'Cancellations' },
    { id: 'journal-entries',           label: 'Journal Entries' },
    { id: 'utilities', label: 'Utilities', children: [
      { id: 'fin-chart-of-accounts', label: 'Chart of Accounts' },
      { id: 'fin-fee-accounts',      label: 'Fee Accounts' },
      { id: 'fin-groups',            label: 'Groups' },
      { id: 'fin-sub-groups',        label: 'Sub Groups' },
      { id: 'fin-fiscal-years',      label: 'Fiscal Years' },
      { id: 'fin-payment-modes',     label: 'Payment Modes' }
    ]},
    { id: 'finance-setup',             label: 'Set-up' },
    { id: 'finance-reports',           label: 'Reports' }
  ]},
  { id: 'inventory-management', label: 'Inventory Management' },
  { id: 'procurement',          label: 'Procurement' },
  { id: 'human-resource', label: 'Human Resource', children: [
    { id: 'hr-employee-directory', label: 'Employee Directory' },
    { id: 'hr-staff-attendance',   label: 'Staff Attendance' },
    { id: 'hr-utilities',          label: 'Utilities' }
  ]},
  { id: 'payroll', label: 'Payroll', children: [
    { id: 'payroll-esp', label: 'Employee Service Profile' },
    { id: 'payroll-utilities', label: 'Utilities', children: [
      { id: 'payroll-pay-accounts',        label: 'Pay Accounts' },
      { id: 'payroll-pay-grades',          label: 'Pay Grades' },
      { id: 'payroll-salary-periods',      label: 'Salary Periods' },
      { id: 'payroll-salary-disbursement', label: 'Salary Disbursement Mode' },
      { id: 'payroll-fi',                  label: 'Financial Institutions' },
      { id: 'payroll-employee-events',     label: 'Employee Events' },
      { id: 'payroll-employee-status',     label: 'Employee Status' }
    ]}
  ]},
  { id: 'asset-management',     label: 'Asset Management' },
  { id: 'communication',        label: 'Communication' },
  { id: 'administration', label: 'Administration', children: [
    { id: 'user-management', label: 'User Management' },
    { id: 'admin-roles',     label: 'Roles' },
    { id: 'admin-setup',     label: 'Setup' }
  ]}
];

let rolesData = [];
let rolesPerPage = 10;

function generateRoleId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
});

// ---- Listing ----
async function loadRolesListingView(container) {
  renderRoleListPage(container);
  const tableContainer = document.getElementById('role-table-container');
  if (tableContainer) tableContainer.innerHTML = '<p style="padding:16px;color:#777;">Loading&#8230;</p>';

  const res = await apiFetch(`${API_BASE}/roles/`);
  if (res && res.ok) {
    const raw = await res.json();
    rolesData = Array.isArray(raw) ? raw : (raw.data || raw.results || raw.items || []);
  } else {
    showToast('Could not load roles.', 'error');
  }
  renderRoleTable();
}

function renderRoleListPage(container) {
  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Role</h2>
        <div class="role-breadcrumb">Dashboard &rsaquo; Administration &rsaquo; Role &rsaquo; Listing</div>
      </div>
      <div class="role-controls-row">
        <div class="role-controls-left">
          Show <select id="role-per-page" onchange="changeRolePerPage(this.value)">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select> entries
          &nbsp;|&nbsp; Total <span id="role-total-count">0</span> entries
        </div>
        <div class="role-controls-right">
          <button class="role-add-btn" onclick="renderRoleAddPage(document.getElementById('main-content'))">+ Add</button>
        </div>
      </div>
      <div id="role-table-container"></div>
    </div>
  `;
  const sel = document.getElementById("role-per-page");
  if (sel) sel.value = String(rolesPerPage);
  renderRoleTable();
}

function renderRoleTable() {
  const totalEl = document.getElementById("role-total-count");
  if (totalEl) totalEl.textContent = rolesData.length;

  let html = `<table class="role-table"><thead><tr>
    <th>TITLE</th><th>ACTION</th>
  </tr></thead><tbody>`;

  if (rolesData.length === 0) {
    html += `<tr><td colspan="2" class="role-empty">No records found</td></tr>`;
  } else {
    rolesData.forEach(r => {
      html += `<tr>
        <td>${r.title}</td>
        <td class="role-action-cell">
          <div class="role-action-wrap">
            <button class="role-action-btn" onclick="toggleRoleDropdown(event,'${r.id}')">&#8230;</button>
            <div id="role-dd-${r.id}" class="role-action-dropdown" style="display:none;">
              <a href="#" onclick="openRoleEdit('${r.id}')">&#9998; Edit</a>
              <a href="#" onclick="openRolePermissions('${r.id}')">&#128274; Permissions</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }
  html += `</tbody></table>`;
  document.getElementById("role-table-container").innerHTML = html;
}

function changeRolePerPage(val) {
  rolesPerPage = parseInt(val);
  renderRoleTable();
}

function toggleRoleDropdown(event, roleId) {
  event.stopPropagation();
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => {
    if (d.id !== `role-dd-${roleId}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`role-dd-${roleId}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// ---- Add Role ----
function renderRoleAddPage(container) {
  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Add Role</h2>
        <div class="role-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="role-bc-link" onclick="loadView('admin-roles')">Role</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="role-form-wrap">
        <div class="role-form-group">
          <label class="role-form-label">Title <span class="role-required">*</span></label>
          <input type="text" id="role-add-title" placeholder="Enter role title">
        </div>
        <div class="role-form-actions">
          <button class="role-btn-submit" onclick="submitAddRole()">Submit</button>
          <button class="role-btn-cancel" onclick="loadView('admin-roles')">Cancel</button>
        </div>
        <div id="role-add-status" class="role-form-status"></div>
      </div>
    </div>
  `;
}

async function submitAddRole() {
  const title = (document.getElementById("role-add-title").value || '').trim();
  if (!title) {
    document.getElementById("role-add-status").innerHTML = '<span class="role-status-error">Title is required.</span>';
    return;
  }

  const res = await apiFetch(`${API_BASE}/roles/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, is_active: true }),
  });
  if (!res) return;
  if (res.ok) {
    const saved = await res.json().catch(() => null);
    rolesData.push(saved || { id: generateRoleId(), title, permissions: {} });
    showToast('Role created!', 'success');
    loadView('admin-roles');
  } else {
    const msg = await parseApiError(res);
    document.getElementById("role-add-status").innerHTML = `<span class="role-status-error">${msg}</span>`;
    showToast(msg, 'error');
  }
}

// ---- Edit Role ----
function openRoleEdit(roleId) {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
  const role = rolesData.find(r => r.id === roleId);
  if (!role) return;
  renderRoleEditPage(document.getElementById("main-content"), role);
}

function renderRoleEditPage(container, role) {
  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Edit Role</h2>
        <div class="role-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="role-bc-link" onclick="loadView('admin-roles')">Role</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="role-form-wrap">
        <div class="role-form-group">
          <label class="role-form-label">Title <span class="role-required">*</span></label>
          <input type="text" id="role-edit-title" value="${role.title}">
        </div>
        <div class="role-form-actions">
          <button class="role-btn-submit" onclick="submitEditRole('${role.id}')">Update</button>
          <button class="role-btn-cancel" onclick="loadView('admin-roles')">Cancel</button>
        </div>
        <div id="role-edit-status" class="role-form-status"></div>
      </div>
    </div>
  `;
}

async function submitEditRole(roleId) {
  const title = (document.getElementById("role-edit-title").value || '').trim();
  if (!title) {
    document.getElementById("role-edit-status").innerHTML = '<span class="role-status-error">Title is required.</span>';
    return;
  }

  const role = rolesData.find(r => r.id === roleId);
  const res = await apiFetch(`${API_BASE}/roles/${roleId}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, is_active: role?.is_active !== false }),
  });
  if (!res) return;
  if (res.ok) {
    const saved = await res.json().catch(() => null);
    const idx = rolesData.findIndex(r => r.id === roleId);
    if (idx !== -1) rolesData[idx] = { ...rolesData[idx], ...(saved || {}), title };
    showToast('Role updated!', 'success');
    loadView('admin-roles');
  } else {
    const msg = await parseApiError(res);
    document.getElementById("role-edit-status").innerHTML = `<span class="role-status-error">${msg}</span>`;
    showToast(msg, 'error');
  }
}

// ---- Permissions ----
function openRolePermissions(roleId) {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
  const role = rolesData.find(r => r.id === roleId);
  if (!role) return;
  renderRolePermissionsPage(document.getElementById("main-content"), role);
}

function renderRolePermissionsPage(container, role) {
  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Permissions</h2>
        <div class="role-breadcrumb">
          Dashboard &rsaquo; Role &rsaquo;
          <a href="#" class="role-bc-link" onclick="loadView('admin-roles')">${role.title}</a>
          &rsaquo; Permissions
        </div>
      </div>
      <table class="role-perm-table">
        <thead>
          <tr>
            <th class="role-perm-th-mod">MODULE</th>
            <th class="role-perm-th-sel">SELECT ALL <input type="checkbox" id="role-master-cb" class="role-master-cb" onchange="toggleRoleMasterAll(this,'${role.id}')"></th>
            <th class="role-perm-th-act">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${buildPermRows(NAV_STRUCTURE, 0, role.id)}
        </tbody>
      </table>
      <div style="margin-top:16px;display:flex;gap:12px;">
        <button class="role-btn-submit" onclick="saveRolePermissions('${role.id}')">Save Permissions</button>
        <button class="role-btn-cancel" onclick="loadView('admin-roles')">Cancel</button>
      </div>
      <div id="role-perm-status" class="role-form-status" style="margin-top:8px;"></div>
    </div>
  `;
  syncMasterCheckbox(role.id);
}

async function saveRolePermissions(roleId) {
  const role = rolesData.find(r => r.id === roleId);
  if (!role) return;

  // Collect every checked permission as "moduleId:action" strings
  const permissionIds = [];
  document.querySelectorAll(`.role-perm-cb[data-role="${roleId}"]`).forEach(cb => {
    if (cb.checked) permissionIds.push(`${cb.dataset.mod}:${cb.dataset.action}`);
  });

  const res = await apiFetch(`${API_BASE}/roles/${roleId}/permissions/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission_ids: permissionIds }),
  });
  if (!res) return;
  if (res.ok) {
    showToast('Permissions saved!', 'success');
    const statusEl = document.getElementById('role-perm-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:#27ae60;">Permissions saved successfully.</span>';
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

function buildPermRows(nodes, depth, roleId) {
  let html = '';
  nodes.forEach(node => {
    const perms = (rolesData.find(r => r.id === roleId)?.permissions || {})[node.id] || {};
    const v = !!perms.view, a = !!perms.add, e = !!perms.edit, d = !!perms.delete;
    const allChecked = v && a && e && d;
    const indent = 12 + depth * 18;
    const childClass = depth > 0 ? ' role-perm-child' : '';
    const labelClass = depth > 0 ? 'role-module-label role-module-label--child' : 'role-module-label';

    html += `<tr class="role-perm-row${childClass}">
      <td class="role-perm-mod-cell" style="padding-left:${indent}px">
        <span class="${labelClass}">${node.label}</span>
      </td>
      <td class="role-perm-sel-cell">
        <input type="checkbox" class="role-row-sel-cb"
          data-mod="${node.id}" data-role="${roleId}"
          onchange="toggleRoleRowAll(this)"
          ${allChecked ? 'checked' : ''}>
      </td>
      <td class="role-perm-act-cell">
        ${['view','add','edit','delete'].map(action =>
          `<label class="role-perm-label"><input type="checkbox" class="role-perm-cb" data-mod="${node.id}" data-action="${action}" data-role="${roleId}" onchange="saveRolePermChange(this)" ${perms[action] ? 'checked' : ''}> ${action[0].toUpperCase() + action.slice(1)}</label>`
        ).join('')}
      </td>
    </tr>`;

    if (node.children) html += buildPermRows(node.children, depth + 1, roleId);
  });
  return html;
}

function saveRolePermChange(cb) {
  const roleId = cb.dataset.role, modId = cb.dataset.mod, action = cb.dataset.action;
  const role = rolesData.find(r => r.id === roleId);
  if (!role) return;
  if (!role.permissions[modId]) role.permissions[modId] = {};
  role.permissions[modId][action] = cb.checked;
  syncRowSelCheckbox(roleId, modId);
  syncMasterCheckbox(roleId);
}

function toggleRoleRowAll(rowCb) {
  const roleId = rowCb.dataset.role, modId = rowCb.dataset.mod, checked = rowCb.checked;
  document.querySelectorAll(`.role-perm-cb[data-mod="${modId}"][data-role="${roleId}"]`).forEach(cb => {
    cb.checked = checked;
    const role = rolesData.find(r => r.id === roleId);
    if (!role) return;
    if (!role.permissions[modId]) role.permissions[modId] = {};
    role.permissions[modId][cb.dataset.action] = checked;
  });
  syncMasterCheckbox(roleId);
}

function toggleRoleMasterAll(masterCb, roleId) {
  const checked = masterCb.checked;
  document.querySelectorAll(`.role-perm-cb[data-role="${roleId}"]`).forEach(cb => {
    cb.checked = checked;
    const role = rolesData.find(r => r.id === roleId);
    if (!role) return;
    if (!role.permissions[cb.dataset.mod]) role.permissions[cb.dataset.mod] = {};
    role.permissions[cb.dataset.mod][cb.dataset.action] = checked;
  });
  document.querySelectorAll(`.role-row-sel-cb[data-role="${roleId}"]`).forEach(cb => {
    cb.checked = checked;
  });
}

function syncRowSelCheckbox(roleId, modId) {
  const cbs = document.querySelectorAll(`.role-perm-cb[data-mod="${modId}"][data-role="${roleId}"]`);
  const allChecked = cbs.length > 0 && Array.from(cbs).every(cb => cb.checked);
  const rowCb = document.querySelector(`.role-row-sel-cb[data-mod="${modId}"][data-role="${roleId}"]`);
  if (rowCb) rowCb.checked = allChecked;
}

function syncMasterCheckbox(roleId) {
  const allCbs = document.querySelectorAll(`.role-perm-cb[data-role="${roleId}"]`);
  const allChecked = allCbs.length > 0 && Array.from(allCbs).every(cb => cb.checked);
  const master = document.getElementById("role-master-cb");
  if (master) master.checked = allChecked;
}

