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

