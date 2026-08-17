// ==================== FIXED ASSET REGISTER — PHASE 3 ====================
// BE/FE Contract Addendum 2026-08-17 §5.2/§5.3. Refactor of the 2026-07-21
// register around the AssetCategory master (js/asset-categories.js):
// category_id replaces the old free-text asset_class, and cost/accum-dep/
// depreciation-expense accounts now come from the category, not the asset
// itself — FixedAssetCreate/Update no longer carry those account fields at
// all (confirmed via openapi.json).
//
// Status is a 3-value lifecycle (draft|confirmed|rejected) — there is no
// "disposed" status. Disposal is layered on top via a separate is_disposed
// boolean + disposal_date/disposal_amount/disposal_journal_entry_id, exactly
// as it worked pre-Phase-3. Live/Pending Confirmation/Archived tabs are
// therefore: Live = status=confirmed & !is_disposed, Pending = status=draft,
// Archived = status=rejected OR is_disposed=true.
const _FA_API = `${API_BASE}/fixed-assets`;
function _faMoney(v) { return formatKES(v); }

const _FA_TABS = [
  { key: 'live', label: 'Live' },
  { key: 'pending', label: 'Pending Confirmation' },
  { key: 'archived', label: 'Archived' },
  { key: 'reconciliation', label: 'Reconciliation' },
];
let _faTab = 'live';
let _faCategoryFilter = '';

function _faStatusBadge(item) {
  if (item.is_disposed) return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#fff;background:var(--coral-500,#D94040);text-decoration:line-through;">Disposed</span>`;
  if (item.status === 'draft') return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#8a6d00;background:#f5e6a8;">Draft — awaiting confirmation</span>`;
  if (item.status === 'rejected') return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#666;background:#eee;text-decoration:line-through;">Rejected</span>`;
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#fff;background:var(--navy-700,#1B3057);">Confirmed</span>`;
}
function _faMethodBadge(item) {
  if (!item.depreciation_method) return '';
  const label = item.depreciation_method === 'reducing_balance' ? 'RB' : 'SL';
  return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700;color:#555;background:#eee;margin-left:6px;" title="${_finEsc(item.depreciation_method)}">${label}</span>`;
}

async function loadFixedAssetsView(container) {
  await _pvLoadLookups();
  await _acLoadCategories();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Fixed Assets</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Assets &rsaquo; Fixed Asset Register</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        ${_FA_TABS.map(t => `<button class="${_faTab===t.key?'fin-btn-teal':'fin-btn-outline'}" onclick="_faSwitchTab('${t.key}')">${t.label}</button>`).join('')}
      </div>
      <div id="fa-tab-container"></div>
    </div>`;
  await _faRenderTab();
}

async function _faSwitchTab(tab) {
  _faTab = tab;
  await loadFixedAssetsView(document.getElementById('main-content'));
}

async function _faRenderTab() {
  const sub = document.getElementById('fa-tab-container');
  if (!sub) return;
  if (_faTab === 'reconciliation') {
    await _faRenderReconciliationTab(sub);
  } else if (_faTab === 'archived') {
    await _faRenderArchivedTab(sub);
  } else {
    await _faRenderRegisterSplitView(sub);
  }
}

// ── Live / Pending — renderSplitView with tab-scoped query ─────────────────
async function _faRenderRegisterSplitView(container) {
  const filterRow = document.createElement('div');
  filterRow.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:10px;';
  filterRow.innerHTML = `
    <select id="fa-filter-category" class="fin-form-select" style="max-width:260px;">
      <option value="">All Categories</option>
      ${_acCategories.map(c => `<option value="${c.id}" ${String(_faCategoryFilter)===String(c.id)?'selected':''}>${_finEsc(c.code)} — ${_finEsc(c.name)}</option>`).join('')}
    </select>
    ${_faTab === 'live' ? `<button class="fin-btn-outline" onclick="_faOpenDepreciationRunModal()">Run monthly depreciation</button>
      <button class="fin-btn-outline" onclick="_faOpenBulkFromLineModal()">+ Bulk Create from Invoice Line</button>` : ''}
  `;
  container.innerHTML = '';
  container.appendChild(filterRow);
  const listWrap = document.createElement('div');
  container.appendChild(listWrap);
  filterRow.querySelector('#fa-filter-category').addEventListener('change', (e) => {
    _faCategoryFilter = e.target.value;
    _faRenderTab();
  });

  const params = new URLSearchParams();
  if (_faTab === 'live') { params.set('status', 'confirmed'); params.set('is_disposed', 'false'); }
  else if (_faTab === 'pending') { params.set('status', 'draft'); }
  if (_faCategoryFilter) params.set('category_id', _faCategoryFilter);

  const cfg = {
    container: listWrap,
    moduleKey: 'asset_management.fixed_assets',
    title: 'Fixed Assets',
    breadcrumb: [],
    apiUrl: `${_FA_API}/?${params.toString()}`,
    searchFields: ['asset_tag', 'description'],
    col1Label: 'Asset Tag', col2Label: 'Category / NBV',
    col1: a => `<strong>${_finEsc(a.asset_tag || '—')}</strong>${_faMethodBadge(a)}`,
    col2: a => `${_finEsc(_acCategoryName(a.category_id))} · ${_faMoney(a.net_book_value ?? a.acquisition_cost)}`,
    rowLabel: a => a.asset_tag || '—',
    rowSub: a => _acCategoryName(a.category_id),
    idKey: 'id',
    detailFields: _faDetailFields(),
    renderAdd: _faTab === 'live' ? el => _faRenderAddForm(el) : el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#128196;</div>
        <p style="font-size:13px;">Drafts are auto-created from approved supplier invoices, or bulk-created from an eligible invoice line on the Live tab.</p>
      </div>`;
    },
    renderEdit: (item, el) => _faRenderEditForm(item, el),
    canEdit: item => _faTab === 'live' && item.status === 'confirmed' && !item.is_disposed,
    detailActions: _faDetailActions,
  };
  await renderSplitView(cfg);
}

// ── Archived (rejected OR disposed) — no single query param covers the OR,
// so this fetches both and renders a lightweight list+detail view sharing
// the same visual language and detail-field/action renderers as the
// renderSplitView tabs, without needing renderSplitView's single-apiUrl
// fetch step. ─────────────────────────────────────────────────────────────
let _faArchivedItems = [];
let _faArchivedSelected = null;
async function _faRenderArchivedTab(container) {
  container.innerHTML = `<p style="color:#888;padding:12px 0;">Loading&#8230;</p>`;
  const catParam = _faCategoryFilter ? `&category_id=${_faCategoryFilter}` : '';
  const [rejRes, dispRes] = await Promise.all([
    apiFetch(`${_FA_API}/?status=rejected${catParam}`),
    apiFetch(`${_FA_API}/?status=confirmed&is_disposed=true${catParam}`),
  ]);
  const rejected = (rejRes && rejRes.ok) ? _toArray(await rejRes.json()) : [];
  const disposed = (dispRes && dispRes.ok) ? _toArray(await dispRes.json()) : [];
  _faArchivedItems = [...rejected, ...disposed];
  _faArchivedSelected = null;

  container.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">
      <select id="fa-filter-category" class="fin-form-select" style="max-width:260px;">
        <option value="">All Categories</option>
        ${_acCategories.map(c => `<option value="${c.id}" ${String(_faCategoryFilter)===String(c.id)?'selected':''}>${_finEsc(c.code)} — ${_finEsc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="split-layout">
      <div class="split-left">
        <div class="split-left-header"><span class="split-left-title">Archived</span><span class="split-left-count">${_faArchivedItems.length}</span></div>
        <div class="split-left-col-headers"><span>Asset Tag</span><span>Status</span></div>
        <div class="split-list" id="fa-archived-list"></div>
      </div>
      <div class="split-right"><div class="split-right-add" id="fa-archived-detail"></div></div>
    </div>`;
  document.getElementById('fa-filter-category').addEventListener('change', (e) => {
    _faCategoryFilter = e.target.value;
    _faRenderArchivedTab(container);
  });
  _faRenderArchivedList();
}
function _faRenderArchivedList() {
  const listEl = document.getElementById('fa-archived-list');
  if (!listEl) return;
  listEl.innerHTML = _faArchivedItems.map(item => {
    const isSel = _faArchivedSelected && String(_faArchivedSelected.id) === String(item.id);
    return `<div class="split-list-row${isSel ? ' active' : ''}" data-id="${item.id}">
      <div class="split-col1">${_finEsc(item.asset_tag || '—')}</div>
      <div class="split-col2">${item.is_disposed ? 'Disposed' : 'Rejected'}</div>
    </div>`;
  }).join('') || `<p style="padding:24px;text-align:center;color:var(--grey-400);font-style:italic;font-size:13px">No records found</p>`;
  listEl.onclick = (e) => {
    const row = e.target.closest('.split-list-row');
    if (!row) return;
    _faArchivedSelected = _faArchivedItems.find(i => String(i.id) === row.dataset.id) || null;
    _faRenderArchivedList();
    _faRenderArchivedDetail();
  };
}
function _faRenderArchivedDetail() {
  const el = document.getElementById('fa-archived-detail');
  if (!el) return;
  if (!_faArchivedSelected) { el.innerHTML = ''; return; }
  const item = _faArchivedSelected;
  el.className = 'split-right-detail';
  const title = item.asset_tag || '—';
  el.innerHTML = `
    <div class="detail-banner">
      <div class="detail-banner-initials">${title.charAt(0).toUpperCase()}</div>
      <div><div class="detail-banner-name">${_finEsc(title)}</div><div class="detail-banner-sub">${_finEsc(_acCategoryName(item.category_id))}</div></div>
    </div>
    <div class="detail-info-card">
      <div class="detail-fields-grid">${buildDetailFields(item, _faDetailFields())}</div>
    </div>`;
}

function _faDetailFields() {
  return [
    {label:'Asset Tag', key:'asset_tag'},
    {label:'Category', key:'category_id', fmt:v=>_acCategoryName(v)},
    {label:'Status', key:'status', fmt:(v,item)=>_faStatusBadge(item)},
    {label:'Description', key:'description', fmt:v=>v||'—'},
    {label:'Acquisition Date', key:'acquisition_date', fmt:v=>_pvDate(v)},
    {label:'Depreciation Start Date', key:'depreciation_start_date', fmt:v=>_pvDate(v)},
    {label:'Acquisition Cost', key:'acquisition_cost', fmt:v=>_faMoney(v)},
    {label:'Useful Life (years)', key:'useful_life_years', fmt:v=>v??'—'},
    {label:'Salvage Value', key:'salvage_value', fmt:v=>_faMoney(v)},
    {label:'Depreciation Method', key:'depreciation_method', fmt:v=>v||'—'},
    {label:'Reducing Balance Rate', key:'reducing_balance_rate', hideWhen: item=>item.depreciation_method!=='reducing_balance', fmt:v=>v!=null?`${v}%`:'—'},
    {label:'Accumulated Depreciation', key:'accumulated_depreciation', hideWhen: item=>item.accumulated_depreciation==null, fmt:v=>_faMoney(v)},
    {label:'Net Book Value', key:'net_book_value', hideWhen: item=>item.net_book_value==null, fmt:v=>_faMoney(v)},
    {label:'Supplier Invoice Line', key:'supplier_invoice_line_id', hideWhen: item=>!item.supplier_invoice_line_id, fmt:v=>`Line #${v}`},
    {label:'Rejected At', key:'rejected_at', hideWhen: item=>!item.rejected_at, fmt:v=>_pvDate(v)},
    {label:'Rejection Reason', key:'rejection_reason', hideWhen: item=>!item.rejection_reason, fullWidth:true, fmt:v=>`<div style="border-left:3px solid var(--coral-500);background:var(--coral-100);padding:8px 12px;border-radius:4px;color:var(--coral-600);">${_finEsc(v||'—')}</div>`},
    {label:'Disposal Date', key:'disposal_date', hideWhen: item=>!item.is_disposed, fmt:v=>_pvDate(v)},
    {label:'Disposal Amount', key:'disposal_amount', hideWhen: item=>!item.is_disposed, fmt:v=>_faMoney(v)},
    {label:'Disposal JE', key:'disposal_journal_entry_id', hideWhen: item=>!item.is_disposed, fmt:v=>v?`<a href="#" onclick="_jeOpenDetail(${v});return false;">View JE</a>`:'—'},
    {label:'Notes', key:'notes', fmt:v=>v||'—'},
  ];
}

function _faDetailActions(item) {
  window._faPendingAsset = item;
  if (item.status === 'draft') {
    return `
      <button class="fin-btn-teal" onclick="_faOpenConfirmModal(${item.id})">Confirm Asset</button>
      <button class="fin-btn-cancel" style="background:var(--coral-500,#D94040);color:#fff;" onclick="_faOpenRejectModal(${item.id})">Reject</button>`;
  }
  if (item.status === 'confirmed' && !item.is_disposed) {
    return `
      <button class="fin-btn-outline" onclick="_faOpenDisposeModal(${item.id})">Dispose</button>
      <button class="fin-btn-cancel" onclick="_faConfirmDelete(${item.id})">Delete</button>`;
  }
  return '';
}

// ── Add (manual, category-driven — Live tab only) ───────────────────────
let _faEligibleLines = [];
async function _faRenderAddForm(el) {
  const linesRes = await apiFetch(`${_FA_API}/eligible-invoice-lines`);
  _faEligibleLines = (linesRes && linesRes.ok) ? _toArray(await linesRes.json()) : [];
  el.innerHTML = `
    <div style="max-width:520px;">
      <h3 class="split-right-add-title">Add Fixed Asset</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Asset Tag <span class="fin-required">*</span></label>
        <input type="text" id="fa-f-tag" class="fin-form-input" maxlength="50">
        <span class="fin-field-error" id="fa-f-tag-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Category <span class="fin-required">*</span></label>
        <select id="fa-f-category" class="fin-form-select">
          <option value="">Please Select</option>
          ${_acCategoryOptions(null)}
        </select>
        <span class="fin-field-error" id="fa-f-category-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Description <span class="fin-required">*</span></label>
        <input type="text" id="fa-f-desc" class="fin-form-input" maxlength="500">
        <span class="fin-field-error" id="fa-f-desc-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Acquisition Date <span class="fin-required">*</span></label>
        <input type="date" id="fa-f-acq-date" class="fin-form-input">
        <span class="fin-field-error" id="fa-f-acq-date-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Acquisition Cost <span class="fin-required">*</span></label>
        <input type="number" id="fa-f-acq-cost" class="fin-form-input" min="0.01" step="0.01">
        <span class="fin-field-error" id="fa-f-acq-cost-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Supplier Invoice Line</label>
        <select id="fa-f-si-line" class="fin-form-select">
          <option value="">None (not linked to an invoice)</option>
          ${_faEligibleLines.map(l => `<option value="${l.line_id}">${_finEsc(l.invoice_number)} — ${_finEsc(l.description)} (${l.available_slots} slot${l.available_slots===1?'':'s'} left)</option>`).join('')}
        </select>
      </div>
      <details style="margin:12px 0;">
        <summary style="cursor:pointer;font-size:12.5px;color:var(--grey-600,#666);">Override category defaults (optional)</summary>
        <div style="margin-top:10px;">
          <div class="fin-form-group">
            <label class="fin-form-label">Useful Life (years)</label>
            <input type="number" id="fa-f-life" class="fin-form-input" min="1" step="1" placeholder="(category default)">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Salvage Value</label>
            <input type="number" id="fa-f-salvage" class="fin-form-input" min="0" step="0.01" placeholder="(category default)">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Depreciation Method</label>
            <select id="fa-f-method" class="fin-form-select" onchange="_faAddMethodChanged()">
              <option value="">(category default)</option>
              <option value="straight_line">Straight Line</option>
              <option value="reducing_balance">Reducing Balance</option>
            </select>
          </div>
          <div class="fin-form-group" id="fa-f-rbr-wrap" style="display:none;">
            <label class="fin-form-label">Reducing Balance Rate (%)</label>
            <input type="number" id="fa-f-rbr" class="fin-form-input" min="0.01" step="0.01">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Depreciation Start Date</label>
            <input type="date" id="fa-f-depr-start" class="fin-form-input">
          </div>
        </div>
      </details>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="fa-f-notes" class="fin-form-textarea" rows="3"></textarea>
      </div>
      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="fin-btn-teal" onclick="submitFaAdd()">Save</button>
        <button class="fin-btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>`;
}
function _faAddMethodChanged() {
  document.getElementById('fa-f-rbr-wrap').style.display = document.getElementById('fa-f-method').value === 'reducing_balance' ? '' : 'none';
}
async function submitFaAdd() {
  const setErr = (id, msg) => { const e = document.getElementById(id); if (e) e.textContent = msg; };
  ['fa-f-tag-err','fa-f-category-err','fa-f-desc-err','fa-f-acq-date-err','fa-f-acq-cost-err'].forEach(id=>setErr(id,''));
  const tag = document.getElementById('fa-f-tag').value.trim();
  const categoryId = document.getElementById('fa-f-category').value;
  const desc = document.getElementById('fa-f-desc').value.trim();
  const acqDate = document.getElementById('fa-f-acq-date').value;
  const acqCost = document.getElementById('fa-f-acq-cost').value;
  let valid = true;
  if (!tag) { setErr('fa-f-tag-err','This field is required.'); valid = false; }
  if (!categoryId) { setErr('fa-f-category-err','This field is required.'); valid = false; }
  if (!desc) { setErr('fa-f-desc-err','This field is required.'); valid = false; }
  if (!acqDate) { setErr('fa-f-acq-date-err','This field is required.'); valid = false; }
  if (!acqCost || parseFloat(acqCost) <= 0) { setErr('fa-f-acq-cost-err','Must be greater than 0.'); valid = false; }
  if (!valid) return;

  const payload = {
    asset_tag: tag, category_id: parseInt(categoryId, 10),
    description: desc, acquisition_date: acqDate, acquisition_cost: acqCost,
    notes: document.getElementById('fa-f-notes').value.trim() || null,
  };
  const siLine = document.getElementById('fa-f-si-line').value;
  if (siLine) payload.supplier_invoice_line_id = parseInt(siLine, 10);
  const life = document.getElementById('fa-f-life').value;
  if (life) payload.useful_life_years = parseInt(life, 10);
  const salvage = document.getElementById('fa-f-salvage').value;
  if (salvage) payload.salvage_value = salvage;
  const method = document.getElementById('fa-f-method').value;
  if (method) payload.depreciation_method = method;
  const rbr = document.getElementById('fa-f-rbr').value;
  if (method === 'reducing_balance' && rbr) payload.reducing_balance_rate = rbr;
  const deprStart = document.getElementById('fa-f-depr-start').value;
  if (deprStart) payload.depreciation_start_date = deprStart;

  const res = await apiFetch(`${_FA_API}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Fixed asset added.', 'success'); await window._splitReload?.(); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ── Edit (descriptive fields only — PATCH surface is fixed by the backend
// to non-cost fields regardless of depreciation state, §5.2.2) ──────────
function _faRenderEditForm(item, el) {
  el.innerHTML = `
    <div style="max-width:460px;">
      <h3 class="split-right-add-title">Edit ${_finEsc(item.asset_tag||'')}</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Description</label>
        <input type="text" id="fa-e-desc" class="fin-form-input" maxlength="500" value="${_finEsc(item.description||'')}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Useful Life (years)</label>
        <input type="number" id="fa-e-life" class="fin-form-input" min="1" step="1" value="${item.useful_life_years ?? ''}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Salvage Value</label>
        <input type="number" id="fa-e-salvage" class="fin-form-input" min="0" step="0.01" value="${item.salvage_value ?? ''}">
      </div>
      ${item.depreciation_method === 'reducing_balance' ? `
      <div class="fin-form-group">
        <label class="fin-form-label">Reducing Balance Rate (%)</label>
        <input type="number" id="fa-e-rbr" class="fin-form-input" min="0.01" step="0.01" value="${item.reducing_balance_rate ?? ''}">
      </div>` : ''}
      <div class="fin-form-group">
        <label class="fin-form-label">Depreciation Start Date</label>
        <input type="date" id="fa-e-depr-start" class="fin-form-input" value="${item.depreciation_start_date || ''}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="fa-e-notes" class="fin-form-textarea" rows="3">${_finEsc(item.notes||'')}</textarea>
      </div>
      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="fin-btn-teal" onclick="submitFaEdit(${item.id})">Update</button>
        <button class="fin-btn-cancel" onclick="window._splitRefreshSelected?.()">Cancel</button>
      </div>
    </div>`;
}
async function submitFaEdit(id) {
  const payload = {
    description: document.getElementById('fa-e-desc').value.trim() || null,
    notes: document.getElementById('fa-e-notes').value.trim() || null,
  };
  const life = document.getElementById('fa-e-life').value;
  if (life) payload.useful_life_years = parseInt(life, 10);
  const salvage = document.getElementById('fa-e-salvage').value;
  if (salvage) payload.salvage_value = salvage;
  const rbrEl = document.getElementById('fa-e-rbr');
  if (rbrEl && rbrEl.value) payload.reducing_balance_rate = rbrEl.value;
  const deprStart = document.getElementById('fa-e-depr-start').value;
  if (deprStart) payload.depreciation_start_date = deprStart;
  const res = await apiFetch(`${_FA_API}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Fixed asset updated.', 'success'); await window._splitRefreshSelected?.(); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ── Delete ───────────────────────────────────────────────────────────────
async function _faConfirmDelete(id) {
  if (!confirm('Delete this fixed asset? This cannot be undone.')) return;
  const res = await apiFetch(`${_FA_API}/${id}`, { method: 'DELETE' });
  if (res && (res.ok || res.status === 204)) {
    showToast('Fixed asset deleted.', 'success');
    window._splitRemoveItem?.(id);
    return;
  }
  if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ── Confirm Draft (promote-draft) ───────────────────────────────────────
function _faOpenConfirmModal(id) {
  const asset = window._faPendingAsset;
  const wrap = document.createElement('div');
  wrap.id = 'fa-confirm-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:auto;padding:24px;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:520px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Confirm Asset</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Asset Tag</label>
        <input type="text" id="fac-f-tag" class="fin-form-input" value="${_finEsc(asset.asset_tag||'')}" maxlength="50">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Description</label>
        <input type="text" id="fac-f-desc" class="fin-form-input" value="${_finEsc(asset.description||'')}" maxlength="500">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Category</label>
        <select id="fac-f-category" class="fin-form-select">${_acCategoryOptions(asset.category_id)}</select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Depreciation Start Date</label>
        <input type="date" id="fac-f-depr-start" class="fin-form-input" value="${asset.depreciation_start_date || asset.acquisition_date || ''}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Useful Life (years)</label>
        <input type="number" id="fac-f-life" class="fin-form-input" min="1" step="1" value="${asset.useful_life_years ?? ''}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Salvage Value</label>
        <input type="number" id="fac-f-salvage" class="fin-form-input" min="0" step="0.01" value="${asset.salvage_value ?? ''}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Depreciation Method</label>
        <select id="fac-f-method" class="fin-form-select" onchange="document.getElementById('fac-f-rbr-wrap').style.display=this.value==='reducing_balance'?'':'none';">
          <option value="" ${!asset.depreciation_method?'selected':''}>(category default)</option>
          <option value="straight_line" ${asset.depreciation_method==='straight_line'?'selected':''}>Straight Line</option>
          <option value="reducing_balance" ${asset.depreciation_method==='reducing_balance'?'selected':''}>Reducing Balance</option>
        </select>
      </div>
      <div class="fin-form-group" id="fac-f-rbr-wrap" style="${asset.depreciation_method==='reducing_balance'?'':'display:none;'}">
        <label class="fin-form-label">Reducing Balance Rate (%)</label>
        <input type="number" id="fac-f-rbr" class="fin-form-input" min="0.01" step="0.01" value="${asset.reducing_balance_rate ?? ''}">
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('fa-confirm-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_faSubmitConfirm(${id})">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _faSubmitConfirm(id) {
  const payload = {
    asset_tag: document.getElementById('fac-f-tag').value.trim() || null,
    description: document.getElementById('fac-f-desc').value.trim() || null,
    category_id: document.getElementById('fac-f-category').value ? parseInt(document.getElementById('fac-f-category').value, 10) : null,
    depreciation_start_date: document.getElementById('fac-f-depr-start').value || null,
  };
  const life = document.getElementById('fac-f-life').value;
  if (life) payload.useful_life_years = parseInt(life, 10);
  const salvage = document.getElementById('fac-f-salvage').value;
  if (salvage) payload.salvage_value = salvage;
  const method = document.getElementById('fac-f-method').value;
  if (method) payload.depreciation_method = method;
  const rbr = document.getElementById('fac-f-rbr').value;
  if (method === 'reducing_balance' && rbr) payload.reducing_balance_rate = rbr;
  const res = await apiFetch(`${_FA_API}/${id}/promote-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    _coaCloseModal('fa-confirm-modal-overlay');
    showToast('Asset confirmed — now live in the register.', 'success');
    _faTab = 'live';
    await loadFixedAssetsView(document.getElementById('main-content'));
    return;
  }
  if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ── Reject Draft ─────────────────────────────────────────────────────────
function _faOpenRejectModal(id) {
  const wrap = document.createElement('div');
  wrap.id = 'fa-reject-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:460px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Reject Draft Asset</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
        <textarea id="far-f-reason" class="fin-form-textarea" rows="3" maxlength="500" oninput="document.getElementById('far-f-count').textContent=this.value.length"></textarea>
        <span style="font-size:11px;color:var(--grey-500,#888);"><span id="far-f-count">0</span>/500</span>
        <span class="fin-field-error" id="far-f-reason-err"></span>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('fa-reject-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" style="background:var(--coral-500,#D94040);" onclick="_faSubmitReject(${id})">Reject</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _faSubmitReject(id) {
  const reason = document.getElementById('far-f-reason').value.trim();
  if (reason.length < 3) { document.getElementById('far-f-reason-err').textContent = 'Reason must be at least 3 characters.'; return; }
  const res = await apiFetch(`${_FA_API}/${id}/reject-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
  if (res && res.ok) {
    _coaCloseModal('fa-reject-modal-overlay');
    showToast('Draft rejected.', 'success');
    await window._splitReload?.();
    return;
  }
  if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ── Bulk-from-line ───────────────────────────────────────────────────────
async function _faOpenBulkFromLineModal() {
  const linesRes = await apiFetch(`${_FA_API}/eligible-invoice-lines`);
  const lines = (linesRes && linesRes.ok) ? _toArray(await linesRes.json()) : [];
  const wrap = document.createElement('div');
  wrap.id = 'fa-bulk-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:auto;padding:24px;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:560px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Bulk Create Assets from Invoice Line</h3>
      ${lines.length === 0 ? `<p style="color:var(--grey-600,#666);">No eligible invoice lines with remaining slots.</p>` : `
      <div class="fin-form-group">
        <label class="fin-form-label">Invoice Line <span class="fin-required">*</span></label>
        <select id="fab-f-line" class="fin-form-select" onchange="_faBulkLineChanged()">
          <option value="">Please Select</option>
          ${lines.map(l => `<option value="${l.line_id}" data-slots="${l.available_slots}" data-desc="${_finEsc(l.description)}" data-cost="${l.unit_price}">${_finEsc(l.invoice_number)} — ${_finEsc(l.description)} (${l.available_slots} slot${l.available_slots===1?'':'s'} left, ${_faMoney(l.unit_price)}/unit)</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Category <span class="fin-required">*</span></label>
        <select id="fab-f-category" class="fin-form-select">
          <option value="">Please Select</option>
          ${_acCategoryOptions(null)}
        </select>
      </div>
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Count <span class="fin-required">*</span></label>
          <input type="number" id="fab-f-count" class="fin-form-input" min="1" step="1" value="1">
          <span style="font-size:11px;color:var(--grey-500,#888);" id="fab-f-slots-hint"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Asset Tag Prefix <span class="fin-required">*</span></label>
          <input type="text" id="fab-f-prefix" class="fin-form-input" maxlength="40" placeholder="e.g. CHAIR-">
        </div>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Description</label>
        <input type="text" id="fab-f-desc" class="fin-form-input" maxlength="500" placeholder="(from invoice line)">
      </div>
      <div id="fab-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('fa-bulk-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_faSubmitBulkFromLine()">Create</button>
      </div>`}
    </div>`;
  document.body.appendChild(wrap);
}
function _faBulkLineChanged() {
  const sel = document.getElementById('fab-f-line');
  const opt = sel.options[sel.selectedIndex];
  const slots = opt ? parseInt(opt.dataset.slots || '0', 10) : 0;
  document.getElementById('fab-f-count').max = slots;
  document.getElementById('fab-f-count').value = Math.min(slots, parseInt(document.getElementById('fab-f-count').value || '1', 10)) || 1;
  document.getElementById('fab-f-slots-hint').textContent = `Max ${slots} slot${slots===1?'':'s'} available on this line.`;
  if (opt && opt.dataset.desc) document.getElementById('fab-f-desc').value = opt.dataset.desc;
}
async function _faSubmitBulkFromLine() {
  const lineId = document.getElementById('fab-f-line').value;
  const categoryId = document.getElementById('fab-f-category').value;
  const count = parseInt(document.getElementById('fab-f-count').value, 10);
  const prefix = document.getElementById('fab-f-prefix').value.trim();
  const msgEl = document.getElementById('fab-msg');
  msgEl.innerHTML = '';
  if (!lineId || !categoryId || !count || count < 1 || !prefix) {
    msgEl.innerHTML = `<div style="margin-top:8px;padding:8px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;">Invoice Line, Category, Count and Asset Tag Prefix are all required.</div>`;
    return;
  }
  const payload = {
    supplier_invoice_line_id: parseInt(lineId, 10),
    category_id: parseInt(categoryId, 10),
    quantity: count,
    asset_tag_prefix: prefix,
    description: document.getElementById('fab-f-desc').value.trim() || null,
  };
  const res = await apiFetch(`${_FA_API}/bulk-from-line`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    const created = await res.json();
    _coaCloseModal('fa-bulk-modal-overlay');
    showToast(`${(created || []).length} asset(s) created.`, 'success');
    _faTab = 'live';
    await loadFixedAssetsView(document.getElementById('main-content'));
    return;
  }
  if (res) msgEl.innerHTML = `<div style="margin-top:8px;padding:8px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;">${_finEsc(await parseApiError(res))}</div>`;
}

// ── Dispose ──────────────────────────────────────────────────────────────
function _faOpenDisposeModal(id) {
  const asset = window._faPendingAsset;
  const wrap = document.createElement('div');
  wrap.id = 'fa-dispose-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:440px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 8px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Dispose Fixed Asset</h3>
      <div style="padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-bottom:14px;">
        Disposing posts a balanced journal entry writing off cost against accumulated depreciation and recognising the proceeds. This cannot be undone from here.
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Disposal Date <span class="fin-required">*</span></label>
        <input type="date" id="fa-disp-date" class="fin-form-input">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Disposal Amount <span class="fin-required">*</span></label>
        <input type="number" id="fa-disp-amount" class="fin-form-input" min="0" step="0.01" value="0" oninput="document.getElementById('fa-disp-cash-wrap').style.display=parseFloat(this.value)>0?'':'none';">
        <span style="font-size:12px;color:var(--grey-600)">Enter 0 for scrap or write-off.</span>
      </div>
      <div class="fin-form-group" id="fa-disp-cash-wrap" style="display:none;">
        <label class="fin-form-label">Cash / Bank Account <span class="fin-required">*</span></label>
        <select id="fa-disp-cash" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions()}</select>
        <span style="font-size:12px;color:var(--grey-600)">Required when proceeds are greater than 0 — where the sale proceeds landed.</span>
      </div>
      <div id="fa-disp-error" style="display:none;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.82rem;margin-top:6px;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('fa-dispose-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_faSubmitDispose(${id})">Dispose</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _faSubmitDispose(id) {
  const date = document.getElementById('fa-disp-date').value;
  const amount = document.getElementById('fa-disp-amount').value;
  const errEl = document.getElementById('fa-disp-error');
  errEl.style.display = 'none';
  const asset = window._faPendingAsset;
  if (!date) { errEl.textContent = 'Disposal date is required.'; errEl.style.display = 'block'; return; }
  if (asset?.acquisition_date && date < asset.acquisition_date) {
    errEl.textContent = 'Disposal date must be on or after the acquisition date.';
    errEl.style.display = 'block';
    return;
  }
  if (amount === '' || parseFloat(amount) < 0) { errEl.textContent = 'Disposal amount must be 0 or more.'; errEl.style.display = 'block'; return; }
  const payload = { disposal_date: date, disposal_amount: amount };
  if (parseFloat(amount) > 0) {
    const cashAcct = document.getElementById('fa-disp-cash').value;
    if (!cashAcct) { errEl.textContent = 'Cash / Bank Account is required when proceeds are greater than 0.'; errEl.style.display = 'block'; return; }
    payload.cash_account_id = parseInt(cashAcct, 10);
  }
  const res = await apiFetch(`${_FA_API}/${id}/dispose`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res && res.ok) {
    _coaCloseModal('fa-dispose-modal-overlay');
    showToast('Fixed asset disposed.', 'success');
    await window._splitReload?.();
  } else if (res) {
    errEl.textContent = await parseApiError(res);
    errEl.style.display = 'block';
  }
}

// ── Run monthly depreciation (idempotent per asset+period) ──────────────
function _faOpenDepreciationRunModal() {
  const wrap = document.createElement('div');
  wrap.id = 'fa-depr-run-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  const today = new Date().toISOString().slice(0,10);
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:640px;max-width:95vw;max-height:85vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 8px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Run Monthly Depreciation</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">As-of Date</label>
        <input type="date" id="fa-depr-asof" class="fin-form-input" value="${today}">
        <span style="font-size:12px;color:var(--grey-600)">The month containing this date is posted for every confirmed asset. Already-posted months are skipped safely.</span>
      </div>
      <div id="fa-depr-result"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-teal" id="fa-depr-run-btn" onclick="_faSubmitDepreciationRun()">Run depreciation</button>
        <button class="fin-btn-cancel" onclick="_coaCloseModal('fa-depr-run-modal-overlay')">Done</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
function _faPostingIsPosted(p) { return p.status === 'posted' || p.posted === true; }

async function _faSubmitDepreciationRun() {
  const asOfDate = document.getElementById('fa-depr-asof').value;
  const resultEl = document.getElementById('fa-depr-result');
  const btn = document.getElementById('fa-depr-run-btn');
  if (btn) btn.disabled = true;
  const res = await apiFetch(`${_FA_API}/run-depreciation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ as_of_date: asOfDate })
  });
  if (btn) btn.disabled = false;
  if (res && res.status === 424) {
    resultEl.innerHTML = `<div style="padding:10px 12px;border-radius:6px;background:var(--gold-100);color:#6b5400;font-size:0.85rem;margin-top:10px;">
      No active Ledger or Cost Center configured — ask ops to set one up before running depreciation.
    </div>`;
    return;
  }
  if (!res || !res.ok) {
    resultEl.innerHTML = `<div style="padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;margin-top:10px;">${_finEsc(res ? await parseApiError(res) : 'Network error.')}</div>`;
    return;
  }
  const data = await res.json();
  const postings = data.postings || [];
  const rows = postings.map(p => {
    const posted = _faPostingIsPosted(p);
    return `<tr>
      <td>${_finEsc(p.asset_tag || (p.asset_id ? `Asset #${p.asset_id}` : ''))}</td>
      <td>${posted ? '<span style="color:#1e7e34;">&#10003; Posted</span>' : '<span style="color:var(--grey-400);">&#10134; Skipped</span>'}</td>
      <td>${p.journal_entry_id ? `<a href="#" onclick="_jeOpenDetail(${p.journal_entry_id});return false;">JE #${p.journal_entry_id}</a>` : '—'}</td>
      <td>${posted ? _faMoney(p.depreciation_amount) : _finEsc(p.reason || '—')}</td>
    </tr>`;
  }).join('');
  const postedCount  = data.posted_count  ?? postings.filter(_faPostingIsPosted).length;
  const skippedCount = data.skipped_count ?? (postings.length - postedCount);
  resultEl.innerHTML = `
    <div class="fin-table-wrap" style="margin-top:12px;"><table class="fin-table">
      <thead><tr><th>ASSET TAG</th><th>STATUS</th><th>JOURNAL ENTRY</th><th>AMOUNT / REASON</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="fin-empty">No assets to process.</td></tr>'}</tbody>
    </table></div>
    <div style="margin-top:10px;font-size:0.85rem;color:var(--grey-600);">${postedCount} posted, ${skippedCount} skipped.</div>`;
}

// ── Reconciliation tab ───────────────────────────────────────────────────
// GET /api/fixed-assets/reconciliation (§5.4). Live field names differ from
// the addendum's prose (subledger_cost/gl_cost/cost_drift etc, no NBV
// columns at all) — built against openapi.json, not the prose.
async function _faRenderReconciliationTab(container) {
  container.innerHTML = `<p style="color:#888;padding:12px 0;">Loading&#8230;</p>`;
  const res = await apiFetch(`${_FA_API}/reconciliation`);
  if (!res || !res.ok) { container.innerHTML = `<p style="color:var(--coral-600);">Could not load reconciliation report.</p>`; return; }
  const data = await res.json();
  const rows = data.rows || [];
  const cell = (v) => {
    const n = parseFloat(v) || 0;
    return `<td style="${n !== 0 ? 'color:var(--coral-600,#c0392b);font-weight:600;' : 'color:#1e7e34;'}">${_faMoney(v)}</td>`;
  };
  const bodyRows = rows.map((r, i) => `<tr style="background:${i % 2 ? 'var(--navy-50,#f5f7fa)' : 'transparent'};">
    <td>${_finEsc(r.category_name)}</td>
    <td>${_faMoney(r.subledger_cost)}</td>
    <td>${_faMoney(r.gl_cost)}</td>
    ${cell(r.cost_drift)}
    <td>${r.subledger_accumulated_depreciation != null ? _faMoney(r.subledger_accumulated_depreciation) : '—'}</td>
    <td>${r.gl_accumulated_depreciation != null ? _faMoney(r.gl_accumulated_depreciation) : '—'}</td>
    ${cell(r.accumulated_drift)}
    <td>${_faMoney(r.pending_capitalisation_cost)}</td>
  </tr>`).join('');
  container.innerHTML = `
    ${data.has_pending_drafts ? `<div style="margin-bottom:12px;padding:10px 14px;border-radius:6px;background:var(--gold-100);border-left:3px solid var(--gold-500);color:#7a6110;font-size:0.85rem;">There are draft assets awaiting confirmation, excluded from these totals but shown separately as pending capitalisation.</div>` : ''}
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>CATEGORY</th><th>COST (SUB-LEDGER)</th><th>COST (GL)</th><th>COST DRIFT</th>
        <th>ACCUM DEP (SUB-LEDGER)</th><th>ACCUM DEP (GL)</th><th>ACCUM DEP DRIFT</th><th>PENDING CAPITALISATION</th>
      </tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="8" class="fin-empty">No categories to reconcile.</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;background:var(--navy-900,#0D2137);color:#fff;">
        <td>TOTALS</td><td></td><td></td><td>${_faMoney(data.total_cost_drift)}</td>
        <td></td><td></td><td>${_faMoney(data.total_accumulated_drift)}</td><td>${_faMoney(data.total_pending_capitalisation)}</td>
      </tr></tfoot>
    </table></div>
    <div style="margin-top:10px;font-size:0.9rem;${data.is_balanced ? 'color:#1e7e34;' : 'color:var(--coral-600,#c0392b);font-weight:600;'}">
      ${data.is_balanced ? '✓ Register and GL are balanced.' : 'Register and GL are out of balance — see drift columns above.'}
    </div>`;
}
