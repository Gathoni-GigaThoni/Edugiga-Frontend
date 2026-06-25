// app.js

const API_BASE = "https://edugiga-sois-api.onrender.com/api";

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
let feeItemsData                   = [];

// ── Global fetch wrapper ──────────────────────────────────────────────────────
// Attaches Authorization header, handles 401, and retries with backoff on
// network failure — Render free-tier dynos sleep after 15 min idle and commonly
// take 30-50s+ to wake, so a single 3s retry was nowhere near enough; this now
// retries up to 3 times with increasing delays (3s, 8s, 15s — ~26s total).
const _API_FETCH_RETRY_DELAYS_MS = [3000, 8000, 15000];
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
    if (_attempt < _API_FETCH_RETRY_DELAYS_MS.length) {
      if (_attempt === 0) showToast('Server is waking up, please wait…', 'info');
      await new Promise(r => setTimeout(r, _API_FETCH_RETRY_DELAYS_MS[_attempt]));
      return apiFetch(url, options, _attempt + 1);
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

// ── File upload ───────────────────────────────────────────────────────────────
// POSTs a single file to /upload/ as multipart/form-data and returns the URL the
// backend assigns it. apiFetch() already strips Content-Type for FormData bodies
// so the browser sets the multipart boundary itself.
async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch(`${API_BASE}/upload/`, { method: 'POST', body: fd });
  if (!res || !res.ok) {
    showToast('File upload failed: ' + (res ? await parseApiError(res) : 'network error'), 'error');
    return null;
  }
  const data = await res.json();
  return data.url || data.file_url || data.path || null;
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
// Fetch terms from the API and populate a <select> element.
// Pass selectedId to pre-select an option (for edit forms).
// (Replaces the old populateSessionDropdown — /sessions/ no longer exists on the
// backend; terms are the model that replaced sessions throughout.)
async function populateTermDropdown(selectId, selectedId = null) {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const res = await apiFetch(`${API_BASE}/terms/`);
    if (res && res.ok) {
      const data = await res.json();
      const terms = (Array.isArray(data) ? data : (data.data || data.results || []))
        .filter(t => t.is_active !== false);
      const placeholder = select.options[0]?.value === '' ? select.options[0].textContent : '-- Select Term --';
      select.innerHTML = `<option value="">${placeholder}</option>`;
      terms.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title || t.name || `Term ${t.id}`;
        if (selectedId && String(t.id) === String(selectedId)) opt.selected = true;
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
    if (!window._academicLevelsCache || !window._academicLevelsCache.length) {
      const res = await apiFetch(`${API_BASE}/academic-levels/`);
      if (res && res.ok) {
        const raw = await res.json();
        window._academicLevelsCache = Array.isArray(raw) ? raw : (raw.data || raw.items || raw.results || []);
      }
    }
    const levels = window._academicLevelsCache || [];
    const placeholder = select.options[0]?.value === '' ? select.options[0].textContent : '-- Select Level --';
    select.innerHTML = `<option value="">${placeholder}</option>`;
    levels.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      if (l.description) opt.dataset.description = l.description;
      if (selectedId && String(l.id) === String(selectedId)) opt.selected = true;
      select.appendChild(opt);
    });
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
    fetch(`${API_BASE}/terms/`, { headers: { Authorization: `Bearer ${token}` } })
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
