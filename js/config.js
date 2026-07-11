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

// Canonical "Level of Academics" placement rules, youngest to oldest.
// minMonths/maxMonths are the strict age-in-whole-months eligibility window
// per school policy (ranges deliberately overlap ~5 months at each boundary
// to allow borderline placement judgement). Used to (a) force the dropdown
// to always show these four in this exact order/wording regardless of the
// backend record's own name/sort_order/description, and (b) drive the
// age-based suggestion in students.js (_suggestLevelFromAge).
const ACADEMIC_LEVEL_RULES = [
  { key: 'acorn',  label: 'Acorn(Aged 2-3 Years)',  minMonths: 1 * 12 + 10, maxMonths: 3 * 12 + 3 },
  { key: 'maple',  label: 'Maple(Aged 3-4 Years)',   minMonths: 2 * 12 + 10, maxMonths: 4 * 12 + 3 },
  { key: 'willow', label: 'Willow(Aged 4-5 Years)',  minMonths: 3 * 12 + 10, maxMonths: 5 * 12 + 3 },
  { key: 'oak',    label: 'Oak(Aged 5-6 Years)',     minMonths: 4 * 12 + 10, maxMonths: 6 * 12 + 3 },
];

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

    // Match backend records to the canonical rules by name substring (case
    // insensitive), then display Oak, Willow, Maple, Acorn in that fixed
    // order with the fixed labels above — not whatever order/wording the
    // backend happens to return. Anything that doesn't match one of the
    // four known names falls back to its own raw name (kept, appended after,
    // so a future/unexpected level doesn't just vanish from the dropdown).
    const matchedIds = new Set();
    const ordered = [];
    [...ACADEMIC_LEVEL_RULES].reverse().forEach(rule => {
      const rec = levels.find(l => (l.name || '').toLowerCase().includes(rule.key));
      if (rec) {
        matchedIds.add(rec.id);
        ordered.push({ id: rec.id, label: rule.label, levelKey: rule.key, description: rec.description });
      }
    });
    levels.forEach(l => {
      if (!matchedIds.has(l.id)) ordered.push({ id: l.id, label: l.name, levelKey: null, description: l.description });
    });

    select.innerHTML = `<option value="">${placeholder}</option>`;
    ordered.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.label;
      if (l.levelKey) opt.dataset.levelKey = l.levelKey;
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

// ── Current-user permission store ────────────────────────────────────────────
// Populated after login from GET /roles/{role_id}/permissions.
// Keys are module_key strings; values are { can_view, can_add, can_edit, can_delete }.
let _userPermissions = {};

async function loadCurrentUserPermissions() {
  const roleId = currentUser?.role_id;
  if (!roleId) return;
  try {
    const res = await apiFetch(`${API_BASE}/roles/${roleId}/permissions`);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      const list = data?.permissions || (Array.isArray(data) ? data : []);
      _userPermissions = {};
      list.forEach(p => {
        _userPermissions[p.module_key] = {
          can_view:   !!p.can_view,
          can_add:    !!p.can_add,
          can_edit:   !!p.can_edit,
          can_delete: !!p.can_delete,
        };
      });
    }
  } catch (_) {}
}

// Returns true if the current user has the given permission on a module.
// Super admins (clearance_level 1 or role SUPER_ADMIN) bypass all checks.
// action must be one of: 'can_view', 'can_add', 'can_edit', 'can_delete'
function hasPermission(moduleKey, action) {
  if (currentUser?.clearance_level === 1 || currentUser?.role === 'SUPER_ADMIN') return true;
  const p = _userPermissions[moduleKey];
  return !!(p && p[action]);
}

// ── Rail/module-level access check ───────────────────────────────────────────
// The permissions matrix (GET /roles/permissions/matrix) is the only place
// that pairs a human label ("Finance", "Student Management", ...) with its
// authoritative module_key — so rail/flyout labels are matched against that
// live map instead of guessing a key spelling by hand (only
// student_management/transport_management/payroll/dashboard were ever
// confirmed live — see frontend-gotchas memory).
//
// Fetched independently here (not via roles.js's _loadPermMatrix()) and
// fully silent on failure: that helper surfaces an error toast, which is
// fine on the admin-only Edit Role page but would misfire for every
// non-admin user on every login if this endpoint turns out to be
// admin-restricted. A failed/empty fetch just means every hasModuleAccess()
// lookup below falls through to "no entry for this label" → fail open.
let _permLabelToKey = null;
let _permLabelToKeyPromise = null; // in-flight guard — _computeRailAccess() calls this ~12x at once
async function _permMatrixLabelMap() {
  if (_permLabelToKey) return _permLabelToKey;
  if (_permLabelToKeyPromise) return _permLabelToKeyPromise;
  _permLabelToKeyPromise = (async () => {
    const map = {};
    try {
      const res = await apiFetch(`${API_BASE}/roles/permissions/matrix`);
      if (res && res.ok) {
        const matrix = await res.json().catch(() => ({}));
        Object.entries(matrix || {}).forEach(([key, def]) => {
          if (def?.label) map[def.label] = key;
        });
      }
    } catch (_) {}
    _permLabelToKey = map;
    return map;
  })();
  return _permLabelToKeyPromise;
}

// Returns true if the current user can view the module whose rail/flyout
// label is `label` (e.g. "Finance", "Student Management"). Checks can_view on
// the matching top-level module_key OR any nested leaf under it, since parent
// modules with children never get their own permission row (only leaves do —
// see renderPermMatrix/_permFlattenLeaves in roles.js). If the matrix has no
// entry for this label at all, access is NOT restricted (nothing defined to
// enforce) so unmapped/new modules fail open rather than vanishing for
// everyone.
async function hasModuleAccess(label) {
  if (currentUser?.clearance_level === 1 || currentUser?.role === 'SUPER_ADMIN') return true;
  // If _userPermissions never got populated (loadCurrentUserPermissions() no-ops
  // silently when currentUser.role_id is missing/the fetch fails), we have no
  // basis to restrict anything — fail open rather than hiding every module for
  // every non-super-admin user because of an unrelated data-loading gap.
  if (Object.keys(_userPermissions).length === 0) return true;
  const map = await _permMatrixLabelMap();
  const permKey = map[label];
  if (!permKey) return true;
  return Object.entries(_userPermissions).some(([key, p]) =>
    p.can_view && (key === permKey || key.startsWith(permKey + '.'))
  );
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
