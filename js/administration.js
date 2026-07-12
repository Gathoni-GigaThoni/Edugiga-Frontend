// ==================== ADMINISTRATION ====================
async function loadAdministrationView(container) {
  await renderSplitView({
    container,
    // Same underlying resource as User Management (GET /team/, and its own
    // onAdd/onEdit already just redirect there) — no distinct registry key
    // exists for "Staff Management" as its own screen, so this reuses
    // administration.users rather than being left ungated.
    moduleKey: 'administration.users',
    title: 'Staff Management',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Administration',view:'user-management'},
      {label:'Staff'}
    ],
    apiUrl: `${API_BASE}/team/?skip=0&limit=1000`,
    searchFields: ['first_name','last_name','email'],
    col1Label: 'Name', col2Label: 'Role',
    col1: u => `${u.first_name||''} ${u.last_name||''}`.trim() || '—',
    col2: u => UM_ROLE_LABELS?.[u.role] || u.role || '—',
    rowLabel: u => `${u.first_name||''} ${u.last_name||''}`.trim() || '—',
    rowSub:   u => u.email || '',
    idKey: 'id',
    detailFields: [
      {label:'Name',  key:'first_name', fmt:(_,u)=>`${u.first_name||''} ${u.last_name||''}`.trim()},
      {label:'Email', key:'email'},
      {label:'Role',  key:'role', fmt:v=>UM_ROLE_LABELS?.[v]||v||'—'},
    ],
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#128100;</div>
        <p style="font-weight:600;margin-bottom:8px">Add Staff</p>
        <p style="font-size:13px;margin-bottom:20px">Manage staff accounts from User Management.</p>
        <button class="btn-primary" style="padding:10px 24px" onclick="loadView('user-management')">Go to User Management</button>
      </div>`;
    },
    onAdd:  () => loadView('user-management'),
    onEdit: item => loadView('user-management'),
  });
}

async function loadStaffList() {
  const res = await apiFetch(`${API_BASE}/team/`);
  if (!res || !res.ok) { showToast('Could not load staff list.', 'error'); return; }
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
  const res = await apiFetch(`${API_BASE}/team/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  if (!res) return;
  if (res.ok) {
    showToast("Staff created successfully!", "success");
    loadAdministrationView(document.getElementById("main-content"));
  } else {
    showToast(await parseApiError(res), "error");
  }
}

