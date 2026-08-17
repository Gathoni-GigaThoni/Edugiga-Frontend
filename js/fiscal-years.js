// ==================== FISCAL YEAR CLOSE-OFF ====================
// BE/FE Contract Addendum 2026-08-17 §1. Built against the live
// /api/fiscal-years/ endpoints (confirmed via openapi.json). Money fields
// are Decimal-serialised strings — never Number()-coerced for arithmetic,
// only for display via formatKES()/_pvMoney().

const _FY_API = `${API_BASE}/fiscal-years/`;

// ── Closed-FY cache — the locked-period guard on manual JE creation reads
// this (journal-entries.js §1.9). Fetched once per session, refreshed after
// any close/reopen action and as a backstop when a stale-cache 409 fires.
let _fyClosedYears = [];
let _fyClosedCacheLoaded = false;
async function _fyLoadClosedCache(force = false) {
  if (_fyClosedCacheLoaded && !force) return _fyClosedYears;
  const res = await apiFetch(_FY_API);
  const all = (res && res.ok) ? _toArray(await res.json()) : [];
  _fyClosedYears = all.filter(fy => fy.status === 'closed');
  _fyClosedCacheLoaded = true;
  return _fyClosedYears;
}
// Latest closed FY whose end_date is >= the given date, i.e. the FY that
// would lock out a JE posted on that date. Returns null if none locks it.
function _fyFindLockingYear(entryDate) {
  if (!entryDate) return null;
  const picked = new Date(entryDate).getTime();
  let locking = null;
  for (const fy of _fyClosedYears) {
    const end = new Date(fy.end_date).getTime();
    if (picked <= end && (!locking || end > new Date(locking.end_date).getTime())) locking = fy;
  }
  return locking;
}

function _fyBadge(status) {
  const isClosed = status === 'closed';
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:${isClosed ? '#fff' : '#8a6d00'};background:${isClosed ? 'var(--navy-700,#1B3057)' : '#f5e6a8'};">${isClosed ? 'Closed' : 'Open'}</span>`;
}

async function loadFiscalYearsView(container) {
  await _pvLoadLookups();
  await _fyLoadClosedCache(true);
  await renderSplitView({
    container,
    moduleKey: 'finance.year_close',
    title: 'Fiscal Years',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-fiscal-years'},
      {label:'Fiscal Years'}
    ],
    apiUrl: _FY_API,
    searchFields: ['code'],
    col1Label: 'Code', col2Label: 'Period',
    col1: fy => fy.code || `#${fy.id}`,
    col2: fy => `${_pvDate(fy.start_date)} → ${_pvDate(fy.end_date)}`,
    rowLabel: fy => fy.code || `#${fy.id}`,
    rowSub: fy => `${_pvDate(fy.start_date)} → ${_pvDate(fy.end_date)}`,
    idKey: 'id',
    detailFields: [
      {label:'Code', key:'code', fmt:v=>v||'—'},
      {label:'Start Date', key:'start_date', fmt:v=>_pvDate(v)},
      {label:'End Date', key:'end_date', fmt:v=>_pvDate(v)},
      {label:'Status', key:'status', fmt:v=>_fyBadge(v)},
      {label:'Close JE', key:'close_je_id', fmt:v=>v ? `<a href="#" onclick="_jeOpenDetail(${v});return false;">View Close JE</a>` : '—'},
      {label:'Closed At', key:'closed_at', hideWhen: fy=>!fy.closed_at, fmt:v=>_pvDate(v)},
      {label:'Closed By', key:'closed_by', hideWhen: fy=>!fy.closed_at, fmt:v=>v!=null?`Staff #${v}`:'—'},
      {label:'Notes', key:'notes', fullWidth: true, fmt:v=>v||'—'},
    ],
    renderAdd: _pvAddPlaceholder('Fiscal Year', 'fiscal-years-add', 'Define a fiscal year so it can later be closed off.'),
    onAdd: () => loadView('fiscal-years-add'),
    detailActions: _fyDetailActions,
  });
}

function _fyDetailActions(fy) {
  if (fy.status === 'open') {
    return `<button class="fin-btn-teal" onclick="_fyOpenClosePreview(${fy.id})">Preview Close</button>`;
  }
  if (fy.status === 'closed' && _isSuperAdmin()) {
    return `<button class="fin-btn-cancel" style="background:var(--coral-500,#D94040);color:#fff;" onclick="_fyOpenReopenModal(${fy.id},'${_finEsc(fy.code)}',${fy.close_je_id || 'null'})">Reopen</button>`;
  }
  return '';
}

// ── Add form ─────────────────────────────────────────────────────────────
async function loadFiscalYearAddView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Add Fiscal Year</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-fiscal-years');return false;">Fiscal Years</a> &rsaquo; Add
        </div>
      </div>
      <div class="fin-form-wrap">
        <div id="fy-conflict-banner" style="display:none;margin-bottom:14px;padding:10px 14px;border-radius:6px;border-left:3px solid var(--coral-500);background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;"></div>
        <div class="fin-form-group">
          <label class="fin-form-label">Code <span class="fin-required">*</span></label>
          <input type="text" id="fy-f-code" class="fin-form-input" placeholder="e.g. FY-2026" maxlength="20">
          <span style="font-size:11px;color:var(--grey-500,#888);">Human-readable code. Must be unique.</span>
          <span class="fin-field-error" id="fy-f-code-err"></span>
        </div>
        <div class="fin-form-grid-2">
          <div class="fin-form-group">
            <label class="fin-form-label">Start Date <span class="fin-required">*</span></label>
            <input type="date" id="fy-f-start" class="fin-form-input">
            <span class="fin-field-error" id="fy-f-start-err"></span>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">End Date <span class="fin-required">*</span></label>
            <input type="date" id="fy-f-end" class="fin-form-input">
            <span class="fin-field-error" id="fy-f-end-err"></span>
          </div>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Notes</label>
          <textarea id="fy-f-notes" class="fin-form-textarea" rows="3" maxlength="500"></textarea>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_fySubmitAdd()">Save</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-fiscal-years')">Cancel</button>
        </div>
      </div>
    </div>`;
}

async function _fySubmitAdd() {
  let valid = true;
  const code = document.getElementById('fy-f-code').value.trim();
  document.getElementById('fy-f-code-err').textContent = code ? '' : 'This field is required.';
  if (!code) valid = false;
  const start = document.getElementById('fy-f-start').value;
  document.getElementById('fy-f-start-err').textContent = start ? '' : 'This field is required.';
  if (!start) valid = false;
  const end = document.getElementById('fy-f-end').value;
  document.getElementById('fy-f-end-err').textContent = '';
  if (!end) { document.getElementById('fy-f-end-err').textContent = 'This field is required.'; valid = false; }
  else if (start && end <= start) { document.getElementById('fy-f-end-err').textContent = 'End Date must be after Start Date.'; valid = false; }
  if (!valid) return;

  const payload = { code, start_date: start, end_date: end, notes: document.getElementById('fy-f-notes').value.trim() || null };
  const res = await apiFetch(_FY_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (res && res.ok) {
    showToast('Fiscal year created.', 'success');
    loadView('fin-fiscal-years');
    return;
  }
  if (!res) return;
  const msg = await parseApiError(res);
  if (res.status === 409) {
    const banner = document.getElementById('fy-conflict-banner');
    if (banner) { banner.style.display = 'block'; banner.textContent = msg; }
  } else {
    showToast('Error: ' + msg, 'error');
  }
}

// ── Close preview / close ───────────────────────────────────────────────
function _fyCloseModalShell(id, bodyHtml) {
  const wrap = document.createElement('div');
  wrap.id = 'fy-close-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:auto;padding:24px;';
  wrap.innerHTML = `<div style="background:white;border-radius:8px;padding:28px;width:760px;max-width:100%;max-height:88vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);">${bodyHtml}</div>`;
  document.body.appendChild(wrap);
}

async function _fyOpenClosePreview(id) {
  const res = await apiFetch(`${_FY_API}${id}/close-preview`, { method: 'POST' });
  if (!res) return;
  if (!res.ok) { showToast('Error: ' + await parseApiError(res), 'error'); return; }
  const data = await res.json();
  _fyRenderClosePreview(id, data);
}

let _fyPreviewNetSurplus = null;

function _fyRenderClosePreview(id, data) {
  _fyPreviewNetSurplus = data.net_surplus;
  const netSurplus = parseFloat(data.net_surplus) || 0;
  const guardErrors = data.guard_errors || [];
  const canConfirm = guardErrors.length === 0 && data.is_balanced === true;

  const lineRows = (lines, side) => (lines || []).map(l => `
    <tr><td>${_finEsc(l.account_number)}</td><td>${_finEsc(l.account_name)}</td><td style="text-align:right;">${_pvMoney(l.amount)}</td></tr>`).join('');

  _fyCloseModalShell(id, `
    <h3 style="margin:0 0 4px;color:#2c3e50;">Close ${_finEsc(data.fiscal_year_code)} (${_pvDate(data.start_date)} → ${_pvDate(data.end_date)})</h3>
    <div style="display:flex;gap:16px;margin:18px 0;">
      <div style="flex:1;background:var(--navy-900,#0D2137);color:#fff;border-radius:8px;padding:14px 18px;">
        <div style="font-size:11px;opacity:.8;">Total Income</div>
        <div style="font-size:1.3rem;font-weight:700;">${_pvMoney(data.total_income)}</div>
      </div>
      <div style="flex:1;background:var(--navy-900,#0D2137);color:#fff;border-radius:8px;padding:14px 18px;">
        <div style="font-size:11px;opacity:.8;">Total Expense</div>
        <div style="font-size:1.3rem;font-weight:700;">${_pvMoney(data.total_expense)}</div>
      </div>
      <div style="flex:1;background:${netSurplus >= 0 ? 'var(--navy-900,#0D2137)' : 'var(--coral-500,#D94040)'};color:#fff;border-radius:8px;padding:14px 18px;">
        <div style="font-size:11px;opacity:.8;">Net Surplus</div>
        <div style="font-size:1.3rem;font-weight:700;">${netSurplus >= 0 ? '+' : ''}${_pvMoney(data.net_surplus)}</div>
      </div>
    </div>

    ${guardErrors.length > 0 ? `
      <div style="background:var(--coral-100);border-left:3px solid var(--coral-500);border-radius:6px;padding:12px 16px;margin-bottom:16px;color:var(--coral-600);">
        <strong>Cannot close — resolve these first:</strong>
        <ul style="margin:8px 0 0 18px;">${guardErrors.map(e => `<li>${_finEsc(e)}</li>`).join('')}</ul>
      </div>` : ''}

    <div style="margin-bottom:14px;font-size:0.9rem;${data.is_balanced ? 'color:#1e7e34;' : 'color:var(--coral-600);font-weight:600;'}">
      ${data.is_balanced
        ? `&#10003; JE balances at ${_pvMoney(data.total_debits)} / ${_pvMoney(data.total_credits)}`
        : `Preview JE is out of balance — ops issue, do not proceed.`}
    </div>

    <div class="fin-form-grid-2" style="gap:20px;">
      <div>
        <div class="fin-section-label">Debits</div>
        <table class="fin-li-table"><thead><tr><th>Acct</th><th>Name</th><th style="text-align:right;">Amount</th></tr></thead>
          <tbody>${lineRows(data.income_lines)}</tbody>
          <tfoot><tr style="font-weight:700;"><td colspan="2">Total</td><td style="text-align:right;">${_pvMoney(data.total_debits)}</td></tr></tfoot>
        </table>
      </div>
      <div>
        <div class="fin-section-label">Credits</div>
        <table class="fin-li-table"><thead><tr><th>Acct</th><th>Name</th><th style="text-align:right;">Amount</th></tr></thead>
          <tbody>${lineRows(data.expense_lines)}${data.retained_surplus_leg ? `<tr><td>${_finEsc(data.retained_surplus_leg.account_number)}</td><td>&rarr; Retained Surplus</td><td style="text-align:right;">${_pvMoney(data.retained_surplus_leg.amount)}</td></tr>` : ''}</tbody>
          <tfoot><tr style="font-weight:700;"><td colspan="2">Total</td><td style="text-align:right;">${_pvMoney(data.total_credits)}</td></tr></tfoot>
        </table>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-top:22px;justify-content:flex-end;">
      <button class="fin-btn-cancel" onclick="document.getElementById('fy-close-modal-overlay').remove()">Cancel</button>
      <button class="fin-btn-teal" ${canConfirm ? '' : 'disabled'} onclick="_fyConfirmClose(${id})">Confirm Close</button>
    </div>
  `);
}

async function _fyConfirmClose(id) {
  const res = await apiFetch(`${_FY_API}${id}/close`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    const fy = await res.json();
    document.getElementById('fy-close-modal-overlay')?.remove();
    showToast(`${fy.code} closed. Retained Surplus updated by ${formatKES(_fyPreviewNetSurplus ?? 0)}.`, 'success');
    await _fyLoadClosedCache(true);
    if (typeof window._splitRefreshSelected === 'function') await window._splitRefreshSelected();
    return;
  }
  const msg = await parseApiError(res);
  if (res.status === 500 && /RETAINED_SURPLUS_ACCOUNT_ID/i.test(msg)) {
    showToast('Retained Surplus account not configured — ask ops to set RETAINED_SURPLUS_ACCOUNT_ID.', 'error');
  } else {
    showToast('Error: ' + msg, 'error');
  }
}

// ── Reopen (super-admin only) ───────────────────────────────────────────
function _fyOpenReopenModal(id, code, closeJeId) {
  const wrap = document.createElement('div');
  wrap.id = 'fy-reopen-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:26px;width:520px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <div style="background:var(--coral-100);border-left:3px solid var(--coral-500);border-radius:6px;padding:12px 16px;color:var(--coral-600);margin-bottom:16px;">
        Reopening reverses the close journal entry ${closeJeId ? `(#${closeJeId})` : ''} and returns ${_finEsc(code)} to OPEN. This action is audit-logged with your reason.
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
        <textarea id="fy-reopen-reason" class="fin-form-textarea" rows="3" maxlength="400" oninput="document.getElementById('fy-reopen-count').textContent=this.value.length"></textarea>
        <span style="font-size:11px;color:var(--grey-500,#888);"><span id="fy-reopen-count">0</span>/400</span>
        <span class="fin-field-error" id="fy-reopen-err"></span>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('fy-reopen-modal-overlay').remove()">Cancel</button>
        <button class="fin-btn-teal" style="background:var(--coral-500,#D94040);" onclick="_fySubmitReopen(${id})">Reopen</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _fySubmitReopen(id) {
  const reason = document.getElementById('fy-reopen-reason').value.trim();
  if (reason.length < 3) {
    document.getElementById('fy-reopen-err').textContent = 'Reason must be at least 3 characters.';
    return;
  }
  const res = await apiFetch(`${_FY_API}${id}/reopen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
  if (!res) return;
  if (res.ok) {
    const fy = await res.json();
    document.getElementById('fy-reopen-modal-overlay')?.remove();
    showToast(`${fy.code} reopened. Close JE reversed.`, 'success');
    await _fyLoadClosedCache(true);
    if (typeof window._splitRefreshSelected === 'function') await window._splitRefreshSelected();
    return;
  }
  showToast('Error: ' + await parseApiError(res), 'error');
}
