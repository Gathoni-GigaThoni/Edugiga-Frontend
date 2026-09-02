// ==================== CREDIT NOTES ====================
// FE Alignment Sweep 2026-08-18 — this module previously routed straight to
// loadFinPlaceholderView; the backend has always had the full
// /api/receivables/credit-notes/ lifecycle (confirmed via openapi.json).
// CreditNoteRead.journal_entry_id shipped later the same day — see the
// "Reversal JE" detail row below, omitted (not dashed) when null.

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

// over_credit_reason is set only when a CN was applied past the invoice's
// outstanding balance — the deliberate "nullify a wrong invoice and issue a
// corrected replacement" path. It is the audit trail for that decision, so it
// gets a badge wherever a CN is listed rather than living only in the log.
function _cnOverCreditBadge(cn) {
  if (!cn || cn.over_credit_reason == null || cn.over_credit_reason === '') return '';
  return `<span title="${_finEsc(cn.over_credit_reason)}" style="display:inline-block;margin-left:6px;padding:2px 9px;border-radius:10px;font-size:0.72rem;font-weight:700;background:var(--gold-100,#F7EFD5);color:#7a6110;cursor:help;">Over-credit</span>`;
}

// Fee invoices cache for the create-form picker — same all-invoices-once
// pattern as _pvFetchAllSupplierInvoices in payables.js.
let _cnInvoicesCache = null;
async function _cnFetchAllInvoices() {
  if (_cnInvoicesCache) return _cnInvoicesCache;
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices`);
  _cnInvoicesCache = (res && res.ok) ? _toArray(await res.json()) : [];
  // Outstanding balance shown next to an invoice in this module's pickers has
  // to net off credit notes already applied to it, or the operator sizes a new
  // CN against a balance that was settled by an earlier one. FeeInvoiceRead
  // carries no amount_credited, so the figure comes from the applied-CN index.
  await loadAppliedCreditIndex();
  return _cnInvoicesCache;
}
// Shared by all three invoice-balance renderings in this module (§1.2).
function _cnInvoiceBalance(inv) {
  return invoiceBalance(inv, creditedForInvoice(inv.id));
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
    col1: cn => _finEsc(cn.credit_note_number || `#${cn.id}`) + _cnOverCreditBadge(cn),
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
      {label:'Status', key:'status', fmt:(v,cn)=>_cnStatusBadge(v)+_cnOverCreditBadge(cn)},
      // Only present on a CN applied with allow_overcredit — the row is
      // omitted rather than dashed on every other CN, so its presence alone
      // tells finance oversight that this one exceeded the invoice.
      {label:'Over-credit Reason', key:'over_credit_reason', fullWidth:true,
       hideWhen: cn=>cn.over_credit_reason==null||cn.over_credit_reason==='',
       fmt:v=>`<span style="color:#7a6110;">${_finEsc(v)}</span>`},
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
    return `<button class="fin-btn-teal" onclick="_cnOpenApplyModal(${cn.id},'${_finEsc(cn.credit_note_number||('#'+cn.id))}',${cn.amount},${cn.fee_invoice_id})">Apply to Invoice</button>`;
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

// ── Applying a credit note (2026-09-02 addendum §B, §C) ─────────────────────
// The strict cap is still the default: a CN for more than the invoice's
// outstanding balance fails closed, which is what catches a fat-fingered extra
// zero. Over-credit is the opt-in escape hatch for one specific job — an
// invoice raised at the wrong tuition tier is nullified by a CN for its full
// value, a corrected invoice is issued, and whatever the parent already paid
// parks as a student credit balance that offsets it. Cancelling the wrong
// invoice instead loses the payment allocation trail and makes the parent pay
// twice, which is why this path exists at all.
//
// Once an invoice's outstanding hits zero the server refuses any further CN
// against it (chain-CN block): the fix belongs on the replacement invoice, not
// on the broken one. That is pre-checked here so the operator isn't sent into
// a 409 they can't act on from this modal.
async function _cnOpenApplyModal(id, cnNumber, amount, feeInvoiceId) {
  await _cnFetchAllInvoices();
  const inv = _cnInvoiceById(feeInvoiceId);
  const outstanding = inv ? _cnInvoiceBalance(inv) : null;
  const invLabel    = inv ? (inv.invoice_number || `#${inv.id}`) : 'its fee invoice';
  const cnAmount    = parseFloat(amount) || 0;
  const fullyCredited = outstanding != null && outstanding <= 0.005;
  const overApplies   = outstanding != null && !fullyCredited && cnAmount > outstanding + 0.005;

  window._cnApplyCtx = { id, cnAmount, outstanding, invLabel, fullyCredited };

  const wrap = document.createElement('div');
  wrap.id = 'cn-apply-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:520px;max-width:100%;max-height:90vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Apply Credit Note</h3>
      <p style="font-size:0.9rem;color:var(--grey-700,#444);line-height:1.5;">
        Apply <strong>${_finEsc(cnNumber)}</strong> (${_pvMoney(amount)}) against ${_finEsc(invLabel)}? This reduces the invoice balance and cannot be undone.
      </p>
      ${outstanding != null ? `<div style="background:#EEF3FA;border-left:3px solid var(--navy-400,#4A6FA5);border-radius:6px;padding:10px 14px;margin-top:6px;">
        <span style="color:#888;font-size:0.82rem;">Invoice outstanding</span><br><strong>${_pvMoney(outstanding)}</strong>
      </div>` : ''}
      ${fullyCredited ? `<div style="background:var(--coral-100);border-left:3px solid var(--coral-500);border-radius:6px;padding:10px 14px;margin-top:10px;color:var(--coral-600);font-size:0.85rem;">
        <strong>${_finEsc(invLabel)} is already fully credited.</strong><br>
        Further credit notes can't be chained onto it. Issue a corrected replacement invoice for the amount you intend to charge, then apply credit notes against that one instead.
      </div>` : ''}
      ${!fullyCredited && outstanding != null ? `
      <div style="margin-top:14px;border-top:1px solid #eee;padding-top:12px;">
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:0.88rem;cursor:pointer;">
          <input type="checkbox" id="cn-apply-overcredit" onchange="_cnApplyRecompute()" style="margin-top:3px;">
          <span>Allow over-credit <span style="color:#888;">(CN amount can exceed invoice outstanding)</span></span>
        </label>
        <p style="font-size:0.78rem;color:#888;margin:6px 0 0 26px;line-height:1.45;">
          Use this to nullify a wrong invoice for a corrected replacement. Over-credit posts the full CN amount; any excess parks as a student credit balance.
        </p>
        <div id="cn-apply-reason-wrap" style="display:none;margin-top:10px;">
          <label class="fin-form-label">Reason for over-credit <span class="fin-required">*</span></label>
          <textarea id="cn-apply-reason" class="fin-form-textarea" rows="3" maxlength="500"
                    oninput="_cnApplyRecompute()"
                    placeholder="e.g. Invoice ${_finEsc(invLabel)} raised at wrong tuition tier; replacing with a corrected invoice"></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="fin-field-error" id="cn-apply-reason-err"></span>
            <span style="font-size:0.75rem;color:#888;"><span id="cn-apply-reason-count">0</span>/500</span>
          </div>
        </div>
        <div id="cn-apply-overcredit-preview"></div>
      </div>` : ''}
      ${!fullyCredited && overApplies ? `<div id="cn-apply-cap-warning" style="background:var(--coral-100);border-left:3px solid var(--coral-500);border-radius:6px;padding:10px 14px;margin-top:10px;color:var(--coral-600);font-size:0.85rem;">
        CN amount exceeds this invoice's outstanding balance. Tick <em>Allow over-credit</em> above and give a reason to post it anyway.
      </div>` : ''}
      <div id="cn-apply-modal-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('cn-apply-modal-overlay').remove()">Cancel</button>
        <button id="cn-apply-btn" class="fin-btn-teal"
                ${fullyCredited ? 'disabled title="This invoice is already fully credited. Issue a corrected replacement invoice for the amount you intend to charge, then apply CNs against that one instead."' : ''}
                onclick="_cnApply(${id})">Apply</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  _cnApplyRecompute();
}

// Re-derives the reason box, the live over-credit preview and the Apply
// button's enabled state from the checkbox. Called on open and on every change
// so the three never disagree.
function _cnApplyRecompute() {
  const ctx = window._cnApplyCtx;
  if (!ctx) return;
  const cb      = document.getElementById('cn-apply-overcredit');
  const wrapEl  = document.getElementById('cn-apply-reason-wrap');
  const reasonEl= document.getElementById('cn-apply-reason');
  const prevEl  = document.getElementById('cn-apply-overcredit-preview');
  const capEl   = document.getElementById('cn-apply-cap-warning');
  const btn     = document.getElementById('cn-apply-btn');
  const countEl = document.getElementById('cn-apply-reason-count');
  if (ctx.fullyCredited) { if (btn) btn.disabled = true; return; }

  const allow  = !!(cb && cb.checked);
  const reason = (reasonEl?.value || '').trim();
  const excess = (ctx.outstanding != null) ? ctx.cnAmount - ctx.outstanding : 0;
  const over   = ctx.outstanding != null && excess > 0.005;

  if (wrapEl) wrapEl.style.display = allow ? 'block' : 'none';
  if (countEl) countEl.textContent = String((reasonEl?.value || '').length);
  if (capEl) capEl.style.display = (over && !allow) ? 'block' : 'none';
  if (prevEl) {
    prevEl.innerHTML = (allow && over)
      ? `<div style="background:var(--gold-100,#F7EFD5);border-left:3px solid var(--gold-500,#C9A227);border-radius:6px;padding:10px 14px;margin-top:10px;color:#7a6110;font-size:0.85rem;">
           This CN will over-credit ${_finEsc(ctx.invLabel)} by <strong>${_pvMoney(excess)}</strong>. The excess will offset the student's next invoice.
         </div>`
      : '';
  }
  // Blocked only where the server would refuse: over the cap with no opt-in,
  // or opted in with no reason (which comes back a 422).
  if (btn) btn.disabled = (over && !allow) || (allow && !reason);
}

async function _cnApply(id) {
  const msgEl  = document.getElementById('cn-apply-modal-msg');
  const ctx    = window._cnApplyCtx || {};
  const allow  = !!document.getElementById('cn-apply-overcredit')?.checked;
  const reason = (document.getElementById('cn-apply-reason')?.value || '').trim();
  if (allow && !reason) {
    const errEl = document.getElementById('cn-apply-reason-err');
    if (errEl) errEl.textContent = 'A reason is required to over-credit.';
    return;
  }
  // Body omitted entirely unless over-credit was asked for — an absent body is
  // the strict-cap path, exactly as before this flag existed.
  const opts = { method: 'POST' };
  if (allow) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify({ allow_overcredit: true, override_reason: reason });
  }
  const res = await apiFetch(`${_CN_API}/${id}/apply`, opts);
  if (!res) return;
  if (res.ok) {
    const result = await res.json().catch(() => null);
    document.getElementById('cn-apply-modal-overlay')?.remove();
    window._cnApplyCtx = null;
    const excess = parseFloat(result?.over_credited_by) || 0;
    if (excess > 0) {
      showToast(`Applied. This CN over-credits ${ctx.invLabel || 'the invoice'} by ${formatKES(excess)}. The excess will offset the student's next invoice.`, 'success');
    } else {
      showToast('Credit note applied to invoice.', 'success');
    }
    // The applied-CN index is what every invoice balance on the FE now nets
    // off — leave it stale and this CN stays invisible to the arithmetic
    // until the next full reload.
    await loadAppliedCreditIndex(true);
    await window._splitRefreshSelected?.();
    return;
  }
  const msg = await parseApiError(res);
  // 409 here is either a closed period or the chain-CN block; 422 is the
  // missing override_reason. All three are things the operator fixes in this
  // modal, so they stay inline rather than dismissing it behind a toast.
  if (res.status === 409 && isPeriodLockError(res.status, msg)) {
    showPeriodLockError(msgEl, msg);
  } else if (res.status === 409 || res.status === 422) {
    if (msgEl) {
      msgEl.innerHTML = `<div style="margin-top:12px;padding:10px 14px;border-radius:6px;border-left:3px solid var(--coral-500);background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;">${_finEsc(msg)}</div>`;
    } else { showToast(msg, 'error'); }
  } else {
    document.getElementById('cn-apply-modal-overlay')?.remove();
    window._cnApplyCtx = null;
    showToast('Error: ' + msg, 'error');
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
        const bal = _cnInvoiceBalance(inv);
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
  const bal = _cnInvoiceBalance(inv);
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
