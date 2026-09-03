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
// The stores cache is loaded once and held for the whole session, so every
// store picker built from it — GRN, Issues, Transfers, Adjustments,
// Stock-Takes, Internal Requisitions — keeps showing the list as it stood the
// first time any of those screens was opened. A store added or deactivated
// afterwards stays invisible until a full page reload. Every mutation must
// drop the cache; the next _invEnsureStoresCache refetches.
function _invInvalidateStoresCache() { _invStoresCache = null; }
function _invStoreLabel(id) {
  if (id == null) return '—';
  const s = (_invStoresCache || []).find(x => String(x.id) === String(id));
  return s ? (s.code || s.name || `#${id}`) : `#${id}`;
}
function _invStoreOptionsHtml(selectedId) {
  return (_invStoresCache || []).map(s =>
    `<option value="${s.id}" ${String(s.id) === String(selectedId) ? 'selected' : ''}>${_invEsc(s.code || s.name || ('#' + s.id))}</option>`).join('');
}
function _invStoreAccountId(id) {
  const s = (_invStoresCache || []).find(x => String(x.id) === String(id));
  return s ? s.inventory_control_account_id : null;
}

// Shared draft/approved/cancelled pill — used by Transfers, Adjustments and
// Stock-Takes (GRN and Issues shipped their own near-identical pill earlier
// and are left as-is rather than refactored mid-rollout).
const _INV_DOC_STATUS_STYLE = {
  draft:     'color:#666;background:#eee;',
  approved:  'color:#1e7e34;background:#dcf3e2;',
  cancelled: 'color:#888;background:#eee;text-decoration:line-through;',
};
function _invStatusPill(status) {
  const style = _INV_DOC_STATUS_STYLE[status] || 'color:#666;background:#eee;';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;${style}">${_invEsc((status || '').replace(/_/g, ' ') || '—')}</span>`;
}

// journal_entry_id === null on an APPROVED doc is a valid state in three
// cases (§9.4): same-account transfer, net-zero adjustment, zero-variance
// stock-take. Never render that as "—" like a missing/broken value.
function _invAuditOnlyBadge() {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.72rem;font-weight:600;color:#8a6d00;background:var(--gold-100,#fdf3d6);">Approved (audit-only, no GL impact)</span>`;
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
// The inventory control account is a JE line target (goods-received and
// issue postings hit it), so header accounts are filtered out here rather
// than out of the cache — _invAccountName above still has to resolve a
// legacy header selection for display (2026-09-01 §2.2).
function _invAccountOptionsHtml(selectedId) {
  return (_invControlAccountsCache || [])
    .filter(a => a.is_postable !== false || String(a.id) === String(selectedId))
    .map(a =>
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
  if (res && res.ok) {
    _invInvalidateStoresCache();
    showToast('Store added.', 'success');
    await window._splitReload?.();
    return;
  }
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
  if (res && res.ok) {
    _invInvalidateStoresCache();
    showToast('Store updated.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
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
  if (res && res.ok) {
    _invInvalidateStoresCache();
    showToast(`Store ${activate ? 'reactivated' : 'deactivated'}.`, 'success');
    await window._splitRefreshSelected?.();
    return;
  }
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

// ==================== STOCK TRANSFERS (§6) ====================

let _transferLines = [];

// ── List (split-view) ────────────────────────────────────────────────────
async function loadInventoryTransfersView(container) {
  await Promise.all([_invEnsureStoresCache(), _invEnsureItemsCache(), _invEnsureTermsCache()]);
  const preselectId = window._invTransferOpenId ?? null;
  window._invTransferOpenId = null;
  const cfg = {
    container,
    title: 'Transfers',
    moduleKey: 'inventory_management.transfers',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Inventory', view: 'inventory-transfers' },
      { label: 'Transfers' },
    ],
    apiUrl: `${_INV_API}/transfers`,
    searchFields: ['transfer_number', 'reason'],
    col1Label: 'Transfer', col2Label: 'Status',
    col1: t => `<strong>${_invEsc(t.transfer_number || '—')}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_invEsc(_invStoreLabel(t.from_store_id))} <span style="color:var(--gold-500,#C9A227);">&rarr;</span> ${_invEsc(_invStoreLabel(t.to_store_id))}</span>`,
    col2: t => `${_invStatusPill(t.status)}<br><span style="font-size:12px;color:#555;">${formatKES(t.total_value)}</span>`,
    rowLabel: t => t.transfer_number || '—',
    rowSub: t => `${_invEsc(_invStoreLabel(t.from_store_id))} <span style="color:var(--gold-500,#C9A227);">&rarr;</span> ${_invEsc(_invStoreLabel(t.to_store_id))} · ${t.transfer_date || ''}`,
    idKey: 'id',
    preselectId,
    detailFields: [
      { label: 'From Store', key: 'from_store_id', fmt: v => _invStoreLabel(v) },
      { label: 'To Store', key: 'to_store_id', fmt: v => _invStoreLabel(v) },
      { label: 'Transfer Date', key: 'transfer_date', fmt: v => v || '—' },
      { label: 'Reason', key: 'reason', fmt: v => v || '—' },
      { label: 'Notes', key: 'notes', fmt: v => v || '—' },
      { label: 'Total Value', key: 'total_value', fmt: v => formatKES(v) },
      { label: 'Term', key: 'term_id', fmt: v => v ? _invTermLabel(v) : '—' },
      { label: 'Journal Entry', key: 'journal_entry_id', fmt: (v, item) => v ? `<a href="#" onclick="_jeViewDetail(${v});return false;">JE #${v}</a>` : (item.status === 'approved' ? _invAuditOnlyBadge() : '—') },
      { label: 'Status', key: 'status', fmt: v => _invStatusPill(v) },
      { label: 'Approved At', key: 'approved_at', fmt: v => v ? new Date(v).toLocaleString() : '—' },
    ],
    canEdit: item => item.status === 'draft',
    renderAdd: el => _transferRenderAddForm(el),
    renderEdit: (item, el) => _transferRenderEditForm(item, el),
    detailActions: item => _transferDetailActionsHtml(item),
  };
  await renderSplitView(cfg);
  _transferInjectFilters(cfg);
}

function _transferInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;';
  wrap.innerHTML = `
    <select id="transfer-filter-status" class="fin-form-select" style="flex:1;min-width:110px;font-size:12px;">
      <option value="">All Statuses</option>
      ${['draft', 'approved', 'cancelled'].map(s => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
    </select>
    <select id="transfer-filter-store" class="fin-form-select" style="flex:1;min-width:130px;font-size:12px;">
      <option value="">All Stores</option>${_invStoreOptionsHtml(null)}
    </select>
    <input type="date" id="transfer-filter-start" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="Start date">
    <input type="date" id="transfer-filter-end" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="End date">`;
  searchBox.insertAdjacentElement('afterend', wrap);
  ['transfer-filter-status', 'transfer-filter-store', 'transfer-filter-start', 'transfer-filter-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => _transferReapplyFilters(cfg));
  });
}
function _transferReapplyFilters(cfg) {
  const status = document.getElementById('transfer-filter-status')?.value || '';
  const storeId = document.getElementById('transfer-filter-store')?.value || '';
  const start = document.getElementById('transfer-filter-start')?.value || '';
  const end = document.getElementById('transfer-filter-end')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (storeId) params.set('store_id', storeId);
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  const qs = params.toString();
  cfg.apiUrl = `${_INV_API}/transfers` + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}

// ── Lines — quantity-only on drafts, same rule as Issues (§6.3) ──────────
function _transferLineRowHtml(line, idx) {
  return `
    <tr>
      <td><input type="text" class="fin-li-input" list="transfer-item-datalist" placeholder="Search item…" value="${_invEsc(line.item_label || '')}" oninput="_transferResolveLineItem(${idx}, this.value)"></td>
      <td><input type="number" class="fin-li-input" step="0.001" min="0.001" style="width:100px;" value="${line.quantity || ''}" oninput="_transferUpdateLine(${idx},'quantity',this.value)"></td>
      <td><input type="text" class="fin-li-input" placeholder="Notes" value="${_invEsc(line.notes || '')}" oninput="_transferUpdateLine(${idx},'notes',this.value)"></td>
      <td><button class="fin-btn-li-rm" ${_transferLines.length <= 1 ? 'disabled' : ''} onclick="_transferRemoveLine(${idx})">&times;</button></td>
    </tr>`;
}
function _transferRenderLines() {
  const el = document.getElementById('transfer-lines-body');
  if (el) el.innerHTML = _transferLines.map((l, i) => _transferLineRowHtml(l, i)).join('');
}
function _transferAddLine() {
  _transferLines.push({ item_id: null, item_label: '', quantity: '', notes: '' });
  _transferRenderLines();
}
function _transferRemoveLine(idx) {
  if (_transferLines.length <= 1) return;
  _transferLines.splice(idx, 1);
  _transferRenderLines();
}
function _transferResolveLineItem(idx, val) {
  const id = (window._transferItemMap || {})[val];
  _transferLines[idx].item_id = id || null;
  _transferLines[idx].item_label = val;
}
function _transferUpdateLine(idx, key, val) {
  _transferLines[idx][key] = val;
}

// ── Shared header fields + lines table ──────────────────────────────────
function _transferHeaderFieldsHtml(t) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">From Store <span class="fin-required">*</span></label>
        <select id="transfer-f-from" class="fin-form-select" onchange="_transferCheckSameAccount()"><option value="">Please Select</option>${_invStoreOptionsHtml(t?.from_store_id)}</select>
        <span class="fin-field-error" id="transfer-f-from-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">To Store <span class="fin-required">*</span></label>
        <select id="transfer-f-to" class="fin-form-select" onchange="_transferCheckSameAccount()"><option value="">Please Select</option>${_invStoreOptionsHtml(t?.to_store_id)}</select>
        <span class="fin-field-error" id="transfer-f-to-err"></span>
      </div>
      <div class="fin-form-group fin-span-2" id="transfer-f-same-account-hint" style="display:none;padding:8px 10px;border-radius:6px;background:var(--gold-100,#fdf3d6);color:#8a6d00;font-size:0.8rem;">
        These stores share the same inventory control account — approving this transfer will move stock without a journal entry (the ledger will still record the movement).
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Transfer Date <span class="fin-required">*</span></label>
        <input type="date" id="transfer-f-date" class="fin-form-input" value="${t?.transfer_date || todayStr}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason</label>
        <input type="text" id="transfer-f-reason" class="fin-form-input" maxlength="200" value="${_invEsc(t?.reason || '')}">
      </div>
      <div class="fin-form-group fin-span-2">
        <label class="fin-form-label">Notes</label>
        <textarea id="transfer-f-notes" class="fin-form-textarea" rows="3">${_invEsc(t?.notes || '')}</textarea>
      </div>
    </div>`;
}
// Proactive heads-up, not a warning — approving a same-account transfer is
// normal behaviour, just without a JE (§6.3).
function _transferCheckSameAccount() {
  const fromId = document.getElementById('transfer-f-from')?.value;
  const toId = document.getElementById('transfer-f-to')?.value;
  const hint = document.getElementById('transfer-f-same-account-hint');
  if (!hint) return;
  const fromAcct = fromId ? _invStoreAccountId(fromId) : null;
  const toAcct = toId ? _invStoreAccountId(toId) : null;
  hint.style.display = (fromAcct != null && toAcct != null && String(fromAcct) === String(toAcct)) ? 'block' : 'none';
}
function _transferLinesTableHtml() {
  return `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap">
      <table class="fin-li-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Notes</th><th></th></tr></thead>
        <tbody id="transfer-lines-body"></tbody>
      </table>
    </div>
    <datalist id="transfer-item-datalist"></datalist>
    <button type="button" class="fin-btn-outline" style="margin-top:8px;" onclick="_transferAddLine()">+ Add Line</button>`;
}
function _transferCollectLinesPayload() {
  return _transferLines
    .filter(l => l.item_id && parseFloat(l.quantity) > 0)
    .map(l => ({ item_id: l.item_id, quantity: String(l.quantity).trim(), notes: (l.notes || '').trim() || null }));
}
function _transferCollectHeaderPayload() {
  return {
    from_store_id: parseInt(document.getElementById('transfer-f-from').value),
    to_store_id: parseInt(document.getElementById('transfer-f-to').value),
    transfer_date: document.getElementById('transfer-f-date').value || null,
    reason: (document.getElementById('transfer-f-reason').value || '').trim() || null,
    notes: (document.getElementById('transfer-f-notes').value || '').trim() || null,
  };
}

// ── Add (Save Draft only) — from ≠ to enforced client-side (§6.3) ────────
function _transferRenderAddForm(el) {
  _transferLines = [{ item_id: null, item_label: '', quantity: '', notes: '' }];
  el.innerHTML = `
    <div class="fin-form-wrap" style="max-width:100%;">
      <h3 class="fin-title" style="font-size:1rem;">New Stock Transfer</h3>
      ${_transferHeaderFieldsHtml(null)}
      ${_transferLinesTableHtml()}
      <div id="transfer-f-msg" style="margin-top:12px;"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_transferSubmitAdd()">Save Draft</button>
        <button class="fin-btn-cancel" onclick="window._splitReload && window._splitReload()">Cancel</button>
      </div>
    </div>`;
  _transferRenderLines();
  _invPopulateItemDatalist('transfer-item-datalist', '_transferItemMap');
}
function _transferValidateHeader() {
  document.getElementById('transfer-f-from-err').textContent = '';
  document.getElementById('transfer-f-to-err').textContent = '';
  const fromId = document.getElementById('transfer-f-from').value;
  const toId = document.getElementById('transfer-f-to').value;
  let valid = true;
  if (!fromId) { document.getElementById('transfer-f-from-err').textContent = 'This field is required.'; valid = false; }
  if (!toId) { document.getElementById('transfer-f-to-err').textContent = 'This field is required.'; valid = false; }
  if (fromId && toId && fromId === toId) { document.getElementById('transfer-f-to-err').textContent = 'To Store must be different from From Store.'; valid = false; }
  return valid;
}
async function _transferSubmitAdd() {
  document.getElementById('transfer-f-msg').innerHTML = '';
  if (!_transferValidateHeader()) return;
  const lines = _transferCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('transfer-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with an item and quantity.</div>`;
    return;
  }
  const payload = { ..._transferCollectHeaderPayload(), lines };
  const res = await apiFetch(`${_INV_API}/transfers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Transfer saved as draft.', 'success'); await window._splitReload?.(); return; }
  if (!res) return;
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.to_store_id) document.getElementById('transfer-f-to-err').textContent = fieldErrors.to_store_id;
  else if (fieldErrors.from_store_id) document.getElementById('transfer-f-from-err').textContent = fieldErrors.from_store_id;
  else document.getElementById('transfer-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Edit — draft-only, PATCH lines is a full replacement ────────────────
function _transferRenderEditForm(item, el) {
  _transferLines = (item.lines || []).map(l => ({ item_id: l.item_id, item_label: _invItemLabel(l.item_id), quantity: l.quantity, notes: l.notes }));
  if (_transferLines.length === 0) _transferLines = [{ item_id: null, item_label: '', quantity: '', notes: '' }];
  el.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Transfer ${_invEsc(item.transfer_number || '')}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Inventory &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('inventory-transfers');return false;">Transfers</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:100%;">
        ${_transferHeaderFieldsHtml(item)}
        ${_transferLinesTableHtml()}
        <div id="transfer-f-msg" style="margin-top:12px;"></div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_transferSubmitEdit(${item.id})">Update</button>
          <button class="fin-btn-cancel" onclick="window._splitRefreshSelected && window._splitRefreshSelected()">Cancel</button>
        </div>
      </div>
    </div>`;
  _transferRenderLines();
  _invPopulateItemDatalist('transfer-item-datalist', '_transferItemMap');
  _transferCheckSameAccount();
}
async function _transferSubmitEdit(id) {
  document.getElementById('transfer-f-msg').innerHTML = '';
  if (!_transferValidateHeader()) return;
  const lines = _transferCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('transfer-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with an item and quantity.</div>`;
    return;
  }
  const payload = { ..._transferCollectHeaderPayload(), lines };
  const res = await apiFetch(`${_INV_API}/transfers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Transfer updated.', 'success'); await window._splitRefreshSelected?.(); return; }
  if (!res) return;
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.to_store_id) document.getElementById('transfer-f-to-err').textContent = fieldErrors.to_store_id;
  else if (fieldErrors.from_store_id) document.getElementById('transfer-f-from-err').textContent = fieldErrors.from_store_id;
  else document.getElementById('transfer-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Detail actions — status-conditional, mirrors Issues (§6.4-6.5) ───────
function _transferDetailActionsHtml(item) {
  window._transferCurrentItem = item;
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
    actions += `<button class="fin-btn-teal" onclick="_transferOpenApproveModal(${item.id})">Approve</button>`;
    actions += `<button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_transferOpenCancelModal(${item.id})">Cancel</button>`;
  } else if (item.status === 'approved') {
    actions += `<div style="color:#888;font-size:0.85rem;">Approved transfers cannot be cancelled — post a compensating Adjustment instead.</div>`;
  }
  return `
    ${linesTable}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;align-items:center;">${actions}</div>
    <div id="transfer-action-msg-${item.id}" style="margin-top:8px;"></div>`;
}

// ── Approve — insufficient-stock guard on source only; wording adapts to
// whether a JE will post (§6.5) ───────────────────────────────────────────
function _transferOpenApproveModal(id) {
  const item = window._transferCurrentItem;
  const fromAcct = _invStoreAccountId(item.from_store_id);
  const toAcct = _invStoreAccountId(item.to_store_id);
  const sameAccount = fromAcct != null && toAcct != null && String(fromAcct) === String(toAcct);
  const n = (item.lines || []).length;
  const jeWording = sameAccount
    ? 'No journal entry will be posted (both stores share the same inventory control account).'
    : `A journal entry will be posted (DR ${_invEsc(_invStoreLabel(item.to_store_id))} / CR ${_invEsc(_invStoreLabel(item.from_store_id))}).`;
  const wrap = document.createElement('div');
  wrap.id = 'transfer-approve-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:480px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Approve Transfer</h3>
      <p style="font-size:0.88rem;color:#444;">Approve transfer ${_invEsc(item.transfer_number || '')}? This will move ${n} item${n === 1 ? '' : 's'} from ${_invEsc(_invStoreLabel(item.from_store_id))} to ${_invEsc(_invStoreLabel(item.to_store_id))} at source-store cost. ${jeWording}</p>
      <div id="transfer-approve-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('transfer-approve-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_transferSubmitApprove(${id})">Approve</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _transferSubmitApprove(id) {
  const errEl = document.getElementById('transfer-approve-err');
  errEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/transfers/${id}/approve`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('transfer-approve-modal-overlay');
    showToast('Transfer approved.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  errEl.textContent = message; errEl.style.display = 'block';
}

// ── Cancel — draft-only, no cancel path once approved ────────────────────
function _transferOpenCancelModal(id) {
  const wrap = document.createElement('div');
  wrap.id = 'transfer-cancel-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:420px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Cancel Transfer</h3>
      <p style="font-size:0.88rem;color:#444;">Cancel draft transfer? No stock or GL impact.</p>
      <div id="transfer-cancel-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-outline" onclick="_coaCloseModal('transfer-cancel-modal-overlay')">Keep Transfer</button>
        <button class="fin-btn-cancel" onclick="_transferSubmitCancel(${id})">Cancel Transfer</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _transferSubmitCancel(id) {
  const errEl = document.getElementById('transfer-cancel-err');
  errEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/transfers/${id}/cancel`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('transfer-cancel-modal-overlay');
    showToast('Transfer cancelled.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  errEl.textContent = message; errEl.style.display = 'block';
}

// ==================== STOCK ADJUSTMENTS (§7) ====================

const INV_ADJUSTMENT_TYPES = [
  { value: 'variance',  label: 'Variance' },
  { value: 'write_off', label: 'Write-off' },
  { value: 'damage',    label: 'Damage' },
  { value: 'expiry',    label: 'Expiry' },
  { value: 'other',     label: 'Other' },
];
function _adjTypeLabel(v) { return (INV_ADJUSTMENT_TYPES.find(t => t.value === v) || {}).label || v || '—'; }

// §7.7 / §9.5 — a stock-take-sourced adjustment is read-only: PATCH and
// cancel both 409 server-side. Computed once, consumed from every surface
// that might offer Edit/Cancel so none of them drift out of sync.
function isStocktakeSourcedAdjustment(adj) {
  return !!(adj && adj.source_stocktake_id != null);
}
// Same window._xOpenId + loadView() convention as _grnOpen — resolves once
// §8 (Stock-Takes) lands; until then it falls through to "Module not found".
function _invOpenStocktake(id) {
  window._invStocktakeOpenId = id;
  loadView('inventory-stocktakes');
}

let _adjLines = [];

// ── List (split-view) ────────────────────────────────────────────────────
async function loadInventoryAdjustmentsView(container) {
  await Promise.all([_invEnsureStoresCache(), _invEnsureItemsCache(), _invEnsureTermsCache()]);
  const preselectId = window._invAdjustmentOpenId ?? null;
  window._invAdjustmentOpenId = null;
  const cfg = {
    container,
    title: 'Adjustments',
    moduleKey: 'inventory_management.adjustments',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Inventory', view: 'inventory-adjustments' },
      { label: 'Adjustments' },
    ],
    apiUrl: `${_INV_API}/adjustments`,
    searchFields: ['adjustment_number', 'reason'],
    col1Label: 'Adjustment', col2Label: 'Status',
    col1: a => `<strong>${_invEsc(a.adjustment_number || '—')}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_invEsc(_invStoreLabel(a.store_id))} &middot; ${_adjTypeLabel(a.adjustment_type)}</span>`,
    col2: a => `${_invStatusPill(a.status)}<br><span style="font-size:12px;color:${_invSignedColor(a.net_delta_value)};font-weight:600;">${_invSignedMoney(a.net_delta_value)}</span>`,
    rowLabel: a => a.adjustment_number || '—',
    rowSub: a => `${_invStoreLabel(a.store_id)} · ${_adjTypeLabel(a.adjustment_type)}`,
    idKey: 'id',
    preselectId,
    detailFields: [
      { label: 'Store', key: 'store_id', fmt: v => _invStoreLabel(v) },
      { label: 'Adjustment Date', key: 'adjustment_date', fmt: v => v || '—' },
      { label: 'Type', key: 'adjustment_type', fmt: v => _adjTypeLabel(v) },
      { label: 'Reason', key: 'reason', fmt: v => v || '—' },
      { label: 'Notes', key: 'notes', fmt: v => v || '—' },
      { label: 'Net Delta Value', key: 'net_delta_value', fmt: v => `<span style="color:${_invSignedColor(v)};font-weight:600;">${_invSignedMoney(v)}</span>` },
      { label: 'Term', key: 'term_id', fmt: v => v ? _invTermLabel(v) : '—' },
      { label: 'Journal Entry', key: 'journal_entry_id', fmt: (v, item) => v ? `<a href="#" onclick="_jeViewDetail(${v});return false;">JE #${v}</a>` : (item.status === 'approved' ? _invAuditOnlyBadge() : '—') },
      { label: 'Source Stock-Take', key: 'source_stocktake_id', fmt: v => v ? `<a href="#" onclick="_invOpenStocktake(${v});return false;">STK #${v}</a>` : '—' },
      { label: 'Status', key: 'status', fmt: v => _invStatusPill(v) },
      { label: 'Approved At', key: 'approved_at', fmt: v => v ? new Date(v).toLocaleString() : '—' },
    ],
    canEdit: item => item.status === 'draft' && !isStocktakeSourcedAdjustment(item),
    renderAdd: el => _adjRenderAddForm(el),
    renderEdit: (item, el) => _adjRenderEditForm(item, el),
    detailActions: item => _adjDetailActionsHtml(item),
  };
  await renderSplitView(cfg);
  _adjInjectFilters(cfg);
}

function _adjInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;';
  wrap.innerHTML = `
    <select id="adj-filter-status" class="fin-form-select" style="flex:1;min-width:110px;font-size:12px;">
      <option value="">All Statuses</option>
      ${['draft', 'approved', 'cancelled'].map(s => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
    </select>
    <select id="adj-filter-type" class="fin-form-select" style="flex:1;min-width:110px;font-size:12px;">
      <option value="">All Types</option>
      ${INV_ADJUSTMENT_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
    </select>
    <select id="adj-filter-store" class="fin-form-select" style="flex:1;min-width:130px;font-size:12px;">
      <option value="">All Stores</option>${_invStoreOptionsHtml(null)}
    </select>
    <input type="date" id="adj-filter-start" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="Start date">
    <input type="date" id="adj-filter-end" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="End date">`;
  searchBox.insertAdjacentElement('afterend', wrap);
  ['adj-filter-status', 'adj-filter-type', 'adj-filter-store', 'adj-filter-start', 'adj-filter-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => _adjReapplyFilters(cfg));
  });
}
function _adjReapplyFilters(cfg) {
  const status = document.getElementById('adj-filter-status')?.value || '';
  const type = document.getElementById('adj-filter-type')?.value || '';
  const storeId = document.getElementById('adj-filter-store')?.value || '';
  const start = document.getElementById('adj-filter-start')?.value || '';
  const end = document.getElementById('adj-filter-end')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('adjustment_type', type);
  if (storeId) params.set('store_id', storeId);
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  const qs = params.toString();
  cfg.apiUrl = `${_INV_API}/adjustments` + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}

// ── Lines — direction segmented control + absolute qty, never a raw signed
// number input (§7.4). signed_delta cannot be zero; qty > 0 makes that
// impossible client-side. Unit cost is optional — 0 means "use current WAC".
function _adjLineNetValue(line) {
  const qty = parseFloat(line.quantity) || 0;
  const cost = parseFloat(line.unit_cost) || 0;
  if (qty <= 0 || cost <= 0) return null; // pending WAC at approve
  const signedQty = line.direction === 'shortage' ? -qty : qty;
  return signedQty * cost;
}
function _adjLineNetCellHtml(line) {
  const netVal = _adjLineNetValue(line);
  return netVal == null
    ? '<span style="color:#999;font-style:italic;">pending WAC</span>'
    : `<span style="color:${_invSignedColor(netVal)};">${_invSignedMoney(netVal)}</span>`;
}
function _adjLineRowHtml(line, idx) {
  return `
    <tr>
      <td><input type="text" class="fin-li-input" list="adj-item-datalist" placeholder="Search item…" value="${_invEsc(line.item_label || '')}" oninput="_adjResolveLineItem(${idx}, this.value)"></td>
      <td>
        <div style="display:flex;border-radius:6px;overflow:hidden;border:1px solid var(--grey-200);width:130px;">
          <button type="button" style="flex:1;border:none;padding:4px 0;font-size:11px;cursor:pointer;${line.direction !== 'shortage' ? 'background:var(--navy-700,#1B3057);color:#fff;' : 'background:var(--white);color:#444;'}" onclick="_adjSetLineDirection(${idx},'surplus')">Surplus +</button>
          <button type="button" style="flex:1;border:none;padding:4px 0;font-size:11px;cursor:pointer;${line.direction === 'shortage' ? 'background:var(--coral-500);color:#fff;' : 'background:var(--white);color:#444;'}" onclick="_adjSetLineDirection(${idx},'shortage')">Shortage −</button>
        </div>
      </td>
      <td><input type="number" class="fin-li-input" step="0.001" min="0.001" style="width:90px;" value="${line.quantity || ''}" oninput="_adjUpdateLine(${idx},'quantity',this.value)"></td>
      <td><input type="number" class="fin-li-input" step="0.0001" min="0" style="width:100px;" value="${line.unit_cost || ''}" placeholder="0 = current WAC" oninput="_adjUpdateLine(${idx},'unit_cost',this.value)"></td>
      <td id="adj-line-net-${idx}" style="text-align:right;font-size:12px;white-space:nowrap;">${_adjLineNetCellHtml(line)}</td>
      <td><input type="text" class="fin-li-input" placeholder="Notes" value="${_invEsc(line.notes || '')}" oninput="_adjUpdateLine(${idx},'notes',this.value)"></td>
      <td><button class="fin-btn-li-rm" ${_adjLines.length <= 1 ? 'disabled' : ''} onclick="_adjRemoveLine(${idx})">&times;</button></td>
    </tr>`;
}
function _adjRenderLines() {
  const el = document.getElementById('adj-lines-body');
  if (el) el.innerHTML = _adjLines.map((l, i) => _adjLineRowHtml(l, i)).join('');
  _adjRecalcNet();
}
function _adjAddLine() {
  _adjLines.push({ item_id: null, item_label: '', direction: 'surplus', quantity: '', unit_cost: '', notes: '' });
  _adjRenderLines();
}
function _adjRemoveLine(idx) {
  if (_adjLines.length <= 1) return;
  _adjLines.splice(idx, 1);
  _adjRenderLines();
}
function _adjResolveLineItem(idx, val) {
  const id = (window._adjItemMap || {})[val];
  _adjLines[idx].item_id = id || null;
  _adjLines[idx].item_label = val;
}
function _adjSetLineDirection(idx, dir) {
  _adjLines[idx].direction = dir;
  _adjRenderLines();
}
function _adjUpdateLine(idx, key, val) {
  _adjLines[idx][key] = val;
  const cell = document.getElementById(`adj-line-net-${idx}`);
  if (cell) cell.innerHTML = _adjLineNetCellHtml(_adjLines[idx]);
  _adjRecalcNet();
}
// Live preview only — the server is authoritative on approve (§7.5). Lines
// with no known effective cost yet are excluded from the sum rather than
// treated as zero, so the total never understates what's actually pending.
function _adjRecalcNet() {
  let total = 0, anyPending = false;
  _adjLines.forEach(l => {
    const v = _adjLineNetValue(l);
    if (v == null) anyPending = true; else total += v;
  });
  const el = document.getElementById('adj-f-net');
  if (el) el.innerHTML = `<span style="color:${_invSignedColor(total)};">${_invSignedMoney(total)}</span>${anyPending ? ' <span style="font-size:11px;opacity:.8;">(some lines pending WAC at approve)</span>' : ''}`;
}

// ── Shared header fields + lines table ──────────────────────────────────
function _adjHeaderFieldsHtml(adj) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Store <span class="fin-required">*</span></label>
        <select id="adj-f-store" class="fin-form-select"><option value="">Please Select</option>${_invStoreOptionsHtml(adj?.store_id)}</select>
        <span class="fin-field-error" id="adj-f-store-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Adjustment Date <span class="fin-required">*</span></label>
        <input type="date" id="adj-f-date" class="fin-form-input" value="${adj?.adjustment_date || todayStr}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Type <span class="fin-required">*</span></label>
        <select id="adj-f-type" class="fin-form-select">${INV_ADJUSTMENT_TYPES.map(t => `<option value="${t.value}" ${adj?.adjustment_type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
        <span style="font-size:12px;color:var(--grey-600)">The type is for reporting only. Journal entries are posted by net direction (surplus DRs stock, shortage CRs stock).</span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
        <input type="text" id="adj-f-reason" class="fin-form-input" maxlength="200" value="${_invEsc(adj?.reason || '')}">
        <span class="fin-field-error" id="adj-f-reason-err"></span>
      </div>
      <div class="fin-form-group fin-span-2">
        <label class="fin-form-label">Notes</label>
        <textarea id="adj-f-notes" class="fin-form-textarea" rows="3">${_invEsc(adj?.notes || '')}</textarea>
      </div>
    </div>`;
}
function _adjLinesTableHtml() {
  return `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap">
      <table class="fin-li-table">
        <thead><tr><th>Item</th><th>Direction</th><th>Qty</th><th>Unit Cost</th><th>Line Value</th><th>Notes</th><th></th></tr></thead>
        <tbody id="adj-lines-body"></tbody>
      </table>
    </div>
    <datalist id="adj-item-datalist"></datalist>
    <button type="button" class="fin-btn-outline" style="margin-top:8px;" onclick="_adjAddLine()">+ Add Line</button>
    <div style="margin-top:16px;max-width:360px;margin-left:auto;padding:14px 16px;border-radius:8px;background:var(--navy-700,#1B3057);color:#fff;">
      <div style="font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:.05em;">Net Value</div>
      <div style="font-size:1.3rem;font-weight:700;margin-top:4px;" id="adj-f-net">${formatKES(0)}</div>
    </div>`;
}
// signed_delta is built by prefixing the typed magnitude string with "-" for
// shortages rather than round-tripping through parseFloat, so the payload
// carries exactly what the operator typed (§9.3 — decimals as JSON strings).
function _adjCollectLinesPayload() {
  return _adjLines
    .filter(l => l.item_id && parseFloat(l.quantity) > 0)
    .map(l => {
      const qtyStr = String(l.quantity).trim();
      return {
        item_id: l.item_id,
        signed_delta: l.direction === 'shortage' ? `-${qtyStr}` : qtyStr,
        unit_cost: (l.unit_cost !== '' && l.unit_cost != null) ? String(l.unit_cost).trim() : '0',
        notes: (l.notes || '').trim() || null,
      };
    });
}
function _adjCollectHeaderPayload() {
  return {
    store_id: parseInt(document.getElementById('adj-f-store').value),
    adjustment_date: document.getElementById('adj-f-date').value || null,
    adjustment_type: document.getElementById('adj-f-type').value,
    reason: (document.getElementById('adj-f-reason').value || '').trim(),
    notes: (document.getElementById('adj-f-notes').value || '').trim() || null,
  };
}

// ── Add (Save Draft only) ─────────────────────────────────────────────────
function _adjRenderAddForm(el) {
  _adjLines = [{ item_id: null, item_label: '', direction: 'surplus', quantity: '', unit_cost: '', notes: '' }];
  el.innerHTML = `
    <div class="fin-form-wrap" style="max-width:100%;">
      <h3 class="fin-title" style="font-size:1rem;">New Stock Adjustment</h3>
      ${_adjHeaderFieldsHtml(null)}
      ${_adjLinesTableHtml()}
      <div id="adj-f-msg" style="margin-top:12px;"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_adjSubmitAdd()">Save Draft</button>
        <button class="fin-btn-cancel" onclick="window._splitReload && window._splitReload()">Cancel</button>
      </div>
    </div>`;
  _adjRenderLines();
  _invPopulateItemDatalist('adj-item-datalist', '_adjItemMap');
}
function _adjValidateHeader() {
  document.getElementById('adj-f-store-err').textContent = '';
  document.getElementById('adj-f-reason-err').textContent = '';
  const storeId = document.getElementById('adj-f-store').value;
  const reason = (document.getElementById('adj-f-reason').value || '').trim();
  let valid = true;
  if (!storeId) { document.getElementById('adj-f-store-err').textContent = 'This field is required.'; valid = false; }
  if (!reason) { document.getElementById('adj-f-reason-err').textContent = 'This field is required.'; valid = false; }
  return valid;
}
async function _adjSubmitAdd() {
  document.getElementById('adj-f-msg').innerHTML = '';
  if (!_adjValidateHeader()) return;
  const lines = _adjCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('adj-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with an item and quantity.</div>`;
    return;
  }
  const payload = { ..._adjCollectHeaderPayload(), lines };
  const res = await apiFetch(`${_INV_API}/adjustments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Adjustment saved as draft.', 'success'); await window._splitReload?.(); return; }
  if (!res) return;
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.store_id) document.getElementById('adj-f-store-err').textContent = fieldErrors.store_id;
  else if (fieldErrors.reason) document.getElementById('adj-f-reason-err').textContent = fieldErrors.reason;
  else document.getElementById('adj-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Edit — draft-only, and forbidden entirely when stock-take-sourced
// (canEdit already hides the trigger; this is the 409 backstop) ─────────
function _adjRenderEditForm(item, el) {
  _adjLines = (item.lines || []).map(l => {
    const delta = parseFloat(l.signed_delta) || 0;
    return { item_id: l.item_id, item_label: _invItemLabel(l.item_id), direction: delta < 0 ? 'shortage' : 'surplus', quantity: String(Math.abs(delta)), unit_cost: l.unit_cost, notes: l.notes };
  });
  if (_adjLines.length === 0) _adjLines = [{ item_id: null, item_label: '', direction: 'surplus', quantity: '', unit_cost: '', notes: '' }];
  el.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Adjustment ${_invEsc(item.adjustment_number || '')}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Inventory &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('inventory-adjustments');return false;">Adjustments</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:100%;">
        ${_adjHeaderFieldsHtml(item)}
        ${_adjLinesTableHtml()}
        <div id="adj-f-msg" style="margin-top:12px;"></div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_adjSubmitEdit(${item.id})">Update</button>
          <button class="fin-btn-cancel" onclick="window._splitRefreshSelected && window._splitRefreshSelected()">Cancel</button>
        </div>
      </div>
    </div>`;
  _adjRenderLines();
  _invPopulateItemDatalist('adj-item-datalist', '_adjItemMap');
}
async function _adjSubmitEdit(id) {
  document.getElementById('adj-f-msg').innerHTML = '';
  if (!_adjValidateHeader()) return;
  const lines = _adjCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('adj-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with an item and quantity.</div>`;
    return;
  }
  const payload = { ..._adjCollectHeaderPayload(), lines };
  const res = await apiFetch(`${_INV_API}/adjustments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Adjustment updated.', 'success'); await window._splitRefreshSelected?.(); return; }
  if (!res) return;
  if (res.status === 409) {
    const { message } = await _invParseError(res);
    document.getElementById('adj-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
    return;
  }
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.store_id) document.getElementById('adj-f-store-err').textContent = fieldErrors.store_id;
  else if (fieldErrors.reason) document.getElementById('adj-f-reason-err').textContent = fieldErrors.reason;
  else document.getElementById('adj-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Detail actions — status + source_stocktake_id conditional (§7.6-7.7) ──
function _adjDetailActionsHtml(item) {
  window._adjCurrentItem = item;
  const locked = isStocktakeSourcedAdjustment(item);
  const lockedBanner = locked ? `
    <div style="padding:10px 12px;border-radius:6px;background:var(--gold-100,#fdf3d6);color:#8a6d00;font-size:0.85rem;margin-bottom:14px;">
      This adjustment was auto-created by stock-take <a href="#" onclick="_invOpenStocktake(${item.source_stocktake_id});return false;" style="color:#8a6d00;font-weight:600;">#${item.source_stocktake_id}</a>. To correct it, post a new adjustment; you cannot edit or cancel this one.
    </div>` : '';
  const isDraft = item.status === 'draft';
  const lineRows = (item.lines || []).map(l => {
    const delta = parseFloat(l.signed_delta) || 0;
    const dirPill = delta < 0
      ? `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;color:#fff;background:var(--coral-500);">Shortage</span>`
      : `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;color:#fff;background:var(--navy-700,#1B3057);">Surplus</span>`;
    const enteredCost = parseFloat(l.unit_cost) || 0;
    const pending = isDraft && enteredCost <= 0;
    const costCell = pending ? '<span style="color:#999;font-style:italic;">—</span>' : formatUnitCost(l.unit_cost);
    const lineValue = isDraft ? (delta * enteredCost) : parseFloat(l.line_total || 0);
    const totalCell = pending
      ? '<span style="color:#999;font-style:italic;">pending WAC at approve</span>'
      : `<span style="color:${_invSignedColor(lineValue)};">${_invSignedMoney(lineValue)}</span>`;
    return `
      <tr>
        <td>${_invEsc(_invItemLabel(l.item_id))}</td>
        <td>${dirPill}</td>
        <td style="text-align:right;">${formatQty(Math.abs(delta))}</td>
        <td style="text-align:right;">${costCell}</td>
        <td style="text-align:right;">${totalCell}</td>
        <td>${_invEsc(l.notes || '—')}</td>
      </tr>`;
  }).join('') || `<tr><td colspan="6" class="fin-empty">No lines.</td></tr>`;
  const linesTable = `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap"><table class="fin-li-table">
      <thead><tr><th>Item</th><th>Direction</th><th>Qty</th><th>Unit Cost</th><th>Line Total</th><th>Notes</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table></div>`;

  let actions = '';
  if (item.status === 'draft') {
    actions += `<button class="fin-btn-teal" onclick="_adjOpenApproveModal(${item.id})">Approve</button>`;
    if (!locked) actions += `<button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_adjOpenCancelModal(${item.id})">Cancel</button>`;
  } else if (item.status === 'approved') {
    actions += `<div style="color:#888;font-size:0.85rem;">Approved adjustments cannot be cancelled — post a counter-adjustment instead.</div>`;
  }
  return `
    ${lockedBanner}
    ${linesTable}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;align-items:center;">${actions}</div>
    <div id="adj-action-msg-${item.id}" style="margin-top:8px;"></div>`;
}

// ── Approve — wording adapts to surplus/shortage/net-zero (§7.8) ─────────
function _adjOpenApproveModal(id) {
  const item = window._adjCurrentItem;
  const net = parseFloat(item.net_delta_value) || 0;
  let body;
  if (net > 0) body = `Approve adjustment ${_invEsc(item.adjustment_number || '')}? Stock will be increased and a journal entry posted (DR Inventory / CR Expense) for ${formatKES(net)}.`;
  else if (net < 0) body = `Approve adjustment ${_invEsc(item.adjustment_number || '')}? Stock will be decreased and a journal entry posted (DR Expense / CR Inventory) for ${formatKES(Math.abs(net))}.`;
  else body = `Approve adjustment ${_invEsc(item.adjustment_number || '')}? Stock will move (surplus and shortage lines cancel out net-zero); no journal entry will be posted.`;
  const wrap = document.createElement('div');
  wrap.id = 'adj-approve-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:480px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Approve Adjustment</h3>
      <p style="font-size:0.88rem;color:#444;">${body}</p>
      <div id="adj-approve-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div id="adj-approve-config-warning" style="display:none;padding:10px 12px;border-radius:6px;background:var(--gold-100,#fdf3d6);color:#8a6d00;font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('adj-approve-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_adjSubmitApprove(${id})">Approve</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _adjSubmitApprove(id) {
  const errEl = document.getElementById('adj-approve-err');
  const cfgEl = document.getElementById('adj-approve-config-warning');
  errEl.style.display = 'none'; cfgEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/adjustments/${id}/approve`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('adj-approve-modal-overlay');
    showToast('Adjustment approved.', 'success');
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

// ── Cancel — draft-only, no cancel path once approved ────────────────────
function _adjOpenCancelModal(id) {
  const wrap = document.createElement('div');
  wrap.id = 'adj-cancel-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:420px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Cancel Adjustment</h3>
      <p style="font-size:0.88rem;color:#444;">Cancel draft adjustment? No stock or GL impact.</p>
      <div id="adj-cancel-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-outline" onclick="_coaCloseModal('adj-cancel-modal-overlay')">Keep Adjustment</button>
        <button class="fin-btn-cancel" onclick="_adjSubmitCancel(${id})">Cancel Adjustment</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _adjSubmitCancel(id) {
  const errEl = document.getElementById('adj-cancel-err');
  errEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/adjustments/${id}/cancel`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('adj-cancel-modal-overlay');
    showToast('Adjustment cancelled.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  errEl.textContent = message; errEl.style.display = 'block';
}

// ==================== STOCK-TAKES (§8) ====================
// Snapshot -> count -> commit. Draft/counted status is server-driven (every
// line has counted_qty or not) — never toggled from the FE. The count-entry
// screen lives inside detailActions like every other Inventory doc's lines
// table, but with autosave-on-blur instead of a Save button (§8.5 picks
// option 1 explicitly: no full-save requirement mid-count).

const _INV_STK_STATUS_STYLE = {
  draft:     'color:#666;background:#eee;',
  counted:   'color:#8a6d00;background:var(--gold-100,#fdf3d6);',
  committed: 'color:#1e7e34;background:#dcf3e2;',
  cancelled: 'color:#888;background:#eee;text-decoration:line-through;',
};
function _stkStatusPill(status) {
  const style = _INV_STK_STATUS_STYLE[status] || 'color:#666;background:#eee;';
  const label = status === 'counted' ? 'All lines counted — ready to commit' : ((status || '').replace(/_/g, ' ') || '—');
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;white-space:nowrap;${style}">${_invEsc(label)}</span>`;
}
function _invOpenAdjustment(id) {
  window._invAdjustmentOpenId = id;
  loadView('inventory-adjustments');
}

let _stkCurrentId = null;
let _stkCurrentLines = []; // working copy of the selected stock-take's lines

// ── List (split-view) ────────────────────────────────────────────────────
async function loadInventoryStocktakesView(container) {
  await Promise.all([_invEnsureStoresCache(), _invEnsureItemsCache()]);
  const preselectId = window._invStocktakeOpenId ?? null;
  window._invStocktakeOpenId = null;
  const cfg = {
    container,
    title: 'Stock-Takes',
    moduleKey: 'inventory_management.stocktakes',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Inventory', view: 'inventory-stocktakes' },
      { label: 'Stock-Takes' },
    ],
    apiUrl: `${_INV_API}/stocktakes`,
    searchFields: ['stocktake_number'],
    col1Label: 'Stock-Take', col2Label: 'Status',
    col1: s => `<strong>${_invEsc(s.stocktake_number || '—')}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_invEsc(_invStoreLabel(s.store_id))} &middot; ${s.count_date || ''}</span>`,
    col2: s => _stkStatusPill(s.status),
    rowLabel: s => s.stocktake_number || '—',
    rowSub: s => `${_invStoreLabel(s.store_id)} · ${s.count_date || ''}`,
    idKey: 'id',
    preselectId,
    detailFields: [
      { label: 'Store', key: 'store_id', fmt: v => _invStoreLabel(v) },
      { label: 'Count Date', key: 'count_date', fmt: v => v || '—' },
      { label: 'Notes', key: 'notes', fmt: v => v || '—' },
      { label: 'Status', key: 'status', fmt: v => _stkStatusPill(v) },
    ],
    // No renderEdit/onEdit — the count grid below IS the edit surface;
    // there's no separate header-edit form to gate an Edit button behind.
    renderAdd: el => _stkRenderAddForm(el),
    detailActions: item => _stkDetailActionsHtml(item),
  };
  await renderSplitView(cfg);
  _stkInjectFilters(cfg);
}

function _stkInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;';
  wrap.innerHTML = `
    <select id="stk-filter-status" class="fin-form-select" style="flex:1;min-width:110px;font-size:12px;">
      <option value="">All Statuses</option>
      ${['draft', 'counted', 'committed', 'cancelled'].map(s => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
    </select>
    <select id="stk-filter-store" class="fin-form-select" style="flex:1;min-width:130px;font-size:12px;">
      <option value="">All Stores</option>${_invStoreOptionsHtml(null)}
    </select>
    <input type="date" id="stk-filter-start" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="Start date">
    <input type="date" id="stk-filter-end" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="End date">`;
  searchBox.insertAdjacentElement('afterend', wrap);
  ['stk-filter-status', 'stk-filter-store', 'stk-filter-start', 'stk-filter-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => _stkReapplyFilters(cfg));
  });
}
function _stkReapplyFilters(cfg) {
  const status = document.getElementById('stk-filter-status')?.value || '';
  const storeId = document.getElementById('stk-filter-store')?.value || '';
  const start = document.getElementById('stk-filter-start')?.value || '';
  const end = document.getElementById('stk-filter-end')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (storeId) params.set('store_id', storeId);
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  const qs = params.toString();
  cfg.apiUrl = `${_INV_API}/stocktakes` + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}

// ── Create — snapshot happens server-side on POST; the form is deliberately
// minimal (§8.3). Lands directly on the count-entry screen on success. ─────
function _stkRenderAddForm(el) {
  const todayStr = new Date().toISOString().slice(0, 10);
  el.innerHTML = `
    <div style="max-width:460px;">
      <h3 class="split-right-add-title">Start Stock-Take</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Store <span class="fin-required">*</span></label>
        <select id="stk-f-store" class="fin-form-select"><option value="">Please Select</option>${_invStoreOptionsHtml(null)}</select>
        <span class="fin-field-error" id="stk-f-store-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Count Date <span class="fin-required">*</span></label>
        <input type="date" id="stk-f-date" class="fin-form-input" value="${todayStr}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="stk-f-notes" class="fin-form-textarea" rows="3"></textarea>
      </div>
      <div id="stk-f-msg" style="margin-top:12px;"></div>
      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="fin-btn-teal" onclick="_stkSubmitAdd()">Start Stock-Take</button>
        <button class="fin-btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>`;
}
async function _stkSubmitAdd() {
  document.getElementById('stk-f-store-err').textContent = '';
  document.getElementById('stk-f-msg').innerHTML = '';
  const storeId = document.getElementById('stk-f-store').value;
  const date = document.getElementById('stk-f-date').value;
  if (!storeId) { document.getElementById('stk-f-store-err').textContent = 'This field is required.'; return; }
  const payload = {
    store_id: parseInt(storeId),
    count_date: date || null,
    notes: (document.getElementById('stk-f-notes').value || '').trim() || null,
  };
  const res = await apiFetch(`${_INV_API}/stocktakes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    const created = await res.json();
    showToast('Stock-take started.', 'success');
    await window._splitReload?.();
    window._splitSelectItem?.(created.id);
    return;
  }
  if (!res) return;
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.store_id) document.getElementById('stk-f-store-err').textContent = fieldErrors.store_id;
  else document.getElementById('stk-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Count-entry screen (draft/counted) ───────────────────────────────────
function _stkLineVariance(line) {
  if (line.counted_qty == null || line.counted_qty === '') return null;
  return parseFloat(line.counted_qty) - (parseFloat(line.expected_qty) || 0);
}
function _stkVarianceCellsHtml(line) {
  const variance = _stkLineVariance(line);
  if (variance == null) return { varCell: '—', varValCell: '—' };
  const color = variance > 0 ? 'var(--navy-700,#1B3057)' : (variance < 0 ? 'var(--coral-600,#B03030)' : '#666');
  return {
    varCell: `<span style="color:${color};font-weight:600;">${_invSignedQty(variance)}</span>`,
    varValCell: `<span style="color:${color};">${_invSignedMoney(variance * (parseFloat(line.unit_cost_snapshot) || 0))}</span>`,
  };
}
function _stkProgressBarHtml(lines) {
  const total = lines.length;
  const counted = lines.filter(l => l.counted_qty != null && l.counted_qty !== '').length;
  const pct = total > 0 ? Math.round((counted / total) * 100) : 0;
  return `
    <div style="margin:10px 0 18px;">
      <div style="font-size:0.82rem;color:#555;margin-bottom:4px;">${counted}/${total} lines counted</div>
      <div style="height:8px;border-radius:4px;background:var(--grey-100,#eee);overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:var(--navy-700,#1B3057);transition:width .2s;"></div>
      </div>
    </div>`;
}
function _stkCountsTotalsHtml(lines) {
  const counted = lines.filter(l => l.counted_qty != null && l.counted_qty !== '');
  const varianceLines = counted.filter(l => { const v = _stkLineVariance(l); return v != null && v !== 0; });
  const netValue = counted.reduce((sum, l) => { const v = _stkLineVariance(l); return v ? sum + v * (parseFloat(l.unit_cost_snapshot) || 0) : sum; }, 0);
  const netColor = netValue > 0 ? '#8FD19E' : (netValue < 0 ? '#FF8A80' : '#fff');
  return `
    <div style="margin-top:16px;max-width:360px;margin-left:auto;padding:14px 16px;border-radius:8px;background:var(--navy-700,#1B3057);color:#fff;">
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:6px;"><span>Lines with variance</span><span>${varianceLines.length} of ${lines.length}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:1.05rem;font-weight:700;"><span>Net variance value</span><span style="color:${netColor};">${_invSignedMoney(netValue)}</span></div>
    </div>`;
}
function _stkLineRowHtml(line) {
  const { varCell, varValCell } = _stkVarianceCellsHtml(line);
  return `
    <tr>
      <td>${_invEsc(_invItemLabel(line.item_id))}</td>
      <td style="text-align:right;">${formatQty(line.expected_qty)}</td>
      <td><input type="number" class="fin-li-input" step="0.001" min="0" style="width:100px;" value="${line.counted_qty ?? ''}" onblur="_stkCountBlur(${line.id}, this.value)"></td>
      <td style="text-align:right;">${formatUnitCost(line.unit_cost_snapshot)}</td>
      <td id="stk-line-var-${line.id}" style="text-align:right;">${varCell}</td>
      <td id="stk-line-varval-${line.id}" style="text-align:right;">${varValCell}</td>
      <td><input type="text" class="fin-li-input" placeholder="Notes" value="${_invEsc(line.notes || '')}" onblur="_stkNotesBlur(${line.id}, this.value)"></td>
      <td id="stk-line-check-${line.id}"></td>
    </tr>`;
}
// Autosave on blur (§8.5, option 1) — debounce isn't needed since blur only
// fires once per field per visit, not per keystroke.
async function _stkCountBlur(lineId, val) {
  const line = _stkCurrentLines.find(l => l.id === lineId);
  if (!line) return;
  const trimmed = String(val ?? '').trim();
  const prev = line.counted_qty;
  if (trimmed === '') { if (prev == null || prev === '') return; }
  else if (String(prev ?? '') === trimmed) return;
  line.counted_qty = trimmed === '' ? null : trimmed;
  await _stkSaveCounts([{ id: lineId, counted_qty: line.counted_qty, notes: line.notes || null }]);
}
async function _stkNotesBlur(lineId, val) {
  const line = _stkCurrentLines.find(l => l.id === lineId);
  if (!line) return;
  const trimmed = (val || '').trim();
  if ((line.notes || '') === trimmed) return;
  line.notes = trimmed;
  await _stkSaveCounts([{ id: lineId, counted_qty: line.counted_qty, notes: trimmed || null }]);
}
async function _stkSaveCounts(counts) {
  const res = await apiFetch(`${_INV_API}/stocktakes/${_stkCurrentId}/counts`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ counts }),
  });
  if (res && res.ok) {
    const updated = await res.json();
    // Server is authoritative for status (draft<->counted auto-toggle, §8.2)
    // — merge the returned lines back in and patch only the cells that
    // changed, never the whole pane (a full re-render mid-count drops focus
    // and loses the operator's place in a long count sheet).
    _stkCurrentLines = (updated.lines || []).map(l => ({ ...l }));
    window._stkCurrentItem = { ...window._stkCurrentItem, ...updated, lines: _stkCurrentLines };
    counts.forEach(c => {
      const line = _stkCurrentLines.find(l => l.id === c.id);
      if (!line) return;
      const { varCell, varValCell } = _stkVarianceCellsHtml(line);
      const varEl = document.getElementById(`stk-line-var-${c.id}`);
      const varValEl = document.getElementById(`stk-line-varval-${c.id}`);
      if (varEl) varEl.innerHTML = varCell;
      if (varValEl) varValEl.innerHTML = varValCell;
      const checkEl = document.getElementById(`stk-line-check-${c.id}`);
      if (checkEl) {
        checkEl.innerHTML = '<span style="color:var(--navy-700,#1B3057);">&#10003;</span>';
        setTimeout(() => { if (checkEl) checkEl.innerHTML = ''; }, 2000);
      }
    });
    const progressWrap = document.getElementById('stk-progress-wrap');
    if (progressWrap) progressWrap.innerHTML = _stkProgressBarHtml(_stkCurrentLines);
    const totalsWrap = document.getElementById('stk-count-totals');
    if (totalsWrap) totalsWrap.innerHTML = _stkCountsTotalsHtml(_stkCurrentLines);
    const statusPillWrap = document.getElementById('stk-status-pill');
    if (statusPillWrap) statusPillWrap.innerHTML = _stkStatusPill(updated.status);
    const commitBtn = document.getElementById('stk-commit-btn');
    if (commitBtn) commitBtn.disabled = updated.status !== 'counted';
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  showToast('Error saving count: ' + message, 'error');
}

// §8.2 annotates "(includes lines)" only on the singular GET, not the list
// endpoint — unlike GRN/Issues/Transfers/Adjustments, list rows here may
// come back without a lines array. Hydrate from the singular GET whenever
// that's the case rather than silently rendering an empty count sheet.
async function _stkFetchFullAndRerender(id) {
  const res = await apiFetch(`${_INV_API}/stocktakes/${id}`);
  if (!res || !res.ok) return;
  const full = await res.json();
  const actionsRow = document.querySelector('.detail-actions-row');
  if (actionsRow) actionsRow.innerHTML = _stkDetailActionsHtml(full);
}
function _stkDetailActionsHtml(item) {
  window._stkCurrentItem = item;
  _stkCurrentId = item.id;

  if (!Array.isArray(item.lines)) {
    _stkFetchFullAndRerender(item.id);
    return `<div class="fin-loading">Loading count sheet…</div>`;
  }
  _stkCurrentLines = item.lines.map(l => ({ ...l }));

  if (item.status === 'committed') return _stkCommittedDetailHtml(item);
  if (item.status === 'cancelled') return _stkCancelledDetailHtml(item);

  const rows = _stkCurrentLines.map(_stkLineRowHtml).join('') || `<tr><td colspan="8" class="fin-empty">No lines.</td></tr>`;
  return `
    <div id="stk-status-pill">${_stkStatusPill(item.status)}</div>
    <div id="stk-progress-wrap">${_stkProgressBarHtml(_stkCurrentLines)}</div>
    <div class="fin-section-label">Count Sheet</div>
    <div class="fin-table-wrap"><table class="fin-li-table">
      <thead><tr><th>Item</th><th>Expected Qty</th><th>Counted Qty</th><th>Unit Cost</th><th>Variance</th><th>Variance Value</th><th>Notes</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div id="stk-count-totals">${_stkCountsTotalsHtml(_stkCurrentLines)}</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;align-items:center;">
      <button class="fin-btn-teal" id="stk-commit-btn" ${item.status === 'counted' ? '' : 'disabled'} onclick="_stkOpenCommitModal(${item.id})">Commit</button>
      <button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_stkOpenCancelModal(${item.id})">Cancel Stock-Take</button>
    </div>
    <div id="stk-action-msg-${item.id}" style="margin-top:8px;"></div>`;
}

// ── Committed / cancelled — read-only count sheet (§8.7, §8.8) ───────────
function _stkCommittedDetailHtml(item) {
  const rows = (item.lines || []).map(l => {
    const { varCell, varValCell } = _stkVarianceCellsHtml(l);
    return `
      <tr>
        <td>${_invEsc(_invItemLabel(l.item_id))}</td>
        <td style="text-align:right;">${formatQty(l.expected_qty)}</td>
        <td style="text-align:right;">${l.counted_qty != null ? formatQty(l.counted_qty) : '—'}</td>
        <td style="text-align:right;">${formatUnitCost(l.unit_cost_snapshot)}</td>
        <td style="text-align:right;">${varCell}</td>
        <td style="text-align:right;">${varValCell}</td>
        <td>${_invEsc(l.notes || '—')}</td>
      </tr>`;
  }).join('') || `<tr><td colspan="7" class="fin-empty">No lines.</td></tr>`;
  const resultBanner = item.resulting_adjustment_id
    ? `<div style="padding:12px 14px;border-radius:6px;background:var(--gold-100,#fdf3d6);color:#8a6d00;font-size:0.88rem;margin-bottom:14px;">&rarr; <a href="#" onclick="_invOpenAdjustment(${item.resulting_adjustment_id});return false;" style="color:#8a6d00;font-weight:700;">View resulting adjustment #${item.resulting_adjustment_id}</a></div>`
    : `<div style="padding:12px 14px;border-radius:6px;background:var(--navy-100,#e4e9f3);color:#1B3057;font-size:0.88rem;margin-bottom:14px;">No variance — no adjustment was posted.</div>`;
  return `
    ${resultBanner}
    <div class="fin-section-label">Count Sheet</div>
    <div class="fin-table-wrap"><table class="fin-li-table">
      <thead><tr><th>Item</th><th>Expected Qty</th><th>Counted Qty</th><th>Unit Cost</th><th>Variance</th><th>Variance Value</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}
function _stkCancelledDetailHtml(item) {
  const rows = (item.lines || []).map(l => {
    const { varCell, varValCell } = _stkVarianceCellsHtml(l);
    return `
      <tr>
        <td>${_invEsc(_invItemLabel(l.item_id))}</td>
        <td style="text-align:right;">${formatQty(l.expected_qty)}</td>
        <td style="text-align:right;">${l.counted_qty != null ? formatQty(l.counted_qty) : '—'}</td>
        <td style="text-align:right;">${formatUnitCost(l.unit_cost_snapshot)}</td>
        <td style="text-align:right;">${varCell}</td>
        <td style="text-align:right;">${varValCell}</td>
        <td>${_invEsc(l.notes || '—')}</td>
      </tr>`;
  }).join('') || `<tr><td colspan="7" class="fin-empty">No lines.</td></tr>`;
  return `
    <div class="fin-section-label">Count Sheet (cancelled — counts preserved for audit)</div>
    <div class="fin-table-wrap"><table class="fin-li-table">
      <thead><tr><th>Item</th><th>Expected Qty</th><th>Counted Qty</th><th>Unit Cost</th><th>Variance</th><th>Variance Value</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// ── Commit — the terminal action (§8.6) ──────────────────────────────────
function _stkOpenCommitModal(id) {
  const lines = _stkCurrentLines;
  const varianceLines = lines.filter(l => { const v = _stkLineVariance(l); return v != null && v !== 0; });
  const surplusCount = varianceLines.filter(l => _stkLineVariance(l) > 0).length;
  const shortageCount = varianceLines.filter(l => _stkLineVariance(l) < 0).length;
  const netValue = lines.reduce((sum, l) => { const v = _stkLineVariance(l); return v ? sum + v * (parseFloat(l.unit_cost_snapshot) || 0) : sum; }, 0);
  const wrap = document.createElement('div');
  wrap.id = 'stk-commit-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:520px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Commit Stock-Take</h3>
      <div style="font-size:0.85rem;color:#444;margin-bottom:10px;">
        <div>Lines with variance: <strong>${varianceLines.length}</strong> (${surplusCount} surplus, ${shortageCount} shortage)</div>
        <div>Net variance value: <strong style="color:${_invSignedColor(netValue)};">${_invSignedMoney(netValue)}</strong></div>
      </div>
      <div style="padding:10px 12px;border-radius:6px;background:var(--gold-100,#fdf3d6);color:#8a6d00;font-size:0.82rem;margin-bottom:8px;">
        A single Adjustment (STA…) will be created, posting all variance lines and any journal entry required. The adjustment will be locked — to correct it, post a manual counter-adjustment.
      </div>
      <div style="padding:10px 12px;border-radius:6px;background:var(--navy-100,#e4e9f3);color:#1B3057;font-size:0.82rem;margin-bottom:10px;">
        Stock-take history is preserved — the count sheet stays visible in this record after commit.
      </div>
      <div id="stk-commit-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-bottom:10px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('stk-commit-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_stkSubmitCommit(${id})">Commit</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _stkSubmitCommit(id) {
  const errEl = document.getElementById('stk-commit-err');
  errEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/stocktakes/${id}/commit`, { method: 'POST' });
  if (res && res.ok) {
    const data = await res.json();
    _coaCloseModal('stk-commit-modal-overlay');
    showToast(data.resulting_adjustment_id ? `Stock-take committed. Adjustment #${data.resulting_adjustment_id} posted.` : 'Stock-take committed. No variance.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  errEl.textContent = message; errEl.style.display = 'block';
}

// ── Cancel — draft or counted only (§8.7) ────────────────────────────────
function _stkOpenCancelModal(id) {
  const wrap = document.createElement('div');
  wrap.id = 'stk-cancel-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:440px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Cancel Stock-Take</h3>
      <p style="font-size:0.88rem;color:#444;">Cancel this stock-take? Counted quantities will be preserved for audit but no adjustment will be posted.</p>
      <div id="stk-cancel-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-outline" onclick="_coaCloseModal('stk-cancel-modal-overlay')">Keep Stock-Take</button>
        <button class="fin-btn-cancel" onclick="_stkSubmitCancel(${id})">Cancel Stock-Take</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _stkSubmitCancel(id) {
  const errEl = document.getElementById('stk-cancel-err');
  errEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/stocktakes/${id}/cancel`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('stk-cancel-modal-overlay');
    showToast('Stock-take cancelled.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  errEl.textContent = message; errEl.style.display = 'block';
}

// ==================== INTERNAL REQUISITIONS (BE/FE Contract Addendum 2026-08-11 §1) ====
// Destination-store custodians request stock from a source store; submitting
// routes through DAS (js/document-approvals.js), whose approval auto-creates
// a draft Stock Transfer for the source store to post — which then flips
// this record to FULFILLED server-side (§1.9 of the addendum). No FE
// polling needed for that transition.

// Extend the shared draft/approved/cancelled pill (line ~101) with the three
// extra states this lifecycle needs — additive; Transfers/Adjustments/
// Stock-Takes never hit these keys so their rendering is unaffected.
Object.assign(_INV_DOC_STATUS_STYLE, {
  submitted: 'color:#8a6d00;background:var(--gold-100,#fdf3d6);',
  rejected:  'color:var(--coral-600,#B03030);background:var(--coral-100,#fbe3e3);',
  fulfilled: 'color:#1e7e34;background:#dcf3e2;',
});

let _irqLines = [];

// Onboarding copy for a new governance loop — shown a few times then
// dismissible for good, persisted via localStorage (§1.2).
function _irqGovernanceBanner() {
  const seen = parseInt(localStorage.getItem('irq-banner-seen') || '0', 10);
  if (seen >= 3) return '';
  localStorage.setItem('irq-banner-seen', String(seen + 1));
  return `
    <div id="irq-gov-banner" style="background:var(--navy-700,#1B3057);color:#fff;border-radius:8px;padding:14px 40px 14px 18px;margin-bottom:14px;font-size:0.85rem;line-height:1.5;position:relative;">
      <button onclick="document.getElementById('irq-gov-banner').remove();localStorage.setItem('irq-banner-seen','99');" style="position:absolute;top:8px;right:10px;background:none;border:none;color:#fff;opacity:.7;cursor:pointer;font-size:1rem;line-height:1;">&times;</button>
      Destination-store custodians request stock from a source store here. Submitting routes the requisition through the Document Approval System. On DAS approval, a draft Stock Transfer is auto-created — the source store's custodian then posts it via the normal Transfer approve flow, which fulfils this requisition.
    </div>`;
}

// ── List (split-view) ────────────────────────────────────────────────────
async function loadInventoryInternalRequisitionsView(container) {
  await Promise.all([_invEnsureStoresCache(), _invEnsureItemsCache()]);
  const preselectId = window._irqOpenId ?? null;
  window._irqOpenId = null;
  container.innerHTML = `<div id="irq-banner-slot">${_irqGovernanceBanner()}</div><div id="irq-split-slot"></div>`;
  const cfg = {
    container: document.getElementById('irq-split-slot'),
    title: 'Internal Requisitions',
    moduleKey: 'inventory_management.internal_requisitions',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Inventory', view: 'inventory-internal-requisitions' },
      { label: 'Internal Requisitions' },
    ],
    apiUrl: `${_INV_API}/internal-requisitions`,
    searchFields: ['requisition_number', 'reason'],
    col1Label: 'Requisition', col2Label: 'Status',
    col1: r => `<strong>${_invEsc(r.requisition_number || '—')}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_invEsc(_invStoreLabel(r.from_store_id))} <span style="color:var(--gold-500,#C9A227);">&rarr;</span> ${_invEsc(_invStoreLabel(r.to_store_id))}</span>`,
    col2: r => _invStatusPill(r.status),
    rowLabel: r => r.requisition_number || '—',
    rowSub: r => `${_invEsc(_invStoreLabel(r.from_store_id))} <span style="color:var(--gold-500,#C9A227);">&rarr;</span> ${_invEsc(_invStoreLabel(r.to_store_id))} · ${r.request_date || ''}`,
    idKey: 'id',
    preselectId,
    detailFields: [
      { label: 'From Store', key: 'from_store_id', fmt: v => _invStoreLabel(v) },
      { label: 'To Store', key: 'to_store_id', fmt: v => _invStoreLabel(v) },
      { label: 'Request Date', key: 'request_date', fmt: v => v || '—' },
      { label: 'Reason', key: 'reason', fmt: v => v || '—' },
      { label: 'Notes', key: 'notes', fmt: v => v || '—' },
      { label: 'Status', key: 'status', fmt: v => _invStatusPill(v) },
    ],
    canEdit: item => item.status === 'draft',
    renderAdd: el => _irqRenderAddForm(el),
    renderEdit: (item, el) => _irqRenderEditForm(item, el),
    detailActions: item => _irqDetailActionsHtml(item),
  };
  await renderSplitView(cfg);
  _irqInjectFilters(cfg);
}

function _irqInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;';
  wrap.innerHTML = `
    <select id="irq-filter-status" class="fin-form-select" style="flex:1;min-width:110px;font-size:12px;">
      <option value="">All Statuses</option>
      ${['draft', 'submitted', 'approved', 'rejected', 'cancelled', 'fulfilled'].map(s => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
    </select>
    <select id="irq-filter-from" class="fin-form-select" style="flex:1;min-width:120px;font-size:12px;">
      <option value="">Any From Store</option>${_invStoreOptionsHtml(null)}
    </select>
    <select id="irq-filter-to" class="fin-form-select" style="flex:1;min-width:120px;font-size:12px;">
      <option value="">Any To Store</option>${_invStoreOptionsHtml(null)}
    </select>
    <input type="date" id="irq-filter-start" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="Start date">
    <input type="date" id="irq-filter-end" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="End date">`;
  searchBox.insertAdjacentElement('afterend', wrap);
  ['irq-filter-status', 'irq-filter-from', 'irq-filter-to', 'irq-filter-start', 'irq-filter-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => _irqReapplyFilters(cfg));
  });
}
function _irqReapplyFilters(cfg) {
  const status = document.getElementById('irq-filter-status')?.value || '';
  const fromId = document.getElementById('irq-filter-from')?.value || '';
  const toId = document.getElementById('irq-filter-to')?.value || '';
  const start = document.getElementById('irq-filter-start')?.value || '';
  const end = document.getElementById('irq-filter-end')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (fromId) params.set('from_store_id', fromId);
  if (toId) params.set('to_store_id', toId);
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  const qs = params.toString();
  cfg.apiUrl = `${_INV_API}/internal-requisitions` + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}

// ── Lines ─────────────────────────────────────────────────────────────────
function _irqLineRowHtml(line, idx) {
  return `
    <tr>
      <td><input type="text" class="fin-li-input" list="irq-item-datalist" placeholder="Search item…" value="${_invEsc(line.item_label || '')}" oninput="_irqResolveLineItem(${idx}, this.value)"></td>
      <td><input type="number" class="fin-li-input" step="0.001" min="0.001" style="width:100px;" value="${line.requested_quantity || ''}" oninput="_irqUpdateLine(${idx},'requested_quantity',this.value)"></td>
      <td><input type="number" class="fin-li-input" step="0.0001" min="0" style="width:110px;" value="${line.estimated_unit_cost || ''}" oninput="_irqUpdateLine(${idx},'estimated_unit_cost',this.value)"></td>
      <td><input type="text" class="fin-li-input" placeholder="Notes" value="${_invEsc(line.notes || '')}" oninput="_irqUpdateLine(${idx},'notes',this.value)"></td>
      <td><button class="fin-btn-li-rm" ${_irqLines.length <= 1 ? 'disabled' : ''} onclick="_irqRemoveLine(${idx})">&times;</button></td>
    </tr>`;
}
function _irqRenderLines() {
  const el = document.getElementById('irq-lines-body');
  if (el) el.innerHTML = _irqLines.map((l, i) => _irqLineRowHtml(l, i)).join('');
}
function _irqAddLine() {
  _irqLines.push({ item_id: null, item_label: '', requested_quantity: '', estimated_unit_cost: '', notes: '' });
  _irqRenderLines();
}
function _irqRemoveLine(idx) {
  if (_irqLines.length <= 1) return;
  _irqLines.splice(idx, 1);
  _irqRenderLines();
}
function _irqResolveLineItem(idx, val) {
  const id = (window._irqItemMap || {})[val];
  _irqLines[idx].item_id = id || null;
  _irqLines[idx].item_label = val;
}
function _irqUpdateLine(idx, key, val) {
  _irqLines[idx][key] = val;
}

// ── Shared header fields + lines table ──────────────────────────────────
function _irqHeaderFieldsHtml(r) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">From Store <span class="fin-required">*</span></label>
        <select id="irq-f-from" class="fin-form-select"><option value="">Please Select</option>${_invStoreOptionsHtml(r?.from_store_id)}</select>
        <span class="fin-field-error" id="irq-f-from-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">To Store <span class="fin-required">*</span></label>
        <select id="irq-f-to" class="fin-form-select"><option value="">Please Select</option>${_invStoreOptionsHtml(r?.to_store_id)}</select>
        <span class="fin-field-error" id="irq-f-to-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Request Date <span class="fin-required">*</span></label>
        <input type="date" id="irq-f-date" class="fin-form-input" value="${r?.request_date || todayStr}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason</label>
        <input type="text" id="irq-f-reason" class="fin-form-input" maxlength="200" value="${_invEsc(r?.reason || '')}">
      </div>
      <div class="fin-form-group fin-span-2">
        <label class="fin-form-label">Notes</label>
        <textarea id="irq-f-notes" class="fin-form-textarea" rows="3" maxlength="500">${_invEsc(r?.notes || '')}</textarea>
      </div>
    </div>`;
}
function _irqLinesTableHtml() {
  return `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap">
      <table class="fin-li-table">
        <thead><tr><th>Item</th><th>Requested Qty</th><th>Est. Unit Cost</th><th>Notes</th><th></th></tr></thead>
        <tbody id="irq-lines-body"></tbody>
      </table>
    </div>
    <datalist id="irq-item-datalist"></datalist>
    <div style="font-size:12px;color:#888;margin-top:4px;">Estimated unit cost is optional — actual cost is snapshotted from the source store's moving average at post time.</div>
    <button type="button" class="fin-btn-outline" style="margin-top:8px;" onclick="_irqAddLine()">+ Add Line</button>`;
}
function _irqCollectLinesPayload() {
  return _irqLines
    .filter(l => l.item_id && parseFloat(l.requested_quantity) > 0)
    .map(l => ({
      item_id: l.item_id,
      requested_quantity: String(l.requested_quantity).trim(),
      estimated_unit_cost: (l.estimated_unit_cost !== '' && l.estimated_unit_cost != null) ? String(l.estimated_unit_cost).trim() : null,
      notes: (l.notes || '').trim() || null,
    }));
}
function _irqCollectHeaderPayload() {
  return {
    from_store_id: parseInt(document.getElementById('irq-f-from').value),
    to_store_id: parseInt(document.getElementById('irq-f-to').value),
    request_date: document.getElementById('irq-f-date').value || null,
    reason: (document.getElementById('irq-f-reason').value || '').trim() || null,
    notes: (document.getElementById('irq-f-notes').value || '').trim() || null,
  };
}
function _irqValidateHeader() {
  document.getElementById('irq-f-from-err').textContent = '';
  document.getElementById('irq-f-to-err').textContent = '';
  const fromId = document.getElementById('irq-f-from').value;
  const toId = document.getElementById('irq-f-to').value;
  let valid = true;
  if (!fromId) { document.getElementById('irq-f-from-err').textContent = 'This field is required.'; valid = false; }
  if (!toId) { document.getElementById('irq-f-to-err').textContent = 'This field is required.'; valid = false; }
  if (fromId && toId && fromId === toId) { document.getElementById('irq-f-to-err').textContent = 'To Store must be different from From Store.'; valid = false; }
  return valid;
}

// ── Add (Save Draft only) — from ≠ to enforced client-side (§1.6) ────────
function _irqRenderAddForm(el) {
  _irqLines = [{ item_id: null, item_label: '', requested_quantity: '', estimated_unit_cost: '', notes: '' }];
  el.innerHTML = `
    <div class="fin-form-wrap" style="max-width:100%;">
      <h3 class="fin-title" style="font-size:1rem;">New Internal Requisition</h3>
      ${_irqHeaderFieldsHtml(null)}
      ${_irqLinesTableHtml()}
      <div id="irq-f-msg" style="margin-top:12px;"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_irqSubmitAdd()">Save Draft</button>
        <button class="fin-btn-cancel" onclick="window._splitReload && window._splitReload()">Cancel</button>
      </div>
    </div>`;
  _irqRenderLines();
  _invPopulateItemDatalist('irq-item-datalist', '_irqItemMap');
}
async function _irqSubmitAdd() {
  document.getElementById('irq-f-msg').innerHTML = '';
  if (!_irqValidateHeader()) return;
  const lines = _irqCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('irq-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with an item and requested quantity.</div>`;
    return;
  }
  const payload = { ..._irqCollectHeaderPayload(), lines };
  const res = await apiFetch(`${_INV_API}/internal-requisitions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Internal requisition saved as draft.', 'success'); await window._splitReload?.(); return; }
  if (!res) return;
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.to_store_id) document.getElementById('irq-f-to-err').textContent = fieldErrors.to_store_id;
  else if (fieldErrors.from_store_id) document.getElementById('irq-f-from-err').textContent = fieldErrors.from_store_id;
  else document.getElementById('irq-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Edit — draft-only, PATCH lines is a full replacement (§1.4) ──────────
function _irqRenderEditForm(item, el) {
  _irqLines = (item.lines || []).map(l => ({
    item_id: l.item_id, item_label: _invItemLabel(l.item_id),
    requested_quantity: l.requested_quantity, estimated_unit_cost: l.estimated_unit_cost, notes: l.notes,
  }));
  if (_irqLines.length === 0) _irqLines = [{ item_id: null, item_label: '', requested_quantity: '', estimated_unit_cost: '', notes: '' }];
  el.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Requisition ${_invEsc(item.requisition_number || '')}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Inventory &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('inventory-internal-requisitions');return false;">Internal Requisitions</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:100%;">
        ${_irqHeaderFieldsHtml(item)}
        ${_irqLinesTableHtml()}
        <div id="irq-f-msg" style="margin-top:12px;"></div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_irqSubmitEdit(${item.id})">Update</button>
          <button class="fin-btn-cancel" onclick="window._splitRefreshSelected && window._splitRefreshSelected()">Cancel</button>
        </div>
      </div>
    </div>`;
  _irqRenderLines();
  _invPopulateItemDatalist('irq-item-datalist', '_irqItemMap');
}
async function _irqSubmitEdit(id) {
  document.getElementById('irq-f-msg').innerHTML = '';
  if (!_irqValidateHeader()) return;
  const lines = _irqCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('irq-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with an item and requested quantity.</div>`;
    return;
  }
  const payload = { ..._irqCollectHeaderPayload(), lines };
  const res = await apiFetch(`${_INV_API}/internal-requisitions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Requisition updated.', 'success'); await window._splitRefreshSelected?.(); return; }
  if (!res) return;
  const { fieldErrors, message } = await _invParseError(res);
  if (fieldErrors.to_store_id) document.getElementById('irq-f-to-err').textContent = fieldErrors.to_store_id;
  else if (fieldErrors.from_store_id) document.getElementById('irq-f-from-err').textContent = fieldErrors.from_store_id;
  else document.getElementById('irq-f-msg').innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`;
}

// ── Detail actions — status-conditional lifecycle + cross-links (§1.7-1.9) ──
function _irqDetailActionsHtml(item) {
  window._irqCurrentItem = item;

  const lineRows = (item.lines || []).map(l => {
    const rejected = l.approved_quantity != null && parseFloat(l.approved_quantity) === 0;
    return `
    <tr style="${rejected ? 'opacity:0.6;' : ''}">
      <td>${_invEsc(_invItemLabel(l.item_id))}</td>
      <td style="text-align:right;">${formatQty(l.requested_quantity)}</td>
      <td style="text-align:right;">${l.approved_quantity != null ? formatQty(l.approved_quantity) : '—'}${rejected ? ' <span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;color:var(--coral-600,#B03030);background:var(--coral-100,#fbe3e3);margin-left:6px;">Rejected line</span>' : ''}</td>
      <td style="text-align:right;">${l.estimated_unit_cost != null ? formatUnitCost(l.estimated_unit_cost) : '—'}</td>
      <td>${_invEsc(l.notes || '—')}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" class="fin-empty">No lines.</td></tr>`;
  const linesTable = `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap"><table class="fin-li-table">
      <thead><tr><th>Item</th><th>Requested Qty</th><th>Approved Qty</th><th>Est. Unit Cost</th><th>Notes</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table></div>`;

  const auditStrip = `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--grey-100);font-size:0.82rem;color:#666;display:flex;gap:24px;flex-wrap:wrap;">
      <span>Submitted By: ${item.submitted_by ? '#' + item.submitted_by : '—'}</span>
      <span>Submitted At: ${item.submitted_at ? new Date(item.submitted_at).toLocaleString() : '—'}</span>
      <span>Approved By: ${item.approved_by ? '#' + item.approved_by : '—'}</span>
      <span>Approved At: ${item.approved_at ? new Date(item.approved_at).toLocaleString() : '—'}</span>
      ${item.status === 'rejected' ? `<span style="color:var(--coral-600,#B03030);">Rejection Reason: ${_invEsc(item.rejection_reason || '')}</span>` : ''}
    </div>`;

  let crossLinks = '';
  if ((item.status === 'approved' || item.status === 'fulfilled') && item.stock_transfer_id) {
    crossLinks += `<div style="margin-top:12px;"><button class="fin-btn-outline" onclick="_invOpenSourceDoc('stock_transfer', ${item.stock_transfer_id})">&rarr; View Stock Transfer</button>${item.status === 'approved' ? ` <button class="fin-btn-outline" style="margin-left:8px;" onclick="window._splitRefreshSelected && window._splitRefreshSelected()">Refresh</button>` : ''}</div>`;
  } else if (item.status === 'submitted') {
    crossLinks += `
      <div style="background:var(--navy-50,#EEF3FA);border:1px solid var(--navy-100,#DCE6F5);border-radius:8px;padding:12px 16px;margin-top:12px;font-size:0.86rem;color:var(--navy-700,#1B3057);">
        Awaiting DAS approval.
        <br><a href="#" onclick="openDasQueueForType('internal_requisition');return false;" style="color:var(--navy-700,#1B3057);font-weight:600;text-decoration:underline;">&rarr; Open the DAS queue</a>
      </div>`;
  }
  if (item.status === 'fulfilled' && item.fulfilled_at) {
    crossLinks += `
      <div style="margin-top:12px;display:inline-block;background:var(--navy-700,#1B3057);color:#fff;border-radius:8px;padding:10px 16px;">
        <div style="font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:.05em;">Fulfilled At</div>
        <div style="font-size:0.95rem;font-weight:600;margin-top:2px;">${new Date(item.fulfilled_at).toLocaleString()}</div>
      </div>`;
  }

  let actions = '';
  if (item.status === 'draft') {
    actions += `<button class="fin-btn-teal" onclick="_irqSubmitForApproval(${item.id})">Submit</button>`;
    actions += `<button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_irqOpenCancelModal(${item.id})">Cancel</button>`;
  }
  return `
    ${linesTable}
    ${auditStrip}
    ${crossLinks}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;align-items:center;">${actions}</div>
    <div id="irq-action-msg-${item.id}" style="margin-top:8px;"></div>`;
}

// ── Submit to DAS — idempotently creates a PENDING DA row server-side ────
async function _irqSubmitForApproval(id) {
  const res = await apiFetch(`${_INV_API}/internal-requisitions/${id}/submit`, { method: 'POST' });
  if (res && res.ok) { showToast('Requisition submitted for approval.', 'success'); await window._splitRefreshSelected?.(); return; }
  if (!res) return;
  const { message } = await _invParseError(res);
  const el = document.getElementById(`irq-action-msg-${id}`);
  if (el) el.innerHTML = `<div class="fin-field-error">${_invEsc(message)}</div>`; else showToast(message, 'error');
}

// ── Cancel — draft-only ───────────────────────────────────────────────────
function _irqOpenCancelModal(id) {
  const item = window._irqCurrentItem;
  const wrap = document.createElement('div');
  wrap.id = 'irq-cancel-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:440px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Cancel Requisition</h3>
      <p style="font-size:0.88rem;color:#444;">Cancel draft requisition ${_invEsc(item?.requisition_number || '')}? This can only be undone by creating a new record.</p>
      <div id="irq-cancel-err" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-outline" onclick="_coaCloseModal('irq-cancel-modal-overlay')">Keep Requisition</button>
        <button class="fin-btn-cancel" onclick="_irqSubmitCancel(${id})">Cancel Requisition</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _irqSubmitCancel(id) {
  const errEl = document.getElementById('irq-cancel-err');
  errEl.style.display = 'none';
  const res = await apiFetch(`${_INV_API}/internal-requisitions/${id}/cancel`, { method: 'POST' });
  if (res && res.ok) {
    _coaCloseModal('irq-cancel-modal-overlay');
    showToast('Requisition cancelled.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  if (!res) return;
  const { message } = await _invParseError(res);
  errEl.textContent = message; errEl.style.display = 'block';
}
