// ==================== SESSION TYPES ====================
let sessionTypesData = [];
let _stPerPage       = 10;

function _genStId() {
  return 'st' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="st-dd-"]').forEach(d => d.style.display = 'none');
});

async function loadSessionTypesView(container) {
  _renderStListPage(container);
  await _fetchSessionTypes();
}

async function _fetchSessionTypes() {
  try {
    const res = await fetch(`${API_BASE}/session-types/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) sessionTypesData = await res.json();
  } catch (_) {}
  _renderStTable();
}

// ==================== LISTING ====================

function _renderStListPage(container) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Session Type</h2>
        <div class="sa-breadcrumb">Dashboard &rsaquo; Administration &rsaquo; Session Type &rsaquo; Listing</div>
      </div>
      <div class="sa-controls-row">
        <div class="sa-controls-left">
          Show <select id="st-per-page" onchange="changeStPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}" ${n===_stPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="st-total-count">0</span> entries
        </div>
        <div class="sa-controls-right">
          <button class="sa-btn-add" onclick="renderStAddPage(document.getElementById('main-content'))">+ Add</button>
        </div>
      </div>
      <div id="st-table-container"></div>
    </div>
  `;
  const sel = document.getElementById('st-per-page');
  if (sel) sel.value = String(_stPerPage);
  _renderStTable();
}

function _renderStTable() {
  const totalEl = document.getElementById('st-total-count');
  if (totalEl) totalEl.textContent = sessionTypesData.length;

  const page = sessionTypesData.slice(0, _stPerPage);
  let rows = '';
  if (page.length === 0) {
    rows = `<tr><td colspan="3" class="sa-empty">No record found.</td></tr>`;
  } else {
    page.forEach(t => {
      const btnCls = t.is_inactive ? 'sa-status-btn-deactive' : 'sa-status-btn-active';
      const label  = t.is_inactive ? 'Deactive' : 'Active';
      rows += `<tr id="st-row-${t.id}">
        <td>${_stEsc(t.title || '')}</td>
        <td>
          <button class="sa-status-btn ${btnCls}" onclick="toggleStStatus('${t.id}')">
            ${label} &#9660;
          </button>
        </td>
        <td class="sa-action-cell">
          <div class="sa-action-wrap">
            <button class="sa-action-btn" onclick="toggleStDropdown(event,'${t.id}')">&#8230;</button>
            <div id="st-dd-${t.id}" class="sa-action-dropdown" style="display:none;">
              <a href="#" onclick="openStEdit('${t.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  document.getElementById('st-table-container').innerHTML = `
    <div class="sa-table-wrap">
      <table class="sa-table">
        <thead><tr><th>TITLE</th><th>STATUS</th><th>ACTION</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function changeStPerPage(val) {
  _stPerPage = parseInt(val);
  _renderStTable();
}

function toggleStDropdown(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="st-dd-"]').forEach(d => {
    if (d.id !== `st-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`st-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

async function toggleStStatus(id) {
  const idx = sessionTypesData.findIndex(t => String(t.id) === String(id));
  if (idx === -1) return;
  const newInactive = !sessionTypesData[idx].is_inactive;
  // Optimistic UI update
  sessionTypesData[idx].is_inactive = newInactive;
  const row = document.getElementById(`st-row-${id}`);
  if (row) {
    const btnCls = newInactive ? 'sa-status-btn-deactive' : 'sa-status-btn-active';
    const label  = newInactive ? 'Deactive' : 'Active';
    const btn    = row.querySelector('.sa-status-btn');
    if (btn) { btn.className = `sa-status-btn ${btnCls}`; btn.innerHTML = `${label} &#9660;`; }
  }
  try {
    await fetch(`${API_BASE}/session-types/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...sessionTypesData[idx], is_inactive: newInactive })
    });
  } catch (_) {}
}

// ==================== ADD ====================

function renderStAddPage(container) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Add Session Type</h2>
        <div class="sa-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="sa-bc-link" onclick="loadView('sa-session-types');return false;">Session Type</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="sa-form-wrap">
        <div class="sa-form-group">
          <label class="sa-form-label">Title <span class="sa-required">*</span></label>
          <input type="text" id="st-add-title" class="sa-form-input" placeholder="">
          <span class="sa-field-error" id="st-add-title-err"></span>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Notes</label>
          <textarea id="st-add-notes" class="sa-form-textarea" rows="3"></textarea>
        </div>
        <div class="sa-form-check-group">
          <label class="sa-form-check-label">
            <input type="checkbox" id="st-add-inactive" class="sa-form-cb"> Inactive?
          </label>
        </div>
        <div class="sa-form-actions">
          <button class="sa-btn-submit" onclick="submitStAdd()">Save</button>
          <button class="sa-btn-cancel" onclick="loadView('sa-session-types')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitStAdd() {
  const title = (document.getElementById('st-add-title').value || '').trim();
  document.getElementById('st-add-title-err').textContent = title ? '' : 'This field is required.';
  if (!title) return;

  const payload = {
    title,
    notes:       document.getElementById('st-add-notes').value || '',
    is_inactive: document.getElementById('st-add-inactive').checked
  };
  const res = await apiFetch(`${API_BASE}/session-types/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res) return;
  if (res.ok) {
    showToast('Session type saved!', 'success');
    loadView('sa-session-types');
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

// ==================== EDIT ====================

function openStEdit(id) {
  document.querySelectorAll('[id^="st-dd-"]').forEach(d => d.style.display = 'none');
  const type = sessionTypesData.find(t => t.id === id);
  if (!type) return;
  _renderStEditPage(document.getElementById('main-content'), type);
}

function _renderStEditPage(container, type) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Edit Session Type</h2>
        <div class="sa-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="sa-bc-link" onclick="loadView('sa-session-types');return false;">Session Type</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="sa-form-wrap">
        <div class="sa-form-group">
          <label class="sa-form-label">Title <span class="sa-required">*</span></label>
          <input type="text" id="st-edit-title" class="sa-form-input" value="${_stEsc(type.title || '')}">
          <span class="sa-field-error" id="st-edit-title-err"></span>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Notes</label>
          <textarea id="st-edit-notes" class="sa-form-textarea" rows="3">${_stEsc(type.notes || '')}</textarea>
        </div>
        <div class="sa-form-check-group">
          <label class="sa-form-check-label">
            <input type="checkbox" id="st-edit-inactive" class="sa-form-cb" ${type.is_inactive ? 'checked' : ''}> Inactive?
          </label>
        </div>
        <div class="sa-form-actions">
          <button class="sa-btn-submit" onclick="submitStEdit('${type.id}')">Update</button>
          <button class="sa-btn-cancel" onclick="loadView('sa-session-types')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitStEdit(id) {
  const title = (document.getElementById('st-edit-title').value || '').trim();
  document.getElementById('st-edit-title-err').textContent = title ? '' : 'This field is required.';
  if (!title) return;

  const payload = {
    title,
    notes:       document.getElementById('st-edit-notes').value || '',
    is_inactive: document.getElementById('st-edit-inactive').checked
  };
  const res = await apiFetch(`${API_BASE}/session-types/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res) return;
  if (res.ok) {
    showToast('Session type updated!', 'success');
    loadView('sa-session-types');
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

function _stEsc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
