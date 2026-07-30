// ==================== FIXED ASSET REGISTER (2026-07-21 addendum §5) ========
// CRUD + Dispose + Run Depreciation. Modeled on the split-view list+detail
// pattern used everywhere else (renderSplitView, js/dashboard.js:586), the
// Payables "pending item on window" convention for modals
// (window._pvSiPendingInvoice in js/payables.js), and the Approve/Void modal
// trio (build modal -> POST sub-path -> refresh) also from js/payables.js.
const _FA_API = `${API_BASE}/fixed-assets`;
function _faMoney(v) { return formatKES(v); }

function _faDimIfDisposed(html, item) {
  return item.is_disposed ? `<span style="opacity:0.6;">${html}</span>` : html;
}
function _faRowSub(a) {
  const parts = [a.asset_class || '—'];
  if (a.description) parts.push(a.description);
  parts.push(formatKES(a.net_book_value));
  let html = _faDimIfDisposed(_finEsc(parts.join(' · ')), a);
  if (a.is_disposed) {
    html += ` <span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;color:var(--white);background:var(--coral-500);margin-left:4px;">Disposed</span>`;
  }
  return html;
}

function _faDetailActions(item) {
  // Stashed for the Dispose/Delete modals opened from here — same convention
  // as window._pvSiPendingInvoice in js/payables.js.
  window._faPendingAsset = item;
  if (item.is_disposed) return '';
  return `
    <button class="fin-btn-outline" onclick="_faOpenDisposeModal(${item.id})">Dispose</button>
    <button class="fin-btn-cancel" onclick="_faConfirmDelete(${item.id})">Delete</button>`;
}

async function loadFixedAssetsView(container) {
  const cfg = {
    container,
    moduleKey: 'asset_management.fixed_assets',
    title: 'Fixed Assets',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'finance-fixed-assets'},
      {label:'Fixed Assets'}
    ],
    apiUrl: `${_FA_API}/`,
    searchFields: ['asset_tag','description','asset_class'],
    col1Label: 'Asset Tag', col2Label: 'Class / NBV',
    col1: a => _faDimIfDisposed(`<strong>${_finEsc(a.asset_tag||'—')}</strong>`, a),
    col2: a => _faRowSub(a),
    rowLabel: a => a.asset_tag || '—',
    rowSub:   a => a.asset_class || '',
    idKey: 'id',
    detailFields: [
      {label:'Asset Tag',        key:'asset_tag'},
      {label:'Asset Class',      key:'asset_class'},
      {label:'Description',     key:'description', fmt:v=>v||'—'},
      {label:'Acquisition Date',key:'acquisition_date', fmt:v=>v?_pvDate(v):'—'},
      {label:'Acquisition Cost',key:'acquisition_cost', fmt:v=>_faMoney(v)},
      {label:'Useful Life (years)', key:'useful_life_years'},
      {label:'Salvage Value',   key:'salvage_value', fmt:v=>_faMoney(v)},
      {label:'Depreciation Method', key:'depreciation_method', fmt:v=>v||'—'},
      {label:'Cost Account',    key:'cost_account_id', fmt:v=>v?_pvAccountName(v):'—'},
      {label:'Accumulated Depreciation Account', key:'accumulated_depreciation_account_id', fmt:v=>v?_pvAccountName(v):'—'},
      {label:'Depreciation Expense Account', key:'depreciation_expense_account_id', fmt:v=>v?_pvAccountName(v):'—'},
      {label:'Accumulated Depreciation (to date)', key:'accumulated_depreciation', fmt:v=>_faMoney(v)},
      {label:'Net Book Value',  key:'net_book_value', fmt:v=>_faMoney(v)},
      {label:'Status',          key:'is_disposed', fmt:v=>v?'Disposed':'Active'},
      {label:'Disposal Date',   key:'disposal_date', fmt:v=>v||'—'},
      {label:'Disposal Amount',key:'disposal_amount', fmt:(v,item)=>item.is_disposed?_faMoney(v):'—'},
      {label:'Disposal JE',     key:'disposal_journal_entry_id', fmt:v=>v?`<a href="#" onclick="_jeViewDetail(${v});return false;">JE #${v}</a>`:'—'},
      {label:'Notes',           key:'notes', fmt:v=>v||'—'},
    ],
    renderAdd:  el => _faRenderAddForm(el),
    renderEdit: (item, el) => _faRenderEditForm(item, el),
    canEdit: item => !item.is_disposed, // disposed assets are view-only (§5.3)
    detailActions: _faDetailActions,
  };
  await renderSplitView(cfg);
  _faInjectFilters(cfg);
}

// No first-class filter-row concept in renderSplitView beyond free-text
// search (same gap noted in js/finance.js's CoA subtype filter) — injected
// the same way: mutate cfg.apiUrl, then call the reload hook renderSplitView
// exposes on window.
function _faInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;flex-direction:column;gap:8px;';
  wrap.innerHTML = `
    <select id="fa-filter-class" class="fin-form-select" style="width:100%;font-size:12px;">
      <option value="">All Asset Classes</option>
      ${ACCOUNT_SUBTYPES_NON_CURRENT_ASSET.map(s=>`<option value="${s}">${s}</option>`).join('')}
    </select>
    <select id="fa-filter-status" class="fin-form-select" style="width:100%;font-size:12px;">
      <option value="">All Statuses</option>
      <option value="active">Active</option>
      <option value="disposed">Disposed</option>
    </select>
    <button class="fin-btn-outline" style="width:100%;" onclick="_faOpenDepreciationRunModal()">Run monthly depreciation</button>`;
  searchBox.insertAdjacentElement('afterend', wrap);
  const refetch = async () => {
    const cls = document.getElementById('fa-filter-class').value;
    const status = document.getElementById('fa-filter-status').value;
    const params = new URLSearchParams();
    if (cls) params.set('asset_class', cls);
    if (status === 'active') params.set('is_disposed', 'false');
    if (status === 'disposed') params.set('is_disposed', 'true');
    const qs = params.toString();
    cfg.apiUrl = `${_FA_API}/${qs ? '?' + qs : ''}`;
    await window._splitReload?.();
  };
  document.getElementById('fa-filter-class').addEventListener('change', refetch);
  document.getElementById('fa-filter-status').addEventListener('change', refetch);
}

// ── Add ──────────────────────────────────────────────────────────────────
function _faRenderAddForm(el) {
  el.innerHTML = `
    <div style="max-width:520px;">
      <h3 class="split-right-add-title">Add Fixed Asset</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Asset Tag <span class="fin-required">*</span></label>
        <input type="text" id="fa-f-tag" class="fin-form-input">
        <span class="fin-field-error" id="fa-f-tag-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Asset Class <span class="fin-required">*</span></label>
        <select id="fa-f-class" class="fin-form-select" onchange="_faRefreshAccountPickers(this.value)">
          <option value="">Please Select</option>
          ${ACCOUNT_SUBTYPES_NON_CURRENT_ASSET.map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="fa-f-class-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Description</label>
        <input type="text" id="fa-f-desc" class="fin-form-input">
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
        <label class="fin-form-label">Useful Life (years) <span class="fin-required">*</span></label>
        <input type="number" id="fa-f-life" class="fin-form-input" min="1" step="1">
        <span class="fin-field-error" id="fa-f-life-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Salvage Value <span class="fin-required">*</span></label>
        <input type="number" id="fa-f-salvage" class="fin-form-input" min="0" step="0.01" value="0">
        <span class="fin-field-error" id="fa-f-salvage-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Depreciation Method</label>
        <select class="fin-form-select" disabled><option selected>straight_line</option></select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Cost Account <span class="fin-required">*</span></label>
        <select id="fa-f-cost-acct" class="fin-form-select" disabled><option value="">Select Asset Class first</option></select>
        <span class="fin-field-error" id="fa-f-cost-acct-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Accumulated Depreciation Account <span class="fin-required">*</span></label>
        <select id="fa-f-accum-acct" class="fin-form-select" disabled><option value="">Select Asset Class first</option></select>
        <span class="fin-field-error" id="fa-f-accum-acct-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Depreciation Expense Account <span class="fin-required">*</span></label>
        <select id="fa-f-exp-acct" class="fin-form-select"><option value="">Loading&#8230;</option></select>
        <span class="fin-field-error" id="fa-f-exp-acct-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="fa-f-notes" class="fin-form-textarea" rows="3"></textarea>
      </div>
      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="fin-btn-teal" onclick="submitFaAdd()">Save</button>
        <button class="fin-btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>`;
  _faLoadDepreciationExpenseAccounts();
}

async function _faLoadDepreciationExpenseAccounts() {
  const sel = document.getElementById('fa-f-exp-acct');
  if (!sel) return;
  const res = await apiFetch(`${API_BASE}/accounts/?account_type=Expense&account_subtype=${encodeURIComponent('Depreciation')}&is_active=true`);
  const rows = res && res.ok ? _toArray(await res.json()) : [];
  sel.innerHTML = `<option value="">Please Select</option>` +
    rows.map(a=>`<option value="${a.id}">${_finEsc(a.number?a.number+' - ':'')}${_finEsc(a.account_name)}</option>`).join('');
}

// Cost Account and Accumulated Depreciation Account both scope to (Asset,
// <chosen Asset Class>) — refetched together whenever Asset Class changes.
async function _faRefreshAccountPickers(assetClass) {
  const costSel  = document.getElementById('fa-f-cost-acct');
  const accumSel = document.getElementById('fa-f-accum-acct');
  if (!assetClass) {
    if (costSel)  { costSel.innerHTML  = '<option value="">Select Asset Class first</option>'; costSel.disabled  = true; }
    if (accumSel) { accumSel.innerHTML = '<option value="">Select Asset Class first</option>'; accumSel.disabled = true; }
    return;
  }
  const res = await apiFetch(`${API_BASE}/accounts/?account_type=Asset&account_subtype=${encodeURIComponent(assetClass)}&is_active=true`);
  const rows = res && res.ok ? _toArray(await res.json()) : [];
  const optionsHtml = `<option value="">Please Select</option>` +
    rows.map(a=>`<option value="${a.id}">${_finEsc(a.number?a.number+' - ':'')}${_finEsc(a.account_name)}</option>`).join('');
  if (costSel)  { costSel.innerHTML  = optionsHtml; costSel.disabled  = false; }
  if (accumSel) { accumSel.innerHTML = optionsHtml; accumSel.disabled = false; }
}

async function submitFaAdd() {
  const tag        = (document.getElementById('fa-f-tag').value||'').trim();
  const assetClass = document.getElementById('fa-f-class').value;
  const desc       = (document.getElementById('fa-f-desc').value||'').trim();
  const acqDate    = document.getElementById('fa-f-acq-date').value;
  const acqCost    = document.getElementById('fa-f-acq-cost').value;
  const life       = document.getElementById('fa-f-life').value;
  const salvage    = document.getElementById('fa-f-salvage').value;
  const costAcct   = document.getElementById('fa-f-cost-acct').value;
  const accumAcct  = document.getElementById('fa-f-accum-acct').value;
  const expAcct    = document.getElementById('fa-f-exp-acct').value;
  const notes      = (document.getElementById('fa-f-notes').value||'').trim();

  const setErr = (id, msg) => { const e = document.getElementById(id); if (e) e.textContent = msg; };
  ['fa-f-tag-err','fa-f-class-err','fa-f-acq-date-err','fa-f-acq-cost-err','fa-f-life-err',
   'fa-f-salvage-err','fa-f-cost-acct-err','fa-f-accum-acct-err','fa-f-exp-acct-err'].forEach(id=>setErr(id,''));

  let valid = true;
  if (!tag)        { setErr('fa-f-tag-err','This field is required.'); valid = false; }
  if (!assetClass) { setErr('fa-f-class-err','This field is required.'); valid = false; }
  if (!acqDate)    { setErr('fa-f-acq-date-err','This field is required.'); valid = false; }
  if (!acqCost || parseFloat(acqCost) <= 0) { setErr('fa-f-acq-cost-err','Must be greater than 0.'); valid = false; }
  if (!life || parseInt(life) <= 0)         { setErr('fa-f-life-err','Must be greater than 0.'); valid = false; }
  if (salvage === '' || parseFloat(salvage) < 0) { setErr('fa-f-salvage-err','Must be 0 or more.'); valid = false; }
  else if (acqCost && parseFloat(salvage) >= parseFloat(acqCost)) { setErr('fa-f-salvage-err','Must be less than Acquisition Cost.'); valid = false; }
  if (!costAcct)  { setErr('fa-f-cost-acct-err','This field is required.'); valid = false; }
  if (!accumAcct) { setErr('fa-f-accum-acct-err','This field is required.'); valid = false; }
  if (!expAcct)   { setErr('fa-f-exp-acct-err','This field is required.'); valid = false; }
  if (!valid) return;

  // Decimal fields are sent as the raw input strings, not parseFloat'd —
  // never Number()-coerce money before it hits the wire.
  const payload = {
    asset_tag: tag, asset_class: assetClass, description: desc || null,
    acquisition_date: acqDate, acquisition_cost: acqCost,
    useful_life_years: parseInt(life), salvage_value: salvage,
    depreciation_method: 'straight_line',
    cost_account_id: parseInt(costAcct),
    accumulated_depreciation_account_id: parseInt(accumAcct),
    depreciation_expense_account_id: parseInt(expAcct),
    notes: notes || null,
  };
  const res = await apiFetch(`${_FA_API}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Fixed asset added.', 'success'); await window._splitReload?.(); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ── Edit (Description + Notes only, §5.3) ───────────────────────────────
function _faRenderEditForm(item, el) {
  el.innerHTML = `
    <div style="max-width:460px;">
      <h3 class="split-right-add-title">Edit ${_finEsc(item.asset_tag||'')}</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Description</label>
        <input type="text" id="fa-e-desc" class="fin-form-input" value="${_finEsc(item.description||'')}">
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
  const description = (document.getElementById('fa-e-desc').value||'').trim();
  const notes = (document.getElementById('fa-e-notes').value||'').trim();
  const res = await apiFetch(`${_FA_API}/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: description || null, notes: notes || null })
  });
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
  if (res && res.status === 409) { _faShowDeleteBlocked(id, await parseApiError(res)); return; }
  if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
// No per-row inline slot exists once a list is rendered (renderSplitView's
// rows are plain text) — the detail pane is effectively "the row" the
// operator is looking at when Delete 409s, so the message + Dispose-instead
// button render there.
function _faShowDeleteBlocked(id, msg) {
  const actionsRow = document.querySelector('.detail-actions-row');
  if (!actionsRow) { showToast(msg, 'error'); return; }
  let banner = document.getElementById('fa-delete-blocked-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'fa-delete-blocked-banner';
    banner.style.cssText = 'margin-top:10px;padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;';
    actionsRow.insertAdjacentElement('afterend', banner);
  }
  banner.innerHTML = `${_finEsc(msg)} <button class="fin-btn-outline" style="margin-left:8px;" onclick="_faOpenDisposeModal(${id})">Dispose instead</button>`;
}

// ── Dispose ──────────────────────────────────────────────────────────────
function _faOpenDisposeModal(id) {
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
        <input type="number" id="fa-disp-amount" class="fin-form-input" min="0" step="0.01" value="0">
        <span style="font-size:12px;color:var(--grey-600)">Enter 0 for scrap or write-off.</span>
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
  const res = await apiFetch(`${_FA_API}/${id}/dispose`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disposal_date: date, disposal_amount: amount })
  });
  if (res && res.ok) {
    _coaCloseModal('fa-dispose-modal-overlay');
    showToast('Fixed asset disposed.', 'success');
    await window._splitRefreshSelected?.();
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
        <span style="font-size:12px;color:var(--grey-600)">The month containing this date is posted for every active asset. Already-posted months are skipped safely.</span>
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
    // Setup problem, not a request-time error — same gold-banner convention
    // as _repRenderApReconciliation's "not configured" case.
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
      <td>${p.journal_entry_id ? `<a href="#" onclick="_jeViewDetail(${p.journal_entry_id});return false;">JE #${p.journal_entry_id}</a>` : '—'}</td>
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
