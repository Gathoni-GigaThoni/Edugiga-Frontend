// ==================== PART B — JOURNAL ENTRY ====================
// Built against the real /api/journal-entries/ CRUD (confirmed live via
// openapi.json). The backend stores one flat `lines[]` array per entry
// (account_id, line_type: debit|credit, amount, line_order) rather than
// separate debit_lines/credit_lines arrays — the UI still shows two visual
// sections (Debit/Credit) per the design spec, but both feed the same
// lines[] array on submit. There is no /print endpoint for journal entries,
// so "Print" uses the browser's native print on the rendered detail instead.

const _JE_API = `${API_BASE}/journal-entries/`;
let _jePage = 1, _jePerPage = 10, _jeData = [];

// Deep-link handoff so other modules (e.g. Supplier Invoice's Accrual
// Journal Entry link) can navigate straight to a specific JE's detail pane
// instead of just the bare list. One-shot: read and cleared immediately so
// a later plain loadView('journal-entries') doesn't stick to the old id.
function _jeOpenDetail(id) {
  window._jeOpenId = id;
  loadView('journal-entries');
}

async function loadJournalEntriesView(container) {
  await _pvLoadLookups();
  const preselectId = window._jeOpenId ?? null;
  window._jeOpenId = null;
  await renderSplitView({
    container,
    title: 'Journal Entries',
    moduleKey: 'finance.journal_entries',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'journal-entries'},
      {label:'Journal Entries'}
    ],
    apiUrl: _JE_API,
    preselectId,
    searchFields: ['jv_number','reference','status'],
    col1Label: 'JV Number', col2Label: 'Status',
    col1: je => je.jv_number || `#${je.id}`,
    col2: je => je.status || '—',
    rowLabel: je => je.jv_number || `#${je.id}`,
    rowSub:   je => je.status || '',
    idKey: 'id',
    detailFields: [
      {label:'JV Number',  key:'jv_number', fmt:v=>v||'—'},
      {label:'Ledger',     key:'ledger_id', fmt:v=>_pvLedgerName(v)},
      {label:'Reference',  key:'reference', fmt:v=>v||'—'},
      {label:'Date',       key:'entry_date', fmt:v=>_pvDate(v)},
      // GET /journal-entries/ returns JournalEntryListItem — it carries a
      // pre-computed total_amount Decimal string but no lines[] at all
      // (lines[] only exists on the single-entry JournalEntryRead returned
      // by GET /journal-entries/{id}, used by View Detail/Edit). Reading
      // `key: 'lines'` here always summed an undefined array to 0 regardless
      // of the real total the backend sent in the same response.
      {label:'Amount',     key:'total_amount', fmt:v=>_pvMoney(v)},
      {label:'Status',     key:'status', fmt:v=>v||'—'},
    ],
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#128196;</div>
        <p style="font-weight:600;margin-bottom:8px">Add a New Journal Entry</p>
        <p style="font-size:13px;margin-bottom:20px">Post a manual debit/credit journal entry.</p>
        <button class="btn-primary" style="padding:10px 24px" onclick="loadView('journal-entries-add')">+ Add Journal Entry</button>
      </div>`;
    },
    onAdd: () => loadView('journal-entries-add'),
    onEdit: item => { window._jeEditId = item.id; loadView('journal-entries-edit'); },
    bulkUpload: { module: 'journal-entries' },
  });
}

async function _jeRefreshData() {
  renderSkeletonRows('je-table-container', 7);
  try {
    const res = await apiFetch(_JE_API);
    if (res && res.ok) { _jeData = _toArray(await res.json()); }
    else { showToast(`Could not load journal entries: HTTP ${res ? res.status : ''} ${res ? await parseApiError(res) : ''}`, 'error'); _jeData = []; }
  } catch (e) { showToast('Network error loading journal entries.', 'error'); _jeData = []; }
  _jeRenderTable();
}

function _jeRenderListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Journal Entry</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Journal Entry &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">Total <span id="je-total">0</span> entries</div>
        <div class="fin-controls-right"><button class="fin-btn-teal" onclick="loadView('journal-entries-add')">+ Add</button></div>
      </div>
      <div id="je-table-container"></div>
      <div id="je-pagination"></div>
    </div>`;
}

function _jeLineTotal(je) {
  return parseFloat(je.total_amount || 0);
}

function _jeRenderTable() {
  const start = (_jePage - 1) * _jePerPage;
  const paged = _jeData.slice(start, start + _jePerPage);
  document.getElementById('je-total').textContent = _jeData.length;

  const rows = paged.length === 0
    ? `<tr><td colspan="7" class="fin-empty">No records found.</td></tr>`
    : paged.map(je => `<tr>
        <td>${_finEsc(je.jv_number)}</td>
        <td>${_finEsc(_pvLedgerName(je.ledger_id))}</td>
        <td>${_finEsc(je.reference)}</td>
        <td>${_pvDate(je.entry_date)}</td>
        <td>${_pvMoney(_jeLineTotal(je))}</td>
        <td>${_pvBadge(je.status)}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="_pvToggleDropdown(event,'je','${je.id}')">&#8230;</button>
            <div id="je-dd-${je.id}" class="fin-action-dropdown" style="display:none;">
              ${_jeActionsHtml(je)}
            </div>
          </div>
        </td>
      </tr>`).join('');

  document.getElementById('je-table-container').innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>JV NUMBER</th><th>LEDGER</th><th>REFERENCE</th><th>DATE</th><th>TOTAL AMOUNT</th><th>STATUS</th><th>ACTION</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  const pages = Math.max(1, Math.ceil(_jeData.length / _jePerPage));
  let pg = ''; for (let i = 1; i <= pages; i++) pg += `<button class="${i === _jePage ? 'fin-pg-active' : ''}" onclick="_jeGoPage(${i})">${i}</button>`;
  document.getElementById('je-pagination').innerHTML = `<div class="fin-pagination">${pg}</div>`;
}
function _jeGoPage(p) { _jePage = p; _jeRenderTable(); }

function _jeActionsHtml(je) {
  let actions = '';
  if (je.status === 'draft') {
    actions += `<a href="#" onclick="window._jeEditId=${je.id};loadView('journal-entries-edit');return false;">&#9998; Edit</a>`;
    actions += `<a href="#" onclick="_jePost(${je.id});return false;">&#10148; Post</a>`;
  } else if (je.status === 'posted') {
    actions += `<a href="#" onclick="_jeReverse(${je.id});return false;">&#8634; Reverse</a>`;
    actions += `<a href="#" onclick="_jePrint(${je.id});return false;">&#128438; Print</a>`;
  }
  actions += `<a href="#" onclick="_jeViewDetail(${je.id});return false;">&#128065; View Detail</a>`;
  return actions;
}

async function _jePost(id) {
  const res = await apiFetch(`${_JE_API}${id}/post`, { method: 'POST' });
  if (res && res.ok) { showToast('Journal entry posted.', 'success'); await _jeRefreshData(); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
async function _jeReverse(id) {
  const res = await apiFetch(`${_JE_API}${id}/reverse`, { method: 'POST' });
  if (res && res.ok) { showToast('Reversing entry created and original marked reversed.', 'success'); await _jeRefreshData(); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}
async function _jeViewDetail(id) {
  const res = await apiFetch(`${_JE_API}${id}`);
  if (!res || !res.ok) { showToast('Could not load journal entry.', 'error'); return; }
  const je = await res.json();
  _jeShowDetailModal(je);
}
async function _jePrint(id) {
  const res = await apiFetch(`${_JE_API}${id}`);
  if (!res || !res.ok) { showToast('Could not load journal entry.', 'error'); return; }
  const je = await res.json();
  _jeShowDetailModal(je, true);
}

function _jeShowDetailModal(je, autoPrint) {
  const debits = (je.lines || []).filter(l => l.line_type === 'debit');
  const credits = (je.lines || []).filter(l => l.line_type === 'credit');
  const lineRows = (lines) => lines.map(l => `<tr><td>${_finEsc(_pvAccountName(l.account_id))}</td><td>${_pvMoney(l.amount)}</td></tr>`).join('');
  const wrap = document.createElement('div');
  wrap.id = 'je-detail-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div id="je-detail-print-area" style="background:white;border-radius:8px;padding:28px;width:560px;max-height:85vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 4px;color:#2c3e50;">Journal Voucher ${_finEsc(je.jv_number)}</h3>
      <div style="color:#777;font-size:0.85rem;margin-bottom:16px;">${_pvBadge(je.status)}</div>
      <div class="fin-info-grid" style="margin-bottom:16px;">
        <div class="fin-info-item"><span class="fin-info-label">Ledger</span><span class="fin-info-value">${_finEsc(_pvLedgerName(je.ledger_id))}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Cost Center</span><span class="fin-info-value">${_finEsc(_pvCostCenterName(je.cost_center_id))}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Reference</span><span class="fin-info-value">${_finEsc(je.reference)}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Date</span><span class="fin-info-value">${_pvDate(je.entry_date)}</span></div>
      </div>
      <div class="fin-section-label">Debit</div>
      <table class="fin-li-table"><thead><tr><th>Account</th><th>Amount</th></tr></thead><tbody>${lineRows(debits)}</tbody></table>
      <div class="fin-section-label">Credit</div>
      <table class="fin-li-table"><thead><tr><th>Account</th><th>Amount</th></tr></thead><tbody>${lineRows(credits)}</tbody></table>
      ${je.notes ? `<p style="margin-top:10px;color:#555;"><strong>Notes:</strong> ${_finEsc(je.notes)}</p>` : ''}
      <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;" class="je-modal-no-print">
        <button class="fin-btn-outline" onclick="window.print()">Print</button>
        <button class="fin-btn-cancel" onclick="document.getElementById('je-detail-modal-overlay').remove()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  if (autoPrint) setTimeout(() => window.print(), 200);
}

// ── Add / Edit form ──────────────────────────────────────────────────────────
let _jeDebitLines = [], _jeCreditLines = [];

function _jeLineBlockHtml(line, idx, type) {
  const list = type === 'debit' ? _jeDebitLines : _jeCreditLines;
  return `
    <tr>
      <td>
        <select class="fin-li-input" onchange="_jeUpdateLine('${type}',${idx},'account_id',this.value)">
          <option value="">Please Select</option>${_pvAccountOptions(line.account_id)}
        </select>
      </td>
      <td><input type="number" class="fin-li-input" step="0.01" min="0.01" value="${line.amount || ''}"
            oninput="_jeUpdateLine('${type}',${idx},'amount',this.value)"></td>
      <td><button class="fin-btn-li-rm" ${list.length <= 1 ? 'disabled' : ''} onclick="_jeRemoveLine('${type}',${idx})">&times;</button></td>
    </tr>`;
}
function _jeRenderLines(type) {
  const list = type === 'debit' ? _jeDebitLines : _jeCreditLines;
  const el = document.getElementById(`je-${type}-lines`);
  if (el) el.innerHTML = list.map((l, i) => _jeLineBlockHtml(l, i, type)).join('');
  _jeRecalcTotals();
}
function _jeAddLine(type) {
  (type === 'debit' ? _jeDebitLines : _jeCreditLines).push({ account_id: '', amount: '' });
  _jeRenderLines(type);
}
function _jeRemoveLine(type, idx) {
  const list = type === 'debit' ? _jeDebitLines : _jeCreditLines;
  if (list.length <= 1) return;
  list.splice(idx, 1);
  _jeRenderLines(type);
}
function _jeUpdateLine(type, idx, key, val) {
  const list = type === 'debit' ? _jeDebitLines : _jeCreditLines;
  list[idx][key] = key === 'account_id' ? parseInt(val, 10) : val;
  _jeRecalcTotals();
}
function _jeRecalcTotals() {
  const sum = (list) => list.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const debitTotal = sum(_jeDebitLines), creditTotal = sum(_jeCreditLines);
  document.getElementById('je-debit-total').textContent = _pvMoney(debitTotal);
  document.getElementById('je-credit-total').textContent = _pvMoney(creditTotal);
  const diff = Math.abs(debitTotal - creditTotal);
  const errEl = document.getElementById('je-balance-err');
  if (errEl) errEl.textContent = diff > 0.005 ? `Debit and credit totals must match. Difference: ${_pvMoney(diff)}` : '';
}

function _jeFormShellHtml(je) {
  return `
    <div class="fin-form-wrap" style="max-width:760px;">
      <div class="fin-filter-section">
        <div class="fin-section-label">Basic Information</div>
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">JV Number.</label>
            <input type="text" id="je-f-jvnumber" class="fin-form-input" disabled>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
            <select id="je-f-ledger" class="fin-form-select"><option value="">Please Select</option>${_pvLedgerOptions(je?.ledger_id)}</select>
            <span class="fin-field-error" id="je-f-ledger-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Cost Center <span class="fin-required">*</span></label>
            <select id="je-f-cost-center" class="fin-form-select"><option value="">Please Select</option>${_pvCostCenterOptions(je?.cost_center_id)}</select>
            <span class="fin-field-error" id="je-f-cc-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Currency</label>
            <input type="text" id="je-f-currency" class="fin-form-input" value="${_finEsc(je?.currency || 'KES')}">
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Reference <span class="fin-required">*</span></label>
            <input type="text" id="je-f-reference" class="fin-form-input" value="${_finEsc(je?.reference || '')}">
            <span class="fin-field-error" id="je-f-reference-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Date <span class="fin-required">*</span></label>
            <input type="date" id="je-f-date" class="fin-form-input" value="${je?.entry_date || ''}" onchange="_jeCheckLockedPeriod()">
            <span class="fin-field-error" id="je-f-date-err"></span>
          </div>
        </div>
        <div id="je-lock-panel"></div>
      </div>

      <div class="fin-filter-section">
        <div class="fin-section-label">Debit Account</div>
        <table class="fin-li-table">
          <thead><tr><th>GL Account</th><th>Amount</th><th></th></tr></thead>
          <tbody id="je-debit-lines"></tbody>
        </table>
        <a href="#" style="color:#2db3b3;font-weight:600;text-decoration:underline;font-size:0.88rem;" onclick="_jeAddLine('debit');return false;">+ Add More</a>
        <div style="margin-top:12px;font-weight:bold;">Total Debit Amount <span id="je-debit-total">KES 0.00</span></div>
      </div>

      <div class="fin-filter-section">
        <div class="fin-section-label">Credit Account</div>
        <table class="fin-li-table">
          <thead><tr><th>GL Account</th><th>Amount</th><th></th></tr></thead>
          <tbody id="je-credit-lines"></tbody>
        </table>
        <a href="#" style="color:#2db3b3;font-weight:600;text-decoration:underline;font-size:0.88rem;" onclick="_jeAddLine('credit');return false;">+ Add More</a>
        <div style="margin-top:12px;font-weight:bold;">Total Credit Amount <span id="je-credit-total">KES 0.00</span></div>
        <span class="fin-field-error" id="je-balance-err" style="display:block;margin-top:8px;"></span>
      </div>

      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="je-f-notes" class="fin-form-textarea" rows="5">${_finEsc(je?.notes || '')}</textarea>
      </div>
    </div>`;
}

// Locked-period guard (BE/FE Contract Addendum 2026-08-17 §1.9). Reads the
// closed-FY cache from fiscal-years.js — if the picked entry_date falls on
// or before a closed fiscal year's end_date, non-super-admins are blocked
// from posting and super-admins must supply a written override reason.
function _jeCheckLockedPeriod() {
  const panel = document.getElementById('je-lock-panel');
  const submitBtn = document.getElementById('je-submit-btn');
  if (!panel) return;
  const entryDate = document.getElementById('je-f-date').value;
  const locking = _fyFindLockingYear(entryDate);
  if (!locking) {
    panel.innerHTML = '';
    if (submitBtn) submitBtn.disabled = false;
    return;
  }
  if (_isSuperAdmin()) {
    panel.innerHTML = `
      <div style="background:var(--gold-100,#fdf3d0);border-left:3px solid var(--gold-500,#C9A227);border-radius:6px;padding:12px 16px;margin-top:12px;color:#7a6110;">
        This entry date falls within closed fiscal year <strong>${_finEsc(locking.code)}</strong> (${_pvDate(locking.end_date)}). Provide a written reason to override the lock:
        <div class="fin-form-group" style="margin-top:10px;">
          <textarea id="je-f-lock-reason" class="fin-form-textarea" rows="2" maxlength="400" oninput="_jeLockReasonChanged()"></textarea>
          <span class="fin-field-error" id="je-f-lock-reason-err"></span>
        </div>
      </div>`;
    _jeLockReasonChanged();
  } else {
    panel.innerHTML = `
      <div style="background:var(--gold-100,#fdf3d0);border-left:3px solid var(--gold-500,#C9A227);border-radius:6px;padding:12px 16px;margin-top:12px;color:#7a6110;">
        This entry date falls within closed fiscal year <strong>${_finEsc(locking.code)}</strong> (${_pvDate(locking.end_date)}). Posting to closed periods requires super-admin authorisation.
      </div>`;
    if (submitBtn) submitBtn.disabled = true;
  }
}
function _jeLockReasonChanged() {
  const submitBtn = document.getElementById('je-submit-btn');
  const reason = (document.getElementById('je-f-lock-reason')?.value || '').trim();
  if (submitBtn) submitBtn.disabled = reason.length < 3;
}

async function loadJournalEntryAddView(container) {
  await _pvLoadLookups();
  await _fyLoadClosedCache();
  _jeDebitLines = [{ account_id: '', amount: '' }];
  _jeCreditLines = [{ account_id: '', amount: '' }];
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Journal Entry</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('journal-entries');return false;">Journal Entry</a> &rsaquo; Add
        </div>
      </div>
      ${_jeFormShellHtml(null)}
      <div class="fin-form-actions">
        <button class="fin-btn-teal" id="je-submit-btn" onclick="_jeSubmitAdd()">Submit</button>
        <button class="fin-btn-cancel" onclick="loadView('journal-entries')">Cancel</button>
      </div>
    </div>`;
  _jeRenderLines('debit'); _jeRenderLines('credit');
  const preview = await _pvPreviewNextNumber(_JE_API, 'jv_number', 'JV', 6);
  document.getElementById('je-f-jvnumber').value = preview;
}

function _jeValidate() {
  let valid = true;
  [['je-f-ledger','je-f-ledger-err'],['je-f-cost-center','je-f-cc-err'],['je-f-reference','je-f-reference-err'],['je-f-date','je-f-date-err']].forEach(([fid,eid]) => {
    const v = document.getElementById(fid).value.trim();
    document.getElementById(eid).textContent = v ? '' : 'This field is required.';
    if (!v) valid = false;
  });
  const validLines = (list) => list.length > 0 && list.every(l => l.account_id && parseFloat(l.amount) > 0);
  if (!validLines(_jeDebitLines) || !validLines(_jeCreditLines)) {
    showToast('Each debit/credit line needs a GL Account and an amount greater than 0.', 'error');
    valid = false;
  }
  const debitTotal = _jeDebitLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const creditTotal = _jeCreditLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  if (Math.abs(debitTotal - creditTotal) > 0.005) {
    document.getElementById('je-balance-err').textContent = `Debit and credit totals must match. Difference: ${_pvMoney(Math.abs(debitTotal - creditTotal))}`;
    valid = false;
  }
  return valid;
}
function _jePayload() {
  const lines = [
    ..._jeDebitLines.map((l, i) => ({ account_id: l.account_id, line_type: 'debit', amount: parseFloat(l.amount), line_order: i + 1 })),
    ..._jeCreditLines.map((l, i) => ({ account_id: l.account_id, line_type: 'credit', amount: parseFloat(l.amount), line_order: _jeDebitLines.length + i + 1 })),
  ];
  const payload = {
    ledger_id: parseInt(document.getElementById('je-f-ledger').value, 10),
    cost_center_id: parseInt(document.getElementById('je-f-cost-center').value, 10),
    currency: document.getElementById('je-f-currency').value.trim() || 'KES',
    reference: document.getElementById('je-f-reference').value.trim(),
    entry_date: document.getElementById('je-f-date').value,
    notes: document.getElementById('je-f-notes').value.trim() || null,
    lines,
  };
  const lockReasonEl = document.getElementById('je-f-lock-reason');
  if (lockReasonEl && lockReasonEl.value.trim()) payload.lock_override_reason = lockReasonEl.value.trim();
  return payload;
}
async function _jeSubmitAdd() {
  if (!_jeValidate()) return;
  try {
    const res = await apiFetch(_JE_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_jePayload()) });
    if (res && res.ok) { showToast('Journal entry created. Status: Draft.', 'success'); loadView('journal-entries'); return; }
    if (res && res.status === 409) {
      // Backstop for a stale closed-FY cache — refresh it and surface the
      // server's reason verbatim (§1.9).
      await _fyLoadClosedCache(true);
      showToast('Error: ' + await parseApiError(res), 'error');
      _jeCheckLockedPeriod();
      return;
    }
    if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

async function loadJournalEntryEditView(container) {
  await _pvLoadLookups();
  const id = window._jeEditId;
  const res = await apiFetch(`${_JE_API}${id}`);
  if (!res || !res.ok) { showToast('Could not load journal entry.', 'error'); loadView('journal-entries'); return; }
  const je = await res.json();
  if (je.status !== 'draft') { showToast('Only draft entries can be edited.', 'error'); loadView('journal-entries'); return; }
  _jeDebitLines = (je.lines || []).filter(l => l.line_type === 'debit').map(l => ({ account_id: l.account_id, amount: l.amount }));
  _jeCreditLines = (je.lines || []).filter(l => l.line_type === 'credit').map(l => ({ account_id: l.account_id, amount: l.amount }));
  if (_jeDebitLines.length === 0) _jeDebitLines.push({ account_id: '', amount: '' });
  if (_jeCreditLines.length === 0) _jeCreditLines.push({ account_id: '', amount: '' });

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Journal Entry</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('journal-entries');return false;">Journal Entry</a> &rsaquo; Edit
        </div>
      </div>
      ${_jeFormShellHtml(je)}
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_jeSubmitEdit(${je.id})">Update</button>
        <button class="fin-btn-cancel" onclick="loadView('journal-entries')">Cancel</button>
      </div>
    </div>`;
  document.getElementById('je-f-jvnumber').value = je.jv_number;
  _jeRenderLines('debit'); _jeRenderLines('credit');
}
async function _jeSubmitEdit(id) {
  if (!_jeValidate()) return;
  try {
    const res = await apiFetch(`${_JE_API}${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_jePayload()) });
    if (res && res.ok) { showToast('Journal entry updated.', 'success'); loadView('journal-entries'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
  } catch (e) { showToast('Network error.', 'error'); }
}

// ==================== PART C — JE REVIEW ====================
// BE/FE Contract Addendum 2026-08-17 §9. Draft-JE review queue —
// depreciation, disposal, and manual DRAFTs land here (source is a fixed
// 3-value enum on the live backend: depreciation | disposal | manual, not
// an open-ended list per the addendum's own hedge). Reuses the
// finance.journal_entries permission scope.

const _JE_DRAFTS_API = `${API_BASE}/journal-entries/drafts`;
let _jeReviewData = [];
let _jeReviewSelected = new Set();
let _jeReviewFilters = { source: '', start_date: '', end_date: '' };

async function loadJeReviewView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">JE Review</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; JE Review</div>
      </div>
      <div class="fin-filter-section">
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Source</label>
            <select id="jer-f-source" class="fin-form-select" onchange="_jeReviewFilterChanged()">
              <option value="">All</option>
              <option value="depreciation">Depreciation</option>
              <option value="disposal">Disposal</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div class="fin-form-grid-2">
            <div class="fin-form-group">
              <label class="fin-form-label">Start Date</label>
              <input type="date" id="jer-f-start" class="fin-form-input" onchange="_jeReviewFilterChanged()">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">End Date</label>
              <input type="date" id="jer-f-end" class="fin-form-input" onchange="_jeReviewFilterChanged()">
            </div>
          </div>
        </div>
      </div>
      <div id="jer-bulk-bar" style="display:none;background:var(--navy-900,#0D2137);color:#fff;border-radius:6px;padding:10px 16px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
        <span id="jer-bulk-count">0 selected</span>
        <button class="fin-btn-teal" onclick="_jeReviewBulkApprove()">Bulk Approve</button>
      </div>
      <div id="jer-table-container"></div>
    </div>`;
  await _jeReviewLoad();
}

function _jeReviewFilterChanged() {
  _jeReviewFilters.source = document.getElementById('jer-f-source').value;
  _jeReviewFilters.start_date = document.getElementById('jer-f-start').value;
  _jeReviewFilters.end_date = document.getElementById('jer-f-end').value;
  _jeReviewLoad();
}

async function _jeReviewLoad() {
  renderSkeletonRows('jer-table-container', 7);
  const params = new URLSearchParams();
  if (_jeReviewFilters.source) params.set('source', _jeReviewFilters.source);
  if (_jeReviewFilters.start_date) params.set('start_date', _jeReviewFilters.start_date);
  if (_jeReviewFilters.end_date) params.set('end_date', _jeReviewFilters.end_date);
  const res = await apiFetch(`${_JE_DRAFTS_API}?${params.toString()}`);
  _jeReviewData = (res && res.ok) ? _toArray(await res.json()) : [];
  _jeReviewSelected.clear();
  _jeReviewRenderTable();
}

function _jeReviewRenderTable() {
  const rows = _jeReviewData.length === 0
    ? `<tr><td colspan="7" class="fin-empty">No draft entries found.</td></tr>`
    : _jeReviewData.map(je => `<tr>
        <td><input type="checkbox" ${_jeReviewSelected.has(je.id) ? 'checked' : ''} onchange="_jeReviewToggle(${je.id},this.checked)"></td>
        <td><a href="#" onclick="_jeReviewOpenDetail(${je.id});return false;">${_finEsc(je.jv_number)}</a></td>
        <td>${_finEsc(je.reference)}</td>
        <td>${_pvDate(je.entry_date)}</td>
        <td>${je.line_count}</td>
        <td>${_pvMoney(je.total_amount)}</td>
        <td>Staff #${je.created_by}</td>
      </tr>`).join('');
  document.getElementById('jer-table-container').innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th></th><th>JV NUMBER</th><th>REFERENCE</th><th>DATE</th><th>LINES</th><th>AMOUNT</th><th>CREATED BY</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  _jeReviewUpdateBulkBar();
}

function _jeReviewToggle(id, checked) {
  if (checked) _jeReviewSelected.add(id); else _jeReviewSelected.delete(id);
  _jeReviewUpdateBulkBar();
}
function _jeReviewUpdateBulkBar() {
  const bar = document.getElementById('jer-bulk-bar');
  const count = document.getElementById('jer-bulk-count');
  if (!bar || !count) return;
  bar.style.display = _jeReviewSelected.size > 0 ? 'flex' : 'none';
  count.textContent = `${_jeReviewSelected.size} selected`;
}

async function _jeReviewBulkApprove() {
  const ids = Array.from(_jeReviewSelected);
  if (ids.length === 0) return;
  await _jeReviewApproveIds(ids);
}

async function _jeReviewApproveIds(ids) {
  const res = await apiFetch(`${API_BASE}/journal-entries/bulk-approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry_ids: ids }),
  });
  if (!res) return;
  if (!res.ok) { showToast('Error: ' + await parseApiError(res), 'error'); return; }
  const result = await res.json();
  const approvedCount = (result.approved || []).length;
  const skipped = result.skipped || [];
  showToast(`${approvedCount} approved, ${skipped.length} skipped.`, skipped.length > 0 ? 'error' : 'success');
  if (skipped.length > 0) _jeReviewShowSkippedModal(skipped);
  document.getElementById('je-detail-modal-overlay')?.remove();
  await _jeReviewLoad();
}

function _jeReviewShowSkippedModal(skipped) {
  const byId = {};
  _jeReviewData.forEach(je => { byId[je.id] = je.jv_number; });
  const rows = skipped.map(s => `<tr><td>${_finEsc(byId[s.id] || ('#' + s.id))}</td><td>${_finEsc(s.reason || '')}</td></tr>`).join('');
  const wrap = document.createElement('div');
  wrap.id = 'jer-skipped-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10000;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:520px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;color:#2c3e50;">Skipped Entries</h3>
      <table class="fin-li-table"><thead><tr><th>JV Number</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>
      <div style="display:flex;justify-content:flex-end;margin-top:18px;">
        <button class="fin-btn-cancel" onclick="document.getElementById('jer-skipped-modal-overlay').remove()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _jeReviewOpenDetail(id) {
  const res = await apiFetch(`${_JE_API}${id}`);
  if (!res || !res.ok) { showToast('Could not load journal entry.', 'error'); return; }
  const je = await res.json();
  _jeReviewShowDetailModal(je);
}

function _jeReviewShowDetailModal(je) {
  const debits = (je.lines || []).filter(l => l.line_type === 'debit');
  const credits = (je.lines || []).filter(l => l.line_type === 'credit');
  const lineRows = (lines) => lines.map(l => `<tr><td>${_finEsc(_pvAccountName(l.account_id))}</td><td>${_pvMoney(l.amount)}</td></tr>`).join('');
  const wrap = document.createElement('div');
  wrap.id = 'je-detail-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:28px;width:560px;max-height:85vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 4px;color:#2c3e50;">Journal Voucher ${_finEsc(je.jv_number)}</h3>
      <div style="color:#777;font-size:0.85rem;margin-bottom:16px;">${_pvBadge(je.status)}</div>
      <div class="fin-info-grid" style="margin-bottom:16px;">
        <div class="fin-info-item"><span class="fin-info-label">Ledger</span><span class="fin-info-value">${_finEsc(_pvLedgerName(je.ledger_id))}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Cost Center</span><span class="fin-info-value">${_finEsc(_pvCostCenterName(je.cost_center_id))}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Reference</span><span class="fin-info-value">${_finEsc(je.reference)}</span></div>
        <div class="fin-info-item"><span class="fin-info-label">Date</span><span class="fin-info-value">${_pvDate(je.entry_date)}</span></div>
      </div>
      <div class="fin-section-label">Debit</div>
      <table class="fin-li-table"><thead><tr><th>Account</th><th>Amount</th></tr></thead><tbody>${lineRows(debits)}</tbody></table>
      <div class="fin-section-label">Credit</div>
      <table class="fin-li-table"><thead><tr><th>Account</th><th>Amount</th></tr></thead><tbody>${lineRows(credits)}</tbody></table>
      ${je.notes ? `<p style="margin-top:10px;color:#555;"><strong>Notes:</strong> ${_finEsc(je.notes)}</p>` : ''}
      <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">
        ${je.status === 'draft' ? `
          <button class="fin-btn-cancel" style="background:var(--coral-500,#D94040);color:#fff;" onclick="_jeReviewOpenRejectModal(${je.id})">Reject</button>
          <button class="fin-btn-teal" onclick="_jeReviewApproveIds([${je.id}])">Approve</button>
        ` : ''}
        <button class="fin-btn-cancel" onclick="document.getElementById('je-detail-modal-overlay').remove()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

function _jeReviewOpenRejectModal(id) {
  const wrap = document.createElement('div');
  wrap.id = 'jer-reject-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10000;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:480px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 12px;color:#2c3e50;">Reject Draft Entry</h3>
      <div style="background:var(--coral-100);border-left:3px solid var(--coral-500);border-radius:6px;padding:10px 14px;color:var(--coral-600);font-size:0.85rem;margin-bottom:14px;">
        Rejecting hard-deletes this draft JE. The reason is audit-logged.
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
        <textarea id="jer-reject-reason" class="fin-form-textarea" rows="3" maxlength="500" oninput="document.getElementById('jer-reject-count').textContent=this.value.length"></textarea>
        <span style="font-size:11px;color:var(--grey-500,#888);"><span id="jer-reject-count">0</span>/500</span>
        <span class="fin-field-error" id="jer-reject-err"></span>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('jer-reject-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" style="background:var(--coral-500,#D94040);" onclick="_jeReviewSubmitReject(${id})">Reject</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _jeReviewSubmitReject(id) {
  const reason = document.getElementById('jer-reject-reason').value.trim();
  if (reason.length < 3) {
    document.getElementById('jer-reject-err').textContent = 'Reason must be at least 3 characters.';
    return;
  }
  const res = await apiFetch(`${_JE_API}${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
  if (!res) return;
  if (res.status === 204 || res.ok) {
    document.getElementById('jer-reject-modal-overlay')?.remove();
    document.getElementById('je-detail-modal-overlay')?.remove();
    showToast('Draft entry rejected.', 'success');
    await _jeReviewLoad();
    return;
  }
  showToast('Error: ' + await parseApiError(res), 'error');
}
