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

// Money-holding accounts registry — single source of truth for the Cash Book
// and Cashflow Statement per-account pickers. Endpoint returns every active
// Cash-and-Bank GL account tagged as bank / wallet / petty_cash, so pickers
// can pass gl_account_id (Cash Book) or cash_account_id (CFS) directly —
// including Tendepay wallets and Petty Cash Float, which have no
// BankAccount row and used to 404 when the FE sent bank_account_id.
let _repMoneyHoldingAccounts = null;
async function _repLoadMoneyHoldingAccounts() {
  if (_repMoneyHoldingAccounts !== null) return;
  const res = await apiFetch(`${API_BASE}/lookups/money-holding-accounts`);
  _repMoneyHoldingAccounts = (res && res.ok) ? _toArray(await res.json()) : [];
}
const _REP_MH_KIND_ORDER = { bank: 0, petty_cash: 1, wallet: 2 };
const _REP_MH_KIND_LABEL = { bank: 'Banks', petty_cash: 'Petty Cash', wallet: 'Wallets' };
function _repMoneyHoldingOptions() {
  const groups = { bank: [], petty_cash: [], wallet: [] };
  (_repMoneyHoldingAccounts || []).forEach(a => {
    const kind = groups[a.kind] ? a.kind : 'wallet';
    groups[kind].push(a);
  });
  return Object.keys(groups)
    .sort((a, b) => (_REP_MH_KIND_ORDER[a] ?? 99) - (_REP_MH_KIND_ORDER[b] ?? 99))
    .filter(k => groups[k].length)
    .map(k => {
      const opts = groups[k].map(a => {
        const numPfx = a.number ? `${a.number} - ` : '';
        const suffix = k === 'bank' && a.bank_name ? ` (${a.bank_name})` : '';
        return `<option value="${a.gl_account_id}">${_finEsc(numPfx + a.account_name + suffix)}</option>`;
      }).join('');
      return `<optgroup label="${_REP_MH_KIND_LABEL[k]}">${opts}</optgroup>`;
    }).join('');
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
  'reports-trial-balance': { title: 'Trial Balance', api: 'trial-balance', dateMode: 'asof',
    columns: [['number','NUMBER'],['account_name','ACCOUNT NAME'],['account_type','TYPE'],['debit_balance','DEBIT'],['credit_balance','CREDIT']], totals: true },
  'reports-cash-book': { title: 'Cash Book', api: 'cash-book', dateMode: 'range',
    extra: [{ key: 'gl_account_id', label: 'Cash / Bank Account', type: 'money_holding' }],
    columns: [['date','DATE'],['description','DESCRIPTION'],['reference','REFERENCE'],['debit','DEBIT'],['credit','CREDIT'],['balance','BALANCE']] },
  'reports-petty-cash-report': { title: 'Petty Cash Report', api: 'petty-cash-report', dateMode: 'range',
    columns: [['date','DATE'],['applicant','APPLICANT'],['purpose','PURPOSE'],['amount','AMOUNT'],['type','TYPE'],['status','STATUS']] },
  // SupplierStatementRow (openapi.json) has no "type" field — every row is an
  // AP invoice — and uses invoice_date/invoice_number, not date/reference.
  'reports-supplier-statements': { title: 'Supplier Statements', api: 'supplier-statements', dateMode: 'range', pathParam: 'supplier_id',
    extra: [{ key: 'supplier_id', label: 'Supplier', type: 'supplier', required: true }],
    columns: [['invoice_date','DATE'],['invoice_number','REFERENCE'],['amount','AMOUNT'],['running_balance','RUNNING BALANCE']] },
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
  // Both endpoints return the identical AgedStudentDebtorsReport shape
  // (confirmed via openapi.json: customer-aging-analysis's 200 response
  // literally $refs AgedStudentDebtorsReport, the same schema as
  // aged-student-debtors) — an object with current/30_days/60_days/90_plus
  // arrays of PER-INVOICE rows (entity_id/invoice_id/invoice_number/
  // student_id/amount_due/amount_paid/balance/due_date/days_overdue, no
  // student_name field) plus a totals object, NOT a flat array of
  // per-student rows with student_name/current/30_days/etc as the old
  // `columns` here assumed. That mismatch meant _repRenderTable's generic
  // data.data/items/results/rows/lines extraction never found an array to
  // render, so both reports silently showed "No data" regardless of
  // whether unpaid invoices existed. See _repRenderAgedStudentDebtors.
  'reports-students-arrears-analysis': { title: 'Students Arrears Analysis', api: 'aged-student-debtors', dateMode: 'asof', layout: 'aged-student-debtors' },
  'reports-customer-aging-analysis': { title: 'Customer Aging Analysis', api: 'customer-aging-analysis', dateMode: 'asof', layout: 'aged-student-debtors' },
  'reports-student-prepayment-analysis': { title: 'Student Prepayment Analysis', api: 'student-prepayment-analysis', dateMode: 'asof',
    columns: [['student_name','STUDENT NAME'],['student_id','STUDENT ID'],['credit_balance','CREDIT BALANCE']] },
  // Same bucketed-report shape as aged-student-debtors, confirmed via
  // openapi.json ($ref AgedPayablesReport): current/30_days/60_days/
  // 90_plus/disputed arrays of AgingSupplierRow (per-invoice, keyed by
  // supplier_id — no supplier_name field) plus a totals object and a
  // separate total_disputed. The old flat columns guess (supplier_name/
  // current/30_days/.../total) never matched a real array, so this report
  // silently showed "No data" the same way the two aged-student-debtors
  // reports did before their dedicated renderer — see _repRenderAgedPayables.
  'reports-aged-payables': { title: 'Aged Payables', api: 'aged-payables', dateMode: 'asof', layout: 'aged-payables' },
  // AP sub-ledger vs GL control account. The comment this replaced claimed
  // "Always 200s — configured/is_reconciled drive the render, not the HTTP
  // status" — that no longer matches the live schema: the endpoint's date
  // param is named `as_of` (no `_date` suffix) and is required with no
  // default, so the generic asof handler's hardcoded `as_of_date` was never
  // recognized and every request 422'd. dateParam overrides the param name
  // for this one route without touching the shared 'asof' handling.
  'reports-ap-reconciliation': { title: 'AP Reconciliation', api: 'ap-reconciliation', dateMode: 'asof', dateParam: 'as_of', layout: 'ap-reconciliation' },

  'reports-daily-cash-return': { title: 'Daily Cash Return', api: 'daily-cash-return', dateMode: 'single', dateParam: 'report_date',
    columns: [['account','ACCOUNT'],['opening_balance','OPENING BALANCE'],['inflows','INFLOWS'],['outflows','OUTFLOWS'],['closing_balance','CLOSING BALANCE']] },

  // Statement-layout reports — handled by dedicated renderers, see _repRenderStatement()
  'reports-statement-of-financial-performance': { title: 'Statement of Financial Performance', api: 'statement-of-financial-performance', dateMode: 'range', layout: 'statement', statementType: 'sfp' },
  'reports-statement-of-financial-position': { title: 'Statement of Financial Position', api: 'statement-of-financial-position', dateMode: 'asof', compareDate: true, layout: 'statement', statementType: 'bs' },
  'reports-notes-of-financial-statement': { title: 'Notes of Financial Statement', api: 'notes-of-financial-statement', dateMode: 'range', layout: 'notes' },
  'reports-cashflow-statement': { title: 'Cashflow Statement', api: 'cashflow-statement', dateMode: 'range', layout: 'statement', statementType: 'cf',
    extra: [{ key: 'cash_account_id', label: 'Cash / Bank Account', type: 'money_holding' }] },
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

  'reports-fixed-assets-schedule': { title: 'Fixed Assets Schedule', api: 'fixed-assets-schedule', dateMode: 'range', layout: 'fixed-assets-schedule' },

  'reports-consolidated-student-debtors': { title: 'Consolidated Student Debtors', api: 'consolidated-student-debtors', dateMode: 'asof',
    extra: [{ key: 'class_id', label: 'Class', type: 'class' }], layout: 'consolidated-student-debtors' },
  'reports-student-fee-analysis': { title: 'Student Fee Analysis', api: 'student-fee-analysis', dateMode: 'range',
    extra: [{ key: 'class_id', label: 'Class', type: 'class' }], layout: 'student-fee-analysis' },
};

// School-shaped SoFP/SoCI views (2026-07-21 addendum §3, §4) — now the only
// render for SoFP/SoFI; the Classic flat statement toggle was
// removed 2026-07-23 (user request) in favour of always showing this view.
const _REP_SCHOOL_VIEW_TYPES = new Set(['bs', 'sfp']);

async function loadFinanceReportView(container, routeKey) {
  const def = REPORT_DEFS[routeKey];
  if (!def) { container.innerHTML = '<p>Unknown report.</p>'; return; }
  await _pvLoadLookups();
  if ((def.extra || []).some(f => f.type === 'class')) await _rcvLoadLookups({ classes: true });
  if ((def.extra || []).some(f => f.type === 'money_holding')) await _repLoadMoneyHoldingAccounts();
  if (def.layout === 'aged-student-debtors') await _rcvLoadLookups({ students: true });

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
    if (f.type === 'money_holding') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}${f.required ? ' *' : ''}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">${f.required ? 'Please Select' : 'All'}</option>${_repMoneyHoldingOptions()}</select></div>`;
    if (f.type === 'ledger') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">All</option>${_pvLedgerOptions()}</select></div>`;
    if (f.type === 'supplier') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}${f.required ? ' *' : ''}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">Please Select</option>${_pvSupplierOptions()}</select></div>`;
    if (f.type === 'tendepaywallet') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">All</option>${_pvTendepayWalletOptions()}</select></div>`;
    if (f.type === 'taxtype') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">All</option>${_PV_TAX_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>`;
    if (f.type === 'jestatus') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">All</option><option value="draft">Draft</option><option value="posted">Posted</option><option value="reversed">Reversed</option></select></div>`;
    if (f.type === 'number') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><input type="number" id="rep-x-${f.key}" class="fin-filter-input" value="${f.default ?? ''}"></div>`;
    if (f.type === 'class') return `<div class="fin-filter-field"><label class="fin-filter-label">${f.label}</label><select id="rep-x-${f.key}" class="fin-filter-select"><option value="">All</option>${_rcvClassOptions('')}</select></div>`;
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
    params.set(def.dateParam || 'as_of_date', document.getElementById('rep-asof-date').value);
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
    if (def.layout === 'statement' && _REP_SCHOOL_VIEW_TYPES.has(def.statementType)) {
      if (def.statementType === 'bs') _repRenderSchoolSoFP(data);
      else _repRenderSchoolSoCI(data);
    }
    else if (def.layout === 'statement') _repRenderStatement(def, data);
    else if (def.layout === 'notes') _repRenderNotes(def, data);
    else if (def.layout === 'fixed-assets-schedule') _repRenderFixedAssetsSchedule(data);
    else if (def.layout === 'consolidated-student-debtors') _repRenderConsolidatedDebtors(data);
    else if (def.layout === 'aged-student-debtors') _repRenderAgedStudentDebtors(data);
    else if (def.layout === 'aged-payables') _repRenderAgedPayables(data);
    else if (def.layout === 'student-fee-analysis') _repRenderStudentFeeAnalysis(data);
    else if (def.layout === 'ap-reconciliation') _repRenderApReconciliation(def, data);
    else if (routeKey === 'reports-supplier-statements') _repRenderSupplierStatement(def, data);
    else if (routeKey === 'reports-trial-balance') _repRenderTrialBalance(def, data);
    else if (routeKey === 'reports-cash-book' || routeKey === 'reports-general-ledger') _repRenderLedgerLines(def, data);
    else _repRenderTable(def, data);
  } catch (e) { showToast('Network error generating report.', 'error'); }
}

async function _repExport(routeKey, format) {
  const def = REPORT_DEFS[routeKey];
  const params = _repBuildParams(def, format);
  try {
    await authBlobDownload(_repUrl(def, params), `${def.api}.${format === 'excel' ? 'xlsx' : 'csv'}`, {
      errorPrefix: 'Export failed: ',
    });
  } catch (e) { showToast('Network error during export.', 'error'); }
}

// ── Table layout (most reports) ─────────────────────────────────────────────
function _repRenderTable(def, data) {
  const rows = Array.isArray(data) ? data : (data.data || data.items || data.results || data.rows || data.lines || []);
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

// ── null_subtype_accounts — data-quality banner (2026-08-17 addendum,
// shipped live on TrialBalanceReport/StatementOfFinancialPositionReport/IncomeExpenseReport
// as of 2026-08-18). NullSubtypeAccountRow: {account_id, number,
// account_name, account_type}. These accounts still appear inline under
// their normal "Unclassified" subtype group (see _repGroups) — this banner
// is just a fast, walk-the-tree-free pointer to go fix them.
function _repReclassifyAccount(accountId) {
  window._coaOpenEditId = accountId;
  loadView('fin-chart-of-accounts');
}
function _repNullSubtypeBanner(accounts) {
  if (!accounts || !accounts.length) return '';
  const n = accounts.length;
  return `
    <div style="padding:10px 14px;border-radius:6px;border-left:3px solid var(--gold-500,#C9A227);background:var(--gold-100,#fdf3d6);color:#7a6110;font-size:0.85rem;margin-bottom:14px;">
      <strong>${n} account${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} subtype classification</strong> — shown as "Unclassified" below until fixed:
      <ul style="margin:6px 0 0 18px;">
        ${accounts.map(a => `<li>${_finEsc(a.number)} — ${_finEsc(a.account_name)} &middot; <a href="#" onclick="_repReclassifyAccount(${a.account_id});return false;">Reclassify</a></li>`).join('')}
      </ul>
    </div>`;
}

// ── Trial Balance ────────────────────────────────────────────────────────
// Confirmed live shape (openapi.json, 2026-07-23): the response is an object
// { start_date, end_date, accounts: [...], total_debits, total_credits,
// is_balanced }, not a bare array — _repRenderTable's generic data.data/
// data.items/data.results/data.rows fallback doesn't reach `accounts`, and
// each row uses `debits`/`credits`, not the `debit_total`/`credit_total`
// guess in def.columns above. Totals come straight from the backend rather
// than being re-summed client-side from the row list.
function _repRenderTrialBalance(def, data) {
  const out = document.getElementById('rep-output');
  const rows = (data && Array.isArray(data.accounts)) ? data.accounts : [];
  if (!rows.length) { out.innerHTML = '<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">No data for the selected criteria.</td></tr></tbody></table></div>'; return; }

  const cols = def.columns;
  const bodyRows = rows.map(r => `<tr>${cols.map(([k]) => `<td>${_repCell(r[k])}</td>`).join('')}</tr>`).join('');
  const totalsRow = cols.map(([k], i) => {
    if (i === 0) return `<td><strong>TOTAL</strong></td>`;
    if (k === 'debit_balance') return `<td><strong>${_pvMoney(data.total_debits)}</strong></td>`;
    if (k === 'credit_balance') return `<td><strong>${_pvMoney(data.total_credits)}</strong></td>`;
    return `<td></td>`;
  }).join('');

  const balanced = data.is_balanced === true;
  out.innerHTML = _repNullSubtypeBanner(data.null_subtype_accounts) + `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>${cols.map(([,label]) => `<th>${_finEsc(label)}</th>`).join('')}</tr></thead>
      <tbody>${bodyRows}</tbody>
      <tfoot><tr class="fin-tfoot-total">${totalsRow}</tr></tfoot>
    </table></div>
    <div class="balance-check" style="display:flex;justify-content:flex-end;padding:10px 4px;font-weight:700;color:${balanced ? '#1e7e34' : 'var(--coral-600)'};">
      <span>${balanced ? 'Balances' : 'Out of balance'}</span>
    </div>`;
}

// ── Cash Book / General Ledger — DR/CR split ────────────────────────────────
// BE shape (GeneralLedgerLine): { je_id, jv_number, entry_date, reference,
// account_id, account_name, account_number, line_type, amount, running_balance }.
// Rendered as one row per JE line with amount split across DEBIT/CREDIT
// columns based on line_type. Cash book usually spans multiple cash-and-bank
// accounts (bank_account_id omitted), so we show the ACCOUNT column too; the
// GL page can pass a single account_id filter but the column stays legible.
function _repRenderLedgerLines(def, data) {
  const out = document.getElementById('rep-output');
  const rows = (data && Array.isArray(data.lines)) ? data.lines : [];
  // Cash Book carries a standard box header (opening / receipts / payments
  // / closing). GL doesn't; the header renders only when the fields exist.
  const hasBoxHeader = data && data.opening_balance !== undefined;
  const boxHeaderHtml = hasBoxHeader ? `
    <div class="fin-form-wrap" style="max-width:520px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Opening Balance</span><span>${_pvMoney(data.opening_balance)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Total Receipts (DR)</span><span>${_pvMoney(data.total_receipts)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Total Payments (CR)</span><span>${_pvMoney(data.total_payments)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:bold;border-top:2px solid #2c3e50;"><span>Closing Balance</span><span>${_pvMoney(data.closing_balance)}</span></div>
    </div>` : '';
  if (!rows.length) {
    out.innerHTML = boxHeaderHtml + '<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">No line activity for the selected criteria.</td></tr></tbody></table></div>';
    return;
  }
  const cols = [
    ['entry_date',      'DATE'],
    ['jv_number',       'JV NO.'],
    ['account_name',    'ACCOUNT'],
    ['reference',       'REFERENCE'],
    ['debit',           'DEBIT'],
    ['credit',          'CREDIT'],
    ['running_balance', 'BALANCE'],
  ];
  let totalDr = 0, totalCr = 0;
  const bodyRows = rows.map(r => {
    const amt = parseFloat(r.amount || 0) || 0;
    const isDr = (r.line_type || '').toString().toLowerCase() === 'debit';
    const dr = isDr ? amt : 0;
    const cr = isDr ? 0 : amt;
    totalDr += dr;
    totalCr += cr;
    const view = {
      entry_date: r.entry_date,
      jv_number: r.jv_number,
      account_name: r.account_name,
      reference: r.reference,
      debit: dr || '',
      credit: cr || '',
      running_balance: r.running_balance,
    };
    return `<tr>${cols.map(([k]) => `<td>${_repCell(view[k])}</td>`).join('')}</tr>`;
  }).join('');
  const totalsRow = cols.map(([k], i) => {
    if (i === 0) return '<td><strong>TOTAL</strong></td>';
    if (k === 'debit')  return `<td><strong>${_pvMoney(totalDr)}</strong></td>`;
    if (k === 'credit') return `<td><strong>${_pvMoney(totalCr)}</strong></td>`;
    return '<td></td>';
  }).join('');
  out.innerHTML = boxHeaderHtml + `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>${cols.map(([,label]) => `<th>${_finEsc(label)}</th>`).join('')}</tr></thead>
      <tbody>${bodyRows}</tbody>
      <tfoot><tr class="fin-tfoot-total">${totalsRow}</tr></tfoot>
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

// ── Statement layout (Cashflow / SCNA / Bank Reconciliation) ──
// Accounting convention: outflows print in parentheses rather than with a
// minus sign, matching the printed statement format the finance team works
// from. Amounts are server-signed (CR non-cash = + inflow, DR non-cash = −
// outflow — 2026-08-24 addendum §A), so the sign alone decides the bracket.
function _repCfMoney(v) {
  const n = parseFloat(v) || 0;
  return n < 0 ? `(${_pvMoney(Math.abs(n))})` : _pvMoney(n);
}
// Section nets read CashFlowSection.net straight off the wire rather than
// re-summing items. The server guarantees sum(items.amount) === net by
// construction (§A.1), so this keeps the FE from ever drifting from that
// invariant even if a future edge case needs a special-cased audit trail.
// colourFlows is off for the closing summary section, whose rows are cash
// balances rather than inflows/outflows — tinting those inflow-blue would
// read as a direction they don't have.
function _repCfSection(num, title, items, net, netLabel, colourFlows) {
  const rows = (items || []).length
    ? items.map(it => {
        const amt = parseFloat(it.amount ?? it.value ?? 0) || 0;
        const cls = colourFlows ? (amt < 0 ? ' is-out' : ' is-in') : '';
        return `<tr>
          <td>${_finEsc(it.name || it.account_name || it.label || '')}</td>
          <td class="rep-cf-amt${cls}">${_repCfMoney(amt)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="2" class="rep-cf-none">No movements in this period.</td></tr>';
  return `
    <section class="rep-cf-section">
      <h3 class="rep-cf-section-title">${num}. ${_finEsc(title)}</h3>
      <table class="rep-cf-table">
        <thead><tr><th>Description</th><th class="rep-cf-amt">Amount (KES)</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="rep-cf-net">
            <td>${_finEsc(netLabel)}</td>
            <td class="rep-cf-amt">${_repCfMoney(net)}</td>
          </tr>
        </tbody>
      </table>
    </section>`;
}
function _repGrandTotal(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:bold;font-size:1.05rem;border-top:2px solid #2c3e50;margin-top:8px;">
    <span>${_finEsc(label)}</span><span>${_pvMoney(value)}</span>
  </div>`;
}
function _repRenderStatement(def, data) {
  const out = document.getElementById('rep-output');
  if (!data || typeof data !== 'object') { out.innerHTML = '<p class="fin-empty">No data for the selected criteria.</p>'; return; }

  if (def.statementType === 'cf') {
    // BE returns CashFlowSection objects: {items: [...], net: "..."}. The
    // pre-2026-08-15 renderer treated each section as a bare array, so
    // `.length` was undefined, the emptiness guard fired, and the raw JSON
    // fell through into a <pre> block on screen. Unpack .items / .net.
    const opItems = (data.operating && Array.isArray(data.operating.items)) ? data.operating.items : [];
    const invItems = (data.investing && Array.isArray(data.investing.items)) ? data.investing.items : [];
    const finItems = (data.financing && Array.isArray(data.financing.items)) ? data.financing.items : [];
    if (!opItems.length && !invItems.length && !finItems.length) {
      out.innerHTML = '<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">No data for the selected criteria.</td></tr></tbody></table></div>';
      return;
    }
    // Prefer server-computed nets so the FE never drifts from the BE math.
    const netOp = parseFloat(data.operating?.net ?? 0) || 0;
    const netInv = parseFloat(data.investing?.net ?? 0) || 0;
    const netFin = parseFloat(data.financing?.net ?? 0) || 0;
    const opening = parseFloat(data.opening_cash_balance ?? 0) || 0;
    const closing = parseFloat(data.closing_cash_balance ?? (opening + netOp + netInv + netFin)) || 0;
    const netChange = netOp + netInv + netFin;

    const startDate = data.start_date || document.getElementById('rep-start-date')?.value;
    const endDate = data.end_date || document.getElementById('rep-end-date')?.value;
    const periodLine = (startDate && endDate)
      ? `For the period ${_pvDate(startDate)} to ${_pvDate(endDate)}`
      : '';

    out.innerHTML = `
      <div class="rep-cf">
        <div class="rep-cf-head">
          <div class="rep-cf-head-title">Cash Flow Statement</div>
          ${periodLine ? `<div class="rep-cf-head-period">${_finEsc(periodLine)}</div>` : ''}
        </div>
        ${_repCfSection(1, 'Cash Flows from Operating Activities', opItems, netOp,
          `Net Cash ${netOp < 0 ? 'Used in' : 'Provided by'} Operating Activities`, true)}
        ${_repCfSection(2, 'Cash Flows from Investing Activities', invItems, netInv,
          `Net Cash ${netInv < 0 ? 'Used in' : 'Provided by'} Investing Activities`, true)}
        ${_repCfSection(3, 'Cash Flows from Financing Activities', finItems, netFin,
          `Net Cash ${netFin < 0 ? 'Used in' : 'Provided by'} Financing Activities`, true)}
        ${_repCfSection(4, `Net ${netChange < 0 ? 'Decrease' : 'Increase'} in Cash and Cash Equivalents`, [
          { name: 'Net Cash at Beginning of Period', amount: opening },
          { name: `Net ${netChange < 0 ? 'Decrease' : 'Increase'} in Cash and Cash Equivalents`, amount: netChange },
        ], closing, 'Net Cash at End of Period', false)}
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
    // Accountant-standard four-corner reconciliation. Both sides adjust
    // toward the same true cash figure:
    //   adjusted_book       = book − unbooked_charges + unbooked_credits
    //   adjusted_statement  = statement + deposits_in_transit − outstanding_cheques
    // Pre-2026-08-15 the FE math applied statement-side items to the
    // book side, which was silently wrong but latent because bank rec
    // never returned real data. Now that the BE is populated, this
    // renderer computes the correct arithmetic AND prefers the
    // server-computed values so FE/BE can't drift.
    const bookBalance         = parseFloat(data.book_balance ?? 0) || 0;
    const unbookedCharges     = parseFloat(data.unbooked_bank_charges ?? 0) || 0;
    const unbookedCredits     = parseFloat(data.unbooked_bank_credits ?? 0) || 0;
    const depositsInTransit   = parseFloat(data.deposits_in_transit ?? 0) || 0;
    const outstandingCheques  = parseFloat(data.outstanding_cheques ?? 0) || 0;
    const bankStatement       = data.bank_statement_balance != null
                                 ? parseFloat(data.bank_statement_balance) : null;
    const adjustedBook        = data.adjusted_book_balance != null
                                 ? parseFloat(data.adjusted_book_balance)
                                 : (bookBalance - unbookedCharges + unbookedCredits);
    const adjustedStatement   = data.adjusted_statement_balance != null
                                 ? parseFloat(data.adjusted_statement_balance)
                                 : (bankStatement != null ? bankStatement + depositsInTransit - outstandingCheques : null);
    const variance            = data.variance != null
                                 ? parseFloat(data.variance)
                                 : (adjustedStatement != null ? adjustedBook - adjustedStatement : null);
    const isReconciled        = data.is_reconciled === true || (variance != null && Math.abs(variance) < 0.005);
    const warnings            = Array.isArray(data.warnings) ? data.warnings : [];
    // The addendum's "reconciling_items[]" isn't the live field name — the
    // deployed BankReconciliationReport carries the same reconciling-item
    // detail as unbooked_bank_lines[] (BankReconciliationLineRow: line_id,
    // posting_date, description, reference, amount), confirmed via
    // openapi.json. Rendering that field since it's what's actually on the
    // wire.
    const reconcilingItems    = Array.isArray(data.unbooked_bank_lines) ? data.unbooked_bank_lines : [];
    const gatewayBalance      = data.gateway_balance != null ? parseFloat(data.gateway_balance) : null;

    const warningBlock = warnings.length ? `
      <div style="padding:10px 14px;border-radius:6px;border-left:3px solid #c99;background:#fff6f6;color:#844;font-size:0.85rem;margin-bottom:12px;">
        ${warnings.map(w => `<div>• ${_finEsc(w)}</div>`).join('')}
      </div>` : '';

    const varianceColor = variance == null ? '#666' : (isReconciled ? '#1e7e34' : '#c0392b');
    const varianceText = variance == null ? 'N/A (no statement balance)' : _pvMoney(variance);

    const reconcilingItemsBlock = reconcilingItems.length ? `
      <div style="margin-top:16px;">
        <div style="font-weight:bold;color:#2c3e50;margin-bottom:6px;">Reconciling Items</div>
        <div class="fin-table-wrap"><table class="fin-table">
          <thead><tr><th>DATE</th><th>DESCRIPTION</th><th>REFERENCE</th><th>AMOUNT</th></tr></thead>
          <tbody>${reconcilingItems.map(li => `<tr>
            <td>${_pvDate(li.posting_date)}</td>
            <td>${_finEsc(li.description || '')}</td>
            <td>${_finEsc(li.reference || '—')}</td>
            <td>${_pvMoney(li.amount)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : '';

    const gatewayBalanceBlock = gatewayBalance != null ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;margin-top:8px;border-top:1px solid #ddd;"><span>Gateway Balance</span><span>${_pvMoney(gatewayBalance)}</span></div>` : '';

    out.innerHTML = warningBlock + `
      <div class="fin-form-wrap" style="max-width:600px;">
        <div style="font-weight:bold;color:#2c3e50;margin-bottom:6px;">Book side</div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;"><span>Book Balance (from GL)</span><span>${_pvMoney(bookBalance)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0 4px 16px;"><span>Less: Unbooked bank charges</span><span>(${_pvMoney(unbookedCharges)})</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0 4px 16px;"><span>Add: Unbooked bank credits</span><span>${_pvMoney(unbookedCredits)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:bold;border-top:1px solid #ddd;"><span>Adjusted Book Balance</span><span>${_pvMoney(adjustedBook)}</span></div>
        <div style="height:12px;"></div>
        <div style="font-weight:bold;color:#2c3e50;margin-bottom:6px;">Statement side</div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;"><span>Bank Statement Balance</span><span>${bankStatement != null ? _pvMoney(bankStatement) : '<em>not available</em>'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0 4px 16px;"><span>Add: Deposits in transit</span><span>${_pvMoney(depositsInTransit)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0 4px 16px;"><span>Less: Outstanding cheques</span><span>(${_pvMoney(outstandingCheques)})</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:bold;border-top:1px solid #ddd;"><span>Adjusted Statement Balance</span><span>${adjustedStatement != null ? _pvMoney(adjustedStatement) : '<em>N/A</em>'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:bold;font-size:1.05rem;border-top:2px solid #2c3e50;color:${varianceColor};">
          <span>${isReconciled ? 'Reconciled ✓' : 'Variance'}</span><span>${varianceText}</span>
        </div>
        ${gatewayBalanceBlock}
      </div>
      ${reconcilingItemsBlock}`;
  }
}

// ── School-shaped SoFP / SoCI (2026-07-21 addendum §3, §4) ──────────────────
// Additive alongside _repRenderStatement's 'bs'/'sfp' branches above, which
// stay untouched — this only runs when the operator has the Schools View
// toggle selected. Groups arrive pre-sorted and pre-subtotaled server-side;
// rendered in server order, never resorted or re-summed client-side.
// Two-column comparison support (2026-08-26 addendum §C): the SoFP endpoint
// returns a FLAT report with an optional `prior_period` sub-object — the old
// {current, prior} comparison wrapper is gone, along with
// GET /api/reports/balance-sheet. `prior_period` is recursively typed but
// always terminates after one level, so nothing here ever walks it twice.
function _repSoFPPriorIndex(prior) {
  const byAccount = new Map();
  const bySubtype = new Map();
  if (!prior) return { byAccount, bySubtype };
  ['non_current_asset_groups','current_asset_groups','non_current_liability_groups',
   'current_liability_groups','equity_groups'].forEach(key => {
    (prior[key] || []).forEach(g => {
      bySubtype.set(`${key}::${g.subtype}`, g.subtotal);
      (g.accounts || []).forEach(a => {
        if (a.account_id != null) byAccount.set(String(a.account_id), a.balance);
      });
    });
  });
  return { byAccount, bySubtype };
}

// One statement row. `prior` is undefined for the single-column reports
// (SoCI and an un-compared SoFP); pass null explicitly to render an empty
// prior cell so the columns stay aligned when a line has no prior match.
function _repStatementRow(label, value, opts = {}) {
  const { prior, cmp = false, indent = 0, weight = '', border = '', color = '', size = '' } = opts;
  const cells = cmp
    ? `<span style="text-align:right;">${_pvMoney(value)}</span><span style="text-align:right;color:#666;">${prior == null ? '—' : _pvMoney(prior)}</span>`
    : `<span style="text-align:right;">${_pvMoney(value)}</span>`;
  return `<div style="display:grid;grid-template-columns:1fr ${cmp ? '140px 140px' : '140px'};gap:12px;padding:${weight ? '4px' : '2px'} 0 ${weight ? '4px' : '2px'} ${indent}px;${border}${weight ? `font-weight:${weight};` : ''}${color ? `color:${color};` : ''}${size ? `font-size:${size};` : ''}">
    <span>${_finEsc(label)}</span>${cells}
  </div>`;
}

function _repGroupLine(a, prior, cmp) {
  return _repStatementRow(a.name || a.account_name || a.label || '',
    a.amount ?? a.balance ?? a.value,
    { prior, cmp, indent: 32, border: 'border-bottom:1px solid #f5f5f5;' });
}

// priorIdx/groupKey are only supplied by the SoFP caller; SoCI calls
// _repGroups(groups) unchanged and gets the original single-column render.
function _repGroups(groups, priorIdx, groupKey) {
  const cmp = !!priorIdx;
  return (groups || []).map(g => `
    <div style="margin-bottom:6px;">
      <div style="font-weight:600;color:#2c3e50;padding:4px 0 4px 16px;">
        ${_finEsc(g.subtype)}
        ${g.subtype === 'Unclassified' ? '<span style="font-size:0.75rem;font-weight:400;color:#8a6d00;"> — Awaiting classification, ask ops to run the backfill.</span>' : ''}
      </div>
      ${(g.accounts || []).map(a => _repGroupLine(a, cmp ? (priorIdx.byAccount.has(String(a.account_id)) ? priorIdx.byAccount.get(String(a.account_id)) : null) : undefined, cmp)).join('')}
      ${_repStatementRow('Subtotal', g.subtotal, {
        cmp,
        prior: cmp ? (priorIdx.bySubtype.has(`${groupKey}::${g.subtype}`) ? priorIdx.bySubtype.get(`${groupKey}::${g.subtype}`) : null) : undefined,
        indent: 16, weight: '600', border: 'border-top:1px solid #eee;' })}
    </div>`).join('');
}
function _repSchoolSectionTotal(label, value, navy, prior, cmp) {
  return _repStatementRow(label, value, {
    cmp, prior, weight: '700',
    border: navy ? 'border-top:2px solid #2c3e50;margin-top:2px;' : 'border-top:1px solid #ddd;margin-top:2px;',
    color: navy ? '#2c3e50' : '', size: navy ? '1.02rem' : '',
  });
}

function _repRenderSchoolSoFP(data) {
  const out = document.getElementById('rep-output');
  if (!data || typeof data !== 'object') { out.innerHTML = '<p class="fin-empty">No data for the selected criteria.</p>'; return; }
  const totalAssets = parseFloat(data.total_assets || 0);
  const totalLiabEq = parseFloat(data.total_liabilities_equity || 0);
  const diff = totalAssets - totalLiabEq;
  const balanced = data.is_balanced === true;
  // Flat report: every current-period field is at the root. Only one level of
  // prior_period is ever read — the inner instance's own prior_period is
  // always null and is deliberately ignored.
  const prior = data.prior_period || null;
  const cmp = !!prior;
  const idx = cmp ? _repSoFPPriorIndex(prior) : null;
  const G = (key) => _repGroups(data[key], idx, key);
  const T = (label, key, navy) => _repSchoolSectionTotal(label, data[key], navy, cmp ? prior[key] : undefined, cmp);

  const header = cmp ? `
    <div style="display:grid;grid-template-columns:1fr 140px 140px;gap:12px;padding:0 0 8px;border-bottom:2px solid #2c3e50;font-weight:700;color:#2c3e50;font-size:0.85rem;text-transform:uppercase;">
      <span></span>
      <span style="text-align:right;">${_finEsc(_pvDate(data.as_of_date))}</span>
      <span style="text-align:right;">${_finEsc(_pvDate(prior.as_of_date || data.compare_to_date))}</span>
    </div>` : '';

  out.innerHTML = _repNullSubtypeBanner(data.null_subtype_accounts) + `
    <div class="fin-form-wrap" style="max-width:${cmp ? '860px' : '720px'};">
      ${header}
      <div style="font-weight:700;color:#2c3e50;margin:4px 0 6px;">Non-current assets</div>
      ${G('non_current_asset_groups')}
      ${T('Total non-current assets', 'total_non_current_assets')}

      <div style="font-weight:700;color:#2c3e50;margin:14px 0 6px;">Current assets</div>
      ${G('current_asset_groups')}
      ${T('Total current assets', 'total_current_assets')}

      <div style="font-weight:700;color:#2c3e50;margin:14px 0 6px;">Current liabilities</div>
      ${G('current_liability_groups')}
      ${T('Total current liabilities', 'total_current_liabilities')}

      ${T('Net working capital', 'net_working_capital', true)}

      <div style="font-weight:700;color:#2c3e50;margin:14px 0 6px;">Non-current liabilities</div>
      ${G('non_current_liability_groups')}
      ${T('Total non-current liabilities', 'total_non_current_liabilities')}

      ${T('Net assets', 'total_net_assets', true)}

      <div style="font-weight:700;color:#2c3e50;margin:14px 0 6px;">Financed by</div>
      ${G('equity_groups')}
      ${_repStatementRow('Retained Surplus', data.retained_surplus, { cmp, prior: cmp ? prior.retained_surplus : undefined, indent: 16 })}
      ${T('Total Liabilities + Equity', 'total_liabilities_equity')}

      <div class="balance-check" style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;margin-top:6px;color:${balanced ? '#1e7e34' : 'var(--coral-600)'};">
        <span>${balanced ? 'Balances' : `Out of balance by ${_pvMoney(Math.abs(diff))}`}</span>
      </div>
    </div>`;
}

function _repRenderSchoolSoCI(data) {
  const out = document.getElementById('rep-output');
  if (!data || typeof data !== 'object') { out.innerHTML = '<p class="fin-empty">No data for the selected criteria.</p>'; return; }

  const OPEX_SECTION_ORDER = ['Staff Costs', 'Direct Academic Costs', 'Premises Costs', 'Administrative Costs', 'Depreciation', 'Other Operating'];
  const opexGroups = data.operating_expense_groups || [];
  const bySection = new Map();
  opexGroups.forEach(g => {
    const section = g.section || 'Other Operating';
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(g);
  });
  const opexHtml = OPEX_SECTION_ORDER
    .filter(section => bySection.has(section))
    .map(section => `
      <div style="margin:10px 0 6px 16px;font-weight:600;color:#2c3e50;">${_finEsc(section)}</div>
      ${_repGroups(bySection.get(section))}`)
    .join('');

  const grossSurplus = parseFloat(data.gross_surplus || 0);
  const totalOpex = parseFloat(data.total_operating_expenses || 0);
  const netSurplusFromOps = grossSurplus - totalOpex;

  out.innerHTML = _repNullSubtypeBanner(data.null_subtype_accounts) + `
    <div class="fin-form-wrap" style="max-width:720px;">
      <div style="font-weight:700;color:#2c3e50;margin:4px 0 6px;">Revenue</div>
      ${_repGroups(data.revenue_groups)}
      ${_repSchoolSectionTotal('Total revenue', data.total_revenue, true)}

      <div style="font-weight:700;color:#2c3e50;margin:14px 0 6px;">Cost of sales</div>
      ${_repGroups(data.cost_of_sales_groups)}
      ${_repSchoolSectionTotal('Total cost of sales', data.total_cost_of_sales)}
      ${_repSchoolSectionTotal('Gross surplus', data.gross_surplus, true)}

      <div style="font-weight:700;color:#2c3e50;margin:14px 0 6px;">Operating expenses</div>
      ${opexHtml}
      ${_repSchoolSectionTotal('Total operating expenses', data.total_operating_expenses)}
      ${_repSchoolSectionTotal('Net surplus from operations', netSurplusFromOps, true)}

      <div style="font-weight:700;color:#2c3e50;margin:14px 0 6px;">Financial charges</div>
      ${_repGroups(data.financial_charge_groups)}
      ${_repSchoolSectionTotal('Total financial charges', data.total_financial_charges)}
      ${_repSchoolSectionTotal('Net surplus before tax', data.net_surplus_before_tax, true)}

      <div style="font-weight:700;color:#2c3e50;margin:14px 0 6px;">Tax expense</div>
      ${_repGroups(data.tax_expense_groups)}
      ${_repSchoolSectionTotal('Total tax expense', data.total_tax_expense)}
      ${_repSchoolSectionTotal('Net surplus after tax', data.net_surplus_after_tax, true)}
    </div>`;
}

// ── Fixed Assets Schedule (2026-07-21 addendum §6) ──────────────────────────
// Response schema is unconfirmed beyond the prose ("cost_opening / additions
// / disposals / closing" and "accum_dep_opening / charge / disposals /
// closing") — read literally each group's fields are prefixed to avoid a key
// collision (cost_additions vs accum_dep_charge etc.), so that's the primary
// guess; a nested {cost:{...}, accum_dep:{...}} shape is tried as a fallback,
// same defensive convention as the rest of this file.
function _repFaSchedVal(obj, flatKey, group, field) {
  if (obj[flatKey] !== undefined) return obj[flatKey];
  if (obj[group] && obj[group][field] !== undefined) return obj[group][field];
  return 0;
}
function _repRenderFixedAssetsSchedule(data) {
  const out = document.getElementById('rep-output');
  const cols = (data && (data.columns || data.rows)) || [];
  if (!cols.length) { out.innerHTML = '<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">No data for the selected criteria.</td></tr></tbody></table></div>'; return; }

  const rows = cols.map(c => `<tr>
    <td>${_finEsc(c.asset_class || '')}</td>
    <td>${_pvMoney(_repFaSchedVal(c,'cost_opening','cost','opening'))}</td>
    <td>${_pvMoney(_repFaSchedVal(c,'cost_additions','cost','additions'))}</td>
    <td>${_pvMoney(_repFaSchedVal(c,'cost_disposals','cost','disposals'))}</td>
    <td>${_pvMoney(_repFaSchedVal(c,'cost_closing','cost','closing'))}</td>
    <td>${_pvMoney(_repFaSchedVal(c,'accum_dep_opening','accum_dep','opening'))}</td>
    <td>${_pvMoney(_repFaSchedVal(c,'accum_dep_charge','accum_dep','charge'))}</td>
    <td>${_pvMoney(_repFaSchedVal(c,'accum_dep_disposals','accum_dep','disposals'))}</td>
    <td>${_pvMoney(_repFaSchedVal(c,'accum_dep_closing','accum_dep','closing'))}</td>
    <td>${_pvMoney(c.nbv_closing)}</td>
  </tr>`).join('');

  const t = data.totals || data;
  const totalsRow = `<tr class="fin-tfoot-total">
    <td><strong>TOTALS</strong></td>
    <td><strong>${_pvMoney(_repFaSchedVal(t,'total_cost_opening','cost','opening'))}</strong></td>
    <td><strong>${_pvMoney(_repFaSchedVal(t,'total_cost_additions','cost','additions'))}</strong></td>
    <td><strong>${_pvMoney(_repFaSchedVal(t,'total_cost_disposals','cost','disposals'))}</strong></td>
    <td><strong>${_pvMoney(_repFaSchedVal(t,'total_cost_closing','cost','closing'))}</strong></td>
    <td><strong>${_pvMoney(_repFaSchedVal(t,'total_accum_dep_opening','accum_dep','opening'))}</strong></td>
    <td><strong>${_pvMoney(_repFaSchedVal(t,'total_accum_dep_charge','accum_dep','charge'))}</strong></td>
    <td><strong>${_pvMoney(_repFaSchedVal(t,'total_accum_dep_disposals','accum_dep','disposals'))}</strong></td>
    <td><strong>${_pvMoney(_repFaSchedVal(t,'total_accum_dep_closing','accum_dep','closing'))}</strong></td>
    <td><strong>${_pvMoney(data.total_nbv_closing)}</strong></td>
  </tr>`;

  out.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>ASSET CLASS</th>
        <th>COST — OPENING</th><th>+ ADDITIONS</th><th>− DISPOSALS</th><th>= COST CLOSING</th>
        <th>ACCUM DEP — OPENING</th><th>+ CHARGE</th><th>− DISPOSALS</th><th>= ACCUM DEP CLOSING</th>
        <th>NBV CLOSING</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>${totalsRow}</tfoot>
    </table></div>
    ${_repFaScheduleGlReconciliationHtml(data.gl_reconciliation)}`;
}

// GL Reconciliation Summary — embedded on the FAS report (§10.5 of the
// 2026-08-17 addendum, confirmed live as FixedAssetGLReconciliationSummary
// on FixedAssetScheduleReport.gl_reconciliation). Collapsible, default open.
function _repFaScheduleGlReconciliationHtml(gl) {
  if (!gl) return '';
  const costDrift = parseFloat(gl.total_cost_drift) || 0;
  const accumDrift = parseFloat(gl.total_accumulated_drift) || 0;
  const pendingCap = parseFloat(gl.total_pending_capitalisation) || 0;
  const driftColor = (v) => v === 0 ? '#1e7e34' : 'var(--coral-600,#c0392b)';
  return `
    <details open style="margin-top:20px;">
      <summary style="cursor:pointer;font-weight:bold;color:#2c3e50;margin-bottom:8px;">GL Reconciliation Summary</summary>
      <div class="fin-form-wrap" style="max-width:520px;margin-top:8px;">
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span>Register vs GL</span>
          <span style="color:${gl.is_gl_balanced ? '#1e7e34' : 'var(--coral-600,#c0392b)'};font-weight:600;">${gl.is_gl_balanced ? 'Balanced ✓' : 'Out of balance'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span>Total Cost Drift</span><span style="color:${driftColor(costDrift)};">${_pvMoney(costDrift)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span>Total Accumulated Depreciation Drift</span><span style="color:${driftColor(accumDrift)};">${_pvMoney(accumDrift)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span>Pending Capitalisation</span><span>${_pvMoney(pendingCap)}</span>
        </div>
        ${gl.has_pending_drafts ? `<div style="margin-top:8px;padding:8px 12px;border-radius:6px;background:var(--gold-100);border-left:3px solid var(--gold-500);color:#7a6110;font-size:0.85rem;">There are pending draft assets awaiting confirmation — see Assets &rsaquo; Fixed Assets &rsaquo; Pending Confirmation.</div>` : ''}
        ${(gl.drift_categories||[]).length ? `<div style="margin-top:8px;font-size:0.85rem;color:#666;">Drift in: ${gl.drift_categories.map(c=>_finEsc(c)).join(', ')}</div>` : ''}
      </div>
    </details>`;
}

// ── Aged Student Debtors (Students Arrears Analysis / Customer Aging
// Analysis — same backend shape, see the REPORT_DEFS comment above). The
// response buckets PER-INVOICE rows into current/30_days/60_days/90_plus
// arrays; this aggregates them into one row per student (matching what
// both report titles promise) while keeping each bucket's invoice numbers
// visible underneath its amount so a variance can be traced to a specific
// unpaid invoice. Totals footer reads data.totals directly so it never
// drifts from the backend's own sums. Same digit-prefixed-key trap as
// Consolidated Student Debtors below — bucket keys are read with bracket
// access throughout, never dot access.
const _REP_AGING_BUCKETS = [['current','CURRENT'],['30_days','30 DAYS'],['60_days','60 DAYS'],['90_plus','90+ DAYS']];
function _repRenderAgedStudentDebtors(data) {
  const out = document.getElementById('rep-output');
  const buckets = _REP_AGING_BUCKETS.map(([k]) => k);
  const anyRows = buckets.some(k => (data[k] || []).length > 0);
  if (!data || !anyRows) { out.innerHTML = '<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">No unpaid student invoices for the selected criteria.</td></tr></tbody></table></div>'; return; }

  // student_id -> { current: [rows], 30_days: [rows], ... }
  const byStudent = {};
  buckets.forEach(bucket => {
    (data[bucket] || []).forEach(row => {
      const sid = row.student_id;
      if (!byStudent[sid]) byStudent[sid] = { current: [], '30_days': [], '60_days': [], '90_plus': [] };
      byStudent[sid][bucket].push(row);
    });
  });

  const bucketCell = (rows) => {
    const sum = rows.reduce((s, r) => s + (parseFloat(r.balance) || 0), 0);
    if (!rows.length) return `<td>${_pvMoney(0)}</td>`;
    const refs = rows.map(r => _finEsc(r.invoice_number)).join(', ');
    return `<td>${_pvMoney(sum)}<br><span style="font-size:0.75rem;color:#888;">${refs}</span></td>`;
  };

  const studentIds = Object.keys(byStudent).sort((a, b) => _rcvStudentName(a).localeCompare(_rcvStudentName(b)));
  const bodyRows = studentIds.map(sid => {
    const b = byStudent[sid];
    const total = buckets.reduce((s, k) => s + b[k].reduce((s2, r) => s2 + (parseFloat(r.balance) || 0), 0), 0);
    return `<tr>
      <td>${_finEsc(_rcvStudentName(sid))}</td>
      <td>#${_finEsc(String(sid))}</td>
      ${buckets.map(k => bucketCell(b[k])).join('')}
      <td><strong>${_pvMoney(total)}</strong></td>
    </tr>`;
  }).join('');

  const totals = data.totals || {};
  out.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>STUDENT NAME</th><th>STUDENT ID</th>${_REP_AGING_BUCKETS.map(([,l]) => `<th>${l}</th>`).join('')}<th>TOTAL</th></tr></thead>
      <tbody>${bodyRows}</tbody>
      <tfoot><tr class="fin-tfoot-total">
        <td colspan="2"><strong>TOTALS</strong></td>
        ${_REP_AGING_BUCKETS.map(([k]) => `<td><strong>${_pvMoney(totals[k])}</strong></td>`).join('')}
        <td><strong>${_pvMoney(totals.grand_total)}</strong></td>
      </tr></tfoot>
    </table></div>`;
}

// ── Aged Payables (2026-08-15 M3 refactor) — same bucketed-report shape as
// aged-student-debtors, keyed by supplier_id/invoice_id instead of
// student_id. `disputed[]`/`total_disputed` are new: still real liabilities,
// shown in their own section rather than folded into the aged buckets
// (AgingTotals.grand_total has no disputed component server-side).
function _repRenderAgedPayables(data) {
  const out = document.getElementById('rep-output');
  const buckets = _REP_AGING_BUCKETS.map(([k]) => k);
  const disputedRows = (data && data.disputed) || [];
  const anyRows = buckets.some(k => (data?.[k] || []).length > 0) || disputedRows.length > 0;
  if (!data || !anyRows) { out.innerHTML = '<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">No unpaid supplier invoices for the selected criteria.</td></tr></tbody></table></div>'; return; }

  // supplier_id -> { current: [rows], 30_days: [rows], ... }
  const bySupplier = {};
  buckets.forEach(bucket => {
    (data[bucket] || []).forEach(row => {
      const sid = row.supplier_id;
      if (!bySupplier[sid]) bySupplier[sid] = { current: [], '30_days': [], '60_days': [], '90_plus': [] };
      bySupplier[sid][bucket].push(row);
    });
  });

  const bucketCell = (rows) => {
    const sum = rows.reduce((s, r) => s + (parseFloat(r.balance) || 0), 0);
    if (!rows.length) return `<td>${_pvMoney(0)}</td>`;
    const refs = rows.map(r => _finEsc(r.invoice_number)).join(', ');
    return `<td>${_pvMoney(sum)}<br><span style="font-size:0.75rem;color:#888;">${refs}</span></td>`;
  };

  const supplierIds = Object.keys(bySupplier).sort((a, b) => _pvSupplierName(a).localeCompare(_pvSupplierName(b)));
  const bodyRows = supplierIds.map(sid => {
    const b = bySupplier[sid];
    const total = buckets.reduce((s, k) => s + b[k].reduce((s2, r) => s2 + (parseFloat(r.balance) || 0), 0), 0);
    return `<tr>
      <td>${_finEsc(_pvSupplierName(sid))}</td>
      ${buckets.map(k => bucketCell(b[k])).join('')}
      <td><strong>${_pvMoney(total)}</strong></td>
    </tr>`;
  }).join('');

  const totals = data.totals || {};
  const disputedSection = disputedRows.length ? (() => {
    const bySupplierDisputed = {};
    disputedRows.forEach(row => {
      const sid = row.supplier_id;
      (bySupplierDisputed[sid] = bySupplierDisputed[sid] || []).push(row);
    });
    const dRows = Object.keys(bySupplierDisputed).sort((a, b) => _pvSupplierName(a).localeCompare(_pvSupplierName(b))).map(sid => {
      const rows = bySupplierDisputed[sid];
      const sum = rows.reduce((s, r) => s + (parseFloat(r.balance) || 0), 0);
      const refs = rows.map(r => _finEsc(r.invoice_number)).join(', ');
      return `<tr><td>${_finEsc(_pvSupplierName(sid))}</td><td>${_pvMoney(sum)}<br><span style="font-size:0.75rem;color:#888;">${refs}</span></td></tr>`;
    }).join('');
    return `
      <div class="fin-section-label" style="margin-top:20px;color:var(--coral-600);">Disputed — contested, still a liability, excluded from the aging totals above</div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>SUPPLIER NAME</th><th>DISPUTED BALANCE</th></tr></thead>
        <tbody>${dRows}</tbody>
        <tfoot><tr class="fin-tfoot-total"><td><strong>TOTAL DISPUTED</strong></td><td><strong>${_pvMoney(data.total_disputed)}</strong></td></tr></tfoot>
      </table></div>`;
  })() : '';

  out.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>SUPPLIER NAME</th>${_REP_AGING_BUCKETS.map(([,l]) => `<th>${l}</th>`).join('')}<th>TOTAL</th></tr></thead>
      <tbody>${bodyRows}</tbody>
      <tfoot><tr class="fin-tfoot-total">
        <td><strong>TOTALS</strong></td>
        ${_REP_AGING_BUCKETS.map(([k]) => `<td><strong>${_pvMoney(totals[k])}</strong></td>`).join('')}
        <td><strong>${_pvMoney(totals.grand_total)}</strong></td>
      </tr></tfoot>
    </table></div>
    ${disputedSection}`;
}

// ── Consolidated Student Debtors (2026-07-21 addendum §8.1) ─────────────────
// The one wire-shape trap the addendum calls out by name: aging bucket keys
// start with a digit ("30_days", "90_plus"), so they must be read with
// bracket access — row.30_days is not valid JS and would silently be undefined.
function _repRenderConsolidatedDebtors(data) {
  const out = document.getElementById('rep-output');
  const rows = (data && data.rows) || [];
  if (!rows.length) { out.innerHTML = '<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">No debtors for the selected criteria.</td></tr></tbody></table></div>'; return; }
  const bodyRows = rows.map(r => { const c = r.contact || {}; return `<tr>
    <td>${_finEsc(r.student_display_id||'')}</td>
    <td>${_finEsc(r.student_name||'')}</td>
    <td>${_finEsc(r.class_name||'—')}</td>
    <td>${_finEsc(c.parent_name||'—')}<br><span style="font-size:0.78rem;color:#888;">${_finEsc(c.phone||'')}</span></td>
    <td>${_pvMoney(r.total_invoiced)}</td>
    <td>${_pvMoney(r.total_paid)}</td>
    <td>${_pvMoney(r.current_balance)}</td>
    <td>${_pvMoney(r.current)}</td>
    <td>${_pvMoney(r['30_days'])}</td>
    <td style="color:var(--gold-500,#C9A227);font-weight:600;">${_pvMoney(r['60_days'])}</td>
    <td style="color:var(--coral-600);font-weight:600;">${_pvMoney(r['90_plus'])}</td>
  </tr>`; }).join('');
  const totalsRow = `<tr class="fin-tfoot-total">
    <td colspan="4"><strong>TOTALS</strong></td>
    <td><strong>${_pvMoney(data.total_invoiced)}</strong></td>
    <td><strong>${_pvMoney(data.total_paid)}</strong></td>
    <td><strong>${_pvMoney(data.total_current_balance)}</strong></td>
    <td><strong>${_pvMoney(data.total_current)}</strong></td>
    <td><strong>${_pvMoney(data.total_30_days)}</strong></td>
    <td style="color:var(--gold-500,#C9A227);"><strong>${_pvMoney(data.total_60_days)}</strong></td>
    <td style="color:var(--coral-600);"><strong>${_pvMoney(data.total_90_plus)}</strong></td>
  </tr>`;
  out.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>STUDENT ID</th><th>NAME</th><th>CLASS</th><th>CONTACT</th>
        <th>INVOICED</th><th>PAID</th><th>BALANCE</th>
        <th>CURRENT</th><th>30 DAYS</th><th>60 DAYS</th><th>90+</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>${totalsRow}</tfoot>
    </table></div>`;
}

// ── Student Fee Analysis (2026-07-21 addendum §8.2) ──────────────────────────
// One row per invoice, payments[] inlined as indented sub-rows directly
// beneath it (server-ordered by payment_date — not resorted here).
function _repRenderStudentFeeAnalysis(data) {
  const out = document.getElementById('rep-output');
  const rows = (data && data.rows) || [];
  if (!rows.length) { out.innerHTML = '<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">No data for the selected criteria.</td></tr></tbody></table></div>'; return; }
  const bodyRows = rows.map(r => {
    const paymentsHtml = (r.payments || []).map(p => `
      <tr style="background:#fafafa;">
        <td colspan="2" style="padding-left:24px;color:#666;font-size:0.85rem;">&#8618; ${_finEsc(p.payment_date||'')} &middot; ${p.payment_method ? _finEsc(p.payment_method) : '—'} &middot; ${_finEsc(p.reference||'—')}</td>
        <td></td><td style="font-size:0.85rem;color:#666;">${_pvMoney(p.amount)}</td><td></td>
      </tr>`).join('');
    return `<tr>
        <td>${_finEsc(r.student_display_id||'')}<br><span style="font-size:0.8rem;color:#888;">${_finEsc(r.student_name||'')} &middot; ${_finEsc(r.class_name||'—')}</span></td>
        <td>${_finEsc(r.invoice_number||'')}<br><span style="font-size:0.8rem;color:#888;">${_finEsc(r.invoice_date||'')} &middot; ${r.term_name ? _finEsc(r.term_name) : '—'}</span></td>
        <td>${_pvMoney(r.amount_due)}</td>
        <td>${_pvMoney(r.total_paid)}</td>
        <td>${_pvMoney(r.balance)}</td>
      </tr>${paymentsHtml}`;
  }).join('');
  out.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>STUDENT</th><th>INVOICE</th><th>AMOUNT DUE</th><th>TOTAL PAID</th><th>BALANCE</th></tr></thead>
      <tbody>${bodyRows}</tbody>
      <tfoot><tr class="fin-tfoot-total">
        <td colspan="2"><strong>TOTALS</strong></td>
        <td><strong>${_pvMoney(data.total_invoiced)}</strong></td>
        <td><strong>${_pvMoney(data.total_paid)}</strong></td>
        <td><strong>${_pvMoney(data.total_balance)}</strong></td>
      </tr></tfoot>
    </table></div>`;
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
