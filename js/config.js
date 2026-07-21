// app.js

const API_BASE = "https://edugiga-sois-api.onrender.com/api";

// ── Sibling Groups: browser-local "known groups" index ───────────────────────
// The backend has no GET-list endpoint for sibling groups (only POST create
// and GET by id — confirmed live, see finance-module memory) so Finance >
// Set-up > Sibling Groups can't fetch "every group that exists." This index
// (localStorage, not sessionStorage — persists across visits/reloads, unlike
// the one-shot `_edugiga_last_sibling_group_id` handoff key) is the closest
// achievable substitute: every id this browser has created/joined via
// _stuSyncSiblingGroup (students.js) gets remembered here, so the Sibling
// Groups page can show them automatically instead of requiring the user to
// already know a Group ID. It is inherently browser-local, not a real
// system-wide list — a group created from a different device/browser won't
// appear here.
function rememberSiblingGroupId(id) {
  if (!id) return;
  try {
    const ids = JSON.parse(localStorage.getItem('edugiga_known_sibling_groups') || '[]');
    const next = [String(id), ...ids.filter(x => String(x) !== String(id))].slice(0, 50);
    localStorage.setItem('edugiga_known_sibling_groups', JSON.stringify(next));
  } catch (_) {}
}
function knownSiblingGroupIds() {
  try { return JSON.parse(localStorage.getItem('edugiga_known_sibling_groups') || '[]'); }
  catch (_) { return []; }
}

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

// Canonical "Level of Academics" placement rules, youngest to oldest:
// Acorns (Playgroup) -> Willows (Foundation 1) -> Maples (Foundation 2) -> Oaks (Reception).
// minMonths/maxMonths are the strict age-in-whole-months eligibility window
// per school policy (ranges deliberately overlap ~5 months at each boundary
// to allow borderline placement judgement). Used to (a) force the dropdown
// to always show these four in this exact order/wording regardless of the
// backend record's own name/sort_order/description, and (b) drive the
// age-based suggestion in students.js (_suggestLevelFromAge).
const ACADEMIC_LEVEL_RULES = [
  { key: 'acorn',  label: '🌱 Acorns — Playgroup (Aged 2-3 Years)',    minMonths: 1 * 12 + 10, maxMonths: 3 * 12 + 3 },
  { key: 'willow', label: '🌿 Willows — Foundation 1 (Aged 3-4 Years)', minMonths: 2 * 12 + 10, maxMonths: 4 * 12 + 3 },
  { key: 'maple',  label: '🍁 Maples — Foundation 2 (Aged 4-5 Years)',  minMonths: 3 * 12 + 10, maxMonths: 5 * 12 + 3 },
  { key: 'oak',    label: '🌳 Oaks — Reception (Aged 5-6 Years)',      minMonths: 4 * 12 + 10, maxMonths: 6 * 12 + 3 },
];

// Canonical display name for an academic level, for every place in the app that
// shows one outside the age-suggestion dropdown (other dropdowns, tables, detail
// views) — matches ACADEMIC_LEVEL_RULES by substring against the raw stored name
// (case insensitive) and returns the icon+plural+stage label; falls back to the
// raw name for anything that isn't one of the four known levels. Accepts either
// a level record ({name: ...}) or a raw name string directly.
function academicLevelDisplayName(levelOrName) {
  const raw = (typeof levelOrName === 'string' ? levelOrName : levelOrName?.name) || '';
  const rule = ACADEMIC_LEVEL_RULES.find(r => raw.toLowerCase().includes(r.key));
  return rule ? rule.label : raw;
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

    // Match backend records to the canonical rules by name substring (case
    // insensitive), then display Acorns, Willows, Maples, Oaks in that fixed
    // order with the fixed labels above — not whatever order/wording the
    // backend happens to return. Anything that doesn't match one of the
    // four known names falls back to its own raw name (kept, appended after,
    // so a future/unexpected level doesn't just vanish from the dropdown).
    const matchedIds = new Set();
    const ordered = [];
    ACADEMIC_LEVEL_RULES.forEach(rule => {
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

// ── Module registry cache (GET /api/administration/modules) ─────────────────
// Fetched once at login. Confirmed live response shape:
//   { modules: [{ key, label, parent_key, can_view, can_add, can_edit, can_delete }] }
// Flat list, dot-notation keys (e.g. "finance.receivables"), parent_key is
// null for top-level nav headers. A top-level (or any) entry with
// can_view:false that still appears in the response is a nav-header-only
// row — it exists purely so its viewable children have somewhere to hang
// (confirmed: "the backend already omits header-only items that have no
// viewable descendants"). Replaces the old /roles/{role_id}/permissions +
// /roles/permissions/matrix label-matching approach entirely — this one
// endpoint gives real keys and per-action flags in a single call, so there's
// no more guessing/label-matching needed anywhere.
let _modulesByKey = {};
let _modulesLoaded = false; // true once a fetch has SUCCEEDED — see _moduleFlag for why this matters

async function loadModulesCache() {
  try {
    const res = await apiFetch(`${API_BASE}/administration/modules`);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      const list = data?.modules || [];
      _modulesByKey = {};
      list.forEach(m => { if (m?.key) _modulesByKey[m.key] = m; });
      _modulesLoaded = true;
    }
  } catch (_) {}
}

function _isSuperAdmin() {
  return currentUser?.clearance_level === 1 || currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'super_admin';
}

// Generic flag lookup — flag is 'can_view'|'can_add'|'can_edit'|'can_delete'.
// Fails OPEN only when there's genuinely no data to judge from: the fetch
// never completed (network/auth issue — avoids locking every non-admin user
// out of everything over an unrelated loading bug) or this specific key was
// never registered (a screen with no matching permission key yet — nothing
// defined to enforce). Fails CLOSED (returns false) whenever the fetch
// succeeded and the registry explicitly says false for this key — including
// the documented "authenticated but no role assigned" -> modules:[] case,
// since that's real signal from the backend, not a data-loading gap.
function _moduleFlag(key, flag) {
  if (_isSuperAdmin()) return true;
  if (!key) return true;
  if (!_modulesLoaded) return true;
  const m = _modulesByKey[key];
  if (!m) return true;
  return !!m[flag];
}

function canView(key)   { return _moduleFlag(key, 'can_view'); }
function canAdd(key)    { return _moduleFlag(key, 'can_add'); }
function canEdit(key)   { return _moduleFlag(key, 'can_edit'); }
function canDelete(key) { return _moduleFlag(key, 'can_delete'); }

// True if `key` itself is viewable, OR any registered key nested under it
// (dot-prefix match, any depth) is viewable. Used for rail/flyout-group
// visibility: a parent header can have can_view:false while still needing
// to render (as an expandable group) so its viewable children stay reachable.
function hasModuleAccess(key) {
  if (_isSuperAdmin()) return true;
  if (!key) return true;
  if (!_modulesLoaded) return true;
  return Object.entries(_modulesByKey).some(([k, m]) =>
    m.can_view && (k === key || k.startsWith(key + '.'))
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
