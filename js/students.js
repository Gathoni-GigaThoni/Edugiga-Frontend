// ==================== STUDENT MANAGEMENT ====================

// ── Module-level state ────────────────────────────────────────────────────────
let allStudentsData      = [];
let streamsData          = [];
let fundingSourcesData   = [];
let studentSourcesData   = [];
let studentReportingData = [];

let _stuTermsCache  = [];

let _stuListPage    = 1;
let _stuListPerPage = 10;
let _stuListSearch  = '';
let _stuListFilters = {};

let _currentEditStudentId = null; // null = Add mode
let _stuEditActiveTab     = 'personal';
let _stuEditDirty         = false;

// Cached dropdown data for the edit form
let _stuFormTransportRoutes = [];
let _stuFormExtraCurriculum = [];

// In-progress transport cascade selection (Route -> Journey Type -> Time of Day modals).
// Discarded on Cancel; only committed to window._stuFormData on Finish.
let _stuTransportCascade = { routeId: null, journeyType: null, timeOfDay: null };

// ── Shared helpers ────────────────────────────────────────────────────────────
function _esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function calculateAge(birthDateStr) {
  if (!birthDateStr) return '';
  const birth = new Date(birthDateStr);
  const now   = new Date();
  let years   = now.getFullYear() - birth.getFullYear();
  let months  = now.getMonth() - birth.getMonth();
  if (months < 0) { years--; months += 12; }
  if (now.getDate() < birth.getDate()) { months--; if (months < 0) { years--; months += 12; } }
  return `${years} year(s) ${months} month(s)`;
}

function _fv(id)    { return document.getElementById(id)?.value ?? ''; }
function _fc(id)    { return !!document.getElementById(id)?.checked; }
function _fradio(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}

function _toArray(raw) { return Array.isArray(raw) ? raw : (raw?.data || raw?.items || raw?.results || []); }

function _mkPagination(containerId, page, pages, goFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let btns = '';
  for (let i = 1; i <= pages; i++) {
    btns += `<button class="${i === page ? 'fin-pg-active' : ''}" onclick="${goFn}(${i})">${i}</button>`;
  }
  el.innerHTML = `<div class="fin-pagination">${btns}</div>`;
}

function openStuMgmtDropdowns() {
  const d = document.getElementById('student-management-dropdown');
  if (d) d.style.display = 'block';
}
function openStuReportsDropdown() {
  openStuMgmtDropdowns();
  const d = document.getElementById('stu-reports-dropdown');
  if (d) d.style.display = 'block';
}
function openStuUtilitiesDropdown() {
  openStuMgmtDropdowns();
  const d = document.getElementById('stu-utilities-dropdown');
  if (d) d.style.display = 'block';
}

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="stu-dd-"]').forEach(d => d.style.display = 'none');
});

// ==================== 1. STUDENTS LISTING ====================

async function loadStudentsListView(container) {
  // Pre-fetch terms so detail view can resolve term names
  try {
    const termsRes = await apiFetch(`${API_BASE}/terms/`);
    if (termsRes && termsRes.ok) _stuTermsCache = _toArray(await termsRes.json());
  } catch (_) {}

  await renderSplitView({
    container,
    title: 'Students',
    moduleKey: 'student_management.students',
    breadcrumb: [
      { label: 'Dashboard',           view: null },
      { label: 'Student Management',  view: 'students-list' },
      { label: 'Students' }
    ],
    apiUrl: `${API_BASE}/students/`,
    searchFields: ['first_name', 'last_name', 'student_id'],
    col1Label: 'Name',
    col2Label: 'Class / ID',
    col1:     s => `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unnamed',
    col2:     s => [s.student_id, s.school_class_name || s.level_of_academics_name].filter(Boolean).join(' · '),
    rowLabel: s => `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unnamed',
    rowSub:   s => [s.student_id, s.school_class_name || s.level_of_academics_name].filter(Boolean).join(' · '),
    idKey: 'id',
    detailFields: [
      { label: 'Student ID',         key: 'student_id' },
      { label: 'Gender',             key: 'gender' },
      { label: 'Term',               key: 'term_id',             fmt: v => _stuTermName(v) },
      { label: 'Level of Academics', key: 'school_class_name',   fmt: (v, item) => v || item.level_of_academics_name || '—' },
      { label: 'Stream',             key: 'stream' },
      { label: 'Student Type',       key: 'student_type' },
      { label: 'Status',             key: 'is_active',           fmt: v => v ? 'Active' : 'Inactive' },
    ],
    renderAdd: (el) => {
      _currentEditStudentId = null;
      _stuEditActiveTab = 'personal';
      clearStudentDraft();
      loadStudentFormView(el);
    },
    renderEdit: (item, el) => {
      _currentEditStudentId = item.id;
      _stuEditActiveTab = 'personal';
      clearStudentDraft();
      loadStudentFormView(el);
    },
  });

  const countEl = container.querySelector('.split-left-count');
  if (countEl && !document.getElementById('stu-import-btn')) {
    const btn = document.createElement('button');
    btn.id = 'stu-import-btn';
    btn.textContent = 'Import';
    btn.className = 'fin-btn-outline';
    btn.style.cssText = 'margin-left:8px;padding:2px 10px;font-size:0.72rem;';
    btn.onclick = _stuOpenImportWizard;
    countEl.insertAdjacentElement('afterend', btn);
  }
}

// ── Bulk Student Import wizard (2 steps: preview → confirm) ────────────────
// Distinct from the generic /bulk/{module}/upload widget in ui-helpers.js —
// students use their own dry-run preview endpoint that validates rows without
// writing anything, then a separate confirm step that commits each row
// independently (one bad row doesn't block the rest).
let _stuImportPreview = null;

function _stuOpenImportWizard() {
  const wrap = document.createElement('div');
  wrap.id = 'stu-import-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:auto;padding:24px;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:720px;max-width:100%;max-height:85vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Import Students</h3>
      <div id="stu-import-body"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('stu-import-modal-overlay').remove()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  _stuImportPreview = null;
  _stuRenderImportStep1();
}

function _stuRenderImportStep1() {
  const body = document.getElementById('stu-import-body');
  if (!body) return;
  body.innerHTML = `
    <p style="color:#666;font-size:0.9rem;">Upload a CSV or Excel file of students. Nothing is saved until you confirm on the next step.</p>
    <input type="file" id="stu-import-file" accept=".csv,.xlsx,.xls" style="display:none;" onchange="_stuUploadImportFile(this)">
    <button class="fin-btn-teal" onclick="document.getElementById('stu-import-file').click()">Choose File &amp; Upload</button>
    <span id="stu-import-status" style="margin-left:10px;color:#888;font-size:0.85rem;"></span>`;
}

async function _stuUploadImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('stu-import-status');
  if (statusEl) statusEl.textContent = 'Uploading…';
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch(`${API_BASE}/students/import`, { method: 'POST', body: fd });
  if (!res || !res.ok) {
    if (statusEl) statusEl.textContent = '';
    showToast('Upload failed: ' + (res ? await parseApiError(res) : 'network error'), 'error');
    return;
  }
  _stuImportPreview = await res.json();
  _stuRenderImportStep2();
}

function _stuRenderImportStep2() {
  const body = document.getElementById('stu-import-body');
  if (!body) return;
  const p = _stuImportPreview || {};
  const valid = p.valid || [];
  const invalid = p.invalid || [];
  body.innerHTML = `
    <div class="fin-controls-row">
      <div class="fin-controls-left">${p.total_rows ?? (valid.length + invalid.length)} rows &middot; ${p.valid_count ?? valid.length} valid &middot; ${p.invalid_count ?? invalid.length} invalid</div>
    </div>
    ${invalid.length ? `
      <details open style="margin-top:10px;">
        <summary style="cursor:pointer;font-weight:600;color:#c0392b;">Invalid rows (${invalid.length})</summary>
        <div class="fin-table-wrap"><table class="fin-table">
          <thead><tr><th>Row</th><th>Errors</th></tr></thead>
          <tbody>${invalid.map(r => `<tr><td>${_finEsc(r.row ?? r.row_number ?? '')}</td><td>${_finEsc((r.errors || []).join('; '))}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>` : ''}
    <div style="margin-top:14px;color:#666;font-size:0.9rem;">${valid.length} row(s) will be created. Each row is committed independently.</div>
    <div class="fin-form-actions">
      <button class="fin-btn-cancel" onclick="_stuOpenImportWizard()">Start Over</button>
      <button class="fin-btn-teal" ${valid.length ? '' : 'disabled'} onclick="_stuConfirmImport()">Confirm Import (${valid.length})</button>
    </div>`;
}

async function _stuConfirmImport() {
  const valid = (_stuImportPreview && _stuImportPreview.valid) || [];
  const rows = valid.map(v => v.data || v);
  const res = await apiFetch(`${API_BASE}/students/import/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }),
  });
  if (!res || !res.ok) { showToast('Error: ' + (res ? await parseApiError(res) : 'network error'), 'error'); return; }
  const result = await res.json();
  const created = result.created ?? 0;
  const errorsCount = result.errors_count ?? (result.errors || []).length;
  showToast(`Imported ${created} student(s)${errorsCount ? `, ${errorsCount} error(s)` : ''}.`, errorsCount ? 'error' : 'success');
  document.getElementById('stu-import-modal-overlay')?.remove();
  loadView('students-list');
}

async function refreshStudentsListing() {
  const c = document.getElementById('stu-table-container');
  if (!c) return;
  try {
    const [res, termsRes] = await Promise.all([
      apiFetch(`${API_BASE}/students/`),
      apiFetch(`${API_BASE}/terms/`),
    ]);
    if (!res || !res.ok) { c.innerHTML = '<p class="fin-error">Error loading students.</p>'; return; }
    allStudentsData = await res.json();
    _stuTermsCache = (termsRes && termsRes.ok) ? _toArray(await termsRes.json()) : _stuTermsCache;
  } catch (_) { c.innerHTML = '<p class="fin-error">Failed to load students.</p>'; return; }
  _stuListPage = 1;
  _renderStuTable();
}
function _stuTermName(termId) {
  if (!termId) return '-';
  const t = _stuTermsCache.find(t => String(t.id) === String(termId));
  return t ? (t.title || t.name || `Term ${termId}`) : '-';
}

function _stuFiltered() {
  let d = allStudentsData;
  if (_stuListSearch) {
    const q = _stuListSearch;
    d = d.filter(s =>
      (`${s.first_name} ${s.last_name}`).toLowerCase().includes(q) ||
      (s.student_id || '').toLowerCase().includes(q)
    );
  }
  if (_stuListFilters.gender) d = d.filter(s => (s.gender || '') === _stuListFilters.gender);
  if (_stuListFilters.status !== undefined && _stuListFilters.status !== '')
    d = d.filter(s => String(s.is_active) === _stuListFilters.status);
  return d;
}

function _renderStuTable() {
  const filtered = _stuFiltered();
  const totalEl  = document.getElementById('stu-total-count');
  if (totalEl) totalEl.textContent = filtered.length;

  const start = (_stuListPage - 1) * _stuListPerPage;
  const paged = filtered.slice(start, start + _stuListPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _stuListPerPage));
  const COLS  = 9;

  let rows = '';
  if (paged.length === 0) {
    rows = `<tr><td colspan="${COLS}" class="fin-empty">No records found.</td></tr>`;
  } else {
    paged.forEach(s => {
      const statusColor = s.is_active ? '#27ae60' : '#e74c3c';
      const statusText  = s.is_active ? 'Active' : 'Inactive';
      rows += `<tr>
        <td>${_esc(s.student_id || '')}</td>
        <td>${_esc(`${s.first_name || ''} ${s.last_name || ''}`.trim())}</td>
        <td>${_esc(s.gender || '-')}</td>
        <td>${_esc(_stuTermName(s.term_id))}</td>
        <td>${_esc(s.school_class_name || s.level_of_academics_name || '-')}</td>
        <td>${_esc(s.stream || '-')}</td>
        <td>${_esc(s.student_type || '-')}</td>
        <td><span style="color:${statusColor};font-weight:600;">${statusText}</span></td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,${s.id})">&#8230;</button>
            <div id="stu-dd-${s.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="stuOpenEdit(${s.id});return false;">&#9998; Edit</a>
              <a href="#" onclick="stuOpenView(${s.id});return false;">&#128065; View</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  const tbl = document.getElementById('stu-table-container');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>STUDENT ID</th><th>STUDENT NAME</th><th>GENDER</th><th>TERM</th>
          <th>LEVEL OF ACADEMICS</th><th>STREAM</th><th>STUDENT TYPE</th><th>STATUS</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  _mkPagination('stu-pagination', _stuListPage, pages, 'stuListGoPage');
}

function toggleStuDd(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="stu-dd-"]').forEach(d => {
    if (d.id !== `stu-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`stu-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function stuOpenEdit(id) {
  _currentEditStudentId = id;
  loadView('students-edit');
}
function stuOpenView(id) {
  _currentEditStudentId = id;
  loadView('students-view');
}

function changeStuPerPage(v) { _stuListPerPage = parseInt(v); _stuListPage = 1; _renderStuTable(); }
function onStuSearch(v)      { _stuListSearch  = v.trim().toLowerCase(); _stuListPage = 1; _renderStuTable(); }
function stuListGoPage(p)    { _stuListPage = p; _renderStuTable(); }

function showStuFilterPanel()   { const o = document.getElementById('stu-filter-overlay'); if (o) o.style.display = 'block'; }
function closeStuFilterPanel(e) {
  if (e && e.target !== document.getElementById('stu-filter-overlay')) return;
  const o = document.getElementById('stu-filter-overlay');
  if (o) o.style.display = 'none';
}
function applyStuFilters() {
  _stuListFilters.gender = document.getElementById('sf-gender')?.value || '';
  _stuListFilters.status = document.getElementById('sf-status')?.value ?? '';
  _stuListPage = 1;
  _renderStuTable();
  closeStuFilterPanel();
}
function clearStuFilters() {
  _stuListFilters = {};
  ['sf-gender','sf-status'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _stuListPage = 1;
  _renderStuTable();
  closeStuFilterPanel();
}

function exportStudentsCSV() {
  const cols = ['Student ID','Full Name','Gender','Term','Level of Academics','Stream','Student Type','Status'];
  const rows = _stuFiltered().map(s => [
    s.student_id || '',
    `${s.first_name || ''} ${s.last_name || ''}`.trim(),
    s.gender || '',
    _stuTermName(s.term_id),
    s.school_class_name || s.level_of_academics_name || '',
    s.stream || '',
    s.student_type || '',
    s.is_active ? 'Active' : 'Inactive'
  ]);
  exportTableCSV(cols, rows, 'students.csv');
}

// ==================== 2. EDIT / ADD STUDENT FORM ====================

const _STU_TABS = [
  { id: 'personal',   label: 'Personal Data' },
  { id: 'prev-edu',   label: 'Previous Education' },
  { id: 'guardian',   label: 'Guardian/Family' },
  { id: 'medical',    label: 'Medical Information' },
  { id: 'documents',  label: 'Document Uploads' },
];

// ==================== ADD STUDENT — DRAFT PERSISTENCE ====================
// Add-mode only (never Edit) — autosaves field values to sessionStorage so a
// partially-filled Add Student form survives navigating away and back within
// the same browser session.
const STUDENT_DRAFT_KEY = 'student-add-draft';

function saveStudentDraft(data) { sessionStorage.setItem(STUDENT_DRAFT_KEY, JSON.stringify(data)); }
function loadStudentDraft() {
  const raw = sessionStorage.getItem(STUDENT_DRAFT_KEY);
  return raw ? JSON.parse(raw) : null;
}
function clearStudentDraft() { sessionStorage.removeItem(STUDENT_DRAFT_KEY); }

// Merges this tab's current field values into the stored draft (other tabs'
// previously-saved values are preserved since only one tab's fields exist in
// the DOM at a time).
function snapshotStudentDraft(tabContainer) {
  const draft = loadStudentDraft() || {};
  draft._activeTab = _stuEditActiveTab;
  tabContainer.querySelectorAll('[data-draft-key]').forEach(field => {
    const k = field.dataset.draftKey;
    draft[k] = (field.type === 'checkbox' || field.type === 'radio') ? field.checked : field.value;
  });
  saveStudentDraft(draft);
}

// Assigns data-draft-key to every restorable field in the just-rendered tab and
// wires autosave. Skips file inputs and read-only/disabled fields.
function attachStudentDraftAutoSave(tabContainer) {
  tabContainer.querySelectorAll('input,select,textarea').forEach(field => {
    if (field.type === 'file' || field.readOnly || field.disabled || !field.id) return;
    if (!field.dataset.draftKey) field.dataset.draftKey = field.id;
    field.addEventListener('input',  () => snapshotStudentDraft(tabContainer));
    field.addEventListener('change', () => snapshotStudentDraft(tabContainer));
  });
}

// Restores any saved values for fields present in the just-rendered tab. Shows
// the "draft restored" banner once per form open (only on the first tab shown).
function restoreStudentDraftForTab(tabContainer, showBanner) {
  const draft = loadStudentDraft();
  if (!draft) return;

  tabContainer.querySelectorAll('[data-draft-key]').forEach(field => {
    if (field.id === 'se-level') return; // handled separately — its options load async
    const k = field.dataset.draftKey;
    if (draft[k] === undefined) return;
    if (field.type === 'checkbox' || field.type === 'radio') field.checked = draft[k];
    else field.value = draft[k];
    // Re-fire change so dependent UI (toggleSiblingSection, onStuLevelChange, term
    // derivation, etc., all wired via inline onchange) reacts to the restored value.
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });

  if (showBanner && !tabContainer.querySelector('.draft-restored-banner')) {
    const banner = document.createElement('div');
    banner.className = 'draft-restored-banner';
    banner.innerHTML = '<span>Unsaved draft restored from your last session.</span>' +
      '<button class="draft-discard-btn" type="button">Discard draft</button>';
    tabContainer.prepend(banner);
    banner.querySelector('.draft-discard-btn').addEventListener('click', () => {
      clearStudentDraft();
      banner.remove();
      tabContainer.querySelectorAll('[data-draft-key]').forEach(f => {
        if (f.type === 'checkbox' || f.type === 'radio') f.checked = false;
        else f.value = '';
      });
    });
  }
}

async function loadStudentFormView(container) {
  const isEdit = !!_currentEditStudentId;
  const title  = isEdit ? 'Edit Student' : 'Add Student';
  _stuEditActiveTab    = 'personal';
  window._stuFormFiles = {};

  window._stuDraftBannerShown = false;
  if (!isEdit) {
    const draft = loadStudentDraft();
    if (draft && draft._activeTab && _STU_TABS.some(t => t.id === draft._activeTab)) {
      _stuEditActiveTab = draft._activeTab;
    }
  }

  container.innerHTML = `
    <div class="fin-page" style="padding:0;">
      <div class="stu-edit-shell">
        <div class="fin-header-row" style="padding:20px 28px 0;margin:0;">
          <h2 class="fin-title">${title}</h2>
          <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Students &rsaquo; ${title}</div>
        </div>
        <div class="stu-tab-bar" id="stu-edit-tab-bar">
          ${_STU_TABS.map(t =>
            `<button class="stu-tab-btn${_stuEditActiveTab===t.id?' stu-tab-btn--active':''}"
               id="stu-tab-btn-${t.id}" onclick="switchStuEditTab('${t.id}')">${t.label}</button>`
          ).join('')}
        </div>
        <div class="stu-edit-body" id="stu-edit-tab-content">
          <p class="fin-loading">Loading&#8230;</p>
        </div>
        <div class="stu-edit-footer"></div>
      </div>
    </div>
    <div id="stu-transport-modal-root"></div>
  `;

  await _loadStuFormDropdowns();

  let data = {};
  if (isEdit) {
    const res = await apiFetch(`${API_BASE}/students/${_currentEditStudentId}/full-profile`);
    if (res && res.ok) data = await res.json();
    else { const r2 = await apiFetch(`${API_BASE}/students/${_currentEditStudentId}`); if (r2 && r2.ok) data = await r2.json(); }
    // full-profile has no documented response schema (OpenAPI lists it as `{}`) — if it
    // comes back wrapped (e.g. {student: {...}}) instead of flat, every field below would
    // read as undefined and the form would render completely blank. Unwrap defensively.
    if (data && data.first_name == null) {
      const nested = data.student || data.data || data.profile;
      if (nested && typeof nested === 'object') data = { ...data, ...nested };
    }
  }
  // Backend uses academic_level_id/school_class_id/academic_year_id — map them onto
  // the level_id/class_id/academic_year_id names used internally throughout this form.
  if (data.academic_level_id != null && data.level_id == null) data.level_id = data.academic_level_id;
  if (data.school_class_id   != null && data.class_id == null) data.class_id = data.school_class_id;
  window._stuFormData = data;
  _stuEditDirty = false;
  // Tracks which tabs the user actually edited this session, via a single
  // delegated listener on the container (survives re-renders since only its
  // innerHTML is replaced on tab switch, not the container itself). Used by
  // submitStudentForm's allTabs save so Update only resends sub-resources the
  // user actually touched — e.g. editing Transport (which lives on the
  // Personal tab) no longer also resends Guardians/Previous
  // Education/Medical untouched, which matters because some of those
  // sub-resource endpoints are flaky server-side and previously got hit on
  // every single Update regardless of what was actually changed.
  window._stuDirtyTabs = new Set();
  const tabContentEl = document.getElementById('stu-edit-tab-content');
  if (tabContentEl) {
    const markDirty = () => window._stuDirtyTabs.add(_stuEditActiveTab);
    tabContentEl.addEventListener('input', markDirty);
    tabContentEl.addEventListener('change', markDirty);
  }
  _renderStuEditTabContent(_stuEditActiveTab);
  _updateStuFormFooter();
}

async function _loadStuFormDropdowns() {
  // Routes live at /routes/ (confirmed via transport.js, the module that owns this resource) —
  // /transport/routes was a stale path that never matched the backend.
  const [trRes, ecRes] = await Promise.all([
    apiFetch(`${API_BASE}/routes/`),
    apiFetch(`${API_BASE}/student-management/extra-curriculum/`),
  ]);
  _stuFormTransportRoutes = trRes && trRes.ok ? _toArray(await trRes.json()) : [];
  _stuFormExtraCurriculum = ecRes && ecRes.ok ? _toArray(await ecRes.json()) : [];
}

function switchStuEditTab(tabId) {
  _harvestStuActiveTab();
  _stuEditActiveTab = tabId;
  document.querySelectorAll('.stu-tab-btn').forEach(b => {
    b.classList.toggle('stu-tab-btn--active', b.id === `stu-tab-btn-${tabId}`);
  });
  _renderStuEditTabContent(tabId);
  _updateStuFormFooter();
}

function _renderStuEditTabContent(tabId) {
  const c = document.getElementById('stu-edit-tab-content');
  if (!c) return;
  const d = window._stuFormData || {};
  switch (tabId) {
    case 'personal': {
      c.innerHTML = _stuTabPersonal(d);
      _wireStuPersonalTab();
      // In Add mode, prefer a restorable draft's level selection over d.level_id
      // (which is always empty for a brand-new record) — the select's options
      // don't exist yet, so this must be threaded through here rather than set
      // via .value after the fact in the generic draft-restore pass below.
      const draftLevelId = !_currentEditStudentId ? (loadStudentDraft() || {})['se-level'] : null;
      populateAcademicLevelsDropdown('se-level', draftLevelId || d.level_id).then(() => {
        const levelSel = document.getElementById('se-level');
        if (levelSel && levelSel.value) onStuLevelChange(levelSel.value, false);
        if (d.joining_date) _deriveStuTermAndClass();
      });
      break;
    }
    case 'prev-edu':  c.innerHTML = _stuTabPrevEdu(d);     break;
    case 'guardian':  c.innerHTML = _stuTabGuardian(d);    _wireStuGuardianTab(); break;
    case 'medical':   c.innerHTML = _stuTabMedical(d);     break;
    case 'documents': c.innerHTML = _stuTabDocuments(d);   break;
    default: c.innerHTML = '<p style="padding:24px;">Coming soon.</p>';
  }
  c.querySelectorAll('input,select,textarea').forEach(el => {
    el.addEventListener('change', () => { _stuEditDirty = true; });
    el.addEventListener('input',  () => { _stuEditDirty = true; });
  });

  if (!_currentEditStudentId) {
    attachStudentDraftAutoSave(c);
    restoreStudentDraftForTab(c, !window._stuDraftBannerShown);
    window._stuDraftBannerShown = true;
  }
}

function _opts(items, valueKey, labelKey, selectedVal) {
  return items.map(it =>
    `<option value="${_esc(String(it[valueKey]))}"${String(it[valueKey])===String(selectedVal)?' selected':''}>${_esc(it[labelKey])}</option>`
  ).join('');
}

function _stuTabPersonal(d) {
  const natOpts     = ['Kenya','Uganda','Tanzania','Rwanda','Ethiopia','Other'].map(n =>
    `<option${d.nationality===n?' selected':''}>${n}</option>`).join('');
  const relOpts     = ['Christian','Muslim','Hindu','Other'].map(r =>
    `<option${d.religion===r?' selected':''}>${r}</option>`).join('');
  const genderOpts  = ['Male','Female'].map(g =>
    `<option${d.gender===g?' selected':''}>${g}</option>`).join('');

  const ecIds = d.extra_curriculum_ids || (d.extra_curriculum_id ? [d.extra_curriculum_id] : []);
  const ecOpts = _stuFormExtraCurriculum.map(e =>
    `<option value="${_esc(String(e.id))}"${ecIds.includes(e.id)?' selected':''}>${_esc(e.name)}</option>`).join('');

  const hasSibling    = !!d.has_sibling_enrolled;
  const sibDisplay    = hasSibling ? 'block' : 'none';

  const isEdit = !!_currentEditStudentId;
  const admVal  = isEdit ? _esc(d.student_id || '') : 'Loading…';
  const admAttr = 'readonly';

  return `
    <div class="stu-form-grid">
      <!-- Row 1: Student ID | Surname -->
      <div class="stu-form-group">
        <label>Student ID</label>
        <input id="se-student-id" class="fin-search-input" style="width:100%!important"
               value="${admVal}" ${admAttr}>
      </div>
      <div class="stu-form-group">
        <label>Surname <span style="color:#e74c3c">*</span></label>
        <input id="se-surname" class="fin-search-input" style="width:100%!important" value="${_esc(d.last_name||'')}">
        <span class="stu-field-error" id="err-se-surname"></span>
      </div>

      <!-- Row 2: Other Name | Joining Date -->
      <div class="stu-form-group">
        <label>Other Name <span style="color:#e74c3c">*</span></label>
        <input id="se-other-name" class="fin-search-input" style="width:100%!important" value="${_esc(d.first_name||'')}">
        <span class="stu-field-error" id="err-se-other-name"></span>
      </div>
      <div class="stu-form-group">
        <label>Joining Date</label>
        <input id="se-joining-date" type="date" class="fin-search-input" style="width:100%!important" value="${_esc(d.joining_date||'')}">
        <span class="stu-field-error" id="err-se-joining-date"></span>
      </div>

      <!-- Row 3: Gender | Birth Date -->
      <div class="stu-form-group">
        <label>Gender <span style="color:#e74c3c">*</span></label>
        <select id="se-gender" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>${genderOpts}
        </select>
        <span class="stu-field-error" id="err-se-gender"></span>
      </div>
      <div class="stu-form-group">
        <label>Birth Date <span style="color:#e74c3c">*</span></label>
        <input id="se-dob" type="date" class="fin-search-input" style="width:100%!important" value="${_esc(d.date_of_birth||'')}">
        <small id="se-age-display" style="color:#555;font-size:0.82rem;">${calculateAge(d.date_of_birth)}</small>
        <span class="stu-field-error" id="err-se-dob"></span>
      </div>

      <!-- Row 4: Nationality | Religion -->
      <div class="stu-form-group">
        <label>Nationality <span style="color:#e74c3c">*</span></label>
        <select id="se-nationality" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>${natOpts}
        </select>
        <span class="stu-field-error" id="err-se-nationality"></span>
      </div>
      <div class="stu-form-group">
        <label>Religion</label>
        <select id="se-religion" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>${relOpts}
        </select>
      </div>

      <!-- Row 5: Level of Academics | Sports House (side-by-side so Sports House visually
           signals it loads from the selected level — auto-populates on level change) -->
      <div class="stu-form-group">
        <label>Level of Academics <span style="color:#e74c3c">*</span></label>
        <select id="se-level" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                onchange="onStuLevelChange(this.value)">
          <option value="">Please Select</option>
        </select>
        <span class="stu-field-error" id="err-se-level"></span>
        <div id="se-level-age-hint" style="margin-top:3px;font-size:0.81rem;color:#2c7a4b;font-style:italic;"></div>
        <div id="se-class-term-confirm" style="margin-top:4px;font-size:0.82rem;"></div>
      </div>
      <div class="stu-form-group">
        <label>Sports House</label>
        <select id="se-sports-house" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;" onchange="onStuSportsHouseChange(this)">
          <option value="">Please Select</option>
          ${(d.sports_house_id && d.sports_house_name) ? `<option value="${d.sports_house_id}" selected>${_esc(d.sports_house_name)}</option>` : ''}
        </select>
      </div>

      <!-- Row 5b: Student Type -->
      <div class="stu-form-group">
        <label>Student Type</label>
        <select id="se-student-type" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          ${['Full Day','Half Day'].map(t => `<option${(d.student_type||'Full Day')===t?' selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div></div>

      <!-- Row 6: Physical Address (full width) -->
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Physical Address</label>
        <input id="se-physical-address" class="fin-search-input" style="width:100%!important" value="${_esc(d.physical_address||'')}">
      </div>

      <!-- Row 7: Extra Curriculum (full width — multiselect benefits from the wider space) -->
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Extra Curriculum</label>
        <select id="se-extra-curriculum" class="stu-multiselect" multiple>${ecOpts}</select>
      </div>

      <!-- Row 8: Uses School Transport? | Photo -->
      <div class="stu-form-group">
        <label class="stu-checkbox-row"><input type="checkbox" id="se-uses-transport"${d.uses_school_transport?' checked':''} onchange="onStuUsesTransportChange()"> Uses School Transport?</label>
        <div id="se-transport-summary-wrap"></div>
        <span class="stu-field-error" id="err-se-transport"></span>
      </div>
      <div class="stu-form-group">
        <label>Photo</label>
        <div style="display:flex;align-items:center;gap:14px;">
          <div id="se-photo-preview" style="width:72px;height:72px;border-radius:50%;background:#e8ecef;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:1.8rem;color:#aaa;flex-shrink:0;">
            ${d.photo_url ? `<img src="${_esc(d.photo_url)}" style="width:100%;height:100%;object-fit:cover;">` : '&#128100;'}
          </div>
          <input type="file" id="se-photo" accept="image/*" style="font-size:0.85rem;" onchange="handleStuPhotoPreview(this)">
        </div>
      </div>

      <!-- Row 9: Meal Program | Photo Consent -->
      <div class="stu-form-group">
        <label style="font-size:0.85rem;font-weight:500;color:#333;">Mapped to Meal Program?</label>
        <div style="display:flex;gap:20px;margin-top:6px;">
          <label class="stu-checkbox-row"><input type="radio" id="se-meal-yes" name="se-meal" value="yes"${d.mapped_to_meal_program?' checked':''}> Yes</label>
          <label class="stu-checkbox-row"><input type="radio" id="se-meal-no" name="se-meal" value="no"${!d.mapped_to_meal_program?' checked':''}> No</label>
        </div>
      </div>
      <div class="stu-form-group" style="justify-content:center;">
        <label class="stu-checkbox-row" style="margin-top:auto;">
          <input type="checkbox" id="se-photo-consent"${d.parent_consents_photo?' checked':''}> Parent Consents to Use of Student Photo?
        </label>
      </div>

      <!-- Row 10: Sibling Enrolment -->
      <div class="stu-form-group" style="grid-column:span 2;">
        <label class="stu-checkbox-row"><input type="checkbox" id="se-has-sibling"${hasSibling?' checked':''} onchange="toggleSiblingSection()"> Has Sibling Enrolled?</label>
        <div id="se-sibling-section" style="display:${sibDisplay};margin-top:10px;padding:14px;background:#f9fafb;border-radius:6px;border:1px solid #e0e0e0;">
          <div id="se-sibling-list" class="trn-stops-list"></div>
          <div style="position:relative;max-width:420px;margin-top:8px;">
            <input id="se-sibling-search" class="fin-search-input" style="width:100%!important" placeholder="Search sibling by name or SOIS ID&#8230;"
                   oninput="stuSibPickSearch(this.value)" autocomplete="off">
            <div id="se-sibling-search-dd" class="fin-action-dropdown" style="display:none;max-height:200px;overflow-y:auto;position:absolute;top:100%;left:0;width:100%;z-index:100;"></div>
          </div>
          <small style="color:#888;font-size:0.78rem;display:block;margin-top:4px;">A sibling group can have at most 3 students in total.</small>
          <p class="stu-sibling-note">Sibling discount will be applied automatically based on age order.</p>
          <p id="se-sibling-discount-preview" class="stu-sibling-preview" hidden></p>
        </div>
      </div>

      <!-- Row 11: Notes -->
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Notes</label>
        <textarea id="se-notes" style="width:100%;min-height:80px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:0.88rem;">${_esc(d.notes||'')}</textarea>
      </div>
    </div>
  `;
}

// Age in whole months between a birth date and a reference date (defaults to
// today). Matches the year/month-borrow math calculateAge() uses for its
// display string, just returned as a single month count for range checks.
function _ageInMonthsAt(birthDateStr, atDateStr) {
  const birth = new Date(birthDateStr);
  const at    = atDateStr ? new Date(atDateStr) : new Date();
  let months  = (at.getFullYear() - birth.getFullYear()) * 12 + (at.getMonth() - birth.getMonth());
  if (at.getDate() < birth.getDate()) months--;
  return months;
}
function _fmtAgeMonths(totalMonths) {
  return `${Math.floor(totalMonths / 12)}y ${totalMonths % 12}m`;
}

// Suggests a Level of Academics per the strict Acorns/Willows/Maples/Oaks age
// windows in ACADEMIC_LEVEL_RULES (config.js), based on age at Joining Date
// (placement is about which class the student starts in, not their age
// today) — falls back to today if no Joining Date has been entered yet.
// Also flags when the student will already be too old for the appropriate
// class by the next academic year (~12 months on), so registrars catch a
// leaver/progression edge case at enrolment time instead of a year later.
function _suggestLevelFromAge(dobValue) {
  if (!dobValue) return;
  const levelSel = document.getElementById('se-level');
  const hintEl   = document.getElementById('se-level-age-hint');
  if (!levelSel) return;
  // Only suggest if user hasn't already picked a level
  if (levelSel.value) { if (hintEl) hintEl.textContent = ''; return; }

  const joiningVal = document.getElementById('se-joining-date')?.value || null;
  const ageMonths  = _ageInMonthsAt(dobValue, joiningVal);

  const idx  = ACADEMIC_LEVEL_RULES.findIndex(r => ageMonths >= r.minMonths && ageMonths <= r.maxMonths);
  const rule = idx === -1 ? null : ACADEMIC_LEVEL_RULES[idx];
  const opt  = rule && Array.from(levelSel.options).find(o => o.dataset.levelKey === rule.key);

  if (!opt) {
    hintEl && (hintEl.textContent =
      `Age ${_fmtAgeMonths(ageMonths)}${joiningVal ? ' at joining' : ''} doesn't strictly match any level's age range; please select manually.`);
    return;
  }

  levelSel.value = opt.value;
  levelSel.dispatchEvent(new Event('change'));

  let msg = `Suggested based on age ${_fmtAgeMonths(ageMonths)}${joiningVal ? ' at joining' : ' (today — no joining date set yet)'}: ${opt.textContent}. You may change this.`;

  const nextYearMonths = ageMonths + 12;
  if (nextYearMonths > rule.maxMonths) {
    const nextRule = ACADEMIC_LEVEL_RULES[idx + 1];
    if (!nextRule) {
      msg += ` Note: this student will be too old for Oaks by next academic year (age will be ~${_fmtAgeMonths(nextYearMonths)}) — confirm progression plan.`;
    } else if (!(nextYearMonths >= nextRule.minMonths && nextYearMonths <= nextRule.maxMonths)) {
      msg += ` Note: by next academic year (age ~${_fmtAgeMonths(nextYearMonths)}) this student won't cleanly fit ${nextRule.label.split('(')[0]} either — please verify next year's placement.`;
    }
  }
  if (hintEl) hintEl.textContent = msg;
}

function _wireStuPersonalTab() {
  const dob = document.getElementById('se-dob');
  if (dob) {
    dob.addEventListener('change', () => {
      const ageEl = document.getElementById('se-age-display');
      if (ageEl) ageEl.textContent = calculateAge(dob.value);
      updateSiblingDiscountPreview();
      _suggestLevelFromAge(dob.value);
    });
  }
  updateSiblingDiscountPreview();
  const joiningDate = document.getElementById('se-joining-date');
  if (joiningDate) {
    joiningDate.addEventListener('change', async () => {
      if (joiningDate.value) {
        await _deriveStuTermAndClass();
        if (dob?.value) _suggestLevelFromAge(dob.value);
      } else {
        const fd = window._stuFormData || {};
        fd.term_id = null; fd.class_id = null; fd.academic_year_id = null;
        fd._derived_term_name = null; fd._derived_class_name = null;
        fd._derivation_error = null;
        const confirmEl = document.getElementById('se-class-term-confirm');
        if (confirmEl) confirmEl.innerHTML = '';
        const joiningErrEl = document.getElementById('err-se-joining-date');
        if (joiningErrEl) joiningErrEl.textContent = '';
      }
    });
  }
  const levelSel = document.getElementById('se-level');
  if (levelSel && levelSel.value) onStuLevelChange(levelSel.value, false);

  const isAdd = !_currentEditStudentId;
  if (isAdd) fetchNextStudentId();

  _renderStuTransportSummary();
  _initStuSiblingPicks(window._stuFormData || {});
}

async function fetchNextStudentId() {
  const idInput = document.getElementById('se-student-id');
  if (!idInput) return;
  try {
    const res = await apiFetch(`${API_BASE}/students/next-id`);
    if (res && res.ok) {
      const data = await res.json();
      idInput.value = data.next_id || data.id || '';
    } else {
      idInput.value = '';
      idInput.placeholder = 'Auto-generated';
    }
  } catch (_) {
    idInput.value = '';
    idInput.placeholder = 'Auto-generated';
  }
}

// Resolves the academic year and specific term that contains joiningDateStr.
// Returns { term, year } or null if no match found.
async function _resolveTermAndYearForDate(joiningDateStr) {
  if (!joiningDateStr) return null;
  try {
    const yearRes = await apiFetch(`${API_BASE}/academic-years/?date=${encodeURIComponent(joiningDateStr)}`);
    if (!yearRes || !yearRes.ok) return null;
    const years = await yearRes.json();
    const year = Array.isArray(years) ? years[0] : years;
    if (!year || !year.id) return null;

    // /terms (no trailing slash) is a different, unfiltered endpoint ("Cohort Term
    // Planner" flat list) that ignores academic_year_id entirely — /terms/ is the
    // one that actually filters by year.
    const termRes = await apiFetch(`${API_BASE}/terms/?academic_year_id=${year.id}`);
    if (!termRes || !termRes.ok) return null;
    const raw = await termRes.json();
    const termList = Array.isArray(raw) ? raw : (raw.data || raw.results || []);

    const d = new Date(joiningDateStr);
    const term = termList.find(t => t.start_date && t.end_date &&
      new Date(t.start_date) <= d && d <= new Date(t.end_date));
    return term ? { term, year } : null;
  } catch (_) { return null; }
}

// Auto-derives term_id and class_id from the current Joining Date + Level of Academics
// selection, stores them in window._stuFormData, and updates the confirmation line.
async function _deriveStuTermAndClass() {
  const d = window._stuFormData || (window._stuFormData = {});
  const joiningDate = _fv('se-joining-date');
  const levelId     = _fv('se-level');
  const confirmEl   = document.getElementById('se-class-term-confirm');
  const joiningErrEl = document.getElementById('err-se-joining-date');
  const levelErrEl  = document.getElementById('err-se-level');

  const priorClassId = d.class_id;
  d.term_id = null; d.class_id = null; d.academic_year_id = null;
  d._derived_term_name = null; d._derived_class_name = null; d._derivation_error = null;

  if (confirmEl) confirmEl.innerHTML = '';
  if (joiningErrEl) joiningErrEl.textContent = '';

  if (!joiningDate) return;

  if (confirmEl) confirmEl.innerHTML = '<span style="color:#888;font-size:0.82rem;">Resolving term&#8230;</span>';

  const resolved = await _resolveTermAndYearForDate(joiningDate);
  if (!resolved) {
    if (joiningErrEl) joiningErrEl.textContent = 'This joining date does not fall within any configured academic term. Please choose a different date or contact an administrator to set up the relevant term.';
    if (confirmEl) confirmEl.innerHTML = '';
    d._derivation_error = 'no_term';
    return;
  }

  const { term, year } = resolved;
  d.term_id = term.id;
  d.academic_year_id = year.id;
  d._derived_term_name = term.name || term.title || '';
  d._derived_year_name = year.title || year.name || '';

  if (!levelId) {
    if (confirmEl) confirmEl.innerHTML = '<span style="color:#888;font-size:0.82rem;">Select Level of Academics to auto-assign class.</span>';
    return;
  }

  if (confirmEl) confirmEl.innerHTML = '<span style="color:#888;font-size:0.82rem;">Finding class&#8230;</span>';

  try {
    // Real query param is level_id, not academic_level_id — passing the wrong name
    // meant this silently returned every class in the academic year regardless of
    // level, so a school with only one class so far would get every student
    // (at any level) wrongly auto-assigned to it, and any school with several
    // classes always hit the "multiple classes found" manual-pick branch even when
    // only one class actually matched the selected level.
    const res = await apiFetch(`${API_BASE}/classes/?level_id=${levelId}&academic_year_id=${year.id}`);
    if (!res || !res.ok) throw new Error('api');
    const raw = await res.json();
    const classes = Array.isArray(raw) ? raw : (raw.data || raw.results || raw.items || []);

    if (classes.length === 0) {
      const levelEl = document.getElementById('se-level');
      const levelName = levelEl?.options[levelEl.selectedIndex]?.text || `Level ${levelId}`;
      if (levelErrEl) levelErrEl.textContent = `No class has been set up yet for ${levelName} in the ${year.title || year.name} academic year. Please contact an administrator to create this class before enrolling this student.`;
      if (confirmEl) confirmEl.innerHTML = '';
      d._derivation_error = 'no_class';
      return;
    }
    if (classes.length > 1) {
      // Several streams/classes exist for this level+year (e.g. "Grade 1 A" / "Grade 1 B") —
      // auto-pick is ambiguous, so let the user choose instead of dead-ending here.
      const stillValid = classes.find(c => String(c.id) === String(priorClassId));
      d.class_id = stillValid ? stillValid.id : null;
      d._derivation_error = d.class_id ? null : 'multi_class';
      if (levelErrEl) levelErrEl.textContent = '';
      if (confirmEl) confirmEl.innerHTML =
        `<label style="display:block;color:#888;font-size:0.82rem;margin-bottom:2px;">Multiple classes found for this level/year — please select one:</label>
         <select id="se-class-manual" class="fin-search-input" style="width:100%!important;padding:5px 8px!important;" onchange="onStuManualClassChange(this.value)">
           <option value="">Please Select</option>
           ${classes.map(c => `<option value="${c.id}"${String(priorClassId)===String(c.id)?' selected':''}>${_esc(c.name||'')}</option>`).join('')}
         </select>`;
      return;
    }

    const cls = classes[0];
    d.class_id = cls.id;
    d._derived_class_name = cls.name || '';
    d._derivation_error = null;
    if (levelErrEl) levelErrEl.textContent = '';
    if (confirmEl) confirmEl.innerHTML =
      `<span style="color:#27ae60;font-size:0.85rem;">&#10003; Will be enrolled in: <strong>${_esc(d._derived_class_name)}</strong> for <strong>${_esc(d._derived_term_name)}</strong></span>`;

  } catch (_) {
    if (confirmEl) confirmEl.innerHTML = '<span style="color:#c0392b;font-size:0.82rem;">Could not resolve class. Please try again.</span>';
    d._derivation_error = 'error';
  }
}

function onStuManualClassChange(classId) {
  const d = window._stuFormData || (window._stuFormData = {});
  const sel = document.getElementById('se-class-manual');
  const opt = sel ? sel.options[sel.selectedIndex] : null;
  d.class_id = classId ? Number(classId) : null;
  d._derived_class_name = opt && classId ? opt.textContent : null;
  d._derivation_error = classId ? null : 'multi_class';
}

async function onStuLevelChange(levelId, clearHouse = true) {
  // If the user manually picks a level, clear the DOB suggestion hint
  const hintEl = document.getElementById('se-level-age-hint');
  if (hintEl && clearHouse) hintEl.textContent = '';
  const houseSelect = document.getElementById('se-sports-house');
  if (!houseSelect) return;

  houseSelect.innerHTML = '<option value="">Loading&#8230;</option>';
  if (!levelId) { houseSelect.innerHTML = '<option value="">Please Select</option>'; return; }

  const d = window._stuFormData || {};
  const currentHouseId = clearHouse ? '' : (d.sports_house_id || '');

  try {
    const res = await apiFetch(`${API_BASE}/academics/levels/${levelId}/sports-houses`);
    if (res && res.ok) {
      const houses = await res.json();
      houseSelect.innerHTML = `<option value="">Please Select</option>` +
        houses.map(h =>
          `<option value="${h.id}"${String(h.id)===String(currentHouseId)?' selected':''}>${_esc(h.name)}</option>`
        ).join('');
      // Auto-select when exactly one house is associated with this level (unambiguous assignment)
      if (houses.length === 1 && !currentHouseId) {
        houseSelect.value = String(houses[0].id);
      }
      d.sports_house_id   = houseSelect.value ? Number(houseSelect.value) : null;
      d.sports_house_name = houseSelect.value ? houseSelect.options[houseSelect.selectedIndex].textContent : null;
    } else {
      houseSelect.innerHTML = '<option value="">No houses found</option>';
    }
  } catch (_) { houseSelect.innerHTML = '<option value="">Error loading</option>'; }

  // Re-derive class whenever the level changes (non-blocking)
  _deriveStuTermAndClass();
}

function onStuSportsHouseChange(sel) {
  const d = window._stuFormData || (window._stuFormData = {});
  d.sports_house_id   = sel.value ? Number(sel.value) : null;
  d.sports_house_name = sel.value ? sel.options[sel.selectedIndex].textContent : null;
}

function toggleSiblingSection() {
  const chk = document.getElementById('se-has-sibling');
  const sec = document.getElementById('se-sibling-section');
  if (sec) sec.style.display = chk?.checked ? 'block' : 'none';
  updateSiblingDiscountPreview();
}

// ── Sibling Enrolment — wired to the real Sibling Groups resource ────────────
// A group holds up to 3 students total. window._stuSiblingExisting are members
// already persisted on d.sibling_group_id (resolved on tab load); _stuSiblingNewPicks
// are picks made in this session, only sent to the backend on save (see
// _stuSyncSiblingGroup) since creating/joining a group requires this student's
// own numeric id, which doesn't exist yet in Add mode until the record is saved.
window._stuSiblingExisting  = window._stuSiblingExisting  || [];
window._stuSiblingNewPicks  = window._stuSiblingNewPicks  || [];

async function _initStuSiblingPicks(d) {
  window._stuSiblingNewPicks = [];
  window._stuSiblingExisting = [];
  if (!d.sibling_group_id) { _renderStuSiblingList(); return; }
  const res = await apiFetch(`${API_BASE}/receivables/sibling-groups/${d.sibling_group_id}`);
  const group = (res && res.ok) ? await res.json().catch(() => null) : null;
  const otherIds = (group?.student_ids || []).filter(id => String(id) !== String(d.id));
  window._stuSiblingExisting = (await Promise.all(otherIds.map(async id => {
    const r = await apiFetch(`${API_BASE}/students/${id}`);
    if (!r || !r.ok) return null;
    const s = await r.json().catch(() => null);
    if (!s) return null;
    return { id: s.id, student_id: s.student_id, name: `${s.first_name||''} ${s.last_name||''}`.trim(), date_of_birth: s.date_of_birth };
  }))).filter(Boolean);
  _renderStuSiblingList();
}

function _stuSiblingTotalCount() {
  return window._stuSiblingExisting.length + window._stuSiblingNewPicks.length;
}

function _renderStuSiblingList() {
  const list = document.getElementById('se-sibling-list');
  if (!list) return;
  const rows = [
    ...window._stuSiblingExisting.map(p => ({ ...p, removable: false })),
    ...window._stuSiblingNewPicks.map((p, i) => ({ ...p, removable: true, idx: i })),
  ];
  list.innerHTML = rows.length ? rows.map(p => `
    <div class="trn-stop-row">
      <input type="text" class="fin-search-input trn-stop-input" value="${_esc(p.name)} — ${_esc(p.student_id||'')}" disabled>
      ${p.removable
        ? `<button type="button" class="trn-stop-remove" onclick="stuSibRemovePick(${p.idx})" title="Remove">&#x2715;</button>`
        : `<span style="color:#888;font-size:0.78rem;padding:0 8px;white-space:nowrap;">already linked</span>`}
    </div>
  `).join('') : '<p style="color:#888;font-size:0.85rem;">No siblings added yet.</p>';

  const searchInput = document.getElementById('se-sibling-search');
  const full = _stuSiblingTotalCount() >= 2; // +1 for this student = group max of 3
  if (searchInput) {
    searchInput.disabled = full;
    searchInput.placeholder = full ? 'Sibling group is full (max 3 students)' : 'Search sibling by name or SOIS ID…';
  }
}

let _stuSibSearchTimer = null;
function stuSibPickSearch(val) {
  clearTimeout(_stuSibSearchTimer);
  const dd = document.getElementById('se-sibling-search-dd');
  if (!dd) return;
  if (!val.trim()) { dd.style.display = 'none'; return; }
  // Debounced (matches saOnNameSearch's pattern) — firing a fetch on every
  // keystroke let slower earlier-letter responses arrive after faster later
  // ones and clobber the dropdown with stale, broader results, which looked
  // like "the search only shows results for the first letter typed."
  _stuSibSearchTimer = setTimeout(async () => {
    const res = await apiFetch(`${API_BASE}/students/?search=${encodeURIComponent(val.trim())}`);
    const list = (res && res.ok) ? _toArray(await res.json().catch(() => [])) : [];
    const taken = new Set([
      String(_currentEditStudentId || ''),
      ...window._stuSiblingExisting.map(p => String(p.id)),
      ...window._stuSiblingNewPicks.map(p => String(p.id)),
    ]);
    const filtered = list.filter(s => !taken.has(String(s.id)));
    dd.innerHTML = filtered.length ? filtered.slice(0, 10).map(s => {
      const name = `${s.first_name||''} ${s.last_name||''}`.trim();
      const idLabel = _finEsc(s.student_id||'');
      return `<a href="#" class="fin-search-option" onclick="stuSibPickSelect(${s.id},'${idLabel}','${_finEsc(name)}','${_finEsc(s.date_of_birth||'')}',${s.sibling_group_id ?? 'null'});return false;">
         <span class="fin-search-option-name">${_finEsc(name)}</span>
         <span class="fin-search-option-sub">${idLabel}${s.sibling_group_id ? ' · already in a sibling group' : ''}</span>
       </a>`;
    }).join('') : '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
    dd.style.display = 'block';
  }, 300);
}

async function stuSibPickSelect(id, studentId, name, dateOfBirth, siblingGroupId) {
  if (_stuSiblingTotalCount() >= 2) { showToast('A sibling group can have at most 3 students.', 'error'); return; }
  // /students/?search= (where this pick came from) never carries
  // sibling_group_id — it's not on StudentRead, which FastAPI's response_model
  // strictly filters to. full-profile has no declared schema (raw dict), so
  // it's the only endpoint with a chance of actually carrying the field.
  // Otherwise picking an already-grouped sibling would silently try to create
  // a brand-new group and 409 against the backend's one-group-per-student rule.
  let groupId = siblingGroupId || null;
  if (!groupId) {
    const res = await apiFetch(`${API_BASE}/students/${id}/full-profile`);
    const stu = (res && res.ok) ? await res.json().catch(() => null) : null;
    groupId = stu?.sibling_group_id || null;
  }
  window._stuSiblingNewPicks.push({ id, student_id: studentId, name, date_of_birth: dateOfBirth || null, sibling_group_id: groupId });
  const input = document.getElementById('se-sibling-search');
  if (input) input.value = '';
  const dd = document.getElementById('se-sibling-search-dd');
  if (dd) dd.style.display = 'none';
  _stuEditDirty = true;
  _renderStuSiblingList();
  updateSiblingDiscountPreview();
}

function stuSibRemovePick(idx) {
  window._stuSiblingNewPicks.splice(idx, 1);
  _stuEditDirty = true;
  _renderStuSiblingList();
  updateSiblingDiscountPreview();
}

// Informational only — does not affect the submitted payload. Compares the
// current student's date_of_birth against the first sibling's to show which tier
// (and configured %) they'll likely fall under. The backend computes the
// definitive tier (incl. 3rd/4th child) across the whole sibling group when
// invoices are generated.
async function updateSiblingDiscountPreview() {
  const dobField   = document.getElementById('se-dob');
  const previewEl  = document.getElementById('se-sibling-discount-preview');
  if (!previewEl) return;

  const sibling    = window._stuSiblingExisting[0] || window._stuSiblingNewPicks[0];
  const currentDob = dobField ? dobField.value : '';

  if (!sibling || !sibling.date_of_birth || !currentDob) {
    previewEl.hidden = true;
    return;
  }

  const discountSettings = await fetchDiscountSettings();

  const currentDate = new Date(currentDob);
  const siblingDate = new Date(sibling.date_of_birth);

  let tier, pct;
  if (currentDate < siblingDate) {
    tier = 'First Child';
    pct  = discountSettings ? discountSettings.first_child_percentage : null;
  } else {
    tier = 'Second Child';
    pct  = discountSettings ? discountSettings.second_child_percentage : null;
  }

  const pctText = (pct !== null && pct !== undefined)
    ? `and will receive a <strong>${pct}%</strong> tuition discount`
    : '(discount percentage not yet configured in Discount Setup)';

  previewEl.innerHTML = `Based on birth dates, this student will be treated as the <strong>${tier}</strong> ${pctText}.`;
  previewEl.hidden = false;
}

// File inputs live on different tabs that get torn down on tab switch, so the selected
// File objects are cached here (rather than re-queried from the DOM at save time).
window._stuFormFiles = window._stuFormFiles || {};
function _cacheStuFile(id, input) {
  if (input.files && input.files[0]) window._stuFormFiles[id] = input.files[0];
  else delete window._stuFormFiles[id];
}

function handleStuPhotoPreview(input) {
  if (!input.files[0]) return;
  _cacheStuFile('se-photo', input);
  const preview = document.getElementById('se-photo-preview');
  if (!preview) return;
  const url = URL.createObjectURL(input.files[0]);
  const img = document.createElement('img');
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
  img.onload = () => URL.revokeObjectURL(url);
  img.src = url;
  preview.innerHTML = '';
  preview.appendChild(img);
}

// ── Transport selection cascade (Route -> Journey Type -> Time of Day) ────────
// Modals reuse the shared .hr-modal-overlay/.hr-modal component (css/hr.css,
// loaded globally) rather than introducing a new modal pattern.

function _findTransportRoute(routeId) {
  return _stuFormTransportRoutes.find(r => String(r.id) === String(routeId)) || null;
}

// Pricing lives as flat fields on Route (two_way_price, one_way_morning_price,
// one_way_evening_price, daily_rate) — no sub-resource fetch needed.
function _resolveTransportPrice(route, journeyType, timeOfDay) {
  if (!route) return null;
  let price = null;
  if (journeyType === 'two_way') price = route.two_way_price;
  else if (journeyType === 'one_way' && timeOfDay === 'morning') price = route.one_way_morning_price;
  else if (journeyType === 'one_way' && timeOfDay === 'evening') price = route.one_way_evening_price;
  if (price === null || price === undefined || price === '') return null;
  const n = parseFloat(price);
  return isNaN(n) ? null : n;
}

// Adapts the flat-fields lookup above to StudentRouteRead's `direction`/
// `use_daily_rate` shape (two_way | one_way_morning | one_way_evening),
// used by the Transport tab on the student profile.
function _resolveTransportPriceForDirection(route, direction, useDailyRate) {
  if (!route) return null;
  if (useDailyRate) {
    const n = parseFloat(route.daily_rate);
    return isNaN(n) ? null : n;
  }
  if (direction === 'two_way') return _resolveTransportPrice(route, 'two_way');
  if (direction === 'one_way_morning') return _resolveTransportPrice(route, 'one_way', 'morning');
  if (direction === 'one_way_evening') return _resolveTransportPrice(route, 'one_way', 'evening');
  return null;
}

function onStuUsesTransportChange() {
  const chk = document.getElementById('se-uses-transport');
  if (chk && chk.checked) {
    openTransportRouteModal(true);
  } else {
    _clearTransportSelection();
  }
}

function _clearTransportSelection() {
  const d = window._stuFormData || {};
  d.uses_school_transport = false;
  d.transport_selection   = null;
  const chk = document.getElementById('se-uses-transport');
  if (chk) chk.checked = false;
  const errEl = document.getElementById('err-se-transport');
  if (errEl) errEl.textContent = '';
  _renderStuTransportSummary();
}

function closeTransportCascadeModal() {
  const root = document.getElementById('stu-transport-modal-root');
  if (root) root.innerHTML = '';
  document.removeEventListener('keydown', _stuTransportCascadeEscHandler);
}

function _stuTransportCascadeEscHandler(e) {
  if (e.key === 'Escape') cancelTransportCascade();
}

function cancelTransportCascade() {
  closeTransportCascadeModal();
  _clearTransportSelection();
}

function _mountTransportCascadeModal(html) {
  const root = document.getElementById('stu-transport-modal-root');
  if (root) root.innerHTML = html;
  document.removeEventListener('keydown', _stuTransportCascadeEscHandler);
  document.addEventListener('keydown', _stuTransportCascadeEscHandler);
}

function openTransportRouteModal(initDraft) {
  if (initDraft) {
    const d = window._stuFormData || {};
    const existing = d.transport_selection || (d.transport_route_id ? { route_id: d.transport_route_id, journey_type: null, time_of_day: null } : null);
    _stuTransportCascade = {
      routeId:     existing ? existing.route_id : null,
      journeyType: existing ? existing.journey_type : null,
      timeOfDay:   existing ? existing.time_of_day : null,
    };
  }
  const routes = _stuFormTransportRoutes || [];
  const noRoutes = routes.length === 0;
  const bodyHtml = noRoutes
    ? `<p class="stu-transport-modal-msg">No transport routes have been configured yet. Please contact an administrator.</p>`
    : `<div class="hr-modal-field">
        <label class="hr-form-label">Route <span class="hr-required">*</span></label>
        <select id="stu-trm-route" class="hr-modal-select" onchange="onStuTrmRouteChange()">
          <option value="">Please Select</option>
          ${routes.map(r => `<option value="${_esc(String(r.id))}"${String(r.id)===String(_stuTransportCascade.routeId)?' selected':''}>${_esc(r.name||r.title||'')}</option>`).join('')}
        </select>
      </div>`;

  _mountTransportCascadeModal(`
    <div id="stu-trm-overlay" class="hr-modal-overlay" onclick="if(event.target===this)cancelTransportCascade()">
      <div class="hr-modal" role="dialog" aria-modal="true" aria-labelledby="stu-trm-title">
        <h3 class="hr-modal-title" id="stu-trm-title">Select Transport Route</h3>
        <div class="hr-modal-body">${bodyHtml}</div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="cancelTransportCascade()">Cancel</button>
          ${noRoutes ? '' : `<button class="hr-modal-btn-submit" id="stu-trm-next-btn" ${_stuTransportCascade.routeId ? '' : 'disabled'} onclick="goToJourneyTypeModal()">Next</button>`}
        </div>
      </div>
    </div>
  `);
}

function onStuTrmRouteChange() {
  const sel = document.getElementById('stu-trm-route');
  _stuTransportCascade.routeId = sel?.value || null;
  const btn = document.getElementById('stu-trm-next-btn');
  if (btn) btn.disabled = !_stuTransportCascade.routeId;
}

function goToJourneyTypeModal() {
  const route     = _findTransportRoute(_stuTransportCascade.routeId);
  const routeName = route ? (route.name || route.title || '') : '';
  _mountTransportCascadeModal(`
    <div id="stu-trm-overlay" class="hr-modal-overlay" onclick="if(event.target===this)cancelTransportCascade()">
      <div class="hr-modal" role="dialog" aria-modal="true" aria-labelledby="stu-trm-title">
        <h3 class="hr-modal-title" id="stu-trm-title">Two-way or One-way?</h3>
        <p class="stu-transport-modal-subtitle">Route: ${_esc(routeName)}</p>
        <div class="hr-modal-body">
          <div role="radiogroup" aria-label="Journey type" style="display:flex;gap:16px;">
            <label><input type="radio" name="stu-trm-journey" value="two_way" onchange="onStuTrmJourneyChange()"${_stuTransportCascade.journeyType==='two_way'?' checked':''}> Two-way</label>
            <label><input type="radio" name="stu-trm-journey" value="one_way" onchange="onStuTrmJourneyChange()"${_stuTransportCascade.journeyType==='one_way'?' checked':''}> One-way</label>
          </div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="cancelTransportCascade()">Cancel</button>
          <button class="hr-modal-btn-close" onclick="openTransportRouteModal(false)">Back</button>
          <button class="hr-modal-btn-submit" id="stu-trm-journey-next-btn" ${_stuTransportCascade.journeyType ? '' : 'disabled'} onclick="onStuTrmJourneyNext()">Next</button>
        </div>
      </div>
    </div>
  `);
}

function onStuTrmJourneyChange() {
  const val = document.querySelector('input[name="stu-trm-journey"]:checked')?.value || null;
  _stuTransportCascade.journeyType = val;
  if (val === 'two_way') _stuTransportCascade.timeOfDay = null;
  const btn = document.getElementById('stu-trm-journey-next-btn');
  if (btn) btn.disabled = !val;
}

function onStuTrmJourneyNext() {
  if (_stuTransportCascade.journeyType === 'two_way') {
    finishTransportCascade();
  } else {
    goToTimeOfDayModal();
  }
}

function goToTimeOfDayModal() {
  const route     = _findTransportRoute(_stuTransportCascade.routeId);
  const routeName = route ? (route.name || route.title || '') : '';
  _mountTransportCascadeModal(`
    <div id="stu-trm-overlay" class="hr-modal-overlay" onclick="if(event.target===this)cancelTransportCascade()">
      <div class="hr-modal" role="dialog" aria-modal="true" aria-labelledby="stu-trm-title">
        <h3 class="hr-modal-title" id="stu-trm-title">Morning or Evening?</h3>
        <p class="stu-transport-modal-subtitle">Route: ${_esc(routeName)} — One-way</p>
        <div class="hr-modal-body">
          <div role="radiogroup" aria-label="Time of day" style="display:flex;gap:16px;">
            <label><input type="radio" name="stu-trm-tod" value="morning" onchange="onStuTrmTodChange()"${_stuTransportCascade.timeOfDay==='morning'?' checked':''}> AM (Morning)</label>
            <label><input type="radio" name="stu-trm-tod" value="evening" onchange="onStuTrmTodChange()"${_stuTransportCascade.timeOfDay==='evening'?' checked':''}> PM (Evening)</label>
          </div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="cancelTransportCascade()">Cancel</button>
          <button class="hr-modal-btn-close" onclick="goToJourneyTypeModal()">Back</button>
          <button class="hr-modal-btn-submit" id="stu-trm-finish-btn" ${_stuTransportCascade.timeOfDay ? '' : 'disabled'} onclick="finishTransportCascade()">Finish</button>
        </div>
      </div>
    </div>
  `);
}

function onStuTrmTodChange() {
  const val = document.querySelector('input[name="stu-trm-tod"]:checked')?.value || null;
  _stuTransportCascade.timeOfDay = val;
  const btn = document.getElementById('stu-trm-finish-btn');
  if (btn) btn.disabled = !val;
}

function finishTransportCascade() {
  const route = _findTransportRoute(_stuTransportCascade.routeId);
  const price = _resolveTransportPrice(route, _stuTransportCascade.journeyType, _stuTransportCascade.timeOfDay);
  if (price === null || price === undefined || Number.isNaN(price)) {
    showToast('Pricing not available for this option. Please select a different option or contact the transport office.', 'error');
    cancelTransportCascade();
    return;
  }
  const d = window._stuFormData || {};
  d.uses_school_transport = true;
  d.transport_selection = {
    route_id:     _stuTransportCascade.routeId,
    journey_type: _stuTransportCascade.journeyType,
    time_of_day:  _stuTransportCascade.timeOfDay,
  };
  const chk = document.getElementById('se-uses-transport');
  if (chk) chk.checked = true;
  const errEl = document.getElementById('err-se-transport');
  if (errEl) errEl.textContent = '';
  closeTransportCascadeModal();
  _renderStuTransportSummary();
  _stuEditDirty = true;
}

function _renderStuTransportSummary() {
  const wrap = document.getElementById('se-transport-summary-wrap');
  if (!wrap) return;
  const d = window._stuFormData || {};

  if (!d.uses_school_transport) { wrap.innerHTML = ''; return; }

  const sel = d.transport_selection;

  // Legacy record: flat transport_route_id but no structured selection yet.
  if (!sel && d.transport_route_id) {
    const route     = _findTransportRoute(d.transport_route_id);
    const routeName = route ? (route.name || route.title || '') : `Route #${d.transport_route_id}`;
    wrap.innerHTML = `<div class="stu-transport-summary stu-transport-summary--warn">
      Selected: ${_esc(routeName)} — journey type not specified (please update)
      <a href="#" onclick="openTransportRouteModal(true);return false;">Change</a>
    </div>`;
    return;
  }

  if (!sel) { wrap.innerHTML = ''; return; }

  const route     = _findTransportRoute(sel.route_id);
  const routeName = route ? (route.name || route.title || '') : `Route #${sel.route_id}`;
  let desc;
  if (sel.journey_type === 'two_way') desc = 'Two-way';
  else if (sel.journey_type === 'one_way') desc = `One-way (${sel.time_of_day === 'morning' ? 'Morning' : sel.time_of_day === 'evening' ? 'Evening' : '—'})`;
  else desc = 'journey type not specified';

  const price = _resolveTransportPrice(route, sel.journey_type, sel.time_of_day);
  const priceText = (price !== null && price !== undefined && !Number.isNaN(price))
    ? ` — KES ${Number(price).toLocaleString()}/term`
    : ' — pricing not available for this option';

  wrap.innerHTML = `<div class="stu-transport-summary">
    Selected: ${_esc(routeName)} — ${desc}${priceText}
    <a href="#" onclick="openTransportRouteModal(true);return false;">Change</a>
  </div>`;
}

function _stuValidateTransport() {
  const d = window._stuFormData || {};
  const errEl = document.getElementById('err-se-transport');
  if (!d.uses_school_transport) { if (errEl) errEl.textContent = ''; return true; }
  const sel = d.transport_selection;
  const ok = !!(sel && sel.route_id && sel.journey_type && (sel.journey_type !== 'one_way' || sel.time_of_day));
  if (errEl) errEl.textContent = ok ? '' : 'Please complete the transport selection (route, journey type, and time of day if one-way).';
  return ok;
}

function _transportSummaryLabel(d) {
  if (!d) return 'No';
  if (d.transport_selection) {
    const sel       = d.transport_selection;
    const route     = _findTransportRoute(sel.route_id);
    const routeName = route ? (route.name || route.title || '') : (sel.route_name || `Route #${sel.route_id}`);
    if (sel.journey_type === 'two_way') return `${routeName} (Two-way)`;
    if (sel.journey_type === 'one_way') return `${routeName} (One-way, ${sel.time_of_day === 'morning' ? 'Morning' : sel.time_of_day === 'evening' ? 'Evening' : '—'})`;
    return `${routeName} (journey type not specified)`;
  }
  if (d.transport_route_id && d.uses_school_transport !== false) {
    const route     = _findTransportRoute(d.transport_route_id);
    const routeName = route ? (route.name || route.title || '') : `Route #${d.transport_route_id}`;
    return `${routeName} (journey type not specified)`;
  }
  return (d.uses_school_transport || d.uses_transport) ? 'Yes' : 'No';
}

function _stuTabPrevEdu(d) {
  const pe = d.previous_education || {};
  return `
    <div class="stu-form-grid">
      <div class="stu-form-group">
        <label>Previous School Name</label>
        <input id="se-prev-school" class="fin-search-input" style="width:100%!important" value="${_esc(pe.school_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Level Completed</label>
        <input id="se-year-left" class="fin-search-input" style="width:100%!important" value="${_esc(pe.level_completed||'')}">
      </div>
    </div>
  `;
}

function _stuTabGuardian(d) {
  const allParents = d.parents || [];
  const nonGuardian = allParents.filter(p => p.relationship !== 'GUARDIAN');
  const p1 = nonGuardian[0] || {};
  const p2 = nonGuardian[1] || {};
  const g  = allParents.find(p => p.relationship === 'GUARDIAN') || {};
  return `
    <div class="stu-form-grid">
      <!-- First Parent -->
      <div class="stu-form-group" style="grid-column:span 2;font-weight:600;color:#2c3e50;border-bottom:1px solid #eee;padding-bottom:6px;">
        First Parent
      </div>
      <div class="stu-form-group">
        <label>First Parent Name <span style="color:#e74c3c">*</span></label>
        <input id="se-p1-name" class="fin-search-input" style="width:100%!important" value="${_esc(p1.full_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>First Parent Relationship <span style="color:#e74c3c">*</span></label>
        <select id="se-p1-relationship" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Please Select</option>
          <option value="FATHER"${p1.relationship==='FATHER'?' selected':''}>Father</option>
          <option value="MOTHER"${p1.relationship==='MOTHER'?' selected':''}>Mother</option>
          <option value="GUARDIAN"${p1.relationship==='GUARDIAN'?' selected':''}>Guardian</option>
        </select>
        <span class="stu-field-error" id="err-se-p1-relationship"></span>
      </div>
      <div class="stu-form-group">
        <label>First Parent Phone <span style="color:#e74c3c">*</span></label>
        <input id="se-p1-phone" class="fin-search-input" style="width:100%!important" value="${_esc(p1.phone||'')}">
        <span class="stu-field-error" id="err-se-p1-phone"></span>
      </div>
      <div class="stu-form-group">
        <label>First Parent Email <span style="color:#e74c3c">*</span></label>
        <input id="se-p1-email" type="email" class="fin-search-input" style="width:100%!important" value="${_esc(p1.email||'')}">
        <span class="stu-field-error" id="err-se-p1-email"></span>
      </div>
      <div class="stu-form-group">
        <label>First Parent Residence</label>
        <input id="se-p1-residence" class="fin-search-input" style="width:100%!important" value="${_esc(p1.address||'')}">
      </div>
      <div class="stu-form-group">
        <label>First Parent ID Document Number <span style="color:#e74c3c">*</span></label>
        <input id="se-p1-id-document" class="fin-search-input" style="width:100%!important" value="${_esc(p1.id_document||'')}">
        <span class="stu-field-error" id="err-se-p1-id-document"></span>
      </div>

      <!-- Second Parent -->
      <div class="stu-form-group" style="grid-column:span 2;font-weight:600;color:#2c3e50;border-bottom:1px solid #eee;padding-bottom:6px;margin-top:8px;">
        Second Parent <small style="font-weight:400;color:#888;">(optional)</small>
      </div>
      <div class="stu-form-group">
        <label>Second Parent Name</label>
        <input id="se-p2-name" class="fin-search-input" style="width:100%!important" value="${_esc(p2.full_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Second Parent Relationship</label>
        <select id="se-p2-relationship" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Please Select</option>
          <option value="FATHER"${p2.relationship==='FATHER'?' selected':''}>Father</option>
          <option value="MOTHER"${p2.relationship==='MOTHER'?' selected':''}>Mother</option>
          <option value="GUARDIAN"${p2.relationship==='GUARDIAN'?' selected':''}>Guardian</option>
        </select>
        <span class="stu-field-error" id="err-se-p2-relationship"></span>
      </div>
      <div class="stu-form-group">
        <label>Second Parent Phone</label>
        <input id="se-p2-phone" class="fin-search-input" style="width:100%!important" value="${_esc(p2.phone||'')}">
      </div>
      <div class="stu-form-group">
        <label>Second Parent Email</label>
        <input id="se-p2-email" type="email" class="fin-search-input" style="width:100%!important" value="${_esc(p2.email||'')}">
      </div>
      <div class="stu-form-group">
        <label>Second Parent Residence</label>
        <input id="se-p2-residence" class="fin-search-input" style="width:100%!important" value="${_esc(p2.address||'')}">
      </div>
      <div class="stu-form-group">
        <label>Second Parent ID Document Number</label>
        <input id="se-p2-id-document" class="fin-search-input" style="width:100%!important" value="${_esc(p2.id_document||'')}">
      </div>

      <!-- Guardian Information -->
      <div class="stu-form-group" style="grid-column:span 2;font-weight:600;color:#2c3e50;border-bottom:1px solid #eee;padding-bottom:6px;margin-top:8px;">
        Guardian Information <small style="font-weight:400;color:#888;">(optional)</small>
      </div>
      <div class="stu-form-group">
        <label>Guardian Full Name</label>
        <input id="se-guardian-name" class="fin-search-input" style="width:100%!important" value="${_esc(g.full_name||'')}">
      </div>
      <div class="stu-form-group">
        <label>Guardian Phone Contact</label>
        <input id="se-guardian-phone" class="fin-search-input" style="width:100%!important" value="${_esc(g.phone||'')}">
      </div>
      <div class="stu-form-group">
        <label>Guardian Email Address</label>
        <input id="se-guardian-email" type="email" class="fin-search-input" style="width:100%!important" value="${_esc(g.email||'')}">
      </div>
    </div>
  `;
}
function _wireStuGuardianTab() {}

function _stuTabMedical(d) {
  const med = d.medical || {};
  return `
    <div class="stu-form-grid">
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Allergies</label>
        <textarea id="se-allergies" style="width:100%;min-height:70px;padding:8px;border:1px solid #ccc;border-radius:4px;">${_esc(med.allergies||'')}</textarea>
      </div>
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Chronic Symptoms</label>
        <textarea id="se-chronic" style="width:100%;min-height:70px;padding:8px;border:1px solid #ccc;border-radius:4px;">${_esc(med.chronic_symptoms||'')}</textarea>
      </div>
      <div class="stu-form-group">
        <label>Health Insurance</label>
        <input id="se-insurance" class="fin-search-input" style="width:100%!important" value="${_esc(med.health_insurance||'')}">
      </div>
      <div class="stu-form-group">
        <label>Blood Group</label>
        <select id="se-blood-group" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
          <option value="">Select</option>
          ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => `<option${med.blood_group===b?' selected':''}>${b}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group">
        <label>Emergency Contact Name <span class="fin-required">*</span></label>
        <input id="se-emrg-name" class="fin-search-input" style="width:100%!important" value="${_esc(med.emergency_contact_name||'')}">
        <span class="stu-field-error" id="err-se-emrg-name"></span>
      </div>
      <div class="stu-form-group">
        <label>Emergency Contact Phone <span class="fin-required">*</span></label>
        <input id="se-emrg-phone" class="fin-search-input" style="width:100%!important" value="${_esc(med.emergency_contact_phone||'')}">
        <span class="stu-field-error" id="err-se-emrg-phone"></span>
      </div>
      <div class="stu-form-group">
        <label>Emergency Contact Relationship</label>
        <input id="se-emrg-relationship" class="fin-search-input" style="width:100%!important" placeholder="e.g. Mother, Father" value="${_esc(med.emergency_contact_relationship||'')}">
      </div>
    </div>
  `;
}

function _stuTabDocuments(d) {
  const docs = d.documents || [];
  const existing = docs.length
    ? docs.map(doc => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;background:#f9f9f9;border-radius:4px;margin-bottom:6px;">
          <span style="flex:1;">${_esc(doc.name)}</span>
          <a href="${_esc(doc.url)}" target="_blank" class="fin-btn-outline" style="padding:4px 10px!important;font-size:0.82rem;">View</a>
        </div>`).join('')
    : '<p style="color:#888;font-size:0.88rem;">No documents uploaded.</p>';
  return `
    <div style="padding:4px;">
      <p style="font-weight:600;color:#2c3e50;margin-bottom:12px;">Existing Documents</p>
      ${existing}
      <p style="font-weight:600;color:#2c3e50;margin:16px 0 8px;">Upload New Documents</p>
      <div class="stu-form-group" style="margin-bottom:12px;">
        <label>Passport Photo</label>
        <input type="file" id="se-doc-photo" accept="image/*" onchange="_cacheStuFile('se-doc-photo', this)">
      </div>
      <div class="stu-form-group" style="margin-bottom:12px;">
        <label>Previous School Report (PDF)</label>
        <input type="file" id="se-doc-report" accept=".pdf" onchange="_cacheStuFile('se-doc-report', this)">
      </div>
      <div class="stu-form-group">
        <label>Other Document</label>
        <input type="file" id="se-doc-other" onchange="_cacheStuFile('se-doc-other', this)">
      </div>
    </div>
  `;
}

function _stuValidatePersonal() {
  const required = [
    { id: 'se-surname',     err: 'err-se-surname',     msg: 'Surname is required.' },
    { id: 'se-other-name',  err: 'err-se-other-name',  msg: 'Other Name is required.' },
    { id: 'se-gender',      err: 'err-se-gender',      msg: 'Gender is required.' },
    { id: 'se-dob',         err: 'err-se-dob',         msg: 'Birth Date is required.' },
    { id: 'se-nationality', err: 'err-se-nationality',  msg: 'Nationality is required.' },
    { id: 'se-level', err: 'err-se-level', msg: 'Level of Academics is required.' },
  ];
  let valid = true;
  required.forEach(({ id, err, msg }) => {
    const el = document.getElementById(id);
    const errEl = document.getElementById(err);
    if (!el || !el.value.trim()) {
      if (el) el.classList.add('error');
      if (errEl) errEl.textContent = msg;
      valid = false;
    } else {
      if (el) el.classList.remove('error');
      if (errEl) errEl.textContent = '';
    }
  });
  // Business rule (not enforced server-side): students must be between 2 and
  // 10 years old at registration. Only checked on new registrations — editing
  // an existing (already-enrolled, possibly older) student must not re-trigger it.
  const dobEl = document.getElementById('se-dob');
  const dobErrEl = document.getElementById('err-se-dob');
  if (!_currentEditStudentId && dobEl && dobEl.value) {
    const birth = new Date(dobEl.value);
    if (!isNaN(birth.getTime())) {
      const now = new Date();
      let ageYears = now.getFullYear() - birth.getFullYear();
      const monthDiff = now.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) ageYears--;
      if (ageYears < 2 || ageYears > 10) {
        dobEl.classList.add('error');
        if (dobErrEl) dobErrEl.textContent = 'Student must be between 2 and 10 years old.';
        valid = false;
      }
    }
  }
  // Block if term/class auto-derivation is in an error state
  const fd = window._stuFormData || {};
  if (fd._derivation_error) valid = false;
  return valid;
}

function _stuValidateMedical() {
  // Validates against live DOM when on the medical tab; falls back to _stuFormData
  // when called from submitStudentForm while on a different tab.
  const onTab = !!document.getElementById('se-emrg-name');
  const name  = onTab ? (document.getElementById('se-emrg-name').value||'').trim()
                      : ((window._stuFormData||{}).medical_info?.emergency_contact_name||'').trim();
  const phone = onTab ? (document.getElementById('se-emrg-phone').value||'').trim()
                      : ((window._stuFormData||{}).medical_info?.emergency_contact_phone||'').trim();
  let valid = true;
  if (onTab) {
    const nameErr  = document.getElementById('err-se-emrg-name');
    const phoneErr = document.getElementById('err-se-emrg-phone');
    if (nameErr)  nameErr.textContent  = name  ? '' : 'Emergency contact name is required.';
    if (phoneErr) phoneErr.textContent = phone ? '' : 'Emergency contact phone is required.';
  }
  if (!name || !phone) valid = false;
  return valid;
}

// Term/class auto-derivation failures aren't "missing field" errors — give a
// specific toast instead of the generic one so they're not mistaken for it.
function _stuPersonalValidationMessage() {
  const err = (window._stuFormData || {})._derivation_error;
  if (err === 'no_term')   return 'This joining date does not fall within any configured academic term.';
  if (err === 'no_class')  return 'No class has been set up yet for the selected level in this academic year.';
  if (err === 'multi_class') return 'Multiple classes were found for this level/year — please select one.';
  if (err === 'error')     return 'Could not resolve term/class. Please try again.';
  return 'Please fill in all required fields.';
}

// ── Per-tab harvesting ──────────────────────────────────────────────────────
// Tab content is rebuilt from window._stuFormData on every switch, so live DOM
// edits on the tab being left must be copied back into that object first —
// otherwise they're silently lost on navigation/save.

function _harvestStuPersonalTab() {
  const d = window._stuFormData || (window._stuFormData = {});
  if (!document.getElementById('se-surname')) return; // tab not currently mounted
  d.last_name        = _fv('se-surname').trim();
  d.first_name       = _fv('se-other-name').trim();
  d.gender            = _fv('se-gender');
  d.date_of_birth     = _fv('se-dob');
  d.joining_date       = _fv('se-joining-date');
  d.nationality        = _fv('se-nationality');
  d.religion           = _fv('se-religion');
  d.physical_address   = _fv('se-physical-address');
  d.level_id           = _fv('se-level') || null;
  d.student_type       = _fv('se-student-type') || 'Full Day';
  // term_id and class_id are maintained by _deriveStuTermAndClass; do not overwrite from DOM
  const houseSel = document.getElementById('se-sports-house');
  if (houseSel) {
    d.sports_house_id   = houseSel.value ? Number(houseSel.value) : null;
    d.sports_house_name = houseSel.value ? houseSel.options[houseSel.selectedIndex].textContent : null;
  }
  const ecSelect = document.getElementById('se-extra-curriculum');
  d.extra_curriculum_ids = ecSelect ? Array.from(ecSelect.selectedOptions).map(o => o.value) : (d.extra_curriculum_ids || []);
  d.mapped_to_meal_program = _fradio('se-meal') === 'yes';
  d.parent_consents_photo  = _fc('se-photo-consent');
  d.notes              = _fv('se-notes');
  d.has_sibling_enrolled = _fc('se-has-sibling') || _stuSiblingTotalCount() > 0;
  // Backend's flat fields only hold one sibling — kept in sync with the first
  // entry for backward compat; the full set is synced to the real Sibling
  // Groups resource in _stuSyncSiblingGroup once this student has an id.
  const firstSibling = window._stuSiblingExisting[0] || window._stuSiblingNewPicks[0];
  d.sibling_student_name = d.has_sibling_enrolled && firstSibling ? firstSibling.name : '';
  d.sibling_student_id   = d.has_sibling_enrolled && firstSibling ? firstSibling.student_id : '';
  const photoEl = document.getElementById('se-photo');
  if (photoEl) _cacheStuFile('se-photo', photoEl);
  // uses_school_transport / transport_selection are kept up to date directly
  // by the transport cascade (onStuUsesTransportChange/finishTransportCascade).
}

function _harvestStuPrevEduTab() {
  if (!document.getElementById('se-prev-school')) return;
  const d = window._stuFormData || (window._stuFormData = {});
  const schoolName = _fv('se-prev-school');
  d.previous_education = {
    has_previous:     !!schoolName,
    school_name:      schoolName,
    level_completed:  _fv('se-year-left'),
  };
}

// Backend requires `relationship` on every parent entry, and `id_document` specifically
// on the primary parent (first parent) — only enforceable while the guardian tab is
// mounted (its inputs don't exist once you've navigated away).
function _stuValidateGuardian() {
  if (!document.getElementById('se-p1-name')) return true;
  let valid = true;
  [['se-p1-name', 'se-p1-relationship', 'err-se-p1-relationship'],
   ['se-p2-name', 'se-p2-relationship', 'err-se-p2-relationship']].forEach(([nameId, relId, errId]) => {
    const name = _fv(nameId).trim();
    const relEl = document.getElementById(relId);
    const errEl = document.getElementById(errId);
    const needsRel = !!name;
    const missing = needsRel && !relEl.value;
    if (relEl) relEl.classList.toggle('error', missing);
    if (errEl) errEl.textContent = missing ? 'Relationship is required.' : '';
    if (missing) valid = false;
  });

  const p1Name   = _fv('se-p1-name').trim();
  const idDocEl  = document.getElementById('se-p1-id-document');
  const idErrEl  = document.getElementById('err-se-p1-id-document');
  const idMissing = !!p1Name && !_fv('se-p1-id-document').trim();
  if (idDocEl) idDocEl.classList.toggle('error', idMissing);
  if (idErrEl) idErrEl.textContent = idMissing ? 'ID Document Number is required for the primary parent.' : '';
  if (idMissing) valid = false;

  // Backend rejects the whole record if the primary parent is missing phone or email —
  // enforce both here so the failure surfaces as an inline field error instead of a
  // generic save-failed toast.
  const phoneEl  = document.getElementById('se-p1-phone');
  const phoneErrEl = document.getElementById('err-se-p1-phone');
  const phoneMissing = !!p1Name && !_fv('se-p1-phone').trim();
  if (phoneEl) phoneEl.classList.toggle('error', phoneMissing);
  if (phoneErrEl) phoneErrEl.textContent = phoneMissing ? 'Phone is required for the primary parent.' : '';
  if (phoneMissing) valid = false;

  const emailEl  = document.getElementById('se-p1-email');
  const emailErrEl = document.getElementById('err-se-p1-email');
  const emailMissing = !!p1Name && !_fv('se-p1-email').trim();
  if (emailEl) emailEl.classList.toggle('error', emailMissing);
  if (emailErrEl) emailErrEl.textContent = emailMissing ? 'Email is required for the primary parent.' : '';
  if (emailMissing) valid = false;

  return valid;
}

function _harvestStuGuardianTab() {
  if (!document.getElementById('se-p1-name')) return;
  const d = window._stuFormData || (window._stuFormData = {});
  // Preserve any `.id` already assigned by a prior guardian-endpoint POST — rebuilding
  // this array from scratch on every harvest would otherwise wipe it and cause a
  // duplicate POST (instead of the intended PATCH) on the next save.
  const prevNonGuardian = (d.parents || []).filter(p => p.relationship !== 'GUARDIAN');
  const prevGuardian     = (d.parents || []).find(p => p.relationship === 'GUARDIAN');

  const parents = [];
  const p1 = _fv('se-p1-name').trim();
  if (p1) parents.push({ id: prevNonGuardian[0]?.id, full_name: p1, relationship: _fv('se-p1-relationship') || null, email: _fv('se-p1-email'), phone: _fv('se-p1-phone'), address: _fv('se-p1-residence'), id_document: _fv('se-p1-id-document'), is_primary: true });
  const p2 = _fv('se-p2-name').trim();
  if (p2) parents.push({ id: prevNonGuardian[1]?.id, full_name: p2, relationship: _fv('se-p2-relationship') || null, email: _fv('se-p2-email'), phone: _fv('se-p2-phone'), address: _fv('se-p2-residence'), id_document: _fv('se-p2-id-document'), is_primary: false });

  // Backend has no separate "guardian" field on the student record — a non-parent
  // guardian is just another `parents` entry with relationship: 'guardian'.
  const gName = _fv('se-guardian-name').trim();
  if (gName) parents.push({ id: prevGuardian?.id, full_name: gName, relationship: 'GUARDIAN', phone: _fv('se-guardian-phone'), email: _fv('se-guardian-email'), is_primary: false });

  d.parents = parents;
}

function _harvestStuMedicalTab() {
  if (!document.getElementById('se-allergies')) return;
  const d = window._stuFormData || (window._stuFormData = {});
  // health_insurance/blood_group/emergency_contact_* are now real columns on
  // MedicalInformationCreate — kept in sync on both keys so re-displaying this tab
  // after switching away shows the just-harvested values rather than stale load data.
  const medical = {
    allergies:                      _fv('se-allergies'),
    chronic_symptoms:               _fv('se-chronic'),
    health_insurance:               _fv('se-insurance'),
    blood_group:                    _fv('se-blood-group'),
    emergency_contact_name:         _fv('se-emrg-name'),
    emergency_contact_phone:        _fv('se-emrg-phone'),
    emergency_contact_relationship: _fv('se-emrg-relationship'),
  };
  d.medical = medical;
  d.medical_info = medical;
}

function _harvestStuDocumentsTab() {
  ['se-doc-photo', 'se-doc-report', 'se-doc-other'].forEach(id => {
    const el = document.getElementById(id);
    if (el) _cacheStuFile(id, el);
  });
}

function _harvestStuActiveTab() {
  switch (_stuEditActiveTab) {
    case 'personal':  _harvestStuPersonalTab();  break;
    case 'prev-edu':  _harvestStuPrevEduTab();   break;
    case 'guardian':  _harvestStuGuardianTab();  break;
    case 'medical':   _harvestStuMedicalTab();   break;
    case 'documents': _harvestStuDocumentsTab(); break;
  }
}

// ── Persistence ──────────────────────────────────────────────────────────────
// The backend models a student as several separate resources (base record,
// previous-education, medical, guardians, transport) rather than one flat row,
// so — unlike the old single-PUT design — saves are routed per active tab:
//   • create (no id yet): one POST /students/ embedding everything the
//     register schema supports (parents/previous_education/medical_info).
//   • edit, personal tab: PATCH /students/{id} with flat fields, then sync
//     the transport assignment via its own endpoint.
//   • edit, prev-edu / medical tabs: PUT their dedicated sub-resource endpoint.
//   • edit, guardian tab: POST a new /guardians entry per parent without an
//     id yet, PATCH /guardians/{id} for ones already saved.

function _stuFlatPayload(d) {
  return {
    first_name:        (d.first_name || '').trim(),
    last_name:         (d.last_name || '').trim(),
    gender:            d.gender || null,
    date_of_birth:     d.date_of_birth || null,
    joining_date:      d.joining_date || null,
    nationality:       d.nationality || null,
    religion:          d.religion || null,
    physical_address:  d.physical_address || null,
    notes:             d.notes || null,
    term_id:           d.term_id || null,
    academic_level_id: d.level_id || null,
    academic_year_id:  d.academic_year_id || null,
    school_class_id:   d.class_id || null,
    sports_house_id:   d.sports_house_id || null,
    student_type:      d.student_type || 'Full Day',
    has_sibling_enrolled: !!d.has_sibling_enrolled,
    sibling_student_name: d.sibling_student_name || null,
    sibling_student_id:   d.sibling_student_id || null,
    mapped_to_meal_program: !!d.mapped_to_meal_program,
    parent_consents_photo: !!d.parent_consents_photo,
  };
}

// Resolves the route's pricing-row id for the chosen direction so it can be
// sent as transport_pricing_id on registration (StudentRegisterRequest —
// triggers the backend's auto transport-fee assignment when a term_id is
// also set). Direction already uniquely picks the row, since the cascade
// modal only lets the parent choose one journey_type/time_of_day combo, so
// there's nothing left for the user to disambiguate.
async function _stuResolveTransportPricingId(d) {
  const sel = d.transport_selection;
  if (!d.uses_school_transport || !sel || !sel.route_id || !sel.journey_type) return null;
  const direction = sel.journey_type === 'two_way' ? 'TWO_WAY' : (sel.time_of_day === 'evening' ? 'ONE_WAY_EVENING' : 'ONE_WAY_MORNING');
  try {
    const res = await apiFetch(`${API_BASE}/routes/${sel.route_id}/pricing/`);
    if (res && res.ok) {
      const rows = _toArray(await res.json());
      const match = rows.find(r => r.direction === direction);
      if (match) return match.id;
    }
  } catch (_) {}
  return null;
}

// Best-effort — a failure here doesn't roll back the record save that already
// succeeded, it just surfaces a separate toast so transport isn't silently lost.
async function _stuSyncTransport(studentId, d) {
  // StudentRouteAssign.term_id is now an explicit override only — an omitted
  // term_id makes the backend fall back to the student's own current term_id
  // itself. Previously this always sent d.term_id explicitly; whenever that
  // derived value didn't match what the backend considered current, the write
  // silently no-op'd. Trust the backend's fallback by default and only send a
  // term_id when the operator has deliberately chosen an override (no such UI
  // control exists yet — d.transport_term_override is where it would plug in).
  const sel = d.transport_selection;
  if (d.uses_school_transport && sel && sel.route_id && sel.journey_type) {
    const direction = sel.journey_type === 'two_way'
      ? 'TWO_WAY'
      : (sel.time_of_day === 'evening' ? 'ONE_WAY_EVENING' : 'ONE_WAY_MORNING');
    const body = { route_id: String(sel.route_id), direction, use_daily_rate: false };
    if (d.transport_term_override) body.term_id = d.transport_term_override;
    const res = await apiFetch(`${API_BASE}/students/${studentId}/transport`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!(res && res.ok)) showToast('Saved, but transport assignment failed: ' + (res ? await parseApiError(res) : 'unknown error'), 'error');
  } else if (!d.uses_school_transport) {
    const qs = d.transport_term_override ? `?term_id=${d.transport_term_override}` : '';
    await apiFetch(`${API_BASE}/students/${studentId}/transport${qs}`, { method: 'DELETE' }).catch(() => {});
  }
}

// Best-effort — a failure here doesn't roll back the record save that already
// succeeded. Syncs the selected Extra Curriculum activities (the legacy
// ExtraCurriculumActivity catalog behind the Personal tab's multiselect —
// unrelated to the Fee-Items/ECA-Assignment grid used by Extra Curricular
// Activity Assignment under Utilities) against
// the real StudentExtraCurriculum rows via POST/DELETE, then PATCHes
// extra_curriculum_term_id to trigger the backend's own enrollment +
// fee-assignment sync for this term. Previously the selections were captured
// in the form (d.extra_curriculum_ids) but never sent anywhere, so that
// trigger — sent unconditionally on every Personal-tab save — had nothing to
// act on. Row sync must happen before the trigger PATCH, which is why this
// runs as its own step rather than bundling extra_curriculum_term_id into the
// main flat-fields PATCH.
async function _stuSyncEca(studentId, d) {
  const selectedIds = (d.extra_curriculum_ids || []).map(String);

  let existing = [];
  try {
    const res = await apiFetch(`${API_BASE}/students/${studentId}/extra-curriculum/`);
    if (res && res.ok) existing = _toArray(await res.json());
  } catch (_) {}
  const existingByActivity = new Map(existing.map(e => [String(e.extra_curriculum_id), e]));

  for (const actId of selectedIds) {
    if (existingByActivity.has(actId)) continue;
    const res = await apiFetch(`${API_BASE}/students/${studentId}/extra-curriculum/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, extra_curriculum_id: parseInt(actId, 10) }),
    });
    if (!(res && res.ok)) showToast('Saved, but enrolling in an Extra Curriculum activity failed: ' + (res ? await parseApiError(res) : 'unknown error'), 'error');
  }
  for (const e of existing) {
    if (!selectedIds.includes(String(e.extra_curriculum_id))) {
      const res = await apiFetch(`${API_BASE}/students/${studentId}/extra-curriculum/${e.id}`, { method: 'DELETE' });
      if (!(res && res.ok)) showToast('Saved, but removing an Extra Curriculum activity failed: ' + (res ? await parseApiError(res) : 'unknown error'), 'error');
    }
  }

  const patchRes = await apiFetch(`${API_BASE}/students/${studentId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extra_curriculum_term_id: d.term_id || null }),
  });
  if (!(patchRes && patchRes.ok)) showToast('Saved, but syncing Extra Curriculum fees failed: ' + (patchRes ? await parseApiError(patchRes) : 'unknown error'), 'error');
}

// Best-effort — a failure here doesn't roll back the record save that already
// succeeded. New sibling picks made this session are only committed to the real
// Sibling Groups resource once this student has a numeric id: either added to
// the existing group (POST .../add-student/{id}) or used to create a brand new
// one (POST /receivables/sibling-groups/ with this student + the new picks,
// capped at 3 total per the backend's group-size rule).
async function _stuSyncSiblingGroup(studentId, d) {
  const newPicks = window._stuSiblingNewPicks || [];
  if (!newPicks.length) return;

  // A student can only belong to one sibling group on the backend — POSTing a
  // brand-new group that includes someone already grouped 409s. So if the
  // current student OR any pick already has a group, everyone funnels into
  // that one existing group via add-student instead of creating a new one.
  const targetGroupId = d.sibling_group_id || newPicks.find(p => p.sibling_group_id)?.sibling_group_id;

  if (targetGroupId) {
    const toAdd = [
      ...(String(d.sibling_group_id) === String(targetGroupId) ? [] : [{ id: studentId, name: d.first_name || 'Student' }]),
      ...newPicks.filter(p => String(p.sibling_group_id) !== String(targetGroupId)),
    ];
    for (const p of toAdd) {
      const res = await apiFetch(`${API_BASE}/receivables/sibling-groups/${targetGroupId}/add-student/${p.id}`, { method: 'POST' });
      if (!(res && res.ok)) showToast(`Saved, but adding ${p.name} to the sibling group failed: ` + (res ? await parseApiError(res) : 'unknown error'), 'error');
    }
    d.sibling_group_id = targetGroupId;
  } else {
    const studentIds = [studentId, ...newPicks.map(p => p.id)].slice(0, 3);
    const res = await apiFetch(`${API_BASE}/receivables/sibling-groups/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_ids: studentIds }),
    });
    if (res && res.ok) {
      const group = await res.json().catch(() => null);
      if (group) d.sibling_group_id = group.id;
    } else {
      showToast('Saved, but creating the sibling group failed: ' + (res ? await parseApiError(res) : 'unknown error'), 'error');
    }
  }
  window._stuSiblingExisting = (window._stuSiblingExisting || []).concat(newPicks);
  window._stuSiblingNewPicks = [];
  // Lets Finance > Set-up > Sibling Groups auto-open this group on next visit
  // instead of requiring the user to already know its numeric id.
  if (d.sibling_group_id) {
    try { sessionStorage.setItem('_edugiga_last_sibling_group_id', String(d.sibling_group_id)); } catch (_) {}
    rememberSiblingGroupId(d.sibling_group_id);
  }
}

// Uploads every cached file (Personal Data's Photo + the Document Uploads tab's
// three inputs) via POST /upload/, then attaches each as a document record on the
// student via POST /students/{id}/documents ({name, url} — additionalProperties:
// true on the backend, so this shape is safe even if more fields get added later).
const _STU_FILE_LABELS = {
  'se-photo':      'Photo',
  'se-doc-photo':  'Passport Photo',
  'se-doc-report': 'Previous School Report',
  'se-doc-other':  'Other Document',
};
async function _stuUploadCachedFiles(studentId) {
  const entries = Object.entries(window._stuFormFiles || {}).filter(([, f]) => f);
  for (const [inputId, file] of entries) {
    const url = await uploadFile(file);
    if (!url) continue;
    const res = await apiFetch(`${API_BASE}/students/${studentId}/documents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: _STU_FILE_LABELS[inputId] || inputId, url }),
    });
    if (!(res && res.ok)) showToast(`Saved, but uploading ${_STU_FILE_LABELS[inputId] || inputId} failed: ` + (res ? await parseApiError(res) : 'unknown error'), 'error');
  }
  window._stuFormFiles = {};
}

async function _persistStudentRecord(showSuccessToast, allTabs) {
  const d = window._stuFormData || {};
  const isEdit = !!_currentEditStudentId;

  if (!isEdit) {
    const payload = {
      ..._stuFlatPayload(d),
      transport_pricing_id: await _stuResolveTransportPricingId(d),
      previous_education: d.previous_education || null,
      medical_info:        d.medical_info || null,
      parents:              d.parents || [],
    };

    // POST /students/ only accepts application/json (no multipart) — files are
    // uploaded separately via /upload/ then attached as document records, same
    // pattern as the edit-mode 'documents' tab below.
    const res = await apiFetch(`${API_BASE}/students/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!(res && res.ok)) {
      showToast('Error: ' + (res ? await parseApiError(res) : 'An error occurred.'), 'error');
      return false;
    }
    const saved = await res.json();
    _currentEditStudentId = saved.id;
    window._stuFormData = { ...d, ...saved };
    _stuEditDirty = false;
    clearStudentDraft();
    await _stuSyncTransport(saved.id, d);
    await _stuSyncSiblingGroup(saved.id, window._stuFormData);
    await _stuSyncEca(saved.id, d);
    await _stuUploadCachedFiles(saved.id);
    if (showSuccessToast) showToast('Student added successfully!', 'success');
    return true;
  }

  const id = _currentEditStudentId;
  let ok = true, errMsg = '';
  async function call(url, method, body) {
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!(res && res.ok)) { ok = false; errMsg = res ? await parseApiError(res) : 'An error occurred.'; }
    return res;
  }

  // The final "Update" button (submitStudentForm) always calls this with
  // allTabs:true — it force-switches to the Personal tab first (validation
  // needs those fields live in the DOM), but the user may have edited any of
  // the other tabs before reaching Update without ever hitting that tab's own
  // "Save & Continue". Persisting only the now-active 'personal' case would
  // silently drop those other edits, which is why Update previously looked
  // like it "did nothing" — so a full submit pushes every tab's data.
  // "Personal" (which is also where Transport and Sibling Group live) is
  // always pushed since it's always validated/force-switched-to anyway; the
  // other sub-resource tabs are only re-sent if the user actually edited them
  // this session (window._stuDirtyTabs, set by an input/change listener) —
  // otherwise every Update resends every sub-resource unconditionally,
  // including ones the user never touched, which needlessly hits sub-resource
  // endpoints that may be flaky/broken server-side (e.g. guardians PATCH has
  // been observed CORS-failing) for data that never changed.
  // "Save & Continue" (mid-form, not the final submit) still only pushes the
  // tab the user is actually leaving.
  const dirtyTabs = window._stuDirtyTabs || new Set();
  const tabsToSave = allTabs
    ? ['personal', ...['prev-edu', 'medical', 'guardian', 'documents'].filter(t => dirtyTabs.has(t))]
    : [_stuEditActiveTab];
  for (const tab of tabsToSave) {
    switch (tab) {
      case 'personal':
        await call(`${API_BASE}/students/${id}`, 'PATCH', _stuFlatPayload(d));
        await _stuSyncTransport(id, d);
        await _stuSyncSiblingGroup(id, d);
        // Row sync must happen before the extra_curriculum_term_id trigger —
        // see _stuSyncEca's own comment for why this can't be bundled into
        // the flat PATCH above.
        await _stuSyncEca(id, d);
        break;
      case 'prev-edu':
        if (d.previous_education) await call(`${API_BASE}/students/${id}/previous-education`, 'PUT', d.previous_education);
        break;
      case 'medical':
        if (d.medical_info) await call(`${API_BASE}/students/${id}/medical`, 'PUT', d.medical_info);
        break;
      case 'guardian':
        for (const p of (d.parents || [])) {
          if (p.id) {
            await call(`${API_BASE}/students/${id}/guardians/${p.id}`, 'PATCH', p);
          } else {
            const res = await call(`${API_BASE}/students/${id}/guardians`, 'POST', p);
            if (res && res.ok) p.id = (await res.json()).id;
          }
        }
        break;
      case 'documents':
        await _stuUploadCachedFiles(id);
        break;
    }
  }

  if (ok) {
    _stuEditDirty = false;
    if (showSuccessToast) showToast('Student updated successfully!', 'success');
  } else {
    showToast('Error: ' + errMsg, 'error');
  }
  return ok;
}

async function saveAndContinueStuTab() {
  if (_stuEditActiveTab === 'personal') {
    const personalValid  = _stuValidatePersonal();
    const transportValid = _stuValidateTransport();
    if (!personalValid || !transportValid) {
      showToast(_stuPersonalValidationMessage(), 'error');
      return;
    }
  }
  if (_stuEditActiveTab === 'guardian' && !_stuValidateGuardian()) {
    showToast('Please complete the required primary parent fields (Relationship, Phone, Email, ID Document).', 'error');
    return;
  }
  if (_stuEditActiveTab === 'medical' && !_stuValidateMedical()) {
    showToast('Emergency contact name and phone are required.', 'error');
    return;
  }
  _harvestStuActiveTab();

  const btn = document.getElementById('stu-form-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const ok = await _persistStudentRecord(true);
  if (btn) { btn.disabled = false; }

  if (!ok) { _updateStuFormFooter(); return; }

  const idx  = _STU_TABS.findIndex(t => t.id === _stuEditActiveTab);
  const next = _STU_TABS[idx + 1];
  if (next) switchStuEditTab(next.id);
  else _updateStuFormFooter();
}

function _updateStuFormFooter() {
  const footer = document.querySelector('.stu-edit-footer');
  if (!footer) return;
  const isLastTab = _stuEditActiveTab === _STU_TABS[_STU_TABS.length - 1].id;
  const isEdit    = !!_currentEditStudentId;
  footer.innerHTML = isLastTab
    ? `<button class="fin-btn-teal" id="stu-form-submit-btn" onclick="submitStudentForm()">${isEdit ? 'Update' : 'Save'}</button>
       <button class="fin-btn-cancel" onclick="cancelStudentForm()">Cancel</button>`
    : `<button class="fin-btn-teal" id="stu-form-submit-btn" onclick="saveAndContinueStuTab()">Save &amp; Continue</button>
       <button class="fin-btn-cancel" onclick="cancelStudentForm()">Cancel</button>`;
}

async function submitStudentForm() {
  _harvestStuActiveTab();
  // Emergency contact check before leaving whatever tab is active
  if (!_stuValidateMedical()) {
    if (_stuEditActiveTab !== 'medical') switchStuEditTab('medical');
    showToast('Emergency contact name and phone are required before saving.', 'error');
    return;
  }
  if (_stuEditActiveTab !== 'personal') {
    switchStuEditTab('personal');
    await new Promise(r => setTimeout(r, 50));
  }
  const personalValid  = _stuValidatePersonal();
  const transportValid = _stuValidateTransport();
  if (!personalValid || !transportValid) {
    showToast(_stuPersonalValidationMessage(), 'error');
    return;
  }
  _harvestStuActiveTab();

  const isEdit = !!_currentEditStudentId;
  const btn    = document.getElementById('stu-form-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const ok = await _persistStudentRecord(false, true);

  if (btn) { btn.disabled = false; btn.textContent = isEdit ? 'Update' : 'Save'; }

  if (ok) {
    showToast(isEdit ? 'Student updated successfully!' : 'Student added successfully!', 'success');
    _currentEditStudentId = null;
    _stuEditActiveTab = 'personal';
    loadView('students-list');
  }
}

function cancelStudentForm() {
  if (_stuEditDirty && !confirm('You have unsaved changes. Discard them?')) return;
  clearStudentDraft();
  _stuEditDirty = false;
  _currentEditStudentId = null;
  _stuEditActiveTab = 'personal';
  loadView('students-list');
}

// ==================== 3. STUDENT VIEW (READ-ONLY) ====================

async function loadStudentViewPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Detail</h2>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Detail</div>
          <button class="fin-btn-teal" onclick="openStudentFeeStatement(${_currentEditStudentId})" style="padding:5px 14px!important;">&#128196; View Fee Statement</button>
          <button class="fin-btn-outline" onclick="loadView('students-list')" style="padding:5px 14px!important;">&#8592; Back</button>
        </div>
      </div>
      <div id="stu-view-body"><p class="fin-loading">Loading&#8230;</p></div>
    </div>
  `;

  if (!_currentEditStudentId) { document.getElementById('stu-view-body').innerHTML = '<p class="fin-error">No student selected.</p>'; return; }
  // StudentRead (plain GET /students/{id}) has no medical/previous_education/parents
  // fields at all — those only come back from full-profile, same as the Edit form uses.
  let res = await apiFetch(`${API_BASE}/students/${_currentEditStudentId}/full-profile`);
  if (!res || !res.ok) res = await apiFetch(`${API_BASE}/students/${_currentEditStudentId}`);
  const [trRes, termsRes] = await Promise.all([
    apiFetch(`${API_BASE}/routes/`),
    _stuTermsCache.length ? Promise.resolve(null) : apiFetch(`${API_BASE}/terms/`),
  ]);
  if (!res || !res.ok) { document.getElementById('stu-view-body').innerHTML = '<p class="fin-error">Failed to load student.</p>'; return; }
  let d = await res.json();
  // Same shape-normalisation as the edit form: unwrap nested wrappers
  if (d && d.first_name == null) {
    const nested = d.student || d.data || d.profile;
    if (nested && typeof nested === 'object') d = { ...d, ...nested };
  }
  // API returns medical_info; view templates read d.medical — alias both
  if (!d.medical && d.medical_info) d.medical = d.medical_info;
  // Canonical id mappings used throughout the view
  if (d.academic_level_id != null && d.level_id == null)  d.level_id = d.academic_level_id;
  if (d.school_class_id   != null && d.class_id == null)  d.class_id = d.school_class_id;
  // Extra display-name fallbacks for sidebar card and Academic tab
  if (!d.class_name)              d.class_name              = d.school_class_name || d.level_of_academics || d.level_name || null;
  if (!d.level_of_academics_name) d.level_of_academics_name = d.school_class_name || d.class_name || d.level_name || null;
  _stuFormTransportRoutes = trRes && trRes.ok ? _toArray(await trRes.json()) : (_stuFormTransportRoutes || []);
  if (termsRes && termsRes.ok) _stuTermsCache = _toArray(await termsRes.json());
  window._stuViewData = d;
  window._stuViewTab  = 'Personal Data';
  _renderStudentViewBody(d, 'Personal Data');
}

// Fee statement pulls the student's charges (created via the Class Fee Setup ->
// "Generate Fees for Term" trigger) from GET /finance/student-fees/{id} and
// renders them in the school's official statement layout (sample PDF on file).
// _fs* lookups/helpers are defined in finance.js but loaded globally on this page.
async function openStudentFeeStatement(studentId) {
  if (!studentId) { showToast('No student selected.', 'error'); return; }
  // Open the tab synchronously, before any await — browsers only treat
  // window.open as a direct result of the user's click (exempt from the
  // popup blocker) while still inside that synchronous call stack. Opening
  // it after the fetches below resolve made it get silently blocked, which
  // is why the statement appeared to never leave the current tab.
  const win = window.open('', '_blank');
  if (!win) { showToast('Please allow pop-ups to view the statement.', 'error'); return; }
  win.document.write('<p style="font-family:Arial,sans-serif;padding:24px;color:#888;">Loading fee statement&#8230;</p>');
  // Fetch fresh rather than reading window._stuViewData/_stuFormData — those are set
  // by other pages' own async loads and may still be stale (or from a different
  // student) if this is clicked before that page's fetch resolves.
  const studentRes = await apiFetch(`${API_BASE}/students/${studentId}`);
  if (!studentRes || !studentRes.ok) {
    win.document.body.innerHTML = '<p style="font-family:Arial,sans-serif;padding:24px;color:#c0392b;">Could not load student.</p>';
    showToast('Could not load student.', 'error');
    return;
  }
  const d = await studentRes.json();
  if (typeof _fsLoadLookups === 'function') await _fsLoadLookups();

  const termId  = d.term_id || null;
  const classId = d.class_id || d.school_class_id || null;
  let charges = [];
  try {
    const url = `${API_BASE}/finance/student-fees/${studentId}` + (termId ? `?term_id=${termId}` : '');
    const res = await apiFetch(url);
    if (res && res.ok) charges = await res.json();
  } catch (_) {}

  const feeItemName = id => (typeof _fsFeeItemName === 'function') ? _fsFeeItemName(id) : `#${id}`;
  const termName     = id => (typeof _fsTermName === 'function') ? _fsTermName(id) : (id ? `Term #${id}` : '-');
  const yearName      = cid => (typeof _fsAcademicYearName === 'function') ? _fsAcademicYearName(cid) : '-';
  const className       = cid => (typeof _fsClassName === 'function') ? _fsClassName(cid) : '-';

  const total   = charges.reduce((s,c)=>s+(parseFloat(c.amount)||0), 0);
  const balance = charges.reduce((s,c)=>s+(parseFloat(c.balance_due)||0), 0);
  // Overpayments are now held as a prepayment credit (GL 20-01-000) rather than
  // assumed impossible — a negative summed balance means credit/prepaid, not arrears.
  const arrearsLabel   = balance > 0 ? 'FEES ARREARS' : (balance < 0 ? 'PREPAID / CREDIT BALANCE' : 'FEES ARREARS / PREPAID');
  const arrearsDisplay = Math.abs(balance).toLocaleString();

  const rows = charges.length
    ? charges.map((c,i)=>`<tr style="background:${i%2?'#f4f1ea':'#fff'}">
        <td style="padding:10px 16px;">${_esc(feeItemName(c.fee_item_id))}</td>
        <td style="padding:10px 16px;text-align:right;">${(parseFloat(c.amount)||0).toLocaleString()}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="padding:18px;text-align:center;color:#888;">No fees have been generated for this term yet. Use "Generate Fees for Term" on Class Fee Setup first.</td></tr>`;

  const admissionNo = d.student_id || '-';
  const studentName  = `${d.first_name||''} ${d.last_name||''}`.trim() || '-';
  const printedOn      = new Date().toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

  win.document.open();
  win.document.write(`
    <html><head><title>Fee Statement - ${_esc(studentName)}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px;margin:30px auto;padding:0 16px;}
      .crest{color:#c9a227;text-align:center;font-size:0.8rem;letter-spacing:1px;margin-bottom:4px;}
      h1{color:#1d2d50;text-align:center;margin:0 0 4px;font-size:1.6rem;}
      .addr{text-align:center;color:#444;font-size:0.85rem;margin:0;}
      .motto{text-align:center;color:#c9a227;font-style:italic;font-size:0.85rem;margin:4px 0 14px;}
      .rule{border:none;border-top:3px solid #c9a227;margin:0 0 16px;}
      .stmt-title{text-align:center;font-weight:700;margin-bottom:16px;}
      .panel{border:1px solid #d8d8d8;margin-bottom:14px;border-collapse:collapse;width:100%;}
      .panel-head{background:#1d2d50;color:#fff;padding:8px 16px;font-weight:700;}
      .info-row{display:flex;}
      .info-cell{flex:1;padding:8px 16px;border-bottom:1px solid #eee;font-size:0.9rem;}
      .info-label{font-weight:700;display:inline-block;min-width:100px;}
      .arrears{background:#efece4;padding:8px 16px;font-weight:700;display:flex;justify-content:space-between;margin-bottom:14px;}
      table{width:100%;border-collapse:collapse;}
      .acct-head th{background:#1d2d50;color:#fff;text-align:left;padding:10px 16px;}
      .acct-head th:last-child{text-align:right;}
      .total-row td{background:#c9a227;font-weight:700;padding:10px 16px;}
      .total-row td:last-child{text-align:right;}
      .balance-row td{background:#1d2d50;color:#fff;font-weight:700;padding:10px 16px;}
      .balance-row td:last-child{text-align:right;}
      .footnote{font-size:0.75rem;color:#777;margin:8px 0 18px;}
      .pay-cols{display:flex;gap:24px;padding:14px 16px;}
      .pay-col{flex:1;font-size:0.85rem;}
      .pay-col h4{margin:0 0 6px;}
      .closing{font-size:0.8rem;color:#555;margin-top:16px;}
      @media print { .no-print{display:none;} }
    </style></head>
    <body>
      <div class="crest">[ OFFICIAL CREST ]</div>
      <h1>Seven Oaks International School</h1>
      <p class="addr">143 Brookview, Membley | Email: admin@sevenoaks.ac | Phone: 07 XXX XXX XX</p>
      <p class="motto">Rooted in God &middot; Growing through our Pillars &middot; From seed to oak</p>
      <hr class="rule">
      <div class="stmt-title">Summarised Fee Statement &mdash; ${_esc(termName(termId))}, ${_esc(yearName(classId))}</div>

      <table class="panel">
        <tr><td colspan="4" class="panel-head">Student Details</td></tr>
        <tr><td class="info-cell"><span class="info-label">Name</span>${_esc(studentName)}</td><td class="info-cell"><span class="info-label">Admission No.</span>${_esc(admissionNo)}</td></tr>
        <tr><td class="info-cell"><span class="info-label">Class</span>${_esc(className(classId))}</td><td class="info-cell"><span class="info-label">Programme</span>-</td></tr>
        <tr><td class="info-cell"><span class="info-label">Stream</span>${_esc(d.stream||'N/A')}</td><td class="info-cell"><span class="info-label">Stage</span>-</td></tr>
        <tr><td class="info-cell"><span class="info-label">Printed On</span>${_esc(printedOn)}</td><td class="info-cell"></td></tr>
      </table>

      <div class="arrears"><span>${_esc(arrearsLabel)}</span><span>${arrearsDisplay}</span></div>

      <table class="panel" style="margin-bottom:0;">
        <thead><tr class="acct-head"><th>Account</th><th>Amount (KES)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="total-row"><td>TOTAL</td><td>${total.toLocaleString()}</td></tr>
          <tr class="balance-row"><td>Balance</td><td>${balance.toLocaleString()}</td></tr>
        </tfoot>
      </table>
      <p class="footnote">*Amounts reflect the fee schedule configured for this class and term.</p>

      <table class="panel">
        <tr><td colspan="3" class="panel-head">Payment Details</td></tr>
        <tr>
          <td class="pay-col"><h4>Bank Transfer</h4>Bank: [Bank Name]<br>Acc Name: Seven Oaks International School<br>Acc No: [Account No.]<br>Branch: [Branch], Nairobi</td>
          <td class="pay-col"><h4>Cheque</h4>Payable to:<br>Seven Oaks International School<br><br>Crossed &amp; marked<br>&ldquo;A/C Payee Only&rdquo;</td>
          <td class="pay-col"><h4>M-Pesa</h4>Pay Bill No.: [Paybill]<br>Account No.: Admission No.<br>(e.g. ${_esc(admissionNo)})</td>
        </tr>
      </table>

      <p class="closing">Kindly send your deposit slip or confirmation by email to <strong>admin@sevenoaks.ac</strong> or WhatsApp <strong>07 XXX XXX XX</strong> once fees are paid.<br>
      Fees are payable on or before the first day of term. Thank you for partnering with us in your child's journey &mdash; from seed to oak.</p>

      <div class="no-print" style="text-align:center;margin-top:20px;">
        <button onclick="window.print()" style="padding:8px 22px;font-size:0.95rem;">Print</button>
      </div>
    </body></html>`);
  win.document.close();
}

function _renderStudentViewBody(d, activeTab) {
  const TABS = ['Personal Data','Academic Background','Guardian/Family','Medical Information','Disciplinary','Transport','Residence Plan'];
  const statusBadge = d.is_active
    ? '<span class="stu-status-badge stu-status-badge--active">Active</span>'
    : '<span class="stu-status-badge stu-status-badge--inactive">Inactive</span>';

  const tabBar = TABS.map(t =>
    `<button class="stu-tab-btn${t===activeTab?' stu-tab-btn--active':''}"
       onclick="switchStuViewTab(this,'${t.replace(/'/g,'\\\'')}')">${t}</button>`
  ).join('');

  document.getElementById('stu-view-body').innerHTML = `
    <div class="stu-view-layout">
      <div class="stu-view-card">
        <div class="stu-view-avatar">
          ${d.photo_url ? `<img src="${_esc(d.photo_url)}" alt="Photo">` : '&#128100;'}
        </div>
        <div class="stu-view-name">${_esc(`${d.first_name||''} ${d.last_name||''}`.trim())}</div>
        <div class="stu-view-id">${_esc(d.student_id||'')}</div>
        <div class="stu-view-card-rows">
          ${_svRow('Gender',         d.gender)}
          ${_svRow('Level',          d.class_name||d.level_of_academics)}
          ${_svRow('Email',          d.email)}
          ${_svRow('Term',           d.cohort||d.term||d.session)}
          ${_svRow('Phone',          d.phone)}
          ${_svRow('Meal Program',   d.mapped_to_meal_program ? 'Yes' : 'No')}
          ${_svRow('Photo Consent',  d.parent_consents_photo ? 'Yes' : 'No')}
          ${_svRow('Transport',      _transportSummaryLabel(d))}
          <div class="stu-view-card-row">
            <span class="stu-view-card-label">Status</span>
            <span>${statusBadge}</span>
          </div>
        </div>
        <div class="stu-view-fee-row">
          <span style="font-size:0.83rem;color:#888;">Fee Balance</span>
          <span style="color:#e74c3c;font-weight:700;font-size:1rem;">${_esc(String(d.fee_balance ?? '-'))}</span>
          <a href="#" onclick="openStudentFeeStatement(${d.id});return false;" class="fin-btn-teal"
             style="padding:5px 12px!important;font-size:0.78rem;margin-top:4px;">View Fee Statement</a>
        </div>
      </div>

      <div class="stu-view-panel">
        <div class="stu-tab-bar">${tabBar}</div>
        <div class="stu-edit-body" id="stu-view-tab-content">
          ${_renderStuViewTab(activeTab, d)}
        </div>
      </div>
    </div>
  `;
}

function _svRow(label, value) {
  return `<div class="stu-view-card-row">
    <span class="stu-view-card-label">${_esc(label)}</span>
    <span class="stu-view-card-value">${_esc(value||'-')}</span>
  </div>`;
}

function switchStuViewTab(btn, tabName) {
  document.querySelectorAll('.stu-view-panel .stu-tab-btn').forEach(b => b.classList.remove('stu-tab-btn--active'));
  btn.classList.add('stu-tab-btn--active');
  window._stuViewTab = tabName;
  const c = document.getElementById('stu-view-tab-content');
  if (c) c.innerHTML = _renderStuViewTab(tabName, window._stuViewData || {});
}

function _renderStuViewTab(tabName, d) {
  if (tabName === 'Personal Data') return `
    <div class="stu-detail-grid">
      ${_dRow('Student ID',       d.student_id)}
      ${_dRow('Surname',          d.last_name)}
      ${_dRow('Other Name',       d.first_name)}
      ${_dRow('Joining Date',     d.joining_date)}
      ${_dRow('Gender',           d.gender)}
      ${_dRow('Birth Date',       d.date_of_birth)}
      ${_dRow('Age',              calculateAge(d.date_of_birth))}
      ${_dRow('Nationality',      d.nationality)}
      ${_dRow('Religion',         d.religion)}
      ${_dRow('Email',            d.email)}
      ${_dRow('Physical Address', d.physical_address)}
      ${_dRow('Record Closed',    d.record_closed ? 'Yes' : 'No')}
    </div>`;
  if (tabName === 'Academic Background') return `
    <div class="stu-detail-grid">
      ${_dRow('Level of Academics', d.school_class_name||d.level_of_academics_name)}
      ${_dRow('Stream',             d.stream)}
      ${_dRow('Term',               _stuTermName(d.term_id))}
      ${_dRow('Student Type',       d.student_type)}
      ${_dRow('Sports House',       d.sports_house_name)}
      ${_dRow('Status',             d.status||(d.is_active?'Active':'Inactive'))}
      ${_dRow('Transport',          _transportSummaryLabel(d))}
    </div>`;
  if (tabName === 'Guardian/Family') {
    const allParents  = d.parents || [];
    const nonGuardian = allParents.filter(p => p.relationship !== 'GUARDIAN');
    const guardian     = allParents.find(p => p.relationship === 'GUARDIAN');
    return `
    <div>
      ${nonGuardian.map((p, i) => `
        <div style="border:1px solid #eee;border-radius:6px;padding:14px;margin-bottom:12px;">
          <div style="font-weight:600;color:#2c3e50;margin-bottom:8px;">${i === 0 ? 'First Parent' : 'Second Parent'} ${p.relationship ? `(${_esc(p.relationship)})` : ''}</div>
          <div class="stu-detail-grid">
            ${_dRow('Name',      p.full_name)}
            ${_dRow('Phone',     p.phone)}
            ${_dRow('Email',     p.email)}
            ${_dRow('Residence', p.address)}
          </div>
        </div>`).join('') || '<p style="color:#888;padding:16px;">No parent records.</p>'}
      ${guardian ? `
        <div style="border:1px solid #eee;border-radius:6px;padding:14px;margin-bottom:12px;">
          <div style="font-weight:600;color:#2c3e50;margin-bottom:8px;">Guardian</div>
          <div class="stu-detail-grid">
            ${_dRow('Name',  guardian.full_name)}
            ${_dRow('Phone', guardian.phone)}
            ${_dRow('Email', guardian.email)}
          </div>
        </div>` : ''}
    </div>`;
  }
  if (tabName === 'Medical Information') return `
    <div class="stu-detail-grid">
      ${_dRow('Allergies',         d.medical?.allergies)}
      ${_dRow('Chronic Symptoms',  d.medical?.chronic_symptoms)}
      ${_dRow('Health Insurance',  d.medical?.health_insurance)}
      ${_dRow('Blood Group',       d.medical?.blood_group)}
      ${_dRow('Emergency Contact', d.medical?.emergency_contact_name)}
      ${_dRow('Emergency Phone',   d.medical?.emergency_contact_phone)}
      ${_dRow('Emergency Contact Relationship', d.medical?.emergency_contact_relationship)}
    </div>`;
  if (tabName === 'Disciplinary') return `
    <div style="padding:32px;text-align:center;color:#888;">No disciplinary records for this student.</div>`;
  if (tabName === 'Transport') return _stuRenderTransportTab(d);
  if (tabName === 'Residence Plan') return _stuRenderResidencePlanTab(d);
  return '';
}

// GET /students/{id}/transport/history returns every transport assignment
// this student has ever had, newest first (StudentRouteRead[]) — replaces
// the old GET /students/{id}/transport single-current-assignment call.
// route_name is resolved server-side and is null if the route was since
// deleted; [] means no history, 404 only if student_id itself is invalid.
let _stuTransportHistoryCache = {};
async function _stuLoadTransportHistory(studentId) {
  if (studentId in _stuTransportHistoryCache) return _stuTransportHistoryCache[studentId];
  const res = await apiFetch(`${API_BASE}/students/${studentId}/transport/history`);
  if (res && res.ok) _stuTransportHistoryCache[studentId] = await res.json();
  else if (res && res.status === 404) _stuTransportHistoryCache[studentId] = [];
  else return null; // transient failure — don't cache, let the next tab switch retry
  return _stuTransportHistoryCache[studentId];
}

function _stuRenderTransportTab(d) {
  const studentId = d.id;
  if (!(studentId in _stuTransportHistoryCache)) {
    _stuLoadTransportHistory(studentId).then(() => {
      // Only repaint if the operator is still on this tab for this same student —
      // avoids clobbering content after they've navigated away while this was in flight.
      if (window._stuViewTab === 'Transport' && window._stuViewData === d) {
        const c = document.getElementById('stu-view-tab-content');
        if (c) c.innerHTML = _renderStuViewTab('Transport', d);
      }
    });
    return '<p class="fin-loading">Loading transport history&#8230;</p>';
  }
  const history = _stuTransportHistoryCache[studentId] || [];
  if (!history.length) {
    return `<div style="padding:32px;text-align:center;color:#888;">This student has no transport assignment history.</div>`;
  }
  const directionLabels = { TWO_WAY: 'Two-way', ONE_WAY_MORNING: 'One-way (Morning)', ONE_WAY_EVENING: 'One-way (Evening)' };
  const rows = history.map(a => {
    const routeLabel = a.route_name ? _esc(a.route_name) : '<em style="color:#999;">(route deleted)</em>';
    const directionLabel = directionLabels[a.direction] || a.direction || '—';
    const isActive = !!a.active && !a.end_date;
    const statusPill = isActive
      ? '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#7a6110;background:var(--gold-100,#fbe8b0);">Active</span>'
      : '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#666;background:#eee;">Ended</span>';
    return `<tr style="${isActive ? '' : 'opacity:0.6;'}">
      <td style="padding:8px 10px;">${routeLabel}</td>
      <td style="padding:8px 10px;">${_esc(directionLabel)}</td>
      <td style="padding:8px 10px;">${a.use_daily_rate ? 'Daily Rate' : 'Term Rate'}</td>
      <td style="padding:8px 10px;">${_esc(a.start_date || '—')}</td>
      <td style="padding:8px 10px;">${_esc(a.end_date || '—')}</td>
      <td style="padding:8px 10px;">${a.term_id ? _esc(_stuTermName(a.term_id)) : '—'}</td>
      <td style="padding:8px 10px;">${statusPill}</td>
    </tr>`;
  }).join('');
  return `
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
      <thead><tr style="text-align:left;border-bottom:1px solid #ddd;">
        <th style="padding:8px 10px;">Route</th>
        <th style="padding:8px 10px;">Direction</th>
        <th style="padding:8px 10px;">Rate</th>
        <th style="padding:8px 10px;">Start Date</th>
        <th style="padding:8px 10px;">End Date</th>
        <th style="padding:8px 10px;">Term</th>
        <th style="padding:8px 10px;">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ==================== RESIDENCE PLAN TAB (§BB.6 — split-custody overrides) ====================
// Week × AM/PM grid consumed by Bus Schedules' generate-standing (js/transport.js)
// when placing riders. Blank/grey = the student's primary residence (default);
// a gold chip = an override plan exists for that day+timing.

let _stuResidencePlansCache = {}; // studentId -> StudentResidenceScheduleRead[]
const _STU_RP_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const _STU_RP_DIRECTION_LABELS = { TWO_WAY: 'Two-way', ONE_WAY_MORNING: 'One-way (Morning)', ONE_WAY_EVENING: 'One-way (Evening)' };

async function _stuLoadResidencePlans(studentId) {
  const res = await apiFetch(`${_BS_API}/residence-plans/${studentId}`);
  _stuResidencePlansCache[studentId] = (res && res.ok) ? await res.json() : [];
}

function _stuRenderResidencePlanTab(d) {
  const studentId = d.id;
  if (!(studentId in _stuResidencePlansCache)) {
    _stuLoadResidencePlans(studentId).then(() => {
      // Same guard as the Transport tab (js/transport.js) — only repaint if
      // the operator is still on this tab for this same student.
      if (window._stuViewTab === 'Residence Plan' && window._stuViewData === d) {
        const c = document.getElementById('stu-view-tab-content');
        if (c) c.innerHTML = _renderStuViewTab('Residence Plan', d);
      }
    });
    return '<p class="fin-loading">Loading residence plan&#8230;</p>';
  }
  const plans = (_stuResidencePlansCache[studentId] || []).filter(p => p.active !== false);
  const lookup = {};
  plans.forEach(p => { lookup[`${p.day_of_week}-${p.timing}`] = p; });

  const rows = _STU_RP_DAYS.map((label, dow) => {
    const cells = ['am', 'pm'].map(timing => {
      const plan = lookup[`${dow}-${timing}`];
      if (plan) {
        return `<td style="padding:6px;text-align:center;">
          <button type="button" onclick="_stuRpOpenRetireConfirm(${studentId},${plan.id})"
            style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#7a6110;background:var(--gold-100,#fbe8b0);border:none;cursor:pointer;"
            title="Click to retire this override">${_esc(plan.parent_name || 'Override')}</button>
        </td>`;
      }
      return `<td style="padding:6px;text-align:center;">
        <button type="button" onclick="_stuRpOpenAddPopover(${studentId},${dow},'${timing}')"
          style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:0.78rem;color:#999;background:#f2f2f2;border:1px dashed #ccc;cursor:pointer;"
          title="Click to add an override">Primary</button>
      </td>`;
    }).join('');
    return `<tr><td style="padding:6px 10px;font-weight:600;color:#2c3e50;">${label}</td>${cells}</tr>`;
  }).join('');

  return `
    <div>
      <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
        <thead><tr style="text-align:left;border-bottom:1px solid #ddd;">
          <th style="padding:6px 10px;">Day</th><th style="padding:6px;text-align:center;">AM</th><th style="padding:6px;text-align:center;">PM</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#888;font-size:0.8rem;margin-top:14px;">Slots without an override use the student's primary residence. Overrides drive standing manifest generation.</p>
    </div>`;
}

async function _stuRpOpenAddPopover(studentId, dayOfWeek, timing) {
  await Promise.all([
    _stuLoadTransportHistory(studentId),
    (!_trnRoutesData || !_trnRoutesData.length) ? _fetchTrnRoutes() : Promise.resolve(),
  ]);
  const history = _stuTransportHistoryCache[studentId] || [];
  // Auto-default route/direction from the student's active transport
  // assignment — the addendum's own popover spec (§6.3) only asks for a
  // Parent, but StudentResidenceScheduleCreate requires route_id + direction
  // too (confirmed live, not in the spec text). Falls back to explicit
  // pickers only when the student has no active assignment to default from.
  const activeRoute = history.find(a => a.active && !a.end_date);
  window._stuRpPending = {
    studentId, dayOfWeek, timing,
    routeId: activeRoute ? activeRoute.route_id : null,
    direction: activeRoute ? activeRoute.direction : null,
  };

  const wrap = document.createElement('div');
  wrap.id = 'stu-rp-add-modal';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:420px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Add Residence Override</h3>
      <p style="font-size:0.85rem;color:#666;margin:0 0 14px;">${_STU_RP_DAYS[dayOfWeek]} &middot; ${timing.toUpperCase()}</p>
      <div class="trn-form-group">
        <label class="trn-form-label">Parent <span style="color:#e74c3c">*</span></label>
        <select id="stu-rp-parent" class="fin-search-input"><option value="">Loading&#8230;</option></select>
      </div>
      ${activeRoute ? `
        <div class="trn-form-group">
          <label class="trn-form-label">Route / Direction</label>
          <input type="text" class="fin-search-input" value="${_esc(activeRoute.route_name || activeRoute.route_id)} — ${_esc(_STU_RP_DIRECTION_LABELS[activeRoute.direction] || activeRoute.direction)}" readonly style="background:#f5f5f5;color:#666;cursor:not-allowed;">
          <p style="color:#999;font-size:0.76rem;margin:4px 0 0;">From the student's active transport assignment.</p>
        </div>` : `
        <div class="trn-form-grid">
          <div class="trn-form-group">
            <label class="trn-form-label">Route <span style="color:#e74c3c">*</span></label>
            <select id="stu-rp-route" class="fin-search-input" onchange="window._stuRpPending.routeId=this.value">
              ${(_trnRoutesData||[]).map(r=>`<option value="${_esc(r.id)}">${_esc(r.name||r.id)}</option>`).join('')}
            </select>
          </div>
          <div class="trn-form-group">
            <label class="trn-form-label">Direction <span style="color:#e74c3c">*</span></label>
            <select id="stu-rp-direction" class="fin-search-input" onchange="window._stuRpPending.direction=this.value">
              <option value="TWO_WAY">Two-way</option>
              <option value="ONE_WAY_MORNING">One-way (Morning)</option>
              <option value="ONE_WAY_EVENING">One-way (Evening)</option>
            </select>
          </div>
        </div>
        <p style="color:#999;font-size:0.76rem;margin:-6px 0 10px;">This student has no active transport assignment — pick a route and direction for this override.</p>`}
      <div id="stu-rp-add-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('stu-rp-add-modal').remove()">Cancel</button>
        <button class="fin-btn-teal" id="stu-rp-add-submit-btn" onclick="_stuRpSubmitAdd()">Add Override</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  if (!activeRoute) {
    const routeSel = document.getElementById('stu-rp-route');
    const dirSel = document.getElementById('stu-rp-direction');
    window._stuRpPending.routeId = routeSel ? routeSel.value : null;
    window._stuRpPending.direction = dirSel ? dirSel.value : 'TWO_WAY';
  }
  _stuRpLoadParentOptions(studentId);
}

// Shared with the Bus Schedules daily-add form (js/transport.js) — one fetch
// per student, cached while the view is open.
async function _stuRpLoadParentOptions(studentId) {
  const sel = document.getElementById('stu-rp-parent');
  if (!sel) return;
  let guardians = _bsGuardiansCache[studentId];
  if (!guardians) {
    const res = await apiFetch(`${API_BASE}/students/${studentId}/guardians`);
    guardians = (res && res.ok) ? await res.json() : [];
    _bsGuardiansCache[studentId] = guardians;
  }
  sel.innerHTML = guardians.length
    ? `<option value="">Select a parent&#8230;</option>` + guardians.map(g => `<option value="${g.id}">${_esc(g.full_name)}${g.relationship?' ('+_esc(g.relationship)+')':''}</option>`).join('')
    : '<option value="">No guardians on file</option>';
}

async function _stuRpSubmitAdd() {
  const pending = window._stuRpPending;
  const msg = document.getElementById('stu-rp-add-msg');
  if (msg) msg.innerHTML = '';
  const parentId = document.getElementById('stu-rp-parent')?.value;
  if (!parentId) { if (msg) msg.innerHTML = `<p style="color:var(--coral-500,#D94040);font-size:0.85rem;margin-top:8px;">Pick a parent.</p>`; return; }
  if (!pending.routeId || !pending.direction) { if (msg) msg.innerHTML = `<p style="color:var(--coral-500,#D94040);font-size:0.85rem;margin-top:8px;">Pick a route and direction.</p>`; return; }

  // residence_source is omitted deliberately — the popover only exposes "which
  // parent", not an A/B label (the spec's own §6.3 UI has no such control), so
  // let the server's own default apply rather than fabricating a label here.
  const payload = {
    student_id: pending.studentId,
    day_of_week: pending.dayOfWeek,
    timing: pending.timing,
    parent_info_id: parseInt(parentId, 10),
    route_id: pending.routeId,
    direction: pending.direction,
  };

  const btn = document.getElementById('stu-rp-add-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  const res = await apiFetch(`${_BS_API}/residence-plans`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Add Override'; }

  if (res && res.ok) {
    document.getElementById('stu-rp-add-modal')?.remove();
    showToast('Residence override added.', 'success');
    await _stuRpReloadTab(pending.studentId);
  } else if (res) {
    if (msg) msg.innerHTML = `<p style="color:var(--coral-500,#D94040);font-size:0.85rem;margin-top:8px;">${_esc(await parseApiError(res))}</p>`;
  }
}

function _stuRpOpenRetireConfirm(studentId, planId) {
  const wrap = document.createElement('div');
  wrap.id = 'stu-rp-retire-modal';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:380px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Retire Override</h3>
      <p style="font-size:0.9rem;color:#444;">Retire this residence override? The slot will revert to the student's primary residence.</p>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('stu-rp-retire-modal').remove()">Cancel</button>
        <button class="fin-btn-teal" onclick="_stuRpRetire(${studentId},${planId})">Retire</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _stuRpRetire(studentId, planId) {
  const res = await apiFetch(`${_BS_API}/residence-plans/${planId}`, { method: 'DELETE' });
  document.getElementById('stu-rp-retire-modal')?.remove();
  if (res && (res.ok || res.status === 204)) {
    showToast('Override retired.', 'success');
    await _stuRpReloadTab(studentId);
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function _stuRpReloadTab(studentId) {
  delete _stuResidencePlansCache[studentId];
  await _stuLoadResidencePlans(studentId);
  const c = document.getElementById('stu-view-tab-content');
  if (c) c.innerHTML = _renderStuViewTab('Residence Plan', window._stuViewData || { id: studentId });
}

function _dRow(label, value) {
  return `<div class="stu-detail-row">
    <span class="stu-detail-label">${_esc(label)}</span>
    <span class="stu-detail-value">${_esc(value||'-')}</span>
  </div>`;
}

async function openFeeStatement(studentId) {
  const res = await apiFetch(`${API_BASE}/finance/statement/${studentId}`);
  if (res && res.ok) {
    const data = await res.json();
    const w = window.open('', '_blank', 'width=700,height=500');
    if (w) w.document.write(`<pre style="font-family:sans-serif;padding:20px;">${JSON.stringify(data, null, 2)}</pre>`);
  } else {
    showToast('Could not load fee statement.', 'error');
  }
}

// ==================== 4. STUDENT SEARCH (CARD GRID) ====================

let _ssData = [], _ssFiltered = [], _ssPage = 1, _ssPerPage = 12, _ssQ = '';

async function loadStudentSearchView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Search</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Search</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="ss-per-page" onchange="changeSsPerPage(this.value)">
            ${[12,25,50].map(n => `<option value="${n}"${n===_ssPerPage?' selected':''}>${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="ss-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <input type="text" class="fin-search-input" id="ss-search" placeholder="&#128269; Search&#8230;"
                 oninput="onSsSearch(this.value)">
          <button class="fin-btn-filter">&#9776; Filters</button>
        </div>
      </div>
      <div id="ss-grid"><p class="fin-loading">Loading&#8230;</p></div>
      <div id="ss-pagination"></div>
    </div>
  `;

  const res = await apiFetch(`${API_BASE}/students/`);
  if (res && res.ok) {
    _ssData = await res.json();
    _ssFiltered = [..._ssData];
    _ssPage = 1;
    _renderSsGrid();
  } else {
    document.getElementById('ss-grid').innerHTML = '<p class="fin-error">Failed to load students.</p>';
  }
}

function _renderSsGrid() {
  const totalEl = document.getElementById('ss-total');
  if (totalEl) totalEl.textContent = _ssFiltered.length;
  const start = (_ssPage - 1) * _ssPerPage;
  const paged = _ssFiltered.slice(start, start + _ssPerPage);
  const pages = Math.max(1, Math.ceil(_ssFiltered.length / _ssPerPage));

  const cards = paged.length
    ? paged.map(s => `
      <div class="stu-card" onclick="stuOpenViewFromSearch(${s.id})">
        <div class="stu-card-avatar">
          ${s.photo_url ? `<img src="${_esc(s.photo_url)}" alt="">` : '&#128100;'}
        </div>
        <div class="stu-card-name">${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}</div>
        <div class="stu-card-sub">(${_esc(s.gender||'')})</div>
        <div class="stu-card-info">&#127963; ${_esc(s.student_id||'')}</div>
        <div class="stu-card-info">&#127979; ${_esc(s.class_name||'-')} (${_esc(s.cohort||s.term||s.session||'-')})</div>
        ${s.phone ? `<div class="stu-card-info">&#128222; ${_esc(s.phone)}</div>` : ''}
        ${s.email ? `<div class="stu-card-info">&#9993; ${_esc(s.email)}</div>` : ''}
      </div>`).join('')
    : '<p class="fin-empty" style="padding:24px;">No students found.</p>';

  const gc = document.getElementById('ss-grid');
  if (gc) gc.innerHTML = `<div class="stu-cards-grid">${cards}</div>`;
  _mkPagination('ss-pagination', _ssPage, pages, 'ssGoPage');
}

function stuOpenViewFromSearch(id) {
  _currentEditStudentId = id;
  loadView('students-view');
}

function changeSsPerPage(v) { _ssPerPage = parseInt(v); _ssPage = 1; _renderSsGrid(); }
function onSsSearch(v) {
  _ssQ = v.trim().toLowerCase();
  _ssFiltered = _ssQ
    ? _ssData.filter(s =>
        (`${s.first_name} ${s.last_name}`).toLowerCase().includes(_ssQ) ||
        (s.student_id||'').toLowerCase().includes(_ssQ))
    : [..._ssData];
  _ssPage = 1;
  _renderSsGrid();
}
function ssGoPage(p) { _ssPage = p; _renderSsGrid(); }

// ==================== 5. STUDENT REPORTING ====================

let _srData = [], _srPage = 1, _srPerPage = 10, _srSearch = '';
let _srSelectedStudent = null;

async function loadStudentReportingView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Reporting</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Reporting &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="sr-per-page" onchange="changeSrPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="sr-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV">&#128202;</button>
          <button class="fin-btn-teal" onclick="loadView('student-reporting-add')">+ Add</button>
          <button class="fin-btn-outline" onclick="loadView('student-reporting-bulk')">Bulk Report</button>
          <input type="text" class="fin-search-input" id="sr-search" placeholder="&#128269; Search&#8230;"
                 oninput="onSrSearch(this.value)">
        </div>
      </div>
      <div id="sr-table-container"></div>
      <div id="sr-pagination"></div>
    </div>
  `;

  renderSkeletonRows('sr-table-container', 6);
  const res = await apiFetch(`${API_BASE}/student-reporting/`);
  if (res && res.ok) {
    _srData = await res.json();
  } else {
    _srData = studentReportingData;
  }
  _srPage = 1;
  _renderSrTable();
}

function _srFiltered() {
  if (!_srSearch) return _srData;
  const q = _srSearch;
  return _srData.filter(r =>
    (r.admission_no||r.student_id||'').toLowerCase().includes(q) ||
    (r.name||r.full_name||'').toLowerCase().includes(q)
  );
}

function _renderSrTable() {
  const filtered = _srFiltered();
  const totalEl  = document.getElementById('sr-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_srPage - 1) * _srPerPage;
  const paged = filtered.slice(start, start + _srPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _srPerPage));

  let rows = paged.length
    ? paged.map(r => `<tr>
        <td>${_esc(r.admission_no||r.student_id||'')}</td>
        <td>${_esc(r.name||r.full_name||'')}</td>
        <td>${_esc(r.term||r.session||'')}</td>
        <td>${_esc(r.class_name||'')}</td>
        <td>${_esc(r.reported_at||'')}</td>
        <td>${_esc(r.reported_by||'')}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="fin-empty">No reporting records found.</td></tr>';

  const tbl = document.getElementById('sr-table-container');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>ADMISSION NO.</th><th>NAME</th><th>TERM</th>
        <th>CLASS</th><th>REPORTED AT</th><th>REPORTED BY</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  _mkPagination('sr-pagination', _srPage, pages, 'srGoPage');
}

function changeSrPerPage(v) { _srPerPage = parseInt(v); _srPage = 1; _renderSrTable(); }
function onSrSearch(v)      { _srSearch  = v.trim().toLowerCase(); _srPage = 1; _renderSrTable(); }
function srGoPage(p)        { _srPage = p; _renderSrTable(); }

// Single reporting form
async function loadSingleReportingView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Student Reporting</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Reporting &rsaquo; Add</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:480px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:18px;">
          <label style="font-weight:600;">Admission No. <span style="color:#e74c3c">*</span></label>
          <div style="position:relative;">
            <input id="sr-add-admission" class="fin-search-input" style="width:100%!important;"
                   placeholder="Type to search student&#8230;" oninput="srAdmissionSearch(this.value)" autocomplete="off">
            <div id="sr-admission-dd" class="fin-action-dropdown" style="display:none;max-height:200px;overflow-y:auto;position:absolute;top:100%;left:0;width:100%;z-index:100;"></div>
          </div>
        </div>
        <div style="display:flex;gap:12px;">
          <button class="fin-btn-teal" onclick="submitSingleReport()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('student-reporting')">Cancel</button>
        </div>
      </div>
    </div>
  `;
  _srSelectedStudent = null;
}

async function srAdmissionSearch(val) {
  const dd = document.getElementById('sr-admission-dd');
  if (!dd) return;
  if (!val.trim()) { dd.style.display = 'none'; return; }
  const res = await apiFetch(`${API_BASE}/students/?search=${encodeURIComponent(val)}`);
  const list = (res && res.ok) ? await res.json() : [];
  if (!list.length) {
    dd.innerHTML = '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
    dd.style.display = 'block';
    return;
  }
  dd.innerHTML = list.slice(0, 10).map(s =>
    `<a href="#" onclick="srSelectStudent(${s.id},'${_esc(s.student_id||'')}','${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}');return false;">
       ${_esc(s.student_id||'')} — ${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}
     </a>`
  ).join('');
  dd.style.display = 'block';
}

function srSelectStudent(id, admNo, name) {
  _srSelectedStudent = { id, admNo, name };
  const inp = document.getElementById('sr-add-admission');
  if (inp) inp.value = `${admNo} — ${name}`;
  const dd = document.getElementById('sr-admission-dd');
  if (dd) dd.style.display = 'none';
}

async function submitSingleReport() {
  if (!_srSelectedStudent) { showToast('Please select a student.', 'error'); return; }
  const res = await apiFetch(`${API_BASE}/student-reporting/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: _srSelectedStudent.id }),
  });
  if (res && res.ok) {
    showToast('Report submitted!', 'success');
    loadView('student-reporting');
  } else {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    studentReportingData.unshift({
      admission_no: _srSelectedStudent.admNo, name: _srSelectedStudent.name,
      session: '-', class_name: '-', reported_at: now, reported_by: currentUser?.email || 'System'
    });
    showToast('Report submitted!', 'success');
    loadView('student-reporting');
  }
}

// Bulk reporting form
async function loadBulkReportingView(container) {
  let classOptions = '<option value="">Please Select</option>';
  const res = await apiFetch(`${API_BASE}/academics/classes?status=active`);
  if (res && res.ok) {
    const classes = await res.json();
    classOptions += classes.map(c => `<option value="${_esc(String(c.id))}">${_esc(c.name)}</option>`).join('');
  }

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Bulk Student Reporting</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Reporting &rsaquo; Bulk</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="max-width:320px;margin-bottom:20px;">
          <label style="font-weight:600;">Active Classes <span style="color:#e74c3c">*</span></label>
          <select id="br-class" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                  onchange="loadBulkClassStudents(this.value)">${classOptions}</select>
        </div>
        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead><tr>
              <th><input type="checkbox" id="br-select-all" onchange="toggleBrSelectAll(this)"></th>
              <th>ADMISSION NO.</th><th>NAME</th>
            </tr></thead>
            <tbody id="br-tbody">
              <tr><td colspan="3" class="fin-empty">Select a class to load students.</td></tr>
            </tbody>
          </table>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="fin-btn-teal" onclick="submitBulkReport()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('student-reporting')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function loadBulkClassStudents(classId) {
  const tbody = document.getElementById('br-tbody');
  if (!tbody || !classId) return;
  tbody.innerHTML = '<tr><td colspan="3" class="fin-loading">Loading&#8230;</td></tr>';
  const res = await apiFetch(`${API_BASE}/students/?class_id=${classId}`);
  if (!res || !res.ok) { tbody.innerHTML = '<tr><td colspan="3" class="fin-error">Error loading students.</td></tr>'; return; }
  const students = await res.json();
  if (!students.length) { tbody.innerHTML = '<tr><td colspan="3" class="fin-empty">No students in this class.</td></tr>'; return; }
  tbody.innerHTML = students.map(s => `
    <tr>
      <td><input type="checkbox" class="br-check" value="${s.id}"
          data-admno="${_esc(s.student_id||'')}" data-name="${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}" checked></td>
      <td>${_esc(s.student_id||'')}</td>
      <td>${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}</td>
    </tr>`).join('');
}

function toggleBrSelectAll(master) {
  document.querySelectorAll('.br-check').forEach(cb => cb.checked = master.checked);
}

async function submitBulkReport() {
  const checked = document.querySelectorAll('.br-check:checked');
  if (!checked.length) { showToast('No students selected.', 'error'); return; }
  const student_ids = Array.from(checked).map(cb => cb.value);
  const res = await apiFetch(`${API_BASE}/student-reporting/bulk/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_ids }),
  });
  if (res && res.ok) {
    showToast(`${checked.length} student(s) reported!`, 'success');
    loadView('student-reporting');
  } else {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    Array.from(checked).forEach(cb => {
      studentReportingData.unshift({
        admission_no: cb.dataset.admno, name: cb.dataset.name,
        session: '-', class_name: '-', reported_at: now, reported_by: currentUser?.email || 'System'
      });
    });
    showToast(`${checked.length} student(s) reported!`, 'success');
    loadView('student-reporting');
  }
}

// ==================== 7. UTILITIES — STREAMS ====================

let _strPage = 1, _strPerPage = 10;

async function loadStreamsView(container) {
  openStuUtilitiesDropdown();
  await renderSplitView({
    container,
    title: 'Streams',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Student Management',view:'students-list'},
      {label:'Streams'}
    ],
    apiUrl: `${API_BASE}/student-management/streams`,
    col1Label: 'Title', col2Label: 'Status',
    col1: s => s.title || '—',
    col2: s => (s.status === 'inactive' || s.status === 'Inactive') ? 'Inactive' : 'Active',
    rowLabel: s => s.title || '—',
    rowSub:   s => (s.status === 'inactive' || s.status === 'Inactive') ? 'Inactive' : 'Active',
    idKey: 'id',
    detailFields: [
      {label:'Title',  key:'title'},
      {label:'Notes',  key:'notes'},
      {label:'Status', key:'status', fmt: v => (v === 'inactive' || v === 'Inactive') ? 'Inactive' : 'Active'},
    ],
    renderAdd:  el => _streamSplitForm(null, el),
    renderEdit: (item, el) => _streamSplitForm(item, el),
  });
}

function _streamSplitForm(item, el) {
  const id = item?.id ?? null;
  const isEdit = !!item;
  const inactive = item?.status === 'inactive' || item?.status === 'Inactive';
  el.innerHTML = `
    <div style="max-width:460px">
      <h3 class="split-right-add-title">${isEdit ? 'Edit' : 'Add'} Stream</h3>
      <div class="stu-form-group" style="margin-bottom:16px">
        <label>Title <span style="color:var(--coral-500)">*</span></label>
        <input id="stream-title" value="${_esc(item?.title||'')}" style="max-width:none;width:100%">
      </div>
      <div class="stu-form-group" style="margin-bottom:16px">
        <label>Notes</label>
        <textarea id="stream-notes" style="width:100%;max-width:none;min-height:72px;padding:8px;border:1px solid var(--grey-200);border-radius:var(--radius-sm)">${_esc(item?.notes||'')}</textarea>
      </div>
      <div class="stu-form-group" style="margin-bottom:16px">
        <label><input type="checkbox" id="stream-deactivate"${inactive?' checked':''}> Mark as Inactive</label>
      </div>
      <div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn-primary" style="padding:9px 20px" onclick="saveStream('${id||''}')">
          ${isEdit ? 'Update' : 'Save'}
        </button>
        <button class="btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>
  `;
}

function _renderStreamsTable() {
  const totalEl = document.getElementById('str-total');
  if (totalEl) totalEl.textContent = streamsData.length;
  const start = (_strPage - 1) * _strPerPage;
  const paged = streamsData.slice(start, start + _strPerPage);
  const pages = Math.max(1, Math.ceil(streamsData.length / _strPerPage));

  let rows = paged.length
    ? paged.map(s => {
        const inactive = s.status === 'inactive' || s.status === 'Inactive';
        return `<tr>
        <td>${_esc(s.title||'')}</td>
        <td><span style="color:${inactive?'#e74c3c':'#27ae60'};font-weight:600;">${inactive?'Inactive':'Active'}</span></td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,'str-${s.id}')">&#8230;</button>
            <div id="stu-dd-str-${s.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="showStreamForm('${s.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`;
      }).join('')
    : '<tr><td colspan="3" class="fin-empty">No streams found.</td></tr>';

  const t = document.getElementById('str-table');
  if (t) t.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>TITLE</th><th>STATUS</th><th>ACTION</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  _mkPagination('str-pagination', _strPage, pages, 'strGoPage');
}
function changeStrPerPage(v) { _strPerPage = parseInt(v); _strPage = 1; _renderStreamsTable(); }
function strGoPage(p)        { _strPage = p; _renderStreamsTable(); }

function showStreamForm(id) {
  const stream = id ? streamsData.find(s => String(s.id) === String(id)) : null;
  const isEdit = !!stream;
  const main   = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit?'Edit':'Add'} Stream</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Utilities &rsaquo; Streams &rsaquo; ${isEdit?'Edit':'Add'}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:600px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Title <span style="color:#e74c3c">*</span></label>
          <input id="stream-title" class="fin-search-input" style="width:100%!important;" value="${_esc(stream?.title||'')}">
        </div>
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Notes</label>
          <textarea id="stream-notes" style="width:100%;min-height:80px;padding:8px;border:1px solid #ccc;border-radius:4px;">${_esc(stream?.notes||'')}</textarea>
        </div>
        <div class="stu-form-group" style="margin-bottom:20px;">
          <label><input type="checkbox" id="stream-deactivate"${(stream?.status==='inactive'||stream?.status==='Inactive')?' checked':''}> Deactivate/Activate</label>
        </div>
        <div style="display:flex;gap:12px;">
          <button class="fin-btn-teal" onclick="saveStream('${id||''}')">${isEdit?'Update':'Save'}</button>
          <button class="fin-btn-cancel" onclick="loadView('utilities-streams')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function saveStream(id) {
  const title = document.getElementById('stream-title')?.value.trim();
  if (!title) { showToast('Title is required.', 'error'); return; }
  const status  = _fc('stream-deactivate') ? 'inactive' : 'active';
  const payload = { title, notes: _fv('stream-notes'), status };
  const url     = id ? `${API_BASE}/student-management/streams/${id}` : `${API_BASE}/student-management/streams/`;
  const method  = id ? 'PATCH' : 'POST';
  const res     = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    showToast(id ? 'Stream updated!' : 'Stream added!', 'success');
    loadView('utilities-streams');
  } else {
    showToast(res ? await parseApiError(res) : 'Could not save stream.', 'error');
  }
}

// ==================== 8. UTILITIES — FUNDING SOURCES ====================

let _fsPage = 1, _fsPerPage = 10;

async function loadFundingSourcesView(container) {
  openStuUtilitiesDropdown();
  await renderSplitView({
    container,
    title: 'Funding Sources',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Student Management',view:'students-list'},
      {label:'Funding Sources'}
    ],
    apiUrl: `${API_BASE}/student-management/funding-sources/`,
    col1Label: 'Title', col2Label: 'Status',
    col1: f => f.title || '—',
    col2: f => f.status === 'inactive' ? 'Inactive' : 'Active',
    rowLabel: f => f.title || '—',
    rowSub:   f => f.status === 'inactive' ? 'Inactive' : 'Active',
    idKey: 'id',
    detailFields: [
      {label:'Title',  key:'title'},
      {label:'Status', key:'status', fmt: v => v === 'inactive' ? 'Inactive' : 'Active'},
    ],
    renderAdd:  el => _fsSplitForm(null, el),
    renderEdit: (item, el) => _fsSplitForm(item, el),
  });
}

function _fsSplitForm(item, el) {
  const id = item?.id ?? null;
  const isEdit = !!item;
  el.innerHTML = `
    <div style="max-width:460px">
      <h3 class="split-right-add-title">${isEdit ? 'Edit' : 'Add'} Funding Source</h3>
      <div class="stu-form-group" style="margin-bottom:16px">
        <label>Title <span style="color:var(--coral-500)">*</span></label>
        <input id="fs-title" value="${_esc(item?.title||'')}" style="max-width:none;width:100%">
      </div>
      ${isEdit ? `<div class="stu-form-group" style="margin-bottom:16px">
        <label><input type="checkbox" id="fs-deactivate"${item?.status==='inactive'?' checked':''}> Mark as Inactive</label>
      </div>` : ''}
      <div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn-primary" style="padding:9px 20px" onclick="saveFundingSource('${id||''}')">
          ${isEdit ? 'Update' : 'Save'}
        </button>
        <button class="btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>
  `;
}

function _renderFsTable() {
  const totalEl = document.getElementById('fs-total');
  if (totalEl) totalEl.textContent = fundingSourcesData.length;
  const start = (_fsPage - 1) * _fsPerPage;
  const paged = fundingSourcesData.slice(start, start + _fsPerPage);
  const pages = Math.max(1, Math.ceil(fundingSourcesData.length / _fsPerPage));

  let rows = paged.length
    ? paged.map(f => `<tr>
        <td>${_esc(f.title||'')}</td>
        <td><span style="color:${f.status==='inactive'?'#e74c3c':'#27ae60'};font-weight:600;">${f.status==='inactive'?'Inactive':'Active'}</span></td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,'fs-${f.id}')">&#8230;</button>
            <div id="stu-dd-fs-${f.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="showFundingSourceForm('${f.id}');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="fin-empty">No funding sources found.</td></tr>';

  const t = document.getElementById('fs-table');
  if (t) t.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>TITLE</th><th>STATUS</th><th>ACTION</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  _mkPagination('fs-pagination', _fsPage, pages, 'fsGoPage');
}
function changeFsPerPage(v) { _fsPerPage = parseInt(v); _fsPage = 1; _renderFsTable(); }
function fsGoPage(p)        { _fsPage = p; _renderFsTable(); }

function showFundingSourceForm(id) {
  const item   = id ? fundingSourcesData.find(f => String(f.id) === String(id)) : null;
  const isEdit = !!item;
  const main   = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit?'Edit':'Add'} Funding Source</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Utilities &rsaquo; Funding Sources &rsaquo; ${isEdit?'Edit':'Add'}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:600px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Title <span style="color:#e74c3c">*</span></label>
          <input id="fs-title" class="fin-search-input" style="width:100%!important;" value="${_esc(item?.title||'')}">
        </div>
        ${isEdit ? `<div class="stu-form-group" style="margin-bottom:20px;">
          <label><input type="checkbox" id="fs-deactivate"${item?.status==='inactive'?' checked':''}> Deactivate/Activate</label>
        </div>` : ''}
        <div style="display:flex;gap:12px;">
          <button class="fin-btn-teal" onclick="saveFundingSource('${id||''}')">${isEdit?'Update':'Save'}</button>
          <button class="fin-btn-cancel" onclick="loadView('utilities-funding-sources')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function saveFundingSource(id) {
  const title = document.getElementById('fs-title')?.value.trim();
  if (!title) { showToast('Title is required.', 'error'); return; }
  const payload = { title, status: (id && _fc('fs-deactivate')) ? 'inactive' : 'active' };
  const url     = id ? `${API_BASE}/student-management/funding-sources/${id}` : `${API_BASE}/student-management/funding-sources/`;
  const method  = id ? 'PATCH' : 'POST';
  const res     = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    showToast(id ? 'Funding source updated!' : 'Funding source added!', 'success');
    loadView('utilities-funding-sources');
  } else {
    const item = { id: id || ('fs_' + Date.now()), ...payload };
    if (id) { const idx = fundingSourcesData.findIndex(f => String(f.id) === String(id)); if (idx !== -1) fundingSourcesData[idx] = item; }
    else    { fundingSourcesData.push(item); }
    showToast(id ? 'Funding source updated!' : 'Funding source added!', 'success');
    loadView('utilities-funding-sources');
  }
}

// ==================== 8b. UTILITIES — SPORTS HOUSES ====================
// A Sports House is linked to either a Level (applies to every class in that level)
// or one specific Class — never both. That link (level_id / class_id on the house
// record) is what makes it show up in the student form's Sports House dropdown;
// matching names alone does not create the association.

let sportsHousesData = [];
let _shPage = 1, _shPerPage = 10;
let _shLevelsCache = null, _shClassesCache = null;

async function loadSportsHousesView(container) {
  openStuUtilitiesDropdown();
  await _stuLoadShLookups();
  await renderSplitView({
    container,
    title: 'Sports Houses',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Student Management',view:'students-list'},
      {label:'Sports Houses'}
    ],
    apiUrl: `${API_BASE}/student-management/sports-houses/`,
    col1Label: 'Name', col2Label: 'Assigned To',
    col1: h => h.name || '—',
    col2: h => _shScopePlain(h),
    rowLabel: h => h.name || '—',
    rowSub:   h => _shScopePlain(h),
    idKey: 'id',
    detailFields: [
      {label:'Name',        key:'name'},
      {label:'Assigned To', key:'level_id', fmt: (v, h) => _shScopePlain(h)},
    ],
    renderAdd:  el => _shSplitForm(null, el),
    renderEdit: (item, el) => _shSplitForm(item, el),
  });
}

function _shScopePlain(h) {
  if (h.level_id) {
    const lvl = (_shLevelsCache || []).find(l => String(l.id) === String(h.level_id));
    return `Level: ${lvl ? academicLevelDisplayName(lvl) : `#${h.level_id}`}`;
  }
  if (h.class_id) {
    const cls = (_shClassesCache || []).find(c => String(c.id) === String(h.class_id));
    return `Class: ${cls ? cls.name : `#${h.class_id}`}`;
  }
  return 'Unassigned';
}

function _shSplitForm(item, el) {
  const id = item?.id ?? null;
  const isEdit = !!item;
  const scope = item?.level_id ? 'level' : (item?.class_id ? 'class' : 'level');
  el.innerHTML = `
    <div style="max-width:480px">
      <h3 class="split-right-add-title">${isEdit ? 'Edit' : 'Add'} Sports House</h3>
      <div class="stu-form-group" style="margin-bottom:16px">
        <label>Name <span style="color:var(--coral-500)">*</span></label>
        <input id="sh-name" value="${_esc(item?.name||'')}" style="max-width:none;width:100%">
      </div>
      <div class="stu-form-group" style="margin-bottom:10px">
        <label style="font-weight:600">Assign To</label>
        <div style="display:flex;gap:20px;margin-top:6px">
          <label><input type="radio" name="sh-scope" value="level"${scope==='level'?' checked':''} onchange="_shToggleScope()"> Whole Level</label>
          <label><input type="radio" name="sh-scope" value="class"${scope==='class'?' checked':''} onchange="_shToggleScope()"> Specific Class</label>
        </div>
      </div>
      <div class="stu-form-group" id="sh-level-wrap" style="margin-bottom:16px;display:${scope==='level'?'block':'none'}">
        <label>Level of Academics</label>
        <select id="sh-level" style="max-width:none;width:100%">
          <option value="">Please Select</option>
          ${(_shLevelsCache||[]).map(l=>`<option value="${l.id}"${String(item?.level_id)===String(l.id)?' selected':''}>${_esc(academicLevelDisplayName(l))}</option>`).join('')}
        </select>
      </div>
      <div class="stu-form-group" id="sh-class-wrap" style="margin-bottom:16px;display:${scope==='class'?'block':'none'}">
        <label>Class</label>
        <select id="sh-class" style="max-width:none;width:100%">
          <option value="">Please Select</option>
          ${(_shClassesCache||[]).map(c=>`<option value="${c.id}"${String(item?.class_id)===String(c.id)?' selected':''}>${_esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn-primary" style="padding:9px 20px" onclick="saveSportsHouse('${id||''}')">
          ${isEdit ? 'Update' : 'Save'}
        </button>
        <button class="btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
        ${isEdit ? `<button class="btn-danger" style="margin-left:auto" onclick="deleteSportsHouse('${id}')">Delete</button>` : ''}
      </div>
    </div>
  `;
}

async function _stuLoadShLookups() {
  if (!_shLevelsCache) {
    const res = await apiFetch(`${API_BASE}/academic-levels/`);
    const raw = res && res.ok ? await res.json() : [];
    _shLevelsCache = Array.isArray(raw) ? raw : (raw.data || raw.items || raw.results || []);
  }
  if (!_shClassesCache) {
    const res = await apiFetch(`${API_BASE}/classes/`);
    const raw = res && res.ok ? await res.json() : [];
    _shClassesCache = Array.isArray(raw) ? raw : (raw.data || raw.items || raw.results || []);
  }
}

function _shScopeLabel(h) {
  if (h.level_id) {
    const lvl = (_shLevelsCache || []).find(l => String(l.id) === String(h.level_id));
    return `Level: ${_esc(lvl ? academicLevelDisplayName(lvl) : `#${h.level_id}`)}`;
  }
  if (h.class_id) {
    const cls = (_shClassesCache || []).find(c => String(c.id) === String(h.class_id));
    return `Class: ${_esc(cls ? cls.name : `#${h.class_id}`)}`;
  }
  return '<span style="color:#e74c3c;">Unassigned</span>';
}

function _renderSportsHousesTable() {
  const totalEl = document.getElementById('sh-total');
  if (totalEl) totalEl.textContent = sportsHousesData.length;
  const start = (_shPage - 1) * _shPerPage;
  const paged = sportsHousesData.slice(start, start + _shPerPage);
  const pages = Math.max(1, Math.ceil(sportsHousesData.length / _shPerPage));

  let rows = paged.length
    ? paged.map(h => `<tr>
        <td>${_esc(h.name||'')}</td>
        <td>${_shScopeLabel(h)}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,'sh-${h.id}')">&#8230;</button>
            <div id="stu-dd-sh-${h.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="showSportsHouseForm('${h.id}');return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteSportsHouse('${h.id}');return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="fin-empty">No sports houses found.</td></tr>';

  const t = document.getElementById('sh-table');
  if (t) t.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>NAME</th><th>ASSIGNED TO</th><th>ACTION</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  _mkPagination('sh-pagination', _shPage, pages, 'shGoPage');
}
function changeShPerPage(v) { _shPerPage = parseInt(v); _shPage = 1; _renderSportsHousesTable(); }
function shGoPage(p)        { _shPage = p; _renderSportsHousesTable(); }

function showSportsHouseForm(id) {
  const house  = id ? sportsHousesData.find(h => String(h.id) === String(id)) : null;
  const isEdit = !!house;
  const scope  = house?.level_id ? 'level' : (house?.class_id ? 'class' : 'level');
  const main   = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit?'Edit':'Add'} Sports House</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Utilities &rsaquo; Sports Houses &rsaquo; ${isEdit?'Edit':'Add'}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:600px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-group" style="margin-bottom:16px;">
          <label style="font-weight:600;">Name <span style="color:#e74c3c">*</span></label>
          <input id="sh-name" class="fin-search-input" style="width:100%!important;" value="${_esc(house?.name||'')}">
        </div>
        <div class="stu-form-group" style="margin-bottom:10px;">
          <label style="font-weight:600;">Assign To</label>
          <div style="display:flex;gap:20px;margin-top:6px;">
            <label class="stu-checkbox-row"><input type="radio" name="sh-scope" value="level"${scope==='level'?' checked':''} onchange="_shToggleScope()"> Whole Level</label>
            <label class="stu-checkbox-row"><input type="radio" name="sh-scope" value="class"${scope==='class'?' checked':''} onchange="_shToggleScope()"> Specific Class</label>
          </div>
        </div>
        <div class="stu-form-group" id="sh-level-wrap" style="margin-bottom:16px;display:${scope==='level'?'block':'none'};">
          <label>Level of Academics</label>
          <select id="sh-level" class="fin-search-input" style="width:100%!important;">
            <option value="">Please Select</option>
            ${(_shLevelsCache||[]).map(l => `<option value="${l.id}"${String(house?.level_id)===String(l.id)?' selected':''}>${_esc(academicLevelDisplayName(l))}</option>`).join('')}
          </select>
        </div>
        <div class="stu-form-group" id="sh-class-wrap" style="margin-bottom:16px;display:${scope==='class'?'block':'none'};">
          <label>Class</label>
          <select id="sh-class" class="fin-search-input" style="width:100%!important;">
            <option value="">Please Select</option>
            ${(_shClassesCache||[]).map(c => `<option value="${c.id}"${String(house?.class_id)===String(c.id)?' selected':''}>${_esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:12px;">
          <button class="fin-btn-teal" onclick="saveSportsHouse('${id||''}')">${isEdit?'Update':'Save'}</button>
          <button class="fin-btn-cancel" onclick="loadView('utilities-sports-houses')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function _shToggleScope() {
  const scope = document.querySelector('input[name="sh-scope"]:checked')?.value;
  const levelWrap = document.getElementById('sh-level-wrap');
  const classWrap = document.getElementById('sh-class-wrap');
  if (levelWrap) levelWrap.style.display = scope === 'level' ? 'block' : 'none';
  if (classWrap) classWrap.style.display = scope === 'class' ? 'block' : 'none';
}

async function saveSportsHouse(id) {
  const name = document.getElementById('sh-name')?.value.trim();
  if (!name) { showToast('Name is required.', 'error'); return; }
  const scope = document.querySelector('input[name="sh-scope"]:checked')?.value;
  const levelId = scope === 'level' ? _fv('sh-level') : '';
  const classId = scope === 'class' ? _fv('sh-class') : '';
  if (scope === 'level' && !levelId) { showToast('Please select a Level.', 'error'); return; }
  if (scope === 'class' && !classId) { showToast('Please select a Class.', 'error'); return; }

  const payload = {
    name,
    level_id: levelId ? Number(levelId) : null,
    class_id: classId ? Number(classId) : null,
  };
  const url    = id ? `${API_BASE}/student-management/sports-houses/${id}` : `${API_BASE}/student-management/sports-houses/`;
  const method = id ? 'PATCH' : 'POST';
  const res    = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    showToast(id ? 'Sports house updated!' : 'Sports house added!', 'success');
    loadView('utilities-sports-houses');
  } else {
    showToast(res ? await parseApiError(res) : 'Could not save sports house.', 'error');
  }
}

async function deleteSportsHouse(id) {
  if (!confirm('Delete this sports house?')) return;
  const res = await apiFetch(`${API_BASE}/student-management/sports-houses/${id}`, { method: 'DELETE' });
  if (res && (res.ok || res.status === 204)) {
    showToast('Sports house deleted.', 'success');
    loadView('utilities-sports-houses');
  } else {
    showToast(res ? await parseApiError(res) : 'Could not delete sports house.', 'error');
  }
}

// ==================== 9. UTILITIES — STREAM ASSIGNMENT ====================
// Inline editing table: change a student's Class and/or Stream (A/B) and batch-save.
// All edits are staged locally until "Save Changes" is clicked.
// No bulk PUT endpoint exists — each student gets a separate PUT /students/{id} call.
// Suggested backend enhancement: POST /students/bulk-update-stream for efficiency.

let _saClasses       = [];   // cached from GET /classes/ — shared with Window 10
let _saStudents      = [];
let _saDirtyRows     = {};   // { [studentId]: { class_id?: number, stream_id?: string|null } }
let _saSearchResults = [];   // temp store for name-search suggestion list
let _saPage = 1, _saPerPage = 10;

async function loadStreamAssignmentView(container) {
  openStuUtilitiesDropdown();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Stream Assignment</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Stream Assignment &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row" style="flex-wrap:wrap;gap:12px;align-items:flex-end;">
        <div class="fin-controls-left" style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
          <div class="stu-form-group" style="min-width:200px;">
            <label style="font-size:0.82rem;font-weight:500;color:#444;">Class</label>
            <select id="sa-class-filter" class="fin-search-input"
                    style="padding:7px 10px!important;"
                    onchange="saOnClassChange(this.value)">
              <option value="">Please Select</option>
            </select>
          </div>
          <div class="stu-form-group" style="min-width:220px;position:relative;">
            <label style="font-size:0.82rem;font-weight:500;color:#444;">Student Name</label>
            <input id="sa-name-input" type="text" class="fin-search-input"
                   placeholder="Search student by name…" autocomplete="off"
                   oninput="saOnNameSearch(this.value)"
                   onblur="setTimeout(function(){var d=document.getElementById('sa-name-dd');if(d)d.style.display='none';},200)">
            <div id="sa-name-dd" class="fin-action-dropdown"
                 style="display:none;top:100%;z-index:500;min-width:280px;max-height:220px;overflow-y:auto;position:absolute;"></div>
          </div>
          <button class="fin-btn-cancel" style="margin-bottom:2px;" onclick="saClearFilters()">Clear</button>
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-teal" onclick="saveStreamAssignmentChanges()">Save Changes</button>
        </div>
      </div>
      <div class="fin-controls-row" style="padding-top:0;">
        <div class="fin-controls-left">
          Show <select id="sa-per-page" onchange="saChangePerPage(this.value)">
            ${[10,25,50].map(n=>`<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="sa-total">0</span> entries
        </div>
      </div>
      <div id="sa-table"></div>
      <div id="sa-pagination"></div>
    </div>
  `;

  renderSkeletonRows('sa-table', 6);
  const res = await apiFetch(`${API_BASE}/classes/`);
  _saClasses = (res && res.ok) ? _toArray(await res.json()) : [];

  const sel = document.getElementById('sa-class-filter');
  if (sel) {
    sel.innerHTML = '<option value="">Please Select</option>' +
      _saClasses.map(c => `<option value="${_esc(String(c.id))}">${_esc(c.name)}</option>`).join('');
  }

  _saPage = 1;
  _saDirtyRows = {};
  _saStudents = [];
  _renderSaEmptyState();
}

function _renderSaEmptyState() {
  const totalEl = document.getElementById('sa-total');
  if (totalEl) totalEl.textContent = '0';
  const t = document.getElementById('sa-table');
  if (t) t.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr>
      <th>STUDENT NAME</th><th>STUDENT ID</th><th>CLASS</th><th>CLASS CODE</th>
      <th style="text-align:center;">A</th><th style="text-align:center;">B</th>
    </tr></thead>
    <tbody><tr><td colspan="6" class="fin-empty">Select a Class or search for a student to begin.</td></tr></tbody>
  </table></div>`;
  const pg = document.getElementById('sa-pagination');
  if (pg) pg.innerHTML = '';
}

async function saOnClassChange(classId) {
  const inp = document.getElementById('sa-name-input');
  if (inp) inp.value = '';
  const dd = document.getElementById('sa-name-dd');
  if (dd) dd.style.display = 'none';

  if (!classId) {
    _saStudents = [];
    _saDirtyRows = {};
    _renderSaEmptyState();
    return;
  }

  renderSkeletonRows('sa-table', 6);
  const res = await apiFetch(`${API_BASE}/students/?class_id=${classId}`);
  _saStudents = (res && res.ok) ? _toArray(await res.json()) : [];
  _saPage = 1;
  _saDirtyRows = {};
  _renderSaTable();
}

let _saSearchTimer = null;
function saOnNameSearch(val) {
  clearTimeout(_saSearchTimer);
  const dd = document.getElementById('sa-name-dd');
  if (!val.trim()) { if (dd) dd.style.display = 'none'; return; }
  _saSearchTimer = setTimeout(async function() {
    const res = await apiFetch(`${API_BASE}/students/?search=${encodeURIComponent(val.trim())}`);
    _saSearchResults = (res && res.ok) ? _toArray(await res.json()) : [];
    if (!dd) return;
    if (!_saSearchResults.length) {
      dd.innerHTML = '<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>';
      dd.style.display = 'block';
      return;
    }
    dd.innerHTML = _saSearchResults.slice(0, 10).map(function(s, i) {
      var name = _esc((s.first_name||'') + ' ' + (s.last_name||'')).trim();
      return '<a href="#" onclick="saSelectStudent(' + i + ');return false;">' + _esc(s.student_id||'') + ' — ' + name + '</a>';
    }).join('');
    dd.style.display = 'block';
  }, 300);
}

function saSelectStudent(idx) {
  var s = _saSearchResults[idx];
  if (!s) return;
  var inp = document.getElementById('sa-name-input');
  if (inp) inp.value = (s.student_id||'') + ' — ' + ((s.first_name||'') + ' ' + (s.last_name||'')).trim();
  var dd = document.getElementById('sa-name-dd');
  if (dd) dd.style.display = 'none';
  // Student name takes precedence — clear class filter
  var classSel = document.getElementById('sa-class-filter');
  if (classSel) classSel.value = '';
  _saStudents = [s];
  _saPage = 1;
  _saDirtyRows = {};
  _renderSaTable();
}

function saClearFilters() {
  var classSel = document.getElementById('sa-class-filter');
  if (classSel) classSel.value = '';
  var inp = document.getElementById('sa-name-input');
  if (inp) inp.value = '';
  var dd = document.getElementById('sa-name-dd');
  if (dd) dd.style.display = 'none';
  _saStudents = [];
  _saDirtyRows = {};
  _renderSaEmptyState();
}

function saChangePerPage(v) { _saPerPage = parseInt(v); _saPage = 1; _renderSaTable(); }
function saGoPage(p)         { _saPage = p; _renderSaTable(); }

function _renderSaTable() {
  var totalEl = document.getElementById('sa-total');
  if (totalEl) totalEl.textContent = _saStudents.length;

  var start = (_saPage - 1) * _saPerPage;
  var paged = _saStudents.slice(start, start + _saPerPage);
  var pages = Math.max(1, Math.ceil(_saStudents.length / _saPerPage));

  var rows = '';
  if (!paged.length) {
    rows = '<tr><td colspan="6" class="fin-empty">No students found.</td></tr>';
  } else {
    rows = paged.map(function(s) {
      var dirty = !!_saDirtyRows[s.id];
      var rowStyle = dirty ? 'background:#fffbe6;' : '';

      var stagedClassId = _saDirtyRows[s.id] && _saDirtyRows[s.id].class_id !== undefined
        ? _saDirtyRows[s.id].class_id : undefined;
      var currentClassId = stagedClassId !== undefined ? stagedClassId : s.class_id;
      var cls = _saClasses.find(function(c) { return String(c.id) === String(currentClassId); });
      var classCode = cls ? (cls.code || cls.class_code || '') : '';

      var stagedStreamId = _saDirtyRows[s.id] && 'stream_id' in _saDirtyRows[s.id]
        ? _saDirtyRows[s.id].stream_id : undefined;
      var currentStreamId = stagedStreamId !== undefined
        ? stagedStreamId
        : (s.stream_id || s.stream || null);
      var checkedA = String(currentStreamId) === 'A' ? 'checked' : '';
      var checkedB = String(currentStreamId) === 'B' ? 'checked' : '';

      var dirtyBadge = dirty
        ? ' <span style="color:#e67e22;font-size:0.78rem;" title="Unsaved changes">*</span>'
        : '';

      return '<tr style="' + rowStyle + '">'
        + '<td>' + _esc((s.first_name||'') + ' ' + (s.last_name||'')).trim() + dirtyBadge + '</td>'
        + '<td>' + _esc(s.student_id||'') + '</td>'
        + '<td>'
        +   '<select class="fin-search-input" style="padding:5px 8px!important;min-width:140px;" onchange="saOnClassRowChange(' + s.id + ',this.value)">'
        +     '<option value="">— Select —</option>'
        +     _saClasses.map(function(c) {
                return '<option value="' + _esc(String(c.id)) + '"'
                  + (String(c.id) === String(currentClassId) ? ' selected' : '')
                  + '>' + _esc(c.name) + '</option>';
              }).join('')
        +   '</select>'
        + '</td>'
        + '<td id="sa-code-' + s.id + '">' + _esc(classCode) + '</td>'
        + '<td style="text-align:center;">'
        +   '<input type="checkbox" id="sa-chk-' + s.id + '-A" ' + checkedA
        +   ' onchange="saOnStreamCheck(' + s.id + ',\'A\',this.checked)"'
        +   ' style="width:auto;max-width:none;accent-color:#00b5b8;cursor:pointer;">'
        + '</td>'
        + '<td style="text-align:center;">'
        +   '<input type="checkbox" id="sa-chk-' + s.id + '-B" ' + checkedB
        +   ' onchange="saOnStreamCheck(' + s.id + ',\'B\',this.checked)"'
        +   ' style="width:auto;max-width:none;accent-color:#00b5b8;cursor:pointer;">'
        + '</td>'
        + '</tr>';
    }).join('');
  }

  var t = document.getElementById('sa-table');
  if (t) t.innerHTML = '<div class="fin-table-wrap"><table class="fin-table">'
    + '<thead><tr>'
    + '<th>STUDENT NAME</th><th>STUDENT ID</th><th>CLASS</th><th>CLASS CODE</th>'
    + '<th style="text-align:center;">A</th><th style="text-align:center;">B</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div>';

  _mkPagination('sa-pagination', _saPage, pages, 'saGoPage');
}

function saOnClassRowChange(studentId, newClassId) {
  var cls = _saClasses.find(function(c) { return String(c.id) === String(newClassId); });
  var codeEl = document.getElementById('sa-code-' + studentId);
  if (codeEl) codeEl.textContent = cls ? (cls.code || cls.class_code || '') : '';
  if (!_saDirtyRows[studentId]) _saDirtyRows[studentId] = {};
  _saDirtyRows[studentId].class_id = newClassId ? parseInt(newClassId) : null;
  _saMarkDirtyRow(studentId);
}

function saOnStreamCheck(studentId, stream, checked) {
  // Mutually exclusive: checking A unchecks B and vice versa (radio-like behaviour using checkboxes)
  var sibling = stream === 'A' ? 'B' : 'A';
  var sibEl = document.getElementById('sa-chk-' + studentId + '-' + sibling);
  if (checked && sibEl) sibEl.checked = false;
  if (!_saDirtyRows[studentId]) _saDirtyRows[studentId] = {};
  // null = neither stream checked (valid: student has no stream assigned)
  _saDirtyRows[studentId].stream_id = checked ? stream : null;
  _saMarkDirtyRow(studentId);
}

function _saMarkDirtyRow(studentId) {
  // Lightweight DOM update: set row background and asterisk without full re-render,
  // preserving staged checkbox/dropdown state already in the DOM.
  var start = (_saPage - 1) * _saPerPage;
  var paged = _saStudents.slice(start, start + _saPerPage);
  var idx = paged.findIndex(function(s) { return String(s.id) === String(studentId); });
  if (idx === -1) return;
  var tbody = document.querySelector('#sa-table table tbody');
  if (!tbody) return;
  var tr = tbody.querySelectorAll('tr')[idx];
  if (!tr) return;
  tr.style.background = '#fffbe6';
  var nameCell = tr.cells[0];
  if (!nameCell) return;
  var s = paged[idx];
  var baseName = _esc((s.first_name||'') + ' ' + (s.last_name||'')).trim();
  nameCell.innerHTML = baseName + ' <span style="color:#e67e22;font-size:0.78rem;" title="Unsaved changes">*</span>';
}

async function saveStreamAssignmentChanges() {
  var changed = Object.entries(_saDirtyRows);
  if (!changed.length) { showToast('No changes to save.', 'info'); return; }

  var btn = document.querySelector('[onclick="saveStreamAssignmentChanges()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  var succeeded = 0;
  var failedNames = [];

  await Promise.all(changed.map(async function(entry) {
    var studentId = entry[0], changes = entry[1];
    var payload = {};
    if ('class_id' in changes) payload.class_id = changes.class_id;
    if ('stream_id' in changes) payload.stream_id = changes.stream_id;
    var res = await apiFetch(API_BASE + '/students/' + studentId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res && res.ok) {
      succeeded++;
      delete _saDirtyRows[studentId];
      var s = _saStudents.find(function(x) { return String(x.id) === String(studentId); });
      if (s) {
        if ('class_id' in changes) s.class_id = changes.class_id;
        if ('stream_id' in changes) { s.stream_id = changes.stream_id; s.stream = changes.stream_id; }
      }
    } else {
      var s2 = _saStudents.find(function(x) { return String(x.id) === String(studentId); });
      failedNames.push(s2 ? ((s2.first_name||'') + ' ' + (s2.last_name||'')).trim() : 'Student #' + studentId);
    }
  }));

  if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }

  if (!failedNames.length) {
    showToast(succeeded + ' student' + (succeeded !== 1 ? 's' : '') + ' updated successfully.', 'success');
  } else {
    var msg = succeeded
      ? (succeeded + ' updated. Failed: ' + failedNames.join(', ') + '.')
      : ('Save failed for: ' + failedNames.join(', ') + '.');
    showToast(msg, succeeded ? 'warning' : 'error');
  }
  _renderSaTable();
}

// ==================== 10. UTILITIES — EXTRA CURRICULAR ACTIVITY ASSIGNMENT ====================
// Backed by the dedicated grid API: GET /extra-curricular/assignments?term_id=&class_id=
// returns { term_id, fee_items: [{id,name,default_amount}], students: [{student_id,student_name,
// student_code, enrollments: {<fee_item_id>: bool}}] } in one call, and
// POST /extra-curricular/bulk-assign ({term_id, assignments: [{student_id,fee_item_id,is_enrolled}]})
// saves every changed cell in a single request. Fee items are pre-filtered server-side
// (FeeItem.is_extra_curricular) so the frontend doesn't need to know which accounts/items
// are "extra curricular" — the grid only ever shows the relevant columns.

let _ecTerms      = [];   // from GET /terms/
let _ecTermId     = null; // grid is scoped to exactly one term at a time
let _ecFeeItems   = [];   // [{id, name, default_amount}] — dynamic table columns
let _ecStudents   = [];   // [{student_id, student_name, student_code, enrollments: {feeItemId: bool}}]
let _ecDirtyRows  = {};   // { [studentId]: { [feeItemId]: bool } } — only changed cells
let _ecNameFilter = '';
let _ecPage = 1, _ecPerPage = 10;

async function loadExtraCurricularAssignmentView(container) {
  openStuUtilitiesDropdown();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Extra Curricular Activity Assignment</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Extra Curricular Activity Assignment &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row" style="flex-wrap:wrap;gap:12px;align-items:flex-end;">
        <div class="fin-controls-left" style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
          <div class="stu-form-group" style="min-width:200px;">
            <label style="font-size:0.82rem;font-weight:500;color:#444;">Term <span style="color:#e74c3c">*</span></label>
            <select id="ec-term-filter" class="fin-search-input"
                    style="padding:7px 10px!important;"
                    onchange="ecOnTermFilterChange(this.value)">
              <option value="">Please Select</option>
            </select>
          </div>
          <div class="stu-form-group" style="min-width:200px;">
            <label style="font-size:0.82rem;font-weight:500;color:#444;">Class</label>
            <select id="ec-class-filter" class="fin-search-input"
                    style="padding:7px 10px!important;"
                    onchange="ecOnClassChange(this.value)">
              <option value="">All Classes</option>
            </select>
          </div>
          <div class="stu-form-group" style="min-width:220px;">
            <label style="font-size:0.82rem;font-weight:500;color:#444;">Student Name</label>
            <input id="ec-name-input" type="text" class="fin-search-input"
                   placeholder="Filter loaded students…" autocomplete="off"
                   oninput="ecOnNameFilter(this.value)">
          </div>
          <button class="fin-btn-cancel" style="margin-bottom:2px;" onclick="ecClearFilters()">Clear</button>
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-teal" onclick="saveEcAssignmentChanges()">Save Changes</button>
        </div>
      </div>
      <div class="fin-controls-row" style="padding-top:0;">
        <div class="fin-controls-left">
          Show <select id="ec-per-page" onchange="ecChangePerPage(this.value)">
            ${[10,25,50].map(n=>`<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="ec-total">0</span> entries
        </div>
      </div>
      <div id="ec-table"></div>
      <div id="ec-pagination"></div>
    </div>
  `;

  renderSkeletonRows('ec-table', 5);
  var results = await Promise.all([
    apiFetch(API_BASE + '/classes/'),
    apiFetch(API_BASE + '/terms/'),
  ]);
  var classRes = results[0], termRes = results[1];
  // Update shared class cache (also used by Stream Assignment)
  if (classRes && classRes.ok) _saClasses = _toArray(await classRes.json());
  _ecTerms = (termRes && termRes.ok) ? _toArray(await termRes.json()) : [];

  var classSel = document.getElementById('ec-class-filter');
  if (classSel) {
    classSel.innerHTML = '<option value="">All Classes</option>' +
      _saClasses.map(function(c) {
        return '<option value="' + _esc(String(c.id)) + '">' + _esc(c.name) + '</option>';
      }).join('');
  }

  var defaultTerm = _ecTerms.find(function(t) { return t.is_current || t.is_active || t.current; }) || _ecTerms[0];
  var termSel = document.getElementById('ec-term-filter');
  if (termSel) {
    termSel.innerHTML = '<option value="">Please Select</option>' +
      _ecTerms.map(function(t) {
        return '<option value="' + _esc(String(t.id)) + '"' + (defaultTerm && t.id === defaultTerm.id ? ' selected' : '') + '>' + _esc(t.name||t.title||'') + '</option>';
      }).join('');
  }

  _ecPage = 1;
  _ecDirtyRows = {};
  _ecStudents = [];
  _ecFeeItems = [];
  _ecNameFilter = '';

  if (defaultTerm) {
    _ecTermId = defaultTerm.id;
    await ecLoadGrid();
  } else {
    _renderEcEmptyState('Please set up an academic term before assigning extra-curricular activities.');
  }
}

function _renderEcEmptyState(message) {
  var totalEl = document.getElementById('ec-total');
  if (totalEl) totalEl.textContent = '0';
  var t = document.getElementById('ec-table');
  if (t) t.innerHTML = '<div class="fin-table-wrap"><table class="fin-table">'
    + '<thead><tr><th>STUDENT NAME</th><th>STUDENT ID</th></tr></thead>'
    + '<tbody><tr><td colspan="2" class="fin-empty">' + _esc(message || 'Select a Term to begin.') + '</td></tr></tbody>'
    + '</table></div>';
  var pg = document.getElementById('ec-pagination');
  if (pg) pg.innerHTML = '';
}

async function ecLoadGrid() {
  if (!_ecTermId) { _renderEcEmptyState(); return; }
  renderSkeletonRows('ec-table', 4 + _ecFeeItems.length);
  var classId = document.getElementById('ec-class-filter')?.value || '';
  var qs = 'term_id=' + encodeURIComponent(_ecTermId) + (classId ? '&class_id=' + encodeURIComponent(classId) : '');
  var res = await apiFetch(API_BASE + '/extra-curricular/assignments?' + qs);
  if (!res || !res.ok) {
    _ecFeeItems = []; _ecStudents = [];
    _renderEcEmptyState('Could not load assignments for this term.');
    return;
  }
  var data = await res.json();
  _ecFeeItems = data.fee_items || [];
  _ecStudents = data.students || [];
  _ecPage = 1;
  _ecDirtyRows = {};
  _renderEcTable();
}

async function ecOnTermFilterChange(termId) {
  _ecTermId = termId ? parseInt(termId) : null;
  await ecLoadGrid();
}

async function ecOnClassChange(classId) {
  await ecLoadGrid();
}

function ecOnNameFilter(val) {
  _ecNameFilter = val.trim().toLowerCase();
  _ecPage = 1;
  _renderEcTable();
}

function ecClearFilters() {
  var classSel = document.getElementById('ec-class-filter');
  if (classSel) classSel.value = '';
  var inp = document.getElementById('ec-name-input');
  if (inp) inp.value = '';
  _ecNameFilter = '';
  ecLoadGrid();
}

function ecChangePerPage(v) { _ecPerPage = parseInt(v); _ecPage = 1; _renderEcTable(); }
function ecGoPage(p)         { _ecPage = p; _renderEcTable(); }

function _ecFilteredStudents() {
  if (!_ecNameFilter) return _ecStudents;
  return _ecStudents.filter(function(s) {
    return (s.student_name||'').toLowerCase().includes(_ecNameFilter) ||
      (s.student_code||'').toLowerCase().includes(_ecNameFilter);
  });
}

function _renderEcTable() {
  var filtered = _ecFilteredStudents();
  var totalEl = document.getElementById('ec-total');
  if (totalEl) totalEl.textContent = filtered.length;

  var start = (_ecPage - 1) * _ecPerPage;
  var paged = filtered.slice(start, start + _ecPerPage);
  var pages = Math.max(1, Math.ceil(filtered.length / _ecPerPage));
  var colSpan = 2 + _ecFeeItems.length;

  var actHeaders = _ecFeeItems.map(function(a) {
    return '<th style="text-align:center;">' + _esc(a.name||'') + '</th>';
  }).join('');

  var rows = '';
  if (!paged.length) {
    rows = '<tr><td colspan="' + colSpan + '" class="fin-empty">No students found.</td></tr>';
  } else {
    rows = paged.map(function(s) {
      var dirty = !!_ecDirtyRows[s.student_id];
      var rowStyle = dirty ? 'background:#fffbe6;' : '';
      var staged = _ecDirtyRows[s.student_id];

      var actCells = _ecFeeItems.map(function(a) {
        var enrolled = staged && Object.prototype.hasOwnProperty.call(staged, a.id)
          ? staged[a.id]
          : !!(s.enrollments && s.enrollments[a.id]);
        return '<td style="text-align:center;">'
          + '<input type="checkbox" id="ec-chk-' + s.student_id + '-' + a.id + '" ' + (enrolled ? 'checked' : '')
          + ' onchange="ecOnActivityCheck(' + s.student_id + ',' + a.id + ',this.checked)"'
          + ' style="width:auto;max-width:none;accent-color:#00b5b8;cursor:pointer;">'
          + '</td>';
      }).join('');

      var dirtyBadge = dirty
        ? ' <span style="color:#e67e22;font-size:0.78rem;" title="Unsaved changes">*</span>'
        : '';

      return '<tr style="' + rowStyle + '">'
        + '<td>' + _esc(s.student_name||'') + dirtyBadge + '</td>'
        + '<td>' + _esc(s.student_code||'') + '</td>'
        + actCells
        + '</tr>';
    }).join('');
  }

  var t = document.getElementById('ec-table');
  if (t) t.innerHTML = '<div class="fin-table-wrap" style="overflow-x:auto;"><table class="fin-table">'
    + '<thead><tr><th>STUDENT NAME</th><th>STUDENT ID</th>'
    + actHeaders + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div>';

  _mkPagination('ec-pagination', _ecPage, pages, 'ecGoPage');
}

function ecOnActivityCheck(studentId, feeItemId, checked) {
  if (!_ecDirtyRows[studentId]) _ecDirtyRows[studentId] = {};
  _ecDirtyRows[studentId][feeItemId] = checked;
  _ecMarkDirtyRow(studentId);
}

function _ecMarkDirtyRow(studentId) {
  var filtered = _ecFilteredStudents();
  var start = (_ecPage - 1) * _ecPerPage;
  var paged = filtered.slice(start, start + _ecPerPage);
  var idx = paged.findIndex(function(s) { return String(s.student_id) === String(studentId); });
  if (idx === -1) return;
  var tbody = document.querySelector('#ec-table table tbody');
  if (!tbody) return;
  var tr = tbody.querySelectorAll('tr')[idx];
  if (!tr) return;
  tr.style.background = '#fffbe6';
  var nameCell = tr.cells[0];
  if (!nameCell) return;
  var s = paged[idx];
  nameCell.innerHTML = _esc(s.student_name||'') + ' <span style="color:#e67e22;font-size:0.78rem;" title="Unsaved changes">*</span>';
}

async function saveEcAssignmentChanges() {
  var assignments = [];
  Object.entries(_ecDirtyRows).forEach(function(entry) {
    var studentId = entry[0], cells = entry[1];
    Object.entries(cells).forEach(function(cellEntry) {
      assignments.push({
        student_id: parseInt(studentId),
        fee_item_id: parseInt(cellEntry[0]),
        is_enrolled: !!cellEntry[1],
      });
    });
  });
  if (!assignments.length) { showToast('No changes to save.', 'info'); return; }

  var btn = document.querySelector('[onclick="saveEcAssignmentChanges()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  var res = await apiFetch(API_BASE + '/extra-curricular/bulk-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ term_id: _ecTermId, assignments: assignments }),
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }

  if (res && res.ok) {
    showToast(assignments.length + ' assignment change' + (assignments.length !== 1 ? 's' : '') + ' saved.', 'success');
    await ecLoadGrid();
  } else {
    showToast('Save failed: ' + (res ? await parseApiError(res) : 'An error occurred.'), 'error');
  }
}

// ==================== 11. STUDENT REPORT ====================

let _stuRptData = [], _stuRptPage = 1, _stuRptPerPage = 10, _stuRptSearch = '';
let _stuRptFilters = {};
let _stuRptFilterCache = { classes: [], streams: [], routes: [], ec: [], houses: [] };

async function loadStudentReportView(container) {
  openStuReportsDropdown();
  _stuRptFilters = {};
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Report</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Reports &rsaquo; Student Report</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="srpt-per-page" onchange="changeStuRptPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="srpt-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV" onclick="exportStuReportCSV()">&#128202;</button>
          <input type="text" class="fin-search-input" id="srpt-search" placeholder="&#128269; Search&#8230;" oninput="onStuRptSearch(this.value)">
          <button class="fin-btn-filter" onclick="showStuRptFilterPanel()">&#9776; Filters</button>
        </div>
      </div>
      <div id="srpt-table"></div>
      <div id="srpt-pagination"></div>
    </div>

    <div id="srpt-filter-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.35);z-index:400;" onclick="closeStuRptFilterPanel(event)">
      <div class="hr-filter-panel" onclick="event.stopPropagation()">
        <div class="hr-filter-panel-header">
          <span class="hr-filter-panel-title">Filters</span>
          <button class="hr-filter-close-btn" onclick="closeStuRptFilterPanel()">&#x2715;</button>
        </div>
        <div class="hr-filter-panel-body">
          <div class="hr-filter-group">
            <label class="hr-filter-label">Student Type</label>
            <select id="srpt-f-type" class="hr-filter-select">
              <option value="">Please Select</option>
              <option value="Full Day">Full Day</option>
              <option value="Half Day">Half Day</option>
            </select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Class</label>
            <select id="srpt-f-class" class="hr-filter-select"><option value="">Please Select</option></select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Student Status</label>
            <select id="srpt-f-status" class="hr-filter-select">
              <option value="">Please Select</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Graduated">Graduated</option>
              <option value="Transferred">Transferred</option>
            </select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Sports House</label>
            <select id="srpt-f-sports-house" class="hr-filter-select"><option value="">Please Select</option></select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Extra Curriculum</label>
            <select id="srpt-f-ec" class="hr-filter-select"><option value="">Please Select</option></select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Stream</label>
            <select id="srpt-f-stream" class="hr-filter-select"><option value="">Please Select</option></select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Transport Route</label>
            <select id="srpt-f-route" class="hr-filter-select"><option value="">Please Select</option></select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Approved Use of Student Photo</label>
            <select id="srpt-f-photo-consent" class="hr-filter-select">
              <option value="">Please Select</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Nationality</label>
            <select id="srpt-f-nationality" class="hr-filter-select">
              <option value="">Please Select</option>
              ${['Kenya','Uganda','Tanzania','Rwanda','Ethiopia','Other'].map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="hr-filter-panel-footer" style="display:flex;align-items:center;gap:8px;padding:14px 20px;border-top:1px solid #eee;">
          <a href="#" onclick="clearStuRptFilters();return false;" style="color:#555;font-size:0.88rem;text-decoration:none;margin-right:auto;">Clear All Filters</a>
          <button class="fin-btn-teal" style="background:#e67e22!important;" onclick="sendStuRptSms()">Send SMS</button>
          <button class="fin-btn-teal" onclick="applyStuRptFilters()">Submit</button>
        </div>
      </div>
    </div>
  `;
  renderSkeletonRows('srpt-table', 7);
  await _fetchStuReport();
}

async function _loadStuRptFilterDropdowns() {
  // Extra Curriculum: the master activity list below is real, but StudentReadFull
  // (what /students/ returns, our data source) carries no enrolled-activity field,
  // so this filter can't be applied client-side without an N+1 lookup per student.
  // Left wired for visibility but not enforced in _fetchStuReport() — flagged there too.
  const [classesRes, streamsRes, routesRes, ecRes, housesRes] = await Promise.all([
    apiFetch(`${API_BASE}/classes/`),
    apiFetch(`${API_BASE}/student-management/streams`),
    apiFetch(`${API_BASE}/routes/`),
    apiFetch(`${API_BASE}/student-management/extra-curriculum/`),
    apiFetch(`${API_BASE}/student-management/sports-houses/`),
  ]);
  _stuRptFilterCache.classes = classesRes && classesRes.ok ? _toArray(await classesRes.json()) : [];
  _stuRptFilterCache.streams = streamsRes && streamsRes.ok ? _toArray(await streamsRes.json()) : [];
  _stuRptFilterCache.routes  = routesRes  && routesRes.ok  ? _toArray(await routesRes.json())  : [];
  _stuRptFilterCache.ec      = ecRes      && ecRes.ok      ? _toArray(await ecRes.json())      : [];
  _stuRptFilterCache.houses  = housesRes  && housesRes.ok  ? _toArray(await housesRes.json())   : [];

  const _opt = (id, items, vk, lk) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="">Please Select</option>` +
      items.map(it => `<option value="${_esc(String(it[vk]))}">${_esc(it[lk])}</option>`).join('');
  };
  _opt('srpt-f-class',        _stuRptFilterCache.classes,  'id', 'name');
  _opt('srpt-f-stream',       _stuRptFilterCache.streams,  'id', 'title');
  _opt('srpt-f-route',        _stuRptFilterCache.routes,   'id', 'name');
  _opt('srpt-f-ec',           _stuRptFilterCache.ec,       'id', 'title');
  _opt('srpt-f-sports-house', _stuRptFilterCache.houses,   'id', 'name');
}

function showStuRptFilterPanel() {
  const o = document.getElementById('srpt-filter-overlay');
  if (o) o.style.display = 'block';
  _loadStuRptFilterDropdowns();
  // Restore current filter selections
  const f = _stuRptFilters;
  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
  set('srpt-f-type',          f.student_type    || '');
  set('srpt-f-class',         f.class_id        || '');
  set('srpt-f-status',        f.status          || '');
  set('srpt-f-ec',            f.extra_curriculum_id || '');
  set('srpt-f-sports-house',  f.sports_house_id || '');
  set('srpt-f-stream',        f.stream_id       || '');
  set('srpt-f-route',         f.transport_route_id  || '');
  set('srpt-f-photo-consent', f.parent_consents_photo !== undefined ? String(f.parent_consents_photo) : '');
  set('srpt-f-nationality',   f.nationality     || '');
}

function closeStuRptFilterPanel(e) {
  if (e && e.target !== document.getElementById('srpt-filter-overlay')) return;
  const o = document.getElementById('srpt-filter-overlay');
  if (o) o.style.display = 'none';
}

async function applyStuRptFilters() {
  _stuRptFilters = {};
  const read = id => document.getElementById(id)?.value || '';
  const v = (k, id) => { const val = read(id); if (val) _stuRptFilters[k] = val; };
  v('student_type',         'srpt-f-type');
  v('class_id',             'srpt-f-class');
  v('status',               'srpt-f-status');
  v('extra_curriculum_id',  'srpt-f-ec');
  v('sports_house_id',      'srpt-f-sports-house');
  v('stream_id',            'srpt-f-stream');
  v('transport_route_id',   'srpt-f-route');
  v('parent_consents_photo','srpt-f-photo-consent');
  v('nationality',          'srpt-f-nationality');
  const o = document.getElementById('srpt-filter-overlay');
  if (o) o.style.display = 'none';
  await _fetchStuReport();
}

async function clearStuRptFilters() {
  _stuRptFilters = {};
  ['srpt-f-type','srpt-f-class','srpt-f-status','srpt-f-sports-house','srpt-f-ec',
   'srpt-f-stream','srpt-f-route','srpt-f-photo-consent','srpt-f-nationality']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  await _fetchStuReport();
}

function sendStuRptSms() {
  // TODO: wire to the SMS composition flow once an SMS module is available in the codebase.
  showToast('SMS feature is not yet implemented.', 'info');
}

async function _fetchStuReport() {
  renderSkeletonRows('srpt-table', 7);
  // GET /reports/students doesn't exist on the backend (confirmed 404) — there is
  // no server-side filtered report endpoint for students, so this pulls the full
  // roster from GET /students/ (StudentReadFull[], max limit 1000) and filters
  // client-side against the real fields that endpoint actually returns.
  const res = await apiFetch(`${API_BASE}/students/?limit=1000`);
  let all = [];
  if (res && res.ok) {
    const raw = await res.json();
    all = Array.isArray(raw) ? raw : [];
  }

  const f = _stuRptFilters;
  _stuRptData = all.filter(s => {
    if (f.student_type        && s.student_type !== f.student_type) return false;
    if (f.class_id            && String(s.class_id ?? s.school_class_id) !== String(f.class_id)) return false;
    if (f.status               && s.student_status !== f.status) return false;
    if (f.sports_house_id      && String(s.sports_house_id) !== String(f.sports_house_id)) return false;
    if (f.stream_id            && String(s.stream_id) !== String(f.stream_id)) return false;
    if (f.transport_route_id   && String(s.transport_route_id) !== String(f.transport_route_id)) return false;
    if (f.parent_consents_photo !== undefined && String(!!s.parent_consents_photo) !== f.parent_consents_photo) return false;
    if (f.nationality          && (s.nationality || '').toLowerCase() !== f.nationality.toLowerCase()) return false;
    // extra_curriculum_id: not filterable — StudentReadFull carries no enrolled-
    // activity field (see _loadStuRptFilterDropdowns comment above).
    return true;
  });
  _stuRptPage = 1;
  _renderStuRptTable();
}

function _stuRptFiltered() {
  if (!_stuRptSearch) return _stuRptData;
  const q = _stuRptSearch;
  return _stuRptData.filter(s =>
    (`${s.first_name||''} ${s.last_name||''}`).toLowerCase().includes(q) ||
    (s.student_id||s.admission_no||'').toLowerCase().includes(q)
  );
}

function _renderStuRptTable() {
  const filtered = _stuRptFiltered();
  const totalEl  = document.getElementById('srpt-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_stuRptPage - 1) * _stuRptPerPage;
  const paged = filtered.slice(start, start + _stuRptPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _stuRptPerPage));

  let rows = paged.length
    ? paged.map(s => `<tr>
        <td>${_esc(s.student_id||s.admission_no||'')}</td>
        <td>${_esc(`${s.first_name||''} ${s.last_name||''}`.trim()||s.full_name||'')}</td>
        <td>${_esc(s.joining_date||'-')}</td>
        <td>${_esc(s.gender||'-')}</td>
        <td>${_esc(s.date_of_birth||'-')}</td>
        <td>${_esc(s.admission_date||s.joining_date||'-')}</td>
        <td><span style="color:${s.is_active?'#27ae60':'#e74c3c'};font-weight:600;">${s.is_active?'Active':'Inactive'}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="fin-empty">No records found.</td></tr>';

  const tbl = document.getElementById('srpt-table');
  if (tbl) tbl.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>ADMISSION NO.</th><th>FULL NAME</th><th>JOINING DATE</th><th>GENDER</th><th>BIRTH DATE</th><th>ADMISSION DATE</th><th>STATUS</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  _mkPagination('srpt-pagination', _stuRptPage, pages, 'stuRptGoPage');
}
function changeStuRptPerPage(v) { _stuRptPerPage = parseInt(v); _stuRptPage = 1; _renderStuRptTable(); }
function onStuRptSearch(v)      { _stuRptSearch  = v.trim().toLowerCase(); _stuRptPage = 1; _renderStuRptTable(); }
function stuRptGoPage(p)        { _stuRptPage = p; _renderStuRptTable(); }
function exportStuReportCSV() {
  exportTableCSV(
    ['Admission No.','Full Name','Joining Date','Gender','Birth Date','Admission Date','Status'],
    _stuRptFiltered().map(s => [
      s.student_id||s.admission_no||'', `${s.first_name||''} ${s.last_name||''}`.trim()||s.full_name||'',
      s.joining_date||'', s.gender||'', s.date_of_birth||'', s.admission_date||s.joining_date||'',
      s.is_active ? 'Active' : 'Inactive'
    ]),
    'student-report.csv'
  );
}

// ==================== 10. STUDENT GUARDIAN REPORT ====================

let _stuGuaData = [], _stuGuaPage = 1, _stuGuaPerPage = 10, _stuGuaSearch = '';
let _stuGuaFilters = {};
let _stuGuaClasses = [];

async function loadStudentGuardianReportView(container) {
  openStuReportsDropdown();
  _stuGuaFilters = {};
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Guardian Report</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Reports &rsaquo; Student Guardian Report</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="sgr-per-page" onchange="changeStuGuaPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="sgr-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export CSV" onclick="exportStuGuaReportCSV()">&#128202;</button>
          <input type="text" class="fin-search-input" id="sgr-search" placeholder="&#128269; Search&#8230;" oninput="onStuGuaSearch(this.value)">
          <button class="fin-btn-filter" onclick="showStuGuaFilterPanel()">&#9776; Filters</button>
        </div>
      </div>
      <div id="sgr-table"></div>
      <div id="sgr-pagination"></div>
    </div>

    <div id="sgr-filter-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.35);z-index:400;" onclick="closeStuGuaFilterPanel(event)">
      <div class="hr-filter-panel" onclick="event.stopPropagation()">
        <div class="hr-filter-panel-header">
          <span class="hr-filter-panel-title">Filters</span>
          <button class="hr-filter-close-btn" onclick="closeStuGuaFilterPanel()">&#x2715;</button>
        </div>
        <div class="hr-filter-panel-body">
          <div class="hr-filter-group">
            <label class="hr-filter-label">Student Name</label>
            <input type="text" id="sgr-f-name" class="hr-filter-select" placeholder="Search by student name">
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Relationship <span style="font-weight:400;color:#888;">(select multiple)</span></label>
            <select id="sgr-f-relationship" class="stu-multiselect" multiple>
              <option value="MOTHER">Mother</option>
              <option value="FATHER">Father</option>
              <option value="GUARDIAN">Guardian</option>
            </select>
          </div>
          <div class="hr-filter-group">
            <label class="hr-filter-label">Class <span style="font-weight:400;color:#888;">(select multiple)</span></label>
            <select id="sgr-f-class" class="stu-multiselect" multiple></select>
          </div>
        </div>
        <div class="hr-filter-panel-footer" style="display:flex;align-items:center;gap:8px;padding:14px 20px;border-top:1px solid #eee;">
          <a href="#" onclick="clearStuGuaFilters();return false;" style="color:#555;font-size:0.88rem;text-decoration:none;margin-right:auto;">Clear All Filters</a>
          <button class="fin-btn-teal" onclick="applyStuGuaFilters()">Submit</button>
        </div>
      </div>
    </div>
  `;
  renderSkeletonRows('sgr-table', 6);
  await _fetchStuGuaReport();
}

// GET /reports/student-guardians doesn't exist on the backend (confirmed 404).
// The real resource is GET /students/guardians/ (ParentInfoRead[] — id, student_id
// [int FK], full_name, email, phone, relationship, pickup_authorized, no student
// name/admission number on the record itself), so it's joined here against
// GET /students/ (StudentReadFull[]) by student_id === student.id to get the
// admission number, student name, and class for display/filtering.
async function _fetchStuGuaReport() {
  const [guaRes, stuRes, clsRes] = await Promise.all([
    apiFetch(`${API_BASE}/students/guardians/`),
    apiFetch(`${API_BASE}/students/?limit=1000`),
    apiFetch(`${API_BASE}/classes/`),
  ]);
  const guardians = (guaRes && guaRes.ok) ? _toArray(await guaRes.json()) : [];
  const students  = (stuRes && stuRes.ok) ? _toArray(await stuRes.json()) : [];
  _stuGuaClasses  = (clsRes && clsRes.ok) ? _toArray(await clsRes.json()) : [];
  const stuById = new Map(students.map(s => [s.id, s]));

  _stuGuaData = guardians.map(g => {
    const s = stuById.get(g.student_id);
    return {
      ...g,
      admission_no: s?.student_id || '',
      student_name: s ? `${s.first_name||''} ${s.last_name||''}`.trim() : '',
      class_id:     s?.class_id ?? s?.school_class_id ?? null,
      class_name:   s?.school_class_name || '',
    };
  });

  _populateStuGuaClassFilter();
  _restoreStuGuaFilterSelections();
  _stuGuaPage = 1;
  _renderStuGuaTable();
}

// Sourced from the real /classes/ master list (not derived from the roster's own
// denormalized school_class_name) so the dropdown always shows every class with a
// stable id/name pair, matching the pattern used by the Student Report's Class filter.
function _populateStuGuaClassFilter() {
  const sel = document.getElementById('sgr-f-class');
  if (!sel) return;
  sel.innerHTML = _stuGuaClasses.map(c => `<option value="${_esc(String(c.id))}">${_esc(c.name)}</option>`).join('');
}

function _restoreStuGuaFilterSelections() {
  const f = _stuGuaFilters;
  const nameEl = document.getElementById('sgr-f-name');
  if (nameEl) nameEl.value = f.student_name || '';
  const setMulti = (id, values) => {
    const el = document.getElementById(id);
    if (!el) return;
    const selected = new Set((values || []).map(String));
    Array.from(el.options).forEach(o => { o.selected = selected.has(o.value); });
  };
  setMulti('sgr-f-relationship', f.relationship);
  setMulti('sgr-f-class', f.class_id);
}

function showStuGuaFilterPanel() {
  const o = document.getElementById('sgr-filter-overlay');
  if (o) o.style.display = 'block';
  _restoreStuGuaFilterSelections();
}

function closeStuGuaFilterPanel(e) {
  if (e && e.target !== document.getElementById('sgr-filter-overlay')) return;
  const o = document.getElementById('sgr-filter-overlay');
  if (o) o.style.display = 'none';
}

function applyStuGuaFilters() {
  _stuGuaFilters = {};
  const nameVal = (document.getElementById('sgr-f-name')?.value || '').trim();
  if (nameVal) _stuGuaFilters.student_name = nameVal;
  const readMulti = id => Array.from(document.getElementById(id)?.selectedOptions || []).map(o => o.value);
  const relationships = readMulti('sgr-f-relationship');
  if (relationships.length) _stuGuaFilters.relationship = relationships;
  const classIds = readMulti('sgr-f-class');
  if (classIds.length) _stuGuaFilters.class_id = classIds;
  const o = document.getElementById('sgr-filter-overlay');
  if (o) o.style.display = 'none';
  _stuGuaPage = 1;
  _renderStuGuaTable();
}

function clearStuGuaFilters() {
  _stuGuaFilters = {};
  const nameEl = document.getElementById('sgr-f-name');
  if (nameEl) nameEl.value = '';
  ['sgr-f-relationship','sgr-f-class'].forEach(id => {
    const el = document.getElementById(id);
    if (el) Array.from(el.options).forEach(o => { o.selected = false; });
  });
  _stuGuaPage = 1;
  _renderStuGuaTable();
}

function _stuGuaFiltered() {
  const f = _stuGuaFilters;
  let d = _stuGuaData.filter(g => {
    if (f.relationship && f.relationship.length && !f.relationship.includes(g.relationship)) return false;
    if (f.class_id && f.class_id.length && !f.class_id.map(String).includes(String(g.class_id))) return false;
    if (f.student_name && !(g.student_name||'').toLowerCase().includes(f.student_name.toLowerCase())) return false;
    return true;
  });
  if (_stuGuaSearch) {
    const q = _stuGuaSearch;
    d = d.filter(g =>
      (g.admission_no||'').toLowerCase().includes(q) ||
      (g.student_name||'').toLowerCase().includes(q) ||
      (g.full_name||'').toLowerCase().includes(q)
    );
  }
  return d;
}

const _STU_GUA_RELATIONSHIP_LABEL = { MOTHER: 'Mother', FATHER: 'Father', GUARDIAN: 'Guardian' };

function _renderStuGuaTable() {
  const filtered = _stuGuaFiltered();
  const totalEl  = document.getElementById('sgr-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_stuGuaPage - 1) * _stuGuaPerPage;
  const paged = filtered.slice(start, start + _stuGuaPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _stuGuaPerPage));

  let rows = paged.length
    ? paged.map(g => `<tr>
        <td>${_esc(g.admission_no||'')}</td>
        <td>${_esc(g.student_name||'')}</td>
        <td>${_esc(g.full_name||'')}</td>
        <td>${_esc(_STU_GUA_RELATIONSHIP_LABEL[g.relationship]||g.relationship||'')}</td>
        <td>${_esc(g.phone||'')}</td>
        <td>${_esc(g.email||'')}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="fin-empty">No records found.</td></tr>';

  const tbl = document.getElementById('sgr-table');
  if (tbl) tbl.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>STUDENT ID</th><th>STUDENT NAME</th><th>GUARDIAN NAME</th><th>RELATIONSHIP</th><th>PHONE</th><th>EMAIL</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  _mkPagination('sgr-pagination', _stuGuaPage, pages, 'stuGuaGoPage');
}
function changeStuGuaPerPage(v) { _stuGuaPerPage = parseInt(v); _stuGuaPage = 1; _renderStuGuaTable(); }
function onStuGuaSearch(v)      { _stuGuaSearch  = v.trim().toLowerCase(); _stuGuaPage = 1; _renderStuGuaTable(); }
function stuGuaGoPage(p)        { _stuGuaPage = p; _renderStuGuaTable(); }
function exportStuGuaReportCSV() {
  exportTableCSV(
    ['Student ID','Student Name','Guardian Name','Relationship','Phone','Email'],
    _stuGuaFiltered().map(g => [
      g.admission_no||'', g.student_name||'', g.full_name||'',
      _STU_GUA_RELATIONSHIP_LABEL[g.relationship]||g.relationship||'', g.phone||'', g.email||''
    ]),
    'student-guardian-report.csv'
  );
}

// ==================== 11. CLASSES ====================

let _clsData = [], _clsPage = 1, _clsPerPage = 10, _clsSearch = '';
let _clsAcademicYears = [];
let _clsLevels = [];

async function loadStudentClassesView(container) {
  setActiveSidebarItem('sidebar-stu-classes');
  openStuMgmtDropdowns();

  // Pre-fetch lookup data for forms
  const [ayRes, lvlRes] = await Promise.all([
    apiFetch(`${API_BASE}/academic-years/`),
    apiFetch(`${API_BASE}/academic-levels/`),
  ]);
  const _toArr = raw => Array.isArray(raw) ? raw : (raw?.data || raw?.items || raw?.results || []);
  _clsAcademicYears = ayRes  && ayRes.ok  ? _toArr(await ayRes.json())  : [];
  _clsLevels        = lvlRes && lvlRes.ok ? _toArr(await lvlRes.json()) : [];

  const _lvlName = c => {
    const l = _clsLevels.find(l => String(l.id) === String(c.academic_level_id || c.academic_level));
    return l ? academicLevelDisplayName(l) : (c.level || c.level_name || '—');
  };

  await renderSplitView({
    container,
    title: 'Classes',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Student Management',view:'students-list'},
      {label:'Classes'}
    ],
    apiUrl: `${API_BASE}/classes/`,
    searchFields: ['name','code','class_code'],
    col1Label: 'Class Name', col2Label: 'Level',
    col1: c => c.name || '—',
    col2: c => _lvlName(c),
    rowLabel: c => c.name || '—',
    rowSub:   c => [c.code || c.class_code, _lvlName(c)].filter(Boolean).join(' · '),
    idKey: 'id',
    detailFields: [
      {label:'Class Name',    key:'name'},
      {label:'Class Code',    key:'code', fmt:(v,c)=>v||c.class_code||'—'},
      {label:'Level',         key:'academic_level_id', fmt:(_,c)=>_lvlName(c)},
      {label:'Stream',        key:'stream'},
      {label:'Capacity',      key:'capacity'},
      {label:'Status',        key:'is_active', fmt:v=>v!==false?'Active':'Inactive'},
    ],
    renderAdd:  el => _clsSplitForm(null, el),
    renderEdit: (item, el) => _clsSplitForm(item, el),
  });
}

function _clsSplitForm(item, el) {
  const id = item?.id ?? null;
  const isEdit = !!item;
  const ayOpts = _clsAcademicYears.map(y =>
    `<option value="${y.id}"${String(item?.academic_year_id||item?.academic_year)===String(y.id)?' selected':''}>${_esc(y.title||y.name)}</option>`
  ).join('');
  const lvlOpts = _clsLevels.map(l =>
    `<option value="${l.id}"${String(item?.academic_level_id||item?.academic_level)===String(l.id)?' selected':''}>${_esc(academicLevelDisplayName(l))}</option>`
  ).join('');
  el.innerHTML = `
    <div style="max-width:560px">
      <h3 class="split-right-add-title">${isEdit ? 'Edit' : 'Add'} Class</h3>
      <div class="stu-form-grid" style="grid-template-columns:1fr 1fr;gap:14px 20px">
        <div class="stu-form-group">
          <label>Class Name <span style="color:var(--coral-500)">*</span></label>
          <input id="cls-f-name" value="${_esc(item?.name||'')}" style="max-width:none;width:100%" placeholder="e.g. Acorn 2026" oninput="autoFillClassName()">
        </div>
        <div class="stu-form-group">
          <label>Class Code <span style="color:var(--coral-500)">*</span></label>
          <input id="cls-f-code" value="${_esc(item?.code||item?.class_code||'')}" style="max-width:none;width:100%" placeholder="e.g. ACN-2026">
        </div>
        <div class="stu-form-group">
          <label>Level <span style="color:var(--coral-500)">*</span></label>
          <select id="cls-f-level" style="max-width:none;width:100%" onchange="autoFillClassName()">
            <option value="">Select</option>${lvlOpts}
          </select>
        </div>
        <div class="stu-form-group">
          <label>Academic Year <span style="color:var(--coral-500)">*</span></label>
          <select id="cls-f-ay" style="max-width:none;width:100%" onchange="autoFillClassName()">
            <option value="">Select Academic Year</option>${ayOpts}
          </select>
        </div>
        <div class="stu-form-group">
          <label>Stream</label>
          <input id="cls-f-stream" value="${_esc(item?.stream||'')}" style="max-width:none;width:100%" placeholder="e.g. A, B, Red">
        </div>
        <div class="stu-form-group">
          <label>Capacity</label>
          <input id="cls-f-capacity" type="number" value="${_esc(String(item?.capacity||''))}" style="max-width:none;width:100%" placeholder="Max students">
        </div>
        <div class="stu-form-group" style="grid-column:span 2">
          <label>Status</label>
          <select id="cls-f-status" style="max-width:none;width:100%">
            <option value="true"${item?.is_active!==false?' selected':''}>Active</option>
            <option value="false"${item?.is_active===false?' selected':''}>Inactive</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn-primary" style="padding:9px 20px" onclick="saveClass('${id||''}')">
          ${isEdit ? 'Update' : 'Save'}
        </button>
        <button class="btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
      <div id="cls-form-status" style="margin-top:10px"></div>
    </div>
  `;
}

function _clsFiltered() {
  if (!_clsSearch) return _clsData;
  const q = _clsSearch;
  return _clsData.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.code || c.class_code || '').toLowerCase().includes(q)
  );
}

function _renderClsTable() {
  const filtered = _clsFiltered();
  const totalEl  = document.getElementById('cls-total');
  if (totalEl) totalEl.textContent = filtered.length;
  const start = (_clsPage - 1) * _clsPerPage;
  const paged = filtered.slice(start, start + _clsPerPage);
  const pages = Math.max(1, Math.ceil(filtered.length / _clsPerPage));

  let rows = paged.length
    ? paged.map(c => {
        const ay  = _clsAcademicYears.find(y => String(y.id) === String(c.academic_year_id || c.academic_year));
        const lvl = _clsLevels.find(l => String(l.id) === String(c.academic_level_id || c.academic_level));
        const ayName  = ay  ? (ay.title || ay.name) : (c.academic_year_name  || '-');
        const lvlName = lvl ? academicLevelDisplayName(lvl) : (c.level || c.level_name || '-');
        const statusColor = c.is_active !== false ? '#27ae60' : '#e74c3c';
        const statusText  = c.is_active !== false ? 'Active'  : 'Inactive';
        return `<tr>
          <td>${_esc(c.code || c.class_code || '-')}</td>
          <td>${_esc(c.name || '-')}</td>
          <td>${_esc(lvlName)}</td>
          <td>${_esc(ayName)}</td>
          <td>${_esc(c.stream || '-')}</td>
          <td><span style="color:${statusColor};font-weight:600;">${statusText}</span></td>
          <td class="fin-action-cell">
            <div class="fin-action-wrap">
              <button class="fin-action-btn" onclick="toggleStuDd(event,'cls-${c.id}')">&#8230;</button>
              <div id="stu-dd-cls-${c.id}" class="fin-action-dropdown" style="display:none;">
                <a href="#" onclick="showClassForm('${c.id}');return false;">&#9998; Edit</a>
              </div>
            </div>
          </td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7" class="fin-empty">No classes found. Add one to get started.</td></tr>';

  const t = document.getElementById('cls-table');
  if (t) t.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>CLASS CODE</th><th>CLASS NAME</th><th>LEVEL</th>
        <th>ACADEMIC YEAR</th><th>STREAM</th><th>STATUS</th><th>ACTION</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  _mkPagination('cls-pagination', _clsPage, pages, 'clsGoPage');
}

function changeClsPerPage(v) { _clsPerPage = parseInt(v); _clsPage = 1; _renderClsTable(); }
function onClsSearch(v)      { _clsSearch  = v.trim().toLowerCase(); _clsPage = 1; _renderClsTable(); }
function clsGoPage(p)        { _clsPage = p; _renderClsTable(); }

async function showClassForm(id) {
  const item   = id ? _clsData.find(c => String(c.id) === String(id)) : null;
  const isEdit = !!item;

  // Always re-fetch both academic years and academic levels for freshest dropdowns
  const [_ayRes, _lvlRes] = await Promise.all([
    apiFetch(`${API_BASE}/academic-years/`),
    apiFetch(`${API_BASE}/academic-levels/`),
  ]);
  if (_ayRes && _ayRes.ok) {
    const _ayRaw = await _ayRes.json();
    _clsAcademicYears = Array.isArray(_ayRaw) ? _ayRaw : (_ayRaw.data || _ayRaw.items || _ayRaw.results || []);
  }
  const _lvlRaw = (_lvlRes && _lvlRes.ok) ? await _lvlRes.json() : [];
  const _levels = Array.isArray(_lvlRaw) ? _lvlRaw : (_lvlRaw.data || _lvlRaw.items || _lvlRaw.results || []);

  const ayOpts = _clsAcademicYears.map(y =>
    `<option value="${_esc(String(y.id))}"${String(item?.academic_year_id || item?.academic_year) === String(y.id) ? ' selected' : ''}>${_esc(y.title || y.name)}</option>`
  ).join('');

  const currentLevelId = String(item?.academic_level_id || item?.academic_level || '');
  const levelOpts = _levels.map(l =>
    `<option value="${_esc(String(l.id))}"${String(l.id) === currentLevelId ? ' selected' : ''}>${_esc(academicLevelDisplayName(l))}</option>`
  ).join('');

  const main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit ? 'Edit' : 'Add'} Class</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Classes &rsaquo; ${isEdit ? 'Edit' : 'Add'}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;max-width:640px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-grid">
          <div class="stu-form-group">
            <label>Class Name <span style="color:#e74c3c">*</span></label>
            <input id="cls-f-name" class="fin-search-input" style="width:100%!important"
                   value="${_esc(item?.name || '')}" placeholder="e.g. Acorn 2026">
            <span class="stu-field-error" id="cls-f-name-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Class Code <span style="color:#e74c3c">*</span></label>
            <input id="cls-f-code" class="fin-search-input" style="width:100%!important"
                   value="${_esc(item?.code || item?.class_code || '')}" placeholder="e.g. ACN-2026">
            <span class="stu-field-error" id="cls-f-code-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Level <span style="color:#e74c3c">*</span></label>
            <select id="cls-f-level" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                    onchange="autoFillClassName()">
              <option value="">Select</option>${levelOpts}
            </select>
            <span class="stu-field-error" id="cls-f-level-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Academic Year <span style="color:#e74c3c">*</span></label>
            <select id="cls-f-ay" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                    onchange="autoFillClassName()">
              <option value="">Select Academic Year</option>${ayOpts}
            </select>
            <span class="stu-field-error" id="cls-f-ay-err"></span>
          </div>
          <div class="stu-form-group">
            <label>Stream</label>
            <input id="cls-f-stream" class="fin-search-input" style="width:100%!important"
                   value="${_esc(item?.stream || '')}" placeholder="e.g. A, B, Red">
          </div>
          <div class="stu-form-group">
            <label>Capacity</label>
            <input id="cls-f-capacity" type="number" class="fin-search-input" style="width:100%!important"
                   value="${_esc(String(item?.capacity || ''))}" placeholder="Max students">
          </div>
          <div class="stu-form-group" style="grid-column:span 2;">
            <label>Status</label>
            <select id="cls-f-status" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;">
              <option value="true"${item?.is_active !== false ? ' selected' : ''}>Active</option>
              <option value="false"${item?.is_active === false ? ' selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="fin-btn-teal" onclick="saveClass('${id || ''}')">${isEdit ? 'Update' : 'Save'}</button>
          <button class="fin-btn-cancel" onclick="loadView('student-classes')">Cancel</button>
        </div>
        <div id="cls-form-status" style="margin-top:10px;"></div>
      </div>
    </div>
  `;
}

function autoFillClassName() {
  const levelEl = document.getElementById('cls-f-level');
  const ayEl    = document.getElementById('cls-f-ay');
  const nameEl  = document.getElementById('cls-f-name');
  const codeEl  = document.getElementById('cls-f-code');
  if (!levelEl || !ayEl || !nameEl || !codeEl) return;

  // Get the display text of the selected level (not the id value)
  const levelText = levelEl.options[levelEl.selectedIndex]?.text || '';
  const ay        = _clsAcademicYears.find(y => String(y.id) === ayEl.value);
  if (!ay || !levelText) return;

  const ayLabel  = ay.title || ay.name || '';
  const yearPart = ayLabel.match(/\d{4}/)?.[0] || ayLabel;
  if (!nameEl.value) nameEl.value = `${levelText} ${yearPart}`;
  if (!codeEl.value) codeEl.value = `${levelText.slice(0, 3).toUpperCase()}-${yearPart}`;
}

async function saveClass(id) {
  const name     = (document.getElementById('cls-f-name')?.value || '').trim();
  const code     = (document.getElementById('cls-f-code')?.value || '').trim();
  const levelEl  = document.getElementById('cls-f-level');
  const level    = levelEl?.value || '';
  const levelName = levelEl?.options[levelEl?.selectedIndex]?.text || level;
  const ayId     = document.getElementById('cls-f-ay')?.value || '';
  const statusEl = document.getElementById('cls-form-status');

  let valid = true;
  const setErr = (errId, val, msg) => {
    const el = document.getElementById(errId);
    if (el) el.textContent = val ? '' : msg;
    if (!val) valid = false;
  };
  setErr('cls-f-name-err',  name,  'Class name is required.');
  setErr('cls-f-code-err',  code,  'Class code is required.');
  setErr('cls-f-level-err', level, 'Level is required.');
  setErr('cls-f-ay-err',    ayId,  'Academic Year is required.');
  if (!valid) return;

  const payload = {
    name,
    code,
    class_code:          code,
    academic_level_id:   level,
    level:               levelName,
    academic_year_id:    ayId,
    stream:           document.getElementById('cls-f-stream')?.value || '',
    capacity:         parseInt(document.getElementById('cls-f-capacity')?.value) || null,
    is_active:        document.getElementById('cls-f-status')?.value !== 'false',
  };

  const url    = id ? `${API_BASE}/classes/${id}` : `${API_BASE}/classes/`;
  const method = id ? 'PATCH' : 'POST';
  const res    = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res && res.ok) {
    showToast(id ? 'Class updated!' : 'Class added!', 'success');
    loadView('student-classes');
  } else {
    const msg = res ? await parseApiError(res) : 'Could not save class.';
    if (statusEl) statusEl.innerHTML = `<span style="color:#e74c3c;font-size:0.88rem;">${_esc(msg)}</span>`;
  }
}

// ==================== 12. COHORT TERM PLANNER ====================

// ── State ────────────────────────────────────────────────────────────────────
let _cspAllClasses   = [];
let _cspLevels       = [];
let _cspData         = [];
let _cspPage         = 1;
let _cspPerPage      = 10;
let _cspTotalRecords = 0;
let _cspTotalPages   = 1;
let _cspFilterOpen   = false;
let _cspFilters      = { term_name: '', period_from: '', period_to: '' };
let _currentCspId    = null;
let _cspTerms        = [];
let _cspDirty        = false;

// ── Date helpers ──────────────────────────────────────────────────────────────
const _CSP_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function _cspFmtDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return `${String(d.getUTCDate()).padStart(2,'0')} ${_CSP_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function _cspFmtDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d)) return isoStr;
  const day  = String(d.getDate()).padStart(2,'0');
  const mon  = _CSP_MONTHS[d.getMonth()];
  const yr   = d.getFullYear();
  let   h    = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min  = String(d.getMinutes()).padStart(2,'0');
  return `${day} ${mon} ${yr} ${h}:${min} ${ampm}`;
}

function _cspFmtPeriod(start, end) {
  const s = _cspFmtDate(start);
  const e = _cspFmtDate(end);
  if (s === '-' && e === '-') return '-';
  return `${s} – ${e}`;
}

// ── Listing ───────────────────────────────────────────────────────────────────
async function loadCohortTermPlannerView(container) {
  setActiveSidebarItem('sidebar-stu-cohort');
  openStuMgmtDropdowns();
  _cspPage       = 1;
  _cspFilterOpen = false;

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Cohort Term Planner</h2>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Cohort Term Planner &rsaquo; Listing</div>
          <button class="fin-btn-teal" onclick="cspOpenAdd()">+ Add Cohort Term Planner</button>
        </div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="csp-per-page" onchange="changeCspPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}"${n===_cspPerPage?' selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="csp-total-count">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-filter" onclick="toggleCspFilterPanel()">&#9776; Filters</button>
        </div>
      </div>

      <!-- Inline filter panel -->
      <div id="csp-filter-panel" style="display:none;background:white;border:1px solid #e0e0e0;border-radius:6px;padding:16px 20px;margin-bottom:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px 16px;align-items:end;">
          <div class="stu-form-group">
            <label>Term Name</label>
            <input id="csp-f-term" class="fin-search-input" style="width:100%!important;"
                   placeholder="Filter by term" value="${_esc(_cspFilters.term_name)}">
          </div>
          <div class="stu-form-group">
            <label>Period From</label>
            <input id="csp-f-from" type="date" class="fin-search-input" style="width:100%!important;"
                   value="${_esc(_cspFilters.period_from)}">
          </div>
          <div class="stu-form-group">
            <label>Period To</label>
            <input id="csp-f-to" type="date" class="fin-search-input" style="width:100%!important;"
                   value="${_esc(_cspFilters.period_to)}">
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px;">
          <button class="fin-btn-teal"    onclick="applyCspFilters()">Apply</button>
          <button class="fin-btn-outline" onclick="clearCspFilters()">Clear</button>
        </div>
      </div>

      <div id="csp-table-container"></div>
      <div id="csp-pagination"></div>
    </div>
  `;

  renderSkeletonRows('csp-table-container', 7);
  await _fetchCspListing();
}

async function _fetchCspListing() {
  const params = new URLSearchParams({
    page:     _cspPage,
    per_page: _cspPerPage,
  });
  if (_cspFilters.term_name)   params.set('term_name',   _cspFilters.term_name);
  if (_cspFilters.period_from) params.set('period_from', _cspFilters.period_from);
  if (_cspFilters.period_to)   params.set('period_to',   _cspFilters.period_to);

  const res = await apiFetch(`${API_BASE}/cohort-term-planner?${params}`);
  if (!res || !res.ok) {
    showToast('Failed to load Cohort Term Planner records.', 'error');
    const c = document.getElementById('csp-table-container');
    if (c) c.innerHTML = '<p class="fin-error">Error loading records.</p>';
    return;
  }

  const json = await res.json();
  // Support both wrapped { data, meta } and plain array responses
  if (Array.isArray(json)) {
    _cspData         = json;
    _cspTotalRecords = json.length;
    _cspTotalPages   = Math.max(1, Math.ceil(json.length / _cspPerPage));
  } else {
    _cspData         = json.data || [];
    _cspTotalRecords = json.meta?.total     ?? _cspData.length;
    _cspTotalPages   = json.meta?.total_pages ?? Math.max(1, Math.ceil(_cspTotalRecords / _cspPerPage));
  }

  const totalEl = document.getElementById('csp-total-count');
  if (totalEl) totalEl.textContent = _cspTotalRecords;

  _renderCspTable();
}

function _renderCspTable() {
  const COLS = 7;
  let rows = '';

  if (!_cspData.length) {
    rows = `<tr><td colspan="${COLS}" class="fin-empty">No records found.</td></tr>`;
  } else {
    _cspData.forEach(r => {
      rows += `<tr>
        <td>${_esc(r.term_name || '-')}</td>
        <td>${_cspFmtPeriod(r.period_start, r.period_end)}</td>
        <td>${_esc(String(r.total_cohorts ?? '-'))}</td>
        <td>${_esc(r.personnel || '-')}</td>
        <td>${_cspFmtDateTime(r.created_at)}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="toggleStuDd(event,'csp-${r.id}')">&#8230;</button>
            <div id="stu-dd-csp-${r.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="cspOpenEdit(${r.id});return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  const tbl = document.getElementById('csp-table-container');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>TERM NAME</th><th>PERIOD</th>
          <th>TOTAL COHORTS</th><th>PERSONNEL</th><th>CREATED AT</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  _mkPagination('csp-pagination', _cspPage, _cspTotalPages, 'cspGoPage');
}

async function cspGoPage(p) {
  _cspPage = p;
  renderSkeletonRows('csp-table-container', 7);
  await _fetchCspListing();
}

function changeCspPerPage(v) {
  _cspPerPage = parseInt(v);
  _cspPage    = 1;
  _fetchCspListing();
}

function toggleCspFilterPanel() {
  _cspFilterOpen = !_cspFilterOpen;
  const p = document.getElementById('csp-filter-panel');
  if (p) p.style.display = _cspFilterOpen ? 'block' : 'none';
}

function applyCspFilters() {
  _cspFilters.term_name   = document.getElementById('csp-f-term')?.value.trim() || '';
  _cspFilters.period_from = document.getElementById('csp-f-from')?.value || '';
  _cspFilters.period_to   = document.getElementById('csp-f-to')?.value   || '';
  _cspPage = 1;
  renderSkeletonRows('csp-table-container', 7);
  _fetchCspListing();
}

function clearCspFilters() {
  _cspFilters = { term_name: '', period_from: '', period_to: '' };
  ['csp-f-term','csp-f-from','csp-f-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  _cspPage = 1;
  _fetchCspListing();
}

function cspOpenAdd() {
  _currentCspId = null;
  _cspDirty     = false;
  loadView('cohort-term-planner-add');
}

function cspOpenEdit(id) {
  _currentCspId = id;
  _cspDirty     = false;
  loadView('cohort-term-planner-edit');
}

// ── Add / Edit Form ───────────────────────────────────────────────────────────
async function loadCohortTermPlannerFormView(container) {
  const isEdit = !!_currentCspId;
  const title  = isEdit ? 'Edit Cohort Term Planner' : 'Add Cohort Term Planner';

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${title}</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Student Management &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('cohort-term-planner');return false;">Cohort Term Planner</a>
          &rsaquo; ${isEdit ? 'Edit' : 'Add'}
        </div>
      </div>
      <div id="csp-form-body" style="background:white;border-radius:6px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div id="csp-form-loading" style="padding:32px;text-align:center;color:#888;">Loading&#8230;</div>
      </div>
    </div>
  `;

  // Load terms and existing record (if editing) in parallel
  const fetches = [apiFetch(`${API_BASE}/terms`)];
  if (isEdit) fetches.push(apiFetch(`${API_BASE}/cohort-term-planner/${_currentCspId}`));

  const [termRes, recordRes] = await Promise.all(fetches);
  const _rawTerms = (termRes && termRes.ok) ? await termRes.json() : [];
  _cspTerms = Array.isArray(_rawTerms) ? _rawTerms : (_rawTerms.data || _rawTerms.items || _rawTerms.results || []);
  const record = (isEdit && recordRes && recordRes.ok) ? await recordRes.json() : null;

  if (isEdit && !record) {
    showToast('Could not load record.', 'error');
    loadView('cohort-term-planner');
    return;
  }

  _renderCspForm(container, isEdit, record);
}

function _renderCspForm(container, isEdit, record) {
  const termOpts = _cspTerms.map(s =>
    `<option value="${_esc(String(s.id))}"${String(record?.term_id) === String(s.id) ? ' selected' : ''}>${_esc(s.name || s.title || '')}</option>`
  ).join('');

  // Pre-fill auto-populated fields from loaded record
  const selTerm     = record ? _cspTerms.find(s => String(s.id) === String(record.term_id)) : null;
  const acYear      = record?.academic_year  || selTerm?.academic_year  || '';
  const termType    = record?.term_type      || selTerm?.term_type      || selTerm?.type || '';
  const periodStart = record?.period_start   || selTerm?.period_start   || '';
  const periodEnd   = record?.period_end     || selTerm?.period_end     || '';
  const period      = (periodStart || periodEnd) ? _cspFmtPeriod(periodStart, periodEnd) : '';
  const personnel   = record?.personnel || _cspGetCurrentUserName();
  const notes       = record?.notes || '';
  const existingClassIds = record?.class_ids || [];

  const wrapper = container.querySelector('#csp-form-body');
  if (!wrapper) return;
  wrapper.innerHTML = `
    <div class="stu-form-grid" id="csp-form-grid">

      <!-- Row 1: Term Name + Academic Year -->
      <div class="stu-form-group">
        <label>Term Name <span style="color:#e74c3c">*</span></label>
        <select id="csp-term-id" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                onchange="onCspTermChange(this.value)">
          <option value="">— Select Term —</option>${termOpts}
        </select>
        <span class="stu-field-error" id="csp-term-err"></span>
      </div>
      <div class="stu-form-group">
        <label>Academic Year</label>
        <input id="csp-academic-year" class="fin-search-input" style="width:100%!important;"
               value="${_esc(acYear)}" readonly placeholder="Auto-populated">
      </div>

      <!-- Row 2: Period + Term Type -->
      <div class="stu-form-group">
        <label>Period</label>
        <input id="csp-period" class="fin-search-input" style="width:100%!important;"
               value="${_esc(period)}" readonly placeholder="Auto-populated">
      </div>
      <div class="stu-form-group">
        <label>Term Type</label>
        <input id="csp-term-type" class="fin-search-input" style="width:100%!important;"
               value="${_esc(termType)}" readonly placeholder="Auto-populated">
      </div>

      <!-- Row 3: Class table (full width) -->
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Classes</label>
        <div id="csp-class-table-wrap" class="csp-class-table-wrap">
          <p style="color:#888;font-size:0.88rem;padding:12px 0;">Loading classes&#8230;</p>
        </div>
      </div>

      <!-- Row 5: Personnel + Total Cohorts -->
      <div class="stu-form-group">
        <label>Personnel</label>
        <input id="csp-personnel" class="fin-search-input" style="width:100%!important;"
               value="${_esc(personnel)}" readonly>
      </div>
      <div class="stu-form-group">
        <label>Total Cohorts</label>
        <input id="csp-total-cohorts" type="text" class="fin-search-input" style="width:100%!important;"
               value="0" readonly>
      </div>

      <!-- Row 6: Notes (full width) -->
      <div class="stu-form-group" style="grid-column:span 2;">
        <label>Notes</label>
        <textarea id="csp-notes" style="width:100%;min-height:90px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:0.9rem;resize:vertical;">${_esc(notes)}</textarea>
      </div>

    </div>

    <div style="display:flex;gap:12px;margin-top:24px;">
      <button class="fin-btn-teal" onclick="submitCspForm()">${isEdit ? 'Update' : 'Save'}</button>
      <button class="fin-btn-cancel" onclick="cancelCspForm()">Cancel</button>
    </div>
    <div id="csp-form-status" style="margin-top:10px;"></div>
  `;

  // Mark dirty on any change
  wrapper.querySelectorAll('input,select,textarea').forEach(el => {
    el.addEventListener('change', () => { _cspDirty = true; });
    el.addEventListener('input',  () => { _cspDirty = true; });
  });

  // Load classes, pre-filtered by the selected term's academic year if known
  const _initTerm = record ? _cspTerms.find(s => String(s.id) === String(record.term_id)) : null;
  const _initAyId = _initTerm ? (_initTerm.academic_year_id || _initTerm.academic_year) : null;
  _loadCspClasses(existingClassIds, _initAyId);
}

function _cspGetCurrentUserName() {
  if (!currentUser) return '';
  return currentUser.full_name || currentUser.name ||
         ((currentUser.first_name || '') + ' ' + (currentUser.last_name || '')).trim() ||
         currentUser.email || '';
}

function onCspTermChange(termId) {
  _cspDirty = true;
  const term = _cspTerms.find(s => String(s.id) === String(termId));
  if (!term) {
    ['csp-academic-year','csp-period','csp-term-type'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    _renderCspClassTable([], null);
    return;
  }
  const ayEl   = document.getElementById('csp-academic-year');
  const perEl  = document.getElementById('csp-period');
  const typeEl = document.getElementById('csp-term-type');
  if (ayEl)   ayEl.value   = term.academic_year  || term.academic_year_name || '';
  if (perEl)  perEl.value  = (term.period_start || term.period_end)
    ? _cspFmtPeriod(term.period_start || term.start_date, term.period_end || term.end_date)
    : '';
  if (typeEl) typeEl.value = term.term_type || term.type || '';
  const errEl = document.getElementById('csp-term-err');
  if (errEl) errEl.textContent = '';

  const ayId = term.academic_year_id || term.academic_year;
  _renderCspClassTable([], ayId);
}

async function _loadCspClasses(preCheckedIds = [], academicYearId = null) {
  const wrap = document.getElementById('csp-class-table-wrap');
  if (!wrap) return;

  wrap.innerHTML = `<div class="fin-table-wrap"><table class="fin-table"><tbody id="csp-class-tbody"></tbody></table></div>`;
  renderSkeletonRows('csp-class-tbody', 5, 3);

  const _toArr = raw => Array.isArray(raw) ? raw : (raw?.data || raw?.items || raw?.results || []);
  const [clsRes, lvlRes] = await Promise.all([
    apiFetch(`${API_BASE}/classes/`),
    apiFetch(`${API_BASE}/academic-levels/`)
  ]);
  _cspAllClasses = clsRes && clsRes.ok ? _toArr(await clsRes.json()) : [];
  _cspLevels     = lvlRes && lvlRes.ok ? _toArr(await lvlRes.json()) : [];

  _renderCspClassTable(preCheckedIds, academicYearId);
}

const _CSP_MILESTONES = ['End of Term', 'End of Level', 'Completed'];

function _renderCspClassTable(preCheckedIds = [], academicYearId = null) {
  const wrap = document.getElementById('csp-class-table-wrap');
  if (!wrap) return;

  const filtered = academicYearId
    ? _cspAllClasses.filter(c => String(c.academic_year_id || c.academic_year) === String(academicYearId))
    : _cspAllClasses;

  if (!filtered.length) {
    wrap.innerHTML = `<p style="color:#888;font-size:0.88rem;padding:12px 0;">${
      academicYearId ? 'No classes found for the selected academic year.' : 'No classes available.'
    }</p>`;
    _updateCspTotalCohorts();
    return;
  }

  const milestoneOpts = _CSP_MILESTONES.map(o => `<option value="${o}">${o}</option>`).join('');

  const rows = filtered.map(c => {
    const checked  = preCheckedIds.map(String).includes(String(c.id)) ? 'checked' : '';
    const lvl      = _cspLevels.find(l => String(l.id) === String(c.academic_level_id || c.academic_level));
    const lvlName  = lvl ? academicLevelDisplayName(lvl) : (c.level || c.level_name || '-');
    return `<tr class="csp-class-row${checked ? ' csp-row-checked' : ''}">
      <td style="width:40px;"><input type="checkbox" class="csp-cls-cb" value="${c.id}"
          data-id="${c.id}" onchange="cspRowCheck(this)" ${checked}></td>
      <td>${_esc(c.name || '-')}</td>
      <td>${_esc(lvlName)}</td>
      <td>
        <select id="csp-milestone-${c.id}" class="fin-search-input"
                style="padding:5px 8px!important;width:100%!important;min-width:140px;">
          <option value="">— Select —</option>${milestoneOpts}
        </select>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th style="width:40px;">
            <input type="checkbox" id="csp-select-all" onchange="toggleCspSelectAll(this)" title="Select all">
          </th>
          <th>CLASS NAME</th><th>LEVEL</th><th>MILESTONE</th>
        </tr></thead>
        <tbody id="csp-class-tbody">${rows}</tbody>
      </table>
    </div>`;

  _updateCspTotalCohorts();
  _syncCspSelectAll();
}

function cspRowCheck(cb) {
  const row = cb.closest('tr');
  if (row) row.classList.toggle('csp-row-checked', cb.checked);
  _updateCspTotalCohorts();
  _syncCspSelectAll();
}

function toggleCspSelectAll(masterCb) {
  document.querySelectorAll('.csp-cls-cb').forEach(cb => {
    cb.checked = masterCb.checked;
    const row = cb.closest('tr');
    if (row) row.classList.toggle('csp-row-checked', masterCb.checked);
  });
  _updateCspTotalCohorts();
}

function _syncCspSelectAll() {
  const all   = document.querySelectorAll('.csp-cls-cb');
  const master = document.getElementById('csp-select-all');
  if (!master || !all.length) return;
  const checkedCount = document.querySelectorAll('.csp-cls-cb:checked').length;
  master.checked       = checkedCount === all.length;
  master.indeterminate = checkedCount > 0 && checkedCount < all.length;
}

function _updateCspTotalCohorts() {
  const count = document.querySelectorAll('.csp-cls-cb:checked').length;
  const el    = document.getElementById('csp-total-cohorts');
  if (el) el.value = String(count);
}

async function submitCspForm() {
  const termId  = document.getElementById('csp-term-id')?.value || '';
  const termErr = document.getElementById('csp-term-err');
  if (!termId) {
    if (termErr) termErr.textContent = 'Term Name is required.';
    showToast('Please select a term.', 'error');
    return;
  }
  if (termErr) termErr.textContent = '';

  const classes = Array.from(document.querySelectorAll('.csp-cls-cb:checked')).map(cb => ({
    class_id:  Number(cb.value),
    milestone: document.getElementById(`csp-milestone-${cb.value}`)?.value || '',
  }));
  const payload  = {
    term_id:   parseInt(termId),
    class_ids: classes.map(c => c.class_id),
    classes,
    notes:     document.getElementById('csp-notes')?.value || '',
    ...(currentUser?.branch_id != null ? { branch_id: currentUser.branch_id } : {}),
  };

  const btn = document.querySelector('[onclick="submitCspForm()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const url    = _currentCspId
    ? `${API_BASE}/cohort-term-planner/${_currentCspId}`
    : `${API_BASE}/cohort-term-planner`;
  const method = _currentCspId ? 'PUT' : 'POST';

  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (btn) { btn.disabled = false; btn.textContent = _currentCspId ? 'Update' : 'Save'; }

  if (res && res.ok) {
    _cspDirty = false;
    const msg = _currentCspId
      ? 'Cohort Term Planner updated successfully.'
      : 'Cohort Term Planner created successfully.';
    showToast(msg, 'success');
    _currentCspId = null;
    loadView('cohort-term-planner');
  } else {
    const msg = res ? await parseApiError(res) : 'Could not save. Please try again.';
    showToast(msg, 'error');
    const statusEl = document.getElementById('csp-form-status');
    if (statusEl) statusEl.innerHTML = `<span style="color:#e74c3c;font-size:0.88rem;">${_esc(msg)}</span>`;
  }
}

function cancelCspForm() {
  if (_cspDirty && !confirm('You have unsaved changes. Are you sure you want to leave?')) return;
  _cspDirty     = false;
  _currentCspId = null;
  loadView('cohort-term-planner');
}

// ==================== 13. CLOSE RECORDS PER CLASS ====================

let _closeRecordsStudents = [];

async function loadCloseRecordsView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Close Records per Class</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Student Management &rsaquo; Close records per class &rsaquo; Add
        </div>
      </div>
      <div style="background:white;border-radius:6px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div class="stu-form-grid" style="margin-bottom:20px;">
          <div class="stu-form-group">
            <label>Class <span style="color:#e74c3c">*</span></label>
            <select id="cr-class" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                    onchange="loadCloseRecordClassStudents(this.value, document.getElementById('cr-stream')?.value)">
              <option value="">— Select Class —</option>
            </select>
            <span class="stu-field-error" id="err-cr-class"></span>
          </div>
          <div class="stu-form-group">
            <label>Stream <small style="font-weight:400;color:#888;">(optional)</small></label>
            <select id="cr-stream" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                    onchange="loadCloseRecordClassStudents(document.getElementById('cr-class')?.value, this.value)">
              <option value="">— All Streams —</option>
            </select>
          </div>
          <div class="stu-form-group">
            <label>Reason <span style="color:#e74c3c">*</span></label>
            <select id="cr-reason" class="fin-search-input" style="width:100%!important;padding:7px 10px!important;"
                    onchange="onCloseRecordReasonChange(this.value)">
              <option value="">— Select Reason —</option>
              <option value="Transfer">Transfer</option>
              <option value="Complete">Complete</option>
            </select>
            <span class="stu-field-error" id="err-cr-reason"></span>
          </div>
        </div>

        <div id="cr-banner" style="display:none;margin-bottom:16px;"></div>

        <div id="cr-student-wrap">
          <p style="color:#888;padding:12px 0;">Select a class to load students.</p>
        </div>

        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="fin-btn-teal" onclick="submitCloseRecords()">Close Records</button>
          <button class="fin-btn-cancel" onclick="loadView('students-list')">Cancel</button>
        </div>
      </div>
    </div>
  `;

  const [clsRes, strRes] = await Promise.all([
    apiFetch(`${API_BASE}/classes/`),
    apiFetch(`${API_BASE}/student-management/streams`),
  ]);
  const classes = (clsRes && clsRes.ok) ? await clsRes.json() : [];
  const streams = (strRes && strRes.ok) ? await strRes.json() : [];

  const clsSel = document.getElementById('cr-class');
  const strSel = document.getElementById('cr-stream');
  if (clsSel) clsSel.innerHTML = `<option value="">— Select Class —</option>` +
    classes.map(c => `<option value="${c.id}">${_esc(c.name || c.code || String(c.id))}</option>`).join('');
  if (strSel) strSel.innerHTML = `<option value="">— All Streams —</option>` +
    streams.filter(s => s.status !== 'inactive' && s.status !== 'Inactive').map(s => `<option value="${s.id}">${_esc(s.title || s.name || String(s.id))}</option>`).join('');
}

async function loadCloseRecordClassStudents(classId, streamId) {
  const wrap = document.getElementById('cr-student-wrap');
  if (!wrap || !classId) return;

  wrap.innerHTML = `<div class="fin-table-wrap"><table class="fin-table"><tbody id="cr-tbody">
    <tr><td colspan="5" class="fin-loading">Loading&#8230;</td></tr>
  </tbody></table></div>`;
  renderSkeletonRows('cr-tbody', 5);

  const params = new URLSearchParams({ status: 'Active' });
  params.set('class_id', classId);
  if (streamId) params.set('stream_id', streamId);

  const res = await apiFetch(`${API_BASE}/students?${params}`);
  _closeRecordsStudents = (res && res.ok) ? await res.json() : [];

  if (!_closeRecordsStudents.length) {
    wrap.innerHTML = '<p style="color:#888;padding:12px 0;">No active students found for this class.</p>';
    return;
  }

  const rows = _closeRecordsStudents.map(s => `
    <tr>
      <td><input type="checkbox" class="cr-stu-cb" value="${s.id}" checked></td>
      <td>${_esc(s.student_id || s.admission_no || '')}</td>
      <td>${_esc(`${s.first_name||''} ${s.last_name||''}`.trim())}</td>
      <td>${_esc(s.status || 'Active')}</td>
      <td>${_esc(s.stream || '')}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th style="width:40px;">
            <input type="checkbox" id="cr-select-all" checked onchange="toggleCloseRecordSelectAll(this)">
          </th>
          <th>ADMISSION NO.</th><th>NAME</th><th>STAY STATUS</th><th>STREAM</th>
        </tr></thead>
        <tbody id="cr-tbody">${rows}</tbody>
      </table>
    </div>`;

  _syncCrSelectAll();
  document.querySelectorAll('.cr-stu-cb').forEach(cb => {
    cb.addEventListener('change', _syncCrSelectAll);
  });
}

function _syncCrSelectAll() {
  const all     = document.querySelectorAll('.cr-stu-cb');
  const master  = document.getElementById('cr-select-all');
  if (!master || !all.length) return;
  const count   = document.querySelectorAll('.cr-stu-cb:checked').length;
  master.checked       = count === all.length;
  master.indeterminate = count > 0 && count < all.length;
}

function toggleCloseRecordSelectAll(masterCb) {
  document.querySelectorAll('.cr-stu-cb').forEach(cb => { cb.checked = masterCb.checked; });
  _syncCrSelectAll();
}

function onCloseRecordReasonChange(reason) {
  const banner = document.getElementById('cr-banner');
  if (!banner) return;
  if (reason === 'Transfer') {
    banner.style.display = 'block';
    banner.style.cssText = 'display:block;background:#e0f7fa;border:1px solid #00b5b8;border-radius:6px;padding:12px 16px;color:#006064;font-size:0.9rem;margin-bottom:16px;';
    banner.textContent = 'Students will be marked as transferred. Their records will be closed and they will no longer appear in active class lists.';
  } else if (reason === 'Complete') {
    banner.style.cssText = 'display:block;background:#fff8e1;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;color:#78350f;font-size:0.9rem;margin-bottom:16px;';
    banner.textContent = 'Students will be marked as having completed their studies. Records will be closed upon confirmation.';
  } else {
    banner.style.display = 'none';
    banner.textContent = '';
  }
}

async function submitCloseRecords() {
  const classId  = document.getElementById('cr-class')?.value  || '';
  const streamId = document.getElementById('cr-stream')?.value || '';
  const reason   = document.getElementById('cr-reason')?.value || '';

  let valid = true;
  const classErr  = document.getElementById('err-cr-class');
  const reasonErr = document.getElementById('err-cr-reason');
  if (!classId)  { if (classErr)  classErr.textContent  = 'Class is required.';  valid = false; }
  else           { if (classErr)  classErr.textContent  = ''; }
  if (!reason)   { if (reasonErr) reasonErr.textContent = 'Reason is required.'; valid = false; }
  else           { if (reasonErr) reasonErr.textContent = ''; }
  if (!valid) { showToast('Please fill in all required fields.', 'error'); return; }

  const studentIds = Array.from(document.querySelectorAll('.cr-stu-cb:checked')).map(cb => cb.value);
  if (!studentIds.length) { showToast('No students selected.', 'error'); return; }

  const payload = {
    class_id:    parseInt(classId),
    stream_id:   streamId ? parseInt(streamId) : null,
    reason,
    student_ids: studentIds.map(Number),
  };

  const btn = document.querySelector('[onclick="submitCloseRecords()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

  const res = await apiFetch(`${API_BASE}/students/close-records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Close Records'; }

  if (res && res.ok) {
    const msg = reason === 'Transfer'
      ? `${studentIds.length} student(s) successfully marked as transferred.`
      : `${studentIds.length} student(s) successfully marked as completed.`;
    showToast(msg, 'success');
    loadView('students-list');
  } else {
    const msg = res ? await parseApiError(res) : 'Could not close records. Please try again.';
    showToast(msg, 'error');
  }
}
