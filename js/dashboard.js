// ==================== DASHBOARD ====================
function showDashboard() {
  const isSuperAdmin = currentUser?.permissions?.includes("*");
  document.body.innerHTML = `
    <div class="container">
      <nav class="sidebar">
        <h2>EduGiga - Seven Oaks International School</h2>
        <div class="sidebar-section">Dashboard</div>
        <ul>
          <li class="dropdown">
            <span onclick="toggleDropdown('student-management-dropdown')">Student Management ▾</span>
            <ul id="student-management-dropdown" class="dropdown-menu" style="display:none;">
              <li onclick="loadView('students-list')">Students</li>
              <li onclick="loadView('student-search')">Student Search</li>
              <li onclick="loadView('student-reporting')">Student Reporting</li>
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
              <li onclick="loadView('student-finance')">Student Finance</li>
              <li onclick="loadView('cash-bank-management')">Cash and Bank Management</li>
              <li onclick="loadView('payables')">Payables</li>
              <li onclick="loadView('receivables')">Receivables</li>
              <li onclick="loadView('cancellations')">Cancellations</li>
              <li onclick="loadView('journal-entries')">Journal Entries</li>
              <li onclick="loadView('utilities')">Utilities</li>
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
    // Student Management sub-modules
    case 'students-list': await loadStudentsListView(main); break;
    case 'student-search': await loadStudentSearchView(main); break;
    case 'student-reporting': await loadStudentReportingView(main); break;
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
    case 'summarized-fee-statement': showPlaceholder(main, 'Summarized Fee Statement'); break;
    case 'student-finance': showPlaceholder(main, 'Student Finance'); break;
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