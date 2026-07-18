// ==================== PART C — FINANCE REPORTS ====================
// All 25 endpoints are confirmed to exist live (openapi.json), but every
// response schema is `{}` (unconfirmed shape) — FastAPI returns whatever the
// report builder assembles without a typed Pydantic response model. Each
// table-layout report below tries field names that match the spec's column
// list first; if the first row doesn't have any of those keys, it falls back
// to auto-generating columns from whatever keys the API actually returned,
// so the page never just shows a blank table when the guess is wrong.

const _REP_BASE = `${API_BASE}/reports`;

// Main -> Mini -> Suspense -> anything unrecognised, last.
const _TP_WALLET_ROLE_ORDER = { main: 0, mini: 1, suspense: 2 };
function _tpWalletRoleSort(a, b) {
  return (_TP_WALLET_ROLE_ORDER[a.wallet_role] ?? 99) - (_TP_WALLET_ROLE_ORDER[b.wallet_role] ?? 99);
}

function _repHumanize(key) {
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function _repCell(val) {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number' || /^-?\d+(\.\d+)?$/.test(String(val))) {
    const n = parseFloat(val);
    return Math.abs(n) >= 1 || n === 0 ? _pvMoney(n) : _finEsc(String(val));
  }
  return _finEsc(String(val));
}

// ── Report definitions ──────────────────────────────────────────────────────
// dateMode: 'range' (start_date/end_date), 'asof' (as_of_date[+compare_to_date]), 'single' (report_date)
const REPORT_DEFS = {
  'reports-general-ledger': { title: 'General Ledger', api: 'general-ledger', dateMode: 'range',
    extra: [{ key: 'account_id', label: 'Account', type: 'account' }],
    columns: [['date','DATE'],['jv_number','JV NUMBER'],['description','DESCRIPTION'],['debit','DEBIT'],['credit','CREDIT'],['running_balance','RUNNING BALANCE']] },
  'reports-trial-balance': { title: 'Trial Balance', api: 'trial-balance', dateMode: 'range',
    columns: [['account_name','ACCOUNT NAME'],['debit_total','DEBIT TOTAL'],['credit_total','CREDIT TOTAL']], totals: true },
  'reports-cash-book': { title: 'Cash Book', api: 'cash-book', dateMode: 'range',
    extra: [{ key: 'bank_account_id', label: 'Bank Account', type: 'account' }],
    columns: [['date','DATE'],['description','DESCRIPTION'],['reference','REFERENCE'],['debit','DEBIT'],['credit','CREDIT'],['balance','BALANCE']] },
  'reports-petty-cash-report': { title: 'Petty Cash Report', api: 'petty-cash-report', dateMode: 'range',
    columns: [['date','DATE'],['applicant','APPLICANT'],['purpose','PURPOSE'],['amount','AMOUNT'],['type','TYPE'],['status','STATUS']] },
  'reports-supplier-statements': { title: 'Supplier Statements', api: 'supplier-statements', dateMode: 'range', pathParam: 'supplier_id',
    extra: [{ key: 'supplier_id', label: 'Supplier', type: 'supplier', required: true }],
    columns: [['date','DATE'],['type','TYPE'],['reference','REFERENCE'],['amount','AMOUNT'],['running_balance','RUNNING BALANCE']] },
  'reports-tax-schedules': { title: 'Tax Schedules', api: 'tax-schedules', dateMode: 'range',
    extra: [{ key: 'tax_type', label: 'Tax Type', type: 'taxtype' }],
    columns: [['tax_type','TAX TYPE'],['period','PERIOD'],['amount_deducted','AMOUNT DEDUCTED'],['amount_remitted','AMOUNT REMITTED'],['variance','VARIANCE']] },
  'reports-fees-invoiced-per-gl-account': { title: 'Fees invoiced per GL Account', api: 'fees-invoiced-per-gl-account', dateMode: 'range',
    columns: [['gl_account','GL ACCOUNT'],['total_invoiced','TOTAL INVOICED']] },
  'reports-fees-paid-per-gl-account': { title: 'Fees Paid per GL Account', api: 'fees-paid-per-gl-account', dateMode: 'range',
    columns: [['gl_account','GL ACCOUNT'],['total_paid','TOTAL PAID']] },
  'reports-budget-vs-actual': { title: 'Statement of Budget vs Actual Comparison', api: 'budget-vs-actual', dateMode: 'range',
    columns: [['account','ACCOUNT'],['budgeted','BUDGETED'],['actual','ACTUAL'],['variance','VARIANCE'],['variance_pct','VARIANCE %']] },
  'reports-journal-entry': { title: 'Journal Entry Report', api: 'journal-entry-report', dateMode: 'range',
    extra: [{ key: 'status', label: 'Status', type: 'jestatus' }, { key: 'ledger_id', label: 'Ledger', type: 'ledger' }],
    columns: [['jv_number','JV NUMBER'],['date','DATE'],['reference','REFERENCE'],['ledger','LEDGER'],['status','STATUS'],['debit_account','DEBIT ACCOUNT'],['credit_account','CREDIT ACCOUNT'],['amount','AMOUNT']], groupBy: 'jv_number' },

  'reports-balances-report': { title: 'Balances Report', api: 'balances-report', dateMode: 'asof',
    columns: [['account_name','ACCOUNT NAME'],['account_type','ACCOUNT TYPE'],['balance','BALANCE']] },
  'reports-fee-reminder': { title: 'Fee Reminder', api: 'fee-reminder', dateMode: 'asof',
    extra: [{ key: 'days_overdue_threshold', label: 'Days Overdue Threshold', type: 'number', default: 30 }],
    columns: [['student_name','STUDENT NAME'],['student_id','STUDENT ID'],['invoice_ref','INVOICE REF'],['amount_due','AMOUNT DUE'],['days_overdue','DAYS OVERDUE']] },
  'reports-aged-student-debtors': { title: 'Aged Student Debtors', api: 'aged-student-debtors', dateMode: 'asof',
    columns: [['student_name','STUDENT NAME'],['student_id','STUDENT ID'],['current','CURRENT'],['30_days','30 DAYS'],['60_days','60 DAYS'],['90_days','90+ DAYS'],['total','TOTAL']] },
  'reports-students-arrears-analysis': { title: 'Students Arrears Analysis', api: 'aged-student-debtors', dateMode: 'asof',
    columns: [['student_name','STUDENT NAME'],['student_id','STUDENT ID'],['current','CURRENT'],['30_days','30 DAYS'],['60_days','60 DAYS'],['90_days','90+ DAYS'],['total','TOTAL']] },
  'reports-customer-aging-analysis': { title: 'Customer Aging Analysis', api: 'customer-aging-analysis', dateMode: 'asof',
    columns: [['student_name','STUDENT NAME'],['student_id','STUDENT ID'],['current','CURRENT'],['30_days','30 DAYS'],['60_days','60 DAYS'],['90_days','90+ DAYS'],['total','TOTAL']] },
  'reports-student-prepayment-analysis': { title: 'Student Prepayment Analysis', api: 'student-prepayment-analysis', dateMode: 'asof',
    columns: [['student_name','STUDENT NAME'],['student_id','STUDENT ID'],['credit_balance','CREDIT BALANCE']] },
  'reports-aged-payables': { title: 'Aged Payables', api: 'aged-payables', dateMode: 'asof',
    columns: [['supplier_name','SUPPLIER NAME'],['current','CURRENT'],['30_days','30 DAYS'],['60_days','60 DAYS'],['90_days','90+ DAYS'],['total','TOTAL']] },
  // AP sub-ledger vs GL control account. Always 200s — configured/is_reconciled
  // drive the render, not the HTTP status (§2 of the 2026-07-16 addendum).
  'reports-ap-reconciliation': { title: 'AP Reconciliation', api: 'ap-reconciliation', dateMode: 'asof', layout: 'ap-reconciliation' },

  'reports-daily-cash-return': { title: 'Daily Cash Return', api: 'daily-cash-return', dateMode: 'single', dateParam: 'report_date',
    columns: [['account','ACCOUNT'],['opening_balance','OPENING BALANCE'],['inflows','INFLOWS'],['outflows','OUTFLOWS'],['closing_balance','CLOSING BALANCE']] },

  // Statement-layout reports — handled by dedicated renderers, see _repRenderStatement()
  'reports-balance-sheet': { title: 'Balance Sheet', api: 'balance-sheet', dateMode: 'asof', layout: 'statement', statementType: 'bs' },
  'reports-statement-of-financial-performance': { title: 'Statement of Financial Performance', api: 'statement-of-financial-performance', dateMode: 'range', layout: 'statement', statementType: 'sfp' },
  'reports-statement-of-financial-position': { title: 'Statement of Financial Position', api: 'statement-of-financial-position', dateMode: 'asof', compareDate: true, layout: 'statement', statementType: 'bs' },
  'reports-notes-of-financial-statement': { title: 'Notes of Financial Statement', api: 'notes-of-financial-statement', dateMode: 'range', layout: 'notes' },
  'reports-cashflow-statement': { title: 'Cashflow Statement', api: 'cashflow-statement', dateMode: 'range', layout: 'statement', statementType: 'cf' },
  'reports-statement-of-changes-in-net-assets': { title: 'Statement of Changes in Net Assets', api: 'statement-of-changes-in-net-assets', dateMode: 'range', layout: 'statement', statementType: 'sce' },
  'reports-bank-reconciliation': { title: 'Bank Reconciliation Report', api: 'bank-reconciliation', dateMode: 'asof', layout: 'statement', statementType: 'bank',
    extra: [{ key: 'bank_account_id', label: 'Bank Account', type: 'account', required: true }] },

  'reports-tendepay-wallet-balances': { title: 'Tendepay Wallet Balances', api: 'tendepay-wallet-balances', dateMode: 'asof',
    columns: [['wallet_role','ROLE'],['wallet_name','WALLET'],['account_name','ACCOUNT'],['balance','BALANCE']],
    groupBy: 'wallet_role', sortBy: _tpWalletRoleSort },
  'reports-tendepay-transaction-history': { title: 'Tendepay Transaction History', api: 'tendepay-transaction-history', dateMode: 'range',
    extra: [{ key: 'wallet_account_id', label: 'Wallet Account', type: 'tendepaywallet' }],
    columns: [['transaction_date','DATE'],['tendepay_reference','REFERENCE'],['wallet_name','WALLET'],['payee_name','PAYEE'],['amount','AMOUNT'],['tendepay_status','STATUS']] },
  'reports-unmatched-tendepay-transactions': { title: 'Unmatched Tendepay Transactions', api: 'unmatched-tendepay-transactions',
    columns: [['transaction_date','DATE'],['tendepay_reference','REFERENCE'],['wallet_name','WALLET'],['payee_name','PAYEE'],['amount','AMOUNT']] },
};

async function loadFinanceReportView(container, routeKey) {
  const def = REPORT_DEFS[routeKey];
  if (!def) { container.innerHTML = '<p>Unknown report.</p>'; return; }
  await _pvLoadLookups();

  let dateInputsHtml = '';
  if (def.dateMode === 'range') {
    dateInputsHtml = `
      <div class="fin-filter-field"><label class="fin-filter-label">Start Date</label><input type="date" id="rep-start-date" class="fin-filter-input"></div>
      <div class="fin-filter-field"><label class="fin-filter-label">End Date</label><input type="date" id="rep-end-date" class="fin-filter-input"></div>`;
  } else if (def.dateMode === 'asof') {
    dateInputsHtml = `<div class="fin-filter-field"><label class="fin-filter-label">As of Date</label><input type="date" id="rep-asof-date" class="fin-filter-input"></div>`;
    if (def.compareDate) dateInputsHtml += `<div class="fin-filter-field"><label class="fin-filter-label">Compare to Date</label><input type="date" id="rep-compare-date" class="fin-filter-input"></div>`;
  } else if (def.dateMode === 'single') {
    dateInputsHtml = `<div class="fin-filter-field"><label class="fin-filter-label">Date</label><input type="date" id="rep-single-date" class="fin-filter-input"></div>`;
  }

  const extraHtml = (def.extra || []).map(f => {
    if (f.type === 'account') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}${f.required ? ' *' : ''}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">${f.required ? 'Please Select' : 'All'}</option>${_pvAccountOptions()}</select></div>`;
    if (f.type === 'ledger') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">All</option>${_pvLedgerOptions()}</select></div>`;
    if (f.type === 'supplier') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}${f.required ? ' *' : ''}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">Please Select</option>${_pvSupplierOptions()}</select></div>`;
    if (f.type === 'tendepaywallet') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">All</option>${_pvTendepayWalletOptions()}</select></div>`;
    if (f.type === 'taxtype') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">All</option>${_PV_TAX_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>`;
    if (f.type === 'jestatus') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">All</option><option value="draft">Draft</option><option value="posted">Posted</option><option value="reversed">Reversed</option></select></div>`;
    if (f.type === 'number') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><input type="number" id="rep-x-${f.key}" class="fin-filter-input" value="${f.default ?? ''}"></div>`;
    return '';
  }).join('');

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${_finEsc(def.title)}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Reports &rsaquo; ${_finEsc(def.title)}</div>
      </div>
      <div class="fin-filter-section">
        <div class="fin-filter-grid">${dateInputsHtml}${extraHtml}</div>
        <div class="fin-filter-actions">
          <button class="fin-btn-teal" onclick="_repGenerate('${routeKey}')">Generate Report</button>
          <button class="fin-btn-outline" onclick="_repExport('${routeKey}','excel')">Export Excel</button>
          <button class="fin-btn-outline" onclick="_repExport('${routeKey}','csv')">Export CSV</button>
        </div>
      </div>
      <div id="rep-output"></div>
    </div>`;
}

function _repBuildParams(def, extraFormat) {
  const params = new URLSearchParams();
  if (def.dateMode === 'range') {
    params.set('start_date', document.getElementById('rep-start-date').value);
    params.set('end_date', document.getElementById('rep-end-date').value);
  } else if (def.dateMode === 'asof') {
    params.set('as_of_date', document.getElementById('rep-asof-date').value);
    if (def.compareDate) {
      const cmp = document.getElementById('rep-compare-date').value;
      if (cmp) params.set('compare_to_date', cmp);
    }
  } else if (def.dateMode === 'single') {
    params.set(def.dateParam || 'report_date', document.getElementById('rep-single-date').value);
  }
  (def.extra || []).forEach(f => {
    if (f.key === def.pathParam) return;
    const el = document.getElementById(`rep-x-${f.key}`);
    if (el && el.value) params.set(f.key, el.value);
  });
  if (extraFormat) params.set('format', extraFormat);
  return params;
}
function _repUrl(def, params) {
  let url = `${_REP_BASE}/${def.api}`;
  if (def.pathParam) {
    const pathVal = document.getElementById(`rep-x-${def.pathParam}`).value;
    url += `/${pathVal}`;
  }
  return `${url}?${params.toString()}`;
}

async function _repGenerate(routeKey) {
  const def = REPORT_DEFS[routeKey];
  if (def.pathParam) {
    const f = (def.extra || []).find(x => x.key === def.pathParam);
    if (f && f.required && !document.getElementById(`rep-x-${f.key}`).value) {
      showToast(`${f.label} is required.`, 'error'); return;
    }
  }
  (def.extra || []).forEach(f => {
    if (f.required && f.key !== def.pathParam) {
      const el = document.getElementById(`rep-x-${f.key}`);
      if (el && !el.value) showToast(`${f.label} is required.`, 'error');
    }
  });
  renderSkeletonRows('rep-output', 6);
  const params = _repBuildParams(def, null);
  try {
    const res = await apiFetch(_repUrl(def, params));
    if (!res || !res.ok) { showToast(`Could not generate report: ${res ? await parseApiError(res) : 'network error'}`, 'error'); document.getElementById('rep-output').innerHTML = ''; return; }
    const data = await res.json();
    if (def.layout === 'statement') _repRenderStatement(def, data);
    else if (def.layout === 'notes') _repRenderNotes(def, data);
    else if (def.layout === 'ap-reconciliation') _repRenderApReconciliation(def, data);
    else if (routeKey === 'reports-supplier-statements') _repRenderSupplierStatement(def, data);
    else _repRenderTable(def, data);
  } catch (e) { showToast('Network error generating report.', 'error'); }
}

async function _repExport(routeKey, format) {
  const def = REPORT_DEFS[routeKey];
  const params = _repBuildParams(def, format);
  try {
    const res = await apiFetch(_repUrl(def, params));
    if (!res || !res.ok) { showToast('Export failed: ' + (res ? await parseApiError(res) : 'network error'), 'error'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${def.api}.${format === 'excel' ? 'xlsx' : 'csv'}`;
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { showToast('Network error during export.', 'error'); }
}

// ── Table layout (most reports) ─────────────────────────────────────────────
function _repRenderTable(def, data) {
  const rows = Array.isArray(data) ? data : (data.data || data.items || data.results || data.rows || []);
  const out = document.getElementById('rep-output');
  if (!rows.length) { out.innerHTML = '<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">No data for the selected criteria.</td></tr></tbody></table></div>'; return; }

  const firstRow = rows[0];
  const knownKeysPresent = def.columns.some(([key]) => firstRow.hasOwnProperty(key));
  const cols = knownKeysPresent ? def.columns : Object.keys(firstRow).map(k => [k, _repHumanize(k)]);
  const sortedRows = (def.sortBy && knownKeysPresent) ? [...rows].sort(def.sortBy) : rows;

  let bodyRows;
  if (def.groupBy && knownKeysPresent) {
    let lastGroup = null, toggle = false;
    bodyRows = sortedRows.map(r => {
      if (r[def.groupBy] !== lastGroup) { toggle = !toggle; lastGroup = r[def.groupBy]; }
      return `<tr style="${toggle ? 'background:#f5fafa;' : ''}">${cols.map(([k]) => `<td>${_repCell(r[k])}</td>`).join('')}</tr>`;
    }).join('');
  } else {
    bodyRows = sortedRows.map(r => `<tr>${cols.map(([k]) => `<td>${_repCell(r[k])}</td>`).join('')}</tr>`).join('');
  }

  let footRow = '';
  if (def.totals && knownKeysPresent) {
    const totalsRow = cols.map(([k], i) => {
      if (i === 0) return `<td><strong>TOTAL</strong></td>`;
      const sum = rows.reduce((s, r) => s + (parseFloat(r[k]) || 0), 0);
      return `<td><strong>${_pvMoney(sum)}</strong></td>`;
    }).join('');
    footRow = `<tr class="fin-tfoot-total">${totalsRow}</tr>`;
  }

  document.getElementById('rep-output').innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>${cols.map(([,label]) => `<th>${_finEsc(label)}</th>`).join('')}</tr></thead>
      <tbody>${bodyRows}</tbody>
      ${footRow ? `<tfoot>${footRow}</tfoot>` : ''}
    </table></div>`;
}

// ── Notes of Financial Statement — labelled schedule cards ──────────────────
function _repRenderNotes(def, data) {
  const notes = Array.isArray(data) ? data : (data.notes || data.data || data.items || []);
  const out = document.getElementById('rep-output');
  if (!notes.length) { out.innerHTML = '<p class="fin-empty">No data for the selected criteria.</p>'; return; }
  out.innerHTML = notes.map(note => {
    const items = note.items || note.sub_items || note.lines || [];
    return `
      <div class="fin-filter-section">
        <div class="fin-section-label">${_finEsc(note.name || note.title || note.note_name || 'Note')}</div>
        <table class="fin-li-table"><tbody>
          ${items.map(it => `<tr><td>${_finEsc(it.name || it.label || '')}</td><td>${_repCell(it.amount ?? it.value)}</td></tr>`).join('')}
        </tbody></table>
      </div>`;
  }).join('');
}

// ── Statement layout (Balance Sheet / SFP / SFPos / Cashflow / SCNA / Bank Reconciliation) ──
function _repSection(title, items) {
  if (!items || !items.length) return '';
  const total = items.reduce((s, it) => s + (parseFloat(it.amount ?? it.value ?? 0) || 0), 0);
  return `
    <div style="margin-bottom:16px;">
      <div style="font-weight:bold;color:#2c3e50;margin-bottom:6px;">${_finEsc(title)}</div>
      ${items.map(it => `<div style="display:flex;justify-content:space-between;padding:4px 0 4px 16px;border-bottom:1px solid #f5f5f5;">
        <span>${_finEsc(it.name || it.account_name || it.label || '')}</span><span>${_pvMoney(it.amount ?? it.value)}</span>
      </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:bold;border-top:1px solid #ddd;margin-top:4px;">
        <span>Total ${_finEsc(title)}</span><span>${_pvMoney(total)}</span>
      </div>
    </div>`;
}
function _repGrandTotal(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:bold;font-size:1.05rem;border-top:2px solid #2c3e50;margin-top:8px;">
    <span>${_finEsc(label)}</span><span>${_pvMoney(value)}</span>
  </div>`;
}
function _repRenderStatement(def, data) {
  const out = document.getElementById('rep-output');
  if (!data || typeof data !== 'object') { out.innerHTML = '<p class="fin-empty">No data for the selected criteria.</p>'; return; }

  if (def.statementType === 'bs') {
    const assets = data.assets || [], liabilities = data.liabilities || [], equity = data.equity || [];
    if (!assets.length && !liabilities.length && !equity.length) { out.innerHTML = `<pre style="white-space:pre-wrap;">${_finEsc(JSON.stringify(data, null, 2))}</pre>`; return; }
    const totalAssets = data.total_assets ?? assets.reduce((s,i)=>s+(parseFloat(i.amount||0)),0);
    const totalLiab = data.total_liabilities ?? liabilities.reduce((s,i)=>s+(parseFloat(i.amount||0)),0);
    const totalEquity = data.total_equity ?? equity.reduce((s,i)=>s+(parseFloat(i.amount||0)),0);
    out.innerHTML = `
      <div class="fin-form-wrap" style="max-width:680px;">
        ${_repSection('Assets', assets)}
        ${_repSection('Liabilities', liabilities)}
        ${_repSection('Equity', equity)}
        ${_repGrandTotal('Total Liabilities + Equity', totalLiab + totalEquity)}
        <div style="color:#888;font-size:0.85rem;margin-top:4px;">Total Assets: ${_pvMoney(totalAssets)}</div>
      </div>`;
  } else if (def.statementType === 'sfp') {
    const income = data.income || [], expenses = data.expenses || [];
    if (!income.length && !expenses.length) { out.innerHTML = `<pre style="white-space:pre-wrap;">${_finEsc(JSON.stringify(data, null, 2))}</pre>`; return; }
    const totalIncome = data.total_income ?? income.reduce((s,i)=>s+(parseFloat(i.amount||0)),0);
    const totalExpenses = data.total_expenses ?? expenses.reduce((s,i)=>s+(parseFloat(i.amount||0)),0);
    out.innerHTML = `
      <div class="fin-form-wrap" style="max-width:680px;">
        ${_repSection('Income', income)}
        ${_repSection('Expenses', expenses)}
        ${_repGrandTotal('Surplus / (Deficit)', totalIncome - totalExpenses)}
      </div>`;
  } else if (def.statementType === 'cf') {
    const op = data.operating || [], inv = data.investing || [], fin = data.financing || [];
    if (!op.length && !inv.length && !fin.length) { out.innerHTML = `<pre style="white-space:pre-wrap;">${_finEsc(JSON.stringify(data, null, 2))}</pre>`; return; }
    const netOp = data.net_operating ?? op.reduce((s,i)=>s+(parseFloat(i.amount||0)),0);
    const netInv = data.net_investing ?? inv.reduce((s,i)=>s+(parseFloat(i.amount||0)),0);
    const netFin = data.net_financing ?? fin.reduce((s,i)=>s+(parseFloat(i.amount||0)),0);
    const opening = data.opening_cash_balance ?? 0;
    const netChange = netOp + netInv + netFin;
    out.innerHTML = `
      <div class="fin-form-wrap" style="max-width:680px;">
        ${_repSection('Operating Activities', op)}
        ${_repSection('Investing Activities', inv)}
        ${_repSection('Financing Activities', fin)}
        ${_repGrandTotal('Net Change in Cash', netChange)}
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Opening Cash Balance</span><span>${_pvMoney(opening)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:bold;"><span>Closing Cash Balance</span><span>${_pvMoney(opening + netChange)}</span></div>
      </div>`;
  } else if (def.statementType === 'sce') {
    const adjustments = data.adjustments || [];
    const opening = data.opening_net_assets ?? 0;
    const surplus = data.surplus_for_period ?? 0;
    const closing = data.closing_net_assets ?? (opening + surplus + adjustments.reduce((s,a)=>s+(parseFloat(a.amount||0)),0));
    out.innerHTML = `
      <div class="fin-form-wrap" style="max-width:680px;">
        <div style="display:flex;justify-content:space-between;padding:6px 0;"><span>Opening Net Assets / Equity</span><span>${_pvMoney(opening)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;"><span>Surplus / (Deficit) for the period</span><span>${_pvMoney(surplus)}</span></div>
        ${adjustments.map(a => `<div style="display:flex;justify-content:space-between;padding:4px 0 4px 16px;"><span>${_finEsc(a.name || a.label || 'Adjustment')}</span><span>${_pvMoney(a.amount)}</span></div>`).join('')}
        ${_repGrandTotal('Closing Net Assets / Equity', closing)}
      </div>`;
  } else if (def.statementType === 'bank') {
    const bookBalance = data.book_balance ?? 0;
    const depositsInTransit = data.deposits_in_transit ?? 0;
    const outstandingCheques = data.outstanding_cheques ?? 0;
    const adjustedBook = data.adjusted_book_balance ?? (bookBalance + depositsInTransit - outstandingCheques);
    const bankStatement = data.bank_statement_balance ?? 0;
    const variance = data.variance ?? (adjustedBook - bankStatement);
    out.innerHTML = `
      <div class="fin-form-wrap" style="max-width:560px;">
        <div style="display:flex;justify-content:space-between;padding:6px 0;"><span>Book Balance (from GL)</span><span>${_pvMoney(bookBalance)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0 6px 16px;"><span>Add: Deposits in Transit</span><span>${_pvMoney(depositsInTransit)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0 6px 16px;"><span>Less: Outstanding Cheques</span><span>${_pvMoney(outstandingCheques)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:bold;border-top:1px solid #ddd;"><span>Adjusted Book Balance</span><span>${_pvMoney(adjustedBook)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;"><span>Bank Statement Balance</span><span>${_pvMoney(bankStatement)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:bold;font-size:1.05rem;border-top:2px solid #2c3e50;color:${Math.abs(variance) > 0.005 ? '#c0392b' : '#1e7e34'};">
          <span>Variance</span><span>${_pvMoney(variance)}</span>
        </div>
      </div>`;
  }
}

// ── AP Reconciliation (§2 of the 2026-07-16 addendum) ──────────────────────
function _repStatCard(label, value, color) {
  return `<div style="flex:1;min-width:160px;background:var(--white);border:1px solid var(--card-border,#e5e5e5);border-radius:8px;padding:14px 16px;">
    <div style="font-size:11px;font-weight:600;color:var(--grey-400,#999);text-transform:uppercase;letter-spacing:0.06em;">${_finEsc(label)}</div>
    <div style="font-size:1.15rem;font-weight:700;margin-top:4px;color:${color || 'var(--grey-900,#222)'};">${value}</div>
  </div>`;
}

function _repRenderApReconciliation(def, data) {
  const out = document.getElementById('rep-output');
  if (!data || typeof data !== 'object') { out.innerHTML = '<p class="fin-empty">No data returned.</p>'; return; }

  // Always a 200 — configured/is_reconciled decide the render, not the
  // HTTP status. Not-configured is a sysadmin prompt, never a red error.
  if (!data.configured) {
    out.innerHTML = `<div style="padding:14px 18px;border-radius:6px;border-left:3px solid var(--gold-500);background:var(--gold-100);color:#7a6110;font-size:0.9rem;">
      AP control account not configured — ask the sysadmin to set AP_CONTROL_ACCOUNT_ID.
    </div>`;
    return;
  }

  const cards = `<div style="display:flex;flex-wrap:wrap;gap:14px;margin:16px 0;">
    ${_repStatCard('Sub-ledger Balance', _pvMoney(data.subledger_balance))}
    ${_repStatCard('GL Balance', _pvMoney(data.gl_balance))}
    ${_repStatCard('Difference', _pvMoney(data.difference), data.is_reconciled ? 'var(--color-success)' : 'var(--coral-500)')}
  </div>`;

  if (data.is_reconciled) {
    out.innerHTML = `
      <div style="padding:12px 18px;border-radius:6px;background:#dcf3e2;color:#1e7e34;font-weight:600;font-size:0.9rem;">
        &#10003; Reconciled — the AP sub-ledger agrees with the GL.
      </div>
      ${cards}`;
    return;
  }

  const driftRows = (data.drift_invoices || []).map(d => `<tr>
    <td><a href="#" onclick="_pvSiOpenDetail(${d.invoice_id});return false;">${_finEsc(d.invoice_number || ('#' + d.invoice_id))}</a></td>
    <td>${_finEsc(_pvSupplierName(d.supplier_id))}</td>
    <td>${_finEsc(d.reason || '')}</td>
    <td>${_pvMoney(d.expected_in_gl)}</td>
  </tr>`).join('');

  out.innerHTML = `
    <div style="padding:12px 18px;border-radius:6px;border-left:3px solid var(--coral-500);background:var(--coral-100);color:var(--coral-600);font-weight:600;font-size:0.9rem;">
      AP sub-ledger and GL disagree by ${_pvMoney(data.difference)}.
    </div>
    ${cards}
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>INVOICE NUMBER</th><th>SUPPLIER</th><th>REASON</th><th>EXPECTED IN GL</th></tr></thead>
      <tbody>${driftRows || '<tr><td colspan="4" class="fin-empty">No drift rows returned.</td></tr>'}</tbody>
    </table></div>`;
}

// ── Supplier Statement (§3 of the 2026-07-16 addendum) ─────────────────────
// The response is now an object ({supplier_id, ..., rows, closing_balance,
// drift_warning?}), not a bare array — _repRenderTable's own data.rows
// fallback already happened to handle that shape, but drift_warning and the
// voided-row treatment need dedicated rendering, so this report gets its
// own path instead. Exact row field names for "this row is voided" aren't
// given in the addendum (only the JSON skeleton is), so — same convention
// this file already uses for unconfirmed shapes — try the likely candidates
// and fall back gracefully rather than assuming one.
function _repIsVoidedStatementRow(r) {
  const s = (r.status || r.invoice_status || '').toString().toLowerCase();
  return s === 'voided' || r.is_voided === true;
}

function _repRenderSupplierStatement(def, data) {
  const out = document.getElementById('rep-output');
  if (!data || typeof data !== 'object') { out.innerHTML = '<p class="fin-empty">No data for the selected criteria.</p>'; return; }
  const rows = Array.isArray(data) ? data : (data.rows || data.data || data.items || data.results || []);

  let html = '';
  if (data.drift_warning) {
    const dw = data.drift_warning;
    html += `<div style="padding:12px 18px;border-radius:6px;border-left:3px solid var(--coral-500);background:var(--coral-100);color:var(--coral-600);font-size:0.88rem;margin-bottom:14px;">
      <div style="font-weight:600;margin-bottom:6px;">${_finEsc(dw.message || 'Supplier statement disagrees with the AP control GL balance for this supplier.')}</div>
      <div style="display:flex;gap:22px;flex-wrap:wrap;font-size:0.85rem;">
        <span>Sub-ledger: <strong>${_pvMoney(dw.subledger_balance)}</strong></span>
        <span>GL: <strong>${_pvMoney(dw.gl_balance)}</strong></span>
        <span>Difference: <strong>${_pvMoney(dw.difference)}</strong></span>
      </div>
    </div>`;
  }

  if (!rows.length) {
    out.innerHTML = html + '<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">No data for the selected criteria.</td></tr></tbody></table></div>';
    return;
  }

  const firstRow = rows[0];
  const knownKeysPresent = def.columns.some(([key]) => firstRow.hasOwnProperty(key));
  const cols = knownKeysPresent ? def.columns : Object.keys(firstRow)
    .filter(k => !['status','invoice_status','is_voided'].includes(k))
    .map(k => [k, _repHumanize(k)]);

  const bodyRows = rows.map(r => {
    const cells = cols.map(([k]) => `<td>${_repCell(r[k])}</td>`).join('');
    if (_repIsVoidedStatementRow(r)) {
      return `<tr style="text-decoration:line-through;opacity:0.6;">${cells}<td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:600;color:var(--white);background:var(--coral-500);">Voided</span></td></tr>`;
    }
    return `<tr>${cells}<td></td></tr>`;
  }).join('');

  html += `
    <div style="display:flex;gap:24px;margin-bottom:12px;font-size:0.88rem;">
      <span>Opening Balance: <strong>${_pvMoney(data.opening_balance)}</strong></span>
      <span>Closing Balance: <strong>${_pvMoney(data.closing_balance)}</strong></span>
    </div>
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>${cols.map(([,label]) => `<th>${_finEsc(label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table></div>`;
  out.innerHTML = html;
}
