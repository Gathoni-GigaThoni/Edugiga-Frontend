// ==================== ASSET CATEGORIES ====================
// BE/FE Contract Addendum 2026-08-17 §5.1. Master data driving the Fixed
// Asset register's Phase 3 refactor (category_id replaces the old free-text
// asset_class). Built against the live /api/asset-categories/ endpoints
// (confirmed via openapi.json) — path param is category_id, list takes an
// include_inactive query flag.

const _AC_API = `${API_BASE}/asset-categories/`;
let _acCategories = [];
let _acCategoriesLoaded = false;

async function _acLoadCategories(force = false) {
  if (_acCategoriesLoaded && !force) return _acCategories;
  const res = await apiFetch(`${_AC_API}?include_inactive=true`);
  _acCategories = (res && res.ok) ? _toArray(await res.json()) : [];
  _acCategoriesLoaded = true;
  return _acCategories;
}
function _acCategoryName(id) {
  const c = _acCategories.find(c => String(c.id) === String(id));
  return c ? c.name : '—';
}
function _acCategoryOptions(sel) {
  return _acCategories.filter(c => c.is_active).map(c =>
    `<option value="${c.id}" ${String(sel) === String(c.id) ? 'selected' : ''}>${_finEsc(c.code)} — ${_finEsc(c.name)}</option>`).join('');
}

async function loadAssetCategoriesView(container) {
  await _pvLoadLookups();
  await _acLoadCategories(true);
  await renderSplitView({
    container,
    moduleKey: 'asset_management.categories',
    title: 'Asset Categories',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Assets',view:'assets-categories'},
      {label:'Categories'}
    ],
    apiUrl: `${_AC_API}?include_inactive=true`,
    searchFields: ['code','name'],
    col1Label: 'Code', col2Label: 'Name',
    col1: c => c.code,
    col2: c => c.name,
    rowLabel: c => c.code,
    rowSub: c => c.name,
    idKey: 'id',
    detailFields: [
      {label:'Code', key:'code'},
      {label:'Name', key:'name'},
      {label:'Cost Subtype', key:'cost_subtype'},
      {label:'Depreciates', key:'depreciates', fmt:v=>v?'Yes':'No'},
      {label:'Useful Life (years)', key:'useful_life_years_default', hideWhen: c=>!c.depreciates, fmt:v=>v??'—'},
      {label:'Salvage Percent', key:'salvage_percent_default', hideWhen: c=>!c.depreciates, fmt:v=>`${v}%`},
      {label:'Depreciation Method', key:'depreciation_method_default', hideWhen: c=>!c.depreciates, fmt:v=>v||'—'},
      {label:'Reducing Balance Rate', key:'reducing_balance_rate_default', hideWhen: c=>!c.depreciates||c.depreciation_method_default!=='reducing_balance', fmt:v=>v!=null?`${v}%`:'—'},
      {label:'Cost Account', key:'cost_account_id', fmt:v=>_pvAccountName(v)},
      {label:'Accumulated Depreciation Account', key:'accumulated_depreciation_account_id', hideWhen: c=>!c.depreciates, fmt:v=>v?_pvAccountName(v):'—'},
      {label:'Depreciation Expense Account', key:'depreciation_expense_account_id', hideWhen: c=>!c.depreciates, fmt:v=>v?_pvAccountName(v):'—'},
      {label:'Status', key:'is_active', fmt:v=>v?'Active':'Inactive'},
      {label:'Notes', key:'notes', fullWidth: true, fmt:v=>v||'—'},
    ],
    renderAdd: _pvAddPlaceholder('Asset Category', 'assets-categories-add', 'Define a category so fixed assets can be classified against it.'),
    onAdd: () => loadView('assets-categories-add'),
    onEdit: item => { window._acEditId = item.id; loadView('assets-categories-edit'); },
    detailActions: _acDetailActions,
  });
}

function _acDetailActions(cat) {
  return `<button class="fin-btn-cancel" style="background:var(--coral-500,#D94040);color:#fff;" onclick="_acConfirmDelete(${cat.id},'${_finEsc(cat.code)}')">Delete</button>`;
}

async function _acConfirmDelete(id, code) {
  if (!confirm(`Delete category ${code}? This cannot be undone.`)) return;
  const res = await apiFetch(`${_AC_API}${id}`, { method: 'DELETE' });
  if (res && res.status === 204) {
    showToast('Category deleted.', 'success');
    window._splitRemoveItem?.(id);
    return;
  }
  if (!res) return;
  const msg = await parseApiError(res);
  showToast('Error: ' + msg, 'error');
}

// ── Shared form body (Add + Edit) ───────────────────────────────────────
function _acFormHtml(cat) {
  const depreciates = cat ? cat.depreciates : true;
  const method = cat?.depreciation_method_default || 'straight_line';
  return `
    <div class="fin-form-group">
      <label class="fin-form-label">Code <span class="fin-required">*</span></label>
      <input type="text" id="ac-f-code" class="fin-form-input" maxlength="30" value="${_finEsc(cat?.code || '')}" ${cat ? 'disabled' : ''}>
      <span class="fin-field-error" id="ac-f-code-err"></span>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Name <span class="fin-required">*</span></label>
      <input type="text" id="ac-f-name" class="fin-form-input" maxlength="100" value="${_finEsc(cat?.name || '')}">
      <span class="fin-field-error" id="ac-f-name-err"></span>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Cost Subtype <span class="fin-required">*</span></label>
      <select id="ac-f-subtype" class="fin-form-select" onchange="_acRefreshAccountPickers()" ${cat ? 'disabled' : ''}>
        <option value="">Please Select</option>
        ${ACCOUNT_SUBTYPES_NON_CURRENT_ASSET.map(s => `<option value="${s}" ${cat?.cost_subtype === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <span class="fin-field-error" id="ac-f-subtype-err"></span>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label"><input type="checkbox" id="ac-f-depreciates" ${depreciates ? 'checked' : ''} onchange="_acDepreciatesChanged()"> Depreciates</label>
      <span style="font-size:11px;color:var(--grey-500,#888);display:block;">Uncheck for Land categories.</span>
    </div>
    <div id="ac-f-depr-fields" style="${depreciates ? '' : 'display:none;'}">
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Useful Life (years) <span class="fin-required">*</span></label>
          <input type="number" id="ac-f-life" class="fin-form-input" min="1" step="1" value="${cat?.useful_life_years_default ?? ''}">
          <span class="fin-field-error" id="ac-f-life-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Salvage Percent</label>
          <input type="number" id="ac-f-salvage" class="fin-form-input" min="0" max="99.99" step="0.01" value="${cat?.salvage_percent_default ?? '5.00'}">
          <span class="fin-field-error" id="ac-f-salvage-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Depreciation Method</label>
          <select id="ac-f-method" class="fin-form-select" onchange="_acMethodChanged()">
            <option value="straight_line" ${method === 'straight_line' ? 'selected' : ''}>Straight Line</option>
            <option value="reducing_balance" ${method === 'reducing_balance' ? 'selected' : ''}>Reducing Balance</option>
          </select>
        </div>
        <div class="fin-form-group" id="ac-f-rbr-wrap" style="${method === 'reducing_balance' ? '' : 'display:none;'}">
          <label class="fin-form-label">Reducing Balance Rate (%)</label>
          <input type="number" id="ac-f-rbr" class="fin-form-input" min="0.01" step="0.01" value="${cat?.reducing_balance_rate_default ?? ''}">
          <span class="fin-field-error" id="ac-f-rbr-err"></span>
        </div>
      </div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Cost Account <span class="fin-required">*</span></label>
      <select id="ac-f-cost-acct" class="fin-form-select" ${cat?.cost_subtype ? '' : 'disabled'}><option value="">${cat?.cost_subtype ? 'Please Select' : 'Select Cost Subtype first'}</option></select>
      <span class="fin-field-error" id="ac-f-cost-acct-err"></span>
    </div>
    <div id="ac-f-accum-exp-fields" style="${depreciates ? '' : 'display:none;'}">
      <div class="fin-form-group">
        <label class="fin-form-label">Accumulated Depreciation Account <span class="fin-required">*</span></label>
        <select id="ac-f-accum-acct" class="fin-form-select" ${cat?.cost_subtype ? '' : 'disabled'}><option value="">${cat?.cost_subtype ? 'Please Select' : 'Select Cost Subtype first'}</option></select>
        <span class="fin-field-error" id="ac-f-accum-acct-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Depreciation Expense Account <span class="fin-required">*</span></label>
        <select id="ac-f-exp-acct" class="fin-form-select"><option value="">Loading&#8230;</option></select>
        <span class="fin-field-error" id="ac-f-exp-acct-err"></span>
      </div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Notes</label>
      <textarea id="ac-f-notes" class="fin-form-textarea" rows="3" maxlength="500">${_finEsc(cat?.notes || '')}</textarea>
    </div>`;
}

function _acDepreciatesChanged() {
  const on = document.getElementById('ac-f-depreciates').checked;
  document.getElementById('ac-f-depr-fields').style.display = on ? '' : 'none';
  document.getElementById('ac-f-accum-exp-fields').style.display = on ? '' : 'none';
}
function _acMethodChanged() {
  const on = document.getElementById('ac-f-method').value === 'reducing_balance';
  document.getElementById('ac-f-rbr-wrap').style.display = on ? '' : 'none';
}
async function _acRefreshAccountPickers(preselect) {
  const subtype = document.getElementById('ac-f-subtype').value;
  const costSel = document.getElementById('ac-f-cost-acct');
  const accumSel = document.getElementById('ac-f-accum-acct');
  const expSel = document.getElementById('ac-f-exp-acct');
  if (!subtype) {
    if (costSel) { costSel.innerHTML = '<option value="">Select Cost Subtype first</option>'; costSel.disabled = true; }
    if (accumSel) { accumSel.innerHTML = '<option value="">Select Cost Subtype first</option>'; accumSel.disabled = true; }
    return;
  }
  const allRows = await loadLookupList(`${API_BASE}/accounts/?account_type=Asset&account_subtype=${encodeURIComponent(subtype)}&is_active=true`, 'asset-accounts');
  // Cost / accumulated-depreciation / depreciation-expense accounts are all
  // JE line targets — the depreciation run posts against them — so header
  // accounts are dropped (2026-09-01 §2.2). A category already saved against
  // one stays visible so its picker doesn't render blank.
  const postable = (list, sel) => list.filter(a => a.is_postable !== false || String(a.id) === String(sel));
  const rows = postable(allRows, preselect?.cost);
  const opts = `<option value="">Please Select</option>` + rows.map(a => `<option value="${a.id}" ${preselect?.cost === a.id ? 'selected' : ''}>${_finEsc(a.number ? a.number + ' - ' : '')}${_finEsc(a.account_name)}</option>`).join('');
  if (costSel) { costSel.innerHTML = opts; costSel.disabled = false; if (preselect?.cost) costSel.value = preselect.cost; }
  if (accumSel) {
    accumSel.innerHTML = `<option value="">Please Select</option>` + postable(allRows, preselect?.accum).map(a => `<option value="${a.id}" ${preselect?.accum === a.id ? 'selected' : ''}>${_finEsc(a.number ? a.number + ' - ' : '')}${_finEsc(a.account_name)}</option>`).join('');
    accumSel.disabled = false;
    if (preselect?.accum) accumSel.value = preselect.accum;
  }
  if (expSel && !expSel.dataset.loaded) {
    const expRows = postable(await loadLookupList(`${API_BASE}/accounts/?account_type=Expense&account_subtype=${encodeURIComponent('Depreciation')}&is_active=true`, 'accounts'), preselect?.exp);
    expSel.innerHTML = `<option value="">Please Select</option>` + expRows.map(a => `<option value="${a.id}" ${preselect?.exp === a.id ? 'selected' : ''}>${_finEsc(a.number ? a.number + ' - ' : '')}${_finEsc(a.account_name)}</option>`).join('');
    expSel.dataset.loaded = '1';
    if (preselect?.exp) expSel.value = preselect.exp;
  }
}

function _acValidate(isEdit) {
  let valid = true;
  const setErr = (id, msg) => { const e = document.getElementById(id); if (e) e.textContent = msg || ''; };
  ['ac-f-code-err','ac-f-name-err','ac-f-subtype-err','ac-f-life-err','ac-f-salvage-err','ac-f-rbr-err','ac-f-cost-acct-err','ac-f-accum-acct-err','ac-f-exp-acct-err'].forEach(id => setErr(id, ''));
  if (!isEdit) {
    const code = document.getElementById('ac-f-code').value.trim();
    if (!code) { setErr('ac-f-code-err', 'This field is required.'); valid = false; }
    const subtype = document.getElementById('ac-f-subtype').value;
    if (!subtype) { setErr('ac-f-subtype-err', 'This field is required.'); valid = false; }
  }
  const name = document.getElementById('ac-f-name').value.trim();
  if (!name) { setErr('ac-f-name-err', 'This field is required.'); valid = false; }
  const depreciates = document.getElementById('ac-f-depreciates').checked;
  if (depreciates) {
    const life = parseInt(document.getElementById('ac-f-life').value, 10);
    if (!(life > 0)) { setErr('ac-f-life-err', 'Must be greater than 0.'); valid = false; }
    const salvage = parseFloat(document.getElementById('ac-f-salvage').value);
    if (!(salvage >= 0 && salvage < 100)) { setErr('ac-f-salvage-err', 'Must be between 0 and 99.99.'); valid = false; }
    const method = document.getElementById('ac-f-method').value;
    if (method === 'reducing_balance') {
      const rbr = parseFloat(document.getElementById('ac-f-rbr').value);
      if (!(rbr > 0)) { setErr('ac-f-rbr-err', 'Must be greater than 0.'); valid = false; }
    }
    if (!document.getElementById('ac-f-accum-acct').value) { setErr('ac-f-accum-acct-err', 'This field is required.'); valid = false; }
    if (!document.getElementById('ac-f-exp-acct').value) { setErr('ac-f-exp-acct-err', 'This field is required.'); valid = false; }
  }
  if (!document.getElementById('ac-f-cost-acct').value) { setErr('ac-f-cost-acct-err', 'This field is required.'); valid = false; }
  return valid;
}

async function loadAssetCategoriesAddView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Asset Category</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Assets &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('assets-categories');return false;">Categories</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        ${_acFormHtml(null)}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_acSubmitAdd()">Save</button>
          <button class="fin-btn-cancel" onclick="loadView('assets-categories')">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function _acSubmitAdd() {
  if (!_acValidate(false)) return;
  const depreciates = document.getElementById('ac-f-depreciates').checked;
  const payload = {
    code: document.getElementById('ac-f-code').value.trim(),
    name: document.getElementById('ac-f-name').value.trim(),
    cost_subtype: document.getElementById('ac-f-subtype').value,
    depreciates,
    cost_account_id: parseInt(document.getElementById('ac-f-cost-acct').value, 10),
    notes: document.getElementById('ac-f-notes').value.trim() || null,
  };
  if (depreciates) {
    payload.useful_life_years_default = parseInt(document.getElementById('ac-f-life').value, 10);
    payload.salvage_percent_default = document.getElementById('ac-f-salvage').value;
    payload.depreciation_method_default = document.getElementById('ac-f-method').value;
    if (document.getElementById('ac-f-method').value === 'reducing_balance') {
      payload.reducing_balance_rate_default = document.getElementById('ac-f-rbr').value;
    }
    payload.accumulated_depreciation_account_id = parseInt(document.getElementById('ac-f-accum-acct').value, 10);
    payload.depreciation_expense_account_id = parseInt(document.getElementById('ac-f-exp-acct').value, 10);
  }
  const res = await apiFetch(_AC_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Asset category created.', 'success'); await _acLoadCategories(true); loadView('assets-categories'); return; }
  if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

async function loadAssetCategoriesEditView(container) {
  await _pvLoadLookups();
  const id = window._acEditId;
  await _acLoadCategories(true);
  const cat = _acCategories.find(c => String(c.id) === String(id));
  if (!cat) { showToast('Could not load category.', 'error'); loadView('assets-categories'); return; }
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Asset Category</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Assets &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('assets-categories');return false;">Categories</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap">
        <div style="font-size:11px;color:var(--grey-500,#888);margin-bottom:8px;">Changes here apply to new assets only. Existing assets keep their captured values.</div>
        ${_acFormHtml(cat)}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_acSubmitEdit(${cat.id})">Update</button>
          <button class="fin-btn-cancel" onclick="loadView('assets-categories')">Cancel</button>
        </div>
      </div>
    </div>`;
  await _acRefreshAccountPickers({ cost: cat.cost_account_id, accum: cat.accumulated_depreciation_account_id, exp: cat.depreciation_expense_account_id });
  document.getElementById('ac-f-subtype').value = cat.cost_subtype;
}
async function _acSubmitEdit(id) {
  if (!_acValidate(true)) return;
  const depreciates = document.getElementById('ac-f-depreciates').checked;
  const payload = {
    name: document.getElementById('ac-f-name').value.trim(),
    depreciates,
    cost_account_id: parseInt(document.getElementById('ac-f-cost-acct').value, 10),
    notes: document.getElementById('ac-f-notes').value.trim() || null,
  };
  if (depreciates) {
    payload.useful_life_years_default = parseInt(document.getElementById('ac-f-life').value, 10);
    payload.salvage_percent_default = document.getElementById('ac-f-salvage').value;
    payload.depreciation_method_default = document.getElementById('ac-f-method').value;
    if (document.getElementById('ac-f-method').value === 'reducing_balance') {
      payload.reducing_balance_rate_default = document.getElementById('ac-f-rbr').value;
    }
    payload.accumulated_depreciation_account_id = parseInt(document.getElementById('ac-f-accum-acct').value, 10);
    payload.depreciation_expense_account_id = parseInt(document.getElementById('ac-f-exp-acct').value, 10);
  }
  const res = await apiFetch(`${_AC_API}${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Asset category updated.', 'success'); await _acLoadCategories(true); loadView('assets-categories'); return; }
  if (res && res.status === 409) { showToast('Error: ' + await parseApiError(res), 'error'); return; }
  if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
