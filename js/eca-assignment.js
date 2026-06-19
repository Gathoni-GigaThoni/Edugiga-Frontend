// ==================== ECA ASSIGNMENT ====================
// Bulk extra-curricular fee enrollment grid, built against the live
// GET /extra-curricular/assignments and POST /extra-curricular/bulk-assign
// endpoints (EcaAssignmentGrid: term_id, fee_items[{id,name,default_amount}],
// students[{student_id,student_name,student_code,enrollments:{feeItemId:bool}}]).
// Note: this is unrelated to the older ExtraCurriculumActivity catalog used by
// the student form's "Extra Curriculum" multiselect — that's a separate
// activity-tracking model, not fee-item-based enrollment, so it isn't touched here.

let _ecaGrid = null;
let _ecaClasses = [];

async function loadEcaAssignmentView(container) {
  await _pvLoadLookups();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">ECA Assignment</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; ECA Assignment</div>
      </div>
      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field">
            <label class="fin-filter-label">Term <span class="fin-required">*</span></label>
            <select id="eca-term" class="fin-filter-select"><option value="">Please Select</option></select>
            <span class="fin-field-error" id="eca-term-err"></span>
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Class</label>
            <select id="eca-class" class="fin-filter-select"><option value="">All Classes</option></select>
          </div>
        </div>
        <div class="fin-filter-actions">
          <button class="fin-btn-teal" onclick="loadECAAssignments()">Load</button>
        </div>
      </div>
      <div id="eca-grid-container"></div>
    </div>`;
  await populateTermDropdown('eca-term');
  try {
    const res = await apiFetch(`${API_BASE}/classes/`);
    _ecaClasses = (res && res.ok) ? _toArray(await res.json()) : [];
  } catch (_) { _ecaClasses = []; }
  const classSel = document.getElementById('eca-class');
  if (classSel) {
    classSel.innerHTML = `<option value="">All Classes</option>` +
      _ecaClasses.map(c => `<option value="${c.id}">${_finEsc(c.name)}</option>`).join('');
  }
}

async function loadECAAssignments() {
  const termId = document.getElementById('eca-term').value;
  const classId = document.getElementById('eca-class').value;
  const errEl = document.getElementById('eca-term-err');
  if (!termId) { if (errEl) errEl.textContent = 'Term is required.'; return; }
  if (errEl) errEl.textContent = '';

  const out = document.getElementById('eca-grid-container');
  renderSkeletonRows('eca-grid-container', 5);
  try {
    const url = `${API_BASE}/extra-curricular/assignments?term_id=${termId}${classId ? `&class_id=${classId}` : ''}`;
    const res = await apiFetch(url);
    if (!res || !res.ok) { showToast('Could not load ECA assignments: ' + (res ? await parseApiError(res) : 'network error'), 'error'); out.innerHTML = ''; return; }
    _ecaGrid = await res.json();
  } catch (e) { showToast('Network error loading ECA assignments.', 'error'); return; }
  _renderEcaGrid();
}

function _renderEcaGrid() {
  const out = document.getElementById('eca-grid-container');
  if (!_ecaGrid || !_ecaGrid.fee_items.length || !_ecaGrid.students.length) {
    out.innerHTML = '<p class="fin-empty">No ECA fee items or students found for this selection.</p>';
    return;
  }
  const cols = _ecaGrid.fee_items;
  const rows = _ecaGrid.students.map(s => `
    <tr>
      <td>${_finEsc(s.student_code)}</td>
      <td>${_finEsc(s.student_name)}</td>
      ${cols.map(c => `<td style="text-align:center;">
        <input type="checkbox" class="fin-cb eca-cell" data-student="${s.student_id}" data-fee-item="${c.id}"
               ${s.enrollments[String(c.id)] ? 'checked' : ''}>
      </td>`).join('')}
    </tr>`).join('');

  out.innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>STUDENT CODE</th><th>STUDENT NAME</th>
        ${cols.map(c => `<th>${_finEsc(c.name)}<br><span style="font-weight:400;font-size:0.78rem;">${_pvMoney(c.default_amount)}</span></th>`).join('')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="fin-form-actions" style="margin-top:16px;">
      <button class="fin-btn-teal" onclick="saveECAAssignments()">Save</button>
    </div>`;
}

async function saveECAAssignments() {
  if (!_ecaGrid) return;
  const termId = parseInt(document.getElementById('eca-term').value, 10);
  const assignments = Array.from(document.querySelectorAll('.eca-cell')).map(cb => ({
    student_id: parseInt(cb.dataset.student, 10),
    fee_item_id: parseInt(cb.dataset.feeItem, 10),
    is_enrolled: cb.checked,
  }));
  try {
    const res = await apiFetch(`${API_BASE}/extra-curricular/bulk-assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term_id: termId, assignments }),
    });
    if (res && res.ok) {
      const result = await res.json();
      showToast(`Saved: ${result.enrolled} enrolled, ${result.unenrolled} unenrolled, ${result.fees_created} fee(s) created, ${result.fees_voided} fee(s) voided.`, 'success');
      await loadECAAssignments();
    } else if (res) {
      showToast('Error: ' + await parseApiError(res), 'error');
    }
  } catch (e) { showToast('Network error saving ECA assignments.', 'error'); }
}
