// ==================== ACADEMIC YEARS ====================

let _ayPerPage  = 10;
let _ayLocalData = [];  // API data augmented with local is_inactive + notes

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="ay-dd-"]').forEach(d => d.style.display = 'none');
});

function loadAcademicYearsView(container) {
  _renderAyListPage(container);
}

// ==================== LISTING ====================

async function _renderAyListPage(container) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Academic Year</h2>
        <div class="sa-breadcrumb">Dashboard &rsaquo; Administration &rsaquo; Academic Year &rsaquo; Listing</div>
      </div>
      <div class="sa-controls-row">
        <div class="sa-controls-left">
          Show <select id="ay-per-page" onchange="changeAyPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}" ${n===_ayPerPage?'selected':''}>${n}</option>`).join('')}
          </select> entries
          &nbsp;|&nbsp; Total <span id="ay-total-count">0</span> entries
        </div>
        <div class="sa-controls-right">
          <button class="sa-btn-add" onclick="renderAyAddPage(document.getElementById('main-content'))">+ Add</button>
        </div>
      </div>
      <div id="ay-table-container"><p class="sa-loading">Loading&#8230;</p></div>
    </div>
  `;
  const sel = document.getElementById('ay-per-page');
  if (sel) sel.value = String(_ayPerPage);
  await _fetchAndRenderAyTable();
}

async function _fetchAndRenderAyTable() {
  const container = document.getElementById('ay-table-container');
  if (!container) return;
  try {
    const res   = await fetch(`${API_BASE}/academic-years/`, { headers: { Authorization: `Bearer ${token}` } });
    const years = res.ok ? await res.json() : [];

    // Merge API data with any local overrides (is_inactive, notes are not in the API schema)
    _ayLocalData = years.map(y => {
      const existing = _ayLocalData.find(x => x.id === y.id) || {};
      return {
        ...y,
        is_inactive: existing.is_inactive ?? false,
        notes:       existing.notes       ?? ''
      };
    });

    const totalEl = document.getElementById('ay-total-count');
    if (totalEl) totalEl.textContent = _ayLocalData.length;

    const page = _ayLocalData.slice(0, _ayPerPage);
    let rows = '';
    if (page.length === 0) {
      rows = `<tr><td colspan="5" class="sa-empty">No record found.</td></tr>`;
    } else {
      page.forEach(y => {
        const btnCls = y.is_inactive ? 'sa-status-btn-deactive' : 'sa-status-btn-active';
        const label  = y.is_inactive ? 'Deactive' : 'Active';
        rows += `<tr id="ay-row-${y.id}">
          <td>${_ayEsc(y.name)}</td>
          <td>${_fmtDDMmmYYYY(y.start_date)}</td>
          <td>${_fmtDDMmmYYYY(y.end_date)}</td>
          <td>
            <button class="sa-status-btn ${btnCls}" onclick="toggleAyStatus(${y.id})">
              ${label} &#9660;
            </button>
          </td>
          <td class="sa-action-cell">
            <div class="sa-action-wrap">
              <button class="sa-action-btn" onclick="toggleAyDropdown(event,${y.id})">&#8230;</button>
              <div id="ay-dd-${y.id}" class="sa-action-dropdown" style="display:none;">
                <a href="#" onclick="openAyEdit(${y.id});return false;">&#9998; Edit</a>
              </div>
            </div>
          </td>
        </tr>`;
      });
    }

    container.innerHTML = `
      <div class="sa-table-wrap">
        <table class="sa-table">
          <thead><tr>
            <th>TITLE</th><th>START DATE</th><th>END DATE</th><th>STATUS</th><th>ACTION</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch(e) {
    container.innerHTML = '<p class="sa-error-msg">Failed to load academic years.</p>';
  }
}

function changeAyPerPage(val) {
  _ayPerPage = parseInt(val);
  _fetchAndRenderAyTable();
}

function toggleAyDropdown(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="ay-dd-"]').forEach(d => {
    if (d.id !== `ay-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`ay-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function toggleAyStatus(id) {
  const idx = _ayLocalData.findIndex(y => y.id === id);
  if (idx === -1) return;
  _ayLocalData[idx].is_inactive = !_ayLocalData[idx].is_inactive;
  const row = document.getElementById(`ay-row-${id}`);
  if (!row) return;
  const y      = _ayLocalData[idx];
  const btnCls = y.is_inactive ? 'sa-status-btn-deactive' : 'sa-status-btn-active';
  const label  = y.is_inactive ? 'Deactive' : 'Active';
  const btn    = row.querySelector('.sa-status-btn');
  if (btn) { btn.className = `sa-status-btn ${btnCls}`; btn.innerHTML = `${label} &#9660;`; }
}

// ==================== ADD ====================

function renderAyAddPage(container) {
  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Add Academic Year</h2>
        <div class="sa-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="sa-bc-link" onclick="loadView('sa-academic-years');return false;">Academic Year</a>
          &rsaquo; Add
        </div>
      </div>
      <div class="sa-form-wrap" style="max-width:680px;">
        <div class="sa-form-grid-2">
          <div class="sa-form-group">
            <label class="sa-form-label">Title <span class="sa-required">*</span></label>
            <input type="text" id="ay-add-title" class="sa-form-input" placeholder="e.g. 2025/2026">
            <span class="sa-field-error" id="ay-add-title-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Start Date <span class="sa-required">*</span></label>
            <input type="date" id="ay-add-start" class="sa-form-input">
            <span class="sa-field-error" id="ay-add-start-err"></span>
          </div>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">End Date <span class="sa-required">*</span></label>
          <input type="date" id="ay-add-end" class="sa-form-input">
          <span class="sa-field-error" id="ay-add-end-err"></span>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Notes</label>
          <textarea id="ay-add-notes" class="sa-form-textarea" rows="3"></textarea>
        </div>
        <div class="sa-form-check-group">
          <label class="sa-form-check-label">
            <input type="checkbox" id="ay-add-inactive" class="sa-form-cb"> Inactive?
          </label>
        </div>
        <div class="sa-form-actions">
          <button class="sa-btn-submit" onclick="submitAyAdd()">Save</button>
          <button class="sa-btn-cancel" onclick="loadView('sa-academic-years')">Cancel</button>
        </div>
        <div id="ay-add-status"></div>
      </div>
    </div>
  `;
}

async function submitAyAdd() {
  const name  = (document.getElementById('ay-add-title').value || '').trim();
  const start =  document.getElementById('ay-add-start').value;
  const end   =  document.getElementById('ay-add-end').value;
  let valid   = true;

  document.getElementById('ay-add-title-err').textContent = name  ? '' : 'This field is required.';
  document.getElementById('ay-add-start-err').textContent = start ? '' : 'This field is required.';
  document.getElementById('ay-add-end-err').textContent   = end   ? '' : 'This field is required.';
  if (!name || !start || !end) valid = false;
  if (!valid) return;

  const statusEl = document.getElementById('ay-add-status');
  try {
    const res = await fetch(`${API_BASE}/academic-years/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, start_date: start, end_date: end })
    });
    if (res.ok) {
      loadView('sa-academic-years');
    } else {
      const err = await res.json();
      if (statusEl) statusEl.innerHTML = `<div class="sa-toast sa-toast-error">${err.detail || 'Error creating academic year.'}</div>`;
    }
  } catch(e) {
    if (statusEl) statusEl.innerHTML = '<div class="sa-toast sa-toast-error">Failed to save. Please try again.</div>';
  }
}

// ==================== EDIT ====================

async function openAyEdit(id) {
  document.querySelectorAll('[id^="ay-dd-"]').forEach(d => d.style.display = 'none');
  const container = document.getElementById('main-content');
  container.innerHTML = '<p class="sa-loading">Loading&#8230;</p>';
  try {
    const res  = await fetch(`${API_BASE}/academic-years/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { container.innerHTML = '<p class="sa-error-msg">Could not load academic year.</p>'; return; }
    const year  = await res.json();
    // Merge local overrides
    const local = _ayLocalData.find(x => x.id === id) || {};
    year.is_inactive = local.is_inactive ?? false;
    year.notes       = local.notes       ?? '';
    _renderAyEditPage(container, year);
  } catch(e) {
    container.innerHTML = '<p class="sa-error-msg">Failed to load academic year.</p>';
  }
}

function _renderAyEditPage(container, year) {
  const termsRows = (year.terms || []).map(t => `
    <tr>
      <td>${_ayEsc(t.name)}</td>
      <td>${_fmtDDMmmYYYY(t.automatic_start)}</td>
      <td>${_fmtDDMmmYYYY(t.automatic_end)}</td>
      <td><input type="date" id="ay-term-as-${t.id}" class="sa-terms-input" value="${t.actual_start || ''}"></td>
      <td><input type="date" id="ay-term-ae-${t.id}" class="sa-terms-input" value="${t.actual_end  || ''}"></td>
      <td>
        <button class="sa-btn-save-term" onclick="saveAyTermDates(${year.id},${t.id})">Save</button>
        <div id="ay-term-msg-${t.id}" class="sa-term-save-msg"></div>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Edit Academic Year</h2>
        <div class="sa-breadcrumb">
          Dashboard &rsaquo; Administration &rsaquo;
          <a href="#" class="sa-bc-link" onclick="loadView('sa-academic-years');return false;">Academic Year</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="sa-form-wrap" style="max-width:680px;">
        <div class="sa-form-grid-2">
          <div class="sa-form-group">
            <label class="sa-form-label">Title <span class="sa-required">*</span></label>
            <input type="text" class="sa-form-input" value="${_ayEsc(year.name)}" disabled>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">Start Date <span class="sa-required">*</span></label>
            <input type="date" class="sa-form-input" value="${year.start_date}" disabled>
          </div>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">End Date <span class="sa-required">*</span></label>
          <input type="date" class="sa-form-input" value="${year.end_date}" disabled>
        </div>
        <div class="sa-form-group">
          <label class="sa-form-label">Notes</label>
          <textarea id="ay-edit-notes" class="sa-form-textarea" rows="3">${_ayEsc(year.notes || '')}</textarea>
        </div>
        <div class="sa-form-check-group">
          <label class="sa-form-check-label">
            <input type="checkbox" id="ay-edit-inactive" class="sa-form-cb" ${year.is_inactive ? 'checked' : ''}> Inactive?
          </label>
        </div>

        <!-- Terms -->
        <div class="sa-terms-section">
          <div class="sa-terms-title">Terms</div>
          <div class="sa-table-wrap">
            <table class="sa-table">
              <thead><tr>
                <th>TERM</th><th>AUTO START</th><th>AUTO END</th>
                <th>ACTUAL START</th><th>ACTUAL END</th><th>ACTION</th>
              </tr></thead>
              <tbody>
                ${termsRows || `<tr><td colspan="6" class="sa-empty">No terms found</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div class="sa-form-actions" style="margin-top:24px;">
          <button class="sa-btn-submit" onclick="_saveAyLocalEdits(${year.id})">Update</button>
          <button class="sa-btn-cancel" onclick="loadView('sa-academic-years')">Cancel</button>
        </div>
        <div id="ay-edit-status"></div>
      </div>
    </div>
  `;
}

function _saveAyLocalEdits(id) {
  const idx = _ayLocalData.findIndex(y => y.id === id);
  if (idx !== -1) {
    _ayLocalData[idx].notes       = document.getElementById('ay-edit-notes').value   || '';
    _ayLocalData[idx].is_inactive = document.getElementById('ay-edit-inactive').checked;
  }
  const statusEl = document.getElementById('ay-edit-status');
  if (statusEl) {
    statusEl.innerHTML = '<div class="sa-toast sa-toast-success">Changes saved locally.</div>';
    setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 3000);
  }
}

async function saveAyTermDates(yearId, termId) {
  const actualStart = document.getElementById(`ay-term-as-${termId}`).value || null;
  const actualEnd   = document.getElementById(`ay-term-ae-${termId}`).value || null;
  const msgEl       = document.getElementById(`ay-term-msg-${termId}`);

  try {
    const res = await fetch(`${API_BASE}/academic-years/${yearId}/terms/${termId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ actual_start: actualStart, actual_end: actualEnd })
    });
    if (msgEl) {
      if (res.ok) {
        msgEl.style.color  = '#27ae60';
        msgEl.textContent  = 'Saved!';
        setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
      } else {
        const err = await res.json();
        msgEl.style.color  = '#c0392b';
        msgEl.textContent  = err.detail || 'Error saving.';
      }
    }
  } catch(e) {
    if (msgEl) { msgEl.style.color = '#c0392b'; msgEl.textContent = 'Failed to save.'; }
  }
}

// ==================== HELPERS ====================

function _fmtDDMmmYYYY(dateStr) {
  if (!dateStr) return '-';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parts  = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
}

function _ayEsc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
