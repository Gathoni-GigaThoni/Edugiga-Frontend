// ==================== AUTH ====================
async function login() {
  const email = document.getElementById("email").value;
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
    const payload = JSON.parse(atob(token.split('.')[1]));
    currentUser = payload;
    showDashboard();
  } catch (err) {
    document.getElementById("error").innerText = err.message;
  }
}

function logout() {
  token = "";
  currentUser = null;
  location.reload();
}
