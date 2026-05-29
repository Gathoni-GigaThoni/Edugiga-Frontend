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

