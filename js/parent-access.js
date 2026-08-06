// ==================== PARENT PORTAL ACCESS (admin) ====================
// Student Management > Parent Portal Access. Portal accounts are created
// automatically by the backend when a student's profile is saved with both
// a parent email and ID document number (initial password = ID document
// number, welcome email sent automatically) — see ParentInfo in the API
// spec. There is no GET list endpoint for parent accounts yet (only
// invite/set-password/provision-from-profiles, all POST, Super Admin only),
// so this page is action-only: exceptions to the automatic flow, not a
// browsable table. Flag to backend team: a GET /parent/accounts (or similar)
// listing email/student/is_active/last_login would let this page show real
// status instead of blind actions.

function _paEsc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let _paInviteStudent = null; // { id, student_id, name }

async function loadParentPortalAccessView(container) {
  // Backend requires student_management.parent_portal (can_add) on all three
  // POST actions here (invite/set-password/provision-from-profiles) — was
  // implicitly super-admin-only before, now an explicit grantable permission.
  // Hidden, not disabled, matching the _canAddHere convention in renderSplitView
  // (js/dashboard.js:636) — there's no GET here to let a 403 reveal the gap
  // naturally, so the client gate has to stand in for it.
  const _paCanAdd = canAdd('student_management.parent_portal');

  const toolsGrid = _paCanAdd ? `
      <div class="pa-tools-grid">
        <div class="sa-form-wrap">
          <h3 class="pa-tool-title">Invite / Resend Invite</h3>
          <p class="pa-tool-hint">Find a student, then send (or resend) their parent's portal invite to a given email.</p>

          <div class="sa-form-group" style="position:relative;">
            <label class="sa-form-label">Student</label>
            <input type="text" id="pa-invite-student-search" class="sa-form-input"
                   placeholder="Search by name or admission number…"
                   oninput="_paSearchStudent(this.value)" autocomplete="off">
            <div id="pa-invite-student-dd" style="display:none;position:absolute;z-index:20;background:#fff;border:1px solid var(--grey-200,#D6DAE3);border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,0.12);max-height:220px;overflow-y:auto;width:100%;"></div>
            <div id="pa-invite-student-picked" style="margin-top:8px;font-size:13px;color:var(--navy-700,#1B3057);"></div>
          </div>

          <div class="sa-form-group">
            <label class="sa-form-label">Parent Email <span class="sa-required">*</span></label>
            <input type="email" id="pa-invite-email" class="sa-form-input" placeholder="parent@example.com">
            <span class="sa-field-error" id="pa-invite-email-err"></span>
          </div>

          <div class="sa-form-actions">
            <button class="sa-btn-submit" id="pa-invite-btn" onclick="submitParentInvite()">Send Invite</button>
          </div>
          <div id="pa-invite-result"></div>
        </div>

        <div class="sa-form-wrap">
          <h3 class="pa-tool-title">Set Password (Admin Override)</h3>
          <p class="pa-tool-hint">Manually set a parent's portal password — use this if the invite email never arrived and the parent needs immediate access.</p>

          <div class="sa-form-group">
            <label class="sa-form-label">Parent Email <span class="sa-required">*</span></label>
            <input type="email" id="pa-setpwd-email" class="sa-form-input" placeholder="parent@example.com">
            <span class="sa-field-error" id="pa-setpwd-email-err"></span>
          </div>
          <div class="sa-form-group">
            <label class="sa-form-label">New Password <span class="sa-required">*</span></label>
            <input type="text" id="pa-setpwd-password" class="sa-form-input" placeholder="Temporary password">
            <span class="sa-field-error" id="pa-setpwd-password-err"></span>
          </div>

          <div class="sa-form-actions">
            <button class="sa-btn-submit" id="pa-setpwd-btn" onclick="submitParentSetPassword()">Set Password</button>
          </div>
          <div id="pa-setpwd-result"></div>
        </div>

        <div class="sa-form-wrap">
          <h3 class="pa-tool-title">Bulk Provision From Profiles</h3>
          <p class="pa-tool-hint">
            Scans every student record and provisions a portal account for any eligible parent
            (has both email and ID document) who doesn't already have one. Safe to run repeatedly —
            already-provisioned parents are skipped.
          </p>
          <div class="sa-form-actions">
            <button class="sa-btn-submit" id="pa-provision-btn" onclick="submitBulkProvision()">Run Bulk Provision</button>
          </div>
          <div id="pa-provision-result"></div>
        </div>
      </div>
  ` : `
      <div style="background:#FBF3D9;border-left:3px solid var(--gold-500,#C9A227);border-radius:6px;padding:14px 18px;font-size:13.5px;color:var(--navy-900,#0D2137);line-height:1.6;">
        You don't have permission to manage Parent Portal Access. Ask an administrator to grant the
        Parent Portal permission under Student Management.
      </div>
  `;

  container.innerHTML = `
    <div class="sa-page">
      <div class="sa-header-row">
        <h2 class="sa-title">Parent Portal Access</h2>
        <div class="sa-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Parent Portal Access</div>
      </div>

      <div style="background:var(--navy-50,#EEF3FA);border-left:3px solid var(--navy-400,#4A6FA5);border-radius:6px;padding:14px 18px;margin-bottom:24px;font-size:13.5px;color:var(--navy-900,#0D2137);line-height:1.6;">
        Parent portal accounts are created <strong>automatically</strong> when a student's profile is saved
        with both a parent email and ID document number — the initial password is the ID document number,
        and a welcome/invite email is sent automatically. The tools below are only for exceptions
        (email typos, undelivered invites, or backfilling students saved before auto-provisioning existed).
      </div>

      ${toolsGrid}
    </div>
  `;
}

// ── Student typeahead (Invite panel) ────────────────────────────────────────
let _paSearchDebounce = null;
function _paSearchStudent(val) {
  clearTimeout(_paSearchDebounce);
  const dd = document.getElementById('pa-invite-student-dd');
  if (!val.trim()) { if (dd) dd.style.display = 'none'; return; }
  _paSearchDebounce = setTimeout(async () => {
    const res = await apiFetch(`${API_BASE}/students/?search=${encodeURIComponent(val)}`);
    const list = (res && res.ok) ? _toArray(await res.json().catch(() => [])) : [];
    if (!dd) return;
    if (!list.length) {
      dd.innerHTML = `<div style="padding:10px 14px;color:#888;font-size:0.88rem;">No results found</div>`;
    } else {
      dd.innerHTML = list.slice(0, 10).map(s => {
        const name = `${s.first_name || ''} ${s.last_name || ''}`.trim();
        return `<a href="#" style="display:block;padding:9px 14px;text-decoration:none;color:var(--navy-900,#0D2137);border-bottom:1px solid var(--grey-100,#ECEEF2);"
                   onclick="_paPickStudent(${s.id},'${_paEsc(s.student_id || '')}','${_paEsc(name)}');return false;">
          ${_paEsc(s.student_id || '')} — ${_paEsc(name)}
        </a>`;
      }).join('');
    }
    dd.style.display = 'block';
  }, 300);
}

function _paPickStudent(id, studentId, name) {
  _paInviteStudent = { id, student_id: studentId, name };
  const input = document.getElementById('pa-invite-student-search');
  const dd = document.getElementById('pa-invite-student-dd');
  const picked = document.getElementById('pa-invite-student-picked');
  if (input) input.value = '';
  if (dd) dd.style.display = 'none';
  if (picked) picked.innerHTML = `Selected: <strong>${_paEsc(name)}</strong> (${_paEsc(studentId)}) <a href="#" onclick="_paClearStudent();return false;" style="margin-left:8px;color:var(--coral-500,#D94040);">Clear</a>`;
}
function _paClearStudent() {
  _paInviteStudent = null;
  const picked = document.getElementById('pa-invite-student-picked');
  if (picked) picked.innerHTML = '';
}

document.addEventListener('click', (e) => {
  const dd = document.getElementById('pa-invite-student-dd');
  const input = document.getElementById('pa-invite-student-search');
  if (dd && input && !dd.contains(e.target) && e.target !== input) dd.style.display = 'none';
});

// ── Invite ───────────────────────────────────────────────────────────────
async function submitParentInvite() {
  const email = (document.getElementById('pa-invite-email').value || '').trim();
  const errEl = document.getElementById('pa-invite-email-err');
  const resultEl = document.getElementById('pa-invite-result');
  errEl.textContent = '';

  if (!_paInviteStudent) { showToast('Please search for and select a student first.', 'error'); return; }
  if (!email) { errEl.textContent = 'This field is required.'; return; }

  const btn = document.getElementById('pa-invite-btn');
  btn.disabled = true;
  const res = await apiFetch(`${API_BASE}/parent/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: _paInviteStudent.id, email })
  });
  btn.disabled = false;
  if (!res) return;
  if (res.ok) {
    showToast('Invite sent.', 'success');
    resultEl.innerHTML = `<div class="sa-toast sa-toast-success">Invite email sent to ${_paEsc(email)} for ${_paEsc(_paInviteStudent.name)}.</div>`;
    document.getElementById('pa-invite-email').value = '';
    _paClearStudent();
  } else {
    const msg = await parseApiError(res);
    resultEl.innerHTML = `<div class="sa-toast sa-toast-error">${_paEsc(msg)}</div>`;
    showToast(msg, 'error');
  }
}

// ── Set Password override ───────────────────────────────────────────────
async function submitParentSetPassword() {
  const email = (document.getElementById('pa-setpwd-email').value || '').trim();
  const password = document.getElementById('pa-setpwd-password').value;
  const emailErr = document.getElementById('pa-setpwd-email-err');
  const pwdErr = document.getElementById('pa-setpwd-password-err');
  const resultEl = document.getElementById('pa-provision-result') ? document.getElementById('pa-setpwd-result') : null;
  emailErr.textContent = ''; pwdErr.textContent = '';

  let valid = true;
  if (!email) { emailErr.textContent = 'This field is required.'; valid = false; }
  if (!password || password.length < 4) { pwdErr.textContent = 'Enter a password of at least 4 characters.'; valid = false; }
  if (!valid) return;

  const btn = document.getElementById('pa-setpwd-btn');
  btn.disabled = true;
  const res = await apiFetch(`${API_BASE}/parent/set-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, new_password: password })
  });
  btn.disabled = false;
  if (!res) return;
  const out = document.getElementById('pa-setpwd-result');
  if (res.ok) {
    showToast('Password updated.', 'success');
    if (out) out.innerHTML = `<div class="sa-toast sa-toast-success">Password set for ${_paEsc(email)}.</div>`;
    document.getElementById('pa-setpwd-password').value = '';
  } else {
    const msg = await parseApiError(res);
    if (out) out.innerHTML = `<div class="sa-toast sa-toast-error">${_paEsc(msg)}</div>`;
    showToast(msg, 'error');
  }
}

// ── Bulk provision ───────────────────────────────────────────────────────
async function submitBulkProvision() {
  const btn = document.getElementById('pa-provision-btn');
  const resultEl = document.getElementById('pa-provision-result');
  btn.disabled = true;
  btn.textContent = 'Running…';
  const res = await apiFetch(`${API_BASE}/parent/provision-from-profiles`, { method: 'POST' });
  btn.disabled = false;
  btn.textContent = 'Run Bulk Provision';
  if (!res) return;
  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    const created = data.created ?? data.provisioned ?? data.count ?? null;
    const skipped = data.skipped ?? null;
    const summary = created !== null
      ? `Provisioned ${created}${skipped !== null ? `, skipped ${skipped} already-provisioned` : ''}.`
      : 'Bulk provisioning completed.';
    showToast(summary, 'success');
    resultEl.innerHTML = `<div class="sa-toast sa-toast-success">${_paEsc(summary)}</div>`;
  } else {
    const msg = await parseApiError(res);
    resultEl.innerHTML = `<div class="sa-toast sa-toast-error">${_paEsc(msg)}</div>`;
    showToast(msg, 'error');
  }
}
