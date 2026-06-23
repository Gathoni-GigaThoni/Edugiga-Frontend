// ==================== ROLES ====================
let rolesData = [];
let rolesPerPage = 10;

function generateRoleId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// roleId arriving from an onclick="...('${r.id}')" attribute is always a string,
// but backend-issued role ids are typically numeric — String() both sides so the
// lookup doesn't silently fail (and the caller just does nothing) on type mismatch.
function findRoleById(roleId) {
  return rolesData.find(r => String(r.id) === String(roleId));
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
  const role = findRoleById(roleId);
  if (!role) { showToast('Role not found. Please refresh the Roles list.', 'error'); return; }
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

  const role = findRoleById(roleId);
  const res = await apiFetch(`${API_BASE}/roles/${roleId}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, is_active: role?.is_active !== false }),
  });
  if (!res) return;
  if (res.ok) {
    const saved = await res.json().catch(() => null);
    const idx = rolesData.findIndex(r => String(r.id) === String(roleId));
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
// Single source-of-truth for the Permissions table. Adding a module/action
// here automatically adds it to every role's Permissions view.
const PERMISSIONS_TREE = [
  { key: 'dashboard',      label: 'Dashboard',      actions: ['view'] },
  { key: 'staff-calendar', label: 'Staff Calendar',  actions: ['view'] },
  {
    key: 'student-management', label: 'Student Management', actions: ['view'],
    children: [
      { key: 'student-search',   label: 'Student Search',   actions: ['view'] },
      { key: 'id-cards',         label: 'ID Cards',         actions: ['view'] },
      { key: 'id-card-holder',   label: 'ID Card Holder',   actions: ['view'] },
      {
        key: 'students', label: 'Students',
        actions: [
          'view', 'add', 'edit', 'delete',
          'fee_balance', 'can_edit_student_no', 'hostel_allocation',
          'restrict_academic_background', 'restrict_guardian_family',
          'restrict_disability_medical', 'restrict_disciplinary',
          'restrict_document', 'restrict_applicant_documents'
        ]
      },
      { key: 'applicants',             label: 'Applicants',             actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'student-reporting',      label: 'Student Reporting',      actions: ['view', 'add', 'delete'] },
      { key: 'cohort-session-planner', label: 'Cohort Session Planner', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'classes',                label: 'Classes',                actions: ['view', 'add', 'edit', 'delete', 'status', 'teachers'] }
    ]
  },
  {
    key: 'academics', label: 'Academics', actions: ['view'],
    children: [
      { key: 'academic-years',  label: 'Academic Years',  actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'academic-levels', label: 'Academic Levels', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'terms',            label: 'Terms',            actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'term-types',       label: 'Term Types',       actions: ['view', 'add', 'edit', 'delete'] }
    ]
  },
  {
    key: 'finance', label: 'Finance', actions: ['view'],
    children: [
      { key: 'student-fees-status',      label: 'Student Fees Status',      actions: ['view'] },
      { key: 'summarized-fee-statement', label: 'Summarized Fee Statement', actions: ['view'] },
      {
        key: 'student-finance', label: 'Student Finance', actions: ['view'],
        children: [
          { key: 'student-invoices',       label: 'Student Invoices',       actions: ['view'] },
          { key: 'student-bulk-invoicing', label: 'Student Bulk Invoicing', actions: ['view'] },
          { key: 'student-invoice-adjustments', label: 'Student Invoice Adjustments', actions: ['view', 'add', 'approver', 'allow_backdating'] },
          { key: 'capitation-disbursements',    label: 'Capitation Disbursements',    actions: ['view', 'add'] },
          { key: 'fees-in-kind',                label: 'Fees in Kind',                actions: ['view', 'add'] },
          { key: 'sponsorship-allocations',     label: 'Sponsorship Allocations',     actions: ['view', 'add', 'allow_backdating'] },
          { key: 'sponsorship-managements',     label: 'Sponsorship Managements',     actions: ['view', 'add', 'edit', 'delete'] }
        ]
      },
      { key: 'inter-bank-transfers', label: 'Inter Bank Transfers', actions: ['view', 'add', 'allow_backdating'] },
      {
        key: 'payables', label: 'Payables', actions: ['view'],
        children: [
          { key: 'payment-vouchers',       label: 'Payment Vouchers',       actions: ['view', 'add', 'overdraw_budget', 'allow_backdating'] },
          { key: 'supplier-journal-entry', label: 'Supplier Journal Entry', actions: ['view', 'add'] },
          { key: 'tax-vouchers',           label: 'Tax Vouchers',           actions: ['view', 'add', 'allow_backdating'] },
          { key: 'voucher-postings',       label: 'Voucher Postings',       actions: ['view', 'add', 'allow_backdating', 'distributions'] },
          { key: 'supplier-invoices',      label: 'Supplier Invoices',      actions: ['view', 'add', 'edit', 'delete', 'overdraw_budget', 'allow_backdating'] },
          { key: 'supplier-wht-vat-certificates',  label: 'Supplier WHT VAT Certificates',  actions: ['view', 'add'] },
          { key: 'expense-claims',                 label: 'Expense Claims',                 actions: ['view', 'add', 'overdraw_budget', 'admin', 'allow_backdating'] },
          { key: 'expense-claim-disbursements',    label: 'Expense Claim Disbursements',    actions: ['view', 'add', 'admin'] },
          { key: 'petty-cash-applications',        label: 'Petty Cash Applications',        actions: ['view', 'add', 'overdraw_budget', 'admin', 'allow_backdating'] },
          { key: 'petty-cash-disbursements',       label: 'Petty Cash Disbursements',       actions: ['view', 'add', 'admin', 'allow_backdating'] }
        ]
      }
    ]
  },
  {
    key: 'inventory-management', label: 'Inventory Management', actions: ['view'],
    children: [
      { key: 'inventory-items',      label: 'Inventory Items',      actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'inventory-categories', label: 'Inventory Categories', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'inventory-stock',      label: 'Stock',                actions: ['view', 'add', 'edit'] }
    ]
  },
  {
    key: 'procurement', label: 'Procurement', actions: ['view'],
    children: [
      { key: 'purchase-orders', label: 'Purchase Orders', actions: ['view', 'add', 'edit', 'delete', 'approve'] },
      { key: 'suppliers',       label: 'Suppliers',       actions: ['view', 'add', 'edit', 'delete'] }
    ]
  },
  {
    key: 'human-resource', label: 'Human Resource', actions: ['view'],
    children: [
      { key: 'employees',                 label: 'Employees',                 actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'employee-service-profiles', label: 'Employee Service Profiles', actions: ['view', 'add'] },
      { key: 'leave-management',          label: 'Leave Management',          actions: ['view', 'add', 'approve'] }
    ]
  },
  {
    key: 'payroll', label: 'Payroll', actions: ['view'],
    children: [
      { key: 'payroll-runs',           label: 'Payroll Runs',           actions: ['view', 'add', 'approve'] },
      { key: 'financial-institutions', label: 'Financial Institutions', actions: ['view', 'add', 'edit', 'delete'] }
    ]
  },
  {
    key: 'communication', label: 'Communication', actions: ['view'],
    children: [
      { key: 'sms',   label: 'SMS',   actions: ['view', 'add'] },
      { key: 'email', label: 'Email', actions: ['view', 'add'] }
    ]
  }
];

const ACTION_LABELS = {
  view:                          'View',
  add:                           'Add',
  edit:                          'Edit',
  delete:                        'Delete',
  fee_balance:                   'Fee balance',
  can_edit_student_no:           'Can edit student no',
  hostel_allocation:             'Hostel allocation',
  restrict_academic_background:  'Restrict academic background',
  restrict_guardian_family:      'Restrict guardian family',
  restrict_disability_medical:   'Restrict disability medical',
  restrict_disciplinary:         'Restrict disciplinary',
  restrict_document:             'Restrict document',
  restrict_applicant_documents:  'Restrict applicant documents',
  status:                        'Status',
  teachers:                      'Teachers',
  approver:                      'Approver',
  allow_backdating:              'Allow-backdating',
  overdraw_budget:               'Overdraw budget',
  distributions:                 'Distributions',
  admin:                         'ADMIN',
  approve:                       'Approve'
};

function openRolePermissions(roleId) {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
  const role = findRoleById(roleId);
  if (!role) { showToast('Role not found. Please refresh the Roles list.', 'error'); return; }
  sessionStorage.setItem('permissions-role-id', roleId);
  sessionStorage.setItem('permissions-role-name', role.title || '');
  loadView('admin-role-permissions');
}

function renderAdminRolePermissions(container) {
  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Permissions</h2>
        <div class="role-breadcrumb" id="role-perm-breadcrumb"></div>
      </div>
      <div id="permissions-table-container"></div>
      <div style="margin-top:16px;display:flex;gap:12px;">
        <button class="role-btn-submit" id="perm-save-btn">Save</button>
        <button class="role-btn-cancel" id="perm-cancel-btn">Cancel</button>
      </div>
      <div id="role-perm-status" class="role-form-status" style="margin-top:8px;"></div>
    </div>
  `;
  document.getElementById('perm-save-btn').addEventListener('click', savePermissions);
  document.getElementById('perm-cancel-btn').addEventListener('click', () => loadView('admin-roles'));
  loadPermissionsView();
}

async function loadPermissionsView() {
  const roleId   = sessionStorage.getItem('permissions-role-id');
  const roleName = sessionStorage.getItem('permissions-role-name') || '';

  if (!roleId) {
    showToast('No role selected. Please go back to Roles.', 'error');
    loadView('admin-roles');
    return;
  }

  const bc = document.getElementById('role-perm-breadcrumb');
  if (bc) {
    bc.innerHTML = `Dashboard &rsaquo; Role &rsaquo; <a href="#" class="role-bc-link" onclick="loadView('admin-roles')">${roleName}</a> &rsaquo; Permissions`;
  }

  const container = document.getElementById('permissions-table-container');
  if (container) container.innerHTML = '<p style="padding:16px;color:#777;">Loading&#8230;</p>';

  let currentPermissions = [];
  const res = await apiFetch(`${API_BASE}/roles/${roleId}/`);
  if (res && res.ok) {
    const role = await res.json().catch(() => null);
    currentPermissions = (role && role.permissions) || [];
  } else if (res) {
    showToast('Failed to load current permissions.', 'error');
  }

  const enabledSet = new Set(currentPermissions.map(p => (typeof p === 'string' ? p : p.code)));
  renderPermissionsTable(enabledSet);
}

function renderPermissionsTable(enabledSet) {
  const container = document.getElementById('permissions-table-container');
  if (!container) return;
  container.innerHTML = '';

  const table = document.createElement('table');
  table.className = 'perm-table';

  // ── HEADER ──────────────────────────────────────────────────
  const thead = table.createTHead();
  const hr = thead.insertRow();
  const moduleHeader = document.createElement('th');
  moduleHeader.className = 'perm-th-mod';
  moduleHeader.innerHTML =
    'MODULE &nbsp; <label class="perm-select-all-label">' +
    '<input type="checkbox" id="perm-select-all"> SELECT ALL</label>';
  hr.appendChild(moduleHeader);
  const actionsHeader = document.createElement('th');
  actionsHeader.className = 'perm-th-act';
  actionsHeader.textContent = 'ACTIONS';
  hr.appendChild(actionsHeader);

  // ── BODY ────────────────────────────────────────────────────
  const tbody = table.createTBody();
  PERMISSIONS_TREE.forEach(module => appendPermModule(table, tbody, module, enabledSet, 0));

  container.appendChild(table);

  document.getElementById('perm-select-all').addEventListener('change', (e) => {
    container.querySelectorAll('input[type="checkbox"].perm-action-cb')
      .forEach(cb => { cb.checked = e.target.checked; });
  });
}

// Appends a module's own row to parentTbody, then (if it has children) creates
// a sibling <tbody> of child rows that the expand/collapse toggle shows/hides.
function appendPermModule(table, parentTbody, module, enabledSet, depth) {
  appendModuleRow(parentTbody, module, enabledSet, depth);
  if (!module.children) return;

  const childrenWrapper = document.createElement('tbody');
  childrenWrapper.dataset.parentKey = module.key;
  childrenWrapper.className = 'perm-children perm-children-hidden';
  module.children.forEach(child => appendPermModule(table, childrenWrapper, child, enabledSet, depth + 1));
  table.appendChild(childrenWrapper);
}

function appendModuleRow(tbody, module, enabledSet, depth) {
  const tr = tbody.insertRow();
  tr.dataset.moduleKey = module.key;
  tr.className = 'perm-row perm-depth-' + Math.min(depth, 2);

  // ── MODULE CELL ─────────────────────────────────────────────
  const moduleCell = tr.insertCell();
  moduleCell.className = 'perm-module-cell';

  const hasChildren = !!(module.children && module.children.length);
  if (hasChildren) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'perm-expand-btn';
    toggleBtn.innerHTML = '&#43;';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      toggleBtn.innerHTML = expanded ? '&#43;' : '&#8722;';
      document.querySelectorAll(`.perm-children[data-parent-key="${module.key}"]`)
        .forEach(el => el.classList.toggle('perm-children-hidden', expanded));
    });
    moduleCell.appendChild(toggleBtn);

    const groupCb = document.createElement('input');
    groupCb.type = 'checkbox';
    groupCb.className = 'perm-group-select-all';
    groupCb.title = 'Select all permissions within ' + module.label;
    groupCb.addEventListener('change', (e) => {
      getAllDescendantKeys(module).forEach(k => {
        document.querySelectorAll(`input[type="checkbox"].perm-action-cb[data-module="${k}"]`)
          .forEach(cb => { cb.checked = e.target.checked; });
      });
    });
    moduleCell.appendChild(groupCb);
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'perm-module-name perm-depth-' + Math.min(depth, 2);
  nameSpan.style.marginLeft = (depth * 14) + 'px';
  nameSpan.textContent = module.label;
  moduleCell.appendChild(nameSpan);

  // ── ACTIONS CELL ────────────────────────────────────────────
  const actionsCell = tr.insertCell();
  actionsCell.className = 'perm-actions-cell';

  module.actions.forEach(action => {
    const permCode = module.key + '.' + action;
    const label = document.createElement('label');
    label.className = 'perm-action-label';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'perm-action-cb';
    cb.dataset.module = module.key;
    cb.dataset.action = action;
    cb.dataset.code   = permCode;
    cb.checked = enabledSet.has(permCode);

    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + (ACTION_LABELS[action] || action)));
    actionsCell.appendChild(label);
  });
}

function getAllDescendantKeys(module) {
  const keys = [module.key];
  if (module.children) module.children.forEach(c => keys.push(...getAllDescendantKeys(c)));
  return keys;
}

async function savePermissions() {
  const roleId = sessionStorage.getItem('permissions-role-id');
  if (!roleId) return;

  const checkedBoxes = document.querySelectorAll('input[type="checkbox"].perm-action-cb:checked');
  const permissionCodes = Array.from(checkedBoxes).map(cb => cb.dataset.code);

  const res = await apiFetch(`${API_BASE}/roles/${roleId}/permissions/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission_codes: permissionCodes }),
  });
  if (!res) return;

  const statusEl = document.getElementById('role-perm-status');
  if (res.ok) {
    showToast('Permissions saved successfully.', 'success');
    if (statusEl) statusEl.innerHTML = '<span class="role-status-success">Permissions saved successfully.</span>';
  } else {
    const msg = await parseApiError(res);
    showToast(msg, 'error');
    if (statusEl) statusEl.innerHTML = `<span class="role-status-error">${msg}</span>`;
  }
}

