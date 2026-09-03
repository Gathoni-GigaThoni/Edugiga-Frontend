// ==================== USER MANAGEMENT ====================
let umUsers = [];
let umRoles = [];   // permission roles from Administration > Roles

// TeamRead.role is the StaffRole enum — a job label, NOT a permission grant.
// Module access comes from TeamRead.role_id, the FK to a Role created under
// Administration > Roles: the backend filters GET /administration/modules by
// that role's RolePermission rows, and config.js's canView/canAdd/canEdit read
// the result. A user with role_id null therefore sees nothing but the shell.
const UM_ROLE_LABELS = {
  super_admin: 'Super Admin',
  manager:     'Manager',
  teacher:     'Teacher',
  kitchen:     'Kitchen',
  utility:     'Utility',
};

// ── List ──────────────────────────────────────────────────────────────────────

async function _umLoadRoles() {
  const res = await apiFetch(`${API_BASE}/roles/?page=1&per_page=1000`);
  if (res && res.ok) {
    const data = await res.json().catch(() => ({}));
    umRoles = data.items || data.data || (Array.isArray(data) ? data : []);
  } else {
    umRoles = [];
  }
}

async function loadUserManagementView(container) {
  await _umLoadRoles();
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
      {label:'Permission Role', key:'assigned_role_title',
        fmt:(v,u)=>v || _umRoleTitle(u.role_id) || 'No role assigned — this user has no module access'},
      {label:'Status',        key:'is_active', fmt:v=>v!==false?'Active':'Inactive'},
    ],
    renderAdd:  el => _umSplitForm(null, el),
    renderEdit: (item, el) => _umSplitForm(item, el),
    detailActions: u => canEdit('administration.roles') ? _umAssignRoleRow(u) : '',
  });
}

function _umRoleTitle(roleId) {
  if (roleId == null) return '';
  const r = umRoles.find(x => String(x.id) === String(roleId));
  return r ? r.title : `Role #${roleId}`;
}

// PATCH /team/{id}/role is the only endpoint that moves role_id — TeamUpdate
// (PATCH /team/{id}) has no role_id field at all, so profile edits can never
// carry the assignment.
async function _umPatchRole(userId, role_id) {
  const res = await apiFetch(`${API_BASE}/team/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role_id }),
  });
  return res;
}

// Rendered into the detail pane's action row: the one place a permission role
// gets attached to a set of login credentials.
function _umAssignRoleRow(u) {
  if (!umRoles.length) {
    return `<span style="font-size:13px;color:var(--grey-400)">No permission roles exist yet — create one under Administration &rsaquo; Roles.</span>`;
  }
  const opts = ['<option value="">-- No role assigned --</option>']
    .concat(umRoles.map(r =>
      `<option value="${r.id}"${String(r.id) === String(u.role_id) ? ' selected' : ''}>${_umEsc(r.title)}</option>`
    )).join('');
  return `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <label style="font-size:13px;color:var(--grey-500)">Permission Role</label>
      <select id="um-assign-role" style="max-width:220px">${opts}</select>
      <button class="btn" onclick="_umAssignRole(${u.id})">Assign</button>
    </div>`;
}

async function _umAssignRole(userId) {
  const sel = document.getElementById('um-assign-role');
  if (!sel) return;
  const role_id = sel.value ? parseInt(sel.value, 10) : null;
  const res = await _umPatchRole(userId, role_id);
  if (!res) return;
  if (res.ok) {
    showToast(role_id ? 'Permission role assigned.' : 'Permission role cleared.', 'success');
    loadView('user-management');
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

function _umSplitForm(item, el) {
  const id = item?.id ?? null;
  const isEdit = !!item;
  const roleOptions = ['super_admin','manager','teacher','kitchen','utility'].map(r =>
    `<option value="${r}"${item?.role===r?' selected':''}>${UM_ROLE_LABELS[r]||r}</option>`
  ).join('');
  const canAssignRole   = canEdit('administration.roles');
  const permRoleOptions = umRoles.map(r =>
    `<option value="${r.id}"${String(r.id)===String(item?.role_id)?' selected':''}>${_umEsc(r.title)}</option>`
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
          <label>Location <span style="color:var(--coral-500)">*</span></label>
          <input id="um-f-location" value="${_umEsc(item?.location||'')}" style="max-width:none;width:100%">
        </div>
        <div class="stu-form-group" style="grid-column:span 2">
          <label>Permission Role</label>
          <select id="um-f-role-id" style="max-width:none;width:100%"${canAssignRole?'':' disabled'}>
            <option value="">-- No role assigned --</option>${permRoleOptions}
          </select>
          <div style="font-size:12px;color:var(--grey-400);margin-top:4px">
            Staff Type is a job label. This is what grants module access &mdash; without it the user can log in but sees nothing.
          </div>
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

  if (!first_name || !last_name || !email || !role || !location) {
    if (statusEl) statusEl.textContent = 'First name, last name, email, staff type, and location are required.';
    return;
  }
  const roleIdEl = document.getElementById('um-f-role-id');
  const role_id  = roleIdEl && !roleIdEl.disabled
    ? (roleIdEl.value ? parseInt(roleIdEl.value, 10) : null)
    : undefined;   // undefined = caller may not assign roles; leave it alone

  let body = { first_name, last_name, email, role, location, is_active };
  if (!id) {
    const password = document.getElementById('um-f-password')?.value || '';
    if (password.length < 8) {
      if (statusEl) statusEl.textContent = 'Password must be at least 8 characters.';
      return;
    }
    body.password = password;
    // TeamCreate takes role_id, so a new login gets its permissions in one call.
    if (role_id !== undefined) body.role_id = role_id;
  }
  const res = await apiFetch(
    id ? `${API_BASE}/team/${id}` : `${API_BASE}/team/`,
    { method: id ? 'PATCH' : 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }
  );
  if (res && res.ok) {
    // TeamUpdate has no role_id field — on edit the assignment is a second,
    // dedicated call, and only when it actually changed.
    if (id && role_id !== undefined) {
      const before = umUsers.find(u => String(u.id) === String(id));
      const changed = String(before?.role_id ?? '') !== String(role_id ?? '');
      if (changed) {
        const rres = await _umPatchRole(id, role_id);
        if (!rres || !rres.ok) {
          if (statusEl) statusEl.textContent = rres
            ? `Profile saved, but the permission role did not: ${await parseApiError(rres)}`
            : 'Profile saved, but the permission role did not.';
          return;
        }
      }
    }
    showToast(id ? 'User updated!' : 'User created!', 'success');
    loadView('user-management');
  } else {
    if (statusEl) statusEl.textContent = res ? await parseApiError(res) : 'Save failed.';
  }
}
