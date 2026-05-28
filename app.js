// app.js

const API_BASE = "https://edu-giga-school-management-system-1.onrender.com";
let token = "";
let currentUser = null;   // decoded JWT payload after login

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
              <li onclick="loadView('attendance-register')">Attendance Register</li>
              <li onclick="loadView('academic-year-setup')">Academic Year Setup</li>
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
          <li onclick="loadView('human-resource')">Human Resource</li>
          <li onclick="loadView('payroll')">Payroll</li>
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
  switch(view) {
    // Student Management sub-modules
    case 'students-list': await loadStudentsListView(main); break;
    case 'student-search': await loadStudentSearchView(main); break;
    case 'student-reporting': await loadStudentReportingView(main); break;
    // Student Academics
    case 'attendance-register': await loadAttendanceView(main); break;
    case 'academic-year-setup': await loadAcademicsView(main); break;
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
    // Administration
    case 'administration': await loadAdministrationView(main); break;
    case 'user-management': await loadUserManagementView(main); break;
    case 'admin-roles': loadRolesListingView(main); break;
    case 'admin-setup': showPlaceholder(main, 'Setup'); break;
    // Empty modules
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

function showPlaceholder(container, title) {
  container.innerHTML = `<h2>${title}</h2><p>This module is under construction.</p>`;
}

function toggleDropdown(id) {
  const menu = document.getElementById(id);
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// ==================== STUDENT MANAGEMENT – STUDENTS LIST ====================
let currentStudentPage = 1;
const STUDENTS_PER_PAGE = 7;
let allStudentsData = [];
let filteredStudentsData = [];

async function loadStudentsListView(container) {
  container.innerHTML = `
    <h2>Students</h2>
    <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
      <button onclick="showAddStudentForm()">Add</button>
    </div>
    <div style="display:flex; gap:10px; margin-bottom:15px;">
      <input id="student-search-input" placeholder="Search..." onkeyup="handleStudentSearch()" style="flex:1;">
      <button onclick="showFilterModal()">Filter</button>
    </div>
    <div id="student-table-container"></div>
    <div id="student-pagination"></div>
    <div id="student-form-modal" class="modal" style="display:none;"></div>
    <div id="student-profile-modal" class="modal" style="display:none;"></div>
    <div id="filter-modal" class="modal" style="display:none;"></div>
  `;
  await refreshStudentTable();
}

async function refreshStudentTable() {
  const res = await fetch(`${API_BASE}/students/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) { document.getElementById("student-table-container").innerHTML = "<p>Error loading students.</p>"; return; }
  const students = await res.json();
  allStudentsData = students;
  filteredStudentsData = students;
  renderStudentPage(1);
}

function renderStudentPage(page) {
  currentStudentPage = page;
  const start = (page - 1) * STUDENTS_PER_PAGE;
  const end = start + STUDENTS_PER_PAGE;
  const pageData = filteredStudentsData.slice(start, end);
  
  let html = `<table><thead><tr>
    <th>Student ID</th><th>Student Name</th><th>Gender</th><th>Cohort</th><th>Class</th><th>Session</th><th>Stream</th><th>Sports House</th><th>Academic Status</th><th>Personnel</th><th>Action</th>
  </tr></thead><tbody>`;
  
  pageData.forEach(s => {
    html += `<tr>
      <td>${s.student_id}</td>
      <td>${s.first_name} ${s.last_name}</td>
      <td>${s.gender || ''}</td>
      <td>${s.cohort || ''}</td>
      <td>${s.class_name || ''}</td>
      <td>${s.session || ''}</td>
      <td>${s.stream || ''}</td>
      <td>${s.sports_house || ''}</td>
      <td>${s.is_active ? 'Active' : 'Inactive'}</td>
      <td>${s.created_by || ''}</td>
      <td>
        <div class="dropdown">
          <button onclick="toggleActionDropdown(event, ${s.id})">...</button>
          <div id="action-dropdown-${s.id}" class="dropdown-menu" style="display:none;">
            ${currentUser?.clearance_level <= 3 ? `<a href="#" onclick="openStudentProfile(${s.id}, 'edit')">Edit</a>` : ''}
            <a href="#" onclick="openStudentProfile(${s.id}, 'view')">View Detail</a>
          </div>
        </div>
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById("student-table-container").innerHTML = html;
  
  const totalPages = Math.ceil(filteredStudentsData.length / STUDENTS_PER_PAGE);
  let pagHtml = '';
  for (let i = 1; i <= totalPages; i++) {
    pagHtml += `<button onclick="renderStudentPage(${i})" ${i === currentStudentPage ? 'disabled' : ''}>${i}</button>`;
  }
  document.getElementById("student-pagination").innerHTML = pagHtml;
}

function handleStudentSearch() {
  const query = document.getElementById("student-search-input").value.toLowerCase();
  filteredStudentsData = allStudentsData.filter(s => 
    (s.first_name + ' ' + s.last_name).toLowerCase().includes(query) ||
    s.student_id.toLowerCase().includes(query)
  );
  renderStudentPage(1);
}

function showFilterModal() {
  const modal = document.getElementById("filter-modal");
  modal.style.display = "block";
  modal.innerHTML = `
    <div class="modal-content">
      <span class="close" onclick="closeModal('filter-modal')">&times;</span>
      <h3>Filter Students</h3>
      <label>Level Enrolled:</label>
      <select id="filter_level"><option value="">All</option><option value="Acorn">Acorn</option><option value="Willow">Willow</option><option value="Maple">Maple</option><option value="Oak">Oak</option></select>
      <label>Class:</label>
      <input id="filter_class" placeholder="e.g. Maple 26">
      <label>Gender:</label>
      <select id="filter_gender"><option value="">All</option><option value="Male">Male</option><option value="Female">Female</option></select>
      <label>Clubs Enrolled:</label>
      <input id="filter_club" placeholder="Club name">
      <label>Nationality:</label>
      <input id="filter_nationality" placeholder="Nationality">
      <button onclick="applyFilters()">Apply</button>
    </div>
  `;
}

function applyFilters() {
  const level = document.getElementById("filter_level").value;
  const cls = document.getElementById("filter_class").value.toLowerCase();
  const gender = document.getElementById("filter_gender").value;
  const club = document.getElementById("filter_club").value.toLowerCase();
  const nationality = document.getElementById("filter_nationality").value.toLowerCase();
  
  filteredStudentsData = allStudentsData.filter(s => {
    if (level && s.level !== level) return false;
    if (cls && !(s.class_name || '').toLowerCase().includes(cls)) return false;
    if (gender && s.gender !== gender) return false;
    if (club && !(s.clubs || '').toLowerCase().includes(club)) return false;
    if (nationality && !(s.nationality || '').toLowerCase().includes(nationality)) return false;
    return true;
  });
  renderStudentPage(1);
  closeModal('filter-modal');
}

function toggleActionDropdown(event, studentId) {
  event.stopPropagation();
  const dropdown = document.getElementById(`action-dropdown-${studentId}`);
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="action-dropdown-"]').forEach(d => d.style.display = 'none');
});

// ==================== ADD STUDENT FORM ====================
function showAddStudentForm() {
  const modal = document.getElementById("student-form-modal");
  modal.style.display = "block";
  modal.innerHTML = `
    <div class="modal-content" style="max-width:700px;">
      <span class="close" onclick="closeModal('student-form-modal')">&times;</span>
      <h3>Register New Student</h3>
      <input id="s_first_name" placeholder="First Name">
      <input id="s_last_name" placeholder="Last Name">
      <input id="s_dob" type="date" placeholder="Date of Birth">
      <input id="s_joining_date" type="date" placeholder="Joining Date">
      <select id="s_gender"><option value="">Gender</option><option value="Male">Male</option><option value="Female">Female</option></select>
      <input id="s_nationality" placeholder="Nationality">
      <select id="s_level">
        <option value="">Select Level</option>
        <option value="Acorn">Acorn (Baby Class)</option>
        <option value="Willow">Willow (PlayGroup)</option>
        <option value="Maple">Maple (PP1)</option>
        <option value="Oak">Oak (PP2)</option>
      </select>
      <select id="s_class"><option value="">Select Class</option></select>
      <select id="s_stream"><option value="">Stream</option><option value="A">A</option><option value="B">B</option></select>
      <label>Uses Transport?</label>
      <input type="checkbox" id="s_uses_transport" onchange="toggleTransportSection()">
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
      <textarea id="s_insurance" placeholder="Health Insurance"></textarea>
      <button onclick="registerStudent()">Save Student</button>
    </div>
  `;
  document.getElementById("s_level").onchange = loadClassesForForm;
  loadRoutesForForm();
}

function toggleTransportSection() {
  const section = document.getElementById("transport-section");
  section.style.display = document.getElementById("s_uses_transport").checked ? "block" : "none";
}

async function loadClassesForForm() {
  const level = document.getElementById("s_level").value;
  const res = await fetch(`${API_BASE}/classes/?level=${level}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) {
    const classes = await res.json();
    document.getElementById("s_class").innerHTML = '<option value="">Select Class</option>' +
      classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
}

async function loadRoutesForForm() {
  const res = await fetch(`${API_BASE}/routes/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) {
    const routes = await res.json();
    document.getElementById("s_route").innerHTML = '<option value="">Select Route</option>' +
      routes.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  }
}

async function registerStudent() {
  const payload = {
    first_name: document.getElementById("s_first_name").value,
    last_name: document.getElementById("s_last_name").value,
    date_of_birth: document.getElementById("s_dob").value,
    joining_date: document.getElementById("s_joining_date").value,
    gender: document.getElementById("s_gender").value,
    nationality: document.getElementById("s_nationality").value,
    level: document.getElementById("s_level").value,
    class_id: parseInt(document.getElementById("s_class").value) || null,
    stream: document.getElementById("s_stream").value,
    uses_transport: document.getElementById("s_uses_transport").checked,
    route_id: document.getElementById("s_uses_transport").checked ? parseInt(document.getElementById("s_route").value) : null,
    direction: document.getElementById("s_uses_transport").checked ? document.getElementById("s_direction").value : null,
    parents: [
      {
        full_name: document.getElementById("s_parent1_name").value,
        email: document.getElementById("s_parent1_email").value,
        phone: document.getElementById("s_parent1_phone").value,
        relationship: "MOTHER",
        is_primary: true
      }
    ],
    medical: {
      allergies: document.getElementById("s_allergies").value,
      chronic_symptoms: document.getElementById("s_chronic").value,
      health_insurance: document.getElementById("s_insurance").value
    }
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
  const res = await fetch(`${API_BASE}/students/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    alert("Student registered!");
    closeModal('student-form-modal');
    refreshStudentTable();
  } else {
    const err = await res.json();
    alert("Error: " + JSON.stringify(err.detail));
  }
}

// ==================== FULL STUDENT PROFILE (EDIT / VIEW) ====================
async function openStudentProfile(studentId, mode) {
  const res = await fetch(`${API_BASE}/students/${studentId}/full-profile`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) { alert("Could not load profile."); return; }
  const data = await res.json();
  const canEdit = currentUser?.clearance_level <= 3 && mode === 'edit';
  
  const modal = document.getElementById("student-profile-modal");
  modal.style.display = "block";
  modal.innerHTML = `
    <div class="modal-content" style="max-width:900px; max-height:80vh; overflow-y:auto;">
      <span class="close" onclick="closeModal('student-profile-modal')">&times;</span>
      <h2>${data.first_name} ${data.last_name} ${canEdit ? '(Editing)' : '(View Only)'}</h2>
      <div class="tab">
        <button class="tablinks active" onclick="openTab(event, 'personal-info')">Personal Information</button>
        <button class="tablinks" onclick="openTab(event, 'academic-info')">Academic Information</button>
        <button class="tablinks" onclick="openTab(event, 'previous-education')">Previous Education</button>
        <button class="tablinks" onclick="openTab(event, 'guardian-family')">Guardian/Family</button>
        <button class="tablinks" onclick="openTab(event, 'medical-info')">Medical Information</button>
        <button class="tablinks" onclick="openTab(event, 'documents')">Documents</button>
      </div>
      <div id="personal-info" class="tabcontent" style="display:block;">
        <p><strong>Student ID:</strong> ${data.student_id}</p>
        <p><strong>Full Name:</strong> ${data.first_name} ${data.last_name}</p>
        <p><strong>Birth Date:</strong> ${data.date_of_birth}</p>
        <p><strong>Joining Date:</strong> ${data.joining_date || ''}</p>
        <p><strong>Gender:</strong> ${data.gender || ''}</p>
        <p><strong>Transport:</strong> ${data.uses_transport ? 'Yes' : 'No'}</p>
        ${data.uses_transport ? `<p><strong>Route:</strong> ${data.transport_route || ''}</p><p><strong>Direction:</strong> ${data.direction || ''}</p>` : ''}
        <p><strong>Nationality:</strong> ${data.nationality || ''}</p>
      </div>
      <div id="academic-info" class="tabcontent" style="display:none;">
        <p><strong>Level:</strong> ${data.level || ''}</p>
        <p><strong>Session:</strong> ${data.session || ''}</p>
        <p><strong>Class:</strong> ${data.class_name || ''}</p>
        <p><strong>Clubs:</strong> ${(data.clubs || []).join(', ') || 'None'}</p>
        <h4>Academic Reports</h4>
        <div id="academic-reports">${(data.academic_reports || []).map(r => `<p>${r.date}: ${r.title}</p>`).join('') || 'No reports yet.'}</div>
      </div>
      <div id="previous-education" class="tabcontent" style="display:none;">
        ${data.previous_education ? `
          <p><strong>Previous School:</strong> ${data.previous_education.school_name}</p>
          <p><strong>Level Completed:</strong> ${data.previous_education.level_completed}</p>
        ` : '<p>This is the student\'s first school.</p>'}
      </div>
      <div id="guardian-family" class="tabcontent" style="display:none;">
        <h4>Parents/Guardians</h4>
        ${(data.parents || []).map(p => `
          <div style="border:1px solid #ddd; padding:10px; margin:5px 0;">
            <p><strong>Name:</strong> ${p.full_name}</p>
            <p><strong>Relationship:</strong> ${p.relationship}</p>
            <p><strong>Email:</strong> ${p.email}</p>
            <p><strong>Phone:</strong> ${p.phone}</p>
            <p><strong>Residence:</strong> ${p.address || ''}</p>
          </div>
        `).join('')}
        <h4>Siblings Enrolled</h4>
        ${(data.siblings || []).map(sib => `<p>${sib.full_name} - ${sib.student_id}</p>`).join('') || '<p>No siblings enrolled.</p>'}
      </div>
      <div id="medical-info" class="tabcontent" style="display:none;">
        <p><strong>Allergies:</strong> ${data.medical?.allergies || 'None'}</p>
        <p><strong>Chronic Symptoms:</strong> ${data.medical?.chronic_symptoms || 'None'}</p>
        <p><strong>Health Insurance:</strong> ${data.medical?.health_insurance || 'None'}</p>
        <h4>Incident Reports</h4>
        ${(data.incident_reports || []).map(inc => `
          <div style="border:1px solid #ddd; padding:10px; margin:5px 0;">
            <p><strong>Date:</strong> ${inc.date}</p>
            <p><strong>Homeroom Tutor:</strong> ${inc.homeroom_tutor}</p>
            <p><strong>Witness Teacher:</strong> ${inc.witness}</p>
            <p><strong>Report:</strong> ${inc.report}</p>
            <p><strong>Outcome:</strong> ${inc.outcome}</p>
          </div>
        `).join('') || '<p>No incidents reported.</p>'}
      </div>
      <div id="documents" class="tabcontent" style="display:none;">
        ${(data.documents || []).map(doc => `<p><a href="${doc.url}" target="_blank">${doc.name}</a></p>`).join('') || '<p>No documents uploaded.</p>'}
      </div>
      ${canEdit ? '<button onclick="saveStudentChanges(' + studentId + ')" style="margin-top:20px;">Save Changes</button>' : ''}
    </div>
  `;
}

function openTab(evt, tabName) {
  document.querySelectorAll(".tabcontent").forEach(tc => tc.style.display = "none");
  document.querySelectorAll(".tablinks").forEach(tl => tl.classList.remove("active"));
  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.classList.add("active");
}

// ==================== STUDENT SEARCH (GRID VIEW) ====================
async function loadStudentSearchView(container) {
  container.innerHTML = `<h2>Student Search</h2><div id="student-grid"></div>`;
  const res = await fetch(`${API_BASE}/students/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) { container.innerHTML += "<p>Error loading students.</p>"; return; }
  const students = await res.json();
  let html = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:15px;">';
  students.forEach(s => {
    html += `
      <div class="student-card" onclick="openStudentProfile(${s.id}, 'view')" style="border:1px solid #ddd; padding:15px; cursor:pointer; border-radius:8px;">
        <h4>${s.first_name} ${s.last_name}</h4>
        <p><strong>ID:</strong> ${s.student_id}</p>
        <p><strong>Gender:</strong> ${s.gender || ''}</p>
        <p><strong>Class:</strong> ${s.class_name || ''} ${s.session || ''} ${s.cohort || ''}</p>
        <p><strong>Parent Phone:</strong> ${s.parent_phone || ''}</p>
        <p><strong>Parent Email:</strong> ${s.parent_email || ''}</p>
        <p><a href="#" onclick="event.stopPropagation(); openFeeStatement(${s.id})" style="color:#0070f3;">Fee Statement</a></p>
      </div>
    `;
  });
  html += '</div>';
  document.getElementById("student-grid").innerHTML = html;
}

async function openFeeStatement(studentId) {
  const res = await fetch(`${API_BASE}/finance/statement/${studentId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (res.ok) {
    const data = await res.json();
    const w = window.open('', '_blank', 'width=600,height=400');
    w.document.write(`<pre>${JSON.stringify(data, null, 2)}</pre>`);
  } else {
    alert("Could not load fee statement.");
  }
}

// ==================== STUDENT REPORTING (BULK REPORT) ====================
async function loadStudentReportingView(container) {
  container.innerHTML = `
    <h2>Student Reporting</h2>
    <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
      <button onclick="showBulkReportModal()">Bulk Report</button>
    </div>
    <div id="reporting-table-container"></div>
    <div id="bulk-report-modal" class="modal" style="display:none;"></div>
  `;
  await loadReportingTable();
}

async function loadReportingTable() {
  const res = await fetch(`${API_BASE}/students/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) return;
  const students = await res.json();
  let html = `<table><thead><tr>
    <th>Student ID</th><th>Student Name</th><th>Gender</th><th>Cohort</th><th>Class</th><th>Session</th><th>Stream</th><th>Sports House</th><th>Academic Status</th><th>Personnel</th>
  </tr></thead><tbody>`;
  students.forEach(s => {
    html += `<tr>
      <td>${s.student_id}</td>
      <td>${s.first_name} ${s.last_name}</td>
      <td>${s.gender || ''}</td>
      <td>${s.cohort || ''}</td>
      <td>${s.class_name || ''}</td>
      <td>${s.session || ''}</td>
      <td>${s.stream || ''}</td>
      <td>${s.sports_house || ''}</td>
      <td>${s.is_active ? 'Active' : 'Inactive'}</td>
      <td>${s.created_by || ''}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById("reporting-table-container").innerHTML = html;
}

function showBulkReportModal() {
  const modal = document.getElementById("bulk-report-modal");
  modal.style.display = "block";
  modal.innerHTML = `
    <div class="modal-content">
      <span class="close" onclick="closeModal('bulk-report-modal')">&times;</span>
      <h3>Bulk Report Back</h3>
      <label>Class Code:</label>
      <input id="br_class" placeholder="e.g. Maple 26">
      <label>Cohort:</label>
      <input id="br_cohort" placeholder="e.g. Acorn Term 3 2025/2026">
      <button onclick="loadBulkReportStudents()">Load Students</button>
      <div id="br-student-list"></div>
      <button onclick="submitBulkReport()">Submit Report Back</button>
      <p id="br-status"></p>
    </div>
  `;
}

async function loadBulkReportStudents() {
  const cls = document.getElementById("br_class").value;
  const cohort = document.getElementById("br_cohort").value;
  const res = await fetch(`${API_BASE}/students/?class=${encodeURIComponent(cls)}&cohort=${encodeURIComponent(cohort)}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) { alert("Error loading students."); return; }
  const students = await res.json();
  let html = '<table><tr><th>Select</th><th>Student ID</th><th>Name</th></tr>';
  students.forEach(s => {
    html += `<tr>
      <td><input type="checkbox" class="br-checkbox" value="${s.id}" checked></td>
      <td>${s.student_id}</td>
      <td>${s.first_name} ${s.last_name}</td>
    </tr>`;
  });
  html += '</table>';
  document.getElementById("br-student-list").innerHTML = html;
}

async function submitBulkReport() {
  const checkboxes = document.querySelectorAll(".br-checkbox:checked");
  const studentIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const termId = prompt("Enter Term ID:");
  const res = await fetch(`${API_BASE}/finance/report-back-bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ term_id: parseInt(termId), student_ids: studentIds })
  });
  if (res.ok) {
    document.getElementById("br-status").innerText = "Report back submitted!";
  } else {
    document.getElementById("br-status").innerText = "Error submitting report.";
  }
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
  if (!res.ok) { document.getElementById("attendanceStatus").innerText = data.detail || "Error"; return; }
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
  document.querySelectorAll("select[id^='status_']").forEach(sel => {
    const studentId = parseInt(sel.id.split('_')[1]);
    entries.push({ student_id: studentId, status: sel.value, notes: "" });
  });
  const res = await fetch(`${API_BASE}/attendance/bulk?class_date=${date}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
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
  const res = await fetch(`${API_BASE}/routes/`, { headers: { "Authorization": `Bearer ${token}` } });
  const routes = await res.json();
  let html = `<table><tr><th>Name</th><th>Two-Way</th><th>Morning</th><th>Evening</th><th>Daily</th></tr>`;
  routes.forEach(r => {
    html += `<tr><td>${r.name}</td><td>${r.two_way_price}</td><td>${r.one_way_morning_price}</td><td>${r.one_way_evening_price}</td><td>${r.daily_rate}</td></tr>`;
  });
  html += `</table>`;
  document.getElementById("route-list").innerHTML = html;
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
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(payload)
  });
  if (res.ok) { alert("Route added!"); loadTransportView(document.getElementById("main-content")); }
  else { alert("Error adding route"); }
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
  const res = await fetch(`${API_BASE}/academic-years/`, { headers: { "Authorization": `Bearer ${token}` } });
  const years = await res.json();
  let html = `<table><tr><th>Name</th><th>Start</th><th>End</th><th>Terms</th></tr>`;
  years.forEach(y => {
    html += `<tr><td>${y.name}</td><td>${y.start_date}</td><td>${y.end_date}</td><td><button onclick="loadTerms(${y.id})">View Terms</button></td></tr>`;
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
  const payload = { name: document.getElementById("ay_name").value, start_date: document.getElementById("ay_start").value, end_date: document.getElementById("ay_end").value };
  const res = await fetch(`${API_BASE}/academic-years/`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(payload)
  });
  if (res.ok) { alert("Academic year created with terms!"); loadAcademicsView(document.getElementById("main-content")); }
  else { alert("Error"); }
}

async function loadTerms(yearId) {
  const res = await fetch(`${API_BASE}/academic-years/${yearId}/terms`, { headers: { "Authorization": `Bearer ${token}` } });
  const terms = await res.json();
  let html = `<h4>Terms</h4><table><tr><th>Name</th><th>Auto Start</th><th>Auto End</th><th>Actual Start</th><th>Actual End</th></tr>`;
  terms.forEach(t => {
    html += `<tr><td>${t.name}</td><td>${t.automatic_start}</td><td>${t.automatic_end}</td><td>${t.actual_start || '-'}</td><td>${t.actual_end || '-'}</td></tr>`;
  });
  html += `</table>`;
  document.getElementById("terms-view").innerHTML = html;
}

// ==================== FINANCE – STUDENT FEES STATUS ====================
async function loadStudentFeesStatusView(container) {
  container.innerHTML = `
    <h2>Student Fees Status</h2>
    <div id="fees-status-table-container"></div>
    <div id="fees-detail-modal" class="modal" style="display:none;"></div>
  `;
  await loadFeesStatusTable();
}

async function loadFeesStatusTable() {
  const res = await fetch(`${API_BASE}/students/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) { document.getElementById("fees-status-table-container").innerHTML = "<p>Error loading students.</p>"; return; }
  const students = await res.json();
  
  let html = `<table><thead><tr>
    <th>Student ID</th><th>Student Name</th><th>Class</th><th>Cohort</th><th>Reporting Status</th><th>Academic Status</th><th>Action</th>
  </tr></thead><tbody>`;
  
  students.forEach(s => {
    const reportedStatus = s.is_reported ? 'Reported' : 'Not Reported';
    const academicStatus = s.is_active ? 'Active' : 'Inactive';
    html += `<tr>
      <td>${s.student_id}</td>
      <td>${s.first_name} ${s.last_name}</td>
      <td>${s.class_name || ''}</td>
      <td>${s.cohort || ''}</td>
      <td>${reportedStatus}</td>
      <td>${academicStatus}</td>
      <td>
        <div class="dropdown">
          <button onclick="toggleActionDropdown(event, ${s.id})">...</button>
          <div id="action-dropdown-${s.id}" class="dropdown-menu" style="display:none;">
            <a href="#" onclick="openFeesDetail(${s.id})">View Detail</a>
          </div>
        </div>
      </td>
    </tr>`;
  });
  
  html += `</tbody></table>`;
  document.getElementById("fees-status-table-container").innerHTML = html;
}

async function openFeesDetail(studentId) {
  // Fetch student info
  const studentRes = await fetch(`${API_BASE}/students/${studentId}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!studentRes.ok) { alert("Could not load student."); return; }
  const student = await studentRes.json();
  
  const modal = document.getElementById("fees-detail-modal");
  modal.style.display = "block";
  modal.innerHTML = `
    <div class="modal-content" style="max-width:1000px; max-height:85vh; overflow-y:auto;">
      <span class="close" onclick="closeModal('fees-detail-modal')">&times;</span>
      <h2>Student Fees Detail</h2>
      
      <!-- Date Parameters -->
      <div style="display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;">
        <div>
          <label>Start Date:</label>
          <input type="date" id="fees-start-date">
        </div>
        <div>
          <label>End Date:</label>
          <input type="date" id="fees-end-date">
        </div>
        <div>
          <label>As At:</label>
          <input type="date" id="fees-as-at">
        </div>
      </div>
      <div style="margin-bottom:15px;">
        <button onclick="submitFeesDetailParams(${studentId})">Submit</button>
        <button onclick="clearFeesDetailParams()">Clear</button>
      </div>
      
      <!-- Student Info -->
      <div style="background:#f9f9f9; padding:15px; border-radius:8px; margin-bottom:20px;">
        <p><strong>Student's Name:</strong> ${student.first_name} ${student.last_name}</p>
        <p><strong>Student's ID:</strong> ${student.student_id}</p>
        <p><strong>Class:</strong> ${student.class_name || ''} ${student.session || ''}</p>
        <p><strong>Reporting Status:</strong> ${student.is_reported ? 'Reported' : 'Not Reported'}</p>
      </div>
      
      <!-- Transactions Table -->
      <div id="fees-transactions-container">
        <p>Loading transactions...</p>
      </div>
    </div>
  `;
  
  // Load transactions with default (current session) parameters
  await loadFeesTransactions(studentId);
}

async function submitFeesDetailParams(studentId) {
  await loadFeesTransactions(studentId);
}

function clearFeesDetailParams() {
  document.getElementById("fees-start-date").value = '';
  document.getElementById("fees-end-date").value = '';
  document.getElementById("fees-as-at").value = '';
}

async function loadFeesTransactions(studentId) {
  const startDate = document.getElementById("fees-start-date")?.value || '';
  const endDate = document.getElementById("fees-end-date")?.value || '';
  const asAt = document.getElementById("fees-as-at")?.value || '';
  
  let url = `${API_BASE}/finance/student/${studentId}/transactions?`;
  if (startDate) url += `start_date=${startDate}&`;
  if (endDate) url += `end_date=${endDate}&`;
  if (asAt) url += `as_at=${asAt}&`;
  
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  
  const container = document.getElementById("fees-transactions-container");
  
  if (!res.ok) {
    container.innerHTML = "<p>Error loading transactions.</p>";
    return;
  }
  
  const data = await res.json();
  const transactions = data.transactions || [];
  
  let totalDebit = 0;
  let totalCredit = 0;
  
  let html = `<table><thead><tr>
    <th>Date</th><th>Session</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th>
  </tr></thead><tbody>`;
  
  transactions.forEach(t => {
    totalDebit += parseFloat(t.debit || 0);
    totalCredit += parseFloat(t.credit || 0);
    html += `<tr>
      <td>${t.date || ''}</td>
      <td>${t.session || 'Current Session'}</td>
      <td>${t.description || ''}</td>
      <td>${t.debit ? parseFloat(t.debit).toLocaleString() : ''}</td>
      <td>${t.credit ? parseFloat(t.credit).toLocaleString() : ''}</td>
      <td>${t.balance !== undefined ? parseFloat(t.balance).toLocaleString() : ''}</td>
    </tr>`;
  });
  
  html += `</tbody><tfoot>
    <tr style="font-weight:bold; background:#e9e9e9;">
      <td colspan="3">Totals</td>
      <td>${totalDebit.toLocaleString()}</td>
      <td>${totalCredit.toLocaleString()}</td>
      <td></td>
    </tr>
  </tfoot></table>`;
  
  container.innerHTML = html;
}

// ==================== REPORTS (hidden from sidebar) ====================
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
  const res = await fetch(`${API_BASE}/finance/reports/daily-collections?date=${date}`, { headers: { "Authorization": `Bearer ${token}` } });
  const data = await res.json();
  document.getElementById("report-output").innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

async function loadDebtors() {
  const res = await fetch(`${API_BASE}/finance/reports/debtors`, { headers: { "Authorization": `Bearer ${token}` } });
  const data = await res.json();
  document.getElementById("report-output").innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

// ==================== ADMINISTRATION ====================
async function loadAdministrationView(container) {
  if (currentUser?.clearance_level !== 1) { container.innerHTML = "<p>Access denied.</p>"; return; }
  container.innerHTML = `
    <h2>Staff Management</h2>
    <button onclick="showStaffForm()">Add New Staff</button>
    <div id="staff-list"></div>
    <div id="staff-form" style="display:none;"></div>
  `;
  loadStaffList();
}

async function loadStaffList() {
  const res = await fetch(`${API_BASE}/team/`, { headers: { "Authorization": `Bearer ${token}` } });
  const staff = await res.json();
  let html = `<table><tr><th>Name</th><th>Email</th><th>Role</th><th>Clearance</th></tr>`;
  staff.forEach(m => { html += `<tr><td>${m.first_name} ${m.last_name}</td><td>${m.email}</td><td>${m.role}</td><td>${m.clearance_level}</td></tr>`; });
  html += `</table>`;
  document.getElementById("staff-list").innerHTML = html;
}

function showStaffForm() {
  const form = document.getElementById("staff-form"); form.style.display = "block";
  form.innerHTML = `
    <h3>Create Staff Member</h3>
    <input id="staff_first_name" placeholder="First Name"><input id="staff_last_name" placeholder="Last Name">
    <input id="staff_email" type="email" placeholder="Email"><input id="staff_password" type="password" placeholder="Password">
    <select id="staff_role">
      <option value="super_admin">Super Admin</option><option value="manager">Manager</option><option value="teacher">Teacher</option><option value="kitchen">Kitchen</option><option value="utility">Utility</option>
    </select>
    <select id="staff_clearance">
      <option value="1">Level 1</option><option value="2">Level 2</option><option value="3">Level 3</option><option value="4" selected>Level 4</option><option value="5">Level 5</option>
    </select>
    <input id="staff_location" placeholder="Location"><button onclick="createStaff()">Save Staff</button>
  `;
}

async function createStaff() {
  const payload = {
    first_name: document.getElementById("staff_first_name").value, last_name: document.getElementById("staff_last_name").value,
    email: document.getElementById("staff_email").value, password: document.getElementById("staff_password").value,
    role: document.getElementById("staff_role").value, clearance_level: parseInt(document.getElementById("staff_clearance").value),
    location: document.getElementById("staff_location").value, is_active: true
  };
  const res = await fetch(`${API_BASE}/team/`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(payload)
  });
  if (res.ok) { alert("Staff created!"); loadAdministrationView(document.getElementById("main-content")); }
  else { const err = await res.json(); alert("Error: " + JSON.stringify(err.detail)); }
}

// ==================== USER MANAGEMENT ====================
let umUsers = [];
let umFiltered = [];
let umCurrentPage = 1;
let umPerPage = 10;

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="um-dd-"]').forEach(d => d.style.display = 'none');
});

async function loadUserManagementView(container) {
  container.innerHTML = `<div class="um-page"><p>Loading...</p></div>`;
  const res = await fetch(`${API_BASE}/team/`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  umUsers = res.ok ? await res.json() : [];
  umFiltered = [...umUsers];
  umCurrentPage = 1;
  renderUmListPage(container);
}

function renderUmListPage(container) {
  container.innerHTML = `
    <div class="um-page">
      <div class="um-header-row">
        <h2 class="um-title">User Managment</h2>
        <div class="um-breadcrumb">Dashboard &rsaquo; Administration &rsaquo; User Managment &rsaquo; Listing</div>
      </div>
      <div class="um-controls-row">
        <div class="um-controls-left">
          Show <select id="um-per-page" onchange="changeUmPerPage(this.value)">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select> entries
          &nbsp;|&nbsp; Total <span id="um-total-count">0</span> entries
        </div>
        <div class="um-controls-right">
          <input id="um-search-input" placeholder="Search..." onkeyup="handleUmSearch()" class="um-search">
          <button class="um-filter-btn" onclick="showUmFilters()">Filters</button>
        </div>
      </div>
      <div id="um-table-container"></div>
    </div>
  `;
  const perPageSel = document.getElementById("um-per-page");
  if (perPageSel) perPageSel.value = String(umPerPage);
  renderUmTable();
}

function renderUmTable() {
  const totalEl = document.getElementById("um-total-count");
  if (totalEl) totalEl.textContent = umFiltered.length;

  const start = (umCurrentPage - 1) * umPerPage;
  const pageData = umFiltered.slice(start, start + umPerPage);

  let html = `<table class="um-table"><thead><tr>
    <th>EMP. CODE</th><th>NAME</th><th>EMAIL</th><th>PHONE NUMBER</th>
    <th>DESIGNATION</th><th>DEPARTMENT</th><th>STATUS</th><th>ROLE</th><th>ACTION</th>
  </tr></thead><tbody>`;

  if (pageData.length === 0) {
    html += `<tr><td colspan="9" class="um-empty">No records found</td></tr>`;
  } else {
    pageData.forEach(u => {
      const name = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
      html += `<tr>
        <td>${u.employee_code || u.id || ''}</td>
        <td>${name}</td>
        <td>${u.email || ''}</td>
        <td>${u.phone || ''}</td>
        <td>${u.designation || ''}</td>
        <td>${u.department || ''}</td>
        <td>${u.is_active ? 'Active' : 'Inactive'}</td>
        <td>${u.role || ''}</td>
        <td class="um-action-cell">
          <div class="um-action-wrap">
            <button class="um-action-btn" onclick="toggleUmDropdown(event, ${u.id})">&#8230;</button>
            <div id="um-dd-${u.id}" class="um-action-dropdown" style="display:none;">
              <a href="#" onclick="openUmEdit(${u.id})">&#9998; Edit</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }

  html += `</tbody></table>`;

  const totalPages = Math.ceil(umFiltered.length / umPerPage);
  if (totalPages > 1) {
    html += '<div class="um-pagination">';
    for (let i = 1; i <= totalPages; i++) {
      html += `<button onclick="umGoToPage(${i})" ${i === umCurrentPage ? 'class="um-page-active"' : ''}>${i}</button>`;
    }
    html += '</div>';
  }

  document.getElementById("um-table-container").innerHTML = html;
}

function handleUmSearch() {
  const query = document.getElementById("um-search-input").value.toLowerCase();
  umFiltered = umUsers.filter(u => {
    const name = ((u.first_name || '') + ' ' + (u.last_name || '')).toLowerCase();
    return name.includes(query) ||
      (u.email || '').toLowerCase().includes(query) ||
      String(u.employee_code || u.id || '').toLowerCase().includes(query);
  });
  umCurrentPage = 1;
  renderUmTable();
}

function changeUmPerPage(val) {
  umPerPage = parseInt(val);
  umCurrentPage = 1;
  renderUmTable();
}

function umGoToPage(page) {
  umCurrentPage = page;
  renderUmTable();
}

function showUmFilters() {}

function toggleUmDropdown(event, userId) {
  event.stopPropagation();
  document.querySelectorAll('[id^="um-dd-"]').forEach(d => {
    if (d.id !== `um-dd-${userId}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`um-dd-${userId}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function openUmEdit(userId) {
  document.querySelectorAll('[id^="um-dd-"]').forEach(d => d.style.display = 'none');
  const record = umUsers.find(u => u.id === userId);
  if (!record) return;
  renderUmEditPage(document.getElementById("main-content"), record);
}

function renderUmEditPage(container, record) {
  const name = ((record.first_name || '') + ' ' + (record.last_name || '')).trim();
  container.innerHTML = `
    <div class="um-page">
      <div class="um-header-row">
        <h2 class="um-title">Edit User Managment</h2>
        <div class="um-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="um-bc-link" onclick="loadView('user-management')">User Managment</a>
          &rsaquo; Edit
        </div>
      </div>

      <div class="um-form-grid">
        <div class="um-form-group">
          <label>Employee Code</label>
          <input type="text" value="${record.employee_code || record.id || ''}" readonly class="um-readonly">
        </div>
        <div class="um-form-group">
          <label>Name</label>
          <input type="text" id="um-name" value="${name}">
        </div>
        <div class="um-form-group">
          <label>Email</label>
          <input type="email" id="um-email" value="${record.email || ''}">
        </div>
        <div class="um-form-group">
          <label>Phone Number</label>
          <div class="um-phone-row">
            <select id="um-phone-code">
              <option value="+254">+254 (KE)</option>
              <option value="+1">+1 (US)</option>
              <option value="+44">+44 (UK)</option>
              <option value="+91">+91 (IN)</option>
            </select>
            <input type="tel" id="um-phone-num" value="${record.phone || ''}">
          </div>
        </div>
        <div class="um-form-group">
          <label>Designation</label>
          <input type="text" id="um-designation" value="${record.designation || ''}">
        </div>
        <div class="um-form-group">
          <label>Department</label>
          <input type="text" id="um-department" value="${record.department || ''}">
        </div>
        <div class="um-form-group">
          <label>Role <span class="um-required">*</span></label>
          <select id="um-role">
            <option value="">Please Select</option>
            <option value="super_admin" ${record.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
            <option value="manager" ${record.role === 'manager' ? 'selected' : ''}>Manager</option>
            <option value="teacher" ${record.role === 'teacher' ? 'selected' : ''}>Teacher</option>
            <option value="kitchen" ${record.role === 'kitchen' ? 'selected' : ''}>Kitchen</option>
            <option value="utility" ${record.role === 'utility' ? 'selected' : ''}>Utility</option>
          </select>
        </div>
        <div class="um-form-group">
          <label>Branch Lock-Up <span class="um-required">*</span></label>
          <select id="um-branch">
            <option value="all">All</option>
            <option value="main">Main Campus</option>
            <option value="branch1">Branch 1</option>
          </select>
        </div>
      </div>

      <div class="um-checkboxes">
        <label class="um-checkbox-label">
          <input type="checkbox" id="um-pull-sig">
          Pull signature on student ID (Already assigned to another staff)
        </label>
        <label class="um-checkbox-label">
          <input type="checkbox" id="um-inactive" ${record.is_active === false ? 'checked' : ''}>
          Inactive
        </label>
      </div>

      <div class="um-action-buttons">
        <button class="um-btn-update" onclick="saveUmEdit(${record.id})">Update</button>
        <button class="um-btn-cancel" onclick="cancelUmEdit()">Cancel</button>
      </div>
      <div id="um-edit-status" class="um-edit-status"></div>
    </div>
  `;
}

async function saveUmEdit(userId) {
  const designation = document.getElementById("um-designation").value;
  const role = document.getElementById("um-role").value;

  if (!role) {
    document.getElementById("um-edit-status").innerHTML = '<span class="um-status-error">Please select a Role.</span>';
    return;
  }

  const idx = umUsers.findIndex(u => u.id === userId);
  if (idx !== -1) {
    umUsers[idx].designation = designation;
    umUsers[idx].role = role;
  }
  umFiltered = [...umUsers];

  try {
    await fetch(`${API_BASE}/team/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ designation, role })
    });
  } catch (e) {}

  document.getElementById("um-edit-status").innerHTML = '<span class="um-status-success">Updated successfully!</span>';
  setTimeout(() => loadView('user-management'), 1000);
}

function cancelUmEdit() {
  loadView('user-management');
}

// ==================== ROLES ====================
// Single source-of-truth for the navigation structure.
// The Permissions table is generated entirely from this object.
// Adding a module/sub-module here automatically adds it to every role's Permissions table.
const NAV_STRUCTURE = [
  { id: 'student-management', label: 'Student Management', children: [
    { id: 'students-list',      label: 'Students' },
    { id: 'student-search',     label: 'Student Search' },
    { id: 'student-reporting',  label: 'Student Reporting' }
  ]},
  { id: 'student-academics', label: 'Student Academics', children: [
    { id: 'attendance-register', label: 'Attendance Register' },
    { id: 'academic-year-setup', label: 'Academic Year Setup' }
  ]},
  { id: 'transport-management', label: 'Transport Management' },
  { id: 'finance', label: 'Finance', children: [
    { id: 'student-fees-status',       label: 'Student Fees Status' },
    { id: 'summarized-fee-statement',  label: 'Summarized Fee Statement' },
    { id: 'student-finance',           label: 'Student Finance' },
    { id: 'cash-bank-management',      label: 'Cash and Bank Management' },
    { id: 'payables',                  label: 'Payables' },
    { id: 'receivables',               label: 'Receivables' },
    { id: 'cancellations',             label: 'Cancellations' },
    { id: 'journal-entries',           label: 'Journal Entries' },
    { id: 'utilities',                 label: 'Utilities' },
    { id: 'finance-setup',             label: 'Set-up' },
    { id: 'finance-reports',           label: 'Reports' }
  ]},
  { id: 'inventory-management', label: 'Inventory Management' },
  { id: 'procurement',          label: 'Procurement' },
  { id: 'human-resource',       label: 'Human Resource' },
  { id: 'payroll',              label: 'Payroll' },
  { id: 'asset-management',     label: 'Asset Management' },
  { id: 'communication',        label: 'Communication' },
  { id: 'administration', label: 'Administration', children: [
    { id: 'user-management', label: 'User Management' },
    { id: 'admin-roles',     label: 'Roles' },
    { id: 'admin-setup',     label: 'Setup' }
  ]}
];

let rolesData = [];
let rolesPerPage = 10;

function generateRoleId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
});

// ---- Listing ----
function loadRolesListingView(container) {
  renderRoleListPage(container);
}

function renderRoleListPage(container) {
  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Role</h2>
        <div class="role-breadcrumb">Dashboard &rsaquo; Administration &rsaquo; Role &rsaquo; Listing</div>
      </div>
      <div class="role-controls-row">
        <div class="role-controls-left">
          Show <select id="role-per-page" onchange="changeRolePerPage(this.value)">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select> entries
          &nbsp;|&nbsp; Total <span id="role-total-count">0</span> entries
        </div>
        <div class="role-controls-right">
          <button class="role-add-btn" onclick="renderRoleAddPage(document.getElementById('main-content'))">+ Add</button>
        </div>
      </div>
      <div id="role-table-container"></div>
    </div>
  `;
  const sel = document.getElementById("role-per-page");
  if (sel) sel.value = String(rolesPerPage);
  renderRoleTable();
}

function renderRoleTable() {
  const totalEl = document.getElementById("role-total-count");
  if (totalEl) totalEl.textContent = rolesData.length;

  let html = `<table class="role-table"><thead><tr>
    <th>TITLE</th><th>ACTION</th>
  </tr></thead><tbody>`;

  if (rolesData.length === 0) {
    html += `<tr><td colspan="2" class="role-empty">No records found</td></tr>`;
  } else {
    rolesData.forEach(r => {
      html += `<tr>
        <td>${r.title}</td>
        <td class="role-action-cell">
          <div class="role-action-wrap">
            <button class="role-action-btn" onclick="toggleRoleDropdown(event,'${r.id}')">&#8230;</button>
            <div id="role-dd-${r.id}" class="role-action-dropdown" style="display:none;">
              <a href="#" onclick="openRoleEdit('${r.id}')">&#9998; Edit</a>
              <a href="#" onclick="openRolePermissions('${r.id}')">&#128274; Permissions</a>
            </div>
          </div>
        </td>
      </tr>`;
    });
  }
  html += `</tbody></table>`;
  document.getElementById("role-table-container").innerHTML = html;
}

function changeRolePerPage(val) {
  rolesPerPage = parseInt(val);
  renderRoleTable();
}

function toggleRoleDropdown(event, roleId) {
  event.stopPropagation();
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => {
    if (d.id !== `role-dd-${roleId}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`role-dd-${roleId}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// ---- Add Role ----
function renderRoleAddPage(container) {
  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Add Role</h2>
        <div class="role-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="role-bc-link" onclick="loadView('admin-roles')">Role</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="role-form-wrap">
        <div class="role-form-group">
          <label class="role-form-label">Title <span class="role-required">*</span></label>
          <input type="text" id="role-add-title" placeholder="Enter role title">
        </div>
        <div class="role-form-actions">
          <button class="role-btn-submit" onclick="submitAddRole()">Submit</button>
          <button class="role-btn-cancel" onclick="loadView('admin-roles')">Cancel</button>
        </div>
        <div id="role-add-status" class="role-form-status"></div>
      </div>
    </div>
  `;
}

function submitAddRole() {
  const title = (document.getElementById("role-add-title").value || '').trim();
  if (!title) {
    document.getElementById("role-add-status").innerHTML = '<span class="role-status-error">Title is required.</span>';
    return;
  }
  rolesData.push({ id: generateRoleId(), title, permissions: {} });
  loadView('admin-roles');
}

// ---- Edit Role ----
function openRoleEdit(roleId) {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
  const role = rolesData.find(r => r.id === roleId);
  if (!role) return;
  renderRoleEditPage(document.getElementById("main-content"), role);
}

function renderRoleEditPage(container, role) {
  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Edit Role</h2>
        <div class="role-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="role-bc-link" onclick="loadView('admin-roles')">Role</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="role-form-wrap">
        <div class="role-form-group">
          <label class="role-form-label">Title <span class="role-required">*</span></label>
          <input type="text" id="role-edit-title" value="${role.title}">
        </div>
        <div class="role-form-actions">
          <button class="role-btn-submit" onclick="submitEditRole('${role.id}')">Update</button>
          <button class="role-btn-cancel" onclick="loadView('admin-roles')">Cancel</button>
        </div>
        <div id="role-edit-status" class="role-form-status"></div>
      </div>
    </div>
  `;
}

function submitEditRole(roleId) {
  const title = (document.getElementById("role-edit-title").value || '').trim();
  if (!title) {
    document.getElementById("role-edit-status").innerHTML = '<span class="role-status-error">Title is required.</span>';
    return;
  }
  const idx = rolesData.findIndex(r => r.id === roleId);
  if (idx !== -1) rolesData[idx].title = title;
  loadView('admin-roles');
}

// ---- Permissions ----
function openRolePermissions(roleId) {
  document.querySelectorAll('[id^="role-dd-"]').forEach(d => d.style.display = 'none');
  const role = rolesData.find(r => r.id === roleId);
  if (!role) return;
  renderRolePermissionsPage(document.getElementById("main-content"), role);
}

function renderRolePermissionsPage(container, role) {
  container.innerHTML = `
    <div class="role-page">
      <div class="role-header-row">
        <h2 class="role-title">Permissions</h2>
        <div class="role-breadcrumb">
          Dashboard &rsaquo; Role &rsaquo;
          <a href="#" class="role-bc-link" onclick="loadView('admin-roles')">${role.title}</a>
          &rsaquo; Permissions
        </div>
      </div>
      <table class="role-perm-table">
        <thead>
          <tr>
            <th class="role-perm-th-mod">MODULE</th>
            <th class="role-perm-th-sel">SELECT ALL <input type="checkbox" id="role-master-cb" class="role-master-cb" onchange="toggleRoleMasterAll(this,'${role.id}')"></th>
            <th class="role-perm-th-act">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${buildPermRows(NAV_STRUCTURE, 0, role.id)}
        </tbody>
      </table>
    </div>
  `;
  syncMasterCheckbox(role.id);
}

function buildPermRows(nodes, depth, roleId) {
  let html = '';
  nodes.forEach(node => {
    const perms = (rolesData.find(r => r.id === roleId)?.permissions || {})[node.id] || {};
    const v = !!perms.view, a = !!perms.add, e = !!perms.edit, d = !!perms.delete;
    const allChecked = v && a && e && d;
    const indent = 12 + depth * 18;
    const childClass = depth > 0 ? ' role-perm-child' : '';
    const labelClass = depth > 0 ? 'role-module-label role-module-label--child' : 'role-module-label';

    html += `<tr class="role-perm-row${childClass}">
      <td class="role-perm-mod-cell" style="padding-left:${indent}px">
        <span class="${labelClass}">${node.label}</span>
      </td>
      <td class="role-perm-sel-cell">
        <input type="checkbox" class="role-row-sel-cb"
          data-mod="${node.id}" data-role="${roleId}"
          onchange="toggleRoleRowAll(this)"
          ${allChecked ? 'checked' : ''}>
      </td>
      <td class="role-perm-act-cell">
        ${['view','add','edit','delete'].map(action =>
          `<label class="role-perm-label"><input type="checkbox" class="role-perm-cb" data-mod="${node.id}" data-action="${action}" data-role="${roleId}" onchange="saveRolePermChange(this)" ${perms[action] ? 'checked' : ''}> ${action[0].toUpperCase() + action.slice(1)}</label>`
        ).join('')}
      </td>
    </tr>`;

    if (node.children) html += buildPermRows(node.children, depth + 1, roleId);
  });
  return html;
}

function saveRolePermChange(cb) {
  const roleId = cb.dataset.role, modId = cb.dataset.mod, action = cb.dataset.action;
  const role = rolesData.find(r => r.id === roleId);
  if (!role) return;
  if (!role.permissions[modId]) role.permissions[modId] = {};
  role.permissions[modId][action] = cb.checked;
  syncRowSelCheckbox(roleId, modId);
  syncMasterCheckbox(roleId);
}

function toggleRoleRowAll(rowCb) {
  const roleId = rowCb.dataset.role, modId = rowCb.dataset.mod, checked = rowCb.checked;
  document.querySelectorAll(`.role-perm-cb[data-mod="${modId}"][data-role="${roleId}"]`).forEach(cb => {
    cb.checked = checked;
    const role = rolesData.find(r => r.id === roleId);
    if (!role) return;
    if (!role.permissions[modId]) role.permissions[modId] = {};
    role.permissions[modId][cb.dataset.action] = checked;
  });
  syncMasterCheckbox(roleId);
}

function toggleRoleMasterAll(masterCb, roleId) {
  const checked = masterCb.checked;
  document.querySelectorAll(`.role-perm-cb[data-role="${roleId}"]`).forEach(cb => {
    cb.checked = checked;
    const role = rolesData.find(r => r.id === roleId);
    if (!role) return;
    if (!role.permissions[cb.dataset.mod]) role.permissions[cb.dataset.mod] = {};
    role.permissions[cb.dataset.mod][cb.dataset.action] = checked;
  });
  document.querySelectorAll(`.role-row-sel-cb[data-role="${roleId}"]`).forEach(cb => {
    cb.checked = checked;
  });
}

function syncRowSelCheckbox(roleId, modId) {
  const cbs = document.querySelectorAll(`.role-perm-cb[data-mod="${modId}"][data-role="${roleId}"]`);
  const allChecked = cbs.length > 0 && Array.from(cbs).every(cb => cb.checked);
  const rowCb = document.querySelector(`.role-row-sel-cb[data-mod="${modId}"][data-role="${roleId}"]`);
  if (rowCb) rowCb.checked = allChecked;
}

function syncMasterCheckbox(roleId) {
  const allCbs = document.querySelectorAll(`.role-perm-cb[data-role="${roleId}"]`);
  const allChecked = allCbs.length > 0 && Array.from(allCbs).every(cb => cb.checked);
  const master = document.getElementById("role-master-cb");
  if (master) master.checked = allChecked;
}

// ==================== UTILS ====================
function closeModal(modalId) { document.getElementById(modalId).style.display = "none"; }