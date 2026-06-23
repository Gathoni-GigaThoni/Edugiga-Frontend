// ==================== DASHBOARD ====================

// ---- Flyout group accordion persistence (sessionStorage) ----
function flyoutGroupOpenState(ulId) {
  return sessionStorage.getItem('flyout-group-' + ulId) === '1';
}
function flyoutGroupHeader(label, ulId) {
  const open = flyoutGroupOpenState(ulId);
  return `<span class="flyout-group-header${open ? ' flyout-group-open' : ''}" onclick="toggleDropdown('${ulId}')">${label}<span class="flyout-group-chevron">&#9656;</span></span>`;
}
function flyoutGroupUlStyle(ulId) {
  return `display:${flyoutGroupOpenState(ulId) ? 'block' : 'none'};`;
}

function showDashboard() {
  const isSuperAdmin = currentUser?.clearance_level === 1 || currentUser?.role === 'super_admin';
  document.body.innerHTML = `
    <div class="container">
      <div class="left-rail" id="left-rail">
        <button class="rail-item" data-module="student-management" title="Student Management" onclick="handleRailClick('student-management')">STU</button>
        <button class="rail-item" data-module="student-academics" title="Student Academics" onclick="handleRailClick('student-academics')">ACAD</button>
        <button class="rail-item" data-module="transport-management" title="Transport Management" onclick="handleRailClick('transport-management')">TRN</button>
        <button class="rail-item" data-module="finance" title="Finance" onclick="handleRailClick('finance')">FIN</button>
        <button class="rail-item" title="Inventory Management" onclick="loadView('inventory-management')">INV</button>
        <button class="rail-item" title="Procurement" onclick="loadView('procurement')">PRC</button>
        <button class="rail-item" data-module="human-resource" title="Human Resource" onclick="handleRailClick('human-resource')">HR</button>
        <button class="rail-item" data-module="payroll" title="Payroll" onclick="handleRailClick('payroll')">PAY</button>
        <button class="rail-item" title="Asset Management" onclick="loadView('asset-management')">AST</button>
        <button class="rail-item" title="Communication" onclick="loadView('communication')">COM</button>
        ${isSuperAdmin ? `<button class="rail-item" data-module="administration" title="Administration" onclick="handleRailClick('administration')">ADM</button>` : ''}
        <button class="rail-item" title="Logout" onclick="logout()">OUT</button>
      </div>

      <div class="flyout-panel" id="flyout-panel" hidden>
        <div class="flyout-header">
          <span class="flyout-title" id="flyout-title"></span>
          <button class="flyout-close" onclick="closeFlyout()">&times;</button>
        </div>
        <div class="flyout-nav sidebar" id="flyout-nav">

          <div class="flyout-module-body" id="flyout-body-student-management" data-label="Student Management" hidden>
            <ul id="student-management-dropdown" class="dropdown-menu">
              <li id="sidebar-stu-list"          onclick="loadView('students-list')">Students</li>
              <li id="sidebar-stu-reporting"     onclick="loadView('student-reporting')">Student Reporting</li>
              <li id="sidebar-stu-cohort"        onclick="loadView('cohort-term-planner')">Cohort Term Planner</li>
              <li id="sidebar-stu-classes"       onclick="loadView('student-classes')">Classes</li>
              <li id="sidebar-stu-close-records" onclick="loadView('close-records-per-class')">Close Records Per Class</li>
              <li id="sidebar-stu-eca-assignment" onclick="loadView('eca-assignment')">ECA Assignment</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Utilities', 'stu-utilities-dropdown')}
                <ul id="stu-utilities-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('stu-utilities-dropdown')}">
                  <li id="sidebar-stu-sources" class="sa-sub-sub" onclick="loadView('utilities-student-sources')">Student Sources</li>
                  <li id="sidebar-stu-streams" class="sa-sub-sub" onclick="loadView('utilities-streams')">Streams</li>
                  <li id="sidebar-stu-funding" class="sa-sub-sub" onclick="loadView('utilities-funding-sources')">Funding Sources</li>
                  <li id="sidebar-stu-sports-houses" class="sa-sub-sub" onclick="loadView('utilities-sports-houses')">Sports Houses</li>
                  <li id="sidebar-stu-stream-assign" class="sa-sub-sub" onclick="loadView('stream-assignment')">Stream Assignment</li>
                  <li id="sidebar-stu-ec-assign" class="sa-sub-sub" onclick="loadView('extra-curricular-assignment')">Extra Curricular Activity Assignment</li>
                </ul>
              </li>
              <li class="dropdown">
                ${flyoutGroupHeader('Reports', 'stu-reports-dropdown')}
                <ul id="stu-reports-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('stu-reports-dropdown')}">
                  <li id="sidebar-stu-report"     class="sa-sub-sub" onclick="loadView('reports-student')">Student Report</li>
                  <li id="sidebar-stu-gua-report" class="sa-sub-sub" onclick="loadView('reports-guardian')">Student Guardian Report</li>
                </ul>
              </li>
            </ul>
          </div>

          <div class="flyout-module-body" id="flyout-body-student-academics" data-label="Student Academics" hidden>
            <ul id="student-academics-dropdown" class="dropdown-menu">
              <li id="sidebar-att-register" onclick="loadView('attendance-register')">Attendance Register</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Attendance Reports', 'att-reports-dropdown')}
                <ul id="att-reports-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('att-reports-dropdown')}">
                  <li id="sidebar-att-reg-report" class="sa-sub-sub" onclick="loadView('attendance-register-report')">Attendance Register Report</li>
                </ul>
              </li>
              <li id="sidebar-formative-assessment" onclick="loadView('formative-assessment')">Formative Assessment</li>
              <li id="sidebar-sa-subjects"     onclick="loadView('sa-subjects')">Subjects</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Utilities', 'sa-utilities-dropdown')}
                <ul id="sa-utilities-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('sa-utilities-dropdown')}"></ul>
              </li>
              <li class="dropdown">
                ${flyoutGroupHeader('Set-up', 'sa-setup-dropdown')}
                <ul id="sa-setup-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('sa-setup-dropdown')}"></ul>
              </li>
              <li id="sidebar-sa-sessions"     onclick="loadView('sa-sessions')">Terms</li>
              <li id="sidebar-sa-session-types" onclick="loadView('sa-session-types')">Term Types</li>
              <li id="sidebar-sa-academic-years" onclick="loadView('sa-academic-years')">Academic Years</li>
              <li id="sidebar-sa-academic-levels" onclick="loadView('sa-academic-levels')">Academic Levels</li>
            </ul>
          </div>

          <div class="flyout-module-body" id="flyout-body-transport-management" data-label="Transport Management" hidden>
            <ul id="transport-dropdown" class="dropdown-menu">
              <li id="sidebar-trn-servicings"  onclick="loadView('transport-vehicle-servicings')">Vehicle Servicings</li>
              <li id="sidebar-trn-fueling"     onclick="loadView('transport-fueling-record')">Fueling Record</li>
              <li id="sidebar-trn-schedules"   onclick="loadView('transport-bus-schedules')">Bus Schedules</li>
              <li id="sidebar-trn-routes"      onclick="loadView('transport-routes')">Routes</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Reports', 'transport-reports-dropdown')}
                <ul id="transport-reports-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('transport-reports-dropdown')}">
                  <li id="sidebar-trn-bus-boarding"     class="sa-sub-sub" onclick="loadView('transport-reports-bus-boarding')">Bus Boarding Report</li>
                  <li id="sidebar-trn-student-per-route" class="sa-sub-sub" onclick="loadView('transport-reports-student-per-route')">Student Report per Route</li>
                </ul>
              </li>
              <li class="dropdown">
                ${flyoutGroupHeader('Utilities', 'transport-utilities-dropdown')}
                <ul id="transport-utilities-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('transport-utilities-dropdown')}">
                  <li id="sidebar-trn-service-items"   class="sa-sub-sub" onclick="loadView('transport-service-items')">Service Items</li>
                  <li id="sidebar-trn-maintenance"     class="sa-sub-sub" onclick="loadView('transport-maintenance-tasks')">Maintenance Tasks</li>
                  <li id="sidebar-trn-vehicles"        class="sa-sub-sub" onclick="loadView('transport-vehicles')">Vehicles</li>
                </ul>
              </li>
            </ul>
          </div>

          <div class="flyout-module-body" id="flyout-body-finance" data-label="Finance" hidden>
            <ul id="finance-dropdown" class="dropdown-menu">
              <li onclick="loadView('student-fees-status')">Student Fees Status</li>
              <li onclick="loadView('summarized-fee-statement')">Summarized Fee Statement</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Student Finance', 'fin-sf-dropdown')}
                <ul id="fin-sf-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('fin-sf-dropdown')}">
                  <li id="sidebar-fin-invoices"       class="sidebar-sub-sub" onclick="loadView('fin-student-invoices')">Student Invoices</li>
                  <li id="sidebar-fin-bulk"           class="sidebar-sub-sub" onclick="loadView('fin-student-bulk-invoicing')">Student Bulk Invoicing</li>
                  <li id="sidebar-fin-inv-adj"        class="sidebar-sub-sub" onclick="loadView('fin-invoice-adjustments')">Student Invoice Adjustments</li>
                  <li id="sidebar-fin-spon-alloc"     class="sidebar-sub-sub" onclick="loadView('fin-sponsorship-allocations')">Sponsorship Allocations</li>
                  <li id="sidebar-fin-spon-mgmt"      class="sidebar-sub-sub" onclick="loadView('fin-sponsorship-managements')">Sponsorship Managements</li>
                  <li id="sidebar-fin-fee-setup"      class="sidebar-sub-sub" onclick="loadView('fin-fee-setup-per-class')">Fee Set-up per Class</li>
                </ul>
              </li>
              <li onclick="loadView('cash-bank-management')">Cash and Bank Management</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Payables', 'fin-payables-dropdown')}
                <ul id="fin-payables-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('fin-payables-dropdown')}">
                  <li id="sidebar-fin-pv"  class="sidebar-sub-sub" onclick="loadView('payables-payment-vouchers')">Payment Vouchers</li>
                  <li id="sidebar-fin-tv"  class="sidebar-sub-sub" onclick="loadView('payables-tax-vouchers')">Tax Vouchers</li>
                  <li id="sidebar-fin-si"  class="sidebar-sub-sub" onclick="loadView('payables-supplier-invoices')">Supplier Invoices</li>
                  <li id="sidebar-fin-wht" class="sidebar-sub-sub" onclick="loadView('payables-wht-vat-certificates')">Supplier WHT VAT Certificate</li>
                  <li id="sidebar-fin-ec"  class="sidebar-sub-sub" onclick="loadView('payables-expense-claims')">Expense Claims</li>
                  <li id="sidebar-fin-ecd" class="sidebar-sub-sub" onclick="loadView('payables-expense-claim-disbursements')">Expense Claim Disbursements</li>
                  <li id="sidebar-fin-pca" class="sidebar-sub-sub" onclick="loadView('payables-petty-cash-applications')">Petty Cash Applications</li>
                  <li id="sidebar-fin-pcd" class="sidebar-sub-sub" onclick="loadView('payables-petty-cash-disbursements')">Petty Cash Disbursements</li>
                  <li id="sidebar-fin-iw"  class="sidebar-sub-sub" onclick="loadView('payables-imprest-warrants')">Imprest Warrant</li>
                  <li id="sidebar-fin-id"  class="sidebar-sub-sub" onclick="loadView('payables-imprest-disbursements')">Imprest Disbursements</li>
                  <li id="sidebar-fin-isr" class="sidebar-sub-sub" onclick="loadView('payables-imprest-surrenders')">Imprest Surrenders</li>
                </ul>
              </li>
              <li class="dropdown">
                ${flyoutGroupHeader('Receivables', 'fin-receivables-dropdown')}
                <ul id="fin-receivables-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('fin-receivables-dropdown')}">
                  <li id="sidebar-fin-rcv-pay"   class="sidebar-sub-sub" onclick="loadView('fin-receive-payments')">Receive Payments</li>
                  <li id="sidebar-fin-txns"       class="sidebar-sub-sub" onclick="loadView('fin-transactions')">Transactions</li>
                  <li id="sidebar-fin-deposit"    class="sidebar-sub-sub" onclick="loadView('fin-deposit-slip')">Deposit Slip</li>
                  <li id="sidebar-fin-credit"     class="sidebar-sub-sub" onclick="loadView('fin-credit-notes')">Credit Notes</li>
                </ul>
              </li>
              <li onclick="loadView('cancellations')">Cancellations</li>
              <li onclick="loadView('journal-entries')">Journal Entries</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Utilities', 'fin-utilities-dropdown')}
                <ul id="fin-utilities-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('fin-utilities-dropdown')}">
                  <li id="sidebar-fin-coa"        class="sidebar-sub-sub" onclick="loadView('fin-chart-of-accounts')">Chart of Accounts</li>
                  <li id="sidebar-fin-fee-accts"  class="sidebar-sub-sub" onclick="loadView('fin-fee-accounts')">Fee Accounts</li>
                  <li id="sidebar-fin-fee-items"  class="sidebar-sub-sub" onclick="loadView('fin-fee-items')">Fee Items</li>
                  <li id="sidebar-fin-groups"     class="sidebar-sub-sub" onclick="loadView('fin-groups')">Groups</li>
                  <li id="sidebar-fin-subgroups"  class="sidebar-sub-sub" onclick="loadView('fin-sub-groups')">Sub Groups</li>
                  <li id="sidebar-fin-fiscal"     class="sidebar-sub-sub" onclick="loadView('fin-fiscal-years')">Fiscal Years</li>
                  <li id="sidebar-fin-pay-modes"  class="sidebar-sub-sub" onclick="loadView('fin-payment-modes')">Payment Modes</li>
                </ul>
              </li>
              <li class="dropdown">
                ${flyoutGroupHeader('Set-up', 'fin-setup-dropdown')}
                <ul id="fin-setup-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('fin-setup-dropdown')}">
                  <li id="sidebar-fin-setup-main"     class="sidebar-sub-sub" onclick="loadView('finance-setup')">Main Settings</li>
                  <li id="sidebar-fin-discount-setup" class="sidebar-sub-sub" onclick="loadView('finance-discount-setup')">Discount Setup</li>
                </ul>
              </li>
              <li class="dropdown">
                ${flyoutGroupHeader('Reports', 'fin-reports-dropdown')}
                <ul id="fin-reports-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('fin-reports-dropdown')}">
                  <li class="sidebar-sub-sub" onclick="loadView('reports-general-ledger')">General Ledger</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-trial-balance')">Trial Balance</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-balance-sheet')">Balance Sheet</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-statement-of-financial-performance')">Statement of Financial Performance</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-statement-of-financial-position')">Statement of Financial Position</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-notes-of-financial-statement')">Notes of Financial Statement</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-cashflow-statement')">Cashflow Statement</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-daily-cash-return')">Daily Cash Return</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-cash-book')">Cash Book</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-petty-cash-report')">Petty Cash Report</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-supplier-statements')">Supplier Statements</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-tax-schedules')">Tax Schedules</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-fee-reminder')">Fee Reminder</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-fees-invoiced-per-gl-account')">Fees invoiced per GL Account</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-fees-paid-per-gl-account')">Fees Paid per GL Account</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-balances-report')">Balances Report</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-aged-student-debtors')">Aged Student Debtors</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-students-arrears-analysis')">Students Arrears Analysis</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-student-prepayment-analysis')">Student Prepayment Analysis</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-customer-aging-analysis')">Customer Aging Analysis</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-aged-payables')">Aged Payables</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-bank-reconciliation')">Bank Reconciliation Report</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-budget-vs-actual')">Statement of Budget vs Actual Comparison</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-statement-of-changes-in-net-assets')">Statement of Changes in Net Assets</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-journal-entry')">Journal Entry Report</li>
                </ul>
              </li>
            </ul>
          </div>

          <div class="flyout-module-body" id="flyout-body-human-resource" data-label="Human Resource" hidden>
            <ul id="hr-dropdown" class="dropdown-menu">
              <li id="sidebar-hr-employee-directory" onclick="loadView('hr-employee-directory')">Employee Directory</li>
              <li id="sidebar-hr-staff-attendance" onclick="loadView('hr-staff-attendance')">Staff Attendance</li>
              <li id="sidebar-hr-utilities" onclick="loadView('hr-utilities')">Utilities</li>
            </ul>
          </div>

          <div class="flyout-module-body" id="flyout-body-payroll" data-label="Payroll" hidden>
            <ul id="payroll-dropdown" class="dropdown-menu">
              <li id="sidebar-payroll-esp" onclick="loadView('payroll-esp')">Employee Service Profile</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Utilities', 'payroll-utilities-dropdown')}
                <ul id="payroll-utilities-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('payroll-utilities-dropdown')}">
                  <li id="sidebar-payroll-pay-accounts"        class="sidebar-sub-sub" onclick="loadView('payroll-pay-accounts')">Pay Accounts</li>
                  <li id="sidebar-payroll-pay-grades"          class="sidebar-sub-sub" onclick="loadView('payroll-pay-grades')">Pay Grades</li>
                  <li id="sidebar-payroll-salary-periods"      class="sidebar-sub-sub" onclick="loadView('payroll-salary-periods')">Salary Periods</li>
                  <li id="sidebar-payroll-salary-disbursement" class="sidebar-sub-sub" onclick="loadView('payroll-salary-disbursement')">Salary Disbursement Mode</li>
                  <li id="sidebar-payroll-fi"                  class="sidebar-sub-sub" onclick="loadView('payroll-fi')">Financial Institutions</li>
                  <li id="sidebar-payroll-employee-events"     class="sidebar-sub-sub" onclick="loadView('payroll-employee-events')">Employee Events</li>
                  <li id="sidebar-payroll-employee-status"     class="sidebar-sub-sub" onclick="loadView('payroll-employee-status')">Employee Status</li>
                </ul>
              </li>
            </ul>
          </div>

          ${isSuperAdmin ? `
          <div class="flyout-module-body" id="flyout-body-administration" data-label="Administration" hidden>
            <ul id="admin-dropdown" class="dropdown-menu">
              <li onclick="loadView('user-management')">User Management</li>
              <li onclick="loadView('admin-roles')">Roles</li>
              <li onclick="loadView('admin-setup')">Setup</li>
            </ul>
          </div>
          ` : ''}

        </div>
      </div>

      <main id="main-content">
        <h2>Welcome to EduGiga - Seven Oaks International School</h2>
        <p>Select a module from the sidebar.</p>
        <div style="margin-top:28px;background:#fff;border:1px solid #e3e8ee;border-radius:8px;padding:24px 28px;max-width:520px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          <div style="font-weight:600;font-size:1rem;margin-bottom:14px;color:#2c3e50;">Quick Student Search</div>
          <div style="display:flex;gap:10px;align-items:center;">
            <input id="dash-stu-search-input" type="text" placeholder="Search by name or admission no…"
              style="flex:1;padding:8px 12px;border:1px solid #ccc;border-radius:5px;font-size:0.9rem;"
              onkeydown="if(event.key==='Enter')doDashStudentSearch()">
            <button onclick="doDashStudentSearch()"
              style="padding:8px 18px;background:#1abc9c;color:#fff;border:none;border-radius:5px;font-size:0.9rem;cursor:pointer;white-space:nowrap;">Search</button>
          </div>
          <div id="dash-stu-search-results" style="margin-top:14px;"></div>
        </div>
      </main>
    </div>
  `;

  document.getElementById('main-content').addEventListener('click', () => {
    if (activeModule !== null) closeFlyout();
  });
}

// ==================== LEFT RAIL / FLYOUT PANEL ====================
let activeModule = null; // module key of the currently open flyout panel

function handleRailClick(moduleKey) {
  if (activeModule === moduleKey) {
    closeFlyout();
  } else {
    openFlyout(moduleKey);
  }
}

function openFlyout(moduleKey) {
  const body = document.getElementById('flyout-body-' + moduleKey);
  if (!body) return;
  activeModule = moduleKey;

  document.querySelectorAll('.rail-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.module === moduleKey);
  });
  document.querySelectorAll('.flyout-module-body').forEach(b => b.setAttribute('hidden', ''));
  body.removeAttribute('hidden');

  const titleEl = document.getElementById('flyout-title');
  if (titleEl) titleEl.textContent = body.dataset.label || '';

  document.getElementById('flyout-panel').removeAttribute('hidden');
  document.body.classList.add('flyout-open');
}

function closeFlyout() {
  activeModule = null;
  document.querySelectorAll('.rail-item').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('flyout-panel');
  if (panel) panel.setAttribute('hidden', '');
  document.body.classList.remove('flyout-open');
}

// ==================== DASHBOARD STUDENT SEARCH WIDGET ====================

async function doDashStudentSearch() {
  const q = (document.getElementById('dash-stu-search-input')?.value || '').trim().toLowerCase();
  const resultsEl = document.getElementById('dash-stu-search-results');
  if (!resultsEl) return;
  if (!q) { resultsEl.innerHTML = '<p style="color:#888;font-size:0.88rem;">Enter a name or admission number to search.</p>'; return; }

  resultsEl.innerHTML = '<p style="color:#888;font-size:0.88rem;">Searching&#8230;</p>';
  try {
    const res = await apiFetch(`${API_BASE}/students/`);
    if (!res || !res.ok) { resultsEl.innerHTML = '<p style="color:#c0392b;font-size:0.88rem;">Could not load students.</p>'; return; }
    const raw = await res.json();
    const students = Array.isArray(raw) ? raw : (raw.data || raw.results || []);
    const matched = students.filter(s =>
      (`${s.first_name||''} ${s.last_name||''}`).toLowerCase().includes(q) ||
      (s.student_id || '').toLowerCase().includes(q)
    );
    if (!matched.length) { resultsEl.innerHTML = '<p style="color:#888;font-size:0.88rem;">No students found.</p>'; return; }
    resultsEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
        <thead><tr style="background:#f4f6f8;">
          <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e3e8ee;">Adm. No.</th>
          <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e3e8ee;">Name</th>
          <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e3e8ee;">Class</th>
          <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e3e8ee;"></th>
        </tr></thead>
        <tbody>
          ${matched.slice(0, 10).map(s => `<tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">${s.student_id || '-'}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">${(s.first_name||'')} ${(s.last_name||'')}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">${s.class_name || '-'}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">
              <a href="#" style="color:#1abc9c;font-weight:500;" onclick="loadView('students-view');window._viewStudentId=${s.id};return false;">View</a>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${matched.length > 10 ? `<p style="color:#888;font-size:0.82rem;margin-top:6px;">${matched.length - 10} more result(s) — refine your search.</p>` : ''}
    `;
  } catch (_) {
    resultsEl.innerHTML = '<p style="color:#c0392b;font-size:0.88rem;">Search failed. Please try again.</p>';
  }
}

// ==================== VIEW LOADER ====================

// Views where the user actively fills a form and may spend several minutes.
// Keep-alive runs while any of these are active so the backend stays warm.
const FORM_VIEWS = new Set([
  // Student Management
  'students-add', 'students-edit', 'students-view',
  'cohort-term-planner-add', 'cohort-term-planner-edit',
  'close-records-per-class',
  'student-reporting-add', 'student-reporting-bulk',
  // Finance
  'fin-student-invoices', 'fin-student-invoices-add', 'fin-student-bulk-invoicing',
  'fin-invoice-adjustments', 'fin-sponsorship-allocations',
  'fin-fee-setup-per-class', 'fin-receive-payments',
  'fin-chart-of-accounts', 'fin-fee-accounts', 'fin-fee-items', 'finance-discount-setup',
  // Payables
  'payables-payment-vouchers-add', 'payables-payment-vouchers-edit',
  'payables-tax-vouchers-add', 'payables-supplier-invoices-add', 'payables-supplier-invoices-edit',
  'payables-expense-claims-add', 'payables-expense-claim-disbursements-add',
  'payables-petty-cash-applications-add', 'payables-petty-cash-disbursements-add',
  'payables-imprest-warrants-add', 'payables-imprest-disbursements-add', 'payables-imprest-surrenders-add',
  'journal-entries-add', 'journal-entries-edit',
  // HR / Payroll
  'hr-employee-directory', 'payroll-esp', 'payroll-fi',
  // Administration
  'user-management', 'admin-roles', 'admin-role-permissions',
  // Academic setup
  'sa-academic-years', 'sa-sessions', 'sa-session-types',
  // Utilities with add/edit forms
  'utilities-student-sources', 'utilities-streams', 'utilities-funding-sources', 'utilities-sports-houses',
  'student-classes',
  // Transport
  'transport-routes-add', 'transport-routes-edit',
]);

async function loadView(view) {
  const main = document.getElementById("main-content");
  clearSidebarActiveItems();

  // Stop any running keep-alive before evaluating the new view
  stopKeepAlive();
  // Restart it if the new view is form-oriented
  if (FORM_VIEWS.has(view)) startKeepAlive();
  switch(view) {
    // Student Management – main views
    case 'students-list':
      setActiveSidebarItem('sidebar-stu-list'); openStuMgmtDropdowns();
      await loadStudentsListView(main); break;
    case 'students-add':
      _currentEditStudentId = null; _stuEditActiveTab = 'personal';
      openStuMgmtDropdowns();
      await loadStudentFormView(main); break;
    case 'students-edit':
      openStuMgmtDropdowns();
      await loadStudentFormView(main); break;
    case 'students-view':
      openStuMgmtDropdowns();
      await loadStudentViewPage(main); break;
    case 'student-search':
      setActiveSidebarItem('sidebar-stu-search'); openStuMgmtDropdowns();
      await loadStudentSearchView(main); break;
    case 'student-reporting':
      setActiveSidebarItem('sidebar-stu-reporting'); openStuMgmtDropdowns();
      await loadStudentReportingView(main); break;
    case 'student-reporting-add':
      openStuMgmtDropdowns();
      await loadSingleReportingView(main); break;
    case 'student-reporting-bulk':
      openStuMgmtDropdowns();
      await loadBulkReportingView(main); break;
    // Placeholder sidebar items (not yet implemented)
    case 'student-id-cards':
      setActiveSidebarItem('sidebar-stu-id-cards'); openStuMgmtDropdowns();
      showPlaceholder(main, 'ID Cards'); break;
    case 'student-applicants':
      setActiveSidebarItem('sidebar-stu-applicants'); openStuMgmtDropdowns();
      showPlaceholder(main, 'Applicants'); break;
    case 'cohort-term-planner':
    case 'cohort-session-planner':
    case 'student-cohort-planner':
      setActiveSidebarItem('sidebar-stu-cohort'); openStuMgmtDropdowns();
      await loadCohortSessionPlannerView(main); break;
    case 'cohort-term-planner-add':
    case 'cohort-session-planner-add':
      openStuMgmtDropdowns();
      await loadCohortSessionPlannerFormView(main); break;
    case 'cohort-term-planner-edit':
    case 'cohort-session-planner-edit':
      openStuMgmtDropdowns();
      await loadCohortSessionPlannerFormView(main); break;
    case 'student-classes':
      await loadStudentClassesView(main); break;
    case 'close-records-per-class':
    case 'student-close-records':
      setActiveSidebarItem('sidebar-stu-close-records'); openStuMgmtDropdowns();
      await loadCloseRecordsView(main); break;
    case 'eca-assignment':
      setActiveSidebarItem('sidebar-stu-eca-assignment'); openStuMgmtDropdowns();
      await loadEcaAssignmentView(main); break;
    // Student Management – Utilities
    case 'utilities-student-sources':
      setActiveSidebarItem('sidebar-stu-sources'); openStuUtilitiesDropdown();
      await loadStudentSourcesView(main); break;
    case 'utilities-streams':
    case 'stu-streams':
      setActiveSidebarItem('sidebar-stu-streams'); openStuUtilitiesDropdown();
      await loadStreamsView(main); break;
    case 'utilities-funding-sources':
    case 'stu-funding-sources':
      setActiveSidebarItem('sidebar-stu-funding'); openStuUtilitiesDropdown();
      await loadFundingSourcesView(main); break;
    case 'utilities-sports-houses':
      setActiveSidebarItem('sidebar-stu-sports-houses'); openStuUtilitiesDropdown();
      await loadSportsHousesView(main); break;
    case 'stream-assignment':
      setActiveSidebarItem('sidebar-stu-stream-assign'); openStuUtilitiesDropdown();
      await loadStreamAssignmentView(main); break;
    case 'extra-curricular-assignment':
      setActiveSidebarItem('sidebar-stu-ec-assign'); openStuUtilitiesDropdown();
      await loadExtraCurricularAssignmentView(main); break;
    // Student Management – Reports
    case 'reports-student':
    case 'student-report':
      setActiveSidebarItem('sidebar-stu-report'); openStuReportsDropdown();
      await loadStudentReportView(main); break;
    case 'reports-guardian':
    case 'student-guardian-report':
      setActiveSidebarItem('sidebar-stu-gua-report'); openStuReportsDropdown();
      await loadStudentGuardianReportView(main); break;
    // Student Academics
    case 'attendance-register':
      setActiveSidebarItem('sidebar-att-register'); await loadAttendanceView(main); break;
    case 'attendance-register-report':
      setActiveSidebarItem('sidebar-att-reg-report'); await loadAttendanceRegisterReportView(main); break;
    case 'formative-assessment':
      setActiveSidebarItem('sidebar-formative-assessment');
      loadSaPlaceholderView(main, 'Formative Assessment'); break;
    case 'sa-subjects':
      setActiveSidebarItem('sidebar-sa-subjects');
      loadSaPlaceholderView(main, 'Subjects'); break;
    case 'sa-utilities':
      loadSaPlaceholderView(main, 'Utilities'); break;
    case 'sa-setup':
      loadSaPlaceholderView(main, 'Set-up'); break;
    case 'sa-sessions':
      setActiveSidebarItem('sidebar-sa-sessions'); await loadTermsView(main); break;
    case 'sa-session-types':
      setActiveSidebarItem('sidebar-sa-session-types'); loadTermTypesView(main); break;
    case 'sa-academic-years':
      setActiveSidebarItem('sidebar-sa-academic-years'); await loadAcademicYearsView(main); break;
    case 'sa-academic-levels':
      setActiveSidebarItem('sidebar-sa-academic-levels'); await loadAcademicLevelsView(main); break;
    // Transport Management
    case 'transport-management':
    case 'transport-vehicle-servicings':
      setActiveSidebarItem('sidebar-trn-servicings'); openTransportDropdown();
      loadTrnPlaceholderView(main, 'Vehicle Servicings'); break;
    case 'transport-fueling-record':
      setActiveSidebarItem('sidebar-trn-fueling'); openTransportDropdown();
      loadTrnPlaceholderView(main, 'Fueling Record'); break;
    case 'transport-bus-schedules':
      setActiveSidebarItem('sidebar-trn-schedules'); openTransportDropdown();
      loadTrnPlaceholderView(main, 'Bus Schedules'); break;
    case 'transport-routes':
      setActiveSidebarItem('sidebar-trn-routes'); openTransportDropdown();
      await loadTransportRoutesView(main); break;
    case 'transport-routes-add':
      openTransportDropdown();
      await loadTransportRouteFormView(main, null); break;
    case 'transport-routes-edit':
      openTransportDropdown();
      await loadTransportRouteFormView(main, window._currentEditRouteId); break;
    case 'transport-reports-bus-boarding':
      setActiveSidebarItem('sidebar-trn-bus-boarding'); openTransportReportsDropdown();
      await loadTrnBusBoardingReportView(main); break;
    case 'transport-reports-student-per-route':
      setActiveSidebarItem('sidebar-trn-student-per-route'); openTransportReportsDropdown();
      await loadTrnStudentPerRouteReportView(main); break;
    case 'transport-service-items':
      setActiveSidebarItem('sidebar-trn-service-items'); openTransportUtilitiesDropdown();
      loadTrnPlaceholderView(main, 'Service Items'); break;
    case 'transport-maintenance-tasks':
      setActiveSidebarItem('sidebar-trn-maintenance'); openTransportUtilitiesDropdown();
      loadTrnPlaceholderView(main, 'Maintenance Tasks'); break;
    case 'transport-vehicles':
      setActiveSidebarItem('sidebar-trn-vehicles'); openTransportUtilitiesDropdown();
      loadTrnPlaceholderView(main, 'Vehicles'); break;
    // Finance (NEW sub-modules)
    case 'student-fees-status': await loadStudentFeesStatusView(main); break;
    case 'summarized-fee-statement': await loadSummarizedFeeStatementView(main); break;
    case 'student-finance': showPlaceholder(main, 'Student Finance'); break;
    // Student Finance sub-modules
    case 'fin-student-invoices':
      setActiveSidebarItem('sidebar-fin-invoices'); openFinStudentFinanceDropdown();
      loadStudentInvoicesView(main); break;
    case 'fin-student-invoices-add':
      openFinStudentFinanceDropdown(); loadStudentInvoicesAddView(main); break;
    case 'fin-student-bulk-invoicing':
      setActiveSidebarItem('sidebar-fin-bulk'); openFinStudentFinanceDropdown();
      loadStudentBulkInvoicingView(main); break;
    case 'fin-invoice-adjustments':
      setActiveSidebarItem('sidebar-fin-inv-adj'); openFinStudentFinanceDropdown();
      loadInvoiceAdjustmentsView(main); break;
    case 'fin-sponsorship-allocations':
      setActiveSidebarItem('sidebar-fin-spon-alloc'); openFinStudentFinanceDropdown();
      loadSponsorshipAllocationsView(main); break;
    case 'fin-sponsorship-managements':
      setActiveSidebarItem('sidebar-fin-spon-mgmt'); openFinStudentFinanceDropdown();
      loadFinPlaceholderView(main, 'Sponsorship Managements'); break;
    case 'fin-fee-setup-per-class':
      setActiveSidebarItem('sidebar-fin-fee-setup'); openFinStudentFinanceDropdown();
      loadFeeSetupPerClassView(main); break;
    // Receivables sub-modules
    case 'fin-receive-payments':
      setActiveSidebarItem('sidebar-fin-rcv-pay'); openFinReceivablesDropdown();
      await loadReceivePaymentsView(main); break;
    case 'fin-transactions':
      setActiveSidebarItem('sidebar-fin-txns'); openFinReceivablesDropdown();
      loadFinPlaceholderView(main, 'Transactions'); break;
    case 'fin-deposit-slip':
      setActiveSidebarItem('sidebar-fin-deposit'); openFinReceivablesDropdown();
      loadFinPlaceholderView(main, 'Deposit Slip'); break;
    case 'fin-credit-notes':
      setActiveSidebarItem('sidebar-fin-credit'); openFinReceivablesDropdown();
      loadFinPlaceholderView(main, 'Credit Notes'); break;
    // Utilities sub-modules
    case 'fin-chart-of-accounts':
      setActiveSidebarItem('sidebar-fin-coa'); openFinUtilitiesDropdown();
      loadChartOfAccountsView(main); break;
    case 'fin-fee-accounts':
      setActiveSidebarItem('sidebar-fin-fee-accts'); openFinUtilitiesDropdown();
      loadFeeAccountsView(main); break;
    case 'fin-fee-items':
      setActiveSidebarItem('sidebar-fin-fee-items'); openFinUtilitiesDropdown();
      loadFeeItemsView(main); break;
    case 'fin-fee-types':
      openFinUtilitiesDropdown(); loadFeeTypesView(main); break;
    case 'fin-groups':
      setActiveSidebarItem('sidebar-fin-groups'); openFinUtilitiesDropdown();
      loadFinPlaceholderView(main, 'Groups'); break;
    case 'fin-sub-groups':
      setActiveSidebarItem('sidebar-fin-subgroups'); openFinUtilitiesDropdown();
      loadFinPlaceholderView(main, 'Sub Groups'); break;
    case 'fin-fiscal-years':
      setActiveSidebarItem('sidebar-fin-fiscal'); openFinUtilitiesDropdown();
      loadFinPlaceholderView(main, 'Fiscal Years'); break;
    case 'fin-payment-modes':
      setActiveSidebarItem('sidebar-fin-pay-modes'); openFinUtilitiesDropdown();
      loadFinPlaceholderView(main, 'Payment Modes'); break;
    case 'cash-bank-management': showPlaceholder(main, 'Cash and Bank Management'); break;
    // Payables sub-modules
    case 'payables-payment-vouchers':
      setActiveSidebarItem('sidebar-fin-pv'); openFinPayablesDropdown();
      await loadPayablesPaymentVouchersView(main); break;
    case 'payables-payment-vouchers-add':
      openFinPayablesDropdown(); await loadPayablesPaymentVouchersAddView(main); break;
    case 'payables-payment-vouchers-edit':
      openFinPayablesDropdown(); await loadPayablesPaymentVouchersEditView(main); break;
    case 'payables-tax-vouchers':
      setActiveSidebarItem('sidebar-fin-tv'); openFinPayablesDropdown();
      await loadPayablesTaxVouchersView(main); break;
    case 'payables-tax-vouchers-add':
      openFinPayablesDropdown(); await loadPayablesTaxVouchersAddView(main); break;
    case 'payables-tax-vouchers-upcoming':
      openFinPayablesDropdown(); await loadPayablesTaxVouchersUpcomingView(main); break;
    case 'payables-supplier-invoices':
      setActiveSidebarItem('sidebar-fin-si'); openFinPayablesDropdown();
      await loadPayablesSupplierInvoicesView(main); break;
    case 'payables-supplier-invoices-add':
      openFinPayablesDropdown(); await loadPayablesSupplierInvoicesAddView(main); break;
    case 'payables-supplier-invoices-edit':
      openFinPayablesDropdown(); await loadPayablesSupplierInvoicesEditView(main); break;
    case 'payables-supplier-invoices-missing-etims':
      openFinPayablesDropdown(); await loadPayablesSupplierInvoicesMissingEtimsView(main); break;
    case 'payables-wht-vat-certificates':
      setActiveSidebarItem('sidebar-fin-wht'); openFinPayablesDropdown();
      await loadPayablesWhtVatCertificatesView(main); break;
    case 'payables-expense-claims':
      setActiveSidebarItem('sidebar-fin-ec'); openFinPayablesDropdown();
      await loadPayablesExpenseClaimsView(main); break;
    case 'payables-expense-claims-add':
      openFinPayablesDropdown(); await loadPayablesExpenseClaimsAddView(main); break;
    case 'payables-expense-claim-disbursements':
      setActiveSidebarItem('sidebar-fin-ecd'); openFinPayablesDropdown();
      await loadPayablesExpenseClaimDisbursementsView(main); break;
    case 'payables-expense-claim-disbursements-add':
      openFinPayablesDropdown(); await loadPayablesExpenseClaimDisbursementsAddView(main); break;
    case 'payables-petty-cash-applications':
      setActiveSidebarItem('sidebar-fin-pca'); openFinPayablesDropdown();
      await loadPayablesPettyCashApplicationsView(main); break;
    case 'payables-petty-cash-applications-add':
      openFinPayablesDropdown(); await loadPayablesPettyCashApplicationsAddView(main); break;
    case 'payables-petty-cash-disbursements':
      setActiveSidebarItem('sidebar-fin-pcd'); openFinPayablesDropdown();
      await loadPayablesPettyCashDisbursementsView(main); break;
    case 'payables-petty-cash-disbursements-add':
      openFinPayablesDropdown(); await loadPayablesPettyCashDisbursementsAddView(main); break;
    case 'payables-imprest-warrants':
      setActiveSidebarItem('sidebar-fin-iw'); openFinPayablesDropdown();
      await loadPayablesImprestWarrantsView(main); break;
    case 'payables-imprest-warrants-add':
      openFinPayablesDropdown(); await loadPayablesImprestWarrantsAddView(main); break;
    case 'payables-imprest-warrants-overdue':
      openFinPayablesDropdown(); await loadPayablesImprestWarrantsOverdueView(main); break;
    case 'payables-imprest-disbursements':
      setActiveSidebarItem('sidebar-fin-id'); openFinPayablesDropdown();
      await loadPayablesImprestDisbursementsView(main); break;
    case 'payables-imprest-disbursements-add':
      openFinPayablesDropdown(); await loadPayablesImprestDisbursementsAddView(main); break;
    case 'payables-imprest-surrenders':
      setActiveSidebarItem('sidebar-fin-isr'); openFinPayablesDropdown();
      await loadPayablesImprestSurrendersView(main); break;
    case 'payables-imprest-surrenders-add':
      openFinPayablesDropdown(); await loadPayablesImprestSurrendersAddView(main); break;
    case 'receivables': showPlaceholder(main, 'Receivables'); break;
    case 'cancellations': showPlaceholder(main, 'Cancellations'); break;
    // Journal Entries
    case 'journal-entries':
      await loadJournalEntriesView(main); break;
    case 'journal-entries-add':
      await loadJournalEntryAddView(main); break;
    case 'journal-entries-edit':
      await loadJournalEntryEditView(main); break;
    case 'utilities': showPlaceholder(main, 'Utilities'); break;
    case 'finance-setup':
      setActiveSidebarItem('sidebar-fin-setup-main'); openFinSetupDropdown();
      loadFinPlaceholderView(main, 'Set-up'); break;
    case 'finance-discount-setup':
      setActiveSidebarItem('sidebar-fin-discount-setup'); openFinSetupDropdown();
      await renderFinanceDiscountSetup(main); break;
    // Finance Reports
    case 'reports-general-ledger':
    case 'reports-trial-balance':
    case 'reports-balance-sheet':
    case 'reports-statement-of-financial-performance':
    case 'reports-statement-of-financial-position':
    case 'reports-notes-of-financial-statement':
    case 'reports-cashflow-statement':
    case 'reports-daily-cash-return':
    case 'reports-cash-book':
    case 'reports-petty-cash-report':
    case 'reports-supplier-statements':
    case 'reports-tax-schedules':
    case 'reports-fee-reminder':
    case 'reports-fees-invoiced-per-gl-account':
    case 'reports-fees-paid-per-gl-account':
    case 'reports-balances-report':
    case 'reports-aged-student-debtors':
    case 'reports-students-arrears-analysis':
    case 'reports-student-prepayment-analysis':
    case 'reports-customer-aging-analysis':
    case 'reports-aged-payables':
    case 'reports-bank-reconciliation':
    case 'reports-budget-vs-actual':
    case 'reports-statement-of-changes-in-net-assets':
    case 'reports-journal-entry':
      openFinReportsDropdown();
      await loadFinanceReportView(main, view); break;
    // Reports (hidden from sidebar but kept)
    case 'reports': await loadReportsView(main); break;
    // Payroll
    case 'payroll-esp': loadPayrollEspListingView(main); break;
    case 'payroll-fi':  loadPayrollFiListingView(main); break;
    case 'payroll-pay-accounts':
      setActiveSidebarItem('sidebar-payroll-pay-accounts'); openPayrollDropdowns();
      showPlaceholder(main, 'Pay Accounts'); break;
    case 'payroll-pay-grades':
      setActiveSidebarItem('sidebar-payroll-pay-grades'); openPayrollDropdowns();
      showPlaceholder(main, 'Pay Grades'); break;
    case 'payroll-salary-periods':
      setActiveSidebarItem('sidebar-payroll-salary-periods'); openPayrollDropdowns();
      showPlaceholder(main, 'Salary Periods'); break;
    case 'payroll-salary-disbursement':
      setActiveSidebarItem('sidebar-payroll-salary-disbursement'); openPayrollDropdowns();
      showPlaceholder(main, 'Salary Disbursement Mode'); break;
    case 'payroll-employee-events':
      setActiveSidebarItem('sidebar-payroll-employee-events'); openPayrollDropdowns();
      showPlaceholder(main, 'Employee Events'); break;
    case 'payroll-employee-status':
      setActiveSidebarItem('sidebar-payroll-employee-status'); openPayrollDropdowns();
      showPlaceholder(main, 'Employee Status'); break;
    // Human Resource
    case 'hr-employee-directory': loadHrEmployeeDirectoryView(main); break;
    case 'hr-staff-attendance': showPlaceholder(main, 'Staff Attendance'); break;
    case 'hr-utilities': showPlaceholder(main, 'Utilities'); break;
    // Administration
    case 'administration': await loadAdministrationView(main); break;
    case 'user-management': await loadUserManagementView(main); break;
    case 'admin-roles': loadRolesListingView(main); break;
    case 'admin-role-permissions': renderAdminRolePermissions(main); break;
    case 'admin-setup': showPlaceholder(main, 'Setup'); break;
    // Empty modules
    case 'inventory-management':
    case 'procurement':
    case 'asset-management':
    case 'communication':
      main.innerHTML = `<h2>${view.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h2><p>This module is under construction.</p>`;
      break;
    default: main.innerHTML = "<p>Module not found.</p>";
  }
  closeAllSidebarDropdowns();
  closeFlyout();
}

function showPlaceholder(container, title) {
  container.innerHTML = `<h2>${title}</h2><p>This module is under construction.</p>`;
}

function loadSaPlaceholderView(container, title) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">${title}</h2>
        <div class="sa-breadcrumb">Dashboard &rsaquo; Student Academics &rsaquo; ${title}</div>
      </div>
      <div style="background:white;border-radius:6px;padding:48px 24px;text-align:center;
                  color:#888;border:1px solid #eee;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
        <p style="font-size:1rem;font-weight:600;margin:0;">Coming Soon</p>
        <p style="font-size:0.88rem;margin-top:8px;">This module is currently under development.</p>
      </div>
    </div>
  `;
}

function toggleDropdown(id) {
  const menu = document.getElementById(id);
  if (!menu) return;
  const nowOpen = menu.style.display !== 'block';
  menu.style.display = nowOpen ? 'block' : 'none';
  sessionStorage.setItem('flyout-group-' + id, nowOpen ? '1' : '0');
  const header = menu.previousElementSibling;
  if (header && header.classList) header.classList.toggle('flyout-group-open', nowOpen);
}


// ---- Sidebar active-item helpers ----
function clearSidebarActiveItems() {
  document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('sidebar-active'));
}

// Submenus are flyout panels now (see core.css), not an in-place accordion — leaving
// them open after navigating into a page would leave a floating panel hanging over
// the sidebar indefinitely. loadView() closes them all once the view has rendered;
// the highlighted sidebar-active item (set separately) still shows current location.
function closeAllSidebarDropdowns() {
  document.querySelectorAll('.sidebar .dropdown-menu').forEach(menu => { menu.style.display = 'none'; });
}

function setActiveSidebarItem(itemId) {
  clearSidebarActiveItems();
  const el = document.getElementById(itemId);
  if (el) el.classList.add('sidebar-active');
}

function openTransportDropdown() {
  const d = document.getElementById('transport-dropdown');
  if (d) d.style.display = 'block';
}
function openTransportReportsDropdown() {
  openTransportDropdown();
  const d = document.getElementById('transport-reports-dropdown');
  if (d) d.style.display = 'block';
}
function openTransportUtilitiesDropdown() {
  openTransportDropdown();
  const d = document.getElementById('transport-utilities-dropdown');
  if (d) d.style.display = 'block';
}

// ---- Utilities ----
function closeModal(modalId) { document.getElementById(modalId).style.display = "none"; }