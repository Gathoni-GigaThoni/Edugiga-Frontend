// ==================== ASSET LOCATION — CATALOG + REGISTER SLICE ====================
// Two-tab page:
//   • Catalog   — CRUD + merge for the AssetLocation master
//                 (/api/asset-locations). Gated on asset_management.locations.
//   • Register  — the by-location register slice
//                 (/api/fixed-assets/by-location?asset_location_id=…).
// This file also exports the shared location cache + picker helpers used
// everywhere a location dropdown appears (asset-create, promote-draft,
// bulk-from-line, movement form, by-location filter).
//
// The 2026-10-06 backend re-engineer dropped SchoolClass + free-text location
// dimensions. School-class ids are no longer location ids — a single
// CLASSROOM-typed AssetLocation per legacy class was spawned at migration
// time, but their ids don't match the class ids and operators are expected
// to walk the catalog to rename cohort rows into room rows (e.g. "Oak A").

const _AL_API = `${API_BASE}/asset-locations`;

// ── Shared location cache + picker helpers ─────────────────────────────────
// Cache holds every location (active + inactive) so a history row pointing
// at a since-deactivated location still resolves to its real name. Fetched
// once per session, busted after any mutation.
let _assetLocationsCache = null;        // { byId: Map<id, loc>, list: loc[] }
let _assetLocationsLoadPromise = null;
const _assetLocationLazyFetches = {};   // id -> Promise<loc|null>, backfill for cache misses

const _AL_TYPE_LABELS = {
  classroom: 'Classroom',
  office:    'Office',
  storage:   'Storage',
  kitchen:   'Kitchen',
  dining:    'Dining',
  staffroom: 'Staffroom',
  grounds:   'Grounds',
  transport: 'Transport',
  sickbay:   'Sickbay',
  reception: 'Reception',
  other:     'Other',
};
const _AL_TYPE_ORDER = Object.keys(_AL_TYPE_LABELS);
function _alTypeLabel(t) { return _AL_TYPE_LABELS[t] || (t ? String(t) : '—'); }

function _alBuildCache(rows) {
  const byId = new Map();
  (rows || []).forEach(r => byId.set(r.id, r));
  return { byId, list: rows || [] };
}
function _alPrimeCache(row) {
  if (!row || row.id == null) return;
  if (_assetLocationsCache) _assetLocationsCache.byId.set(row.id, row);
}
async function _invEnsureAssetLocationsCache(force = false) {
  if (!force && _assetLocationsCache) return _assetLocationsCache;
  if (!force && _assetLocationsLoadPromise) return _assetLocationsLoadPromise;
  _assetLocationsLoadPromise = (async () => {
    const res = await apiFetch(`${_AL_API}/`);
    const rows = (res && res.ok) ? _toArray(await res.json()) : [];
    _assetLocationsCache = _alBuildCache(rows);
    return _assetLocationsCache;
  })();
  try { return await _assetLocationsLoadPromise; }
  finally { _assetLocationsLoadPromise = null; }
}
function _invAssetLocationsBustCache() {
  _assetLocationsCache = null;
  _assetLocationsLoadPromise = null;
  for (const k of Object.keys(_assetLocationLazyFetches)) delete _assetLocationLazyFetches[k];
}
function _invAssetLocationLookup(id) {
  if (!_assetLocationsCache) return null;
  return _assetLocationsCache.byId.get(Number(id)) || null;
}

// Synchronous name — the common case (cache has the row). A missing id goes
// through _invAssetLocationLabelAsync (async, fallback via GET /{id}) and
// defers to the caller to re-render.
function _invAssetLocationLabel(id) {
  if (id == null) return '—';
  const row = _invAssetLocationLookup(id);
  if (!row) return `Location #${id}`;
  return row.is_active ? row.name : `${row.name} (inactive)`;
}
// Lazy fallback: a history row pointing at a hard-deleted location misses
// the cache. We fetch the single row once, prime the cache and return the
// resolved label; a 404 returns null and the caller renders a deleted-row
// marker. Caches both outcomes so a page scrolling through 100 rows pointing
// at the same since-removed location only hits the server once.
async function _invAssetLocationLabelAsync(id) {
  if (id == null) return '—';
  const row = _invAssetLocationLookup(id);
  if (row) return _invAssetLocationLabel(id);
  if (_assetLocationLazyFetches[id]) return _assetLocationLazyFetches[id].then(r => r ? _invAssetLocationLabel(id) : `Location #${id} (deleted)`);
  _assetLocationLazyFetches[id] = (async () => {
    const res = await apiFetch(`${_AL_API}/${id}`);
    if (res && res.ok) { const r = await res.json(); _alPrimeCache(r); return r; }
    return null;
  })();
  const r = await _assetLocationLazyFetches[id];
  return r ? _invAssetLocationLabel(id) : `Location #${id} (deleted)`;
}

// Grouped-by-type <select>. The trailing "+ Create new location…" option
// uses a sentinel value; a change listener handles the sentinel branch via
// _invHandleAssetLocationCreateSentinel. Inactive locations are kept
// selectable when they are the currently-selected id, so opening a form on
// a record pointing at a since-deactivated location doesn't silently drop
// it.
const _AL_CREATE_SENTINEL = '__create__';
function _invAssetLocationPickerHtml(selectId, selectedId, opts = {}) {
  const allowCreate = opts.allowCreate !== false && canAdd('asset_management.locations');
  const required = !!opts.required;
  const placeholder = opts.placeholder || (required ? 'Please Select' : '— Unplaced —');
  const list = (_assetLocationsCache?.list || []).slice();
  const activeSelected = selectedId != null && _invAssetLocationLookup(selectedId)?.is_active;
  const selectedRow = selectedId != null ? _invAssetLocationLookup(selectedId) : null;
  // Keep inactive rows out of the main group list unless the operator is
  // sitting on one (e.g. editing a record pointed at it).
  const pickable = list.filter(l => l.is_active);
  const groups = _AL_TYPE_ORDER.map(type => ({
    type,
    label: _alTypeLabel(type),
    rows: pickable.filter(l => l.location_type === type)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
  })).filter(g => g.rows.length);
  const groupHtml = groups.map(g => `
    <optgroup label="${_finEsc(g.label)}">
      ${g.rows.map(r => `<option value="${r.id}" ${String(r.id) === String(selectedId) ? 'selected' : ''}>${_finEsc(r.name)}${r.building ? ` — ${_finEsc(r.building)}` : ''}</option>`).join('')}
    </optgroup>`).join('');
  const inactivePinned = selectedRow && !activeSelected
    ? `<option value="${selectedRow.id}" selected>${_finEsc(selectedRow.name)} (inactive)</option>`
    : (selectedId != null && !selectedRow
        ? `<option value="${selectedId}" selected>Location #${selectedId} (unknown)</option>`
        : '');
  const createOpt = allowCreate
    ? `<option disabled>──────────</option><option value="${_AL_CREATE_SENTINEL}">+ Create new location…</option>`
    : '';
  return `
    <select id="${selectId}" class="fin-form-select" data-asset-location-picker="1" onchange="_invHandleAssetLocationCreateSentinel(this)">
      <option value="">${_finEsc(placeholder)}</option>
      ${inactivePinned}
      ${groupHtml}
      ${createOpt}
    </select>`;
}
// Sentinel handler: when the operator picks "+ Create new location…", pop the
// create modal; on success, refresh every live picker on the page so the new
// row is listed and auto-select it on the one that triggered the modal.
function _invHandleAssetLocationCreateSentinel(sel) {
  if (!sel || sel.value !== _AL_CREATE_SENTINEL) return;
  const triggerId = sel.id;
  // Revert the sentinel pick immediately so the dropdown doesn't display
  // "+ Create new location…" while the modal is open.
  sel.value = '';
  _invOpenAssetLocationCreate({
    onCreated: created => {
      _invRefreshAssetLocationPickers(triggerId, created.id);
    },
  });
}
// Refreshes every data-asset-location-picker on the page from the cache so
// a new row shows up without a full view reload. The picker that triggered
// the create keeps its new id; every other picker keeps whatever it had.
function _invRefreshAssetLocationPickers(triggerSelectId, selectedForTrigger) {
  document.querySelectorAll('select[data-asset-location-picker="1"]').forEach(el => {
    const current = el.id === triggerSelectId ? selectedForTrigger : (el.value || null);
    const parent = el.parentElement;
    if (!parent) return;
    const html = _invAssetLocationPickerHtml(el.id, current);
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const fresh = tmp.firstElementChild;
    el.replaceWith(fresh);
  });
}

// ── Inline Create Location modal ────────────────────────────────────────
function _invOpenAssetLocationCreate(opts = {}) {
  const wrap = document.createElement('div');
  wrap.id = 'al-create-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10001;overflow:auto;padding:24px;';
  const parentOpts = (_assetLocationsCache?.list || [])
    .filter(l => l.is_active)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(l => `<option value="${l.id}">${_finEsc(l.name)}</option>`).join('');
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:480px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Create Location</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Name <span class="fin-required">*</span></label>
        <input type="text" id="al-c-name" class="fin-form-input" maxlength="120" autocomplete="off">
        <span class="fin-field-error" id="al-c-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Type <span class="fin-required">*</span></label>
        <select id="al-c-type" class="fin-form-select">
          <option value="">Please Select</option>
          ${_AL_TYPE_ORDER.map(t => `<option value="${t}">${_finEsc(_alTypeLabel(t))}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="al-c-type-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Parent Location</label>
        <select id="al-c-parent" class="fin-form-select">
          <option value="">(none)</option>
          ${parentOpts}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Building</label>
        <input type="text" id="al-c-building" class="fin-form-input" maxlength="80">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="al-c-notes" class="fin-form-textarea" rows="2" maxlength="1000"></textarea>
      </div>
      <div id="al-c-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('al-create-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" id="al-c-submit" onclick="_invSubmitAssetLocationCreate()">Create</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.__onCreated = opts.onCreated || null;
  setTimeout(() => document.getElementById('al-c-name')?.focus(), 50);
}
async function _invSubmitAssetLocationCreate() {
  const setErr = (id, msg) => { const e = document.getElementById(id); if (e) e.textContent = msg; };
  ['al-c-name-err', 'al-c-type-err'].forEach(id => setErr(id, ''));
  const name = document.getElementById('al-c-name').value.trim();
  const type = document.getElementById('al-c-type').value;
  let valid = true;
  if (!name) { setErr('al-c-name-err', 'Name is required.'); valid = false; }
  if (!type) { setErr('al-c-type-err', 'Type is required.'); valid = false; }
  if (!valid) return;
  const payload = { name, location_type: type };
  const parent = document.getElementById('al-c-parent').value;
  if (parent) payload.parent_location_id = parseInt(parent, 10);
  const building = document.getElementById('al-c-building').value.trim();
  if (building) payload.building = building;
  const notes = document.getElementById('al-c-notes').value.trim();
  if (notes) payload.notes = notes;
  const btn = document.getElementById('al-c-submit');
  if (btn) btn.disabled = true;
  const res = await apiFetch(`${_AL_API}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (btn) btn.disabled = false;
  if (res && res.ok) {
    const created = await res.json();
    _invAssetLocationsBustCache();
    await _invEnsureAssetLocationsCache(true);
    const overlay = document.getElementById('al-create-modal-overlay');
    const cb = overlay?.__onCreated;
    _coaCloseModal('al-create-modal-overlay');
    showToast(`Location "${created.name}" created.`, 'success');
    if (cb) cb(created);
    // Catalog table (if open) refreshes to reflect the new row.
    if (typeof _falCatalogRender === 'function') _falCatalogRender();
    return;
  }
  const msgEl = document.getElementById('al-c-msg');
  if (res) _pvShowCoralMsg(msgEl, await parseApiError(res));
  else _pvShowCoralMsg(msgEl, 'Network error. Nothing was saved.');
}

// ==================== Asset Location page (two tabs) ====================

let _falActiveTab = 'catalog';     // 'catalog' | 'register'

async function loadAssetLocationView(container) {
  container.innerHTML = `<p style="color:#888;padding:20px;">Loading&#8230;</p>`;
  await Promise.all([_invEnsureAssetLocationsCache(true), _acLoadCategories(), _faEnsurePlacementLookups()]);
  const tabs = [
    { key: 'catalog',  label: 'Catalog' },
    { key: 'register', label: 'Register slice' },
  ];
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Asset Location</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Assets &rsaquo; Asset Location</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        ${tabs.map(t => `<button class="${_falActiveTab===t.key?'fin-btn-teal':'fin-btn-outline'}" onclick="_falSwitchTab('${t.key}')">${t.label}</button>`).join('')}
      </div>
      <div id="fal-tab-body"></div>
    </div>`;
  _falRenderActiveTab();
}
function _falSwitchTab(tab) {
  _falActiveTab = tab;
  const container = document.getElementById('main-content');
  if (!container) return;
  // Rebuild just the tab buttons + body — simplest and keeps form state out
  // of the way (switching tabs is a clean reset).
  loadAssetLocationView(container);
}
function _falRenderActiveTab() {
  const el = document.getElementById('fal-tab-body');
  if (!el) return;
  if (_falActiveTab === 'register') _falRegisterTab(el);
  else _falCatalogTab(el);
}

// ── Tab 1: Catalog ──────────────────────────────────────────────────────
let _falCatFilterType = '';
let _falCatFilterActive = 'active';   // 'active' | 'inactive' | 'all'
let _falCatSearch = '';

function _falCatalogTab(el) {
  el.innerHTML = `
    <div class="fin-filter-section">
      <div style="display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;">
        <div class="fin-filter-field" style="min-width:180px;">
          <label class="fin-filter-label">Type</label>
          <select id="fal-cat-type" class="fin-filter-input" onchange="_falCatFiltersChanged()">
            <option value="">All types</option>
            ${_AL_TYPE_ORDER.map(t => `<option value="${t}" ${_falCatFilterType===t?'selected':''}>${_finEsc(_alTypeLabel(t))}</option>`).join('')}
          </select>
        </div>
        <div class="fin-filter-field" style="min-width:160px;">
          <label class="fin-filter-label">Status</label>
          <select id="fal-cat-active" class="fin-filter-input" onchange="_falCatFiltersChanged()">
            <option value="active"   ${_falCatFilterActive==='active'  ?'selected':''}>Active only</option>
            <option value="inactive" ${_falCatFilterActive==='inactive'?'selected':''}>Inactive only</option>
            <option value="all"      ${_falCatFilterActive==='all'     ?'selected':''}>All</option>
          </select>
        </div>
        <div class="fin-filter-field" style="flex:1;min-width:220px;">
          <label class="fin-filter-label">Search</label>
          <input type="text" id="fal-cat-q" class="fin-filter-input" value="${_finEsc(_falCatSearch)}" placeholder="Name contains…" oninput="_falCatFiltersChanged()">
        </div>
        ${canAdd('asset_management.locations') ? `
          <div style="align-self:flex-end;">
            <button class="fin-btn-teal" onclick="_invOpenAssetLocationCreate({ onCreated: () => _falCatalogRender() })">+ Add Location</button>
          </div>` : ''}
      </div>
    </div>
    <div id="fal-cat-body"></div>`;
  _falCatalogRender();
}
function _falCatFiltersChanged() {
  _falCatFilterType = document.getElementById('fal-cat-type').value || '';
  _falCatFilterActive = document.getElementById('fal-cat-active').value || 'active';
  _falCatSearch = document.getElementById('fal-cat-q').value || '';
  _falCatalogRender();
}
function _falCatalogRows() {
  const list = (_assetLocationsCache?.list || []).slice();
  const q = _falCatSearch.trim().toLowerCase();
  return list.filter(l => {
    if (_falCatFilterType && l.location_type !== _falCatFilterType) return false;
    if (_falCatFilterActive === 'active' && !l.is_active) return false;
    if (_falCatFilterActive === 'inactive' && l.is_active) return false;
    if (q && !(l.name || '').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    const ta = _AL_TYPE_ORDER.indexOf(a.location_type);
    const tb = _AL_TYPE_ORDER.indexOf(b.location_type);
    return ta - tb || (a.name || '').localeCompare(b.name || '');
  });
}
function _falCatalogRender() {
  const el = document.getElementById('fal-cat-body');
  if (!el) return;
  const rows = _falCatalogRows();
  const canE = canEdit('asset_management.locations');
  const canD = canDelete('asset_management.locations');
  if (!rows.length) {
    el.innerHTML = `<p style="padding:24px;text-align:center;color:var(--grey-600,#666);">No locations match this filter.</p>`;
    return;
  }
  const parentName = pid => pid == null ? _FA_MUTED_DASH : _finEsc(_invAssetLocationLabel(pid));
  const body = rows.map(l => {
    const actions = [];
    if (canE) actions.push(`<button class="fin-btn-outline" style="padding:4px 10px;font-size:0.8rem;" onclick="_falOpenEdit(${l.id})">Edit</button>`);
    if (canE && l.is_active) actions.push(`<button class="fin-btn-outline" style="padding:4px 10px;font-size:0.8rem;" onclick="_falDeactivate(${l.id})">Deactivate</button>`);
    if (canE && !l.is_active) actions.push(`<button class="fin-btn-outline" style="padding:4px 10px;font-size:0.8rem;" onclick="_falReactivate(${l.id})">Reactivate</button>`);
    if (canE) actions.push(`<button class="fin-btn-outline" style="padding:4px 10px;font-size:0.8rem;" onclick="_falOpenMerge(${l.id})">Merge into…</button>`);
    if (canD) actions.push(`<button class="fin-btn-cancel" style="padding:4px 10px;font-size:0.8rem;" onclick="_falConfirmDelete(${l.id})">Delete</button>`);
    return `<tr style="${l.is_active ? '' : 'background:#fafafa;color:var(--grey-500,#888);'}">
      <td><strong>${_finEsc(l.name)}</strong>${l.notes ? ` <span style="font-size:11px;color:var(--grey-500,#888);" title="${_finEsc(l.notes)}">&#9432;</span>` : ''}</td>
      <td>${_finEsc(_alTypeLabel(l.location_type))}</td>
      <td>${l.building ? _finEsc(l.building) : _FA_MUTED_DASH}</td>
      <td>${parentName(l.parent_location_id)}</td>
      <td>${l.is_active ? '<span style="color:#1e7e34;">Active</span>' : '<span style="color:var(--grey-500,#888);">Inactive</span>'}</td>
      <td style="text-align:right;white-space:nowrap;"><span style="display:inline-flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">${actions.join('')}</span></td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <div style="font-size:0.85rem;color:var(--grey-600,#666);margin:0 0 8px;">${rows.length} location${rows.length===1?'':'s'}</div>
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>NAME</th><th>TYPE</th><th>BUILDING</th><th>PARENT</th><th>STATUS</th><th style="text-align:right;">ACTIONS</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
}

// ── Catalog actions ──────────────────────────────────────────────────────
function _falOpenEdit(id) {
  const row = _invAssetLocationLookup(id);
  if (!row) return;
  const wrap = document.createElement('div');
  wrap.id = 'al-edit-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10001;overflow:auto;padding:24px;';
  const parentOpts = (_assetLocationsCache?.list || [])
    .filter(l => l.is_active && l.id !== row.id)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(l => `<option value="${l.id}" ${String(l.id)===String(row.parent_location_id)?'selected':''}>${_finEsc(l.name)}</option>`).join('');
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:480px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Edit Location</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Name <span class="fin-required">*</span></label>
        <input type="text" id="al-e-name" class="fin-form-input" maxlength="120" value="${_finEsc(row.name || '')}">
        <span class="fin-field-error" id="al-e-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Type</label>
        <select id="al-e-type" class="fin-form-select">
          ${_AL_TYPE_ORDER.map(t => `<option value="${t}" ${t===row.location_type?'selected':''}>${_finEsc(_alTypeLabel(t))}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Parent Location</label>
        <select id="al-e-parent" class="fin-form-select">
          <option value="">(none)</option>
          ${parentOpts}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Building</label>
        <input type="text" id="al-e-building" class="fin-form-input" maxlength="80" value="${_finEsc(row.building || '')}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="al-e-notes" class="fin-form-textarea" rows="2" maxlength="1000">${_finEsc(row.notes || '')}</textarea>
      </div>
      <div id="al-e-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('al-edit-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" id="al-e-submit" onclick="_falSubmitEdit(${row.id})">Save</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _falSubmitEdit(id) {
  const setErr = (iid, msg) => { const e = document.getElementById(iid); if (e) e.textContent = msg; };
  setErr('al-e-name-err', '');
  const row = _invAssetLocationLookup(id);
  if (!row) { _coaCloseModal('al-edit-modal-overlay'); return; }
  const name = document.getElementById('al-e-name').value.trim();
  if (!name) { setErr('al-e-name-err', 'Name is required.'); return; }
  // Diff against the baseline so a straight save doesn't send a storm of
  // unchanged fields (and avoids a wasted name-collision check).
  const payload = {};
  if (name !== row.name) payload.name = name;
  const type = document.getElementById('al-e-type').value;
  if (type !== row.location_type) payload.location_type = type;
  const parentVal = document.getElementById('al-e-parent').value;
  const parentId = parentVal ? parseInt(parentVal, 10) : null;
  if ((row.parent_location_id || null) !== parentId) payload.parent_location_id = parentId;
  const building = document.getElementById('al-e-building').value.trim();
  if ((row.building || '') !== building) payload.building = building || null;
  const notes = document.getElementById('al-e-notes').value.trim();
  if ((row.notes || '') !== notes) payload.notes = notes || null;
  if (!Object.keys(payload).length) { _coaCloseModal('al-edit-modal-overlay'); return; }
  const btn = document.getElementById('al-e-submit');
  if (btn) btn.disabled = true;
  const res = await apiFetch(`${_AL_API}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (btn) btn.disabled = false;
  if (res && res.ok) {
    _invAssetLocationsBustCache();
    await _invEnsureAssetLocationsCache(true);
    _coaCloseModal('al-edit-modal-overlay');
    showToast('Location updated.', 'success');
    _falCatalogRender();
    return;
  }
  _pvShowCoralMsg(document.getElementById('al-e-msg'), res ? await parseApiError(res) : 'Network error. Nothing was saved.');
}
async function _falDeactivate(id) {
  const row = _invAssetLocationLookup(id);
  if (!row || !confirm(`Deactivate "${row.name}"? History still renders, but new placements won't be able to target it.`)) return;
  const res = await apiFetch(`${_AL_API}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }) });
  if (res && res.ok) {
    _invAssetLocationsBustCache();
    await _invEnsureAssetLocationsCache(true);
    showToast('Location deactivated.', 'success');
    _falCatalogRender();
    return;
  }
  if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
async function _falReactivate(id) {
  const row = _invAssetLocationLookup(id);
  if (!row) return;
  const res = await apiFetch(`${_AL_API}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: true }) });
  if (res && res.ok) {
    _invAssetLocationsBustCache();
    await _invEnsureAssetLocationsCache(true);
    showToast('Location reactivated.', 'success');
    _falCatalogRender();
    return;
  }
  if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
async function _falConfirmDelete(id) {
  const row = _invAssetLocationLookup(id);
  if (!row || !confirm(`Delete "${row.name}" permanently? Hard delete is refused if the location has ever been referenced — use Deactivate for soft delete instead.`)) return;
  const res = await apiFetch(`${_AL_API}/${id}`, { method: 'DELETE' });
  if (res && (res.status === 204 || res.ok)) {
    _invAssetLocationsBustCache();
    await _invEnsureAssetLocationsCache(true);
    showToast('Location deleted.', 'success');
    _falCatalogRender();
    return;
  }
  // 409 body carries the exact blocker — show verbatim so the operator
  // knows which references pin it.
  if (res) showToast(await parseApiError(res), 'error');
}

// ── Merge ───────────────────────────────────────────────────────────────
function _falOpenMerge(mergeId) {
  const row = _invAssetLocationLookup(mergeId);
  if (!row) return;
  const wrap = document.createElement('div');
  wrap.id = 'al-merge-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10001;overflow:auto;padding:24px;';
  const targetOpts = (_assetLocationsCache?.list || [])
    .filter(l => l.id !== mergeId && l.is_active)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(l => `<option value="${l.id}">${_finEsc(l.name)} — ${_finEsc(_alTypeLabel(l.location_type))}</option>`).join('');
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:520px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 6px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Merge "${_finEsc(row.name)}" into…</h3>
      <p style="margin:0 0 14px;font-size:0.85rem;color:var(--grey-600,#666);">Every reference to "${_finEsc(row.name)}" is rewritten to point at the chosen target. "${_finEsc(row.name)}" is then removed. The merge is logged for audit — this cannot be undone from the UI.</p>
      <div class="fin-form-group">
        <label class="fin-form-label">Target (keep) <span class="fin-required">*</span></label>
        <select id="al-m-keep" class="fin-form-select"><option value="">Please Select</option>${targetOpts}</select>
        <span class="fin-field-error" id="al-m-keep-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
        <textarea id="al-m-reason" class="fin-form-textarea" rows="2" maxlength="500" placeholder="e.g. Duplicate — same room, two naming variants."></textarea>
        <span class="fin-field-error" id="al-m-reason-err"></span>
      </div>
      <div id="al-m-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('al-merge-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" id="al-m-submit" onclick="_falSubmitMerge(${mergeId})">Merge</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _falSubmitMerge(mergeId) {
  const setErr = (id, msg) => { const e = document.getElementById(id); if (e) e.textContent = msg; };
  ['al-m-keep-err', 'al-m-reason-err'].forEach(id => setErr(id, ''));
  const keep = document.getElementById('al-m-keep').value;
  const reason = document.getElementById('al-m-reason').value.trim();
  let valid = true;
  if (!keep) { setErr('al-m-keep-err', 'Pick a target location.'); valid = false; }
  if (reason.length < 3) { setErr('al-m-reason-err', 'Reason must be at least 3 characters.'); valid = false; }
  if (!valid) return;
  const btn = document.getElementById('al-m-submit');
  if (btn) btn.disabled = true;
  const res = await apiFetch(`${_AL_API}/${keep}/merge-from/${mergeId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
  });
  if (btn) btn.disabled = false;
  if (res && res.ok) {
    const data = await res.json();
    _invAssetLocationsBustCache();
    await _invEnsureAssetLocationsCache(true);
    _coaCloseModal('al-merge-modal-overlay');
    showToast(`Merged. Rewrote ${data.fixed_assets_rewritten} asset(s) and ${data.movements_rewritten} movement(s).`, 'success');
    _falCatalogRender();
    return;
  }
  _pvShowCoralMsg(document.getElementById('al-m-msg'), res ? await parseApiError(res) : 'Network error. Nothing was saved.');
}

// ── Tab 2: Register slice ───────────────────────────────────────────────
let _falRegLocationId = '';
let _falRegIncludeDisposed = false;
let _falRegItems = [];
let _falRegSeq = 0;

function _falRegisterTab(el) {
  el.innerHTML = `
    <div class="fin-filter-section">
      <div style="display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;">
        <div class="fin-filter-field" style="flex:1;min-width:260px;max-width:380px;">
          <label class="fin-filter-label">Location</label>
          ${_invAssetLocationPickerHtml('fal-reg-loc', _falRegLocationId || null, { allowCreate: false, placeholder: 'Pick a location' })}
        </div>
        <label style="display:inline-flex;align-items:center;cursor:pointer;font-size:0.9rem;">
          <input type="checkbox" id="fal-reg-disposed" style="width:auto;max-width:none;margin:0 6px 0 0;padding:0;display:inline-block;vertical-align:middle;cursor:pointer;accent-color:var(--navy-700);" ${_falRegIncludeDisposed?'checked':''} onchange="_falRegToggleDisposed(this.checked)">
          Include disposed
        </label>
      </div>
    </div>
    <div id="fal-reg-body"></div>`;
  const sel = document.getElementById('fal-reg-loc');
  if (sel) sel.addEventListener('change', e => {
    if (e.target.value === _AL_CREATE_SENTINEL) return;  // sentinel handler already ran
    _falRegLocationId = e.target.value || '';
    _falRegLoad();
  });
  _falRegLoad();
}
function _falRegToggleDisposed(on) {
  _falRegIncludeDisposed = on;
  _falRegLoad();
}
async function _falRegLoad() {
  const el = document.getElementById('fal-reg-body');
  if (!el) return;
  const seq = ++_falRegSeq;
  if (!_falRegLocationId) {
    _falRegItems = [];
    el.innerHTML = `<p style="padding:24px;text-align:center;color:var(--grey-600,#666);">Pick a location to see the assets currently placed there.</p>`;
    return;
  }
  const params = new URLSearchParams({ asset_location_id: _falRegLocationId });
  if (_falRegIncludeDisposed) params.set('include_disposed', 'true');
  el.innerHTML = `<p style="color:#888;padding:12px 0;">Loading&#8230;</p>`;
  const res = await apiFetch(`${_FA_API}/by-location?${params.toString()}`);
  if (seq !== _falRegSeq) return;
  if (!res || !res.ok) {
    _falRegItems = [];
    el.innerHTML = `<div style="padding:10px 14px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.88rem;">Could not load assets: ${_finEsc(res ? await parseApiError(res) : 'The server could not be reached.')}</div>`;
    return;
  }
  _falRegItems = _toArray(await res.json());
  _falRegItems.forEach(_faRememberAsset);
  _falRegRender();
}
function _falRegRender() {
  const el = document.getElementById('fal-reg-body');
  if (!el) return;
  const n = _falRegItems.length;
  const locName = _invAssetLocationLabel(_falRegLocationId);
  const head = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:6px 0 8px;">
      <span style="font-size:0.85rem;color:var(--grey-600,#666);">${n} asset${n===1?'':'s'} in <strong>${_finEsc(locName)}</strong></span>
      <button class="fin-btn-outline" style="padding:6px 14px!important;font-size:0.85rem;" onclick="openAssetLocationSummary(${Number(_falRegLocationId)})">Print Location Summary</button>
    </div>`;
  if (!n) {
    el.innerHTML = `${head}<div style="padding:28px 12px;text-align:center;color:var(--grey-600,#666);font-size:0.9rem;">No assets at this location.</div>`;
    return;
  }
  const pill = (label, colors) => `<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:9px;font-size:0.68rem;font-weight:700;vertical-align:middle;${colors}">${label}</span>`;
  const btn = 'padding:4px 12px!important;font-size:0.8rem;';
  const rows = _falRegItems.map(a => {
    const custodian = _faCustodianName(a.current_custodian_employee_id);
    const flag = a.is_disposed ? pill('Disposed', 'color:#fff;background:var(--coral-500,#D94040);')
      : a.status === 'draft' ? pill('Draft', 'color:#8a6d00;background:#f5e6a8;') : '';
    const move = !_faCanMove(a) ? ''
      : a.is_disposed ? `<button class="fin-btn-outline" style="${btn}" onclick="_faOpenMovementModal(${a.id}, 'verification')">Verify</button>`
      : `<button class="fin-btn-outline" style="${btn}" onclick="_faOpenMovementModal(${a.id}, 'transfer')">Move</button>`;
    return `<tr data-id="${a.id}">
      <td style="white-space:nowrap;"><strong>${_finEsc(a.asset_tag || '—')}</strong>${flag}</td>
      <td>${a.description ? _faTrunc(a.description, 50) : _FA_MUTED_DASH}</td>
      <td>${_finEsc(_acCategoryName(a.category_id))}</td>
      <td>${custodian ? _finEsc(custodian) : _FA_MUTED_DASH}</td>
      <td style="text-align:right;white-space:nowrap;">${_faMoney(a.acquisition_cost)}</td>
      <td style="text-align:right;white-space:nowrap;"><span style="display:inline-flex;gap:6px;">
        <button class="fin-btn-outline" style="${btn}" onclick="_faOpenInRegister(${a.id})">View</button>${move}</span></td>
    </tr>`;
  }).join('');
  el.innerHTML = `${head}<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>ASSET TAG</th><th>DESCRIPTION</th><th>CATEGORY</th><th>CUSTODIAN</th><th style="text-align:right;">ACQUISITION COST</th><th style="text-align:right;">ACTIONS</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ── Printable Location Asset Summary ─────────────────────────────────────
// For sign-offs — the custodian and bursar sign a printed copy. window.open
// runs before any await so the popup blocker still counts it as part of the
// click.
async function openAssetLocationSummary(locationId) {
  const win = window.open('', '_blank');
  if (!win) { showToast('Please allow pop-ups to open the location asset summary.', 'error'); return; }
  win.document.write('<p style="font-family:Arial,sans-serif;padding:24px;color:#888;">Loading location asset summary&#8230;</p>');
  let summary = null;
  let error = '';
  try {
    const res = await apiFetch(`${_FA_API}/summary-by-location/${encodeURIComponent(locationId)}`);
    if (res && res.ok) summary = await res.json();
    else error = res ? await parseApiError(res) : 'The server could not be reached.';
  } catch (_) {
    error = 'The server could not be reached.';
  }
  if (win.closed) return;
  win.document.open();
  win.document.write(summary ? _falLocationSummaryDocHtml(summary) : `<html><head><title>Asset Location Summary</title></head>
    <body style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:30px auto;padding:0 16px;">
      <h2 style="color:#1d2d50;">Could not load the location asset summary</h2>
      <p style="color:#c0392b;">${_finEsc(error)}</p>
    </body></html>`);
  win.document.close();
}

function _falLocationSummaryDocHtml(s) {
  const rows = _toArray(s.rows);
  const count = Number(s.total_asset_count) || 0;
  const name = s.asset_location_name || _invAssetLocationLabel(s.asset_location_id);
  const typeLabel = _alTypeLabel(s.location_type);
  const printedOn = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const body = rows.length
    ? rows.map(r => `<tr>
        <td>${_finEsc(r.category_code ? `${r.category_code} — ${r.category_name}` : r.category_name)}</td>
        <td class="num">${Number(r.asset_count) || 0}</td>
        <td class="num">${_finEsc(formatKES(r.total_acquisition_cost))}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="empty">No assets are currently placed in this location.</td></tr>`;
  const sign = role => `<div class="sign">
      <div class="sign-line"><span>${role}:</span><span class="line"></span></div>
      <div class="sign-line"><span>Date:</span><span class="line short"></span></div>
    </div>`;
  return soisPrintDocHtml({
    title: `Asset Location Summary - ${name}`,
    docTitle: 'Asset Location Summary',
    bodyHtml: `
      <p class="headline">${_finEsc(name)} <span class="type-pill">${_finEsc(typeLabel)}</span> &mdash; ${count} asset${count === 1 ? '' : 's'}, ${_finEsc(formatKES(s.total_acquisition_cost))}</p>
      <p class="sois-meta">Printed on ${_finEsc(printedOn)}</p>
      <table class="fal-table">
        <thead><tr><th>Category</th><th class="num">Count</th><th class="num">&Sigma; Acquisition Cost</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${count}</td><td class="num">${_finEsc(formatKES(s.total_acquisition_cost))}</td></tr></tfoot>
      </table>
      <p class="sois-footnote">Assets the register currently places in this location. Rejected and disposed assets are not included.</p>
      <div class="signatures">${sign('Custodian')}${sign('Bursar')}</div>`,
    extraCss: `
      .headline{text-align:center;font-size:1.05rem;margin:0 0 4px;}
      .type-pill{display:inline-block;margin-left:6px;padding:1px 9px;border-radius:10px;font-size:0.74rem;background:#1d2d50;color:#fff;font-weight:600;vertical-align:middle;}
      .fal-table{border:1px solid #d8d8d8;}
      .fal-table th{background:#1d2d50;color:#fff;text-align:left;padding:10px 16px;}
      .fal-table td{padding:9px 16px;border-bottom:1px solid #eee;font-size:0.9rem;}
      .fal-table th.num,.fal-table td.num{text-align:right;}
      .fal-table td.empty{text-align:center;color:#777;padding:18px;}
      .fal-table tfoot td{background:#c9a227;font-weight:700;border-bottom:none;}
      .signatures{display:flex;gap:48px;margin-top:56px;}
      .sign{flex:1;font-size:0.9rem;}
      .sign-line{display:flex;align-items:flex-end;gap:8px;margin-bottom:26px;}
      .line{flex:1;border-bottom:1px solid #222;height:1.1em;}
      .line.short{flex:0 0 120px;}`,
  });
}
