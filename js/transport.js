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
  const res = await fetch(`${API_BASE}/routes/`, { headers: { "Authorization": `Bearer ${token}` } });
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
  const res = await fetch(`${API_BASE}/routes/`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(payload)
  });
  if (res.ok) { alert("Route added!"); loadTransportView(document.getElementById("main-content")); }
  else { alert("Error adding route"); }
}

