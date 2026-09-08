// ==================== EMPLOYEE SERVICE PROFILE — SHARED FORM ====================

function _espSalaryLabel(isConsultant) {
  return isConsultant ? 'Consultancy Fee (per period)' : 'Basic Salary';
}

// Everything on the form that differs between an employee and a consultant
// profile, applied from one place. Called on render, and again whenever the
// employee picker changes on the unlocked (payroll Add) form — the fields stay
// in the DOM and are dropped from the payload at submit instead of being
// re-rendered, so a half-filled form survives switching employee.
function applyEspConsultantShape(isConsultant) {
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  show('hr-esp-pay-grade-group', !isConsultant);
  show('hr-esp-sheltered-section', !isConsultant);
  show('hr-esp-basic-salary-hint', isConsultant);
  const hint = document.getElementById('hr-esp-window-hint');
  if (hint) hint.style.display = isConsultant ? 'block' : 'none';
  const salaryLabel = document.getElementById('hr-esp-basic-salary-label');
  if (salaryLabel) salaryLabel.textContent = _espSalaryLabel(isConsultant);
  const winTitle = document.getElementById('hr-esp-window-title');
  if (winTitle) winTitle.textContent = isConsultant ? 'Engagement window' : 'Effective dates';
  const endLabel = document.getElementById('hr-esp-end-date-label');
  if (endLabel) endLabel.textContent = isConsultant ? 'End Date (engagement over)' : 'End Date';
}

// The employee the form is currently about, whatever the entry point — the
// locked employee, or whatever the picker holds on the unlocked form. Both
// the shape toggle and the submit payload key off this, so they can't disagree.
function _espCurrentEmployee() {
  const codeEl = document.getElementById('hr-esp-emp-code');
  const code = (codeEl?.value || hrEspFormState.lockedEmpCode || '').trim();
  return employeeFromRecord({
    employee_id:   hrEspFormState.existingRecord?.employee_id,
    employee_code: code,
  });
}

function _hrEspEmpOptions() {
  return (employeesData || []).map(e =>
    `<option value="${e.employee_code}">${employeeFullName(e)} (${e.employee_code})</option>`
  ).join('');
}

function renderHrEspFormPage(container) {
  const isEdit     = hrEspFormState.context === 'edit';
  const sp         = hrEspFormState.existingRecord || {};
  const locked     = hrEspFormState.sourceView === 'hr-edit' ||
                     (hrEspFormState.sourceView === 'payroll' && isEdit);
  // The identity strip used to be hr-edit only, so reopening a saved profile
  // from Payroll ▸ Employee Service Profiles showed neither name nor code —
  // the employee is fixed at that point and there was nothing else on screen
  // naming them. Show it wherever the employee is locked.
  const showStrip  = locked;
  const bcPrefix   = hrEspFormState.sourceView === 'payroll'
    ? 'Dashboard &rsaquo; Payroll &rsaquo;'
    : 'Dashboard &rsaquo; Human Resource &rsaquo; Employee &rsaquo;';
  const sel = (val, opt) => val === opt ? 'selected' : '';
  const pre = key  => sp[key] || '';

  // Pre-compute department + identity for the locked employee. ServiceProfileRead
  // has no employee_code/employee_name/department_id at all — only employee_id —
  // so resolve through the shared employee cache on whichever key is available
  // rather than on employee_code, which was always undefined on a saved record.
  const lockedEmp = locked
    ? (employeeFromRecord({
        employee_id:   sp.employee_id,
        employee_code: hrEspFormState.lockedEmpCode || sp.employee_code,
      }))
    : null;
  let lockedDeptId = sp.department_id;
  if (lockedDeptId == null && lockedEmp) lockedDeptId = lockedEmp.department_id;
  const lockedDept = departmentLabelFor(lockedDeptId);
  const lockedCode = hrEspFormState.lockedEmpCode || (lockedEmp && lockedEmp.employee_code) || '';
  const lockedName = hrEspFormState.lockedEmpName || employeeFullName(lockedEmp) || '';
  // Keep the state in step so submit's fallbacks (empName, employee_id) see
  // the resolved values too.
  if (locked) {
    hrEspFormState.lockedEmpCode = lockedCode;
    hrEspFormState.lockedEmpName = lockedName;
  }

  // §3.2: "Basic Salary" reads as "Monthly Consultancy Fee" for consultants —
  // same field/id, label text only. employeesData (EmployeeRead) already
  // carries tax_profile, so this reuses the same resolved employee as the
  // department auto-populate above.
  const espEmp = locked ? lockedEmp : employeeFromRecord(sp);
  // A consultant ESP is a different shape, not just a different label. The
  // shared create/update service 400s when a consultant's profile carries a
  // pay_grade_id or any sheltered_* flag — those belong to the PAYE pipeline
  // a consultant is not on. Both blocks are hidden (and dropped from the
  // payload) rather than left on screen to be rejected on save.
  const isConsultant = !!espEmp && espEmp.tax_profile === 'consultant';
  const basicSalaryLabel = _espSalaryLabel(isConsultant);

  const empOptions = _hrEspEmpOptions();

  const stripHtml = showStrip ? `
    <div class="hr-edit-info-strip">
      <div class="hr-edit-info-item">
        <span class="hr-edit-info-label">Employee Code:</span>
        <span class="hr-edit-info-value" id="hr-esp-strip-code">${lockedCode || '—'}</span>
      </div>
      <div class="hr-edit-info-item">
        <span class="hr-edit-info-label">Employee Name:</span>
        <span class="hr-edit-info-value" id="hr-esp-strip-name">${lockedName || '—'}</span>
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="hr-page">
      <div class="hr-header-row">
        <h2 class="hr-title">${isEdit ? 'Edit' : 'Add'} Employee Service Profile</h2>
        <div class="hr-breadcrumb">${bcPrefix} Employee Service Profile &rsaquo; ${isEdit ? 'Edit' : 'Add'}</div>
      </div>
      ${stripHtml}
      <div class="hr-tab-body">
        <div class="hr-form-grid">
          <div class="hr-form-group">
            <label class="hr-form-label">Employee Code <span class="hr-required">*</span></label>
            ${locked
              ? `<input type="text" id="hr-esp-emp-code" class="hr-form-input hr-form-readonly" value="${lockedCode}" readonly>`
              : `<input type="text" id="hr-esp-emp-code" list="hr-esp-emp-list" class="hr-form-input" placeholder="Search employee..." onchange="onHrEspEmpCodeChange()">
                 <datalist id="hr-esp-emp-list">${empOptions}</datalist>`}
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Department</label>
            <input type="text" id="hr-esp-department" class="hr-form-input hr-form-readonly" value="${lockedDept === '—' ? '' : lockedDept}" readonly placeholder="Auto-populated from the employee">
            <span style="font-size:12px;color:var(--grey-600)">Follows the employee — change it on the employee's Basic Information tab.</span>
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Reason/Event <span class="hr-required">*</span></label>
            <select id="hr-esp-reason-event" class="hr-form-select">
              <option value="">Please Select</option>
              <option value="New Hire"      ${sel(pre('reason_event'),'New Hire')}>New Hire</option>
              <option value="Promotion"     ${sel(pre('reason_event'),'Promotion')}>Promotion</option>
              <option value="Salary Review" ${sel(pre('reason_event'),'Salary Review')}>Salary Review</option>
              <option value="Demotion"      ${sel(pre('reason_event'),'Demotion')}>Demotion</option>
              <option value="Transfer"      ${sel(pre('reason_event'),'Transfer')}>Transfer</option>
              <option value="Termination"   ${sel(pre('reason_event'),'Termination')}>Termination</option>
            </select>
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Processing Method</label>
            <select id="hr-esp-processing-method" class="hr-form-select">
              <option value="Pay Grade" ${sel(pre('processing_method')||'Pay Grade','Pay Grade')}>Pay Grade</option>
              <option value="Basic"     ${sel(pre('processing_method'),'Basic')}>Basic</option>
              <option value="Hourly"    ${sel(pre('processing_method'),'Hourly')}>Hourly</option>
            </select>
          </div>
          <div class="hr-form-group" id="hr-esp-pay-grade-group" style="display:${isConsultant ? 'none' : ''};">
            <label class="hr-form-label">Pay Grade <span class="hr-required">*</span></label>
            <select id="hr-esp-pay-grade" class="hr-form-select">
              ${_renderEspPayGradeOptions(pre('pay_grade_id'))}
            </select>
          </div>
          <div class="hr-form-group hr-form-span2">
            <label class="hr-form-label" id="hr-esp-basic-salary-label">${basicSalaryLabel}</label>
            <input type="number" id="hr-esp-basic-salary" class="hr-form-input" step="0.01" min="0" value="${pre('basic_salary')}" placeholder="Enter amount">
            <span id="hr-esp-basic-salary-hint" style="font-size:12px;color:var(--grey-600);display:${isConsultant ? '' : 'none'};">The gross fee for one run period. Withholding tax is computed from it on the consultant run.</span>
          </div>
        </div>

        <div class="hr-esp-sheltered-section" id="hr-esp-sheltered-section" style="display:${isConsultant ? 'none' : ''};">
          <label class="hr-form-label">Shettered from Paying</label>
          <div class="hr-esp-sheltered-row">
            <label class="hr-form-checkbox-label"><input type="checkbox" id="hr-esp-sh-paye"    class="hr-form-cb" ${sp.sheltered_paye         ? 'checked' : ''}> P.A.Y.E.</label>
            <label class="hr-form-checkbox-label"><input type="checkbox" id="hr-esp-sh-shif"    class="hr-form-cb" ${sp.sheltered_shif         ? 'checked' : ''}> S.H.I.F.</label>
            <label class="hr-form-checkbox-label"><input type="checkbox" id="hr-esp-sh-nssf"    class="hr-form-cb" ${sp.sheltered_nssf         ? 'checked' : ''}> N.S.S.F.</label>
            <label class="hr-form-checkbox-label"><input type="checkbox" id="hr-esp-sh-housing" class="hr-form-cb" ${sp.sheltered_housing_levy ? 'checked' : ''}> Housing Levy</label>
          </div>
        </div>

        <div class="hr-form-grid">
          <div class="hr-form-group">
            <label class="hr-form-label">Employee Status</label>
            <select id="hr-esp-emp-status" class="hr-form-select">
              <option value="">Please Select</option>
              <option value="active"     ${sel(pre('employee_status'),'active')}>Active</option>
              <option value="probation"  ${sel(pre('employee_status'),'probation')}>Probation</option>
              <option value="confirmed"  ${sel(pre('employee_status'),'confirmed')}>Confirmed</option>
              <option value="on_leave"   ${sel(pre('employee_status'),'on_leave')}>On Leave</option>
              <option value="suspended"  ${sel(pre('employee_status'),'suspended')}>Suspended</option>
              <option value="terminated" ${sel(pre('employee_status'),'terminated')}>Terminated</option>
            </select>
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Salary Disbursement Mode <span class="hr-required">*</span></label>
            <select id="hr-esp-disbursement-mode" class="hr-form-select">
              <option value="">Please Select</option>
              <option value="bank_transfer" ${sel(pre('salary_disbursement_mode'),'bank_transfer')}>Bank Transfer</option>
              <option value="cash"          ${sel(pre('salary_disbursement_mode'),'cash')}>Cash</option>
              <option value="cheque"        ${sel(pre('salary_disbursement_mode'),'cheque')}>Cheque</option>
              <option value="mpesa"         ${sel(pre('salary_disbursement_mode'),'mpesa')}>Mobile Money (M-Pesa)</option>
            </select>
          </div>
        </div>

        <div class="hr-esp-sheltered-section" id="hr-esp-window-section">
          <label class="hr-form-label" id="hr-esp-window-title">${isConsultant ? 'Engagement window' : 'Effective dates'}</label>
          <span id="hr-esp-window-hint" style="display:${isConsultant ? 'block' : 'none'};font-size:12px;color:var(--grey-600);margin-bottom:8px;">
            A consultant run pays the latest profile whose window covers the run period: it starts on or before the period end, and either has no end date or ends on or after the period start.
            Setting an end date is how you stop paying a consultant — leave their employee status alone.
          </span>
          <div class="hr-form-grid">
            <div class="hr-form-group">
              <label class="hr-form-label">Effective Date <span class="hr-required">*</span></label>
              <input type="date" id="hr-esp-effective-date" class="hr-form-input" value="${pre('effective_date')}">
            </div>
            <div class="hr-form-group">
              <label class="hr-form-label" id="hr-esp-end-date-label">${isConsultant ? 'End Date (engagement over)' : 'End Date'}</label>
              <input type="date" id="hr-esp-end-date" class="hr-form-input" value="${pre('end_date')}">
            </div>
          </div>
        </div>

        <div id="hr-esp-bank-section-wrap">${renderHrEspBankSection()}</div>

        <div class="hr-form-group" style="margin-top:20px;">
          <label class="hr-form-label">Notes / Details</label>
          <textarea id="hr-esp-notes" class="hr-form-textarea" rows="4" placeholder="Additional notes...">${pre('notes')}</textarea>
        </div>

        <div class="hr-form-actions">
          <button class="hr-btn-form-submit" onclick="submitHrEspForm()">${isEdit ? 'Update' : 'Submit'}</button>
          <button class="hr-btn-form-cancel" onclick="cancelHrEspForm()">Cancel</button>
        </div>
      </div>
    </div>
    <div id="hr-esp-bank-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrEspBankModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Add Bank Details</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Account No.</label><input type="text" id="hr-esp-bank-acct-no" class="hr-modal-input" placeholder="Account Number"></div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Bank <span class="hr-required">*</span></label>
            <select id="hr-esp-bank-select" class="hr-modal-select"><option value="">Please Select</option>${buildHrEspBankOptions()}</select>
          </div>
          <div class="hr-modal-field"><label class="hr-form-label">Account Details</label><input type="text" id="hr-esp-bank-acct-details" class="hr-modal-input" placeholder="e.g. Main Branch"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Percentage</label><input type="number" id="hr-esp-bank-pct" class="hr-modal-input" min="0" max="100" placeholder="e.g. 100"></div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Account Name</label>
            <input type="text" id="hr-esp-bank-acct-name" class="hr-modal-input" placeholder="Name as printed on the bank account">
            <span style="font-size:12px;color:var(--grey-600)">Falls back to the employee's full name when blank.</span>
          </div>
          <div class="hr-modal-field">
            <label class="hr-form-label">As it appears on gateway statements (optional)</label>
            <input type="text" id="hr-esp-bank-gateway-name" class="hr-modal-input" placeholder="e.g. G WANJIRU">
            <span style="font-size:12px;color:var(--grey-600)">Only needed when the gateway echoes a different string. Used to match return statements.</span>
          </div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrEspBankModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEspBankAccount()">Select</button>
        </div>
      </div>
    </div>
  `;
  // This page is rendered synchronously from several call sites, and the two
  // caches it reads (employees, departments) are only filled as a side effect
  // of visiting other views. Arriving here first meant an empty employee
  // datalist ("no drop down"), a blank Department box, and — on a saved
  // profile — a blank code and name. Hydrate once the caches land.
  _hrEspHydrateEmployeeFields(locked, sp);
}

async function _hrEspHydrateEmployeeFields(locked, sp) {
  await Promise.all([ensureDepartmentCache(), ensureEmployeesCache()]);

  // The employee picker (unlocked/add) — rebuild the datalist now that
  // employeesData is actually populated.
  const listEl = document.getElementById('hr-esp-emp-list');
  if (listEl) listEl.innerHTML = _hrEspEmpOptions();

  const emp = locked
    ? employeeFromRecord({
        employee_id:   sp.employee_id,
        employee_code: hrEspFormState.lockedEmpCode || sp.employee_code,
      })
    : null;

  if (locked) {
    const code = hrEspFormState.lockedEmpCode || (emp && emp.employee_code) || '';
    const name = hrEspFormState.lockedEmpName || employeeFullName(emp) || '';
    hrEspFormState.lockedEmpCode = code;
    hrEspFormState.lockedEmpName = name;
    const codeEl = document.getElementById('hr-esp-emp-code');
    if (codeEl) codeEl.value = code;
    const strip = document.getElementById('hr-esp-strip-code');
    if (strip) strip.textContent = code || '—';
    const stripName = document.getElementById('hr-esp-strip-name');
    if (stripName) stripName.textContent = name || '—';
    if (emp) applyEspConsultantShape(emp.tax_profile === 'consultant');
  } else {
    applyEspConsultantShape(!!_espCurrentEmployee() && _espCurrentEmployee().tax_profile === 'consultant');
  }

  const deptId = (sp && sp.department_id != null) ? sp.department_id
               : (emp ? emp.department_id : null);
  const deptEl = document.getElementById('hr-esp-department');
  if (deptEl) {
    const label = departmentLabelFor(deptId);
    deptEl.value = label === '—' ? '' : label;
  }
}

// Pay Grade options come from the real PayGrade list (/payroll/utilities/pay-grades/)
// now that it's a managed resource — cached and lazily fetched since this form
// is rendered synchronously from several call sites.
let _espPayGradesCache = null;

function _espPayGradeOptionLabel(g) { return `${g.position} — ${formatKES(g.amount)}`; }

function _renderEspPayGradeOptions(selected) {
  const sel = (val, opt) => String(val) === String(opt) ? 'selected' : '';
  if (_espPayGradesCache === null) {
    _loadEspPayGrades(selected);
    return `<option value="">Loading&#8230;</option>`;
  }
  return `<option value="">Please Select</option>` +
    _espPayGradesCache.map(g => `<option value="${g.id}" ${sel(selected, g.id)}>${_espPayGradeOptionLabel(g)}</option>`).join('');
}

async function _loadEspPayGrades(selected) {
  try {
    const res = await apiFetch(`${API_BASE}/payroll/utilities/pay-grades/`);
    _espPayGradesCache = (res && res.ok) ? await res.json() : [];
  } catch (_) { _espPayGradesCache = []; }
  const select = document.getElementById('hr-esp-pay-grade');
  if (select) {
    const sel = (val, opt) => String(val) === String(opt) ? 'selected' : '';
    select.innerHTML = `<option value="">Please Select</option>` +
      _espPayGradesCache.map(g => `<option value="${g.id}" ${sel(selected, g.id)}>${_espPayGradeOptionLabel(g)}</option>`).join('');
  }
}

function renderHrEspBankSection() {
  const banks = hrEspFormState.bankAccounts || [];
  const maxReached = banks.length >= 2;
  const total = banks.reduce((s, b) => s + (parseFloat(b.percentage) || 0), 0);
  const totalCls = total === 100 ? 'hr-esp-bank-total--ok' : 'hr-esp-bank-total--warn';
  const rows = banks.length === 0
    ? `<tr><td colspan="7" class="hr-empty">No bank accounts added</td></tr>`
    : banks.map((b, i) => `<tr>
        <td>${b.accountNo || ''}</td>
        <td>${b.bank || ''}</td>
        <td>${b.accountDetails || ''}</td>
        <td>${b.percentage || 0}%</td>
        <td>${b.accountName || ''}</td>
        <td>${b.gatewayDisplayName || ''}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrEspBankDropdown(event,${i})">&#8230;</button>
            <div id="hr-esp-bank-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="openHrEspBankModalEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteHrEspBankAccount(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  return `
    <div class="hr-esp-bank-section">
      <div class="hr-esp-bank-header">
        <div>
          <span class="hr-form-label">Add Bank Account</span>
          <p class="hr-esp-bank-hint">Only 2 bank accounts at a time</p>
        </div>
        <button class="hr-add-btn${maxReached ? ' hr-esp-bank-btn--disabled' : ''}"
          ${maxReached ? 'disabled' : 'onclick="openHrEspBankModalNew()"'}>Add Bank Account</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>ACCOUNT NO.</th><th>BANK</th><th>ACCOUNT DETAILS</th><th>PERCENTAGE</th><th>ACCOUNT NAME</th><th>GATEWAY DISPLAY NAME</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="hr-esp-bank-total ${totalCls}">Total: ${total}%</div>
    </div>
  `;
}

function buildHrEspBankOptions() {
  return financialInstitutionsData
    .filter(fi => !(fi.is_inactive || fi.isInactive))
    .map(fi => `<option value="${fi.id}">${fi.institution}</option>`)
    .join('');
}

function toggleHrEspBankDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-esp-bank-dd-"]').forEach(d => {
    if (d.id !== `hr-esp-bank-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-esp-bank-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function openHrEspBankModalNew() {
  hrEspFormState.editingBankIdx = -1;
  ['hr-esp-bank-acct-no','hr-esp-bank-acct-details','hr-esp-bank-acct-name','hr-esp-bank-gateway-name'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const pct = document.getElementById('hr-esp-bank-pct'); if (pct) pct.value = '';
  const sel = document.getElementById('hr-esp-bank-select');
  if (sel) { sel.innerHTML = `<option value="">Please Select</option>${buildHrEspBankOptions()}`; sel.value = ''; }
  const ov = document.getElementById('hr-esp-bank-overlay'); if (ov) ov.style.display = 'flex';
}

function openHrEspBankModalEdit(idx) {
  hrEspFormState.editingBankIdx = idx;
  const b = hrEspFormState.bankAccounts[idx];
  if (!b) return;
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setv('hr-esp-bank-acct-no', b.accountNo);
  setv('hr-esp-bank-acct-details', b.accountDetails);
  setv('hr-esp-bank-pct', b.percentage);
  setv('hr-esp-bank-acct-name', b.accountName);
  setv('hr-esp-bank-gateway-name', b.gatewayDisplayName);
  const sel = document.getElementById('hr-esp-bank-select');
  if (sel) { sel.innerHTML = `<option value="">Please Select</option>${buildHrEspBankOptions()}`; sel.value = b.bankId || ''; }
  const ov = document.getElementById('hr-esp-bank-overlay'); if (ov) ov.style.display = 'flex';
}

function closeHrEspBankModal() {
  const ov = document.getElementById('hr-esp-bank-overlay'); if (ov) ov.style.display = 'none';
}

function saveHrEspBankAccount() {
  const sel = document.getElementById('hr-esp-bank-select');
  const bankId   = sel?.value || '';
  const bankName = sel?.options[sel.selectedIndex]?.text || '';
  const entry = {
    accountNo:        document.getElementById('hr-esp-bank-acct-no')?.value || '',
    bankId,
    bank:             bankName,
    accountDetails: document.getElementById('hr-esp-bank-acct-details')?.value || '',
    percentage:       parseFloat(document.getElementById('hr-esp-bank-pct')?.value || 0),
    accountName:         document.getElementById('hr-esp-bank-acct-name')?.value || '',
    gatewayDisplayName:  document.getElementById('hr-esp-bank-gateway-name')?.value || '',
  };
  if (hrEspFormState.editingBankIdx === -1) {
    hrEspFormState.bankAccounts.push(entry);
  } else {
    hrEspFormState.bankAccounts[hrEspFormState.editingBankIdx] = entry;
  }
  closeHrEspBankModal();
  const wrap = document.getElementById('hr-esp-bank-section-wrap');
  if (wrap) wrap.innerHTML = renderHrEspBankSection();
}

function deleteHrEspBankAccount(idx) {
  if (!confirm('Remove this bank account?')) return;
  hrEspFormState.bankAccounts.splice(idx, 1);
  const wrap = document.getElementById('hr-esp-bank-section-wrap');
  if (wrap) wrap.innerHTML = renderHrEspBankSection();
}

function onHrEspEmpCodeChange() {
  const code = (document.getElementById('hr-esp-emp-code')?.value || '').trim();
  const emp  = (employeesData || []).find(e => e.employee_code === code);
  const deptEl = document.getElementById('hr-esp-department');
  if (deptEl) {
    const label = emp ? departmentLabelFor(emp.department_id) : '';
    deptEl.value = label === '—' ? '' : label;
  }
  applyEspConsultantShape(!!emp && emp.tax_profile === 'consultant');
}


// ── End engagement (2026-09-08 consultant flow) ───────────────────────────
// _resolve_gross_for_consultant picks the latest profile whose window covers
// the run period, so setting end_date on the live profile is what stops a
// consultant being paid. Flipping employee_status does not: the resolver never
// looks at it. This is the affordance for that, reachable from both ESP lists.
async function endHrEspEngagement(espId, employeeLabel, onDone) {
  if (espId == null) { showToast('Save this service profile before ending the engagement.', 'error'); return; }
  const today = new Date().toISOString().slice(0, 10);
  const entered = prompt(
    `End the engagement for ${employeeLabel || 'this consultant'}.\n\n` +
    `Last day covered (YYYY-MM-DD). Consultant runs whose period starts after this date will skip them.`,
    today);
  if (entered === null) return;
  const endDate = entered.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) { showToast('Enter the date as YYYY-MM-DD.', 'error'); return; }

  const res = await apiFetch(`${API_BASE}/payroll/employee-service-profiles/${espId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ end_date: endDate }),
  });
  if (!res) return;
  if (res.ok) {
    showToast(`Engagement ends ${endDate}.`, 'success');
    if (typeof onDone === 'function') await onDone();
    return;
  }
  showToast('Error: ' + await parseApiError(res), 'error');
}

function cancelHrEspForm() {
  const main = document.getElementById('main-content');
  switch (hrEspFormState.sourceView) {
    case 'hr-add':
      renderHrAddPage(main);
      switchHrAddTab('service-profile');
      break;
    case 'hr-edit':
      renderHrEditPage(main, hrEditRecord);
      switchHrEditTab('service-profile');
      break;
    case 'payroll':
      loadPayrollEspListingView(main);
      break;
  }
}

async function submitHrEspForm() {
  const empCode = (document.getElementById('hr-esp-emp-code')?.value || '').trim();
  const reasonEvent       = document.getElementById('hr-esp-reason-event')?.value || '';
  const payGrade          = document.getElementById('hr-esp-pay-grade')?.value || '';
  const disbursementMode  = document.getElementById('hr-esp-disbursement-mode')?.value || '';
  const effectiveDate     = document.getElementById('hr-esp-effective-date')?.value || '';

  const emp     = (employeesData || []).find(e => e.employee_code === empCode);
  const isConsultant = !!emp && emp.tax_profile === 'consultant';

  if (!empCode)          { showToast('Employee Code is required.', 'error'); return; }
  if (!reasonEvent)      { showToast('Reason/Event is required.', 'error'); return; }
  // A consultant profile must not carry a pay grade at all — the API 400s on
  // one — so it can't be a required field for them.
  if (!isConsultant && !payGrade) { showToast('Pay Grade is required.', 'error'); return; }
  if (!disbursementMode) { showToast('Salary Disbursement Mode is required.', 'error'); return; }
  if (!effectiveDate)    { showToast('Effective Date is required.', 'error'); return; }
  const endDateVal = document.getElementById('hr-esp-end-date')?.value || '';
  if (endDateVal && endDateVal < effectiveDate) {
    showToast('End Date cannot be before the Effective Date.', 'error'); return;
  }

  const isEdit  = hrEspFormState.context === 'edit';
  const espId   = hrEspFormState.existingRecord?.id;

  // The API keys service profiles by the numeric employee id, not the code the
  // form collects — resolve it here and fail loudly rather than posting a body
  // the backend rejects with "employee_id: Field required".
  const employeeId = emp?.id ?? hrEspFormState.existingRecord?.employee_id ?? null;
  if (!isEdit && employeeId == null) {
    showToast(`No employee found with code ${empCode}. Pick one from the list.`, 'error');
    return;
  }

  const empName = employeeFullName(emp) || hrEspFormState.lockedEmpName;

  // Map internal camelCase bank account fields to snake_case for the API
  // account_details is a display-only column the API's BankAccountCreate has no
  // field for, so it stays out of the request body.
  const bankAccountsForApi = hrEspFormState.bankAccounts.map(b => ({
    account_no:               b.accountNo || '',
    financial_institution_id: b.bankId || null,
    percentage:               parseFloat(b.percentage) || 0,
    account_name:             b.accountName || null,
    gateway_display_name:     b.gatewayDisplayName || null,
  }));

  const payload = {
    reason_event:              reasonEvent,
    processing_method:         document.getElementById('hr-esp-processing-method')?.value || '',
    basic_salary:              parseFloat(document.getElementById('hr-esp-basic-salary')?.value) || null,
    effective_date:            effectiveDate,
    end_date:                  endDateVal || null,
    // Blank means "not set" — the enum rejects an empty string, so send null.
    employee_status:           document.getElementById('hr-esp-emp-status')?.value || null,
    salary_disbursement_mode:  disbursementMode,
    bank_accounts: bankAccountsForApi,
    notes: document.getElementById('hr-esp-notes')?.value || '',
  };
  // create_service_profile/update_service_profile 400 when a consultant's
  // profile carries a pay grade or any sheltered_* flag. The inputs stay in the
  // DOM while hidden (so switching the employee picker doesn't wipe a
  // half-filled form), so their values are never read for a consultant.
  //
  // Sent as explicit null/false rather than omitted: ServiceProfileCreate
  // defaults every sheltered_* to false, so the backend always sees the field
  // and must be testing its value, not its presence — and on the PATCH-shaped
  // update path an omitted key would leave a legacy true in place and keep
  // tripping the guard. This clears it instead.
  if (isConsultant) {
    payload.pay_grade_id           = null;
    payload.sheltered_paye         = false;
    payload.sheltered_shif         = false;
    payload.sheltered_nssf         = false;
    payload.sheltered_housing_levy = false;
  } else {
    payload.pay_grade_id           = parseInt(payGrade, 10) || null;
    payload.sheltered_paye         = document.getElementById('hr-esp-sh-paye')?.checked    || false;
    payload.sheltered_shif         = document.getElementById('hr-esp-sh-shif')?.checked    || false;
    payload.sheltered_nssf         = document.getElementById('hr-esp-sh-nssf')?.checked    || false;
    payload.sheltered_housing_levy = document.getElementById('hr-esp-sh-housing')?.checked || false;
  }
  // Create takes employee_id; the update schema has no employee field at all.
  if (!isEdit) payload.employee_id = employeeId;

  const url     = isEdit && espId
    ? `${API_BASE}/payroll/employee-service-profiles/${espId}`
    : `${API_BASE}/payroll/employee-service-profiles/`;
  const method  = isEdit && espId ? 'PUT' : 'POST';

  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res) return;

  if (res.ok) {
    const saved = await res.json().catch(() => null);
    // Build local record for in-memory caches (mirrors API fields + display-only extras)
    const record = {
      ...(saved || payload),
      id:            saved?.id || (isEdit ? espId : Date.now()),
      employee_code: empCode,
      employee_name: empName,
      department:    document.getElementById('hr-esp-department')?.value || '',
      bank_accounts: [...hrEspFormState.bankAccounts],  // keep camelCase for local display
    };

    if (isEdit) {
      const gi = employeeServiceProfilesData.findIndex(r => r.id === record.id);
      if (gi !== -1) employeeServiceProfilesData[gi] = record;
      if (hrEspFormState.sourceView === 'hr-edit' && hrEditRecord) {
        if (!hrEditRecord.service_profile) hrEditRecord.service_profile = [];
        if (hrEspFormState.editSourceIdx >= 0) hrEditRecord.service_profile[hrEspFormState.editSourceIdx] = record;
      }
    } else {
      employeeServiceProfilesData.push(record);
      if (hrEspFormState.sourceView === 'hr-add') {
        if (!hrAddFormState.service_profile) hrAddFormState.service_profile = [];
        hrAddFormState.service_profile.push(record);
      } else if (hrEspFormState.sourceView === 'hr-edit' && hrEditRecord) {
        if (!hrEditRecord.service_profile) hrEditRecord.service_profile = [];
        hrEditRecord.service_profile.push(record);
      } else if (hrEspFormState.sourceView === 'payroll' && emp) {
        if (!emp.service_profile) emp.service_profile = [];
        emp.service_profile.push(record);
      }
    }
    showToast(isEdit ? 'Service profile updated!' : 'Service profile saved!', 'success');
    cancelHrEspForm();
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

