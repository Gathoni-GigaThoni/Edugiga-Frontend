// ==================== DOCUMENT APPROVAL SYSTEM ====================
// Approval workflow for two polymorphic document types: Payment Vouchers
// (payables.js already has its own direct submit/approve/reject actions on
// /payables/payment-vouchers/{id}/... — this module is the cross-cutting
// queue that additionally covers overdue Fee Invoices, which have no other
// approval path) and overdue Fee Invoices. DocumentApproval only stores a
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

// ── Resolve the referenced document (payment_voucher | fee_invoice) ────────
// Payment Vouchers have no confirmed single-item GET, so the full collection
// is fetched once and cached; Fee Invoices are fetched one-by-one via the
// confirmed GET /receivables/fee-invoices/{id} (see receivables.js).
let _daPvListCache = null;
let _daFeeInvoiceCache = {};

async function _daPrefetchDocuments(items) {
  const pvNeeded = items.some(i => i.document_type === 'payment_voucher');
  const feeIds = [...new Set(items.filter(i => i.document_type === 'fee_invoice').map(i => i.document_id))]
    .filter(id => !_daFeeInvoiceCache[id]);

  const jobs = [];
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
        .then(res => res && res.ok ? res.json() : null)
        .then(data => { if (data) _daFeeInvoiceCache[id] = data; })
        .catch(() => {})
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
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Document Approvals', view: 'document-approvals-queue' },
      { label: 'Approval Queue' }
    ],
    apiUrl: `${_DA_API}queue`,
    searchFields: [],
    col1Label: 'Document', col2Label: 'Status',
    col1: item => `${_daEsc(_daResolveDoc(item).title)}`,
    col2: () => _daBadge('pending'),
    rowLabel: item => _daResolveDoc(item).title,
    rowSub: item => `${item.document_type === 'payment_voucher' ? 'Payment Voucher' : 'Fee Invoice'} — ${_daResolveDoc(item).sub}`,
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
    breadcrumb: [
      { label: 'Dashboard', view: null },
      { label: 'Document Approvals', view: 'document-approvals-all' },
      { label: 'All Approvals' }
    ],
    apiUrl,
    searchFields: [],
    col1Label: 'Document', col2Label: 'Status',
    col1: item => _daEsc(_daResolveDoc(item).title),
    col2: item => _daBadge(item.status),
    rowLabel: item => _daResolveDoc(item).title,
    rowSub: item => `${item.document_type === 'payment_voucher' ? 'Payment Voucher' : 'Fee Invoice'} — ${_daResolveDoc(item).sub}`,
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

const _daDetailFields = [
  { label: 'Document Type', key: 'document_type', fmt: v => v === 'payment_voucher' ? 'Payment Voucher' : v === 'fee_invoice' ? 'Fee Invoice' : (v || '—') },
  { label: 'Reference',     key: 'document_id',  fmt: (v, item) => _daResolveDoc(item).title },
  { label: 'Amount',        key: 'document_id',  fmt: (v, item) => { const a = _daResolveDoc(item).amount; return a != null ? _daMoney(a) : '—'; } },
  { label: 'Status',        key: 'status',        fmt: v => _daBadge(v) },
  { label: 'Submitted By',  key: 'submitted_by',  fmt: v => v != null ? `Staff #${v}` : '—' },
  { label: 'Submitted At',  key: 'submitted_at',  fmt: v => _daDate(v) },
  { label: 'Approved By',   key: 'approved_by',   fmt: v => v != null ? `Staff #${v}` : '—' },
  { label: 'Approved At',   key: 'approved_at',   fmt: v => _daDate(v) },
  { label: 'Rejection Reason', key: 'rejection_reason', fmt: v => v || '—' },
  { label: 'Notes',         key: 'notes',         fmt: v => v || '—' },
];

function _daDetailActions(item) {
  if (item.status !== 'pending') {
    return `<div style="color:var(--grey-600);font-size:0.9rem;">This item has already been ${_daEsc(item.status)}.</div>`;
  }
  const isSubmitter = currentUser && item.submitted_by != null && String(currentUser.id) === String(item.submitted_by);
  let html = '';
  if (isSubmitter) {
    html += `<div style="width:100%;color:var(--color-danger);font-size:0.85rem;margin-bottom:8px;">You submitted this document — segregation of duties means you cannot approve or reject it yourself.</div>`;
  } else {
    html += `<button class="btn" onclick="_daApprove(${item.id})">Approve</button>`;
  }
  html += `<button class="fin-btn-cancel" onclick="_daReject(${item.id})">Reject</button>`;
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

async function _daHandleActionError(res) {
  if (res.status === 403) { showToast('You cannot act on a document you submitted yourself.', 'error'); return; }
  if (res.status === 409) { showToast('This item has already been processed.', 'error'); await _daRefreshCurrent(); return; }
  showToast(await parseApiError(res), 'error');
}

async function _daRefreshCurrent() {
  if (typeof window._splitRefreshSelected === 'function') await window._splitRefreshSelected();
}

async function _daApprove(id) {
  // Look up the item to know whether to surface the surcharge policy first —
  // renderSplitView doesn't expose selectedItem, so read it back off the DOM's
  // detail fields is unreliable; simplest is to just always show the generic
  // confirm and mention the surcharge policy note when relevant is handled
  // server-side (surcharge auto-applies on approval per spec) — we still warn
  // the user up front by fetching the active policy.
  let policyNote = '';
  try {
    const res = await apiFetch(`${_DA_API}surcharge-policy`);
    if (res && res.ok) {
      const policy = await res.json().catch(() => null);
      if (policy && policy.is_active) {
        policyNote = `<p style="font-size:13px;color:var(--grey-600,#5F6B7C);margin:0 0 14px;">
          If this is an overdue Fee Invoice, approving it will automatically add a
          <strong>${policy.surcharge_percent}%</strong> late-payment surcharge line item
          (grace period: ${policy.grace_period_days} day${policy.grace_period_days === 1 ? '' : 's'}).
        </p>`;
      }
    }
  } catch (_) {}

  _daShowNotesModal('Approve Document', policyNote, async (notes) => {
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

async function _daReject(id) {
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
  const res = await apiFetch(`${_DA_API}export/payment-vouchers`);
  if (!res || !res.ok) { showToast('Could not export.', 'error'); return; }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const filename = match ? decodeURIComponent(match[1]) : 'payment-vouchers-export.xlsx';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
          <button class="fin-btn-teal" onclick="_daSaveSurchargePolicy()">Save Policy</button>
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
