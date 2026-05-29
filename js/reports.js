// ==================== REPORTS (hidden from sidebar) ====================
async function loadReportsView(container) {
  container.innerHTML = `
    <h2>Reports</h2>
    <button onclick="loadDailyCollections()">Daily Collections</button>
    <button onclick="loadDebtors()">Debtor List</button>
    <div id="report-output"></div>
  `;
}

async function loadDailyCollections() {
  const date = prompt("Enter date (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
  const res = await fetch(`${API_BASE}/finance/reports/daily-collections?date=${date}`, { headers: { "Authorization": `Bearer ${token}` } });
  const data = await res.json();
  document.getElementById("report-output").innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

async function loadDebtors() {
  const res = await fetch(`${API_BASE}/finance/reports/debtors`, { headers: { "Authorization": `Bearer ${token}` } });
  const data = await res.json();
  document.getElementById("report-output").innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

