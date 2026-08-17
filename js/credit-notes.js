// ==================== CREDIT NOTES ====================
// FE Alignment Sweep 2026-08-18 — this module previously routed straight to
// loadFinPlaceholderView; the backend has always had the full
// /api/receivables/credit-notes/ lifecycle (confirmed via openapi.json).
// Live shape: CreditNoteRead has no journal_entry_id — applying a credit
// note does not (yet) surface a JE link the way SI/PV/imprest do, so the
// detail view intentionally has no "View JE" row.

const _CN_API = `${API_BASE}/receivables/credit-notes`;

const _CN_STATUS_STYLES = {
  draft:    'background:#f3f4f6;color:#374151',
  pending:  'background:#fef3c7;color:#92400e',
  approved: 'background:#dce8fb;color:#1a5fb4',
  rejected: 'background:#fee2e2;color:#991b1b',
  applied:  'background:#d1fae5;color:#065f46',
};
function _cnStatusBadge(status) {
  const style = _CN_STATUS_STYLES[status] || 'background:#f3f4f6;color:#374151';
  const label = (status || '').replace(/\b\w/g, c => c.toUpperCase());
  return `<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:0.78rem;font-weight:600;${style}">${_finEsc(label || '—')}</span>`;
}

// Fee invoices cache for the create-form picker — same all-invoices-once
// pattern as _pvFetchAllSupplierInvoices in payables.js.
let _cnInvoicesCache = null;
async function _cnFetchAllInvoices() {
  if (_cnInvoicesCache) return _cnInvoicesCache;
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices`);
  _cnInvoicesCache = (res && res.ok) ? _toArray(await res.json()) : [];
  return _cnInvoicesCache;
}
function _cnInvoiceById(id) {
  return (_cnInvoicesCache || []).find(inv => String(inv.id) === String(id)) || null;
}

async function loadFinCreditNotesView(container) {
  await _invLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.receivables',
    title: 'Credit Notes',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-credit-notes'},
      {label:'Credit Notes'}
    ],
    apiUrl: _CN_API,
    searchFields: ['credit_note_number','reason'],
    col1Label: 'Credit Note No', col2Label: 'Student',
    col1: cn => cn.credit_note_number || `#${cn.id}`,
    col2: cn => _invStudentName(cn.student_id) || '—',
    rowLabel: cn => cn.credit_note_number || `#${cn.id}`,
    rowSub:   cn => _invStudentName(cn.student_id) || '',
    idKey: 'id',
    detailFields: [
      {label:'Credit Note No', key:'credit_note_number', fmt:v=>v||'—'},
      {label:'Student', key:'student_id', fmt:v=>_invStudentName(v)},
      {label:'Fee Invoice', key:'fee_invoice_id', fmt:v=>v?`<a href="#" onclick="window._rcvCurrentInvoiceId=${v};loadInvoiceDetailView(document.getElementById('main-content'),${v});return false;">#${v}</a>`:'—'},
      {label:'Amount', key:'amount', fmt:v=>_pvMoney(v)},
      {label:'Reason', key:'reason', fullWidth:true, fmt:v=>v||'—'},
      {label:'Status', key:'status', fmt:v=>_cnStatusBadge(v)},
      {label:'Requires Approval', key:'requires_approval', fmt:v=>v?'Yes':'No'},
      {label:'Approved By', key:'approved_by', hideWhen: cn=>!cn.approved_at, fmt:v=>v!=null?`Staff #${v}`:'—'},
      {label:'Approved At', key:'approved_at', hideWhen: cn=>!cn.approved_at, fmt:v=>_pvDate(v)},
      {label:'Rejection Reason', key:'rejection_reason', fullWidth:true, hideWhen: cn=>cn.status!=='rejected', fmt:v=>v||'—'},
      {label:'Original Receipt', key:'original_receipt_id', fmt:v=>v?`#${v}`:'—'},
      // journal_entry_id shipped live 2026-08-18 (was absent when this module
      // was first built) — link when set; row omitted entirely when null
      // rather than showing a dash, since legacy CNs genuinely have no
      // reversal JE and a dash would imply one is just hidden.
      {label:'Reversal JE', key:'journal_entry_id', hideWhen: cn=>!cn.journal_entry_id, fmt:v=>`<a href="#" onclick="_jeOpenDetail(${v});return false;">View Reversal JE</a>`},
      {label:'Created', key:'created_at', fmt:v=>_pvDate(v)},
    ],
    renderAdd: _pvAddPlaceholder('Credit Note', 'fin-credit-notes-add', 'Issue a credit note against a fee invoice.'),
    onAdd: () => loadView('fin-credit-notes-add'),
    detailActions: _cnDetailActions,
  });
}

function _cnDetailActions(cn) {
  if (cn.status === 'pending') {
    return `<button class="fin-btn-teal" onclick="_cnApprove(${cn.id})">Approve</button>
            <button class="fin-btn-cancel" style="background:var(--coral-500,#D94040);color:#fff;" onclick="_cnOpenRejectModal(${cn.id})">Reject</button>`;
  }
  if (cn.status === 'approved') {
    return `<button class="fin-btn-teal" onclick="_cnOpenApplyModal(${cn.id},'${_finEsc(cn.credit_note_number||('#'+cn.id))}',${cn.amount})">Apply to Invoice</button>`;
  }
  return '';
}

async function _cnApprove(id) {
  const res = await apiFetch(`${_CN_API}/${id}/approve`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    showToast('Credit note approved.', 'success');
    await window._splitRefreshSelected?.();
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

function _cnOpenRejectModal(id) {
  const wrap = document.createElement('div');
  wrap.id = 'cn-reject-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:460px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Reject Credit Note</h3>
      <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
      <textarea id="cn-reject-reason" class="fin-form-textarea" rows="3" placeholder="Enter reason..."></textarea>
      <span class="fin-field-error" id="cn-reject-err"></span>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('cn-reject-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" style="background:var(--coral-500,#D94040);" onclick="_cnSubmitReject(${id})">Reject</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _cnSubmitReject(id) {
  const reason = document.getElementById('cn-reject-reason').value.trim();
  if (!reason) { document.getElementById('cn-reject-err').textContent = 'Reason is required.'; return; }
  const res = await apiFetch(`${_CN_API}/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
  if (!res) return;
  if (res.ok) {
    document.getElementById('cn-reject-modal-overlay')?.remove();
    showToast('Credit note rejected.', 'success');
    await window._splitRefreshSelected?.();
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

function _cnOpenApplyModal(id, cnNumber, amount) {
  const wrap = document.createElement('div');
  wrap.id = 'cn-apply-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:460px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Apply Credit Note</h3>
      <p style="font-size:0.9rem;color:var(--grey-700,#444);line-height:1.5;">
        Apply <strong>${_finEsc(cnNumber)}</strong> (${_pvMoney(amount)}) against its fee invoice? This reduces the invoice balance and cannot be undone.
      </p>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('cn-apply-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" onclick="_cnApply(${id})">Apply</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _cnApply(id) {
  const res = await apiFetch(`${_CN_API}/${id}/apply`, { method: 'POST' });
  document.getElementById('cn-apply-modal-overlay')?.remove();
  if (!res) return;
  if (res.ok) {
    showToast('Credit note applied to invoice.', 'success');
    await window._splitRefreshSelected?.();
  } else {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ── Add form ─────────────────────────────────────────────────────────────
// window._cnPresetInvoiceId — set by the "Issue Credit Note" button on the
// Invoice Detail page (receivables.js) so the picker opens pre-selected;
// cleared after use so navigating back to a blank Add form doesn't reuse it.
let _cnSelectedInvoice = null;

async function loadCreditNoteAddView(container) {
  await _invLoadLookups();
  await _cnFetchAllInvoices();
  _cnSelectedInvoice = null;
  const presetId = window._cnPresetInvoiceId;
  window._cnPresetInvoiceId = null;
  if (presetId) _cnSelectedInvoice = _cnInvoiceById(presetId);

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Credit Note</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-credit-notes');return false;">Credit Notes</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div class="fin-form-group">
          <label class="fin-form-label">Fee Invoice <span class="fin-required">*</span></label>
          <input type="text" id="cn-f-invoice-search" class="fin-form-input" placeholder="Search by invoice number or student&#8230;" oninput="_cnInvoiceSearch(this.value)">
          <div id="cn-f-invoice-results" style="max-height:220px;overflow:auto;border:1px solid #eee;border-radius:6px;margin-top:6px;display:none;"></div>
          <div id="cn-f-invoice-selected" style="margin-top:8px;"></div>
          <span class="fin-field-error" id="cn-f-invoice-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Amount (KES) <span class="fin-required">*</span></label>
          <input type="number" id="cn-f-amount" class="fin-form-input" step="0.01" min="0.01">
          <span class="fin-field-error" id="cn-f-amount-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
          <textarea id="cn-f-reason" class="fin-form-textarea" rows="3"></textarea>
          <span class="fin-field-error" id="cn-f-reason-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Original Receipt ID</label>
          <input type="number" id="cn-f-receipt" class="fin-form-input" min="1">
          <span style="font-size:11px;color:var(--grey-500,#888);">Optional — link this credit note to the receipt it refunds.</span>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_cnSubmitAdd()">Save</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-credit-notes')">Cancel</button>
        </div>
      </div>
    </div>`;
  _cnRenderSelectedInvoice();
}

function _cnInvoiceSearch(term) {
  const t = (term || '').toLowerCase().trim();
  const resultsEl = document.getElementById('cn-f-invoice-results');
  if (!resultsEl) return;
  if (!t) { resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; return; }
  const filtered = (_cnInvoicesCache || []).filter(inv => {
    if (inv.status === 'cancelled') return false;
    return (inv.invoice_number || '').toLowerCase().includes(t) || (_invStudentName(inv.student_id) || '').toLowerCase().includes(t);
  }).slice(0, 30);
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = filtered.length
    ? filtered.map(inv => {
        const bal = (parseFloat(inv.amount_due)||0) - (parseFloat(inv.amount_paid)||0);
        return `<div style="padding:8px 12px;border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="_cnPickInvoice(${inv.id})">
          <strong>${_finEsc(inv.invoice_number || ('#'+inv.id))}</strong> — ${_finEsc(_invStudentName(inv.student_id))}
          <span style="float:right;color:#888;">Bal ${_pvMoney(bal)}</span>
        </div>`;
      }).join('')
    : `<div style="padding:12px;color:#888;">No matching invoices.</div>`;
}
function _cnPickInvoice(invoiceId) {
  _cnSelectedInvoice = _cnInvoiceById(invoiceId);
  const search = document.getElementById('cn-f-invoice-search');
  const results = document.getElementById('cn-f-invoice-results');
  if (search) search.value = '';
  if (results) { results.style.display = 'none'; results.innerHTML = ''; }
  _cnRenderSelectedInvoice();
}
function _cnRenderSelectedInvoice() {
  const el = document.getElementById('cn-f-invoice-selected');
  if (!el) return;
  if (!_cnSelectedInvoice) { el.innerHTML = ''; return; }
  const inv = _cnSelectedInvoice;
  const bal = (parseFloat(inv.amount_due)||0) - (parseFloat(inv.amount_paid)||0);
  el.innerHTML = `
    <div style="background:#EEF3FA;border-left:3px solid var(--navy-400,#4A6FA5);border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <strong>${_finEsc(inv.invoice_number || ('#'+inv.id))}</strong> — ${_finEsc(_invStudentName(inv.student_id))}<br>
        <span style="font-size:0.82rem;color:#666;">Balance: ${_pvMoney(bal)}</span>
      </div>
      <button class="fin-btn-outline" onclick="_cnSelectedInvoice=null;_cnRenderSelectedInvoice();">Change</button>
    </div>`;
}

async function _cnSubmitAdd() {
  let valid = true;
  document.getElementById('cn-f-invoice-err').textContent = _cnSelectedInvoice ? '' : 'Select a fee invoice.';
  if (!_cnSelectedInvoice) valid = false;
  const amount = parseFloat(document.getElementById('cn-f-amount').value);
  document.getElementById('cn-f-amount-err').textContent = (amount > 0) ? '' : 'Amount must be greater than 0.';
  if (!(amount > 0)) valid = false;
  const reason = document.getElementById('cn-f-reason').value.trim();
  document.getElementById('cn-f-reason-err').textContent = reason ? '' : 'This field is required.';
  if (!reason) valid = false;
  if (!valid) return;
  const receiptVal = document.getElementById('cn-f-receipt').value;
  const payload = {
    fee_invoice_id: _cnSelectedInvoice.id,
    amount,
    reason,
    original_receipt_id: receiptVal ? parseInt(receiptVal, 10) : null,
  };
  const res = await apiFetch(_CN_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    showToast('Credit note created.', 'success');
    loadView('fin-credit-notes');
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}
