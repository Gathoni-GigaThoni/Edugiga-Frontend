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

