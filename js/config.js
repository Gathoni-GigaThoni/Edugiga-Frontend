// app.js

const API_BASE = "https://edu-giga-school-management-system-1.onrender.com";

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
// Automatically attaches Authorization header; redirects to login on 401.
async function apiFetch(url, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };
  let res;
  try {
    res = await fetch(url, options);
  } catch (_) {
    showToast('Network error. Please check your connection.', 'error');
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
