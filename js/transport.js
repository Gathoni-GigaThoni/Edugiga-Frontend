// ==================== TRANSPORT MANAGEMENT ====================
async function loadTransportView(container) {
  container.innerHTML = `
    <h2>Transport Management</h2>
    <button onclick="showRouteForm()">Add Route</button>
    <div id="route-list"></div>
    <div id="route-form" style="display:none;"></div>
  `;
  loadRoutes();
}

async function loadRoutes() {
  const res = await apiFetch(`${API_BASE}/routes/`);
  if (!res || !res.ok) { showToast('Could not load routes.', 'error'); return; }
  const routes = await res.json();
  let html = `<table><tr><th>Name</th><th>Two-Way</th><th>Morning</th><th>Evening</th><th>Daily</th></tr>`;
  routes.forEach(r => {
    html += `<tr><td>${r.name}</td><td>${r.two_way_price}</td><td>${r.one_way_morning_price}</td><td>${r.one_way_evening_price}</td><td>${r.daily_rate}</td></tr>`;
  });
  html += `</table>`;
  document.getElementById("route-list").innerHTML = html;
}

function showRouteForm() {
  const form = document.getElementById("route-form");
  form.style.display = "block";
  form.innerHTML = `
    <h3>Add Route</h3>
    <input id="route_name" placeholder="Route Name">
    <input id="route_two_way" placeholder="Two-Way Price">
    <input id="route_morning" placeholder="Morning Only Price">
    <input id="route_evening" placeholder="Evening Only Price">
    <input id="route_daily" placeholder="Daily Rate">
    <button onclick="addRoute()">Save</button>
  `;
}

async function addRoute() {
  const payload = {
    name: document.getElementById("route_name").value,
    two_way_price: parseFloat(document.getElementById("route_two_way").value),
    one_way_morning_price: parseFloat(document.getElementById("route_morning").value),
    one_way_evening_price: parseFloat(document.getElementById("route_evening").value),
    daily_rate: parseFloat(document.getElementById("route_daily").value)
  };
  const res = await apiFetch(`${API_BASE}/routes/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  if (!res) return;
  if (res.ok) {
    showToast("Route added successfully!", "success");
    loadTransportView(document.getElementById("main-content"));
  } else {
    showToast(await parseApiError(res), "error");
  }
}

