
// ---- Edit Employee shell ----
function renderHrEditPage(container, record) {
  const name = ((record.surname || record.first_name || '') + ' ' + (record.other_names || record.last_name || '')).trim();
  container.innerHTML = `
    <div class="hr-page">
      <div class="hr-header-row">
        <h2 class="hr-title">Employee</h2>
        <div class="hr-breadcrumb" id="hr-edit-breadcrumb">
          Dashboard &rsaquo; Human Resource &rsaquo; Employee &rsaquo; ${getHrTabLabel(hrEditActiveTab)}
        </div>
      </div>
      <div class="hr-edit-info-strip">
        <div class="hr-edit-info-item">
          <span class="hr-edit-info-label">Employee Code:</span>
          <span class="hr-edit-info-value">${record.employee_code || record.id || '—'}</span>
        </div>
        <div class="hr-edit-info-item">
          <span class="hr-edit-info-label">Employee Name:</span>
          <span class="hr-edit-info-value" id="hr-edit-info-name">${name || '—'}</span>
        </div>
      </div>
      <div class="hr-form-tabs" id="hr-edit-tab-bar">
        ${buildHrTabBar(hrEditActiveTab, 'switchHrEditTab')}
      </div>
      <div id="hr-edit-tab-content">
        ${renderHrEditTabContent(hrEditActiveTab)}
      </div>
    </div>
    ${hrEditModalsHtml()}
  `;
  loadDepartmentOptions('hr-edit-department', hrEditRecord.department_id);
  loadHrWhtPaymentTypes('edit', hrEditRecord.contractor_wht_payment_type);
}

function hrEditTabPlaceholder() {
  return `<div class="hr-tab-body"><h3 style="color:#777;margin-top:0;">Coming Soon</h3><p>This tab will be implemented in Prompt 3.</p></div>`;
}

// ==================== EDIT EMPLOYEE — FULL TAB IMPLEMENTATIONS ====================

// ---- Modals HTML for Edit context (same IDs as Add, different save handlers) ----
function hrEditModalsHtml() {
  return `
    <div id="hr-ec-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrEmergencyContactModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Emergency Contact Detail</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field">
            <label class="hr-form-label">Emergency Contact Name <span class="hr-required">*</span></label>
            <input type="text" id="hr-ec-name" class="hr-modal-input" placeholder="Full Name">
          </div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Emergency Contact Number</label>
            <div class="hr-phone-row">
              <select id="hr-ec-phone-code" class="hr-phone-code-sel">
                <option value="+254">+254 (KE)</option><option value="+1">+1 (US)</option><option value="+44">+44 (UK)</option>
              </select>
              <input type="tel" id="hr-ec-phone" class="hr-modal-input" placeholder="Number">
            </div>
          </div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Relationship</label>
            <select id="hr-ec-relationship" class="hr-modal-select">
              <option value="">Please Select</option>
              <option value="Spouse">Spouse</option><option value="Parent">Parent</option>
              <option value="Sibling">Sibling</option><option value="Friend">Friend</option><option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrEmergencyContactModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEditEmergencyContact()">Select</button>
        </div>
      </div>
    </div>
    <div id="hr-edu-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddEducationModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title" id="hr-edu-modal-title">Add Education</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Qualification</label><input type="text" id="hr-edu-qualification" class="hr-modal-input" placeholder="e.g. Bachelor of Science"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Institution</label><input type="text" id="hr-edu-institution" class="hr-modal-input" placeholder="e.g. University of Nairobi"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Academic Time</label><input type="text" id="hr-edu-time" class="hr-modal-input" placeholder="e.g. 2015 – 2019"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Awards / Grades</label><input type="text" id="hr-edu-grades" class="hr-modal-input" placeholder="e.g. First Class Honours"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Attachment</label><input type="file" id="hr-edu-attachment" class="hr-modal-input"></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddEducationModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEditEducation()">Submit</button>
        </div>
      </div>
    </div>
    <div id="hr-idoc-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddIdentityModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title" id="hr-idoc-modal-title">Add Identity Document</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Document Title</label><input type="text" id="hr-idoc-title" class="hr-modal-input" placeholder="e.g. National ID"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Attachment</label><input type="file" id="hr-idoc-file" class="hr-modal-input"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Date Attached</label><input type="date" id="hr-idoc-date" class="hr-modal-input"></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddIdentityModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEditIdentityDoc()">Submit</button>
        </div>
      </div>
    </div>
    <div id="hr-dep-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddDependentModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title" id="hr-dep-modal-title">Add Dependent</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Dependent Name <span class="hr-required">*</span></label><input type="text" id="hr-dep-name" class="hr-modal-input" placeholder="Full Name"></div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Relationship <span class="hr-required">*</span></label>
            <select id="hr-dep-relationship" class="hr-modal-select">
              <option value="">Please Select</option><option value="Spouse">Spouse</option>
              <option value="Child">Child</option><option value="Parent">Parent</option><option value="Sibling">Sibling</option>
            </select>
          </div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Gender <span class="hr-required">*</span></label>
            <select id="hr-dep-gender" class="hr-modal-select">
              <option value="">Please Select</option><option value="Male">Male</option><option value="Female">Female</option>
            </select>
          </div>
          <div class="hr-modal-field"><label class="hr-form-label">Birth Date <span class="hr-required">*</span></label><input type="date" id="hr-dep-birth-date" class="hr-modal-input"></div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Insurance Type</label>
            <select id="hr-dep-insurance" class="hr-modal-select">
              <option value="">Please Select</option><option value="NHIF">NHIF</option>
              <option value="Private">Private</option><option value="None">None</option>
            </select>
          </div>
          <div class="hr-modal-field">
            <label class="hr-dep-enrolled-label">
              <input type="checkbox" id="hr-dep-enrolled" class="hr-dep-cb" onchange="toggleHrDependentEnrolled()"> Enrolled in this School?
            </label>
          </div>
          <div id="hr-dep-enrolled-section" class="hr-dep-enrolled-section" style="display:none;">
            <div class="hr-modal-field"><label class="hr-form-label">Student Name</label><input type="text" id="hr-dep-student-name" class="hr-modal-input" placeholder="Student Name"></div>
            <div class="hr-modal-field"><label class="hr-form-label">Student ID</label><input type="text" id="hr-dep-student-id" class="hr-modal-input" placeholder="Student ID"></div>
          </div>
          <div class="hr-modal-field"><label class="hr-form-label">Notes</label><textarea id="hr-dep-notes" class="hr-modal-textarea" rows="3" placeholder="Additional notes..."></textarea></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddDependentModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEditDependent()">Submit</button>
        </div>
      </div>
    </div>
  `;
}

// ---- Tab content dispatcher ----
function renderHrEditTabContent(tabId) {
  switch (tabId) {
    case 'basic':           return renderHrEditTabBasic();
    case 'medical':         return renderHrEditTabMedical();
    case 'education':       return renderHrEditTabEducation();
    case 'identity':        return renderHrEditTabIdentity();
    case 'dependents':      return renderHrEditTabDependents();
    case 'service-profile': return renderHrEditTabServiceProfile();
    default: return '<p>Unknown tab.</p>';
  }
}

// ---- Shared helpers ----
function showHrEditSuccess(containerId, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => { if (el) el.style.display = 'none'; }, 2500);
}

function cancelHrEdit() {
  loadHrEmployeeDirectoryView(document.getElementById('main-content'));
}

function handleHrEditPhotoPreview(input) {
  if (!input.files[0]) return;
  hrEditRecord.photo = input.files[0].name;
  const preview = document.getElementById('hr-edit-photo-preview');
  if (preview) {
    const url = URL.createObjectURL(input.files[0]);
    const img = document.createElement('img');
    img.alt = 'Preview';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
    img.onload = () => URL.revokeObjectURL(url);
    img.src = url;
    preview.innerHTML = '';
    preview.appendChild(img);
  }
}

// ==================== EDIT TAB A — Basic Information ====================
function renderHrEditTabBasic() {
  const r = hrEditRecord;
  const sel = (val, opt) => val === opt ? 'selected' : '';
  const ecInfo = r.emergency_contact
    ? `<span class="hr-ec-saved">Saved: ${r.emergency_contact.name}</span>` : '';
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">Employee Code <span class="hr-required">*</span></label>
          <input type="text" class="hr-form-input hr-form-readonly" value="${r.employee_code || r.id || ''}" readonly>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Employment Terms <span class="hr-required">*</span></label>
          <select id="hr-edit-employment-terms" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="permanent" ${sel(r.employment_terms,'permanent')}>Permanent</option>
            <option value="contract"  ${sel(r.employment_terms,'contract')}>Contract</option>
            <option value="casual"    ${sel(r.employment_terms,'casual')}>Casual</option>
            <option value="intern"    ${sel(r.employment_terms,'intern')}>Intern</option>
            <option value="part_time" ${sel(r.employment_terms,'part_time')}>Part-time</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Surname <span class="hr-required">*</span></label>
          <input type="text" id="hr-edit-surname" class="hr-form-input" value="${r.surname || r.last_name || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Other Names <span class="hr-required">*</span></label>
          <input type="text" id="hr-edit-other-names" class="hr-form-input" value="${r.other_names || r.first_name || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Department</label>
          <select id="hr-edit-department" class="hr-form-select"><option value="">Loading&#8230;</option></select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Email <span class="hr-required">*</span></label>
          <input type="email" id="hr-edit-email" class="hr-form-input" value="${r.email || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Phone Number</label>
          <div class="hr-phone-row">
            <select id="hr-edit-phone-code" class="hr-phone-code-sel">
              <option value="+254" ${sel(r.phone_code||'+254','+254')}>+254 (KE)</option>
              <option value="+1"   ${sel(r.phone_code,'+1')}>+1 (US)</option>
              <option value="+44"  ${sel(r.phone_code,'+44')}>+44 (UK)</option>
              <option value="+91"  ${sel(r.phone_code,'+91')}>+91 (IN)</option>
            </select>
            <input type="tel" id="hr-edit-phone" class="hr-form-input" value="${r.phone || ''}">
          </div>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Birth Date <span class="hr-required">*</span></label>
          <input type="date" id="hr-edit-birth-date" class="hr-form-input" value="${r.birth_date || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Gender <span class="hr-required">*</span></label>
          <select id="hr-edit-gender" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Male"   ${sel(r.gender,'Male')}>Male</option>
            <option value="Female" ${sel(r.gender,'Female')}>Female</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Joining Date <span class="hr-required">*</span></label>
          <input type="date" id="hr-edit-joining-date" class="hr-form-input" value="${r.joining_date || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Probation Period (days) <span class="hr-required">*</span></label>
          <input type="number" id="hr-edit-probation" class="hr-form-input" value="${r.probation_period || ''}" min="0">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Confirmation Date</label>
          <input type="text" class="hr-form-input hr-form-readonly" value="${r.confirmation_date || ''}" readonly placeholder="Auto-calculated">
        </div>
        <div class="hr-form-group hr-form-span2">
          <label class="hr-form-label">Address</label>
          <textarea id="hr-edit-address" class="hr-form-textarea" rows="3">${r.address || ''}</textarea>
        </div>
      </div>
      <div class="hr-form-ec-row">
        <button class="hr-form-section-btn" onclick="showHrEditEcModal()">+ Add Emergency Contact Details</button>
        ${ecInfo}
      </div>
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">Nationality <span class="hr-required">*</span></label>
          <select id="hr-edit-nationality" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Kenyan"    ${sel(r.nationality,'Kenyan')}>Kenyan</option>
            <option value="Ugandan"   ${sel(r.nationality,'Ugandan')}>Ugandan</option>
            <option value="Tanzanian" ${sel(r.nationality,'Tanzanian')}>Tanzanian</option>
            <option value="British"   ${sel(r.nationality,'British')}>British</option>
            <option value="American"  ${sel(r.nationality,'American')}>American</option>
            <option value="Other"     ${sel(r.nationality,'Other')}>Other</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">National ID No</label>
          <input type="text" id="hr-edit-national-id" class="hr-form-input" value="${r.national_id || ''}">
        </div>
      </div>
      <div class="hr-form-checkboxes">
        <label class="hr-form-checkbox-label">
          <input type="checkbox" id="hr-edit-director" class="hr-form-cb" ${r.is_director ? 'checked' : ''}> Director?
        </label>
      </div>
      ${renderHrTaxProfileFieldset('edit', r)}
      <div class="hr-photo-section">
        <label class="hr-form-label">Photo</label>
        <div class="hr-photo-row">
          <label class="hr-photo-box" for="hr-edit-photo">
            <span class="hr-photo-icon">&#8679;</span>
            <span class="hr-photo-text">Click to upload</span>
            <input type="file" id="hr-edit-photo" accept="image/*" style="display:none;" onchange="handleHrEditPhotoPreview(this)">
          </label>
          <div class="hr-photo-avatar" id="hr-edit-photo-preview">
            <span class="hr-avatar-placeholder">&#128100;</span>
          </div>
        </div>
      </div>
      <div id="hr-edit-status-basic" class="hr-edit-success" style="display:none;"></div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="updateHrEditBasic()">Update</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrEdit()">Cancel</button>
      </div>
    </div>
  `;
}

async function updateHrEditBasic() {
  const gv  = id => document.getElementById(id)?.value || '';
  const gvt = id => (document.getElementById(id)?.value || '').trim();
  const employment_terms = gv('hr-edit-employment-terms');
  const surname          = gvt('hr-edit-surname');
  const other_names      = gvt('hr-edit-other-names');
  const email            = gvt('hr-edit-email');
  const birth_date       = gv('hr-edit-birth-date');
  const gender           = gv('hr-edit-gender');
  const joining_date     = gv('hr-edit-joining-date');
  const probation_period = gv('hr-edit-probation');
  const nationality      = gv('hr-edit-nationality');

  if (!employment_terms) { showToast('Employment Terms is required.', 'error'); return; }
  if (!surname)          { showToast('Surname is required.', 'error'); return; }
  if (!other_names)      { showToast('Other Names is required.', 'error'); return; }
  if (!email)            { showToast('Email is required.', 'error'); return; }
  if (!birth_date)       { showToast('Birth Date is required.', 'error'); return; }
  if (!gender)           { showToast('Gender is required.', 'error'); return; }
  if (!joining_date)     { showToast('Joining Date is required.', 'error'); return; }
  if (!probation_period) { showToast('Probation Period is required.', 'error'); return; }
  if (!nationality)      { showToast('Nationality is required.', 'error'); return; }

  const taxProfileEl = document.querySelector('input[name="hr-edit-tax-profile"]:checked');
  const tax_profile = taxProfileEl ? taxProfileEl.value : 'employee';
  const contractor_wht_payment_type = gv('hr-edit-wht-type');
  if (tax_profile === 'contractor' && !contractor_wht_payment_type) {
    showToast('Payment Type is required for contractor employees.', 'error'); return;
  }
  hrEditRecord.tax_profile = tax_profile;
  hrEditRecord.contractor_wht_payment_type = tax_profile === 'contractor' ? contractor_wht_payment_type : null;
  hrEditRecord.is_non_resident = tax_profile === 'contractor' ? (document.getElementById('hr-edit-non-resident')?.checked || false) : false;
  hrEditRecord.contractor_kra_pin = tax_profile === 'contractor' ? gvt('hr-edit-contractor-kra-pin') : null;

  hrEditRecord.employment_terms = employment_terms;
  hrEditRecord.last_name        = surname;
  hrEditRecord.first_name       = other_names;
  hrEditRecord.department_id    = gv('hr-edit-department') || null;
  hrEditRecord.email            = email;
  hrEditRecord.phone_code       = gv('hr-edit-phone-code');
  hrEditRecord.phone            = gv('hr-edit-phone');
  hrEditRecord.birth_date       = birth_date;
  hrEditRecord.gender           = gender;
  hrEditRecord.joining_date     = joining_date;
  hrEditRecord.probation_period = probation_period;
  hrEditRecord.address          = gv('hr-edit-address');
  hrEditRecord.nationality      = nationality;
  hrEditRecord.national_id      = gvt('hr-edit-national-id');
  hrEditRecord.is_director      = document.getElementById('hr-edit-director')?.checked || false;

  const nameEl = document.getElementById('hr-edit-info-name');
  if (nameEl) nameEl.textContent = (other_names + ' ' + surname).trim();

  const empId = hrEditRecord.id || hrEditRecord.employee_code;
  const ec = hrEditRecord.emergency_contact || null;
  const payload = {
    employment_terms:  hrEditRecord.employment_terms,
    last_name:         hrEditRecord.last_name,
    first_name:        hrEditRecord.first_name,
    department_id:     hrEditRecord.department_id ? parseInt(hrEditRecord.department_id, 10) : null,
    email:             hrEditRecord.email,
    phone_country_code: hrEditRecord.phone_code,
    phone_number:      hrEditRecord.phone,
    birth_date:        hrEditRecord.birth_date,
    gender:            hrEditRecord.gender,
    joining_date:      hrEditRecord.joining_date,
    probation_days:    hrEditRecord.probation_period ? parseInt(hrEditRecord.probation_period, 10) : null,
    address:           hrEditRecord.address,
    nationality:       hrEditRecord.nationality,
    national_id_no:    hrEditRecord.national_id,
    is_director:       hrEditRecord.is_director,
    emergency_contact_name:         ec?.name || null,
    emergency_contact_country_code: ec?.phone_code || null,
    emergency_contact_number:       ec?.phone || null,
    emergency_contact_relationship: ec?.relationship || null,
    tax_profile:                   hrEditRecord.tax_profile,
    contractor_wht_payment_type:   hrEditRecord.contractor_wht_payment_type,
    is_non_resident:               hrEditRecord.is_non_resident,
    contractor_kra_pin:            hrEditRecord.contractor_kra_pin,
  };

  const res = await apiFetch(`${API_BASE}/hr/employees/${empId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    const updated = await res.json().catch(() => null);
    if (updated) Object.assign(hrEditRecord, updated);
    showToast('Basic information updated successfully.', 'success');
    showHrEditSuccess('hr-edit-status-basic', 'Basic information updated successfully.');
  } else {
    showToast(res ? await parseApiError(res) : 'Network error.', 'error');
  }
}

// ---- Emergency contact (Edit context) ----
function showHrEditEcModal() {
  const ec = hrEditRecord.emergency_contact;
  if (ec) {
    const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setv('hr-ec-name', ec.name);
    setv('hr-ec-phone-code', ec.phone_code || '+254');
    setv('hr-ec-phone', ec.phone);
    setv('hr-ec-relationship', ec.relationship);
  } else {
    ['hr-ec-name','hr-ec-phone','hr-ec-relationship'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  }
  const ov = document.getElementById('hr-ec-overlay');
  if (ov) ov.style.display = 'flex';
}

function saveHrEditEmergencyContact() {
  const name = (document.getElementById('hr-ec-name')?.value || '').trim();
  if (!name) { alert('Emergency contact name is required.'); return; }
  hrEditRecord.emergency_contact = {
    name,
    phone_code:   document.getElementById('hr-ec-phone-code')?.value || '',
    phone:        document.getElementById('hr-ec-phone')?.value || '',
    relationship: document.getElementById('hr-ec-relationship')?.value || ''
  };
  closeHrEmergencyContactModal();
  const saved = document.querySelector('.hr-ec-saved');
  const row   = document.querySelector('.hr-form-ec-row');
  if (saved) { saved.textContent = 'Saved: ' + name; }
  else if (row) { const sp = document.createElement('span'); sp.className = 'hr-ec-saved'; sp.textContent = 'Saved: ' + name; row.appendChild(sp); }
}

// ==================== EDIT TAB B — Medical Information ====================
function renderHrEditTabMedical() {
  const r = hrEditRecord;
  const sel = (val, opt) => val === opt ? 'selected' : '';
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid-single">
        <div class="hr-form-group">
          <label class="hr-form-label">Disability Type <span class="hr-required">*</span></label>
          <select id="hr-edit-disability-type" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="None"     ${sel(r.disability_type,'None')}>None</option>
            <option value="Physical" ${sel(r.disability_type,'Physical')}>Physical</option>
            <option value="Visual"   ${sel(r.disability_type,'Visual')}>Visual</option>
            <option value="Hearing"  ${sel(r.disability_type,'Hearing')}>Hearing</option>
            <option value="Other"    ${sel(r.disability_type,'Other')}>Other</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Medical Info</label>
          <textarea id="hr-edit-medical-info" class="hr-form-textarea" rows="5">${r.medical_info || ''}</textarea>
        </div>
      </div>
      <div id="hr-edit-status-medical" class="hr-edit-success" style="display:none;"></div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="updateHrEditMedical()">Update</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrEdit()">Cancel</button>
      </div>
    </div>
  `;
}

async function updateHrEditMedical() {
  const disability_type = document.getElementById('hr-edit-disability-type')?.value || '';
  if (!disability_type) { showToast('Disability Type is required.', 'error'); return; }
  hrEditRecord.disability_type = disability_type;
  hrEditRecord.medical_info    = document.getElementById('hr-edit-medical-info')?.value || '';

  const empId = hrEditRecord.id || hrEditRecord.employee_code;
  const res = await apiFetch(`${API_BASE}/hr/employees/${empId}/medical`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      disability_type: hrEditRecord.disability_type,
      medical_info:    hrEditRecord.medical_info,
    }),
  });
  if (res && res.ok) {
    // Only lift disability_type/medical_info — this endpoint's response is the
    // medical sub-record (its own id/employee_id), not the employee, so a blind
    // Object.assign would clobber hrEditRecord.id with the wrong row id.
    const updated = await res.json().catch(() => null);
    if (updated) { hrEditRecord.disability_type = updated.disability_type; hrEditRecord.medical_info = updated.medical_info; }
    showToast('Medical information updated successfully.', 'success');
    showHrEditSuccess('hr-edit-status-medical', 'Medical information updated successfully.');
  } else {
    showToast(res ? await parseApiError(res) : 'Network error.', 'error');
  }
}

// ==================== EDIT TAB C — Education ====================
function renderHrEditTabEducation() {
  const rows = (hrEditRecord.education || []).length === 0
    ? `<tr><td colspan="6" class="hr-empty">No records found</td></tr>`
    : (hrEditRecord.education || []).map((e, i) => `<tr>
        <td>${e.qualification}</td><td>${e.institution}</td><td>${e.academic_time}</td>
        <td>${e.awards_grades}</td><td>${e.attachment || '—'}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrEditEduDropdown(event,${i})">&#8230;</button>
            <div id="hr-edit-edu-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="openHrEditEduModalEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteHrEditEducation(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="openHrEditEduModalNew()">Add Education</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>QUALIFICATION</th><th>INSTITUTION</th><th>ACADEMIC TIME</th>
          <th>AWARDS/GRADES</th><th>ATTACHMENT</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

function toggleHrEditEduDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-edit-edu-dd-"]').forEach(d => {
    if (d.id !== `hr-edit-edu-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-edit-edu-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function openHrEditEduModalNew() {
  hrEditingEduIdx = -1;
  ['hr-edu-qualification','hr-edu-institution','hr-edu-time','hr-edu-grades'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const f = document.getElementById('hr-edu-attachment'); if (f) f.value = '';
  const title = document.getElementById('hr-edu-modal-title'); if (title) title.textContent = 'Add Education';
  const ov = document.getElementById('hr-edu-overlay'); if (ov) ov.style.display = 'flex';
}

function openHrEditEduModalEdit(idx) {
  hrEditingEduIdx = idx;
  const e = (hrEditRecord.education || [])[idx];
  if (!e) return;
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setv('hr-edu-qualification', e.qualification);
  setv('hr-edu-institution',   e.institution);
  setv('hr-edu-time',          e.academic_time);
  setv('hr-edu-grades',        e.awards_grades);
  const title = document.getElementById('hr-edu-modal-title'); if (title) title.textContent = 'Edit Education';
  const ov = document.getElementById('hr-edu-overlay'); if (ov) ov.style.display = 'flex';
}

function saveHrEditEducation() {
  const rec = {
    qualification: document.getElementById('hr-edu-qualification')?.value || '',
    institution:   document.getElementById('hr-edu-institution')?.value || '',
    academic_time: document.getElementById('hr-edu-time')?.value || '',
    awards_grades: document.getElementById('hr-edu-grades')?.value || '',
    attachment:    document.getElementById('hr-edu-attachment')?.files?.[0]?.name || ((hrEditingEduIdx >= 0 ? (hrEditRecord.education[hrEditingEduIdx]?.attachment || '') : ''))
  };
  if (!hrEditRecord.education) hrEditRecord.education = [];
  if (hrEditingEduIdx === -1) {
    hrEditRecord.education.push(rec);
  } else {
    hrEditRecord.education[hrEditingEduIdx] = rec;
  }
  closeHrAddEducationModal();
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabEducation();
}

function deleteHrEditEducation(idx) {
  if (!confirm('Delete this education record?')) return;
  hrEditRecord.education.splice(idx, 1);
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabEducation();
}

// ==================== EDIT TAB D — Identity ====================
function renderHrEditTabIdentity() {
  const r = hrEditRecord;
  const rows = (r.identity_docs || []).length === 0
    ? `<tr><td colspan="4" class="hr-empty">No records found</td></tr>`
    : (r.identity_docs || []).map((d, i) => `<tr>
        <td>${d.doc_title}</td><td>${d.attachment || '—'}</td><td>${d.date_attached}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrEditIdocDropdown(event,${i})">&#8230;</button>
            <div id="hr-edit-idoc-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="openHrEditIdocModalEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteHrEditIdentityDoc(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">KRA PIN</label>
          <input type="text" id="hr-edit-kra-pin" class="hr-form-input" value="${r.kra_pin || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">NSSF Number</label>
          <input type="text" id="hr-edit-nssf" class="hr-form-input" value="${r.nssf_number || ''}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">SHIF Number</label>
          <input type="text" id="hr-edit-shif" class="hr-form-input" value="${r.shif_number || ''}">
        </div>
      </div>
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="openHrEditIdocModalNew()">Add Identity</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>DOCUMENT TITLE</th><th>ATTACHMENTS</th><th>DATE ATTACHED</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div id="hr-edit-status-identity" class="hr-edit-success" style="display:none;"></div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="updateHrEditIdentity()">Update</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrEdit()">Cancel</button>
      </div>
    </div>
  `;
}

async function updateHrEditIdentity() {
  hrEditRecord.kra_pin     = (document.getElementById('hr-edit-kra-pin')?.value || '').trim();
  hrEditRecord.nssf_number = (document.getElementById('hr-edit-nssf')?.value || '').trim();
  hrEditRecord.shif_number = (document.getElementById('hr-edit-shif')?.value || '').trim();
  hrEditRecord.identity_docs = hrEditRecord.identity_docs || [];

  const empId = hrEditRecord.id || hrEditRecord.employee_code;
  const res = await apiFetch(`${API_BASE}/hr/employees/${empId}/identity`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kra_pin:     hrEditRecord.kra_pin,
      nssf_number: hrEditRecord.nssf_number,
      shif_number: hrEditRecord.shif_number,
    }),
  });
  if (res && res.ok) {
    // Same reasoning as updateHrEditMedical — this is the identity sub-record,
    // not the employee, so only lift its own fields onto hrEditRecord.
    const updated = await res.json().catch(() => null);
    if (updated) {
      hrEditRecord.kra_pin     = updated.kra_pin;
      hrEditRecord.nssf_number = updated.nssf_number;
      hrEditRecord.shif_number = updated.shif_number;
    }
    showToast('Identity information updated successfully.', 'success');
    showHrEditSuccess('hr-edit-status-identity', 'Identity information updated successfully.');
  } else {
    showToast(res ? await parseApiError(res) : 'Network error.', 'error');
  }
}

function toggleHrEditIdocDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-edit-idoc-dd-"]').forEach(d => {
    if (d.id !== `hr-edit-idoc-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-edit-idoc-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function openHrEditIdocModalNew() {
  hrEditingIdocIdx = -1;
  ['hr-idoc-title','hr-idoc-date'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const f = document.getElementById('hr-idoc-file'); if (f) f.value = '';
  const title = document.getElementById('hr-idoc-modal-title'); if (title) title.textContent = 'Add Identity Document';
  const ov = document.getElementById('hr-idoc-overlay'); if (ov) ov.style.display = 'flex';
}

function openHrEditIdocModalEdit(idx) {
  hrEditingIdocIdx = idx;
  const d = (hrEditRecord.identity_docs || [])[idx];
  if (!d) return;
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setv('hr-idoc-title', d.doc_title);
  setv('hr-idoc-date',  d.date_attached);
  const title = document.getElementById('hr-idoc-modal-title'); if (title) title.textContent = 'Edit Identity Document';
  const ov = document.getElementById('hr-idoc-overlay'); if (ov) ov.style.display = 'flex';
}

function saveHrEditIdentityDoc() {
  const doc = {
    doc_title:     document.getElementById('hr-idoc-title')?.value || '',
    attachment:    document.getElementById('hr-idoc-file')?.files?.[0]?.name || (hrEditingIdocIdx >= 0 ? (hrEditRecord.identity_docs[hrEditingIdocIdx]?.attachment || '') : ''),
    date_attached: document.getElementById('hr-idoc-date')?.value || ''
  };
  if (!hrEditRecord.identity_docs) hrEditRecord.identity_docs = [];
  if (hrEditingIdocIdx === -1) {
    hrEditRecord.identity_docs.push(doc);
  } else {
    hrEditRecord.identity_docs[hrEditingIdocIdx] = doc;
  }
  closeHrAddIdentityModal();
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabIdentity();
}

function deleteHrEditIdentityDoc(idx) {
  if (!confirm('Delete this identity document?')) return;
  hrEditRecord.identity_docs.splice(idx, 1);
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabIdentity();
}

// ==================== EDIT TAB E — Dependents ====================
function renderHrEditTabDependents() {
  const rows = (hrEditRecord.dependents || []).length === 0
    ? `<tr><td colspan="6" class="hr-empty">No records found</td></tr>`
    : (hrEditRecord.dependents || []).map((d, i) => `<tr>
        <td>${d.name}</td><td>${d.insurance_type}</td><td>${d.relationship}</td>
        <td>${d.gender}</td><td>${d.birth_date}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrEditDepDropdown(event,${i})">&#8230;</button>
            <div id="hr-edit-dep-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="openHrEditDepModalEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteHrEditDependent(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="openHrEditDepModalNew()">Add Dependents</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>DEPENDENT NAME</th><th>INSURANCE TYPE</th><th>RELATIONSHIP</th>
          <th>GENDER</th><th>BIRTH DATE</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

function toggleHrEditDepDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-edit-dep-dd-"]').forEach(d => {
    if (d.id !== `hr-edit-dep-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-edit-dep-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function openHrEditDepModalNew() {
  hrEditingDepIdx = -1;
  ['hr-dep-name','hr-dep-student-name','hr-dep-student-id','hr-dep-birth-date','hr-dep-notes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['hr-dep-relationship','hr-dep-gender','hr-dep-insurance'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const cb  = document.getElementById('hr-dep-enrolled'); if (cb) cb.checked = false;
  const sec = document.getElementById('hr-dep-enrolled-section'); if (sec) sec.style.display = 'none';
  const title = document.getElementById('hr-dep-modal-title'); if (title) title.textContent = 'Add Dependent';
  const ov = document.getElementById('hr-dep-overlay'); if (ov) ov.style.display = 'flex';
}

function openHrEditDepModalEdit(idx) {
  hrEditingDepIdx = idx;
  const d = (hrEditRecord.dependents || [])[idx];
  if (!d) return;
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setv('hr-dep-name',         d.name);
  setv('hr-dep-relationship', d.relationship);
  setv('hr-dep-gender',       d.gender);
  setv('hr-dep-birth-date',   d.birth_date);
  setv('hr-dep-insurance',    d.insurance_type);
  setv('hr-dep-notes',        d.notes);
  const cb  = document.getElementById('hr-dep-enrolled');
  const sec = document.getElementById('hr-dep-enrolled-section');
  if (cb) { cb.checked = !!d.enrolled_in_school; }
  if (sec) { sec.style.display = d.enrolled_in_school ? 'block' : 'none'; }
  if (d.enrolled_in_school) {
    setv('hr-dep-student-name', d.student_name);
    setv('hr-dep-student-id',   d.student_id);
  }
  const title = document.getElementById('hr-dep-modal-title'); if (title) title.textContent = 'Edit Dependent';
  const ov = document.getElementById('hr-dep-overlay'); if (ov) ov.style.display = 'flex';
}

function saveHrEditDependent() {
  const name         = (document.getElementById('hr-dep-name')?.value || '').trim();
  const relationship = document.getElementById('hr-dep-relationship')?.value || '';
  const gender       = document.getElementById('hr-dep-gender')?.value || '';
  const birth_date   = document.getElementById('hr-dep-birth-date')?.value || '';
  if (!name)         { alert('Dependent name is required.'); return; }
  if (!relationship) { alert('Relationship is required.');  return; }
  if (!gender)       { alert('Gender is required.');        return; }
  if (!birth_date)   { alert('Birth Date is required.');    return; }
  const enrolled = document.getElementById('hr-dep-enrolled')?.checked || false;
  const dep = {
    name, relationship, gender, birth_date,
    insurance_type:     document.getElementById('hr-dep-insurance')?.value || '',
    enrolled_in_school: enrolled,
    student_name:       enrolled ? (document.getElementById('hr-dep-student-name')?.value || '') : '',
    student_id:         enrolled ? (document.getElementById('hr-dep-student-id')?.value || '')   : '',
    notes:              document.getElementById('hr-dep-notes')?.value || ''
  };
  if (!hrEditRecord.dependents) hrEditRecord.dependents = [];
  if (hrEditingDepIdx === -1) {
    hrEditRecord.dependents.push(dep);
  } else {
    hrEditRecord.dependents[hrEditingDepIdx] = dep;
  }
  closeHrAddDependentModal();
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabDependents();
}

function deleteHrEditDependent(idx) {
  if (!confirm('Delete this dependent?')) return;
  hrEditRecord.dependents.splice(idx, 1);
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabDependents();
}

// ==================== EDIT TAB F — Employee Service Profile ====================
function renderHrEditTabServiceProfile() {
  const rows = (hrEditRecord.service_profile || []).length === 0
    ? `<tr><td colspan="6" class="hr-empty">No records found</td></tr>`
    : (hrEditRecord.service_profile || []).map((sp, i) => `<tr>
        <td>${sp.reason_event || ''}</td><td>${payGradeLabelFor(sp.pay_grade_id)}</td>
        <td>${sp.basic_salary || ''}</td><td>${sp.effective_date || ''}</td><td>${sp.end_date || ''}</td>
        <td class="hr-action-cell">
          <div class="hr-action-wrap">
            <button class="hr-action-btn" onclick="toggleHrEditSpDropdown(event,${i})">&#8230;</button>
            <div id="hr-edit-sp-dd-${i}" class="hr-action-dropdown" style="display:none;">
              <a href="#" onclick="hrEditSpEdit(${i});return false;">&#9998; Edit</a>
              <a href="#" onclick="deleteHrEditServiceProfile(${i});return false;">&#128465; Delete</a>
            </div>
          </div>
        </td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="hrEditSpAdd()">Add Employee Service Profile</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>REASON/EVENT</th><th>PAY GRADE</th>
          <th>BASIC SALARY</th><th>EFFECTIVE DATE</th><th>END DATE</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

function toggleHrEditSpDropdown(event, idx) {
  event.stopPropagation();
  document.querySelectorAll('[id^="hr-edit-sp-dd-"]').forEach(d => {
    if (d.id !== `hr-edit-sp-dd-${idx}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`hr-edit-sp-dd-${idx}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function hrEditSpAdd() {
  const code = hrEditRecord.employee_code || String(hrEditRecord.id);
  const name = ((hrEditRecord.surname || hrEditRecord.first_name || '') + ' ' + (hrEditRecord.other_names || hrEditRecord.last_name || '')).trim();
  hrEspFormState = {
    context: 'add', sourceView: 'hr-edit',
    editSourceIdx: -1, lockedEmpCode: code, lockedEmpName: name,
    bankAccounts: [], editingBankIdx: -1, existingRecord: null
  };
  renderHrEspFormPage(document.getElementById('main-content'));
}

function hrEditSpEdit(idx) {
  const sp = (hrEditRecord.service_profile || [])[idx] || {};
  const code = hrEditRecord.employee_code || String(hrEditRecord.id);
  const name = ((hrEditRecord.surname || hrEditRecord.first_name || '') + ' ' + (hrEditRecord.other_names || hrEditRecord.last_name || '')).trim();
  hrEspFormState = {
    context: 'edit', sourceView: 'hr-edit',
    editSourceIdx: idx, lockedEmpCode: code, lockedEmpName: name,
    bankAccounts: [...(sp.bank_accounts || [])],
    editingBankIdx: -1, existingRecord: sp
  };
  renderHrEspFormPage(document.getElementById('main-content'));
}

function deleteHrEditServiceProfile(idx) {
  if (!confirm('Delete this service profile record?')) return;
  hrEditRecord.service_profile.splice(idx, 1);
  document.getElementById('hr-edit-tab-content').innerHTML = renderHrEditTabServiceProfile();
}

function switchHrEditTab(tabId) {
  hrEditActiveTab = tabId;
  const bc = document.getElementById('hr-edit-breadcrumb');
  if (bc) bc.innerHTML = `Dashboard &rsaquo; Human Resource &rsaquo; Employee &rsaquo; ${getHrTabLabel(tabId)}`;
  document.querySelectorAll('#hr-edit-tab-bar .hr-tab-btn').forEach(btn => {
    btn.classList.toggle('hr-tab-btn--active', btn.getAttribute('data-tab-id') === tabId);
  });
  const content = document.getElementById('hr-edit-tab-content');
  if (content) content.innerHTML = renderHrEditTabContent(tabId);
  loadDepartmentOptions('hr-edit-department', hrEditRecord.department_id);
  loadHrWhtPaymentTypes('edit', hrEditRecord.contractor_wht_payment_type);
  if (tabId === 'service-profile') {
    ensurePayGradeCache().then(() => {
      const c = document.getElementById('hr-edit-tab-content');
      if (c && hrEditActiveTab === 'service-profile') c.innerHTML = renderHrEditTabServiceProfile();
    });
  }
}

