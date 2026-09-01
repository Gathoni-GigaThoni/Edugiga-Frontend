// ==================== FINANCE > BUDGETING > BUDGETS ====================
// BE addendum 2026-08-26 §D.7. Reference data only — a Budget row feeds the
// existing Budget vs Actual report and posts nothing. There is no JE, no
// accrual, no side effect on actuals; the Add form says so explicitly so the
// accountant isn't hunting for a posting that never happens.
//
// Endpoints (all gated on finance.budgeting.budgets, a NEW permission key
// with no inheritance from finance.setup — ops must grant it explicitly):
//   GET    /api/budgets/            ?period_year= &account_id=
//   POST   /api/budgets/            BudgetCreate  -> 201
//   GET    /api/budgets/{id}
//   PUT    /api/budgets/{id}        BudgetUpdate
//   DELETE /api/budgets/{id}        -> 204
// Uniqueness is one budget per (account_id, period_year, period_quarter);
// a collision comes back 409 with a human-readable detail.

const _BGT_API = `${API_BASE}/budgets/`;
const _BGT_MODULE_KEY = 'finance.budgeting.budgets';

let _bgtYearFilter    = '';
let _bgtAccountFilter = '';
let _bgtAllYears      = [];   // years seen in the unfiltered list, for the Year picker
let _bgtYearsLoaded   = false;

function _bgtPeriodLabel(q) {
  return q ? `Q${q}` : 'Annual';
}

// budgeted_amount is a Decimal string on the wire — formatKES parses it once
// for display and the raw string is what gets sent back. Never Number()-coerce
// it into state.
function _bgtRowName(b) {
  const a = _pvAccounts.find(a => String(a.id) === String(b.account_id));
  if (!a) return `Account #${b.account_id}`;
  return `${a.number ? a.number + ' — ' : ''}${a.account_name}`;
}

function _bgtListUrl() {
  const params = new URLSearchParams();
  if (_bgtYearFilter)    params.set('period_year', _bgtYearFilter);
  if (_bgtAccountFilter) params.set('account_id', _bgtAccountFilter);
  const qs = params.toString();
  return qs ? `${_BGT_API}?${qs}` : _BGT_API;
}

// Year options = every year any budget exists for, plus this year and next,
// so a first-time user can always file a budget without a seed row.
function _bgtYearOptions() {
  const now = new Date().getFullYear();
  const years = Array.from(new Set([...(_bgtAllYears || []), now, now + 1])).sort((a, b) => b - a);
  return years.map(y => `<option value="${y}" ${String(y) === String(_bgtYearFilter) ? 'selected' : ''}>${y}</option>`).join('');
}

function _bgtFiltersHtml() {
  return `
    <div style="display:flex;gap:6px;padding:8px 12px;flex-wrap:wrap;">
      <select id="bgt-filter-year" class="fin-filter-select" style="max-width:110px;" onchange="_bgtApplyFilters()">
        <option value="">All Years</option>${_bgtYearOptions()}
      </select>
      <select id="bgt-filter-account" class="fin-filter-select" style="max-width:220px;" onchange="_bgtApplyFilters()">
        <option value="">All Accounts</option>${_pvAccountOptions(_bgtAccountFilter, { includeNonPostable: true })}
      </select>
    </div>`;
}

function _bgtApplyFilters() {
  _bgtYearFilter    = document.getElementById('bgt-filter-year')?.value || '';
  _bgtAccountFilter = document.getElementById('bgt-filter-account')?.value || '';
  loadView('finance-budgeting-budgets');
}

// The Year picker's option set has to be known BEFORE renderSplitView builds
// the filter bar, and renderSplitView's own fetch is already narrowed by the
// active filters — so the year set comes from its own unfiltered call, made
// once per session.
async function _bgtLoadYears() {
  if (_bgtYearsLoaded) return;
  const res = await apiFetch(_BGT_API);
  if (res && res.ok) {
    _bgtAllYears = Array.from(new Set(_toArray(await res.json()).map(b => b.period_year).filter(Boolean)));
    _bgtYearsLoaded = true;
  }
}

async function loadBudgetsView(container) {
  // CoA map is pre-fetched once so account_id resolves locally on every row —
  // same pattern as the Payables split views.
  await _pvLoadLookups();
  await _bgtLoadYears();
  await renderSplitView({
    container,
    moduleKey: _BGT_MODULE_KEY,
    title: 'Budgets',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'finance-budgeting-budgets'},
      {label:'Budgeting',view:'finance-budgeting-budgets'},
      {label:'Budgets'}
    ],
    apiUrl: _bgtListUrl(),
    listFilters: _bgtFiltersHtml(),
    col1Label: 'Account', col2Label: 'Budgeted',
    col1: b => _finEsc(_bgtRowName(b)),
    col2: b => formatKES(b.budgeted_amount),
    rowLabel: b => _finEsc(_bgtRowName(b)),
    rowSub:   b => `${b.period_year} · ${_bgtPeriodLabel(b.period_quarter)}`,
    idKey: 'id',
    // Keep the picker honest when the current view IS the unfiltered list —
    // a year that just gained its first budget shows up without a reload.
    // Never widened from a filtered fetch, which would collapse the picker to
    // the filtered year and strand the operator there.
    onFetched: rows => {
      if (_bgtYearFilter || _bgtAccountFilter) return;
      _bgtAllYears = Array.from(new Set(_toArray(rows).map(b => b.period_year).filter(Boolean)));
    },
    detailFields: [
      {label:'Account',         key:'account_id',      fmt:(_,b)=>_finEsc(_bgtRowName(b))},
      {label:'Period Year',     key:'period_year',     fmt:v=>v ?? '—'},
      {label:'Period',          key:'period_quarter',  fmt:v=>_bgtPeriodLabel(v)},
      {label:'Budgeted Amount', key:'budgeted_amount', fmt:v=>formatKES(v)},
      {label:'Created',         key:'created_at',      fmt:v=>_pvDate(v)},
    ],
    renderAdd:  el => _bgtSplitForm(null, el),
    renderEdit: (item, el) => _bgtSplitForm(item, el),
    detailActions: b => canDelete(_BGT_MODULE_KEY)
      ? `<button class="btn-danger" onclick="_bgtDelete(${b.id})">Delete</button>`
      : '',
  });
}

function _bgtSplitForm(item, el) {
  const id = item?.id ?? null;
  const isEdit = !!item;
  const year = item?.period_year ?? new Date().getFullYear();
  const q = item ? (item.period_quarter ?? '') : '';
  const segs = [['', 'Annual'], ['1','Q1'], ['2','Q2'], ['3','Q3'], ['4','Q4']];
  el.innerHTML = `
    <div style="max-width:460px">
      <h3 class="split-right-add-title">${isEdit ? 'Edit' : 'Add'} Budget</h3>
      <div style="background:#EEF3FA;border-left:3px solid var(--navy-400,#4A6FA5);border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--navy-900,#0D2137);">
        Budgets are reference data for the Budget vs Actual report. They do not post journal entries.
      </div>
      <div class="stu-form-group">
        <label>Account <span style="color:var(--coral-500)">*</span></label>
        <select id="bgt-f-account" style="max-width:none;width:100%">
          <!-- A budget line is not a journal entry, so header accounts stay
               selectable here: budgeting at a roll-up level is normal practice
               and the server has no is_postable guard on this write. -->
          <option value="">Please Select</option>${_pvAccountOptions(item?.account_id, { includeNonPostable: true })}
        </select>
        <div id="bgt-f-account-err" style="font-size:12px;color:var(--coral-500);margin-top:4px"></div>
      </div>
      <div class="stu-form-group" style="margin-top:12px">
        <label>Period Year <span style="color:var(--coral-500)">*</span></label>
        <input type="number" id="bgt-f-year" min="2020" max="2100" step="1" value="${year}" style="max-width:none;width:100%">
        <div id="bgt-f-year-err" style="font-size:12px;color:var(--coral-500);margin-top:4px"></div>
      </div>
      <div class="stu-form-group" style="margin-top:12px">
        <label>Period <span style="color:var(--coral-500)">*</span></label>
        <div id="bgt-f-period" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
          ${segs.map(([v, lbl]) => `
            <button type="button" class="fin-btn-outline" data-q="${v}"
              onclick="_bgtPickPeriod('${v}')"
              style="padding:6px 14px;${String(q) === v ? 'background:var(--navy-700,#1B3057);color:#fff;border-color:var(--navy-700,#1B3057);' : ''}">${lbl}</button>`).join('')}
        </div>
        <div style="font-size:12px;color:#888;margin-top:5px">Annual files the budget with no quarter; Q1–Q4 file it against that quarter only.</div>
      </div>
      <div class="stu-form-group" style="margin-top:12px">
        <label>Budgeted Amount (KES) <span style="color:var(--coral-500)">*</span></label>
        <input type="number" id="bgt-f-amount" step="0.01" min="0" value="${item?.budgeted_amount ?? ''}" style="max-width:none;width:100%">
        <div id="bgt-f-amount-err" style="font-size:12px;color:var(--coral-500);margin-top:4px"></div>
      </div>
      <div id="bgt-split-status" style="margin-top:10px"></div>
      <div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn-primary" style="padding:9px 20px" onclick="_bgtSave(${id ?? 'null'})">${isEdit ? 'Update' : 'Save'}</button>
        <button class="btn-cancel" onclick="window._splitGoAdd?.()">Cancel</button>
      </div>
    </div>`;
  window._bgtPeriodPick = String(q);
}

function _bgtPickPeriod(v) {
  window._bgtPeriodPick = v;
  document.querySelectorAll('#bgt-f-period button').forEach(b => {
    const on = b.dataset.q === v;
    b.style.background   = on ? 'var(--navy-700,#1B3057)' : '';
    b.style.color        = on ? '#fff' : '';
    b.style.borderColor  = on ? 'var(--navy-700,#1B3057)' : '';
  });
}

function _bgtClearErrors() {
  ['bgt-f-account-err','bgt-f-year-err','bgt-f-amount-err'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '';
  });
  const s = document.getElementById('bgt-split-status'); if (s) s.innerHTML = '';
}

function _bgtBanner(html) {
  const el = document.getElementById('bgt-split-status');
  if (el) el.innerHTML = `<div style="padding:10px 14px;border-radius:6px;border-left:3px solid var(--coral-500);background:var(--coral-100);color:var(--coral-600);font-size:0.85rem;">${html}</div>`;
}

// 422 details arrive as [{loc:['body','period_year'], msg:'…'}] — surface each
// one inline on its own field, verbatim, and fall back to the banner for
// anything that doesn't map to a field on this form.
function _bgtRender422(detail) {
  const FIELD_ERR = { account_id: 'bgt-f-account-err', period_year: 'bgt-f-year-err',
                      period_quarter: 'bgt-f-year-err', budgeted_amount: 'bgt-f-amount-err' };
  const leftovers = [];
  detail.forEach(e => {
    const field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : null;
    const target = FIELD_ERR[field] ? document.getElementById(FIELD_ERR[field]) : null;
    if (target) target.textContent = e.msg || '';
    else leftovers.push(e.msg || JSON.stringify(e));
  });
  if (leftovers.length) _bgtBanner(_finEsc(leftovers.join('; ')));
}

async function _bgtSave(id) {
  _bgtClearErrors();
  const accountId = document.getElementById('bgt-f-account')?.value || '';
  const yearRaw   = document.getElementById('bgt-f-year')?.value || '';
  const amountRaw = (document.getElementById('bgt-f-amount')?.value || '').trim();
  const quarter   = window._bgtPeriodPick || '';

  let bad = false;
  if (!accountId) { document.getElementById('bgt-f-account-err').textContent = 'Account is required.'; bad = true; }
  const year = parseInt(yearRaw, 10);
  if (!year || year < 2020 || year > 2100) { document.getElementById('bgt-f-year-err').textContent = 'Period Year must be between 2020 and 2100.'; bad = true; }
  if (amountRaw === '' || parseFloat(amountRaw) < 0 || isNaN(parseFloat(amountRaw))) {
    document.getElementById('bgt-f-amount-err').textContent = 'Budgeted Amount is required and cannot be negative.'; bad = true;
  }
  if (bad) return;

  const body = {
    account_id: parseInt(accountId, 10),
    period_year: year,
    period_quarter: quarter === '' ? null : parseInt(quarter, 10),
    budgeted_amount: amountRaw,   // Decimal goes over the wire as a string
  };

  const res = await apiFetch(id ? `${_BGT_API}${id}` : _BGT_API, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res) { _bgtBanner('Network error — the budget was not saved.'); return; }
  if (res.ok) {
    showToast(id ? 'Budget updated.' : 'Budget created.', 'success');
    _bgtYearsLoaded = false;   // a new period_year may have just appeared
    loadView('finance-budgeting-budgets');
    return;
  }
  if (res.status === 409) {
    // Detail reads e.g. "An annual budget for account_id=42 in 2026 already
    // exists." — shown verbatim. The message carries no budget id, so the
    // "view existing" affordance re-filters the list to that account+year
    // instead of deep-linking a row we can't identify.
    const detail = await parseApiError(res);
    _bgtBanner(`${_finEsc(detail)} <a href="#" onclick="_bgtShowExisting(${parseInt(accountId,10)},${year});return false;" style="color:var(--coral-600);text-decoration:underline;">View existing budget</a>`);
    return;
  }
  if (res.status === 404) {
    const el = document.getElementById('bgt-f-account-err');
    if (el) el.textContent = await parseApiError(res);
    return;
  }
  if (res.status === 422) {
    const body422 = await res.json().catch(() => null);
    if (Array.isArray(body422?.detail)) { _bgtRender422(body422.detail); return; }
  }
  _bgtBanner(_finEsc(await parseApiError(res)));
}

function _bgtShowExisting(accountId, year) {
  _bgtAccountFilter = String(accountId);
  _bgtYearFilter    = String(year);
  loadView('finance-budgeting-budgets');
}

async function _bgtDelete(id) {
  if (!confirm('Delete this budget entry? Actual postings against this account are unaffected. Only the budget row is removed.')) return;
  const res = await apiFetch(`${_BGT_API}${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    showToast('Budget deleted.', 'success');
    window._splitRemoveItem?.(id);
  } else if (res) {
    showToast(await parseApiError(res), 'error');
  }
}
