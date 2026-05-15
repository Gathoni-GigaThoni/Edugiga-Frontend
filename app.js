// app.js

const API_BASE = "https://edu-giga-school-management-system-1.onrender.com";
let token = "";

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
    showDashboard();
  } catch (err) {
    document.getElementById("error").innerText = err.message;
  }
}

function logout() {
  token = "";
  location.reload();
}

// ==================== DASHBOARD ====================
function showDashboard() {
  document.body.innerHTML = `
    <div class="container">
      <nav class="sidebar">
        <h2>Seven Oaks</h2>
        <ul>
          <li onclick="loadView('students')">Students</li>
          <li onclick="loadView('attendance')">Attendance</li>
          <li onclick="loadView('transport')">Transport</li>
          <li onclick="loadView('academics')">Academic Setup</li>
          <li onclick="loadView('fees')">Fees</li>
          <li onclick="loadView('reports')">Reports</li>
          <li onclick="logout()">Logout</li>
        </ul>
      </nav>
      <main id="main-content">
        <h2>Welcome to Seven Oaks Management System</h2>
        <p>Select a module from the sidebar.</p>
      </main>
    </div>
  `;
}

// ==================== VIEW LOADER ====================
async function loadView(view) {
  const main = document.getElementById("main-content");
  switch(view) {
    case 'students': await loadStudentsView(main); break;
    case 'attendance': await loadAttendanceView(main); break;
    case 'transport': await loadTransportView(main); break;
    case 'academics': await loadAcademicsView(main); break;
    case 'fees': await loadFeesView(main); break;
    case 'reports': await loadReportsView(main); break;
  }
}

// ==================== STUDENTS ====================
async function loadStudentsView(container) {
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
  // Load classes based on level selection
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
  // Add second parent if filled
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

// ==================== ATTENDANCE ====================
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

// ==================== TRANSPORT ====================
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
  // Also populate route dropdown in student form if exists
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

// ==================== ACADEMICS ====================
async function loadAcademicsView(container) {
  container.innerHTML = `
    <h2>Academic Setup</h2>
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

// ==================== FEES ====================
async function loadFeesView(container) {
  container.innerHTML = `
    <h2>Fee Management</h2>
    <button onclick="triggerTermlyFees()">Trigger Termly Fees</button>
    <button onclick="triggerYearlyFees()">Trigger Yearly Fees</button>
    <hr>
    <h3>Record Payment</h3>
    <select id="payment_student"></select>
    <input id="payment_amount" placeholder="Amount">
    <select id="payment_method">
      <option value="CASH">Cash</option>
      <option value="BANK_TRANSFER">Bank Transfer</option>
      <option value="MPESA">M-Pesa</option>
    </select>
    <button onclick="recordPayment()">Record Payment</button>
    <hr>
    <h3>Student Balance</h3>
    <input id="balance_student_id" placeholder="Student ID">
    <input id="balance_term_id" placeholder="Term ID">
    <button onclick="checkBalance()">Check Balance</button>
    <div id="balance-result"></div>
  `;
  // Load student list for payment dropdown
  const res = await fetch(`${API_BASE}/students/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const students = await res.json();
  document.getElementById("payment_student").innerHTML = students.map(s => `<option value="${s.id}">${s.first_name} ${s.last_name}</option>`).join('');
}

async function triggerTermlyFees() {
  const termId = prompt("Enter Term ID:");
  const res = await fetch(`${API_BASE}/finance/trigger-termly-fees?term_id=${termId}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) alert("Termly fees posted!");
  else alert("Error");
}

async function triggerYearlyFees() {
  const termId = prompt("Enter Term ID (should be Term 1):");
  const res = await fetch(`${API_BASE}/finance/trigger-yearly-fees?term_id=${termId}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) alert("Yearly fees posted!");
  else alert("Error");
}

async function recordPayment() {
  const payload = {
    student_id: parseInt(document.getElementById("payment_student").value),
    amount: document.getElementById("payment_amount").value,
    payment_method: document.getElementById("payment_method").value,
    payment_date: new Date().toISOString().split('T')[0],
    allocations: []  // Can be enhanced later
  };
  const res = await fetch(`${API_BASE}/finance/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    alert("Payment recorded!");
  } else {
    alert("Error recording payment");
  }
}

async function checkBalance() {
  const studentId = document.getElementById("balance_student_id").value;
  const termId = document.getElementById("balance_term_id").value;
  const res = await fetch(`${API_BASE}/finance/balance/${studentId}?term_id=${termId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  document.getElementById("balance-result").innerHTML = `
    <p>Total Fees: ${data.total_fees}</p>
    <p>Total Paid: ${data.total_paid}</p>
    <p>Balance: ${data.balance}</p>
  `;
}

// ==================== REPORTS ====================
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

// ==================== UTILS ====================
async function loadClasses() {
  const levelId = document.getElementById("s_level").value;
  const res = await fetch(`${API_BASE}/classes/?level_id=${levelId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const classes = await res.json();
  document.getElementById("s_class").innerHTML = classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}