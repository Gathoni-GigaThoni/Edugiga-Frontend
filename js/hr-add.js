function renderHrAddPage(container) {
  container.innerHTML = `
    <div class="hr-page">
      <div class="hr-header-row">
        <h2 class="hr-title">Add Employee</h2>
        <div class="hr-breadcrumb">Dashboard &rsaquo; Human Resource &rsaquo; Employee &rsaquo; Add</div>
      </div>
      <div class="hr-form-tabs">${buildHrTabBar(hrAddActiveTab, 'switchHrAddTab')}</div>
      <div id="hr-add-tab-content"></div>
    </div>
    ${hrAddModalsHtml()}
  `;
  _hrAddSetTabContent(hrAddActiveTab);
}

// Sets the tab-content innerHTML and, when the Basic tab is showing, kicks
// off the async department picker load (loadDepartmentOptions is a no-op if
// the select isn't present in the currently-rendered tab).
function _hrAddSetTabContent(tabId) {
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabContent(tabId);
  loadDepartmentOptions('hr-add-department', hrAddFormState.department_id);
  loadHrWhtPaymentTypes('add', hrAddFormState.consultant_wht_payment_type);
}

function hrAddModalsHtml() {
  return `
    <div id="hr-ec-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrEmergencyContactModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Add Emergency Contact Detail</h3>
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
          <button class="hr-modal-btn-submit" onclick="saveHrEmergencyContact()">Select</button>
        </div>
      </div>
    </div>
    <div id="hr-edu-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddEducationModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Add Education</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Qualification</label><input type="text" id="hr-edu-qualification" class="hr-modal-input" placeholder="e.g. Bachelor of Science"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Institution</label><input type="text" id="hr-edu-institution" class="hr-modal-input" placeholder="e.g. University of Nairobi"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Academic Time</label><input type="text" id="hr-edu-time" class="hr-modal-input" placeholder="e.g. 2015 – 2019"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Awards / Grades</label><input type="text" id="hr-edu-grades" class="hr-modal-input" placeholder="e.g. First Class Honours"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Attachment</label><input type="file" id="hr-edu-attachment" class="hr-modal-input"></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddEducationModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrEducationRecord()">Submit</button>
        </div>
      </div>
    </div>
    <div id="hr-idoc-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddIdentityModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Add Identity Document</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Document Title</label><input type="text" id="hr-idoc-title" class="hr-modal-input" placeholder="e.g. National ID"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Attachment</label><input type="file" id="hr-idoc-file" class="hr-modal-input"></div>
          <div class="hr-modal-field"><label class="hr-form-label">Date Attached</label><input type="date" id="hr-idoc-date" class="hr-modal-input"></div>
        </div>
        <div class="hr-modal-actions">
          <button class="hr-modal-btn-close" onclick="closeHrAddIdentityModal()">Close</button>
          <button class="hr-modal-btn-submit" onclick="saveHrIdentityDoc()">Submit</button>
        </div>
      </div>
    </div>
    <div id="hr-dep-overlay" class="hr-modal-overlay" style="display:none;" onclick="if(event.target===this)closeHrAddDependentModal()">
      <div class="hr-modal">
        <h3 class="hr-modal-title">Add Dependent</h3>
        <div class="hr-modal-body">
          <div class="hr-modal-field"><label class="hr-form-label">Dependent Name <span class="hr-required">*</span></label><input type="text" id="hr-dep-name" class="hr-modal-input" placeholder="Full Name"></div>
          <div class="hr-modal-field">
            <label class="hr-form-label">Relationship <span class="hr-required">*</span></label>
            <select id="hr-dep-relationship" class="hr-modal-select">
              <option value="">Please Select</option><option value="spouse">Spouse</option>
              <option value="child">Child</option><option value="parent">Parent</option><option value="sibling">Sibling</option>
              <option value="other">Other</option>
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
          <button class="hr-modal-btn-submit" onclick="saveHrDependent()">Submit</button>
        </div>
      </div>
    </div>
  `;
}

function switchHrAddTab(tabId) {
  saveHrAddCurrentTabState();
  hrAddActiveTab = tabId;
  document.querySelectorAll('.hr-form-tabs .hr-tab-btn').forEach(btn => {
    btn.classList.toggle('hr-tab-btn--active', btn.getAttribute('data-tab-id') === tabId);
  });
  _hrAddSetTabContent(tabId);
}

function saveHrAddCurrentTabState() {
  const get = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  const set = (key, id) => { const v = get(id); if (v !== undefined) hrAddFormState[key] = v; };
  set('employment_terms', 'hr-add-employment-terms');
  set('surname',          'hr-add-surname');
  set('other_names',      'hr-add-other-names');
  set('department_id',    'hr-add-department');
  set('email',            'hr-add-email');
  set('phone_code',       'hr-add-phone-code');
  set('phone',            'hr-add-phone');
  set('birth_date',       'hr-add-birth-date');
  set('gender',           'hr-add-gender');
  set('joining_date',     'hr-add-joining-date');
  set('probation_period', 'hr-add-probation');
  set('address',          'hr-add-address');
  set('nationality',      'hr-add-nationality');
  set('national_id',      'hr-add-national-id');
  set('disability_type',  'hr-add-disability-type');
  set('medical_info',     'hr-add-medical-info');
  set('kra_pin',          'hr-add-kra-pin');
  set('nssf_number',      'hr-add-nssf');
  set('shif_number',      'hr-add-shif');
  set('consultant_wht_payment_type', 'hr-add-wht-type');
  set('consultant_kra_pin',          'hr-add-consultant-kra-pin');
  const taxProfileEl = document.querySelector('input[name="hr-add-tax-profile"]:checked');
  if (taxProfileEl) hrAddFormState.tax_profile = taxProfileEl.value;
  const nonResCb = document.getElementById('hr-add-non-resident');
  if (nonResCb) hrAddFormState.is_non_resident = nonResCb.checked;
  const dirCb = document.getElementById('hr-add-director');
  if (dirCb) hrAddFormState.is_director = dirCb.checked;
  const photoInput = document.getElementById('hr-add-photo');
  if (photoInput && photoInput.files[0]) hrAddFormState.photo = photoInput.files[0].name;
}

function renderHrAddTabContent(tabId) {
  switch (tabId) {
    case 'basic':          return renderHrAddTabBasic();
    case 'medical':        return renderHrAddTabMedical();
    case 'education':      return renderHrAddTabEducation();
    case 'identity':       return renderHrAddTabIdentity();
    case 'dependents':     return renderHrAddTabDependents();
    case 'service-profile':return renderHrAddTabServiceProfile();
    default: return '<p>Unknown tab.</p>';
  }
}

function renderHrAddTabBasic() {
  const s = hrAddFormState;
  const sel = (val, opt) => val === opt ? 'selected' : '';
  const ecInfo = s.emergency_contact
    ? `<span class="hr-ec-saved">Saved: ${s.emergency_contact.name}</span>` : '';
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">Employee Code <span class="hr-required">*</span></label>
          <input type="text" id="hr-add-emp-code" class="hr-form-input hr-form-readonly" value="${s.employeeCode}" readonly>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Employment Terms <span class="hr-required">*</span></label>
          <select id="hr-add-employment-terms" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="permanent" ${sel(s.employment_terms,'permanent')}>Permanent</option>
            <option value="contract" ${sel(s.employment_terms,'contract')}>Contract</option>
            <option value="casual" ${sel(s.employment_terms,'casual')}>Casual</option>
            <option value="intern" ${sel(s.employment_terms,'intern')}>Intern</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Surname <span class="hr-required">*</span></label>
          <input type="text" id="hr-add-surname" class="hr-form-input" value="${s.surname}" placeholder="Surname">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Other Names <span class="hr-required">*</span></label>
          <input type="text" id="hr-add-other-names" class="hr-form-input" value="${s.other_names}" placeholder="Other Names">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Department</label>
          <select id="hr-add-department" class="hr-form-select"><option value="">Loading&#8230;</option></select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Email <span class="hr-required">*</span></label>
          <input type="email" id="hr-add-email" class="hr-form-input" value="${s.email}" placeholder="Email">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Phone Number</label>
          <div class="hr-phone-row">
            <select id="hr-add-phone-code" class="hr-phone-code-sel">
              <option value="+254" ${sel(s.phone_code,'+254')}>+254 (KE)</option>
              <option value="+1"   ${sel(s.phone_code,'+1')}>+1 (US)</option>
              <option value="+44"  ${sel(s.phone_code,'+44')}>+44 (UK)</option>
              <option value="+91"  ${sel(s.phone_code,'+91')}>+91 (IN)</option>
            </select>
            <input type="tel" id="hr-add-phone" class="hr-form-input" value="${s.phone}" placeholder="Phone number">
          </div>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Birth Date <span class="hr-required">*</span></label>
          <input type="date" id="hr-add-birth-date" class="hr-form-input" value="${s.birth_date}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Gender <span class="hr-required">*</span></label>
          <select id="hr-add-gender" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Male"   ${sel(s.gender,'Male')}>Male</option>
            <option value="Female" ${sel(s.gender,'Female')}>Female</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Joining Date <span class="hr-required">*</span></label>
          <input type="date" id="hr-add-joining-date" class="hr-form-input" value="${s.joining_date}">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Probation Period (days) <span class="hr-required">*</span></label>
          <input type="number" id="hr-add-probation" class="hr-form-input" value="${s.probation_period}" placeholder="e.g. 90" min="0">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Confirmation Date</label>
          <input type="text" id="hr-add-confirm-date" class="hr-form-input hr-form-readonly" value="${s.confirmation_date}" readonly placeholder="Auto-calculated">
        </div>
        <div class="hr-form-group hr-form-span2">
          <label class="hr-form-label">Address</label>
          <textarea id="hr-add-address" class="hr-form-textarea" rows="3" placeholder="Address">${s.address}</textarea>
        </div>
      </div>
      <div class="hr-form-ec-row">
        <button class="hr-form-section-btn" onclick="showHrEmergencyContactModal()">+ Add Emergency Contact Details</button>
        ${ecInfo}
      </div>
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">Nationality <span class="hr-required">*</span></label>
          <select id="hr-add-nationality" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="Kenyan"     ${sel(s.nationality,'Kenyan')}>Kenyan</option>
            <option value="Ugandan"    ${sel(s.nationality,'Ugandan')}>Ugandan</option>
            <option value="Tanzanian"  ${sel(s.nationality,'Tanzanian')}>Tanzanian</option>
            <option value="British"    ${sel(s.nationality,'British')}>British</option>
            <option value="American"   ${sel(s.nationality,'American')}>American</option>
            <option value="Other"      ${sel(s.nationality,'Other')}>Other</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">National ID No</label>
          <input type="text" id="hr-add-national-id" class="hr-form-input" value="${s.national_id}" placeholder="National ID">
        </div>
      </div>
      <div class="hr-form-checkboxes">
        <label class="hr-form-checkbox-label">
          <input type="checkbox" id="hr-add-director" class="hr-form-cb" ${s.is_director ? 'checked' : ''}> Director?
        </label>
      </div>
      <div class="hr-photo-section">
        <label class="hr-form-label">Photo</label>
        <div class="hr-photo-row">
          <label class="hr-photo-box" for="hr-add-photo">
            <span class="hr-photo-icon">&#8679;</span>
            <span class="hr-photo-text">Click to upload</span>
            <input type="file" id="hr-add-photo" accept="image/*" style="display:none;" onchange="handleHrPhotoPreview(this)">
          </label>
          <div class="hr-photo-avatar" id="hr-photo-preview">
            <span class="hr-avatar-placeholder">&#128100;</span>
          </div>
        </div>
      </div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="submitHrAddEmployee()">Submit</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrAddEmployee()">Cancel</button>
      </div>
    </div>
  `;
}

function renderHrAddTabMedical() {
  const s = hrAddFormState;
  const sel = (val, opt) => val === opt ? 'selected' : '';
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid-single">
        <div class="hr-form-group">
          <label class="hr-form-label">Disability Type <span class="hr-required">*</span></label>
          <select id="hr-add-disability-type" class="hr-form-select">
            <option value="">Please Select</option>
            <option value="None"     ${sel(s.disability_type,'None')}>None</option>
            <option value="Physical" ${sel(s.disability_type,'Physical')}>Physical</option>
            <option value="Visual"   ${sel(s.disability_type,'Visual')}>Visual</option>
            <option value="Hearing"  ${sel(s.disability_type,'Hearing')}>Hearing</option>
            <option value="Other"    ${sel(s.disability_type,'Other')}>Other</option>
          </select>
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">Medical Info</label>
          <textarea id="hr-add-medical-info" class="hr-form-textarea" rows="5" placeholder="Medical information...">${s.medical_info}</textarea>
        </div>
      </div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="submitHrAddEmployee()">Submit</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrAddEmployee()">Cancel</button>
      </div>
    </div>
  `;
}

function renderHrAddTabEducation() {
  const s = hrAddFormState;
  const rows = s.education.length === 0
    ? `<tr><td colspan="6" class="hr-empty">No records found</td></tr>`
    : s.education.map((e, i) => `<tr>
        <td>${e.qualification}</td><td>${e.institution}</td><td>${e.academic_time}</td>
        <td>${e.awards_grades}</td><td>${e.attachment || '—'}</td>
        <td class="hr-action-cell"><button class="hr-action-btn" onclick="removeHrEducationRecord(${i})">&#10005;</button></td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="showHrAddEducationModal()">Add Education</button>
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

function renderHrAddTabIdentity() {
  const s = hrAddFormState;
  const rows = s.identity_docs.length === 0
    ? `<tr><td colspan="4" class="hr-empty">No records found</td></tr>`
    : s.identity_docs.map((d, i) => `<tr>
        <td>${d.doc_title}</td><td>${d.attachment || '—'}</td><td>${d.date_attached}</td>
        <td class="hr-action-cell"><button class="hr-action-btn" onclick="removeHrIdentityDoc(${i})">&#10005;</button></td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-grid">
        <div class="hr-form-group">
          <label class="hr-form-label">KRA PIN</label>
          <input type="text" id="hr-add-kra-pin" class="hr-form-input" value="${s.kra_pin}" placeholder="KRA PIN">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">NSSF Number</label>
          <input type="text" id="hr-add-nssf" class="hr-form-input" value="${s.nssf_number}" placeholder="NSSF Number">
        </div>
        <div class="hr-form-group">
          <label class="hr-form-label">SHIF Number</label>
          <input type="text" id="hr-add-shif" class="hr-form-input" value="${s.shif_number}" placeholder="SHIF Number">
        </div>
      </div>
      ${renderHrTaxProfileFieldset('add', s)}
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="showHrAddIdentityModal()">Add Identity</button>
      </div>
      <div class="hr-table-wrap">
        <table class="hr-table"><thead><tr>
          <th>DOCUMENT TITLE</th><th>ATTACHMENTS</th><th>DATE ATTACHED</th><th>ACTION</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="hr-form-actions">
        <button class="hr-btn-form-submit" onclick="submitHrAddEmployee()">Submit</button>
        <button class="hr-btn-form-cancel" onclick="cancelHrAddEmployee()">Cancel</button>
      </div>
    </div>
  `;
}

function renderHrAddTabDependents() {
  const s = hrAddFormState;
  const rows = s.dependents.length === 0
    ? `<tr><td colspan="6" class="hr-empty">No records found</td></tr>`
    : s.dependents.map((d, i) => `<tr>
        <td>${d.name}</td><td>${d.insurance_type}</td><td>${d.relationship}</td>
        <td>${d.gender}</td><td>${d.birth_date}</td>
        <td class="hr-action-cell"><button class="hr-action-btn" onclick="removeHrDependent(${i})">&#10005;</button></td>
      </tr>`).join('');
  return `
    <div class="hr-tab-body">
      <div class="hr-form-table-header">
        <button class="hr-add-btn" onclick="showHrAddDependentModal()">Add Dependents</button>
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

// Service profiles are created via a direct POST to
// /payroll/employee-service-profiles/ keyed on employee_code — that only
// works once the employee actually exists server-side. This tab used to
// offer an "Add" button that opened the ESP form mid-wizard, which posted
// against a client-only placeholder code and 404'd. Service profiles are
// now added from Edit Employee (js/hr-edit.js), once the employee is real.
function renderHrAddTabServiceProfile() {
  return `
    <div class="hr-tab-body">
      <div style="background:#EEF3FA;border-left:3px solid var(--navy-400,#4A6FA5);border-radius:6px;padding:14px 18px;font-size:13px;color:var(--navy-900,#0D2137);line-height:1.6;">
        Service profiles can only be added once this employee has been saved. Submit this form first, then open
        the new employee from the Employee Directory and add a Service Profile from there.
      </div>
    </div>
  `;
}

// ---- Add Employee submission ----
async function submitHrAddEmployee() {
  saveHrAddCurrentTabState();
  const s = hrAddFormState;
  if (!s.employment_terms)    { showToast('Employment Terms is required.', 'error'); return; }
  if (!s.surname.trim())      { showToast('Surname is required.', 'error'); return; }
  if (!s.other_names.trim())  { showToast('Other Names is required.', 'error'); return; }
  if (!s.email.trim())        { showToast('Email is required.', 'error'); return; }
  if (!s.birth_date)          { showToast('Birth Date is required.', 'error'); return; }
  if (!s.gender)              { showToast('Gender is required.', 'error'); return; }
  if (!s.joining_date)        { showToast('Joining Date is required.', 'error'); return; }
  if (!s.probation_period)    { showToast('Probation Period is required.', 'error'); return; }
  if (!s.nationality)         { showToast('Nationality is required.', 'error'); return; }
  if (s.tax_profile === 'consultant' && !s.consultant_wht_payment_type) {
    showToast('Payment Type is required for consultant employees.', 'error'); return;
  }

  // POST /hr/employees/onboard (EmployeeOnboardRequest) is the atomic
  // employee+identity+medical creation endpoint — replaces the old plain
  // POST /hr/employees, whose payload used field names EmployeeCreate never
  // recognized (phone_code vs phone_country_code, probation_period vs
  // probation_days, nested emergency_contact vs flat fields) and stuffed in
  // kra_pin/nssf_number/shif_number/education/identity_docs/dependents that
  // EmployeeCreate doesn't accept at all — those were silently dropped by
  // Pydantic on every Add Employee submit. Verified against the live schema.
  const submitBtn = document.querySelector('.hr-btn-form-submit');
  if (submitBtn) submitBtn.disabled = true;

  let photoUrl = null;
  if (s.photoFile) {
    photoUrl = await uploadFile(s.photoFile); // toasts its own error on failure; non-fatal, submission continues
  }

  const employee = {
    employment_terms: s.employment_terms,
    last_name: s.surname,
    first_name: s.other_names,
    email: s.email || null,
    phone_country_code: s.phone_code || null,
    phone_number: s.phone || null,
    birth_date: s.birth_date || null,
    gender: s.gender || null,
    joining_date: s.joining_date,
    probation_days: s.probation_period ? parseInt(s.probation_period, 10) : 90,
    address: s.address || null,
    nationality: s.nationality || null,
    national_id_no: s.national_id || null,
    is_director: !!s.is_director,
    photo_url: photoUrl,
    emergency_contact_name: s.emergency_contact?.name || null,
    emergency_contact_country_code: s.emergency_contact?.phone_code || null,
    emergency_contact_number: s.emergency_contact?.phone || null,
    emergency_contact_relationship: s.emergency_contact?.relationship || null,
    department_id: s.department_id ? parseInt(s.department_id, 10) : null,
    tax_profile: s.tax_profile || 'employee',
    consultant_wht_payment_type: s.tax_profile === 'consultant' ? s.consultant_wht_payment_type : null,
    is_non_resident: s.tax_profile === 'consultant' ? !!s.is_non_resident : false,
    consultant_kra_pin: s.tax_profile === 'consultant' ? (s.consultant_kra_pin || null) : null,
  };
  const identity = {
    kra_pin: s.kra_pin || null,
    nssf_number: s.nssf_number || null,
    shif_number: s.shif_number || null,
  };
  const medical = {
    disability_type: s.disability_type || null,
    medical_info: s.medical_info || null,
  };

  const res = await apiFetch(`${API_BASE}/hr/employees/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee, identity, medical }),
  });

  if (submitBtn) submitBtn.disabled = false;

  if (!res || !res.ok) {
    if (res) showToast(await parseApiError(res), 'error');
    return;
  }
  const onboarded = await res.json();
  const employeeId = onboarded.employee_id;

  // Education, identity documents and dependents aren't part of
  // EmployeeOnboardRequest — the core record above is already committed, so
  // these are attached individually against the real employee_id. Best
  // effort: a failure here doesn't roll back the employee, it's surfaced
  // per-item so the operator can retry from Edit Employee.
  for (const edu of s.education) {
    const fd = new FormData();
    if (edu.qualification) fd.append('qualification', edu.qualification);
    if (edu.institution) fd.append('institution', edu.institution);
    if (edu.academic_time) fd.append('academic_time', edu.academic_time);
    if (edu.awards_grades) fd.append('awards_grades', edu.awards_grades);
    if (edu.attachmentFile) fd.append('file', edu.attachmentFile);
    const r = await apiFetch(`${API_BASE}/hr/employees/${employeeId}/education`, { method: 'POST', body: fd });
    if (!(r && r.ok)) showToast(`Employee saved, but education record "${edu.qualification || ''}" failed: ` + (r ? await parseApiError(r) : 'network error'), 'error');
  }
  for (const doc of s.identity_docs) {
    const fd = new FormData();
    fd.append('document_title', doc.doc_title);
    if (doc.date_attached) fd.append('date_attached', doc.date_attached);
    if (doc.attachmentFile) fd.append('file', doc.attachmentFile);
    const r = await apiFetch(`${API_BASE}/hr/employees/${employeeId}/identity/documents`, { method: 'POST', body: fd });
    if (!(r && r.ok)) showToast(`Employee saved, but identity document "${doc.doc_title || ''}" failed: ` + (r ? await parseApiError(r) : 'network error'), 'error');
  }
  for (const dep of s.dependents) {
    const payload = {
      dependent_name: dep.name,
      relationship: dep.relationship || null,
      gender: dep.gender || null,
      birth_date: dep.birth_date || null,
      insurance_type: dep.insurance_type || null,
      notes: dep.notes || null,
      is_enrolled_in_school: !!dep.enrolled_in_school,
      enrolled_student_name: dep.enrolled_in_school ? (dep.student_name || null) : null,
      enrolled_student_id: dep.enrolled_in_school ? (dep.student_id || null) : null,
    };
    const r = await apiFetch(`${API_BASE}/hr/employees/${employeeId}/dependents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!(r && r.ok)) showToast(`Employee saved, but dependent "${dep.name || ''}" failed: ` + (r ? await parseApiError(r) : 'network error'), 'error');
  }

  showToast('Employee added successfully!', 'success');
  loadHrEmployeeDirectoryView(document.getElementById('main-content'));
}

function cancelHrAddEmployee() {
  loadHrEmployeeDirectoryView(document.getElementById('main-content'));
}

// ---- Emergency Contact modal ----
function showHrEmergencyContactModal() {
  const ov = document.getElementById('hr-ec-overlay');
  if (ov) ov.style.display = 'flex';
}
function closeHrEmergencyContactModal() {
  const ov = document.getElementById('hr-ec-overlay');
  if (ov) ov.style.display = 'none';
}
function saveHrEmergencyContact() {
  const name = (document.getElementById('hr-ec-name')?.value || '').trim();
  if (!name) { alert('Emergency contact name is required.'); return; }
  hrAddFormState.emergency_contact = {
    name,
    phone_code: document.getElementById('hr-ec-phone-code')?.value || '',
    phone:      document.getElementById('hr-ec-phone')?.value || '',
    relationship: document.getElementById('hr-ec-relationship')?.value || ''
  };
  closeHrEmergencyContactModal();
  const saved = document.querySelector('.hr-ec-saved');
  const row   = document.querySelector('.hr-form-ec-row');
  if (saved) { saved.textContent = 'Saved: ' + name; }
  else if (row) { const sp = document.createElement('span'); sp.className = 'hr-ec-saved'; sp.textContent = 'Saved: ' + name; row.appendChild(sp); }
}

// ---- Education modal ----
function showHrAddEducationModal() {
  ['hr-edu-qualification','hr-edu-institution','hr-edu-time','hr-edu-grades'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const f = document.getElementById('hr-edu-attachment'); if (f) f.value = '';
  const ov = document.getElementById('hr-edu-overlay'); if (ov) ov.style.display = 'flex';
}
function closeHrAddEducationModal() {
  const ov = document.getElementById('hr-edu-overlay'); if (ov) ov.style.display = 'none';
}
function saveHrEducationRecord() {
  const fileInput = document.getElementById('hr-edu-attachment');
  hrAddFormState.education.push({
    qualification: document.getElementById('hr-edu-qualification')?.value || '',
    institution:   document.getElementById('hr-edu-institution')?.value || '',
    academic_time: document.getElementById('hr-edu-time')?.value || '',
    awards_grades: document.getElementById('hr-edu-grades')?.value || '',
    attachment:    fileInput?.files?.[0]?.name || '',
    attachmentFile: fileInput?.files?.[0] || null, // retained across tab switches for the multipart POST at submit
  });
  closeHrAddEducationModal();
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabEducation();
}
function removeHrEducationRecord(idx) {
  hrAddFormState.education.splice(idx, 1);
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabEducation();
}

// ---- Identity doc modal ----
function showHrAddIdentityModal() {
  ['hr-idoc-title','hr-idoc-date'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const f = document.getElementById('hr-idoc-file'); if (f) f.value = '';
  const ov = document.getElementById('hr-idoc-overlay'); if (ov) ov.style.display = 'flex';
}
function closeHrAddIdentityModal() {
  const ov = document.getElementById('hr-idoc-overlay'); if (ov) ov.style.display = 'none';
}
function saveHrIdentityDoc() {
  // Capture whatever's currently typed into the tab (KRA PIN, WHT type,
  // tax profile, etc.) before the innerHTML replacement below wipes the DOM —
  // otherwise adding a doc mid-tab silently discards those fields.
  saveHrAddCurrentTabState();
  const fileInput = document.getElementById('hr-idoc-file');
  hrAddFormState.identity_docs.push({
    doc_title:     document.getElementById('hr-idoc-title')?.value || '',
    attachment:    fileInput?.files?.[0]?.name || '',
    attachmentFile: fileInput?.files?.[0] || null, // retained across tab switches for the multipart POST at submit
    date_attached: document.getElementById('hr-idoc-date')?.value || ''
  });
  closeHrAddIdentityModal();
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabIdentity();
  loadHrWhtPaymentTypes('add', hrAddFormState.consultant_wht_payment_type);
}
function removeHrIdentityDoc(idx) {
  saveHrAddCurrentTabState();
  hrAddFormState.identity_docs.splice(idx, 1);
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabIdentity();
  loadHrWhtPaymentTypes('add', hrAddFormState.consultant_wht_payment_type);
}

// ---- Dependent modal ----
function showHrAddDependentModal() {
  ['hr-dep-name','hr-dep-student-name','hr-dep-student-id','hr-dep-birth-date','hr-dep-notes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['hr-dep-relationship','hr-dep-gender','hr-dep-insurance'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const cb = document.getElementById('hr-dep-enrolled'); if (cb) cb.checked = false;
  const sec = document.getElementById('hr-dep-enrolled-section'); if (sec) sec.style.display = 'none';
  const ov = document.getElementById('hr-dep-overlay'); if (ov) ov.style.display = 'flex';
}
function closeHrAddDependentModal() {
  const ov = document.getElementById('hr-dep-overlay'); if (ov) ov.style.display = 'none';
}
function toggleHrDependentEnrolled() {
  const cb  = document.getElementById('hr-dep-enrolled');
  const sec = document.getElementById('hr-dep-enrolled-section');
  if (sec) sec.style.display = cb?.checked ? 'block' : 'none';
}
function saveHrDependent() {
  const name         = (document.getElementById('hr-dep-name')?.value || '').trim();
  const relationship = document.getElementById('hr-dep-relationship')?.value || '';
  const gender       = document.getElementById('hr-dep-gender')?.value || '';
  const birth_date   = document.getElementById('hr-dep-birth-date')?.value || '';
  if (!name)         { alert('Dependent name is required.'); return; }
  if (!relationship) { alert('Relationship is required.');  return; }
  if (!gender)       { alert('Gender is required.');        return; }
  if (!birth_date)   { alert('Birth Date is required.');    return; }
  const enrolled = document.getElementById('hr-dep-enrolled')?.checked || false;
  hrAddFormState.dependents.push({
    name, relationship, gender, birth_date,
    insurance_type:    document.getElementById('hr-dep-insurance')?.value || '',
    enrolled_in_school: enrolled,
    student_name:      enrolled ? (document.getElementById('hr-dep-student-name')?.value || '') : '',
    student_id:        enrolled ? (document.getElementById('hr-dep-student-id')?.value || '')   : '',
    notes:             document.getElementById('hr-dep-notes')?.value || ''
  });
  closeHrAddDependentModal();
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabDependents();
}
function removeHrDependent(idx) {
  hrAddFormState.dependents.splice(idx, 1);
  document.getElementById('hr-add-tab-content').innerHTML = renderHrAddTabDependents();
}

function handleHrPhotoPreview(input) {
  if (!input.files[0]) return;
  hrAddFormState.photo = input.files[0].name;
  hrAddFormState.photoFile = input.files[0]; // retained across tab switches — the <input> is recreated on tab re-render
  const preview = document.getElementById('hr-photo-preview');
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
