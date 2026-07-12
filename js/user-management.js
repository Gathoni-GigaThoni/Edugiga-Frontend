// ==================== USER MANAGEMENT ====================
let umUsers = [];
let umPage  = 1;
let umPerPage = 10;
let _umSearch = '';
let _umEditingId = null;
let _assignRoleUserId = null;

const UM_ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER:     'Manager',
  TEACHER:     'Teacher',
  KITCHEN:     'Kitchen',
  UTILITY:     'Utility',
};

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="um-dd-"]').forEach(d => d.style.display = 'none');
});

// ── List ──────────────────────────────────────────────────────────────────────

async function loadUserManagementView(container) {
  const res = await apiFetch(`${API_BASE}/team/?skip=0&limit=1000`);
  if (res && res.ok) {
    const raw = await res.json().catch(() => []);
    umUsers = Array.isArray(raw) ? raw : (raw.items || raw.data || raw.results || []);
  } else {
    showToast('Could not load users.', 'error');
    umUsers = [];
  }

  await renderSplitView({
    container,
    moduleKey: 'administration.users',
    title: 'User Management',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Administration',view:'user-management'},
      {label:'Users'}
    ],
    apiUrl: `${API_BASE}/team/?skip=0&limit=1000`,
    searchFields: ['first_name','last_name','email'],
    col1Label: 'Name', col2Label: 'Staff Type',
    col1: u => `${u.first_name||''} ${u.last_name||''}`.trim() || '—',
    col2: u => UM_ROLE_LABELS[u.role] || u.role || '—',
    rowLabel: u => `${u.first_name||''} ${u.last_name||''}`.trim() || '—',
    rowSub:   u => u.email || '',
    idKey: 'id',
    detailFields: [
      {label:'Name',          key:'first_name', fmt:(_,u)=>`${u.first_name||''} ${u.last_name||''}`.trim()},
      {label:'Email',         key:'email'},
      {label:'Staff Type',    key:'role', fmt:v=>UM_ROLE_LABELS[v]||v||'—'},
      {label:'Location',      key:'location'},
      {label:'Assigned Role', key:'assigned_role_title', fmt:v=>v||'No role assigned'},
      {label:'Status',        key:'is_active', fmt:v=>v!==false?'Active':'Inactive'},
    ],
    renderAdd:  el => _umSplitForm(null, el),
    renderEdit: (item, el) => _umSplitForm(item, el),
  });
}

function _umSplitForm(item, el) {
  const id = item?.id ?? null;
  const isEdit = !!item;
  const roleOptions = ['SUPER_ADMIN','MANAGER','TEACHER','KITCHEN','UTILITY'].map(r =>
    `<option value="${r}"${item?.role===r?' selected':''}>${UM_ROLE_LABELS[r]||r}</option>`
  ).join('');
  el.innerHTML = `
    <div style="max-width:480px">
      <h3 class="split-right-add-title">${isEdit?'Edit':'Add'} User</h3>
      <div class="stu-form-grid" style="grid-template-columns:1fr 1fr;gap:14px 20px">
        <div class="stu-form-group">
          <label>First Name <span style="color:var(--coral-500)">*</span></label>
          <input id="um-f-first" value="${_umEsc(item?.first_name||'')}" style="max-width:none;width:100%">
        </div>
        <div class="stu-form-group">
          <label>Last Name <span style="color:var(--coral-500)">*</span></label>
          <input id="um-f-last" value="${_umEsc(item?.last_name||'')}" style="max-width:none;width:100%">
        </div>
        <div class="stu-form-group" style="grid-column:span 2">
          <label>Email <span style="color:var(--coral-500)">*</span></label>
          <input id="um-f-email" type="email" value="${_umEsc(item?.email||'')}" style="max-width:none;width:100%">
        </div>
        ${!isEdit?`<div class="stu-form-group" style="grid-column:span 2">
          <label>Password <span style="color:var(--coral-500)">*</span></label>
          <input id="um-f-password" type="password" placeholder="Min 8 characters" style="max-width:none;width:100%">
        </div>`:''}
        <div class="stu-form-group">
          <label>Staff Type <span style="color:var(--coral-500)">*</span></label>
          <select id="um-f-role" style="max-width:none;width:100%">
            <option value="">-- Select --</option>${roleOptions}
          </select>
        </div>
        <div class="stu-form-group">
          <label>Location</label>
          <input id="um-f-location" value="${_umEsc(item?.location||'')}" style="max-width:none;width:100%">
        </div>
        ${isEdit?`<div class="stu-form-group" style="grid-column:span 2">
          <label><input type="checkbox" id="um-f-active" style="width:auto;margin:0 6px 0 0;padding:0"${item?.is_active!==false?' checked':''}> Active</label>
        </div>`:''}
      </div>
      <div id="um-split-status" style="margin-top:10px;font-size:13px;color:var(--coral-500)"></div>
      <div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn-primary" style="padding:9px 20px" onclick="_umSaveSplit('${id||''}')">
          ${isEdit?'Update':'Save'}
        </button>
        <button class="btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>
  `;
}

function _umEsc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function _umSaveSplit(id) {
  const statusEl = document.getElementById('um-split-status');
  const first_name = document.getElementById('um-f-first')?.value.trim();
  const last_name  = document.getElementById('um-f-last')?.value.trim();
  const email      = document.getElementById('um-f-email')?.value.trim();
  const role       = document.getElementById('um-f-role')?.value;
  const location   = document.getElementById('um-f-location')?.value.trim() || '';
  const is_active  = id ? (document.getElementById('um-f-active')?.checked ?? true) : true;

  if (!first_name || !last_name || !email || !role) {
    if (statusEl) statusEl.textContent = 'First name, last name, email, and staff type are required.';
    return;
  }
  let body = { first_name, last_name, email, role, location, is_active };
  if (!id) {
    const password = document.getElementById('um-f-password')?.value || '';
    if (password.length < 8) {
      if (statusEl) statusEl.textContent = 'Password must be at least 8 characters.';
      return;
    }
    body.password = password;
  }
  const res = await apiFetch(
    id ? `${API_BASE}/team/${id}` : `${API_BASE}/team/`,
    { method: id ? 'PATCH' : 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }
  );
  if (res && res.ok) {
    showToast(id ? 'User updated!' : 'User created!', 'success');
    loadView('user-management');
  } else {
    if (statusEl) statusEl.textContent = res ? await parseApiError(res) : 'Save failed.';
  }
}

function renderUmListPage(container) {
  const _canAddUser = canAdd('administration.users');

  container.innerHTML = `
    <div class="um-page">
      <div class="um-header-row">
        <h2 class="um-title">User Management</h2>
        <div class="um-breadcrumb">Dashboard &rsaquo; Administration &rsaquo; User Management</div>
      </div>
      <div class="um-controls-row">
        <div class="um-controls-left">
          Show <select id="um-per-page" onchange="changeUmPerPage(this.value)">
            <option value="10">10</option><option value="25">25</option>
            <option value="50">50</option><option value="100">100</option>
          </select> entries
          &nbsp;|&nbsp; Total <span id="um-total-count">${umUsers.length}</span>
        </div>
        <div class="um-controls-right">
          <input id="um-search-input" placeholder="Search name or email…" onkeyup="handleUmSearch()" class="um-search">
          ${_canAddUser ? `<button class="role-add-btn" onclick="openUmCreateModal()">+ Add User</button>` : ''}
        </div>
      </div>
      <div id="um-table-container"></div>
      <div id="um-pagination"></div>
    </div>

    <!-- Create/Edit User Modal -->
    <div id="um-user-modal" class="role-modal-overlay" style="display:none;" onclick="closeUmModal(event)">
      <div class="role-modal-box um-modal-wide" onclick="event.stopPropagation()">
        <div class="role-modal-header">
          <span id="um-modal-title">Add User</span>
          <button class="role-modal-close" onclick="closeUmModal()">&times;</button>
        </div>
        <div class="role-modal-body">
          <div class="um-modal-grid">
            <div class="role-form-group">
              <label class="role-form-label">First Name <span class="role-required">*</span></label>
              <input type="text" id="um-modal-first-name">
            </div>
            <div class="role-form-group">
              <label class="role-form-label">Last Name <span class="role-required">*</span></label>
              <input type="text" id="um-modal-last-name">
            </div>
            <div class="role-form-group">
              <label class="role-form-label">Email <span class="role-required">*</span></label>
              <input type="email" id="um-modal-email">
            </div>
            <div class="role-form-group" id="um-modal-pwd-group">
              <label class="role-form-label">Password <span class="role-required">*</span></label>
              <input type="password" id="um-modal-password" placeholder="Min 8 characters">
            </div>
            <div class="role-form-group">
              <label class="role-form-label">Staff Type <span class="role-required">*</span></label>
              <select id="um-modal-role">
                <option value="">-- Select --</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="TEACHER">Teacher</option>
                <option value="KITCHEN">Kitchen</option>
                <option value="UTILITY">Utility</option>
              </select>
            </div>
            <div class="role-form-group">
              <label class="role-form-label">Location</label>
              <input type="text" id="um-modal-location">
            </div>
          </div>
          <div style="margin-top:10px;">
            <label class="um-checkbox-label" style="font-size:0.88rem;">
              <input type="checkbox" id="um-modal-active" style="width:auto;margin:0 6px 0 0;padding:0;"> Active
            </label>
          </div>
          <div id="um-modal-status" class="role-form-status" style="margin-top:10px;"></div>
        </div>
        <div class="role-modal-footer">
          <button class="role-btn-submit" id="um-modal-save-btn" onclick="submitUmSave()">Save</button>
          <button class="role-btn-cancel" onclick="closeUmModal()">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Assign Role Modal -->
    <div id="um-assign-modal" class="role-modal-overlay" style="display:none;" onclick="closeAssignRoleModal(event)">
      <div class="role-modal-box" style="max-width:400px;" onclick="event.stopPropagation()">
        <div class="role-modal-header">
          <span>Assign Role</span>
          <button class="role-modal-close" onclick="closeAssignRoleModal()">&times;</button>
        </div>
        <div class="role-modal-body">
          <p id="um-assign-user-name" style="margin:0 0 14px;font-weight:600;color:#2c3e50;"></p>
          <div class="role-form-group">
            <label class="role-form-label">Permission Role</label>
            <select id="um-assign-role-select">
              <option value="">-- No role assigned --</option>
            </select>
          </div>
          <div id="um-assign-status" class="role-form-status" style="margin-top:8px;"></div>
        </div>
        <div class="role-modal-footer">
          <button class="role-btn-submit" onclick="submitAssignRole()">Assign</button>
          <button class="role-btn-cancel" onclick="closeAssignRoleModal()">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('um-per-page').value = String(umPerPage);
  renderUmTable();
}

function handleUmSearch() {
  _umSearch = (document.getElementById('um-search-input')?.value || '').toLowerCase();
  umPage = 1;
  renderUmTable();
}

function changeUmPerPage(val) {
  umPerPage = parseInt(val);
  umPage = 1;
  renderUmTable();
}

function umGoToPage(page) {
  umPage = page;
  renderUmTable();
}

function renderUmTable() {
  const _canEditUser   = canEdit('administration.users');
  const _canAssignRole = canEdit('administration.roles');

  const filtered = _umSearch
    ? umUsers.filter(u => {
        const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
        return name.includes(_umSearch) || (u.email || '').toLowerCase().includes(_umSearch);
      })
    : umUsers;

  const totalEl = document.getElementById('um-total-count');
  if (totalEl) totalEl.textContent = filtered.length;

  const start = (umPage - 1) * umPerPage;
  const pageData = filtered.slice(start, start + umPerPage);

  let html = `<table class="um-table"><thead><tr>
    <th>NAME</th><th>EMAIL</th><th>STAFF TYPE</th><th>LOCATION</th>
    <th>ASSIGNED ROLE</th><th>STATUS</th><th>ACTION</th>
  </tr></thead><tbody>`;

  if (!pageData.length) {
    html += `<tr><td colspan="7" class="um-empty">No records found</td></tr>`;
  } else {
    pageData.forEach(u => {
      const name      = `${u.first_name || ''} ${u.last_name || ''}`.trim() || '—';
      const roleLabel = UM_ROLE_LABELS[u.role] || u.role || '—';
      const badgeCls  = `um-badge-${(u.role || '').toLowerCase()}`;
      const roleChip  = u.assigned_role_title
        ? `<span class="um-role-chip">${u.assigned_role_title}</span>`
        : `<span class="um-no-role-chip" title="No permission role assigned — staff has no module access">No role assigned</span>`;
      const statusChip = u.is_active
        ? `<span class="um-status-active">Active</span>`
        : `<span class="um-status-inactive">Inactive</span>`;

      html += `<tr>
        <td>${name}</td>
        <td>${u.email || '—'}</td>
        <td><span class="um-staff-type-badge ${badgeCls}">${roleLabel}</span></td>
        <td>${u.location || '—'}</td>
        <td>${roleChip}</td>
        <td>${statusChip}</td>
        <td class="um-action-cell">
          <div class="um-action-wrap">
            <button class="um-action-btn" onclick="toggleUmDropdown(event,${u.id})">&#8230;</button>
            <div id="um-dd-${u.id}" class="um-action-dropdown" style="display:none;">
              ${_canEditUser ? `<a href="#" onclick="openUmEditModal(${u.id});return false;">&#9998; Edit Profile</a>` : ''}
              ${_canAssignRole ? `<a href="#" onclick="openAssignRoleModal(${u.id});return false;">&#128274; Assign Role</a>` : ''}
              ${_canEditUser && u.is_active  ? `<a href="#" onclick="deactivateUser(${u.id});return false;" style="color:#e0534a;">&#10005; Deactivate</a>` : ''}
              ${_canEditUser && !u.is_active ? `<a href="#" onclick="activateUser(${u.id});return false;" style="color:#27ae60;">&#10003; Activate</a>` : ''}
            </div>
          </div>
        </td>
      </tr>`;
    });
  }
  html += '</tbody></table>';
  const tc = document.getElementById('um-table-container');
  if (tc) tc.innerHTML = html;

  const totalPages = Math.ceil(filtered.length / umPerPage);
  let pgHtml = '';
  if (totalPages > 1) {
    pgHtml = '<div class="um-pagination">';
    for (let i = 1; i <= totalPages; i++) {
      pgHtml += `<button onclick="umGoToPage(${i})"${i === umPage ? ' class="um-page-active"' : ''}>${i}</button>`;
    }
    pgHtml += '</div>';
  }
  const pgEl = document.getElementById('um-pagination');
  if (pgEl) pgEl.innerHTML = pgHtml;
}

function toggleUmDropdown(event, userId) {
  event.stopPropagation();
  document.querySelectorAll('[id^="um-dd-"]').forEach(d => {
    if (d.id !== `um-dd-${userId}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`um-dd-${userId}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// ── Create / Edit Modal ───────────────────────────────────────────────────────

function _umModalReset() {
  document.getElementById('um-modal-first-name').value = '';
  document.getElementById('um-modal-last-name').value  = '';
  document.getElementById('um-modal-email').value      = '';
  document.getElementById('um-modal-password').value   = '';
  document.getElementById('um-modal-role').value       = '';
  document.getElementById('um-modal-location').value   = '';
  document.getElementById('um-modal-active').checked   = true;
  document.getElementById('um-modal-status').innerHTML = '';
}

function openUmCreateModal() {
  _umEditingId = null;
  _umModalReset();
  document.getElementById('um-modal-title').textContent = 'Add User';
  document.getElementById('um-modal-pwd-group').style.display = '';
  document.getElementById('um-user-modal').style.display = 'flex';
}

function openUmEditModal(userId) {
  document.querySelectorAll('[id^="um-dd-"]').forEach(d => d.style.display = 'none');
  const u = umUsers.find(x => x.id === userId);
  if (!u) return;
  _umEditingId = userId;
  _umModalReset();
  document.getElementById('um-modal-title').textContent     = 'Edit User';
  document.getElementById('um-modal-first-name').value      = u.first_name  || '';
  document.getElementById('um-modal-last-name').value       = u.last_name   || '';
  document.getElementById('um-modal-email').value           = u.email       || '';
  document.getElementById('um-modal-role').value            = u.role        || '';
  document.getElementById('um-modal-location').value        = u.location    || '';
  document.getElementById('um-modal-active').checked        = u.is_active !== false;
  document.getElementById('um-modal-pwd-group').style.display = 'none';
  document.getElementById('um-user-modal').style.display = 'flex';
}

function closeUmModal(event) {
  const modal = document.getElementById('um-user-modal');
  if (!modal) return;
  if (event && event.target !== modal) return;
  modal.style.display = 'none';
}

async function submitUmSave() {
  const statusEl = document.getElementById('um-modal-status');
  const first_name = document.getElementById('um-modal-first-name').value.trim();
  const last_name  = document.getElementById('um-modal-last-name').value.trim();
  const email      = document.getElementById('um-modal-email').value.trim();
  const role       = document.getElementById('um-modal-role').value;
  const location   = document.getElementById('um-modal-location').value.trim();
  const is_active  = document.getElementById('um-modal-active').checked;

  if (!first_name || !last_name || !email || !role) {
    statusEl.innerHTML = '<span class="role-status-error">First name, last name, email, and staff type are required.</span>';
    return;
  }

  if (!_umEditingId) {
    // Create
    const password = document.getElementById('um-modal-password').value;
    if (!password || password.length < 8) {
      statusEl.innerHTML = '<span class="role-status-error">Password must be at least 8 characters.</span>';
      return;
    }
    const res = await apiFetch(`${API_BASE}/team/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name, last_name, email, password, role, location, is_active }),
    });
    if (!res) return;
    if (res.ok) {
      const created = await res.json().catch(() => null);
      if (created) umUsers.unshift(created);
      showToast('User created!', 'success');
      document.getElementById('um-user-modal').style.display = 'none';
      renderUmTable();
    } else {
      statusEl.innerHTML = `<span class="role-status-error">${await parseApiError(res)}</span>`;
    }
  } else {
    // Edit
    const res = await apiFetch(`${API_BASE}/team/${_umEditingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name, last_name, email, role, location, is_active }),
    });
    if (!res) return;
    if (res.ok) {
      const updated = await res.json().catch(() => null);
      const idx = umUsers.findIndex(u => u.id === _umEditingId);
      if (idx !== -1) umUsers[idx] = { ...umUsers[idx], ...(updated || {}), first_name, last_name, email, role, location, is_active };
      showToast('User updated!', 'success');
      document.getElementById('um-user-modal').style.display = 'none';
      renderUmTable();
    } else {
      statusEl.innerHTML = `<span class="role-status-error">${await parseApiError(res)}</span>`;
    }
  }
}

// ── Activate / Deactivate ─────────────────────────────────────────────────────

async function _patchUserActive(userId, is_active) {
  document.querySelectorAll('[id^="um-dd-"]').forEach(d => d.style.display = 'none');
  const res = await apiFetch(`${API_BASE}/team/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active }),
  });
  if (!res) return;
  if (res.ok) {
    const idx = umUsers.findIndex(u => u.id === userId);
    if (idx !== -1) umUsers[idx].is_active = is_active;
    showToast(is_active ? 'User activated.' : 'User deactivated.', 'success');
    renderUmTable();
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

async function deactivateUser(userId) {
  if (!confirm('Deactivate this user?')) return;
  await _patchUserActive(userId, false);
}

async function activateUser(userId) {
  await _patchUserActive(userId, true);
}

// ── Assign Role Modal ─────────────────────────────────────────────────────────

async function openAssignRoleModal(userId) {
  document.querySelectorAll('[id^="um-dd-"]').forEach(d => d.style.display = 'none');
  const u = umUsers.find(x => x.id === userId);
  if (!u) return;
  _assignRoleUserId = userId;

  const nameEl   = document.getElementById('um-assign-user-name');
  const selectEl = document.getElementById('um-assign-role-select');
  const statusEl = document.getElementById('um-assign-status');

  nameEl.textContent = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  selectEl.innerHTML = '<option value="">-- No role assigned --</option>';
  statusEl.innerHTML = '';
  document.getElementById('um-assign-modal').style.display = 'flex';

  const res = await apiFetch(`${API_BASE}/roles/?page=1&per_page=100`);
  if (res && res.ok) {
    const data = await res.json().catch(() => ({}));
    const roles = data.items || data.data || (Array.isArray(data) ? data : []);
    roles.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.title;
      if (u.role_id != null && String(r.id) === String(u.role_id)) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }
}

function closeAssignRoleModal(event) {
  const modal = document.getElementById('um-assign-modal');
  if (!modal) return;
  if (event && event.target !== modal) return;
  modal.style.display = 'none';
}

async function submitAssignRole() {
  const userId   = _assignRoleUserId;
  if (!userId) return;
  const selectEl = document.getElementById('um-assign-role-select');
  const statusEl = document.getElementById('um-assign-status');
  const role_id  = selectEl.value ? parseInt(selectEl.value) : null;

  const res = await apiFetch(`${API_BASE}/team/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role_id }),
  });
  if (!res) return;
  if (res.ok) {
    const updated = await res.json().catch(() => null);
    const idx = umUsers.findIndex(u => u.id === userId);
    if (idx !== -1) {
      umUsers[idx].role_id = role_id;
      umUsers[idx].assigned_role_title = updated?.assigned_role_title
        || (role_id ? selectEl.options[selectEl.selectedIndex]?.textContent : null);
    }
    showToast(role_id ? 'Role assigned!' : 'Role cleared.', 'success');
    document.getElementById('um-assign-modal').style.display = 'none';
    renderUmTable();
  } else {
    statusEl.innerHTML = `<span class="role-status-error">${await parseApiError(res)}</span>`;
  }
}
