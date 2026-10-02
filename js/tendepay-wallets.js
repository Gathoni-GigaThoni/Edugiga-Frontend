// ==================== TENDEPAY WALLETS ====================
// Operator admin for the Tendepay wallet set — one Main parent plus the Mini
// sub-wallets money is loaded into, built against the live
// /api/tendepay/wallets/ endpoints shipped same day. The BE fills in every
// accounting field (parent, type, subtype, role, number), so this screen only
// exposes the three operator-editable attributes: account_name,
// tendepay_wallet_code, and (MINI rows only) is_active.
//
// Permission wiring:
//   - BE read gate:  finance.tendepay_wallets OR finance.setup
//   - BE write gate: strict finance.tendepay_wallets
// The sidebar entry's visibility uses the OR shape ([key, key] in dashboard.js
// _SIDEBAR_ITEM_MODULE_KEYS). The split view below is scoped on the write key
// alone, which is correct for its purpose — canAdd/canEdit gate the Add trigger
// and the Edit/Deactivate buttons. The list fetch still runs under either key
// (the server enforces that, not this file).
//
// Role-based hide rules on the detail pane:
//   - Deactivate button hidden on singleton roles (main, suspense, charges)
//     because the import pipeline needs them permanently active — the server
//     409s if you try, and we don't make the operator discover that by click.
//   - On the Edit screen, the Active checkbox is disabled for the same roles.
// Both are redundant with the BE 409 — defense in depth, not primary gate.
//
// PATCH is "exclude_unset" — the submit handler diffs the form against the
// baseline fetched before edit and sends only changed fields, matching the
// contract and avoiding a stray "update" when the operator just hit Save.

const _TW_API = `${API_BASE}/tendepay/wallets/`;
const _TW_SINGLETON_ROLES = new Set(['main', 'suspense', 'charges']);

let _twList = [];
let _twLoaded = false;
let _twStatusFilter = 'active';  // 'active' | 'inactive' | 'all'
let _twPreselectId = null;

async function _twLoad(force = false) {
  if (_twLoaded && !force) return _twList;
  const res = await apiFetch(`${_TW_API}?include_inactive=true`);
  if (res && res.ok) {
    _twList = _toArray(await res.json());
    _twLoaded = true;
  }
  return _twList;
}

// Server stores wallet_code upper-cased; mirror that in the input so what the
// operator sees matches what gets persisted.
function _twUpperInput(el) {
  const start = el.selectionStart, end = el.selectionEnd;
  el.value = el.value.toUpperCase();
  try { el.setSelectionRange(start, end); } catch (_) {}
}

function _twRoleBadge(role) {
  const styles = {
    main:     'color:#5b2b8f;background:#ece0fa',
    mini:     'color:#1a5fb4;background:#dce8fb',
    suspense: 'color:#9a7d0a;background:#fdf3d0',
    charges:  'color:#555;background:#ececec',
  };
  const s = styles[role] || styles.charges;
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.72rem;font-weight:600;letter-spacing:0.4px;${s};">${_finEsc((role || '').toUpperCase())}</span>`;
}

function _twRoleGroupLabel(role) {
  return (role || 'unclassified').toUpperCase();
}

// ── List view ────────────────────────────────────────────────────────────
async function loadTendepayWalletsView(container) {
  await _twLoad(true);
  const preselect = _twPreselectId;
  _twPreselectId = null;

  await renderSplitView({
    container,
    moduleKey: 'finance.tendepay_wallets',
    title: 'Tendepay Wallets',
    breadcrumb: [
      {label:'Dashboard', view:null},
      {label:'Finance',   view:'tendepay-wallets'},
      {label:'Tendepay',  view:'tendepay-wallets'},
      {label:'Wallets'},
    ],
    apiUrl: `${_TW_API}?include_inactive=true`,
    listFilters: _twFiltersHtml(),
    listFilterFn: _twListFilterFn,
    searchFields: ['number', 'account_name', 'tendepay_wallet_code'],
    groupBy: w => _twRoleGroupLabel(w.wallet_role),
    col1Label: 'Number', col2Label: 'Account Name',
    col1: w => _finEsc(w.number || ''),
    col2: _twCol2,
    rowLabel: w => _finEsc(w.account_name || `#${w.id}`),
    rowSub:   w => `${_finEsc(w.number || '')} &middot; ${_finEsc((w.wallet_role || '').toUpperCase())}`,
    idKey: 'id',
    detailFields: [
      {label:'Number',          key:'number',               fmt:v => _finEsc(v || '—')},
      {label:'Account Name',    key:'account_name',         fmt:v => _finEsc(v || '—')},
      {label:'Role',            key:'wallet_role',          fmt:v => _twRoleBadge(v)},
      {label:'Wallet Code',     key:'tendepay_wallet_code', fmt:v => v ? _finEsc(v) : '— (not set)'},
      {label:'Parent Number',   key:'parent_number',        fmt:v => v ? _finEsc(v) : '—'},
      {label:'Status',          key:'is_active',            fmt:v => v ? 'Active' : 'Inactive'},
    ],
    renderAdd: _pvAddPlaceholder('Mini Wallet', 'tendepay-wallets-add',
      'Mini wallets are the Tendepay sub-wallets you load funds into. The accounting fields are filled by the server.'),
    onAdd:  () => loadView('tendepay-wallets-add'),
    onEdit: item => { window._twEditId = item.id; loadView('tendepay-wallets-edit'); },
    detailActions: _twDetailActions,
    preselectId: preselect,
  });
}

function _twCol2(w) {
  const name = _finEsc(w.account_name || '');
  const dim  = w.is_active ? '' : 'color:var(--grey-500);text-decoration:line-through;';
  const code = w.tendepay_wallet_code
    ? `<span style="font-size:11px;color:var(--grey-500);margin-left:6px;">${_finEsc(w.tendepay_wallet_code)}</span>`
    : '';
  return `<span style="${dim}">${name}</span>${code}`;
}

function _twListFilterFn(w) {
  if (_twStatusFilter === 'active')   return !!w.is_active;
  if (_twStatusFilter === 'inactive') return !w.is_active;
  return true;
}

function _twFiltersHtml() {
  const helpBanner = `
    <div style="padding:10px 12px;border-bottom:1px solid var(--grey-100);font-size:11px;color:var(--grey-600);line-height:1.5;">
      Mini wallets are the Tendepay sub-wallets you load funds into. Add a new mini wallet before transferring money to it.
      Singleton roles (Main, Suspense, Charges) cannot be deactivated from this screen — their active state is enforced by the import pipeline.
    </div>`;
  return `
    ${helpBanner}
    <div style="display:flex;gap:8px;padding:8px 12px;flex-wrap:wrap;align-items:center;">
      <label style="font-size:11px;color:var(--grey-600)">Status:</label>
      <select id="tw-filter-status" class="fin-filter-select" style="max-width:140px;" onchange="_twApplyFilters()">
        <option value="active"   ${_twStatusFilter === 'active'   ? 'selected' : ''}>Active</option>
        <option value="inactive" ${_twStatusFilter === 'inactive' ? 'selected' : ''}>Inactive</option>
        <option value="all"      ${_twStatusFilter === 'all'      ? 'selected' : ''}>All</option>
      </select>
    </div>`;
}

function _twApplyFilters() {
  _twStatusFilter = document.getElementById('tw-filter-status')?.value || 'active';
  loadView('tendepay-wallets');
}

// ── Detail pane actions ──────────────────────────────────────────────────
function _twDetailActions(w) {
  if (!canEdit('finance.tendepay_wallets')) return '';
  if (_TW_SINGLETON_ROLES.has(w.wallet_role)) return '';
  // id-only onclick — account_name may hold apostrophes that'd break an
  // inline string arg (same pattern as _astConfirmDelete).
  return `<button class="fin-btn-cancel" style="background:var(--coral-500,#D94040);color:#fff;" onclick="_twConfirmDeactivate(${w.id})">Deactivate</button>`;
}

async function _twConfirmDeactivate(id) {
  const w = _twList.find(x => String(x.id) === String(id));
  if (!w) return;
  const label = `${w.number || ''} ${w.account_name || ''}`.trim();
  if (!confirm(`Deactivate '${label}'? Operators will no longer be able to transfer funds into it, but historical transactions and reports are preserved. Reactivate anytime from the Inactive filter.`)) return;
  const res = await apiFetch(`${_TW_API}${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: false }),
  });
  if (res && res.ok) {
    showToast('Mini wallet deactivated.', 'success');
    _twPreselectId = id;
    await _twLoad(true);
    loadView('tendepay-wallets');
    return;
  }
  if (!res) return;
  showToast('Error: ' + await parseApiError(res), 'error');
}

// ── Error banner (shared) ────────────────────────────────────────────────
function _twShowBanner(host, msg) {
  if (!host) return;
  let el = host.querySelector('#tw-error-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tw-error-banner';
    host.prepend(el);
  }
  el.style.cssText = 'margin:0 0 14px;padding:10px 14px;border-radius:6px;border-left:3px solid var(--coral-500);background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;';
  el.textContent = msg;
}

// ── Add page ─────────────────────────────────────────────────────────────
async function loadTendepayWalletsAddView(container) {
  renderTendepayWalletsAddPage(container);
}

function renderTendepayWalletsAddPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Mini Wallet</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Tendepay &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('tendepay-wallets');return false;">Wallets</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div id="tw-add-banner-host"></div>
        <div style="font-size:11px;color:var(--grey-500);margin-bottom:14px;">A new wallet is always created as a MINI under the Main Tendepay wallet. The account number, parent, type, subtype and role are assigned by the server.</div>
        <div class="fin-form-group">
          <label class="fin-form-label">Account Name <span class="fin-required">*</span></label>
          <input type="text" id="tw-f-name" class="fin-form-input" maxlength="150" placeholder="e.g. Tendepay – Suppliers">
          <span class="fin-field-error" id="tw-f-name-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Wallet Code</label>
          <input type="text" id="tw-f-code" class="fin-form-input" maxlength="50" placeholder="Optional. Stored upper-cased." oninput="_twUpperInput(this)">
          <span style="font-size:11px;color:var(--grey-500);display:block;">Leave blank if the Tendepay sub-wallet does not have a code yet.</span>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" id="tw-add-submit" onclick="_twSubmitAdd()">Save</button>
          <button class="fin-btn-cancel" onclick="loadView('tendepay-wallets')">Cancel</button>
        </div>
      </div>
    </div>`;
}

async function _twSubmitAdd() {
  const nameEl = document.getElementById('tw-f-name');
  const codeEl = document.getElementById('tw-f-code');
  const errEl  = document.getElementById('tw-f-name-err');
  if (errEl) errEl.textContent = '';

  const name = (nameEl?.value || '').trim();
  if (!name) { if (errEl) errEl.textContent = 'This field is required.'; return; }

  const payload = { account_name: name };
  const code = (codeEl?.value || '').trim();
  if (code) payload.tendepay_wallet_code = code;

  const res = await apiFetch(_TW_API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    const created = await res.json().catch(() => null);
    showToast('Mini wallet created.', 'success');
    _twPreselectId = created?.id ?? null;
    await _twLoad(true);
    loadView('tendepay-wallets');
    return;
  }
  if (!res) return;
  const msg = await parseApiError(res);
  // 422 "Tendepay Main Wallet not seeded" — surface it as a page banner and
  // lock the Save button, because the operator cannot resolve this themselves.
  if (res.status === 422 && /main wallet/i.test(msg)) {
    const host = document.querySelector('#tw-add-banner-host');
    _twShowBanner(host, 'Tendepay Main Wallet (15-00-000) is not seeded. Contact an administrator.');
    const btn = document.getElementById('tw-add-submit');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.style.cursor = 'not-allowed'; }
    return;
  }
  showToast('Error: ' + msg, 'error');
}

// ── Edit page ────────────────────────────────────────────────────────────
async function loadTendepayWalletsEditView(container) {
  const id = window._twEditId;
  if (id == null) { showToast('No wallet selected.', 'error'); loadView('tendepay-wallets'); return; }
  const res = await apiFetch(`${_TW_API}${id}`);
  if (!res || !res.ok) {
    if (res && res.status === 404) showToast('Tendepay wallet not found.', 'error');
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
    loadView('tendepay-wallets');
    return;
  }
  const w = await res.json();
  renderTendepayWalletsEditPage(container, w);
}

function renderTendepayWalletsEditPage(container, w) {
  const isSingleton = _TW_SINGLETON_ROLES.has(w.wallet_role);
  // Baseline for the exclude_unset diff on submit — stored as JSON so form
  // state survives any later re-render inside this page.
  window._twEditBaseline = {
    id: w.id,
    wallet_role: w.wallet_role,
    account_name: w.account_name || '',
    tendepay_wallet_code: w.tendepay_wallet_code || '',
    is_active: !!w.is_active,
  };

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Wallet</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Tendepay &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('tendepay-wallets');return false;">Wallets</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap">
        <div id="tw-edit-banner-host"></div>
        <div style="margin-bottom:14px;padding:9px 13px;border-radius:6px;border-left:3px solid var(--navy-700);background:var(--navy-50);color:var(--navy-700);font-size:0.8rem;">
          <strong>${_finEsc(w.number || '')}</strong> &middot; ${_twRoleBadge(w.wallet_role)}
          ${isSingleton ? ' &middot; Singleton role — its active state is enforced by the import pipeline and cannot be changed from this screen.' : ''}
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Account Name <span class="fin-required">*</span></label>
          <input type="text" id="tw-e-name" class="fin-form-input" maxlength="150" value="${_finEsc(w.account_name || '')}">
          <span class="fin-field-error" id="tw-e-name-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Wallet Code</label>
          <input type="text" id="tw-e-code" class="fin-form-input" maxlength="50" value="${_finEsc(w.tendepay_wallet_code || '')}" oninput="_twUpperInput(this)">
          <span style="font-size:11px;color:var(--grey-500);display:block;">Stored upper-cased. Leave blank to clear.</span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-check-label" style="display:flex;align-items:center;gap:8px;font-size:0.9rem;cursor:${isSingleton ? 'not-allowed' : 'pointer'};">
            <input type="checkbox" id="tw-e-active" class="fin-cb" ${w.is_active ? 'checked' : ''} ${isSingleton ? 'disabled' : ''}> Active
          </label>
          <span class="fin-field-error" id="tw-e-active-err"></span>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_twSubmitEdit()">Update</button>
          <button class="fin-btn-cancel" onclick="loadView('tendepay-wallets')">Cancel</button>
        </div>
      </div>
    </div>`;
}

async function _twSubmitEdit() {
  const base = window._twEditBaseline;
  if (!base) { loadView('tendepay-wallets'); return; }

  const nameEl  = document.getElementById('tw-e-name');
  const codeEl  = document.getElementById('tw-e-code');
  const actEl   = document.getElementById('tw-e-active');
  const nameErr = document.getElementById('tw-e-name-err');
  const actErr  = document.getElementById('tw-e-active-err');
  if (nameErr) nameErr.textContent = '';
  if (actErr)  actErr.textContent  = '';

  const name = (nameEl?.value || '').trim();
  if (!name) { if (nameErr) nameErr.textContent = 'This field is required.'; return; }

  // exclude_unset — only send fields the operator actually changed.
  const payload = {};
  if (name !== base.account_name) payload.account_name = name;

  const codeTrim = (codeEl?.value || '').trim();
  if (codeTrim !== (base.tendepay_wallet_code || '')) {
    // Empty string clears the code — the schema allows null; the BE also
    // accepts an empty string per the contract (upper-cases it, no-op on null).
    payload.tendepay_wallet_code = codeTrim ? codeTrim : null;
  }

  const isSingleton = _TW_SINGLETON_ROLES.has(base.wallet_role);
  if (!isSingleton && actEl && actEl.checked !== base.is_active) {
    payload.is_active = actEl.checked;
  }

  if (Object.keys(payload).length === 0) {
    showToast('No changes to save.', 'info');
    return;
  }

  const res = await apiFetch(`${_TW_API}${base.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    showToast('Wallet updated.', 'success');
    _twPreselectId = base.id;
    await _twLoad(true);
    loadView('tendepay-wallets');
    return;
  }
  if (!res) return;
  const msg = await parseApiError(res);
  if (res.status === 409) {
    // Singleton-role deactivation refused — inline under the Active toggle,
    // which is where the operator looked. (In practice the checkbox is also
    // disabled for singletons, but the BE is the real gate.)
    if (actErr) actErr.textContent = msg;
    const host = document.querySelector('#tw-edit-banner-host');
    _twShowBanner(host, msg);
    return;
  }
  if (res.status === 404) {
    showToast('Tendepay wallet not found.', 'error');
    loadView('tendepay-wallets');
    return;
  }
  showToast('Error: ' + msg, 'error');
}
