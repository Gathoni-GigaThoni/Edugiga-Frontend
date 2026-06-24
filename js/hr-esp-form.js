// ==================== EMPLOYEE SERVICE PROFILE — SHARED FORM ====================

function renderHrEspFormPage(container) {
  const isEdit     = hrEspFormState.context === 'edit';
  const sp         = hrEspFormState.existingRecord || {};
  const locked     = hrEspFormState.sourceView === 'hr-edit' ||
                     (hrEspFormState.sourceView === 'payroll' && isEdit);
  const showStrip  = hrEspFormState.sourceView === 'hr-edit';
  const bcPrefix   = hrEspFormState.sourceView === 'payroll'
    ? 'Dashboard &rsaquo; Payroll &rsaquo;'
    : 'Dashboard &rsaquo; Human Resource &rsaquo; Employee &rsaquo;';
  const sel = (val, opt) => val === opt ? 'selected' : '';
  const pre = key  => sp[key] || '';

  // Pre-compute department for locked employee
  let lockedDept = pre('department');
  if (locked && hrEspFormState.lockedEmpCode && !lockedDept) {
    const lockedEmp = employeesData.find(e => e.employee_code === hrEspFormState.lockedEmpCode);
    if (lockedEmp) lockedDept = lockedEmp.department || '';
  }

  const empOptions = employeesData.map(e => {
    const name = ((e.surname || e.first_name || '') + ' ' + (e.other_names || e.last_name || '')).trim();
    return `<option value="${e.employee_code}">${name} (${e.employee_code})</option>`;
  }).join('');

  const stripHtml = showStrip ? `
    <div class="hr-edit-info-strip">
      <div class="hr-edit-info-item">
        <span class="hr-edit-info-label">Employee Code:</span>
        <span class="hr-edit-info-value">${hrEspFormState.lockedEmpCode}</span>
      </div>
      <div class="hr-edit-info-item">
        <span class="hr-edit-info-label">Employee Name:</span>
        <span class="hr-edit-info-value">${hrEspFormState.lockedEmpName}</span>
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
              ? `<input type="text" id="hr-esp-emp-code" class="hr-form-input hr-form-readonly" value="${hrEspFormState.lockedEmpCode}" readonly>`
              : `<input type="text" id="hr-esp-emp-code" list="hr-esp-emp-list" class="hr-form-input" placeholder="Search employee..." onchange="onHrEspEmpCodeChange()">
                 <datalist id="hr-esp-emp-list">${empOptions}</datalist>`}
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Department</label>
            <input type="text" id="hr-esp-department" class="hr-form-input hr-form-readonly" value="${lockedDept}" readonly placeholder="Auto-populated">
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
          <div class="hr-form-group">
            <label class="hr-form-label">Pay Grade <span class="hr-required">*</span></label>
            <select id="hr-esp-pay-grade" class="hr-form-select">
              <option value="">Please Select</option>
              <option value="Grade 1" ${sel(pre('pay_grade'),'Grade 1')}>Grade 1</option>
              <option value="Grade 2" ${sel(pre('pay_grade'),'Grade 2')}>Grade 2</option>
              <option value="Grade 3" ${sel(pre('pay_grade'),'Grade 3')}>Grade 3</option>
              <option value="Grade 4" ${sel(pre('pay_grade'),'Grade 4')}>Grade 4</option>
              <option value="Grade 5" ${sel(pre('pay_grade'),'Grade 5')}>Grade 5</option>
            </select>
          </div>
          <div class="hr-form-group hr-form-span2">
            <label class="hr-form-label">Basic Salary</label>
            <input type="number" id="hr-esp-basic-salary" class="hr-form-input" step="0.01" min="0" value="${pre('basic_salary')}" placeholder="Enter basic salary">
          </div>
        </div>

        <div class="hr-esp-sheltered-section">
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
              <option value="Active"     ${sel(pre('employee_status'),'Active')}>Active</option>
              <option value="Inactive"   ${sel(pre('employee_status'),'Inactive')}>Inactive</option>
              <option value="Suspended"  ${sel(pre('employee_status'),'Suspended')}>Suspended</option>
              <option value="On Leave"   ${sel(pre('employee_status'),'On Leave')}>On Leave</option>
            </select>
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Salary Disbursement Mode <span class="hr-required">*</span></label>
            <select id="hr-esp-disbursement-mode" class="hr-form-select">
              <option value="">Please Select</option>
              <option value="Bank Transfer"  ${sel(pre('salary_disbursement_mode'),'Bank Transfer')}>Bank Transfer</option>
              <option value="Cash"           ${sel(pre('salary_disbursement_mode'),'Cash')}>Cash</option>
              <option value="Cheque"         ${sel(pre('salary_disbursement_mode'),'Cheque')}>Cheque</option>
              <option value="Mobile Money"   ${sel(pre('salary_disbursement_mode'),'Mobile Money')}>Mobile Money</option>
            </select>
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">Effective Date <span class="hr-required">*</span></label>
            <input type="date" id="hr-esp-effective-date" class="hr-form-input" value="${pre('effective_date')}">
          </div>
          <div class="hr-form-group">
            <label class="hr-form-label">End Date</label>
            <input type="date" id="hr-esp-end-date" class="hr-form-input" value="${pre('end_date')}">
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
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrEspBankModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEspBankAccount()">Select</button>
        </div>
      </div>
    </div>
  `;
}

function renderHrEspBankSection() {
  const banks = hrEspFormState.bankAccounts || [];
  const maxReached = banks.length >= 2;
  const total = banks.reduce((s, b) => s + (parseFloat(b.percentage) || 0), 0);
  const totalCls = total === 100 ? 'hr-esp-bank-total--ok' : 'hr-esp-bank-total--warn';
  const rows = banks.length === 0
    ? `<tr><td colspan="5" class="hr-empty">No bank accounts added</td></tr>`
    : banks.map((b, i) => `<tr>
        <td>${b.accountNo || ''}</td>
        <td>${b.bank || ''}</td>
        <td>${b.accountDetails || ''}</td>
        <td>${b.percentage || 0}%</td>
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
          <th>ACCOUNT NO.</th><th>BANK</th><th>ACCOUNT DETAILS</th><th>PERCENTAGE</th><th>ACTION</th>
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
  ['hr-esp-bank-acct-no','hr-esp-bank-acct-details'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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
    percentage:       parseFloat(document.getElementById('hr-esp-bank-pct')?.value || 0)
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
  const emp  = employeesData.find(e => e.employee_code === code);
  const deptEl = document.getElementById('hr-esp-department');
  if (deptEl) deptEl.value = emp ? (emp.department || '') : '';
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

  if (!empCode)          { showToast('Employee Code is required.', 'error'); return; }
  if (!reasonEvent)      { showToast('Reason/Event is required.', 'error'); return; }
  if (!payGrade)         { showToast('Pay Grade is required.', 'error'); return; }
  if (!disbursementMode) { showToast('Salary Disbursement Mode is required.', 'error'); return; }
  if (!effectiveDate)    { showToast('Effective Date is required.', 'error'); return; }

  const emp     = employeesData.find(e => e.employee_code === empCode);
  const empName = emp
    ? ((emp.first_name || emp.surname || '') + ' ' + (emp.last_name || emp.other_names || '')).trim()
    : hrEspFormState.lockedEmpName;

  // Map internal camelCase bank account fields to snake_case for the API
  const bankAccountsForApi = hrEspFormState.bankAccounts.map(b => ({
    account_no:      b.accountNo || '',
    bank_id:         b.bankId || null,
    account_details: b.accountDetails || '',
    percentage:      parseFloat(b.percentage) || 0,
  }));

  const payload = {
    employee_code:             empCode,
    reason_event:              reasonEvent,
    processing_method:         document.getElementById('hr-esp-processing-method')?.value || '',
    pay_grade:                 payGrade,
    basic_salary:              parseFloat(document.getElementById('hr-esp-basic-salary')?.value) || null,
    effective_date:            effectiveDate,
    end_date:                  document.getElementById('hr-esp-end-date')?.value || null,
    employee_status:           document.getElementById('hr-esp-emp-status')?.value || '',
    salary_disbursement_mode:  disbursementMode,
    sheltered_paye:            document.getElementById('hr-esp-sh-paye')?.checked    || false,
    sheltered_shif:            document.getElementById('hr-esp-sh-shif')?.checked    || false,
    sheltered_nssf:            document.getElementById('hr-esp-sh-nssf')?.checked    || false,
    sheltered_housing_levy:    document.getElementById('hr-esp-sh-housing')?.checked || false,
    bank_accounts: bankAccountsForApi,
    notes: document.getElementById('hr-esp-notes')?.value || '',
  };

  const isEdit  = hrEspFormState.context === 'edit';
  const espId   = hrEspFormState.existingRecord?.id;
  const url     = isEdit && espId
    ? `${API_BASE}/employee-service-profiles/${espId}/`
    : `${API_BASE}/employee-service-profiles/`;
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

