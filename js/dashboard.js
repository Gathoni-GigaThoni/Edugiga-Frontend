// ==================== DASHBOARD ====================
function showDashboard() {
  const isSuperAdmin = currentUser?.clearance_level === 1 || currentUser?.role === 'super_admin';
  document.body.innerHTML = `
    <div class="container">
      <nav class="sidebar">
        <h2>EduGiga - Seven Oaks International School</h2>
        <div class="sidebar-section">Dashboard</div>
        <ul>
          <li class="dropdown">
            <span onclick="toggleDropdown('student-management-dropdown')">Student Management ▾</span>
            <ul id="student-management-dropdown" class="dropdown-menu" style="display:none;">
              <li id="sidebar-stu-search"        onclick="loadView('student-search')">Student Search</li>
              <li id="sidebar-stu-id-cards"      onclick="loadView('student-id-cards')">ID Cards</li>
              <li id="sidebar-stu-list"          onclick="loadView('students-list')">Students</li>
              <li id="sidebar-stu-applicants"    onclick="loadView('student-applicants')">Applicants</li>
              <li id="sidebar-stu-reporting"     onclick="loadView('student-reporting')">Student Reporting</li>
              <li id="sidebar-stu-cohort"        onclick="loadView('student-cohort-planner')">Cohort Session Planner</li>
              <li id="sidebar-stu-classes"       onclick="loadView('student-classes')">Classes</li>
              <li id="sidebar-stu-close-records" onclick="loadView('student-close-records')">Close Records Per Class</li>
              <li class="dropdown">
                <span onclick="toggleDropdown('stu-utilities-dropdown')">Utilities ▾</span>
                <ul id="stu-utilities-dropdown" class="dropdown-menu" style="display:none;">
                  <li id="sidebar-stu-sources" class="sa-sub-sub" onclick="loadView('utilities-student-sources')">Student Sources</li>
                  <li id="sidebar-stu-streams" class="sa-sub-sub" onclick="loadView('utilities-streams')">Streams</li>
                  <li id="sidebar-stu-funding" class="sa-sub-sub" onclick="loadView('utilities-funding-sources')">Funding Sources</li>
                </ul>
              </li>
              <li class="dropdown">
                <span onclick="toggleDropdown('stu-reports-dropdown')">Reports ▾</span>
                <ul id="stu-reports-dropdown" class="dropdown-menu" style="display:none;">
                  <li id="sidebar-stu-report"     class="sa-sub-sub" onclick="loadView('reports-student')">Student Report</li>
                  <li id="sidebar-stu-gua-report" class="sa-sub-sub" onclick="loadView('reports-guardian')">Student Guardian Report</li>
                </ul>
              </li>
            </ul>
          </li>
          <li class="dropdown">
            <span onclick="toggleDropdown('student-academics-dropdown')">Student Academics ▾</span>
            <ul id="student-academics-dropdown" class="dropdown-menu" style="display:none;">
              <li id="sidebar-att-register" onclick="loadView('attendance-register')">Attendance Register</li>
              <li class="dropdown">
                <span onclick="toggleDropdown('att-reports-dropdown')">Attendance Reports ▾</span>
                <ul id="att-reports-dropdown" class="dropdown-menu" style="display:none;">
                  <li id="sidebar-att-reg-report" class="sa-sub-sub" onclick="loadView('attendance-register-report')">Attendance Register Report</li>
                </ul>
              </li>
              <li id="sidebar-formative-assessment" onclick="loadView('formative-assessment')">Formative Assessment</li>
              <li id="sidebar-sa-subjects"     onclick="loadView('sa-subjects')">Subjects</li>
              <li class="dropdown">
                <span onclick="toggleDropdown('sa-utilities-dropdown')">Utilities ▾</span>
                <ul id="sa-utilities-dropdown" class="dropdown-menu" style="display:none;"></ul>
              </li>
              <li class="dropdown">
                <span onclick="toggleDropdown('sa-setup-dropdown')">Set-up ▾</span>
                <ul id="sa-setup-dropdown" class="dropdown-menu" style="display:none;"></ul>
              </li>
              <li id="sidebar-sa-sessions"     onclick="loadView('sa-sessions')">Sessions</li>
              <li id="sidebar-sa-session-types" onclick="loadView('sa-session-types')">Session Types</li>
              <li id="sidebar-sa-academic-years" onclick="loadView('sa-academic-years')">Academic Years</li>
            </ul>
          </li>
          <li onclick="loadView('transport-management')">Transport Management</li>
          <li class="dropdown">
            <span onclick="toggleDropdown('finance-dropdown')">Finance ▾</span>
            <ul id="finance-dropdown" class="dropdown-menu" style="display:none;">
              <li onclick="loadView('student-fees-status')">Student Fees Status</li>
              <li onclick="loadView('summarized-fee-statement')">Summarized Fee Statement</li>
              <li class="dropdown">
                <span onclick="toggleDropdown('fin-sf-dropdown')">Student Finance ▾</span>
                <ul id="fin-sf-dropdown" class="dropdown-menu" style="display:none;">
                  <li id="sidebar-fin-invoices"       class="sidebar-sub-sub" onclick="loadView('fin-student-invoices')">Student Invoices</li>
                  <li id="sidebar-fin-bulk"           class="sidebar-sub-sub" onclick="loadView('fin-student-bulk-invoicing')">Student Bulk Invoicing</li>
                  <li id="sidebar-fin-inv-adj"        class="sidebar-sub-sub" onclick="loadView('fin-invoice-adjustments')">Student Invoice Adjustments</li>
                  <li id="sidebar-fin-spon-alloc"     class="sidebar-sub-sub" onclick="loadView('fin-sponsorship-allocations')">Sponsorship Allocations</li>
                  <li id="sidebar-fin-spon-mgmt"      class="sidebar-sub-sub" onclick="loadView('fin-sponsorship-managements')">Sponsorship Managements</li>
                  <li id="sidebar-fin-fee-setup"      class="sidebar-sub-sub" onclick="loadView('fin-fee-setup-per-class')">Fee Set-up per Class</li>
                </ul>
              </li>
              <li onclick="loadView('cash-bank-management')">Cash and Bank Management</li>
              <li onclick="loadView('payables')">Payables</li>
              <li class="dropdown">
                <span onclick="toggleDropdown('fin-receivables-dropdown')">Receivables ▾</span>
                <ul id="fin-receivables-dropdown" class="dropdown-menu" style="display:none;">
                  <li id="sidebar-fin-rcv-pay"   class="sidebar-sub-sub" onclick="loadView('fin-receive-payments')">Receive Payments</li>
                  <li id="sidebar-fin-txns"       class="sidebar-sub-sub" onclick="loadView('fin-transactions')">Transactions</li>
                  <li id="sidebar-fin-deposit"    class="sidebar-sub-sub" onclick="loadView('fin-deposit-slip')">Deposit Slip</li>
                  <li id="sidebar-fin-credit"     class="sidebar-sub-sub" onclick="loadView('fin-credit-notes')">Credit Notes</li>
                </ul>
              </li>
              <li onclick="loadView('cancellations')">Cancellations</li>
              <li onclick="loadView('journal-entries')">Journal Entries</li>
              <li class="dropdown">
                <span onclick="toggleDropdown('fin-utilities-dropdown')">Utilities ▾</span>
                <ul id="fin-utilities-dropdown" class="dropdown-menu" style="display:none;">
                  <li id="sidebar-fin-coa"        class="sidebar-sub-sub" onclick="loadView('fin-chart-of-accounts')">Chart of Accounts</li>
                  <li id="sidebar-fin-fee-accts"  class="sidebar-sub-sub" onclick="loadView('fin-fee-accounts')">Fee Accounts</li>
                  <li id="sidebar-fin-groups"     class="sidebar-sub-sub" onclick="loadView('fin-groups')">Groups</li>
                  <li id="sidebar-fin-subgroups"  class="sidebar-sub-sub" onclick="loadView('fin-sub-groups')">Sub Groups</li>
                  <li id="sidebar-fin-fiscal"     class="sidebar-sub-sub" onclick="loadView('fin-fiscal-years')">Fiscal Years</li>
                  <li id="sidebar-fin-pay-modes"  class="sidebar-sub-sub" onclick="loadView('fin-payment-modes')">Payment Modes</li>
                </ul>
              </li>
              <li onclick="loadView('finance-setup')">Set-up</li>
              <li onclick="loadView('finance-reports')">Reports</li>
            </ul>
          </li>
          <li onclick="loadView('inventory-management')">Inventory Management</li>
          <li onclick="loadView('procurement')">Procurement</li>
          <li class="dropdown">
            <span onclick="toggleDropdown('hr-dropdown')">Human Resource ▾</span>
            <ul id="hr-dropdown" class="dropdown-menu" style="display:none;">
              <li id="sidebar-hr-employee-directory" onclick="loadView('hr-employee-directory')">Employee Directory</li>
              <li id="sidebar-hr-staff-attendance" onclick="loadView('hr-staff-attendance')">Staff Attendance</li>
              <li id="sidebar-hr-utilities" onclick="loadView('hr-utilities')">Utilities</li>
            </ul>
          </li>
          <li class="dropdown">
            <span onclick="toggleDropdown('payroll-dropdown')">Payroll ▾</span>
            <ul id="payroll-dropdown" class="dropdown-menu" style="display:none;">
              <li id="sidebar-payroll-esp" onclick="loadView('payroll-esp')">Employee Service Profile</li>
              <li class="dropdown">
                <span onclick="toggleDropdown('payroll-utilities-dropdown')">Utilities ▾</span>
                <ul id="payroll-utilities-dropdown" class="dropdown-menu" style="display:none;">
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
          </li>
          <li onclick="loadView('asset-management')">Asset Management</li>
          <li onclick="loadView('communication')">Communication</li>
          ${isSuperAdmin ? `
          <li class="dropdown">
            <span onclick="toggleDropdown('admin-dropdown')">Administration ▾</span>
            <ul id="admin-dropdown" class="dropdown-menu" style="display:none;">
              <li onclick="loadView('user-management')">User Management</li>
              <li onclick="loadView('admin-roles')">Roles</li>
              <li onclick="loadView('admin-setup')">Setup</li>
            </ul>
          </li>
          ` : ''}
          <li onclick="logout()">Logout</li>
        </ul>
      </nav>
      <main id="main-content">
        <h2>Welcome to EduGiga - Seven Oaks International School</h2>
        <p>Select a module from the sidebar.</p>
      </main>
    </div>
  `;
}

// ==================== VIEW LOADER ====================
async function loadView(view) {
  const main = document.getElementById("main-content");
  clearSidebarActiveItems();
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
    case 'student-cohort-planner':
      setActiveSidebarItem('sidebar-stu-cohort'); openStuMgmtDropdowns();
      showPlaceholder(main, 'Cohort Session Planner'); break;
    case 'student-classes':
      setActiveSidebarItem('sidebar-stu-classes'); openStuMgmtDropdowns();
      showPlaceholder(main, 'Classes'); break;
    case 'student-close-records':
      setActiveSidebarItem('sidebar-stu-close-records'); openStuMgmtDropdowns();
      showPlaceholder(main, 'Close Records Per Class'); break;
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
      setActiveSidebarItem('sidebar-sa-sessions'); await loadSessionsView(main); break;
    case 'sa-session-types':
      setActiveSidebarItem('sidebar-sa-session-types'); loadSessionTypesView(main); break;
    case 'sa-academic-years':
      setActiveSidebarItem('sidebar-sa-academic-years'); await loadAcademicYearsView(main); break;
    // Transport
    case 'transport-management': await loadTransportView(main); break;
    // Finance (NEW sub-modules)
    case 'student-fees-status': await loadStudentFeesStatusView(main); break;
    case 'summarized-fee-statement': await loadSummarizedFeeStatementView(main); break;
    case 'student-finance': showPlaceholder(main, 'Student Finance'); break;
    // Student Finance sub-modules
    case 'fin-student-invoices':
      setActiveSidebarItem('sidebar-fin-invoices'); openFinStudentFinanceDropdown();
      loadStudentInvoicesView(main); break;
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
    case 'payables': showPlaceholder(main, 'Payables'); break;
    case 'receivables': showPlaceholder(main, 'Receivables'); break;
    case 'cancellations': showPlaceholder(main, 'Cancellations'); break;
    case 'journal-entries': showPlaceholder(main, 'Journal Entries'); break;
    case 'utilities': showPlaceholder(main, 'Utilities'); break;
    case 'finance-setup': showPlaceholder(main, 'Set-up'); break;
    case 'finance-reports': showPlaceholder(main, 'Reports'); break;
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
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}


// ---- Sidebar active-item helpers ----
function clearSidebarActiveItems() {
  document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('sidebar-active'));
}

function setActiveSidebarItem(itemId) {
  clearSidebarActiveItems();
  const el = document.getElementById(itemId);
  if (el) el.classList.add('sidebar-active');
}

// ---- Utilities ----
function closeModal(modalId) { document.getElementById(modalId).style.display = "none"; }