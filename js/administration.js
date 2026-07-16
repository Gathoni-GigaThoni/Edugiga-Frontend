// ==================== ADMINISTRATION ====================
async function loadAdministrationView(container) {
  await renderSplitView({
    container,
    // Same underlying resource as User Management (GET /team/, and its own
    // onAdd/onEdit already just redirect there) — no distinct registry key
    // exists for "Staff Management" as its own screen, so this reuses
    // administration.users rather than being left ungated.
    moduleKey: 'administration.users',
    title: 'Staff Management',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Administration',view:'user-management'},
      {label:'Staff'}
    ],
    apiUrl: `${API_BASE}/team/?skip=0&limit=1000`,
    searchFields: ['first_name','last_name','email'],
    col1Label: 'Name', col2Label: 'Role',
    col1: u => `${u.first_name||''} ${u.last_name||''}`.trim() || '—',
    col2: u => UM_ROLE_LABELS?.[u.role] || u.role || '—',
    rowLabel: u => `${u.first_name||''} ${u.last_name||''}`.trim() || '—',
    rowSub:   u => u.email || '',
    idKey: 'id',
    detailFields: [
      {label:'Name',  key:'first_name', fmt:(_,u)=>`${u.first_name||''} ${u.last_name||''}`.trim()},
      {label:'Email', key:'email'},
      {label:'Role',  key:'role', fmt:v=>UM_ROLE_LABELS?.[v]||v||'—'},
    ],
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#128100;</div>
        <p style="font-weight:600;margin-bottom:8px">Add Staff</p>
        <p style="font-size:13px;margin-bottom:20px">Manage staff accounts from User Management.</p>
        <button class="btn-primary" style="padding:10px 24px" onclick="loadView('user-management')">Go to User Management</button>
      </div>`;
    },
    onAdd:  () => loadView('user-management'),
    onEdit: item => loadView('user-management'),
  });
}

// ==================== DEPARTMENTS ====================
// Single shared lookup used by Employee, PaymentVoucher and PettyCash — one
// module, one source of truth (BE/FE Contract 2026-07-15 §1).
function _deptBadge(isActive) {
  return isActive
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#8a6d00;background:#f5e6a8;">Active</span>`
    : `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#888;background:#eee;">Archived</span>`;
}

async function loadDepartmentsView(container) {
  await renderSplitView({
    container,
    moduleKey: 'finance.setup',
    title: 'Departments',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Administration',view:'user-management'},
      {label:'Departments'}
    ],
    apiUrl: `${API_BASE}/departments/`,
    searchFields: ['name'],
    col1Label: 'Name', col2Label: 'Status',
    col1: d => d.name || '—',
    col2: d => _deptBadge(d.is_active),
    rowLabel: d => d.name || '—',
    idKey: 'id',
    detailFields: [
      {label:'Name',   key:'name'},
      {label:'Status', key:'is_active', fmt:v=>v?'Active':'Archived'},
    ],
    renderAdd:  el => _deptSplitForm(null, el),
    renderEdit: (item, el) => _deptSplitForm(item, el),
    detailActions: item => item.is_active
      ? `<button class="btn-danger" onclick="_deptArchive(${item.id})">Archive</button>`
      : '',
  });
}

function _deptSplitForm(item, el) {
  const id = item?.id ?? null;
  const isEdit = !!item;
  el.innerHTML = `
    <div style="max-width:420px">
      <h3 class="split-right-add-title">${isEdit ? 'Edit' : 'Add'} Department</h3>
      <div class="stu-form-group">
        <label>Name <span style="color:var(--coral-500)">*</span></label>
        <input id="dept-f-name" value="${_finEsc(item?.name || '')}" style="max-width:none;width:100%">
      </div>
      <div class="stu-form-group" style="margin-top:12px">
        <label><input type="checkbox" id="dept-f-active" style="width:auto;margin:0 6px 0 0;padding:0"${(item ? item.is_active : true) ? ' checked' : ''}> Active</label>
      </div>
      <div id="dept-split-status" style="margin-top:10px;font-size:13px;color:var(--coral-500)"></div>
      <div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn-primary" style="padding:9px 20px" onclick="_deptSaveSplit(${id ?? 'null'})">${isEdit ? 'Update' : 'Save'}</button>
        <button class="btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>
  `;
}

async function _deptSaveSplit(id) {
  const statusEl = document.getElementById('dept-split-status');
  const name = (document.getElementById('dept-f-name')?.value || '').trim();
  const is_active = document.getElementById('dept-f-active')?.checked ?? true;
  if (!name) { if (statusEl) statusEl.textContent = 'Name is required.'; return; }

  const res = await apiFetch(
    id ? `${API_BASE}/departments/${id}` : `${API_BASE}/departments/`,
    { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, is_active }) }
  );
  if (res && res.ok) {
    showToast(id ? 'Department updated.' : 'Department created.', 'success');
    loadView('admin-departments');
  } else if (res && res.status === 409) {
    if (statusEl) statusEl.textContent = 'A department with this name already exists.';
  } else {
    if (statusEl) statusEl.textContent = res ? await parseApiError(res) : 'Save failed.';
  }
}

async function _deptArchive(id) {
  if (!confirm('Archive this department? It will be hidden from pickers but preserved on existing vouchers and employee records.')) return;
  const res = await apiFetch(`${API_BASE}/departments/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    showToast('Department archived.', 'success');
    loadView('admin-departments');
  } else if (res) {
    showToast(await parseApiError(res), 'error');
  }
}

async function loadStaffList() {
  const res = await apiFetch(`${API_BASE}/team/`);
  if (!res || !res.ok) { showToast('Could not load staff list.', 'error'); return; }
  const staff = await res.json();
  let html = `<table><tr><th>Name</th><th>Email</th><th>Role</th><th>Clearance</th></tr>`;
  staff.forEach(m => { html += `<tr><td>${m.first_name} ${m.last_name}</td><td>${m.email}</td><td>${m.role}</td><td>${m.clearance_level}</td></tr>`; });
  html += `</table>`;
  document.getElementById("staff-list").innerHTML = html;
}

function showStaffForm() {
  const form = document.getElementById("staff-form"); form.style.display = "block";
  form.innerHTML = `
    <h3>Create Staff Member</h3>
    <input id="staff_first_name" placeholder="First Name"><input id="staff_last_name" placeholder="Last Name">
    <input id="staff_email" type="email" placeholder="Email"><input id="staff_password" type="password" placeholder="Password">
    <select id="staff_role">
      <option value="super_admin">Super Admin</option><option value="manager">Manager</option><option value="teacher">Teacher</option><option value="kitchen">Kitchen</option><option value="utility">Utility</option>
    </select>
    <select id="staff_clearance">
      <option value="1">Level 1</option><option value="2">Level 2</option><option value="3">Level 3</option><option value="4" selected>Level 4</option><option value="5">Level 5</option>
    </select>
    <input id="staff_location" placeholder="Location"><button onclick="createStaff()">Save Staff</button>
  `;
}

async function createStaff() {
  const payload = {
    first_name: document.getElementById("staff_first_name").value, last_name: document.getElementById("staff_last_name").value,
    email: document.getElementById("staff_email").value, password: document.getElementById("staff_password").value,
    role: document.getElementById("staff_role").value, clearance_level: parseInt(document.getElementById("staff_clearance").value),
    location: document.getElementById("staff_location").value, is_active: true
  };
  const res = await apiFetch(`${API_BASE}/team/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  if (!res) return;
  if (res.ok) {
    showToast("Staff created successfully!", "success");
    loadAdministrationView(document.getElementById("main-content"));
  } else {
    showToast(await parseApiError(res), "error");
  }
}

