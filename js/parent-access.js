// ==================== PARENT PORTAL ACCESS (admin) ====================
// Student Management > Parent Portal Access. Parents sign in to the separate
// parent-portal.html (/parent-login) with the email on their child's
// ParentInfo row. The live API documents three staff-triggered ways to give a
// parent access, all POST and all gated on student_management.parent_portal
// (can_add):
//   • /parent/invite {email} — emails a set-password link (the email must
//     already be on a ParentInfo row; there is no student_id in the body)
//   • /parent/provision-from-profiles — account + welcome email for every
//     parent with both email and id_document but no password yet; returns
//     {provisioned, skipped, email_failures[]}
//   • /parent/set-password {email, new_password ≥ 8 chars} — support override
// Nothing in the spec says registering or editing a student creates a portal
// account or sends mail, so this page must not promise that. There is no GET
// list endpoint for parent accounts either, so the page is action-only. Flag
// to backend team: a GET /parent/accounts (or similar) listing
// email/student/is_active/last_login would let this page show real status
// instead of blind actions.

function _paEsc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// SetPasswordRequest.new_password and the portal's own reset form both use 8.
const _PA_MIN_PASSWORD = 8;

async function loadParentPortalAccessView(container) {
  // Hidden, not disabled, matching the _canAddHere convention in renderSplitView
  // (js/dashboard.js:636) — there's no GET here to let a 403 reveal the gap
  // naturally, so the client gate has to stand in for it.
  const _paCanAdd = canAdd('student_management.parent_portal');

  const toolsGrid = _paCanAdd ? `
      <div class="pa-tools-grid">
        <div class="sa-form-wrap">
          <h3 class="pa-tool-title">Invite / Resend Invite</h3>
          <p class="pa-tool-hint">Emails the parent a link to set their own portal password. The email must already be on a student's parent or guardian record. Sending again replaces any earlier link.</p>

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
            <input type="text" id="pa-setpwd-password" class="sa-form-input" placeholder="At least ${_PA_MIN_PASSWORD} characters">
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
            Creates a portal account and sends a welcome email to every parent who has both an email
            and an ID document number on file and no portal password yet. Parents who already have a
            password are skipped, so it is safe to run repeatedly.
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
        Parents sign in to the Parent Portal with the email on their child's parent record. Use the tools
        below to give them access. <strong>Bulk Provision</strong> only covers parents whose record has both
        an email and an ID document number. Parents copied over from Admissions have no ID document number
        until one is added on the student's Guardian/Family tab, and guardians have no ID document field at
        all — use <strong>Invite</strong> for them instead.
      </div>

      ${toolsGrid}
    </div>
  `;
}

// ── Invite ───────────────────────────────────────────────────────────────
async function submitParentInvite() {
  const email = (document.getElementById('pa-invite-email').value || '').trim();
  const errEl = document.getElementById('pa-invite-email-err');
  const resultEl = document.getElementById('pa-invite-result');
  errEl.textContent = '';
  resultEl.innerHTML = '';

  if (!email) { errEl.textContent = 'This field is required.'; return; }

  const btn = document.getElementById('pa-invite-btn');
  btn.disabled = true;
  const res = await apiFetch(`${API_BASE}/parent/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  btn.disabled = false;
  if (!res) return;
  if (res.ok) {
    showToast('Invite sent.', 'success');
    resultEl.innerHTML = `<div class="sa-toast sa-toast-success">Set-password link sent to ${_paEsc(email)}.</div>`;
    document.getElementById('pa-invite-email').value = '';
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
  const out = document.getElementById('pa-setpwd-result');
  emailErr.textContent = ''; pwdErr.textContent = '';

  let valid = true;
  if (!email) { emailErr.textContent = 'This field is required.'; valid = false; }
  if (!password || password.length < _PA_MIN_PASSWORD) { pwdErr.textContent = `Password must be at least ${_PA_MIN_PASSWORD} characters.`; valid = false; }
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
  resultEl.innerHTML = '';
  const res = await apiFetch(`${API_BASE}/parent/provision-from-profiles`, { method: 'POST' });
  btn.disabled = false;
  btn.textContent = 'Run Bulk Provision';
  if (!res) return;
  if (!res.ok) {
    const msg = await parseApiError(res);
    resultEl.innerHTML = `<div class="sa-toast sa-toast-error">${_paEsc(msg)}</div>`;
    showToast(msg, 'error');
    return;
  }

  // ProvisionFromProfilesResult: {provisioned, skipped, email_failures[]}.
  // email_failures is the only delivery signal the backend exposes, so it has
  // to be shown — a clean "Provisioned N" would hide parents who never got mail.
  const data = await res.json().catch(() => ({}));
  const provisioned = Number(data.provisioned) || 0;
  const skipped = Number(data.skipped) || 0;
  const failures = Array.isArray(data.email_failures) ? data.email_failures : [];
  const summary = `Provisioned ${provisioned} account${provisioned === 1 ? '' : 's'}, skipped ${skipped} that already had a password.`;

  let html = `<div class="sa-toast sa-toast-success">${_paEsc(summary)}</div>`;
  if (failures.length) {
    html += `
      <div class="sa-toast sa-toast-error">
        The welcome email could not be sent for ${failures.length} parent${failures.length === 1 ? '' : 's'}:
        <ul style="margin:6px 0 6px 18px;padding:0;">
          ${failures.map(f => `<li>${_paEsc(typeof f === 'string' ? f : JSON.stringify(f))}</li>`).join('')}
        </ul>
        Check each address on the student's Guardian/Family tab, then use Invite / Resend Invite to send a set-password link.
      </div>`;
    showToast(`${summary} ${failures.length} welcome email${failures.length === 1 ? '' : 's'} failed.`, 'error');
  } else {
    showToast(summary, 'success');
  }
  resultEl.innerHTML = html;
}
