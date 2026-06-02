// ==================== SESSIONS ====================
let sessionsData    = [];
let _sessPerPage    = 10;
let _sessSearch     = '';
let _sessFilterOpen = false;
let _sessFilterAY   = '';
let _sessFilterType = '';
let _sessFilterStat = '';
let _sessAYCache    = [];

function _genSessId() {
  return 'sess' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="sess-dd-"]').forEach(d => d.style.display = 'none');
});

// ==================== LISTING ====================

async function loadSessionsView(container) {
  await _fetchSessAYCache();
  _sessFilterAY   = '';
  _sessFilterType = '';
  _sessFilterStat = '';
  _sessSearch     = '';
  _sessFilterOpen = false;
  _renderSessListPage(container);
  await _fetchSessions();
}

async function _fetchSessions() {
  try {
    const res = await fetch(`${API_BASE}/sessions/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) sessionsData = await res.json();
  } catch (_) {}
  _renderSessTable();
}

async function _fetchSessAYCache() {
  try {
    const res = await fetch(`${API_BASE}/academic-years/`, { headers: { Authorization: `Bearer ${token}` } });
    _sessAYCache = res.ok ? await res.json() : [];
  } catch(_) { _sessAYCache = []; }
}

function _renderSessListPage(container) {
  const ayOptions = _sessAYCache.map(y =>
    `<option value="${y.id}" ${_sessFilterAY == y.id ? 'selected' : ''}>${_sEsc(_formatAYLabel(y))}</option>`
  ).join('');
  const typeOptions = (typeof sessionTypesData !== 'undefined' ? sessionTypesData : [])
    .filter(t => !t.is_inactive)
    .map(t => `<option value="${t.id}" ${_sessFilterType === t.id ? 'selected' : ''}>${_sEsc(t.title || t.name || '')}</option>`)
    .join('');

  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Sessions</h2>
        <div class="sa-breadcrumb">Dashboard &rsaquo; Administration &rsaquo; Sessions &rsaquo; Listing</div>
      </div>
      <div class="sa-controls-row">
        <div class="sa-controls-left">
          Show <select id="sess-per-page" onchange="changeSessPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}" ${n===_sessPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="sess-total-count">0</span> entries
        </div>
        <div class="sa-controls-right">
          <input type="text" class="sa-search-input" id="sess-search" placeholder="&#128269; Search&#8230;"
                 value="${_sEsc(_sessSearch)}" oninput="onSessSearch(this.value)">
          <button class="sa-btn-filter" onclick="toggleSessFilters()">&#9776; Filters</button>
          <button class="sa-btn-add" onclick="renderSessAddPage(document.getElementById('main-content'))">Add Sessions</button>
        </div>
      </div>

      <!-- Collapsible filters panel -->
      <div id="sess-filter-panel" class="sa-filter-panel" style="display:${_sessFilterOpen ? 'block' : 'none'};">
        <div class="sa-filter-panel-grid">
          <div class="sa-filter-field">
            <label class="sa-filter-label">Academic Year</label>
            <select id="sess-filter-ay" class="sa-filter-select" onchange="applySessFilters()">
              <option value="">All</option>${ayOptions}
            </select>
          </div>
          <div class="sa-filter-field">
            <label class="sa-filter-label">Session Type</label>
            <select id="sess-filter-type" class="sa-filter-select" onchange="applySessFilters()">
              <option value="">All</option>${typeOptions}
            </select>
          </div>
          <div class="sa-filter-field">
            <label class="sa-filter-label">Status</label>
            <select id="sess-filter-stat" class="sa-filter-select" onchange="applySessFilters()">
              <option value="">All</option>
              <option value="active"   ${_sessFilterStat==='active'   ? 'selected':''}>Active</option>
              <option value="inactive" ${_sessFilterStat==='inactive' ? 'selected':''}>Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <div id="sess-table-container"></div>
    </div>
  `;
  _renderSessTable();
}

function toggleSessFilters() {
  _sessFilterOpen = !_sessFilterOpen;
  const panel = document.getElementById('sess-filter-panel');
  if (panel) panel.style.display = _sessFilterOpen ? 'block' : 'none';
}

function applySessFilters() {
  _sessFilterAY   = (document.getElementById('sess-filter-ay')   || {}).value || '';
  _sessFilterType = (document.getElementById('sess-filter-type') || {}).value || '';
  _sessFilterStat = (document.getElementById('sess-filter-stat') || {}).value || '';
  _renderSessTable();
}

function onSessSearch(val) {
  _sessSearch = val.trim().toLowerCase();
  _renderSessTable();
}

function changeSessPerPage(val) {
  _sessPerPage = parseInt(val);
  _renderSessTable();
}

function _sessFilteredData() {
  return sessionsData.filter(s => {
    if (_sessSearch && !(s.title || '').toLowerCase().includes(_sessSearch)) return false;
    if (_sessFilterAY   && String(s.academic_year_id) !== String(_sessFilterAY))   return false;
    if (_sessFilterType && s.session_type_id !== _sessFilterType)                  return false;
    if (_sessFilterStat === 'active'   && s.is_inactive)  return false;
    if (_sessFilterStat === 'inactive' && !s.is_inactive) return false;
    return true;
  });
}

function _renderSessTable() {
  const filtered = _sessFilteredData();
  const totalEl  = document.getElementById('sess-total-count');
  if (totalEl) totalEl.textContent = filtered.length;

  const page = filtered.slice(0, _sessPerPage);
  let rows = '';
  if (page.length === 0) {
    rows = `<tr><td colspan="6" class="sa-empty">No record found.</td></tr>`;
  } else {
    page.forEach(s => {
      const typeName = _getSessTypeName(s.session_type_id);
      const ayName   = _getSessAYName(s.academic_year_id);
      rows += `<tr>
        <td>${_sEsc(s.title || '')}</td>
        <td>${_sEsc(typeName)}</td>
        <td>${_sEsc(ayName)}</td>
        <td>${s.start_date || '-'}</td>
        <td>${s.end_date || '-'}</td>
        <td class="sa-action-cell">
          <div class="sa-action-wrap">
            <button class="sa-action-btn" onclick="toggleSessDropdown(event,'${s.id}')">&#8230;</button>
            <div id="sess-dd-${s.id}" class="sa-action-dropdown" style="display:none;">
              <a href="#" onclick="openSessEdit('${s.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  document.getElementById('sess-table-container').innerHTML = `
    <div class="sa-table-wrap">
      <table class="sa-table">
        <thead><tr>
          <th>TITLE</th><th>SESSION TYPE</th><th>ACADEMIC YEAR</th>
          <th>START DATE</th><th>END DATE</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function toggleSessDropdown(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="sess-dd-"]').forEach(d => {
    if (d.id !== `sess-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`sess-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// ==================== ADD ====================

async function renderSessAddPage(container) {
  if (_sessAYCache.length === 0) await _fetchSessAYCache();
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Add Sessions</h2>
        <div class="sa-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="sa-bc-link" onclick="loadView('sa-sessions');return false;">Sessions</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="sa-form-wrap" style="max-width:680px;">
        <div class="sa-form-grid-2">
          <div class="sa-form-group">
            <label class="sa-form-label">Title <span class="sa-required">*</span></label>
            <input type="text" id="sess-add-title" class="sa-form-input" placeholder="">
            <span class="sa-field-error" id="sess-add-title-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Session Type <span class="sa-required">*</span></label>
            <select id="sess-add-type" class="sa-form-select">
              <option value="">-- Select Type --</option>
              ${(typeof sessionTypesData !== 'undefined' ? sessionTypesData : [])
                .filter(t => !t.is_inactive)
                .map(t => `<option value="${t.id}">${_sEsc(t.title || t.name || '')}</option>`)
                .join('')}
            </select>
            <span class="sa-field-error" id="sess-add-type-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Academic Year <span class="sa-required">*</span></label>
            <select id="sess-add-ay" class="sa-form-select">
              <option value="">-- Select Academic Year --</option>
              ${_sessAYCache.map(y => `<option value="${y.id}">${_sEsc(_formatAYLabel(y))}</option>`).join('')}
            </select>
            <span class="sa-field-error" id="sess-add-ay-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Start Date</label>
            <input type="date" id="sess-add-start" class="sa-form-input">
          </div>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">End Date</label>
          <input type="date" id="sess-add-end" class="sa-form-input">
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Notes</label>
          <textarea id="sess-add-notes" class="sa-form-textarea" rows="3"></textarea>
        </div>
        <div class="sa-form-check-group">
          <label class="sa-form-check-label">
            <input type="checkbox" id="sess-add-inactive" class="sa-form-cb"> Inactive?
          </label>
        </div>
        <div class="sa-form-actions">
          <button class="sa-btn-submit" onclick="submitSessAdd()">Save</button>
          <button class="sa-btn-cancel" onclick="loadView('sa-sessions')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function submitSessAdd() {
  const title  = (document.getElementById('sess-add-title').value || '').trim();
  const typeId =  document.getElementById('sess-add-type').value;
  const ayId   =  document.getElementById('sess-add-ay').value;
  let valid    = true;

  document.getElementById('sess-add-title-err').textContent = title  ? '' : 'This field is required.';
  document.getElementById('sess-add-type-err').textContent  = typeId ? '' : 'This field is required.';
  document.getElementById('sess-add-ay-err').textContent    = ayId   ? '' : 'This field is required.';
  if (!title || !typeId || !ayId) valid = false;
  if (!valid) return;

  const payload = {
    title,
    session_type_id:  typeId,
    academic_year_id: parseInt(ayId),
    start_date:       document.getElementById('sess-add-start').value || '',
    end_date:         document.getElementById('sess-add-end').value   || '',
    notes:            document.getElementById('sess-add-notes').value || '',
    is_inactive:      document.getElementById('sess-add-inactive').checked
  };

  try {
    const res = await fetch(`${API_BASE}/sessions/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      loadView('sa-sessions');
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('Error: ' + (err.detail || 'Could not save session.'), 'error');
    }
  } catch (_) {
    showToast('Network error. Please try again.', 'error');
  }
}

// ==================== EDIT ====================

async function openSessEdit(id) {
  document.querySelectorAll('[id^="sess-dd-"]').forEach(d => d.style.display = 'none');
  const sess = sessionsData.find(s => s.id === id);
  if (!sess) return;
  if (_sessAYCache.length === 0) await _fetchSessAYCache();
  _renderSessEditPage(document.getElementById('main-content'), sess);
}

function _renderSessEditPage(container, sess) {
  const typeOptions = (typeof sessionTypesData !== 'undefined' ? sessionTypesData : [])
    .filter(t => !t.is_inactive)
    .map(t => `<option value="${t.id}" ${t.id === sess.session_type_id ? 'selected' : ''}>${_sEsc(t.title || t.name || '')}</option>`)
    .join('');
  const ayOptions = _sessAYCache.map(y =>
    `<option value="${y.id}" ${y.id === sess.academic_year_id ? 'selected' : ''}>${_sEsc(_formatAYLabel(y))}</option>`
  ).join('');

  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Edit Sessions</h2>
        <div class="sa-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="sa-bc-link" onclick="loadView('sa-sessions');return false;">Sessions</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="sa-form-wrap" style="max-width:680px;">
        <div class="sa-form-grid-2">
          <div class="sa-form-group">
            <label class="sa-form-label">Title <span class="sa-required">*</span></label>
            <input type="text" id="sess-edit-title" class="sa-form-input" value="${_sEsc(sess.title || '')}">
            <span class="sa-field-error" id="sess-edit-title-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Session Type <span class="sa-required">*</span></label>
            <select id="sess-edit-type" class="sa-form-select">
              <option value="">-- Select Type --</option>${typeOptions}
            </select>
            <span class="sa-field-error" id="sess-edit-type-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Academic Year <span class="sa-required">*</span></label>
            <select id="sess-edit-ay" class="sa-form-select">
              <option value="">-- Select Academic Year --</option>${ayOptions}
            </select>
            <span class="sa-field-error" id="sess-edit-ay-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Start Date</label>
            <input type="date" id="sess-edit-start" class="sa-form-input" value="${sess.start_date || ''}">
          </div>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">End Date</label>
          <input type="date" id="sess-edit-end" class="sa-form-input" value="${sess.end_date || ''}">
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Notes</label>
          <textarea id="sess-edit-notes" class="sa-form-textarea" rows="3">${_sEsc(sess.notes || '')}</textarea>
        </div>
        <div class="sa-form-check-group">
          <label class="sa-form-check-label">
            <input type="checkbox" id="sess-edit-inactive" class="sa-form-cb" ${sess.is_inactive ? 'checked' : ''}> Inactive?
          </label>
        </div>
        <div class="sa-form-actions">
          <button class="sa-btn-submit" onclick="submitSessEdit('${sess.id}')">Update</button>
          <button class="sa-btn-cancel" onclick="loadView('sa-sessions')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitSessEdit(id) {
  const title  = (document.getElementById('sess-edit-title').value || '').trim();
  const typeId =  document.getElementById('sess-edit-type').value;
  const ayId   =  document.getElementById('sess-edit-ay').value;
  let valid    = true;

  document.getElementById('sess-edit-title-err').textContent = title  ? '' : 'This field is required.';
  document.getElementById('sess-edit-type-err').textContent  = typeId ? '' : 'This field is required.';
  document.getElementById('sess-edit-ay-err').textContent    = ayId   ? '' : 'This field is required.';
  if (!title || !typeId || !ayId) valid = false;
  if (!valid) return;

  const payload = {
    title,
    session_type_id:  typeId,
    academic_year_id: parseInt(ayId),
    start_date:       document.getElementById('sess-edit-start').value || '',
    end_date:         document.getElementById('sess-edit-end').value   || '',
    notes:            document.getElementById('sess-edit-notes').value || '',
    is_inactive:      document.getElementById('sess-edit-inactive').checked
  };

  try {
    const res = await fetch(`${API_BASE}/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      loadView('sa-sessions');
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('Error: ' + (err.detail || 'Could not update session.'), 'error');
    }
  } catch (_) {
    showToast('Network error. Please try again.', 'error');
  }
}

// ==================== HELPERS ====================

function _getSessTypeName(typeId) {
  if (!typeId || typeof sessionTypesData === 'undefined') return '-';
  const t = sessionTypesData.find(x => x.id === typeId);
  return t ? (t.title || t.name || '-') : '-';
}

function _getSessAYName(ayId) {
  const y = _sessAYCache.find(x => x.id === ayId);
  return y ? y.name : '-';
}

function _formatAYLabel(y) {
  return `${y.name} ( ${_toDDMMYYYY(y.start_date)} to ${_toDDMMYYYY(y.end_date)} )`;
}

function _toDDMMYYYY(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
}

function _sEsc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
