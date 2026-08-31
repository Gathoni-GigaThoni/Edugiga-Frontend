// ==================== ACADEMIC YEARS ====================

let _ayPerPage  = 10;
let _ayLocalData = [];  // API data augmented with local is_inactive + notes

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="ay-dd-"]').forEach(d => d.style.display = 'none');
});

async function loadAcademicYearsView(container) {
  await renderSplitView({
    container,
    title: 'Academic Years',
    moduleKey: 'student_academics.academic_year_setup',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Administration',view:'sa-academic-years'},
      {label:'Academic Years'}
    ],
    apiUrl: `${API_BASE}/academic-years/`,
    searchFields: ['title'],
    col1Label: 'Title', col2Label: 'Start → End',
    col1: y => y.title || '—',
    col2: y => `${_fmtDDMmmYYYY(y.start_date)} – ${_fmtDDMmmYYYY(y.end_date)}`,
    rowLabel: y => y.title || '—',
    rowSub:   y => `${_fmtDDMmmYYYY(y.start_date)} – ${_fmtDDMmmYYYY(y.end_date)}`,
    idKey: 'id',
    detailFields: [
      {label:'Title',      key:'title'},
      {label:'Start Date', key:'start_date', fmt:v=>_fmtDDMmmYYYY(v)},
      {label:'End Date',   key:'end_date',   fmt:v=>_fmtDDMmmYYYY(v)},
      {label:'Status',     key:'is_inactive', fmt:v=>v?'Inactive':'Active'},
    ],
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#128197;</div>
        <p style="font-weight:600;margin-bottom:8px">Add a New Academic Year</p>
        <p style="font-size:13px;margin-bottom:20px">Set up a year's title and start/end dates.</p>
        <button class="btn-primary" style="padding:10px 24px" onclick="renderAyAddPage(document.getElementById('main-content'))">+ Add Academic Year</button>
      </div>`;
    },
    onAdd:  () => renderAyAddPage(document.getElementById('main-content')),
    onEdit: item => openAyEdit(item.id),
  });
}

// ==================== LISTING ====================

async function _renderAyListPage(container) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Academic Year</h2>
        <div class="sa-breadcrumb">Dashboard &rsaquo; Administration &rsaquo; Academic Year &rsaquo; Listing</div>
      </div>
      <div class="sa-controls-row">
        <div class="sa-controls-left">
          Show <select id="ay-per-page" onchange="changeAyPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}" ${n===_ayPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="ay-total-count">0</span> entries
        </div>
        <div class="sa-controls-right">
          <button class="sa-btn-add" onclick="renderAyAddPage(document.getElementById('main-content'))">+ Add</button>
        </div>
      </div>
      <div id="ay-table-container"><p class="sa-loading">Loading&#8230;</p></div>
    </div>
  `;
  const sel = document.getElementById('ay-per-page');
  if (sel) sel.value = String(_ayPerPage);
  await _fetchAndRenderAyTable();
}

async function _fetchAndRenderAyTable() {
  const container = document.getElementById('ay-table-container');
  if (!container) return;
  try {
    const res   = await fetch(`${API_BASE}/academic-years/`, { headers: { Authorization: `Bearer ${token}` } });
    const years = res.ok ? await res.json() : [];

    // Merge API data with any local overrides (is_inactive, notes are not in the API schema)
    _ayLocalData = years.map(y => {
      const existing = _ayLocalData.find(x => x.id === y.id) || {};
      return {
        ...y,
        is_inactive: existing.is_inactive ?? false,
        notes:       existing.notes       ?? ''
      };
    });

    const totalEl = document.getElementById('ay-total-count');
    if (totalEl) totalEl.textContent = _ayLocalData.length;

    const page = _ayLocalData.slice(0, _ayPerPage);
    let rows = '';
    if (page.length === 0) {
      rows = `<tr><td colspan="5" class="sa-empty">No record found.</td></tr>`;
    } else {
      page.forEach(y => {
        const btnCls = y.is_inactive ? 'sa-status-btn-deactive' : 'sa-status-btn-active';
        const label  = y.is_inactive ? 'Deactive' : 'Active';
        rows += `<tr id="ay-row-${y.id}">
          <td>${_ayEsc(y.title)}</td>
          <td>${_fmtDDMmmYYYY(y.start_date)}</td>
          <td>${_fmtDDMmmYYYY(y.end_date)}</td>
          <td>
            <button class="sa-status-btn ${btnCls}" onclick="toggleAyStatus(${y.id})">
              ${label} &#9660;
            </button>
          </td>
          <td class="sa-action-cell">
            <div class="sa-action-wrap">
              <button class="sa-action-btn" onclick="toggleAyDropdown(event,${y.id})">&#8230;</button>
              <div id="ay-dd-${y.id}" class="sa-action-dropdown" style="display:none;">
                <a href="#" onclick="openAyEdit(${y.id});return false;">&#9998; Edit</a>
              </div>
            </div>
          </td>
        </tr>`;
      });
    }

    container.innerHTML = `
      <div class="sa-table-wrap">
        <table class="sa-table">
          <thead><tr>
            <th>TITLE</th><th>START DATE</th><th>END DATE</th><th>STATUS</th><th>ACTION</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch(e) {
    container.innerHTML = '<p class="sa-error-msg">Failed to load academic years.</p>';
  }
}

function changeAyPerPage(val) {
  _ayPerPage = parseInt(val);
  _fetchAndRenderAyTable();
}

function toggleAyDropdown(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="ay-dd-"]').forEach(d => {
    if (d.id !== `ay-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`ay-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

async function toggleAyStatus(id) {
  const idx = _ayLocalData.findIndex(y => y.id === id);
  if (idx === -1) return;
  const newInactive = !_ayLocalData[idx].is_inactive;
  _ayLocalData[idx].is_inactive = newInactive;
  const row = document.getElementById(`ay-row-${id}`);
  if (row) {
    const btnCls = newInactive ? 'sa-status-btn-deactive' : 'sa-status-btn-active';
    const label  = newInactive ? 'Deactive' : 'Active';
    const btn    = row.querySelector('.sa-status-btn');
    if (btn) { btn.className = `sa-status-btn ${btnCls}`; btn.innerHTML = `${label} &#9660;`; }
  }
  try {
    await fetch(`${API_BASE}/academic-years/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_inactive: newInactive })
    });
  } catch (_) {}
}

// ==================== ADD ====================

function renderAyAddPage(container) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Add Academic Year</h2>
        <div class="sa-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="sa-bc-link" onclick="loadView('sa-academic-years');return false;">Academic Year</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="sa-form-wrap" style="max-width:680px;">
        <div class="sa-form-grid-2">
          <div class="sa-form-group">
            <label class="sa-form-label">Title <span class="sa-required">*</span></label>
            <input type="text" id="ay-add-title" class="sa-form-input" placeholder="e.g. 2025/2026">
            <span class="sa-field-error" id="ay-add-title-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Start Date <span class="sa-required">*</span></label>
            <input type="date" id="ay-add-start" class="sa-form-input">
            <span class="sa-field-error" id="ay-add-start-err"></span>
          </div>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">End Date <span class="sa-required">*</span></label>
          <input type="date" id="ay-add-end" class="sa-form-input">
          <span class="sa-field-error" id="ay-add-end-err"></span>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Notes</label>
          <textarea id="ay-add-notes" class="sa-form-textarea" rows="3"></textarea>
        </div>
        <div class="sa-form-check-group">
          <label class="sa-form-check-label">
            <input type="checkbox" id="ay-add-inactive" class="sa-form-cb"> Inactive?
          </label>
        </div>
        <div class="sa-form-actions">
          <button id="ay-add-save-btn" class="sa-btn-submit" onclick="submitAyAdd()">Save</button>
          <button class="sa-btn-cancel" onclick="loadView('sa-academic-years')">Cancel</button>
        </div>
        <div id="ay-add-status"></div>
      </div>
    </div>
  `;
}

async function submitAyAdd() {
  const name  = (document.getElementById('ay-add-title')?.value || '').trim();
  const start =  document.getElementById('ay-add-start')?.value || '';
  const end   =  document.getElementById('ay-add-end')?.value   || '';

  document.getElementById('ay-add-title-err').textContent = name  ? '' : 'This field is required.';
  document.getElementById('ay-add-start-err').textContent = start ? '' : 'This field is required.';
  document.getElementById('ay-add-end-err').textContent   = end   ? '' : 'This field is required.';
  if (!name || !start || !end) return;

  const btn      = document.getElementById('ay-add-save-btn');
  const statusEl = document.getElementById('ay-add-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  if (statusEl) statusEl.innerHTML = '';

  // Use apiFetch so auth + error handling is consistent with all other modules
  const res = await apiFetch(`${API_BASE}/academic-years/`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ title: name, start_date: start, end_date: end }),
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Save'; }

  if (!res) {
    // apiFetch already showed a network-error toast and returned null
    return;
  }

  if (res.ok) {
    const created = await res.json().catch(() => ({}));
    showToast('Academic year saved!', 'success');
    // Navigate OUTSIDE any try/catch so errors there don't look like save failures
    if (created.id) {
      await openAyEdit(created.id);
    } else {
      loadView('sa-academic-years');
    }
  } else {
    const msg = await parseApiError(res);
    if (statusEl) statusEl.innerHTML = `<div class="sa-toast sa-toast-error">${_ayEsc(msg)}</div>`;
    showToast(msg, 'error');
  }
}

let _currentAyId = null;

// ==================== EDIT ====================

async function openAyEdit(id) {
  document.querySelectorAll('[id^="ay-dd-"]').forEach(d => d.style.display = 'none');
  const container = document.getElementById('main-content');
  container.innerHTML = '<p class="sa-loading">Loading&#8230;</p>';
  try {
    const res  = await fetch(`${API_BASE}/academic-years/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { container.innerHTML = '<p class="sa-error-msg">Could not load academic year.</p>'; return; }
    const year  = await res.json();
    // Merge local overrides
    const local = _ayLocalData.find(x => x.id === id) || {};
    year.is_inactive = local.is_inactive ?? false;
    year.notes       = local.notes       ?? '';
    _renderAyEditPage(container, year);
  } catch(e) {
    container.innerHTML = '<p class="sa-error-msg">Failed to load academic year.</p>';
  }
}

function _renderAyEditPage(container, year) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Edit Academic Year</h2>
        <div class="sa-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="sa-bc-link" onclick="loadView('sa-academic-years');return false;">Academic Year</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="sa-form-wrap" style="max-width:680px;">
        <div class="sa-form-grid-2">
          <div class="sa-form-group">
            <label class="sa-form-label">Title <span class="sa-required">*</span></label>
            <input type="text" class="sa-form-input" value="${_ayEsc(year.title)}" disabled>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Start Date <span class="sa-required">*</span></label>
            <input type="date" class="sa-form-input" value="${year.start_date}" disabled>
          </div>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">End Date <span class="sa-required">*</span></label>
          <input type="date" class="sa-form-input" value="${year.end_date}" disabled>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Notes</label>
          <textarea id="ay-edit-notes" class="sa-form-textarea" rows="3">${_ayEsc(year.notes || '')}</textarea>
        </div>
        <div class="sa-form-check-group">
          <label class="sa-form-check-label">
            <input type="checkbox" id="ay-edit-inactive" class="sa-form-cb" ${year.is_inactive ? 'checked' : ''}> Inactive?
          </label>
        </div>

        <!-- Terms -->
        <div class="sa-terms-section">
          <div class="sa-terms-title">Terms</div>
          <div id="ay-sessions-container">
            <p class="sa-loading">Loading terms&#8230;</p>
          </div>
        </div>

        <!-- Classes -->
        <div class="sa-terms-section" style="margin-top:24px;">
          <div class="sa-terms-title">Classes / Class Codes</div>
          <div id="ay-classes-container">
            <p class="sa-loading">Loading classes&#8230;</p>
          </div>
        </div>

        ${canAdd('student_academics.academic_year_setup') ? `
        <!-- Year-End Promotion -->
        <div class="sa-terms-section" style="margin-top:24px;">
          <div class="sa-terms-title">Year-End Promotion</div>
          <p style="font-size:0.85rem;color:#666;margin:4px 0 12px;">
            Promote active enrollments from a prior academic year into
            ${_ayEsc(year.title)} and auto-assign Term&nbsp;1 fees.
          </p>
          <button class="sa-btn-submit" onclick="_ayOpenPromoteModal(${year.id})">Promote from prior AY &rarr;</button>
        </div>` : ''}

        <div class="sa-form-actions" style="margin-top:24px;">
          <button class="sa-btn-submit" onclick="_saveAyLocalEdits(${year.id})">Update</button>
          <button class="sa-btn-cancel" onclick="loadView('sa-academic-years')">Cancel</button>
        </div>
        <div id="ay-edit-status"></div>
      </div>
    </div>
  `;

  _loadAySessions(year.id);
  _loadAyClasses(year.id);
}

async function _loadAySessions(yearId) {
  const container = document.getElementById('ay-sessions-container');
  if (!container) return;

  try {
    const res = await apiFetch(`${API_BASE}/terms/`);
    const all = (res && res.ok) ? await res.json() : [];
    const sessions = (Array.isArray(all) ? all : (all.data || all.results || []))
      .filter(s => String(s.academic_year_id) === String(yearId));

    if (!sessions.length) {
      container.innerHTML = '<p style="color:#888;font-size:0.88rem;padding:8px 0;">No terms configured for this academic year.</p>';
      return;
    }

    const rows = sessions.map(s => {
      // TermRead is is_active. is_inactive exists on AcademicYear only, so
      // reading it here made every term report Active.
      const statusBadge = s.is_active === false
        ? '<span style="color:#e74c3c;font-weight:600;">Inactive</span>'
        : '<span style="color:#27ae60;font-weight:600;">Active</span>';
      return `<tr>
        <td>${_ayEsc(s.title || s.name || '-')}</td>
        <td>${_fmtDDMmmYYYY(s.start_date)}</td>
        <td>${_fmtDDMmmYYYY(s.end_date)}</td>
        <td>${statusBadge}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="sa-table-wrap">
        <table class="sa-table">
          <thead><tr>
            <th>NAME</th><th>START DATE</th><th>END DATE</th><th>STATUS</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (_) {
    container.innerHTML = '<p style="color:#c0392b;font-size:0.88rem;">Failed to load terms.</p>';
  }
}

async function _loadAyClasses(yearId) {
  const container = document.getElementById('ay-classes-container');
  if (!container) return;

  try {
    const res = await apiFetch(`${API_BASE}/classes/?academic_year_id=${yearId}`);
    const classes = (res && res.ok) ? _toArray(await res.json()) : [];

    if (!classes.length) {
      container.innerHTML = '<p style="color:#888;font-size:0.88rem;padding:8px 0;">No classes configured for this academic year.</p>';
      return;
    }

    const rows = classes.map(c => `
      <tr>
        <td>${_ayEsc(c.code || c.class_code || '-')}</td>
        <td>${_ayEsc(c.name || '-')}</td>
        <td>${_ayEsc(c.level || c.level_name || '-')}</td>
        <td>${_ayEsc(c.stream || '-')}</td>
        <td><span style="color:${c.is_active !== false ? '#27ae60' : '#e74c3c'};font-weight:600;">
          ${c.is_active !== false ? 'Active' : 'Inactive'}
        </span></td>
      </tr>`).join('');

    container.innerHTML = `
      <div class="sa-table-wrap">
        <table class="sa-table">
          <thead><tr>
            <th>CLASS CODE</th><th>NAME</th><th>LEVEL</th><th>STREAM</th><th>STATUS</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (_) {
    container.innerHTML = '<p style="color:#c0392b;font-size:0.88rem;">Failed to load classes.</p>';
  }
}

// ==================== YEAR-END PROMOTION ====================
// POST /academic-years/{to_year_id}/promote?from_year_id=&dry_run=
// Idempotent on the backend; dry_run=true simulates inside a savepoint so
// we always preview before the real, persisting call.

async function _ayOpenPromoteModal(toYearId) {
  const wrap = document.createElement('div');
  wrap.id = 'ay-promote-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:480px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Promote from Prior Academic Year</h3>
      <p style="font-size:0.85rem;color:#666;margin:0 0 12px;">Runs a dry run first so you can review the impact before anything is saved.</p>
      <div class="sa-form-group">
        <label class="sa-form-label">Promote From <span class="sa-required">*</span></label>
        <select id="ay-promote-from-select" class="sa-form-input">
          <option value="">Loading academic years&#8230;</option>
        </select>
      </div>
      <div id="ay-promote-summary" style="display:none;margin-top:12px;padding:12px;border-radius:6px;background:var(--grey-100,#f5f6f8);font-size:0.85rem;"></div>
      <div id="ay-promote-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:10px;"></div>
      <div id="ay-promote-actions" style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end;">
        <button class="sa-btn-cancel" onclick="_coaCloseModal('ay-promote-modal-overlay')">Cancel</button>
        <button class="sa-btn-submit" id="ay-promote-dryrun-btn" onclick="_ayRunPromoteDryRun(${toYearId})">Preview (Dry Run)</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const sel = document.getElementById('ay-promote-from-select');
  try {
    const res = await apiFetch(`${API_BASE}/academic-years/`);
    const years = (res && res.ok) ? _toArray(await res.json()) : [];
    const others = years.filter(y => y.id !== toYearId);
    sel.innerHTML = others.length
      ? others.map(y => `<option value="${y.id}">${_ayEsc(y.title)} (${_fmtDDMmmYYYY(y.start_date)} – ${_fmtDDMmmYYYY(y.end_date)})</option>`).join('')
      : '<option value="">No other academic years found</option>';
  } catch (_) {
    sel.innerHTML = '<option value="">Failed to load academic years</option>';
  }
}

async function _ayRunPromoteDryRun(toYearId) {
  const sel     = document.getElementById('ay-promote-from-select');
  const fromId  = sel?.value;
  const errEl   = document.getElementById('ay-promote-err');
  const sumEl   = document.getElementById('ay-promote-summary');
  errEl.style.display = 'none';
  if (!fromId) {
    errEl.textContent = 'Select an academic year to promote from.';
    errEl.style.display = 'block';
    return;
  }
  const btn = document.getElementById('ay-promote-dryrun-btn');
  btn.disabled = true; btn.textContent = 'Running preview…';

  const res = await apiFetch(`${API_BASE}/academic-years/${toYearId}/promote?from_year_id=${fromId}&dry_run=true`, { method: 'POST' });
  if (!res) { btn.disabled = false; btn.textContent = 'Preview (Dry Run)'; return; }

  if (res.ok) {
    const data = await res.json();
    sumEl.innerHTML = _ayRenderPromoteSummary(data, true);
    sumEl.style.display = 'block';
    sel.disabled = true;
    document.getElementById('ay-promote-actions').innerHTML = `
      <button class="sa-btn-cancel" onclick="_coaCloseModal('ay-promote-modal-overlay')">Cancel</button>
      <button class="sa-btn-submit" onclick="_ayRunPromoteConfirm(${toYearId}, ${fromId})">Confirm &amp; Promote</button>`;
  } else {
    const msg = await parseApiError(res);
    errEl.textContent = msg; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Preview (Dry Run)';
  }
}

async function _ayRunPromoteConfirm(toYearId, fromId) {
  const errEl     = document.getElementById('ay-promote-err');
  const actionsEl = document.getElementById('ay-promote-actions');
  errEl.style.display = 'none';
  actionsEl.innerHTML = '<button class="sa-btn-submit" disabled>Promoting…</button>';

  const res = await apiFetch(`${API_BASE}/academic-years/${toYearId}/promote?from_year_id=${fromId}&dry_run=false`, { method: 'POST' });
  if (!res) {
    actionsEl.innerHTML = `
      <button class="sa-btn-cancel" onclick="_coaCloseModal('ay-promote-modal-overlay')">Cancel</button>
      <button class="sa-btn-submit" onclick="_ayRunPromoteConfirm(${toYearId}, ${fromId})">Confirm &amp; Promote</button>`;
    return;
  }

  if (res.ok) {
    const data = await res.json();
    document.getElementById('ay-promote-summary').innerHTML = _ayRenderPromoteSummary(data, false);
    _coaCloseModal('ay-promote-modal-overlay');
    showToast('Academic year promotion complete.', 'success');
    _loadAySessions(toYearId);
    _loadAyClasses(toYearId);
  } else {
    const msg = await parseApiError(res);
    errEl.textContent = msg; errEl.style.display = 'block';
    actionsEl.innerHTML = `
      <button class="sa-btn-cancel" onclick="_coaCloseModal('ay-promote-modal-overlay')">Cancel</button>
      <button class="sa-btn-submit" onclick="_ayRunPromoteConfirm(${toYearId}, ${fromId})">Retry Promote</button>`;
  }
}

function _ayRenderPromoteSummary(data, isDryRun) {
  const heading = isDryRun
    ? 'Dry-run result &mdash; nothing has been saved yet:'
    : 'Promotion result:';
  if (data === null || typeof data !== 'object') {
    return `<div style="font-weight:600;margin-bottom:6px;">${heading}</div><div>${_ayEsc(String(data))}</div>`;
  }
  const rows = Object.entries(data).map(([k, v]) => {
    const label = _ayEsc(k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    let val;
    if (Array.isArray(v)) {
      val = `${v.length} item${v.length === 1 ? '' : 's'}`;
      if (v.length && v.length <= 8 && v.every(x => typeof x !== 'object')) {
        val += `: ${v.map(x => _ayEsc(String(x))).join(', ')}`;
      }
    } else if (v && typeof v === 'object') {
      val = _ayEsc(JSON.stringify(v));
    } else {
      val = _ayEsc(String(v));
    }
    return `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid var(--grey-200,#e8e8e8);">
      <span style="color:#666;">${label}</span><span style="font-weight:600;text-align:right;">${val}</span>
    </div>`;
  }).join('');
  return `<div style="font-weight:600;margin-bottom:6px;">${heading}</div>${rows}`;
}

async function _saveAyLocalEdits(id) {
  const notes      = document.getElementById('ay-edit-notes').value || '';
  const is_inactive = document.getElementById('ay-edit-inactive').checked;
  const statusEl   = document.getElementById('ay-edit-status');

  const idx = _ayLocalData.findIndex(y => y.id === id);
  if (idx !== -1) { _ayLocalData[idx].notes = notes; _ayLocalData[idx].is_inactive = is_inactive; }

  try {
    const res = await fetch(`${API_BASE}/academic-years/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notes, is_inactive })
    });
    if (statusEl) {
      if (res.ok) {
        statusEl.innerHTML = '<div class="sa-toast sa-toast-success">Changes saved!</div>';
      } else {
        statusEl.innerHTML = '<div class="sa-toast sa-toast-error">Could not save to server.</div>';
      }
      setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 3000);
    }
  } catch (_) {
    if (statusEl) {
      statusEl.innerHTML = '<div class="sa-toast sa-toast-error">Network error.</div>';
      setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 3000);
    }
  }
}

async function saveAyTermDates(yearId, termId) {
  const actualStart = document.getElementById(`ay-term-as-${termId}`).value || null;
  const actualEnd   = document.getElementById(`ay-term-ae-${termId}`).value || null;
  const msgEl       = document.getElementById(`ay-term-msg-${termId}`);

  try {
    const res = await fetch(`${API_BASE}/academic-years/${yearId}/terms/${termId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ actual_start: actualStart, actual_end: actualEnd })
    });
    if (msgEl) {
      if (res.ok) {
        msgEl.style.color  = '#27ae60';
        msgEl.textContent  = 'Saved!';
        setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
      } else {
        const err = await res.json();
        msgEl.style.color  = '#c0392b';
        msgEl.textContent  = await parseApiError(res);
      }
    }
  } catch(e) {
    if (msgEl) { msgEl.style.color = '#c0392b'; msgEl.textContent = 'Failed to save.'; }
  }
}

// ==================== ACADEMIC LEVELS ====================

let _alvlData    = [];
let _alvlPage    = 1;
let _alvlPerPage = 10;

async function loadAcademicLevelsView(container) {
  await renderSplitView({
    container,
    title: 'Academic Levels',
    moduleKey: 'student_academics.levels',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Student Academics',view:'sa-academic-levels'},
      {label:'Academic Levels'}
    ],
    apiUrl: `${API_BASE}/academic-levels/`,
    searchFields: ['name','code'],
    col1Label: 'Name', col2Label: 'Code',
    col1: l => academicLevelDisplayName(l) || '—',
    col2: l => l.code || '—',
    rowLabel: l => academicLevelDisplayName(l) || '—',
    rowSub:   l => l.code || '',
    idKey: 'id',
    detailFields: [
      {label:'Name',        key:'name', fmt:(_,l)=>academicLevelDisplayName(l) || '—'},
      {label:'Code',        key:'code'},
      {label:'Description', key:'description', fmt:v=>v||'—'},
      {label:'Sort Order',  key:'sort_order', fmt:v=>v!=null?String(v):'—'},
      {label:'Status',      key:'status', fmt:v=>v||'Active'},
    ],
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#127891;</div>
        <p style="font-weight:600;margin-bottom:8px">Add a New Academic Level</p>
        <p style="font-size:13px;margin-bottom:20px">Set up a level's name, code and sort order.</p>
        <button class="btn-primary" style="padding:10px 24px" onclick="renderAlvlAddPage(document.getElementById('main-content'))">+ Add Academic Level</button>
      </div>`;
    },
    onAdd: () => renderAlvlAddPage(document.getElementById('main-content')),
    // NOTE: backend has no update endpoint for Academic Levels yet — live
    // openapi.json only lists GET/POST on /academic-levels/, no {id} route at
    // all (unlike /academic-years/{year_id} which does support PUT). This UI
    // is wired to PUT /academic-levels/{id} ahead of the backend so it's ready
    // the moment that route ships; until then Save here will 404/405.
    onEdit: item => renderAlvlEditPage(item, document.getElementById('main-content')),
  });
}

function _renderAlvlTable() {
  const totalEl = document.getElementById('alvl-total');
  if (totalEl) totalEl.textContent = _alvlData.length;

  const start = (_alvlPage - 1) * _alvlPerPage;
  const paged = _alvlData.slice(start, start + _alvlPerPage);
  const pages = Math.max(1, Math.ceil(_alvlData.length / _alvlPerPage));

  const rows = paged.length
    ? paged.map(l => `<tr>
        <td>${_ayEsc(l.name)}</td>
        <td>${_ayEsc(l.code)}</td>
        <td>${_ayEsc(l.description || '-')}</td>
        <td>${_ayEsc(String(l.sort_order ?? 0))}</td>
        <td><span style="color:${l.status==='Active'?'#27ae60':'#e74c3c'};font-weight:600;">${_ayEsc(l.status || 'Active')}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="sa-empty">No academic levels found. Add one to get started.</td></tr>';

  const c = document.getElementById('alvl-table-container');
  if (c) c.innerHTML = `
    <div class="sa-table-wrap">
      <table class="sa-table">
        <thead><tr>
          <th>NAME</th><th>CODE</th><th>DESCRIPTION</th><th>SORT ORDER</th><th>STATUS</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // simple pagination reuse
  const pg = document.createElement('div');
  pg.id = 'alvl-pagination';
  const existing = document.getElementById('alvl-pagination');
  if (existing) existing.remove();
  c?.after(pg);
  let btns = '';
  for (let i = 1; i <= pages; i++) btns += `<button class="${i===_alvlPage?'fin-pg-active':''}" onclick="alvlGoPage(${i})">${i}</button>`;
  pg.innerHTML = `<div class="fin-pagination">${btns}</div>`;
}

function changeAlvlPerPage(v) { _alvlPerPage = parseInt(v); _alvlPage = 1; _renderAlvlTable(); }
function alvlGoPage(p)        { _alvlPage = p; _renderAlvlTable(); }

function renderAlvlAddPage(container) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Add Academic Level</h2>
        <div class="sa-breadcrumb">
          Dashboard &rsaquo; Student Academics &rsaquo;
          <a href="#" class="sa-bc-link" onclick="loadView('sa-academic-levels');return false;">Academic Levels</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="sa-form-wrap" style="max-width:640px;">
        <div class="sa-form-grid-2">
          <div class="sa-form-group">
            <label class="sa-form-label">Name <span class="sa-required">*</span></label>
            <input type="text" id="alvl-name" class="sa-form-input" placeholder="e.g. Grade 1">
            <span class="sa-field-error" id="alvl-name-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Code <span class="sa-required">*</span> <small style="font-weight:400;color:#888;">(max 2 chars)</small></label>
            <input type="text" id="alvl-code" class="sa-form-input" placeholder="e.g. G1" maxlength="2">
            <span class="sa-field-error" id="alvl-code-err"></span>
          </div>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Description</label>
          <textarea id="alvl-desc" class="sa-form-textarea" rows="2" placeholder="Optional"></textarea>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Sort Order <small style="font-weight:400;color:#888;">(controls display order in dropdowns)</small></label>
          <input type="number" id="alvl-sort" class="sa-form-input" value="0" min="0" style="max-width:120px;">
        </div>
        <div class="sa-form-actions">
          <button id="alvl-save-btn" class="sa-btn-submit" onclick="saveAcademicLevel()">Save</button>
          <button class="sa-btn-cancel" onclick="loadView('sa-academic-levels')">Cancel</button>
        </div>
        <div id="alvl-status"></div>
      </div>
    </div>
  `;
}

function renderAlvlEditPage(item, container) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Edit Academic Level</h2>
        <div class="sa-breadcrumb">
          Dashboard &rsaquo; Student Academics &rsaquo;
          <a href="#" class="sa-bc-link" onclick="loadView('sa-academic-levels');return false;">Academic Levels</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="sa-form-wrap" style="max-width:640px;">
        <div class="sa-form-grid-2">
          <div class="sa-form-group">
            <label class="sa-form-label">Name <span class="sa-required">*</span></label>
            <input type="text" id="alvl-name" class="sa-form-input" value="${_ayEsc(item.name || '')}" placeholder="e.g. Grade 1">
            <span class="sa-field-error" id="alvl-name-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Code <span class="sa-required">*</span> <small style="font-weight:400;color:#888;">(max 2 chars)</small></label>
            <input type="text" id="alvl-code" class="sa-form-input" value="${_ayEsc(item.code || '')}" placeholder="e.g. G1" maxlength="2">
            <span class="sa-field-error" id="alvl-code-err"></span>
          </div>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Description</label>
          <textarea id="alvl-desc" class="sa-form-textarea" rows="2" placeholder="Optional">${_ayEsc(item.description || '')}</textarea>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Sort Order <small style="font-weight:400;color:#888;">(controls display order in dropdowns)</small></label>
          <input type="number" id="alvl-sort" class="sa-form-input" value="${item.sort_order ?? 0}" min="0" style="max-width:120px;">
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Status</label>
          <select id="alvl-status-field" class="sa-form-input" style="max-width:180px;">
            <option value="Active"${(item.status || 'Active') === 'Active' ? ' selected' : ''}>Active</option>
            <option value="Inactive"${item.status === 'Inactive' ? ' selected' : ''}>Inactive</option>
          </select>
        </div>
        <div class="sa-form-actions">
          <button id="alvl-save-btn" class="sa-btn-submit" onclick="updateAcademicLevel(${JSON.stringify(item.id)})">Save</button>
          <button class="sa-btn-cancel" onclick="loadView('sa-academic-levels')">Cancel</button>
        </div>
        <div id="alvl-status"></div>
      </div>
    </div>
  `;
}

async function updateAcademicLevel(id) {
  const name = (document.getElementById('alvl-name')?.value || '').trim();
  const code = (document.getElementById('alvl-code')?.value || '').trim();

  document.getElementById('alvl-name-err').textContent = name ? '' : 'Name is required.';
  document.getElementById('alvl-code-err').textContent = code ? '' : 'Code is required (max 2 characters).';
  if (!name || !code) return;

  const btn = document.getElementById('alvl-save-btn');
  const statusEl = document.getElementById('alvl-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const res = await apiFetch(`${API_BASE}/academic-levels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      code,
      description: document.getElementById('alvl-desc')?.value.trim() || null,
      sort_order:  parseInt(document.getElementById('alvl-sort')?.value || '0') || 0,
      status:      document.getElementById('alvl-status-field')?.value || 'Active',
    }),
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Save'; }

  if (res && res.ok) {
    showToast('Academic level updated!', 'success');
    loadView('sa-academic-levels');
  } else {
    const msg = res ? await parseApiError(res) : 'Could not save. Please try again.';
    if (statusEl) statusEl.innerHTML = `<div class="sa-toast sa-toast-error">${_ayEsc(msg)}</div>`;
    showToast(msg, 'error');
  }
}

async function saveAcademicLevel() {
  const name = (document.getElementById('alvl-name')?.value || '').trim();
  const code = (document.getElementById('alvl-code')?.value || '').trim();

  document.getElementById('alvl-name-err').textContent = name ? '' : 'Name is required.';
  document.getElementById('alvl-code-err').textContent = code ? '' : 'Code is required (max 2 characters).';
  if (!name || !code) return;

  const btn = document.getElementById('alvl-save-btn');
  const statusEl = document.getElementById('alvl-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const res = await apiFetch(`${API_BASE}/academic-levels/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      code,
      description: document.getElementById('alvl-desc')?.value.trim() || null,
      sort_order:  parseInt(document.getElementById('alvl-sort')?.value || '0') || 0,
    }),
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Save'; }

  if (res && res.ok) {
    showToast('Academic level saved!', 'success');
    loadView('sa-academic-levels');
  } else {
    const msg = res ? await parseApiError(res) : 'Could not save. Please try again.';
    if (statusEl) statusEl.innerHTML = `<div class="sa-toast sa-toast-error">${_ayEsc(msg)}</div>`;
    showToast(msg, 'error');
  }
}

// ==================== HELPERS ====================

function _fmtDDMmmYYYY(dateStr) {
  if (!dateStr) return '-';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parts  = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
}

function _ayEsc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
