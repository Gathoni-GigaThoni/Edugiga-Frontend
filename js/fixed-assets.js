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

// ── GL proof (register-first, prove-GL-later) ────────────────────────────
// A confirmed asset with is_gl_posted=false is a valid state: the register
// holds the physical asset, but the debit to its cost account hasn't been
// traced to the GL yet. It's a drift warning, not an error. The GL side is
// proved one of three ways — a supplier invoice line (its accrual JE is the
// proof), a linked capitalisation JE, or a dated attestation.
//
// The pill renders only when is_gl_posted is actually on the wire, so a
// backend that predates the field doesn't paint every row "GL Pending".
// Rejected assets never reach the GL, so they carry no pill either.
let _faGlPendingOnly = false;
function _faGlPill(item, compact = false) {
  if (typeof item.is_gl_posted !== 'boolean' || item.status === 'rejected') return '';
  const shape = compact
    ? 'padding:1px 7px;border-radius:9px;font-size:0.68rem;margin-right:6px;'
    : 'padding:3px 10px;border-radius:12px;font-size:0.78rem;margin-left:8px;';
  const [label, colors, tip] = item.is_gl_posted
    ? ['GL Posted', 'color:#1e7e34;background:#dcf3e2;', 'The GL side of this asset is proved.']
    : ['GL Pending', 'color:#8a6100;background:#fdf3d0;', 'In the register, but the debit to its cost account has not been traced to the GL yet.'];
  return `<span style="display:inline-block;${shape}font-weight:700;vertical-align:middle;${colors}" title="${tip}">${label}</span>`;
}
function _faGlFilter(item) {
  return !_faGlPendingOnly || (item.is_gl_posted === false && item.status !== 'rejected');
}
// GET /fixed-assets/ takes only category_id/is_disposed/status, so this
// filters the fetched list client-side.
function _faGlPendingChipHtml() {
  const on = _faGlPendingOnly;
  return `<button type="button" class="fin-btn-outline" aria-pressed="${on}" onclick="_faToggleGlPendingOnly()"
    style="padding:4px 11px;font-size:0.78rem;${on ? 'background:var(--navy-700,#1B3057);color:#fff;border-color:var(--navy-700,#1B3057);' : ''}">${on ? '&#10003; ' : ''}Show GL Pending only</button>`;
}
function _faToggleGlPendingOnly() {
  _faGlPendingOnly = !_faGlPendingOnly;
  _faRenderTab();
}

// FixedAssetRead carries capitalisation_journal_entry_id but not the JV
// number, so the number is resolved with a GET on the entry. A failed read
// isn't cached (the next render retries), and the link still works as
// "JE #id" for a reader without journal-entry access.
const _faJeCache = {};     // je id -> Promise<JournalEntryRead | null>
const _faJeResolved = {};  // je id -> JournalEntryRead, once loaded
function _faFetchJe(jeId) {
  if (!_faJeCache[jeId]) {
    _faJeCache[jeId] = apiFetch(`${_JE_API}${jeId}`)
      .then(res => (res && res.ok) ? res.json() : null)
      .catch(() => null)
      .then(je => {
        if (je) _faJeResolved[jeId] = je;
        else delete _faJeCache[jeId];
        return je;
      });
  }
  return _faJeCache[jeId];
}
function _faJeLinkHtml(jeId) {
  const link = je => `<a href="#" onclick="_jeOpenDetail(${jeId});return false;">${_finEsc(je?.jv_number || `JE #${jeId}`)}</a>`;
  if (_faJeResolved[jeId]) return link(_faJeResolved[jeId]);
  const slot = `fa-je-link-${jeId}-${Math.random().toString(36).slice(2, 8)}`;
  _faFetchJe(jeId).then(je => { const el = document.getElementById(slot); if (el) el.outerHTML = link(je); });
  return `<span id="${slot}">${link(null)}</span>`;
}
function _faGlProofHtml(item) {
  if (item.capitalisation_journal_entry_id) return `Capitalisation JV: ${_faJeLinkHtml(item.capitalisation_journal_entry_id)}`;
  if (item.supplier_invoice_line_id) return `Source: Supplier Invoice Line #${item.supplier_invoice_line_id} — the invoice's accrual journal entry is the proof.`;
  if (item.is_gl_posted) return 'Recorded in the GL without a specific journal entry link — any attestation reason is stamped in Notes.';
  return `<span style="color:#8a6100;">Not yet traced to the GL. Link the journal entry that capitalised it, or attest that the GL side is already recorded.</span>`;
}
// Offered only on live (confirmed, not disposed) assets where nothing else
// proves the GL side: an invoice-linked asset is proved by the accrual JE,
// the server refuses both actions on rejected or disposed assets (409), and a
// draft gets confirmed before its GL side is proved.
function _faGlActionsHtml(item) {
  if (item.is_gl_posted !== false || item.capitalisation_journal_entry_id || item.supplier_invoice_line_id) return '';
  if (item.status !== 'confirmed' || item.is_disposed) return '';
  return `
      <button class="fin-btn-outline" onclick="_faOpenLinkJeModal(${item.id})">Link Journal Entry</button>
      <button class="fin-btn-outline" onclick="_faOpenMarkGlPostedModal(${item.id})">Mark GL Posted</button>`;
}

// ── Physical placement + movement log ────────────────────────────────────
// Location and custodian are tracked apart from the GL: a movement is a
// physical event with no journal entry. current_school_class_id /
// current_location_text / current_custodian_employee_id on the asset row are
// the cached placement and the source of truth for any list — the movement
// log is only fetched to show an asset's history.
//
// Class and custodian names come from inventory.js's shared lookups (the same
// HR-employee custodian picker and class list the Stores form uses), loaded
// once with the register.
function _faEnsurePlacementLookups() {
  return Promise.all([_invEnsureCustodianCache(), _invEnsureClassesCache()]);
}

// Enum order is deliberate (roughly by frequency) — don't re-sort.
const _FA_MOVEMENT_TYPES = [
  { key: 'initial_placement',    label: 'Initial placement',    pill: 'color:#555;background:#eee;' },
  { key: 'transfer',             label: 'Transfer',             pill: 'color:#1e7e34;background:#dcf3e2;' },
  { key: 'custodian_change',     label: 'Custodian change',     pill: 'color:#6a3fb5;background:#ece4f8;' },
  { key: 'sent_for_repair',      label: 'Sent for repair',      pill: 'color:#8a6100;background:#fdf3d0;' },
  { key: 'returned_from_repair', label: 'Returned from repair', pill: 'color:#1e7e34;background:transparent;box-shadow:inset 0 0 0 1px #1e7e34;' },
  { key: 'verification',         label: 'Verification',         pill: 'color:#1a5fb4;background:#dce8fb;' },
  { key: 'pre_disposal_hold',    label: 'Pre-disposal hold',    pill: 'color:#c0392b;background:#fde0de;' },
];
function _faMovementType(key) {
  return _FA_MOVEMENT_TYPES.find(t => t.key === key)
    || { key, label: String(key || '').replace(/_/g, ' '), pill: 'color:#555;background:#eee;' };
}
function _faMovementPill(key) {
  const t = _faMovementType(key);
  return `<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:0.74rem;font-weight:600;white-space:nowrap;${t.pill}">${_finEsc(t.label)}</span>`;
}

// Truncates for display and keeps the full text in a tooltip.
function _faTrunc(text, max, tip = text) {
  const s = String(text ?? '');
  if (s.length <= max) return `<span title="${_finEsc(tip)}">${_finEsc(s)}</span>`;
  return `<span title="${_finEsc(tip)}">${_finEsc(s.slice(0, max - 1))}&hellip;</span>`;
}
const _FA_MUTED_DASH = '<span style="color:var(--grey-400,#aaa);">—</span>';
// A class id wins over free text; the backend never sets both.
function _faPlacementName(classId, text) {
  if (classId != null) return _invClassLabel(classId);
  return text || '';
}
function _faPlacementCell(classId, text, max = 40) {
  const name = _faPlacementName(classId, text);
  return name ? _faTrunc(name, max) : _FA_MUTED_DASH;
}
function _faCustodianName(id) {
  return id == null ? '' : _invCustodianLabel(id);
}

// supporting_document_url is only length-checked server-side, so only an
// http(s) URL becomes a link. One on the API's own /uploads/ path is
// auth-gated and a plain link would open a 401, so it goes through
// authBlobDownload instead.
function _faDocLinkHtml(url) {
  if (!url) return '';
  const icon = '&#128206;';
  if (!/^https?:\/\//i.test(url)) return `<span title="${_finEsc(url)}" style="margin-left:6px;">${icon}</span>`;
  const apiOrigin = API_BASE.replace(/\/api\/?$/, '');
  if (url.startsWith(`${apiOrigin}/uploads/`)) {
    return `<a href="#" data-url="${_finEsc(url)}" title="Supporting document" style="margin-left:6px;text-decoration:none;"
      onclick="authBlobDownload(this.dataset.url, 'supporting-document', { openInline: true });return false;">${icon}</a>`;
  }
  return `<a href="${_finEsc(url)}" target="_blank" rel="noopener noreferrer" title="Supporting document" style="margin-left:6px;text-decoration:none;">${icon}</a>`;
}

// GET /{id}/movements, newest first. Cached per asset so re-selecting a row
// doesn't refetch; a failed read isn't cached, and _faInvalidateMovements
// drops an asset's entry after a movement is recorded against it.
const _faMovementsCache = {};    // asset id -> Promise<{ok, rows, error}>
function _faLoadMovements(assetId) {
  if (!_faMovementsCache[assetId]) {
    _faMovementsCache[assetId] = apiFetch(`${_FA_API}/${assetId}/movements`)
      .then(async res => {
        if (res && res.ok) return { ok: true, rows: _toArray(await res.json()) };
        return { ok: false, error: res ? await parseApiError(res) : 'Network error.' };
      })
      .catch(() => ({ ok: false, error: 'Network error.' }))
      .then(result => { if (!result.ok) delete _faMovementsCache[assetId]; return result; });
  }
  return _faMovementsCache[assetId];
}
function _faInvalidateMovements(assetIds) {
  (Array.isArray(assetIds) ? assetIds : [assetIds]).forEach(id => { delete _faMovementsCache[id]; });
}

function _faCurrentPlacementCardHtml(item) {
  const place = _faPlacementName(item.current_school_class_id, item.current_location_text);
  const custodian = _faCustodianName(item.current_custodian_employee_id);
  const muted = s => `<span style="color:var(--grey-500,#888);font-weight:600;">${s}</span>`;
  return `<div style="padding:10px 14px;border-radius:6px;background:var(--navy-50,#EEF3FA);border-left:3px solid var(--navy-700,#1B3057);font-size:0.88rem;margin-bottom:10px;">
    Currently: ${place ? `<strong>${_finEsc(place)}</strong>` : muted('Unplaced')}
    &middot; Custodian: ${custodian ? `<strong>${_finEsc(custodian)}</strong>` : muted('Unassigned')}
  </div>`;
}
function _faMovementRowsHtml(rows) {
  return rows.map(m => {
    const fromC = _faCustodianName(m.from_custodian_employee_id);
    const toC = _faCustodianName(m.to_custodian_employee_id);
    const custodianCell = (fromC || toC)
      ? `${fromC ? _finEsc(fromC) : _FA_MUTED_DASH} &rarr; ${toC ? _finEsc(toC) : _FA_MUTED_DASH}`
      : _FA_MUTED_DASH;
    const tip = m.notes ? `${m.reason}\n\nNotes: ${m.notes}` : m.reason;
    return `<tr>
      <td style="white-space:nowrap;">${_pvDate(m.moved_at)}</td>
      <td>${_faMovementPill(m.movement_type)}</td>
      <td>${_faPlacementCell(m.from_school_class_id, m.from_location_text)}</td>
      <td>${_faPlacementCell(m.to_school_class_id, m.to_location_text)}</td>
      <td>${custodianCell}</td>
      <td>${_faTrunc(m.reason, 60, tip)}${_faDocLinkHtml(m.supporting_document_url)}</td>
      <td style="white-space:nowrap;">Staff #${_finEsc(m.created_by)}</td>
    </tr>`;
  }).join('');
}
function _faMovementHistoryBodyHtml(item, result) {
  if (!result.ok) {
    return `<div style="padding:10px 12px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;">Could not load movement history: ${_finEsc(result.error)}</div>`;
  }
  if (!result.rows.length) {
    return `<div style="padding:18px 12px;text-align:center;color:var(--grey-600,#666);font-size:0.88rem;">No movements recorded yet. Log the first placement to start the audit trail.</div>`;
  }
  return `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>DATE</th><th>TYPE</th><th>FROM</th><th>TO</th><th>CUSTODIAN CHANGE</th><th>REASON</th><th>RECORDED BY</th></tr></thead>
    <tbody>${_faMovementRowsHtml(result.rows)}</tbody>
  </table></div>`;
}
// Rendered synchronously into the detail grid with a slot the history fills
// once loaded (same slot pattern as _faJeLinkHtml).
function _faMovementPanelHtml(item) {
  const slot = `fa-mv-panel-${item.id}-${Math.random().toString(36).slice(2, 8)}`;
  _faLoadMovements(item.id).then(result => {
    const el = document.getElementById(slot);
    if (el) el.innerHTML = _faMovementHistoryBodyHtml(item, result);
  });
  return `<div style="width:100%;">
    ${_faCurrentPlacementCardHtml(item)}
    <div id="${slot}"><p style="color:#888;font-size:0.85rem;margin:6px 0;">Loading movement history&#8230;</p></div>
  </div>`;
}

async function loadFixedAssetsView(container) {
  await Promise.all([_pvLoadLookups(), _faEnsurePlacementLookups()]);
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
    ${_faGlPendingChipHtml()}
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
    listFilterFn: _faGlFilter,
    // The GL pill leads col2 rather than trailing col1: both columns clip with
    // an ellipsis, and a long asset tag would push the pill out of view.
    col1Label: 'Asset Tag', col2Label: 'GL · Category / NBV',
    col1: a => `<strong>${_finEsc(a.asset_tag || '—')}</strong>${_faMethodBadge(a)}`,
    col2: a => `${_faGlPill(a, true)}${_finEsc(_acCategoryName(a.category_id))} · ${_faMoney(a.net_book_value ?? a.acquisition_cost)}`,
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
      ${_faGlPendingChipHtml()}
    </div>
    <div class="split-layout">
      <div class="split-left">
        <div class="split-left-header"><span class="split-left-title">Archived</span><span class="split-left-count">${_faArchivedItems.filter(_faGlFilter).length}</span></div>
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
  listEl.innerHTML = _faArchivedItems.filter(_faGlFilter).map(item => {
    const isSel = _faArchivedSelected && String(_faArchivedSelected.id) === String(item.id);
    return `<div class="split-list-row${isSel ? ' active' : ''}" data-id="${item.id}">
      <div class="split-col1">${_finEsc(item.asset_tag || '—')}</div>
      <div class="split-col2">${_faGlPill(item, true)}${item.is_disposed ? 'Disposed' : 'Rejected'}</div>
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
    {label:'Status', key:'status', fmt:(v,item)=>_faStatusBadge(item) + _faGlPill(item)},
    {label:'GL Proof', key:'capitalisation_journal_entry_id', fullWidth:true, hideWhen: item=>typeof item.is_gl_posted!=='boolean' || item.status==='rejected', fmt:(v,item)=>_faGlProofHtml(item)},
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
    // Rejected assets were never physical items — the backend refuses any
    // movement against them, so there is no placement or history to show.
    {label:'Movement History', key:'current_school_class_id', fullWidth:true, hideWhen: item=>item.status==='rejected', fmt:(v,item)=>_faMovementPanelHtml(item)},
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
    return `${_faGlActionsHtml(item)}
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
        <select id="fa-f-category" class="fin-form-select" onchange="_faJePickerRenderCapacity('fa-f-capje')">
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
        <input type="number" id="fa-f-acq-cost" class="fin-form-input" min="0.01" step="0.01" oninput="_faJePickerRenderCapacity('fa-f-capje')">
        <span class="fin-field-error" id="fa-f-acq-cost-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Supplier Invoice Line</label>
        <select id="fa-f-si-line" class="fin-form-select" onchange="_faAddGlSourceChanged()">
          <option value="">None (not linked to an invoice)</option>
          ${_faEligibleLines.map(l => `<option value="${l.line_id}">${_finEsc(l.invoice_number)} — ${_finEsc(l.description)} (${l.available_slots} slot${l.available_slots===1?'':'s'} left)</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Capitalisation Journal Entry (optional)</label>
        <div id="fa-f-capje-na" style="display:none;font-size:12.5px;color:var(--grey-600,#666);cursor:help;" title="GL proof already comes from the linked supplier invoice.">&#9432; Not applicable — GL proof already comes from the linked supplier invoice.</div>
        <div id="fa-f-capje-picker">${_faJePickerHtml('fa-f-capje')}</div>
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
      <div id="fa-f-nogl-warn" style="margin-top:12px;padding:10px 14px;border-radius:6px;border-left:3px solid var(--gold-500);background:var(--gold-100);color:#7a6110;font-size:0.85rem;">
        This asset will be registered without a GL link. You can attach a Journal Entry or attest later from the asset detail page.
      </div>
      <div id="fa-f-submit-msg"></div>
      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="fin-btn-teal" onclick="submitFaAdd()">Save</button>
        <button class="fin-btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>`;
  // Capacity is previewed against the chosen category's cost account — that
  // is where the asset's cost account comes from on create.
  _faAllAssetsPromise = null;
  _faJePickers['fa-f-capje'] = {
    assetId: null,
    costAccountId: () => (_acCategories.find(c => String(c.id) === document.getElementById('fa-f-category')?.value) || {}).cost_account_id,
    assetCost: () => document.getElementById('fa-f-acq-cost')?.value,
    onChange: _faAddGlSourceChanged,
  };
}
// A supplier invoice line and a capitalisation JE are mutually exclusive
// (422 if both are sent): choosing a line clears and hides the JE picker.
function _faAddGlSourceChanged() {
  const siLine = document.getElementById('fa-f-si-line')?.value;
  if (siLine && _faJePickerValue('fa-f-capje')) { _faJePickerClear('fa-f-capje'); return; } // re-enters via onChange
  const picker = document.getElementById('fa-f-capje-picker');
  if (!picker) return;
  picker.style.display = siLine ? 'none' : '';
  document.getElementById('fa-f-capje-na').style.display = siLine ? '' : 'none';
  document.getElementById('fa-f-nogl-warn').style.display = (!siLine && !_faJePickerValue('fa-f-capje')) ? '' : 'none';
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
  const capJe = _faJePickerValue('fa-f-capje');
  if (capJe) payload.capitalisation_journal_entry_id = capJe;
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

  const msgEl = document.getElementById('fa-f-submit-msg');
  if (msgEl) msgEl.innerHTML = '';
  const res = await apiFetch(`${_FA_API}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) { showToast('Fixed asset added.', 'success'); await window._splitReload?.(); }
  // Inline rather than a toast: a 422 (e.g. both an invoice line and a JE
  // sent) can run long, and the operator needs it while fixing the form.
  else if (res) _pvShowCoralMsg(msgEl, await parseApiError(res));
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

// ── Posted-JE picker (Link Journal Entry modal + Add form) ───────────────
// Lists POSTED entries only — link-journal-entry 422s on anything else.
// JournalEntryListItem has no lines[], so the capacity preview reads the
// single entry, and only for the one actually picked.
let _faPostedJes = [];
const _faJePickers = {};  // picker prefix -> { assetId, costAccountId(), assetCost(), onChange() }
async function _faLoadPostedJes() {
  // A failed or 403'd load leaves [] — guard on length so the next open retries.
  if (!_faPostedJes.length) _faPostedJes = await loadLookupList(`${_JE_API}?status=posted`, 'journal-entries');
  return _faPostedJes;
}
// The list endpoint has no capitalisation_journal_entry_id filter, so claims
// on an entry are summed from the whole register, fetched once per picker.
let _faAllAssetsPromise = null;
function _faLoadAllAssets() {
  if (!_faAllAssetsPromise) {
    _faAllAssetsPromise = apiFetch(`${_FA_API}/`)
      .then(async res => (res && res.ok) ? _toArray(await res.json()) : [])
      .catch(() => []);
  }
  return _faAllAssetsPromise;
}

function _faJePickerHtml(p) {
  return `
    <input type="hidden" id="${p}-id" value="">
    <div id="${p}-selected" style="display:none;"></div>
    <div id="${p}-search-wrap">
      <input type="text" id="${p}-search" class="fin-form-input" autocomplete="off"
        placeholder="Search posted entries by JV number or reference&#8230;"
        onfocus="_faJePickerOpen('${p}')" oninput="_faJePickerSearch('${p}', this.value)">
      <div id="${p}-results" style="max-height:220px;overflow:auto;margin-top:6px;"></div>
    </div>
    <div id="${p}-capacity"></div>`;
}
async function _faJePickerOpen(p) {
  const el = document.getElementById(`${p}-results`);
  if (!_faPostedJes.length && el) el.innerHTML = `<div style="padding:10px 12px;color:#888;font-size:0.85rem;">Loading posted journal entries&#8230;</div>`;
  await _faLoadPostedJes();
  _faJePickerSearch(p, document.getElementById(`${p}-search`)?.value || '');
}
function _faJePickerSearch(p, term) {
  const el = document.getElementById(`${p}-results`);
  if (!el) return;
  const t = (term || '').toLowerCase().trim();
  const matches = _faPostedJes.filter(je => !t
    || (je.jv_number || '').toLowerCase().includes(t)
    || (je.reference || '').toLowerCase().includes(t));
  if (!matches.length) {
    const why = lookupWasDenied('journal-entries') ? lookupDeniedMessage('journal-entries')
      : (t ? 'No posted journal entries match.' : 'No posted journal entries found.');
    el.innerHTML = `<div style="padding:10px 12px;color:#888;font-size:0.85rem;">${_finEsc(why)}</div>`;
    return;
  }
  const shown = matches.slice(0, 50);
  el.innerHTML = `<div style="border:1px solid var(--grey-100,#eee);border-radius:6px;">
    ${shown.map(je => `
      <div style="padding:8px 12px;border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:0.88rem;" onclick="_faJePickerSelect('${p}', ${je.id})">
        <strong>${_finEsc(je.jv_number || '#' + je.id)}</strong> — ${_finEsc(je.reference || '')}
        <span style="float:right;color:#888;">${_pvDate(je.entry_date)} · ${_faMoney(je.total_amount)}</span>
      </div>`).join('')}
    ${matches.length > shown.length ? `<div style="padding:6px 12px;color:#888;font-size:0.78rem;">Showing ${shown.length} of ${matches.length} — refine the search to narrow it.</div>` : ''}
  </div>`;
}
function _faJePickerSelect(p, jeId) {
  const je = _faPostedJes.find(j => String(j.id) === String(jeId));
  document.getElementById(`${p}-id`).value = jeId;
  document.getElementById(`${p}-search-wrap`).style.display = 'none';
  const sel = document.getElementById(`${p}-selected`);
  sel.style.display = '';
  sel.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--grey-200,#ddd);border-radius:6px;font-size:0.88rem;">
    <span style="flex:1;"><strong>${_finEsc(je?.jv_number || '#' + jeId)}</strong> — ${_finEsc(je?.reference || '')} <span style="color:#888;">${_pvDate(je?.entry_date)}</span></span>
    <button type="button" class="fin-btn-outline" style="padding:3px 10px;font-size:0.78rem;" onclick="_faJePickerClear('${p}')">Change</button>
  </div>`;
  _faJePickers[p]?.onChange?.();
  _faJePickerRenderCapacity(p);
}
function _faJePickerClear(p) {
  const idEl = document.getElementById(`${p}-id`);
  if (!idEl) return;
  idEl.value = '';
  document.getElementById(`${p}-selected`).style.display = 'none';
  document.getElementById(`${p}-search-wrap`).style.display = '';
  document.getElementById(`${p}-capacity`).innerHTML = '';
  _faJePickers[p]?.onChange?.();
}
function _faJePickerValue(p) {
  const v = document.getElementById(`${p}-id`)?.value;
  return v ? parseInt(v, 10) : null;
}
// Advisory preview of link-journal-entry's capacity check: the entry's debit
// to the cost account, less what other non-rejected assets already claim on
// it. The server's check on submit is the authority and its 422 is shown
// verbatim — this only saves a round trip on an obviously wrong pick.
async function _faJePickerRenderCapacity(p) {
  const el = document.getElementById(`${p}-capacity`);
  const cfg = _faJePickers[p] || {};
  const jeId = _faJePickerValue(p);
  if (!el) return;
  if (!jeId) { el.innerHTML = ''; return; }
  const box = (body, warn = false) => `<div style="margin-top:8px;padding:10px 12px;border-radius:6px;font-size:0.82rem;line-height:1.55;${warn ? 'border-left:3px solid var(--gold-500);background:var(--gold-100);color:#7a6110;' : 'background:var(--navy-50,#f5f7fa);color:var(--grey-800,#333);'}">${body}</div>`;
  const costAccountId = cfg.costAccountId?.();
  if (!costAccountId) { el.innerHTML = box('Pick a Category to preview this entry\'s debit against its cost account.'); return; }
  el.innerHTML = box('Checking debit capacity&#8230;');
  const [je, assets] = await Promise.all([_faFetchJe(jeId), _faLoadAllAssets()]);
  if (_faJePickerValue(p) !== jeId) return; // re-picked while loading
  if (!je || !Array.isArray(je.lines)) { el.innerHTML = box('Could not load this entry\'s lines to preview capacity. The server still checks it when you submit.'); return; }
  const debit = je.lines
    .filter(l => l.line_type === 'debit' && String(l.account_id) === String(costAccountId))
    .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const claimants = assets.filter(a => String(a.capitalisation_journal_entry_id) === String(jeId)
    && String(a.id) !== String(cfg.assetId) && a.status !== 'rejected');
  const claimed = claimants.reduce((s, a) => s + (parseFloat(a.acquisition_cost) || 0), 0);
  const remaining = Math.round((debit - claimed) * 100) / 100;
  const cost = parseFloat(cfg.assetCost?.()) || 0;
  const acct = _finEsc(_pvAccountName(costAccountId));
  let warn = '';
  if (debit <= 0) warn = `This entry has no debit to ${acct}, so the server will refuse it.`;
  else if (cost > 0 && remaining < cost) warn = `Remaining debit (${_faMoney(remaining)}) is less than this asset's cost (${_faMoney(cost)}).`;
  el.innerHTML = box(`
    Debit to ${acct}: <strong>${_faMoney(debit)}</strong><br>
    Already claimed by ${claimants.length} other asset${claimants.length === 1 ? '' : 's'}: <strong>${_faMoney(claimed)}</strong><br>
    Remaining: <strong>${_faMoney(remaining)}</strong>${cost > 0 ? ` &middot; this asset: <strong>${_faMoney(cost)}</strong>` : ''}
    ${warn ? `<div style="margin-top:6px;font-weight:600;">${warn}</div>` : ''}
    <div style="margin-top:6px;color:#888;">Preview only — the server re-checks capacity when you submit.</div>`, !!warn);
}

// ── Link Journal Entry (POST /{id}/link-journal-entry) ───────────────────
function _faOpenLinkJeModal(id) {
  const asset = window._faPendingAsset;
  _faAllAssetsPromise = null;
  _faJePickers.falj = {
    assetId: id,
    costAccountId: () => asset.cost_account_id,
    assetCost: () => asset.acquisition_cost,
    // A server message is about the previous pick — don't leave it beside a new one.
    onChange: () => { const m = document.getElementById('falj-msg'); if (m) m.innerHTML = ''; },
  };
  const wrap = document.createElement('div');
  wrap.id = 'fa-link-je-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:auto;padding:24px;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:560px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 8px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Link Journal Entry</h3>
      <p style="margin:0 0 14px;font-size:0.85rem;color:var(--grey-600,#666);">
        Pick the posted journal entry that debited <strong>${_finEsc(_pvAccountName(asset.cost_account_id))}</strong>
        for <strong>${_finEsc(asset.asset_tag || '')}</strong> (${_faMoney(asset.acquisition_cost)}).
      </p>
      <div class="fin-form-group">
        <label class="fin-form-label">Posted Journal Entry <span class="fin-required">*</span></label>
        ${_faJePickerHtml('falj')}
      </div>
      <div id="falj-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('fa-link-je-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" id="falj-submit" onclick="_faSubmitLinkJe(${id})">Link</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  _faJePickerOpen('falj');
}
async function _faSubmitLinkJe(id) {
  const msgEl = document.getElementById('falj-msg');
  msgEl.innerHTML = '';
  const jeId = _faJePickerValue('falj');
  if (!jeId) { _pvShowCoralMsg(msgEl, 'Pick a posted journal entry to link.'); return; }
  const btn = document.getElementById('falj-submit');
  if (btn) btn.disabled = true;
  const res = await apiFetch(`${_FA_API}/${id}/link-journal-entry`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ journal_entry_id: jeId }),
  });
  if (btn) btn.disabled = false;
  if (res && res.ok) {
    _coaCloseModal('fa-link-je-modal-overlay');
    showToast('Journal entry linked — asset is now GL Posted.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  // 404/409/422 details are written for the operator — the capacity 422 names
  // the remaining debit — so they're shown verbatim, not reworded.
  _pvShowCoralMsg(msgEl, res ? await parseApiError(res) : 'Network error — the link was not saved.');
}

// ── Mark GL Posted (POST /{id}/mark-gl-posted) ───────────────────────────
function _faOpenMarkGlPostedModal(id) {
  const asset = window._faPendingAsset;
  const wrap = document.createElement('div');
  wrap.id = 'fa-mark-gl-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:480px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 8px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Mark GL Posted${asset?.asset_tag ? ` — ${_finEsc(asset.asset_tag)}` : ''}</h3>
      <div style="padding:10px 12px;border-radius:6px;background:var(--gold-100);color:#6b5400;font-size:0.82rem;margin-bottom:14px;">
        This attests the GL side of this asset is already recorded but not tied to a specific JE. Reason will be appended to the asset notes with today's date for audit.
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason (audit note) <span class="fin-required">*</span></label>
        <textarea id="famg-f-reason" class="fin-form-textarea" rows="3" maxlength="500" oninput="_faMarkGlReasonInput()"></textarea>
        <span id="famg-f-count" style="font-size:11px;color:var(--grey-500,#888);">0/500 · at least 3 characters</span>
        <span class="fin-field-error" id="famg-f-reason-err"></span>
      </div>
      <div id="famg-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('fa-mark-gl-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" id="famg-submit" onclick="_faSubmitMarkGlPosted(${id})">Mark GL Posted</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('famg-f-reason').focus();
}
function _faMarkGlReasonInput() {
  const raw = document.getElementById('famg-f-reason').value;
  const short = raw.trim().length < 3;
  const countEl = document.getElementById('famg-f-count');
  countEl.textContent = `${raw.length}/500${short ? ' · at least 3 characters' : ''}`;
  countEl.style.color = short && raw.length ? 'var(--coral-600,#c0392b)' : 'var(--grey-500,#888)';
  document.getElementById('famg-f-reason-err').textContent = '';
}
async function _faSubmitMarkGlPosted(id) {
  const reason = document.getElementById('famg-f-reason').value.trim();
  const errEl = document.getElementById('famg-f-reason-err');
  const msgEl = document.getElementById('famg-msg');
  errEl.textContent = '';
  msgEl.innerHTML = '';
  if (reason.length < 3) { errEl.textContent = 'Reason must be at least 3 characters.'; return; }
  const btn = document.getElementById('famg-submit');
  if (btn) btn.disabled = true;
  const res = await apiFetch(`${_FA_API}/${id}/mark-gl-posted`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
  });
  if (btn) btn.disabled = false;
  if (res && res.ok) {
    _coaCloseModal('fa-mark-gl-modal-overlay');
    showToast('Asset marked GL Posted — reason stamped in its notes.', 'success');
    await window._splitRefreshSelected?.();
    return;
  }
  _pvShowCoralMsg(msgEl, res ? await parseApiError(res) : 'Network error — nothing was saved.');
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
