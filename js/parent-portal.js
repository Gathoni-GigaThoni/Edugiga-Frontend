// ==================== PARENT PORTAL ====================
// Self-contained: separate entry point (parent-portal.html) from the staff
// app, own token key, own tiny router. Read-only — no payment submission,
// no profile editing (per spec). Mirrors the staff app's conventions
// (apiFetch retry/backoff, showToast, badge styling) without depending on
// config.js/dashboard.js, since parents are a different auth audience than
// staff (JWT sub claim "parent:{id}" vs staff tokens) and should never share
// sessionStorage keys with a staff session in the same browser profile.

const PP_API_BASE = "https://api.sevenoaks.ac/api";
const PP_TOKEN_KEY = 'edugiga_parent_token';

let ppToken = sessionStorage.getItem(PP_TOKEN_KEY) || '';
let ppCurrentEmail = sessionStorage.getItem('edugiga_parent_email') || '';

function ppToArray(raw) {
  return Array.isArray(raw) ? raw : (raw?.data || raw?.items || raw?.results || []);
}

function ppEsc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Toast (reuses .app-toast styles already defined in css/core.css) ──────
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `app-toast app-toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('app-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('app-toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}

// ── Fetch wrapper (Bearer parent token, 401 -> logout, retry on cold-start) ──
const _PP_RETRY_DELAYS_MS = [3000, 8000, 15000];
async function ppApiFetch(path, options = {}, _attempt = 0) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${ppToken}` };
  let res;
  try {
    res = await fetch(`${PP_API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    if (_attempt < _PP_RETRY_DELAYS_MS.length) {
      if (_attempt === 0) showToast('Server is waking up, please wait…', 'info');
      await new Promise(r => setTimeout(r, _PP_RETRY_DELAYS_MS[_attempt]));
      return ppApiFetch(path, options, _attempt + 1);
    }
    showToast('Could not reach the server. Please try again in a moment.', 'error');
    return null;
  }
  if (res.status === 401) {
    showToast('Session expired. Please log in again.', 'error');
    ppLogout();
    return null;
  }
  return res;
}

// Public (unauthenticated) call — login/reset endpoints.
async function ppApiFetchPublic(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${PP_API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.detail || data.message || 'Something went wrong.'), { status: res.status });
  return data;
}

function ppLogout() {
  ppToken = '';
  sessionStorage.removeItem(PP_TOKEN_KEY);
  sessionStorage.removeItem('edugiga_parent_email');
  window.history.replaceState({}, '', window.location.pathname);
  ppRenderLogin();
}

// ==================== SHARED CHROME ====================

function ppLogoMarkup(eyebrow) {
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
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
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

function ppTopbarMarkup(active) {
  return `
    <div class="pp-topbar">
      <div class="pp-topbar-brand">
        <div class="pp-topbar-logo-wrap">
          <img src="assets/images/sois-logo-horizontal.jpeg" alt="SOIS" class="pp-topbar-logo"
               onerror="this.style.display='none'">
        </div>
        <div class="pp-topbar-title">Parent Portal<span>Seven Oaks International School</span></div>
      </div>
      <nav class="pp-topbar-nav">
        <a class="pp-topbar-nav-link${active!=='documents'?' active':''}" onclick="ppRenderDashboard()">My Children</a>
        <a class="pp-topbar-nav-link${active==='documents'?' active':''}" onclick="ppRenderDocuments()">Documents</a>
      </nav>
      <div class="pp-topbar-right">
        <span class="pp-topbar-email">${ppEsc(ppCurrentEmail)}</span>
        <button class="pp-logout-btn" onclick="ppLogout()">Log Out</button>
      </div>
    </div>
  `;
}

// ==================== LOGIN ====================

function ppRenderLogin() {
  const root = document.getElementById('pp-root');
  root.innerHTML = `
    <div class="login-container">
      <div class="login-form-inner">
        ${ppLogoMarkup('Parent Portal')}
        <div class="login-card-body">
          <h1 class="login-welcome">Welcome back</h1>
          <p class="login-subtitle">Sign in to view your children's fee invoices.</p>

          <form class="login-form" id="pp-login-form" novalidate>
            <div class="login-field-group">
              <label class="login-label" for="pp-login-email">Email address</label>
              <input type="email" id="pp-login-email" class="login-input" autocomplete="username" spellcheck="false">
            </div>
            <div class="login-field-group" style="margin-top:28px;">
              <label class="login-label" for="pp-login-password">Password</label>
              <input type="password" id="pp-login-password" class="login-input" autocomplete="current-password">
              <div class="login-field-footer">
                <span></span>
                <a href="#" class="login-forgot-link" id="pp-forgot-btn">Forgot password?</a>
              </div>
            </div>
            <p class="login-error-msg" id="pp-login-error" role="alert" hidden></p>
            <button type="submit" class="login-submit-btn" id="pp-login-submit-btn">Sign In</button>
          </form>
        </div>
      </div>
      <p class="login-footer-note">&copy; ${new Date().getFullYear()} Seven Oaks International School &middot; Parent portal</p>
    </div>
  `;

  document.getElementById('pp-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('pp-login-email').value.trim();
    const password = document.getElementById('pp-login-password').value;
    const errorEl = document.getElementById('pp-login-error');
    const btn = document.getElementById('pp-login-submit-btn');
    errorEl.hidden = true;

    if (!email || !password) {
      errorEl.textContent = 'Please enter your email and password.';
      errorEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = 'Signing in…';

    try {
      const data = await ppApiFetchPublic('/parent/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (!data.access_token) throw new Error('Login failed: no token received.');
      ppToken = data.access_token;
      ppCurrentEmail = email;
      sessionStorage.setItem(PP_TOKEN_KEY, ppToken);
      sessionStorage.setItem('edugiga_parent_email', email);
      ppRenderDashboard();
    } catch (err) {
      let msg = err.message || 'Login failed. Please check your credentials.';
      if (err.status === 429) msg = 'Too many attempts. Please wait a few minutes and try again.';
      errorEl.textContent = msg;
      errorEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = 'Sign In';
    }
  });

  document.getElementById('pp-forgot-btn').addEventListener('click', (e) => {
    e.preventDefault();
    ppRenderForgotPassword();
  });
}

// ==================== FORGOT / RESET PASSWORD ====================

function ppRenderForgotPassword() {
  const inner = document.querySelector('.login-form-inner');
  inner.innerHTML = `
    ${ppLogoMarkup('Password Reset')}
    <div class="login-card-body">
      <h1 class="login-welcome">Reset your password</h1>
      <p class="login-reset-hint">Enter the email address linked to your account and we'll send you a link to reset your password.</p>
      <form id="pp-forgot-form" novalidate>
        <div class="login-field-group">
          <label class="login-label" for="pp-reset-email">Email address</label>
          <input type="email" id="pp-reset-email" class="login-input" autocomplete="email" spellcheck="false">
        </div>
        <p class="login-error-msg" id="pp-reset-error" role="alert" hidden></p>
        <p class="login-success-msg" id="pp-reset-success" hidden></p>
        <button type="submit" class="login-submit-btn" id="pp-reset-submit-btn">Send Reset Link</button>
      </form>
      <div style="text-align:center;margin-top:28px;">
        <a href="#" class="login-back-link" id="pp-back-to-login-btn">&larr; Back to Sign In</a>
      </div>
    </div>
  `;

  document.getElementById('pp-back-to-login-btn').addEventListener('click', (e) => {
    e.preventDefault();
    ppRenderLogin();
  });

  document.getElementById('pp-forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('pp-reset-email').value.trim();
    const errorEl = document.getElementById('pp-reset-error');
    const successEl = document.getElementById('pp-reset-success');
    const btn = document.getElementById('pp-reset-submit-btn');
    errorEl.hidden = true; successEl.hidden = true;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = 'Please enter a valid email address.';
      errorEl.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = 'Sending…';

    try {
      // Endpoint is deliberately silent (always 200) whether or not the account exists.
      await ppApiFetchPublic('/parent/request-password-reset', { method: 'POST', body: JSON.stringify({ email }) });
      successEl.textContent = 'If an account exists for that email, a reset link has been sent. Please check your inbox (and spam folder).';
      successEl.hidden = false;
      btn.textContent = 'Link Sent';
    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong. Please try again in a moment.';
      errorEl.hidden = false;
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = 'Send Reset Link';
    }
  });
}

function ppCheckForResetToken() {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('token');
  if (resetToken) {
    ppRenderSetNewPassword(resetToken);
    return true;
  }
  return false;
}

function ppRenderSetNewPassword(resetToken) {
  const root = document.getElementById('pp-root');
  root.innerHTML = `
    <div class="login-container">
      <div class="login-form-inner">
        ${ppLogoMarkup('Password Reset')}
        <div class="login-card-body">
          <h1 class="login-welcome">Set a new password</h1>
          <p class="login-reset-hint">Choose a strong password that you haven't used before.</p>
          <form id="pp-new-password-form" novalidate>
            <div class="login-field-group">
              <label class="login-label" for="pp-new-password">New password</label>
              <input type="password" id="pp-new-password" class="login-input" autocomplete="new-password">
            </div>
            <div class="login-field-group" style="margin-top:28px;">
              <label class="login-label" for="pp-confirm-password">Confirm new password</label>
              <input type="password" id="pp-confirm-password" class="login-input" autocomplete="new-password">
            </div>
            <p class="login-error-msg" id="pp-new-pwd-error" role="alert" hidden></p>
            <p class="login-success-msg" id="pp-new-pwd-success" hidden></p>
            <button type="submit" class="login-submit-btn" id="pp-new-pwd-submit">Set New Password</button>
          </form>
          <p class="login-footer-note" style="margin-top:16px;">
            Already set your password? <a href="#" onclick="window.history.replaceState({}, '', window.location.pathname); ppRenderLogin(); return false;">Back to login</a>
          </p>
        </div>
      </div>
      <p class="login-footer-note">&copy; ${new Date().getFullYear()} Seven Oaks International School &middot; Parent portal</p>
    </div>
  `;

  document.getElementById('pp-new-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPwd = document.getElementById('pp-new-password').value;
    const confirm = document.getElementById('pp-confirm-password').value;
    const errEl = document.getElementById('pp-new-pwd-error');
    const sucEl = document.getElementById('pp-new-pwd-success');
    const btn = document.getElementById('pp-new-pwd-submit');
    errEl.hidden = true; sucEl.hidden = true;

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
      await ppApiFetchPublic('/parent/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, new_password: newPwd })
      });
      sucEl.textContent = 'Your password has been updated successfully. You can now sign in with your new password.';
      sucEl.hidden = false;
      btn.textContent = 'Password Updated';
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
        ppRenderLogin();
      }, 3000);
    } catch (err) {
      errEl.textContent = err.message || 'This reset link may have expired. Please request a new one.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = 'Set New Password';
    }
  });
}

// ==================== DASHBOARD — MY CHILDREN ====================

function ppChildName(c) {
  return c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name || 'Student';
}
function ppChildMeta(c) {
  const parts = [];
  if (c.student_id) parts.push(`Adm. No. ${c.student_id}`);
  const cls = c.class_name || c.school_class_name || c.class || null;
  if (cls) parts.push(cls);
  return parts.join(' • ') || '—';
}

async function ppRenderDashboard() {
  const root = document.getElementById('pp-root');
  document.body.classList.remove('login-page');
  root.innerHTML = `
    <div class="pp-shell">
      ${ppTopbarMarkup()}
      <div class="pp-container">
        <div class="pp-page-header">
          <h1 class="pp-page-title">My Children</h1>
          <p class="pp-page-subtitle">Select a child to view their fee invoices.</p>
        </div>
        <div id="pp-children-list">
          <div class="pp-table-wrap">
            ${[1,2,3].map(() => `<div class="pp-skeleton-row"><div class="shimmer"></div><div class="shimmer"></div></div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  const res = await ppApiFetch('/parent/my-children');
  const listEl = document.getElementById('pp-children-list');
  if (!listEl) return;
  if (!res || !res.ok) {
    listEl.innerHTML = `<p style="color:var(--color-danger)">Failed to load your children. Please try again.</p>`;
    return;
  }
  const children = ppToArray(await res.json());
  if (children.length === 0) {
    listEl.innerHTML = `
      <div class="pp-empty-state">
        <div class="pp-empty-state-icon">&#128100;</div>
        <p>No children are linked to this account yet. Please contact the school office.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = `
    <div class="pp-children-grid">
      ${children.map(c => `
        <div class="pp-child-card" data-student-id="${ppEsc(c.id)}" data-student-name="${ppEsc(ppChildName(c))}">
          <div class="pp-child-avatar">${ppEsc(ppChildName(c).charAt(0).toUpperCase())}</div>
          <p class="pp-child-name">${ppEsc(ppChildName(c))}</p>
          <p class="pp-child-meta">${ppEsc(ppChildMeta(c))}</p>
          <div class="pp-child-cta">View Fee Invoices &rarr;</div>
        </div>
      `).join('')}
    </div>
  `;
  // Delegated click (not inline onclick+JSON.stringify) — a child's name is a
  // string, and JSON.stringify wraps strings in double quotes that prematurely
  // terminate the double-quoted onclick attribute, silently breaking the click
  // handler for every card (same bug class fixed in dashboard.js renderSplitView).
  listEl.querySelectorAll('.pp-child-card').forEach(card => {
    card.addEventListener('click', () => ppRenderFees(card.dataset.studentId, card.dataset.studentName));
  });
}

// ==================== FEES ====================

function ppMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ppDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? v : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function ppRenderFees(studentId, studentName) {
  const root = document.getElementById('pp-root');
  root.innerHTML = `
    <div class="pp-shell">
      ${ppTopbarMarkup()}
      <div class="pp-container">
        <a class="pp-back-link" onclick="ppRenderDashboard()">&larr; Back to My Children</a>
        <div class="pp-page-header">
          <h1 class="pp-page-title">${ppEsc(studentName)}</h1>
          <p class="pp-page-subtitle">Fee invoices</p>
        </div>
        <div id="pp-fees-content">
          <div class="pp-table-wrap">
            ${[1,2,3].map(() => `<div class="pp-skeleton-row"><div class="shimmer"></div><div class="shimmer"></div></div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  const res = await ppApiFetch(`/parent/fees/${studentId}`);
  const contentEl = document.getElementById('pp-fees-content');
  if (!contentEl) return;
  if (!res || !res.ok) {
    contentEl.innerHTML = `<p style="color:var(--color-danger)">Failed to load fee invoices. Please try again.</p>`;
    return;
  }
  // /parent/fees/{id} returns invoices in every status, including cancelled —
  // parents should never see or be billed for a cancelled invoice.
  const invoices = ppToArray(await res.json()).filter(i => i.status !== 'cancelled');
  if (invoices.length === 0) {
    contentEl.innerHTML = `
      <div class="pp-empty-state">
        <div class="pp-empty-state-icon">&#128203;</div>
        <p>No fee invoices found for this child yet.</p>
      </div>`;
    return;
  }

  const totalDue = invoices.reduce((s, i) => s + Number(i.amount_due || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const totalBalance = invoices.reduce((s, i) => s + Number(i.balance || 0), 0);

  contentEl.innerHTML = `
    <div class="pp-summary-row">
      <div class="pp-summary-tile">
        <p class="pp-summary-label">Total Invoiced</p>
        <p class="pp-summary-value">${ppMoney(totalDue)}</p>
      </div>
      <div class="pp-summary-tile">
        <p class="pp-summary-label">Total Paid</p>
        <p class="pp-summary-value">${ppMoney(totalPaid)}</p>
      </div>
      <div class="pp-summary-tile">
        <p class="pp-summary-label">Outstanding Balance</p>
        <p class="pp-summary-value pp-balance-due">${ppMoney(totalBalance)}</p>
      </div>
    </div>
    <div class="pp-table-wrap">
      <table class="pp-table">
        <thead>
          <tr>
            <th>Invoice No.</th>
            <th>Issue Date</th>
            <th>Due Date</th>
            <th>Amount Due</th>
            <th>Amount Paid</th>
            <th>Balance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map(inv => `
            <tr>
              <td>${ppEsc(inv.invoice_number || `#${inv.id}`)}</td>
              <td>${ppDate(inv.issue_date)}</td>
              <td>${ppDate(inv.due_date)}</td>
              <td>${ppMoney(inv.amount_due)}</td>
              <td>${ppMoney(inv.amount_paid)}</td>
              <td>${ppMoney(inv.balance)}</td>
              <td><span class="pp-status-badge pp-status-${ppEsc(inv.status || 'draft')}">${ppEsc((inv.status || '—').replace(/_/g, ' '))}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ==================== DOCUMENTS ====================
// GET /parent/documents — server-side filters to is_active=true and the union
// of is_global=true OR any level one of the parent's children sits in, already
// ordered uploaded_at DESC (ParentDocumentRow shape — no student linkage on
// the row itself).

const PP_DOC_TYPE_LABELS = { newsletter: 'Newsletter', term_calendar: 'Term Calendar', general: 'General' };
const PP_DOC_TYPE_COLORS = {
  newsletter:    'color:#8a6d00;background:#f5e6a8;',
  term_calendar: 'color:#1a5fb4;background:#dce8fb;',
  general:       'color:#555;background:#eee;',
};
function ppDocTypeBadge(type) {
  const label = PP_DOC_TYPE_LABELS[type] || type || '—';
  const style = PP_DOC_TYPE_COLORS[type] || 'color:#555;background:#eee;';
  return `<span class="pp-status-badge" style="${style}">${ppEsc(label)}</span>`;
}

async function ppRenderDocuments() {
  const root = document.getElementById('pp-root');
  root.innerHTML = `
    <div class="pp-shell">
      ${ppTopbarMarkup('documents')}
      <div class="pp-container">
        <div class="pp-page-header">
          <h1 class="pp-page-title">Documents</h1>
          <p class="pp-page-subtitle">Newsletters, term calendars and general documents from the school.</p>
        </div>
        <div id="pp-documents-content">
          <div class="pp-table-wrap">
            ${[1,2,3].map(() => `<div class="pp-skeleton-row"><div class="shimmer"></div><div class="shimmer"></div></div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  const res = await ppApiFetch('/parent/documents');
  const contentEl = document.getElementById('pp-documents-content');
  if (!contentEl) return;
  if (!res || !res.ok) {
    contentEl.innerHTML = `<p style="color:var(--color-danger)">Failed to load documents. Please try again.</p>`;
    return;
  }
  const docs = ppToArray(await res.json());
  if (docs.length === 0) {
    contentEl.innerHTML = `
      <div class="pp-empty-state">
        <div class="pp-empty-state-icon">&#128196;</div>
        <p>No documents from the school yet.</p>
      </div>`;
    return;
  }

  window._ppDocMap = {};
  docs.forEach(d => { window._ppDocMap[d.id] = d; });
  contentEl.innerHTML = `
    <div class="pp-table-wrap">
      <table class="pp-table">
        <thead>
          <tr><th>Title</th><th>Type</th><th>Uploaded</th><th></th></tr>
        </thead>
        <tbody>
          ${docs.map(d => `
            <tr>
              <td>${ppEsc(d.title || '—')}</td>
              <td>${ppDocTypeBadge(d.document_type)}</td>
              <td>${ppDate(d.uploaded_at)}</td>
              <td><a class="pp-back-link" style="margin:0;" onclick="ppDownloadDocument(${d.id})">Download &darr;</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// file_path may come back as either an absolute URL or a path relative to the
// API's own origin (not the frontend's) — normalize before fetching either way.
function ppResolveFileUrl(filePath) {
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const origin = PP_API_BASE.replace(/\/api\/?$/, '');
  return filePath.startsWith('/') ? origin + filePath : `${origin}/${filePath}`;
}

// Authenticated blob download (not a raw <a href>) — a plain anchor sends no
// Authorization header, so an auth-gated file route would 401 on click.
async function ppDownloadDocument(id) {
  const doc = (window._ppDocMap || {})[id];
  if (!doc) return;
  const fileUrl = ppResolveFileUrl(doc.file_path);
  try {
    const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${ppToken}` } });
    if (!res.ok) { showToast('Could not download this document.', 'error'); return; }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    const filename = match ? decodeURIComponent(match[1]) : (doc.title || 'document');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (_) {
    showToast('Could not download this document.', 'error');
  }
}

// ==================== BOOTSTRAP ====================

if (!ppCheckForResetToken()) {
  if (ppToken) ppRenderDashboard();
  else ppRenderLogin();
}
