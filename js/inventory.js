// ==================== INVENTORY MODULE (BE/FE Contract Addendum 2026-07-29) ====
// Modeled on the split-view CRUD pattern (renderSplitView, js/dashboard.js:611)
// and the Fixed Assets / Requisitions reference implementations
// (js/fixed-assets.js, js/procurement.js).
const _INV_API = `${API_BASE}/inventory`;

function _invEsc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
