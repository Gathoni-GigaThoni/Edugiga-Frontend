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
  options.headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };
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
