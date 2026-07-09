// ==================== AUTH ====================

function hideSidebarForAuth() {
  document.body.classList.add('login-page');
}
function showSidebarAfterAuth() {
  document.body.classList.remove('login-page');
}

// Existing login handler — API call target and JWT handling are unchanged.
async function login() {
  const email    = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData
  });
  if (!res.ok) throw new Error("Invalid credentials");
  const data = await res.json();
  token = data.token;
  if (!token) throw new Error("Login failed: no token received");

  sessionStorage.setItem('edugiga_token', token);
  currentUser = _decodeAndNormalise(token);
  _scheduleTokenRefresh();
  showSidebarAfterAuth();
  showDashboard();
  loadCurrentUserPermissions(); // non-blocking — populates _userPermissions
}

function _decodeAndNormalise(jwt) {
  const payload = JSON.parse(atob(jwt.split('.')[1]));
  // Normalise clearance_level: accept clearance_level or clearance
  if (payload.clearance_level == null && payload.clearance != null) {
    payload.clearance_level = Number(payload.clearance);
  }
  // Normalise role: accept role or user_role
  if (!payload.role && payload.user_role) {
    payload.role = payload.user_role;
  }
  return payload;
}

function logout() {
  stopKeepAlive();
  token = '';
  currentUser = null;
  sessionStorage.removeItem('edugiga_token');
  location.reload();
}

// ── Silent token refresh ──────────────────────────────────────────────────────
// Called after login and on every page-load when a stored token exists.
// Falls back silently if the backend endpoint is not yet available.
function _scheduleTokenRefresh() {
  const REFRESH_MS = 10 * 60 * 1000; // every 10 minutes
  setTimeout(async function doRefresh() {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ refresh_token: token })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          token = data.token;
          sessionStorage.setItem('edugiga_token', token);
          currentUser = _decodeAndNormalise(token);
        }
      }
    } catch (_) { /* backend may not support refresh yet */ }
    setTimeout(doRefresh, REFRESH_MS);
  }, REFRESH_MS);
}

// On page load, if a token was restored from sessionStorage, start the refresh cycle.
if (token) _scheduleTokenRefresh();

// ==================== LOGIN PAGE (RENDERING) ====================

// Navy header shared by every auth screen (login, forgot-password, set-new-
// password) — the enlarged logo sits on an ambient gold medallion (two
// concentric rings), the same "circle within a circle" motif used behind the
// initials avatar on every module's detail banner (see .detail-banner::after/
// ::before in core.css), scaled up into this page's signature element instead
// of inventing a new one.
function _loginHeaderMarkup(eyebrow) {
  return `
    <div class="login-card-header">
      <div class="login-header-rings" aria-hidden="true">
        <span class="login-ring login-ring-outer"></span>
        <span class="login-ring login-ring-inner"></span>
      </div>
      <div class="login-logo-wrap">
        <img
          src="assets/images/sois-logo-horizontal.jpeg"
          alt="Seven Oaks International School"
          class="login-logo"
          onerror="this.style.display='none';
                   this.nextElementSibling.style.display='flex';"
        >
        <div class="login-logo-fallback" style="display:none;">
          <span class="login-logo-fallback-name">Seven Oaks</span>
          <span class="login-logo-fallback-sub">INTERNATIONAL SCHOOL</span>
        </div>
      </div>
      ${eyebrow ? `<p class="login-eyebrow">${eyebrow}</p>` : ''}
    </div>
  `;
}

function renderLoginPage() {
  hideSidebarForAuth();
  const container = document.getElementById('login-page-container');
  container.innerHTML = `
    <div class="login-container">
      <div class="login-form-inner">
        ${_loginHeaderMarkup('School Management System')}
        <div class="login-card-body">
          <h1 class="login-welcome">Welcome back</h1>
          <p class="login-subtitle">Sign in to manage students, finance and school operations.</p>

          <form class="login-form" id="login-form" novalidate>
            <div class="login-field-group">
              <label class="login-label" for="login-username">Username or email</label>
              <input
                type="text"
                id="login-username"
                class="login-input"
                autocomplete="username"
                spellcheck="false"
              >
            </div>

            <div class="login-field-group" style="margin-top: 28px;">
              <label class="login-label" for="login-password">Password</label>
              <input
                type="password"
                id="login-password"
                class="login-input"
                autocomplete="current-password"
              >
              <div class="login-field-footer">
                <span></span>
                <a href="#" class="login-forgot-link" id="login-forgot-btn">
                  Forgot password?
                </a>
              </div>
            </div>

            <p class="login-error-msg" id="login-error" role="alert" hidden></p>

            <button type="submit" class="login-submit-btn" id="login-submit-btn">
              Sign In
            </button>
          </form>
        </div>
      </div>
      <p class="login-footer-note">&copy; ${new Date().getFullYear()} Seven Oaks International School &middot; Secure staff portal</p>
    </div>
  `;

  document.getElementById('login-form')
    .addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl   = document.getElementById('login-error');
      const submitBtn = document.getElementById('login-submit-btn');

      errorEl.hidden = true;

      if (!username || !password) {
        errorEl.textContent = 'Please enter your username/email and password.';
        errorEl.hidden = false;
        return;
      }

      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
      submitBtn.textContent = 'Signing in…';

      try {
        await login();
      } catch (err) {
        errorEl.textContent = err.message || 'Login failed. Please check your credentials.';
        errorEl.hidden = false;
      } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        submitBtn.textContent = 'Sign In';
      }
    });

  document.getElementById('login-forgot-btn')
    .addEventListener('click', (e) => {
      e.preventDefault();
      showForgotPasswordView();
    });
}

// ==================== FORGOT PASSWORD — STEP 1 ====================

function showForgotPasswordView() {
  const inner = document.querySelector('.login-form-inner');
  inner.innerHTML = `
    ${_loginHeaderMarkup('Password Reset')}
    <div class="login-card-body">
      <h1 class="login-welcome">Reset your password</h1>
      <p class="login-reset-hint">
        Enter the email address linked to your account and we'll send
        you a link to reset your password.
      </p>

      <form id="forgot-form" novalidate>
        <div class="login-field-group">
          <label class="login-label" for="reset-email">Email address</label>
          <input type="email" id="reset-email" class="login-input"
                 autocomplete="email" spellcheck="false">
        </div>
        <p class="login-error-msg" id="reset-error" role="alert" hidden></p>
        <p class="login-success-msg" id="reset-success" hidden></p>
        <button type="submit" class="login-submit-btn" id="reset-submit-btn">
          Send Reset Link
        </button>
      </form>

      <div style="text-align:center; margin-top:28px;">
        <a href="#" class="login-back-link" id="back-to-login-btn">
          &larr; Back to Sign In
        </a>
      </div>
    </div>
  `;

  document.getElementById('back-to-login-btn')
    .addEventListener('click', (e) => {
      e.preventDefault();
      renderLoginPage();
    });

  document.getElementById('forgot-form')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      const email     = document.getElementById('reset-email').value.trim();
      const errorEl   = document.getElementById('reset-error');
      const successEl = document.getElementById('reset-success');
      const btn       = document.getElementById('reset-submit-btn');

      errorEl.hidden   = true;
      successEl.hidden = true;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorEl.textContent = 'Please enter a valid email address.';
        errorEl.hidden = false;
        return;
      }

      btn.disabled = true;
      btn.classList.add('loading');
      btn.textContent = 'Sending…';

      try {
        await apiFetchPublic('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        successEl.textContent =
          'If an account exists for that email, a reset link has been sent. ' +
          'Please check your inbox (and spam folder).';
        successEl.hidden = false;
        btn.textContent = 'Link Sent';
        // Keep button disabled — don't allow double-sending
      } catch (err) {
        errorEl.textContent =
          err.message || 'Something went wrong. Please try again in a moment.';
        errorEl.hidden = false;
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = 'Send Reset Link';
      }
    });
}

// ==================== FORGOT PASSWORD — STEP 2 (token in URL) ====================

function checkForPasswordResetToken() {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('token');
  if (resetToken) {
    renderSetNewPasswordView(resetToken);
    return true;
  }
  return false;
}

function renderSetNewPasswordView(resetToken) {
  hideSidebarForAuth();
  const container = document.getElementById('login-page-container');
  container.innerHTML = `
    <div class="login-container">
      <div class="login-form-inner">
        ${_loginHeaderMarkup('Password Reset')}
        <div class="login-card-body">
          <h1 class="login-welcome">Set a new password</h1>
          <p class="login-reset-hint">
            Choose a strong password that you haven't used before.
          </p>
          <form id="new-password-form" novalidate>
            <div class="login-field-group">
              <label class="login-label" for="new-password">New password</label>
              <input type="password" id="new-password" class="login-input"
                     autocomplete="new-password">
            </div>
            <div class="login-field-group" style="margin-top:28px;">
              <label class="login-label" for="confirm-password">
                Confirm new password
              </label>
              <input type="password" id="confirm-password" class="login-input"
                     autocomplete="new-password">
            </div>
            <div class="password-strength-bar" id="pwd-strength-bar"
                 style="margin-top:10px;height:3px;border-radius:2px;
                        background:var(--grey-100,#eee);overflow:hidden;">
              <div id="pwd-strength-fill"
                   style="height:100%;width:0;transition:width 0.3s,background 0.3s;"></div>
            </div>
            <p class="login-error-msg"   id="new-pwd-error"   role="alert" hidden></p>
            <p class="login-success-msg" id="new-pwd-success" hidden></p>
            <button type="submit" class="login-submit-btn" id="new-pwd-submit">
              Set New Password
            </button>
          </form>
        </div>
      </div>
      <p class="login-footer-note">&copy; ${new Date().getFullYear()} Seven Oaks International School &middot; Secure staff portal</p>
    </div>
  `;

  document.getElementById('new-password').addEventListener('input', (e) => {
    const fill = document.getElementById('pwd-strength-fill');
    const strength = measurePasswordStrength(e.target.value);
    fill.style.width = strength.pct + '%';
    fill.style.background = strength.colour;
  });

  document.getElementById('new-password-form')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPwd  = document.getElementById('new-password').value;
      const confirm = document.getElementById('confirm-password').value;
      const errEl   = document.getElementById('new-pwd-error');
      const sucEl   = document.getElementById('new-pwd-success');
      const btn     = document.getElementById('new-pwd-submit');

      errEl.hidden = true;
      sucEl.hidden = true;

      if (newPwd.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters.';
        errEl.hidden = false;
        return;
      }
      if (newPwd !== confirm) {
        errEl.textContent = 'Passwords do not match.';
        errEl.hidden = false;
        return;
      }

      btn.disabled = true;
      btn.classList.add('loading');
      btn.textContent = 'Saving…';

      try {
        await apiFetchPublic('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, new_password: newPwd })
        });
        sucEl.textContent =
          'Your password has been updated successfully. ' +
          'You can now sign in with your new password.';
        sucEl.hidden = false;
        btn.textContent = 'Password Updated';
        setTimeout(() => {
          window.history.replaceState({}, '', window.location.pathname);
          renderLoginPage();
        }, 3000);
      } catch (err) {
        errEl.textContent =
          err.message || 'This reset link may have expired. Please request a new one.';
        errEl.hidden = false;
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = 'Set New Password';
      }
    });
}

function measurePasswordStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const map = [
    { pct: 0,   colour: '#eee'    },  // empty
    { pct: 20,  colour: '#D94040' },  // very weak
    { pct: 40,  colour: '#E07820' },  // weak
    { pct: 60,  colour: '#C9A227' },  // fair (gold)
    { pct: 80,  colour: '#2E8B57' },  // good
    { pct: 100, colour: '#1B5E35' },  // strong
  ];
  return map[Math.min(score, 5)];
}

// Public (unauthenticated) API calls — no Authorization header.
function apiFetchPublic(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  return fetch(`${API_BASE}${path}`, { ...options, headers })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.detail || data.message || 'Error'), { status: res.status });
      return data;
    });
}

// ==================== BOOTSTRAP ====================

if (!checkForPasswordResetToken()) {
  renderLoginPage();
}
