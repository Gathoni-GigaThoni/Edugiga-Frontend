// app.js

const API_BASE = "https://edu-giga-school-management-system-1.onrender.com";
let token = "";
let currentUser = null;   // will store the decoded JWT payload after login

// ==================== AUTH ====================
async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData
    });
    if (!res.ok) throw new Error("Invalid credentials");
    const data = await res.json();
    token = data.access_token;
    // Decode the JWT to get user info (clearance, role, etc.)
    const payload = JSON.parse(atob(token.split('.')[1]));
    currentUser = payload;
    showDashboard();
  } catch (err) {
    document.getElementById("error").innerText = err.message;
  }
}

function logout() {
  token = "";
  currentUser = null;
  location.reload();
}

// ==================== DASHBOARD ====================
function showDashboard() {
  const isSuperAdmin = currentUser?.clearance_level === 1;
  document.body.innerHTML = `
    <div class="container">
      <nav class="sidebar">
        <h2>EduGiga - Seven Oaks International School</h2>
        <div class="sidebar-section">Dashboard</div>
        <ul>
          <li onclick="loadView('student-management')">Student Management</li>
          <li class="dropdown">
            <span onclick="toggleDropdown('student-academics-dropdown')">Student Academics ▾</span>
            <ul id="student-academics-dropdown" class="dropdown-menu" style="display:none;">
              <li onclick="loadView('attendance-register')">Attendance Register</li>
              <li onclick="loadView('academic-year-setup')">Academic Year Setup</li>
            </ul>
          </li>
          <li onclick="loadView('transport-management')">Transport Management</li>
          <li class="dropdown">
            <span onclick="toggleDropdown('finance-dropdown')">Finance ▾</span>
            <ul id="finance-dropdown" class="dropdown-menu" style="display:none;">
              <li onclick="loadView('report-back')">Report Back Students</li>
              <li onclick="loadView('view-invoices')">View Invoices</li>
              <li onclick="loadView('create-invoice')">Create Invoice</li>
            </ul>
          </li>
          <li onclick="loadView('inventory-management')">Inventory Management</li>
          <li onclick="loadView('procurement')">Procurement</li>
          <li onclick="loadView('human-resource')">Human Resource</li>
          <li onclick="loadView('payroll')">Payroll</li>
          <li onclick="loadView('asset-management')">Asset Management</li>
          <li onclick="loadView('communication')">Communication</li>
          ${isSuperAdmin ? '<li onclick="loadView(\'administration\')">Administration</li>' : ''}
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
  switch(view) {
    case 'student-management': await loadStudentManagementView(main); break;
    case 'attendance-register': await loadAttendanceView(main); break;
    case 'academic-year-setup': await loadAcademicsView(main); break;
    case 'transport-management': await loadTransportView(main); break;
    case 'report-back': await loadReportBackView(main); break;
    case 'view-invoices': await loadViewInvoicesView(main); break;
    case 'create-invoice': await loadCreateInvoiceView(main); break;
    case 'reports': await loadReportsView(main); break;
    case 'administration': await loadAdministrationView(main); break;
    // New empty modules
    case 'inventory-management':
    case 'procurement':
    case 'human-resource':
    case 'payroll':
    case 'asset-management':
    case 'communication':
      main.innerHTML = `<h2>${view.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h2><p>This module is under construction.</p>`;
      break;
    default: main.innerHTML = "<p>Module not found.</p>";
  }
}

function toggleDropdown(id) {
  const menu = document.getElementById(id);
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// ==================== STUDENT MANAGEMENT ====================
async function loadStudentManagementView(container) {
  container.innerHTML = `
    <h2>Student Management</h2>
    <button onclick="showStudentForm()">Register New Student</button>
    <div id="student-list"></div>
    <div id="student-form" style="display:none;"></div>
    <div id="student-profile" style="display:none;"></div>
  `;
  await refreshStudentList();
}

async function refreshStudentList() {
  const res = await fetch(`${API_BASE}/students/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const students = await res.json();
  let html = `<table><tr><th>ID</th><th>Name</th><th>Class</th><th>Actions</th></tr>`;
  students.forEach(s => {
    html += `<tr>
      <td>${s.student_id}</td>
      <td>${s.first_name} ${s.last_name}</td>
      <td>${s.level || s.class_name || ''}</td>
      <td>
        <button onclick="viewStudentProfile(${s.id})">View</button>
        <button onclick="editStudent(${s.id})">Edit</button>
      </td>
    </tr>`;
  });
  html += `</table>`;
  document.getElementById("student-list").innerHTML = html;
}

function showStudentForm() {
  const form = document.getElementById("student-form");
  form.style.display = "block";
  form.innerHTML = `
    <h3>Register Student</h3>
    <input id="s_first_name" placeholder="First Name">
    <input id="s_last_name" placeholder="Last Name">
    <input id="s_dob" type="date" placeholder="Date of Birth">
    <select id="s_level">
      <option value="">Select Level</option>
      <option value="1">Maple</option>
      <option value="2">Acorn</option>
    </select>
    <select id="s_class">
      <option value="">Select Class</option>
    </select>
    <input id="s_stream" placeholder="Stream (e.g. East)">
    <label>Uses Transport?</label>
    <input type="checkbox" id="s_uses_transport">
    <div id="transport-section" style="display:none;">
      <select id="s_route"></select>
      <select id="s_direction">
        <option value="TWO_WAY">Two-Way</option>
        <option value="ONE_WAY_MORNING">Morning Only</option>
        <option value="ONE_WAY_EVENING">Evening Only</option>
      </select>
    </div>
    <h4>Parent Information</h4>
    <input id="s_parent1_name" placeholder="Primary Parent Full Name (Mother)" required>
    <input id="s_parent1_email" type="email" placeholder="Parent Email" required>
    <input id="s_parent1_phone" placeholder="Parent Phone" required>
    <input id="s_parent1_id_doc" type="file" accept=".pdf,.jpg,.png">
    <hr>
    <input id="s_parent2_name" placeholder="Second Parent Full Name (optional)">
    <input id="s_parent2_email" type="email" placeholder="Second Parent Email">
    <input id="s_parent2_phone" placeholder="Second Parent Phone">
    <input id="s_parent2_id_doc" type="file" accept=".pdf,.jpg,.png">
    <h4>Medical Information</h4>
    <textarea id="s_allergies" placeholder="Allergies"></textarea>
    <textarea id="s_chronic" placeholder="Chronic Symptoms"></textarea>
    <button onclick="registerStudent()">Save Student</button>
  `;
  document.getElementById("s_level").onchange = loadClasses;
  document.getElementById("s_uses_transport").onchange = toggleTransport;
  loadRoutes();
}

async function registerStudent() {
  const payload = {
    first_name: document.getElementById("s_first_name").value,
    last_name: document.getElementById("s_last_name").value,
    date_of_birth: document.getElementById("s_dob").value,
    level_id: parseInt(document.getElementById("s_level").value),
    class_id: parseInt(document.getElementById("s_class").value),
    stream: document.getElementById("s_stream").value,
    uses_transport: document.getElementById("s_uses_transport").checked,
    parents: [
      {
        full_name: document.getElementById("s_parent1_name").value,
        email: document.getElementById("s_parent1_email").value,
        phone: document.getElementById("s_parent1_phone").value,
        relationship: "MOTHER",
        is_primary: true
      }
    ]
  };
  const p2name = document.getElementById("s_parent2_name").value;
  if (p2name) {
    payload.parents.push({
      full_name: p2name,
      email: document.getElementById("s_parent2_email").value,
      phone: document.getElementById("s_parent2_phone").value,
      relationship: "FATHER",
      is_primary: false
    });
  }
  if (document.getElementById("s_uses_transport").checked) {
    payload.route_id = parseInt(document.getElementById("s_route").value);
    payload.direction = document.getElementById("s_direction").value;
  }
  payload.medical = {
    allergies: document.getElementById("s_allergies").value,
    chronic_symptoms: document.getElementById("s_chronic").value
  };

  const res = await fetch(`${API_BASE}/students/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    alert("Student registered!");
    document.getElementById("student-form").style.display = "none";
    refreshStudentList();
  } else {
    const err = await res.json();
    alert("Error: " + JSON.stringify(err.detail));
  }
}

async function viewStudentProfile(studentId) {
  const res = await fetch(`${API_BASE}/students/${studentId}/full-profile`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  const profile = document.getElementById("student-profile");
  profile.style.display = "block";
  profile.innerHTML = `
    <h3>${data.first_name} ${data.last_name}</h3>
    <p>ID: ${data.student_id}</p>
    <p>Age: ${data.age_months} months</p>
    <h4>Parents</h4>
    <ul>${data.parents.map(p => `<li>${p.full_name} - ${p.relationship} (${p.email})</li>`).join('')}</ul>
    <h4>Medical</h4>
    <p>Allergies: ${data.medical?.allergies || 'None'}</p>
    <p>Chronic: ${data.medical?.chronic_symptoms || 'None'}</p>
    <h4>Attendance</h4>
    <p>Present: ${data.attendance_summary?.present || 0} | Absent: ${data.attendance_summary?.absent || 0}</p>
    <button onclick="document.getElementById('student-profile').style.display='none'">Close</button>
  `;
}

// ==================== ATTENDANCE REGISTER ====================
async function loadAttendanceView(container) {
  container.innerHTML = `
    <h2>Attendance Register</h2>
    <label>Date:</label>
    <input type="date" id="attendanceDate" value="${new Date().toISOString().split('T')[0]}">
    <button onclick="loadClassSheet()">Load Class</button>
    <div id="classSheet"></div>
    <button onclick="submitAttendance()">Mark Attendance</button>
    <p id="attendanceStatus"></p>
  `;
  loadClassSheet();
}

async function loadClassSheet() {
  const date = document.getElementById("attendanceDate").value;
  const res = await fetch(`${API_BASE}/attendance/class-sheet?class_date=${date}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) {
    document.getElementById("attendanceStatus").innerText = data.detail || "Error";
    return;
  }
  let html = `<table><tr><th>Student</th><th>Status</th><th>Select</th></tr>`;
  data.students.forEach(s => {
    html += `<tr>
      <td>${s.student_name}</td>
      <td>${s.current_status || 'Unmarked'}</td>
      <td>
        <select id="status_${s.student_id}">
          <option value="Present">Present</option>
          <option value="Absent">Absent</option>
          <option value="Late">Late</option>
        </select>
      </td>
    </tr>`;
  });
  html += `</table>`;
  document.getElementById("classSheet").innerHTML = html;
}

async function submitAttendance() {
  const date = document.getElementById("attendanceDate").value;
  const entries = [];
  const selects = document.querySelectorAll("select[id^='status_']");
  selects.forEach(sel => {
    const studentId = parseInt(sel.id.split('_')[1]);
    entries.push({ student_id: studentId, status: sel.value, notes: "" });
  });
  const res = await fetch(`${API_BASE}/attendance/bulk?class_date=${date}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(entries)
  });
  if (res.ok) {
    document.getElementById("attendanceStatus").innerText = "Attendance saved!";
    loadClassSheet();
  } else {
    const err = await res.json();
    document.getElementById("attendanceStatus").innerText = err.detail || "Error";
  }
}

// ==================== TRANSPORT MANAGEMENT ====================
async function loadTransportView(container) {
  container.innerHTML = `
    <h2>Transport Management</h2>
    <button onclick="showRouteForm()">Add Route</button>
    <div id="route-list"></div>
    <div id="route-form" style="display:none;"></div>
  `;
  loadRoutes();
}

async function loadRoutes() {
  const res = await fetch(`${API_BASE}/routes/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const routes = await res.json();
  let html = `<table><tr><th>Name</th><th>Two-Way</th><th>Morning</th><th>Evening</th><th>Daily</th></tr>`;
  routes.forEach(r => {
    html += `<tr>
      <td>${r.name}</td>
      <td>${r.two_way_price}</td>
      <td>${r.one_way_morning_price}</td>
      <td>${r.one_way_evening_price}</td>
      <td>${r.daily_rate}</td>
    </tr>`;
  });
  html += `</table>`;
  document.getElementById("route-list").innerHTML = html;
  const routeSelect = document.getElementById("s_route");
  if (routeSelect) {
    routeSelect.innerHTML = routes.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  }
}

function showRouteForm() {
  const form = document.getElementById("route-form");
  form.style.display = "block";
  form.innerHTML = `
    <h3>Add Route</h3>
    <input id="route_name" placeholder="Route Name">
    <input id="route_two_way" placeholder="Two-Way Price">
    <input id="route_morning" placeholder="Morning Only Price">
    <input id="route_evening" placeholder="Evening Only Price">
    <input id="route_daily" placeholder="Daily Rate">
    <button onclick="addRoute()">Save</button>
  `;
}

async function addRoute() {
  const payload = {
    name: document.getElementById("route_name").value,
    two_way_price: parseFloat(document.getElementById("route_two_way").value),
    one_way_morning_price: parseFloat(document.getElementById("route_morning").value),
    one_way_evening_price: parseFloat(document.getElementById("route_evening").value),
    daily_rate: parseFloat(document.getElementById("route_daily").value)
  };
  const res = await fetch(`${API_BASE}/routes/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    alert("Route added!");
    loadTransportView(document.getElementById("main-content"));
  } else {
    alert("Error adding route");
  }
}

function toggleTransport() {
  const section = document.getElementById("transport-section");
  section.style.display = document.getElementById("s_uses_transport").checked ? "block" : "none";
}

// ==================== ACADEMIC YEAR SETUP ====================
async function loadAcademicsView(container) {
  container.innerHTML = `
    <h2>Academic Year Setup</h2>
    <button onclick="showAcademicYearForm()">Create Academic Year</button>
    <div id="academic-year-list"></div>
    <div id="academic-year-form" style="display:none;"></div>
  `;
  loadAcademicYears();
}

async function loadAcademicYears() {
  const res = await fetch(`${API_BASE}/academic-years/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const years = await res.json();
  let html = `<table><tr><th>Name</th><th>Start</th><th>End</th><th>Terms</th></tr>`;
  years.forEach(y => {
    html += `<tr>
      <td>${y.name}</td>
      <td>${y.start_date}</td>
      <td>${y.end_date}</td>
      <td><button onclick="loadTerms(${y.id})">View Terms</button></td>
    </tr>`;
  });
  html += `</table><div id="terms-view"></div>`;
  document.getElementById("academic-year-list").innerHTML = html;
}

function showAcademicYearForm() {
  const form = document.getElementById("academic-year-form");
  form.style.display = "block";
  form.innerHTML = `
    <h3>New Academic Year</h3>
    <input id="ay_name" placeholder="Name (e.g. 2026-2027)">
    <input id="ay_start" type="date" value="2026-09-01">
    <input id="ay_end" type="date" value="2027-07-31">
    <button onclick="createAcademicYear()">Save</button>
  `;
}

async function createAcademicYear() {
  const payload = {
    name: document.getElementById("ay_name").value,
    start_date: document.getElementById("ay_start").value,
    end_date: document.getElementById("ay_end").value
  };
  const res = await fetch(`${API_BASE}/academic-years/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    alert("Academic year created with terms!");
    loadAcademicsView(document.getElementById("main-content"));
  } else {
    alert("Error");
  }
}

async function loadTerms(yearId) {
  const res = await fetch(`${API_BASE}/academic-years/${yearId}/terms`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const terms = await res.json();
  let html = `<h4>Terms</h4><table><tr><th>Name</th><th>Auto Start</th><th>Auto End</th><th>Actual Start</th><th>Actual End</th></tr>`;
  terms.forEach(t => {
    html += `<tr><td>${t.name}</td><td>${t.automatic_start}</td><td>${t.automatic_end}</td><td>${t.actual_start || '-'}</td><td>${t.actual_end || '-'}</td></tr>`;
  });
  html += `</table>`;
  document.getElementById("terms-view").innerHTML = html;
}

// ==================== FINANCE – REPORT BACK ====================
async function loadReportBackView(container) {
  container.innerHTML = `
    <h2>Report Back Students (New Term)</h2>
    <select id="rb_term" onchange="loadReportBackList()">
      <option value="">Select Term</option>
    </select>
    <div id="report-back-list"></div>
    <button onclick="submitReportBack()">Save Reported Students</button>
    <p id="rb-status"></p>
  `;
  // Load terms into dropdown
  const res = await fetch(`${API_BASE}/terms/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const terms = await res.json();
  document.getElementById("rb_term").innerHTML = '<option value="">Select Term</option>' +
    terms.map(t => `<option value="${t.id}">${t.name} (${t.automatic_start} - ${t.automatic_end})</option>`).join('');
}

async function loadReportBackList() {
  const termId = document.getElementById("rb_term").value;
  if (!termId) return;
  const res = await fetch(`${API_BASE}/students/?active=true`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const students = await res.json();
  // For each student, check if they are already reported back for this term
  let html = `<table><tr><th>Select</th><th>Name</th><th>Class</th><th>Already Reported?</th></tr>`;
  students.forEach(s => {
    html += `<tr>
      <td><input type="checkbox" class="rb-checkbox" value="${s.id}"></td>
      <td>${s.first_name} ${s.last_name}</td>
      <td>${s.class_name || s.level || ''}</td>
      <td id="rb-status-${s.id}">Unknown</td>
    </tr>`;
  });
  html += `</table>`;
  document.getElementById("report-back-list").innerHTML = html;
  // Now check each student's reported-back status
  students.forEach(async s => {
    const statusRes = await fetch(`${API_BASE}/finance/is-reported-back/${s.id}?term_id=${termId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (statusRes.ok) {
      const data = await statusRes.json();
      document.getElementById(`rb-status-${s.id}`).innerText = data.reported ? 'Yes' : 'No';
    }
  });
}

async function submitReportBack() {
  const termId = document.getElementById("rb_term").value;
  const checkboxes = document.querySelectorAll(".rb-checkbox:checked");
  const studentIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const res = await fetch(`${API_BASE}/finance/report-back-bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ term_id: termId, student_ids: studentIds })
  });
  if (res.ok) {
    document.getElementById("rb-status").innerText = "Students reported back successfully!";
    loadReportBackList();
  } else {
    const err = await res.json();
    document.getElementById("rb-status").innerText = err.detail || "Error";
  }
}

// ==================== FINANCE – VIEW INVOICES ====================
async function loadViewInvoicesView(container) {
  container.innerHTML = `
    <h2>Student Invoices</h2>
    <input id="invoice_search" placeholder="Search by student name or ID" onkeyup="filterInvoices()">
    <div id="invoice-list"></div>
  `;
  loadInvoices();
}

async function loadInvoices() {
  const res = await fetch(`${API_BASE}/finance/invoices`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const invoices = await res.json();
  window.allInvoices = invoices;  // store for filtering
  renderInvoices(invoices);
}

function renderInvoices(invoices) {
  const canEdit = currentUser?.clearance_level <= 3;
  let html = `<table>
    <tr><th>Invoice #</th><th>Student</th><th>Term</th><th>Total</th><th>Paid</th><th>Balance</th><th>Actions</th></tr>`;
  invoices.forEach(inv => {
    html += `<tr>
      <td>${inv.id}</td>
      <td>${inv.student_name} (${inv.student_id})</td>
      <td>${inv.term_name || inv.term_id}</td>
      <td>${inv.total_amount}</td>
      <td>${inv.total_paid}</td>
      <td>${inv.balance}</td>
      <td>
        <button onclick="viewInvoice(${inv.id})">View</button>
        ${canEdit ? `<button onclick="editInvoice(${inv.id})">Edit</button>` : ''}
        <button onclick="printInvoice(${inv.id})">Print PDF</button>
      </td>
    </tr>`;
  });
  html += `</table>`;
  document.getElementById("invoice-list").innerHTML = html;
}

function filterInvoices() {
  const query = document.getElementById("invoice_search").value.toLowerCase();
  const filtered = window.allInvoices.filter(inv =>
    inv.student_name.toLowerCase().includes(query) ||
    inv.student_id.toLowerCase().includes(query)
  );
  renderInvoices(filtered);
}

async function viewInvoice(invoiceId) {
  const res = await fetch(`${API_BASE}/finance/invoices/${invoiceId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const inv = await res.json();
  alert(JSON.stringify(inv, null, 2));  // Simple display; later you can replace with a modal
}

function editInvoice(invoiceId) {
  const newTotal = prompt("Enter new total amount:");
  if (newTotal) {
    fetch(`${API_BASE}/finance/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ total_amount: newTotal })
    }).then(res => {
      if (res.ok) {
        alert("Invoice updated!");
        loadInvoices();
      } else {
        alert("Error updating invoice");
      }
    });
  }
}

function printInvoice(invoiceId) {
  window.open(`${API_BASE}/finance/invoices/${invoiceId}/pdf`, '_blank');
}

// ==================== FINANCE – CREATE INVOICE ====================
async function loadCreateInvoiceView(container) {
  container.innerHTML = `
    <h2>Create Invoice for New Student</h2>
    <select id="ci_student" onchange="loadStudentFeeDetails()">
      <option value="">Select Student</option>
    </select>
    <div id="ci-student-info"></div>
    <div id="ci-fee-items"></div>
    <button onclick="createInvoice()">Generate Invoice</button>
    <p id="ci-status"></p>
  `;
  // Load all active students
  const res = await fetch(`${API_BASE}/students/?active=true`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const students = await res.json();
  document.getElementById("ci_student").innerHTML = '<option value="">Select Student</option>' +
    students.map(s => `<option value="${s.id}">${s.first_name} ${s.last_name} (${s.student_id})</option>`).join('');
}

async function loadStudentFeeDetails() {
  const studentId = document.getElementById("ci_student").value;
  if (!studentId) return;
  // Fetch student info (level, class, transport, clubs)
  const res = await fetch(`${API_BASE}/students/${studentId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const student = await res.json();
  document.getElementById("ci-student-info").innerHTML = `
    <p><strong>Name:</strong> ${student.first_name} ${student.last_name}</p>
    <p><strong>Level:</strong> ${student.level_name || student.level}</p>
    <p><strong>Class:</strong> ${student.class_name || ''}</p>
    <p><strong>Transport:</strong> ${student.transport_route || 'None'}</p>
  `;
  // Load applicable fee items based on level
  const feesRes = await fetch(`${API_BASE}/finance/fee-schedules?level_id=${student.level_id}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const feeSchedules = await feesRes.json();
  let html = `<h4>Applicable Fees</h4><table><tr><th>Fee Item</th><th>Amount</th><th>Category</th><th>Include</th></tr>`;
  feeSchedules.forEach(fs => {
    html += `<tr>
      <td>${fs.fee_item_name}</td>
      <td>${fs.amount}</td>
      <td>${fs.category}</td>
      <td><input type="checkbox" class="ci-fee-check" value="${fs.id}" data-amount="${fs.amount}" checked></td>
    </tr>`;
  });
  html += `</table>`;
  document.getElementById("ci-fee-items").innerHTML = html;
}

async function createInvoice() {
  const studentId = document.getElementById("ci_student").value;
  const termId = prompt("Enter Term ID:");
  const selectedFees = Array.from(document.querySelectorAll(".ci-fee-check:checked")).map(cb => ({
    fee_schedule_id: parseInt(cb.value),
    amount: parseFloat(cb.dataset.amount)
  }));
  const payload = {
    student_id: parseInt(studentId),
    term_id: parseInt(termId),
    fee_items: selectedFees
  };
  const res = await fetch(`${API_BASE}/finance/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    document.getElementById("ci-status").innerText = "Invoice created!";
  } else {
    const err = await res.json();
    document.getElementById("ci-status").innerText = err.detail || "Error";
  }
}

// ==================== REPORTS (kept but hidden from sidebar) ====================
async function loadReportsView(container) {
  container.innerHTML = `
    <h2>Reports</h2>
    <button onclick="loadDailyCollections()">Daily Collections</button>
    <button onclick="loadDebtors()">Debtor List</button>
    <div id="report-output"></div>
  `;
}

async function loadDailyCollections() {
  const date = prompt("Enter date (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
  const res = await fetch(`${API_BASE}/finance/reports/daily-collections?date=${date}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  document.getElementById("report-output").innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

async function loadDebtors() {
  const res = await fetch(`${API_BASE}/finance/reports/debtors`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  document.getElementById("report-output").innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

// ==================== ADMINISTRATION (SUPER ADMIN ONLY) ====================
async function loadAdministrationView(container) {
  if (currentUser?.clearance_level !== 1) {
    container.innerHTML = "<p>Access denied. Only Super Admin can access this section.</p>";
    return;
  }
  container.innerHTML = `
    <h2>Staff Management</h2>
    <button onclick="showStaffForm()">Add New Staff</button>
    <div id="staff-list"></div>
    <div id="staff-form" style="display:none;"></div>
  `;
  loadStaffList();
}

async function loadStaffList() {
  const res = await fetch(`${API_BASE}/team/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const staff = await res.json();
  let html = `<table><tr><th>Name</th><th>Email</th><th>Role</th><th>Clearance</th></tr>`;
  staff.forEach(member => {
    html += `<tr>
      <td>${member.first_name} ${member.last_name}</td>
      <td>${member.email}</td>
      <td>${member.role}</td>
      <td>${member.clearance_level}</td>
    </tr>`;
  });
  html += `</table>`;
  document.getElementById("staff-list").innerHTML = html;
}

function showStaffForm() {
  const form = document.getElementById("staff-form");
  form.style.display = "block";
  form.innerHTML = `
    <h3>Create Staff Member</h3>
    <input id="staff_first_name" placeholder="First Name">
    <input id="staff_last_name" placeholder="Last Name">
    <input id="staff_email" type="email" placeholder="Email">
    <input id="staff_password" type="password" placeholder="Password">
    <select id="staff_role">
      <option value="super_admin">Super Admin</option>
      <option value="manager">Manager</option>
      <option value="teacher">Teacher</option>
      <option value="kitchen">Kitchen</option>
      <option value="utility">Utility</option>
    </select>
    <select id="staff_clearance">
      <option value="1">Level 1 (Highest)</option>
      <option value="2">Level 2</option>
      <option value="3">Level 3</option>
      <option value="4" selected>Level 4</option>
      <option value="5">Level 5 (Lowest)</option>
    </select>
    <input id="staff_location" placeholder="Location">
    <button onclick="createStaff()">Save Staff</button>
  `;
}

async function createStaff() {
  const payload = {
    first_name: document.getElementById("staff_first_name").value,
    last_name: document.getElementById("staff_last_name").value,
    email: document.getElementById("staff_email").value,
    password: document.getElementById("staff_password").value,
    role: document.getElementById("staff_role").value,
    clearance_level: parseInt(document.getElementById("staff_clearance").value),
    location: document.getElementById("staff_location").value,
    is_active: true
  };
  const res = await fetch(`${API_BASE}/team/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    alert("Staff created!");
    loadAdministrationView(document.getElementById("main-content"));
  } else {
    const err = await res.json();
    alert("Error: " + JSON.stringify(err.detail));
  }
}

// ==================== UTILS ====================
async function loadClasses() {
  const levelId = document.getElementById("s_level").value;
  const res = await fetch(`${API_BASE}/classes/?level_id=${levelId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const classes = await res.json();
  document.getElementById("s_class").innerHTML = classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}