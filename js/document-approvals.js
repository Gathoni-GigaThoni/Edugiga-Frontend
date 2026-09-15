// ==================== DOCUMENT APPROVAL SYSTEM ====================
// Approval workflow for seven polymorphic document types: Payment Vouchers
// (payables.js already has its own direct submit/approve/reject actions on
// /payables/payment-vouchers/{id}/... — this module is the cross-cutting
// queue that additionally covers overdue Fee Invoices, which have no other
// approval path), overdue Fee Invoices, Requisitions, Petty Cash
// Applications, Internal (inventory) Requisitions and Employee Salary
// Advances. As of 2026-08-10 the in-module approve/reject endpoints for
// Requisitions/Petty Cash were removed server-side (404) — this is now
// their only approval path; Internal Requisitions and Employee Advances
// (added 2026-08-11) never had one. Founder's Discount grants (2026-09-15)
// are mirrored in from the grant's own Approvals Inbox; approving or rejecting
// on either surface closes both. DocumentApproval only stores a
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
  founder_discount:      "Founder's Discount",
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
  // Pale gold fill — same tone the Founder's Discounts page uses for its own
  // notices, and unlike the solid-gold Fee Invoice / gold-ghost Advance pills.
  founder_discount:      'background:var(--gold-100,#F7EFD5);color:#6b5400;',
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
let _daFounderDiscountCache = {};
// grant id → the /preview result for that grant (see _founderFetchPreview).
let _daFounderDiscountPreview = {};
// "founder_discount:<id>" keys whose GET answered 403. The grant GET takes
// finance.setup or finance.cancellations and DAS approvers only need
// document_approval, so a 403 means "you can't see the grant", not "it's gone".
// Kept apart from _daHydrationFailed so Approve/Reject stay available.
let _daFounderDiscountHidden = {};
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
  // Not filtered against the cache: a grant is edited in place on the Founder's
  // Discounts page, and an edit that sends it back to Pending re-queues the same
  // grant id, so a cached copy would show the old amount. The list endpoint has
  // no id filter (checked 2026-09-15), so this is one GET per grant.
  const fdIds = [...new Set(items.filter(i => i.document_type === 'founder_discount').map(i => i.document_id))];
  // Billing can change between visits, so the KES breakdown is re-read too.
  if (fdIds.length && typeof _founderPreviewByKey !== 'undefined') _founderPreviewByKey = {};

  const jobs = [];
  if (reqIds.length && typeof _reqEnsureSuppliersCache === 'function') jobs.push(_reqEnsureSuppliersCache());
  if ((reqIds.length || pcaIds.length || advIds.length) && typeof _reqEnsureStaffCache === 'function') jobs.push(_reqEnsureStaffCache());
  if (intReqIds.length && typeof _invEnsureStoresCache === 'function') jobs.push(_invEnsureStoresCache());
  // Names come from the finance lookups, which answer to the same two keys as
  // the grant GET. Without either, loadLookupList would toast one 403 per lookup
  // and the grant itself can't be read anyway, so they aren't requested.
  if (fdIds.length && typeof _rcvLoadLookups === 'function' && (canView('finance.setup') || canView('finance.cancellations'))) {
    jobs.push(_rcvLoadLookups({ items: true, students: true, academicYears: true }));
  }
  fdIds.forEach(id => jobs.push(_daFetchFounderDiscount(id)));
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

// One grant, read on every queue load (see fdIds above) and again after an
// approve/reject, so the detail pane shows the status the action left behind.
async function _daFetchFounderDiscount(id) {
  const key = `founder_discount:${id}`;
  try {
    const res = await apiFetch(`${API_BASE}/receivables/setup/founder-discounts/${id}`);
    if (!res) return;
    delete _daHydrationFailed[key];
    delete _daFounderDiscountHidden[key];
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data) {
        _daFounderDiscountCache[id] = data;
        // The KES the approver is signing off, from the student's billing.
        if (typeof _founderFetchPreview === 'function') _daFounderDiscountPreview[id] = await _founderFetchPreview(data);
      }
      return;
    }
    delete _daFounderDiscountCache[id];
    delete _daFounderDiscountPreview[id];
    if (res.status === 403) _daFounderDiscountHidden[key] = true;
    else _daHydrationFailed[key] = true;
  } catch (_) {
    _daHydrationFailed[key] = true;
  }
}

// { lines, total, count } for a hydrated grant, or null (no grant, or the
// billing preview couldn't be read).
function _daFounderDiscountEstimate(documentId) {
  const g = _daFounderDiscountCache[documentId];
  if (!g || typeof _founderValueFromPreview !== 'function') return null;
  return _founderValueFromPreview(g, _daFounderDiscountPreview[documentId]);
}

// founder-discounts.js is loaded on every staff page, so its label helper is
// normally there; the fallback is the same wording.
function _daFounderDiscountLabel(g) {
  if (typeof _founderDiscountLabel === 'function') return _founderDiscountLabel(g);
  if (g.discount_amount != null) return `KES ${_daMoney(g.discount_amount)}`;
  if (g.discount_percent != null) return `${parseFloat(g.discount_percent)}%`;
  return '—';
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
  if (item.document_type === 'founder_discount') {
    const g = _daFounderDiscountCache[item.document_id];
    if (!g) return { title: `Founder's Discount #${item.document_id}`, sub: '', amount: null };
    const studentName = (typeof _rcvStudentName === 'function') ? _rcvStudentName(g.student_id) : `Student #${g.student_id}`;
    const feeItemName = (typeof _rcvFeeItemName === 'function') ? _rcvFeeItemName(g.fee_item_id) : `Fee Item #${g.fee_item_id}`;
    const yearName = (typeof _founderYearName === 'function') ? _founderYearName(g.academic_year_id) : `Academic Year #${g.academic_year_id}`;
    const est = _daFounderDiscountEstimate(item.document_id);
    const worth = est && est.count ? `${_daFounderDiscountLabel(g)} = ${_founderValueSpan(est)}` : _daFounderDiscountLabel(g);
    return { title: [g.reason, studentName, feeItemName, worth].join(' · '), sub: yearName, amount: est && est.count ? est.total : g.discount_amount };
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
    <div id="da-founder-legacy-banner" style="padding:0 4px;"></div>
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
  _daRenderFounderLegacyBanner(queueItems);

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
    rowLabel: item => _daEsc(_daResolveDoc(item).title),
    rowSub: item => `${_daEsc(_daTypeLabel(item.document_type))} — ${_daEsc(_daResolveDoc(item).sub)}`,
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

// Grants that went Pending, or were saved as Draft, before founder's discounts
// were mirrored into DAS (2026-09-15) have no approval row, so they never reach
// this queue. Until the BE backfills them, name them and say where they can be
// approved. Reads the grant list, which document_approval can read; if the
// list can't be read the banner stays off. It clears itself once every open
// grant has a queue row.
async function _daRenderFounderLegacyBanner(queueItems) {
  const el = document.getElementById('da-founder-legacy-banner');
  if (!el) return;
  const queued = new Set(queueItems.filter(i => i.document_type === 'founder_discount').map(i => String(i.document_id)));
  const finance = canView('finance.setup') || canView('finance.cancellations');
  const [lists] = await Promise.all([
    Promise.all(['pending', 'draft'].map(status =>
      apiFetch(`${API_BASE}/receivables/setup/founder-discounts?status=${status}&is_active=true`)
        .then(res => (res && res.ok ? res.json().catch(() => null) : null))
        .catch(() => null))),
    finance && typeof _rcvLoadLookups === 'function' ? _rcvLoadLookups({ items: true, students: true, academicYears: true }) : null,
  ]);
  if (!el.isConnected || lists.every(l => l == null)) return;
  const missing = lists.flatMap(l => _toArray(l || [])).filter(g => !queued.has(String(g.id)));
  if (!missing.length) { el.innerHTML = ''; return; }
  const n = missing.length;
  const name = (fn, id) => (typeof fn === 'function' ? fn(id) : `#${id}`);
  const shown = missing.slice(0, 10).map(g => `<li>${_daEsc(name(_rcvStudentName, g.student_id))} &middot; ${_daEsc(name(_rcvFeeItemName, g.fee_item_id))} &middot; ${_daEsc(name(_founderYearName, g.academic_year_id))} &middot; ${_daEsc(_daFounderDiscountLabel(g))} (${_daEsc(g.status)})</li>`).join('');
  el.innerHTML = `
    <div style="background:var(--gold-100,#F7EFD5);border-left:3px solid var(--gold-500,#C9A227);color:#6b5400;border-radius:6px;padding:10px 14px;margin-bottom:10px;font-size:0.85rem;line-height:1.5;">
      <strong>${n} founder's discount grant${n === 1 ? ' is' : 's are'} waiting for approval but ${n === 1 ? 'is' : 'are'} not in this queue.</strong>
      ${n === 1 ? 'It was' : 'They were'} created before founder's discounts were routed through Document Approvals, so no approval row exists yet.
      ${finance
        ? `Approve ${n === 1 ? 'it' : 'them'} from <a href="#" onclick="loadView('finance-founder-discounts');return false;">Founder's Discounts</a> until ${n === 1 ? 'it is' : 'they are'} synced here.`
        : "A finance approver can clear them from Founder's Discounts until they are synced here."}
      <ul style="margin:6px 0 0 18px;padding:0;">${shown}${n > 10 ? `<li>and ${n - 10} more</li>` : ''}</ul>
    </div>`;
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
          <option value="founder_discount" ${_daAllFilters.document_type === 'founder_discount' ? 'selected' : ''}>Founder's Discount</option>
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
    rowLabel: item => _daEsc(_daResolveDoc(item).title),
    rowSub: item => `${_daEsc(_daTypeLabel(item.document_type))} — ${_daEsc(_daResolveDoc(item).sub)}`,
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
  { label: 'Student', key: 'document_id', hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountCache[item.document_id],
    fmt: (v, item) => { const g = _daFounderDiscountCache[item.document_id]; return _daEsc((typeof _rcvStudentName === 'function') ? _rcvStudentName(g.student_id) : `Student #${g.student_id}`); } },
  { label: 'Fee Item', key: 'document_id', hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountCache[item.document_id],
    fmt: (v, item) => { const g = _daFounderDiscountCache[item.document_id]; return _daEsc((typeof _rcvFeeItemName === 'function') ? _rcvFeeItemName(g.fee_item_id) : `Fee Item #${g.fee_item_id}`); } },
  { label: 'Academic Year', key: 'document_id', hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountCache[item.document_id],
    fmt: (v, item) => { const g = _daFounderDiscountCache[item.document_id]; return _daEsc((typeof _founderYearName === 'function') ? _founderYearName(g.academic_year_id) : `Academic Year #${g.academic_year_id}`); } },
  { label: 'Discount', key: 'document_id', hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountCache[item.document_id],
    fmt: (v, item) => _daEsc(_daFounderDiscountLabel(_daFounderDiscountCache[item.document_id])) },
  { label: 'Amount Being Approved', key: 'document_id', fullWidth: true,
    hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountCache[item.document_id] || typeof _founderValueBreakdownHtml !== 'function',
    fmt: (v, item) => _founderValueBreakdownHtml(_daFounderDiscountCache[item.document_id], _daFounderDiscountPreview[item.document_id]) },
  { label: 'Grant Status', key: 'document_id', hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountCache[item.document_id],
    fmt: (v, item) => { const g = _daFounderDiscountCache[item.document_id]; return (typeof _founderStatusBadge === 'function') ? _founderStatusBadge(g) : _daEsc(g.status); } },
  { label: 'Grant Created By', key: 'document_id', hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountCache[item.document_id],
    fmt: (v, item) => { const g = _daFounderDiscountCache[item.document_id]; return g.created_by != null ? `Staff #${_daEsc(g.created_by)}` : '—'; } },
  { label: 'Grant Reason', key: 'document_id', fullWidth: true, hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountCache[item.document_id],
    fmt: (v, item) => _daEsc(_daFounderDiscountCache[item.document_id].reason || '—') },
  { label: 'Grant Notes', key: 'document_id', fullWidth: true, hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountCache[item.document_id],
    fmt: (v, item) => { const g = _daFounderDiscountCache[item.document_id]; return g.notes ? _daEsc(g.notes) : '—'; } },
  { label: 'Full Record', key: 'document_id', hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountCache[item.document_id],
    fmt: (v, item) => `<a href="#" onclick="window._founderOpenGrantId=${parseInt(item.document_id, 10)};loadView('finance-founder-discounts');return false;">&rarr; Open Founder's Discount</a>` },
  { label: 'Grant Details', key: 'document_id', fullWidth: true, hideWhen: item => item.document_type !== 'founder_discount' || !_daFounderDiscountHidden[`founder_discount:${item.document_id}`],
    fmt: () => `<span style="color:var(--grey-600,#5F6B7C);">Your role can't open founder's discount grants (that needs Finance Set-up or Cancellations), so only the approval record is shown. You can still approve or reject it.</span>` },
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

// Copied from the server's 403 detail on purpose — the pre-flight and the
// refusal have to read the same for the audit trail.
const _DA_FOUNDER_SOD_MESSAGE = 'Segregation of duties: a founder-discount grant cannot be approved by its creator.';
// { approvalId, userId, message } from a founder-discount 403, shown inline in
// that row's detail pane for the rest of the page session.
let _daInlineError = null;

// The server refuses the grant's creator (grant.created_by), who isn't always
// the DAS submitter: an edit that sends an approved grant back to Pending is
// submitted by whoever edited it. When the grant can't be read (403), the
// submitter is the best guess, since a create or renew is submitted by the
// creator. The server check stays authoritative either way.
function _daFounderDiscountApproveHtml(item, isSubmitter) {
  const g = _daFounderDiscountCache[item.document_id];
  const isCreator = g
    ? !!(currentUser && g.created_by != null && String(currentUser.id) === String(g.created_by))
    : isSubmitter;
  const refused = _daInlineError && String(_daInlineError.approvalId) === String(item.id)
    && currentUser && String(_daInlineError.userId) === String(currentUser.id);
  if (!isCreator && !refused) return `<button class="btn" onclick="_daApprove()">Approve</button>`;
  return `<div style="width:100%;color:var(--color-danger);font-size:0.85rem;margin-bottom:8px;">${_daEsc(refused ? _daInlineError.message : _DA_FOUNDER_SOD_MESSAGE)}</div>
    <button class="btn" disabled style="opacity:0.5;cursor:not-allowed;" title="${_daEsc(_DA_FOUNDER_SOD_MESSAGE)}">Approve</button>`;
}

function _daDetailActions(item) {
  window._daCurrentItem = item;
  const hydrationFailed = ['requisition', 'petty_cash', 'internal_requisition', 'employee_advance', 'founder_discount'].includes(item.document_type) && _daHydrationFailed[`${item.document_type}:${item.document_id}`];
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
  } else if (item.document_type === 'founder_discount') {
    html += _daFounderDiscountApproveHtml(item, isSubmitter);
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
  const item = window._daCurrentItem;
  if (item && item.document_type === 'founder_discount') {
    // 403 segregation (the grant's creator) stays under the buttons, verbatim.
    // 404: the grant or the approval row is gone, so reload like a 409 does.
    if (res.status === 403 && /segregation/i.test(detail)) {
      _daInlineError = { approvalId: item.id, userId: currentUser?.id, message: detail };
      await _daRefreshCurrent();
      return;
    }
    if (res.status === 404) { await _daRefreshCurrent(); return; }
  }
  if (res.status === 409) await _daRefreshCurrent();
}

async function _daRefreshCurrent() {
  // A grant can change under its row (approved or rejected here, or edited on
  // the Founder's Discounts page), so it is re-read along with the list.
  const item = window._daCurrentItem;
  if (item && item.document_type === 'founder_discount') await _daFetchFounderDiscount(item.document_id);
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
  } else if (type === 'founder_discount') {
    // Notes only: no line_adjustments or approved_amount for a grant.
    const g = _daFounderDiscountCache[item.document_id];
    if (g && currentUser && String(currentUser.id) === String(g.created_by)) { showToast(_DA_FOUNDER_SOD_MESSAGE, 'error'); return; }
    title = "Approve Founder's Discount";
    if (g) {
      const studentName = (typeof _rcvStudentName === 'function') ? _rcvStudentName(g.student_id) : `Student #${g.student_id}`;
      const feeItemName = (typeof _rcvFeeItemName === 'function') ? _rcvFeeItemName(g.fee_item_id) : `Fee Item #${g.fee_item_id}`;
      const yearName = (typeof _founderYearName === 'function') ? _founderYearName(g.academic_year_id) : `Academic Year #${g.academic_year_id}`;
      const est = _daFounderDiscountEstimate(item.document_id);
      const worth = est && est.count ? `, worth <strong>${_daEsc(_founderValueSpan(est))}</strong>,` : '';
      bodyHtml = `<p style="font-size:13px;color:var(--grey-600,#5F6B7C);margin:0 0 10px;">Approve a founder's discount of <strong>${_daEsc(_daFounderDiscountLabel(g))}</strong>${worth} on ${_daEsc(feeItemName)} for ${_daEsc(studentName)} (${_daEsc(yearName)})? Invoices generated from then on pick it up.</p>`
        + (typeof _founderValueBreakdownHtml === 'function'
          ? `<div style="font-size:13px;margin:0 0 12px;">${_founderValueBreakdownHtml(g, _daFounderDiscountPreview[item.document_id])}</div>`
          : '');
    } else {
      bodyHtml = `<p style="font-size:13px;color:var(--grey-600,#5F6B7C);margin:0 0 14px;">Approve founder's discount grant <strong>#${_daEsc(item.document_id)}</strong>? Invoices generated from then on pick it up.</p>`;
    }
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
