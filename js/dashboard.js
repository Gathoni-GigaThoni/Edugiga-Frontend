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

// Rail data-module -> real registry key (dot-notation, GET
// /api/administration/modules). Confirmed live 2026-07-12 against the same
// module registry (cross-checked via GET /roles/permissions/matrix, which
// shares identical keys — e.g. matrix "document_approval" / label "Document
// Approval System" matches this registry's key exactly, resolving the old
// label-matching hack's one confirmed mismatch). Since the registry gives
// real keys directly, no more label-guessing is needed at all.
const RAIL_MODULE_KEYS = {
  'student-management':   'student_management',
  'student-academics':    'student_academics',
  'transport-management': 'transport_management',
  'finance':              'finance',
  'document-approvals':   'document_approval',
  'inventory-management': 'inventory_management',
  'procurement':          'procurement',
  'human-resource':       'human_resource',
  'payroll':              'payroll',
  'asset-management':     'asset_management',
  'communication':        'communication',
  'administration':       'administration',
};

function _computeRailAccess() {
  const entries = Object.keys(RAIL_MODULE_KEYS).map(railKey =>
    [railKey, hasModuleAccess(RAIL_MODULE_KEYS[railKey])]);
  return Object.fromEntries(entries);
}

function showDashboard() {
  const isSuperAdmin = currentUser?.clearance_level === 1 || currentUser?.role === 'super_admin';
  const access = _computeRailAccess();
  document.body.innerHTML = `
    <div class="container">
      <div class="left-rail" id="left-rail">
        <div class="rail-logo-container">
          <div class="rail-logo-horizontal-wrap">
            <img src="assets/images/sois-logo-horizontal.jpeg" alt="Seven Oaks International School" class="rail-logo-horizontal"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="rail-logo-fallback" style="display:none">
              <span class="rail-logo-initials">S</span>
            </div>
          </div>
          <div class="rail-logo-crest-wrap">
            <img src="assets/images/sois-logo-full.jpeg" alt="SOIS" class="rail-logo-crest-only"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="rail-logo-fallback" style="display:none">
              <span class="rail-logo-initials">S</span>
            </div>
          </div>
        </div>
        <button class="rail-item active" data-module="dashboard-home" title="Dashboard" onclick="goToDashboardHome()"><span class="rail-label-full">Dashboard</span><span class="rail-label-short">HOME</span></button>
        ${access['student-management'] ? `<button class="rail-item" data-module="student-management" title="Student Management" onclick="handleRailClick('student-management')"><span class="rail-label-full">Student Management</span><span class="rail-label-short">STU</span></button>` : ''}
        ${access['student-academics'] ? `<button class="rail-item" data-module="student-academics" title="Student Academics" onclick="handleRailClick('student-academics')"><span class="rail-label-full">Student Academics</span><span class="rail-label-short">ACA</span></button>` : ''}
        ${access['transport-management'] ? `<button class="rail-item" data-module="transport-management" title="Transport Management" onclick="handleRailClick('transport-management')"><span class="rail-label-full">Transport</span><span class="rail-label-short">TRN</span></button>` : ''}
        ${access['finance'] ? `<button class="rail-item" data-module="finance" title="Finance" onclick="handleRailClick('finance')"><span class="rail-label-full">Finance</span><span class="rail-label-short">FIN</span></button>` : ''}
        ${access['document-approvals'] ? `<button class="rail-item" data-module="document-approvals" title="Document Approvals" onclick="handleRailClick('document-approvals')"><span class="rail-label-full">Document Approvals</span><span class="rail-label-short">DAS</span></button>` : ''}
        ${access['inventory-management'] ? `<button class="rail-item" title="Inventory Management" onclick="loadView('inventory-management')"><span class="rail-label-full">Inventory</span><span class="rail-label-short">INV</span></button>` : ''}
        ${access['procurement'] ? `<button class="rail-item" data-module="procurement" title="Procurement" onclick="handleRailClick('procurement')"><span class="rail-label-full">Procurement</span><span class="rail-label-short">PRC</span></button>` : ''}
        ${access['human-resource'] ? `<button class="rail-item" data-module="human-resource" title="Human Resource" onclick="handleRailClick('human-resource')"><span class="rail-label-full">Human Resource</span><span class="rail-label-short">HR</span></button>` : ''}
        ${access['payroll'] ? `<button class="rail-item" data-module="payroll" title="Payroll" onclick="handleRailClick('payroll')"><span class="rail-label-full">Payroll</span><span class="rail-label-short">PAY</span></button>` : ''}
        ${access['asset-management'] ? `<button class="rail-item" title="Asset Management" onclick="loadView('asset-management')"><span class="rail-label-full">Assets</span><span class="rail-label-short">AST</span></button>` : ''}
        ${access['communication'] ? `<button class="rail-item" title="Communication" onclick="loadView('communication')"><span class="rail-label-full">Communication</span><span class="rail-label-short">COM</span></button>` : ''}
        ${(isSuperAdmin || access['administration']) ? `<button class="rail-item" data-module="administration" title="Administration" onclick="handleRailClick('administration')"><span class="rail-label-full">Administration</span><span class="rail-label-short">ADM</span></button>` : ''}
        <button class="rail-item" title="Logout" onclick="logout()"><span class="rail-label-full">Log Out</span><span class="rail-label-short">OUT</span></button>
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
              <li id="sidebar-stu-cohort"        onclick="loadView('cohort-term-planner')">Cohort Term Planner</li>
              <li id="sidebar-stu-classes"       onclick="loadView('student-classes')">Classes</li>
              <li id="sidebar-stu-close-records" onclick="loadView('close-records-per-class')">Close Records Per Class</li>
              <li id="sidebar-stu-parent-portal" onclick="loadView('student-parent-portal')">Parent Portal Access</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Utilities', 'stu-utilities-dropdown')}
                <ul id="stu-utilities-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('stu-utilities-dropdown')}">
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
                  <li id="sidebar-fin-fee-schedules"  class="sidebar-sub-sub" onclick="loadView('fin-fee-schedules')">Fee Schedules</li>
                  <li id="sidebar-fin-fee-setup-class" class="sidebar-sub-sub" onclick="loadView('fin-fee-setup-class')">Fee Setup by Class</li>
                  <li id="sidebar-fin-fee-assign"     class="sidebar-sub-sub" onclick="loadView('fin-fee-assignments')">Fee Assignments</li>
                  <li id="sidebar-fin-fee-invoices"   class="sidebar-sub-sub" onclick="loadView('fin-fee-invoices')">Fee Invoices</li>
                  <li id="sidebar-fin-bulk"           class="sidebar-sub-sub" onclick="loadView('fin-invoices-bulk')">Bulk Invoice Generate</li>
                  <li id="sidebar-fin-invoices"       class="sidebar-sub-sub" onclick="loadView('fin-student-invoices')">Student Invoices (Legacy)</li>
                  <li id="sidebar-fin-inv-adj"        class="sidebar-sub-sub" onclick="loadView('fin-invoice-adjustments')">Student Invoice Adjustments</li>
                  <li id="sidebar-fin-spon-alloc"     class="sidebar-sub-sub" onclick="loadView('fin-sponsorship-allocations')">Sponsorship Allocations</li>
                  <li id="sidebar-fin-spon-mgmt"      class="sidebar-sub-sub" onclick="loadView('fin-sponsorship-managements')">Sponsorship Managements</li>
                  <li id="sidebar-fin-fee-setup"      class="sidebar-sub-sub" onclick="loadView('fin-fee-setup-per-class')">Class Fee Setup (Legacy)</li>
                </ul>
              </li>
              <li onclick="loadView('cash-bank-management')">Cash and Bank Management</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Tendepay', 'fin-tendepay-dropdown')}
                <ul id="fin-tendepay-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('fin-tendepay-dropdown')}">
                  <li id="sidebar-fin-tp-import"   class="sidebar-sub-sub" onclick="loadView('tendepay-import')">Import Statement</li>
                  <li id="sidebar-fin-tp-history"  class="sidebar-sub-sub" onclick="loadView('tendepay-import-history')">Import History</li>
                  <li id="sidebar-fin-tp-suspense" class="sidebar-sub-sub" onclick="loadView('tendepay-suspense')">Suspense</li>
                  <li id="sidebar-fin-tp-funds"    class="sidebar-sub-sub" onclick="loadView('tendepay-fund-loads')">Fund Loads</li>
                  <li id="sidebar-fin-tp-recon"    class="sidebar-sub-sub" onclick="loadView('tendepay-reconciliation')">Reconciliation</li>
                </ul>
              </li>
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
                  <li id="sidebar-fin-fee-items"    class="sidebar-sub-sub" onclick="loadView('fin-fee-items')">Fee Items</li>
                  <li id="sidebar-fin-gen-items"    class="sidebar-sub-sub" onclick="loadView('fin-general-items')">General Items</li>
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
                  <li id="sidebar-fin-sibling-groups"  class="sidebar-sub-sub" onclick="loadView('finance-sibling-groups')">Sibling Groups</li>
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
                  <li class="sidebar-sub-sub" onclick="loadView('reports-ap-reconciliation')">AP Reconciliation</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-bank-reconciliation')">Bank Reconciliation Report</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-budget-vs-actual')">Statement of Budget vs Actual Comparison</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-statement-of-changes-in-net-assets')">Statement of Changes in Net Assets</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-journal-entry')">Journal Entry Report</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-tendepay-wallet-balances')">Tendepay Wallet Balances</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-tendepay-transaction-history')">Tendepay Transaction History</li>
                  <li class="sidebar-sub-sub" onclick="loadView('reports-unmatched-tendepay-transactions')">Unmatched Tendepay Transactions</li>
                </ul>
              </li>
            </ul>
          </div>

          <div class="flyout-module-body" id="flyout-body-document-approvals" data-label="Document Approvals" hidden>
            <ul id="document-approvals-dropdown" class="dropdown-menu">
              <li id="sidebar-da-queue" onclick="loadView('document-approvals-queue')">Approval Queue</li>
              <li id="sidebar-da-all" onclick="loadView('document-approvals-all')">All Approvals</li>
              <li id="sidebar-da-surcharge" onclick="loadView('document-approvals-surcharge-policy')">Surcharge Policy</li>
            </ul>
          </div>

          <div class="flyout-module-body" id="flyout-body-human-resource" data-label="Human Resource" hidden>
            <ul id="hr-dropdown" class="dropdown-menu">
              <li id="sidebar-hr-employee-directory" onclick="loadView('hr-employee-directory')">Employee Directory</li>
              <li id="sidebar-hr-staff-attendance" onclick="loadView('hr-staff-attendance')">Staff Attendance</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Utilities', 'hr-utilities-dropdown')}
                <ul id="hr-utilities-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('hr-utilities-dropdown')}">
                  <li id="sidebar-hr-pay-grades" class="sidebar-sub-sub" onclick="loadView('hr-utilities-pay-grades')">Pay Grades</li>
                </ul>
              </li>
            </ul>
          </div>

          <div class="flyout-module-body" id="flyout-body-payroll" data-label="Payroll" hidden>
            <ul id="payroll-dropdown" class="dropdown-menu">
              <li id="sidebar-payroll-esp" onclick="loadView('payroll-esp')">Employee Service Profile</li>
              <li id="sidebar-payroll-runs" onclick="loadView('payroll-runs')">Payroll Runs</li>
              <li id="sidebar-payroll-payslips" onclick="loadView('payroll-payslips')">Payslips</li>
              <li class="dropdown">
                ${flyoutGroupHeader('Utilities', 'payroll-utilities-dropdown')}
                <ul id="payroll-utilities-dropdown" class="dropdown-menu" style="${flyoutGroupUlStyle('payroll-utilities-dropdown')}">
                  <li id="sidebar-payroll-pay-accounts"        class="sidebar-sub-sub" onclick="loadView('payroll-pay-accounts')">Pay Accounts</li>
                  <li id="sidebar-payroll-salary-periods"      class="sidebar-sub-sub" onclick="loadView('payroll-salary-periods')">Salary Periods</li>
                  <li id="sidebar-payroll-salary-disbursement" class="sidebar-sub-sub" onclick="loadView('payroll-salary-disbursement')">Salary Disbursement Mode</li>
                  <li id="sidebar-payroll-fi"                  class="sidebar-sub-sub" onclick="loadView('payroll-fi')">Financial Institutions</li>
                  <li id="sidebar-payroll-employee-events"     class="sidebar-sub-sub" onclick="loadView('payroll-employee-events')">Employee Events</li>
                  <li id="sidebar-payroll-employee-status"     class="sidebar-sub-sub" onclick="loadView('payroll-employee-status')">Employee Status</li>
                </ul>
              </li>
            </ul>
          </div>

          <div class="flyout-module-body" id="flyout-body-procurement" data-label="Procurement" hidden>
            <ul id="procurement-dropdown" class="dropdown-menu">
              <li id="sidebar-prc-suppliers" onclick="loadView('procurement-suppliers')">Suppliers</li>
            </ul>
          </div>

          ${isSuperAdmin ? `
          <div class="flyout-module-body" id="flyout-body-administration" data-label="Administration" hidden>
            <ul id="admin-dropdown" class="dropdown-menu">
              <li onclick="loadView('user-management')">User Management</li>
              <li onclick="loadView('admin-roles')">Roles</li>
              <li onclick="loadView('admin-departments')">Departments</li>
              <li onclick="loadView('admin-setup')">Setup</li>
            </ul>
          </div>
          ` : ''}

        </div>
      </div>

      <main id="main-content"></main>
    </div>
  `;
  renderDashboardHome(document.getElementById('main-content'));

  document.getElementById('main-content').addEventListener('click', () => {
    if (activeModule !== null) closeFlyout();
  });
}

// Home view content — shown on initial login and whenever the user clicks the
// "Dashboard" rail item (see goToDashboardHome / loadView case 'dashboard'),
// so it needs to be re-renderable into any already-mounted #main-content, not
// just built once into the page shell.
function _dashEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Cache of the full student roster for this dashboard visit — populated once
// by _dashLoadStudentsAndStats() and reused by doDashStudentSearch() so the
// stats tiles and the search widget don't each fetch the whole roster.
let _dashStudentsCache = null;

function renderDashboardHome(container) {
  if (!container) return;
  _dashStudentsCache = null; // re-fetch fresh counts every time the dashboard home is (re)shown
  const name  = (typeof _cspGetCurrentUserName === 'function' ? _cspGetCurrentUserName() : '') || '';
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  container.innerHTML = `
    <div id="dash-home-root">
      <div class="dash-hero">
        <div class="dash-hero-inner">
          <p class="dash-hero-eyebrow">Dashboard</p>
          <h2 class="dash-hero-title">Welcome back${name ? ', ' + _dashEsc(name) : ''}</h2>
          <p class="dash-hero-subtitle">Seven Oaks International School &middot; ${today}</p>
        </div>
      </div>

      <div class="dash-body">
        <div class="dash-stats-grid">
          <div class="dash-stat-tile">
            <div class="dash-stat-label">Total Enrolled</div>
            <div class="dash-stat-value" id="dash-stat-total">&hellip;</div>
          </div>
          <div class="dash-stat-tile">
            <div class="dash-stat-label">Boys &amp; Girls Enrolled</div>
            <div class="dash-split-bar">
              <div class="dash-split-seg dash-split-seg--a" id="dash-split-a" style="width:50%"></div>
              <div class="dash-split-seg dash-split-seg--b" id="dash-split-b" style="width:50%"></div>
            </div>
            <div class="dash-split-legend">
              <span class="dash-split-legend-item"><span class="dash-split-swatch dash-split-swatch--a"></span>Boys <span class="dash-split-legend-count" id="dash-split-boys-count">&hellip;</span></span>
              <span class="dash-split-legend-item"><span class="dash-split-swatch dash-split-swatch--b"></span>Girls <span class="dash-split-legend-count" id="dash-split-girls-count">&hellip;</span></span>
            </div>
          </div>
          <div class="dash-stat-placeholder"><div class="dash-stat-placeholder-icon">+</div>More stats coming soon</div>
          <div class="dash-stat-placeholder"><div class="dash-stat-placeholder-icon">+</div>More stats coming soon</div>
        </div>

        <div class="dash-search-card">
          <div class="dash-search-card-head"><span class="dash-search-card-title">Quick Student Search</span></div>
          <div class="dash-search-card-body">
            <div class="dash-search-input-row">
              <input id="dash-stu-search-input" type="text" class="dash-search-input" placeholder="Search by name or admission no…"
                onkeydown="if(event.key==='Enter')doDashStudentSearch()">
              <button class="dash-search-btn" onclick="doDashStudentSearch()">Search</button>
            </div>
            <div id="dash-stu-search-results" class="dash-search-results"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  _dashLoadStudentsAndStats();
}

async function _dashLoadStudentsAndStats() {
  const totalEl = document.getElementById('dash-stat-total');
  try {
    const res = await apiFetch(`${API_BASE}/students/`);
    if (!res || !res.ok) throw new Error('failed to load students');
    const raw = await res.json();
    const students = Array.isArray(raw) ? raw : (raw.data || raw.results || []);
    _dashStudentsCache = students;

    if (totalEl) totalEl.textContent = students.length.toLocaleString();

    const boys  = students.filter(s => (s.gender || '').trim().toLowerCase().startsWith('m')).length;
    const girls = students.filter(s => (s.gender || '').trim().toLowerCase().startsWith('f')).length;
    const known = boys + girls;
    const boysPct  = known ? Math.round((boys / known) * 100) : 0;
    const girlsPct = known ? 100 - boysPct : 0;

    const segA = document.getElementById('dash-split-a');
    const segB = document.getElementById('dash-split-b');
    if (segA) segA.style.width = boysPct + '%';
    if (segB) segB.style.width = girlsPct + '%';
    const boysCountEl  = document.getElementById('dash-split-boys-count');
    const girlsCountEl = document.getElementById('dash-split-girls-count');
    if (boysCountEl)  boysCountEl.textContent  = `${boys} (${boysPct}%)`;
    if (girlsCountEl) girlsCountEl.textContent = `${girls} (${girlsPct}%)`;
  } catch (_) {
    if (totalEl) totalEl.textContent = '—';
  }
}

// Rail item for returning to the dashboard home view — has no flyout panel of its
// own (handleRailClick/openFlyout require a matching flyout-body-* element), so it
// gets a dedicated handler that closes any open flyout and marks itself active.
function goToDashboardHome() {
  closeFlyout();
  document.querySelectorAll('.rail-item').forEach(btn => btn.classList.remove('active'));
  document.querySelector('[data-module="dashboard-home"]')?.classList.add('active');
  loadView('dashboard');
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

// Defense in depth: the rail button for a module the role can't access is
// never rendered (see _computeRailAccess() in showDashboard()), but this
// re-checks before actually opening the panel in case something else ever
// calls openFlyout(moduleKey) directly (console, a stray onclick, a future
// shortcut widget) bypassing the rail entirely.
function openFlyout(moduleKey) {
  const body = document.getElementById('flyout-body-' + moduleKey);
  if (!body) return;
  const registryKey = RAIL_MODULE_KEYS[moduleKey];
  if (registryKey && !hasModuleAccess(registryKey)) {
    showToast("You don't have access to this module.", 'error');
    return;
  }
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
  if (!q) { resultsEl.innerHTML = '<p class="dash-search-msg">Enter a name or admission number to search.</p>'; return; }

  resultsEl.innerHTML = '<p class="dash-search-msg">Searching&#8230;</p>';
  try {
    let students = _dashStudentsCache;
    if (!students) {
      const res = await apiFetch(`${API_BASE}/students/`);
      if (!res || !res.ok) { resultsEl.innerHTML = '<p class="dash-search-msg" style="color:var(--color-danger)">Could not load students.</p>'; return; }
      const raw = await res.json();
      students = Array.isArray(raw) ? raw : (raw.data || raw.results || []);
      _dashStudentsCache = students;
    }
    const matched = students.filter(s =>
      (`${s.first_name||''} ${s.last_name||''}`).toLowerCase().includes(q) ||
      (s.student_id || '').toLowerCase().includes(q)
    );
    if (!matched.length) { resultsEl.innerHTML = '<p class="dash-search-msg">No students found.</p>'; return; }
    resultsEl.innerHTML = matched.slice(0, 10).map(s => {
      const fullName  = `${s.first_name || ''} ${s.last_name || ''}`.trim() || '—';
      const initials  = (((s.first_name || '')[0] || '') + ((s.last_name || '')[0] || '')).toUpperCase() || '?';
      return `
      <div class="dash-result-row" onclick="_currentEditStudentId=${Number(s.id)};loadView('students-view');">
        <div class="dash-result-avatar">${_dashEsc(initials)}</div>
        <div>
          <div class="dash-result-name">${_dashEsc(fullName)}</div>
          <div class="dash-result-sub">${_dashEsc(s.student_id || '-')} &middot; ${_dashEsc(s.class_name || '-')}</div>
        </div>
        <span class="dash-result-view">View &rarr;</span>
      </div>`;
    }).join('') + (matched.length > 10 ? `<div class="dash-result-more">${matched.length - 10} more result(s) — refine your search.</div>` : '');
  } catch (_) {
    resultsEl.innerHTML = '<p class="dash-search-msg" style="color:var(--color-danger)">Search failed. Please try again.</p>';
  }
}

// ==================== SPLIT-VIEW HELPERS ====================

// Normalise API list responses — may be defined again in module files (same logic)
function _toArray(raw) { return Array.isArray(raw) ? raw : (raw?.data || raw?.items || raw?.results || []); }

function renderBreadcrumb(parts) {
  // Each part can be a string or {label, view} object for direct navigation.
  const links = parts.map((p, i) => {
    const label = typeof p === 'string' ? p : p.label;
    const view  = typeof p === 'string' ? null : p.view;
    if (i < parts.length - 1) {
      const onclick = view
        ? `loadView('${view}')`
        : `history.back()`;
      return `<span class="bc-link" onclick="${onclick}">${label}</span><span class="bc-sep"> › </span>`;
    }
    return `<span class="bc-current">${label}</span>`;
  }).join('');
  return `<nav class="view-breadcrumb">${links}</nav>`;
}

function renderSplitSkeleton() {
  const rows = [1,2,3,4,5,6].map(() =>
    `<div class="split-skeleton-row"><div class="shimmer"></div><div class="shimmer"></div></div>`
  ).join('');
  return `<div class="split-layout">
    <div class="split-left">
      <div class="split-left-header"><span class="split-left-title">Loading…</span></div>
      <div class="split-left-col-headers"><span>—</span><span>—</span></div>
      <div class="split-list">${rows}</div>
    </div>
    <div class="split-right"><div class="split-right-add"></div></div>
  </div>`;
}

function buildDetailFields(item, fields) {
  return fields.map(f => {
    if (typeof f.hideWhen === 'function' && f.hideWhen(item)) return '';
    const raw = item[f.key];
    const val = f.fmt ? f.fmt(raw, item) : (raw ?? '—');
    return `
      <div class="detail-field"${f.fullWidth ? ' style="grid-column:1/-1"' : ''}>
        <span class="detail-field-label">${f.label}</span>
        <span class="detail-field-value">${val ?? '—'}</span>
      </div>`;
  }).join('');
}

async function renderSplitView(cfg) {
  const container = cfg.container;
  const idKey = cfg.idKey || 'id';
  let allItems = [];
  let selectedItem = null;
  let mode = 'add';
  let searchTerm = '';

  // Optional cfg.moduleKey (registry dot-notation key, e.g. "finance.receivables")
  // gates the Add trigger/renderAdd and Edit button on canAdd/canEdit for that
  // key. Hidden, not disabled, per spec — omitting moduleKey leaves a screen
  // fully open (back-compat for the many call sites not yet wired up; see the
  // module-registry rollout tasks).
  const _canAddHere  = !cfg.moduleKey || canAdd(cfg.moduleKey);
  const _canEditHere = !cfg.moduleKey || canEdit(cfg.moduleKey);

  // 2-column left panel config
  const col1Label = cfg.col1Label || 'Name';
  const col2Label = cfg.col2Label || '';
  const col1Fn    = cfg.col1 || cfg.rowLabel || (item => item.name || '—');
  const col2Fn    = cfg.col2 || cfg.rowSub   || (() => '');
  const nameLabel = cfg.rowLabel || col1Fn;

  container.innerHTML = renderSplitSkeleton();

  try {
    const resp = await apiFetch(cfg.apiUrl);
    if (!resp || !resp.ok) throw new Error('fetch failed');
    const data = await resp.json();
    allItems = _toArray(data);
  } catch (_) {
    container.innerHTML = `<p style="color:var(--color-danger);padding:20px">Failed to load data.</p>`;
    return;
  }

  function getFiltered() {
    if (!searchTerm) return allItems;
    const q = searchTerm.toLowerCase();
    return allItems.filter(item =>
      (cfg.searchFields || []).some(f => (item[f] || '').toString().toLowerCase().includes(q))
    );
  }

  function renderList() {
    const listEl  = document.getElementById('split-list-items');
    const countEl = document.getElementById('split-list-count');
    if (!listEl) return;
    const filtered = getFiltered();
    if (countEl) countEl.textContent = filtered.length;
    listEl.innerHTML = filtered.map(item => {
      const isSel = selectedItem && String(selectedItem[idKey]) === String(item[idKey]);
      return `
        <div class="split-list-row${isSel ? ' active' : ''}"
             data-id="${item[idKey]}" onclick="window._splitSelectItem(${JSON.stringify(item[idKey])})">
          <div class="split-col1">${col1Fn(item)}</div>
          <div class="split-col2">${col2Fn(item)}</div>
        </div>`;
    }).join('') || `<p style="padding:24px;text-align:center;color:var(--grey-400);font-style:italic;font-size:13px">No records found</p>`;
  }

  function renderRight() {
    const rightEl = document.getElementById('split-right-panel');
    if (!rightEl) return;
    if (mode === 'add') {
      rightEl.className = 'split-right-add';
      rightEl.innerHTML = '';
      if (_canAddHere && typeof cfg.renderAdd === 'function') cfg.renderAdd(rightEl);
    } else if (mode === 'detail' && selectedItem) {
      rightEl.className = 'split-right-detail';
      const bannerTitle  = nameLabel(selectedItem);
      const bannerSub    = cfg.rowSub ? cfg.rowSub(selectedItem) : col2Fn(selectedItem);
      const _itemEditable = typeof cfg.canEdit !== 'function' || cfg.canEdit(selectedItem);
      const hasEditAction = _canEditHere && _itemEditable && (typeof cfg.onEdit === 'function' || typeof cfg.renderEdit === 'function');
      rightEl.innerHTML = `
        <div class="detail-banner">
          <div class="detail-banner-initials">${bannerTitle.charAt(0).toUpperCase()}</div>
          <div>
            <div class="detail-banner-name">${bannerTitle}</div>
            ${bannerSub ? `<div class="detail-banner-sub">${bannerSub}</div>` : ''}
          </div>
          ${hasEditAction ? `<button class="detail-action-trigger" onclick="window._splitEditItem()">&#9998; Edit</button>` : ''}
        </div>
        <div class="detail-info-card">
          <div class="detail-fields-grid">${buildDetailFields(selectedItem, cfg.detailFields || [])}</div>
          ${typeof cfg.detailActions === 'function' ? `<div class="detail-actions-row" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--grey-100)">${cfg.detailActions(selectedItem) || ''}</div>` : ''}
          ${_canAddHere ? `<div style="display:flex;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--grey-100)">
            <button class="btn" onclick="window._splitGoAdd()">+ Add New</button>
          </div>` : ''}
        </div>`;
    } else if (mode === 'edit' && selectedItem) {
      rightEl.className = 'split-edit-fullscreen';
      rightEl.innerHTML = '';
      if (typeof cfg.renderEdit === 'function') cfg.renderEdit(selectedItem, rightEl);
    }
  }

  const hasSearch = cfg.searchFields && cfg.searchFields.length > 0;
  container.innerHTML = `
    ${renderBreadcrumb(cfg.breadcrumb || [cfg.title])}
    <div class="split-layout">
      <div class="split-left">
        <div class="split-left-header">
          <span class="split-left-title">${cfg.title || ''}</span>
          <span class="split-left-count" id="split-list-count">${allItems.length}</span>
        </div>
        <div class="split-left-col-headers">
          <span>${col1Label}</span>
          <span>${col2Label}</span>
        </div>
        ${hasSearch ? `<div class="split-left-search"><input type="text" placeholder="Search…" oninput="window._splitSearch(this.value)"></div>` : ''}
        ${cfg.bulkUpload ? renderBulkUploadBar(cfg.bulkUpload.module, '_splitReload') : ''}
        <div class="split-list" id="split-list-items"></div>
      </div>
      <div class="split-right">
        <div id="split-right-panel" class="split-right-add"></div>
      </div>
    </div>`;

  window._splitSearch = function(term) { searchTerm = term; renderList(); };
  window._splitSelectItem = function(itemId) {
    selectedItem = allItems.find(i => String(i[idKey]) === String(itemId)) || null;
    mode = 'detail';
    renderList();
    renderRight();
  };
  window._splitEditItem = function() {
    if (!_canEditHere) return; // defense in depth — the Edit button is already hidden when this is false
    if (typeof cfg.canEdit === 'function' && !cfg.canEdit(selectedItem)) return; // ditto, per-item gate
    if (typeof cfg.onEdit === 'function') { cfg.onEdit(selectedItem); return; }
    mode = 'edit'; renderRight();
  };
  window._splitGoAdd = function() {
    if (!_canAddHere) return; // defense in depth — the +Add trigger is already hidden when this is false
    if (typeof cfg.onAdd === 'function') { cfg.onAdd(); return; }
    selectedItem = null; mode = 'add'; renderList(); renderRight();
  };
  // Optimistic local removal (e.g. after a 204 DELETE) — no re-fetch, just
  // splices the item out and drops back to the add/empty pane. Used where
  // the spec explicitly calls for "remove the row optimistically" rather
  // than a full reload (Tendepay Import History batch delete).
  window._splitRemoveItem = function(itemId) {
    allItems = allItems.filter(i => String(i[idKey]) !== String(itemId));
    if (selectedItem && String(selectedItem[idKey]) === String(itemId)) { selectedItem = null; mode = 'add'; }
    renderList(); renderRight();
  };
  window._splitReload = async function() {
    try {
      const resp = await apiFetch(cfg.apiUrl);
      if (resp && resp.ok) { allItems = _toArray(await resp.json()); }
    } catch(_) {}
    selectedItem = null; mode = 'add';
    renderList(); renderRight();
  };
  // Re-fetch the list and re-select the current item in place (used after a
  // detail-pane lifecycle action — e.g. approve/queue — so the banner and
  // fields reflect the new status without losing the user's place).
  window._splitRefreshSelected = async function() {
    try {
      const resp = await apiFetch(cfg.apiUrl);
      if (resp && resp.ok) { allItems = _toArray(await resp.json()); }
    } catch(_) {}
    if (selectedItem) {
      selectedItem = allItems.find(i => String(i[idKey]) === String(selectedItem[idKey])) || null;
      mode = selectedItem ? 'detail' : 'add';
    }
    renderList(); renderRight();
  };

  if (cfg.preselectId != null) {
    const pre = allItems.find(i => String(i[idKey]) === String(cfg.preselectId));
    if (pre) { selectedItem = pre; mode = 'detail'; }
  }
  renderList();
  renderRight();
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
  'fin-invoice-adjustments', 'fin-sponsorship-allocations', 'fin-student-fee-assignments',
  'fin-fee-setup-per-class', 'fin-receive-payments',
  'fin-fee-schedules', 'fin-fee-setup-class', 'fin-fee-assignments',
  'fin-fee-invoices', 'fin-invoice-detail', 'fin-invoice-generate', 'fin-invoices-bulk',
  'fin-chart-of-accounts', 'fin-fee-accounts', 'fin-fee-items', 'fin-general-items', 'finance-discount-setup',
  'finance-sibling-groups-add',
  // Payables
  'payables-payment-vouchers-add', 'payables-payment-vouchers-edit',
  'payables-tax-vouchers-add', 'payables-supplier-invoices-add', 'payables-supplier-invoices-edit',
  'payables-expense-claims-add', 'payables-expense-claim-disbursements-add',
  'payables-petty-cash-applications-add', 'payables-petty-cash-disbursements-add',
  'payables-imprest-warrants-add', 'payables-imprest-disbursements-add', 'payables-imprest-surrenders-add',
  'journal-entries-add', 'journal-entries-edit',
  // Tendepay
  'tendepay-import', 'tendepay-fund-loads',
  // HR / Payroll
  'hr-employee-directory', 'payroll-esp', 'payroll-fi', 'payroll-runs', 'payroll-payslips',
  // Procurement
  'procurement-suppliers-add', 'procurement-suppliers-edit',
  // Administration
  'user-management', 'admin-roles', 'admin-role-edit', 'admin-role-permissions',
  // Academic setup
  'sa-academic-years', 'sa-sessions', 'sa-session-types',
  // Utilities with add/edit forms
  'utilities-streams', 'utilities-funding-sources', 'utilities-sports-houses',
  'student-classes',
  // Transport
  'transport-routes-add', 'transport-routes-edit',
  'transport-vehicles-add', 'transport-vehicles-edit',
]);

async function loadView(view) {
  const main = document.getElementById("main-content");
  clearSidebarActiveItems();

  // Stop any running keep-alive before evaluating the new view
  stopKeepAlive();
  // Restart it if the new view is form-oriented
  if (FORM_VIEWS.has(view)) startKeepAlive();
  switch(view) {
    case 'dashboard':
      renderDashboardHome(main); break;
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
      setActiveSidebarItem('sidebar-stu-cohort'); openStuMgmtDropdowns();
      await loadCohortTermPlannerView(main); break;
    case 'cohort-term-planner-add':
      openStuMgmtDropdowns();
      await loadCohortTermPlannerFormView(main); break;
    case 'cohort-term-planner-edit':
      openStuMgmtDropdowns();
      await loadCohortTermPlannerFormView(main); break;
    case 'student-classes':
      await loadStudentClassesView(main); break;
    case 'close-records-per-class':
    case 'student-close-records':
      setActiveSidebarItem('sidebar-stu-close-records'); openStuMgmtDropdowns();
      await loadCloseRecordsView(main); break;
    case 'student-parent-portal':
      setActiveSidebarItem('sidebar-stu-parent-portal'); openStuMgmtDropdowns();
      await loadParentPortalAccessView(main); break;
    // Student Management – Utilities
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
      await loadBusesView(main); break;
    case 'transport-vehicles-add':
      openTransportUtilitiesDropdown();
      await loadBusFormView(main, null); break;
    case 'transport-vehicles-edit':
      openTransportUtilitiesDropdown();
      await loadBusFormView(main, window._currentEditBusId); break;
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
    case 'fin-student-fee-assignments':
      setActiveSidebarItem('sidebar-fin-fee-assign'); openFinStudentFinanceDropdown();
      loadStudentFeeAssignmentsView(main); break;
    case 'fin-student-bulk-invoicing':
      setActiveSidebarItem('sidebar-fin-bulk'); openFinStudentFinanceDropdown();
      loadStudentBulkInvoicingView(main); break;
    // Receivables (new modules)
    case 'fin-fee-schedules':
      setActiveSidebarItem('sidebar-fin-fee-schedules'); openFinStudentFinanceDropdown();
      await loadFeeSchedulesView(main); break;
    case 'fin-fee-setup-class':
      setActiveSidebarItem('sidebar-fin-fee-setup-class'); openFinStudentFinanceDropdown();
      await loadFeeSetupByClassView(main); break;
    case 'fin-fee-assignments':
      setActiveSidebarItem('sidebar-fin-fee-assign'); openFinStudentFinanceDropdown();
      await loadFeeAssignmentsView(main); break;
    case 'fin-fee-invoices':
      setActiveSidebarItem('sidebar-fin-fee-invoices'); openFinStudentFinanceDropdown();
      await loadFeeInvoicesView(main); break;
    case 'fin-invoice-detail':
      openFinStudentFinanceDropdown();
      await loadInvoiceDetailView(main, window._rcvCurrentInvoiceId); break;
    case 'fin-invoice-generate':
      openFinStudentFinanceDropdown();
      await loadInvoiceGenerateView(main, window._rcvGenStudentId, window._rcvGenTermId); break;
    case 'fin-invoices-bulk':
      setActiveSidebarItem('sidebar-fin-bulk'); openFinStudentFinanceDropdown();
      await loadBulkInvoiceView(main); break;
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
      await loadFinTransactionsView(main); break;
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
    case 'fin-general-items':
      setActiveSidebarItem('sidebar-fin-gen-items'); openFinUtilitiesDropdown();
      loadGeneralItemsView(main); break;
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
    // Document Approvals
    case 'document-approvals-queue':
      setActiveSidebarItem('sidebar-da-queue'); await loadDaQueueView(main); break;
    case 'document-approvals-all':
      setActiveSidebarItem('sidebar-da-all'); await loadDaAllView(main); break;
    case 'document-approvals-surcharge-policy':
      setActiveSidebarItem('sidebar-da-surcharge'); await loadDaSurchargePolicyView(main); break;
    // Tendepay sub-modules
    case 'tendepay-import':
      setActiveSidebarItem('sidebar-fin-tp-import'); openFinTendepayDropdown();
      await loadTendepayImportView(main); break;
    case 'tendepay-import-history':
      setActiveSidebarItem('sidebar-fin-tp-history'); openFinTendepayDropdown();
      await loadTendepayImportHistoryView(main); break;
    case 'tendepay-suspense':
      setActiveSidebarItem('sidebar-fin-tp-suspense'); openFinTendepayDropdown();
      await loadTendepaySuspenseView(main); break;
    case 'tendepay-fund-loads':
      setActiveSidebarItem('sidebar-fin-tp-funds'); openFinTendepayDropdown();
      await loadTendepayFundLoadsView(main); break;
    case 'tendepay-reconciliation':
      setActiveSidebarItem('sidebar-fin-tp-recon'); openFinTendepayDropdown();
      await loadTendepayReconciliationView(main); break;
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
    case 'finance-sibling-groups':
      setActiveSidebarItem('sidebar-fin-sibling-groups'); openFinSetupDropdown();
      await loadSiblingGroupsView(main); break;
    case 'finance-sibling-groups-add':
      openFinSetupDropdown();
      await loadSiblingGroupFormView(main); break;
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
    case 'reports-ap-reconciliation':
    case 'reports-bank-reconciliation':
    case 'reports-budget-vs-actual':
    case 'reports-statement-of-changes-in-net-assets':
    case 'reports-journal-entry':
    case 'reports-tendepay-wallet-balances':
    case 'reports-tendepay-transaction-history':
    case 'reports-unmatched-tendepay-transactions':
      openFinReportsDropdown();
      await loadFinanceReportView(main, view); break;
    // Reports (hidden from sidebar but kept)
    case 'reports': await loadReportsView(main); break;
    // Payroll
    case 'payroll-esp': loadPayrollEspListingView(main); break;
    case 'payroll-runs':
      setActiveSidebarItem('sidebar-payroll-runs');
      await loadPayrollRunsView(main); break;
    case 'payroll-payslips':
      setActiveSidebarItem('sidebar-payroll-payslips');
      await loadPayrollPayslipsView(main); break;
    case 'payroll-fi':  loadPayrollFiListingView(main); break;
    case 'payroll-pay-accounts':
      setActiveSidebarItem('sidebar-payroll-pay-accounts'); openPayrollDropdowns();
      showPlaceholder(main, 'Pay Accounts'); break;
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
    case 'hr-utilities-pay-grades':
      setActiveSidebarItem('sidebar-hr-pay-grades'); openHrDropdowns();
      await loadPayGradesView(main); break;
    // Administration
    case 'administration': await loadAdministrationView(main); break;
    case 'user-management': await loadUserManagementView(main); break;
    case 'admin-roles': await loadRolesListingView(main); break;
    case 'admin-role-permissions':
    case 'admin-role-edit': await renderRoleEditPage(main); break;
    case 'admin-setup': showPlaceholder(main, 'Setup'); break;
    case 'admin-departments': await loadDepartmentsView(main); break;
    // Empty modules
    // Procurement
    case 'procurement':
    case 'procurement-suppliers':
      setActiveSidebarItem('sidebar-prc-suppliers');
      await loadSuppliersView(main); break;
    case 'procurement-suppliers-add':
      setActiveSidebarItem('sidebar-prc-suppliers');
      await loadSupplierFormView(main, null); break;
    case 'procurement-suppliers-edit':
      setActiveSidebarItem('sidebar-prc-suppliers');
      await loadSupplierFormView(main, _supEditId); break;
    // Empty modules
    case 'inventory-management':
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