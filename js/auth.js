// ==================== AUTH ====================
async function login() {
  const email    = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);
  try {
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
    showDashboard();
  } catch (err) {
    document.getElementById("error").innerText = err.message;
  }
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
        headers: { Authorization: `Bearer ${token}` }
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
