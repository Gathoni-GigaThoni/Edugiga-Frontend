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
// TermRead carries term_type_id (not session_type_id — the FE read path had
// kept the pre-rename name, so this column rendered "-" for every term) and
// also resolves term_type_name server-side. Prefer the wire's own label and
// fall back to the type cache only when it is absent.
function _sessTypeLabel(s) {
  return s.term_type_name || _getSessTypeName(s.term_type_id);
}
// Term and SessionType are is_active on the wire. Only AcademicYear carries
// is_inactive; reading it here meant every term and every term type reported
// "Active" regardless of its real state.
function _sessIsInactive(rec) { return rec?.is_active === false; }
// Term types offered in a picker: active ones only. The old `!t.is_inactive`
// test read an absent field, so `!undefined` passed every type through.
function _sessActiveTypes() {
  return (typeof sessionTypesData !== 'undefined' ? sessionTypesData : [])
    .filter(t => t.is_active !== false);
}
function _getSessAYName(ayId) {
  const y = _sessAYCache.find(x => String(x.id) === String(ayId));
  return y ? y.name : '-';
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadTermsView(container) { return loadSessionsView(container); }
async function loadSessionsView(container) {
  await Promise.all([_fetchSessAYCache(), _fetchSessTypes()]);
  await renderSplitView({
    container,
    title: 'Terms',
    moduleKey: 'student_academics.academic_year_setup',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Student Academics',view:'sa-sessions'},
      {label:'Terms'}
    ],
    apiUrl: `${API_BASE}/terms/`,
    searchFields: ['title','name'],
    col1Label: 'Title', col2Label: 'Academic Year',
    col1: s => s.title || s.name || '—',
    col2: s => _getSessAYName(s.academic_year_id),
    rowLabel: s => s.title || s.name || '—',
    rowSub:   s => _getSessAYName(s.academic_year_id),
    idKey: 'id',
    detailFields: [
      {label:'Title',         key:'title'},
      {label:'Academic Year', key:'academic_year_id', fmt:v=>_getSessAYName(v)},
      {label:'Term Type',     key:'term_type_id', fmt:(_,s)=>_sessTypeLabel(s)},
      {label:'Start Date',    key:'start_date', fmt:v=>_toDDMMYYYY(v)},
      {label:'End Date',      key:'end_date', fmt:v=>_toDDMMYYYY(v)},
      {label:'Status',        key:'is_active', fmt:v=>v===false?'Inactive':'Active'},
    ],
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#128197;</div>
        <p style="font-weight:600;margin-bottom:8px">Add a New Term</p>
        <p style="font-size:13px;margin-bottom:20px">Set up a term's title, academic year, type and dates.</p>
        <button class="btn-primary" style="padding:10px 24px" onclick="renderSessAddPage(document.getElementById('main-content'))">+ Add Term</button>
      </div>`;
    },
    onAdd:  () => renderSessAddPage(document.getElementById('main-content')),
    onEdit: item => openSessEdit(item.id),
    detailActions: _sessDetailActions,
  });
}

// ── Open Term (BE addendum 2026-08-31 §I) ─────────────────────────────────
// POST /terms/{id}/open stamps the per-term StudentFeeAssignment rows for
// every active enrollment — tuition, transport, meal plan and ECA. Without it
// invoice generation for Term 2/3 fails outright ("No StudentFeeAssignment
// rows found"), because the enrollment hooks only ever fire for a student's
// first term. Gated on finance.receivables, the same scope the endpoint uses.
//
// Two-step dry-run -> confirm, matching year-end promotion (2026-08-10) and
// fiscal-year close (2026-08-17). The endpoint is idempotent — every upsert
// honours a (student, term, schedule) unique constraint — so the button is
// deliberately not disabled after a successful run: the normal recovery from
// a warning is to fix the student and open the term again.
// The term's name is stashed rather than passed through the onclick: an
// apostrophe or a quote in a term title would otherwise break out of the
// attribute.
let _sessOpenTermName = '';
function _sessDetailActions(item) {
  if (!canAdd('finance.receivables')) return '';
  _sessOpenTermName = item.title || item.name || `Term #${item.id}`;
  return `<button class="fin-btn-teal" onclick="_sessOpenTermModal(${item.id})">Open Term</button>`;
}

function _sessOpenTermModal(termId) {
  const termName = _sessOpenTermName;
  const wrap = document.createElement('div');
  wrap.id = 'sess-openterm-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white,#fff);border-radius:8px;padding:24px;width:640px;max-width:95vw;max-height:85vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 10px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Open Term ${_sEsc(termName)} for invoicing</h3>
      <div id="sess-openterm-body">
        <p style="font-size:0.86rem;color:#666;margin:0 0 4px;">
          This stamps tuition, transport, meal-plan and ECA fee assignments for every active student enrolled in this term.
          Until it runs, invoices for the term cannot be generated.
        </p>
        <p style="font-size:0.86rem;color:#666;margin:0;">Run a dry-run preview first? Nothing will be written.</p>
      </div>
      <div id="sess-openterm-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100,#fdecea);color:var(--coral-600,#c0392b);font-size:0.82rem;margin-top:12px;"></div>
      <div id="sess-openterm-actions" style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('sess-openterm-overlay')">Cancel</button>
        <button class="fin-btn-teal" id="sess-openterm-preview-btn" onclick="_sessOpenTermPreview(${termId})">Preview</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

function _sessOpenTermStat(label, value, color) {
  return `<div style="flex:1;min-width:130px;background:var(--white,#fff);border:1px solid var(--card-border,#e5e5e5);border-radius:8px;padding:12px 14px;">
    <div style="font-size:11px;font-weight:600;color:var(--grey-400,#999);text-transform:uppercase;letter-spacing:0.06em;">${_sEsc(label)}</div>
    <div style="font-size:1.15rem;font-weight:700;margin-top:4px;color:${color || 'var(--navy-700,#1B3057)'};">${_sEsc(String(value))}</div>
  </div>`;
}

// Warnings name students the run could not fully handle (no academic level, no
// matching fee schedule). They are informational and must not block the
// confirm: the counts they belong to are still real, and the operator can fix
// the named students and re-run.
function _sessOpenTermSummary(d, isDryRun) {
  const otherCreated = (d.transport_created || 0) + (d.meal_created || 0) + (d.eca_created || 0);
  const warnings = Array.isArray(d.warnings) ? d.warnings : [];
  return `
    ${isDryRun ? `<p style="font-size:0.85rem;color:#666;margin:0 0 12px;">Dry run &mdash; nothing has been written yet.</p>` : ''}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
      ${_sessOpenTermStat('Students Scanned', d.students_scanned ?? 0)}
      ${_sessOpenTermStat('Tuition Created', d.tuition_created ?? 0)}
      ${_sessOpenTermStat('Meal + Transport + ECA', otherCreated)}
      ${_sessOpenTermStat('Warnings', warnings.length, warnings.length ? 'var(--coral-600,#c0392b)' : 'var(--grey-400,#999)')}
    </div>
    <div style="font-size:0.8rem;color:#666;margin-bottom:12px;">
      Already assigned (skipped as duplicates): tuition ${d.tuition_existing ?? 0} &middot; transport ${d.transport_existing ?? 0} &middot; meals ${d.meal_existing ?? 0} &middot; ECA ${d.eca_existing ?? 0}.
      Tuition skipped: ${d.tuition_skipped ?? 0}.
    </div>
    ${warnings.length ? `
      <div style="padding:10px 14px;border-radius:6px;border-left:3px solid var(--gold-500,#C9A227);background:var(--gold-100,#fdf3d6);color:#7a6110;font-size:0.84rem;">
        <div style="font-weight:600;margin-bottom:6px;">${warnings.length} warning(s) &mdash; students that may need attention:</div>
        <ul style="margin:0;padding-left:18px;">${warnings.map(w => `<li style="margin-bottom:3px;">${_sEsc(String(w))}</li>`).join('')}</ul>
        <div style="margin-top:8px;">These do not block opening the term. Opening is idempotent, so you can fix these students and run it again.</div>
      </div>` : ''}`;
}

async function _sessOpenTermPreview(termId) {
  const errEl = document.getElementById('sess-openterm-err');
  const btn   = document.getElementById('sess-openterm-preview-btn');
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Running preview\u2026';

  const res = await apiFetch(`${API_BASE}/terms/${termId}/open?dry_run=true`, { method: 'POST' });
  if (!res || !res.ok) {
    btn.disabled = false; btn.textContent = 'Preview';
    errEl.textContent = res ? await parseApiError(res) : 'Network error — try again.';
    errEl.style.display = 'block';
    return;
  }
  const data = await res.json();
  document.getElementById('sess-openterm-body').innerHTML = _sessOpenTermSummary(data, true);
  document.getElementById('sess-openterm-actions').innerHTML = `
    <button class="fin-btn-cancel" onclick="_coaCloseModal('sess-openterm-overlay')">Back</button>
    <button class="fin-btn-teal" id="sess-openterm-confirm-btn" onclick="_sessOpenTermConfirm(${termId})">Confirm Open Term</button>`;
}

async function _sessOpenTermConfirm(termId) {
  const errEl     = document.getElementById('sess-openterm-err');
  const actionsEl = document.getElementById('sess-openterm-actions');
  errEl.style.display = 'none';
  actionsEl.innerHTML = '<button class="fin-btn-teal" disabled>Opening term\u2026</button>';

  const res = await apiFetch(`${API_BASE}/terms/${termId}/open`, { method: 'POST' });
  if (!res || !res.ok) {
    errEl.textContent = res ? await parseApiError(res) : 'Network error — try again.';
    errEl.style.display = 'block';
    actionsEl.innerHTML = `
      <button class="fin-btn-cancel" onclick="_coaCloseModal('sess-openterm-overlay')">Cancel</button>
      <button class="fin-btn-teal" onclick="_sessOpenTermConfirm(${termId})">Retry</button>`;
    return;
  }
  const d = await res.json();
  const warnings = Array.isArray(d.warnings) ? d.warnings : [];
  // The result stays on screen rather than closing the modal: the warnings are
  // the whole point of reading it, and a toast is not somewhere you can read a
  // list of student codes.
  document.getElementById('sess-openterm-body').innerHTML = _sessOpenTermSummary(d, false);
  actionsEl.innerHTML = `<button class="fin-btn-teal" onclick="_coaCloseModal('sess-openterm-overlay')">Done</button>`;
  showToast(`Term opened. Tuition: ${d.tuition_created ?? 0}, Meal: ${d.meal_created ?? 0}, Transport: ${d.transport_created ?? 0}, ECA: ${d.eca_created ?? 0} assignments created.`, 'success');
  if (warnings.length) {
    showToast(`${warnings.length} student(s) need attention — see Warnings for details.`, 'error');
  }
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
  const res = await apiFetch(`${API_BASE}/terms/`);
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
  const typeOptions = _sessActiveTypes()
    .map(t => `<option value="${t.id}"${_sessFilterType === String(t.id) ? ' selected' : ''}>${_sEsc(t.title || t.name || '')}</option>`)
    .join('');

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Terms</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Academics &rsaquo; Terms &rsaquo; Listing</div>
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
          <button class="fin-btn-teal" onclick="renderSessAddPage(document.getElementById('main-content'))">+ Add Term</button>
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
            <label>Term Type</label>
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
    if (_sessFilterType && String(s.term_type_id)  !== String(_sessFilterType)) return false;
    if (_sessFilterStat === 'active'   && _sessIsInactive(s))  return false;
    if (_sessFilterStat === 'inactive' && !_sessIsInactive(s)) return false;
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
    rows = `<tr><td colspan="${COLS}" class="fin-empty">No terms found.</td></tr>`;
  } else {
    paged.forEach(s => {
      const typeName   = _sessTypeLabel(s);
      const ayName     = _getSessAYName(s.academic_year_id);
      const statusBadge = _sessIsInactive(s)
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
          <th>TITLE</th><th>TERM TYPE</th><th>ACADEMIC YEAR</th>
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
        <h2 class="fin-title">Add Term</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Student Academics &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('sa-sessions');return false;">Terms</a>
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
            <label>Term Type <span style="color:#e74c3c">*</span></label>
            <select id="sess-add-type" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
              <option value="">— Select Type —</option>
              ${_sessActiveTypes()
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
    term_type_id:     typeId,
    academic_year_id: parseInt(ayId),
    start_date:  document.getElementById('sess-add-start')?.value || '',
    end_date:    document.getElementById('sess-add-end')?.value   || '',
    notes:       document.getElementById('sess-add-notes')?.value || '',
    is_active:   !document.getElementById('sess-add-inactive')?.checked
  };

  const res = await apiFetch(`${API_BASE}/terms/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  if (!res) return;
  if (res.ok) {
    showToast('Term saved successfully!', 'success');
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
    // TODO: convert to apiFetch (raw fetch bypasses auth retry logic — out of scope for this patch)
    const res = await apiFetch(`${API_BASE}/terms/${id}`);
    if (res && res.ok) sess = await res.json();
  } catch (_) {}

  if (!sess) { showToast('Term not found.', 'error'); loadView('sa-sessions'); return; }
  _renderSessEditPage(container, sess);
}

function _renderSessEditPage(container, sess) {
  const typeOptions = _sessActiveTypes()
    .map(t => `<option value="${t.id}"${String(t.id) === String(sess.term_type_id) ? ' selected' : ''}>${_sEsc(t.title || t.name || '')}</option>`)
    .join('');
  const ayOptions = _sessAYCache.map(y =>
    `<option value="${y.id}"${String(y.id) === String(sess.academic_year_id) ? ' selected' : ''}>${_sEsc(_formatAYLabel(y))}</option>`
  ).join('');

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Term</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Student Academics &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('sa-sessions');return false;">Terms</a>
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
            <label>Term Type <span style="color:#e74c3c">*</span></label>
            <select id="sess-edit-type" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
              <option value="">— Select Type —</option>${typeOptions}
            </select>
            <span class="stu-field-error" id="sess-edit-type-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Academic Year</label>
            <select id="sess-edit-ay" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;" disabled>
              <option value="">— Select Academic Year —</option>${ayOptions}
            </select>
            <span class="fin-field-hint" style="font-size:0.8rem;color:#666;">A term cannot be moved between academic years — the update endpoint does not accept the field. Delete and re-create the term under the right year.</span>
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
            <label><input type="checkbox" id="sess-edit-inactive"${_sessIsInactive(sess) ? ' checked' : ''}> Mark as Inactive</label>
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

  document.getElementById('sess-edit-title-err').textContent = title  ? '' : 'This field is required.';
  document.getElementById('sess-edit-type-err').textContent  = typeId ? '' : 'This field is required.';
  if (!title || !typeId) return;

  const btn      = document.getElementById('sess-edit-btn');
  const statusEl = document.getElementById('sess-edit-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  // TermUpdate has no academic_year_id — a term cannot be moved between
  // academic years through this endpoint, so it is not sent. The picker is
  // disabled on the edit form to match (see _renderSessEditPage).
  const payload = {
    title,
    term_type_id: typeId,
    start_date:  document.getElementById('sess-edit-start')?.value || '',
    end_date:    document.getElementById('sess-edit-end')?.value   || '',
    notes:       document.getElementById('sess-edit-notes')?.value || '',
    is_active:   !document.getElementById('sess-edit-inactive')?.checked
  };

  const res = await apiFetch(`${API_BASE}/terms/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Update'; }
  if (!res) return;
  if (res.ok) {
    showToast('Term updated successfully!', 'success');
    loadView('sa-sessions');
  } else {
    const msg = await parseApiError(res);
    if (statusEl) statusEl.innerHTML = `<span style="color:#e74c3c;font-size:0.88rem;">${_sEsc(msg)}</span>`;
    showToast(msg, 'error');
  }
}
