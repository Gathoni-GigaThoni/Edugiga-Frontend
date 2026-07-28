// ==================== ADMISSIONS: APPLICANT TRACKING (2026-07-28 addendum) =
// Student Management → Admissions → Applicants. Modeled on renderSplitView
// (js/dashboard.js) the way Fixed Assets / Requisitions are, plus the
// Departments "picker filters archived-selected id" trick for the Convert
// dialog's Class picker. Confirmed live against openapi.json 2026-07-28:
// POST/GET /api/admissions/applicants, GET/PATCH/DELETE .../{id},
// .../{id}/mark-toured|mark-accepted|withdraw|convert. No JE at any stage.
const _ADM_API = `${API_BASE}/admissions/applicants`;

function _admEsc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _admDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function _admDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// datetime-local input value in the browser's local time, for "defaults to now" pickers.
function _admNowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// §9.1 — one shared lifecycle-gate table read by the list, the detail action
// bar, and (implicitly) the Convert/lifecycle modals' visibility checks.
const ADM_ACTIONS_BY_STATUS = {
  INQUIRY:   { canEdit: true,  canDelete: true,  canWithdraw: true,  primary: 'markToured' },
  TOURED:    { canEdit: true,  canDelete: false, canWithdraw: true,  primary: 'markAccepted' },
  ACCEPTED:  { canEdit: true,  canDelete: false, canWithdraw: true,  primary: 'convert' },
  CONVERTED: { canEdit: false, canDelete: false, canWithdraw: false, primary: null },
  WITHDRAWN: { canEdit: false, canDelete: false, canWithdraw: false, primary: null },
};

const ADM_STATUS_PILL = {
  INQUIRY:   { bg: '#8a8f98', fg: '#fff', label: 'Inquiry' },
  TOURED:    { bg: 'var(--gold-500,#C9A227)', fg: '#3a2f00', label: 'Toured' },
  ACCEPTED:  { bg: 'var(--navy-700,#1B3057)', fg: '#fff', label: 'Accepted' },
  CONVERTED: { bg: '#1e7e34', fg: '#fff', label: 'Converted' },
  WITHDRAWN: { bg: 'var(--coral-500,#D94040)', fg: '#fff', label: 'Withdrawn' },
};
function _admStatusPill(status) {
  const s = ADM_STATUS_PILL[status] || { bg: '#8a8f98', fg: '#fff', label: status || '—' };
  const strike = status === 'WITHDRAWN' ? 'text-decoration:line-through;' : '';
  return `<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:0.72rem;font-weight:600;background:${s.bg};color:${s.fg};${strike}">${s.label}</span>`;
}
function _admIsTerminal(status) { return status === 'CONVERTED' || status === 'WITHDRAWN'; }
function _admDim(html, status) {
  return _admIsTerminal(status) ? `<span style="opacity:0.6;">${html}</span>` : html;
}

// ── Interested-level cache — fetched once per view load, resolved locally
// everywhere (list rows, create form, detail) instead of a per-row lookup. ──
let _admLevels = [];
function _admLevelName(id) {
  const l = _admLevels.find(l => String(l.id) === String(id));
  return l ? (typeof academicLevelDisplayName === 'function' ? academicLevelDisplayName(l) : l.name) : '—';
}
async function _admEnsureLevels() {
  const res = await apiFetch(`${API_BASE}/academic-levels/`);
  _admLevels = res && res.ok ? _toArray(await res.json()) : [];
}

// ── Filter/pagination state (server-side — the one screen in this app that
// doesn't fetch-everything-and-paginate-client-side, since the backend gives
// us a real `total`). Reset on every view load. ────────────────────────────
let _admFilters = { status: '', levelId: '', q: '', includeDeleted: false, limit: 50, offset: 0, total: 0 };
let _admSearchDebounce = null;

function _admBuildUrl() {
  const p = new URLSearchParams();
  if (_admFilters.status) p.set('status', _admFilters.status);
  if (_admFilters.levelId) p.set('interested_level_id', _admFilters.levelId);
  if (_admFilters.q) p.set('q', _admFilters.q);
  if (_admFilters.includeDeleted) p.set('include_deleted', 'true');
  p.set('limit', String(_admFilters.limit));
  p.set('offset', String(_admFilters.offset));
  return `${_ADM_API}?${p.toString()}`;
}

let _admCfgRef = null;

async function loadAdmissionsApplicantsView(container) {
  _admFilters = { status: '', levelId: '', q: '', includeDeleted: false, limit: 50, offset: 0, total: 0 };
  await _admEnsureLevels();

  const cfg = {
    container,
    moduleKey: 'student_management.admissions',
    title: 'Applicants',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Student Management', view: 'students-list' },
      { label: 'Admissions', view: null },
      { label: 'Applicants' },
    ],
    apiUrl: _admBuildUrl(),
    idKey: 'id',
    col1Label: 'Name', col2Label: 'Status',
    col1: a => _admDim(`<strong>${_admEsc(a.first_name)} ${_admEsc(a.last_name)}</strong>`, a.status),
    col2: a => _admDim(`${_admEsc(a.applicant_ref)} &middot; ${_admEsc(_admLevelName(a.interested_level_id))}<br>${_admStatusPill(a.status)} ${a.age != null ? `&middot; ${a.age}y` : ''}`, a.status),
    rowLabel: a => `${a.first_name} ${a.last_name}`,
    rowSub: a => `${a.applicant_ref} &middot; ${_admLevelName(a.interested_level_id)}`,
    detailFields: [
      { label: 'Applicant Ref', key: 'applicant_ref' },
      { label: 'Full Name', key: 'first_name', fmt: (v, item) => `${_admEsc(item.first_name)} ${_admEsc(item.last_name)}` },
      { label: 'Date of Birth / Age', key: 'date_of_birth', fmt: (v, item) => `${_admDate(v)} (${item.age} yrs)` },
      { label: 'Interested Level', key: 'interested_level_id', fmt: v => _admEsc(_admLevelName(v)) },
      { label: 'Status', key: 'status', fmt: v => _admStatusPill(v) },
      { label: 'Created At', key: 'created_at', fmt: v => _admDateTime(v) },
      { label: 'Updated At', key: 'updated_at', fmt: v => _admDateTime(v) },
      { label: 'Notes', key: 'notes', fmt: v => v ? _admEsc(v) : '—', fullWidth: true },
    ],
    canEdit: item => !!ADM_ACTIONS_BY_STATUS[item.status]?.canEdit,
    renderAdd: el => _admRenderAddForm(el),
    renderEdit: (item, el) => _admRenderEditForm(item, el),
    detailActions: item => _admDetailActionsHtml(item),
    onFetched: data => {
      _admFilters.total = data.total ?? (data.items ? data.items.length : 0);
      _admUpdatePaginationUI();
    },
  };
  _admCfgRef = cfg;
  await renderSplitView(cfg);
  _admInjectFilters(cfg);
}

// ── Filter row + server-side pagination — injected the same way Fixed
// Assets/Requisitions bolt filters onto renderSplitView: mutate cfg.apiUrl,
// then call the reload hook it exposes on window. ──────────────────────────
function _admInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  const anchor = searchBox || document.querySelector('.split-left-col-headers');
  if (!anchor) return;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;flex-direction:column;gap:8px;';
  wrap.innerHTML = `
    <input type="text" id="adm-filter-search" class="fin-form-input" placeholder="Search first/last name…" style="width:100%;font-size:12px;">
    <div id="adm-filter-status-pills" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
    <select id="adm-filter-level" class="fin-form-select" style="width:100%;font-size:12px;">
      <option value="">All Interested Levels</option>
      ${_admLevels.map(l => `<option value="${l.id}">${_admEsc(typeof academicLevelDisplayName === 'function' ? academicLevelDisplayName(l) : l.name)}</option>`).join('')}
    </select>
    ${_isSuperAdmin() ? `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--grey-600,#666);">
      <input type="checkbox" id="adm-filter-include-deleted"> Include archived (soft-deleted)
    </label>` : ''}
    <div id="adm-pagination" style="display:flex;align-items:center;justify-content:space-between;font-size:12px;margin-top:4px;"></div>`;
  anchor.insertAdjacentElement('afterend', wrap);

  _admRenderStatusPills();

  document.getElementById('adm-filter-search').addEventListener('input', e => {
    clearTimeout(_admSearchDebounce);
    const val = e.target.value;
    _admSearchDebounce = setTimeout(() => { _admFilters.q = val; _admFilters.offset = 0; _admReload(); }, 300);
  });
  document.getElementById('adm-filter-level').addEventListener('change', e => {
    _admFilters.levelId = e.target.value; _admFilters.offset = 0; _admReload();
  });
  const inclDel = document.getElementById('adm-filter-include-deleted');
  if (inclDel) inclDel.addEventListener('change', e => {
    _admFilters.includeDeleted = e.target.checked; _admFilters.offset = 0; _admReload();
  });

  _admUpdatePaginationUI();
}
function _admRenderStatusPills() {
  const el = document.getElementById('adm-filter-status-pills');
  if (!el) return;
  const opts = [
    { key: '', label: 'All', bg: '#e2e4e8', fg: '#333' },
    { key: 'INQUIRY', label: 'Inquiry', bg: '#8a8f98', fg: '#fff' },
    { key: 'TOURED', label: 'Toured', bg: 'var(--gold-500,#C9A227)', fg: '#3a2f00' },
    { key: 'ACCEPTED', label: 'Accepted', bg: 'var(--navy-700,#1B3057)', fg: '#fff' },
    { key: 'CONVERTED', label: 'Converted', bg: '#1e7e34', fg: '#fff' },
    { key: 'WITHDRAWN', label: 'Withdrawn', bg: 'var(--coral-500,#D94040)', fg: '#fff' },
  ];
  el.innerHTML = opts.map(o => {
    const active = _admFilters.status === o.key;
    return `<span onclick="_admSetStatusFilter('${o.key}')" style="cursor:pointer;padding:2px 9px;border-radius:10px;font-size:0.72rem;font-weight:600;background:${o.bg};color:${o.fg};${active ? 'outline:2px solid var(--navy-700,#1B3057);outline-offset:1px;' : 'opacity:0.55;'}">${o.label}</span>`;
  }).join('');
}
function _admSetStatusFilter(status) {
  _admFilters.status = status; _admFilters.offset = 0;
  _admRenderStatusPills();
  _admReload();
}
async function _admReload() {
  if (!_admCfgRef) return;
  _admCfgRef.apiUrl = _admBuildUrl();
  await window._splitReload?.();
}
function _admUpdatePaginationUI() {
  // Deferred: renderSplitView's own renderList() sets #split-list-count to
  // the current page's row count right after onFetched fires, in the same
  // synchronous call chain — a plain assignment here would be clobbered a
  // moment later. Running on the next tick lets our real `total` win last.
  setTimeout(() => {
    const countEl = document.getElementById('split-list-count');
    if (countEl) countEl.textContent = _admFilters.total;
  }, 0);
  const el = document.getElementById('adm-pagination');
  if (!el) return;
  const { limit, offset, total } = _admFilters;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  el.innerHTML = `
    <button class="fin-btn-outline" style="padding:3px 10px;" ${offset <= 0 ? 'disabled' : ''} onclick="_admGoPage(-1)">&laquo; Prev</button>
    <span>Page ${page} of ${pages}</span>
    <button class="fin-btn-outline" style="padding:3px 10px;" ${offset + limit >= total ? 'disabled' : ''} onclick="_admGoPage(1)">Next &raquo;</button>`;
}
function _admGoPage(dir) {
  const newOffset = _admFilters.offset + dir * _admFilters.limit;
  if (newOffset < 0 || newOffset >= _admFilters.total) return;
  _admFilters.offset = newOffset;
  _admReload();
}

// ==================== SECTION 3 — CREATE ====================
const ADM_DUPLICATE_RX = /already exists for this child \((APP-\d{7}),\s*status=([A-Z]+)\)/;
let _admParents = [];

function _admBlankParent() { return { full_name: '', phone: '', email: '', relationship: 'MOTHER' }; }

function _admRenderAddForm(el) {
  _admParents = [_admBlankParent()];
  el.innerHTML = `
    <div style="max-width:560px;">
      <h3 class="split-right-add-title">Add Applicant</h3>
      <div id="adm-dup-banner"></div>
      <div class="fin-form-group">
        <label class="fin-form-label">First Name <span class="fin-required">*</span></label>
        <input type="text" id="adm-f-first" class="fin-form-input">
        <span class="fin-field-error" id="adm-f-first-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Last Name <span class="fin-required">*</span></label>
        <input type="text" id="adm-f-last" class="fin-form-input">
        <span class="fin-field-error" id="adm-f-last-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Date of Birth <span class="fin-required">*</span></label>
        <input type="date" id="adm-f-dob" class="fin-form-input">
        <span class="fin-field-error" id="adm-f-dob-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Interested Level <span class="fin-required">*</span></label>
        <select id="adm-f-level" class="fin-form-select">
          <option value="">Please Select</option>
          ${_admLevels.map(l => `<option value="${l.id}">${_admEsc(typeof academicLevelDisplayName === 'function' ? academicLevelDisplayName(l) : l.name)}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="adm-f-level-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="adm-f-notes" class="fin-form-textarea" rows="3"></textarea>
      </div>

      <div class="fin-section-label" style="margin-top:16px;">Parents</div>
      <div id="adm-f-parents-list"></div>
      <button type="button" class="fin-btn-outline" style="margin-top:6px;" onclick="_admAddParentRow()">+ Add Parent</button>
      <div style="font-size:12px;color:var(--grey-600,#666);margin:8px 0;">One parent must be marked primary. If none is picked, the first parent is used.</div>
      <span class="fin-field-error" id="adm-f-primary-err"></span>

      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="fin-btn-teal" onclick="_admSubmitCreate()">Save</button>
        <button class="fin-btn-cancel" onclick="window._splitReload?.()">Cancel</button>
      </div>
    </div>`;
  _admRenderParentRows();
}

function _admRenderParentRows() {
  const el = document.getElementById('adm-f-parents-list');
  if (!el) return;
  el.innerHTML = _admParents.map((p, i) => `
    <div style="border:1px solid var(--grey-100,#e5e5e5);border-radius:8px;padding:12px;margin-bottom:10px;">
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Full Name <span class="fin-required">*</span></label>
          <input type="text" class="fin-form-input" value="${_admEsc(p.full_name)}" oninput="_admParents[${i}].full_name=this.value">
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Phone <span class="fin-required">*</span></label>
          <input type="text" class="fin-form-input" value="${_admEsc(p.phone)}" oninput="_admParents[${i}].phone=this.value">
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Email</label>
          <input type="text" class="fin-form-input" value="${_admEsc(p.email)}" oninput="_admParents[${i}].email=this.value">
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Relationship <span class="fin-required">*</span></label>
          <select class="fin-form-select" onchange="_admParents[${i}].relationship=this.value">
            ${['MOTHER','FATHER','GUARDIAN'].map(r => `<option value="${r}"${p.relationship===r?' selected':''}>${r[0]+r.slice(1).toLowerCase()}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
          <input type="radio" name="adm-primary-parent" value="${i}" ${_admPrimaryIdx()===i?'checked':''} onchange="_admSetPrimary(${i})"> Primary
        </label>
        ${_admParents.length > 1 ? `<button type="button" class="fin-btn-cancel" style="padding:2px 10px;" onclick="_admRemoveParentRow(${i})">&times; Remove</button>` : ''}
      </div>
    </div>`).join('');
}
let _admPrimaryParentIdx = null;
function _admPrimaryIdx() { return _admPrimaryParentIdx; }
function _admSetPrimary(i) { _admPrimaryParentIdx = i; }
function _admAddParentRow() {
  _admParents.push(_admBlankParent());
  _admRenderParentRows();
}
function _admRemoveParentRow(i) {
  if (_admParents.length <= 1) return;
  _admParents.splice(i, 1);
  if (_admPrimaryParentIdx === i) _admPrimaryParentIdx = null;
  else if (_admPrimaryParentIdx > i) _admPrimaryParentIdx--;
  _admRenderParentRows();
}

function _admSetErr(id, msg) { const e = document.getElementById(id); if (e) e.textContent = msg; }

async function _admSubmitCreate() {
  ['adm-f-first-err','adm-f-last-err','adm-f-dob-err','adm-f-level-err','adm-f-primary-err'].forEach(id => _admSetErr(id, ''));
  const first = document.getElementById('adm-f-first').value.trim();
  const last = document.getElementById('adm-f-last').value.trim();
  const dob = document.getElementById('adm-f-dob').value;
  const level = document.getElementById('adm-f-level').value;
  const notes = document.getElementById('adm-f-notes').value.trim();

  let valid = true;
  if (!first) { _admSetErr('adm-f-first-err', 'This field is required.'); valid = false; }
  if (!last) { _admSetErr('adm-f-last-err', 'This field is required.'); valid = false; }
  if (!dob) { _admSetErr('adm-f-dob-err', 'This field is required.'); valid = false; }
  if (!level) { _admSetErr('adm-f-level-err', 'This field is required.'); valid = false; }
  for (const p of _admParents) {
    if (!p.full_name.trim() || !p.phone.trim()) {
      _admSetErr('adm-f-primary-err', 'Every parent needs a Full Name and Phone.'); valid = false; break;
    }
  }
  if (!valid) return;

  const payload = {
    first_name: first, last_name: last, date_of_birth: dob,
    interested_level_id: parseInt(level), notes: notes || null,
    parents: _admParents.map((p, i) => ({
      full_name: p.full_name.trim(), phone: p.phone.trim(),
      email: p.email.trim() || null, relationship: p.relationship,
      is_primary: _admPrimaryParentIdx === i,
    })),
  };

  const res = await apiFetch(_ADM_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    const created = await res.json();
    showToast(`Applicant ${created.applicant_ref} added.`, 'success');
    await window._splitReload?.();
    window._splitSelectItem?.(created.id);
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  if (res.status === 400 && /Academic level not found/i.test(detail)) {
    _admSetErr('adm-f-level-err', detail);
    return;
  }
  if (res.status === 400) {
    const m = detail.match(ADM_DUPLICATE_RX);
    _admShowDuplicateBanner(detail, m ? { ref: m[1], status: m[2] } : null);
    return;
  }
  if (res.status === 422 && /Only one parent can be marked as primary/i.test(detail)) {
    _admSetErr('adm-f-primary-err', detail);
    return;
  }
  showToast('Error: ' + detail, 'error');
}

function _admShowDuplicateBanner(rawMessage, parsed) {
  const banner = document.getElementById('adm-dup-banner');
  if (!banner) { showToast(rawMessage, 'error'); return; }
  const msg = parsed
    ? `An active applicant already exists for this child (${_admEsc(parsed.ref)}, status ${_admEsc(parsed.status)}).`
    : _admEsc(rawMessage);
  banner.innerHTML = `
    <div style="padding:12px 14px;border-radius:8px;background:var(--coral-100,#fbe4e4);color:var(--coral-600,#B03030);font-size:0.85rem;margin-bottom:14px;">
      <div style="margin-bottom:8px;">${msg}</div>
      <div style="display:flex;gap:10px;">
        ${parsed ? `<button class="fin-btn-teal" onclick="_admFindExisting('${_admEsc(parsed.ref)}')">Find existing</button>` : ''}
        <button class="fin-btn-outline" onclick="document.getElementById('adm-dup-banner').innerHTML=''">Continue editing</button>
      </div>
    </div>`;
}
// The list's `q` filter only matches first/last name, not applicant_ref, so a
// literal "prefill search + apply" can't land on the row by ref alone — fetch
// a wide page and resolve the ref to an id directly, then select it, which is
// the actual outcome the addendum is after ("land on the existing record").
async function _admFindExisting(ref) {
  const res = await apiFetch(`${_ADM_API}?limit=200&offset=0&include_deleted=true`);
  if (!res || !res.ok) return;
  const data = await res.json();
  const match = (data.items || []).find(a => a.applicant_ref === ref);
  _admFilters = { status: '', levelId: '', q: '', includeDeleted: true, limit: 50, offset: 0, total: 0 };
  const searchBox = document.getElementById('adm-filter-search');
  if (searchBox) searchBox.value = ref;
  const levelSel = document.getElementById('adm-filter-level');
  if (levelSel) levelSel.value = '';
  const inclDel = document.getElementById('adm-filter-include-deleted');
  if (inclDel) inclDel.checked = true;
  _admRenderStatusPills();
  await _admReload();
  if (match) window._splitSelectItem?.(match.id);
}

// ── "..." action menu (.split-action-dropdown) ──────────────────────────────
function _admToggleActionMenu(event, id) {
  event.stopPropagation();
  const dd = document.getElementById(`adm-action-dropdown-${id}`);
  if (!dd) return;
  const wasHidden = dd.hidden;
  document.querySelectorAll('.split-action-dropdown').forEach(d => d.hidden = true);
  dd.hidden = !wasHidden;
}
function _admCloseActionMenu() {
  document.querySelectorAll('.split-action-dropdown').forEach(d => d.hidden = true);
}
document.addEventListener('click', () => _admCloseActionMenu());

// ==================== SECTION 4 — DETAIL ====================
function _admDetailActionsHtml(item) {
  window._admCurrentItem = item;
  const rules = ADM_ACTIONS_BY_STATUS[item.status] || {};

  // Cross-link to the converted Student — closes the funnel loop.
  const crossLink = (item.status === 'CONVERTED' && item.converted_student_id != null) ? `
    <div style="margin-bottom:12px;">
      <a href="#" style="color:var(--navy-700,#1B3057);font-weight:700;" onclick="_currentEditStudentId=${item.converted_student_id};loadView('students-view');return false;">&rarr; View Student record</a>
    </div>` : '';

  // Parents card — primary prominent, others collapsed.
  const parents = item.parents || [];
  const primary = parents.find(p => p.is_primary) || parents[0];
  const others = parents.filter(p => p !== primary);
  const parentBlockHtml = p => `
    <div>
      <div style="font-weight:700;">${_admEsc(p.full_name)} ${p.is_primary ? `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;background:var(--gold-500,#C9A227);color:#3a2f00;margin-left:4px;">Primary</span>` : ''}</div>
      <div style="font-size:13px;color:var(--grey-600,#666);margin-top:2px;">
        ${_admEsc(p.phone)}${p.email ? ' &middot; ' + _admEsc(p.email) : ''} &middot; ${p.relationship[0]}${p.relationship.slice(1).toLowerCase()}
      </div>
    </div>`;
  const parentsCard = `
    <div class="detail-info-card">
      <div class="fin-section-label">Parents</div>
      ${primary ? parentBlockHtml(primary) : '<span style="color:var(--grey-400);">No parents on file.</span>'}
      ${others.length ? `
        <details style="margin-top:10px;">
          <summary style="cursor:pointer;font-size:13px;color:var(--navy-700,#1B3057);">Other contacts (${others.length})</summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:10px;">${others.map(parentBlockHtml).join('')}</div>
        </details>` : ''}
      <div style="font-size:12px;color:var(--grey-400);margin-top:10px;">Parents are recorded once at intake. To correct a contact, withdraw this applicant and create a new record.</div>
    </div>`;

  // Lifecycle timestamps — only rows with a non-null value. Withdrawal gets
  // its own coral sub-block (only that part is "the coral panel", not the
  // whole card — a converted+later-withdrawn record would otherwise have its
  // legitimate tour/acceptance history tinted red for no reason).
  const lcRows = [];
  if (item.toured_at) lcRows.push(['Toured At', _admDateTime(item.toured_at)]);
  if (item.offer_accepted_at) lcRows.push(['Offer Accepted At', _admDateTime(item.offer_accepted_at)]);
  if (item.converted_student_id != null) lcRows.push(['Converted Student', `<a href="#" onclick="_currentEditStudentId=${item.converted_student_id};loadView('students-view');return false;">View Student</a>`]);
  const withdrawalBlock = item.withdrawn_at ? `
    <div style="border-left:3px solid var(--coral-500,#D94040);padding-left:10px;margin-top:${lcRows.length ? '12px' : '0'};">
      <div class="detail-fields-grid">
        <div class="detail-field"><span class="detail-field-label">Withdrawn At</span><span class="detail-field-value">${_admDateTime(item.withdrawn_at)}</span></div>
        ${item.withdrawal_reason ? `<div class="detail-field" style="grid-column:1/-1;"><span class="detail-field-label">Withdrawal Reason</span><span class="detail-field-value">${_admEsc(item.withdrawal_reason)}</span></div>` : ''}
      </div>
    </div>` : '';
  const lcCardWrapped = (lcRows.length || withdrawalBlock) ? `
    <div class="detail-info-card">
      <div class="fin-section-label">Lifecycle</div>
      ${lcRows.length ? `<div class="detail-fields-grid">${lcRows.map(([label, val]) => `<div class="detail-field"><span class="detail-field-label">${label}</span><span class="detail-field-value">${val}</span></div>`).join('')}</div>` : ''}
      ${withdrawalBlock}
    </div>` : '';

  // Action bar — primary state-action promoted to a navy button next to a
  // "..." menu (.split-action-dropdown, core.css — an already-styled but
  // previously unwired component) holding Withdraw/Delete. Edit keeps the
  // built-in banner pencil trigger (renderSplitView's hasEditAction) rather
  // than duplicating it in here.
  let primaryBtn = '';
  if (rules.primary === 'markToured') primaryBtn = `<button class="fin-btn-teal" onclick="_admOpenMarkTouredModal(${item.id})">Mark toured</button>`;
  if (rules.primary === 'markAccepted') primaryBtn = `<button class="fin-btn-teal" onclick="_admOpenMarkAcceptedModal(${item.id})">Mark accepted</button>`;
  if (rules.primary === 'convert') primaryBtn = `<button class="fin-btn-teal" onclick="_admOpenConvertModal(${item.id})">Convert to Student</button>`;

  let menuItems = '';
  if (rules.canWithdraw) menuItems += `<button onclick="_admCloseActionMenu();_admOpenWithdrawModal(${item.id})">Withdraw</button>`;
  if (rules.canDelete) menuItems += `<button class="danger" onclick="_admCloseActionMenu();_admOpenDeleteModal(${item.id})">Delete</button>`;
  const menu = menuItems ? `
    <div style="position:relative;display:inline-block;">
      <button class="fin-btn-outline" onclick="_admToggleActionMenu(event,${item.id})">&#8942; More</button>
      <div class="split-action-dropdown" id="adm-action-dropdown-${item.id}" hidden>${menuItems}</div>
    </div>` : '';

  return `
    ${crossLink}
    ${parentsCard}
    ${lcCardWrapped}
    ${(primaryBtn || menu) ? `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--grey-100);">${primaryBtn}${menu}</div>` : ''}
    <div id="adm-action-msg-${item.id}" style="margin-top:8px;"></div>`;
}

// ==================== SECTION 5 — EDIT ====================
function _admRenderEditForm(item, el) {
  el.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit ${_admEsc(item.first_name)} ${_admEsc(item.last_name)}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Admissions &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('admissions-applicants');return false;">Applicants</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:640px;">
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">First Name <span class="fin-required">*</span></label>
            <input type="text" id="adm-e-first" class="fin-form-input" value="${_admEsc(item.first_name)}">
            <span class="fin-field-error" id="adm-e-first-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Last Name <span class="fin-required">*</span></label>
            <input type="text" id="adm-e-last" class="fin-form-input" value="${_admEsc(item.last_name)}">
            <span class="fin-field-error" id="adm-e-last-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Date of Birth <span class="fin-required">*</span></label>
            <input type="date" id="adm-e-dob" class="fin-form-input" value="${item.date_of_birth || ''}">
            <span class="fin-field-error" id="adm-e-dob-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Interested Level <span class="fin-required">*</span></label>
            <select id="adm-e-level" class="fin-form-select">
              ${_admLevels.map(l => `<option value="${l.id}"${String(l.id)===String(item.interested_level_id)?' selected':''}>${_admEsc(typeof academicLevelDisplayName === 'function' ? academicLevelDisplayName(l) : l.name)}</option>`).join('')}
            </select>
            <span class="fin-field-error" id="adm-e-level-err"></span>
          </div>
          <div class="fin-form-group fin-span-2">
            <label class="fin-form-label">Notes</label>
            <textarea id="adm-e-notes" class="fin-form-textarea" rows="3">${_admEsc(item.notes || '')}</textarea>
          </div>
        </div>
        <div id="adm-e-msg" style="margin-top:8px;"></div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_admSubmitEdit(${item.id})">Update</button>
          <button class="fin-btn-cancel" onclick="window._splitRefreshSelected?.()">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function _admSubmitEdit(id) {
  ['adm-e-first-err','adm-e-last-err','adm-e-dob-err','adm-e-level-err'].forEach(i => _admSetErr(i, ''));
  document.getElementById('adm-e-msg').innerHTML = '';
  const first = document.getElementById('adm-e-first').value.trim();
  const last = document.getElementById('adm-e-last').value.trim();
  const dob = document.getElementById('adm-e-dob').value;
  const level = document.getElementById('adm-e-level').value;
  const notes = document.getElementById('adm-e-notes').value.trim();
  let valid = true;
  if (!first) { _admSetErr('adm-e-first-err', 'This field is required.'); valid = false; }
  if (!last) { _admSetErr('adm-e-last-err', 'This field is required.'); valid = false; }
  if (!dob) { _admSetErr('adm-e-dob-err', 'This field is required.'); valid = false; }
  if (!level) { _admSetErr('adm-e-level-err', 'This field is required.'); valid = false; }
  if (!valid) return;

  const payload = { first_name: first, last_name: last, date_of_birth: dob, interested_level_id: parseInt(level), notes: notes || null };
  const res = await apiFetch(`${_ADM_API}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    showToast('Applicant updated.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  document.getElementById('adm-e-msg').innerHTML = `<div class="fin-field-error">${_admEsc(detail)}</div>`;
}

// ==================== SECTION 6 — LIFECYCLE ACTIONS ====================
function _admModalShell(id, widthPx, innerHtml) {
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `<div style="background:var(--white);border-radius:8px;padding:24px;width:${widthPx}px;max-width:95vw;max-height:85vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);">${innerHtml}</div>`;
  document.body.appendChild(wrap);
}
function _admCloseModal(id) { document.getElementById(id)?.remove(); }

function _admOpenMarkTouredModal(id) {
  const item = window._admCurrentItem;
  _admModalShell('adm-toured-modal', 460, `
    <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#1B3057);">Record tour for ${_admEsc(item.applicant_ref)}?</h3>
    <div class="fin-form-group">
      <label class="fin-form-label">Tour Date/Time</label>
      <input type="datetime-local" id="adm-toured-dt" class="fin-form-input" value="${_admNowLocalInput()}">
    </div>
    <div id="adm-toured-err"></div>
    <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
      <button class="fin-btn-cancel" onclick="_admCloseModal('adm-toured-modal')">Cancel</button>
      <button class="fin-btn-teal" onclick="_admConfirmMarkToured(${id})">Confirm</button>
    </div>`);
}
async function _admConfirmMarkToured(id) {
  const dt = document.getElementById('adm-toured-dt').value;
  const res = await apiFetch(`${_ADM_API}/${id}/mark-toured`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toured_at: dt ? new Date(dt).toISOString() : null }),
  });
  if (res && res.ok) { _admCloseModal('adm-toured-modal'); showToast('Applicant marked toured.', 'success'); await window._splitRefreshSelected?.(); return; }
  if (!res) return;
  const detail = await parseApiError(res);
  document.getElementById('adm-toured-err').innerHTML = `<div class="fin-field-error">${_admEsc(detail)}</div>`;
}

function _admOpenMarkAcceptedModal(id) {
  const item = window._admCurrentItem;
  _admModalShell('adm-accepted-modal', 460, `
    <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#1B3057);">Record offer acceptance for ${_admEsc(item.applicant_ref)}?</h3>
    <div style="font-size:12px;color:var(--grey-600,#666);margin-bottom:10px;">The next step will be Convert to Student.</div>
    <div class="fin-form-group">
      <label class="fin-form-label">Acceptance Date/Time</label>
      <input type="datetime-local" id="adm-accepted-dt" class="fin-form-input" value="${_admNowLocalInput()}">
    </div>
    <div id="adm-accepted-err"></div>
    <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
      <button class="fin-btn-cancel" onclick="_admCloseModal('adm-accepted-modal')">Cancel</button>
      <button class="fin-btn-teal" onclick="_admConfirmMarkAccepted(${id})">Confirm</button>
    </div>`);
}
async function _admConfirmMarkAccepted(id) {
  const dt = document.getElementById('adm-accepted-dt').value;
  const res = await apiFetch(`${_ADM_API}/${id}/mark-accepted`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offer_accepted_at: dt ? new Date(dt).toISOString() : null }),
  });
  if (res && res.ok) { _admCloseModal('adm-accepted-modal'); showToast('Applicant marked accepted.', 'success'); await window._splitRefreshSelected?.(); return; }
  if (!res) return;
  const detail = await parseApiError(res);
  document.getElementById('adm-accepted-err').innerHTML = `<div class="fin-field-error">${_admEsc(detail)}</div>`;
}

function _admOpenWithdrawModal(id) {
  const item = window._admCurrentItem;
  _admModalShell('adm-withdraw-modal', 460, `
    <h3 style="margin:0 0 8px;font-size:1.05rem;color:var(--navy-700,#1B3057);">Withdraw ${_admEsc(item.applicant_ref)}</h3>
    <div style="padding:10px 12px;border-radius:6px;background:var(--coral-100,#fbe4e4);color:var(--coral-600,#B03030);font-size:0.82rem;margin-bottom:14px;">
      Withdrawal is permanent. The applicant will move to WITHDRAWN and no further edits are possible.
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Reason</label>
      <textarea id="adm-withdraw-reason" class="fin-form-textarea" rows="3" maxlength="255" placeholder="Optional but useful for duplicate-detection context if the family re-enquires later." oninput="_admWithdrawCounter()"></textarea>
      <span id="adm-withdraw-counter" style="font-size:11px;color:var(--grey-400);">0 / 255</span>
    </div>
    <div id="adm-withdraw-err"></div>
    <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
      <button class="fin-btn-outline" onclick="_admCloseModal('adm-withdraw-modal')">Cancel</button>
      <button class="fin-btn-cancel" onclick="_admConfirmWithdraw(${id})">Withdraw</button>
    </div>`);
}
function _admWithdrawCounter() {
  const el = document.getElementById('adm-withdraw-reason');
  const c = document.getElementById('adm-withdraw-counter');
  if (el && c) c.textContent = `${el.value.length} / 255`;
}
async function _admConfirmWithdraw(id) {
  const reason = document.getElementById('adm-withdraw-reason').value.trim();
  const res = await apiFetch(`${_ADM_API}/${id}/withdraw`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason || null }),
  });
  if (res && res.ok) { _admCloseModal('adm-withdraw-modal'); showToast('Applicant withdrawn.', 'success'); await window._splitRefreshSelected?.(); return; }
  if (!res) return;
  const detail = await parseApiError(res);
  document.getElementById('adm-withdraw-err').innerHTML = `<div class="fin-field-error">${_admEsc(detail)}</div>`;
}

function _admOpenDeleteModal(id) {
  const item = window._admCurrentItem;
  _admModalShell('adm-delete-modal', 460, `
    <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#1B3057);">Delete ${_admEsc(item.applicant_ref)}?</h3>
    <div style="font-size:0.85rem;color:var(--grey-600,#666);margin-bottom:14px;">This soft-deletes the record and its parents. Applicants past INQUIRY must be withdrawn instead.</div>
    <div id="adm-delete-err"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="fin-btn-outline" onclick="_admCloseModal('adm-delete-modal')">Cancel</button>
      <button class="fin-btn-cancel" onclick="_admConfirmDelete(${id})">Delete</button>
    </div>`);
}
async function _admConfirmDelete(id) {
  const res = await apiFetch(`${_ADM_API}/${id}`, { method: 'DELETE' });
  if (res && (res.ok || res.status === 204)) {
    _admCloseModal('adm-delete-modal');
    showToast('Applicant deleted.', 'success');
    window._splitRemoveItem?.(id);
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  document.getElementById('adm-delete-err').innerHTML = `<div class="fin-field-error">${_admEsc(detail)}</div>`;
}

// ==================== SECTION 7 — CONVERT TO STUDENT ====================
let _admYears = [];
let _admConvertGender = null;       // 'F' | 'M' | null
let _admConvertStudentType = 'Full Day';

async function _admOpenConvertModal(id) {
  const item = window._admCurrentItem;
  if (item.status !== 'ACCEPTED') return; // defense in depth — button is already gated
  if (!_admYears.length) {
    const res = await apiFetch(`${API_BASE}/academic-years/`);
    _admYears = res && res.ok ? _toArray(await res.json()) : [];
  }
  _admConvertGender = null;
  _admConvertStudentType = 'Full Day';
  const primary = (item.parents || []).find(p => p.is_primary) || (item.parents || [])[0];

  _admModalShell('adm-convert-modal', 640, `
    <div style="background:var(--navy-700,#1B3057);color:#fff;border-radius:8px;padding:16px 18px;margin:-24px -24px 18px;">
      <div style="font-size:1.1rem;font-weight:700;">Convert ${_admEsc(item.applicant_ref)} to Student</div>
      <div style="font-size:0.85rem;opacity:0.8;margin-top:4px;">
        ${_admEsc(item.first_name)} ${_admEsc(item.last_name)} &middot; ${_admEsc(_admLevelName(item.interested_level_id))}${primary ? ' &middot; ' + _admEsc(primary.phone) : ''}
      </div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Academic Year <span class="fin-required">*</span></label>
      <select id="adm-cv-year" class="fin-form-select" onchange="_admConvertYearChanged(${item.interested_level_id})">
        <option value="">Please Select</option>
        ${_admYears.map(y => `<option value="${y.id}">${_admEsc(y.title)}</option>`).join('')}
      </select>
      <span class="fin-field-error" id="adm-cv-year-err"></span>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Class <span class="fin-required">*</span></label>
      <select id="adm-cv-class" class="fin-form-select" disabled><option value="">Pick an academic year first</option></select>
      <span class="fin-field-error" id="adm-cv-class-err"></span>
      <div id="adm-cv-class-empty"></div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Joining Date</label>
      <input type="date" id="adm-cv-joining" class="fin-form-input" value="${new Date().toISOString().slice(0,10)}">
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Gender</label>
      <div style="display:flex;gap:8px;" id="adm-cv-gender-group">
        <button type="button" class="fin-btn-outline" onclick="_admSetConvertGender('F')">F</button>
        <button type="button" class="fin-btn-outline" onclick="_admSetConvertGender('M')">M</button>
      </div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Student Type</label>
      <div style="display:flex;gap:8px;" id="adm-cv-type-group">
        <button type="button" class="fin-btn-teal" onclick="_admSetConvertType('Full Day')">Full Day</button>
        <button type="button" class="fin-btn-outline" onclick="_admSetConvertType('Half Day')">Half Day</button>
      </div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Term</label>
      <select id="adm-cv-term" class="fin-form-select" disabled><option value="">Pick an academic year first</option></select>
      <span style="font-size:11px;color:var(--grey-400);">Blank means the server picks the current term for this academic year.</span>
    </div>
    <div style="background:var(--grey-50,#f7f7f8);border-radius:8px;padding:12px 14px;margin-top:14px;font-size:0.82rem;color:#444;">
      <div><strong>What this action does:</strong> Creates a Student record for ${_admEsc(item.first_name)} ${_admEsc(item.last_name)} with SOIS ID ${_admEsc(item.applicant_ref)} (a new ID will be minted), an active enrollment in the selected class, and copies all ${(item.parents||[]).length} parent contact(s) into the student's records.</div>
      <div style="margin-top:6px;"><strong>What this action does NOT do:</strong> No fees are assigned. No journal entries are posted. The Student will pick up fee schedules through the normal FeeSchedule &rarr; FeeInvoice pipeline.</div>
    </div>
    <div id="adm-cv-err" style="margin-top:10px;"></div>
    <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
      <button class="fin-btn-cancel" onclick="_admCloseModal('adm-convert-modal')">Cancel</button>
      <button class="fin-btn-teal" onclick="_admSubmitConvert(${id})">Convert to Student</button>
    </div>`);
}
function _admSetConvertGender(g) {
  _admConvertGender = _admConvertGender === g ? null : g;
  document.querySelectorAll('#adm-cv-gender-group button').forEach(b => {
    b.className = (b.textContent === _admConvertGender) ? 'fin-btn-teal' : 'fin-btn-outline';
  });
}
function _admSetConvertType(t) {
  _admConvertStudentType = t;
  document.querySelectorAll('#adm-cv-type-group button').forEach(b => {
    b.className = (b.textContent === t) ? 'fin-btn-teal' : 'fin-btn-outline';
  });
}
async function _admConvertYearChanged(interestedLevelId) {
  const yearId = document.getElementById('adm-cv-year').value;
  const classSel = document.getElementById('adm-cv-class');
  const termSel = document.getElementById('adm-cv-term');
  if (!yearId) {
    classSel.disabled = true; classSel.innerHTML = '<option value="">Pick an academic year first</option>';
    termSel.disabled = true; termSel.innerHTML = '<option value="">Pick an academic year first</option>';
    return;
  }
  const [clsRes, termRes] = await Promise.all([
    apiFetch(`${API_BASE}/classes/?academic_year_id=${yearId}`),
    apiFetch(`${API_BASE}/terms/?academic_year_id=${yearId}`),
  ]);
  const classes = clsRes && clsRes.ok ? _toArray(await clsRes.json()) : [];
  // Client-side filter to (interested_level_id, academic_year_id) — makes the
  // three Class-mismatch 409s unreachable in the happy path (§7.2/§7.4).
  const matches = classes.filter(c => String(c.academic_level_id) === String(interestedLevelId) && String(c.academic_year_id) === String(yearId));
  const emptyEl = document.getElementById('adm-cv-class-empty');
  if (!matches.length) {
    classSel.disabled = true;
    classSel.innerHTML = '<option value="">Please Select</option>';
    if (emptyEl) emptyEl.innerHTML = `<div style="padding:8px 10px;border-radius:6px;background:var(--gold-100,#faf1d8);color:#6b5400;font-size:0.78rem;margin-top:6px;">No classes match this applicant's level for the selected year. Create one first.</div>`;
  } else {
    classSel.disabled = false;
    if (emptyEl) emptyEl.innerHTML = '';
    classSel.innerHTML = `<option value="">Please Select</option>${matches.map(c => `<option value="${c.id}">${_admEsc(c.name)}</option>`).join('')}`;
  }
  const terms = termRes && termRes.ok ? _toArray(await termRes.json()) : [];
  termSel.disabled = false;
  termSel.innerHTML = `<option value="">Server picks current term</option>${terms.map(t => `<option value="${t.id}">${_admEsc(t.title)}</option>`).join('')}`;
}
function _admClassifyConvertError(detail) {
  if (/does not belong to the applicant's interested academic level/i.test(detail)) return 'class';
  if (/does not belong to the specified academic year/i.test(detail)) return 'class';
  if (/^Class not found/i.test(detail)) return 'class';
  return 'banner';
}
async function _admSubmitConvert(id) {
  document.getElementById('adm-cv-year-err').textContent = '';
  document.getElementById('adm-cv-class-err').textContent = '';
  document.getElementById('adm-cv-err').innerHTML = '';
  const yearId = document.getElementById('adm-cv-year').value;
  const classId = document.getElementById('adm-cv-class').value;
  let valid = true;
  if (!yearId) { _admSetErr('adm-cv-year-err', 'This field is required.'); valid = false; }
  if (!classId) { _admSetErr('adm-cv-class-err', 'This field is required.'); valid = false; }
  if (!valid) return;

  const joining = document.getElementById('adm-cv-joining').value;
  const termId = document.getElementById('adm-cv-term').value;
  const payload = {
    academic_year_id: parseInt(yearId),
    class_id: parseInt(classId),
    joining_date: joining || null,
    gender: _admConvertGender,
    student_type: _admConvertStudentType,
    term_id: termId ? parseInt(termId) : null,
  };
  const res = await apiFetch(`${_ADM_API}/${id}/convert`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    const data = await res.json();
    _admCloseModal('adm-convert-modal');
    showToast(`${data.applicant.applicant_ref} converted to Student ${data.student_ref}.`, 'success');
    _currentEditStudentId = data.student_id;
    loadView('students-view');
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  if (_admClassifyConvertError(detail) === 'class') {
    document.getElementById('adm-cv-class-err').textContent = detail;
  } else {
    document.getElementById('adm-cv-err').innerHTML = `<div class="fin-field-error">${_admEsc(detail)}</div>`;
  }
}
