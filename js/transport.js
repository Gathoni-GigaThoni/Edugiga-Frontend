// ==================== TRANSPORT MANAGEMENT ====================

// ── Module-level state ────────────────────────────────────────────────────────
let _trnRoutesData  = [];
let _trnRoutePage   = 1;
let _trnRoutePerPage = 10;

window._currentEditRouteId = null;
let _trnRouteFormDirty = false;

// ── Placeholder for unrebuilt sub-modules ─────────────────────────────────────
function loadTrnPlaceholderView(container, title) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${title}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Transport Management &rsaquo; ${title}</div>
      </div>
      <div style="background:#fff;border-radius:6px;padding:48px 24px;text-align:center;
                  color:#888;border:1px solid #eee;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
        <p style="font-size:1rem;font-weight:600;margin:0;">Coming Soon</p>
        <p style="font-size:0.88rem;margin-top:8px;">This sub-module is currently under development.</p>
      </div>
    </div>
  `;
}

// ==================== ROUTES LISTING ====================

async function loadTransportRoutesView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Routes</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Transport Management &rsaquo; Routes &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="trn-rt-per-page" onchange="changeTrnRoutePerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="trn-rt-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV" onclick="exportTrnRoutesCSV()">&#128202;</button>
          <button class="fin-btn-teal" onclick="loadView('transport-routes-add')">+ Add</button>
        </div>
      </div>
      <div id="trn-rt-table"></div>
      <div id="trn-rt-pagination"></div>
    </div>
  `;
  renderSkeletonRows('trn-rt-table', 5);
  await _fetchTrnRoutes();
}

async function _fetchTrnRoutes() {
  const res = await apiFetch(`${API_BASE}/routes/`);
  if (res && res.ok) {
    const raw = await res.json();
    _trnRoutesData = Array.isArray(raw) ? raw : (raw.data || raw.results || raw.items || []);
  } else {
    _trnRoutesData = [];
    showToast('Could not load routes.', 'error');
  }
  _trnRoutePage = 1;
  _renderTrnRoutesTable();
}

function _renderTrnRoutesTable() {
  const totalEl = document.getElementById('trn-rt-total');
  if (totalEl) totalEl.textContent = _trnRoutesData.length;

  const start = (_trnRoutePage - 1) * _trnRoutePerPage;
  const paged = _trnRoutesData.slice(start, start + _trnRoutePerPage);
  const pages = Math.max(1, Math.ceil(_trnRoutesData.length / _trnRoutePerPage));
  const _e = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // RouteRead has no description/is_active/stops fields at all (id, name, and
  // the four prices are the only columns the backend returns) — showing pricing
  // is what the backend can actually back up.
  const rows = paged.length
    ? paged.map(r => `<tr>
          <td>${_e(r.name)}</td>
          <td>${_finFmt(parseFloat(r.two_way_price)||0)}</td>
          <td>${_finFmt(parseFloat(r.one_way_morning_price)||0)}</td>
          <td>${_finFmt(parseFloat(r.one_way_evening_price)||0)}</td>
          <td>${_finFmt(parseFloat(r.daily_rate)||0)}</td>
          <td class="fin-action-cell">
            <div class="fin-action-wrap">
              <button class="fin-action-btn" onclick="toggleTrnRtDd(event,'${r.id}')">&#8230;</button>
              <div id="trn-rt-dd-${r.id}" class="fin-action-dropdown" style="display:none;">
                <a href="#" onclick="trnOpenRouteEdit('${r.id}');return false;">&#9998; Edit</a>
              </div>
            </div>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="fin-empty">No routes found. Add one to get started.</td></tr>';

  const tbl = document.getElementById('trn-rt-table');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>NAME</th><th>TWO-WAY</th><th>MORNING ONLY</th><th>EVENING ONLY</th><th>DAILY RATE</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  _mkTrnPagination('trn-rt-pagination', _trnRoutePage, pages, 'trnRtGoPage');
}

function _mkTrnPagination(id, page, pages, goFn) {
  const el = document.getElementById(id);
  if (!el) return;
  let btns = '';
  for (let i = 1; i <= pages; i++) btns += `<button class="${i===page?'fin-pg-active':''}" onclick="${goFn}(${i})">${i}</button>`;
  el.innerHTML = `<div class="fin-pagination">${btns}</div>`;
}

function toggleTrnRtDd(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="trn-rt-dd-"]').forEach(d => { if (d.id !== `trn-rt-dd-${id}`) d.style.display = 'none'; });
  const dd = document.getElementById(`trn-rt-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="trn-rt-dd-"]').forEach(d => d.style.display = 'none');
});

function trnOpenRouteEdit(id) {
  window._currentEditRouteId = id;
  loadView('transport-routes-edit');
}

function changeTrnRoutePerPage(v) { _trnRoutePerPage = parseInt(v); _trnRoutePage = 1; _renderTrnRoutesTable(); }
function trnRtGoPage(p) { _trnRoutePage = p; _renderTrnRoutesTable(); }

function exportTrnRoutesCSV() {
  exportTableCSV(
    ['Name', 'Two-Way Price', 'Morning Only Price', 'Evening Only Price', 'Daily Rate'],
    _trnRoutesData.map(r => [
      r.name, r.two_way_price, r.one_way_morning_price, r.one_way_evening_price, r.daily_rate,
    ]),
    'transport-routes.csv'
  );
}

// ==================== ADD / EDIT ROUTE FORM ====================

async function loadTransportRouteFormView(container, routeId) {
  const isEdit = !!routeId;
  _trnRouteFormDirty = false;

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit ? 'Edit Route' : 'Add Route'}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Transport Management &rsaquo; Routes &rsaquo; ${isEdit ? 'Edit' : 'Add'}</div>
      </div>
      <div id="trn-rt-form-body" style="max-width:680px;background:#fff;border-radius:8px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.07);">
        <p class="fin-loading">Loading&#8230;</p>
      </div>
    </div>
  `;

  let route = null;
  if (isEdit) {
    const res = await apiFetch(`${API_BASE}/routes/${routeId}`);
    if (!res || !res.ok) { showToast('Could not load route.', 'error'); return; }
    route = await res.json();
  }

  // Fetch next-id for add mode; flag as backend gap if endpoint doesn't exist
  let routeCode = '';
  if (!isEdit) {
    try {
      const idRes = await apiFetch(`${API_BASE}/routes/next-id`);
      // TODO: backend needs GET /routes/next-id endpoint (same pattern as /students/next-id)
      if (idRes && idRes.ok) {
        const d = await idRes.json();
        routeCode = d.next_id || d.route_code || d.id || '';
      }
    } catch (_) {}
  } else {
    routeCode = route?.route_code || '';
  }

  _renderTrnRouteForm(container, route, routeCode, isEdit);
}

function _renderTrnRouteForm(container, route, routeCode, isEdit) {
  const _e = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const r = route || {};

  const body = document.getElementById('trn-rt-form-body');
  if (!body) return;

  body.innerHTML = `
    <div class="trn-form-group">
      <label class="trn-form-label">Route ID</label>
      <input type="text" class="fin-search-input trn-form-input" value="${_e(routeCode)}" readonly
             style="background:#f5f5f5;color:#666;cursor:not-allowed;">
    </div>

    <div class="trn-form-group">
      <label class="trn-form-label">Route Name <span style="color:#e74c3c">*</span></label>
      <input type="text" id="trn-rt-name" class="fin-search-input trn-form-input" value="${_e(r.name || '')}">
      <span class="stu-field-error" id="err-trn-rt-name"></span>
    </div>

    <div class="trn-form-group">
      <label class="trn-form-label">Stops / Destinations</label>
      ${isEdit
        ? `<div id="trn-stops-list" class="trn-stops-list"></div>
           <div style="display:flex;gap:8px;margin-top:8px;">
             <input type="text" id="trn-stop-new-input" class="fin-search-input" placeholder="Destination name" style="flex:1;">
             <button type="button" class="trn-add-stop-btn" onclick="trnAddStopLive('${route.id}')">+ Add Stop</button>
           </div>`
        : `<p class="trn-stops-hint">Save the route first, then add stops from its Edit page.</p>`}
    </div>

    <div class="trn-form-grid">
      <div class="trn-form-group">
        <label class="trn-form-label">Two-Way Price <span style="color:#e74c3c">*</span></label>
        <input type="number" id="trn-rt-two-way" class="fin-search-input trn-form-input" min="0" step="0.01"
               value="${_e(r.two_way_price ?? '')}">
        <span class="stu-field-error" id="err-trn-rt-price"></span>
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Morning Only Price <span style="color:#e74c3c">*</span></label>
        <input type="number" id="trn-rt-morning" class="fin-search-input trn-form-input" min="0" step="0.01"
               value="${_e(r.one_way_morning_price ?? '')}">
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Evening Only Price <span style="color:#e74c3c">*</span></label>
        <input type="number" id="trn-rt-evening" class="fin-search-input trn-form-input" min="0" step="0.01"
               value="${_e(r.one_way_evening_price ?? '')}">
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Daily Rate <span style="color:#e74c3c">*</span></label>
        <input type="number" id="trn-rt-daily" class="fin-search-input trn-form-input" min="0" step="0.01"
               value="${_e(r.daily_rate ?? '')}">
      </div>
    </div>

    <div style="display:flex;gap:12px;margin-top:24px;">
      <button class="fin-btn-teal" id="trn-rt-submit-btn" onclick="submitTrnRouteForm(${isEdit ? (route?.id ? `'${route.id}'` : 'null') : 'null'})">
        ${isEdit ? 'Update' : 'Save'}
      </button>
      <button class="fin-btn-cancel" onclick="cancelTrnRouteForm()">Cancel</button>
    </div>
  `;

  if (isEdit) _loadTrnStopsLive(route.id);

  // Mark dirty on any change
  body.querySelectorAll('input,textarea,select').forEach(el => {
    el.addEventListener('change', () => { _trnRouteFormDirty = true; });
    el.addEventListener('input',  () => { _trnRouteFormDirty = true; });
  });
}

// ── Stops / Destinations ─────────────────────────────────────────────────────
// Destinations are their own resource (DestinationCreate: just {name}, no order
// field on the backend) — managed live against /routes/{id}/destinations/ rather
// than batched into the route payload, since RouteCreate/RouteUpdate don't accept
// a stops field at all.
let _trnLiveStops = [];

async function _loadTrnStopsLive(routeId) {
  const list = document.getElementById('trn-stops-list');
  if (list) list.innerHTML = '<p class="fin-loading">Loading stops&#8230;</p>';
  try {
    const res = await apiFetch(`${API_BASE}/routes/${routeId}/destinations/`);
    _trnLiveStops = (res && res.ok) ? await res.json() : [];
  } catch (_) { _trnLiveStops = []; }
  _renderTrnStopRows(routeId);
}

function _renderTrnStopRows(routeId) {
  const list = document.getElementById('trn-stops-list');
  if (!list) return;
  if (!_trnLiveStops.length) { list.innerHTML = '<p style="color:#888;font-size:0.85rem;">No stops added yet.</p>'; return; }
  list.innerHTML = _trnLiveStops.map(s => `
    <div class="trn-stop-row">
      <input type="text" class="fin-search-input trn-stop-input" value="${String(s.name||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}" disabled>
      <button type="button" class="trn-stop-remove" onclick="trnRemoveStopLive('${routeId}',${s.id})" title="Remove stop">&#x2715;</button>
    </div>
  `).join('');
}

async function trnAddStopLive(routeId) {
  const input = document.getElementById('trn-stop-new-input');
  const name = (input?.value || '').trim();
  if (!name) return;
  const res = await apiFetch(`${API_BASE}/routes/${routeId}/destinations/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  if (res && res.ok) { if (input) input.value = ''; await _loadTrnStopsLive(routeId); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

async function trnRemoveStopLive(routeId, destId) {
  const res = await apiFetch(`${API_BASE}/routes/${routeId}/destinations/${destId}`, { method: 'DELETE' });
  if (res && res.ok) await _loadTrnStopsLive(routeId);
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

// ── Form submission ───────────────────────────────────────────────────────────

async function submitTrnRouteForm(routeId) {
  const name = (document.getElementById('trn-rt-name')?.value || '').trim();
  const errName  = document.getElementById('err-trn-rt-name');
  const errPrice = document.getElementById('err-trn-rt-price');

  if (errName)  errName.textContent  = '';
  if (errPrice) errPrice.textContent = '';

  if (!name) {
    if (errName) errName.textContent = 'Route Name is required.';
    return;
  }

  // RouteCreate requires all four price fields (none are optional/nullable on the
  // backend) — previously only "at least one" was enforced, so saving with any
  // price left blank sent null and the backend rejected it with a 422.
  const twoWay  = document.getElementById('trn-rt-two-way')?.value;
  const morning = document.getElementById('trn-rt-morning')?.value;
  const evening = document.getElementById('trn-rt-evening')?.value;
  const daily   = document.getElementById('trn-rt-daily')?.value;

  const prices = [twoWay, morning, evening, daily].map(v => v !== '' && v !== undefined ? parseFloat(v) : NaN);
  const missingOrInvalid = prices.some(p => isNaN(p));
  if (missingOrInvalid) {
    if (errPrice) errPrice.textContent = 'All four price fields are required.';
    return;
  }
  const negativePrice = prices.some(p => p < 0);
  if (negativePrice) {
    if (errPrice) errPrice.textContent = 'Prices must be non-negative.';
    return;
  }

  const isEdit = !!routeId;
  // RouteCreate/RouteUpdate have no description/is_active/stops fields at all —
  // stops are their own resource (POST /routes/{id}/destinations/, see trnAddStopLive
  // / trnRemoveStopLive), and description/is_active have no backend column to
  // persist into, so they're intentionally not sent.
  const payload = {
    name,
    two_way_price:            prices[0],
    one_way_morning_price:    prices[1],
    one_way_evening_price:    prices[2],
    daily_rate:               prices[3],
  };

  const url    = isEdit ? `${API_BASE}/routes/${routeId}` : `${API_BASE}/routes/`;
  const method = isEdit ? 'PUT' : 'POST';
  const btn    = document.getElementById('trn-rt-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (btn) { btn.disabled = false; btn.textContent = isEdit ? 'Update' : 'Save'; }

  if (res && res.ok) {
    _trnRouteFormDirty = false;
    showToast(isEdit ? 'Route updated successfully.' : 'Route created successfully.', 'success');
    window._currentEditRouteId = null;
    loadView('transport-routes');
  } else {
    let msg = 'An error occurred.';
    if (res) { try { const e = await res.json(); msg = e.detail || JSON.stringify(e); } catch (_) {} }
    showToast('Error: ' + msg, 'error');
  }
}

function cancelTrnRouteForm() {
  if (_trnRouteFormDirty && !confirm('You have unsaved changes. Discard them?')) return;
  _trnRouteFormDirty = false;
  window._currentEditRouteId = null;
  loadView('transport-routes');
}

// ==================== BUS BOARDING REPORT ====================

let _trnBoardingData = [], _trnBoardingPage = 1, _trnBoardingPerPage = 10;

async function loadTrnBusBoardingReportView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Bus Boarding Report</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Transport Management &rsaquo; Reports &rsaquo; Bus Boarding Report</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="trn-brd-per-page" onchange="changeTrnBrdPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="trn-brd-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-export-btn" title="Export PDF">&#128438;</button>
          <button class="fin-export-btn" title="Export CSV" onclick="exportTrnBoardingCSV()">&#128202;</button>
        </div>
      </div>
      <div id="trn-brd-table"></div>
      <div id="trn-brd-pagination"></div>
    </div>
  `;
  renderSkeletonRows('trn-brd-table', 5);

  // TODO: backend needs a bus boarding/check-in endpoint (e.g. GET /transport/boarding-records)
  // No boarding data endpoint confirmed yet — showing empty state with a note.
  console.warn('[EduGiga] Bus Boarding Report: requires a boarding-records API endpoint (not yet confirmed).');
  _trnBoardingData = [];
  _trnBoardingPage = 1;
  _renderTrnBoardingTable();
}

function _renderTrnBoardingTable() {
  const totalEl = document.getElementById('trn-brd-total');
  if (totalEl) totalEl.textContent = _trnBoardingData.length;

  const start = (_trnBoardingPage - 1) * _trnBoardingPerPage;
  const paged = _trnBoardingData.slice(start, start + _trnBoardingPerPage);
  const pages = Math.max(1, Math.ceil(_trnBoardingData.length / _trnBoardingPerPage));

  const rows = paged.length
    ? paged.map(r => {
        const _e = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<tr>
          <td>${_e(r.student_id || '')}</td>
          <td>${_e(r.student_name || '')}</td>
          <td>${_e(r.route_name || '')}</td>
          <td>${_e(r.boarding_date || '')}</td>
          <td>${_e(r.time_of_day || '')}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" class="fin-empty">No boarding records found.
         <span style="color:#888;font-size:0.82rem;display:block;margin-top:4px;">
           This report requires a boarding-records endpoint on the backend.
         </span></td></tr>`;

  const tbl = document.getElementById('trn-brd-table');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>STUDENT ID</th><th>STUDENT NAME</th><th>ROUTE</th><th>DATE</th><th>TIME OF DAY</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  _mkTrnPagination('trn-brd-pagination', _trnBoardingPage, pages, 'trnBrdGoPage');
}

function changeTrnBrdPerPage(v) { _trnBoardingPerPage = parseInt(v); _trnBoardingPage = 1; _renderTrnBoardingTable(); }
function trnBrdGoPage(p) { _trnBoardingPage = p; _renderTrnBoardingTable(); }
function exportTrnBoardingCSV() {
  exportTableCSV(
    ['Student ID', 'Student Name', 'Route', 'Date', 'Time of Day'],
    _trnBoardingData.map(r => [r.student_id||'', r.student_name||'', r.route_name||'', r.boarding_date||'', r.time_of_day||'']),
    'bus-boarding-report.csv'
  );
}

// ==================== STUDENT REPORT PER ROUTE ====================

let _trnSprData = [], _trnSprPage = 1, _trnSprPerPage = 10, _trnSprRoutes = [], _trnSprRouteId = '';

async function loadTrnStudentPerRouteReportView(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Report per Route</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Transport Management &rsaquo; Reports &rsaquo; Student Report per Route</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="trn-spr-per-page" onchange="changeTrnSprPerPage(this.value)">
            ${[10,25,50,100].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select> entries &nbsp;|&nbsp; Total <span id="trn-spr-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <label style="font-size:0.88rem;color:#555;margin-right:6px;">Route:</label>
          <select id="trn-spr-route-sel" class="fin-search-input" onchange="onTrnSprRouteChange(this.value)"
                  style="min-width:200px;">
            <option value="">— Select Route —</option>
          </select>
          <button class="fin-export-btn" title="Export CSV" onclick="exportTrnSprCSV()">&#128202;</button>
        </div>
      </div>
      <div id="trn-spr-table"></div>
      <div id="trn-spr-pagination"></div>
    </div>
  `;

  renderSkeletonRows('trn-spr-table', 5);

  const res = await apiFetch(`${API_BASE}/routes/`);
  _trnSprRoutes = (res && res.ok) ? (await res.json().then(r => Array.isArray(r) ? r : (r.data||r.results||[]))) : [];

  const sel = document.getElementById('trn-spr-route-sel');
  if (sel) {
    _trnSprRoutes.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name || `Route #${r.id}`;
      sel.appendChild(opt);
    });
  }

  _trnSprData = [];
  _trnSprPage = 1;
  _renderTrnSprTable();
}

async function onTrnSprRouteChange(routeId) {
  _trnSprRouteId = routeId;
  if (!routeId) { _trnSprData = []; _trnSprPage = 1; _renderTrnSprTable(); return; }
  renderSkeletonRows('trn-spr-table', 5);
  // TODO: confirm GET /students?transport_route_id={id} filter exists on backend;
  // flagged as potential backend gap if the students endpoint doesn't support this param.
  const res = await apiFetch(`${API_BASE}/students/?transport_route_id=${routeId}`);
  if (res && res.ok) {
    const raw = await res.json();
    _trnSprData = Array.isArray(raw) ? raw : (raw.data || raw.results || []);
  } else {
    _trnSprData = [];
    console.warn('[EduGiga] Student per Route Report: GET /students/?transport_route_id filter may not be supported by backend.');
  }
  _trnSprPage = 1;
  _renderTrnSprTable();
}

function _renderTrnSprTable() {
  const totalEl = document.getElementById('trn-spr-total');
  if (totalEl) totalEl.textContent = _trnSprData.length;

  const start = (_trnSprPage - 1) * _trnSprPerPage;
  const paged = _trnSprData.slice(start, start + _trnSprPerPage);
  const pages = Math.max(1, Math.ceil(_trnSprData.length / _trnSprPerPage));
  const _e = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const rows = paged.length
    ? paged.map(s => {
        const sel = s.transport_selection || {};
        const jt  = sel.journey_type === 'two_way' ? 'Two-way' : sel.journey_type === 'one_way' ? 'One-way' : (s.journey_type || '—');
        const tod = sel.time_of_day ? (sel.time_of_day === 'morning' ? 'Morning' : 'Evening') : (s.time_of_day || '—');
        return `<tr>
          <td>${_e(s.student_id || s.admission_no || '')}</td>
          <td>${_e(`${s.first_name||''} ${s.last_name||''}`.trim() || s.full_name || '')}</td>
          <td>${_e(s.class_name || s.level_of_academics || '—')}</td>
          <td>${_e(jt)}</td>
          <td>${_e(tod)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" class="fin-empty">${_trnSprRouteId ? 'No students found for this route.' : 'Select a route to view students.'}</td></tr>`;

  const tbl = document.getElementById('trn-spr-table');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>STUDENT ID</th><th>STUDENT NAME</th><th>CLASS</th><th>JOURNEY TYPE</th><th>TIME OF DAY</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  _mkTrnPagination('trn-spr-pagination', _trnSprPage, pages, 'trnSprGoPage');
}

function changeTrnSprPerPage(v) { _trnSprPerPage = parseInt(v); _trnSprPage = 1; _renderTrnSprTable(); }
function trnSprGoPage(p) { _trnSprPage = p; _renderTrnSprTable(); }
function exportTrnSprCSV() {
  exportTableCSV(
    ['Student ID', 'Student Name', 'Class', 'Journey Type', 'Time of Day'],
    _trnSprData.map(s => {
      const sel = s.transport_selection || {};
      const jt  = sel.journey_type === 'two_way' ? 'Two-way' : sel.journey_type === 'one_way' ? 'One-way' : '';
      const tod = sel.time_of_day ? (sel.time_of_day === 'morning' ? 'Morning' : 'Evening') : '';
      return [s.student_id||'', `${s.first_name||''} ${s.last_name||''}`.trim()||'',
              s.class_name||'', jt, tod];
    }),
    'student-report-per-route.csv'
  );
}
