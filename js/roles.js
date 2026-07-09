// ==================== ROLES ====================
let rolesData    = [];
let rolesPage    = 1;
let rolesPerPage = 10;
let rolesTotal   = 0;
let _permMatrix  = null;    // cached from GET /roles/permissions/matrix
let _roleStaffCounts = {};  // { role_id: count } derived from team list

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
});

function _findRoleById(id) {
  return rolesData.find(r => String(r.id) === String(id));
}

// ── Permission Matrix Cache ───────────────────────────────────────────────────

async function _loadPermMatrix() {
  if (_permMatrix) return _permMatrix;
  const res = await apiFetch(`${API_BASE}/roles/permissions/matrix`);
  if (res && res.ok) {
    _permMatrix = await res.json().catch(() => ({}));
  } else {
    _permMatrix = {};
    showToast('Could not load permissions matrix.', 'error');
  }
  return _permMatrix;
}

// ── Staff Counts ─────────────────────────────────────────────────────────────

async function _loadStaffCounts() {
  const res = await apiFetch(`${API_BASE}/team/?skip=0&limit=1000`);
  if (res && res.ok) {
    const raw = await res.json().catch(() => []);
    const list = Array.isArray(raw) ? raw : (raw.items || raw.data || raw.results || []);
    _roleStaffCounts = {};
    list.forEach(m => {
      if (m.role_id != null) {
        _roleStaffCounts[m.role_id] = (_roleStaffCounts[m.role_id] || 0) + 1;
      }
    });
  }
}

// ── Roles List ────────────────────────────────────────────────────────────────

async function loadRolesListingView(container) {
  await renderSplitView({
    container,
    title: 'Roles',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Administration',view:'admin-roles'},
      {label:'Roles'}
    ],
    apiUrl: `${API_BASE}/roles/?page=1&per_page=1000`,
    searchFields: ['title','description'],
    col1Label: 'Title', col2Label: 'Description',
    col1: r => r.title || '—',
    col2: r => r.description || '—',
    rowLabel: r => r.title || '—',
    rowSub:   r => r.description || '',
    idKey: 'id',
    detailFields: [
      {label:'Title',       key:'title'},
      {label:'Description', key:'description', fmt:v=>v||'—'},
    ],
    // JSON.stringify(item.title) yields a double-quoted JS string literal, which
    // can't be embedded raw inside this onclick attribute (also double-quoted) —
    // any title containing a `"` truncates the attribute at that quote, leaving
    // a broken/incomplete inline handler that throws "Unexpected end of input"
    // the moment it's clicked. _finEsc HTML-entity-escapes the quotes so the
    // browser reconstructs the original JS string correctly after unescaping.
    detailActions: item => `<button class="btn" onclick="openRolePermissions(${JSON.stringify(item.id)}, ${_finEsc(JSON.stringify(item.title || ''))})">&#128274; Permissions</button>`,
    renderAdd: el => {
      el.innerHTML = `
        <div style="max-width:420px">
          <h3 class="split-right-add-title">Create Role</h3>
          <div class="stu-form-group">
            <label>Title <span style="color:var(--coral-500)">*</span></label>
            <input id="create-role-title" style="max-width:none;width:100%" placeholder="Role title">
          </div>
          <div class="stu-form-group" style="margin-top:14px">
            <label>Description</label>
            <input id="create-role-desc" style="max-width:none;width:100%" placeholder="Optional description">
          </div>
          <div id="create-role-status" style="margin-top:8px;font-size:13px;color:var(--coral-500)"></div>
          <div style="display:flex;gap:12px;margin-top:20px">
            <button class="btn-primary" style="padding:9px 20px" onclick="_roleSubmitSplit()">Create</button>
            <button class="btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
          </div>
        </div>`;
    },
    onEdit: item => openRoleEdit(item),
  });
}

async function _roleSubmitSplit() {
  const title = (document.getElementById('create-role-title')?.value || '').trim();
  const desc  = (document.getElementById('create-role-desc')?.value  || '').trim() || null;
  const statusEl = document.getElementById('create-role-status');
  if (!title) { if (statusEl) statusEl.textContent = 'Title is required.'; return; }
  if (statusEl) statusEl.textContent = '';
  const res = await apiFetch(`${API_BASE}/roles/`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ title, description: desc }),
  });
  if (!res) return;
  if (res.ok) {
    showToast('Role created!', 'success');
    loadView('admin-roles');
  } else {
    if (statusEl) statusEl.textContent = await parseApiError(res);
  }
}

function renderRoleListPage(container) {
  const canAdd    = hasPermission('administration.roles', 'can_add');
  const canDelete = hasPermission('administration.roles', 'can_delete');

  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Roles</h2>
        <div class="role-breadcrumb">Dashboard &rsaquo; Administration &rsaquo; Roles</div>
      </div>
      <div class="role-controls-row">
        <div class="role-controls-left">
          Show <select id="role-per-page" onchange="changeRolePerPage(this.value)">
            <option value="10">10</option><option value="25">25</option>
            <option value="50">50</option><option value="100">100</option>
          </select> entries
          &nbsp;|&nbsp; Total <span id="role-total-count">${rolesTotal}</span> entries
        </div>
        <div class="role-controls-right">
          ${canAdd ? `<button class="role-add-btn" onclick="openCreateRoleModal()">+ Create Role</button>` : ''}
        </div>
      </div>
      <div id="role-table-container"></div>
      <div id="role-pagination"></div>
    </div>

    <div id="create-role-modal" class="role-modal-overlay" style="display:none;" onclick="closeCreateRoleModal(event)">
      <div class="role-modal-box" onclick="event.stopPropagation()">
        <div class="role-modal-header">
          <span>Create Role</span>
          <button class="role-modal-close" onclick="closeCreateRoleModal()">&times;</button>
        </div>
        <div class="role-modal-body">
          <div class="role-form-group">
            <label class="role-form-label">Title <span class="role-required">*</span></label>
            <input type="text" id="create-role-title" placeholder="Role title">
          </div>
          <div class="role-form-group">
            <label class="role-form-label">Description</label>
            <input type="text" id="create-role-desc" placeholder="Optional description">
          </div>
          <div id="create-role-status" class="role-form-status"></div>
        </div>
        <div class="role-modal-footer">
          <button class="role-btn-submit" onclick="submitCreateRole()">Create</button>
          <button class="role-btn-cancel" onclick="closeCreateRoleModal()">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('role-per-page').value = String(rolesPerPage);
  renderRoleTable();
}

function renderRoleTable() {
  const canDelete = hasPermission('administration.roles', 'can_delete');

  let html = `<table class="role-table"><thead><tr>
    <th>TITLE</th><th>DESCRIPTION</th><th>STAFF</th><th>ACTION</th>
  </tr></thead><tbody>`;

  if (!rolesData.length) {
    html += `<tr><td colspan="4" class="role-empty">No roles found</td></tr>`;
  } else {
    rolesData.forEach(r => {
      const staffCount  = _roleStaffCounts[r.id] || 0;
      const isSuperAdmin = r.title === 'Super Admin';
      html += `<tr>
        <td>${r.title}</td>
        <td>${r.description || '<span style="color:#aaa">—</span>'}</td>
        <td>${staffCount}</td>
        <td class="role-action-cell">
          <div class="role-action-wrap">
            <button class="role-action-btn" onclick="toggleRoleDropdown(event,'${r.id}')">&#8230;</button>
            <div id="role-dd-${r.id}" class="role-action-dropdown" style="display:none;">
              <a href="#" onclick="openRoleEdit('${r.id}');return false;">&#9998; Edit</a>
              ${canDelete && !isSuperAdmin
                ? `<a href="#" onclick="deleteRole('${r.id}');return false;" style="color:#e0534a;">&#128465; Delete</a>`
                : ''}
            </div>
          </div>
        </td>
      </tr>`;
    });
  }
  html += '</tbody></table>';
  document.getElementById('role-table-container').innerHTML = html;

  const totalPages = Math.ceil(rolesTotal / rolesPerPage);
  let pgHtml = '';
  if (totalPages > 1) {
    pgHtml = '<div class="role-pagination">';
    for (let i = 1; i <= totalPages; i++) {
      pgHtml += `<button onclick="goToRolePage(${i})"${i === rolesPage ? ' class="role-page-active"' : ''}>${i}</button>`;
    }
    pgHtml += '</div>';
  }
  document.getElementById('role-pagination').innerHTML = pgHtml;
}

function changeRolePerPage(val) {
  rolesPerPage = parseInt(val);
  rolesPage = 1;
  loadRolesListingView(document.getElementById('main-content'));
}

function goToRolePage(page) {
  rolesPage = page;
  loadRolesListingView(document.getElementById('main-content'));
}

function toggleRoleDropdown(event, roleId) {
  event.stopPropagation();
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => {
    if (d.id !== `role-dd-${roleId}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`role-dd-${roleId}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// ── Create Role Modal ─────────────────────────────────────────────────────────

function openCreateRoleModal() {
  document.getElementById('create-role-title').value = '';
  document.getElementById('create-role-desc').value  = '';
  document.getElementById('create-role-status').innerHTML = '';
  document.getElementById('create-role-modal').style.display = 'flex';
}

function closeCreateRoleModal(event) {
  const modal = document.getElementById('create-role-modal');
  if (!modal) return;
  if (event && event.target !== modal) return;
  modal.style.display = 'none';
}

async function submitCreateRole() {
  const title   = (document.getElementById('create-role-title').value || '').trim();
  const desc    = (document.getElementById('create-role-desc').value  || '').trim() || null;
  const statusEl = document.getElementById('create-role-status');

  if (!title) {
    statusEl.innerHTML = '<span class="role-status-error">Title is required.</span>';
    return;
  }
  statusEl.innerHTML = '';

  const res = await apiFetch(`${API_BASE}/roles/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description: desc }),
  });
  if (!res) return;
  if (res.ok) {
    showToast('Role created!', 'success');
    document.getElementById('create-role-modal').style.display = 'none';
    loadRolesListingView(document.getElementById('main-content'));
  } else {
    statusEl.innerHTML = `<span class="role-status-error">${await parseApiError(res)}</span>`;
  }
}

// ── Delete Role ───────────────────────────────────────────────────────────────

async function deleteRole(roleId) {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
  const role = _findRoleById(roleId);
  if (!confirm(`Delete role "${role?.title || roleId}"? This cannot be undone.`)) return;

  const res = await apiFetch(`${API_BASE}/roles/${roleId}`, { method: 'DELETE' });
  if (!res) return;

  if (res.ok || res.status === 204) {
    showToast('Role deleted.', 'success');
    loadRolesListingView(document.getElementById('main-content'));
  } else if (res.status === 409) {
    let countText = '';
    try {
      const body = await res.json();
      const m = String(body?.detail || '').match(/(\d+)/);
      if (m) countText = ` [${m[1]} staff member${m[1] === '1' ? '' : 's'}]`;
    } catch (_) {}
    showToast(
      `This role is assigned to staff members${countText}. Reassign them before deleting.`,
      'error'
    );
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

// ── Role Edit Page (two-panel) ────────────────────────────────────────────────

function openRoleEdit(roleOrId) {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
  // Callers pass either the full role object (split-view detail panel, which
  // already has the row data in hand) or a bare id (legacy dropdown row action).
  // rolesData is not populated by the split-view list, so falling back to
  // _findRoleById for a bare id only helps the legacy path — the object path
  // never depended on that stale cache.
  const role = (roleOrId && typeof roleOrId === 'object') ? roleOrId : _findRoleById(roleOrId);
  if (!role) { showToast('Role not found. Refresh the list.', 'error'); return; }
  sessionStorage.setItem('edit-role-id', role.id);
  sessionStorage.setItem('edit-role-title', role.title || '');
  loadView('admin-role-edit');
}

// Row-level "Permissions" shortcut — lands on the same edit page as openRoleEdit
// (title/description + permission matrix are one merged page), but takes the
// id/title straight from the clicked row instead of looking anything up, so it
// has no dependency on rolesData.
function openRolePermissions(roleId, roleTitle) {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
  sessionStorage.setItem('edit-role-id', roleId);
  sessionStorage.setItem('edit-role-title', roleTitle || '');
  loadView('admin-role-edit');
}

async function renderRoleEditPage(container) {
  const roleId   = sessionStorage.getItem('edit-role-id');
  const roleName = sessionStorage.getItem('edit-role-title') || '';

  if (!roleId) { loadView('admin-roles'); return; }

  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Edit Role</h2>
        <div class="role-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="role-bc-link" onclick="loadView('admin-roles')">Roles</a>
          &rsaquo; ${_finEsc(roleName)}
        </div>
      </div>
      <div class="role-edit-panels">
        <div class="role-edit-left">
          <div class="role-form-wrap" style="max-width:100%">
            <div class="role-form-group">
              <label class="role-form-label">Title <span class="role-required">*</span></label>
              <input type="text" id="role-edit-title" value="${_finEsc(roleName)}">
            </div>
            <div class="role-form-group">
              <label class="role-form-label">Description</label>
              <input type="text" id="role-edit-desc" placeholder="Optional description">
            </div>
            <div class="role-form-actions">
              <button class="role-btn-submit" onclick="submitRoleDetailsUpdate('${roleId}')">Update</button>
              <button class="role-btn-cancel" onclick="loadView('admin-roles')">Cancel</button>
            </div>
            <div id="role-edit-status" class="role-form-status"></div>
          </div>
        </div>
        <div class="role-edit-right">
          <div id="perm-matrix-container" class="perm-matrix-wrap">
            <p style="color:#777;padding:8px 0;">Loading permissions…</p>
          </div>
          <div style="margin-top:14px;display:flex;gap:12px;align-items:center;">
            <button class="role-btn-submit" onclick="savePermissions('${roleId}')">Save Permissions</button>
            <span id="perm-save-status" class="role-form-status" style="margin:0;"></span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Fetch role details, permission matrix, and current permissions in parallel
  const [roleRes, matrix] = await Promise.all([
    apiFetch(`${API_BASE}/roles/${roleId}`),
    _loadPermMatrix(),
  ]);

  if (roleRes && roleRes.ok) {
    const rd = await roleRes.json().catch(() => null);
    if (rd) {
      const descEl = document.getElementById('role-edit-desc');
      if (descEl) descEl.value = rd.description || '';
    }
  }

  let currentPerms = {};
  const permRes = await apiFetch(`${API_BASE}/roles/${roleId}/permissions`);
  if (permRes && permRes.ok) {
    const data = await permRes.json().catch(() => null);
    const list = data?.permissions || (Array.isArray(data) ? data : []);
    list.forEach(p => {
      currentPerms[p.module_key] = {
        can_view: p.can_view, can_add: p.can_add,
        can_edit: p.can_edit, can_delete: p.can_delete,
      };
    });
  }

  renderPermMatrix(document.getElementById('perm-matrix-container'), matrix, currentPerms);
}

// ── Update Role Details ───────────────────────────────────────────────────────

async function submitRoleDetailsUpdate(roleId) {
  const title   = (document.getElementById('role-edit-title').value || '').trim();
  const desc    = (document.getElementById('role-edit-desc').value  || '').trim() || null;
  const statusEl = document.getElementById('role-edit-status');

  if (!title) {
    statusEl.innerHTML = '<span class="role-status-error">Title is required.</span>';
    return;
  }

  const res = await apiFetch(`${API_BASE}/roles/${roleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description: desc }),
  });
  if (!res) return;
  if (res.ok) {
    const idx = rolesData.findIndex(r => String(r.id) === String(roleId));
    if (idx !== -1) rolesData[idx] = { ...rolesData[idx], title, description: desc };
    sessionStorage.setItem('edit-role-title', title);
    statusEl.innerHTML = '<span class="role-status-success">Role updated!</span>';
    showToast('Role updated!', 'success');
  } else {
    statusEl.innerHTML = `<span class="role-status-error">${await parseApiError(res)}</span>`;
  }
}

// ── Permission Matrix Rendering ───────────────────────────────────────────────

const _PERM_ACTIONS = ['view', 'add', 'edit', 'delete'];

// Backend module_key format for nested modules is `${topLevelKey}.${leafKey}`
// (confirmed live: Payroll Runs/Payslips permission is literally `payroll.payslips`,
// see be-fe-contract memory) — NOT the bare leaf key. Some groups (e.g.
// payroll > Utilities > Pay Grades) nest a third level deep purely for UI
// grouping; this walks through any depth of pure-grouping nodes (def.children,
// no def.actions of their own) and still flattens to the 2-segment
// `topLevelKey.leafKey` module_key, dropping the intermediate group label.
function _permFlattenLeaves(children, topKey, depth) {
  let out = [];
  for (const [key, def] of Object.entries(children)) {
    if (def.children) {
      out = out.concat(_permFlattenLeaves(def.children, topKey, depth + 1));
    } else if (def.actions) {
      out.push({ moduleKey: `${topKey}.${key}`, def, depth });
    }
  }
  return out;
}

function renderPermMatrix(container, matrix, currentPerms) {
  if (!container) return;
  if (!matrix || !Object.keys(matrix).length) {
    container.innerHTML = '<p style="color:#888;padding:8px 0;">No permissions defined.</p>';
    return;
  }

  let rows = '';

  for (const [key, def] of Object.entries(matrix)) {
    const hasChildren = !!(def.children && Object.keys(def.children).length);

    if (hasChildren) {
      rows += `<tr class="perm-row perm-group-row">
        <td class="perm-module-cell" colspan="5">
          <button type="button" class="perm-expand-btn" aria-expanded="false"
            onclick="togglePermChildren('${key}',this)">+</button>
          <span class="perm-module-name perm-depth-0">${def.label}</span>
        </td>
      </tr>`;

      const leaves = _permFlattenLeaves(def.children, key, 1);
      leaves.forEach(leaf => {
        const p = currentPerms[leaf.moduleKey] || {};
        const supported = new Set(leaf.def.actions || _PERM_ACTIONS);
        rows += `<tr class="perm-row perm-depth-1 perm-child-row" data-parent-key="${key}" style="display:none">
          <td class="perm-module-cell">
            <span class="perm-module-name perm-depth-1" style="margin-left:${40 + (leaf.depth - 1) * 20}px">${leaf.def.label}</span>
          </td>`;
        _PERM_ACTIONS.forEach(action => {
          const ok = supported.has(action);
          rows += `<td class="perm-cb-cell"><input type="checkbox" class="perm-action-cb"
            data-module="${leaf.moduleKey}" data-action="${action}"
            ${ok && p[`can_${action}`] ? 'checked' : ''}
            ${!ok ? 'disabled' : ''}></td>`;
        });
        rows += '</tr>';
      });
    } else if (def.actions) {
      const p = currentPerms[key] || {};
      const supported = new Set(def.actions);
      rows += `<tr class="perm-row perm-depth-0">
        <td class="perm-module-cell">
          <span class="perm-module-name perm-depth-0" style="margin-left:26px">${def.label}</span>
        </td>`;
      _PERM_ACTIONS.forEach(action => {
        const ok = supported.has(action);
        rows += `<td class="perm-cb-cell"><input type="checkbox" class="perm-action-cb"
          data-module="${key}" data-action="${action}"
          ${ok && p[`can_${action}`] ? 'checked' : ''}
          ${!ok ? 'disabled' : ''}></td>`;
      });
      rows += '</tr>';
    }
  }

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <strong style="font-size:0.9rem;color:#2c3e50;">Module Permissions</strong>
      <label style="font-size:0.82rem;display:inline-flex;align-items:center;gap:5px;cursor:pointer;color:#555;">
        <input type="checkbox" id="perm-select-all" style="width:auto;margin:0;padding:0;"> SELECT ALL
      </label>
    </div>
    <table class="perm-table">
      <thead><tr>
        <th class="perm-th-mod">MODULE</th>
        <th class="perm-th-act">VIEW</th>
        <th class="perm-th-act">ADD</th>
        <th class="perm-th-act">EDIT</th>
        <th class="perm-th-act">DELETE</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  document.getElementById('perm-select-all')?.addEventListener('change', e => {
    container.querySelectorAll('input.perm-action-cb:not(:disabled)')
      .forEach(cb => { cb.checked = e.target.checked; });
  });
}

function togglePermChildren(groupKey, btn) {
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  document.querySelectorAll(`.perm-child-row[data-parent-key="${groupKey}"]`).forEach(row => {
    row.style.display = expanded ? 'none' : '';
  });
  btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  btn.innerHTML = expanded ? '+' : '&#8722;';
}

// ── Save Permissions ──────────────────────────────────────────────────────────

async function savePermissions(roleId) {
  const statusEl = document.getElementById('perm-save-status');
  if (statusEl) statusEl.innerHTML = '<span style="color:#888;">Saving…</span>';

  // Group checkboxes by module_key
  const moduleMap = {};
  document.querySelectorAll('input.perm-action-cb').forEach(cb => {
    const key = cb.dataset.module;
    if (!key) return;
    if (!moduleMap[key]) moduleMap[key] = { can_view: false, can_add: false, can_edit: false, can_delete: false };
    if (!cb.disabled) moduleMap[key][`can_${cb.dataset.action}`] = cb.checked;
  });

  const entries = Object.entries(moduleMap).map(([module_key, flags]) => ({
    module_key, ...flags,
  }));

  if (!entries.length) {
    if (statusEl) statusEl.innerHTML = '<span class="role-status-error">No permissions found in form.</span>';
    return;
  }

  // Backend's PUT /roles/{id}/permissions takes one PermissionUpsert object
  // per call, not a bulk array — send one request per module.
  let firstErr = null;
  for (const entry of entries) {
    const res = await apiFetch(`${API_BASE}/roles/${roleId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res) return;
    if (!res.ok && !firstErr) firstErr = await parseApiError(res);
  }

  if (!firstErr) {
    showToast('Permissions saved!', 'success');
    if (statusEl) statusEl.innerHTML = '<span class="role-status-success">Saved!</span>';
  } else {
    const msg = firstErr;
    showToast(msg, 'error');
    if (statusEl) statusEl.innerHTML = `<span class="role-status-error">${msg}</span>`;
  }
}
