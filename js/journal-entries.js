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

async function loadJournalEntriesView(container) {
  _jePage = 1;
  await _pvLoadLookups();
  _jeRenderListPage(container);
  await _jeRefreshData();
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
  return (je.lines || []).filter(l => l.line_type === 'debit').reduce((s, l) => s + parseFloat(l.amount || 0), 0);
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
            <input type="date" id="je-f-date" class="fin-form-input" value="${je?.entry_date || ''}">
            <span class="fin-field-error" id="je-f-date-err"></span>
          </div>
        </div>
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

async function loadJournalEntryAddView(container) {
  await _pvLoadLookups();
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
        <button class="fin-btn-teal" onclick="_jeSubmitAdd()">Submit</button>
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
  return {
    ledger_id: parseInt(document.getElementById('je-f-ledger').value, 10),
    cost_center_id: parseInt(document.getElementById('je-f-cost-center').value, 10),
    currency: document.getElementById('je-f-currency').value.trim() || 'KES',
    reference: document.getElementById('je-f-reference').value.trim(),
    entry_date: document.getElementById('je-f-date').value,
    notes: document.getElementById('je-f-notes').value.trim() || null,
    lines,
  };
}
async function _jeSubmitAdd() {
  if (!_jeValidate()) return;
  try {
    const res = await apiFetch(_JE_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_jePayload()) });
    if (res && res.ok) { showToast('Journal entry created. Status: Draft.', 'success'); loadView('journal-entries'); }
    else if (res) showToast('Error: ' + await parseApiError(res), 'error');
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
