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

