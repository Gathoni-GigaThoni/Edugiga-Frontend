// ==================== SESSIONS ====================

let sessionsData    = [];
let _sessPage       = 1;
let _sessPerPage    = 10;
let _sessSearch     = '';
let _sessFilterOpen = false;
let _sessFilterAY   = '';
let _sessFilterType = '';
let _sessFilterStat = '';
let _sessAYCache    = [];

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="sess-dd-"]').forEach(d => d.style.display = 'none');
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function _sEsc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _formatAYLabel(y) {
  return `${y.name} ( ${_toDDMMYYYY(y.start_date)} to ${_toDDMMYYYY(y.end_date)} )`;
}
function _toDDMMYYYY(dateStr) {
  if (!dateStr) return '';
  const p = dateStr.split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : dateStr;
}
function _getSessTypeName(typeId) {
  if (!typeId || typeof sessionTypesData === 'undefined') return '-';
  const t = sessionTypesData.find(x => String(x.id) === String(typeId));
  return t ? (t.title || t.name || '-') : '-';
}
function _getSessAYName(ayId) {
  const y = _sessAYCache.find(x => String(x.id) === String(ayId));
  return y ? y.name : '-';
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadSessionsView(container) {
  _sessPage       = 1;
  _sessFilterAY   = '';
  _sessFilterType = '';
  _sessFilterStat = '';
  _sessSearch     = '';
  _sessFilterOpen = false;

  // Load academic years and session types in parallel before rendering
  await Promise.all([_fetchSessAYCache(), _fetchSessTypes()]);
  _renderSessListPage(container);
  await _fetchSessions();
}

async function _fetchSessAYCache() {
  const res = await apiFetch(`${API_BASE}/academic-years/`);
  _sessAYCache = (res && res.ok) ? await res.json() : [];
}

async function _fetchSessTypes() {
  if (typeof sessionTypesData !== 'undefined' && sessionTypesData.length) return;
  const res = await apiFetch(`${API_BASE}/session-types/`);
  if (res && res.ok && typeof sessionTypesData !== 'undefined') {
    const data = await res.json();
    sessionTypesData.length = 0;
    data.forEach(t => sessionTypesData.push(t));
  }
}

async function _fetchSessions() {
  const c = document.getElementById('sess-table-container');
  if (!c) return;
  const res = await apiFetch(`${API_BASE}/sessions/`);
  if (res && res.ok) {
    const data = await res.json();
    sessionsData = Array.isArray(data) ? data : (data.data || data.results || []);
  }
  _renderSessTable();
}

// ── Listing page ──────────────────────────────────────────────────────────────
function _renderSessListPage(container) {
  const ayOptions = _sessAYCache.map(y =>
    `<option value="${y.id}"${_sessFilterAY == y.id ? ' selected' : ''}>${_sEsc(_formatAYLabel(y))}</option>`
  ).join('');
  const typeOptions = (typeof sessionTypesData !== 'undefined' ? sessionTypesData : [])
    .filter(t => !t.is_inactive)
    .map(t => `<option value="${t.id}"${_sessFilterType === String(t.id) ? ' selected' : ''}>${_sEsc(t.title || t.name || '')}</option>`)
    .join('');

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Sessions</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Academics &rsaquo; Sessions &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="sess-per-page" onchange="changeSessPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}"${n===_sessPerPage?' selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="sess-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" id="sess-search" placeholder="&#128269; Search&#8230;"
                 value="${_sEsc(_sessSearch)}" oninput="onSessSearch(this.value)">
          <button class="fin-btn-filter" onclick="toggleSessFilters()">&#9776; Filters</button>
          <button class="fin-btn-teal" onclick="renderSessAddPage(document.getElementById('main-content'))">+ Add Session</button>
        </div>
      </div>

      <!-- Inline filter panel -->
      <div id="sess-filter-panel" style="display:${_sessFilterOpen ? 'block' : 'none'};background:white;border:1px solid #e0e0e0;border-radius:6px;padding:16px 20px;margin-bottom:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px 16px;align-items:end;">
          <div class="stu-form-group">
            <label>Academic Year</label>
            <select id="sess-filter-ay" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                    onchange="applySessFilters()">
              <option value="">All</option>${ayOptions}
            </select>
          </div>
          <div class="stu-form-group">
            <label>Session Type</label>
            <select id="sess-filter-type" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                    onchange="applySessFilters()">
              <option value="">All</option>${typeOptions}
            </select>
          </div>
          <div class="stu-form-group">
            <label>Status</label>
            <select id="sess-filter-stat" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                    onchange="applySessFilters()">
              <option value="">All</option>
              <option value="active"${_sessFilterStat==='active' ? ' selected' : ''}>Active</option>
              <option value="inactive"${_sessFilterStat==='inactive' ? ' selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px;">
          <button class="fin-btn-outline" onclick="clearSessFilters()">Clear Filters</button>
        </div>
      </div>

      <div id="sess-table-container"><p class="fin-loading">Loading&#8230;</p></div>
      <div id="sess-pagination"></div>
    </div>
  `;
}

function toggleSessFilters() {
  _sessFilterOpen = !_sessFilterOpen;
  const p = document.getElementById('sess-filter-panel');
  if (p) p.style.display = _sessFilterOpen ? 'block' : 'none';
}

function applySessFilters() {
  _sessFilterAY   = document.getElementById('sess-filter-ay')?.value   || '';
  _sessFilterType = document.getElementById('sess-filter-type')?.value || '';
  _sessFilterStat = document.getElementById('sess-filter-stat')?.value || '';
  _sessPage = 1;
  _renderSessTable();
}

function clearSessFilters() {
  _sessFilterAY = ''; _sessFilterType = ''; _sessFilterStat = '';
  ['sess-filter-ay','sess-filter-type','sess-filter-stat'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  _sessPage = 1;
  _renderSessTable();
}

function onSessSearch(val) { _sessSearch = val.trim().toLowerCase(); _sessPage = 1; _renderSessTable(); }
function changeSessPerPage(val) { _sessPerPage = parseInt(val); _sessPage = 1; _renderSessTable(); }

function _sessFiltered() {
  return sessionsData.filter(s => {
    if (_sessSearch && !(s.title || s.name || '').toLowerCase().includes(_sessSearch)) return false;
    if (_sessFilterAY   && String(s.academic_year_id) !== String(_sessFilterAY))   return false;
    if (_sessFilterType && String(s.session_type_id)  !== String(_sessFilterType)) return false;
    if (_sessFilterStat === 'active'   && s.is_inactive)  return false;
    if (_sessFilterStat === 'inactive' && !s.is_inactive) return false;
    return true;
  });
}

function _renderSessTable() {
  const filtered = _sessFiltered();
  const totalEl  = document.getElementById('sess-total-count');
  if (totalEl) totalEl.textContent = filtered.length;

  const start = (_sessPage - 1) * _sessPerPage;
  const paged = filtered.slice(start, start + _sessPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _sessPerPage));
  const COLS  = 7;

  let rows = '';
  if (!paged.length) {
    rows = `<tr><td colspan="${COLS}" class="fin-empty">No sessions found.</td></tr>`;
  } else {
    paged.forEach(s => {
      const typeName   = _getSessTypeName(s.session_type_id);
      const ayName     = _getSessAYName(s.academic_year_id);
      const statusBadge = s.is_inactive
        ? '<span style="color:#e74c3c;font-weight:600;">Inactive</span>'
        : '<span style="color:#27ae60;font-weight:600;">Active</span>';
      rows += `<tr>
        <td>${_sEsc(s.title || s.name || '')}</td>
        <td>${_sEsc(typeName)}</td>
        <td>${_sEsc(ayName)}</td>
        <td>${_sEsc(s.start_date || '-')}</td>
        <td>${_sEsc(s.end_date   || '-')}</td>
        <td>${statusBadge}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleSessDropdown(event,'${s.id}')">&#8230;</button>
            <div id="sess-dd-${s.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="openSessEdit('${s.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  const c = document.getElementById('sess-table-container');
  if (c) c.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>TITLE</th><th>SESSION TYPE</th><th>ACADEMIC YEAR</th>
          <th>START DATE</th><th>END DATE</th><th>STATUS</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Pagination
  let pgBtns = '';
  for (let i = 1; i <= pages; i++) {
    pgBtns += `<button class="${i===_sessPage?'fin-pg-active':''}" onclick="sessGoPage(${i})">${i}</button>`;
  }
  const pgEl = document.getElementById('sess-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pgBtns}</div>`;
}

function sessGoPage(p) { _sessPage = p; _renderSessTable(); }

function toggleSessDropdown(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="sess-dd-"]').forEach(d => {
    if (d.id !== `sess-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`sess-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// ── Add ───────────────────────────────────────────────────────────────────────
async function renderSessAddPage(container) {
  // Always re-fetch so a freshly created Academic Year appears immediately
  await Promise.all([_fetchSessAYCache(), _fetchSessTypes()]);

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Session</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Student Academics &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('sa-sessions');return false;">Sessions</a>
          &rsaquo; Add
        </div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:680px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-grid">
          <div class="stu-form-group">
            <label>Title <span style="color:#e74c3c">*</span></label>
            <input type="text" id="sess-add-title" class="fin-search-input" style="width:100%!important;" placeholder="e.g. Term 1 2026">
            <span class="stu-field-error" id="sess-add-title-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Session Type <span style="color:#e74c3c">*</span></label>
            <select id="sess-add-type" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
              <option value="">— Select Type —</option>
              ${(typeof sessionTypesData !== 'undefined' ? sessionTypesData : [])
                .filter(t => !t.is_inactive)
                .map(t => `<option value="${t.id}">${_sEsc(t.title || t.name || '')}</option>`)
                .join('')}
            </select>
            <span class="stu-field-error" id="sess-add-type-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Academic Year <span style="color:#e74c3c">*</span></label>
            <select id="sess-add-ay" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
              <option value="">— Select Academic Year —</option>
              ${_sessAYCache.map(y => `<option value="${y.id}">${_sEsc(_formatAYLabel(y))}</option>`).join('')}
            </select>
            <span class="stu-field-error" id="sess-add-ay-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Start Date</label>
            <input type="date" id="sess-add-start" class="fin-search-input" style="width:100%!important;">
          </div>
          <div class="stu-form-group" style="grid-column:span 2;">
            <label>End Date</label>
            <input type="date" id="sess-add-end" class="fin-search-input" style="width:100%!important;max-width:320px;">
          </div>
          <div class="stu-form-group" style="grid-column:span 2;">
            <label>Notes</label>
            <textarea id="sess-add-notes" style="width:100%;min-height:80px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:0.9rem;"></textarea>
          </div>
          <div class="stu-form-group" style="grid-column:span 2;">
            <label><input type="checkbox" id="sess-add-inactive"> Mark as Inactive</label>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="fin-btn-teal" id="sess-add-btn" onclick="submitSessAdd()">Save</button>
          <button class="fin-btn-cancel" onclick="loadView('sa-sessions')">Cancel</button>
        </div>
        <div id="sess-add-status" style="margin-top:10px;"></div>
      </div>
    </div>
  `;
}

async function submitSessAdd() {
  const title  = (document.getElementById('sess-add-title')?.value || '').trim();
  const typeId =  document.getElementById('sess-add-type')?.value  || '';
  const ayId   =  document.getElementById('sess-add-ay')?.value    || '';

  document.getElementById('sess-add-title-err').textContent = title  ? '' : 'This field is required.';
  document.getElementById('sess-add-type-err').textContent  = typeId ? '' : 'This field is required.';
  document.getElementById('sess-add-ay-err').textContent    = ayId   ? '' : 'This field is required.';
  if (!title || !typeId || !ayId) return;

  const btn      = document.getElementById('sess-add-btn');
  const statusEl = document.getElementById('sess-add-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const payload = {
    title,
    session_type_id:  typeId,
    academic_year_id: parseInt(ayId),
    start_date:  document.getElementById('sess-add-start')?.value || '',
    end_date:    document.getElementById('sess-add-end')?.value   || '',
    notes:       document.getElementById('sess-add-notes')?.value || '',
    is_inactive: !!document.getElementById('sess-add-inactive')?.checked
  };

  const res = await apiFetch(`${API_BASE}/sessions/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  if (!res) return;
  if (res.ok) {
    showToast('Session saved successfully!', 'success');
    loadView('sa-sessions');
  } else {
    const msg = await parseApiError(res);
    if (statusEl) statusEl.innerHTML = `<span style="color:#e74c3c;font-size:0.88rem;">${_sEsc(msg)}</span>`;
    showToast(msg, 'error');
  }
}

// ── Edit ──────────────────────────────────────────────────────────────────────
async function openSessEdit(id) {
  document.querySelectorAll('[id^="sess-dd-"]').forEach(d => d.style.display = 'none');
  const container = document.getElementById('main-content');
  if (!container) return;
  container.innerHTML = '<p class="fin-loading" style="padding:32px;">Loading&#8230;</p>';

  // Always re-fetch for freshest dropdowns
  await Promise.all([_fetchSessAYCache(), _fetchSessTypes()]);

  // Prefer loading from API for freshest data; fall back to local cache
  let sess = sessionsData.find(s => String(s.id) === String(id));
  try {
    const res = await fetch(`${API_BASE}/sessions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) sess = await res.json();
  } catch (_) {}

  if (!sess) { showToast('Session not found.', 'error'); loadView('sa-sessions'); return; }
  _renderSessEditPage(container, sess);
}

function _renderSessEditPage(container, sess) {
  const typeOptions = (typeof sessionTypesData !== 'undefined' ? sessionTypesData : [])
    .filter(t => !t.is_inactive)
    .map(t => `<option value="${t.id}"${String(t.id) === String(sess.session_type_id) ? ' selected' : ''}>${_sEsc(t.title || t.name || '')}</option>`)
    .join('');
  const ayOptions = _sessAYCache.map(y =>
    `<option value="${y.id}"${String(y.id) === String(sess.academic_year_id) ? ' selected' : ''}>${_sEsc(_formatAYLabel(y))}</option>`
  ).join('');

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Session</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Student Academics &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('sa-sessions');return false;">Sessions</a>
          &rsaquo; Edit
        </div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:680px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-grid">
          <div class="stu-form-group">
            <label>Title <span style="color:#e74c3c">*</span></label>
            <input type="text" id="sess-edit-title" class="fin-search-input" style="width:100%!important;"
                   value="${_sEsc(sess.title || sess.name || '')}">
            <span class="stu-field-error" id="sess-edit-title-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Session Type <span style="color:#e74c3c">*</span></label>
            <select id="sess-edit-type" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
              <option value="">— Select Type —</option>${typeOptions}
            </select>
            <span class="stu-field-error" id="sess-edit-type-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Academic Year <span style="color:#e74c3c">*</span></label>
            <select id="sess-edit-ay" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
              <option value="">— Select Academic Year —</option>${ayOptions}
            </select>
            <span class="stu-field-error" id="sess-edit-ay-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Start Date</label>
            <input type="date" id="sess-edit-start" class="fin-search-input" style="width:100%!important;"
                   value="${_sEsc(sess.start_date || '')}">
          </div>
          <div class="stu-form-group" style="grid-column:span 2;">
            <label>End Date</label>
            <input type="date" id="sess-edit-end" class="fin-search-input" style="width:100%!important;max-width:320px;"
                   value="${_sEsc(sess.end_date || '')}">
          </div>
          <div class="stu-form-group" style="grid-column:span 2;">
            <label>Notes</label>
            <textarea id="sess-edit-notes" style="width:100%;min-height:80px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:0.9rem;">${_sEsc(sess.notes || '')}</textarea>
          </div>
          <div class="stu-form-group" style="grid-column:span 2;">
            <label><input type="checkbox" id="sess-edit-inactive"${sess.is_inactive ? ' checked' : ''}> Mark as Inactive</label>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="fin-btn-teal" id="sess-edit-btn" onclick="submitSessEdit('${sess.id}')">Update</button>
          <button class="fin-btn-cancel" onclick="loadView('sa-sessions')">Cancel</button>
        </div>
        <div id="sess-edit-status" style="margin-top:10px;"></div>
      </div>
    </div>
  `;
}

async function submitSessEdit(id) {
  const title  = (document.getElementById('sess-edit-title')?.value || '').trim();
  const typeId =  document.getElementById('sess-edit-type')?.value  || '';
  const ayId   =  document.getElementById('sess-edit-ay')?.value    || '';

  document.getElementById('sess-edit-title-err').textContent = title  ? '' : 'This field is required.';
  document.getElementById('sess-edit-type-err').textContent  = typeId ? '' : 'This field is required.';
  document.getElementById('sess-edit-ay-err').textContent    = ayId   ? '' : 'This field is required.';
  if (!title || !typeId || !ayId) return;

  const btn      = document.getElementById('sess-edit-btn');
  const statusEl = document.getElementById('sess-edit-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const payload = {
    title,
    session_type_id:  typeId,
    academic_year_id: parseInt(ayId),
    start_date:  document.getElementById('sess-edit-start')?.value || '',
    end_date:    document.getElementById('sess-edit-end')?.value   || '',
    notes:       document.getElementById('sess-edit-notes')?.value || '',
    is_inactive: !!document.getElementById('sess-edit-inactive')?.checked
  };

  const res = await apiFetch(`${API_BASE}/sessions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Update'; }
  if (!res) return;
  if (res.ok) {
    showToast('Session updated successfully!', 'success');
    loadView('sa-sessions');
  } else {
    const msg = await parseApiError(res);
    if (statusEl) statusEl.innerHTML = `<span style="color:#e74c3c;font-size:0.88rem;">${_sEsc(msg)}</span>`;
    showToast(msg, 'error');
  }
}
