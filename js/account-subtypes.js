// ==================== ACCOUNT SUB-TYPES ====================
// BE/FE Contract Addendum 2026-08-28 §C.2. User-editable master data behind
// the Chart of Accounts' Subtype picker, replacing the hardcoded
// ACCOUNT_SUBTYPES_BY_TYPE map as the source of truth. Built against the live
// /api/finance/account-subtypes/ endpoints (confirmed via openapi.json: path
// param is subtype_id, list takes account_type + include_inactive, DELETE
// answers 204).
//
// The list arrives server-sorted by (account_type, display_order NULLS LAST,
// name), so nothing here re-sorts it — rows go straight into renderSplitView's
// cfg.groupBy, which sections them by account_type in arrival order.
//
// Permission scope is finance.utilities, not the finance.setup the addendum
// names: its stated intent was "the same permission that guards CoA", and CoA
// (plus Fee Accounts, Fee Items and General Items — every screen in this same
// Finance > Utilities menu) is gated on finance.utilities here. finance.setup
// guards sibling groups and fee setup instead, so using it would have hidden
// this module from exactly the operators who maintain the accounts it feeds.
//
// Sub-types are edited from the detail pane (banner pencil to edit, Delete in
// the actions row) rather than a per-row "..." menu, matching every other
// finance catalog screen — Asset Categories, Fiscal Years, Session Types.

const _AST_API = `${API_BASE}/finance/account-subtypes/`;
const _AST_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

// Shared lookup cache for the CoA subtype picker. Deliberately fed only by
// _astLoad() — an unfiltered, include-inactive fetch — and never from this
// module's own filtered list response, so narrowing the screen's Account Type
// filter can't silently shrink the options the CoA form offers.
let _astSubtypes = [];
let _astLoaded = false;

let _astTypeFilter = '';
let _astIncludeInactive = true;

async function _astLoad(force = false) {
  if (_astLoaded && !force) return _astSubtypes;
  const res = await apiFetch(`${_AST_API}?include_inactive=true`);
  if (res && res.ok) {
    _astSubtypes = _toArray(await res.json());
    _astLoaded = true;
  }
  return _astSubtypes;
}

// ── List view ────────────────────────────────────────────────────────────
async function loadAccountSubtypesView(container) {
  await _astLoad(true);
  const qs = new URLSearchParams();
  if (_astTypeFilter) qs.set('account_type', _astTypeFilter);
  if (!_astIncludeInactive) qs.set('include_inactive', 'false');
  const query = qs.toString();

  await renderSplitView({
    container,
    moduleKey: 'finance.utilities',
    title: 'Sub-Types',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-sub-types'},
      {label:'Utilities',view:'fin-sub-types'},
      {label:'Sub-Types'}
    ],
    apiUrl: `${_AST_API}${query ? '?' + query : ''}`,
    listFilters: _astFiltersHtml(),
    searchFields: ['name', 'account_type'],
    groupBy: s => s.account_type || 'Unclassified',
    col1Label: 'Name', col2Label: 'Status / Usage',
    col1: _astCol1,
    col2: _astCol2,
    rowLabel: s => s.name || `#${s.id}`,
    rowSub:   s => s.account_type || '',
    idKey: 'id',
    detailFields: [
      {label:'Name',           key:'name'},
      {label:'Account Type',   key:'account_type'},
      {label:'Display Order',  key:'display_order', fmt:v => v == null ? '— (sorts last)' : String(v)},
      {label:'Status',         key:'is_active',  fmt:v => v ? 'Active' : 'Inactive'},
      {label:'Origin',         key:'is_system',  fmt:v => v ? 'System-seeded' : 'Admin-created'},
      {label:'Accounts Using', key:'accounts_using', fmt:v => v == null ? '—' : String(v)},
      {label:'Created',        key:'created_at', fmt:v => _pvDate(v)},
    ],
    renderAdd:  el => _astRenderAddForm(el),
    renderEdit: (item, el) => _astRenderEditForm(item, el),
    detailActions: _astDetailActions,
  });
}

function _astCol1(s) {
  const sys = s.is_system ? ' <span class="ast-pill ast-pill-system">System</span>' : '';
  return `${_finEsc(s.name || '')}${sys}`;
}

function _astCol2(s) {
  const n = s.accounts_using;
  const usage = n == null ? '' : `<span class="ast-usage">${n} account${n === 1 ? '' : 's'}</span>`;
  // stopPropagation so flipping the toggle doesn't also select the row behind it
  return `<label class="ast-toggle" onclick="event.stopPropagation()">
      <input type="checkbox" ${s.is_active ? 'checked' : ''} onchange="_astToggleActive(${s.id}, this)"> Active
    </label>${usage}`;
}

async function _astToggleActive(id, cb) {
  const next = cb.checked;
  const res = await apiFetch(`${_AST_API}${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: next }),
  });
  if (res && res.ok) {
    showToast(`Sub-type ${next ? 'activated' : 'deactivated'}.`, 'success');
    await _astLoad(true);
    // Re-fetch in place so the row (and any open detail pane) reflects server
    // truth without dropping the operator's position in the list.
    await window._splitRefreshSelected?.();
    return;
  }
  cb.checked = !next;  // revert the optimistic flip
  if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ── Filters ──────────────────────────────────────────────────────────────
function _astFiltersHtml() {
  return `
    <div style="display:flex;gap:8px;padding:8px 12px;flex-wrap:wrap;align-items:center;">
      <select id="ast-filter-type" class="fin-filter-select" style="max-width:130px;" onchange="_astApplyFilters()">
        <option value="">All Types</option>
        ${_AST_TYPES.map(t => `<option value="${t}" ${_astTypeFilter === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--grey-600);cursor:pointer;">
        <input type="checkbox" id="ast-filter-inactive" ${_astIncludeInactive ? 'checked' : ''} onchange="_astApplyFilters()"> Include inactive
      </label>
    </div>`;
}

function _astApplyFilters() {
  _astTypeFilter      = document.getElementById('ast-filter-type')?.value || '';
  _astIncludeInactive = !!document.getElementById('ast-filter-inactive')?.checked;
  loadView('fin-sub-types');
}

// ── Error banner ─────────────────────────────────────────────────────────
// 409s here carry the detail that matters (the conflicting type, or every
// dependent account number) — a toast scrolls away mid-read, so the message
// also lands in a banner pinned to the top of the right panel.
function _astShowBanner(msg, helper) {
  const host = document.getElementById('split-right-panel');
  if (!host) return;
  let el = document.getElementById('ast-error-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ast-error-banner';
    host.prepend(el);
  }
  el.style.cssText = 'margin:0 0 14px;padding:10px 14px;border-radius:6px;border-left:3px solid var(--coral-500);background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;';
  el.innerHTML = `${_finEsc(msg)}${helper ? `<div style="margin-top:6px;font-size:0.8rem;">${_finEsc(helper)}</div>` : ''}`;
}
function _astClearBanner() { document.getElementById('ast-error-banner')?.remove(); }

// ── Delete ───────────────────────────────────────────────────────────────
function _astDetailActions(s) {
  if (s.is_system) {
    return `<span style="font-size:12px;color:var(--grey-600)">System-seeded sub-types cannot be deleted.</span>`;
  }
  if (!canDelete('finance.utilities')) return '';
  return `<button class="fin-btn-cancel" style="background:var(--coral-500,#D94040);color:#fff;" onclick="_astConfirmDelete(${s.id})">Delete</button>`;
}

// Takes the id alone, not the name — sub-type names carry apostrophes
// ("Director's Loan") that would terminate an inline onclick string early.
async function _astConfirmDelete(id) {
  const s = _astSubtypes.find(x => String(x.id) === String(id));
  const name = s ? s.name : `#${id}`;
  if (!confirm(`Delete subtype '${name}'? This is only allowed if no accounts are using it.`)) return;
  _astClearBanner();
  const res = await apiFetch(`${_AST_API}${id}`, { method: 'DELETE' });
  if (res && res.status === 204) {
    showToast('Sub-type deleted.', 'success');
    await _astLoad(true);
    window._splitRemoveItem?.(id);
    return;
  }
  if (!res) return;
  const msg = await parseApiError(res);
  _astShowBanner(msg, res.status === 409 ? 'Reassign or delete the dependent accounts first, then retry.' : '');
  showToast('Error: ' + msg, 'error');
}

// ── Add form ─────────────────────────────────────────────────────────────
function _astRenderAddForm(el) {
  el.innerHTML = `
    <div class="fin-form-wrap" style="padding:20px;">
      <h3 class="fin-title" style="font-size:1rem;margin-bottom:14px;">Add Sub-Type</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Account Type <span class="fin-required">*</span></label>
        <select id="ast-f-type" class="fin-form-select">
          <option value="">Please Select</option>
          ${_AST_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
        <span style="font-size:11px;color:var(--grey-500);display:block;">Cannot be changed after creation.</span>
        <span class="fin-field-error" id="ast-f-type-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Name <span class="fin-required">*</span></label>
        <input type="text" id="ast-f-name" class="fin-form-input" maxlength="50">
        <span class="fin-field-error" id="ast-f-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Display Order</label>
        <input type="number" id="ast-f-order" class="fin-form-input" step="1">
        <span style="font-size:11px;color:var(--grey-500);display:block;">Lower numbers appear first. Leave blank to sort last within this type.</span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-check-label" style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
          <input type="checkbox" id="ast-f-active" class="fin-cb" checked> Active
        </label>
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_astSubmitAdd()">Save</button>
        <button class="fin-btn-cancel" onclick="loadView('fin-sub-types')">Cancel</button>
      </div>
    </div>`;
}

async function _astSubmitAdd() {
  _astClearBanner();
  const setErr = (id, m) => { const e = document.getElementById(id); if (e) e.textContent = m || ''; };
  setErr('ast-f-type-err', ''); setErr('ast-f-name-err', '');

  const type     = document.getElementById('ast-f-type').value;
  const name     = document.getElementById('ast-f-name').value.trim();
  const orderRaw = document.getElementById('ast-f-order').value.trim();
  let valid = true;
  if (!type) { setErr('ast-f-type-err', 'This field is required.'); valid = false; }
  if (!name) { setErr('ast-f-name-err', 'This field is required.'); valid = false; }
  if (!valid) return;

  const payload = {
    name,
    account_type:  type,
    display_order: orderRaw === '' ? null : parseInt(orderRaw, 10),
    is_active:     document.getElementById('ast-f-active').checked,
  };
  const res = await apiFetch(_AST_API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    showToast('Sub-type created.', 'success');
    await _astLoad(true);
    loadView('fin-sub-types');
    return;
  }
  if (!res) return;
  // 409 names the type the colliding row already sits under — surfaced verbatim.
  const msg = await parseApiError(res);
  _astShowBanner(msg, '');
  showToast('Error: ' + msg, 'error');
}

// ── Edit form ────────────────────────────────────────────────────────────
function _astRenderEditForm(s, el) {
  const sys = !!s.is_system;
  el.innerHTML = `
    <div class="fin-form-wrap" style="padding:20px;">
      <h3 class="fin-title" style="font-size:1rem;margin-bottom:10px;">Edit Sub-Type</h3>
      ${sys ? `<div style="margin-bottom:14px;padding:9px 13px;border-radius:6px;border-left:3px solid var(--navy-700);background:var(--navy-50);color:var(--navy-700);font-size:0.8rem;">This is a system-seeded subtype. Only the Active toggle can be changed.</div>` : ''}
      <div class="fin-form-group">
        <label class="fin-form-label">Account Type</label>
        <select id="ast-e-type" class="fin-form-select" disabled>
          <option>${_finEsc(s.account_type || '')}</option>
        </select>
        <span style="font-size:11px;color:var(--grey-500);display:block;">Cannot be changed after creation.</span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Name <span class="fin-required">*</span></label>
        <input type="text" id="ast-e-name" class="fin-form-input" maxlength="50" value="${_finEsc(s.name || '')}" ${sys ? 'disabled' : ''}>
        <span class="fin-field-error" id="ast-e-name-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Display Order</label>
        <input type="number" id="ast-e-order" class="fin-form-input" step="1" value="${s.display_order ?? ''}" ${sys ? 'disabled' : ''}>
        <span style="font-size:11px;color:var(--grey-500);display:block;">Lower numbers appear first. Leave blank to sort last within this type.</span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-check-label" style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:pointer;">
          <input type="checkbox" id="ast-e-active" class="fin-cb" ${s.is_active ? 'checked' : ''}> Active
        </label>
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_astSubmitEdit(${s.id})">Update</button>
        <button class="fin-btn-cancel" onclick="loadView('fin-sub-types')">Cancel</button>
      </div>
    </div>`;
}

async function _astSubmitEdit(id) {
  _astClearBanner();
  const s   = _astSubtypes.find(x => String(x.id) === String(id)) || {};
  const sys = !!s.is_system;
  const payload = { is_active: document.getElementById('ast-e-active').checked };
  if (!sys) {
    const name = document.getElementById('ast-e-name').value.trim();
    if (!name) { document.getElementById('ast-e-name-err').textContent = 'This field is required.'; return; }
    const orderRaw = document.getElementById('ast-e-order').value.trim();
    payload.name          = name;
    payload.display_order = orderRaw === '' ? null : parseInt(orderRaw, 10);
  }
  const res = await apiFetch(`${_AST_API}${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    showToast('Sub-type updated.', 'success');
    await _astLoad(true);
    loadView('fin-sub-types');
    return;
  }
  if (!res) return;
  const msg = await parseApiError(res);
  _astShowBanner(msg, '');
  showToast('Error: ' + msg, 'error');
}
