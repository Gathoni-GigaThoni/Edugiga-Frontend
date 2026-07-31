// ==================== INVENTORY MODULE (BE/FE Contract Addendum 2026-07-29) ====
// Modeled on the split-view CRUD pattern (renderSplitView, js/dashboard.js:611)
// and the Fixed Assets / Requisitions reference implementations
// (js/fixed-assets.js, js/procurement.js).
const _INV_API = `${API_BASE}/inventory`;

function _invEsc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Signed-value renderers — the sign itself is the informational value
// (§4.3, §7.6), so these always show it explicitly rather than relying on
// a bare negative number. Shared across the Stock Ledger, Transfers,
// Adjustments and Stock-Takes.
function _invSignedQty(v) {
  const n = parseFloat(v) || 0;
  const formatted = formatQty(Math.abs(n));
  return n > 0 ? `+${formatted}` : (n < 0 ? `−${formatted}` : formatted);
}
function _invSignedMoney(v) {
  const n = parseFloat(v) || 0;
  const formatted = formatKES(Math.abs(n));
  return n > 0 ? `+${formatted}` : (n < 0 ? `−${formatted}` : formatted);
}
function _invSignedColor(v) {
  const n = parseFloat(v) || 0;
  return n > 0 ? 'var(--navy-700,#1B3057)' : (n < 0 ? 'var(--coral-600,#B03030)' : '#666');
}

// Parses a FastAPI error body once, returning both a per-field map (for
// inline errors) and a flattened verbatim string (for banners/toasts) —
// unlike parseApiError(), this can drive field-level placement without a
// second res.json() call (a Response body can only be read once).
async function _invParseError(res) {
  let body = null;
  try { body = await res.json(); } catch (_) {}
  const detail = body?.detail;
  if (!detail) return { fieldErrors: {}, message: `HTTP ${res.status}` };
  if (typeof detail === 'string') return { fieldErrors: {}, message: detail };
  if (Array.isArray(detail)) {
    const fieldErrors = {};
    detail.forEach(e => {
      const loc = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : null;
      if (loc) fieldErrors[loc] = e.msg || 'Invalid value.';
    });
    const message = detail.map(e => {
      const loc = Array.isArray(e.loc) ? e.loc.filter(x => x !== 'body').join(' → ') : '';
      return loc ? `${loc}: ${e.msg || ''}` : (e.msg || JSON.stringify(e));
    }).join('; ');
    return { fieldErrors, message };
  }
  return { fieldErrors: {}, message: JSON.stringify(detail) };
}

// ── Shared cross-module lookups (suppliers, stores, stockable items, terms) ─
// Each new document type (GRN, Issues, Transfers, Adjustments, Stock-Takes)
// reuses these instead of re-fetching — one prefetch per view load, never a
// per-row lookup (§9.1 of the addendum).
let _invSuppliersCache = null;
let _invStoresCache = null;
let _invItemsCache = null;
let _invTermsCache = null;

async function _invEnsureSuppliersCache() {
  if (_invSuppliersCache) return;
  const res = await apiFetch(`${API_BASE}/suppliers/`);
  _invSuppliersCache = (res && res.ok) ? _toArray(await res.json()) : [];
}
function _invSupplierLabel(id) {
  if (id == null) return '—';
  const s = (_invSuppliersCache || []).find(x => String(x.id) === String(id));
  return s ? (s.name || `#${id}`) : `#${id}`;
}
function _invSupplierOptionsHtml(selectedId) {
  return (_invSuppliersCache || []).map(s =>
    `<option value="${s.id}" ${String(s.id) === String(selectedId) ? 'selected' : ''}>${_invEsc(s.name || '')}</option>`).join('');
}

async function _invEnsureStoresCache() {
  if (_invStoresCache) return;
  const res = await apiFetch(`${_INV_API}/stores?is_active=true`);
  _invStoresCache = (res && res.ok) ? _toArray(await res.json()) : [];
}
function _invStoreLabel(id) {
  if (id == null) return '—';
  const s = (_invStoresCache || []).find(x => String(x.id) === String(id));
  return s ? (s.code || s.name || `#${id}`) : `#${id}`;
}
function _invStoreOptionsHtml(selectedId) {
  return (_invStoresCache || []).map(s =>
    `<option value="${s.id}" ${String(s.id) === String(selectedId) ? 'selected' : ''}>${_invEsc(s.code || s.name || ('#' + s.id))}</option>`).join('');
}

async function _invEnsureItemsCache() {
  if (_invItemsCache) return;
  const res = await apiFetch(`${API_BASE}/finance/general-items/?is_stockable=true`);
  const rows = (res && res.ok) ? _toArray(await res.json()) : [];
  // Belt-and-suspenders client-side filter in case the backend ignores the
  // query param — never show a non-stockable or inactive item in a picker.
  _invItemsCache = rows.filter(it => it.is_stockable !== false && it.is_active !== false);
}
function _invItemLabel(id) {
  if (id == null) return '—';
  const it = (_invItemsCache || []).find(x => String(x.id) === String(id));
  if (!it) return `#${id}`;
  return `${it.name || ''}${it.code ? ' (' + it.code + ')' : ''}`.trim() || `#${id}`;
}

async function _invEnsureTermsCache() {
  if (_invTermsCache) return;
  const res = await apiFetch(`${API_BASE}/terms/`);
  _invTermsCache = (res && res.ok) ? _toArray(await res.json()) : [];
}
function _invTermLabel(id) {
  if (id == null) return '—';
  const t = (_invTermsCache || []).find(x => String(x.id) === String(id));
  if (!t) return `#${id}`;
  return t.title || t.name || `Term #${id}`;
}

// Populates a shared <datalist> with "name (code)" options and stashes a
// label->id map on window under mapKey — same convention as the Student
// datalist pickers (js/supplies.js _suppPopulateStudentDatalist).
function _invPopulateItemDatalist(listId, mapKey) {
  const dl = document.getElementById(listId);
  if (!dl) return;
  window[mapKey] = {};
  dl.innerHTML = (_invItemsCache || []).map(it => {
    const label = `${it.name || ''}${it.code ? ' (' + it.code + ')' : ''}`.trim();
    window[mapKey][label] = it.id;
    return `<option value="${_invEsc(label)}"></option>`;
  }).join('');
}

// ==================== STORES (§2) ====================

const INV_STORE_TYPES = [
  { value: 'pantry',          label: 'Pantry',            color: 'color:#1e7e34;background:#dcf3e2;' },
  { value: 'kitchen_grocery', label: 'Kitchen & Grocery', color: 'color:#8a6d00;background:var(--gold-100,#fdf3d6);' },
  { value: 'stationery',      label: 'Stationery',        color: 'color:#1B3057;background:var(--navy-100,#e4e9f3);' },
  { value: 'uniform',         label: 'Uniform',           color: 'color:#6a1b9a;background:#efe0f7;' },
  { value: 'toiletries',      label: 'Toiletries',        color: 'color:#00695c;background:#dcf0ee;' },
  { value: 'class',           label: 'Class Store',       color: 'color:#c0392b;background:#fde0de;' },
  { value: 'other',           label: 'Other',             color: 'color:#666;background:#eee;' },
];
function _invStoreTypeLabel(v) {
  return (INV_STORE_TYPES.find(t => t.value === v) || {}).label || v || '—';
}
function _invStoreTypePill(v) {
  const t = INV_STORE_TYPES.find(x => x.value === v);
  const style = t ? t.color : 'color:#666;background:#eee;';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.72rem;font-weight:600;${style}">${_invEsc(t ? t.label : (v || '—'))}</span>`;
}

// ── Shared lookups (staff, school classes, control accounts) ───────────────
let _invStaffCache = null;
let _invClassesCache = null;
let _invControlAccountsCache = null;

async function _invEnsureStaffCache() {
  if (_invStaffCache) return;
  const res = await apiFetch(`${API_BASE}/hr/employees`);
  const raw = (res && res.ok) ? await res.json() : null;
  _invStaffCache = raw ? (raw.items || _toArray(raw)) : [];
}
function _invStaffLabel(id) {
  if (id == null) return '—';
  const e = (_invStaffCache || []).find(x => String(x.id) === String(id));
  if (!e) return `#${id}`;
  return `${e.first_name || ''} ${e.last_name || ''}`.trim() || `#${id}`;
}
function _invStaffOptionsHtml(selectedId) {
  return (_invStaffCache || []).map(e =>
    `<option value="${e.id}" ${String(e.id) === String(selectedId) ? 'selected' : ''}>${_invEsc((`${e.first_name || ''} ${e.last_name || ''}`).trim())}</option>`).join('');
}

async function _invEnsureClassesCache() {
  if (_invClassesCache) return;
  const res = await apiFetch(`${API_BASE}/classes/`);
  const rows = (res && res.ok) ? _toArray(await res.json()) : [];
  _invClassesCache = rows.filter(c => c.is_active !== false);
}
function _invClassLabel(id) {
  if (id == null) return '—';
  const c = (_invClassesCache || []).find(x => String(x.id) === String(id));
  if (!c) return `#${id}`;
  return c.name || c.class_code || `#${id}`;
}
function _invClassOptionsHtml(selectedId) {
  return (_invClassesCache || []).map(c =>
    `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${_invEsc(c.name || c.class_code || ('#' + c.id))}</option>`).join('');
}

async function _invEnsureControlAccountsCache() {
  if (_invControlAccountsCache) return;
  const res = await apiFetch(`${API_BASE}/accounts/?account_type=Asset&account_subtype=${encodeURIComponent('Inventory')}&is_active=true`);
  _invControlAccountsCache = (res && res.ok) ? _toArray(await res.json()) : [];
}
function _invAccountName(id) {
  if (id == null) return '—';
  const a = (_invControlAccountsCache || []).find(x => String(x.id) === String(id));
  if (!a) return `#${id}`;
  return `${a.number ? a.number + ' - ' : ''}${a.account_name}`;
}
function _invAccountOptionsHtml(selectedId) {
  return (_invControlAccountsCache || []).map(a =>
    `<option value="${a.id}" ${String(a.id) === String(selectedId) ? 'selected' : ''}>${_invEsc(a.number ? a.number + ' - ' : '')}${_invEsc(a.account_name)}</option>`).join('');
}

// ── List (split-view) ────────────────────────────────────────────────────
function _invStoreRowCol1(s) {
  const html = `<strong>${_invEsc(s.code || '—')}</strong>`;
  return s.is_active === false ? `<span style="opacity:0.6;">${html}</span>` : html;
}
function _invStoreRowCol2(s) {
  let html = `${_invEsc(s.name || '')} ${_invStoreTypePill(s.store_type)}`;
  if (s.is_active === false) {
    html += ` <span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;color:var(--white);background:var(--coral-500);margin-left:4px;">Inactive</span>`;
  }
  html += `<br><span style="font-size:12px;color:#888;">${s.custodian_employee_id ? _invEsc(_invStaffLabel(s.custodian_employee_id)) : '—'}</span>`;
  return s.is_active === false ? `<span style="opacity:0.6;">${html}</span>` : html;
}

async function loadInventoryStoresView(container) {
  await Promise.all([_invEnsureStaffCache(), _invEnsureClassesCache(), _invEnsureControlAccountsCache()]);
  const preselectId = window._invStoreOpenId ?? null;
  window._invStoreOpenId = null;
  const cfg = {
    container,
    title: 'Stores',
    moduleKey: 'inventory_management.stores',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Inventory', view: 'inventory-stores' },
      { label: 'Stores' },
    ],
    apiUrl: `${_INV_API}/stores?is_active=true`,
    searchFields: ['code', 'name'],
    col1Label: 'Code', col2Label: 'Name / Type',
    col1: _invStoreRowCol1,
    col2: _invStoreRowCol2,
    rowLabel: s => s.code || s.name || '—',
    rowSub: s => `${_invStoreTypeLabel(s.store_type)}${s.is_active === false ? ' · Inactive' : ''}`,
    idKey: 'id',
    preselectId,
    detailFields: [
      { label: 'Code', key: 'code' },
      { label: 'Name', key: 'name' },
      { label: 'Store Type', key: 'store_type', fmt: v => _invStoreTypeLabel(v) },
      { label: 'School Class', key: 'school_class_id', fmt: v => _invClassLabel(v), hideWhen: item => item.store_type !== 'class' },
      { label: 'Custodian', key: 'custodian_employee_id', fmt: v => v ? _invStaffLabel(v) : '—' },
      { label: 'Inventory Control Account', key: 'inventory_control_account_id', fmt: v => v ? _invAccountName(v) : '(default for store type)' },
      { label: 'Status', key: 'is_active', fmt: v => v === false ? 'Inactive' : 'Active' },
    ],
    renderAdd: el => _invRenderStoreAddForm(el),
    renderEdit: (item, el) => _invRenderStoreEditForm(item, el),
    detailActions: item => _invStoreDetailActions(item),
  };
  await renderSplitView(cfg);
  _invStoresInjectFilters(cfg);
}

function _invStoresInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;';
  wrap.innerHTML = `
    <select id="inv-store-filter-type" class="fin-form-select" style="flex:1;min-width:140px;font-size:12px;">
      <option value="">All Types</option>
      ${INV_STORE_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap;">
      <input type="checkbox" id="inv-store-filter-active" checked> Active only
    </label>`;
  searchBox.insertAdjacentElement('afterend', wrap);
  document.getElementById('inv-store-filter-type').addEventListener('change', () => _invStoresReapplyFilters(cfg));
  document.getElementById('inv-store-filter-active').addEventListener('change', () => _invStoresReapplyFilters(cfg));
}
function _invStoresReapplyFilters(cfg) {
  const type = document.getElementById('inv-store-filter-type')?.value || '';
  const activeOnly = document.getElementById('inv-store-filter-active')?.checked;
  const params = new URLSearchParams();
  if (type) params.set('store_type', type);
  if (activeOnly) params.set('is_active', 'true');
  const qs = params.toString();
  cfg.apiUrl = `${_INV_API}/stores` + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}

// ── Add ──────────────────────────────────────────────────────────────────
function _invRenderStoreAddForm(el) {
  el.innerHTML = `
    <div style="max-width:460px;">
      <h3 class="split-right-add-title">Add Store</h3>
      <div id="inv-store-conflict-banner" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;margin-bottom:14px;"></div>
      <div class="fin-form-group">
        <label class="fin-form-label">Code <span class="fin-required">*</span></label>
        <input type="text" id="inv-store-f-code" class="fin-form-input" maxlength="20">
        <span class="fin-field-error" id="inv-store-f-code-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Name <span class="fin-required">*</span></label>
        <input type="text" id="inv-store-f-name" class="fin-form-input" maxlength="100">
        <span class="fin-field-error" id="inv-store-f-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Store Type <span class="fin-required">*</span></label>
        <select id="inv-store-f-type" class="fin-form-select" onchange="_invOnStoreTypeChange()">
          <option value="">Please Select</option>
          ${INV_STORE_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="inv-store-f-type-err"></span>
      </div>
      <div class="fin-form-group" id="inv-store-f-class-wrap" style="display:none;">
        <label class="fin-form-label">School Class <span class="fin-required">*</span></label>
        <select id="inv-store-f-class" class="fin-form-select">
          <option value="">Please Select</option>
          ${_invClassOptionsHtml(null)}
        </select>
        <span class="fin-field-error" id="inv-store-f-class-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Custodian (Staff)</label>
        <select id="inv-store-f-custodian" class="fin-form-select">
          <option value="">Please Select</option>
          ${_invStaffOptionsHtml(null)}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Inventory Control Account</label>
        <select id="inv-store-f-account" class="fin-form-select">
          <option value="">Please Select</option>
          ${_invAccountOptionsHtml(null)}
        </select>
        <span style="font-size:12px;color:var(--grey-600)">Leave blank to use the default Asset/Inventory account for this store type.</span>
        <span class="fin-field-error" id="inv-store-f-account-err"></span>
      </div>
      <div class="fin-form-group">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="inv-store-f-active" checked> Active
        </label>
      </div>
      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="fin-btn-teal" onclick="_invSubmitStoreAdd()">Save</button>
        <button class="fin-btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>`;
}
function _invOnStoreTypeChange() {
  const type = document.getElementById('inv-store-f-type')?.value;
  const wrap = document.getElementById('inv-store-f-class-wrap');
  if (wrap) wrap.style.display = type === 'class' ? '' : 'none';
}
function _invShowStoreConflict(message, existingId) {
  const banner = document.getElementById('inv-store-conflict-banner');
  if (!banner) { showToast(message, 'error'); return; }
  banner.style.display = 'block';
  banner.innerHTML = `${_invEsc(message)}` + (existingId ? ` <a href="#" onclick="_invOpenStore(${existingId});return false;" style="color:var(--navy-700,#1B3057);font-weight:600;">Open existing store</a>` : '');
}
function _invOpenStore(id) {
  window._invStoreOpenId = id;
  loadView('inventory-stores');
}
async function _invSubmitStoreAdd() {
  const code = (document.getElementById('inv-store-f-code').value || '').trim();
  const name = (document.getElementById('inv-store-f-name').value || '').trim();
  const type = document.getElementById('inv-store-f-type').value;
  const classId = document.getElementById('inv-store-f-class').value;
  const custId = document.getElementById('inv-store-f-custodian').value;
  const acctId = document.getElementById('inv-store-f-account').value;
  const active = document.getElementById('inv-store-f-active').checked;

  const setErr = (id, msg) => { const e = document.getElementById(id); if (e) e.textContent = msg || ''; };
  ['inv-store-f-code-err', 'inv-store-f-name-err', 'inv-store-f-type-err', 'inv-store-f-class-err', 'inv-store-f-account-err'].forEach(id => setErr(id, ''));
  const banner = document.getElementById('inv-store-conflict-banner');
  if (banner) banner.style.display = 'none';

  let valid = true;
  if (!code) { setErr('inv-store-f-code-err', 'This field is required.'); valid = false; }
  if (!name) { setErr('inv-store-f-name-err', 'This field is required.'); valid = false; }
  if (!type) { setErr('inv-store-f-type-err', 'This field is required.'); valid = false; }
  if (type === 'class' && !classId) { setErr('inv-store-f-class-err', 'School Class is required for a class store.'); valid = false; }
  if (!valid) return;

  const payload = {
    code, name, store_type: type,
    school_class_id: type === 'class' ? parseInt(classId) : null,
    custodian_employee_id: custId ? parseInt(custId) : null,
    inventory_control_account_id: acctId ? parseInt(acctId) : null,
    is_active: active,
  };
  const res = await apiFetch(`${_INV_API}/stores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Store added.', 'success'); await window._splitReload?.(); return; }
  if (!res) return;

  if (res.status === 409) {
    const { message } = await _invParseError(res);
    const m = message.match(/\(id=(\d+)\)/);
    _invShowStoreConflict(message, m ? parseInt(m[1]) : null);
    return;
  }
  if (res.status === 404) {
    const { message } = await _invParseError(res);
    setErr('inv-store-f-class-err', message);
    return;
  }
  if (res.status === 400) {
    const { message } = await _invParseError(res);
    setErr('inv-store-f-account-err', message);
    return;
  }
  if (res.status === 422) {
    const { fieldErrors, message } = await _invParseError(res);
    const map = { code: 'inv-store-f-code-err', name: 'inv-store-f-name-err', store_type: 'inv-store-f-type-err', school_class_id: 'inv-store-f-class-err', inventory_control_account_id: 'inv-store-f-account-err' };
    let matched = false;
    Object.entries(fieldErrors).forEach(([k, v]) => { if (map[k]) { setErr(map[k], v); matched = true; } });
    if (!matched) showToast('Error: ' + message, 'error');
    return;
  }
  const { message } = await _invParseError(res);
  showToast('Error: ' + message, 'error');
}

// ── Edit — name, custodian, is_active only (§2.7) ───────────────────────
function _invRenderStoreEditForm(item, el) {
  el.innerHTML = `
    <div style="max-width:460px;">
      <h3 class="split-right-add-title">Edit ${_invEsc(item.code || '')}</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Name <span class="fin-required">*</span></label>
        <input type="text" id="inv-store-e-name" class="fin-form-input" maxlength="100" value="${_invEsc(item.name || '')}">
        <span class="fin-field-error" id="inv-store-e-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Custodian (Staff)</label>
        <select id="inv-store-e-custodian" class="fin-form-select">
          <option value="">Please Select</option>
          ${_invStaffOptionsHtml(item.custodian_employee_id)}
        </select>
      </div>
      <div class="fin-form-group">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="inv-store-e-active" ${item.is_active !== false ? 'checked' : ''}> Active
        </label>
      </div>
      <p style="font-size:12px;color:var(--grey-600);margin:4px 0 0;">Store type, class, and control account are locked once created. To change them, deactivate this store and create a new one.</p>
      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="fin-btn-teal" onclick="_invSubmitStoreEdit(${item.id})">Update</button>
        <button class="fin-btn-cancel" onclick="window._splitRefreshSelected?.()">Cancel</button>
      </div>
    </div>`;
}
async function _invSubmitStoreEdit(id) {
  const name = (document.getElementById('inv-store-e-name').value || '').trim();
  const custId = document.getElementById('inv-store-e-custodian').value;
  const active = document.getElementById('inv-store-e-active').checked;
  const setErr = (id, msg) => { const e = document.getElementById(id); if (e) e.textContent = msg || ''; };
  setErr('inv-store-e-name-err', '');
  if (!name) { setErr('inv-store-e-name-err', 'This field is required.'); return; }
  const payload = { name, custodian_employee_id: custId ? parseInt(custId) : null, is_active: active };
  const res = await apiFetch(`${_INV_API}/stores/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Store updated.', 'success'); await window._splitRefreshSelected?.(); return; }
  if (res) { const { message } = await _invParseError(res); showToast('Error: ' + message, 'error'); }
}

// ── Detail actions — Deactivate / Reactivate ────────────────────────────
function _invStoreDetailActions(item) {
  const activate = item.is_active === false;
  return `<button class="fin-btn-outline" onclick="_invToggleStoreActive(${item.id}, ${activate})">${activate ? 'Reactivate' : 'Deactivate'}</button>`;
}
async function _invToggleStoreActive(id, activate) {
  const verb = activate ? 'reactivate' : 'deactivate';
  if (!confirm(`Are you sure you want to ${verb} this store?`)) return;
  const res = await apiFetch(`${_INV_API}/stores/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: activate }) });
  if (res && res.ok) { showToast(`Store ${activate ? 'reactivated' : 'deactivated'}.`, 'success'); await window._splitRefreshSelected?.(); return; }
  if (res) { const { message } = await _invParseError(res); showToast('Error: ' + message, 'error'); }
}

// ==================== GOODS RECEIVED NOTES (§3) ====================

const _INV_GRN_STATUS_STYLE = {
  draft:     'color:#666;background:#eee;',
  approved:  'color:#1e7e34;background:#dcf3e2;',
  cancelled: 'color:#888;background:#eee;text-decoration:line-through;',
};
function _grnStatusPill(status) {
  const style = _INV_GRN_STATUS_STYLE[status] || 'color:#666;background:#eee;';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;${style}">${_invEsc((status || '').replace(/_/g, ' ') || '—')}</span>`;
}

let _grnLines = [];

// ── List (split-view) ────────────────────────────────────────────────────
async function loadInventoryGrnView(container) {
  await Promise.all([_invEnsureSuppliersCache(), _invEnsureStoresCache(), _invEnsureItemsCache(), _invEnsureTermsCache()]);
  const preselectId = window._grnOpenId ?? null;
  window._grnOpenId = null;
  const cfg = {
    container,
    title: 'Goods Received Notes',
    moduleKey: 'inventory_management.grn',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Inventory', view: 'inventory-grn' },
      { label: 'Goods Received Notes' },
    ],
    apiUrl: `${_INV_API}/grn`,
    searchFields: ['grn_number'],
    col1Label: 'GRN', col2Label: 'Status',
    col1: g => `<strong>${_invEsc(g.grn_number || '—')}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_invEsc(_invSupplierLabel(g.supplier_id))} &middot; ${g.received_date || ''}</span>`,
    col2: g => `${_grnStatusPill(g.status)}<br><span style="font-size:12px;color:#555;">${formatKES(g.total_value)} &middot; ${(g.lines || []).length} line${(g.lines || []).length === 1 ? '' : 's'}</span>`,
    rowLabel: g => g.grn_number || '—',
    rowSub: g => `${_invSupplierLabel(g.supplier_id)} · ${g.received_date || ''}`,
    idKey: 'id',
    preselectId,
    detailFields: [
      { label: 'Supplier', key: 'supplier_id', fmt: v => _invSupplierLabel(v) },
      { label: 'Received Date', key: 'received_date', fmt: v => v || '—' },
      { label: 'Delivery Note Ref', key: 'delivery_note_ref', fmt: v => v || '—' },
      { label: 'Notes', key: 'notes', fmt: v => v || '—' },
      { label: 'Total Value', key: 'total_value', fmt: v => formatKES(v) },
      { label: 'Term', key: 'term_id', fmt: v => v ? _invTermLabel(v) : '—' },
      { label: 'Journal Entry', key: 'journal_entry_id', fmt: v => v ? `<a href="#" onclick="_jeViewDetail(${v});return false;">JE #${v}</a>` : '—' },
      { label: 'Status', key: 'status', fmt: v => _grnStatusPill(v) },
      { label: 'Approved At', key: 'approved_at', fmt: v => v ? new Date(v).toLocaleString() : '—' },
    ],
    canEdit: item => item.status === 'draft',
    renderAdd: el => _grnRenderAddForm(el),
    renderEdit: (item, el) => _grnRenderEditForm(item, el),
    detailActions: item => _grnDetailActionsHtml(item),
  };
  await renderSplitView(cfg);
  _grnInjectFilters(cfg);
}

function _grnInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;';
  wrap.innerHTML = `
    <select id="grn-filter-status" class="fin-form-select" style="flex:1;min-width:110px;font-size:12px;">
      <option value="">All Statuses</option>
      ${['draft', 'approved', 'cancelled'].map(s => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
    </select>
    <select id="grn-filter-supplier" class="fin-form-select" style="flex:1;min-width:130px;font-size:12px;">
      <option value="">All Suppliers</option>${_invSupplierOptionsHtml(null)}
    </select>
    <input type="date" id="grn-filter-start" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="Start date">
    <input type="date" id="grn-filter-end" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="End date">`;
  searchBox.insertAdjacentElement('afterend', wrap);
  ['grn-filter-status', 'grn-filter-supplier', 'grn-filter-start', 'grn-filter-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => _grnReapplyFilters(cfg));
  });
}
function _grnReapplyFilters(cfg) {
  const status = document.getElementById('grn-filter-status')?.value || '';
  const supplierId = document.getElementById('grn-filter-supplier')?.value || '';
  const start = document.getElementById('grn-filter-start')?.value || '';
  const end = document.getElementById('grn-filter-end')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (supplierId) params.set('supplier_id', supplierId);
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  const qs = params.toString();
  cfg.apiUrl = `${_INV_API}/grn` + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}
function _grnOpen(id) {
  window._grnOpenId = id;
  loadView('inventory-grn');
}

// ── Lines (mirrors js/procurement.js's requisition-line pattern) ───────────
// Quantity/unit cost are kept as the raw input strings, never re-derived
// through parseFloat, so the payload sends exactly what the operator typed —
// Decimals go over the wire as JSON strings (§9.3 of the addendum).
function _grnLineNet(line) {
  const qty = parseFloat(line.quantity) || 0;
  const cost = parseFloat(line.unit_cost) || 0;
  return qty * cost;
}
function _grnLineRowHtml(line, idx) {
  const net = _grnLineNet(line);
  return `
    <tr>
      <td><input type="text" class="fin-li-input" list="grn-item-datalist" placeholder="Search item…" value="${_invEsc(line.item_label || '')}" oninput="_grnResolveLineItem(${idx}, this.value)"></td>
      <td><select class="fin-li-input" onchange="_grnUpdateLine(${idx},'store_id',this.value)">
        <option value="">Select store</option>
        ${_invStoreOptionsHtml(line.store_id)}
      </select></td>
      <td><input type="number" class="fin-li-input" step="0.001" min="0.001" style="width:90px;" value="${line.quantity || ''}" oninput="_grnUpdateLine(${idx},'quantity',this.value)"></td>
      <td><input type="number" class="fin-li-input" step="0.0001" min="0" style="width:100px;" value="${line.unit_cost || ''}" oninput="_grnUpdateLine(${idx},'unit_cost',this.value)"></td>
      <td id="grn-line-total-${idx}" style="text-align:right;font-size:12px;white-space:nowrap;">${formatKES(net)}</td>
      <td><input type="text" class="fin-li-input" placeholder="Notes" value="${_invEsc(line.notes || '')}" oninput="_grnUpdateLine(${idx},'notes',this.value)"></td>
      <td><button class="fin-btn-li-rm" ${_grnLines.length <= 1 ? 'disabled' : ''} onclick="_grnRemoveLine(${idx})">&times;</button></td>
    </tr>`;
}
function _grnRenderLines() {
  const el = document.getElementById('grn-lines-body');
  if (el) el.innerHTML = _grnLines.map((l, i) => _grnLineRowHtml(l, i)).join('');
  _grnRecalcTotal();
}
function _grnAddLine() {
  _grnLines.push({ item_id: null, item_label: '', store_id: '', quantity: '', unit_cost: '', notes: '' });
  _grnRenderLines();
}
function _grnRemoveLine(idx) {
  if (_grnLines.length <= 1) return;
  _grnLines.splice(idx, 1);
  _grnRenderLines();
}
function _grnResolveLineItem(idx, val) {
  const id = (window._grnItemMap || {})[val];
  _grnLines[idx].item_id = id || null;
  _grnLines[idx].item_label = val;
}
function _grnUpdateLine(idx, key, val) {
  _grnLines[idx][key] = val;
  if (key === 'quantity' || key === 'unit_cost') {
    const cell = document.getElementById(`grn-line-total-${idx}`);
    if (cell) cell.textContent = formatKES(_grnLineNet(_grnLines[idx]));
  }
  _grnRecalcTotal();
}
function _grnRecalcTotal() {
  // Round each line to 2 DP before summing to avoid drift with the server's
  // per-line rounding (§3.5) — this is a live client preview only; the
  // server total on approve is authoritative.
  const total = _grnLines.reduce((s, l) => s + Math.round(_grnLineNet(l) * 100) / 100, 0);
  const el = document.getElementById('grn-f-total');
  if (el) el.textContent = formatKES(total);
}

// ── Shared header fields + lines table ──────────────────────────────────
function _grnHeaderFieldsHtml(grn, isEdit) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Supplier <span class="fin-required">*</span></label>
        <select id="grn-f-supplier" class="fin-form-select"><option value="">Please Select</option>${_invSupplierOptionsHtml(grn?.supplier_id)}</select>
        <span class="fin-field-error" id="grn-f-supplier-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Received Date <span class="fin-required">*</span></label>
        <input type="date" id="grn-f-received-date" class="fin-form-input" value="${grn?.received_date || todayStr}"${isEdit ? ' oninput="_grnShowTermRederiveHint()"' : ''}>
        ${isEdit
          ? `<div id="grn-f-term-hint" style="display:none;padding:8px 10px;border-radius:6px;background:var(--gold-100,#fdf3d6);color:#8a6d00;font-size:0.8rem;margin-top:6px;">Changing the received date will re-derive the term.</div>`
          : `<span style="font-size:12px;color:var(--grey-600)">Term is derived from this date.</span>`}
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Delivery Note Ref</label>
        <input type="text" id="grn-f-delivery-ref" class="fin-form-input" maxlength="50" value="${_invEsc(grn?.delivery_note_ref || '')}">
      </div>
      <div class="fin-form-group fin-span-2">
        <label class="fin-form-label">Notes</label>
        <textarea id="grn-f-notes" class="fin-form-textarea" rows="3" maxlength="500">${_invEsc(grn?.notes || '')}</textarea>
      </div>
    </div>`;
}
function _grnShowTermRederiveHint() {
  const el = document.getElementById('grn-f-term-hint');
  if (el) el.style.display = 'block';
}
function _grnLinesTableHtml() {
  return `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap">
      <table class="fin-li-table">
        <thead><tr><th>Item</th><th>Store</th><th>Qty</th><th>Unit Cost</th><th>Line Total</th><th>Notes</th><th></th></tr></thead>
        <tbody id="grn-lines-body"></tbody>
      </table>
    </div>
    <datalist id="grn-item-datalist"></datalist>
    <button type="button" class="fin-btn-outline" style="margin-top:8px;" onclick="_grnAddLine()">+ Add Line</button>
    <div style="margin-top:16px;max-width:360px;margin-left:auto;padding:14px 16px;border-radius:8px;background:var(--navy-700,#1B3057);color:#fff;">
      <div style="font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:.05em;">Total Value</div>
      <div style="font-size:1.3rem;font-weight:700;margin-top:4px;" id="grn-f-total">${formatKES(0)}</div>
    </div>`;
}
function _grnCollectLinesPayload() {
  return _grnLines
    .filter(l => l.item_id && l.store_id && parseFloat(l.quantity) > 0 && l.unit_cost !== '' && parseFloat(l.unit_cost) >= 0)
    .map(l => ({
      item_id: l.item_id,
      store_id: parseInt(l.store_id),
      quantity: String(l.quantity).trim(),
      unit_cost: String(l.unit_cost).trim(),
      notes: (l.notes || '').trim() || null,
    }));
}
function _grnCollectHeaderPayload() {
  return {
    supplier_id: parseInt(document.getElementById('grn-f-supplier').value),
    received_date: document.getElementById('grn-f-received-date').value || null,
    delivery_note_ref: (document.getElementById('grn-f-delivery-ref').value || '').trim() || null,
    notes: (document.getElementById('grn-f-notes').value || '').trim() || null,
  };
}

// ── Add (Save Draft only — no Approve from Add, §3.5) ───────────────────
function _grnRenderAddForm(el) {
  _grnLines = [{ item_id: null, item_label: '', store_id: '', quantity: '', unit_cost: '', notes: '' }];
  el.innerHTML = `
    <div class="fin-form-wrap" style="max-width:100%;">
      <h3 class="fin-title" style="font-size:1rem;">New Goods Received Note</h3>
      ${_grnHeaderFieldsHtml(null, false)}
      ${_grnLinesTableHtml()}
      <div id="grn-f-msg" style="margin-top:12px;"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_grnSubmitAdd()">Save Draft</button>
        <button class="fin-btn-cancel" onclick="window._splitReload && window._splitReload()">Cancel</button>
      </div>
    </div>`;
  _grnRenderLines();
  _invPopulateItemDatalist('grn-item-datalist', '_grnItemMap');
}
async function _grnSubmitAdd() {
  document.getElementById('grn-f-supplier-err').textContent = '';
  document.getElementById('grn-f-msg').innerHTML = '';
  const supplierId = document.getElementById('grn-f-supplier').value;
  if (!supplierId) { document.getElementById('grn-f-supplier-err').textContent = 'This field is required.'; return; }
  const lines = _grnCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('grn-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with an item, store, quantity and unit cost.</div>`;
    return;
  }
  const payload = { ..._grnCollectHeaderPayload(), lines };
  const res = await apiFetch(`${_INV_API}/grn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('GRN saved as draft.', 'success'); await window._splitReload?.(); return; }
  if (!res) return;
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.supplier_id) document.getElementById('grn-f-supplier-err').textContent = fieldErrors.supplier_id;
  else document.getElementById('grn-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Edit — draft-only, PATCH lines is a full replacement (§3.7, §9.6) ──────
function _grnRenderEditForm(item, el) {
  _grnLines = (item.lines || []).map(l => ({
    item_id: l.item_id, item_label: _invItemLabel(l.item_id), store_id: l.store_id,
    quantity: l.quantity, unit_cost: l.unit_cost, notes: l.notes,
  }));
  if (_grnLines.length === 0) _grnLines = [{ item_id: null, item_label: '', store_id: '', quantity: '', unit_cost: '', notes: '' }];
  el.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit GRN ${_invEsc(item.grn_number || '')}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Inventory &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('inventory-grn');return false;">Goods Received Notes</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:100%;">
        ${_grnHeaderFieldsHtml(item, true)}
        ${_grnLinesTableHtml()}
        <div id="grn-f-msg" style="margin-top:12px;"></div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_grnSubmitEdit(${item.id})">Update</button>
          <button class="fin-btn-cancel" onclick="window._splitRefreshSelected && window._splitRefreshSelected()">Cancel</button>
        </div>
      </div>
    </div>`;
  _grnRenderLines();
  _invPopulateItemDatalist('grn-item-datalist', '_grnItemMap');
}
async function _grnSubmitEdit(id) {
  document.getElementById('grn-f-supplier-err').textContent = '';
  document.getElementById('grn-f-msg').innerHTML = '';
  const supplierId = document.getElementById('grn-f-supplier').value;
  if (!supplierId) { document.getElementById('grn-f-supplier-err').textContent = 'This field is required.'; return; }
  const lines = _grnCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('grn-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with an item, store, quantity and unit cost.</div>`;
    return;
  }
  const payload = { ..._grnCollectHeaderPayload(), lines };
  const res = await apiFetch(`${_INV_API}/grn/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('GRN updated.', 'success'); await window._splitRefreshSelected?.(); return; }
  if (!res) return;
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.supplier_id) document.getElementById('grn-f-supplier-err').textContent = fieldErrors.supplier_id;
  else document.getElementById('grn-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Detail actions — status-conditional (§3.6) ──────────────────────────
function _grnDetailActionsHtml(item) {
  window._grnCurrentItem = item;
  const lineRows = (item.lines || []).map(l => `
    <tr>
      <td>${_invEsc(_invItemLabel(l.item_id))}</td>
      <td>${_invEsc(_invStoreLabel(l.store_id))}</td>
      <td style="text-align:right;">${formatQty(l.quantity)}</td>
      <td style="text-align:right;">${formatUnitCost(l.unit_cost)}</td>
      <td style="text-align:right;">${formatKES(l.line_total)}</td>
      <td>${_invEsc(l.notes || '—')}</td>
    </tr>`).join('') || `<tr><td colspan="6" class="fin-empty">No lines.</td></tr>`;
  const linesTable = `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap"><table class="fin-li-table">
      <thead><tr><th>Item</th><th>Store</th><th>Qty</th><th>Unit Cost</th><th>Line Total</th><th>Notes</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table></div>`;

  let actions = '';
  if (item.status === 'draft') {
    actions += `<button class="fin-btn-teal" onclick="_grnOpenApproveModal(${item.id})">Approve</button>`;
    actions += `<button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_grnOpenCancelModal(${item.id})">Cancel</button>`;
  } else if (item.status === 'approved') {
    actions += `<button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_grnOpenCancelModal(${item.id})">Cancel</button>`;
  }
  return `
    ${linesTable}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;align-items:center;">${actions}</div>
    <div id="grn-action-msg-${item.id}" style="margin-top:8px;"></div>`;
}

// ── Approve — DR store inventory control (aggregated) / CR GRIR (§3.8) ───
function _grnOpenApproveModal(id) {
  const item = window._grnCurrentItem;
  const wrap = document.createElement('div');
  wrap.id = 'grn-approve-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:460px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Approve GRN</h3>
      <p style="font-size:0.88rem;color:#444;">Approve GRN ${_invEsc(item.grn_number || '')}? This will post ${formatKES(item.total_value)} to stock and post a journal entry (DR Inventory / CR Goods-Received-Not-Invoiced).</p>
      <div id="grn-approve-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div id="grn-approve-config-warning" style="display:none;padding:10px 12px;border-radius:6px;background:var(--gold-100,#fdf3d6);color:#8a6d00;font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('grn-approve-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_grnSubmitApprove(${id})">Approve</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _grnSubmitApprove(id) {
  const errEl = document.getElementById('grn-approve-err');
  const cfgEl = document.getElementById('grn-approve-config-warning');
  errEl.style.display = 'none'; cfgEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/grn/${id}/approve`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('grn-approve-modal-overlay');
    showToast('GRN approved.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  if (/GRIR_ACCOUNT_ID is not configured/i.test(message)) {
    cfgEl.textContent = message; cfgEl.style.display = 'block';
  } else {
    errEl.textContent = message; errEl.style.display = 'block';
  }
}

// ── Cancel — draft is a plain flip, approved reverses the JE (§3.9) ────────
function _grnOpenCancelModal(id) {
  const item = window._grnCurrentItem;
  const isApproved = item.status === 'approved';
  const wrap = document.createElement('div');
  wrap.id = 'grn-cancel-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  const body = isApproved
    ? `Cancel approved GRN ${_invEsc(item.grn_number || '')}? A reversing journal entry will be posted and ${formatKES(item.total_value)} reversed out of stock. This cannot be undone.`
    : `Cancel draft GRN? No stock or GL impact.`;
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:460px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Cancel GRN</h3>
      <p style="font-size:0.88rem;color:${isApproved ? 'var(--coral-600)' : '#444'};">${body}</p>
      <div id="grn-cancel-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-outline" onclick="_coaCloseModal('grn-cancel-modal-overlay')">Keep GRN</button>
        <button class="fin-btn-cancel" id="grn-cancel-confirm-btn" onclick="_grnSubmitCancel(${id})">Cancel GRN</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _grnSubmitCancel(id) {
  const errEl = document.getElementById('grn-cancel-err');
  const btn = document.getElementById('grn-cancel-confirm-btn');
  errEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/grn/${id}/cancel`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('grn-cancel-modal-overlay');
    showToast('GRN cancelled.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  errEl.textContent = message; errEl.style.display = 'block';
  // Special refusal: linked SupplierInvoice not PENDING/VOIDED — retrying
  // won't succeed until that invoice's status changes elsewhere, so disable
  // the confirm button rather than inviting an identical failed retry (§3.9).
  if (res.status === 409 && btn) btn.disabled = true;
}

// ==================== STOCK — BALANCES + LEDGER (§4) ====================
// Two read-only report tabs, not a renderSplitView CRUD screen — built as a
// bespoke view since there's nothing to add/edit here.

const SRC_LABELS = {
  goods_received_note: 'GRN',
  stock_issue:          'Issue',
  stock_transfer:       'Transfer',
  stock_adjustment:     'Adjustment',
};
const _INV_MOVEMENT_STYLE = {
  receipt:      'color:#1e7e34;background:#dcf3e2;',
  issue:        'color:#c0392b;background:#fde0de;',
  transfer_out: 'color:#8a6d00;background:var(--gold-100,#fdf3d6);',
  transfer_in:  'color:#1B3057;background:var(--navy-100,#e4e9f3);',
  adjustment:   'color:#6a1b9a;background:#efe0f7;',
  // write_off / return are reserved for later phases (§4.3) — styled
  // gracefully (grey, no icon) but no filter control offers them yet.
  write_off:    'color:#666;background:#eee;',
  return:       'color:#666;background:#eee;',
};
function _invMovementPill(type) {
  const style = _INV_MOVEMENT_STYLE[type] || 'color:#666;background:#eee;';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.72rem;font-weight:600;${style}">${_invEsc((type || '').replace(/_/g, ' ') || '—')}</span>`;
}
// Dispatches to each source document type's own "open and preselect" global
// (the same window._xOpenId + loadView() convention as _grnOpen) — routes
// for stock_issue/stock_transfer/stock_adjustment resolve once §5-§7 land;
// until then they fall through to loadView()'s own "Module not found".
function _invOpenSourceDoc(type, id) {
  const openers = {
    goods_received_note: () => { window._grnOpenId = id; loadView('inventory-grn'); },
    stock_issue:          () => { window._invIssueOpenId = id; loadView('inventory-issues'); },
    stock_transfer:        () => { window._invTransferOpenId = id; loadView('inventory-transfers'); },
    stock_adjustment:      () => { window._invAdjustmentOpenId = id; loadView('inventory-adjustments'); },
  };
  (openers[type] || (() => showToast('Unknown source document type.', 'error')))();
}
function _invSourceLink(type, id) {
  if (!type || id == null) return '—';
  const label = SRC_LABELS[type] || type;
  return `<a href="#" onclick="_invOpenSourceDoc('${type}',${id});return false;">${_invEsc(label)} #${id}</a>`;
}

let _invStockTab = 'balances';
let _invLedgerRows = [];
let _invLedgerOffset = 0;
const _INV_LEDGER_LIMIT = 200;
let _invLedgerExhausted = false;

async function loadInventoryStockView(container) {
  await Promise.all([_invEnsureStoresCache(), _invEnsureItemsCache()]);
  _invStockTab = 'balances';
  container.innerHTML = `
    ${renderBreadcrumb([{ label: 'Dashboard', view: null }, { label: 'Inventory', view: 'inventory-stock' }, { label: 'Stock Levels & Ledger' }])}
    <div class="fin-page">
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button id="inv-stock-tab-balances" class="fin-btn-teal" onclick="_invStockSwitchTab('balances')">Balances</button>
        <button id="inv-stock-tab-ledger" class="fin-btn-outline" onclick="_invStockSwitchTab('ledger')">Ledger</button>
      </div>
      <div id="inv-stock-tab-body"></div>
    </div>`;
  _invStockRenderBalancesTab();
}
function _invStockSwitchTab(tab) {
  _invStockTab = tab;
  document.getElementById('inv-stock-tab-balances').className = tab === 'balances' ? 'fin-btn-teal' : 'fin-btn-outline';
  document.getElementById('inv-stock-tab-ledger').className = tab === 'ledger' ? 'fin-btn-teal' : 'fin-btn-outline';
  if (tab === 'balances') _invStockRenderBalancesTab();
  else _invStockRenderLedgerTab();
}

// ── Balances tab ─────────────────────────────────────────────────────────
function _invStockRenderBalancesTab() {
  const body = document.getElementById('inv-stock-tab-body');
  body.innerHTML = `
    <div style="padding:0 0 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <input type="text" id="inv-stock-bal-item" class="fin-form-input" list="inv-stock-bal-item-datalist" placeholder="Item…" style="flex:1;min-width:160px;">
      <datalist id="inv-stock-bal-item-datalist"></datalist>
      <select id="inv-stock-bal-store" class="fin-form-select" style="flex:1;min-width:130px;">
        <option value="">All Stores</option>${_invStoreOptionsHtml(null)}
      </select>
      <input type="number" id="inv-stock-bal-lowthresh" class="fin-form-input" placeholder="Low stock ≤" step="0.001" style="width:120px;">
      <label style="font-size:12px;display:flex;align-items:center;gap:4px;white-space:nowrap;">
        <input type="checkbox" id="inv-stock-bal-includezero"> Include zero-qty rows
      </label>
      <button class="fin-btn-teal" onclick="_invStockLoadBalances()">Apply</button>
    </div>
    <div class="fin-table-wrap"><table class="fin-table" id="inv-stock-bal-table">
      <thead><tr><th>Item</th><th>Store</th><th style="text-align:right;">Qty on Hand</th><th style="text-align:right;">Moving Avg Cost</th><th style="text-align:right;">Extended Value</th><th>Last Movement</th></tr></thead>
      <tbody><tr><td colspan="6" class="fin-loading">Loading…</td></tr></tbody>
    </table></div>`;
  _invPopulateItemDatalist('inv-stock-bal-item-datalist', '_invStockBalItemMap');
  _invStockLoadBalances();
}
async function _invStockLoadBalances() {
  const tbody = document.querySelector('#inv-stock-bal-table tbody');
  if (!tbody) return;
  const itemVal = document.getElementById('inv-stock-bal-item')?.value || '';
  const itemId = (window._invStockBalItemMap || {})[itemVal] || '';
  const storeId = document.getElementById('inv-stock-bal-store')?.value || '';
  const lowThresh = document.getElementById('inv-stock-bal-lowthresh')?.value || '';
  const includeZero = document.getElementById('inv-stock-bal-includezero')?.checked || false;
  const params = new URLSearchParams();
  if (itemId) params.set('item_id', itemId);
  if (storeId) params.set('store_id', storeId);
  if (lowThresh) params.set('low_stock_threshold', lowThresh);
  params.set('include_zero', includeZero ? 'true' : 'false');
  const res = await apiFetch(`${_INV_API}/stock?${params.toString()}`);
  const rows = (res && res.ok) ? _toArray(await res.json()) : [];
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="fin-empty">No stock records found.</td></tr>`; return; }
  const threshold = lowThresh !== '' ? parseFloat(lowThresh) : null;
  tbody.innerHTML = rows.map(r => {
    const qty = parseFloat(r.qty_on_hand) || 0;
    const cost = parseFloat(r.moving_avg_cost) || 0;
    const isLow = threshold != null && qty <= threshold;
    return `
      <tr${isLow ? ' style="border-left:3px solid var(--coral-500);"' : ''}>
        <td>${_invEsc(_invItemLabel(r.item_id))}${isLow ? ' <span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;color:var(--white);background:var(--coral-500);margin-left:4px;">Low</span>' : ''}</td>
        <td>${_invEsc(_invStoreLabel(r.store_id))}</td>
        <td style="text-align:right;">${formatQty(qty)}</td>
        <td style="text-align:right;">${formatUnitCost(cost)}</td>
        <td style="text-align:right;">${formatKES(qty * cost)}</td>
        <td>${r.last_movement_at ? formatRelativeTime(r.last_movement_at) : '—'}</td>
      </tr>`;
  }).join('');
}

// ── Ledger tab (paginated — §4.3, §K.4) ─────────────────────────────────
function _invStockRenderLedgerTab() {
  const body = document.getElementById('inv-stock-tab-body');
  body.innerHTML = `
    <div style="padding:0 0 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <input type="text" id="inv-stock-led-item" class="fin-form-input" list="inv-stock-led-item-datalist" placeholder="Item…" style="flex:1;min-width:160px;">
      <datalist id="inv-stock-led-item-datalist"></datalist>
      <select id="inv-stock-led-store" class="fin-form-select" style="flex:1;min-width:130px;">
        <option value="">All Stores</option>${_invStoreOptionsHtml(null)}
      </select>
      <input type="date" id="inv-stock-led-start" class="fin-form-input" style="flex:1;min-width:110px;" title="Start date">
      <input type="date" id="inv-stock-led-end" class="fin-form-input" style="flex:1;min-width:110px;" title="End date">
      <button class="fin-btn-teal" onclick="_invStockLoadLedger(true)">Apply</button>
    </div>
    <div class="fin-table-wrap"><table class="fin-table" id="inv-stock-led-table">
      <thead><tr><th>Timestamp</th><th>Item · Store</th><th>Type</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Unit Cost</th><th style="text-align:right;">Total Cost</th><th>Source</th><th>JE</th></tr></thead>
      <tbody><tr><td colspan="8" class="fin-loading">Loading…</td></tr></tbody>
    </table></div>
    <div style="display:flex;justify-content:center;gap:10px;margin-top:12px;">
      <button class="fin-btn-outline" id="inv-stock-led-more" onclick="_invStockLoadLedger(false)">Load older</button>
    </div>`;
  _invPopulateItemDatalist('inv-stock-led-item-datalist', '_invStockLedItemMap');
  _invStockLoadLedger(true);
}
function _invLedgerFilterParams() {
  const itemVal = document.getElementById('inv-stock-led-item')?.value || '';
  const itemId = (window._invStockLedItemMap || {})[itemVal] || '';
  const storeId = document.getElementById('inv-stock-led-store')?.value || '';
  const start = document.getElementById('inv-stock-led-start')?.value || '';
  const end = document.getElementById('inv-stock-led-end')?.value || '';
  const params = new URLSearchParams();
  if (itemId) params.set('item_id', itemId);
  if (storeId) params.set('store_id', storeId);
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  return params;
}
async function _invStockLoadLedger(reset) {
  const tbody = document.querySelector('#inv-stock-led-table tbody');
  const moreBtn = document.getElementById('inv-stock-led-more');
  if (!tbody) return;
  if (reset) {
    _invLedgerRows = []; _invLedgerOffset = 0; _invLedgerExhausted = false;
    tbody.innerHTML = `<tr><td colspan="8" class="fin-loading">Loading…</td></tr>`;
  }
  const params = _invLedgerFilterParams();
  params.set('limit', _INV_LEDGER_LIMIT);
  params.set('offset', _invLedgerOffset);
  const res = await apiFetch(`${_INV_API}/stock/ledger?${params.toString()}`);
  const rows = (res && res.ok) ? _toArray(await res.json()) : [];
  // No total-count is ever returned — exhausted is inferred from a
  // short page, per §K.4 of the addendum.
  _invLedgerExhausted = rows.length < _INV_LEDGER_LIMIT;
  _invLedgerRows = _invLedgerRows.concat(rows);
  _invLedgerOffset += rows.length;
  tbody.innerHTML = _invLedgerRows.length === 0
    ? `<tr><td colspan="8" class="fin-empty">No ledger entries found.</td></tr>`
    : _invLedgerRows.map(_invLedgerRowHtml).join('');
  if (moreBtn) { moreBtn.disabled = _invLedgerExhausted; moreBtn.textContent = _invLedgerExhausted ? 'No more records' : 'Load older'; }
}
function _invLedgerRowHtml(r) {
  return `
    <tr>
      <td>${r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
      <td>${_invEsc(_invItemLabel(r.item_id))} · ${_invEsc(_invStoreLabel(r.store_id))}</td>
      <td>${_invMovementPill(r.movement_type)}</td>
      <td style="text-align:right;color:${_invSignedColor(r.signed_delta)};font-weight:600;">${_invSignedQty(r.signed_delta)}</td>
      <td style="text-align:right;">${formatUnitCost(r.unit_cost)}</td>
      <td style="text-align:right;">${formatKES(r.total_cost)}</td>
      <td>${_invSourceLink(r.source_document_type, r.source_document_id)}</td>
      <td>${r.journal_entry_id ? `<a href="#" onclick="_jeViewDetail(${r.journal_entry_id});return false;">JE #${r.journal_entry_id}</a>` : '—'}</td>
    </tr>`;
}

// ==================== STOCK ISSUES (§5) ====================

const _INV_ISSUE_STATUS_STYLE = {
  draft:     'color:#666;background:#eee;',
  approved:  'color:#1e7e34;background:#dcf3e2;',
  cancelled: 'color:#888;background:#eee;text-decoration:line-through;',
};
function _issueStatusPill(status) {
  const style = _INV_ISSUE_STATUS_STYLE[status] || 'color:#666;background:#eee;';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;${style}">${_invEsc((status || '').replace(/_/g, ' ') || '—')}</span>`;
}

let _issueLines = [];

// ── List (split-view) ────────────────────────────────────────────────────
async function loadInventoryIssuesView(container) {
  await Promise.all([_invEnsureStoresCache(), _invEnsureItemsCache(), _invEnsureTermsCache()]);
  const preselectId = window._invIssueOpenId ?? null;
  window._invIssueOpenId = null;
  const cfg = {
    container,
    title: 'Issues',
    moduleKey: 'inventory_management.issues',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Inventory', view: 'inventory-issues' },
      { label: 'Issues' },
    ],
    apiUrl: `${_INV_API}/issues`,
    searchFields: ['issue_number', 'reason'],
    col1Label: 'Issue', col2Label: 'Status',
    col1: g => `<strong>${_invEsc(g.issue_number || '—')}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_invEsc(_invStoreLabel(g.store_id))} &middot; ${g.issue_date || ''}</span>`,
    col2: g => `${_issueStatusPill(g.status)}<br><span style="font-size:12px;color:#555;">${formatKES(g.total_value)}</span>`,
    rowLabel: g => g.issue_number || '—',
    rowSub: g => `${_invStoreLabel(g.store_id)} · ${g.issue_date || ''}`,
    idKey: 'id',
    preselectId,
    detailFields: [
      { label: 'Store', key: 'store_id', fmt: v => _invStoreLabel(v) },
      { label: 'Issue Date', key: 'issue_date', fmt: v => v || '—' },
      { label: 'Reason', key: 'reason', fmt: v => v || '—' },
      { label: 'Notes', key: 'notes', fmt: v => v || '—' },
      { label: 'Total Value', key: 'total_value', fmt: v => formatKES(v) },
      { label: 'Term', key: 'term_id', fmt: v => v ? _invTermLabel(v) : '—' },
      { label: 'Journal Entry', key: 'journal_entry_id', fmt: v => v ? `<a href="#" onclick="_jeViewDetail(${v});return false;">JE #${v}</a>` : '—' },
      { label: 'Status', key: 'status', fmt: v => _issueStatusPill(v) },
      { label: 'Approved At', key: 'approved_at', fmt: v => v ? new Date(v).toLocaleString() : '—' },
    ],
    canEdit: item => item.status === 'draft',
    renderAdd: el => _issueRenderAddForm(el),
    renderEdit: (item, el) => _issueRenderEditForm(item, el),
    detailActions: item => _issueDetailActionsHtml(item),
  };
  await renderSplitView(cfg);
  _issueInjectFilters(cfg);
}

function _issueInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;';
  wrap.innerHTML = `
    <select id="issue-filter-status" class="fin-form-select" style="flex:1;min-width:110px;font-size:12px;">
      <option value="">All Statuses</option>
      ${['draft', 'approved', 'cancelled'].map(s => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
    </select>
    <select id="issue-filter-store" class="fin-form-select" style="flex:1;min-width:130px;font-size:12px;">
      <option value="">All Stores</option>${_invStoreOptionsHtml(null)}
    </select>
    <input type="date" id="issue-filter-start" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="Start date">
    <input type="date" id="issue-filter-end" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="End date">`;
  searchBox.insertAdjacentElement('afterend', wrap);
  ['issue-filter-status', 'issue-filter-store', 'issue-filter-start', 'issue-filter-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => _issueReapplyFilters(cfg));
  });
}
function _issueReapplyFilters(cfg) {
  const status = document.getElementById('issue-filter-status')?.value || '';
  const storeId = document.getElementById('issue-filter-store')?.value || '';
  const start = document.getElementById('issue-filter-start')?.value || '';
  const end = document.getElementById('issue-filter-end')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (storeId) params.set('store_id', storeId);
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  const qs = params.toString();
  cfg.apiUrl = `${_INV_API}/issues` + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}

// ── Lines — quantity-only on drafts; unit_cost/line_total are 0 until
// approve populates them from the current WAC, so they're deliberately not
// rendered on the Create/Edit form at all (§5.4). ──────────────────────────
function _issueLineRowHtml(line, idx) {
  return `
    <tr>
      <td><input type="text" class="fin-li-input" list="issue-item-datalist" placeholder="Search item…" value="${_invEsc(line.item_label || '')}" oninput="_issueResolveLineItem(${idx}, this.value)"></td>
      <td><input type="number" class="fin-li-input" step="0.001" min="0.001" style="width:100px;" value="${line.quantity || ''}" oninput="_issueUpdateLine(${idx},'quantity',this.value)"></td>
      <td><input type="text" class="fin-li-input" placeholder="Notes" value="${_invEsc(line.notes || '')}" oninput="_issueUpdateLine(${idx},'notes',this.value)"></td>
      <td><button class="fin-btn-li-rm" ${_issueLines.length <= 1 ? 'disabled' : ''} onclick="_issueRemoveLine(${idx})">&times;</button></td>
    </tr>`;
}
function _issueRenderLines() {
  const el = document.getElementById('issue-lines-body');
  if (el) el.innerHTML = _issueLines.map((l, i) => _issueLineRowHtml(l, i)).join('');
}
function _issueAddLine() {
  _issueLines.push({ item_id: null, item_label: '', quantity: '', notes: '' });
  _issueRenderLines();
}
function _issueRemoveLine(idx) {
  if (_issueLines.length <= 1) return;
  _issueLines.splice(idx, 1);
  _issueRenderLines();
}
function _issueResolveLineItem(idx, val) {
  const id = (window._issueItemMap || {})[val];
  _issueLines[idx].item_id = id || null;
  _issueLines[idx].item_label = val;
}
function _issueUpdateLine(idx, key, val) {
  _issueLines[idx][key] = val;
}

// ── Shared header fields + lines table ──────────────────────────────────
function _issueHeaderFieldsHtml(issue) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Store <span class="fin-required">*</span></label>
        <select id="issue-f-store" class="fin-form-select"><option value="">Please Select</option>${_invStoreOptionsHtml(issue?.store_id)}</select>
        <span class="fin-field-error" id="issue-f-store-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Issue Date <span class="fin-required">*</span></label>
        <input type="date" id="issue-f-date" class="fin-form-input" value="${issue?.issue_date || todayStr}">
      </div>
      <div class="fin-form-group fin-span-2">
        <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
        <input type="text" id="issue-f-reason" class="fin-form-input" maxlength="200" value="${_invEsc(issue?.reason || '')}">
        <span class="fin-field-error" id="issue-f-reason-err"></span>
      </div>
      <div class="fin-form-group fin-span-2">
        <label class="fin-form-label">Notes</label>
        <textarea id="issue-f-notes" class="fin-form-textarea" rows="3">${_invEsc(issue?.notes || '')}</textarea>
      </div>
    </div>`;
}
function _issueLinesTableHtml() {
  return `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap">
      <table class="fin-li-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Notes</th><th></th></tr></thead>
        <tbody id="issue-lines-body"></tbody>
      </table>
    </div>
    <datalist id="issue-item-datalist"></datalist>
    <button type="button" class="fin-btn-outline" style="margin-top:8px;" onclick="_issueAddLine()">+ Add Line</button>`;
}
function _issueCollectLinesPayload() {
  return _issueLines
    .filter(l => l.item_id && parseFloat(l.quantity) > 0)
    .map(l => ({ item_id: l.item_id, quantity: String(l.quantity).trim(), notes: (l.notes || '').trim() || null }));
}
function _issueCollectHeaderPayload() {
  return {
    store_id: parseInt(document.getElementById('issue-f-store').value),
    issue_date: document.getElementById('issue-f-date').value || null,
    reason: (document.getElementById('issue-f-reason').value || '').trim(),
    notes: (document.getElementById('issue-f-notes').value || '').trim() || null,
  };
}

// ── Add (Save Draft only — no Approve from Add) ──────────────────────────
function _issueRenderAddForm(el) {
  _issueLines = [{ item_id: null, item_label: '', quantity: '', notes: '' }];
  el.innerHTML = `
    <div class="fin-form-wrap" style="max-width:100%;">
      <h3 class="fin-title" style="font-size:1rem;">New Stock Issue</h3>
      ${_issueHeaderFieldsHtml(null)}
      ${_issueLinesTableHtml()}
      <div id="issue-f-msg" style="margin-top:12px;"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_issueSubmitAdd()">Save Draft</button>
        <button class="fin-btn-cancel" onclick="window._splitReload && window._splitReload()">Cancel</button>
      </div>
    </div>`;
  _issueRenderLines();
  _invPopulateItemDatalist('issue-item-datalist', '_issueItemMap');
}
async function _issueSubmitAdd() {
  document.getElementById('issue-f-store-err').textContent = '';
  document.getElementById('issue-f-reason-err').textContent = '';
  document.getElementById('issue-f-msg').innerHTML = '';
  const storeId = document.getElementById('issue-f-store').value;
  const reason = (document.getElementById('issue-f-reason').value || '').trim();
  let valid = true;
  if (!storeId) { document.getElementById('issue-f-store-err').textContent = 'This field is required.'; valid = false; }
  if (!reason) { document.getElementById('issue-f-reason-err').textContent = 'This field is required.'; valid = false; }
  if (!valid) return;
  const lines = _issueCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('issue-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with an item and quantity.</div>`;
    return;
  }
  const payload = { ..._issueCollectHeaderPayload(), lines };
  const res = await apiFetch(`${_INV_API}/issues`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Issue saved as draft.', 'success'); await window._splitReload?.(); return; }
  if (!res) return;
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.store_id) document.getElementById('issue-f-store-err').textContent = fieldErrors.store_id;
  else if (fieldErrors.reason) document.getElementById('issue-f-reason-err').textContent = fieldErrors.reason;
  else document.getElementById('issue-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Edit — draft-only, PATCH lines is a full replacement ────────────────
function _issueRenderEditForm(item, el) {
  _issueLines = (item.lines || []).map(l => ({ item_id: l.item_id, item_label: _invItemLabel(l.item_id), quantity: l.quantity, notes: l.notes }));
  if (_issueLines.length === 0) _issueLines = [{ item_id: null, item_label: '', quantity: '', notes: '' }];
  el.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Issue ${_invEsc(item.issue_number || '')}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Inventory &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('inventory-issues');return false;">Issues</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:100%;">
        ${_issueHeaderFieldsHtml(item)}
        ${_issueLinesTableHtml()}
        <div id="issue-f-msg" style="margin-top:12px;"></div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_issueSubmitEdit(${item.id})">Update</button>
          <button class="fin-btn-cancel" onclick="window._splitRefreshSelected && window._splitRefreshSelected()">Cancel</button>
        </div>
      </div>
    </div>`;
  _issueRenderLines();
  _invPopulateItemDatalist('issue-item-datalist', '_issueItemMap');
}
async function _issueSubmitEdit(id) {
  document.getElementById('issue-f-store-err').textContent = '';
  document.getElementById('issue-f-reason-err').textContent = '';
  document.getElementById('issue-f-msg').innerHTML = '';
  const storeId = document.getElementById('issue-f-store').value;
  const reason = (document.getElementById('issue-f-reason').value || '').trim();
  let valid = true;
  if (!storeId) { document.getElementById('issue-f-store-err').textContent = 'This field is required.'; valid = false; }
  if (!reason) { document.getElementById('issue-f-reason-err').textContent = 'This field is required.'; valid = false; }
  if (!valid) return;
  const lines = _issueCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('issue-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with an item and quantity.</div>`;
    return;
  }
  const payload = { ..._issueCollectHeaderPayload(), lines };
  const res = await apiFetch(`${_INV_API}/issues/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Issue updated.', 'success'); await window._splitRefreshSelected?.(); return; }
  if (!res) return;
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.store_id) document.getElementById('issue-f-store-err').textContent = fieldErrors.store_id;
  else if (fieldErrors.reason) document.getElementById('issue-f-reason-err').textContent = fieldErrors.reason;
  else document.getElementById('issue-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Detail actions — status-conditional (§5.5); approved shows costs ──────
function _issueDetailActionsHtml(item) {
  window._issueCurrentItem = item;
  const showCosts = item.status === 'approved';
  const lineRows = (item.lines || []).map(l => showCosts ? `
    <tr>
      <td>${_invEsc(_invItemLabel(l.item_id))}</td>
      <td style="text-align:right;">${formatQty(l.quantity)}</td>
      <td style="text-align:right;">${formatUnitCost(l.unit_cost)}</td>
      <td style="text-align:right;">${formatKES(l.line_total)}</td>
      <td>${_invEsc(l.notes || '—')}</td>
    </tr>` : `
    <tr>
      <td>${_invEsc(_invItemLabel(l.item_id))}</td>
      <td style="text-align:right;">${formatQty(l.quantity)}</td>
      <td>${_invEsc(l.notes || '—')}</td>
    </tr>`).join('') || `<tr><td colspan="${showCosts ? 5 : 3}" class="fin-empty">No lines.</td></tr>`;
  const linesTable = `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap"><table class="fin-li-table">
      <thead><tr><th>Item</th><th>Qty</th>${showCosts ? '<th>Unit Cost</th><th>Line Total</th>' : ''}<th>Notes</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table></div>`;

  let actions = '';
  if (item.status === 'draft') {
    actions += `<button class="fin-btn-teal" onclick="_issueOpenApproveModal(${item.id})">Approve</button>`;
    actions += `<button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_issueOpenCancelModal(${item.id})">Cancel</button>`;
  } else if (item.status === 'approved') {
    actions += `<div style="color:#888;font-size:0.85rem;">Approved issues cannot be cancelled — post a compensating Adjustment instead.</div>`;
  }
  return `
    ${linesTable}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;align-items:center;">${actions}</div>
    <div id="issue-action-msg-${item.id}" style="margin-top:8px;"></div>`;
}

// ── Approve — insufficient-stock + missing-expense-account guards (§5.6) ──
function _issueOpenApproveModal(id) {
  const item = window._issueCurrentItem;
  const wrap = document.createElement('div');
  wrap.id = 'issue-approve-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:460px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Approve Issue</h3>
      <p style="font-size:0.88rem;color:#444;">Approve issue ${_invEsc(item.issue_number || '')}? This will consume stock from ${_invEsc(_invStoreLabel(item.store_id))} and post a journal entry (DR expense / CR Inventory).</p>
      <div id="issue-approve-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div id="issue-approve-config-warning" style="display:none;padding:10px 12px;border-radius:6px;background:var(--gold-100,#fdf3d6);color:#8a6d00;font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('issue-approve-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_issueSubmitApprove(${id})">Approve</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _issueSubmitApprove(id) {
  const errEl = document.getElementById('issue-approve-err');
  const cfgEl = document.getElementById('issue-approve-config-warning');
  errEl.style.display = 'none'; cfgEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/issues/${id}/approve`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('issue-approve-modal-overlay');
    showToast('Issue approved.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  if (/No consumption expense account configured/i.test(message)) {
    cfgEl.textContent = message; cfgEl.style.display = 'block';
  } else {
    errEl.textContent = message; errEl.style.display = 'block';
  }
}

// ── Cancel — draft-only, no cancel path once approved (§5.7) ────────────
function _issueOpenCancelModal(id) {
  const wrap = document.createElement('div');
  wrap.id = 'issue-cancel-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:420px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Cancel Issue</h3>
      <p style="font-size:0.88rem;color:#444;">Cancel draft issue? No stock or GL impact.</p>
      <div id="issue-cancel-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-outline" onclick="_coaCloseModal('issue-cancel-modal-overlay')">Keep Issue</button>
        <button class="fin-btn-cancel" onclick="_issueSubmitCancel(${id})">Cancel Issue</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _issueSubmitCancel(id) {
  const errEl = document.getElementById('issue-cancel-err');
  errEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/issues/${id}/cancel`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('issue-cancel-modal-overlay');
    showToast('Issue cancelled.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  errEl.textContent = message; errEl.style.display = 'block';
}
