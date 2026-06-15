// app.js

const API_BASE = "https://edugiga-sois-api.onrender.com";

// ── Token & user – restored from sessionStorage on page load ──────────────────
let token = sessionStorage.getItem('edugiga_token') || '';
let currentUser = null;
if (token) {
  try {
    currentUser = JSON.parse(atob(token.split('.')[1]));
  } catch (_) {
    token = '';
    sessionStorage.removeItem('edugiga_token');
  }
}

// ── In-memory data stores ─────────────────────────────────────────────────────
const employeesData = [];
const employeeServiceProfilesData = [];
const financialInstitutionsData = [];

// Finance
let studentInvoicesData            = [];
let sessionData                    = [];
let studentClassesData             = [];
let studentInvoiceAdjustmentsData  = [];
let sponsorshipAllocationsData     = [];
let feeSetupPerClassData           = [];
let receivePaymentsData            = [];
let chartOfAccountsData            = [];
let feeAccountsData                = [];

// ── Global fetch wrapper ──────────────────────────────────────────────────────
// Attaches Authorization header, handles 401, and retries once on network
// failure (the backend may be waking from sleep on the first request).
async function apiFetch(url, options = {}, _attempt = 0) {
  const mergedHeaders = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  // When body is FormData the browser must set Content-Type (multipart/form-data + boundary).
  // Removing it here prevents callers from accidentally locking it to application/json.
  if (options.body instanceof FormData) delete mergedHeaders['Content-Type'];
  options.headers = mergedHeaders;
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    if (_attempt === 0) {
      // Server may be waking up — wait 3 s then try once more
      await new Promise(r => setTimeout(r, 3000));
      return apiFetch(url, options, 1);
    }
    console.error('apiFetch failed:', url, err.message);
    showToast('Could not reach the server. Please try again in a moment.', 'error');
    return null;
  }
  if (res.status === 401) {
    showToast('Session expired. Please log in again.', 'error');
    logout();
    return null;
  }
  return res;
}

// ── API error parser ─────────────────────────────────────────────────────────
// Extracts a readable string from any API error response.
// Handles FastAPI validation errors (detail = array of objects),
// plain string detail, and fallback to HTTP status.
async function parseApiError(res) {
  try {
    const body = await res.json();
    if (!body) return `HTTP ${res.status}`;
    const { detail } = body;
    if (!detail) return `HTTP ${res.status}`;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map(e => {
        const loc = Array.isArray(e.loc) ? e.loc.filter(x => x !== 'body').join(' → ') : '';
        return loc ? `${loc}: ${e.msg || ''}` : (e.msg || JSON.stringify(e));
      }).join('; ');
    }
    return JSON.stringify(detail);
  } catch (_) {
    return `HTTP ${res.status}`;
  }
}

// ── Shared dropdown populators ────────────────────────────────────────────────
// Fetch sessions from the API and populate a <select> element.
// Pass selectedId to pre-select an option (for edit forms).
async function populateSessionDropdown(selectId, selectedId = null) {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const res = await apiFetch(`${API_BASE}/sessions/`);
    if (res && res.ok) {
      const data = await res.json();
      const sessions = (Array.isArray(data) ? data : (data.data || data.results || []))
        .filter(s => !s.is_inactive);
      const placeholder = select.options[0]?.value === '' ? select.options[0].textContent : '-- Select Session --';
      select.innerHTML = `<option value="">${placeholder}</option>`;
      sessions.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.title || s.name || `Session ${s.id}`;
        if (selectedId && String(s.id) === String(selectedId)) opt.selected = true;
        select.appendChild(opt);
      });
    }
  } catch (_) {}
}

// Fetch academic levels from the API and populate a <select> element.
async function populateAcademicLevelsDropdown(selectId, selectedId = null) {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const res = await apiFetch(`${API_BASE}/academic-levels/`);
    if (res && res.ok) {
      const raw = await res.json();
      const levels = Array.isArray(raw) ? raw : (raw.data || raw.items || raw.results || []);
      const placeholder = select.options[0]?.value === '' ? select.options[0].textContent : '-- Select Level --';
      select.innerHTML = `<option value="">${placeholder}</option>`;
      levels.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.name;
        if (selectedId && String(l.id) === String(selectedId)) opt.selected = true;
        select.appendChild(opt);
      });
    }
  } catch (e) { console.error('populateAcademicLevelsDropdown:', e); }
}

// ── Keep-alive ────────────────────────────────────────────────────────────────
// Pings the backend every 2 minutes while the user is on a form page so the
// server stays warm and saves don't fail with connection-refused errors.
let keepAliveInterval = null;
let keepAliveActive   = false;

function startKeepAlive() {
  if (keepAliveActive) return;          // already running — don't stack timers
  keepAliveActive = true;
  keepAliveInterval = setInterval(() => {
    // Fire-and-forget: silent GET to a cheap health endpoint
    fetch(`${API_BASE}/health`, { headers: { Authorization: `Bearer ${token}` } })
      .catch(() => {});                  // ignore all errors — purely preventive
  }, 120000);                            // every 2 minutes
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  keepAliveActive = false;
}

// ── Toast notifications ───────────────────────────────────────────────────────
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
  // Trigger animation then remove
  requestAnimationFrame(() => toast.classList.add('app-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('app-toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}
