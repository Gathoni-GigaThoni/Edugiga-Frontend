// ==================== PAYABLES MODULE ====================
// Built against the live backend schema (verified via openapi.json), not the
// literal field list in the design spec — several spec fields don't exist on
// the backend (Branch is gone entirely; Ledger/Cost Center are now real FK
// dropdowns from /api/lookups/*; disbursements need debit/credit GL accounts;
// Supplier Invoice's "Supplier" and Imprest's "Personnel" are FK dropdowns).

// ── Shared lookup cache (A.2) ────────────────────────────────────────────────
let _pvLookupsLoaded = false;
let _pvLedgers = [], _pvCostCenters = [], _pvDepartments = [], _pvAccounts = [], _pvSuppliers = [], _pvEmployees = [];
const _PV_PAYEE_TYPES = ['Supplier', 'Student', 'Staff', 'Non-Registered'];
const _PV_TAX_TYPES   = ['PAYE', 'NSSF', 'SHIF', 'AHL', 'WHT', 'VAT'];
const _PV_DISBURSEMENT_METHODS = [['cash','Cash'], ['bank_transfer','Bank Transfer'], ['mpesa','M-Pesa']];

async function _pvLoadLookups(force = false) {
  if (_pvLookupsLoaded && !force) return;
  const [ledgersRes, costCentersRes, deptsRes, acctsRes, supRes, empRes] = await Promise.all([
    apiFetch(`${API_BASE}/lookups/ledgers`),
    apiFetch(`${API_BASE}/lookups/cost-centers`),
    apiFetch(`${API_BASE}/departments/`),
    apiFetch(`${API_BASE}/finance/accounts/?is_active=true`),
    apiFetch(`${API_BASE}/suppliers/`),
    apiFetch(`${API_BASE}/hr/employees`),
  ]);
  _pvLedgers      = (ledgersRes && ledgersRes.ok)     ? _toArray(await ledgersRes.json())     : [];
  _pvCostCenters  = (costCentersRes && costCentersRes.ok) ? _toArray(await costCentersRes.json()) : [];
  _pvDepartments  = (deptsRes && deptsRes.ok)         ? _toArray(await deptsRes.json())        : [];
  _pvAccounts     = (acctsRes && acctsRes.ok)         ? _toArray(await acctsRes.json())         : [];
  _pvSuppliers    = (supRes && supRes.ok)             ? _toArray(await supRes.json())           : [];
  const empRaw    = (empRes && empRes.ok) ? await empRes.json() : null;
  _pvEmployees    = empRaw ? (empRaw.items || _toArray(empRaw)) : [];
  _pvLookupsLoaded = true;
}

// renderSplitView shows nothing in the right panel until an item is selected
// unless cfg.renderAdd is provided — every Payables sub-module here had onAdd
// wired but no renderAdd, so there was no visible way to reach Add without
// first clicking an existing record (see [[frontend-gotchas]]). One shared
// placeholder factory instead of repeating the same block 9 times.
function _pvAddPlaceholder(label, view, hint) {
  return el => {
    el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
      <div style="font-size:2rem;margin-bottom:12px">&#128179;</div>
      <p style="font-weight:600;margin-bottom:8px">Add a New ${label}</p>
      <p style="font-size:13px;margin-bottom:20px">${hint || ''}</p>
      <button class="btn-primary" style="padding:10px 24px" onclick="loadView('${view}')">+ Add ${label}</button>
    </div>`;
  };
}

function _pvOptions(list, valueKey, labelFn, selected) {
  return list.map(item => `<option value="${item[valueKey]}" ${String(selected) === String(item[valueKey]) ? 'selected' : ''}>${_finEsc(labelFn(item))}</option>`).join('');
}
function _pvLedgerOptions(sel)     { return _pvOptions(_pvLedgers, 'id', l => l.name, sel); }
function _pvCostCenterOptions(sel) { return _pvOptions(_pvCostCenters, 'id', c => c.name, sel); }
function _pvDepartmentOptions(sel) { return _pvOptions(_pvDepartments, 'id', d => d.name, sel); }
function _pvAccountOptions(sel)    { return _pvOptions(_pvAccounts, 'id', a => `${a.number ? a.number + ' - ' : ''}${a.account_name}`, sel); }
function _pvTendepayWalletOptions(sel) { return _pvOptions(_pvAccounts.filter(a => (a.account_name || '').toLowerCase().startsWith('tendepay')), 'id', a => a.account_name, sel); }
function _pvSupplierOptions(sel)   { return _pvOptions(_pvSuppliers, 'id', s => s.name, sel); }
function _pvEmployeeOptions(sel)   { return _pvOptions(_pvEmployees, 'id', e => `${e.first_name} ${e.last_name}`, sel); }

function _pvLedgerName(id)     { return (_pvLedgers.find(l => String(l.id) === String(id)) || {}).name || '-'; }
function _pvCostCenterName(id) { return (_pvCostCenters.find(c => String(c.id) === String(id)) || {}).name || '-'; }
function _pvAccountName(id)    { const a = _pvAccounts.find(a => String(a.id) === String(id)); return a ? a.account_name : '-'; }
function _pvSupplierName(id)   { return (_pvSuppliers.find(s => String(s.id) === String(id)) || {}).name || '-'; }
function _pvEmployeeName(id)   { const e = _pvEmployees.find(e => String(e.id) === String(id)); return e ? `${e.first_name} ${e.last_name}` : '-'; }

// ── Formatting ────────────────────────────────────────────────────────────────
function _pvMoney(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'KES 0.00';
  return 'KES ' + n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _pvDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
const _PV_STATUS_BADGE = {
  draft: 'grey', submitted: 'amber', approved: 'blue', awaiting_tendepay: 'gold', paid: 'green', rejected: 'red', cancelled: 'grey',
  pending: 'amber', active: 'blue', surrendered: 'green', overdue: 'red', disbursed: 'green', disputed: 'red',
  pending_review: 'amber', confirmed: 'green',
};
function _pvBadge(status) {
  const color = _PV_STATUS_BADGE[status] || 'grey';
  const colors = { grey: '#888;background:#eee', amber: '#9a7d0a;background:#fdf3d0', blue: '#1a5fb4;background:#dce8fb', gold: '#8a6d00;background:#f5e6a8', green: '#1e7e34;background:#dcf3e2', red: '#c0392b;background:#fde0de' };
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${colors[color].split(';')[0]};background:${colors[color].split(';')[1].replace('background:','')};">${_finEsc((status || '').replace(/_/g,' '))}</span>`;
}

// ── A.3 Document number preview ─────────────────────────────────────────────
async function _pvPreviewNextNumber(listUrl, fieldName, prefix, digits) {
  try {
    const res = await apiFetch(`${listUrl}${listUrl.includes('?') ? '&' : '?'}page=1&per_page=1`);
    if (res && res.ok) {
      const raw = await res.json();
      const list = _toArray(raw);
      if (list.length > 0 && list[0][fieldName]) {
        const lastNum = parseInt(String(list[0][fieldName]).replace(/\D/g, ''), 10) || 0;
        return prefix + String(lastNum + 1).padStart(digits, '0');
      }
    }
  } catch (_) {}
  return prefix + '0'.repeat(digits - 1) + '1';
}

// ── Reason modal (Reject actions) ───────────────────────────────────────────
function _pvShowReasonModal(title, onConfirm) {
  const wrap = document.createElement('div');
  wrap.id = 'pv-reason-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:420px;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">${_finEsc(title)}</h3>
      <textarea id="pv-reason-text" class="fin-form-textarea" rows="4" placeholder="Enter reason..."></textarea>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('pv-reason-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" id="pv-reason-confirm-btn">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('pv-reason-confirm-btn').onclick = () => {
    const reason = document.getElementById('pv-reason-text').value.trim();
    if (!reason) { showToast('Reason is required.', 'error'); return; }
    wrap.remove();
    onConfirm(reason);
  };
}

// ── Generic action-dropdown toggle (namespaced per module) ─────────────────
function _pvToggleDropdown(e, prefix, id) {
  e.stopPropagation();
  document.querySelectorAll(`[id^="${prefix}-dd-"]`).forEach(d => { if (d.id !== `${prefix}-dd-${id}`) d.style.display = 'none'; });
  const dd = document.getElementById(`${prefix}-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// ── Payee field (depends on Payee Type) ─────────────────────────────────────
function _pvPayeeFieldHtml(idPrefix, payeeType, payeeId, payeeFreetext) {
  if (payeeType === 'Supplier') {
    return `<select id="${idPrefix}-payee" class="fin-form-select">
      <option value="">Please Select</option>${_pvSupplierOptions(payeeId)}
    </select>`;
  }
  if (payeeType === 'Staff') {
    return `<select id="${idPrefix}-payee" class="fin-form-select">
      <option value="">Please Select</option>${_pvEmployeeOptions(payeeId)}
    </select>`;
  }
  if (payeeType === 'Student') {
    return `<input type="number" id="${idPrefix}-payee" class="fin-form-input" placeholder="Student ID" value="${payeeId || ''}">`;
  }
  // Non-Registered
  return `<input type="text" id="${idPrefix}-payee" class="fin-form-input" placeholder="Payee name" value="${_finEsc(payeeFreetext || '')}">`;
}
function _pvRefreshPayeeField(idPrefix, selectEl) {
  const wrap = document.getElementById(`${idPrefix}-payee-wrap`);
  if (wrap) wrap.innerHTML = _pvPayeeFieldHtml(idPrefix, selectEl.value, null, null);
}
function _pvReadPayee(idPrefix, payeeType) {
  const el = document.getElementById(`${idPrefix}-payee`);
  const val = el ? el.value.trim() : '';
  if (payeeType === 'Non-Registered') return { payee_id: null, payee_name_freetext: val || null };
  return { payee_id: val ? parseInt(val, 10) : null, payee_name_freetext: null };
}

// ==================== A.4 PAYMENT VOUCHERS ====================
let _pvPvPage = 1, _pvPvPerPage = 10, _pvPvData = [];
const _PV_PV_API = `${API_BASE}/payables/payment-vouchers/`;

async function loadPayablesPaymentVouchersView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Payment Vouchers',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-payment-vouchers'},
      {label:'Payment Vouchers'}
    ],
    apiUrl: _PV_PV_API,
    searchFields: ['voucher_no','payee_type'],
    col1Label: 'Voucher No', col2Label: 'Status',
    col1: v => v.voucher_no || `#${v.id}`,
    col2: v => v.status || '—',
    rowLabel: v => v.voucher_no || `#${v.id}`,
    rowSub:   v => v.payee_type || '',
    idKey: 'id',
    detailFields: [
      {label:'Voucher No',       key:'voucher_no', fmt:v=>v||'—'},
      {label:'Ledger',           key:'ledger_id', fmt:v=>_pvLedgerName(v)},
      {label:'Payee Type',       key:'payee_type', fmt:v=>v||'—'},
      {label:'Amount',           key:'amount', fmt:v=>_pvMoney(v)},
      {label:'Debit Account',    key:'debit_account_id', fmt:v=>v?_pvAccountName(v):'—'},
      {label:'Tendepay Wallet',  key:'tendepay_wallet_account_id', fmt:v=>v?_pvAccountName(v):'—'},
      {label:'Status',           key:'status', fmt:v=>_pvBadge(v)},
      {label:'Date',             key:'created_at', fmt:v=>_pvDate(v)},
    ],
    renderAdd: _pvAddPlaceholder('Payment Voucher', 'payables-payment-vouchers-add', 'Set up the payee, ledger, cost center and amount.'),
    onAdd:  () => loadView('payables-payment-vouchers-add'),
    onEdit: item => { window._pvEditPvId = item.id; loadView('payables-payment-vouchers-edit'); },
    detailActions: _pvPvDetailActions,
  });
}

// ── Detail-pane lifecycle actions (draft → submitted → approved → awaiting_tendepay → paid) ──
function _pvPvDetailActions(v) {
  const isCreator = currentUser && v.personnel_id && String(currentUser.id) === String(v.personnel_id);
  let html = '';
  if (v.status === 'draft') {
    html += `<button class="btn" onclick="_pvPvSubmitForApproval(${v.id})">Submit for Approval</button>`;
  } else if (v.status === 'submitted') {
    if (!isCreator) html += `<button class="btn" onclick="_pvPvApprove(${v.id})">Approve</button>`;
    html += `<button class="fin-btn-cancel" onclick="_pvPvReject(${v.id})">Reject</button>`;
  } else if (v.status === 'approved') {
    html += `<button class="btn" onclick="_pvPvQueueForTendepay(${v.id}, ${v.debit_account_id || 'null'}, ${v.tendepay_wallet_account_id || 'null'})">Queue for Tendepay</button>`;
    if (!v.debit_account_id || !v.tendepay_wallet_account_id) {
      html += `<div style="width:100%;margin-top:8px;color:var(--color-danger);font-size:0.85rem;">Set the Debit Account and Tendepay Wallet before queueing this voucher for payment.</div>`;
    }
  } else if (v.status === 'awaiting_tendepay') {
    html += `<div style="color:var(--grey-500,#666);font-size:0.9rem;">Queued for Tendepay. Payment will post automatically on the next Tendepay import.</div>`;
  }
  html += `<button class="fin-btn-outline" onclick="_pvPvPrint(${v.id})">View / Print</button>`;
  return `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">${html}</div>`;
}

async function _pvPvSubmitForApproval(id) {
  const res = await apiFetch(`${_PV_PV_API}${id}/submit-for-approval`, { method: 'POST' });
  if (res && res.ok) { showToast('Submitted for approval.', 'success'); await window._splitRefreshSelected?.(); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
async function _pvPvApprove(id) {
  const res = await apiFetch(`${_PV_PV_API}${id}/approve`, { method: 'POST' });
  if (res && res.ok) { showToast('Payment voucher approved.', 'success'); await window._splitRefreshSelected?.(); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
function _pvPvReject(id) {
  _pvShowReasonModal('Reject Payment Voucher', async (reason) => {
    const res = await apiFetch(`${_PV_PV_API}${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    if (res && res.ok) { showToast('Payment voucher rejected.', 'success'); await window._splitRefreshSelected?.(); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  });
}
// Small modal for an optional notes field (used by Queue for Tendepay) — like
// _pvShowReasonModal but the text is not required to confirm.
function _pvShowNotesModal(title, onConfirm) {
  const wrap = document.createElement('div');
  wrap.id = 'pv-notes-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:420px;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">${_finEsc(title)}</h3>
      <textarea id="pv-notes-text" class="fin-form-textarea" rows="4" placeholder="Notes (optional)..."></textarea>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('pv-notes-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" id="pv-notes-confirm-btn">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('pv-notes-confirm-btn').onclick = () => {
    const notes = document.getElementById('pv-notes-text').value.trim();
    wrap.remove();
    onConfirm(notes || null);
  };
}
// Replaces the deleted /mark-paid action — vouchers now settle exclusively
// through a Tendepay statement import (see js/finance.js Tendepay module).
async function _pvPvQueueForTendepay(id, debitAccountId, tendepayWalletAccountId) {
  if (!debitAccountId || !tendepayWalletAccountId) {
    showToast('Set the Debit Account and Tendepay Wallet before queueing this voucher for payment.', 'error');
    return;
  }
  _pvShowNotesModal('Queue for Tendepay', async (notes) => {
    const res = await apiFetch(`${_PV_PV_API}${id}/mark-awaiting-tendepay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
    if (res && res.ok) { showToast('Voucher queued. Payment will post on the next Tendepay import.', 'success'); await window._splitRefreshSelected?.(); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  });
}
async function _pvPvPrint(id) {
  const res = await apiFetch(`${_PV_PV_API}${id}/print`);
  if (res && res.ok) {
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  } else if (res) showToast('Could not open print view: ' + await parseApiError(res), 'error');
}

// ── Add / Edit form ──────────────────────────────────────────────────────────
function _pvPvFormHtml(v) {
  const payeeType = v?.payee_type || '';
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
        <select id="pv-f-ledger" class="fin-form-select">
          <option value="">Please Select</option>${_pvLedgerOptions(v?.ledger_id)}
        </select>
        <span class="fin-field-error" id="pv-f-ledger-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Voucher No.</label>
        <input type="text" id="pv-f-voucher-no" class="fin-form-input" value="${_finEsc(v?.voucher_no || '')}" disabled>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Cost Center <span class="fin-required">*</span></label>
        <select id="pv-f-cost-center" class="fin-form-select">
          <option value="">Please Select</option>${_pvCostCenterOptions(v?.cost_center_id)}
        </select>
        <span class="fin-field-error" id="pv-f-cc-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Debit Account</label>
        <select id="pv-f-debit-account" class="fin-form-select">
          <option value="">Please Select</option>${_pvAccountOptions(v?.debit_account_id)}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Tendepay Wallet</label>
        <select id="pv-f-tendepay-wallet" class="fin-form-select">
          <option value="">Please Select</option>${_pvTendepayWalletOptions(v?.tendepay_wallet_account_id)}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Department <span class="fin-required">*</span></label>
        <select id="pv-f-department" class="fin-form-select">
          <option value="">Please Select</option>${_pvDepartmentOptions(v?.department_id)}
        </select>
        <span class="fin-field-error" id="pv-f-dept-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Payee Type <span class="fin-required">*</span></label>
        <select id="pv-f-payee-type" class="fin-form-select" onchange="_pvRefreshPayeeField('pv-f', this)">
          <option value="">Please Select</option>
          ${_PV_PAYEE_TYPES.map(t => `<option value="${t}" ${payeeType === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="pv-f-payeetype-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Payee <span class="fin-required">*</span></label>
        <div id="pv-f-payee-wrap">${_pvPayeeFieldHtml('pv-f', payeeType, v?.payee_id, v?.payee_name_freetext)}</div>
        <span class="fin-field-error" id="pv-f-payee-err"></span>
      </div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Amount (KES) <span class="fin-required">*</span></label>
      <input type="number" id="pv-f-amount" class="fin-form-input" step="0.01" min="0.01" value="${v?.amount || ''}">
      <span class="fin-field-error" id="pv-f-amount-err"></span>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Description <span class="fin-required">*</span></label>
      <textarea id="pv-f-description" class="fin-form-textarea" rows="4">${_finEsc(v?.description || '')}</textarea>
      <span class="fin-field-error" id="pv-f-description-err"></span>
    </div>
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Personnel</label>
        <input type="text" class="fin-form-input" value="${_finEsc(currentUser ? (currentUser.full_name || currentUser.name || currentUser.email || '') : '')}" disabled>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Creation Date</label>
        <input type="text" class="fin-form-input" value="${_pvDate(v?.creation_date || new Date().toISOString())}" disabled>
      </div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Notes</label>
      <textarea id="pv-f-notes" class="fin-form-textarea" rows="4">${_finEsc(v?.notes || '')}</textarea>
    </div>`;
}

async function loadPayablesPaymentVouchersAddView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Payment Voucher</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-payment-vouchers');return false;">Payment Vouchers</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        ${_pvPvFormHtml(null)}
        <div class="fin-form-actions">
          <button class="fin-btn-outline" disabled>Print</button>
          <button class="fin-btn-teal" onclick="_pvPvSubmitAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-payment-vouchers')">Cancel</button>
        </div>
      </div>
    </div>`;
  const preview = await _pvPreviewNextNumber(_PV_PV_API, 'voucher_no', 'PV', 6);
  const f = document.getElementById('pv-f-voucher-no');
  if (f) f.value = preview;
}

function _pvPvValidate() {
  let valid = true;
  const req = [
    ['pv-f-ledger', 'pv-f-ledger-err'],
    ['pv-f-cost-center', 'pv-f-cc-err'],
    ['pv-f-department', 'pv-f-dept-err'],
    ['pv-f-payee-type', 'pv-f-payeetype-err'],
    ['pv-f-description', 'pv-f-description-err'],
  ];
  req.forEach(([fid, eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  const amount = parseFloat(document.getElementById('pv-f-amount').value);
  document.getElementById('pv-f-amount-err').textContent = (amount > 0) ? '' : 'Amount must be greater than 0.';
  if (!(amount > 0)) valid = false;
  const payeeType = document.getElementById('pv-f-payee-type').value;
  const payee = _pvReadPayee('pv-f', payeeType);
  const payeeOk = payeeType === 'Non-Registered' ? !!payee.payee_name_freetext : !!payee.payee_id;
  document.getElementById('pv-f-payee-err').textContent = payeeOk ? '' : 'Payee is required.';
  if (!payeeOk) valid = false;
  return valid;
}

function _pvPvPayload() {
  const payeeType = document.getElementById('pv-f-payee-type').value;
  const payee = _pvReadPayee('pv-f', payeeType);
  return {
    ledger_id: parseInt(document.getElementById('pv-f-ledger').value, 10),
    cost_center_id: parseInt(document.getElementById('pv-f-cost-center').value, 10),
    payee_type: payeeType,
    payee_id: payee.payee_id,
    payee_name_freetext: payee.payee_name_freetext,
    department_id: parseInt(document.getElementById('pv-f-department').value, 10),
    amount: parseFloat(document.getElementById('pv-f-amount').value),
    description: document.getElementById('pv-f-description').value.trim(),
    notes: document.getElementById('pv-f-notes').value.trim() || null,
    debit_account_id: document.getElementById('pv-f-debit-account').value ? parseInt(document.getElementById('pv-f-debit-account').value, 10) : null,
    tendepay_wallet_account_id: document.getElementById('pv-f-tendepay-wallet').value ? parseInt(document.getElementById('pv-f-tendepay-wallet').value, 10) : null,
  };
}

async function _pvPvSubmitAdd() {
  if (!_pvPvValidate()) return;
  try {
    const res = await apiFetch(_PV_PV_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_pvPvPayload()) });
    if (res && res.ok) { showToast('Payment voucher created successfully.', 'success'); loadView('payables-payment-vouchers'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

async function loadPayablesPaymentVouchersEditView(container) {
  await _pvLoadLookups();
  const id = window._pvEditPvId;
  const res = await apiFetch(`${_PV_PV_API}${id}`);
  if (!res || !res.ok) { showToast('Could not load payment voucher.', 'error'); loadView('payables-payment-vouchers'); return; }
  const v = await res.json();
  if (v.status !== 'draft') { showToast('Only draft vouchers can be edited.', 'error'); loadView('payables-payment-vouchers'); return; }
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Payment Voucher</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-payment-vouchers');return false;">Payment Vouchers</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap">
        ${_pvPvFormHtml(v)}
        <div class="fin-form-actions">
          <button class="fin-btn-outline" onclick="_pvPvPrint(${v.id})">Print</button>
          <button class="fin-btn-teal" onclick="_pvPvSubmitEdit(${v.id})">Update</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-payment-vouchers')">Cancel</button>
        </div>
      </div>
    </div>`;
}

async function _pvPvSubmitEdit(id) {
  if (!_pvPvValidate()) return;
  try {
    const res = await apiFetch(`${_PV_PV_API}${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_pvPvPayload()) });
    if (res && res.ok) { showToast('Payment voucher updated.', 'success'); loadView('payables-payment-vouchers'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

// ==================== A.5 TAX VOUCHERS ====================
// GET list/get-by-id response shape is unconfirmed (`schema: {}` in OpenAPI) — the
// backend docs say it returns "the tax voucher enriched with its backing
// PaymentVoucher data", so every read here falls back across flat fields and a
// possible nested `payment_voucher` object rather than assuming one shape.
// There is no submit-for-approval/approve/reject/mark-paid/print/PUT route on
// /api/payables/tax-vouchers/{id} itself — those actions exist only on the
// backing Payment Voucher, so we call them against payment_voucher_id.
let _pvTvPage = 1, _pvTvPerPage = 10, _pvTvData = [];
const _PV_TV_API = `${API_BASE}/payables/tax-vouchers/`;

function _pvTvField(tv, key) { return tv[key] ?? tv.payment_voucher?.[key] ?? null; }
function _pvTvPvId(tv) { return tv.payment_voucher_id ?? tv.payment_voucher?.id ?? tv.id; }

async function loadPayablesTaxVouchersView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Tax Vouchers',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-tax-vouchers'},
      {label:'Tax Vouchers'}
    ],
    apiUrl: _PV_TV_API,
    searchFields: ['voucher_no','tax_type'],
    col1Label: 'Voucher No', col2Label: 'Tax Type',
    col1: tv => _pvTvField(tv,'voucher_no') || `#${tv.id}`,
    col2: tv => tv.tax_type || '—',
    rowLabel: tv => _pvTvField(tv,'voucher_no') || `#${tv.id}`,
    rowSub:   tv => tv.tax_type || '',
    idKey: 'id',
    detailFields: [
      {label:'Voucher No', key:'voucher_no', fmt:(_,tv)=>_pvTvField(tv,'voucher_no')||'—'},
      {label:'Tax Type',   key:'tax_type', fmt:v=>v||'—'},
      {label:'Ledger',     key:'ledger_id', fmt:(_,tv)=>_pvLedgerName(_pvTvField(tv,'ledger_id'))},
      {label:'Amount',     key:'amount', fmt:(_,tv)=>_pvMoney(_pvTvField(tv,'amount'))},
      {label:'Status',     key:'status', fmt:(_,tv)=>_pvBadge(_pvTvField(tv,'status'))},
      {label:'Date',       key:'created_at', fmt:(_,tv)=>_pvDate(_pvTvField(tv,'created_at'))},
    ],
    renderAdd: _pvAddPlaceholder('Tax Voucher', 'payables-tax-vouchers-add', 'Record a statutory tax payment voucher.'),
    onAdd: () => loadView('payables-tax-vouchers-add'),
    detailActions: _pvTvDetailActions,
  });
}

// Tax Vouchers have no lifecycle routes of their own — approve/reject/queue
// all act on the backing Payment Voucher (_pvTvPvId), then refresh this split view.
function _pvTvDetailActions(tv) {
  const status = _pvTvField(tv, 'status');
  const pvId = _pvTvPvId(tv);
  const isCreator = currentUser && _pvTvField(tv, 'personnel_id') && String(currentUser.id) === String(_pvTvField(tv, 'personnel_id'));
  let html = '';
  if (status === 'draft') {
    html += `<button class="btn" onclick="_pvPvSubmitForApproval(${pvId})">Submit for Approval</button>`;
  } else if (status === 'submitted') {
    if (!isCreator) html += `<button class="btn" onclick="_pvPvApprove(${pvId})">Approve</button>`;
    html += `<button class="fin-btn-cancel" onclick="_pvPvReject(${pvId})">Reject</button>`;
  } else if (status === 'approved') {
    const debitId = _pvTvField(tv, 'debit_account_id');
    const walletId = _pvTvField(tv, 'tendepay_wallet_account_id');
    html += `<button class="btn" onclick="_pvPvQueueForTendepay(${pvId}, ${debitId || 'null'}, ${walletId || 'null'})">Queue for Tendepay</button>`;
    if (!debitId || !walletId) {
      html += `<div style="width:100%;margin-top:8px;color:var(--color-danger);font-size:0.85rem;">Set the Debit Account and Tendepay Wallet before queueing this voucher for payment.</div>`;
    }
  } else if (status === 'awaiting_tendepay') {
    html += `<div style="color:var(--grey-500,#666);font-size:0.9rem;">Queued for Tendepay. Payment will post automatically on the next Tendepay import.</div>`;
  }
  html += `<button class="fin-btn-outline" onclick="_pvPvPrint(${pvId})">View / Print</button>`;
  return `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">${html}</div>`;
}

const _PV_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function _pvTvFormHtml() {
  const payeeType = '';
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
        <select id="tv-f-ledger" class="fin-form-select"><option value="">Please Select</option>${_pvLedgerOptions()}</select>
        <span class="fin-field-error" id="tv-f-ledger-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Voucher No.</label>
        <input type="text" id="tv-f-voucher-no" class="fin-form-input" disabled>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Cost Center <span class="fin-required">*</span></label>
        <select id="tv-f-cost-center" class="fin-form-select"><option value="">Please Select</option>${_pvCostCenterOptions()}</select>
        <span class="fin-field-error" id="tv-f-cc-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Department <span class="fin-required">*</span></label>
        <select id="tv-f-department" class="fin-form-select"><option value="">Please Select</option>${_pvDepartmentOptions()}</select>
        <span class="fin-field-error" id="tv-f-dept-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Tax Type <span class="fin-required">*</span></label>
        <select id="tv-f-tax-type" class="fin-form-select"><option value="">Please Select</option>${_PV_TAX_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
        <span class="fin-field-error" id="tv-f-taxtype-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Period Month <span class="fin-required">*</span></label>
        <select id="tv-f-period-month" class="fin-form-select">
          <option value="">Please Select</option>
          ${_PV_MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="tv-f-month-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Period Year <span class="fin-required">*</span></label>
        <input type="number" id="tv-f-period-year" class="fin-form-input" value="${new Date().getFullYear()}">
        <span class="fin-field-error" id="tv-f-year-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">KRA Payment Slip Ref</label>
        <input type="text" id="tv-f-kra-ref" class="fin-form-input">
      </div>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Amount (KES) <span class="fin-required">*</span></label>
      <input type="number" id="tv-f-amount" class="fin-form-input" step="0.01" min="0.01">
      <span class="fin-field-error" id="tv-f-amount-err"></span>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Description <span class="fin-required">*</span></label>
      <textarea id="tv-f-description" class="fin-form-textarea" rows="4"></textarea>
      <span class="fin-field-error" id="tv-f-description-err"></span>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Notes</label>
      <textarea id="tv-f-notes" class="fin-form-textarea" rows="4"></textarea>
    </div>`;
}

async function loadPayablesTaxVouchersAddView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Tax Voucher</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-tax-vouchers');return false;">Tax Vouchers</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        ${_pvTvFormHtml()}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_pvTvSubmitAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-tax-vouchers')">Cancel</button>
        </div>
      </div>
    </div>`;
  const preview = await _pvPreviewNextNumber(_PV_TV_API, 'voucher_no', 'PV', 6);
  const f = document.getElementById('tv-f-voucher-no');
  if (f) f.value = preview;
}

async function _pvTvSubmitAdd() {
  let valid = true;
  const req = [['tv-f-ledger','tv-f-ledger-err'],['tv-f-cost-center','tv-f-cc-err'],['tv-f-department','tv-f-dept-err'],
    ['tv-f-tax-type','tv-f-taxtype-err'],['tv-f-period-month','tv-f-month-err'],['tv-f-period-year','tv-f-year-err'],
    ['tv-f-description','tv-f-description-err']];
  req.forEach(([fid,eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  const amount = parseFloat(document.getElementById('tv-f-amount').value);
  document.getElementById('tv-f-amount-err').textContent = (amount > 0) ? '' : 'Amount must be greater than 0.';
  if (!(amount > 0)) valid = false;
  if (!valid) return;

  const payload = {
    ledger_id: parseInt(document.getElementById('tv-f-ledger').value, 10),
    cost_center_id: parseInt(document.getElementById('tv-f-cost-center').value, 10),
    department_id: parseInt(document.getElementById('tv-f-department').value, 10),
    amount,
    description: document.getElementById('tv-f-description').value.trim(),
    notes: document.getElementById('tv-f-notes').value.trim() || null,
    tax_type: document.getElementById('tv-f-tax-type').value,
    period_month: parseInt(document.getElementById('tv-f-period-month').value, 10),
    period_year: parseInt(document.getElementById('tv-f-period-year').value, 10),
    kra_payment_slip_ref: document.getElementById('tv-f-kra-ref').value.trim() || null,
  };
  try {
    const res = await apiFetch(_PV_TV_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) { showToast('Tax voucher created successfully.', 'success'); loadView('payables-tax-vouchers'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

async function loadPayablesTaxVouchersUpcomingView(container) {
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Tax Vouchers — Upcoming Deadlines',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-tax-vouchers'},
      {label:'Upcoming Deadlines'}
    ],
    apiUrl: `${API_BASE}/payables/tax-vouchers/upcoming-deadlines`,
    searchFields: ['tax_type','status'],
    col1Label: 'Tax Type', col2Label: 'Due Date',
    col1: tv => tv.tax_type || '—',
    col2: tv => _pvDate(_pvTvField(tv,'remittance_due_date')) || '—',
    rowLabel: tv => tv.tax_type || '—',
    rowSub:   tv => _pvDate(_pvTvField(tv,'remittance_due_date')) || '',
    idKey: 'id',
    detailFields: [
      {label:'Tax Type', key:'tax_type', fmt:v=>v||'—'},
      {label:'Period',   key:'period_month', fmt:(_,tv)=>`${_PV_MONTHS[(tv.period_month||1)-1]||''} ${tv.period_year||''}`},
      {label:'Amount',   key:'amount', fmt:(_,tv)=>_pvMoney(_pvTvField(tv,'amount'))},
      {label:'Due Date', key:'remittance_due_date', fmt:(_,tv)=>_pvDate(_pvTvField(tv,'remittance_due_date'))},
      {label:'Status',   key:'status', fmt:(_,tv)=>_pvTvField(tv,'status')||'—'},
    ],
  });
}

// ==================== A.7 SUPPLIER INVOICES ====================
let _pvSiPage = 1, _pvSiPerPage = 10, _pvSiData = [];
const _PV_SI_API = `${API_BASE}/payables/supplier-invoices`;

async function loadPayablesSupplierInvoicesView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Supplier Invoices',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-supplier-invoices'},
      {label:'Supplier Invoices'}
    ],
    apiUrl: `${_PV_SI_API}`,
    searchFields: ['invoice_number'],
    col1Label: 'Supplier', col2Label: 'Invoice No',
    col1: inv => _pvSupplierName(inv.supplier_id) || '—',
    col2: inv => inv.invoice_number || `#${inv.id}`,
    rowLabel: inv => _pvSupplierName(inv.supplier_id) || '—',
    rowSub:   inv => inv.invoice_number || '',
    idKey: 'id',
    detailFields: [
      {label:'Invoice No',   key:'invoice_number', fmt:v=>v||'—'},
      {label:'Supplier',     key:'supplier_id', fmt:v=>_pvSupplierName(v)},
      {label:'Invoice Date', key:'invoice_date', fmt:v=>_pvDate(v)},
      {label:'Due Date',     key:'due_date', fmt:v=>_pvDate(v)},
      {label:'Amount',       key:'amount', fmt:v=>_pvMoney(v)},
      {label:'Status',       key:'status', fmt:v=>v||'—'},
    ],
    renderAdd: _pvAddPlaceholder('Supplier Invoice', 'payables-supplier-invoices-add', 'Record an invoice received from a supplier.'),
    onAdd:  () => loadView('payables-supplier-invoices-add'),
    onEdit: item => { window._pvEditSiId = item.id; loadView('payables-supplier-invoices-edit'); },
    detailActions: _pvSiDetailActions,
  });
}

function _pvSiDetailActions(inv) {
  if (inv.payment_voucher_id) {
    return `<div style="color:var(--grey-500,#666);font-size:0.9rem;">Linked to Payment Voucher #${inv.payment_voucher_id}.</div>`;
  }
  window._pvSiPendingInvoice = inv;
  return `<button class="btn" onclick="_pvSiOpenCreateVoucherModal(${inv.id})">Create Payment Voucher</button>`;
}

function _pvSiOpenCreateVoucherModal(invoiceId) {
  const invoice = (window._pvSiPendingInvoice && String(window._pvSiPendingInvoice.id) === String(invoiceId)) ? window._pvSiPendingInvoice : {};
  const wrap = document.createElement('div');
  wrap.id = 'pv-si-pv-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:auto;padding:24px;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:640px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Create Payment Voucher</h3>
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
          <select id="si-pv-ledger" class="fin-form-select"><option value="">Please Select</option>${_pvLedgerOptions(null)}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Cost Center <span class="fin-required">*</span></label>
          <select id="si-pv-cost-center" class="fin-form-select"><option value="">Please Select</option>${_pvCostCenterOptions(null)}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Department <span class="fin-required">*</span></label>
          <select id="si-pv-department" class="fin-form-select"><option value="">Please Select</option>${_pvDepartmentOptions(null)}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Debit Account</label>
          <select id="si-pv-debit-account" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions(null)}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Tendepay Wallet</label>
          <select id="si-pv-tendepay-wallet" class="fin-form-select"><option value="">Please Select</option>${_pvTendepayWalletOptions(null)}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Amount (KES) <span class="fin-required">*</span></label>
          <input type="number" id="si-pv-amount" class="fin-form-input" step="0.01" min="0.01" value="${invoice.amount || ''}">
        </div>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Description <span class="fin-required">*</span></label>
        <textarea id="si-pv-description" class="fin-form-textarea" rows="3">${_finEsc(`Payment for supplier invoice ${invoice.invoice_number || ''}`.trim())}</textarea>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('pv-si-pv-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" onclick="_pvSiSubmitCreateVoucher(${invoiceId}, ${invoice.supplier_id || 'null'})">Create</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _pvSiSubmitCreateVoucher(invoiceId, supplierId) {
  const ledgerId = parseInt(document.getElementById('si-pv-ledger').value, 10);
  const costCenterId = parseInt(document.getElementById('si-pv-cost-center').value, 10);
  const departmentId = parseInt(document.getElementById('si-pv-department').value, 10);
  const amount = parseFloat(document.getElementById('si-pv-amount').value);
  const description = document.getElementById('si-pv-description').value.trim();
  if (!ledgerId || !costCenterId || !departmentId || !(amount > 0) || !description) {
    showToast('Ledger, Cost Center, Department, Amount and Description are all required.', 'error');
    return;
  }
  const debitAccountEl = document.getElementById('si-pv-debit-account');
  const walletEl = document.getElementById('si-pv-tendepay-wallet');
  const payload = {
    ledger_id: ledgerId,
    cost_center_id: costCenterId,
    payee_type: 'Supplier',
    payee_id: supplierId || null,
    payee_name_freetext: null,
    department_id: departmentId,
    amount,
    description,
    notes: null,
    debit_account_id: debitAccountEl.value ? parseInt(debitAccountEl.value, 10) : null,
    tendepay_wallet_account_id: walletEl.value ? parseInt(walletEl.value, 10) : null,
  };
  const res = await apiFetch(`${_PV_SI_API}/${invoiceId}/create-payment-voucher`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    document.getElementById('pv-si-pv-modal-overlay')?.remove();
    showToast('Payment voucher created.', 'success');
    await window._splitRefreshSelected?.();
  } else if (res && res.status === 409) {
    showToast('This invoice already has a payment voucher.', 'error');
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function loadPayablesSupplierInvoicesMissingEtimsView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Supplier Invoices — Missing eTIMS',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-supplier-invoices'},
      {label:'Missing eTIMS'}
    ],
    apiUrl: `${_PV_SI_API}/missing-etims`,
    searchFields: ['invoice_number'],
    col1Label: 'Supplier', col2Label: 'Invoice No',
    col1: inv => _pvSupplierName(inv.supplier_id) || '—',
    col2: inv => inv.invoice_number || `#${inv.id}`,
    rowLabel: inv => _pvSupplierName(inv.supplier_id) || '—',
    rowSub:   inv => inv.invoice_number || '',
    idKey: 'id',
    detailFields: [
      {label:'Invoice No',   key:'invoice_number', fmt:v=>v||'—'},
      {label:'Supplier',     key:'supplier_id', fmt:v=>_pvSupplierName(v)},
      {label:'Invoice Date', key:'invoice_date', fmt:v=>_pvDate(v)},
      {label:'Due Date',     key:'due_date', fmt:v=>_pvDate(v)},
      {label:'Amount',       key:'amount', fmt:v=>_pvMoney(v)},
      {label:'eTIMS No',     key:'etims_invoice_number', fmt:v=>v||'Missing'},
    ],
    onEdit: item => { window._pvEditSiId = item.id; loadView('payables-supplier-invoices-edit'); },
  });
}

async function _pvRefreshSiData(url) {
  renderSkeletonRows('pv-si-table-container', 7);
  try {
    const res = await apiFetch(url);
    if (res && res.ok) { _pvSiData = _toArray(await res.json()); }
    else { showToast(`Could not load supplier invoices: HTTP ${res ? res.status : ''} ${res ? await parseApiError(res) : ''}`, 'error'); _pvSiData = []; }
  } catch (e) { showToast('Network error loading supplier invoices.', 'error'); _pvSiData = []; }
  _pvRenderSiTable(url);
}

function _pvRenderSiListPage(container, missingOnly) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${missingOnly ? 'Supplier Invoices &ndash; Missing eTIMS' : 'Supplier Invoices'}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; ${missingOnly ? 'Supplier Invoices &rsaquo; Missing eTIMS' : 'Supplier Invoices &rsaquo; Listing'}</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">Total <span id="pv-si-total">0</span> entries</div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV">&#128202;</button>
          ${missingOnly ? '' : `
            <button class="fin-btn-outline" onclick="loadView('payables-supplier-invoices-missing-etims')">Missing eTIMS</button>
            <button class="fin-btn-teal" onclick="loadView('payables-supplier-invoices-add')">+ Add</button>
          `}
        </div>
      </div>
      <div id="pv-si-table-container"></div>
      <div id="pv-si-pagination"></div>
    </div>`;
}

function _pvRenderSiTable(url) {
  const start = (_pvSiPage - 1) * _pvSiPerPage;
  const paged = _pvSiData.slice(start, start + _pvSiPerPage);
  const totalEl = document.getElementById('pv-si-total');
  if (totalEl) totalEl.textContent = _pvSiData.length;

  const rows = paged.length === 0
    ? `<tr><td colspan="7" class="fin-empty">No records found.</td></tr>`
    : paged.map(inv => `<tr>
        <td>${_finEsc(_pvSupplierName(inv.supplier_id))}</td>
        <td>${_finEsc(inv.invoice_number)}</td>
        <td>${_pvDate(inv.invoice_date)}</td>
        <td>${_pvDate(inv.due_date)}</td>
        <td>${_pvMoney(inv.amount)}</td>
        <td>${inv.etims_invoice_number ? _finEsc(inv.etims_invoice_number) : '<span style="color:#c0392b;background:#fde0de;padding:2px 8px;border-radius:10px;font-size:0.78rem;font-weight:600;">Missing</span>'}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="_pvToggleDropdown(event,'pv-si','${inv.id}')">&#8230;</button>
            <div id="pv-si-dd-${inv.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="window._pvEditSiId='${inv.id}';loadView('payables-supplier-invoices-edit');return false;">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`).join('');

  const el = document.getElementById('pv-si-table-container');
  if (el) el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>SUPPLIER</th><th>INVOICE NO.</th><th>INVOICE DATE</th><th>DUE DATE</th><th>AMOUNT</th><th>ETIMS NO.</th><th>ACTION</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  const pages = Math.max(1, Math.ceil(_pvSiData.length / _pvSiPerPage));
  let pg = ''; for (let i = 1; i <= pages; i++) pg += `<button class="${i === _pvSiPage ? 'fin-pg-active' : ''}" onclick="_pvSiGoPage(${i},'${url}')">${i}</button>`;
  const pgEl = document.getElementById('pv-si-pagination');
  if (pgEl) pgEl.innerHTML = `<div class="fin-pagination">${pg}</div>`;
}
function _pvSiGoPage(p, url) { _pvSiPage = p; _pvRenderSiTable(url); }

function _pvSiFormHtml(inv) {
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Supplier <span class="fin-required">*</span></label>
        <select id="si-f-supplier" class="fin-form-select"><option value="">Please Select</option>${_pvSupplierOptions(inv?.supplier_id)}</select>
        <span class="fin-field-error" id="si-f-supplier-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Invoice Number <span class="fin-required">*</span></label>
        <input type="text" id="si-f-invoice-number" class="fin-form-input" value="${_finEsc(inv?.invoice_number || '')}">
        <span class="fin-field-error" id="si-f-invno-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Invoice Date <span class="fin-required">*</span></label>
        <input type="date" id="si-f-invoice-date" class="fin-form-input" value="${inv?.invoice_date || ''}">
        <span class="fin-field-error" id="si-f-invdate-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Due Date <span class="fin-required">*</span></label>
        <input type="date" id="si-f-due-date" class="fin-form-input" value="${inv?.due_date || ''}">
        <span class="fin-field-error" id="si-f-duedate-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Amount (KES) <span class="fin-required">*</span></label>
        <input type="number" id="si-f-amount" class="fin-form-input" step="0.01" min="0.01" value="${inv?.amount || ''}">
        <span class="fin-field-error" id="si-f-amount-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">eTIMS Number</label>
        <input type="text" id="si-f-etims" class="fin-form-input" value="${_finEsc(inv?.etims_invoice_number || '')}">
      </div>
    </div>`;
}

async function loadPayablesSupplierInvoicesAddView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Supplier Invoice</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-supplier-invoices');return false;">Supplier Invoices</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        ${_pvSiFormHtml(null)}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_pvSiSubmitAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-supplier-invoices')">Cancel</button>
        </div>
      </div>
    </div>`;
}

function _pvSiValidate() {
  let valid = true;
  const req = [['si-f-supplier','si-f-supplier-err'],['si-f-invoice-number','si-f-invno-err'],
    ['si-f-invoice-date','si-f-invdate-err'],['si-f-due-date','si-f-duedate-err']];
  req.forEach(([fid,eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  const amount = parseFloat(document.getElementById('si-f-amount').value);
  document.getElementById('si-f-amount-err').textContent = (amount > 0) ? '' : 'Amount must be greater than 0.';
  if (!(amount > 0)) valid = false;
  return valid;
}
function _pvSiPayload() {
  return {
    supplier_id: parseInt(document.getElementById('si-f-supplier').value, 10),
    invoice_number: document.getElementById('si-f-invoice-number').value.trim(),
    invoice_date: document.getElementById('si-f-invoice-date').value,
    due_date: document.getElementById('si-f-due-date').value,
    amount: parseFloat(document.getElementById('si-f-amount').value),
    etims_invoice_number: document.getElementById('si-f-etims').value.trim() || null,
  };
}
async function _pvSiSubmitAdd() {
  if (!_pvSiValidate()) return;
  try {
    const res = await apiFetch(_PV_SI_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_pvSiPayload()) });
    if (res && res.ok) { showToast('Supplier invoice created successfully.', 'success'); loadView('payables-supplier-invoices'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

async function loadPayablesSupplierInvoicesEditView(container) {
  await _pvLoadLookups();
  const id = window._pvEditSiId;
  const res = await apiFetch(`${_PV_SI_API}/${id}`);
  if (!res || !res.ok) { showToast('Could not load supplier invoice.', 'error'); loadView('payables-supplier-invoices'); return; }
  const inv = await res.json();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Supplier Invoice</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-supplier-invoices');return false;">Supplier Invoices</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap">
        ${_pvSiFormHtml(inv)}
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_pvSiSubmitEdit(${inv.id})">Update</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-supplier-invoices')">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function _pvSiSubmitEdit(id) {
  if (!_pvSiValidate()) return;
  try {
    const res = await apiFetch(`${_PV_SI_API}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_pvSiPayload()) });
    if (res && res.ok) { showToast('Supplier invoice updated.', 'success'); loadView('payables-supplier-invoices'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

// ==================== A.8 SUPPLIER WHT VAT CERTIFICATE ====================
let _pvWhtData = [];
const _PV_WHT_API = `${API_BASE}/payables/wht-vat-certificates`;

async function loadPayablesWhtVatCertificatesView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Supplier WHT VAT Certificates',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-wht-vat-certificates'},
      {label:'WHT VAT Certificates'}
    ],
    apiUrl: _PV_WHT_API,
    searchFields: ['certificate_number'],
    col1Label: 'Certificate No', col2Label: 'Supplier',
    col1: c => c.certificate_number || '—',
    col2: c => _pvSupplierName(c.supplier_id) || '—',
    rowLabel: c => c.certificate_number || '—',
    rowSub:   c => _pvSupplierName(c.supplier_id) || '',
    idKey: 'id',
    detailFields: [
      {label:'Certificate No', key:'certificate_number', fmt:v=>v||'—'},
      {label:'Supplier',       key:'supplier_id', fmt:v=>_pvSupplierName(v)},
      {label:'WHT Amount',     key:'wht_amount', fmt:v=>_pvMoney(v)},
      {label:'Issue Date',     key:'issue_date', fmt:v=>_pvDate(v)},
    ],
  });
}
function _pvRenderWhtTable() {
  const rows = _pvWhtData.length === 0
    ? `<tr><td colspan="6" class="fin-empty">No records found.</td></tr>`
    : _pvWhtData.map(c => `<tr>
        <td>${_finEsc(c.certificate_number)}</td>
        <td>${_finEsc(_pvSupplierName(c.supplier_id))}</td>
        <td>${_pvDate(c.issue_date)}</td>
        <td>${_pvMoney(c.wht_amount)}</td>
        <td>${_pvDate(c.issue_date)}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="_pvToggleDropdown(event,'pv-wht','${c.id}')">&#8230;</button>
            <div id="pv-wht-dd-${c.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="_pvWhtDownload(${c.id});return false;">&#11015; Download</a>
              <a href="#" onclick="_pvWhtRegenerate(${c.id});return false;">&#8635; Regenerate PDF</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  const el = document.getElementById('pv-wht-table-container');
  if (el) el.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>CERTIFICATE NO.</th><th>SUPPLIER</th><th>PERIOD</th><th>AMOUNT</th><th>GENERATED AT</th><th>ACTION</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}
async function _pvWhtDownload(id) {
  const res = await apiFetch(`${_PV_WHT_API}/${id}/download`);
  if (res && res.ok) {
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wht-certificate-${id}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
  } else if (res) showToast('Could not download certificate: ' + await parseApiError(res), 'error');
}
async function _pvWhtRegenerate(id) {
  const res = await apiFetch(`${_PV_WHT_API}/${id}/regenerate-pdf`, { method: 'POST' });
  if (res && res.ok) showToast('Certificate PDF regenerated.', 'success');
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ==================== A.9.1 EXPENSE CLAIMS ====================
let _pvEcData = [];
const _PV_EC_API = `${API_BASE}/payables/expense-claims`;

async function loadPayablesExpenseClaimsView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Expense Claims',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-expense-claims'},
      {label:'Expense Claims'}
    ],
    apiUrl: _PV_EC_API,
    searchFields: ['status'],
    col1Label: 'Claimant', col2Label: 'Status',
    col1: c => c.claimant_id ? `Employee #${c.claimant_id}` : '—',
    col2: c => c.status || '—',
    rowLabel: c => `Employee #${c.claimant_id}`,
    rowSub:   c => c.status || '',
    idKey: 'id',
    detailFields: [
      {label:'Claimant',     key:'claimant_id', fmt:v=>`Employee #${v}`},
      {label:'Expense Date', key:'expense_date', fmt:v=>_pvDate(v)},
      {label:'Account',      key:'category_id', fmt:v=>_pvAccountName(v)},
      {label:'Amount',       key:'amount', fmt:v=>_pvMoney(v)},
      {label:'Status',       key:'status', fmt:v=>v||'—'},
    ],
    renderAdd: _pvAddPlaceholder('Expense Claim', 'payables-expense-claims-add', 'Submit a new staff expense claim.'),
    onAdd: () => loadView('payables-expense-claims-add'),
  });
}
function _pvRenderEcTable() {
  document.getElementById('pv-ec-total').textContent = _pvEcData.length;
  const rows = _pvEcData.length === 0
    ? `<tr><td colspan="6" class="fin-empty">No records found.</td></tr>`
    : _pvEcData.map(c => `<tr>
        <td>${_finEsc(currentUser && String(currentUser.id) === String(c.claimant_id) ? (currentUser.full_name || currentUser.name || 'You') : ('Employee #' + c.claimant_id))}</td>
        <td>${_pvDate(c.expense_date)}</td>
        <td>${_finEsc(_pvAccountName(c.category_id))}</td>
        <td>${_pvMoney(c.amount)}</td>
        <td>${_pvBadge(c.status)}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="_pvToggleDropdown(event,'pv-ec','${c.id}')">&#8230;</button>
            <div id="pv-ec-dd-${c.id}" class="fin-action-dropdown" style="display:none;">
              ${c.status === 'submitted' ? `
                <a href="#" onclick="_pvEcApprove(${c.id});return false;">&#10003; Approve</a>
                <a href="#" onclick="_pvEcReject(${c.id});return false;">&#10005; Reject</a>` : ''}
            </div>
          </div>
        </td>
      </tr>`).join('');
  document.getElementById('pv-ec-table-container').innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>CLAIMANT</th><th>EXPENSE DATE</th><th>ACCOUNT</th><th>AMOUNT</th><th>STATUS</th><th>ACTION</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}
async function _pvEcApprove(id) {
  const res = await apiFetch(`${_PV_EC_API}/${id}/approve`, { method: 'POST' });
  if (res && res.ok) { showToast('Expense claim approved.', 'success'); loadPayablesExpenseClaimsView(document.getElementById('main-content')); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
function _pvEcReject(id) {
  _pvShowReasonModal('Reject Expense Claim', async (reason) => {
    const res = await apiFetch(`${_PV_EC_API}/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    if (res && res.ok) { showToast('Expense claim rejected.', 'success'); loadPayablesExpenseClaimsView(document.getElementById('main-content')); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  });
}
async function loadPayablesExpenseClaimsAddView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Expense Claim</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-expense-claims');return false;">Expense Claims</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div class="fin-form-group">
          <label class="fin-form-label">Claimant</label>
          <input type="text" class="fin-form-input" value="${_finEsc(currentUser ? (currentUser.full_name || currentUser.name || currentUser.email || '') : '')}" disabled>
        </div>
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Expense Date <span class="fin-required">*</span></label>
            <input type="date" id="ec-f-date" class="fin-form-input">
            <span class="fin-field-error" id="ec-f-date-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Account/Category <span class="fin-required">*</span></label>
            <select id="ec-f-category" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions()}</select>
            <span class="fin-field-error" id="ec-f-category-err"></span>
          </div>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Amount (KES) <span class="fin-required">*</span></label>
          <input type="number" id="ec-f-amount" class="fin-form-input" step="0.01" min="0.01">
          <span class="fin-field-error" id="ec-f-amount-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Description <span class="fin-required">*</span></label>
          <textarea id="ec-f-description" class="fin-form-textarea" rows="4"></textarea>
          <span class="fin-field-error" id="ec-f-description-err"></span>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_pvEcSubmitAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-expense-claims')">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function _pvEcSubmitAdd() {
  let valid = true;
  [['ec-f-date','ec-f-date-err'],['ec-f-category','ec-f-category-err'],['ec-f-description','ec-f-description-err']].forEach(([fid,eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  const amount = parseFloat(document.getElementById('ec-f-amount').value);
  document.getElementById('ec-f-amount-err').textContent = (amount > 0) ? '' : 'Amount must be greater than 0.';
  if (!(amount > 0)) valid = false;
  if (!valid) return;
  const payload = {
    description: document.getElementById('ec-f-description').value.trim(),
    amount, expense_date: document.getElementById('ec-f-date').value,
    category_id: parseInt(document.getElementById('ec-f-category').value, 10),
  };
  try {
    const res = await apiFetch(_PV_EC_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) { showToast('Expense claim submitted.', 'success'); loadView('payables-expense-claims'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

// ==================== A.9.2 EXPENSE CLAIM DISBURSEMENTS ====================
let _pvEcdData = [], _pvEcdApprovedClaims = [];
const _PV_ECD_API = `${API_BASE}/payables/expense-claim-disbursements`;

async function loadPayablesExpenseClaimDisbursementsView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Expense Claim Disbursements',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-expense-claim-disbursements'},
      {label:'Expense Claim Disbursements'}
    ],
    apiUrl: _PV_ECD_API,
    col1Label: 'Claim', col2Label: 'Amount',
    col1: d => `Claim #${d.expense_claim_id}`,
    col2: d => _pvMoney(d.disbursed_amount),
    rowLabel: d => `Claim #${d.expense_claim_id}`,
    rowSub:   d => _pvDate(d.disbursement_date) || '',
    idKey: 'id',
    detailFields: [
      {label:'Claim Ref',         key:'expense_claim_id', fmt:v=>`Claim #${v}`},
      {label:'Amount Disbursed',  key:'disbursed_amount', fmt:v=>_pvMoney(v)},
      {label:'Disbursement Date', key:'disbursement_date', fmt:v=>_pvDate(v)},
      {label:'Journal Entry',     key:'journal_entry_id', fmt:v=>v?`JV #${v}`:'—'},
    ],
    renderAdd: _pvAddPlaceholder('Expense Claim Disbursement', 'payables-expense-claim-disbursements-add', 'Disburse an approved expense claim.'),
    onAdd: () => loadView('payables-expense-claim-disbursements-add'),
  });
}
async function loadPayablesExpenseClaimDisbursementsAddView(container) {
  await _pvLoadLookups();
  const res = await apiFetch(`${_PV_EC_API}?status=approved`);
  _pvEcdApprovedClaims = (res && res.ok) ? _toArray(await res.json()) : [];
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Expense Claim Disbursement</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-expense-claim-disbursements');return false;">Expense Claim Disbursements</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div class="fin-form-group">
          <label class="fin-form-label">Expense Claim <span class="fin-required">*</span></label>
          <select id="ecd-f-claim" class="fin-form-select">
            <option value="">Please Select</option>
            ${_pvEcdApprovedClaims.map(c => `<option value="${c.id}">Claim #${c.id} &ndash; ${_pvMoney(c.amount)}</option>`).join('')}
          </select>
          <span class="fin-field-error" id="ecd-f-claim-err"></span>
        </div>
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Disbursement Date <span class="fin-required">*</span></label>
            <input type="date" id="ecd-f-date" class="fin-form-input">
            <span class="fin-field-error" id="ecd-f-date-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Payment Method <span class="fin-required">*</span></label>
            <select id="ecd-f-method" class="fin-form-select">
              <option value="">Please Select</option>${_PV_DISBURSEMENT_METHODS.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
            <span class="fin-field-error" id="ecd-f-method-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Debit Account <span class="fin-required">*</span></label>
            <select id="ecd-f-debit" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions()}</select>
            <span class="fin-field-error" id="ecd-f-debit-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Credit Bank Account <span class="fin-required">*</span></label>
            <select id="ecd-f-credit" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions()}</select>
            <span class="fin-field-error" id="ecd-f-credit-err"></span>
          </div>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_pvEcdSubmitAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-expense-claim-disbursements')">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function _pvEcdSubmitAdd() {
  let valid = true;
  [['ecd-f-claim','ecd-f-claim-err'],['ecd-f-date','ecd-f-date-err'],['ecd-f-method','ecd-f-method-err'],
   ['ecd-f-debit','ecd-f-debit-err'],['ecd-f-credit','ecd-f-credit-err']].forEach(([fid,eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  if (!valid) return;
  const claim = _pvEcdApprovedClaims.find(c => String(c.id) === document.getElementById('ecd-f-claim').value);
  const payload = {
    expense_claim_id: parseInt(document.getElementById('ecd-f-claim').value, 10),
    disbursed_amount: parseFloat(claim.amount),
    disbursement_date: document.getElementById('ecd-f-date').value,
    disbursement_method: document.getElementById('ecd-f-method').value,
    debit_account_id: parseInt(document.getElementById('ecd-f-debit').value, 10),
    credit_bank_account_id: parseInt(document.getElementById('ecd-f-credit').value, 10),
  };
  try {
    const res = await apiFetch(_PV_ECD_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) { showToast('Disbursement recorded. A journal entry has been created.', 'success'); loadView('payables-expense-claim-disbursements'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

// ==================== A.10.1 PETTY CASH APPLICATIONS ====================
let _pvPcaData = [];
const _PV_PCA_API = `${API_BASE}/payables/petty-cash-applications`;

async function loadPayablesPettyCashApplicationsView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Petty Cash Applications',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-petty-cash-applications'},
      {label:'Petty Cash Applications'}
    ],
    apiUrl: _PV_PCA_API,
    searchFields: ['purpose','status'],
    col1Label: 'Purpose', col2Label: 'Status',
    col1: a => a.purpose || '—',
    col2: a => a.status || '—',
    rowLabel: a => a.purpose || '—',
    rowSub:   a => a.status || '',
    idKey: 'id',
    detailFields: [
      {label:'Applicant', key:'applicant_id', fmt:v=>`Employee #${v}`},
      {label:'Purpose',   key:'purpose', fmt:v=>v||'—'},
      {label:'Amount',    key:'requested_amount', fmt:v=>_pvMoney(v)},
      {label:'Status',    key:'status', fmt:v=>v||'—'},
    ],
    renderAdd: _pvAddPlaceholder('Petty Cash Application', 'payables-petty-cash-applications-add', 'Apply for a petty cash float.'),
    onAdd: () => loadView('payables-petty-cash-applications-add'),
  });
}
async function _pvPcaApprove(id) {
  const res = await apiFetch(`${_PV_PCA_API}/${id}/approve`, { method: 'POST' });
  if (res && res.ok) { showToast('Petty cash application approved.', 'success'); loadPayablesPettyCashApplicationsView(document.getElementById('main-content')); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
async function loadPayablesPettyCashApplicationsAddView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Petty Cash Application</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-petty-cash-applications');return false;">Petty Cash Applications</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div class="fin-form-group">
          <label class="fin-form-label">Applicant</label>
          <input type="text" class="fin-form-input" value="${_finEsc(currentUser ? (currentUser.full_name || currentUser.name || currentUser.email || '') : '')}" disabled>
        </div>
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Amount Requested <span class="fin-required">*</span></label>
            <input type="number" id="pca-f-amount" class="fin-form-input" step="0.01" min="0.01">
            <span class="fin-field-error" id="pca-f-amount-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Department <span class="fin-required">*</span></label>
            <select id="pca-f-department" class="fin-form-select"><option value="">Please Select</option>${_pvDepartmentOptions()}</select>
            <span class="fin-field-error" id="pca-f-dept-err"></span>
          </div>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Purpose <span class="fin-required">*</span></label>
          <textarea id="pca-f-purpose" class="fin-form-textarea" rows="4"></textarea>
          <span class="fin-field-error" id="pca-f-purpose-err"></span>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_pvPcaSubmitAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-petty-cash-applications')">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function _pvPcaSubmitAdd() {
  let valid = true;
  [['pca-f-department','pca-f-dept-err'],['pca-f-purpose','pca-f-purpose-err']].forEach(([fid,eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  const amount = parseFloat(document.getElementById('pca-f-amount').value);
  document.getElementById('pca-f-amount-err').textContent = (amount > 0) ? '' : 'Amount must be greater than 0.';
  if (!(amount > 0)) valid = false;
  if (!valid) return;
  const payload = { purpose: document.getElementById('pca-f-purpose').value.trim(), requested_amount: amount, department_id: parseInt(document.getElementById('pca-f-department').value, 10) };
  try {
    const res = await apiFetch(_PV_PCA_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) { showToast('Petty cash application submitted.', 'success'); loadView('payables-petty-cash-applications'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

// ==================== A.10.2 PETTY CASH DISBURSEMENTS ====================
let _pvPcdData = [], _pvPcdApprovedApps = [];
const _PV_PCD_API = `${API_BASE}/payables/petty-cash-disbursements`;

async function loadPayablesPettyCashDisbursementsView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Petty Cash Disbursements',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-petty-cash-disbursements'},
      {label:'Petty Cash Disbursements'}
    ],
    apiUrl: _PV_PCD_API,
    col1Label: 'Application', col2Label: 'Amount',
    col1: d => `App #${d.petty_cash_application_id}`,
    col2: d => _pvMoney(d.disbursed_amount),
    rowLabel: d => `App #${d.petty_cash_application_id}`,
    rowSub:   d => _pvDate(d.disbursement_date) || '',
    idKey: 'id',
    detailFields: [
      {label:'Application Ref',   key:'petty_cash_application_id', fmt:v=>`App #${v}`},
      {label:'Amount Disbursed',  key:'disbursed_amount', fmt:v=>_pvMoney(v)},
      {label:'Disbursement Date', key:'disbursement_date', fmt:v=>_pvDate(v)},
    ],
    renderAdd: _pvAddPlaceholder('Petty Cash Disbursement', 'payables-petty-cash-disbursements-add', 'Disburse an approved petty cash application.'),
    onAdd: () => loadView('payables-petty-cash-disbursements-add'),
  });
}
async function loadPayablesPettyCashDisbursementsAddView(container) {
  await _pvLoadLookups();
  const res = await apiFetch(`${_PV_PCA_API}?status=approved`);
  _pvPcdApprovedApps = (res && res.ok) ? _toArray(await res.json()) : [];
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Petty Cash Disbursement</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-petty-cash-disbursements');return false;">Petty Cash Disbursements</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div class="fin-form-group">
          <label class="fin-form-label">Petty Cash Application <span class="fin-required">*</span></label>
          <select id="pcd-f-app" class="fin-form-select">
            <option value="">Please Select</option>
            ${_pvPcdApprovedApps.map(a => `<option value="${a.id}">${_finEsc(a.purpose)} &ndash; ${_pvMoney(a.requested_amount)}</option>`).join('')}
          </select>
          <span class="fin-field-error" id="pcd-f-app-err"></span>
        </div>
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Disbursement Date <span class="fin-required">*</span></label>
            <input type="date" id="pcd-f-date" class="fin-form-input">
            <span class="fin-field-error" id="pcd-f-date-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Amount Disbursed <span class="fin-required">*</span></label>
            <input type="number" id="pcd-f-amount" class="fin-form-input" step="0.01" min="0.01">
            <span class="fin-field-error" id="pcd-f-amount-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Debit Account <span class="fin-required">*</span></label>
            <select id="pcd-f-debit" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions()}</select>
            <span class="fin-field-error" id="pcd-f-debit-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Credit Bank Account <span class="fin-required">*</span></label>
            <select id="pcd-f-credit" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions()}</select>
            <span class="fin-field-error" id="pcd-f-credit-err"></span>
          </div>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_pvPcdSubmitAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-petty-cash-disbursements')">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function _pvPcdSubmitAdd() {
  let valid = true;
  [['pcd-f-app','pcd-f-app-err'],['pcd-f-date','pcd-f-date-err'],['pcd-f-debit','pcd-f-debit-err'],['pcd-f-credit','pcd-f-credit-err']].forEach(([fid,eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  const amount = parseFloat(document.getElementById('pcd-f-amount').value);
  document.getElementById('pcd-f-amount-err').textContent = (amount > 0) ? '' : 'Amount must be greater than 0.';
  if (!(amount > 0)) valid = false;
  if (!valid) return;
  const payload = {
    petty_cash_application_id: parseInt(document.getElementById('pcd-f-app').value, 10),
    disbursed_amount: amount,
    disbursement_date: document.getElementById('pcd-f-date').value,
    debit_account_id: parseInt(document.getElementById('pcd-f-debit').value, 10),
    credit_bank_account_id: parseInt(document.getElementById('pcd-f-credit').value, 10),
  };
  try {
    const res = await apiFetch(_PV_PCD_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) { showToast('Disbursement recorded.', 'success'); loadView('payables-petty-cash-disbursements'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

// ==================== A.11.1 IMPREST WARRANT ====================
let _pvIwData = [];
const _PV_IW_API = `${API_BASE}/payables/imprest-warrants`;

async function loadPayablesImprestWarrantsView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Imprest Warrant',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-imprest-warrants'},
      {label:'Imprest Warrant'}
    ],
    apiUrl: _PV_IW_API,
    searchFields: ['purpose','status'],
    col1Label: 'Officer', col2Label: 'Status',
    col1: w => _pvEmployeeName(w.holder_id) || '—',
    col2: w => w.status || '—',
    rowLabel: w => _pvEmployeeName(w.holder_id) || '—',
    rowSub:   w => w.status || '',
    idKey: 'id',
    detailFields: [
      {label:'Officer',  key:'holder_id', fmt:v=>_pvEmployeeName(v)},
      {label:'Purpose',  key:'purpose', fmt:v=>v||'—'},
      {label:'Amount',   key:'authorized_amount', fmt:v=>_pvMoney(v)},
      {label:'Period',   key:'period_start', fmt:(_,w)=>`${_pvDate(w.period_start)} – ${_pvDate(w.period_end)}`},
      {label:'Status',   key:'status', fmt:v=>v||'—'},
    ],
    renderAdd: _pvAddPlaceholder('Imprest Warrant', 'payables-imprest-warrants-add', 'Issue a new imprest warrant.'),
    onAdd: () => loadView('payables-imprest-warrants-add'),
  });
}
async function loadPayablesImprestWarrantsOverdueView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Imprest Warrants — Overdue',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-imprest-warrants'},
      {label:'Overdue'}
    ],
    apiUrl: `${_PV_IW_API}/overdue`,
    searchFields: ['purpose'],
    col1Label: 'Officer', col2Label: 'Amount',
    col1: w => _pvEmployeeName(w.holder_id) || '—',
    col2: w => _pvMoney(w.authorized_amount),
    rowLabel: w => _pvEmployeeName(w.holder_id) || '—',
    rowSub:   w => w.status || '',
    idKey: 'id',
    detailFields: [
      {label:'Officer',  key:'holder_id', fmt:v=>_pvEmployeeName(v)},
      {label:'Purpose',  key:'purpose', fmt:v=>v||'—'},
      {label:'Amount',   key:'authorized_amount', fmt:v=>_pvMoney(v)},
      {label:'Period',   key:'period_start', fmt:(_,w)=>`${_pvDate(w.period_start)} – ${_pvDate(w.period_end)}`},
      {label:'Status',   key:'status', fmt:v=>v||'—'},
    ],
  });
}
async function _pvRenderIwListPage(container, url, overdueOnly) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${overdueOnly ? 'Imprest Warrants &ndash; Overdue' : 'Imprest Warrant'}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; ${overdueOnly ? 'Imprest Warrant &rsaquo; Overdue' : 'Imprest Warrant &rsaquo; Listing'}</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">Total <span id="pv-iw-total">0</span> entries</div>
        <div class="fin-controls-right">
          ${overdueOnly ? '' : `
            <button class="fin-btn-outline" onclick="loadView('payables-imprest-warrants-overdue')">Overdue</button>
            <button class="fin-btn-teal" onclick="loadView('payables-imprest-warrants-add')">+ Add</button>`}
        </div>
      </div>
      <div id="pv-iw-table-container"></div>
    </div>`;
  renderSkeletonRows('pv-iw-table-container', 7);
  try {
    const res = await apiFetch(url);
    _pvIwData = (res && res.ok) ? _toArray(await res.json()) : [];
  } catch (e) { _pvIwData = []; }
  document.getElementById('pv-iw-total').textContent = _pvIwData.length;
  const rows = _pvIwData.length === 0
    ? `<tr><td colspan="7" class="fin-empty">No records found.</td></tr>`
    : _pvIwData.map(w => `<tr>
        <td>${_finEsc(_pvEmployeeName(w.holder_id))}</td>
        <td>${_finEsc(w.purpose)}</td>
        <td>${_pvMoney(w.authorized_amount)}</td>
        <td>${_pvDate(w.period_start)}</td>
        <td>${_pvDate(w.period_end)}</td>
        <td>${_pvBadge(w.status)}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="_pvToggleDropdown(event,'pv-iw','${w.id}')">&#8230;</button>
            <div id="pv-iw-dd-${w.id}" class="fin-action-dropdown" style="display:none;">
              ${w.status === 'pending' ? `<a href="#" onclick="_pvIwApprove(${w.id});return false;">&#10003; Approve</a>` : ''}
            </div>
          </div>
        </td>
      </tr>`).join('');
  document.getElementById('pv-iw-table-container').innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>OFFICER</th><th>PURPOSE</th><th>AMOUNT</th><th>PERIOD START</th><th>PERIOD END</th><th>STATUS</th><th>ACTION</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}
async function _pvIwApprove(id) {
  const res = await apiFetch(`${_PV_IW_API}/${id}/approve`, { method: 'POST' });
  if (res && res.ok) { showToast('Imprest warrant approved.', 'success'); loadPayablesImprestWarrantsView(document.getElementById('main-content')); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
async function loadPayablesImprestWarrantsAddView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Imprest Warrant</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-imprest-warrants');return false;">Imprest Warrant</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div class="fin-form-group">
          <label class="fin-form-label">Personnel/Officer <span class="fin-required">*</span></label>
          <select id="iw-f-holder" class="fin-form-select"><option value="">Please Select</option>${_pvEmployeeOptions()}</select>
          <span class="fin-field-error" id="iw-f-holder-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Purpose <span class="fin-required">*</span></label>
          <textarea id="iw-f-purpose" class="fin-form-textarea" rows="3"></textarea>
          <span class="fin-field-error" id="iw-f-purpose-err"></span>
        </div>
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Amount Authorized <span class="fin-required">*</span></label>
            <input type="number" id="iw-f-amount" class="fin-form-input" step="0.01" min="0.01">
            <span class="fin-field-error" id="iw-f-amount-err"></span>
          </div>
          <div></div>
          <div class="fin-form-group">
            <label class="fin-form-label">Period Start <span class="fin-required">*</span></label>
            <input type="date" id="iw-f-start" class="fin-form-input">
            <span class="fin-field-error" id="iw-f-start-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Period End <span class="fin-required">*</span></label>
            <input type="date" id="iw-f-end" class="fin-form-input">
            <span class="fin-field-error" id="iw-f-end-err"></span>
          </div>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_pvIwSubmitAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-imprest-warrants')">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function _pvIwSubmitAdd() {
  let valid = true;
  [['iw-f-holder','iw-f-holder-err'],['iw-f-purpose','iw-f-purpose-err'],['iw-f-start','iw-f-start-err'],['iw-f-end','iw-f-end-err']].forEach(([fid,eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  const amount = parseFloat(document.getElementById('iw-f-amount').value);
  document.getElementById('iw-f-amount-err').textContent = (amount > 0) ? '' : 'Amount must be greater than 0.';
  if (!(amount > 0)) valid = false;
  if (!valid) return;
  const payload = {
    holder_id: parseInt(document.getElementById('iw-f-holder').value, 10),
    purpose: document.getElementById('iw-f-purpose').value.trim(),
    authorized_amount: amount,
    period_start: document.getElementById('iw-f-start').value,
    period_end: document.getElementById('iw-f-end').value,
  };
  try {
    const res = await apiFetch(_PV_IW_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) { showToast('Imprest warrant submitted.', 'success'); loadView('payables-imprest-warrants'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

// ==================== A.11.2 IMPREST DISBURSEMENTS ====================
let _pvIdData = [], _pvIdApprovedWarrants = [];
const _PV_ID_API = `${API_BASE}/payables/imprest-disbursements`;

async function loadPayablesImprestDisbursementsView(container) {
  await _pvLoadLookups();
  await renderSplitView({
    container,
    moduleKey: 'finance.payables',
    title: 'Imprest Disbursements',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'payables-imprest-disbursements'},
      {label:'Imprest Disbursements'}
    ],
    apiUrl: _PV_ID_API,
    col1Label: 'Warrant', col2Label: 'Amount',
    col1: d => `Warrant #${d.imprest_warrant_id}`,
    col2: d => _pvMoney(d.disbursed_amount),
    rowLabel: d => `Warrant #${d.imprest_warrant_id}`,
    rowSub:   d => _pvDate(d.disbursement_date) || '',
    idKey: 'id',
    detailFields: [
      {label:'Warrant Ref',       key:'imprest_warrant_id', fmt:v=>`Warrant #${v}`},
      {label:'Amount Disbursed',  key:'disbursed_amount', fmt:v=>_pvMoney(v)},
      {label:'Disbursement Date', key:'disbursement_date', fmt:v=>_pvDate(v)},
    ],
    renderAdd: _pvAddPlaceholder('Imprest Disbursement', 'payables-imprest-disbursements-add', 'Disburse against an approved imprest warrant.'),
    onAdd: () => loadView('payables-imprest-disbursements-add'),
  });
}
async function loadPayablesImprestDisbursementsAddView(container) {
  await _pvLoadLookups();
  const res = await apiFetch(`${_PV_IW_API}?status=approved`);
  _pvIdApprovedWarrants = (res && res.ok) ? _toArray(await res.json()) : [];
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Imprest Disbursement</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-imprest-disbursements');return false;">Imprest Disbursements</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div class="fin-form-group">
          <label class="fin-form-label">Imprest Warrant <span class="fin-required">*</span></label>
          <select id="id-f-warrant" class="fin-form-select">
            <option value="">Please Select</option>
            ${_pvIdApprovedWarrants.map(w => `<option value="${w.id}">${_finEsc(_pvEmployeeName(w.holder_id))} &ndash; ${_pvMoney(w.authorized_amount)} (${_pvDate(w.period_start)} - ${_pvDate(w.period_end)})</option>`).join('')}
          </select>
          <span class="fin-field-error" id="id-f-warrant-err"></span>
        </div>
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Disbursement Date <span class="fin-required">*</span></label>
            <input type="date" id="id-f-date" class="fin-form-input">
            <span class="fin-field-error" id="id-f-date-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Amount <span class="fin-required">*</span></label>
            <input type="number" id="id-f-amount" class="fin-form-input" step="0.01" min="0.01">
            <span class="fin-field-error" id="id-f-amount-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Debit Account <span class="fin-required">*</span></label>
            <select id="id-f-debit" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions()}</select>
            <span class="fin-field-error" id="id-f-debit-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Credit Bank Account <span class="fin-required">*</span></label>
            <select id="id-f-credit" class="fin-form-select"><option value="">Please Select</option>${_pvAccountOptions()}</select>
            <span class="fin-field-error" id="id-f-credit-err"></span>
          </div>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_pvIdSubmitAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-imprest-disbursements')">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function _pvIdSubmitAdd() {
  let valid = true;
  [['id-f-warrant','id-f-warrant-err'],['id-f-date','id-f-date-err'],['id-f-debit','id-f-debit-err'],['id-f-credit','id-f-credit-err']].forEach(([fid,eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  const amount = parseFloat(document.getElementById('id-f-amount').value);
  document.getElementById('id-f-amount-err').textContent = (amount > 0) ? '' : 'Amount must be greater than 0.';
  if (!(amount > 0)) valid = false;
  if (!valid) return;
  const payload = {
    imprest_warrant_id: parseInt(document.getElementById('id-f-warrant').value, 10),
    disbursed_amount: amount,
    disbursement_date: document.getElementById('id-f-date').value,
    debit_account_id: parseInt(document.getElementById('id-f-debit').value, 10),
    credit_bank_account_id: parseInt(document.getElementById('id-f-credit').value, 10),
  };
  try {
    const res = await apiFetch(_PV_ID_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) { showToast('Disbursement recorded.', 'success'); loadView('payables-imprest-disbursements'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

// ==================== A.11.3 IMPREST SURRENDERS ====================
// No GET list endpoint exists on the backend for imprest-surrenders (POST-only) —
// the listing below shows only what's been recorded in this session, with a note
// explaining there's no API to fetch historical surrenders yet.
let _pvIsApprovedWarrants = [], _pvIsSessionRecords = [];
const _PV_IS_API = `${API_BASE}/payables/imprest-surrenders`;

async function loadPayablesImprestSurrendersView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Imprest Surrenders</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Imprest Surrenders &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left" style="color:#888;font-style:italic;">No listing API yet &mdash; showing surrenders recorded this session only.</div>
        <div class="fin-controls-right"><button class="fin-btn-teal" onclick="loadView('payables-imprest-surrenders-add')">+ Add</button></div>
      </div>
      <div id="pv-isr-table-container"></div>
    </div>`;
  const rows = _pvIsSessionRecords.length === 0
    ? `<tr><td colspan="4" class="fin-empty">No records found.</td></tr>`
    : _pvIsSessionRecords.map(s => `<tr>
        <td>Warrant #${s.imprest_warrant_id}</td>
        <td>${_pvMoney(s.amount_spent)}</td>
        <td>${_pvMoney(s.amount_returned)}</td>
        <td>${_pvDate(s.surrender_date)}</td>
      </tr>`).join('');
  document.getElementById('pv-isr-table-container').innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>WARRANT REF</th><th>AMOUNT SPENT</th><th>AMOUNT SURRENDERED</th><th>DATE</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}
async function loadPayablesImprestSurrendersAddView(container) {
  await _pvLoadLookups();
  const res = await apiFetch(`${_PV_IW_API}?status=approved`);
  _pvIsApprovedWarrants = (res && res.ok) ? _toArray(await res.json()) : [];
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Imprest Surrender</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('payables-imprest-surrenders');return false;">Imprest Surrenders</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div class="fin-form-group">
          <label class="fin-form-label">Imprest Warrant <span class="fin-required">*</span></label>
          <select id="isr-f-warrant" class="fin-form-select" onchange="_pvIsrRecalc()">
            <option value="">Please Select</option>
            ${_pvIsApprovedWarrants.map(w => `<option value="${w.id}" data-amount="${w.authorized_amount}">${_finEsc(_pvEmployeeName(w.holder_id))} &ndash; ${_pvMoney(w.authorized_amount)}</option>`).join('')}
          </select>
          <span class="fin-field-error" id="isr-f-warrant-err"></span>
        </div>
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Amount Spent <span class="fin-required">*</span></label>
            <input type="number" id="isr-f-spent" class="fin-form-input" step="0.01" min="0" oninput="_pvIsrRecalc()">
            <span class="fin-field-error" id="isr-f-spent-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Amount Surrendered <span class="fin-required">*</span></label>
            <input type="number" id="isr-f-surrendered" class="fin-form-input" step="0.01" min="0">
            <span class="fin-field-error" id="isr-f-surrendered-err"></span>
          </div>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Surrender Date <span class="fin-required">*</span></label>
          <input type="date" id="isr-f-date" class="fin-form-input">
          <span class="fin-field-error" id="isr-f-date-err"></span>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_pvIsrSubmitAdd()">Submit</button>
          <button class="fin-btn-cancel" onclick="loadView('payables-imprest-surrenders')">Cancel</button>
        </div>
      </div>
    </div>`;
}
function _pvIsrRecalc() {
  const sel = document.getElementById('isr-f-warrant');
  const opt = sel.options[sel.selectedIndex];
  const authorized = opt ? parseFloat(opt.dataset.amount || 0) : 0;
  const spent = parseFloat(document.getElementById('isr-f-spent').value) || 0;
  document.getElementById('isr-f-surrendered').value = Math.max(0, authorized - spent).toFixed(2);
}
async function _pvIsrSubmitAdd() {
  let valid = true;
  [['isr-f-warrant','isr-f-warrant-err'],['isr-f-date','isr-f-date-err']].forEach(([fid,eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  const spent = parseFloat(document.getElementById('isr-f-spent').value);
  document.getElementById('isr-f-spent-err').textContent = (spent >= 0) ? '' : 'Required.';
  if (!(spent >= 0)) valid = false;
  const surrendered = parseFloat(document.getElementById('isr-f-surrendered').value);
  document.getElementById('isr-f-surrendered-err').textContent = (surrendered >= 0) ? '' : 'Required.';
  if (!(surrendered >= 0)) valid = false;
  if (!valid) return;
  const payload = {
    imprest_warrant_id: parseInt(document.getElementById('isr-f-warrant').value, 10),
    amount_spent: spent,
    amount_returned: surrendered,
    surrender_date: document.getElementById('isr-f-date').value,
  };
  try {
    const res = await apiFetch(_PV_IS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res && res.ok) {
      showToast('Imprest surrender recorded.', 'success');
      _pvIsSessionRecords.push(payload);
      loadView('payables-imprest-surrenders');
    } else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}
