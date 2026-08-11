// ==================== DOCUMENT APPROVAL SYSTEM ====================
// Approval workflow for six polymorphic document types: Payment Vouchers
// (payables.js already has its own direct submit/approve/reject actions on
// /payables/payment-vouchers/{id}/... — this module is the cross-cutting
// queue that additionally covers overdue Fee Invoices, which have no other
// approval path), overdue Fee Invoices, Requisitions, Petty Cash
// Applications, Internal (inventory) Requisitions and Employee Salary
// Advances. As of 2026-08-10 the in-module approve/reject endpoints for
// Requisitions/Petty Cash were removed server-side (404) — this is now
// their only approval path; Internal Requisitions and Employee Advances
// (added 2026-08-11) never had one. DocumentApproval only stores a
// document_type + document_id (no FK) so the referenced document's details
// (payee/student, amount, description) must be resolved separately per type.

const _DA_API = `${API_BASE}/document-approvals/`;

function _daEsc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _daMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _daDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? v : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function _daBadge(status) {
  const cls = status === 'approved' ? 'badge-approved' : status === 'rejected' ? 'badge-rejected' : 'badge-draft';
  return `<span class="${cls}" style="padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;">${_daEsc((status || '—').replace(/_/g, ' '))}</span>`;
}

const _DA_TYPE_LABEL = {
  payment_voucher:      'Payment Voucher',
  fee_invoice:           'Fee Invoice',
  requisition:           'Requisition',
  petty_cash:            'Petty Cash',
  internal_requisition: 'Internal Requisition',
  employee_advance:      'Employee Advance',
};
const _DA_TYPE_PILL_STYLE = {
  payment_voucher:      'background:var(--navy-700,#1B3057);color:#fff;',
  fee_invoice:           'background:var(--gold-500,#C9A227);color:var(--navy-900,#0D2137);',
  requisition:           'background:transparent;border:1px solid var(--navy-700,#1B3057);color:var(--navy-700,#1B3057);',
  petty_cash:            'background:transparent;border:1px solid var(--coral-500,#D94040);color:var(--coral-500,#D94040);',
  // Distinct from the navy-ghost Requisition pill and the coral-ghost Petty
  // Cash pill while staying inside the existing navy/gold/coral token set.
  internal_requisition: 'background:var(--coral-500,#D94040);color:#fff;',
  employee_advance:      'background:transparent;border:1px solid var(--gold-500,#C9A227);color:var(--gold-500,#C9A227);',
};
function _daTypeLabel(type) { return _DA_TYPE_LABEL[type] || (type || '—'); }
function _daTypeBadge(type) {
  const style = _DA_TYPE_PILL_STYLE[type] || 'background:var(--grey-100,#eee);color:#666;';
  return `<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:0.7rem;font-weight:600;white-space:nowrap;${style}">${_daEsc(_daTypeLabel(type))}</span>`;
}

// ── Resolve the referenced document (payment_voucher | fee_invoice |
// requisition | petty_cash) ─────────────────────────────────────────────
// Payment Vouchers have no confirmed single-item GET, so the full collection
// is fetched once and cached; the other three are fetched one-by-one via
// their confirmed single-item GET endpoints.
let _daPvListCache = null;
let _daFeeInvoiceCache = {};
let _daRequisitionCache = {};
let _daPettyCashCache = {};
let _daInternalRequisitionCache = {};
let _daAdvanceCache = {};
// Tracks "<type>:<id>" keys whose single-item GET came back non-OK (e.g. the
// source document was deleted after the DA row was created) so the detail
// panel can render a coral banner and disable Approve/Reject instead of
// silently falling back to a bare "#id" title.
let _daHydrationFailed = {};

async function _daPrefetchDocuments(items) {
  const pvNeeded = items.some(i => i.document_type === 'payment_voucher');
  const feeIds = [...new Set(items.filter(i => i.document_type === 'fee_invoice').map(i => i.document_id))]
    .filter(id => !_daFeeInvoiceCache[id]);
  const reqIds = [...new Set(items.filter(i => i.document_type === 'requisition').map(i => i.document_id))]
    .filter(id => !_daRequisitionCache[id]);
  const pcaIds = [...new Set(items.filter(i => i.document_type === 'petty_cash').map(i => i.document_id))]
    .filter(id => !_daPettyCashCache[id]);
  const intReqIds = [...new Set(items.filter(i => i.document_type === 'internal_requisition').map(i => i.document_id))]
    .filter(id => !_daInternalRequisitionCache[id]);
  const advIds = [...new Set(items.filter(i => i.document_type === 'employee_advance').map(i => i.document_id))]
    .filter(id => !_daAdvanceCache[id]);

  const jobs = [];
  if (reqIds.length && typeof _reqEnsureSuppliersCache === 'function') jobs.push(_reqEnsureSuppliersCache());
  if ((reqIds.length || pcaIds.length || advIds.length) && typeof _reqEnsureStaffCache === 'function') jobs.push(_reqEnsureStaffCache());
  if (intReqIds.length && typeof _invEnsureStoresCache === 'function') jobs.push(_invEnsureStoresCache());
  if (pvNeeded && !_daPvListCache) {
    jobs.push(
      apiFetch(`${API_BASE}/payables/payment-vouchers/`)
        .then(res => res && res.ok ? res.json() : [])
        .then(data => { _daPvListCache = _toArray(data); })
        .catch(() => { _daPvListCache = []; })
    );
  }
  feeIds.forEach(id => {
    jobs.push(
      apiFetch(`${API_BASE}/receivables/fee-invoices/${id}`)
        .then(res => { if (res && !res.ok) _daHydrationFailed[`fee_invoice:${id}`] = true; return res && res.ok ? res.json() : null; })
        .then(data => { if (data) _daFeeInvoiceCache[id] = data; })
        .catch(() => { _daHydrationFailed[`fee_invoice:${id}`] = true; })
    );
  });
  reqIds.forEach(id => {
    jobs.push(
      apiFetch(`${API_BASE}/procurement/requisitions/${id}`)
        .then(res => { if (res && !res.ok) _daHydrationFailed[`requisition:${id}`] = true; return res && res.ok ? res.json() : null; })
        .then(data => { if (data) _daRequisitionCache[id] = data; })
        .catch(() => { _daHydrationFailed[`requisition:${id}`] = true; })
    );
  });
  pcaIds.forEach(id => {
    jobs.push(
      apiFetch(`${API_BASE}/payables/petty-cash-applications/${id}`)
        .then(res => { if (res && !res.ok) _daHydrationFailed[`petty_cash:${id}`] = true; return res && res.ok ? res.json() : null; })
        .then(data => { if (data) _daPettyCashCache[id] = data; })
        .catch(() => { _daHydrationFailed[`petty_cash:${id}`] = true; })
    );
  });
  intReqIds.forEach(id => {
    jobs.push(
      apiFetch(`${API_BASE}/inventory/internal-requisitions/${id}`)
        .then(res => { if (res && !res.ok) _daHydrationFailed[`internal_requisition:${id}`] = true; return res && res.ok ? res.json() : null; })
        .then(data => { if (data) _daInternalRequisitionCache[id] = data; })
        .catch(() => { _daHydrationFailed[`internal_requisition:${id}`] = true; })
    );
  });
  advIds.forEach(id => {
    jobs.push(
      apiFetch(`${API_BASE}/payroll/advances/${id}`)
        .then(res => { if (res && !res.ok) _daHydrationFailed[`employee_advance:${id}`] = true; return res && res.ok ? res.json() : null; })
        .then(data => { if (data) _daAdvanceCache[id] = data; })
        .catch(() => { _daHydrationFailed[`employee_advance:${id}`] = true; })
    );
  });
  await Promise.all(jobs);
}

function _daResolveDoc(item) {
  if (item.document_type === 'payment_voucher') {
    const v = (_daPvListCache || []).find(x => String(x.id) === String(item.document_id));
    if (!v) return { title: `Payment Voucher #${item.document_id}`, sub: '', amount: null };
    const payee = v.payee_name_freetext || v.payee_type || '—';
    return { title: v.voucher_no || `Payment Voucher #${item.document_id}`, sub: payee, amount: v.amount };
  }
  if (item.document_type === 'fee_invoice') {
    const inv = _daFeeInvoiceCache[item.document_id];
    if (!inv) return { title: `Fee Invoice #${item.document_id}`, sub: '', amount: null };
    return { title: inv.invoice_number || `Fee Invoice #${item.document_id}`, sub: `Balance: ${_daMoney(inv.balance)}`, amount: inv.amount_due };
  }
  if (item.document_type === 'requisition') {
    const r = _daRequisitionCache[item.document_id];
    if (!r) return { title: `Requisition #${item.document_id}`, sub: '', amount: null };
    const supplierName = (typeof _reqSupplierName === 'function') ? _reqSupplierName(r.supplier_id) : `Supplier #${r.supplier_id}`;
    return { title: r.requisition_no || `Requisition #${item.document_id}`, sub: supplierName, amount: r.total };
  }
  if (item.document_type === 'petty_cash') {
    const p = _daPettyCashCache[item.document_id];
    if (!p) return { title: `Petty Cash #${item.document_id}`, sub: '', amount: null };
    return { title: p.purpose || `Petty Cash #${item.document_id}`, sub: `Employee #${p.applicant_id}`, amount: p.requested_amount };
  }
  if (item.document_type === 'internal_requisition') {
    const r = _daInternalRequisitionCache[item.document_id];
    if (!r) return { title: `Internal Requisition #${item.document_id}`, sub: '', amount: null };
    const fromLabel = (typeof _invStoreLabel === 'function') ? _invStoreLabel(r.from_store_id) : `Store #${r.from_store_id}`;
    const toLabel = (typeof _invStoreLabel === 'function') ? _invStoreLabel(r.to_store_id) : `Store #${r.to_store_id}`;
    return { title: r.requisition_number || `Internal Requisition #${item.document_id}`, sub: `${fromLabel} → ${toLabel}`, amount: null };
  }
  if (item.document_type === 'employee_advance') {
    const a = _daAdvanceCache[item.document_id];
    if (!a) return { title: `Employee Advance #${item.document_id}`, sub: '', amount: null };
    const employeeName = (typeof _reqStaffLabel === 'function') ? _reqStaffLabel(a.employee_id) : `Employee #${a.employee_id}`;
    return { title: a.advance_number || `Employee Advance #${item.document_id}`, sub: employeeName, amount: a.approved_amount ?? a.principal };
  }
  return { title: `#${item.document_id}`, sub: '', amount: null };
}

// ==================== APPROVAL QUEUE (pending only) ====================

async function loadDaQueueView(container) {
  container.innerHTML = `
    <div id="da-toolbar" style="margin-bottom:10px;"></div>
    <div id="da-split-mount"></div>
  `;
  document.getElementById('da-toolbar').innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:10px;padding:0 4px;">
      <button class="fin-btn-outline" onclick="_daSyncOverdue()">&#8635; Sync Overdue Invoices</button>
    </div>
  `;
  await _daRenderQueueSplit(document.getElementById('da-split-mount'));
}

async function _daRenderQueueSplit(mountEl) {
  let queueItems = [];
  try {
    const res = await apiFetch(`${_DA_API}queue`);
    if (res && res.ok) queueItems = _toArray(await res.json());
  } catch (_) {}
  await _daPrefetchDocuments(queueItems);

  await renderSplitView({
    container: mountEl,
    title: 'Approval Queue',
    moduleKey: 'document_approval',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Document Approvals', view: 'document-approvals-queue' },
      { label: 'Approval Queue' }
    ],
    apiUrl: `${_DA_API}queue`,
    searchFields: [],
    col1Label: 'Document', col2Label: 'Status',
    col1: item => `${_daTypeBadge(item.document_type)} ${_daEsc(_daResolveDoc(item).title)}`,
    col2: () => _daBadge('pending'),
    rowLabel: item => _daResolveDoc(item).title,
    rowSub: item => `${_daTypeLabel(item.document_type)} — ${_daResolveDoc(item).sub}`,
    idKey: 'id',
    detailFields: _daDetailFields,
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#9989;</div>
        <p style="font-weight:600;margin-bottom:8px">Nothing waiting on you right now</p>
        <p style="font-size:13px;">Select an item from the list to review it, or run "Sync Overdue Invoices" above to pull in newly-overdue fee invoices.</p>
      </div>`;
    },
    detailActions: _daDetailActions,
  });
}

// ==================== ALL APPROVALS (filterable) ====================

let _daAllFilters = { document_type: '', status: '' };

async function loadDaAllView(container) {
  container.innerHTML = `
    <div id="da-all-filter-bar" style="margin-bottom:10px;"></div>
    <div id="da-all-split-mount"></div>
  `;
  _daRenderAllFilterBar();
  await _daRenderAllSplit();
}

function _daRenderAllFilterBar() {
  const bar = document.getElementById('da-all-filter-bar');
  if (!bar) return;
  bar.innerHTML = `
    <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;padding:0 4px 4px;">
      <div class="fin-form-group" style="margin:0;">
        <label class="fin-form-label">Document Type</label>
        <select id="da-filter-doctype" class="fin-form-select">
          <option value="">All</option>
          <option value="payment_voucher" ${_daAllFilters.document_type === 'payment_voucher' ? 'selected' : ''}>Payment Voucher</option>
          <option value="fee_invoice" ${_daAllFilters.document_type === 'fee_invoice' ? 'selected' : ''}>Fee Invoice</option>
          <option value="requisition" ${_daAllFilters.document_type === 'requisition' ? 'selected' : ''}>Requisition</option>
          <option value="petty_cash" ${_daAllFilters.document_type === 'petty_cash' ? 'selected' : ''}>Petty Cash</option>
          <option value="internal_requisition" ${_daAllFilters.document_type === 'internal_requisition' ? 'selected' : ''}>Internal Requisition</option>
          <option value="employee_advance" ${_daAllFilters.document_type === 'employee_advance' ? 'selected' : ''}>Employee Advance</option>
        </select>
      </div>
      <div class="fin-form-group" style="margin:0;">
        <label class="fin-form-label">Status</label>
        <select id="da-filter-status" class="fin-form-select">
          <option value="">All</option>
          <option value="pending"  ${_daAllFilters.status === 'pending'  ? 'selected' : ''}>Pending</option>
          <option value="approved" ${_daAllFilters.status === 'approved' ? 'selected' : ''}>Approved</option>
          <option value="rejected" ${_daAllFilters.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </div>
      <button class="fin-btn-filter" onclick="_daApplyAllFilters()">Apply</button>
      <button class="fin-btn-outline" style="margin-left:auto;" onclick="_daExportPv()">&#128190; Export Payment Vouchers</button>
    </div>
  `;
}

function _daApplyAllFilters() {
  _daAllFilters.document_type = document.getElementById('da-filter-doctype').value;
  _daAllFilters.status = document.getElementById('da-filter-status').value;
  _daRenderAllSplit();
}

async function _daRenderAllSplit() {
  const mountEl = document.getElementById('da-all-split-mount');
  if (!mountEl) return;
  const params = new URLSearchParams();
  if (_daAllFilters.document_type) params.set('document_type', _daAllFilters.document_type);
  if (_daAllFilters.status) params.set('status', _daAllFilters.status);
  const qs = params.toString();
  const apiUrl = `${_DA_API}${qs ? '?' + qs : ''}`;

  let allItems = [];
  try {
    const res = await apiFetch(apiUrl);
    if (res && res.ok) allItems = _toArray(await res.json());
  } catch (_) {}
  await _daPrefetchDocuments(allItems);

  await renderSplitView({
    container: mountEl,
    title: 'All Approvals',
    moduleKey: 'document_approval',
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Document Approvals', view: 'document-approvals-all' },
      { label: 'All Approvals' }
    ],
    apiUrl,
    searchFields: [],
    col1Label: 'Document', col2Label: 'Status',
    col1: item => `${_daTypeBadge(item.document_type)} ${_daEsc(_daResolveDoc(item).title)}`,
    col2: item => _daBadge(item.status),
    rowLabel: item => _daResolveDoc(item).title,
    rowSub: item => `${_daTypeLabel(item.document_type)} — ${_daResolveDoc(item).sub}`,
    idKey: 'id',
    detailFields: _daDetailFields,
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#128203;</div>
        <p style="font-weight:600;margin-bottom:8px">No item selected</p>
        <p style="font-size:13px;">Select an item from the list to see its full history.</p>
      </div>`;
    },
    detailActions: _daDetailActions,
  });
}

// ==================== SHARED: detail fields + actions ====================

function _daRequisitionLinesHtml(documentId) {
  const r = _daRequisitionCache[documentId];
  if (!r) return '—';
  const lines = r.lines || [];
  if (!lines.length) return '<span style="color:var(--grey-600,#5F6B7C);">No lines.</span>';
  const rows = lines.map(l => `
    <tr>
      <td>${_daEsc(l.item_description || '')}</td>
      <td>${parseFloat(l.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
      <td>${_daMoney(l.unit_price)}</td>
      <td>${_daMoney(l.line_net)}</td>
    </tr>`).join('');
  return `<div class="fin-table-wrap"><table class="fin-li-table">
    <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Line Net</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// Read-only lines table for the detail tab — the editable copy used at
// approve time lives in the approve modal (§2.5 of the addendum), not here.
function _daInternalRequisitionLinesHtml(documentId) {
  const r = _daInternalRequisitionCache[documentId];
  if (!r) return '—';
  const lines = r.lines || [];
  if (!lines.length) return '<span style="color:var(--grey-600,#5F6B7C);">No lines.</span>';
  const rows = lines.map(l => `
    <tr>
      <td>${_daEsc((typeof _invItemLabel === 'function') ? _invItemLabel(l.item_id) : `#${l.item_id}`)}</td>
      <td>${parseFloat(l.requested_quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
      <td>${l.approved_quantity != null ? parseFloat(l.approved_quantity).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—'}</td>
      <td>${l.estimated_unit_cost != null ? _daMoney(l.estimated_unit_cost) : '—'}</td>
    </tr>`).join('');
  return `<div class="fin-table-wrap"><table class="fin-li-table">
    <thead><tr><th>Item</th><th>Requested Qty</th><th>Approved Qty</th><th>Est. Unit Cost</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

const _daDetailFields = [
  { label: 'Document Type', key: 'document_type', fmt: v => _daTypeLabel(v) },
  { label: 'Reference',     key: 'document_id',  fmt: (v, item) => _daResolveDoc(item).title },
  { label: 'Amount',        key: 'document_id',  fmt: (v, item) => { const a = _daResolveDoc(item).amount; return a != null ? _daMoney(a) : '—'; } },
  { label: 'Supplier',   key: 'document_id', hideWhen: item => item.document_type !== 'requisition',
    fmt: (v, item) => { const r = _daRequisitionCache[item.document_id]; return r ? ((typeof _reqSupplierName === 'function') ? _reqSupplierName(r.supplier_id) : `Supplier #${r.supplier_id}`) : '—'; } },
  { label: 'Applicant',  key: 'document_id', hideWhen: item => item.document_type !== 'petty_cash',
    fmt: (v, item) => { const p = _daPettyCashCache[item.document_id]; return p ? ((typeof _reqStaffLabel === 'function') ? _reqStaffLabel(p.applicant_id) : `Employee #${p.applicant_id}`) : '—'; } },
  { label: 'Purpose',    key: 'document_id', hideWhen: item => item.document_type !== 'petty_cash',
    fmt: (v, item) => { const p = _daPettyCashCache[item.document_id]; return p ? (p.purpose || '—') : '—'; } },
  { label: 'Payee',      key: 'document_id', hideWhen: item => item.document_type !== 'petty_cash',
    fmt: (v, item) => { const p = _daPettyCashCache[item.document_id]; return p && p.payee ? p.payee : '—'; } },
  { label: 'Category',   key: 'document_id', hideWhen: item => item.document_type !== 'petty_cash',
    fmt: (v, item) => { const p = _daPettyCashCache[item.document_id]; return p && p.category ? p.category : '—'; } },
  { label: 'From Store', key: 'document_id', hideWhen: item => item.document_type !== 'internal_requisition',
    fmt: (v, item) => { const r = _daInternalRequisitionCache[item.document_id]; return r && typeof _invStoreLabel === 'function' ? _invStoreLabel(r.from_store_id) : '—'; } },
  { label: 'To Store',   key: 'document_id', hideWhen: item => item.document_type !== 'internal_requisition',
    fmt: (v, item) => { const r = _daInternalRequisitionCache[item.document_id]; return r && typeof _invStoreLabel === 'function' ? _invStoreLabel(r.to_store_id) : '—'; } },
  { label: 'Request Date', key: 'document_id', hideWhen: item => item.document_type !== 'internal_requisition',
    fmt: (v, item) => { const r = _daInternalRequisitionCache[item.document_id]; return r ? (r.request_date || '—') : '—'; } },
  { label: 'Requisition Reason', key: 'document_id', hideWhen: item => item.document_type !== 'internal_requisition',
    fmt: (v, item) => { const r = _daInternalRequisitionCache[item.document_id]; return r ? (r.reason || '—') : '—'; } },
  { label: 'Notes', key: 'document_id', hideWhen: item => item.document_type !== 'internal_requisition',
    fmt: (v, item) => { const r = _daInternalRequisitionCache[item.document_id]; return (r && r.notes) ? _daEsc(r.notes) : '—'; } },
  { label: 'Full Record', key: 'document_id', hideWhen: item => item.document_type !== 'internal_requisition',
    fmt: (v, item) => `<a href="#" onclick="window._irqOpenId=${item.document_id};loadView('inventory-internal-requisitions');return false;">&rarr; Open Internal Requisition</a>` },
  { label: 'Employee', key: 'document_id', hideWhen: item => item.document_type !== 'employee_advance',
    fmt: (v, item) => { const a = _daAdvanceCache[item.document_id]; return a ? ((typeof _reqStaffLabel === 'function') ? _reqStaffLabel(a.employee_id) : `Employee #${a.employee_id}`) : '—'; } },
  { label: 'Principal', key: 'document_id', hideWhen: item => item.document_type !== 'employee_advance',
    fmt: (v, item) => { const a = _daAdvanceCache[item.document_id]; return a ? _daMoney(a.principal) : '—'; } },
  { label: 'Reason Category', key: 'document_id', hideWhen: item => item.document_type !== 'employee_advance',
    fmt: (v, item) => { const a = _daAdvanceCache[item.document_id]; return a ? (a.reason_category || '—') : '—'; } },
  { label: 'Advance Reason', key: 'document_id', hideWhen: item => item.document_type !== 'employee_advance',
    fmt: (v, item) => { const a = _daAdvanceCache[item.document_id]; return a ? (a.reason || '—') : '—'; } },
  { label: 'Repayment Type', key: 'document_id', hideWhen: item => item.document_type !== 'employee_advance',
    fmt: (v, item) => { const a = _daAdvanceCache[item.document_id]; if (!a) return '—'; return a.repayment_type === 'installments' ? `Installments (${a.installment_count || '—'})` : 'Lump-sum'; } },
  { label: 'Notes', key: 'document_id', hideWhen: item => item.document_type !== 'employee_advance',
    fmt: (v, item) => { const a = _daAdvanceCache[item.document_id]; return (a && a.notes) ? _daEsc(a.notes) : '—'; } },
  { label: 'Full Record', key: 'document_id', hideWhen: item => item.document_type !== 'employee_advance',
    fmt: (v, item) => `<a href="#" onclick="window._advOpenId=${item.document_id};loadView('payroll-salary-advances');return false;">&rarr; Open Advance</a>` },
  { label: 'Status',        key: 'status',        fmt: v => _daBadge(v) },
  { label: 'Submitted By',  key: 'submitted_by',  fmt: v => v != null ? `Staff #${v}` : '—' },
  { label: 'Submitted At',  key: 'submitted_at',  fmt: v => _daDate(v) },
  { label: 'Approved By',   key: 'approved_by',   fmt: v => v != null ? `Staff #${v}` : '—' },
  { label: 'Approved At',   key: 'approved_at',   fmt: v => _daDate(v) },
  { label: 'Rejection Reason', key: 'rejection_reason', fmt: v => v || '—' },
  { label: 'Notes',         key: 'notes',         fmt: v => v || '—' },
  { label: 'Requisition Lines', key: 'document_id', fullWidth: true, hideWhen: item => item.document_type !== 'requisition',
    fmt: (v, item) => _daRequisitionLinesHtml(item.document_id) },
  { label: 'Internal Requisition Lines', key: 'document_id', fullWidth: true, hideWhen: item => item.document_type !== 'internal_requisition',
    fmt: (v, item) => _daInternalRequisitionLinesHtml(item.document_id) },
  { label: 'Document Notes', key: 'document_id', fullWidth: true, hideWhen: item => !['requisition', 'petty_cash'].includes(item.document_type),
    fmt: (v, item) => {
      const c = item.document_type === 'requisition' ? _daRequisitionCache[item.document_id] : _daPettyCashCache[item.document_id];
      return (c && c.notes) ? _daEsc(c.notes) : '—';
    } },
];

function _daDetailActions(item) {
  window._daCurrentItem = item;
  const hydrationFailed = ['requisition', 'petty_cash', 'internal_requisition', 'employee_advance'].includes(item.document_type) && _daHydrationFailed[`${item.document_type}:${item.document_id}`];
  const failBanner = hydrationFailed ? `
    <div style="width:100%;background:var(--coral-100,#FDEAEA);border:1px solid var(--coral-500,#D94040);color:var(--coral-600,#B03030);border-radius:6px;padding:10px 14px;font-size:0.85rem;margin-bottom:10px;">
      Could not load the source document. It may have been deleted.
    </div>` : '';

  if (item.status !== 'pending') {
    return `<div style="color:var(--grey-600);font-size:0.9rem;">This item has already been ${_daEsc(item.status)}.</div>`;
  }
  const isSubmitter = currentUser && item.submitted_by != null && String(currentUser.id) === String(item.submitted_by);
  let html = failBanner;
  if (hydrationFailed) {
    // approving/rejecting a document that failed to hydrate would just 404
    // server-side, so the buttons stay off rather than let the operator hit that.
  } else if (isSubmitter) {
    html += `<div style="width:100%;color:var(--color-danger);font-size:0.85rem;margin-bottom:8px;">You submitted this document — segregation of duties means you cannot approve or reject it yourself.</div>`;
  } else {
    html += `<button class="btn" onclick="_daApprove()">Approve</button>`;
  }
  if (!hydrationFailed) html += `<button class="fin-btn-cancel" onclick="_daReject()">Reject</button>`;
  return `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">${html}</div>`;
}

// ── Modals (mirrors the reason/notes modal pattern already used in payables.js) ──
function _daShowNotesModal(title, bodyHtml, onConfirm) {
  const wrap = document.createElement('div');
  wrap.id = 'da-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:440px;max-width:92vw;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">${_daEsc(title)}</h3>
      ${bodyHtml || ''}
      <label class="fin-form-label" style="display:block;margin-top:10px;">Notes (optional)</label>
      <textarea id="da-modal-notes" class="fin-form-textarea" rows="3" placeholder="Add a note..."></textarea>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('da-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" id="da-modal-confirm-btn">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('da-modal-confirm-btn').onclick = () => {
    const notes = document.getElementById('da-modal-notes').value.trim();
    wrap.remove();
    onConfirm(notes);
  };
}

function _daShowReasonModal(title, onConfirm) {
  const wrap = document.createElement('div');
  wrap.id = 'da-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:420px;max-width:92vw;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">${_daEsc(title)}</h3>
      <label class="fin-form-label" style="display:block;margin-bottom:6px;">Reason <span class="fin-required">*</span></label>
      <textarea id="da-modal-reason" class="fin-form-textarea" rows="4" placeholder="Enter reason..."></textarea>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('da-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" id="da-modal-reason-confirm-btn">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('da-modal-reason-confirm-btn').onclick = () => {
    const reason = document.getElementById('da-modal-reason').value.trim();
    if (!reason) { showToast('Reason is required.', 'error'); return; }
    wrap.remove();
    onConfirm(reason);
  };
}

// ── Approve modal variant with an extra validated widget (editable qty
// table / approved-amount input) — no other modal in the codebase combines
// an editable input with pre-confirm validation, so this is new rather than
// an extension of _daShowNotesModal (which stays untouched for the four
// original document types, per the addendum's defensive-callout list). ──
function _daShowApproveModal(title, bodyHtml, extraHtml, opts) {
  const wrap = document.createElement('div');
  wrap.id = 'da-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:${opts.width || 480}px;max-width:92vw;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">${_daEsc(title)}</h3>
      ${bodyHtml || ''}
      ${extraHtml || ''}
      <div id="da-approve-extra-err" style="display:none;padding:8px 10px;border-radius:6px;background:var(--coral-100,#FDEAEA);color:var(--coral-600,#B03030);font-size:0.82rem;margin-top:8px;"></div>
      <label class="fin-form-label" style="display:block;margin-top:10px;">Notes (optional)</label>
      <textarea id="da-modal-notes" class="fin-form-textarea" rows="3" placeholder="Add a note..."></textarea>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('da-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" id="da-modal-confirm-btn">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const confirmBtn = document.getElementById('da-modal-confirm-btn');
  function revalidate() {
    const { valid, reason } = opts.validate ? opts.validate() : { valid: true };
    confirmBtn.disabled = !valid;
    confirmBtn.style.opacity = valid ? '1' : '0.5';
    const errEl = document.getElementById('da-approve-extra-err');
    if (!valid && reason) { errEl.textContent = reason; errEl.style.display = 'block'; }
    else { errEl.style.display = 'none'; }
  }
  if (typeof opts.wireEvents === 'function') opts.wireEvents(revalidate);
  revalidate();

  confirmBtn.onclick = () => {
    if (confirmBtn.disabled) return;
    const notes = document.getElementById('da-modal-notes').value.trim();
    const extra = opts.buildExtra ? opts.buildExtra() : null;
    wrap.remove();
    opts.onConfirm(notes, extra);
  };
}

// Approve body composer (§6.2 of the addendum) — the single place that
// decides which optional field the approve POST carries. Never sets both
// line_adjustments and approved_amount, and never touches the payload for
// the four original document types (which only ever send {notes}).
function _daBuildApproveBody(documentType, notes, extra) {
  const body = { notes: notes || null };
  if (documentType === 'internal_requisition' && Array.isArray(extra) && extra.length) {
    body.line_adjustments = extra;
  } else if (documentType === 'employee_advance' && extra != null) {
    body.approved_amount = extra;
  }
  return body;
}

// ── Internal Requisition — editable Approved Qty per line (§2.5) ─────────
function _daBuildIrqApproveExtraHtml(r) {
  const lines = r.lines || [];
  const rows = lines.map(l => `
    <tr>
      <td>${_daEsc((typeof _invItemLabel === 'function') ? _invItemLabel(l.item_id) : `#${l.item_id}`)}</td>
      <td style="text-align:right;">${parseFloat(l.requested_quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
      <td><input type="number" class="fin-li-input" data-irq-line-id="${l.id}" data-requested="${l.requested_quantity}" step="0.001" min="0" max="${l.requested_quantity}" value="${l.requested_quantity}" style="width:100px;"></td>
    </tr>`).join('');
  return `
    <div class="fin-section-label" style="margin-top:6px;">Approve Quantities</div>
    <div class="fin-table-wrap"><table class="fin-li-table">
      <thead><tr><th>Item</th><th>Requested</th><th>Approved Qty</th></tr></thead>
      <tbody id="da-irq-approve-lines">${rows}</tbody>
    </table></div>
    <div style="font-size:12px;color:#888;margin-top:6px;">Setting a line to 0 rejects that line. The header will still approve; the rejected line will be dropped from the resulting Stock Transfer.</div>`;
}
function _daIrqValidate() {
  const inputs = Array.from(document.querySelectorAll('#da-irq-approve-lines input[data-irq-line-id]'));
  if (!inputs.length) return { valid: true };
  let allZero = true;
  for (const inp of inputs) {
    const v = parseFloat(inp.value);
    const max = parseFloat(inp.dataset.requested);
    if (isNaN(v) || v < 0 || v > max) return { valid: false, reason: 'Approved quantity must be between 0 and the requested quantity for every line.' };
    if (v > 0) allZero = false;
  }
  if (allZero) return { valid: false, reason: 'Cannot approve with zero quantities across all lines. Reject the requisition instead.' };
  return { valid: true };
}
function _daIrqBuildExtra() {
  const inputs = Array.from(document.querySelectorAll('#da-irq-approve-lines input[data-irq-line-id]'));
  const adjustments = [];
  inputs.forEach(inp => {
    const requested = String(inp.dataset.requested).trim();
    const val = String(inp.value).trim();
    if (val !== requested) {
      adjustments.push({ line_id: parseInt(inp.dataset.irqLineId), approved_quantity: val });
    }
  });
  return adjustments.length ? adjustments : null;
}

// ── Employee Advance — Approved Amount trim input (§2.6) ─────────────────
function _daBuildAdvanceApproveExtraHtml(a) {
  return `
    <div class="fin-form-group" style="margin-top:10px;">
      <label class="fin-form-label">Approved Amount (KES)</label>
      <input type="number" id="da-adv-approved-amount" class="fin-form-input" step="0.01" min="0.01" max="${a.principal}" value="${a.principal}">
      <div style="font-size:12px;color:#888;margin-top:4px;">You can approve the full requested principal, or trim it. The installment amount (if applicable) will be recomputed to approved_amount &divide; installment_count.</div>
    </div>`;
}
function _daAdvanceValidate(principal) {
  const el = document.getElementById('da-adv-approved-amount');
  if (!el) return { valid: true };
  const v = parseFloat(el.value);
  if (isNaN(v) || v <= 0) return { valid: false, reason: 'Approved amount must be > 0.' };
  if (v > parseFloat(principal)) return { valid: false, reason: 'Approved amount cannot exceed the requested principal.' };
  return { valid: true };
}

async function _daHandleActionError(res) {
  // Surface the backend's own detail verbatim (403 SoD, 409 wrong-lifecycle-
  // state, etc.) rather than a hardcoded generic message — the operator needs
  // to know exactly what happened, not a paraphrase of it.
  const detail = await parseApiError(res);
  showToast(detail, 'error');
  if (res.status === 409) await _daRefreshCurrent();
}

async function _daRefreshCurrent() {
  if (typeof window._splitRefreshSelected === 'function') await window._splitRefreshSelected();
}

// Shared link-out from Requisitions/Petty Cash status hints (and anywhere
// else) into the DAS "All Approvals" view, pre-filtered to pending items of
// one document type — keeps the target in one place if the DAS route moves.
function openDasQueueForType(documentType) {
  _daAllFilters = { document_type: documentType, status: 'pending' };
  loadView('document-approvals-all');
}

async function _daApprove() {
  const item = window._daCurrentItem;
  if (!item) return;
  const id = item.id;
  const type = item.document_type;

  if (type === 'internal_requisition') {
    const r = _daInternalRequisitionCache[item.document_id];
    if (!r) { showToast('Could not load the requisition — try again.', 'error'); return; }
    const fromLabel = (typeof _invStoreLabel === 'function') ? _invStoreLabel(r.from_store_id) : `Store #${r.from_store_id}`;
    const toLabel = (typeof _invStoreLabel === 'function') ? _invStoreLabel(r.to_store_id) : `Store #${r.to_store_id}`;
    const n = (r.lines || []).length;
    const bodyHtml = `<p style="font-size:13px;color:var(--grey-600,#5F6B7C);margin:0 0 6px;">Approve requisition <strong>${_daEsc(r.requisition_number || `#${item.document_id}`)}</strong> from ${_daEsc(toLabel)} for ${n} line${n === 1 ? '' : 's'}? A draft Stock Transfer will be created for ${_daEsc(fromLabel)} to post.</p>`;
    _daShowApproveModal('Approve Internal Requisition', bodyHtml, _daBuildIrqApproveExtraHtml(r), {
      validate: () => _daIrqValidate(),
      wireEvents: (revalidate) => {
        document.querySelectorAll('#da-irq-approve-lines input[data-irq-line-id]').forEach(inp => inp.addEventListener('input', revalidate));
      },
      buildExtra: () => _daIrqBuildExtra(),
      onConfirm: async (notes, extra) => {
        const res = await apiFetch(`${_DA_API}${id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(_daBuildApproveBody(type, notes, extra)),
        });
        if (!res) return;
        if (res.ok) { showToast('Approved.', 'success'); await _daRefreshCurrent(); }
        else await _daHandleActionError(res);
      },
    });
    return;
  }

  if (type === 'employee_advance') {
    const a = _daAdvanceCache[item.document_id];
    if (!a) { showToast('Could not load the advance — try again.', 'error'); return; }
    const employeeName = (typeof _reqStaffLabel === 'function') ? _reqStaffLabel(a.employee_id) : `Employee #${a.employee_id}`;
    const installmentNote = (a.repayment_type === 'installments' && a.installment_count)
      ? `, ${a.installment_count} installments of ${_daMoney(Number(a.principal) / a.installment_count)}` : '';
    const bodyHtml = `<p style="font-size:13px;color:var(--grey-600,#5F6B7C);margin:0 0 6px;">Approve advance <strong>${_daEsc(a.advance_number || `#${item.document_id}`)}</strong> for ${_daEsc(employeeName)}, ${_daMoney(a.principal)} (${_daEsc(a.repayment_type)}${installmentNote})? The employee will need a disbursement PV before funds move.</p>`;
    _daShowApproveModal('Approve Employee Advance', bodyHtml, _daBuildAdvanceApproveExtraHtml(a), {
      validate: () => _daAdvanceValidate(a.principal),
      wireEvents: (revalidate) => {
        document.getElementById('da-adv-approved-amount')?.addEventListener('input', revalidate);
      },
      buildExtra: () => {
        const el = document.getElementById('da-adv-approved-amount');
        const val = (el?.value || '').trim();
        return (val && val !== String(a.principal).trim()) ? val : null;
      },
      onConfirm: async (notes, extra) => {
        const res = await apiFetch(`${_DA_API}${id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(_daBuildApproveBody(type, notes, extra)),
        });
        if (!res) return;
        if (res.ok) { showToast('Approved.', 'success'); await _daRefreshCurrent(); }
        else await _daHandleActionError(res);
      },
    });
    return;
  }

  let title = 'Approve Document';
  let bodyHtml = '';

  if (type === 'requisition') {
    const r = _daRequisitionCache[item.document_id];
    const supplierName = (r && typeof _reqSupplierName === 'function') ? _reqSupplierName(r.supplier_id) : '—';
    title = 'Approve Requisition';
    bodyHtml = `<p style="font-size:13px;color:var(--grey-600,#5F6B7C);margin:0 0 14px;">Approve requisition <strong>${_daEsc(r?.requisition_no || `#${item.document_id}`)}</strong> from ${_daEsc(supplierName)}? Total ${_daMoney(r?.total)}.</p>`;
  } else if (type === 'petty_cash') {
    const p = _daPettyCashCache[item.document_id];
    const applicantName = (p && typeof _reqStaffLabel === 'function') ? _reqStaffLabel(p.applicant_id) : (p ? `Employee #${p.applicant_id}` : '—');
    title = 'Approve Petty Cash Application';
    bodyHtml = `<p style="font-size:13px;color:var(--grey-600,#5F6B7C);margin:0 0 14px;">Approve petty cash application from ${_daEsc(applicantName)} for ${_daMoney(p?.requested_amount)}?</p>`;
  } else {
    // payment_voucher / fee_invoice — unchanged surcharge-policy note. Look up
    // the active policy up front since the surcharge auto-applies server-side.
    try {
      const res = await apiFetch(`${_DA_API}surcharge-policy`);
      if (res && res.ok) {
        const policy = await res.json().catch(() => null);
        if (policy && policy.is_active) {
          bodyHtml = `<p style="font-size:13px;color:var(--grey-600,#5F6B7C);margin:0 0 14px;">
            If this is an overdue Fee Invoice, approving it will automatically add a
            <strong>${policy.surcharge_percent}%</strong> late-payment surcharge line item
            (grace period: ${policy.grace_period_days} day${policy.grace_period_days === 1 ? '' : 's'}).
          </p>`;
        }
      }
    } catch (_) {}
  }

  _daShowNotesModal(title, bodyHtml, async (notes) => {
    const res = await apiFetch(`${_DA_API}${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes || null })
    });
    if (!res) return;
    if (res.ok) { showToast('Approved.', 'success'); await _daRefreshCurrent(); }
    else await _daHandleActionError(res);
  });
}

async function _daReject() {
  const item = window._daCurrentItem;
  if (!item) return;
  const id = item.id;
  _daShowReasonModal('Reject Document', async (reason) => {
    const res = await apiFetch(`${_DA_API}${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res) return;
    if (res.ok) { showToast('Rejected.', 'success'); await _daRefreshCurrent(); }
    else await _daHandleActionError(res);
  });
}

async function _daSyncOverdue() {
  const res = await apiFetch(`${_DA_API}sync-overdue`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    const queued = data.queued ?? data.count ?? data.synced ?? null;
    showToast(queued != null ? `Synced ${queued} overdue invoice(s) into the queue.` : 'Overdue invoices synced.', 'success');
    await _daRenderQueueSplit(document.getElementById('da-split-mount'));
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

async function _daExportPv() {
  await authBlobDownload(`${_DA_API}export/payment-vouchers`, 'payment-vouchers-export.xlsx', {
    onError: async () => showToast('Could not export.', 'error'),
  });
}

// ==================== SURCHARGE POLICY ====================

async function loadDaSurchargePolicyView(container) {
  container.innerHTML = `<div class="fin-page"><p class="sa-loading">Loading&#8230;</p></div>`;
  let policy = null;
  try {
    const res = await apiFetch(`${_DA_API}surcharge-policy`);
    if (res && res.ok) policy = await res.json().catch(() => null);
  } catch (_) {}

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Surcharge Policy</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Document Approvals &rsaquo; Surcharge Policy
        </div>
      </div>
      <p style="font-size:13.5px;color:var(--grey-600,#5F6B7C);max-width:680px;margin:-6px 0 20px;">
        When active, approving an overdue Fee Invoice automatically adds a late-payment
        surcharge line item once its grace period has elapsed.
      </p>
      <div class="fin-form-wrap">
        <div class="fin-form-group">
          <label class="fin-form-label">Surcharge Percent (%) <span class="fin-required">*</span></label>
          <input type="number" step="0.01" min="0" id="da-sp-percent" class="fin-form-input" value="${policy ? _daEsc(policy.surcharge_percent) : ''}">
          <span class="fin-field-error" id="da-sp-percent-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Grace Period (days) <span class="fin-required">*</span></label>
          <input type="number" step="1" min="0" id="da-sp-grace" class="fin-form-input" value="${policy ? _daEsc(policy.grace_period_days) : ''}">
          <span class="fin-field-error" id="da-sp-grace-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">
            <input type="checkbox" id="da-sp-active" ${!policy || policy.is_active ? 'checked' : ''}> Active
          </label>
        </div>
        <div class="fin-form-actions">
          ${canEdit('document_approval') ? `<button class="fin-btn-teal" onclick="_daSaveSurchargePolicy()">Save Policy</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

async function _daSaveSurchargePolicy() {
  const percentEl = document.getElementById('da-sp-percent');
  const graceEl = document.getElementById('da-sp-grace');
  const percentErr = document.getElementById('da-sp-percent-err');
  const graceErr = document.getElementById('da-sp-grace-err');
  percentErr.textContent = ''; graceErr.textContent = '';

  const percent = percentEl.value === '' ? NaN : Number(percentEl.value);
  const grace = graceEl.value === '' ? NaN : Number(graceEl.value);
  let valid = true;
  if (isNaN(percent) || percent < 0) { percentErr.textContent = 'Enter a valid percentage.'; valid = false; }
  if (isNaN(grace) || grace < 0) { graceErr.textContent = 'Enter a valid number of days.'; valid = false; }
  if (!valid) return;

  const payload = {
    surcharge_percent: percent,
    grace_period_days: grace,
    is_active: document.getElementById('da-sp-active').checked,
  };
  const res = await apiFetch(`${_DA_API}surcharge-policy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res) return;
  if (res.ok) showToast('Surcharge policy saved.', 'success');
  else showToast(await parseApiError(res), 'error');
}
